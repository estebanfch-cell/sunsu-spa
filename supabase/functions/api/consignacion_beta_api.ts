// 🤝 Consignación dentro de Compras (TK26, Emilia 17/11): periodo 1–15 / 16–fin (por defecto el anterior),
// lo vendido de los productos en consignación → OC de consignación ligada al periodo, pedido de restock
// con la cantidad que pone el admin, y el stock real de la bodega CONSIGNACION (TK27). El restock se recibe
// en 📥 Recepciones a esa bodega. «Conteo inicial consignación» pasa a mano (y queda registrado) lo que hoy
// está en Venta / Cabinas / Casa. Sin correo automático ni firma pública (decisión de Emilia 17/11).
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { n, round2, s, skuCode, type Row } from "./domain.ts";
import { borradorConsig, familiaDeFila, quincenaDe, vendeDesdeCabina } from "./ventas.ts";
import { hojaProveedores } from "./compras_flujo.ts";
import { crearOc } from "./compras_beta_api.ts";
import { siguienteAnual } from "./compras_beta.ts";
import { BODEGA_CABINA, BODEGA_CASA, BODEGA_CONSIGNACION, BODEGA_VENTA, runErp } from "./erp.ts";
import { crearActa } from "./actas_api.ts";
import { listaProductos } from "./productos_api.ts";
import { consigEfectiva, famsConsig } from "./consig_config.ts";
import { cargarPreciosConsig, ocLegacyDelPeriodo } from "./consig_precios.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const soloAdmin = (ses: Ses): Row | null => esAdmin(ses.rol) ? null : { error: "Solo administradores" };
const ec = (d: Date) => { const x = new Date(d.getTime() - 5 * 3600e3); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() }; };

/** Periodos para elegir: el actual y los 7 anteriores. El por defecto es el anterior al actual (ya cerrado). */
export function periodos(now: Date): Row[] {
  const h = ec(now);
  let y = h.y, m = h.m, q = h.d <= 15 ? 1 : 2;
  const out: Row[] = [];
  for (let i = 0; i < 8; i++) {
    const p = quincenaDe(y, m, 1, q as 1 | 2);
    out.push({ clave: `${y}-${m}-${q}`, anio: y, mes: m, quincena: q, desde: p.ini, hasta: p.fin, label: p.qLabel, actual: i === 0, defecto: i === 1 });
    if (q === 2) q = 1; else { q = 2; m -= 1; if (m < 1) { m = 12; y -= 1; } }
  }
  return out;
}
/** TK34: solo los proveedores con 🤝 Consignación ON (ficha del proveedor). */
async function provsConsig(ctx: Ctx): Promise<Row[]> {
  const [provs, hoja, on] = await Promise.all([todas(ctx, "erp_proveedores"), hojaProveedores(ctx.db), famsConsig(ctx)]);
  return provs.filter((p) => p.activo !== false).map((p) => ({ id: s(p.id), nombre: s(p.nombre), ruc: s(p.ruc), email: s(p.email), telefono: s(p.telefono), familia: familiaDeFila(p, hoja) }))
    .filter((p) => on.has(s(p.familia).toUpperCase())).sort((a, b) => s(a.nombre).localeCompare(s(b.nombre)));
}
/** TK27: stock de los productos en consignación de la familia, como se ve en 📦 Productos:
 *  consignacion = bodega CONSIGNACION (real); venta / cabina / casa = lo que todavía está fuera
 *  (se pasa con «Conteo inicial consignación»). */
