import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const screens = readFileSync(new URL("beta-screens.js", root), "utf8");
const tickets = readFileSync(new URL("mc-tickets.js", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");
const card = screens.slice(screens.indexOf("function _histCardHTML"), screens.indexOf("function _tkFotoTipo"));

describe("DEV-34 lista de Tickets compacta (opción 1)", () => {
  it("la versión de caché coincide y subió a DEV34C", () => {
    const enSw = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
    const enHtml = (html.match(/window\.SUNSU_CACHE = "([^"]+)"/) || [])[1];
    assert.equal(enSw, enHtml);
    assert.equal(enSw, "sunsu-2026-11-26-PDFTODAS");
    assert.match(html, /beta-screens\.js\?v=20261125dev34c/);
    assert.match(html, /mc-tickets\.js\?v=20261125dev34/);
  });

  it("línea 1: número · Fac. 3014 + estado + cosmetóloga a la derecha + menú ⋯", () => {
    assert.match(card, /class="mob-l1"/);
    assert.match(card, /class="mob-num">'\+_histEsc\(l1\)\+_histFacTag\(t,facn,anul,true\)/);
    assert.match(card, /class="mob-l1r"/);
    assert.match(card, /class="mob-who"/);
    assert.match(card, /_histMenuHTML\(t,i\)/);
    assert.match(card, /style="color:'\+_histEsc\(colWho\)/);
  });

  it("línea 2: clienta a la izquierda, fecha · monto (total de líneas) a la derecha", () => {
    assert.match(card, /class="mob-l2"/);
    assert.match(card, /class="mob-cli"/);
    assert.match(card, /class="mob-l3t"/);
    assert.match(card, /_histFechaFmt\(t\.fecha\)/);
    assert.match(card, /_histMontos\(t\)\.tot\.toFixed\(2\)/);
    assert.doesNotMatch(card.split("mob-l2")[1] || "", /_histFacTag/);
    assert.doesNotMatch(card, /mob-saldo/);
  });

  it("en la tarjeta móvil la factura se acorta a Fac. 3014; el title y el escritorio conservan la completa", () => {
    const src = screens.slice(screens.indexOf("function _histFacCortaTxt"), screens.indexOf("function _histFacCorta("));
    const fn = new Function(src + "; return _histFacCortaTxt;")() as (s: string) => string;
    assert.equal(fn("001-001-000003014"), "Fac. 3014");
    assert.equal(fn("000002982"), "Fac. 2982");
    assert.equal(fn("001-001-000000014"), "Fac. 14");
    const fac = screens.slice(screens.indexOf("function _histFacTag"), screens.indexOf("function _histColorQuien"));
    assert.match(fac, /_histFacCortaTxt\(facn\)/);
    assert.match(fac, /title="'\+_histEsc\(facn\)/);
    assert.match(fac, / · '\+_histEsc\(_histFacCortaTxt\(facn\)\)/);
    assert.match(screens, /tk-fac-full">'\+_histEsc\(ff\)/);
    assert.match(html, /#tk-cards \.mob-num \.mob-fac \{[^}]*white-space: nowrap; overflow: visible; text-overflow: clip;/);
    assert.match(html, /#tk-cards \.mob-fac-full \{[^}]*font-family: ui-monospace/);
  });

  it("línea 3: miniaturas + resumen, cámara y WhatsApp chicos a la derecha; sin botón grande de factura", () => {
    assert.match(card, /_histThumbsHTML\(t, res\)/);
    assert.match(card, /_histActsHTML\(t,i\)/);
    assert.doesNotMatch(card, /_histLigarHTML/);
    assert.doesNotMatch(card, /Asociar factura/);
    assert.doesNotMatch(card, /Cambiar factura/);
    assert.match(screens, /'<span class="mob-acts">' \+ _histCamHTML\(t,i\) \+ _histWaHTML\(t,i\) \+ '<\/span>'/);
    assert.match(html, /#tk-cards \.mob-acts \{ flex-direction: row;/);
    assert.match(html, /#tk-cards \.mob-cam, #tk-cards \.mob-wa \{[^}]*22px/);
    assert.match(html, /#tk-cards \.mob-th, #tk-cards \.mob-thmore \{ width: 22px/);
    assert.match(html, /#tk-cards\.mob-cards \{ gap: 5px; \}/);
    assert.match(html, /#tk-cards \.mob-card \{ padding: 5px 10px; \}/);
  });

  it("Asociar/Cambiar factura vive en el menú ⋯ de la tarjeta y en Acciones del detalle; el texto nunca dice ligar", () => {
    assert.match(screens, /function _histMenuHTML/);
    assert.match(screens, /function _histLigarLab/);
    assert.match(screens, /Asociar factura':'Cambiar factura/);
    assert.match(screens, /class="mob-more"/);
    const menu = screens.slice(screens.indexOf("function _histMenuHTML"), screens.indexOf("function _histToggleMenu"));
    assert.match(menu, /Asociar factura|'\+lab\+'/);
    assert.match(menu, /onclick="_histLigarFac\('\+i\+'\)"/);
    assert.doesNotMatch(menu, /[>]ligar|Ligar factura|ligar factura/);
    assert.match(tickets, /id="mctk-ligar-fac-menu"/);
    assert.match(tickets, /#mctk-ligar-fac, #mctk-ligar-fac-menu/);
    const lab = screens.slice(screens.indexOf("function _histLigarLab"), screens.indexOf("function _histLigarHTML"));
    assert.match(lab, /Asociar factura/);
    assert.match(lab, /Cambiar factura/);
    assert.doesNotMatch(lab, /"ligar"|'ligar'|Ligar factura/);
  });

  it("Falta factura y Canje · sin factura se leen completos en rojo/gris, sin tip extra", () => {
    const fac = screens.slice(screens.indexOf("function _histFacTag"), screens.indexOf("function _histColorQuien"));
    assert.match(fac, /mob-fac-falta/);
    assert.match(fac, /Falta factura/);
    assert.match(fac, /Canje · sin factura/);
    assert.match(fac, /mob-fac-full/);
    assert.match(html, /\.mob-fac-falta \{ color: #B91C1C; font-weight: 800; \}/);
    assert.match(card, /var tipExtra=tip&&tip!=='Falta factura'/);
    assert.match(card, /tipExtra\?'<div class="mob-tip"/);
  });

  it("el escritorio no cambia: cámara y WhatsApp en fila, sin el botón de factura en la tabla", () => {
    assert.match(screens, /c\.k==='acc'\) return '<td class="tk-acc"[^\n]*mob-acts tk-acts-row[^\n]*_histCamHTML\(t,i\)\+_histWaHTML\(t,i\)/);
    assert.match(html, /\.mob-acts\.tk-acts-row \{ flex-direction: row;/);
    assert.match(html, /\.mob-acts \{ display: inline-flex; flex-direction: column;/);
  });

  it("bordes izquierdos, restauración del scroll y monto = total de líneas se mantienen", () => {
    assert.match(html, /\.mob-card\.tk-flagged \{/);
    assert.match(html, /\.mob-card\.tk-falta \{/);
    assert.match(html, /\.mob-card\.tk-wapend \{/);
    assert.match(screens, /SunsuListaPos\.watch\('tickets'\)/);
    assert.match(card, /_histMontos\(t\)\.tot/);
  });

  it("otras listas .ss-card / .mob-cards siguen con el padding y gap de siempre", () => {
    assert.match(html, /\.mob-cards \{ display: none; flex-direction: column; gap: 8px; \}/);
    assert.match(html, /\.mob-card \{[^}]*padding: 8px 12px/);
    assert.match(html, /\.ss-card\.mob-card, \.mob-card\.ss-card \{ padding: 9px 12px;/);
  });
});
