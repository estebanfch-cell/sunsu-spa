import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import "./productos_paridad_api.ts";
import type { Row } from "./domain.ts";
import { BOD_CABINA, BOD_VENTA } from "./productos.ts";

function ctx(db: MemoryDb, rol: string) {
  const token = "t-" + rol;
  const sesiones = db.tables.get("sesiones") || [];
  sesiones.push({ token, uid: rol, rol, exp: "2099-01-01T00:00:00.000Z" });
  db.tables.set("sesiones", sesiones);
  const users = db.tables.get("usuarios") || [];
  if (!users.some((u) => u.id === rol)) users.push({ id: rol, nombre: rol, short: rol, rol, bloqueado: false });
  db.tables.set("usuarios", users);
  return { db, now: new Date("2026-11-16T17:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}), token };
}

function semilla(): MemoryDb {
  const db = new MemoryDb();
  db.tables.set("erp_bodegas", [
    { id: BOD_VENTA, codigo: "VENTA", nombre: "Venta", tipo: "venta" },
    { id: BOD_CABINA, codigo: "CABINA", nombre: "Cabina 1", tipo: "cabina" },
  ]);
  db.tables.set("erp_productos", [
    { id: "p1", sku: "ML-009", nombre: "PEEL-N-GLOW Cooling Pearl Mask - Dr.esthe", clase: "producto", uso: "ambos", precio_venta: 20, costo_promedio: 12.17, activo: true, legacy_tabla: "catalogo",
      beta_archivos: [{ id: "a1", nombre: "ficha.pdf", mime: "application/pdf", tipo: "archivo", at: "2026-11-01", por: "emi", borrado: false }] },
  ]);
  db.tables.set("catalogo", [
    { sheet_row: 2, sku: "SUNSU-ML-009", producto_servicio: "PEEL-N-GLOW", tipo: "PRODUCTO", subtotal: 17.39, total_con_iva: 20, precio_compra: "12.17", compra_comision: null, activo: true },
  ]);
  db.tables.set("cabina_inventario", [{ codigo: "INV-107", sku_catalogo: "SUNSU-ML-009", producto: "PEEL-N-GLOW", envases_cerrados: 128, bodega_cerrados: 0, abierto_restante: 0, unidad: "unidad" }]);
  db.tables.set("erp_stock", [{ id: "s1", producto_id: "p1", bodega_id: BOD_CABINA, cantidad: 95 }]);
  db.tables.set("tickets", [
    { id: 1, sheet_row: 10, timestamp: "2026-11-10T15:00:00Z", atendido_por: "Andrea", nombre: "Ana", apellido: "P", estimado: 20, ml_009: 1, so_num: "SO-1" },
    { id: 2, sheet_row: 11, timestamp: "2026-11-12T15:00:00Z", atendido_por: "Daniela", nombre: "Bea", apellido: "Q", estimado: 20, ml_009: 2, so_num: "SO-2" },
  ]);
  db.tables.set("erp_proveedores", [{ id: "pr1", nombre: "Lab Norte", activo: true }]);
  db.tables.set("erp_oc", [{ id: "oc1", numero: "OC-9", fecha: "2026-11-01", proveedor_id: "pr1", estado: "recibida" }]);
  db.tables.set("erp_oc_lineas", [{ oc_id: "oc1", producto_id: "p1", cantidad: 10, precio: 12.17 }]);
  db.tables.set("cabina_protocolos", [{ sku: "02", facial: "Facial Reparación", version: 1, vigente: "SI" }]);
  db.tables.set("cabina_protocolo_pasos", [{ sku: "02", version: 1, paso: 1, producto_cod: "ML-009", cantidad: 2, unidad: "ml", descripcion: "aplicar" }]);
  db.tables.set("app_archivos", [{ id: "a1", nombre: "ficha.pdf", mime: "application/pdf", data_b64: "JVBERg==" }]);
  for (const t of ["inventario_base", "inventario_entradas", "inventario_corte", "erp_movimientos", "ordenes_compra", "cotizaciones", "erp_aperturas", "app_modulos", "cosmetologas"]) {
    if (!db.tables.has(t)) db.tables.set(t, []);
  }
  return db;
}

describe("TK69 productos del personal", () => {
  it("el front busca por nombre o SKU, esconde filtros en un menú y bloquea descargas", () => {
    const js = readFileSync(new URL("../../../mc-productos.js", import.meta.url), "utf8");
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    assert.match(js, /Buscar por nombre o SKU/);
    assert.match(js, /mcp-filt-btn/);
    assert.match(js, /Filtros/);
    assert.match(js, /El personal no puede descargar archivos/);
    assert.match(js, /pvpSinIva/);
    assert.match(js, /Va en protocolo/);
    assert.match(js, /MC\.admin \? "Buscar producto, SKU, marca o código"/);
    assert.match(beta, /mc-productos\.js\?v=20261119tk149/);  });
  it("lista y ficha: todo el catálogo, solo PVP con/sin IVA, último consumo y protocolo, sin descargar", async () => {
    const db = semilla();
    const staff = ctx(db, "cosmetologa");
    const admin = ctx(db, "admin");

    const listaStaff = await handle("mcprod_list", { token: staff.token }, staff) as Row;
    assert.equal(listaStaff.ok, true);
    assert.equal(listaStaff.puedeDescargar, false);
    assert.equal(listaStaff.verCostos, false);
    const items = listaStaff.items as Row[];
    assert.ok(items.length >= 1);
    const ml = items.find((i) => i.sku === "ML-009")!;
    assert.equal(ml.pvp, 20);
    assert.equal(ml.pvpSinIva, 17.39);
    assert.equal("comision" in ml, false);
    assert.equal("compraReal" in ml, false);
    assert.equal("margenPct" in ml, false);

    const listaAdm = await handle("mcprod_list", { token: admin.token }, admin) as Row;
    assert.equal(listaAdm.puedeDescargar, true);
    assert.equal(listaAdm.verCostos, false);
    const mlA = (listaAdm.items as Row[]).find((i) => i.sku === "ML-009")!;
    assert.equal("comision" in mlA, false);
    assert.equal("compraReal" in mlA, false);
    const mega = ctx(db, "super_admin");
    const listaMega = await handle("mcprod_list", { token: mega.token }, mega) as Row;
    assert.equal(listaMega.verCostos, true);
    const mlM = (listaMega.items as Row[]).find((i) => i.sku === "ML-009")!;
    assert.equal(mlM.comision, 1.57);

    const ficha = await handle("mcprod_get", { token: staff.token, id: "p1" }, staff) as Row;
    assert.equal(ficha.ok, true);
    assert.equal(ficha.puedeDescargar, false);
    assert.equal((ficha.precios as Row).pvp, 20);
    assert.equal((ficha.precios as Row).subtotal, 17.39);
    assert.equal((ficha.precios as Row).comision, undefined);
    assert.equal((ficha.precios as Row).compraReal, undefined);
    const hist = ficha.historial as Row[];
    assert.equal(hist.length, 1);
    assert.equal(hist[0].doc, "SO-2");
    assert.equal(hist[0].cantidad, 2);
    assert.equal("cobrado" in hist[0], false);
    assert.equal("precio" in hist[0], false);
    assert.equal("pvpLista" in hist[0], false);
    assert.deepEqual(ficha.proveedores, []);
    assert.deepEqual(ficha.kardex, []);
    assert.deepEqual(ficha.preciosHist, []);
    const usos = ficha.seUsaEn as Row[];
    assert.ok(usos.some((x) => String(x.nombre).includes("Reparación") || String(x.sku) === "02"));

    const fichaAdm = await handle("mcprod_get", { token: admin.token, id: "p1" }, admin) as Row;
    const histAdm = fichaAdm.historial as Row[];
    assert.ok(histAdm.length > 1);
    assert.ok(histAdm.some((x) => x.tipo === "OC beta"));
    assert.equal(fichaAdm.puedeDescargar, true);

    const down = await handle("mcprod_archivo", { token: staff.token, id: "p1", archivo_id: "a1" }, staff) as Row;
    assert.match(String(down.error), /no puede descargar/i);
    const okDown = await handle("mcprod_archivo", { token: admin.token, id: "p1", archivo_id: "a1" }, admin) as Row;
    assert.equal(okDown.ok, true);
  });
});

describe("TK77 ficha de producto en secciones", () => {
  it("Identificación siempre visible y el resto en secciones plegables que recuerdan si están abiertas", () => {
    const js = readFileSync(new URL("../../../mc-productos.js", import.meta.url), "utf8");
    assert.match(js, /function identificacion\(\)/);
    for (const t of ["Inventario y bodegas", "Presentación / envase", "Códigos de barras", "Precios y costos", "Observaciones / descripción"]) assert.ok(js.includes('"' + t + '"'), t);
    assert.match(js, /if \(MC\.admin\) \{\s*var cv = calcVivo\(\)/, "Precios y costos solo para admin");
    assert.match(js, /localStorage\.setItem\("mcp-secs"/);
    assert.match(js, /container-type:inline-size;container-name:mcpsec/);
    assert.doesNotMatch(js, /\[\["resumen", "Resumen"\]/);
  });
});
