// 🛒 Compras v2 de la beta (Emilia 17/11): lista y detalle como Tickets, OC-AAAA-NNNN, sin Borrador
// (las pre-órdenes son «Cotización de proveedor» en beta_oc_cotizaciones), pago dentro de la OC.
// Reusa erp_oc / erp_oc_lineas / erp_oc_pagos y el flujo de compras_flujo.ts. No toca hojas.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { n, round2, s, skuCode, ymdUtc, type Row } from "./domain.ts";
import { comprasPago, escribirLineas, hojaProveedores, ordenesLegadas, precioDe, vistaOc } from "./compras_flujo.ts";
import { subirFactura } from "./compras_api.ts";
import { runErp } from "./erp.ts";
import { consultar } from "./query.ts";
import { actasDeOc } from "./actas_api.ts";
import { familiaDeFila } from "./ventas.ts";
import { estadoOc, estadoPago, siguienteAnual, totales } from "./compras_beta.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const soloAdmin = (ses: Ses): Row | null => esAdmin(ses.rol) ? null : { error: "Solo administradores" };
const uid = () => crypto.randomUUID();
const anioEc = (d: Date) => Number(new Date(d.getTime() - 5 * 3600e3).toISOString().slice(0, 4));
const hoyEc = (d: Date) => new Date(d.getTime() - 5 * 3600e3).toISOString().slice(0, 10);

function provVista(p: Row | undefined, hoja: Row[]): Row {
  if (!p) return {};
  return { id: s(p.id), nombre: s(p.nombre), ruc: s(p.ruc), email: s(p.email), telefono: s(p.telefono), contacto: s(p.contacto), familia: familiaDeFila(p, hoja) };
}
function provVistaStaff(p: Row | undefined, hoja: Row[]): Row {
  if (!p) return {};
  const familia = familiaDeFila(p, hoja);
  return { id: s(p.id), familia, nombre: familia };
}
async function bolsa(ctx: Ctx) {
  const [prods, provs, hoja, legadas, lineas, pagos] = await Promise.all([todas(ctx, "erp_productos"), todas(ctx, "erp_proveedores"), hojaProveedores(ctx.db), ordenesLegadas(ctx.db), todas(ctx, "erp_oc_lineas"), todas(ctx, "erp_oc_pagos")]);
  return { prods, provs, hoja, legadas, lineas, pagos };
}
function enriquecer(v: Row, o: Row, ctxProv: Row, legacy: boolean): Row {
  const L = (v.lineas || []) as Row[];
  const estado = estadoOc(o, L.map((l) => ({ ...l, cantidad: l.pedido })), legacy);
  const total = n(v.total), pagado = n(v.pagado);
  return { ...v, estado, legacy, pago: estadoPago(total, pagado), prov: ctxProv, ...(v.total != null ? { subtotal: n(o.subtotal) || n(v.total), iva: n(o.iva), flete: n(o.flete) } : {}), tipo: s(o.tipo) || "compra", fecha_esperada: s(o.fecha_esperada), nota: s(o.nota), creado_por: s(o.creado_por) };
}

extend("cmpb_meta", "any", async (_p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const [prods, provs, hoja] = await Promise.all([todas(ctx, "erp_productos"), todas(ctx, "erp_proveedores"), hojaProveedores(ctx.db)]);
  return {
    ok: true,
    proveedores: provs.filter((p) => p.activo !== false).map((p) => provVista(p, hoja)).sort((a, b) => s(a.nombre).localeCompare(s(b.nombre))),
    productos: prods.filter((p) => p.activo !== false && s(p.tipo) !== "servicio" && !p.beta_eliminado_at && !p.beta_archivado_at).map((p) => ({ id: s(p.id), sku: skuCode(p.sku), nombre: s(p.nombre), costo: precioDe(p), uso: s(p.uso), origen: s(p.beta_origen), marca: s(p.marca) })),
  };
});

