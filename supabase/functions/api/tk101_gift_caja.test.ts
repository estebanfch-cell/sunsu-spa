import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aliasMigo, CAJA_GIFT, expandirLineasGiftCaja, partirLineaGiftCaja, esGiftConCajaBundled } from "./alias_migo.ts";
import { lineasBorradorDeFactura } from "./borrador_lineas.ts";
import { difPorSku } from "./cuadre_sku.ts";
import { lineasDeTicket, normalizarLineaFactura } from "./migo_lineas.ts";
import { readFileSync } from "node:fs";

const IVA = 1.15;
const fe = () => readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
const tk = () => readFileSync(new URL("../../../mc-tickets.js", import.meta.url), "utf8");

describe("TK101 · alias y partida $68 = gift $65 + caja $3", () => {
  it("aliasMigo: solo $3 es INV-123; 65/68/75/148 siguen en 35", () => {
    assert.equal(aliasMigo("SUNSU-35", 3), "INV-123");
    assert.equal(aliasMigo("SUNSU-35", 65), "35");
    assert.equal(aliasMigo("SUNSU-35", 68), "35");
    assert.equal(aliasMigo("SUNSU-35", 75), "35");
    assert.equal(aliasMigo("SUNSU-35", 148), "35");
  });
  it("esGiftConCajaBundled solo en $68 (±0.05)", () => {
    assert.equal(esGiftConCajaBundled("SUNSU-35", 68), true);
    assert.equal(esGiftConCajaBundled("SUNSU-35", 68.04), true);
    assert.equal(esGiftConCajaBundled("SUNSU-35", 65), false);
    assert.equal(esGiftConCajaBundled("SUNSU-35", 75), false);
    assert.equal(esGiftConCajaBundled("SUNSU-35", 3), false);
  });
  it("partir $68 produce gift $65 + INV-123 $3 que suman el total", () => {
    const parts = partirLineaGiftCaja({
      codigo: "SUNSU-35", producto: "GIFT CARD", cantidad: 1,
      precio_unit: 59.13, subtotal: 59.13, iva: 8.87, total: 68,
    });
    assert.equal(parts.length, 2);
    assert.equal(parts[0].sku, "SUNSU-35");
    assert.equal(Number(parts[0].total), 65);
    assert.equal(parts[1].sku, "INV-123");
    assert.equal(parts[1].nombre, CAJA_GIFT.nombre);
    assert.equal(Number(parts[1].total), 3);
    assert.equal(Number(parts[0].total) + Number(parts[1].total), 68);
    const sub0 = Number(parts[0].subtotal), sub1 = Number(parts[1].subtotal);
    assert.equal(sub0, Math.round(65 / IVA * 100) / 100);
    assert.equal(sub1, Math.round(3 / IVA * 100) / 100);
  });
  it("cantidad 2 a $68 se parte en 2 gifts $130 + 2 cajas $6", () => {
    const parts = partirLineaGiftCaja({ codigo: "SUNSU-35", cantidad: 2, total: 136 });
    assert.equal(parts.length, 2);
    assert.equal(Number(parts[0].cantidad), 2);
    assert.equal(Number(parts[0].total), 130);
    assert.equal(Number(parts[1].cantidad), 2);
    assert.equal(Number(parts[1].total), 6);
  });
  it("65 / 75 / 148 / 3 no se parten", () => {
    assert.equal(expandirLineasGiftCaja([{ codigo: "SUNSU-35", total: 65 }]).length, 1);
    assert.equal(expandirLineasGiftCaja([{ codigo: "SUNSU-35", total: 75 }]).length, 1);
    assert.equal(expandirLineasGiftCaja([{ codigo: "SUNSU-35", total: 148 }]).length, 1);
    assert.equal(expandirLineasGiftCaja([{ codigo: "SUNSU-35", total: 3 }]).length, 1);
  });
});

