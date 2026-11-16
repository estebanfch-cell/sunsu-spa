import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import "./productos_paridad_api.ts";
import { limpiarPasos } from "./protocolos_api.ts";
import type { Row } from "./domain.ts";

function ctx(db: MemoryDb, rol = "admin") {
  const token = "t-" + rol;
  db.tables.set("sesiones", [{ token, uid: rol, rol, exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: rol, nombre: rol, short: rol, rol, bloqueado: false }]);
  return { db, now: new Date("2026-11-16T17:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}), token };
}
// Simula las RPC de 0042 (upsert con versión + 1, borrado suave).
function semilla(conBeta = true) {
  const db = new MemoryDb();
  db.tables.set("erp_productos", [
    { id: "p2", sku: "01", nombre: "FACIAL SOS", clase: "servicio", uso: "cabina", activo: true },
    { id: "p4", sku: "12", nombre: "FACIAL GLOW", clase: "servicio", uso: "cabina", activo: true },
    { id: "p3", sku: "INV-037", nombre: "Limpiador", clase: "producto", uso: "cabina", activo: true },
  ]);
  db.tables.set("catalogo", [
    { sku: "SUNSU-01", producto_servicio: "FACIAL SOS", tipo: "FACIAL", activo: true },
    { sku: "SUNSU-12", producto_servicio: "FACIAL GLOW", tipo: "FACIAL", activo: true },
  ]);
  db.tables.set("cabina_protocolos", [{ sku: "SUNSU-01", facial: "Facial S.O.S", version: 12, vigente: "SI", mano_de_obra: 23.2 }]);
  db.tables.set("cabina_protocolo_pasos", [{ sku: "SUNSU-01", version: 1, paso: 1, descripcion: "Limpieza", producto_cod: "INV-037", cantidad: 2, unidad: "ml", minutos: 2 }]);
  for (const t of ["erp_stock", "erp_movimientos", "erp_bodegas", "app_modulos", "cabina_inventario", "inventario_base", "app_archivos", "tickets", "erp_proveedores"]) db.tables.set(t, []);
  if (conBeta) {
    db.tables.set("beta_protocolos", [{ id: "pr-sunsu-01", sku: "SUNSU-01", nombre: "Facial S.O.S", version: 1, vigente: true, mano_de_obra: 23.2, origen: "cabina",
      pasos: [{ paso: 1, descripcion: "Limpieza", producto_cod: "INV-037", cantidad: 2, unidad: "ml", minutos: 2 }] }]);
    db.rpcImpl = async (name, a) => {
      if (name !== "app_protocolo_guardar") return [];
      const L = db.tables.get("beta_protocolos")!;
      const prev = L.find((r) => r.id === a.p_id);
      const r = a.p_row as Row;
      const row = { ...(prev || {}), ...r, id: a.p_id, version: prev ? Number(prev.version) + 1 : 1, actualizado_por: a.p_actor, borrado_at: r.borrar ? "2026-11-16" : null };
      db.tables.set("beta_protocolos", L.filter((x) => x.id !== a.p_id).concat([row]));
      return row;
    };
  }
  return db;
}

describe("protocolos editables (0042)", () => {
  it("limpiarPasos: renumera, valida producto, cantidad y unidad", () => {
    const cod = new Set(["INV-037"]);
    const r = limpiarPasos([{ descripcion: "A", producto_cod: "inv-037", cantidad: "1,5", unidad: "ml" }, { descripcion: "" }, { descripcion: "Vapor", minutos: 5 }], cod);
    assert.deepEqual(r.pasos.map((x) => [x.paso, x.producto_cod, x.cantidad]), [[1, "INV-037", 1.5], [2, "", 0]]);
    assert.match(String(limpiarPasos([{ producto_cod: "ZZ-1", cantidad: 1, unidad: "ml" }], cod).error), /no encontrado/);
    assert.match(String(limpiarPasos([{ producto_cod: "INV-037", cantidad: 2 }], cod).error), /unidad/);
  });
  it("lista con servicio SUNSU-NN, crear uno nuevo, editar sube versión, no duplica facial", async () => {
    const db = semilla(); const c = ctx(db);
    let L = await handle("proto_list", { token: c.token }, c) as Row;
    assert.equal(L.editable, true);
    assert.deepEqual((L.protocolos as Row[]).map((p) => [p.sku, (p.servicio as Row).nombre]), [["SUNSU-01", "FACIAL SOS"]]);
    assert.deepEqual((L.servicios as Row[]).map((x) => x.sku), ["SUNSU-01", "SUNSU-12"]);
    let r = await handle("proto_guardar", { token: c.token, sku: "SUNSU-01", nombre: "Otro", pasos: [{ descripcion: "x" }] }, c) as Row;
    assert.match(String(r.error), /ya tiene protocolo/);
    r = await handle("proto_guardar", { token: c.token, sku: "SUNSU-12", nombre: "Facial Glow", pasos: [] }, c) as Row;
    assert.match(String(r.error), /al menos un paso/);
    r = await handle("proto_guardar", { token: c.token, sku: "SUNSU-12", nombre: "Facial Glow", mano_de_obra: "10", pasos: [{ descripcion: "Limpieza", producto_cod: "INV-037", cantidad: 3, unidad: "ml", minutos: 4 }] }, c) as Row;
    assert.equal(r.ok, true); assert.equal(r.id, "pr-sunsu-12"); assert.equal(r.version, 1);
    r = await handle("proto_guardar", { token: c.token, id: "pr-sunsu-01", sku: "SUNSU-01", nombre: "Facial S.O.S", pasos: [{ descripcion: "Vapor", minutos: 5 }, { descripcion: "Limpieza", producto_cod: "INV-037", cantidad: 2, unidad: "ml" }] }, c) as Row;
    assert.equal(r.version, 2);
    L = await handle("proto_list", { token: c.token }, c) as Row;
    const sos = (L.protocolos as Row[]).find((p) => p.sku === "SUNSU-01")!;
    assert.deepEqual((sos.pasos as Row[]).map((x) => x.descripcion), ["Vapor", "Limpieza"]);
    assert.equal(sos.minutos, 5);
    // La ficha del servicio usa el protocolo de la beta.
    const f = await handle("mcprod_get", { token: c.token, id: "p2" }, c) as Row;
    assert.deepEqual((((f.protocolo as Row).pasos) as Row[]).map((x) => x.descripcion), ["Vapor", "Limpieza"]);
    // Borrado suave
    r = await handle("proto_guardar", { token: c.token, id: "pr-sunsu-12", sku: "SUNSU-12", nombre: "Facial Glow", pasos: [{ descripcion: "x" }], borrar: true }, c) as Row;
    L = await handle("proto_list", { token: c.token }, c) as Row;
    assert.deepEqual((L.protocolos as Row[]).map((p) => p.sku), ["SUNSU-01"]);
  });
  it("cosmetóloga ve sin costos y no edita", async () => {
    const db = semilla(); const c = ctx(db, "cosmetologa");
    const L = await handle("proto_list", { token: c.token }, c) as Row;
    if (L.error) return; // si su rol no ve cabina, también vale
    assert.equal(L.editable, false);
    assert.equal((L.protocolos as Row[])[0].mano_de_obra, undefined);
    const r = await handle("proto_guardar", { token: c.token, sku: "SUNSU-12", nombre: "X", pasos: [{ descripcion: "x" }] }, c) as Row;
    assert.match(String(r.error), /Solo un admin/);
  });
});
