// DEV-31b (Emilia t907u/t908u): Configuración de rol, décimos y fondo mensualizados (fondo desde 1 año, primer mes
// prorrateado), Dejaneira inactiva, aporte patronal solo para administración (+ costo empresa), EFCH y Emi fuera de
// asistencia y rol, y las horas solo de la app (sin Jibble).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./asistencia_api.ts";
import "./horarios_api.ts";
import "./personal_api.ts";
import "./roles_api.ts";
import "./roles_crear_api.ts";
import "./rol_descuentos_api.ts";
import "./rol_config_api.ts";
import "./jibble_importar.ts";
import "./empleados_api.ts";
import { fondoFactorMes, rolCalcularOficial } from "./domain.ts";
import { adminesDe } from "./lib.ts";
import type { Row } from "./domain.ts";

function seed(): MemoryDb {
  return new MemoryDb({
    sesiones: [
      { token: "t-emi", uid: "emi", rol: "super_admin", exp: "2099-01-01T00:00:00.000Z" },
      { token: "t-adm", uid: "adm", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
      { token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
      { token: "t-visor", uid: "visor", rol: "visor", exp: "2099-01-01T00:00:00.000Z" },
    ],
    usuarios: [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "super_admin", bloqueado: false },
      { id: "efch", nombre: "EFCH", short: "EFCH", rol: "super_admin", bloqueado: false },
      { id: "adm", nombre: "AdminP", short: "AdminP", rol: "admin", bloqueado: false },
      { id: "andrea", nombre: "Andrea", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      { id: "visor", nombre: "Visor", short: "Visor", rol: "visor", bloqueado: false },
    ],
    rrhh_empleadas: [
      { cedula: "1711", nombre_app: "Andrea", apellidos_y_nombres: "Andrea Robles", sueldo_base: 482, bono_fijo: 0, fondo_reserva: "NO", fecha_ingreso: "2025-05-01", cargo: "Cosmetologa" },
      { cedula: "1713", nombre_app: "Alejandra", apellidos_y_nombres: "Alejandra Rodriguez", sueldo_base: 482, bono_fijo: 30, fondo_reserva: "SI", fecha_ingreso: "2026-01-14", cargo: "Recepcion" },
      { cedula: "1714", nombre_app: "Dejaneira", apellidos_y_nombres: "Dejaneira Espinoza", sueldo_base: 482, bono_fijo: 0, fecha_ingreso: "2025-01-01", cargo: "Cosmetologa" },
      { cedula: "9", nombre_app: "Emi", apellidos_y_nombres: "Emilia Gallegos", sueldo_base: 999, fecha_ingreso: "2020-01-01", cargo: "Gerente" },
    ],
    beta_empleados: [],
    beta_rol_config: [
      { persona: "Andrea", nombre_completo: "Andrea Robles", sueldo_base: 482, bono: 130, afiliada_iess: true, fecha_ingreso: "2025-05-01", activa: true },
      { persona: "Alejandra", nombre_completo: "Alejandra Rodriguez", sueldo_base: 482, bono: 30, afiliada_iess: true, fecha_ingreso: "2026-01-14", activa: true },
      { persona: "Dejaneira", nombre_completo: "Dejaneira Espinoza", sueldo_base: 0, bono: 0, afiliada_iess: true, fecha_ingreso: "2025-01-01", activa: false },
    ],
    beta_rol_config_log: [],
    asistencia_historico: [], jibble_historial: [{ persona: "Andrea", fecha: "2026-11-05", payroll_minutes: 540 }],
    tickets: [], multas_descuentos: [], asistencia_marcajes: [], permisos: [],
    beta_roles: [], beta_rol_descuentos: [], beta_rol_firmas: [],
  });
}
function ctx(db: MemoryDb, now = "2026-11-25T15:00:00Z") {
  return { db, now: new Date(now), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }) };
}

