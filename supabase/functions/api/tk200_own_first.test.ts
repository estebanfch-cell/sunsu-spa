// TK200: la venta consume primero stock propio, luego consignación del proveedor.
// Nunca deja un lote en negativo. La liquidación sigue pagando solo lo de consignación.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PROP_CONSIG, PROP_SUNSU, repartirSalidaVenta } from "./inventario_modelo.ts";

const VENTA = "11111111-1111-4111-8111-111111111111";
const CONSIG = "66666666-6666-4666-8666-666666666666";

const lots = [
  { bodega_id: VENTA, lote: "SUNSU", sububicacion: "", cantidad: 4, propietario: PROP_SUNSU },
  { bodega_id: CONSIG, lote: "CONSIG", sububicacion: "", cantidad: 3, propietario: PROP_CONSIG },
  { bodega_id: VENTA, lote: "CONSIG", sububicacion: "", cantidad: 2, propietario: PROP_CONSIG },
];

describe("TK200 own-first allocation", () => {
  it("consume propio, luego CONSIGNACION, luego lotes de proveedor en Venta", () => {
    const r = repartirSalidaVenta(8, lots, CONSIG, VENTA);
    assert.equal(r.resto, 0);
    assert.equal(r.tomas.length, 3);
    assert.equal(r.tomas[0].propietario, PROP_SUNSU);
    assert.equal(r.tomas[0].bodega_id, VENTA);
    assert.equal(r.tomas[0].toma, 4);
    assert.equal(r.tomas[1].propietario, PROP_CONSIG);
    assert.equal(r.tomas[1].bodega_id, CONSIG);
    assert.equal(r.tomas[1].toma, 3);
    assert.equal(r.tomas[2].propietario, PROP_CONSIG);
    assert.equal(r.tomas[2].bodega_id, VENTA);
    assert.equal(r.tomas[2].toma, 1);
  });

  it("si lo propio alcanza, no toca consignación", () => {
    const r = repartirSalidaVenta(3, lots, CONSIG, VENTA);
    assert.equal(r.resto, 0);
    assert.equal(r.tomas.length, 1);
    assert.equal(r.tomas[0].propietario, PROP_SUNSU);
    assert.equal(r.tomas[0].toma, 3);
    assert.equal(r.tomas[0].queda, 1);
  });

  it("si no hay propio, sale de consignación (bodega, luego Venta)", () => {
    const r = repartirSalidaVenta(4, [
      { bodega_id: CONSIG, lote: "CONSIG", sububicacion: "", cantidad: 3, propietario: PROP_CONSIG },
      { bodega_id: VENTA, lote: "CONSIG", sububicacion: "", cantidad: 2, propietario: PROP_CONSIG },
    ], CONSIG, VENTA);
    assert.equal(r.resto, 0);
    assert.equal(r.tomas[0].bodega_id, CONSIG);
    assert.equal(r.tomas[0].toma, 3);
    assert.equal(r.tomas[1].bodega_id, VENTA);
    assert.equal(r.tomas[1].toma, 1);
  });

  it("no deja un lote en negativo: el resto queda si no hay más stock", () => {
    const r = repartirSalidaVenta(5, [
      { bodega_id: VENTA, lote: "SUNSU", sububicacion: "", cantidad: 2, propietario: PROP_SUNSU },
    ], CONSIG, VENTA);
    assert.equal(r.tomas[0].toma, 2);
    assert.equal(r.tomas[0].queda, 0);
    assert.equal(r.resto, 3);
  });
});
