// Cancelar ticket (Emilia 17/11, admin). El ticket NO se borra: queda «Cancelado» (orig.anulado/cancelado,
// que un trigger conserva aunque la importación horaria reescriba la fila). Devuelve el stock que el ticket
// sacó a la bodega de donde salió (movimiento «anulacion» en el kardex), ANULA los paquetes nacidos de (TK58)
// ese ticket (y libera las sesiones que ese ticket marcó) y deja motivo + quién en beta_ticket_cancelados y en el log. Sale de totales/comisiones/dashboard
// porque esos cálculos saltan los tickets con orig.anulado.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { n, s, skuCode, USO_FIELDS, type Row } from "./domain.ts";
import { consultar } from "./query.ts";
import { BODEGA_VENTA, runErp } from "./erp.ts";
import { ticketPorClave } from "./tickets_beta_api.ts";
import { leerSerie } from "./series.ts";
import { claveDe } from "./ticket_beta.ts";

/** Referencias con las que el kardex pudo anotar las salidas de este ticket. */
export function refsTicket(r: Row): string[] {
  const o = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  return [...new Set([s(r.beta_num), s(o.beta_num), s(r.so_num), s(o.so_num), s(o.ticket_ref)].filter(Boolean))];
}

/** Neto por producto+bodega de lo que el ticket movió (negativo = sacó stock). */
export function netoPorBodega(movs: Row[]): Map<string, { producto_id: string; bodega_id: string; neto: number }> {
  const m = new Map<string, { producto_id: string; bodega_id: string; neto: number }>();
  for (const x of movs) {
    const k = s(x.producto_id) + "|" + s(x.bodega_id);
    const cur = m.get(k) || { producto_id: s(x.producto_id), bodega_id: s(x.bodega_id), neto: 0 };
    cur.neto = Math.round((cur.neto + n(x.delta)) * 1000) / 1000;
    m.set(k, cur);
  }
  return m;
}

async function movsDe(ctx: Ctx, r: Row): Promise<Row[]> {
  const refs = refsTicket(r);
  if (!refs.length) return [];
  try {
    return (await consultar(ctx.db, "erp_movimientos", { cols: ["id", "producto_id", "bodega_id", "delta", "tipo", "ticket_ref"], filtros: [{ col: "ticket_ref", op: "in", val: refs }], limite: 500 })).rows;
  } catch { return []; }
}

/**
 * Al quitar (o bajar la cantidad de) un producto en un ticket ya creado, devuelve lo que el ticket había sacado
 * de ese producto a su bodega de origen. Al agregar un producto a un ticket de la beta, lo descuenta de la bodega
 * de venta. Devuelve los movimientos hechos.
 */
