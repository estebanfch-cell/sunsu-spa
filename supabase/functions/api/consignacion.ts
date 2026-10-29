// Consignación: la mercadería entra sin deuda, el ticket descuenta el stock
// como cualquier venta, y el cierre del mes factura solo lo vendido.
// Lo que queda sigue consignado al mismo proveedor.

import { enPrueba, type Db } from "./db.ts";
import { n, productQtys, round2, s, siguienteTestDoc, skuCode, ymdUtc, type Row } from "./domain.ts";
import { BODEGA_CABINA, BODEGA_VENTA, runErp } from "./erp.ts";

const IVA = 0.15;

export interface LineaCsg {
  codigo: string;
  nombre: string;
  cantidad: number;
  precio: number;
  descuento: number;
  subtotal: number;
  iva: number;
  total: number;
  producto_id: string;
  bodega_id: string;
}

export interface SaldoCsg {
  proveedor_id: string;
  producto_id: string;
  bodega_id: string;
  sku: string;
  nombre: string;
  cantidad: number;
  costo: number;
  desde: string;
}

/** Descuento es monto. Subtotal = cantidad × precio − descuento. IVA 15% sobre el subtotal. */
export function calcularLinea(cantidad: number, precio: number, descuento: number): { descuento: number; subtotal: number; iva: number; total: number } {
  const bruto = round2(Math.max(0, cantidad) * Math.max(0, precio));
  const desc = round2(Math.min(Math.max(0, descuento), bruto));
  const subtotal = round2(bruto - desc);
  const iva = round2(subtotal * IVA);
  return { descuento: desc, subtotal, iva, total: round2(subtotal + iva) };
}

export function sumarLineas(lineas: { subtotal: number; iva: number; total: number }[]): { subtotal: number; iva: number; total: number } {
  return {
    subtotal: round2(lineas.reduce((a, ln) => a + n(ln.subtotal), 0)),
    iva: round2(lineas.reduce((a, ln) => a + n(ln.iva), 0)),
    total: round2(lineas.reduce((a, ln) => a + n(ln.total), 0)),
  };
}

/** Lo vendido del periodo se reparte del consignado más viejo al más nuevo, sin pasar el saldo de cada proveedor. */
export function repartirConsignado(
  saldos: SaldoCsg[],
  vendido: { sku: string; qty: number }[],
  ya: { sku: string; qty: number }[],
): SaldoCsg[] {
  const libre = new Map<string, number>();
  for (const v of vendido) {
    const sku = skuCode(v.sku);
    libre.set(sku, (libre.get(sku) || 0) + n(v.qty));
  }
  for (const y of ya) {
    const sku = skuCode(y.sku);
    libre.set(sku, (libre.get(sku) || 0) - n(y.qty));
  }
  const orden = [...saldos].sort((a, b) => a.desde.localeCompare(b.desde) || a.proveedor_id.localeCompare(b.proveedor_id));
  const out: SaldoCsg[] = [];
  for (const saldo of orden) {
    const free = libre.get(saldo.sku) || 0;
    if (free <= 1e-9 || saldo.cantidad <= 1e-9) continue;
    const take = Math.min(saldo.cantidad, free);
    libre.set(saldo.sku, free - take);
    out.push({ ...saldo, cantidad: round4(take) });
  }
  return out;
}

function round4(x: number): number {
  return Math.round((x + Number.EPSILON) * 10000) / 10000;
}

function id(): string { return crypto.randomUUID(); }

function siguienteNum(rows: Row[], prefix: string): string {
  let m = 0;
  const re = new RegExp("^" + prefix + "-(\\d+)$");
  for (const r of rows) {
    const mm = String(r.numero || "").match(re);
    if (mm) m = Math.max(m, Number(mm[1]));
  }
  return prefix + "-" + String(m + 1).padStart(4, "0");
}

function numeroDe(db: Db, rows: Row[], prefix: string): string {
  if (enPrueba(db)) return siguienteTestDoc(rows, prefix);
  return siguienteNum(rows, prefix);
}

