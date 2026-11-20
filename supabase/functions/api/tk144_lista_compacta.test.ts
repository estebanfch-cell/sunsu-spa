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
import { avisosVirtualesEdicion } from "./ticket_edicion_api.ts";

const root = new URL("../../../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
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
    assert.match(lista, /enriquecerItemsLista\(ctx\.db, filas, items, cabMap(, \{ map, canje: canjeFacial \})?\)/);
    assert.doesNotMatch(lista, /for \(const it of items\)[\s\S]{0,200}consultar\(/);
    assert.match(handlers, /creado_por = s\(ses/);
  });

  it("la tarjeta es compacta: sin saldo/pagado/sin factura, con creador, miniaturas y + chico", () => {
    assert.match(screens, /function _histCardHTML/);
    assert.match(screens, /mob-who/);
    assert.match(screens, /_histFacCorta/);
    assert.match(screens, /_histFacNum/);
    assert.match(screens, /_histColorQuien/);
    assert.match(screens, /_histCamHTML/);
    assert.match(screens, /_histThumbsHTML/);
    assert.match(screens, /mob-res/);
    const card = screens.slice(screens.indexOf("function _histCardHTML"), screens.indexOf("function _tkFotoTipo"));
    assert.match(card, /mob-who/);
    assert.match(card, /_histFacNum\(t\)/);
    assert.match(card, /_histCamHTML\(t,i\)/);
    assert.match(card, /style="color:'\+_histEsc\(colWho\)/);
    assert.doesNotMatch(card, /👤 /);
    assert.doesNotMatch(card, /mob-saldo/);
    assert.doesNotMatch(card, /_tkPagoPill\(t\)/);
    assert.doesNotMatch(card, /_tkPill\('sinfactura'/);
    assert.doesNotMatch(card, /Canje de paquete/);
    assert.doesNotMatch(card, /_tkVoucherCardBtns/);
    assert.match(html, /\.mob-card \{[^}]*padding: 8px 12px/);
    assert.match(html, /\.mob-cards \{[^}]*gap: 8px/);
    assert.match(html, /\.mob-th, \.mob-thmore \{ width: 28px; height: 28px; min-width: 28px; max-width: 28px; min-height: 28px; max-height: 28px; flex: 0 0 28px/);
    assert.match(html, /white-space: nowrap; overflow: hidden; text-overflow: ellipsis/);
    assert.match(html, /\.tab-plus \{[^}]*width: 48px; height: 48px/);
    assert.doesNotMatch(html, /width: 66px; height: 66px/);
    assert.match(sw, /const CACHE = "sunsu-2026-11-20-TK183b"/);
  });

  it("fila 1 es ticket-factura, el creador va de su color y la cámara queda bajo la chica", () => {
    const card = screens.slice(screens.indexOf("function _histCardHTML"), screens.indexOf("function _tkFotoTipo"));
    assert.match(card, /\(facn\?\(' - '\+facn\):''\)/);
    assert.match(card, /mob-l3t/);
    assert.match(screens, /📷✓/);
    assert.match(screens, /Tomar foto de voucher o transferencia/);
    assert.match(screens, /onclick="event.stopPropagation\(\)"/);
    assert.match(screens, /capture="environment"/);
    assert.match(screens, /onchange="_tkVoucherCard\(event,'\+i\+'\)"/);
    assert.match(html, /\.mob-cam\.ok/);
    assert.match(lista, /fotoPago: 1/);
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

  it("Editar es un pill discreto, sin agregar/promo/descuento en el detalle y totales pegados a la derecha", () => {
    assert.match(tickets, /function editarMiniHtml/);
    assert.match(tickets, /class="mctk-edit-mini"/);
    assert.doesNotMatch(tickets, /✏️ Editar ticket/);
    assert.match(tickets, /K\.editandoLineas \? \('<a href="#" class="mctk-link mctk-addbtn"/);
    assert.match(tickets, /K\.editandoLineas \? \('<div class="mctk-adj"/);
    assert.match(tickets, /grid-template-columns:auto auto/);
    assert.match(tickets, /function textoCanje/);
    assert.doesNotMatch(tickets, /var pref = l\.paqueteSesion \? "Canje paquete "/);
    assert.match(tickets, /Aprobando…/);
    assert.match(html, /navigator\.setAppBadge/);
  });
});

describe("TK144 alertas de edición y cámara de voucher", () => {
  it("las solicitudes de edición entran al centro de avisos y al badge", () => {
    const edicion = readFileSync(new URL("supabase/functions/api/ticket_edicion_api.ts", root), "utf8");
    const conteo = readFileSync(new URL("supabase/functions/api/conteo_fisico_api.ts", root), "utf8");
    assert.match(edicion, /export async function avisarEdicionTicket/);
    assert.match(edicion, /tipo: "edicion_ticket"/);
    assert.match(edicion, /#\/m\/tickets\/t\//);
    assert.match(edicion, /void reevaluarFlags/);
    assert.match(conteo, /avisosVirtualesEdicion/);
    assert.match(html, /navigator.setAppBadge/);
  });
});

describe("TK144 avisos virtuales de edición", () => {
  it("un admin ve la solicitud pendiente y al tocarla abre el ticket", () => {
    const extra = avisosVirtualesEdicion([
      { id: "s1", tabla: "ticket_detalle", fila: "TK-SO-1925", estado: "pendiente", solicitante: "Andrea", creado: "2026-11-19T20:00:00Z", enlace: "#/m/tickets/t/TK-SO-1925" },
    ], [], { name: "Emilia", uid: "emi", rol: "super_admin" } as never, true);
    assert.equal(extra.length, 1);
    assert.equal(extra[0].link, "#/m/tickets/t/TK-SO-1925");
    assert.equal(extra[0].leida, false);
    assert.match(String(extra[0].cuerpo), /Andrea/);
    assert.equal(avisosVirtualesEdicion([{ id: "s1", tabla: "ticket_detalle", fila: "TK-SO-1925", estado: "pendiente", enlace: "#/m/tickets/t/TK-SO-1925" }], extra, { name: "Emilia" } as never, true).length, 0);
    assert.equal(avisosVirtualesEdicion([{ id: "s1", tabla: "ticket_detalle", fila: "TK-SO-1925", estado: "pendiente" }], [], { name: "Andrea" } as never, false).length, 0);
  });
});
