// Permisos de la beta. La matriz la configura super_admin (tabla app_modulos).
// admin y super_admin siempre ven todo, salvo que la pantalla Permisos es solo super_admin.
// es_cosmetologa NO se deriva del rol: el N de paquetes lee cosmetologas.es_cosmetologa.

import { normNombre, type Row } from "./domain.ts";
import type { Db } from "./db.ts";

export const ROLES = [
  "cosmetologa", "asistente_cosmetologia", "recepcion", "gerente", "admin", "super_admin",
] as const;
export type Rol = (typeof ROLES)[number];
export type Acceso = "no" | "propio" | "todos";

export const MODULOS = [
  "inicio", "tickets", "comisiones", "rol_pagos", "asistencia", "productos", "ver_costos",
  "clientes", "proveedores", "compras", "inventario", "transferencias", "conteos", "kardex",
  "cotizaciones_cliente", "paquetes", "gift_cards", "caja", "bitacora", "cabina", "usuarios", "permisos",
] as const;
export type Modulo = (typeof MODULOS)[number];

const P = "propio" as const;
const T = "todos" as const;

/** Lo que cada rol ve si app_modulos está vacía. admin/super_admin se resuelven en acceso(). */
export const DEFAULT_MATRIZ: Record<string, Partial<Record<Modulo, Acceso>>> = {
  cosmetologa: {
    inicio: T, tickets: P, comisiones: P, rol_pagos: P, asistencia: P, productos: T,
    clientes: P, inventario: T, transferencias: T, paquetes: P, bitacora: T, cabina: T,
    compras: P,
  },
  asistente_cosmetologia: {
    inicio: T, tickets: P, comisiones: P, rol_pagos: P, asistencia: P, productos: T,
    inventario: T, transferencias: T, conteos: T, bitacora: T, cabina: T,
    compras: P,
  },
  recepcion: {
    inicio: T, tickets: P, comisiones: P, rol_pagos: P, asistencia: P, productos: T,
    clientes: T, inventario: T, cotizaciones_cliente: T, paquetes: T, gift_cards: T, caja: T,
  },
  gerente: {
    inicio: T, tickets: P, comisiones: P, rol_pagos: P, asistencia: P, productos: T,
    clientes: T, inventario: T, transferencias: T, conteos: T, kardex: T,
    cotizaciones_cliente: T, paquetes: T, gift_cards: T, caja: T, bitacora: T, cabina: T,
  },
};

