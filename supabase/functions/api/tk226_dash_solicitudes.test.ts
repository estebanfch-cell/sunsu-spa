// TK226 (Emilia t958u/t959u/t960u): avisos del Dashboard sin Falta factura ni
// Descuadre voucher; esos se pintan en el ticket. Modal Solicitudes solo
// pendientes, resumen legible (nunca JSON), y cierre automático si ya aplica.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./conteo_fisico_api.ts";
import "./inline_api.ts";
import { cambiosPropuestos, solicitudYaReflejada, cerrarSolicitudesYaAplicadas } from "./avisos_auto.ts";
import type { Row } from "./domain.ts";
import type { Ctx } from "./lib.ts";

const root = new URL("../../../", import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root), "utf8");

function ctxDe(db: MemoryDb, now = "2026-11-26T11:07:00-05:00"): Ctx {
  return { db, now: new Date(now), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}) } as unknown as Ctx;
}

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "emi", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
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
  db.tables.set("beta_clientes", []);
  const c = ctxDe(db);
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok } as never) as Promise<Row>;
  return { db, h, c };
}

describe("TK226 · avisos del Dashboard", () => {
  it("alertasDashboard omite Falta factura y Descuadre voucher, deja avisos accionables", () => {
    const html = file("index.html");
    const ini = html.indexOf("function alertasDashboard(");
    const fin = html.indexOf("function htmlDashTop(");
    const alertasDashboard = new Function(html.slice(ini, fin) + "; return alertasDashboard;")() as (
      a: unknown, n: unknown, o: string[], v: unknown,
    ) => Row[];
    const v = { items: [
      { key: "falta-factura", tipo: "falta_factura", texto: "Falta factura (10 tickets)" },
      { key: "falta-factura:TK-SO-2000", tipo: "falta_factura", texto: "Falta factura TK-SO-2000 · Daniela" },
      { key: "voucher:TK-SO-1987:a", texto: "Descuadre voucher TK-SO-1987" },
    ] };
    const apr = { grupos: [{ items: [{ id: "s1", tipo: "solicitud", titulo: "Alejandra Rodriguez pide cambiar la ficha de una clienta", detalle: "Gustavo Alvarez · Autoriza fotos → SI", href: "#/m/clientes/c/x" }] }] };
    const notif = { items: [{ id: "aviso:tarde-2026-12-06", tipo: "aviso_equipo", titulo: "Desde hoy, los tickets deben subirse el mismo día.", leida: false }] };
    const L = alertasDashboard(apr, notif, [], v);
    assert.ok(L.some((x) => /Alejandra Rodriguez/.test(String(x.texto))));
    assert.ok(L.some((x) => /Desde hoy/.test(String(x.texto))));
    assert.ok(!L.some((x) => /Falta factura|Descuadre voucher/.test(String(x.texto))));
  });

  it("si hay más de 3 avisos, muestra 3 y un Ver N más", () => {
    const html = file("index.html");
    assert.match(html, /const max = 3/);
    assert.match(html, /Ver \$\{extra\.length\} más/);
    assert.match(html, /data-av-more/);
    assert.match(html, /dash-av\.abierto/);
  });

  it("las tarjetas de ticket pintan Falta factura y Descuadre voucher en rojo", () => {
    const js = file("beta-screens.js");
    assert.match(js, /function _tkDescuadreVoucher\(/);
    assert.match(js, /function _histVouchTag\(/);
    assert.match(js, /_histFacTag\(t,facn,anul,true\)\+_histVouchTag\(t\)/);
    assert.match(js, /_tkPill\('descuadrevoucher'/);
    assert.match(js, /mob-fac-falta/);
    assert.match(js, /if\(_tkDescuadreVoucher\(t\)\) out\.push\(\{c:'descuadrevoucher',t:'Descuadre voucher'\}\)/);
    const css = file("index.html");
    assert.match(css, /mob-vouch-desc/);
  });
});

describe("TK226 · modal Solicitudes", () => {
  it("el modal no serializa JSON y solo lista pendientes, con Ver historial", () => {
    const js = file("beta-inline.js");
    assert.doesNotMatch(js, /JSON\.stringify/);
    assert.match(js, /function resumenCambios\(/);
    assert.match(js, /Nunca JSON ni claves internas/);
    assert.match(js, /No hay solicitudes pendientes/);
    assert.match(js, /Ver historial/);
    assert.match(js, /getSolicitudes", \{ historial: true \}/);
    assert.match(js, /ix-vermas/);
    assert.doesNotMatch(js, /sección ['\"]Resueltas['\"]/);
  });

  it("getSolicitudes devuelve solo pendientes; el historial va aparte", async () => {
    const { db, h } = semilla();
    db.tables.set("solicitudes_cambio", [
      { id: "p1", tabla: "cliente_beta", fila: "c:1", tipo: "cambio", estado: "pendiente", solicitante: "Alejandra Rodriguez", solicitante_uid: "ale", etiqueta: "Clienta X", motivo: "autoriza", creado: "2026-11-26T10:00:00Z", propuestos: { autorizaFotos: "SI" } },
      { id: "c1", tabla: "ticket_detalle", fila: "TK-SO-1934", tipo: "cambio", estado: "aprobado", solicitante: "Daniela Mora", solicitante_uid: "dan", etiqueta: "Edición de TK-SO-1934", motivo: "recomendaciones", creado: "2026-11-20T17:21:00Z", resuelto_at: "2026-11-20T20:12:00Z", resuelto_por: "EFCH", propuestos: { datos: { recomendaciones: "casa" } } },
    ]);
    const r = await h("getSolicitudes", "adm");
    const items = (r.items || []) as Row[];
    assert.equal(r.pendientes, 1);
    assert.equal(r.historial, 1);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "p1");
    const hist = await h("getSolicitudes", "adm", { historial: true });
    assert.equal(((hist.items || []) as Row[]).length, 1);
    assert.equal(((hist.items || []) as Row[])[0].id, "c1");
  });
});

describe("TK226 · cierre automático si el cambio ya está aplicado", () => {
  it("solicitudYaReflejada reconoce Autoriza fotos SI en la ficha", () => {
    const sol = { tabla: "cliente_beta", fila: "c:1804232948", tipo: "cambio", estado: "pendiente", propuestos: { _cambios: [{ clave: "autorizaFotos", etiqueta: "Autoriza fotos", antes: "—", despues: "SI" }] } };
    assert.equal(solicitudYaReflejada(sol, { key: "c:1804232948", datos: { autorizaFotos: "SI" } }), true);
    assert.equal(solicitudYaReflejada(sol, { key: "c:1804232948", datos: { autorizaFotos: "NO" } }), false);
    assert.equal(solicitudYaReflejada(sol, null), false);
    assert.deepEqual(cambiosPropuestos(sol), [{ clave: "autorizaFotos", despues: "SI" }]);
  });

  it("cerrarSolicitudesYaAplicadas cierra la ficha ya actualizada y deja la incierta", async () => {
    const { db, c } = semilla();
    db.tables.set("solicitudes_cambio", [
      { id: "g1", tabla: "cliente_beta", fila: "c:1804232948", tipo: "cambio", estado: "pendiente", solicitante: "Alejandra Rodriguez", etiqueta: "Gustavo Alvarez · Autoriza fotos: — → SI", motivo: "antes y después", propuestos: { _cambios: [{ clave: "autorizaFotos", despues: "SI" }] } },
      { id: "x1", tabla: "ticket_detalle", fila: "TK-SO-9999", tipo: "cambio", estado: "pendiente", solicitante: "Alguien", etiqueta: "Edición de TK-SO-9999", motivo: "no seguro", propuestos: { datos: { recomendaciones: "algo nuevo" } } },
    ]);
    db.tables.set("beta_clientes", [
      { key: "c:1804232948", cedula: "1804232948", datos: { autorizaFotos: "SI" } },
    ]);
    const n = await cerrarSolicitudesYaAplicadas(c, "emi");
    assert.equal(n, 1);
    const g = db.tables.get("solicitudes_cambio")!.find((x) => x.id === "g1")!;
    assert.equal(g.estado, "aprobado");
    assert.match(String(g.comentario), /ya estaba aplicado/);
    const x = db.tables.get("solicitudes_cambio")!.find((x) => x.id === "x1")!;
    assert.equal(x.estado, "pendiente");
  });

  it("cache al día", () => {
    const html = file("index.html");
    const sw = file("sw.js");
    assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-26-TK226"/);
    assert.match(sw, /const CACHE = "sunsu-2026-11-26-TK226"/);
    assert.match(html, /beta-inline\.js\?v=20261126tk226/);
    assert.match(html, /beta-screens\.js\?v=20261126tk226/);
  });
});
