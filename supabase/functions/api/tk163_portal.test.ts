import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./credenciales_api.ts";
import "./clientes_beta_api.ts";
import "./portal_api.ts";
import type { Row } from "./domain.ts";
import { cedulaEcValida, decidirVinculo, favoritosDe, limpiarPerfil, portalLimpio, resumenVentas, validarIdentificacion } from "./portal_core.ts";
import { DATOS_TK } from "./tickets_beta_api.ts";

// Cédulas de prueba con dígito verificador válido.
const CED_A = "1710034065", CED_B = "0926687856";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("app_usuarios", [{ id: "admin", name: "Emilia", short: "Emi", role: "admin", activo: true }]);
  db.tables.set("clientas_registro", [
    { sheet_row: 297, timestamp: "2026-05-01T10:00:00", cedula: CED_A, nombre: "Prueba", apellido: "Existente", telefono: "0991234567" },
  ]);
  db.tables.set("proveedores", [
    { sheet_row: 2, nombre: "Proveedor Uno", ruc: "1793161898001.0", email: "ventas@uno.test", familia: "HT" },
    { sheet_row: 3, nombre: "Proveedor Dos", ruc: "1793200552001.0", email: "", familia: "PH" },
  ]);
  db.tables.set("erp_proveedores", [
    { id: "p-uno", nombre: "Proveedor Uno", ruc: "1793161898001.0", activo: true, legacy_sheet_row: 2 },
    { id: "p-dos", nombre: "Proveedor Dos", ruc: "1793200552001.0", activo: true, legacy_sheet_row: 3 },
  ]);
  db.tables.set("erp_productos", [
    { id: "x1", sku: "HT-001", nombre: "Sérum Uno", activo: true, costo_promedio: 9 },
    { id: "x2", sku: "PH-001", nombre: "Crema Dos", activo: true, costo_promedio: 7 },
  ]);
  for (const t of ["beta_credenciales", "log_acciones", "login_intentos", "beta_portal_cuentas", "beta_portal_sesiones", "beta_portal_propuestas", "beta_clientes", "tickets", "beta_tickets", "paquetes", "gift_cards", "catalogo", "erp_oc", "erp_oc_lineas", "beta_actas", "beta_consig_restock", "app_kv"]) if (!db.tables.has(t)) db.tables.set(t, []);
  const now = new Date("2026-11-20T15:00:00Z");
  const h = (a: string, p: Row = {}) => handle(a, p, { db, now, env: {}, fetchImpl: fetch, legacyLogin: async () => ({}) } as never) as Promise<Row>;
  return { db, h };
}
const base = { password: "Sunsu2026x", password2: "Sunsu2026x", acepta: true };

describe("TK163 · reglas del portal", () => {
  it("valida cédula, RUC y pasaporte", () => {
    assert.ok(cedulaEcValida(CED_A)); assert.ok(cedulaEcValida(CED_B)); assert.ok(!cedulaEcValida("1710034066"));
    assert.equal(validarIdentificacion(CED_A), null);
    assert.ok(validarIdentificacion("1793161898001"));
    assert.equal(validarIdentificacion("1793161898001", true), null);
    assert.equal(validarIdentificacion("AB123456"), null);
  });
  it("solo se ata sola con cédula + (correo o teléfono)", () => {
    assert.equal(decidirVinculo({ cedula: CED_A, email: "x@y.z", telefono: "0991234567" }, { cedula: CED_A, emails: [], telefonos: ["+593 99 123 4567"] }).auto, true);
    assert.equal(decidirVinculo({ cedula: CED_A, email: "x@y.z", telefono: "0980000000" }, { cedula: CED_A, emails: ["otra@y.z"], telefonos: ["0991234567"] }).auto, false);
    assert.equal(decidirVinculo({ cedula: CED_A, email: "a@b.c", telefono: "" }, null).vinculo, "nuevo");
  });
  it("perfil: cédula y notas del equipo no se editan", () => {
    const r = limpiarPerfil({ cedula: "999", notas: "x", telefono: "0991112222", preferencias: "mañanas" });
    assert.deepEqual(Object.keys(r.limpio).sort(), ["preferencias", "telefono"]);
  });
  it("red de privacidad bloquea costos y comisiones", () => {
    assert.equal(portalLimpio({ productos: [{ costo: 1 }] }), false);
    assert.equal(portalLimpio({ comision: 1 }), false);
    assert.equal(portalLimpio({ ok: true, precio: 3 }), true);
  });
  it("favoritos y ventas por día/mes/año", () => {
    const f = favoritosDe([{ fecha: "2026-10-01", facial: "SOS", detalle: [{ sku: "HT-001", nombre: "Sérum", cantidad: 1 }] }, { fecha: "2026-11-01", facial: "SOS", detalle: [] }], (s) => /^HT-/.test(s));
    assert.equal((f.facial as Row).nombre, "SOS"); assert.equal(f.cadaDias, 31); assert.equal((f.producto as Row).sku, "HT-001");
    const v = resumenVentas([{ fecha: "2026-11-20", sku: "HT-001", qty: 2 }, { fecha: "2026-11-02", sku: "HT-001", qty: 1 }, { fecha: "2026-01-02", sku: "HT-001", qty: 1 }], "2026-11-20", () => 5);
    assert.deepEqual([(v.hoy as Row).unidades, (v.mes as Row).unidades, (v.anio as Row).unidades, (v.anio as Row).monto], [2, 3, 4, 20]);
  });
  it("el ticket tiene «Tratamiento recomendado»", () => { assert.ok(DATOS_TK.some(([k]) => k === "retornoTrat")); });
});

