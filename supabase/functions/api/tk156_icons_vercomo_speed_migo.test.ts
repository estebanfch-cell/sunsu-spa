// TK156 (Emilia t685u–t688u): íconos 100% rojo/verde, «Ver como…» accesible, Tickets instantáneo (caché) y
// forma de pago de la factura Migo dentro de Pagos (sin «saldo $175» falso).
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
import type { Row } from "./domain.ts";

const root = new URL("../../../", import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root), "utf8");
const html = file("index.html"), screens = file("beta-screens.js"), caja = file("mc-caja.js");

function semilla(datos: Row, extra: Record<string, Row[]> = {}) {
  const db = new MemoryDb({
    sesiones: [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }],
    usuarios: [{ id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false }],
    catalogo: [{ sku: "SUNSU-ML-001", producto_servicio: "Ampoule", tipo: "PRODUCTO", total_con_iva: 110, subtotal: 95.65, activo: true }],
    tickets: [{ id: 1939, sheet_row: null, so_num: "TK-SO-1939", timestamp: "2026-11-19T19:40:32Z", nombre: "Paulina", apellido: "S", estimado: 174.998, cob: null, fac: null, fac_7: null, comp: null, orig: {} }],
    beta_tickets: [{ id: 1, clave: "TK-SO-1939", datos }],
    beta_pagos: [], beta_caja_movimientos: [], beta_migo_facturas: [],
    beta_migo_facturas_vivo: [{ factura: "001-001-000002976", total: 175, forma: datos.pago_migo?.forma || "", formas_pago: datos.pago_migo?.forma ? [{ forma: datos.pago_migo.forma, valor: 175 }] : [] }],
    beta_cuadre_link: [{ ticket_id: 1939, factura: "001-001-000002976", estado: "cuadra", total_factura: 175 }],
    erp_productos: [], erp_bodegas: [], erp_stock: [], erp_movimientos: [], app_modulos: [], cabina_inventario: [], inventario_base: [], promos: [],
    beta_ticket_lineas: [], solicitudes_cambio: [], clientas_registro: [], beta_stock_movimientos: [], log_acciones: [], app_archivos: [],
    ...extra,
  });
  const h = (a: string, p: Row = {}) => handle(a, { token: "adm", ...p }, { db, now: new Date("2026-11-20T00:50:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" } as never) as Promise<Row>;
  return { db, h };
}

