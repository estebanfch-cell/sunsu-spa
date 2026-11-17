import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { faltaDe } from "./tickets_beta_api.ts";
describe("faltaDe (fila amarilla)", () => {
  it("transferencia sin comprobante pide foto; con comprobante subido en la beta ya no", () => {
    const r = { timestamp: "2026-11-10T15:00:00Z", comp: "Transferencia $20", comprobante: "", cob: false, fac: false, fac_7: "" };
    assert.deepEqual(faltaDe(r, {}), ["Foto del comprobante de transferencia"]);
    assert.deepEqual(faltaDe(r, { comprobantes: [{ url: "archivo:1" }] }), []);
  });
  it("historia anterior a noviembre no se marca", () => {
    assert.deepEqual(faltaDe({ timestamp: "2026-10-10T15:00:00Z", comp: "Transferencia $20" }, {}), []);
  });
});
