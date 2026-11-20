import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root), "utf8");
const html = file("index.html");
const sw = file("sw.js");
const cl = file("mc-clientes.js");
const prod = file("mc-productos.js");
const oc = file("mc-compras.js");
const pq = file("mc-paquetes.js");
const gc = file("mc-giftcards.js");
const rcp = file("mc-recepciones.js");
const api = file("supabase/functions/api/clientes_beta_api.ts");

describe("TK158 chrome compacto y carpetas de documentos", () => {
  it("sube el pin de caché a TK158 y no toca sunsu.html", () => {
    assert.match(sw, /const CACHE = "sunsu-2026-11-20-TK177"/);
    assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-20-TK177"/);
    assert.match(html, /20261120tk177/);
    const sunsu = file("sunsu.html");
    assert.doesNotMatch(sunsu, /TK158/);
  });

  it("el CSS global es compacto: barra 36px, Filtros ▾, botones chicos, tarjetas 9px 12px", () => {
    assert.match(html, /TK158 — chrome compacto/);
    assert.match(html, /\.ss-bar/);
    assert.match(html, /height: 36px/);
    assert.match(html, /\.ss-filt-btn/);
    assert.match(html, /\.btn\.small \{ padding: 5px 10px; font-size: 12px/);
    assert.match(html, /\.ss-card\.mob-card.*padding: 9px 12px/);
    assert.match(html, /\.mcd-folders/);
    assert.match(html, /\.mcd-folder\.is-empty/);
  });

  it("Clientes: Filtros para todos, sin Nuevo ticket en la lista, tarjetas nombre+código, teléfono solo admin", () => {
    const lista = cl.slice(cl.indexOf("function htmlLista()"), cl.indexOf("async function renderLista()"));
    assert.match(lista, /ss-filt-btn/);
    assert.match(lista, /Filtros/);
    assert.match(lista, /Docs sin asignar/);
    assert.match(lista, /Duplicados/);
    assert.doesNotMatch(lista, /Nuevo ticket/);
    assert.match(lista, /id="mccl-limpiar"/);
    assert.match(cl, /function cardHtml\(c\)/);
    assert.match(cl, /c\.nombre \|\| "Sin nombre"/);
    assert.match(cl, /ss-code/);
    assert.match(cl, /Últ\.:/);
    assert.match(cl, /K\.admin && c\.telefono/);
    assert.match(cl, /\["cosmetologa", "Última cosmetóloga"\]/);
    assert.doesNotMatch(cl, /if \(\(K\.L \|\| \[\]\)\.some\(function \(x\) \{ return "telefono" in x; \}\)\) c\.push\(\["telefono"/);
    assert.match(cl, /K\.admin && \(K\.L \|\| \[\]\)\.some\(function \(x\) \{ return "telefono" in x; \}\)/);
  });

  it("Documentos de la ficha van en carpetas Skin Analysis, K-Lift, Tratamientos, Fotos y Otros", () => {
    assert.match(cl, /function carpetasHtml/);
    assert.match(cl, /titulo: "Skin Analysis"/);
    assert.match(cl, /titulo: "K-Lift"/);
    assert.match(cl, /titulo: "Tratamientos"/);
    assert.match(cl, /titulo: "Fotos"/);
    assert.match(cl, /titulo: "Otros"/);
    assert.match(cl, /hideIfEmpty: 1/);
    assert.match(cl, /if \(t === "docs"\) return carpetasHtml\(d\)/);
    assert.match(cl, /function esSkin/);
    assert.match(cl, /d\.sub === "skin_analisis"/);
    assert.match(cl, /d\.sub === "klift"/);
    assert.match(cl, /d\.tipo === "tarjeta" \|\| d\.sub === "gift_card"/);
  });

  it("Productos, OC, proveedores, paquetes, gift cards y recepciones usan tarjetas compactas", () => {
    assert.match(prod, /function cardProd/);
    assert.match(prod, /MC\.verCostos && p\.tipo !== "servicio"/);
    assert.match(prod, /id="mcp-cards"/);
    assert.match(prod, /ss-bar/);
    assert.match(oc, /function tarjetasOc/);
    assert.match(oc, /ss-card mcoc-card/);
    assert.match(oc, /ss-chip-row/);
    assert.match(pq, /function cardPq/);
    assert.match(pq, /id="mcpq-cards"/);
    assert.match(gc, /function cardGc/);
    assert.match(gc, /id="mcgc-cards"/);
    assert.match(rcp, /id="mcrc-cards"/);
    assert.match(html, /id="prov-cards"/);
    assert.match(html, /ss-code/);
  });

  it("cl_get cubre variantes viejas de cliente_id (cédula cruda, C-código, n:nombre, …001)", () => {
    assert.match(api, /function clavesGuardadas\(key: string, extra\?:/);
    assert.match(api, /extra\?\.codigo/);
    assert.match(api, /ced \+ "001"/);
    assert.match(api, /const claves2 = clavesGuardadas\(key, \{ ced, nom, codigo \}\)/);
    assert.match(api, /pdfs0 = pdfs0\.concat\(more\)/);
  });
});
