// Clasificación de horas del rol mensual, réplica de procesarHorasJibble (SUNSU RRHH).
// Fuente de un día YA PASADO: asistencia beta; si no hay marcas, jibble_historial importado.
// Hoy (Guayaquil) y los días que faltan hasta el último día del mes se ASUMEN como
// jornada completa (el rol se genera ~26–28; en un mes de 30 días eso llega al 30).
import { round2 } from "./domain.ts";

export type HorarioRol = { diasDescanso: number[]; jornadaMins: number; etiqueta?: string };

/** Mapa histórico del script RRHH, solo si la persona no tiene horario asignado en la beta. */
export const HORARIOS_RRHH: Record<string, HorarioRol> = {
  "Andrea": { diasDescanso: [0, 6], jornadaMins: 480, etiqueta: "Lun-Vie 8h" },
  "Andrea Robles": { diasDescanso: [0, 6], jornadaMins: 480, etiqueta: "Lun-Vie 8h" },
  "Daniela": { diasDescanso: [0, 1], jornadaMins: 540, etiqueta: "Mar-Sáb 9h" },
  "Daniela Mora": { diasDescanso: [0, 1], jornadaMins: 540, etiqueta: "Mar-Sáb 9h" },
  "Alejandra": { diasDescanso: [0, 1], jornadaMins: 540, etiqueta: "Mar-Sáb 9h" },
  "Alejandra Rodriguez": { diasDescanso: [0, 1], jornadaMins: 540, etiqueta: "Mar-Sáb 9h" },
  "Dejaneira": { diasDescanso: [0, 1], jornadaMins: 540, etiqueta: "Mar-Sáb 9h" },
  "Dejaneira Espinoza": { diasDescanso: [0, 1], jornadaMins: 540, etiqueta: "Mar-Sáb 9h" },
};

/** ¿La persona está en el mapa histórico del script RRHH? (esas siguen igual que lo pagado). */
export function enMapaRrhh(nombre: string): boolean {
  const n = String(nombre || "").trim();
  return !!(HORARIOS_RRHH[n] || HORARIOS_RRHH[n.split(/\s+/)[0] || ""]);
}

const DOW: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const hm = (x: string | null | undefined) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(x || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };

/** TK173: horario fijo de la tabla `horarios` → descansos y jornada del rol (jornada = la más común entre
 *  los días que trabaja; con almuerzo pagado es el tramo completo, igual que el mapa Mar-Sáb 9h). */
export function horarioRolDeTabla(h: { nombre?: string; arreglo?: string; descansosTipo?: string; dias: { dia: string; trabaja: boolean; desde: string | null; hasta: string | null }[]; descansos?: { duracionMin: number }[] }): HorarioRol | null {
  if (!h || (h.arreglo && h.arreglo !== "fijo")) return null;
  const trabaja = h.dias.filter((d) => d.trabaja && DOW[d.dia] != null);
  if (!trabaja.length) return null;
  const set = new Set(trabaja.map((d) => DOW[d.dia]));
  const impago = h.descansosTipo === "pago" ? 0 : (h.descansos || []).reduce((a, d) => a + (Number(d.duracionMin) || 0), 0);
  const cuenta: Record<number, number> = {};
  for (const d of trabaja) { const m = Math.max(0, hm(d.hasta) - hm(d.desde) - impago); if (m > 0) cuenta[m] = (cuenta[m] || 0) + 1; }
  const jornada = Number(Object.entries(cuenta).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0]?.[0] || 480);
  return { diasDescanso: [0, 1, 2, 3, 4, 5, 6].filter((x) => !set.has(x)), jornadaMins: jornada, etiqueta: h.nombre || "Horario asignado" };
}

export function horarioRrhhDe(nombre: string): HorarioRol {
  const n = String(nombre || "").trim();
  if (HORARIOS_RRHH[n]) return HORARIOS_RRHH[n];
  const first = n.split(/\s+/)[0] || "";
  if (HORARIOS_RRHH[first]) return HORARIOS_RRHH[first];
  return { diasDescanso: [0], jornadaMins: 480, etiqueta: "Domingo descanso, 8h" };
}

export type DiaHorasRol = {
  fecha: string;
  nomMin: number;
  suplMin: number;
  festMin: number;
  descMin: number;
  noctMin?: number;
  fuente?: "marcaje" | "jibble" | "permiso" | "";
};

export type HorasRolOut = {
  diasTrabajados: number;
  diasAsumidos: number;
  diasFalta: number;
  fechasFalta: string[];
  diasFest: number;
  diasDesc: number;
  diasPermiso: number;
  /** TK170: días del mes antes de la fecha de ingreso (no se pagan ni son faltas). */
  diasNoContratada?: number;
  minsNomina: number;
  hrsNomina: number;
  hrsSupl: number;
  hrsExtr: number;
  hrsDesc: number;
  hrsOrdinarias: number;
  hrsNoct: number;
  jornadaMins: number;
  regla: string;
};

