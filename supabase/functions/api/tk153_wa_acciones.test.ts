import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { DEFAULT_MATRIZ, redactar, type SesLite } from "./permisos.ts";
import {
  aplicarPlantilla,
  conPaqueteTicket,
  digitosWa,
  filtrarTipos,
  hayTelWa,
  mensajeDe,
  mezclarPlantillas,
  plantillasDefault,
  respuestaWa,
  tiposDeTicket,
  waUrls,
} from "./wa_lib.ts";

const root = new URL("../../../", import.meta.url);
const recep = (): SesLite => ({ rol: "recepcion", name: "Alejandra", short: "Ale", uid: "u-ale" });
const js = (name: string) => readFileSync(new URL(name, root), "utf8");

describe("TK153 WhatsApp: privacidad y resolución backend", () => {
  it("recepcion sin ver_telefonos no recibe telefono en tk_get, sí tiene_tel", () => {
    const out = redactar("tk_get", {
      ok: true,
      info: { nombre: "Ana", apellido: "P", telefono: "0991234567", tiene_tel: true },
      tiene_tel: true,
    }, recep(), DEFAULT_MATRIZ) as { info: Record<string, unknown>; tiene_tel: boolean };
    assert.equal(out.tiene_tel, true);
    assert.equal(out.info.tiene_tel, true);
    assert.equal(out.info.telefono, undefined);
    assert.ok(!("telefono" in out.info));
  });

  it("tk_historial tampoco deja el número a recepción, sí tiene_tel", () => {
    const out = redactar("tk_historial", {
      ok: true,
      items: [{ nombre: "Ana", telefono: "0991234567", tiene_tel: true }],
    }, recep(), DEFAULT_MATRIZ) as { items: { telefono?: string; tiene_tel: boolean }[] };
    assert.equal(out.items[0].tiene_tel, true);
    assert.equal(out.items[0].telefono, undefined);
  });

  it("wa_preparar devuelve wa_url y texto a recepción, nunca el número suelto", () => {
    const raw = respuestaWa({
      digitos: "0991234567",
      texto: "Hola Ana, te saludamos de Sunsu Spa!",
      tipos: ["facial", "paquete"],
      tipoMensaje: "combinado",
    });
    const out = redactar("wa_preparar", raw, recep(), DEFAULT_MATRIZ) as Record<string, unknown>;
    assert.equal(out.ok, true);
    assert.equal(out.tiene_tel, true);
    assert.match(String(out.wa_url), /^https:\/\/wa\.me\/5939\d{8}\?text=/);
    assert.match(String(out.wa_url_web), /web\.whatsapp\.com\/send\?phone=5939/);
    assert.ok(String(out.texto).includes("Hola Ana"));
    assert.ok(!("telefono" in out));
    assert.deepEqual(out.tipos_disponibles, ["facial", "paquete"]);
  });

  it("sin teléfono: tiene_tel false y no hay wa_url", () => {
    const out = respuestaWa({ digitos: "", texto: "Hola", tipos: ["facial"], tipoMensaje: "facial" });
    assert.equal(out.tiene_tel, false);
    assert.equal(out.wa_url, undefined);
  });

  it("digitosWa normaliza 09, 9 y +593 a 5939xxxxxxxx", () => {
    assert.equal(digitosWa("0991234567"), "593991234567");
    assert.equal(digitosWa("991234567"), "593991234567");
    assert.equal(digitosWa("+593 99 123 4567"), "593991234567");
    assert.equal(digitosWa("593991234567"), "593991234567");
    assert.ok(hayTelWa("991234567"));
    assert.equal(hayTelWa(""), false);
  });
});

