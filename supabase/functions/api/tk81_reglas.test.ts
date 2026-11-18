// TK81/TK81 (Emilia 18/11): reglas permanentes para que no vuelvan los flags rancios, la pill falsa de mejora
// ni los saldos de centavos. Ver docs en cada función.
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./productos_api.ts";
import "./tickets_beta_api.ts";
import "./migo_cuadre_api.ts";
import { saldoPendiente, type Row } from "./domain.ts";
import { compararFacturaYTickets, mismoServicioOtroSku, normalizarLineaFactura } from "./migo_lineas.ts";

const fe = fs.readFileSync(new URL("../../../mc-tickets.js", import.meta.url), "utf8");

describe("TK81 · mismo servicio con otro SKU: manda la factura", () => {
  const fac = [{ codigo: "SUNSU-31", producto: "PDRN SERUM", cantidad: 1, subtotal: 13.04, iva: 1.96, total: 15 }];
  it("Ampolla $15 en el ticket vs PDRN $15 en la factura → corregido, sin «Falta»", () => {
    const av = compararFacturaYTickets(fac, [{ id: 7, extras: "SUNSU-15 Ampolla Especial · PDRN" }], undefined, new Map([["15", { pvpConIva: 15 }]]));
    assert.deepEqual(av.map((a) => a.tipo), ["cambio_sku"]);
    assert.equal(av[0].desde, "15"); assert.equal(av[0].hacia, "31"); assert.equal(av[0].ticketId, 7);
  });
  it("otro precio u otra cantidad → sigue en rojo", () => {
    const f = normalizarLineaFactura(fac[0])!;
    assert.equal(mismoServicioOtroSku(f, { ...f, sku: "15", totalCon: 30, cantidad: 2 }), false);
    assert.equal(mismoServicioOtroSku(f, { ...f, sku: "15", totalCon: 20 }), false);
    const av = compararFacturaYTickets(fac, [{ id: 7, extras: "SUNSU-15 Ampolla Especial" }], undefined, new Map([["15", { pvpConIva: 20 }]]));
    assert.ok(av.some((a) => a.tipo === "falta"));
  });
  it("faciales y paquetes nunca se cambian por precio", () => {
    const f = normalizarLineaFactura({ codigo: "SUNSU-44", producto: "PAQUETE (3) FACIALES RESET 3x1", cantidad: 1, total: 256.5 })!;
    assert.equal(mismoServicioOtroSku(f, { ...f, sku: "45", nombre: "PAQUETE OTRO" }), false);
  });
  it("la compra de paquete (compra_pack_3) cuenta como línea del ticket", () => {
    const av = compararFacturaYTickets([{ codigo: "SUNSU-44", producto: "PAQUETE (3) FACIALES RESET 3x1", cantidad: 1, total: 256.5 }],
      [{ id: 1, facial_hecho: "SUNSU-40 Facial Reset 3x1", paquete: "SI, 1/3", compra_pack_3: "SUNSU-44 Paquete (3) Faciales Reset 3x1" }]);
    assert.deepEqual(av, []);
  });
});

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false }]);
  db.tables.set("catalogo", [
    { sku: "SUNSU-15", producto_servicio: "Ampolla Especial", tipo: "SERVICIO ADD-ON", total_con_iva: 14.996, subtotal: 13.04, activo: true },
    { sku: "SUNSU-31", producto_servicio: "PDRN SERUM", tipo: "SERVICIO ADD-ON", total_con_iva: 14.996, subtotal: 13.04, activo: true },
    { sku: "SUNSU-37", producto_servicio: "DEPILACIÓN CON HILO CEJAS Y BIGOTE", tipo: "SERVICIO ADD-ON", total_con_iva: 14.996, subtotal: 13.04, activo: true },
    { sku: "SUNSU-38", producto_servicio: "DEPILACIÓN CON HILO CEJAS", tipo: "SERVICIO ADD-ON", total_con_iva: 14.996, subtotal: 13.04, activo: true },
    { sku: "SUNSU-40", producto_servicio: "FACIAL RESET 3x1", tipo: "FACIAL", total_con_iva: 95, subtotal: 82.61, activo: true },
    { sku: "SUNSU-44", producto_servicio: "PAQUETE (3) FACIALES RESET 3x1", tipo: "PAQUETE", total_con_iva: 256.5, subtotal: 223.04, activo: true },
    { sku: "SUNSU-ML-002", producto_servicio: "Cream", tipo: "PRODUCTO", total_con_iva: 23, subtotal: 20, activo: true },
  ]);
  // Una factura para dos tickets de la misma clienta (como TK-SO-1878 + TK-SO-1883 en la 2946).
  db.tables.set("tickets", [
    { id: 1871, sheet_row: 1872, so_num: "TK-SO-1878", timestamp: "2026-11-15T15:00:00Z", nombre: "Catalina", apellido: "Moncayo", servicios_adicionales: "SUNSU-37 Depilación con Hilo Cejas y Bigote", estimado: 14.996, fac: true, fac_7: "2946.0", cob: true, comp: "Tarje:2545" },
    { id: 1876, sheet_row: 1877, so_num: "TK-SO-1883", timestamp: "2026-11-15T15:10:00Z", nombre: "Catalina", apellido: "Moncayo", facial_hecho: "SUNSU-40 Facial Reset 3x1", paquete: "SI, 1/3", compra_pack_3: "SUNSU-44 Paquete (3) Faciales Reset 3x1", servicios_adicionales: "SUNSU-15 Ampolla Especial · PDRN", estimado: 271.496, fac: true, fac_7: "2946.0", cob: true, comp: "Tarje:2545" },
  ]);
  db.tables.set("beta_migo_facturas_vivo", [{ factura: "001-001-000002946", fecha: "2026-11-15", cliente: "MONCAYO CATALINA", forma: "Tarjeta de crédito", total: 286.5, subtotal: 249.13, lineas: [
    { sku: "SUNSU-31", codigo: "SUNSU-31", producto: "PDRN SERUM", cantidad: 1, precio_unit: 13.04, subtotal: 13.04, iva: 1.96, total: 15 },
    { sku: "SUNSU-38", codigo: "SUNSU-38", producto: "DEPILACIÓN CON HILO CEJAS", cantidad: 1, precio_unit: 13.04, subtotal: 13.04, iva: 1.96, total: 15 },
    { sku: "SUNSU-44", codigo: "SUNSU-44", producto: "PAQUETE (3) FACIALES RESET 3x1", cantidad: 1, precio_unit: 223.04, subtotal: 223.04, iva: 33.46, total: 256.5 },
  ] }]);
  db.tables.set("beta_migo_importes", [{ id: 1, imported_at: "2026-11-18T12:00:00Z" }]);
  db.tables.set("beta_ticket_flags", [
    { id: "migo:1876:lineas", ticket_id: 1876, ticket_clave: "TK-SO-1883", motivo: "Revisa productos vs factura", detalle: "Falta en ticket: PDRN SERUM (SUNSU-31) $15.00 × 1 Falta en ticket: PAQUETE (3) FACIALES RESET 3x1 (SUNSU-44) $256.50 × 1", factura: "001-001-000002946", fuente: "migo", resuelto: false },
  ]);
  db.tables.set("erp_productos", [{ id: "p2", sku: "ML-002", nombre: "Cream", clase: "producto", uso: "venta", activo: true }]);
  for (const t of ["erp_bodegas", "erp_stock", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "promos", "beta_tickets", "beta_ticket_lineas", "solicitudes_cambio", "clientas_registro", "beta_stock_movimientos", "beta_migo_lineas", "beta_cuadre_link", "beta_ticket_cancelados", "beta_migo_borradores", "log_acciones"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-18T19:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, p: Row = {}) => handle(a, { token: "adm", ...p }, { ...c, token: "adm" }) as Promise<Row>;
  return { db, h };
}

