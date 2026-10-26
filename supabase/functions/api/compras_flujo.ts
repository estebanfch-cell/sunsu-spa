// Flujo continuo de Compras. Reusa erp_proveedores, erp_productos, erp_oc,
// erp_oc_lineas, erp_stock y el kardex. No toca hojas ni Apps Script.

import { enPrueba, type Db } from "./db.ts";
import { n, productQtys, round2, s, skuCode, siguienteTestDoc, ymdUtc, type Row } from "./domain.ts";
import { BODEGA_CABINA, BODEGA_VENTA, runErp } from "./erp.ts";
import { guardarArchivo } from "./lib.ts";
import { familiaDe } from "./ventas.ts";

export const FLUJO = [
  "Borrador", "Aprobada", "Enviada", "Recibida parcial", "Recibida", "Pagada parcial", "Pagada/Cerrada",
] as const;

const ABIERTAS = new Set(["Aprobada", "Enviada", "Recibida parcial", "Recibida", "Pagada parcial"]);

function id(): string { return crypto.randomUUID(); }

function siguienteOc(rows: Row[]): string {
  let m = 0;
  for (const r of rows) {
    const mm = String(r.numero || "").match(/^OC-(\d+)$/);
    if (mm) m = Math.max(m, Number(mm[1]));
  }
  return "OC-" + String(m + 1).padStart(4, "0");
}

function numeroOc(db: Db, rows: Row[]): string {
  if (enPrueba(db)) return siguienteTestDoc(rows, "OC");
  return siguienteOc(rows);
}

function snapDe(row: Row): Row {
  const snap = row.snap;
  return snap && typeof snap === "object" ? snap as Row : {};
}

export function skusProveedor(prov: Row, prods: Row[]): Row[] {
  const nombre = s(prov.nombre).toLowerCase();
  const familia = familiaDe(s(prov.nombre));
  return prods.filter((p) => {
    if (p.activo === false) return false;
    const sku = skuCode(p.sku);
    if (familia && sku.startsWith(familia + "-")) return true;
    const marca = s(p.marca || p.proveedor).toLowerCase();
    return !!nombre && !!marca && (marca === nombre || marca.includes(nombre) || nombre.includes(marca));
  });
}

function precioDe(p: Row | undefined): number {
  return round2(n(p?.costo_promedio));
}

function flujoDePago(pagado: number, total: number, base: string): string {
  if (total > 0 && pagado + 0.009 >= total) return "Pagada/Cerrada";
  if (pagado > 0) return "Pagada parcial";
  return base;
}

function resuelta(ln: Row): boolean {
  return n(ln.recibido) + n(ln.no_recibido) + 1e-9 >= n(ln.cantidad);
}

export function flujoTrasRecibir(lineas: Row[], pagado: number, total: number): string {
  const alguna = lineas.some((ln) => n(ln.recibido) > 0 || n(ln.no_recibido) > 0);
  const todas = lineas.length > 0 && lineas.every(resuelta);
  const base = todas ? "Recibida" : alguna ? "Recibida parcial" : "Enviada";
  return flujoDePago(pagado, total, base);
}

async function productos(db: Db): Promise<Row[]> {
  return db.all("erp_productos");
}

function porSku(prods: Row[]): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const p of prods) m.set(skuCode(p.sku), p);
  return m;
}

export async function comprasPeriodo(db: Db, p: Row): Promise<Row> {
  const provs = await db.all("erp_proveedores");
  const prov = provs.find((r) => r.id === p.proveedor_id || s(r.nombre).toLowerCase() === s(p.proveedor).toLowerCase());
  if (!prov) return { error: "Elige el proveedor" };
  const desde = s(p.desde);
  const hasta = s(p.hasta);
  if (!desde || !hasta) return { error: "Elige el periodo" };
  const prods = await productos(db);
  const catalogo = skusProveedor(prov, prods);
  const allow = new Set(catalogo.map((r) => skuCode(r.sku)));
  const vendido = new Map<string, number>();
  for (const t of await db.all("tickets")) {
    const fecha = ymdUtc(t.timestamp);
    if (!fecha || fecha < desde || fecha > hasta) continue;
    for (const pr of productQtys(t)) {
      const sku = skuCode(pr.sku);
      if (!allow.has(sku)) continue;
      vendido.set(sku, (vendido.get(sku) || 0) + pr.qty);
    }
  }
  const map = porSku(prods);
  const lineas = [...vendido.entries()].map(([sku, qty]) => {
    const prod = map.get(sku);
    const precio = precioDe(prod);
    return {
      sku, nombre: s(prod?.nombre) || sku, vendido: qty, cantidad: qty,
      precio, subtotal: round2(qty * precio),
    };
  }).sort((a, b) => a.sku.localeCompare(b.sku));
  const sub = round2(lineas.reduce((a, it) => a + it.subtotal, 0));
  const conIva = p.con_iva !== false && p.conIva !== false;
  const iva = conIva ? round2(sub * 0.15) : 0;
  return {
    ok: true,
    proveedor: { id: prov.id, nombre: s(prov.nombre), ruc: s(prov.ruc) },
    desde, hasta, conIva, lineas,
    totales: { subtotal: sub, iva, total: round2(sub + iva) },
  };
}

