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
  "ver_telefonos", "ver_emails", "ver_sector", "descargas",
  "clientes", "proveedores", "compras", "inventario", "transferencias", "conteos", "kardex",
  "cotizaciones_cliente", "paquetes", "gift_cards", "caja", "bitacora", "cabina", "usuarios", "permisos",
  "configuracion", "agenda", "recepciones",
] as const;

/** Interruptores de privacidad (TK73): por defecto nadie del personal los tiene. Admin siempre sí. */
export const PRIV_FLAGS = [
  { id: "telefonos", modulo: "ver_telefonos", label: "Teléfonos" },
  { id: "emails", modulo: "ver_emails", label: "Emails" },
  { id: "sector", modulo: "ver_sector", label: "Sector / dirección" },
  { id: "costos", modulo: "ver_costos", label: "Costos y márgenes" },
  { id: "descargas", modulo: "descargas", label: "Descargar archivos" },
  { id: "tickets_todos", modulo: "tickets", label: "Ver todos los tickets" },
] as const;
export type PrivFlag = (typeof PRIV_FLAGS)[number]["id"];

export function puedePriv(rol: string, id: PrivFlag, matriz?: Record<string, Partial<Record<string, Acceso>>>): boolean {
  if (id === "costos") return esSuperAdmin(rol);
  if (esAdmin(rol)) return true;
  const f = PRIV_FLAGS.find((x) => x.id === id);
  if (!f) return false;
  if (id === "tickets_todos") return acceso(rol, "tickets", matriz) === "todos";
  return acceso(rol, f.modulo, matriz) !== "no";
}

export function flagsDeRol(rol: string, matriz?: Record<string, Partial<Record<string, Acceso>>>): Record<PrivFlag, boolean> {
  const out = {} as Record<PrivFlag, boolean>;
  for (const f of PRIV_FLAGS) out[f.id] = puedePriv(rol, f.id, matriz);
  return out;
}
export type Modulo = (typeof MODULOS)[number];

const P = "propio" as const;
const T = "todos" as const;

/** Lo que cada rol ve si app_modulos está vacía. admin/super_admin se resuelven en acceso(). */
export const DEFAULT_MATRIZ: Record<string, Partial<Record<Modulo, Acceso>>> = {
  cosmetologa: {
    inicio: T, tickets: P, comisiones: P, rol_pagos: P, asistencia: P, productos: T,
    clientes: T, inventario: T, transferencias: T, paquetes: P, gift_cards: T, bitacora: T, cabina: T,
    compras: P, agenda: P,
    recepciones: T,
  },
  asistente_cosmetologia: {
    inicio: T, tickets: P, comisiones: P, rol_pagos: P, asistencia: P, productos: T,
    clientes: T, inventario: T, transferencias: T, conteos: T, paquetes: P, gift_cards: T, bitacora: T, cabina: T,
    compras: P, agenda: P,
    recepciones: T,
  },
  recepcion: {
    inicio: T, tickets: T, comisiones: P, rol_pagos: P, asistencia: P, productos: T,
    clientes: T, inventario: T, cotizaciones_cliente: T, paquetes: T, gift_cards: T, caja: T, agenda: T,
  },
  gerente: {
    inicio: T, tickets: P, comisiones: P, rol_pagos: P, asistencia: P, productos: T,
    clientes: T, inventario: T, transferencias: T, conteos: T, kardex: T,
    cotizaciones_cliente: T, paquetes: T, gift_cards: T, caja: T, bitacora: T, cabina: T, agenda: T,
    recepciones: T,
  },
};

