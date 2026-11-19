import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import { instanteEcuador } from "./asistencia.ts";
import "./asistencia_api.ts";
import { hmDeMinutos, lunesADomingo, bloqueDeHoras } from "./asistencia_api.ts";
import type { NominaHoras } from "./asistencia.ts";

const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
const sql = readFileSync(new URL("../../../docs/supabase/pending/0059_asistencia_horas_mes.sql", import.meta.url), "utf8");

function marca(nombre: string, tipo: string, ymd: string, hm: string) {
  return { id: nombre + tipo + ymd + hm, nombre, tipo, ts: instanteEcuador(ymd, hm), anulado: false };
}
function jornada(nombre: string, ymd: string) {
  return [
    marca(nombre, "entrada", ymd, "09:00"),
    marca(nombre, "almuerzo_inicio", ymd, "13:00"),
    marca(nombre, "almuerzo_fin", ymd, "14:00"),
    marca(nombre, "salida", ymd, "18:00"),
  ];
}

describe("TK89 dashboard de horas de Asistencia", () => {
  it("formatea horas y minutos en español, sin cajas N / S50 / N100", () => {
    assert.equal(hmDeMinutos(0).texto, "0 min");
    assert.equal(hmDeMinutos(45).texto, "45 min");
    assert.equal(hmDeMinutos(60).texto, "1 h");
    assert.equal(hmDeMinutos(90).texto, "1 h 30 min");
    assert.equal(hmDeMinutos(480).texto, "8 h");
    const b = bloqueDeHoras({
      hayDatos: true, diasLaborados: 1, hrsSupl: 1, hrsExtr: 0, hrsDesc: 2,
      atrasoMin: 10, faltas: 0, suplExcesoMin: 0, hrsTrabajadas: 11, hrsOrdinarias: 8,
      hrsAlmuerzo: 1, diasJibble: 0, diasPropios: 1, dias: [],
    } as NominaHoras);
    assert.equal(b.total.texto, "11 h");
    assert.equal(b.normales.texto, "8 h");
    assert.equal(b.extra50.texto, "1 h");
    assert.equal(b.extra100.texto, "2 h");
    assert.equal(lunesADomingo("2026-11-18").desde, "2026-11-16");
    assert.equal(lunesADomingo("2026-11-18").hasta, "2026-11-22");
    assert.match(beta, /id="asis-dash"/);
    assert.match(beta, /Horas normales/);
    assert.match(beta, /Horas extra 50%/);
    assert.match(beta, /Horas extra 100%/);
    assert.match(beta, /f-asis-rango/);
    assert.match(beta, /Esta semana/);
    assert.match(beta, /data-asis-vista="\$\{v\}"/);
    assert.match(beta, /v==="dia"\?"Día"/);
    assert.doesNotMatch(beta, /S50 /);
    assert.doesNotMatch(beta, /N100 /);
    assert.doesNotMatch(beta, /N \$\{hHrs/);
    assert.match(sw, /sunsu-beta-2026-11-19-TK121/);
    assert.match(beta, /20261119tk121/);  });
  it("el SQL 0059 crea el historial y no recorta app_beta_write", () => {
    assert.match(sql, /beta_asistencia_horas_mes/);
    assert.match(sql, /beta_asistencia_horas_log/);
    assert.match(sql, /cerrado boolean/);
    assert.doesNotMatch(sql, /cedula text|telefono text|cédula text/i);
    for (const t of ["beta_empleados", "beta_iess_descuentos", "beta_empleado_docs", "beta_migo_borradores", "beta_conteos"]) {
      assert.match(sql, new RegExp("'" + t + "'"));
    }
    assert.match(sql, /'beta_asistencia_horas_mes','beta_asistencia_horas_log'/);
  });

  it("asis_calendario devuelve hoy / semana / mes / rango, guarda el mes y no escribe en vista previa", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [
      { token: "t-emi", uid: "emi", rol: "super_admin", exp: "2099-01-01T00:00:00.000Z" },
      { token: "t-and", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
    ]);
    db.tables.set("usuarios", [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "super_admin", bloqueado: false },
      { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
    ]);
    db.tables.set("rrhh_empleadas", [
      { sheet_row: 2, nombre_app: "Andrea Robles", fecha_ingreso: "2025-05-01", sueldo_base: 480 },
    ]);
    db.tables.set("asistencia_marcajes", [
      ...jornada("Andrea Robles", "2026-11-18"),
      ...jornada("Andrea Robles", "2026-11-17"),
      ...jornada("Andrea Robles", "2026-10-21"),
    ]);
    db.tables.set("permisos", [{
      id_1: "p1", sheet_row: 1, empleada: "Andrea Robles", tipo: "VACACIONES",
      fecha_inicio: "2026-11-25", fecha_fin: "2026-11-27", estado: "APROBADO",
      dias: 3, origin: "beta",
    }]);
    db.tables.set("beta_permisos_usuario", [
      { usuario: "andrea robles", nombre: "Andrea Robles", color: "#FFDCE5" },
    ]);
    const ctx = {
      db, now: new Date(instanteEcuador("2026-11-18", "19:00")),
      env: {}, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }),
    };

    const vista = await handle("asis_calendario", {
      token: "t-emi", preview: true, preview_uid: "andrea", nombre: "Andrea Robles",
    }, ctx) as { ok?: boolean };
    assert.equal(vista.ok, true);
    assert.equal((await db.all("beta_asistencia_horas_mes")).length, 0);

    const cal = await handle("asis_calendario", {
      token: "t-emi", nombre: "Andrea Robles", vista: "mes", fecha: "2026-11-18",
      desde: "2026-11-17", hasta: "2026-11-18",
    }, ctx) as {
      ok?: boolean; error?: string; color?: string; nombreMostrar?: string;
      bloques?: { hoy?: { total?: { texto?: string; totalMin?: number } }; semana?: { total?: { texto?: string } }; mes?: { total?: { texto?: string } }; rango?: { total?: { texto?: string } } };
      permisos?: { tipo?: string; desde?: string }[];
      vacaciones?: { diasDisponibles?: number };
      historial?: { anio?: number; mes?: number; cerrado?: boolean; total?: { texto?: string } }[];
    };
    assert.equal(cal.ok, true, String(cal.error || ""));
    assert.equal(cal.bloques?.hoy?.total?.texto, "8 h");
    assert.equal(cal.bloques?.semana?.total?.texto, "16 h");
    assert.equal(cal.bloques?.mes?.total?.texto, "16 h");
    assert.equal(cal.bloques?.rango?.total?.texto, "16 h");
    assert.equal(cal.color, "#FFDCE5");
    assert.equal(cal.nombreMostrar, "Andrea Robles");
    assert.equal((cal.permisos || []).some((p) => p.tipo === "VACACIONES" && p.desde === "2026-11-25"), true);
    assert.ok((cal.vacaciones?.diasDisponibles ?? 0) >= 0);
    const dumped = JSON.stringify(cal);
    assert.doesNotMatch(dumped, /1710|cedula|cédula/i);

    const hist = await db.all("beta_asistencia_horas_mes");
    assert.ok(hist.some((r) => r.anio === 2026 && r.mes === 11 && r.cerrado !== true));
    const oct = hist.find((r) => r.anio === 2026 && r.mes === 10);
    assert.ok(oct, "debe guardar octubre como historial");
    assert.equal(oct?.cerrado, true);
    assert.equal((cal.historial || []).some((h) => h.anio === 2026 && h.mes === 10 && h.cerrado === true), true);
    const logs = await db.all("beta_asistencia_horas_log");
    assert.ok(logs.length >= 1);
    assert.doesNotMatch(JSON.stringify(logs), /cedula|telefono/i);
  });
});
