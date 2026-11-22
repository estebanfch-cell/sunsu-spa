// TK98 (Emilia 18/11): gift card de cortesía y consumo interno en $0 → se ven como líneas, estado gris, sin «Por cobrar» ni «Sin factura».
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./productos_api.ts";
import "./tickets_beta_api.ts";
import "./tickets_lista_api.ts";
import { giftCortesia, tipoSinCobro, valorNominalGift, nombreLineaGift } from "./sin_cobro.ts";
import type { Row } from "./domain.ts";

const CAT = [
  { sku: "SUNSU-35", producto_servicio: "GIFT CARD PREMIUM", tipo: "GIFT CARD", total_con_iva: 65, subtotal: 56.52, activo: true },
  { sku: "SUNSU-57", producto_servicio: "FACIAL K-LIFT", tipo: "FACIAL", total_con_iva: 95, subtotal: 82.61, activo: true },
  { sku: "ML-011", producto_servicio: "Moisture Cleansing Gel", tipo: "PRODUCTO", total_con_iva: 80, subtotal: 69.57, activo: true },
];

describe("TK98 · helpers", () => {
  it("lee la cortesía de gift card y su valor nominal", () => {
    const g = giftCortesia("CORTESIA, 26-173, PREMIUM. De: Emilia. Para: Mónica Ribadeneira.")!;
    assert.equal(g.codigo, "26-173"); assert.equal(g.tipo, "PREMIUM"); assert.equal(g.para, "Mónica Ribadeneira");
    const nom = valorNominalGift(g, CAT.map((c) => ({ sku: c.sku.replace("SUNSU-", ""), nombre: c.producto_servicio, pvp: c.total_con_iva, tipo: c.tipo })));
    assert.ok(nom > 0);
    assert.match(nombreLineaGift(g, 65), /Gift card 26-173 · PREMIUM · para Mónica Ribadeneira · valor \$65\.00/);
    assert.equal(giftCortesia("26-100, PREMIUM. De: Ana"), null, "venta normal no es cortesía");
  });
  it("tipoSinCobro: solo tickets en $0 y no anulados", () => {
    assert.equal(tipoSinCobro({ nombre: "Sunsu", apellido: "Spa", estimado: 0, ml_011: 1 }), "interno");
    assert.equal(tipoSinCobro({ nombre: "Sunsu", apellido: "Spa", estimado: 80, ml_011: 1 }), null);
    assert.equal(tipoSinCobro({ nombre: "Emilia", apellido: "G", estimado: 0, venta_gift: "CORTESIA, 26-172, KLIFT. De: Emilia. Para: Manu" }), "cortesia");
    assert.equal(tipoSinCobro({ nombre: "Emilia", apellido: "G", estimado: 0, orig: { anulado: true }, venta_gift: "CORTESIA, 26-172, KLIFT. De: Emilia. Para: Manu" }), null);
  });
});

function semilla(beta = false) {
  const db = new MemoryDb();
  db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false }]);
  db.tables.set("catalogo", CAT);
  db.tables.set("tickets", [
    { id: 1, sheet_row: 2, so_num: "TK-SO-9906", timestamp: "2026-11-18T12:00:00Z", nombre: "Sunsu", apellido: "Spa", ml_011: 1, estimado: 0, cob: false, atendido_por: "Andrea" },
    { id: 2, sheet_row: 3, so_num: "TK-SO-9910", timestamp: "2026-11-18T14:24:00Z", nombre: "Emilia", apellido: "Gallegos", estimado: 0, cob: false, venta_gift: "CORTESIA, 26-173, PREMIUM. De: Emilia. Para: Mónica Ribadeneira.", atendido_por: "Alejandra" },
  ]);
  for (const t of ["erp_productos", "erp_bodegas", "erp_stock", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "promos", "beta_tickets", "beta_ticket_lineas", "solicitudes_cambio", "clientas_registro", "beta_stock_movimientos", "beta_pagos", "beta_caja_movimientos", "beta_migo_facturas_vivo", "beta_migo_links", "beta_migo_flags", "gift_cards", "log_acciones"]) if (!db.tables.has(t)) db.tables.set(t, []);
  if (beta) {
    db.tables.set("beta_tickets", [{ clave: "TK-SO-9910", lineas_beta: true, subtotal: 0, iva: 0, total: 0, datos: {} }]);
    db.tables.set("beta_ticket_lineas", [{ id: "x1", ticket_clave: "TK-SO-9910", orden: 1, tipo: "gift", sku: "35", nombre: "Gift card 26-173 · PREMIUM · para Mónica Ribadeneira · valor $65.00", cantidad: 1, precio_unit: 0, total_linea: 0, excluir_comision: false, estimado: false }]);
  }
  const h = (a: string, p: Row = {}) => handle(a, { token: "adm", ...p }, { db, now: new Date("2026-11-18T21:30:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" } as never) as Promise<Row>;
  return { db, h };
}

