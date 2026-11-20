import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");
const upd = html.slice(html.indexOf("window.SunsuUpdate ="), html.indexOf("function mostrarNuevaVersion"));

describe("TK180 el banner de actualización nunca se queda pegado", () => {
  it("la versión de la página es la MISMA que la del service worker (si no, el banner sale siempre)", () => {
    const enSw = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
    const enHtml = (html.match(/window\.SUNSU_CACHE = "([^"]+)"/) || [])[1];
    assert.ok(enSw && enHtml);
    assert.equal(enHtml, enSw);
    assert.equal(enSw, "sunsu-2026-11-20-TK181b");
  });
  it("en la app nativa (TestFlight) no hay banner ni chequeo de SW", () => {
    assert.match(upd, /Capacitor\.isNativePlatform\(\)/);
    assert.match(upd, /if \(esNativa\(\)\) return;/);
    assert.match(upd, /esNativa\(\) \|\| dismissed\(\) \|\| agotado\(\)/);
  });
  it("Actualizar: SKIP_WAITING + espera controllerchange, segundo intento suelta SW y cachés, tope sin bucle", () => {
    assert.match(upd, /SKIP_WAITING/);
    assert.match(upd, /controllerchange/);
    assert.match(upd, /r\.unregister\(\)/);
    assert.match(upd, /caches\.delete/);
    assert.match(upd, /setTimeout\(go, 6000\)/);
    assert.match(upd, /t\.n >= 2/);
    assert.match(upd, /sunsu\.upd\.try/);
    assert.match(upd, /location\.reload\(\)/);
    assert.doesNotMatch(upd, /localStorage\.(removeItem|clear)/);
  });
  it("el script del banner es JavaScript válido", () => {
    assert.doesNotThrow(() => new Function(upd));
  });
});
