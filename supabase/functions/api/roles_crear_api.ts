// Crear / ajustar / aprobar o rechazar un rol de pagos (admin).
// Cálculo = motor RRHH (rolCalcularOficial + clasificarHorasRol).
// Horas de un día ya pasado: asistencia beta; si no hay marcas, jibble_historial importado.
// Hoy y lo que falta del mes (hasta el último día calendario; en un mes de 30, el 30) se asumen trabajados.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, adminesDe, logAccion } from "./lib.ts";
import { configRolDe } from "./rol_config_api.ts";
import { cicloFin, cicloInicio, ecuadorParts, n, normNombre, rolCalcularOficial, round2, s, type Row } from "./domain.ts";
import { esAdmin, esPropio } from "./permisos.ts";
import { clavePeriodo, etiquetaPeriodo, estaPublicado, mismaPersonaRol } from "./roles_api.ts";
import { clasificarHorasRol, enMapaRrhh, horarioRolDeTabla, horarioRrhhDe, type DiaHorasRol } from "./horas_rol.ts";

const MESES: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};
const NOMBRE_MES = Object.fromEntries(Object.entries(MESES).map(([k, v]) => [v, k]));

function money2(v: number): number { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }

function esTest(ses: Ses): boolean { return !!ses.prueba; }

async function logRol(ctx: Ctx, ses: Ses, rolId: string, accion: string, antes: Row | null, despues: Row | null, motivo = "") {
  await ctx.db.write(actorOf(ses), "beta_roles_log", "insert", {}, {
    id: crypto.randomUUID(), rol_id: rolId, accion, actor: actorOf(ses),
    antes, despues, motivo: motivo || null, created_at: ctx.now.toISOString(),
  }).catch(() => null);
  await logAccion(ctx.db, actorOf(ses), "ROL " + accion.toUpperCase(), (despues && s(despues.persona) || "") + " " + (despues && s(despues.periodo) || rolId) + (motivo ? " · " + motivo : "")).catch(() => null);
}

export function periodoDe(anio: number, mes: number): string {
  return (NOMBRE_MES[mes] || "MES") + "_" + anio;
}

function parsePeriodo(raw: string, anio?: number, mes?: number): { periodo: string; anio: number; mes: number; cicloDesde: string; cicloHasta: string } {
  const clave = clavePeriodo(raw || ((mes && anio) ? NOMBRE_MES[mes] + "_" + anio : ""));
  let y = anio || 0, m = mes || 0;
  const p = clave.match(/^([A-Z]+)_(\d{4})$/);
  if (p) { m = MESES[p[1]] || m; y = Number(p[2]) || y; }
  const ciclo = clave.match(/^CICLO_(\d{4}-\d{2}-\d{2})$/);
  if (ciclo) {
    const fin = cicloFin(ciclo[1]);
    y = Number(fin.slice(0, 4)); m = Number(fin.slice(5, 7));
  }
  if (!y || !m) {
    const now = ecuadorParts(new Date());
    y = y || Number(now.ymd.slice(0, 4));
    m = m || Number(now.ymd.slice(5, 7));
  }
  const periodo = p ? clave : periodoDe(y, m);
  const ancla = `${y}-${String(m).padStart(2, "0")}-25`;
  const cicloDesde = cicloInicio(ancla);
  return { periodo, anio: y, mes: m, cicloDesde, cicloHasta: cicloFin(cicloDesde) };
}

async function feriadosDe(ctx: Ctx): Promise<string[]> {
  try {
    return (await ctx.db.all("asistencia_feriados")).map((r) => s(r.fecha).slice(0, 10)).filter(Boolean);
  } catch { return []; }
}

async function empleadaDe(ctx: Ctx, nombre: string): Promise<Row | null> {
  const key = normNombre(nombre);
  const first = key.split(" ")[0] || key;
  const rows = await ctx.db.all("rrhh_empleadas").catch(() => [] as Row[]);
  return rows.find((r) => {
    const a = normNombre(s(r.nombre_app) || s(r.apellidos_y_nombres) || s(r.nombre_jibble));
    return a === key || a.startsWith(first + " ") || first.length >= 3 && a.split(" ")[0] === first;
  }) || null;
}

function dineroDe(row: Row | null, keys: string[]): number {
  if (!row) return 0;
  for (const k of keys) if (n(row[k]) > 0) return n(row[k]);
  return 0;
}

async function pagoVigenteDe(ctx: Ctx, nombre: string, fin: string): Promise<Row | null> {
  let rows: Row[] = [];
  try { rows = await ctx.db.all("pago_config"); } catch { rows = []; }
  const key = normNombre(nombre).split(" ")[0] || normNombre(nombre);
  const hits = rows.filter((r) => {
    const quien = normNombre(s(r.nombre));
    return quien === normNombre(nombre) || quien.startsWith(key) || key.startsWith(quien.split(" ")[0] || "—");
  }).filter((r) => s(r.vigente_desde).slice(0, 10) <= fin);
  hits.sort((a, b) => s(a.vigente_desde).localeCompare(s(b.vigente_desde)));
  return hits.length ? hits[hits.length - 1] : null;
}

