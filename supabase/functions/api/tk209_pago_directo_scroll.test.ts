// TK209 (Emilia): pago directo no se marca Falta factura; texto legible en rojo; la lista no salta al inicio.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./tickets_beta_api.ts";
import "./tickets_lista_api.ts";
import "./voucher_ocr_api.ts";
import { esPagoDirecto, faltaFacturaTicket } from "./tickets_beta_api.ts";
import { alertasFaltaFactura } from "./voucher_ocr_api.ts";
import type { Row } from "./domain.ts";
import type { Ctx } from "./lib.ts";

const root = new URL("../../../", import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root), "utf8");

describe("TK209 · esPagoDirecto", () => {
  it("detecta la marca de Alejandra (notas EGB / Descuento: Directo / justificación)", () => {
    assert.equal(esPagoDirecto({
      notas_generales: "Producto para la Srta Vanesa Chiriboga.\nPago Directo EGB · 🏷 Descuento: Directo",
      orig: { justificacion_descuento: "Pago directo" },
      estimado: 0, ml_001: 1,
    }), true);
    assert.equal(esPagoDirecto({
      notas_generales: "Pago Directo EGB · 🏷 Descuento: Directo",
      orig: { justificacion_descuento: "Promoción" },
      estimado: 0, compra_pack_3: "SUNSU-53",
    }), true);
    assert.equal(esPagoDirecto({ notas_generales: "Facial con hipertensión", orig: {} }), false);
    assert.equal(faltaFacturaTicket({ facReal: false, total: 110, fecha: "2026-11-20", pagoDirecto: true }), false);
    assert.equal(faltaFacturaTicket({ facReal: false, total: 110, fecha: "2026-11-20", pagoDirecto: false }), true);
  });
});

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false }]);
  db.tables.set("catalogo", [
    { sku: "ML-001", producto_servicio: "HEARTLEAF", tipo: "PRODUCTO", total_con_iva: 110, subtotal: 95.65, activo: true },
    { sku: "SUNSU-53", producto_servicio: "x3 Facial de Ginseng", tipo: "PAQUETE", total_con_iva: 256.5, subtotal: 223.04, activo: true },
    { sku: "SUNSU-40", producto_servicio: "FACIAL RESET 3x1", tipo: "FACIAL", total_con_iva: 95, subtotal: 82.61, activo: true },
  ]);
  db.tables.set("tickets", [
    { id: 646243, so_num: "TK-SO-1952", timestamp: "2026-11-20T18:01:25+00:00", nombre: "Emilia", apellido: "Gallegos", estimado: 0, atendido_por: "Alejandra Rodriguez", fac_7: null, orig: { justificacion_descuento: "Pago directo", "ML-001": 1 }, notas_generales: "Producto para la Srta Vanesa Chiriboga.\nPago Directo EGB · 🏷 Descuento: Directo", ml_001: 1 },
    { id: 646244, so_num: "TK-SO-1953", timestamp: "2026-11-20T18:15:22+00:00", nombre: "Maria Elisa", apellido: "Galarraga", estimado: 0, atendido_por: "Alejandra Rodriguez", fac_7: null, orig: { justificacion_descuento: "Promoción" }, notas_generales: "Pago Directo EGB · 🏷 Descuento: Directo", compra_pack_3: "SUNSU-53 x3 Facial de Ginseng" },
    { id: 646248, so_num: "TK-SO-1957", timestamp: "2026-11-20T19:10:11+00:00", nombre: "Andrea", apellido: "Maldonado", estimado: 14.996, facial_hecho: "SUNSU-40 Facial Reset 3x1", atendido_por: "Daniela Mora", fac_7: null, orig: {} },
  ]);
  db.tables.set("beta_tickets", [
    { clave: "TK-SO-1952", lineas_beta: false, datos: {} },
    { clave: "TK-SO-1953", lineas_beta: false, datos: {} },
    { clave: "TK-SO-1957", lineas_beta: false, datos: {} },
  ]);
  for (const t of ["erp_productos", "erp_bodegas", "erp_stock", "erp_movimientos", "app_modulos", "beta_ticket_lineas", "solicitudes_cambio", "clientas_registro", "beta_pagos", "beta_cuadre_link", "beta_migo_facturas_vivo", "beta_ticket_flags", "beta_ticket_cancelados", "beta_ticket_envios", "gift_cards", "log_acciones", "beta_clientes", "catalogo"]) if (!db.tables.has(t)) db.tables.set(t, []);
  const ctx = { db, now: new Date("2026-11-21T21:00:00-05:00"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" } as unknown as Ctx;
  const h = (a: string, p: Row = {}) => handle(a, { token: "adm", ...p }, { ...ctx, token: "adm" } as never) as Promise<Row>;
  return { db, ctx, h };
}

describe("TK209 · lista, detalle y alertas de pago directo", () => {
  it("1952 y 1953 no salen en rojo ni en Falta factura; el total de Sunsu es $0", async () => {
    const { h, ctx } = semilla();
    const r = await h("tk_historial", { desde: "2026-11-20", hasta: "2026-11-21", offset: 0, limit: 50 });
    const by = Object.fromEntries(((r.items || []) as Row[]).map((x) => [String(x.so_num), x]));
    assert.equal((by["TK-SO-1952"]?.led as Row)?.pagoDirecto, 1);
    assert.ok(!(by["TK-SO-1952"]?.led as Row)?.faltaFactura);
    assert.equal(by["TK-SO-1952"]?.pago_directo, true);
    assert.equal(by["TK-SO-1952"]?.total, 0);
    assert.equal((by["TK-SO-1953"]?.led as Row)?.pagoDirecto, 1);
    assert.ok(!(by["TK-SO-1953"]?.led as Row)?.faltaFactura);
    assert.equal(by["TK-SO-1953"]?.total, 0);
    assert.equal((by["TK-SO-1957"]?.led as Row)?.faltaFactura, 1);
    const sin = await h("tk_historial", { desde: "2026-11-20", hasta: "2026-11-21", est: "sinfactura", offset: 0, limit: 50 });
    const nums = ((sin.items || []) as Row[]).map((x) => x.so_num);
    assert.ok(!nums.includes("TK-SO-1952"));
    assert.ok(!nums.includes("TK-SO-1953"));
    assert.ok(nums.includes("TK-SO-1957"));
    const a = await h("tk_get", { clave: "TK-SO-1952" });
    const chips = ((a.chips || []) as Row[]).map((c) => String(c.k) + "|" + String(c.t));
    assert.ok(chips.some((c) => c.includes("pagodirecto|Pago directo")), chips.join(", "));
    assert.ok(!chips.some((c) => c.includes("Falta factura")));
    assert.ok(!a.falta_factura);
    assert.equal(a.pago_directo, true);
    const claves = (await alertasFaltaFactura(ctx)).map((x) => x.clave);
    assert.ok(!claves.includes("TK-SO-1952"));
    assert.ok(!claves.includes("TK-SO-1953"));
    assert.ok(claves.includes("TK-SO-1957"));
  });
});

describe("TK209 · pantallas", () => {
  it("lista y detalle muestran Pago directo, no rojo, y el texto de las tarjetas rojas es oscuro", () => {
    const js = file("beta-screens.js"), tk = file("mc-tickets.js"), html = file("index.html"), sw = file("sw.js");
    assert.match(js, /function _tkPagoDirecto/);
    assert.match(js, /mob-fac"> · Pago directo/);
    assert.match(js, /_tkPill\('gris','Pago directo'/);
    assert.match(tk, /t: "Pago directo", tone: "neutro"/);
    assert.match(html, /\.mob-card\.tk-flagged \.mob-num/);
    assert.match(html, /#1A0505/);
    assert.match(html, /#140202/);
    const enHtml = (html.match(/window\.SUNSU_CACHE = "([^"]+)"/) || [])[1];
    const enSw = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
    assert.equal(enHtml, enSw);
assert.equal(enSw, "sunsu-2026-11-26-CONSUI");
  });
  it("la lista de tickets conserva el scroll al refrescar y al volver del detalle; lo mismo en clientes, pagos e inventario", () => {
    const js = file("beta-screens.js"), html = file("index.html"), cli = file("mc-clientes.js"), caja = file("mc-caja.js");
    assert.match(html, /window\.SunsuListaPos/);
    assert.match(html, /saveFromCurrent/);
    assert.match(html, /hashchange/);
    assert.match(js, /SunsuListaPos\.save\('tickets'\)/);
    assert.match(js, /SunsuListaPos\.restore\('tickets',\{inplace:true\}\)/);
    assert.match(js, /no se resetean filtros/);
    assert.match(cli, /SunsuListaPos\.save\("clientes"\)/);
    assert.match(caja, /SunsuListaPos\.save\("pagos"\)/);
    assert.match(html, /SunsuListaPos\.save\("inventario"\)/);
    assert.match(html, /keyFromHash/);
  });
});
