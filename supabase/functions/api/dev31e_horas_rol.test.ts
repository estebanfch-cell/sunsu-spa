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
  it("cabecera en días; una sola línea de extraordinarias (descanso + feriado)", () => {
    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const pick = (name: string) => {
      const i = src.indexOf("function " + name + "(");
      let depth = 0, j = src.indexOf("{", i);
      for (; j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}" && --depth === 0) break; }
      return src.slice(i, j + 1);
    };
    const fn = new Function(`${pick("_rolNum")}\n${pick("_rolHrs")}\n${pick("_rolDiasLinea")}\n${pick("_rolNombre")}\n${pick("_lineasRol")}\nreturn _lineasRol;`)() as (d: unknown) => { ingresos: [string, number][]; dias: string };
    const out = fn({
      sueldo: 482, hrsOrdinarias: 144, hrsNomina: 183.5, jornadaMins: 480, diasTrabajados: 14, diasAsumidos: 4, diasFest: 3, diasDesc: 1,
      valSupl: 0, hrsSupl: 0, valExtr: 98.4, hrsExtr: 24.5, valDesc: 30.12, hrsDesc: 7.5,
      dec13: 40, dec14: 39.17, iess: 45,
    });
    const lbl = out.ingresos.map((x) => x[0]);
    const ext = lbl.find((l) => l.startsWith("Horas extraordinarias"));
    assert.equal(ext, "Horas extraordinarias (7,5 h descanso + 24,5 h feriado) · Total 32 h");
    assert.equal(out.ingresos.find((x) => x[0] === ext)?.[1], 128.52);
    assert.ok(!lbl.some((l) => l.includes("descanso/feriado") || l.startsWith("Horas extraordinarias descanso") || l.startsWith("Horas extraordinarias periodo")));
    assert.equal(out.dias, "Días trabajados 14 + Días feriado (trabajados) 3 + Día descanso (trabajado) 1 + Días asumidos 4 = Total 22 días");
  });

  it("línea DÍAS omite componentes en 0 (pantalla y PDF)", () => {
    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const pick = (name: string) => {
      const i = src.indexOf("function " + name + "(");
      let depth = 0, j = src.indexOf("{", i);
      for (; j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}" && --depth === 0) break; }
      return src.slice(i, j + 1);
    };
    const dias = new Function(`${pick("_rolDiasLinea")}\nreturn _rolDiasLinea;`)() as (d: unknown) => string;
    assert.equal(
      dias({ diasTrabajados: 15, diasFest: 2, diasDesc: 0, diasAsumidos: 0 }),
      "Días trabajados 15 + Días feriado (trabajados) 2 = Total 17 días",
    );
    assert.equal(
      dias({ diasTrabajados: 15, diasFest: 0, diasDesc: 0, diasAsumidos: 0 }),
      "Días trabajados 15 = Total 15 días",
    );
    assert.equal(
      dias({ diasTrabajados: 14, diasFest: 0, diasDesc: 1, diasAsumidos: 0 }),
      "Días trabajados 14 + Día descanso (trabajado) 1 = Total 15 días",
    );
    assert.equal(
      dias({ diasTrabajados: 10, diasFest: 0, diasDesc: 0, diasAsumidos: 2 }),
      "Días trabajados 10 + Días asumidos 2 = Total 12 días",
    );
    assert.equal(
      dias({ diasTrabajados: 0, diasFest: 0, diasDesc: 0, diasAsumidos: 0 }),
      "Total 0 días",
    );
    // _lineasRol alimenta la pantalla (DÍAS) y el PDF; misma cadena.
    const lineas = new Function(`${pick("_rolNum")}\n${pick("_rolHrs")}\n${pick("_rolDiasLinea")}\n${pick("_rolNombre")}\n${pick("_lineasRol")}\nreturn _lineasRol;`)() as (d: unknown) => { dias: string };
    assert.equal(
      lineas({ diasTrabajados: 15, diasFest: 2 }).dias,
      "Días trabajados 15 + Días feriado (trabajados) 2 = Total 17 días",
    );
    assert.ok(src.includes("fila('DÍAS:', rol.dias"));
    assert.ok(src.includes("${esc(rol.dias)}"));
  });
});

describe("DEV-31l asumir jornada sin marcajes (t941u)", () => {
  const evH = { diasDescanso: [0, 2], jornadaMins: 540, etiqueta: "Lun, Mié-Sáb 9h" }; // like Evelyn
  it("sin el flag, un día hábil pasado sin marca es falta; con el flag se asume la jornada", () => {
    const base = { anio: 2026, mes: 11, hoy: "2026-11-25" as const, horario: evH, feriados: FER, ingreso: "2026-11-14", dias: { "2026-11-16": marca("2026-11-16", 540) } };
    const sin = clasificarHorasRol(base);
    const con = clasificarHorasRol({ ...base, asumirSinMarcajes: true });
    assert.ok(sin.diasFalta > 0);
    assert.equal(con.diasFalta, 0);
    assert.ok(con.diasAsumidos > sin.diasAsumidos);
    assert.equal(con.diasTrabajados, sin.diasTrabajados);
    // Los días antes del ingreso no se inventan.
    assert.equal(con.diasNoContratada, sin.diasNoContratada);
    assert.ok((con.diasNoContratada || 0) >= 13);
  });
  it("sin el flag Andrea sigue igual (0 faltas en el caso con marcas)", () => {
    const h = clasificarHorasRol({ anio: 2026, mes: 11, hoy: "2026-11-25", horario: andH, feriados: FER, dias: { "2026-11-24": marca("2026-11-24", 480) } });
    const h2 = clasificarHorasRol({ anio: 2026, mes: 11, hoy: "2026-11-25", horario: andH, feriados: FER, dias: { "2026-11-24": marca("2026-11-24", 480) }, asumirSinMarcajes: false });
    assert.equal(h.diasFalta, h2.diasFalta);
  });
});
