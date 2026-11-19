import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./compras_api.ts";
import "./compras_beta_api.ts";
import "./recepciones_api.ts";
import "./consignacion_beta_api.ts";
import "./actas_api.ts";
import { periodos } from "./consignacion_beta_api.ts";
import { runErp } from "./erp.ts";
import { resolverPrecio, preciosDesdeOrdenes, ocLegacyDelPeriodo } from "./consig_precios.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "super_admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "super_admin" }]);
  db.tables.set("erp_bodegas", [{ id: "11111111-1111-4111-8111-111111111111", codigo: "VENTA", nombre: "Venta", tipo: "venta", activa: true }]);
  db.tables.set("erp_proveedores", [{ id: "p1", nombre: "Hebetronic S.A", activo: true, legacy_sheet_row: 3 }]);
  db.tables.set("proveedores", [{ sheet_row: 3, nombre: "Hebetronic S.A", familia: "HT" }]);
  db.tables.set("erp_productos", [{ id: "a", sku: "HT-001", nombre: "Sérum", costo_promedio: 10, activo: true, uso: "venta" }]);
  db.tables.set("erp_stock", [{ id: 1, producto_id: "a", bodega_id: "11111111-1111-4111-8111-111111111111", cantidad: 7 }]);
  db.tables.set("tickets", [
    { id: 1, sheet_row: 10, timestamp: "2026-11-05T15:00:00Z", orig: { "HT-001 Sérum": 2 }, estimado: 20 },
    { id: 2, sheet_row: 11, timestamp: "2026-11-20T15:00:00Z", orig: { "HT-001 Sérum": 1 }, estimado: 10 },
  ]);
  for (const t of ["erp_oc", "erp_oc_lineas", "erp_oc_pagos", "erp_recepciones", "erp_recepcion_lineas", "erp_movimientos", "beta_oc_cotizaciones", "beta_consig_restock", "beta_actas", "log_acciones", "erp_consignacion_consumo"]) db.tables.set(t, []);
  return db;
}
// deno-lint-ignore no-explicit-any
const h = (db: MemoryDb, action: string, p: Record<string, unknown> = {}) => handle(action, { token: "adm", ...p }, { db, now: new Date("2026-11-17T20:00:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" } as never) as Promise<Record<string, any>>;

describe("consignación en Compras (TK26)", () => {
  it("periodos: el por defecto es la quincena anterior", () => {
    const P = periodos(new Date("2026-11-17T20:00:00Z"));
    assert.equal(P[0].label, "16-fin Nov 2026");
    const d = P.find((x) => x.defecto)!;
    assert.equal(d.desde, "2026-11-01"); assert.equal(d.hasta, "2026-11-15");
    const ene = periodos(new Date("2026-01-03T20:00:00Z"));
    assert.equal(ene[1].desde, "2025-12-16"); assert.equal(ene[1].hasta, "2025-12-31");
  });
  it("calcula lo vendido, crea la OC del periodo una sola vez y el pedido de restock", async () => {
    const db = semilla();
    const c = await h(db, "cns_calc", { proveedor_id: "p1", anio: 2026, mes: 11, quincena: 1 });
    assert.equal(c.ok, true, JSON.stringify(c));
    assert.equal(c.desde, "2026-11-01");
    assert.equal(c.stock[0].venta, 7, "fuera de la bodega Consignación hasta el conteo inicial");
    assert.equal(c.stock[0].consignacion, 0);
    const oc = await h(db, "cns_crear_oc", { proveedor_id: "p1", anio: 2026, mes: 11, quincena: 1 });
    assert.equal(c.fact.length, 1); assert.equal(c.fact[0].vendido, 2);
    assert.equal(oc.ok, true, JSON.stringify(oc));
    assert.match((await h(db, "cns_crear_oc", { proveedor_id: "p1", anio: 2026, mes: 11, quincena: 1 })).error, /Ya existe/);
    const g = await h(db, "cmpb_get", { id: oc.id });
    assert.equal(g.oc.estado, "Aprobada");
    const r = await h(db, "cns_restock_guardar", { proveedor_id: "p1", desde: c.desde, hasta: c.hasta, lineas: [{ producto_id: "a", cantidad: 3 }] });
    assert.equal(r.numero, "RST-2026-0001");
    const l = await h(db, "rcp_lista");
    assert.ok(l.items.some((x: Record<string, unknown>) => x.id === "rst:" + r.id), "el restock aparece en Recepciones");
    assert.ok(!l.items.some((x: Record<string, unknown>) => x.id === oc.id), "la OC de consignación no se recibe");
    const d = await h(db, "rcp_get", { id: "rst:" + r.id });
    assert.ok(d.bloqueado);
  });
  it("al recibir una OC se genera el acta y el admin la firma", async () => {
    const db = semilla();
    const oc = await h(db, "cmpb_crear", { proveedor_id: "p1", lineas: [{ producto_id: "a", cantidad: 2 }] });
    const r = await h(db, "rcp_recibir", { oc_id: oc.id, grupos: [{ producto_id: "a", accion: "recibido", cantidad: 2 }] });
    assert.equal(r.acta, "ACTA-2026-0001");
    const g = await h(db, "cmpb_get", { id: oc.id });
    assert.equal(g.oc.actas.length, 1);
    assert.equal(g.oc.actas[0].lineas[0].recibido, 2);
    const png = "data:image/png;base64," + "A".repeat(300);
    assert.equal((await h(db, "acta_firmar", { id: g.oc.actas[0].id, firma: png, nombre: "Emilia" })).ok, true);
    assert.equal((await h(db, "cmpb_get", { id: oc.id })).oc.actas[0].firmadoPor, "Emilia");
  });
});

const CONS = "66666666-6666-4666-8666-666666666666", VEN = "11111111-1111-4111-8111-111111111111";
function semilla27() {
  const db = semilla();
  db.tables.get("erp_bodegas")!.push({ id: CONS, codigo: "CONSIGNACION", nombre: "Consignación", tipo: "consignacion", activa: true });
  db.tables.set("beta_stock_movimientos", []);
  return db;
}
const mov = (db: MemoryDb, pid: string, bod: string) => (db.tables.get("erp_movimientos") || []).filter((x) => x.producto_id === pid && x.bodega_id === bod).reduce((a, x) => a + Number(x.delta), 0);

describe("bodega CONSIGNACION (TK27)", () => {
  it("el restock (RST) se recibe en Recepciones y entra a CONSIGNACION, con acta", async () => {
    const db = semilla27();
    const c0 = Number((db.tables.get("erp_productos") || []).find((x) => x.id === "a")?.costo_promedio ?? 0);
    const r = await h(db, "cns_restock_guardar", { proveedor_id: "p1", desde: "2026-11-01", hasta: "2026-11-15", lineas: [{ producto_id: "a", cantidad: 5 }] });
    const d = await h(db, "rcp_get", { id: "rst:" + r.id });
    assert.equal(d.bloqueado, ""); assert.equal(d.oc.recibible, true);
    assert.equal(d.grupos[0].bodega_id, CONS);
    const x = await h(db, "rcp_recibir", { oc_id: "rst:" + r.id, grupos: [{ producto_id: "a", accion: "recibido", cantidad: 3 }] });
    assert.equal(x.ok, true, JSON.stringify(x));
    assert.equal(x.acta, "ACTA-2026-0001");
    assert.equal(mov(db, "a", CONS), 3);
    // TK74: un restock no trae costo; no debe bajar el costo promedio del producto.
    const pa = (db.tables.get("erp_productos") || []).find((x) => x.id === "a");
    assert.equal(Number(pa?.costo_promedio ?? 0), c0, "el costo promedio no cambia con un restock sin costo");
    assert.equal((await h(db, "rcp_get", { id: "rst:" + r.id })).oc.estado, "Recibida parcial");
    assert.match((await h(db, "rcp_recibir", { oc_id: "rst:" + r.id, grupos: [{ producto_id: "a", accion: "recibido", cantidad: 9 }] })).error, /solo quedan 2/);
    const y = await h(db, "rcp_recibir", { oc_id: "rst:" + r.id, grupos: [{ producto_id: "a", accion: "no_recibido" }] });
    assert.equal(y.estado, "recibida");
    assert.ok(!(await h(db, "rcp_lista")).items.some((i: Record<string, unknown>) => i.id === "rst:" + r.id));
    // la OC de consignación del periodo, creada después, muestra el acta del restock
    const oc = await h(db, "cns_crear_oc", { proveedor_id: "p1", anio: 2026, mes: 11, quincena: 1 });
    assert.equal((await h(db, "cmpb_get", { id: oc.id })).oc.actas.length, 2);
  });
  it("una OC normal de un producto en consignación entra a CONSIGNACION", async () => {
    const db = semilla27();
    const oc = await h(db, "cmpb_crear", { proveedor_id: "p1", lineas: [{ producto_id: "a", cantidad: 2 }] });
    const d = await h(db, "rcp_get", { id: oc.id });
    assert.equal(d.grupos[0].bodega_id, CONS);
    assert.ok(d.bodegas.some((b: Record<string, unknown>) => b.codigo === "CONSIGNACION"));
    await h(db, "rcp_recibir", { oc_id: oc.id, grupos: [{ producto_id: "a", accion: "recibido", cantidad: 2 }] });
    assert.equal(mov(db, "a", CONS), 2);
    assert.equal(mov(db, "a", VEN), 0);
  });
  it("la venta toma primero de CONSIGNACION (sin dejarla negativa) y el resto de Venta; la edición devuelve a donde salió", async () => {
    const db = semilla27();
    db.tables.get("erp_stock")!.push({ id: 2, producto_id: "a", bodega_id: CONS, cantidad: 2 });
    await runErp("stock_delta", { moves: [{ sku: "HT-001", bodega_id: VEN, delta: -3, tipo: "venta", ticket_ref: "T1", legacy_ref: "vta:T1" }] }, db, "admin", new Date("2026-11-17T20:00:00Z"));
    assert.equal(mov(db, "a", CONS), -2);
    assert.equal(mov(db, "a", VEN), -1);
    // edición del ticket: quita 2 → vuelven a CONSIGNACION (de ahí salieron)
    await runErp("stock_delta", { moves: [{ sku: "HT-001", bodega_id: VEN, delta: 2, tipo: "anulacion", ticket_ref: "T1", legacy_ref: "edit:T1:x" }] }, db, "admin", new Date("2026-11-17T20:05:00Z"));
    assert.equal(mov(db, "a", CONS), 0);
    assert.equal(mov(db, "a", VEN), -1);
    // sin stock en CONSIGNACION sigue saliendo de Venta
    const db2 = semilla27();
    await runErp("stock_delta", { moves: [{ sku: "HT-001", bodega_id: VEN, delta: -1, tipo: "venta", ticket_ref: "T2" }] }, db2, "admin", new Date("2026-11-17T20:00:00Z"));
    assert.equal(mov(db2, "a", VEN), -1); assert.equal(mov(db2, "a", CONS), 0);
  });
  it("conteo inicial: propone lo que está fuera y lo pasa a CONSIGNACION, registrado, sin pasar de lo que hay", async () => {
    const db = semilla27();
    const c = await h(db, "cns_conteo_inicial", { proveedor_id: "p1" });
    assert.equal(c.ok, true, JSON.stringify(c));
    assert.equal(c.items[0].venta, 7); assert.equal(c.items[0].consignacion, 0);
    assert.match((await h(db, "cns_conteo_transferir", { proveedor_id: "p1", items: [{ producto_id: "a", desde: "VENTA", cantidad: 8 }] })).error, /solo hay 7/);
    const t = await h(db, "cns_conteo_transferir", { proveedor_id: "p1", items: [{ producto_id: "a", desde: "VENTA", cantidad: 7 }] });
    assert.equal(t.ok, true, JSON.stringify(t));
    assert.equal(mov(db, "a", CONS), 7); assert.equal(mov(db, "a", VEN), -7);
    assert.ok((db.tables.get("log_acciones") || []).some((l) => /CONSIG CONTEO INICIAL/.test(JSON.stringify(l))));
    const c2 = await h(db, "cns_conteo_inicial", { proveedor_id: "p1" });
    assert.equal(c2.items[0].consignacion, 7); assert.equal(c2.items[0].venta, 0); assert.equal(c2.items[0].yaPasado, 7);
    // el cálculo de consignación sigue igual: lo vendido del periodo y stock Venta + Consignación
    const k = await h(db, "cns_calc", { proveedor_id: "p1", anio: 2026, mes: 11, quincena: 1 });
    assert.equal(k.fact[0].vendido, 2);
    assert.equal(k.items[0].stock, 7);
    assert.equal(k.stockNota, "");
  });
});


describe("precio de consignación (TK70)", () => {
  it("resolverPrecio: manual gana, luego la última OC, luego el costo de ficha", () => {
    const g = new Map([["ML-001", { precio: 99, fuente: "manual", oc_numero: "OC-1" }]]);
    const oc = new Map([["ML-001", { precio: 55.95652173913044, oc_numero: "OC-2026-087" }], ["ML-002", { precio: 50.86956521739131, oc_numero: "OC-2026-087" }]]);
    assert.equal(resolverPrecio("ML-001", { guardados: g, ultimaOc: oc, costo: 82.61 }).fuente, "manual");
    assert.equal(resolverPrecio("ML-001", { guardados: g, ultimaOc: oc, costo: 82.61 }).precio, 99);
    assert.equal(resolverPrecio("SUNSU-ML-002", { ultimaOc: oc, costo: 73.91 }).precio, 50.86956521739131);
    assert.equal(resolverPrecio("ML-002", { ultimaOc: oc, costo: 73.91 }).fuente, "oc");
    assert.equal(resolverPrecio("ML-007", { ultimaOc: oc, costo: 52.17 }).precio, 52.17);
    assert.equal(resolverPrecio("ML-007", { ultimaOc: oc, costo: 52.17 }).fuente, "costo");
  });
  it("preciosDesdeOrdenes toma el de la última OC y ocLegacyDelPeriodo encuentra OC-2026-087", () => {
    const ordenes = [
      { numorden: "OC-2026-077", proveedor: "Atencio Aguas Francisco Javier", json: JSON.stringify({ prov: { familia: "ML" }, qLabel: "1-15 Oct 2026", fact: [{ sku: "SUNSU-ML-001", vendido: 5, compra: 55.95652173913044 }] }) },
      { numorden: "OC-2026-087", fecha: "17/11/2026 08:50", proveedor: "Atencio Aguas Francisco Javier", json: JSON.stringify({
        prov: { familia: "ML", nombre: "Atencio Aguas Francisco Javier" }, qLabel: "1-15 Nov 2026",
        fact: [
          { sku: "SUNSU-ML-001", vendido: 8, compra: 55.95652173913044 },
          { sku: "SUNSU-ML-002", vendido: 1, compra: 50.86956521739131 },
          { sku: "SUNSU-ML-004", vendido: 1, compra: 36.73913043478261 },
          { sku: "SUNSU-ML-005", vendido: 5, compra: 48.04347826086957 },
        ],
      }) },
    ];
    const p = preciosDesdeOrdenes(ordenes, "ML");
    assert.equal(p.get("ML-001")?.oc_numero, "OC-2026-087");
    assert.equal(p.get("ML-001")?.precio, 55.95652173913044);
    const leg = ocLegacyDelPeriodo(ordenes, "ML", "1-15 Nov 2026");
    assert.equal(leg?.numero, "OC-2026-087");
    assert.equal(leg?.total, 891.8);
  });
  it("cns_calc de 1-15 Nov usa el precio de OC-2026-087 (no el costo_promedio) y llega a $891.80", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "super_admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "super_admin" }]);
    db.tables.set("erp_bodegas", [
      { id: "11111111-1111-4111-8111-111111111111", codigo: "VENTA", nombre: "Venta", tipo: "venta", activa: true },
      { id: "66666666-6666-4666-8666-666666666666", codigo: "CONSIGNACION", nombre: "Consignación", tipo: "consignacion", activa: true },
    ]);
    db.tables.set("erp_proveedores", [{ id: "at", nombre: "Atencio Aguas Francisco Javier", activo: true, ruc: "1715933022001", legacy_sheet_row: 4 }]);
    db.tables.set("proveedores", [{ sheet_row: 4, nombre: "Atencio Aguas Francisco Javier", familia: "ML" }]);
    const prods = [
      { id: "m1", sku: "ML-001", nombre: "PDRN", costo_promedio: 82.61, activo: true, uso: "venta" },
      { id: "m2", sku: "ML-002", nombre: "Eye Cream", costo_promedio: 73.91, activo: true, uso: "venta" },
      { id: "m4", sku: "ML-004", nombre: "Toner", costo_promedio: 52.17, activo: true, uso: "venta" },
      { id: "m5", sku: "ML-005", nombre: "Serum", costo_promedio: 70.87, activo: true, uso: "venta" },
    ];
    db.tables.set("erp_productos", prods);
    db.tables.set("erp_stock", [
      { producto_id: "m1", bodega_id: "11111111-1111-4111-8111-111111111111", cantidad: 15 },
    ]);
    db.tables.set("tickets", [
      { id: 1, timestamp: "2026-11-03T15:00:00Z", orig: { "ML-001": 8 } },
      { id: 2, timestamp: "2026-11-04T15:00:00Z", orig: { "ML-002": 1 } },
      { id: 3, timestamp: "2026-11-05T15:00:00Z", orig: { "ML-004": 1 } },
      { id: 4, timestamp: "2026-11-06T15:00:00Z", orig: { "ML-005": 5 } },
    ]);
    const json087 = JSON.stringify({
      prov: { familia: "ML", nombre: "Atencio Aguas Francisco Javier" }, qLabel: "1-15 Nov 2026",
      fact: [
        { sku: "SUNSU-ML-001", vendido: 8, compra: 55.95652173913044 },
        { sku: "SUNSU-ML-002", vendido: 1, compra: 50.86956521739131 },
        { sku: "SUNSU-ML-004", vendido: 1, compra: 36.73913043478261 },
        { sku: "SUNSU-ML-005", vendido: 5, compra: 48.04347826086957 },
      ],
    });
    db.tables.set("ordenes_compra", [{ numorden: "OC-2026-087", fecha: "17/11/2026 08:50", proveedor: "Atencio Aguas Francisco Javier", json: json087 }]);
    for (const t of ["erp_oc", "erp_oc_lineas", "erp_oc_pagos", "erp_recepciones", "erp_recepcion_lineas", "erp_movimientos", "beta_oc_cotizaciones", "beta_consig_restock", "beta_actas", "log_acciones", "erp_consignacion_consumo", "beta_consig_precios", "catalogo", "cabina_inventario", "inventario_base"]) db.tables.set(t, []);
    const c = await h(db, "cns_calc", { proveedor_id: "at", anio: 2026, mes: 11, quincena: 1 });
    assert.equal(c.ok, true, JSON.stringify(c));
    const por = Object.fromEntries((c.fact || []).map((x: { sku: string }) => [x.sku, x]));
    assert.equal(por["ML-001"].vendido, 8);
    assert.equal(por["ML-001"].compra, 55.95652173913044);
    assert.equal(por["ML-001"].subtotal, 447.65);
    assert.equal(por["ML-002"].compra, 50.86956521739131);
    assert.equal(por["ML-004"].compra, 36.73913043478261);
    assert.equal(por["ML-005"].compra, 48.04347826086957);
    assert.equal(por["ML-005"].subtotal, 240.22);
    assert.equal(c.totales.subtotal, 775.48);
    assert.equal(c.totales.iva, 116.32);
    assert.equal(c.totales.total, 891.8);
    assert.equal(c.ocLegacy.numero, "OC-2026-087");
    const st = (c.stock || []).find((x: { sku: string }) => x.sku === "ML-001");
    assert.equal(st.consignacion, 0);
    assert.equal(st.venta, 15);
    assert.equal(st.enSunsu, 15);
    const blocked = await h(db, "cns_crear_oc", { proveedor_id: "at", anio: 2026, mes: 11, quincena: 1 });
    assert.match(String(blocked.error), /OC-2026-087/);
  });
  it("cns_precios_guardar deja el precio manual y el cálculo lo usa", async () => {
    const db = semilla();
    const g = await h(db, "cns_precios_guardar", { proveedor_id: "p1", precios: [{ sku: "HT-001", precio: 7.5 }] });
    assert.equal(g.ok, true, JSON.stringify(g));
    const c = await h(db, "cns_calc", { proveedor_id: "p1", anio: 2026, mes: 11, quincena: 1 });
    assert.equal(c.fact[0].compra, 7.5);
    assert.equal(c.fact[0].precioFuente, "manual");
    assert.equal(c.totales.subtotal, 15);
    assert.equal(c.totales.total, 17.25);
  });
});
