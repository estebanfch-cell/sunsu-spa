import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { acceso, verCostos } from "./permisos.ts";
import { MOV_PERSONAL, SALEN } from "./pagos_caja.ts";

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
  it("recepción (Alejandra) tiene Recepciones sin costos", () => {
    assert.equal(acceso("reception", "recepciones"), "todos");
    assert.equal(verCostos("reception"), false);
  });
  it("caja: personal solo gasto/consumo/entrega para depósito; ingresos solo admin", () => {
    assert.deepEqual([...MOV_PERSONAL].sort(), ["consumo", "deposito", "gasto"]);
    assert.ok(SALEN.has("consumo"));
    assert.equal(acceso("reception", "caja"), "todos");
    const api = readFileSync(new URL("supabase/functions/api/pagos_caja_api.ts", root), "utf8");
    assert.match(api, /!esAdmin\(ses\.rol\) && !MOV_PERSONAL\.has\(tipo\)/);
  });
});
