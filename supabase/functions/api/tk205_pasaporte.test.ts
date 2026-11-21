import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cedulaVer,
  detectarIdentificacion,
  idVer,
  SRI_TIPO_ID,
  validarIdentificacionCliente,
} from "./domain.ts";
import { validarIdentificacion } from "./portal_core.ts";

describe("TK205 · Cédula, RUC, Pasaporte y Otro", () => {
  it("164804287 no se rellena como cédula; es pasaporte válido si el tipo es Pasaporte", () => {
    assert.equal(cedulaVer("164804287"), "164804287");
    assert.equal(idVer("164804287"), "164804287");
    const comoCed = detectarIdentificacion("164804287", "cedula");
    assert.ok(comoCed.error);
    assert.equal(comoCed.sugerencia, "pasaporte");
    assert.match(comoCed.error || "", /pásaporte|pasaporte|otro documento/i);
    const pasa = detectarIdentificacion("164804287", "pasaporte");
    assert.equal(pasa.error, null);
    assert.equal(pasa.tipo, "pasaporte");
    assert.equal(pasa.valor, "164804287");
    assert.equal(pasa.sri, SRI_TIPO_ID.pasaporte);
    assert.equal(SRI_TIPO_ID.pasaporte, "06");
    assert.equal(SRI_TIPO_ID.otro, "08");
  });

  it("una cédula de 9 dígitos a la que le faltó el 0 de provincia sí se completa", () => {
    assert.equal(cedulaVer("604070706"), "0604070706");
    const d = detectarIdentificacion("604070706", "cedula");
    assert.equal(d.error, null);
    assert.equal(d.tipo, "cedula");
    assert.equal(d.valor, "0604070706");
    assert.equal(d.sri, "05");
  });

  it("cédula y RUC de persona válidos siguen pasando; un RUC forzado inválido sugiere cambiar tipo", () => {
    const ci = detectarIdentificacion("1716768062", "cedula");
    assert.equal(ci.error, null);
    assert.equal(ci.tipo, "cedula");
    const ruc = detectarIdentificacion("1716768062001", "ruc");
    assert.equal(ruc.error, null);
    assert.equal(ruc.tipo, "ruc");
    assert.equal(ruc.sri, "04");
    const bad = detectarIdentificacion("164804287", "ruc");
    assert.ok(bad.error);
    assert.equal(bad.sugerencia, "pasaporte");
  });

  it("Pasaporte y Otro aceptan cualquier alfanumérico, sin checksum", () => {
    for (const tipo of ["pasaporte", "otro"] as const) {
      assert.equal(detectarIdentificacion("GT38882026", tipo).error, null);
      assert.equal(detectarIdentificacion("164804287", tipo).error, null);
      assert.equal(detectarIdentificacion("AB12", tipo).error, null);
      assert.ok(validarIdentificacionCliente("X", tipo));
    }
    assert.equal(detectarIdentificacion("GT38882026", "otro").sri, "08");
  });

  it("el portal acepta pasaporte con letras y, si el tipo es Pasaporte, un número de 9 dígitos", () => {
    assert.equal(validarIdentificacion("AB123456"), null);
    assert.ok(validarIdentificacion("164804287"));
    assert.equal(validarIdentificacion("164804287", false, "pasaporte"), null);
    assert.equal(validarIdentificacion("1716768062"), null);
    assert.ok(validarIdentificacion("1793161898001"));
    assert.equal(validarIdentificacion("1793161898001", true), null);
  });
});
