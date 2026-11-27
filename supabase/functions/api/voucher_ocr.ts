// TK157 (Emilia t696u): lectura automática con Claude Vision de vouchers de tarjeta y capturas de transferencias,
// y cruce del monto leído contra el total del ticket / pago y la factura Migo vinculada. Nunca bloquea la subida:
// si la lectura falla o se pasa del tiempo, la foto queda guardada con ocr.estado = "error".
import { n, round2, s, type Row } from "./domain.ts";

export const MODELO_OCR = "claude-haiku-4-5-20251001";
export const TOLERANCIA_VOUCHER = 0.05;
export const TIMEOUT_OCR_MS = 15000;
const TIPOS = new Set(["voucher_tarjeta", "transferencia", "deuna", "efectivo", "otro", "no_legible"]);
const CONF = new Set(["alta", "media", "baja"]);

export type OcrVoucher = {
  estado: "ok" | "error";
  tipo: string;
  monto: number | null;
  referencia: string | null;
  fecha: string | null;
  hora: string | null;
  banco_red: string | null;
  ultimos4: string | null;
  confianza: string;
  resumen: string;
  modelo?: string;
  leido_at?: string;
  error?: string;
};

export const PROMPT_OCR = `Eres un lector de comprobantes de pago de un spa en Ecuador (USD). Mira la imagen: puede ser un voucher de datáfono (Medianet, Datafast, etc.), una captura de transferencia bancaria (Banco Pichincha, Produbanco, Guayaquil, Pacífico...), un pago DeUna o algo que no es un comprobante.
Responde SOLO un objeto JSON estricto (sin texto extra, sin markdown) con estas claves:
{"tipo":"voucher_tarjeta|transferencia|deuna|efectivo|otro|no_legible","monto":número decimal o null (monto TOTAL cobrado/transferido en USD),"referencia":string o null (número de referencia, transacción, lote, autorización o comprobante; prioriza REF/Referencia),"fecha":"YYYY-MM-DD" o null,"hora":"HH:MM" o null,"banco_red":string o null (ej. "Medianet · Visa Debit", "Banco Pichincha", "DeUna"),"ultimos4":"4 dígitos" o null (NUNCA el número completo de la tarjeta),"confianza":"alta|media|baja","resumen":"1 línea corta en español, ej. Medianet Visa Debit · $30.00 · Ref 000970 · 19/11/2026"}
No inventes datos: si algo no se lee, pon null. Si la imagen no es legible, tipo "no_legible".`;

function ocrError(msg: string, modelo?: string, now?: Date): OcrVoucher {
  return { estado: "error", tipo: "no_legible", monto: null, referencia: null, fecha: null, hora: null, banco_red: null, ultimos4: null, confianza: "baja", resumen: "No se pudo leer el voucher", error: msg.slice(0, 160), ...(modelo ? { modelo } : {}), ...(now ? { leido_at: now.toISOString() } : {}) };
}

function montoNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? round2(v) : null;
  let t = s(v).replace(/[^\d.,-]/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = /,\d{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "");
  const x = Number(t);
  return Number.isFinite(x) && x >= 0 ? round2(x) : null;
}
function fechaIso(v: unknown): string | null {
  const t = s(v).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}
function horaHm(v: unknown): string | null {
  const m = s(v).trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? m[1].padStart(2, "0") + ":" + m[2] : null;
}
const txt = (v: unknown, max = 80): string | null => { const t = s(v).trim(); return t && !/^null$/i.test(t) ? t.slice(0, max) : null; };

/** Parsea la respuesta del modelo (JSON puro o envuelto en ```json … ```). Nunca lanza. */
export function parsearRespuestaOcr(texto: unknown, modelo?: string, now?: Date): OcrVoucher {
  const raw = s(texto).trim();
  if (!raw) return ocrError("Respuesta vacía", modelo, now);
  let j: Row | null = null;
  const cand = [raw, (raw.match(/```(?:json)?\s*([\s\S]*?)```/i) || [])[1], (raw.match(/\{[\s\S]*\}/) || [])[0]].filter(Boolean) as string[];
  for (const c of cand) { try { const v = JSON.parse(c.trim()); if (v && typeof v === "object" && !Array.isArray(v)) { j = v as Row; break; } } catch { /* siguiente */ } }
  if (!j) return ocrError("Respuesta no es JSON", modelo, now);
  const tipo = TIPOS.has(s(j.tipo)) ? s(j.tipo) : "otro";
  const u4m = s(j.ultimos4).replace(/\D/g, "");
  const out: OcrVoucher = {
    estado: "ok", tipo,
    monto: montoNum(j.monto),
    referencia: txt(j.referencia, 40),
    fecha: fechaIso(j.fecha), hora: horaHm(j.hora),
    banco_red: txt(j.banco_red, 60),
    ultimos4: u4m.length >= 4 ? u4m.slice(-4) : null,
    confianza: CONF.has(s(j.confianza)) ? s(j.confianza) : "media",
    resumen: (txt(j.resumen, 140) || "").replace(/\b\d{12,19}\b/g, "****"),
    ...(modelo ? { modelo } : {}), ...(now ? { leido_at: now.toISOString() } : {}),
  };
  if (!out.resumen) out.resumen = [out.banco_red, out.monto != null ? "$" + out.monto.toFixed(2) : "", out.referencia ? "Ref " + out.referencia : ""].filter(Boolean).join(" · ") || "Comprobante";
  return out;
}

