// Abonos de un voucher entre tickets, cruce coherente del ticket y cantidad real de ampollas (SUNSU-15).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./tickets_beta_api.ts";
import "./pagos_caja_api.ts";
import "./tickets_lista_api.ts";
import "./voucher_ocr_api.ts";
import { recomputarCrucesTicket } from "./voucher_ocr_api.ts";
import { cruzarTicketVouchers, cruzarVoucherConTicket, sumaVouchersTicket } from "./voucher_ocr.ts";
import { lineasTicket, qtyServicioAdicional } from "./productos.ts";
import { totalValorTicket } from "./ticket_lista_card.ts";
import type { Ctx } from "./lib.ts";
import type { Row } from "./domain.ts";

const root = new URL("../../../", import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root), "utf8");
const CACHE = "sunsu-2026-11-27-GCVALOR";

describe("TK227 cantidad de ampollas en líneas sintéticas", () => {
  it("qtyServicioAdicional lee los tipos tras el · (Ácido Ascórbico, PDRN, Hidratación = 3)", () => {
    assert.equal(qtyServicioAdicional("SUNSU-15 Ampolla Especial · Ácido Ascórbico, PDRN, Hidratación", "15"), 3);
    assert.equal(qtyServicioAdicional("SUNSU-15 Ampolla Especial", "15"), 1);
    assert.equal(qtyServicioAdicional("SUNSU-31 PDRN Serum", "31"), 1);
    assert.equal(qtyServicioAdicional("SUNSU-15 x3 Ampolla", "15"), 3);
  });
  it("totalValorTicket de TK-SO-2010 da $254.99 (3 ampollas), no $225", () => {
    const map = new Map<string, Row>([
      ["ML-001", { sku: "SUNSU-ML-001", total_con_iva: 110, producto_servicio: "Rejuvenating Ampoule" }],
      ["ML-002", { sku: "SUNSU-ML-002", total_con_iva: 100, producto_servicio: "C.Tox Eye Cream" }],
      ["15", { sku: "SUNSU-15", total_con_iva: 14.996, producto_servicio: "Ampolla Especial" }],
      ["04", { sku: "SUNSU-04", total_con_iva: 65, producto_servicio: "FACIAL GOLD-AGING" }],
    ]);
    const r: Row = {
      estimado: 254.988,
      paquete: "SI, 2/3, PQ-0047 · Lorena del Carmen Ortega",
      facial_hecho: "SUNSU-04 Facial Gold-Aging",
      servicios_adicionales: "SUNSU-15 Ampolla Especial · Ácido Ascórbico, PDRN, Hidratación",
      orig: { "ML-001": 1, "ML-002": 1, beta: true },
    };
    const L = lineasTicket(r, (c) => { const x = map.get(c); return Number(x?.total_con_iva) || 0; });
    const amp = L.find((x) => x.codigo === "15" || x.codigo === "SUNSU-15");
    assert.ok(amp); assert.equal(amp!.qty, 3);
    const tot = totalValorTicket(r, { map, canje: true });
    assert.ok(Math.abs(tot - 254.99) < 0.02 || Math.abs(tot - 255) < 0.02, "total=" + tot);
    assert.ok(tot > 240, "no debe quedar en $225 por qty 1 de ampollas, tot=" + tot);
  });
});