export async function stockConsig(ctx: Ctx, ses: Ses, familia: string): Promise<Row[]> {
  const [prods, lista, on] = await Promise.all([todas(ctx, "erp_productos"), listaProductos(ctx, ses), famsConsig(ctx)]);
  const fila = new Map(lista.map((r) => [s(r.id), r]));
  const out: Row[] = [];
  for (const p of prods) {
    const sku = skuCode(s(p.sku));
    if (!sku.startsWith(familia + "-") || p.activo === false || !consigEfectiva(p, on) || s(p.beta_eliminado_at)) continue;
    const f = fila.get(s(p.id)); if (!f) continue;
    const g = (f.porGrupo || {}) as Row;
    const consignacion = round2(n(g.BCONSIG)), venta = round2(n(g.CONSIGNACION)), cabina = round2(n(g.CABINA)), casa = round2(n(g.OFICINA));
    // En Sunsu = bodega CONSIGNACION + lo que todavía está en Venta (el stock del sistema viejo).
    // La bodega CONSIGNACION empieza en 0 hasta el «Conteo inicial»; esas unidades no son «fuera» de consignación.
    const enSunsu = round2(consignacion + venta);
    out.push({ producto_id: s(p.id), sku, nombre: s(p.nombre), consignacion, venta, cabina, casa, enSunsu, fuera: round2(cabina + casa), total: enSunsu, fuente: f.stockFuente || {} });
  }
  return out.sort((a, b) => s(a.sku).localeCompare(s(b.sku)));
}
function notaStock(stock: Row[]): string {
  const venta = stock.filter((x) => n(x.venta) > 0 && n(x.consignacion) === 0).length;
  const fuera = stock.filter((x) => n(x.fuera) > 0).length;
  const bits = [];
  if (venta) bits.push(`${venta} producto(s) tienen el stock de consignación todavía en Venta (el del sistema viejo): la columna «En consignación» ya lo suma. Si quieres pasarlo a la bodega Consignación, usa «Conteo inicial consignación».`);
  if (fuera) bits.push(`${fuera} producto(s) tienen stock en Cabinas / Casa.`);
  return bits.join(" ");
}
function periodoDe(o: Row): { desde: string; hasta: string } {
  let snap: Row = {};
  try { snap = typeof o.snap === "string" ? JSON.parse(o.snap) : (o.snap || {}) as Row; } catch { snap = {}; }
  return { desde: s(snap.desde), hasta: s(snap.hasta) };
}

extend("cns_meta", "any", async (_p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  return { ok: true, proveedores: await provsConsig(ctx), periodos: periodos(ctx.now) };
});

extend("cns_calc", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const provs = await provsConsig(ctx);
  const prov = provs.find((x) => x.id === s(p.proveedor_id));
  if (!prov) return { error: "Elige un proveedor en consignación" };
  const r = await borradorConsig(ctx.db, ctx.now, { proveedor_id: prov.id, familia: prov.familia, anio: p.anio, mes: p.mes, quincena: p.quincena, soloConsig: true });
  if (r.error) return r;
  const prods = await todas(ctx, "erp_productos");
  const idDe = new Map(prods.map((x) => [skuCode(s(x.sku)), s(x.id)]));
  const ocs = (await todas(ctx, "erp_oc")).filter((o) => o.proveedor_id === prov.id && s(o.tipo) === "consignacion" && s(o.estado) !== "cancelada");
  const oc = ocs.find((o) => { const pr = periodoDe(o); return pr.desde === r.ini && pr.hasta === r.fin; });
  const rst = (await todas(ctx, "beta_consig_restock")).filter((x) => s(x.proveedor_id) === prov.id && s(x.estado) !== "anulada");
  const restock = rst.find((x) => s(x.desde) === s(r.ini) && s(x.hasta) === s(r.fin));
  const stock = await stockConsig(ctx, ses, s(prov.familia));
  const items: Row[] = ((r.items || []) as Row[]).map((it) => ({ ...it, producto_id: idDe.get(skuCode(s(it.sku))) || "" }));
  // TK44: detalle del consumo interno del periodo (📦 Abrir producto o transferencia a cabina), a costo.
  const nomDe = new Map(prods.map((x) => [skuCode(s(x.sku)), s(x.nombre)]));
  const consumos = (await todas(ctx, "erp_consignacion_consumo")).filter((c) => s(c.familia) === s(prov.familia) && s(c.quincena_ini).slice(0, 10) === s(r.ini) && s(c.quincena_fin).slice(0, 10) === s(r.fin))
    .sort((a, b) => s(a.fecha).localeCompare(s(b.fecha)))
    .map((c) => ({ fecha: s(c.fecha), sku: skuCode(s(c.sku)), producto: nomDe.get(skuCode(s(c.sku))) || skuCode(s(c.sku)), cantidad: n(c.cantidad), costo: round2(n(c.costo_unit)), origen: /apertura:/.test(s(c.nota)) ? "📦 Abrir producto" : s(c.transferencia_id) ? "🔁 Transferencia a cabina" : "Consumo", detalle: s(c.nota).replace(/\s*·?\s*apertura:[0-9a-f-]+/i, ""), por: s(c.creado_por) }));
  const historial = ocs.map((o) => ({ id: s(o.id), numero: s(o.numero), fecha: s(o.fecha), total: n(o.total), ...periodoDe(o) })).sort((a, b) => s(b.desde).localeCompare(s(a.desde)));
  let ordenes: Row[] = [];
  try { ordenes = await todas(ctx, "ordenes_compra"); } catch { ordenes = []; }
  const ocLegacy = ocLegacyDelPeriodo(ordenes, s(prov.familia), s(r.qLabel));
  const precios = await cargarPreciosConsig(ctx.db, s(prov.familia));
  return {
    ok: true, proveedor: prov, familia: prov.familia, desde: r.ini, hasta: r.fin, label: r.qLabel,
    items, fact: items.filter((it) => n(it.vendido) + n(it.consumido) > 0), totales: r.totales,
    oc: oc ? { id: s(oc.id), numero: s(oc.numero), total: n(oc.total) } : null,
    ocLegacy: ocLegacy ? { numero: s(ocLegacy.numero), fecha: s(ocLegacy.fecha), total: n(ocLegacy.total), subtotal: n(ocLegacy.subtotal) } : null,
    precios: [...precios.values()].sort((a, b) => a.sku.localeCompare(b.sku)),
    restock: restock ? { id: s(restock.id), numero: s(restock.numero), lineas: restock.lineas, estado: s(restock.estado), fecha: s(restock.created_at) } : null,
    stock, stockNota: notaStock(stock), bodegaConsig: (await todas(ctx, "erp_bodegas")).some((b) => s(b.id) === BODEGA_CONSIGNACION),
    consumos, historial, restocks: rst.map((x) => ({ id: s(x.id), numero: s(x.numero), desde: s(x.desde), hasta: s(x.hasta), estado: s(x.estado), oc_id: s(x.oc_id) })),
  };
});

