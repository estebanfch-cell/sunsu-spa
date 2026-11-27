// TK157: Claude Vision al subir voucher/transferencia + re-escaneo manual + alertas de descuadre para el Dashboard.
import { catMap, extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { esRecepcion } from "./borradores_asig.ts";
import { n, round2, s, ymdUtc, type Row } from "./domain.ts";
import { totalValorTicket } from "./ticket_lista_card.ts";
import { consultar } from "./query.ts";
import { leerSerie } from "./series.ts";
import { claveDe } from "./ticket_beta.ts";
import { veTicket } from "./inline_api.ts";
import { OCR_HOOK, archivoIdDe, compsVivos, ticketPorClave, canjeFacial, FALTA_DESDE, hayFactura, faltaFacturaTicket, esPagoDirecto } from "./tickets_beta_api.ts";
import { MODELO_OCR, cruzarTicketVouchers, cruzarVoucherConTicket, claveRefVoucher, leerVoucherConClaude, montoAtribuibleDe, resumenOcr, type ContextoCruce, type OcrVoucher } from "./voucher_ocr.ts";

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
  const recibidos = Array.isArray(d.abonos_recibidos) ? d.abonos_recibidos as Row[] : [];
  const esteRef = claveRefVoucher(item);
  const vistos = new Set<string>([esteRef].filter(Boolean));
  const otrosMontos: number[] = [];
  for (const x of comps) {
    if (x === item || s(x.url) === s(item.url)) continue;
    const o = x.ocr as Row | undefined;
    if (!o || s(o.estado) !== "ok" || !(n(o.monto) > 0)) continue;
    const key = claveRefVoucher(x);
    if (key && vistos.has(key)) continue; // la misma referencia no suma doble
    if (key) vistos.add(key);
    const m = montoAtribuibleDe(x);
    if (m > 0) otrosMontos.push(m);
  }
  for (const a of recibidos) {
    if (!(n(a.monto) > 0)) continue;
    const key = s(a.referencia) ? "r:" + s(a.referencia) : (s(a.url) ? "u:" + s(a.url) : "");
    if (key && vistos.has(key)) continue;
    if (key) vistos.add(key);
    otrosMontos.push(n(a.monto));
  }
  const montoAtribuible = montoAtribuibleDe({ ...item, ocr: item.ocr || {} });
  return { totalTicket: round2(totalTicket), totalFacturaMigo, facturaMigo, montoPago, otrosMontos, montoAtribuible };
}

export function abonosRecibidosDe(datos: Row | undefined): Row[] {
  const d = (datos || {}) as Row;
  return Array.isArray(d.abonos_recibidos) ? (d.abonos_recibidos as Row[]).filter((x) => x && n(x.monto) > 0) : [];
}

/** Recalcula el cruce de cada voucher vivo y el cruce del ticket (sin repetir el OCR). */
export async function recomputarCrucesTicket(ctx: Ctx, r: Row, cab: Row | undefined, datos: Row, totalHint?: number): Promise<void> {
  const vivos = compsVivos(datos);
  const now = (ctx.now || new Date()).toISOString();
  const cab2 = cab ? { ...cab, datos } : { datos };
  for (const item of vivos) {
    const ocr = item.ocr && typeof item.ocr === "object" ? item.ocr as Partial<OcrVoucher> : null;
    if (!ocr) { item.cruce = { estado: "pendiente", mensaje: "Voucher sin leer", at: now }; continue; }
    const c = await contextoVoucher(ctx, r, cab2, item, vivos, totalHint);
    item.cruce = { ...cruzarVoucherConTicket(ocr, c), at: now };
  }
  const base = vivos[0] ? await contextoVoucher(ctx, r, cab2, vivos[0], vivos, totalHint) : await contextoVoucher(ctx, r, cab2, {}, vivos, totalHint);
  datos.cruce_ticket = { ...cruzarTicketVouchers(vivos, { ...base, abonosRecibidos: abonosRecibidosDe(datos) }), at: now };
}

OCR_HOOK.recomputar = async (ctx, r, cab, datos, totalHint) => {
  await recomputarCrucesTicket(ctx, r, cab, datos, totalHint);
};