export function snapshotDe(opts: {
  persona: string; cedula: string; cargo: string; periodo: string;
  anio: number; mes: number; cicloDesde: string; cicloHasta: string;
  sueldoBase: number; bono: number; fondo: boolean; fechaIngreso: string;
  horas: ReturnType<typeof clasificarHorasRol>;
  com: { comFaciales: number; comExtras: number; comRecepcion: number; comProductos: number; comPaquetes: number; multas: number };
  iess: { quir: number; hip: number; otros: number };
  anticipo?: number; multasDetalle?: Row[];
  fuenteHoras: string;
  mensual?: { dec13?: boolean; dec14?: boolean; fondo?: boolean };
  /** TK170: false = sin afiliación IESS (factura sus servicios). */
  afiliada?: boolean;
  /** DEV-31: anticipos y cuotas de préstamos internos de este rol (ya sumados en «anticipo»). */
  descInternos?: { anticipo: number; prestamo: number; detalle: Row[] } | null;
}): Row {
  const afiliada = opts.afiliada !== false;
  const calc0 = rolCalcularOficial({
    sueldoBase: opts.sueldoBase, bono: opts.bono, faltas: opts.horas.diasFalta + (opts.horas.diasNoContratada || 0),
    hrsSupl: opts.horas.hrsSupl, hrsExtr: opts.horas.hrsExtr, hrsDesc: opts.horas.hrsDesc,
    comFaciales: opts.com.comFaciales, comExtras: opts.com.comExtras, comRecepcion: opts.com.comRecepcion,
    comProductos: opts.com.comProductos, comPaquetes: opts.com.comPaquetes, multas: opts.com.multas,
    hip: opts.iess.hip, quir: opts.iess.quir, sandalo: opts.iess.otros,
    anticipo: opts.anticipo || 0,
    fondoReserva: opts.fondo, fechaIngreso: opts.fechaIngreso, anio: opts.anio, mes: opts.mes,
    dec13Mensual: opts.mensual?.dec13, dec14Mensual: opts.mensual?.dec14, fondoMensual: opts.mensual?.fondo,
  });
  // Sin afiliación: no hay aporte IESS, préstamos IESS, décimos ni fondo; ingresos = sueldo + bono + comisiones + horas.
  const calc = afiliada ? calc0 : (() => {
    const ing = round2(calc0.ingresoAportable);
    const egr = round2(calc0.anticipo + calc0.multas);
    return {
      ...calc0, dec13: 0, dec14: 0, fondoReserva: 0, dec13Acumulado: 0, dec14Acumulado: 0, fondoReservaIess: 0,
      iess: 0, prestHip: 0, prestQuir: 0, prestOtro: 0,
      totalIngresos: ing, egresos: egr, totalEgresos: egr, totalRecibir: round2(ing - egr),
      iessPatronal: 0, secap: 0, iece: 0, aportePatronal: 0, costoEmpresa: ing,
    };
  })();
  const ingR = round2(calc.totalIngresos), egrR = round2(calc.totalEgresos), netoR = round2(ingR - egrR);
  const diasVis = (opts.horas.diasTrabajados + opts.horas.diasAsumidos);
  return {
    ...calc,
    nombre: opts.persona, cedula: opts.cedula, cargo: opts.cargo,
    periodo: opts.periodo, etiqueta: etiquetaPeriodo(opts.periodo),
    anio: opts.anio, mes: opts.mes, ciclo: opts.cicloDesde, fin: opts.cicloHasta,
    sueldoBase: opts.sueldoBase, fechaIngreso: opts.fechaIngreso, fondoFlag: opts.fondo,
    diasNorm: diasVis, diasJibble: diasVis,
    diasAsumidos: opts.horas.diasAsumidos, faltas: opts.horas.diasFalta, fechasFalta: opts.horas.fechasFalta,
    diasFest: opts.horas.diasFest, diasDesc: opts.horas.diasDesc, diasPermiso: opts.horas.diasPermiso,
    diasTrabajados: opts.horas.diasTrabajados,
    hrsOrdinarias: opts.horas.hrsOrdinarias, hrsNoct: opts.horas.hrsNoct, hrsNomina: opts.horas.hrsNomina,
    jornadaMins: opts.horas.jornadaMins, reglaHoras: opts.horas.regla,
    comFaciales: calc.comFacialesExtrasRecep,
    comFacialesSolo: calc.comFaciales, comExtras: calc.comExtras, comRecepcion: calc.comRecepcion,
    anticipo: calc.anticipo, prestHip: calc.prestHip, prestQuir: calc.prestQuir, prestOtro: calc.prestOtro,
    dec13: round2(calc.dec13), dec14: round2(calc.dec14), fondoReserva: round2(calc.fondoReserva), iess: round2(calc.iess),
    totalIngresos: ingR, totalEgresos: egrR, neto: netoR, totalRecibir: netoR,
    afiliada, diasNoContratada: opts.horas.diasNoContratada || 0,
    facturar: afiliada ? 0 : netoR,
    mensajeFactura: afiliada ? "" : `Debes facturarnos $${netoR.toFixed(2)} por este período.`,
    multasDetalle: opts.multasDetalle || [],
    anticipoSueldo: opts.descInternos ? round2(opts.descInternos.anticipo) : round2(calc.anticipo),
    prestamoEmpresa: opts.descInternos ? round2(opts.descInternos.prestamo) : 0,
    descuentosInternos: opts.descInternos ? opts.descInternos.detalle : [],
    fuenteHoras: opts.fuenteHoras,
    aportesPatronal: {
      iess: calc.iessPatronal, secap: calc.secap, iece: calc.iece,
      total: calc.aportePatronal, pct: 0.1215, costoEmpresa: calc.costoEmpresa,
    },
  };
}

