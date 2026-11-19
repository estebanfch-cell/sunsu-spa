import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(join(root, "beta.html"), "utf8");
const sw = readFileSync(join(root, "sw.js"), "utf8");
const sql = readFileSync(join(root, "docs/supabase/pending/0056_feriados_2026_nov20.sql"), "utf8");

describe("TK83 config compacto y feriados 2026", () => {
  it("el menú fijo salta a cada sección y la geocerca va en una fila", () => {
    assert.match(html, /function htmlCfgJump\(/);
    assert.match(html, /id="cfg-jump"/);
    assert.match(html, /id="cfg-jump-sel"/);
    assert.match(html, /#cfg-permisos/);
    assert.match(html, /#cfg-comisiones/);
    assert.match(html, /#cfg-geocerca/);
    assert.match(html, /#cfg-feriados/);
    assert.match(html, /#\/m\/usuarios/);
    assert.match(html, /#\/m\/aprobaciones/);
    assert.match(html, /class="cfg-geo"/);
    assert.match(html, /#cfg-page \.ix-lines \{ display: flex; flex-wrap: wrap/);
    assert.match(html, /\.ix-trash \{ background: transparent/);
  });

  it("los feriados se ven en calendario de mes con alta y baja chicas", () => {
    assert.match(html, /function htmlFeriadosCalendario\(/);
    assert.match(html, /class="fer-grid"/);
    assert.match(html, /data-fer-del=/);
    assert.match(html, /data-fer-mes=/);
    assert.match(html, /Decreto Ejecutivo 507/);
    assert.match(html, /Fundación de Quito/);
  });

  it("Asistencia ya no duplica la geocerca ni los feriados", () => {
    assert.equal((html.match(/id="f-asis-cfg"/g) || []).length, 1);
    assert.equal((html.match(/id="f-asis-fer"/g) || []).length, 1);
    assert.doesNotMatch(html, /Latitud del spa/);
    assert.doesNotMatch(html, /<h2>Reglas<\/h2>/);
    assert.match(html, /La geocerca, los feriados y los horarios del local se editan en/);
    assert.match(html, /recargarAsis[\s\S]*\/configuracion/);
  });

  it("el SQL 0056 agrega el 20 de noviembre y Quito 6 y 7 de diciembre, con respaldo", () => {
    assert.match(sql, /asistencia_feriados_bak_20261118/);
    assert.match(sql, /add column if not exists ambito/);
    assert.match(sql, /create table if not exists public\.asistencia_feriados_log/);
    assert.match(sql, /2026-11-20/);
    assert.match(sql, /Decreto Ejecutivo 507/);
    assert.match(sql, /2026-12-06/);
    assert.match(sql, /2026-12-07/);
    assert.match(sql, /2026-12-07[\s\S]*'quito'/);
    assert.doesNotMatch(sql, /drop table public\.asistencia_feriados/i);
    assert.doesNotMatch(sql, /delete from public\.asistencia_feriados/i);
  });

  it("la caché de la app pasa a TK93", () => {
    assert.match(sw, /sunsu-beta-2026-11-19-TK115/);
    assert.doesNotMatch(sw, /sunsu-beta-2026-11-18-TK86/);
    const vers = [...html.matchAll(/\?v=([a-z0-9]+)/g)].map((m) => m[1]);
    assert.ok(vers.length >= 20, "faltan scripts en beta.html");
    assert.ok(vers.every((v) => v === "20261119tk115"), "scripts con versión vieja: " + [...new Set(vers)].join(","));  });});
