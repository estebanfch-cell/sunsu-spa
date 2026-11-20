import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const f = (name: string) => readFileSync(new URL(name, root), "utf8");

describe("TK153 iOS PWA: sin barra de Safari al abrir/actualizar (t670u)", () => {
  it("sw.js sirve la app en /beta.html y /sunsu.html sin redirect", () => {
    const sw = f("sw.js");
    assert.match(sw, /"\/beta\.html"/);
    assert.match(sw, /"\/sunsu\.html"/);
    assert.match(sw, /event\.request\.mode === "navigate"/);
    assert.match(sw, /appEnMismaRuta\(\)/);
    const fn = sw.slice(sw.indexOf("async function appEnMismaRuta"));
    assert.match(fn, /new Response\(/);
    assert.match(fn, /caches\.match\("\/"\)/);
  });
  for (const page of ["beta.html", "sunsu.html"]) {
    it(`${page} solo redirige fuera del modo standalone`, () => {
      const html = f(page);
      assert.match(html, /window\.navigator\.standalone === true/);
      assert.match(html, /\(display-mode: standalone\)/);
      assert.match(html, /if \(!standalone\) \{ location\.replace\(destino\); return; \}/);
      assert.match(html, /var destino = "\.\/" \+/);
      assert.match(html, /document\.write\(html\)/);
      assert.doesNotMatch(html, /location\.replace\("\/"/);
      const js = html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"));
      new Function(js); // sintaxis válida
    });
  }
  it("Actualizar recarga en la misma ruta (location.reload, sin ?sv=)", () => {
    const html = f("index.html");
    const ini = html.indexOf("function actualizar()");
    const cuerpo = html.slice(ini, html.indexOf("function onFocus()", ini));
    assert.match(cuerpo, /location\.reload\(\)/);
    assert.doesNotMatch(cuerpo, /searchParams\.set\("sv"/);
    assert.doesNotMatch(cuerpo, /location\.replace\(/);
    assert.doesNotMatch(cuerpo, /location\.href\s*=/);
  });
});
