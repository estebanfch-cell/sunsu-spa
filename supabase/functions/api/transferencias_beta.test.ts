import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import "./conteo_fisico_api.ts";
import "./transferencias_beta_api.ts";
import { soloAdmin } from "./transferencias_beta_api.ts";
import type { Row } from "./domain.ts";

const VENTA = "11111111-1111-4111-8111-111111111111", CASA = "22222222-2222-4222-8222-222222222222";
function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
    { token: "rec", uid: "u-rec", rol: "recepcion", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "u-rec", nombre: "Rita", short: "Rita", rol: "recepcion", bloqueado: false },
    { id: "u-ana", nombre: "Ana", short: "Ana", rol: "cosmetologa", bloqueado: false },
  ]);
  db.tables.set("erp_productos", [
    { id: "p1", sku: "ML-001", nombre: "Ampoule", clase: "producto", uso: "venta", activo: true },
    { id: "p2", sku: "ML-002", nombre: "Cream", clase: "producto", uso: "venta", activo: true },
  ]);
  db.tables.set("erp_bodegas", [{ id: VENTA, codigo: "VENTA", nombre: "Venta", tipo: "venta" }, { id: CASA, codigo: "CASA", nombre: "Casa", tipo: "bodega" }]);
  db.tables.set("erp_stock", [
    { producto_id: "p1", bodega_id: VENTA, cantidad: 5 },
    { producto_id: "p2", bodega_id: CASA, cantidad: 4 },
  ]);
  for (const t of ["catalogo", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "beta_transferencias", "beta_transferencia_lineas", "beta_stock_movimientos"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-17T18:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}
const grupo = async (h: (a: string, t: string, p?: Row) => Promise<Row>, id: string) => {
  const it = ((await h("mcprod_list", "adm")).items as Row[]).find((p) => p.id === id)!;
  return { g: it.porGrupo as Row, s: it.porSubCabina as Row };
};

describe("transferencias beta", () => {
  it("borrador → enviada → recibida; el stock se mueve solo al recibir y solo en beta_stock_movimientos", async () => {
    const { db, h } = semilla();
    assert.match(String((await h("trfb_save", "adm", { origen: "CONSIGNACION", destino: "CONSIGNACION", lineas: [{ producto_id: "p1", cantidad: 1 }] })).error), /mismo lugar/);
    assert.match(String((await h("trfb_save", "adm", { origen: "CONSIGNACION", destino: "CABINA", lineas: [{ producto_id: "p1", cantidad: 9 }] })).error), /stock insuficiente/);
    const cr = await h("trfb_save", "adm", { origen: "CONSIGNACION", destino: "CABINA", destino_sub: "CABINA_2", nota: "Repo", lineas: [{ producto_id: "p1", cantidad: 2 }] });
    assert.equal(cr.numero, "TR-001");
    const stockAntes = JSON.stringify(db.tables.get("erp_stock"));
    let g = await h("trfb_get", "adm", { id: cr.id });
    assert.equal((g.transferencia as Row).estado, "borrador");
    assert.equal((g.transferencia as Row).destinoNombre, "Bodega Cabina · Cabina 2");
    assert.equal(g.puedeEnviar, true); assert.equal(g.puedeRecibir, false);
    assert.match(String((await h("trfb_estado", "adm", { id: cr.id, que: "recibir" })).error), /enviada/);
    await h("trfb_estado", "adm", { id: cr.id, que: "enviar" });
    assert.equal(db.tables.get("beta_stock_movimientos")!.length, 0);
    assert.equal(((await grupo(h, "p1")).g).CONSIGNACION, 5);
    assert.equal((await h("trfb_estado", "adm", { id: cr.id, que: "recibir" })).ok, true);
    const mv = db.tables.get("beta_stock_movimientos")!;
    assert.deepEqual(mv.map((m) => [m.bodega, m.sububicacion, m.delta]), [["CONSIGNACION", null, -2], ["CABINA", "CABINA_2", 2]]);
    const st = await grupo(h, "p1");
    assert.equal(st.g.CONSIGNACION, 3); assert.equal(st.g.CABINA, 2); assert.equal(st.s.CABINA_2, 2);
    assert.equal(JSON.stringify(db.tables.get("erp_stock")), stockAntes);
    assert.equal(db.tables.get("erp_movimientos")!.length, 0);
    g = await h("trfb_get", "adm", { id: cr.id });
    assert.equal((g.transferencia as Row).estado, "recibida"); assert.equal((g.movimientos as Row[]).length, 2);
    assert.equal(g.puedeCancelar, false);
    // Dentro de Cabina (Cabina 2 → Cabina 3) también vale.
    const c2 = await h("trfb_save", "adm", { origen: "CABINA", origen_sub: "CABINA_2", destino: "CABINA", destino_sub: "CABINA_3", lineas: [{ producto_id: "p1", cantidad: 1 }], enviar: true });
    assert.equal(c2.estado, "enviada");
    await h("trfb_estado", "adm", { id: c2.id, que: "recibir" });
    const s2 = await grupo(h, "p1");
    assert.equal(s2.g.CABINA, 2); assert.equal(s2.s.CABINA_2, 1); assert.equal(s2.s.CABINA_3, 1);
    assert.match(String((await h("trfb_save", "adm", { origen: "CABINA", destino: "CONSIGNACION", lineas: [{ producto_id: "p1", cantidad: 1 }] })).error), /Sin cabina asignada \(0\)|insuficiente/);
    const ls = await h("trfb_list", "adm");
    assert.deepEqual((ls.items as Row[]).map((t) => t.numero).sort(), ["TR-001", "TR-002"]);
  });
  it("Oficina ↔ Bodega Cabina solo admin; cancelar no mueve stock", async () => {
    assert.equal(soloAdmin("OFICINA", "CABINA"), true); assert.equal(soloAdmin("CABINA", "OFICINA"), true); assert.equal(soloAdmin("OFICINA", "CONSIGNACION"), false);
    const { db, h } = semilla();
    assert.match(String((await h("trfb_list", "rec")).error), /permiso/);
    const r = await h("trfb_save", "cos", { origen: "OFICINA", destino: "CABINA", lineas: [{ producto_id: "p2", cantidad: 1 }] });
    assert.match(String(r.error), /permiso|admin/i);
    const ok = await h("trfb_save", "cos", { origen: "OFICINA", destino: "CONSIGNACION", lineas: [{ producto_id: "p2", cantidad: 1 }] });
    assert.match(String(ok.error), /permiso|admin/i); // TK108: el personal no transfiere stock
    const a = await h("trfb_save", "adm", { origen: "OFICINA", destino: "CABINA", lineas: [{ producto_id: "p2", cantidad: 1 }], enviar: true });
    assert.equal(a.estado, "enviada");
    assert.equal((await h("trfb_estado", "adm", { id: a.id, que: "cancelar", motivo: "error" })).ok, true);
    assert.equal(db.tables.get("beta_stock_movimientos")!.length, 0);
    assert.match(String((await h("trfb_estado", "adm", { id: a.id, que: "recibir" })).error), /enviada/);
  });
});