describe("TK98 · detalle del ticket", () => {
  it("gift card de cortesía: una línea en $0 con código, tipo, beneficiaria y valor nominal; chip gris Cortesía", async () => {
    const { h } = semilla();
    const r = await h("tk_get", { clave: "TK-SO-9910" });
    const L = r.lineas as Row[];
    assert.equal(L.length, 1, JSON.stringify(r).slice(0, 400));
    assert.equal(L[0].tipo, "gift"); assert.equal(L[0].precio_unit, 0); assert.equal(L[0].cortesia, true);
    assert.match(String(L[0].nombre), /26-173 · PREMIUM · para Mónica Ribadeneira/);
    assert.ok(Number(L[0].valorNominal) > 0);
    const chips = (r.chips as Row[]).map((c) => c.t);
    assert.ok(chips.includes("Cortesía")); assert.ok(!chips.includes("Por cobrar")); assert.ok(!chips.includes("Sin factura")); assert.ok(!chips.includes("Falta factura"));
  });
  it("ya materializada en beta_ticket_lineas: no se duplica y conserva la pill", async () => {
    const { h } = semilla(true);
    const L = (await h("tk_get", { clave: "TK-SO-9910" })).lineas as Row[];
    assert.equal(L.length, 1); assert.equal(L[0].cortesia, true); assert.equal(L[0].valorNominal, 65);
  });
  it("consumo interno: productos en $0 con Consumo interno; chip gris", async () => {
    const { h } = semilla();
    const r = await h("tk_get", { clave: "TK-SO-9906" });
    const L = r.lineas as Row[];
    assert.ok(L.length >= 1, JSON.stringify(r).slice(0, 400));
    assert.ok(L.every((l) => l.precio_unit === 0 && l.consumoInterno === true));
    const chips = (r.chips as Row[]).map((c) => c.t);
    assert.ok(chips.includes("Consumo interno")); assert.ok(!chips.includes("Por cobrar")); assert.ok(!chips.includes("Sin factura")); assert.ok(!chips.includes("Falta factura"));
  });
});

