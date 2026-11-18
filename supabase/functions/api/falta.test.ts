import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { faltaDe } from "./tickets_beta_api.ts";
describe("faltaDe (fila amarilla)", () => {
  it("transferencia sin comprobante pide foto; con comprobante subido en la beta ya no", () => {
    const r = { timestamp: "2026-11-10T15:00:00Z", comp: "Transferencia $20", comprobante: "", cob: false, fac: false, fac_7: "" };
    assert.deepEqual(faltaDe(r, {}), ["Foto del comprobante de pago (transferencia o voucher de tarjeta)"]);
    assert.deepEqual(faltaDe(r, { comprobantes: [{ url: "archivo:1" }] }), []);
  });
  it("TK41: tarjeta vieja con N.º de voucher ya cuenta; sin número o desde hoy 10:30 pide la foto; efectivo no", () => {
    const r = { timestamp: "2026-11-18T11:00:00Z", comp: "Tarje:953", comprobante: "", cob: true, fac: true, fac_7: "2957.0" };
    assert.deepEqual(faltaDe(r, {}), ["Foto del comprobante de pago (transferencia o voucher de tarjeta)"]);
    assert.deepEqual(faltaDe({ ...r, timestamp: "2026-11-17T16:00:00Z" }, {}), []);
    assert.deepEqual(faltaDe({ ...r, timestamp: "2026-11-12 19:05:43+00", comp: "Tarje:931" }, {}), []);
    assert.deepEqual(faltaDe({ ...r, timestamp: "2026-11-17T16:00:00Z", comp: "Tarje" }, {}).length, 1);
    assert.deepEqual(faltaDe({ ...r, timestamp: "2026-11-17T16:00:00Z", comp: "Tarje:953, Trans:12" }, {}).length, 1);
    assert.deepEqual(faltaDe(r, { comprobantes: [{ url: "archivo:1" }] }), []);
    assert.deepEqual(faltaDe({ timestamp: "2026-11-17T16:00:00Z", comp: "Efect:10", cob: true, fac: false, fac_7: "" }, {}), []);
  });
  it("historia anterior a noviembre no se marca", () => {
    assert.deepEqual(faltaDe({ timestamp: "2026-10-10T15:00:00Z", comp: "Transferencia $20" }, {}), []);
  });
  it("hasta el 16-Nov, transferencia pagada sin foto sigue en amarillo", () => {
    const r = { timestamp: "2026-11-16T20:00:00Z", comp: "Trans:43959839", comprobante: "", cob: true, fac: true, fac_7: "2914.0" };
    assert.deepEqual(faltaDe(r, {}), ["Foto del comprobante de pago (transferencia o voucher de tarjeta)"]);
    assert.deepEqual(faltaDe({ ...r, timestamp: "2026-11-01T15:00:00Z" }, {}), ["Foto del comprobante de pago (transferencia o voucher de tarjeta)"]);
  });
});
import { colTicket, telefonoEc } from "./domain.ts";
describe("telefonoEc", () => {
  it("normaliza a +593 9X XXX XXXX", () => {
    assert.equal(telefonoEc("5930999764864.0"), "+593 99 976 4864");
    assert.equal(telefonoEc("0999764864"), "+593 99 976 4864");
    assert.equal(telefonoEc("999764864.0"), "+593 99 976 4864");
    assert.equal(telefonoEc("5.93999764864E11"), "+593 99 976 4864");
    assert.equal(telefonoEc("+593 99 976 4864"), "+593 99 976 4864");
    assert.equal(telefonoEc(""), "");
  });
});
describe("colTicket", () => {
  it("lee la foto de orig cuando la columna está vacía", () => {
    assert.equal(colTicket({ fotos_antes: null, orig: { "FOTOS ANTES": "https://drive.google.com/file/d/x/view" } }, "fotos_antes"), "https://drive.google.com/file/d/x/view");
    assert.equal(colTicket({ comprobante: "False", orig: { COMPROBANTE: "https://x/y" } }, "comprobante"), "https://x/y");
  });
});
import { mapaColores, PALETA } from "./colores_api.ts";
describe("mapaColores", () => {
  it("respeta el color guardado y da pasteles distintos al resto", () => {
    const m = mapaColores([{ nombre: "Daniela Mora" }, { nombre: "Andrea Robles" }, { nombre: "Evelyn" }], [{ usuario: "daniela mora", nombre: "Daniela Mora", color: "#e7dbff" }]);
    assert.equal(m["daniela mora"].color, "#E7DBFF");
    assert.ok(m["andrea robles"].color !== "#E7DBFF" && PALETA.includes(m["andrea robles"].color));
    assert.notEqual(m["andrea robles"].color, m["evelyn"].color);
  });
});
import { cortesiasDe } from "./tickets_beta_api.ts";
describe("cortesiasDe", () => {
  it("lee la cortesía marcada al crear (TK-SO-1894)", () => {
    const c = cortesiasDe({ servicios_adicionales: "SUNSU-16 Peeling Enzimático | SUNSU-31 PDRN Serum [CORTESIA: Cumpleaños]" });
    assert.deepEqual([...c], ["31"].map((x) => [...cortesiasDe({ servicios_adicionales: "SUNSU-31 X [CORTESIA]" })][0]));
    assert.equal(c.size, 1);
  });
});
