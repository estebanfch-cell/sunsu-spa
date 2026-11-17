import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./inline_api.ts";
import "./agenda_api.ts";
import { fichaDeCita, misCalendarios, ticketRevisado } from "./agenda_api.ts";
import { limpiarCacheAcuity } from "./acuity.ts";
import type { Row } from "./domain.ts";

function semilla() {
  limpiarCacheAcuity();
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "and", uid: "u-and", rol: "cosmetologa", name: "Andrea Robles", exp: "2099-01-01T00:00:00.000Z" },
    { token: "asi", uid: "u-asi", rol: "asistente_cosmetologia", name: "Deja", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin" }, { id: "u-and", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa" }, { id: "u-asi", nombre: "Deja", short: "Deja", rol: "asistente_cosmetologia" },
  ]);
  db.tables.set("beta_acuity_calendars", [{ calendar_id: 11689550, nombre: "Andrea", persona: "Andrea Robles", activo: true }, { calendar_id: 12796672, nombre: "Daniela", persona: "Daniela Mora", activo: true }]);
  db.tables.set("beta_citas_ticket", []);
  db.tables.set("app_modulos", []);
  db.tables.set("clientas_registro", [{ cedula: "1700000001", nombre: "María", apellido: "Banda Paz", timestamp: "2026-01-01", tipo_de_piel: "Mixta" }]);
  db.tables.set("tickets", [{ id: 1, sheet_row: 10, so_num: "TK-SO-1", timestamp: "2026-11-17T15:00:00Z", nombre: "María", apellido: "Banda", efch: true, fac_7: "2559.0", estimado: 46 }]);
  const apts: Row[] = [
    { id: 501, firstName: "María", lastName: "Banda", datetime: "2026-11-17T10:00:00-0500", time: "10:00am", duration: 60, calendarID: 11689550, calendar: "Andrea", type: "!GRACIAS POR REGRESAR!", appointmentTypeID: 77894742, labels: [{ id: 19124872, name: "CONFIRMADA" }], phone: "0999", canceled: false },
    { id: 502, firstName: "Ana", lastName: "Paz", datetime: "2026-11-18T11:00:00-0500", duration: 90, calendarID: 12796672, calendar: "Daniela", type: "¿ES TU PRIMERA VEZ?", appointmentTypeID: 75346382, labels: null, canceled: false },
  ];
  const llamadas: { url: string; method: string; body?: string }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    llamadas.push({ url, method: init.method || "GET", body: init.body as string });
    const u = new URL(url), path = u.pathname.replace("/api/v1/", "");
    const json = (d: unknown, st = 200) => new Response(JSON.stringify(d), { status: st });
    if (path === "calendars") return json([{ id: 11689550, name: "Andrea" }, { id: 12796672, name: "Daniela" }]);
    if (path === "labels") return json([{ id: 19124872, name: "CONFIRMADA", color: "yellow" }, { id: 19124874, name: "COMPLETADO", color: "pink" }, { id: 22788138, name: "INGRESADO Y COMP", color: "blue" }, { id: 19246692, name: "NO LLEGO", color: "black" }]);
    if (path === "appointment-types" || path === "appointment-addons") return json([]);
    if (path === "appointments" && (init.method || "GET") === "GET") {
      const min = s10(u.searchParams.get("minDate")), max = s10(u.searchParams.get("maxDate")), cal = u.searchParams.get("calendarID");
      return json(apts.filter((a) => a.datetime.slice(0, 10) >= min && a.datetime.slice(0, 10) <= max && (!cal || String(a.calendarID) === cal)));
    }
    const m = path.match(/^appointments\/(\d+)$/);
    if (m && (init.method || "GET") === "GET") return json(apts.find((a) => String(a.id) === m[1]));
    if (m && init.method === "PUT") { const a = apts.find((x) => String(x.id) === m[1])!; const lid = JSON.parse(init.body as string).labels[0].id; a.labels = [{ id: lid, name: lid === 22788138 ? "INGRESADO Y COMP" : lid === 19124874 ? "COMPLETADO" : "NO LLEGO" }]; return json(a); }
    if (/\/cancel$/.test(path)) return json({ ok: 1 });
    return json({ message: "no" }, 404);
  }) as typeof fetch;
  const c = { db, now: new Date("2026-11-17T18:30:00Z"), env: { ACUITY_UID: "1", ACUITY_KEY: "k" } as Record<string, string | undefined>, fetchImpl, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => { limpiarCacheAcuity(); return handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>; };
  return { db, h, llamadas, apts };
}
function s10(v: string | null) { return String(v || "").slice(0, 10); }

