import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import "./conteo_fisico_api.ts";
import "./transferencias_beta_api.ts";
import "./ajustes_beta_api.ts";
import { CONTEO_A_STOCK } from "./ajustes_beta_api.ts";
import type { Row } from "./domain.ts";

const VENTA = "11111111-1111-4111-8111-111111111111";
function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
    { token: "rec", uid: "u-rec", rol: "recepcion", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "u-ana", nombre: "Ana", short: "Ana", rol: "cosmetologa", bloqueado: false },
    { id: "u-rec", nombre: "Rita", short: "Rita", rol: "recepcion", bloqueado: false },
  ]);
  db.tables.set("erp_productos", [
    { id: "p1", sku: "ML-001", nombre: "Ampoule", clase: "producto", uso: "venta", activo: true },
    { id: "p2", sku: "ML-002", nombre: "Cream", clase: "producto", uso: "venta", activo: true },
  ]);
  db.tables.set("erp_bodegas", [{ id: VENTA, codigo: "VENTA", nombre: "Venta", tipo: "venta" }]);
  db.tables.set("erp_stock", [{ producto_id: "p1", bodega_id: VENTA, cantidad: 5 }, { producto_id: "p2", bodega_id: VENTA, cantidad: 2 }]);
  for (const t of ["catalogo", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "beta_conteos", "beta_conteo_lineas", "beta_notificaciones", "beta_transferencias", "beta_transferencia_lineas", "beta_stock_movimientos", "beta_ajustes", "beta_ajuste_lineas"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-17T18:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}
const stock = async (h: (a: string, t: string, p?: Row) => Promise<Row>, id: string) => (((await h("mcprod_list", "adm")).items as Row[]).find((p) => p.id === id)!.porGrupo as Row);

describe("ajustes de stock beta", () => {
  it("admin: editar el stock en la ficha crea un ajuste aplicado con motivo, antes/después y diferencia", async () => {
    const { db, h } = semilla();
    const antes = JSON.stringify(db.tables.get("erp_stock"));
    assert.match(String((await h("aj_crear", "adm", { origen: "ficha", bodega: "CONSIGNACION", lineas: [{ producto_id: "p1", nuevo: 3 }] })).error), /motivo/);
    assert.match(String((await h("aj_crear", "adm", { bodega: "CONSIGNACION", motivo: "Otro", lineas: [{ producto_id: "p1", nuevo: 3 }] })).error), /nota/);
    assert.match(String((await h("aj_crear", "adm", { bodega: "CONSIGNACION", motivo: "Daño", lineas: [{ producto_id: "p1", delta: -9 }] })).error), /negativo/);
    assert.match(String((await h("aj_crear", "adm", { bodega: "CONSIGNACION", motivo: "Daño", lineas: [{ producto_id: "p1", nuevo: 5 }] })).error), /Sin diferencias/);
    const r = await h("aj_crear", "adm", { origen: "ficha", bodega: "CONSIGNACION", motivo: "Daño", nota: "Se rompió", lineas: [{ producto_id: "p1", nuevo: 3 }] });
    assert.equal(r.numero, "AJ-001"); assert.equal(r.estado, "aplicado");
    assert.equal((await stock(h, "p1")).CONSIGNACION, 3);
    const g = await h("aj_get", "adm", { id: r.id });
    assert.deepEqual((g.lineas as Row[]).map((l) => [l.sku, l.antes, l.despues, l.diferencia]), [["ML-001", 5, 3, -2]]);
    assert.equal((g.ajuste as Row).origen, "ficha"); assert.equal((g.ajuste as Row).motivo, "Daño");
    assert.deepEqual(db.tables.get("beta_stock_movimientos")!.map((m) => [m.tipo, m.bodega, m.delta, m.doc_numero]), [["ajuste", "CONSIGNACION", -2, "AJ-001"]]);
    assert.equal(JSON.stringify(db.tables.get("erp_stock")), antes);
    // Ficha: el kardex muestra el movimiento de la beta.
    const f = await h("mcprod_get", "adm", { id: "p1" });
    assert.ok((f.kardex as Row[]).some((k) => k.doc === "AJ-001" && k.delta === -2));
  });
  it("no admin: queda pendiente hasta que un admin apruebe; rechazar no mueve stock; sin permiso no ve", async () => {
    const { db, h } = semilla();
    assert.equal((await h("aj_list", "rec")).ok, true); // recepción tiene inventario completo por defecto: puede pedir ajustes
    const r = await h("aj_crear", "cos", { bodega: "CONSIGNACION", motivo: "Vencido", lineas: [{ producto_id: "p2", nuevo: 1 }] });
    assert.equal(r.estado, "pendiente");
    assert.equal(db.tables.get("beta_stock_movimientos")!.length, 0);
    assert.equal((await h("notif_mias", "adm")).sinLeer, 1);
    assert.match(String((await h("aj_revisar", "cos", { id: r.id, que: "aprobar" })).error), /admin/);
    assert.equal((await h("aj_revisar", "adm", { id: r.id, que: "aprobar" })).estado, "aplicado");
    assert.equal((await stock(h, "p2")).CONSIGNACION, 1);
    const r2 = await h("aj_crear", "cos", { bodega: "CONSIGNACION", motivo: "Pérdida / robo", lineas: [{ producto_id: "p1", delta: -1 }] });
    assert.match(String((await h("aj_revisar", "adm", { id: r2.id, que: "rechazar" })).error), /por qué/);
    await h("aj_revisar", "adm", { id: r2.id, que: "rechazar", motivo: "No cuadra" });
    assert.equal((await stock(h, "p1")).CONSIGNACION, 5);
    const ls = (await h("aj_list", "adm")).items as Row[];
    assert.deepEqual(ls.map((a) => [a.numero, a.estado]).sort(), [["AJ-001", "aplicado"], ["AJ-002", "rechazado"]]);
  });
  it("un conteo aprobado NO pasa a stock hasta que Emilia confirme", async () => {
    const { h } = semilla();
    assert.equal(CONTEO_A_STOCK, false);
    assert.match(String((await h("aj_desde_conteo", "adm", { id: "x" })).error), /Emilia/);
  });
});
