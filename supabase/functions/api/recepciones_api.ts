// 📥 Recepciones (TK25, Emilia 17/11): módulo para quien solo recibe. Lista las OC por recibir, y por cada
// producto: pedido, recibido (cantidad) y Recibido / No recibido. Recibido mete el stock a su bodega
// (Propio+Vendible → Venta, Insumo → Casa, Consignación → CONSIGNACION [TK27]); No recibido anula lo pendiente y se puede deshacer por 1 hora.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { n, round2, s, type Row } from "./domain.ts";
import { runErp } from "./erp.ts";
import { flujoTrasRecibir } from "./compras_flujo.ts";
import { estadoOc } from "./compras_beta.ts";
import { agrupar, estadoTrasRecibir, repartir, UNDO_MS } from "./recepciones.ts";
import { crearActa } from "./actas_api.ts";
import { recibirRestock, restockParaRecibir, restocksAbiertos } from "./consignacion_beta_api.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const BODEGAS_OK = ["VENTA", "CASA", "CABINA", "CAB2", "CAB3", "CONSIGNACION"];

/** Si la bodega destino no existe (p. ej. sin la SQL de CONSIGNACION), entra a Venta como antes. */
function conBodega(G: Row[], bods: Row[]): Row[] {
  const ids = new Set(bods.map((b) => s(b.id)));
  return G.map((g) => ids.has(s(g.bodega_id)) ? g : { ...g, bodega_id: s(bods.find((b) => s(b.codigo) === "VENTA")?.id) || s(g.bodega_id) });
}

async function refrescar(ctx: Ctx, actor: string, ocId: string): Promise<void> {
  const L = (await ctx.db.all("erp_oc_lineas")).filter((r) => r.oc_id === ocId);
  const o = (await ctx.db.all("erp_oc")).find((r) => r.id === ocId);
  if (!o) return;
  await ctx.db.write(actor, "erp_oc", "update", { id: ocId }, { estado: estadoTrasRecibir(L), flujo: flujoTrasRecibir(L, n(o.pagado), n(o.total)) });
}
function recibible(o: Row): boolean {
  if (s(o.tipo) === "consignacion") return false; // la OC de consignación factura lo vendido: no se recibe
  if (s(o.estado) === "cancelada" || s(o.flujo) === "Borrador" || s(o.estado) === "borrador") return false;
  return true;
}

extend("rcp_lista", "any", async (_p, ctx) => {
  const [ocs, lineas, provs] = await Promise.all([todas(ctx, "erp_oc"), todas(ctx, "erp_oc_lineas"), todas(ctx, "erp_proveedores")]);
  const items: Row[] = [];
  for (const o of ocs) {
    if (!recibible(o)) continue;
    const L = lineas.filter((l) => l.oc_id === o.id);
    if (!L.length) continue;
    const est = estadoOc(o, L);
    const pend = L.reduce((a, l) => a + Math.max(0, n(l.cantidad) - n(l.recibido) - n(l.no_recibido)), 0);
    const reciente = L.some((l) => s(l.beta_no_recibido_at) && ctx.now.getTime() - new Date(s(l.beta_no_recibido_at)).getTime() < UNDO_MS);
    if (pend <= 0 && !reciente) continue;
    items.push({ id: s(o.id), numero: s(o.numero), fecha: s(o.fecha), fecha_esperada: s(o.fecha_esperada), tipo: s(o.tipo) || "compra", estado: est, proveedor: s(provs.find((p) => p.id === o.proveedor_id)?.nombre), productos: new Set(L.map((l) => s(l.producto_id))).size, pendiente: round2(pend) });
  }
  for (const r of await restocksAbiertos(ctx)) items.push(r);
  items.sort((a, b) => s(a.fecha).localeCompare(s(b.fecha)));
  return { ok: true, items };
});