const ACCION_MODULO: Record<string, Modulo> = {
  getCatalogo: "productos", getCatalogoTabla: "productos", crearProductoApp: "productos", editarProductoCatalogo: "productos",
  toggleActivoCatalogo: "productos", eliminarProductoApp: "productos", prod_list: "productos",
  prod_get: "productos", prod_save: "productos",
  getInventario: "inventario", stk_saldo: "inventario", stk_kardex: "kardex",
  getEntradas: "compras", registrarEntrada: "compras", getProveedoresApp: "proveedores",
  guardarProveedorApp: "proveedores", eliminarProveedorApp: "proveedores",
  getOCDataApp: "compras", crearOCApp: "compras", editarOCApp: "compras", ocEliminar: "compras",
  rfq_save: "compras", rfq_list: "compras", rfq_get: "compras", rfq_respuesta: "compras", rfq_adjudicar: "compras",
  oc_save: "compras", oc_list: "compras", oc_get: "compras", oc_cancel: "compras", oc_recibir: "compras",
  oc_recibir_undo: "compras", oc_devolver: "compras", pago_save: "compras", reorden_sugerir: "compras",
  trf_save: "transferencias", trf_enviar: "transferencias", trf_recibir: "transferencias", trf_list: "transferencias",
  conteo_abrir: "conteos", conteo_guardar: "conteos", conteo_aplicar: "conteos", conteo_list: "conteos", conteo_get: "conteos",
  lugares_list: "inventario", lugar_guardar: "inventario", lugar_elegir: "inicio",
  ajuste_save: "inventario",
  getHistorial: "tickets", getTicketsDia: "tickets", editarTicket: "tickets", eliminarTicket: "tickets",
  inline_guardar: "tickets", inline_borrar: "tickets", solicitud_crear: "tickets", getSolicitudes: "tickets", solicitud_resolver: "tickets",
  clientes_resumen: "clientes", cliente_detalle: "clientes", ticket_editar: "tickets",
  reporte_consumos: "ver_costos", periodo_consignacion: "compras", oc_consignacion: "compras",
  compras_periodo: "compras", compras_guardar: "compras", compras_aprobar: "compras", compras_enviar: "compras",
  compras_pago: "compras", compras_saldo: "compras", compras_reporte: "compras",
  compras_lista: "inventario", compras_recibir: "inventario",
  conteo_plan: "conteos", conteo_crear: "conteos", conteo_asignar: "conteos", conteo_panel: "conteos", conteo_aprobar: "conteos",
  conteo_mios: "inicio", conteo_seccion: "inicio", conteo_guardar_sec: "inicio", conteo_cerrar_sec: "inicio", conteo_usuarios: "conteos",
  crearTicket: "tickets", ov_save: "tickets", ov_anular: "tickets", ov_list: "tickets", ov_get: "tickets",
  getDashCosm: "comisiones", getComisionesRol: "comisiones", getComisionRecepcion: "comisiones",
  getPeriodoComision: "comisiones", getReporteAdmin: "comisiones", getReporte: "comisiones",
  getComisionesTabla: "comisiones", getTramos: "comisiones", tramos_guardar: "comisiones",
  getRendimientoProductos: "ver_costos",
  getRoles: "rol_pagos", getRolIndividual: "rol_pagos", getAprobacionesRol: "rol_pagos", aprobarRol: "rol_pagos",
  getRolCiclo: "rol_pagos", getPagoConfig: "rol_pagos", pago_config_guardar: "rol_pagos",
  testDiasJibble: "asistencia",
  asis_config: "asistencia", asis_config_guardar: "asistencia", asis_marcar: "asistencia",
  asis_hoy: "asistencia", asis_periodo: "asistencia", asis_corregir: "asistencia", asis_auditoria: "asistencia",
  asis_permiso_cancelar: "asistencia", asis_vacaciones: "asistencia", asis_marca_manual: "asistencia", asis_dia: "asistencia",
  asis_permiso_solicitar: "asistencia", asis_permiso_resolver: "asistencia", asis_feriado: "asistencia", asis_foto: "asistencia",
  asis_aviso: "asistencia", horarios_list: "asistencia", horarios_guardar: "asistencia", horarios_asignar: "asistencia",
  horarios_importar: "asistencia", push_clave: "asistencia", push_suscribir: "asistencia",
  getPermisos: "asistencia", savePermiso: "asistencia", updatePermiso: "asistencia",
  getRegistroClientes: "clientes", saveRegistroCliente: "clientes", registrarCliente: "clientes",
  cli_list: "clientes", cli_save: "clientes",
  prov_list: "proveedores", prov_save: "proveedores",
  guardarCotizacion: "cotizaciones_cliente", getCotizaciones: "cotizaciones_cliente", getCotizacion: "cotizaciones_cliente",
  getTicketsLista: "tickets", getTicket: "tickets", editarTicket: "tickets",
  buscarPaquetes: "paquetes", getSeguimientoPaquetes: "paquetes",
  getCodigoGC: "gift_cards", getCodigosGC: "gift_cards", buscarGiftCards: "gift_cards", getGCDigitales: "gift_cards",
  gc_list: "gift_cards", gc_detalle: "gift_cards", gc_emitir: "gift_cards", gc_editar: "gift_cards",
  paq_list: "paquetes", paq_detalle: "paquetes", paq_emitir: "paquetes", paq_editar: "paquetes",
  getMultas: "asistencia", personal_personas: "inicio", citas_proximas: "inicio",
  getCajaV2: "caja", cajaV2Mov: "caja", cajaV2Iniciar: "caja", cajaGasto: "caja", cajaDeposito: "caja",
  getBitacora: "bitacora", bitacoraCrear: "bitacora", bitacoraAnular: "bitacora",
  getCabina: "cabina", cabinaAbrirRapido: "cabina",
  usuariosFull: "usuarios", saveUsuarios: "usuarios", usuarioBloquear: "usuarios", usuarioPinReset: "usuarios",
  betaTablas: "usuarios", betaFilas: "usuarios", betaGuardar: "usuarios", betaEliminar: "usuarios", betaMover: "usuarios",
  permisos_get: "inicio", permisos_guardar: "permisos",
  home: "inicio",
  getDashboardHoy: "ver_costos",
};

