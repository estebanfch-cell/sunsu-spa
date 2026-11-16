import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import "./productos_paridad_api.ts";
import type { Row } from "./domain.ts";
import { BOD_CAB2, BOD_CAB3, BOD_CABINA, BOD_CASA, BOD_VENTA, ean13Control, ean13Valido, limpiarCodigos, limpiarEscalas, limpiarProveedores, precioEscala, siguienteInterno } from "./productos.ts";

const BODEGAS: Row[] = [
  { id: BOD_VENTA, codigo: "VENTA", nombre: "Venta", tipo: "venta" }, { id: BOD_CABINA, codigo: "CABINA", nombre: "Cabina 1", tipo: "cabina" },
  { id: BOD_CAB2, codigo: "CAB2", nombre: "Cabina 2", tipo: "cabina" }, { id: BOD_CAB3, codigo: "CAB3", nombre: "Cabina 3", tipo: "cabina" },
  { id: BOD_CASA, codigo: "CASA", nombre: "Casa", tipo: "casa" },
];
function ctx(db: MemoryDb, rol = "admin") {
  const token = "t-" + rol;
  db.tables.set("sesiones", [{ token, uid: rol, rol, exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: rol, nombre: rol, short: rol, rol, bloqueado: false }]);
  return { db, now: new Date("2026-11-16T17:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}), token };
}
function semilla() {
  const db = new MemoryDb();
  db.tables.set("erp_bodegas", BODEGAS);
  db.tables.set("erp_productos", [
    { id: "p1", sku: "ML-009", nombre: "Mask", clase: "producto", uso: "venta", activo: true, linea: "Glow", beta_pvp: 20, codigo_barras: "8809937360834.0" },
    { id: "p2", sku: "01", nombre: "FACIAL SOS", clase: "servicio", uso: "cabina", activo: true },
    { id: "p3", sku: "INV-037", nombre: "Limpiador", clase: "producto", uso: "cabina", activo: true },
  ]);
  db.tables.set("catalogo", [{ sku: "SUNSU-01", producto_servicio: "FACIAL SOS", tipo: "FACIAL", activo: true }]);
  db.tables.set("cabina_protocolos", [{ sku: "SUNSU-01", facial: "Facial S.O.S", version: 12, vigente: "SI", mano_de_obra: 23.2 }]);
  db.tables.set("cabina_protocolo_pasos", [
    { sku: "SUNSU-01", version: 1, paso: 2, descripcion: "Tónico", producto_cod: "INV-037", cantidad: 3, unidad: "ml", minutos: 2 },
    { sku: "SUNSU-01", version: 1, paso: 1, descripcion: "Limpieza", producto_cod: "INV-037", cantidad: 2, unidad: "ml", minutos: 2 },
  ]);
  db.tables.set("erp_proveedores", [{ id: "pv1", nombre: "Hebetronic", activo: true }]);
  for (const t of ["erp_stock", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "app_archivos", "tickets"]) db.tables.set(t, []);
  return db;
}

describe("productos MineCore: paridad (0041)", () => {
  it("EAN-13: control, validación y código interno 20…", () => {
    assert.equal(ean13Control("880993736083"), 4);
    assert.equal(ean13Valido("8809937360834"), true);
    assert.equal(ean13Valido("8809937360835"), false);
    const a = siguienteInterno(["8809937360834"]);
    assert.match(a, /^2000000000015$/);
    assert.equal(ean13Valido(a), true);
    assert.equal(siguienteInterno([a]).slice(0, 12), "200000000002");
    assert.match(String(limpiarCodigos([{ codigo: "1234567890123", tipo: "ean13" }]).error), /no cuadra/);
    const ok = limpiarCodigos([{ codigo: "ABC-1" }, { codigo: a, tipo: "interno", principal: true }]);
    assert.deepEqual(ok.codigos.map((x) => x.principal), [false, true]);
  });
  it("escalas: precio fijo o markup sobre costo; proveedores: uno predeterminado", () => {
    const { escalas } = limpiarEscalas([{ nombre: "Mayorista", desde: 6, markup: 50 }, { nombre: "Spa", desde: 1, precio: 18 }]);
    assert.deepEqual(escalas.map((e) => e.nombre), ["Spa", "Mayorista"]);
    assert.equal(precioEscala(escalas[1], 10), 17.25);
    assert.match(String(limpiarEscalas([{ nombre: "X" }]).error), /precio o markup/);
    const pv = limpiarProveedores([{ proveedor_id: "pv1", codigo: "H-1", precio: 9 }, { proveedor: "Amazon" }], [{ id: "pv1", nombre: "Hebetronic" }]);
    assert.deepEqual(pv.proveedores.map((x) => [x.proveedor, x.predeterminado]), [["Hebetronic", true], ["Amazon", false]]);
    assert.match(String(limpiarProveedores([{ proveedor_id: "zz" }], []).error), /no encontrado/);
  });
  it("archivar, eliminar (suave, con confirmación) y restaurar; solo admin", async () => {
    const db = semilla(); const c = ctx(db);
    let r = await handle("mcprod_estado", { token: c.token, ids: ["p1"], que: "archivar" }, c) as Row;
    assert.equal(r.cambiados, 1);
    let L = await handle("mcprod_list", { token: c.token }, c) as Row;
    assert.equal((L.items as Row[]).find((x) => x.id === "p1")!.activo, false);
    r = await handle("mcprod_estado", { token: c.token, ids: ["p1"], que: "eliminar" }, c) as Row;
    assert.match(String(r.error), /ELIMINAR/);
    r = await handle("mcprod_estado", { token: c.token, ids: ["p1"], que: "eliminar", confirmar: "ELIMINAR" }, c) as Row;
    L = await handle("mcprod_list", { token: c.token }, c) as Row;
    assert.equal((L.items as Row[]).some((x) => x.id === "p1"), false);
    assert.equal(L.eliminados, 1);
    const E = await handle("mcprod_list", { token: c.token, eliminados: true }, c) as Row;
    assert.deepEqual((E.items as Row[]).map((x) => x.id), ["p1"]);
    assert.ok(db.tables.get("erp_productos")!.find((x) => x.id === "p1"), "la fila sigue");
    await handle("mcprod_estado", { token: c.token, ids: ["p1"], que: "restaurar" }, c);
    await handle("mcprod_estado", { token: c.token, ids: ["p1"], que: "desarchivar" }, c);
    L = await handle("mcprod_list", { token: c.token }, c) as Row;
    assert.equal((L.items as Row[]).find((x) => x.id === "p1")!.activo, true);
    const cr = ctx(db, "recepcion");
    assert.match(String((await handle("mcprod_estado", { token: cr.token, ids: ["p1"], que: "archivar" }, cr) as Row).error), /admin/);
  });
  it("duplicar da el siguiente SKU de la familia y copia la ficha", async () => {
    const db = semilla(); const c = ctx(db);
    const r = await handle("mcprod_duplicar", { token: c.token, id: "p1" }, c) as Row;
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.sku, "ML-010");
    const copia = db.tables.get("erp_productos")!.find((x) => x.sku === "ML-010")!;
    assert.equal(copia.nombre, "Mask (copia)");
    assert.equal(copia.linea, "Glow");
    assert.equal(copia.beta_pvp, 20);
    assert.ok(!copia.codigo_barras, "el código de barras no se copia");
  });
  it("códigos: únicos entre productos; el principal queda en codigo_barras; ficha trae el de la hoja", async () => {
    const db = semilla(); const c = ctx(db);
    let g = await handle("mcprod_get", { token: c.token, id: "p1" }, c) as Row;
    assert.equal((g.codigos as Row[])[0].codigo, "8809937360834");
    const dup = await handle("mcprod_codigos_save", { token: c.token, id: "p3", codigos: [{ codigo: "8809937360834" }] }, c) as Row;
    assert.match(String(dup.error), /ya lo tiene ML-009/);
    const gen = await handle("mcprod_codigo_interno", { token: c.token, id: "p3" }, c) as Row;
    const ok = await handle("mcprod_codigos_save", { token: c.token, id: "p3", codigos: [{ codigo: gen.codigo, tipo: "interno" }] }, c) as Row;
    assert.equal(ok.ok, true, String(ok.error));
    assert.equal(db.tables.get("erp_productos")!.find((x) => x.id === "p3")!.codigo_barras, gen.codigo);
  });
  it("escalas piden motivo; proveedores actualizan el SKU proveedor; protocolo y «se usa en»", async () => {
    const db = semilla(); const c = ctx(db);
    assert.match(String((await handle("mcprod_escalas_save", { token: c.token, id: "p1", escalas: [{ nombre: "Spa", precio: 18 }] }, c) as Row).error), /motivo/);
    assert.equal((await handle("mcprod_escalas_save", { token: c.token, id: "p1", escalas: [{ nombre: "Spa", precio: 18 }], motivo: "lista spa" }, c) as Row).ok, true);
    assert.equal((await handle("mcprod_proveedores_save", { token: c.token, id: "p1", proveedores: [{ proveedor_id: "pv1", codigo: "H-77", precio: 9 }] }, c) as Row).ok, true);
    const p1 = db.tables.get("erp_productos")!.find((x) => x.id === "p1")!;
    assert.equal(p1.sku_proveedor, "H-77");
    const g = await handle("mcprod_get", { token: c.token, id: "p1" }, c) as Row;
    assert.equal((g.escalas as Row[])[0].pvp, 18);
    assert.equal((g.provProducto as Row[])[0].proveedor, "Hebetronic");
    const s = await handle("mcprod_get", { token: c.token, id: "p2" }, c) as Row;
    assert.deepEqual(((s.protocolo as Row).pasos as Row[]).map((x) => x.paso), [1, 2]);
    const u = await handle("mcprod_get", { token: c.token, id: "p3" }, c) as Row;
    assert.deepEqual((u.seUsaEn as Row[]).map((x) => [x.sku, x.nombre, x.pasos, x.cantidad]), [["SUNSU-01", "Facial S.O.S", 2, 5]]);
  });
  it("fotos y archivos: varios, principal, quitar sin borrar; tipos permitidos", async () => {
    const db = semilla(); const c = ctx(db);
    const foto = "data:image/jpeg;base64," + "A".repeat(100);
    const a = await handle("mcprod_archivo_subir", { token: c.token, id: "p1", data: foto, nombre: "f1.jpg" }, c) as Row;
    const b = await handle("mcprod_archivo_subir", { token: c.token, id: "p1", data: "data:application/pdf;base64,JVBER", nombre: "ficha.pdf" }, c) as Row;
    const x = await handle("mcprod_archivo_subir", { token: c.token, id: "p1", data: "data:application/x-msdownload;base64,AA", nombre: "a.exe" }, c) as Row;
    assert.match(String(x.error), /no permitido/);
    let p1 = db.tables.get("erp_productos")!.find((r) => r.id === "p1")!;
    assert.equal(p1.foto_url, "archivo:" + a.archivo_id);
    const leido = await handle("mcprod_archivo", { token: c.token, id: "p1", archivo_id: b.archivo_id }, c) as Row;
    assert.match(String(leido.data), /^data:application\/pdf;base64,/);
    await handle("mcprod_archivo_quitar", { token: c.token, id: "p1", archivo_id: a.archivo_id }, c);
    p1 = db.tables.get("erp_productos")!.find((r) => r.id === "p1")!;
    assert.equal(p1.foto_url, null);
    assert.equal(db.tables.get("app_archivos")!.length, 2, "el archivo no se borra");
    const g = await handle("mcprod_get", { token: c.token, id: "p1" }, c) as Row;
    assert.deepEqual((g.archivos as Row[]).map((r) => r.nombre), ["ficha.pdf"]);
  });
});
