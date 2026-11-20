import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { buscarPaquetesEn } from "./paq_buscar.ts";
import type { Row } from "./domain.ts";

const STEPH: Row = {
  id: 300, sheet_row: 302, cedula: "1716920036", nombres: "Stephanie Mireya", apellidos: "Montenegro Vinueza",
  sku: "SUNSU-29", paquete: "PAQUETE (3) FACIALES MIXTOS",
  uso_1: true, fecha_1: "a", uso_2: true, fecha_2: "b", uso_3: true, fecha_3: "c",
  completo: true, codigo: "PACK-295", origin: "sheet",
};
const MIREYA: Row = {
  id: 383, sheet_row: 385, cedula: "102468593.0", nombres: "Mireya Alexandra", apellidos: "Vinueza",
  sku: "SUNSU-20", paquete: "PAQUETE (3) FACIAL SUNSU GOLD-AGING",
  uso_1: true, fecha_1: "a", uso_2: true, fecha_2: "b", uso_3: false, fecha_3: "",
  completo: false, codigo: "PACK-386", origin: "sheet",
};
const LISETH: Row = {
  id: 704, sheet_row: 706, cedula: "401495536.0", nombres: "Liseth", apellidos: "Montenegro",
  sku: "SUNSU-46", paquete: "SUNSU-46 x3 Facial Peeling Marino",
  uso_1: false, fecha_1: "", uso_2: false, fecha_2: "", uso_3: false, fecha_3: "",
  completo: false, codigo: null, beta_codigo: "PQ-0023", origin: "sheet", telefono: "0991111111",
};

describe("TK193 · búsqueda manual incluye completos y no trae teléfonos", () => {
  it("Montenegro trae PACK-295 completo y PQ-0023 activo; Vinueza trae PACK-386 y PACK-295", () => {
    const rows = [STEPH, MIREYA, LISETH];
    const mon = buscarPaquetesEn(rows, { q: "Montenegro", soloActivos: false });
    const monCod = mon.resultados.map((x) => x.codigo);
    assert.ok(monCod.includes("PACK-295"), "PACK-295 completo sale al buscar Montenegro");
    assert.ok(monCod.includes("PQ-0023"), "PQ-0023 activo sale al buscar Montenegro");
    assert.equal(mon.resultados.find((x) => x.codigo === "PACK-295")?.completo, true);
    const vin = buscarPaquetesEn(rows, { q: "Vinueza", soloActivos: false });
    const vinCod = vin.resultados.map((x) => x.codigo);
    assert.ok(vinCod.includes("PACK-386"));
    assert.ok(vinCod.includes("PACK-295"));
    const txt = JSON.stringify({ mon, vin });
    assert.equal(txt.includes("0991111111"), false);
    assert.equal(txt.includes("telefono"), false);
  });
});

describe("TK193 · buscador siempre visible en el ticket", () => {
  const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
  it("el recuadro de canje siempre pinta un buscador con etiqueta, type=text, y lo reinsera si falta", () => {
    assert.match(js, /function _paqBuscaHtml/);
    assert.match(js, /function _paqAsegurarBusca/);
    assert.match(js, /_paqBuscaHtml\(\)/);
    assert.match(js, /label class="paq-busca-lbl" for="paq-busca">Buscar paquete/);
    assert.match(js, /id="paq-busca"[^>]*type="text"/);
    assert.match(js, /activos=0/);
    assert.match(js, /paq-card[\s\S]{0,200}done/);
    assert.match(js, /Completo/);
    assert.match(js, /_paqAsegurarBusca/);
  });
  it("CSS del buscador no se oculta en móvil y cache es TK193", () => {
    assert.match(html, /#paq-box #paq-busca/);
    assert.match(html, /#paq-box #paq-busca[\s\S]{0,400}display: block !important/);
    assert.match(html, /min-height: 44px !important/);
    assert.match(html, /@media \(max-width: 860px\)[\s\S]{0,300}#paq-box #paq-busca/);
    assert.match(html, /SUNSU_CACHE = "sunsu-2026-11-20-TK194"/);
    assert.match(sw, /const CACHE = "sunsu-2026-11-20-TK194"/);
    assert.match(html, /beta-screens\.js\?v=20261120tk194/);
  });
});