describe("DEV-31b fondo de reserva y décimos", () => {
  it("fondo: 0 antes del año, prorrateado el mes del aniversario (30 días comerciales), completo después", () => {
    // Daniela: ingreso 23/09/2025 → cumple el año el 23/09/2026.
    assert.equal(fondoFactorMes("2025-09-23", 2026, 8).factor, 0);
    assert.ok(Math.abs(fondoFactorMes("2025-09-23", 2026, 9).factor - 8 / 30) < 1e-5); // 23..30 = 8 días
    assert.equal(fondoFactorMes("2025-09-23", 2026, 10).factor, 1);
    assert.equal(fondoFactorMes("2025-09-23", 2026, 9).desde, "2026-09-23");
    // Alejandra: ingreso 14/01/2026 → fondo desde el 14/01/2027.
    assert.equal(fondoFactorMes("2026-01-14", 2026, 11).factor, 0);
    assert.ok(Math.abs(fondoFactorMes("2026-01-14", 2027, 1).factor - 17 / 30) < 1e-5);
    // Aniversario el día 1 → mes completo.
    assert.equal(fondoFactorMes("2025-12-01", 2026, 12).factor, 1);
  });

  it("motor: 8,33 % mensualizado solo con el año cumplido; décimos 13º y 14º siempre en el rol", () => {
    const base = { sueldoBase: 482, bono: 130, faltas: 0, comFaciales: 0, comExtras: 0, comRecepcion: 0, comProductos: 0, comPaquetes: 0, fondoReserva: true, anio: 2026, mes: 11 };
    const antes = rolCalcularOficial({ ...base, fechaIngreso: "2026-01-14" });
    assert.equal(antes.fondoReserva, 0);
    assert.ok(antes.dec13 > 0 && antes.dec14 > 0);
    const despues = rolCalcularOficial({ ...base, fechaIngreso: "2025-05-01" });
    assert.ok(Math.abs(despues.fondoReserva - 612 * 0.0833) < 0.001);
    const parcial = rolCalcularOficial({ ...base, fechaIngreso: "2025-11-25", mes: 11 });
    assert.ok(Math.abs(parcial.fondoReserva - 612 * 0.0833 * (6 / 30)) < 0.001); // 25..30 = 6 días
    assert.ok(Math.abs(despues.costoEmpresa - (despues.totalIngresos + despues.aportePatronal)) < 0.011);
  });
});

