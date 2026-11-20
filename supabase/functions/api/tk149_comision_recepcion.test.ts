import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import { comisionesDeTablas } from "./handlers_extra.ts";
import "./handlers_extra.ts";
import { limpiarCacheAcuity } from "./acuity.ts";
import {
  calcularRecepcion, fechaAtencion, esCandidatoRecep, tieneFacialReal, periodoLabel,
} from "./comision_recepcion.ts";
import type { CitaRecep, TicketRecep } from "./comision_recepcion.ts";
import type { Row } from "./domain.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const screens = () => readFileSync(join(root, "beta-screens.js"), "utf8");
const fix = JSON.parse(readFileSync(join(root, "supabase/functions/api/tk149_semana_1117.json"), "utf8")) as {
  tickets: TicketRecep[];
  citas: CitaRecep[];
};

const CALENDARIOS = [
  { calendar_id: "11689550", persona: "Andrea Robles", nombre: "Andrea" },
  { calendar_id: "12796672", persona: "Daniela Mora", nombre: "Daniela" },
];

function semana() {
  return calcularRecepcion({
    tickets: fix.tickets,
    citas: fix.citas,
    calendarios: CALENDARIOS,
    desde: "2026-11-11",
    hasta: "2026-11-17",
  });
}

function porFecha(rec: ReturnType<typeof calcularRecepcion>) {
  return Object.fromEntries(rec.dias.map((d) => [d.fecha, d]));
}

describe("TK149 fecha Ecuador del ticket (sin correr 21:00–23:59 al día siguiente)", () => {
  it("el lote 23:13–23:23 con +00:00 (reloj Ecuador) se queda el jueves 12", () => {
    assert.equal(fechaAtencion("2026-11-12T23:13:41+00:00"), "2026-11-12");
    assert.equal(fechaAtencion("2026-11-12T23:23:01+00:00"), "2026-11-12");
  });
  it("Valeria Pérez a las 21:21 del lunes se queda el lunes 16", () => {
    assert.equal(fechaAtencion("2026-11-16T21:21:37+00:00"), "2026-11-16");
  });
  it("una madrugada +00:00 no retrocede al día anterior", () => {
    assert.equal(fechaAtencion("2026-11-17T01:00:00+00:00"), "2026-11-17");
  });
  it("un instante real en UTC (21:21 Ecuador = 02:21Z del día siguiente) sí cae en Ecuador", () => {
    assert.equal(fechaAtencion("2026-11-17T02:21:00Z"), "2026-11-16");
  });
  it("la cita de Acuity con -0500 usa la fecha Ecuador de la cita", () => {
    assert.equal(fechaAtencion("2026-11-11T17:00:00-0500"), "2026-11-11");
    assert.equal(fechaAtencion("2026-11-11T17:00:00-05:00"), "2026-11-11");
  });
});

describe("TK149 candidatos: solo facial hecho real", () => {
  it("cuenta SUNSU-XX y línea tipo facial; excluye producto, gift sin facial, cortesía sin facial e interno", () => {
    assert.equal(tieneFacialReal({ facial: "SUNSU-05 Facial Porcelana" }), true);
    assert.equal(tieneFacialReal({ facial: "", lineas: [{ tipo: "facial", sku: "SUNSU-02" }] }), true);
    assert.equal(esCandidatoRecep({ nombre: "Ana", facial: "SUNSU-02", cosm: "Andrea Robles" }), true);
    assert.equal(esCandidatoRecep({ nombre: "Ana", facial: "", lineas: [{ tipo: "producto" }], cosm: "Andrea Robles" }), false);
    assert.equal(esCandidatoRecep({ nombre: "Ana", facial: "", lineas: [{ tipo: "gift" }], cosm: "Andrea Robles" }), false);
    assert.equal(esCandidatoRecep({ nombre: "Ana", facial: "", cosm: "Andrea Robles" }), false);
    assert.equal(esCandidatoRecep({ nombre: "Ana", facial: "SUNSU-02", anulado: true, cosm: "Andrea Robles" }), false);
    assert.equal(esCandidatoRecep({ nombre: "Ana", facial: "SUNSU-02", borrado: true, cosm: "Andrea Robles" }), false);
    assert.equal(esCandidatoRecep({ nombre: "Sunsu", facial: "SUNSU-02", cosm: "SUNSU", cedula: "1793219469001" }), false);
  });
});