function cotizarLineas(lineas: Row[], prods: Row[]): { error: string } | { sub: number; n: number } {
  const map = porSku(prods);
  let sub = 0;
  let escritas = 0;
  for (const ln of lineas) {
    const cant = n(ln.cantidad ?? ln.vendido);
    if (!(cant > 0)) continue;
    const prod = map.get(skuCode(ln.sku)) || map.get(skuCode(ln.producto_id));
    if (!prod) return { error: "Producto no está en el catálogo: " + s(ln.sku || ln.producto_id) };
    const precio = ln.precio != null ? n(ln.precio) : precioDe(prod);
    sub += round2(cant * precio);
    escritas++;
  }
  if (!escritas) return { error: "La pre-orden no tiene cantidades" };
  return { sub, n: escritas };
}

async function escribirLineas(db: Db, actor: string, ocId: string, lineas: Row[], prods: Row[]): Promise<Row | null> {
  const map = porSku(prods);
  for (const ln of lineas) {
    if (!(n(ln.cantidad ?? ln.vendido) > 0)) continue;
    const prod = map.get(skuCode(ln.sku)) || map.get(skuCode(ln.producto_id));
    if (!prod) return { error: "Producto no está en el catálogo: " + s(ln.sku || ln.producto_id) };
  }
  const prev = (await db.all("erp_oc_lineas")).filter((r) => r.oc_id === ocId);
  for (const old of prev) await db.write(actor, "erp_oc_lineas", "delete", { id: old.id }, null);
  let i = 0;
  let sub = 0;
  let escritas = 0;
  for (const ln of lineas) {
    const cant = n(ln.cantidad ?? ln.vendido);
    if (!(cant > 0)) continue;
    const prod = map.get(skuCode(ln.sku)) || map.get(skuCode(ln.producto_id));
    if (!prod) return { error: "Producto no está en el catálogo: " + s(ln.sku || ln.producto_id) };
    const precio = ln.precio != null ? n(ln.precio) : precioDe(prod);
    const neto = round2(cant * precio);
    sub += neto;
    const uso = s(prod.uso);
    const bodega = s(ln.bodega_id) || (uso === "cabina" ? BODEGA_CABINA : BODEGA_VENTA);
    await db.write(actor, "erp_oc_lineas", "insert", {}, {
      id: id(), oc_id: ocId, producto_id: prod.id, cantidad: cant, precio, descuento_pct: 0,
      bodega_id: bodega, subtotal: neto, recibido: 0, no_recibido: 0, plazo: s(ln.plazo) || "CONSIGNACION", orden: i++,
    });
    escritas++;
  }
  return { sub, n: escritas };
}

