// TK212: «Subido tarde» automático por fecha de factura vinculada o del voucher (OCR).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import "./handlers.ts";
import { candidatoTardeAuto, decidirTardeAuto, evaluarTardeAuto, evidenciaTarde, TARDE_AUTO_DESDE } from "./tarde_auto.ts";
import { factorComisionTicket } from "./fecha_atencion.ts";
import { agregarComprobante, OCR_HOOK } from "./tickets_beta_api.ts";
import { s, type Row } from "./domain.ts";

const NUEVO = { id: 9001, so_num: "TK-SO-3001", created_at: "2026-11-23T14:00:00.000Z", timestamp: "2026-11-23T09:00:00Z", orig: {} };
const PRE = { id: 646248, so_num: "TK-SO-1957", created_at: "2026-11-21T00:10:14.732Z", timestamp: "2026-11-20T19:10:11Z", orig: {} };

describe("TK212 · subido tarde automático", () => {
  it("solo tickets creados desde el deploy de TK210 (21/11 21:31 Ecuador)", () => {
    assert.equal(TARDE_AUTO_DESDE, "2026-11-22T02:31:00Z");
    assert.equal(candidatoTardeAuto(PRE), false, "TK-SO-1957 es anterior: nunca 50%");
    assert.equal(candidatoTardeAuto({ ...NUEVO, created_at: "2026-11-22T02:30:59Z" }), false);
    assert.equal(candidatoTardeAuto(NUEVO), true);
    assert.equal(decidirTardeAuto(PRE, { fecha: "2026-11-19", fuente: "factura", ref: "x" }), null);
  });
  it("factura de un día anterior → atención ese día; mismo día no", () => {
    const d = decidirTardeAuto(NUEVO, evidenciaTarde([{ factura: "001-001-000003001", fecha: "2026-11-22" }], []));
    assert.deepEqual(d && { fecha: d.fecha, dias: d.dias, fuente: d.ev.fuente }, { fecha: "2026-11-22", dias: 1, fuente: "factura" });
    assert.equal(decidirTardeAuto(NUEVO, evidenciaTarde([{ factura: "f", fecha: "2026-11-23" }], [])), null);
  });
  it("si la persona ya puso la fecha (prompt o corrección), no se toca", () => {
    const ev = { fecha: "2026-11-21", fuente: "factura" as const, ref: "f" };
    assert.equal(decidirTardeAuto({ ...NUEVO, orig: { fecha_atencion: "2026-11-22", subido_tarde: true } }, ev), null);
    assert.equal(decidirTardeAuto({ ...NUEVO, orig: { fecha_atencion: "2026-11-23" } }, ev), null);
    assert.equal(decidirTardeAuto({ ...NUEVO, orig: { fecha_atencion_hist: [{ de: "x", a: "y" }] } }, ev), null);
    assert.equal(decidirTardeAuto({ ...NUEVO, orig: { anulado: true } }, ev), null);
  });
  it("manda la factura; sin factura, el voucher más reciente (un abono viejo no corre la fecha); > 7 días no se adivina", () => {
    assert.equal(evidenciaTarde([{ factura: "f", fecha: "2026-11-23" }], [{ fecha: "2026-11-20", ref: "v" }])!.fuente, "factura");
    assert.equal(evidenciaTarde([], [{ fecha: "2026-11-19", ref: "a" }, { fecha: "2026-11-22", ref: "b" }])!.fecha, "2026-11-22");
    assert.equal(decidirTardeAuto(NUEVO, { fecha: "2026-11-10", fuente: "voucher", ref: "v" }), null);
  });
  it("al vincular factura (corrida del cuadre): marca, 50% y no toca tickets anteriores al deploy", async () => {
    const db = new MemoryDb();
    db.tables.set("tickets", [JSON.parse(JSON.stringify(NUEVO)), JSON.parse(JSON.stringify(PRE))]);
    db.tables.set("beta_cuadre_link", [
      { ticket_id: 9001, factura: "001-001-000003001", tipo: "numero", confianza: "alta" },
      { ticket_id: 646248, factura: "001-001-000002990", tipo: "numero", confianza: "alta" },
    ]);
    db.tables.set("beta_migo_facturas_vivo", [{ factura: "001-001-000003001", fecha: "2026-11-22" }, { factura: "001-001-000002990", fecha: "2026-11-19" }]);
    db.tables.set("beta_tickets", []);
    db.tables.set("paquetes", [{ id: 77, dia: 23, mes: 11, ano: 2026, orig: { so_num: "TK-SO-3001", ts: "2026-11-23T09:00:00Z" } }]);
    db.tables.set("log_acciones", []);
    const ctx = { db, now: new Date("2026-11-23T15:00:00Z"), env: {}, fetchImpl: fetch } as never;
    const out = await evaluarTardeAuto(ctx, "test");
    assert.equal(out.length, 1);
    const [nuevo, pre] = db.tables.get("tickets")!;
    assert.equal(s(nuevo.timestamp).slice(0, 10), "2026-11-22");
    assert.equal((nuevo.orig as Row).subido_tarde, true);
    assert.equal(((nuevo.orig as Row).tarde_auto as Row).fuente, "factura");
    assert.equal(factorComisionTicket(nuevo), 0.5);
    assert.equal(s(pre.timestamp), "2026-11-20T19:10:11Z", "1957 no cambia");
    assert.equal((pre.orig as Row).subido_tarde, undefined);
    assert.equal(factorComisionTicket(pre), 1);
    assert.equal(db.tables.get("paquetes")![0].dia, 22, "el paquete vendido toma el día real");
    // Idempotente: una segunda corrida no vuelve a escribir.
    assert.equal((await evaluarTardeAuto(ctx, "test")).length, 0);
  });
  it("al subir un voucher con fecha (OCR) anterior: marca subido tarde", async () => {
    const db = new MemoryDb();
    for (const t of ["beta_tickets", "beta_cuadre_link", "beta_migo_facturas_vivo", "paquetes", "log_acciones", "app_archivos", "beta_pagos"]) db.tables.set(t, []);
    db.tables.set("tickets", [JSON.parse(JSON.stringify(NUEVO))]);
    const prev = OCR_HOOK.leer;
    OCR_HOOK.leer = async (_c, _r, _cab, _d, item) => { item.ocr = { estado: "ok", fecha: "2026-11-22", monto: 15, referencia: "123" }; };
    try {
      const ctx = { db, now: new Date("2026-11-23T15:00:00Z"), env: {}, fetchImpl: fetch } as never;
      const ses = { name: "Prueba", rol: "cosmetologa", uid: "u" } as never;
      const x = await agregarComprobante(ctx, ses, db.tables.get("tickets")![0], "data:image/jpeg;base64,AAAA", "TK-SO-3001", "subió comprobante");
      assert.equal(x.ok, true, String(x.error));
      assert.equal((x.subido_tarde as Row).fecha_atencion, "2026-11-22");
      const tk = db.tables.get("tickets")![0];
      assert.equal(s(tk.timestamp).slice(0, 10), "2026-11-22");
      assert.equal(((tk.orig as Row).tarde_auto as Row).fuente, "voucher");
    } finally { OCR_HOOK.leer = prev; }
  });
});
