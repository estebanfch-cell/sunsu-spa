import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import "./productos_paridad_api.ts";
import { invCorto, skuCode, type Row } from "./domain.ts";
import { codigoNorm, familiasDe, siguienteCodigo } from "./productos.ts";

describe("INV con 3 dígitos (Emilia 16/11)", () => {
  it("INV-000123, SUNSU-INV-000123 e «INV 000003» = INV-123 / INV-003; otras familias igual", () => {
    assert.equal(invCorto("INV-000123"), "INV-123");
    assert.equal(skuCode("SUNSU-INV-000002"), "INV-002");
    assert.equal(skuCode("inv-000003"), "INV-003");
    assert.equal(codigoNorm("INV 000003"), "INV-003");
    assert.equal(skuCode("INV-001234"), "INV-1234");
    assert.equal(skuCode("INV-037"), "INV-037");
    for (const c of ["ML-009", "BK-001", "VK-017", "HT-014", "SUNSU-01", "12", "INVX-000001"]) assert.equal(skuCode(c), c.replace(/^SUNSU-/, ""));
    assert.equal(codigoNorm("ML-000009"), "ML-000009");
  });
  it("siguiente código de la familia INV sale con 3 dígitos aunque haya códigos viejos de 6", () => {
    const items = ["INV-122", "SUNSU-INV-000063", "INV-000130", "ML-014"].map((codigo) => ({ codigo }));
    const inv = familiasDe(items).find((f) => f.prefijo === "INV-")!;
    assert.equal(inv.ancho, 3);
    assert.equal(inv.siguiente, "INV-131");
    assert.equal(inv.total, 3);
    assert.equal(siguienteCodigo("INV-", ["INV-000998", "INV-999"], 3), "INV-1000");
    assert.equal(familiasDe(items).find((f) => f.prefijo === "ML-")!.siguiente, "ML-015");
  });
  it("la lista trae el código anterior (beta_sku_alias) para buscar por él", async () => {
    const db = new MemoryDb();
    const token = "t";
    db.tables.set("sesiones", [{ token, uid: "admin", rol: "admin", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "admin", nombre: "admin", short: "admin", rol: "admin", bloqueado: false }]);
    db.tables.set("erp_productos", [{ id: "p1", sku: "INV-002", nombre: "BIODANCE Mask", clase: "producto", uso: "cabina", activo: true }]);
    db.tables.set("beta_sku_alias", [{ alias: "SUNSU-INV-000002", sku: "INV-002" }]);
    for (const t of ["catalogo", "erp_stock", "erp_movimientos", "erp_bodegas", "app_modulos", "cabina_inventario", "inventario_base", "tickets"]) db.tables.set(t, []);
    const c = { db, now: new Date("2026-11-16T17:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}), token };
    const L = await handle("mcprod_list", { token }, c) as Row;
    const p = (L.items as Row[]).find((x) => x.id === "p1")!;
    assert.equal(p.skuVisible, "INV-002");
    assert.deepEqual(p.skuAntes, ["SUNSU-INV-000002"]);
  });
});
