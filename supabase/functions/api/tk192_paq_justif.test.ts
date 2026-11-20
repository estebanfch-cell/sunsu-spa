import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { buscarPaquetesEn, qEsCodigoPack } from "./paq_buscar.ts";
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
  completo: false, codigo: null, beta_codigo: "PQ-0023", origin: "sheet",
};

describe("TK192 · PQ- y paquetes agotados", () => {
  it("qEsCodigoPack reconoce PACK y PQ", () => {
    assert.equal(qEsCodigoPack("PACK-623"), "PACK-623");
    assert.equal(qEsCodigoPack("pack 23"), "PACK-023");
    assert.equal(qEsCodigoPack("PQ-0023"), "PQ-0023");
    assert.equal(qEsCodigoPack("pq-23"), "PQ-0023");
    assert.equal(qEsCodigoPack("Liseth"), "");
  });
  it("busca a mano PQ-0023 aunque codigo sea null y viva en beta_codigo", () => {
    const r = buscarPaquetesEn([STEPH, MIREYA, LISETH], { q: "PQ-0023", soloActivos: true });
    assert.equal(r.resultados.length, 1);
    assert.equal(r.resultados[0].codigo, "PQ-0023");
    assert.equal(r.resultados[0].quedan, 3);
  });
  it("la cédula de Stephanie no trae activos; PACK-295 sale en agotados", () => {
    const r = buscarPaquetesEn([STEPH, MIREYA, LISETH], { q: "1716920036", soloActivos: true });
    assert.equal(r.resultados.length, 0);
    assert.equal(r.agotados.length, 1);
    assert.equal(r.agotados[0].codigo, "PACK-295");
    assert.equal(r.agotados[0].usados, 3);
  });
  it("PACK-386 se encuentra por Vinueza o por su cédula, no por Montenegro", () => {
    const porNom = buscarPaquetesEn([STEPH, MIREYA, LISETH], { q: "Vinueza", soloActivos: true });
    assert.ok(porNom.resultados.some((x) => x.codigo === "PACK-386"));
    const porCed = buscarPaquetesEn([STEPH, MIREYA, LISETH], { q: "0102468593", soloActivos: true });
    assert.equal(porCed.resultados[0].codigo, "PACK-386");
    const sug = buscarPaquetesEn([STEPH, MIREYA, LISETH], {
      q: "1716920036", nombre: "Stephanie", apellido: "Montenegro Venegas", soloActivos: true,
    });
    assert.ok(sug.sugerencias.some((x) => x.codigo === "PQ-0023"), "Liseth sale por Montenegro");
    assert.ok(!sug.sugerencias.some((x) => x.codigo === "PACK-386"), "Mireya Vinueza no sale solo por Montenegro");
  });
});

describe("TK192 · front canje y motivo de descuento", () => {
  const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
  const just = readFileSync(new URL("../../../descuento_justif.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
  it("el botón de sesión usa data-origen y queda en window, con PQ en la búsqueda", () => {
    assert.match(js, /data-origen/);
    assert.match(js, /window\._paqElegirSesionDe=_paqElegirSesionDe/);
    assert.match(js, /data-origen[\s\S]{0,80}data-i[\s\S]{0,40}data-k/);
    assert.match(js, /PACK \/ PQ|_paqAgotados|PQ-…/);
  });
  it("el motivo aparece en un slot bajo el valor, se rellena en vivo y ofrece Facial prepagado", () => {
    assert.match(js, /id="dsc-justif-slot"/);
    assert.match(js, /function _dscJustifEnsure/);
    assert.match(js, /_dscJustifEnsure\(\)/);
    assert.match(just, /Facial prepagado \/ paquete/);
    assert.match(just, /id: "prepagado"/);
  });
  it("cache TK192 igual en index y sw", () => {
    assert.match(html, /SUNSU_CACHE = "sunsu-2026-11-20-TK194"/);
    assert.match(sw, /const CACHE = "sunsu-2026-11-20-TK194"/);
    assert.match(html, /beta-screens\.js\?v=20261120tk194/);
    assert.match(html, /descuento_justif\.js\?v=20261120tk194/);
  });
});
