// TK72 (Emilia 18/11): las líneas de un ticket migrado salen de su factura Migo; sin factura, a precio de catálogo.
// TK195: lo que no cuadra ya no se rellena con «Diferencia sin explicar»; se avisa en faltan.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./productos_api.ts";
import "./tickets_beta_api.ts";
import "./migo_cuadre_api.ts";
import type { Row } from "./domain.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false }]);
  db.tables.set("catalogo", [
    { sku: "SUNSU-ML-005", producto_servicio: "Whitening A Serum - Dr.esthe", tipo: "PRODUCTO", total_con_iva: 95, subtotal: 82.61, activo: true },
    { sku: "SUNSU-ML-002", producto_servicio: "Cream", tipo: "PRODUCTO", total_con_iva: 23, subtotal: 20, activo: true },
    { sku: "SUNSU-15", producto_servicio: "Ampolla Especial", tipo: "EXTRA", total_con_iva: 15, subtotal: 13.04, activo: true },
    { sku: "SUNSU-31", producto_servicio: "PDRN SERUM", tipo: "EXTRA", total_con_iva: 15, subtotal: 13.04, activo: true },
    { sku: "SUNSU-36", producto_servicio: "Yoga Facial Drenante", tipo: "EXTRA", total_con_iva: 15, subtotal: 13.04, activo: true },
    { sku: "SUNSU-02", producto_servicio: "Facial Reparación", tipo: "FACIAL", total_con_iva: 69, subtotal: 60, activo: true },
    { sku: "SUNSU-40", producto_servicio: "Facial Reset", tipo: "FACIAL", total_con_iva: 46, subtotal: 40, activo: true },
  ]);
  db.tables.set("erp_productos", [{ id: "p5", sku: "ML-005", nombre: "Whitening A Serum - Dr.esthe", clase: "producto", uso: "venta", activo: true }, { id: "p2", sku: "ML-002", nombre: "Cream", clase: "producto", uso: "venta", activo: true }]);
  db.tables.set("tickets", [
    { id: 1884, sheet_row: 1885, so_num: "TK-SO-1891", timestamp: "2026-11-16T18:49:42Z", atendido_por: "Andrea Robles", nombre: "Karina", apellido: "Lino", facial_hecho: "SUNSU-02 Facial Reparación", paquete: "SI, 5/6", servicios_adicionales: "SUNSU-15 Ampolla Especial · PDRN, Elasticidad | SUNSU-36 Yoga Facial Drenante", estimado: 139.988, fac: true, fac_7: "2956.0", ml_005: 1, orig: { "ML-005": 1 } },
    { id: 2, sheet_row: 20, so_num: "TK-SO-2", timestamp: "2026-10-10T15:00:00Z", atendido_por: "Ana", nombre: "Ana", apellido: "Ruiz", facial_hecho: "SUNSU-40 Facial Reset", estimado: 60, orig: { "ML-002": 1 } },
  ]);
  db.tables.set("beta_migo_facturas_vivo", [{ factura: "001-001-000002956", fecha: "2026-11-17", total: 140, subtotal: 121.73, lineas: [
    { sku: "SUNSU-15", codigo: "SUNSU-15", producto: "Ampolla Especial", cantidad: 1, precio_unit: 13.04, subtotal: 13.04, iva: 1.96, total: 15 },
    { sku: "SUNSU-31", codigo: "SUNSU-31", producto: "PDRN SERUM", cantidad: 1, precio_unit: 13.04, subtotal: 13.04, iva: 1.96, total: 15 },
    { sku: "SUNSU-36", codigo: "SUNSU-36", producto: "YOGA FACIAL DRENANTE", cantidad: 1, precio_unit: 13.04, subtotal: 13.04, iva: 1.96, total: 15 },
    { sku: "SUNSU-ML-005", codigo: "SUNSU-ML-005", producto: "Whitening A Serum - Dr.esthe", cantidad: 1, precio_unit: 82.61, subtotal: 82.61, iva: 12.39, total: 95 },
  ] }]);
  for (const t of ["erp_bodegas", "erp_stock", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "promos", "beta_tickets", "beta_ticket_lineas", "solicitudes_cambio", "clientas_registro", "beta_stock_movimientos", "beta_migo_lineas"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-18T18:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, p: Row = {}) => handle(a, { token: "adm", ...p }, { ...c, token: "adm" }) as Promise<Row>;
  return { db, h };
}

