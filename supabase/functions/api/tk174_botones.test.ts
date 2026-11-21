import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
const pick = (name: string) => {
  const i = src.indexOf("function " + name + "(");
  let d = 0, j = src.indexOf("{", i);
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}" && --d === 0) break; }
  return src.slice(i, j + 1);
};
const fns = new Function(["estadoAsisHoy", "fmtCrono", "htmlBotonesAsis"].map(pick).join("\n") + ";return { estadoAsisHoy, fmtCrono, htmlBotonesAsis };")();
const ts = (h: string) => `2026-11-20T${h}:00-05:00`;

describe("TK174 botones de Mi asistencia", () => {
  it("verde para entrar, amarillo con cronómetro y rojo para salir, almuerzo en pausa y total al salir", () => {
    assert.match(fns.htmlBotonesAsis([]), /asis-verde[^>]*data-marca="entrada">Registrar entrada/);
    const trab = fns.htmlBotonesAsis([{ tipo: "entrada", ts: ts("09:30") }]);
    assert.match(trab, /asis-amarillo/);
    assert.match(trab, /data-crono>\d{2}:\d{2}:\d{2}/);
    assert.match(trab, /asis-rojo[^>]*data-marca="salida">Registrar salida/);
    // TK198 (Emilia): sin botones de almuerzo; una marca de almuerzo vieja no cambia el estado.
    assert.doesNotMatch(trab, /almuerzo/);
    const alm = fns.htmlBotonesAsis([{ tipo: "entrada", ts: ts("09:30") }, { tipo: "almuerzo_inicio", ts: ts("13:00") }]);
    assert.match(alm, /asis-rojo[^>]*data-marca="salida">Registrar salida/);
    assert.doesNotMatch(alm, /Fin almuerzo|Iniciar almuerzo/);
    const fin = fns.htmlBotonesAsis([{ tipo: "entrada", ts: ts("09:30") }, { tipo: "almuerzo_inicio", ts: ts("13:00") }, { tipo: "almuerzo_fin", ts: ts("14:00") }, { tipo: "salida", ts: ts("18:30") }]);
    assert.match(fin, /Jornada terminada/);
    assert.match(fin, /09:00:00/);
    assert.doesNotMatch(fin, /data-marca=/);
    // las marcas anuladas no cuentan
    assert.match(fns.htmlBotonesAsis([{ tipo: "entrada", ts: ts("09:30"), anulado: true }]), /Registrar entrada/);
  });

  it("los botones siguen arriba de todo y la marca da aviso claro", () => {
    assert.ok(src.indexOf('<div class="card asis-hoy-top">') < src.indexOf("${htmlAsisCalendario(cal, vistaAsis, fechaAsis)}"));
    assert.match(src, /Entrada registrada ✓/);
    assert.match(src, /Registrando…/);
    assert.match(src, /wireCronoAsis\(main\)/);
  });
});