describe("TK163 · cuentas de la app", () => {
  it("clienta nueva: crea ficha con código propio y entra con correo (login_pass)", async () => {
    const { db, h } = semilla();
    const r = await h("portal_signup_cliente", { ...base, nombre: "Ana Nueva Prueba", cedula: CED_B, email: "ana@test.ec", telefono: "0987654321" });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.estado, "activa");
    const c = (await db.all("beta_portal_cuentas"))[0];
    assert.equal(c.cliente_key, "c:" + CED_B.replace(/^0/, "")); assert.match(String(c.cliente_codigo), /^C-\d{5}$/);
    assert.ok(!JSON.stringify(c).includes("Sunsu2026x"));
    const lg = await h("login_pass", { usuario: "ANA@test.ec", password: "Sunsu2026x" });
    assert.equal(lg.portal, true); assert.match(String(lg.token), /^pt_/);
    // Un token de la app nunca abre acciones del equipo…
    assert.equal((await h("cl_list", { token: lg.token })).error, "Inicia sesión");
    // …y el token del equipo no abre el portal.
    assert.equal((await h("portal_cliente", { token: "adm" })).auth_error, true);
    const yo = await h("portal_cliente", { token: lg.token });
    assert.equal(yo.ok, true, JSON.stringify(yo));
  });
  it("cédula existente + teléfono igual → se ata sola; solo cédula → revisión", async () => {
    const { db, h } = semilla();
    const ok = await h("portal_signup_cliente", { ...base, nombre: "Prueba Existente", cedula: CED_A, email: "pe@test.ec", telefono: "+593 99 123 4567" });
    assert.equal(ok.estado, "activa", JSON.stringify(ok));
    assert.equal((await db.all("beta_portal_cuentas"))[0].cliente_codigo, "C-00296");
    // Otra persona con la misma cédula: ya hay cuenta → no.
    assert.match(String((await h("portal_signup_cliente", { ...base, nombre: "Otra", cedula: CED_A, email: "otra@test.ec", telefono: "0980000000" })).error), /Ya existe una cuenta/);
  });
  it("solo cédula igual queda en revisión hasta que un admin apruebe", async () => {
    const { db, h } = semilla();
    const r = await h("portal_signup_cliente", { ...base, nombre: "Impostora", cedula: CED_A, email: "imp@test.ec", telefono: "0980000000" });
    assert.equal(r.estado, "revision");
    assert.equal((await h("login_pass", { usuario: "imp@test.ec", password: "Sunsu2026x" })).revision, true);
    const id = (await db.all("beta_portal_cuentas"))[0].id;
    assert.equal((await h("padm_cuenta_aprobar", { token: "adm", id })).ok, true);
    assert.equal((await h("login_pass", { usuario: "imp@test.ec", password: "Sunsu2026x" })).portal, true);
  });
  it("eliminar cuenta borra solo el acceso; la ficha queda", async () => {
    const { db, h } = semilla();
    await h("portal_signup_cliente", { ...base, nombre: "Ana Nueva", cedula: CED_B, email: "ana@test.ec", telefono: "0987654321" });
    const lg = await h("login_pass", { usuario: "ana@test.ec", password: "Sunsu2026x" });
    assert.equal((await h("portal_eliminar_cuenta", { token: lg.token, password: "mala1234" })).error, "La contraseña no es correcta");
    assert.equal((await h("portal_eliminar_cuenta", { token: lg.token, password: "Sunsu2026x" })).ok, true);
    assert.equal((await db.all("beta_portal_cuentas")).length, 0);
    assert.equal((await db.all("beta_portal_sesiones")).length, 0);
    assert.ok((await db.all("clientas_registro")).some((r) => String(r.cedula) === CED_B.replace(/^0/, "") || String(r.cedula) === CED_B));
  });
  it("proveedor: RUC + correo igual se ata solo; ve solo sus productos y sin costos; propuestas a revisión", async () => {
    const { db, h } = semilla();
    const r = await h("portal_signup_proveedor", { ...base, nombre: "Proveedor Uno", ruc: "1793161898001", email: "ventas@uno.test", telefono: "022345678" });
    assert.equal(r.estado, "activa", JSON.stringify(r));
    const lg = await h("login_pass", { usuario: "ventas@uno.test", password: "Sunsu2026x" });
    const d = await h("portal_proveedor", { token: lg.token });
    assert.equal(d.ok, true, JSON.stringify(d));
    assert.deepEqual((d.productos as Row[]).map((x) => x.sku), ["HT-001"]);
    assert.ok(!JSON.stringify(d).includes("costo"));
    assert.match(String((await h("portal_prov_propuesta", { token: lg.token, tipo: "precio", producto_id: "x2", precio: 5 })).error), /no es tuyo/);
    assert.equal((await h("portal_prov_propuesta", { token: lg.token, tipo: "beneficio", unidades: 20, descuento_pct: 10 })).ok, true);
    assert.equal((await db.all("beta_portal_propuestas"))[0].estado, "pendiente");
    assert.equal((await h("portal_prov_foto", { token: lg.token, id: "x2", foto_b64: "data:image/jpeg;base64,AAAA" })).error, "Ese producto no es tuyo");
  });
  it("proveedor nuevo: crea su ficha con código propio", async () => {
    const { db, h } = semilla();
    const r = await h("portal_signup_proveedor", { ...base, nombre: "Cosmética Nueva", ruc: CED_B, email: "n@nueva.test", telefono: "0987654321" });
    assert.equal(r.ok, true, JSON.stringify(r));
    const c = (await db.all("beta_portal_cuentas"))[0];
    assert.equal(c.vinculo, "nuevo"); assert.ok(c.proveedor_id); assert.ok(c.proveedor_familia);
    assert.equal((await db.all("erp_proveedores")).length, 3);
  });
  it("invitación de proveedor por admin: enlace → contraseña → entra", async () => {
    const { h } = semilla();
    const inv = await h("padm_invitar_proveedor", { token: "adm", proveedor_id: "p-dos", email: "dos@test.ec" });
    assert.equal(inv.ok, true, JSON.stringify(inv));
    const token = String(inv.enlace).split("/").pop();
    assert.equal((await h("portal_clave_validar", { token })).invitacion, true);
    const ok = await h("portal_clave_aplicar", { token, password: "Sunsu2026x", password2: "Sunsu2026x" });
    assert.equal(ok.portal, true, JSON.stringify(ok));
    assert.deepEqual(((await h("portal_proveedor", { token: ok.token })).productos as Row[]).map((x) => x.sku), ["PH-001"]);
  });
});

