// TK166 (Emilia t758u): roles del Historial RRHH con el detalle completo.
// rrhh_historial (lo pagado) solo trae totales: comisiones en una cifra, «extras» en una cifra y
// «13+14+FR» en una cifra. Aquí se arma la línea por línea SIN cambiar lo pagado:
//  · comisiones por tipo (faciales / extras / recepción / paquetes / productos) que suman el total pagado;
//  · horas suplementarias 50 %, extraordinarias 100 % y descanso 100 % con sus horas y su valor;
//  · décimo tercero, décimo cuarto y fondo de reserva por separado;
//  · aporte IESS 9.45 % sobre la base aportable (sin décimos ni fondo), descuentos y neto.
// Fuentes, en orden: la hoja del mes (rrhh_rol_AAAA_MM, que tiene el desglose), el motor de comisiones y
// la asistencia (solo para repartir y para las horas), y las reglas del IESS. Lo que no cuadra con lo
// pagado NO se cambia: se anota en `diferencias` para que administración decida.
import type { Ctx } from "./lib.ts";
import { floorCent, n, normNombre, round2, s, SBU_ROL, IESS_PERSONAL_PCT, FONDO_RESERVA_PCT, type Row } from "./domain.ts";
import { elegirNombreLegal, mapaNombresLegales, snapConNombreLegal } from "./rol_nombres.ts";

export const MESES_NUM: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};
/** Salario básico unificado por año (décimo cuarto = SBU/12). 2026: USD 482 (Acuerdo MDT-2025-195). */
export const SBU_POR_ANIO: Record<number, number> = { 2025: 470, 2026: 482 };
export function sbuDe(anio: number): number { return SBU_POR_ANIO[anio] || SBU_ROL; }

const TOL = 0.02;
const cerca = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= tol;
export function cedulaNorm(v: unknown): string { return s(v).replace(/\.0+$/, "").replace(/\D/g, ""); }

export type Motor = {
  comFaciales: number; comExtras: number; comRecepcion: number; comPaquetes: number; comProductos: number;
  multas?: number;
  hrsSupl?: number; hrsExtr?: number; hrsDesc?: number; hrsOrdinarias?: number; diasLaborados?: number | null;
};

export type HojaMes = { resumen: Row | null; horas: Row | null; variables: Row | null };

/** Busca en la hoja rrhh_rol_AAAA_MM las tres filas de la persona: resumen (G…X), horas (sección 1) y variables (sección 2). */
export function filasDeHoja(rows: Row[], cedula: string, nombreApp: string): HojaMes {
  const ced = cedulaNorm(cedula);
  const ordenadas = rows.slice().sort((a, b) => n(a.sheet_row) - n(b.sheet_row));
  const resumen = ordenadas.find((r) => ced && cedulaNorm(r.col_2) === ced && s(r.col_3) && s(r.col_7) !== "" && !isNaN(Number(r.col_7))) || null;
  const iSec2 = ordenadas.findIndex((r) => /SECCI[ÓO]N 2/i.test(s(r.col_1)));
  const iSec3 = ordenadas.findIndex((r) => /ROL DE PAGOS/i.test(s(r.col_1)) && /COMISIONES/i.test(s(r.col_1)));
  const primer = normNombre(nombreApp).split(" ")[0] || "—";
  const esSuya = (r: Row) => { const a = normNombre(s(r.col_1)); return !!a && (a === normNombre(nombreApp) || a.split(" ")[0] === primer); };
  const horas = ordenadas.slice(0, iSec2 > 0 ? iSec2 : ordenadas.length).find((r) => esSuya(r) && !isNaN(Number(r.col_3)) && s(r.col_3) !== "") || null;
  const variables = iSec2 >= 0
    ? ordenadas.slice(iSec2, iSec3 > iSec2 ? iSec3 : ordenadas.length).find((r) => esSuya(r) && !isNaN(Number(r.col_2)) && s(r.col_2) !== "") || null
    : null;
  return { resumen, horas, variables };
}

/** Valor de horas como la hoja RRHH: (sueldo base / 240) × horas × recargo, truncado al centavo. */
export function valorHoras(h: number, base: number, factor: number): number { return floorCent(h * base / 240 * factor); }

