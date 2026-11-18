// TK99 (Emilia 18/11): canje de sesión de paquete en $0 → estado gris «Canje de paquete», línea con paquete + sesión n/N, fuera del cuadre Migo.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./productos_api.ts";
import "./tickets_beta_api.ts";
import { paqueteDeCanje, sesionPaquete, textoCanje, tipoSinCobro } from "./sin_cobro.ts";
import { exentoCuadre } from "./migo_cuadre.ts";
import type { Row } from "./domain.ts";

const TK = { id: 1, sheet_row: 2, so_num: "TK-SO-9911", timestamp: "2026-11-18T14:26:29Z", nombre: "Manuela", apellido: "Hinojosa", facial_hecho: "SUNSU-01 Facial S.O.S", paquete: "SI, 2/3", estimado: 0, cob: false, atendido_por: "Daniela" };

describe("TK99 · helpers", () => {
  it("canje de paquete en $0", () => {
    assert.deepEqual(sesionPaquete(TK), { n: 2, total: 3 });
    assert.equal(tipoSinCobro(TK), "canje");
    assert.equal(tipoSinCobro({ ...TK, estimado: 20 }), null, "si cobró algo no es sin cobro");
    assert.equal(tipoSinCobro({ ...TK, paquete: "NO" }), null);
    assert.equal(exentoCuadre(TK), true, "fuera del cuadre Migo");
  });
  it("elige el paquete por la fecha del uso; si no, el de N sesiones más reciente", () => {
    const P = [{ id: 1, codigo: "PQ-1", total: 3, usos: [] }, { id: 2, codigo: "PQ-2", total: 3, usos: [{ usado: true, fecha: "2026-11-18" }] }, { id: 3, codigo: "PQ-3", total: 6, usos: [] }];
    assert.equal(paqueteDeCanje(P, "2026-11-18", { n: 2, total: 3 })!.codigo, "PQ-2");
    assert.equal(paqueteDeCanje(P, "2026-11-19", { n: 2, total: 3 })!.codigo, "PQ-2", "el más reciente de 3");
    assert.equal(paqueteDeCanje(P, "2026-11-19", { n: 1, total: 6 })!.codigo, "PQ-3");
    assert.equal(textoCanje({ codigo: "PQ-2" }, { n: 2, total: 3 }), "Canje paquete PQ-2 · sesión 2/3");
  });
});

describe("TK99 · detalle", () => {
  it("línea del facial a $0 con paquete y sesión; chip gris; sin Por cobrar / Sin factura", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false }]);
    db.tables.set("catalogo", [{ sku: "SUNSU-01", producto_servicio: "FACIAL S.O.S", tipo: "FACIAL", total_con_iva: 80, subtotal: 69.57, activo: true }]);
    db.tables.set("tickets", [TK]);
    db.tables.set("paquetes", [{ id: 7, nombres: "Manuela", apellidos: "Hinojosa", sku: "SUNSU-17", paquete: "PAQUETE (3) FACIAL S.O.S", codigo: "PQ-0004" }]);
    for (const t of ["erp_productos", "erp_bodegas", "erp_stock", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "promos", "beta_tickets", "beta_ticket_lineas", "solicitudes_cambio", "clientas_registro", "beta_stock_movimientos", "beta_pagos", "beta_caja_movimientos", "beta_migo_facturas_vivo", "beta_ticket_flags", "gift_cards", "log_acciones", "beta_paquete_ajustes"]) if (!db.tables.has(t)) db.tables.set(t, []);
    const r = await handle("tk_get", { token: "adm", clave: "TK-SO-9911" }, { db, now: new Date("2026-11-18T21:30:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" } as never) as Row;
    const L = r.lineas as Row[];
    assert.equal(L.length, 1, JSON.stringify(r).slice(0, 300));
    assert.equal(L[0].precio_unit, 0); assert.equal(L[0].canje, true);
    assert.match(String(L[0].nombre), /Canje paquete .*sesión 2\/3/);
    const chips = (r.chips as Row[]).map((c) => c.t);
    assert.ok(chips.includes("Canje de paquete")); assert.ok(!chips.includes("Por cobrar")); assert.ok(!chips.includes("Sin factura"));
  });
});

describe("TK99 · pantallas", () => {
  const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
  const mm = readFileSync(new URL("../../../mc-maestro.js", import.meta.url), "utf8");
  it("lista y lista lateral: «Canje de paquete» gris", () => {
    assert.match(js, /x==='canje'\?'Canje de paquete'/);
    assert.match(mm, /"canje" \? "Canje de paquete"/);
  });
});