OCR_HOOK.trasQuitar = async (ctx, ses, r, cab, datos, hit) => {
  const actor = actorOf(ses);
  const now = (ctx.now || new Date()).toISOString();
  const claveOrigen = claveDe(r, leerSerie(r, "so_num"));
  const abonos = Array.isArray(hit.abonos) ? hit.abonos as Row[] : [];
  for (const a of abonos) {
    const destClave = s(a.ticket_clave);
    if (!destClave || destClave === claveOrigen) continue;
    const destCab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === destClave);
    if (!destCab) continue;
    const destDatos = { ...((destCab.datos || {}) as Row) };
    const rec = Array.isArray(destDatos.abonos_recibidos) ? destDatos.abonos_recibidos as Row[] : [];
    destDatos.abonos_recibidos = rec.filter((x) => !(s(x.url) === s(hit.url) || (s(x.referencia) && s(x.referencia) === s((hit.ocr as Row | undefined)?.referencia) && s(x.desde_ticket) === claveOrigen)));
    const destTk = await ticketPorClave(ctx, destClave);
    if (destTk) await recomputarCrucesTicket(ctx, destTk, { ...destCab, datos: destDatos }, destDatos);
    const hist = [...(Array.isArray(destCab.historial) ? destCab.historial as Row[] : []), { fecha: now, actor, accion: "documento", detalle: "se retiró un abono de " + claveOrigen }].slice(-100);
    await ctx.db.write(actor, "beta_tickets", "update", { clave: destClave }, { datos: destDatos, historial: hist, actualizado_por: actor, updated_at: now });
  }
  await recomputarCrucesTicket(ctx, r, cab, datos);
};

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
    await recomputarCrucesTicket(ctx, r, cab ? { ...cab, datos } : { datos }, datos, n(extra?.total));
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
    out.push({ url: s(hit.url), pago_id: s(hit.pago_id) || null, ocr: hit.ocr });
  }
  await recomputarCrucesTicket(ctx, r, { ...cab, datos }, datos, n(p.total));
  for (const x of out) {
    const hit = L.find((y) => s(y.url) === s(x.url) && y.borrado !== true);
    if (hit) { x.ocr = hit.ocr; x.cruce = hit.cruce; }
  }
  const actor = actorOf(ses);
  let tardeAuto: Row | undefined;
  if (p.solo_leer !== true) {
    await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos, actualizado_por: actor, updated_at: ctx.now.toISOString() });
    try { await logAccion(ctx.db, actor, "VOUCHER LEER", clave + " · " + out.map((x) => s((x.cruce as Row | undefined)?.estado) || s(x.error)).join(", ")); } catch { /* ok */ }
    // TK212: el voucher leído es de un día anterior a la subida → «Subido tarde» (solo tickets desde el deploy de TK210).
    try { const { evaluarTardeAuto } = await import("./tarde_auto.ts"); tardeAuto = (await evaluarTardeAuto(ctx, actor, { ids: [n(r.id)] }))[0]; } catch { /* ok */ }
  }
  return { ok: true, clave, items: out, ...(out[0] ? { ocr: out[0].ocr, cruce: out[0].cruce, url: out[0].url } : {}), ...(datos.cruce_ticket ? { cruce_ticket: datos.cruce_ticket } : {}), ...(tardeAuto ? { subido_tarde: tardeAuto } : {}) };
});

