import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(join(root, "beta.html"), "utf8");
const media = html.split("@media (max-width: 860px)")[1] || "";
const nav = readFileSync(join(root, "mc-nav.js"), "utf8");
const ap = readFileSync(join(root, "mc-aperturas.js"), "utf8");
const inline = readFileSync(join(root, "supabase/functions/api/inline_api.ts"), "utf8");
const asis = readFileSync(join(root, "supabase/functions/api/asistencia_api.ts"), "utf8");

describe("TK103 vista de celular", () => {
  it("cámara y ubicación se piden una vez por sesión", () => {
    assert.match(html, /const SunsuMedia = window\.SunsuMedia/);
    assert.match(html, /SunsuMedia\.camara\("user"\)/);
    assert.match(html, /watchPosition/);
    assert.match(html, /SunsuMedia\.posicion\(\)/);
    assert.doesNotMatch(html, /maximumAge:\s*0\b/);
    const parar = html.split("function pararCamara()")[1].split("\n}")[0];
    assert.doesNotMatch(parar, /\.stop\(\)/, "pararCamara no corta las pistas (iOS volvería a preguntar)");
    assert.match(ap, /SunsuMedia\.camara\("environment"\)/);
    const getUM = (html.match(/getUserMedia\(/g) || []).length;
    assert.equal(getUM, 1, "un solo getUserMedia en beta.html (dentro de SunsuMedia)");
    assert.match(html, /SunsuMedia\.reset\(\)/);
  });

  it("Marcar entrada solo en el menú +; en el celular no va en el encabezado", () => {
    assert.match(media, /\.reloj-head\s*\{\s*display:\s*none !important/);
    assert.match(nav, /📷 Registrar entrada/);
  });

  it("campana con aviso en lugar de Solicitudes en el celular", () => {
    assert.match(html, /id="btn-notificaciones"/);
    assert.match(html, /id="notif-badge"/);
    assert.match(media, /\.top-sol-desk\s*\{\s*display:\s*none !important/);
    assert.match(html, /function abrirNotificaciones/);
    assert.match(html, /api\("notif_mias"/);
    assert.match(html, /route\.mod === "solicitudes"\) return renderMisSolicitudes\(\)/);
    assert.match(nav, /"Mis solicitudes", "#\/m\/solicitudes"/);
    assert.match(inline, /Solicitud aprobada/);
    assert.match(inline, /Solicitud rechazada/);
    assert.match(asis, /Permiso aprobado/);
  });

  it("logo chico, sin recuadro blanco", () => {
    const logo = media.split(".top .logo-hit {")[1].split("}")[0];
    assert.match(logo, /background:\s*transparent/);
    assert.match(media, /\.top \.logo-hit img \{ height: 18px/);
  });
});
