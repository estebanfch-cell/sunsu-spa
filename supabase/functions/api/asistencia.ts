// Asistencia propia. Sustituye las horas que antes venían de Jibble.
// La nómina sigue el mes calendario. Suplementarias +50% (tope 4 h/día y 12 h/semana),
// extraordinarias 00:00–06:00 +100%, sábado/domingo/feriado como descanso +100%.
// Un día sin marcas y sin fila en jibble_historial no recorta el sueldo: si nadie
// ha marcado en el mes, el rol paga el mes completo, igual que cuando Jibble no respondía.

import { ecuadorParts, n, pad, round2 } from "./domain.ts";

export type TipoMarca = "entrada" | "salida" | "almuerzo_inicio" | "almuerzo_fin";

export interface AsistenciaConfig {
  lat: number | null;
  lng: number | null;
  radio_m: number;
  hora_entrada: string;
  hora_salida: string;
  jornada_horas: number;
  gracia_min: number;
  cuenta_antes: boolean;
}

export const CONFIG_DEF: AsistenciaConfig = {
  lat: null, lng: null, radio_m: 150,
  hora_entrada: "09:00", hora_salida: "18:00", jornada_horas: 8, gracia_min: 10, cuenta_antes: false,
};

export interface MarcajeIn {
  id?: string;
  nombre: string;
  tipo: string;
  ts: string;
  anulado?: boolean;
}

export interface PermisoIn {
  tipo: string;
  estado: string;
  desde: string;
  hasta: string;
  horas: number;
}

export interface JibbleIn {
  fecha: string;
  payrollMin: number;
  suplMin: number;
  extrMin: number;
  descMin: number;
}

export interface DiaAsistencia {
  fecha: string;
  fuente: "marcaje" | "jibble" | "permiso" | "vacio";
  workedMin: number;
  ordinaryMin: number;
  suplMin: number;
  extrMin: number;
  descMin: number;
  atrasoMin: number;
  almuerzoMin: number;
  abierto: boolean;
  almuerzoPendiente: boolean;
  falta: boolean;
  diaContado: boolean;
}

export interface NominaHoras {
  hayDatos: boolean;
  diasLaborados: number | null;
  hrsSupl: number;
  hrsExtr: number;
  hrsDesc: number;
  atrasoMin: number;
  faltas: number;
  suplExcesoMin: number;
  hrsTrabajadas: number;
  hrsOrdinarias: number;
  hrsAlmuerzo: number;
  diasJibble: number;
  diasPropios: number;
  dias: DiaAsistencia[];
}

export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const r1 = lat1 * Math.PI / 180;
  const r2 = lat2 * Math.PI / 180;
  const dlat = (lat2 - lat1) * Math.PI / 180;
  const dlng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(r1) * Math.cos(r2) * Math.sin(dlng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function instanteEcuador(ymd: string, hm: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh + 5, mm || 0, 0)).toISOString();
}

function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function ymdDe(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (v.includes("T")) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return ecuadorParts(d).ymd;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return "";
}

function aprobado(estado: string): boolean {
  return /aprob/i.test(estado);
}

function esVacacion(tipo: string): boolean {
  return /vacac/i.test(tipo);
}

function permisoEn(permisos: PermisoIn[], fecha: string, jornada: number): { full: boolean; horas: number } {
  let full = false;
  let horas = 0;
  for (const p of permisos) {
    if (!aprobado(p.estado)) continue;
    const a = ymdDe(p.desde);
    const b = ymdDe(p.hasta || p.desde);
    if (!a || fecha < a || fecha > (b || a)) continue;
    horas += n(p.horas);
    if (esVacacion(p.tipo) || n(p.horas) >= jornada || (b && b > a)) full = true;
  }
  if (horas >= jornada) full = true;
  return { full, horas };
}

function laboral(fecha: string, feriados: Set<string>): boolean {
  const [y, m, d] = fecha.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow !== 0 && dow !== 6 && !feriados.has(fecha);
}

interface ClaseMin { dentro: number; supl: number; extr: number; desc: number }