export function aplicarAjustes(base: Row, aj: Row): Row {
  const sueldoBase = aj.sueldoBase != null ? n(aj.sueldoBase) : n(base.sueldoBase);
  const faltas = aj.faltas != null ? n(aj.faltas) : n(base.faltas);
  const horas = {
    diasFalta: faltas,
    hrsSupl: aj.hrsSupl != null ? n(aj.hrsSupl) : n(base.hrsSupl),
    hrsExtr: aj.hrsExtr != null ? n(aj.hrsExtr) : n(base.hrsExtr),
    hrsDesc: aj.hrsDesc != null ? n(aj.hrsDesc) : n(base.hrsDesc),
    diasTrabajados: n(base.diasTrabajados), diasAsumidos: n(base.diasAsumidos),
    fechasFalta: (base.fechasFalta as string[]) || [], diasFest: n(base.diasFest),
    diasDesc: n(base.diasDesc), diasPermiso: n(base.diasPermiso), diasNoContratada: n(base.diasNoContratada),
    minsNomina: n(base.minsNomina), hrsNomina: n(base.hrsNomina),
    hrsOrdinarias: n(base.hrsOrdinarias), hrsNoct: n(base.hrsNoct),
    jornadaMins: n(base.jornadaMins), regla: s(base.reglaHoras),
  };
  return snapshotDe({
    persona: s(base.nombre), cedula: s(base.cedula), cargo: s(base.cargo), periodo: s(base.periodo),
    anio: n(base.anio), mes: n(base.mes), cicloDesde: s(base.ciclo), cicloHasta: s(base.fin),
    sueldoBase, bono: aj.bono != null ? n(aj.bono) : n(base.bono),
    fondo: aj.fondoFlag != null ? !!aj.fondoFlag : !!base.fondoFlag,
    fechaIngreso: s(base.fechaIngreso),
    horas: horas as ReturnType<typeof clasificarHorasRol>,
    com: {
      comFaciales: aj.comFacialesSolo != null ? n(aj.comFacialesSolo) : n(base.comFacialesSolo),
      comExtras: aj.comExtras != null ? n(aj.comExtras) : n(base.comExtras),
      comRecepcion: aj.comRecepcion != null ? n(aj.comRecepcion) : n(base.comRecepcion),
      comProductos: aj.comProductos != null ? n(aj.comProductos) : n(base.comProductos),
      comPaquetes: aj.comPaquetes != null ? n(aj.comPaquetes) : n(base.comPaquetes),
      multas: aj.multas != null ? n(aj.multas) : n(base.multas),
    },
    iess: {
      quir: aj.prestQuir != null ? n(aj.prestQuir) : n(base.prestQuir),
      hip: aj.prestHip != null ? n(aj.prestHip) : n(base.prestHip),
      otros: aj.prestOtro != null ? n(aj.prestOtro) : n(base.prestOtro),
    },
    anticipo: aj.anticipo != null ? n(aj.anticipo) : n(base.anticipo),
    multasDetalle: (base.multasDetalle as Row[]) || [],
    fuenteHoras: s(base.fuenteHoras),
    mensual: { dec13: base.dec13Mensual !== false, dec14: base.dec14Mensual !== false, fondo: base.fondoMensual !== false },
    afiliada: base.afiliada !== false,
    // DEV-31: si el anticipo total no se tocó a mano, se conserva el detalle (anticipos + cuotas de préstamo).
    descInternos: (aj.anticipo == null || Math.abs(n(aj.anticipo) - n(base.anticipo)) < 0.005) && Array.isArray(base.descuentosInternos)
      ? { anticipo: n(base.anticipoSueldo), prestamo: n(base.prestamoEmpresa), detalle: base.descuentosInternos as Row[] }
      : null,
  });
}

/**
 * TK166: horas del rol de un mes (las MISMAS que muestra Mi asistencia): asistencia de la app y, si un día no
 * tiene marcas, Jibble; clasificadas en normales / suplementarias 50 % / extraordinarias 100 % / descanso 100 %,
 * con el recorte del rol RRHH: el total del mes de cada tipo se trunca a bloques de 15 min (recorte15).
 */
/** TK173: quien no está en el mapa histórico RRHH usa el horario asignado en Horarios (p. ej. Evelyn). */
export async function horarioRolDe(ctx: Ctx, persona: string) {
  if (enMapaRrhh(persona)) return horarioRrhhDe(persona);
  try {
    const { cargarHorarios } = await import("./horarios_api.ts");
    const { horarioAsignado } = await import("./horarios.ts");
    const pack = await cargarHorarios(ctx);
    const h = horarioAsignado(pack.horarios, pack.asignaciones, [persona]);
    const r = h && !h.esDefault ? horarioRolDeTabla(h) : null;
    if (r) return r;
  } catch { /* sin horarios */ }
  return horarioRrhhDe(persona);
}

