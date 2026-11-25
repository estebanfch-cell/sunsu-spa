import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clasificarHorasRol, horarioRrhhDe } from "./horas_rol.ts";

const andH = horarioRrhhDe("Andrea Robles");
const FER = ["2026-11-02", "2026-11-03", "2026-11-20"];

function marca(fecha: string, nomMin: number, extra: Partial<{ suplMin: number; festMin: number; descMin: number }> = {}) {
  return { fecha, nomMin, suplMin: 0, festMin: 0, descMin: 0, fuente: "marcaje" as const, ...extra };
}

describe("DEV-31e horas del rol (t916u)", () => {
  it("noviembre 2026 Andrea: 14 días con marca, 4 asumidos (25-27 y 30), 3 feriados trabajados no son 'días trabajados', 0 faltas", () => {
    const dias: Record<string, ReturnType<typeof marca>> = {
      "2026-11-02": marca("2026-11-02", 486, { festMin: 486 }),
      "2026-11-03": marca("2026-11-03", 481, { festMin: 481 }),
      "2026-11-04": marca("2026-11-04", 510),
      "2026-11-05": marca("2026-11-05", 483),
      "2026-11-06": marca("2026-11-06", 488),
      "2026-11-07": marca("2026-11-07", 461, { descMin: 461 }),
      "2026-11-09": marca("2026-11-09", 510),
      "2026-11-10": marca("2026-11-10", 507),
      "2026-11-11": marca("2026-11-11", 497),
      "2026-11-12": marca("2026-11-12", 537),
      "2026-11-13": marca("2026-11-13", 423),
      "2026-11-16": marca("2026-11-16", 494),
      "2026-11-17": marca("2026-11-17", 484),
      "2026-11-18": marca("2026-11-18", 481),
      "2026-11-19": marca("2026-11-19", 453),
      "2026-11-20": marca("2026-11-20", 480, { festMin: 480 }),
      "2026-11-23": marca("2026-11-23", 480),
      "2026-11-24": marca("2026-11-24", 480),
    };
    const h = clasificarHorasRol({ anio: 2026, mes: 11, hoy: "2026-11-25", horario: andH, feriados: FER, dias });
    assert.equal(h.diasTrabajados, 14);
    assert.equal(h.diasAsumidos, 4); // 25, 26, 27, 30
    assert.equal(h.diasFest, 3); // 2, 3, 20
    assert.equal(h.diasDesc, 1); // sábado 7
    assert.equal(h.diasFalta, 0);
    assert.ok(h.hrsExtr >= 24 && h.hrsExtr <= 25); // recorte15 de ~1447 min ≈ 24.00 h
    assert.ok(h.hrsDesc >= 7.5 && h.hrsDesc <= 7.75); // recorte15(461)=450 → 7.5
    assert.ok(h.hrsNomina > 170);
  });

  it("un feriado oficial sin marca no se cuenta como falta ni reduce el sueldo", () => {
    const h = clasificarHorasRol({
      anio: 2026, mes: 11, hoy: "2026-11-25",
      horario: andH, feriados: FER,
      dias: { "2026-11-24": marca("2026-11-24", 480) },
    });
    assert.ok(!h.fechasFalta.includes("02/11") && !h.fechasFalta.includes("03/11") && !h.fechasFalta.includes("20/11"));
  });
});

describe("DEV-31e etiquetas del rol", () => {
  it("cabecera en días (trabajados + feriado + descanso + asumidos) y extras con sus horas", () => {
    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const pick = (name: string) => {
      const i = src.indexOf("function " + name + "(");
      let depth = 0, j = src.indexOf("{", i);
      for (; j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}" && --depth === 0) break; }
      return src.slice(i, j + 1);
    };
    const fn = new Function(`${pick("_rolNum")}\n${pick("_rolHrs")}\n${pick("_rolDiasLinea")}\n${pick("_lineasRol")}\nreturn _lineasRol;`)() as (d: unknown) => { ingresos: [string, number][]; dias: string };
    const out = fn({
      sueldo: 482, hrsOrdinarias: 144, hrsNomina: 183.5, jornadaMins: 480, diasTrabajados: 14, diasAsumidos: 4, diasFest: 3, diasDesc: 1,
      valSupl: 0, hrsSupl: 0, valExtr: 96.4, hrsExtr: 24, valDesc: 30.12, hrsDesc: 7.5,
      dec13: 40, dec14: 39.17, iess: 45,
    });
    const lbl = out.ingresos.map((x) => x[0]);
    assert.ok(lbl.some((l) => l.startsWith("Horas extraordinarias descanso (7,5 h)")));
    assert.ok(lbl.some((l) => l.startsWith("Horas extraordinarias periodo (24 h)")));
    assert.ok(!lbl.some((l) => l.includes("descanso/feriado") || l.startsWith("Horas extraordinarias 100%")));
    assert.equal(out.dias, "Días trabajados 14 + Días feriado (trabajados) 3 + Día descanso (trabajado) 1 + Días asumidos 4 = Total 22 días");
  });
});