extend("cns_crear_oc", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const provs = await provsConsig(ctx);
  const prov = provs.find((x) => x.id === s(p.proveedor_id));
  if (!prov) return { error: "Elige un proveedor en consignación" };
  const r = await borradorConsig(ctx.db, ctx.now, { proveedor_id: prov.id, familia: prov.familia, anio: p.anio, mes: p.mes, quincena: p.quincena });
  if (r.error) return r;
  const ya = (await todas(ctx, "erp_oc")).find((o) => o.proveedor_id === prov.id && s(o.tipo) === "consignacion" && s(o.estado) !== "cancelada" && periodoDe(o).desde === r.ini && periodoDe(o).hasta === r.fin);
  if (ya) return { error: `Ya existe ${s(ya.numero)} para este periodo`, id: s(ya.id) };
  let ordenes: Row[] = [];
  try { ordenes = await todas(ctx, "ordenes_compra"); } catch { ordenes = []; }
  const yaLegacy = ocLegacyDelPeriodo(ordenes, s(prov.familia), s(r.qLabel));
  if (yaLegacy) return { error: `Ya existe ${s(yaLegacy.numero)} para este periodo (enviada el ${s(yaLegacy.fecha)})`, numero: s(yaLegacy.numero) };
  const fact = ((r.fact || []) as Row[]);
  if (!fact.length) return { error: "No hay ventas de productos en consignación en este periodo" };
  const out = await crearOc(ctx, ses, {
    proveedor_id: prov.id, tipo: "consignacion", desde: r.ini, hasta: r.fin, q_label: `Consignación ${r.qLabel} · ${r.ini} al ${r.fin}`,
    nota: `Vendido desde stock de consignación del proveedor, periodo ${r.qLabel} (${r.ini} al ${r.fin})`,
    lineas: fact.map((it) => ({ sku: it.sku, cantidad: n(it.vendido), precio: n(it.compra) })),
    snap: { periodo: r.qLabel, familia: prov.familia },
  });
  if (out.ok) {
    await upsertPreciosDeFact(ctx, actorOf(ses), s(prov.familia), prov.id, s(out.numero), fact);
    for (const x of (await todas(ctx, "beta_consig_restock")).filter((x) => s(x.proveedor_id) === prov.id && s(x.desde) === s(r.ini) && s(x.hasta) === s(r.fin) && !s(x.oc_id))) {
      await ctx.db.write(actorOf(ses), "beta_consig_restock", "update", { id: x.id }, { oc_id: out.id });
      // TK27: las actas de lo ya recibido de ese restock pasan a verse en la OC.
      for (const a of (await todas(ctx, "beta_actas")).filter((a) => s(a.restock_id) === s(x.id) && !s(a.oc_id))) {
        await ctx.db.write(actorOf(ses), "beta_actas", "update", { id: a.id }, { oc_id: out.id });
      }
    }
  }
  return out;
});

