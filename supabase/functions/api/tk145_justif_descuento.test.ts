// TK145: dropdown de motivo y no bloquear gift / $0 / F&F / pago directo / promo auto.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
const _srcJust = readFileSync(new URL("../../../descuento_justif.js", import.meta.url), "utf8");
const J = new Function("globalThis", "module", "exports", _srcJust + "; return (typeof globalThis!=='undefined'&&globalThis.SunsuDescJustif) || (typeof module!=='undefined'&&module.exports);")({}, { exports: {} }, {});

describe("SunsuDescJustif · cuándo pedir motivo", () => {
  it("no pide motivo si ya hay gift card, aunque haya un desc. de línea de $30", () => {
    const t = { cobro: "giftcard", codigoGC: "26-069", gcAplica: 65, lineDesc: { f: { v: 30 } }, justificacionDescuento: "" };
    assert.equal(J.pideJustificacion(t, 0), false);
    assert.equal(J.justificacionOk(t, 0), true);
    assert.equal(J.motivoAuto(t), "giftcard");
    assert.equal(J.textoJustificacion(t), "Gift card");
  });
  it("Personalizado $0 no bloquea", () => {
    const t = { descuento: { tipo: "custom", custom: 0, customMode: "valor" }, lineDesc: {} };
    assert.equal(J.pideJustificacion(t, 0), false);
    assert.equal(J.justificacionOk(t, 0), true);
  });
  it("F&F, pago directo, paquete y cortesía no bloquean", () => {
    assert.equal(J.pideJustificacion({ descuento: { tipo: "ff" } }, 14), false);
    assert.equal(J.pideJustificacion({ descuento: { tipo: "directo" } }, 0), false);
    assert.equal(J.pideJustificacion({ cobro: "paquete" }, 0), false);
    assert.equal(J.pideJustificacion({ cobro: "cortesia" }, 0), false);
  });
  it("promo automática sola no bloquea; un desc. de línea manual sí", () => {
    const promo = { _promoIds: ["p1"], lineDesc: { f: { v: 10, promo: true } }, descuento: { tipo: null, custom: 0 } };
    assert.equal(J.pideJustificacion(promo, 0), false);
    const manual = { lineDesc: { f: { v: 30 } }, descuento: { tipo: "custom", custom: 0 } };
    assert.equal(J.pideJustificacion(manual, 0), true);
    assert.equal(J.justificacionOk(manual, 0), false);
  });
  it("Personalizado > $0 exige motivo; Otra exige texto", () => {
    const t = { descuento: { tipo: "custom", custom: 30, customMode: "valor" }, lineDesc: {} };
    assert.equal(J.pideJustificacion(t, 30), true);
    assert.equal(J.justificacionOk(t, 30), false);
    t.justificacionMotivo = "promo";
    assert.equal(J.justificacionOk(t, 30), true);
    assert.equal(J.textoJustificacion(t), "Promoción");
    t.justificacionMotivo = "otra";
    t.justificacionOtra = "";
    assert.equal(J.justificacionOk(t, 30), false);
    t.justificacionOtra = "Cortesía de Emilia";
    assert.equal(J.justificacionOk(t, 30), true);
    assert.equal(J.textoJustificacion(t), "Cortesía de Emilia");
  });
  it("el helper exporta las 6 opciones del dropdown", () => {
    assert.deepEqual(J.OPS.map((o) => o.label), [
      "Gift card", "Promoción", "Cortesía", "Friends & Family", "Pago directo", "Otra (especificar)",
    ]);
  });
});

describe("front TK145 · dropdown en DESCUENTOS, contraste y toast que envuelve", () => {
  const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
  it("el formulario pinta el select de motivo y no bloquea gift / $0", () => {
    assert.match(js, /dsc-justif-sel/);
    assert.match(js, /SunsuDescJustif/);
    assert.match(js, /justificacionOk/);
    assert.match(js, /pideJustificacion/);
  });
  it("el input de Personalizado tiene contraste (fondo claro, texto navy)", () => {
    assert.match(js, /id="dsc-custom-inp"/);
    assert.match(js, /id="dsc-custom-inp"[\s\S]{0,1800}background:#fff/);
    assert.match(js, /id="dsc-custom-inp"[\s\S]{0,1800}color:var\(--navy\)/);
  });
  it("el toast deja de usar nowrap para no cortarse en móvil", () => {
    assert.match(html, /\.toast\s*\{[^}]*white-space:\s*normal/);
    assert.doesNotMatch(html, /\.toast\s*\{[^}]*white-space:\s*nowrap/);
  });
  it("el lookup de gift card muestra la etiqueta 26-XXX · $95 (Reset)", () => {
    assert.match(js, /gc-saldo-hint/);
    assert.match(js, /hit\.etiqueta|T\._gcEtiqueta|_gcFacial/);
  });
});