describe("TK81 · flags siempre contra las líneas actuales", () => {
  it("Catalina (TK-SO-1883, factura compartida 2946): el paquete sí está y la Ampolla era el PDRN → se resuelve, se corrige y se registra una vez", async () => {
    const { db, h } = semilla();
    const r = await h("migo_cuadre_hora");
    assert.equal(r.ok, true, JSON.stringify(r));
    const fl = db.tables.get("beta_ticket_flags")!;
    assert.equal(fl.find((f) => f.id === "migo:1876:lineas")!.resuelto, true);
    assert.equal(fl.filter((f) => !f.resuelto).length, 0, JSON.stringify(fl.filter((f) => !f.resuelto)));
    const cambios = fl.filter((f) => /:sku:/.test(s(f.id))).map((f) => f.id).sort();
    assert.deepEqual(cambios, ["migo:1871:sku:37>38", "migo:1876:sku:15>31"]);
    const logs = () => db.tables.get("log_acciones")!.filter((x) => x.accion === "LÍNEA CORREGIDA POR FACTURA").length;
    assert.equal(logs(), 2);
    await h("migo_cuadre_hora");
    assert.equal(logs(), 2, "no se duplica en la siguiente corrida");
    // El detalle muestra el SKU de la factura.
    const g = await h("tk_get", { clave: "TK-SO-1883" });
    const skus = (g.lineas as Row[]).map((l) => String(l.sku));
    assert.ok(skus.includes("31") && !skus.includes("15"), skus.join(","));
    assert.ok(skus.includes("44"));
  });
  it("al guardar líneas en el ticket, los flags se recalculan en el acto (sin esperar al cuadre de la hora)", async () => {
    const { db, h } = semilla();
    // factura con un producto que el ticket no tiene → rojo
    db.tables.get("beta_migo_facturas_vivo")![0].lineas.push({ sku: "SUNSU-ML-002", codigo: "SUNSU-ML-002", producto: "Cream", cantidad: 1, precio_unit: 20, subtotal: 20, iva: 3, total: 23 });
    await h("migo_cuadre_hora");
    const abierto = () => db.tables.get("beta_ticket_flags")!.find((f) => f.id === "migo:1876:lineas" && !f.resuelto);
    assert.ok(abierto(), "queda en rojo mientras falta la crema");
    const g = await h("tk_get", { clave: "TK-SO-1883" });
    const lineas = (g.lineas as Row[]).map((l) => ({ tipo: l.tipo, sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, precio_unit: l.precio_unit, descuento_tipo: "", descuento_valor: 0, excluir_comision: false, estimado: false }));
    lineas.push({ tipo: "producto", sku: "ML-002", nombre: "Cream", cantidad: 1, precio_unit: 23, descuento_tipo: "", descuento_valor: 0, excluir_comision: false, estimado: false });
    const r = await h("tk_guardar", { clave: "TK-SO-1883", lineas });
    assert.ok(!r.error, JSON.stringify(r));
    assert.equal(abierto(), undefined, "se resolvió al guardar");
  });
});

