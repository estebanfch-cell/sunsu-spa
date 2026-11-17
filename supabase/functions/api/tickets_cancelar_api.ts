// Cancelar ticket (Emilia 17/11, admin). El ticket NO se borra: queda «Cancelado» (orig.anulado/cancelado,
// que un trigger conserva aunque la importación horaria reescriba la fila). Devuelve el stock que el ticket
// sacó a la bodega de donde salió (movimiento «anulacion» en el kardex), da de baja los paquetes nacidos de
// ese ticket y deja motivo + quién en beta_ticket_cancelados y en el log. Sale de totales/comisiones/dashboard
// porque esos cálculos saltan los tickets con orig.anulado.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { n, s, skuCode, type Row } from "./domain.ts";
import { consultar } from "./query.ts";
import { BODEGA_VENTA, runErp } from "./erp.ts";
import { ticketPorClave } from "./tickets_beta_api.ts";
import { leerSerie } from "./series.ts";

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

extend("tk_cancelar", "any", async (p, ctx, ses) => {
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
  // 2) Paquetes nacidos de este ticket.
  const refs = new Set(refsTicket(r));
  const paqs: Row[] = [];
  try {
    for (const pq of (await consultar(ctx.db, "paquetes", { cols: ["id", "sheet_row", "codigo", "beta_codigo", "paquete", "orig", "borrado_at"], filtros: [{ col: "borrado_at", op: "is_null" }, { col: "orig->>ticket", op: "in", val: [...refs] }] })).rows) {
      const po = pq.orig && typeof pq.orig === "object" ? pq.orig as Row : {};
      if (!refs.has(s(po.ticket))) continue;
      await ctx.db.write(actor, "paquetes", "update", { id: pq.id }, { borrado_at: ctx.now.toISOString(), borrado_por: actor, orig: { ...po, cancelado_por_ticket: so, cancelado_motivo: motivo } });
      paqs.push({ id: pq.id, codigo: s(pq.codigo) || s(pq.beta_codigo), paquete: s(pq.paquete) });
    }
  } catch { /* sin paquetes */ }
  // 3) Marca (beta) + ticket.
  const ts = ctx.now.toISOString();
  await ctx.db.write(actor, "beta_ticket_cancelados", "insert", {}, { ticket_id: r.id, so_num: so, clave: s(p.clave), motivo, cancelado_por: quien, cancelado_ts: ts, stock: moves, paquetes: paqs, revertido: false });
  await ctx.db.write(actor, "tickets", "update", { id: r.id }, { orig: { ...o, anulado: true, cancelado: true, cancelado_motivo: motivo, cancelado_por: quien, cancelado_ts: ts } });
  await logAccion(ctx.db, actor, "TICKET CANCELADO", so + " · " + motivo + (moves.length ? " · stock devuelto: " + moves.length : "") + (paqs.length ? " · paquetes: " + paqs.map((x) => x.codigo || x.paquete).join(", ") : ""));
  return { ok: true, so, stock: moves.length, unidades: moves.reduce((a, m) => a + n(m.delta), 0), paquetes: paqs };
});
