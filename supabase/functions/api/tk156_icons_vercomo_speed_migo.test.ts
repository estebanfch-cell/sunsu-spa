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

describe("TK156 Pagos instantáneo sin flash falso de saldo (t691u)", () => {
  it("tk_historial trae pagos_resumen con saldo 0 para el ticket cobrado por factura Migo", async () => {
    const { h } = semilla({ factura: "001-001-000002976", forma_pago: "tarjeta", pago_migo: { forma: "tarjeta", total: 175, factura: "001-001-000002976" } });
    const r = await h("tk_historial", { offset: 0, limit: 50 });
    const pr = (r.items as Row[])[0].pagos_resumen as Row;
    assert.equal(pr.saldo, 0);
    assert.equal(pr.forma, "tarjeta");
    assert.equal(pr.factura_migo, "001-001-000002976");
    assert.equal(pr.migo_sin_forma, false);
  });
  it("mc-caja: pinta al instante lo pagado; nunca un saldo pendiente de caché; descarta respuestas viejas", () => {
    const ini = caja.indexOf("  var PG_MEM = {};"), fin = caja.indexOf("  var MCPagos = {");
    const store = new Map<string, string>();
    const ss = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); }, key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } };
    const win: Row = { _histData: [{ so_num: "TK-SO-1939", fecha: "2026-11-19", pagos_resumen: { saldo: 0, legado: 175, forma: "tarjeta", factura_migo: "001-001-000002976", pagos: [] } }, { so_num: "TK-SO-2", pagos_resumen: { saldo: 40 } }] };
    const f = new Function("window", "sessionStorage", caja.slice(ini, fin) + "; return { prev: pagosPrevios, guardar: guardarPagos, limpiar: limpiarPagosCache };")(win, ss) as Row;
    const prev = f.prev as (c: string) => Row | null;
    const p1 = prev("TK-SO-1939")!;
    assert.equal(p1.saldo, 0);
    assert.equal((p1.pagosLegado as Row[])[0].registrado_por, "Factura Migo 2976");
    assert.equal(prev("TK-SO-2"), null, "saldo pendiente: no se adivina, espera al servidor");
    (f.guardar as (c: string, r: Row) => void)("TK-SO-3", { ok: true, saldo: 25 });
    assert.equal(prev("TK-SO-3"), null);
    (f.guardar as (c: string, r: Row) => void)("TK-SO-4", { ok: true, saldo: 0 });
    assert.equal(prev("TK-SO-4")!.saldo, 0);
    (f.limpiar as () => void)();
    assert.equal(store.size, 0);
    assert.match(caja, /var seq = host\._pgSeq = \(host\._pgSeq \|\| 0\) \+ 1;/);
    assert.match(caja, /if \(seq !== host\._pgSeq\) return;/);
    assert.match(caja, /if \(pre\) pintarPagos\(pre\); else host\.innerHTML = '<div class="mccf-card mccj-card mccj-pay mccj-pay-cargando"><div class="mccj-pay-h"><span>💵 Pagos<\/span><\/div><\/div>';/);
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
assert.match(file("sw.js"), /const CACHE = "sunsu-2026-11-26-CONSUI"/);
    assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-26-CONSUI"/);
    assert.match(file("supabase/functions/api/sunsu_version.ts"), /sunsu-engine-2026-11-19-TK157/);
  });
});