/**
 * Horas que dan EXACTAMENTE el valor pagado de extras, en pasos de 0.25 h y lo más cerca posible de las
 * horas marcadas (pista). null si no hay combinación exacta.
 */
export function horasQueCuadran(pagado: number, base: number, pista: { supl: number; extr: number; desc: number }): { supl: number; extr: number; desc: number } | null {
  if (!(pagado > 0)) return { supl: 0, extr: 0, desc: 0 };
  const q = (x: number) => Math.round(x * 4) / 4;
  const rango = (c: number) => { const lo = Math.max(0, q(c) - 12), hi = q(c) + 12; const out: number[] = []; for (let x = lo; x <= hi + 1e-9; x += 0.25) out.push(Math.round(x * 100) / 100); return out; };
  let mejor: { supl: number; extr: number; desc: number } | null = null, dist = Infinity;
  const S = rango(pista.supl), X = rango(pista.extr), D = rango(pista.desc);
  for (const sh of S) {
    const vs = valorHoras(sh, base, 1.5);
    if (vs > pagado + 0.001) break;
    for (const xh of X) {
      const vx = valorHoras(xh, base, 2);
      if (vs + vx > pagado + 0.001) break;
      for (const dh of D) {
        const vd = valorHoras(dh, base, 2);
        const tot = round2(vs + vx + vd);
        if (tot > pagado + 0.001) break;
        if (tot !== round2(pagado)) continue;
        const d = Math.abs(sh - pista.supl) + Math.abs(xh - pista.extr) + Math.abs(dh - pista.desc);
        if (d < dist) { dist = d; mejor = { supl: sh, extr: xh, desc: dh }; }
      }
    }
  }
  return mejor;
}

/** Reparte «Com. faciales/extras/recep.» de la hoja entre los tres tipos sin inventar centavos. */
export function repartirFER(total: number, motor: Motor | null, esRecepcion: boolean): { fac: number; ext: number; rec: number } {
  const T = round2(total);
  if (!(T > 0)) return { fac: 0, ext: 0, rec: 0 };
  const mf = round2(n(motor?.comFaciales)), me = round2(n(motor?.comExtras)), mr = round2(n(motor?.comRecepcion));
  if (motor && cerca(mf + me + mr, T, 0.005)) return { fac: mf, ext: me, rec: mr };
  if (esRecepcion) {
    const fac = Math.min(mf, T);
    const ext = Math.min(me, round2(T - fac));
    return { fac, ext, rec: round2(T - fac - ext) };
  }
  const ext = Math.min(me, T);
  const rec = Math.min(mr, round2(T - ext));
  return { fac: round2(T - ext - rec), ext, rec };
}

export type EntradaDetalle = {
  hist: Row; periodo: string; etiqueta: string; anio: number; mes: number;
  hoja: HojaMes | null;
  emp: Row | null;
  esRecepcion: boolean;
  afiliada: boolean;
  motor: Motor | null;
  /** Descuentos que la hoja no trae (meses sin hoja): multas del ciclo y préstamos IESS de la ficha. */
  egresosSinHoja?: { multas: number; prestHip: number; prestQuir: number; prestOtro: number; multasDetalle?: Row[] };
};