extend("cmpb_lista", "any", async (_p, ctx, ses) => {
  const admin = esAdmin(ses.rol);
  const b = await bolsa(ctx);
  const ocs = (await todas(ctx, "erp_oc")).filter((o) => !(s(o.flujo) === "Borrador" || s(o.estado) === "borrador"));
  const provs = new Map(b.provs.map((p) => [s(p.id), p]));
  const items: Row[] = [];
  for (const o of ocs) {
    const reales = b.lineas.filter((l) => l.oc_id === o.id);
    const v = await vistaOc(ctx.db, o, admin, b.pagos, b);
    const it = enriquecer(v, o, admin ? provVista(provs.get(s(o.proveedor_id)), b.hoja) : provVistaStaff(provs.get(s(o.proveedor_id)), b.hoja), !reales.length);
    delete it.lineas; it.nLineas = ((v.lineas || []) as Row[]).length;
    items.push(it);
  }
  items.sort((a, b2) => s(b2.fecha).localeCompare(s(a.fecha)) || s(b2.numero).localeCompare(s(a.numero)));
  let cot: Row[] = [];
  if (admin) {
    const cs = await todas(ctx, "beta_oc_cotizaciones");
    cot = cs.filter((c) => s(c.estado) !== "anulada").map((c) => {
      const L = Array.isArray(c.lineas) ? c.lineas as Row[] : [];
      const t = totales(L, c.con_iva !== false);
      return { id: s(c.id), numero: s(c.numero), fecha: s(c.fecha), estado: s(c.estado) === "convertida" ? "Convertida" : "Abierta", oc_id: s(c.oc_id), ocNumero: s(ocs.find((o) => o.id === c.oc_id)?.numero), prov: provVista(provs.get(s(c.proveedor_id)), b.hoja), total: t.total, nLineas: L.length };
    });
    // Pre-órdenes «Borrador» de antes: también son cotizaciones (se convierten a OC con número nuevo).
    for (const o of (await todas(ctx, "erp_oc")).filter((o) => s(o.flujo) === "Borrador" || s(o.estado) === "borrador")) {
      if (s(o.estado) === "cancelada") continue;
      cot.push({ id: "oc:" + s(o.id), numero: "Pre-orden " + s(o.q_label || o.fecha), fecha: s(o.fecha), estado: "Abierta", prov: provVista(provs.get(s(o.proveedor_id)), b.hoja), total: n(o.total), nLineas: b.lineas.filter((l) => l.oc_id === o.id).length, legacy: true });
    }
    cot.sort((a, b2) => s(b2.fecha).localeCompare(s(a.fecha)));
  }
  return { ok: true, admin, items, cotizaciones: cot };
});

extend("cmpb_get", "any", async (p, ctx, ses) => {
  const admin = esAdmin(ses.rol);
  const o = (await todas(ctx, "erp_oc")).find((r) => r.id === p.id || s(r.numero) === s(p.id));
  if (!o) return { error: "OC no encontrada" };
  const b = await bolsa(ctx);
  const reales = b.lineas.filter((l) => l.oc_id === o.id);
  const v = await vistaOc(ctx.db, o, admin, b.pagos, b);
  const prov = admin ? provVista(b.provs.find((x) => x.id === o.proveedor_id), b.hoja) : provVistaStaff(b.provs.find((x) => x.id === o.proveedor_id), b.hoja);
  const out = enriquecer(v, o, prov, !reales.length);
  const porId = new Map(b.prods.map((x) => [s(x.id), x]));
  out.lineas = ((v.lineas || []) as Row[]).map((l) => { const r = reales.find((x) => x.id === l.id); const pr = r ? porId.get(s(r.producto_id)) : undefined; return { ...l, nombre: s(l.nombre) || s(pr?.nombre) || s(l.sku), producto_id: s(r?.producto_id) }; });
  if (admin) out.pagos = b.pagos.filter((x) => x.oc_id === o.id).map((x) => ({ id: s(x.id), fecha: s(x.fecha), monto: n(x.monto), banco: s(x.beta_banco), referencia: s(x.beta_referencia), nota: s(x.nota), comprobante: s(x.archivo_nombre), actor: s(x.actor) }));
  const recs = (await todas(ctx, "erp_recepciones")).filter((r) => r.oc_id === o.id);
  out.recepciones = recs.map((r) => ({ id: s(r.id), numero: s(r.numero), fecha: s(r.fecha), por: s(r.recibido_por), anulada: r.anulada === true }));
  let logs: Row[] = [];
  try { logs = (await consultar(ctx.db, "log_acciones", { cols: ["fecha", "usuario", "accion", "detalle"], filtros: [{ op: "palabras", cols: ["detalle"], val: [s(o.id)] }], limite: 60 })).rows; } catch { logs = []; }
  out.historial = logs.sort((a, b2) => s(a.fecha).localeCompare(s(b2.fecha))).map((x) => ({ fecha: s(x.fecha), accion: s(x.accion), detalle: s(x.detalle).replace(" · " + s(o.id), ""), actor: s(x.usuario) }));
  out.puedeCancelar = admin && (out.estado === "Por recibir" || out.estado === "Aprobada");
  out.actas = await actasDeOc(ctx, s(o.id));
  out.puedePagar = admin && out.estado !== "Cancelada" && out.pago !== "Pagada" && !out.legacy;
  return { ok: true, admin, oc: out };
});

