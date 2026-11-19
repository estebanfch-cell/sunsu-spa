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
export type Override = { uid: string; perfil?: string; niveles: Record<string, number>; alcance: Record<string, string>; flags: Record<string, boolean>; personas?: string[]; crud?: Record<string, string> };
/** Permisos finos por módulo (TK21): v ver · c crear · e editar · d eliminar. "" = módulo apagado. Se guardan en alcance._crud. */
export const LETRAS_CRUD = "vced";
export function limpiarCrud(x: unknown): string { const t = String(x ?? ""); return LETRAS_CRUD.split("").filter((l) => t.includes(l)).join(""); }
/** Nivel 0-3 equivalente (para lo que sigue leyendo niveles): apagado 0, solo ver 1, crear/editar 2, eliminar 3. */
export function nivelDeCrud(c: string, max: number): number {
  if (!c) return 0;
  if (c.includes("d")) return Math.min(3, max);
  if (c.includes("c") || c.includes("e")) return Math.min(2, max);
  return 1;
}
/** Al revés: lo que da un nivel de antes. */
export function crudDeNivel(n: number): string { return n <= 0 ? "" : n === 1 ? "v" : n === 2 ? "vce" : "vced"; }

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
  { id: "recepciones", label: "📥 Recepciones", grupo: "Compras", max: 3 },
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
  { id: "telefonos", label: "Ver teléfonos de clientas" },
  { id: "emails", label: "Ver emails de clientas" },
  { id: "sector", label: "Ver sector / dirección" },
  { id: "descargas", label: "Descargar archivos" },
  { id: "tickets_todos", label: "Ver todos los tickets" },
];
/** Flags de privacidad que se reflejan en un módulo de app_modulos. */
const FLAG_PRIV: Record<string, string> = {
  costos: "ver_costos", telefonos: "ver_telefonos", emails: "ver_emails",
  sector: "ver_sector", descargas: "descargas",
};
/** Interruptores que además cierran un módulo entero cuando están apagados. */
const FLAG_MODULO: Record<string, string> = { comisiones: "comisiones", rol_pagos: "rol_pagos" };
export const TODOS = "*";
const FINO = new Map(FINOS.map((m) => [m.id, m]));

/** Acciones de nivel 3: aprobar, anular, borrar, deshacer. */
export const NIVEL3 = new Set([
  "eliminarTicket", "inline_borrar", "solicitud_resolver", "ov_anular",
  "oc_cancel", "oc_devolver", "oc_recibir_undo", "ocEliminar", "compras_aprobar",
  "conteo_aplicar", "conteo_aprobar", "aprobarRol", "rol_aprobar", "rol_rechazar", "asis_permiso_resolver", "asis_corregir", "asis_marca_manual",
  "bitacoraAnular", "eliminarProveedorApp", "eliminarProductoApp", "betaEliminar", "usuarioBloquear",
]);
/** Lecturas que no siguen la convención get… / …_list / …_get. */
const LECTURAS = new Set(["gcb_lista", "gcb_get", "gcb_siguiente", "gcb_doc_url", "pg_ticket", "pg_lista", "cj_resumen", "cj_comprobante", "barras_resumen", "mcprod_familias", "mcprod_archivo", "proto_historial", "clientes_resumen", "cliente_detalle", "reorden_sugerir", "reporte_consumos", "periodo_consignacion", "compras_saldo", "compras_reporte", "conteo_panel", "conteo_mios", "cf_meta", "cf_list", "cf_get", "cf_get_general", "cf_sec_get", "cf_secciones_meta", "notif_mias", "trfb_list", "trfb_get", "aj_meta", "aj_list", "aj_get", "tk_get", "tk_catalogo", "tk_estados", "tk_costos", "tk_historial", "tk_reagendadas", "cl_list", "cl_get", "cl_doc_url", "cl_buscar", "cl_dup_lista", "cmpb_meta", "cmpb_lista", "cmpb_get", "cmpb_cot_get", "rcp_lista", "rcp_get", "cns_meta", "cns_calc", "cns_conteo_inicial", "acta_get", "migo_cuadre_estado", "migo_borradores_lista", "migo_borrador_get", "migo_borrador_buscar", "staff_home", "ping", "bootstrap", "getSolicitudes", "ag_meta", "ag_citas", "ag_cita", "ag_disponibilidad"]);

