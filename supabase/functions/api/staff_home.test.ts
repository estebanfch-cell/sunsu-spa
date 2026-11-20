import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import { lecturaEnVista } from "./permisos.ts";
import "./agenda_api.ts";
import "./staff_home_api.ts";
import { limpiarCacheAcuity } from "./acuity.ts";
import type { Row } from "./domain.ts";

function s10(v: string | null) { return String(v || "").slice(0, 10); }

function semilla(now = new Date("2026-11-18T16:30:00Z")) {
  limpiarCacheAcuity();
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "and", uid: "u-and", rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", exp: "2099-01-01T00:00:00.000Z" },
    { token: "ale", uid: "u-ale", rol: "recepcion", name: "Alejandra Rodriguez", short: "Alejandra", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin" },
    { id: "u-and", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa" },
    { id: "u-ale", nombre: "Alejandra Rodriguez", short: "Alejandra", rol: "recepcion" },
  ]);
  db.tables.set("beta_acuity_calendars", [
    { calendar_id: 11689550, nombre: "Andrea", persona: "Andrea Robles", activo: true },
    { calendar_id: 12796672, nombre: "Daniela", persona: "Daniela Mora", activo: true },
  ]);
  db.tables.set("beta_citas_ticket", []);
  db.tables.set("app_modulos", []);
  db.tables.set("clientas_registro", [
    { cedula: "1700000001", nombre: "María", apellido: "Banda Paz", telefono: "0999999999", email: "maria@test.com", sector: "Cumbayá", timestamp: "2026-01-01" },
  ]);
  db.tables.set("tickets", [
    { id: 1, sheet_row: 10, so_num: "TK-SO-9", timestamp: "2026-10-02T15:00:00Z", nombre: "María", apellido: "Banda", facial_hecho: "Limpieza facial", estimado: 80, telefono: "0999", efch: true, id_3: "1700000001" },
    { id: 2, sheet_row: 20, so_num: "TK-SO-20", timestamp: "2026-11-18T15:00:00Z", nombre: "Ana", apellido: "Pérez", atendido_por: "Andrea Robles", facial_hecho: "SUNSU-02 Facial Reparación", compra_pack_3: "Glow x3", estimado: 130, orig: { "VK-017": 2 }, comp: "Efect", efch: true, id_3: "1712345678" },
    { id: 3, sheet_row: 21, so_num: "TK-SO-21", timestamp: "2026-11-18T16:00:00Z", nombre: "Lia", apellido: "Cruz", atendido_por: "Daniela Mora", facial_hecho: "SUNSU-02 Facial Reparación", estimado: 65, comp: "Efect", efch: true, id_3: "1712345679" },
    { id: 4, sheet_row: 22, so_num: "TK-SO-22", timestamp: "2026-09-10T15:00:00Z", nombre: "Carla", apellido: "Ruiz", facial_hecho: "SUNSU-02 Facial Reparación", estimado: 65, efch: true },
  ]);
  db.tables.set("paquetes", [
    { id: 80, sheet_row: 80, cedula: "1700000001", nombres: "María", apellidos: "Banda Paz", sku: "PACK-3", paquete: "Glow x3", completo: false, uso_1: true, fecha_1: "02/10/26 Limpieza facial", uso_2: false, fecha_2: "", ano: 2026, mes: 9, dia: 1 },
  ]);
  db.tables.set("gift_cards", [
    { id: 90, sheet_row: 90, codigo_gc: "26-100", nombre_comprador: "María", apellido_comprador: "Banda", cedula_comprador: "1700000001", valor: "50", saldo: 50, usado: false },
    { id: 91, sheet_row: 91, codigo_gc: "26-101", nombre_comprador: "Pedro", apellido_comprador: "López", cedula_comprador: "1799999999", valor: "80", saldo: 80, usado: false, notas: "PREMIUM. De: Pedro López. Para: Ana Paz" },
  ]);
  db.tables.set("catalogo", []);
  db.tables.set("beta_paquete_ajustes", []);
  db.tables.set("beta_gift_ajustes", []);
  const apts: Row[] = [
    { id: 501, firstName: "María", lastName: "Banda", datetime: "2026-11-18T10:00:00-0500", time: "10:00am", duration: 90, calendarID: 11689550, calendar: "Andrea", type: "!GRACIAS POR REGRESAR!", appointmentTypeID: 1, labels: [{ id: 1, name: "CONFIRMADA" }], phone: "0991111111", email: "oculta@test.com", canceled: false, price: 45 },
    { id: 502, firstName: "Ana", lastName: "Paz", datetime: "2026-11-18T11:00:00-0500", duration: 60, calendarID: 12796672, calendar: "Daniela", type: "¿ES TU PRIMERA VEZ?", appointmentTypeID: 2, labels: null, canceled: false, price: 30 },
    { id: 503, firstName: "Lucía", lastName: "Mora", datetime: "2026-11-19T13:30:00-0500", duration: 60, calendarID: 11689550, calendar: "Andrea", type: "Hidrafacial", appointmentTypeID: 3, labels: null, canceled: false },
    { id: 504, firstName: "Carla", lastName: "Ruiz", datetime: "2026-11-18T12:00:00-0500", duration: 60, calendarID: 11689550, calendar: "Andrea", type: "¿ES TU PRIMERA VEZ?", appointmentTypeID: 2, labels: [{ id: 1, name: "CONFIRMADA" }], canceled: false },
  ];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url), path = u.pathname.replace("/api/v1/", "");
    const json = (d: unknown, st = 200) => new Response(JSON.stringify(d), { status: st });
    if (path === "calendars") return json([{ id: 11689550, name: "Andrea" }, { id: 12796672, name: "Daniela" }]);
    if (path === "labels") return json([{ id: 1, name: "CONFIRMADA", color: "yellow" }]);
    if (path === "appointment-types" || path === "appointment-addons") return json([]);
    if (path === "appointments" && (init.method || "GET") === "GET") {
      const min = s10(u.searchParams.get("minDate")), max = s10(u.searchParams.get("maxDate")), cal = u.searchParams.get("calendarID");
      return json(apts.filter((a) => a.datetime.slice(0, 10) >= min && a.datetime.slice(0, 10) <= max && (!cal || String(a.calendarID) === cal)));
    }
    return json({ message: "no" }, 404);
  }) as typeof fetch;
  const c = { db, now, env: { ACUITY_UID: "1", ACUITY_KEY: "k" } as Record<string, string | undefined>, fetchImpl, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => { limpiarCacheAcuity(); return handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>; };
  return { h };
}

