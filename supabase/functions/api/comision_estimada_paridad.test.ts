// Comisión estimada del ticket (getCatalogo → comVta → updatePreview) y la pantalla
// Comisiones (compraParaComision) tienen que dar el mismo monto de productos.
// ML-005: comi_producto_30 quedó en 3.522; la regla viva es 30% × (82.61 − 76.54) = 1.82.
// Una línea excluida no suma en ninguna de las dos. No toca catálogo ni datos.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { comisionProductos, compraParaComision, round2, type Row } from "./domain.ts";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";

type Muestra = {
  sku: string;
  nombre: string;
  subtotal: number;
  total: number;
  precio_compra: number;
  compra_comision: number | "" | null;
  comi_producto_30: number;
  qty: number;
  excluido: boolean;
};

const MUESTRAS: Muestra[] = [
  {
    sku: "SUNSU-ML-005", nombre: "Whitening A Serum - Dr.esthe",
    subtotal: 82.61, total: 95, precio_compra: 70.87, compra_comision: 76.54,
    comi_producto_30: 3.522, qty: 1, excluido: false,
  },
  {
    // Sin compra_comision: la base es precio_compra. La columna vieja no se usa.
    sku: "SUNSU-AS-004", nombre: "Muestra AS-004",
    subtotal: 16.52, total: 19, precio_compra: 10, compra_comision: "",
    comi_producto_30: 9.99, qty: 1, excluido: false,
  },
  {
    // compra_comision manda sobre precio_compra. qty 2 para ver el total de la línea.
    sku: "SUNSU-AS-009", nombre: "Muestra AS-009",
    subtotal: 30, total: 34.5, precio_compra: 10, compra_comision: 18,
    comi_producto_30: 6, qty: 2, excluido: false,
  },
  {
    // Excluida: si entrara, serían $9 × 3. No entra ni al ticket ni a Comisiones.
    sku: "SUNSU-VK-001", nombre: "Línea excluida",
    subtotal: 40, total: 46, precio_compra: 4, compra_comision: 10,
    comi_producto_30: 20, qty: 3, excluido: true,
  },
];

const PREVIEW_LOOP = "PROVS.forEach(pv=>pv.prods.forEach(p=>{const q=T.productos[p.sku]||0;if(q>0){estProd+=p.p*q;comP+=(p._com||0)*q;}}));";

function comisionEstimada(src: string, provs: { prods: { sku: string; p: number; _com: number }[] }[], productos: Record<string, number>): number {
  assert.ok(src.includes(PREVIEW_LOOP), "updatePreview ya no suma p._com × cantidad");
  const fn = new Function("PROVS", "T", `let estProd=0, comP=0;\n${PREVIEW_LOOP}\nreturn comP;`) as (provs: unknown, t: { productos: Record<string, number> }) => number;
  return fn(provs, { productos });
}

function comVtaDe(src: string, item: { comVta?: number; com?: number }): number {
  const fn = src.match(/function _comVta\(item\)\{[^\n]*\}/);
  assert.ok(fn, "falta _comVta");
  const run = new Function("item", `${fn[0]}\nreturn _comVta(item);`) as (item: { comVta?: number; com?: number }) => number;
  return run(item);
}

describe("Comisión estimada del ticket = Comisiones (compraParaComision)", () => {
  it("getCatalogo comVta y el preview igualan a Comisiones, con ML-005 viejo y una línea excluida", async () => {
    const db = new MemoryDb({
      sesiones: [{ token: "and", uid: "u-and", rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", exp: "2099-01-01T00:00:00.000Z" }],
      usuarios: [{ id: "u-and", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa" }],
      catalogo: MUESTRAS.map((m) => ({
        sku: m.sku, producto_servicio: m.nombre, tipo: "PRODUCTO",
        subtotal: m.subtotal, total_con_iva: m.total, precio_compra: m.precio_compra,
        compra_comision: m.compra_comision, comi_producto_30: m.comi_producto_30, activo: true,
      })),
      // La compra real de inventario no entra a la comisión.
      inventario_base: [{ sku: "SUNSU-ML-005", compra: 1, stock_inicial: 0 }],
      erp_productos: [],
    });
    const ctx = { db, now: new Date("2026-11-27T19:20:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}), token: "and" };
    const cat = await handle("getCatalogo", { token: "and" }, ctx as never) as Row[];
    assert.ok(Array.isArray(cat), JSON.stringify(cat));

    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const porSku = new Map(cat.map((it) => [String(it.sku), it]));
    const prods = MUESTRAS.map((m) => {
      const it = porSku.get(m.sku);
      assert.ok(it, m.sku);
      const com = comVtaDe(src, it);
      assert.equal(com, it.comVta, m.sku);
      assert.notEqual(com, m.comi_producto_30, `${m.sku} no puede usar comi_producto_30`);
      return { sku: m.sku, p: Number(it.total) || 0, _com: com };
    });
    const enTicket: Record<string, number> = {};
    for (const m of MUESTRAS) if (!m.excluido) enTicket[m.sku] = m.qty;
    const preview = round2(comisionEstimada(src, [{ prods }], enTicket));

    const items = MUESTRAS.map((m) => ({
      venta: m.subtotal,
      compra: compraParaComision({ compra_comision: m.compra_comision, precio_compra: m.precio_compra }),
      qty: m.qty,
      excluido: m.excluido,
      sku: m.sku,
    }));
    const pantalla = comisionProductos(items);
    const sinExcluir = comisionProductos(items.filter((it) => !it.excluido));
    assert.equal(pantalla, sinExcluir, "la línea excluida no puede cambiar el total de Comisiones");
    assert.equal(preview, pantalla, "Comisión estimada · Productos tiene que igualar a Comisiones");

    const ml = porSku.get("SUNSU-ML-005")!;
    assert.equal(ml.comVta, 1.82);
    assert.equal(ml.com, undefined, "la cosmetóloga no recibe el costo «com»");
    assert.equal(comisionProductos([{
      venta: 82.61,
      compra: compraParaComision({ compra_comision: 76.54, precio_compra: 70.87 }),
      qty: 1, excluido: false, sku: "SUNSU-ML-005",
    }]), 1.82);
    assert.equal(round2(comisionEstimada(src, [{ prods: prods.filter((p) => p.sku === "SUNSU-ML-005") }], { "SUNSU-ML-005": 1 })), 1.82);

    const excluida = items.find((it) => it.sku === "SUNSU-VK-001")!;
    assert.equal(comisionProductos([excluida]), 0);
    assert.ok(comisionProductos([{ ...excluida, excluido: false }]) > 0, "sin el flag, esa línea sí pagaría comisión");
    assert.equal(compraParaComision({ compra_comision: 76.54, precio_compra: 70.87 }), 76.54);
    assert.equal(compraParaComision({ compra_comision: "", precio_compra: 10 }), 10);
  });
});