export async function horasRolDe(ctx: Ctx, persona: string, anio: number, mes: number, opts: { ingreso?: string | null } = {}) {
  const { horasDeEmpleada } = await import("./asistencia_api.ts");
  let nomina = { hayDatos: false, dias: [] as Row[], hrsSupl: 0, hrsExtr: 0, hrsDesc: 0, diasJibble: 0, diasPropios: 0, faltas: 0 };
  try { nomina = await horasDeEmpleada(ctx, persona, anio, mes) as unknown as typeof nomina; } catch { /* sin asistencia */ }
  const dias: Record<string, DiaHorasRol | undefined> = {};
  for (const d0 of (nomina.dias || []) as Row[]) {
    const d = d0 as Row;
    const fecha = s(d.fecha).slice(0, 10);
    const nom = n(d.workedMin) || (n(d.ordinaryMin) + n(d.suplMin) + n(d.extrMin) + n(d.descMin));
    dias[fecha] = {
      fecha, nomMin: nom, suplMin: n(d.suplMin), festMin: n(d.extrMin), descMin: n(d.descMin),
      noctMin: n(d.extrFueraHorarioMin || d.noctMin),
      fuente: (s(d.fuente) === "vacio" ? "" : s(d.fuente)) as DiaHorasRol["fuente"],
    };
  }
  const permisos: string[] = [];
  for (const d0 of (nomina.dias || []) as Row[]) {
    if (s(d0.fuente) === "permiso" || d0.fuente === "permiso") permisos.push(s(d0.fecha).slice(0, 10));
  }
  // TK171 (Emilia t771u): un día PASADO sin marcas (ni app ni Jibble) es falta: marcar es obligación de la
  // empleada. Solo desde HOY hasta fin de mes se asume la jornada del horario. Los días antes del ingreso no
  // son faltas (clasificarHorasRol los salta).
  const hoyReal = ecuadorParts(ctx.now).ymd;
  const conDato = Object.values(dias).filter((d) => d && d.nomMin > 0 && d.fecha <= hoyReal).map((d) => d!.fecha).sort();
  const ultimo = conDato.length ? conDato[conDato.length - 1] : "";
  let hoy = hoyReal;
  const ingreso = s(opts.ingreso).slice(0, 10);
  if (ingreso && hoy < ingreso) hoy = ingreso;
  const horas = clasificarHorasRol({
    anio: anio, mes: mes, hoy,
    horario: await horarioRolDe(ctx, persona),
    feriados: await feriadosDe(ctx),
    dias, permisos, ingreso: ingreso || null,
  });
  return { nomina, horas, asumidoDesde: hoy, ultimoDato: ultimo || null };
}

/** TK166: décimos y fondo mensualizados o acumulados según la ficha (beta_empleados). Sin dato = mensualizado. */
export function mensualDe(overlays: Row[], persona: string): { dec13: boolean; dec14: boolean; fondo: boolean } {
  const key = normNombre(persona);
  const o = overlays.find((r) => normNombre(s(r.nombre_app)) === key || normNombre(s(r.nombre_app)).split(" ")[0] === key.split(" ")[0]);
  return { dec13: o?.dec13_mensual !== false, dec14: o?.dec14_mensual !== false, fondo: o?.fondo_mensual !== false };
}

/**
 * TK204 (Emilia t847u): las horas y valores del rol del mes tal como salen en Rol de pagos, para «Para tu rol de
 * pagos» en Mi asistencia. Si ya hay un rol guardado de ese mes, manda ese (con sus ajustes); si no, el mismo
 * armado que «Crear rol» (horario, ingreso, sueldo vigente, recorte de 15 min y valor oficial).
 */
export async function rolHorasMesDe(ctx: Ctx, nombre: string, anio: number, mes: number): Promise<Row | null> {
  if ((await adminesDe(ctx.db))(nombre)) return null;
  const emp = await empleadaDe(ctx, nombre);
  if (!emp) return null;
  const persona = s(emp.nombre_app) || s(emp.apellidos_y_nombres);
  const cfgRolH = await configRolDe(ctx, persona);
  const desdeSnap = (snap: Row, fuente: string): Row => ({
    anio, mes, fuente,
    hrsNormales: n(snap.hrsOrdinarias), hrsSupl: n(snap.hrsSupl), hrsExtr: n(snap.hrsExtr), hrsDesc: n(snap.hrsDesc),
    valSupl: n(snap.valSupl), valExtr: n(snap.valExtr), valDesc: n(snap.valDesc),
    diasTrabajados: n(snap.diasTrabajados), diasAsumidos: n(snap.diasAsumidos), diasFalta: n(snap.faltas),
    diasFeriado: n(snap.diasFest), diasDescanso: n(snap.diasDesc), diasPermiso: n(snap.diasPermiso),
  });
  const clave = clavePeriodo(NOMBRE_MES[mes] + "_" + anio);
  const guardados = (await ctx.db.all("beta_roles").catch(() => [] as Row[]))
    .filter((r) => clavePeriodo(r.periodo) === clave && s(r.origin) !== "test" && normNombre(s(r.persona)) === normNombre(persona) && r.snapshot && typeof r.snapshot === "object")
    .sort((a, b) => s(b.updated_at).localeCompare(s(a.updated_at)));
  if (guardados[0]) return desdeSnap(guardados[0].snapshot as Row, s(guardados[0].estado) || "guardado");
  const { horas } = await horasRolDe(ctx, persona, anio, mes, { ingreso: (cfgRolH && cfgRolH.fechaIngreso) || s(emp.fecha_ingreso).slice(0, 10) || null });
  const last = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
  const cfg = cfgRolH ? null : await pagoVigenteDe(ctx, persona, last);
  const sueldoBase = cfgRolH ? cfgRolH.sueldoBase : cfg ? n(cfg.sueldo) : dineroDe(emp, ["sueldo_base", "sueldo", "sueldo_mensual"]);
  const calc = rolCalcularOficial({ sueldoBase, bono: 0, faltas: 0, hrsSupl: horas.hrsSupl, hrsExtr: horas.hrsExtr, hrsDesc: horas.hrsDesc, anio, mes } as never) as unknown as Row;
  return desdeSnap({ ...horas, valSupl: calc.valSupl, valExtr: calc.valExtr, valDesc: calc.valDesc, faltas: horas.diasFalta }, "calculado");
}