describe("TK156 buscador de Tickets instantáneo letra por letra (t694u)", () => {
  it("filtra en 0 ms sin red, sin tildes, repinta solo #hist-res y no toca el input", () => {
    const ini = screens.indexOf("function _tkNorm("), fin = screens.indexOf("function _histBuscarClear(");
    assert.ok(ini > 0 && fin > ini);
    const input = { value: "", focused: true };
    const res = { innerHTML: "" };
    const doc = { getElementById: (id: string) => (id === "hist-buscar" ? input : id === "hist-res" ? res : null) };
    const llamadas: string[] = [];
    const timers: Array<() => void> = [];
    const win: Row = {
      _tkServer: false, _histFiltroActual: {},
      _histData: [
        { so_num: "TK-SO-1939", nombre: "Paulina", apellido: "Sánchez", cosmetologa: "Andrea", lineas: [{ nombre: "Facial Hidra Glow" }] },
        { so_num: "TK-SO-1940", nombre: "Bárbara", apellido: "Ruiz", cosmetologa: "Belén", lineas: [{ nombre: "Ampoule" }] },
        { so_num: "TK-SO-1941", nombre: "Carla", apellido: "Bravo", cosmetologa: "Andrea", lineas: [] },
      ],
    };
    const f = new Function("window", "document", "api", "setTimeout", "clearTimeout", "_histEstadoDoc", "_histFactura", "_histResAdminHTML", "_histResStaffHTML", "_histTrasPintar", "_histBuscarGo", "_tkPedir", "_tkClave",
      "var _histData=window._histData;" + screens.slice(ini, fin) + "; return { live: _histBuscarLive };")(
      win, doc, (a: string) => { llamadas.push(a); return Promise.resolve({ ok: true }); },
      (fn: () => void) => { timers.push(fn); return timers.length; }, () => {},
      () => "", () => "",
      (L: Row[]) => "N=" + L.length + ":" + L.map((t) => t.so_num).join(","), (L: Row[]) => "S=" + L.length, () => {}, () => { throw new Error("no debe re-render completo"); },
      () => { llamadas.push("tk_historial"); return Promise.resolve(true); }, (q: Row) => JSON.stringify(q)) as Row;
    const live = f.live as (s: boolean) => void;
    input.value = "b"; live(false);
    assert.equal(res.innerHTML, "N=2:TK-SO-1940,TK-SO-1941", "«b» → Bárbara (sin tilde) y Bravo al instante");
    input.value = "ba"; live(false);
    assert.equal(res.innerHTML, "N=1:TK-SO-1940");
    input.value = "hidra"; live(false);
    assert.equal(res.innerHTML, "N=1:TK-SO-1939", "busca en líneas/faciales");
    input.value = "andrea"; live(false);
    assert.equal(res.innerHTML, "N=2:TK-SO-1939,TK-SO-1941", "busca por cosmetóloga");
    input.value = ""; live(false);
    assert.equal(res.innerHTML, "N=3:TK-SO-1939,TK-SO-1940,TK-SO-1941", "al borrar vuelve a la lista completa en 0 ms");
    assert.deepEqual(llamadas, [], "ninguna llamada de red al teclear");
    assert.equal(input.focused, true); assert.equal(doc.getElementById("hist-buscar"), input, "el input es el mismo (no se recrea)");
  });
  it("con ≥2 letras pide en segundo plano con debounce y secuencia, sin spinner", () => {
    const fn = screens.slice(screens.indexOf("function _histBuscarLive("), screens.indexOf("function _histBuscarClear("));
    assert.match(fn, /setTimeout\(function\(\)\{ if\(\(window\._histBusqueda\|\|''\)\.trim\(\)===q\) _histBuscarFondo\(esStaff,q\); \},300\)/);
    assert.doesNotMatch(fn, /Buscando…|Cargando/);
    assert.match(screens, /window\._tkSeq=\(window\._tkSeq\|\|0\)\+1; \/\* respuestas de búsquedas viejas/);
  });
});

