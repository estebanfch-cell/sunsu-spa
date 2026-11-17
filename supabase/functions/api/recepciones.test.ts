import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./compras_api.ts";
import "./compras_beta_api.ts";
import "./recepciones_api.ts";
import { agrupar, destinoDe, origenDe, repartir, BOD_CASA, BOD_VENTA } from "./recepciones.ts";
import type { Row } from "./domain.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }]);
  db.tables.set("erp_bodegas", [
    { id: BOD_VENTA, codigo: "VENTA", nombre: "Venta", tipo: "venta", activa: true },
    { id: BOD_CASA, codigo: "CASA", nombre: "Casa", tipo: "casa", activa: true },
    { id: "22222222-2222-4222-8222-222222222222", codigo: "CABINA", nombre: "Cabina 1", tipo: "cabina", activa: true },
  ]);
  db.tables.set("erp_proveedores", [{ id: "p1", nombre: "Judith", activo: true }]);
  db.tables.set("erp_productos", [
    { id: "a", sku: "JN-001", nombre: "Crema", costo_promedio: 10, activo: true, uso: "venta" },
    { id: "b", sku: "SU-001", nombre: "Gasa", costo_promedio: 2, activo: true, uso: "cabina" },
  ]);
  for (const t of ["erp_oc", "erp_oc_lineas", "erp_oc_pagos", "erp_recepciones", "erp_recepcion_lineas", "erp_stock", "erp_kardex", "beta_oc_cotizaciones", "log_acciones", "proveedores"]) db.tables.set(t, []);
  return db;
}
// deno-lint-ignore no-explicit-any
const mk = (now: string) => (db: MemoryDb, action: string, p: Record<string, unknown> = {}) => handle(action, { token: "adm", ...p }, { db, now: new Date(now), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" } as never) as Promise<Record<string, any>>;

describe("recepciones (TK25)", () => {
  it("origen, destino, agrupar y repartir", () => {
    assert.equal(origenDe({ sku: "HT-007" }), "consignacion");
    assert.equal(origenDe({ sku: "SU-001" }), "propio");
    assert.equal(origenDe({ sku: "HT-007", beta_origen: "propio" }), "propio");
    assert.equal(destinoDe({ sku: "SU-001", uso: "venta" }).bodega_id, BOD_VENTA);
    assert.equal(destinoDe({ sku: "SU-002", uso: "cabina" }).bodega_id, BOD_CASA);
    const prods = new Map<string, Row>([["a", { id: "a", sku: "JN-001", nombre: "Crema", uso: "venta" }]]);
    const g = agrupar([{ id: "l1", producto_id: "a", cantidad: 2, recibido: 0 }, { id: "l2", producto_id: "a", cantidad: 3, recibido: 1 }], prods, new Date());
    assert.equal(g.length, 1);
    assert.equal(g[0].pedido, 5); assert.equal(g[0].pendiente, 4);
    assert.deepEqual(repartir([{ id: "l1", cantidad: 2, recibido: 0 }, { id: "l2", cantidad: 3, recibido: 1 }], 3), [{ id: "l1", cantidad: 2 }, { id: "l2", cantidad: 1 }]);
  });
  it("recibe a la bodega correcta, anula y deshace dentro de 1 hora", async () => {
    const db = semilla();
    const h = mk("2026-11-17T20:00:00Z");
    const oc = await h(db, "cmpb_crear", { proveedor_id: "p1", lineas: [{ producto_id: "a", cantidad: 2 }, { producto_id: "a", cantidad: 3 }, { producto_id: "b", cantidad: 4 }] });
    assert.equal(oc.ok, true, JSON.stringify(oc));
    const d = await h(db, "rcp_get", { id: oc.id });
    assert.equal(d.grupos.length, 2, "JN-001 repetido va en una sola fila");
    const stock = (pid: string, bod: string) => (db.tables.get("erp_movimientos") || []).filter((x) => x.producto_id === pid && x.bodega_id === bod).reduce((a, x) => a + Number(x.delta), 0);
    const v0 = stock("a", BOD_VENTA), c0 = stock("b", BOD_CASA);
    const r = await h(db, "rcp_recibir", { oc_id: oc.id, grupos: [{ producto_id: "a", accion: "recibido", cantidad: 4 }, { producto_id: "b", accion: "no_recibido" }] });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(stock("a", BOD_VENTA) - v0, 4);
    const d2 = await h(db, "rcp_get", { id: oc.id });
    assert.equal(d2.oc.estado, "Recibida parcial");
    const gb = d2.grupos.find((g: Row) => g.producto_id === "b");
    assert.equal(gb.pendiente, 0); assert.equal(gb.deshacer, 4);
    const tarde = mk("2026-11-17T21:30:00Z");
    assert.match((await tarde(db, "rcp_no_recibido_undo", { oc_id: oc.id, producto_id: "b" })).error, /1 hora/);
    const u = await h(db, "rcp_no_recibido_undo", { oc_id: oc.id, producto_id: "b" });
    assert.equal(u.ok, true, JSON.stringify(u));
    const d3 = await h(db, "rcp_get", { id: oc.id });
    assert.equal(d3.grupos.find((g: Row) => g.producto_id === "b").pendiente, 4);
    const r2 = await h(db, "rcp_recibir", { oc_id: oc.id, grupos: [{ producto_id: "a", accion: "recibido", cantidad: 1 }, { producto_id: "b", accion: "recibido", cantidad: 4 }] });
    assert.equal(r2.ok, true, JSON.stringify(r2));
    assert.equal(stock("b", BOD_CASA) - c0, 4);
    assert.equal((await h(db, "cmpb_get", { id: oc.id })).oc.estado, "Recibida");
  });
});
