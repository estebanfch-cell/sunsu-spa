import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { rolCalcularOficial } from "./domain.ts";
import { clasificarHorasRol } from "./horas_rol.ts";
import { horasQueCuadran, repartirFER, valorHoras } from "./rol_historial_detalle.ts";

const base = {
  sueldoBase: 482, bono: 0, faltas: 0, hrsSupl: 2, hrsExtr: 1, hrsDesc: 0,
  comFaciales: 40, comExtras: 10, comRecepcion: 0, comProductos: 5, comPaquetes: 20,
  fondoReserva: true, fechaIngreso: "2023-01-01", anio: 2026, mes: 10,
};

describe("TK166 rol de pagos", () => {
  it("13°, 14° y fondo en líneas separadas; acumulados no suman al rol pero quedan informados", () => {
    const m = rolCalcularOficial(base);
    assert.ok(m.dec13 > 0 && m.dec14 > 0 && m.fondoReserva > 0);
    assert.equal(m.dec13Acumulado, 0);
    const a = rolCalcularOficial({ ...base, dec13Mensual: false, dec14Mensual: false, fondoMensual: false });
    assert.equal(a.dec13, 0); assert.equal(a.dec14, 0); assert.equal(a.fondoReserva, 0);
    assert.equal(a.dec13Acumulado, Math.round(m.dec13 * 100) / 100);
    assert.equal(a.dec14Acumulado, Math.round(m.dec14 * 100) / 100);
    assert.ok(a.fondoReservaIess > 0);
    assert.ok(a.totalIngresos < m.totalIngresos);
    // el IESS personal 9,45 % se calcula sobre lo aportable, no sobre décimos/fondo
    assert.equal(a.iess, m.iess);
    assert.ok(m.iess > 0);
  });

  it("horas extra del mes: suma y recorte a 15 min (regla del rol RRHH)", () => {
    const dias: Record<string, { fecha: string; nomMin: number; suplMin: number; festMin: number; descMin: number; noctMin: number; fuente: "jibble" }> = {};
    for (const d of ["2026-10-01", "2026-10-02"]) dias[d] = { fecha: d, nomMin: 530, suplMin: 50, festMin: 0, descMin: 0, noctMin: 0, fuente: "jibble" };
    const h = clasificarHorasRol({ anio: 2026, mes: 10, hoy: "2026-10-03", horario: { jornadaMins: 480, diasDescanso: [0] } as never, feriados: [], dias });
    assert.equal(h.hrsSupl, 1.5); // 100 min -> 90 min
  });

  it("historial: horas que cuadran con lo pagado y reparto de comisiones sin inventar centavos", () => {
    const pagado = Math.round((valorHoras(3, 482, 1.5) + valorHoras(1.25, 482, 2)) * 100) / 100;
    const h = horasQueCuadran(pagado, 482, { supl: 3.1, extr: 1.2, desc: 0 });
    assert.deepEqual(h, { supl: 3, extr: 1.25, desc: 0 });
    const r = repartirFER(100, { comFaciales: 70, comExtras: 20, comRecepcion: 5 } as never, false);
    assert.equal(Math.round((r.fac + r.ext + r.rec) * 100) / 100, 100);
    assert.equal(r.ext, 20);
  });

  it("_lineasRol oculta las líneas en $0 y no deja NaN", () => {
    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const pick = (name: string) => {
      const i = src.indexOf("function " + name + "(");
      let depth = 0, j = src.indexOf("{", i);
      for (; j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}" && --depth === 0) break; }
      return src.slice(i, j + 1);
    };
    const fn = new Function(`${pick("_rolNum")}\n${pick("_rolHrs")}\n${pick("_rolDiasLinea")}\n${pick("_lineasRol")}\nreturn _lineasRol;`)() as (d: unknown) => { ingresos: [string, number][]; egresos: [string, number][]; notas: string[] };
    const out = fn({ sueldo: 482, comFacialesSolo: 12.5, comExtras: "NaN", comRecepcion: 0, comPaquetes: null, comProductos: 0,
      valSupl: 7.53, hrsSupl: 2.5, valExtr: 0, valDesc: 0, dec13: 40.17, dec14: 0, fondoReserva: 0, iess: 45.55, anticipo: 0, dec14Acumulado: 40.17 });
    const lbl = out.ingresos.map((x) => x[0]);
    assert.ok(lbl.some((l) => l.startsWith("Comisión faciales")));
    assert.ok(!lbl.some((l) => l.startsWith("Comisión extras") || l.startsWith("Décimo cuarto") || l.startsWith("Fondo")));
    assert.ok(lbl.some((l) => l.includes("50% (2,5 h)")));
    assert.ok(out.ingresos.every((x) => Number.isFinite(x[1]) && x[1] !== 0));
    assert.deepEqual(out.egresos.map((x) => x[0]), ["Aporte IESS personal (9,45%)"]);
    assert.equal(out.notas.length, 1);
  });

  it("_lineasRol muestra Descuento: motivo aparte de las multas", () => {
    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const pick = (name: string) => {
      const i = src.indexOf("function " + name + "(");
      let depth = 0, j = src.indexOf("{", i);
      for (; j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}" && --depth === 0) break; }
      return src.slice(i, j + 1);
    };
    const fn = new Function(`${pick("_rolNum")}\n${pick("_rolHrs")}\n${pick("_rolDiasLinea")}\n${pick("_lineasRol")}\nreturn _lineasRol;`)() as (d: unknown) => { egresos: [string, number][] };
    const out = fn({
      iess: 45.55, anticipo: 0, multas: 42.5,
      multasDetalle: [
        { tipo: "DESCUENTO", motivo: "Crema Aroms", monto: 32.5, fecha: "2026-11-25" },
        { tipo: "MULTA", motivo: "Clienta insatisfecha", monto: 10, fecha: "2026-11-20" },
      ],
    });
    const lbl = out.egresos.map((x) => x[0]);
    assert.ok(lbl.includes("Descuento: Crema Aroms"), JSON.stringify(lbl));
    assert.ok(lbl.some((l) => l.startsWith("MULTA") && l.includes("2026-11-20")), JSON.stringify(lbl));
    assert.equal(out.egresos.find((x) => x[0] === "Descuento: Crema Aroms")?.[1], 32.5);
  });
});