const ACCION_MODULO: Record<string, Modulo> = {
  getCatalogo: "productos", getCatalogoTabla: "productos", crearProductoApp: "productos", editarProductoCatalogo: "productos",
  toggleActivoCatalogo: "productos", eliminarProductoApp: "productos", prod_list: "productos",
  prod_get: "productos", prod_save: "productos", prod_foto: "productos",
  getInventario: "inventario", stk_saldo: "inventario", stk_kardex: "kardex",
  getEntradas: "compras", registrarEntrada: "compras", getProveedoresApp: "proveedores", getProveedoresTabla: "proveedores",
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
  inline_guardar: "tickets", inline_borrar: "tickets", solicitud_crear: "tickets", tk_edicion_pedir: "tickets", tk_ediciones_pendientes: "tickets", getSolicitudes: "inicio", solicitud_resolver: "tickets",
  clientes_resumen: "clientes", cliente_detalle: "clientes", ticket_editar: "tickets",
  reporte_consumos: "ver_costos", periodo_consignacion: "compras", oc_consignacion: "compras",
  rcp_lista: "recepciones", rcp_get: "recepciones", rcp_recibir: "recepciones", rcp_no_recibido_undo: "recepciones", rcp_producto_attr: "productos",
  cns_meta: "compras", cns_calc: "compras", cns_crear_oc: "compras", cns_restock_guardar: "compras", cns_restock_anular: "compras", cns_conteo_inicial: "compras", cns_conteo_transferir: "compras", acta_get: "compras", acta_firmar: "compras", acta_pdf_guardar: "compras", acta_link: "compras",
  cmpb_meta: "compras", cmpb_lista: "compras", cmpb_get: "compras", cmpb_crear: "compras", cmpb_cancelar: "compras", cmpb_pago: "compras", cmpb_cot_guardar: "compras", cmpb_cot_get: "compras", cmpb_cot_convertir: "compras", cmpb_cot_anular: "compras",
  compras_periodo: "compras", compras_guardar: "compras", compras_aprobar: "compras", compras_enviar: "compras",
  compras_pago: "compras", compras_saldo: "compras", compras_reporte: "compras",
  compras_lista: "inventario", compras_recibir: "inventario",
  conteo_plan: "conteos", conteo_crear: "conteos", conteo_asignar: "conteos", conteo_panel: "conteos", conteo_aprobar: "conteos",
  conteo_mios: "inicio", conteo_seccion: "inicio", conteo_guardar_sec: "inicio", conteo_cerrar_sec: "inicio", conteo_usuarios: "conteos",
  crearTicket: "tickets", ov_save: "tickets", ov_anular: "tickets", ov_list: "tickets", ov_get: "tickets",
  getDashCosm: "comisiones", getComisionesRol: "comisiones", getComisionRecepcion: "comisiones", comision_recepcion: "comisiones",
  getPeriodoComision: "comisiones", getReporteAdmin: "comisiones", getReporte: "comisiones",
  getComisionesTabla: "comisiones", getTramos: "comisiones", tramos_guardar: "comisiones",
  getRendimientoProductos: "ver_costos",
  getRoles: "rol_pagos", getRolIndividual: "rol_pagos", getAprobacionesRol: "rol_pagos", aprobarRol: "rol_pagos",
  getRolCiclo: "rol_pagos", getPagoConfig: "rol_pagos", pago_config_guardar: "rol_pagos",
  roles_lista: "rol_pagos", rol_publicar: "rol_pagos", rol_crear: "rol_pagos", rol_get: "rol_pagos", rol_opciones: "rol_pagos", rol_ajustar: "rol_pagos", rol_aprobar: "rol_pagos", rol_rechazar: "rol_pagos", jibble_importar: "rol_pagos",
  emp_list: "asistencia", emp_get: "asistencia", emp_guardar: "asistencia", emp_iess_guardar: "rol_pagos", emp_iess_borrar: "rol_pagos", emp_doc_subir: "asistencia", emp_doc_url: "asistencia", emp_oc_servicios: "rol_pagos",
  config_general: "configuracion",
  testDiasJibble: "asistencia",
  asis_config: "asistencia", asis_config_guardar: "asistencia", asis_marcar: "asistencia",
  asis_hoy: "asistencia", asis_periodo: "asistencia", asis_corregir: "asistencia", asis_auditoria: "asistencia",
  asis_permiso_cancelar: "asistencia", asis_vacaciones: "asistencia", asis_marca_manual: "asistencia", asis_dia: "asistencia",
  asis_permiso_solicitar: "asistencia", asis_permiso_resolver: "asistencia", asis_feriado: "asistencia", asis_foto: "asistencia",
  asis_aviso: "asistencia", asis_calendario: "asistencia", asis_cierre_automatico: "asistencia", horarios_list: "asistencia", horarios_guardar: "asistencia", horarios_asignar: "asistencia",
  horarios_importar: "asistencia", push_clave: "asistencia", push_suscribir: "asistencia",
  getPermisos: "asistencia", savePermiso: "asistencia", updatePermiso: "asistencia",
  getRegistroClientes: "clientes", saveRegistroCliente: "clientes", registrarCliente: "clientes",
  cli_list: "clientes", cli_save: "clientes",
  prov_list: "proveedores", prov_save: "proveedores",
  guardarCotizacion: "cotizaciones_cliente", getCotizaciones: "cotizaciones_cliente", getCotizacion: "cotizaciones_cliente",
  getTicketsLista: "tickets", getTicket: "tickets", editarTicket: "tickets",
  buscarPaquetes: "paquetes", getSeguimientoPaquetes: "paquetes",
  getCodigoGC: "gift_cards", getCodigosGC: "gift_cards", buscarGiftCards: "gift_cards", getGCDigitales: "gift_cards",
  gc_list: "gift_cards", gc_detalle: "gift_cards", gcb_lista: "gift_cards", gcb_get: "gift_cards", gcb_vender: "gift_cards", gcb_usar: "gift_cards", gcb_pdf_guardar: "gift_cards", gcb_doc_url: "gift_cards", gc_emitir: "gift_cards", gc_editar: "gift_cards",
  paq_list: "paquetes", paq_detalle: "paquetes", paq_emitir: "paquetes", paq_editar: "paquetes",
  getMultas: "asistencia", personal_personas: "inicio", citas_proximas: "inicio", staff_home: "inicio", ping: "inicio", bootstrap: "inicio", tk_historial: "tickets", tk_reagendadas: "tickets",
  getCajaV2: "caja", cajaV2Mov: "caja", cajaV2Iniciar: "caja", cajaGasto: "caja", cajaDeposito: "caja",
  getBitacora: "bitacora", bitacoraCrear: "bitacora", bitacoraAnular: "bitacora",
  getCabina: "cabina", cabinaAbrirRapido: "cabina",
  usuariosFull: "usuarios", saveUsuarios: "usuarios", usuarioBloquear: "usuarios", usuarioPinReset: "usuarios",
  betaTablas: "usuarios", betaFilas: "usuarios", betaGuardar: "usuarios", betaEliminar: "usuarios", betaMover: "usuarios",
  permisos_get: "inicio", permisos_guardar: "permisos",
  cfg_priv_get: "configuracion", cfg_priv_guardar: "configuracion",
  home: "inicio",
  aprobaciones_pendientes: "inicio",
  getDashboardHoy: "inicio",
  getDashboard: "inicio",
};

