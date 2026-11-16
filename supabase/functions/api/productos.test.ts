import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import type { Row } from "./domain.ts";
import {
  BOD_CAB2, BOD_CAB3, BOD_CABINA, BOD_CASA, BOD_VENTA, comisionUnidad, grupoDeBodega, limpiarCambios,
  lineasOcLegacy, marcaDe, preciosDe, stockDe, stockTotal, tipoDe,
} from "./productos.ts";

const BODEGAS: Row[] = [
  { id: BOD_VENTA, codigo: "VENTA", nombre: "Venta", tipo: "venta" },
  { id: BOD_CABINA, codigo: "CABINA", nombre: "Cabina 1", tipo: "cabina" },
  { id: BOD_CAB2, codigo: "CAB2", nombre: "Cabina 2", tipo: "cabina" },
  { id: BOD_CAB3, codigo: "CAB3", nombre: "Cabina 3", tipo: "cabina" },
  { id: BOD_CASA, codigo: "CASA", nombre: "Casa", tipo: "casa" },
];

function ctx(db: MemoryDb, rol = "admin") {
  const token = "t-" + rol;
  db.tables.set("sesiones", [{ token, uid: rol, rol, exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: rol, nombre: rol, short: rol, rol, bloqueado: false }]);
  return { db, now: new Date("2026-11-16T17:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}), token };
}

describe("productos MineCore: reglas puras", () => {
  it("comisión = 30 % × (subtotal sin IVA − compra para comisiones), nunca negativa", () => {
    assert.equal(comisionUnidad(95.65, 82.61), 3.91);
    assert.equal(comisionUnidad(10, 20), 0);
  });
  it("preciosDe usa compra_comision y cae a precio_compra si está vacía; beta_* gana sobre catalogo", () => {
    const cat = { sku: "SUNSU-ML-001", subtotal: 95.65, total_con_iva: 110, precio_compra: "82.61", compra_comision: null };
    const p0 = preciosDe(cat, {}, 70);
    assert.equal(p0.compraComision, 82.61);
    assert.equal(p0.comision, 3.91);
    assert.equal(p0.compraReal, 70);
    assert.equal(p0.utilidad, 25.65);
    const p1 = preciosDe({ ...cat, compra_comision: 50 }, {}, 0);
    assert.equal(p1.comision, 13.7);
    const p2 = preciosDe(cat, { beta_pvp: 115, beta_compra_comision: 60, beta_compra_real: 55 }, 70);
    assert.equal(p2.subtotal, 100);
    assert.equal(p2.comision, 12);
    assert.equal(p2.utilidad, 45);
    assert.deepEqual(p2.editadoBeta.sort(), ["compraComision", "compraReal", "pvp"]);
  });
  it("tipoDe: faciales, paquetes y gift = servicio; productos e insumos = inventariable", () => {
    assert.equal(tipoDe({ tipo: "FACIAL" }, {}).tipo, "servicio");
    assert.equal(tipoDe({ tipo: "PAQUETE" }, {}).subtipo, "Paquete");
    assert.equal(tipoDe({ tipo: "GIFT CARD" }, {}).tipo, "servicio");
    assert.equal(tipoDe({ tipo: "PRODUCTO" }, {}).tipo, "inventariable");
    assert.equal(tipoDe(undefined, { legacy_tabla: "cabina_inventario" }).subtipo, "Insumo cabina");
  });
  it("marca: de la ficha o deducida del nombre", () => {
    assert.deepEqual(marcaDe({ marca: "Dr.esthe" }, undefined, "x"), { marca: "Dr.esthe", deducida: false });
    assert.deepEqual(marcaDe({}, {}, "Skin Laser Toner - Dr.esthe"), { marca: "Dr.esthe", deducida: true });
  });
  it("bodegas: VENTA→Consignación, CABINA/CAB2/CAB3→Bodega Cabina con sububicación, CASA→Oficina", () => {
    assert.deepEqual(grupoDeBodega(BODEGAS[0]), { grupo: "CONSIGNACION", sub: "" });
    assert.deepEqual(grupoDeBodega(BODEGAS[1]), { grupo: "CABINA", sub: "" });
    assert.deepEqual(grupoDeBodega(BODEGAS[1], "CABINA_1"), { grupo: "CABINA", sub: "CABINA_1" });
    assert.deepEqual(grupoDeBodega(BODEGAS[2]), { grupo: "CABINA", sub: "CABINA_2" });
    assert.deepEqual(grupoDeBodega(BODEGAS[3]), { grupo: "CABINA", sub: "CABINA_3" });
    assert.deepEqual(grupoDeBodega(BODEGAS[4]), { grupo: "OFICINA", sub: "" });
  });
  it("stockDe conserva cada cantidad: lo que no tiene cabina queda como «Sin cabina asignada»", () => {
    const erpStock = [
      { producto_id: "p", bodega_id: BOD_CABINA, sububicacion: "", cantidad: 5 },
      { producto_id: "p", bodega_id: BOD_CABINA, sububicacion: "CABINA_1", cantidad: 2 },
      { producto_id: "p", bodega_id: BOD_CAB2, sububicacion: "", cantidad: 3 },
      { producto_id: "p", bodega_id: BOD_VENTA, sububicacion: "", cantidad: 4 },
      { producto_id: "p", bodega_id: BOD_CASA, sububicacion: "", cantidad: 1 },
    ];
    const g = stockDe({ erpStock, bodegas: BODEGAS });
    const cab = g.find((x) => x.grupo === "CABINA")!;
    assert.equal(cab.cantidad, 10);
    assert.deepEqual(cab.subs.map((x) => x.cantidad), [2, 3, 0, 5]);
    assert.equal(stockTotal(g), 15);
    // Con fila de cabina_inventario: cerrados en Cabina, "en bodega" en Oficina; venta del sistema viejo en Consignación.
    const g2 = stockDe({ ventaLegacy: 7, cab: { envases_cerrados: 128, bodega_cerrados: 4, abierto_restante: 1 }, erpStock: [], bodegas: BODEGAS });
    assert.deepEqual(g2.map((x) => [x.grupo, x.cantidad]), [["CONSIGNACION", 7], ["CABINA", 128], ["OFICINA", 4]]);
  });
  it("lineasOcLegacy encuentra el SKU en el json libre de la OC vieja", () => {
    const j = JSON.stringify({ prov: { nombre: "X" }, fact: [{ sku: "SUNSU-VK-005", vendido: 1, compra: 23.8 }, { sku: "SUNSU-VK-010", vendido: 2, compra: 9 }] });
    assert.deepEqual(lineasOcLegacy(j, "VK-010"), [{ qty: 2, precio: 9 }]);
    assert.deepEqual(lineasOcLegacy("no json", "VK-010"), []);
  });
  it("limpiarCambios solo deja campos de la ficha", () => {
    assert.ok(limpiarCambios({ precio_compra: 3 }).error);
    assert.ok(limpiarCambios({ nombre: "" }).error);
    assert.deepEqual(limpiarCambios({ beta_pvp: "20,5", activo: "false", marca: " A " }).row, { beta_pvp: 20.5, activo: false, marca: "A" });
  });
});

describe("productos MineCore: adaptador api", () => {
  function semilla(): MemoryDb {
    const db = new MemoryDb();
    db.tables.set("erp_bodegas", BODEGAS);
    db.tables.set("erp_productos", [
      { id: "p1", sku: "ML-009", nombre: "PEEL-N-GLOW Cooling Pearl Mask - Dr.esthe", clase: "producto", uso: "ambos", precio_venta: 20, costo_promedio: 12.17, activo: true, legacy_tabla: "catalogo" },
      { id: "p2", sku: "02", nombre: "Facial Reparación", clase: "servicio", uso: "cabina", activo: true, legacy_tabla: "catalogo" },
      { id: "p3", sku: "AC-001", nombre: "Lámpara", clase: "producto", uso: "cabina", activo: true },
    ]);
    db.tables.set("catalogo", [
      { sheet_row: 2, sku: "SUNSU-ML-009", producto_servicio: "PEEL-N-GLOW Cooling Pearl Mask - Dr.esthe", tipo: "PRODUCTO", subtotal: 17.39, total_con_iva: 20, precio_compra: "12.17", compra_comision: null, activo: true },
      { sheet_row: 3, sku: "SUNSU-02", producto_servicio: "Facial Reparación", tipo: "FACIAL", subtotal: 60, total_con_iva: 69, precio_compra: "0", activo: true },
    ]);
    db.tables.set("cabina_inventario", [{ codigo: "INV-107", sku_catalogo: "SUNSU-ML-009", producto: "PEEL-N-GLOW", envases_cerrados: 128, bodega_cerrados: 0, abierto_restante: 0, unidad: "unidad" }]);
    db.tables.set("erp_stock", [{ id: "s1", producto_id: "p1", bodega_id: BOD_CABINA, sububicacion: "", cantidad: 95 }]);
    for (const t of ["inventario_base", "inventario_entradas", "tickets", "inventario_corte", "erp_movimientos", "erp_oc", "erp_oc_lineas", "ordenes_compra", "cotizaciones", "erp_proveedores", "erp_aperturas", "app_modulos", "cosmetologas", "app_archivos"]) if (!db.tables.has(t)) db.tables.set(t, []);
    return db;
  }

  it("lista única: une catalogo + cabina + erp, sin activos AC-, servicios sin stock", async () => {
    const db = semilla();
    const c = ctx(db);
    const r = await handle("mcprod_list", { token: c.token }, c) as Row;
    assert.equal(r.ok, true);
    const items = r.items as Row[];
    assert.deepEqual(items.map((i) => i.sku), ["02", "ML-009"]);
    const ml = items.find((i) => i.sku === "ML-009")!;
    assert.equal(ml.tipo, "inventariable");
    assert.equal(ml.marca, "Dr.esthe");
    assert.equal((ml.porGrupo as Row).CABINA, 128);
    assert.equal(ml.comision, 1.57);
    const fac = items.find((i) => i.sku === "02")!;
    assert.equal(fac.tipo, "servicio");
    assert.equal(fac.stock, null);
  });

  it("ficha: costos ocultos para quien no tiene ver_costos; edición solo admin, a beta_* y con registro", async () => {
    const db = semilla();
    const cr = ctx(db, "recepcion");
    const g = await handle("mcprod_get", { token: cr.token, sku: "ML-009" }, cr) as Row;
    assert.equal(g.ok, true);
    assert.equal((g.precios as Row).compraReal, undefined);
    assert.equal((g.precios as Row).compraComision, undefined);
    assert.equal((g.precios as Row).pvp, 20);
    const no = await handle("mcprod_save", { token: cr.token, id: "p1", cambios: { beta_pvp: 25 } }, cr) as Row;
    assert.ok(no.error);

    const ca = ctx(db, "admin");
    const sinMotivo = await handle("mcprod_save", { token: ca.token, id: "p1", cambios: { beta_pvp: 23 } }, ca) as Row;
    assert.match(String(sinMotivo.error), /motivo/i);
    const soloMarca = await handle("mcprod_save", { token: ca.token, id: "p1", cambios: { marca: "Dr.esthe" } }, ca) as Row;
    assert.equal(soloMarca.ok, true, "editar datos no pide motivo");
    const ok = await handle("mcprod_save", { token: ca.token, id: "p1", cambios: { beta_pvp: 23 }, motivo: "Nuevo precio proveedor" }, ca) as Row;
    assert.equal(ok.ok, true);
    const p1 = db.tables.get("erp_productos")!.find((x) => x.id === "p1")!;
    assert.equal(p1.beta_pvp, 23);
    assert.equal(p1.beta_precio_motivo, "Nuevo precio proveedor");
    assert.match(String(p1.beta_editado_por), /^admin/);
    assert.equal(db.tables.get("catalogo")![0].total_con_iva, 20, "catalogo no se toca");
    const g2 = await handle("mcprod_get", { token: ca.token, id: "p1" }, ca) as Row;
    assert.equal((g2.precios as Row).pvp, 23);
    assert.deepEqual((g2.precios as Row).editadoBeta, ["pvp"]);
    const cab = (g2.stock as Row[]).find((x) => x.grupo === "CABINA") as Row;
    assert.equal(cab.cantidad, 128);
    const bad = await handle("mcprod_save", { token: ca.token, id: "p1", cambios: { precio_compra: 1 } }, ca) as Row;
    assert.ok(bad.error);
  });
});
