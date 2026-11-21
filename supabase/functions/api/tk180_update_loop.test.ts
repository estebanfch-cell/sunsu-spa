import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");
const upd = html.slice(html.indexOf("window.SunsuUpdate ="), html.indexOf("function mostrarNuevaVersion"));

describe("TK180 el banner de actualización nunca se queda pegado", () => {
  it("la versión de la página es la MISMA que la del service worker (si no, el banner sale siempre)", () => {
    const enSw = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
    const enHtml = (html.match(/window\.SUNSU_CACHE = "([^"]+)"/) || [])[1];
    assert.ok(enSw && enHtml);
    assert.equal(enHtml, enSw);
    assert.equal(enSw, "sunsu-2026-11-20-TK201");
  });
  it("en la app nativa (TestFlight) no hay banner ni chequeo de SW", () => {
    assert.match(upd, /Capacitor\.isNativePlatform\(\)/);
    assert.match(upd, /if \(esNativa\(\)\) return;/);
    assert.match(upd, /esNativa\(\) \|\| dismissed\(\) \|\| agotado\(\)/);
  });
  it("Actualizar: SKIP_WAITING + espera controllerchange, segundo intento suelta SW y cachés, tope sin bucle", () => {
    assert.match(upd, /SKIP_WAITING/);
    assert.match(upd, /controllerchange/);
    assert.match(upd, /r\.unregister\(\)/);
    assert.match(upd, /caches\.delete/);
    assert.match(upd, /setTimeout\(go, 6000\)/);
    assert.match(upd, /t\.n >= 2/);
    assert.match(upd, /sunsu\.upd\.try/);
    assert.match(upd, /location\.reload\(\)/);
    assert.doesNotMatch(upd, /localStorage\.(removeItem|clear)/);
  });
  it("el script del banner es JavaScript válido", () => {
    assert.doesNotThrow(() => new Function(upd));
  });
});

describe("TK182 cámara y WhatsApp en la tabla de Tickets de la computadora", () => {
  const bs = readFileSync(new URL("beta-screens.js", root), "utf8");
  it("columna de acciones al final con los mismos botones, horizontal", () => {
    assert.match(bs, /concat\(\[\{k:'acc',t:'',acc:1\}\]\)/);
    assert.match(bs, /c\.k==='acc'\) return '<td class="tk-acc"[^\n]*mob-acts tk-acts-row[^\n]*_histCamHTML\(t,i\)\+_histWaHTML\(t,i\)/);
    assert.match(bs, /_histCelda\(t,c,showPrices,i\)/);
    assert.match(html, /\.mob-acts\.tk-acts-row \{ flex-direction: row;/);
    assert.match(html, /\.mob-acts \{ display: inline-flex; flex-direction: column;/); // celular sigue vertical
  });
});

describe("TK182b factura completa en la tabla de Tickets", () => {
  const bs = readFileSync(new URL("beta-screens.js", root), "utf8");
  it("Factura con ancho fijo y sin «…»", () => {
    assert.match(html, /\.tk-table th\[data-c="fac"\] \{ width: 172px; \}/);
    assert.match(html, /\.tk-table td\[data-c="fac"\] \{ overflow: visible; text-overflow: clip; white-space: nowrap; \}/);
    assert.match(bs, /replace\(\/\^<td\/,'<td data-c="'\+c\.k\+'"'\)/);
  });
});

describe("TK182c nombre de la clienta siempre completo", () => {
  const bs = readFileSync(new URL("beta-screens.js", root), "utf8");
  it("Clienta sin «…»; en tabla angosta Forma de pago se corta y la factura muestra los últimos dígitos", () => {
    assert.match(html, /td\[data-c="cli"\] \{ white-space: normal; overflow: visible; text-overflow: clip;/);
    assert.match(html, /@container tklist \(max-width: 1100px\)/);
    assert.match(html, /td\[data-c="fac"\] \.tk-fac-corta \{ display: inline; \}/);
    assert.match(bs, /<span class="tk-fac-corta">…'\+_histEsc\(fc\)/);
    assert.match(bs, /<span class="tk-fac" title="'\+_histEsc\(ff\)\+'">/);
  });
});
