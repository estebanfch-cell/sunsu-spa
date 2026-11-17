import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./paquetes_beta_api.ts";
import { parseUso, textoUso, vistaPaquete } from "./paquetes_beta.ts";
import type { Row } from "./domain.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Ana Pérez", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }, { id: "u-ana", nombre: "Ana Pérez", rol: "cosmetologa" }]);
  db.tables.set("paquetes", [
    { id: 5, sheet_row: 7, beta_codigo: "PQ-0005", cedula: "1700000001", nombres: "Elena", apellidos: "Oña", sku: "SUNSU-40", paquete: "Facial Reset 3x1", vendido_por: "Ana Pérez", dia: 14, mes: 11, ano: 2026, uso_1: true, fecha_1: "14/11/26 Facial Reset 3x1 · Daniela Mora", orig: { ticket: "TK-20261114-1" } },
    { id: 6, sheet_row: 8, cedula: null, nombres: null },
  ]);
  db.tables.set("tickets", [{ id: 1, so_num: "TK-SO-1886", timestamp: "2026-11-14T17:02:00Z", id_3: "1700000001", atendido_por: "Daniela Mora", paquete: "SI" }]);
  for (const t of ["beta_paquete_ajustes", "beta_clientes", "log_acciones", "app_modulos", "permisos"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-17T18:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}

describe("Paquetes beta", () => {
  it("parseUso lee el texto de la hoja", () => {
    assert.deepEqual(parseUso("14/11/26 Facial Reset 3x1 · Daniela Mora"), { fecha: "2026-11-14", facial: "Facial Reset 3x1", cosmetologa: "Daniela Mora" });
    assert.equal(parseUso("2026-11-14").fecha, "2026-11-14");
    assert.equal(textoUso("2026-11-17", "Reset", "Ana"), "17/11/26 Reset · Ana");
    const v = vistaPaquete({ id: 1, sheet_row: 3, sku: "SUNSU-40", paquete: "Reset 3x1", uso_1: true, fecha_1: "1/11/26" }, { datos: { sesiones: 4 } });
    assert.equal(v.total, 4);
    assert.equal(v.pendientes, 3);
  });
  it("lista sin filas vacías, detalle con ticket y cosmetóloga", async () => {
    const { h } = semilla();
    const l = await h("pq_lista", "adm", { estado: "todos" });
    assert.equal(l.total, 1);
    const g = await h("pq_get", "adm", { codigo: "PQ-0005" });
    const s1 = ((g.item as Row).sesiones as Row[])[0];
    assert.equal(s1.ticket, "TK-SO-1886");
    assert.equal(s1.cosmetologa, "Daniela Mora");
    assert.equal((g.item as Row).fechaCompra, "2026-11-14");
  });
  it("marcar, editar (admin), desmarcar y eliminar quedan en el historial", async () => {
    const { db, h } = semilla();
    const m = await h("pq_marcar", "cos", { id: 5, fecha: "2026-11-17", cosmetologa: "Ana Pérez", ticket: "TK-SO-1900" });
    assert.equal(m.ok, true, String(m.error));
    assert.equal(m.slot, 2);
    assert.match(String(db.tables.get("paquetes")![0].fecha_2), /^17\/11\/26 .* · Ana Pérez$/);
    assert.match(String((await h("pq_marcar", "cos", { id: 5, slot: 2, desmarcar: true })).error), /admin/);
    assert.match(String((await h("pq_guardar", "cos", { id: 5, datos: { sesiones: 6 } })).error), /admin/);
    assert.match(String((await h("pq_guardar", "adm", { id: 5, datos: { sesiones: 1 } })).error), /desmarca/);
    const g0 = await h("pq_guardar", "adm", { id: 5, datos: { sesiones: 6, nombres: "Elena María" }, fechas: { 1: "2026-11-13" } });
    assert.equal(g0.ok, true, String(g0.error));
    const g = await h("pq_get", "adm", { id: 5 });
    const it0 = g.item as Row;
    assert.equal(it0.total, 6);
    assert.equal(it0.nombre, "Elena María");
    assert.equal((it0.sesiones as Row[])[0].fecha, "2026-11-13");
    assert.equal((it0.sesiones as Row[])[1].ticket, "TK-SO-1900");
    assert.ok((it0.historial as Row[]).length >= 2);
    assert.equal((await h("pq_marcar", "adm", { id: 5, slot: 2, desmarcar: true })).ok, true);
    assert.match(String((await h("pq_borrar", "adm", { id: 5, motivo: "" })).error), /motivo/);
    assert.equal((await h("pq_borrar", "adm", { id: 5, motivo: "duplicado" })).ok, true);
    assert.equal((await h("pq_lista", "adm", { estado: "todos" })).total, 0);
  });
});
