import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { estaCobrado, estaPagado, sumaPagosBeta } from "./tickets_beta_api.ts";
import { refsFoto, topeFotosCard, urlsFoto, type FotoCard } from "./ticket_lista_card.ts";

const root = new URL("../../../", import.meta.url);
const html = readFileSync(new URL("beta.html", root), "utf8");
const screens = readFileSync(new URL("beta-screens.js", root), "utf8");
const lista = readFileSync(new URL("supabase/functions/api/tickets_lista_api.ts", root), "utf8");
const getApi = readFileSync(new URL("supabase/functions/api/tickets_beta_api.ts", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");

describe("TK148 cobrado desde beta_pagos", () => {
  it("suma solo pagos vivos", () => {
    assert.equal(sumaPagosBeta([{ monto: 15 }, { monto: 10, anulado: true }, { monto: 5 }]), 20);
    assert.equal(sumaPagosBeta([]), 0);
  });

  it("TK-SO-1924: cob/comp vacíos pero beta_pagos cubre el total → pagado", () => {
    const r = { estimado: 14.996, cob: null, comp: null, fac_7: null };
    assert.equal(estaCobrado(r), false);
    assert.equal(estaPagado(r, { pagadoBeta: 15, total: 14.996 }), true);
  });

  it("TK-SO-1927: sin beta_pagos sigue por cobrar", () => {
    const r = { estimado: 14.996, cob: null, comp: null, fac_7: null };
    assert.equal(estaPagado(r, { pagadoBeta: 0, total: 14.996 }), false);
  });

  it("pago parcial no alcanza y un anulado no cuenta como pagado", () => {
    assert.equal(estaPagado({ estimado: 100, cob: null }, { pagadoBeta: 40, total: 100 }), false);
    assert.equal(estaPagado({ estimado: 15, orig: { anulado: true } }, { pagadoBeta: 15, total: 15 }), false);
    assert.equal(estaPagado({ cob: true, estimado: 75 }, { pagadoBeta: 0, total: 75 }), true);
  });

  it("lista y detalle usan estaPagado; el filtro carga beta_pagos antes de porcobrar", () => {
    assert.match(lista, /const cobDe = \(r: Row\) => estaPagado\(/);
    assert.match(lista, /pagosPorClaveAll/);
    assert.match(lista, /if \(est === "porcobrar"\) L = L\.filter\(\(r\) => !cobDe\(r\)\)/);
    assert.match(lista, /it\.cob = cobrado/);
    assert.match(getApi, /const pagadoBeta = sumaPagosBeta\(betaPagos\)/);
    assert.match(getApi, /cobrado = estaPagado\(/);
  });
});

describe("TK148 miniaturas reales, tope 4 + N", () => {
  it("refsFoto acepta archivo: y urlsFoto no lo pone como src", () => {
    assert.deepEqual(
      refsFoto("archivo:aaa | https://cdn.example/c.jpg | archivo:bbb"),
      ["archivo:aaa", "https://cdn.example/c.jpg", "archivo:bbb"],
    );
    assert.deepEqual(urlsFoto("https://cdn.example/c.jpg | archivo:123"), ["https://cdn.example/c.jpg"]);
    assert.equal(urlsFoto("archivo:abc").length, 0);
    assert.deepEqual(refsFoto("archivo:abc"), ["archivo:abc"]);
  });

  it("con 1 a 4 fotos reales no hay +N; con 5+ muestra 4 y +{total-4}", () => {
    const mk = (n: number): FotoCard[] => Array.from({ length: n }, (_, i) => ({ url: "https://x/" + i + ".jpg", k: "p" }));
    assert.deepEqual(topeFotosCard(mk(0)), { fotosCard: [], fotosMore: 0 });
    assert.equal(topeFotosCard(mk(1)).fotosCard.length, 1);
    assert.equal(topeFotosCard(mk(1)).fotosMore, 0);
    assert.equal(topeFotosCard(mk(4)).fotosCard.length, 4);
    assert.equal(topeFotosCard(mk(4)).fotosMore, 0);
    assert.equal(topeFotosCard(mk(5)).fotosCard.length, 4);
    assert.equal(topeFotosCard(mk(5)).fotosMore, 1);
    assert.equal(topeFotosCard(mk(6)).fotosMore, 2);
  });

  it("la lista prioriza antes y después reales, productos solo con foto, y topea en 4", () => {
    const card = readFileSync(new URL("supabase/functions/api/ticket_lista_card.ts", root), "utf8");
    assert.match(card, /refsFoto\(r\.fotos_antes\)/);
    assert.match(card, /refsFoto\(r\.fotos_despues\)/);
    assert.match(card, /if \(!antes && !despues\)/);
    assert.match(card, /topeFotosCard\(fotos\)/);
    assert.doesNotMatch(card, /fotos\.slice\(0, 5\)/);
  });

  it("el front pinta máximo 4 fotitos, el 5.º +N solo si hay más, y carga archivo: con fotoB64", () => {
    const fn = screens.slice(screens.indexOf("function _histThumbsHTML"), screens.indexOf("function _histCardHTML"));
    assert.match(fn, /fotos=fotos\.slice\(0,4\)/);
    assert.match(fn, /if\(more>0\) h\+='<span class="mob-thmore">\+'\+more/);
    assert.match(fn, /data-arch=/);
    assert.match(fn, /function _histCargarThumbs/);
    assert.match(fn, /api\('fotoB64',\{id:id\}\)/);
    assert.match(screens, /_histCargarThumbs\(document\.getElementById\('tk-cards'\)/);
    assert.doesNotMatch(fn, /slice\(0,5\)/);
    assert.doesNotMatch(fn, /placeholder|iniciales|avatar-gen/i);
  });
});

describe("TK148 colores más visibles en iPhone", () => {
  it("amarillo y rojo saturados con borde izquierdo claro", () => {
    assert.match(html, /\.mob-card\.tk-falta \{ background: #FDE68A; border-color: #EAB308; border-left: 4px solid #D97706; \}/);
    assert.match(html, /\.mob-card\.tk-flagged \{ background: #FECACA; border-color: #F87171; border-left: 4px solid #DC2626; \}/);
    assert.match(html, /\.tk-row\.tk-falta td \{ background: #FDE68A;/);
    assert.match(html, /\.tk-row\.tk-flagged td \{ background: #FECACA;/);
    assert.doesNotMatch(html, /background: #fffcf0;/);
    assert.doesNotMatch(html, /background: #fff8f7;/);
  });

  it("cache TK148", () => {
    assert.match(sw, /const CACHE = "sunsu-beta-2026-11-19-TK148"/);
  });
});
