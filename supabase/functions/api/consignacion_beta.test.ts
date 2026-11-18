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

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }]);
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
    const r = await h(db, "cns_restock_guardar", { proveedor_id: "p1", desde: "2026-11-01", hasta: "2026-11-15", lineas: [{ producto_id: "a", cantidad: 5 }] });
    const d = await h(db, "rcp_get", { id: "rst:" + r.id });
    assert.equal(d.bloqueado, ""); assert.equal(d.oc.recibible, true);
    assert.equal(d.grupos[0].bodega_id, CONS);
    const x = await h(db, "rcp_recibir", { oc_id: "rst:" + r.id, grupos: [{ producto_id: "a", accion: "recibido", cantidad: 3 }] });
    assert.equal(x.ok, true, JSON.stringify(x));
    assert.equal(x.acta, "ACTA-2026-0001");
    assert.equal(mov(db, "a", CONS), 3);
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

