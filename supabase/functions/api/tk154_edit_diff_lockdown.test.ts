// TK154 (Emilia t671u/t672u/t673u/t674u/t675u): propuesta de edición con comparativo Antes → Después + lockdown,
// «Eliminar ticket» por solicitud, violeta en la lista, líneas instantáneas y fotitos en lote.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./tickets_beta_api.ts";
import "./ticket_edicion_api.ts";
import "./inline_api.ts";
import "./aprobaciones_api.ts";
import "./tickets_lista_api.ts";
import { skuCode, type Row } from "./domain.ts";
import { AVISO_LEGACY, cambioTotal, diffLegible, pendientesPorClave, resumenSolicitudTicket } from "./propuesta_edicion.ts";
import { enriquecerItemsLista, lineasSinteticas } from "./ticket_lista_card.ts";

const root = new URL("../../../", import.meta.url);
const file = (n: string) => readFileSync(new URL(n, root), "utf8");
const CED = "1712345678";

function semilla(extra: Record<string, Row[]> = {}) {
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
    cosmetologas: [{ id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true, comision_faciales: true }],
    catalogo: [
      { sku: "SUNSU-40", producto_servicio: "Facial Reset 3x1 Hidratación Profunda con Ampolla PDRN", tipo: "FACIAL", total_con_iva: 95, subtotal: 82.61, activo: true, orig: {} },
      { sku: "SUNSU-31", producto_servicio: "Hollywood Peel", tipo: "EXTRA", total_con_iva: 15, subtotal: 13.04, activo: true, orig: {} },
      { sku: "SUNSU-AS-002", producto_servicio: "Ampoule", tipo: "PRODUCTO", total_con_iva: 1.58, subtotal: 1.37, activo: true, precio_compra: 0.4, orig: {} },
    ],
    tickets: [{
      id: 1938, sheet_row: 1938, so_num: "TK-SO-1938", timestamp: "2026-11-19T16:00:00Z",
      atendido_por: "Andrea Robles", nombre: "María", apellido: "R", id_3: CED,
      facial_hecho: "SUNSU-40 Facial Reset 3x1", servicios_adicionales: "SUNSU-31 Hollywood Peel",
      estimado: 110, paquete: "", orig: {},
    }],
    beta_tickets: [{ id: 1, ticket_id: 1938, clave: "TK-SO-1938", lineas_beta: true, datos: {} }],
    beta_ticket_lineas: [
      { id: 1, ticket_id: 1938, ticket_clave: "TK-SO-1938", tipo: "facial", sku: "40", nombre: "Facial Reset 3x1 Hidratación Profunda con Ampolla PDRN", cantidad: 1, precio_unit: 95, total_linea: 95, descuento_tipo: null, descuento_valor: 0, orden: 1 },
      { id: 2, ticket_id: 1938, ticket_clave: "TK-SO-1938", tipo: "extra", sku: "31", nombre: "Hollywood Peel", cantidad: 1, precio_unit: 15, total_linea: 15, descuento_tipo: null, descuento_valor: 0, orden: 2 },
    ],
    paquetes: [], erp_bodegas: [], erp_stock: [], erp_movimientos: [], app_modulos: [], cabina_inventario: [],
    inventario_base: [], promos: [], solicitudes_cambio: [], clientas_registro: [],
    beta_stock_movimientos: [], beta_ticket_snaps: [], beta_cuadre_link: [], beta_pagos: [], beta_ticket_flags: [],
    beta_migo_facturas_vivo: [], beta_sku_alias: [], log_acciones: [], beta_notificaciones: [], beta_clientes: [],
    erp_productos: [{ id: "p1", sku: "AS-002", nombre: "Ampoule", clase: "producto", uso: "venta", activo: true }],
    app_archivos: [],
    ...extra,
  });
  const c = { db, now: new Date("2026-11-19T23:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok } as never) as Promise<Row>;
  return { db, h };
}
const lineasDe = (db: MemoryDb) => (db.tables.get("beta_ticket_lineas") || []).filter((l) => l.ticket_clave === "TK-SO-1938" || l.ticket_id === 1938);
const ticket = (db: MemoryDb) => (db.tables.get("tickets") || []).find((x) => x.so_num === "TK-SO-1938")!;
const sols = (db: MemoryDb) => db.tables.get("solicitudes_cambio") || [];

// Propuesta inline de la chica: el facial pasa a $0, se quita el Hollywood Peel y se agrega una Ampoule.
const propuestaLineas = {
  lineas: [
    { tipo: "facial", sku: "40", nombre: "Facial Reset 3x1 Hidratación Profunda con Ampolla PDRN", cantidad: 1, precio_unit: 0, descuento_tipo: "", descuento_valor: 0 },
    { tipo: "producto", sku: "AS-002", nombre: "Ampoule", cantidad: 2, precio_unit: 1.58, descuento_tipo: "", descuento_valor: 0 },
  ],
  descuento: { tipo: "", valor: 0 },
  datos: { notas: "Canje de paquete, no se cobra el facial" },
};

describe("TK154 propuesta de edición con comparativo + lockdown", () => {
  it("la propuesta (agregar/quitar/modificar línea) se guarda SIN tocar el ticket real", async () => {
    const { db, h } = semilla();
    const antes = JSON.stringify(lineasDe(db));
    const r = await h("solicitud_crear", "and", { tabla: "ticket_detalle", fila: "TK-SO-1938", tipo: "cambio", motivo: "El facial era canje", propuestos: propuestaLineas });
    assert.equal(r.ok, true, String(r.error));
    assert.equal(JSON.stringify(lineasDe(db)), antes, "las líneas reales no cambian");
    assert.equal(ticket(db).estimado, 110);
    const sol = sols(db)[0];
    const P = (sol.propuestos as Row).propuesta as Row;
    assert.equal(P.tipo, "editar");
    assert.ok(P.antes && P.despues && P.diff, "guarda antes / después / diff");
    const L = P.legible as Row[];
    assert.ok(L.some((x) => x.signo === "+" && x.titulo === "Ampoule" && /2 × \$1\.58/.test(String(x.detalle))), "verde + agregada");
    assert.ok(L.some((x) => x.signo === "−" && x.titulo === "Hollywood Peel"), "rojo − eliminada");
    assert.ok(L.some((x) => x.signo === "~" && /Facial Reset 3x1 Hidratación Profunda con Ampolla PDRN/.test(String(x.titulo)) && /\$95\.00/.test(String(x.detalle)) && /\$0\.00/.test(String(x.detalle))), "ámbar ~ modificada con Antes → Después");
    assert.ok(L.some((x) => x.signo === "~" && x.titulo === "Notas"), "campos cambiados");
    assert.match(String((P.total as Row).texto), /^Total: \$110\.00 → \$3\.16$/);
    // Sigue disparando la alerta para la admin.
    const al = await h("tk_ediciones_pendientes", "emi");
    assert.equal(al.pendientes, 1);
  });

  it("tk_get muestra a la admin quién, motivo y el diff legible", async () => {
    const { h } = semilla();
    await h("solicitud_crear", "and", { tabla: "ticket_detalle", fila: "TK-SO-1938", tipo: "cambio", motivo: "El facial era canje", propuestos: propuestaLineas });
    const v = await h("tk_get", "emi", { clave: "TK-SO-1938" });
    const ed = v.edicion as Row;
    assert.equal(ed.tipo, "editar");
    assert.equal(ed.solicitante, "Andrea Robles");
    assert.equal(ed.motivo, "El facial era canje");
    assert.ok((ed.legible as Row[]).length >= 3);
    assert.equal(ed.lockdown, true);
  });

  it("«Aprobar y aplicar» aplica EXACTAMENTE la propuesta y el ticket sigue bloqueado", async () => {
    const { db, h } = semilla();
    const r = await h("solicitud_crear", "and", { tabla: "ticket_detalle", fila: "TK-SO-1938", tipo: "cambio", motivo: "El facial era canje", propuestos: propuestaLineas });
    const apr = await h("solicitud_resolver", "emi", { id: r.id, aprobar: true });
    assert.equal(apr.ok, true, String(apr.error));
    assert.equal(apr.estado, "aprobado");
    const v = await h("tk_get", "emi", { clave: "TK-SO-1938" });
    const L = (v.lineas as Row[]).map((l) => skuCode(String(l.sku)) + "×" + Number(l.cantidad) + "@" + Number(l.precio_unit)).sort();
    assert.deepEqual(L, ["40×1@0", "AS-002×2@1.58"].sort());
    assert.equal((v.edicion as Row | null) == null, true, "ya no hay solicitud pendiente");
    // Lockdown: la chica no puede guardar libre; solo puede proponer de nuevo.
    const vs = await h("tk_get", "and", { clave: "TK-SO-1938" });
    assert.equal(vs.puedeEditar, false);
    assert.equal(vs.puedePedir, true);
    const libre = await h("tk_guardar", "and", { clave: "TK-SO-1938", lineas: [] });
    assert.match(String(libre.error), /Solicitar cambio|admin/i);
    assert.ok((db.tables.get("log_acciones") || []).some((x) => /APROBAR EDICIÓN/.test(String(x.accion || x.tipo || JSON.stringify(x)))), "queda en la auditoría");
  });

  it("«Rechazar» deja el ticket intacto y bloqueado", async () => {
    const { db, h } = semilla();
    const antes = JSON.stringify(lineasDe(db));
    const r = await h("solicitud_crear", "and", { tabla: "ticket_detalle", fila: "TK-SO-1938", tipo: "cambio", motivo: "x cambio", propuestos: propuestaLineas });
    const no = await h("solicitud_resolver", "emi", { id: r.id, aprobar: false, comentario: "No corresponde" });
    assert.equal(no.estado, "rechazado");
    assert.equal(JSON.stringify(lineasDe(db)), antes);
    const vs = await h("tk_get", "and", { clave: "TK-SO-1938" });
    assert.equal(vs.puedeEditar, false);
  });

  it("formulario completo (tk_edicion_pedir) también guarda la propuesta estructurada", async () => {
    const { db, h } = semilla();
    const form = { nombre: "María", apellido: "R", cedula: CED, facial: "SUNSU-40 Facial Reset 3x1", facialPrecio: 95, extras: "", notas: "Sin peel" };
    const r = await h("tk_edicion_pedir", "and", { clave: "TK-SO-1938", form, motivo: "No se hizo el peel" });
    assert.equal(r.ok, true, String(r.error));
    const P = (sols(db)[0].propuestos as Row).propuesta as Row;
    assert.equal(P.tipo, "editar");
    assert.ok((P.legible as Row[]).some((x) => x.signo === "−" && x.titulo === "Hollywood Peel"));
    assert.equal(lineasDe(db).length, 2, "ticket real intacto");
  });
});

describe("TK154 «Eliminar ticket» (anulación) por solicitud", () => {
  it("la chica pide eliminar: el ticket queda igual y la admin ve SOLICITUD PARA ELIMINAR", async () => {
    const { db, h } = semilla();
    const r = await h("solicitud_crear", "and", { tabla: "ticket_detalle", fila: "TK-SO-1938", tipo: "eliminacion", motivo: "Tiket ya realizado anteriormente" });
    assert.equal(r.ok, true, String(r.error));
    assert.notEqual((ticket(db).orig as Row).anulado, true);
    const P = (sols(db)[0].propuestos as Row).propuesta as Row;
    assert.equal(P.tipo, "anular");
    const v = await h("tk_get", "emi", { clave: "TK-SO-1938" });
    const ed = v.edicion as Row;
    assert.equal(ed.tipo, "anular");
    assert.equal(ed.motivo, "Tiket ya realizado anteriormente");
    assert.match(String((ed.total as Row).texto), /\$110\.00/);
  });

  it("también desde el formulario (tk_edicion_pedir anular) y motivo obligatorio", async () => {
    const { db, h } = semilla();
    const sin = await h("tk_edicion_pedir", "ana", { clave: "TK-SO-1938", anular: true, motivo: "" });
    assert.match(String(sin.error), /motivo/i);
    const r = await h("tk_edicion_pedir", "ana", { clave: "TK-SO-1938", anular: true, motivo: "Duplicado" });
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.mensaje, "Se le solicitó al administrador eliminar este ticket");
    assert.equal(sols(db)[0].tipo, "eliminacion");
    assert.ok((db.tables.get("beta_notificaciones") || []).some((n) => /eliminar/i.test(String(n.titulo) + String(n.cuerpo))), "aviso a la admin");
  });

  it("«Aprobar y eliminar» cancela el ticket de forma segura; rechazar lo deja vivo", async () => {
    const a = semilla();
    const r = await a.h("solicitud_crear", "and", { tabla: "ticket_detalle", fila: "TK-SO-1938", tipo: "eliminacion", motivo: "Duplicado" });
    const ok = await a.h("solicitud_resolver", "emi", { id: r.id, aprobar: true });
    assert.equal(ok.ok, true, String(ok.error));
    assert.equal((ticket(a.db).orig as Row).anulado, true);
    const b = semilla();
    const r2 = await b.h("solicitud_crear", "and", { tabla: "ticket_detalle", fila: "TK-SO-1938", tipo: "eliminacion", motivo: "Duplicado" });
    await b.h("solicitud_resolver", "emi", { id: r2.id, aprobar: false });
    assert.notEqual((ticket(b.db).orig as Row).anulado, true);
  });
});