function solapa(a0: string, a1: string, b0: string, b1: string): boolean {
  return !!a0 && !!a1 && !!b0 && !!b1 && a0 <= b1 && b0 <= a1;
}

async function productos(db: Db): Promise<Row[]> {
  return db.all("erp_productos");
}

function bodegaPara(prod: Row, bodegas: Row[]): string {
  const uso = s(prod.uso) || "venta";
  if (uso === "cabina") {
    const cab = bodegas.find((b) => s(b.codigo) === "CABINA") || bodegas.find((b) => s(b.tipo) === "cabina");
    return s(cab?.id) || BODEGA_CABINA;
  }
  const venta = bodegas.find((b) => s(b.codigo) === "VENTA") || bodegas.find((b) => s(b.tipo) === "venta");
  return s(venta?.id) || BODEGA_VENTA;
}

function armarLineas(crudas: Row[], prods: Row[], bodegas: Row[]): { error: string } | LineaCsg[] {
  const porSku = new Map(prods.map((p) => [skuCode(p.sku), p]));
  const out: LineaCsg[] = [];
  for (const ln of crudas) {
    const cant = n(ln.cantidad);
    if (!(cant > 0)) continue;
    const prod = porSku.get(skuCode(ln.sku || ln.codigo));
    if (!prod) return { error: "Producto no está en el catálogo: " + s(ln.sku || ln.codigo) };
    const precio = n(ln.precio != null && ln.precio !== "" ? ln.precio : prod.costo_promedio);
    const bruto = round2(cant * Math.max(0, precio));
    const descuento = ln.descuento != null && ln.descuento !== ""
      ? n(ln.descuento)
      : round2(bruto * n(ln.descuento_pct) / 100);
    const cal = calcularLinea(cant, precio, descuento);
    out.push({
      codigo: skuCode(prod.sku),
      nombre: s(prod.nombre),
      cantidad: cant,
      precio: round2(Math.max(0, precio)),
      descuento: cal.descuento,
      subtotal: cal.subtotal,
      iva: cal.iva,
      total: cal.total,
      producto_id: String(prod.id),
      bodega_id: bodegaPara(prod, bodegas),
    });
  }
  if (!out.length) return { error: "Agrega al menos un producto con cantidad" };
  return out;
}

async function saldosDe(db: Db): Promise<SaldoCsg[]> {
  const prods = new Map((await productos(db)).map((p) => [String(p.id), p]));
  const rows = await db.all("erp_consignado");
  return rows.filter((r) => n(r.cantidad) > 1e-9).map((r) => {
    const prod = prods.get(String(r.producto_id));
    return {
      proveedor_id: s(r.proveedor_id),
      producto_id: s(r.producto_id),
      bodega_id: s(r.bodega_id),
      sku: skuCode(prod?.sku),
      nombre: s(prod?.nombre),
      cantidad: n(r.cantidad),
      costo: n(r.costo),
      desde: s(r.desde),
    };
  });
}

function vistaLinea(ln: Row): Row {
  return {
    codigo: s(ln.codigo),
    nombre: s(ln.nombre),
    cantidad: n(ln.cantidad),
    precio: n(ln.precio),
    descuento: n(ln.descuento),
    subtotal: n(ln.subtotal),
    iva: n(ln.iva),
    total: n(ln.total),
    clase: s(ln.clase),
  };
}

