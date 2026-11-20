import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(join(root, "sunsu.html"), "utf8");

describe("TK101/TK151 corte: sunsu.html y beta.html abren la app en la raíz", () => {
  it("la URL guardada en el iPhone redirige a / (mismo origen) y no incluye el motor viejo", () => {
    // TK153 (t670u): fuera del icono redirige a ./ ; dentro del icono (standalone) carga la app en la misma ruta.
    assert.match(html, /var destino = "\.\/" \+ \(location\.search \|\| ""\) \+ \(location\.hash \|\| ""\)/);
    assert.match(html, /if \(!standalone\) \{ location\.replace\(destino\); return; \}/);
    assert.match(html, /<noscript><meta http-equiv="refresh" content="0;url=\/"><\/noscript>/);
    assert.doesNotMatch(html, /beta\.html/);
    assert.doesNotMatch(html, /function doLogin\s*\(/);
    assert.doesNotMatch(html, /SUNSU_APP_VERSION/);
    assert.doesNotMatch(html, /google\.script\.run/);
    assert.match(html, /icon-sunsu-180\.png/);
    assert.match(html, /<title>순수 Sunsu Spa<\/title>/);
  });
  it("beta.html redirige a / conservando ?query y #hash (íconos instalados y #/reset/)", () => {
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    assert.match(beta, /var destino = "\.\/" \+ \(location\.search \|\| ""\) \+ \(location\.hash \|\| ""\)/);
    assert.match(beta, /if \(!standalone\) \{ location\.replace\(destino\); return; \}/);
    assert.doesNotMatch(beta, /function draw|localStorage\.(removeItem|clear)/);
    assert.ok(beta.length < 4000, "beta.html es solo el redirect / alias standalone");
    const man = JSON.parse(readFileSync(new URL("../../../manifest.webmanifest", import.meta.url), "utf8"));
    assert.equal(man.start_url, "./"); assert.equal(man.scope, "./");
    assert.doesNotMatch(man.name + man.short_name, /beta/i);
  });
});
