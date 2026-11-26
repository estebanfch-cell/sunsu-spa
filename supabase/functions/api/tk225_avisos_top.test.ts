// TK225 (Emilia): avisos compactos ARRIBA del Dashboard (no abajo),
// el aviso del 50% entra en esa lista, × persistente por usuario, y se apaga el 7 dic 2026.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./conteo_fisico_api.ts";
import { avisoTardeActivo, AVISO_TARDE_HASTA, AVISO_TARDE_ID, AVISO_TARDE_TEXTO } from "./fecha_atencion.ts";
import type { Row } from "./domain.ts";
import type { Ctx } from "./lib.ts";

const root = new URL("../../../", import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root), "utf8");

function ctxDe(db: MemoryDb, now: string): Ctx {
  return { db, now: new Date(now), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}) } as unknown as Ctx;
}

function semilla(now = "2026-11-26T07:54:00-05:00") {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
    { token: "and", uid: "u-and", rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "emi", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "u-and", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
  ]);
  db.tables.set("app_usuarios", []);
  db.tables.set("beta_notificaciones", []);
  db.tables.set("solicitudes_cambio", []);
  db.tables.set("permisos", []);
  db.tables.set("beta_conteos", []);
  db.tables.set("log_acciones", []);
  db.tables.set("beta_ticket_cancelados", []);
  db.tables.set("tickets", []);
  db.tables.set("beta_tickets", []);
  const c = ctxDe(db, now);
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok } as never) as Promise<Row>;
  return { db, h, c };
}

describe("TK225 · aviso del 50% en notif_mias", () => {
  it("sigue activo el 6 dic 2026 (Ecuador) y se apaga el 7", () => {
    assert.equal(AVISO_TARDE_HASTA, "2026-12-06");
    assert.equal(AVISO_TARDE_ID, "aviso:tarde-2026-12-06");
    assert.equal(avisoTardeActivo("2026-12-06"), true);
    assert.equal(avisoTardeActivo("2026-12-07"), false);
    assert.equal(avisoTardeActivo("2026-11-26"), true);
  });

  it("aparece para admin y personal mientras dura la ventana", async () => {
    const { h } = semilla("2026-11-26T07:54:00-05:00");
    for (const tok of ["adm", "and"]) {
      const r = await h("notif_mias", tok);
      const it = ((r.items || []) as Row[]).find((x) => x.id === AVISO_TARDE_ID);
      assert.ok(it, "debe listarse para " + tok);
      assert.equal(it!.tipo, "aviso_equipo");
      assert.equal(it!.titulo, AVISO_TARDE_TEXTO);
      assert.equal(it!.leida, false);
    }
  });

  it("el último día (6 dic) aún se lista; el 7 dic ya no", async () => {
    const a = semilla("2026-12-06T23:30:00-05:00");
    const r6 = await a.h("notif_mias", "and");
    assert.ok(((r6.items || []) as Row[]).some((x) => x.id === AVISO_TARDE_ID));
    const b = semilla("2026-12-07T00:05:00-05:00");
    const r7 = await b.h("notif_mias", "and");
    assert.ok(!((r7.items || []) as Row[]).some((x) => x.id === AVISO_TARDE_ID));
  });

  it("notif_leer de aviso: guarda un acuse por usuario y no reaparece para esa persona", async () => {
    const { db, h } = semilla();
    await h("notif_leer", "adm", { id: AVISO_TARDE_ID });
    const acuses = (db.tables.get("beta_notificaciones") || []).filter((x) => String(x.ref_id) === AVISO_TARDE_ID && String(x.usuario) === "emi");
    assert.equal(acuses.length, 1);
    assert.ok(acuses[0].leida_at);
    assert.equal(acuses[0].tipo, "aviso_equipo");
    const despues = await h("notif_mias", "adm");
    assert.ok(!((despues.items || []) as Row[]).some((x) => !x.leida && x.id === AVISO_TARDE_ID));
    const otra = await h("notif_mias", "and");
    assert.ok(((otra.items || []) as Row[]).some((x) => !x.leida && x.id === AVISO_TARDE_ID), "otra persona sigue viéndolo");
  });
});

describe("TK225 · UI: compactos arriba, sin banner grande", () => {
  it("los avisos van al inicio de .dsh-wrap, clamp de 2 líneas, toque para ampliar", () => {
    const html = file("index.html");
    assert.match(html, /homeFail \+ avisosHead \+ pulso \+ ops/);
    assert.doesNotMatch(html, /homeFail \+ pulso \+ ops \+ avisosFoot/);
    assert.match(html, /insertAdjacentHTML\("afterbegin"/);
    assert.doesNotMatch(html, /else root\.insertAdjacentHTML\("beforeend"/);
    assert.match(html, /-webkit-line-clamp: 2/);
    assert.match(html, /dash-av-it\.exp/);
    assert.match(html, /row\.classList\.toggle\("exp"\)/);
    assert.match(html, /montarAvisosDash\(c\)/);
    assert.match(html, /montarAvisosDash\(main\)/);
  });

  it("mc-aviso-tarde ya no inyecta el banner grande en el Dashboard", () => {
    const js = file("mc-aviso-tarde.js");
    assert.match(js, /querySelectorAll\("\.sunsu-aviso-tarde"\)/);
    assert.match(js, /\.forEach\(function \(el\) \{ el\.remove\(\); \}\)/);
    assert.doesNotMatch(js, /insertBefore\(tmp\.firstChild/);
    assert.ok(js.includes(AVISO_TARDE_TEXTO));
    assert.ok(js.includes('"' + AVISO_TARDE_HASTA + '"'));
  });

  it("cache y scripts al día", () => {
    const html = file("index.html");
    const sw = file("sw.js");
    assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-26-PDFTODAS"/);
    assert.match(sw, /const CACHE = "sunsu-2026-11-26-PDFTODAS"/);
    assert.match(html, /beta-screens\.js\?v=20261126pdftodas/);
    assert.match(html, /mc-aviso-tarde\.js\?v=20261126tk225/);
  });
});