const COSTO = new Set([
  "precio_compra", "compra", "comprareal", "costo", "costoprod", "costo_promedio", "costo_unit", "costo_unitario",
  "costo_envase", "costo_por_unidad", "utilidad", "margen", "comi_producto_30", "com",
  "iesspatronal", "iess_patronal_11_15", "costoempresa", "costo_empresa",
]);
const CONTACTO = new Set(["telefono", "tel", "celular", "whatsapp", "email", "correo"]);

export function puedeVerContacto(rol: string): boolean {
  const r = normalizarRol(rol);
  return r === "recepcion" || r === "gerente" || r === "admin" || r === "super_admin";
}

export interface SesLite { rol: string; name: string; short: string; uid: string }

export function normalizarRol(rol: string): string {
  const r = (rol || "").trim();
  if (r === "admin_master") return "super_admin";
  if (r === "reception") return "recepcion";
  if (r === "asistente") return "asistente_cosmetologia";
  return r || "asistente_cosmetologia";
}

export function esAdmin(rol: string): boolean {
  const r = normalizarRol(rol);
  return r === "admin" || r === "super_admin";
}

export function acceso(rol: string, modulo: string, matriz: Record<string, Partial<Record<string, Acceso>>> = DEFAULT_MATRIZ): Acceso {
  if (modulo === "permisos") return normalizarRol(rol) === "super_admin" ? "todos" : "no";
  if (esAdmin(rol)) return "todos";
  const r = normalizarRol(rol);
  const v = matriz[r]?.[modulo as Modulo] ?? DEFAULT_MATRIZ[r]?.[modulo as Modulo];
  return v === "todos" || v === "propio" ? v : "no";
}

export function verCostos(rol: string, matriz?: Record<string, Partial<Record<string, Acceso>>>): boolean {
  return acceso(rol, "ver_costos", matriz) === "todos";
}

export function esPropio(nombreFila: unknown, ses: SesLite): boolean {
  const a = normNombre(String(nombreFila ?? ""));
  const b = normNombre(ses.name);
  const c = normNombre(ses.short);
  const u = normNombre(ses.uid);
  if (!a) return false;
  const first = (b.split(" ")[0] || "");
  const firstA = (a.split(" ")[0] || "");
  if (b && (a === b || a.startsWith(first + " ") || a === first || b.startsWith(firstA + " ") || b === firstA)) return true;
  if (c && c.length >= 3 && (a === c || a.startsWith(c + " ") || a.includes(c))) return true;
  if (u && a === u) return true;
  return false;
}

