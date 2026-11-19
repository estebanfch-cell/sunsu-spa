import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const ap = readFileSync(join(root, "mc-aperturas.js"), "utf8");
const prod = readFileSync(join(root, "mc-productos.js"), "utf8");
const maestro = readFileSync(join(root, "mc-maestro.js"), "utf8");
const tickets = readFileSync(join(root, "mc-tickets.js"), "utf8");
const clientes = readFileSync(join(root, "mc-clientes.js"), "utf8");
const prov = readFileSync(join(root, "mc-proveedores.js"), "utf8");
const sw = readFileSync(join(root, "sw.js"), "utf8");
const beta = readFileSync(join(root, "beta.html"), "utf8");
const api = readFileSync(join(root, "supabase/functions/api/aperturas_api.ts"), "utf8");

describe("TK136 Aplica a faciales compacto + una sola lista", () => {
  it("la ficha de producto no mete una segunda lista al lado del detalle", () => {
    assert.match(prod, /function fichaHtml\(/);
    assert.doesNotMatch(prod, /placeholder="Filtrar la lista"/);
    assert.doesNotMatch(prod, /<aside class="mcp-side">/);
    assert.match(prod, /\.mcp-side,\.ss-md \.mcp-side\{display:none!important\}/);
    assert.match(prod, /function hayCambios\(\)/);
    assert.match(prod, /aplicaDirty\(\) \? 1 : 0/);
    assert.match(prod, /MCAperturas\.aplicaGuardar/);
    // Tickets / Clientas / Proveedores no arrastran una segunda barra «Filtrar la lista».
    for (const [n, src] of [["tickets", tickets], ["clientes", clientes], ["proveedores", prov]] as const) {
      assert.doesNotMatch(src, /placeholder="Filtrar la lista"/, n);
      assert.doesNotMatch(src, /<aside class="mcp-side">/, n);
    }
    assert.match(maestro, /placeholder="Filtrar…"/);
  });

  it("Aplica a faciales es una tabla compacta con Guardar/Descartar sucios y no burbujas", () => {
    assert.match(ap, /mcap-aplica-grid/);
    assert.match(ap, /mcap-aplica-row/);
    assert.match(ap, /flex-direction:row!important/);
    assert.match(ap, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
    assert.match(ap, /@media\(max-width:860px\)\{\.mcap-aplica-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/);
    assert.match(ap, /id="mcap-todos">Todos/);
    assert.match(ap, /id="mcap-ninguno">Ninguno/);
    assert.match(ap, /id="mcap-apx"/);
    assert.match(ap, /ok\.disabled = !dirty/);
    assert.doesNotMatch(ap, /class="mcap-chips"/);
    assert.doesNotMatch(ap, /sel\.indexOf\(f\.code\)/);
    assert.match(api, /arr\(prod\.beta_aplica_faciales\)\.map\(\(x\) => s\(x\)\.toUpperCase\(\)/);
    assert.match(api, /No se pudo guardar la selección de faciales/);
  });

  it("el cache de la beta apunta a TK138", () => {
    assert.match(sw, /const CACHE = "sunsu-beta-2026-11-19-TK138"/);
    assert.match(beta, /window\.SUNSU_CACHE = "sunsu-beta-2026-11-19-TK138"/);
    assert.match(beta, /mc-productos\.js\?v=20261119tk138/);
    assert.match(beta, /mc-aperturas\.js\?v=20261119tk138/);
    assert.doesNotMatch(sw, /sunsu-beta-2026-11-19-TK135/);
    assert.doesNotMatch(beta, /20261119tk135/);
  });
});