/** Arma el rol completo de una fila del historial. Puro: no lee la base. */
export function armarDetalleHistorial(inp: EntradaDetalle): { d: Row; diferencias: Row[] } {
  const h = inp.hist;
  const R = inp.hoja?.resumen || null;
  const H = inp.hoja?.horas || null;
  const V = inp.hoja?.variables || null;
  const dif: Row[] = [];
  const sueldo = round2(n(h.sueldo));
  const bono = round2(n(h.bono));
  const C = round2(n(h.comisiones));
  const E = round2(n(h.extras_m_o_q));
  const D = round2(n(h.c_13_14_fr_r_s_t));
  const totalPagado = round2(n(h.total_ingresos_u));
  const base = n(inp.emp?.sueldo_base) || 482;
  const motor = inp.motor;

  // ── Comisiones ──
  let I = C, J = 0, K = 0, fuenteCom = "historial";
  if (R && cerca(n(R.col_9) + n(R.col_10) + n(R.col_11), C)) {
    I = round2(n(R.col_9)); J = round2(n(R.col_10)); K = round2(n(R.col_11)); fuenteCom = "hoja";
    // el redondeo de la hoja (p. ej. 180.411) se absorbe en productos para que la suma sea exacta
    K = round2(C - I - J);
  } else if (motor) {
    J = Math.min(round2(motor.comPaquetes), C); K = Math.min(round2(motor.comProductos), round2(C - J)); I = round2(C - J - K); fuenteCom = "motor";
  }
  const fer = repartirFER(I, motor, inp.esRecepcion);
  if (motor) {
    const comp: [string, number, number][] = [
      ["Com. faciales", fer.fac, n(motor.comFaciales)], ["Com. extras", fer.ext, n(motor.comExtras)],
      ["Com. recepción", fer.rec, n(motor.comRecepcion)], ["Comisión paquetes", J, n(motor.comPaquetes)],
      ["Comisión productos", K, n(motor.comProductos)],
    ];
    for (const [concepto, pagado, hoy] of comp) {
      if (!cerca(pagado, round2(hoy))) dif.push({ tipo: "comision", concepto, pagado: round2(pagado), comisionesHoy: round2(hoy), diferencia: round2(hoy - pagado) });
    }
  }

  // ── Horas extra ──
  let hrsSupl = 0, hrsExtr = 0, hrsDesc = 0, valSupl = 0, valExtr = 0, valDesc = 0, fuenteHoras = "historial";
  const sheetExtras = R ? round2(n(R.col_13) + n(R.col_15) + n(R.col_17)) : NaN;
  if (R && cerca(sheetExtras, E)) {
    hrsSupl = n(R.col_12); valSupl = round2(n(R.col_13));
    hrsExtr = n(R.col_14); valExtr = round2(n(R.col_15));
    hrsDesc = n(R.col_16); valDesc = round2(n(R.col_17));
    fuenteHoras = "hoja";
  } else if (E > 0) {
    const pista = R
      ? { supl: n(R.col_12), extr: n(R.col_14), desc: n(R.col_16) }
      : { supl: n(motor?.hrsSupl), extr: n(motor?.hrsExtr), desc: n(motor?.hrsDesc) };
    // si la hoja no cuadra, la asistencia es mejor pista para lo que cambió
    // la asistencia (Mi asistencia / Jibble) es la mejor pista; la hoja del mes, la segunda
    const pistas = motor && motor.hrsSupl != null ? [{ supl: n(motor.hrsSupl), extr: n(motor.hrsExtr), desc: n(motor.hrsDesc) }, pista] : [pista];
    let hit: { supl: number; extr: number; desc: number } | null = null;
    for (const p of pistas) { hit = horasQueCuadran(E, base, p); if (hit) break; }
    if (hit) {
      hrsSupl = hit.supl; hrsExtr = hit.extr; hrsDesc = hit.desc;
      valSupl = valorHoras(hrsSupl, base, 1.5); valExtr = valorHoras(hrsExtr, base, 2); valDesc = round2(E - valSupl - valExtr);
      fuenteHoras = "reconstruido";
    } else {
      valSupl = E; hrsSupl = round2(E / (base / 240 * 1.5)); fuenteHoras = "aproximado";
    }
    if (R) dif.push({ tipo: "horas", concepto: "Horas extra", pagado: E, hoja: sheetExtras, detalle: `La hoja del mes dice ${sheetExtras.toFixed(2)} y el historial pagado ${E.toFixed(2)}. Se muestra lo pagado.` });
  }
  if (motor && E > 0 && motor.hrsSupl != null) {
    const marc = round2(valorHoras(n(motor.hrsSupl), base, 1.5) + valorHoras(n(motor.hrsExtr), base, 2) + valorHoras(n(motor.hrsDesc), base, 2));
    if (!cerca(marc, E, 0.5)) dif.push({ tipo: "horas_asistencia", concepto: "Horas extra según Mi asistencia", pagado: E, asistenciaHoy: marc, horasAsistencia: { supl: n(motor.hrsSupl), extr: n(motor.hrsExtr), desc: n(motor.hrsDesc) }, diferencia: round2(marc - E) });
  }

  // ── Décimos y fondo ──
  const A = round2(sueldo + bono + C + E);
  const dec14Ley = sbuDe(inp.anio) / 12;
  let dec13 = 0, dec14 = 0, fondo = 0, fuenteDec = "regla";
  if (R && cerca(n(R.col_18) + n(R.col_19) + n(R.col_20), D)) {
    dec13 = n(R.col_18); dec14 = n(R.col_19); fondo = n(R.col_20); fuenteDec = "hoja";
  } else {
    dec13 = A / 12; dec14 = dec14Ley; fondo = D - dec13 - dec14;
    if (fondo < 0 && fondo > -0.05) fondo = 0;
    if (Math.abs(fondo) < TOL) fondo = 0;
    if (fondo < 0) { // pagaron menos que 13° + 14° completos: proporcional (p. ej. ingreso a mitad de mes)
      dif.push({ tipo: "decimos", concepto: "Décimos", pagado: D, esperado: round2(dec13 + dec14), detalle: "Lo pagado en 13°+14° es menor que la regla (A/12 + SBU/12)." });
      dec14 = Math.max(0, D - dec13); fondo = 0;
    }
  }
  if (fondo > 0 && !cerca(fondo, A * FONDO_RESERVA_PCT, 0.1)) {
    dif.push({ tipo: "fondo", concepto: "Fondo de reserva", pagado: round2(fondo), esperado: round2(A * FONDO_RESERVA_PCT) });
  }

  // ── Redondeo: las líneas a 2 decimales suman exactamente el total pagado ──
  const L = {
    sueldo, bono, comFacialesSolo: fer.fac, comExtras: fer.ext, comRecepcion: fer.rec, comPaquetes: J, comProductos: K,
    valSupl: round2(valSupl), valExtr: round2(valExtr), valDesc: round2(valDesc),
    dec14: round2(dec14), fondoReserva: round2(fondo),
  };
  const sinDec13 = round2(Object.values(L).reduce((a, b) => a + b, 0));
  const dec13r = round2(totalPagado - sinDec13);
  if (!cerca(dec13r, dec13, 0.03)) dif.push({ tipo: "total", concepto: "Total ingresos", pagado: totalPagado, suma: round2(sinDec13 + dec13), detalle: "El total pagado no coincide con la suma de sus partes." });

  // ── Descuentos ──
  const iess = inp.afiliada ? round2(A * IESS_PERSONAL_PCT) : 0;
  let anticipo = 0, prestHip = 0, prestQuir = 0, prestOtro = 0, multas = 0, fuenteEgr = "hoja";
  let multasDetalle: Row[] = [];
  if (V) {
    anticipo = round2(n(V.col_2)); prestHip = round2(n(V.col_3)); prestQuir = round2(n(V.col_4)); prestOtro = round2(n(V.col_5)); multas = round2(n(V.col_6));
  } else if (R) {
    multas = round2(n(R.col_23));
  } else {
    const x = inp.egresosSinHoja;
    multas = round2(n(x?.multas)); prestHip = round2(n(x?.prestHip)); prestQuir = round2(n(x?.prestQuir)); prestOtro = round2(n(x?.prestOtro));
    multasDetalle = x?.multasDetalle || [];
    fuenteEgr = "sistema";
  }
  if (R && V && !cerca(anticipo + prestHip + prestQuir + prestOtro + multas, n(R.col_23))) {
    multas = round2(n(R.col_23) - anticipo - prestHip - prestQuir - prestOtro);
  }
  const egresos = round2(anticipo + prestHip + prestQuir + prestOtro + multas);
  const totalEgresos = round2(iess + egresos);
  const neto = round2(totalPagado - totalEgresos);
  if (R && !cerca(neto, n(R.col_24), 0.03) && cerca(n(R.col_21), totalPagado)) {
    dif.push({ tipo: "neto", concepto: "Neto a recibir", calculado: neto, hoja: round2(n(R.col_24)) });
  }
  if (R && !cerca(n(R.col_21), totalPagado)) {
    dif.push({ tipo: "hoja_vs_historial", concepto: "Total ingresos", pagado: totalPagado, hoja: round2(n(R.col_21)), netoHoja: round2(n(R.col_24)), netoHistorial: neto, detalle: "La hoja del mes y el historial pagado no tienen el mismo total." });
  }
  if (!R) dif.push({ tipo: "sin_hoja", concepto: "Neto a recibir", calculado: neto, detalle: "Ese mes no tiene hoja de rol: el neto se calculó con el IESS 9.45 % y los descuentos del sistema." });

  const iessPatronal = round2(n(h.iess_patronal_11_15)) || round2(A * 0.1115);
  const d: Row = {
    nombre: s(h.empleada), nombreCompleto: elegirNombreLegal(inp.emp?.apellidos_y_nombres, h.empleada), cedula: cedulaNorm(h.cedula), cargo: s(inp.emp?.cargo) || s(R?.col_3),
    periodo: inp.periodo, etiqueta: inp.etiqueta, anio: inp.anio, mes: inp.mes,
    sueldoBase: base, sueldo, bono,
    hrsOrdinarias: H ? round2(n(H.col_3)) : (R ? round2(n(R.col_4)) : round2(n(motor?.hrsOrdinarias))),
    diasTrabajados: H ? n(H.col_4) : (motor?.diasLaborados ?? ""),
    diasAsumidos: H ? n(H.col_8) : 0,
    faltas: H ? n(H.col_9) : 0,
    diasJibble: H ? n(H.col_4) + n(H.col_8) : "",
    comFacialesSolo: L.comFacialesSolo, comExtras: L.comExtras, comRecepcion: L.comRecepcion,
    comFaciales: round2(L.comFacialesSolo + L.comExtras + L.comRecepcion),
    comPaquetes: L.comPaquetes, comProductos: L.comProductos, comisiones: C,
    hrsSupl: round2(hrsSupl), valSupl: L.valSupl, hrsExtr: round2(hrsExtr), valExtr: L.valExtr, hrsDesc: round2(hrsDesc), valDesc: L.valDesc,
    extras: E,
    ingresoAportable: A,
    dec13: dec13r, dec14: L.dec14, fondoReserva: L.fondoReserva,
    dec13Mensual: true, dec14Mensual: true, fondoMensual: L.fondoReserva > 0,
    totalIngresos: totalPagado,
    afiliada: inp.afiliada, iessPct: IESS_PERSONAL_PCT, iess,
    anticipo, prestHip, prestQuir, prestOtro, multas, multasDetalle,
    egresos, totalEgresos, totalRecibir: neto, neto,
    aportesPatronal: { iess: iessPatronal, secap: 0, iece: 0, total: iessPatronal, costoEmpresa: round2(n(h.costo_empresa)) },
    fuente: "historial", fuenteHoras: "Historial RRHH",
    fuentes: { comisiones: fuenteCom, horas: fuenteHoras, decimos: fuenteDec, egresos: fuenteEgr },
    detalleVersion: 1,
  };
  return { d, diferencias: dif };
}