export async function ajustarStockLineas(ctx: Ctx, ses: Ses, r: Row, antes: { tipo: string; sku: string; cantidad: number }[], despues: { tipo: string; sku: string; cantidad: number }[]): Promise<Row[]> {
  const q = (L: { tipo: string; sku: string; cantidad: number }[]) => {
    const m = new Map<string, number>();
    for (const l of L) if (l.tipo === "producto") m.set(skuCode(l.sku), (m.get(skuCode(l.sku)) || 0) + n(l.cantidad));
    return m;
  };
  const A = q(antes), D = q(despues);
  const skus = [...new Set([...A.keys(), ...D.keys()])].filter((k) => (D.get(k) || 0) !== (A.get(k) || 0));
  if (!skus.length) return [];
  const prods = (await consultar(ctx.db, "erp_productos", { cols: ["id", "sku", "clase", "uso"] })).rows;
  const porSku = new Map(prods.map((p) => [skuCode(s(p.sku)), p]));
  const movs = await movsDe(ctx, r);
  const ref = refsTicket(r)[0] || String(r.id);
  const esBeta = s(r.origin) === "beta" || (r.orig as Row | undefined)?.beta === true;
  const moves: Row[] = [];
  const stamp = Date.now();
  for (const k of skus) {
    const p = porSku.get(k);
    if (!p || (s(p.clase) || "producto") !== "producto" || s(p.uso) === "cabina") continue;
    const dif = (D.get(k) || 0) - (A.get(k) || 0);
    if (dif < 0) {
      // Devolver solo lo que este ticket sacó (hay tickets viejos que nunca descontaron del kardex).
      let falta = -dif;
      for (const x of netoPorBodega(movs.filter((m) => s(m.producto_id) === s(p.id))).values()) {
        if (falta <= 0 || x.neto >= 0) continue;
        const dev = Math.min(falta, -x.neto);
        moves.push({ producto_id: x.producto_id, bodega_id: x.bodega_id, delta: dev, tipo: "anulacion", ticket_ref: ref, nota: "quitar línea " + ref, legacy_ref: "tk-quitar:" + ref + ":" + k + ":" + stamp });
        falta -= dev;
      }
    } else if (esBeta) {
      moves.push({ producto_id: s(p.id), bodega_id: BODEGA_VENTA, delta: -dif, tipo: "venta", ticket_ref: ref, nota: "agregar línea " + ref, legacy_ref: "tk-agregar:" + ref + ":" + k + ":" + stamp });
    }
  }
  if (!moves.length) return [];
  const out = await runErp("stock_delta", { moves, aprobar_negativo: true }, ctx.db, actorOf(ses), ctx.now);
  if (out.error) throw new Error(s(out.error));
  return moves;
}

/** Anota en el historial del paquete (beta_paquete_ajustes). */
async function historialPaquete(ctx: Ctx, actor: string, quien: string, pq: Row, accion: string, detalle: string, usos?: Row, datosExtra?: Row): Promise<void> {
  const now = ctx.now.toISOString();
  let aj: Row | null = null;
  try { aj = (await consultar(ctx.db, "beta_paquete_ajustes", { filtros: [{ col: "paquete_id", op: "eq", val: n(pq.id) }] })).rows[0] || null; } catch { aj = null; }
  const hist = [...(aj && Array.isArray(aj.historial) ? aj.historial as Row[] : []), { fecha: now, actor: quien, accion, detalle }].slice(-100);
  // datos.anulado lo vuelve a poner el trigger zzy_paquetes_beta_ajuste aunque la importación reescriba la fila (TK61).
  const datos = datosExtra ? { ...((aj && aj.datos && typeof aj.datos === "object" ? aj.datos : {}) as Row), ...datosExtra } : null;
  const fila: Row = { sheet_row: pq.sheet_row ?? null, historial: hist, actualizado_por: actor, updated_at: now, ...(usos ? { usos } : {}), ...(datos ? { datos } : {}) };
  if (aj) await ctx.db.write(actor, "beta_paquete_ajustes", "update", { paquete_id: n(pq.id) }, fila);
  else await ctx.db.write(actor, "beta_paquete_ajustes", "insert", {}, { paquete_id: n(pq.id), datos: {}, usos: usos || {}, borrado: false, ...fila });
}

/**
 * Sesiones marcadas por el ticket (orig.marcas_slot, la marca de la beta en beta_paquete_ajustes.usos, o la
 * última marca si fue de este ticket): se desmarcan y quedan en el historial. Devuelve qué se liberó.
 */
