import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./tickets_lista_api.ts";
import "./staff_home_api.ts";
import "./migo_cuadre_api.ts";
import { limpiarCacheAcuity } from "./acuity.ts";
import type { Row } from "./domain.ts";

function s10(v: string | null) { return String(v || "").slice(0, 10); }

function semilla(opts: { cita?: boolean } = {}) {
  limpiarCacheAcuity();
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "and", uid: "u-and", rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", exp: "2099-01-01T00:00:00.000Z" },
    { token: "ale", uid: "u-ale", rol: "recepcion", name: "Alejandra Rodriguez", short: "Alejandra", exp: "2099-01-01T00:00:00.000Z" },
    { token: "dan", uid: "u-dan", rol: "cosmetologa", name: "Daniela Mora", short: "Daniela", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin" },
    { id: "u-and", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa" },
    { id: "u-ale", nombre: "Alejandra Rodriguez", short: "Alejandra", rol: "recepcion" },
    { id: "u-dan", nombre: "Daniela Mora", short: "Daniela", rol: "cosmetologa" },
  ]);
  db.tables.set("app_modulos", []);
  db.tables.set("tickets", [
    { id: 11, sheet_row: 11, so_num: "TK-SO-11", timestamp: "2026-11-18T15:00:00Z", nombre: "María", apellido: "Paz", atendido_por: "Andrea Robles", estimado: 80, id_3: "1701", fac_7: "", cob: false, fac: false },
  ]);
  db.tables.set("beta_tickets", []);
  db.tables.set("beta_ticket_flags", []);
  db.tables.set("beta_ticket_cancelados", []);
  db.tables.set("beta_cuadre_link", []);
  db.tables.set("beta_migo_facturas_vivo", []);
  db.tables.set("beta_migo_importes", []);
  db.tables.set("beta_migo_borradores", []);
  db.tables.set("beta_ticket_envios", []);
  db.tables.set("beta_citas_ticket", []);
  db.tables.set("log_acciones", []);
  db.tables.set("clientas_registro", []);
  db.tables.set("beta_acuity_calendars", [
    { calendar_id: 11689550, nombre: "Andrea", persona: "Andrea Robles", activo: true },
    { calendar_id: 12796672, nombre: "Daniela", persona: "Daniela Mora", activo: true },
  ]);
  const apts: Row[] = opts.cita === false ? [] : [
    { id: 801, firstName: "Lucía", lastName: "Vega", datetime: "2026-11-18T10:00:00-0500", duration: 60, calendarID: 11689550, calendar: "Andrea", type: "Hidrafacial", canceled: false },
  ];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url), path = u.pathname.replace("/api/v1/", "");
    const json = (d: unknown, st = 200) => new Response(JSON.stringify(d), { status: st });
    if (path === "calendars") return json([{ id: 11689550, name: "Andrea" }, { id: 12796672, name: "Daniela" }]);
    if (path === "labels" || path === "appointment-types" || path === "appointment-addons") return json([]);
    if (path === "appointments" && (init.method || "GET") === "GET") {
      const min = s10(u.searchParams.get("minDate")), max = s10(u.searchParams.get("maxDate"));
      return json(apts.filter((a) => s10(s(a.datetime)) >= min && s10(s(a.datetime)) <= max));
    }
    return json({ message: "no" }, 404);
  }) as typeof fetch;
  const c = {
    db, now: new Date("2026-11-18T16:00:00Z"),
    env: { ACUITY_UID: "1", ACUITY_KEY: "k" } as Record<string, string | undefined>,
    fetchImpl, legacyLogin: async () => ({}),
  };
  const h = (tok: string, a: string, p: Row = {}) => {
    limpiarCacheAcuity();
    return handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  };
  return { db, h };
}
function s(v: unknown) { return String(v ?? ""); }