extend("cns_restock_guardar", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const actor = actorOf(ses);
  const provs = await provsConsig(ctx);
  const prov = provs.find((x) => x.id === s(p.proveedor_id));
  if (!prov) return { error: "Elige un proveedor en consignación" };
  const desde = s(p.desde), hasta = s(p.hasta);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return { error: "Periodo inválido" };
  const prods = await todas(ctx, "erp_productos");
  const porId = new Map(prods.map((x) => [s(x.id), x]));
  const L: Row[] = [];
  for (const l of (Array.isArray(p.lineas) ? p.lineas : []) as Row[]) {
    const q = round2(n(l.cantidad)); if (!(q > 0)) continue;
    const pr = porId.get(s(l.producto_id)); if (!pr) return { error: "Producto no está en el catálogo" };
    if (!skuCode(s(pr.sku)).startsWith(prov.familia + "-")) return { error: `${skuCode(s(pr.sku))} no es de ${prov.nombre}` };
    L.push({ producto_id: s(pr.id), sku: skuCode(s(pr.sku)), nombre: s(pr.nombre), cantidad: q, recibido: 0 });
  }
  if (!L.length) return { error: "Pon la cantidad de restock de al menos un producto" };
  const todos = await todas(ctx, "beta_consig_restock");
  const prev = todos.find((x) => s(x.id) === s(p.id)) || todos.find((x) => s(x.proveedor_id) === prov.id && s(x.desde) === desde && s(x.hasta) === hasta && s(x.estado) === "abierta");
  const oc = (await todas(ctx, "erp_oc")).find((o) => o.proveedor_id === prov.id && s(o.tipo) === "consignacion" && s(o.estado) !== "cancelada" && periodoDe(o).desde === desde && periodoDe(o).hasta === hasta);
  if (prev) {
    if (s(prev.estado) !== "abierta") return { error: "Ese pedido ya no está abierto" };
    await ctx.db.write(actor, "beta_consig_restock", "update", { id: prev.id }, { lineas: L, nota: s(p.nota).slice(0, 500), oc_id: oc ? oc.id : prev.oc_id || null, updated_at: ctx.now.toISOString() });
    await logAccion(ctx.db, actor, "RESTOCK GUARDAR", `${s(prev.numero)} · ${prov.nombre}`);
    return { ok: true, id: s(prev.id), numero: s(prev.numero) };
  }
  const numero = siguienteAnual(todos, "RST", ec(ctx.now).y);
  const id = crypto.randomUUID();
  await ctx.db.write(actor, "beta_consig_restock", "insert", {}, { id, numero, proveedor_id: prov.id, oc_id: oc ? oc.id : null, familia: prov.familia, desde, hasta, lineas: L, estado: "abierta", nota: s(p.nota).slice(0, 500), creado_por: actor, created_at: ctx.now.toISOString() });
  await logAccion(ctx.db, actor, "RESTOCK CREAR", `${numero} · ${prov.nombre} · ${desde} → ${hasta}`);
  return { ok: true, id, numero };
});