describe("TK227 cruce con abono y refs únicas", () => {
  const v = (monto: number) => ({ estado: "ok" as const, tipo: "voucher_tarjeta", monto });
  it("Lorena: $117 + abono $58.50 cuadra con $175.50", () => {
    const c = cruzarVoucherConTicket(v(117), { totalTicket: 175.5, totalFacturaMigo: 175.5, facturaMigo: "001-001-000003028", otrosMontos: [58.5] });
    assert.equal(c.estado, "cuadra");
    assert.equal(c.suma_vouchers, 175.5);
    assert.match(c.mensaje, /175\.50/);
  });
  it("Ruth: foto $313.50 con $58.50 asignados a otro ticket cuadra con $255", () => {
    const c = cruzarVoucherConTicket(v(313.5), { totalTicket: 254.99, totalFacturaMigo: 255, facturaMigo: "001-001-000003021", montoAtribuible: 255 });
    assert.equal(c.estado, "cuadra");
    assert.equal(c.monto, 313.5);
    assert.equal(c.monto_atribuible, 255);
    assert.match(c.mensaje, /esta foto \$313\.50/i);
    assert.match(c.mensaje, /255\.00/);
  });
  it("la misma Ref no se suma dos veces (voucher + abono recibido)", () => {
    const comps: Row[] = [{ url: "archivo:a", ocr: { estado: "ok", monto: 313.5, referencia: "002572" }, abonos: [{ ticket_clave: "TK-SO-2000", monto: 58.5 }] }];
    const rec: Row[] = [{ desde_ticket: "TK-SO-2010", referencia: "002572", monto: 58.5, url: "archivo:a" }];
    // En el ticket origen (Ruth) no debe contar el abono recibido de sí mismo; en destino, si el voucher también está, no dobla.
    const enDestino = sumaVouchersTicket([{ url: "archivo:copy", ocr: { estado: "ok", monto: 313.5, referencia: "002572" } }], rec);
    assert.equal(enDestino.suma, 313.5);
    const enOrigen = sumaVouchersTicket(comps, []);
    assert.equal(enOrigen.suma, 255);
    const lorena = sumaVouchersTicket(
      [{ url: "archivo:117", ocr: { estado: "ok", monto: 117, referencia: "699455" } }],
      rec,
    );
    assert.equal(lorena.suma, 175.5);
    const cr = cruzarTicketVouchers(
      [{ url: "archivo:117", ocr: { estado: "ok", monto: 117, referencia: "699455" } }],
      { totalTicket: 175.5, totalFacturaMigo: 175.5, abonosRecibidos: rec },
    );
    assert.equal(cr.estado, "cuadra");
  });
  it("recalcular todos los cruces borra el «Pago parcial» viejo si la suma ya no es parcial", async () => {
    const datos: Row = {
      factura: "001-001-000003028",
      pago_migo: { factura: "001-001-000003028", total: 175.5, forma: "tarjeta" },
      comprobantes: [
        { url: "archivo:v1", ocr: { estado: "ok", tipo: "voucher_tarjeta", monto: 117, referencia: "699455" }, cruce: { estado: "parcial", mensaje: "Pago parcial: voucher $117.00 de $175.50 (falta $58.50)" }, borrado: false },
        { url: "archivo:v2", ocr: { estado: "ok", tipo: "voucher_tarjeta", monto: 313.5, referencia: "002572" }, cruce: { estado: "descuadre", mensaje: "viejo" }, borrado: false },
      ],
    };
    const db = new MemoryDb({
      catalogo: [
        { sku: "SUNSU-20", total_con_iva: 175.5, producto_servicio: "PAQUETE (3) FACIAL GOLD-AGING", activo: true },
      ],
      tickets: [{ id: 646291, so_num: "TK-SO-2000", timestamp: "2026-11-26T10:29:38Z", estimado: 175.5, compra_pack_3: "SUNSU-20 x3 Facial Gold-Aging", orig: {} }],
      beta_tickets: [{ clave: "TK-SO-2000", datos }],
      beta_pagos: [], beta_migo_facturas_vivo: [], beta_cuadre_link: [],
    });
    const ctx = { db, now: new Date("2026-11-27T22:00:00Z"), env: {} } as unknown as Ctx;
    const r = (await db.all("tickets"))[0];
    const cab = (await db.all("beta_tickets"))[0];
    await recomputarCrucesTicket(ctx, r, cab, datos, 175.5);
    const c1 = (datos.comprobantes as Row[])[0].cruce as Row;
    const c2 = (datos.comprobantes as Row[])[1].cruce as Row;
    const tk = datos.cruce_ticket as Row;
    assert.equal(c1.estado, "descuadre");
    assert.equal(c2.estado, "descuadre");
    assert.equal(tk.estado, "descuadre");
    assert.notEqual(c1.estado, "parcial");
    assert.ok(Number(c2.suma_vouchers) === 430.5 || Number(tk.monto) === 430.5);
  });
});

function semilla(extra: Record<string, Row[]> = {}) {
  const db = new MemoryDb({
    sesiones: [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }],
    usuarios: [{ id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false }],
    catalogo: [
      { sku: "SUNSU-20", total_con_iva: 175.5, producto_servicio: "PAQUETE (3) FACIAL GOLD-AGING", activo: true },
      { sku: "SUNSU-15", total_con_iva: 14.996, producto_servicio: "Ampolla Especial", activo: true },
      { sku: "SUNSU-ML-001", total_con_iva: 110, producto_servicio: "ML-001", activo: true },
      { sku: "SUNSU-ML-002", total_con_iva: 100, producto_servicio: "ML-002", activo: true },
    ],
    tickets: [
      { id: 646291, so_num: "TK-SO-2000", timestamp: "2026-11-26T10:29:38Z", nombre: "Lorena del Carmen", apellido: "Ortega", estimado: 175.5, compra_pack_3: "SUNSU-20 x3 Facial Gold-Aging", orig: {} },
      { id: 646301, so_num: "TK-SO-2010", timestamp: "2026-11-26T17:00:13Z", nombre: "Ruth", apellido: "Sandoval", estimado: 254.988, paquete: "SI, 2/3", facial_hecho: "SUNSU-04", servicios_adicionales: "SUNSU-15 Ampolla Especial · Ácido Ascórbico, PDRN, Hidratación", orig: { "ML-001": 1, "ML-002": 1 } },
    ],
    beta_tickets: [
      { clave: "TK-SO-2000", datos: { factura: "001-001-000003028", pago_migo: { factura: "001-001-000003028", total: 175.5, forma: "tarjeta" }, comprobantes: [{ url: "archivo:06a30762a03b4995817f", ocr: { estado: "ok", tipo: "voucher_tarjeta", monto: 117, referencia: "699455" }, pago_id: null }] } },
      { clave: "TK-SO-2010", datos: { factura: "001-001-000003021", pago_migo: { factura: "001-001-000003021", total: 255, forma: "tarjeta" }, comprobantes: [{ url: "archivo:a0b5376e57ff4d66851b", ocr: { estado: "ok", tipo: "voucher_tarjeta", monto: 313.5, referencia: "002572" }, pago_id: null }] } },
    ],
    beta_pagos: [], beta_migo_facturas: [], beta_migo_facturas_vivo: [
      { factura: "001-001-000003028", total: 175.5, forma: "tarjeta" },
      { factura: "001-001-000003021", total: 255, forma: "tarjeta" },
    ],
    beta_cuadre_link: [], erp_productos: [], erp_bodegas: [], erp_stock: [], erp_movimientos: [], app_modulos: [],
    cabina_inventario: [], inventario_base: [], promos: [], beta_ticket_lineas: [], solicitudes_cambio: [],
    clientas_registro: [], beta_stock_movimientos: [], log_acciones: [], app_archivos: [],
    ...extra,
  });
  const h = (a: string, p: Row = {}) => handle(a, { token: "adm", ...p }, { db, now: new Date("2026-11-27T22:00:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" } as never) as Promise<Row>;
  return { db, h };
}

