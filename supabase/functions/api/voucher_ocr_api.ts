// TK157: Claude Vision al subir voucher/transferencia + re-escaneo manual + alertas de descuadre para el Dashboard.
import { catMap, extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { n, round2, s, type Row } from "./domain.ts";
import { totalValorTicket } from "./ticket_lista_card.ts";
import { consultar } from "./query.ts";
import { leerSerie } from "./series.ts";
import { claveDe } from "./ticket_beta.ts";
import { veTicket } from "./inline_api.ts";
import { OCR_HOOK, archivoIdDe, compsVivos, ticketPorClave, canjeFacial } from "./tickets_beta_api.ts";
import { MODELO_OCR, cruzarVoucherConTicket, leerVoucherConClaude, resumenOcr, type ContextoCruce, type OcrVoucher } from "./voucher_ocr.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const env = (ctx: Ctx) => (ctx.env || {}) as Record<string, string | undefined>;
export const ocrActivo = (ctx: Ctx) => !!env(ctx).ANTHROPIC_API_KEY;

/** Total del ticket: líneas (o hint del detalle), nunca el estimado/cobrado de la hoja. */
export async function contextoVoucher(ctx: Ctx, r: Row, cab: Row | undefined, item: Row, comps: Row[], totalHint?: number): Promise<ContextoCruce> {
  const d = (cab?.datos || {}) as Row;
  let totalTicket = n(totalHint) > 0 ? n(totalHint) : 0;
  if (!(totalTicket > 0) && cab && cab.lineas_beta === true && n(cab.total) > 0) totalTicket = n(cab.total);
  if (!(totalTicket > 0)) {
    const map = await catMap(ctx);
    totalTicket = totalValorTicket(r, { cab, map, canje: canjeFacial(r) });
  }
  if (!(totalTicket > 0)) totalTicket = n(r.estimado);
  let facturaMigo: string | null = null, totalFacturaMigo: number | null = null;
  const pm = d.pago_migo && typeof d.pago_migo === "object" ? d.pago_migo as Row : null;
  if (pm && s(pm.factura) && n(pm.total) > 0) { facturaMigo = s(pm.factura); totalFacturaMigo = n(pm.total); }
  if (!facturaMigo && r.id != null) {
    try {
      const L = (await consultar(ctx.db, "beta_cuadre_link", { filtros: [{ col: "ticket_id", op: "eq", val: r.id as number }] })).rows.find((x) => s(x.factura) && n(x.total_factura) > 0);
      if (L) { facturaMigo = s(L.factura); totalFacturaMigo = n(L.total_factura); }
    } catch { /* sin cuadre */ }
  }
  let montoPago: number | null = null;
  if (s(item.pago_id)) {
    const pg = (await todas(ctx, "beta_pagos")).find((x) => s(x.id) === s(item.pago_id) && x.anulado !== true);
    if (pg) montoPago = n(pg.monto);
  } else if (n(item._monto_pago) > 0) montoPago = n(item._monto_pago);
  const vistos = new Set<string>([s((item.ocr as Row | undefined)?.referencia)].filter(Boolean));
  const otrosMontos: number[] = [];
  for (const x of comps) {
    if (x === item || s(x.url) === s(item.url)) continue;
    const o = x.ocr as Row | undefined;
    if (!o || s(o.estado) !== "ok" || !(n(o.monto) > 0)) continue;
    const ref = s(o.referencia);
    if (ref && vistos.has(ref)) continue; // la misma foto subida 2 veces no suma doble
    if (ref) vistos.add(ref);
    otrosMontos.push(n(o.monto));
  }
  return { totalTicket: round2(totalTicket), totalFacturaMigo, facturaMigo, montoPago, otrosMontos };
}

async function leer(ctx: Ctx, b64: string, mime: string): Promise<OcrVoucher> {
  return await leerVoucherConClaude(b64, mime, { apiKey: env(ctx).ANTHROPIC_API_KEY, modelo: env(ctx).ANTHROPIC_MODEL || MODELO_OCR, fetchImpl: ctx.fetchImpl, now: ctx.now });
}

// Al subir: agregarComprobante llama este hook antes de guardar (la foto se guarda pase lo que pase).
OCR_HOOK.leer = async (ctx, r, cab, datos, item, img, extra) => {
  if (!ocrActivo(ctx)) return;
  const m = img.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return;
  try {
    const ocr = await leer(ctx, m[2], m[1]);
    item.ocr = ocr;
    if (extra && n(extra.montoPago) > 0) item._monto_pago = n(extra.montoPago);
    const c = await contextoVoucher(ctx, r, cab ? { ...cab, datos } : { datos }, item, compsVivos(datos), n(extra?.total));
    item.cruce = { ...cruzarVoucherConTicket(ocr, c), at: ctx.now.toISOString() };
    delete item._monto_pago;
  } catch (e) {
    item.ocr = { estado: "error", tipo: "no_legible", monto: null, referencia: null, confianza: "baja", resumen: "No se pudo leer el voucher", error: e instanceof Error ? e.message.slice(0, 120) : "error" };
    item.cruce = { estado: "pendiente", mensaje: "Voucher sin leer" };
  }
};

/** Re-escanear (o escanear por primera vez) un voucher ya subido. Sin url: el último sin lectura; todos:true → todos. */
extend("tk_leer_voucher", "any", async (p, ctx, ses) => {
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso para ese ticket" };
  if (!ocrActivo(ctx)) return { error: "Falta configurar la lectura automática (ANTHROPIC_API_KEY)" };
  const clave = claveDe(r, leerSerie(r, "so_num"));
  const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
  if (!cab) return { error: "El ticket no tiene vouchers subidos" };
  const datos = { ...((cab.datos || {}) as Row) };
  const L = Array.isArray(datos.comprobantes) ? datos.comprobantes as Row[] : [];
  const vivos = compsVivos(datos);
  const url = s(p.url);
  const objetivos = url ? vivos.filter((x) => s(x.url) === url) : p.todos === true ? vivos : [...vivos].reverse().filter((x) => !x.ocr || s((x.ocr as Row).estado) !== "ok").slice(0, 1);
  if (!objetivos.length) return { error: url ? "Voucher no encontrado" : "No hay vouchers por leer" };
  const out: Row[] = [];
  for (const item of objetivos.slice(0, 6)) {
    const id = archivoIdDe(item.url);
    if (!/^archivo:/.test(s(item.url))) { out.push({ url: s(item.url), error: "Solo se leen fotos subidas a la app" }); continue; }
    const f = (await consultar(ctx.db, "app_archivos", { cols: ["id", "mime", "data_b64"], filtros: [{ col: "id", op: "eq", val: id }], limite: 1 }).catch(() => ({ rows: [] as Row[] }))).rows[0];
    if (!f || !s(f.data_b64)) { out.push({ url: s(item.url), error: "Archivo no encontrado" }); continue; }
    const ocr = await leer(ctx, s(f.data_b64), s(f.mime) || "image/jpeg");
    const hit = L.find((x) => s(x.url) === s(item.url) && x.borrado !== true) || item;
    hit.ocr = ocr;
    const c = await contextoVoucher(ctx, r, { ...cab, datos }, hit, compsVivos(datos), n(p.total));
    hit.cruce = { ...cruzarVoucherConTicket(ocr, c), at: ctx.now.toISOString() };
    out.push({ url: s(hit.url), pago_id: s(hit.pago_id) || null, ocr: hit.ocr, cruce: hit.cruce });
  }
  const actor = actorOf(ses);
  if (p.solo_leer !== true) {
    await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos, actualizado_por: actor, updated_at: ctx.now.toISOString() });
    try { await logAccion(ctx.db, actor, "VOUCHER LEER", clave + " · " + out.map((x) => s((x.cruce as Row | undefined)?.estado) || s(x.error)).join(", ")); } catch { /* ok */ }
  }
  return { ok: true, clave, items: out, ...(out[0] ? { ocr: out[0].ocr, cruce: out[0].cruce, url: out[0].url } : {}) };
});

