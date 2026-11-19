// TK36: protocolo automático (producto «Aplica a» ↔ pasos del protocolo) y costo automático.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./protocolos_api.ts";
import "./aperturas_api.ts";
import { costearPasos, costoPorCantidad } from "./protocolo_auto.ts";
import type { Row } from "./domain.ts";

function ctx(db: MemoryDb) {
  db.tables.set("sesiones", [{ token: "t", uid: "admin", rol: "super_admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "super_admin" }]);
  return { db, now: new Date("2026-11-18T15:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}), token: "t" };
}
function semilla() {
  const db = new MemoryDb();
  db.tables.set("erp_productos", [
    { id: "s1", sku: "01", nombre: "FACIAL SOS", clase: "servicio", uso: "cabina", activo: true },
    { id: "s2", sku: "02", nombre: "FACIAL REPARACIÓN", clase: "servicio", uso: "cabina", activo: true },
    { id: "a", sku: "INV-037", nombre: "Limpiador", clase: "producto", uso: "cabina", activo: true, costo_promedio: 20, beta_contenido: 200, beta_contenido_unidad: "ml" },
    { id: "b", sku: "HT-001", nombre: "Sérum", clase: "producto", uso: "venta", activo: true, costo_promedio: 30, beta_contenido: 30, beta_contenido_unidad: "ml" },
  ]);
  db.tables.set("catalogo", [
    { sku: "SUNSU-01", producto_servicio: "FACIAL SOS", tipo: "FACIAL", activo: true },
    { sku: "SUNSU-02", producto_servicio: "FACIAL REPARACIÓN", tipo: "FACIAL", activo: true },
  ]);
  for (const t of ["erp_stock", "erp_movimientos", "erp_bodegas", "app_modulos", "cabina_inventario", "tickets", "beta_aperturas", "log_acciones", "cabina_protocolos", "cabina_protocolo_pasos"]) db.tables.set(t, []);
  db.tables.set("beta_protocolos", [{ id: "pr-sunsu-01", sku: "SUNSU-01", nombre: "Facial S.O.S", version: 2, vigente: true, mano_de_obra: 10, origen: "cabina", pasos: [] }]);
  db.rpcImpl = async (name, a) => {
    if (name !== "app_protocolo_guardar") return [];
    const L = db.tables.get("beta_protocolos")!;
    const prev = L.find((r) => r.id === a.p_id);
    const row = { ...(prev || {}), ...(a.p_row as Row), id: a.p_id, version: prev ? Number(prev.version) + 1 : 1, actualizado_por: a.p_actor, borrado_at: null };
    db.tables.set("beta_protocolos", L.filter((x) => x.id !== a.p_id).concat([row]));
    return row;
  };
  return db;
}
const proto = (db: MemoryDb, sku: string) => db.tables.get("beta_protocolos")!.find((r) => r.sku === sku);

describe("🔗 protocolo automático (TK36)", () => {
  it("costo por cantidad: costo × cantidad ÷ contenido, solo con la misma unidad", () => {
    const p = { costo_promedio: 20, beta_contenido: 200, beta_contenido_unidad: "ml" };
    assert.equal(costoPorCantidad(p, 5, "ml"), 0.5);
    assert.equal(costoPorCantidad(p, 5, "g"), null);
    assert.equal(costoPorCantidad(p, 0, "ml"), null);
    const c = costearPasos([{ producto_cod: "A", cantidad: 5, unidad: "ml" }, { producto_cod: "B", cantidad: 0 }, { descripcion: "Vapor" }], new Map([["A", p]]), new Map([["B", { costoPorFacial: 1.25 }]]));
    assert.deepEqual(c.pasos.map((x) => [x.costo, x.costoFuente]), [[0.5, "cantidad"], [1.25, "aperturas"], [null, ""]]);
    assert.equal(c.costoProductos, 1.75); assert.equal(c.sinCosto, 0);
  });
  it("marcar «Aplica a» en el producto lo agrega al protocolo (y crea el del facial que no tenía); desmarcar lo saca", async () => {
    const db = semilla(); const c = ctx(db);
    const r = await handle("ap_aplica_guardar", { token: "t", producto_id: "a", faciales: ["SUNSU-01", "SUNSU-02"] }, c) as Row;
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual((proto(db, "SUNSU-01")!.pasos as Row[]).map((x) => x.producto_cod), ["INV-037"]);
    assert.equal(proto(db, "SUNSU-02")!.nombre, "FACIAL REPARACIÓN");
    // Volver a guardar lo mismo no duplica.
    await handle("ap_aplica_guardar", { token: "t", producto_id: "a", faciales: ["SUNSU-01", "SUNSU-02"] }, c);
    assert.equal((proto(db, "SUNSU-01")!.pasos as Row[]).length, 1);
    await handle("ap_aplica_guardar", { token: "t", producto_id: "a", faciales: ["SUNSU-02"] }, c);
    assert.deepEqual(proto(db, "SUNSU-01")!.pasos, []);
    assert.equal((proto(db, "SUNSU-02")!.pasos as Row[]).length, 1);
  });
  it("agregar el producto en el protocolo lo marca en el producto; el costo del protocolo se calcula solo", async () => {
    const db = semilla(); const c = ctx(db);
    const g = await handle("proto_guardar", { token: "t", id: "pr-sunsu-01", sku: "SUNSU-01", nombre: "Facial S.O.S", mano_de_obra: 10,
      pasos: [{ descripcion: "Limpieza", producto_cod: "INV-037", cantidad: 5, unidad: "ml" }, { descripcion: "Sérum", producto_cod: "HT-001", cantidad: 1.5, unidad: "ml" }] }, c) as Row;
    assert.equal(g.ok, true, JSON.stringify(g)); assert.equal(g.productosMarcados, 2);
    const P = new Map(db.tables.get("erp_productos")!.map((x) => [x.id, x]));
    assert.deepEqual(P.get("a")!.beta_aplica_faciales, ["SUNSU-01"]);
    const L = await handle("proto_list", { token: "t" }, c) as Row;
    const pr = (L.protocolos as Row[]).find((x) => x.sku === "SUNSU-01")!;
    assert.equal(pr.costoProductos, 2); // 0,50 + 1,50
    assert.equal(pr.costoTotal, 12);
    // Quitar el sérum del protocolo lo desmarca del producto. Un protocolo existente puede quedar vacío.
    await handle("proto_guardar", { token: "t", id: "pr-sunsu-01", sku: "SUNSU-01", nombre: "Facial S.O.S", pasos: [{ descripcion: "Limpieza", producto_cod: "INV-037", cantidad: 5, unidad: "ml" }] }, c);
    assert.deepEqual(db.tables.get("erp_productos")!.find((x) => x.id === "b")!.beta_aplica_faciales, []);
    const v = await handle("proto_guardar", { token: "t", id: "pr-sunsu-01", sku: "SUNSU-01", nombre: "Facial S.O.S", pasos: [] }, c) as Row;
    assert.equal(v.ok, true, JSON.stringify(v));
    assert.deepEqual(db.tables.get("erp_productos")!.find((x) => x.id === "a")!.beta_aplica_faciales, []);
  });
});
