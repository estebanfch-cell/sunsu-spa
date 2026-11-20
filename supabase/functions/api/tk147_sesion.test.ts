import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./credenciales_api.ts";
import "./erp_api.ts";
import { expSesion, SESION_MS, SESION_RENOVAR_SI_QUEDA_MS } from "./lib.ts";
import { hashTokenReset, nuevoTokenReset, RESET_MIN, validarEmail } from "./credenciales.ts";
import { enlaceReset, proveedorCorreo } from "./correo.ts";
import type { Row } from "./domain.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(join(root, "index.html"), "utf8");
const acc = readFileSync(join(root, "mc-acceso.js"), "utf8");
const sw = readFileSync(join(root, "sw.js"), "utf8");
const sql = readFileSync(join(root, "docs/supabase/pending/0069_tk147_pin_desactivado.sql"), "utf8");

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", short: "Emi", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Ana Pérez", short: "Ana", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("app_usuarios", [
    { id: "admin", name: "Emilia", short: "Emi", role: "admin", activo: true },
    { id: "u-ana", name: "Ana Pérez", short: "Ana", role: "cosmetologa", activo: true, pin_hash: "$2fake", pin_desactivado: false },
  ]);
  db.tables.set("usuarios", []);
  for (const t of ["beta_credenciales", "beta_password_resets", "log_acciones", "login_intentos", "cosmetologas"]) db.tables.set(t, []);
  const now = { v: new Date("2026-11-19T22:00:00Z") };
  const env: Record<string, string | undefined> = {};
  const h = (a: string, tok: string, p: Row = {}) =>
    handle(a, { token: tok, ...p }, { db, now: now.v, env, fetchImpl: fetch, legacyLogin: async () => ({}), token: tok } as never) as Promise<Row>;
  return { db, h, env, now };
}