export async function armarEntrada(ctx: Ctx, nombre: string, periodoRaw: string, anio?: number, mes?: number, opts: { origin?: string } = {}): Promise<Row> {
  const per = parsePeriodo(periodoRaw, anio, mes);
  // DEV-31b (t908u): EFCH y Emi son administradoras, no empleadas: no tienen rol de pagos.
  if ((await adminesDe(ctx.db))(nombre)) return { error: "EFCH y Emi son administradoras: no tienen rol de pagos." };
  const emp = await empleadaDe(ctx, nombre);
  if (!emp) return { error: "No encuentro a esa persona en Personal › Empleados / RRHH." };
  const persona = s(emp.nombre_app) || s(emp.apellidos_y_nombres);
  // DEV-31b (t907u): datos base del rol desde «Configuración de rol»; sin fila, la hoja RRHH.
  const cfgRol = await configRolDe(ctx, persona);
  if (cfgRol && !cfgRol.activa) return { error: persona + " está inactiva: ya no tiene rol de pagos." };
  const ingresoCfg = (cfgRol && cfgRol.fechaIngreso) || s(emp.fecha_ingreso).slice(0, 10);
  const { fichaIessDe, afiliadaSegunOverlay } = await import("./empleados_api.ts");
  const overlays = await ctx.db.all("beta_empleados").catch(() => [] as Row[]);
  // TK170: sin afiliación también sale rol (sueldo + bonos + comisiones, sin IESS ni décimos/fondo) con el total a facturar.
  const afiliada = cfgRol ? cfgRol.afiliada : afiliadaSegunOverlay(overlays, persona);
  const iessFicha = await fichaIessDe(ctx, persona, per.cicloHasta);
  const { nomina, horas, asumidoDesde, ultimoDato } = await horasRolDe(ctx, persona, per.anio, per.mes, { ingreso: ingresoCfg || null });
  const { comisionesDeTablas } = await import("./handlers_extra.ts");
  const com = await comisionesDeTablas(ctx, persona, per.anio, per.mes);
  // DEV-31: las comisiones del rol son las MISMAS de la pantalla Comisiones (mismo ciclo 26→25); multas igual que antes.
  try {
    const { comisionesComoPantalla } = await import("./handlers.ts");
    const pant = await comisionesComoPantalla(ctx, persona, per.cicloDesde);
    com.comFaciales = pant.comFaciales; com.comPaquetes = pant.comPaquetes; com.comProductos = pant.comProductos;
    com.comExtras = pant.comExtras; com.comRecepcion = pant.comRecepcion;
  } catch { /* si falla, queda el cálculo anterior */ }
  const { multasBetaRol } = await import("./multas_beta_api.ts");
  const mBeta = await multasBetaRol(ctx.db, persona, per.cicloDesde, per.cicloHasta);
  com.multas = round2(n(com.multas) + mBeta.total);
  const finMes = `${per.anio}-${String(per.mes).padStart(2, "0")}-28`;
  const last = new Date(Date.UTC(per.anio, per.mes, 0)).toISOString().slice(0, 10);
  const cfg = cfgRol ? null : await pagoVigenteDe(ctx, persona, last);
  const sueldoBase = cfgRol ? cfgRol.sueldoBase : cfg ? n(cfg.sueldo) : dineroDe(emp, ["sueldo_base", "sueldo", "sueldo_mensual"]);
  const bono = cfgRol ? cfgRol.bono : cfg ? n(cfg.bono) : dineroDe(emp, ["bono_fijo", "bono"]);
  // DEV-31b: el fondo de reserva no depende de un SI/NO: corre solo desde que cumple 1 año de la fecha de ingreso.
  const fondo = true;
  // DEV-31: anticipos (mes siguiente) y cuotas de préstamos internos que caen en este rol.
  const { descuentosDelPeriodo } = await import("./rol_descuentos_api.ts");
  const desc = await descuentosDelPeriodo(ctx, persona, per.periodo, opts.origin || "beta").catch(() => ({ anticipo: 0, prestamo: 0, total: 0, detalle: [] as Row[] }));
  const fuenteHoras = !nomina.hayDatos && horas.diasTrabajados === 0
    ? (horas.diasAsumidos ? "asumidas" : "sin_marcajes")
    : (nomina.diasPropios ? "asistencia de la app" : "histórico de la app+asumidas");
  const snap = snapshotDe({
    persona, cedula: (cfgRol && cfgRol.cedula) || s(emp.cedula), cargo: (cfgRol && cfgRol.cargo) || s(emp.cargo), periodo: per.periodo,
    anio: per.anio, mes: per.mes, cicloDesde: per.cicloDesde, cicloHasta: per.cicloHasta,
    sueldoBase, bono, fondo, fechaIngreso: ingresoCfg || "2020-01-01",
    horas, com, iess: { quir: iessFicha.quir, hip: iessFicha.hip, otros: iessFicha.otros },
    anticipo: desc.total, multasDetalle: mBeta.detalle || [], fuenteHoras,
    descInternos: desc,
    mensual: { dec13: true, dec14: true, fondo: true }, // DEV-31b: décimos y fondo siempre mensualizados (t907u)
    afiliada,
  });
  snap.asumidoDesde = asumidoDesde; snap.ultimoDato = ultimoDato;
  return { ok: true, ...per, persona, snap };
}

