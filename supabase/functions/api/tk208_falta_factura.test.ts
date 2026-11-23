// TK208 (Emilia): tickets con total de líneas > $0 y sin factura Migo se marcan en rojo «Falta factura».
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
import { faltaFacturaTicket, hayFactura, FALTA_DESDE } from "./tickets_beta_api.ts";
import { alertasFaltaFactura, resumenFaltaFactura } from "./voucher_ocr_api.ts";
import { totalValorTicket } from "./ticket_lista_card.ts";
import type { Row } from "./domain.ts";
import type { Ctx } from "./lib.ts";

const root = new URL("../../../", import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root), "utf8");

describe("TK208 · faltaFacturaTicket", () => {
  it("marca un ticket de $110 sin factura y no usa lo cobrado", () => {
    assert.equal(faltaFacturaTicket({ anulado: false, facReal: false, total: 110, fecha: "2026-11-20" }), true);
    assert.equal(faltaFacturaTicket({ anulado: false, facReal: true, total: 110, fecha: "2026-11-20" }), false);
    assert.equal(faltaFacturaTicket({ anulado: true, facReal: false, total: 110, fecha: "2026-11-20" }), false);
    assert.equal(faltaFacturaTicket({ anulado: false, facReal: false, total: 0, fecha: "2026-11-20" }), false);
    assert.equal(faltaFacturaTicket({ anulado: false, facReal: false, total: 15, fecha: "2026-10-15" }), false);
    assert.equal(FALTA_DESDE, "2026-11-01");
  });
  it("hayFactura acepta fac_7, datos o el link de cuadre", () => {
    assert.equal(hayFactura(null, null, null), false);
    assert.equal(hayFactura("2979", null, null), true);
    assert.equal(hayFactura(null, "001-001-000002979", null), true);
    assert.equal(hayFactura(null, null, "001-001-000002982"), true);
    assert.equal(hayFactura("SIN FACTURA", null, null), false);
  });
  it("el total de 1957 es $110 aunque el estimado de la hoja sea $15", () => {
    const map = new Map<string, Row>([
      ["40", { sku: "SUNSU-40", total_con_iva: 95, producto_servicio: "FACIAL RESET 3x1" }],
      ["31", { sku: "SUNSU-31", total_con_iva: 15, producto_servicio: "PDRN SERUM" }],
    ]);
    const tot = totalValorTicket({ estimado: 14.996, facial_hecho: "SUNSU-40 Facial Reset 3x1", servicios_adicionales: "SUNSU-31 PDRN Serum", paquete: "" }, { map, canje: false });
    assert.equal(tot, 110);
    assert.equal(faltaFacturaTicket({ facReal: false, total: tot, fecha: "2026-11-20" }), true);
  });
});

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "rec", uid: "alejandra", rol: "recepcion", name: "Alejandra", exp: "2099-01-01T00:00:00.000Z" },
    { token: "stf", uid: "daniela", rol: "cosmetologa", name: "Daniela", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "alejandra", nombre: "Alejandra Rodriguez", short: "Alejandra", rol: "recepcion", bloqueado: false },
    { id: "daniela", nombre: "Daniela Mora", short: "Daniela", rol: "cosmetologa", bloqueado: false },
  ]);
  db.tables.set("catalogo", [
    { sku: "SUNSU-40", producto_servicio: "FACIAL RESET 3x1", tipo: "FACIAL", total_con_iva: 95, subtotal: 82.61, activo: true },
    { sku: "SUNSU-31", producto_servicio: "PDRN SERUM", tipo: "SERVICIO", total_con_iva: 15, subtotal: 13.04, activo: true },
    { sku: "SUNSU-18", producto_servicio: "PAQUETE (3) FACIAL REPARACIÓN", tipo: "PAQUETE", total_con_iva: 175.5, subtotal: 152.61, activo: true },
  ]);
  db.tables.set("tickets", [
    { id: 646248, so_num: "TK-SO-1957", timestamp: "2026-11-20T19:10:11+00:00", nombre: "Andrea", apellido: "Maldonado Rosales", estimado: 14.996, facial_hecho: "SUNSU-40 Facial Reset 3x1", servicios_adicionales: "SUNSU-31 PDRN Serum", atendido_por: "Daniela Mora", fac_7: null, orig: {} },
    { id: 646251, so_num: "TK-SO-1960", timestamp: "2026-11-21T14:22:08+00:00", nombre: "Yenyret", apellido: "Torres", estimado: 190.5, facial_hecho: "SUNSU-02 Facial Reparación", compra_pack_3: "SUNSU-18", servicios_adicionales: "SUNSU-31 PDRN Serum", atendido_por: "Andrea Robles", fac_7: null, orig: {}, paquete: "SI, 1/3" },
    { id: 646224, so_num: "TK-SO-1927", timestamp: "2026-11-19T15:34:27+00:00", nombre: "Maria fernanda", apellido: "Rosales", estimado: 95, facial_hecho: "SUNSU-40 Facial Reset 3x1", atendido_por: "Daniela Mora", fac_7: "2979", orig: {} },
    { id: 99, so_num: "TK-SO-0099", timestamp: "2026-11-20T12:00:00+00:00", nombre: "Canje", apellido: "Cero", estimado: 0, facial_hecho: "SUNSU-40 Facial Reset 3x1", atendido_por: "Andrea Robles", paquete: "SI, 2/3", fac_7: null, orig: {} },
  ]);
  db.tables.set("beta_tickets", [
    { clave: "TK-SO-1957", lineas_beta: false, datos: {} },
    { clave: "TK-SO-1960", lineas_beta: false, datos: {} },
    { clave: "TK-SO-1927", lineas_beta: true, total: 95, datos: { factura: "001-001-000002979" } },
    { clave: "TK-SO-0099", lineas_beta: false, datos: {} },
  ]);
  db.tables.set("beta_cuadre_link", [{ ticket_id: 646224, factura: "001-001-000002979" }]);
  for (const t of ["erp_productos", "erp_bodegas", "erp_stock", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "promos", "beta_ticket_lineas", "solicitudes_cambio", "clientas_registro", "beta_pagos", "beta_caja_movimientos", "beta_migo_facturas_vivo", "beta_ticket_flags", "beta_ticket_cancelados", "beta_ticket_envios", "gift_cards", "log_acciones", "beta_migo_borradores"]) if (!db.tables.has(t)) db.tables.set(t, []);
  const ctx = { db, now: new Date("2026-11-21T21:00:00-05:00"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" } as unknown as Ctx;
  const h = (a: string, p: Row = {}, token = "adm") => handle(a, { token, ...p }, { ...ctx, token } as never) as Promise<Row>;
  return { db, ctx, h };
}

describe("TK208 · lista, detalle y alertas", () => {
  it("tk_historial marca faltaFactura en 1957 y 1960, no en 1927 ni en el canje $0", async () => {
    const { h } = semilla();
    const r = await h("tk_historial", { desde: "2026-11-19", hasta: "2026-11-21", offset: 0, limit: 50 });
    const items = r.items as Row[];
    const by = Object.fromEntries(items.map((x) => [String(x.so_num), x]));
    assert.equal((by["TK-SO-1957"]?.led as Row)?.faltaFactura, 1);
    assert.equal((by["TK-SO-1960"]?.led as Row)?.faltaFactura, 1);
    assert.ok(!(by["TK-SO-1927"]?.led as Row)?.faltaFactura);
    assert.ok(!(by["TK-SO-0099"]?.led as Row)?.faltaFactura);
  });
  it("filtro Sin factura / No cuadra incluye 1957 y omite el que ya tiene factura", async () => {
    const { h } = semilla();
    const sin = await h("tk_historial", { desde: "2026-11-19", hasta: "2026-11-21", est: "sinfactura", offset: 0, limit: 50 });
    const nums = (sin.items as Row[]).map((x) => x.so_num);
    assert.ok(nums.includes("TK-SO-1957"));
    assert.ok(nums.includes("TK-SO-1960"));
    assert.ok(!nums.includes("TK-SO-1927"));
    assert.ok(!nums.includes("TK-SO-0099"));
    const rojo = await h("tk_historial", { desde: "2026-11-19", hasta: "2026-11-21", seg: "corregir", offset: 0, limit: 50 });
    const rn = (rojo.items as Row[]).map((x) => x.so_num);
    assert.ok(rn.includes("TK-SO-1957"));
    assert.ok(!rn.includes("TK-SO-1927"));
  });
  it("detalle: chip y falta_factura en 1957; 1927 facturado; canje $0 sin Falta factura", async () => {
    const { h } = semilla();
    const a = await h("tk_get", { clave: "TK-SO-1957" });
    const chips = ((a.chips || []) as Row[]).map((c) => c.t + "|" + c.c);
    assert.ok(chips.some((c) => c.startsWith("Falta factura|faltafactura")), chips.join(", "));
    assert.equal(a.falta_factura, true);
    const b = await h("tk_get", { clave: "TK-SO-1927" });
    assert.ok(((b.chips || []) as Row[]).some((c) => c.t === "Facturado"));
    assert.ok(!b.falta_factura);
    const c = await h("tk_get", { clave: "TK-SO-0099" });
    const ct = ((c.chips || []) as Row[]).map((x) => x.t);
    assert.ok(!ct.includes("Falta factura"));
  });
  it("voucher_alertas: admin y recepción ven el conteo; una cosmetóloga no", async () => {
    const { h, ctx } = semilla();
    const items = await alertasFaltaFactura(ctx);
    const claves = items.map((x) => x.clave);
    assert.ok(claves.includes("TK-SO-1957"));
    assert.ok(claves.includes("TK-SO-1960"));
    assert.ok(!claves.includes("TK-SO-1927"));
    const res = resumenFaltaFactura(items)!;
    assert.match(String(res.texto), /Falta factura \(\d+ tickets?\)/);
    assert.match(String(res.detalle), /TK-SO-1957 · Daniela/);
    const adm = await h("voucher_alertas", {});
    assert.ok((adm.total_falta_factura as number) >= 2);
    assert.ok(((adm.items || []) as Row[]).some((x) => x.key === "falta-factura"));
    const rec = await h("voucher_alertas", {}, "rec");
    assert.ok((rec.total_falta_factura as number) >= 2);
    const stf = await h("voucher_alertas", {}, "stf");
    assert.equal(stf.total_falta_factura, 0);
    assert.equal(((stf.items || []) as Row[]).length, 0);
  });
});

describe("TK208 · pantallas", () => {
  it("lista: badge Falta factura, rojo por faltaFactura, precedencia violeta > rojo > amarillo", () => {
    const js = file("beta-screens.js");
    assert.match(js, /function _tkFaltaFactura/);
    assert.match(js, /mob-fac-falta"> · Falta factura/);
    assert.match(js, /faltaFac\?'Falta factura'/);
    assert.match(js, /_tkSolPend\(t\)\?' tk-solpend':fl\?' tk-flagged':fa\?' tk-falta'/);
    assert.match(js, /faltafactura:'#B91C1C'/);
  });
  it("detalle: banner Estado · Falta factura en rojo saturado", () => {
    const tk = file("mc-tickets.js");
    assert.match(tk, /faltafactura: "#B91C1C"/);
    assert.match(tk, /t: "Falta factura", tone: "rojo"/);
    assert.match(tk, /background:#FCA5A5/);
  });
  it("Dashboard e Inicio de recepción piden voucher_alertas; iPhone tiene rojo saturado", () => {
    const html = file("index.html"), sw = file("sw.js"), home = file("mc-staff-home.js");
    assert.match(html, /api\("voucher_alertas"/);
    assert.match(home, /voucher_alertas/);
    assert.match(html, /-webkit-touch-callout: none/);
    assert.match(html, /\.mob-card\.tk-flagged \{ background: #FCA5A5;/);
    const enHtml = (html.match(/window\.SUNSU_CACHE = "([^"]+)"/) || [])[1];
    const enSw = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
    assert.equal(enHtml, enSw);
    assert.equal(enSw, "sunsu-2026-11-23-TK214");
  });
});