export async function matrizDe(db: Db): Promise<Record<string, Partial<Record<string, Acceso>>>> {
  let rows: Row[] = [];
  try { rows = await db.all("app_modulos"); } catch { rows = []; }
  if (!rows.length) return DEFAULT_MATRIZ;
  const m: Record<string, Partial<Record<string, Acceso>>> = {};
  for (const rol of Object.keys(DEFAULT_MATRIZ)) m[rol] = { ...DEFAULT_MATRIZ[rol] };
  for (const r of rows) {
    const rol = normalizarRol(String(r.rol || ""));
    const mod = String(r.modulo || "");
    const acc = String(r.acceso || "");
    if (!ROLES.includes(rol as Rol) || !MODULOS.includes(mod as Modulo)) continue;
    if (acc !== "no" && acc !== "propio" && acc !== "todos") continue;
    if (!m[rol]) m[rol] = {};
    m[rol][mod as Modulo] = acc;
  }
  return m;
}

export function gateAccion(action: string, ses: SesLite | null, matriz: Record<string, Partial<Record<string, Acceso>>>): { error: string } | null {
  const pub = new Set(["", "version", "getVersion", "login", "getUsuarios", "usuarioBloqueado", "usuarioCambiarPin", "whoami"]);
  if (pub.has(action)) return null;
  if (!ses) return { error: "Inicia sesión" };
  const mod = ACCION_MODULO[action];
  if (!mod) return null;
  if (acceso(ses.rol, mod, matriz) === "no") return { error: "No tienes permiso" };
  return null;
}

export function clampPersonal(action: string, p: Row, ses: SesLite | null, matriz: Record<string, Partial<Record<string, Acceso>>>): Row {
  if (!ses || esAdmin(ses.rol)) return p;
  const out = { ...p };
  const propio = (mod: string) => acceso(ses.rol, mod, matriz) === "propio";
  if (propio("comisiones") && ["getDashCosm", "getComisionesRol", "getPeriodoComision", "getComisionRecepcion", "getComisionesTabla"].includes(action)) {
    out.cosmetologa = ses.name;
    out.nombre = ses.name;
    out.persona = ses.name;
  }
  if (acceso(ses.rol, "rol_pagos", matriz) !== "todos" && ["getRolIndividual", "getRoles", "aprobarRol", "getRolCiclo"].includes(action)) {
    out.nombre = ses.name;
    out.persona = ses.name;
  }
  if (propio("asistencia") && action === "testDiasJibble") out.nombre = ses.name;
  if (propio("tickets") && (action === "crearTicket" || action === "ov_save" || action === "")) {
    if (out.cosmetologa && !esPropio(out.cosmetologa, ses) && normalizarRol(ses.rol) !== "recepcion" && normalizarRol(ses.rol) !== "gerente") {
      out.cosmetologa = ses.name;
    }
  }
  return out;
}

function quitarContacto(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(quitarContacto);
  if (!v || typeof v !== "object") return v;
  const o: Row = {};
  for (const [k, val] of Object.entries(v as Row)) {
    if (CONTACTO.has(k.toLowerCase())) continue;
    o[k] = quitarContacto(val);
  }
  return o;
}

function quitarCostos(v: unknown, puede: boolean): unknown {
  if (puede || v == null) return v;
  if (Array.isArray(v)) return v.map((x) => quitarCostos(x, false));
  if (typeof v !== "object") return v;
  const o: Row = {};
  for (const [k, val] of Object.entries(v as Row)) {
    if (COSTO.has(k.toLowerCase())) continue;
    o[k] = quitarCostos(val, false);
  }
  return o;
}

export function redactar(action: string, data: unknown, ses: SesLite | null, matriz: Record<string, Partial<Record<string, Acceso>>> = DEFAULT_MATRIZ): unknown {
  if (!ses || esAdmin(ses.rol)) return data;
  if (action === "getRolIndividual" && data && typeof data === "object") {
    const nombre = String(((data as Row).data as Row | undefined)?.nombre || (data as Row).nombre || "");
    if (nombre && !esPropio(nombre, ses)) return { error: "No tienes permiso para ver el rol de otra persona" };
  }
  let out = quitarCostos(structuredClone(data), verCostos(ses.rol, matriz));
  if (!puedeVerContacto(ses.rol)) out = quitarContacto(out);
  const ticketsPropio = acceso(ses.rol, "tickets", matriz) === "propio";
  const rolPropio = acceso(ses.rol, "rol_pagos", matriz) !== "todos";
  const comPropio = acceso(ses.rol, "comisiones", matriz) === "propio";
  out = filtrar(out, ses, { ticketsPropio, rolPropio, comPropio, action });
  return out;
}

