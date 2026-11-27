import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./ventas_api.ts";
import "./clientes_beta_api.ts";
import type { Row } from "./domain.ts";

const CONTACTO_RE = /0998887777|monica@test|Quito Norte/i;
const CACHE = "sunsu-2026-11-27-VOUCHER";

function sesion() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "rec", uid: "caja", rol: "recepcion", name: "Caja Recepción", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "andrea", rol: "cosmetologa", name: "Andrea Robles", exp: "2099-01-01T00:00:00.000Z" },
    { token: "vis", uid: "visor", rol: "visor", name: "Skin Analysis", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "caja", nombre: "Caja Recepción", short: "Caja", rol: "recepcion", bloqueado: false },
    { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
    { id: "visor", nombre: "Skin Analysis", short: "Visor", rol: "visor", bloqueado: false, pin_desactivado: true },
  ]);
  // Clienta nueva (como Monica Alatorre): registro completo, cero tickets.
  db.tables.set("clientas_registro", [
    {
      id: 535884, sheet_row: -1687, timestamp: "2026-11-24T14:38:12Z",
      cedula: "1713332912", nombre: "Monica", apellido: "Alatorre",
      tipo_de_piel: "Mixta", alergias: "Polvo y pelo gatos, caballo y conejo",
      medicacion: "Ninguna", condiciones_medicas_o_dermatologicas_que_debamos_saber: "Eczema",
      autoriza_fotos: "NO", apruebo_consentimiento_individual: "SI — 24/11/2026 09:38",
      fecha_de_nacimiento: "1990-08-30",
      telefono: "0998887777", email: "monica@test.com", sector_donde_vive: "Quito Norte",
    },
    {
      id: 2, sheet_row: 91, timestamp: "2026-03-02T15:00:00Z",
      cedula: "1700000099", nombre: "Lucía", apellido: "Mora", tipo_de_piel: "Seca",
    },
  ]);
  db.tables.set("tickets", [
    { id: 1, sheet_row: 10, so_num: "TK-SO-1", timestamp: "2026-11-01T15:00:00Z", atendido_por: "Andrea Robles", nombre: "Lucía", apellido: "Mora", id_3: "1700000099", facial_hecho: "SUNSU-01", estimado: 80 },
  ]);
  db.tables.set("beta_clientes", [
    { key: "c:1713332912", codigo: "C-B00004", nombre: "Monica Alatorre", cedula: "1713332912", origen: "registro", borrado: false },
  ]);
  for (const t of ["catalogo", "erp_productos", "beta_tickets", "beta_ticket_lineas", "solicitudes_cambio", "app_modulos", "gift_cards", "paquetes", "beta_cliente_documentos"]) {
    if (!db.tables.get(t)) db.tables.set(t, []);
  }
  const c = { db, now: new Date("2026-11-24T15:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}

describe("TK218 verificar registro sin visitas", () => {
  it("cache de la app queda en TK218", () => {
    const html = fs.readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    const sw = fs.readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
    assert.match(html, new RegExp('SUNSU_CACHE = "' + CACHE + '"'));
    assert.match(sw, new RegExp('CACHE = "' + CACHE + '"'));
    assert.match(html, /Registro completo/);
    assert.match(html, /Falta registro/);
    const mc = fs.readFileSync(new URL("../../../mc-clientes.js", import.meta.url), "utf8");
    assert.match(mc, /Registro completo/);
    assert.match(mc, /Falta registro/);
    assert.match(mc, /badgeReg/);
    new Function(mc);
  });

  it("recepción abre una clienta nueva (sin tickets) y ve el registro, no el error de visitas ni el contacto", async () => {
    const { h } = sesion();
    const det = await h("cliente_detalle", "rec", { key: "c:1713332912" });
    assert.equal(det.ok, true, String(det.error));
    assert.equal(det.error, undefined);
    const c = det.cliente as Row;
    assert.equal(c.nombre, "Monica Alatorre");
    assert.equal(c.cedula, "1713332912");
    assert.equal(c.tipoPiel, "Mixta");
    assert.equal(c.alergias, "Polvo y pelo gatos, caballo y conejo");
    assert.equal(c.condiciones, "Eczema");
    assert.equal(c.autorizaFotos, "NO");
    assert.match(String(c.consentimiento), /SI/);
    assert.equal(c.nacimiento, "1990-08-30");
    assert.equal(c.fechaRegistro, "2026-11-24");
    assert.equal(c.registroEstado, "completo");
    assert.equal((det.tickets as Row[]).length, 0);
    assert.equal(c.telefono, undefined);
    assert.equal(c.email, undefined);
    assert.equal(c.sector, undefined);
    assert.doesNotMatch(JSON.stringify(det), CONTACTO_RE);
  });

  it("visor y cosmetóloga ven el mismo registro por cl_get y cliente_detalle, sin contacto", async () => {
    const { h } = sesion();
    for (const tok of ["vis", "cos"]) {
      const det = await h("cliente_detalle", tok, { key: "c:1713332912" });
      assert.equal(det.ok, true, tok + " detalle: " + det.error);
      assert.equal((det.cliente as Row).registroEstado, "completo");
      assert.equal((det.cliente as Row).telefono, undefined);
      assert.doesNotMatch(JSON.stringify(det), CONTACTO_RE);

      const f = await h("cl_get", tok, { key: "c:1713332912" });
      assert.equal(f.ok, true, tok + " cl_get: " + f.error);
      assert.equal(f.registroEstado, "completo");
      assert.equal(f.fechaRegistro, "2026-11-24");
      const datos = (f.datos || {}) as Row;
      assert.equal(datos.cedula, "1713332912");
      assert.equal(datos.tipoPiel, "Mixta");
      assert.equal(datos.alergias, "Polvo y pelo gatos, caballo y conejo");
      assert.match(String(datos.consentimiento), /SI/);
      assert.equal(datos.registrada, "2026-11-24");
      assert.equal(datos.telefono, undefined);
      assert.equal(datos.email, undefined);
      assert.equal(datos.sector, undefined);
      assert.doesNotMatch(JSON.stringify(f), CONTACTO_RE);
    }
    const vis = await h("cl_get", "vis", { key: "c:1713332912" });
    assert.equal(vis.soloLectura, true);
    assert.equal((vis.historial as Row[]).length, 0);
  });

  it("con clientes=propio y cero visitas propias igual se ve el registro (ya no el error de tickets)", async () => {
    const { db, h } = sesion();
    db.tables.set("app_modulos", [
      { rol: "cosmetologa", modulo: "clientes", acceso: "propio" },
    ]);
    const det = await h("cliente_detalle", "cos", { key: "c:1713332912" });
    assert.equal(det.ok, true, String(det.error));
    assert.equal((det.cliente as Row).registroEstado, "completo");
    assert.equal((det.cliente as Row).tipoPiel, "Mixta");
    assert.equal((det.tickets as Row[]).length, 0);
    const f = await h("cl_get", "cos", { key: "c:1713332912" });
    assert.equal(f.ok, true, String(f.error));
    assert.equal(f.registroEstado, "completo");
    assert.equal(((f.datos || {}) as Row).alergias, "Polvo y pelo gatos, caballo y conejo");
  });

  it("una clienta solo de tickets, sin formulario, queda como Falta registro; una clave inexistente sigue en error", async () => {
    const { db, h } = sesion();
    db.tables.set("tickets", [
      ...(db.tables.get("tickets") || []),
      { id: 9, sheet_row: 99, so_num: "TK-SO-9", timestamp: "2026-11-20T15:00:00Z", atendido_por: "Andrea Robles", nombre: "Ana", apellido: "Sol", id_3: "1710000111", estimado: 40 },
    ]);
    const det = await h("cliente_detalle", "rec", { key: "c:1710000111" });
    assert.equal(det.ok, true, String(det.error));
    assert.equal((det.cliente as Row).registroEstado, "falta");
    assert.equal((det.cliente as Row).nombre, "Ana Sol");
    const f = await h("cl_get", "vis", { key: "c:1710000111" });
    assert.equal(f.ok, true, String(f.error));
    assert.equal(f.registroEstado, "falta");

    const miss = await h("cliente_detalle", "rec", { key: "c:1999999999" });
    assert.match(String(miss.error), /No hay visitas de esa clienta en tus tickets/);
  });

  it("admin sigue viendo teléfono y el registro completo", async () => {
    const { h } = sesion();
    const det = await h("cliente_detalle", "adm", { key: "c:1713332912" });
    assert.equal(det.ok, true, String(det.error));
    assert.match(String((det.cliente as Row).telefono), /888\s*7777|0998887777/);
    assert.equal((det.cliente as Row).registroEstado, "completo");
    const f = await h("cl_get", "adm", { key: "c:1713332912" });
    assert.match(String(((f.datos || {}) as Row).telefono), /888\s*7777|0998887777/);
    assert.equal(f.registroEstado, "completo");
  });
});
