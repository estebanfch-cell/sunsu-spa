// TK157 (Emilia t696u): Claude Vision lee vouchers/transferencias y se cruza contra ticket y factura Migo.
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
import { alertasDescuadre } from "./voucher_ocr_api.ts";
import { cruzarVoucherConTicket, leerVoucherConClaude, parsearRespuestaOcr } from "./voucher_ocr.ts";
import type { Row } from "./domain.ts";

const root = new URL("../../../", import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root), "utf8");
const JSON_OK = '{"tipo":"voucher_tarjeta","monto":30,"referencia":"000970","fecha":"2026-11-19","hora":"14:05","banco_red":"Medianet · Visa Debit","ultimos4":"4521","confianza":"alta","resumen":"Medianet Visa Debit · $30.00 · Ref 000970 · 19/11/2026"}';
const claudeOk = (texto: string, status = 200) => (async () => new Response(JSON.stringify({ content: [{ type: "text", text: texto }] }), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

describe("TK157 parseo de la respuesta de Claude", () => {
  it("JSON válido", () => {
    const o = parsearRespuestaOcr(JSON_OK);
    assert.equal(o.estado, "ok"); assert.equal(o.monto, 30); assert.equal(o.referencia, "000970"); assert.equal(o.banco_red, "Medianet · Visa Debit"); assert.equal(o.ultimos4, "4521"); assert.equal(o.fecha, "2026-11-19");
  });
  it("JSON envuelto en markdown y monto con coma", () => {
    const o = parsearRespuestaOcr("Aquí está:\n```json\n" + JSON_OK.replace('"monto":30', '"monto":"$1.234,50"') + "\n```");
    assert.equal(o.estado, "ok"); assert.equal(o.monto, 1234.5);
  });
  it("nunca guarda el número completo de tarjeta", () => {
    const o = parsearRespuestaOcr(JSON_OK.replace('"4521"', '"4111111111114521"').replace("Ref 000970", "Tarjeta 4111111111114521"));
    assert.equal(o.ultimos4, "4521"); assert.ok(!/4111111111114521/.test(o.resumen));
  });
  it("respuesta ilegible / no JSON", () => {
    assert.equal(parsearRespuestaOcr("No puedo leer esta imagen").estado, "error");
    const o = parsearRespuestaOcr('{"tipo":"no_legible","monto":null,"confianza":"baja"}');
    assert.equal(o.tipo, "no_legible"); assert.equal(cruzarVoucherConTicket(o, { totalTicket: 15 }).estado, "ilegible");
  });
  it("leerVoucherConClaude: OK, HTTP error, red caída y timeout sin lanzar", async () => {
    const ok = await leerVoucherConClaude(new Uint8Array([1, 2, 3]), "image/jpeg", { apiKey: "k", fetchImpl: claudeOk(JSON_OK) });
    assert.equal(ok.monto, 30);
    const e500 = await leerVoucherConClaude("AAAA", "image/png", { apiKey: "k", fetchImpl: claudeOk("x", 500) });
    assert.equal(e500.estado, "error");
    const red = await leerVoucherConClaude("AAAA", "image/png", { apiKey: "k", fetchImpl: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch });
    assert.equal(red.estado, "error"); assert.match(red.error || "", /red/);
    const lento = ((_u: unknown, init: RequestInit) => new Promise((_r, rej) => { init.signal?.addEventListener("abort", () => { const er = new Error("abort"); er.name = "AbortError"; rej(er); }); })) as unknown as typeof fetch;
    const to = await leerVoucherConClaude("AAAA", "image/webp", { apiKey: "k", fetchImpl: lento, timeoutMs: 30 });
    assert.equal(to.estado, "error"); assert.match(to.error || "", /Tiempo/);
    assert.equal((await leerVoucherConClaude("AAAA", "application/pdf", { apiKey: "k" })).estado, "error");
    assert.equal((await leerVoucherConClaude("AAAA", "image/jpeg", {})).error, "Falta ANTHROPIC_API_KEY");
  });
});

describe("TK157 cruce voucher ↔ ticket ↔ factura Migo", () => {
  const v = (monto: number) => ({ estado: "ok" as const, tipo: "voucher_tarjeta", monto });
  it("cuadra exacto con ticket y factura", () => {
    const c = cruzarVoucherConTicket(v(175), { totalTicket: 175, totalFacturaMigo: 175 });
    assert.equal(c.estado, "cuadra"); assert.equal(c.mensaje, "Voucher cuadra con ticket y factura ($175.00)");
  });
  it("tolerancia $0.05", () => {
    assert.equal(cruzarVoucherConTicket(v(174.96), { totalTicket: 175 }).estado, "cuadra");
    assert.equal(cruzarVoucherConTicket(v(175.05), { totalTicket: 175 }).estado, "cuadra");
    assert.equal(cruzarVoucherConTicket(v(175.07), { totalTicket: 175 }).estado, "descuadre");
  });
  it("descuadre vs ticket", () => {
    const c = cruzarVoucherConTicket(v(30), { totalTicket: 15 });
    assert.equal(c.estado, "descuadre"); assert.equal(c.descuadre_ticket, true); assert.equal(c.diff_ticket, 15);
    assert.equal(c.mensaje, "Descuadre: voucher $30.00 vs ticket $15.00 (+$15.00)");
  });
  it("descuadre vs factura Migo", () => {
    const c = cruzarVoucherConTicket(v(30), { totalTicket: 30, totalFacturaMigo: 125 });
    assert.equal(c.estado, "descuadre"); assert.equal(c.descuadre_ticket, false); assert.equal(c.descuadre_factura, true); assert.equal(c.diff_factura, -95);
    assert.equal(c.mensaje, "Descuadre: voucher $30.00 vs factura Migo $125.00 (-$95.00)");
  });
  it("pago parcial: 1 voucher de 2 → parcial; la suma de 2 vouchers = total → cuadra", () => {
    assert.equal(cruzarVoucherConTicket(v(20), { totalTicket: 45 }).estado, "parcial");
    const c = cruzarVoucherConTicket(v(25), { totalTicket: 45, totalFacturaMigo: 45, otrosMontos: [20] });
    assert.equal(c.estado, "cuadra"); assert.equal(c.suma_vouchers, 45);
    assert.equal(cruzarVoucherConTicket(v(20), { totalTicket: 45, montoPago: 20, totalFacturaMigo: 45 }).estado, "cuadra");
    assert.equal(cruzarVoucherConTicket(v(30), { totalTicket: 45, montoPago: 20 }).estado, "descuadre");
  });
  it("sin factura Migo: solo cruza con el ticket", () => {
    const c = cruzarVoucherConTicket(v(15), { totalTicket: 15, totalFacturaMigo: null });
    assert.equal(c.estado, "cuadra"); assert.equal(c.descuadre_factura, false); assert.equal(c.total_factura, null);
    assert.equal(cruzarVoucherConTicket(null, { totalTicket: 15 }).estado, "pendiente");
    assert.equal(cruzarVoucherConTicket(v(15), {}).estado, "pendiente");
  });
});

function semilla(extra: Record<string, Row[]> = {}, envX: Row = {}, fetchImpl: typeof fetch = claudeOk(JSON_OK)) {
  const db = new MemoryDb({
    sesiones: [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }],
    usuarios: [{ id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false }],
    catalogo: [],
    tickets: [{ id: 1927, sheet_row: null, so_num: "TK-SO-1927", timestamp: "2026-11-19T19:00:00Z", nombre: "María Fernanda", apellido: "R", estimado: 15, cob: null, fac: null, fac_7: null, comp: null, orig: {} }],
    beta_tickets: [{ id: 1, clave: "TK-SO-1927", datos: {} }],
    beta_pagos: [], beta_caja_movimientos: [], beta_migo_facturas: [], beta_migo_facturas_vivo: [], beta_cuadre_link: [],
    erp_productos: [], erp_bodegas: [], erp_stock: [], erp_movimientos: [], app_modulos: [], cabina_inventario: [], inventario_base: [], promos: [],
    beta_ticket_lineas: [], solicitudes_cambio: [], clientas_registro: [], beta_stock_movimientos: [], log_acciones: [], app_archivos: [],
    ...extra,
  });
  const h = (a: string, p: Row = {}) => handle(a, { token: "adm", ...p }, { db, now: new Date("2026-11-20T01:00:00Z"), env: { ANTHROPIC_API_KEY: "test", ...envX }, fetchImpl, legacyLogin: async () => ({}), token: "adm" } as never) as Promise<Row>;
  return { db, h };
}
const IMG = "data:image/jpeg;base64,/9j/AAAA";

describe("TK157 lectura automática al subir y re-escaneo", () => {
  it("tk_subir_doc guarda ocr + cruce en datos.comprobantes y lo devuelve", async () => {
    const { h, db } = semilla();
    const r = await h("tk_subir_doc", { clave: "TK-SO-1927", imagen: IMG });
    assert.equal(r.ok, true);
    assert.equal((r.ocr as Row).monto, 30);
    assert.equal((r.cruce as Row).estado, "descuadre");
    assert.equal((r.cruce as Row).mensaje, "Descuadre: voucher $30.00 vs ticket $15.00 (+$15.00)");
    const cab = (await db.all("beta_tickets"))[0];
    const c = ((cab.datos as Row).comprobantes as Row[])[0];
    assert.equal((c.ocr as Row).referencia, "000970"); assert.equal((c.cruce as Row).estado, "descuadre");
  });
  it("si Claude falla, la foto se guarda igual con ocr.estado=error", async () => {
    const { h, db } = semilla({}, {}, (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch);
    const r = await h("tk_subir_doc", { clave: "TK-SO-1927", imagen: IMG });
    assert.equal(r.ok, true); assert.equal((r.ocr as Row).estado, "error");
    const c = (((await db.all("beta_tickets"))[0].datos as Row).comprobantes as Row[])[0];
    assert.match(String(c.url), /^archivo:/);
  });
  it("sin ANTHROPIC_API_KEY no se agrega nada (subida igual que antes)", async () => {
    const { h } = semilla({}, { ANTHROPIC_API_KEY: "" });
    const r = await h("tk_subir_doc", { clave: "TK-SO-1927", imagen: IMG });
    assert.equal(r.ok, true); assert.equal(r.ocr, undefined);
  });
  it("pg_registrar con foto: cruza contra el monto del pago", async () => {
    const { h } = semilla();
    const r = await h("pg_registrar", { clave: "TK-SO-1927", total: 15, metodo: "tarjeta", monto: 15, ref: "000970", imagen: IMG });
    assert.equal(r.ok, true); assert.equal((r.cruce as Row).estado, "descuadre"); assert.match(String((r.cruce as Row).mensaje), /vs pago \$15\.00/);
  });
  it("tk_leer_voucher re-escanea un voucher anterior (app_archivos) y actualiza el cruce con la factura Migo", async () => {
    const { h, db } = semilla({
      app_archivos: [{ id: "51921230bb7e455f98e6", mime: "image/jpeg", data_b64: "/9j/AAAA" }],
      beta_tickets: [{ id: 1, clave: "TK-SO-1927", datos: { comprobantes: [{ url: "archivo:51921230bb7e455f98e6", por: "Alejandra", fecha: "2026-11-19T19:05:00Z", pago_id: null }], pago_migo: { factura: "001-001-000002979", total: 95, forma: "tarjeta" } } }],
    });
    const r = await h("tk_leer_voucher", { clave: "TK-SO-1927", url: "archivo:51921230bb7e455f98e6" });
    assert.equal(r.ok, true); assert.equal((r.ocr as Row).monto, 30);
    const cr = r.cruce as Row;
    assert.equal(cr.estado, "descuadre"); assert.equal(cr.descuadre_factura, true); assert.equal(cr.total_factura, 95);
    const c = (((await db.all("beta_tickets"))[0].datos as Row).comprobantes as Row[])[0];
    assert.equal((c.cruce as Row).estado, "descuadre");
    const det = await h("tk_get", { clave: "TK-SO-1927" });
    const doc = ((det.documentos || []) as Row[]).find((d) => d.tipo === "comprobante");
    assert.equal(((doc as Row).ocr as Row).monto, 30);
  });
});

describe("TK157 alertas del Dashboard", () => {
  it("voucher_alertas lista descuadres de tickets activos y omite cancelados", async () => {
    const comp = (c: string) => ({ comprobantes: [{ url: "archivo:a" + c, fecha: "2026-11-19T19:05:00Z", ocr: { estado: "ok", monto: 30 }, cruce: { estado: "descuadre", descuadre_ticket: true, objetivo_ticket: 15, mensaje: "Descuadre: voucher $30.00 vs ticket $15.00 (+$15.00)" } }] });
    const { h } = semilla({
      tickets: [
        { id: 1927, so_num: "TK-SO-1927", timestamp: "2026-11-19T19:00:00Z", nombre: "MF", estimado: 15, orig: {} },
        { id: 1938, so_num: "TK-SO-1938", timestamp: "2026-11-19T19:00:00Z", nombre: "MJ", estimado: 125, orig: { anulado: true } },
      ],
      beta_tickets: [{ id: 1, clave: "TK-SO-1927", datos: comp("1") }, { id: 2, clave: "TK-SO-1938", datos: comp("2") }],
    });
    const r = await h("voucher_alertas", {});
    const items = r.items as Row[];
    const des = items.find((x) => String(x.key).startsWith("voucher:"));
    assert.ok(des, "debe seguir listando el descuadre de voucher");
    assert.equal(des!.texto, "Descuadre voucher TK-SO-1927");
    assert.equal(des!.detalle, "Voucher $30.00 vs Ticket $15.00");
    assert.equal(des!.key, "voucher:TK-SO-1927:a1");
  });
  it("alertasDescuadre puro", () => {
    assert.equal(alertasDescuadre([{ clave: "X", datos: { comprobantes: [{ url: "archivo:z", cruce: { estado: "cuadra" } }] } }], new Set()).length, 0);
  });
  it("Dashboard: alertasDashboard incluye el descuadre y el × lo descarta (clave voucher:…)", () => {
    const html = file("index.html");
    const ini = html.indexOf("function alertasDashboard(");
    const fin = html.indexOf("function htmlDashTop(");
    const src = html.slice(ini, fin);
    const alertasDashboard = new Function(src + "; return alertasDashboard;")() as (a: unknown, n: unknown, o: string[], v: unknown) => Row[];
    const v = { items: [{ key: "voucher:TK-SO-1927:a1", clave: "TK-SO-1927", texto: "Descuadre voucher TK-SO-1927", detalle: "Voucher $30.00 vs Ticket $15.00" }] };
    const L = alertasDashboard(null, null, [], v);
    assert.equal(L.length, 1); assert.equal(L[0].texto, "⚠️ Descuadre voucher TK-SO-1927"); assert.equal(L[0].href, "#/m/tickets/t/TK-SO-1927");
    assert.equal(alertasDashboard(null, null, ["voucher:TK-SO-1927:a1"], v).length, 0);
    assert.match(html, /api\("voucher_alertas"/);
  });
  it("frontend: ficha de lectura, botón Leer voucher, autollenado y versión TK157", () => {
    const caja = file("mc-caja.js"), tk = file("mc-tickets.js"), html = file("index.html"), sw = file("sw.js");
    assert.match(caja, /🔍 Leer voucher/); assert.match(caja, /⚠️ Descuadre voucher: leído/); assert.match(caja, /✓ Leído: /); assert.match(caja, /Leído del voucher/);
    assert.match(tk, /MCOcr\.chip/);
    assert.match(html, /sunsu-2026-11-25-TK223/); assert.match(sw, /sunsu-2026-11-25-TK223/);
    assert.match(file("supabase/functions/api/sunsu_version.ts"), /TK157/);
  });
});