/** Crea una OC aprobada (sin borrador) con número OC-AAAA-NNNN. Desde cero o desde una cotización. */
export async function crearOc(ctx: Ctx, ses: Ses, p: Row): Promise<Row> {
  const actor = actorOf(ses);
  const prov = (await todas(ctx, "erp_proveedores")).find((r) => r.id === s(p.proveedor_id));
  if (!prov) return { error: "Elige el proveedor" };
  const prods = await todas(ctx, "erp_productos");
  const porId = new Map(prods.map((x) => [s(x.id), x]));
  const lineas = ((Array.isArray(p.lineas) ? p.lineas : []) as Row[]).map((l) => {
    const pr = porId.get(s(l.producto_id)) || prods.find((x) => skuCode(x.sku) === skuCode(s(l.sku)));
    return pr ? { producto_id: s(pr.id), sku: skuCode(pr.sku), cantidad: n(l.cantidad), precio: l.precio != null && s(l.precio) !== "" ? n(l.precio) : precioDe(pr), plazo: s(p.tipo) === "consignacion" ? "CONSIGNACION" : "COMPRA" } : null;
  });
  if (lineas.some((l) => !l)) return { error: "Hay un producto que no está en el catálogo" };
  const L = (lineas as Row[]).filter((l) => n(l.cantidad) > 0);
  if (!L.length) return { error: "Agrega al menos un producto con cantidad" };
  if (L.some((l) => n(l.precio) < 0)) return { error: "Precio inválido" };
  const conIva = p.con_iva !== false;
  const t = totales(L, conIva);
  const ocs = await todas(ctx, "erp_oc");
  const numero = siguienteAnual(ocs, "OC", anioEc(ctx.now));
  const id = uid();
  const tipo = s(p.tipo) === "consignacion" ? "consignacion" : "compra";
  await ctx.db.write(actor, "erp_oc", "insert", {}, {
    id, numero, proveedor_id: prov.id, fecha: s(p.fecha) || hoyEc(ctx.now), fecha_esperada: s(p.fecha_esperada) || null,
    flujo: "Aprobada", estado: "abierta", tipo, q_label: s(p.q_label), subtotal: t.subtotal, iva: t.iva, total: t.total, pagado: 0, saldo: t.total,
    estado_pago: "pendiente", nota: s(p.nota).slice(0, 1000), creado_por: actor,
    snap: { tipo, conIva, desde: s(p.desde), hasta: s(p.hasta), prov: { id: prov.id, nombre: s(prov.nombre), ruc: s(prov.ruc) }, cotizacion: s(p.cotizacion_id) || null, ...(p.snap && typeof p.snap === "object" ? p.snap as Row : {}) },
  });
  const w = await escribirLineas(ctx.db, actor, id, L, prods);
  if (w && w.error) return w;
  await logAccion(ctx.db, actor, "OC CREAR", `${numero} · ${s(prov.nombre)} · $${t.total.toFixed(2)} · ${id}`);
  return { ok: true, id, numero, total: t.total };
}
extend("cmpb_crear", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  return crearOc(ctx, ses, p as Row);
});

extend("cmpb_cancelar", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  if (!s(p.motivo).trim()) return { error: "Escribe el motivo" };
  const o = (await todas(ctx, "erp_oc")).find((r) => r.id === s(p.id));
  if (!o) return { error: "OC no encontrada" };
  const r = await runErp("oc_cancel", { id: o.id }, ctx.db, actorOf(ses), ctx.now);
  if (r.error) return r;
  await ctx.db.write(actorOf(ses), "erp_oc", "update", { id: o.id }, { nota: (s(o.nota) ? s(o.nota) + "\n" : "") + "Cancelada: " + s(p.motivo).trim().slice(0, 300) });
  await logAccion(ctx.db, actorOf(ses), "OC CANCELAR", `${s(o.numero)} · ${s(p.motivo).trim().slice(0, 200)} · ${o.id}`);
  return { ok: true };
});