export async function comprasGuardar(db: Db, actor: string, p: Row, now: Date): Promise<Row> {
  let provId = s(p.proveedor_id);
  const nuevo = p.nuevo && typeof p.nuevo === "object" ? p.nuevo as Row : null;
  if (!provId && nuevo && s(nuevo.nombre)) {
    provId = id();
    await db.write(actor, "erp_proveedores", "insert", {}, {
      id: provId, nombre: s(nuevo.nombre), ruc: s(nuevo.ruc), telefono: s(nuevo.telefono),
      email: s(nuevo.email), activo: true,
    });
  }
  const prov = (await db.all("erp_proveedores")).find((r) => r.id === provId);
  if (!prov) return { error: "Elige el proveedor o escribe uno nuevo" };
  const crudas = (Array.isArray(p.lineas) ? p.lineas : []) as Row[];
  if (!crudas.length) return { error: "La pre-orden no tiene productos" };
  const ocId = s(p.id) || id();
  const prev = (await db.all("erp_oc")).find((r) => r.id === ocId);
  if (prev && s(prev.flujo) && s(prev.flujo) !== "Borrador") return { error: "Esa orden ya no es borrador" };
  const prods = await productos(db);
  const cotizado = cotizarLineas(crudas, prods);
  if ("error" in cotizado) return cotizado;
  const sub = cotizado.sub;
  const conIva = p.con_iva !== false && p.conIva !== false;
  const iva = conIva ? round2(sub * 0.15) : 0;
  const total = round2(sub + iva);
  const fact = (Array.isArray(p.fact) ? p.fact : crudas) as Row[];
  const snap = {
    tipo: s(p.tipo) || "consignacion",
    conIva, desde: s(p.desde), hasta: s(p.hasta),
    prov: { id: prov.id, nombre: s(prov.nombre), ruc: s(prov.ruc) },
    fact, pedido: crudas,
  };
  const row: Row = {
    proveedor_id: prov.id, fecha: s(p.fecha) || ymdUtc(now) || now.toISOString().slice(0, 10),
    flujo: "Borrador", estado: "borrador", tipo: snap.tipo, q_label: s(p.q_label) || (s(p.desde) && s(p.hasta) ? s(p.desde) + " → " + s(p.hasta) : ""),
    subtotal: sub, iva, total, pagado: n(prev?.pagado), saldo: round2(total - n(prev?.pagado)),
    estado_pago: "pendiente", snap, nota: s(p.nota), creado_por: actor,
  };
  if (prev) await db.write(actor, "erp_oc", "update", { id: ocId }, row);
  else await db.write(actor, "erp_oc", "insert", {}, { id: ocId, numero: null, ...row });
  const hecho = await escribirLineas(db, actor, ocId, crudas, prods);
  if (hecho?.error) return hecho;
  return { ok: true, id: ocId, flujo: "Borrador", proveedor_id: prov.id, total, snap };
}

export async function comprasAprobar(db: Db, actor: string, p: Row): Promise<Row> {
  const o = (await db.all("erp_oc")).find((r) => r.id === p.id || r.id === p.oc_id);
  if (!o) return { error: "Pre-orden no encontrada" };
  if (s(o.flujo) && s(o.flujo) !== "Borrador" && s(o.estado) !== "borrador") return { error: "Solo se aprueba un borrador" };
  const lineas = (await db.all("erp_oc_lineas")).filter((r) => r.oc_id === o.id);
  if (!lineas.length) return { error: "La pre-orden no tiene líneas" };
  const numero = s(o.numero) || numeroOc(db, await db.all("erp_oc"));
  await db.write(actor, "erp_oc", "update", { id: o.id }, { numero, flujo: "Aprobada", estado: "abierta" });
  const prods = await productos(db);
  const map = new Map(prods.map((r) => [String(r.id), r]));
  const snap = snapDe(o);
  const prov = (snap.prov as Row) || {};
  const pedido = lineas.map((ln) => {
    const prod = map.get(String(ln.producto_id));
    return { sku: s(prod?.sku), nombre: s(prod?.nombre), cantidad: n(ln.cantidad), precio: n(ln.precio), subtotal: n(ln.subtotal) };
  });
  const fact = (Array.isArray(snap.fact) ? snap.fact : pedido) as Row[];
  const sub = n(o.subtotal);
  const iva = n(o.iva);
  return {
    ok: true, id: o.id, numero, flujo: "Aprobada",
    liquidacion: {
      titulo: "Liquidación de consignación",
      proveedor: s(prov.nombre), ruc: s(prov.ruc), periodo: s(o.q_label),
      lineas: fact, subtotal: sub, iva, total: n(o.total),
    },
    pedido: {
      titulo: "Orden de compra",
      numero, proveedor: s(prov.nombre), periodo: s(o.q_label),
      lineas: pedido, subtotal: sub, iva, total: n(o.total),
    },
  };
}

export async function comprasEnviar(db: Db, actor: string, p: Row): Promise<Row> {
  const o = (await db.all("erp_oc")).find((r) => r.id === p.id || r.id === p.oc_id);
  if (!o) return { error: "OC no encontrada" };
  if (s(o.flujo) !== "Aprobada") return { error: "Primero hay que aprobarla" };
  await db.write(actor, "erp_oc", "update", { id: o.id }, { flujo: "Enviada" });
  return { ok: true, id: o.id, numero: s(o.numero), flujo: "Enviada" };
}

