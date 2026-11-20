import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { claveOcultarBanner, hayActualizacion, notarMotor, parseCacheSw } from "./sunsu_update.ts";
import { ENGINE_HEADER, SUNSU_ENGINE } from "./sunsu_version.ts";

const root = new URL("../../../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");
const index = readFileSync(new URL("supabase/functions/api/index.ts", root), "utf8");

describe("TK144 banner de actualización discreto", () => {
  it("solo marca diferencia cuando la versión remota ya se conoce y no coincide", () => {
    assert.equal(hayActualizacion("sunsu-a", "sunsu-a", "e1", "e1"), null);
    assert.equal(hayActualizacion("sunsu-a", "sunsu-b", "e1", "e1"), "app");
    assert.equal(hayActualizacion("sunsu-a", "sunsu-a", "e1", "e2"), "motor");
    assert.equal(hayActualizacion("sunsu-a", "", "e1", ""), null);
    const first = notarMotor("", "e2");
    assert.equal(first.primera, true);
    assert.equal(first.localEngine, "e2");
    assert.equal(hayActualizacion("c", "c", first.localEngine, first.remoteEngine), null);
    assert.equal(parseCacheSw('const CACHE = "sunsu-2026-11-20-TK166";'), "sunsu-2026-11-20-TK166");
    assert.equal(claveOcultarBanner("c2", "e2"), "sunsu.banner.hide.c2|e2");
  });

  it("el API expone X-Sunsu-Engine-Version y el SW espera SKIP_WAITING", () => {
    assert.match(index, /Access-Control-Expose-Headers": ENGINE_HEADER/);
    assert.match(index, /\[ENGINE_HEADER\]: SUNSU_ENGINE/);
    assert.equal(ENGINE_HEADER, "X-Sunsu-Engine-Version");
    assert.match(SUNSU_ENGINE, /^sunsu-engine-2026-11-19-TK157$/);
    assert.match(sw, /event\.data\.type === "SKIP_WAITING"/);
    assert.match(sw, /!self\.registration \|\| !self\.registration\.active/);
  });

  it("el banner es compacto, no recarga solo y Actualizar limpia cachés sin borrar la sesión", () => {
    assert.match(html, /Nueva actualización disponible/);
    assert.match(html, /id=\\"sunsu-nueva-ver-btn\\">Actualizar/);
    assert.match(html, /id=\\"sunsu-nueva-ver-x\\"/);
    assert.match(html, /Actualizando…/);
    assert.match(html, /SKIP_WAITING/);
    assert.match(html, /caches\.keys\(\)/);
    assert.match(html, /caches\.delete/);
    assert.match(html, /location\.reload\(\);/); // TK153 (t670u): Actualizar recarga en la misma ruta, sin location.replace
    assert.match(html, /POLL_MS = 180000/);
    assert.match(html, /FOCUS_MS = 30000/);
    assert.match(html, /visibilitychange/);
    assert.match(html, /fetch\("\/sw\.js\?t=" \+ Date\.now\(\), \{ cache: "no-store" \}/);
    assert.match(html, /notarMotor/);
    assert.match(html, /X-Sunsu-Engine-Version/);
    assert.match(html, /#sunsu-nueva-ver \{[^}]*flex-wrap: nowrap/);
    assert.match(html, /sunsu-has-update/);
    assert.match(html, /body\.sunsu-has-update \.top \{ top: 44px; \}/);
    const upd = html.slice(html.indexOf("window.SunsuUpdate ="), html.indexOf("function mostrarNuevaVersion"));
    assert.doesNotMatch(upd, /sessionStorage\.setItem\("sunsu\.reload\." \+ m\[1\]/);
    assert.match(upd, /if \(!clicked\) return;/);
    assert.doesNotMatch(upd, /localStorage\.removeItem/);
    assert.doesNotMatch(upd, /localStorage\.clear/);
    assert.match(upd, /location\.reload\(\)/); // TK153 (t670u): misma ruta, sin location.replace
    assert.doesNotMatch(upd, /searchParams\.set\("sv"/);
  });
});
