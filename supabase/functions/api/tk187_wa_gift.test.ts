// TK187 (WhatsApp que «no envía» en escritorio + Marcar como enviado manual), TK188 (siguiente código de gift card)
// y TK189 (cancelar un ticket que vendió gift card no entierra el código; el ticket nuevo lo reactiva).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle, codigosVentaGift } from "./handlers.ts";
import "./tickets_beta_api.ts";
import "./tickets_lista_api.ts";
import "./tickets_cancelar_api.ts";
import "./gift_beta_api.ts";
import { s, type Row } from "./domain.ts";
import { blancosGift, giftReactivable, siguienteGift } from "./gift_beta.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const file = (f: string) => readFileSync(join(root, f), "utf8");
const TABLAS = [
  "app_modulos", "tickets", "beta_tickets", "beta_ticket_flags", "beta_ticket_cancelados", "beta_cuadre_link", "beta_migo_importes",
  "beta_ticket_envios", "beta_citas_ticket", "log_acciones", "clientas_registro", "beta_clientes", "beta_ticket_lineas", "beta_ticket_snaps",
  "catalogo", "erp_productos", "erp_bodegas", "erp_stock", "erp_movimientos", "beta_sku_alias", "beta_migo_sku_alias", "gift_cards", "paquetes",
  "solicitudes_cambio", "beta_stock_movimientos", "promos", "cabina_inventario", "inventario_base", "beta_migo_borradores", "beta_migo_facturas_vivo",
  "cosmetologas", "cfg_comisiones", "beta_gift_ajustes", "beta_pagos", "envios_tarjetas", "beta_gift_documentos", "beta_gift_digitales",
];
function semilla(gifts: Row[] = []) {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "emi", uid: "u-emi", rol: "super_admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "ale", uid: "u-ale", rol: "recepcion", name: "Alejandra Rodriguez", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  const users = [{ id: "u-emi", nombre: "Emilia", short: "Emilia", rol: "super_admin" }, { id: "u-ale", nombre: "Alejandra Rodriguez", short: "Alejandra", rol: "recepcion" }];
  db.tables.set("app_usuarios", users); db.tables.set("usuarios", users);
  for (const t of TABLAS) if (!db.tables.has(t)) db.tables.set(t, []);
  db.tables.set("gift_cards", gifts);
  db.tables.set("tickets", [{ id: 1941, sheet_row: null, so_num: "TK-SO-1941", timestamp: "2026-11-20T12:11:07Z", atendido_por: "Andrea", nombre: "Gabriela", apellido: "Y", id_3: "1700000028", facial_hecho: "SUNSU-04 Facial Gold-Aging", paquete: "SI, 3/3", estimado: 15, orig: {} }]);
  const c = { db, now: new Date("2026-11-20T19:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (tok: string, a: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok } as never) as Promise<Row>;
  return { db, h };
}
const blank = (id: number, cod: string): Row => ({ id, sheet_row: id + 2, codigo_gc: cod, dia: null, origin: "sheet", orig: {} });
const vendida = (id: number, cod: string, nom = "Otra"): Row => ({ id, sheet_row: id + 2, codigo_gc: cod, dia: 18, mes: 11, ano: 2026, nombre_comprador: nom, origin: "sheet", orig: {} });

describe("TK187 WhatsApp en escritorio: nunca en silencio, nunca saca a la app de su pestaña", () => {
  const wa = file("mc-wa.js");
  it("si el navegador bloquea la ventana (PDFs tardan >5 s) ya no hace location.href = WhatsApp", () => {
    assert.doesNotMatch(wa, /window\.location\.href\s*=\s*u/);
    assert.match(wa, /function abrirUrl\(prep, vent\)/);
    assert.match(wa, /function reservarVentana\(\)/);
    assert.match(wa, /var abierto = abrirUrl\(prep, vent\);[\s\S]*?if \(!abierto\) \{[\s\S]*?aviso\(/);
  });
  it("el envío se registra solo si el chat se abrió; el aviso ofrece «Abrir WhatsApp» y «Marcar como enviado (manual)»", () => {
    assert.match(wa, /Abrir WhatsApp/);
    assert.match(wa, /✓ Marcar como enviado \(manual\)/);
    assert.match(wa, /api\("tk_envio", \{ clave: clave, tipos: tipos, manual: manual \? 1 : 0 \}\)/);
  });
  it("el cuadro sale siempre (también con un solo PDF) con la opción manual; sin teléfono también", () => {
    assert.match(wa, /selector\(disponibles, function \(sel\) \{ seguir\(sel\); \}, function \(sel\) \{ return marcarManual\(clave, sel\); \}\);/);
    assert.match(wa, /titulo: "Sin WhatsApp registrado"/);
  });
  it("tk_envio manual: queda quién y cuándo, el ícono pasa a verde y el detalle dice (manual)", async () => {
    const { db, h } = semilla();
    const r = await h("ale", "tk_envio", { clave: "TK-SO-1941", tipos: ["facial", "paquete"], manual: 1 });
    assert.equal(r.ok, true, String(r.error));
    const env = db.tables.get("beta_ticket_envios")!;
    assert.equal(env.length, 2);
    assert.ok(env.every((e) => e.telefono_fin === "manual" && e.por === "Alejandra Rodriguez" && e.created_at));
    const g = await h("ale", "tk_get", { clave: "TK-SO-1941" });
    const E = (g.envios || []) as Row[];
    assert.ok(E.some((e) => /\(manual\)/.test(s(e.tipo)) && e.por === "Alejandra Rodriguez"), JSON.stringify(E));
  });
  it("manual sin tipo → facial (nunca giftcard, que la tabla no acepta)", async () => {
    const { db, h } = semilla();
    const r = await h("ale", "tk_envio", { clave: "TK-SO-1941", tipos: ["giftcard"], manual: true });
    assert.equal(r.ok, true, String(r.error));
    assert.deepEqual(db.tables.get("beta_ticket_envios")!.map((e) => e.tipo), ["facial"]);
  });
});

describe("TK188 siguiente código de gift card visible (no reserva) y el ticket usa el mismo", () => {
  const rows = [vendida(1, "26-176"), blank(3, "26-178"), blank(2, "26-177"), blank(9, "26-150")];
  rows[3].sheet_row = 999;
  it("gcb_siguiente, «Generar» del ticket (getCodigoGC) y gcb_vender dan el mismo código y no escriben", async () => {
    const { db, h } = semilla(rows.map((r) => ({ ...r })));
    const antes = JSON.stringify(db.tables.get("gift_cards"));
    const sig = await h("ale", "gcb_siguiente");
    const gen = await h("ale", "getCodigoGC");
    assert.equal(sig.codigo, "26-150");
    assert.equal(gen.codigo, sig.codigo, "el ticket usa el mismo código que se muestra");
    assert.equal(JSON.stringify(db.tables.get("gift_cards")), antes, "mostrar/generar no reserva ni escribe");
    assert.deepEqual(blancosGift(rows, "26").map((r) => r.codigo_gc), ["26-150", "26-177", "26-178"]);
    assert.equal(siguienteGift(rows, "26").codigo, "26-150");
  });
  it("UI: «Siguiente código» en Gift Cards y en la venta del ticket (solo lectura)", () => {
    assert.match(file("mc-giftcards.js"), /Siguiente código: <b>/);
    const bs = file("beta-screens.js");
    assert.match(bs, /id="gc-sig-hint" class="gc-sig-hint"/);
    assert.match(bs, /id="gc-sig-hint2" class="gc-sig-hint"/);
    assert.match(bs, /api\('gcb_siguiente',\{\}\)/);
  });
});

describe("TK189 cancelar un ticket que vendió gift card no entierra el código", () => {
  it("cancelar → la gift vuelve a Disponible con el mismo código (respaldo en orig.historial_anulado)", async () => {
    const { db, h } = semilla([vendida(428, "26-176", "Gabriela"), blank(429, "26-177")]);
    db.tables.get("tickets")!.push({ id: 1943, so_num: "TK-SO-1943", timestamp: "2026-11-20T15:00:00Z", nombre: "Gabriela", apellido: "Y", venta_gift: "SI, 26-176", orig: {} });
    const r = await h("emi", "tk_cancelar", { clave: "TK-SO-1943", motivo: "ticket equivocado" });
    assert.equal(r.ok, true, String(r.error));
    const g = db.tables.get("gift_cards")!.find((x) => x.id === 428)!;
    assert.ok(!g.borrado_at); assert.equal(g.dia, null);
    assert.equal(((g.orig as Row).historial_anulado as Row[])[0].ticket, "TK-SO-1943");
    assert.equal((await h("ale", "gcb_siguiente")).codigo, "26-176", "el código liberado se ofrece de nuevo (no se salta)");
  });
  it("ticket nuevo con el MISMO código (anulado a la antigua) → se reactiva la misma fila, sale en Vigentes y el ticket de venta es el nuevo", async () => {
    const { db, h } = semilla([{ ...vendida(428, "26-176", "Gabriela"), borrado_at: "2026-11-20T16:00:00Z", orig: { anulado: true, anulado_por_ticket: "TK-SO-1943" } }, blank(429, "26-177")]);
    db.tables.get("tickets")!.push({ id: 1943, so_num: "TK-SO-1943", timestamp: "2026-11-20T15:00:00Z", nombre: "Gabriela", venta_gift: "SI, 26-176", orig: { cancelado: true, anulado: true } });
    assert.equal(giftReactivable(db.tables.get("gift_cards")!, "26-176")!.id, 428);
    const r = await h("ale", "crearTicket", { nombre: "Gabriela", apellido: "Y", cedula: "1700000028", estimado: 65, cosmetologa: "Alejandra Rodriguez", colS: "SI, 26-176" });
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.gc_error, undefined);
    assert.deepEqual(r.gc_venta, [{ codigo: "26-176", accion: "reactivada" }]);
    const gs = db.tables.get("gift_cards")!.filter((x) => x.codigo_gc === "26-176");
    assert.equal(gs.length, 1, "no se crea otra fila ni otro código");
    assert.ok(!gs[0].borrado_at); assert.equal(gs[0].nombre_comprador, "Gabriela"); assert.equal(Number(gs[0].dia), 20);
    const lista = await h("emi", "gcb_lista", { estado: "vigentes" });
    assert.ok(((lista.items || []) as Row[]).some((x) => x.codigo === "26-176"), "aparece en Vigentes");
    const det = await h("emi", "gcb_get", { id: 428 });
    assert.equal(s((det.item as Row).ticketVenta), s(r.so_num), "ticket de venta = el nuevo, no el cancelado");
  });
  it("registrarGC (navegador) también reactiva en vez de «Código no encontrado»", async () => {
    const { db, h } = semilla([{ ...vendida(428, "26-176", "Gabriela"), borrado_at: "2026-11-20T16:00:00Z", orig: { anulado: true, anulado_por_ticket: "TK-SO-1943" } }]);
    const r = await h("ale", "registrarGC", { codigo: "26-176", nombre: "Gabriela", apellido: "Y", cedula: "1700000028" });
    assert.equal(r.ok, true, String(r.error));
    assert.ok(!db.tables.get("gift_cards")![0].borrado_at);
  });
  it("crearTicket registra en el servidor un código escrito a mano (sin «Generar») y no deja el código colgado", async () => {
    const { db, h } = semilla([blank(429, "26-177")]);
    const r = await h("ale", "crearTicket", { nombre: "Ana", apellido: "B", cedula: "1711111111", estimado: 65, cosmetologa: "Alejandra Rodriguez", colS: "SI, 26-177" });
    assert.equal(r.ok, true, String(r.error));
    const g = db.tables.get("gift_cards")!.find((x) => x.id === 429)!;
    assert.equal(g.nombre_comprador, "Ana"); assert.equal(Number(g.dia), 20);
  });
  it("crearTicket avisa (no guarda) si el código ya está vendido a OTRA persona", async () => {
    const { db, h } = semilla([vendida(427, "26-175", "Lucía")]);
    const n0 = db.tables.get("tickets")!.length;
    const r = await h("ale", "crearTicket", { nombre: "Ana", apellido: "B", estimado: 65, cosmetologa: "Alejandra Rodriguez", colS: "SI, 26-175" });
    assert.match(String(r.error), /26-175 ya está vendida a Lucía/);
    assert.equal(db.tables.get("tickets")!.length, n0);
  });
  it("codigosVentaGift lee «SI, 26-176» y nada si es NO", () => {
    assert.deepEqual(codigosVentaGift("SI, 26-176"), ["26-176"]);
    assert.deepEqual(codigosVentaGift("NO"), []);
  });
});

describe("TK187 causa: el cuadro de WhatsApp no tenía CSS en la lista de escritorio", () => {
  it("mc-wa.js inyecta su propio CSS al abrir el cuadro o el aviso (no depende de abrir un ticket)", () => {
    const wa = file("mc-wa.js");
    assert.match(wa, /function cssWa\(\)/);
    assert.match(wa, /function selector\(tipos, onSend, onManual\) \{\s*cerrarSel\(\); cssWa\(\);/);
    assert.match(wa, /function aviso\(opts\) \{\s*cerrarSel\(\); cssWa\(\);/);
    assert.match(wa, /\.mctk-wa-sel\{position:fixed;inset:0/);
  });
});
