// TK220: aviso de posible duplicado, dedupe más fuerte y confirmación al crear.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./tickets_lista_api.ts";
import "./tk_dup_api.ts";
import type { Row } from "./domain.ts";
import type { Ctx } from "./lib.ts";
import {
  avisosDuplicado, esGemeloTicket, mensajeTicketParecido, ticketParecido, ticketRecienCreado,
  VENTANA_TICKET_DUP_MS, VENTANA_TICKET_PARECIDO_MS,
} from "./ticket_idempotencia.ts";

const root = new URL("../../../", import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root), "utf8");
const CACHE = "sunsu-2026-11-25-TK221";

describe("TK220 · dedupe más fuerte", () => {
  const nicole: Row = {
    so_num: "TK-SO-1977", id_3: "1750022905", nombre: "Nicole", apellido: "Luzuriaga",
    facial_hecho: "SUNSU-02 Facial Reparación", servicios_adicionales: "SUNSU-14 Ampolla Especial Hidratación",
    estimado: 75, paquete: "", atendido_por: "Evelyn Anabel Toapanta Quishpe",
    created_at: "2026-11-23T23:57:52.778Z", origin: "beta", orig: {},
  };
  const altaNicole: Row = {
    cedula: "1750022905", nombre: "Nicole", apellido: "Luzuriaga",
    facial: "SUNSU-02 Facial Reparación", extras: "SUNSU-14 Ampolla Especial Hidratación",
    estimado: 75, colQ: "", productos: {}, cosmetologa: "Evelyn Anabel Toapanta Quishpe",
  };
  it("a los 2 min 9 s se devuelve el ticket ya creado (cierra el hueco de 2 min)", () => {
    const now = new Date("2026-11-24T00:00:01.624Z");
    const hit = ticketRecienCreado([nicole], altaNicole, now);
    assert.ok(hit);
    assert.equal(hit!.so_num, "TK-SO-1977");
  });
  it("Fabiola a los 6 min con $1.46 de diferencia también es gemela", () => {
    const a: Row = {
      so_num: "TK-SO-1932", id_3: "1711111111", nombre: "Fabiola", apellido: "Pazmiño",
      facial_hecho: "SUNSU-40 Facial Reset 3x1", servicios_adicionales: "SUNSU-31 PDRN Serum",
      estimado: 44.996, atendido_por: "Daniela Mora", created_at: "2026-11-19T21:39:43.697Z", origin: "beta", orig: {},
    };
    const p: Row = {
      cedula: "1711111111", nombre: "Fabiola", apellido: "Pazmiño",
      facial: "SUNSU-40 Facial Reset 3x1", extras: "SUNSU-31 PDRN Serum",
      estimado: 46.46, productos: {}, cosmetologa: "Daniela Mora",
    };
    assert.equal(esGemeloTicket(p, a), true);
    const now = new Date("2026-11-19T21:46:05.406Z");
    assert.ok(ticketRecienCreado([a], p, now));
  });
  it("a los 25 min pide confirmación; a las 3 h ya no", () => {
    const now25 = new Date(Date.parse(String(nicole.created_at)) + 25 * 60 * 1000);
    assert.equal(ticketRecienCreado([nicole], altaNicole, now25), null);
    const par = ticketParecido([nicole], altaNicole, now25);
    assert.ok(par);
    assert.equal(par!.ticket.so_num, "TK-SO-1977");
    assert.match(mensajeTicketParecido("TK-SO-1977", par!.haceMin), /Ya existe un ticket parecido de esta clienta hace 25 min \(TK-SO-1977\), ¿crear igual\?/);
    const tarde = new Date(Date.parse(String(nicole.created_at)) + VENTANA_TICKET_PARECIDO_MS + 1000);
    assert.equal(ticketParecido([nicole], altaNicole, tarde), null);
    assert.ok(VENTANA_TICKET_DUP_MS > 2 * 60 * 1000);
  });
  it("un ticket cancelado no cuenta", () => {
    const now = new Date("2026-11-24T00:00:01.624Z");
    const canc = { ...nicole, orig: { anulado: true, cancelado: true } };
    assert.equal(ticketRecienCreado([canc], altaNicole, now), null);
    assert.equal(ticketParecido([canc], altaNicole, now), null);
  });
});

