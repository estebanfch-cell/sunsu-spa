// Permisos por usuario, al estilo de MineCore (portal-api/perm.ts, build 703), encima de los roles
// de siempre. Sin fila en app_usuario_permisos, la persona queda exactamente como hoy (su rol +
// app_modulos). Con fila:
//   niveles {modulo: 0..3}  0 nada · 1 ver · 2 crear/editar · 3 aprobar/anular/borrar. Si existe, MANDA.
//   alcance {modulo: "propio"|"todos"}  solo lo suyo / todo (donde el rol ya distingue).
//   flags {costos, precios, saldos, comisiones, rol_pagos}  interruptores finos (apagado = no lo ve).
//   personas (se guarda en alcance._personas)  de quién ve datos: [] solo ella · [nombres] ella y esas
//     personas · ["*"] todas. Aplica a comisiones, rol de pagos, tickets, asistencia y demás datos por persona.
// admin y super_admin siempre tienen todo (igual que MineCore: admin → nivel máximo).
import type { Db } from "./db.ts";
import type { Row } from "./domain.ts";
import { DEFAULT_MATRIZ, MODULOS, acceso, esAdmin, lecturaEnVista, matrizDe, moduloDeAccion, normalizarRol, type Acceso } from "./permisos.ts";

export type Nivel = 0 | 1 | 2 | 3;
export type Override = { uid: string; perfil?: string; niveles: Record<string, number>; alcance: Record<string, string>; flags: Record<string, boolean>; personas?: string[] };

/** Módulos finos de Sunsu, con su nivel máximo (como MAXN de MineCore) y si distinguen «lo suyo». */
export const FINOS: { id: string; label: string; grupo: string; max: Nivel; alcance?: boolean }[] = [
  { id: "inicio", label: "Dashboard", grupo: "General", max: 1 },
  { id: "tickets", label: "Tickets", grupo: "Ventas", max: 3, alcance: true },
  { id: "cotizaciones_cliente", label: "Cotizaciones", grupo: "Ventas", max: 3 },
  { id: "clientes", label: "Registro de clientas", grupo: "Ventas", max: 2, alcance: true },
  { id: "productos", label: "Productos", grupo: "Inventario", max: 2 },
  { id: "inventario", label: "Stock y ajustes", grupo: "Inventario", max: 2 },
  { id: "transferencias", label: "Transferencias", grupo: "Inventario", max: 2 },
  { id: "conteos", label: "Conteos", grupo: "Inventario", max: 3 },
  { id: "kardex", label: "Kardex", grupo: "Inventario", max: 1 },
  { id: "cabina", label: "Cabina y protocolos", grupo: "Inventario", max: 2 },
  { id: "compras", label: "Compras", grupo: "Compras", max: 3, alcance: true },
  { id: "proveedores", label: "Proveedores", grupo: "Compras", max: 2 },
  { id: "caja", label: "Caja chica", grupo: "Finanzas", max: 2 },
  { id: "comisiones", label: "Comisiones", grupo: "Personal", max: 2, alcance: true },
  { id: "rol_pagos", label: "Rol de pagos", grupo: "Personal", max: 3, alcance: true },
  { id: "asistencia", label: "Asistencia y permisos", grupo: "Personal", max: 3, alcance: true },
  { id: "paquetes", label: "Paquetes", grupo: "Spa", max: 2, alcance: true },
  { id: "gift_cards", label: "Gift cards", grupo: "Spa", max: 2 },
  { id: "bitacora", label: "Bitácora de esterilización", grupo: "Spa", max: 3 },
  { id: "usuarios", label: "Usuarios", grupo: "Admin", max: 2 },
];
export const FLAGS = [
  { id: "costos", label: "Ver costos y márgenes" },
  { id: "precios", label: "Ver precios" },
  { id: "saldos", label: "Ver saldos y pagos" },
  { id: "comisiones", label: "Ver comisiones" },
  { id: "rol_pagos", label: "Ver roles de pago" },
];
/** Interruptores que además cierran un módulo entero cuando están apagados. */
const FLAG_MODULO: Record<string, string> = { comisiones: "comisiones", rol_pagos: "rol_pagos" };
export const TODOS = "*";
const FINO = new Map(FINOS.map((m) => [m.id, m]));

/** Acciones de nivel 3: aprobar, anular, borrar, deshacer. */
export const NIVEL3 = new Set([
  "eliminarTicket", "inline_borrar", "solicitud_resolver", "ov_anular",
  "oc_cancel", "oc_devolver", "oc_recibir_undo", "ocEliminar", "compras_aprobar",
  "conteo_aplicar", "conteo_aprobar", "aprobarRol", "asis_permiso_resolver", "asis_corregir", "asis_marca_manual",
  "bitacoraAnular", "eliminarProveedorApp", "eliminarProductoApp", "betaEliminar", "usuarioBloquear",
]);
/** Lecturas que no siguen la convención get… / …_list / …_get. */
const LECTURAS = new Set(["mcprod_familias", "mcprod_archivo", "clientes_resumen", "cliente_detalle", "reorden_sugerir", "reporte_consumos", "periodo_consignacion", "compras_saldo", "compras_reporte", "conteo_panel", "conteo_mios"]);

