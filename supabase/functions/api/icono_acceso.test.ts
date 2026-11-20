import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(join(root, "index.html"), "utf8");
const sw = readFileSync(join(root, "sw.js"), "utf8");
const man = readFileSync(join(root, "manifest.webmanifest"), "utf8");
const sql = readFileSync(join(root, "docs/supabase/pending/0060_credenciales_debe_cambiar.sql"), "utf8");
const acc = readFileSync(join(root, "mc-acceso.js"), "utf8");

describe("TK100 icono oficial y primer ingreso", () => {
  it("el manifiesto y beta.html usan el logo Sunsu, no la S color vino", () => {
    assert.match(man, /"name": "순수 Sunsu Spa"/);
    assert.match(man, /"short_name": "Sunsu"/);
    assert.match(man, /icon-sunsu-180\.png/);
    assert.match(man, /icon-sunsu-512\.png/);
    assert.match(man, /#5B7FA6/);
    assert.doesNotMatch(man, /icon-beta\.svg|#8d4b38/);
    assert.match(html, /<title>순수 Sunsu Spa<\/title>/);
    assert.match(html, /apple-touch-icon" href="\/icon-sunsu-180\.png"/);
    assert.match(html, /icon-sunsu-192\.png/);
    assert.doesNotMatch(html, /data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHe/);
    assert.match(sw, /sunsu-2026-11-19-TK157/);    assert.match(sw, /icon-sunsu-180\.png/);
  });

  it("el primer ingreso con clave temporal obliga a elegir una nueva", () => {
    assert.match(html, /function paintCambiarClave/);
    assert.match(html, /Elige tu contraseña/);
    assert.match(html, /debe_cambiar/);  // flag de API, no el secreto
    assert.match(acc, /debe cambiar clave/);
    assert.match(acc, /contraseña temporal/);
    assert.match(sql, /debe_cambiar_pass boolean not null default false/);
    assert.doesNotMatch(sql, /pass_hash|pin_hash/);
  });
});
