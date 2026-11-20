// TK185 (Emilia t805u): fecha de regreso en el formato en que la escriben; la edición no pierde el prorrateo del paquete.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./tickets_beta_api.ts";
import "./ticket_edicion_api.ts";
import "./inline_api.ts";
import "./aprobaciones_api.ts";
import { type Row } from "./domain.ts";
import { leerFecha, fechaComo } from "./fecha_flexible.ts";
import { diffCampos } from "./propuesta_edicion.ts";
import { conservarProrrateo } from "./ticket_edicion_api.ts";

const root = new URL("../../../", import.meta.url);
const file = (n: string) => readFileSync(new URL(n, root), "utf8");
const CED = "1712345678";

function semilla(extra: Record<string, Row[]> = {}) {
  const db = new MemoryDb({
    sesiones: [
      { token: "and", uid: "u-andrea", rol: "cosmetologa", name: "Andrea Robles", exp: "2099-01-01T00:00:00.000Z" },
      { token: "emi", uid: "u-emi", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
      { token: "ana", uid: "u-ana", rol: "recepcion", name: "Ana Pérez", exp: "2099-01-01T00:00:00.000Z" },
    ],
    usuarios: [
      { id: "u-andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      { id: "u-emi", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
      { id: "u-ana", nombre: "Ana Pérez", short: "Ana", rol: "recepcion", bloqueado: false },
    ],
    cosmetologas: [{ id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true, comision_faciales: true }],
    catalogo: [
      { sku: "SUNSU-40", producto_servicio: "Facial Reset 3x1 Hidratación Profunda con Ampolla PDRN", tipo: "FACIAL", total_con_iva: 95, subtotal: 82.61, activo: true, orig: {} },
      { sku: "SUNSU-31", producto_servicio: "Hollywood Peel", tipo: "EXTRA", total_con_iva: 15, subtotal: 13.04, activo: true, orig: {} },
      { sku: "SUNSU-AS-002", producto_servicio: "Ampoule", tipo: "PRODUCTO", total_con_iva: 1.58, subtotal: 1.37, activo: true, precio_compra: 0.4, orig: {} },
    ],
    tickets: [{
      id: 1938, sheet_row: 1938, so_num: "TK-SO-1938", timestamp: "2026-11-19T16:00:00Z",
      atendido_por: "Andrea Robles", nombre: "María", apellido: "R", id_3: CED,
      facial_hecho: "SUNSU-40 Facial Reset 3x1", servicios_adicionales: "SUNSU-31 Hollywood Peel",
      estimado: 46.46, paquete: "", orig: {},
    }],
    beta_tickets: [{ id: 1, ticket_id: 1938, clave: "TK-SO-1938", lineas_beta: true, datos: {} }],
    beta_ticket_lineas: [
      { id: 1, ticket_id: 1938, ticket_clave: "TK-SO-1938", tipo: "facial", sku: "40", nombre: "Facial Reset 3x1 Hidratación Profunda con Ampolla PDRN", cantidad: 1, precio_unit: 95, total_linea: 31.46, descuento_tipo: "$", descuento_valor: 63.54, orden: 1 },
      { id: 2, ticket_id: 1938, ticket_clave: "TK-SO-1938", tipo: "extra", sku: "31", nombre: "Hollywood Peel", cantidad: 1, precio_unit: 15, total_linea: 15, descuento_tipo: null, descuento_valor: 0, orden: 2 },
    ],
    paquetes: [], erp_bodegas: [], erp_stock: [], erp_movimientos: [], app_modulos: [], cabina_inventario: [],
    inventario_base: [], promos: [], solicitudes_cambio: [], clientas_registro: [],
    beta_stock_movimientos: [], beta_ticket_snaps: [], beta_cuadre_link: [], beta_pagos: [], beta_ticket_flags: [],
    beta_migo_facturas_vivo: [], beta_sku_alias: [], log_acciones: [], beta_notificaciones: [], beta_clientes: [],
    erp_productos: [{ id: "p1", sku: "AS-002", nombre: "Ampoule", clase: "producto", uso: "venta", activo: true }],
    app_archivos: [],
    ...extra,
  });
  const c = { db, now: new Date("2026-11-19T23:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok } as never) as Promise<Row>;
  return { db, h };
}

const formDaniela = {
  facial: "SUNSU-40 Facial Reset 3x1", facialPrecio: 95, cobro: "cobrado", extras: "SUNSU-31 Hollywood Peel", precios_extra: { "SUNSU-31": 15 },
  nombre: "María", apellido: "R", cedula: CED, factura: "",
  notas: "Se realizan extracciones en mentón, nariz y frente.", recomendaciones: "Serum PDRN y vitamina C.", fechaRetorno: "12/19/2026",
};

describe("TK185 fecha flexible", () => {
  it("acepta MM/DD/AAAA, DD/MM/AAAA (>12), ISO y calendario nativo; rechaza basura", () => {
    assert.deepEqual(leerFecha("12/19/2026"), { iso: "2026-12-19", estilo: "mdy" });
    assert.deepEqual(leerFecha("19/12/2026"), { iso: "2026-12-19", estilo: "dmy" });
    assert.deepEqual(leerFecha("2026-12-19"), { iso: "2026-12-19", estilo: "iso" });
    assert.deepEqual(leerFecha("2026-12-19T00:00:00"), { iso: "2026-12-19", estilo: "iso" });
    assert.equal(leerFecha("1/5/2027")?.iso, "2027-01-05");
    assert.equal(leerFecha("19-12-26")?.iso, "2026-12-19");
    assert.equal(leerFecha("31/02/2026"), null);
    assert.equal(leerFecha("mañana"), null);
    assert.equal(fechaComo("2026-12-19", "mdy"), "12/19/2026");
    assert.equal(fechaComo("2026-12-19", "dmy"), "19/12/2026");
  });
  it("misma fecha escrita distinto no es cambio; el cambio se muestra como ellas la escriben", () => {
    assert.deepEqual(diffCampos({ retorno: "2026-12-19" }, { retorno: "12/19/2026" }, true), []);
    const d = diffCampos({ retorno: "2026-12-01" }, { retorno: "12/19/2026" }, true);
    assert.equal(d[0].antes, "12/01/2026"); assert.equal(d[0].despues, "12/19/2026");
  });
  it("ya no existe el error «Fecha de regreso: AAAA-MM-DD»", () => {
    assert.doesNotMatch(file("supabase/functions/api/tickets_beta_api.ts"), /Fecha de regreso: AAAA-MM-DD/);
  });
});

describe("TK185 propuesta de edición sin cambios de precio fantasma", () => {
  it("conservarProrrateo mantiene el descuento de paquete si no cambió cantidad ni precio", () => {
    const antes = [{ tipo: "facial", sku: "40", cantidad: 1, precio_unit: 95, descuento_tipo: "$", descuento_valor: 63.54 }];
    assert.equal(conservarProrrateo([{ tipo: "facial", sku: "40", nombre: "x", cantidad: 1, precio_unit: 95 }], antes)[0].descuento_valor, 63.54);
    assert.equal(conservarProrrateo([{ tipo: "facial", sku: "40", nombre: "x", cantidad: 1, precio_unit: 80 }], antes)[0].descuento_valor, undefined);
    assert.equal(conservarProrrateo([{ tipo: "facial", sku: "40", nombre: "x", cantidad: 1, precio_unit: 95, descuento_tipo: "%", descuento_valor: 10 }], antes)[0].descuento_valor, 10);
  });
  it("la chica pide notas/recomendaciones/fecha 12/19/2026: sin cambios de líneas, total ni comisión; la admin aprueba y se guarda 2026-12-19", async () => {
    const { db, h } = semilla();
    const r = await h("tk_edicion_pedir", "and", { clave: "TK-SO-1938", motivo: "No se reflejan las recomendaciones", form: formDaniela });
    assert.equal(r.error, undefined, String(r.error));
    const diff = r.diff as Row;
    assert.ok((diff.lineas as Row[]).every((l) => l.estado === "igual"), JSON.stringify(diff.lineas));
    const tt = diff.totales as Row;
    assert.equal((tt.despues as Row).total, (tt.antes as Row).total);
    const sol = (await db.all("solicitudes_cambio")).find((x) => x.id === r.id) as Row;
    const com = ((sol.propuestos as Row).diff as Row).comision as Row;
    assert.equal(com.despues, com.antes);
    const ret = (diff.cabecera as Row[]).find((c) => c.clave === "retorno");
    const solD = (await db.all("solicitudes_cambio")).find((x) => x.id === r.id) as Row;
    assert.deepEqual(Object.keys((solD.propuestos as Row).datos as Row).sort(), ["notas", "recomendaciones", "retorno"], "solo lo que cambia (nunca factura vacía)");
    assert.equal(ret?.despues, "12/19/2026");
    const apr = await h("solicitud_resolver", "emi", { id: r.id, aprobar: true });
    assert.equal(apr.error, undefined, String(apr.error));
    const cab = (await db.all("beta_tickets")).find((c) => c.clave === "TK-SO-1938") as Row;
    assert.equal((cab.datos as Row).retorno, "2026-12-19");
    const L = (await db.all("beta_ticket_lineas")).filter((l) => l.ticket_clave === "TK-SO-1938" && l.tipo === "facial");
    assert.ok(L.length >= 1 && L.every((l) => Number(l.descuento_valor) === 63.54), JSON.stringify(L));
  });
  it("propuesta vieja (sin prorrateo en las líneas, fecha 12/19/2026) se aprueba sin subir el total", async () => {
    const { db, h } = semilla();
    const r = await h("tk_edicion_pedir", "and", { clave: "TK-SO-1938", motivo: "x", form: formDaniela });
    const sols = await db.all("solicitudes_cambio");
    const sol = sols.find((x) => x.id === r.id) as Row;
    (sol.propuestos as Row).lineas = [
      { tipo: "facial", sku: "40", nombre: "SUNSU-40 Facial Reset 3x1", cantidad: 1, precio_unit: 95 },
      { tipo: "extra", sku: "31", nombre: "SUNSU-31 Hollywood Peel", cantidad: 1, precio_unit: 15 },
    ];
    const apr = await h("solicitud_resolver", "emi", { id: r.id, aprobar: true });
    assert.equal(apr.error, undefined, String(apr.error));
    const L = (await db.all("beta_ticket_lineas")).filter((l) => l.ticket_clave === "TK-SO-1938" && l.tipo === "facial");
    assert.ok(L.every((l) => Number(l.descuento_valor) === 63.54), JSON.stringify(L));
    const cab = (await db.all("beta_tickets")).find((c) => c.clave === "TK-SO-1938") as Row;
    assert.equal((cab.datos as Row).retorno, "2026-12-19");
  });
  it("una fecha que no se entiende da un mensaje claro (no AAAA-MM-DD)", async () => {
    const { h } = semilla();
    const r = await h("tk_edicion_pedir", "and", { clave: "TK-SO-1938", motivo: "x", form: { ...formDaniela, fechaRetorno: "el jueves" } });
    assert.match(String(r.error), /No entendí la fecha de regreso/);
  });
});