function vistaLinea(ln: Row, prod: Row | undefined, admin: boolean): Row {
  const base: Row = {
    id: ln.id, sku: s(prod?.sku) || skuCode(ln.sku),
    pedido: n(ln.cantidad), recibido: n(ln.recibido), no_recibido: n(ln.no_recibido),
    pendiente: Math.max(0, round2(n(ln.cantidad) - n(ln.recibido) - n(ln.no_recibido))),
  };
  if (!admin) return base;
  return { ...base, nombre: s(prod?.nombre), precio: n(ln.precio), subtotal: n(ln.subtotal) };
}

async function vistaOc(db: Db, o: Row, admin: boolean): Promise<Row> {
  const prods = await productos(db);
  const map = new Map(prods.map((r) => [String(r.id), r]));
  const lineas = (await db.all("erp_oc_lineas")).filter((r) => r.oc_id === o.id).sort((a, b) => n(a.orden) - n(b.orden));
  const prov = admin ? (await db.all("erp_proveedores")).find((r) => r.id === o.proveedor_id) : null;
  const out: Row = {
    id: o.id, numero: s(o.numero) || "Borrador", flujo: s(o.flujo) || s(o.estado),
    lineas: lineas.map((ln) => vistaLinea(ln, map.get(String(ln.producto_id)), admin)),
  };
  if (admin) {
    out.proveedor = s(prov?.nombre);
    out.proveedor_id = o.proveedor_id;
    out.total = n(o.total);
    out.pagado = n(o.pagado);
    out.saldo = n(o.saldo);
    out.q_label = s(o.q_label);
    out.tipo = s(o.tipo);
  }
  return out;
}

export async function comprasLista(db: Db, admin: boolean): Promise<Row> {
  const ocs = await db.all("erp_oc");
  const items = [];
  for (const o of ocs) {
    const flujo = s(o.flujo);
    if (!admin && !ABIERTAS.has(flujo)) continue;
    items.push(await vistaOc(db, o, admin));
  }
  return { ok: true, items };
}

export async function comprasRecibir(db: Db, actor: string, p: Row, now: Date, admin: boolean): Promise<Row> {
  const o = (await db.all("erp_oc")).find((r) => r.id === p.oc_id || r.id === p.id || r.numero === p.numero);
  if (!o) return { error: "OC no encontrada" };
  const flujo = s(o.flujo);
  if (flujo === "Borrador" || flujo === "Pagada/Cerrada" || s(o.estado) === "cancelada") return { error: "Esta orden no se puede recibir" };
  const pedidas = (await db.all("erp_oc_lineas")).filter((r) => r.oc_id === o.id);
  const ins = (Array.isArray(p.lineas) ? p.lineas : []) as Row[];
  if (!ins.length) return { error: "Indica qué se recibe" };
  const prods = await productos(db);
  const map = new Map(prods.map((r) => [String(r.id), r]));
  const recibir: Row[] = [];
  const noRec: { id: string; qty: number }[] = [];
  for (const ln of ins) {
    const ol = pedidas.find((r) => r.id === ln.oc_linea_id || r.id === ln.id);
    if (!ol) return { error: "Línea de OC no existe" };
    const rec = n(ln.recibido ?? ln.cantidad_recibida);
    const no = n(ln.no_recibido);
    const pend = n(ol.cantidad) - n(ol.recibido) - n(ol.no_recibido);
    if (rec + no > pend + 1e-9) return { error: "La cantidad supera lo pendiente de " + s(map.get(String(ol.producto_id))?.sku || "la línea") };
    if (rec > 0) {
      const prod = map.get(String(ol.producto_id));
      const uso = s(prod?.uso);
      const bodega = s(ol.bodega_id) || (uso === "cabina" ? BODEGA_CABINA : BODEGA_VENTA);
      recibir.push({ oc_linea_id: ol.id, cantidad: rec, bodega_id: bodega });
    }
    if (no > 0) noRec.push({ id: String(ol.id), qty: no });
  }
  if (!recibir.length && !noRec.length) return { error: "Indica una cantidad" };
  if (recibir.length) {
    const rec = await runErp("oc_recibir", { oc_id: o.id, lineas: recibir }, db, actor, now);
    if (rec.error) return rec;
  }
  for (const ln of noRec) {
    const ol = (await db.all("erp_oc_lineas")).find((r) => r.id === ln.id);
    if (!ol) continue;
    await db.write(actor, "erp_oc_lineas", "update", { id: ln.id }, { no_recibido: round2(n(ol.no_recibido) + ln.qty) });
  }
  const nuevas = (await db.all("erp_oc_lineas")).filter((r) => r.oc_id === o.id);
  const ocNow = (await db.all("erp_oc")).find((r) => r.id === o.id) || o;
  const flujoNuevo = flujoTrasRecibir(nuevas, n(ocNow.pagado), n(ocNow.total));
  const estado = nuevas.every((ln) => n(ln.recibido) + 1e-9 >= n(ln.cantidad)) && nuevas.some((ln) => n(ln.recibido) > 0)
    ? "recibida"
    : nuevas.some((ln) => n(ln.recibido) > 0) ? "parcial" : s(ocNow.estado);
  await db.write(actor, "erp_oc", "update", { id: o.id }, { flujo: flujoNuevo, estado });
  const fresco = (await db.all("erp_oc")).find((r) => r.id === o.id) || o;
  return { ok: true, ...(await vistaOc(db, fresco, admin)), flujo: flujoNuevo };
}