extend("cns_restock_anular", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const x = (await todas(ctx, "beta_consig_restock")).find((r) => s(r.id) === s(p.id));
  if (!x) return { error: "Pedido no encontrado" };
  if (s(x.estado) !== "abierta") return { error: "Ya no está abierto" };
  await ctx.db.write(actorOf(ses), "beta_consig_restock", "update", { id: x.id }, { estado: "anulada", updated_at: ctx.now.toISOString() });
  await logAccion(ctx.db, actorOf(ses), "RESTOCK ANULAR", s(x.numero));
  return { ok: true };
});

/** Pedidos de restock abiertos para 📥 Recepciones (TK27: se reciben a la bodega CONSIGNACION). */
export async function restocksAbiertos(ctx: Ctx): Promise<Row[]> {
  const [rs, provs, hoja] = await Promise.all([todas(ctx, "beta_consig_restock"), todas(ctx, "erp_proveedores"), hojaProveedores(ctx.db)]);
  return rs.filter((x) => s(x.estado) === "abierta").map((x) => {
    const L = Array.isArray(x.lineas) ? x.lineas as Row[] : [];
    const recibido = L.some((l) => n(l.recibido) > 0 || n(l.no_recibido) > 0);
    const pv = provs.find((p) => p.id === x.proveedor_id);
    return { id: "rst:" + s(x.id), numero: s(x.numero), fecha: s(x.created_at).slice(0, 10), fecha_esperada: "", tipo: "restock", estado: recibido ? "Recibida parcial" : "Por recibir", proveedor: s(pv?.nombre), familia: familiaDeFila(pv, hoja), productos: L.length, pendiente: round2(L.reduce((a, l) => a + pendienteRst(l), 0)) };
  });
}
const pendienteRst = (l: Row) => Math.max(0, round2(n(l.cantidad) - n(l.recibido) - n(l.no_recibido)));
export async function restockParaRecibir(ctx: Ctx, id: string): Promise<Row | null> {
  const x = (await todas(ctx, "beta_consig_restock")).find((r) => s(r.id) === id);
  if (!x) return null;
  const [provs, bods, actas, hoja] = await Promise.all([todas(ctx, "erp_proveedores"), todas(ctx, "erp_bodegas"), todas(ctx, "beta_actas"), hojaProveedores(ctx.db)]);
  const prov = provs.find((p) => p.id === x.proveedor_id);
  const L = Array.isArray(x.lineas) ? x.lineas as Row[] : [];
  const cons = bods.find((b) => s(b.id) === BODEGA_CONSIGNACION);
  const recibido = L.some((l) => n(l.recibido) > 0 || n(l.no_recibido) > 0);
  const estado = s(x.estado) === "abierta" ? (recibido ? "Recibida parcial" : "Por recibir") : s(x.estado) === "recibida" ? "Recibida" : "Anulada";
  return {
    ok: true, admin: false,
    oc: { id: "rst:" + s(x.id), numero: s(x.numero), fecha: s(x.created_at).slice(0, 10), tipo: "restock", estado, proveedor: s(prov?.nombre), familia: familiaDeFila(prov, hoja), recibible: s(x.estado) === "abierta" && !!cons },
    bloqueado: !cons ? "Falta la bodega CONSIGNACION (20261117_beta_bodega_consignacion.sql)." : s(x.estado) === "anulada" ? "Este pedido de restock está anulado." : "",
    grupos: L.map((l) => ({ producto_id: s(l.producto_id), sku: s(l.sku), nombre: s(l.nombre), pedido: n(l.cantidad), recibido: n(l.recibido), no_recibido: n(l.no_recibido), pendiente: pendienteRst(l), lineas: [s(l.producto_id)], uso: "vendible", origen: "consignacion", deshacer: 0, bodega_id: BODEGA_CONSIGNACION })),
    bodegas: cons ? [{ id: s(cons.id), codigo: s(cons.codigo), nombre: s(cons.nombre), tipo: s(cons.tipo) }] : [],
    recepciones: actas.filter((a) => s(a.restock_id) === s(x.id)).map((a) => ({ id: s(a.id), numero: s(a.numero), fecha: s(a.created_at), por: s(a.creado_por) })),
  };
}

