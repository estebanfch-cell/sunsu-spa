import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");
const nav = readFileSync(new URL("mc-nav.js", root), "utf8");
const prod = readFileSync(new URL("mc-productos.js", root), "utf8");
const conteo = readFileSync(new URL("mc-conteo.js", root), "utf8");

describe("TK123 menú Inventario y recarga de versión", () => {
  it("ningún rol ve Stock Venta, Stock Cabina ni Códigos de barras en el menú", () => {
    assert.doesNotMatch(nav, /\["admin", "Stock Venta"/);
    assert.doesNotMatch(nav, /\["admin", "Stock Cabina"/);
    assert.doesNotMatch(nav, /\["admin", "Códigos de barras"/);
    assert.match(nav, /\["productos", "Productos", "#\/m\/productos"\]/);
    assert.match(nav, /Conteo físico/);
    assert.match(nav, /Transferencias/);
    assert.match(nav, /Ajustes de stock/);
    assert.match(nav, /Costo por facial/);
  });
  it("abrir las rutas retiradas redirige a Productos", () => {
    assert.match(html, /function rutaRetiradaAProductos/);
    assert.match(html, /route\.mod === "barras"/);
    assert.match(html, /route\.sub === "venta" \|\| route\.sub === "cabina"/);
    assert.match(html, /location.replace\("#\/m\/productos"\)/);
  });
  it("el escáner y los códigos siguen en Productos y Conteo", () => {
    assert.match(prod, /_scanAbrir/);
    assert.match(prod, /Códigos de barras/);
    assert.match(conteo, /_scanAbrir/);
  });
  it("el service worker cubre beta.html, es network-first y reclama clientes; hay aviso de nueva versión", () => {
    assert.match(sw, /const CACHE = "sunsu-2026-11-19-TK151"/);
    assert.doesNotMatch(sw, /rootScope\(\)/);
    assert.match(sw, /self\.skipWaiting\(\)/);
    assert.match(sw, /self\.clients\.claim\(\)/);
    assert.match(sw, /pathname === "\/" \|\| url\.pathname === "\/index\.html"/);
    assert.match(sw, /const FILES = \["\/", "\/index\.html",/);
    assert.doesNotMatch(sw, /beta\.html/);
    assert.match(sw, /fetch\(event\.request\)/);
    assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-19-TK151"/);
    assert.match(html, /Nueva actualización disponible/);
    assert.match(html, /Actualizar/);
    assert.match(html, /scope: "\/", updateViaCache: "none"/);
    assert.doesNotMatch(html, /scope: "\/beta"/);
    assert.match(html, /controllerchange/);
    assert.match(html, /revisarVersionServidor/);
  });
});
