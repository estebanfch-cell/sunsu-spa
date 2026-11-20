import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cruzar, flagsDeseadas, type FacturaVivo } from "./migo_cuadre.ts";
import type { Row } from "./domain.ts";

describe("TK165 rojo por forma de pago distinta a la factura Migo", () => {
  const facs: FacturaVivo[] = [
    { factura: "001-001-000002951", seq: 2951, fecha: "2026-11-17", cliente: "CAMILA CADENA", total: 65, formas_pago: [{ forma: "TARJETA DE CREDITO", valor: 65 }] },
    { factura: "001-001-000002952", seq: 2952, fecha: "2026-11-17", cliente: "PAOLA URVANO", total: 40, forma: "EFECTIVO" },
  ];
  const tickets: Row[] = [
    { id: 1, clave: "TK-SO-1", fecha: "2026-11-17", nombre: "Camila", apellido: "Cadena", estimado: 65, fac_7: "2951", cob: true, comp: "Trans:123" },
    { id: 2, clave: "TK-SO-2", fecha: "2026-11-17", nombre: "Paola", apellido: "Urvano", estimado: 40, fac_7: "2952", cob: true, comp: "Efect:40" },
  ];
  it("marca forma distinta y no marca la que coincide", () => {
    const flags = flagsDeseadas({ tickets, links: cruzar(facs, tickets), facturas: facs, hoyGye: "2026-11-18", importadoGye: "2026-11-18" });
    assert.deepEqual(flags.filter((f) => f.ticket_id === 1).map((f) => f.kind), ["forma"]);
    assert.deepEqual(flags.filter((f) => f.ticket_id === 2).map((f) => f.kind), []);
  });
});