const COSTO = new Set([
  "precio_compra", "compra", "comprareal", "compra_real", "compracomision", "compra_comision",
  "costo", "costoprod", "costo_promedio", "costopromedio", "costo_unit", "costo_unitario",
  "costo_envase", "costo_por_unidad", "costo_real", "costoreal", "costo_total", "costototal",
  "utilidad", "utilidadprod", "utilidad_prod", "margen", "margenpct", "margen_pct", "margenprod",
  "comi_producto_30", "com", "falta_costo", "faltacosto", "faltacoston", "faltacostoskus",
  "sincosto", "sin_costo", "cogs", "cogs_nota", "ganancia",
  "beta_compra_real", "beta_compra_comision", "comprarealsistema", "compracomisioncatalogo",
  "iesspatronal", "iess_patronal_11_15", "costoempresa", "costo_empresa",
]);
const COSTO_COMPRAS = new Set([
  "precio", "subtotal", "total", "importe", "valor", "iva", "flete", "pagado", "saldo",
  "descuento", "descuento_pct", "p_unit", "pu", "unit_price",
]);
function esAccionCompras(action: string): boolean {
  return /^(oc_|compras_|cmpb_|rcp_|cns_|acta_|getEntradas|periodo_consignacion|oc_consignacion)/.test(action);
}
function esAccionNomina(action: string): boolean {
  return /^(getComisiones|getDashCosm|getRol|getRoles|aprobarRol|getPeriodoComision|getComisionRecepcion|comision_recepcion|rol_)/.test(action);
}
export function esClaveCosto(k: string, action = ""): boolean {
  const n = k.toLowerCase().replace(/[\s-]+/g, "_");
  if (n === "ver_costos" || n === "vercostos") return false;
  if (n.startsWith("compra_pack")) return false;
  if (COSTO.has(n) || COSTO.has(n.replace(/_/g, ""))) return true;
  if (/costo|utilidad|margen|compra_comision|compracomision|compra_real|comprareal|precio_compra|falta_costo|faltacosto|sin_costo|sincosto|cogs|^ganancia$|beta_compra|comi_producto/.test(n)) return true;
  if (esAccionCompras(action) && COSTO_COMPRAS.has(n)) return true;
  if (!esAccionNomina(action) && (n === "comision" || n === "comisiones")) return true;
  return false;
}
const CONTACTO = new Set(["telefono", "tel", "celular", "whatsapp", "email", "correo"]);

/** @deprecated Preferir puedePriv(rol, "telefonos", matriz). Sin matriz, solo admin (TK73). */
export function puedeVerContacto(rol: string, matriz?: Record<string, Partial<Record<string, Acceso>>>): boolean {
  return puedePriv(rol, "telefonos", matriz);
}

