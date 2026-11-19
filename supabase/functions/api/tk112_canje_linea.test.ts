import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alertaCanje, esLineaCanje, lineaCanjeFaltante } from "./canje_linea.ts";
import { MemoryDb } from "./db.ts";
import "./migo_cuadre_api.ts";
import { lineasDeFacturaATicket } from "./migo_cuadre_api.ts";

const TK = { id: 1906, so_num: "TK-SO-1914", timestamp: "2026-11-18T15:21:06Z", nombre: "Youssef", apellido: "Tazi", id_3: "0999999999", paquete: "SI, 1/3", facial_hecho: "SUNSU-02 Facial Reparación", fac_7: "2971.0", estimado: 353.16 };
const PAQ = { id: 709, codigo: "PQ-0029", sku: "SUNSU-18", nombre: "SUNSU-18 x3 Facial Reparación", total: 3, usos: [{ slot: 1, usado: true, fecha: "2026-11-18" }, { slot: 2, usado: true, fecha: "Gift Card, 26-174" }] };
const FAC = [{ tipo: "paquete", sku: "18", nombre: "PAQUETE (3) FACIAL REPARACIÓN", cantidad: 1, precio_unit: 175.5, total_linea: 175.5 }, { tipo: "extra", sku: "31", nombre: "PDRN SERUM", cantidad: 1, precio_unit: 15, total_linea: 15 }];

describe("TK112: regla de la línea de canje de paquete", () => {
  it("crea la línea $0 ligada al uso (S1 de PQ-0029) aunque las demás vengan de la factura, y no la duplica", () => {
    const l = lineaCanjeFaltante(TK, FAC, [PAQ])!;
    assert.equal(l.nombre, "SUNSU-02 Facial Reparación · Canje paquete PQ-0029 · sesión 1/3");
    assert.equal(l.sku, "02"); assert.equal(l.precio_unit, 0); assert.equal(l.total_linea, 0);
    assert.equal(lineaCanjeFaltante(TK, [...FAC, l], [PAQ]), null);
    assert.equal(lineaCanjeFaltante({ ...TK, paquete: "" }, FAC, []), null, "sin uso de paquete no hay canje");
    // Uso marcado en el paquete ese día aunque la hoja no diga SI.
    assert.match(s(lineaCanjeFaltante({ ...TK, paquete: "" }, FAC, [PAQ])?.nombre), /Canje paquete PQ-0029 · sesión 1\/3/);
    assert.ok(esLineaCanje(l));
  });
  it("amarillo: uso sin línea de canje, o línea de canje sin uso", () => {
    assert.deepEqual(alertaCanje(TK, FAC, [PAQ]), ["Uso de paquete sin línea de canje en $0 (PQ-0029)"]);
    assert.deepEqual(alertaCanje(TK, [...FAC, lineaCanjeFaltante(TK, FAC, [PAQ])!], [PAQ]), []);
    const huérfana = { tipo: "facial", sku: "02", nombre: "Facial · Canje paquete PACK-1 · sesión 2/3", precio_unit: 0, total_linea: 0 };
    assert.deepEqual(alertaCanje({ ...TK, paquete: "" }, [...FAC, huérfana], []), ["Línea de canje de paquete sin uso de paquete ese día"]);
    assert.deepEqual(alertaCanje({ ...TK, paquete: "" }, FAC, []), []);
  });
  it("al pasar las líneas de la factura al ticket, inserta la línea de canje una sola vez y en $0", async () => {
    const db = new MemoryDb();
    db.tables.set("tickets", [TK]);
    db.tables.set("paquetes", [{ id: 709, sheet_row: 711, beta_codigo: "PQ-0029", dia: 18, mes: 11, ano: 2026, cedula: "0999999999", nombres: "Youssef", apellidos: "Tazi", sku: "SUNSU-18", paquete: "SUNSU-18 x3 Facial Reparación", factura: "2971", uso_1: true, fecha_1: "18/11/26 Facial Reparación · Daniela Mora", uso_2: true, fecha_2: "Gift Card, 26-174", uso_3: true, fecha_3: "Gift Card, 26-175", orig: {} }]);
    db.tables.set("beta_migo_facturas_vivo", [{ factura: "001-001-000002971", seq: 2971, fecha: "2026-11-18", total: 190.5, lineas: [{ codigo: "SUNSU-18", sku: "SUNSU-18", producto: "PAQUETE (3) FACIAL REPARACIÓN", cantidad: 1, precio_unit: 152.61, total: 175.5 }, { codigo: "SUNSU-31", sku: "SUNSU-31", producto: "PDRN SERUM", cantidad: 1, precio_unit: 13.04, total: 15 }] }]);
    for (const t of ["beta_migo_borradores", "beta_tickets", "beta_ticket_lineas", "beta_paquete_ajustes", "log_acciones", "catalogo", "erp_productos", "beta_sku_alias"]) db.tables.set(t, []);
    const ctx = { db, now: new Date("2026-11-19T05:20:00Z") } as never;
    const r1 = await lineasDeFacturaATicket(ctx, "test", "001-001-000002971", { ...TK, clave: "TK-SO-1914" });
    assert.equal(r1.ok, true);
    const L = (db.tables.get("beta_ticket_lineas") || []) as Record<string, unknown>[];
    const cj = L.filter((l) => /Canje paquete PQ-0029/.test(String(l.nombre)));
    assert.equal(cj.length, 1); assert.equal(Number(cj[0].precio_unit), 0);
    assert.equal(cj[0].nombre, "SUNSU-02 Facial Reparación · Canje paquete PQ-0029 · sesión 1/3");
    await lineasDeFacturaATicket(ctx, "test", "001-001-000002971", { ...TK, clave: "TK-SO-1914" });
    assert.equal(((db.tables.get("beta_ticket_lineas") || []) as Record<string, unknown>[]).filter((l) => /Canje paquete/.test(String(l.nombre))).length, 1, "no se duplica");
    // No crea un uso nuevo en el paquete.
    const p = (db.tables.get("paquetes") as Record<string, unknown>[])[0];
    assert.equal(p.uso4 ?? false, false);
  });
});
function s(v: unknown) { return v == null ? "" : String(v); }