async function cerrarFifo(db: Db, actor: string, o: Row, pagoId: string, monto: number): Promise<Row[]> {
  const provId = s(o.proveedor_id);
  const prods = skusProveedor(
    (await db.all("erp_proveedores")).find((r) => r.id === provId) || { nombre: "" },
    await productos(db),
  );
  const precio = new Map(prods.map((p) => [skuCode(p.sku), precioDe(p)]));
  const allow = new Set(precio.keys());
  const ya = new Map<string, number>();
  for (const c of await db.all("erp_consignacion_cierre")) {
    if (s(c.proveedor_id) !== provId) continue;
    const k = s(c.ticket_ref) + "|" + skuCode(c.sku);
    ya.set(k, (ya.get(k) || 0) + n(c.qty));
  }
  const ventas: { fecha: string; ticket: string; sku: string; qty: number; precio: number }[] = [];
  for (const t of await db.all("tickets")) {
    const fecha = ymdUtc(t.timestamp);
    if (!fecha) continue;
    const ticket = s(t.beta_num) || s(t.so_num) || String(t.id || t.sheet_row || "");
    for (const pr of productQtys(t)) {
      const sku = skuCode(pr.sku);
      if (!allow.has(sku)) continue;
      const k = ticket + "|" + sku;
      const libre = pr.qty - (ya.get(k) || 0);
      if (libre > 1e-9) ventas.push({ fecha, ticket, sku, qty: libre, precio: precio.get(sku) || 0 });
    }
  }
  ventas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.ticket.localeCompare(b.ticket));
  let queda = monto;
  const cerrados: Row[] = [];
  for (const v of ventas) {
    if (queda <= 0.009) break;
    const unit = v.precio > 0 ? v.precio : queda;
    const puede = v.precio > 0 ? Math.min(v.qty, queda / v.precio) : v.qty;
    if (!(puede > 0)) continue;
    const qty = round2(puede);
    const usado = v.precio > 0 ? round2(qty * v.precio) : round2(Math.min(queda, unit));
    const row = {
      id: id(), proveedor_id: provId, oc_id: o.id, sku: v.sku, qty, monto: usado,
      fecha_venta: v.fecha, ticket_ref: v.ticket, pago_id: pagoId,
    };
    await db.write(actor, "erp_consignacion_cierre", "insert", {}, row);
    cerrados.push(row);
    queda = round2(queda - usado);
  }
  return cerrados;
}

