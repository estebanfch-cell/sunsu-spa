import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { paquetesDelTicket } from "./ventas.ts";

describe("TK111: el paquete del ticket se ve aunque esté completo", () => {
  const completo = { id: 709, codigo: "PQ-0029", nombre: "SUNSU-18 x3", usados: 3, total: 3, pendientes: 0, estado: "completo", fechaCompra: "2026-11-18", factura: "2971", ticketOrigen: "", usos: [{ slot: 1, usado: true, fecha: "2026-11-18" }] };
  const viejo = { id: 1, codigo: "PACK-1", usados: 3, total: 3, pendientes: 0, estado: "completo", fechaCompra: "2026-01-02", factura: "100", ticketOrigen: "", usos: [] };
  it("por fecha de compra, factura o ticket de origen; no trae paquetes viejos completos", () => {
    const t = { so_num: "TK-SO-1914", timestamp: "2026-11-18T17:00:00Z", fac_7: "2971.0" };
    assert.deepEqual(paquetesDelTicket([completo, viejo], t, "TK-SO-1914").map((p) => p.codigo), ["PQ-0029"]);
    assert.deepEqual(paquetesDelTicket([{ ...completo, fechaCompra: "2026-11-01", factura: "" }], { ...t, fac_7: "" }, "TK-SO-1914").map((p) => p.codigo), ["PQ-0029"], "sesión usada ese día");
    assert.deepEqual(paquetesDelTicket([{ ...viejo, ticketOrigen: "TK-SO-1914" }], { ...t, fac_7: "" }, "TK-SO-1914").length, 1);
    assert.deepEqual(paquetesDelTicket([viejo], { so_num: "X", timestamp: "2026-11-18T17:00:00Z", fac_7: "SIN FACTURA" }).length, 0);
  });
});
