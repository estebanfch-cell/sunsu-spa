import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./productos_api.ts";
import "./tickets_beta_api.ts";
import { calcularTicket, overlayComision, promoMonto } from "./ticket_beta.ts";
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
    { sku: "SUNSU-ML-001", producto_servicio: "Ampoule", tipo: "PRODUCTO", total_con_iva: 115, subtotal: 100, activo: true },
    { sku: "SUNSU-ML-002", producto_servicio: "Cream", tipo: "PRODUCTO", total_con_iva: 23, subtotal: 20, activo: true },
    { sku: "SUNSU-ML-009", producto_servicio: "Vieja", tipo: "PRODUCTO", total_con_iva: 10, subtotal: 8.7, activo: false },
    { sku: "SUNSU-40", producto_servicio: "Facial Reset", tipo: "FACIAL", total_con_iva: 46, subtotal: 40, activo: true },
  ]);
  db.tables.set("erp_productos", [
    { id: "p1", sku: "ML-001", nombre: "Ampoule", clase: "producto", uso: "venta", activo: true, codigo_barras: "8809937360834.0" },
    { id: "p2", sku: "ML-002", nombre: "Cream", clase: "producto", uso: "venta", activo: true },
  ]);
  db.tables.set("tickets", [
    { id: 1, sheet_row: 10, so_num: "TK-SO-1", timestamp: "2026-11-17T15:00:00Z", atendido_por: "Ana Pérez", nombre: "María", apellido: "Banda", id_3: "1700000001", facial_hecho: "SUNSU-40 Facial Reset", estimado: 69, orig: { "ML-002": 1 } },
  ]);
  for (const t of ["erp_bodegas", "erp_stock", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "promos", "beta_tickets", "beta_ticket_lineas", "solicitudes_cambio", "clientas_registro", "beta_stock_movimientos"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-17T18:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}

describe("detalle de ticket beta", () => {
  it("cálculo: descuento por línea y por ticket, IVA del total, promo N×M", () => {
    const r = calcularTicket([
      { tipo: "producto", sku: "ML-001", cantidad: 2, precio_unit: 115, descuento_tipo: "%", descuento_valor: 10 },
      { tipo: "facial", sku: "40", cantidad: 1, precio_unit: 46, descuento_tipo: "$", descuento_valor: 6 },
    ], { tipo: "$", valor: 7 });
    assert.equal(r.lineas[0].total_linea, 207); assert.equal(r.lineas[1].total_linea, 40);
    assert.equal(r.total, 240); assert.equal(r.subtotal, 208.7); assert.equal(r.iva, 31.3);
    assert.equal(promoMonto({ nombre: "3x2", tipo: "NXM", valor: 3, valor2: 2, codigos: ["SUNSU-ML-002"] }, [{ sku: "ML-002", cantidad: 3, unit: 23, tipo: "producto" }]), 23);
  });
  it("lee el ticket del sistema con líneas estimadas, guarda en la beta y no toca la tabla tickets", async () => {
    const { db, h } = semilla();
    const antes = JSON.stringify(db.tables.get("tickets"));
    const g = await h("tk_get", "adm", { clave: "TK-SO-1" });
    assert.equal(g.ok, true);
    const L = g.lineas as Row[];
    assert.deepEqual(L.map((l) => [l.tipo, l.sku, l.cantidad, l.estimado]).sort(), [["facial", "40", 1, false], ["producto", "ML-002", 1, false]]);
    assert.equal((g.totales as Row).total, 69);
    assert.ok(((g.ticket as Row).leds as Row[]).some((x) => x.t === "Abierto"));
    // Inactivo no se puede agregar.
    assert.match(String((await h("tk_guardar", "adm", { clave: "TK-SO-1", lineas: [...L, { tipo: "producto", sku: "ML-009", cantidad: 1 }] })).error), /inactivo/);
    const sv = await h("tk_guardar", "adm", { clave: "TK-SO-1", lineas: [...L, { tipo: "producto", sku: "ML-001", cantidad: 1, descuento_tipo: "%", descuento_valor: 10 }], descuento: { tipo: "$", valor: 4 }, justificacion_descuento: "Promo de prueba TK135" });
    assert.equal(sv.ok, true, String(sv.error));
    assert.equal(sv.total, round(69 + 103.5 - 4));
    const g2 = await h("tk_get", "adm", { clave: "TK-SO-1" });
    assert.equal(g2.lineasBeta, true);
    assert.equal(g2.justificacion_descuento, "Promo de prueba TK135");
    const ml1 = (g2.lineas as Row[]).find((l) => l.sku === "ML-001")!;
    assert.deepEqual([ml1.cantidad, ml1.precio_unit, ml1.descuento_monto, ml1.total_linea], [1, 115, 11.5, 103.5]);
    assert.equal((g2.historial as Row[]).length, 1);
    assert.equal(JSON.stringify(db.tables.get("tickets")), antes);
    // Sin admin: no guarda directo, pide el cambio y el admin lo aprueba.
    assert.match(String((await h("tk_guardar", "cos", { clave: "TK-SO-1", lineas: [] })).error), /Solicitar cambio/);
    const sol = await h("solicitud_crear", "cos", { tabla: "ticket_detalle", fila: "TK-SO-1", tipo: "cambio", motivo: "Faltó una crema", propuestos: { lineas: [...(g2.lineas as Row[]), { tipo: "producto", sku: "ML-002", cantidad: 1 }].filter((l, i, a) => a.findIndex((x) => x.sku === l.sku) === i) } });
    assert.equal(sol.ok, true, String(sol.error));
    assert.equal((await h("solicitud_resolver", "adm", { id: sol.id, aprobar: true })).ok, true);
    assert.equal(((await h("tk_get", "adm", { clave: "TK-SO-1" })).historial as Row[]).at(-1)!.accion, "solicitud aprobada");
  });
  it("excluir comisión: por línea o toda la cosmetóloga, aplicado sobre el ticket de comisiones", () => {
    const t = { productos: [{ sku: "ML-001", qty: 1 }, { sku: "ML-002", qty: 2 }], exclFacial: false, exclPaquete: false, exclProducto: false, exclExtras: false, extras: "" };
    const lineas = [{ tipo: "producto", sku: "ML-001", cantidad: 1, excluir_comision: true }, { tipo: "producto", sku: "ML-002", cantidad: 2 }, { tipo: "facial", sku: "40", cantidad: 1, excluir_comision: true }];
    const o = overlayComision(t, { lineas_beta: true }, lineas);
    assert.deepEqual(o.productos, [{ sku: "ML-002", qty: 2 }]); assert.equal(o.exclFacial, true); assert.equal(o.exclProducto, false);
    const all = overlayComision(t, { excluir_cosmetologa: true }, []);
    assert.deepEqual([all.exclFacial, all.exclPaquete, all.exclProducto, all.exclExtras], [true, true, true, true]);
    assert.equal(overlayComision(t, undefined, undefined), t);
  });
  it("código de barras de fábrica: único entre productos", async () => {
    const { h } = semilla();
    assert.match(String((await h("mcprod_save", "adm", { id: "p2", cambios: { codigo_barras: "8809937360834" } })).error), /ya lo tiene/);
    assert.equal((await h("mcprod_save", "adm", { id: "p2", cambios: { codigo_barras: "7501234567890" } })).ok, true);
  });
});
function round(v: number) { return Math.round(v * 100) / 100; }

describe("detalle de ticket v2", () => {
  it("factura completa, formas de pago y Fase A", async () => {
    const { facturaCompleta, metodosPago, faseA } = await import("./tickets_beta_api.ts");
    assert.equal(facturaCompleta("2559.0"), "001-001-000002559");
    assert.equal(facturaCompleta("001-001-2559"), "001-001-000002559");
    assert.equal(facturaCompleta("SIN FACTURA"), "");
    assert.deepEqual(metodosPago("Tarje:2505, Efect:15"), [{ metodo: "tarjeta", ref: "2505" }, { metodo: "efectivo", ref: "15" }]);
    assert.equal(faseA({ facial_hecho: "SUNSU-40", notas_generales: "ok", fotos_antes: "https://x/a.jpg" }), true);
    assert.equal(faseA({ facial_hecho: "SUNSU-40", notas_generales: "", fotos_antes: "https://x/a.jpg" }), false);
  });
  it("datos editables, costos, envío de reporte, marca por corregir y estados de la lista", async () => {
    const { db, h } = semilla();
    for (const t of ["beta_ticket_envios", "envios_tarjetas", "gift_cards", "gift_cards_digitales"]) db.tables.set(t, []);
    db.tables.set("beta_ticket_flags", [{ id: "migo:1:x", ticket_id: 1, ticket_clave: "TK-SO-1", motivo: "Sin factura", detalle: "No está en Migo", resuelto: false, fuente: "migo" }]);
    db.tables.get("tickets")![0].fac_7 = "2559.0";
    db.tables.get("tickets")![0].comp = "Efect:69";
    db.tables.get("tickets")![0].cob = true;
    db.tables.get("tickets")![0].venta_gift = "SI, 26-148, Facial";
    db.tables.set("gift_cards", [{ codigo_gc: "26-148", nombre_comprador: "Luz", apellido_comprador: "Mar", valor: "46", saldo: 46 }]);
    db.tables.set("gift_cards_digitales", [{ codigo: "26-148", para: "Sol", de: "Luz" }]);
    db.tables.get("erp_productos")![1].costo_promedio = 8;
    const antes = JSON.stringify(db.tables.get("tickets"));
    const g = await h("tk_get", "adm", { clave: "TK-SO-1" });
    assert.equal((g.info as Row).factura, "001-001-000002559");
    assert.equal((g.pagos as Row).pagado, 69);
    assert.deepEqual(((g.giftcards as Row[])[0]), { ...(g.giftcards as Row[])[0], codigo: "26-148", uso: "vendida", comprador: "Luz Mar", para: "Sol" });
    assert.equal((g.flags as Row[]).length, 1);
    assert.ok((g.chips as Row[]).some((c) => c.t === "Por corregir"));
    // Admin corrige la cabecera sin tocar las líneas.
    const sv = await h("tk_guardar", "adm", { clave: "TK-SO-1", datos: { factura: "2600", email: "m@b.com", retorno: "2026-12-01" } });
    assert.equal(sv.ok, true, String(sv.error));
    const g2 = await h("tk_get", "adm", { clave: "TK-SO-1" });
    assert.equal((g2.info as Row).factura, "001-001-000002600");
    assert.equal(g2.lineasBeta, false);
    assert.match(String((await h("tk_guardar", "adm", { clave: "TK-SO-1", datos: { email: "malo" } })).error), /Email/);
    // Cabina (opcional): solo Cabina 1/2/3 o Local.
    assert.equal((await h("tk_guardar", "adm", { clave: "TK-SO-1", datos: { cabina: "cabina 2" } })).ok, true);
    assert.equal(((await h("tk_get", "adm", { clave: "TK-SO-1" })).info as Row).cabina, "Cabina 2");
    assert.match(String((await h("tk_guardar", "adm", { clave: "TK-SO-1", datos: { cabina: "Cabina 9" } })).error), /Cabina/);
    // Costos: solo Super Admin (TK115).
    assert.match(String((await h("tk_costos", "cos", { clave: "TK-SO-1" })).error), /Super Admin/);
    assert.match(String((await h("tk_costos_guardar", "adm", { clave: "TK-SO-1", tipo: "%", valor: 10 })).error), /Super Admin/);
    // Envío de reporte (cosmetóloga, su ticket) y estados de la lista.
    assert.equal((await h("tk_envio", "cos", { clave: "TK-SO-1", tipo: "facial", telefono: "593999111222" })).ok, true);
    assert.equal((db.tables.get("beta_ticket_envios") as Row[])[0].telefono_fin, "1222");
    const est = await h("tk_estados", "cos");
    assert.equal(est.ok, true);
    const it = (est.items as Record<string, Row>)["10"];
    assert.equal(it.r, 1); assert.equal(it.p, 1); assert.equal(it.ret, "2026-12-01"); assert.match(String(it.flag), /Sin factura/);
    // Resolver la marca: solo admin.
    assert.match(String((await h("tk_flag_resolver", "cos", { id: "migo:1:x" })).error), /Solo un admin/);
    assert.equal((await h("tk_flag_resolver", "adm", { id: "migo:1:x", nota: "corregido en Migo" })).ok, true);
    assert.equal(((await h("tk_estados", "adm")).items as Record<string, Row>)["10"].flag, undefined);
    // Cosmetóloga pide corregir la cabecera por solicitud.
    const sol = await h("solicitud_crear", "cos", { tabla: "ticket_detalle", fila: "TK-SO-1", tipo: "cambio", motivo: "CI mal", propuestos: { datos: { cedula: "1700000002" } } });
    assert.equal(sol.ok, true, String(sol.error));
    assert.equal((await h("solicitud_resolver", "adm", { id: sol.id, aprobar: true })).ok, true);
    assert.equal(((await h("tk_get", "adm", { clave: "TK-SO-1" })).info as Row).cedula, "1700000002");
    assert.equal(JSON.stringify(db.tables.get("tickets")), antes);
  });
});
function n6(v: unknown) { return Number(v) || 0; }