describe("TK154 compatibilidad con solicitudes anteriores", () => {
  it("solicitud sin propuesta (solo motivo) muestra el aviso y al aprobar no rompe nada", async () => {
    const { db, h } = semilla({
      solicitudes_cambio: [{ id: "old-1", solicitante: "Andrea Robles", solicitante_uid: "u-andrea", creado: "2026-11-19T22:00:00Z", tabla: "ticket_detalle", fila: "TK-SO-1938", tipo: "cambio", propuestos: {}, antes: {}, motivo: "Tiket ya realizado anteriormente", estado: "pendiente" }],
    });
    const v = await h("tk_get", "emi", { clave: "TK-SO-1938" });
    const ed = v.edicion as Row;
    assert.equal(ed.tipo, "legacy");
    assert.equal(ed.aviso, AVISO_LEGACY);
    const antes = JSON.stringify(lineasDe(db));
    const apr = await h("solicitud_resolver", "emi", { id: "old-1", aprobar: true });
    assert.equal(apr.ok, true, String(apr.error));
    assert.equal(JSON.stringify(lineasDe(db)), antes);
  });

  it("resumenSolicitudTicket entiende diffs viejos de TK141 (sin propuesta)", () => {
    const rs = resumenSolicitudTicket({ id: "x", tipo: "cambio", motivo: "m", propuestos: { edicion_form: true, diff: { cabecera: [], lineas: [{ estado: "agregada", nombre: "Hollywood Peel", cantidad: 1, precio_unit: 15 }], totales: { antes: { total: 95 }, despues: { total: 110 } } } } });
    assert.equal(rs.tipo, "editar");
    assert.equal((rs.legible as Row[])[0].signo, "+");
    assert.equal((rs.total as Row).texto, "Total: $95.00 → $110.00");
  });
});

