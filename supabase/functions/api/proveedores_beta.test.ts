// TK34: ficha del proveedor + 🤝 Consignación por proveedor y por producto.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./inline_api.ts";
import "./compras_api.ts";
import "./compras_beta_api.ts";
import "./recepciones_api.ts";
import "./consignacion_beta_api.ts";
import "./actas_api.ts";
import "./proveedores_beta_api.ts";
import { sugerirCodigo } from "./proveedores_beta_api.ts";
import { origenDe, destinoDe, BOD_CONSIG, BOD_VENTA } from "./recepciones.ts";
import type { Row } from "./domain.ts";

function semilla(ficha = true) {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Ana", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }, { id: "u-ana", nombre: "Ana", rol: "cosmetologa" }]);
  db.tables.set("erp_bodegas", [{ id: BOD_VENTA, codigo: "VENTA", nombre: "Venta", tipo: "venta", activa: true }, { id: BOD_CONSIG, codigo: "CONSIGNACION", nombre: "Consignación", tipo: "consignacion", activa: true }]);
  db.tables.set("erp_proveedores", [{ id: "p1", nombre: "Hebetronic S.A", activo: true, legacy_sheet_row: 3 }, { id: "p2", nombre: "Vassari", activo: true, legacy_sheet_row: 4 }]);
  db.tables.set("proveedores", [{ sheet_row: 3, nombre: "Hebetronic S.A", familia: "HT" }, { sheet_row: 4, nombre: "Vassari", familia: "VK" }, { sheet_row: 5, nombre: "Nuevo Lab Cosmetics", familia: "" }]);
  db.tables.set("erp_productos", [
    { id: "a", sku: "HT-001", nombre: "Sérum", costo_promedio: 10, activo: true, uso: "venta" },
    { id: "b", sku: "HT-002", nombre: "Tónico", costo_promedio: 5, activo: true, uso: "venta" },
    { id: "v", sku: "VK-001", nombre: "Crema", costo_promedio: 8, activo: true, uso: "venta" },
  ]);
  db.tables.set("erp_stock", []);
  db.tables.set("tickets", [{ id: 1, sheet_row: 10, timestamp: "2026-11-05T15:00:00Z", orig: { "HT-001 Sérum": 2, "HT-002 Tónico": 1 }, estimado: 25 }]);
  db.tables.set("erp_oc", [{ id: "o1", numero: "OC-0001", proveedor_id: "p1", fecha: "2026-11-02", estado: "abierta", total: 50, saldo: 20, tipo: "compra" }]);
  db.tables.set("erp_oc_pagos", [{ id: "g1", oc_id: "o1", monto: 30, fecha: "2026-11-03" }]);
  db.tables.set("erp_recepciones", [{ id: "r1", oc_id: "o1", numero: "REC-1", fecha: "2026-11-04" }]);
  db.tables.set("erp_movimientos", [{ id: "m1", fecha: "2026-11-04T10:00:00Z", producto_id: "a", bodega_id: BOD_CONSIG, delta: 3, tipo: "recepcion" }]);
  for (const t of ["erp_oc_lineas", "erp_recepcion_lineas", "beta_oc_cotizaciones", "beta_consig_restock", "beta_actas", "log_acciones", "erp_consignacion_consumo", "inline_cambios", "audit_log"]) db.tables.set(t, []);
  if (ficha) db.tables.set("beta_proveedores_ficha", ["HT", "AS", "ML", "PH", "JN"].map((f) => ({ familia: f, consignacion: true, datos: {}, notas: [], historial: [] })));
  return db;
}
const h = (db: MemoryDb, action: string, p: Record<string, unknown> = {}, tok = "adm") => handle(action, { token: tok, ...p }, { db, now: new Date("2026-11-18T14:00:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: tok } as never) as Promise<Row>;

describe("🏭 proveedores · 🤝 consignación (TK34)", () => {
  it("origen: el proveedor manda; un producto apagado entra al inventario normal; sin lista rige lo de antes", () => {
    const on = new Set(["HT"]);
    assert.equal(origenDe({ sku: "HT-001" }, on), "consignacion");
    assert.equal(origenDe({ sku: "HT-001", beta_origen: "propio" }, on), "propio");
    assert.equal(origenDe({ sku: "VK-001" }, on), "propio");
    assert.equal(origenDe({ sku: "VK-001" }, new Set(["HT", "VK"])), "consignacion");
    assert.equal(origenDe({ sku: "ML-010" }, new Set(["ML"])), "propio"); // máscara que se vende desde Cabina
    assert.equal(destinoDe({ sku: "HT-001" }, on).bodega_id, BOD_CONSIG);
    assert.equal(destinoDe({ sku: "HT-001", beta_origen: "propio" }, on).bodega_id, BOD_VENTA);
    assert.equal(origenDe({ sku: "HT-001" }), "consignacion"); // sin lista: como antes
  });
  it("ficha: datos, productos con su interruptor, historial (OC, recepción, pago) y movimientos", async () => {
    const db = semilla();
    const f = await h(db, "prov_ficha", { codigo: "HT", erpId: "p1" });
    assert.equal(f.ok, true, JSON.stringify(f));
    assert.equal(f.consignacion, true);
    assert.deepEqual((f.productos as Row[]).map((x) => [x.sku, x.consig]), [["HT-001", true], ["HT-002", true]]);
    assert.deepEqual((f.historial as Row[]).map((x) => x.tipo).sort(), ["oc", "pago", "recepcion"]);
    assert.equal((f.movimientos as Row[]).length, 1);
    assert.equal((f.kpis as Row).comprado, 50);
  });
  it("apagar un producto lo saca de Compras › Consignación; apagar el proveedor lo saca de la lista", async () => {
    const db = semilla();
    let c = await h(db, "cns_calc", { proveedor_id: "p1", anio: 2026, mes: 11, quincena: 1 });
    assert.equal(c.ok, true, JSON.stringify(c));
    assert.deepEqual((c.fact as Row[]).map((x) => x.sku), ["HT-001", "HT-002"]);
    assert.equal((await h(db, "prov_prod_consig", { producto_id: "b", on: false }, "cos")).error, "Solo administradores");
    assert.equal((await h(db, "prov_prod_consig", { producto_id: "b", on: false })).ok, true);
    assert.equal(db.tables.get("erp_productos")!.find((x) => x.id === "b")!.beta_origen, "propio");
    c = await h(db, "cns_calc", { proveedor_id: "p1", anio: 2026, mes: 11, quincena: 1 });
    assert.deepEqual((c.fact as Row[]).map((x) => x.sku), ["HT-001"]);
    assert.equal((await h(db, "prov_prod_consig", { producto_id: "b", on: true })).ok, true);
    assert.equal(db.tables.get("erp_productos")!.find((x) => x.id === "b")!.beta_origen ?? null, null);
    assert.ok(((await h(db, "cns_meta")).proveedores as Row[]).some((x) => x.id === "p1"));
    assert.equal((await h(db, "prov_consig", { codigo: "HT", on: false })).ok, true);
    assert.ok(!((await h(db, "cns_meta")).proveedores as Row[]).some((x) => x.id === "p1"));
    assert.equal((await h(db, "prov_prod_consig", { producto_id: "a", on: true })).error, "Primero activa 🤝 Consignación en el proveedor");
    // Vassari (VK) se activa: aparece en la búsqueda de consignación.
    assert.equal((await h(db, "prov_consig", { codigo: "VK", on: true })).ok, true);
    assert.ok(((await h(db, "cns_meta")).proveedores as Row[]).some((x) => x.id === "p2"));
    const fv = await h(db, "prov_ficha", { codigo: "VK", erpId: "p2" });
    assert.equal(fv.consignacion, true); assert.ok((fv.cambios as Row[]).length >= 1);
  });
  it("datos extra, notas y código propio único", async () => {
    const db = semilla();
    assert.equal((await h(db, "prov_dato", { codigo: "HT", campo: "contacto", valor: "Andrea" })).ok, true);
    assert.equal((await h(db, "prov_dato", { codigo: "HT", campo: "xx", valor: "1" })).error, "Campo inválido");
    assert.equal((await h(db, "prov_nota", { codigo: "HT", texto: "Entrega los martes" })).ok, true);
    const f = await h(db, "prov_ficha", { codigo: "HT", erpId: "p1" });
    assert.equal((f.datos as Row).contacto, "Andrea"); assert.equal((f.notas as Row[])[0].texto, "Entrega los martes");
    const sug = await h(db, "prov_codigo_sugerir", { nombre: "Nuevo Lab Cosmetics" });
    assert.equal(sug.codigo, "NL");
    assert.equal((await h(db, "prov_codigo_crear", { fila: "5", codigo: "HT" })).error, "El código HT ya existe");
    assert.equal((await h(db, "prov_codigo_crear", { fila: "5", codigo: "N1" })).error, "El código son 2 o 3 letras (ej. AS)");
    assert.equal((await h(db, "prov_codigo_crear", { fila: "5", codigo: "NL" })).ok, true);
    assert.equal(db.tables.get("proveedores")!.find((x) => x.sheet_row === 5)!.familia, "NL");
    assert.equal((await h(db, "prov_codigo_crear", { fila: "3", codigo: "HX" })).error, "Este proveedor ya tiene el código HT con productos: no se cambia");
    assert.equal(sugerirCodigo("Allskin Company S.A.S", new Set(["AS"])), "AL");
  });
  it("sin fichas guardadas rige lo de antes (HT, AS, ML, PH, JN); la primera edición deja esas 5 en ON", async () => {
    const db = semilla(false);
    assert.ok(((await h(db, "cns_meta")).proveedores as Row[]).some((x) => x.id === "p1"));
    assert.ok(!((await h(db, "cns_meta")).proveedores as Row[]).some((x) => x.id === "p2"));
    assert.equal((await h(db, "prov_consig", { codigo: "VK", on: true })).ok, true);
    const F = db.tables.get("beta_proveedores_ficha")!;
    assert.deepEqual(F.filter((r) => r.consignacion === true).map((r) => r.familia).sort(), ["AS", "HT", "JN", "ML", "PH", "VK"]);
  });
});
