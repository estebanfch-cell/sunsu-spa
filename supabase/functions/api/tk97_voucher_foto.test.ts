import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./inline_api.ts";
import "./tickets_beta_api.ts";
import "./pagos_caja_api.ts";
import { compsVivos, faltaDe } from "./tickets_beta_api.ts";
import type { Row } from "./domain.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const IMG = "data:image/jpeg;base64,AAAA";
const PDF = "data:application/pdf;base64,AAAA";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "rec", uid: "u-ale", rol: "recepcion", name: "Alejandra", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", rol: "admin" },
    { id: "u-ale", nombre: "Alejandra", rol: "recepcion" },
  ]);
  db.tables.set("tickets", [
    { id: 10, sheet_row: 10, so_num: "TK-SO-2001", beta_num: "", timestamp: "2026-11-17T15:00:00Z", nombre: "Ana", apellido: "Ruiz", atendido_por: "Alejandra", estimado: 80, cob: false, comp: "" },
  ]);
  for (const t of ["beta_pagos", "beta_caja_movimientos", "beta_caja_cierres", "log_acciones", "app_archivos", "beta_tickets", "solicitudes_cambio", "beta_ticket_lineas"]) db.tables.set(t, []);
  const h = (a: string, tok: string, p: Row = {}) =>
    handle(a, { token: tok, ...p }, { db, now: new Date("2026-11-17T22:00:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: tok } as never) as Promise<Row>;
  return { db, h };
}

describe("TK97 foto del voucher", () => {
  it("staff puede subir foto o PDF; se enlaza al registrar el pago; pg_ticket devuelve la miniatura", async () => {
    const { db, h } = semilla();
    assert.equal((await h("tk_subir_doc", "rec", { clave: "TK-SO-2001", imagen: "hola" })).error, "Sube una foto o PDF");
    const up = await h("tk_subir_doc", "rec", { clave: "TK-SO-2001", imagen: IMG });
    assert.equal(up.ok, true, JSON.stringify(up));
    assert.match(String(up.url), /^archivo:/);
    assert.equal(db.tables.get("app_archivos")!.length, 1);
    assert.equal((db.tables.get("log_acciones") || []).some((x) => String(x.accion) === "COMPROBANTE SUBIR"), true);

    const sinFoto = await h("pg_registrar", "rec", { clave: "TK-SO-2001", total: 80, metodo: "tarjeta", monto: 30, ref: "778" });
    assert.equal(sinFoto.ok, true, JSON.stringify(sinFoto));
    assert.equal(sinFoto.foto, up.url);
    const pago = db.tables.get("beta_pagos")!.find((p) => p.id === sinFoto.id)!;
    assert.equal(pago.comprobante_id, String(up.url).slice(8));

    const vista = await h("pg_ticket", "rec", { clave: "TK-SO-2001", total: 80 });
    assert.equal((vista.beta as Row[])[0].foto, up.url);
    const cab = db.tables.get("beta_tickets")!.find((c) => c.clave === "TK-SO-2001")!;
    const comps = compsVivos(cab.datos as Row);
    assert.equal(comps.length, 1);
    assert.equal(comps[0].pago_id, sinFoto.id);
  });

  it("PDF se acepta; el staff no borra directo; el admin sí; la solicitud aprobada también quita", async () => {
    const { db, h } = semilla();
    const up = await h("tk_subir_doc", "rec", { clave: "TK-SO-2001", imagen: PDF });
    assert.equal(up.ok, true, JSON.stringify(up));
    const no = await h("tk_quitar_doc", "rec", { clave: "TK-SO-2001", url: up.url });
    assert.equal(no.solicitud, true);
    assert.match(String(no.error), /Solicita la eliminación/);
    const cab0 = db.tables.get("beta_tickets")!.find((c) => c.clave === "TK-SO-2001")!;
    assert.equal(compsVivos(cab0.datos as Row).length, 1);

    const sol = await h("solicitud_crear", "rec", { tabla: "ticket_detalle", fila: "TK-SO-2001", tipo: "cambio", motivo: "voucher equivocado", propuestos: { quitar_comprobante: up.url } });
    assert.ok(sol.id, JSON.stringify(sol));
    const ap = await h("solicitud_resolver", "adm", { id: sol.id, aprobar: true });
    assert.equal(ap.ok === true || ap.estado === "aprobado", true, JSON.stringify(ap));
    const cab = db.tables.get("beta_tickets")!.find((c) => c.clave === "TK-SO-2001")!;
    assert.equal(compsVivos(cab.datos as Row).length, 0);

    const up2 = await h("tk_subir_doc", "rec", { clave: "TK-SO-2001", imagen: IMG });
    assert.equal((await h("tk_quitar_doc", "adm", { clave: "TK-SO-2001", url: up2.url })).ok, true);
    const cab2 = db.tables.get("beta_tickets")!.find((c) => c.clave === "TK-SO-2001")!;
    assert.equal(compsVivos(cab2.datos as Row).length, 0);
    assert.equal((db.tables.get("log_acciones") || []).some((x) => String(x.accion) === "COMPROBANTE QUITAR"), true);
  });

  it("la foto pendiente apaga el amarillo de transferencia", () => {
    const r = { timestamp: "2026-11-18T16:00:00", comp: "Trans:123", orig: {} };
    assert.ok(faltaDe(r, { comprobantes: [] }).some((x) => /comprobante/i.test(x)));
    assert.deepEqual(faltaDe(r, { comprobantes: [{ url: "archivo:abc" }] }), []);
    assert.ok(faltaDe(r, { comprobantes: [{ url: "archivo:abc", borrado: true }] }).some((x) => /comprobante/i.test(x)));
  });
});

describe("TK97 UI: un botón Voucher y ticket en blanco", () => {
  function src(name: string) {
    return readFileSync(resolve(root, name), "utf8");
  }
  it("un solo botón 📷 Voucher, sin atributo capture (el iPhone muestra Tomar foto / Fototeca / Archivos)", () => {
    for (const f of ["mc-caja.js", "mc-tickets.js", "beta-screens.js"]) {
      const s = src(f);
      const voucher = [...s.matchAll(/📷 Voucher<input[^>]*>/g)].map((m) => m[0]);
      assert.ok(voucher.length > 0, "falta 📷 Voucher en " + f);
      for (const tag of voucher) {
        assert.doesNotMatch(tag, /\bcapture\b/, "capture en " + f + ": " + tag);
        assert.match(tag, /accept="image\/\*,application\/pdf"/);
      }
    }
    const caja = src("mc-caja.js");
    assert.doesNotMatch(caja, /id="pg-cam"/);
    assert.doesNotMatch(caja, /📷 Tomar foto<input/);
    const tk = src("mc-tickets.js");
    assert.doesNotMatch(tk, /id="mctk-subir"/);
    assert.doesNotMatch(tk, /capture="environment"/);
  });

  it("+ / Nuevo ticket no reaplica un borrador de Migo; se limpia al abrir y al enviar", () => {
    const screens = src("beta-screens.js");
    const render = screens.match(/function renderTicket\(c\)\{[\s\S]{0,180}/);
    assert.ok(render, "renderTicket no encontrado");
    assert.doesNotMatch(render![0], /_migoAplicarPrefillAT/);
    assert.match(screens, /function _ticketNuevoEnBlanco/);
    assert.match(screens, /function _ticketAlAbrirFormulario/);
    assert.match(screens, /function _ticketAntesDeIr/);
    assert.match(screens, /sunsu\.form\.purga/);
    assert.match(screens, /_ticketAlAbrirFormulario\(\)/);
    assert.match(screens, /_ticketNuevoEnBlanco\(\)/);
    const html = src("index.html");
    assert.match(html, /_ticketAntesDeIr/);
    assert.match(html, /raw\.split\("\?"\)\[0\]/);
  });
});
