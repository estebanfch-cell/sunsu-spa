import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import vm from "node:vm";

function cargar(rol: string, accesos: Record<string, string>) {
  const g: Record<string, unknown> = {};
  g.window = g;
  g.state = { admin: rol === "admin", verCostos: rol === "admin", user: { role: rol } };
  g.acceso = (m: string) => accesos[m] || "no";
  g.esc = (v: unknown) => String(v ?? "");
  vm.runInNewContext(fs.readFileSync(new URL("../../../mc-nav.js", import.meta.url), "utf8"), g);
  return g.MCNav as { grupos: () => { id: string; label: string; items: string[][]; soloMovil?: boolean }[]; crearItems: () => unknown[][]; _pronto: Record<string, string[]> };
}
const TODO = Object.fromEntries(["tickets", "cotizaciones_cliente", "clientes", "productos", "inventario", "conteos", "transferencias", "compras", "proveedores", "caja", "cabina", "usuarios", "permisos", "gift_cards", "paquetes", "bitacora", "comisiones", "rol_pagos", "asistencia"].map((m) => [m, "todos"]));

describe("menú MineCore (mc-nav.js)", () => {
  it("admin: grupos en el orden de MineCore, sin lo que Emilia sacó", () => {
    const nav = cargar("admin", TODO);
    const g = nav.grupos().filter((x) => !x.soloMovil);
    assert.deepEqual([...g.map((x) => x.label.replace(/^\S+ /, "")).slice(0, 8)], ["Ventas", "Protocolos", "Inventario", "Compras", "Reportes", "Consignación", "Finanzas", "Admin"]);
    const textos = g.flatMap((x) => x.items.map((i) => i[1])).join("|");
    for (const no of ["Rutas", "Ruta", "liquidación", "Proyectos", "Alquiler", "WhatsApp", "Bots", "importaciones", "Impresión", "Manufactura"]) assert.ok(!textos.includes(no), no);
    assert.deepEqual([...g[0].items.map((i) => i[1])], ["🎫 Tickets", "📝 Cotizaciones", "👩 Registro de clientas"]);
  });
  it("«+»: los nueve de Emilia, en orden, sin rutas", () => {
    const nav = cargar("admin", TODO);
    assert.deepEqual([...nav.crearItems().map((x) => x[1])], ["Nuevo ticket", "Nueva cotización", "Nueva orden de compra", "Nuevo proveedor", "Ingreso / gasto de caja chica", "Transferencia", "Ajuste", "Nuevo producto", "Nuevo protocolo"]);
    assert.equal(nav.crearItems()[0][2], "#/doc/ov");
  });
  it("cada ruta «Próximamente» tiene su texto; recepción no ve compras ni admin", () => {
    const nav = cargar("admin", TODO);
    for (const g of nav.grupos()) for (const it of g.items) {
      const m = String(it[2]).match(/^#\/m\/mc\/pronto\/(\w+)/);
      if (m) assert.ok(nav._pronto[m[1]], m[1]);
    }
    const rec = cargar("recepcion", { tickets: "propio", cotizaciones_cliente: "todos", clientes: "todos", caja: "todos", inventario: "propio" });
    const ids = rec.grupos().filter((x) => !x.soloMovil).map((x) => x.id);
    assert.ok(!ids.includes("compras") && !ids.includes("admin"));
    assert.deepEqual([...rec.crearItems().map((x) => x[1])], ["Nuevo ticket", "Nueva cotización", "Ingreso / gasto de caja chica"]);
  });
});