describe("TK149 semana 11–17 nov 2026: un motor, 1 persona/día, fecha de la cita", () => {
  const rec = semana();
  const d = porFecha(rec);

  it("Mié 11 = 8 ($0.00), incluye a Annie Tao movida desde el jueves 12", () => {
    assert.equal(d["2026-11-11"]?.clientas, 8);
    assert.equal(d["2026-11-11"]?.comision, 0);
    assert.equal(d["2026-11-11"]?.cumple, false);
    assert.ok(d["2026-11-11"].notas.some((n) => /Annie Tao \(subido jue 12\)/.test(n)));
  });
  it("Jue 12 = 10 ($5.00), el lote nocturno se queda y Annie no se duplica", () => {
    assert.equal(d["2026-11-12"]?.clientas, 10);
    assert.equal(d["2026-11-12"]?.comision, 5);
    assert.equal(d["2026-11-12"]?.cumple, true);
    assert.ok(!d["2026-11-12"].notas.some((n) => /Annie Tao/.test(n)));
    const nombres = rec.personas.filter((p) => p.fecha === "2026-11-12").map((p) => p.cliente);
    assert.ok(nombres.includes("Fernanda Cruz"));
    assert.ok(nombres.includes("Nancy Proaño"));
    assert.ok(nombres.includes("Soledad Carrera"));
    assert.ok(nombres.includes("Kerly Galeth"));
    assert.ok(!nombres.includes("Annie Tao"));
  });
  it("Vie 13 = 8 ($0.00)", () => {
    assert.equal(d["2026-11-13"]?.clientas, 8);
    assert.equal(d["2026-11-13"]?.comision, 0);
  });
  it("Sáb 14 = 8 ($0.00)", () => {
    assert.equal(d["2026-11-14"]?.clientas, 8);
    assert.equal(d["2026-11-14"]?.comision, 0);
  });
  it("Lun 16 = 6 ($3.00), incluye a Valeria Pérez de las 21:21", () => {
    assert.equal(d["2026-11-16"]?.clientas, 6);
    assert.equal(d["2026-11-16"]?.comision, 3);
    assert.ok(rec.personas.some((p) => p.fecha === "2026-11-16" && /Valeria Perez/i.test(p.cliente) && p.fechaTicket === "2026-11-16"));
  });
  it("Mar 17 = 7 ($0.00) y señala a Aglay Terán en Acuity sin ticket", () => {
    assert.equal(d["2026-11-17"]?.clientas, 7);
    assert.equal(d["2026-11-17"]?.comision, 0);
    assert.ok(d["2026-11-17"].sinTicket.some((n) => /Aglay Ter[aá]n/i.test(n)));
  });
  it("total de la semana = $8.00 (jueves $5 + lunes $3)", () => {
    assert.equal(rec.total, 8);
    assert.equal(rec.diasCumplidos, 2);
    assert.equal(periodoLabel("2026-10-26", "2026-11-25"), "Oct 26 — Nov 25, 2026");
  });
  it("no duplica a la misma clienta el mismo día", () => {
    const extra: TicketRecep = {
      so: "TK-SO-DUP", timestamp: "2026-11-14T18:00:00+00:00",
      nombre: "Alguien", apellido: "YaContada", cedula: fix.tickets.find((t) => t.timestamp.startsWith("2026-11-14"))!.cedula,
      cosm: "Andrea Robles", facial: "SUNSU-02 Facial Reparación",
    };
    const rec2 = calcularRecepcion({
      tickets: [...fix.tickets, extra], citas: fix.citas, calendarios: CALENDARIOS,
      desde: "2026-11-14", hasta: "2026-11-14",
    });
    assert.equal(rec2.dias[0]?.clientas, 8);
  });
  it("sin Acuity: Annie se queda el jueves y el lote nocturno no se va al viernes", () => {
    const rec2 = calcularRecepcion({ tickets: fix.tickets, citas: [], desde: "2026-11-11", hasta: "2026-11-17" });
    const d2 = porFecha(rec2);
    assert.equal(d2["2026-11-11"]?.clientas, 7);
    assert.equal(d2["2026-11-12"]?.clientas, 11);
    assert.equal(d2["2026-11-13"]?.clientas, 8);
    assert.equal(d2["2026-11-16"]?.clientas, 6);
    assert.ok(rec2.personas.some((p) => p.cliente === "Annie Tao" && p.fecha === "2026-11-12"));
  });
  it("una cita cancelada no aparece como sin ticket", () => {
    assert.ok(!(d["2026-11-17"]?.sinTicket || []).some((n) => /Elvira|Karina Lino|Gustavo/i.test(n)));
  });
});

