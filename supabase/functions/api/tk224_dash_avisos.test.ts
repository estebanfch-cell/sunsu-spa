// TK224 (Emilia t946u): dashboard al instante, avisos compactos abajo, × persistente,
// y los avisos de tickets ya resueltos se apagan solos.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./conteo_fisico_api.ts";
import "./tickets_cancelar_api.ts";
import { avisoSigueVigente, cerrarSolicitudesTicketInactivo } from "./avisos_auto.ts";
import { avisosVirtualesEdicion } from "./ticket_edicion_api.ts";
import type { Row } from "./domain.ts";
import type { Ctx } from "./lib.ts";

const root = new URL("../../../", import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root), "utf8");

function ctxDe(db: MemoryDb, now = "2026-11-26T07:40:00-05:00"): Ctx {
  return { db, now: new Date(now), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}) } as unknown as Ctx;
}

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "emi", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "efch", nombre: "EFCH", short: "EFCH", rol: "admin", bloqueado: false },
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
  const c = ctxDe(db);
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok } as never) as Promise<Row>;
  return { db, h, c };
}

describe("TK224 · aviso de ticket ya cancelado", () => {
  it("avisoSigueVigente se apaga si el ticket está inactivo aunque la solicitud siga pendiente", () => {
    const data = {
      solicitudes: [{ id: "sol-1", tabla: "ticket_detalle", fila: "TK-SO-1978", tipo: "eliminacion", estado: "pendiente" }],
      permisos: [],
      conteos: [],
      ticketsInactivos: new Set(["TK-SO-1978"]),
    };
    assert.equal(avisoSigueVigente({ tipo: "edicion_ticket", ref_id: "sol-1", link: "#/m/tickets/t/TK-SO-1978" }, data), false);
  });

  it("cerrarSolicitudesTicketInactivo marca la solicitud, no toca el ticket", async () => {
    const { db, c } = semilla();
    db.tables.set("solicitudes_cambio", [
      { id: "sol-1", tabla: "ticket_detalle", fila: "TK-SO-1978", tipo: "eliminacion", estado: "pendiente" },
    ]);
    db.tables.set("tickets", [
      { id: "t1", clave: "TK-SO-1978", so_num: "TK-SO-1978", orig: { anulado: true, cancelado: true } },
    ]);
    const n = await cerrarSolicitudesTicketInactivo(c, "emi");
    assert.equal(n, 1);
    const sol = db.tables.get("solicitudes_cambio")![0];
    assert.equal(sol.estado, "aprobado");
    assert.match(String(sol.comentario), /ya estaba cancelado/);
    assert.equal(db.tables.get("tickets")![0].clave, "TK-SO-1978");
  });
});