/** TK27: recibir un pedido de restock (RST) en 📥 Recepciones. Lo recibido entra a la bodega CONSIGNACION
 *  (kardex: recepcion, doc restock); lo no recibido se anula. Cuando no queda nada pendiente, el RST queda «recibida».
 *  Se genera el acta de entrega-recepción como en las OC. */
export async function recibirRestock(ctx: Ctx, ses: Ses, id: string, ins: Row[], nota: string): Promise<Row> {
  const actor = actorOf(ses);
  const x = (await todas(ctx, "beta_consig_restock")).find((r) => s(r.id) === id);
  if (!x) return { error: "Pedido no encontrado" };
  if (s(x.estado) !== "abierta") return { error: "Este pedido ya no está abierto" };
  if (!(await todas(ctx, "erp_bodegas")).some((b) => s(b.id) === BODEGA_CONSIGNACION)) return { error: "Falta la bodega CONSIGNACION" };
  const L = (Array.isArray(x.lineas) ? x.lineas as Row[] : []).map((l) => ({ ...l }));
  const moves: Row[] = [], filas: Row[] = [], log: string[] = [];
  const stamp = ctx.now.getTime();
  for (const it of ins) {
    const l = L.find((y) => s(y.producto_id) === s(it.producto_id));
    if (!l) return { error: "Ese producto no está en el pedido" };
    const pend = pendienteRst(l);
    const accion = s(it.accion);
    if (accion === "no_recibido") {
      if (pend <= 0) continue;
      l.no_recibido = round2(n(l.no_recibido) + pend);
      filas.push({ sku: s(l.sku), nombre: s(l.nombre), pedido: n(l.cantidad), recibido: 0, no_recibido: pend, bodega: "" });
      log.push(`${s(l.sku)} no recibido ${pend}`);
      continue;
    }
    if (accion !== "recibido") continue;
    const q = round2(n(it.cantidad));
    if (!(q > 0)) continue;
    if (q > pend + 1e-9) return { error: `${s(l.sku)}: recibes ${q} y solo quedan ${pend} por recibir` };
    l.recibido = round2(n(l.recibido) + q);
    moves.push({ producto_id: s(l.producto_id), bodega_id: BODEGA_CONSIGNACION, delta: q, tipo: "recepcion", doc_tipo: "restock", doc_id: s(x.id), nota: "restock " + s(x.numero), legacy_ref: `rst:${s(x.id)}:${s(l.producto_id)}:${stamp}` });
    filas.push({ sku: s(l.sku), nombre: s(l.nombre), pedido: n(l.cantidad), recibido: q, no_recibido: 0, bodega: "Consignación" });
    log.push(`${s(l.sku)} +${q} → Consignación`);
  }
  if (!filas.length) return { error: "Marca al menos un producto como Recibido (con cantidad) o No recibido" };
  if (moves.length) {
    const out = await runErp("stock_delta", { moves, aprobar_negativo: true }, ctx.db, actor, ctx.now);
    if (out.error) return out;
  }
  const listo = L.every((l) => pendienteRst(l) <= 0);
  await ctx.db.write(actor, "beta_consig_restock", "update", { id: x.id }, { lineas: L, estado: listo ? "recibida" : "abierta", updated_at: ctx.now.toISOString() });
  await logAccion(ctx.db, actor, "RESTOCK RECIBIR", `${s(x.numero)} · ${log.join(" · ")}${nota ? " · " + nota : ""}`);
  let acta = "";
  try { acta = s((await crearActa(ctx, actor, { oc: { id: s(x.oc_id), numero: s(x.numero), proveedor_id: s(x.proveedor_id) }, restock_id: s(x.id), lineas: filas })).numero); } catch { acta = ""; }
  return { ok: true, recepcion: s(x.numero), acta, estado: listo ? "recibida" : "abierta" };
}

const ORIGEN_CONTEO: Record<string, { bodega: string; grupo: string; nombre: string }> = {
  VENTA: { bodega: BODEGA_VENTA, grupo: "CONSIGNACION", nombre: "Venta" },
  CABINA: { bodega: BODEGA_CABINA, grupo: "CABINA", nombre: "Bodega Cabina" },
  OFICINA: { bodega: BODEGA_CASA, grupo: "OFICINA", nombre: "Casa / Oficina" },
};

