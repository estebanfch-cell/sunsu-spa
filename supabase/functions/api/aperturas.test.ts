import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./aperturas_api.ts";
import { borradorConsig } from "./ventas.ts";
import { destinoDeCabina, promedioProducto, rendimiento } from "./aperturas_beta.ts";
import type { Row } from "./domain.ts";

const FIRMA = "data:image/png;base64," + "A".repeat(400);
function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Ana Pérez", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }, { id: "u-ana", nombre: "Ana Pérez", rol: "cosmetologa" }]);
  db.tables.set("catalogo", [{ sku: "SUNSU-01", producto_servicio: "Facial S.O.S", tipo: "FACIAL" }, { sku: "SUNSU-02", producto_servicio: "Facial Reparación", tipo: "FACIAL" }]);
  db.tables.set("erp_productos", [{ id: "p1", sku: "SUNSU-HT-002", nombre: "Serum 30ml", clase: "producto", uso: "cabina", activo: true, codigo_barras: "7701234", costo_promedio: 12, beta_contenido: 30, beta_contenido_unidad: "ml" }, { id: "p2", sku: "SUNSU-ML-001", nombre: "Ampolla", clase: "producto", uso: "venta", activo: true, costo_promedio: 20 }]);
  db.tables.set("erp_bodegas", [{ id: "b1", codigo: "CABINA", nombre: "Cabina 1", tipo: "cabina" }, { id: "b2", codigo: "CAB2", nombre: "Cabina 2", tipo: "cabina" }, { id: "bv", codigo: "VENTA", nombre: "Venta", tipo: "venta" }]);
  db.tables.set("erp_movimientos", [{ id: "m0", producto_id: "p1", bodega_id: "b1", delta: 5, tipo: "recepcion" }]);
  for (const t of ["beta_aperturas", "log_acciones", "tickets"]) db.tables.set(t, []);
  let now = new Date("2026-11-01T14:00:00Z");
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { db, now, env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: tok } as never) as Promise<Row>;
  return { db, h, setNow: (d: string) => { now = new Date(d); } };
}

