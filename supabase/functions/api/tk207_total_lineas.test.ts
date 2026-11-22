import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Row } from "./domain.ts";
import { alertaDescuadreCobrado, sumaPagosBeta } from "./tickets_beta_api.ts";
import { totalDeLineas, totalValorTicket } from "./ticket_lista_card.ts";

describe("TK207 · el valor del ticket es la suma de las líneas, nunca lo cobrado", () => {
  const map = new Map<string, Row>([
    ["40", { sku: "SUNSU-40", total_con_iva: 95, producto_servicio: "FACIAL RESET 3x1" }],
    ["31", { sku: "SUNSU-31", total_con_iva: 15, producto_servicio: "PDRN SERUM" }],
  ]);
  const r: Row = {
    estimado: 14.996,
    facial_hecho: "SUNSU-40 Facial Reset 3x1",
    servicios_adicionales: "SUNSU-31 PDRN Serum",
    paquete: "",
  };

  it("totalValorTicket suma $95 + $15 e ignora el estimado $15 de la hoja", () => {
    const tot = totalValorTicket(r, { map, canje: false });
    assert.equal(tot, 110);
  });

  it("totalDeLineas suma todas las líneas y omite DIF", () => {
    assert.equal(totalDeLineas([
      { tipo: "facial", precio_unit: 95, cantidad: 1, total_linea: 95 },
      { tipo: "extra", precio_unit: 15, cantidad: 1, total_linea: 15 },
      { tipo: "diferencia", sku: "DIF", nombre: "Diferencia sin explicar", total_linea: 80 },
    ]), 110);
  });

  it("sumaPagosBeta incluye todos los pagos no anulados; el aviso desaparece si cuadra con las líneas", () => {
    const cobrado = sumaPagosBeta([
      { monto: 95, anulado: false },
      { monto: 15 },
      { monto: 15, anulado: true },
    ]);
    assert.equal(cobrado, 110);
    assert.equal(alertaDescuadreCobrado(cobrado, 110), null);
    assert.match(alertaDescuadreCobrado(15, 110) || "", /Lo cobrado \(\$15\.00\) no cuadra con las líneas \(\$110\.00\)/);
  });

  it("vistaTicket usa la suma de pagos, no el estimado, para el aviso de descuadre", () => {
    const api = readFileSync(new URL("./tickets_beta_api.ts", import.meta.url), "utf8");
    assert.match(api, /alertaDescuadreCobrado\(sumaPagosBeta/);
    assert.doesNotMatch(api, /alertaDescuadreCobrado\(n\(r\.estimado\)/);
  });

  it("la lista y _histMontos muestran t.total (líneas), no lo cobrado", () => {
    const lista = readFileSync(new URL("./tickets_lista_api.ts", import.meta.url), "utf8");
    assert.match(lista, /totalValorTicket/);
    assert.match(lista, /el valor de la lista es el total de las líneas, nunca lo cobrado/);
    const screens = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const start = screens.indexOf("function _histMontos");
    const end = screens.indexOf("function _histEstadoDoc");
    assert.ok(start >= 0 && end > start);
    const fn = screens.slice(start, end);
    assert.match(fn, /t\.total/);
    const hist = new Function("t", fn + "; return _histMontos(t);");
    assert.equal(hist({ total: 110, estimado: 15 }).tot, 110);
    assert.equal(hist({ estimado: 15 }).tot, 15);
  });

  it("la caché de la página coincide con el service worker TK207", () => {
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    const sw = readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
    const enHtml = (html.match(/window\.SUNSU_CACHE = "([^"]+)"/) || [])[1];
    const enSw = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
    assert.equal(enHtml, enSw);
    assert.equal(enSw, "sunsu-2026-11-21-TK210");
  });
});