extend("rcp_get", "any", async (p, ctx, ses) => {
  if (/^rst:/.test(s(p.id))) { const r = await restockParaRecibir(ctx, s(p.id).slice(4)); return r || { error: "Pedido no encontrado" }; }
  const o = (await todas(ctx, "erp_oc")).find((r) => r.id === s(p.id) || s(r.numero) === s(p.id));
  if (!o) return { error: "OC no encontrada" };
  const [lineas, prods, provs, bods, recs] = await Promise.all([todas(ctx, "erp_oc_lineas"), todas(ctx, "erp_productos"), todas(ctx, "erp_proveedores"), todas(ctx, "erp_bodegas"), todas(ctx, "erp_recepciones")]);
  const L = lineas.filter((l) => l.oc_id === o.id).sort((a, b) => n(a.orden) - n(b.orden));
  const porId = new Map(prods.map((x) => [s(x.id), x]));
  return {
    ok: true, admin: esAdmin(ses.rol),
    oc: { id: s(o.id), numero: s(o.numero), fecha: s(o.fecha), fecha_esperada: s(o.fecha_esperada), tipo: s(o.tipo) || "compra", estado: estadoOc(o, L), proveedor: s(provs.find((x) => x.id === o.proveedor_id)?.nombre), recibible: recibible(o) },
    grupos: conBodega(agrupar(L, porId, ctx.now), bods),
    bodegas: bods.filter((b) => BODEGAS_OK.includes(s(b.codigo))).map((b) => ({ id: s(b.id), codigo: s(b.codigo), nombre: s(b.nombre), tipo: s(b.tipo) })),
    recepciones: recs.filter((r) => r.oc_id === o.id).map((r) => ({ id: s(r.id), numero: s(r.numero), fecha: s(r.fecha), por: s(r.recibido_por), anulada: r.anulada === true })),
  };
});

/** grupos: [{producto_id, accion: "recibido"|"no_recibido", cantidad, bodega_id?}] */
extend("rcp_recibir", "any", async (p, ctx, ses) => {
  const actor = actorOf(ses);
  if (/^rst:/.test(s(p.oc_id))) return await recibirRestock(ctx, ses, s(p.oc_id).slice(4), (Array.isArray(p.grupos) ? p.grupos : []) as Row[], s(p.nota).slice(0, 300));
  const o = (await todas(ctx, "erp_oc")).find((r) => r.id === s(p.oc_id));
  if (!o) return { error: "OC no encontrada" };
  if (!recibible(o)) return { error: "Esta orden no se puede recibir" };
  const [lineas, prods, bods] = await Promise.all([todas(ctx, "erp_oc_lineas"), todas(ctx, "erp_productos"), todas(ctx, "erp_bodegas")]);
  const L = lineas.filter((l) => l.oc_id === o.id).sort((a, b) => n(a.orden) - n(b.orden));
  const porId = new Map(prods.map((x) => [s(x.id), x]));
  const G = new Map(conBodega(agrupar(L, porId, ctx.now), bods).map((g) => [s(g.producto_id), g]));
  const ins = (Array.isArray(p.grupos) ? p.grupos : []) as Row[];
  const recibir: Row[] = [];
  const anular: { id: string; qty: number }[] = [];
  const log: string[] = [];
  for (const it of ins) {
    const g = G.get(s(it.producto_id));
    if (!g) return { error: "Ese producto no está en la OC" };
    const pend = n(g.pendiente);
    const accion = s(it.accion);
    if (accion === "no_recibido") {
      if (pend <= 0) continue;
      for (const l of L.filter((x) => x.producto_id === g.producto_id)) {
        const q = round2(n(l.cantidad) - n(l.recibido) - n(l.no_recibido));
        if (q > 0) anular.push({ id: s(l.id), qty: q });
      }
      log.push(`${s(g.sku)} no recibido ${pend}`);
      continue;
    }
    if (accion !== "recibido") continue;
    const q = round2(n(it.cantidad));
    if (!(q > 0)) continue;
    if (q > pend + 1e-9) return { error: `${s(g.sku)}: recibes ${q} y solo quedan ${pend} por recibir` };
    let bodega = s(it.bodega_id) || s(g.bodega_id);
    const b = bods.find((x) => x.id === bodega);
    if (!b || !BODEGAS_OK.includes(s(b.codigo))) bodega = s(g.bodega_id);
    for (const r of repartir(L.filter((x) => x.producto_id === g.producto_id), q)) recibir.push({ oc_linea_id: r.id, cantidad: r.cantidad, bodega_id: bodega });
    log.push(`${s(g.sku)} +${q} → ${s(bods.find((x) => x.id === bodega)?.nombre || bodega)}`);
  }
  if (!recibir.length && !anular.length) return { error: "Marca al menos un producto como Recibido (con cantidad) o No recibido" };
  let rec: Row = {};
  if (recibir.length) {
    rec = await runErp("oc_recibir", { oc_id: o.id, lineas: recibir, nota: s(p.nota).slice(0, 300) }, ctx.db, actor, ctx.now) as Row;
    if (rec.error) return rec;
  }
  for (const a of anular) {
    const l = L.find((x) => x.id === a.id)!;
    await ctx.db.write(actor, "erp_oc_lineas", "update", { id: a.id }, { no_recibido: round2(n(l.no_recibido) + a.qty), beta_no_recibido_at: ctx.now.toISOString(), beta_no_recibido_por: actor, beta_no_recibido_qty: a.qty });
  }
  await refrescar(ctx, actor, s(o.id));
  await logAccion(ctx.db, actor, "OC RECIBIR", `${s(o.numero)} · ${log.join(" · ")}${rec.numero ? " · " + s(rec.numero) : ""} · ${o.id}`);
  // Acta de entrega-recepción automática (TK26): lo recibido y lo no recibido de esta vez.
  let actaNum = "";
  try {
    const nombreBod = (id: string) => s(bods.find((b) => b.id === id)?.nombre);
    const filas: Row[] = [];
    for (const it of ins) {
      const g = G.get(s(it.producto_id)); if (!g) continue;
      const rc = recibir.filter((r) => (L.find((l) => l.id === r.oc_linea_id) || {}).producto_id === g.producto_id);
      const qr = round2(rc.reduce((a, r) => a + n(r.cantidad), 0));
      const qn = round2(anular.filter((x) => (L.find((l) => l.id === x.id) || {}).producto_id === g.producto_id).reduce((a, x) => a + x.qty, 0));
      if (qr > 0 || qn > 0) filas.push({ sku: s(g.sku), nombre: s(g.nombre), pedido: n(g.pedido), recibido: qr, no_recibido: qn, bodega: rc.length ? nombreBod(s(rc[0].bodega_id)) : "" });
    }
    if (filas.length) actaNum = s((await crearActa(ctx, actor, { oc: o, recepcion_id: s(rec.id) || undefined, lineas: filas })).numero);
  } catch { actaNum = ""; }
  return { ok: true, recepcion: s(rec.numero), recepcion_id: s(rec.id), acta: actaNum };
});