function clasificarIntervalo(inicio: string, fin: string, config: AsistenciaConfig, feriados: Set<string>): ClaseMin {
  const out = { dentro: 0, supl: 0, extr: 0, desc: 0 };
  let t = new Date(inicio).getTime();
  const end = new Date(fin).getTime();
  if (!(end > t)) return out;
  const entrada = hmToMin(config.hora_entrada);
  const salida = hmToMin(config.hora_salida);
  while (t < end) {
    const p = ecuadorParts(new Date(t));
    const hh = p.hh === 24 ? 0 : p.hh;
    const cur = hh * 60 + p.mm;
    if (feriados.has(p.ymd) || p.dow === 0 || p.dow === 6) out.desc++;
    else if (hh < 6) out.extr++;
    else if (!config.cuenta_antes && cur < entrada) { /* llegada temprana no se paga */ }
    else if (cur >= entrada && cur < salida) out.dentro++;
    else out.supl++;
    t += 60000;
  }
  return out;
}

function sumarClase(a: ClaseMin, b: ClaseMin): ClaseMin {
  return { dentro: a.dentro + b.dentro, supl: a.supl + b.supl, extr: a.extr + b.extr, desc: a.desc + b.desc };
}

export function validarSecuencia(marcajes: MarcajeIn[], tipo: string): string | null {
  const vivos = marcajes.filter((m) => !m.anulado).slice().sort((a, b) => a.ts.localeCompare(b.ts));
  const lastEntrada = vivos.map((m) => m.tipo).lastIndexOf("entrada");
  const lastSalida = vivos.map((m) => m.tipo).lastIndexOf("salida");
  const abierto = lastEntrada > lastSalida;
  if (!abierto) return tipo === "entrada" ? null : "Primero marca la entrada.";
  if (tipo === "entrada") return "Ya tienes una entrada abierta. Marca la salida antes de otra entrada.";
  const despues = vivos.slice(lastEntrada + 1);
  const lunchIn = despues.some((m) => m.tipo === "almuerzo_inicio");
  const lunchOut = despues.some((m) => m.tipo === "almuerzo_fin");
  if (tipo === "almuerzo_inicio") return lunchIn ? "El almuerzo ya empezó." : null;
  if (tipo === "almuerzo_fin") {
    if (!lunchIn) return "Primero marca el inicio del almuerzo.";
    if (lunchOut) return "El almuerzo ya terminó.";
    return null;
  }
  if (tipo === "salida") return lunchIn && !lunchOut ? "Cierra el almuerzo antes de salir." : null;
  return "Tipo de marca desconocido.";
}

export interface RelojHoy {
  accion: "entrada" | "salida";
  etiqueta: string;
  almuerzo: "inicio" | "fin" | null;
  abierto: boolean;
  transcurridoMin: number;
  recuerda: string;
}

/** Botón grande: entrada si no hay jornada abierta; si no, salida, con almuerzo al lado. */
export function estadoReloj(marcajes: MarcajeIn[], ahoraIso: string): RelojHoy {
  const vivos = marcajes.filter((m) => !m.anulado).slice().sort((a, b) => a.ts.localeCompare(b.ts));
  const lastEntrada = vivos.map((m) => m.tipo).lastIndexOf("entrada");
  const lastSalida = vivos.map((m) => m.tipo).lastIndexOf("salida");
  const abierto = lastEntrada > lastSalida;
  if (!abierto) {
    return { accion: "entrada", etiqueta: "Marcar entrada", almuerzo: null, abierto: false, transcurridoMin: 0, recuerda: "Recuerda marcar tu entrada." };
  }
  const entrada = vivos[lastEntrada];
  const despues = vivos.slice(lastEntrada + 1);
  const lunchIn = despues.find((m) => m.tipo === "almuerzo_inicio");
  const lunchOut = despues.find((m) => m.tipo === "almuerzo_fin");
  const almuerzo = !lunchIn ? "inicio" : !lunchOut ? "fin" : null;
  let ms = new Date(ahoraIso).getTime() - new Date(entrada.ts).getTime();
  if (lunchIn) {
    const fin = lunchOut ? new Date(lunchOut.ts).getTime() : new Date(ahoraIso).getTime();
    ms -= Math.max(0, fin - new Date(lunchIn.ts).getTime());
  }
  return {
    accion: "salida", etiqueta: "Marcar salida", almuerzo, abierto: true,
    transcurridoMin: Math.max(0, Math.round(ms / 60000)),
    recuerda: "Recuerda marcar tu salida.",
  };
}

