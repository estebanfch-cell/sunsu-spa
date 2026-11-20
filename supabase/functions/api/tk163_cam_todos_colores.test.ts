import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const screens = readFileSync(new URL("beta-screens.js", root), "utf8");
const html = readFileSync(new URL("index.html", root), "utf8");

describe("TK163 cámara para todos + colores de tarjeta", () => {
  it("la cámara no depende del rol ni de «Ver como»", () => {
    assert.match(screens, /function _histPuedeCamara\(\)\{ return true; \}/);
    assert.doesNotMatch(screens, /r==='reception'\|\|r==='recepcion'\|\|r==='staff'/);
  });
  it("en «Ver como» se ve pero no sube", () => {
    assert.match(screens, /if\(_histVistaLectura\(\)\) return '<label class="mob-cam/);
  });
  it("sin capture=environment en la cámara de la lista", () => {
    const f = screens.slice(screens.indexOf("function _histCamHTML"), screens.indexOf("var CAM_ICON_SVG"));
    assert.doesNotMatch(f, /capture=/);
  });
  it("amarillo solo por voucher; franja por WhatsApp pendiente", () => {
    assert.match(screens, /function _tkFaltaVoucher\(t\)/);
    assert.match(screens, /\(waP\?' tk-wapend':''\)/);
    assert.match(html, /\.mob-card\.tk-wapend \{/);
  });
});
