import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./tickets_beta_api.ts";
import "./pagos_caja_api.ts";
import { metodoLegado, montoDe, saldoDe } from "./pagos_caja.ts";
import type { Row } from "./domain.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "rec", uid: "u-ale", rol: "recepcion", name: "Alejandra", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }, { id: "u-ale", nombre: "Alejandra", rol: "recepcion" }]);
  db.tables.set("tickets", [
    { id: 10, sheet_row: 10, so_num: "TK-SO-2001", beta_num: "", timestamp: "2026-11-17T15:00:00Z", nombre: "Ana", apellido: "Ruiz", atendido_por: "Alejandra", estimado: 80, cob: false, comp: "" },
    { id: 11, sheet_row: 11, so_num: "TK-SO-2002", timestamp: "2026-11-17T16:00:00Z", nombre: "Bea", apellido: "Paz", atendido_por: "Alejandra", estimado: 50, cob: true, comp: "Tarje:2505" },
  ]);
  db.tables.set("caja_chica", [{ sheet_row: 1, fecha_hora: "13/11/2026 15:34", tipo: "💸 DESCARGA", saldo: 236.57 }]);
  for (const t of ["beta_pagos", "beta_caja_movimientos", "beta_caja_cierres", "log_acciones", "app_archivos", "beta_tickets"]) db.tables.set(t, []);
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { db, now: new Date("2026-11-17T22:00:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: tok } as never) as Promise<Row>;
  return { db, h };
}

describe("💵 Pagos + caja chica", () => {
  it("reglas puras", () => {
    assert.equal(montoDe("12,5"), 12.5); assert.ok(Number.isNaN(montoDe("-1")));
    assert.equal(saldoDe([{ entrada: 100 }, { salida: 30 }, { salida: 50, anulado: true }]), 70);
    assert.equal(metodoLegado([{ metodo: "tarjeta" }, { metodo: "efectivo" }]), "mixto");
    assert.equal(metodoLegado([]), "sin");
  });

  it("abre la caja con el saldo de la hoja (sin escribir la hoja), gastos, cuadre y anular", async () => {
    const { db, h } = semilla();
    assert.match(String((await h("cj_mov", "rec", { tipo: "gasto", monto: 5, detalle: "x" })).error), /abre la caja/);
    assert.equal((await h("cj_iniciar", "rec", { desdeHoja: true })).error, "Solo un admin abre la caja");
    assert.equal((await h("cj_iniciar", "adm", { desdeHoja: true })).saldo, 236.57);
    assert.equal((await h("cj_iniciar", "adm", { monto: 10 })).error, "La caja ya está abierta");
    assert.equal(db.tables.get("caja_chica")!.length, 1);
    assert.equal((await h("cj_mov", "rec", { tipo: "gasto", monto: 5 })).error, "Escribe el detalle / justificativo");
    assert.match(String((await h("cj_mov", "rec", { tipo: "gasto", monto: 999, detalle: "x" })).error), /Fondos insuficientes/);
    const g = await h("cj_mov", "rec", { tipo: "gasto", monto: "16.57", categoria: "Limpieza", detalle: "Desinfectante" });
    assert.equal(g.saldo, 220);
    assert.equal((await h("cj_mov", "rec", { tipo: "propina_entrada", monto: 10, detalle: "Propina Ana" })).saldo, 230);
    assert.match(String((await h("cj_cuadre", "rec", { contado: 228 })).error), /escribe una nota/);
    const c = await h("cj_cuadre", "rec", { contado: 228, nota: "faltan 2" });
    assert.equal(c.diferencia, -2);
    const r = await h("cj_resumen", "rec", { desde: "2026-11-17", hasta: "2026-11-17" });
    assert.equal(r.saldo, 228); assert.equal((r.cierres as Row[]).length, 1);
    assert.equal(((r.movimientos as Row[])[0]).tipo, "cuadre");
    assert.equal((await h("cj_anular", "rec", { id: g.id, motivo: "error" })).error, "Solo un admin anula movimientos");
    assert.equal((await h("cj_anular", "adm", { id: g.id, motivo: "duplicado" })).ok, true);
    assert.equal((await h("cj_resumen", "adm")).saldo, 244.57);
  });

  it("pagos del ticket: efectivo entra a la caja, saldo, voucher obligatorio, anular revierte la caja", async () => {
    const { db, h } = semilla();
    await h("cj_iniciar", "adm", { monto: 0 });
    const t0 = await h("pg_ticket", "rec", { clave: "TK-SO-2001", total: 80 });
    assert.equal(t0.saldo, 80, JSON.stringify(t0));
    assert.equal((await h("pg_registrar", "rec", { clave: "TK-SO-2001", total: 80, metodo: "tarjeta", monto: 30 })).error, "Escribe el número de voucher / comprobante");
    const sinFoto = await h("pg_registrar", "rec", { clave: "TK-SO-2001", total: 80, metodo: "tarjeta", monto: 30, ref: "778" });
    assert.equal(sinFoto.error, "Toma la foto del voucher de la tarjeta");
    assert.equal(db.tables.get("beta_pagos")!.length, 0);
    assert.equal((await h("pg_registrar", "rec", { clave: "TK-SO-2001", total: 80, metodo: "tarjeta", monto: 30, ref: "778", imagen: "data:image/jpeg;base64,AAAA" })).saldo, 50);
    // TK42: la foto queda en la misma bodega que tk_subir_doc (beta_tickets.datos.comprobantes → apaga el amarillo)
    const cab = db.tables.get("beta_tickets")!.find((c) => c.clave === "TK-SO-2001")!;
    assert.equal(((cab.datos as Record<string, unknown>).comprobantes as unknown[]).length, 1);
    assert.equal(db.tables.get("app_archivos")!.length, 1);
    const ef = await h("pg_registrar", "rec", { clave: "TK-SO-2001", total: 80, metodo: "efectivo", monto: 50 });
    assert.equal(ef.saldo, 0);
    assert.equal((await h("cj_resumen", "rec")).saldo, 50);
    const mayor = await h("pg_registrar", "rec", { clave: "TK-SO-2001", total: 80, metodo: "efectivo", monto: 5 });
    assert.equal(mayor.mayor, true);
    // el movimiento de efectivo no se anula desde la caja
    const mov = db.tables.get("beta_caja_movimientos")!.find((m) => m.tipo === "efectivo_ticket")!;
    assert.match(String((await h("cj_anular", "adm", { id: mov.id, motivo: "x" })).error), /anula el pago/);
    assert.equal((await h("pg_anular", "adm", { id: ef.id, motivo: "se registró dos veces" })).ok, true);
    assert.equal((await h("cj_resumen", "rec")).saldo, 0);
    assert.equal((await h("pg_ticket", "rec", { clave: "TK-SO-2001", total: 80 })).saldo, 50);
    // ticket cobrado en el sistema anterior: saldo 0
    assert.equal((await h("pg_ticket", "rec", { clave: "TK-SO-2002", total: 50 })).saldo, 0);
    const L = await h("pg_lista", "rec", { desde: "2026-11-17", hasta: "2026-11-17" });
    const tot = Object.fromEntries((L.totales as Row[]).map((x) => [x.metodo, x.total]));
    assert.deepEqual(tot, { tarjeta: 80 });
    assert.equal((L.items as Row[]).length, 3);
  });
});
