import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./productos_api.ts";
import "./tickets_beta_api.ts";
import "./tickets_cancelar_api.ts";
import { BODEGA_VENTA } from "./erp.ts";
import { esCancelado, type Row } from "./domain.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Ana Pérez", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "u-ana", nombre: "Ana Pérez", short: "Ana", rol: "cosmetologa", bloqueado: false },
  ]);
  db.tables.set("catalogo", [
    { sku: "SUNSU-ML-002", producto_servicio: "Cream", tipo: "PRODUCTO", total_con_iva: 23, subtotal: 20, activo: true },
    { sku: "SUNSU-40", producto_servicio: "Facial Reset", tipo: "FACIAL", total_con_iva: 46, subtotal: 40, activo: true },
  ]);
  db.tables.set("erp_productos", [{ id: "p2", sku: "ML-002", nombre: "Cream", clase: "producto", uso: "venta", activo: true }]);
  db.tables.set("erp_bodegas", [{ id: BODEGA_VENTA, nombre: "LOCAL", tipo: "venta", activo: true }]);
  db.tables.set("erp_stock", [{ producto_id: "p2", bodega_id: BODEGA_VENTA, cantidad: 4 }]);
  db.tables.set("erp_movimientos", [{ id: "m1", producto_id: "p2", bodega_id: BODEGA_VENTA, delta: -1, tipo: "venta", ticket_ref: "TK-20261117-1", legacy_ref: "vta-beta:TK-20261117-1:ML-002" }]);
  db.tables.set("tickets", [
    { id: 1, sheet_row: 10, so_num: "TK-SO-1", beta_num: "TK-20261117-1", origin: "beta", timestamp: "2026-11-17T15:00:00Z", atendido_por: "Ana Pérez", nombre: "María", apellido: "Banda", id_3: "1700000001", facial_hecho: "SUNSU-40 Facial Reset", estimado: 69, orig: { "ML-002": 1, beta: true } },
  ]);
  db.tables.set("paquetes", [{ id: 7, sheet_row: 50, paquete: "Pack 3 Reset", orig: { ticket: "TK-20261117-1" }, borrado_at: null }]);
  for (const t of ["app_modulos", "cabina_inventario", "inventario_base", "promos", "beta_tickets", "beta_ticket_lineas", "solicitudes_cambio", "clientas_registro", "beta_stock_movimientos", "beta_ticket_cancelados", "log_acciones"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-17T18:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}
const devueltos = (db: MemoryDb) => (db.tables.get("erp_movimientos") || []).filter((m) => m.tipo === "anulacion");

describe("Cancelar ticket (admin)", () => {
  it("solo admin, con motivo", async () => {
    const { h } = semilla();
    assert.match(String((await h("tk_cancelar", "cos", { clave: "TK-SO-1", motivo: "x prueba" })).error), /admin/);
    assert.match(String((await h("tk_cancelar", "adm", { clave: "TK-SO-1", motivo: "" })).error), /motivo/);
  });
  it("devuelve stock a su bodega, da de baja el paquete, queda Cancelado y no se repite", async () => {
    const { db, h } = semilla();
    const r = await h("tk_cancelar", "adm", { clave: "TK-SO-1", motivo: "Ticket duplicado" });
    assert.equal(r.ok, true, String(r.error));
    const dev = devueltos(db);
    assert.equal(dev.length, 1);
    assert.equal(Number(dev[0].delta), 1);
    assert.equal(dev[0].bodega_id, BODEGA_VENTA);
    const tk = db.tables.get("tickets")![0];
    assert.ok(esCancelado(tk));
    assert.equal((tk.orig as Row).cancelado_por, "Emilia");
    assert.ok(db.tables.get("paquetes")![0].borrado_at);
    assert.equal(db.tables.get("beta_ticket_cancelados")!.length, 1);
    const g = await h("tk_get", "adm", { clave: "TK-SO-1" });
    assert.equal((g.ticket as Row).estado, "anulado");
    assert.equal(g.puedeCancelar, false);
    assert.match(String((await h("tk_cancelar", "adm", { clave: "TK-SO-1", motivo: "otra vez" })).error), /ya está cancelado/);
    assert.match(String((await h("tk_guardar", "adm", { clave: "TK-SO-1", lineas: [] })).error), /cancelado/);
  });
  it("quitar la línea de producto devuelve el stock", async () => {
    const { db, h } = semilla();
    const g = await h("tk_get", "adm", { clave: "TK-SO-1" });
    const sin = (g.lineas as Row[]).filter((l) => l.tipo !== "producto");
    const r = await h("tk_guardar", "adm", { clave: "TK-SO-1", lineas: sin });
    assert.equal(r.ok, true, String(r.error));
    const dev = devueltos(db);
    assert.equal(dev.length, 1);
    assert.equal(Number(dev[0].delta), 1);
  });
});

describe("Descuento por línea al crear", () => {
  it("descLineas limpia la entrada", async () => {
    const { descLineas } = await import("./handlers.ts");
    const d = descLineas([{ sku: "SUNSU-ML-002", modo: "%", valor: 10, bruto: 23, monto: 2.3 }, { sku: "", monto: 1, bruto: 2 }, { sku: "X", monto: 50, bruto: 10 }]);
    assert.equal(d.length, 1);
    assert.equal(d[0].modo, "%");
  });
  it("el detalle muestra la línea a precio de lista con su descuento", async () => {
    const { db, h } = semilla();
    const tk = db.tables.get("tickets")![0];
    tk.estimado = 66.7;
    tk.orig = { "ML-002": 1, beta: true, desc_lineas: [{ sku: "SUNSU-ML-002", modo: "%", valor: 10, bruto: 23, monto: 2.3 }] };
    const g = await h("tk_get", "adm", { clave: "TK-SO-1" });
    const l = (g.lineas as Row[]).find((x) => x.tipo === "producto")!;
    assert.equal(Number(l.precio_unit), 23);
    assert.equal(l.descuento_tipo, "%");
    assert.equal(Number(l.total_linea), 20.7);
    assert.equal(Number((g.totales as Row).total), 66.7);
  });
});
