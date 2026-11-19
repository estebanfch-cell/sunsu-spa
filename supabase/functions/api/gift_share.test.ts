import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const src = readFileSync(join(root, "mc-giftcards.js"), "utf8");
const beta = readFileSync(join(root, "beta.html"), "utf8");
const CACHE = "20261118tk106"; // TK34 (proveedores) subió la versión después de TK35 gift
function loadPlan() {
  const m = src.match(/function planEntregaGift\(o\) \{[\s\S]*?return "download-pdf";\n  \}/);
  assert.ok(m, "planEntregaGift debe estar en mc-giftcards.js");
  return new Function(m[0] + "\nreturn planEntregaGift;")() as (o: Record<string, unknown>) => string;
}

describe("gift cards: enviar / vista previa (TK35)", () => {
  const plan = loadPlan();

  it("el plan de entrega coincide con compartirGiftCard del sistema viejo", () => {
    assert.equal(plan({ esMovil: true, canSharePdf: true, canSharePng: false }), "share-pdf");
    assert.equal(plan({ esMovil: true, canSharePdf: true, canSharePng: true }), "share-pdf");
    assert.equal(plan({ esMovil: true, canSharePdf: false, canSharePng: true }), "share-png");
    assert.equal(plan({ esMovil: true, canSharePdf: false, canSharePng: false }), "download-pdf");
    assert.equal(plan({ esMovil: false, canSharePdf: true, canSharePng: true }), "download-pdf");
    assert.equal(plan({}), "download-pdf");
  });

  it("el módulo de Gift cards reusa el diseño, tiene WhatsApp/descargar en ficha y fila, y no escribe en Sheets", () => {
    assert.match(src, /dibujarGiftCard/);
    assert.match(src, /htmlLienzo/);
    assert.match(src, /id="gcd-canvas"/);
    assert.match(src, /data-gc-wa/);
    assert.match(src, /data-gc-dl/);
    assert.match(src, /💬 WhatsApp/);
    assert.match(src, /⬇️ Descargar/);
    assert.match(src, /arrástralo a WhatsApp/);
    assert.match(src, /pngDelLienzo/);
    assert.match(src, /shareHtml\(/);
    assert.match(src, /enviarGift\(/);
    assert.match(src, /th>Enviar</);
    assert.doesNotMatch(src, /_gcdGuardarRegistro\(/);
    assert.doesNotMatch(src, /compartirGiftCard\(/);
    assert.doesNotMatch(src, /APPS_SCRIPT_URL/);
    assert.doesNotMatch(src, /guardarGCDigital/);
    assert.match(src, /window\.MCGiftShare/);
    assert.doesNotThrow(() => new Function(src));
  });

  it("beta.html apunta todos los scripts al cache de tk35", () => {
    const vers = [...beta.matchAll(/<script src="[^"]+\?v=([^"]+)"/g)].map((m) => m[1]);
    assert.ok(vers.length >= 20, "faltan scripts en beta.html");
    assert.ok(vers.every((v) => v === CACHE), "versiones mezcladas: " + [...new Set(vers)].join(", "));
    assert.match(beta, new RegExp(`mc-giftcards\\.js\\?v=${CACHE}`));
    assert.match(beta, new RegExp(`beta-screens\\.js\\?v=${CACHE}`));
  });
});