export async function liberarSesionesDe(ctx: Ctx, actor: string, quien: string, refs: Set<string>, so: string): Promise<Row[]> {
  const out: Row[] = [];
  const ajs = new Map<string, Row>();
  try { for (const a of await ctx.db.all("beta_paquete_ajustes")) ajs.set(String(a.paquete_id), a); } catch { /* sin ajustes */ }
  const conAj = new Set([...ajs.values()].filter((a) => Object.values((a.usos && typeof a.usos === "object" ? a.usos : {}) as Row).some((m) => refs.has(s((m as Row)?.ticket)))).map((a) => String(a.paquete_id)));
  const F = { op: "or", de: [...refs].map((t) => ({ col: "orig->>ultima_marca_ticket", op: "eq", val: t })).concat([{ col: "orig->marcas_ticket", op: "not_null" } as never]) } as never;
  let rows: Row[] = [];
  try { rows = (await consultar(ctx.db, "paquetes", { filtros: [{ col: "borrado_at", op: "is_null" }, F] })).rows; } catch { rows = (await ctx.db.all("paquetes")).filter((x) => !x.borrado_at); }
  if (conAj.size) {
    const ya = new Set(rows.map((x) => String(x.id)));
    const faltan = [...conAj].filter((id) => !ya.has(id));
    if (faltan.length) { try { rows = rows.concat((await consultar(ctx.db, "paquetes", { filtros: [{ col: "id", op: "in", val: faltan.map(Number) }] })).rows); } catch { /* */ } }
  }
  for (const pq of rows) {
    if (pq.borrado_at) continue;
    const po = pq.orig && typeof pq.orig === "object" ? { ...(pq.orig as Row) } : {};
    const aj = ajs.get(String(pq.id));
    const meta = { ...((aj && aj.usos && typeof aj.usos === "object" ? aj.usos : {}) as Row) };
    const slots = new Set<number>();
    const ms = po.marcas_slot && typeof po.marcas_slot === "object" ? po.marcas_slot as Row : {};
    for (const t of refs) for (const x of (Array.isArray(ms[t]) ? ms[t] as unknown[] : [])) if (n(x) > 0) slots.add(n(x));
    for (const [k, m] of Object.entries(meta)) if (refs.has(s((m as Row)?.ticket))) slots.add(n(k));
    if (refs.has(s(po.ultima_marca_ticket)) && n(po.ultima_marca_slot) > 0) slots.add(n(po.ultima_marca_slot));
    if (!slots.size) continue;
    const patch: Row = {};
    const hechos: number[] = [];
    for (const sl of [...slots].sort((a, b) => a - b)) {
      const par = USO_FIELDS[sl - 1]; if (!par) continue;
      const [u, f] = par;
      if (!(pq[u] === true || s(pq[u]) === "true" || s(pq[f]))) continue;
      patch[u] = false; patch[f] = ""; hechos.push(sl); delete meta[String(sl)];
    }
    if (!hechos.length) continue;
    patch.completo = false;
    const ms2: Row = { ...ms }; for (const t of refs) delete ms2[t];
    po.marcas_slot = ms2;
    po.marcas_ticket = (Array.isArray(po.marcas_ticket) ? po.marcas_ticket as unknown[] : []).map((x) => s(x)).filter((t) => !refs.has(t));
    if (refs.has(s(po.ultima_marca_ticket))) { po.ultima_marca_ticket = ""; po.ultima_marca_slot = 0; po.ultima_marca_ms = 0; }
    patch.orig = po;
    await ctx.db.write(actor, "paquetes", "update", { id: pq.id }, patch);
    const fijar: Row = { ...((aj && aj.datos && typeof (aj.datos as Row).fijar === "object" ? (aj.datos as Row).fijar : {}) as Row) };
    for (const [k, v] of Object.entries(patch)) if (k !== "orig") fijar[k] = v;
    await historialPaquete(ctx, actor, quien, pq, "liberar", "sesión " + hechos.join(", ") + " liberada: ticket " + so + " cancelado", meta, { fijar });
    for (const sl of hechos) out.push({ id: pq.id, codigo: s(pq.codigo) || s(pq.beta_codigo) || "PACK-" + s(pq.sheet_row), paquete: s(pq.paquete), slot: sl });
  }
  return out;
}

extend("tk_cancelar", "any", async (p, ctx, ses) => cancelarTicket(p, ctx, ses));

