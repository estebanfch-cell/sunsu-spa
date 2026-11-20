// TK186 (Emilia): la cosmetóloga en la tabla de Tickets va con su PRIMER nombre completo, nunca cortado.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../../../", import.meta.url);
const file = (n: string) => readFileSync(new URL(n, root), "utf8");

function mcColor(colores: Record<string, string>) {
  const src = file("mc-nav.js");
  const ini = src.indexOf("  function oscuro("), fin = src.indexOf("  if (typeof document !== \"undefined\") (function () { var st");
  const w: Record<string, unknown> = {};
  new Function("window", "colorDe", src.slice(ini, fin))(w, (n: string) => colores[n] || "");
  return w.MCColor as { pillCorto: (n: string) => string };
}

describe("TK186 cosmetóloga: primer nombre, sin cortar", () => {
  it("pillCorto muestra solo el primer nombre, color del nombre completo y el completo en el tooltip", () => {
    const C = mcColor({ "Alejandra Rodriguez": "#FFF1B8" });
    const h = C.pillCorto("Alejandra Rodriguez");
    assert.match(h, />Alejandra<\/span>$/);
    assert.match(h, /title="Alejandra Rodriguez"/);
    assert.match(h, /background:#FFF1B8/);
    assert.match(C.pillCorto("Lic. Daniela Mora"), />Daniela</);
    assert.match(C.pillCorto("Dejaneira Espinoza"), />Dejaneira</);
  });
  it("la tabla usa pillCorto y la celda nunca pone «…»", () => {
    assert.match(file("beta-screens.js"), /c\.k==='cos'\) return '<td>'\+\(window\.MCColor&&window\.MCColor\.pillCorto/);
    const html = file("index.html");
    assert.match(html, /\.tk-table td\[data-c="cos"\] \{ overflow: visible; text-overflow: clip; white-space: nowrap; \}/);
    assert.match(file("mc-nav.js"), /\.mc-cos\{[^}]*text-overflow:clip\}/);
    assert.match(file("mc-maestro.js"), /MCColor\.pillCorto\(nom\)/);
  });
});