function seedSemana(acuityOk = true) {
  limpiarCacheAcuity();
  const tickets = fix.tickets.filter((t) => {
    const f = String(t.timestamp).slice(0, 10);
    return f >= "2026-11-11" && f <= "2026-11-17";
  }).map((t, i) => ({
    id: i + 1, so_num: t.so, timestamp: t.timestamp,
    nombre: t.nombre, apellido: t.apellido, id_3: t.cedula,
    atendido_por: t.cosm, facial_hecho: t.facial, orig: {},
  }));
  const lineas = fix.tickets.flatMap((t) => (t.lineas || []).map((l, i) => ({
    ticket_clave: t.so, tipo: l.tipo, sku: l.sku, nombre: l.nombre, id: t.so + "-" + i,
  })));
  const db = new MemoryDb({
    usuarios: [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
      { id: "alejandra", nombre: "Alejandra Rodriguez", short: "Alejandra", rol: "recepcion", bloqueado: false },
    ],
    cosmetologas: [
      { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true },
      { id: "daniela", nombre: "Daniela Mora", patron: "daniela%", es_cosmetologa: true, activa: true },
    ],
    tickets, catalogo: [{ sku: "SUNSU-02", producto_servicio: "Facial Reparación", subtotal: 30, tipo: "FACIAL", orig: {} }],
    beta_ticket_lineas: lineas,
    beta_acuity_calendars: CALENDARIOS,
    beta_citas_ticket: [],
    sesiones: [{ token: "t-emi", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" }],
    rrhh_empleadas: [
      { cedula: "1712", nombre_app: "Alejandra", apellidos_y_nombres: "Alejandra Rodriguez", sueldo: 460, bono: 0, fondo_reserva: "NO", fecha_ingreso: "2024-01-01", cargo: "Recepcion" },
    ],
  });
  const citas = fix.citas;
  const fetchImpl = (async (url: string) => {
    if (!acuityOk) throw new Error("Acuity caído");
    const u = String(url);
    if (!u.includes("acuityscheduling.com")) return new Response("no", { status: 404 });
    const min = (u.match(/minDate=(\d{4}-\d{2}-\d{2})/) || [])[1];
    const max = (u.match(/maxDate=(\d{4}-\d{2}-\d{2})/) || [])[1];
    const data = citas.filter((a) => {
      const f = String(a.date || a.datetime || "").slice(0, 10);
      return (!min || f >= min) && (!max || f <= max);
    });
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const ctx = {
    db, now: new Date("2026-11-19T23:00:00Z"),
    env: acuityOk ? { ACUITY_UID: "1", ACUITY_KEY: "k" } : {} as Record<string, string | undefined>,
    fetchImpl, legacyLogin: async () => ({ ok: false }),
  };
  return { db, ctx, token: "t-emi" };
}

describe("TK149 API: Control de Agenda, Mis Comisiones y rol de pagos usan el mismo motor", () => {
  it("getComisionRecepcion y comision_recepcion devuelven la semana 8/10/8/8/6/7 y $8.00", async () => {
    const { ctx, token } = seedSemana(true);
    const d = await handle("getComisionRecepcion", { token }, ctx) as Row;
    const alias = await handle("comision_recepcion", { token }, ctx) as Row;
    assert.equal(d.error, undefined, JSON.stringify(d));
    const dias = d.dias as { fecha: string; clientas: number; comision: number; notas?: string[]; sinTicket?: string[] }[];
    const map = Object.fromEntries(dias.map((x) => [x.fecha, x]));
    assert.equal(map["2026-11-11"]?.clientas, 8);
    assert.equal(map["2026-11-11"]?.comision, 0);
    assert.ok((map["2026-11-11"]?.notas || []).some((n) => /Annie Tao \(subido jue 12\)/.test(n)));
    assert.equal(map["2026-11-12"]?.clientas, 10);
    assert.equal(map["2026-11-12"]?.comision, 5);
    assert.equal(map["2026-11-13"]?.clientas, 8);
    assert.equal(map["2026-11-14"]?.clientas, 8);
    assert.equal(map["2026-11-16"]?.clientas, 6);
    assert.equal(map["2026-11-16"]?.comision, 3);
    assert.equal(map["2026-11-17"]?.clientas, 7);
    assert.ok((map["2026-11-17"]?.sinTicket || []).some((n) => /Aglay Ter[aá]n/i.test(n)));
    const week = ["2026-11-11","2026-11-12","2026-11-13","2026-11-14","2026-11-16","2026-11-17"]
      .reduce((a, f) => a + Number(map[f]?.comision || 0), 0);
    assert.equal(week, 8);
    assert.equal(d.total, 8);
    assert.equal(d.comision, 8);
    assert.equal(d.diasCumplidos, 2);
    assert.equal(alias.total, 8);
    assert.equal(d.periodoLabel, "Oct 26 — Nov 25, 2026");
  });

  it("Mis Comisiones / rol de pagos (comisionesDeTablas) da los mismos $8.00 para Alejandra", async () => {
    const { ctx } = seedSemana(true);
    const r = await comisionesDeTablas(ctx, "Alejandra Rodriguez", 2026, 11);
    assert.equal(r.comRecepcion, 8);
  });

  it("si Acuity falla, igual devuelve la tabla (Annie queda el jueves; lote nocturno no se va al viernes)", async () => {
    const { ctx, token } = seedSemana(false);
    const d = await handle("getComisionRecepcion", { token }, ctx) as Row;
    assert.equal(d.error, undefined, JSON.stringify(d));
    assert.equal(d.acuityOk, false);
    const map = Object.fromEntries((d.dias as { fecha: string; clientas: number }[]).map((x) => [x.fecha, x]));
    assert.equal(map["2026-11-11"]?.clientas, 7);
    assert.equal(map["2026-11-12"]?.clientas, 11);
    assert.equal(map["2026-11-13"]?.clientas, 8);
  });
});

describe("TK149 Control de Agenda en el frontend", () => {
  it("deja el Apps Script y llama al API getComisionRecepcion", () => {
    const src = screens();
    const block = src.slice(src.indexOf("function renderRecepcion(c){"), src.indexOf("function renderDashCosm(c){"));
    assert.match(block, /api\('getComisionRecepcion'\)/);
    assert.doesNotMatch(block, /APPS_SCRIPT_URL/);
    assert.match(block, /dd\.notas/);
    assert.match(block, /sinTicket/);
    assert.match(block, /overflow-x:hidden/);
  });
  it("cicloDe y comisionesDeTablas usan recepcionDeCiclo", () => {
    const h = readFileSync(join(root, "supabase/functions/api/handlers.ts"), "utf8");
    const x = readFileSync(join(root, "supabase/functions/api/handlers_extra.ts"), "utf8");
    assert.match(h, /recepcionDeCiclo\(/);
    assert.match(x, /recepcionDeCiclo\(/);
    assert.doesNotMatch(h, /recepDias/);
  });
  it("cache TK149", () => {
    const sw = readFileSync(join(root, "sw.js"), "utf8");
    const html = readFileSync(join(root, "index.html"), "utf8");
    assert.match(sw, /const CACHE = "sunsu-2026-11-19-TK158"/);
    assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-19-TK158"/);
    assert.match(readFileSync(join(root, "supabase/functions/api/sunsu_version.ts"), "utf8"), /sunsu-engine-2026-11-19-TK157/);
  });
});
