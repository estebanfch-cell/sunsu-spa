import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const js = readFileSync(new URL("beta-screens.js", root), "utf8");
const html = readFileSync(new URL("index.html", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");
const handlers = readFileSync(new URL("supabase/functions/api/handlers.ts", root), "utf8");

const CACHE = "sunsu-2026-11-27-TK2002GC";

describe("TK2002 · aplicar / cruzar gift card en la creación del ticket", () => {
  it("hay un botón claro «Aplicar gift card» y «Cruzar con gift card» por línea", () => {
    assert.match(js, /function _gcCruzarElegir\(\)/);
    assert.match(js, /function _gcCruzarAbrir\(sku\)/);
    assert.match(js, /function _gcCruzarAplicar\(/);
    assert.match(js, /function _gcCruzarQuitar\(/);
    assert.match(js, /function _gcBuscarCodigo\(/);
    assert.match(js, /onclick="_gcCruzarElegir\(\)"/);
    assert.match(js, /Aplicar gift card/);
    assert.match(js, /Cruzar con gift card/);
    assert.match(js, /Quitar gift/);
    assert.match(js, /call\('buscarGiftCards',\{q:q\}\)/);
    assert.match(js, /min-height:44px/);
    const ui = js.slice(js.indexOf("function _gcLineaEsPack"), js.indexOf("function _ldRender"));
    assert.ok(ui.length > 500, "el flujo de cruzar gift está en el formulario");
    assert.doesNotMatch(ui, /ligar/i);
  });

  it("la gift se puede cruzar con el paquete o cualquier otra línea (por código)", () => {
    assert.match(js, /T\.gcPagoLinea=\{sku:sku,codigo:codigo,monto:monto\}/);
    assert.match(js, /promo:'Gift card '/);
    assert.match(js, /Cruza el código con/);
    assert.match(js, /paquete, producto u otro/);
    assert.match(js, /gcPagoLinea:\s*T\.gcPagoLinea\|\|null/);
    // si se cruza con el pack + hay facial, el cobro pasa a Paquete (facial \$0)
    const aplicar = js.slice(js.indexOf("function _gcCruzarAplicar"), js.indexOf("function _gcCruzarElegir"));
    assert.match(aplicar, /linea&&linea\.b==='pack'&&T\.facial/);
    assert.match(aplicar, /_paqSetCobroPaquete/);
    assert.match(aplicar, /linea&&linea\.b==='f'/);
    assert.match(aplicar, /T\.cobro='giftcard'/);
  });

  it("el bug anterior no se repite: gift en el pack + sesión 1 no deja paquete vacío ni cobra el facial \$65", () => {
    // col Q también sale cuando confirmaron la sesión aunque cobro no sea «paquete»
    const env = js.slice(js.indexOf("// Col Q:"), js.indexOf("// Col S:"));
    assert.match(env, /T\.paqConfirmado&&T\.paqPick&&T\.paqPick\.fila&&T\.paqPick\.fila!=='luego'&&T\.usoPaq/);
    assert.match(env, /colQ='SI, '\+T\.usoPaq/);
    // col R también cuando la gift se cruza con una línea
    assert.match(env, /T\.cobro==='giftcard'\|\|T\.gcPagoLinea/);
    // el comentario viejo («SOLO cuando el facial se cobra con paquete») ya no manda
    assert.doesNotMatch(env, /SOLO cuando el facial se cobra con paquete/);
    // tras enviar, si el pack nuevo ya se marcó en el backend, no se vuelve a ofrecer
    assert.match(js, /_paqPick&&_paqPick\.fila==='nuevo'&&d&&d\.uso_paquete&&d\.uso_paquete\.ok/);
    assert.match(js, /_packsNuevos\.length && !\(_paqPick&&_paqPick\.fila==='nuevo'\)/);
  });

  it("el backend escribe paquete SI, 1\/N y marca la sesión 1 del pack nuevo; no ajusta el facial si la gift fue a otra línea", () => {
    assert.match(handlers, /TK2002: si confirmaron una sesión/);
    assert.match(handlers, /base\.paquete = "SI, " \+ \(idx \+ 1\) \+ "\/" \+ tot/);
    assert.match(handlers, /filaUso = s\(pick\.fila\) === "nuevo" \? paqueteFila : pick\.fila/);
    assert.match(handlers, /giftSobreFacial \? n\(p\.facialPrecio\) : 0/);
    assert.match(handlers, /gc_pago_linea/);
    assert.match(handlers, /giftSobreFacial && n\(gcAplicada\.facialCobro\) === 0 && n\(p\.facialPrecio\) > 0/);
    // ya no se salta el pack nuevo al marcar uso
    const uso = handlers.slice(handlers.indexOf("TK141: si la chica eligió paquete"), handlers.indexOf("TK139:"));
    assert.doesNotMatch(uso, /pick\.fila !== "nuevo"/);
    assert.match(uso, /aplicarUsoExplicit/);
  });

  it("cache TK2002GC idéntica en sw.js e index.html", () => {
    const enHtml = (html.match(/window\.SUNSU_CACHE = "([^"]+)"/) || [])[1];
    const enSw = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
    assert.equal(enHtml, CACHE);
    assert.equal(enSw, CACHE);
    assert.match(html, /beta-screens\.js\?v=20261127tk2002gc/);
  });
});