const MOD_EXTRA: Record<string, string> = {
  mcprod_list: "productos", mcprod_get: "productos", mcprod_familias: "productos",
  mcprod_save: "productos", mcprod_foto: "productos", mcprod_nuevo: "productos",
  mcprod_estado: "productos", mcprod_duplicar: "productos", mcprod_archivo: "productos", mcprod_archivo_subir: "productos",
  mcprod_archivo_quitar: "productos", mcprod_archivo_principal: "productos", mcprod_codigos_save: "productos",
  mcprod_codigo_interno: "productos", mcprod_escalas_save: "productos", mcprod_proveedores_save: "productos",
};
export function moduloFino(action: string): string {
  return MOD_EXTRA[action] || moduloDeAccion(action);
}

/** Nivel que hoy le da su rol: sin el módulo 0; con él, el máximo (así guardar sin cambios no quita nada). */
export function nivelDeRol(acc: Acceso, mod: string): Nivel {
  const m = FINO.get(mod);
  if (!m) return acc === "no" ? 0 : 1;
  return acc === "no" ? 0 : m.max;
}

export function limpiarOverride(v: Row): Override | null {
  if (!v) return null;
  const parse = (x: unknown): Row => {
    if (!x) return {};
    if (typeof x === "string") { try { return JSON.parse(x) as Row; } catch { return {}; } }
    return typeof x === "object" ? x as Row : {};
  };
  const niveles: Record<string, number> = {};
  for (const [k, n] of Object.entries(parse(v.niveles))) {
    const m = FINO.get(k);
    const x = Number(n);
    if (m && Number.isInteger(x) && x >= 0) niveles[k] = Math.min(x, m.max);
  }
  const alcance: Record<string, string> = {};
  for (const [k, a] of Object.entries(parse(v.alcance))) if (FINO.get(k)?.alcance && (a === "propio" || a === "todos")) alcance[k] = String(a);
  const flags: Record<string, boolean> = {};
  for (const [k, b] of Object.entries(parse(v.flags))) if (FLAGS.some((f) => f.id === k) && typeof b === "boolean") flags[k] = b;
  const crudo = parse(v.alcance)._personas;
  let personas: string[] | undefined;
  if (Array.isArray(crudo)) {
    const L = crudo.map((x) => String(x ?? "").trim().slice(0, 80)).filter(Boolean);
    personas = L.includes(TODOS) ? [TODOS] : [...new Set(L)].slice(0, 60);
  }
  return { uid: String(v.uid || ""), perfil: v.perfil ? String(v.perfil) : "", niveles, alcance, flags, ...(personas ? { personas } : {}) };
}

export function vacio(o: Override | null): boolean {
  return !o || (!Object.keys(o.niveles).length && !Object.keys(o.alcance).length && !Object.keys(o.flags).length && o.personas === undefined);
}

export async function cargarOverride(db: Db, uid: string): Promise<Override | null> {
  if (!uid) return null;
  let rows: Row[] = [];
  try { rows = await db.all("app_usuario_permisos"); } catch { return null; }
  const r = rows.find((x) => String(x.uid) === uid);
  const o = r ? limpiarOverride(r) : null;
  return vacio(o) ? null : o;
}

/** Acceso efectivo de un módulo con el override. */
export function accesoEfectivo(base: Acceso, mod: string, o: Override | null): Acceso {
  if (!o) return base;
  for (const [f, m] of Object.entries(FLAG_MODULO)) if (m === mod && o.flags[f] === false) return "no";
  if (o.personas && FINO.get(mod)?.alcance) {
    const n0 = o.niveles[mod];
    const abierto = n0 === undefined ? base !== "no" : n0 > 0;
    if (!abierto) return "no";
    return o.personas.includes(TODOS) ? "todos" : "propio";
  }
  const n = o.niveles[mod];
  const a = o.alcance[mod];
  if (n === undefined) return base === "no" ? "no" : ((a as Acceso) || base);
  if (n <= 0) return "no";
  if (a === "propio" || a === "todos") return a;
  if (base !== "no") return base;
  return FINO.get(mod)?.alcance ? "propio" : "todos";
}

/** Filas de app_modulos del rol de esta persona, ya con su override. */
export function filasEfectivas(rol: string, matriz: Record<string, Partial<Record<string, Acceso>>>, o: Override): Row[] {
  const out: Row[] = [];
  for (const mod of MODULOS) {
    if (mod === "permisos" || mod === "configuracion") continue;
    const base = acceso(rol, mod, matriz);
    let v: Acceso = base;
    if (mod === "ver_costos") { if (o.flags.costos !== undefined) v = o.flags.costos ? "todos" : "no"; }
    else v = accesoEfectivo(base, mod, o);
    out.push({ rol, modulo: mod, acceso: v });
  }
  return out;
}