describe("📦 Abrir producto", () => {
  it("si el ticket dice la cabina, el facial va solo a los envases abiertos en esa cabina", () => {
    const t = (iso: string) => Date.parse(iso);
    const aps = [
      { id: "c1", destino: "CABINA", abierto_at: "2026-11-01T14:00:00Z", cerrado_at: null, contenido: 30, costo: 12 },
      { id: "c2", destino: "CAB2", abierto_at: "2026-11-01T14:00:00Z", cerrado_at: null, contenido: 30, costo: 12 },
    ];
    assert.equal(destinoDeCabina("Cabina 2"), "CAB2"); assert.equal(destinoDeCabina("Local"), "VENTA"); assert.equal(destinoDeCabina(""), "");
    const fac = [
      { t: t("2026-11-02T12:00:00Z"), code: "SUNSU-01", cabina: "CAB2" },
      { t: t("2026-11-02T13:00:00Z"), code: "SUNSU-01" },
      { t: t("2026-11-02T14:00:00Z"), code: "SUNSU-01", cabina: "CAB3" }, // nada abierto en Cabina 3 → entre todos
    ];
    const R = rendimiento(aps, fac, ["SUNSU-01"], t("2026-11-10T00:00:00Z"));
    assert.equal(R.get("c1")!.faciales, 1);
    assert.equal(R.get("c2")!.faciales, 2);
  });
  it("reparte cada facial entre los envases abiertos y promedia los cerrados", () => {
    const aps = [
      { id: "a", abierto_at: "2026-11-01T14:00:00Z", cerrado_at: "2026-11-03T14:00:00Z", contenido: 30, costo: 12 },
      { id: "b", abierto_at: "2026-11-02T14:00:00Z", cerrado_at: null, contenido: 30, costo: 12 },
    ];
    const t = (iso: string) => Date.parse(iso);
    // pared = UTC-5: 2026-11-01 10:00 local = 09:00Z+... usamos horas claras dentro de cada tramo
    const fac = [{ t: t("2026-11-01T12:00:00Z"), code: "SUNSU-01" }, { t: t("2026-11-02T12:00:00Z"), code: "SUNSU-01" }, { t: t("2026-11-02T12:00:00Z"), code: "SUNSU-02" }];
    const R = rendimiento(aps, fac, ["SUNSU-01"], t("2026-11-10T00:00:00Z"));
    assert.equal(R.get("a")!.faciales, 1.5);
    assert.equal(R.get("b")!.faciales, 0.5);
    assert.equal(R.get("a")!.costoPorFacial, 8);
    assert.equal(R.get("a")!.usoPorFacial, 20);
    const pr = promedioProducto([...R.values()]);
    assert.equal(pr.envases, 1);
    assert.equal(pr.costoPorFacial, 8);
  });
  it("busca por código de barras, abre con firma, descuenta 1, cierra el anterior y calcula el costo por facial", async () => {
    const { db, h, setNow } = semilla();
    const b = await h("ap_buscar", "cos", { q: "7701234" });
    assert.equal(b.exacto, "p1");
    assert.match(String((await h("ap_abrir", "cos", { producto_id: "p1", destino: "CABINA" })).error), /firma/);
    const a1 = await h("ap_abrir", "cos", { producto_id: "p1", destino: "CABINA", firma: FIRMA });
    assert.equal(a1.ok, true);
    const movs = () => db.tables.get("erp_movimientos")!.filter((m) => m.tipo === "consumo_cabina");
    assert.equal(movs().length, 1);
    assert.equal(movs()[0].delta, -1);
    assert.equal(movs()[0].bodega_id, "b1");
    // Faciales del 1 al 3 de noviembre (hora de pared con Z).
    db.tables.set("tickets", [
      { id: 1, timestamp: "2026-11-01T11:00:00Z", facial_hecho: "SUNSU-01 Facial S.O.S" },
      { id: 2, timestamp: "2026-11-02T11:00:00Z", facial_hecho: "SUNSU-01 Facial S.O.S" },
      { id: 3, timestamp: "2026-11-02T12:00:00Z", facial_hecho: "SUNSU-01 Facial S.O.S", orig: { anulado: true } },
      { id: 4, timestamp: "2026-11-02T13:00:00Z", facial_hecho: "SUNSU-02 Facial Reparación" },
    ]);
    assert.match(String((await h("ap_aplica_guardar", "cos", { producto_id: "p1", faciales: ["SUNSU-01"] })).error), /admin/);
    assert.equal((await h("ap_aplica_guardar", "adm", { producto_id: "p1", faciales: ["SUNSU-01", "NO-EXISTE"] })).aplica.length, 1);
    setNow("2026-11-04T15:00:00Z");
    const a2 = await h("ap_abrir", "cos", { producto_id: "p1", destino: "CABINA", firma: FIRMA });
    assert.deepEqual(a2.cerradas, [a1.id]);
    const st = await h("ap_producto", "cos", { producto_id: "p1" });
    assert.equal((st.destinos as Row[])[0].stock, 3);
    const L = await h("ap_lista", "adm", {});
    const prod = (L.productos as Row[])[0];
    assert.equal(prod.cerrados, 1);
    assert.equal(prod.faciales, 2);
    assert.equal(prod.costoPorFacial, 6);
    assert.equal(prod.usoPorFacial, 15);
    assert.equal((L.protocolo as Row[])[0].code, "SUNSU-01");
    const Lc = await h("ap_lista", "cos", {});
    assert.equal("costoPorFacial" in (Lc.productos as Row[])[0], false);
    // Anular la segunda: vuelve la unidad y el primer envase queda abierto otra vez.
    assert.equal((await h("ap_anular", "adm", { id: a2.id, motivo: "error" })).reabiertas, 1);
    assert.equal(((await h("ap_producto", "cos", { producto_id: "p1" })).destinos as Row[])[0].stock, 4);
    assert.ok(db.tables.get("log_acciones")!.length >= 3);
    // Producto de venta abierto en cabina: la unidad sale de Venta (la bodega de cabina no admite productos de venta).
    const v = await h("ap_abrir", "cos", { producto_id: "p2", destino: "CAB2", firma: FIRMA });
    assert.equal(v.saleDe, "Local");
    assert.equal(db.tables.get("erp_movimientos")!.filter((m) => m.producto_id === "p2").at(-1)!.bodega_id, "bv");
    assert.equal(db.tables.get("beta_aperturas")!.find((a) => a.id === v.id)!.destino, "CAB2");
  });
  it("TK44: producto en 🤝 consignación sale de la bodega Consignación y queda como consumo a costo en la liquidación", async () => {
    const { db, h } = semilla();
    db.tables.set("erp_bodegas", [...db.tables.get("erp_bodegas")!, { id: "bc", codigo: "CONSIGNACION", nombre: "Consignación", tipo: "consignacion" }]);
    db.tables.set("erp_proveedores", [{ id: "prov-ml", nombre: "Hebetronic", activo: true }]);
    db.tables.set("beta_proveedores_ficha", [{ familia: "ML", consignacion: true }, { familia: "HT", consignacion: false }]);
    db.tables.set("erp_consignacion_consumo", []);
    db.tables.set("erp_stock", [{ producto_id: "p2", bodega_id: "bc", cantidad: 3 }]);
    db.tables.get("erp_movimientos")!.push({ id: "m1", producto_id: "p2", bodega_id: "bc", delta: 3, tipo: "recepcion" });
    const pr = await h("ap_producto", "cos", { producto_id: "p2" });
    assert.equal((pr.producto as Row).consignacion, true);
    assert.equal(((pr.destinos as Row[]).find((d) => d.codigo === "CABINA") as Row).consig, true);
    assert.equal(((pr.destinos as Row[]).find((d) => d.codigo === "CABINA") as Row).saleDe, "Consignación");
    const a = await h("ap_abrir", "cos", { producto_id: "p2", destino: "CABINA", firma: FIRMA });
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.equal(a.consignacion, true);
    assert.equal(a.saleDe, "Consignación");
    assert.equal(db.tables.get("erp_movimientos")!.filter((m) => m.producto_id === "p2").at(-1)!.bodega_id, "bc");
    const C = db.tables.get("erp_consignacion_consumo")!;
    assert.equal(C.length, 1);
    assert.equal(C[0].familia, "ML"); assert.equal(C[0].cantidad, 1); assert.ok(Number(C[0].costo_unit) >= 0);
    // TK127: el consumo se informa en la liquidación, pero no se paga (solo lo vendido de stock del proveedor).
    const liq = await borradorConsig(db as never, new Date("2026-11-01T14:00:00Z"), { proveedor_id: "prov-ml", familia: "ML", anio: 2026, mes: 11, quincena: 1 });
    const it = ((liq.items || []) as Row[]).find((x) => x.sku === "ML-001")!;
    assert.equal(it.consumido, 1);
    assert.equal(it.subtotal, 0);
    // HT con consignación OFF: no genera consumo.
    await h("ap_abrir", "cos", { producto_id: "p1", destino: "CABINA", firma: FIRMA });
    assert.equal(db.tables.get("erp_consignacion_consumo")!.length, 1);
    // Anular la apertura compensa el consumo (−1), sin borrar nada.
    await h("ap_anular", "adm", { id: a.id, motivo: "me equivoqué" });
    const C2 = db.tables.get("erp_consignacion_consumo")!;
    assert.equal(C2.length, 2); assert.equal(C2.reduce((x, c) => x + Number(c.cantidad), 0), 0);
  });
  it("TK49: el código viejo (alias INV-098 → BV-002) encuentra el producto recodificado", async () => {
    const { db, h } = semilla();
    db.tables.get("erp_productos")!.push({ id: "pbv", sku: "BV-002", nombre: "Concentrado Calmante - Bruno Vassari", clase: "producto", uso: "cabina", activo: true });
    db.tables.set("beta_sku_alias", [{ alias: "INV-098", sku: "BV-002", origen: "recodificacion_bv" }]);
    const r = await h("ap_buscar", "cos", { q: "INV-098" });
    assert.equal(r.exacto, "pbv");
    assert.equal(((r.items as Row[])[0]).sku, "BV-002");
  });
});
