import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./multas_beta_api.ts";
import { mismaPersonaMulta, multasBetaRol, esTipoDescuento, detalleMultasSistema } from "./multas_beta_api.ts";
import type { Row } from "./domain.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Daniela Mora", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }, { id: "u-ana", nombre: "Daniela Mora", rol: "cosmetologa" }]);
  db.tables.set("beta_multa_tipos", [{ id: "t1", nombre: "Clienta insatisfecha", monto: 10, activo: true, orden: 1 }, { id: "t2", nombre: "No limpió bien", monto: 5, activo: true, orden: 2 }]);
  db.tables.set("multas_descuentos", [{ id: 9, sheet_row: 30, fecha: "2026-11-10T00:00:00Z", cosmetologa: "Daniela Mora", tipo: "MULTA", monto: 5, motivo: "vieja" }]);
  for (const t of ["beta_multas", "log_acciones"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-17T18:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}

describe("Multas beta", () => {
  it("mismaPersonaMulta", () => {
    assert.ok(mismaPersonaMulta("Daniela Mora", "Daniela"));
    assert.ok(mismaPersonaMulta("DANIELA MORA", "Daniela Mora"));
    assert.ok(!mismaPersonaMulta("Daniela Mora", "Andrea Robles"));
  });
  it("aplicar desde ticket, monto por defecto, lista unificada, editar, anular y rol", async () => {
    const { db, h } = semilla();
    assert.match(String((await h("mt_crear", "cos", { persona: "Daniela Mora", tipoId: "t1", motivo: "xx prueba" })).error), /admin/);
    assert.match(String((await h("mt_crear", "adm", { persona: "Daniela Mora", tipoId: "t1", motivo: "" })).error), /motivo/);
    const c = await h("mt_crear", "adm", { persona: "Daniela Mora", tipoId: "t1", motivo: "Clienta molesta", fecha: "2026-11-17", ticketId: 605161, ticketSo: "TK-SO-1894" });
    assert.equal(c.ok, true, String(c.error));
    assert.equal(Number(db.tables.get("beta_multas")![0].monto), 10);
    const l = await h("mt_lista", "adm", { persona: "Daniela", mes: "2026-11" });
    assert.equal((l.items as Row[]).length, 2);
    assert.equal(l.total, 15);
    const mine = await h("mt_lista", "cos", {});
    assert.equal((mine.items as Row[]).length, 2);
    assert.equal((await h("mt_editar", "adm", { id: c.id, monto: 7 })).ok, true);
    let r = await multasBetaRol(db, "Daniela", "2026-10-26", "2026-11-25");
    assert.equal(r.total, 7);
    assert.equal(r.detalle[0].motivo, "Clienta molesta (TK-SO-1894)");
    assert.equal((await h("mt_anular", "adm", { id: c.id, motivo: "error de tipo" })).ok, true);
    r = await multasBetaRol(db, "Daniela", "2026-10-26", "2026-11-25");
    assert.equal(r.total, 0);
    assert.equal(((await h("mt_lista", "adm", { anuladas: true })).items as Row[]).filter((m) => m.estado === "anulada").length, 1);
    const hist = db.tables.get("beta_multas")![0].historial as Row[];
    assert.equal(hist.length, 3);
  });
  it("tipos: admin edita y agrega", async () => {
    const { h } = semilla();
    const r = await h("mt_tipo_guardar", "adm", { nombre: "Llegó tarde", monto: 3 });
    assert.equal(r.ok, true);
    assert.equal((r.tipos as Row[]).length, 3);
    assert.match(String((await h("mt_tipo_guardar", "adm", { nombre: "llegó tarde", monto: 4 })).error), /existe/);
    assert.match(String((await h("mt_tipo_guardar", "cos", { nombre: "X", monto: 4 })).error), /admin/);
  });
  it("descuento con monto libre entra al rol y se puede editar", async () => {
    const { db, h } = semilla();
    assert.equal(esTipoDescuento("DESCUENTO"), true);
    assert.equal(esTipoDescuento("Descuento (producto / otro)"), true);
    assert.equal(esTipoDescuento("Clienta insatisfecha"), false);
    const c = await h("mt_crear", "adm", { persona: "Andrea Robles", tipo: "Descuento", monto: 32.5, motivo: "Crema Aroms que se descuenta", fecha: "2026-11-25" });
    assert.equal(c.ok, true, String(c.error));
    assert.equal(Number(db.tables.get("beta_multas")![0].monto), 32.5);
    assert.equal(String(db.tables.get("beta_multas")![0].tipo), "Descuento");
    const l = await h("mt_lista", "adm", { persona: "Andrea Robles", tipo: "DESCUENTO" });
    const beta = (l.items as Row[]).filter((m) => m.fuente === "beta");
    assert.equal(beta.length, 1);
    assert.equal(beta[0].clase, "DESCUENTO");
    const r = await multasBetaRol(db, "Andrea Robles", "2026-10-26", "2026-11-25");
    assert.equal(r.total, 32.5);
    assert.equal(r.detalle[0].tipo, "DESCUENTO");
    assert.equal(r.detalle[0].motivo, "Crema Aroms que se descuenta");
    assert.equal((await h("mt_editar", "adm", { id: c.id, monto: 40, motivo: "Crema Aroms ajustada" })).ok, true);
    const r2 = await multasBetaRol(db, "Andrea Robles", "2026-10-26", "2026-11-25");
    assert.equal(r2.total, 40);
    assert.equal(r2.detalle[0].motivo, "Crema Aroms ajustada");
    const antes = await multasBetaRol(db, "Andrea Robles", "2026-09-26", "2026-10-25");
    assert.equal(antes.total, 0);
    db.tables.get("multas_descuentos")!.push({ id: 11, fecha: "2026-11-01T00:00:00Z", cosmetologa: "Andrea Robles", tipo: "DESCUENTO", monto: 25, motivo: "7/8 Sandalo" });
    const sis = await detalleMultasSistema(db, "Andrea", "2026-10-26", "2026-11-25");
    assert.equal(sis.length, 1);
    assert.equal(sis[0].tipo, "DESCUENTO");
    assert.equal(sis[0].motivo, "7/8 Sandalo");
  });
});
