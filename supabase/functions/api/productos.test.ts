import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import type { Row } from "./domain.ts";
import { readFileSync } from "node:fs";
import {
  BOD_CAB2, BOD_CAB3, BOD_CABINA, BOD_CASA, BOD_VENTA, comisionUnidad, grupoDeBodega, limpiarCambios,
  lineasOcLegacy, marcaDe, preciosDe, stockDe, stockTotal, tipoDe, utilidadProducto, snapProducto, fechaIso, cargarOcJson, costoRealElegido,
  codigoNorm, skuVisible, familiaDeCodigo, familiasDe, prefijoNormal, siguienteCodigo,
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
    assert.equal(p0.utilidad, 21.74); // 95.65 − 70 − 3.91; no es 25.65 (sin restar comisión) ni 12.13 (costo = precio de comisión)
    assert.equal(p0.faltaCosto, false);
    const p1 = preciosDe({ ...cat, compra_comision: 50 }, {}, 0);
    assert.equal(p1.comision, 13.7);
    assert.equal(p1.faltaCosto, true);
    assert.equal(p1.utilidad, 0);
    const p2 = preciosDe(cat, { beta_pvp: 115, beta_compra_comision: 60, beta_compra_real: 55 }, 70);
    assert.equal(p2.subtotal, 100);
    assert.equal(p2.comision, 12);
    assert.equal(p2.utilidad, 33); // 100 − 55 − 12
    assert.equal(p2.faltaCosto, false);
    assert.deepEqual(p2.editadoBeta.sort(), ["compraComision", "compraReal", "pvp"]);
  });
  it("utilidad = venta − costo real − comisión; no usa el precio de comisiones como costo ni lo inventa", () => {
    const cat = { sku: "SUNSU-VK-017", subtotal: 20, precio_compra: 6, compra_comision: 6 };
    const p = preciosDe(cat, {}, 8);
    assert.equal(p.comision, 4.2);
    assert.equal(p.compraReal, 8);
    assert.equal(p.utilidad, 7.8);
    assert.notEqual(p.utilidad, 14); // 20 − 6, usando el precio de comisión como costo
    assert.notEqual(p.utilidad, 12); // 20 − 8, sin restar la comisión
    const u = utilidadProducto(20, 8, 4.2);
    assert.equal(u.utilidad, 7.8);
    assert.equal(u.faltaCosto, false);
    const sin = preciosDe(cat, {}, 0);
    assert.equal(sin.faltaCosto, true);
    assert.equal(sin.utilidad, 0);
    assert.equal(utilidadProducto(20, null, 4.2).faltaCosto, true);
    assert.equal(costoRealElegido({ beta: 0, oc: null, inventario: 0 }).costo, null);
    assert.equal(costoRealElegido({ oc: { precio: 17.51 }, inventario: 11.26 }).costo, 17.51);
    assert.equal(fechaIso("16/07/2026 12:23"), "2026-07-16");
    assert.equal(fechaIso("2026-11-08T13:39:00"), "2026-11-08");
    const m = new Map();
    cargarOcJson(m, { fact: [], items: [{ sku: "SUNSU-AS-001", compra: 17.51 }], directa: [] }, "08/11/2026");
    assert.equal(m.get("AS-001")!.precio, 17.51);
    assert.equal(m.get("AS-001")!.fecha, "2026-11-08");
    const snap = snapProducto({ tipo: "producto", ventaNeta: 20, qty: 1, costoRealUnit: 8, compraComisionUnit: 6 });
    assert.equal(snap.utilidad, 7.8);
    assert.equal(snap.comision, 4.2);
  });
  it("tipoDe: faciales, paquetes y gift = servicio; productos e insumos = inventariable", () => {
    assert.equal(tipoDe({ tipo: "FACIAL" }, {}).tipo, "servicio");
    assert.equal(tipoDe({ tipo: "PAQUETE" }, {}).subtipo, "Paquete");
    assert.equal(tipoDe({ tipo: "GIFT CARD" }, {}).tipo, "servicio");
    assert.equal(tipoDe({ tipo: "PRODUCTO" }, {}).tipo, "inventariable");
    assert.equal(tipoDe(undefined, { legacy_tabla: "cabina_inventario" }).subtipo, "Insumo cabina");
    // TK123: faciales/servicios sin tipo de catálogo no cuentan como producto físico (sin costo).
    assert.equal(tipoDe(undefined, { categoria: "Facial", nombre: "FACIAL GOLD-AGING" }).tipo, "servicio");
    assert.equal(tipoDe(undefined, { categoria: "Facial", nombre: "FACIAL GOLD-AGING" }).subtipo, "Facial");
    assert.equal(tipoDe({}, { nombre: "FACIAL PURUIFICACIÓN S.O.S" }).tipo, "servicio");
    assert.equal(tipoDe({ tipo: "" }, { categoria: "Paquete", nombre: "Pack glow" }).tipo, "servicio");
    assert.equal(tipoDe(undefined, { nombre: "Crema hidratante facial", categoria: "Cuidado de la piel" }).tipo, "inventariable");
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
    assert.deepEqual(g2.map((x) => [x.grupo, x.cantidad]), [["CONSIGNACION", 7], ["BCONSIG", 0], ["CABINA", 128], ["OFICINA", 4]]);
    // TK27: la bodega CONSIGNACION va aparte (BCONSIG) y lo vendido desde ahí vuelve a Venta (el cálculo viejo ya lo restó).
    const B3 = [...BODEGAS, { id: "66666666-6666-4666-8666-666666666666", codigo: "CONSIGNACION", nombre: "Consignación", tipo: "consignacion" }];
    const g3 = stockDe({ ventaLegacy: 5, consigVendido: 2, erpStock: [{ producto_id: "p", bodega_id: "66666666-6666-4666-8666-666666666666", cantidad: 8 }], bodegas: B3 });
    assert.equal(g3.find((x) => x.grupo === "CONSIGNACION")!.cantidad, 7);
    assert.equal(g3.find((x) => x.grupo === "BCONSIG")!.cantidad, 8);
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
    const c = ctx(db, "super_admin");
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

describe("productos MineCore: familias de SKU", () => {
  it("detecta familias por prefijo y la serie numérica, sin el SUNSU- del catálogo", () => {
    assert.equal(codigoNorm(" sunsu-ml-009 "), "ML-009");
    assert.deepEqual(familiaDeCodigo("SUNSU-45"), { prefijo: "#", num: 45, ancho: 2 });
    assert.equal(familiaDeCodigo("Lámpara"), null);
    const f = familiasDe([{ codigo: "ML-009", clase: "producto" }, { codigo: "SUNSU-ML-009" }, { codigo: "ML-014" }, { codigo: "01", clase: "servicio" }, { codigo: "59" }, { codigo: "INV-130" }]);
    const ml = f.find((x) => x.prefijo === "ML-")!;
    assert.equal(ml.total, 2);
    assert.equal(ml.siguiente, "ML-015");
    assert.equal(f.find((x) => x.prefijo === "#")!.siguiente, "60");
    assert.equal(f.find((x) => x.prefijo === "INV-")!.siguiente, "INV-131");
  });
  it("siguiente = mayor + 1 y salta uno ya usado; no rellena huecos", () => {
    assert.equal(siguienteCodigo("ML-", ["ML-001", "ML-009", "ML-010"]), "ML-011");
    assert.equal(siguienteCodigo("#", ["01", "08", "12"]), "13");
    assert.equal(siguienteCodigo("KR-", []), "KR-001");
  });
  it("prefijo nuevo: 2 a 5 letras con guion", () => {
    assert.equal(prefijoNormal("kr"), "KR-");
    assert.equal(prefijoNormal("K-"), "");
    assert.equal(prefijoNormal("AB1-"), "");
    assert.equal(prefijoNormal("#"), "#");
  });
  it("mcprod_nuevo asigna el SKU en el servidor, ignora el que mande la pantalla y no pisa existentes", async () => {
    const db = new MemoryDb();
    db.tables.set("erp_bodegas", BODEGAS);
    db.tables.set("erp_productos", [
      { id: "p1", sku: "ML-009", nombre: "Mask", clase: "producto", uso: "venta", activo: true, marca: "Dr.esthe", categoria: "Producto" },
      { id: "p2", sku: "02", nombre: "Facial", clase: "servicio", uso: "cabina", activo: true },
    ]);
    db.tables.set("catalogo", [{ sku: "SUNSU-ML-010", producto_servicio: "Otra", activo: true }]);
    db.tables.set("cabina_inventario", [{ codigo: "INV-107", sku_catalogo: "SUNSU-ML-011" }]);
    for (const t of ["erp_stock", "erp_movimientos", "app_modulos"]) db.tables.set(t, []);
    const c = ctx(db);
    const fam = await handle("mcprod_familias", { token: c.token }, c) as Row;
    assert.equal((fam.familias as Row[]).find((x) => x.prefijo === "ML-")!.siguiente, "ML-012");
    assert.deepEqual(fam.marcas, ["Dr.esthe"]);
    assert.deepEqual(fam.categorias, ["Producto"]);
    const r = await handle("mcprod_nuevo", { token: c.token, familia: "ML-", sku: "ML-009", nombre: "Nuevo", uso: "venta" }, c) as Row;
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.sku, "ML-012");
    const prods = db.tables.get("erp_productos")!;
    assert.equal(prods.find((x) => x.id === "p1")!.nombre, "Mask");
    assert.equal(prods.filter((x) => x.sku === "ML-012").length, 1);
    const s2 = await handle("mcprod_nuevo", { token: c.token, familia: "#", nombre: "Facial nuevo", tipo: "servicio" }, c) as Row;
    assert.equal(s2.sku, "03");
    const sinFam = await handle("mcprod_nuevo", { token: c.token, nombre: "X" }, c) as Row;
    assert.match(String(sinFam.error), /familia/);
    const noExiste = await handle("mcprod_nuevo", { token: c.token, familia: "KR-", nombre: "X" }, c) as Row;
    assert.match(String(noExiste.error), /no existe/);
    const nueva = await handle("mcprod_nuevo", { token: c.token, familia: "KR", familia_nueva: true, nombre: "Kerastase" }, c) as Row;
    assert.equal(nueva.sku, "KR-001");
    const dup = await handle("mcprod_nuevo", { token: c.token, familia: "ML-", familia_nueva: true, nombre: "X" }, c) as Row;
    assert.match(String(dup.error), /ya existe/);
    const cr = ctx(db, "recepcion");
    const no = await handle("mcprod_nuevo", { token: cr.token, familia: "ML-", nombre: "X" }, cr) as Row;
    assert.match(String(no.error), /admin/);
  });
  it("servicios muestran el SKU del catálogo (SUNSU-01) y guardan el número como alias", () => {
    assert.deepEqual(skuVisible("01", "servicio", { sku: "SUNSU-01" }), { sku: "SUNSU-01", alias: "01" });
    assert.deepEqual(skuVisible("60", "servicio", undefined), { sku: "60", alias: "" });
    assert.deepEqual(skuVisible("07", "servicio", { sku: "SUNSU-08" }), { sku: "07", alias: "" });
    assert.deepEqual(skuVisible("ML-001", "inventariable", { sku: "SUNSU-ML-001" }), { sku: "ML-001", alias: "" });
  });
});

describe("TK123 Productos: filtros, escáner y sin-costo físico", () => {
  it("la lista tiene búsqueda con escáner, Filtros/Columnas/+Nuevo en menús y el aviso de costo dentro de Filtros", () => {
    const js = readFileSync(new URL("../../../mc-productos.js", import.meta.url), "utf8");
    assert.match(js, /id="mcp-scan"/);
    assert.match(js, /_scanAbrir/);
    assert.match(js, /class="mcp-tools"/);
    assert.match(js, /id="mcp-filt-btn"/);
    assert.match(js, /id="mcp-cols-btn"/);
    assert.match(js, /id="mcp-nuevo"/);
    assert.match(js, /id="mcp-cost-pill"/);
    assert.match(js, /function anclarMenu/);
    assert.match(js, /function nSinCostoFisico/);
    assert.match(js, /x\.faltaCosto && x\.tipo === "inventariable"/);
    assert.match(js, /subtipo !== "Insumo cabina"/);
    // El banner grande ya no va en el cuerpo de la lista (solo el píldora dentro de Filtros).
    const render = js.slice(js.indexOf("async function renderLista"), js.indexOf("function wireLista"));
    assert.doesNotMatch(render, /falta-costo-banner/);
    assert.match(render, /mcp-cost-pill/);
    assert.match(js, /mcp-bulk:not\(\[hidden\]\)\{display:flex\}/);
    assert.match(js, /mcp-bulk\[hidden\]\{display:none!important\}/);
  });
  it("Simulación y Ver como no aparecen en la cabecera", () => {
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    assert.equal(html.includes('id="btn-prueba"'), false);
    assert.equal(html.includes('id="btn-ver-como"'), false);
  });
  it("el escáner compartido usa BarcodeDetector y cae a ZXing vendido, sin CDN", () => {
    const scan = readFileSync(new URL("../../../mc-scan.js", import.meta.url), "utf8");
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    const screens = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    assert.match(scan, /BarcodeDetector/);
    assert.match(scan, /BrowserMultiFormatReader/);
    assert.match(scan, /vendor-zxing\.js/);
    assert.doesNotMatch(scan, /cdn\.jsdelivr\.net/);
    assert.doesNotMatch(screens, /cdn\.jsdelivr\.net\/npm\/@zxing/);
    assert.match(html, /mc-scan\.js\?v=20261119tk154/);
    assert.match(html, /vendor-zxing\.js\?v=20261119tk154/);
    const start = screens.indexOf("function _scanAbrir");
    assert.match(screens.slice(start, start + 500), /MCScan\.abrir/);
  });
});

describe("TK131 Nuevo producto: listas y sin bloque de familias", () => {
  it("Categoría, Marca y Unidad son desplegables con + Crear nueva en línea; el bloque Familias de SKU no se muestra", () => {
    const js = readFileSync(new URL("../../../mc-productos.js", import.meta.url), "utf8");
    const start = js.indexOf("async function nuevoHtml");
    assert.ok(start >= 0);
    const block = js.slice(start, js.indexOf("function wireNuevo", start));
    assert.match(block, /selConCrear\("marca", "Marca"/);
    assert.match(block, /selConCrear\("categoria", "Categoría"/);
    assert.match(block, /selConCrear\("unidad", "Unidad"/);
    assert.match(js, /function selConCrear/);
    assert.match(js, /\+ Crear nueva/);
    assert.doesNotMatch(block, /Familias de SKU detectadas/);
    assert.doesNotMatch(block, /<input name="marca">/);
    assert.doesNotMatch(block, /<input name="categoria">/);
    const wire = js.slice(js.indexOf("function wireNuevo"), js.indexOf("window.MCProductos"));
    assert.match(wire, /wireCrear\("marca"\)/);
    assert.match(wire, /wireCrear\("categoria"\)/);
    assert.doesNotMatch(wire, /prompt\(/);
    assert.match(js, /minmax\(0,1fr\)/);
  });
});
