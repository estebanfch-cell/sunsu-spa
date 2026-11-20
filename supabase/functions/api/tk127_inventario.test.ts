// TK127: código según bodega, un producto, descuento consignación→propio,
// aliases y liquidación que no paga stock de Sunsu.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { n, type Row } from "./domain.ts";
import {
  FLAG_PENDIENTE_CONTEO,
  NOTA_LIQUIDACION_TK127,
  PROP_CONSIG,
  PROP_SUNSU,
  claveCuadre,
  esBodegaInterna,
  esBodegaVenta,
  mapaAliases,
  qtyPagableProveedor,
  repartirSalidaVenta,
  resolverSku,
  skuPorBodega,
  skuVentaDe,
} from "./inventario_modelo.ts";
import { ventasDesdeConsignacion, applyPlan, BODEGA_VENTA, BODEGA_CONSIGNACION, BODEGA_CABINA, BODEGA_CASA, runErp } from "./erp.ts";
import { borradorConsig } from "./ventas.ts";
import { difPorSku } from "./cuadre_sku.ts";

const VENTA = BODEGA_VENTA;
const CONSIG = BODEGA_CONSIGNACION;
const CABINA = BODEGA_CABINA;
const CASA = BODEGA_CASA;
const PID = "cce101e9-97c4-4c43-8fbb-b63a7c95a3b1"; // ML-008 / INV-110

const prod110 = {
  id: PID, sku: "ML-008", nombre: "AC Solution Swab - Dr.esthe",
  codigo_interno: "INV-110", sku_proveedor: "ML-008", uso: "ambos", activo: true, clase: "producto",
};

describe("TK127 código por bodega", () => {
  it("Cabina y Oficina muestran INV-110; Venta/consignación muestran ML-008", () => {
    assert.equal(skuPorBodega(prod110, "CABINA", "cabina"), "INV-110");
    assert.equal(skuPorBodega(prod110, "CAB2", "cabina"), "INV-110");
    assert.equal(skuPorBodega(prod110, "OFICINA", "casa"), "INV-110");
    assert.equal(skuPorBodega(prod110, "CASA", "casa"), "INV-110");
    assert.equal(skuPorBodega(prod110, "CONSIGNACION", "consignacion"), "ML-008");
    assert.equal(skuPorBodega(prod110, "VENTA", "venta"), "ML-008");
    assert.equal(skuVentaDe(prod110), "ML-008");
    assert.equal(esBodegaInterna("CABINA"), true);
    assert.equal(esBodegaVenta("CONSIGNACION"), true);
  });

  it("una transferencia no cambia el producto: solo el código que aplica", () => {
    assert.equal(skuPorBodega(prod110, "CABINA"), "INV-110");
    assert.equal(skuPorBodega(prod110, "CONSIGNACION"), "ML-008");
  });
});

describe("TK127 aliases", () => {
  it("INV-110, SUNSU-ML-008 y ML-008 resuelven al mismo producto", () => {
    const al = mapaAliases([
      { alias: "INV-110", sku: "ML-008" },
      { alias: "SUNSU-ML-008", sku: "ML-008" },
    ]);
    assert.equal(resolverSku("INV-110", al), "ML-008");
    assert.equal(resolverSku("SUNSU-ML-008", al), "ML-008");
    assert.equal(resolverSku("ML-008", al, [prod110]), "ML-008");
    const por = new Map<string, Row>([["ML-008", prod110]]);
    assert.equal(claveCuadre("INV-110", al, por), "ML-008");
    assert.equal(claveCuadre("SUNSU-ML-008", al, por), "ML-008");
    assert.equal(claveCuadre("ML-008", al, por), "ML-008");
  });
});

describe("TK127 orden de descuento", () => {
  it("INV-110: primero consignación del proveedor, después stock de Sunsu en Venta", () => {
    const lots = [
      { bodega_id: VENTA, lote: "SUNSU", sububicacion: "", cantidad: 4, propietario: PROP_SUNSU },
      { bodega_id: CONSIG, lote: "CONSIG", sububicacion: "", cantidad: 3, propietario: PROP_CONSIG },
      { bodega_id: VENTA, lote: "CONSIG", sububicacion: "", cantidad: 2, propietario: PROP_CONSIG },
    ];
    const r = repartirSalidaVenta(6, lots, CONSIG, VENTA);
    assert.equal(r.resto, 0);
    assert.equal(r.tomas.length, 3);
    assert.equal(r.tomas[0].bodega_id, CONSIG);
    assert.equal(r.tomas[0].propietario, PROP_CONSIG);
    assert.equal(r.tomas[0].toma, 3);
    assert.equal(r.tomas[1].bodega_id, VENTA);
    assert.equal(r.tomas[1].propietario, PROP_CONSIG);
    assert.equal(r.tomas[1].toma, 2);
    assert.equal(r.tomas[2].bodega_id, VENTA);
    assert.equal(r.tomas[2].propietario, PROP_SUNSU);
    assert.equal(r.tomas[2].toma, 1);
  });

  it("no deja un lote en negativo: el resto queda si no hay más stock", () => {
    const r = repartirSalidaVenta(5, [
      { bodega_id: CONSIG, lote: "", sububicacion: "", cantidad: 2, propietario: PROP_CONSIG },
    ], CONSIG, VENTA);
    assert.equal(r.tomas[0].toma, 2);
    assert.equal(r.resto, 3);
  });
});

