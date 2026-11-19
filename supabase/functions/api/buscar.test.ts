import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const stub = { addEventListener() {}, head: { appendChild() {} }, createElement: () => ({ style: {} }), getElementById: () => null };
const ctx: Record<string, unknown> = { document: stub, Event: class {}, addEventListener() {} };
ctx.window = ctx;
vm.runInNewContext(readFileSync(new URL("../../../mc-buscar.js", import.meta.url), "utf8"), ctx);
// deno-lint-ignore no-explicit-any
const B = (ctx as any).MCBuscar;

describe("buscador común (mc-buscar.js)", () => {
  const L = [
    { sku: "ML-001", nombre: "Rejuvenating Ampoule", marca: "Dr.esthe" },
    { sku: "HT-004", nombre: "Heartleaf Toner 250ml", marca: "ANUA" },
    { sku: "ML-014", nombre: "Mummy Mask", marca: "Esthemax", barras: "8809937360834" },
    { sku: "INV-037", nombre: "Limpiador", marca: "" },
  ];
  const f = (p: Record<string, string>) => [[p.sku, p.barras], [p.nombre, p.marca]];
  it("ML, ml, ml0, «ML 00», ML- encuentran la familia ML primero", () => {
    assert.equal(B.filtrar(L, "ML 00", f)[0].sku, "ML-001");
    for (const q of ["ML", "ml", "ml0", "ML-", "ml-0"]) {
      const r = B.filtrar(L, q, f);
      assert.deepEqual(JSON.parse(JSON.stringify(r.slice(0, 2).map((x: Record<string, string>) => x.sku))), ["ML-001", "ML-014"], q);
    }
    assert.equal(B.filtrar(L, "ml014", f)[0].sku, "ML-014");
  });
  it("nombre, marca, código de barras, sin tildes ni mayúsculas", () => {
    assert.equal(B.filtrar(L, "mummy", f)[0].sku, "ML-014");
    assert.equal(B.filtrar(L, "anua", f)[0].sku, "HT-004");
    assert.equal(B.filtrar(L, "88099373", f)[0].sku, "ML-014");
    assert.equal(B.filtrar(L, "LÍMPIADOR", f)[0].sku, "INV-037");
    assert.equal(B.filtrar(L, "zzz", f).length, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(B.partes("ML-009 · Mask"))), [["ML-009"], ["ML-009 · Mask"]]);
  });

  it("palabras en cualquier orden, sin tildes, y el catálogo real de Emilia", () => {
    const cat = [
      { sku: "INV-131", nombre: "AC Serum - Dr.esthe", marca: "Dr.esthe", barras: "2000000000022" },
      { sku: "ML-008", nombre: "AC Solution Swab - Dr.esthe", marca: "" },
      { sku: "INV-078", nombre: "AC Soothing Cream - Dr.esthe", marca: "" },
      { sku: "AS-009", nombre: "AC CLEAR Clensing foam - eyenlip", marca: "" },
    ];
    const g = (p: Record<string, string>) => [[p.sku, p.barras], [p.nombre, p.marca]];
    assert.equal(B.filtrar(cat, "ac serum", g)[0].sku, "INV-131");
    assert.deepEqual(B.filtrar(cat, "ac so", g).map((x: { sku: string }) => x.sku), ["ML-008", "INV-078"]);
    assert.equal(B.filtrar(cat, "AC Solutions Fab", g)[0].sku, "ML-008");
    assert.equal(B.filtrar(cat, "serum ac", g)[0].sku, "INV-131");
    assert.equal(B.filtrar(cat, "2000000000022", g)[0].sku, "INV-131");
  });
});