function ymdUtc(anio: number, mes: number, d: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function recorte15(mins: number): number {
  return Math.floor(Math.max(0, mins) / 15) * 15;
}

/**
 * Recorre 1…último día del mes calendario (en noviembre, el 30).
 * esFuturo = fecha >= hoy (America/Guayaquil): HOY también se asume,
 * porque el día todavía no termina (comentario del script RRHH).
 */
export function clasificarHorasRol(opts: {
  anio: number; mes: number; hoy: string;
  horario: HorarioRol;
  feriados: string[];
  dias: Record<string, DiaHorasRol | undefined>;
  permisos?: string[];
  /** TK170: fecha de ingreso; los días anteriores del mes no cuentan. */
  ingreso?: string | null;
}): HorasRolOut {
  const fer = new Set((opts.feriados || []).map((f) => String(f).slice(0, 10)));
  const perm = new Set((opts.permisos || []).map((f) => String(f).slice(0, 10)));
  const hoy = String(opts.hoy || "").slice(0, 10);
  const jornada = opts.horario.jornadaMins || 480;
  const descanso = new Set(opts.horario.diasDescanso || [0]);
  const last = new Date(Date.UTC(opts.anio, opts.mes, 0)).getUTCDate();

  let minsNomina = 0, minsSupl = 0, minsFest = 0, minsDesc = 0, minsNoct = 0;
  let diasTrabajados = 0, diasAsumidos = 0, diasFalta = 0, diasFest = 0, diasDesc = 0, diasPermiso = 0;
  const fechasFalta: string[] = [];

  const ingreso = String(opts.ingreso || "").slice(0, 10);
  let diasNoContratada = 0;
  for (let d = 1; d <= last; d++) {
    const fecha = ymdUtc(opts.anio, opts.mes, d);
    if (ingreso && fecha < ingreso) { diasNoContratada++; continue; }
    const dow = new Date(Date.UTC(opts.anio, opts.mes - 1, d)).getUTCDay();
    const esDesc = descanso.has(dow);
    const esFest = fer.has(fecha);
    const esFuturo = !!hoy && fecha >= hoy;
    const dato = opts.dias[fecha];
    const nom = dato && dato.nomMin > 0 ? dato.nomMin : 0;

    // TK199: un feriado que cae en día de descanso se paga y se muestra como feriado (mismo 100 %).
    if (esDesc && esFest && !esFuturo && nom > 0) {
      diasFest++;
      minsFest += (dato?.festMin || 0) + (dato?.descMin || 0) || nom;
      minsNomina += nom;
      minsNoct += dato?.noctMin || 0;
      continue;
    }
    if (esDesc) {
      if (nom > 0) {
        diasDesc++;
        minsDesc += dato?.descMin || 0;
        minsNomina += nom;
        minsNoct += dato?.noctMin || 0;
      }
      continue;
    }
    if (esFuturo) {
      diasAsumidos++;
      minsNomina += jornada;
      if (esFest) { diasFest++; minsNomina -= jornada; }
      continue;
    }
    if (nom > 0) {
      if (esFest) {
        diasFest++;
        minsFest += (dato?.festMin || nom);
      } else {
        diasTrabajados++;
        minsSupl += dato?.suplMin || 0;
        minsFest += dato?.festMin || 0;
      }
      minsNomina += nom;
      minsNoct += dato?.noctMin || 0;
      continue;
    }
    if (perm.has(fecha)) {
      diasPermiso++;
      continue;
    }
    diasFalta++;
    fechasFalta.push(fecha.slice(8) + "/" + fecha.slice(5, 7));
  }

  const suplR = recorte15(minsSupl);
  const festR = recorte15(minsFest);
  const descR = recorte15(minsDesc);
  return {
    diasTrabajados, diasAsumidos, diasFalta, fechasFalta, diasFest, diasDesc, diasPermiso, diasNoContratada,
    minsNomina,
    hrsNomina: round2(minsNomina / 60),
    hrsSupl: round2(suplR / 60),
    hrsExtr: round2(festR / 60),
    hrsDesc: round2(descR / 60),
    hrsOrdinarias: round2(Math.max(0, minsNomina - minsSupl - minsFest - minsDesc) / 60),
    hrsNoct: round2(recorte15(minsNoct) / 60),
    jornadaMins: jornada,
    regla: "Hoy y los días que faltan hasta el fin de mes (calendario; en un mes de 30 días, hasta el 30) se asumen como jornada completa. Las faltas solo cuentan días ya pasados, que tocaba trabajar, sin marca de asistencia ni historial importado de Jibble.",
  };
}