async function vistaDoc(db: Db, doc: Row): Promise<Row> {
  const provs = await db.all("erp_proveedores");
  const prov = provs.find((p) => p.id === doc.proveedor_id);
  const lineas = (await db.all("erp_consignacion_lineas"))
    .filter((r) => r.consignacion_id === doc.id)
    .sort((a, b) => n(a.orden) - n(b.orden));
  const ocs = await db.all("erp_oc");
  const oc = ocs.find((o) => o.id === doc.oc_id);
  const vendidas = lineas.filter((r) => s(r.clase) !== "resta").map(vistaLinea);
  const restante = lineas.filter((r) => s(r.clase) === "resta").map(vistaLinea);
  const tot = sumarLineas(vendidas.map((r) => ({ subtotal: n(r.subtotal), iva: n(r.iva), total: n(r.total) })));
  return {
    id: doc.id,
    numero: s(doc.numero),
    tipo: s(doc.tipo),
    estado: s(doc.estado),
    proveedor_id: doc.proveedor_id,
    proveedor: s(prov?.nombre),
    fecha: s(doc.fecha),
    periodo_ini: s(doc.periodo_ini),
    periodo_fin: s(doc.periodo_fin),
    nota: s(doc.nota),
    oc_id: s(doc.oc_id),
    oc_numero: s(oc?.numero),
    subtotal: n(doc.subtotal) || tot.subtotal,
    iva: n(doc.iva) || tot.iva,
    total: n(doc.total) || tot.total,
    lineas: vendidas,
    restante,
  };
}

async function venderEnPeriodo(db: Db, desde: string, hasta: string): Promise<{ sku: string; qty: number }[]> {
  const map = new Map<string, number>();
  let tickets: Row[] = [];
  try { tickets = await db.all("tickets"); } catch { tickets = []; }
  for (const t of tickets) {
    const fecha = ymdUtc(t.timestamp || t.fecha);
    if (!fecha) continue;
    if (desde && fecha < desde) continue;
    if (hasta && fecha > hasta) continue;
    for (const pr of productQtys(t)) {
      const sku = skuCode(pr.sku);
      map.set(sku, (map.get(sku) || 0) + pr.qty);
    }
  }
  return [...map.entries()].map(([sku, qty]) => ({ sku, qty }));
}

async function yaLiquidado(db: Db, desde: string, hasta: string): Promise<{ sku: string; qty: number }[]> {
  const docs = (await db.all("erp_consignacion")).filter((d) => s(d.tipo) === "cierre");
  const ids = new Set(docs.filter((d) => solapa(s(d.periodo_ini), s(d.periodo_fin), desde, hasta)).map((d) => String(d.id)));
  const map = new Map<string, number>();
  for (const ln of await db.all("erp_consignacion_lineas")) {
    if (!ids.has(String(ln.consignacion_id))) continue;
    if (s(ln.clase) === "resta") continue;
    const sku = skuCode(ln.codigo);
    map.set(sku, (map.get(sku) || 0) + n(ln.cantidad));
  }
  return [...map.entries()].map(([sku, qty]) => ({ sku, qty }));
}

async function guardarDoc(
  db: Db, actor: string, doc: Row, lineas: Row[],
): Promise<void> {
  await db.write(actor, "erp_consignacion", "insert", {}, doc);
  let i = 0;
  for (const ln of lineas) {
    await db.write(actor, "erp_consignacion_lineas", "insert", {}, { ...ln, consignacion_id: doc.id, orden: i++ });
  }
}

function originDe(db: Db): string | null {
  return enPrueba(db) ? "test" : null;
}

export async function csgList(db: Db): Promise<Row> {
  const docs = await db.all("erp_consignacion");
  const items = [];
  for (const d of docs) items.push(await vistaDoc(db, d));
  items.sort((a, b) => s(b.fecha).localeCompare(s(a.fecha)) || s(b.numero).localeCompare(s(a.numero)));
  const provs = new Map((await db.all("erp_proveedores")).map((p) => [String(p.id), s(p.nombre)]));
  const saldos = (await saldosDe(db)).map((r) => ({
    sku: r.sku, nombre: r.nombre, proveedor_id: r.proveedor_id, proveedor: provs.get(r.proveedor_id) || "",
    cantidad: r.cantidad, costo: r.costo,
  })).sort((a, b) => a.sku.localeCompare(b.sku) || a.proveedor.localeCompare(b.proveedor));
  return { ok: true, items, saldos };
}

export async function csgGet(db: Db, p: Row): Promise<Row> {
  const doc = (await db.all("erp_consignacion")).find((r) => r.id === p.id || r.numero === p.numero);
  if (!doc) return { error: "Documento no encontrado" };
  return { ok: true, doc: await vistaDoc(db, doc) };
}

