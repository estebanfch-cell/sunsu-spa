import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  buscarPaquetesEn,
  cedDigitosPack,
  cedulasPackCompatibles,
  foldNombre,
  scoreNombrePaquete,
} from "./paq_buscar.ts";
import type { Row } from "./domain.ts";

const CAMILA: Row = {
  id: 623, sheet_row: 625, cedula: "604070706.0", nombres: "María Camila", apellidos: "Paredes Gurrero",
  sku: "SUNSU-29", paquete: "SUNSU-29 x3 Faciales Mixtos", vendido_por: "DANIELA MORA",
  uso_1: true, fecha_1: "26/09/26 Facial S.O.S · Daniela Mora",
  uso_2: false, fecha_2: "", uso_3: false, fecha_3: "",
  completo: false, codigo: "PACK-623", origin: "sheet", factura: null, notas: "",
};
const OTRA: Row = {
  id: 101, sheet_row: 103, cedula: "1716566359", nombres: "Camila", apellidos: "Cadena",
  sku: "SUNSU-29", paquete: "PAQUETE (3) FACIALES MIXTOS",
  uso_1: true, fecha_1: "a", uso_2: true, fecha_2: "b", uso_3: true, fecha_3: "c",
  completo: true, codigo: "PACK-103", origin: "sheet",
};
const LISBETH: Row = {
  id: 597, sheet_row: 599, cedula: "926661398.0", nombres: "Lisbeth", apellidos: "Paredes",
  sku: "SUNSU-18", paquete: "SUNSU-18 x3 Facial Reparación",
  uso_1: true, fecha_1: "x", uso_2: true, fecha_2: "y", uso_3: false, fecha_3: "",
  completo: false, codigo: "PACK-597", origin: "sheet",
};

describe("TK190 · cruce de cédula del paquete", () => {
  it("quita el .0 de Excel antes de los dígitos (no convierte 604070706.0 en 6040707060)", () => {
    assert.equal(cedDigitosPack("604070706.0"), "604070706");
    assert.equal(cedDigitosPack("0604070706"), "0604070706");
  });
  it("0604070706, 604070706, 604070706.0 y el typo 6040707060 son la misma clienta", () => {
    const base = "604070706.0";
    for (const q of ["0604070706", "604070706", "604070706.0", "6040707060"]) {
      assert.equal(cedulasPackCompatibles(base, q), true, q);
    }
    assert.equal(cedulasPackCompatibles(base, "1716566359"), false);
  });
  it("buscarPaquetesEn encuentra PACK-623 con cualquiera de esas cédulas, aunque el paquete tenga .0", () => {
    for (const q of ["0604070706", "604070706", "604070706.0", "6040707060"]) {
      const r = buscarPaquetesEn([CAMILA, OTRA, LISBETH], { q, soloActivos: true });
      assert.equal(r.resultados.length, 1, q);
      assert.equal(r.resultados[0].codigo, "PACK-623");
      assert.equal(r.resultados[0].quedan, 2);
      assert.equal(r.resultados[0].match, "cedula");
      assert.ok(!("telefono" in r.resultados[0]));
    }
  });
});

describe("TK190 · sugerencias por nombre", () => {
  it("es insensible a tildes y al typo Gurrero/Guerrero; María Camila Paredes queda primera", () => {
    assert.equal(foldNombre("María"), "maria");
    const scOk = scoreNombrePaquete("María Camila Paredes Guerrero", "María Camila", "Paredes Gurrero");
    const scOtra = scoreNombrePaquete("María Camila Paredes Guerrero", "Camila", "Cadena");
    const scApe = scoreNombrePaquete("María Camila Paredes Guerrero", "Lisbeth", "Paredes");
    assert.ok(scOk > scApe && scApe > 0);
    assert.ok(scOk > scOtra);
    const r = buscarPaquetesEn([OTRA, LISBETH, CAMILA], {
      q: "1719999999", nombre: "María Camila", apellido: "Paredes Guerrero", soloActivos: true,
    });
    assert.equal(r.resultados.length, 0, "cédula inventada no debe dar resultados exactos");
    assert.ok(r.sugerencias.length >= 1);
    assert.equal(r.sugerencias[0].codigo, "PACK-623");
    assert.equal(r.sugerencias[0].quedan, 2);
    assert.ok(!r.sugerencias.some((x) => x.codigo === "PACK-103"), "paquete completo no sale en activos");
  });
  it("busca a mano por PACK-623, por Paredes o por cédula", () => {
    const rows = [CAMILA, OTRA, LISBETH];
    assert.equal(buscarPaquetesEn(rows, { q: "PACK-623", soloActivos: true }).resultados[0].codigo, "PACK-623");
    const porNombre = buscarPaquetesEn(rows, { q: "paredes", soloActivos: true });
    assert.ok(porNombre.resultados.some((x) => x.codigo === "PACK-623"));
    assert.ok(porNombre.resultados.some((x) => x.codigo === "PACK-597"));
    assert.ok(!porNombre.resultados.some((x) => "telefono" in x));
  });
  it("no incluye teléfonos en la vista", () => {
    const r = buscarPaquetesEn([{ ...CAMILA, telefono: "0999999999", tel: "0999999999" }], { q: "604070706" });
    const txt = JSON.stringify(r);
    assert.equal(txt.includes("0999999999"), false);
    assert.equal(txt.includes("telefono"), false);
  });
});

describe("TK190 · caja de canje en el ticket", () => {
  const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
  const h = readFileSync(new URL("./handlers.ts", import.meta.url), "utf8");
  it("el recuadro busca por cédula tolerante, sugiere por nombre y permite búsqueda manual, sin teléfonos", () => {
    assert.match(js, /function _cedQuery/);
    assert.match(js, /paq-busca/);
    assert.match(js, /sugerencias/);
    assert.match(js, /paquete de otro cliente/);
    assert.match(js, /_paqElegirSesionDe|_paqMarcarOtroCanje/);
    assert.doesNotMatch(js.slice(js.indexOf("function _paqPintarLista"), js.indexOf("function selCobro")), /telefono|teléfono/i);
    assert.match(h, /buscarPaquetesEn/);
    assert.match(h, /cedulasPackCompatibles|paq_buscar/);
  });
});
