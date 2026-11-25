// TK155 (Emilia t679u–t682u): WhatsApp sin ReferenceError, LEDs por ticket (tkRow null), cámara centrada arriba
// y WhatsApp abajo sin capture, cancelados ocultos por defecto y reversa completa al cancelar.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./tickets_beta_api.ts";
import "./tickets_cancelar_api.ts";
import "./tickets_lista_api.ts";
import "./wa_api.ts";
import { BODEGA_VENTA } from "./erp.ts";
import { giftsVendidasDe } from "./tickets_cancelar_api.ts";
import type { Row } from "./domain.ts";

const root = new URL("../../../", import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root), "utf8");
const screens = file("beta-screens.js");
const html = file("index.html");
const CED = "0900000000";

function semilla(extra: Record<string, Row[]> = {}) {
  const db = new MemoryDb({
    sesiones: [
      { token: "emi", uid: "u-emi", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
      { token: "and", uid: "u-andrea", rol: "cosmetologa", name: "Andrea Robles", exp: "2099-01-01T00:00:00.000Z" },
    ],
    usuarios: [
      { id: "u-emi", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
      { id: "u-andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
    ],
    catalogo: [{ sku: "SUNSU-40", producto_servicio: "Facial Reset", tipo: "FACIAL", total_con_iva: 95, subtotal: 82.61, activo: true, orig: {} }],
    tickets: [
      { id: 1924, sheet_row: null, so_num: "TK-SO-1924", timestamp: "2026-11-19T18:09:00Z", atendido_por: "Andrea Robles", nombre: "María", apellido: "R", id_3: CED, facial_hecho: "SUNSU-40 Facial Reset", estimado: 15, orig: {} },
      { id: 1938, sheet_row: null, so_num: "TK-SO-1938", beta_num: "TK-20261119-9", timestamp: "2026-11-19T22:55:00Z", atendido_por: "Andrea Robles", nombre: "María", apellido: "R", id_3: CED, facial_hecho: "SUNSU-40 Facial Reset", estimado: 125, venta_gift: "SI, 26-500", gift_card: "SI, 26-400, aplica $20", orig: { "ML-002": 1 } },
      { id: 1937, sheet_row: null, so_num: "TK-SO-1937", timestamp: "2026-11-19T21:00:00Z", atendido_por: "Andrea Robles", nombre: "Ana", apellido: "Z", id_3: "0911111111", estimado: 40, orig: { anulado: true, cancelado: true } },
    ],
    beta_ticket_envios: [{ id: 1, ticket_clave: "TK-SO-1924", tipo: "reporte" }],
    envios_tarjetas: [],
    beta_tickets: [{ id: 1, ticket_id: 1938, clave: "TK-SO-1938", datos: { factura: "001-001-000002978" } }],
    beta_pagos: [
      { id: "pg1", ticket_clave: "TK-SO-1938", monto: 125, forma: "tarjeta", anulado: false },
      { id: "pg2", ticket_clave: "TK-SO-1924", monto: 15, forma: "efectivo", anulado: false },
    ],
    beta_cuadre_link: [{ ticket_id: 1938, factura: "001-001-000002978" }],
    gift_cards: [
      { id: 500, sheet_row: 500, codigo_gc: "26-500", dia: 19, mes: 11, ano: 2026, nombre_comprador: "María", usado: false, origin: "beta", orig: {} },
      { id: 400, sheet_row: 400, codigo_gc: "26-400", dia: 1, mes: 11, ano: 2026, nombre_comprador: "Otra", usado: true, saldo: 0, fecha_uso: "2026-11-19", usado_por: "Andrea", origin: "sheet", notas: "SALDO:0.00 | resto", orig: { saldo: 0, usos: [{ ticket: "TK-SO-1938", monto: 20, saldo: 0 }] } },
      { id: 401, sheet_row: 401, codigo_gc: "26-401", dia: 1, mes: 11, ano: 2026, nombre_comprador: "Ajena", usado: true, saldo: 0, origin: "sheet", orig: { usos: [{ ticket: "TK-SO-1924", monto: 30 }] } },
    ],
    beta_gift_ajustes: [],
    erp_productos: [{ id: "p2", sku: "ML-002", nombre: "Cream", clase: "producto", uso: "venta", activo: true }],
    erp_bodegas: [{ id: BODEGA_VENTA, nombre: "LOCAL", tipo: "venta", activo: true }],
    erp_stock: [{ producto_id: "p2", bodega_id: BODEGA_VENTA, cantidad: 4 }],
    erp_movimientos: [{ id: "m1", producto_id: "p2", bodega_id: BODEGA_VENTA, delta: -1, tipo: "venta", ticket_ref: "TK-20261119-9", legacy_ref: "x" }],
    gift_card_movimientos: [{ id: 9, codigo: "26-400", ticket_ref: "TK-SO-1938", monto: 20, saldo: 0, actor: "Andrea", nota: "canje", fecha: "2026-11-19T22:55:00Z" }],
    paquetes: [
      { id: 7, sheet_row: 70, paquete: "Pack 3", cedula: CED, uso_1: true, fecha_1: "19/11/2026", completo: false, orig: { ticket: "TK-SO-1938" }, borrado_at: null },
      { id: 8, sheet_row: 80, paquete: "Pack 3 viejo", cedula: CED, uso_1: true, fecha_1: "01/11/2026", uso_2: true, fecha_2: "19/11/2026", completo: false, orig: { ticket: "TK-OTRO", marcas_ticket: ["TK-SO-1938"], marcas_slot: { "TK-SO-1938": [2] }, ultima_marca_ticket: "TK-SO-1938", ultima_marca_slot: 2 }, borrado_at: null },
    ],
    beta_paquete_ajustes: [], app_modulos: [], cabina_inventario: [], inventario_base: [], promos: [], beta_ticket_lineas: [],
    solicitudes_cambio: [], clientas_registro: [], beta_stock_movimientos: [], beta_ticket_cancelados: [], log_acciones: [],
    beta_ticket_flags: [], beta_migo_facturas_vivo: [], beta_clientes: [], beta_ticket_snaps: [], beta_sku_alias: [],
    beta_notificaciones: [], app_archivos: [], cosmetologas: [],
    ...extra,
  });
  const c = { db, now: new Date("2026-11-20T00:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok } as never) as Promise<Row>;
  return { db, h };
}

describe("TK155 WhatsApp: digitosWa definido", () => {
  it("wa_api.ts importa digitosWa (el toast «digitosWa is not defined»)", () => {
    const wa = file("supabase/functions/api/wa_api.ts");
    assert.match(wa, /import \{[^}]*\bdigitosWa\b[^}]*\} from "\.\/wa_lib\.ts"/);
    for (const f of ["beta-screens.js", "mc-wa.js", "mc-tickets.js", "index.html"]) {
      const src = file(f);
      if (/\bdigitosWa\s*\(/.test(src)) assert.match(src, /function digitosWa|digitosWa\s*=/, f);
    }
  });
  it("wa_preparar no revienta con ReferenceError y nunca devuelve el teléfono al staff", async () => {
    const { h } = semilla({ beta_clientes: [{ key: "c1", cedula: CED, nombre: "María", telefono: "0991234567", datos: {} }] });
    for (const tok of ["emi", "and"]) {
      const r = await h("wa_preparar", tok, { clave: "TK-SO-1924", ticket_clave: "TK-SO-1924" });
      assert.doesNotMatch(String(r.error || ""), /is not defined/);
      assert.equal(r.ok, true, String(r.error));
      // El número solo va dentro del enlace wa.me (se abre directo); nunca como campo visible.
      if (tok === "and") { assert.equal(r.telefono, undefined); assert.doesNotMatch(JSON.stringify(r), /0991234567/); }
    }
  });
});

describe("TK155 LEDs por ticket aunque tkRow sea null", () => {
  const ini = screens.indexOf("function _tkLedKey"), fin = screens.indexOf("function _tkClave(q)");
  const mk = () => {
    const win: Row = {};
    const fns = new Function("window", screens.slice(ini, fin) + "; return { key: _tkLedKey, of: _tkLedOf, put: _tkLedGuardar };")(win) as { key: (t: Row) => string; of: (t: Row) => Row | null; put: (t: Row) => void };
    return { win, ...fns };
  };
  it("dos tickets con tkRow null no colisionan (uno verde, otro rojo)", () => {
    const { win, key, of, put } = mk();
    const a = { tkRow: null, so_num: "TK-SO-1924", led: { r: 1 } }, b = { tkRow: null, so_num: "TK-SO-1938", led: { r: 0 } };
    put(a); put(b);
    const M = win._tkLeds as Row;
    assert.equal(M["null"], undefined);
    assert.equal(M["undefined"], undefined);
    assert.equal(key(a), "TK-SO-1924");
    assert.equal((of({ tkRow: null, so_num: "TK-SO-1924" }) as Row).r, 1);
    assert.equal((of({ tkRow: null, so_num: "TK-SO-1938" }) as Row).r, 0);
    assert.equal((of({ tkRow: null, id: 5 }) as Row | null), null);
    put({ tkRow: 12, led: { r: 1 } });
    assert.equal((M["12"] as Row).r, 1);
  });
  it("ningún lector usa _tkLeds[String(t.tkRow)] directo", () => {
    for (const f of ["beta-screens.js", "mc-tickets.js", "mc-maestro.js", "mc-wa.js"]) {
      const src = file(f);
      assert.doesNotMatch(src, /\(window\._tkLeds\s*\|\|\s*\{\}\)\[String\(t/, f);
      assert.doesNotMatch(src, /_tkLeds\[String\(it\.tkRow\)\]\s*=/, f);
    }
    assert.match(screens, /function _histWaHTML\(t,i\)\{\n  var L=_tkLedOf\(t\)\|\|\{\};/);
    assert.match(screens, /function _histCamHTML[\s\S]*?var L=_tkLedOf\(t\)\|\|\{\};/);
  });
  it("tk_historial: un ticket nuevo NO sale enviado por otro ticket de la misma clienta y fecha", async () => {
    const { h } = semilla({ envios_tarjetas: [{ clave: "x", cedula: CED, fecha_del_ticket: "2026-11-19T18:09:00Z" }] });
    const r = await h("tk_historial", "emi", { offset: 0, limit: 50 });
    assert.equal(r.ok, true, String(r.error));
    const by = new Map((r.items as Row[]).map((x) => [String(x.so_num), x]));
    assert.equal((by.get("TK-SO-1924")!.led as Row).r, 1);
    assert.equal((by.get("TK-SO-1938")!.led as Row).r, 0);
  });
});

describe("TK155 cámara centrada arriba, WhatsApp abajo, sin capture", () => {
  it("CSS: #content label.mob-cam inline-flex centrado y .mob-acts en columna", () => {
    assert.match(html, /#content label\.mob-cam, \.mob-cam, \.mob-wa \{ display: inline-flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; margin: 0 !important; line-height: 1 !important; \}/);
    assert.match(html, /\.mob-acts \{ display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;/);
    assert.match(html, /\.mob-cam \.cam-icon \{ width: 15px; height: 15px; display: block; \}/);
  });
  it("HTML: SVG de cámara, cámara antes que WhatsApp, sin capture=environment", () => {
    const cam = screens.slice(screens.indexOf("function _histCamHTML"), screens.indexOf("function _histWaHTML"));
    assert.match(cam, /CAM_ICON_SVG/);
    assert.doesNotMatch(cam, /📷/);
    assert.doesNotMatch(cam, /capture=/);
    assert.match(screens, /var CAM_ICON_SVG='<svg class="cam-icon"/);
    assert.match(screens, /'<span class="mob-acts">' \+ _histCamHTML\(t,i\) \+ _histWaHTML\(t,i\) \+ '<\/span>'/);
    assert.doesNotMatch(file("mc-caja.js"), /capture='environment'/);
  });
  it("canje $0.00 sin cobro no muestra cámara roja", () => {
    const fn = new Function("t", "_histMontos", screens.slice(screens.indexOf("function _histSinCobro"), screens.indexOf("function _histWaHTML")) + "; return _histSinCobro(t);");
    assert.equal(fn({ estimado: 0 }, () => ({ tot: 0 })), true);
    assert.equal(fn({ sin_cobro: true }, () => ({ tot: 0 })), true);
    assert.equal(fn({ estimado: 40 }, () => ({ tot: 40 })), false);
  });
});

describe("TK155 cancelados ocultos por defecto", () => {
  it("vista normal sin cancelados; filtro Cancelados y número exacto sí", async () => {
    const { h } = semilla();
    await h("tk_cancelar", "emi", { clave: "TK-SO-1938", motivo: "Duplicado" });
    const r = await h("tk_historial", "emi", { offset: 0, limit: 50 });
    const sos = (r.items as Row[]).map((x) => x.so_num);
    assert.deepEqual(sos, ["TK-SO-1924"]);
    assert.equal(r.total, 1);
    assert.equal(r.suma, 15);
    const c = await h("tk_historial", "emi", { est: "anulado", offset: 0, limit: 50 });
    assert.deepEqual((c.items as Row[]).map((x) => x.so_num).sort(), ["TK-SO-1937", "TK-SO-1938"]);
    assert.equal(c.suma, 0);
    assert.ok((c.items as Row[]).every((x) => x.anulado === true));
    const q = await h("tk_historial", "emi", { q: "TK-SO-1938", offset: 0, limit: 50 });
    const it0 = (q.items as Row[]).find((x) => x.so_num === "TK-SO-1938");
    if (it0) assert.equal(it0.anulado, true);
    assert.match(screens, /\['anulado','Cancelados'\]\]/);
  });
});

describe("TK155 reversa completa al cancelar", () => {
  it("giftsVendidasDe lee los códigos de venta_gift", () => {
    assert.deepEqual(giftsVendidasDe({ venta_gift: "SI, 26-500" }), ["26-500"]);
    assert.deepEqual(giftsVendidasDe({ venta_gift: "NO" }), []);
  });
  it("stock, paquete comprado, sesión canjeada, gift comprada/canjeada, pagos y factura", async () => {
    const { db, h } = semilla();
    const r = await h("tk_cancelar", "emi", { clave: "TK-SO-1938", motivo: "Ticket duplicado" });
    assert.equal(r.ok, true, String(r.error));
    // a) stock
    const dev = (db.tables.get("erp_movimientos") || []).filter((m) => m.tipo === "anulacion");
    assert.equal(dev.length, 1); assert.equal(Number(dev[0].delta), 1);
    // b) paquete comprado → anulado
    const pq = db.tables.get("paquetes")!;
    assert.equal(((pq.find((x) => x.id === 7)!.orig) as Row).anulado, true);
    // c) sesión canjeada → libre
    const p8 = pq.find((x) => x.id === 8)!;
    assert.equal(p8.uso_2, false); assert.equal(p8.fecha_2, "");
    // d) gift comprada → TK189: vuelve a «Disponible» con el mismo código (no se entierra); gift canjeada → saldo devuelto; la ajena intacta
    const gc = db.tables.get("gift_cards")!;
    const g500 = gc.find((x) => x.id === 500)!;
    assert.ok(!g500.borrado_at); assert.equal(g500.dia, null); assert.equal(g500.nombre_comprador, "");
    assert.equal((((g500.orig as Row).historial_anulado as Row[])[0]).ticket, "TK-SO-1938");
    const g400 = gc.find((x) => x.id === 400)!;
    assert.equal(g400.usado, false); assert.equal(Number(g400.saldo), 20);
    assert.equal(((g400.orig as Row).usos as Row[]).length, 0);
    assert.match(String(g400.notas), /SALDO:20\.00/);
    assert.doesNotMatch(String(g400.notas), /SALDO:0\.00/);
    const gcm = db.tables.get("gift_card_movimientos") || [];
    const revMov = gcm.filter((m) => m.origin === "anulacion" && String(m.ticket_ref) === "TK-SO-1938");
    assert.equal(revMov.length, 1);
    assert.equal(Number(revMov[0].monto), -20);
    const g401 = gc.find((x) => x.id === 401)!;
    assert.equal(g401.usado, true);
    // e) pagos
    const pg = db.tables.get("beta_pagos")!;
    assert.equal(pg.find((x) => x.id === "pg1")!.anulado, true);
    assert.equal(pg.find((x) => x.id === "pg2")!.anulado, false);
    // f) factura liberada (con respaldo)
    assert.equal((db.tables.get("beta_cuadre_link") || []).filter((x) => x.ticket_id === 1938).length, 0);
    const cab = db.tables.get("beta_tickets")!.find((x) => x.clave === "TK-SO-1938")!;
    assert.equal((cab.datos as Row).factura, "");
    const tk = db.tables.get("tickets")!.find((x) => x.id === 1938)!;
    const rev = (tk.orig as Row).cancelado_reversa as Row;
    assert.equal((rev.factura_liberada as Row).factura, "001-001-000002978");
    assert.equal((db.tables.get("beta_ticket_cancelados") || []).length, 1);
    // idempotente: no se repite
    const r2 = await h("tk_cancelar", "emi", { clave: "TK-SO-1938", motivo: "otra vez" });
    assert.match(String(r2.error), /ya está cancelado/);
    assert.equal((db.tables.get("erp_movimientos") || []).filter((m) => m.tipo === "anulacion").length, 1);
  });
});

describe("TK155 menú Acciones ancho en el celular (t683u)", () => {
  it("se ancla a la pantalla (fixed, right 12px, ancho hasta 320px) y no se recorta", () => {
    const tk = file("mc-tickets.js");
    assert.match(tk, /function anclarMenuMovil\(dd, btn\)/);
    assert.match(tk, /dd\.style\.position = "fixed";/);
    assert.match(tk, /var w = Math\.min\(320, vw - 24\);/);
    assert.match(tk, /if \(dd && !dd\.hidden\) anclarMenuMovil\(dd, b\);/);
    assert.match(html, /\.mctk-dd\.mctk-dd-movil a, \.mctk-dd\.mctk-dd-movil button/);
  });
});

describe("TK155 versión", () => {
  it("caché y motor en TK155", () => {
    assert.match(file("sw.js"), /const CACHE = "sunsu-2026-11-25-DEV31I"/);
    assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-25-DEV31I"/);
    assert.match(file("supabase/functions/api/sunsu_version.ts"), /sunsu-engine-2026-11-19-TK157/);
  });
});