describe("TK79 borradores asignados a la cosmetóloga", () => {
  it("si hay cita el mismo día, el borrador nuevo queda asignado a esa cosmetóloga", async () => {
    const { db, h } = semilla();
    const r = await h("adm", "migo_importar", {
      fecha_desde: "2026-11-18", fecha_hasta: "2026-11-18",
      facturas: [{ factura: "001-001-000002980", fecha: "2026-11-18", cliente: "LUCIA VEGA", total: 90, forma: "Tarjeta" }],
    });
    assert.equal(r.ok, true, String(r.error));
    const b0 = db.tables.get("beta_migo_borradores")![0];
    assert.equal(b0.estado, "asignado");
    assert.equal(b0.asignado_a, "Andrea Robles");
    assert.equal(b0.asignado_por, "acuity");
  });

  it("un borrador abierto ya asignado (o con cita del día) se asigna en el backfill; el sin pista queda para admin/recepción", async () => {
    const { db, h } = semilla();
    db.tables.set("beta_migo_borradores", [
      { factura: "001-001-000002981", fecha: "2026-11-18", cliente: "ANA SOL", total: 50, estado: "pendiente", asignado_a: "Andrea Robles", datos: {}, lineas: [] },
      { factura: "001-001-000002982", fecha: "2026-11-18", cliente: "LUCIA VEGA", total: 90, estado: "pendiente", asignado_a: null, datos: {}, lineas: [] },
      { factura: "001-001-000002983", fecha: "2026-11-17", cliente: "OTRA PERSONA", total: 40, estado: "pendiente", asignado_a: null, datos: {}, lineas: [] },
    ]);
    const r = await h("adm", "migo_borradores_reasignar", {});
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.asignados, 2);
    assert.equal(r.sin_asignar, 1);
    const by = new Map(db.tables.get("beta_migo_borradores")!.map((x) => [s(x.factura), x]));
    assert.equal(by.get("001-001-000002981")!.estado, "asignado");
    assert.equal(by.get("001-001-000002982")!.asignado_a, "Andrea Robles");
    assert.equal(by.get("001-001-000002983")!.estado, "pendiente");
    assert.equal(by.get("001-001-000002983")!.asignado_a, null);
  });

  it("Andrea ve el suyo en Ventas y en su home con pill Por completar; no ve el de otra ni el sin asignar; no hay cédulas ni teléfonos", async () => {
    const { db, h } = semilla();
    db.tables.set("beta_migo_borradores", [
      { factura: "001-001-000002984", fecha: "2026-11-18", cliente: "LUCIA VEGA", total: 90, estado: "asignado", asignado_a: "Andrea Robles", datos: {}, lineas: [] },
      { factura: "001-001-000002985", fecha: "2026-11-18", cliente: "OTRA PERSONA", total: 40, estado: "pendiente", asignado_a: null, datos: {}, lineas: [] },
      { factura: "001-001-000002986", fecha: "2026-11-18", cliente: "ANA SOL", total: 50, estado: "asignado", asignado_a: "Daniela Mora", datos: {}, lineas: [] },
    ]);
    const hist = await h("and", "tk_historial", { limit: 50 });
    assert.equal(hist.ok, true, String(hist.error));
    const items = hist.items as Row[];
    // TK94: los borradores ya no van en Tickets.
    assert.equal(items.filter((x) => x.borrador).length, 0);
    assert.ok(items.some((x) => x.so_num === "TK-SO-11"));
    const lista = await h("and", "getTicketsLista", {});
    assert.equal((lista.items as Row[]).filter((x) => x.borrador).length, 0);

    // Ventas › Facturas borrador: el suyo + el sin asignar de hoy; nunca el de otra.
    const fb = await h("and", "mb_facturas_borrador", {});
    assert.equal(fb.ok, true, String(fb.error));
    const mios = fb.items as Row[];
    assert.deepEqual(mios.map((x) => x.factura).sort(), ["001-001-000002984", "001-001-000002985"]);
    assert.equal(mios.find((x) => x.factura === "001-001-000002984")!.estado, "por_completar");
    assert.equal(mios.find((x) => x.factura === "001-001-000002985")!.sin_asignar, true);
    assert.doesNotMatch(JSON.stringify(mios), /099\d{7}|@test|cedula|telefono|email|total/);

    const home = await h("and", "staff_home", {});
    assert.equal(home.ok, true, String(home.error));
    const bor = home.borradores as Row[];
    assert.equal(bor.length, 1);
    assert.equal(bor[0].factura, "001-001-000002984");
    assert.equal(bor[0].por_completar, true);
    assert.equal("total" in bor[0], false);
    assert.equal("estimado" in bor[0], false);
    assert.equal("cedula" in bor[0], false);
    assert.equal("telefono" in bor[0], false);
    assert.doesNotMatch(JSON.stringify(bor), /099\d{7}|@test|cedula|telefono|email|estimado|total/);

    const dan = await h("dan", "mb_facturas_borrador", {});
    assert.deepEqual((dan.items as Row[]).map((x) => x.factura).sort(), ["001-001-000002985", "001-001-000002986"]);
  });

  it("recepción ve los sin asignar y puede asignarlos; Andrea no", async () => {
    const { db, h } = semilla({ cita: false });
    db.tables.set("beta_migo_borradores", [
      { factura: "001-001-000002987", fecha: "2026-11-18", cliente: "ANA SOL", total: 50, estado: "pendiente", asignado_a: null, datos: {}, lineas: [] },
    ]);
    const no = await h("and", "migo_borrador_asignar", { factura: "2987", asignado_a: "Andrea Robles" });
    assert.match(String(no.error), /permiso/i);
    const aleL = await h("ale", "migo_borradores_lista", {});
    assert.equal((aleL.bandeja as Row[]).length, 1);
    const asg = await h("ale", "migo_borrador_asignar", { factura: "2987", asignado_a: "Andrea Robles" });
    assert.equal(asg.ok, true, String(asg.error));
    assert.equal(db.tables.get("beta_migo_borradores")![0].estado, "asignado");
    assert.equal(db.tables.get("beta_migo_borradores")![0].asignado_a, "Andrea Robles");
  });

  it("Andrea completa el borrador y queda Pendiente de aprobar (no se crea ticket); solo admin aprueba", async () => {
    const { db, h } = semilla({ cita: false });
    db.tables.set("beta_migo_borradores", [
      { factura: "001-001-000002988", fecha: "2026-11-18", cliente: "LUCIA VEGA", total: 90, estado: "asignado", asignado_a: "Andrea Robles", datos: {}, lineas: [] },
    ]);
    const nTk = db.tables.get("tickets")!.length;
    const staff = await h("and", "crearTicket", {
      nombre: "Lucia", apellido: "Vega", estimado: 90, cosmetologa: "Andrea Robles",
      vincular_borrador: "001-001-000002988", facial: "Hidrafacial",
    });
    assert.equal(staff.ok, true, String(staff.error));
    assert.equal(staff.pendiente_aprobar, true);
    assert.equal(staff.factura, "001-001-000002988");
    assert.equal(db.tables.get("tickets")!.length, nTk);
    const b0 = db.tables.get("beta_migo_borradores")![0];
    assert.equal(b0.estado, "asignado");
    assert.ok((b0.datos as Row).completado_at);
    const noApr = await h("and", "migo_borrador_aprobar", { factura: "2988" });
    assert.match(String(noApr.error), /administradora|aprobar/i);
    assert.equal(db.tables.get("tickets")!.length, nTk);

    const fb = await h("and", "mb_facturas_borrador", {});
    const mio = (fb.items as Row[]).find((x) => x.factura === "001-001-000002988");
    assert.equal(mio?.listo, true);
    assert.equal(mio?.estado, "pendiente_aprobar");
  });

  it("el front muestra la pill Por completar en Ventas y en el home", () => {
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    const screens = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const home = readFileSync(new URL("../../../mc-staff-home.js", import.meta.url), "utf8");
    assert.match(screens, /Por completar/);
    assert.match(home, /Por completar/);
    assert.match(home, /data-borrador/);
    assert.match(screens, /pendiente_aprobar/);
    assert.match(beta, /mc-staff-home\.js\?v=20261118tk112/);
    const sw = readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
    assert.match(sw, /sunsu-beta-2026-11-18-TK112/);  });
});

