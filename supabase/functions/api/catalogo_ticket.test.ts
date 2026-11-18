// TK95: en el buscador del ticket entra todo producto facturado en Migo, aunque
// no esté en el catálogo de la hoja o no tenga PVP.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { armarCatalogoTicket, preciosMigoDeTablas } from "./catalogo_ticket.ts";

describe("TK95 · catálogo del ticket incluye productos Migo", () => {
  it("INV-040 (d'Alba) no está en la hoja, tiene PVP 0, y sí sale con el precio de la factura", () => {
    const migo = preciosMigoDeTablas([], [{
      factura: "001-001-000002945", fecha: "2026-11-14",
      lineas: [{ sku: "SUNSU-INV-000040", codigo: "SUNSU-INV-000040", producto: "d alba Piedmont Italian White Truffle First Spray Serum", cantidad: 1, precio_unit: 26.09, subtotal: 26.09, iva: 3.91, total: 30 }],
    }]);
    const p = migo.get("INV-040");
    assert.ok(p, "debería indexar SUNSU-INV-000040 como INV-040");
    assert.equal(p!.pvp, 30);

    const items = armarCatalogoTicket([], [{
      sku: "INV-040", skuVisible: "SUNSU-INV-000040", nombre: "d'alba Piedmont Italian White Truffle First Spray Serum",
      tipo: "producto", pvp: 0, activo: true, barras: [], id: "p1", stock: 1,
    }], migo);
    const hit = items.find((x) => x.sku === "INV-040");
    assert.ok(hit, JSON.stringify(items.map((x) => x.sku)));
    assert.equal(hit!.pvp, 30);
    assert.equal(hit!.enMigo, true);
    assert.equal(hit!.activo, true);
    assert.match(String(hit!.nombre), /alba/i);
  });

  it("un producto inactivo que sí se facturó en Migo queda agregable", () => {
    const migo = preciosMigoDeTablas([{
      codigo: "SUNSU-INV-000063", producto: "D alba Waterfull Essence Sunscreen", cantidad: 1, precio_unit: 34.25, total: 39.39, fecha: "2025-12-18",
    }], []);
    const items = armarCatalogoTicket([], [{
      sku: "INV-063", nombre: "d'alba Sunscreen", tipo: "producto", pvp: 0, activo: false, barras: [], id: "p2",
    }], migo);
    const hit = items.find((x) => x.sku === "INV-063");
    assert.ok(hit);
    assert.equal(hit!.activo, true);
    assert.equal(hit!.enMigo, true);
    assert.equal(hit!.pvp, 39.39);
  });

  it("un producto de Migo que ni siquiera está en ERP también entra", () => {
    const migo = preciosMigoDeTablas([], [{
      fecha: "2026-11-14", lineas: [{ codigo: "SUNSU-XX-999", producto: "Producto solo en Migo", cantidad: 2, total: 20 }],
    }]);
    const items = armarCatalogoTicket([], [], migo);
    const hit = items.find((x) => x.sku === "XX-999" || String(x.sku).includes("999"));
    assert.ok(hit, JSON.stringify(items));
    assert.equal(hit!.pvp, 10);
    assert.equal(hit!.enMigo, true);
    assert.equal(hit!.activo, true);
  });

  it("si el catálogo de la hoja ya tiene PVP, no lo pisa el de Migo", () => {
    const migo = preciosMigoDeTablas([], [{
      fecha: "2026-11-01", lineas: [{ codigo: "SUNSU-AS-002", total: 99, cantidad: 1, producto: "Jabón" }],
    }]);
    const items = armarCatalogoTicket([{
      sku: "SUNSU-AS-002", producto_servicio: "Jabón Limpiador", tipo: "PRODUCTO", total_con_iva: 18.99, subtotal: 16.51, activo: true,
    }], [], migo);
    const hit = items.find((x) => String(x.sku).includes("AS-002"));
    assert.ok(hit);
    assert.equal(hit!.pvp, 18.99);
    assert.equal(hit!.enMigo, true);
  });

  it("un producto ERP sin PVP y que no está en Migo no aparece (no hay precio)", () => {
    const items = armarCatalogoTicket([], [{
      sku: "INV-001", nombre: "Insumo interno", tipo: "producto", pvp: 0, activo: true, barras: [], id: "x",
    }], new Map());
    assert.equal(items.length, 0);
  });
});
