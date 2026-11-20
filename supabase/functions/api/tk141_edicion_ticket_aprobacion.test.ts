// TK141: edición de ticket con aprobación, canje explícito en el formulario y resumen Antes → Después.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./tickets_beta_api.ts";
import "./ticket_edicion_api.ts";
import "./inline_api.ts";
import "./aprobaciones_api.ts";
import { formALineas } from "./ticket_edicion_api.ts";
import { cedulasCompatibles } from "./domain.ts";
import type { Row } from "./domain.ts";

const CED10 = "1712345678";
const CED11 = "17123456789"; // typo/RUC-like: primeros 10 iguales. No se "corrige" el dato.

function semilla() {
  const db = new MemoryDb({
    sesiones: [
      { token: "and", uid: "u-andrea", rol: "cosmetologa", name: "Andrea Robles", exp: "2099-01-01T00:00:00.000Z" },
      { token: "emi", uid: "u-emi", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
      { token: "ana", uid: "u-ana", rol: "recepcion", name: "Ana Pérez", exp: "2099-01-01T00:00:00.000Z" },
    ],
    usuarios: [
      { id: "u-andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      { id: "u-emi", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
      { id: "u-ana", nombre: "Ana Pérez", short: "Ana", rol: "recepcion", bloqueado: false },
    ],
    cosmetologas: [
      { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true, comision_faciales: true },
    ],
    catalogo: [
      { sku: "SUNSU-40", producto_servicio: "Facial Reset 3x1", tipo: "FACIAL", total_con_iva: 95, subtotal: 82.61, activo: true, orig: {} },
      { sku: "SUNSU-31", producto_servicio: "Hollywood Peel", tipo: "EXTRA", total_con_iva: 15, subtotal: 13.04, activo: true, orig: {} },
      { sku: "SUNSU-AS-002", producto_servicio: "Ampoule", tipo: "PRODUCTO", total_con_iva: 1.58, subtotal: 1.37, activo: true, precio_compra: 0.4, orig: {} },
      { sku: "SUNSU-18", producto_servicio: "Facial Reparación x3", tipo: "PAQUETE", total_con_iva: 223, subtotal: 193.91, activo: true, orig: {} },
    ],
    tickets: [{
      id: 1925, sheet_row: 1925, so_num: "TK-SO-1925", timestamp: "2026-11-19T16:00:00Z",
      atendido_por: "Andrea Robles", nombre: "Andrés", apellido: "T", id_3: CED10,
      facial_hecho: "", servicios_adicionales: "SUNSU-31 Hollywood Peel",
      estimado: 16.58, paquete: "", orig: { "AS-002": 1 },
    }],
    beta_tickets: [{ id: 1, ticket_id: 1925, lineas_beta: true, datos: {} }],
    beta_ticket_lineas: [
      { id: 1, ticket_id: 1925, tipo: "extra", sku: "31", nombre: "Hollywood Peel", cantidad: 1, precio_unit: 15, total_linea: 15, descuento_tipo: null, descuento_valor: 0 },
      { id: 2, ticket_id: 1925, tipo: "producto", sku: "AS-002", nombre: "Ampoule", cantidad: 1, precio_unit: 1.58, total_linea: 1.58, descuento_tipo: null, descuento_valor: 0, comision: 0.35 },
    ],
    paquetes: [{
      id: 559, sheet_row: 559, codigo: "PACK-559", sku: "SUNSU-18",
      nombre: "SUNSU-18 x3 Facial Reparación", paquete: "SUNSU-18 x3 Facial Reparación",
      cedula: CED11, total: 3, completo: false, anulado: false,
      uso_1: true, fecha_1: "21/08/26", uso_2: true, fecha_2: "01/10/26", uso_3: false, fecha_3: "",
      orig: { codigo: "PACK-559", marcas_slot: {}, marcas_ticket: [] },
    }],
    erp_bodegas: [], erp_stock: [], erp_movimientos: [], app_modulos: [], cabina_inventario: [],
    inventario_base: [], promos: [], solicitudes_cambio: [], clientas_registro: [],
    beta_stock_movimientos: [], beta_ticket_snaps: [], beta_cuadre_link: [],
    beta_migo_facturas_vivo: [], beta_sku_alias: [], log_acciones: [], beta_notificaciones: [],
    erp_productos: [{ id: "p1", sku: "AS-002", nombre: "Ampoule", clase: "producto", uso: "venta", activo: true }],
  });
  const c = { db, now: new Date("2026-11-19T20:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok } as never) as Promise<Row>;
  return { db, h };
}

const formCanje = {
  nombre: "Andrés", apellido: "T", cedula: CED10,
  facial: "SUNSU-40 Facial Reset 3x1", cobro: "paquete",
  extras: "SUNSU-31 Hollywood Peel",
  productos: { "SUNSU-AS-002": 1 },
  precios_extra: { "SUNSU-31": 15 },
  precios_producto: { "SUNSU-AS-002": 1.58, "AS-002": 1.58 },
  paqPick: { fila: 559, idx: 2, total: 3, codigo: "PACK-559", nombre: "PACK-559 · SUNSU-18 x3 Facial Reparación", sku: "SUNSU-18" },
  estimado: 16.58,
};

describe("TK141 edición de ticket con aprobación", () => {
  it("cédulas compatibles: 10 dígitos coinciden con 11 que empiezan igual, no se mezclan otras", () => {
    assert.equal(cedulasCompatibles(CED10, CED11), true);
    assert.equal(cedulasCompatibles(CED10, CED10), true);
    assert.equal(cedulasCompatibles(CED10, "1712345677"), false, "otra cédula de 10 no coincide");
    assert.equal(cedulasCompatibles(CED10, "09999999999"), false, "11 dígitos de otra persona no coinciden");
    assert.equal(cedulasCompatibles("1712345678001", CED10), true, "RUC 13 con 001");
  });

  it("formALineas: canje facial en $0 + extras/productos con precios del ticket", () => {
    const L = formALineas(formCanje);
    const fac = L.find((l) => l.tipo === "facial")!;
    const ex = L.find((l) => l.tipo === "extra")!;
    const pr = L.find((l) => l.tipo === "producto")!;
    assert.equal(fac.precio_unit, 0);
    assert.match(String(fac.nombre), /Canje|PACK-559|Sesión/i);
    assert.equal(ex.precio_unit, 15);
    assert.equal(pr.precio_unit, 1.58);
  });

  it("(1) la chica pide agregar facial+canje y el ticket no cambia todavía", async () => {
    const { db, h } = semilla();
    const ped = await h("tk_edicion_pedir", "and", { clave: "TK-SO-1925", form: formCanje, motivo: "Faltó el facial de canje" });
    assert.equal(ped.ok, true, String(ped.error));
    const t = (db.tables.get("tickets") || []).find((x) => x.so_num === "TK-SO-1925")!;
    assert.equal(t.facial_hecho, "", "el facial real no se toca hasta aprobar");
    assert.equal(t.atendido_por, "Andrea Robles");
    const paq = (db.tables.get("paquetes") || []).find((x) => x.sheet_row === 559)!;
    assert.equal(paq.uso_3 === true || paq.uso_3 === "true", false, "la sesión 3 sigue libre");
    const lineas = (db.tables.get("beta_ticket_lineas") || []).filter((l) => l.ticket_id === 1925);
    assert.equal(lineas.some((l) => l.tipo === "facial"), false);
    const diff = ped.diff as Row;
    assert.ok((diff.cabecera as Row[]).some((c) => c.campo === "Facial" && String(c.antes) === "—" && /SUNSU-40/.test(String(c.despues)) && /PACK-559/.test(String(c.despues)) && /Sesión 3\/3/.test(String(c.despues))));
    const ln = (diff.lineas as Row[]).find((l) => l.estado === "agregada" && l.tipo === "facial")!;
    assert.equal(n(ln.precio_unit), 0);
    assert.equal(n((diff.totales as Row).despues && ((diff.totales as Row).despues as Row).total) >= 0, true);
  });

  it("(2) la chica no puede aprobar su propia solicitud", async () => {
    const { h } = semilla();
    const ped = await h("tk_edicion_pedir", "and", { clave: "TK-SO-1925", form: formCanje });
    const res = await h("solicitud_resolver", "and", { id: ped.id, aprobar: true });
    assert.match(String(res.error), /Solo un admin/);
  });

  it("(3) Emilia aprueba: se conservan ítems, se registra el uso exacto, línea $0, comisión de Andrea y no de Emilia", async () => {
    const { db, h } = semilla();
    const ped = await h("tk_edicion_pedir", "and", { clave: "TK-SO-1925", form: formCanje });
    assert.equal(ped.ok, true, String(ped.error));
    const apr = await h("solicitud_resolver", "emi", { id: ped.id, aprobar: true });
    assert.equal(apr.ok, true, String(apr.error));
    const t = (db.tables.get("tickets") || []).find((x) => x.so_num === "TK-SO-1925")!;
    assert.equal(t.atendido_por, "Andrea Robles", "no se pisa con la admin que aprueba");
    assert.match(String(t.facial_hecho), /SUNSU-40/);
    assert.match(String(t.paquete), /SI,\s*3\/3/);
    const L = (db.tables.get("beta_ticket_lineas") || []).filter((l) => l.ticket_id === 1925 || l.ticket_clave === "TK-SO-1925");
    const fac = [...L].reverse().find((l) => l.tipo === "facial")!;
    assert.ok(fac, "queda la línea de facial");
    assert.equal(Number(fac.precio_unit), 0);
    assert.equal(Number(fac.total_linea), 0);
    assert.match(String(fac.nombre), /Canje/i);
    assert.equal(Number(fac.comision), 3, "tarifa fija $3 del SUNSU-40, aunque el canje sea $0");
    const ex = L.find((l) => String(l.sku).includes("31") || String(l.tipo) === "extra");
    const pr = L.find((l) => String(l.sku).toUpperCase().includes("AS-002"));
    assert.ok(ex, "se conserva el extra");
    assert.ok(pr, "se conserva el producto");
    assert.equal(Number((ex || {}).precio_unit || (ex || {}).total_linea), 15);
    assert.equal(Number((pr || {}).precio_unit || (pr || {}).total_linea), 1.58);
    const paq = (db.tables.get("paquetes") || []).find((x) => x.sheet_row === 559)!;
    assert.equal(paq.uso_3 === true || paq.uso_3 === "true", true, "descargó exactamente la sesión 3");
    assert.equal(paq.uso_1 === true || paq.uso_1 === "true", true);
    assert.match(String(paq.fecha_3), /Andrea/);
    assert.doesNotMatch(String(paq.fecha_3), /Emilia/);
    const vista = await h("tk_get", "emi", { clave: "TK-SO-1925" });
    assert.equal((vista.edicion as Row | null) == null || !(vista.edicion as Row).id, true, "ya no hay edición pendiente");
  });

  it("(4) si Emilia rechaza, el ticket y el paquete quedan intactos", async () => {
    const { db, h } = semilla();
    const ped = await h("tk_edicion_pedir", "and", { clave: "TK-SO-1925", form: formCanje });
    const res = await h("solicitud_resolver", "emi", { id: ped.id, aprobar: false, comentario: "Falta una foto" });
    assert.equal(res.ok, true, String(res.error));
    assert.equal(res.estado, "rechazado");
    const t = (db.tables.get("tickets") || []).find((x) => x.so_num === "TK-SO-1925")!;
    assert.equal(t.facial_hecho, "");
    assert.equal(t.atendido_por, "Andrea Robles");
    const paq = (db.tables.get("paquetes") || []).find((x) => x.sheet_row === 559)!;
    assert.equal(paq.uso_3 === true || paq.uso_3 === "true", false);
    const L = (db.tables.get("beta_ticket_lineas") || []).filter((l) => l.ticket_id === 1925);
    assert.equal(L.some((l) => l.tipo === "facial"), false);
  });

  it("un admin no crea la solicitud (guarda directo o aprueba)", async () => {
    const { h } = semilla();
    const ped = await h("tk_edicion_pedir", "emi", { clave: "TK-SO-1925", form: formCanje });
    assert.match(String(ped.error), /admin/i);
  });

  it("si otra persona ya tiene una pendiente, no se crea otra", async () => {
    const { h } = semilla();
    const a = await h("tk_edicion_pedir", "and", { clave: "TK-SO-1925", form: formCanje });
    assert.equal(a.ok, true, String(a.error));
    const b = await h("tk_edicion_pedir", "ana", { clave: "TK-SO-1925", form: formCanje });
    assert.match(String(b.error), /pendiente/i);
  });

  it("Aprobaciones expone el diff línea por línea y el formulario no marca el paquete solo", () => {
    const screens = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    assert.match(screens, /Enviar propuesta para aprobación/); // TK154: modo «Proponer cambios»
    assert.match(screens, /_paqElegirSesion/);
    assert.match(screens, /Recomendado/);
    assert.match(screens, /NUNCA|no se elige solo|No se marca solo|no se marca solo/i);
    assert.doesNotMatch(screens.slice(screens.indexOf("function _paqCargarPicker"), screens.indexOf("function _paqElegir(")), /sel\.value\s*=\s*String\(window\._paqSugeridoI\)/);
    assert.match(screens, /_tkPintarDiffEdicion/);
    const mc = readFileSync(new URL("../../../mc-tickets.js", import.meta.url), "utf8");
    assert.match(mc, /mctk-editar-form/);
    assert.match(mc, /Aprobar y aplicar/); // TK154
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    assert.match(html, /_tkPintarDiffEdicion/);
    assert.match(html, /sunsu-2026-11-20-TK170/);
  });
});

function n(v: unknown): number { return Number(v) || 0; }
