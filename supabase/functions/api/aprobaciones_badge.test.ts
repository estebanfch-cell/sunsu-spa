import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./inline_api.ts";
import "./aprobaciones_api.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(join(root, "beta.html"), "utf8");
const nav = readFileSync(join(root, "mc-nav.js"), "utf8");
const sw = readFileSync(join(root, "sw.js"), "utf8");

function ctx(db: MemoryDb, now = "2026-11-18T19:40:00Z") {
  return { db, now: new Date(now), env: {}, fetchImpl: fetch, token: "", legacyLogin: async () => ({}) };
}

describe("TK85 badge de Aprobaciones en el dashboard", () => {
  it("el dashboard enciende el botón con el conteo y abre la lista", () => {
    assert.match(html, /class="apr-btn/);
    assert.match(html, /aprobaciones_pendientes/);
    assert.match(html, /async function renderAprobaciones\(/);
    assert.match(html, /data-go="#\/m\/aprobaciones"/);
    assert.match(nav, /#\/m\/aprobaciones/);
    assert.match(sw, /sunsu-beta-2026-11-19-TK140/);
    assert.doesNotMatch(sw, /sunsu-beta-2026-11-19-TK133/);  });
  it("suma solicitudes, borradores, permisos y ajustes, y no expone cédulas ni teléfonos", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [
      { token: "t-emi", uid: "emi", rol: "super_admin", exp: "2099-01-01T00:00:00.000Z" },
      { token: "t-and", uid: "and", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
    ]);
    db.tables.set("usuarios", [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "super_admin", bloqueado: false },
      { id: "and", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
    ]);
    db.tables.set("solicitudes_cambio", [
      { id: "s1", estado: "pendiente", solicitante: "Andrea Robles", etiqueta: "Cambiar hora del ticket", tabla: "tickets", creado: "2026-11-18T12:00:00Z" },
      { id: "s0", estado: "aprobado", solicitante: "Andrea Robles", etiqueta: "Ya resuelto", creado: "2026-11-17T12:00:00Z" },
    ]);
    db.tables.set("beta_migo_borradores", [
      { factura: "000002971", estado: "asignado", cliente: "Lucía Pérez", asignado_a: "Andrea Robles", fecha: "2026-11-18", total: 40, datos: { completado_at: "2026-11-18T15:00:00-05:00" }, ticket_clave: null, ticket_id: null },
      { factura: "000002972", estado: "pendiente", cliente: "Marta", asignado_a: "", fecha: "2026-11-18", total: 20, datos: {}, ticket_clave: null },
    ]);
    db.tables.set("permisos", [
      { id: "p1", empleada: "Andrea Robles", tipo: "VACACIONES", estado: "PENDIENTE", desde: "2026-11-23", hasta: "2026-11-24" },
      { id: "p2", empleada: "Andrea Robles", tipo: "PERSONAL", estado: "APROBADO", desde: "2026-11-10", hasta: "2026-11-10" },
    ]);
    db.tables.set("beta_ajustes", [
      { id: "a1", numero: "AJ-1", estado: "pendiente", motivo: "Merma", bodega: "Bodega", creado_por: "Emi", creado_at: "2026-11-18T10:00:00Z" },
    ]);
    const c = ctx(db);
    const no = await handle("aprobaciones_pendientes", { token: "t-and" }, c) as { error?: string };
    assert.match(String(no.error), /Solo administración/);
    const ok = await handle("aprobaciones_pendientes", { token: "t-emi" }, c) as {
      ok?: boolean; total?: number;
      grupos?: { id: string; n: number; items: Record<string, unknown>[] }[];
    };
    assert.equal(ok.ok, true);
    assert.equal(ok.total, 5);
    const por = Object.fromEntries((ok.grupos || []).map((g) => [g.id, g]));
    assert.equal(por.solicitudes?.n, 1);
    assert.equal(por.borradores?.n, 2);
    assert.equal(por.permisos?.n, 1);
    assert.equal(por.ajustes?.n, 1);
    const blob = JSON.stringify(ok);
    assert.doesNotMatch(blob, /cedula|cédula|telefono|teléfono|email|correo/i);
    assert.match(String(por.solicitudes?.items[0]?.titulo), /Andrea Robles/);
    assert.match(String(por.borradores?.items[0]?.titulo), /por aprobar|Por completar|Sin asignar/i);
    assert.equal(por.borradores?.href, "#/m/borradores");
    assert.equal(por.borradores?.items[0]?.href, "#/m/borradores");
    assert.doesNotMatch(JSON.stringify(por.borradores), /#\/m\/tickets/);
  });
});