export async function csgEntrada(db: Db, actor: string, p: Row, now: Date): Promise<Row> {
  const prov = (await db.all("erp_proveedores")).find((r) => r.id === p.proveedor_id);
  if (!prov) return { error: "Elige el proveedor" };
  const bodegas = await db.all("erp_bodegas");
  const armadas = armarLineas((Array.isArray(p.lineas) ? p.lineas : []) as Row[], await productos(db), bodegas);
  if ("error" in armadas) return armadas;
  const fecha = s(p.fecha) || ymdUtc(now);
  const docs = await db.all("erp_consignacion");
  const docId = id();
  const numero = numeroDe(db, docs, "CSG");
  const tot = sumarLineas(armadas);
  const moves: Row[] = armadas.map((ln, i) => ({
    sku: ln.codigo, producto_id: ln.producto_id, bodega_id: ln.bodega_id, delta: ln.cantidad,
    tipo: "recepcion", doc_tipo: "consignacion", doc_id: docId, costo_unit: ln.precio,
    nota: "consignado", legacy_ref: "csg-in:" + docId + ":" + ln.codigo + ":" + i,
  }));
  const stock = await runErp("stock_delta", { moves, aprobar_negativo: false }, db, actor, now);
  if (stock.error) return stock;
  const saldos = await db.all("erp_consignado");
  const marca = fecha + "T" + String(docs.length).padStart(4, "0");
  for (const ln of armadas) {
    const hit = saldos.find((r) => r.producto_id === ln.producto_id && r.proveedor_id === prov.id && r.bodega_id === ln.bodega_id);
    const antes = n(hit?.cantidad);
    const costo = antes + ln.cantidad > 0
      ? round4((antes * n(hit?.costo) + ln.cantidad * ln.precio) / (antes + ln.cantidad))
      : ln.precio;
    if (hit) {
      await db.write(actor, "erp_consignado", "update", { id: hit.id }, { cantidad: round4(antes + ln.cantidad), costo });
      hit.cantidad = round4(antes + ln.cantidad);
      hit.costo = costo;
    } else {
      const row = {
        id: id(), producto_id: ln.producto_id, proveedor_id: prov.id, bodega_id: ln.bodega_id,
        cantidad: ln.cantidad, costo: ln.precio, desde: marca, origin: originDe(db),
      };
      await db.write(actor, "erp_consignado", "insert", {}, row);
      saldos.push(row);
    }
  }
  const doc = {
    id: docId, numero, proveedor_id: prov.id, tipo: "entrada", estado: "registrada",
    fecha, periodo_ini: "", periodo_fin: "", oc_id: null, nota: s(p.nota) || "Entrada de consignación. No genera deuda.",
    creado_por: actor, subtotal: tot.subtotal, iva: tot.iva, total: tot.total, origin: originDe(db),
  };
  await guardarDoc(db, actor, doc, armadas.map((ln) => ({
    id: id(), codigo: ln.codigo, nombre: ln.nombre, cantidad: ln.cantidad, precio: ln.precio,
    descuento: ln.descuento, subtotal: ln.subtotal, iva: ln.iva, total: ln.total,
    producto_id: ln.producto_id, clase: "entrada", origin: originDe(db),
  })));
  return { ok: true, ...(await vistaDoc(db, doc)), doc: await vistaDoc(db, doc) };
}