describe("TK101 · borrador y cuadre", () => {
  const cat = [
    { sku: "SUNSU-35", producto_servicio: "GIFT CARD", tipo: "GIFT CARD", total_con_iva: 65, subtotal: 56.52, activo: true },
    { sku: "INV-123", producto_servicio: "Caja de gift card", tipo: "PRODUCTO", total_con_iva: 3, subtotal: 2.61, activo: true },
  ];
  it("borrador $68: línea gift $65 + producto INV-123 $3, total 68", () => {
    const r = lineasBorradorDeFactura([{ codigo: "SUNSU-35", producto: "GIFT CARD", cantidad: 1, precio_unit: 59.13, subtotal: 59.13, iva: 8.87, total: 68 }], cat);
    assert.equal(r.lineas.length, 2);
    assert.equal(r.lineas[0].seccion, "gift");
    assert.equal(r.lineas[0].total, 65);
    assert.equal(r.lineas[1].sku, "INV-123");
    assert.equal(r.lineas[1].seccion, "producto");
    assert.equal(r.lineas[1].total, 3);
    assert.equal(r.total, 68);
  });
  it("borrador $65 / $75 / $148: una sola gift de ese valor", () => {
    for (const v of [65, 75, 148]) {
      const r = lineasBorradorDeFactura([{ codigo: "SUNSU-35", producto: "GIFT CARD", cantidad: 1, total: v }], cat);
      assert.equal(r.lineas.length, 1, String(v));
      assert.equal(r.lineas[0].seccion, "gift", String(v));
      assert.equal(r.lineas[0].total, v, String(v));
    }
  });
  it("cuadre: factura $68 cuadra con gift $65 + caja $3 en el ticket", () => {
    const fac = [{ codigo: "SUNSU-35", producto: "GIFT CARD", cantidad: 1, total: 68 }];
    const tkOk = { id: 1, lineasDetalle: [
      { sku: "35", nombre: "GIFT CARD", cantidad: 1, precio_unit: 65, total: 65 },
      { sku: "INV-123", nombre: "Caja de gift card", cantidad: 1, precio_unit: 3, total: 3 },
    ] };
    assert.deepEqual(difPorSku(fac, [tkOk]), []);
  });
  it("cuadre: ticket con venta_gift y estimado $68 cuadra (se parte 65+3)", () => {
    const fac = [{ codigo: "SUNSU-35", producto: "GIFT CARD", cantidad: 1, total: 68 }];
    const tk = { id: 1, venta_gift: "SI, 26-164", estimado: 68, lineasDetalle: [] };
    assert.deepEqual(difPorSku(fac, [tk]), []);
  });
  it("cuadre: venta_gift + estimado $65 / $75 / $148 cuadra como gift de ese valor (sin partir)", () => {
    for (const v of [65, 75, 148]) {
      const fac = [{ codigo: "SUNSU-35", producto: "GIFT CARD", cantidad: 1, total: v }];
      const tk = { id: 1, venta_gift: "SI, 26-168", estimado: v, lineasDetalle: [] };
      assert.deepEqual(difPorSku(fac, [tk]), [], String(v));
    }
  });
  it("cuadre: ticket gift $68 (una línea) también cuadra tras partir ambos lados", () => {
    const fac = [{ codigo: "SUNSU-35", producto: "GIFT CARD", cantidad: 1, total: 68 }];
    const tk = { id: 1, lineasDetalle: [{ sku: "SUNSU-35", nombre: "GIFT CARD", cantidad: 1, total: 68 }] };
    assert.deepEqual(difPorSku(fac, [tk]), []);
  });
});

describe("TK101 · UI nuevo ticket y detalle", () => {
  it("Venta Gift Card: toggle caja, preset Facial Premium y valor con IVA", () => {
    const s = fe();
    assert(s.includes("Agregar caja (+$3)"));
    assert(s.includes("Facial Premium $65.00 con IVA"));
    assert(s.includes("Valor con IVA"));
    assert(s.includes("function toggleCajaGift"));
    assert(s.includes("function onGcValorIva"));
    assert(s.includes("CAJA_GIFT"));
    assert(!s.includes("Física + caja"));
    assert(!s.includes("$65.00 — Estándar"));
    assert(!/\(gcV\.valor\|\|65\)\+\(gcV\.tipo==='fisica'\?3:0\)/.test(s));
  });
  it("detalle de ticket: preset, valor con IVA y agregar caja", () => {
    const s = tk();
    assert(s.includes("Facial Premium $65.00 con IVA"));
    assert(s.includes("Agregar caja (+$3)"));
    assert(s.includes("mctk-gcval"));
    assert(s.includes('l.tipo === "gift"'));
  });
});

describe("TK101 · normalizar $68 ya partido no se vuelve a partir", () => {
  it("línea gift $65 normaliza a sku 35", () => {
    const nrm = normalizarLineaFactura({ codigo: "SUNSU-35", producto: "GIFT CARD", cantidad: 1, total: 65 });
    assert.equal(nrm && nrm.sku, "35");
    assert.equal(nrm && nrm.totalCon, 65);
  });
  it("lineasDeTicket con venta_gift $68 entrega 65 + INV-123", () => {
    const L = lineasDeTicket({ venta_gift: "SI, 26-161, PREMIUM", estimado: 68 });
    assert.equal(L.length, 2);
    assert.equal(L[0].sku, "35");
    assert.equal(L[0].totalCon, 65);
    assert.equal(L[1].sku, "INV-123");
    assert.equal(L[1].totalCon, 3);
  });
});
