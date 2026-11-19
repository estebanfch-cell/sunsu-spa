import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(join(root, "sunsu.html"), "utf8");

describe("TK101 corte: sunsu.html abre la beta", () => {
  it("la URL guardada en el iPhone redirige a /beta.html y no incluye el motor viejo", () => {
    assert.match(html, /location\.replace\("\/beta\.html"/);
    assert.match(html, /meta http-equiv="refresh" content="0;url=\/beta\.html"/);
    assert.doesNotMatch(html, /function doLogin\s*\(/);
    assert.doesNotMatch(html, /SUNSU_APP_VERSION/);
    assert.doesNotMatch(html, /google\.script\.run/);
    assert.match(html, /icon-sunsu-180\.png/);
    assert.match(html, /<title>순수 Sunsu Spa<\/title>/);
  });
});
