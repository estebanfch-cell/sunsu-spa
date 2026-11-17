import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { consultarEnJs } from "./query.ts";

const rows = [
  { id: 1, nombre: "Nancy", apellido: "Dávila", timestamp: "2026-11-14 10:00:00+00", estimado: "10", borrado_at: null },
  { id: 2, nombre: "Ana", apellido: "Pérez", timestamp: "2026-11-15T09:00:00Z", estimado: "20", borrado_at: null },
  { id: 3, nombre: "Ana", apellido: "Dávila", timestamp: "2026-11-16 08:00:00+00", estimado: "30", borrado_at: "2026-11-16" },
  { id: 4, nombre: "Luz", apellido: "Mora", timestamp: "2026-11-16 12:00:00+00", estimado: "40", borrado_at: null },
];

describe("tk_historial consulta paginada (fallback JS)", () => {
  it("filtra borrados, fechas con espacio o T, ordena y pagina con total", () => {
    const r = consultarEnJs(rows, { filtros: [{ col: "borrado_at", op: "is_null" }, { col: "timestamp", op: "gte", val: "2026-11-14T00:00:00" }, { col: "timestamp", op: "lt", val: "2026-11-17T00:00:00" }], orden: [{ col: "timestamp", desc: true }], limite: 2, desde: 0, contar: true });
    assert.deepEqual(r.rows.map((x) => x.id), [4, 2]);
    assert.equal(r.total, 3);
    const r2 = consultarEnJs(rows, { filtros: [{ col: "borrado_at", op: "is_null" }], orden: [{ col: "timestamp", desc: true }], limite: 2, desde: 2, contar: true });
    assert.deepEqual(r2.rows.map((x) => x.id), [1]);
  });
  it("búsqueda por palabras sin tildes en cualquier columna", () => {
    const r = consultarEnJs(rows, { filtros: [{ op: "palabras", cols: ["nombre", "apellido"], val: ["ana","davila"] }] });
    assert.deepEqual(r.rows.map((x) => x.id), [3]);
  });
  it("in", () => {
    const r = consultarEnJs(rows, { filtros: [{ col: "id", op: "in", val: [1, 4] }] });
    assert.deepEqual(r.rows.map((x) => x.id).sort(), [1, 4]);
  });
});

import { SupabaseDb } from "./db.ts";
import { VistaDb } from "./prueba.ts";
describe("consulta en Supabase", () => {
  const filas = Array.from({ length: 2345 }, (_, i) => ({ id: i + 1 }));
  const urls: string[] = [];
  const fake = (async (url: string, init?: RequestInit) => {
    urls.push(String(url));
    const rg = String((init?.headers as Record<string, string>)?.Range || "0-");
    const [a, b] = rg.split("-").map((x) => (x === "" ? NaN : Number(x)));
    const fin = Math.min(filas.length - 1, Number.isFinite(b) ? b : 999, a + 999);
    const parte = filas.slice(a, fin + 1);
    return new Response(JSON.stringify(parte), { status: 200, headers: { "content-range": `${a}-${fin}/${filas.length}` } });
  }) as unknown as typeof fetch;
  it("pasa de 1000 filas pidiendo por bloques y cuenta el total real", async () => {
    const db = new SupabaseDb("https://x.supabase.co", "k", fake);
    const r = await db.consultar("tickets", { cols: ["id"], contar: true });
    assert.equal(r.rows.length, 2345);
    assert.equal(r.total, 2345);
  });
  it("sin columna origin (gift_cards_digitales) no agrega el filtro de prueba", async () => {
    urls.length = 0;
    const v = new VistaDb(new SupabaseDb("https://x.supabase.co", "k", fake), false);
    await v.consultar("gift_cards_digitales", { filtros: [{ col: "codigo", op: "in", val: ["26-159"] }], limite: 5 });
    assert.ok(!decodeURIComponent(urls[0]).includes("origin"));
    await v.consultar("tickets", { limite: 5 });
    assert.ok(decodeURIComponent(urls[1]).includes("origin"));
  });
});
