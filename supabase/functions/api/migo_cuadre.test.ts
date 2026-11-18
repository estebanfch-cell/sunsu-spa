import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./tickets_beta_api.ts";
import "./migo_cuadre_api.ts";
import { cruzar, esConsumidorFinal, esperandoFacturaLunes, exentoCuadre, facSeq, fechaGye, flagsDeseadas, formaDeTicket, idFlag, namesMatch, NUNCA_TICKET_ID, type FacturaVivo } from "./migo_cuadre.ts";
import { docsBeta, faltaDe } from "./tickets_beta_api.ts";
import type { Row } from "./domain.ts";

describe("cruce Migo (solo lectura)", () => {
  it("lee el secuencial 2951.0 y compara nombres sin tildes", () => {
    assert.equal(facSeq("2951.0"), 2951);
    assert.equal(facSeq("001-001-000002951"), 2951);
    assert.equal(facSeq("SIN FACTURA"), null);
    assert.ok(namesMatch("Nayeli Rodríguez", "NAYELI RODRIGUEZ") >= 2);
    assert.equal(namesMatch("Camila Cadena", "BENMAR SAS"), 0);
    assert.equal(esConsumidorFinal("CONSUMIDOR FINAL"), true);
    assert.equal(fechaGye("2026-11-17T16:00:00Z"), "2026-11-17"); // 11:00 GYE
    assert.equal(exentoCuadre({ fac_7: "SIN FACTURA", cob: true, comp: "Canje" }), true);
    assert.equal(exentoCuadre({ fac_7: "", cob: true, comp: "Tarje:953", paquete: "SI, 1/3" }), false);
  });
  it("une por número (varios tickets en una factura) y por nombre+fecha+monto", () => {
    const facs: FacturaVivo[] = [
      { factura: "001-001-000002918", seq: 2918, fecha: "2026-11-10", cliente: "JERVIS ESTEFANIA", total: 132.82 },
      { factura: "001-001-000002951", seq: 2951, fecha: "2026-11-17", cliente: "CAMILA CADENA", total: 65 },
    ];
    const tickets: Row[] = [
      { id: 1831, fecha: "2026-11-10", nombre: "Jose Ignacio", apellido: "Miño", estimado: 80, fac_7: "2918.0", cob: true },
      { id: 1832, fecha: "2026-11-10", nombre: "Estefania", apellido: "Jervis", estimado: 15, fac_7: "2918.0", cob: true },
      { id: 1886, fecha: "2026-11-17", nombre: "Camila", apellido: "Cadena", estimado: 65, fac_7: "", cob: true },
    ];
    const L = cruzar(facs, tickets);
    assert.equal(L.filter((x) => x.factura.endsWith("2918")).length, 2);
    assert.equal(L.find((x) => x.ticket_id === 1831)!.estado, "diferencia");
    assert.equal(L.find((x) => x.ticket_id === 1831)!.diferencia_monto, -37.82);
    const cam = L.find((x) => x.ticket_id === 1886)!;
    assert.equal(cam.tipo, "nombre_fecha_monto");
    assert.equal(cam.estado, "cuadra");
  });

  it("une tickets no cobrados por nombre+fecha+monto (2+ tokens); no mezcla Prado $65", () => {
    const facs: FacturaVivo[] = [
      { factura: "001-001-000002961", seq: 2961, fecha: "2026-11-17", cliente: "Maria Gracia Arellano", total: 15, forma: "tarjeta" },
      { factura: "001-001-000002962", seq: 2962, fecha: "2026-11-17", cliente: "Verónica Prado", total: 65, forma: "tarjeta" },
      { factura: "001-001-000002959", seq: 2959, fecha: "2026-11-17", cliente: "Carolina Cadena", total: 52.82, forma: "tarjeta" },
    ];
    const tickets: Row[] = [
      { id: 1898, fecha: "2026-11-17", nombre: "María Gracia", apellido: "Arellano", estimado: 15, fac_7: "", cob: false },
      { id: 1905, fecha: "2026-11-17", nombre: "Juan Martín Hajj", apellido: "Prado", estimado: 65, fac_7: "", cob: false },
      { id: 1897, fecha: "2026-11-17", nombre: "Carolina", apellido: "Cadena", estimado: 15, fac_7: "", cob: false },
    ];
    const L = cruzar(facs, tickets);
    assert.equal(L.find((x) => x.ticket_id === 1898)?.factura, "001-001-000002961");
    assert.equal(L.find((x) => x.ticket_id === 1905), undefined);
    assert.equal(L.find((x) => x.ticket_id === 1897), undefined); // $15 vs $52.82
    assert.equal(formaDeTicket({ comp: "Trans:24255919" }), "transferencia");
    assert.equal(formaDeTicket({ comp: "" }, { forma_pago: "tarjeta" }), "tarjeta");
    assert.equal(formaDeTicket({ comp: "Trans:1, Tarje:2" }), "mixto");
  });
  it("rojo: diferencia de monto, clienta distinta, o cobrado sin factura al cerrar el día; nunca el #1820; no marca si el import está atrasado", () => {
    const facs: FacturaVivo[] = [
      { factura: "001-001-000002951", seq: 2951, fecha: "2026-11-17", cliente: "OTRA PERSONA", total: 50 },
    ];
    const tickets: Row[] = [
      { id: 1886, clave: "TK-SO-1893", fecha: "2026-11-17", nombre: "Camila", apellido: "Cadena", estimado: 65, fac_7: "2951.0", cob: true },
      { id: 1902, clave: "TK-SO-1902", fecha: "2026-11-17", nombre: "Paola", apellido: "Urvano", estimado: 224.99, fac_7: "", cob: true },
      { id: 1901, clave: "TK-SO-1901", fecha: "2026-11-17", nombre: "Nataly", apellido: "Reina", estimado: 43.99, fac_7: "", cob: false },
      { id: NUNCA_TICKET_ID, clave: "TK-SO-1827", fecha: "2026-11-09", nombre: "Camila", apellido: "Cadena", estimado: 95, fac_7: "", cob: true },
      { id: 1896, clave: "TK-SO-1896", fecha: "2026-11-17", nombre: "Nayeli", apellido: "Rodríguez", estimado: 271.5, fac_7: "2957.0", cob: true },
      { id: 1900, clave: "TK-SO-1900", fecha: "2026-11-17", nombre: "Sunsu", apellido: "Spa", estimado: 0, fac_7: "SIN FACTURA", cob: true, comp: "Canje" },
    ];
    const links = cruzar(facs, tickets);
    const flags = flagsDeseadas({ tickets, links, facturas: facs, hoyGye: "2026-11-18", importadoGye: "2026-11-18" });
    const kinds = (id: number) => flags.filter((f) => f.ticket_id === id).map((f) => f.kind).sort();
    assert.deepEqual(kinds(1886), ["clienta", "monto"]);
    assert.deepEqual(kinds(1902), ["sinfac"]);
    assert.deepEqual(kinds(1901), []); // no cobrado
    assert.deepEqual(kinds(NUNCA_TICKET_ID), []);
    assert.deepEqual(kinds(1896), []); // 2957 > máximo importado 2951 → import atrasado
    assert.deepEqual(kinds(1900), []); // canje / SIN FACTURA
    const flagsStale = flagsDeseadas({ tickets, links, facturas: facs, hoyGye: "2026-11-18", importadoGye: "2026-11-17" });
    assert.equal(flagsStale.some((f) => f.ticket_id === 1902 && f.kind === "sinfac"), false);
    assert.equal(idFlag(1902, "sinfac"), "migo:1902:sinfac");
  });

  it("ticket del lunes cobrado sin factura: Pendiente por lunes hasta el cierre del martes; rojo desde el miércoles", () => {
    assert.equal(esperandoFacturaLunes("2026-11-16", "2026-11-16"), true);
    assert.equal(esperandoFacturaLunes("2026-11-16", "2026-11-17"), true);
    assert.equal(esperandoFacturaLunes("2026-11-16", "2026-11-18"), false);
    assert.equal(esperandoFacturaLunes("2026-11-17", "2026-11-18"), false);
    const facs: FacturaVivo[] = [];
    const tickets: Row[] = [
      { id: 1880, clave: "TK-SO-1880", fecha: "2026-11-16", nombre: "Ana", apellido: "Lunes", estimado: 20, fac_7: "", cob: true },
      { id: 1890, clave: "TK-SO-1890", fecha: "2026-11-17", nombre: "Beto", apellido: "Martes", estimado: 20, fac_7: "", cob: true },
    ];
    const links = cruzar(facs, tickets);
    const martes = flagsDeseadas({ tickets, links, facturas: facs, hoyGye: "2026-11-17", importadoGye: "2026-11-17" });
    assert.equal(martes.some((f) => f.ticket_id === 1880 && f.kind === "sinfac"), false);
    assert.equal(martes.some((f) => f.ticket_id === 1890 && f.kind === "sinfac"), false); // el 17 aún no cierra el 17
    const mie = flagsDeseadas({ tickets, links, facturas: facs, hoyGye: "2026-11-18", importadoGye: "2026-11-18" });
    assert.equal(mie.some((f) => f.ticket_id === 1880 && f.kind === "sinfac"), true);
    assert.equal(mie.some((f) => f.ticket_id === 1890 && f.kind === "sinfac"), true);
  });
  it("amarillo (TK41: tarjeta desde hoy pide foto): voucher de tarjeta o foto de transferencia; efectivo no; ya no pide número de factura", () => {
    const rTar = { timestamp: "2026-11-18T12:00:00Z", comp: "Tarje:953", comprobante: "", cob: true, fac: true, fac_7: "2957.0" };
    assert.deepEqual(faltaDe(rTar, {}), ["Foto del comprobante de pago (transferencia o voucher de tarjeta)"]);
    assert.deepEqual(faltaDe(rTar, { comprobantes: [{ url: "archivo:1" }] }), []);
    const rTr = { timestamp: "2026-11-17T16:00:00Z", comp: "Trans:24255919", comprobante: "", cob: true, fac: true, fac_7: "2951.0" };
    assert.deepEqual(faltaDe(rTr, {}), ["Foto del comprobante de pago (transferencia o voucher de tarjeta)"]);
    assert.deepEqual(faltaDe({ timestamp: "2026-11-17T16:00:00Z", comp: "Efect:10", cob: true, fac: true, fac_7: "2950.0" }, {}), []);
    assert.deepEqual(faltaDe({ timestamp: "2026-11-17T16:00:00Z", comp: "Tarje:1", cob: true, fac: false, fac_7: "", comprobante: "https://x/y" }, {}), []);
  });
});