describe("TK154 diff legible", () => {
  it("+ / − / ~ con nombres completos y total solo si cambió", () => {
    const diff = {
      cabecera: [{ campo: "Notas", antes: "—", despues: "Hola" }],
      lineas: [
        { estado: "agregada", nombre: "Ampoule", cantidad: 2, precio_unit: 1.58 },
        { estado: "eliminada", nombre: "Hollywood Peel", cantidad: 1, precio_unit: 15 },
        { estado: "modificada", nombre: "Facial Reset 3x1 Hidratación Profunda con Ampolla PDRN", cantidad: 1, precio_unit: 0, antes_cantidad: 1, antes_precio_unit: 95 },
        { estado: "igual", nombre: "Otro", cantidad: 1, precio_unit: 1 },
      ],
      totales: { antes: { total: 125 }, despues: { total: 30 } },
    };
    const L = diffLegible(diff);
    assert.deepEqual(L.map((x) => x.signo), ["~", "+", "−", "~"]);
    assert.equal(L[3].titulo, "Facial Reset 3x1 Hidratación Profunda con Ampolla PDRN");
    assert.match(String(L[3].detalle), /Antes: 1 × \$95\.00 = \$95\.00 → Después: 1 × \$0\.00 = \$0\.00/);
    assert.equal(cambioTotal(diff)!.texto, "Total: $125.00 → $30.00");
    assert.equal(cambioTotal({ totales: { antes: { total: 5 }, despues: { total: 5 } } }), null);
  });
});