function seedVenta(stock: Row[]) {
  const db = new MemoryDb({
    erp_productos: [prod110],
    erp_bodegas: [
      { id: VENTA, codigo: "VENTA", nombre: "Venta", tipo: "venta", activo: true },
      { id: CONSIG, codigo: "CONSIGNACION", nombre: "Consignación", tipo: "consignacion", activo: true },
      { id: CABINA, codigo: "CABINA", nombre: "Cabina 1", tipo: "cabina", activo: true },
      { id: CASA, codigo: "CASA", nombre: "Oficina", tipo: "casa", activo: true },
    ],
    erp_stock: stock,
    erp_movimientos: [],
    tickets: [],
    erp_proveedores: [{ id: "prov-ml", nombre: "Ao Medical", activo: true }],
    erp_consignacion_consumo: [],
  });
  return db;
}

describe("TK127 ticket: descuento con dueño (ejemplo INV-110)", () => {
  it("vende 5: 3 del proveedor en consignación y 2 propias; liquidación solo paga las 3", async () => {
    const db = seedVenta([
      { id: "s1", producto_id: PID, bodega_id: CONSIG, sububicacion: "", lote: "CONSIG", cantidad: 3, propietario: PROP_CONSIG },
      { id: "s2", producto_id: PID, bodega_id: VENTA, sububicacion: "", lote: "SUNSU", cantidad: 4, propietario: PROP_SUNSU },
    ]);
    const steps = await ventasDesdeConsignacion(db, [{
      op: "move", producto_id: PID, bodega_id: VENTA, delta: -5, tipo: "venta",
      ticket_ref: "TK-110", legacy_ref: "vta-beta:TK-110:ML-008",
    }], await db.all("erp_bodegas"));
    const ventas = steps.filter((x) => x.op === "move" && x.tipo === "venta");
    assert.equal(ventas.length, 2);
    const cons = ventas.find((x) => x.bodega_id === CONSIG)!;
    const own = ventas.find((x) => x.bodega_id === VENTA)!;
    assert.equal(cons.delta, -3);
    assert.equal((cons as Row).propietario, PROP_CONSIG);
    assert.equal(own.delta, -2);
    assert.equal((own as Row).propietario, PROP_SUNSU);
    assert.equal(cons.lote, "CONSIG");
    assert.equal(own.lote, "SUNSU");

    const out = await runErp("stock_delta", {
      moves: [{ sku: "ML-008", bodega_id: VENTA, delta: -5, tipo: "venta", ticket_ref: "TK-110", legacy_ref: "vta-beta:TK-110:ML-008" }],
    }, db, "Emi", new Date("2026-11-19T18:30:00Z"));
    assert.equal(out.ok, true, String(out.error));
    const movs = await db.all("erp_movimientos");
    const vtas = movs.filter((m) => m.tipo === "venta" && m.ticket_ref === "TK-110");
    assert.equal(vtas.reduce((a, m) => a + n(m.delta), 0), -5);
    const bods = db.tables.get("erp_bodegas") || [];
    const paga = vtas.reduce((a, m) => a + qtyPagableProveedor(m, bods.find((b) => String(b.id) === String(m.bodega_id))), 0);
    assert.equal(paga, 3);

    const hayCons = (await db.all("erp_stock")).find((r) => r.bodega_id === CONSIG && r.producto_id === PID);
    const hayOwn = (await db.all("erp_stock")).find((r) => r.bodega_id === VENTA && r.producto_id === PID);
    assert.equal(n(hayCons?.cantidad), 0);
    assert.equal(n(hayOwn?.cantidad), 2);
    // Dueño se conserva: lo que quedó en Venta sigue siendo de Sunsu.
    assert.equal(hayOwn?.propietario, PROP_SUNSU);
  });
});


