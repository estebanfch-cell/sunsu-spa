import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import "./usuario_permisos_api.ts";
import type { Row } from "./domain.ts";
import { accesoEfectivo, conPermisosUsuario, gateNivel, limpiarOverride, redactarFlags } from "./usuario_permisos.ts";
import { matrizDe, acceso } from "./permisos.ts";

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

describe("permisos por usuario (MineCore perm.ts)", () => {
  it("sin fila todo queda igual que con el rol", async () => {
    const db = semilla();
    const r = await handle("whoami", { token: "t-rec" }, C(db, "t-rec")) as Row;
    const mods = (r.modulos as Row[]).map((m) => m.modulo + ":" + m.acceso).sort();
    const m = await matrizDe(db);
    const esperado = (["inicio", "tickets", "productos", "clientes", "caja", "gift_cards", "paquetes", "cotizaciones_cliente", "inventario", "comisiones", "rol_pagos", "asistencia", "agenda"]).map((x) => x + ":" + acceso("recepcion", x, m)).sort();
    assert.deepEqual(mods, esperado);
  });
  it("nivel 0 quita el módulo; nivel explícito manda; alcance cambia a «todo»", () => {
    const o = limpiarOverride({ uid: "ale", niveles: { caja: 0, compras: 2, tickets: 2, raro: 3 }, alcance: { tickets: "todos" }, flags: { costos: true } })!;
    assert.equal(o.niveles.raro, undefined);
    assert.equal(accesoEfectivo("todos", "caja", o), "no");
    assert.equal(accesoEfectivo("no", "compras", o), "propio");
    assert.equal(accesoEfectivo("propio", "tickets", o), "todos");
    assert.equal(accesoEfectivo("todos", "inventario", o), "todos");
  });
  it("nivel 1 = solo ver; aprobar/anular pide nivel 3; admin nunca se limita", () => {
    const o = limpiarOverride({ uid: "x", niveles: { tickets: 1, compras: 2 } })!;
    assert.equal(gateNivel("getHistorial", "recepcion", o), null);
    assert.match(String(gateNivel("crearTicket", "recepcion", o)?.error), /solo puedes ver/);
    assert.match(String(gateNivel("oc_cancel", "recepcion", o)?.error), /nivel 3/);
    assert.equal(gateNivel("oc_save", "recepcion", o), null);
    assert.equal(gateNivel("crearTicket", "admin", o), null);
  });
  it("precios y saldos apagados se quitan de la respuesta, como RX_PRECIO/RX_SALDO", () => {
    const o = limpiarOverride({ uid: "x", flags: { precios: false, saldos: false } })!;
    const out = redactarFlags({ ok: true, items: [{ sku: "A", precio_venta: 3, total: 9, saldo: 2, nombre: "x" }] }, "recepcion", o) as Row;
    assert.deepEqual((out.items as Row[])[0], { sku: "A", nombre: "x" });
    assert.equal(out.ok, true);
  });
  it("el Db envuelto cambia app_modulos solo para el rol de la persona", async () => {
    const db = semilla();
    const o = limpiarOverride({ uid: "ale", niveles: { caja: 0, compras: 2 }, flags: { costos: true } })!;
    const m = await matrizDe(conPermisosUsuario(db, "recepcion", o));
    assert.equal(acceso("recepcion", "caja", m), "no");
    assert.equal(acceso("recepcion", "compras", m), "propio");
    assert.equal(acceso("recepcion", "ver_costos", m), "no"); // TK115: ni el flag costos otorga ver_costos
    assert.equal(acceso("cosmetologa", "tickets", m), "propio");
  });
  it("uperm: solo admin edita; el cambio llega a whoami, al candado y al login; admin no lleva override", async () => {
    const db = semilla();
    const no = await handle("uperm_guardar", { token: "t-rec", uid: "ale", niveles: { caja: 0 } }, C(db, "t-rec")) as Row;
    assert.match(String(no.error), /admin/);
    const lista = await handle("uperm_list", { token: "t-admin" }, C(db, "t-admin")) as Row;
    const ale = (lista.usuarios as Row[]).find((u) => u.uid === "ale")!;
    assert.equal(ale.personalizado, false);
    assert.equal(((ale.efectivo as Row).niveles as Row).caja, 2);
    assert.ok((lista.perfiles as Row[]).some((p) => p.id === "rol:recepcion"));
    const fuera = await handle("uperm_guardar", { token: "t-admin", uid: "ale", niveles: { caja: 5 } }, C(db, "t-admin")) as Row;
    assert.match(String(fuera.error), /0 a 2/);
    const ok = await handle("uperm_guardar", { token: "t-admin", uid: "ale", perfil: "Recepción sin caja", niveles: { caja: 0, tickets: 1 } }, C(db, "t-admin")) as Row;
    assert.equal(ok.ok, true);
    const w = await handle("whoami", { token: "t-rec" }, C(db, "t-rec")) as Row;
    assert.ok(!(w.modulos as Row[]).some((m) => m.modulo === "caja"));
    assert.ok((w.modulos as Row[]).some((m) => m.modulo === "tickets"));
    const caja = await handle("getCajaV2", { token: "t-rec" }, C(db, "t-rec")) as Row;
    assert.match(String(caja.error), /permiso/);
    const tk = await handle("crearTicket", { token: "t-rec", cosmetologa: "Andrea Robles" }, C(db, "t-rec")) as Row;
    assert.match(String(tk.error), /solo puedes ver/);
    const cos = await handle("whoami", { token: "t-cos" }, C(db, "t-cos")) as Row;
    assert.ok((cos.modulos as Row[]).some((m) => m.modulo === "tickets"));
    const adm = await handle("uperm_guardar", { token: "t-admin", uid: "emi", niveles: { caja: 0 } }, C(db, "t-admin")) as Row;
    assert.match(String(adm.error), /siempre tienen todo/);
    const pf = await handle("uperm_perfil_guardar", { token: "t-admin", nombre: "Solo mostrador", niveles: { tickets: 2, caja: 1 } }, C(db, "t-admin")) as Row;
    assert.equal(pf.ok, true);
    const l2 = await handle("uperm_list", { token: "t-admin" }, C(db, "t-admin")) as Row;
    assert.ok((l2.perfiles as Row[]).some((p) => p.nombre === "Solo mostrador"));
    const ale2 = (l2.usuarios as Row[]).find((u) => u.uid === "ale")!;
    assert.equal(ale2.perfil, "Recepción sin caja");
    assert.equal(((ale2.efectivo as Row).niveles as Row).caja, 0);
  });
  it("«Ver como» usa los permisos de la persona vista", async () => {
    const db = semilla();
    await handle("uperm_guardar", { token: "t-admin", uid: "ale", niveles: { caja: 0 } }, C(db, "t-admin"));
    const w = await handle("whoami", { token: "t-admin", preview_uid: "ale" }, C(db, "t-admin")) as Row;
    assert.ok(Array.isArray(w.modulos), JSON.stringify(w).slice(0, 200));
    assert.ok(!(w.modulos as Row[]).some((m) => m.modulo === "caja"));
  });
  it("interruptores de comisiones y rol de pagos: apagados cierran el módulo y quitan montos", () => {
    const o = limpiarOverride({ uid: "andrea", niveles: { comisiones: 2, rol_pagos: 1 }, flags: { comisiones: false, rol_pagos: false } })!;
    assert.equal(accesoEfectivo("propio", "comisiones", o), "no");
    assert.equal(accesoEfectivo("propio", "rol_pagos", o), "no");
    assert.ok(gateNivel("getComisionesTabla", "cosmetologa", o)?.error);
    const out = redactarFlags({ ok: true, total: 3, comision: 9, items: [{ comision_neta: 1, sku: "A" }] }, "cosmetologa", o) as Row;
    assert.equal(out.comision, undefined);
    assert.deepEqual((out.items as Row[])[0], { sku: "A" });
    assert.equal(out.total, 3);
  });

  it("alcance de personas: solo ella, una lista o todas; se aplica en el servidor", async () => {
    const db = semilla();
    const r0 = await handle("uperm_guardar", { token: "t-admin", uid: "ale", niveles: { comisiones: 1, rol_pagos: 1, tickets: 1 }, alcance: { _personas: ["Nadie Raro"] }, flags: { comisiones: true, rol_pagos: true } }, C(db, "t-admin")) as Row;
    assert.match(String(r0.error), /No está en el equipo/);
    const r = await handle("uperm_guardar", { token: "t-admin", uid: "ale", niveles: { comisiones: 1, rol_pagos: 1, tickets: 1 }, alcance: { _personas: ["Andrea Robles"] }, flags: { comisiones: true, rol_pagos: true } }, C(db, "t-admin")) as Row;
    assert.equal(r.ok, true);
    const o = limpiarOverride((db.tables.get("app_usuario_permisos") || [])[0])!;
    assert.deepEqual(o.personas, ["Andrea Robles"]);
    assert.equal(o.alcance._personas, undefined);
    assert.equal(accesoEfectivo("todos", "comisiones", o), "propio");
    const { clampPersonal, esPropio } = await import("./permisos.ts");
    const ses = { rol: "recepcion", name: "Alejandra Rodriguez", short: "Ale", uid: "ale", personas: o.personas };
    const m = await matrizDe(conPermisosUsuario(db, "recepcion", o));
    assert.equal(clampPersonal("getComisionesTabla", { nombre: "Andrea Robles" }, ses, m).nombre, "Andrea Robles");
    assert.equal(clampPersonal("getComisionesTabla", { nombre: "Emilia" }, ses, m).nombre, "Alejandra Rodriguez");
    assert.equal(esPropio("Andrea", ses), true);
    assert.equal(esPropio("Emilia", ses), false);
    const todas = limpiarOverride({ uid: "x", niveles: { comisiones: 1 }, alcance: { _personas: ["Andrea Robles", "*"] } })!;
    assert.deepEqual(todas.personas, ["*"]);
    assert.equal(accesoEfectivo("propio", "comisiones", todas), "todos");
    const lista = await handle("uperm_list", { token: "t-admin" }, C(db, "t-admin")) as Row;
    assert.ok((lista.equipo as Row[]).some((u) => u.nombre === "Andrea Robles"));
    const ale = (lista.usuarios as Row[]).find((u) => u.uid === "ale") as Row;
    assert.deepEqual((ale.efectivo as Row).personas, ["Andrea Robles"]);
  });
});