describe("TK81 · saldo: redondeo ≤ $0.05 no es saldo", () => {
  it("saldoPendiente", () => {
    assert.equal(saldoPendiente(140, 139.96), 0);
    assert.equal(saldoPendiente(139.988, 139.94), 0);
    assert.equal(saldoPendiente(140, 139.9), 0.1);
    assert.equal(saldoPendiente(10, 20), 0);
  });
  it("detalle del ticket (front): mismo umbral", () => {
    assert.match(fe, /function saldoPend\(tot, pag\) \{ var x = r2\(tot - pag\); return x > 0\.05 \? x : 0; \}/);
  });
});

describe("TK81 · pill «Diferencia por mejora» solo con una línea real", () => {
  const m = fe.match(/function esMejora\(l\) \{[^\n]*\}/)![0];
  const esMejora = new Function(m + "; return esMejora;")() as (l: Row) => boolean;
  it("un canje simple (FACIAL REPARACIÓN / K-LIFT a $0) no es mejora", () => {
    assert.equal(esMejora({ canje: true, precio_unit: 0, nombre: "FACIAL K-LIFT" }), false);
    assert.equal(esMejora({ canje: true, precio_unit: 0, nombre: "FACIAL REPARACIÓN", promo: "Diferencia por mejora" }), false);
    assert.equal(esMejora({ precio_unit: 0, mejoraPaquete: true }), false);
  });
  it("la línea de diferencia con monto sí", () => {
    assert.equal(esMejora({ precio_unit: 37.82, nombre: "Diferencia por mejora de paquete", mejoraPaquete: true }), true);
  });
  it("las líneas: grilla fija con #, código bajo el nombre y sin cajas de texto", () => {
    const li = fe.slice(fe.indexOf("function lineasHtml()"), fe.indexOf("function totHtml()"));
    assert.match(li, /<span>#<\/span><span>Producto<\/span><span>Cant<\/span><span>P\. sin IVA<\/span><span>Desc<\/span>/);
    assert.match(li, /class="mctk-li">' \+ \(i \+ 1\)/);
    assert.doesNotMatch(li, /<input/);
    assert.doesNotMatch(li, /\+ Diferencia por mejora</);
  });
});

function s(v: unknown) { return v == null ? "" : String(v); }
