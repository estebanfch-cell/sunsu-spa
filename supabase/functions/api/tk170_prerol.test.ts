import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./asistencia_api.ts";
import "./horarios_api.ts";
import "./personal_api.ts";
import "./roles_crear_api.ts";
import "./empleados_api.ts";
import { configDesde } from "./asistencia.ts";
import { correccionesJibble, recalcularDiaJibble } from "./asistencia_api.ts";
import type { Row } from "./domain.ts";

function ctx(db: MemoryDb, now = "2026-11-20T15:00:00Z") {
  db.tables.set("sesiones", [{ token: "t-emi", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false }]);
  return { db, now: new Date(now), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }), token: "t-emi" };
}
const jib = (persona: string, fecha: string, payroll: number, supl = 0, raw: Row = {}) => ({ persona, fecha, payroll_minutes: payroll, supplementary_minutes: supl, extraordinary_minutes: 0, rest_day_minutes: 0, raw });

function seed(): MemoryDb {
  return new MemoryDb({
    rrhh_empleadas: [
      { cedula: "1711", nombre_app: "Andrea", apellidos_y_nombres: "Andrea Robles", sueldo_base: 482, bono_fijo: 0, fondo_reserva: "SI", fecha_ingreso: "2024-06-01", cargo: "Cosmetologa" },
      { cedula: "1712", nombre_app: "Evelyn", apellidos_y_nombres: "Evelyn Toapanta", sueldo_base: 482, bono_fijo: 0, fondo_reserva: "NO", fecha_ingreso: "2026-11-14", cargo: "Cosmetologa" },
    ],
    beta_empleados: [{ id: "emp-evelyn", nombre_app: "Evelyn", afiliada_iess: false }],
    // Andrea: Jibble importado hasta el 10/11 (8 h cada día laborable)
    jibble_historial: ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-10"].map((f) => jib("Andrea", f, 540)),
    tickets: [], multas_descuentos: [], asistencia_marcajes: [], permisos: [],
  });
}

describe("TK170 pre-rol y empleados", () => {
  it("rol_prerol lista a todas (afiliadas y no) y explica la convención", async () => {
    const c = ctx(seed());
    const r = await handle("rol_prerol", { token: "t-emi" }, c) as Row;
    assert.equal(r.ok, true, String(r.error || ""));
    const items = r.items as Row[];
    assert.deepEqual(items.map((x) => x.nombre), ["Andrea", "Evelyn"]);
    assert.equal(items.find((x) => x.nombre === "Evelyn")!.afiliada, false);
    assert.match(String(r.convencion), /un día pasado sin marcas .* es falta/);
  });

  it("TK171: días pasados sin marcas son faltas; desde hoy hasta fin de mes se asume la jornada", async () => {
    const c = ctx(seed());
    const r = await handle("rol_prerol", { token: "t-emi", nombre: "Andrea" }, c) as Row;
    assert.equal(r.ok, true, String(r.error || ""));
    const snap = r.snap as Row;
    assert.equal(snap.asumidoDesde, "2026-11-20");
    assert.equal(snap.ultimoDato, "2026-11-10");
    // 11–19 nov sin Jibble ni marcas: los laborables son faltas
    assert.ok(Number(snap.faltas) >= 5, JSON.stringify({ faltas: snap.faltas }));
    assert.equal(Number((r.hastaHoy as Row).faltas) >= 5, true);
    assert.ok(Number(snap.totalRecibir) > 0);
    assert.ok(r.hastaHoy);
  });

  it("no afiliada: sueldo proporcional desde el ingreso, sin IESS/décimos/fondo y mensaje para facturar", async () => {
    const c = ctx(seed());
    const r = await handle("rol_prerol", { token: "t-emi", nombre: "Evelyn" }, c) as Row;
    assert.equal(r.ok, true, String(r.error || ""));
    const snap = r.snap as Row;
    assert.equal(snap.afiliada, false);
    assert.equal(Number(snap.iess), 0);
    assert.equal(Number(snap.dec13) + Number(snap.dec14) + Number(snap.fondoReserva), 0);
    assert.ok(Number(snap.diasNoContratada) >= 13);
    assert.ok(Number(snap.sueldo) < 482);
    assert.equal(Number(snap.facturar), Number(snap.totalRecibir));
    const h = r.hastaHoy as Row;
    assert.equal(h.desde, "2026-11-14");
    // sin marcas desde su ingreso: esos días pasados son faltas, los anteriores al ingreso no
    assert.ok(Number(h.faltas) > 0 && Number(h.faltas) <= 6);
    assert.ok(Number(snap.faltas) > 0);
    assert.match(String(snap.mensajeFactura), /^Debes facturarnos \$\d+\.\d{2} por este período\.$/);
  });

  it("recalcula un día de Jibble: descuenta la pausa real o el almuerzo del horario y marca días abiertos", async () => {
    const cfg = configDesde(undefined);
    const jor = { trabaja: true, desde: "10:00", hasta: "19:00" };
    const alm = { desde: "12:00", hasta: "15:00", duracionMin: 60 };
    const sinPausa = recalcularDiaJibble({ firstInTimestamp: "2026-11-03T15:00:00Z", lastOutTimestamp: "2026-11-04T00:00:00Z" }, "2026-11-03", cfg, [], jor, alm)!;
    assert.equal(sinPausa.almuerzoMin, 60);
    assert.equal(sinPausa.workedMin, 480);
    const conPausa = recalcularDiaJibble({ firstInTimestamp: "2026-11-03T15:00:00Z", lastOutTimestamp: "2026-11-04T00:00:00Z",
      trackedHours: { breaks: [{ type: "Unpaid", start: "2026-11-03T18:00:00Z", end: "2026-11-03T18:30:00Z" }] } }, "2026-11-03", cfg, [], jor, alm)!;
    assert.equal(conPausa.almuerzoMin, 30);
    assert.equal(recalcularDiaJibble({ firstInTimestamp: "2026-11-03T15:00:00Z" }, "2026-11-03", cfg, [], jor, alm)!.abierto, true);

    const db = seed();
    db.tables.set("jibble_historial", [
      jib("Andrea", "2026-11-03", 540, 60, { firstInTimestamp: "2026-11-03T15:00:00Z", lastOutTimestamp: "2026-11-04T00:00:00Z" }),
      jib("Andrea", "2026-11-04", 1440, 0, { firstInTimestamp: "2026-11-04T15:00:00Z", lastOutTimestamp: "2026-11-05T00:00:00Z" }),
      jib("Andrea", "2026-11-05", 200, 0, { firstInTimestamp: "2026-11-05T15:00:00Z" }),
    ]);
    const cj = await correccionesJibble(ctx(db) as never, "Andrea", "2026-11-01", "2026-11-20");
    assert.deepEqual(cj.dias.map((d) => [d.fecha, d.abierto]), [["2026-11-04", false], ["2026-11-05", true]]);
    assert.equal(cj.importadoHasta, "2026-11-05");
  });

  it("front: Empleados con desplegables, sin campo de descuento IESS, horarios en Horarios y pre-rol en Roles", () => {
    const js = readFileSync(new URL("../../../mc-empleados.js", import.meta.url), "utf8");
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    assert.match(js, /data-emp-sel/);
    assert.match(js, /data-emp-dato="sueldo"/);
    assert.doesNotMatch(js, /htmlPlantillas/);
    assert.match(js, /#\/m\/personal\/horarios/);
    assert.match(html, /function htmlSelHora\(/);
    assert.match(html, /function htmlPreRolLista\(/);
    assert.match(html, /lo que recibiría al día de hoy/);
    assert.match(html, /\[data-prerol\]/);
  });
});