/** DEV-31b (t907u/t908u): el aporte patronal y el costo empresa los ve solo administración, nunca la empleada. */
export const CLAVES_PATRONAL = ["aportesPatronal", "aportePatronal", "aportePatronalPct", "iessPatronal", "secap", "iece", "costoEmpresa", "costoTotalEmpresa"];
export function sinPatronal(snap: Row): Row {
  const o: Row = { ...snap };
  for (const k of CLAVES_PATRONAL) delete o[k];
  return o;
}

export function vista(row: Row, snap0: Row, admin: boolean): Row {
  const snap = admin ? snap0 : sinPatronal(snap0);
  return {
    ok: true, id: row.id, persona: row.persona, cedula: row.cedula, cargo: row.cargo,
    periodo: row.periodo, etiqueta: etiquetaPeriodo(s(row.periodo)),
    anio: row.anio, mes: row.mes, ciclo: row.ciclo_desde, fin: row.ciclo_hasta,
    estado: row.estado, motivoRechazo: row.motivo_rechazo || "",
    origin: row.origin, creadoPor: row.creado_por,
    aprobadoPor: row.aprobado_por, aprobadoAt: row.aprobado_at,
    data: snap, admin,
    // DEV-31c: estado ante Contabilidad (solo administración).
    ...(admin ? { contab: { estado: s(row.contab_estado), por: s(row.contab_por), at: row.contab_at || null } } : {}),
  };
}

export async function rolAprobadoDe(ctx: Ctx, periodo: string, persona: string): Promise<Row | null> {
  const clave = clavePeriodo(periodo);
  const rows = await ctx.db.all("beta_roles").catch(() => [] as Row[]);
  const hit = rows.find((r) => clavePeriodo(r.periodo) === clave && s(r.estado) === "aprobado" && s(r.origin) !== "test" &&
    (normNombre(s(r.persona)) === normNombre(persona) || normNombre(s(r.persona)).startsWith((normNombre(persona).split(" ")[0] || "—") + " ")));
  return hit || null;
}

extend("rol_opciones", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración crea un rol de pagos." };
  const { empleadasDelRol } = await import("./rol_config_api.ts");
  const afiliadas: Row[] = [];
  const sinIess: Row[] = [];
  for (const e of await empleadasDelRol(ctx)) {
    const item = { nombre: e.nombre, cedula: e.cedula, cargo: e.cargo, afiliada: e.afiliada };
    // TK170: sin afiliación también se crea su rol (sin IESS, con el total a facturar).
    afiliadas.push(item);
    if (!e.afiliada) sinIess.push(item);
  }
  const now = ecuadorParts(ctx.now);
  const y = Number(now.ymd.slice(0, 4));
  const meses = [];
  for (let a = y; a >= y - 1; a--) {
    for (let m = 12; m >= 1; m--) {
      if (a === y && m > Number(now.ymd.slice(5, 7))) continue;
      meses.push({ periodo: periodoDe(a, m), etiqueta: etiquetaPeriodo(periodoDe(a, m)), anio: a, mes: m });
    }
  }
  return { ok: true, afiliadas, sinIess, meses };
});

extend("rol_crear", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración crea un rol de pagos." };
  const nombre = s(p.persona || p.nombre);
  if (!nombre) return { error: "Elige a la persona." };
  const armado = await armarEntrada(ctx, nombre, s(p.periodo || p.sheet || p.ciclo), n(p.anio) || undefined, n(p.mes) || undefined, { origin: esTest(ses) ? "test" : "beta" });
  if (armado.error) return armado;
  const origin = esTest(ses) ? "test" : "beta";
  const rows = await ctx.db.all("beta_roles").catch(() => [] as Row[]);
  const existing = rows.find((r) => s(r.persona) === s(armado.persona) && clavePeriodo(r.periodo) === clavePeriodo(armado.periodo) && s(r.origin || "beta") === origin);
  if (existing && s(existing.estado) === "aprobado" && origin === "beta") {
    return { error: "Ya hay un rol aprobado de este mes. Ábrelo desde la lista.", id: existing.id, estado: "aprobado" };
  }
  const snap = armado.snap as Row;
  if (existing) {
    const antes = existing.snapshot && typeof existing.snapshot === "object" ? existing.snapshot as Row : null;
    await ctx.db.write(actorOf(ses), "beta_roles", "update", { id: existing.id }, {
      snapshot: snap, estado: "borrador", motivo_rechazo: null, ajustes: null,
      updated_at: ctx.now.toISOString(), cedula: snap.cedula, cargo: snap.cargo,
    });
    const saved = { ...existing, snapshot: snap, estado: "borrador", motivo_rechazo: null };
    await logRol(ctx, ses, s(existing.id), "crear", antes, saved, "recalculado");
    return vista(saved, snap, true);
  }
  const id = crypto.randomUUID();
  const row = {
    id, persona: armado.persona, cedula: snap.cedula, cargo: snap.cargo,
    periodo: armado.periodo, anio: armado.anio, mes: armado.mes,
    ciclo_desde: armado.cicloDesde, ciclo_hasta: armado.cicloHasta,
    estado: "borrador", snapshot: snap, origin, creado_por: actorOf(ses),
    created_at: ctx.now.toISOString(), updated_at: ctx.now.toISOString(),
  };
  await ctx.db.write(actorOf(ses), "beta_roles", "insert", {}, row);
  await logRol(ctx, ses, id, "crear", null, row);
  return vista(row, snap, true);
});