describe("TK59 dashboard del personal", () => {
  it("Andrea ve solo sus citas de hoy, visita anterior y sin datos sensibles", async () => {
    const { h } = semilla();
    const r = await h("staff_home", "and");
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.nombre, "Andrea");
    assert.equal(r.hoy, "2026-11-18");
    const citas = r.citas as Row[];
    assert.equal(citas.length, 2);
    assert.equal(citas[0].id, 501);
    assert.equal(citas[0].nombre, "María");
    assert.equal(citas[0].tipo, "!GRACIAS POR REGRESAR!");
    assert.equal(citas[0].etiqueta, "CONFIRMADA");
    assert.equal(citas[0].nueva, false);
    assert.equal(citas[0].duracion, 90);
    const ant = citas[0].anterior as Row;
    assert.equal(ant.fecha, "2026-10-02");
    assert.match(String(ant.servicio), /Limpieza facial/);
    assert.equal("precio" in ant, false);
    assert.equal("estimado" in ant, false);
    const paq = citas[0].paquete as Row;
    const gift = citas[0].gift as Row;
    assert.equal(paq.activo, true);
    assert.equal(paq.pendientes, 2);
    assert.equal(gift.activo, true);
    assert.equal("saldo" in gift, false);
    const carla = citas.find((c) => c.id === 504);
    assert.equal(carla?.nueva, false, "una clienta con visita previa no es Nueva aunque Acuity diga primera vez");
    assert.equal((carla?.anterior as Row).fecha, "2026-09-10");
    assert.match(String((carla?.anterior as Row).servicio), /SUNSU-02 Facial Reparación/);
    assert.equal((carla?.paquete as Row).activo, false);
    assert.equal((carla?.gift as Row).activo, false);
    const blob = JSON.stringify(r);
    assert.doesNotMatch(blob, /0991111111|oculta@test\.com|Cumbayá|0999999999|maria@test/);
    assert.equal("precio" in citas[0], false);
    assert.equal("telefono" in citas[0], false);
    assert.equal("email" in citas[0], false);
    assert.equal("sector" in citas[0], false);
    assert.ok(citas[0].clienteKey);
  });

  it("Alejandra (recepción) ve las citas de todas; la de mañana no sale", async () => {
    const { h } = semilla();
    const r = await h("staff_home", "ale");
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.nombre, "Alejandra");
    const ids = (r.citas as Row[]).map((c) => c.id);
    assert.deepEqual(ids, [501, 502, 504]);
    const nueva = (r.citas as Row[]).find((c) => c.id === 502);
    assert.equal(nueva?.nueva, true);
    assert.equal(nueva?.anterior, null);
    assert.equal((nueva?.paquete as Row).activo, false);
    assert.equal((nueva?.gift as Row).activo, true, "gift card comprada para Ana Paz");
    assert.equal(r.puede && (r.puede as Row).mover, true);
  });

  it("un admin viendo como Andrea solo recibe el calendario de Andrea, sin precios", async () => {
    const { h } = semilla();
    const r = await h("staff_home", "adm", { preview: true, preview_uid: "u-and" });
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.nombre, "Andrea");
    assert.deepEqual((r.citas as Row[]).map((c) => c.id), [501, 504]);
    assert.equal("precio" in (r.citas as Row[])[0], false);
  });

  it("staff_home es lectura en «Ver como» y el front no pinta el dashboard admin", () => {
    assert.equal(lecturaEnVista("staff_home"), true);
    const beta = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    const js = readFileSync(new URL("../../../mc-staff-home.js", import.meta.url), "utf8");
    assert.match(beta, /MCStaffHome/);
    assert.match(beta, /staff_home/);
    assert.match(js, /Hola/);
    assert.match(js, /hora12/);
    assert.match(js, /Historial/);
    assert.match(js, /Acciones/);
    assert.match(js, /mcsh-acts-narrow/);
    assert.match(js, /mcsh-act/);
    assert.match(js, /Visita anterior/);
    assert.match(js, /mcsh-status/);
    assert.match(js, /mcsh-who/);
    assert.match(js, /Paquete sí/);
    assert.match(js, /Gift card no/);
    assert.doesNotMatch(js, /mcsh-tipo/);
    assert.doesNotMatch(js, /c\.tipo/);
    assert.doesNotMatch(js, /GRACIAS POR REGRESAR/);
    assert.doesNotMatch(js, /grid-template-columns:132px/);
    assert.match(js, /Crear ticket/);
    assert.match(js, /Productos vendidos/);
    assert.match(js, /Paquetes vendidos/);
    assert.match(js, /Faciales hechos/);
    assert.match(js, /data-periodo=/);
    assert.match(beta, /mc-staff-home\.js\?v=20261120tk167/);    assert.doesNotMatch(beta, /Buen día\. Tus módulos están en el menú/);
    assert.doesNotMatch(beta, /return state\.admin \? "inicio" : "staff-home"/);
    assert.match(beta, /return state\.admin \? "inicio" : ""/);
    assert.match(beta, /MCStaffHome\.render\(\)/);
    assert.match(beta, /flex-wrap: nowrap/);
  });

  it("los kpis son solo de ella (no los de Daniela) y el home pinta Crear ticket", async () => {
    const { h } = semilla();
    const r = await h("staff_home", "and");
    const k = r.kpis as Row;
    assert.equal(k.faciales, 1);
    assert.equal(k.paquetes, 1);
    assert.equal(k.productos, 2);
    assert.equal(k.periodo, "hoy");
    const js = readFileSync(new URL("../../../mc-staff-home.js", import.meta.url), "utf8");
    assert.match(js, /Crear ticket/);
    const htmlFn = js.split("function html(d)")[1] || js;
    assert.match(htmlFn, /data-crear/);
  });

  it("si no hay citas hoy, muestra todas las del siguiente día (no una sola «próxima»)", async () => {
    const { h } = semilla(new Date("2026-11-17T16:30:00Z"));
    const r = await h("staff_home", "and");
    assert.equal(r.hoy, "2026-11-17");
    assert.equal(r.citasFecha, "2026-11-18");
    const citas = r.citas as Row[];
    assert.equal(citas.length, 2);
    assert.deepEqual(citas.map((c) => c.id), [501, 504]);
  });
});