/** 💵 Registrar pago: fecha, banco/cuenta, monto, referencia y comprobante opcional. */
extend("cmpb_pago", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const o = (await todas(ctx, "erp_oc")).find((r) => r.id === s(p.oc_id));
  if (!o) return { error: "OC no encontrada" };
  if (s(o.estado) === "cancelada") return { error: "La OC está cancelada" };
  const monto = round2(n(p.monto));
  if (!(monto > 0)) return { error: "Indica el monto" };
  const fecha = s(p.fecha) || hoyEc(ctx.now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha: AAAA-MM-DD" };
  const banco = s(p.banco).trim().slice(0, 120), ref = s(p.referencia).trim().slice(0, 120);
  const out = await comprasPago(ctx.db, actorOf(ses), { oc_id: o.id, monto, nota: [banco && "Banco: " + banco, ref && "Ref: " + ref].filter(Boolean).join(" · "), factura_b64: s(p.comprobante_b64), factura_nombre: s(p.comprobante_nombre) || "comprobante" }, ctx.now);
  if (out.error) return out;
  await ctx.db.write(actorOf(ses), "erp_oc_pagos", "update", { id: s(out.pago_id) }, { fecha, beta_banco: banco || null, beta_referencia: ref || null });
  if (s(p.comprobante_b64)) { const path = await subirFactura(ctx, actorOf(ses), s(out.pago_id), s(p.comprobante_nombre), s(p.comprobante_b64)); if (path) out.storage_path = path; }
  const fres = (await todas(ctx, "erp_oc")).find((r) => r.id === o.id) || o;
  await ctx.db.write(actorOf(ses), "erp_oc", "update", { id: o.id }, { estado_pago: estadoPago(n(fres.total), n(fres.pagado)) === "Pagada" ? "pagada" : n(fres.pagado) > 0 ? "parcial" : "pendiente" });
  await logAccion(ctx.db, actorOf(ses), "OC PAGO", `${s(o.numero)} · $${monto.toFixed(2)}${banco ? " · " + banco : ""}${ref ? " · ref " + ref : ""} · ${o.id}`);
  return { ok: true, pago_id: out.pago_id, pagado: n(fres.pagado), saldo: n(fres.saldo), pago: estadoPago(n(fres.total), n(fres.pagado)) };
});

