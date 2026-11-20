import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { nombresDeSku } from "./tickets_beta_api.ts";

const raiz = new URL("../../../", import.meta.url);
const leer = (f: string) => readFileSync(new URL(f, raiz), "utf8");

/** Saca nombreLinea + armarCard de mc-tickets.js y los evalúa sin DOM. */
function armar(): (d: unknown, base?: unknown) => Record<string, unknown> {
  const src = leer("mc-tickets.js");
  const ini = src.indexOf("  function nombreLinea("), fin = src.indexOf("  function cardDesdeTicket(");
  assert.ok(ini > 0 && fin > ini);
  const w: Record<string, unknown> = { PROVS: [], _P3S: ["44"] };
  return new Function("window", src.slice(ini, fin) + "; return armarCard;")(w);
}

describe("TK184 tarjeta de tratamiento con datos actuales", () => {
  it("correcciones aprobadas (info) mandan sobre la fila vieja; líneas → compra; código → nombre del catálogo", () => {
    const card = armar()({
      ticket: { fecha: "2026-11-19", nombre: "Andres", apellido: "Trujillo", cosmetologa: "Andrea Robles", notas: "", recomendaciones: "", retorno: "" },
      info: { notas: "Irritación en frente", recomendaciones: "Usar limpiador rice", retorno: "12/19/2026", retornoTrat: "Facial Reparación", cosmetologa: "Andrea Robles" },
      lineas: [
        { tipo: "facial", sku: "02", nombre: "SUNSU-02 Facial Reparación · Canje paquete PACK-559 · sesión 3/3", cantidad: 1 },
        { tipo: "extra", sku: "31", nombre: "SUNSU-31 PDRN Serum", cantidad: 1 },
        { tipo: "producto", sku: "AS-002", nombre: "SUNSU-AS-002", cantidad: 2 },
      ],
      nombresSku: { "AS-002": "Jabón Limpiador Ceramide Foam - Eyenlip" },
      documentos: [{ tipo: "foto", nombre: "Foto antes 1", url: "archivo:abc123" }, { tipo: "foto", nombre: "Foto después 1", url: "archivo:def456" }],
    }, { notas: "vieja", recomendaciones: "vieja", productos: [] });
    assert.equal(card.recomendaciones, "Usar limpiador rice");
    assert.equal(card.notas, "Irritación en frente");
    assert.equal(card.retorno, "2026-12-19");
    assert.equal(card.retornoTrat, "Facial Reparación");
    assert.deepEqual(card.productos, ["Jabón Limpiador Ceramide Foam - Eyenlip ×2"]);
    assert.match(String(card.extras), /PDRN Serum/);
    assert.match(String(card.facial), /Facial Reparación/);
    assert.equal(card.fotosAntes, "archivo:abc123");
    assert.equal(card.fotosDespues, "archivo:def456");
  });
  it("WhatsApp (lista y detalle) y la ficha arman la tarjeta con tk_get fresco, no con la fila de la lista", () => {
    const wa = leer("mc-wa.js"), tk = leer("mc-tickets.js"), cl = leer("mc-clientes.js");
    assert.match(wa, /MCTickets\.tarjetaFresca\(clave\)/);
    assert.match(wa, /pdfsDe\(opts\.ticket, opts\.detalle, sel, clave\)/);
    assert.doesNotMatch(wa, /if \(row && w\._tkCards && w\._tkCards\[row\]\)/);
    assert.match(tk, /async function tarjetaFresca\(clave\)[\s\S]{0,200}api\("tk_get"/);
    assert.match(tk, /tarjetaFresca: tarjetaFresca/);
    assert.match(cl, /MCTickets\.tarjetaFresca/);
  });
  it("las fotos archivo: entran a la tarjeta y un producto con solo código no queda en blanco", () => {
    const bs = leer("beta-screens.js");
    assert.match(bs, /match\(\/archivo:\[-\\w\]\+\|\[-\\w\]\{25,\}\/g\)/);
    assert.match(bs, /api\('fotoB64',\{id:m\[0\]\}\)/);
    assert.match(bs, /var dP=limpia\(base\)\|\|String\(base\|\|''\)\.trim\(\)/);
  });
  it("mensaje sin WhatsApp: pedir el cambio desde la ficha (Teléfono 🔒)", () => {
    assert.match(leer("mc-wa.js"), /Pide el cambio desde la ficha: Teléfono 🔒/);
    assert.match(leer("mc-giftcards.js"), /Pide el cambio desde la ficha: Teléfono 🔒/);
    assert.doesNotMatch(leer("mc-wa.js"), /Pídele a una administradora/);
  });
  it("nombresDeSku resuelve códigos de producto con el catálogo", async () => {
    const db = new MemoryDb();
    db.tables.set("erp_productos", [{ sku: "AS-002", nombre: "Jabón Limpiador Ceramide Foam - Eyenlip" }, { sku: "ML-001", nombre: "Otro" }]);
    const m = await nombresDeSku({ db } as never, [{ tipo: "producto", sku: "AS-002", nombre: "SUNSU-AS-002" }, { tipo: "producto", sku: "ML-001", nombre: "Crema bonita" }, { tipo: "extra", sku: "31", nombre: "SUNSU-31" }]);
    assert.deepEqual(m, { "AS-002": "Jabón Limpiador Ceramide Foam - Eyenlip" });
  });
});

describe("TK184 consultar con límite > 1000 (PostgREST corta en 1000)", () => {
  it("pide por bloques hasta el límite: la clienta 1500 sí aparece", async () => {
    const { SupabaseDb } = await import("./db.ts");
    const filas = Array.from({ length: 2007 }, (_, i) => ({ key: "c:" + i }));
    const rangos: string[] = [];
    const fake = (async (_u: string, init: { headers: Record<string, string> }) => {
      const r = init.headers.Range; rangos.push(r);
      const [a, b] = r.split("-").map(Number);
      const lote = filas.slice(a, Math.min(b + 1, a + 1000));
      return new Response(JSON.stringify(lote), { status: 200, headers: { "content-range": `${a}-${a + lote.length - 1}/*` } });
    }) as unknown as typeof fetch;
    const db = new SupabaseDb("https://x.supabase.co", "k", fake);
    const r = await db.consultar("beta_clientes", { cols: ["key"], limite: 4000 });
    assert.equal(r.rows.length, 2007);
    assert.ok(r.rows.some((x) => x.key === "c:1500"));
    assert.deepEqual(rangos, ["0-999", "1000-1999", "2000-2999"]);
  });
});
