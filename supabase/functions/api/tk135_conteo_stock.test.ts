// TK135: al aprobar un conteo físico, Productos muestra el stock real de esa
// bodega. Re-aprobar no duplica. Las líneas sin contar no se tocan.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import "./conteo_fisico_api.ts";
import "./ajustes_beta_api.ts";
import { CONTEO_A_STOCK } from "./ajustes_beta_api.ts";
import { s, type Row } from "./domain.ts";

const CASA = "44444444-4444-4444-8444-444444444444";
const CABINA = "22222222-2222-4222-8222-222222222222";
const VENTA = "11111111-1111-4111-8111-111111111111";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Ana", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "u-ana", nombre: "Ana", short: "Ana", rol: "cosmetologa", bloqueado: false },
  ]);
  db.tables.set("erp_productos", [
    { id: "p131", sku: "INV-131", nombre: "AC Serum - Dr.esthe", clase: "producto", uso: "ambos", activo: true },
    { id: "p110", sku: "ML-008", nombre: "AC Solution Swab - Dr.esthe", clase: "producto", uso: "ambos", activo: true, codigo_interno: "INV-110", sku_proveedor: "ML-008" },
    { id: "p061", sku: "INV-061", nombre: "Winner Soft Face Towels", clase: "producto", uso: "cabina", activo: true },
    { id: "p062", sku: "INV-062", nombre: "NOSCA9 Trouble Serum S", clase: "producto", uso: "cabina", activo: true },
  ]);
  db.tables.set("erp_bodegas", [
    { id: VENTA, codigo: "VENTA", nombre: "Venta", tipo: "venta" },
    { id: CABINA, codigo: "CABINA", nombre: "Cabina 1", tipo: "cabina" },
    { id: CASA, codigo: "CASA", nombre: "Casa", tipo: "casa" },
  ]);
  db.tables.set("erp_stock", [
    { producto_id: "p110", bodega_id: CABINA, sububicacion: "", lote: "", cantidad: 300, propietario: "sunsu" },
    { producto_id: "p061", bodega_id: CABINA, sububicacion: "", lote: "", cantidad: 3600, propietario: "sunsu" },
  ]);
  db.tables.set("cabina_inventario", [
    { codigo: "INV-110", sku_catalogo: "SUNSU-ML-008", producto: "AC Solution Swab - Dr.esthe", bodega_cerrados: 200, envases_cerrados: 100, activo: "SI" },
    { codigo: "INV-061", producto: "Winner Soft Face Towels", bodega_cerrados: 28, envases_cerrados: 7, activo: "SI" },
    { codigo: "INV-062", producto: "NOSCA9 Trouble Serum S", bodega_cerrados: 2, envases_cerrados: 1, activo: "SI" },
  ]);
  for (const t of ["catalogo", "erp_movimientos", "app_modulos", "inventario_base", "beta_conteos", "beta_conteo_lineas", "beta_notificaciones", "beta_conteo_secciones", "beta_conteo_plan", "beta_stock_movimientos", "beta_conteo_zonas", "erp_sububicaciones", "beta_sububicaciones", "beta_ajustes", "beta_ajuste_lineas", "beta_sku_alias"]) db.tables.set(t, []);
  db.tables.set("beta_sku_alias", [{ alias: "INV-110", sku: "ML-008", origen: "tk127" }]);
  const c = { db, now: new Date("2026-11-19T19:20:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}

const porGrupo = async (h: (a: string, t: string, p?: Row) => Promise<Row>, id: string) =>
  (((await h("mcprod_list", "adm")).items as Row[]).find((p) => p.id === id)!.porGrupo as Row);

describe("TK135 aprobar conteo actualiza el stock real", () => {
  it("CONTEO_A_STOCK queda encendido", () => {
    assert.equal(CONTEO_A_STOCK, true);
  });

  it("aprobar actualiza Bodega Oficina, registra el delta y deja sin tocar las líneas no contadas y el stock de Cabina", async () => {
    const { db, h } = semilla();
    const cr = await h("cf_crear", "adm", { bodega: "OFICINA", asignado_a: "u-ana" });
    assert.equal(cr.ok, true, String(cr.error));
    await h("cf_iniciar", "cos", { id: cr.id });
    // INV-131 no estaba en la foto (stock de Oficina era 0): se agrega como en CF-001.
    const agr = await h("cf_guardar", "cos", { id: cr.id, agregar: { sku: "INV-131", contado: 2 } });
    assert.equal(agr.ok, true, JSON.stringify(agr));
    const g0 = await h("cf_get", "adm", { id: cr.id });
    const L = g0.lineas as Row[];
    // Stock de Oficina antes (lo que muestra Productos).
    assert.equal((await porGrupo(h, "p131")).OFICINA, 0);
    assert.equal((await porGrupo(h, "p110")).OFICINA, 200);
    assert.equal((await porGrupo(h, "p061")).OFICINA, 28);
    assert.equal((await porGrupo(h, "p110")).CABINA, 100); // envases cerrados de la fila de cabina, no se tocan
    const l131 = L.find((l) => l.sku === "INV-131" || s(l.productoId) === "p131")!;
    const l110 = L.find((l) => l.sku === "ML-008" || l.sku === "INV-110")!;
    const l061 = L.find((l) => l.sku === "INV-061")!;
    const l062 = L.find((l) => l.sku === "INV-062")!;
    assert.ok(l131 && l110 && l061 && l062, "faltan líneas " + L.map((l) => l.sku).join(","));
    await h("cf_guardar", "cos", { id: cr.id, lineas: [
      { id: l131.id, contado: 2, sub_contada: "1-A-1" },
      { id: l110.id, contado: 300, sub_contada: "1-A-1" },
      { id: l061.id, contado: 13 },
      // INV-062 se deja pendiente, sin contar
    ] });
    const env = await h("cf_enviar", "cos", { id: cr.id, forzar: true });
    assert.equal(env.ok, true, "enviar " + JSON.stringify(env));
    const ap = await h("cf_revisar", "adm", { id: cr.id, que: "aprobar" });
    assert.equal(ap.stockAplicado, true, JSON.stringify(ap));
    assert.ok(Number(ap.aplicadas) >= 3);
    assert.ok(Number(ap.omitidas) >= 1);

    // Productos refleja el nuevo stock de Oficina; Cabina no se toca.
    const g110 = await porGrupo(h, "p110");
    const g131 = await porGrupo(h, "p131");
    const g061 = await porGrupo(h, "p061");
    const g062 = await porGrupo(h, "p062");
    assert.equal(g131.OFICINA, 2);
    assert.equal(g110.OFICINA, 300);
    assert.equal(g061.OFICINA, 13);
    assert.equal(g062.OFICINA, 2); // no contado, se queda
    assert.equal(g110.CABINA, 100);
    assert.equal((db.tables.get("erp_stock")!.find((r) => r.producto_id === "p110" && r.bodega_id === CABINA) as { cantidad: number }).cantidad, 300);
    const ficha131 = ((await h("mcprod_list", "adm")).items as Row[]).find((p) => p.id === "p131")!;
    const est = ficha131.porEstante as Row;
    assert.equal(est["OFICINA|1-A-1"], 2);

    const movs = db.tables.get("beta_stock_movimientos")!;
    const m131 = movs.find((m) => m.producto_id === "p131")!;
    assert.equal(m131.delta, 2);
    assert.equal(m131.bodega, "OFICINA");
    assert.equal(m131.sububicacion, "1-A-1");
    assert.equal(m131.tipo, "conteo");
    assert.equal(m131.doc_numero, cr.numero);
    assert.equal(m131.propietario, "sunsu");
    assert.match(String(m131.nota), /CF-/);
    assert.equal(movs.some((m) => m.producto_id === "p062"), false);
  });

  it("re-aprobar no vuelve a ajustar el stock", async () => {
    const { db, h } = semilla();
    const cr = await h("cf_crear", "adm", { bodega: "OFICINA", asignado_a: "u-ana" });
    await h("cf_iniciar", "cos", { id: cr.id });
    const agr = await h("cf_guardar", "cos", { id: cr.id, agregar: { sku: "INV-131", contado: 2 } });
    assert.equal(agr.ok, true, JSON.stringify(agr));
    const L = ((await h("cf_get", "adm", { id: cr.id })).lineas as Row[]);
    const l131 = L.find((l) => l.sku === "INV-131" || s(l.productoId) === "p131")!;
    await h("cf_guardar", "cos", { id: cr.id, lineas: L.map((l) => l.id === l131.id ? { id: l.id, contado: 2, sub_contada: "1-A-1" } : { id: l.id, contado: Number(l.sistema) || 0 }) });
    const env = await h("cf_enviar", "cos", { id: cr.id, forzar: true });
    assert.equal(env.ok, true, "enviar " + JSON.stringify(env));
    const ap1 = await h("cf_revisar", "adm", { id: cr.id, que: "aprobar" });
    assert.equal(ap1.stockAplicado, true, JSON.stringify(ap1));
    const n1 = db.tables.get("beta_stock_movimientos")!.length;
    const ofi1 = (await porGrupo(h, "p131")).OFICINA;
    const ap2 = await h("cf_revisar", "adm", { id: cr.id, que: "aprobar" });
    assert.equal(ap2.stockAplicado, true);
    assert.equal(ap2.yaAplicado, true);
    assert.equal(db.tables.get("beta_stock_movimientos")!.length, n1);
    assert.equal((await porGrupo(h, "p131")).OFICINA, ofi1);
    const ap3 = await h("aj_desde_conteo", "adm", { id: cr.id });
    assert.equal(ap3.yaAplicado, true);
    assert.equal(db.tables.get("beta_stock_movimientos")!.length, n1);
  });

  it("el SQL de CF-001 es aditivo, con backups, y no toca las líneas no contadas", () => {
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0067_tk135_conteo_aplica_stock.sql", import.meta.url), "utf8");
    assert.match(sql, /_bak_20261119_tk135_erp_stock/);
    assert.match(sql, /_bak_20261119_tk135_erp_movimientos/);
    assert.match(sql, /_bak_20261119_tk135_beta_stock_movimientos/);
    assert.match(sql, /_bak_20261119_tk135_beta_conteos/);
    assert.match(sql, /INV-131/);
    assert.match(sql, /stock_aplicado_at/);
    assert.match(sql, /CF-001/);
    assert.equal(/drop table/i.test(sql), false);
    assert.equal(/delete from public\.beta_conteo_lineas/i.test(sql), false);
    assert.match(sql, /INV-062/); // se menciona para dejarlo fuera (pendiente, no se aplica)
    assert.match(sql, /INV-062/);
    assert.doesNotMatch(sql, /update public\.beta_conteo_lineas[\s\S]*INV-062/);
  });

  it("el cache de esta entrega es TK135, distinto al de TK134", () => {
    const sw = readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
    const beta = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    assert.match(sw, /sunsu-2026-11-19-TK153/);
    assert.match(beta, /20261119tk153/);
    assert.doesNotMatch(sw, /sunsu-beta-2026-11-19-TK134/);
  });
});
