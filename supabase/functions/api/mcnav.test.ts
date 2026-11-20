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
  return g.MCNav as { grupos: () => { id: string; label: string; items: string[][]; soloMovil?: boolean; sections?: { title: string; items: string[][] }[] }[]; crearItems: () => unknown[][]; _pronto: Record<string, string[]> };
}
const TODO = Object.fromEntries(["tickets", "cotizaciones_cliente", "clientes", "productos", "inventario", "conteos", "transferencias", "compras", "proveedores", "caja", "cabina", "usuarios", "permisos", "gift_cards", "paquetes", "bitacora", "comisiones", "rol_pagos", "asistencia"].map((m) => [m, "todos"]));

describe("menú MineCore (mc-nav.js)", () => {
  it("admin: grupos en el orden de MineCore, sin lo que Emilia sacó", () => {
    const nav = cargar("admin", TODO);
    const g = nav.grupos().filter((x) => !x.soloMovil);
    assert.deepEqual([...g.map((x) => x.label.replace(/^\S+ /, "")).slice(0, 7)], ["Ventas", "Spa", "Protocolos", "Inventario", "Compras", "Finanzas", "Admin"]);
    assert.ok(!g.some((x) => x.id === "reportes" || /Reportes/.test(x.label)));
    // Consignación vive dentro de Compras (TK26).
    assert.ok(g.find((x) => x.label.includes("Compras"))!.items.some((i) => i[2] === "#/m/compras/consignacion"));
    const textos = g.flatMap((x) => x.items.map((i) => i[1])).join("|");
    for (const no of ["Rutas", "Ruta", "liquidación", "Proyectos", "Alquiler", "WhatsApp", "Bots", "importaciones", "Impresión", "Manufactura"]) assert.ok(!textos.includes(no), no);
    assert.deepEqual([...g[0].items.map((i) => i[1])], ["🎫 Tickets", "📄 Facturas borrador", "📝 Cotizaciones", "👩 Registro de clientas"]);
    // Una sola Agenda (en Spa).
    assert.equal(g.flatMap((x) => x.items).filter((i) => i[2] === "#/m/agenda").length <= 1, true);
  });
  it("admin Inventario: Productos, Conteo, Transferencias, Ajustes y Costo por facial; sin stock viejo ni códigos sueltos", () => {
    const nav = cargar("admin", TODO);
    const inv = nav.grupos().find((x) => x.id === "inventario")!.items.map((i) => i[2]);
    assert.deepEqual([...inv], ["#/m/productos", "#/m/conteos", "#/m/transferencias", "#/m/ajustes", "#/m/aperturas/costo"]);
  });
  it("«+»: los cuatro de Emilia, con emoji", () => {
    const nav = cargar("admin", TODO);
    assert.deepEqual([...nav.crearItems().map((x) => x[1])], ["🎫 Nuevo ticket", "📝 Nueva cotización", "🧾 Nueva orden de compra", "💵 Ingreso / gasto de caja chica", "📦 Abrir producto"]);
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
    assert.deepEqual([...rec.crearItems().map((x) => x[1])], ["🎫 Nuevo ticket", "📝 Nueva cotización", "💵 Ingreso / gasto de caja chica", "📦 Abrir producto"]);
  });

  it("personal: sin Bodega ni Reportes ni Protocolos; Compras solo Recepciones; Inventario solo Productos y Conteo físico; Recepción solo recepcionista", () => {
    const staffAcc = { ...TODO, clientes: "todos", recepciones: "todos", agenda: "todos" };
    const cos = cargar("cosmetologa", staffAcc);
    const ids = cos.grupos().filter((x) => !x.soloMovil).map((x) => x.id);
    assert.ok(!ids.includes("protocolos"), "sin Protocolos");
    assert.ok(!ids.includes("reportes"), "sin Reportes");
    assert.ok(!ids.includes("bodega"), "sin Bodega");
    assert.ok(ids.includes("spa") && ids.includes("inventario") && ids.includes("compras") && ids.includes("personal"));
    const compras = cos.grupos().find((x) => x.id === "compras")!.items.map((i) => i[2]);
    assert.deepEqual([...compras], ["#/m/recepciones"]);
    const inv = cos.grupos().find((x) => x.id === "inventario")!.items.map((i) => i[2]);
    assert.deepEqual([...inv], ["#/m/productos", "#/m/conteos"]);
    assert.ok(!inv.includes("#/m/inventario/venta") && !inv.includes("#/m/inventario/cabina"));
    assert.ok(!inv.includes("#/m/barras") && !inv.includes("#/m/transferencias") && !inv.includes("#/m/ajustes"));
    assert.ok(!inv.includes("#/m/aperturas/costo"));
    const invTxt = cos.grupos().find((x) => x.id === "inventario")!.items.map((i) => i[1]).join("|");
    assert.match(invTxt, /Conteo físico/);
    const spa = cos.grupos().find((x) => x.id === "spa")!.items;
    const spaHash = spa.map((i) => i[2]);
    assert.ok(spaHash.includes("#/m/gift/cards") && spaHash.includes("#/m/gift/paquetes") && spaHash.includes("#/m/bitacora"));
    assert.ok(!spaHash.includes("#/s/recepcion") && !spaHash.includes("#/s/seguimiento"));
    const rec = cargar("recepcion", { ...staffAcc, tickets: "todos" });
    const recSpa = rec.grupos().find((x) => x.id === "spa")!.items.map((i) => i[2]);
    assert.ok(recSpa.includes("#/s/recepcion") && recSpa.includes("#/s/seguimiento"));
  });

  it("TK168: sin sección Reportes ni ítems SRI/Cobranza/EDC/Banco; Caja chica, Pagos recibidos y Admin siguen", () => {
    const rutasNo = ["#/m/inicio", "#/m/reportes", "#/s/kpis", "#/m/mc/pronto/rep_ventas", "#/m/mc/pronto/rep_stock", "#/m/mc/pronto/rep_compras", "#/m/mc/pronto/auditoria", "#/m/mc/pronto/sri", "#/m/mc/pronto/cobranza", "#/m/mc/pronto/edc", "#/m/mc/pronto/banco"];
    const textosNo = ["Consumos y márgenes", "Niveles de stock", "Registro de auditoría", "Facturas SRI y retenciones", "Cobranza", "Estado de cuenta"];
    for (const rol of ["admin", "cosmetologa", "recepcion"]) {
      const nav = cargar(rol, TODO);
      const g = nav.grupos();
      assert.ok(!g.some((x) => x.id === "reportes" || /Reportes/.test(x.label)), rol + " grupo reportes");
      const items = g.flatMap((x) => x.items);
      const titulos = g.flatMap((x) => (x.sections || []).map((s) => s.title)).join("|");
      assert.ok(!/Reportes/.test(titulos), rol + " sección móvil Reportes");
      const rutas = items.map((i) => i[2]);
      const textos = items.map((i) => i[1]).join("|");
      for (const r of rutasNo) assert.ok(!rutas.includes(r), rol + " " + r);
      for (const t of textosNo) assert.ok(!textos.includes(t), rol + " " + t);
    }
    const admin = cargar("admin", TODO);
    const labels = admin.grupos().filter((x) => !x.soloMovil).map((x) => x.label.replace(/^\S+ /, ""));
    assert.ok(labels.includes("Protocolos") && labels.includes("Finanzas") && labels.includes("Ventas") && labels.includes("Admin"));
    const fin = admin.grupos().find((x) => x.id === "finanzas")!.items.map((i) => i[2]);
    assert.deepEqual([...fin], ["#/m/caja", "#/m/caja/pagos"]);
    const admG = admin.grupos().find((x) => x.id === "admin")!;
    assert.ok(admG.items.some((i) => i[2] === "#/m/usuarios") && admG.items.some((i) => i[2] === "#/m/mc/upermisos"));
    assert.ok(admin._pronto.rep_ventas && admin._pronto.rep_stock && admin._pronto.rep_compras && admin._pronto.auditoria);
    assert.ok(admin._pronto.sri && admin._pronto.cobranza && admin._pronto.edc && admin._pronto.banco);
  });
});