describe("TK156 Dashboard: «Ver como…» y Alertas con × (t693u)", () => {
  const ini = html.indexOf("/* ══════ TK156: Alertas del Dashboard"), fin = html.indexOf("async function renderInicioBeta");
  function montar() {
    const store: Record<string, string> = {};
    const ls = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    const leidas: Row[] = [];
    const filas: Record<string, { removed: boolean }> = {};
    const nEl = { textContent: "" }, box = { hidden: false };
    const doc = {
      addEventListener: () => {},
      querySelector: (sel: string) => { const k = sel.match(/data-al-key="(.+)"/)![1]; filas[k] = filas[k] || { removed: false }; return { remove: () => { filas[k].removed = true; } }; },
      getElementById: (id: string) => id === "dash-al-n" ? nEl : id === "dash-al" ? box : id === "dash-al-dd" ? { querySelectorAll: () => ({ length: Object.values(filas).filter((x) => !x.removed).length }) } : null,
    };
    const f = new Function("window", "document", "localStorage", "state", "esc", "api", "CSS", "pintarBadgeNotif",
      html.slice(ini, fin) + "; return { lista: alertasDashboard, top: htmlDashTop, ocultas: alertasOcultas, x: descartarAlerta };")(
      {}, doc, ls, { user: { id: "u1" } }, (s: unknown) => String(s ?? ""), (a: string, p: Row) => { leidas.push({ a, ...p }); return Promise.resolve({ ok: true }); }, { escape: (s: string) => s }, () => {}) as Row;
    return { f, store, leidas, filas, nEl, box };
  }
  const APR = { ok: true, grupos: [{ id: "edicion", titulo: "Ediciones", items: [{ tipo: "edicion", id: "41", titulo: "Andrea pide editar TK-SO-1941", href: "#/s/ticket/TK-SO-1941" }] }] };
  const NOT = { ok: true, items: [{ id: 901, titulo: "Factura Migo sin forma de pago", leida: false }, { id: 902, titulo: "vieja", leida: true }] };
  it("une solicitudes y avisos sin leer; el HTML trae «👁 Ver como…», contador y botones ×", () => {
    const { f } = montar();
    const L = (f.lista as (a: Row, b: Row, c: string[]) => Row[])(APR, NOT, []);
    assert.deepEqual(L.map((x) => x.key), ["apr:edicion:41", "notif:901"]);
    const h = (f.top as (l: Row[]) => string)(L);
    assert.match(h, /id="dash-ver-como" data-ver-como="1">👁 Ver como…/);
    assert.match(h, /⚠️ Alertas \(<span id="dash-al-n"[^>]*>2<\/span>\) ▾/);
    assert.equal((h.match(/class="dash-al-x"/g) || []).length, 2);
    assert.match((f.top as (l: Row[]) => string)([]), /<div class="dash-al" hidden/);
  });
  it("tocar × quita la alerta al instante, marca leída la notificación y persiste en localStorage", () => {
    const m = montar();
    m.filas["apr:edicion:41"] = { removed: false }; m.filas["notif:901"] = { removed: false };
    (m.f.x as (k: string, n?: unknown) => void)("notif:901", "901");
    assert.equal(m.filas["notif:901"].removed, true);
    assert.equal(m.nEl.textContent, "1"); assert.equal(m.box.hidden, false);
    assert.deepEqual(m.leidas, [{ a: "notif_leer", id: "901" }]);
    assert.deepEqual(JSON.parse(m.store["sunsu.alertas.ocultas.u1"]), ["notif:901"]);
    const tras = (m.f.lista as (a: Row, b: Row, c: string[]) => Row[])(APR, NOT, (m.f.ocultas as () => string[])());
    assert.deepEqual(tras.map((x) => x.key), ["apr:edicion:41"], "sigue oculta al recargar");
    (m.f.x as (k: string) => void)("apr:edicion:41");
    assert.equal(m.nEl.textContent, "0"); assert.equal(m.box.hidden, true, "sin alertas, la barra se oculta");
  });
  it("el Dashboard admin antepone la barra y cablea Ver como…", () => {
    assert.match(html, /pulso = htmlDashTop\(alertasDashboard\(apr, notif, alertasOcultas\(\)(, vch)?\)\) \+ pulso;/);
    assert.match(html, /closest\("#dash-ver-como"\);\s*if \(vc && typeof abrirVerComo === "function"\)/);
  });
});