export function evaluarUbicacion(config: AsistenciaConfig, lat: number | null, lng: number | null, accuracy: number | null): { ok: true; distancia: number | null } | { ok: false; error: string; distancia?: number } {
  if (config.lat == null || config.lng == null) return { ok: false, error: "Falta la ubicación del spa. Un admin la guarda en Asistencia." };
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return { ok: false, error: "Activa la ubicación del teléfono. Sin eso no se puede marcar." };
  if (accuracy != null && accuracy > config.radio_m * 2) return { ok: false, error: "La ubicación es muy imprecisa. Acércate a una ventana o marca desde el spa." };
  const distancia = distanciaMetros(lat, lng, config.lat, config.lng);
  if (distancia > config.radio_m) return { ok: false, error: `Estás a ${Math.round(distancia)} m del spa. El radio es ${config.radio_m} m.`, distancia };
  return { ok: true, distancia };
}

function marcasDelDia(marcajes: MarcajeIn[], fecha: string): MarcajeIn[] {
  return marcajes.filter((m) => !m.anulado && ymdDe(m.ts) === fecha).sort((a, b) => a.ts.localeCompare(b.ts));
}

export function calcularDia(fecha: string, marcajes: MarcajeIn[], config: AsistenciaConfig, feriados: string[], permisos: PermisoIn[], jibble?: JibbleIn | null): DiaAsistencia {
  const fer = new Set(feriados);
  const perm = permisoEn(permisos, fecha, config.jornada_horas);
  const delDia = marcasDelDia(marcajes, fecha);
  const vacio: DiaAsistencia = {
    fecha, fuente: "vacio", workedMin: 0, ordinaryMin: 0, suplMin: 0, extrMin: 0, descMin: 0,
    atrasoMin: 0, almuerzoMin: 0, abierto: false, almuerzoPendiente: false, falta: false, diaContado: false,
  };
  if (!delDia.length) {
    if (jibble && (jibble.payrollMin || jibble.suplMin || jibble.extrMin || jibble.descMin)) {
      return {
        ...vacio, fuente: "jibble", workedMin: jibble.payrollMin, ordinaryMin: jibble.payrollMin,
        suplMin: jibble.suplMin, extrMin: jibble.extrMin, descMin: jibble.descMin, diaContado: true,
      };
    }
    if (perm.full) return { ...vacio, fuente: "permiso", diaContado: true };
    if (laboral(fecha, fer)) return { ...vacio, falta: true };
    return vacio;
  }
  const entrada = delDia.find((m) => m.tipo === "entrada");
  const salida = [...delDia].reverse().find((m) => m.tipo === "salida" && entrada && m.ts > entrada.ts);
  const lunchIn = delDia.find((m) => m.tipo === "almuerzo_inicio" && entrada && m.ts > entrada.ts && (!salida || m.ts < salida.ts));
  const lunchOut = delDia.find((m) => m.tipo === "almuerzo_fin" && lunchIn && m.ts > lunchIn.ts && (!salida || m.ts <= salida.ts));
  const pEnt = entrada ? ecuadorParts(new Date(entrada.ts)) : null;
  const atraso = !entrada || !pEnt || !laboral(fecha, fer) || perm.full ? 0 : Math.max(0, (pEnt.hh === 24 ? 0 : pEnt.hh) * 60 + pEnt.mm - hmToMin(config.hora_entrada) - config.gracia_min);
  if (!entrada || !salida) {
    return { ...vacio, fuente: "marcaje", atrasoMin: atraso, abierto: !!entrada && !salida, diaContado: !!entrada, falta: false };
  }
  const tramos: [string, string][] = lunchIn && lunchOut
    ? [[entrada.ts, lunchIn.ts], [lunchOut.ts, salida.ts]]
    : [[entrada.ts, salida.ts]];
  let clase = { dentro: 0, supl: 0, extr: 0, desc: 0 };
  for (const [a, b] of tramos) clase = sumarClase(clase, clasificarIntervalo(a, b, config, fer));
  const tope = Math.round(config.jornada_horas * 60);
  const ordinaryMin = Math.min(clase.dentro, tope);
  const suplMin = clase.supl + Math.max(0, clase.dentro - tope);
  const workedMin = ordinaryMin + suplMin + clase.extr + clase.desc;
  const almuerzoMin = lunchIn && lunchOut ? Math.max(0, Math.round((new Date(lunchOut.ts).getTime() - new Date(lunchIn.ts).getTime()) / 60000)) : 0;
  return {
    fecha, fuente: "marcaje", workedMin, ordinaryMin, suplMin, extrMin: clase.extr, descMin: clase.desc,
    atrasoMin: atraso, almuerzoMin, abierto: false, almuerzoPendiente: !(lunchIn && lunchOut), falta: false, diaContado: true,
  };
}