describe("TK98 · pantallas", () => {
  const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
  const mt = readFileSync(new URL("../../../mc-tickets.js", import.meta.url), "utf8");
  it("lista: pill gris y sin «Sin factura»/«Por cobrar» para sin_cobro", () => {
    assert.match(js, /if\(t&&t\.sin_cobro\) return _tkPill\('gris'/);
    assert.match(js, /if\(t\.sin_cobro\)\{ out\.push\(\{c:'gris'/);
    const card = js.slice(js.indexOf("function _histCardHTML"), js.indexOf("function _tkFotoTipo"));
    assert.doesNotMatch(card, /sinfactura/);
    assert.doesNotMatch(card, /Por cobrar/);

  });
  it("detalle: pill Consumo interno y valor nominal de la gift card", () => {
    assert.match(mt, /consumoInterno: !!l\.consumoInterno/);
    assert.match(mt, /valor nominal/);
  });
});

import { aliasMigo } from "./alias_migo.ts";
import { difPorSku } from "./cuadre_sku.ts";
import { lineasBorradorDeFactura } from "./borrador_lineas.ts";

describe("TK98 · SUNSU-35 a $3 = Caja de gift card (INV-123)", () => {
  it("alias solo cuando la línea vale $3.00 con IVA; las gift cards reales siguen como SUNSU-35", () => {
    assert.equal(aliasMigo("SUNSU-35", 3), "INV-123");
    assert.equal(aliasMigo("SUNSU-35", 65), "35");
    assert.equal(aliasMigo("SUNSU-35", 68), "35");
    assert.equal(aliasMigo("SUNSU-AS-005", 3), "AS-005");
  });
  it("borrador: la caja va en Productos (no Venta Gift Card), sin «Falta código»", () => {
    const r = lineasBorradorDeFactura([{ codigo: "SUNSU-35", producto: "GIFT CARD", cantidad: 1, precio_unit: 2.61, subtotal: 2.61, iva: 0.39, total: 3 }], []);
    assert.equal(r.lineas[0].sku, "INV-123"); assert.equal(r.lineas[0].seccion, "producto"); assert.equal(r.lineas[0].nombre, "Caja de gift card");
    assert.deepEqual(r.avisos, []);
  });
});

describe("TK98 · «No cuadra» dice qué SKU", () => {
  const FAC = [
    { codigo: "SUNSU-18", producto: "PAQUETE (3) FACIAL REPARACIÓN", cantidad: 1, precio_unit: 152.61, total: 175.5 },
    { codigo: "SUNSU-35", producto: "GIFT CARD", cantidad: 1, precio_unit: 2.61, total: 3 },
  ];
  it("Falta en ticket: SUNSU-35 GIFT CARD $3.00", () => {
    const tk = { id: 1, lineasDetalle: [{ sku: "18", nombre: "PAQUETE (3) FACIAL REPARACIÓN", cantidad: 1, precio_unit: 175.5, total_linea: 175.5 }] };
    assert.deepEqual(difPorSku(FAC, [tk]), ["Falta en ticket: SUNSU-35 GIFT CARD $3.00"]);
  });
  it("con la caja en el ticket cuadra; un SKU de más sale como «Sobra en ticket»", () => {
    const tk = { id: 1, lineasDetalle: [
      { sku: "18", nombre: "PAQUETE", cantidad: 1, precio_unit: 175.5, total_linea: 175.5 },
      { sku: "INV-123", nombre: "Caja de gift card", cantidad: 1, precio_unit: 3, total_linea: 3 },
    ] };
    assert.deepEqual(difPorSku(FAC, [tk]), []);
    tk.lineasDetalle.push({ sku: "AS-005", nombre: "Serum", cantidad: 1, precio_unit: 30.99, total_linea: 30.99 });
    assert.deepEqual(difPorSku(FAC, [tk]), ["Sobra en ticket: AS-005 Serum $30.99"]);
  });
});

describe("TK98 · pantallas: gift card de factura y modal Vincular", () => {
  const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
  it("la gift card de la factura suma al total aunque falte el código (nota amarilla «Falta código»)", () => {
    assert.match(js, /deFactura:true/);
    assert.match(js, /gcV\.activo&&\(gcV\.codigo\|\|gcV\.deFactura\)/);
    assert.match(js, /_gcVenta\.activo&&\(_gcVenta\.codigo\|\|_gcVenta\.deFactura\)/);
    assert.match(js, /Falta código/);
  });
  it("modal: casilla por fila + UN botón «Vincular»; se cierra solo con «Vinculado ✓»", () => {
    assert.doesNotMatch(js, /Vincular tickets marcados/);
    assert.doesNotMatch(js, /data-vinc="/);
    assert.doesNotMatch(js, /'">Marcar '/);
    assert.match(js, /id="migo-vinc-sel" disabled style="width:100%">Vincular</);
    assert.match(js, /Vinculado ✓/);
    assert.match(js, /migo_dif_sku/);
  });
});