/** personas: de quién más ve datos por persona (permisos por usuario, alcance._personas). */
export interface SesLite { rol: string; name: string; short: string; uid: string; personas?: string[] }

/** ¿Ese nombre está entre las personas extra que el admin le dio? (nombre completo o primer nombre). */
export function enAlcancePersonas(nombreFila: unknown, ses: SesLite): boolean {
  const L = ses.personas;
  if (!L || !L.length) return false;
  const a = normNombre(String(nombreFila ?? ""));
  if (!a) return false;
  if (L.includes("*")) return true;
  return L.some((x) => {
    const b = normNombre(x);
    if (!b) return false;
    const fb = b.split(" ")[0] || "";
    return a === b || a.startsWith(b + " ") || b.startsWith(a + " ") || (a === fb);
  });
}

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

/** Solo Super Admin ve costos, utilidad, margen y precios de compra. admin no. */
export function esSuperAdmin(rol: string): boolean {
  return normalizarRol(rol) === "super_admin";
}

export function acceso(rol: string, modulo: string, matriz: Record<string, Partial<Record<string, Acceso>>> = DEFAULT_MATRIZ): Acceso {
  if (modulo === "permisos" || modulo === "ver_costos") return esSuperAdmin(rol) ? "todos" : "no";
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
  return enAlcancePersonas(nombreFila, ses);
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
  const pub = new Set(["", "version", "getVersion", "login", "login_pass", "logout", "getUsuarios", "usuarioBloqueado", "usuarioCambiarPin", "whoami", "reset_pedir", "reset_validar", "reset_aplicar"]);
  if (pub.has(action)) return null;
  if (!ses) return { error: "Inicia sesión" };
  // Consumos (unidades): lo ve admin y Super Admin. Los $ de costo los quita redactar si no es Super Admin.
  if (action === "reporte_consumos") return esAdmin(ses.rol) ? null : { error: "No tienes permiso" };
  const mod = ACCION_MODULO[action];
  if (!mod) return null;
  if (acceso(ses.rol, mod, matriz) === "no") {
    if (mod === "configuracion") return { error: "Solo administración configura esto" };
    return { error: "No tienes permiso" };
  }
  return null;
}

export function clampPersonal(action: string, p: Row, ses: SesLite | null, matriz: Record<string, Partial<Record<string, Acceso>>>): Row {
  if (!ses || esAdmin(ses.rol)) return p;
  const out = { ...p };
  const propio = (mod: string) => acceso(ses.rol, mod, matriz) === "propio";
  // Con alcance de personas, puede pedir a alguien de su lista; si no, siempre ella.
  const pedido = (): string => {
    const x = String(p.nombre ?? p.cosmetologa ?? p.persona ?? "").trim();
    return x && enAlcancePersonas(x, ses) ? x : ses.name;
  };
  if (propio("comisiones") && ["getDashCosm", "getComisionesRol", "getPeriodoComision", "getComisionRecepcion", "comision_recepcion", "getComisionesTabla"].includes(action)) {
    const n = pedido();
    out.cosmetologa = n;
    out.nombre = n;
    out.persona = n;
  }
  if (acceso(ses.rol, "rol_pagos", matriz) !== "todos" && ["getRolIndividual", "getRoles", "aprobarRol", "getRolCiclo"].includes(action)) {
    const n = pedido();
    out.nombre = n;
    out.persona = n;
  }
  if (propio("asistencia") && action === "testDiasJibble") out.nombre = ses.name;
  if (propio("tickets") && (action === "crearTicket" || action === "ov_save" || action === "")) {
    if (out.cosmetologa && !esPropio(out.cosmetologa, ses) && normalizarRol(ses.rol) !== "recepcion" && normalizarRol(ses.rol) !== "gerente") {
      out.cosmetologa = ses.name;
    }
  }
  return out;
}

const CONTACTO_TEL = new Set(["telefono", "tel", "celular", "whatsapp"]);
const CONTACTO_MAIL = new Set(["email", "correo"]);
function quitarContacto(v: unknown, tel: boolean, mail: boolean): unknown {
  if (tel && mail) return v;
  if (Array.isArray(v)) return v.map((x) => quitarContacto(x, tel, mail));
  if (!v || typeof v !== "object") return v;
  const o: Row = {};
  for (const [k, val] of Object.entries(v as Row)) {
    const n = k.toLowerCase();
    if (!tel && CONTACTO_TEL.has(n)) continue;
    if (!mail && CONTACTO_MAIL.has(n)) continue;
    o[k] = quitarContacto(val, tel, mail);
  }
  return o;
}

