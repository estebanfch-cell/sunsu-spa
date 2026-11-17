import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import "./productos_paridad_api.ts";
import type { Row } from "./domain.ts";
import { costoPorContenido, ean13Valido, limpiarCambios } from "./productos.ts";

function semilla() {
  const db = new MemoryDb();
  const token = "t";
  db.tables.set("sesiones", [{ token, uid: "admin", rol: "admin", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "admin", short: "admin", rol: "admin", bloqueado: false }]);
  db.tables.set("erp_productos", [
    { id: "p1", sku: "ML-001", nombre: "Ampoule 30ml", clase: "producto", uso: "venta", activo: true, beta_pvp: 23, codigo_barras: "" },
    { id: "p2", sku: "ML-002", nombre: "Ampoule 50ml", clase: "producto", uso: "venta", activo: true, codigo_barras: "8809937360834" },
  ]);
  for (const t of ["catalogo", "erp_stock", "erp_movimientos", "erp_bodegas", "app_modulos", "cabina_inventario", "inventario_base", "app_archivos", "erp_oc", "erp_oc_lineas", "ordenes_compra", "cotizaciones", "erp_proveedores", "erp_aperturas"]) db.tables.set(t, []);
  db.tables.set("tickets", [
    { id: 1, sheet_row: 10, timestamp: "2026-11-10T15:00:00Z", atendido_por: "Andrea", nombre: "Ana", apellido: "P", estimado: 20, ml_001: 1, so_num: "SO-1" },
    { id: 2, sheet_row: 11, timestamp: "2026-11-11T15:00:00Z", atendido_por: "Daniela", nombre: "Bea", apellido: "Q", estimado: 80, ml_001: 1, ml_002: 1, so_num: "SO-2" },
  ]);
  const c = { db, now: new Date("2026-11-17T17:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}), token };
  return { db, c, token };
}

describe("productos feedback 17/11", () => {
  it("Generar código: EAN-13 interno válido, nunca pisa uno existente", async () => {
    const { db, c, token } = semilla();
    const r = await handle("mcprod_barras_generar", { token, id: "p1" }, c) as Row;
    assert.equal(r.ok, true); assert.equal(ean13Valido(String(r.codigo)), true); assert.match(String(r.codigo), /^20/);
    assert.equal(db.tables.get("erp_productos")!.find((x) => x.id === "p1")!.codigo_barras, r.codigo);
    const r2 = await handle("mcprod_barras_generar", { token, id: "p2" }, c) as Row;
    assert.match(String(r2.error), /ya tiene/);
    assert.equal(db.tables.get("erp_productos")!.find((x) => x.id === "p2")!.codigo_barras, "8809937360834");
  });
  it("presentación: campos editables, costo por g/ml, presentaciones enlazadas en las dos fichas", async () => {
    assert.equal(limpiarCambios({ beta_contenido: "30", beta_contenido_unidad: "ml", beta_envase: "frasco", beta_unidades_empaque: "1" }).error, undefined);
    assert.equal(costoPorContenido(12, 30), 0.4);
    assert.equal(costoPorContenido(12, 0), null);
    const { c, token } = semilla();
    const s = await handle("mcprod_presentaciones_save", { token, id: "p1", ids: ["p2", "p1", "p2"] }, c) as Row;
    assert.deepEqual(s.ids, ["p2"]);
    const f2 = await handle("mcprod_get", { token, id: "p2" }, c) as Row;
    assert.deepEqual((f2.presentaciones as Row[]).map((x) => [x.sku, x.propia]), [["ML-001", false]]);
  });
  it("historial: precio de lista y, si el ticket solo tiene el producto, lo cobrado y el descuento", async () => {
    const { c, token } = semilla();
    const f = await handle("mcprod_get", { token, id: "p1" }, c) as Row;
    const h = (f.historial as Row[]).filter((x) => x.tipo === "Ticket");
    const solo = h.find((x) => x.doc === "SO-1")!, mixto = h.find((x) => x.doc === "SO-2")!;
    assert.equal(solo.pvpLista, 23); assert.equal(solo.cobrado, 20); assert.equal(solo.descuento, 3); assert.equal(solo.quien, "Andrea");
    assert.equal(mixto.cobrado, null); assert.equal(mixto.pvpLista, 23);
  });
});

describe("Activo/Inactivo beta", () => {
  it("el admin lo cambia ida y vuelta; manda sobre el catálogo viejo; queda el motivo", async () => {
    const { db, c, token } = semilla();
    db.tables.set("catalogo", [{ sku: "SUNSU-ML-002", producto_servicio: "Ampoule 50ml", tipo: "PRODUCTO", activo: false }]);
    let l = await handle("mcprod_list", { token }, c) as Row;
    const est = (id: string) => ((l.items as Row[]).find((x) => x.id === id) as Row).activo;
    assert.equal(est("p2"), false); assert.equal(est("p1"), true);
    const r = await handle("mcprod_estado", { token, que: "activar", ids: ["p2"], motivo: "Volvió a llegar" }, c) as Row;
    assert.equal(r.cambiados, 1);
    l = await handle("mcprod_list", { token }, c) as Row; assert.equal(est("p2"), true);
    const p2 = db.tables.get("erp_productos")!.find((x) => x.id === "p2")!;
    assert.equal(p2.beta_activo, true); assert.equal(p2.beta_activo_motivo, "Volvió a llegar"); assert.equal(p2.activo, true);
    await handle("mcprod_estado", { token, que: "desactivar", ids: ["p1"] }, c);
    l = await handle("mcprod_list", { token }, c) as Row; assert.equal(est("p1"), false);
    await handle("mcprod_estado", { token, que: "activar", ids: ["p1"] }, c);
    l = await handle("mcprod_list", { token }, c) as Row; assert.equal(est("p1"), true);
  });
  it("Cabina con activo = NO sale inactivo si nadie lo fijó en la beta", async () => {
    const { db, c, token } = semilla();
    db.tables.set("cabina_inventario", [{ codigo: "ML-001", producto: "Ampoule 30ml", activo: "NO" }]);
    const l = await handle("mcprod_list", { token }, c) as Row;
    assert.equal(((l.items as Row[]).find((x) => x.id === "p1") as Row).activo, false);
  });
});
