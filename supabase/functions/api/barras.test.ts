import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./productos_api.ts";
import "./barras_api.ts";
import { revisarBarras } from "./barras.ts";
import type { Row } from "./domain.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Ana", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("erp_productos", [
    { id: "p1", sku: "SUNSU-HT-001", nombre: "Tónico", clase: "producto", activo: true, codigo_barras: "8809937360834.0" },
    { id: "p2", sku: "SUNSU-HT-002", nombre: "Serum", clase: "producto", activo: true },
    { id: "p3", sku: "SUNSU-HT-003", nombre: "Crema", clase: "producto", activo: true, codigo_barras: "2000000000015", beta_codigos: [{ codigo: "2000000000015", tipo: "interno", principal: true }] },
    { id: "p4", sku: "SUNSU-HT-004", nombre: "Mascarilla", clase: "producto", activo: true },
  ]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }, { id: "u-ana", nombre: "Ana", rol: "cosmetologa" }]);
  for (const t of ["log_acciones", "catalogo", "erp_bodegas", "erp_movimientos"]) db.tables.set(t, []);
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { db, now: new Date("2026-11-17T21:00:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: tok } as never) as Promise<Row>;
  return { db, h };
}

describe("🏷️ Códigos de barras", () => {
  it("revisa: sin código, EAN-13 que no cuadra y repetidos", () => {
    const R = revisarBarras([
      { id: "a", sku: "A", barras: ["8809937360834.0"] },
      { id: "b", sku: "B", barras: [] },
      { id: "c", sku: "C", barras: ["1234567890123", "XYZ"] },
      { id: "d", sku: "D", barras: ["XYZ"] },
    ]);
    assert.deepEqual(R.get("a"), []);
    assert.equal(R.get("b")![0].tipo, "sin_codigo");
    assert.deepEqual(R.get("c")!.map((x) => x.tipo), ["ean_invalido", "repetido"]);
    assert.equal(R.get("d")![0].con, "C");
  });

  it("resumen, generar internos en lote (sin pisar) y asignar un código escaneado", async () => {
    const { db, h } = semilla();
    const r = await h("barras_resumen", "cos");
    assert.equal(r.ok, true); assert.equal(r.admin, false);
    assert.equal(r.sinCodigo, 2);
    assert.deepEqual((r.items as Row[]).find((i) => i.id === "p1")!.barras, ["8809937360834"]);
    assert.equal((await h("barras_generar_lote", "cos", { ids: ["p2"] })).error, "Solo un admin genera códigos");
    const g = await h("barras_generar_lote", "adm", { ids: ["p1", "p2", "p4"] });
    assert.deepEqual((g.hechos as Row[]).map((x) => x.codigo), ["2000000000022", "2000000000039"]);
    assert.deepEqual(g.saltados, ["SUNSU-HT-001"]);
    assert.equal(db.tables.get("erp_productos")!.find((p) => p.id === "p1")!.codigo_barras, "8809937360834.0");
    assert.equal((await h("barras_resumen", "adm")).sinCodigo, 0);
    // asignar: ya usado por otro → error; nuevo → queda adicional y el principal se mantiene
    assert.match(String((await h("barras_asignar", "adm", { id: "p1", codigo: "2000000000015" })).error), /ya lo tiene SUNSU-HT-003/);
    const a = await h("barras_asignar", "adm", { id: "p1", codigo: "7701234567897" });
    assert.equal(a.ok, true, JSON.stringify(a));
    const p1 = db.tables.get("erp_productos")!.find((p) => p.id === "p1")!;
    assert.equal(p1.codigo_barras, "8809937360834");
    assert.deepEqual((p1.beta_codigos as Row[]).map((x) => x.codigo), ["8809937360834", "7701234567897"]);
    assert.equal((await h("barras_asignar", "cos", { id: "p1", codigo: "1" })).error, "Solo un admin edita códigos de barras");
    assert.ok(db.tables.get("log_acciones")!.some((l) => String(l.accion) === "CODIGO ASIGNAR"));
  });
});
