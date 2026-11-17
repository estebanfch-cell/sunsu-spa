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
    assert.equal(c.stock[0].total, 7);
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
