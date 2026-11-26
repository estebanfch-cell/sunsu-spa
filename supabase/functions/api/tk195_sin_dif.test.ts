import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./productos_api.ts";
import "./tickets_beta_api.ts";
import { asignarCobradoGift, alertaDescuadreCobrado } from "./tickets_beta_api.ts";
import { lineasTicket } from "./productos.ts";
import type { Row } from "./domain.ts";
import type { LineaTk } from "./ticket_beta.ts";

const root = new URL("../../../", import.meta.url);
const api = readFileSync(new URL("./tickets_beta_api.ts", import.meta.url), "utf8");
const prod = readFileSync(new URL("./productos.ts", import.meta.url), "utf8");
const html = readFileSync(new URL("index.html", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");
const mc = readFileSync(new URL("mc-tickets.js", root), "utf8");

describe("TK195 · nunca una línea DIF", () => {
  it("el backend ya no inserta «Diferencia sin explicar» y avisa en faltan", () => {
    assert.doesNotMatch(api, /out\.push\(\{ tipo: "diferencia", sku: "DIF"/);
    assert.match(api, /function alertaDescuadreCobrado/);
    assert.match(api, /function asignarCobradoGift/);
    assert.match(api, /function facturaMigoDeTicket/);
    assert.match(api, /no se añade una línea «Diferencia sin explicar»/);
    assert.match(prod, /NUNCA usar SUNSU-34/);
    assert.match(prod, /code === "INV-123"\) lista = 3/);
    assert.match(mc, /l\.tipo !== "diferencia"/);
  });

  it("cache TK195", () => {
    assert.match(html, /SUNSU_CACHE = "sunsu-2026-11-26-TK225"/);
    assert.match(sw, /const CACHE = "sunsu-2026-11-26-TK225"/);
    assert.match(html, /mc-tickets\.js\?v=20261120tk195/);
  });

  it("asignarCobradoGift usa lo cobrado y no el PVP muerto de \$34.50", () => {
    const L = [{ tipo: "gift", sku: "GIFT", nombre: "Gift card", cantidad: 1, precio_unit: 34.5, descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: true }] as LineaTk[];
    asignarCobradoGift(L, 148);
    assert.equal(L[0].precio_unit, 148);
    assert.equal(L[0].estimado, false);
    const caja = [
      { tipo: "producto", sku: "INV-123", nombre: "Caja de gift card", cantidad: 1, precio_unit: 3, descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: false },
      { tipo: "gift", sku: "GIFT", nombre: "Gift card", cantidad: 1, precio_unit: 0, descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: true },
    ] as LineaTk[];
    asignarCobradoGift(caja, 148);
    assert.equal(caja[1].precio_unit, 145);
    const ok = [{ tipo: "gift", sku: "GIFT", nombre: "Gift card", cantidad: 1, precio_unit: 65, descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: false }] as LineaTk[];
    asignarCobradoGift(ok, 65);
    assert.equal(ok[0].precio_unit, 65);
  });

  it("alertaDescuadreCobrado no aparece si cuadra", () => {
    assert.equal(alertaDescuadreCobrado(148, 148), null);
    assert.match(alertaDescuadreCobrado(148, 34.5) || "", /\$148\.00/);
  });

  it("lineasTicket no usa SUNSU-34 y pone \$3 a INV-123 si el catálogo no lo tiene", () => {
    const L = lineasTicket(
      { venta_gift: "SI, 26-177, 1 GEISHA", orig: { "INV-123": 1 }, estimado: 148 } as Row,
      (c) => 0,
    );
    const gift = L.find((x) => x.tipo === "gift")!;
    const caja = L.find((x) => x.codigo === "INV-123")!;
    assert.equal(gift.lista, 0);
    assert.equal(caja.lista, 3);
  });
});

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false }]);
  db.tables.set("catalogo", [
    { sku: "SUNSU-34", producto_servicio: "GIFT CARD $30", tipo: "GIFT CARD", total_con_iva: 34.5, subtotal: 30, activo: false },
    { sku: "SUNSU-35", producto_servicio: "GIFT CARD", tipo: "GIFT CARD", total_con_iva: 65, subtotal: 56.52, activo: true },
    { sku: "SUNSU-43", producto_servicio: "FACIAL DE GEISHA", tipo: "FACIAL ESPECIAL", total_con_iva: 145, subtotal: 126.09, activo: true },
  ]);
  db.tables.set("tickets", [
    { id: 646241, sheet_row: 1951, so_num: "TK-SO-1950", timestamp: "2026-11-20T17:26:12+00:00", atendido_por: "Alejandra Rodriguez", nombre: "Ana", apellido: "Galarza", estimado: 148, fac: null, fac_7: null, venta_gift: "SI, 26-177, 1 GEISHA. Para: Pa.", orig: { "INV-123": 1 } },
    { id: 10, sheet_row: 10, so_num: "TK-SO-1946", timestamp: "2026-11-20T14:00:06+00:00", atendido_por: "Alejandra Rodriguez", nombre: "Juan Elias", apellido: "Erazo", estimado: 65, fac: null, fac_7: null, venta_gift: "SI, 26-176, PREMIUM", orig: {} },
  ]);
  db.tables.set("beta_migo_facturas_vivo", [{
    factura: "001-001-000002989", fecha: "2026-11-20", cliente: "ANA GALARZA", total: 148, subtotal: 128.7,
    lineas: [{ sku: "SUNSU-35", codigo: "SUNSU-35", producto: "GIFT CARD", cantidad: 1, precio_unit: 128.7, subtotal: 128.7, iva: 19.3, total: 148 }],
  }]);
  for (const t of ["erp_productos", "erp_bodegas", "erp_stock", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "promos", "beta_tickets", "beta_ticket_lineas", "solicitudes_cambio", "clientas_registro", "beta_stock_movimientos", "beta_migo_lineas", "beta_pagos"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-20T23:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, p: Row = {}) => handle(a, { token: "adm", ...p }, { ...c, token: "adm" }) as Promise<Row>;
  return { db, h };
}

describe("TK195 · ticket de gift card de Ana Galarza y similar", () => {
  it("sin fac_7, cruza la factura 2989 y no inventa DIF ni deja la gift en \$34.50", async () => {
    const { h } = semilla();
    const g = await h("tk_get", { clave: "TK-SO-1950" });
    const L = g.lineas as Row[];
    assert.equal(L.some((l) => l.tipo === "diferencia" || l.sku === "DIF" || /Diferencia sin explicar/i.test(String(l.nombre))), false);
    const gift = L.find((l) => l.tipo === "gift" || /GIFT/i.test(String(l.sku) + String(l.nombre)));
    assert.ok(gift, "sale la línea de gift card: " + JSON.stringify(L));
    assert.equal(Number(gift!.precio_unit), 148);
    assert.equal((g.totales as Row).total, 148);
  });

  it("una gift Premium \$65 sin factura cobra \$65, no \$34.50, y sin DIF", async () => {
    const { h } = semilla();
    const g = await h("tk_get", { clave: "TK-SO-1946" });
    const L = g.lineas as Row[];
    assert.equal(L.some((l) => l.tipo === "diferencia"), false);
    assert.equal(L.length, 1);
    assert.equal(L[0].tipo, "gift");
    assert.equal(L[0].precio_unit, 65);
    assert.equal((g.totales as Row).total, 65);
  });
});