function filtrar(v: unknown, ses: SesLite, f: { ticketsPropio: boolean; rolPropio: boolean; comPropio: boolean; action: string }): unknown {
  if (Array.isArray(v)) {
    let arr = v.map((x) => filtrar(x, ses, f));
    if (f.ticketsPropio && arr.length && arr.every((x) => x && typeof x === "object" && ("cosmetologa" in (x as Row) || "cosm" in (x as Row)))) {
      arr = arr.filter((x) => esPropio((x as Row).cosmetologa ?? (x as Row).cosm, ses));
    }
    return arr;
  }
  if (!v || typeof v !== "object") return v;
  const o: Row = {};
  for (const [k, val] of Object.entries(v as Row)) {
    if ((k === "empleadas" || k === "cosmetologas") && Array.isArray(val) && (f.rolPropio || f.comPropio)) {
      o[k] = val.filter((x) => x && typeof x === "object" && esPropio((x as Row).nombre ?? (x as Row).name ?? (x as Row).empleada, ses));
      continue;
    }
    if (k === "tickets" && Array.isArray(val) && f.ticketsPropio) {
      o[k] = val.filter((x) => x && typeof x === "object" && esPropio((x as Row).cosm ?? (x as Row).cosmetologa, ses));
      continue;
    }
    o[k] = filtrar(val, ses, f);
  }
  return o;
}

export function evaluarBloqueo(opts: { intentosIp: number; intentosUsuario: number; bloqueadoHasta: string | null; ahora: number }): { bloqueado: boolean; motivo?: string } {
  if (opts.bloqueadoHasta && Date.parse(opts.bloqueadoHasta) > opts.ahora) {
    return { bloqueado: true, motivo: "Demasiados intentos. Espera unos minutos." };
  }
  if (opts.intentosIp >= 8) return { bloqueado: true, motivo: "Demasiados intentos. Espera 15 minutos." };
  if (opts.intentosUsuario >= 5) return { bloqueado: true, motivo: "Demasiados intentos. Espera unos minutos." };
  return { bloqueado: false };
}

export function modulosVisibles(rol: string, matriz: Record<string, Partial<Record<string, Acceso>>>): { modulo: string; acceso: Acceso }[] {
  return MODULOS.filter((m) => acceso(rol, m, matriz) !== "no").map((m) => ({ modulo: m, acceso: acceso(rol, m, matriz) }));
}

/** Lecturas permitidas mientras un admin mira la app como otra persona. Lo demás se rechaza. */
const LECTURA_VISTA = new Set([
  "whoami", "version", "getVersion", "home", "erp_home",
  "asis_hoy", "asis_periodo", "asis_auditoria", "asis_config", "asis_dia", "asis_foto", "asis_vacaciones", "asis_aviso",
  "horarios_list", "push_clave",
  "citas_proximas", "getCitas", "stk_saldo", "stk_kardex", "clientes_resumen", "cliente_detalle",
  "personal_personas", "reporte_consumos", "periodo_consignacion", "reorden_sugerir", "refs",
  "buscarPaquetes", "buscarGiftCards", "buscarCliente", "existeCedula", "getRegistro",
  "usuarioBloqueado", "betaTablas", "betaFilas", "cabinaManoObraSugerida", "refrescarTelefonos",
]);

export function lecturaEnVista(action: string): boolean {
  if (!action) return false;
  if (action.startsWith("get") || action.endsWith("_list") || action.endsWith("_get")) return true;
  return LECTURA_VISTA.has(action);
}
