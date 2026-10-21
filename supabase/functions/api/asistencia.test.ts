import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { rolCalcular } from "./domain.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./erp_api.ts";
import "./asistencia_api.ts";
import {
  CONFIG_DEF, calcularDia, calcularNomina, distanciaMetros, evaluarUbicacion, instanteEcuador, validarSecuencia,
  type MarcajeIn,
} from "./asistencia.ts";

const cfg = { ...CONFIG_DEF };
const feriados: string[] = [];

function marca(tipo: MarcajeIn["tipo"], ymd: string, hm: string): MarcajeIn {
  return { nombre: "Andrea", tipo, ts: instanteEcuador(ymd, hm) };
}

describe("asistencia", () => {
  it("mide el radio del spa", () => {
    const spa = { lat: -0.18, lng: -78.47 };
    const cerca = distanciaMetros(spa.lat, spa.lng, spa.lat + 0.0009, spa.lng);
    const lejos = distanciaMetros(spa.lat, spa.lng, spa.lat + 0.002, spa.lng);
    assert.ok(cerca < 150 && cerca > 80);
    assert.ok(lejos > 200);
    const on = { ...cfg, exigir_geo: true, lat: spa.lat, lng: spa.lng, radio_m: 150 };
    assert.equal(evaluarUbicacion(on, spa.lat + 0.0009, spa.lng, 20).ok, true);
    const no = evaluarUbicacion(on, spa.lat + 0.002, spa.lng, 20);
    assert.equal(no.ok, false);
    assert.equal(evaluarUbicacion({ ...on, lat: null }, spa.lat, spa.lng, 10).ok, false);
    assert.equal(evaluarUbicacion(on, null, null, null).ok, false);
    assert.equal(evaluarUbicacion(on, spa.lat, spa.lng, 400).ok, false);
  });

  it("un día de 9 a 18 con almuerzo es jornada, sin almuerzo sobra una suplementaria", () => {
    const con = calcularDia("2026-10-21", [
      marca("entrada", "2026-10-21", "09:00"),
      marca("almuerzo_inicio", "2026-10-21", "13:00"),
      marca("almuerzo_fin", "2026-10-21", "14:00"),
      marca("salida", "2026-10-21", "18:00"),
    ], cfg, feriados, []);
    assert.equal(con.ordinaryMin, 480);
    assert.equal(con.suplMin, 0);
    assert.equal(con.atrasoMin, 0);
    assert.equal(con.almuerzoPendiente, false);
    const sin = calcularDia("2026-10-21", [
      marca("entrada", "2026-10-21", "09:00"),
      marca("salida", "2026-10-21", "18:00"),
    ], cfg, feriados, []);
    assert.equal(sin.ordinaryMin, 480);
    assert.equal(sin.suplMin, 60);
    assert.equal(sin.almuerzoPendiente, true);
  });

  it("la llegada tarde, el sábado y la madrugada caen en su bolsa", () => {
    const tarde = calcularDia("2026-10-21", [
      marca("entrada", "2026-10-21", "09:20"),
      marca("almuerzo_inicio", "2026-10-21", "13:00"),
      marca("almuerzo_fin", "2026-10-21", "14:00"),
      marca("salida", "2026-10-21", "18:00"),
    ], cfg, feriados, []);
    assert.equal(tarde.atrasoMin, 10);
    assert.equal(tarde.suplMin, 0);
    const sab = calcularDia("2026-10-24", [
      marca("entrada", "2026-10-24", "09:00"),
      marca("salida", "2026-10-24", "13:00"),
    ], cfg, feriados, []);
    assert.equal(sab.descMin, 240);
    assert.equal(sab.ordinaryMin, 0);
    assert.equal(sab.atrasoMin, 0);
    const noche = calcularDia("2026-10-20", [
      marca("entrada", "2026-10-20", "00:30"),
      marca("salida", "2026-10-20", "04:30"),
    ], cfg, feriados, []);
    assert.equal(noche.extrMin, 240);
    assert.equal(noche.suplMin, 0);
  });

  it("el tope semanal de suplementarias es 12 h y un mes vacío no recorta el sueldo", () => {
    const marcajes: MarcajeIn[] = [];
    for (const dia of ["19", "20", "21", "22", "23"]) {
      const ymd = "2026-10-" + dia;
      marcajes.push(marca("entrada", ymd, "09:00"), marca("almuerzo_inicio", ymd, "13:00"), marca("almuerzo_fin", ymd, "14:00"), marca("salida", ymd, "21:00"));
    }
    const mes = calcularNomina({ anio: 2026, mes: 10, marcajes, jibble: [], permisos: [], config: cfg, feriados });
    assert.equal(mes.hayDatos, true);
    assert.equal(mes.hrsSupl, 12);
    assert.ok(mes.suplExcesoMin >= 180);
    const aMitad = calcularNomina({
      anio: 2026, mes: 10, hoy: "2026-10-21", marcajes: [marca("entrada", "2026-10-21", "09:00")],
      jibble: [], permisos: [], config: cfg, feriados,
    });
    assert.equal(aMitad.faltas, 0);
    const vacio = calcularNomina({ anio: 2026, mes: 10, marcajes: [], jibble: [], permisos: [], config: cfg, feriados });
    assert.equal(vacio.hayDatos, false);
    assert.equal(vacio.diasLaborados, null);
    const pago = rolCalcular({
      sueldo: 480, bono: 0, fondoReserva: false, fechaIngreso: "2020-01-01", anio: 2026, mes: 10,
      hrsSupl: 1, hrsExtr: 0, hrsDesc: 0, comFaciales: 0, comExtras: 0, comRecepcion: 0, comProductos: 0, comPaquetes: 0, multas: 0,
    });
    assert.equal(pago.horasExtra, 3);
  });

  it("vacaciones aprobadas cuentan el día y Jibble no pisa un marcaje", () => {
    const vac = calcularDia("2026-10-21", [], cfg, feriados, [{ tipo: "VACACIONES", estado: "APROBADO", desde: "2026-10-21", hasta: "2026-10-21", horas: 8 }]);
    assert.equal(vac.fuente, "permiso");
    assert.equal(vac.falta, false);
    const hist = calcularDia("2026-10-21", [], cfg, feriados, [], { fecha: "2026-10-21", payrollMin: 480, suplMin: 30, extrMin: 0, descMin: 0 });
    assert.equal(hist.fuente, "jibble");
    assert.equal(hist.suplMin, 30);
    const gana = calcularDia("2026-10-21", [
      marca("entrada", "2026-10-21", "09:00"), marca("salida", "2026-10-21", "13:00"),
    ], cfg, feriados, [], { fecha: "2026-10-21", payrollMin: 480, suplMin: 0, extrMin: 0, descMin: 0 });
    assert.equal(gana.fuente, "marcaje");
    assert.equal(gana.ordinaryMin, 240);
  });

  it("la secuencia de marcas y el candado de corrección", () => {
    assert.equal(validarSecuencia([], "salida"), "Primero marca la entrada.");
    const abierta = [marca("entrada", "2026-10-21", "09:00")];
    assert.equal(validarSecuencia(abierta, "entrada")?.includes("abierta"), true);
    assert.equal(validarSecuencia(abierta, "salida"), null);
  });

  it("marca, rechaza fuera del radio y deja auditoría de la corrección", async () => {
    const db = new MemoryDb();
    const token = "t-andrea";
    db.tables.set("sesiones", [{ token, uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false }]);
    const ctx = {
      db, now: new Date(instanteEcuador("2026-10-21", "09:00")),
      env: {}, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }),
    };
    const ok = await handle("asis_marcar", { token, tipo: "entrada", origen: "telefono" }, ctx);
    assert.equal((ok as { ok?: boolean }).ok, true);
    const otra = await handle("asis_marcar", { token, tipo: "entrada" }, ctx);
    assert.match(String((otra as { error?: string }).error), /abierta/);
    db.tables.set("sesiones", [
      ...(db.tables.get("sesiones") || []),
      { token: "t-emi", uid: "emi", rol: "super_admin", exp: "2099-01-01T00:00:00.000Z" },
    ]);
    db.tables.get("usuarios")!.push({ id: "emi", nombre: "Emi", short: "Emi", rol: "super_admin", bloqueado: false });
    const conf = await handle("asis_config_guardar", {
      token: "t-emi", exigir_geo: true, lat: -0.18, lng: -78.47, radio_m: 100, motivo: "activar radio",
    }, ctx);
    assert.equal((conf as { ok?: boolean }).ok, true);
    const lejos = await handle("asis_marcar", { token, tipo: "salida", lat: 0, lng: 0, precision_m: 10 }, ctx);
    assert.match(String((lejos as { error?: string }).error), /spa|m del spa|ubicación/i);
    assert.equal(db.tables.get("asistencia_auditoria")!.some((r) => r.accion === "rechazo"), true);
    const hoyAdmin = await handle("asis_hoy", { token: "t-emi" }, ctx) as { equipo?: { nombre?: string }[] };
    assert.equal(hoyAdmin.equipo?.some((m) => m.nombre === "Andrea Robles"), true);
    const hoyAndrea = await handle("asis_hoy", { token }, ctx) as { equipo?: unknown };
    assert.equal(hoyAndrea.equipo, undefined);
    const id = (await db.all("asistencia_marcajes"))[0].id;
    const no = await handle("asis_corregir", { token, id, ts: instanteEcuador("2026-10-21", "09:05"), motivo: "reloj mal" }, ctx);
    assert.match(String((no as { error?: string }).error), /admin/);
    const si = await handle("asis_corregir", { token: "t-emi", id, ts: instanteEcuador("2026-10-21", "09:05"), motivo: "el reloj del teléfono iba adelantado" }, ctx);
    assert.equal((si as { ok?: boolean }).ok, true);
    const aud = (await db.all("asistencia_auditoria")).find((r) => r.accion === "correccion");
    assert.equal((aud?.antes as { ts?: string }).ts?.includes("14:00"), true);
    assert.equal(aud?.actor?.toString().includes("Emi"), true);
    const ped = await handle("asis_permiso_solicitar", { token, tipo: "VACACIONES", desde: "2026-11-02", hasta: "2026-11-03", motivo: "viaje" }, ctx);
    assert.equal((ped as { ok?: boolean }).ok, true);
    const ajena = (await db.all("permisos"))[0];
    assert.equal(ajena.empleada, "Andrea Robles");
    const res = await handle("asis_permiso_resolver", { token: "t-emi", id: ajena.id_1, estado: "APROBADO" }, ctx);
    assert.equal((res as { estado?: string }).estado, "APROBADO");
    const fer = await handle("asis_feriado", { token: "t-emi", fecha: "2026-12-25", nombre: "Navidad" }, ctx);
    assert.equal((fer as { ok?: boolean }).ok, true);
    const hoyFer = await handle("asis_hoy", { token: "t-emi" }, ctx) as { feriados?: { fecha?: string; nombre?: string }[] };
    assert.equal(hoyFer.feriados?.some((f) => f.fecha === "2026-12-25" && f.nombre === "Navidad"), true);
  });
});
