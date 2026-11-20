import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import { acceso, DEFAULT_MATRIZ } from "./permisos.ts";
import "./staff_home_api.ts";
import "./tk109_api.ts";
import "./dashboard_api.ts";
import { calcularKpisStaff } from "./dashboard_api.ts";
import type { Row } from "./domain.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(join(root, "index.html"), "utf8");
const nav = readFileSync(join(root, "mc-nav.js"), "utf8");
const home = readFileSync(join(root, "mc-staff-home.js"), "utf8");
const sw = readFileSync(join(root, "sw.js"), "utf8");

function dbBase() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "and", uid: "u-and", rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [{ id: "u-and", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa" }]);
  db.tables.set("erp_bodegas", []);
  db.tables.set("erp_productos", []);
  db.tables.set("erp_locales", []);
  return db;
}

describe("TK109 más rápido y menú siempre visible", () => {
  it("la barra de abajo se pinta en paintShell y no se esconde por un falso teclado al cambiar de ruta", () => {
    assert.match(html, /function paintShell\(title\) \{\s*document\.body\.classList\.add\("app-on"\)/);
    assert.match(html, /<nav class="tabbar"/);
    assert.match(html, /body\.app-on \.tabbar \{ display: grid/);
    assert.match(html, /classList\.remove\("kb-open"\)/);
    assert.match(html, /window\.addEventListener\("hashchange", \(\) => \{/);
    const teclado = html.split("function pinta()")[1] || "";
    assert.match(teclado, /abierto = editable\(document\.activeElement\);/);
    assert.doesNotMatch(teclado.split("document.body.classList.toggle")[0], /tecladoPorAltura\(\)/);
  });

  it("Gift cards aparece en Spa para cosmetóloga y asistente, con el mismo módulo", () => {
    assert.equal(acceso("cosmetologa", "gift_cards", DEFAULT_MATRIZ), "todos");
    assert.equal(acceso("asistente_cosmetologia", "gift_cards", DEFAULT_MATRIZ), "todos");
    assert.match(nav, /ok\("gift_cards"\)[\s\S]{0,80}Gift cards[\s\S]{0,80}#\/m\/gift\/cards/);
    assert.match(nav, /ok\("agenda"\)[\s\S]{0,120}Mi agenda/);
    assert.match(nav, /ok\("paquetes"\)[\s\S]{0,80}Paquetes/);
  });

  it("el dashboard usa esqueleto o caché, no un Cargando en blanco, y no pide lugares en cada navegación", () => {
    assert.match(html, /function htmlEsqueleto\(/);
    assert.match(html, /function apiSWR\(/);
    assert.match(html, /SWR_ACCIONES/);
    assert.match(html, /htmlEsqueleto\(\)/);
    assert.match(html, /state\._lugaresAt/);
    assert.match(html, /if \(state\.lugares && state\.lugares\.locales && state\._lugaresAt/);
    assert.match(html, /function keepApiWarm\(/);
    assert.match(html, /api\("ping"\)/);
    assert.match(home, /apiSWR/);
    assert.match(home, /MCStaffHome = \{[\s\S]*html: html/);
    assert.match(sw, /sunsu-2026-11-19-TK160/);
    assert.match(html, /20261119tk160/);  });

  it("staff_home no baja el dashboard admin completo y el ping / bootstrap responden", async () => {
    const src = readFileSync(join(root, "supabase/functions/api/staff_home_api.ts"), "utf8");
    assert.match(src, /calcularKpisStaff/);
    assert.doesNotMatch(src, /calcularDashboard/);
    assert.match(src, /citasRango\(ctx, hoy, addDays\(hoy, 14\)/);
    assert.match(src, /Promise\.all/);
    assert.match(src, /consultar\(ctx\.db, "tickets"/);

    const now = new Date("2026-11-18T16:30:00Z");
    const db = dbBase();
    db.tables.set("tickets", [
      { id: 2, timestamp: "2026-11-18T15:00:00Z", atendido_por: "Andrea Robles", facial_hecho: "SUNSU-02 Facial Reparación", compra_pack_3: "Glow x3", estimado: 130, orig: { "VK-017": 2 }, borrado_at: null },
    ]);
    const ctx = { db, now, env: {}, fetchImpl: fetch, legacyLogin: async () => ({}) };
    const ping = await handle("ping", { token: "and" }, { ...ctx, token: "and" }) as Row;
    assert.equal(ping.ok, true);
    const boot = await handle("bootstrap", { token: "and" }, { ...ctx, token: "and" }) as Row;
    assert.equal(boot.ok, true);
    assert.ok(boot.lugares);

    const k = await calcularKpisStaff(db, now, { periodo: "hoy", cosm: "Andrea Robles" });
    assert.equal(k.faciales, 1);
    assert.equal(k.paquetes, 1);
    assert.equal(k.productos, 2);
  });
});
