import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./compras_api.ts";
import "./compras_beta_api.ts";
import { estadoOc, estadoPago, siguienteAnual, totales } from "./compras_beta.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "super_admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "super_admin" }]);
  db.tables.set("erp_proveedores", [{ id: "p1", nombre: "Judith Trinidad Ayala Narvaez", ruc: "1712345678001", activo: true, legacy_sheet_row: 6 }]);
  db.tables.set("proveedores", [{ sheet_row: 6, nombre: "Judith Trinidad Ayala Narvaez", familia: "JN" }]);
  db.tables.set("erp_productos", [
    { id: "a", sku: "JN-001", nombre: "Crema", costo_promedio: 10, activo: true },
    { id: "b", sku: "JN-002", nombre: "Tónico", costo_promedio: 5, activo: true },
  ]);
  db.tables.set("erp_oc", [{ id: "old", numero: "OC-2026-079", proveedor_id: "p1", fecha: "2026-10-21", estado: "abierta", total: 100, pagado: 0, saldo: 100 }]);
  db.tables.set("erp_oc_lineas", []);
  db.tables.set("erp_oc_pagos", []);
  db.tables.set("erp_recepciones", []);
  db.tables.set("beta_oc_cotizaciones", []);
  db.tables.set("log_acciones", []);
  return db;
}
// deno-lint-ignore no-explicit-any
const call = (db: MemoryDb, action: string, p: Record<string, unknown> = {}) => handle(action, { token: "adm", ...p }, { db, now: new Date("2026-11-17T20:00:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" } as never) as Promise<Record<string, any>>;

describe("compras v2 (TK24)", () => {
  it("numeración anual, estados y pagos", () => {
    assert.equal(siguienteAnual([{ numero: "OC-2026-079" }, { numero: "OC-2025-0500" }], "OC", 2026), "OC-2026-0080");
    assert.equal(siguienteAnual([{ numero: "OC-2026-079" }], "OC", 2027), "OC-2027-0001");
    assert.equal(estadoOc({ estado: "abierta" }, [{ cantidad: 2, recibido: 0 }]), "Por recibir");
    assert.equal(estadoOc({ estado: "abierta" }, [{ cantidad: 2, recibido: 1 }]), "Recibida parcial");
    assert.equal(estadoOc({ estado: "abierta" }, [{ cantidad: 2, recibido: 1, no_recibido: 1 }, { cantidad: 1, no_recibido: 1 }]), "Recibida");
    assert.equal(estadoOc({ estado: "cancelada" }, []), "Cancelada");
    assert.equal(estadoPago(10, 0), "Por pagar"); assert.equal(estadoPago(10, 4), "Saldo pendiente"); assert.equal(estadoPago(10, 10), "Pagada");
    assert.deepEqual(totales([{ cantidad: 3, precio: 10 }], true), { subtotal: 30, iva: 4.5, total: 34.5 });
  });
  it("crea OC aprobada, registra pago y convierte una cotización", async () => {
    const db = semilla();
    const m = await call(db, "cmpb_meta");
    assert.equal(m.proveedores[0].familia, "JN");
    const r = await call(db, "cmpb_crear", { proveedor_id: "p1", lineas: [{ producto_id: "a", cantidad: 3 }, { producto_id: "b", cantidad: 2, precio: 4 }] });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.numero, "OC-2026-0080");
    assert.equal(r.total, 43.7);
    const g = await call(db, "cmpb_get", { id: r.id });
    assert.equal(g.oc.estado, "Por recibir");
    assert.equal(g.oc.lineas.length, 2);
    const pg = await call(db, "cmpb_pago", { oc_id: r.id, monto: 20, banco: "Pichincha", referencia: "TRX-1", fecha: "2026-11-17" });
    assert.equal(pg.ok, true, JSON.stringify(pg));
    assert.equal(pg.pago, "Saldo pendiente");
    const g2 = await call(db, "cmpb_get", { id: r.id });
    assert.equal(g2.oc.pagos[0].banco, "Pichincha");
    assert.equal(g2.oc.pagos[0].referencia, "TRX-1");
    const c = await call(db, "cmpb_cot_guardar", { proveedor_id: "p1", lineas: [{ producto_id: "a", cantidad: 1, precio: 9 }], numero_prov: "Q-7" });
    assert.equal(c.numero, "COT-2026-0001");
    const l = await call(db, "cmpb_lista");
    assert.ok(!l.items.some((i: any) => i.estado === "Cotización"));
    assert.equal(l.cotizaciones.length, 1);
    const cv = await call(db, "cmpb_cot_convertir", { id: c.id });
    assert.equal(cv.numero, "OC-2026-0081");
    const cc = await call(db, "cmpb_cot_get", { id: c.id });
    assert.equal(cc.cot.estado, "convertida");
    const x = await call(db, "cmpb_cancelar", { id: cv.id, motivo: "duplicada" });
    assert.equal(x.ok, true, JSON.stringify(x));
    assert.equal((await call(db, "cmpb_get", { id: cv.id })).oc.estado, "Cancelada");
  });
});