describe("TK72 · líneas desde la factura Migo, sin prorrateo", () => {
  it("Karina Lino (TK-SO-1891): sale la factura 2956 con el PDRN que faltaba y la Reparación en canje", async () => {
    const { db, h } = semilla();
    const g = await h("tk_get", { clave: "TK-SO-1891" });
    const L = g.lineas as Row[];
    const por = (sku: string) => L.find((l) => String(l.sku).replace(/^SUNSU-/, "") === sku);
    assert.equal(por("ML-005")!.precio_unit, 95);
    assert.equal(por("15")!.precio_unit, 15); assert.equal(por("36")!.precio_unit, 15);
    assert.ok(por("31"), "el PDRN de la factura aparece");
    assert.equal(por("02")!.precio_unit, 0); assert.equal(por("02")!.canje, true);
    assert.equal((g.totales as Row).total, 140);
    assert.equal(L.some((l) => l.tipo === "diferencia"), false);
    assert.equal(db.tables.get("beta_ticket_lineas")!.length, 0, "solo se lee: no escribe nada");
  });
  it("sin factura: precio de catálogo, sin línea DIF, aviso en faltan si no cuadra", async () => {
    const { db, h } = semilla();
    if (!db.tables.has("beta_pagos")) db.tables.set("beta_pagos", []);
    const g0 = await h("tk_get", { clave: "TK-SO-2" });
    const L0 = g0.lineas as Row[];
    assert.equal(L0.some((l) => l.tipo === "diferencia" || l.sku === "DIF"), false);
    assert.deepEqual(L0.map((l) => [l.sku, l.precio_unit]).sort(), [["40", 46], ["ML-002", 23]].sort());
    assert.equal((g0.totales as Row).sumaLineas, 69);
    // TK207: sin pagos no se usa el estimado de la hoja como «lo cobrado».
    assert.equal((g0.faltan as string[]).some((x) => /no cuadra con las líneas/.test(x)), false);
    db.tables.get("beta_pagos")!.push({ ticket_clave: "TK-SO-2", ticket_id: 2, monto: 60, anulado: false });
    const g = await h("tk_get", { clave: "TK-SO-2" });
    assert.ok((g.faltan as string[]).some((x) => /no cuadra con las líneas/.test(x) && /no se añade una línea/.test(x)));
  });
});

describe("TK80 · los flags se recalculan con las líneas reconstruidas", () => {
  it("Karina (TK-SO-1891): el «Falta en ticket: PDRN SERUM» se resuelve solo y queda en el log", async () => {
    const { db, h } = semilla();
    const fv = db.tables.get("beta_migo_facturas_vivo")![0];
    Object.assign(fv, { cliente: "LINO KARINA", forma: "Tarjeta de crédito", fecha: "2026-11-16" });
    Object.assign(db.tables.get("tickets")![0], { cob: true, comp: "Tarje:949" });
    db.tables.set("beta_migo_importes", [{ id: 1, imported_at: "2026-11-18T12:00:00Z", fuente: "vivo" }]);
    db.tables.set("beta_ticket_flags", [{ id: "migo:1884:lineas", ticket_id: 1884, ticket_clave: "TK-SO-1891", motivo: "Revisa productos vs factura", detalle: "Falta en ticket: PDRN SERUM (SUNSU-31) $15.00 × 1", factura: "001-001-000002956", fuente: "migo", resuelto: false }]);
    for (const x of ["beta_cuadre_link", "beta_ticket_cancelados", "beta_migo_borradores", "log_acciones"]) db.tables.set(x, []);
    const r = await h("migo_cuadre_hora");
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(db.tables.get("beta_cuadre_link")!.some((x) => Number(x.ticket_id) === 1884), "el ticket se cruza con su factura: " + JSON.stringify(db.tables.get("beta_cuadre_link")));
    const f = db.tables.get("beta_ticket_flags")!.find((x) => x.id === "migo:1884:lineas")!;
    assert.equal(f.resuelto, true, "ya no está en rojo");
    assert.match(String(f.nota), /coinciden con la factura/);
    assert.ok(db.tables.get("log_acciones")!.some((x) => x.accion === "FLAG AUTO-RESUELTO"));
    const g = await h("tk_get", { clave: "TK-SO-1891" });
    assert.equal(((g.chips || g.info?.chips || []) as Row[]).some((c) => c.k === "flag"), false, "sin pill «Por corregir»");
  });
});
