import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./asistencia_api.ts";
import { instanteEcuador } from "./asistencia.ts";
import type { Row } from "./domain.ts";

function setup(uploadOk = true) {
  const db = new MemoryDb();
  db.tables.set("sesiones", [{ token: "t-dani", uid: "dani", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "dani", nombre: "Daniela Mora", short: "Daniela", rol: "cosmetologa", bloqueado: false }]);
  db.tables.set("rrhh_empleadas", [{ sheet_row: 2, nombre_app: "Daniela", fecha_ingreso: "2025-05-01", sueldo_base: 482 }]);
  db.tables.set("asistencia_config", [{ id: 1, lat: -0.18, lng: -78.47, radio_m: 50, hora_entrada: "09:30", hora_salida: "18:30", jornada_horas: 8, gracia_min: 5 }]);
  const ctx = {
    db, now: new Date(instanteEcuador("2026-11-20", "09:29")),
    env: { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" },
    fetchImpl: (async () => uploadOk ? new Response(JSON.stringify({ Key: "ok" }), { status: 200 }) : new Response("no", { status: 500 })) as typeof fetch,
    legacyLogin: async () => ({ ok: false }),
  };
  return { db, ctx };
}
const pos = { lat: -0.18, lng: -78.47, precision_m: 10 };

describe("TK175 la marca nunca se pierde por la selfie", () => {
  it("una foto de más de 1.5 MB guarda la marca sin foto y lo deja en la auditoría", async () => {
    const { db, ctx } = setup();
    const grande = "data:image/jpeg;base64," + btoa("x".repeat(1_600_000));
    const r = await handle("asis_marcar", { token: "t-dani", tipo: "entrada", ...pos, foto: grande }, ctx) as Row;
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.sinFoto, true);
    const m = (db.tables.get("asistencia_marcajes") || [])[0];
    assert.equal(m.tipo, "entrada");
    assert.equal(m.foto, null);
    const aud = (db.tables.get("asistencia_auditoria") || []).find((a) => a.accion === "selfie_omitida")!;
    assert.match(String(aud.motivo), /1\.5 MB/);
  });

  it("HEIC del iPhone o subida caída: la marca se guarda igual", async () => {
    const a = setup();
    const heic = await handle("asis_marcar", { token: "t-dani", tipo: "entrada", ...pos, foto: "data:image/heic;base64,AAAAGGZ0eXBoZWlj" }, a.ctx) as Row;
    assert.equal(heic.ok, true, String(heic.error));
    const b = setup(false);
    const caida = await handle("asis_marcar", { token: "t-dani", tipo: "entrada", ...pos, foto: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAg=" }, b.ctx) as Row;
    assert.equal(caida.ok, true, String(caida.error));
    assert.equal(caida.sinFoto, true);
  });

  it("sin selfie o fuera del radio sigue sin marcar", async () => {
    const { ctx } = setup();
    assert.match(String((await handle("asis_marcar", { token: "t-dani", tipo: "entrada", ...pos }, ctx) as Row).error), /selfie/);
    assert.ok((await handle("asis_marcar", { token: "t-dani", tipo: "entrada", lat: 0, lng: 0, precision_m: 10, foto: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAg=" }, ctx) as Row).error);
  });

  it("front: la selfie se achica a 800 px JPEG antes de subir y el error de marca se muestra", () => {
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    assert.match(html, /function selfieComprimida\(/);
    assert.match(html, /const max = 800;/);
    assert.match(html, /selfieDesdeArchivo\(file\)/);
    assert.match(html, /No se registró la marca: /);
  });
});
