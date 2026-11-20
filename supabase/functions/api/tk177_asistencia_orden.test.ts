import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
const pick = (name: string) => { const i = src.indexOf("function " + name + "("); let d = 0, j = src.indexOf("{", i); for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}" && --d === 0) break; } return src.slice(i, j + 1); };
const esc = (x: unknown) => String(x ?? "");

describe("TK177 Mi asistencia ordenada", () => {
  it("rol de pagos en tabla Horas | Valor y sin explicación larga ni «Sumar rango»", () => {
    const f = new Function("esc", [pick("mon2"), pick("htmlAsisRolMes")].join("\n") + ";return htmlAsisRolMes;")(esc);
    const html = f({ mes: 11, hrsNormales: 99.85, hrsSupl: 2.75, valSupl: 8.28, hrsExtr: 9.5, valExtr: 38.15, regla: "recorte 15", diasTrabajados: 12 });
    assert.match(html, /<table class="asis-rol-tabla">/);
    assert.match(html, /<td>Suplementarias 50%<\/td><td class="num">2 h 45 min<\/td><td class="num">\$8\.28<\/td>/);
    assert.match(html, /<td>Extraordinarias 100%<\/td>/);
    assert.doesNotMatch(html, /días trabajados|recorte/);
    assert.doesNotMatch(src, /Sumar rango/);
  });

  it("calendario: verde trabajado, rojo falta, celeste descanso, morado feriado, futuro neutro, leyenda", () => {
    const f = new Function("esc", "ymdGuayaquil", ["hHm", "minDia", "etiquetaDiaAsis", "htmlAsisMesGrid"].map(pick).join("\n") + ";return htmlAsisMesGrid;")(esc, () => "2026-11-20");
    const dias = [
      { fecha: "2026-11-03", workedMin: 584, esFeriado: true, esDescanso: true },
      { fecha: "2026-11-04", workedMin: 560 },
      { fecha: "2026-11-05", workedMin: 0, falta: true },
      { fecha: "2026-11-08", workedMin: 0, esDescanso: true },
      { fecha: "2026-11-02", workedMin: 0, esFeriado: true },
      { fecha: "2026-11-01", workedMin: 0, falta: true, antesIngreso: true },
      { fecha: "2026-11-24", workedMin: 0 },
    ];
    const html = f({ dias, feriados: ["2026-11-02", "2026-11-03"] }, "2026-11-01");
    const celda = (n: number) => html.split('<div class="asis-celda').find((c) => c.includes(`<span class="n">${n}<`) || c.includes(`<span class="n">${n}<i`)) || "";
    assert.match(celda(3), /^ c-trab[\s\S]*c-ind-fer[\s\S]*9 h 44 min/);
    assert.match(celda(4), /^ c-trab/);
    assert.match(celda(5), /^ c-falta[\s\S]*Falta/);
    assert.match(celda(8), /^ c-desc[\s\S]*Descanso/);
    assert.match(celda(2), /^ c-fer[\s\S]*Feriado/);
    assert.doesNotMatch(celda(1), /c-falta/);
    assert.doesNotMatch(celda(24), /c-trab|c-falta|c-desc|c-fer/);
    assert.match(html, /asis-leyenda/);
  });
});
