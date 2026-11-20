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
    assert.match(file("sw.js"), /const CACHE = "sunsu-2026-11-19-TK156"/);
    assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-19-TK156"/);
    assert.match(file("supabase/functions/api/sunsu_version.ts"), /sunsu-engine-2026-11-19-TK156/);
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
    assert.match(html, /pulso = htmlDashTop\(alertasDashboard\(apr, notif, alertasOcultas\(\)\)\) \+ pulso;/);
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
