import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./ventas_api.ts";
import "./tickets_beta_api.ts";
import "./clientes_beta_api.ts";
import { registroUnico } from "./clientes_beta_api.ts";
import type { Row } from "./domain.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Ana Pérez", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "u-ana", nombre: "Ana Pérez", short: "Ana", rol: "cosmetologa", bloqueado: false },
  ]);
  db.tables.set("clientas_registro", [
    { id: 1, sheet_row: 5, timestamp: "2025-01-10T15:00:00Z", cedula: "1700000001", nombre: "María", apellido: "Banda", tipo_de_piel: "Mixta", alergias: "", apruebo_consentimiento_individual: "SI — 10/01/2025" },
    { id: 2, sheet_row: 90, timestamp: "2026-03-02T15:00:00Z", cedula: "1700000001.0", nombre: "María", apellido: "Banda", tipo_de_piel: "", alergias: "Nueces", telefono: "0991111111" },
    { id: 3, sheet_row: 91, timestamp: "2026-03-02T15:00:00Z", cedula: "1700000002", nombre: "Lucía", apellido: "Mora" },
  ]);
  db.tables.set("tickets", [
    { id: 1, sheet_row: 10, so_num: "TK-SO-1", timestamp: "2026-11-01T15:00:00Z", atendido_por: "Ana Pérez", nombre: "María", apellido: "Banda", id_3: "1700000001", facial_hecho: "SUNSU-57 Facial K-Lift", estimado: 95, fotos_antes: "https://x/a.jpg" },
    { id: 2, sheet_row: 11, timestamp: "2026-11-10T15:00:00Z", atendido_por: "Otra", nombre: "María", apellido: "Banda", id_3: "1700000001", facial_hecho: "SUNSU-40 Facial Reset", estimado: 46 },
  ]);
  db.tables.set("gift_cards", [{ sheet_row: 3, codigo_gc: "GC-26-001", valor: "65", saldo: 40, cedula_comprador: "1700000001", nombre_comprador: "María", apellido_comprador: "Banda", usado: false }]);
  db.tables.set("paquetes", [{ sheet_row: 4, cedula: "1700000001", nombres: "María", apellidos: "Banda", sku: "SUNSU-58", paquete: "x3 Facial K-Lift", uso_1: true, fecha_1: "2026-11-01", orig: { codigo: "PQ-001" } }]);
  for (const t of ["catalogo", "erp_productos", "beta_clientes", "beta_tickets", "beta_ticket_lineas", "solicitudes_cambio", "app_modulos", "cosmetologas"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-17T18:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}

describe("clientes de la beta", () => {
  it("registro único: un valor por campo, el más reciente no vacío", () => {
    const r = registroUnico(semilla().db.tables.get("clientas_registro")!.slice(0, 2));
    assert.equal(r.veces, 2);
    assert.deepEqual([r.datos.cedula, r.datos.tipoPiel, r.datos.alergias, r.datos.telefono], ["1700000001", "Mixta", "Nueces", "0991111111"]);
    assert.equal(r.consentimientos.length, 1);
  });
  it("lista con código, paquetes y gift; ficha con pestañas y clave de ticket", async () => {
    const { h } = semilla();
    const l = await h("cl_list", "adm");
    const m = (l.clientes as Row[]).find((c) => c.key === "c:1700000001")!;
    assert.deepEqual([m.codigo, m.visitas, m.paquetesActivos, m.giftSaldo], ["C-00004", 2, 1, 40]);
    const f = await h("cl_get", "adm", { key: "c:1700000001" });
    assert.equal(f.ok, true, String(f.error));
    assert.equal((f.resumen as Row).total, 141);
    assert.deepEqual((f.historial as Row[]).map((t) => t.clave), ["r11", "TK-SO-1"]);
    assert.equal((f.paquetes as Row[])[0].pendientes, 2);
    assert.equal((f.giftcards as Row[])[0].saldo, 40);
    const tipos = (f.documentos as Row[]).map((d) => d.tipo).sort();
    assert.deepEqual(tipos, ["analisis", "consentimiento", "foto", "tarjeta", "tarjeta"]);
  });
  it("cosmetóloga: solo sus tickets, sin dinero ni teléfono, pide cambio/eliminación; admin aplica", async () => {
    const { h, db } = semilla();
    const f = await h("cl_get", "cos", { key: "c:1700000001" });
    assert.equal((f.historial as Row[]).length, 1);
    assert.equal((f.resumen as Row).total, undefined);
    assert.equal((f.datos as Row).telefono, undefined);
    assert.match(String((await h("cl_guardar", "cos", { key: "c:1700000001", cambios: { alergias: "x" } })).error), /Solicitar/);
    assert.match(String((await h("cl_borrar", "cos", { key: "c:1700000001", motivo: "x" })).error), /Solicitar/);
    const s1 = await h("solicitud_crear", "cos", { tabla: "cliente_beta", fila: "c:1700000001", tipo: "cambio", motivo: "dato nuevo", propuestos: { alergias: "Nueces, látex" } });
    assert.equal(s1.ok, true, String(s1.error));
    assert.equal((await h("solicitud_resolver", "adm", { id: s1.id, aprobar: true })).ok, true);
    const f2 = await h("cl_get", "adm", { key: "c:1700000001" });
    assert.equal((f2.datos as Row).alergias, "Nueces, látex");
    assert.deepEqual(f2.corregidos, ["alergias"]);
    assert.equal(db.tables.get("clientas_registro")![1].alergias, "Nueces");
    const s2 = await h("solicitud_crear", "cos", { tabla: "cliente_beta", fila: "c:1700000001", tipo: "eliminacion", motivo: "duplicada" });
    assert.equal((await h("solicitud_resolver", "adm", { id: s2.id, aprobar: true })).ok, true);
    assert.equal(((await h("cl_list", "adm")).clientes as Row[]).some((c) => c.key === "c:1700000001"), false);
    assert.equal((await h("cl_restaurar", "adm", { key: "c:1700000001" })).ok, true);
  });
  it("admin edita directo y elimina con motivo", async () => {
    const { h } = semilla();
    assert.equal((await h("cl_guardar", "adm", { key: "c:1700000002", cambios: { telefono: "0992222222", cedula: "abc" } })).error, "Cédula inválida");
    assert.equal((await h("cl_guardar", "adm", { key: "c:1700000002", cambios: { telefono: "0992222222" } })).ok, true);
    assert.equal(((await h("cl_list", "adm")).clientes as Row[]).find((c) => c.key === "c:1700000002")!.telefono, "+593 99 222 2222");
    assert.match(String((await h("cl_borrar", "adm", { key: "c:1700000002" })).error), /motivo/);
  });
});