describe("TK224 · aviso virtual no resucita y el × queda en el servidor", () => {
  it("avisosVirtualesEdicion no vuelve a crear el aviso si ya se leyó o se descartó", () => {
    const sol = { id: "s1", tabla: "ticket_detalle", fila: "TK-SO-1978", tipo: "eliminacion", estado: "pendiente", solicitante: "Alejandra Rodriguez", enlace: "#/m/tickets/t/TK-SO-1978" };
    const leida = [{ id: "n1", tipo: "edicion_ticket", ref_id: "s1", link: "#/m/tickets/t/TK-SO-1978", leida: true, leida_at: "2026-11-26T12:00:00Z" }];
    assert.equal(avisosVirtualesEdicion([sol], leida, { name: "Emilia" } as never, true).length, 0);
    assert.equal(avisosVirtualesEdicion([sol], [], { name: "Emilia" } as never, true, new Set(["TK-SO-1978"])).length, 0);
    const vivo = avisosVirtualesEdicion([sol], [], { name: "Emilia" } as never, true);
    assert.equal(vivo.length, 1);
    assert.equal(vivo[0].id, "sol:s1");
    assert.match(String(vivo[0].titulo), /eliminar ticket/);
  });

  it("notif_leer de un id sol: guarda un acuse y notif_mias ya no lo lista", async () => {
    const { db, h } = semilla();
    db.tables.set("solicitudes_cambio", [
      { id: "7360aaed-1996-4a11-95d9-bd507f468a46", tabla: "ticket_detalle", fila: "TK-SO-1978", tipo: "eliminacion", estado: "pendiente", creado: "2026-11-24T18:09:00Z", solicitante: "Alejandra Rodriguez", enlace: "#/m/tickets/t/TK-SO-1978" },
    ]);
    const antes = await h("notif_mias", "adm");
    const virt = ((antes.items || []) as Row[]).find((x) => String(x.id).startsWith("sol:"));
    assert.ok(virt, "el aviso virtual aparece mientras la solicitud está pendiente");
    await h("notif_leer", "adm", { id: virt!.id });
    const acuses = (db.tables.get("beta_notificaciones") || []).filter((x) => s(x.ref_id) === "7360aaed-1996-4a11-95d9-bd507f468a46");
    assert.ok(acuses.length >= 1 && acuses.every((x) => x.leida_at), "queda un acuse por usuario");
    const despues = await h("notif_mias", "adm");
    assert.ok(!((despues.items || []) as Row[]).some((x) => !x.leida && (x.id === virt!.id || s(x.ref_id) === "7360aaed-1996-4a11-95d9-bd507f468a46")));
  });

  it("si el ticket ya está cancelado, notif_mias no muestra el aviso de eliminar", async () => {
    const { db, h } = semilla();
    db.tables.set("solicitudes_cambio", [
      { id: "sol-x", tabla: "ticket_detalle", fila: "TK-SO-1978", tipo: "eliminacion", estado: "pendiente", creado: "2026-11-24T18:09:00Z", solicitante: "Alejandra Rodriguez" },
    ]);
    db.tables.set("beta_notificaciones", [
      { id: "n-edit", usuario: "emi", tipo: "edicion_ticket", titulo: "Solicitud para eliminar ticket", cuerpo: "Alejandra Rodriguez pidió eliminar TK-SO-1978", link: "#/m/tickets/t/TK-SO-1978", ref_id: "sol-x", created_at: "2026-11-24T18:09:00Z" },
    ]);
    db.tables.set("beta_ticket_cancelados", [
      { clave: "TK-SO-1978", so_num: "TK-SO-1978", motivo: "ya estaba hecho" },
    ]);
    const r = await h("notif_mias", "adm");
    const items = (r.items || []) as Row[];
    assert.ok(!items.some((x) => !x.leida && String(x.titulo).includes("eliminar")));
    assert.equal(db.tables.get("solicitudes_cambio")![0].estado, "aprobado");
    assert.ok(db.tables.get("beta_notificaciones")!.find((x) => x.id === "n-edit")?.leida_at);
  });
});

describe("TK224 · UI del dashboard", () => {
  it("abre de inmediato desde caché o esqueleto, sin «Cargando el dashboard...»", () => {
    const screens = file("beta-screens.js");
    assert.doesNotMatch(screens, /Cargando el dashboard/);
    assert.doesNotMatch(screens, /Cargando el pulso del día/);
    assert.match(screens, /function _dashCacheGet\(/);
    assert.match(screens, /function _dashSkeleton\(/);
    assert.match(screens, /if\(cached\)\{ _pintaDashboard\(c, cached, st\); \}/);
    assert.match(screens, /c\.innerHTML=_dashSkeleton\(\)/);
    assert.match(screens, /montarAvisosDash/);
  });

  it("quita la tarjeta grande «Asignado a ti» y pone avisos compactos arriba, máx. 2 líneas, con ×", () => {
    const html = file("index.html");
    const conteo = file("mc-conteo.js");
    assert.doesNotMatch(conteo, /card-title">📋 Asignado a ti/);
    assert.match(conteo, /async function tarjetaInicio\(\) \{ return ""; \}/);
    assert.doesNotMatch(html, /c\.prepend\(box\)/);
    assert.match(html, /function htmlDashAvisosFoot\(/);
    assert.match(html, /function montarAvisosDash\(/);
    assert.match(html, /homeFail \+ avisosHead \+ pulso \+ ops/);
    assert.match(html, /-webkit-line-clamp: 2/);
    assert.match(html, /insertAdjacentHTML\("afterbegin"/);
    assert.match(html, /class="dash-av-tx"/);
    assert.match(html, /class="dash-al-x dash-av-x"/);
    assert.match(html, /notif_leer/);
  });

  it("cache al día en index.html y sw.js", () => {
    const html = file("index.html");
    const sw = file("sw.js");
assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-27-TKCOLS"/);
    assert.match(sw, /const CACHE = "sunsu-2026-11-27-TKCOLS"/);
    assert.match(html, /beta-screens\.js\?v=20261127tkcols/);
    assert.match(html, /mc-conteo\.js\?v=20261126tk226/);
  });
});

function s(v: unknown): string { return v == null ? "" : String(v); }