/** Lee todo lo que hace falta y arma el detalle. `conMotor` corre el motor de comisiones y la asistencia (más lento). */
export async function detalleHistorialDe(ctx: Ctx, hist: Row, periodo: string, etiqueta: string, conMotor = true): Promise<{ d: Row; diferencias: Row[] }> {
  const m = periodo.match(/^([A-Z]+)_(\d{4})$/);
  const mes = m ? (MESES_NUM[m[1]] || 0) : 0;
  const anio = m ? Number(m[2]) : 0;
  const emps = await ctx.db.all("rrhh_empleadas").catch(() => [] as Row[]);
  const ced = cedulaNorm(hist.cedula);
  const emp = emps.find((r) => ced && cedulaNorm(r.cedula) === ced) || null;
  const nombreApp = s(emp?.nombre_app) || s(hist.empleada);
  let hoja: HojaMes | null = null;
  if (anio && mes) {
    const filas = await ctx.db.all(`rrhh_rol_${anio}_${String(mes).padStart(2, "0")}`).catch(() => [] as Row[]);
    if (filas.length) hoja = filasDeHoja(filas, ced, nombreApp);
  }
  const users = await ctx.db.all("usuarios").catch(() => [] as Row[]);
  const { personaEsRecepcionista } = await import("./domain.ts");
  const esRecepcion = /RECEP/i.test(s(emp?.cargo)) || personaEsRecepcionista(nombreApp, users);
  const overlays = await ctx.db.all("beta_empleados").catch(() => [] as Row[]);
  const { afiliadaSegunOverlay, fichaIessDe } = await import("./empleados_api.ts");
  const afiliada = afiliadaSegunOverlay(overlays, nombreApp);
  let motor: Motor | null = null;
  let egresosSinHoja: EntradaDetalle["egresosSinHoja"];
  if (conMotor && anio && mes) {
    try {
      const { comisionesDeTablas } = await import("./handlers_extra.ts");
      const c = await comisionesDeTablas(ctx, nombreApp, anio, mes);
      motor = { ...c };
    } catch { motor = null; }
    try {
      const { horasDeEmpleada } = await import("./asistencia_api.ts");
      const hh = await horasDeEmpleada(ctx, nombreApp, anio, mes) as unknown as Row;
      if (hh && hh.hayDatos) {
        motor = { ...(motor || { comFaciales: 0, comExtras: 0, comRecepcion: 0, comPaquetes: 0, comProductos: 0 }), hrsSupl: n(hh.hrsSupl), hrsExtr: n(hh.hrsExtr), hrsDesc: n(hh.hrsDesc), hrsOrdinarias: n(hh.hrsOrdinarias), diasLaborados: hh.diasLaborados as number | null };
      }
    } catch { /* sin asistencia */ }
  }
  if (!hoja?.resumen && anio && mes) {
    let multas = n(motor?.multas);
    const multasDetalle: Row[] = [];
    try {
      const { cicloInicio, cicloFin } = await import("./domain.ts");
      const ini = cicloInicio(`${anio}-${String(mes).padStart(2, "0")}-25`), fin = cicloFin(ini);
      const { multasBetaRol, esTipoDescuento } = await import("./multas_beta_api.ts");
      const mb = await multasBetaRol(ctx.db, nombreApp, ini, fin);
      multas = round2(multas + n(mb.total));
      for (const x of mb.detalle || []) {
        const clase = esTipoDescuento((x as Row).tipo) || esTipoDescuento((x as Row).concepto) ? "DESCUENTO" : "MULTA";
        const conc = s((x as Row).concepto);
        multasDetalle.push({ ...x, tipo: clase + (conc && !esTipoDescuento(conc) ? " " + conc : "") });
      }
    } catch { /* sin multas beta */ }
    let ficha = { hip: 0, quir: 0, otros: 0 };
    try { ficha = await fichaIessDe(ctx, nombreApp, `${anio}-${String(mes).padStart(2, "0")}-25`); } catch { /* sin ficha */ }
    egresosSinHoja = { multas, prestHip: ficha.hip, prestQuir: ficha.quir, prestOtro: ficha.otros, multasDetalle };
  }
  const out = armarDetalleHistorial({ hist, periodo, etiqueta, anio, mes, hoja, emp, esRecepcion, afiliada, motor, egresosSinHoja });
  const look = await mapaNombresLegales(ctx);
  const legal = look(nombreApp, ced) || elegirNombreLegal(emp?.apellidos_y_nombres, hist.empleada);
  return { d: snapConNombreLegal(out.d, legal), diferencias: out.diferencias };
}

/** Detalle congelado (beta_rol_hist_detalle) si existe; si no, se arma al vuelo. */
export async function detalleGuardadoDe(ctx: Ctx, periodo: string, cedula: string): Promise<Row | null> {
  const rows = await ctx.db.all("beta_rol_hist_detalle").catch(() => [] as Row[]);
  const ced = cedulaNorm(cedula);
  const hit = rows.find((r) => s(r.periodo).toUpperCase() === periodo.toUpperCase() && cedulaNorm(r.cedula) === ced);
  if (!(hit && hit.detalle && typeof hit.detalle === "object")) return null;
  const d = hit.detalle as Row;
  const look = await mapaNombresLegales(ctx);
  return snapConNombreLegal(d, look(d.nombre, ced || d.cedula));
}