/** TK27: propuesta del conteo inicial — stock de los productos en consignación del proveedor, por bodega. */
extend("cns_conteo_inicial", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const prov = (await provsConsig(ctx)).find((x) => x.id === s(p.proveedor_id));
  if (!prov) return { error: "Elige un proveedor en consignación" };
  const stock = await stockConsig(ctx, ses, s(prov.familia));
  const movs = (await todas(ctx, "erp_movimientos")).filter((m) => s(m.doc_tipo) === "conteo_consig" && n(m.delta) > 0);
  const hechos = new Map<string, number>();
  for (const m of movs) hechos.set(s(m.producto_id), round2((hechos.get(s(m.producto_id)) || 0) + n(m.delta)));
  return { ok: true, proveedor: prov, items: stock.map((x) => ({ ...x, yaPasado: hechos.get(s(x.producto_id)) || 0 })) };
});

/** items: [{producto_id, desde: VENTA|CABINA|OFICINA, cantidad}] → sale de esa bodega y entra a CONSIGNACION.
 *  Kardex: transferencia_out / transferencia_in (doc conteo_consig). Si esa bodega se muestra desde la hoja
 *  (Venta del sistema viejo, Cabina de cabina_inventario) también va a beta_stock_movimientos para que
 *  📦 Productos baje lo mismo. Nunca más de lo que hay. Queda en log_acciones. */
extend("cns_conteo_transferir", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const actor = actorOf(ses);
  if (!(await todas(ctx, "erp_bodegas")).some((b) => s(b.id) === BODEGA_CONSIGNACION)) return { error: "Falta la bodega CONSIGNACION" };
  const prov = (await provsConsig(ctx)).find((x) => x.id === s(p.proveedor_id));
  if (!prov) return { error: "Elige un proveedor en consignación" };
  const stock = new Map((await stockConsig(ctx, ses, s(prov.familia))).map((x) => [s(x.producto_id), x]));
  const ins = (Array.isArray(p.items) ? p.items : []) as Row[];
  const usado = new Map<string, number>();
  const moves: Row[] = [], beta: Row[] = [], log: string[] = [];
  const stamp = ctx.now.getTime();
  const numero = "CIC-" + new Date(ctx.now.getTime() - 5 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, "");
  for (const it of ins) {
    const q = round2(n(it.cantidad)); if (!(q > 0)) continue;
    const st = stock.get(s(it.producto_id));
    if (!st) return { error: "Ese producto no es de consignación de " + s(prov.nombre) };
    const o = ORIGEN_CONTEO[s(it.desde).toUpperCase()];
    if (!o) return { error: "Bodega de origen inválida" };
    const campo = o.grupo === "CONSIGNACION" ? "venta" : o.grupo === "CABINA" ? "cabina" : "casa";
    const k = s(st.producto_id) + ":" + campo;
    const hay = round2(n(st[campo]) - (usado.get(k) || 0));
    if (q > hay + 1e-9) return { error: `${s(st.sku)}: pasas ${q} de ${o.nombre} y solo hay ${Math.max(0, hay)}` };
    usado.set(k, round2((usado.get(k) || 0) + q));
    const ref = `cic:${stamp}:${s(st.producto_id)}:${campo}`;
    const nota = `Conteo inicial consignación ${numero}: ${o.nombre} → Consignación`;
    moves.push({ producto_id: s(st.producto_id), bodega_id: o.bodega, delta: -q, tipo: "transferencia_out", doc_tipo: "conteo_consig", nota, legacy_ref: ref + ":out" });
    moves.push({ producto_id: s(st.producto_id), bodega_id: BODEGA_CONSIGNACION, delta: q, tipo: "transferencia_in", doc_tipo: "conteo_consig", nota, legacy_ref: ref + ":in" });
    const fuente = (st.fuente || {}) as Row;
    if ((campo === "venta" && s(fuente.venta) === "hoja") || (campo === "cabina" && s(fuente.cabina) === "hoja")) {
      beta.push({ id: crypto.randomUUID(), fecha: ctx.now.toISOString(), producto_id: s(st.producto_id), sku: s(st.sku), bodega: o.grupo, sububicacion: null, delta: -q, tipo: "transferencia", doc_id: null, doc_numero: numero, actor, nota });
    }
    log.push(`${s(st.sku)} ${q} ${o.nombre}`);
  }
  if (!moves.length) return { error: "Pon cuánto pasar de al menos un producto" };
  const out = await runErp("stock_delta", { moves, aprobar_negativo: true }, ctx.db, actor, ctx.now);
  if (out.error) return out;
  for (const b of beta) await ctx.db.write(actor, "beta_stock_movimientos", "insert", {}, b);
  await logAccion(ctx.db, actor, "CONSIG CONTEO INICIAL", `${numero} · ${s(prov.nombre)} · ${log.join(" · ")}`);
  return { ok: true, numero, n: log.length };
});

