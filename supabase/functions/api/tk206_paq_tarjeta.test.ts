import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { huellaAltaTicket, ticketRecienCreado, VENTANA_TICKET_DUP_MS } from "./ticket_idempotencia.ts";
import type { Row } from "./domain.ts";

describe("TK206 · tarjeta de paquete lee usado/fecha y u/f", () => {
  it("usosDe expone u/f además de usado/fecha", () => {
    const src = readFileSync(new URL("./handlers.ts", import.meta.url), "utf8");
    assert.match(src, /return \{ usado, fecha, u: usado, f: fecha \}/);
  });
  it("window.api y el PDF normalizan usos; un paquete completado hoy sigue ofreciéndose", () => {
    const idx = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    assert.match(idx, /getSeguimientoPaquetes[\s\S]*u: hecho[\s\S]*f: txt/);
    const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    assert.match(js, /function _usoHecho/);
    assert.match(js, /function _normUsosPaq/);
    assert.match(js, /p\.usos=_normUsosPaq\(p\.usos\)/);
    assert.match(js, /var rawF=_usoTxt\(uso\)/);
    assert.match(js, /paqHoy\|\|paqsCli\.filter/);
    assert.match(js, /function _cedClavePaq/);
  });
  it("la caché de la página coincide con el service worker TK207", () => {
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    const sw = readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
    const enHtml = (html.match(/window\.SUNSU_CACHE = "([^"]+)"/) || [])[1];
    const enSw = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
    assert.equal(enHtml, enSw);
    assert.equal(enSw, "sunsu-2026-11-25-DEV31M");
  });
});

describe("TK206 · no se crea un ticket gemelo en 2 minutos", () => {
  const base: Row = {
    cedula: "1750022905", facial: "SUNSU-02 Facial Reparación", estimado: 14.996,
    colQ: "SI, 2/3", extras: "SUNSU-15 Ampolla Especial · Purificación",
    productos: {}, cosmetologa: "Daniela Mora",
  };
  const previo: Row = {
    so_num: "TK-SO-1967", beta_num: "TK-20261121-1612", id_3: "1750022905",
    facial_hecho: "SUNSU-02 Facial Reparación", estimado: 14.996,
    paquete: "SI, 2/3", servicios_adicionales: "SUNSU-15 Ampolla Especial · Purificación",
    atendido_por: "Daniela Mora", created_at: "2026-11-21T23:06:53.202Z",
  };
  it("la misma huella a los 25 s devuelve el ticket anterior", () => {
    assert.equal(huellaAltaTicket(base), huellaAltaTicket({
      cedula: previo.id_3, facial: previo.facial_hecho, estimado: previo.estimado,
      colQ: previo.paquete, extras: previo.servicios_adicionales,
    }));
    const now = new Date("2026-11-21T23:07:18.149Z");
    const hit = ticketRecienCreado([previo], base, now);
    assert.ok(hit);
    assert.equal(hit!.so_num, "TK-SO-1967");
  });
  it("pasada la ventana, o con otro facial, no es duplicado", () => {
    const tarde = new Date(Date.parse(String(previo.created_at)) + VENTANA_TICKET_DUP_MS + 1000);
    assert.equal(ticketRecienCreado([previo], base, tarde), null);
    const otro = ticketRecienCreado([previo], { ...base, facial: "SUNSU-42 Facial Peeling Marino de Perla" }, new Date("2026-11-21T23:07:18Z"));
    assert.equal(otro, null);
  });
  it("el caso de Nicole (2 min 9 s, mismo total e ítems) ya no se cuela", () => {
    const a: Row = {
      so_num: "TK-SO-1977", id_3: "1750000001", facial_hecho: "SUNSU-02 Facial Reparación", estimado: 75,
      paquete: "", servicios_adicionales: "SUNSU-14 Ampolla Especial Hidratación",
      atendido_por: "Evelyn Anabel Toapanta Quishpe", created_at: "2026-11-23T23:57:52.778Z",
      nombre: "Nicole", apellido: "Luzuriaga",
    };
    const p: Row = {
      cedula: "1750000001", facial: "SUNSU-02 Facial Reparación", estimado: 75,
      colQ: "", extras: "SUNSU-14 Ampolla Especial Hidratación", productos: {},
      cosmetologa: "Evelyn Anabel Toapanta Quishpe", nombre: "Nicole", apellido: "Luzuriaga",
    };
    const now = new Date("2026-11-24T00:00:01.624Z");
    assert.ok(ticketRecienCreado([a], p, now));
  });
  it("el envío del ticket bloquea un segundo toque y muestra el duplicado", () => {
    const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    assert.match(js, /window\._envEnviando/);
    assert.match(js, /d&&d\.duplicado/);
  });
});
