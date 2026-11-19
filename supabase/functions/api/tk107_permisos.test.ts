import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(join(root, "index.html"), "utf8");
const nav = readFileSync(join(root, "mc-nav.js"), "utf8");

function fmtFromApp() {
  const start = html.indexOf("const MESES_CORTO");
  const end = html.indexOf("function htmlFeriadosCalendario");
  assert.ok(start > 0 && end > start, "no se encontró fmtRangoCorto");
  // eslint-disable-next-line no-eval
  return eval(html.slice(start, end) + "; ({ fmtRangoCorto, MESES_CORTO })");
}

describe("TK107 Permisos y vacaciones es un módulo propio", () => {
  it("está en el menú del personal junto a Asistencia, comisiones y rol", () => {
    assert.match(nav, /"Permisos y vacaciones", "#\/m\/personal\/permisos"/);
    assert.match(nav, /mia\("Mis comisiones"\), "#\/m\/personal\/comisiones"/);
    assert.match(nav, /mia\("Mi rol de pagos"\), "#\/m\/personal\/rol"/);
    assert.match(nav, /mia\("Mi asistencia"\), "#\/m\/personal\/asistencia"/);
    assert.match(html, /route\.sub === "permisos"\) return renderPersonalPermisos\(\)/);
  });

  it("en Asistencia no se lista el bloque; solo un botón que abre el módulo", () => {
    const fn = html.split("function htmlAsisCalendario")[1].split("async function renderAsistencia")[0];
    assert.match(fn, /data-go="#\/m\/personal\/permisos"/);
    assert.doesNotMatch(fn, /Vacaciones: \$\{esc\(vac\.diasDisponibles/);
    assert.doesNotMatch(fn, /cal\.permisos \|\| \[\]\)\.map/);
  });

  it("el módulo muestra días disponibles, botón para solicitar y la lista con estado", () => {
    const fn = html.split("async function renderPersonalPermisos")[1].split("async function renderPersonalMultas")[0];
    assert.match(fn, /días disponibles/);
    assert.match(fn, /id="perm-pedir"/);
    assert.match(fn, /Solicitar permiso o vacaciones/);
    assert.match(fn, /<h2>Solicitudes<\/h2>/);
    assert.match(fn, /sol-estado/);
    assert.match(fn, /fmtRangoCorto\(p\.desde, p\.hasta\)/);
    assert.match(fn, /perm-page/);
    assert.match(html, /#perm-pedir[\s\S]*perm\.hidden = false/);
  });

  it("las fechas van compactas en una sola línea, sin partir el rango ISO", () => {
    const { fmtRangoCorto } = fmtFromApp();
    assert.equal(fmtRangoCorto("2026-08-24", "2026-08-30"), "24 ago – 30 ago 2026");
    assert.equal(fmtRangoCorto("2026-08-24", "2026-08-24"), "24 ago 2026");
    assert.equal(fmtRangoCorto("2025-12-31", "2026-01-02"), "31 dic 2025 – 2 ene 2026");
    assert.match(html, /\.perm-rango[^}]*white-space:\s*nowrap/);
    assert.match(html, /\.perm-page[^}]*overflow-x:\s*hidden/);
  });
});
