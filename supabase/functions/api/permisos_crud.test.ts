import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import "./usuario_permisos_api.ts";
import "./gift_beta_api.ts";
import type { Row } from "./domain.ts";
import { accesoEfectivo, gateNivel, limpiarOverride, tipoAccion } from "./usuario_permisos.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "t-admin", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
    { token: "t-rec", uid: "ale", rol: "recepcion", exp: "2099-01-01T00:00:00.000Z" },
    { token: "t-cos", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "emi", nombre: "Emilia", short: "Emi", rol: "admin" },
    { id: "ale", nombre: "Alejandra Rodriguez", short: "Ale", rol: "recepcion" },
    { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa" },
  ]);
  for (const t of ["app_modulos", "app_usuario_permisos", "app_perfiles_permiso", "cosmetologas", "erp_productos", "catalogo", "cabina_inventario", "erp_bodegas", "erp_stock", "getCajaV2"]) db.tables.set(t, []);
  db.rpcImpl = async (name, a) => {
    if (name === "app_usuario_permiso_guardar") {
      const rows = (db.tables.get("app_usuario_permisos") || []).filter((r) => r.uid !== a.p_uid);
      const row = { uid: a.p_uid, perfil: a.p_perfil, niveles: a.p_niveles, alcance: a.p_alcance, flags: a.p_flags, actualizado_por: a.p_actor };
      db.tables.set("app_usuario_permisos", rows.concat([row]));
      return row;
    }
    if (name === "app_perfil_permiso_guardar") {
      const rows = (db.tables.get("app_perfiles_permiso") || []).filter((r) => r.id !== a.p_id);
      db.tables.set("app_perfiles_permiso", rows.concat([{ id: a.p_id, nombre: a.p_nombre, niveles: a.p_niveles, alcance: a.p_alcance, flags: a.p_flags, activo: a.p_activo }]));
      return { id: a.p_id };
    }
    return null;
  };
  return db;
}
const C = (db: MemoryDb, token: string) => ({ db, now: new Date("2026-11-16T18:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}), token });

describe("🔐 Permisos por usuario: módulo on/off + ver/crear/editar/eliminar (TK21)", () => {
  it("tipo de acción: lecturas, crear (también guardar sin id), editar y eliminar", () => {
    assert.equal(tipoAccion("gcb_lista"), "ver");
    assert.equal(tipoAccion("getHistorial"), "ver");
    assert.equal(tipoAccion("gcb_vender"), "crear");
    assert.equal(tipoAccion("crearTicket"), "crear");
    assert.equal(tipoAccion("tk_guardar", {}), "crear");
    assert.equal(tipoAccion("tk_guardar", { clave: "TK-SO-1" }), "editar");
    assert.equal(tipoAccion("gcb_guardar", { id: 4 }), "editar");
    assert.equal(tipoAccion("gcb_usar", { id: 4 }), "editar");
    assert.equal(tipoAccion("gcb_usar", { id: 4, desmarcar: true }), "eliminar");
    assert.equal(tipoAccion("gcb_borrar", { id: 4 }), "eliminar");
    assert.equal(tipoAccion("oc_cancel", { id: 1 }), "eliminar");
  });
  it("candado: apagado cierra el módulo; cada casilla manda", () => {
    const o = limpiarOverride({ uid: "ale", alcance: { _crud: { gift_cards: "vc", caja: "", tickets: "vced", raro: "x" } } })!;
    assert.deepEqual(o.crud, { gift_cards: "vc", caja: "", tickets: "vced" });
    assert.equal(o.niveles.gift_cards, 2); assert.equal(o.niveles.caja, 0);
    assert.equal(accesoEfectivo("todos", "caja", o), "no");
    assert.equal(gateNivel("gcb_lista", "recepcion", o), null);
    assert.equal(gateNivel("gcb_vender", "recepcion", o), null);
    assert.match(String(gateNivel("gcb_guardar", "recepcion", o, { id: 4 })?.error), /no tienes permiso para editar/);
    assert.match(String(gateNivel("gcb_borrar", "recepcion", o, { id: 4 })?.error), /para eliminar/);
    assert.equal(gateNivel("getCajaV2", "recepcion", o)?.error, "No tienes permiso");
    assert.equal(gateNivel("gcb_borrar", "admin", o, { id: 4 }), null);
    const soloVer = limpiarOverride({ uid: "x", alcance: { _crud: { gift_cards: "v" } } })!;
    assert.match(String(gateNivel("gcb_vender", "recepcion", soloVer)?.error), /para crear/);
  });
  it("uperm_guardar con crud: se guarda en alcance._crud, vuelve en uper_list y llega al candado real", async () => {
    const db = semilla();
    for (const t of ["gift_cards", "beta_gift_ajustes", "gift_cards_digitales", "log_acciones"]) db.tables.set(t, []);
    assert.match(String(((await handle("uperm_guardar", { token: "t-admin", uid: "ale", crud: { nada: "v" } }, C(db, "t-admin"))) as Row).error), /desconocido/);
    const ok = await handle("uperm_guardar", { token: "t-admin", uid: "ale", niveles: { gift_cards: 1 }, crud: { gift_cards: "vc", caja: "" } }, C(db, "t-admin")) as Row;
    assert.equal(ok.ok, true, JSON.stringify(ok));
    const fila = db.tables.get("app_usuario_permisos")!.find((r) => r.uid === "ale")!;
    assert.deepEqual((fila.alcance as Row)._crud, { gift_cards: "vc", caja: "" });
    const l = await handle("uperm_list", { token: "t-admin" }, C(db, "t-admin")) as Row;
    const ale = (l.usuarios as Row[]).find((u) => u.uid === "ale")!;
    assert.equal(((ale.efectivo as Row).crud as Row).gift_cards, "vc");
    assert.equal(((ale.efectivo as Row).crud as Row).caja, "");
    assert.equal(((ale.efectivo as Row).niveles as Row).gift_cards, 2);
    const w = await handle("whoami", { token: "t-rec" }, C(db, "t-rec")) as Row;
    assert.ok(!(w.modulos as Row[]).some((m) => m.modulo === "caja"));
    assert.ok((w.modulos as Row[]).some((m) => m.modulo === "gift_cards"));
    const bor = await handle("gcb_borrar", { token: "t-rec", id: 1, motivo: "x" }, C(db, "t-rec")) as Row;
    assert.match(String(bor.error), /para eliminar/);
    const lis = await handle("gcb_lista", { token: "t-rec" }, C(db, "t-rec")) as Row;
    assert.equal(lis.ok, true, JSON.stringify(lis));
  });
});
