// TK39: el detalle del ticket muestra precios SIN IVA y el bloque Subtotal / IVA 15 % / Total (como Migo).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import { calcularTicket } from "./ticket_beta.ts";

const src = fs.readFileSync(new URL("../../../mc-tickets.js", import.meta.url), "utf8");
describe("ticket sin IVA (TK39, TK-SO-1861)", () => {
  it("líneas guardadas con IVA → en pantalla sin IVA; subtotal 93.90, IVA 14.09, total 107.99", () => {
    const iva = 1.15, r2 = (v: number) => Math.round(v * 100) / 100;
    // Lo que escribe Emilia (sin IVA, como Migo) se guarda × 1,15.
    const netos = [24.34, 56.52, 13.04];
    const c = calcularTicket(netos.map((x, i) => ({ tipo: "producto", sku: "X" + i, cantidad: 1, precio_unit: x * iva })), {});
    assert.deepEqual(c.lineas.map((l) => r2(l.precio_unit / iva)), netos);
    assert.equal(c.subtotal, 93.9); assert.equal(c.iva, 14.09); assert.equal(c.total, 107.99);
    // Ida y vuelta sin perder centavos.
    for (let x = 0.01; x < 300; x += 0.37) assert.equal(r2(r2(r2(x) * iva) / iva), r2(x));
  });
  it("mc-tickets.js: precio sin IVA, bloque como Migo", () => {
    assert.match(src, /P\. sin IVA/);
    // TK68: totales solo Subtotal, IVA 15 %, Total, Pagado, Saldo.
    assert.doesNotMatch(src, /Subtotal gravado 15%|<span>Subtotal 0%|Subtotal \(sin IVA\)/);
    for (const t of ["<span>Subtotal</span>", "<span>IVA 15%</span>", ">Total</span>", "<span>Pagado</span>", "<span>Saldo</span>"]) assert.ok(src.includes(t), t);
    // Líneas en 1–2 filas con container query (sin tabla con scroll horizontal).
    assert.match(src, /container-type:inline-size/);
    assert.match(src, /@container mctkl \(min-width:680px\)/);
    assert.doesNotMatch(src, /mctk-lt"><thead>/);
    assert.match(src, /l\.precio_unit = \(Number\(ev\.target\.value\) \|\| 0\) \* IVA/);
    assert.doesNotThrow(() => new Function(src));
  });
});
