import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./tickets_beta_api.ts";
import "./pagos_caja_api.ts";
import { estadoCobro, filasPagoLegado, metodosPago } from "./pagos_caja.ts";
import { facturaCompleta, hayFactura } from "./tickets_beta_api.ts";
import type { Row } from "./domain.ts";

describe("TK82 redondeo cobrado + pagos legado", () => {
  it("reglas: 1 centavo es redondeo, no saldo; > $0.05 no", () => {
    const a = estadoCobro({ cobrado: true, cobradoMonto: 129.99, totalLineas: 130, pagadoBeta: 0 });
    assert.equal(a.total, 129.99);
    assert.equal(a.pagado, 129.99);
    assert.equal(a.saldo, 0);
    assert.equal(a.redondeo, true);
    assert.equal(a.dif, 0.01);

    const b = estadoCobro({ cobrado: true, cobradoMonto: 130, totalLineas: 129.99 });
    assert.equal(b.total, 130);
    assert.equal(b.saldo, 0);
    assert.equal(b.redondeo, true);

    const c = estadoCobro({ cobrado: true, cobradoMonto: 100, totalLineas: 100.06 });
    assert.equal(c.redondeo, false);
    assert.equal(c.total, 100.06);
    assert.equal(c.saldo, 0.06);

    const d = estadoCobro({ cobrado: true, cobradoMonto: 50, totalLineas: 50, pagadoBeta: 0, anulado: true });
    assert.equal(d.saldo, 0);

    const e = estadoCobro({ cobrado: false, cobradoMonto: 0, totalLineas: 80, pagadoBeta: 30, anulado: true });
    assert.equal(e.saldo, 0);
    assert.equal(e.pagado, 30);
  });

  it("filas legado: tarjeta + voucher 950, no 'efectivo'", () => {
    const f = filasPagoLegado("Tarje:950", 129.99, "2026-11-18T12:00:00Z");
    assert.equal(f.length, 1);
    assert.equal(f[0].metodo, "tarjeta");
    assert.equal(f[0].ref, "950");
    assert.equal(f[0].monto, 129.99);
    assert.equal(f[0].fuente, "sistema");
    assert.equal(f[0].registrado_por, "Sistema anterior");
    assert.equal(metodosPago("Tarje:950")[0].metodo, "tarjeta");

    const t = filasPagoLegado("Trans:43959839", 80);
    assert.equal(t[0].metodo, "transferencia");
    assert.equal(t[0].ref, "43959839");

    const ef = filasPagoLegado("Efect:10", 10);
    assert.equal(ef[0].metodo, "efectivo");

    const mix = filasPagoLegado("Tarje:953, Trans:12", 100);
    assert.equal(mix.length, 1);
    assert.equal(mix[0].metodo, "mixto");
    assert.match(String(mix[0].ref), /953/);
    assert.match(String(mix[0].ref), /12/);

    const split = filasPagoLegado("Tarje: $80, Trans: $20", 100);
    assert.equal(split.length, 2);
    assert.deepEqual(split.map((x) => [x.metodo, x.monto]).sort(), [["tarjeta", 80], ["transferencia", 20]].sort());
  });

  it("pg_ticket: Emilia (Andrea Robles) $130 vs cobrado $129.99 → saldo 0 y fila tarjeta 950", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }]);
    db.tables.set("tickets", [
      { id: 81, sheet_row: 81, so_num: "TK-SO-2081", timestamp: "2026-11-18T17:00:00Z", nombre: "Andrea", apellido: "Robles", atendido_por: "Andrea", estimado: 129.99, cob: true, comp: "Tarje:950" },
      { id: 82, sheet_row: 82, so_num: "TK-SO-2082", timestamp: "2026-11-18T17:10:00Z", nombre: "Ana", apellido: "X", atendido_por: "Andrea", estimado: 80, cob: false, comp: "", orig: { anulado: true } },
    ]);
    for (const t of ["beta_pagos", "beta_caja_movimientos", "beta_caja_cierres", "log_acciones", "app_archivos", "beta_tickets"]) db.tables.set(t, []);
    const h = (a: string, p: Row = {}) => handle(a, { token: "adm", ...p }, { db, now: new Date("2026-11-18T22:00:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" } as never) as Promise<Row>;

    const t0 = await h("pg_ticket", { clave: "TK-SO-2081", total: 130 });
    assert.equal(t0.saldo, 0, JSON.stringify(t0));
    assert.equal(t0.total, 129.99);
    assert.equal(t0.redondeo, true);
    assert.equal(t0.legado, 129.99);
    const L = t0.pagosLegado as Row[];
    assert.equal(L.length, 1);
    assert.equal(L[0].metodo, "tarjeta");
    assert.equal(L[0].ref, "950");
    assert.equal(L[0].monto, 129.99);

    const bad = await h("pg_registrar", { clave: "TK-SO-2081", total: 130, metodo: "efectivo", monto: 0.01 });
    assert.match(String(bad.error), /ya está pagado/);
    assert.equal(db.tables.get("beta_pagos")!.length, 0);

    const can = await h("pg_ticket", { clave: "TK-SO-2082", total: 80 });
    assert.equal(can.saldo, 0);
    assert.equal(can.anulado, true);
    const bad2 = await h("pg_registrar", { clave: "TK-SO-2082", total: 80, metodo: "efectivo", monto: 80 });
    assert.match(String(bad2.error), /cancelado/);
  });

  it("front: sin default Efectivo, Elige…, prefill solo si saldo > $0.05, ajuste y filas legado", () => {
    const caja = readFileSync(new URL("../../../mc-caja.js", import.meta.url), "utf8");
    const tk = readFileSync(new URL("../../../mc-tickets.js", import.meta.url), "utf8");
    assert.match(caja, /Elige…/);
    assert.match(caja, /saldo > 0\.05/);
    assert.match(caja, /pagosLegado/);
    assert.doesNotMatch(caja, /Cobrado en el sistema anterior/);
    assert.match(caja, /r\.saldo/);
    assert.match(tk, /Ajuste por redondeo/);
    assert.match(tk, /0\.05/);
    assert.match(tk, /redondeo \? cobrado : c\.total/);
  });

  it("SIN FACTURA no cuenta como facturado; un número sí", () => {
    assert.equal(facturaCompleta("SIN FACTURA"), "");
    assert.equal(hayFactura("SIN FACTURA"), false);
    assert.equal(hayFactura(""), false);
    assert.equal(hayFactura("1639.0"), true);
    assert.equal(hayFactura("", "001-001-000001639"), true);
    assert.equal(hayFactura("1640", "SIN FACTURA"), true);
  });
});