describe("DEV-31b configuración de rol", () => {
  it("solo administración la ve y la cambia; el cambio manda en el rol y queda en el historial", async () => {
    const db = seed(); const c = ctx(db);
    for (const tk of ["t-andrea", "t-visor"]) {
      assert.ok(((await handle("rolcfg_lista", { token: tk }, c)) as Row).error, tk);
      assert.ok(((await handle("rolcfg_guardar", { token: tk, persona: "Andrea", sueldoBase: 1 }, c)) as Row).error, tk);
    }
    const l = await handle("rolcfg_lista", { token: "t-emi" }, c) as Row;
    assert.deepEqual((l.items as Row[]).map((x) => x.persona), ["Alejandra", "Andrea"]);
    assert.deepEqual((l.inactivas as Row[]).map((x) => x.persona), ["Dejaneira"]);
    assert.equal(((l.items as Row[]).find((x) => x.persona === "Andrea") as Row).fondoActivo, true);
    assert.equal(((l.items as Row[]).find((x) => x.persona === "Alejandra") as Row).fondoDesde, "2027-01-14");
    // El rol usa la configuración (no la hoja RRHH).
    const antes = await handle("rol_crear", { token: "t-emi", persona: "Andrea", periodo: "NOVIEMBRE_2026" }, c) as Row;
    assert.equal((antes.data as Row).bono, 130);
    const g = await handle("rolcfg_guardar", { token: "t-emi", persona: "Andrea", sueldoBase: 500, bono: 100, afiliada: "si", fechaIngreso: "2025-05-01", motivo: "subió el sueldo" }, c) as Row;
    assert.equal(g.ok, true, String(g.error || ""));
    const despues = await handle("rol_crear", { token: "t-emi", persona: "Andrea", periodo: "NOVIEMBRE_2026" }, c) as Row;
    assert.equal((despues.data as Row).sueldoBase, 500);
    assert.equal((despues.data as Row).bono, 100);
    const log = (await db.all("beta_rol_config_log")) as Row[];
    assert.equal(log.length, 1);
    assert.equal(log[0].accion, "editar");
    assert.equal((log[0].antes as Row).sueldoBase, 482);
    assert.equal((log[0].despues as Row).sueldoBase, 500);
    assert.equal(log[0].motivo, "subió el sueldo");
    // Validaciones.
    assert.match(String(((await handle("rolcfg_guardar", { token: "t-emi", persona: "Andrea", sueldoBase: -5, bono: 0, afiliada: "si", fechaIngreso: "2025-05-01" }, c)) as Row).error), /sueldo/i);
    assert.match(String(((await handle("rolcfg_guardar", { token: "t-emi", persona: "Andrea", sueldoBase: 482, bono: 0, afiliada: "si", fechaIngreso: "" }, c)) as Row).error), /fecha de ingreso/i);
  });

  it("Dejaneira (inactiva) y las administradoras (Emi, EFCH) no tienen rol, ni pre-rol, ni configuración", async () => {
    const db = seed(); const c = ctx(db);
    const pre = await handle("rol_prerol_resumen", { token: "t-emi" }, c) as Row;
    assert.deepEqual((pre.filas as Row[]).map((x) => x.nombre), ["Alejandra", "Andrea"]);
    for (const quien of ["Dejaneira", "Emi", "EFCH"]) {
      const r = await handle("rol_crear", { token: "t-emi", persona: quien, periodo: "NOVIEMBRE_2026" }, c) as Row;
      assert.ok(r.error, quien);
    }
    const op = await handle("rol_opciones", { token: "t-emi" }, c) as Row;
    assert.deepEqual((op.afiliadas as Row[]).map((x) => x.nombre), ["Alejandra", "Andrea"]);
    const g = await handle("rolcfg_guardar", { token: "t-emi", persona: "Emi", sueldoBase: 1000, bono: 0, afiliada: "si", fechaIngreso: "2020-01-01" }, c) as Row;
    assert.match(String(g.error), /administradoras/);
    const l = await handle("rolcfg_lista", { token: "t-emi" }, c) as Row;
    assert.equal(JSON.stringify(l.items).includes("Emi"), false);
    // Desactivar y reactivar queda en el historial; no borra nada.
    const des = await handle("rolcfg_guardar", { token: "t-emi", persona: "Alejandra", sueldoBase: 482, bono: 30, afiliada: "si", fechaIngreso: "2026-01-14", activa: false }, c) as Row;
    assert.equal(des.ok, true, String(des.error || ""));
    assert.equal(((await db.all("beta_rol_config_log")) as Row[])[0].accion, "desactivar");
    assert.equal((await db.all("beta_rol_config")).length, 3);
    const pre2 = await handle("rol_prerol_resumen", { token: "t-emi" }, c) as Row;
    assert.deepEqual((pre2.filas as Row[]).map((x) => x.nombre), ["Andrea"]);
  });

  it("admins fuera de Asistencia: selectores, tablero, día, período y marcas", async () => {
    const db = seed(); const c = ctx(db);
    db.tables.set("asistencia_marcajes", [
      { id: "m1", nombre: "Emi", tipo: "entrada", ts: "2026-11-25T14:00:00Z", anulado: false },
      { id: "m2", nombre: "Andrea", tipo: "entrada", ts: "2026-11-25T14:30:00Z", anulado: false },
    ]);
    const pers = ((await handle("personal_personas", { token: "t-emi" }, c)) as Row).personas as Row[];
    assert.equal(pers.some((p) => ["Emi", "EFCH", "AdminP"].includes(String(p.nombre))), false);
    const dia = ((await handle("asis_dia", { token: "t-emi", fecha: "2026-11-25" }, c)) as Row).filas as Row[];
    assert.equal(dia.some((f) => f.nombre === "Emi"), false);
    assert.ok(dia.some((f) => f.nombre === "Andrea"));
    const per = ((await handle("asis_periodo", { token: "t-emi", anio: 2026, mes: 11 }, c)) as Row).personas as Row[];
    assert.equal(per.some((p) => p.nombre === "Emi"), false);
    const hoy = await handle("asis_hoy", { token: "t-emi" }, c) as Row;
    assert.equal(((hoy.equipo as Row[]) || []).some((m) => m.nombre === "Emi"), false);
    const tab = ((await handle("asis_tablero", { token: "t-emi" }, c)) as Row).personas as Row[];
    assert.equal(tab.some((p) => p.nombre === "Emi"), false);
    const man = await handle("asis_marca_manual", { token: "t-emi", nombre: "EFCH", tipo: "entrada", ts: "2026-11-24T09:00:00-05:00", motivo: "x" }, c) as Row;
    assert.match(String(man.error), /administradoras/);
    const cal = await handle("asis_calendario", { token: "t-emi" }, c) as Row;
    assert.match(String(cal.error), /administradoras/);
    assert.equal((await adminesDe(db))("efch"), true);
    assert.equal((await adminesDe(db))("Andrea"), false);
  });
});

