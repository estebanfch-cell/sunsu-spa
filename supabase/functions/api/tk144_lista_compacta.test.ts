import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  creadoPorDe,
  facListaTxt,
  nombreCorto,
  resumenDeHoja,
  resumenDeLineas,
  textoResumen,
  urlsFoto,
} from "./ticket_lista_card.ts";

const root = new URL("../../../", import.meta.url);
const html = readFileSync(new URL("beta.html", root), "utf8");
const screens = readFileSync(new URL("beta-screens.js", root), "utf8");
const tickets = readFileSync(new URL("mc-tickets.js", root), "utf8");
const lista = readFileSync(new URL("supabase/functions/api/tickets_lista_api.ts", root), "utf8");
const handlers = readFileSync(new URL("supabase/functions/api/handlers.ts", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");

describe("TK144 tarjetas compactas de la lista", () => {
  it("resume categorías en una sola línea y no cuenta canjes como faciales de venta", () => {
    const r = resumenDeLineas([
      { tipo: "facial", cantidad: 1, precio_unit: 45, total_linea: 45, nombre: "Limpieza" },
      { tipo: "facial", cantidad: 1, precio_unit: 0, total_linea: 0, canje: true, nombre: "Canje" },
      { tipo: "extra", cantidad: 1, precio_unit: 10, total_linea: 10, nombre: "Labios" },
      { tipo: "producto", cantidad: 2, sku: "AS-002", precio_unit: 16.51, total_linea: 37.98 },
      { tipo: "gift", cantidad: 1, precio_unit: 50, total_linea: 50 },
      { tipo: "paquete", cantidad: 1, precio_unit: 180, total_linea: 180 },
    ]);
    assert.equal(r.faciales, 1);
    assert.equal(r.canjes, 1);
    assert.equal(r.extras, 1);
    assert.equal(r.productos, 2);
    assert.equal(r.gifts, 1);
    assert.equal(r.paquetes, 1);
    assert.equal(textoResumen(r), "1 facial · 1 paquete · 1 canje · 1 extra · 2 productos · 1 gift card");
  });

  it("si no hay líneas beta, arma el resumen desde la hoja sin inflar ceros", () => {
    const r = resumenDeHoja({
      facial_hecho: "Limpieza profunda",
      servicios_adicionales: "Labios | Pestañas",
      compra_pack_3: "SUNSU-PQ-3",
      paquete: "SI",
      venta_gift: "GC-1",
    });
    assert.equal(r.faciales, 1);
    assert.equal(r.extras, 2);
    assert.equal(r.paquetes, 1);
    assert.equal(r.canjes, 1);
    assert.equal(r.gifts, 1);
    assert.ok(!textoResumen(r).includes("0 "));
  });

  it("acorta factura y el nombre de quien creó el ticket", () => {
    assert.equal(facListaTxt("001-001-000002982"), "Fac. 001-001-2982");
    assert.equal(facListaTxt(""), "");
    assert.equal(nombreCorto("Andrea Robles"), "Andrea");
    assert.equal(nombreCorto("Andrea (u-12)"), "Andrea");
    assert.equal(creadoPorDe({ orig: { creado_por: "Emilia Gallegos" }, atendido_por: "Andrea" }), "Emilia Gallegos");
    assert.equal(creadoPorDe({ atendido_por: "Andrea Robles" }), "Andrea Robles");
  });

  it("solo toma fotos http o data:image, nunca archivo:", () => {
    assert.deepEqual(urlsFoto("https://cdn.example/c.jpg | archivo:123"), ["https://cdn.example/c.jpg"]);
    assert.equal(urlsFoto("archivo:abc").length, 0);
  });

  it("la API enriquece la página en lote y guarda quién creó el ticket nuevo", () => {
    assert.match(lista, /enriquecerItemsLista\(ctx\.db, filas, items, cabMap\)/);
    assert.doesNotMatch(lista, /for \(const it of items\)[\s\S]{0,200}consultar\(/);
    assert.match(handlers, /creado_por = s\(ses/);
  });

  it("la tarjeta es compacta: sin saldo/pagado/sin factura, con creador, miniaturas y + chico", () => {
    assert.match(screens, /function _histCardHTML/);
    assert.match(screens, /mob-who/);
    assert.match(screens, /👤 /);
    assert.match(screens, /_histFacCorta/);
    assert.match(screens, /_histThumbsHTML/);
    assert.match(screens, /mob-res/);
    const card = screens.slice(screens.indexOf("function _histCardHTML"), screens.indexOf("function _tkFotoTipo"));
    assert.match(card, /mob-who/);
    assert.doesNotMatch(card, /mob-saldo/);
    assert.doesNotMatch(card, /_tkPagoPill\(t\)/);
    assert.doesNotMatch(card, /_tkPill\('sinfactura'/);
    assert.doesNotMatch(card, /Canje de paquete/);
    assert.match(html, /\.mob-card \{[^}]*padding: 8px 12px/);
    assert.match(html, /\.mob-cards \{[^}]*gap: 8px/);
    assert.match(html, /\.mob-th \{ width: 28px; height: 28px/);
    assert.match(html, /white-space: nowrap; overflow: hidden; text-overflow: ellipsis/);
    assert.match(html, /\.tab-plus \{[^}]*width: 48px; height: 48px/);
    assert.doesNotMatch(html, /width: 66px; height: 66px/);
    assert.match(sw, /const CACHE = "sunsu-beta-2026-11-19-TK144"/);
  });
});

describe("TK144 líneas del detalle realmente compactas", () => {
  it("cada línea son 3 renglones pegados, ↗ inline y miniatura 28px", () => {
    assert.match(tickets, /function metaLineaHtml/);
    assert.match(tickets, /Stock Venta:/);
    assert.match(tickets, /padding:7px 22px 7px 10px/);
    assert.match(tickets, /width:28px;height:28px;border-radius:6px/);
    assert.match(tickets, /class="mctk-meta"/);
    assert.match(tickets, /tipo = "Extra"/);
    assert.match(tickets, /display:inline!important/);
    assert.doesNotMatch(tickets, /padding:0 6px;line-height:16px;border:1px solid #d9cfbd/);
    // el render ya no apila sku + stock en filas aparte
    assert.match(tickets, /fotoLinea\(l\) \+[\s\S]{0,80}mctk-r1[\s\S]{0,200}metaLineaHtml\(l\)/);
    assert.doesNotMatch(tickets, /mctk-sku">' \+ e\(skuLineaTxt/);
  });

  it("el scroll del detalle deja ver Total / Pagado / Saldo detrás del +", () => {
    assert.match(html, /tk-detail\.tk-open \{/);
    assert.match(html, /padding-bottom: calc\(108px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });
});
