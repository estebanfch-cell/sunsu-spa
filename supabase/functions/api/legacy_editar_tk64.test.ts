// TK64 (Emilia 18/11): pantallas viejas (Cabina inventario/activos, protocolo, registro, usuarios) sin botón «Editar».
// La admin toca el dato y guarda solo si cambió; el personal manda la misma acción como solicitud.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./inline_api.ts";
import "./legacy_solicitudes_api.ts";
import type { Row } from "./domain.ts";

const root = join(import.meta.dirname, "../../..");
function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Ana Pérez", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }, { id: "u-ana", nombre: "Ana Pérez", rol: "cosmetologa" }]);
  db.tables.set("cabina_inventario", [{ sheet_row: 5, codigo: "INV-005", producto: "Gel", proveedor: "Lab", costo_envase: 10, contenido_envase: 500, unidad: "ml", activo: "SI" }]);
  db.tables.set("cabina_activos", [{ sheet_row: 3, codigo: "AC-003", activo: "Vaporizador", cantidad: 1, costo: 120, estado: "ACTIVO" }]);
  for (const t of ["log_acciones", "app_modulos", "permisos", "solicitudes_cambio", "audit_log", "beta_notificaciones", "cabina_protocolos", "cabina_protocolo_pasos"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-18T17:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: (async () => new Response("{}")) as unknown as typeof fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}

describe("TK64 · pantallas viejas sin Editar", () => {
  it("la admin guarda {row, campos} sin borrar lo que no vino (antes el guardado viejo vaciaba la fila)", async () => {
    const { db, h } = semilla();
    const r = await h("cabinaSaveProducto", "adm", { row: 5, campos: { codigo: "INV-005", producto: "Gel frío", contenido: "500" } });
    assert.equal(r.ok, true);
    const f = db.tables.get("cabina_inventario")![0];
    assert.equal(f.producto, "Gel frío"); assert.equal(f.costo_envase, 10); assert.equal(f.proveedor, "Lab");
    await h("cabinaSaveActivo", "adm", { row: 3, campos: { codigo: "AC-003", activo: "Vaporizador", cantidadLocal: "2" } });
    const a = db.tables.get("cabina_activos")![0];
    assert.equal(a.cantidad, 2); assert.equal(a.costo, 120);
  });

  it("personal: no guarda directo; la solicitud aprobada aplica SOLO lo que cambió; rechazada no cambia nada", async () => {
    const { db, h } = semilla();
    assert.ok((await h("cabinaSaveProducto", "cos", { row: 5, campos: { producto: "X" } })).error);
    const payload = { accion: "cabinaSaveProducto", row: 5, campos: { codigo: "INV-005", producto: "Gel nuevo", costoEnvase: "", proveedor: "Lab" } };
    const s1 = await h("solicitud_crear", "cos", { tabla: "cabina_inventario", fila: "5", tipo: "cambio", motivo: "nombre mal", propuestos: { producto: "Gel nuevo", __antes: { producto: "Gel" }, __payload: payload } });
    assert.ok(s1.id, JSON.stringify(s1));
    assert.equal(db.tables.get("cabina_inventario")![0].producto, "Gel", "nada cambia hasta aprobar");
    assert.equal((await h("solicitud_resolver", "adm", { id: s1.id, aprobar: true })).estado, "aprobado");
    const f = db.tables.get("cabina_inventario")![0];
    assert.equal(f.producto, "Gel nuevo"); assert.equal(f.costo_envase, 10, "el costo que el personal no ve no se borra");
    const s2 = await h("solicitud_crear", "cos", { tabla: "cabina_inventario", fila: "5", tipo: "cambio", motivo: "x", propuestos: { producto: "Otro", __payload: { ...payload, campos: { producto: "Otro" } } } });
    assert.equal((await h("solicitud_resolver", "adm", { id: s2.id, aprobar: false, comentario: "no" })).estado, "rechazado");
    assert.equal(db.tables.get("cabina_inventario")![0].producto, "Gel nuevo");
  });

  it("una solicitud cuya acción apunta a otra fila no se aplica", async () => {
    const { db, h } = semilla();
    const s1 = await h("solicitud_crear", "cos", { tabla: "cabina_inventario", fila: "5", tipo: "cambio", motivo: "truco", propuestos: { producto: "Z", __payload: { row: 9, campos: { producto: "Z" } } } });
    const r = await h("solicitud_resolver", "adm", { id: s1.id, aprobar: true });
    assert.notEqual(r.estado, "aprobado");
    assert.equal(db.tables.get("cabina_inventario")![0].producto, "Gel");
  });

  it("ya no hay botones ✏️/Editar en Cabina, protocolo, registro ni usuarios", () => {
    const src = readFileSync(join(root, "beta-screens.js"), "utf8");
    assert.doesNotMatch(src, /✏️ Editar protocolo/);
    assert.doesNotMatch(src, /onclick="showEdit\(\\''\+u\.id\+'\\'\)">Editar<\/button>/);
    assert.doesNotMatch(src, />✏️<\/button>/);
    assert.doesNotMatch(src, /✏️ Editar/);
    assert.match(src, /function _lgPedir\(/);
    assert.match(src, /_lgAccionTabla\[accion\]/);
  });
});
