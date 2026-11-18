// TK96 (Emilia 18/11, Youssef Tazi fac. 2971): borrador y cuadre SOLO por SKU; líneas y precios de la factura.
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./tickets_beta_api.ts";
import "./migo_cuadre_api.ts";
import type { Row } from "./domain.ts";
import { lineasBorradorDeFactura } from "./borrador_lineas.ts";
import { compararFacturaYTickets } from "./migo_lineas.ts";
import { armarCatalogoTicket } from "./catalogo_ticket.ts";

const CAT = [
  { sku: "SUNSU-02", producto_servicio: "FACIAL REPARACIÓN", tipo: "FACIAL", total_con_iva: 65, subtotal: 56.52, activo: true },
  { sku: "SUNSU-18", producto_servicio: "PAQUETE (3) FACIAL REPARACIÓN", tipo: "PAQUETE", total_con_iva: 175.5, subtotal: 152.61, activo: true },
  { sku: "SUNSU-31", producto_servicio: "PDRN SERUM", tipo: "SERVICIO ADD-ON", total_con_iva: 14.996, subtotal: 13.04, activo: true },
  { sku: "SUNSU-35", producto_servicio: "GIFT CARD", tipo: "GIFT CARD", total_con_iva: 65, subtotal: 56.52, activo: true },
  { sku: "SUNSU-AS-005", producto_servicio: "Serum Centella Skin Resurrection - Eyenlip", tipo: "PRODUCTO", total_con_iva: 30.99, subtotal: 26.95, activo: true },
  { sku: "SUNSU-AS-010", producto_servicio: "CICA BLEMISH Clear Cream - Eyenlip", tipo: "PRODUCTO", total_con_iva: 39.67, subtotal: 34.5, activo: true },
  { sku: "SUNSU-JN-008", producto_servicio: "Black Tea Time Reverse Eye Cream 25ml - Pyunkanf Yul", tipo: "PRODUCTO", total_con_iva: 49, subtotal: 42.61, activo: true },
];
const FAC_LINEAS = [
  { sku: "SUNSU-31", codigo: "SUNSU-31", producto: "PDRN SERUM", cantidad: 1, precio_unit: 13.04, subtotal: 13.04, iva: 1.96, total: 15 },
  { sku: "SUNSU-18", codigo: "SUNSU-18", producto: "PAQUETE (3) FACIAL REPARACIÓN", cantidad: 1, precio_unit: 152.61, subtotal: 152.61, iva: 22.89, total: 175.5 },
  { sku: "SUNSU-AS-005", codigo: "SUNSU-AS-005", producto: "Serum Centella Skin Resurrection - Eyenlip", cantidad: 1, precio_unit: 26.95, subtotal: 26.95, iva: 4.04, total: 30.99 },
  { sku: "SUNSU-VK-010", codigo: "SUNSU-VK-010", producto: "[ANUA] Azelaic Acid 10 Hyaluron Redness Soothing Serum 30 ml", cantidad: 1, precio_unit: 34.78, subtotal: 34.78, iva: 5.22, total: 40 },
  { sku: "SUNSU-AS-010", codigo: "SUNSU-AS-010", producto: "CICA BLEMISH Clear Cream - Eyenlip", cantidad: 1, precio_unit: 34.5, subtotal: 34.5, iva: 5.17, total: 39.67 },
  { sku: "SUNSU-35", codigo: "SUNSU-35", producto: "GIFT CARD", cantidad: 1, precio_unit: 2.61, subtotal: 2.61, iva: 0.39, total: 3 },
  { sku: "SUNSU-JN-008", codigo: "SUNSU-JN-008", producto: "Black Tea Time Reverse Eye Cream 25ml - Pyunkanf Yul", cantidad: 1, precio_unit: 42.61, subtotal: 42.61, iva: 6.39, total: 49 },
];
const FAC = "001-001-000002971";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "dan", uid: "u-dan", rol: "cosmetologa", name: "Daniela Mora", short: "Daniela", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "u-dan", nombre: "Daniela Mora", short: "Daniela", rol: "cosmetologa", bloqueado: false },
  ]);
  db.tables.set("catalogo", CAT);
  // VK-010 solo está en el ERP (familia VK), no en la hoja.
  db.tables.set("erp_productos", [{ id: "p-vk10", sku: "VK-010", nombre: "[ANUA] Azelaic Acid 10 Hyaluron Redness Soothing Serum 30 ml", clase: "producto", uso: "venta", activo: true, pvp: 40 }]);
  db.tables.set("tickets", []);
  db.tables.set("beta_migo_facturas_vivo", [{ factura: FAC, fecha: "2026-11-18", cliente: "YOUSSEF TAZI", forma: "tarjeta", total: 353.16, subtotal: 307.1, lineas: FAC_LINEAS }]);
  db.tables.set("beta_migo_borradores", [{ factura: FAC, fecha: "2026-11-18", cliente: "YOUSSEF TAZI", total: 353.16, forma: "tarjeta", estado: "asignado", asignado_a: "Daniela Mora", lineas: FAC_LINEAS, datos: {} }]);
  for (const t of ["erp_bodegas", "erp_stock", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "promos", "beta_tickets", "beta_ticket_lineas", "solicitudes_cambio", "clientas_registro", "beta_stock_movimientos", "beta_migo_lineas", "beta_cuadre_link", "beta_ticket_cancelados", "beta_ticket_flags", "beta_migo_importes", "log_acciones", "beta_acuity_calendars", "beta_citas_ticket", "beta_ticket_envios", "paquetes", "gift_cards"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-18T21:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: (async () => new Response("[]")) as typeof fetch, legacyLogin: async () => ({}) };
  const h = (tok: string, a: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}

describe("TK96 · borrador Migo solo por SKU, con precio de la factura", () => {
  it("Youssef 2971: cada línea con su SKU, cantidad y precio; secciones correctas; total = $353.16; sin avisos de lista", () => {
    const cat = armarCatalogoTicket(CAT, [{ sku: "VK-010", nombre: "[ANUA] Azelaic", tipo: "producto", pvp: 40 }], new Map());
    const r = lineasBorradorDeFactura(FAC_LINEAS, cat);
    assert.equal(r.total, 353.16);
    assert.deepEqual(r.avisos, []);
    const by = new Map(r.lineas.map((l) => [l.sku, l]));
    assert.equal(by.get("18")!.seccion, "paquete"); assert.equal(by.get("18")!.precio_unit, 175.5); assert.equal(by.get("18")!.pack, 3);
    assert.equal(by.get("31")!.seccion, "extra"); assert.equal(by.get("31")!.precio_unit, 15);
    // TK97: SUNSU-35 a $3.00 = caja de gift card (producto INV-123), no venta de gift card.
    assert.equal(by.get("INV-123")!.seccion, "producto"); assert.equal(by.get("INV-123")!.precio_unit, 3); assert.equal(by.get("INV-123")!.nombre, "Caja de gift card");
    for (const k of ["AS-005", "VK-010", "AS-010", "JN-008"]) assert.equal(by.get(k)!.seccion, "producto", k);
    assert.equal(by.get("AS-010")!.precio_unit, 39.67);
    assert.ok(!r.lineas.some((l) => l.sku === "02"), "nunca el facial suelto SUNSU-02 por nombre");
    assert.equal(r.lineas.length, 7);
  });
  it("SKU que no está en ningún catálogo: se copia igual y es el único aviso", () => {
    const r = lineasBorradorDeFactura([{ codigo: "SUNSU-ZZ-999", producto: "Nuevo", cantidad: 2, total: 20 }], armarCatalogoTicket(CAT, [], new Map()));
    assert.equal(r.lineas[0].precio_unit, 10); assert.equal(r.lineas[0].cantidad, 2);
    assert.equal(r.avisos.length, 1); assert.match(r.avisos[0], /ZZ-999.*no está en el catálogo/);
  });
  it("migo_borrador_get devuelve lineas_ticket exactas y sin avisos «lista vs factura»", async () => {
    const { h } = semilla();
    const g = await h("adm", "migo_borrador_get", { factura: "2971" });
    assert.equal(g.ok, true, String(g.error));
    const b = g.borrador as Row;
    assert.equal(b.total_lineas, 353.16);
    assert.equal((b.lineas_ticket as Row[]).length, 7);
    assert.doesNotMatch(JSON.stringify(b.avisos_lineas), /lista|vs factura/i);
  });
  it("al aprobar, el ticket lleva las 7 líneas de la factura y su total es $353.16 (sin promos)", async () => {
    const { db, h } = semilla();
    const r = await h("adm", "migo_borrador_aprobar", { factura: "2971" });
    assert.equal(r.ok, true, JSON.stringify(r));
    const clave = String(r.so_num || r.ticket);
    const cab = db.tables.get("beta_tickets")!.find((c) => c.clave === clave)!;
    assert.equal(cab.lineas_beta, true);
    assert.equal(cab.total, 353.16);
    const L = db.tables.get("beta_ticket_lineas")!.filter((l) => l.ticket_clave === clave);
    assert.deepEqual(L.map((l) => l.sku).sort(), ["18", "31", "AS-005", "AS-010", "INV-123", "JN-008", "VK-010"]);
    assert.equal(Math.round(L.reduce((a, l) => a + Number(l.total_linea), 0) * 100) / 100, 353.16);
    assert.ok(L.every((l) => !l.promo && !(Number(l.descuento_monto) > 0)));
    assert.equal(L.find((l) => l.sku === "18")!.tipo, "paquete");
    assert.equal(L.find((l) => l.sku === "INV-123")!.tipo, "producto");
    const g = await h("adm", "tk_get", { clave });
    assert.equal(((g.totales as Row) || {}).total, 353.16, JSON.stringify(g.totales));
  });
});

describe("TK96 · cuadre ticket↔factura nunca por nombre", () => {
  it("el facial suelto SUNSU-02 «Facial Reparación» NO empareja con el paquete SUNSU-18 «PAQUETE (3) FACIAL REPARACIÓN»", () => {
    const av = compararFacturaYTickets([FAC_LINEAS[1]], [{ id: 9, lineas_beta: [{ sku: "02", nombre: "Facial Reparación", cantidad: 1, precio_unit: 65, total_linea: 65 }] }]);
    assert.deepEqual(av.map((a) => a.tipo).sort(), ["falta", "sobra"]);
    assert.ok(!av.some((a) => /Revisa/.test(a.texto)));
  });
  it("mismo SKU → empareja aunque el nombre sea distinto", () => {
    const av = compararFacturaYTickets([FAC_LINEAS[0]], [{ id: 9, lineas_beta: [{ sku: "SUNSU-31", nombre: "Topping", cantidad: 1, precio_unit: 15, total_linea: 15 }] }]);
    assert.deepEqual(av, []);
  });
});

describe("TK96 · front del borrador", () => {
  const fe = fs.readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
  const pob = fe.slice(fe.indexOf("function _migoMatchLinea("), fe.indexOf("function _migoAplicarPrefillAT("));
  it("empareja solo por SKU (sin nombre) y no pone descuentos de lista ni promos", () => {
    assert.match(pob, /_migoSkuKey/);
    assert.doesNotMatch(pob, /x\.n\|\|x\.nombre/);
    assert.doesNotMatch(pob, /lista \$/);
    assert.doesNotMatch(pob, /T\.lineDesc\[[^\]]+\]=\{/);
    assert.match(fe, /if\(T&&T\._migoFac\)\{[^\n]*return; \}/);
    assert.match(pob, /lineas_ticket/);
    assert.match(pob, /sec==='gift'/);
    assert.match(pob, /T\.pack6=x\.it\.sku/);
  });
});