describe("TK163 frontend: inicio, portal y eliminar cuenta", () => {
  const rd = (f: string) => readFileSync(new URL("../../../" + f, import.meta.url), "utf8");
  it("index carga el portal, el inicio nuevo y deja el PIN como acceso discreto", () => {
    const html = rd("index.html"), sw = rd("sw.js"), pt = rd("mc-portal.js");
    assert.match(html, /<script src="mc-portal\.js\?v=/);
    assert.match(html, /<script src="mc-portal-admin\.js\?v=/);
    assert.match(sw, /"\/mc-portal\.js"/); assert.match(sw, /"\/mc-portal-admin\.js"/);
    assert.match(html, /window\.SunsuPortal\.paintInicio\(msg\)/);
    assert.match(html, /window\.paintLoginPin = /);
    assert.match(html, /window\.sunsuEntrarEquipo = /);
    assert.match(pt, /Personal Sunsu: entrar con PIN/);
    assert.match(pt, /Crear cuenta/);
  });
  it("eliminar cuenta explica que la ficha y documentos se conservan (app y privacidad)", () => {
    assert.match(rd("mc-portal.js"), /Eliminar mi cuenta/);
    assert.match(rd("privacy.html"), /Qué se conserva/);
    assert.match(rd("privacy.html"), /legal, accounting and tax retention/);
  });
});