function quitarCostos(v: unknown, puede: boolean, action = ""): unknown {
  if (puede || v == null) return v;
  if (Array.isArray(v)) return v.map((x) => quitarCostos(x, false, action));
  if (typeof v !== "object") return v;
  const o: Row = {};
  for (const [k, val] of Object.entries(v as Row)) {
    if (esClaveCosto(k, action)) continue;
    o[k] = quitarCostos(val, false, action);
  }
  return o;
}

export function redactar(action: string, data: unknown, ses: SesLite | null, matriz: Record<string, Partial<Record<string, Acceso>>> = DEFAULT_MATRIZ): unknown {
  const puedeCostos = !!(ses && esSuperAdmin(ses.rol));
  if (!ses) return quitarCostos(structuredClone(data), false, action);
  if (!esAdmin(ses.rol) && action === "getRolIndividual" && data && typeof data === "object") {
    const nombre = String(((data as Row).data as Row | undefined)?.nombre || (data as Row).nombre || "");
    if (nombre && !esPropio(nombre, ses)) return { error: "No tienes permiso para ver el rol de otra persona" };
  }
  let out = quitarCostos(structuredClone(data), puedeCostos, action);
  if (esAdmin(ses.rol)) return out;
  // TK147: el correo del propio acceso (whoami / Mi acceso / reseteo) no es el email de una clienta.
  const emailPropio = action === "whoami" || action.startsWith("cred_") || action.startsWith("reset_");
  if (!emailPropio) out = quitarContacto(out, puedePriv(ses.rol, "telefonos", matriz), puedePriv(ses.rol, "emails", matriz));
  else if (!puedePriv(ses.rol, "telefonos", matriz)) out = quitarContacto(out, false, true);
  const ticketsPropio = acceso(ses.rol, "tickets", matriz) === "propio";
  const rolPropio = acceso(ses.rol, "rol_pagos", matriz) !== "todos";
  const comPropio = acceso(ses.rol, "comisiones", matriz) === "propio";
  out = filtrar(out, ses, { ticketsPropio, rolPropio, comPropio, action });
  return out;
}

function filtrar(v: unknown, ses: SesLite, f: { ticketsPropio: boolean; rolPropio: boolean; comPropio: boolean; action: string }): unknown {
  if (Array.isArray(v)) {
    let arr = v.map((x) => filtrar(x, ses, f));
    // Las sesiones de un paquete (pq_*) no son tickets: se ven todas para saber cuántas quedan (TK55).
    // cl_* / clientes_*: el personal ve a todas las clientas y todo el historial (sin teléfono/correo/sector).
    const accClientes = f.action.startsWith("cl_") || f.action.startsWith("clientes_") || f.action === "cliente_detalle" || f.action === "buscarCliente";
    if (f.ticketsPropio && !f.action.startsWith("pq_") && !accClientes && arr.length && arr.every((x) => x && typeof x === "object" && ("cosmetologa" in (x as Row) || "cosm" in (x as Row)))) {
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
  "pq_lista", "gcb_lista", // Paquetes y Gift cards en «Ver como» (TK60)
  "cl_buscar", // buscador de clientas del ticket en «Ver como» (TK66)
  "whoami", "version", "getVersion", "home", "erp_home",
  "asis_hoy", "asis_periodo", "asis_auditoria", "asis_config", "asis_dia", "asis_foto", "asis_vacaciones", "asis_aviso", "asis_calendario", "roles_lista",
  "horarios_list", "push_clave",
  "staff_home", "ping", "bootstrap", "tk_historial", "tk_reagendadas", "citas_proximas", "getCitas", "stk_saldo", "stk_kardex", "clientes_resumen", "cliente_detalle",
  "personal_personas", "reporte_consumos", "periodo_consignacion", "reorden_sugerir", "refs",
  "buscarPaquetes", "buscarGiftCards", "buscarCliente", "existeCedula", "getRegistro",
  "usuarioBloqueado", "betaTablas", "betaFilas", "cabinaManoObraSugerida", "refrescarTelefonos",
  "cl_doc_url", "cl_buscar",
]);

/** Módulo que habilita una acción (para el nivel por usuario). */
export function moduloDeAccion(action: string): string {
  return ACCION_MODULO[action] || "";
}

export function lecturaEnVista(action: string): boolean {
  if (!action) return false;
  if (action.startsWith("get") || action.endsWith("_list") || action.endsWith("_get")) return true;
  return LECTURA_VISTA.has(action);
}
