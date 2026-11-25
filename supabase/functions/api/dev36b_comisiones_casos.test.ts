import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import { comisionProductos, esCanjeSinCobro, esInterno, CEDULA_INTERNA, type Row, type TicketIn } from "./domain.ts";
import { aplicarSnapsATicket, snapsPorClave } from "./costos_reales.ts";

function ctx(db: MemoryDb) {
  db.tables.set("sesiones", [{ token: "t-emi", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" }]);
  return { db, now: new Date("2026-11-25T16:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }), token: "t-emi" };
}

function seed(tickets: Row[], extra: Record<string, Row[]> = {}) {
  return new MemoryDb({
    usuarios: [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "super_admin", bloqueado: false },
      { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      { id: "alejandra", nombre: "Alejandra Rodriguez", short: "Alejandra", rol: "recepcion", bloqueado: false },
    ],
    cosmetologas: [
      { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true },
      { id: "alejandra", nombre: "Alejandra Rodriguez", patron: "alejandra%", es_cosmetologa: false, activa: true },
    ],
    tickets,
    catalogo: [
      { sku: "SUNSU-15", producto_servicio: "Ampolla Especial", subtotal: 13.04, tipo: "SERVICIO ADD-ON", orig: {} },
      { sku: "SUNSU-31", producto_servicio: "PDRN SERUM", subtotal: 13.04, tipo: "SERVICIO ADD-ON", orig: {} },
      { sku: "INV-040", producto_servicio: "d'alba Spray", subtotal: 26.09, precio_compra: 6.08, orig: {} },
      { sku: "AS-002", producto_servicio: "Jabón Ceramide", subtotal: 16.51, precio_compra: 11.26, orig: {} },
      { sku: "ML-011", producto_servicio: "Moisture Gel", subtotal: 0, precio_compra: 63.48, orig: {} },
      { sku: "ML-007", producto_servicio: "Sun Protection Mild", subtotal: 65.22, precio_compra: 52.17, orig: {} },
    ],
    ...extra,
  });
}

const blank: TicketIn = {
  fecha: "2026-11-14", cosm: "Alejandra Rodriguez", cedula: "1704642071", facial: "", pack3: "", pack6: "", extras: "",
  exclFacial: false, exclPaquete: false, exclProducto: false, exclExtras: false, productos: [],
};

describe("DEV-36b Comisiones: casos 1–4 aprobados", () => {
  it("esInterno reconoce el RUC interno también en su forma de cédula (sin 001)", () => {
    assert.equal(esInterno("Andrea Robles", CEDULA_INTERNA), true);
    assert.equal(esInterno("Andrea Robles", "1793219469"), true);
    assert.equal(esInterno("Andrea Robles", "1713922092"), false);
  });

  it("esCanjeSinCobro: canje o forma Canje con total 0; no el pago directo ni un canje con cobro", () => {
    assert.equal(esCanjeSinCobro({ paquete: "SI, 3/3", comp: "Canje", total: 0 }), true);
    assert.equal(esCanjeSinCobro({ comp: "Canje", total: 0 }), true);
    assert.equal(esCanjeSinCobro({ paquete: "SI, 1/3", total: 14.99 }), false);
    assert.equal(esCanjeSinCobro({ comp: "", total: 0 }), false); // pago directo
    assert.equal(esCanjeSinCobro({ comp: "Tarje:942", total: 18.99 }), false);
  });

  it("caso 2: snapsPorClave y aplicarSnapsATicket no pagan una línea con excluir comisión (INV-040 / TK-SO-1880)", async () => {
    const db = new MemoryDb({
      beta_ticket_lineas: [
        { ticket_clave: "TK-SO-1880", tipo: "producto", sku: "AS-002", cantidad: 1, venta_neta: 16.51, compra_comision: 11.26, costo_real: 11.26, comision: 1.58, utilidad: 3.67, falta_costo: false, snapshot_at: "2026-11-19T12:45:19Z", excluir_comision: false },
        { ticket_clave: "TK-SO-1880", tipo: "producto", sku: "INV-040", cantidad: 1, venta_neta: 26.09, compra_comision: 6.08, costo_real: 0, comision: 6.00, utilidad: 0, falta_costo: true, snapshot_at: "2026-11-19T12:45:19Z", excluir_comision: true },
      ],
      beta_ticket_snaps: [
        { ticket_clave: "TK-SO-1880", sku: "INV-040", qty: 1, venta_neta: 26.09, compra_comision: 6.08, es_paquete: false, snapshot_at: "2026-11-19T12:00:00Z" },
      ],
    });
    const by = await snapsPorClave(db);
    const snaps = by.get("TK-SO-1880") || [];
    assert.equal(snaps.length, 1);
    assert.equal(snaps[0].sku, "AS-002");
    const aplicado = aplicarSnapsATicket({ ...blank, productos: [] }, snaps);
    assert.equal(aplicado.productos.length, 1);
    assert.equal(aplicado.productos[0].sku, "AS-002");
    const com = comisionProductos(aplicado.productos.map((pr) => ({
      venta: (pr.ventaNeta || 0) / (pr.qty || 1),
      compra: (pr.compraComision || 0) / (pr.qty || 1),
      qty: pr.qty, excluido: false, sku: pr.sku,
    })));
    assert.equal(com, 1.58);
  });

  it("caso 1 y 4: extras de cortesía o de un canje $0 no pagan; un extra cobrado en canje de sesión sí; el pago directo $0 sí paga", async () => {
    const tickets: Row[] = [
      { id: 1, timestamp: "2026-11-07T18:00:00Z", atendido_por: "Andrea Robles", id_3: "0101", facial_hecho: "SUNSU-02", paquete: "SI, 2/3", comp: "Canje", estimado: 0, servicios_adicionales: "SUNSU-15 Ampolla Especial · Purificación [CORTESIA: Comentario Google]", orig: {} },
      { id: 2, timestamp: "2026-11-04T18:00:00Z", atendido_por: "Andrea Robles", id_3: "0102", facial_hecho: "SUNSU-02", paquete: "", comp: "Canje", estimado: 0, servicios_adicionales: "SUNSU-15 Ampolla Especial · Hidratación", orig: {} },
      { id: 3, timestamp: "2026-11-14T18:00:00Z", atendido_por: "Andrea Robles", id_3: "0103", facial_hecho: "SUNSU-02", paquete: "SI, 3/6", comp: "Tarje:941", estimado: 14.99, servicios_adicionales: "SUNSU-31 PDRN Serum", orig: {} },
      { id: 4, timestamp: "2026-11-20T18:00:00Z", atendido_por: "Andrea Robles", id_3: "0104", facial_hecho: "SUNSU-40", paquete: "", comp: "", estimado: 0, servicios_adicionales: "SUNSU-31 PDRN Serum", orig: { justificacion_descuento: "Pago directo" } },
    ];
    const c = ctx(seed(tickets));
    const tabla = await handle("getComisionesTabla", { token: c.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Andrea" }, c) as Row;
    const ext = (tabla.filas as Row[]).find((f) => f.concepto === "Extras")?.total;
    // solo el PDRN cobrado ($1) y el pago directo ($1) = $2. Las dos de canje $0 no pagan.
    assert.equal(ext, 2);
    const det = (tabla.detalle as Row).extras as Row[];
    assert.equal(det.reduce((a, l) => a + Number(l.qty), 0), 2);
  });

  it("caso 3: un producto en ticket con RUC interno no comisiona, ni el de $0 con comisión fija ni el con precio de catálogo", async () => {
    const tickets: Row[] = [
      { id: 1, timestamp: "2026-11-18T18:00:00Z", atendido_por: "Andrea Robles", id_3: CEDULA_INTERNA, nombre: "Sunsu", apellido: "Spa", comp: "Canje", estimado: 0, orig: { "ML-011": 1 } },
      { id: 2, timestamp: "2026-11-20T17:12:48Z", atendido_por: "Andrea Robles", id_3: CEDULA_INTERNA, nombre: "Sunsu", apellido: "Spa", estimado: 0, orig: { "ML-007": 2 }, notas_generales: "Para el carrito auxiliar" },
      { id: 3, timestamp: "2026-11-14T18:00:00Z", atendido_por: "Andrea Robles", id_3: "1713922092", estimado: 18.99, orig: { "AS-002": 1 } },
    ];
    const extra = {
      beta_ticket_lineas: [
        { ticket_clave: "r1", tipo: "producto", sku: "ML-011", cantidad: 1, venta_neta: 0, compra_comision: 63.48, comision: 1.83, snapshot_at: "2026-11-19T00:00:00Z", excluir_comision: false },
      ],
      beta_tickets: [{ clave: "r1", lineas_beta: true, total: 0 }],
    };
    const c = ctx(seed(tickets, extra));
    const tabla = await handle("getComisionesTabla", { token: c.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Andrea" }, c) as Row;
    const prod = (tabla.filas as Row[]).find((f) => f.concepto === "Productos")?.total;
    // solo AS-002 de la clienta real
    const det = (tabla.detalle as Row).productos as Row[];
    assert.ok(!det.some((l) => String(l.sku).includes("ML-011") || String(l.sku).includes("ML-007")));
    assert.equal(Number(prod) > 0, true);
    assert.ok(Number(prod) < 3);
  });
});
