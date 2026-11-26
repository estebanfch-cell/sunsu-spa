// Reglas puras del Sistema Central. Los timestamps importados guardan la hora
// de Ecuador como si fuera UTC: se leen con componentes UTC (igual que ts_local).

export const APP_VERSION = "2026-10-21-SCOPE";
export const LEGACY_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyLgY0TJOpjafCtRUgAlq2i1xvWifu7vLFD9dkLR2HX92dtAnMGK7FCBvkrFk7yDP6x/exec";
export const CEDULA_INTERNA = "1793219469001";
export const IVA = 1.15;
export const FACIALES_2 = ["SUNSU-01", "SUNSU-02", "SUNSU-03", "SUNSU-04", "SUNSU-05", "SUNSU-06"];
export const FACIALES_3 = ["SUNSU-40", "SUNSU-41", "SUNSU-42", "SUNSU-43", "SUNSU-52", "SUNSU-57"];
export const NIVELES: { nivel: number; pct: number; premio: number }[] = [
  { nivel: 1, pct: 0.05, premio: 5 }, { nivel: 2, pct: 0.10, premio: 20 },
  { nivel: 3, pct: 0.15, premio: 45 }, { nivel: 4, pct: 0.20, premio: 80 },
  { nivel: 5, pct: 0.25, premio: 125 }, { nivel: 6, pct: 0.30, premio: 180 },
  { nivel: 7, pct: 0.40, premio: 245 }, { nivel: 8, pct: 0.50, premio: 320 },
  { nivel: 9, pct: 0.60, premio: 405 }, { nivel: 10, pct: 0.80, premio: 500 },
];
/** Último ciclo (abre el 26) que usa niveles. Cierra el 2026-10-25. El divisor de esos ciclos es 3 cabinas. */
export const CICLO_NIVEL_HASTA = "2026-09-26";
export const N_CABINAS = 3;
/** El ciclo que cierra el 2026-10-25 queda congelado en N8 para Andrea y Daniela. */
export const BONO_N8_CICLO = "2026-09-26";
export const BONO_N8 = 320;
export const PACK_X3 = ["SUNSU-17","SUNSU-18","SUNSU-19","SUNSU-20","SUNSU-21","SUNSU-22","SUNSU-29","SUNSU-44","SUNSU-45","SUNSU-46","SUNSU-47","SUNSU-53","SUNSU-55","SUNSU-58"];
export const PACK_X6 = ["SUNSU-23","SUNSU-24","SUNSU-25","SUNSU-26","SUNSU-27","SUNSU-28","SUNSU-30","SUNSU-48","SUNSU-49","SUNSU-50","SUNSU-51","SUNSU-54","SUNSU-56","SUNSU-59"];
export const VENTAS_DESDE = "2026-05-22";
export const ADMIN = ["admin", "admin_master", "super_admin"];
export const RECEP = ["admin", "admin_master", "super_admin", "gerente", "reception", "recepcion"];
export const ALL_ROLES = [
  "super_admin", "admin", "admin_master", "gerente",
  "recepcion", "reception", "cosmetologa", "asistente_cosmetologia", "staff", "visor",
];
export const PROD_COLS: { sku: string; col: string; typ: "numeric" | "text" }[] = [
  { sku: "HT-002", col: "ht_002", typ: "numeric" }, { sku: "HT-003", col: "ht_003", typ: "numeric" },
  { sku: "HT-004", col: "ht_004", typ: "numeric" }, { sku: "HT-006", col: "ht_006", typ: "numeric" },
  { sku: "HT-007", col: "ht_007", typ: "numeric" }, { sku: "HT-010", col: "ht_010", typ: "numeric" },
  { sku: "HT-011", col: "ht_011", typ: "numeric" }, { sku: "HT-012", col: "ht_012", typ: "text" },
  { sku: "HT-013", col: "ht_013", typ: "numeric" }, { sku: "HT-014", col: "ht_014", typ: "numeric" },
  { sku: "AS-001", col: "as_001", typ: "numeric" }, { sku: "AS-002", col: "as_002", typ: "numeric" },
  { sku: "AS-003", col: "as_003", typ: "numeric" }, { sku: "AS-004", col: "as_004", typ: "numeric" },
  { sku: "AS-005", col: "as_005", typ: "numeric" }, { sku: "AS-006", col: "as_006", typ: "numeric" },
  { sku: "AS-007", col: "as_007", typ: "numeric" }, { sku: "AS-009", col: "as_009", typ: "numeric" },
  { sku: "AS-010", col: "as_010", typ: "numeric" },
  { sku: "ML-001", col: "ml_001", typ: "numeric" }, { sku: "ML-002", col: "ml_002", typ: "numeric" },
  { sku: "ML-003", col: "ml_003", typ: "text" }, { sku: "ML-004", col: "ml_004", typ: "numeric" },
  { sku: "ML-005", col: "ml_005", typ: "numeric" }, { sku: "ML-007", col: "ml_007", typ: "numeric" },
  { sku: "ML-008", col: "ml_008", typ: "numeric" }, { sku: "ML-009", col: "ml_009", typ: "numeric" },
  { sku: "ML-010", col: "ml_010", typ: "numeric" }, { sku: "ML-011", col: "ml_011", typ: "numeric" },
  { sku: "ML-012", col: "ml_012", typ: "text" }, { sku: "ML-013", col: "ml_013", typ: "numeric" },
  { sku: "ML-014", col: "ml_014", typ: "text" },
  { sku: "PH-001", col: "ph_001", typ: "numeric" }, { sku: "PH-002", col: "ph_002", typ: "numeric" },
  { sku: "PH-003", col: "ph_003", typ: "numeric" }, { sku: "PH-004", col: "ph_004", typ: "text" },
  { sku: "PH-007", col: "ph_007", typ: "numeric" }, { sku: "PH-008", col: "ph_008", typ: "numeric" },
  { sku: "PH-005", col: "ph_005", typ: "text" },
  { sku: "JN-001", col: "jn_001", typ: "numeric" }, { sku: "JN-002", col: "jn_002", typ: "numeric" },
  { sku: "JN-003", col: "jn_003", typ: "numeric" }, { sku: "JN-004", col: "jn_004", typ: "text" },
  { sku: "JN-005", col: "jn_005", typ: "numeric" }, { sku: "JN-006", col: "jn_006", typ: "numeric" },
  { sku: "JN-007", col: "jn_007", typ: "text" }, { sku: "JN-008", col: "jn_008", typ: "numeric" },
  { sku: "JN-009", col: "jn_009", typ: "numeric" },
  { sku: "BV-001", col: "bv_001", typ: "numeric" },
  { sku: "SU-001", col: "su_001", typ: "numeric" }, { sku: "SU-002", col: "su_002", typ: "numeric" },
  { sku: "SU-003", col: "su_003", typ: "numeric" }, { sku: "SU-004", col: "su_004", typ: "text" },
  { sku: "SU-005", col: "su_005", typ: "numeric" }, { sku: "SU-006", col: "su_006", typ: "numeric" },
  { sku: "SU-007", col: "su_007", typ: "numeric" }, { sku: "SU-008", col: "su_008", typ: "numeric" },
  { sku: "SU-009", col: "su_009", typ: "numeric" },
  { sku: "VK-001", col: "vk_001", typ: "numeric" }, { sku: "VK-002", col: "vk_002", typ: "numeric" },
  { sku: "VK-003", col: "vk_003", typ: "numeric" }, { sku: "VK-004", col: "vk_004", typ: "numeric" },
  { sku: "VK-005", col: "vk_005", typ: "numeric" }, { sku: "VK-006", col: "vk_006", typ: "text" },
  { sku: "VK-007", col: "vk_007", typ: "numeric" }, { sku: "VK-008", col: "vk_008", typ: "text" },
  { sku: "VK-009", col: "vk_009", typ: "numeric" }, { sku: "VK-010", col: "vk_010", typ: "numeric" },
  { sku: "VK-011", col: "vk_011", typ: "text" }, { sku: "VK-012", col: "vk_012", typ: "numeric" },
  { sku: "VK-013", col: "vk_013", typ: "numeric" }, { sku: "VK-014", col: "vk_014", typ: "numeric" },
  { sku: "VK-015", col: "vk_015", typ: "numeric" }, { sku: "VK-016", col: "vk_016", typ: "numeric" },
  { sku: "VK-017", col: "vk_017", typ: "numeric" },
];
const PROD_BY_SKU = new Map(PROD_COLS.map((c) => [c.sku, c]));

export type Row = Record<string, unknown>;

export function s(v: unknown): string {
  if (v == null || v === false) return "";
  return String(v).trim();
}
export function n(v: unknown): number {
  if (v == null || v === "") return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}
export function b(v: unknown): boolean {
  return v === true || v === 1 || v === "TRUE" || v === "true" || v === "SI" || v === "Sí";
}
export function pad(x: number, w = 2): string { return String(x).padStart(w, "0"); }
export function round2(x: number): number { return Math.round((x + Number.EPSILON) * 100) / 100; }

/** Piso del número de ticket cuando no hay ticket_seq. No ocupa sheet_row. */
export const BETA_TICKET_BASE = 900000;

/**
 * Número de secuencia de una orden importada o de una OV ya emitida.
 * Cuenta OV-1643, TK-80 y TK-ROW-1642. No cuenta TK-20261021-900001:
 * ese es el id visible del ticket (el piso 900000 no es una orden).
 */
export function secuenciaOrden(numero: string): number | null {
  const row = /^TK-ROW-(\d+)$/.exec(numero);
  if (row) return Number(row[1]);
  const plain = /^(?:OV|TK)-(\d+)$/.exec(numero);
  if (plain) return Number(plain[1]);
  return null;
}

/** Mayor OV/TK importado. Si ninguno, la cantidad de filas. */
export function maxSufijoNumero(rows: Row[]): number {
  let max = 0;
  let any = false;
  for (const r of rows) {
    const candidatos = [secuenciaOrden(String(r.numero ?? ""))];
    const sheet = Number(r.ticket_sheet_row);
    if (Number.isFinite(sheet) && sheet > 0) candidatos.push(sheet);
    for (const n of candidatos) {
      if (n == null || !(n > 0)) continue;
      any = true;
      max = Math.max(max, n);
    }
  }
  if (!any) return rows.length;
  return max;
}

/**
 * La siguiente OV sigue al máximo importado.
 * TK-ROW-80 → OV-0081. En producción el máximo fue TK-ROW-1642, así que la
 * primera venta salió OV-1643. Vacío → OV-0001.
 */
export function siguienteOv(rows: Row[]): string {
  return "OV-" + String(maxSufijoNumero(rows) + 1).padStart(4, "0");
}

/** Conserva un OV-#### solo si queda por encima de lo ya importado y no está tomado. */
export function elegirNumeroOv(rows: Row[], pedido: string): string {
  const next = siguienteOv(rows);
  const m = /^OV-(\d+)$/.exec(pedido);
  if (!m) return next;
  const suf = Number(m[1]);
  if (suf <= maxSufijoNumero(rows)) return next;
  if (rows.some((r) => String(r.numero) === pedido)) return next;
  return pedido;
}