describe("agenda (Acuity por la edge)", () => {
  it("reglas: calendario propio, ficha estricta y ticket revisado", () => {
    assert.deepEqual(misCalendarios([{ id: 1, nombre: "Andrea", persona: "Andrea Robles" }, { id: 2, nombre: "Daniela" }], { name: "Andrea Robles", short: "Andrea" }), [1]);
    const regs = [{ cedula: "1", nombre: "María", apellido: "Banda Paz" }, { cedula: "2", nombre: "María", apellido: "Torres" }];
    assert.equal(fichaDeCita(regs, "María", "Banda")?.cedula, "1");
    assert.equal(fichaDeCita(regs, "María", ""), null);
    assert.equal(ticketRevisado({ efch: true }), true);
    assert.equal(ticketRevisado({ paquete: "SI, 2/3", estimado: 0 }), true);
    assert.equal(ticketRevisado({ fac_7: "", estimado: 40 }), false);
  });
  it("cosmetóloga ve solo su calendario; admin ve todo con conteo por día", async () => {
    const { h } = semilla();
    const a = await h("ag_citas", "and", { desde: "2026-11-17", hasta: "2026-11-18" });
    assert.equal(a.ok, true, String(a.error));
    assert.deepEqual((a.citas as Row[]).map((x) => x.id), [501]);
    assert.equal((a.citas as Row[])[0].ticket, "TK-SO-1");
    assert.equal((a.citas as Row[])[0].telefono, undefined);
    const ad = await h("ag_citas", "adm", { desde: "2026-11-17", hasta: "2026-11-18" });
    assert.equal((ad.citas as Row[]).length, 2);
    assert.equal(((ad.porDia as Row)["2026-11-18"] as Row).total, 1);
    assert.match(String((await h("ag_citas", "asi", {})).error), /acceso/);
    const ci = await h("ag_cita", "and", { id: 502 });
    assert.match(String(ci.error), /tu calendario/);
    const mia = await h("ag_cita", "and", { id: 501 });
    assert.equal(((mia.cita as Row).ficha as Row).cedula, "1700000001");
  });
  it("staff solo marca No llegó; cancelar es de admin; no hay borrado definitivo", async () => {
    const { h, llamadas } = semilla();
    assert.match(String((await h("ag_etiqueta", "and", { id: 501, etiqueta: "CONFIRMADA" })).error), /No llegó/);
    assert.equal((await h("ag_etiqueta", "and", { id: 501, etiqueta: "NO LLEGO" })).ok, true);
    assert.ok(llamadas.some((l) => l.method === "PUT" && /appointments\/501\?admin=true/.test(l.url)));
    assert.match(String((await h("ag_cancelar", "and", { id: 501 })).error), /Solo admin/);
    assert.equal((await h("ag_cancelar", "adm", { id: 502 })).ok, true);
    assert.ok(llamadas.some((l) => /appointments\/502\/cancel\?admin=true/.test(l.url)));
    assert.match(String((await h("ag_eliminar", "adm", { id: 502 })).error), /no permite borrar/);
  });
  it("vincular ticket → COMPLETADO; conciliación → INGRESADO Y COMP una sola vez", async () => {
    const { h, db, apts } = semilla();
    const v = await h("ag_vincular", "and", { id: 501, ticket: "TK-SO-1" });
    assert.equal(v.ok, true, String(v.error));
    assert.equal(apts[0].labels[0].name, "COMPLETADO");
    assert.equal((db.tables.get("beta_citas_ticket") as Row[])[0].ticket_clave, "TK-SO-1");
    const sim = await h("ag_ingresado", "adm", { desde: "2026-11-01", hasta: "2026-11-17", simular: true });
    assert.equal(sim.marcadas, 1);
    assert.equal(apts[0].labels[0].name, "COMPLETADO");
    const r = await h("ag_ingresado", "adm", { desde: "2026-11-01", hasta: "2026-11-17" });
    assert.equal(r.marcadas, 1);
    assert.equal(apts[0].labels[0].name, "INGRESADO Y COMP");
    assert.equal((await h("ag_ingresado", "adm", { desde: "2026-11-01", hasta: "2026-11-17" })).yaTenian, 1);
    assert.match(String((await h("ag_ingresado", "and", {})).error), /administradores/);
  });
});