describe("TK220 · aviso Posible duplicado", () => {
  it("marca el par activo y respeta si se descartó el aviso", () => {
    const a: Row = {
      so_num: "TK-SO-1977", id_3: "1750022905", nombre: "Nicole", apellido: "Luzuriaga",
      facial_hecho: "SUNSU-02 Facial Reparación", servicios_adicionales: "SUNSU-14 Ampolla Especial Hidratación",
      estimado: 75, created_at: "2026-11-23T23:57:52.778Z", origin: "beta", orig: {},
    };
    const b: Row = {
      so_num: "TK-SO-1978", id_3: "1750022905", nombre: "Nicole", apellido: "Luzuriaga",
      facial_hecho: "SUNSU-02 Facial Reparación", servicios_adicionales: "SUNSU-14 Ampolla Especial Hidratación",
      estimado: 75, created_at: "2026-11-24T00:00:01.624Z", origin: "beta", orig: {},
    };
    const av = avisosDuplicado([a, b]);
    assert.equal(av.get("TK-SO-1977")?.con, "TK-SO-1978");
    assert.equal(av.get("TK-SO-1978")?.con, "TK-SO-1977");
    assert.equal(av.get("TK-SO-1977")?.hace_min, 2);
    const cabs = new Map<string, Row>([["TK-SO-1977", { clave: "TK-SO-1977", datos: { dup_ok: ["TK-SO-1978"] } }], ["TK-SO-1978", { clave: "TK-SO-1978", datos: { dup_ok: ["TK-SO-1977"] } }]]);
    assert.equal(avisosDuplicado([a, b], { datosPorClave: cabs }).size, 0);
    const sheet = { ...b, so_num: "TK-SO-0100", origin: "sheet" };
    assert.equal(avisosDuplicado([a, sheet]).size, 0);
  });

  function semilla() {
    const db = new MemoryDb();
    db.tables.set("sesiones", [
      { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
      { token: "vis", uid: "visor1", rol: "visor", name: "Visor Skin", short: "Visor", exp: "2099-01-01T00:00:00.000Z" },
    ]);
    db.tables.set("usuarios", [
      { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin" },
      { id: "visor1", nombre: "Visor Skin", short: "Visor", rol: "visor" },
    ]);
    db.tables.set("tickets", [
      {
        id: 646277, so_num: "TK-SO-1977", beta_num: "TK-20261123-1622", timestamp: "2026-11-23T18:57:43Z",
        created_at: "2026-11-23T23:57:52.778Z", origin: "beta", nombre: "Nicole", apellido: "Luzuriaga",
        id_3: "1750022905", estimado: 75, facial_hecho: "SUNSU-02 Facial Reparación",
        servicios_adicionales: "SUNSU-14 Ampolla Especial Hidratación", atendido_por: "Evelyn Anabel Toapanta Quishpe",
        orig: {}, cob: false, fac: false,
      },
      {
        id: 646278, so_num: "TK-SO-1978", beta_num: "TK-20261123-1623", timestamp: "2026-11-23T18:59:53Z",
        created_at: "2026-11-24T00:00:01.624Z", origin: "beta", nombre: "Nicole", apellido: "Luzuriaga",
        id_3: "1750022905", estimado: 75, facial_hecho: "SUNSU-02 Facial Reparación",
        servicios_adicionales: "SUNSU-14 Ampolla Especial Hidratación", atendido_por: "Evelyn Anabel Toapanta Quishpe",
        orig: {}, cob: false, fac: false,
      },
    ]);
    db.tables.set("beta_tickets", [
      { clave: "TK-SO-1977", datos: { telefono: "0988888888" }, historial: [] },
      { clave: "TK-SO-1978", datos: {}, historial: [] },
    ]);
    for (const t of [
      "beta_cuadre_link", "beta_ticket_flags", "beta_ticket_cancelados", "beta_ticket_lineas",
      "beta_ticket_envios", "beta_pagos", "log_acciones", "app_modulos", "beta_migo_facturas_vivo",
      "beta_clientes", "clientas_registro", "solicitudes_cambio",
    ]) if (!db.tables.has(t)) db.tables.set(t, []);
    const ctx = { db, now: new Date("2026-11-24T17:10:00-05:00"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" } as unknown as Ctx;
    const h = (tok: string, a: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...ctx, token: tok } as never) as Promise<Row>;
    return { db, h };
  }

  it("la lista y el detalle muestran el aviso, sin teléfonos, y el visor no descarta", async () => {
    const { h, db } = semilla();
    const lista = await h("adm", "tk_historial", { desde: "2026-11-23", hasta: "2026-11-23", limit: 50 });
    assert.equal(lista.ok, true);
    const items = (lista.items as Row[]) || [];
    const a = items.find((x) => s(x.so_num) === "TK-SO-1977");
    const b = items.find((x) => s(x.so_num) === "TK-SO-1978");
    assert.ok(a && b);
    assert.equal((a!.posible_duplicado as Row).con, "TK-SO-1978");
    assert.equal((b!.posible_duplicado as Row).con, "TK-SO-1977");
    assert.equal(/0988888888/.test(JSON.stringify(lista)), false);

    const vis = await h("vis", "tk_dup_descartar", { clave: "TK-SO-1978", con: "TK-SO-1977" });
    assert.match(String(vis.error || ""), /admin|visor|permiso|Solo/i);

    const ok = await h("adm", "tk_dup_descartar", { clave: "TK-SO-1978", con: "TK-SO-1977" });
    assert.equal(ok.ok, true);
    const lista2 = await h("adm", "tk_historial", { desde: "2026-11-23", hasta: "2026-11-23", limit: 50 });
    const items2 = (lista2.items as Row[]) || [];
    assert.ok(items2.every((x) => !x.posible_duplicado));
    const log = (await db.all("log_acciones")).map((x) => s(x.accion) + " " + s(x.detalle)).join("\n");
    assert.match(log, /DESCARTAR AVISO DUPLICADO/);
  });
});

describe("TK220 · alta de ticket", () => {
  it("pide confirmación a los 25 min y, si confirman, deja crear", async () => {
    const previo: Row = {
      id: 646277, so_num: "TK-SO-1977", beta_num: "TK-20261123-1622",
      timestamp: "2026-11-23T18:57:43Z", created_at: "2026-11-23T23:57:52.778Z", origin: "beta",
      nombre: "Nicole", apellido: "Luzuriaga", id_3: "1750022905", estimado: 75,
      facial_hecho: "SUNSU-02 Facial Reparación", servicios_adicionales: "SUNSU-14 Ampolla Especial Hidratación",
      atendido_por: "Evelyn Anabel Toapanta Quishpe", orig: {},
    };
    const db = new MemoryDb();
    db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin" }]);
    db.tables.set("tickets", [previo]);
    for (const t of ["beta_tickets", "beta_migo_borradores", "log_acciones", "app_modulos"]) if (!db.tables.has(t)) db.tables.set(t, []);
    const payload: Row = {
      cedula: "1750022905", nombre: "Nicole", apellido: "Luzuriaga",
      facial: "SUNSU-02 Facial Reparación", extras: "SUNSU-14 Ampolla Especial Hidratación",
      estimado: 75, cosmetologa: "Evelyn Anabel Toapanta Quishpe",
    };
    const h = (now: string, p: Row = {}) => {
      const ctx = { db, now: new Date(now), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" } as unknown as Ctx;
      return handle("crearTicket", { token: "adm", ...payload, ...p }, ctx as never) as Promise<Row>;
    };
    const sil = await h("2026-11-24T00:00:01.624Z");
    assert.equal(sil.ok, true);
    assert.equal(sil.duplicado, true);
    assert.equal(sil.so_num, "TK-SO-1977");
    assert.equal((await db.all("tickets")).length, 1);

    const conf = await h("2026-11-24T00:22:00Z");
    assert.equal(conf.ok, false);
    assert.equal(conf.requiere, "confirmar_duplicado");
    assert.equal(conf.so_num, "TK-SO-1977");
    assert.match(String(conf.mensaje), /¿crear igual\?/);
    assert.equal((await db.all("tickets")).length, 1);
    assert.equal(/0988888888|telefono/.test(JSON.stringify(conf)), false);

    const crea = await h("2026-11-24T00:22:00Z", { confirmar_duplicado: true });
    assert.equal(crea.error || "", "");
    assert.equal(crea.ok, true);
    assert.equal(crea.duplicado, undefined);
    assert.ok(String(crea.so_num || crea.ticket || crea.beta_num));
    assert.ok((await db.all("tickets")).length >= 2);
  });
});

describe("TK220 · UI y caché", () => {
  it("la lista, el detalle y el alta muestran el aviso y la confirmación, sin la palabra ligar", () => {
    const js = file("beta-screens.js");
    const mc = file("mc-tickets.js");
    assert.match(js, /Posible duplicado/);
    assert.match(js, /_histDupCancelar/);
    assert.match(js, /_histDupDescartar/);
    assert.match(js, /tk_dup_descartar/);
    assert.match(mc, /requiere === "confirmar_duplicado"/);
    assert.match(mc, /Ya existe un ticket parecido de esta clienta/);
    assert.match(mc, /¿crear igual\?/);
    assert.match(mc, /mctk-dup-cancel/);
    assert.match(mc, /Posible duplicado/);
    const ui = js + mc;
    const visibles = ui.match(/["'`][^"'`]*ligar[^"'`]*/gi) || [];
    const userFacing = visibles.filter((x) => /Ligar |ligar factura|botón ligar|«ligar»/i.test(x) && !/function|SunsuLigar|_histLigar|mctk-ligar|ligarBtn|ligar-fac/.test(x));
    assert.deepEqual(userFacing, []);
  });
  it("la caché de la página coincide con el service worker TK220", () => {
    const html = file("index.html");
    const sw = file("sw.js");
    const enHtml = (html.match(/window\.SUNSU_CACHE = "([^"]+)"/) || [])[1];
    const enSw = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
    assert.equal(enHtml, enSw);
    assert.equal(enSw, CACHE);
  });
});

function s(v: unknown): string { return v == null ? "" : String(v); }
