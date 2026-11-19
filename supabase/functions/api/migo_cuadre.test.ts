import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./tickets_beta_api.ts";
import "./migo_cuadre_api.ts";
import { candidatosParaFactura, cruzar, ticketClaveValida, esConsumidorFinal, esperandoFacturaLunes, estadoBorrador, borradorSePuedeVincular, exentoCuadre, facSeq, fechaGye, fechasCandidatasBorrador, flagsDeseadas, formaDeTicket, idFlag, mensajeNoVincula, namesMatch, NUNCA_TICKET_ID, type FacturaVivo } from "./migo_cuadre.ts";
import { docsBeta, faltaDe } from "./tickets_beta_api.ts";
import type { Row } from "./domain.ts";

describe("cruce Migo (solo lectura)", () => {
  it("acepta pendiente / asignado / pendiente por aprobar y rechaza estados finales", () => {
    assert.equal(estadoBorrador("Pendiente por aprobar"), "pendiente_por_aprobar");
    assert.equal(estadoBorrador("pendiente_aprobar"), "pendiente_aprobar");
    assert.equal(borradorSePuedeVincular("pendiente"), true);
    assert.equal(borradorSePuedeVincular("asignado"), true);
    assert.equal(borradorSePuedeVincular("pendiente_aprobar"), true);
    assert.equal(borradorSePuedeVincular("pendiente por aprobar"), true);
    assert.equal(borradorSePuedeVincular("vinculado"), false);
    assert.equal(borradorSePuedeVincular("aprobado"), false);
    assert.equal(borradorSePuedeVincular("descartado"), false);
    assert.match(mensajeNoVincula("vinculado", ["TK-SO-1899", "TK-SO-1901", "TK-SO-1902"]), /ya está vinculada a TK-SO-1899 \+ TK-SO-1901 \+ TK-SO-1902/);
  });

  it("lee el secuencial 2951.0 y compara nombres sin tildes", () => {
    assert.equal(facSeq("2951.0"), 2951);
    assert.equal(facSeq("001-001-000002951"), 2951);
    assert.equal(facSeq("SIN FACTURA"), null);
    assert.ok(namesMatch("Nayeli Rodríguez", "NAYELI RODRIGUEZ") >= 2);
    assert.equal(namesMatch("Camila Cadena", "BENMAR SAS"), 0);
    assert.equal(esConsumidorFinal("CONSUMIDOR FINAL"), true);
    assert.equal(fechaGye("2026-11-17T16:00:00Z"), "2026-11-17"); // 11:00 GYE
    assert.equal(exentoCuadre({ fac_7: "SIN FACTURA", cob: true, comp: "Canje" }), true);
    assert.equal(exentoCuadre({ fac_7: "", cob: true, comp: "Tarje:953", paquete: "SI, 1/3", estimado: 80 }), false);
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
  it("rojo: diferencia de monto, o cobrado sin factura al cerrar el día; nunca el #1820; no marca si el import está atrasado", () => {
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
    assert.deepEqual(kinds(1886), ["monto"]); // TK84: factura a otro nombre ya no es flag
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
    const resumen = ((r.cuadre as Row)?.resumen || {}) as Row;
    const flagsNuevas = (resumen.flags as Row[]) || [];
    assert.ok(flagsNuevas.some((f) => f.ticket === "TK-SO-1902" && f.color === "rojo" && String(f.motivo).includes("Sin factura") && !f.factura), "resumen debe listar la flag nueva de Paola");
    assert.equal(flagsNuevas.some((f) => String(f.ticket).includes("1827") || String(f.ticket).includes("1820")), false, "el 1820 no es novedad de esta corrida");
    const porF = (resumen.por_facturar as Row[]) || [];
    assert.ok(porF.some((x) => x.ticket === "TK-SO-1902"), "Paola queda por facturar");
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


describe("candidatos de bandeja para vincular un borrador", () => {
  it("el martes incluye tickets del lunes; ordena por nombre, monto exacto y suma de 2", () => {
    assert.deepEqual(fechasCandidatasBorrador("2026-11-17"), ["2026-11-16", "2026-11-17"]);
    assert.deepEqual(fechasCandidatasBorrador("2026-11-18"), ["2026-11-18"]);
    const inv = { fecha: "2026-11-17", cliente: "VERONICA PRADO", total: 65 };
    const tickets: Row[] = [
      { id: 1897, clave: "TK-SO-1905", fecha: "2026-11-17", nombre: "Juan Martín", apellido: "Hajj Prado", estimado: 65, fac_7: "", atendido_por: "Andrea Robles" },
      { id: 1886, clave: "TK-SO-1893", fecha: "2026-11-17", nombre: "Camila", apellido: "Cadena", estimado: 65, fac_7: "001-001-000002951" },
      { id: 1801, clave: "TK-SO-1801", fecha: "2026-11-16", nombre: "Ana", apellido: "Lunes", estimado: 30, fac_7: "" },
      { id: 1802, clave: "TK-SO-1802", fecha: "2026-11-16", nombre: "Beto", apellido: "Lunes", estimado: 35, fac_7: "" },
      { id: 1999, clave: "TK-SO-1999", fecha: "2026-11-17", nombre: "Veronica", apellido: "Prado Extra", estimado: 10, fac_7: "" },
      { id: NUNCA_TICKET_ID, clave: "TK-SO-1827", fecha: "2026-11-17", nombre: "Veronica", apellido: "Prado", estimado: 65, fac_7: "" },
    ];
    const C = candidatosParaFactura(inv, tickets);
    assert.equal(C.some((c) => c.claves.includes("TK-SO-1893")), false);
    assert.equal(C.some((c) => c.ticket_ids.includes(NUNCA_TICKET_ID)), false);
    const suma = C.find((c) => c.tipo === "suma2" && c.claves.includes("TK-SO-1801") && c.claves.includes("TK-SO-1802"))!;
    assert.ok(suma); assert.equal(suma.cuadra, true);
    const monto = C.find((c) => c.claves.length === 1 && c.claves[0] === "TK-SO-1905")!;
    assert.ok(monto && monto.cuadra, "1905 entra por monto, no se autoelige");
    assert.match(monto.motivo, /no es el mismo|coinciden/i);
    const nom = C.find((c) => c.claves[0] === "TK-SO-1999" && c.tipo === "nombre")!;
    assert.ok(nom && nom.cuadra === false);
    assert.ok(C.indexOf(suma) < C.indexOf(nom), "los que cuadran van antes que los que no");
    assert.ok(C.indexOf(monto) < C.indexOf(nom));
  });
  it("2960: suma de 3 (Paola + familia Reina) cuadra a 1 centavo y va primero; oculta r1899", () => {
    const inv = { fecha: "2026-11-17", cliente: "PAOLA URVANO", total: 326.97 };
    const tickets: Row[] = [
      { id: 1894, clave: "TK-SO-1902", fecha: "2026-11-17", nombre: "Paola", apellido: "Urvano", estimado: 224.991, fac_7: "", atendido_por: "Daniela Mora" },
      { id: 1891, clave: "TK-SO-1899", fecha: "2026-11-17", nombre: "Isabella", apellido: "Reina", estimado: 57.982, fac_7: "", atendido_por: "Daniela Mora" },
      { id: 1893, clave: "TK-SO-1901", fecha: "2026-11-17", nombre: "Nataly", apellido: "Reina", estimado: 43.989999985, fac_7: "", atendido_por: "Daniela Mora" },
      { id: 1898, clave: "r1899", sheet_row: 1899, fecha: "", nombre: "", apellido: "", estimado: 0, fac_7: "" },
    ];
    assert.equal(ticketClaveValida(tickets[3]), false);
    const C = candidatosParaFactura(inv, tickets);
    assert.equal(C.some((c) => c.claves.includes("r1899") || c.claves.some((k) => /^r\d+$/i.test(k))), false);
    const tres = C.find((c) => c.tipo === "suma3" && c.claves.includes("TK-SO-1902") && c.claves.includes("TK-SO-1899") && c.claves.includes("TK-SO-1901"))!;
    assert.ok(tres && tres.cuadra, "224.99+57.98+43.99 = 326.96 cuadra a 1 centavo");
    assert.ok(Math.abs(tres.diferencia) <= 0.05);
    assert.match(tres.motivo, /✅|Cuadra/i);
    assert.match(tres.motivo, /familia|Reina/i);
    assert.equal(C[0].tipo, "suma3");
    const solo = C.find((c) => c.claves.length === 1 && c.claves[0] === "TK-SO-1902")!;
    assert.ok(solo && solo.cuadra === false);
    assert.match(solo.motivo, /No cuadra|diferencia/i);
    assert.ok(C.indexOf(tres) < C.indexOf(solo));
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

  it("tras asignar sigue en la bandeja, propone el ticket y al vincular solo escribe la beta (no Sheets)", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }]);
    db.tables.set("tickets", [
      { id: 1897, sheet_row: 1898, so_num: "TK-SO-1905", timestamp: "2026-11-17T16:00:00Z", nombre: "Juan Martín", apellido: "Hajj Prado", estimado: 65, cob: true, fac: false, fac_7: "", comp: "", atendido_por: "Andrea Robles", orig: {} },
    ]);
    db.tables.set("beta_tickets", []);
    db.tables.set("beta_ticket_flags", []);
    db.tables.set("beta_ticket_cancelados", []);
    db.tables.set("beta_migo_facturas_vivo", []);
    db.tables.set("beta_migo_importes", []);
    db.tables.set("beta_cuadre_link", []);
    db.tables.set("beta_migo_borradores", []);
    db.tables.set("beta_acuity_calendars", []);
    db.tables.set("log_acciones", []);
    const ctx = { db, now: new Date("2026-11-18T15:42:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, token: "adm", legacyLogin: async () => ({}) };
    const r = await handle("migo_importar", { token: "adm", fecha_desde: "2026-11-17", fecha_hasta: "2026-11-17", facturas: [
      { factura: "001-001-000002962", fecha: "2026-11-17", cliente: "VERONICA PRADO", total: 65, forma: "Tarjeta" },
    ] }, ctx) as Row;
    assert.equal(r.ok, true, String(r.error));
    const bor0 = db.tables.get("beta_migo_borradores")!.find((b) => String(b.factura).includes("2962"))!;
    assert.equal(bor0.estado, "pendiente");
    assert.equal(bor0.ticket_clave, undefined);
    const asg = await handle("migo_borrador_asignar", { token: "adm", factura: "2962", asignado_a: "Andrea" }, ctx) as Row;
    assert.equal(asg.ok, true, String(asg.error));
    const lista = await handle("migo_borradores_lista", { token: "adm" }, ctx) as Row;
    const bandeja = lista.bandeja as Row[];
    assert.equal(bandeja.length, 1, "la asignada sin ticket no desaparece de la bandeja de admin");
    assert.equal(bandeja[0].estado, "asignado");
    const cands = bandeja[0].candidatos as Row[];
    const monto = cands.find((c) => (c.claves as string[]).includes("TK-SO-1905"));
    assert.ok(monto, "propone 1905 por monto exacto");
    assert.ok(monto!.tipo === "monto" || monto!.tipo === "nombre_monto");
    assert.equal(cands.some((c) => (c.ticket_ids as number[]).includes(1820)), false);
    db.tables.get("tickets")!.push({ id: 1820, sheet_row: 1821, so_num: "TK-SO-1827", timestamp: "2026-11-17T16:00:00Z", nombre: "Veronica", apellido: "Prado", estimado: 65, cob: true, fac: false, fac_7: "", orig: {} });
    const bad = await handle("migo_borrador_vincular", { token: "adm", factura: "2962", tickets: ["TK-SO-1827"] }, ctx) as Row;
    assert.match(String(bad.error || ""), /no se vincula/i);
    const vinc = await handle("migo_borrador_vincular", { token: "adm", factura: "2962", tickets: ["TK-SO-1905"] }, ctx) as Row;
    assert.equal(vinc.ok, true, String(vinc.error));
    assert.equal(vinc.ticket_clave, "TK-SO-1905");
    const tk = db.tables.get("tickets")!.find((x) => x.id === 1897)!;
    assert.equal(tk.fac_7, "");
    assert.equal(tk.fac, false);
    const cab = (db.tables.get("beta_tickets") || []).find((c) => String(c.clave).includes("1905"))!;
    assert.equal((cab.datos as Row).factura, "001-001-000002962");
    const after = await handle("migo_borradores_lista", { token: "adm" }, ctx) as Row;
    assert.equal((after.bandeja as Row[]).length, 0);
    const vins = after.vinculados as Row[];
    assert.equal(vins[0].ticket_clave, "TK-SO-1905");
    const bus = await handle("migo_borrador_buscar", { token: "adm", q: "1905" }, ctx) as Row;
    assert.equal(((bus.items as Row[])[0] || {}).clave, "TK-SO-1905");
  });


  it("vincula tres tickets a una factura, deja la misma factura en cada uno y no escribe Sheets; oculta r1899 en la búsqueda", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }]);
    const ts = "2026-11-17T18:00:00Z";
    db.tables.set("tickets", [
      { id: 1894, sheet_row: 1895, so_num: "TK-SO-1902", timestamp: ts, nombre: "Paola", apellido: "Urvano", estimado: 224.991, cob: true, fac: false, fac_7: "", atendido_por: "Daniela Mora", orig: {} },
      { id: 1891, sheet_row: 1892, so_num: "TK-SO-1899", timestamp: ts, nombre: "Isabella", apellido: "Reina", estimado: 57.982, cob: true, fac: false, fac_7: "", atendido_por: "Daniela Mora", orig: {} },
      { id: 1893, sheet_row: 1894, so_num: "TK-SO-1901", timestamp: ts, nombre: "Nataly", apellido: "Reina", estimado: 43.99, cob: true, fac: false, fac_7: "", atendido_por: "Daniela Mora", orig: {} },
      { id: 1898, sheet_row: 1899, so_num: null, timestamp: null, nombre: null, apellido: null, estimado: null, fac: false, fac_7: null, orig: {} },
    ]);
    db.tables.set("beta_tickets", []);
    db.tables.set("beta_ticket_flags", []);
    db.tables.set("beta_ticket_cancelados", []);
    db.tables.set("beta_migo_facturas_vivo", []);
    db.tables.set("beta_migo_importes", []);
    db.tables.set("beta_cuadre_link", []);
    db.tables.set("beta_migo_borradores", []);
    db.tables.set("beta_acuity_calendars", []);
    db.tables.set("log_acciones", []);
    const ctx = { db, now: new Date("2026-11-18T16:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, token: "adm", legacyLogin: async () => ({}) };
    const r = await handle("migo_importar", { token: "adm", fecha_desde: "2026-11-17", fecha_hasta: "2026-11-17", facturas: [
      { factura: "001-001-000002960", fecha: "2026-11-17", cliente: "PAOLA URVANO", total: 326.97, forma: "Tarjeta" },
    ] }, ctx) as Row;
    assert.equal(r.ok, true, String(r.error));
    const lista = await handle("migo_borradores_lista", { token: "adm" }, ctx) as Row;
    const cands = ((lista.bandeja as Row[])[0].candidatos || []) as Row[];
    const tres = cands.find((c) => (c.claves as string[]).includes("TK-SO-1902") && (c.claves as string[]).length === 3);
    assert.ok(tres && tres.cuadra);
    const bus = await handle("migo_borrador_buscar", { token: "adm", q: "1899" }, ctx) as Row;
    const items = (bus.items || []) as Row[];
    assert.equal(items.some((it) => String(it.clave).toLowerCase() === "r1899"), false);
    assert.equal(items.some((it) => String(it.clave).includes("1899")), true);
    const vinc = await handle("migo_borrador_vincular", { token: "adm", factura: "2960", tickets: ["TK-SO-1902", "TK-SO-1899", "TK-SO-1901"] }, ctx) as Row;
    assert.equal(vinc.ok, true, String(vinc.error));
    assert.deepEqual(vinc.tickets, ["TK-SO-1902", "TK-SO-1899", "TK-SO-1901"]);
    for (const so of ["1902", "1899", "1901"]) {
      const tk = db.tables.get("tickets")!.find((x) => String(x.so_num).includes(so))!;
      assert.equal(tk.fac_7, "");
      const cab = (db.tables.get("beta_tickets") || []).find((c) => String(c.clave).includes(so))!;
      assert.equal((cab.datos as Row).factura, "001-001-000002960");
    }
    const after = await handle("migo_borradores_lista", { token: "adm" }, ctx) as Row;
    assert.deepEqual((after.vinculados as Row[])[0].ticket_claves, ["TK-SO-1902", "TK-SO-1899", "TK-SO-1901"]);
  });

  it("vincula un borrador pendiente_aprobar y, si ya está vinculado a esos tickets, no falla: avisa que ya estaba", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }]);
    db.tables.set("tickets", [
      { id: 1894, sheet_row: 1895, so_num: "TK-SO-1902", timestamp: "2026-11-17T18:00:00Z", nombre: "Paola", apellido: "Urvano", estimado: 224.99, cob: true, fac: false, fac_7: "", atendido_por: "Daniela Mora", orig: {} },
      { id: 1891, sheet_row: 1892, so_num: "TK-SO-1899", timestamp: "2026-11-17T18:00:00Z", nombre: "Isabella", apellido: "Reina", estimado: 57.98, cob: true, fac: false, fac_7: "", atendido_por: "Daniela Mora", orig: {} },
      { id: 1893, sheet_row: 1894, so_num: "TK-SO-1901", timestamp: "2026-11-17T18:00:00Z", nombre: "Nataly", apellido: "Reina", estimado: 43.99, cob: true, fac: false, fac_7: "", atendido_por: "Daniela Mora", orig: {} },
    ]);
    db.tables.set("beta_tickets", []);
    db.tables.set("beta_ticket_flags", []);
    db.tables.set("beta_ticket_cancelados", []);
    db.tables.set("beta_migo_facturas_vivo", []);
    db.tables.set("beta_migo_importes", []);
    db.tables.set("beta_cuadre_link", []);
    db.tables.set("beta_migo_borradores", [{
      factura: "001-001-000002960", fecha: "2026-11-17", cliente: "PAOLA URVANO", total: 326.97, forma: "tarjeta",
      estado: "pendiente_aprobar", ticket_clave: null, datos: {},
    }]);
    db.tables.set("log_acciones", []);
    const ctx = { db, now: new Date("2026-11-18T16:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, token: "adm", legacyLogin: async () => ({}) };
    const tres = ["TK-SO-1899", "TK-SO-1901", "TK-SO-1902"];
    const vinc = await handle("migo_borrador_vincular", { token: "adm", factura: "2960", tickets: tres }, ctx) as Row;
    assert.equal(vinc.ok, true, String(vinc.error));
    assert.deepEqual(vinc.tickets, tres);
    const otra = await handle("migo_borrador_vincular", { token: "adm", factura: "2960", tickets: tres }, ctx) as Row;
    assert.equal(otra.ok, true, String(otra.error));
    assert.equal(otra.ya_vinculado, true);
    assert.match(String(otra.mensaje), /ya está vinculada/);
    const bad = await handle("migo_borrador_vincular", { token: "adm", factura: "2960", tickets: ["TK-SO-1899"] }, ctx) as Row;
    // mismo set o subconjunto: también idempotente
    assert.equal(bad.ok, true, String(bad.error));
    assert.equal(bad.ya_vinculado, true);
    const desc = db.tables.get("beta_migo_borradores")![0];
    desc.estado = "descartado";
    desc.ticket_clave = null;
    desc.datos = {};
    const no = await handle("migo_borrador_vincular", { token: "adm", factura: "2960", tickets: tres }, ctx) as Row;
    assert.match(String(no.error || ""), /descartada/i);
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
  it("columna entre Cosmetóloga y Subtotal, pill Pagado (Migo en tooltip), acordeón de bandeja", () => {
    const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const html = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    assert.match(js, /k:'fpago',t:'💳 Forma de pago'/);
    assert.match(js, /k:'cos'[\s\S]{0,180}k:'fpago'[\s\S]{0,180}k:'sub'/);
    assert.match(js, /cobro confirmado en Migo/);
    assert.equal(js.includes("Pagado en Migo"), false);
    assert.match(js, /migo-acc-alerta/);
    assert.match(js, /migo-acc-badge/);
    assert.match(js, /sin ticket/);

    assert.match(js, /Pendiente por lunes/);
    assert.match(js, /function _tkFormaPill/);
    assert.match(js, /function _tkFacPdf/);
    const tk = readFileSync(new URL("../../../mc-tickets.js", import.meta.url), "utf8");
    assert.match(tk, /Ver factura/);
    assert.match(html, /beta-screens\.js\?v=20261119tk\d+/);
  });
});

describe("TK90 · sugerencias de la bandeja Migo sin tickets de $0", () => {
  const inv = { fecha: "2026-11-18", cliente: "SEBASTIAN GUERRA", total: 271.5 };
  const tickets: Row[] = [
    { id: 1898, clave: "TK-SO-1906", fecha: "2026-11-18", nombre: "Sunsu", apellido: "Spa", estimado: null, fac_7: "" },
    { id: 1901, clave: "TK-SO-1909", fecha: "2026-11-18", nombre: "Emilia", apellido: "Gallegos", estimado: null, fac_7: "" },
    { id: 1902, clave: "TK-SO-1910", fecha: "2026-11-18", nombre: "Emilia", apellido: "Gallegos", estimado: 0, fac_7: "" },
    { id: 1904, clave: "TK-SO-1912", fecha: "2026-11-18", nombre: "Joanna", apellido: "Manvik", estimado: 271.496, fac_7: "" },
    { id: 1905, clave: "TK-SO-1913", fecha: "2026-11-18", nombre: "Sunsu", apellido: "Spa", estimado: null, fac_7: "" },
    { id: 1906, clave: "TK-SO-1914", fecha: "2026-11-18", nombre: "Ana", apellido: "Anulada", estimado: 271.5, fac_7: "", orig: { anulado: true } },
    { id: 1907, clave: "TK-SO-1915", fecha: "2026-11-18", nombre: "Uno", apellido: "Medio", estimado: 200, fac_7: "" },
    { id: 1908, clave: "TK-SO-1916", fecha: "2026-11-18", nombre: "Dos", apellido: "Medio", estimado: 71.5, fac_7: "" },
  ];
  const C = candidatosParaFactura(inv, tickets);
  it("nunca tickets de $0 ni cancelados", () => {
    for (const k of ["TK-SO-1906", "TK-SO-1909", "TK-SO-1910", "TK-SO-1913", "TK-SO-1914"]) assert.equal(C.some((c) => c.claves.includes(k)), false, k);
  });
  it("el que cuadra solo (1912) sale solo, nunca dentro de una combinación", () => {
    const solo = C.filter((c) => c.claves.includes("TK-SO-1912"));
    assert.equal(solo.length, 1); assert.equal(solo[0].claves.length, 1); assert.equal(solo[0].cuadra, true);
  });
  it("sin combinaciones repetidas", () => {
    const k = C.map((c) => c.ticket_ids.slice().sort().join(","));
    assert.equal(new Set(k).size, k.length);
    assert.equal(C.filter((c) => c.claves.length > 1).length, 1, "solo 1915+1916");
  });
});

