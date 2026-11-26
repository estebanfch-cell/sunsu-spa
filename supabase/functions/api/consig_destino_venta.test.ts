import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./compras_api.ts";
import "./compras_beta_api.ts";
import "./recepciones_api.ts";
import { BOD_CABINA, BOD_CASA, BOD_CONSIG, BOD_VENTA } from "./recepciones.ts";
import { runErp } from "./erp.ts";
import type { Row } from "./domain.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }]);
  db.tables.set("erp_bodegas", [
    { id: BOD_VENTA, codigo: "VENTA", nombre: "Venta", tipo: "venta", activa: true },
    { id: BOD_CASA, codigo: "CASA", nombre: "Casa", tipo: "casa", activa: true },
    { id: BOD_CABINA, codigo: "CABINA", nombre: "Cabina 1", tipo: "cabina", activa: true },
    { id: BOD_CONSIG, codigo: "CONSIGNACION", nombre: "Consignación", tipo: "consignacion", activa: true },
  ]);
  db.tables.set("erp_proveedores", [{ id: "p1", nombre: "Prov", activo: true, familia: "HT" }]);
  db.tables.set("beta_proveedores_ficha", [
    { familia: "HT", consignacion: true },
    { familia: "VK", consignacion: true },
    { familia: "ML", consignacion: true },
  ]);
  db.tables.set("erp_productos", [
    { id: "ht", sku: "HT-007", nombre: "Serum", costo_promedio: 10, activo: true, uso: "venta" },
    { id: "vk", sku: "VK-015", nombre: "Essence", costo_promedio: 10, activo: true, uso: "venta" },
    { id: "su", sku: "SU-001", nombre: "Propio", costo_promedio: 5, activo: true, uso: "venta" },
  ]);
  for (const t of ["erp_oc", "erp_oc_lineas", "erp_oc_pagos", "erp_recepciones", "erp_recepcion_lineas", "erp_stock", "erp_movimientos", "erp_kardex", "beta_oc_cotizaciones", "log_acciones", "proveedores", "erp_avisos", "erp_producto_bodega"]) db.tables.set(t, []);
  return db;
}

const mk = (now: string) => (db: MemoryDb, action: string, p: Record<string, unknown> = {}) =>
  handle(action, { token: "adm", ...p }, { db, now: new Date(now), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" } as never) as Promise<Record<string, any>>;

function delta(db: MemoryDb, pid: string, bod: string) {
  return (db.tables.get("erp_movimientos") || []).filter((x) => x.producto_id === pid && x.bodega_id === bod).reduce((a, x) => a + Number(x.delta), 0);
}

describe("t974u consignación no entra a Venta", () => {
  it("rcp_recibir ignora bodega Venta que mande el cliente y postea en CONSIGNACION", async () => {
    const db = semilla();
    const h = mk("2026-11-26T20:00:00Z");
    const oc = await h(db, "cmpb_crear", { proveedor_id: "p1", lineas: [{ producto_id: "ht", cantidad: 10 }, { producto_id: "vk", cantidad: 5 }, { producto_id: "su", cantidad: 3 }] });
    assert.equal(oc.ok, true, JSON.stringify(oc));
    const r = await h(db, "rcp_recibir", {
      oc_id: oc.id,
      grupos: [
        { producto_id: "ht", accion: "recibido", cantidad: 10, bodega_id: BOD_VENTA },
        { producto_id: "vk", accion: "recibido", cantidad: 5, bodega_id: BOD_VENTA },
        { producto_id: "su", accion: "recibido", cantidad: 3, bodega_id: BOD_VENTA },
      ],
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(delta(db, "ht", BOD_CONSIG), 10);
    assert.equal(delta(db, "ht", BOD_VENTA), 0);
    assert.equal(delta(db, "vk", BOD_CONSIG), 5);
    assert.equal(delta(db, "vk", BOD_VENTA), 0);
    assert.equal(delta(db, "su", BOD_VENTA), 3);
    assert.equal(delta(db, "su", BOD_CONSIG), 0);
  });

  it("oc_recibir fuerza CONSIGNACION aunque la línea de OC diga Venta", async () => {
    const db = semilla();
    const now = new Date("2026-11-26T20:00:00Z");
    await db.write("admin", "erp_oc", "insert", {}, { id: "oc1", numero: "OC-T974", proveedor_id: "p1", estado: "abierta", flujo: "Enviada", fecha: "2026-11-26" });
    await db.write("admin", "erp_oc_lineas", "insert", {}, { id: "l1", oc_id: "oc1", producto_id: "ht", cantidad: 4, recibido: 0, no_recibido: 0, precio: 10, bodega_id: BOD_VENTA });
    const out = await runErp("oc_recibir", { oc_id: "oc1", lineas: [{ oc_linea_id: "l1", cantidad: 4, bodega_id: BOD_VENTA }] }, db, "admin", now);
    assert.equal((out as Row).ok, true, JSON.stringify(out));
    assert.equal(delta(db, "ht", BOD_CONSIG), 4);
    assert.equal(delta(db, "ht", BOD_VENTA), 0);
  });
});