describe("TK94 Facturas borrador (Ventas › #/m/borradores)", () => {
  const filas = () => [
    { factura: "001-001-000003001", fecha: "2026-11-18", cliente: "LUCIA VEGA", total: 90, estado: "asignado", asignado_a: "Andrea Robles", datos: {}, lineas: [] },
    { factura: "001-001-000003002", fecha: "2026-11-18", cliente: "HOY SINASIGNAR", total: 40, estado: "pendiente", asignado_a: null, datos: {}, lineas: [] },
    { factura: "001-001-000003003", fecha: "2026-11-17", cliente: "AYER SINASIGNAR", total: 30, estado: "pendiente", asignado_a: null, datos: {}, lineas: [] },
    { factura: "001-001-000003004", fecha: "2026-11-18", cliente: "ANA SOL", total: 50, estado: "asignado", asignado_a: "Daniela Mora", datos: { completado_at: "2026-11-18T15:00:00Z" }, lineas: [] },
    { factura: "001-001-000003005", fecha: "2026-11-18", cliente: "YA VINCULADA", total: 20, estado: "vinculado", asignado_a: "Andrea Robles", ticket_clave: "SO-11", datos: {}, lineas: [] },
  ];

  it("admin y recepción ven todas las abiertas (no las vinculadas) con total; el personal sin total", async () => {
    const { db, h } = semilla({ cita: false });
    db.tables.set("beta_migo_borradores", filas());
    for (const tok of ["adm", "ale"]) {
      const r = await h(tok, "mb_facturas_borrador", {});
      assert.equal(r.ok, true, String(r.error));
      assert.equal(r.gestiona, true);
      assert.deepEqual((r.items as Row[]).map((x) => x.factura).sort(), ["001-001-000003001", "001-001-000003002", "001-001-000003003", "001-001-000003004"]);
      assert.equal((r.items as Row[]).find((x) => x.factura === "001-001-000003004")!.estado, "pendiente_aprobar");
      assert.equal((r.items as Row[]).find((x) => x.factura === "001-001-000003001")!.total, 90);
    }
    const and = await h("and", "mb_facturas_borrador", {});
    assert.deepEqual((and.items as Row[]).map((x) => x.factura).sort(), ["001-001-000003001", "001-001-000003002"]);
    assert.equal("total" in (and.items as Row[])[0], false);
  });

  it("el personal abre y completa una sin asignar de su día → Pendiente de aprobar; la de ayer no", async () => {
    const { db, h } = semilla({ cita: false });
    db.tables.set("beta_migo_borradores", filas());
    const g = await h("and", "migo_borrador_get", { factura: "3002" });
    assert.equal(g.ok, true, String(g.error));
    const no = await h("and", "migo_borrador_get", { factura: "3003" });
    assert.ok(no.error);
    const nTk = db.tables.get("tickets")!.length;
    const r = await h("and", "crearTicket", { nombre: "Hoy", apellido: "Sinasignar", estimado: 40, cosmetologa: "Andrea Robles", vincular_borrador: "001-001-000003002", facial: "Hidrafacial" });
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.pendiente_aprobar, true);
    assert.equal(db.tables.get("tickets")!.length, nTk);
    const b0 = db.tables.get("beta_migo_borradores")!.find((x) => x.factura === "001-001-000003002")!;
    assert.equal(b0.asignado_a, "Andrea Robles");
    const l = await h("and", "mb_facturas_borrador", {});
    assert.equal((l.items as Row[]).find((x) => x.factura === "001-001-000003002")!.estado, "pendiente_aprobar");
    const ayer = await h("and", "crearTicket", { nombre: "Ayer", apellido: "X", estimado: 30, cosmetologa: "Andrea Robles", vincular_borrador: "001-001-000003003" });
    assert.match(String(ayer.error), /permiso/i);
  });

  it("los borradores no salen en Tickets; «Vinculadas» solo 2 días después de vincular (no se borran)", async () => {
    const { db, h } = semilla({ cita: false });
    db.tables.set("beta_migo_borradores", [
      { factura: "001-001-000003010", fecha: "2026-11-17", cliente: "RECIENTE", total: 20, estado: "vinculado", ticket_clave: "SO-11", updated_at: "2026-11-17T20:00:00Z", datos: {}, lineas: [] },
      { factura: "001-001-000003011", fecha: "2026-11-10", cliente: "VIEJA", total: 20, estado: "vinculado", ticket_clave: "SO-11", updated_at: "2026-11-12T20:00:00Z", datos: {}, lineas: [] },
      { factura: "001-001-000003012", fecha: "2026-11-18", cliente: "ABIERTA", total: 20, estado: "pendiente", datos: {}, lineas: [] },
    ]);
    const l = await h("adm", "migo_borradores_lista", {});
    assert.deepEqual((l.vinculados as Row[]).map((x) => x.factura), ["001-001-000003010"]);
    assert.equal((l.bandeja as Row[]).length, 1);
    assert.equal(db.tables.get("beta_migo_borradores")!.length, 3);
    const hist = await h("adm", "tk_historial", { limit: 50 });
    assert.equal((hist.items as Row[]).filter((x) => x.borrador).length, 0);
    const lista = await h("adm", "getTicketsLista", {});
    assert.equal((lista.items as Row[]).filter((x) => x.borrador).length, 0);
  });

  it("el front tiene el submódulo en Ventas, la ruta y filas compactas con container query", () => {
    const nav = readFileSync(new URL("../../../mc-nav.js", import.meta.url), "utf8");
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    const mod = readFileSync(new URL("../../../mc-borradores.js", import.meta.url), "utf8");
    assert.match(nav, /\["tickets", "Facturas borrador", "#\/m\/borradores"\]/);
    assert.match(beta, /mc-borradores\.js\?v=/);
    assert.match(beta, /route\.mod === "borradores" && window\.MCBorradores\) return window\.MCBorradores\.render/);
    assert.match(mod, /container-type:inline-size/);
    assert.match(mod, /Por completar/);
    assert.match(mod, /Pendiente de aprobar/);
    assert.match(mod, /mb_facturas_borrador/);
  });
});
