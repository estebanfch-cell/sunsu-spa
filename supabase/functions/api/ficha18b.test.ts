import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import "./productos_paridad_api.ts";
import { autoMinimos, deducirDelNombre, faltantesDe } from "./productos.ts";
import { siguientePresentacion } from "./productos_paridad_api.ts";
import type { Row } from "./domain.ts";

describe("TK18b ficha de producto", () => {
  it("deduce contenido, unidad y envase del nombre", () => {
    assert.deepEqual(deducirDelNombre("Heartleaf Cleansing Oil 200ml - ANUA"), { contenido: 200, unidad: "ml", envase: "gotero" });
    assert.deepEqual(deducirDelNombre("Heartleaf 77 Toner Pad 70 Pads - ANUA"), { contenido: 70, unidad: "unidades", envase: "pote" });
    assert.equal(deducirDelNombre("Crema 50 g").unidad, "g");
    assert.equal(deducirDelNombre("Sun Spray SPF50").envase, "spray");
    assert.deepEqual(deducirDelNombre("Algo sin datos"), {});
  });
  it("mínimo y reorden automáticos; sin salidas no inventa", () => {
    assert.deepEqual(autoMinimos(0), { minimo: null, reorden: null, porDia: 0 });
    const a = autoMinimos(90); assert.equal(a.minimo, 7); assert.equal(a.reorden, 21);
    const b = autoMinimos(2); assert.equal(b.minimo, 1); assert.equal(b.reorden, 1);
  });
  it("Por revisar: insumos de cabina no piden precio; reorden automático cubre sin_reorden", () => {
    assert.deepEqual(faltantesDe(["sin_precio", "sin_foto"], "cabina", false), ["sin_foto"]);
    assert.deepEqual(faltantesDe(["sin_precio", "sin_reorden"], "venta", true), ["sin_precio"]);
    assert.deepEqual(faltantesDe(null, "venta", false), []);
  });
  it("subcódigos de presentación HT-007-1, -2…", () => {
    assert.equal(siguientePresentacion("HT-007", ["HT-007", "HT-008"]), "HT-007-1");
    assert.equal(siguientePresentacion("HT-007", ["HT-007", "HT-007-1", "HT-007-3", "HT-0071"]), "HT-007-4");
  });
  it("crea la presentación copiando del base y enlaza las dos fichas", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }, { token: "cos", uid: "u", rol: "cosmetologa", name: "Ana", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }, { id: "u", nombre: "Ana", rol: "cosmetologa" }]);
    db.tables.set("erp_productos", [{ id: "p7", sku: "HT-007", nombre: "Rice Ceramide Serum 50ml - ANUA", marca: "ANUA", categoria: "Producto", clase: "producto", uso: "venta", activo: true }]);
    for (const t of ["log_acciones", "erp_bodegas", "erp_movimientos", "erp_stock", "audit_log"]) db.tables.set(t, []);
    const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { db, now: new Date("2026-11-17T22:00:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: tok } as never) as Promise<Row>;
    assert.equal((await h("mcprod_presentacion_nueva", "cos", { id: "p7", contenido: 30, unidad: "ml" })).error, "Solo un admin crea presentaciones");
    assert.match(String((await h("mcprod_presentacion_nueva", "adm", { id: "p7", contenido: 0, unidad: "ml" })).error), /contenido/);
    const r = await h("mcprod_presentacion_nueva", "adm", { id: "p7", contenido: 30, unidad: "ml", envase: "gotero" });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.sku, "HT-007-1"); assert.equal(r.nombre, "Rice Ceramide Serum 30ml - ANUA");
    const L = db.tables.get("erp_productos")!;
    const n1 = L.find((x) => x.sku === "HT-007-1")!;
    assert.equal(n1.marca, "ANUA"); assert.equal(n1.producto_base, "HT-007"); assert.equal(n1.beta_contenido, 30);
    assert.deepEqual(L.find((x) => x.id === "p7")!.beta_presentaciones, [n1.id]);
    // desde la presentación, la siguiente sigue colgando del base
    const r2 = await h("mcprod_presentacion_nueva", "adm", { id: n1.id, contenido: 100, unidad: "ml" });
    assert.equal(r2.sku, "HT-007-2");
    assert.equal(L.find((x) => x.sku === "HT-007")!.nombre, "Rice Ceramide Serum 50ml - ANUA");
  });
});