export async function cancelarTicket(p: Row, ctx: Ctx, ses: Ses): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin puede cancelar un ticket" };
  const motivo = s(p.motivo).trim().slice(0, 300);
  if (!motivo) return { error: "Escribe el motivo de la cancelación" };
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  const o = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  if (o.anulado === true || o.cancelado === true) return { error: "Ese ticket ya está cancelado" };
  const actor = actorOf(ses), quien = s(ses.name) || actor, so = leerSerie(r, "so_num") || refsTicket(r)[0] || String(r.id);
  // 1) Stock: lo que el ticket sacó vuelve a la misma bodega.
  const moves: Row[] = [];
  for (const x of netoPorBodega(await movsDe(ctx, r)).values()) {
    if (x.neto >= 0) continue;
    moves.push({ producto_id: x.producto_id, bodega_id: x.bodega_id, delta: -x.neto, tipo: "anulacion", ticket_ref: refsTicket(r)[0] || so, nota: "cancelar " + so + ": " + motivo, legacy_ref: "tk-cancelar:" + so + ":" + x.producto_id + ":" + x.bodega_id });
  }
  if (moves.length) {
    const out = await runErp("stock_delta", { moves, aprobar_negativo: true }, ctx.db, actor, ctx.now);
    if (out.error) return { error: "No se pudo devolver el stock: " + s(out.error) };
  }
  // 2) Paquetes nacidos de este ticket: quedan ANULADOS (se ven, pero sus sesiones ya no se pueden usar).
  //    Emilia 18/11 (TK58): antes se daban de baja y desaparecían.
  const refs = new Set(refsTicket(r));
  const paqs: Row[] = [];
  const liberadas: Row[] = [];
  const ts0 = ctx.now.toISOString();
  try {
    for (const pq of (await consultar(ctx.db, "paquetes", { cols: ["id", "sheet_row", "codigo", "beta_codigo", "paquete", "orig", "borrado_at"], filtros: [{ col: "borrado_at", op: "is_null" }, { col: "orig->>ticket", op: "in", val: [...refs] }] })).rows) {
      const po = pq.orig && typeof pq.orig === "object" ? pq.orig as Row : {};
      if (!refs.has(s(po.ticket)) || po.anulado === true) continue;
      await ctx.db.write(actor, "paquetes", "update", { id: pq.id }, { orig: { ...po, anulado: true, anulado_ts: ts0, anulado_por: s(ses.name) || actor, cancelado_por_ticket: so, cancelado_motivo: motivo } });
      await historialPaquete(ctx, actor, s(ses.name) || actor, pq, "anular", "ticket " + so + " cancelado: " + motivo, undefined,
        { anulado: true, anulado_motivo: motivo, anulado_ticket: so, anulado_por: s(ses.name) || actor, anulado_ts: ts0 });
      paqs.push({ id: pq.id, codigo: s(pq.codigo) || s(pq.beta_codigo), paquete: s(pq.paquete) });
    }
  } catch { /* sin paquetes */ }
  // 2b) Sesiones que este ticket marcó en cualquier paquete: vuelven a quedar libres.
  try { liberadas.push(...await liberarSesionesDe(ctx, actor, s(ses.name) || actor, refs, so)); } catch { /* sin sesiones */ }
  // TK155 (Emilia t682u): «se borra absolutamente todo lo de ese ticket».
  const rev = await revertirExtrasTicket(ctx, actor, quien, r, refs, so, motivo, s(p.clave));
  // 3) Marca (beta) + ticket.
  const ts = ctx.now.toISOString();
  await ctx.db.write(actor, "beta_ticket_cancelados", "insert", {}, { ticket_id: r.id, so_num: so, clave: s(p.clave), motivo, cancelado_por: quien, cancelado_ts: ts, stock: moves, paquetes: paqs.map((x) => ({ ...x, anulado: true })).concat(liberadas.map((x) => ({ ...x, liberada: true }))), revertido: false });
  await ctx.db.write(actor, "tickets", "update", { id: r.id }, { orig: { ...o, anulado: true, cancelado: true, cancelado_motivo: motivo, cancelado_por: quien, cancelado_ts: ts, cancelado_reversa: rev } });
  await logAccion(ctx.db, actor, "TICKET CANCELADO", so + " · " + motivo + (moves.length ? " · stock devuelto: " + moves.length : "") + (paqs.length ? " · paquetes anulados: " + paqs.map((x) => x.codigo || x.paquete).join(", ") : "") + (liberadas.length ? " · sesiones liberadas: " + liberadas.map((x) => (x.codigo || x.paquete) + " #" + x.slot).join(", ") : "")
    + (rev.gifts_anuladas.length ? " · gift cards anuladas: " + rev.gifts_anuladas.map((x) => x.codigo).join(", ") : "")
    + (rev.gifts_restauradas.length ? " · gift cards restauradas: " + rev.gifts_restauradas.map((x) => x.codigo).join(", ") : "")
    + (rev.pagos_anulados.length ? " · pagos anulados: " + rev.pagos_anulados.length : "")
    + (rev.factura_liberada ? " · factura liberada: " + s(rev.factura_liberada.factura) : ""));
  return { ok: true, so, stock: moves.length, unidades: moves.reduce((a, m) => a + n(m.delta), 0), paquetes: paqs, liberadas,
    gifts_anuladas: rev.gifts_anuladas, gifts_restauradas: rev.gifts_restauradas, pagos_anulados: rev.pagos_anulados.length, factura_liberada: rev.factura_liberada };
}