describe("DEV-31b aporte patronal y costo empresa", () => {
  it("la empleada no ve patronal ni costo empresa (pantalla); administración sí y suma el total", async () => {
    const db = seed(); const c = ctx(db);
    const rol = await handle("rol_crear", { token: "t-emi", persona: "Andrea", periodo: "NOVIEMBRE_2026" }, c) as Row;
    await handle("rol_aprobar", { token: "t-emi", id: rol.id }, c);
    const suya = await handle("rol_get", { token: "t-andrea", id: rol.id }, c) as Row;
    assert.equal(suya.ok, true, String(suya.error || ""));
    const txt = JSON.stringify(suya);
    for (const k of ["aportesPatronal", "aportePatronal", "iessPatronal", "secap", "iece", "costoEmpresa"]) assert.equal(txt.includes('"' + k + '"'), false, k);
    const lista = JSON.stringify(await handle("roles_lista", { token: "t-andrea" }, c));
    assert.equal(/atronal|costoEmpresa/.test(lista), false);
    const adm = await handle("rol_get", { token: "t-emi", id: rol.id }, c) as Row;
    const d = adm.data as Row;
    assert.ok(Number((d.aportesPatronal as Row).total) > 0);
    assert.ok(Math.abs(Number(d.costoEmpresa) - (Number(d.totalIngresos) + Number(d.aportePatronal))) < 0.011);
    const pre = await handle("rol_prerol_resumen", { token: "t-emi" }, c) as Row;
    const fil = pre.filas as Row[];
    const suma = fil.reduce((a, x) => a + Number(x.costoEmpresa), 0);
    assert.ok(Math.abs(suma - Number((pre.totales as Row).costoEmpresa)) < 0.011);
    for (const x of fil) assert.ok(Math.abs(Number(x.costoEmpresa) - (Number(x.totalIngresos) + Number(x.patronal))) < 0.011, String(x.nombre));
    // El visor y el personal no ven el pre-rol.
    assert.ok(((await handle("rol_prerol_resumen", { token: "t-andrea" }, c)) as Row).error);
    assert.ok(((await handle("rol_prerol_resumen", { token: "t-visor" }, c)) as Row).error);
  });
});

describe("DEV-31b horas solo de la app", () => {
  it("jibble_historial ya no se lee; el importador está apagado", async () => {
    const db = seed(); const c = ctx(db);
    const r = await handle("rol_prerol_resumen", { token: "t-emi" }, c) as Row;
    const an = (r.filas as Row[]).find((x) => x.nombre === "Andrea")!;
    // El 5/11 solo estaba en jibble_historial (tabla vieja): cuenta como falta, no como día trabajado.
    assert.equal(an.diasTrabajados, 0);
    const imp = await handle("jibble_importar", { token: "t-emi" }, c) as Row;
    assert.match(String(imp.error), /Jibble ya no se usa|permiso/i);
    assert.notEqual(imp.ok, true);
  });
  it("el histórico de la app (antes del 20/11) sí cuenta, como Mi asistencia", async () => {
    const db = seed(); const c = ctx(db);
    db.tables.set("asistencia_historico", [{ persona: "Andrea", fecha: "2026-11-05", payroll_minutes: 540, supplementary_minutes: 0, extraordinary_minutes: 0, rest_day_minutes: 0 }]);
    const r = await handle("rol_prerol_resumen", { token: "t-emi" }, c) as Row;
    const an = (r.filas as Row[]).find((x) => x.nombre === "Andrea")!;
    assert.equal(an.diasTrabajados, 1);
  });
});