export function siguienteBetaNum(rows: Row[], ymd: string): string {
  let max = BETA_TICKET_BASE;
  const re = /^TK-\d{8}-(\d+)$/;
  for (const r of rows) {
    const m = re.exec(String(r.beta_num || ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `TK-${ymd.replace(/-/g, "")}-${String(max + 1).padStart(4, "0")}`;
}

/** Serie aparte. TEST-OC-0001 no entra en OC-#### ni en next_oc_num. */
export function siguienteTestDoc(rows: Row[], prefix: string): string {
  let max = 0;
  const re = new RegExp("^TEST-" + prefix + "-(\\d+)$");
  for (const r of rows) {
    // so_num (tickets) y sq_num (cotizaciones) también: antes solo miraba numero/beta_num
    // y el 2º ticket de prueba volvía a salir TEST-TK-SO-0001 → 409 tickets_so_num_uidx.
    const o = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
    for (const campo of [r.numero, r.beta_num, r.so_num, r.sq_num, o.so_num, o.sq_num, o.numero]) {
      const m = re.exec(String(campo || ""));
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return `TEST-${prefix}-${String(max + 1).padStart(4, "0")}`;
}

/** TEST-TK-AAAAMMDD-####. No usa el piso 900000 ni next_ticket_num. */
export function siguienteTestTicket(rows: Row[], ymd: string): string {
  const day = ymd.replace(/-/g, "");
  let max = 0;
  const re = /^TEST-TK-(\d{8})-(\d+)$/;
  for (const r of rows) {
    const m = re.exec(String(r.beta_num || ""));
    if (m && m[1] === day) max = Math.max(max, Number(m[2]));
  }
  return `TEST-TK-${day}-${String(max + 1).padStart(4, "0")}`;
}

/** Sigue 26-065 → 26-066. En prueba solo mira TEST-26-###, así el número real no se gasta. */
export function siguienteCodigoGc(rows: Row[], yy: string, prueba = false): string {
  const re = prueba ? new RegExp("^TEST-" + yy + "-(\\d+)$") : new RegExp("^" + yy + "-(\\d+)$");
  let max = 0;
  for (const r of rows) {
    const m = re.exec(String(r.codigo_gc || ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  const n = String(max + 1).padStart(3, "0");
  return prueba ? `TEST-${yy}-${n}` : `${yy}-${n}`;
}

/** PQ-0001 si la hoja no traía código. Sigue el mayor PQ- que ya exista. */
/** Código visible del paquete: PQ-#### de la beta, si no el PACK-### importado, si no el de orig. */
/** Teléfono para mostrar y para WhatsApp: siempre «+593 9X XXX XXXX» (quita el 0 inicial, el «.0» de la hoja, notación científica). Solo al leer: no escribe en la hoja. */
export function telefonoEc(v: unknown): string {
  let t = String(v ?? "").trim();
  if (!t || /^(false|null|undefined|-)$/i.test(t)) return "";
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(t)) t = Number(t).toFixed(0);
  t = t.replace(/\.0+$/, "");
  let d = t.replace(/\D/g, "");
  if (!d) return t;
  if (d.startsWith("593")) d = d.slice(3);
  d = d.replace(/^0+/, "");
  if (d.length === 9 && d[0] === "9") return "+593 " + d.slice(0, 2) + " " + d.slice(2, 5) + " " + d.slice(5);
  if (d.length === 8 && /^[2-7]/.test(d)) return "+593 " + d[0] + " " + d.slice(1, 4) + " " + d.slice(4);
  return t.startsWith("+") ? t : (t.replace(/\.0+$/, ""));
}
/** Columna de foto/comprobante del ticket; el sync deja la URL solo en orig (columna de la hoja), así que se lee de ahí si la columna está vacía o en «False». */
const COL_HOJA: Record<string, string> = { fotos_antes: "FOTOS ANTES", fotos_despues: "FOTOS DESPUES", fotos: "FOTOS", comprobante: "COMPROBANTE" };
export function colTicket(r: Row, col: string): string {
  const v = s(r[col]);
  if (/https?:|archivo:|base64,/.test(v)) return v;
  const o = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  const w = s(o[COL_HOJA[col] || col]);
  return /https?:|archivo:/.test(w) ? w : v;
}
export function codigoPaquete(r: Row): string {
  const orig = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  return String(r.beta_codigo || "") || String(orig.codigo || "") || String(r.codigo || "");
}
export function siguienteCodigoPaq(rows: Row[], prueba = false): string {
  const re = prueba ? /^TEST-PQ-(\d+)$/ : /^PQ-(\d+)$/;
  let max = 0;
  for (const r of rows) {
    const orig = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
    for (const campo of [orig.codigo, r.notas, r.beta_codigo]) {
      const m = re.exec(String(campo || ""));
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  const n = String(max + 1).padStart(4, "0");
  return prueba ? `TEST-PQ-${n}` : `PQ-${n}`;
}

export function ecuadorParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guayaquil",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23", weekday: "short",
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  const y = Number(p.year), m = Number(p.month), day = Number(p.day);
  const dt = new Date(Date.UTC(y, m - 1, day));
  return {
    y, m, d: day,
    hh: Number(p.hour), mm: Number(p.minute), ss: Number(p.second),
    ymd: `${p.year}-${p.month}-${p.day}`,
    hm: `${p.hour}:${p.minute}`,
    dow: dt.getUTCDay(),
    isoWall: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
    stamp: `${p.month}/${p.day}/${p.year} ${p.hour}:${p.minute}:${p.second}`,
  };
}

export function ymdUtc(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return s(v).slice(0, 10);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function hmUtc(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return ymdUtc(new Date(Date.UTC(y, m - 1, d + days)));
}
export function cicloInicio(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (d >= 26) return `${y}-${pad(m)}-26`;
  return ymdUtc(new Date(Date.UTC(y, m - 2, 26)));
}
export function cicloFin(inicio: string): string {
  const [y, m] = inicio.split("-").map(Number);
  return ymdUtc(new Date(Date.UTC(y, m, 25)));
}

/**
 * Cédula / RUC / pasaporte normalizado para comparar (Emilia 17/11, unir clientas): sin «.0» de la hoja, sin
 * puntos ni guiones; RUC de persona (cédula + 001) = su cédula; «…001.0» pegado («…0010») también. Pasaporte
 * (letras y números) queda en MAYÚSCULAS solo con letras y dígitos. Sin ceros a la izquierda (es la clave «c:»
 * de siempre); para mostrar usa cedulaVer. Solo lectura: no reescribe la hoja.
 */
export function normCedula(v: unknown): string {
  const t = s(v).trim().replace(/\.0+$/, "");
  if (/[a-z]/i.test(t)) { const a = t.toUpperCase().replace(/[^A-Z0-9]/g, ""); return /\d/.test(a) && a.length >= 5 ? a : ""; }
  let d = t.split(".")[0].replace(/[^0-9]/g, "").replace(/^0+/, "");
  if ((d.length === 13 || d.length === 14) && d.endsWith("0010")) d = d.slice(0, -4);
  else if ((d.length === 12 || d.length === 13) && d.endsWith("001")) d = d.slice(0, -3);
  return d;
}
/** La clave vieja (antes de unir RUC/cédula): solo para «Deshacer unión» de un grupo automático. */
export function normCedulaVieja(v: unknown): string {
  return s(v).split(".")[0].replace(/[^0-9]/g, "").replace(/^0+/, "");
}

/** Dígitos crudos de cédula/RUC, sin quitar ceros a la izquierda. */
export function digitosCed(v: unknown): string {
  return s(v).split(".")[0].replace(/[^0-9]/g, "");
}
/** Misma persona: cédula igual, o RUC (13=cédula+001) / typo de 11 dígitos que empieza por la cédula de 10. */
export function cedulasCompatibles(a: unknown, b: unknown): boolean {
  const na = normCedula(a), nb = normCedula(b);
  if (na && nb && na === nb) return true;
  const da = digitosCed(a), db = digitosCed(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const [lo, hi] = da.length <= db.length ? [da, db] : [db, da];
  if (lo.length >= 10 && hi.startsWith(lo) && (hi.length === lo.length + 1 || (hi.length === lo.length + 3 && hi.endsWith("001")))) return true;
  return false;
}
/** Para mostrar: la cédula de 10 dígitos (con el 0 de provincia), o el pasaporte limpio. Nunca «.0» ni puntos.
 *  TK205: un número de 9 dígitos SOLO se antepone 0 si, así, es una cédula válida (la hoja perdió el 0 de provincia).
 *  Un pasaporte numérico (ej. 164804287) se deja tal cual. */
export function cedulaVer(v: unknown): string {
  const c = normCedula(v);
  if (/^\d{9}$/.test(c) && cedulaChecksum("0" + c)) return "0" + c;
  return c;
}
/**
 * Identificación para mostrar en cualquier módulo (cédula, RUC, pasaporte): sin «.0», sin puntos ni espacios,
 * con el 0 de provincia que la hoja perdió al guardarla como número. El RUC queda RUC (proveedores); para
 * comparar clientas usa normCedula. Texto sin dígitos (un nombre mal puesto) se deja igual.
 */
export function idVer(v: unknown): string {
  let t = String(v ?? "").trim();
  if (!t || /^(false|null|undefined|-|—)$/i.test(t)) return t === "-" || t === "—" ? t : "";
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(t)) t = Number(t).toFixed(0);
  t = t.replace(/\.0+$/, "");
  if (/[a-z]/i.test(t)) { const a = t.toUpperCase().replace(/[^A-Z0-9]/g, ""); return /\d/.test(a) && a.length >= 5 && !/\s\S+\s/.test(t) ? a : t; }
  const d = t.replace(/\D/g, "");
  if (!d) return t;
  if (d.length === 9 && cedulaChecksum("0" + d)) return "0" + d;
  if (d.length === 12 && d.endsWith("001") && cedulaChecksum("0" + d.slice(0, 9))) return "0" + d;
  return d;
}
/** Claves de respuesta que son identificaciones o teléfonos (sin tildes, minúsculas, _). */
const RX_ID = /(^|_)(cedula|cedulas|ruc|ci|pasaporte|identificacion|id_3|ced)(_|$)/;
const RX_TEL = /(^|_)(telefono|telefonos|tel|celular|movil|whatsapp|phone|fono)(_|$)/;
const claveNorm = (k: string) => k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_");
/**
 * Lectura (Emilia 17/11): toda respuesta de la api a la beta sale con identificaciones y celulares limpios
 * (idVer / telefonoEc +593). No cambia lo guardado ni la hoja.
 */
export function formatearRespuesta<T>(v: T, prof = 0): T {
  if (prof > 12 || v == null) return v;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = formatearRespuesta(v[i], prof + 1); return v; }
  if (typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    const x = o[k];
    if (x != null && typeof x === "object") { o[k] = formatearRespuesta(x, prof + 1); continue; }
    if (typeof x !== "string" && typeof x !== "number") continue;
    const c = claveNorm(k);
    if (RX_ID.test(c)) o[k] = idVer(x);
    else if (RX_TEL.test(c)) o[k] = telefonoEc(x);
  }
  return v;
}
/** Dígito verificador de cédula ecuatoriana (módulo 10) sobre exactamente 10 dígitos. No rellena ceros. */
export function cedulaChecksum(c: string): boolean {
  if (!/^\d{10}$/.test(c)) return false;
  const prov = Number(c.slice(0, 2));
  if (!((prov >= 1 && prov <= 24) || prov === 30) || Number(c[2]) >= 6) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) { let x = Number(c[i]) * (i % 2 === 0 ? 2 : 1); if (x > 9) x -= 9; sum += x; }
  return (10 - (sum % 10)) % 10 === Number(c[9]);
}
/** True si es cédula (10 dígitos, o 9 que al anteponer 0 sí calzan). Un pasaporte numérico no pasa. */
export function cedulaValida(v: unknown): boolean {
  const d = digitosCed(v);
  if (cedulaChecksum(d)) return true;
  if (d.length === 9 && cedulaChecksum("0" + d)) return true;
  return false;
}

/** Tipo de identificación del SRI / Migo: 05 cédula, 04 RUC, 06 pasaporte, 08 documento de identidad extranjero (Otro). */
export const SRI_TIPO_ID = { cedula: "05", ruc: "04", pasaporte: "06", otro: "08" } as const;
export type TipoIdentificacion = "cedula" | "ruc" | "pasaporte" | "otro";
export const TIPOS_DOCUMENTO: { id: TipoIdentificacion; etq: string; sri: string }[] = [
  { id: "cedula", etq: "Cédula", sri: SRI_TIPO_ID.cedula },
  { id: "ruc", etq: "RUC", sri: SRI_TIPO_ID.ruc },
  { id: "pasaporte", etq: "Pasaporte", sri: SRI_TIPO_ID.pasaporte },
  { id: "otro", etq: "Otro (documento de identidad extranjero)", sri: SRI_TIPO_ID.otro },
];

export type Identificacion = {
  tipo: TipoIdentificacion | "";
  valor: string;
  sri: string;
  error: string | null;
  /** Si Cédula/RUC no calzan, sugerir Pasaporte u Otro en vez de solo bloquear. */
  sugerencia?: TipoIdentificacion;
};

function identLimpio(v: unknown): string {
  return s(v).trim().toUpperCase().replace(/[\s.-]/g, "");
}
function normTipoDoc(v: unknown): TipoIdentificacion | "" {
  const t = s(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (t === "cedula" || t === "05" || t === "ci") return "cedula";
  if (t === "ruc" || t === "04") return "ruc";
  if (t === "pasaporte" || t === "06" || t === "passport") return "pasaporte";
  if (t === "otro" || t === "08" || t === "extranjero" || t === "exterior" || t === "documento extranjero") return "otro";
  return "";
}
/** Pasaporte u Otro: cualquier alfanumérico (2 a 30), sin checksum ni largo de cédula. */
function esAlfanumericoDoc(t: string): boolean {
  return /^[A-Z0-9]{2,30}$/.test(t);
}

function rucValido(t: string): { ok: boolean; valor: string } {
  if (!/^\d{13}$/.test(t)) return { ok: false, valor: t };
  // Persona natural: cédula + 001. Sociedades / públicos: 13 dígitos (3er dígito 6 o 9) se aceptan tal cual.
  if (t.endsWith("001") && (cedulaChecksum(t.slice(0, 10)) || cedulaChecksum("0" + t.slice(0, 9)))) {
    return { ok: true, valor: cedulaChecksum(t.slice(0, 10)) ? t : "0" + t.slice(0, 12) };
  }
  const d3 = Number(t[2]);
  if (((d3 === 6 || d3 === 9) && /^\d{13}$/.test(t)) || t.endsWith("001")) return { ok: true, valor: t };
  return { ok: false, valor: t };
}

/** Valida según el tipo elegido (por defecto Cédula). Solo Cédula y RUC tienen checksum/largo.
 *  Pasaporte y Otro aceptan cualquier alfanumérico. Si Cédula/RUC fallan, devuelve sugerencia (pasaporte) sin inventar el tipo. */
export function detectarIdentificacion(v: unknown, tipoForzado?: unknown): Identificacion {
  const tipo = normTipoDoc(tipoForzado) || "cedula";
  const t = identLimpio(v);
  if (!t) return { tipo, valor: "", sri: SRI_TIPO_ID[tipo], error: "Escribe el número de documento" };
  const libre = (kind: "pasaporte" | "otro"): Identificacion => {
    if (!esAlfanumericoDoc(t)) return { tipo: kind, valor: t, sri: SRI_TIPO_ID[kind], error: "Escribe un documento con letras o números" };
    return { tipo: kind, valor: t, sri: SRI_TIPO_ID[kind], error: null };
  };
  if (tipo === "pasaporte") return libre("pasaporte");
  if (tipo === "otro") return libre("otro");
  if (tipo === "ruc") {
    const r = rucValido(t);
    if (r.ok) return { tipo: "ruc", valor: r.valor, sri: SRI_TIPO_ID.ruc, error: null };
    return {
      tipo: "ruc", valor: t, sri: "", error: "Ese RUC no es válido. Si es un pasaporte u otro documento, cámbialo arriba.",
      sugerencia: esAlfanumericoDoc(t) ? "pasaporte" : undefined,
    };
  }
  // Cédula (default)
  if (t.length === 10 && cedulaChecksum(t)) return { tipo: "cedula", valor: t, sri: SRI_TIPO_ID.cedula, error: null };
  if (/^\d{9}$/.test(t) && cedulaChecksum("0" + t)) return { tipo: "cedula", valor: "0" + t, sri: SRI_TIPO_ID.cedula, error: null };
  const r = rucValido(t);
  if (r.ok) return { tipo: "ruc", valor: r.valor, sri: SRI_TIPO_ID.ruc, error: null };
  const msg = /^\d+$/.test(t) && (t.length === 10)
    ? "Esa cédula no es válida. Si es un pasaporte u otro documento, cámbialo arriba."
    : "La cédula tiene 10 dígitos. Si es un pasaporte u otro documento, cámbialo arriba.";
  return { tipo: "cedula", valor: t, sri: "", error: msg, sugerencia: esAlfanumericoDoc(t) ? "pasaporte" : undefined };
}

/** null si la identificación es válida para el tipo (Cédula/RUC validados; Pasaporte/Otro alfanumérico). */
export function validarIdentificacionCliente(v: unknown, tipoForzado?: unknown): string | null {
  return detectarIdentificacion(v, tipoForzado).error;
}
export function normNombre(v: unknown): string {
  return s(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}
export function skuCode(v: unknown): string {
  return invCorto(s(v).toUpperCase().replace(/^SUNSU-/, ""));
}
/**
 * Familia INV con 3 dígitos como las demás (Emilia 16/11): el sistema viejo y el historial de ventas
 * de la hoja traen «SUNSU-INV-000123» / «INV 000003»; la beta usa «INV-123». Solo compara y muestra:
 * no reescribe columnas de la hoja. Más de 999 conserva sus dígitos (INV-1234). Otras familias igual.
 */
export function invCorto(v: unknown): string {
  const c = s(v).trim().toUpperCase();
  const m = c.match(/^(?:SUNSU-)?INV[-_ ]?(\d+)$/);
  if (!m) return s(v);
  return "INV-" + String(Number(m[1])).padStart(3, "0");
}
export function facialSku(v: unknown): string | null {
  const m = s(v).toUpperCase().match(/SUNSU-\d+/);
  return m ? m[0] : null;
}
export function puedeCotizar(rol: string): boolean {
  return RECEP.includes(rol);
}
export function isAdmin(rol: string): boolean { return ADMIN.includes(rol); }

export function prodCol(sku: string): { sku: string; col: string; typ: "numeric" | "text" } | undefined {
  return PROD_BY_SKU.get(skuCode(sku));
}

export function productQtys(row: Row): { sku: string; qty: number; nombre?: string }[] {
  const out: { sku: string; qty: number }[] = [];
  const seen = new Set<string>();
  for (const c of PROD_COLS) {
    const q = n(row[c.col]);
    if (q > 0) { out.push({ sku: c.sku, qty: q }); seen.add(c.sku); }
  }
  const orig = row.orig;
  if (orig && typeof orig === "object") {
    for (const [k, v] of Object.entries(orig as Row)) {
      const m = k.toUpperCase().match(/^(?:SUNSU-)?([A-Z]{2,3}-\d+)/);
      if (!m || seen.has(m[1])) continue;
      const q = n(v);
      if (q > 0) { out.push({ sku: m[1], qty: q }); seen.add(m[1]); }
    }
  }
  return out;
}

export function packSesiones(sku: string, nombre: string, usos?: { usado: boolean; fecha: string }[]): number {
  const nom = s(nombre).toUpperCase();
  const promo = nom.match(/PROMO\s*(\d+)\s*SES/);
  if (promo) return Math.max(1, Math.min(6, parseInt(promo[1], 10)));
  const up = s(sku).toUpperCase();
  const hit = (list: string[]) => list.some((x) => up === x || up.startsWith(x + " "));
  if (hit(PACK_X3)) return 3;
  if (hit(PACK_X6)) return 6;
  if (usos && usos.slice(3).some((u) => u.usado || u.fecha)) return 6;
  if (/X\s*6|6\s*SES|PAQUETE\s*6/.test(nom)) return 6;
  if (/X\s*3|3\s*SES|PAQUETE\s*3|\(6\)|X6/.test(nom)) {
    if (nom.includes("(6)") || nom.includes("X6")) return 6;
    return 3;
  }
  return 3;
}

export function estadoTicket(row: { seguimiento?: string; agendado?: boolean; retorno?: string }, hoy: string): string {
  const seg = s(row.seguimiento);
  if (seg) return seg;
  if (row.agendado) return "✅ Agendada";
  const k = s(row.retorno);
  if (!k) return "";
  const ret = k.slice(0, 10);
  if (ret <= addDays(hoy, -183)) return "⛔ No ha regresado";
  if (ret < hoy) return "🔴 Atrasada";
  if (ret <= addDays(hoy, 7)) return "🟡 Próxima";
  return "🟢 A tiempo";
}

export function esCanje(q: unknown, r: unknown): boolean {
  return s(q).toUpperCase().startsWith("SI") || s(r).toUpperCase().startsWith("SI");
}
export function esInterno(cosm: unknown, cedula: unknown): boolean {
  const c = s(cosm);
  return !c || c.toUpperCase() === "SUNSU" || normCedula(cedula) === normCedula(CEDULA_INTERNA);
}

/** Ticket de canje completo (sesión de paquete o forma de pago «Canje») sin cobro. Los extras no comisionan; el facial de la sesión sí. No aplica a pago directo ($0 sin canje). */
export function esCanjeSinCobro(t: { paquete?: string; gift_card?: string; comp?: string; total?: number }): boolean {
  const canje = esCanje(t.paquete, t.gift_card) || /^\s*canje\b/i.test(s(t.comp));
  return canje && !(n(t.total) > 0);
}

/** Pagos mixtos: el monto de un método es el total del ticket, salvo desglose que cuadre. */
export function repartirPagos(comp: string, total: number): Record<string, number> {
  const pagos = { efectivo: 0, transferencia: 0, tarjeta: 0, mixto: 0, otros: 0 };
  if (!(total > 0)) return pagos;
  const cb = comp.toLowerCase();
  const mets: string[] = [];
  if (cb.includes("efect")) mets.push("efectivo");
  if (cb.includes("trans") || cb.includes("depósito") || cb.includes("deposito")) mets.push("transferencia");
  if (cb.includes("tarj") || cb.includes("cred") || cb.includes("deb") || cb.includes("datafast") || cb.includes("voucher")) mets.push("tarjeta");
  if (mets.length === 1) pagos[mets[0] as "efectivo"] += total;
  else if (mets.length > 1) {
    const pares: Record<string, number> = {};
    let sum = 0;
    const ms = comp.match(/([a-záéíóú]+)\s*[:=]\s*\$?\s*([\d.,]+)/gi) || [];
    for (const mm of ms) {
      const pp = mm.match(/([a-záéíóú]+)\s*[:=]\s*\$?\s*([\d.,]+)/i);
      if (!pp) continue;
      const mw = pp[1].toLowerCase();
      const val = parseFloat(pp[2].replace(",", ".")) || 0;
      if (val <= 0 || val > total * 1.2 + 1) continue;
      const met = mw.startsWith("efect") ? "efectivo" : mw.startsWith("trans") ? "transferencia" : (mw.startsWith("tarj") || mw.startsWith("cred") || mw.startsWith("deb") ? "tarjeta" : "");
      if (!met) continue;
      pares[met] = (pares[met] || 0) + val;
      sum += val;
    }
    if (sum > 0 && Math.abs(sum - total) <= Math.max(1, total * 0.15)) {
      for (const k of Object.keys(pares)) pagos[k as "efectivo"] += pares[k];
    } else pagos.mixto += total;
  } else pagos.otros += total;
  return pagos;
}

/**
 * SUNSU-15 (Ampolla Especial) guarda uno o más tipos después de " · ",
 * separados por coma: "PDRN" o "PDRN, Hidratación". Un texto viejo sin ese
 * punto ("Ampolla PDRN") sigue siendo una sola ampolla.
 */
export function tiposAmpolla(parte: string): string[] {
  if (!/SUNSU-15\b/i.test(parte)) return [];
  const m = parte.match(/·\s*([^[\]]+)/);
  if (!m) return [];
  return m[1].split(",").map((x) => x.trim()).filter(Boolean);
}

/** Cuántas ampollas cuenta esa parte del extra. El resto de extras cuenta 1. */
export function cantAmpollas(parte: string): number {
  if (!/SUNSU-15\b/i.test(parte)) return 1;
  return tiposAmpolla(parte).length || 1;
}

export function contarExtras(txt: unknown): { n: number; cortesia: number } {
  const raw = s(txt);
  if (!raw || raw.toLowerCase() === "false") return { n: 0, cortesia: 0 };
  let nEx = 0, cortesia = 0;
  for (const p of raw.split("|")) {
    const t = p.trim();
    if (!t) continue;
    const c = cantAmpollas(t);
    if (t.toUpperCase().includes("CORTES")) cortesia += c;
    else nEx += c;
  }
  return { n: nEx + cortesia, cortesia };
}

/** Nombres de extras que sí pagan, repetidos una vez por ampolla. Misma regla que contarExtras, sin las cortesías. */
export function listaExtrasPagados(txt: unknown): string[] {
  const raw = s(txt);
  if (!raw || raw.toLowerCase() === "false") return [];
  const out: string[] = [];
  for (const p of raw.split("|")) {
    const t = p.trim();
    if (!t || t.toUpperCase().includes("CORTES")) continue;
    const c = cantAmpollas(t);
    for (let i = 0; i < c; i++) out.push(t);
  }
  return out;
}

export function validarPromo(mec: string, valor: number, valor2: number, codigos: string[]): string | null {
  const m = mec.toUpperCase();
  if (m === "%") { if (valor <= 0 || valor > 100) return "El % debe estar entre 1 y 100"; }
  else if (m === "$") {
    if (valor <= 0) return "El descuento $ debe ser mayor a 0";
    if (!codigos.length) return "El descuento $ necesita al menos un código";
  } else if (m === "NXM") {
    const N = Math.round(valor), M = Math.round(valor2);
    if (N < 2 || M < 1 || M >= N) return "N×M inválido: N≥2 y M<N (ej: 3×2)";
    if (!codigos.length) return "La promo N×M necesita al menos un código";
  } else if (m === "PACK") {
    if (valor <= 0) return "Falta el precio especial del paquete";
    const ses = Math.round(valor2);
    if (ses < 1 || ses > 6) return "Sesiones a registrar: entre 1 y 6";
    if (codigos.length !== 1) return "Paquete reducido: exactamente 1 código (el paquete)";
  } else return "Mecanismo desconocido: " + m;
  return null;
}

export interface CotLineaIn { sku?: string; nombre?: string; n?: string; tipo?: string; cant?: number; precio?: number; dscMode?: string; dscVal?: number }
export function cotCalcular(lineas: CotLineaIn[], dscMode: string, dscVal: number) {
  let sub = 0, descLinea = 0;
  const out = [];
  for (const ln of lineas) {
    const cant = Math.min(999, parseInt(String(ln.cant), 10) || 0);
    if (!(cant > 0)) continue;
    const nombre = s(ln.nombre || ln.n).slice(0, 120);
    const sku = s(ln.sku).slice(0, 40);
    if (!nombre && !sku) continue;
    const precio = Math.min(999999, Math.max(0, n(ln.precio)));
    const bruto = round2(cant * precio);
    const mode = ln.dscMode === "%" ? "%" : "$";
    const dv = Math.max(0, n(ln.dscVal));
    const desc = mode === "%" ? round2(bruto * Math.min(100, dv) / 100) : Math.min(bruto, round2(dv));
    const neto = round2(bruto - desc);
    sub += bruto; descLinea += desc;
    out.push({ sku, nombre: nombre || sku, tipo: s(ln.tipo).slice(0, 24), cant, precio, dscMode: mode, dscVal: dv, bruto, desc, neto });
  }
  sub = round2(sub);
  descLinea = round2(descLinea);
  const base = round2(Math.max(0, sub - descLinea));
  const modo = dscMode === "%" ? "%" : "$";
  const val = Math.max(0, n(dscVal));
  const descGlobal = modo === "%" ? round2(base * Math.min(100, val) / 100) : Math.min(base, round2(val));
  const descuento = round2(descLinea + descGlobal);
  const total = round2(Math.max(0, sub - descuento));
  const sinIva = round2(total / IVA);
  return { lineas: out, dscMode: modo, dscVal: val, descGlobal, subtotal: sub, descuento, sinIva, iva: round2(total - sinIva), total };
}

export function validarBitacora(body: Row): { error: string } | { items: { codigo: string; nombre: string; cantidad: number }[]; paso2: string; resultado: string; observacion: string } {
  const raw = Array.isArray(body.items) ? body.items as Row[] : [];
  if (!raw.length) return { error: "Agrega al menos un ítem con cantidad" };
  const map = new Map<string, { codigo: string; nombre: string; cantidad: number }>();
  const items: { codigo: string; nombre: string; cantidad: number }[] = [];
  for (const it of raw) {
    const cod = s(it.codigo);
    const cantRaw = it.cantidad;
    const vacio = cantRaw === "" || cantRaw == null;
    const cant = n(cantRaw);
    if (!cod && (vacio || !(cant > 0))) continue;
    if (!cod) return { error: "Elige el ítem en cada línea (o quita la línea vacía)" };
    if (!Number.isFinite(cant) || cant <= 0) return { error: "La cantidad de cada ítem debe ser mayor a 0" };
    if (cant > 9999) return { error: "La cantidad es demasiado alta" };
    const key = cod.toUpperCase();
    const q = Math.round(cant * 1000) / 1000;
    const prev = map.get(key);
    if (prev) prev.cantidad = Math.round((prev.cantidad + q) * 1000) / 1000;
    else {
      const row = { codigo: cod, nombre: s(it.nombre), cantidad: q };
      map.set(key, row); items.push(row);
    }
  }
  if (!items.length) return { error: "Agrega al menos un ítem con cantidad" };
  const si = (v: unknown) => ["SI", "SÍ", "OK", "TRUE", "1"].includes(s(v).toUpperCase()) || v === true;
  if (!si(body.paso1)) return { error: "El paso 1 (limpieza con detergente enzimático) tiene que estar cumplido" };
  const p2raw = s(body.paso2Opcion).toLowerCase();
  const paso2 = p2raw.includes("sabl") ? "Sablón" : p2raw.includes("alcohol") ? "Alcohol" : "";
  if (!paso2) return { error: "En el paso 2 elige Sablón o alcohol" };
  if (!si(body.paso2)) return { error: "Marca el paso 2 como cumplido" };
  if (!si(body.paso3)) return { error: "El paso 3 (secado y esterilización) tiene que estar cumplido" };
  const resRaw = s(body.resultado).toUpperCase();
  const resultado = resRaw.startsWith("OK") ? "OK" : (resRaw.includes("OBS") ? "Observación" : "");
  if (!resultado) return { error: "El resultado debe ser OK u observación" };
  let obs = s(body.observacion).slice(0, 500);
  if (resultado === "OK") obs = "";
  return { items, paso2, resultado, observacion: obs };
}

export interface TarifaProducto { pct: number | null; fijo: number | null }
export interface ComCfg {
  minClientas: number;
  facial2: number;
  facial3: number;
  extra: number;
  pctProd: number;
  recepPor: number;
  recepMin: number;
  recepMinLunes: number;
  niveles: { nivel: number; pct: number; premio: number }[];
  /** Monto por facial cuando esa vigencia pisa el grupo de $2 o $3. */
  facialSku?: Record<string, number>;
  /** % del margen y/o monto fijo por unidad. La clave es el SKU sin SUNSU-. */
  productoSku?: Record<string, TarifaProducto>;
}
/** Una sola palanca: comisión de producto = este % × (venta sin IVA − compra comisión). */
export const PCT_COMISION_PRODUCTO = 0.30;

export const CFG_DEF: ComCfg = {
  minClientas: 60, facial2: 2, facial3: 3, extra: 1, pctProd: PCT_COMISION_PRODUCTO,
  recepPor: 0.50, recepMin: 10, recepMinLunes: 5, niveles: NIVELES,
};

export interface FacialLinea { sku: string; cantidad: number }
export interface PaqueteLinea { tipo: "pack3" | "pack6"; texto: string; neto?: number }
export interface TicketIn {
  fecha: string; cosm: string; cedula: string; facial: string;
  pack3: string; pack6: string; extras: string;
  /** Columna «Paquete?» (SI, 1/3…) y Gift Card, para detectar canje sin cobro. */
  paquete?: string;
  gift_card?: string;
  /** Forma de pago (comp). */
  comp?: string;
  /** Total cobrado (estimado o total beta). 0 = sin cobro. */
  total?: number;
  exclFacial: boolean; exclPaquete: boolean; exclProducto: boolean; exclExtras: boolean;
  productos: { sku: string; qty: number; ventaNeta?: number; compraComision?: number; comision?: number }[];
  /** Precio neto de catálogo del paquete x3. */
  netoPack?: number;
  /** Precio neto de catálogo del paquete x6. Si falta, se usa netoPack. */
  netoPack6?: number;
  /** Todas las líneas faciales no excluidas (cantidad incluida). Si está presente, manda sobre `facial`. */
  faciales?: FacialLinea[];
  /** Todos los paquetes no excluidos del ticket. Si está presente, manda sobre pack3/pack6. */
  paquetes?: PaqueteLinea[];
  /** TK210: 0.5 si el ticket se subió tarde (desde el 21/11/2026); ausente = 1. Aplica a servicios y productos. */
  factor?: number;
}

/** TK210: factor de comisión de un ticket (1 salvo «Subido tarde · 50%»). */
export function factorTk(t: { factor?: number } | null | undefined): number {
  const f = Number(t?.factor);
  return Number.isFinite(f) && f > 0 && f < 1 ? f : 1;
}

/** TK210: comisión de paquetes por tramo con factor por unidad. Cada paquete paga su marginal × factor. */
export function comisionPaquetesTramoFactor(netos: number[], factores: number[], tramos: TramoPaquete[] = TRAMOS_PAQUETE): { monto: number; etiqueta: string } {
  const base = comisionPaquetesTramo(netos.length, tramos, netos);
  if (!factores.some((f) => f < 1)) return base;
  let monto = 0;
  for (let i = 0; i < netos.length; i++) {
    const marg = comisionPaquetesTramo(i + 1, tramos, netos).monto - (i ? comisionPaquetesTramo(i, tramos, netos).monto : 0);
    monto += marg * (factores[i] == null ? 1 : factores[i]);
  }
  return { monto: round2(monto), etiqueta: base.etiqueta };
}
export interface TramoPaquete { desde: number; hasta: number; modo: "fijo" | "pct"; valor: number }
/** Desde el ciclo que abre el 2026-10-26 y hasta el que cierra el 2026-11-25 (10-10-10). pct = fracción (0.05 = 5% del neto), redondeada hacia abajo. */
export const TRAMOS_PAQUETE: TramoPaquete[] = [
  { desde: 1, hasta: 10, modo: "pct", valor: 0.05 },
  { desde: 11, hasta: 20, modo: "pct", valor: 0.08 },
  { desde: 21, hasta: 30, modo: "pct", valor: 0.11 },
  { desde: 31, hasta: 100000, modo: "pct", valor: 0.14 },
];
/** Emilia t970u: a partir del ciclo 26-nov-2026 → 25-dic-2026 (rol de diciembre) los cortes pasan a 12-15-20, con los mismos %. */
export const CICLO_TRAMOS_121520_DESDE = "2026-11-26";
export const TRAMOS_PAQUETE_121520: TramoPaquete[] = [
  { desde: 1, hasta: 12, modo: "pct", valor: 0.05 },
  { desde: 13, hasta: 27, modo: "pct", valor: 0.08 },
  { desde: 28, hasta: 47, modo: "pct", valor: 0.11 },
  { desde: 48, hasta: 100000, modo: "pct", valor: 0.14 },
];
/** Tramos de fábrica del ciclo: 10-10-10 hasta el que abre el 2026-10-26; 12-15-20 desde el 2026-11-26. */
export function tramosPorCiclo(ciclo: string): TramoPaquete[] {
  const c = s(ciclo).slice(0, 10);
  const base = c >= CICLO_TRAMOS_121520_DESDE ? TRAMOS_PAQUETE_121520 : TRAMOS_PAQUETE;
  return base.map((t) => ({ ...t }));
}
/**
 * Base del % de paquetes: subtotal real sin IVA, después de descuentos o ajustes (nunca el total con IVA).
 * Orden: venta neta ya guardada, subtotal de la línea Migo, total de línea / IVA, y solo al final el subtotal de catálogo.
 */
export function netoPaqueteReal(opts: {
  ventaNeta?: number | null;
  migoSubtotal?: number | null;
  totalLinea?: number | null;
  catalogoSubtotal?: number | null;
}): number {
  // Migo primero: refleja el subtotal cobrado, incluso si el descuento se aplicó después del ticket.
  if (n(opts.migoSubtotal) > 0) return round2(n(opts.migoSubtotal));
  if (opts.ventaNeta != null) return round2(Math.max(0, n(opts.ventaNeta)));
  if (n(opts.totalLinea) > 0) return round2(n(opts.totalLinea) / IVA);
  if (n(opts.catalogoSubtotal) > 0) return round2(n(opts.catalogoSubtotal));
  return 0;
}
/** Nº de factura del ticket (fac_7, # FAC o datos.factura), solo dígitos, para cruzar con Migo. */
export function facDigitosDe(r: { fac_7?: unknown; orig?: unknown; datos?: unknown } | null | undefined): string {
  if (!r) return "";
  const o = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  const d = r.datos && typeof r.datos === "object" ? r.datos as Row : {};
  const raw = s(r.fac_7) || s(o["# FAC"]) || s(o.factura) || s(d.factura);
  const last = raw.match(/(\d+)(?:\.0+)?$/);
  if (last) return last[1].replace(/^0+/, "") || "0";
  return raw.replace(/\.0+$/, "").replace(/\D/g, "").replace(/^0+/, "");
}
export type TipoReglaCom = "facial" | "producto" | "base" | "extra" | "recepcion" | "tramo";
export interface ReglaCom {
  tipo: TipoReglaCom;
  clave: string;
  vigente_desde: string;
  monto?: number | null;
  pct?: number | null;
  fijo?: number | null;
  por?: number | null;
  min?: number | null;
  lunes?: number | null;
  desde?: number;
  hasta?: number;
  modo?: "fijo" | "pct";
  valor?: number;
}
export interface CosmMark {
  id: string; nombre: string; patron: string; es: boolean; activa: boolean;
  desde?: string | null; hasta?: string | null;
  /** false = los faciales de esta persona pagan $0. Ausente = sí cobra. */
  comFac?: boolean;
  comFacDesde?: string | null;
}

export function toCosmMark(r: Row): CosmMark {
  const desdeFac = s(r.comision_faciales_desde || r.comFacDesde).slice(0, 10);
  return {
    id: s(r.id),
    nombre: s(r.nombre),
    patron: s(r.patron) || (s(r.nombre) ? s(r.nombre).split(" ")[0] + "%" : ""),
    es: r.es_cosmetologa !== false && r.es !== false,
    activa: r.activa !== false,
    desde: r.desde ? s(r.desde) : null,
    hasta: r.hasta ? s(r.hasta) : null,
    comFac: r.comision_faciales === false || r.comFac === false ? false : true,
    comFacDesde: desdeFac || null,
  };
}

/** Misma coincidencia que el premio de paquetes: primer nombre del patrón, o el id. */
export function marcaDePersona(marks: CosmMark[], cosm: string): CosmMark | undefined {
  const nombre = normNombre(cosm);
  return marks.find((k) => nombre.includes(normNombre(k.patron.replace(/%/g, "")).split(" ")[0]) || nombre.startsWith(normNombre(k.id)));
}

/** TK121: tarifa fija de comisión del facial hecho (la misma de calcularCiclo y del sistema viejo).
 *  No depende del precio cobrado: un canje de paquete, una cortesía o un facial con gift card pagan la tarifa completa. */
export function tarifaFacial(sku: unknown, cfg: Pick<ComCfg, "facial2" | "facial3" | "facialSku"> = CFG_DEF): number {
  const k = facialSku(sku);
  if (!k) return 0;
  const over = cfg.facialSku && cfg.facialSku[k] != null ? cfg.facialSku[k] : null;
  if (over != null) return n(over);
  return FACIALES_2.includes(k) ? cfg.facial2 : FACIALES_3.includes(k) ? cfg.facial3 : 0;
}
/** TK121: comisión congelada de una línea facial (snapshot TK114). Paga la tarifa aunque la línea sea canje en $0. */
export function comisionFacialLinea(l: { sku?: unknown; nombre?: unknown; cantidad?: unknown; excluir?: boolean }, cfg: Pick<ComCfg, "facial2" | "facial3" | "facialSku">, paga: boolean): number {
  if (!paga || l.excluir) return 0;
  const t = tarifaFacial(facialSku(l.sku) || facialSku(l.nombre) || ("SUNSU-" + s(l.sku).replace(/\D/g, "").padStart(2, "0")), cfg);
  return round2(t * Math.max(1, Math.round(n(l.cantidad) || 1)));
}
/** $0 de facial si la marca está apagada o el ticket es anterior a comFacDesde. Sin marca, cobra. */
export function pagaComisionFacial(mark: Pick<CosmMark, "comFac" | "comFacDesde"> | undefined, fecha: string): boolean {
  if (!mark) return true;
  if (mark.comFac === false) return false;
  const desde = s(mark.comFacDesde).slice(0, 10);
  const dia = s(fecha).slice(0, 10);
  if (desde && dia && dia < desde) return false;
  return true;
}

/** SKU de facial o paquete de spa: «40» o «SUNSU-40 …» → SUNSU-40. No toca productos tipo ML-002. */
export function skuSunsu(sku: unknown, nombre?: unknown): string {
  const from = facialSku(nombre) || facialSku(sku);
  if (from) return from;
  const raw = s(sku).toUpperCase().trim();
  const digits = raw.replace(/\D/g, "");
  if (/^\d{1,3}$/.test(digits) && !/[A-Z]{2,3}-/.test(raw)) return "SUNSU-" + digits.padStart(2, "0");
  return skuCode(raw) || raw;
}

/** Líneas faciales que cuentan: el arreglo de la beta, o el facial legado. */
export function facialesDeTicket(t: Pick<TicketIn, "facial" | "faciales" | "exclFacial">): FacialLinea[] {
  if (t.exclFacial) return [];
  if (t.faciales != null) {
    const out: FacialLinea[] = [];
    for (const f of t.faciales) {
      const sku = facialSku(f.sku) || skuSunsu(f.sku);
      const cantidad = Math.max(1, Math.round(n(f.cantidad) || 1));
      if (sku) out.push({ sku, cantidad });
    }
    return out;
  }
  const sku = facialSku(t.facial);
  return sku ? [{ sku, cantidad: 1 }] : [];
}

/** Paquetes que cuentan: el arreglo de la beta, o pack3/pack6 legados. */
export function paquetesDeTicket(t: Pick<TicketIn, "pack3" | "pack6" | "netoPack" | "netoPack6" | "paquetes" | "exclPaquete">): PaqueteLinea[] {
  if (t.exclPaquete) return [];
  if (t.paquetes != null) {
    return t.paquetes.map((p) => ({
      tipo: p.tipo === "pack6" ? "pack6" as const : "pack3" as const,
      texto: s(p.texto),
      neto: Number(p.neto) || 0,
    }));
  }
  const out: PaqueteLinea[] = [];
  if (s(t.pack3) && s(t.pack3).toLowerCase() !== "false") out.push({ tipo: "pack3", texto: s(t.pack3), neto: Number(t.netoPack) || 0 });
  if (s(t.pack6) && s(t.pack6).toLowerCase() !== "false") {
    out.push({ tipo: "pack6", texto: s(t.pack6), neto: t.netoPack6 != null ? Number(t.netoPack6) || 0 : Number(t.netoPack) || 0 });
  }
  return out;
}

export function usaNivelesPaquete(ciclo: string): boolean {
  return ciclo <= CICLO_NIVEL_HASTA;
}

export function normalizarTramos(raw: unknown, ciclo: string = ""): TramoPaquete[] {
  const arr = Array.isArray(raw) ? raw : (raw && typeof raw === "object" && Array.isArray((raw as Row).tramos) ? (raw as Row).tramos as unknown[] : []);
  const out: TramoPaquete[] = [];
  for (const item of arr) {
    if (Array.isArray(item) && item.length >= 3) {
      out.push({ desde: Math.max(1, Math.floor(n(item[0]))), hasta: Math.max(1, Math.floor(n(item[1]))), modo: "fijo", valor: n(item[2]) });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as Row;
    const modo = s(o.modo) === "pct" ? "pct" as const : "fijo" as const;
    const desde = Math.max(1, Math.floor(n(o.desde)));
    const hasta = Math.max(desde, Math.floor(n(o.hasta) || 100000));
    let valor = n(o.valor);
    if (modo === "pct" && valor > 1) valor = valor / 100;
    if (desde > 0 && valor >= 0) out.push({ desde, hasta, modo, valor });
  }
  return out.length ? out.sort((a, b) => a.desde - b.desde) : tramosPorCiclo(ciclo);
}

function etiquetaTramo(u: number, tier: TramoPaquete | undefined): string {
  if (!tier || u <= 0) return "—";
  const rango = tier.hasta >= 100000 ? `${tier.desde}+` : `${tier.desde}–${tier.hasta}`;
  return tier.modo === "pct" ? `${rango} · ${Math.round(tier.valor * 1000) / 10}%` : `${rango} · $${tier.valor}`;
}

/** Tramos desde el ciclo que abre el 2026-10-26. Cada paquete, x3 o x6, es 1 unidad y paga el % de su neto, redondeado hacia abajo. */
export function comisionPaquetesTramo(unidades: number, tramos: TramoPaquete[] = TRAMOS_PAQUETE, netos: number[] = []): { monto: number; etiqueta: string } {
  const u = Math.max(0, Math.floor(Number(unidades) || 0));
  const tarifas = normalizarTramos(tramos);
  let monto = 0;
  let ultimo: TramoPaquete | undefined;
  for (let i = 1; i <= u; i++) {
    const tier = tarifas.find((t) => i >= t.desde && i <= t.hasta) || tarifas[tarifas.length - 1];
    if (!tier) continue;
    ultimo = tier;
    if (tier.modo === "pct") {
      const neto = netos[i - 1] != null ? netos[i - 1] : (netos.length ? netos[netos.length - 1] : 0);
      monto += Math.floor(round2(tier.valor * (neto || 0)) + 1e-9);
    } else monto += tier.valor;
  }
  return { monto: round2(monto), etiqueta: etiquetaTramo(u, ultimo) };
}

/** Cuántos paquetes caen en cada tramo y cuánto suman. Con factores (TK210), la suma es la de comisionPaquetesTramoFactor; si no, la de comisionPaquetesTramo. */
export function desglosePaquetesTramo(unidades: number, tramos: TramoPaquete[] = TRAMOS_PAQUETE, netos: number[] = [], factores: number[] = []): { desde: number; hasta: number; pct: number | null; n: number; monto: number }[] {
  const u = Math.max(0, Math.floor(Number(unidades) || 0));
  const tarifas = normalizarTramos(tramos);
  const orden: { desde: number; hasta: number; modo: "fijo" | "pct"; valor: number; n: number; monto: number }[] = [];
  const porDesde = new Map<number, (typeof orden)[number]>();
  for (let i = 1; i <= u; i++) {
    const tier = tarifas.find((t) => i >= t.desde && i <= t.hasta) || tarifas[tarifas.length - 1];
    if (!tier) continue;
    let b = porDesde.get(tier.desde);
    if (!b) {
      b = { desde: tier.desde, hasta: tier.hasta, modo: tier.modo, valor: tier.valor, n: 0, monto: 0 };
      porDesde.set(tier.desde, b);
      orden.push(b);
    }
    b.n++;
    let add = 0;
    if (tier.modo === "pct") {
      const neto = netos[i - 1] != null ? netos[i - 1] : (netos.length ? netos[netos.length - 1] : 0);
      add = Math.floor(round2(tier.valor * (neto || 0)) + 1e-9);
    } else add = tier.valor;
    const fx = factores[i - 1] == null ? 1 : factores[i - 1];
    b.monto += add * fx;
  }
  const out = orden.map((b) => ({
    desde: b.desde,
    hasta: b.hasta,
    pct: b.modo === "pct" ? Math.round(b.valor * 1000) / 10 : null,
    n: b.n,
    monto: round2(b.monto),
  }));
  const objetivo = factores.some((f) => f < 1)
    ? comisionPaquetesTramoFactor(netos.slice(0, u), factores.slice(0, u), tarifas).monto
    : comisionPaquetesTramo(u, tarifas, netos).monto;
  const suma = round2(out.reduce((a, t) => a + t.monto, 0));
  if (out.length && suma !== objetivo) out[out.length - 1].monto = round2(out[out.length - 1].monto + (objetivo - suma));
  return out;
}

export function nombreEsAdmin(nombre: string, admins: { nombre?: string; short?: string; id?: string }[]): boolean {
  const a = normNombre(nombre);
  if (!a) return false;
  const firstA = a.split(" ")[0] || "";
  for (const ad of admins) {
    for (const raw of [ad.nombre, ad.short, ad.id]) {
      const b = normNombre(raw);
      if (!b || b.length < 3) continue;
      const firstB = b.split(" ")[0] || "";
      if (a === b || a === firstB || b === firstA) return true;
      if (a.startsWith(firstB + " ") || b.startsWith(firstA + " ")) return true;
      if (firstA.length >= 3 && firstB.length >= 3 && (firstA.startsWith(firstB) || firstB.startsWith(firstA))) return true;
    }
  }
  return false;
}

export function nCosmetologas(marks: CosmMark[], ciclo: string, fin: string, override?: number | null): number {
  if (override && override > 0) return override;
  if (usaNivelesPaquete(ciclo)) return N_CABINAS;
  return marks.filter((k) => k.es
    && (!k.desde || k.desde <= fin)
    && (!k.hasta || k.hasta >= ciclo)
    && (k.activa || !!k.hasta)).length;
}

/** Costo que entra a la comisión. La compra real (inventario) no se usa aquí. */
export function compraParaComision(row: { compra_comision?: unknown; precio_compra?: unknown } | null | undefined): number {
  if (!row) return 0;
  if (row.compra_comision != null && row.compra_comision !== "") return n(row.compra_comision);
  return n(row.precio_compra);
}

export function comisionProductos(
  items: { venta: number; compra: number; qty: number; excluido: boolean; sku?: string; comisionFija?: number; factor?: number }[],
  pct = PCT_COMISION_PRODUCTO,
  porSku?: ComCfg["productoSku"],
): number {
  let t = 0;
  for (const it of items) {
    if (it.excluido) continue;
    // TK210: «Subido tarde · 50%» multiplica la comisión del producto de ese ticket.
    const fx = factorTk(it);
    // Canje / venta 0: no genera margen. Si el snapshot trae comisión fija (ciclo abierto, detalle sin ceros), se respeta.
    if (!(it.venta > 0)) {
      if (n(it.comisionFija) > 0) t += n(it.comisionFija) * fx;
      continue;
    }
    const over = it.sku && porSku ? porSku[skuCode(it.sku)] : undefined;
    // TK161: piso 0, igual que comisionUnidad. Una venta descontada bajo el costo de comisión no genera comisión negativa.
    const margen = Math.max(0, (it.venta - (it.compra || 0)) * it.qty);
    if (over && (over.pct != null || over.fijo != null)) {
      if (over.pct != null) t += margen * over.pct * fx;
      if (over.fijo != null) t += over.fijo * it.qty * fx;
    } else t += margen * pct * fx;
  }
  return round2(t);
}

/** La vigencia que manda en un ciclo es la última con fecha <= al inicio del ciclo. Sin filas, siguen los valores de fábrica. */
export function cfgDesdeReglas(reglas: ReglaCom[], ciclo: string, tramosKv: unknown): { cfg: ComCfg; tramos: TramoPaquete[] } {
  const sirve = (r: ReglaCom) => s(r.vigente_desde).slice(0, 10) <= ciclo;
  const ultimas = (tipo: TipoReglaCom) => {
    const map = new Map<string, ReglaCom>();
    const rows = reglas.filter((r) => r.tipo === tipo && sirve(r)).sort((a, b) => s(a.vigente_desde).localeCompare(s(b.vigente_desde)));
    for (const r of rows) map.set(r.clave, r);
    return map;
  };
  const porFacial: Record<string, number> = {};
  for (const [k, r] of ultimas("facial")) porFacial[facialSku(k) || k] = n(r.monto);
  const porProducto: Record<string, TarifaProducto> = {};
  for (const [k, r] of ultimas("producto")) {
    porProducto[skuCode(k)] = {
      pct: r.pct == null ? null : n(r.pct),
      fijo: r.fijo == null ? null : n(r.fijo),
    };
  }
  const base = ultimas("base").get("base");
  const extra = ultimas("extra").get("extra");
  const recep = ultimas("recepcion").get("recepcion");
  const cfg: ComCfg = {
    ...CFG_DEF,
    extra: extra ? n(extra.monto) : CFG_DEF.extra,
    pctProd: base ? (n(base.pct) > 1 ? n(base.pct) / 100 : n(base.pct)) : CFG_DEF.pctProd,
    recepPor: recep ? n(recep.por) : CFG_DEF.recepPor,
    recepMin: recep ? n(recep.min) : CFG_DEF.recepMin,
    recepMinLunes: recep ? n(recep.lunes) : CFG_DEF.recepMinLunes,
    facialSku: porFacial, productoSku: porProducto,
  };
  const tramoRows = reglas.filter((r) => r.tipo === "tramo" && sirve(r));
  let tramos: TramoPaquete[];
  if (tramoRows.length) {
    const fecha = tramoRows.map((r) => s(r.vigente_desde).slice(0, 10)).sort().pop() || ciclo;
    tramos = normalizarTramos(tramoRows.filter((r) => s(r.vigente_desde).slice(0, 10) === fecha));
  } else {
    const kvTiene = !!(tramosKv && ((Array.isArray(tramosKv) && tramosKv.length) || (typeof tramosKv === "object" && Array.isArray((tramosKv as { tramos?: unknown[] }).tramos) && (tramosKv as { tramos: unknown[] }).tramos.length)));
    tramos = kvTiene && ciclo < CICLO_TRAMOS_121520_DESDE ? normalizarTramos(tramosKv, ciclo) : tramosPorCiclo(ciclo);
  }
  return { cfg, tramos };
}

/** Rol de recepcionista (comisión de recepción). No incluye admin ni gerencia. */
export function esRolRecepcionista(rol: unknown): boolean {
  const r = s(rol).trim().toLowerCase();
  return r === "recepcion" || r === "reception";
}

/** Cruza nombre/id/corto con usuarios que tienen rol de recepcionista. */
export function personaEsRecepcionista(
  nombre: string,
  users: { id?: unknown; nombre?: unknown; short?: unknown; rol?: unknown; bloqueado?: unknown }[] = [],
): boolean {
  const key = normNombre(nombre);
  if (!key) return false;
  const first = key.split(" ")[0] || key;
  for (const u of users) {
    if (b(u.bloqueado) || !esRolRecepcionista(u.rol)) continue;
    const nomb = normNombre(u.nombre);
    const sh = normNombre(u.short);
    const id = normNombre(u.id);
    if (nomb === key || sh === key || id === key) return true;
    if (first.length >= 3 && (nomb === first || sh === first || id === first || nomb.startsWith(first + " ") || sh.startsWith(first + " "))) return true;
    if (nomb && (key === nomb || key.startsWith(nomb + " "))) return true;
  }
  return false;
}

export function comisionRecepcionDia(fecha: string, ticketsConFacial: number, cfg: ComCfg = CFG_DEF): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const umbral = dow === 1 ? cfg.recepMinLunes : cfg.recepMin;
  return ticketsConFacial >= umbral ? round2(ticketsConFacial * cfg.recepPor) : 0;
}

/** Espejo de v_comisiones_total + metas. Hasta el ciclo que cierra el 2026-10-25, N = 3 cabinas. Un admin no entra. */
export function calcularCiclo(
  tickets: TicketIn[], marks: CosmMark[], cfg: ComCfg, ciclo: string, overrideN?: number | null,
  admins: { nombre?: string; short?: string; id?: string }[] = [],
  tramos: TramoPaquete[] = TRAMOS_PAQUETE,
) {
  const fin = cicloFin(ciclo);
  const admin = (nombre: string) => nombreEsAdmin(nombre, admins);
  const marksLimpios = marks.map((k) => (admin(k.nombre) || admin(k.id) || admin(k.patron) ? { ...k, es: false } : k));
  const propios = tickets.filter((t) => t.fecha >= ciclo && t.fecha <= fin && !esInterno(t.cosm, t.cedula) && !admin(t.cosm));
  const totalClientas = propios.filter((t) => facialesDeTicket(t).length > 0).length;
  const n = Math.max(1, nCosmetologas(marksLimpios, ciclo, fin, overrideN));
  const bono = totalClientas >= cfg.minClientas;
  const regimen = usaNivelesPaquete(ciclo) ? "nivel" as const : "tramo" as const;
  const metas = cfg.niveles.map((nv) => ({
    ...nv,
    meta: Math.ceil(totalClientas * nv.pct / n),
  }));
  const tarifas = normalizarTramos(tramos);
  const by = new Map<string, {
    cosm: string; faciales: number; faciales2: number; faciales3: number; comFaciales: number; paquetes: number; extras: number; comExtras: number;
    comProductos: number; totalProductos: number; comPaquetes: number; nivel: string; netos: number[]; factores: number[];
    /** TK210: lo que se dejó de pagar por tickets subidos tarde (faciales + extras + paquetes; productos aparte). */
    tardeFaciales: number; tardeExtras: number; ticketsTarde: number;
  }>();
  const ensure = (cosm: string) => {
    let r = by.get(cosm);
    if (!r) {
      r = { cosm, faciales: 0, faciales2: 0, faciales3: 0, comFaciales: 0, paquetes: 0, extras: 0, comExtras: 0, comProductos: 0, totalProductos: 0, comPaquetes: 0, nivel: "—", netos: [], factores: [], tardeFaciales: 0, tardeExtras: 0, ticketsTarde: 0 };
      by.set(cosm, r);
    }
    return r;
  };
  for (const t of propios) {
    const r = ensure(t.cosm);
    const fx = factorTk(t);
    if (fx < 1) r.ticketsTarde += 1;
    const cobraFacial = pagaComisionFacial(marcaDePersona(marksLimpios, t.cosm), t.fecha);
    for (const f of facialesDeTicket(t)) {
      const sku = f.sku;
      const overFacial = cfg.facialSku && cfg.facialSku[sku] != null ? cfg.facialSku[sku] : null;
      if (!(FACIALES_2.includes(sku) || FACIALES_3.includes(sku) || overFacial != null)) continue;
      r.faciales += f.cantidad;
      if (FACIALES_2.includes(sku)) r.faciales2 += f.cantidad;
      else if (FACIALES_3.includes(sku)) r.faciales3 += f.cantidad;
      if (cobraFacial) {
        const full = tarifaFacial(sku, cfg) * f.cantidad;
        r.comFaciales += full * fx;
        if (fx < 1) r.tardeFaciales += full * (1 - fx);
      }
    }
    if (!t.exclPaquete) {
      for (const pk of paquetesDeTicket(t)) {
        const neto = Number(pk.neto) || 0;
        if (pk.tipo === "pack6" && regimen === "nivel") { r.paquetes += 2; r.netos.push(neto, neto); r.factores.push(fx, fx); }
        else { r.paquetes += 1; r.netos.push(neto); r.factores.push(fx); }
      }
    }
    if (!t.exclExtras && !esCanjeSinCobro(t)) {
      const ex = contarExtras(t.extras);
      const pagados = ex.n - ex.cortesia;
      r.extras += pagados;
      r.comExtras += pagados * cfg.extra * fx;
      if (fx < 1) r.tardeExtras += pagados * cfg.extra * (1 - fx);
    }
  }
  const personas = [...by.values()].map((r) => {
    const mark = marcaDePersona(marksLimpios, r.cosm);
    const es = !!(mark && mark.es);
    const first = normNombre(r.cosm).split(" ")[0];
    const congelado = ciclo === BONO_N8_CICLO && (first === "andrea" || first === "daniela");
    let nivel = "—", premio = 0, next: { nivel: string; faltan: number; premio: number } | null = null;
    let tardePaquetes = 0;
    if (congelado) {
      nivel = "N8";
      premio = BONO_N8;
    } else if (regimen === "tramo") {
      const tramo = comisionPaquetesTramo(es ? r.paquetes : 0, tarifas, es ? r.netos : []);
      nivel = es ? tramo.etiqueta : "—";
      premio = es ? tramo.monto : 0;
      // TK210: un paquete de un ticket subido tarde paga el 50% de su marginal (sigue contando para el tramo).
      if (es && r.factores.some((f) => f < 1)) {
        const conFx = comisionPaquetesTramoFactor(r.netos, r.factores, tarifas).monto;
        tardePaquetes = round2(premio - conFx);
        premio = conFx;
      }
    } else if (bono && es) {
      for (const m of metas) {
        if (r.paquetes >= m.meta) { nivel = "N" + m.nivel; premio = m.premio; }
        else if (!next) next = { nivel: "N" + m.nivel, faltan: m.meta - r.paquetes, premio: m.premio };
      }
    } else if (bono) {
      for (const m of metas) {
        if (r.paquetes < m.meta) { next = { nivel: "N" + m.nivel, faltan: m.meta - r.paquetes, premio: m.premio }; break; }
      }
    }
    r.comPaquetes = premio;
    r.nivel = nivel;
    return {
      ...r, es, congelado, next, comFaciales: round2(r.comFaciales), comExtras: round2(r.comExtras), comPaquetes: round2(premio),
      tardeFaciales: round2(r.tardeFaciales), tardeExtras: round2(r.tardeExtras), tardePaquetes, tardeProductos: 0,
    };
  });
  return { ciclo, fin, totalClientas, n, bono, metas, regimen, personas, tramos: tarifas };
}

export function ciclosEntre(desde: string, hasta: string): string[] {
  let c = cicloInicio(desde);
  const fin = cicloInicio(hasta);
  const out: string[] = [];
  let guard = 0;
  while (c <= fin && guard < 36) {
    out.push(c);
    const [y, m] = c.split("-").map(Number);
    c = ymdUtc(new Date(Date.UTC(y, m, 26)));
    guard++;
  }
  return out.length ? out : [cicloInicio(desde)];
}

export function rolCalcular(input: {
  sueldo: number; bono: number; fondoReserva: boolean; fechaIngreso: string;
  anio: number; mes: number; diasLaborados?: number | null; diasPeriodo?: number | null;
  hrsSupl?: number; hrsExtr?: number; hrsDesc?: number;
  anticipo?: number; hip?: number; quir?: number; sandalo?: number;
  comFaciales: number; comExtras: number; comRecepcion: number; comProductos: number; comPaquetes: number;
  multas: number; iessPct?: number; fondoDesde?: string | null; vacacionesDesdeAnio?: number;
}) {
  const fin = new Date(Date.UTC(input.anio, input.mes, 0));
  const diasMes = input.diasPeriodo && input.diasPeriodo > 0 ? input.diasPeriodo : fin.getUTCDate();
  const finYmd = ymdUtc(fin);
  const sueldo = input.sueldo;
  const costoH = sueldo / 240;
  const dias = input.diasLaborados;
  const sp = dias != null && dias < diasMes ? round2(sueldo / diasMes * dias) : sueldo;
  const ext = round2((input.hrsSupl || 0) * costoH * 1.5) + round2(((input.hrsExtr || 0) + (input.hrsDesc || 0)) * costoH * 2);
  const com = round2(input.comFaciales + input.comExtras + input.comRecepcion + input.comProductos + input.comPaquetes);
  const aport = round2(sp + input.bono + com + ext);
  const ingTs = new Date(input.fechaIngreso).getTime();
  const finTs = Date.UTC(input.anio, input.mes - 1, diasMes);
  const anios = (finTs - ingTs) / (365.25 * 86400 * 1000);
  const t13 = round2(aport / 12);
  const t14 = round2(482 / 12);
  const vac = anios >= (input.vacacionesDesdeAnio == null ? 1 : input.vacacionesDesdeAnio) ? round2(sueldo / 24) : 0;
  const fondoListo = input.fondoDesde ? finYmd >= input.fondoDesde : anios >= 1;
  const fr = input.fondoReserva && fondoListo ? round2(sueldo / 12) : 0;
  const ing = round2(sp + input.bono + com + ext + t13 + t14 + fr + vac);
  const iess = round2(aport * (input.iessPct == null ? 0.0945 : input.iessPct));
  const egr = round2(iess + (input.anticipo || 0) + (input.hip || 0) + (input.quir || 0) + (input.sandalo || 0) + input.multas);
  return {
    periodo: finYmd.slice(0, 7), anios: round2(anios), sueldo: sp, bono: input.bono, horasExtra: ext,
    comisiones: com, comFaciales: input.comFaciales, comPaquetes: input.comPaquetes, comProductos: input.comProductos,
    dec13: t13, dec14: t14, fondoReserva: fr, vacaciones: vac,
    totalIngresos: ing, iess, egresos: egr, totalRecibir: round2(ing - egr), ingresoAportable: aport,
  };
}

/** Recorte al centavo inferior, como FLOOR de las celdas M/O/Q del rol RRHH. */
export function floorCent(x: number): number {
  return Math.floor((Number(x) + Number.EPSILON) * 100) / 100;
}

/** Salario básico usado en el décimo cuarto del generador RRHH (fórmula fija =482/12). */
export const SBU_ROL = 482;
export const IESS_PERSONAL_PCT = 0.0945;
export const IESS_PATRONAL_PCT = 0.1115;
export const SECAP_PCT = 0.005;
export const IECE_PCT = 0.005;
export const FONDO_RESERVA_PCT = 0.0833;
/** Contribución CCC (Ley: Código Orgánico Monetario y Financiero): 1 % del aportable. La paga la empresa, no se descuenta a la empleada. */
export const CCC_PCT = 0.01;

export type RolOficialIn = {
  sueldoBase: number; bono: number; faltas: number;
  hrsSupl?: number; hrsExtr?: number; hrsDesc?: number;
  anticipo?: number; hip?: number; quir?: number; sandalo?: number; multas?: number;
  comFaciales: number; comExtras: number; comRecepcion: number; comProductos: number; comPaquetes: number;
  fondoReserva: boolean; fechaIngreso?: string; anio?: number; mes?: number;
  /** TK166: false = la persona pidió el décimo ACUMULADO (no se paga en el rol del mes; se provisiona). */
  dec13Mensual?: boolean; dec14Mensual?: boolean; fondoMensual?: boolean;
};

export type RolOficialOut = {
  sueldo: number; bono: number;
  comFaciales: number; comExtras: number; comRecepcion: number;
  comFacialesExtrasRecep: number; comPaquetes: number; comProductos: number; comisiones: number;
  hrsSupl: number; valSupl: number; hrsExtr: number; valExtr: number; hrsDesc: number; valDesc: number;
  ingresoAportable: number; dec13: number; dec14: number; fondoReserva: number;
  dec13Mensual: boolean; dec14Mensual: boolean; fondoMensual: boolean;
  dec13Acumulado: number; dec14Acumulado: number; fondoReservaIess: number;
  totalIngresos: number; iess: number; anticipo: number; prestHip: number; prestQuir: number;
  prestOtro: number; multas: number; egresos: number; totalEgresos: number; totalRecibir: number;
  iessPatronal: number; secap: number; iece: number; aportePatronal: number; aportePatronalPct: number;
  ccc: number; cccPct: number;
  costoEmpresa: number;
  fondoFactor: number; fondoDesde: string;
};

/**
 * Motor del rol mensual RRHH (pestaña MES_AÑO). No usa rolCalcular del beta:
 * sueldo con divisor 30, extras con FLOOR, fondo = A×0.0833, sin vacaciones mensualizadas.
 */
/** Fondo de reserva de un mes: 0 antes del año de servicio, 1 con el año cumplido, fracción en el mes del aniversario. */
export function fondoFactorMes(fechaIngreso: string, anio: number, mes: number): { factor: number; desde: string } {
  const m = String(fechaIngreso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { factor: 0, desde: "" };
  const aniv = new Date(Date.UTC(Number(m[1]) + 1, Number(m[2]) - 1, Number(m[3])));
  const desde = aniv.toISOString().slice(0, 10);
  const ini = Date.UTC(anio, mes - 1, 1), fin = Date.UTC(anio, mes, 0);
  if (aniv.getTime() > fin) return { factor: 0, desde };
  if (aniv.getTime() <= ini) return { factor: 1, desde };
  const dia = Math.min(30, aniv.getUTCDate());
  return { factor: Math.round(((30 - dia + 1) / 30) * 1e6) / 1e6, desde };
}

export function rolCalcularOficial(input: RolOficialIn): RolOficialOut {
  const sueldoBase = Number(input.sueldoBase) || 0;
  const faltas = Math.max(0, Number(input.faltas) || 0);
  const sueldo = round2(sueldoBase - (sueldoBase / 30) * faltas);
  const bono = Number(input.bono) || 0;
  const hrsSupl = Number(input.hrsSupl) || 0;
  const hrsExtr = Number(input.hrsExtr) || 0;
  const hrsDesc = Number(input.hrsDesc) || 0;
  const valSupl = floorCent(hrsSupl * sueldoBase / 240 * 1.5);
  const valExtr = floorCent(hrsExtr * sueldoBase / 240 * 2);
  const valDesc = floorCent(hrsDesc * sueldoBase / 240 * 2);
  const comFaciales = Number(input.comFaciales) || 0;
  const comExtras = Number(input.comExtras) || 0;
  const comRecepcion = Number(input.comRecepcion) || 0;
  const comPaquetes = Number(input.comPaquetes) || 0;
  const comProductos = Number(input.comProductos) || 0;
  const comFacialesExtrasRecep = comFaciales + comExtras + comRecepcion;
  const comisiones = round2(comFacialesExtrasRecep + comPaquetes + comProductos);
  const A = sueldo + bono + comFacialesExtrasRecep + comPaquetes + comProductos + valSupl + valExtr + valDesc;
  const dec13 = A / 12;
  const dec14 = SBU_ROL / 12;
  // DEV-31b (Emilia t907u): el fondo corre desde que cumple 1 año de la fecha de ingreso (aniversario inclusive).
  // El mes del aniversario se prorratea por días comerciales (30): días desde el aniversario hasta fin de mes ÷ 30.
  let fondoFactor = input.fondoReserva ? 1 : 0;
  let fondoDesde = "";
  if (fondoFactor && input.fechaIngreso && input.anio && input.mes) {
    const f = fondoFactorMes(input.fechaIngreso, input.anio, input.mes);
    fondoFactor = f.factor; fondoDesde = f.desde;
  }
  const fondoCalc = A * FONDO_RESERVA_PCT * fondoFactor;
  // Mensualizado (por defecto, Art. 111/113 CT) se paga en el rol; acumulado se provisiona y no suma.
  const dec13Mensual = input.dec13Mensual !== false, dec14Mensual = input.dec14Mensual !== false, fondoMensual = input.fondoMensual !== false;
  const dec13Pago = dec13Mensual ? dec13 : 0, dec14Pago = dec14Mensual ? dec14 : 0;
  const fondoReserva = fondoMensual ? fondoCalc : 0;
  const totalIngresos = A + dec13Pago + dec14Pago + fondoReserva;
  const iess = A * IESS_PERSONAL_PCT;
  const anticipo = Number(input.anticipo) || 0;
  const prestHip = Number(input.hip) || 0;
  const prestQuir = Number(input.quir) || 0;
  const prestOtro = Number(input.sandalo) || 0;
  const multas = Number(input.multas) || 0;
  const egresos = anticipo + prestHip + prestQuir + prestOtro + multas;
  const totalEgresos = iess + egresos;
  const totalRecibir = totalIngresos - totalEgresos;
  const iessPatronal = round2(A * IESS_PATRONAL_PCT);
  const secap = round2(A * SECAP_PCT);
  const iece = round2(A * IECE_PCT);
  const aportePatronal = round2(iessPatronal + secap + iece);
  const ccc = round2(A * CCC_PCT);
  return {
    sueldo, bono, comFaciales, comExtras, comRecepcion, comFacialesExtrasRecep, comPaquetes, comProductos, comisiones,
    hrsSupl, valSupl, hrsExtr, valExtr, hrsDesc, valDesc,
    ingresoAportable: A, dec13: dec13Pago, dec14: dec14Pago, fondoReserva,
    dec13Mensual, dec14Mensual, fondoMensual,
    dec13Acumulado: dec13Mensual ? 0 : round2(dec13), dec14Acumulado: dec14Mensual ? 0 : round2(dec14),
    fondoReservaIess: fondoMensual ? 0 : round2(fondoCalc),
    totalIngresos, iess, anticipo, prestHip, prestQuir, prestOtro, multas, egresos, totalEgresos, totalRecibir,
    iessPatronal, secap, iece, aportePatronal, aportePatronalPct: 0.1215,
    ccc, cccPct: CCC_PCT,
    costoEmpresa: round2(totalIngresos + aportePatronal + ccc),
    fondoFactor, fondoDesde,
  };
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function newSalt(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const USO_FIELDS = [
  ["uso_1", "fecha_1"], ["uso_2", "fecha_2"], ["uso_3", "fecha_3"],
  ["uso4", "fecha_4"], ["uso_5", "fecha_5"], ["uso_6", "fecha_6"],
] as const;

export const BETA_TABLES = [
  "tickets", "clientas_registro", "clientas_antiguas", "paquetes", "gift_cards",
  "catalogo", "inventario_entradas", "inventario_fisico", "proveedores", "ordenes_compra",
  "promos", "propinas", "envios_tarjetas", "multas_descuentos", "permisos", "caja_chica",
  "cabina_inventario", "cabina_bitacora", "cabina_activos", "cabina_protocolos",
  "cabina_ordenes", "cabina_bajas", "cabina_traspasos", "cotizaciones",
] as const;

/** Ticket cancelado/anulado (orig.anulado, lo conserva el trigger tickets_zzz_cancelado): no suma en totales, comisiones ni dashboard. */
export function esCancelado(r: Row | null | undefined): boolean {
  const o = r && r.orig && typeof r.orig === "object" ? r.orig as Row : null;
  return !!o && (o.anulado === true || o.cancelado === true);
}

/** TK81 (Emilia 18/11): diferencias de redondeo de hasta $0.05 no dejan saldo pendiente. */
export const TOL_SALDO = 0.05;
export function saldoPendiente(total: number, pagado: number): number {
  const x = Math.round((Number(total || 0) - Number(pagado || 0)) * 100) / 100;
  return x > TOL_SALDO ? x : 0;
}