extend("rol_get", "any", async (p, ctx, ses) => {
  const id = s(p.id);
  const rows = await ctx.db.all("beta_roles").catch(() => [] as Row[]);
  const row = id ? rows.find((r) => s(r.id) === id) : rows.find((r) => s(r.persona) === s(p.persona) && clavePeriodo(r.periodo) === clavePeriodo(p.periodo || p.sheet));
  if (!row) return { error: "No encuentro ese rol." };
  const admin = esAdmin(ses.rol);
  if (!admin && s(row.estado) !== "aprobado") return { error: "Este rol todavía no está publicado." };
  if (!admin && s(row.origin) === "test" && !ses.prueba) return { error: "Este rol todavía no está publicado." };
  // DEV-31: cada empleada ve solo su propio rol (el backend lo exige, no solo la pantalla).
  if (!admin && !(esPropio(s(row.persona), ses) || mismaPersonaRol(s(row.persona), ses.name || "") || mismaPersonaRol(s(row.persona), ses.short || ""))) {
    return { error: "Solo puedes ver tu propio rol." };
  }
  const snap = (row.snapshot && typeof row.snapshot === "object") ? row.snapshot as Row : {};
  const { firmaDeRol, vistaFirma } = await import("./rol_descuentos_api.ts");
  const firma = vistaFirma(await firmaDeRol(ctx, s(row.id)), true);
  return { ...vista(row, snap, admin), firma, puedeFirmar: !admin && s(row.estado) === "aprobado" && !firma && !!s(ses.token) };
});

extend("rol_ajustar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración ajusta un rol." };
  if (esTest(ses)) {
    const rows0 = await ctx.db.all("beta_roles").catch(() => [] as Row[]);
    const cur0 = rows0.find((r) => s(r.id) === s(p.id));
    if (cur0 && s(cur0.origin) !== "test") return { error: "La simulación no cambia un rol real." };
  }
  const rows = await ctx.db.all("beta_roles").catch(() => [] as Row[]);
  const row = rows.find((r) => s(r.id) === s(p.id));
  if (!row) return { error: "No encuentro ese rol." };
  if (s(row.estado) === "aprobado") return { error: "Ese rol ya está aprobado. No se ajusta." };
  const base = (row.snapshot && typeof row.snapshot === "object") ? row.snapshot as Row : {};
  const aj = (p.ajustes && typeof p.ajustes === "object") ? p.ajustes as Row : (p as Row);
  const snap = aplicarAjustes(base, aj);
  await ctx.db.write(actorOf(ses), "beta_roles", "update", { id: row.id }, {
    snapshot: snap, ajustes: aj, estado: "borrador", motivo_rechazo: null, updated_at: ctx.now.toISOString(),
  });
  const saved = { ...row, snapshot: snap, ajustes: aj, estado: "borrador" };
  await logRol(ctx, ses, s(row.id), "ajustar", base, saved);
  return vista(saved, snap, true);
});

extend("rol_aprobar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración aprueba un rol." };
  if (esTest(ses)) return { error: "La simulación no aprueba roles reales." };
  const rows = await ctx.db.all("beta_roles").catch(() => [] as Row[]);
  const row = rows.find((r) => s(r.id) === s(p.id));
  if (!row) return { error: "No encuentro ese rol." };
  if (s(row.origin) === "test") return { error: "La simulación no aprueba roles reales." };
  if (s(row.estado) === "aprobado") return { error: "Ese rol ya está aprobado.", id: row.id, estado: "aprobado" };
  const snap = (row.snapshot && typeof row.snapshot === "object") ? row.snapshot as Row : {};
  const now = ctx.now.toISOString();
  await ctx.db.write(actorOf(ses), "beta_roles", "update", { id: row.id }, {
    estado: "aprobado", aprobado_por: actorOf(ses), aprobado_at: now, motivo_rechazo: null, updated_at: now,
  });
  const rpub = await (await import("./handlers.ts")).handle("rol_publicar", { token: ses.token, periodo: row.periodo, persona: row.persona, publicado: true, todos: false }, ctx);
  const saved = { ...row, estado: "aprobado", aprobado_por: actorOf(ses), aprobado_at: now };
  await logRol(ctx, ses, s(row.id), "aprobar", row, saved);
  return { ...vista(saved, snap, true), publicado: true, publicacion: rpub };
});

