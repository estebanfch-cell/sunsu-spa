import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const js = readFileSync(new URL("mc-productos.js", root), "utf8");
const html = readFileSync(new URL("index.html", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");

const CACHE = "sunsu-2026-11-27-COMVTA";

describe("Productos: stock de consignación se ve en Venta (t973u)", () => {
  it("la versión de la página coincide con el service worker", () => {
    const enSw = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
    const enHtml = (html.match(/window\.SUNSU_CACHE = "([^"]+)"/) || [])[1];
    assert.equal(enHtml, enSw);
    assert.equal(enSw, CACHE);
    assert.match(html, /mc-productos\.js\?v=20261126consui/);
  });

  it("qtyVenta suma bodega Venta + bodega Consignación", () => {
    assert.match(js, /function qtyVenta\(p\)/);
    const fn = js.match(/function qtyVenta\(p\) \{[\s\S]*?\n  \}/);
    assert.ok(fn);
    const qtyVenta = new Function("p", fn[0] + "; return qtyVenta(p);");
    assert.equal(qtyVenta({ porGrupo: { CONSIGNACION: -3, BCONSIG: 7 } }), 4);
    assert.equal(qtyVenta({ porGrupo: { CONSIGNACION: 0, BCONSIG: 7 } }), 7);
    assert.equal(qtyVenta({ porGrupo: { CONSIGNACION: 5 } }), 5);
    assert.equal(qtyVenta({}), 0);
  });

  it("el filtro y la columna Venta usan qtyVenta, no solo porGrupo.CONSIGNACION", () => {
    assert.match(js, /if \(f\.bodega === "CONSIGNACION" && !\(qtyVenta\(p\) > 0\)\) return false/);
    assert.match(js, /if \(id === "g_CONSIGNACION"\) return qtyVenta\(p\)/);
    assert.match(js, /else if \(c\.id === "g_CONSIGNACION"\) v = ventaHtml\(p\)/);
  });

  it("la ficha/tarjeta muestra 🤝 consignación aparte de Venta (no las mezcla en un solo número silencioso)", () => {
    assert.match(js, /if \(c\) bits\.push\("🤝 consignación " \+ q2\(c\)\)/);
    const htmlFn = js.match(/function ventaHtml\(p\) \{[\s\S]*?\n  \}/);
    assert.ok(htmlFn);
    const ventaHtml = new Function("p", "function q2(v){return String(v)}" + htmlFn[0] + "; return ventaHtml(p);");
    assert.match(ventaHtml({ porGrupo: { CONSIGNACION: 0, BCONSIG: 7 } }), /7/);
    assert.match(ventaHtml({ porGrupo: { CONSIGNACION: 0, BCONSIG: 7 } }), /🤝/);
    assert.equal(ventaHtml({ porGrupo: { CONSIGNACION: 5, BCONSIG: 0 } }), "5");
  });
});
