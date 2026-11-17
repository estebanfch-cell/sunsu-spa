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
