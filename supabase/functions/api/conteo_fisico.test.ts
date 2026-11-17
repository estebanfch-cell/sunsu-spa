import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import "./conteo_fisico_api.ts";
import type { Row } from "./domain.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
    { token: "otra", uid: "u-bea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "u-ana", nombre: "Ana", short: "Ana", rol: "cosmetologa", bloqueado: false },
    { id: "u-bea", nombre: "Bea", short: "Bea", rol: "cosmetologa", bloqueado: false },
  ]);
  db.tables.set("erp_productos", [
    { id: "p1", sku: "ML-001", nombre: "Ampoule", clase: "producto", uso: "venta", activo: true },
    { id: "p2", sku: "ML-002", nombre: "Cream", clase: "producto", uso: "venta", activo: true },
    { id: "p3", sku: "HT-001", nombre: "Oil", clase: "producto", uso: "venta", activo: true },
  ]);
  db.tables.set("erp_bodegas", [{ id: "11111111-1111-4111-8111-111111111111", codigo: "VENTA", nombre: "Venta", tipo: "venta" }]);
  db.tables.set("erp_stock", [
    { producto_id: "p1", bodega_id: "11111111-1111-4111-8111-111111111111", cantidad: 5 },
    { producto_id: "p2", bodega_id: "11111111-1111-4111-8111-111111111111", cantidad: 2 },
  ]);
  for (const t of ["catalogo", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "beta_conteos", "beta_conteo_lineas", "beta_notificaciones"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-17T17:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}

describe("conteo físico beta", () => {
  it("flujo completo: crear → aviso → empezar (foto del sistema) → contar → enviar → devolver → aprobar sin mover stock", async () => {
    const { db, h } = semilla();
    assert.match(String((await h("cf_crear", "cos", { bodega: "CONSIGNACION", asignado_a: "u-ana" })).error), /admin/);
    const cr = await h("cf_crear", "adm", { bodega: "CONSIGNACION", asignado_a: "u-ana", nota: "Inventario inicial" });
    assert.equal(cr.numero, "CF-001");
    assert.match(String((await h("cf_crear", "adm", { bodega: "CONSIGNACION", asignado_a: "u-bea" })).error), /Ya hay un conteo abierto/);
    const nt = await h("notif_mias", "cos");
    assert.equal(nt.sinLeer, 1); assert.match(String((nt.items as Row[])[0].link), /#\/m\/conteos\//);
    assert.equal(((await h("cf_list", "otra")).items as Row[]).length, 0);
    assert.equal(((await h("cf_list", "cos", { mios: true })).items as Row[]).length, 1);
    assert.match(String((await h("cf_iniciar", "otra", { id: cr.id })).error), /no está asignado/);
    assert.equal((await h("cf_iniciar", "cos", { id: cr.id })).lineas, 2);
    let g = await h("cf_get", "cos", { id: cr.id });
    const L = g.lineas as Row[];
    assert.deepEqual(L.map((l) => [l.sku, l.sistema]), [["ML-001", 5], ["ML-002", 2]]);
    assert.match(String((await h("cf_enviar", "cos", { id: cr.id })).error), /Faltan 2/);
    await h("cf_guardar", "cos", { id: cr.id, lineas: [{ id: L[0].id, contado: 4 }, { id: L[1].id, estado: "no_encontrado" }], agregar: { sku: "HT-001", contado: 3 } });
    g = await h("cf_get", "cos", { id: cr.id });
    assert.deepEqual((g.lineas as Row[]).map((l) => [l.sku, l.estado, l.diferencia]), [["ML-001", "contado", -1], ["ML-002", "no_encontrado", -2], ["HT-001", "contado", 3]]);
    assert.equal((g.conteo as Row).conDiferencia, 3);
    assert.equal((await h("cf_enviar", "cos", { id: cr.id })).ok, true);
    assert.equal((await h("notif_mias", "adm")).sinLeer, 1);
    assert.match(String((await h("cf_guardar", "cos", { id: cr.id, lineas: [] })).error), /no está abierto/);
    assert.match(String((await h("cf_revisar", "adm", { id: cr.id, que: "devolver" })).error), /Escribe/);
    await h("cf_revisar", "adm", { id: cr.id, que: "devolver", nota: "Vuelve a contar ML-002" });
    assert.equal(((await h("cf_get", "cos", { id: cr.id })).conteo as Row).estado, "en_conteo");
    await h("cf_enviar", "cos", { id: cr.id });
    const stockAntes = JSON.stringify(db.tables.get("erp_stock"));
    const ap = await h("cf_revisar", "adm", { id: cr.id, que: "aprobar" });
    assert.equal(ap.stockAplicado, false);
    assert.equal(JSON.stringify(db.tables.get("erp_stock")), stockAntes);
    assert.equal(db.tables.get("erp_movimientos")!.length, 0);
    assert.equal(((await h("cf_get", "adm", { id: cr.id })).conteo as Row).estado, "aprobado");
    await h("notif_leer", "cos", { todas: true });
    assert.equal((await h("notif_mias", "cos")).sinLeer, 0);
  });
});