/**
 * Envuelve el Db de la petición: quien lea app_modulos (matrizDe, en cualquier módulo del edge) ve la
 * fila de su rol con el override aplicado. Las demás tablas y escrituras pasan igual.
 */
export function conPermisosUsuario<T extends Db>(db: T, rol: string, o: Override | null): T {
  if (!o || esAdmin(rol)) return db;
  const r = normalizarRol(rol);
  let cache: Row[] | null = null;
  return new Proxy(db, {
    get(target, key, recv) {
      if (key === "all") {
        return async (table: string, ...rest: unknown[]) => {
          const base = await (target as unknown as { all: (t: string, ...a: unknown[]) => Promise<Row[]> }).all(table, ...rest);
          if (table !== "app_modulos") return base;
          if (cache) return cache;
          const matriz = await matrizDe({ all: async () => base } as unknown as Db);
          cache = base.filter((x) => normalizarRol(String(x.rol || "")) !== r).concat(filasEfectivas(r, matriz, o));
          return cache;
        };
      }
      const v = Reflect.get(target, key, recv);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

/** Candado de nivel: 0 nada, 1 solo lecturas, 3 para aprobar/anular/borrar. */
export function gateNivel(action: string, rol: string, o: Override | null): { error: string } | null {
  if (!o || esAdmin(rol)) return null;
  const mod = moduloFino(action);
  if (!mod) return null;
  const n = o.niveles[mod];
  if (n === undefined) return null;
  const label = FINO.get(mod)?.label || mod;
  for (const [f, m] of Object.entries(FLAG_MODULO)) if (m === mod && o.flags[f] === false) return { error: "No tienes permiso" };
  if (n <= 0) return { error: "No tienes permiso" };
  const lectura = lecturaEnVista(action) || LECTURAS.has(action);
  if (n === 1 && !lectura) return { error: "En «" + label + "» solo puedes ver" };
  if (n < 3 && NIVEL3.has(action)) return { error: "Aprobar, anular o borrar en «" + label + "» pide nivel 3" };
  return null;
}

// Mismos patrones que MineCore (RX_PRECIO / RX_SALDO), solo si el interruptor está apagado.
const RX_PRECIO = /^(unit_price|price|precio|precios|precio_.*|.*_price|pvp|beta_pvp|subtotal|total|total_.*|tax\d?|iva|discount|descuento|line_total|monto|valor|valor_.*)$/i;
const RX_COMISION = /^(comision|comisiones|comision_.*|.*_comision|.*_comisiones)$/i;
const RX_SALDO = /^(balance|saldo|saldo_.*|amount_paid|pagado|pagado_.*|deuda|vencido|por_cobrar|cartera|abonos?)$/i;
function quitar(x: unknown, rx: RegExp, d = 0): unknown {
  if (d > 12 || x == null) return x;
  if (Array.isArray(x)) return x.map((v) => quitar(v, rx, d + 1));
  if (typeof x !== "object") return x;
  const o: Row = {};
  for (const [k, v] of Object.entries(x as Row)) { if (k !== "ok" && k !== "error" && rx.test(k)) continue; o[k] = quitar(v, rx, d + 1); }
  return o;
}
export function redactarFlags(out: unknown, rol: string, o: Override | null): unknown {
  if (!o || esAdmin(rol)) return out;
  let x = out;
  if (o.flags.precios === false) x = quitar(x, RX_PRECIO);
  if (o.flags.saldos === false) x = quitar(x, RX_SALDO);
  if (o.flags.comisiones === false) x = quitar(x, RX_COMISION);
  return x;
}

/** Perfil base de un rol, en niveles (para «Perfiles» y para precargar la ficha). */
export function perfilDeRol(rol: string, matriz: Record<string, Partial<Record<string, Acceso>>>): { niveles: Record<string, number>; alcance: Record<string, string>; flags: Record<string, boolean> } {
  const niveles: Record<string, number> = {};
  const alcance: Record<string, string> = {};
  for (const m of FINOS) {
    const a = acceso(rol, m.id, matriz);
    niveles[m.id] = nivelDeRol(a, m.id);
    if (m.alcance && a !== "no") alcance[m.id] = a;
  }
  return {
    niveles, alcance,
    flags: {
      costos: acceso(rol, "ver_costos", matriz) === "todos", precios: true, saldos: true,
      comisiones: acceso(rol, "comisiones", matriz) !== "no", rol_pagos: acceso(rol, "rol_pagos", matriz) !== "no",
    },
  };
}

export const ROLES_EDITABLES = Object.keys(DEFAULT_MATRIZ);