describe("TK153 envío 1, 2 o 3 PDFs en un solo mensaje combinado", () => {
  it("tiposDeTicket detecta facial, paquete (compra/delTicket) y giftcard", () => {
    assert.deepEqual(tiposDeTicket({ facial_hecho: "PDRN" }), ["facial"]);
    assert.deepEqual(tiposDeTicket({ paqueteInfo: { compra: "PACK-01" } }), ["paquete"]);
    assert.deepEqual(tiposDeTicket({ paqueteInfo: { delTicket: [{ id: 1 }] } }), ["paquete"]);
    assert.ok(conPaqueteTicket({ compra: "x3" }));
    assert.ok(conPaqueteTicket({ delTicket: [{}] }));
    assert.ok(!conPaqueteTicket({}));
    assert.deepEqual(tiposDeTicket({ facial_hecho: "PDRN", paqueteInfo: { uso: "PACK-1" }, venta_gift: "SI, 26-1" }), ["facial", "paquete", "giftcard"]);
  });

  it("un documento usa su plantilla; dos o tres usan un solo mensaje combinado", () => {
    const p = plantillasDefault();
    const uno = mensajeDe(["facial"], p, { cliente: "Ana" });
    assert.equal(uno.tipoMensaje, "facial");
    assert.match(uno.texto, /tarjeta de tu tratamiento/i);
    const dos = mensajeDe(["facial", "paquete"], p, { cliente: "Ana", usados: 1, total: 6 });
    assert.equal(dos.tipoMensaje, "combinado");
    assert.match(dos.texto, /tratamiento y el control de tu paquete/i);
    const tres = mensajeDe(["facial", "paquete", "giftcard"], p, { cliente: "Ana", giftcard: "26-010" });
    assert.equal(tres.tipoMensaje, "combinado");
    assert.ok(tres.texto.includes("gift card") || tres.texto.includes("tratamiento y el control"));
    assert.deepEqual(filtrarTipos(["facial", "paquete", "giftcard"], ["facial", "giftcard"]), ["facial", "giftcard"]);
  });

  it("plantillas guardadas en configuración se leen y pisan el default", () => {
    const m = mezclarPlantillas({ "MENSAJE GIFT CARD": "Hola {cliente}, tu gift {giftcard} te espera en Sunsu." });
    const msg = mensajeDe(["giftcard"], m, { cliente: "Ana", giftcard: "26-010" });
    assert.equal(msg.texto, "Hola Ana, tu gift 26-010 te espera en Sunsu.");
    assert.equal(aplicarPlantilla("Hola {cliente}", { cliente: "Emi" }), "Hola Emi");
    const urls = waUrls("0991234567", "Hola");
    assert.ok(urls.wa_url.startsWith("https://wa.me/593991234567"));
  });
});

describe("TK153 UI: Acciones, ícono WA y circulitos rojo/verde", () => {
  it("CSS del dropdown Acciones queda en una sola línea y con ancho suficiente", () => {
    const css = js("mc-tickets.js");
    assert.match(css, /min-width:\s*250px/);
    assert.match(css, /width:\s*max-content/);
    assert.match(css, /max-width:\s*calc\(100vw - 24px\)/);
    assert.match(css, /\.mctk-dd a,\s*\.mctk-dd button[\s\S]*white-space:\s*nowrap/);
    assert.match(css, /display:\s*flex;\s*align-items:\s*center;\s*gap:\s*8px/);
    assert.doesNotMatch(css, /\.mctk-dd \.mctk-voucher\{[^}]*white-space:normal!important/);
  });

  it("WA_ICON_SVG está en el helper y se usa en lista, Acciones y gift cards", () => {
    const wa = js("mc-wa.js");
    assert.match(wa, /WA_ICON_SVG/);
    assert.match(wa, /#25D366/);
    assert.match(wa, /viewBox="0 0 24 24"/);
    const tk = js("mc-tickets.js");
    assert.match(tk, /WA_ICON_SVG/);
    assert.match(tk, /Enviar reporte facial/);
    assert.match(tk, /Enviar reporte de paquete/);
    assert.match(tk, /Abrir chat/);
    assert.match(tk, /SunsuWa\.flujo/);
    assert.doesNotMatch(tk, /prompt\("No hay teléfono en la ficha/);
    const lista = js("beta-screens.js");
    assert.match(lista, /_histWaHTML/);
    assert.match(lista, /mob-wa/);
    assert.doesNotMatch(lista, /📷✓/);
    const gift = js("mc-giftcards.js");
    assert.match(gift, /WA_ICON_SVG/);
  });

  it("circulitos de camarita y WhatsApp tienen borde rojo/verde y no llevan check", () => {
    const html = js("index.html");
    assert.match(html, /\.mob-cam,\s*\.mob-wa/);
    assert.match(html, /border:\s*2px solid #DC2626/);
    assert.match(html, /\.mob-cam\.ok,\s*\.mob-wa\.ok[^}]*#16A34A/);
    assert.match(html, /border-radius:\s*50%/);
    assert.match(html, /mc-wa\.js\?v=20261120tk178/);
    assert.match(html, /Mensajes de WhatsApp/);
    assert.match(html, /wa_tpl_facial|MENSAJE TARJETA TRATAMIENTO/);
    assert.match(html, /sunsu-2026-11-20-TK183/);
    const lista = js("beta-screens.js");
    assert.match(lista, /_histActsHTML/);
    assert.doesNotMatch(lista, /listo\?'📷✓':'📷'/);
  });

  it("no se otorga ver_telefonos a recepción ni cosmetóloga", () => {
    const api = js("supabase/functions/api/wa_api.ts") + js("supabase/functions/api/permisos.ts");
    assert.doesNotMatch(api, /ver_telefonos["']?\s*:\s*["']todos["']/);
    assert.match(js("supabase/functions/api/tickets_beta_api.ts"), /tiene_tel/);
    assert.match(js("supabase/functions/api/tickets_lista_api.ts"), /beta_clientes/);
  });
});