/** Asigna (o retira) una parte de un voucher a otro ticket. No se cuenta dos veces la misma referencia. */
extend("tk_voucher_abono", "any", async (p, ctx, ses) => {
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso para ese ticket" };
  const clave = claveDe(r, leerSerie(r, "so_num"));
  const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
  if (!cab) return { error: "El ticket no tiene vouchers subidos" };
  const datos = { ...((cab.datos || {}) as Row) };
  const L = Array.isArray(datos.comprobantes) ? datos.comprobantes as Row[] : [];
  const url = s(p.url);
  const hit = compsVivos(datos).find((x) => s(x.url) === url) || L.find((x) => s(x.url) === url && x.borrado !== true);
  if (!hit) return { error: "Voucher no encontrado" };
  const ocr = hit.ocr && typeof hit.ocr === "object" ? hit.ocr as Row : null;
  if (!ocr || s(ocr.estado) !== "ok" || !(n(ocr.monto) > 0)) return { error: "Primero hay que leer el voucher" };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const hacia = s(p.hacia_clave).trim().toUpperCase();
  const quitar = p.quitar === true;
  let abonos = Array.isArray(hit.abonos) ? [...(hit.abonos as Row[])] : [];

  if (quitar) {
    const destClave = hacia || s(p.ticket_clave);
    const prev = destClave ? abonos.filter((a) => s(a.ticket_clave) === destClave) : abonos;
    if (!prev.length) return { error: "No hay un abono que retirar" };
    const destinos = destClave ? [destClave] : [...new Set(prev.map((a) => s(a.ticket_clave)).filter(Boolean))];
    hit.abonos = destClave ? abonos.filter((a) => s(a.ticket_clave) !== destClave) : [];
    for (const dest of destinos) {
      if (dest === clave) continue;
      const destCab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === dest);
      if (!destCab) continue;
      const destDatos = { ...((destCab.datos || {}) as Row) };
      const rec = Array.isArray(destDatos.abonos_recibidos) ? destDatos.abonos_recibidos as Row[] : [];
      destDatos.abonos_recibidos = rec.filter((x) => !(s(x.url) === url && s(x.desde_ticket) === clave));
      const destTk = await ticketPorClave(ctx, dest);
      if (destTk) await recomputarCrucesTicket(ctx, destTk, { ...destCab, datos: destDatos }, destDatos);
      const hist = [...(Array.isArray(destCab.historial) ? destCab.historial as Row[] : []), { fecha: now, actor, accion: "documento", detalle: "se retiró un abono de " + clave }].slice(-100);
      await ctx.db.write(actor, "beta_tickets", "update", { clave: dest }, { datos: destDatos, historial: hist, actualizado_por: actor, updated_at: now });
    }
    await recomputarCrucesTicket(ctx, r, { ...cab, datos }, datos);
    const hist = [...(Array.isArray(cab.historial) ? cab.historial as Row[] : []), { fecha: now, actor, accion: "documento", detalle: "retiró un abono del voucher" }].slice(-100);
    await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos, historial: hist, actualizado_por: actor, updated_at: now });
    try { await logAccion(ctx.db, actor, "VOUCHER ABONO QUITAR", clave + " → " + (hacia || "todos")); } catch { /* ok */ }
    return { ok: true, clave, url, abonos: hit.abonos, cruce: hit.cruce, cruce_ticket: datos.cruce_ticket };
  }

  if (!hacia) return { error: "Indica el ticket que recibe el abono (por ejemplo TK-SO-2000)" };
  if (hacia === clave) return { error: "El abono tiene que ir a otro ticket" };
  const destTk = await ticketPorClave(ctx, hacia);
  if (!destTk) return { error: "No encuentro el ticket " + hacia };
  if (!(await veTicket(ctx, ses, destTk))) return { error: "No tienes permiso para el otro ticket" };
  const destClave = claveDe(destTk, leerSerie(destTk, "so_num"));
  const monto = round2(n(p.monto));
  if (!(monto > 0)) return { error: "El monto del abono tiene que ser mayor a 0" };
  const yaAOtros = abonos.filter((a) => s(a.ticket_clave) !== destClave).reduce((a, x) => a + n(x.monto), 0);
  const disponible = round2(n(ocr.monto) - yaAOtros);
  if (monto > disponible + 0.009) return { error: "Solo quedan $" + disponible.toFixed(2) + " de este voucher para asignar" };
  const destCab0 = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === destClave);
  const destDatos0 = { ...((destCab0?.datos || {}) as Row) };
  // Misma referencia ya presente como voucher vivo en el destino: no se cuenta dos veces.
  const destVivos = compsVivos(destDatos0);
  const ref = s(ocr.referencia);
  if (ref && destVivos.some((x) => s((x.ocr as Row | undefined)?.referencia) === ref)) {
    return { error: "Ese voucher (Ref " + ref + ") ya está en " + destClave + ". Quítalo de un ticket antes de partirlo." };
  }
  const facDest = s(p.factura) || s((destDatos0.pago_migo && typeof destDatos0.pago_migo === "object" ? destDatos0.pago_migo as Row : {}).factura) || s(destDatos0.factura) || null;
  const abono: Row = { ticket_clave: destClave, factura: facDest, monto, referencia: ref || null, url, por: ses.name, at: now };
  hit.abonos = [...abonos.filter((a) => s(a.ticket_clave) !== destClave), abono];
  const destCab = destCab0 || { clave: destClave, datos: destDatos0, historial: [] };
  const destDatos = destDatos0;
  const rec = Array.isArray(destDatos.abonos_recibidos) ? destDatos.abonos_recibidos as Row[] : [];
  destDatos.abonos_recibidos = [...rec.filter((x) => !(s(x.url) === url && s(x.desde_ticket) === clave)), { desde_ticket: clave, referencia: ref || null, url, factura: facDest, monto, por: ses.name, at: now }];
  await recomputarCrucesTicket(ctx, r, { ...cab, datos }, datos);
  await recomputarCrucesTicket(ctx, destTk, { ...destCab, datos: destDatos }, destDatos);
  const histOrigen = [...(Array.isArray(cab.historial) ? cab.historial as Row[] : []), { fecha: now, actor, accion: "documento", detalle: "asignó abono $" + monto.toFixed(2) + " a " + destClave }].slice(-100);
  const histDest = [...(Array.isArray(destCab.historial) ? destCab.historial as Row[] : []), { fecha: now, actor, accion: "documento", detalle: "recibió abono $" + monto.toFixed(2) + " de " + clave }].slice(-100);
  await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos, historial: histOrigen, actualizado_por: actor, updated_at: now });
  if (destCab0) await ctx.db.write(actor, "beta_tickets", "update", { clave: destClave }, { datos: destDatos, historial: histDest, actualizado_por: actor, updated_at: now });
  else await ctx.db.write(actor, "beta_tickets", "insert", {}, { clave: destClave, sheet_row: destTk.sheet_row ?? null, datos: destDatos, historial: histDest, actualizado_por: actor, updated_at: now });
  try { await logAccion(ctx.db, actor, "VOUCHER ABONO", clave + " → " + destClave + " · $" + monto.toFixed(2)); } catch { /* ok */ }
  return { ok: true, clave, url, hacia_clave: destClave, monto, abonos: hit.abonos, cruce: hit.cruce, cruce_ticket: datos.cruce_ticket, dest_cruce_ticket: destDatos.cruce_ticket };
});

