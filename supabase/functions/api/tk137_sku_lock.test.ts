// TK137: el siguiente SKU no puede sugerir un codigo_interno o alias ocupado
// (INV-132 de JN-009, INV-133 de VK-009). Crear un producto nunca pisa otro.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./productos_api.ts";
import { runErp } from "./erp.ts";
import { codigosDeFuentes, familiasDe, siguienteCodigo } from "./productos.ts";
import type { Row } from "./domain.ts";

const BOD = [
  { id: "11111111-1111-4111-8111-111111111111", codigo: "VENTA", nombre: "Venta", tipo: "venta" },
];

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
  ]);
  db.tables.set("erp_bodegas", BOD);
  db.tables.set("erp_productos", [
    { id: "jn009", sku: "JN-009", codigo_interno: "INV-132", nombre: "Black Tea Time Reverse Eye Cream 9ml - Pyunkanf Yul", clase: "producto", uso: "ambos", precio_venta: 20, activo: true, sku_proveedor: "JN-009" },
    { id: "vk009", sku: "VK-009", codigo_interno: "INV-133", nombre: "[ANUA] Niacinamide 10 TXA 4 Serum 30ml", clase: "producto", uso: "venta", precio_venta: 47, activo: true, sku_proveedor: "VK-009" },
    { id: "inv131", sku: "INV-131", nombre: "AC Serum - Dr.esthe", clase: "producto", uso: "ambos", activo: true },
  ]);
  db.tables.set("beta_sku_alias", [
    { alias: "INV-132", sku: "JN-009", origen: "tk127" },
    { alias: "INV-133", sku: "VK-009", origen: "tk127" },
  ]);
  db.tables.set("inventario_base", [{ sku: "INV-141", stock_inicial: 0 }]);
  for (const t of ["catalogo", "cabina_inventario", "erp_stock", "erp_movimientos", "app_modulos"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-19T19:35:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}), token: "adm" };
  const h = (a: string, p: Row = {}) => handle(a, { token: "adm", ...p }, c) as Promise<Row>;
  return { db, h, c };
}

describe("TK137 siguiente SKU y candado al crear", () => {
  it("codigosDeFuentes y siguienteCodigo saltan codigo_interno, alias e inventario_base", () => {
    const ocupados = codigosDeFuentes({
      productos: [
        { sku: "JN-009", codigo_interno: "INV-132", clase: "producto" },
        { sku: "INV-131" },
      ],
      alias: [{ alias: "INV-133" }],
      inventarioBase: [{ sku: "INV-141" }],
    });
    const inv = familiasDe(ocupados).find((f) => f.prefijo === "INV-")!;
    assert.equal(inv.siguiente, "INV-142");
    assert.equal(siguienteCodigo("INV-", ocupados.map((x) => x.codigo), 3), "INV-142");
  });

  it("mcprod_familias no sugiere INV-132 aunque el sku más alto sea INV-131", async () => {
    const { h } = semilla();
    const fam = await h("mcprod_familias");
    const inv = (fam.familias as Row[]).find((x) => x.prefijo === "INV-")!;
    assert.equal(inv.siguiente, "INV-142", JSON.stringify(inv));
  });

  it("crear un producto con INV-132 se rechaza y no muta JN-009", async () => {
    const { db, c } = semilla();
    const antes = JSON.stringify(db.tables.get("erp_productos")!.find((x) => x.id === "jn009"));
    const r = await runErp("prod_save", {
      sku: "INV-132", nombre: "Bioderma Sensibio H2O Eye", marca: "Bioderma",
      categoria: "Insumo cabina", uso: "cabina", clase: "producto", crear: true, _rol: "admin",
    }, db, "Emilia", c.now);
    assert.match(String(r.error), /INV-132/);
    assert.match(String(r.error), /JN-009/);
    assert.equal(r.status, 409);
    const jn = db.tables.get("erp_productos")!.find((x) => x.id === "jn009")!;
    assert.equal(JSON.stringify(jn), antes);
    assert.equal(jn.nombre, "Black Tea Time Reverse Eye Cream 9ml - Pyunkanf Yul");
    assert.equal(jn.sku, "JN-009");
    assert.equal(db.tables.get("erp_productos")!.some((x) => x.nombre === "Bioderma Sensibio H2O Eye"), false);
  });

  it("prod_save sin crear tampoco pisa un codigo_interno (el fallo de las 14:27)", async () => {
    const { db, c } = semilla();
    const r = await runErp("prod_save", {
      sku: "INV-133", nombre: "Manzanilla Romana - Aroms Natur", marca: "Aroms Natur",
      categoria: "Insumo cabina", uso: "cabina", clase: "producto", _rol: "admin",
    }, db, "Emilia", c.now);
    assert.match(String(r.error), /INV-133/);
    assert.match(String(r.error), /VK-009/);
    assert.equal(r.status, 409);
    const vk = db.tables.get("erp_productos")!.find((x) => x.id === "vk009")!;
    assert.equal(vk.sku, "VK-009");
    assert.equal(vk.nombre, "[ANUA] Niacinamide 10 TXA 4 Serum 30ml");
  });

  it("mcprod_nuevo de la familia INV- asigna INV-142, no INV-132", async () => {
    const { db, h } = semilla();
    const r = await h("mcprod_nuevo", { familia: "INV-", nombre: "Bioderma Sensibio H2O Eye", marca: "Bioderma", categoria: "Insumo cabina", uso: "cabina" });
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.sku, "INV-142");
    assert.equal(db.tables.get("erp_productos")!.find((x) => x.id === "jn009")!.nombre, "Black Tea Time Reverse Eye Cream 9ml - Pyunkanf Yul");
    assert.equal(db.tables.get("erp_productos")!.find((x) => x.sku === "INV-142")!.nombre, "Bioderma Sensibio H2O Eye");
  });

  it("el SQL restaura JN-009 y VK-009, crea INV-142 e INV-143, y deja candado", () => {
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0068_tk137_restaurar_jn009_sku_lock.sql", import.meta.url), "utf8");
    assert.match(sql, /_bak_20261119_tk137_erp_productos/);
    assert.match(sql, /JN-009/);
    assert.match(sql, /VK-009/);
    assert.match(sql, /INV-142/);
    assert.match(sql, /INV-143/);
    assert.match(sql, /Bioderma Sensibio H2O Eye/);
    assert.match(sql, /Manzanilla Romana/);
    assert.match(sql, /trg_erp_productos_codigo_libre/);
    assert.equal(/drop table/i.test(sql), false);
  });

  it("el cache de esta entrega es TK137", () => {
    const sw = readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
    const beta = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    assert.match(sw, /sunsu-2026-11-19-TK157/);
    assert.match(beta, /20261119tk157/);
    assert.doesNotMatch(sw, /sunsu-beta-2026-11-19-TK135/);
  });
});