extend("rol_rechazar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración rechaza un rol." };
  if (esTest(ses)) return { error: "La simulación no rechaza roles reales." };
  const motivo = s(p.motivo || p.razon);
  if (!motivo) return { error: "Escribe el motivo para no aprobarlo." };
  const rows = await ctx.db.all("beta_roles").catch(() => [] as Row[]);
  const row = rows.find((r) => s(r.id) === s(p.id));
  if (!row) return { error: "No encuentro ese rol." };
  if (s(row.origin) === "test") return { error: "La simulación no rechaza roles reales." };
  if (s(row.estado) === "aprobado") return { error: "Ese rol ya está aprobado." };
  const now = ctx.now.toISOString();
  await ctx.db.write(actorOf(ses), "beta_roles", "update", { id: row.id }, {
    estado: "rechazado", motivo_rechazo: motivo, rechazado_por: actorOf(ses), rechazado_at: now, updated_at: now,
  });
  const saved = { ...row, estado: "rechazado", motivo_rechazo: motivo };
  const snap = (row.snapshot && typeof row.snapshot === "object") ? row.snapshot as Row : {};
  await logRol(ctx, ses, s(row.id), "rechazar", row, saved, motivo);
  return vista(saved, snap, true);
});

/**
 * TK170 (Emilia t768u) · Pre-rol al día de hoy (admin). Sin «nombre»: la lista de empleadas. Con «nombre»: el rol
 * del mes en curso con el MISMO motor que «Crear rol» (horas de la app y, si no hay marcas, Jibble; lo que aún no
 * tiene datos se asume según el horario), más las horas trabajadas hasta ayer y la revisión de Jibble.
 */
extend("rol_prerol", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración ve el pre-rol." };
  const { afiliadaSegunOverlay, esFilaNotasRrhh } = await import("./empleados_api.ts");
  const overlays = await ctx.db.all("beta_empleados").catch(() => [] as Row[]);
  const emps = (await ctx.db.all("rrhh_empleadas").catch(() => [] as Row[])).filter((r) => !esFilaNotasRrhh(r) && (s(r.nombre_app) || s(r.apellidos_y_nombres)));
  const hoy = ecuadorParts(ctx.now).ymd;
  const anio = Number(hoy.slice(0, 4)), mes = Number(hoy.slice(5, 7));
  const periodo = periodoDe(anio, mes);
  const convencion = "Las horas son del mes calendario (1 al último día) y las comisiones y multas del ciclo 26→25. Los roles se publicaron entre el 28 y el 30 (jul 31, ago 28, sep 29–30, oct 29–30): desde hoy hasta fin de mes se asume la jornada del horario; un día pasado sin marcas (app ni Jibble) es falta.";
  if (!s(p.nombre)) {
    const items = emps.map((e) => {
      const nombre = s(e.nombre_app) || s(e.apellidos_y_nombres);
      return { nombre, nombreCompleto: s(e.apellidos_y_nombres), cargo: s(e.cargo), afiliada: afiliadaSegunOverlay(overlays, nombre) };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return { ok: true, items, periodo, etiqueta: etiquetaPeriodo(periodo), hoy, convencion };
  }
  const armado = await armarEntrada(ctx, s(p.nombre), periodo, anio, mes);
  if (armado.error) return armado;
  const snap = armado.snap as Row;
  const ini = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const ayer = new Date(Date.parse(hoy + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
  const { horasEnRango } = await import("./asistencia_api.ts");
  let hastaHoy: Row | null = null;
  // Desde el ingreso (si entró este mes); las faltas solo cuentan hasta el último dato importado.
  const ingreso = s(snap.fechaIngreso).slice(0, 10);
  const desdeH = ingreso > ini ? ingreso : ini;
  const ultimo = s(snap.ultimoDato).slice(0, 10);
  if (ayer >= desdeH) {
    try {
      const h = await horasEnRango(ctx, s(armado.persona), desdeH, ayer) as unknown as Row;
      const dias = (h.dias as Row[]) || [];
      const sum = (k: string) => dias.reduce((a, d) => a + n(d[k]), 0);
      hastaHoy = {
        desde: desdeH, hasta: ayer, ultimoDato: ultimo || null,
        trabajadoMin: sum("workedMin"), normalesMin: sum("ordinaryMin"), suplMin: sum("suplMin"), extrMin: sum("extrMin"), descMin: sum("descMin"),
        diasConMarca: dias.filter((d) => s(d.fuente) === "marcaje" && n(d.workedMin) > 0).length,
        diasJibble: dias.filter((d) => s(d.fuente) === "jibble").length,
        // TK171: los días pasados sin marcas son faltas (Emilia t771u).
        faltas: dias.filter((d) => d.falta === true).length,
      };
    } catch { hastaHoy = null; }
  }
  let jibble: Row | null = null;
  // DEV-31b: Jibble ya no es fuente ni se revisa; la asistencia es solo de la app.
  return { ok: true, persona: armado.persona, periodo, etiqueta: etiquetaPeriodo(periodo), hoy, convencion, snap, hastaHoy, jibble };
});
