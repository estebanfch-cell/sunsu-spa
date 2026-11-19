import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./clientes_beta_api.ts";
import "./productos_api.ts";
import "./productos_paridad_api.ts";
import "./usuario_permisos_api.ts";
import "./priv_permisos_api.ts";
import type { Row } from "./domain.ts";
import { acceso, flagsDeRol, matrizDe, PRIV_FLAGS } from "./permisos.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "emi", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "andrea", rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", exp: "2099-01-01T00:00:00.000Z" },
    { token: "rec", uid: "ale", rol: "recepcion", name: "Alejandra Rodriguez", short: "Alejandra", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "emi", nombre: "Emilia", short: "Emi", rol: "admin" },
    { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa" },
    { id: "ale", nombre: "Alejandra Rodriguez", short: "Ale", rol: "recepcion" },
  ]);
  db.tables.set("clientas_registro", [
    { id: 1, sheet_row: 90, timestamp: "2026-03-02T15:00:00Z", cedula: "1700000001", nombre: "María", apellido: "Banda", tipo_de_piel: "Mixta", telefono: "0991111111", email: "maria@test.com", sector_donde_vive: "Cumbayá" },
  ]);
  db.tables.set("tickets", [
    { id: 1, sheet_row: 10, so_num: "TK-SO-1", timestamp: "2026-11-01T15:00:00Z", atendido_por: "Andrea Robles", nombre: "María", apellido: "Banda", id_3: "1700000001", facial_hecho: "SUNSU-57 Facial K-Lift", estimado: 95 },
    { id: 2, sheet_row: 11, timestamp: "2026-11-10T15:00:00Z", atendido_por: "Otra", nombre: "Lucía", apellido: "Mora", id_3: "1700000002", facial_hecho: "SUNSU-40 Facial Reset", estimado: 46 },
  ]);
  db.tables.set("erp_productos", [{ id: "p1", sku: "SUNSU-01", nombre: "Serum", beta_pvp: 20, beta_compra_real: 8, beta_archivos: [{ id: "a1", nombre: "f.pdf", mime: "application/pdf" }] }]);
  db.tables.set("app_archivos", [{ id: "a1", nombre: "f.pdf", mime: "application/pdf", data_b64: "AAA" }]);
  for (const t of ["catalogo", "cabina_inventario", "erp_bodegas", "erp_stock", "inventario_base", "beta_clientes", "beta_tickets", "gift_cards", "paquetes", "app_modulos", "app_usuario_permisos", "app_perfiles_permiso", "cosmetologas", "solicitudes_cambio"]) {
    if (!db.tables.has(t)) db.tables.set(t, []);
  }
  db.rpcImpl = async (name, a) => {
    if (name === "app_usuario_permiso_guardar") {
      const rows = (db.tables.get("app_usuario_permisos") || []).filter((r) => r.uid !== a.p_uid);
      const row = { uid: a.p_uid, perfil: a.p_perfil, niveles: a.p_niveles, alcance: a.p_alcance, flags: a.p_flags, actualizado_por: a.p_actor };
      db.tables.set("app_usuario_permisos", rows.concat([row]));
      return row;
    }
    return null;
  };
  const c = { db, now: new Date("2026-11-18T18:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}

describe("TK73 permisos por rol/usuario (privacidad)", () => {
  it("por defecto el personal no tiene teléfonos, emails, sector, costos ni descargas; recepción sí ve todos los tickets", () => {
    const cos = flagsDeRol("cosmetologa");
    assert.equal(cos.telefonos, false);
    assert.equal(cos.emails, false);
    assert.equal(cos.sector, false);
    assert.equal(cos.costos, false);
    assert.equal(cos.descargas, false);
    assert.equal(cos.tickets_todos, false);
    assert.equal(flagsDeRol("recepcion").tickets_todos, true);
    assert.equal(flagsDeRol("admin").telefonos, true);
  });

  it("solo un admin abre y cambia la pantalla; el personal no", async () => {
    const { h } = semilla();
    assert.match(String((await h("cfg_priv_get", "cos")).error), /administración/i);
    assert.match(String((await h("cfg_priv_guardar", "cos", { ambito: "rol", rol: "cosmetologa", flag: "telefonos", valor: true })).error), /administración/i);
    const g = await h("cfg_priv_get", "adm");
    assert.equal(g.ok, true, String(g.error));
    const ids = (g.flags as Row[]).map((f) => f.id);
    assert.deepEqual(ids, PRIV_FLAGS.map((f) => f.id));
    const cos = (g.roles as Row[]).find((r) => r.rol === "cosmetologa") as Row;
    assert.equal((cos.flags as Row).telefonos, false);
    const rec = (g.roles as Row[]).find((r) => r.rol === "recepcion") as Row;
    assert.equal((rec.flags as Row).tickets_todos, true);
    assert.ok((g.usuarios as Row[]).some((u) => u.uid === "andrea"));
    assert.ok(!(g.usuarios as Row[]).some((u) => u.uid === "emi"));
  });

  it("soltar teléfonos al rol cosmetóloga deja ver el teléfono, no el email ni el sector", async () => {
    const { h } = semilla();
    const sav = await h("cfg_priv_guardar", "adm", { ambito: "rol", rol: "cosmetologa", flag: "telefonos", valor: true });
    assert.equal(sav.ok, true, String(sav.error));
    const l = await h("cl_list", "cos");
    assert.equal(l.ok, true, String(l.error));
    const m = (l.clientes as Row[]).find((c) => String(c.cedula).includes("1700000001") || String(c.key) === "c:1700000001")!;
    assert.ok(m, "faltó la clienta");
    assert.ok(String(m.telefono || "").includes("99"), String(m.telefono));
    assert.equal(m.email, undefined);
    assert.equal(m.sector, undefined);
    assert.deepEqual(l.sectores, []);
    assert.equal(l.puedeDescargar, false);
    const f = await h("cl_get", "cos", { key: m.key || "c:1700000001" });
    assert.equal(f.ok, true, String(f.error));
    assert.ok(String((f.datos as Row).telefono || "").includes("99"));
    assert.equal((f.datos as Row).email, undefined);
    assert.equal((f.datos as Row).sector, undefined);
  });

  it("soltar descargas a una persona deja puedeDescargar y abre el archivo; el resto del rol sigue bloqueado", async () => {
    const { h } = semilla();
    const sav = await h("cfg_priv_guardar", "adm", { ambito: "usuario", uid: "andrea", flag: "descargas", valor: true });
    assert.equal(sav.ok, true, String(sav.error));
    assert.equal(sav.origen, "usuario");
    const lista = await h("mcprod_list", "cos");
    assert.equal(lista.puedeDescargar, true, String(lista.error));
    const arch = await h("mcprod_archivo", "cos", { id: "p1", archivo_id: "a1" });
    assert.equal(arch.ok, true, String(arch.error));
    const who = await h("whoami", "rec");
    const mods = (who.modulos as Row[]).map((m) => m.modulo);
    assert.ok(!mods.includes("descargas"));
  });

  it("ver todos los tickets se puede soltar al rol; apagarlo en recepción lo deja en propio, no lo cierra", async () => {
    const { db, h } = semilla();
    const on = await h("cfg_priv_guardar", "adm", { ambito: "rol", rol: "cosmetologa", flag: "tickets_todos", valor: true });
    assert.equal(on.ok, true, String(on.error));
    assert.equal(acceso("cosmetologa", "tickets", await matrizDe(db)), "todos");
    const off = await h("cfg_priv_guardar", "adm", { ambito: "rol", rol: "recepcion", flag: "tickets_todos", valor: false });
    assert.equal(off.ok, true, String(off.error));
    assert.equal(acceso("recepcion", "tickets", await matrizDe(db)), "propio");
  });

  it("la pantalla vive en Configuración general y el menú admin la nombra", () => {
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    const nav = readFileSync(new URL("../../../mc-nav.js", import.meta.url), "utf8");
    assert.match(beta, /id="cfg-permisos"/);
    assert.match(beta, /Permisos por rol y usuario/);
    assert.match(beta, /cfg_priv_get/);
    assert.match(beta, /cfg_priv_guardar/);
    assert.match(nav, /Permisos por rol\/usuario/);
    assert.match(beta, /20261119tk148/);  });});
