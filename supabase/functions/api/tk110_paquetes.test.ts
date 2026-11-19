// TK110 (Emilia 18/11): toda venta de paquete deja su paquete; conversión a gift card idempotente; la búsqueda muestra completos.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { asegurarPaquetesVenta, paqueteDeVenta, patchSlotsGC, ventasPaqueteDeTicket } from "./paquete_venta.ts";
import type { Row } from "./domain.ts";

const TK = { id: 1906, so_num: "TK-SO-1914", timestamp: "2026-11-18T15:21:06+00:00", nombre: "Youssef", apellido: "Tazi", fac_7: "2971.0", atendido_por: "Daniela Mora", compra_pack_3: "SUNSU-18 x3 Facial Reparación" };

describe("TK110 · venta de paquete → paquete", () => {
  it("columna compra_pack_3 o línea beta tipo paquete con precio", () => {
    assert.deepEqual(ventasPaqueteDeTicket(TK).map((v) => v.sku), ["SUNSU-18"]);
    assert.deepEqual(ventasPaqueteDeTicket({ nombre: "Ana" }, [{ tipo: "paquete", sku: "18", nombre: "PAQUETE (3) FACIAL REPARACIÓN", cantidad: 1, precio_unit: 175.5 }]).map((v) => [v.sku, v.pack]), [["SUNSU-18", 3]]);
    assert.deepEqual(ventasPaqueteDeTicket({ nombre: "Ana" }, [{ tipo: "paquete", sku: "PAQ", nombre: "Canje paquete", precio_unit: 0 }]), [], "el canje en $0 no es venta");
  });
  it("encuentra el paquete existente por factura, ticket o clienta+SKU ±3 días (año de 2 dígitos incluido)", () => {
    const v = ventasPaqueteDeTicket(TK)[0];
    assert.equal(paqueteDeVenta([{ id: 709, factura: "2971.0", sku: "SUNSU-18", nombres: "Youssef", apellidos: "Tazi", ano: 2026, mes: 11, dia: 18 }], TK, v, "")!.id, 709);
    assert.equal(paqueteDeVenta([{ id: 5, sku: "SUNSU-18", nombres: "Youssef", apellidos: "Tazi", ano: 26, mes: 11, dia: 17 }], TK, v, "")!.id, 5);
    assert.equal(paqueteDeVenta([{ id: 6, sku: "SUNSU-20", nombres: "Youssef", apellidos: "Tazi", ano: 2026, mes: 11, dia: 18 }], TK, v, ""), null);
  });
  it("crea el paquete que falta UNA sola vez, con clienta, tipo, fecha y código PQ", async () => {
    const db = new MemoryDb();
    db.tables.set("paquetes", [{ id: 1, sheet_row: 10, beta_codigo: "PQ-0029", sku: "SUNSU-44", nombres: "Otra", apellidos: "Persona", ano: 2026, mes: 11, dia: 1 }]);
    const ctx = { db } as never;
    const c1 = await asegurarPaquetesVenta(ctx, "test", TK);
    assert.deepEqual(c1, ["PQ-0030"]);
    const p = db.tables.get("paquetes")!.find((x) => x.beta_codigo === "PQ-0030")!;
    assert.equal(p.nombres, "Youssef"); assert.equal(p.sku, "SUNSU-18"); assert.equal(p.dia, 18); assert.equal(p.mes, 11); assert.equal(p.ano, 2026);
    assert.equal(p.sheet_row, 11); assert.equal((p.orig as Row).ticket, "TK-SO-1914");
    assert.deepEqual(await asegurarPaquetesVenta(ctx, "test", TK), [], "idempotente: no duplica");
    assert.equal(db.tables.get("paquetes")!.length, 2);
  });
});

describe("TK110 · sesiones convertidas en gift card", () => {
  it("no repite códigos ya marcados ni pasa del tamaño del paquete", () => {
    const row = { sku: "SUNSU-18", paquete: "SUNSU-18 x3 Facial Reparación" };
    const p1 = patchSlotsGC(row, [{ codigo: "26-174" }, { codigo: "26-175" }]);
    assert.deepEqual(p1, { uso_1: true, fecha_1: "Gift Card, 26-174", uso_2: true, fecha_2: "Gift Card, 26-175" });
    assert.deepEqual(patchSlotsGC({ ...row, ...p1 }, [{ codigo: "26-174" }, { codigo: "26-175" }]), {}, "doble guardado: nada nuevo");
    const lleno = { ...row, uso_1: true, fecha_1: "x", uso_2: true, fecha_2: "y", uso_3: true, fecha_3: "z" };
    assert.deepEqual(patchSlotsGC(lleno, [{ codigo: "26-200" }]), {}, "nunca la sesión 4 de un paquete de 3");
  });
});