export function base64DeBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export type OpcionesOcr = { apiKey?: string; modelo?: string; fetchImpl?: typeof fetch; timeoutMs?: number; now?: Date };
/** Envía la imagen a Claude Vision (/v1/messages) y devuelve el JSON normalizado. Nunca lanza ni expone la clave. */
export async function leerVoucherConClaude(imageBytes: Uint8Array | string, mimeType: string, op: OpcionesOcr = {}): Promise<OcrVoucher> {
  const modelo = op.modelo || MODELO_OCR, now = op.now || new Date();
  const mime = /^image\/(jpeg|png|webp|gif)$/.test(s(mimeType)) ? s(mimeType) : "";
  if (!mime) return ocrError("Solo fotos (JPG, PNG o WebP)", modelo, now);
  if (!op.apiKey) return ocrError("Falta ANTHROPIC_API_KEY", modelo, now);
  const data = typeof imageBytes === "string" ? imageBytes : base64DeBytes(imageBytes);
  if (!data) return ocrError("Imagen vacía", modelo, now);
  const f = op.fetchImpl || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), op.timeoutMs ?? TIMEOUT_OCR_MS);
  try {
    const res = await f("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": op.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: modelo, max_tokens: 400, temperature: 0,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mime, data } },
          { type: "text", text: PROMPT_OCR },
        ] }],
      }),
    });
    if (!res.ok) return ocrError("Claude respondió " + res.status, modelo, now);
    const j = await res.json() as Row;
    const t = (Array.isArray(j.content) ? j.content as Row[] : []).filter((c) => s(c.type) === "text").map((c) => s(c.text)).join("\n");
    return parsearRespuestaOcr(t, modelo, now);
  } catch (e) {
    const abort = e && typeof e === "object" && (e as Row).name === "AbortError";
    return ocrError(abort ? "Tiempo de lectura agotado" : "Error de red al leer el voucher", modelo, now);
  } finally {
    clearTimeout(timer);
  }
}

export type AbonoVoucher = {
  ticket_clave?: string;
  desde_ticket?: string;
  factura?: string | null;
  monto: number;
  referencia?: string | null;
  url?: string | null;
  por?: string;
  at?: string;
};
export type ContextoCruce = {
  totalTicket?: number | null;
  totalFacturaMigo?: number | null;
  facturaMigo?: string | null;
  /** Monto del pago al que está amarrado el voucher (pago parcial). */
  montoPago?: number | null;
  /** Montos atribuibles de los OTROS vouchers vivos del mismo ticket + abonos recibidos de otros tickets. */
  otrosMontos?: number[];
  /** Parte de ESTA foto que queda en este ticket (monto OCR menos abonos asignados a otros tickets). */
  montoAtribuible?: number | null;
  tolerancia?: number;
};
export type Cruce = {
  estado: "cuadra" | "descuadre" | "parcial" | "ilegible" | "pendiente";
  descuadre_ticket: boolean; diff_ticket: number;
  descuadre_factura: boolean; diff_factura: number;
  monto: number | null; objetivo_ticket: number | null; total_factura: number | null; suma_vouchers: number | null;
  monto_atribuible?: number | null;
  mensaje: string;
};
const $ = (v: number) => "$" + Math.abs(v).toFixed(2);
const sg = (d: number) => (d >= 0 ? "+" : "-") + $(d);

