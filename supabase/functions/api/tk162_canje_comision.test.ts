// TK162: un canje (venta_neta = 0) puede mostrar comisión fija del snapshot en el detalle.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { comisionProductos, round2 } from "./domain.ts";
import { snapsPorClave, aplicarSnapsATicket } from "./costos_reales.ts";
import { MemoryDb } from "./db.ts";
import type { TicketIn } from "./domain.ts";

describe("TK162: comisión fija en canjes del detalle", () => {
  it("sin comisionFija, un canje (venta 0) sigue en $0", () => {
    assert.equal(comisionProductos([{ venta: 0, compra: 38.3, qty: 1, excluido: false, sku: "VK-017" }]), 0);
  });

  it("con comisionFija, el canje aporta esa comisión y no arrastra un negativo pagado", () => {
    assert.equal(comisionProductos([{ venta: 0, compra: 38.3, qty: 1, excluido: false, sku: "VK-017", comisionFija: 1.03 }]), 1.03);
    assert.equal(comisionProductos([
      { venta: 0, compra: 63.48, qty: 1, excluido: false, sku: "ML-011", comisionFija: 1.83 },
      { venta: 86.96, compra: 83.29, qty: 1, excluido: false, sku: "ML-013" },
    ]), 2.93);
  });

  it("aplicarSnapsATicket expone la comisión cacheada del canje para el detalle", async () => {
    const db = new MemoryDb({
      beta_ticket_lineas: [{
        ticket_clave: "TK-SO-1848", tipo: "producto", sku: "VK-017", cantidad: 1,
        venta_neta: 0, compra_comision: 38.3, costo_real: 24, comision: 1.03,
        utilidad: 0, falta_costo: false, snapshot_at: "2026-11-19T12:45:00Z",
      }],
      beta_ticket_snaps: [],
    });
    const by = await snapsPorClave(db);
    const t: TicketIn = {
      fecha: "2026-11-11", cosm: "Andrea Robles", cedula: "x", facial: "", pack3: "", pack6: "", extras: "",
      exclFacial: false, exclPaquete: false, exclProducto: false, exclExtras: false,
      productos: [],
    };
    const aplicado = aplicarSnapsATicket(t, by.get("TK-SO-1848"));
    assert.equal(aplicado.productos.length, 1);
    assert.equal(aplicado.productos[0].comision, 1.03);
    const venta = round2((aplicado.productos[0].ventaNeta || 0) / (aplicado.productos[0].qty || 1));
    assert.equal(comisionProductos([{
      venta,
      compra: round2((aplicado.productos[0].compraComision || 0) / (aplicado.productos[0].qty || 1)),
      qty: aplicado.productos[0].qty, excluido: false, sku: aplicado.productos[0].sku,
      comisionFija: venta > 0 ? 0 : (aplicado.productos[0].comision || 0),
    }]), 1.03);
  });
});