export async function comprasPago(db: Db, actor: string, p: Row, now: Date): Promise<Row> {
  const o = (await db.all("erp_oc")).find((r) => r.id === p.oc_id || r.id === p.id || r.numero === p.numero);
  if (!o) return { error: "OC no encontrada" };
  if (s(o.flujo) === "Borrador" || s(o.estado) === "borrador") return { error: "Aprueba la orden antes de pagarla" };
  const monto = n(p.monto);
  if (!(monto > 0)) return { error: "Indica el monto del pago" };
  const pago = await runErp("pago_save", { oc_id: o.id, monto }, db, actor, now);
  if (pago.error) return pago;
  const pagoId = id();
  let archivoId = "";
  const b64 = s(p.factura_b64 || p.archivo);
  const nombre = s(p.factura_nombre) || "factura-proveedor";
  if (b64) {
    const dataUrl = b64.startsWith("data:") ? b64 : "data:application/octet-stream;base64," + b64;
    archivoId = await guardarArchivo(db, actor, "factura-proveedor", nombre, dataUrl) || "";
  }
  await db.write(actor, "erp_oc_pagos", "insert", {}, {
    id: pagoId, oc_id: o.id, monto, fecha: ymdUtc(now), nota: s(p.nota),
    archivo_id: archivoId, archivo_nombre: b64 ? nombre : "", actor,
  });
  const cierres = s(o.tipo) === "compra" ? [] : await cerrarFifo(db, actor, o, pagoId, monto);
  const ocNow = (await db.all("erp_oc")).find((r) => r.id === o.id) || o;
  const lineas = (await db.all("erp_oc_lineas")).filter((r) => r.oc_id === o.id);
  const base = s(ocNow.flujo) === "Pagada parcial" || s(ocNow.flujo) === "Pagada/Cerrada"
    ? (lineas.every(resuelta) ? "Recibida" : "Recibida parcial")
    : s(ocNow.flujo) || "Aprobada";
  const flujo = flujoDePago(n(ocNow.pagado), n(ocNow.total), base === "Borrador" ? "Aprobada" : base);
  await db.write(actor, "erp_oc", "update", { id: o.id }, { flujo });
  return { ok: true, id: o.id, pago_id: pagoId, archivo_id: archivoId, flujo, pagado: n(ocNow.pagado), saldo: n(ocNow.saldo), cierres };
}

export async function comprasSaldo(db: Db): Promise<Row> {
  const provs = await db.all("erp_proveedores");
  const ocs = await db.all("erp_oc");
  const items = provs.filter((p) => p.activo !== false).map((p) => {
    const mias = ocs.filter((o) => o.proveedor_id === p.id && s(o.flujo) !== "Borrador");
    const total = round2(mias.reduce((a, o) => a + n(o.total), 0));
    const pagado = round2(mias.reduce((a, o) => a + n(o.pagado), 0));
    return { id: p.id, nombre: s(p.nombre), total, pagado, pendiente: round2(total - pagado), ordenes: mias.length };
  });
  return { ok: true, items };
}

export async function comprasReporte(db: Db, p: Row): Promise<Row> {
  const prov = (await db.all("erp_proveedores")).find((r) => r.id === p.proveedor_id || s(r.nombre).toLowerCase() === s(p.proveedor).toLowerCase());
  if (!prov) return { error: "Elige el proveedor" };
  const prods = skusProveedor(prov, await productos(db));
  const stock = await db.all("erp_stock");
  const items = prods.map((prod) => {
    const qty = stock.filter((r) => r.producto_id === prod.id).reduce((a, r) => a + n(r.cantidad), 0);
    return { sku: skuCode(prod.sku), nombre: s(prod.nombre), stock: round2(qty) };
  }).filter((r) => r.stock !== 0).sort((a, b) => a.sku.localeCompare(b.sku));
  return {
    ok: true,
    titulo: "Consignación a la fecha",
    proveedor: s(prov.nombre),
    items,
    unidades: round2(items.reduce((a, r) => a + r.stock, 0)),
  };
}

export async function descontarVentaTicket(db: Db, actor: string, ticketRef: string, row: Row, now: Date): Promise<number> {
  const prods = porSku(await productos(db));
  const moves: Row[] = [];
  for (const pr of productQtys(row)) {
    const prod = prods.get(skuCode(pr.sku));
    if (!prod) continue;
    const clase = s(prod.clase) || "producto";
    if (clase !== "producto") continue;
    const uso = s(prod.uso) || "venta";
    if (uso === "cabina") continue;
    moves.push({
      sku: pr.sku, bodega_id: BODEGA_VENTA, delta: -pr.qty, tipo: "venta",
      ticket_ref: ticketRef, nota: "venta " + ticketRef,
      legacy_ref: "vta-beta:" + ticketRef + ":" + skuCode(pr.sku),
    });
  }
  if (!moves.length) return 0;
  const out = await runErp("stock_delta", { moves, aprobar_negativo: true }, db, actor, now);
  if (out.error) return 0;
  return moves.reduce((a, m) => a + Math.abs(n(m.delta)), 0);
}