describe("TK147 sesión persistente, encabezado, PIN y reseteo", () => {
  it("el cliente no borra la sesión ante un fallo de red o 5xx; solo ante auth o Salir", () => {
    assert.match(html, /red: true, transitorio: true/);
    assert.match(html, /auth_error/);
    assert.match(html, /function esAuthError/);
    assert.match(html, /sunsu\.beta\.sesion/);
    assert.match(html, /Tu sesión se conserva/);
    assert.match(html, /api\("logout"/);
    assert.match(html, /localStorage\.removeItem\("sunsu\.beta\.sesion"\)/);
    assert.doesNotMatch(html, /if \(!who\.ok\) \{ state\.token = ""; localStorage\.removeItem\("sunsu\.beta\.token"\); paintLogin\(who\.error\); return; \}/);
    assert.match(sw, /sunsu-2026-11-20-TK181b/);
    assert.match(html, /sunsu-2026-11-20-TK181b/);
    assert.doesNotMatch(html, /sunsu-beta-2026-11-19-TK146/);
  });

  it("el header muestra el nombre junto a la campana y oculta la llave si ya tiene usuario", () => {
    assert.match(html, /function htmlTopUser/);
    assert.match(html, /function nombreHeader/);
    assert.match(html, /class="top-user"/);
    assert.match(html, /short \+ " · como "/);
    assert.match(html, /!state\.tiene_usuarioReal \? `<a class="btn ghost small top-salir top-icon" href="#\/m\/acceso"/);
    assert.match(html, /@media \(min-width: 861px\)[\s\S]*\.top-user \{ display: inline-flex; \}/);
    assert.match(html, /max-width: 6\.4rem/);
  });

  it("el aviso de 5 días solo sale a quien aún no tiene usuario y se puede posponer en la sesión", () => {
    assert.match(html, /martes 24 de noviembre de 2026/);
    assert.match(html, /function debeAvisoPin/);
    assert.match(html, /Crear mi usuario y contraseña/);
    assert.match(html, /Más tarde/);
    assert.match(html, /sunsu\.beta\.avisoPin/);
    assert.match(html, /function sunsuTrasCrearUsuario/);
    assert.match(acc, /Tu PIN quedó desactivado/);
    assert.match(acc, /martes 24 de noviembre de 2026/);
    assert.doesNotMatch(acc, /Tu PIN sigue funcionando igual/);
  });

  it("pide correo en el registro y el olvido de contraseña, con enlace de reseteo", () => {
    assert.match(acc, /Correo electrónico/);
    assert.match(acc, /id="' \+ pref \+ '-e"/);
    assert.match(acc, /Enviar reseteo de clave/);
    assert.match(acc, /Copiar enlace de reseteo/);
    assert.match(acc, /Todavía no tenemos tu correo/);
    assert.match(html, /¿Olvidaste tu contraseña\?/);
    assert.match(html, /function paintOlvido/);
    assert.match(html, /function paintResetClave/);
    assert.match(html, /tokenResetHash/);
    assert.match(html, /reset_pedir/);
    assert.match(html, /reset_aplicar/);
    assert.match(html, /#\/reset\//);
  });

  it("el SQL es aditivo: respaldo, pin_desactivado, email y tokens hasheados", () => {
    assert.match(sql, /_bak_20261119_tk147_pins/);
    assert.match(sql, /pin_desactivado boolean not null default false/);
    assert.match(sql, /add column if not exists email text/);
    assert.match(sql, /create table if not exists public\.beta_password_resets/);
    assert.match(sql, /token_hash text not null unique/);
    assert.match(sql, /el valor en claro nunca se almacena/);
  });

  it("valida el correo y no hay proveedor de envío si falta RESEND_API_KEY", () => {
    assert.equal(validarEmail("ana@sunsu.test"), null);
    assert.ok(validarEmail(""));
    assert.ok(validarEmail("no-es-correo"));
    assert.equal(validarEmail("", false), null);
    assert.equal(proveedorCorreo({}), null);
    assert.equal(proveedorCorreo({ RESEND_API_KEY: "rk" }), "resend");
    assert.equal(enlaceReset({}, "abc"), "https://app.sunsuspa.com/#/reset/abc");
  });

  it("la sesión en el servidor dura 90 días y se renueva al acercarse el vencimiento", () => {
    const now = new Date("2026-11-19T22:00:00Z");
    const exp = new Date(expSesion(now));
    assert.ok(Math.abs(exp.getTime() - now.getTime() - SESION_MS) < 1000);
    assert.equal(SESION_MS, 90 * 24 * 3600 * 1000);
    assert.equal(SESION_RENOVAR_SI_QUEDA_MS, 45 * 24 * 3600 * 1000);
  });

  it("crear usuario+contraseña desactiva el PIN; el reseteo guarda solo el hash y no filtra existencia", async () => {
    const { db, h } = semilla();
    const crea = await h("cred_mia_guardar", "cos", { usuario: "ana", email: "ana@sunsu.test", password: "Facial2026", password2: "Facial2026" });
    assert.equal(crea.ok, true);
    const ana = db.tables.get("app_usuarios")!.find((u) => u.id === "u-ana")!;
    assert.equal(ana.pin_desactivado, true);
    const who = await h("whoami", "cos");
    assert.equal(who.tiene_usuario, true);
    assert.equal(who.email, "ana@sunsu.test");

    const publico = await h("reset_pedir", "", { usuario: "nadie-inventado" });
    assert.equal(publico.ok, true);
    assert.ok(String(publico.mensaje).includes("Si ese usuario o correo"));
    assert.equal(publico.enlace, undefined);
    assert.equal((await h("reset_pedir", "", { email: "ana@sunsu.test" })).ok, true);
    const rows = db.tables.get("beta_password_resets") || [];
    assert.equal(rows.length, 1);
    assert.ok(rows[0].token_hash);
    assert.ok(!JSON.stringify(rows[0]).includes("enlace"));
    const dump = JSON.stringify(db.tables);
    assert.ok(!dump.includes("Facial2026"));

    const adminReset = await h("cred_enviar_reset", "adm", { usuario_id: "u-ana" });
    assert.equal(adminReset.ok, true);
    assert.equal(adminReset.enviado, false);
    assert.match(String(adminReset.motivo), /no hay proveedor de correo|RESEND_API_KEY/);
    assert.ok(String(adminReset.enlace).includes("#/reset/"));
    assert.equal(adminReset.email, "a***@sunsu.test");
    const token = String(adminReset.enlace).split("#/reset/")[1];
    assert.ok(token);
    const hashed = await hashTokenReset(token);
    assert.ok((db.tables.get("beta_password_resets") || []).some((r) => r.token_hash === hashed));
    assert.ok(!(db.tables.get("beta_password_resets") || []).some((r) => JSON.stringify(r).includes(token)));

    const val = await h("reset_validar", "", { token });
    assert.equal(val.ok, true);
    assert.equal(val.usuario, "ana");
    const bad = await h("reset_aplicar", "", { token, password: "NuevaClave1", password2: "otra" });
    assert.equal(bad.error, "Las dos contraseñas no coinciden");
    const ok = await h("reset_aplicar", "", { token, password: "NuevaClave1", password2: "NuevaClave1" });
    assert.equal(ok.ok, true);
    const login = await h("login_pass", "", { usuario: "ana", password: "NuevaClave1" });
    assert.equal(login.ok, true);
    const reused = await h("reset_aplicar", "", { token, password: "OtraClave1x", password2: "OtraClave1x" });
    assert.match(String(reused.error), /no es válido|venció/);
  });

  it("logout revoca la sesión; un token de reseteo vence a los 45 minutos", async () => {
    const { db, h, now } = semilla();
    await h("cred_mia_guardar", "cos", { usuario: "ana", email: "ana@sunsu.test", password: "Facial2026", password2: "Facial2026" });
    const login = await h("login_pass", "", { usuario: "ana", password: "Facial2026" });
    assert.equal(login.ok, true);
    const tok = String(login.token);
    assert.equal((await h("whoami", tok)).ok, true);
    assert.equal((await h("logout", tok)).ok, true);
    assert.equal((db.tables.get("sesiones") || []).some((s) => s.token === tok), false);

    const adminReset = await h("cred_enviar_reset", "adm", { usuario_id: "u-ana" });
    const token = String(adminReset.enlace).split("#/reset/")[1];
    now.v = new Date(now.v.getTime() + (RESET_MIN + 1) * 60000);
    const late = await h("reset_validar", "", { token });
    assert.equal(late.ok, false);
    assert.ok(nuevoTokenReset().length >= 32);
  });
});
