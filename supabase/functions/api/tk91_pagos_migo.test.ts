// TK91 (Emilia 18/11): pago mixto de Migo → Pagos del ticket, cada forma con su monto; nunca duplica.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./productos_api.ts";
import "./tickets_beta_api.ts";
import "./pagos_caja_api.ts";
import { metodoDeMigo, pagosMigoParaTicket, marcaPagoMigo } from "./migo_cuadre_api.ts";
import { parseFacturaVivo } from "./migo_cuadre.ts";
import type { Row } from "./domain.ts";

const FAC = "001-001-000002999";
const inv = parseFacturaVivo({ factura: FAC, fecha: "2026-11-18", cliente: "ANA RUIZ", total: 171.5, forma: "mixto", formas_pago: [{ forma: "efectivo", valor: 100 }, { forma: "transferencia", valor: 50 }, { forma: "tarjeta", valor: 21.5 }] })!;

describe("TK91 · formas de pago de Migo", () => {
  it("lee el pago mixto con montos", () => {
    assert.deepEqual(inv.formas_pago, [{ forma: "efectivo", valor: 100 }, { forma: "transferencia", valor: 50 }, { forma: "tarjeta", valor: 21.5 }]);
    assert.equal(metodoDeMigo("Cliente (Crédito) — Crédito 0 días"), "");
    assert.equal(metodoDeMigo("Nota de Crédito"), "");
    assert.equal(metodoDeMigo("Tarjeta"), "tarjeta");
  });
  it("copia las 3 formas; no repite las que el ticket ya tiene ni las ya copiadas", () => {
    assert.deepEqual(pagosMigoParaTicket(inv, []).map((x) => [x.metodo, x.monto]), [["efectivo", 100], ["transferencia", 50], ["tarjeta", 21.5]]);
    const ya = [{ id: "a", metodo: "efectivo", monto: 100 }, { id: "b", metodo: "tarjeta", monto: 21.5, nota: marcaPagoMigo(FAC, 2) }];
    assert.deepEqual(pagosMigoParaTicket(inv, ya).map((x) => [x.metodo, x.monto]), [["transferencia", 50]]);
    assert.deepEqual(pagosMigoParaTicket(inv, [{ id: "c", metodo: "otro", monto: 171.5 }]), [], "ya pagado: nada");
  });
});

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false }]);
  db.tables.set("catalogo", [{ sku: "SUNSU-40", producto_servicio: "FACIAL RESET", tipo: "FACIAL", total_con_iva: 171.5, subtotal: 149.13, activo: true }]);
  db.tables.set("tickets", [{ id: 3000, sheet_row: 3001, so_num: "TK-SO-3000", timestamp: "2026-11-18T15:00:00Z", nombre: "Ana", apellido: "Ruiz", facial_hecho: "SUNSU-40 Facial Reset", estimado: 0, fac: true, fac_7: "2999", cob: false, comp: "" },
    { id: 3002, sheet_row: 3003, so_num: "TK-SO-3002", timestamp: "2026-11-18T17:00:00Z", nombre: "Carla", apellido: "Mora", facial_hecho: "SUNSU-40 Facial Reset", estimado: 171.5, fac: true, fac_7: "2998", cob: true, comp: "Tarje:950" },
    { id: 3001, sheet_row: 3002, so_num: "TK-SO-3001", timestamp: "2026-11-18T16:00:00Z", nombre: "Bea", apellido: "Paz", facial_hecho: "SUNSU-40 Facial Reset", estimado: 0, cob: false, comp: "" }]);
  db.tables.set("beta_migo_facturas_vivo", []);
  for (const t of ["erp_productos", "erp_bodegas", "erp_stock", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "promos", "beta_tickets", "beta_ticket_lineas", "solicitudes_cambio", "clientas_registro", "beta_stock_movimientos", "beta_migo_lineas", "beta_cuadre_link", "beta_ticket_cancelados", "beta_migo_borradores", "log_acciones", "beta_migo_importes", "beta_ticket_flags", "beta_pagos", "beta_caja_movimientos", "beta_caja_cierres", "app_archivos"]) db.tables.set(t, []);
  const h = (a: string, p: Row = {}) => handle(a, { token: "adm", ...p }, { db, now: new Date("2026-11-18T21:30:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" } as never) as Promise<Row>;
  return { db, h };
}

describe("TK91 · import Migo → Pagos del ticket", () => {
  it("una factura con efectivo + transferencia + tarjeta deja 3 pagos, saldo 0, sin caja ni duplicados", async () => {
    const { db, h } = semilla();
    const fac = { factura: FAC, fecha: "2026-11-18", cliente: "ANA RUIZ", total: 171.5, forma: "mixto", formas_pago: inv.formas_pago, lineas: [] };
    const r = await h("migo_importar", { facturas: [fac] });
    assert.equal(r.ok, true, JSON.stringify(r));
    const P = () => db.tables.get("beta_pagos")!;
    assert.deepEqual(P().map((p) => [p.metodo, p.monto]), [["efectivo", 100], ["transferencia", 50], ["tarjeta", 21.5]]);
    assert.equal(db.tables.get("beta_caja_movimientos")!.length, 0, "el efectivo de Migo no entra otra vez a la caja");
    assert.equal(db.tables.get("log_acciones")!.filter((x) => x.accion === "PAGO MIGO").length, 3);
    assert.equal(db.tables.get("beta_migo_facturas_vivo")![0].formas_pago.length, 3);
    await h("migo_importar", { facturas: [fac] });
    assert.equal(P().length, 3, "la siguiente importación no duplica");
    const e = await h("pg_ticket", { clave: "TK-SO-3000", total: 171.5 });
    assert.equal(e.saldo, 0);
  });
  it("Pagos del ticket: varios pagos con distintas formas hasta saldo 0", async () => {
    const { h } = semilla();
    const foto = "data:image/png;base64,iVBORw0KGgo=";
    let r = await h("pg_registrar", { clave: "TK-SO-3001", total: 171.5, metodo: "efectivo", monto: 100 });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.saldo, 71.5);
    r = await h("pg_registrar", { clave: "TK-SO-3001", total: 171.5, metodo: "transferencia", monto: 50, ref: "123", imagen: foto });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.saldo, 21.5);
    r = await h("pg_registrar", { clave: "TK-SO-3001", total: 171.5, metodo: "tarjeta", monto: 21.5, ref: "950", imagen: foto });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.saldo, 0);
    r = await h("pg_registrar", { clave: "TK-SO-3001", total: 171.5, metodo: "efectivo", monto: 1 });
    assert.match(String(r.error), /ya está pagado/);
  });
});

describe("TK91 · ticket ya cobrado en el sistema anterior", () => {
  it("no copia (no duplica): Pagos muestra el cobro repartido con las formas de Migo", async () => {
    const { db, h } = semilla();
    const fac = { factura: "001-001-000002998", fecha: "2026-11-18", cliente: "CARLA MORA", total: 171.5, forma: "mixto", formas_pago: [{ forma: "efectivo", valor: 100 }, { forma: "tarjeta", valor: 71.5 }], lineas: [] };
    await h("migo_importar", { facturas: [fac] });
    assert.equal(db.tables.get("beta_pagos")!.length, 0);
    const e = await h("pg_ticket", { clave: "TK-SO-3002", total: 171.5 });
    assert.deepEqual((e.pagosLegado as Row[]).map((p) => [p.metodo, p.monto]), [["efectivo", 100], ["tarjeta", 71.5]]);
    assert.equal(e.saldo, 0);
  });
});