async function upsertPreciosDeFact(ctx: Ctx, actor: string, familia: string, proveedorId: unknown, ocNumero: string, fact: Row[]): Promise<void> {
  let rows: Row[] = [];
  try { rows = await todas(ctx, "beta_consig_precios"); } catch { return; }
  for (const it of fact) {
    const sku = skuCode(s(it.sku));
    const precio = n(it.compra);
    if (!sku || !(precio > 0)) continue;
    const prev = rows.find((r) => s(r.familia).toUpperCase() === familia.toUpperCase() && skuCode(s(r.sku)) === sku);
    if (prev && s(prev.fuente) === "manual") continue;
    const row = { familia: familia.toUpperCase(), sku, producto_id: s(it.producto_id) || null, proveedor_id: proveedorId || null, precio, fuente: "oc", oc_numero: ocNumero, actualizado_por: actor, updated_at: ctx.now.toISOString() };
    if (prev) await ctx.db.write(actor, "beta_consig_precios", "update", { id: prev.id }, row);
    else await ctx.db.write(actor, "beta_consig_precios", "insert", {}, { id: crypto.randomUUID(), ...row, created_at: ctx.now.toISOString() });
  }
}

extend("cns_precios_guardar", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const actor = actorOf(ses);
  const provs = await provsConsig(ctx);
  const prov = provs.find((x) => x.id === s(p.proveedor_id));
  if (!prov) return { error: "Elige un proveedor en consignación" };
  const prods = await todas(ctx, "erp_productos");
  const porSku = new Map(prods.map((x) => [skuCode(s(x.sku)), x]));
  let rows: Row[] = [];
  try { rows = await todas(ctx, "beta_consig_precios"); } catch { return { error: "Falta la tabla de precios de consignación (20261118_tk70_consig_precios.sql)" }; }
  const out: Row[] = [];
  for (const l of (Array.isArray(p.precios) ? p.precios : []) as Row[]) {
    const sku = skuCode(s(l.sku));
    const precio = n(l.precio);
    if (!sku || !sku.startsWith(s(prov.familia) + "-")) return { error: `SKU inválido: ${sku || "(vacío)"}` };
    if (!(precio > 0)) return { error: `${sku}: el precio de consignación tiene que ser mayor a 0` };
    const prod = porSku.get(sku);
    const prev = rows.find((r) => s(r.familia).toUpperCase() === s(prov.familia).toUpperCase() && skuCode(s(r.sku)) === sku);
    const row = { familia: s(prov.familia).toUpperCase(), sku, producto_id: prod ? s(prod.id) : null, proveedor_id: prov.id, precio, fuente: "manual", oc_numero: prev ? s(prev.oc_numero) : null, actualizado_por: actor, updated_at: ctx.now.toISOString() };
    const saved = prev
      ? await ctx.db.write(actor, "beta_consig_precios", "update", { id: prev.id }, row)
      : await ctx.db.write(actor, "beta_consig_precios", "insert", {}, { id: crypto.randomUUID(), ...row, created_at: ctx.now.toISOString() });
    out.push(saved || row);
  }
  if (!out.length) return { error: "No hay precios para guardar" };
  await logAccion(ctx.db, actor, "CONSIG PRECIO", `${s(prov.nombre)} · ${out.map((x) => `${s(x.sku)} $${n(x.precio)}`).join(" · ")}`);
  return { ok: true, n: out.length, precios: out };
});