/** TK208: tickets con total de líneas > $0 y sin factura Migo (desde FALTA_DESDE). */
export async function alertasFaltaFactura(ctx: Ctx): Promise<Row[]> {
  const map = await catMap(ctx);
  const cabMap = new Map((await todas(ctx, "beta_tickets")).map((c) => [s(c.clave), c]));
  const linkByTk = new Map((await todas(ctx, "beta_cuadre_link")).map((L) => [n(L.ticket_id), L]));
  const canc = new Set((await todas(ctx, "beta_ticket_cancelados")).filter((c) => c.revertido !== true).map((c) => n(c.ticket_id)));
  let rows: Row[] = [];
  try {
    rows = (await consultar(ctx.db, "tickets", {
      cols: ["id", "so_num", "beta_num", "timestamp", "atendido_por", "estimado", "fac_7", "fac", "paquete", "gift_card", "venta_gift", "facial_hecho", "servicios_adicionales", "compra_pack_3", "compra_pack_6", "orig", "id_3", "notas_generales"],
      filtros: [{ col: "borrado_at", op: "is_null" }, { col: "timestamp", op: "gte", val: FALTA_DESDE + "T00:00:00" }],
      orden: [{ col: "timestamp", desc: true }],
    })).rows;
  } catch {
    rows = (await consultar(ctx.db, "tickets", {
      cols: ["id", "so_num", "beta_num", "timestamp", "atendido_por", "estimado", "fac_7", "fac", "paquete", "gift_card", "facial_hecho", "servicios_adicionales"],
      filtros: [{ col: "borrado_at", op: "is_null" }, { col: "timestamp", op: "gte", val: FALTA_DESDE + "T00:00:00" }],
    })).rows;
  }
  const out: Row[] = [];
  for (const r of rows) {
    const orig = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
    if (orig.anulado === true || r.borrado_at || canc.has(n(r.id))) continue;
    const clave = claveDe(r, leerSerie(r, "so_num"));
    const cab = cabMap.get(clave);
    const d = ((cab?.datos || {}) as Row);
    const tot = totalValorTicket(r, { cab, map, canje: canjeFacial(r) });
    const pagoDir = esPagoDirecto(r, { datos: d });
    const total = pagoDir ? 0 : (tot > 0 ? tot : n(r.estimado));
    const facReal = hayFactura(r.fac_7, d.factura, linkByTk.get(n(r.id))?.factura);
    if (!faltaFacturaTicket({ anulado: false, facReal, total, fecha: ymdUtc(r.timestamp), pagoDirecto: pagoDir })) continue;
    const quien = s(r.atendido_por).trim().split(/\s+/)[0] || "";
    const so = s(r.so_num) || clave;
    out.push({
      key: "falta-factura:" + so, tipo: "falta_factura", clave: so, quien, total: round2(total),
      texto: "Falta factura " + so + (quien ? " · " + quien : ""),
      detalle: "Total $" + round2(total).toFixed(2) + ". Hay que facturar este ticket.",
      href: "#/m/tickets/t/" + encodeURIComponent(so), fecha: s(r.timestamp),
    });
  }
  return out;
}
export function resumenFaltaFactura(items: Row[]): Row | null {
  if (!items.length) return null;
  const nro = items.length;
  return {
    key: "falta-factura", tipo: "falta_factura", n: nro,
    texto: "Falta factura (" + nro + " ticket" + (nro === 1 ? "" : "s") + ")",
    detalle: items.map((x) => s(x.clave) + (s(x.quien) ? " · " + s(x.quien) : "")).join(", "),
    href: "#/m/tickets",
  };
}