const MOD_EXTRA: Record<string, string> = {
  mcprod_list: "productos", mcprod_get: "productos", mcprod_familias: "productos",
  mcprod_save: "productos", mcprod_foto: "productos", mcprod_nuevo: "productos",
  mcprod_estado: "productos", mcprod_duplicar: "productos", mcprod_archivo: "productos", mcprod_archivo_subir: "productos",
  mcprod_archivo_quitar: "productos", mcprod_archivo_principal: "productos", mcprod_codigos_save: "productos",
  gcb_lista: "gift_cards", gcb_get: "gift_cards", gcb_siguiente: "gift_cards", gcb_doc_url: "gift_cards", gcb_vender: "gift_cards", gcb_usar: "gift_cards", gcb_guardar: "gift_cards", gcb_borrar: "gift_cards", gcb_pdf_guardar: "gift_cards", mcprod_codigo_interno: "productos", pg_ticket: "tickets", pg_registrar: "tickets", pg_anular: "tickets", pg_lista: "caja", cj_resumen: "caja", cj_iniciar: "caja", cj_mov: "caja", cj_cuadre: "caja", cj_anular: "caja", cj_comprobante: "caja", barras_resumen: "productos", barras_generar_lote: "productos", barras_asignar: "productos", mcprod_barras_generar: "productos", mcprod_presentaciones_save: "productos", mcprod_presentacion_nueva: "productos", mcprod_escalas_save: "productos", mcprod_proveedores_save: "productos",
  proto_list: "cabina", proto_get: "cabina", proto_guardar: "cabina", proto_historial: "cabina",
  // Conteo físico (TK108): el personal abre y crea el suyo (el handler limita a sí mismo); revisar sigue siendo admin.
  cf_meta: "inicio", cf_list: "inicio", cf_crear: "inicio", cf_revisar: "conteos",
  cf_get: "inicio", cf_iniciar: "inicio", cf_guardar: "inicio", cf_enviar: "inicio", notif_mias: "inicio", notif_leer: "inicio",
  cf_crear_general: "inicio", cf_get_general: "inicio", cf_secciones_meta: "inicio", cf_asignar: "inicio", cf_plan_hoy: "inicio",
  cf_sec_get: "inicio", cf_sec_iniciar: "inicio", cf_sec_guardar: "inicio", cf_sec_cerrar: "inicio", cf_sec_devolver: "inicio", cf_sec_aprobar: "inicio",
  trfb_list: "transferencias", trfb_get: "transferencias", trfb_save: "transferencias", trfb_estado: "transferencias",
  aj_meta: "inicio", aj_list: "inventario", aj_get: "inventario", aj_crear: "inventario", aj_revisar: "inventario", aj_desde_conteo: "conteos",
  tk_get: "tickets", tk_catalogo: "tickets", tk_guardar: "tickets", tk_estados: "tickets", tk_historial: "tickets", tk_reagendadas: "tickets", tk_envio: "tickets", tk_costos: "tickets", tk_costos_guardar: "tickets", tk_flag_resolver: "tickets", tk_flag_crear: "tickets", tk_subir_doc: "tickets", tk_quitar_doc: "tickets", migo_cuadre_estado: "tickets", migo_borradores_lista: "tickets", migo_borrador_get: "tickets", migo_borrador_guardar: "tickets", migo_borrador_aprobar: "tickets", migo_borrador_vincular: "tickets", migo_borrador_buscar: "tickets", migo_borrador_asignar: "tickets", migo_borrador_descartar: "tickets", migo_borradores_reasignar: "tickets",
  ag_meta: "agenda", ag_citas: "agenda", ag_cita: "agenda", ag_disponibilidad: "agenda", ag_crear: "agenda", ag_reagendar: "agenda", ag_cancelar: "agenda", ag_eliminar: "agenda", ag_etiqueta: "agenda", ag_vincular: "agenda", ag_ingresado: "agenda", ag_calendario_guardar: "agenda",
  cl_list: "clientes", cl_get: "clientes", cl_doc_url: "clientes", cl_buscar: "clientes", cl_guardar: "clientes", cl_borrar: "clientes", cl_restaurar: "clientes", cl_rellenar_contactos: "clientes",
  rcp_lista: "recepciones", rcp_get: "recepciones", rcp_recibir: "recepciones", rcp_no_recibido_undo: "recepciones",
  cns_meta: "compras", cns_calc: "compras", cns_crear_oc: "compras", cns_restock_guardar: "compras", cns_restock_anular: "compras", cns_conteo_inicial: "compras", cns_conteo_transferir: "compras", acta_get: "compras", acta_firmar: "compras", acta_pdf_guardar: "compras", acta_link: "compras",
  cmpb_meta: "compras", cmpb_lista: "compras", cmpb_get: "compras", cmpb_crear: "compras", cmpb_cancelar: "compras", cmpb_pago: "compras", cmpb_cot_guardar: "compras", cmpb_cot_get: "compras", cmpb_cot_convertir: "compras", cmpb_cot_anular: "compras",
  cl_dup_lista: "clientes", cl_dup_unir: "clientes", cl_dup_nodup: "clientes", cl_dup_separar: "clientes", cl_dup_deshacer: "clientes",
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
  const crudCrudo = parse(v.alcance)._crud;
  let crud: Record<string, string> | undefined;
  if (crudCrudo && typeof crudCrudo === "object" && !Array.isArray(crudCrudo)) {
    crud = {};
    for (const [k, c] of Object.entries(crudCrudo as Row)) if (FINO.get(k)) crud[k] = limpiarCrud(c);
    for (const [k, c] of Object.entries(crud)) niveles[k] = nivelDeCrud(c, FINO.get(k)!.max);
  }
  return { uid: String(v.uid || ""), perfil: v.perfil ? String(v.perfil) : "", niveles, alcance, flags, ...(personas ? { personas } : {}), ...(crud ? { crud } : {}) };
}

