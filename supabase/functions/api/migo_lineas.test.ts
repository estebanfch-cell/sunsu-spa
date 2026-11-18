import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compararFacturaYTickets, compararLineas, equivalentesIva, gapPrecioGrande, lineasDeTicket, mismoProductoYCantidad, normalizarLineaFactura, skuMigoABeta } from "./migo_lineas.ts";

describe("ítems Migo vs ticket (línea a línea)", () => {
  it("skuMigoABeta quita el prefijo SUNSU- (AS y numéricos)", () => {
    assert.equal(skuMigoABeta("SUNSU-AS-004"), "AS-004");
    assert.equal(skuMigoABeta("SUNSU-31"), "31");
    assert.equal(skuMigoABeta("SUNSU-15"), "15");
    assert.equal(skuMigoABeta("VK-009"), "VK-009");
  });

  it("equivalentesIva: 13.04 sin × 1.15 = 15 con es un match", () => {
    assert.equal(equivalentesIva(13.043478, 15), true);
    assert.equal(equivalentesIva(15, 13.04), true);
    assert.equal(equivalentesIva(13.04, 13.04), true);
    assert.equal(equivalentesIva(13.04, 20), false);
  });

  it("mismas líneas (IVA normalizado) no avisa", () => {
    const fac = [normalizarLineaFactura({ codigo: "SUNSU-31", producto: "PDRN SERUM", cantidad: 1, precio_unit: 13.043478, subtotal: 13.04, iva: 1.96, total: 15 })!];
    const tk = [normalizarLineaFactura({ codigo: "SUNSU-31", producto: "PDRN SERUM", cantidad: 1, precio_unit: 15, total: 15 })!];
    assert.deepEqual(compararLineas(fac, tk), []);
  });

  it("avisa Revisa / Falta / Sobra en español", () => {
    const fac = [
      normalizarLineaFactura({ codigo: "SUNSU-31", producto: "PDRN SERUM", cantidad: 1, precio_unit: 13.04, total: 15 })!,
      normalizarLineaFactura({ codigo: "SUNSU-40", producto: "FACIAL RESET 3x1", cantidad: 1, precio_unit: 32.89, total: 37.82 })!,
    ];
    const tk = [
      normalizarLineaFactura({ codigo: "SUNSU-31", producto: "PDRN SERUM", cantidad: 1, precio_unit: 10, total: 11.5 })!,
      normalizarLineaFactura({ codigo: "SUNSU-15", producto: "Ampolla Especial", cantidad: 1, precio_unit: 13.04, total: 15 })!,
    ];
    const avisos = compararLineas(fac, tk);
    assert.ok(avisos.some((a) => a.tipo === "revisa" && /Revisa PDRN SERUM \(SUNSU-31\): ticket \$11\.50 × 1 vs factura \$15\.00 × 1/.test(a.texto)));
    assert.ok(avisos.some((a) => a.tipo === "falta" && /Falta en ticket: FACIAL RESET 3x1 \(SUNSU-40\)/.test(a.texto)));
    assert.ok(avisos.some((a) => a.tipo === "sobra" && /Sobra en ticket: Ampolla Especial \(SUNSU-15\)/.test(a.texto)));
  });

  it("facial de paquete (canje) no cuenta como sobra si la factura no lo cobró", () => {
    const fac = [normalizarLineaFactura({ codigo: "SUNSU-15", producto: "Ampolla Especial", cantidad: 1, precio_unit: 13.04, total: 15 })!];
    const tk = lineasDeTicket({
      facial_hecho: "SUNSU-40 Facial Reset 3x1",
      paquete: "SI, 2/3",
      extras: "SUNSU-15 Ampolla Especial · Ácido Ascórbico",
      orig: {},
    });
    const avisos = compararLineas(fac, tk);
    assert.equal(avisos.some((a) => a.tipo === "sobra"), false);
    assert.equal(avisos.length, 0);
  });

  it("2959: ampolla + Reset cobrado en factura vs ticket solo ampolla + canje", () => {
    const fac = [
      { codigo: "SUNSU-15", producto: "Ampolla Especial", cantidad: 1, precio_unit: 13.043478, subtotal: 13.04, iva: 1.96, total: 15 },
      { codigo: "SUNSU-40", producto: "FACIAL RESET 3x1", cantidad: 1, precio_unit: 82.61, descuento: 49.72, subtotal: 32.89, iva: 4.93, total: 37.82 },
    ];
    const avisos = compararFacturaYTickets(fac, [{
      facial_hecho: "SUNSU-40 Facial Reset 3x1",
      paquete: "SI, 2/3",
      extras: "SUNSU-15 Ampolla Especial · Ácido Ascórbico",
      orig: {},
    }]);
    assert.ok(avisos.some((a) => a.tipo === "revisa" && /SUNSU-40/.test(a.texto) && /paquete/.test(a.texto) && /37\.82/.test(a.texto)));
    assert.equal(avisos.some((a) => a.tipo === "sobra"), false);
  });

  it("lineasDeTicket lee productos del orig (AS-004, VK-009)", () => {
    const L = lineasDeTicket({ orig: { "AS-004": 1, "VK-009": 1, "Servicios Adicionales ": "SUNSU-31 PDRN Serum" }, facial_hecho: "SUNSU-02 Facial Reparación", paquete: "SI, 3/3" });
    const skus = L.map((l) => l.sku).sort();
    assert.ok(skus.includes("AS-004"));
    assert.ok(skus.includes("VK-009"));
    assert.ok(skus.includes("31"));
    assert.equal(L.find((l) => l.sku === "02")?.canje, true);
  });

  it("mismoProductoYCantidad y gapPrecioGrande para el ajuste automático", () => {
    const fac = [
      normalizarLineaFactura({ codigo: "SUNSU-AS-004", producto: "Tónico", cantidad: 1, precio_unit: 24.34, total: 27.99 })!,
    ];
    const tk = [
      normalizarLineaFactura({ codigo: "AS-004", producto: "Tónico", cantidad: 1, precio_unit: 24.30, total: 27.95 })!,
    ];
    assert.equal(mismoProductoYCantidad(fac, tk), true);
    assert.equal(gapPrecioGrande(fac, tk).grande, false);
    const lejos = [
      normalizarLineaFactura({ codigo: "AS-004", producto: "Tónico", cantidad: 1, precio_unit: 50, total: 57.5 })!,
    ];
    assert.equal(mismoProductoYCantidad(fac, lejos), true);
    assert.equal(gapPrecioGrande(fac, lejos).grande, true);
  });
});