// ───────── Cotizaciones de proveedor (antes «Borrador») ─────────
function limpiarLineasCot(L: unknown, prods: Row[]): Row[] | { error: string } {
  const porId = new Map(prods.map((x) => [s(x.id), x]));
  const out: Row[] = [];
  for (const l of (Array.isArray(L) ? L : []) as Row[]) {
    const pr = porId.get(s(l.producto_id)) || prods.find((x) => skuCode(x.sku) === skuCode(s(l.sku)));
    if (!pr) return { error: "Producto no está en el catálogo: " + s(l.sku || l.producto_id) };
    if (!(n(l.cantidad) > 0)) continue;
    out.push({ producto_id: s(pr.id), sku: skuCode(pr.sku), nombre: s(pr.nombre), cantidad: n(l.cantidad), precio: l.precio != null && s(l.precio) !== "" ? n(l.precio) : precioDe(pr) });
  }
  return out;
}
extend("cmpb_cot_guardar", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const prov = (await todas(ctx, "erp_proveedores")).find((r) => r.id === s(p.proveedor_id));
  if (!prov) return { error: "Elige el proveedor" };
  const L = limpiarLineasCot(p.lineas, await todas(ctx, "erp_productos"));
  if (!Array.isArray(L)) return L;
  if (!L.length) return { error: "Agrega al menos un producto con cantidad" };
  const cs = await todas(ctx, "beta_oc_cotizaciones");
  const prev = cs.find((c) => c.id === s(p.id));
  if (prev && s(prev.estado) !== "abierta") return { error: "Esa cotización ya se convirtió o se anuló" };
  const fila = { proveedor_id: prov.id, lineas: L, con_iva: p.con_iva !== false, nota: s(p.nota).slice(0, 1000), numero_prov: s(p.numero_prov).slice(0, 60) || null, updated_at: ctx.now.toISOString() };
  if (prev) { await ctx.db.write(actorOf(ses), "beta_oc_cotizaciones", "update", { id: prev.id }, fila); return { ok: true, id: prev.id, numero: prev.numero }; }
  const id = uid(), numero = siguienteAnual(cs, "COT", anioEc(ctx.now));
  await ctx.db.write(actorOf(ses), "beta_oc_cotizaciones", "insert", {}, { id, numero, fecha: hoyEc(ctx.now), estado: "abierta", creado_por: actorOf(ses), created_at: ctx.now.toISOString(), ...fila });
  await logAccion(ctx.db, actorOf(ses), "COTIZACION PROVEEDOR CREAR", `${numero} · ${s(prov.nombre)} · ${id}`);
  return { ok: true, id, numero };
});
extend("cmpb_cot_get", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const [cs, provs, hoja] = await Promise.all([todas(ctx, "beta_oc_cotizaciones"), todas(ctx, "erp_proveedores"), hojaProveedores(ctx.db)]);
  const c = cs.find((x) => x.id === s(p.id));
  if (!c) return { error: "Cotización no encontrada" };
  const L = Array.isArray(c.lineas) ? c.lineas as Row[] : [];
  return { ok: true, cot: { id: s(c.id), numero: s(c.numero), fecha: s(c.fecha), estado: s(c.estado), oc_id: s(c.oc_id), con_iva: c.con_iva !== false, nota: s(c.nota), numero_prov: s(c.numero_prov), prov: provVista(provs.find((x) => x.id === c.proveedor_id), hoja), lineas: L, ...totales(L, c.con_iva !== false) } };
});
extend("cmpb_cot_convertir", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const idc = s(p.id);
  if (idc.startsWith("oc:")) {
    // Pre-orden vieja (erp_oc Borrador): pasa a OC aprobada con número nuevo.
    const o = (await todas(ctx, "erp_oc")).find((r) => r.id === idc.slice(3));
    if (!o || !(s(o.flujo) === "Borrador" || s(o.estado) === "borrador")) return { error: "Pre-orden no encontrada" };
    const numero = siguienteAnual(await todas(ctx, "erp_oc"), "OC", anioEc(ctx.now));
    await ctx.db.write(actorOf(ses), "erp_oc", "update", { id: o.id }, { numero, flujo: "Aprobada", estado: "abierta" });
    await logAccion(ctx.db, actorOf(ses), "OC CREAR", `${numero} desde pre-orden · ${o.id}`);
    return { ok: true, id: o.id, numero };
  }
  const c = (await todas(ctx, "beta_oc_cotizaciones")).find((x) => x.id === idc);
  if (!c) return { error: "Cotización no encontrada" };
  if (s(c.estado) !== "abierta") return { error: "Esa cotización ya se convirtió o se anuló" };
  const r = await crearOc(ctx, ses, { proveedor_id: c.proveedor_id, lineas: c.lineas, con_iva: c.con_iva !== false, nota: s(c.nota), cotizacion_id: c.id, snap: { numero_prov: s(c.numero_prov) } });
  if (r.error) return r;
  await ctx.db.write(actorOf(ses), "beta_oc_cotizaciones", "update", { id: c.id }, { estado: "convertida", oc_id: r.id, updated_at: ctx.now.toISOString() });
  return r;
});
extend("cmpb_cot_anular", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const c = (await todas(ctx, "beta_oc_cotizaciones")).find((x) => x.id === s(p.id));
  if (!c) return { error: "Cotización no encontrada" };
  if (s(c.estado) !== "abierta") return { error: "Ya no está abierta" };
  await ctx.db.write(actorOf(ses), "beta_oc_cotizaciones", "update", { id: c.id }, { estado: "anulada", updated_at: ctx.now.toISOString() });
  await logAccion(ctx.db, actorOf(ses), "COTIZACION PROVEEDOR ANULAR", `${s(c.numero)} · ${c.id}`);
  return { ok: true };
});
export const _ymd = ymdUtc;