describe("API migo_importar / migo_cuadre_hora", () => {
  it("importa facturas, crea y luego resuelve marcas (nunca el 1820)", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }]);
    db.tables.set("tickets", [
      { id: 1886, sheet_row: 1887, so_num: "TK-SO-1893", timestamp: "2026-11-17T11:55:00Z", nombre: "Camila", apellido: "Cadena", estimado: 65, fac: true, fac_7: "2951.0", cob: true, comp: "Trans:1", orig: {} },
      { id: 1902, sheet_row: 1895, so_num: "TK-SO-1902", timestamp: "2026-11-17T18:00:00Z", nombre: "Paola", apellido: "Urvano", estimado: 224.99, cob: true, fac: false, fac_7: "", comp: "Tarje:1", orig: {} },
      { id: 1820, sheet_row: 1821, so_num: "TK-SO-1827", timestamp: "2026-11-09T15:00:00Z", nombre: "Camila", apellido: "Cadena", estimado: 95, cob: true, fac: false, fac_7: "", orig: {} },
    ]);
    db.tables.set("beta_ticket_flags", [{ id: "migo:1820:sinfac", ticket_id: 1820, ticket_clave: "TK-SO-1827", motivo: "Sin factura", fuente: "migo", resuelto: false }]);
    db.tables.set("beta_migo_facturas_vivo", []);
    db.tables.set("beta_migo_importes", []);
    db.tables.set("beta_cuadre_link", []);
    db.tables.set("log_acciones", []);
    const ctx = { db, now: new Date("2026-11-18T12:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, token: "adm", legacyLogin: async () => ({}) };
    const r = await handle("migo_importar", { token: "adm", fecha_desde: "2026-11-01", fecha_hasta: "2026-11-17", facturas: [
      { factura: "001-001-000002951", fecha: "2026-11-17", cliente: "CAMILA CADENA", total: 65 },
    ] }, ctx) as Row;
    assert.equal(r.ok, true, String(r.error));
    const flags = db.tables.get("beta_ticket_flags")!;
    assert.equal(flags.some((f) => String(f.id) === "migo:1902:sinfac" && f.resuelto !== true), true);
    assert.equal(flags.filter((f) => f.ticket_id === 1820 && f.resuelto !== true).length, 1);
    assert.equal(flags.some((f) => f.ticket_id === 1886 && f.resuelto !== true && String(f.id).includes("monto")), false);
    // Segundo import: Paola ya tiene factura que cuadra → se resuelve sola.
    const r2 = await handle("migo_importar", { token: "adm", fecha_desde: "2026-11-01", fecha_hasta: "2026-11-18", facturas: [
      { factura: "001-001-000002951", fecha: "2026-11-17", cliente: "CAMILA CADENA", total: 65 },
      { factura: "001-001-000002960", fecha: "2026-11-18", cliente: "PAOLA URVANO", total: 224.99 },
    ] }, ctx) as Row;
    assert.equal(r2.ok, true, String(r2.error));
    const flags2 = db.tables.get("beta_ticket_flags")!;
    const paola = flags2.find((f) => String(f.id) === "migo:1902:sinfac")!;
    assert.equal(paola.resuelto, true);
    assert.equal(flags2.filter((f) => f.ticket_id === 1820 && f.resuelto !== true).length, 1);
    const cabs = db.tables.get("beta_tickets") || [];
    const camila = cabs.find((c) => String(c.clave).includes("1893"));
    assert.ok(camila, "debe escribir datos beta de Camila");
    const dCam = (camila!.datos || {}) as Row;
    assert.equal(dCam.factura, "001-001-000002951");
    assert.equal(dCam.forma_pago, "transferencia");
    assert.equal((dCam.pago_migo as Row).fuente, "migo");
    const paolaCab = cabs.find((c) => String(c.clave).includes("1902"));
    assert.equal(((paolaCab!.datos || {}) as Row).factura, "001-001-000002960");
    assert.equal(cabs.some((c) => String(c.clave).includes("1827")), false);
  });
});

