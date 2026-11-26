// TK217: al confirmar citas (y recordatorios / tickets) WhatsApp debe abrir en una
// pestaña nueva. Antes, si el enlace se armaba después de un await, el navegador
// bloqueaba window.open y el fallback location.href sacaba al staff de la app.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const file = (f: string) => readFileSync(join(root, f), "utf8");
const CACHE = "sunsu-2026-11-26-TK226";

describe("TK217 WhatsApp abre en pestaña nueva (citas, recordatorios, tickets)", () => {
  const agenda = file("mc-agenda.js");
  const wa = file("mc-wa.js");
  const tickets = file("mc-tickets.js");
  const screens = file("beta-screens.js");
  const html = file("index.html");
  const sw = file("sw.js");

  it("caché TK217 alineada en index.html y sw.js", () => {
    assert.match(sw, new RegExp(`const CACHE = "${CACHE}"`));
    assert.match(html, new RegExp(`window\\.SUNSU_CACHE = "${CACHE}"`));
  });

  it("agenda reserva la ventana en el click, antes del await de ag_wa", () => {
    assert.match(agenda, /var vent = reservarWa\(\);\s*var rwa = await api\("ag_wa"/);
    assert.match(agenda, /abrirWaUrl\(rwa, vent\)/);
    assert.match(agenda, /function reservarWa\(\)/);
    assert.doesNotMatch(agenda, /window\.location\.href\s*=\s*u/);
    assert.match(agenda, /window\.SunsuWa && typeof window\.SunsuWa\.reservarVentana/);
  });

  it("SunsuWa reserva ventana para recordatorio/chat y no navega esta pestaña", () => {
    assert.match(wa, /function reservarVentana\(\)/);
    assert.match(wa, /function abrirEnlace\(u, vent\)/);
    assert.match(wa, /var vent = \(tipo === "chat" \|\| tipo === "recordatorio"\) \? reservarVentana\(\) : null;/);
    assert.match(wa, /if \(!abrirUrl\(prep, vent\)\) aviso\(/);
    assert.match(wa, /var abierto = abrirUrl\(prep, vent\);/);
    assert.match(wa, /w\.MCWa = w\.SunsuWa;/);
    assert.doesNotMatch(wa, /window\.location\.href\s*=\s*u/);
    assert.match(wa, /a\.target = "_blank"/);
  });

  it("tickets y beta-screens ya no hacen location.href al fallar window.open de WhatsApp", () => {
    assert.doesNotMatch(tickets, /if\s*\(!w\)\s*location\.href\s*=\s*u/);
    assert.doesNotMatch(screens, /window\.location\.href\s*=\s*_u/);
    assert.doesNotMatch(screens, /window\.location\.href\s*=\s*_uWa/);
    assert.doesNotMatch(screens, /window\.location\.href\s*=\s*wURL/);
    assert.match(screens, /function _abrirWaPestana\(/);
    assert.match(screens, /function _reservarWaPestana\(/);
    assert.match(screens, /_abrirWaPestana\(url\)/);
    assert.match(screens, /var ventWa=telAmb\?_reservarWaPestana\(\):null;/);
    assert.match(screens, /_abrirWaPestana\(wURL, ventWa\)/);
  });

  it("no se tocó el LED de WhatsApp ni digitosWa", () => {
    assert.match(screens, /window\._tkLeds\s*=\s*window\._tkLeds\s*\|\|\s*\{\}/);
    assert.match(screens, /function _tkLedsHTML\(/);
    const waApi = file("supabase/functions/api/wa_api.ts");
    const waLib = file("supabase/functions/api/wa_lib.ts");
    assert.match(waApi, /import \{[^}]*\bdigitosWa\b[^}]*\} from "\.\/wa_lib\.ts"/);
    assert.match(waLib, /export function digitosWa/);
  });
});
