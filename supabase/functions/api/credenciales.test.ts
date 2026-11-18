import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./credenciales_api.ts";
import { hashPass, igualSeguro, validarPass, validarUsuario } from "./credenciales.ts";
import type { Row } from "./domain.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Ana Pérez", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("app_usuarios", [
    { id: "admin", name: "Emilia", short: "Emi", role: "admin", activo: true },
    { id: "u-ana", name: "Ana Pérez", short: "Ana", role: "cosmetologa", activo: true },
    { id: "u-old", name: "Ex", role: "recepcion", activo: false },
  ]);
  for (const t of ["beta_credenciales", "log_acciones", "login_intentos"]) db.tables.set(t, []);
  let now = new Date("2026-11-17T20:00:00Z");
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { db, now, env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: tok } as never) as Promise<Row>;
  return { db, h, avanza: (min: number) => { now = new Date(now.getTime() + min * 60000); } };
}

describe("🔑 Usuario y contraseña", () => {
  it("valida usuario y contraseña", async () => {
    assert.equal(validarUsuario("ana.perez"), null);
    assert.ok(validarUsuario("AB"));
    assert.ok(validarPass("corta1"));
    assert.ok(validarPass("solosletras"));
    assert.ok(validarPass("ana.perez123", "ana.perez"));
    assert.equal(validarPass("Sunsu2026!"), null);
    const a = await hashPass("x1234567", "sal", 1000), b = await hashPass("x1234567", "sal", 1000);
    assert.ok(igualSeguro(a, b)); assert.ok(!igualSeguro(a, await hashPass("x1234568", "sal", 1000)));
  });

  it("cada quien crea su acceso y entra con él; nunca se guarda la contraseña en claro", async () => {
    const { db, h } = semilla();
    assert.equal((await h("cred_mia_guardar", "cos", { usuario: "Ana", password: "Facial2026", password2: "otra" })).error, "Las dos contraseñas no coinciden");
    const r = await h("cred_mia_guardar", "cos", { usuario: "Ana", password: "Facial2026", password2: "Facial2026" });
    assert.equal(r.usuario, "ana");
    const c = db.tables.get("beta_credenciales")![0];
    assert.equal(c.usuario_id, "u-ana");
    assert.ok(!JSON.stringify(c).includes("Facial2026"));
    assert.ok(!JSON.stringify(db.tables.get("log_acciones")).includes("Facial2026"));
    assert.equal((await h("cred_mia_get", "cos")).usuario, "ana");
    const L = await h("login_pass", "", { usuario: " ANA ", password: "Facial2026" });
    assert.equal(L.ok, true); assert.ok(L.token);
    assert.equal((L.user as Row).id, "u-ana"); assert.equal((L.user as Row).role, "cosmetologa");
    assert.equal((await h("login_pass", "", { usuario: "ana", password: "mala12345" })).error, "Usuario o contraseña incorrectos");
    assert.equal((await h("login_pass", "", { usuario: "nadie", password: "mala12345" })).error, "Usuario o contraseña incorrectos");
  });

  it("bloquea 15 minutos tras 5 intentos fallidos y el admin puede desbloquear", async () => {
    const { h, avanza } = semilla();
    await h("cred_mia_guardar", "cos", { usuario: "ana", password: "Facial2026", password2: "Facial2026" });
    for (let i = 0; i < 5; i++) await h("login_pass", "", { usuario: "ana", password: "mala12345" });
    assert.match(String((await h("login_pass", "", { usuario: "ana", password: "Facial2026" })).error), /Demasiados intentos/);
    assert.equal(((await h("cred_lista", "adm")).items as Row[]).find((x) => x.id === "u-ana")!.bloqueada, true);
    assert.equal((await h("cred_desbloquear", "adm", { usuario_id: "u-ana" })).ok, true);
    assert.equal((await h("login_pass", "", { usuario: "ana", password: "Facial2026" })).ok, true);
    for (let i = 0; i < 5; i++) await h("login_pass", "", { usuario: "ana", password: "mala12345" });
    avanza(16);
    assert.equal((await h("login_pass", "", { usuario: "ana", password: "Facial2026" })).ok, true);
  });

  it("límite por IP: 8 intentos en 15 minutos", async () => {
    const { h } = semilla();
    for (let i = 0; i < 8; i++) await h("login_pass", "", { usuario: "x" + i + "yz", password: "mala12345", ip: "1.2.3.4" });
    assert.match(String((await h("login_pass", "", { usuario: "otro", password: "mala12345", ip: "1.2.3.4" })).error), /Demasiados intentos/);
  });

  it("solo admin administra el equipo; usuario único; inactivos no entran", async () => {
    const { db, h } = semilla();
    assert.equal((await h("cred_lista", "cos")).error, "Solo admin");
    assert.equal((await h("cred_guardar", "cos", { usuario_id: "admin", usuario: "emi", password: "Clave2026x" })).error, "Solo admin");
    assert.equal((await h("cred_guardar", "adm", { usuario_id: "u-ana", usuario: "ana", password: "Clave2026x" })).ok, true);
    assert.equal((await h("cred_mia_guardar", "adm", { usuario: "ana", password: "Clave2026y", password2: "Clave2026y" })).error, "Ese usuario ya lo tiene otra persona");
    assert.equal((await h("cred_guardar", "adm", { usuario_id: "u-old", usuario: "ex1", password: "Clave2026x" })).error, "Esa persona no está en el equipo");
    const items = (await h("cred_lista", "adm")).items as Row[];
    assert.equal(items.length, 2);
    assert.ok(!JSON.stringify(items).includes("pass"));
    // si la cuenta se desactiva después, no entra
    db.tables.get("app_usuarios")!.find((u) => u.id === "u-ana")!.activo = false;
    assert.equal((await h("login_pass", "", { usuario: "ana", password: "Clave2026x" })).error, "Esa cuenta no está activa");
    assert.equal((await h("cred_quitar", "adm", { usuario_id: "u-ana" })).ok, true);
    assert.equal(db.tables.get("beta_credenciales")!.length, 0);
  });

  it("una clave que pone el admin es temporal: obliga a cambiarla y no se puede repetir", async () => {
    const { h } = semilla();
    assert.equal((await h("cred_guardar", "adm", { usuario_id: "u-ana", usuario: "ana", password: "Temporal1x" })).ok, true);
    const L = await h("login_pass", "", { usuario: "ana", password: "Temporal1x" });
    assert.equal(L.ok, true);
    assert.equal(L.debe_cambiar, true);
    assert.equal(L.usuario, "ana");
    const same = await h("cred_mia_guardar", "cos", { usuario: "ana", password: "Temporal1x", password2: "Temporal1x" });
    assert.match(String(same.error), /distinta a la temporal/);
    const own = await h("cred_mia_guardar", "cos", { usuario: "ana", password: "LaMia2026", password2: "LaMia2026" });
    assert.equal(own.ok, true);
    assert.equal(own.debe_cambiar, false);
    const L2 = await h("login_pass", "", { usuario: "ana", password: "LaMia2026" });
    assert.equal(L2.ok, true);
    assert.equal(L2.debe_cambiar, false);
    const items = (await h("cred_lista", "adm")).items as Row[];
    assert.equal(items.find((x) => x.id === "u-ana")!.debe_cambiar, false);
  });
});
