import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { pagosFaltanFoto, etiquetaFotoPago, tipoFotoPago } from "./tickets_beta_api.ts";

const tk = () => readFileSync(new URL("../../../mc-tickets.js", import.meta.url), "utf8");
const screens = () => readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");

describe("TK104 · botón de foto solo si falta el comprobante", () => {
  it("efectivo no pide foto", () => {
    const r = pagosFaltanFoto({ beta: [{ id: "1", metodo: "efectivo", monto: 10 }], comps: [] });
    assert.equal(r.length, 0);
  });

  it("tarjeta sin comprobante_id pide botón Tarjeta", () => {
    const r = pagosFaltanFoto({ beta: [{ id: "p1", metodo: "tarjeta", monto: 20 }], comps: [], fecha: "2026-11-18T18:00:00" });
    assert.equal(r.length, 1);
    assert.equal(r[0].etiqueta, "Tarjeta");
    assert.equal(r[0].id, "p1");
  });

  it("transferencia sin foto pide Transferencia; con foto no", () => {
    const sin = pagosFaltanFoto({ beta: [{ id: "t1", metodo: "transferencia" }], comps: [] });
    assert.deepEqual(sin.map((x) => x.etiqueta), ["Transferencia"]);
    const con = pagosFaltanFoto({ beta: [{ id: "t1", metodo: "transferencia", comprobante_id: "abc" }], comps: [] });
    assert.equal(con.length, 0);
    const ligada = pagosFaltanFoto({ beta: [{ id: "t1", metodo: "transferencia" }], comps: [{ pago_id: "t1", url: "archivo:x" }] });
    assert.equal(ligada.length, 0);
  });

  it("un botón por tipo, no por cada pago", () => {
    const r = pagosFaltanFoto({
      beta: [
        { id: "a", metodo: "tarjeta" },
        { id: "b", metodo: "tarjeta" },
        { id: "c", metodo: "transferencia" },
      ],
      comps: [],
      fecha: "2026-11-18T18:00:00",
    });
    assert.deepEqual(r.map((x) => x.etiqueta), ["Tarjeta", "Transferencia"]);
    assert.equal(r[0].id, "a");
    assert.equal(r[1].id, "c");
  });

  it("si todos tienen foto, ningún botón; canje y gift tampoco", () => {
    const r = pagosFaltanFoto({
      beta: [
        { id: "1", metodo: "tarjeta", comprobante_id: "x" },
        { id: "2", metodo: "efectivo" },
        { id: "3", metodo: "gift_card" },
        { id: "4", metodo: "canje" },
      ],
      comps: [],
    });
    assert.equal(r.length, 0);
  });

  it("etiquetas de método", () => {
    assert.equal(tipoFotoPago("Transferencia"), "transferencia");
    assert.equal(etiquetaFotoPago("tarjeta"), "Tarjeta");
    assert.equal(etiquetaFotoPago("voucher"), "Voucher");
  });

  it("el ticket abierto y las cards no muestran un Voucher genérico permanente", () => {
    const js = tk(), card = screens();
    assert.match(js, /function voucherBtnsHtml/);
    assert.match(js, /pagosFaltanVista/);
    assert.match(js, /Acciones ▾/);
    assert.match(js, /"Estado" \+ \(r\.t \? " · "/);
    assert.match(js, /<summary>Detalles<\/summary>/);
    assert.doesNotMatch(js, /📷 Voucher<input/);
    assert.match(card, /function _tkVoucherCardBtns/);
    assert.doesNotMatch(card, /mob-voucher" onclick="event.stopPropagation\(\)"><label class="btn ghost small">📷 Voucher/);
  });
});
