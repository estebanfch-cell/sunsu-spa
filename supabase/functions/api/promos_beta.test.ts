import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { descLineas, handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./productos_api.ts";
import "./tickets_beta_api.ts";
import "./promos_beta_api.ts";
import { agruparHoja, aplicarPromos, promoDeHoja, reglaDe, type LineaP, type PromoB, type Regla } from "./promos_beta_api.ts";
import type { Row } from "./domain.ts";

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
    { sku: "SUNSU-ML-001", producto_servicio: "PDRN Salmon", tipo: "PRODUCTO", total_con_iva: 110, subtotal: 95.65, activo: true },
    { sku: "SUNSU-ML-013", producto_servicio: "Mascarilla", tipo: "PRODUCTO", total_con_iva: 20, subtotal: 17.39, activo: true },
    { sku: "SUNSU-53", producto_servicio: "x3 Facial de Ginseng", tipo: "PAQUETE", total_con_iva: 243.22, subtotal: 211.5, activo: true },
  ]);
  db.tables.set("erp_productos", [
    { id: "p1", sku: "ML-001", nombre: "PDRN Salmon", marca: "Dr.esthe", clase: "producto", uso: "venta", activo: true },
    { id: "p2", sku: "ML-013", nombre: "Mascarilla", marca: "Medi-Peel", clase: "producto", uso: "venta", activo: true },
  ]);
  db.tables.set("promos", [
    { sheet_row: 5, nombre: "Black Friday 2026 Ginsen x 3 20%", tipo: "%", valor: 10, valor2: 0, codigos: "SUNSU-53", desde: "2026-11-17T08:00:00Z", hasta: "2026-12-15T08:00:00Z", activa: "SI" },
    { sheet_row: 7, nombre: "Si lleva 2 paga 100 x c/u ML-001", tipo: "$", valor: 10, valor2: 0, codigos: "SUNSU-ML-001", desde: "2026-11-17T08:00:00Z", hasta: "2026-12-15T08:00:00Z", activa: "SI" },
    { sheet_row: 2, nombre: "Vieja", tipo: "$", valor: 5, codigos: "SUNSU-47", desde: "2026-05-01T00:00:00Z", hasta: "2026-09-30T00:00:00Z", activa: "SI" },
  ]);
  for (const t of ["erp_bodegas", "erp_stock", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "beta_promociones", "tickets", "beta_tickets", "beta_ticket_lineas"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-18T03:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}
const R = (x: Row) => reglaDe(x) as Regla;
const P = (nombre: string, reglas: Regla[]): PromoB => ({ id: nombre, nombre, desde: "2026-11-01", hasta: "2026-12-31", activa: true, reglas, origen: "beta" });

describe("🏷️ promociones beta", () => {
  it("reglas: %, $ c/u con mínimo, precio especial, N×M, combo; una línea no apila dos reglas", () => {
    const L: LineaP[] = [
      { k: "a", sku: "ML-001", tipo: "producto", cantidad: 2, bruto: 220 },
      { k: "b", sku: "53", tipo: "paquete", cantidad: 1, bruto: 243.22 },
      { k: "c", sku: "ML-013", tipo: "producto", cantidad: 3, bruto: 60 },
    ];
    const bf = P("Black Friday", [
      R({ tipo: "pct", alcance: "codigos", codigos: ["SUNSU-53"], valor: 20 }),
      R({ tipo: "precio", alcance: "codigos", codigos: ["SUNSU-ML-001"], valor: 100, min: 2 }),
      R({ tipo: "nxm", alcance: "codigos", codigos: ["ML-013"], valor: 3, valor2: 2 }),
    ]);
    const r = aplicarPromos([bf], L);
    assert.deepEqual(r.lineas.map((l) => l.monto), [20, 48.64, 20]);
    assert.equal(r.descuento, 88.64); assert.equal(r.total, 434.58);
    assert.match(r.lineas[0].etiqueta, /^Black Friday · /);
    // Con 1 sola ampolla, el «lleva 2» no despierta.
    const r1 = aplicarPromos([bf], [{ k: "a", sku: "ML-001", cantidad: 1, bruto: 110 }]);
    assert.equal(r1.descuento, 0); assert.match(String(r1.noAplican[0].motivo), /pide 2/);
    // Segunda promo sobre la misma línea: no se apila.
    const otra = P("Otra", [R({ tipo: "pct", alcance: "todo", valor: 50 })]);
    const r2 = aplicarPromos([bf, otra], L);
    assert.equal(r2.descuento, 88.64);
    // $ c/u y combo.
    const c1 = aplicarPromos([P("c", [R({ tipo: "monto", alcance: "codigos", codigos: ["ML-001"], valor: 10, por: "unidad" })])], L);
    assert.equal(c1.descuento, 20);
    const combo = aplicarPromos([P("combo", [R({ tipo: "precio", alcance: "combo", codigos: ["ML-001", "ML-013"], valor: 100 })])], L);
    assert.equal(combo.descuento, 60); // (110+20−100)=30 por combo × 2 combos
    assert.equal(descLineas([{ sku: "53", modo: "$", valor: 48.64, bruto: 243.22, monto: 48.64, promo: "Black Friday · −20%" }])[0].promo, "Black Friday · −20%");
    assert.equal(typeof reglaDe({ tipo: "nxm", alcance: "codigos", codigos: ["x"], valor: 2, valor2: 2 }), "string");
  });
  it("la hoja se convierte con su misma regla y se lee sin escribirla", async () => {
    const p = promoDeHoja({ sheet_row: 7, nombre: "x", tipo: "$", valor: 10, codigos: "SUNSU-ML-001", desde: "2026-11-17T08:00:00Z", hasta: "2026-12-15T08:00:00Z", activa: "SI" })!;
    assert.deepEqual(p.reglas[0], { tipo: "monto", alcance: "codigos", codigos: ["ML-001"], valor: 10, min: 1, por: "una" });
    const { db, h } = semilla();
    const hoja = JSON.stringify(db.tables.get("promos"));
    const l = await h("promo_lista", "cos");
    assert.deepEqual((l.vigentes as Row[]).map((x) => x.id), ["s:5", "s:7"]);
    const c = await h("promo_calcular", "cos", { lineas: [{ k: "1", sku: "SUNSU-53", cantidad: 1, bruto: 243.22 }, { k: "2", sku: "SUNSU-ML-001", cantidad: 2, bruto: 220 }], ids: ["s:5", "s:7"] });
    assert.equal((c.resultado as Row).descuento, 34.32);
    assert.deepEqual((c.promos as Row[]).map((x) => x.monto), [24.32, 10]);
    assert.equal((await h("promo_importar", "cos")).error, "Solo administradores");
    const imp = await h("promo_importar", "adm");
    assert.equal(imp.importadas, 2);
    assert.equal((await h("promo_importar", "adm")).importadas, 0);
    const l2 = await h("promo_lista", "adm", { todas: true });
    assert.equal((l2.vigentes as Row[]).length, 2); assert.ok((l2.vigentes as Row[]).every((x) => x.origen === "sheet" && !String(x.id).startsWith("s:")));
    assert.equal(JSON.stringify(db.tables.get("promos")), hoja);
  });
  it("admin crea Black Friday con varias reglas, marca; la cosmetóloga no puede crear; desactivar la saca del ticket", async () => {
    const { h } = semilla();
    assert.equal((await h("promo_guardar", "cos", { nombre: "x" })).error, "Solo administradores");
    assert.match(String((await h("promo_guardar", "adm", { nombre: "BF", desde: "2026-11-17", hasta: "2026-11-30", reglas: [] })).error), /al menos una regla/);
    const g = await h("promo_guardar", "adm", { nombre: "Black Friday", desde: "2026-11-17", hasta: "2026-11-30", reglas: [
      { tipo: "pct", alcance: "marca", marca: "dr.esthe", valor: 15 }, { tipo: "monto", alcance: "todo", valor: 5, min: 1 },
    ] });
    assert.equal(g.ok, true);
    const c = await h("promo_calcular", "cos", { lineas: [{ k: "1", sku: "ML-001", cantidad: 1, bruto: 110 }, { k: "2", sku: "ML-013", cantidad: 1, bruto: 20 }], ids: [g.id] });
    const res = c.resultado as Row;
    assert.deepEqual((res.lineas as Row[]).map((x) => x.monto), [16.5, 5]);
    assert.equal(res.total, 108.5);
    const au = await h("promo_calcular", "cos", { auto: true, lineas: [{ k: "1", sku: "ML-001", cantidad: 1, bruto: 110 }, { k: "2", sku: "ML-013", cantidad: 1, bruto: 20 }] });
    assert.ok((au.aplicadas as string[]).includes(String(g.id)));
    const au2 = await h("promo_calcular", "cos", { auto: true, excluir: [g.id], lineas: [{ k: "1", sku: "ML-001", cantidad: 1, bruto: 110 }] });
    assert.ok(!(au2.aplicadas as string[]).includes(String(g.id)));
    await h("promo_activar", "adm", { id: g.id, activa: false });
    const c2 = await h("promo_calcular", "cos", { lineas: [{ k: "1", sku: "ML-001", cantidad: 1, bruto: 110 }], ids: [g.id] });
    assert.equal((c2.resultado as Row).descuento, 0);
  });
  it("Black Friday 18/11: ML-001/ML-013 −$10 c/u con 2 unidades combinadas; Ginseng x3/x6 10% adicional; la hoja agrupa por GRUPO", async () => {
    const bf = P("Black Friday", [
      R({ tipo: "pct", alcance: "codigos", codigos: ["SUNSU-53"], valor: 10, etiqueta: "Ginseng x3 · 10% adicional" }),
      R({ tipo: "pct", alcance: "codigos", codigos: ["SUNSU-54"], valor: 10, etiqueta: "Ginseng x6 · 10% adicional" }),
      R({ tipo: "monto", alcance: "codigos", codigos: ["SUNSU-ML-001", "SUNSU-ML-013"], valor: 10, min: 2, por: "unidad" }),
    ]);
    const d = (L: LineaP[]) => aplicarPromos([bf], L).descuento;
    assert.equal(d([{ k: "a", sku: "ML-001", cantidad: 1, bruto: 110 }]), 0);
    assert.equal(d([{ k: "a", sku: "ML-001", cantidad: 1, bruto: 110 }, { k: "b", sku: "ML-013", cantidad: 1, bruto: 110 }]), 20);
    assert.equal(d([{ k: "a", sku: "ML-001", cantidad: 2, bruto: 220 }]), 20);
    assert.equal(d([{ k: "a", sku: "ML-013", cantidad: 2, bruto: 220 }]), 20);
    assert.equal(d([{ k: "a", sku: "53", cantidad: 1, bruto: 256.5 }]), 25.65);
    assert.equal(d([{ k: "a", sku: "54", cantidad: 1, bruto: 484.5 }]), 48.45);
    const r = aplicarPromos([bf], [{ k: "a", sku: "53", cantidad: 1, bruto: 256.5 }, { k: "b", sku: "ML-001", cantidad: 1, bruto: 110 }, { k: "c", sku: "ML-013", cantidad: 1, bruto: 110 }]);
    assert.deepEqual(r.lineas.map((l) => l.monto), [25.65, 10, 10]);
    assert.equal(r.lineas[0].etiqueta, "Black Friday · Ginseng x3 · 10% adicional");
    // Hoja con columnas K-M (GRUPO/MIN/POR): las filas 5-8 son UNA promo; la 8 (NO) no aporta regla.
    const o = (g: string, mi: string, po: string) => ({ GRUPO: g, MIN: mi, POR: po });
    const base = { desde: "2026-11-17T08:00:00Z", hasta: "2026-12-15T08:00:00Z", valor2: 0 };
    const filas = [
      { sheet_row: 5, nombre: "Ginseng x3 · 10% adicional", tipo: "%", valor: 10, codigos: "SUNSU-53", activa: "SI", orig: o("Black Friday", "", ""), ...base },
      { sheet_row: 6, nombre: "Ginseng x6 · 10% adicional", tipo: "%", valor: 10, codigos: "SUNSU-54", activa: "SI", orig: o("Black Friday", "", ""), ...base },
      { sheet_row: 7, nombre: "ML-001 + ML-013 · lleva 2: −$10 c/u", tipo: "$", valor: 10, codigos: "SUNSU-ML-001,SUNSU-ML-013", activa: "SI", orig: o("Black Friday", "2", "UNIDAD"), ...base },
      { sheet_row: 8, nombre: "vieja ML-013", tipo: "$", valor: 10, codigos: "SUNSU-ML-013", activa: "NO", orig: o("Black Friday", "", ""), ...base },
      { sheet_row: 2, nombre: "Sin grupo", tipo: "%", valor: 5, codigos: "SUNSU-47", activa: "SI", ...base },
    ];
    const g = agruparHoja(filas.map((x) => promoDeHoja(x as Row)!));
    assert.equal(g.length, 2);
    const gb = g.find((x) => x.nombre === "Black Friday")!;
    assert.deepEqual(gb.sheet_filas, [5, 6, 7, 8]); assert.equal(gb.reglas.length, 3); assert.equal(gb.id, "s:g:black friday");
    assert.deepEqual(gb.reglas[2], { tipo: "monto", alcance: "codigos", codigos: ["ML-001", "ML-013"], valor: 10, min: 2, por: "unidad", etiqueta: "ML-001 + ML-013 · lleva 2: −$10 c/u" });
    assert.equal(aplicarPromos([gb], [{ k: "a", sku: "ML-001", cantidad: 1, bruto: 110 }, { k: "b", sku: "ML-013", cantidad: 1, bruto: 110 }]).descuento, 20);
    // Sin columnas nuevas: igual que antes ($ una vez, sin mínimo).
    assert.deepEqual(promoDeHoja(filas[4] as Row)!.reglas[0].min, 1);
    // Una promo beta que reclama las filas 5-8 (sheet_filas) las saca de «sin importar».
    const { db, h } = semilla();
    db.tables.set("promos", filas);
    assert.deepEqual(((await h("promo_lista", "cos")).vigentes as Row[]).map((x) => x.id).sort(), ["s:2", "s:g:black friday"]);
    db.tables.set("beta_promociones", [{ id: "bf1", nombre: "Black Friday", desde: "2026-11-17", hasta: "2026-12-15", activa: true, reglas: bf.reglas, origen: "sheet", sheet_row: 5, sheet_filas: [5, 6, 7, 8] }]);
    assert.deepEqual(((await h("promo_lista", "cos")).vigentes as Row[]).map((x) => x.id).sort(), ["bf1", "s:2"]);
    const au = await h("promo_calcular", "cos", { auto: true, lineas: [{ k: "1", sku: "SUNSU-ML-001", cantidad: 1, bruto: 110 }, { k: "2", sku: "SUNSU-ML-013", cantidad: 1, bruto: 110 }] });
    assert.deepEqual(au.aplicadas, ["bf1"]); assert.equal((au.resultado as Row).descuento, 20);
    const au1 = await h("promo_calcular", "cos", { auto: true, lineas: [{ k: "1", sku: "SUNSU-ML-001", cantidad: 1, bruto: 110 }] });
    assert.equal((au1.resultado as Row).descuento, 0);
    assert.equal((await h("promo_importar", "adm")).importadas, 1); // solo «Sin grupo»: Black Friday ya está en la beta
  });
});