extend("rcp_no_recibido_undo", "any", async (p, ctx, ses) => {
  const actor = actorOf(ses);
  const o = (await todas(ctx, "erp_oc")).find((r) => r.id === s(p.oc_id));
  if (!o) return { error: "OC no encontrada" };
  const L = (await todas(ctx, "erp_oc_lineas")).filter((l) => l.oc_id === o.id && s(l.producto_id) === s(p.producto_id));
  let hecho = 0;
  for (const l of L) {
    const at = s(l.beta_no_recibido_at), q = n(l.beta_no_recibido_qty);
    if (!at || !(q > 0)) continue;
    if (ctx.now.getTime() - new Date(at).getTime() >= UNDO_MS) return { error: "Pasó más de 1 hora: ya no se puede deshacer" };
    await ctx.db.write(actor, "erp_oc_lineas", "update", { id: l.id }, { no_recibido: round2(Math.max(0, n(l.no_recibido) - q)), beta_no_recibido_at: null, beta_no_recibido_por: null, beta_no_recibido_qty: null });
    hecho += q;
  }
  if (!hecho) return { error: "No hay nada que deshacer" };
  await refrescar(ctx, actor, s(o.id));
  await logAccion(ctx.db, actor, "OC NO RECIBIDO DESHACER", `${s(o.numero)} · ${hecho} · ${o.id}`);
  return { ok: true };
});

/** Origen (Consignación | Propio) y uso (Vendible | Insumo cabina) del producto. Solo admin. */
extend("rcp_producto_attr", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const pr = (await todas(ctx, "erp_productos")).find((x) => x.id === s(p.producto_id));
  if (!pr) return { error: "Producto no encontrado" };
  const cambio: Row = {};
  if (p.origen !== undefined) { const v = s(p.origen); if (!["consignacion", "propio", ""].includes(v)) return { error: "Origen inválido" }; cambio.beta_origen = v || null; }
  if (p.uso !== undefined) { const v = s(p.uso); const u = v === "insumo" ? "cabina" : v === "vendible" ? (s(pr.uso) === "ambos" ? "ambos" : "venta") : ""; if (!u) return { error: "Uso inválido" }; cambio.uso = u; }
  if (!Object.keys(cambio).length) return { error: "Nada que cambiar" };
  await ctx.db.write(actorOf(ses), "erp_productos", "update", { id: pr.id }, cambio);
  await logAccion(ctx.db, actorOf(ses), "PRODUCTO ORIGEN/USO", `${s(pr.sku)} · ${JSON.stringify(cambio)}`);
  return { ok: true };
});