export async function csgPedido(db: Db, actor: string, p: Row, now: Date): Promise<Row> {
  const prov = (await db.all("erp_proveedores")).find((r) => r.id === p.proveedor_id);
  if (!prov) return { error: "Elige el proveedor" };
  const armadas = armarLineas((Array.isArray(p.lineas) ? p.lineas : []) as Row[], await productos(db), await db.all("erp_bodegas"));
  if ("error" in armadas) return armadas;
  const fecha = s(p.fecha) || ymdUtc(now);
  const docId = id();
  const numero = numeroDe(db, await db.all("erp_consignacion"), "CSG");
  const tot = sumarLineas(armadas);
  const antesStock = (await db.all("erp_stock")).reduce((a, r) => a + n(r.cantidad), 0);
  const antesOc = (await db.all("erp_oc")).length;
  const doc = {
    id: docId, numero, proveedor_id: prov.id, tipo: "pedido", estado: "pedido",
    fecha, periodo_ini: "", periodo_fin: "", oc_id: null, nota: s(p.nota) || "Pedido de consignación. No genera deuda.",
    creado_por: actor, subtotal: tot.subtotal, iva: tot.iva, total: tot.total, origin: originDe(db),
  };
  await guardarDoc(db, actor, doc, armadas.map((ln) => ({
    id: id(), codigo: ln.codigo, nombre: ln.nombre, cantidad: ln.cantidad, precio: ln.precio,
    descuento: ln.descuento, subtotal: ln.subtotal, iva: ln.iva, total: ln.total,
    producto_id: ln.producto_id, clase: "pedido", origin: originDe(db),
  })));
  const despuesStock = (await db.all("erp_stock")).reduce((a, r) => a + n(r.cantidad), 0);
  if (Math.abs(despuesStock - antesStock) > 1e-6 || (await db.all("erp_oc")).length !== antesOc) {
    return { error: "El pedido no debía mover stock ni crear una orden" };
  }
  const vista = await vistaDoc(db, doc);
  return { ok: true, ...vista, doc: vista };
}