function cadaFecha(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const [y, m, d] = desde.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  const end = hasta;
  while (true) {
    const ymd = `${cur.getUTCFullYear()}-${pad(cur.getUTCMonth() + 1)}-${pad(cur.getUTCDate())}`;
    if (ymd > end) break;
    out.push(ymd);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function lunesDe(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function calcularNomina(opts: {
  anio: number; mes: number;
  desde?: string; hasta?: string;
  marcajes: MarcajeIn[];
  jibble: JibbleIn[];
  permisos: PermisoIn[];
  config: AsistenciaConfig;
  feriados: string[];
  hoy?: string;
}): NominaHoras {
  const last = new Date(Date.UTC(opts.anio, opts.mes, 0)).getUTCDate();
  const desde = opts.desde || `${opts.anio}-${pad(opts.mes)}-01`;
  const hasta = opts.hasta || `${opts.anio}-${pad(opts.mes)}-${pad(last)}`;
  const dias = cadaFecha(desde, hasta);
  const jibblePorFecha = new Map(opts.jibble.map((j) => [j.fecha, j]));
  const crudos = dias.map((f) => calcularDia(f, opts.marcajes, opts.config, opts.feriados, opts.permisos, jibblePorFecha.get(f) || null));
  const primera = crudos.find((d) => d.fuente !== "vacio" && (d.diaContado || d.abierto || d.fuente === "permiso"));
  if (!primera) {
    return {
      hayDatos: false, diasLaborados: null, hrsSupl: 0, hrsExtr: 0, hrsDesc: 0, atrasoMin: 0, faltas: 0, suplExcesoMin: 0,
      hrsTrabajadas: 0, hrsOrdinarias: 0, hrsAlmuerzo: 0, diasJibble: 0, diasPropios: 0, dias: crudos,
    };
  }
  let suplPag = 0;
  let extr = 0;
  let desc = 0;
  let atraso = 0;
  let faltas = 0;
  let exceso = 0;
  let ordin = 0;
  let almuerzo = 0;
  let dJ = 0;
  let dP = 0;
  let semana = "";
  let usadoSemana = 0;
  const ajustados: DiaAsistencia[] = [];
  for (const d of crudos) {
    if (d.fecha < primera.fecha) { ajustados.push(d); continue; }
    const lunes = lunesDe(d.fecha);
    if (lunes !== semana) { semana = lunes; usadoSemana = 0; }
    const cupo = Math.min(d.suplMin, 4 * 60, Math.max(0, 12 * 60 - usadoSemana));
    const sobra = d.suplMin - cupo;
    usadoSemana += cupo;
    suplPag += cupo;
    exceso += sobra;
    extr += d.extrMin;
    desc += d.descMin;
    ordin += d.ordinaryMin;
    almuerzo += d.almuerzoMin;
    if (d.fuente === "jibble") dJ++;
    if (d.fuente === "marcaje" && d.diaContado) dP++;
    atraso += d.atrasoMin;
    const falta = d.falta && (!opts.hoy || d.fecha <= opts.hoy);
    if (falta) faltas++;
    ajustados.push({ ...d, suplMin: cupo, falta });
  }
  const diasPeriodo = dias.length;
  return {
    hayDatos: true,
    diasLaborados: diasPeriodo - faltas,
    diasPeriodo,
    hrsSupl: round2(suplPag / 60),
    hrsExtr: round2(extr / 60),
    hrsDesc: round2(desc / 60),
    atrasoMin: atraso,
    faltas,
    suplExcesoMin: exceso,
    hrsTrabajadas: round2((ordin + suplPag + extr + desc) / 60),
    hrsOrdinarias: round2(ordin / 60),
    hrsAlmuerzo: round2(almuerzo / 60),
    diasJibble: dJ,
    diasPropios: dP,
    dias: ajustados,
  };
}

export function configDesde(row: Record<string, unknown> | undefined): AsistenciaConfig {
  if (!row) return { ...CONFIG_DEF };
  return {
    lat: row.lat == null || row.lat === "" ? null : n(row.lat),
    lng: row.lng == null || row.lng === "" ? null : n(row.lng),
    radio_m: n(row.radio_m) || CONFIG_DEF.radio_m,
    hora_entrada: String(row.hora_entrada || CONFIG_DEF.hora_entrada),
    hora_salida: String(row.hora_salida || CONFIG_DEF.hora_salida),
    jornada_horas: n(row.jornada_horas) || CONFIG_DEF.jornada_horas,
    gracia_min: row.gracia_min == null ? CONFIG_DEF.gracia_min : n(row.gracia_min),
    cuenta_antes: row.cuenta_antes === true,
  };
}

// ---- Vacaciones (Código del Trabajo art. 69 y 71) ----
// 15 días por año completo; desde el 6.º año, +1 día por año (máximo 15 adicionales).
// Se pagan con la veinticuatroava parte de lo ganado en el año: sueldo/24 por mes, sueldo/2 por año.
// Regla Sunsu: no se toman ni se pagan antes del primer año completo.

export interface SaldoVacaciones {
  fechaIngreso: string | null;
  aniosCompletos: number;
  habilitada: boolean;
  diasGanados: number;
  diasTomados: number;
  diasPendientes: number;
  diasDisponibles: number;
  provisionMensual: number;
  valorDia: number;
  valorDisponible: number;
  proximoAniversario: string | null;
}

function diasEntre(desde: string, hasta: string): number {
  const a = ymdDe(desde); const b = ymdDe(hasta || desde) || a;
  if (!a) return 0;
  return Math.max(1, cadaFecha(a, b < a ? a : b).length);
}

export function aniosCompletos(ingreso: string, hoy: string): number {
  const [y1, m1, d1] = ingreso.split("-").map(Number);
  const [y2, m2, d2] = hoy.split("-").map(Number);
  let a = y2 - y1;
  if (m2 < m1 || (m2 === m1 && d2 < d1)) a--;
  return Math.max(0, a);
}

export function diasDeVacacion(p: { desde: string; hasta: string }): number {
  return diasEntre(p.desde, p.hasta);
}

export function saldoVacaciones(opts: { fechaIngreso: string | null; hoy: string; sueldo: number; permisos: PermisoIn[] }): SaldoVacaciones {
  const ingreso = opts.fechaIngreso ? ymdDe(opts.fechaIngreso) : "";
  const sueldo = n(opts.sueldo);
  const anios = ingreso ? aniosCompletos(ingreso, opts.hoy) : 0;
  let ganados = 0;
  for (let k = 1; k <= anios; k++) ganados += 15 + Math.min(15, Math.max(0, k - 5));
  const vac = opts.permisos.filter((p) => esVacacion(p.tipo));
  const tomados = vac.filter((p) => aprobado(p.estado)).reduce((s2, p) => s2 + diasEntre(p.desde, p.hasta), 0);
  const pendientes = vac.filter((p) => /pend/i.test(p.estado)).reduce((s2, p) => s2 + diasEntre(p.desde, p.hasta), 0);
  const disp = Math.max(0, ganados - tomados);
  let prox: string | null = null;
  if (ingreso) {
    const [y, m, d] = ingreso.split("-").map(Number);
    prox = `${y + anios + 1}-${pad(m)}-${pad(d)}`;
  }
  const valorDia = round2(sueldo / 30);
  return {
    fechaIngreso: ingreso || null, aniosCompletos: anios, habilitada: anios >= 1,
    diasGanados: ganados, diasTomados: tomados, diasPendientes: pendientes, diasDisponibles: disp,
    provisionMensual: round2(sueldo / 24), valorDia, valorDisponible: round2(valorDia * disp),
    proximoAniversario: prox,
  };
}

/** null si se puede pedir; si no, el motivo. */
export function validarSolicitudVacacion(saldo: SaldoVacaciones, dias: number): string | null {
  if (!saldo.fechaIngreso) return "Falta tu fecha de ingreso en RR.HH. Pídele a un admin que la cargue.";
  if (!saldo.habilitada) return `Las vacaciones se toman después del primer año completo (desde ${saldo.proximoAniversario}).`;
  const libre = saldo.diasDisponibles - saldo.diasPendientes;
  if (dias > libre) return `Pides ${dias} días y te quedan ${Math.max(0, libre)} disponibles.`;
  return null;
}