describe("borradores de factura sin ticket", () => {
  it("crea un borrador Pendiente de aprobar cuando la factura no tiene ticket, y lo ofrece al crear uno después", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }]);
    db.tables.set("tickets", []);
    db.tables.set("beta_tickets", []);
    db.tables.set("beta_ticket_flags", []);
    db.tables.set("beta_ticket_cancelados", []);
    db.tables.set("beta_migo_facturas_vivo", []);
    db.tables.set("beta_migo_importes", []);
    db.tables.set("beta_cuadre_link", []);
    db.tables.set("beta_migo_borradores", []);
    db.tables.set("beta_acuity_calendars", [{ calendar_id: 11689550, nombre: "Andrea", persona: "Andrea Robles", activo: true }]);
    db.tables.set("log_acciones", []);
    const ctx = { db, now: new Date("2026-11-18T12:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, token: "adm", legacyLogin: async () => ({}) };
    const r = await handle("migo_importar", { token: "adm", fecha_desde: "2026-11-17", fecha_hasta: "2026-11-17", facturas: [
      { factura: "001-001-000002959", fecha: "2026-11-17", cliente: "MARIA PEREZ", total: 80, forma: "Tarjeta" },
    ] }, ctx) as Row;
    assert.equal(r.ok, true, String(r.error));
    const bor = db.tables.get("beta_migo_borradores")!;
    assert.equal(bor.length, 1);
    assert.equal(bor[0].factura, "001-001-000002959");
    assert.equal(bor[0].estado, "pendiente"); // sin cita de Acuity → bandeja admin
    assert.equal(bor[0].total, 80);
    const lista = await handle("migo_borradores_lista", { token: "adm" }, ctx) as Row;
    assert.equal((lista.bandeja as Row[]).length, 1);
    const asg = await handle("migo_borrador_asignar", { token: "adm", factura: "2959", asignado_a: "Andrea Robles" }, ctx) as Row;
    assert.equal(asg.ok, true, String(asg.error));
    assert.equal(db.tables.get("beta_migo_borradores")![0].estado, "asignado");
    const oferta = await handle("crearTicket", { token: "adm", nombre: "Maria", apellido: "Perez", estimado: 80, cosmetologa: "Andrea Robles" }, ctx) as Row;
    assert.equal(oferta.requiere, "vincular_borrador");
    assert.equal((oferta.borrador as Row).factura, "001-001-000002959");
  });
  it("el cron con clave corre el import sin sesión de persona (la clave no se imprime)", async () => {
    const db = new MemoryDb();
    db.tables.set("tickets", []);
    db.tables.set("beta_ticket_flags", []);
    db.tables.set("beta_migo_facturas_vivo", []);
    db.tables.set("beta_migo_importes", []);
    db.tables.set("beta_cuadre_link", []);
    db.tables.set("beta_migo_borradores", []);
    db.tables.set("log_acciones", []);
    const ctx = { db, now: new Date("2026-11-18T12:00:00Z"), env: { MIGO_CRON_KEY: "x".repeat(20) } as Record<string, string | undefined>, fetchImpl: fetch, token: "", legacyLogin: async () => ({}) };
    const bad = await handle("migo_importar", { facturas: [{ factura: "001-001-000002951", fecha: "2026-11-17", cliente: "CAMILA CADENA", total: 65 }] }, ctx) as Row;
    assert.equal(bad.error, "Inicia sesión");
    const ok = await handle("migo_importar", { cron_key: "x".repeat(20), facturas: [{ factura: "001-001-000002951", fecha: "2026-11-17", cliente: "CAMILA CADENA", total: 65 }] }, ctx) as Row;
    assert.equal(ok.ok, true, String(ok.error));
    assert.equal((db.tables.get("beta_migo_facturas_vivo") || []).length, 1);
  });
});