/** Parte de un comprobante que cuenta en ESTE ticket (OCR menos abonos a otros tickets). */
export function montoAtribuibleDe(item: Row): number {
  const o = item.ocr && typeof item.ocr === "object" ? item.ocr as Row : null;
  const bruto = o && o.monto != null ? n(o.monto) : 0;
  const abonos = Array.isArray(item.abonos) ? item.abonos as Row[] : [];
  const sal = abonos.reduce((a, x) => a + Math.max(0, n(x.monto)), 0);
  return round2(Math.max(0, bruto - sal));
}
export function claveRefVoucher(item: Row): string {
  const o = item.ocr && typeof item.ocr === "object" ? item.ocr as Row : (item as Row);
  const ref = s(o.referencia || item.referencia);
  if (ref) return "r:" + ref;
  const url = s(item.url);
  return url ? "u:" + url : "";
}

/** Suma, sin repetir la misma referencia, de lo atribuible en este ticket más abonos recibidos de otros. */
export function sumaVouchersTicket(comps: Row[], abonosRecibidos: Row[] = []): { suma: number; nItems: number; refs: string[] } {
  const vistos = new Set<string>();
  let suma = 0, nItems = 0;
  const refs: string[] = [];
  for (const x of comps || []) {
    const o = x.ocr && typeof x.ocr === "object" ? x.ocr as Row : null;
    if (!o || s(o.estado) !== "ok" || !(n(o.monto) > 0)) continue;
    const key = claveRefVoucher(x);
    if (key && vistos.has(key)) continue;
    if (key) vistos.add(key);
    const m = montoAtribuibleDe(x);
    if (!(m > 0)) continue;
    suma = round2(suma + m);
    nItems++;
    if (s(o.referencia)) refs.push(s(o.referencia));
  }
  for (const a of abonosRecibidos || []) {
    if (!(n(a.monto) > 0)) continue;
    const ref = s(a.referencia);
    const key = ref ? "r:" + ref : (s(a.url) ? "u:" + s(a.url) : "");
    if (key && vistos.has(key)) continue;
    if (key) vistos.add(key);
    suma = round2(suma + n(a.monto));
    nItems++;
    if (ref) refs.push(ref);
  }
  return { suma, nItems, refs };
}

function fotoYSuma(foto: number, suma: number, haySuma: boolean): string {
  if (haySuma && Math.abs(round2(foto - suma)) > 0.005) return "esta foto $" + foto.toFixed(2) + " · en este ticket suman $" + suma.toFixed(2);
  return "voucher $" + foto.toFixed(2);
}