const GC_COD = /\b\d{2}-\d{3,}\b/g;
/** Códigos de gift card vendidos en el ticket (columna venta_gift «SI, 26-171, …»). */
export function giftsVendidasDe(r: Row): string[] {
  const t = s(r.venta_gift).trim();
  if (!/^SI\b/i.test(t)) return [];
  return [...new Set((t.match(GC_COD) || []).map((x) => x.toUpperCase()))];
}

/**
 * TK155: lo que faltaba al cancelar. Idempotente (lo ya anulado/restaurado no se vuelve a tocar) y con respaldo:
 *  - gift cards VENDIDAS en el ticket → eliminadas (borrado_at) y marcadas anuladas por el ticket;
 *  - gift cards CANJEADAS en el ticket → se quita ese uso y vuelve el saldo (y deja de estar «usada»);
 *  - beta_pagos del ticket → anulado = true (salen de caja);
 *  - factura Migo vinculada (beta_cuadre_link / beta_tickets.datos.factura) → se desvincula para cuadrarla con el ticket correcto.
 */
export async function revertirExtrasTicket(ctx: Ctx, actor: string, quien: string, r: Row, refs: Set<string>, so: string, motivo: string, claveP = ""): Promise<{ gifts_anuladas: Row[]; gifts_restauradas: Row[]; pagos_anulados: Row[]; factura_liberada: Row | null }> {
  const out = { gifts_anuladas: [] as Row[], gifts_restauradas: [] as Row[], pagos_anulados: [] as Row[], factura_liberada: null as Row | null };
  const ts = ctx.now.toISOString();
  const claves = new Set([claveDe(r, leerSerie(r, "so_num")), claveP, ...refs].map((x) => s(x)).filter(Boolean));
  // a) Gift cards
  let cards: Row[] = [], ajs: Row[] = [];
  try { cards = await ctx.db.all("gift_cards"); } catch { cards = []; }
  try { ajs = await ctx.db.all("beta_gift_ajustes"); } catch { ajs = []; }
  const ajPorId = new Map(ajs.map((a) => [String(a.gift_id), a]));
  const vendidas = new Set(giftsVendidasDe(r));
  for (const g of cards) {
    const cod = s(g.codigo_gc).trim().toUpperCase();
    const go = g.orig && typeof g.orig === "object" ? { ...(g.orig as Row) } : {};
    const aj = ajPorId.get(String(g.id));
    const match = g.id != null ? { id: g.id } : { sheet_row: g.sheet_row };
    // Vendida en este ticket → eliminada.
    const vendidaAqui = (cod && vendidas.has(cod)) || claves.has(s(aj?.ticket_venta)) || claves.has(s(go.ticket_venta));
    if (vendidaAqui && !g.borrado_at && go.anulado_por_ticket == null) {
      await ctx.db.write(actor, "gift_cards", "update", match, { borrado_at: ts, borrado_por: actor, orig: { ...go, anulado: true, anulado_por_ticket: so, anulado_motivo: motivo, anulado_ts: ts } });
      out.gifts_anuladas.push({ id: g.id, codigo: cod });
      continue;
    }
    // Canjeada en este ticket → vuelve el saldo / deja de estar usada.
    const usos = Array.isArray(go.usos) ? go.usos as Row[] : [];
    const mios = usos.filter((u) => claves.has(s(u?.ticket)));
    const usoAj = claves.has(s(aj?.ticket_uso));
    if (!mios.length && !usoAj) continue;
    const devuelto = Math.round(mios.reduce((a, u) => a + n(u.monto), 0) * 100) / 100;
    const patch: Row = { usado: false, fecha_uso: "", usado_por: "" };
    const o2: Row = { ...go, usos: usos.filter((u) => !claves.has(s(u?.ticket))) };
    if (mios.length) {
      const saldo = Math.round((n(go.saldo ?? g.saldo) + devuelto) * 100) / 100;
      o2.saldo = saldo; patch.saldo = saldo;
    }
    o2.restaurada_por_ticket = so; o2.restaurada_ts = ts;
    patch.orig = o2;
    await ctx.db.write(actor, "gift_cards", "update", match, patch);
    if (usoAj && aj) { try { await ctx.db.write(actor, "beta_gift_ajustes", "update", { gift_id: Number(g.id) }, { ticket_uso: null, updated_at: ts }); } catch { /* sin ajustes */ } }
    out.gifts_restauradas.push({ id: g.id, codigo: cod, monto: devuelto });
  }
  // b) Pagos de caja del ticket
  try {
    const pagos = (await consultar(ctx.db, "beta_pagos", { filtros: [{ col: "ticket_clave", op: "in", val: [...claves] }] })).rows;
    for (const pg of pagos) {
      if (pg.anulado === true) continue;
      await ctx.db.write(actor, "beta_pagos", "update", { id: s(pg.id) }, { anulado: true, anulado_por: quien, anulado_motivo: "ticket " + so + " cancelado: " + motivo, anulado_at: ts });
      out.pagos_anulados.push({ id: s(pg.id), monto: n(pg.monto) });
    }
  } catch { /* sin beta_pagos */ }
  // c) Factura Migo vinculada: se libera (con respaldo en orig.cancelado_reversa).
  try {
    const links = (await consultar(ctx.db, "beta_cuadre_link", { filtros: [{ col: "ticket_id", op: "eq", val: r.id }] })).rows;
    for (const L of links) {
      out.factura_liberada = { factura: s(L.factura), link: L };
      await ctx.db.write(actor, "beta_cuadre_link", "delete", { ticket_id: L.ticket_id }, null);
    }
  } catch { /* sin cuadre */ }
  try {
    for (const k of claves) {
      const cab = (await consultar(ctx.db, "beta_tickets", { filtros: [{ col: "clave", op: "eq", val: k }] })).rows[0];
      const d = cab && cab.datos && typeof cab.datos === "object" ? cab.datos as Row : null;
      if (!d || !s(d.factura)) continue;
      out.factura_liberada = { ...(out.factura_liberada || {}), factura: s(out.factura_liberada?.factura) || s(d.factura), datos_factura: d.factura };
      const d2: Row = { ...d, factura: "", factura_liberada: { factura: d.factura, por_cancelacion: so, ts } };
      await ctx.db.write(actor, "beta_tickets", "update", { clave: k }, { datos: d2 });
      break;
    }
  } catch { /* sin beta_tickets */ }
  return out;
}
