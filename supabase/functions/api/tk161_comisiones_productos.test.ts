// TK161: piso 0 en comisión de productos, sin doble conteo de snaps, y catalogo.compra_comision manda.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { comisionProductos, compraParaComision, round2 } from "./domain.ts";
import { snapsPorClave, aplicarSnapsATicket } from "./costos_reales.ts";
import { MemoryDb } from "./db.ts";
import { acceso } from "./permisos.ts";
import type { TicketIn } from "./domain.ts";

describe("TK161: comisiones de productos", () => {
  it("compraParaComision prefiere catalogo.compra_comision y no el precio_compra", () => {
    assert.equal(compraParaComision({ precio_compra: 92, compra_comision: 91.98 }), 91.98);
    assert.equal(compraParaComision({ precio_compra: 37.3 }), 37.3);
    assert.equal(compraParaComision({ precio_compra: 37.3, compra_comision: "" }), 37.3);
    assert.equal(compraParaComision(null), 0);
  });

  it("una venta descontada bajo el costo de comisión no da comisión negativa (ML-013 / TK-SO-1931)", () => {
    // neto cobrado $86.96, compra_comision $92 → margen negativo; antes daba -$1.51
    assert.equal(comisionProductos([{ venta: 86.96, compra: 92, qty: 1, excluido: false, sku: "ML-013" }]), 0);
    // una línea negativa no arrastra a las positivas
    assert.equal(comisionProductos([
      { venta: 86.96, compra: 92, qty: 1, excluido: false, sku: "ML-013" },
      { venta: 86.96, compra: 82.61, qty: 1, excluido: false, sku: "ML-001" },
    ]), 1.3);
    // canje / venta 0 se sigue saltando
    assert.equal(comisionProductos([{ venta: 0, compra: 38.3, qty: 1, excluido: false, sku: "VK-017" }]), 0);
  });

  it("respeta el 30% sobre (neto − compra_comision) cuando el margen es positivo", () => {
    // VK-009 con compra_comision ajustada a comisión $1.33: neto 38.2522, cc 33.82
    assert.equal(comisionProductos([{ venta: 38.2522, compra: 33.82, qty: 1, excluido: false, sku: "VK-009" }]), 1.33);
  });

  it("no cuenta dos veces un producto que está en beta_ticket_lineas y en beta_ticket_snaps (TK-SO-1915 / ML-002)", async () => {
    const linea = {
      ticket_clave: "TK-SO-1915", tipo: "producto", sku: "ML-002", cantidad: 1,
      venta_neta: 86.96, compra_comision: 73.91, costo_real: 50.87, comision: 3.91,
      utilidad: 32.18, falta_costo: false, snapshot_at: "2026-11-19T19:08:50.299+00:00",
    };
    const snap = {
      ticket_clave: "TK-SO-1915", sku: "ML-002", qty: 1, venta_neta: 86.96,
      compra_comision: 73.91, costo_real: 50.87, comision: 3.91, utilidad: 32.18,
      falta_costo: false, es_paquete: false, snapshot_at: "2026-11-19T12:56:00Z",
    };
    const soloSnap = {
      ticket_clave: "TK-SO-1842", sku: "AS-001", qty: 1, venta_neta: 25.21,
      compra_comision: 21.51, costo_real: 17.51, comision: 1.11, utilidad: 0,
      falta_costo: false, es_paquete: false, snapshot_at: "2026-11-19T12:58:00Z",
    };
    const db = new MemoryDb({
      beta_ticket_lineas: [linea],
      beta_ticket_snaps: [snap, soloSnap],
    });
    const by = await snapsPorClave(db);
    const de1915 = by.get("TK-SO-1915") || [];
    assert.equal(de1915.length, 1, "TK-SO-1915 no debe duplicar ML-002");
    assert.equal(de1915[0].sku, "ML-002");
    assert.equal(de1915[0].qty, 1);
    const t: TicketIn = {
      fecha: "2026-11-18", cosm: "Andrea Robles", cedula: "x", facial: "", pack3: "", pack6: "", extras: "",
      exclFacial: false, exclPaquete: false, exclProducto: false, exclExtras: false,
      productos: [],
    };
    const aplicado = aplicarSnapsATicket(t, de1915);
    assert.equal(aplicado.productos.length, 1);
    assert.equal(comisionProductos(aplicado.productos.map((pr) => ({
      venta: round2((pr.ventaNeta || 0) / (pr.qty || 1)),
      compra: round2((pr.compraComision || 0) / (pr.qty || 1)),
      qty: pr.qty, excluido: false, sku: pr.sku,
    }))), 3.91);
    // tickets que solo viven en beta_ticket_snaps siguen entrando
    const de1842 = by.get("TK-SO-1842") || [];
    assert.equal(de1842.length, 1);
    assert.equal(de1842[0].sku, "AS-001");
  });

  it("ver_costos (compra para comisiones en Productos) es solo super_admin", () => {
    assert.equal(acceso("super_admin", "ver_costos"), "todos");
    assert.equal(acceso("admin", "ver_costos"), "no");
    assert.equal(acceso("cosmetologa", "ver_costos"), "no");
    assert.equal(acceso("recepcion", "ver_costos"), "no");
  });
});
