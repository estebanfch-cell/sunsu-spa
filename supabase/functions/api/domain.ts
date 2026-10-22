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
export const PACK_X3 = ["SUNSU-17","SUNSU-18","SUNSU-19","SUNSU-20","SUNSU-21","SUNSU-22","SUNSU-29","SUNSU-44","SUNSU-45","SUNSU-46","SUNSU-47","SUNSU-53","SUNSU-55","SUNSU-58"];
export const PACK_X6 = ["SUNSU-23","SUNSU-24","SUNSU-25","SUNSU-26","SUNSU-27","SUNSU-28","SUNSU-30","SUNSU-48","SUNSU-49","SUNSU-50","SUNSU-51","SUNSU-54","SUNSU-56","SUNSU-59"];
export const VENTAS_DESDE = "2026-05-22";
export const ADMIN = ["admin", "admin_master", "super_admin"];
export const RECEP = ["admin", "admin_master", "super_admin", "gerente", "reception", "recepcion"];
export const ALL_ROLES = [
  "super_admin", "admin", "admin_master", "gerente",
  "recepcion", "reception", "cosmetologa", "asistente_cosmetologia", "staff",
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

export function normCedula(v: unknown): string {
  return s(v).split(".")[0].replace(/[^0-9]/g, "").replace(/^0+/, "");
}
export function normNombre(v: unknown): string {
  return s(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}
export function skuCode(v: unknown): string {
  return s(v).toUpperCase().replace(/^SUNSU-/, "");
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
  return !c || c.toUpperCase() === "SUNSU" || normCedula(cedula) === CEDULA_INTERNA;
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

export function contarExtras(txt: unknown): { n: number; cortesia: number } {
  const raw = s(txt);
  if (!raw || raw.toLowerCase() === "false") return { n: 0, cortesia: 0 };
  let nEx = 0, cortesia = 0;
  for (const p of raw.split("|")) {
    const t = p.trim();
    if (!t) continue;
    if (t.toUpperCase().includes("CORTES")) cortesia++;
    else nEx++;
  }
  return { n: nEx + cortesia, cortesia };
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
}
export const CFG_DEF: ComCfg = {
  minClientas: 60, facial2: 2, facial3: 3, extra: 1, pctProd: 0.30,
  recepPor: 0.50, recepMin: 10, recepMinLunes: 5, niveles: NIVELES,
};

export interface TicketIn {
  fecha: string; cosm: string; cedula: string; facial: string;
  pack3: string; pack6: string; extras: string;
  exclFacial: boolean; exclPaquete: boolean; exclProducto: boolean; exclExtras: boolean;
  productos: { sku: string; qty: number }[];
  /** 1 = comisión completa. Una gift card parcial la escala a lo cobrado del facial. */
  gcRatio?: number;
}
export interface CosmMark { id: string; nombre: string; patron: string; es: boolean; activa: boolean; desde?: string | null; hasta?: string | null }

export function nCosmetologas(marks: CosmMark[], ciclo: string, fin: string, override?: number | null): number {
  if (override && override > 0) return override;
  return marks.filter((k) => k.es
    && (!k.desde || k.desde <= fin)
    && (!k.hasta || k.hasta >= ciclo)
    && (k.activa || !!k.hasta)).length;
}

export function comisionProductos(items: { venta: number; compra: number; qty: number; excluido: boolean }[], pct = 0.3): number {
  let t = 0;
  for (const it of items) {
    if (it.excluido || !(it.venta > 0)) continue;
    t += (it.venta - (it.compra || 0)) * it.qty * pct;
  }
  return round2(t);
}

export function comisionRecepcionDia(fecha: string, ticketsConFacial: number, cfg: ComCfg = CFG_DEF): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const umbral = dow === 1 ? cfg.recepMinLunes : cfg.recepMin;
  return ticketsConFacial >= umbral ? round2(ticketsConFacial * cfg.recepPor) : 0;
}

/** Espejo de v_comisiones_total + metas. N = cosmetólogas marcadas (no quien tenga tickets). */
export function calcularCiclo(tickets: TicketIn[], marks: CosmMark[], cfg: ComCfg, ciclo: string, overrideN?: number | null) {
  const fin = cicloFin(ciclo);
  const propios = tickets.filter((t) => t.fecha >= ciclo && t.fecha <= fin && !esInterno(t.cosm, t.cedula));
  const totalClientas = propios.filter((t) => facialSku(t.facial)).length;
  const n = Math.max(1, nCosmetologas(marks, ciclo, fin, overrideN));
  const bono = totalClientas >= cfg.minClientas;
  const metas = cfg.niveles.map((nv) => ({
    ...nv,
    meta: Math.ceil(totalClientas * nv.pct / n),
  }));
  const by = new Map<string, {
    cosm: string; faciales: number; comFaciales: number; paquetes: number; extras: number; comExtras: number;
    comProductos: number; totalProductos: number; comPaquetes: number; nivel: string;
  }>();
  const ensure = (cosm: string) => {
    let r = by.get(cosm);
    if (!r) {
      r = { cosm, faciales: 0, comFaciales: 0, paquetes: 0, extras: 0, comExtras: 0, comProductos: 0, totalProductos: 0, comPaquetes: 0, nivel: "—" };
      by.set(cosm, r);
    }
    return r;
  };
  for (const t of propios) {
    const r = ensure(t.cosm);
    const sku = facialSku(t.facial);
    if (sku && !t.exclFacial && (FACIALES_2.includes(sku) || FACIALES_3.includes(sku))) {
      r.faciales++;
      const ratio = t.gcRatio == null ? 1 : t.gcRatio;
      r.comFaciales += (FACIALES_2.includes(sku) ? cfg.facial2 : cfg.facial3) * ratio;
    }
    if (!t.exclPaquete) {
      if (s(t.pack3) && s(t.pack3).toLowerCase() !== "false") r.paquetes += 1;
      if (s(t.pack6) && s(t.pack6).toLowerCase() !== "false") r.paquetes += 2;
    }
    if (!t.exclExtras) {
      const ex = contarExtras(t.extras);
      const pagados = ex.n - ex.cortesia;
      r.extras += pagados;
      r.comExtras += pagados * cfg.extra;
    }
  }
  const personas = [...by.values()].map((r) => {
    const mark = marks.find((k) => normNombre(r.cosm).includes(normNombre(k.patron.replace(/%/g, "")).split(" ")[0]) || normNombre(r.cosm).startsWith(normNombre(k.id)));
    const es = !!(mark && mark.es);
    let nivel = "—", premio = 0, next: { nivel: string; faltan: number; premio: number } | null = null;
    if (bono && es) {
      for (const m of metas) {
        if (r.paquetes >= m.meta) { nivel = "N" + m.nivel; premio = m.premio; }
        else if (!next) next = { nivel: "N" + m.nivel, faltan: m.meta - r.paquetes, premio: m.premio };
      }
    } else if (bono) {
      for (const m of metas) {
        if (r.paquetes < m.meta) { next = { nivel: "N" + m.nivel, faltan: m.meta - r.paquetes, premio: m.premio }; break; }
      }
    }
    r.comPaquetes = bono && es ? premio : 0;
    r.nivel = nivel;
    return { ...r, es, next, comFaciales: round2(r.comFaciales), comExtras: round2(r.comExtras) };
  });
  return { ciclo, fin, totalClientas, n, bono, metas, personas };
}

export function rolCalcular(input: {
  sueldo: number; bono: number; fondoReserva: boolean; fechaIngreso: string;
  anio: number; mes: number; diasLaborados?: number | null;
  hrsSupl?: number; hrsExtr?: number; hrsDesc?: number;
  anticipo?: number; hip?: number; quir?: number; sandalo?: number;
  comFaciales: number; comExtras: number; comRecepcion: number; comProductos: number; comPaquetes: number;
  multas: number;
}) {
  const fin = new Date(Date.UTC(input.anio, input.mes, 0));
  const diasMes = fin.getUTCDate();
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
  const vac = anios >= 1 ? round2(sueldo / 24) : 0;
  const fr = input.fondoReserva && anios >= 1 ? round2(sueldo / 12) : 0;
  const ing = round2(sp + input.bono + com + ext + t13 + t14 + fr + vac);
  const iess = round2(aport * 0.0945);
  const egr = round2(iess + (input.anticipo || 0) + (input.hip || 0) + (input.quir || 0) + (input.sandalo || 0) + input.multas);
  return {
    periodo: finYmd.slice(0, 7), anios: round2(anios), sueldo: sp, bono: input.bono, horasExtra: ext,
    comisiones: com, comFaciales: input.comFaciales, comPaquetes: input.comPaquetes, comProductos: input.comProductos,
    dec13: t13, dec14: t14, fondoReserva: fr, vacaciones: vac,
    totalIngresos: ing, iess, egresos: egr, totalRecibir: round2(ing - egr), ingresoAportable: aport,
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