describe("TK156 Fotos, voucher y documentos en el ticket (t692u)", () => {
  const tk = file("mc-tickets.js");
  it("sección 📎 con miniaturas desde caché, voucher y PDFs con vista previa en la app", () => {
    assert.match(tk, /<div id="mctk-pagos"><\/div>' \+ previasHtml\(\)/);
    assert.match(tk, /📎 Fotos, voucher y documentos/);
    assert.match(tk, /window\._fotoThumbGet\(id\)/);
    assert.match(tk, /on\(main, "#mctk-prev", "onclick", onDocs\)/);
    for (const d of ['data-doc="tarjeta"', 'data-doc="paquete"', 'data-doc="gc"']) assert.ok(tk.includes(d));
  });
});

describe("TK156 Pagado sin doble conteo (TK-SO-1927, t695u)", () => {
  const tk = file("mc-tickets.js");
  const ini = tk.indexOf("  function pagadoTk("), fin = tk.indexOf("  function cargarEstado(");
  const f = new Function("var r2=function(n){return Math.round((Number(n)||0)*100)/100;};var idFoto=function(u){u=String(u||'');var m=u.match(/[-\\w]{25,}/);return m?m[0]:'';};" + tk.slice(ini, fin) + "; return { pagado: pagadoTk, unicos: docsUnicos };")() as Row;
  const pagado = f.pagado as (a: boolean, b: number, c: number) => number;
  it("ticket $15 con 1 pago de $15 en beta_pagos y cobrado=true → Pagado 15.00 (no 30.00)", () => {
    assert.equal(pagado(true, 15, 15), 15);
    assert.equal(pagado(false, 0, 15), 15);
    assert.equal(pagado(true, 175, 0), 175, "solo sistema viejo / Migo");
    assert.equal(pagado(false, 0, 0), 0);
    assert.doesNotMatch(tk, /\(pg\.cobrado \? cobrado : 0\) \+ \(K\.pagoBeta/);
  });
  it("el mismo comprobante (misma URL / mismo archivo) se pinta una sola vez", () => {
    const L = (f.unicos as (l: Row[]) => Row[])([
      { tipo: "comprobante", url: "archivo:abc" }, { tipo: "comprobante", url: "archivo:abc" },
      { tipo: "comprobante", url: "https://drive.google.com/file/d/1VoucherCCCCCCCCCCCCCCCCCCCCCC/view" }, { tipo: "comprobante", url: "https://drive.google.com/open?id=1VoucherCCCCCCCCCCCCCCCCCCCCCC" },
      { tipo: "comprobante", url: "archivo:otro" },
    ]);
    assert.equal(L.length, 3);
  });
});

describe("TK156 voucher duplicado (TK-SO-1927)", () => {
  it("la foto sin pago y la misma enlazada al pago segundos después cuentan una sola vez", async () => {
    const { docsBeta } = await import("./tickets_beta_api.ts");
    const L = docsBeta({ datos: { comprobantes: [
      { por: "Alejandra", url: "archivo:41f2", fecha: "2026-11-19T22:39:11.445Z", pago_id: null },
      { por: "Alejandra", url: "archivo:5192", fecha: "2026-11-19T22:39:13.008Z", pago_id: "p1" },
      { por: "Alejandra", url: "archivo:otra", fecha: "2026-11-19T23:10:00.000Z", pago_id: null },
    ] } });
    assert.deepEqual(L.map((x: Row) => x.url), ["archivo:5192", "archivo:otra"]);
  });
});

describe("TK156 factura completa SRI en la tarjeta (t699u)", () => {
  it("001-001-000002976 conserva todos los ceros y va más chica y clara", () => {
    const ini = screens.indexOf("function _histFacNum("), fin = screens.indexOf("function _histColorQuien(");
    const fac = new Function("_tkFacFull", screens.slice(ini, fin) + "; return _histFacNum;")((t: Row) => t.f) as (t: Row) => string;
    assert.equal(fac({ f: "001-001-000002976" }), "001-001-000002976");
    assert.equal(fac({ f: "001-001-2976" .replace("2976", "002976") }), "001-001-000002976");
    assert.equal(fac({ f: "001-001-000002980" }), "001-001-000002980");
    assert.equal(fac({ f: "000002982" }), "000002982");
    assert.match(screens, /<span class="mob-fac"> - '\+_histEsc\(facn\)/);
    assert.match(screens, /Canje · sin factura/); assert.match(screens, /mob-fac-no"> · Sin factura/);
    assert.match(html, /\.mob-fac \{ font-weight: 500; color: var\(--gray\); font-size: 11\.5px;/);
    assert.match(html, /\.mob-l3 \{ color: var\(--gray\); font-size: 12px;/);
  });
});

describe("TK156 cero fugas de fotos/vouchers entre tickets nativos (sheet_row null)", () => {
  it("tk_historial: cada ticket trae SOLO sus fotos aunque sheet_row sea null", async () => {
    const mk = (id: number, so: string, a: string, d: string) => ({ id, sheet_row: null, so_num: so, timestamp: "2026-11-19T20:0" + (id % 10) + ":00Z", nombre: so, apellido: "", id_3: "17" + id, estimado: 15, fotos_antes: "archivo:" + a, fotos_despues: "archivo:" + d, orig: {} });
    const { h } = semilla({}, { tickets: [mk(1924, "TK-SO-1924", "a1924", "d1924"), mk(1927, "TK-SO-1927", "a1927", "d1927"), mk(1933, "TK-SO-1933", "a1933", "d1933")], beta_tickets: [], beta_clientes: [], beta_ticket_flags: [] });
    const r = await h("tk_historial", { limit: 50 });
    const por: Record<string, string[]> = {};
    for (const it of r.items as Row[]) por[String(it.so_num)] = ((it.fotosCard || []) as Row[]).map((f) => String(f.archivo));
    assert.deepEqual(por["TK-SO-1924"], ["a1924", "d1924"]);
    assert.deepEqual(por["TK-SO-1927"], ["a1927", "d1927"]);
    assert.deepEqual(por["TK-SO-1933"], ["a1933", "d1933"]);
  });
  it("fotos_batch devuelve cada archivo por SU id (sin mezclar)", async () => {
    const { h } = semilla({}, { app_archivos: [{ id: "a1924", mime: "image/jpeg", data_b64: "AAA" }, { id: "a1927", mime: "image/jpeg", data_b64: "BBB" }] });
    const r = await h("fotos_batch", { ids: ["a1927", "a1924", "", "null"] });
    assert.equal((r.items as Row).a1924.b64, "AAA");
    assert.equal((r.items as Row).a1927.b64, "BBB");
    assert.equal(Object.keys(r.items as Row).length, 2);
  });
  it("comprobantes: docsBeta solo lee los del propio ticket", async () => {
    const { docsBeta } = await import("./tickets_beta_api.ts");
    assert.deepEqual(docsBeta({ datos: { comprobantes: [{ url: "archivo:v1924", pago_id: "p1", por: "A", fecha: "2026-11-19T21:11:00Z" }] } }).map((x: Row) => x.url), ["archivo:v1924"]);
    assert.deepEqual(docsBeta(undefined), []);
  });
  it("_histCargarThumbs pinta cada <img> con la foto de SU data-arch", () => {
    const ini = screens.indexOf("var _FOTO_SS="), fin = screens.indexOf("function _histCardHTML(");
    const win: Row = {}, ss = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const mkImg = (id: string) => { const at: Record<string, string> = { "data-arch": id }; return { src: "", classList: { remove: () => {} }, getAttribute: (k: string) => at[k] ?? null, removeAttribute: (k: string) => { delete at[k]; }, remove: () => {} } as Row; };
    const imgs = [mkImg("a1924"), mkImg("a1927"), mkImg("a1933")];
    let resolver: (v: Row) => void = () => {};
    const api = (_a: string, p: Row) => new Promise<Row>((r) => { resolver = r; void p; });
    const f = new Function("window", "sessionStorage", "api", screens.slice(ini, fin) + "; return _histCargarThumbs;")(win, ss, api) as (r: Row) => void;
    f({ querySelectorAll: () => imgs });
    resolver({ ok: true, items: { a1924: { b64: "X1924" }, a1927: { b64: "X1927" }, a1933: { b64: "X1933" } }, faltan: [] });
    return new Promise<void>((done) => setTimeout(() => {
      assert.deepEqual(imgs.map((i) => String(i.src).split(",")[1]), ["X1924", "X1927", "X1933"]);
      done();
    }, 5));
  });
  it("vistas previas del detalle usan solo documentos del ticket abierto (deduplicados)", () => {
    const tk = file("mc-tickets.js");
    assert.match(tk, /var d = K\.d \|\| \{\}, docs = d\.documentos \|\| \[\]/);
    assert.match(tk, /if \(d && Array\.isArray\(d\.documentos\)\) d\.documentos = docsUnicos\(d\.documentos\);/);
  });
});

describe("TK156 colores marcados de cosmetóloga (t702u)", () => {
  it("cada nombre tiene un color saturado distinto y nunca gris pálido", () => {
    const ini = screens.indexOf("var _HIST_COL_FUERTE="), fin = screens.indexOf("function _histColorQuienPerfil(");
    const col = new Function(screens.slice(ini, fin) + "; return _histColorQuien;")() as (n: string) => string;
    const L = ["Evelyn Torres", "Andrea Robles", "Daniela Mora", "Alejandra Rodriguez (alejandra)", "Dejaneira", "Emi", "EFCH"].map(col);
    assert.equal(new Set(L).size, L.length);
    for (const c of L.concat(col("Valeria Nueva"))) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      assert.ok(lum < 0.45, c + " debe contrastar sobre blanco");
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) > 60, c + " debe ser saturado");
    }
    assert.equal(col(""), "");
  });
});
