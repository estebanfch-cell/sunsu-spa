// 🤝 Consignación dentro de Compras (TK26, Emilia 17/11): periodo 1–15 / 16–fin (por defecto el anterior),
// lo vendido de los productos en consignación → OC de consignación ligada al periodo, pedido de restock
// con la cantidad que pone el admin, y el stock actual de esos productos (sin bodega de consignación:
// se calcula de Venta + Cabinas + Casa y se marca como referencial).
// EN ESPERA (Emilia decide): bodega de consignación (recibir el restock), correo automático y firma pública.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { n, round2, s, skuCode, type Row } from "./domain.ts";
import { borradorConsig, familiaDeFila, quincenaDe, vendeDesdeCabina } from "./ventas.ts";
import { hojaProveedores } from "./compras_flujo.ts";
import { crearOc } from "./compras_beta_api.ts";
import { siguienteAnual } from "./compras_beta.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const soloAdmin = (ses: Ses): Row | null => esAdmin(ses.rol) ? null : { error: "Solo administradores" };
const FAM_CONSIG = ["HT", "AS", "ML", "PH", "JN"];
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
async function provsConsig(ctx: Ctx): Promise<Row[]> {
  const [provs, hoja] = await Promise.all([todas(ctx, "erp_proveedores"), hojaProveedores(ctx.db)]);
  return provs.filter((p) => p.activo !== false).map((p) => ({ id: s(p.id), nombre: s(p.nombre), ruc: s(p.ruc), email: s(p.email), telefono: s(p.telefono), familia: familiaDeFila(p, hoja) }))
    .filter((p) => FAM_CONSIG.includes(s(p.familia))).sort((a, b) => s(a.nombre).localeCompare(s(b.nombre)));
}
/** Stock actual de los productos de la familia en consignación, por bodega (no hay bodega de consignación todavía). */
async function stockConsig(ctx: Ctx, familia: string): Promise<Row[]> {
  const [prods, stock, bods] = await Promise.all([todas(ctx, "erp_productos"), todas(ctx, "erp_stock"), todas(ctx, "erp_bodegas")]);
  const tipo = new Map(bods.map((b) => [s(b.id), s(b.tipo)]));
  const out: Row[] = [];
  for (const p of prods) {
    const sku = skuCode(s(p.sku));
    if (!sku.startsWith(familia + "-") || p.activo === false || vendeDesdeCabina(p) || s(p.beta_origen) === "propio") continue;
    const st = stock.filter((r) => r.producto_id === p.id);
    const por = (t: string) => round2(st.filter((r) => tipo.get(s(r.bodega_id)) === t).reduce((a, r) => a + n(r.cantidad), 0));
    const venta = por("venta"), cabina = por("cabina"), casa = por("casa");
    out.push({ producto_id: s(p.id), sku, nombre: s(p.nombre), venta, cabina, casa, total: round2(venta + cabina + casa) });
  }
  return out.sort((a, b) => s(a.sku).localeCompare(s(b.sku)));
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
  const r = await borradorConsig(ctx.db, ctx.now, { proveedor_id: prov.id, familia: prov.familia, anio: p.anio, mes: p.mes, quincena: p.quincena });
  if (r.error) return r;
  const prods = await todas(ctx, "erp_productos");
  const idDe = new Map(prods.map((x) => [skuCode(s(x.sku)), s(x.id)]));
  const ocs = (await todas(ctx, "erp_oc")).filter((o) => o.proveedor_id === prov.id && s(o.tipo) === "consignacion" && s(o.estado) !== "cancelada");
  const oc = ocs.find((o) => { const pr = periodoDe(o); return pr.desde === r.ini && pr.hasta === r.fin; });
  const rst = (await todas(ctx, "beta_consig_restock")).filter((x) => s(x.proveedor_id) === prov.id && s(x.estado) !== "anulada");
  const restock = rst.find((x) => s(x.desde) === s(r.ini) && s(x.hasta) === s(r.fin));
  const stock = await stockConsig(ctx, s(prov.familia));
  const items: Row[] = ((r.items || []) as Row[]).map((it) => ({ ...it, producto_id: idDe.get(skuCode(s(it.sku))) || "" }));
  const historial = ocs.map((o) => ({ id: s(o.id), numero: s(o.numero), fecha: s(o.fecha), total: n(o.total), ...periodoDe(o) })).sort((a, b) => s(b.desde).localeCompare(s(a.desde)));
  return {
    ok: true, proveedor: prov, familia: prov.familia, desde: r.ini, hasta: r.fin, label: r.qLabel,
    items, fact: items.filter((it) => n(it.vendido) + n(it.consumido) > 0), totales: r.totales,
    oc: oc ? { id: s(oc.id), numero: s(oc.numero), total: n(oc.total) } : null,
    restock: restock ? { id: s(restock.id), numero: s(restock.numero), lineas: restock.lineas, estado: s(restock.estado), fecha: s(restock.created_at) } : null,
    stock, stockNota: "Referencial: sin bodega de consignación todavía, es el stock actual de estos productos en Venta + Cabinas + Casa.",
    historial, restocks: rst.map((x) => ({ id: s(x.id), numero: s(x.numero), desde: s(x.desde), hasta: s(x.hasta), estado: s(x.estado), oc_id: s(x.oc_id) })),
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
  const fact = ((r.fact || []) as Row[]);
  if (!fact.length) return { error: "No hay ventas de productos en consignación en este periodo" };
  const out = await crearOc(ctx, ses, {
    proveedor_id: prov.id, tipo: "consignacion", desde: r.ini, hasta: r.fin, q_label: `Consignación ${r.qLabel} · ${r.ini} al ${r.fin}`,
    nota: `Vendido en consignación, periodo ${r.qLabel} (${r.ini} al ${r.fin})`,
    lineas: fact.map((it) => ({ sku: it.sku, cantidad: n(it.vendido) + n(it.consumido), precio: n(it.compra) })),
    snap: { periodo: r.qLabel, familia: prov.familia },
  });
  if (out.ok) {
    for (const x of (await todas(ctx, "beta_consig_restock")).filter((x) => s(x.proveedor_id) === prov.id && s(x.desde) === s(r.ini) && s(x.hasta) === s(r.fin) && !s(x.oc_id))) {
      await ctx.db.write(actorOf(ses), "beta_consig_restock", "update", { id: x.id }, { oc_id: out.id });
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

/** Pedidos de restock abiertos para 📥 Recepciones (recibir a la bodega de consignación: en espera). */
export async function restocksAbiertos(ctx: Ctx): Promise<Row[]> {
  const [rs, provs] = await Promise.all([todas(ctx, "beta_consig_restock"), todas(ctx, "erp_proveedores")]);
  return rs.filter((x) => s(x.estado) === "abierta").map((x) => {
    const L = Array.isArray(x.lineas) ? x.lineas as Row[] : [];
    return { id: "rst:" + s(x.id), numero: s(x.numero), fecha: s(x.created_at).slice(0, 10), fecha_esperada: "", tipo: "restock", estado: "Por recibir", proveedor: s(provs.find((p) => p.id === x.proveedor_id)?.nombre), productos: L.length, pendiente: round2(L.reduce((a, l) => a + Math.max(0, n(l.cantidad) - n(l.recibido)), 0)) };
  });
}
export async function restockParaRecibir(ctx: Ctx, id: string): Promise<Row | null> {
  const x = (await todas(ctx, "beta_consig_restock")).find((r) => s(r.id) === id);
  if (!x) return null;
  const prov = (await todas(ctx, "erp_proveedores")).find((p) => p.id === x.proveedor_id);
  const L = Array.isArray(x.lineas) ? x.lineas as Row[] : [];
  return {
    ok: true, admin: false,
    oc: { id: "rst:" + s(x.id), numero: s(x.numero), fecha: s(x.created_at).slice(0, 10), tipo: "restock", estado: s(x.estado) === "abierta" ? "Por recibir" : s(x.estado), proveedor: s(prov?.nombre), recibible: false },
    bloqueado: "Pedido de restock de consignación. Recibirlo a la bodega de consignación está en espera (falta definir esa bodega): por ahora no mueve stock.",
    grupos: L.map((l) => ({ producto_id: s(l.producto_id), sku: s(l.sku), nombre: s(l.nombre), pedido: n(l.cantidad), recibido: n(l.recibido), no_recibido: 0, pendiente: Math.max(0, n(l.cantidad) - n(l.recibido)), lineas: [s(l.producto_id)], uso: "vendible", origen: "consignacion", deshacer: 0 })),
    bodegas: [], recepciones: [],
  };
}
