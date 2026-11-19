import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import "./conteo_fisico_api.ts";
import type { Row } from "./domain.ts";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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
  for (const t of ["catalogo", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "beta_conteos", "beta_conteo_lineas", "beta_notificaciones", "beta_conteo_secciones", "beta_conteo_plan", "beta_stock_movimientos", "beta_conteo_zonas", "erp_sububicaciones", "beta_sububicaciones"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-17T17:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}


async function sembrarZonas(h: (a: string, u: string, p?: Row) => Promise<Row>) {
  const zonas = [
    { nombre: "Venta", bodega: "CONSIGNACION", sububicacion: "", prefijos: "" },
    { nombre: "Bodega Oficina", bodega: "OFICINA", sububicacion: "", prefijos: "" },
    { nombre: "Cabina 1", bodega: "CABINA", sububicacion: "CABINA_1", prefijos: "" },
    { nombre: "Cabina 2", bodega: "CABINA", sububicacion: "CABINA_2", prefijos: "" },
    { nombre: "Cabina 3", bodega: "CABINA", sububicacion: "CABINA_3", prefijos: "" },
  ];
  for (const z of zonas) {
    const r = await h("cf_zona_save", "adm", z);
    if (r.error) throw new Error(String(r.error));
  }
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
    assert.equal(((await h("cf_list", "otra")).items as Row[]).length, 1); // TK120: el equipo con acceso puede retomar
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
    await sembrarZonas(h);
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
    await sembrarZonas(h);
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
    assert.match(js, /\+ Nuevo conteo/);
    assert.match(js, /Hojas sueltas/);
    assert.match(js, /inventario sigue vivo/);
    assert.match(js, /cc-topbtns/);
    assert.match(js, /data-cf-bod="OFICINA"/);
    assert.match(js, /Bodega Oficina/);
    assert.match(js, /Bodega Cabina/);
    assert.match(js, /por revisar/);
    assert.match(js, /🔍 Escanea o busca código \/ nombre/);
    assert.doesNotMatch(js, /#0b1219|body:has\(#cc\) \.tabbar/);
    assert.match(js, /guardar, salir y volver/);
    assert.match(js, /var\(--navy\)/);
    assert.match(js, /var\(--gold\)/);
    assert.match(js, /var\(--cream\)/);
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

describe("TK117/TK118 secciones y sububicaciones (admin, catálogo vacío)", () => {
  it("el catálogo empieza vacío; el personal no edita secciones; el admin agrega, renombra, reordena y desactiva; crear un estante no siembra una sección", async () => {
    const { h } = semilla();
    assert.match(String((await h("cf_zona_save", "cos", { nombre: "Sección 8", bodega: "CONSIGNACION", prefijos: "8-" })).error), /admin/i);
    const z0 = await h("cf_zonas", "adm", {});
    assert.equal(z0.admin, true);
    assert.equal((z0.zonas as Row[]).length, 0);
    assert.equal((z0.sinZona as Row[]).length, 0);
    assert.equal((z0.lugares as Row[]).length, 3);
    assert.ok((z0.lugares as Row[]).some((x) => x.nombre === "Venta"));
    assert.ok((z0.lugares as Row[]).some((x) => x.nombre === "Bodega Cabina"));
    assert.ok((z0.lugares as Row[]).some((x) => x.nombre === "Bodega Oficina"));
    assert.ok((z0.subs as Row[]).some((x) => x.codigo === "CABINA_1"));
    assert.ok((z0.subs as Row[]).some((x) => x.codigo === "CABINA_2"));
    assert.ok((z0.subs as Row[]).some((x) => x.codigo === "CABINA_3"));
    assert.ok(!(z0.subs as Row[]).some((x) => x.bodega === "OFICINA"));
    // El conteo de una bodega ya no exige un catálogo de secciones.
    const ofi = await h("cf_crear", "adm", { bodega: "OFICINA", iniciar: true });
    assert.equal(ofi.ok, true);
    assert.match(String((await h("cf_crear_general", "cos", {})).error || ""), /secciones/i);
    const cr = await h("cf_zona_save", "adm", { nombre: "Sección 8", bodega: "CONSIGNACION", prefijos: "8-, =", frecuencia_dias: 15 });
    assert.equal(cr.ok, true);
    const ren = await h("cf_zona_save", "adm", { id: cr.id, nombre: "Sección ocho", bodega: "CONSIGNACION", prefijos: "8-, =", frecuencia_dias: 15 });
    assert.equal(ren.ok, true);
    const z1 = await h("cf_zonas", "adm", {});
    const c4 = (z1.zonas as Row[]).find((x) => x.id === cr.id)!;
    assert.equal(c4.nombre, "Sección ocho");
    const otra = await h("cf_zona_save", "adm", { nombre: "Sección 1", bodega: "OFICINA", prefijos: "1-" });
    assert.equal(otra.ok, true);
    const z2pre = await h("cf_zonas", "adm", {});
    const ids = (z2pre.zonas as Row[]).map((x) => x.id);
    const reord = ids.slice();
    const last = reord.pop()!;
    reord.unshift(last);
    assert.equal((await h("cf_zona_orden", "adm", { ids: reord })).ok, true);
    const z2 = await h("cf_zonas", "adm", {});
    assert.equal((z2.zonas as Row[])[0].id, otra.id);
    const gen = await h("cf_crear_general", "adm", { asignado_a: "u-ana" });
    assert.equal(gen.ok, true);
    const g = await h("cf_get_general", "adm", { id: gen.id });
    assert.ok((g.secciones as Row[]).some((s) => s.nombre === "Sección ocho"));
    assert.equal((g.secciones as Row[]).length, 2);
    const delUsada = await h("cf_zona_borrar", "adm", { id: cr.id });
    assert.equal(delUsada.desactivada, true);
    const delOtra = await h("cf_zona_borrar", "adm", { id: otra.id });
    assert.equal(delOtra.desactivada, true);
    const sub = await h("cf_sub_save", "adm", { bodega: "CONSIGNACION", codigo: "8-A-1", nombre: "Estante 8-A-1" });
    assert.equal(sub.ok, true);
    const z3 = await h("cf_zonas", "adm", {});
    assert.ok((z3.subs as Row[]).some((x) => x.codigo === "8-A-1" && x.nombre === "Estante 8-A-1"));
    assert.ok(!(z3.zonas as Row[]).some((x) => x.sububicacion === "8-A-1"));
  });

  it("no se puede desactivar ni mover de bodega una sububicación con stock", async () => {
    const { db, h } = semilla();
    const sub = await h("cf_sub_save", "adm", { bodega: "CONSIGNACION", codigo: "8-A-1", nombre: "8-A-1" });
    assert.equal(sub.ok, true);
    db.tables.get("erp_stock")!.push({ producto_id: "p1", bodega_id: "11111111-1111-4111-8111-111111111111", sububicacion: "8-A-1", cantidad: 3 });
    const bad = await h("cf_sub_save", "adm", { id: sub.id, bodega: "CONSIGNACION", codigo: "8-A-1", nombre: "8-A-1", mover_a: "OFICINA", activo: true });
    assert.match(String(bad.error || ""), /stock/i);
    const bad2 = await h("cf_sub_save", "adm", { id: sub.id, bodega: "CONSIGNACION", codigo: "8-A-1", nombre: "8-A-1", activo: false });
    assert.match(String(bad2.error || ""), /stock/i);
  });

  it("el personal puede crear un estante en el conteo; el producto sin sububicación muestra la bodega", async () => {
    const { h } = semilla();
    await sembrarZonas(h);
    const cr = await h("cf_crear_general", "cos", {});
    const g0 = await h("cf_get_general", "cos", { id: cr.id });
    const venta = (g0.secciones as Row[]).find((s) => s.nombre === "Venta")!;
    await h("cf_sec_iniciar", "cos", { id: venta.id });
    const get1 = await h("cf_sec_get", "cos", { id: venta.id });
    const amp = (get1.lineas as Row[]).find((l) => l.sku === "ML-001")!;
    assert.equal(amp.fromSub, "Venta");
    const sub = await h("cf_sub_save", "cos", { bodega: "CONSIGNACION", codigo: "8-A-1", nombre: "8-A-1" });
    assert.equal(sub.ok, true);
    assert.equal(sub.codigo, "8-A-1");
  });

  it("el editor de Secciones está en el front, solo con acciones de admin", () => {
    const js = readFileSync(new URL("../../../mc-conteo.js", import.meta.url), "utf8");
    assert.match(js, /Sububicaciones/);
    assert.match(js, /Crear sububicación/);
    assert.match(js, /Hay tres bodegas/);
    assert.match(js, /Cabina 1, 2 y 3 ya existen/);
    assert.doesNotMatch(js, /Sububicaciones con stock que no están en ninguna sección/);
    assert.doesNotMatch(js, /costo_unit|compraReal|costo_promedio/);
  });
});


describe("TK120 conteo por bodega y allowlist", () => {
  it("un admin cuenta Oficina, crea una sububicación al vuelo, guarda, retoma y termina", async () => {
    const { db, h } = semilla();
    db.tables.get("erp_bodegas")!.push({ id: "44444444-4444-4444-8444-444444444444", codigo: "CASA", nombre: "Oficina", tipo: "casa" });
    db.tables.get("erp_stock")!.push(
      { producto_id: "p1", bodega_id: "44444444-4444-4444-8444-444444444444", cantidad: 4 },
      { producto_id: "p3", bodega_id: "44444444-4444-4444-8444-444444444444", cantidad: 1 },
    );
    db.tables.set("erp_sububicaciones", [
      { id: "sub-c1", bodega_id: "22222222-2222-4222-8222-222222222222", codigo: "CABINA_1", nombre: "Cabina 1", activo: true },
      { id: "sub-c2", bodega_id: "22222222-2222-4222-8222-222222222222", codigo: "CABINA_2", nombre: "Cabina 2", activo: true },
      { id: "sub-c3", bodega_id: "22222222-2222-4222-8222-222222222222", codigo: "CABINA_3", nombre: "Cabina 3", activo: true },
    ]);
    const meta = await h("cf_meta", "adm", {});
    assert.equal((meta.bodegas as Row[]).length, 3);
    assert.equal(((meta.subs as Record<string, Row[]>).OFICINA || []).length, 0);
    assert.equal(((meta.subs as Record<string, Row[]>).CABINA || []).length, 3);

    const cr = await h("cf_crear", "adm", { bodega: "OFICINA", iniciar: true });
    assert.equal(cr.ok, true);
    assert.equal(cr.numero, "CF-001");
    const ini = await h("cf_iniciar", "adm", { id: cr.id });
    assert.ok(Number(ini.lineas) >= 2, "debe listar el stock esperado de Oficina");
    let g = await h("cf_get", "adm", { id: cr.id });
    assert.equal((g.conteo as Row).bodega, "OFICINA");
    const L = g.lineas as Row[];
    const amp = L.find((l) => l.sku === "ML-001")!;
    assert.ok(Number(amp.esperado) === 4 || Number(amp.sistema) === 4);
    const sub = await h("cf_sub_save", "adm", { bodega: "OFICINA", codigo: "OF-A-1", nombre: "Estante A-1" });
    assert.equal(sub.ok, true);
    assert.equal(sub.codigo, "OF-A-1");
    assert.ok(Array.isArray(sub.subs) && (sub.subs as Row[]).some((x) => x.codigo === "OF-A-1"), "cf_sub_save debe devolver la sub en la lista de la bodega");
    const erp = db.tables.get("erp_sububicaciones")!;
    assert.equal(erp.filter((x) => x.codigo === "CABINA_1").length, 1);
    assert.ok(erp.some((x) => x.codigo === "OF-A-1"));
    await h("cf_guardar", "adm", { id: cr.id, lineas: [{ id: amp.id, contado: 4, sub_contada: "OF-A-1" }] });
    g = await h("cf_get", "adm", { id: cr.id });
    const amp2 = (g.lineas as Row[]).find((l) => l.sku === "ML-001")!;
    assert.equal(amp2.subContada, "OF-A-1");
    assert.ok(((g.subs as Row[]) || []).some((x) => x.codigo === "OF-A-1"));
    const list = await h("cf_list", "adm", {});
    assert.ok((list.items as Row[]).some((c) => c.id === cr.id && c.estado === "en_conteo"));
    const g2 = await h("cf_get", "adm", { id: cr.id });
    assert.equal((g2.conteo as Row).estado, "en_conteo");
    await h("cf_guardar", "adm", { id: cr.id, lineas: (g2.lineas as Row[]).map((l) => ({ id: l.id, contado: l.contado ?? 0, sub_contada: l.subContada || l.sububicacion })) });
    const fin = await h("cf_enviar", "adm", { id: cr.id, forzar: true });
    assert.equal(fin.ok, true);
    const g3 = await h("cf_get", "adm", { id: cr.id });
    assert.equal((g3.conteo as Row).estado, "en_revision");
    const amp3 = (g3.lineas as Row[]).find((l) => l.sku === "ML-001")!;
    assert.ok(amp3.esperado != null);
  });

  it("BETA_TABLAS cubre cada tabla beta_/erp_sububicaciones que escribe la API y está en el SQL", () => {
    const dbSrc = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    const m = dbSrc.match(/export const BETA_TABLAS = new Set\(\[([\s\S]*?)\]\);/);
    assert.ok(m, "BETA_TABLAS no encontrado");
    const beta = new Set([...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
    const sql = readFileSync(new URL("../../../docs/supabase/20261119_tk120_conteo_bodega.sql", import.meta.url), "utf8");
    const sm = sql.match(/array\[([\s\S]*?)\]/);
    assert.ok(sm, "allowlist SQL no encontrado");
    const allowed = new Set([...sm![1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
    const missingSql = [...beta].filter((t) => !allowed.has(t));
    assert.equal(missingSql.join(","), "", "en BETA_TABLAS pero no en app_beta_write: " + missingSql.join(", "));
    const dir = new URL(".", import.meta.url).pathname;
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const pth = join(d, f);
        if (statSync(pth).isDirectory()) { if (f !== "node_modules") walk(pth); }
        else if (f.endsWith(".ts") && !f.endsWith(".test.ts")) files.push(pth);
      }
    };
    walk(dir);
    const used = new Set<string>();
    const re = /\.write\s*\([^,]+,\s*["']([A-Za-z0-9_]+)["']/g;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      let x: RegExpExecArray | null;
      const local = new RegExp(re);
      while ((x = local.exec(src))) used.add(x[1]);
    }
    const need = [...used].filter((t) => t.startsWith("beta_") || t === "erp_sububicaciones");
    const missingTs = need.filter((t) => !beta.has(t));
    assert.equal(missingTs.join(","), "", "la API escribe tablas fuera de BETA_TABLAS: " + missingTs.join(", "));
    assert.ok(beta.has("beta_sububicaciones"));
    assert.ok(beta.has("erp_sububicaciones"));
  });

  it("el front agrega la sububicación al desplegable al instante, la deja elegida y no recarga ni borra cantidades", () => {
    const js = readFileSync(new URL("../../../mc-conteo.js", import.meta.url), "utf8");
    assert.match(js, /function aplicarSubCreada/);
    assert.match(js, /function quitarSubCreada/);
    assert.match(js, /C\.otra = lineaId/);
    const start = js.indexOf('if (que === "crear-sub")');
    assert.ok(start >= 0);
    const block = js.slice(start, js.indexOf('if (que === "asig-sub"', start));
    assert.match(block, /aplicarSubCreada\(codigo, nombre, id\)/);
    assert.match(block, /cf_sub_save/);
    assert.doesNotMatch(block, /\bgo\s*\(/);
    assert.doesNotMatch(block, /C\.dirty\s*=\s*\{\}/);
  });

  it("se puede agregar al conteo de bodega un producto del catálogo que no estaba en la foto, con esperado 0; uno de fuera no entra", async () => {
    const { db, h } = semilla();
    db.tables.get("erp_bodegas")!.push({ id: "44444444-4444-4444-8444-444444444444", codigo: "CASA", nombre: "Oficina", tipo: "casa" });
    db.tables.get("erp_stock")!.push({ producto_id: "p1", bodega_id: "44444444-4444-4444-8444-444444444444", cantidad: 4 });
    const cr = await h("cf_crear", "adm", { bodega: "OFICINA", iniciar: true });
    await h("cf_iniciar", "adm", { id: cr.id });
    const g0 = await h("cf_get", "adm", { id: cr.id });
    const skus0 = (g0.lineas as Row[]).map((l) => l.sku);
    assert.ok(skus0.includes("ML-001"));
    assert.ok(!skus0.includes("ML-002"), "ML-002 no tiene stock en Oficina, no va en la foto inicial");
    const amp = (g0.lineas as Row[]).find((l) => l.sku === "ML-001")!;
    await h("cf_guardar", "adm", { id: cr.id, lineas: [{ id: amp.id, contado: 4 }] });
    const add = await h("cf_guardar", "adm", { id: cr.id, agregar: { producto_id: "p2" } });
    assert.equal(add.ok, true);
    const lin = add.linea as Row;
    assert.equal(lin.sku, "ML-002");
    assert.equal(lin.esperado, 0);
    assert.equal(lin.agregado, true);
    assert.equal(lin.estado, "pendiente");
    const bad = await h("cf_guardar", "adm", { id: cr.id, agregar: { sku: "NO-EXISTE" } });
    assert.match(String(bad.error), /no está en Productos/i);
    const g = await h("cf_get", "adm", { id: cr.id });
    const L = g.lineas as Row[];
    assert.equal(L.find((l) => l.sku === "ML-001")!.contado, 4);
    const neu = L.find((l) => l.sku === "ML-002")!;
    assert.equal(neu.esperado, 0);
    assert.equal(neu.agregado, true);

    const otraVez = await h("cf_guardar", "adm", { id: cr.id, agregar: { producto_id: "p2" } });
    assert.equal(otraVez.ok, true);
    assert.equal(otraVez.ya, true);
    assert.equal((otraVez.linea as Row).id, neu.id);
    assert.equal(otraVez.agregada, neu.id);
    const L2 = ((await h("cf_get", "adm", { id: cr.id })).lineas as Row[]).filter((l) => l.sku === "ML-002");
    assert.equal(L2.length, 1, "un producto no puede aparecer dos veces en el mismo conteo");
  });

  it("el front abre Agregar producto, busca en el catálogo y suma la fila al instante sin recargar ni borrar cantidades", () => {
    const js = readFileSync(new URL("../../../mc-conteo.js", import.meta.url), "utf8");
    assert.match(js, /function aplicarProductoAgregado/);
    assert.match(js, /function pintarHitsAgregar/);
    assert.match(js, /id="mccf-agregar"/);
    assert.match(js, /id="mccf-scan"/);
    assert.doesNotMatch(js, /Busca o escanea arriba y, si no está en la lista/);
    const start = js.indexOf('var ag = main.querySelector("#mccf-agregar")');
    assert.ok(start >= 0);
    const block = js.slice(start, js.indexOf("var term = main.querySelector", start));
    assert.match(block, /pintarHitsAgregar/);
    assert.match(block, /aplicarProductoAgregado/);
    assert.match(block, /cf_guardar/);
    assert.match(block, /agregar: \{ producto_id: pid \}/);
    assert.match(block, /C\.addBusy/);
    assert.match(block, /irALineaExistente/);
    assert.match(block, /btns\[i\]\.disabled = true/);
    assert.match(js, /function irALineaExistente/);
    assert.match(js, /scrollIntoView/);
    assert.match(js, /cc-ya/);
    assert.match(block, /_scanAbrir/);
    assert.match(js, /MCBuscar/);
    assert.match(js, /En el catálogo — Agregar al conteo/);
    assert.match(js, /C\.prodsAt/);
    assert.doesNotMatch(js, /p\.tipo !== "servicio" && p\.activo !== false/);
    assert.doesNotMatch(block, /\bgo\s*\(/);
    assert.doesNotMatch(block, /C\.dirty\s*=\s*\{\}/);
    assert.doesNotMatch(block, /prompt\(/);
  });
});