describe("TK156 Pagos con factura Migo ligada (TK-SO-1939 / fac. 2976)", () => {
  it("con forma de pago en Migo: saldo $0 y fila «Factura Migo 2976 · tarjeta»", async () => {
    const { h, db } = semilla({ factura: "001-001-000002976", forma_pago: "tarjeta", pago_migo: { fecha: "2026-11-19", forma: "tarjeta", total: 175, fuente: "migo", factura: "001-001-000002976" } });
    const e = await h("pg_ticket", { clave: "TK-SO-1939", total: 175 });
    assert.equal(e.ok, true, String(e.error));
    assert.equal(e.saldo, 0);
    assert.equal(e.factura_migo, "001-001-000002976");
    assert.equal(e.migo_sin_forma, false);
    assert.equal(e.forma_migo, "tarjeta");
    const L = e.pagosLegado as Row[];
    assert.equal(L.length, 1);
    assert.equal(L[0].metodo, "tarjeta");
    assert.equal(L[0].monto, 175);
    assert.equal(L[0].registrado_por, "Factura Migo 2976");
    const reg = await h("pg_registrar", { clave: "TK-SO-1939", total: 175, metodo: "efectivo", monto: 175 });
    assert.match(String(reg.error), /ya está pagado/);
    assert.equal(db.tables.get("beta_pagos")!.length, 0);
  });
  it("sin forma de pago en Migo: saldo $0 pero alerta migo_sin_forma", async () => {
    const { h } = semilla({ factura: "001-001-000002976", pago_migo: { fecha: "2026-11-19", forma: "", total: 175, fuente: "migo", factura: "001-001-000002976" } });
    const e = await h("pg_ticket", { clave: "TK-SO-1939", total: 175 });
    assert.equal(e.saldo, 0);
    assert.equal(e.migo_sin_forma, true);
    assert.match(caja, /⚠️ Factura Migo ' \+ e\(facM\) \+ " sin forma de pago — falta registrarla en Migo o aquí/);
    assert.match(caja, /✅ Pagado vía factura Migo/);
  });
  it("lista: aviso para recepción cuando la factura Migo vino sin forma", async () => {
    const { h } = semilla({ factura: "001-001-000002976", pago_migo: { forma: "", total: 175, factura: "001-001-000002976" } });
    const r = await h("tk_historial", { offset: 0, limit: 50 });
    assert.equal(r.ok, true, String(r.error));
    const led = (r.items as Row[])[0].led as Row;
    assert.equal(led.migoSinForma, 1);
    assert.ok((led.falta as string[]).some((x) => /factura Migo sin forma/.test(x)));
  });
});

describe("TK156 íconos 100% rojos o 100% verdes", () => {
  it("borde y dibujo heredan el color; sin verde fijo en WhatsApp", () => {
    assert.match(html, /\.mob-cam, \.mob-wa, #content label\.mob-cam, #content \.mob-wa \{ color: #DC2626 !important; border-color: #DC2626 !important; \}/);
    assert.match(html, /\.mob-cam\.ok, \.mob-wa\.ok, #content label\.mob-cam\.ok, #content \.mob-wa\.ok \{ color: #16A34A !important; border-color: #16A34A !important; \}/);
    assert.match(html, /\.mob-cam svg, \.mob-cam svg \*, \.mob-wa svg, \.mob-wa svg \* \{ fill: currentColor !important;/);
    assert.doesNotMatch(html, /\.mob-wa \{ color: #25D366; \}/);
  });
});

describe("TK156 «Ver como…»", () => {
  it("el pill del admin es #btn-ver-como y hay entrada en el menú", () => {
    assert.match(html, /<button type="button" id="btn-ver-como" class="top-user top-user-btn" title="Ver como…" aria-label="Ver como…">/);
    assert.match(html, /function puedeVerComo\(\) \{\n  if \(state\.vista\) return false;/);
    assert.match(html, /data-ver-como="1" title="Ver como…">👁 Ver como…<\/button>/);
    assert.match(html, /document\.querySelectorAll\("\[data-ver-como\]"\)\.forEach/);
  });
});

describe("TK156 Tickets instantáneo (stale-while-revalidate)", () => {
  const ini = screens.indexOf("var _TK_CACHE_MEM={};"), fin = screens.indexOf("window._tkCacheLimpiar=_tkCacheLimpiar;");
  const mk = () => {
    const store = new Map<string, string>();
    const ss = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); }, key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } };
    const win: Row = {};
    const f = new Function("window", "sessionStorage", "localStorage", "CU", "_tkClave", "_tkF", "_tkLedGuardar", "api",
      "var _histData=[];" + screens.slice(ini, fin) + "; return { guardar: _tkCacheGuardar, aplicar: _tkCacheAplicar, limpiar: _tkCacheLimpiar, firma: _tkFirma };")(
      win, ss, { getItem: () => "" }, { id: "emi", name: "Emilia" }, (q: Row) => "|" + (q.q || ""), () => ({}), () => {}, () => Promise.resolve({ ok: true })) as Row;
    return { win, store, ...f } as Row;
  };
  it("guarda sin teléfonos ni cédulas y pinta desde la caché", () => {
    const c = mk();
    (c.guardar as (q: Row, r: Row) => void)({ q: "" }, { ok: true, items: [{ so_num: "TK-SO-1", telefono: "0991234567", cedula: "1700000000", estimado: 10 }], total: 1, suma: 10 });
    const txt = [...(c.store as Map<string, string>).values()].join("");
    assert.doesNotMatch(txt, /0991234567|1700000000/);
    assert.ok((c.aplicar as (q: Row) => string)({ q: "" }));
    assert.equal(((c.win as Row)._histData as Row[]).length, 1);
    (c.limpiar as () => void)();
    assert.equal((c.store as Map<string, string>).size, 0);
    assert.equal((c.aplicar as (q: Row) => string)({ q: "" }), "");
  });
  it("renderHistorial pinta la caché sin «Cargando historial…» y refresca en segundo plano", () => {
    const r = screens.slice(screens.indexOf("function renderHistorial(c){"), screens.indexOf("var _TK_CACHE_MEM={};"));
    assert.ok(r.indexOf("var firma0=_tkCacheAplicar(q0);") < r.indexOf("Cargando historial..."));
    assert.match(r, /if\(_tkFirma\(window\._histData\)===firma0\) return;/);
    assert.match(screens, /if\(!mas&&!off\) _tkCacheGuardar\(q,r\);/);
    assert.match(html, /window\._tkPrecalentar\(\); \} catch \(eP\) \{\} \}, 300\);/);
    assert.match(html, /function paintLogin\(msg\) \{\n  try \{ if \(window\._tkCacheLimpiar\) window\._tkCacheLimpiar\(\); \}/);
    assert.match(file("mc-maestro.js"), /window\._tkCacheAplicar\(window\._tkQ/);
  });
});

describe("TK156 versión", () => {
  it("caché y motor en TK156", () => {
    assert.match(file("sw.js"), /const CACHE = "sunsu-2026-11-19-TK156"/);
    assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-19-TK156"/);
    assert.match(file("supabase/functions/api/sunsu_version.ts"), /sunsu-engine-2026-11-19-TK156/);
  });
});
