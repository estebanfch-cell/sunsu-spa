import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import "./conteo_fisico_api.ts";
import type { Row } from "./domain.ts";
import { readFileSync } from "node:fs";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
    { token: "otra", uid: "u-bea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "u-ana", nombre: "Ana", short: "Ana", rol: "cosmetologa", bloqueado: false },
    { id: "u-bea", nombre: "Bea", short: "Bea", rol: "cosmetologa", bloqueado: false },
  ]);
  db.tables.set("erp_productos", [
    { id: "p1", sku: "ML-001", nombre: "Ampoule", clase: "producto", uso: "venta", activo: true },
    { id: "p2", sku: "ML-002", nombre: "Cream", clase: "producto", uso: "venta", activo: true },
    { id: "p3", sku: "HT-001", nombre: "Oil", clase: "producto", uso: "venta", activo: true },
  ]);
  db.tables.set("erp_bodegas", [{ id: "11111111-1111-4111-8111-111111111111", codigo: "VENTA", nombre: "Venta", tipo: "venta" }]);
  db.tables.set("erp_stock", [
    { producto_id: "p1", bodega_id: "11111111-1111-4111-8111-111111111111", cantidad: 5 },
    { producto_id: "p2", bodega_id: "11111111-1111-4111-8111-111111111111", cantidad: 2 },
  ]);
  for (const t of ["catalogo", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "beta_conteos", "beta_conteo_lineas", "beta_notificaciones", "beta_conteo_secciones", "beta_conteo_plan", "beta_stock_movimientos", "beta_conteo_zonas", "erp_sububicaciones"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-17T17:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}

describe("conteo físico beta", () => {
  it("flujo completo: crear → aviso → empezar (foto del sistema) → contar → enviar → devolver → aprobar sin mover stock", async () => {
    const { db, h } = semilla();
    assert.match(String((await h("cf_crear", "cos", { bodega: "CONSIGNACION", asignado_a: "u-bea" })).error), /para ti/);
    const cr = await h("cf_crear", "adm", { bodega: "CONSIGNACION", asignado_a: "u-ana", nota: "Inventario inicial" });
    assert.equal(cr.numero, "CF-001");
    assert.match(String((await h("cf_crear", "adm", { bodega: "CONSIGNACION", asignado_a: "u-bea" })).error), /Ya hay un conteo abierto/);
    const nt = await h("notif_mias", "cos");
    assert.equal(nt.sinLeer, 1); assert.match(String((nt.items as Row[])[0].link), /#\/m\/conteos\//);
    assert.equal(((await h("cf_list", "otra")).items as Row[]).length, 0);
    assert.equal(((await h("cf_list", "cos", { mios: true })).items as Row[]).length, 1);
    assert.match(String((await h("cf_iniciar", "otra", { id: cr.id })).error), /no está asignado/);
    assert.equal((await h("cf_iniciar", "cos", { id: cr.id })).lineas, 2);
    let g = await h("cf_get", "cos", { id: cr.id });
    const L = g.lineas as Row[];
    // Conteo a ciegas: la persona que cuenta no recibe el stock del sistema ni diferencias.
    assert.equal(g.ciego, true);
    assert.deepEqual(L.map((l) => [l.sku, l.sistema, l.diferencia]), [["ML-001", null, null], ["ML-002", null, null]]);
    assert.equal((g.conteo as Row).conDiferencia, null);
    assert.ok(!JSON.stringify(g).includes('"sistema":5'));
    const ga = await h("cf_get", "adm", { id: cr.id });
    assert.equal(ga.ciego, false);
    assert.deepEqual((ga.lineas as Row[]).map((l) => [l.sku, l.sistema]), [["ML-001", 5], ["ML-002", 2]]);
    assert.match(String((await h("cf_enviar", "cos", { id: cr.id })).error), /Faltan 2/);
    await h("cf_guardar", "cos", { id: cr.id, lineas: [{ id: L[0].id, contado: 4 }, { id: L[1].id, estado: "no_encontrado" }], agregar: { sku: "HT-001", contado: 3 } });
    g = await h("cf_get", "adm", { id: cr.id });
    assert.deepEqual((g.lineas as Row[]).map((l) => [l.sku, l.estado, l.diferencia]), [["ML-001", "contado", -1], ["ML-002", "no_encontrado", -2], ["HT-001", "contado", 3]]);
    assert.equal((g.conteo as Row).conDiferencia, 3);
    const gl = await h("cf_list", "cos", { mios: true });
    assert.equal(((gl.items as Row[])[0]).conDiferencia, null);
    assert.equal((await h("cf_enviar", "cos", { id: cr.id })).ok, true);
    assert.equal((await h("notif_mias", "adm")).sinLeer, 1);
    assert.match(String((await h("cf_guardar", "cos", { id: cr.id, lineas: [] })).error), /no está abierto/);
    assert.match(String((await h("cf_revisar", "adm", { id: cr.id, que: "devolver" })).error), /Escribe/);
    await h("cf_revisar", "adm", { id: cr.id, que: "devolver", nota: "Vuelve a contar ML-002" });
    assert.equal(((await h("cf_get", "cos", { id: cr.id })).conteo as Row).estado, "en_conteo");
    await h("cf_enviar", "cos", { id: cr.id });
    const stockAntes = JSON.stringify(db.tables.get("erp_stock"));
    const ap = await h("cf_revisar", "adm", { id: cr.id, que: "aprobar" });
    assert.equal(ap.stockAplicado, false);
    assert.equal(JSON.stringify(db.tables.get("erp_stock")), stockAntes);
    assert.equal(db.tables.get("erp_movimientos")!.length, 0);
    assert.equal(((await h("cf_get", "adm", { id: cr.id })).conteo as Row).estado, "aprobado");
    await h("notif_leer", "cos", { todas: true });
    assert.equal((await h("notif_mias", "cos")).sinLeer, 0);
  });
  it("TK108: el personal crea un conteo para sí, lo envía y el admin lo aprueba sin mover stock", async () => {
    const { db, h } = semilla();
    const cr = await h("cf_crear", "cos", { bodega: "CONSIGNACION" });
    assert.equal(cr.ok, true);
    assert.equal(cr.numero, "CF-001");
    const ini = await h("cf_iniciar", "cos", { id: cr.id });
    assert.ok(Number(ini.lineas) >= 1);
    const g = await h("cf_get", "cos", { id: cr.id });
    assert.equal(g.ciego, true);
    const L = g.lineas as Row[];
    await h("cf_guardar", "cos", { id: cr.id, lineas: L.map((l) => ({ id: l.id, contado: 1 })) });
    assert.equal((await h("cf_enviar", "cos", { id: cr.id })).ok, true);
    const stockAntes = JSON.stringify(db.tables.get("erp_stock"));
    const ap = await h("cf_revisar", "adm", { id: cr.id, que: "aprobar" });
    assert.equal(ap.stockAplicado, false);
    assert.equal(JSON.stringify(db.tables.get("erp_stock")), stockAntes);
  });
});

describe("TK116 conteo general vivo como MineCore", () => {
  it("se guarda a medias, otra persona lo retoma, y el esperado se actualiza con ventas durante el conteo", async () => {
    const { db, h } = semilla();
    const cr = await h("cf_crear_general", "cos", {});
    assert.equal(cr.ok, true);
    assert.equal(cr.numero, "CF-001");
    const g0 = await h("cf_get_general", "cos", { id: cr.id });
    assert.equal((g0.secciones as Row[]).length, 5);
    const venta = (g0.secciones as Row[]).find((s) => s.nombre === "Venta")!;
    const ini = await h("cf_sec_iniciar", "cos", { id: venta.id });
    assert.ok(Number(ini.lineas) >= 2);
    const get1 = await h("cf_sec_get", "cos", { id: venta.id });
    const L = get1.lineas as Row[];
    const amp = L.find((l) => l.sku === "ML-001")!;
    assert.equal(amp.sistema, 5);
    assert.equal(amp.esperado, 5);
    const stock = db.tables.get("erp_stock")!.find((r) => r.producto_id === "p1")!;
    stock.cantidad = 4;
    db.tables.get("erp_movimientos")!.push({
      id: "m-vta", fecha: "2026-11-17T17:05:00.000Z", actor: "Ana", producto_id: "p1",
      bodega_id: "11111111-1111-4111-8111-111111111111", sububicacion: "", delta: -1, tipo: "venta", ticket_ref: "TK-1",
    });
    const get2 = await h("cf_sec_get", "cos", { id: venta.id });
    const amp2 = (get2.lineas as Row[]).find((l) => l.sku === "ML-001")!;
    assert.equal(amp2.esperado, 4);
    assert.equal(amp2.mov, -1);
    assert.ok(((get2.movimientos as Row[]) || []).some((m) => m.label === "Venta" && m.delta === -1 && (m.sku === "ML-001" || !m.sku)));
    const sav = await h("cf_sec_guardar", "cos", { id: venta.id, lineas: [{ id: amp.id, contado: 4 }] });
    assert.equal(sav.ok, true);
    const sav2 = await h("cf_sec_guardar", "otra", { id: venta.id, lineas: L.filter((l) => l.sku !== "ML-001").map((l) => ({ id: l.id, contado: l.esperado })) });
    assert.equal(sav2.ok, true);
    const cerrar = await h("cf_sec_cerrar", "otra", { id: venta.id });
    assert.equal(cerrar.ok, true);
    const get3 = await h("cf_sec_get", "adm", { id: venta.id });
    assert.equal((get3.seccion as Row).estado, "en_revision");
    const amp3 = (get3.lineas as Row[]).find((l) => l.sku === "ML-001")!;
    assert.equal(amp3.esperado, 4);
    const stockAntes = JSON.stringify(db.tables.get("erp_stock"));
    const ap = await h("cf_sec_aprobar", "adm", { id: venta.id });
    assert.equal(ap.stockAplicado, false);
    assert.equal(JSON.stringify(db.tables.get("erp_stock")), stockAntes);
  });

  it("buscar después impide terminar hasta que se quite", async () => {
    const { h } = semilla();
    const cr = await h("cf_crear_general", "cos", {});
    const g0 = await h("cf_get_general", "cos", { id: cr.id });
    const venta = (g0.secciones as Row[]).find((s) => s.nombre === "Venta")!;
    await h("cf_sec_iniciar", "cos", { id: venta.id });
    const get1 = await h("cf_sec_get", "cos", { id: venta.id });
    const L = get1.lineas as Row[];
    await h("cf_sec_guardar", "cos", { id: venta.id, lineas: L.map((l, i) => ({ id: l.id, contado: l.esperado, buscar: i === 0 })) });
    const blocked = await h("cf_sec_cerrar", "cos", { id: venta.id });
    assert.match(String(blocked.error || ""), /buscar/i);
    await h("cf_sec_guardar", "cos", { id: venta.id, lineas: L.map((l) => ({ id: l.id, contado: l.esperado, buscar: false })) });
    const ok = await h("cf_sec_cerrar", "cos", { id: venta.id });
    assert.equal(ok.ok, true);
  });

  it("el front tiene Guardado, Terminar, esp. visible, banner de movimientos y el menú de la fila", () => {
    const js = readFileSync(new URL("../../../mc-conteo.js", import.meta.url), "utf8");
    assert.match(js, /Nuevo conteo general/);
    assert.match(js, /Hojas sueltas \(antes\)/);
    assert.match(js, /inventario sigue vivo/);
    assert.match(js, /guardar, salir y volver/);
    assert.match(js, /esp\. /);
    assert.match(js, /Recontar: hubo movimientos durante el conteo/);
    assert.match(js, /Está en otro lugar/);
    assert.match(js, /Buscar después/);
    assert.match(js, /Agregar ubicación/);
    assert.match(js, /✓ Guardado/);
    assert.match(js, />Terminar</);
    assert.doesNotMatch(js, /costo_unit|compraReal|costo_promedio/);
  });
});

describe("TK117 secciones y sububicaciones (admin, como MineCore)", () => {
  it("el personal no puede crear ni editar; el admin agrega, renombra, reordena, desactiva si ya hubo conteo y crea una sububicación", async () => {
    const { db, h } = semilla();
    assert.match(String((await h("cf_zona_save", "cos", { nombre: "Cabina 4", bodega: "CABINA", sububicacion: "CABINA_4" })).error), /admin/i);
    const z0 = await h("cf_zonas", "adm", {});
    assert.equal(z0.admin, true);
    assert.equal((z0.zonas as Row[]).length, 5);
    const cr = await h("cf_zona_save", "adm", { nombre: "Cabina 4", bodega: "CABINA", sububicacion: "CABINA_4", frecuencia_dias: 15 });
    assert.equal(cr.ok, true);
    const ren = await h("cf_zona_save", "adm", { id: cr.id, nombre: "Cabina cuatro", bodega: "CABINA", sububicacion: "CABINA_4", frecuencia_dias: 15 });
    assert.equal(ren.ok, true);
    const z1 = await h("cf_zonas", "adm", {});
    const c4 = (z1.zonas as Row[]).find((x) => x.id === cr.id)!;
    assert.equal(c4.nombre, "Cabina cuatro");
    const ids = (z1.zonas as Row[]).map((x) => x.id);
    const reord = ids.slice();
    const last = reord.pop()!;
    reord.unshift(last);
    assert.equal((await h("cf_zona_orden", "adm", { ids: reord })).ok, true);
    const z2 = await h("cf_zonas", "adm", {});
    assert.equal((z2.zonas as Row[])[0].id, cr.id);
    const gen = await h("cf_crear_general", "adm", { asignado_a: "u-ana" });
    assert.equal(gen.ok, true);
    const g = await h("cf_get_general", "adm", { id: gen.id });
    assert.ok((g.secciones as Row[]).some((s) => s.nombre === "Cabina cuatro"));
    assert.equal((g.secciones as Row[]).length, 6);
    const delUsada = await h("cf_zona_borrar", "adm", { id: cr.id });
    assert.equal(delUsada.desactivada, true);
    const venta = (z2.zonas as Row[]).find((x) => x.nombre === "Venta")!;
    // Venta aún no se usó... actually the general count copied all 6 including Venta, so delete should deactivate.
    const delVenta = await h("cf_zona_borrar", "adm", { id: venta.id });
    assert.equal(delVenta.desactivada, true);
    const sub = await h("cf_sub_save", "adm", { bodega: "CABINA", codigo: "CABINA_5", nombre: "Cabina 5", como_seccion: true });
    assert.equal(sub.ok, true);
    const z3 = await h("cf_zonas", "adm", {});
    assert.ok((z3.zonas as Row[]).some((x) => x.sububicacion === "CABINA_5" && x.nombre === "Cabina 5"));
  });

  it("no se puede desactivar ni mover de bodega una sububicación con stock", async () => {
    const { db, h } = semilla();
    db.tables.get("erp_sububicaciones")!.push({ id: "s1", bodega_id: "22222222-2222-4222-8222-222222222222", codigo: "CABINA_1", nombre: "Cabina 1", orden: 1, activo: true });
    // stock of p1 is on VENTA (CONSIGNACION), not cabina — put cabina stock
    db.tables.get("erp_bodegas")!.push({ id: "22222222-2222-4222-8222-222222222222", codigo: "CABINA", nombre: "Cabina", tipo: "cabina" });
    db.tables.get("erp_stock")!.push({ producto_id: "p1", bodega_id: "22222222-2222-4222-8222-222222222222", sububicacion: "CABINA_1", cantidad: 3 });
    const bad = await h("cf_sub_save", "adm", { id: "s1", bodega: "CABINA", codigo: "CABINA_1", nombre: "Cabina 1", mover_a: "OFICINA", activo: true });
    assert.match(String(bad.error || ""), /stock/i);
    const bad2 = await h("cf_sub_save", "adm", { bodega: "CABINA", codigo: "CABINA_1", nombre: "Cabina 1", activo: false });
    assert.match(String(bad2.error || ""), /stock/i);
  });

  it("el editor de Secciones está en el front, solo con acciones de admin", () => {
    const js = readFileSync(new URL("../../../mc-conteo.js", import.meta.url), "utf8");
    assert.match(js, /Secciones del local/);
    assert.match(js, /cf_zona_save/);
    assert.match(js, /cf_zona_borrar/);
    assert.match(js, /cf_zona_orden/);
    assert.match(js, /Nueva sububicación/);
    assert.match(js, /Solo un admin puede agregar o cambiar/);
    assert.doesNotMatch(js, /costo_unit|compraReal|costo_promedio/);
  });
});