describe("TK154 UI: comparativo, Eliminar ticket y violeta en la lista", () => {
  const screens = file("beta-screens.js"), mc = file("mc-tickets.js"), html = file("index.html");
  const bloque = screens.slice(screens.indexOf("/* TK154-DIFF-INI"), screens.indexOf("/* TK154-DIFF-FIN */"));
  const pintar = new Function(bloque + "; return _tkPintarDiffEdicion;")() as (x: unknown) => string;

  it("el comparativo pinta + verde, − rojo, ~ ámbar y el nombre completo sin recortes", () => {
    const largo = "Facial Reset 3x1 Hidratación Profunda con Ampolla PDRN y Mascarilla Calmante de Centella";
    const out = pintar({ tipo: "editar", diff: { cabecera: [], lineas: [
      { estado: "agregada", nombre: "Ampoule", cantidad: 1, precio_unit: 1.58 },
      { estado: "eliminada", nombre: "Hollywood Peel", cantidad: 1, precio_unit: 15 },
      { estado: "modificada", nombre: largo, cantidad: 1, precio_unit: 0, antes_cantidad: 1, antes_precio_unit: 95 },
    ], totales: { antes: { total: 125 }, despues: { total: 30 } } } });
    assert.match(out, /tk-d-add[\s\S]*?>\+</);
    assert.match(out, /tk-d-del[\s\S]*?>−</);
    assert.match(out, /tk-d-mod[\s\S]*?>~</);
    assert.ok(out.includes(largo), "nombre completo, sin recortar");
    assert.match(out, /Total: <b>\$125\.00 → \$30\.00<\/b>/);
    assert.doesNotMatch(out, /…|\.\.\./);
  });

  it("anulación y solicitud anterior se pintan claro", () => {
    assert.match(pintar({ tipo: "anular", total: { antes: 110 } }), /🚫 Solicita anular este ticket[\s\S]*\$110\.00/);
    assert.match(pintar({ tipo: "legacy", legacy: true, aviso: AVISO_LEGACY }), /Solicitud anterior sin detalle de cambios/);
  });

  it("390px: el CSS del diff envuelve, sin nowrap/ellipsis ni ancho fijo", () => {
    const css = html.slice(html.indexOf("/* TK154 (Emilia t671u)"), html.indexOf("/* TK154 (Emilia t672u)"));
    assert.match(css, /\.tk-d \{[^}]*grid-template-columns: 22px minmax\(0, 1fr\)/);
    assert.match(css, /\.tk-d-n, \.tk-d-det \{[^}]*overflow-wrap: anywhere/);
    assert.match(css, /\.tk-d-tx \{[^}]*min-width: 0/);
    assert.doesNotMatch(css, /nowrap|text-overflow|ellipsis|width: \d{3,}px/);
  });

  it("tarjeta de la admin: quién, motivo, Aprobar y aplicar / Aprobar y eliminar / Rechazar", () => {
    assert.match(mc, /SOLICITUD PARA ELIMINAR TICKET/);
    assert.match(mc, /Aprobar y eliminar/);
    assert.match(mc, /Aprobar y aplicar/);
    assert.match(mc, /id="mctk-edicion-no">Rechazar/);
    assert.match(mc, /Pedido por <b>/);
    assert.match(mc, /Motivo:<\/b>/);
    assert.match(mc, /el ticket sigue bloqueado/);
  });

  it("«Eliminar ticket»: chicas → aviso + motivo + Solicitar eliminación; admin → confirmación directa", () => {
    assert.match(mc, /id="mctk-solcancel">🗑️ Eliminar ticket/);
    assert.match(mc, /id="mctk-cancelar">🗑️ Eliminar ticket/);
    assert.match(mc, /Se le solicitará al administrador eliminar este ticket/);
    assert.match(mc, /Motivo \(obligatorio\)/);
    assert.match(mc, />Solicitar eliminación<\/button>/);
    assert.match(mc, /on\(main, "#mctk-solcancel", "onclick", function \(ev\) \{ cerrarMenuDe\(ev && ev\.target\); dlgSolicitarEliminar\(\); \}\)/);
    assert.match(mc, /on\(main, "#mctk-cancelar", "onclick", dlgCancelar\)/);
  });

  it("formulario en modo «Proponer cambios» con banner, motivo obligatorio y opción de anular", () => {
    assert.match(screens, /Propuesta de edición — los cambios se aplicarán solo cuando un admin apruebe/);
    assert.match(screens, /Enviar propuesta para aprobación/);
    assert.match(screens, /Solicitar anulación \/ cancelación de este ticket/);
    assert.match(screens, /Motivo del cambio \(obligatorio\)/);
    assert.doesNotMatch(screens, /motivo:'Edición del ticket'/);
  });

  it("lista: ticket con solicitud pendiente → violeta brillante con prioridad y pill 🟣", () => {
    const ini = screens.indexOf("function _tkEdicionPendienteDe"), fin = screens.indexOf("function _tkCargarEdiciones");
    const fns = new Function("window", "_histEsc", screens.slice(ini, fin) + "; return { sp: _tkSolPend, pill: _tkPillEdicion };")({}, (x: string) => x) as { sp: (t: Row) => Row | null; pill: (t: Row) => string };
    assert.deepEqual(fns.sp({ so_num: "TK-SO-1938", solicitud_pendiente: true, solicitud_edicion_pendiente: { tipo: "anular" } }), { tipo: "anular" });
    assert.match(fns.pill({ solicitud_pendiente: true, solicitud_edicion_pendiente: { tipo: "anular" } }), /🟣 Eliminar · revisar/);
    assert.match(fns.pill({ solicitud_pendiente: true }), /🟣 Revisar solicitud/);
    assert.equal(fns.pill({ so_num: "x" }), "");
    assert.match(screens, /'<div class="mob-card'\+\(_tkSolPend\(t\)\?' tk-solpend':fl\?' tk-flagged':fa\?' tk-falta':''\)/);
    assert.match(screens, /'<tr class="tk-row'\+on\+\(_tkSolPend\(t\)\?' tk-solpend':fl\?/);
    assert.match(html, /\.mob-card\.tk-solpend \{ background: linear-gradient\(135deg, #F3E8FF 0%, #EDE9FE 100%\); border: 2px solid #7C3AED; border-left: 5px solid #7C3AED; box-shadow: 0 0 0 1px rgba\(124,58,237,0\.2\); \}/);
    assert.match(html, /\.tk-pill\.tk-pill-solpend \{ background: #7C3AED; color: #fff;/);
  });
});

describe("TK154 tk_historial: violeta desde la carga y líneas para el 100% de los tickets", () => {
  it("pendientesPorClave marca solo solicitudes de ticket pendientes y no de prueba", () => {
    const m = pendientesPorClave([
      { tabla: "ticket_detalle", fila: "TK-SO-1", estado: "pendiente", tipo: "eliminacion", id: "a" },
      { tabla: "ticket_detalle", fila: "TK-SO-2", estado: "aprobado", tipo: "cambio", id: "b" },
      { tabla: "ticket_detalle", fila: "TK-SO-3", estado: "pendiente", tipo: "cambio", id: "c", prueba: true },
      { tabla: "clientes", fila: "TK-SO-4", estado: "pendiente", tipo: "cambio", id: "d" },
    ]);
    assert.deepEqual([...m.keys()], ["TK-SO-1"]);
    assert.equal(m.get("TK-SO-1")!.tipo, "anular");
    assert.match(file("supabase/functions/api/tickets_lista_api.ts"), /it\.solicitud_pendiente = true; it\.solicitud_edicion_pendiente = /);
  });

  it("tk_historial devuelve solicitud_pendiente en el item", async () => {
    const { h } = semilla();
    await h("solicitud_crear", "and", { tabla: "ticket_detalle", fila: "TK-SO-1938", tipo: "eliminacion", motivo: "Duplicado" });
    const r = await h("tk_historial", "emi", { offset: 0, limit: 50 });
    assert.equal(r.ok, true, String(r.error));
    const it0 = (r.items as Row[]).find((x) => x.so_num === "TK-SO-1938")!;
    assert.equal(it0.solicitud_pendiente, true);
    assert.equal((it0.solicitud_edicion_pendiente as Row).tipo, "anular");
  });

  it("ticket normal sin beta_ticket_lineas trae líneas sintetizadas (sin «Cargando líneas…»)", async () => {
    const db = new MemoryDb({ beta_ticket_lineas: [], erp_productos: [], beta_clientes: [] });
    const map = new Map<string, Row>([
      [skuCode("SUNSU-40"), { sku: "SUNSU-40", producto_servicio: "Facial Reset 3x1 Hidratación Profunda", total_con_iva: 95 }],
      [skuCode("SUNSU-31"), { sku: "SUNSU-31", producto_servicio: "Hollywood Peel", total_con_iva: 15 }],
    ]);
    const filas: Row[] = [
      { id: 2001, so_num: "TK-SO-2001", facial_hecho: "SUNSU-40 Facial", servicios_adicionales: "", estimado: 90, paquete: "", orig: {} },
      { id: 2002, so_num: "TK-SO-2002", facial_hecho: "SUNSU-40 Facial", servicios_adicionales: "SUNSU-31 Peel", estimado: 15, paquete: "SI, 2/3", orig: {} },
    ];
    const items: Row[] = [{ so_num: "TK-SO-2001" }, { so_num: "TK-SO-2002" }];
    await enriquecerItemsLista(db, filas, items, new Map(), { map, canje: (r) => /^\s*SI\b/i.test(String(r.paquete)) });
    const a = items[0].lineas as Row[], b = items[1].lineas as Row[];
    assert.equal(a.length, 1);
    assert.equal(a[0].nombre, "Facial Reset 3x1 Hidratación Profunda", "nombre completo del catálogo");
    assert.equal(a[0].precio_unit, 90, "1 sola línea = lo cobrado");
    assert.equal(a[0].previa, true);
    const fac = b.find((l) => l.tipo === "facial")!, ex = b.find((l) => l.tipo === "extra")!;
    assert.equal(fac.canje, true);
    assert.equal(fac.precio_unit, 0);
    assert.equal(ex.precio_unit, 15);
    assert.equal(lineasSinteticas({ facial_hecho: "", orig: {} }, map, false).length, 0);
    const tk = file("mc-tickets.js");
    assert.match(tk, /lineas: lineasCacheDe\(clave\) \|\| t\.lineas \|\| \[\]/);
    assert.match(tk, /precargar: function \(clave\)/);
    assert.match(tk, /eraPrevia/);
  });
});

describe("TK154 fotitos de la lista en lote y con caché", () => {
  it("fotos_batch devuelve varias miniaturas en una sola llamada y respeta el tope", async () => {
    const { h, db } = semilla({ app_archivos: [
      { id: "f1", mime: "image/jpeg", data_b64: "QUJD" },
      { id: "f2", mime: "image/png", data_b64: "REVG" },
    ] });
    let consultas = 0;
    const orig = db.all.bind(db);
    (db as unknown as { all: (t: string) => Promise<Row[]> }).all = async (t: string) => { if (t === "app_archivos") consultas++; return orig(t); };
    const r = await h("fotos_batch", "and", { ids: ["archivo:f1", "f2", "nope", "f1"] });
    assert.equal(r.ok, true, String(r.error));
    assert.deepEqual(Object.keys(r.items as Row).sort(), ["f1", "f2"]);
    assert.equal(((r.items as Row).f2 as Row).mime, "image/png");
    assert.ok(consultas <= 1, "una sola lectura de app_archivos");
  });

  it("el front pinta desde caché al instante, sin lazy/hidden, y pide las faltantes en UN fotos_batch", () => {
    const screens = file("beta-screens.js");
    const fn = screens.slice(screens.indexOf("function _histThumbsHTML"), screens.indexOf("function _histCardHTML"));
    assert.match(fn, /_fotoThumbGet\(f\.archivo\)/);
    assert.doesNotMatch(fn, /loading="lazy"/);
    assert.doesNotMatch(fn, /alt="" hidden/);
    assert.match(fn, /fetchpriority="high"/);
    assert.match(fn, /api\('fotos_batch',\{ids:L\.slice\(0,60\)\}\)/);
    assert.match(fn, /api\('fotoB64',\{id:id\}\)/, "respaldo de 1 foto si el lote falla");
    assert.match(fn, /sessionStorage\.setItem\(_FOTO_SS\+id/);
    assert.match(fn, /_FOTO_SS_MAX=120/);
    // Sin N+1: fotoB64 solo dentro del respaldo `uno`, no por cada <img>.
    assert.doesNotMatch(fn, /forEach\.call\(imgs, function\(im\)\{[^}]*api\('fotoB64'/);
  });
});

describe("TK154 versión", () => {
  it("caché y motor en TK154", () => {
    assert.match(file("sw.js"), /const CACHE = "sunsu-2026-11-19-TK160"/);
    assert.match(file("index.html"), /window\.SUNSU_CACHE = "sunsu-2026-11-19-TK160"/);
    assert.match(file("supabase/functions/api/sunsu_version.ts"), /sunsu-engine-2026-11-19-TK157/);
  });
});