describe("TK227 API de abono entre tickets", () => {
  it("asigna $58.50 del 002572 a TK-SO-2000 y ambos tickets cuadran", async () => {
    const { h, db } = semilla();
    const r = await h("tk_voucher_abono", { clave: "TK-SO-2010", url: "archivo:a0b5376e57ff4d66851b", hacia_clave: "TK-SO-2000", monto: 58.5 });
    assert.equal(r.ok, true, String(r.error || ""));
    assert.equal(r.monto, 58.5);
    const ruth = (await db.all("beta_tickets")).find((x) => x.clave === "TK-SO-2010")!;
    const lorena = (await db.all("beta_tickets")).find((x) => x.clave === "TK-SO-2000")!;
    const rd = ruth.datos as Row, ld = lorena.datos as Row;
    assert.equal(((rd.cruce_ticket as Row).estado), "cuadra");
    assert.equal(((ld.cruce_ticket as Row).estado), "cuadra");
    const rec = (ld.abonos_recibidos as Row[])[0];
    assert.equal(n(rec.monto), 58.5);
    assert.equal(s(rec.desde_ticket), "TK-SO-2010");
    const q = await h("tk_voucher_abono", { clave: "TK-SO-2010", url: "archivo:a0b5376e57ff4d66851b", hacia_clave: "TK-SO-2000", quitar: true });
    assert.equal(q.ok, true);
    const lorena2 = (await db.all("beta_tickets")).find((x) => x.clave === "TK-SO-2000")!;
    assert.equal((((lorena2.datos as Row).abonos_recibidos as Row[]) || []).length, 0);
  });
  it("rechaza contar dos veces la misma Ref y un monto mayor al disponible", async () => {
    const { h } = semilla();
    const over = await h("tk_voucher_abono", { clave: "TK-SO-2010", url: "archivo:a0b5376e57ff4d66851b", hacia_clave: "TK-SO-2000", monto: 400 });
    assert.match(String(over.error || ""), /quedan|asignar/i);
    const dup = await h("tk_voucher_abono", { clave: "TK-SO-2010", url: "archivo:a0b5376e57ff4d66851b", hacia_clave: "TK-SO-2010", monto: 10 });
    assert.match(String(dup.error || ""), /otro ticket/i);
  });
  it("UI: el chip aclara foto vs suma, hay formulario de abono y no dice ligar", () => {
    const caja = file("mc-caja.js"), tk = file("mc-tickets.js");
    assert.match(caja, /⚠️ Descuadre voucher: leído/);
    assert.match(caja, /esta foto/);
    assert.match(caja, /en este ticket suman/);
    assert.match(caja, /Asignar parte a otro ticket/);
    assert.match(caja, /tk_voucher_abono/);
    assert.match(tk, /Abono recibido/);
    const chipCaja = caja.slice(caja.indexOf("leidoTxt:"), caja.indexOf("window.MCOcr = MCOcr"));
    assert.doesNotMatch(chipCaja, /\bligar\b/i);
    const och = tk.slice(tk.indexOf("Abono recibido"), tk.indexOf("Abono recibido") + 800);
    assert.doesNotMatch(och, /\bligar\b/i);
  });
  it("caché PWA sunsu-2026-11-27-GCVALOR", () => {
    const html = file("index.html"), sw = file("sw.js");
    assert.match(html, new RegExp('window\\.SUNSU_CACHE = "' + CACHE + '"'));
    assert.match(sw, new RegExp('const CACHE = "' + CACHE + '"'));
  });
});

function n(v: unknown): number { return Number(v) || 0; }
function s(v: unknown): string { return String(v || ""); }
