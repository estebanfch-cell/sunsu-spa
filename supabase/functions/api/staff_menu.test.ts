import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

describe("TK71 menú del personal", () => {
  it("la barra de abajo quita Bodega, pone Spa y deja Inventario sin las pantallas de stock viejas", () => {
    const html = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    const nav = readFileSync(new URL("../../../mc-nav.js", import.meta.url), "utf8");
    const beta = html;
    assert.match(html, /tabButton\("spa", "Spa"\)/);
    assert.doesNotMatch(html, /tabButton\("bodega", "Bodega"\)/);
    assert.match(html, /function inventarioSubtabs/);
    assert.match(html, /function rutaRetiradaAProductos/);
    assert.match(html, /location.replace\("#\/m\/productos"\)/);
    assert.doesNotMatch(html, /data-go="#\/m\/inventario\/venta"/);
    assert.doesNotMatch(html, /data-go="#\/m\/inventario\/cabina"/);
    assert.match(html, /function emoCom/);
    assert.match(nav, /spa: 1, compras: 1/);
    assert.doesNotMatch(nav, /\["admin", "Stock Venta"/);
    assert.doesNotMatch(nav, /\["admin", "Stock Cabina"/);
    assert.doesNotMatch(nav, /\["admin", "Códigos de barras"/);
    assert.match(nav, /g\.id === "protocolos" \|\| g\.id === "reportes"/);
    assert.match(nav, /Compras solo Recepciones/);
    assert.match(nav, /rol === "recepcion"/);
    assert.match(beta, /mc-nav\.js\?v=20261119tk132/);
  });
});