/** Descuadres de voucher en tickets activos (para «⚠️ Alertas» del Dashboard). Solo admin. */
export function alertasDescuadre(cabs: Row[], anulados: Set<string>): Row[] {
  const out: Row[] = [];
  for (const c of cabs) {
    const clave = s(c.clave);
    if (!clave || anulados.has(clave)) continue;
    for (const x of compsVivos((c.datos || {}) as Row)) {
      const cr = x.cruce as Row | undefined;
      if (!cr || s(cr.estado) !== "descuadre") continue;
      const o = (x.ocr || {}) as Row;
      const det = [n(o.monto) > 0 ? "Voucher $" + n(o.monto).toFixed(2) : "", n(cr.objetivo_ticket) > 0 ? (n((cr as Row).objetivo_ticket) && cr.descuadre_ticket ? "Ticket $" + n(cr.objetivo_ticket).toFixed(2) : "") : "", cr.descuadre_factura && n(cr.total_factura) > 0 ? "Factura Migo $" + n(cr.total_factura).toFixed(2) : ""].filter(Boolean).join(" vs ");
      out.push({ key: "voucher:" + clave + ":" + archivoIdDe(x.url), clave, url: s(x.url), texto: "Descuadre voucher " + clave, detalle: det || s(cr.mensaje), mensaje: s(cr.mensaje), fecha: s(x.fecha), href: "#/m/tickets/t/" + encodeURIComponent(clave) });
    }
  }
  return out.sort((a, b) => s(b.fecha).localeCompare(s(a.fecha))).slice(0, 25);
}
extend("voucher_alertas", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { ok: true, items: [] };
  const cabs = (await todas(ctx, "beta_tickets")).filter((c) => compsVivos((c.datos || {}) as Row).some((x) => s((x.cruce as Row | undefined)?.estado) === "descuadre"));
  if (!cabs.length) return { ok: true, items: [] };
  const anulados = new Set<string>();
  for (const c of cabs) {
    const r = await ticketPorClave(ctx, s(c.clave));
    if (!r || (r.orig && typeof r.orig === "object" && (r.orig as Row).anulado === true) || r.borrado_at) anulados.add(s(c.clave));
  }
  return { ok: true, items: alertasDescuadre(cabs, anulados) };
});

export { resumenOcr };