/** Descuadres de voucher en tickets activos (para «⚠️ Alertas» del Dashboard). Solo admin. */
export function alertasDescuadre(cabs: Row[], anulados: Set<string>): Row[] {
  const out: Row[] = [];
  for (const c of cabs) {
    const clave = s(c.clave);
    if (!clave || anulados.has(clave)) continue;
    const d = (c.datos || {}) as Row;
    const ct = d.cruce_ticket && typeof d.cruce_ticket === "object" ? d.cruce_ticket as Row : null;
    if (ct && s(ct.estado) === "descuadre") {
      const first = compsVivos(d)[0];
      const det = [n(ct.suma_vouchers) > 0 ? "Vouchers $" + n(ct.suma_vouchers).toFixed(2) : (n(ct.monto) > 0 ? "Voucher $" + n(ct.monto).toFixed(2) : ""), ct.descuadre_ticket && n(ct.objetivo_ticket) > 0 ? "Ticket $" + n(ct.objetivo_ticket).toFixed(2) : "", ct.descuadre_factura && n(ct.total_factura) > 0 ? "Factura Migo $" + n(ct.total_factura).toFixed(2) : ""].filter(Boolean).join(" vs ");
      out.push({ key: "voucher:" + clave + ":" + (first ? archivoIdDe(first.url) : "ticket"), clave, url: first ? s(first.url) : "", texto: "Descuadre voucher " + clave, detalle: det || s(ct.mensaje), mensaje: s(ct.mensaje), fecha: s(first?.fecha), href: "#/m/tickets/t/" + encodeURIComponent(clave) });
      continue;
    }
    for (const x of compsVivos(d)) {
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
  const admin = esAdmin(ses.rol), recep = esRecepcion(ses.rol);
  if (!admin && !recep) return { ok: true, items: [], total_falta_factura: 0 };
  const falta = await alertasFaltaFactura(ctx);
  const items: Row[] = [];
  const resumen = resumenFaltaFactura(falta);
  if (resumen) items.push(resumen);
  items.push(...falta.slice(0, 12));
  if (admin) {
    const cabs = (await todas(ctx, "beta_tickets")).filter((c) => compsVivos((c.datos || {}) as Row).some((x) => s((x.cruce as Row | undefined)?.estado) === "descuadre"));
    if (cabs.length) {
      const anulados = new Set<string>();
      for (const c of cabs) {
        const r = await ticketPorClave(ctx, s(c.clave));
        if (!r || (r.orig && typeof r.orig === "object" && (r.orig as Row).anulado === true) || r.borrado_at) anulados.add(s(c.clave));
      }
      items.push(...alertasDescuadre(cabs, anulados));
    }
  }
  return { ok: true, items, total_falta_factura: falta.length };
});

export { resumenOcr };