describe("TK127 liquidación: nunca se paga de más", () => {
  it("unidades de Sunsu vendidas con ML-008 no entran al pago; el consumo a cabina se informa pero no se paga", async () => {
    const db = seedVenta([
      { id: "s1", producto_id: PID, bodega_id: CONSIG, sububicacion: "", lote: "CONSIG", cantidad: 1, propietario: PROP_CONSIG },
      { id: "s2", producto_id: PID, bodega_id: VENTA, sububicacion: "", lote: "SUNSU", cantidad: 4, propietario: PROP_SUNSU },
    ]);
    await runErp("stock_delta", {
      moves: [{ sku: "ML-008", bodega_id: VENTA, delta: -5, tipo: "venta", ticket_ref: "TK-110B", legacy_ref: "vta-beta:TK-110B:ML-008" }],
    }, db, "Emi", new Date("2026-11-05T15:00:00Z"));
    await db.write("Emi", "erp_consignacion_consumo", "insert", {}, {
      id: "c1", familia: "ML", sku: "ML-008", cantidad: 2, costo_unit: 1,
      quincena_ini: "2026-11-01", quincena_fin: "2026-11-15", fecha: "2026-11-05T15:00:00Z",
    });
    const per = await borradorConsig(db, new Date("2026-11-05T15:00:00Z"), { proveedor_id: "prov-ml", familia: "ML", anio: 2026, mes: 11, quincena: 1 });
    assert.equal(per.ok, true, String(per.error));
    const it = ((per.items || []) as Row[]).find((x) => x.sku === "ML-008")!;
    assert.ok(it, "debe listar ML-008");
    assert.equal(it.vendido, 1);
    assert.equal(it.consumido, 2);
    // Se informa el consumo, pero el subtotal (lo que se paga) es solo lo vendido del proveedor.
    assert.equal(it.subtotal, 0 * 0 + 1 * n(it.compra));
    assert.equal(it.paga, 1);
    assert.match(String(per.nota), /solo las unidades vendidas desde stock de consignación del proveedor/);
    assert.equal(NOTA_LIQUIDACION_TK127.includes("stock propio"), true);
  });

  it("qtyPagableProveedor ignora movimientos de Sunsu", () => {
    assert.equal(qtyPagableProveedor({ tipo: "venta", delta: -4, propietario: PROP_SUNSU }), 0);
    assert.equal(qtyPagableProveedor({ tipo: "venta", delta: -3, propietario: PROP_CONSIG }), 3);
  });
});

describe("TK127 CUADRE / Migo", () => {
  it("un ticket con ML-008 cuadra con una factura SUNSU-ML-008 o INV-110", () => {
    const al = mapaAliases([{ alias: "INV-110", sku: "ML-008" }, { alias: "SUNSU-ML-008", sku: "ML-008" }]);
    const por = new Map<string, Row>([["ML-008", prod110]]);
    const kFac = claveCuadre("SUNSU-ML-008", al, por);
    const kTk = claveCuadre("ML-008", al, por);
    const kInv = claveCuadre("INV-110", al, por);
    assert.equal(kFac, kTk);
    assert.equal(kInv, kTk);
    const diffs = difPorSku(
      [{ sku: "SUNSU-ML-008", codigo: "SUNSU-ML-008", nombre: "AC Solution Swab", cantidad: 1, total: 10 }],
      [{ lineas: [{ sku: "INV-110", nombre: "AC Solution Swab", cantidad: 1, totalCon: 10, total: 10 }] } as Row],
      undefined,
      al,
    );
    assert.equal(diffs.length, 0);
  });
});

describe("TK127 SQL aditivo y bandera de conteo", () => {
  it("el SQL hace backup primero, no borra productos ni toca CF-001, y no habla de HT/VK al proveedor", () => {
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0066_tk127_modelo_inventario.sql", import.meta.url), "utf8");
    assert.match(sql, /_bak_20261119_tk127_erp_productos/);
    assert.match(sql, /_bak_20261119_tk127_erp_stock/);
    assert.match(sql, /codigo_interno/);
    assert.match(sql, /propietario/);
    assert.match(sql, /INV-110/);
    assert.match(sql, /ML-008/);
    assert.match(sql, /INV-132/); // JN-009, no choca con caja de gift INV-123
    assert.equal(/drop table/i.test(sql), false);
    assert.equal(/delete from public\.erp_productos/i.test(sql), false);
    assert.equal(/delete from public\.beta_conteo/i.test(sql), false);
    assert.equal(/5cf84247-f69b-4505-bfb0-5812b780e0e7/.test(sql), false);
    assert.equal(/Hebetronic/.test(sql), false);
    assert.match(sql, /Pendiente de conteo: stock en 2 lotes/);
    assert.equal(FLAG_PENDIENTE_CONTEO.includes("lotes"), true);
  });

  it("el cache de esta entrega es TK133, distinto al de TK132", () => {
    const sw = readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
    const beta = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    assert.match(sw, /sunsu-2026-11-20-TK168/);
    assert.match(beta, /20261120tk168/);
    assert.doesNotMatch(sw, /sunsu-beta-2026-11-19-TK132/);
  });
});
