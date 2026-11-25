import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import { gateAccion } from "./permisos.ts";
import type { Row } from "./domain.ts";

const CTX = {
  now: new Date("2026-11-23T16:48:00Z"),
  env: {} as Record<string, string | undefined>,
  fetchImpl: fetch,
  legacyLogin: async () => ({}),
};

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
  ]);
  db.tables.set("clientas_registro", [
    { id: 1, sheet_row: 10, timestamp: "2026-01-10T15:00:00Z", cedula: "1716768062", nombre: "Ana", apellido: "Previa" },
    { id: 2, sheet_row: 11, cedula: "1700000002", nombre: "Lucía", apellido: "Mora" }, // base antigua, sin timestamp
  ]);
  db.tables.set("app_modulos", []);
  db.tables.set("tickets", []);
  const ctx = { ...CTX, db };
  const h = (a: string, p: Row = {}) => handle(a, p, ctx) as Promise<Row>;
  return { db, h };
}

const ALTA: Row = {
  cedula: "TK214TEST99",
  tipo_identificacion: "pasaporte",
  nombre: "Testborrar",
  apellido: "Tk214",
  nacimiento: "1990-01-15",
  sector: "Cumbayá",
  telefono: "+593999000111",
  tipoPiel: "Mixta",
  estado: "Estable",
  alergias: "Ninguna",
  medicacion: "Ninguna",
  condiciones: "Ninguna",
  reacciones: "Ninguno",
  retinoides: "Ninguno",
  ciclo: "NO APLICA",
  extracciones: "NO",
  cortesia: "Masaje Capilar",
  autorizaFotos: "SI, autorizo",
  consentimiento: "SI",
  firma: "Testborrar Tk214",
};

describe("TK214 · registro público de clientas a Supabase", () => {
  it("el enlace público no pide sesión para consultar o enviar el registro", () => {
    assert.equal(gateAccion("existeCedula", null, {}), null);
    assert.equal(gateAccion("registro_publico", null, {}), null);
    assert.deepEqual(gateAccion("registrarCliente", null, {}), { error: "Inicia sesión" });
    assert.deepEqual(gateAccion("cl_list", null, {}), { error: "Inicia sesión" });
  });

  it("existeCedula sin token mira clientas_registro (no la hoja)", async () => {
    const { h } = semilla();
    const no = await h("existeCedula", { ced: "TK214TEST99" });
    assert.equal(no.existe, false);
    const si = await h("existeCedula", { ced: "1716768062" });
    assert.equal(si.existe, true);
    assert.equal(si.nombre, "Ana");
    assert.equal("telefono" in si, false);
    const comp = await h("existeCedula", { ced: "1700000002" });
    assert.equal(comp.existe, false);
    assert.equal(comp.completar, true);
    assert.equal(comp.nombre, "Lucía");
  });

  it("registro_publico crea la fila en clientas_registro, con los campos de la tarjeta y sin devolver teléfono", async () => {
    const { db, h } = semilla();
    const r = await h("registro_publico", ALTA);
    assert.equal(r.ok, true, String(r.error));
    assert.ok(r.fila);
    assert.equal("telefono" in r, false);
    const rows = db.tables.get("clientas_registro") as Row[];
    const nueva = rows.find((x) => String(x.cedula) === "TK214TEST99");
    assert.ok(nueva);
    assert.equal(nueva!.nombre, "Testborrar");
    assert.equal(nueva!.apellido, "Tk214");
    assert.equal(nueva!.telefono, "+593999000111");
    assert.equal(nueva!.sector_donde_vive, "Cumbayá");
    assert.equal(nueva!.fecha_de_nacimiento, "1990-01-15");
    assert.equal(nueva!.tipo_de_piel, "Mixta");
    assert.equal(nueva!.autoriza_fotos, "SI");
    assert.equal(nueva!.firma, "Testborrar Tk214");
    assert.equal(nueva!.cortesia_complementaria, "Masaje Capilar");
    assert.match(String(nueva!.apruebo_consentimiento_individual), /^SI — /);
    assert.equal((nueva!.orig as Row).fuente, "registro.html");
  });

  it("acepta la fecha mm/dd/aaaa que mandaba el formulario viejo", async () => {
    const { db, h } = semilla();
    const r = await h("registro_publico", { ...ALTA, cedula: "TK214TEST88", nacimiento: "01/15/1990" });
    assert.equal(r.ok, true, String(r.error));
    const nueva = (db.tables.get("clientas_registro") as Row[]).find((x) => String(x.cedula) === "TK214TEST88");
    assert.equal(nueva!.fecha_de_nacimiento, "1990-01-15");
  });

  it("si ya está registrada no la pisa, aunque manden forzar; una ficha antigua sí se puede completar", async () => {
    const { db, h } = semilla();
    const ya = await h("registro_publico", { ...ALTA, cedula: "1716768062", tipo_identificacion: "cedula", forzar: "actualizar", nombre: "Otra" });
    assert.equal(ya.existe, true);
    assert.equal(ya.ok, undefined);
    const previa = (db.tables.get("clientas_registro") as Row[]).find((x) => String(x.sheet_row) === "10");
    assert.equal(previa!.nombre, "Ana");

    const comp = await h("registro_publico", { ...ALTA, cedula: "1700000002", tipo_identificacion: "pasaporte", nombre: "Lucía", apellido: "Mora" });
    assert.equal(comp.ok, true, String(comp.error));
    assert.equal(comp.actualizada, true);
    const fila = (db.tables.get("clientas_registro") as Row[]).find((x) => String(x.sheet_row) === "11");
    assert.ok(fila!.timestamp);
    assert.equal(fila!.sector_donde_vive, "Cumbayá");
  });

  it("pide los campos obligatorios y no acepta una cédula inválida", async () => {
    const { h } = semilla();
    const falta = await h("registro_publico", { cedula: "TK214TEST77", tipo_identificacion: "pasaporte", nombre: "A" });
    assert.match(String(falta.error), /apellido|completa/i);
    const mal = await h("registro_publico", { ...ALTA, cedula: "1234567890", tipo_identificacion: "cedula" });
    assert.ok(mal.error);
  });

  it("registrarCliente del staff sigue exigiendo sesión", async () => {
    const { h } = semilla();
    const no = await h("registrarCliente", ALTA);
    assert.equal(no.error, "Inicia sesión");
  });

  it("registro.html apunta a la función api, no al Apps Script", () => {
    const html = readFileSync(new URL("../../../registro.html", import.meta.url), "utf8");
    assert.match(html, /heuolwxyxoezkewyufrl\.supabase\.co\/functions\/v1\/api/);
    assert.match(html, /accion:'registro_publico'/);
    assert.match(html, /accion:'existeCedula'/);
    assert.doesNotMatch(html, /script\.google\.com/);
    assert.doesNotMatch(html, /APPS_SCRIPT_URL/);
    assert.doesNotMatch(html, /registrarCliente/);
  });

  it("el cache quedó en TK214", () => {
    const idx = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    const sw = readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
    assert.match(idx, /window\.SUNSU_CACHE = "sunsu-2026-11-25-DEV34B"/);
    assert.match(sw, /const CACHE = "sunsu-2026-11-25-DEV34B"/);
  });
});