export function vacio(o: Override | null): boolean {
  return !o || (!Object.keys(o.niveles).length && !Object.keys(o.alcance).length && !Object.keys(o.flags).length && o.personas === undefined && !Object.keys(o.crud || {}).length);
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
    const flagPriv = Object.entries(FLAG_PRIV).find(([, m]) => m === mod);
    if (flagPriv && o.flags[flagPriv[0]] !== undefined) v = o.flags[flagPriv[0]] ? "todos" : "no";
    else if (mod === "tickets" && o.flags.tickets_todos !== undefined) {
      v = accesoEfectivo(base, mod, o);
      if (v !== "no") v = o.flags.tickets_todos ? "todos" : "propio";
    } else v = accesoEfectivo(base, mod, o);
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
const RX_ELIMINAR = /(borrar|eliminar|anular|quitar|cancel|desmarcar|delete|_del$|undo|deshacer|bloquear)/i;
const RX_CREAR = /(crear|nuev|registrar|vender|emitir|agregar|alta|duplicar|generar|_new$|insert|iniciar|abrir|subir|pdf_guardar|importar|lote)/i;
const RX_GUARDAR = /(guardar|save|_set$|editar|actualizar)/i;
const CLAVES_FILA = ["id", "clave", "fila", "codigo", "numero", "uid", "sheetRow", "tkRow", "key"];
/** ver · crear · editar · eliminar de una acción (lecturas por convención; guardar sin id = crear). */
export function tipoAccion(action: string, p: Row = {}): "ver" | "crear" | "editar" | "eliminar" {
  if (lecturaEnVista(action) || LECTURAS.has(action)) return "ver";
  if (NIVEL3.has(action) || RX_ELIMINAR.test(action) || p.desmarcar === true) return "eliminar";
  if (RX_CREAR.test(action)) return "crear";
  if (RX_GUARDAR.test(action) && !CLAVES_FILA.some((k) => p[k] != null && String(p[k]) !== "" && String(p[k]) !== "nuevo")) return "crear";
  return "editar";
}
const LETRA: Record<string, string> = { ver: "v", crear: "c", editar: "e", eliminar: "d" };
const VERBO: Record<string, string> = { ver: "ver", crear: "crear", editar: "editar", eliminar: "eliminar" };
export function gateNivel(action: string, rol: string, o: Override | null, p: Row = {}): { error: string } | null {
  if (!o || esAdmin(rol)) return null;
  const mod = moduloFino(action);
  if (!mod) return null;
  const c = o.crud?.[mod];
  if (c !== undefined) {
    const label0 = FINO.get(mod)?.label || mod;
    for (const [f, m] of Object.entries(FLAG_MODULO)) if (m === mod && o.flags[f] === false) return { error: "No tienes permiso" };
    if (!c) return { error: "No tienes permiso" };
    const tipo = tipoAccion(action, p);
    if (!c.includes(LETRA[tipo])) return { error: "En «" + label0 + "» no tienes permiso para " + VERBO[tipo] };
    return null;
  }
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