/** Cruce puro del monto leído (o su parte atribuible) contra ticket/pago y factura Migo (tolerancia $0.05). */
export function cruzarVoucherConTicket(ocr: Partial<OcrVoucher> | null | undefined, c: ContextoCruce = {}): Cruce {
  const tol = c.tolerancia ?? TOLERANCIA_VOUCHER;
  const base = { descuadre_ticket: false, diff_ticket: 0, descuadre_factura: false, diff_factura: 0, monto: null as number | null, objetivo_ticket: null as number | null, total_factura: null as number | null, suma_vouchers: null as number | null, monto_atribuible: null as number | null };
  if (!ocr || ocr.estado === "error") return { ...base, estado: "pendiente", mensaje: ocr && ocr.error ? "Sin lectura: " + ocr.error : "Voucher sin leer" };
  const monto = ocr.monto == null ? null : n(ocr.monto);
  if (ocr.tipo === "no_legible" || monto == null || !(monto > 0)) return { ...base, estado: "ilegible", mensaje: "No se pudo leer el monto del voucher" };
  const propio = c.montoAtribuible != null && n(c.montoAtribuible) >= 0 ? round2(n(c.montoAtribuible)) : monto;
  const otros = (c.otrosMontos || []).map(n).filter((x) => x > 0);
  const haySuma = otros.length > 0 || Math.abs(round2(propio - monto)) > 0.005;
  const suma = round2(propio + otros.reduce((a, x) => a + x, 0));
  const pago = n(c.montoPago) > 0 ? round2(n(c.montoPago)) : 0;
  const tk = n(c.totalTicket) > 0 ? round2(n(c.totalTicket)) : 0;
  const fac = n(c.totalFacturaMigo) > 0 ? round2(n(c.totalFacturaMigo)) : 0;
  const out: Cruce = { ...base, estado: "cuadra", monto, monto_atribuible: propio, objetivo_ticket: pago || tk || null, total_factura: fac || null, suma_vouchers: haySuma ? suma : null, mensaje: "" };
  const facN = c.facturaMigo ? " " + (s(c.facturaMigo).split("-").pop() || "").replace(/^0+/, "") : "";
  let parcial = false;
  // Ticket (o el pago parcial al que está amarrado).
  if (pago) {
    const d = round2(propio - pago);
    if (Math.abs(d) > tol) { out.descuadre_ticket = true; out.diff_ticket = d; }
  } else if (tk) {
    const d1 = round2(propio - tk), ds = round2(suma - tk);
    if (Math.abs(d1) <= tol || (haySuma && Math.abs(ds) <= tol)) { /* cuadra solo o sumado */ }
    else if (ds < -tol && propio < tk) { parcial = true; out.diff_ticket = ds; }
    else { out.descuadre_ticket = true; out.diff_ticket = haySuma ? ds : d1; }
  }
  // Factura Migo vinculada (todos los vouchers del ticket pagan la misma factura).
  if (fac) {
    const x = haySuma ? suma : propio, d = round2(x - fac);
    const okFac = Math.abs(round2(propio - fac)) <= tol || Math.abs(d) <= tol;
    const parcialFac = d < -tol && (parcial || (!!pago && !out.descuadre_ticket));
    if (!okFac && !parcialFac) { out.descuadre_factura = true; out.diff_factura = d; }
  }
  if (!pago && !tk && !fac) return { ...out, estado: "pendiente", mensaje: "Leído $" + monto.toFixed(2) + " · ticket sin total para cruzar" };
  const etq = fotoYSuma(monto, suma, haySuma && !pago);
  if (out.descuadre_ticket || out.descuadre_factura) {
    out.estado = "descuadre";
    const partes: string[] = [];
    if (out.descuadre_ticket) partes.push("Descuadre: " + (pago ? "voucher $" + monto.toFixed(2) : etq) + " vs " + (pago ? "pago $" + pago.toFixed(2) : "ticket $" + tk.toFixed(2)) + " (" + sg(out.diff_ticket) + ")");
    if (out.descuadre_factura) partes.push((partes.length ? "" : "Descuadre: ") + etq + " vs factura Migo" + facN + " $" + fac.toFixed(2) + " (" + sg(out.diff_factura) + ")");
    out.mensaje = partes.join(" · ");
  } else if (parcial) {
    out.estado = "parcial";
    out.mensaje = "Pago parcial: " + (haySuma ? "en este ticket suman" : "voucher") + " $" + suma.toFixed(2) + " de $" + tk.toFixed(2) + " (falta " + $(out.diff_ticket) + ")";
  } else {
    const ref = pago || tk || fac;
    const con = [pago ? "el pago" : tk ? "ticket" : "", fac ? "factura" : ""].filter(Boolean).join(" y ");
    out.mensaje = haySuma && !pago
      ? "Esta foto $" + monto.toFixed(2) + ". En este ticket suman $" + suma.toFixed(2) + " y cuadra con " + con + " ($" + suma.toFixed(2) + ")"
      : "Voucher cuadra con " + con + " ($" + (haySuma && !pago ? suma : ref).toFixed(2) + ")";
  }
  return out;
}

/** Cruce del ticket completo (suma de refs únicas + abonos recibidos) vs total y factura. */
export function cruzarTicketVouchers(comps: Row[], c: ContextoCruce & { abonosRecibidos?: Row[] } = {}): Cruce {
  const { suma, nItems } = sumaVouchersTicket(comps, c.abonosRecibidos || []);
  if (!(suma > 0) && !nItems) return { estado: "pendiente", descuadre_ticket: false, diff_ticket: 0, descuadre_factura: false, diff_factura: 0, monto: null, objetivo_ticket: c.totalTicket != null ? n(c.totalTicket) || null : null, total_factura: c.totalFacturaMigo != null ? n(c.totalFacturaMigo) || null : null, suma_vouchers: null, mensaje: "Sin vouchers leídos" };
  return cruzarVoucherConTicket({ estado: "ok", tipo: "voucher_tarjeta", monto: suma }, { ...c, montoAtribuible: suma, otrosMontos: [] });
}

/** Ficha liviana para la lista / alertas (sin datos sensibles). */
export function resumenOcr(item: Row): Row | null {
  const o = item.ocr && typeof item.ocr === "object" ? item.ocr as Row : null;
  const c = item.cruce && typeof item.cruce === "object" ? item.cruce as Row : null;
  if (!o && !c) return null;
  return { estado: c ? s(c.estado) : "pendiente", monto: o && o.monto != null ? n(o.monto) : null, referencia: o ? s(o.referencia) || null : null, banco_red: o ? s(o.banco_red) || null : null, fecha: o ? s(o.fecha) || null : null, mensaje: c ? s(c.mensaje) : s(o?.resumen) };
}
