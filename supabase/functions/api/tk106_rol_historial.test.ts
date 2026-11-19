import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const beta = () => readFileSync(join(root, "beta.html"), "utf8");

describe("TK106 · historial de roles del personal", () => {
  it("tiene botón Historial, años que se abren y meses tappeables", () => {
    const html = beta();
    assert.match(html, /id="rol-historial-btn"/);
    assert.match(html, />Historial</);
    assert.match(html, /function htmlRolHistorial/);
    assert.match(html, /data-rol-anio=/);
    assert.match(html, /class="rol-mes-btn"/);
    assert.match(html, /Todavía no tienes roles en el historial/);
    assert.match(html, /Cuando administración apruebe tu rol, aparece aquí/);
    // El preview oficial (solo lectura para staff) se reutiliza al abrir un mes.
    assert.match(html, /mostrarRolOficial\(pack\)/);
    assert.match(html, /#rol-historial-btn \{ width: 100%/);
    assert.match(html, /@media \(max-width: 375px\)/);
    assert.match(html, /grid-template-columns: minmax\(0, 1fr\)/);
  });

  it("sube el cache a TK106", () => {
    const html = beta();
    const sw = readFileSync(join(root, "sw.js"), "utf8");
    assert.match(html, /20261119tk137/);
    assert.match(sw, /sunsu-beta-2026-11-19-TK137/);    assert.doesNotMatch(sw, /sunsu-beta-2026-11-18-TK107/);
  });
});
