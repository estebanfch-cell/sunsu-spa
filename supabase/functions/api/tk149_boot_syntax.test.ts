import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../../../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");

function scriptsInline(src: string): string[] {
  const out: string[] = [];
  const re = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

function srcs(src: string): string[] {
  return [...src.matchAll(/<script[^>]+src="([^"?]+)/g)].map((m) => m[1].replace(/^\//, ""));
}

function nodeCheck(js: string, label: string) {
  const dir = mkdtempSync(join(tmpdir(), "sunsu-boot-"));
  const file = join(dir, label + ".js");
  writeFileSync(file, js);
  const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  try { unlinkSync(file); } catch { /* temp */ }
  assert.equal(r.status, 0, (r.stderr || r.stdout || "node --check failed") + " [" + label + "]");
}

describe("TK149 arranque: script principal parsea y no deja la pantalla vacía", () => {
  it("tokenResetHash cierra la función antes de nombreHeader", () => {
    const a = html.indexOf("function tokenResetHash()");
    const b = html.indexOf("function nombreHeader()");
    assert.ok(a > 0 && b > a);
    const mid = html.slice(a, b);
    assert.match(mid, /return "";\s*\}/);
    assert.doesNotMatch(mid, /return "";\s*\nfunction nombreHeader/);
  });

  it("todos los scripts inline de beta.html parsean", () => {
    const L = scriptsInline(html);
    assert.ok(L.length >= 3, "faltan scripts inline");
    L.forEach((js, i) => nodeCheck(js, "inline-" + i));
  });

  it("hay guard de recuperación y draw() va en try/catch", () => {
    assert.match(html, /function pintarRecuperacion/);
    assert.match(html, /sunsuPantallaRecuperacion/);
    assert.match(html, />Recargar</);
    assert.match(html, /Entrar de nuevo/);
    assert.match(html, /typeof window\.draw !== "function"/);
    assert.match(html, /_sunsuDraw\.catch/);
    assert.match(html, /sunsuPantallaRecuperacion\(eDraw\)/);
  });

  it("el SW cubre mc-borradores.js y comparte pin de caché con beta.html", () => {
    assert.match(sw, /const CACHE = "sunsu-2026-11-20-TK178"/);
    assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-20-TK178"/);
    assert.match(html, /20261120tk178/);
    assert.match(sw, /"\/mc-borradores\.js"/);
    const files = [...sw.matchAll(/"\/([^"]+\.js)"/g)].map((m) => m[1]);
    for (const s of srcs(html)) {
      if (s.endsWith(".js")) assert.ok(files.includes(s), "SW FILES no cubre " + s);
    }
  });
});