function sId(f: Row, id: string): boolean {
  return String(f.id) === id && f.resuelto !== true;
}

describe("PDF de factura Migo", () => {

  it("adjunta el PDF de la factura al ticket vinculado y lo lista en documentos", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }]);
    db.tables.set("tickets", [
      { id: 1886, sheet_row: 1887, so_num: "TK-SO-1893", timestamp: "2026-11-17T11:55:00Z", nombre: "Camila", apellido: "Cadena", estimado: 65, fac: true, fac_7: "2951.0", cob: true, comp: "Trans:1", orig: {} },
    ]);
    db.tables.set("beta_tickets", []);
    db.tables.set("beta_ticket_flags", []);
    db.tables.set("beta_migo_facturas_vivo", [{ factura: "001-001-000002951", seq: 2951, fecha: "2026-11-17", cliente: "CAMILA CADENA", total: 65 }]);
    db.tables.set("beta_cuadre_link", [{ ticket_id: 1886, factura: "001-001-000002951", tipo: "numero", confianza: "alta", estado: "cuadra" }]);
    db.tables.set("app_archivos", []);
    db.tables.set("log_acciones", []);
    const ctx = { db, now: new Date("2026-11-18T12:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, token: "adm", legacyLogin: async () => ({}) };
    const data = "data:application/pdf;base64,JVBERi0xLjE="; // %PDF-1.1
    const r = await handle("migo_adjuntar_pdfs", { token: "adm", pdfs: [{ factura: "001-001-000002951", data }] }, ctx) as Row;
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.adjuntos, 1);
    assert.equal(r.tickets, 1);
    const cab = (db.tables.get("beta_tickets") || []).find((c) => String(c.clave).includes("1893"))!;
    const pdf = ((cab.datos as Row).factura_pdf) as Row;
    assert.match(String(pdf.url), /^archivo:/);
    const docs = docsBeta(cab);
    assert.equal(docs[0].tipo, "factura");
    assert.match(String(docs[0].nombre), /001-001-000002951/);
    const arch = db.tables.get("app_archivos") || [];
    assert.equal(arch.length, 1);
    assert.equal(arch[0].kind, "factura_migo");
    // #1820 nunca
    assert.equal((db.tables.get("beta_tickets") || []).some((c) => String(c.clave).includes("1827")), false);
  });
});

import { readFileSync } from "node:fs";
describe("Historial forma de pago (TK38)", () => {
  it("columna entre Cosmetóloga y Subtotal, pill Pagado en Migo, caché tk38", () => {
    const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const html = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    assert.match(js, /k:'fpago',t:'💳 Forma de pago'/);
    assert.match(js, /k:'cos'[\s\S]{0,180}k:'fpago'[\s\S]{0,180}k:'sub'/);
    assert.match(js, /Pagado en Migo/);
    assert.match(js, /Pendiente por lunes/);
    assert.match(js, /function _tkFormaPill/);
    assert.match(js, /function _tkFacPdf/);
    const tk = readFileSync(new URL("../../../mc-tickets.js", import.meta.url), "utf8");
    assert.match(tk, /Ver factura/);
    assert.match(html, /beta-screens\.js\?v=20261118tk\d+/);
  });
});