export async function csgCierre(db: Db, actor: string, p: Row, now: Date): Promise<Row> {
  const prov = (await db.all("erp_proveedores")).find((r) => r.id === p.proveedor_id);
  if (!prov) return { error: "Elige el proveedor" };
  const desde = s(p.desde || p.periodo_ini);
  const hasta = s(p.hasta || p.periodo_fin);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
    return { error: "Elige el periodo, del día inicial al final" };
  }
  const previos = (await db.all("erp_consignacion")).filter((d) => s(d.tipo) === "cierre" && d.proveedor_id === prov.id);
  if (previos.some((d) => solapa(s(d.periodo_ini), s(d.periodo_fin), desde, hasta))) {
    return { error: "Ese periodo ya está cerrado para este proveedor" };
  }
  const mios = (await saldosDe(db)).filter((r) => r.proveedor_id === prov.id);
  const vendido = await venderEnPeriodo(db, desde, hasta);
  const ya = await yaLiquidado(db, desde, hasta);
  const partes = repartirConsignado(await saldosDe(db), vendido, ya).filter((r) => r.proveedor_id === prov.id);
  const vendidas: LineaCsg[] = partes.map((r) => {
    const cal = calcularLinea(r.cantidad, r.costo, 0);
    return {
      codigo: r.sku, nombre: r.nombre, cantidad: r.cantidad, precio: r.costo,
      descuento: cal.descuento, subtotal: cal.subtotal, iva: cal.iva, total: cal.total,
      producto_id: r.producto_id, bodega_id: r.bodega_id,
    };
  });
  const tomado = new Map<string, number>();
  for (const ln of vendidas) {
    const k = ln.producto_id + "|" + ln.bodega_id;
    tomado.set(k, (tomado.get(k) || 0) + ln.cantidad);
  }
  const restante: LineaCsg[] = [];
  for (const saldo of mios) {
    const k = saldo.producto_id + "|" + saldo.bodega_id;
    const queda = round4(saldo.cantidad - (tomado.get(k) || 0));
    if (queda <= 1e-9) continue;
    const cal = calcularLinea(queda, saldo.costo, 0);
    restante.push({
      codigo: saldo.sku, nombre: saldo.nombre, cantidad: queda, precio: saldo.costo,
      descuento: 0, subtotal: cal.subtotal, iva: cal.iva, total: cal.total,
      producto_id: saldo.producto_id, bodega_id: saldo.bodega_id,
    });
  }
  const fecha = ymdUtc(now);
  const docId = id();
  const numero = numeroDe(db, await db.all("erp_consignacion"), "CSG");
  const tot = sumarLineas(vendidas);
  const stockAntes = (await db.all("erp_stock")).map((r) => ({ id: r.id, cantidad: n(r.cantidad) }));
  let ocId: string | null = null;
  let ocNumero = "";
  if (vendidas.length) {
    const ocs = await db.all("erp_oc");
    ocId = id();
    ocNumero = numeroDe(db, ocs, "OC");
    const bodegas = await db.all("erp_bodegas");
    const venta = bodegas.find((b) => s(b.codigo) === "VENTA");
    await db.write(actor, "erp_oc", "insert", {}, {
      id: ocId, numero: ocNumero, proveedor_id: prov.id, fecha, fecha_esperada: hasta,
      bodega_destino_id: venta?.id || BODEGA_VENTA,
      estado: "abierta", flujo: "Aprobada", tipo: "consignacion",
      q_label: desde + " → " + hasta,
      subtotal: tot.subtotal, iva: tot.iva, total: tot.total, pagado: 0, saldo: tot.total,
      estado_pago: "pendiente",
      nota: "Liquidación de consignación " + numero + ". Solo lo vendido. El resto sigue consignado.",
      creado_por: actor, origin: originDe(db),
      snap: { tipo: "consignacion", conIva: true, desde, hasta, prov: { id: prov.id, nombre: s(prov.nombre) } },
    });
    let i = 0;
    for (const ln of vendidas) {
      const bruto = round2(ln.cantidad * ln.precio);
      const descPct = bruto > 0 ? round2((ln.descuento / bruto) * 100) : 0;
      await db.write(actor, "erp_oc_lineas", "insert", {}, {
        id: id(), oc_id: ocId, producto_id: ln.producto_id, cantidad: ln.cantidad, precio: ln.precio,
        descuento_pct: descPct, bodega_id: ln.bodega_id, subtotal: ln.subtotal, recibido: 0, orden: i++,
        plazo: "CONSIGNACION", origin: originDe(db),
      });
    }
  }
  const saldos = await db.all("erp_consignado");
  for (const ln of vendidas) {
    const hit = saldos.find((r) => r.producto_id === ln.producto_id && r.proveedor_id === prov.id && r.bodega_id === ln.bodega_id);
    if (!hit) continue;
    await db.write(actor, "erp_consignado", "update", { id: hit.id }, { cantidad: round4(Math.max(0, n(hit.cantidad) - ln.cantidad)) });
  }
  const doc = {
    id: docId, numero, proveedor_id: prov.id, tipo: "cierre", estado: "cerrada",
    fecha, periodo_ini: desde, periodo_fin: hasta, oc_id: ocId,
    nota: vendidas.length
      ? "Cierre " + desde + " → " + hasta + ". Orden " + ocNumero + " abierta hasta el pago."
      : "Cierre " + desde + " → " + hasta + ". No hubo ventas. El stock sigue consignado.",
    creado_por: actor, subtotal: tot.subtotal, iva: tot.iva, total: tot.total, origin: originDe(db),
  };
  const filas = [
    ...vendidas.map((ln) => ({ ...ln, clase: "vendido" })),
    ...restante.map((ln) => ({ ...ln, clase: "resta" })),
  ].map((ln) => ({
    id: id(), codigo: ln.codigo, nombre: ln.nombre, cantidad: ln.cantidad, precio: ln.precio,
    descuento: ln.descuento, subtotal: ln.subtotal, iva: ln.iva, total: ln.total,
    producto_id: ln.producto_id, clase: ln.clase, origin: originDe(db),
  }));
  await guardarDoc(db, actor, doc, filas);
  const stockDespues = await db.all("erp_stock");
  for (const prev of stockAntes) {
    const ahora = stockDespues.find((r) => r.id === prev.id);
    if (ahora && Math.abs(n(ahora.cantidad) - prev.cantidad) > 1e-6) {
      return { error: "El cierre no debe volver a descontar el stock" };
    }
  }
  const vista = await vistaDoc(db, doc);
  return { ok: true, ...vista, doc: vista };
}
