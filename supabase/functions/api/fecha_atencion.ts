// TK210 (Emilia 21/11): fecha real de la atención y «Subido tarde».
// Un ticket que se sube un día calendario (America/Guayaquil) después de la atención guarda la fecha real
// en tickets.timestamp (cuadre, comisiones/ciclo y sesiones de paquete la usan) y deja created_at aparte.
// Desde este deploy, ese ticket paga el 50% de su comisión (servicios y productos). No es retroactivo.
import { s, type Row } from "./domain.ts";

/** Solo los tickets creados desde este instante pueden llevar el 50% (el flag lo escribe solo este código). */
export const SUBIDO_TARDE_DESDE = "2026-11-22T02:00:00Z";
export const FACTOR_SUBIDO_TARDE = 0.5;
export const ETIQUETA_TARDE = "Subido tarde · 50%";
/** Aviso al equipo: 15 días desde el deploy (21/11/2026), se apaga solo después de este día (Ecuador). */
export const AVISO_TARDE_HASTA = "2026-12-06";
export const AVISO_TARDE_TEXTO = "Desde hoy, los tickets deben subirse el mismo día de la atención. Los tickets subidos al día siguiente o después pagarán el 50% de la comisión.";
export const PROMPT_TARDE_TEXTO = "Este ticket se paga al 50% de comisión por subirse tarde.";
/** Más atrás que esto no se acepta como fecha de atención (error de tipeo). */
export const MAX_DIAS_ATRAS = 45;

const MESES: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8,
  sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

function ymd(y: number, m: number, d: number): string {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  if (dt.getUTCMonth() !== m - 1) return "";
  return dt.toISOString().slice(0, 10);
}
export function addDias(ymd0: string, n0: number): string {
  const t = new Date(s(ymd0).slice(0, 10) + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + n0);
  return t.toISOString().slice(0, 10);
}

/**
 * Fecha como la escriben las chicas: 20/11, 20/11/26, 20/11/2026, 20-11-2026, 20.11.2026, 2026-11-20,
 * «20 nov», «20 de noviembre», «ayer», «antier». Día primero (Ecuador). Sin año: el más reciente que no sea futuro.
 */
export function parseFechaStaff(v: unknown, hoy: string): string {
  const t = s(v).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!t) return "";
  if (t === "hoy") return hoy;
  if (t === "ayer") return addDias(hoy, -1);
  if (t === "antier" || t === "anteayer" || t === "antes de ayer") return addDias(hoy, -2);
  const yHoy = Number(hoy.slice(0, 4));
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  const sinAnio = (mm: number, dd: number) => {
    const a = ymd(yHoy, mm, dd);
    return a && a > hoy ? ymd(yHoy - 1, mm, dd) : a;
  };
  m = t.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?:\s*[\/.\-]\s*(\d{2,4}))?$/);
  if (m) {
    const d = Number(m[1]), mm = Number(m[2]);
    if (!m[3]) return sinAnio(mm, d);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return ymd(y, mm, d);
  }
  m = t.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]{3})[a-z]*\.?(?:\s*(?:de|del)?\s*(\d{2,4}))?$/);
  if (m && MESES[m[2]]) {
    const d = Number(m[1]), mm = MESES[m[2]];
    if (!m[3]) return sinAnio(mm, d);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return ymd(y, mm, d);
  }
  return "";
}

/** Día calendario Ecuador de un instante (created_at real en UTC). */
export function diaGyeDeInstante(v: unknown): string {
  const ms = Date.parse(s(v));
  if (!Number.isFinite(ms)) return "";
  return new Date(ms - 5 * 3600e3).toISOString().slice(0, 10);
}

/** Resuelve la fecha de atención que llega del formulario. Futuro o muy atrás → hoy (no se bloquea el envío). */
export function resolverFechaAtencion(raw: unknown, hoy: string): { fecha: string; tarde: boolean; dias: number; invalida: boolean } {
  const txt = s(raw).trim();
  if (!txt) return { fecha: hoy, tarde: false, dias: 0, invalida: false };
  const f = parseFechaStaff(txt, hoy);
  if (!f || f > hoy || f < addDias(hoy, -MAX_DIAS_ATRAS)) return { fecha: hoy, tarde: false, dias: 0, invalida: !!txt && f !== hoy };
  const dias = Math.round((Date.parse(hoy + "T12:00:00Z") - Date.parse(f + "T12:00:00Z")) / 86400000);
  return { fecha: f, tarde: dias > 0, dias, invalida: false };
}

/** Timestamp «pared» (como guarda la app: hora Ecuador con sufijo Z) al mediodía del día de atención. */
export function timestampAtencion(fecha: string): string {
  return fecha + "T12:00:00Z";
}

/** Campos de orig para un ticket subido tarde. */
export function origSubidoTarde(fecha: string, subidoAtWall: string, dias: number): Row {
  return { fecha_atencion: fecha, subido_tarde: true, comision_factor: FACTOR_SUBIDO_TARDE, subido_at: subidoAtWall, dias_tarde: dias };
}

/** Factor de comisión del ticket: 0.5 si se subió tarde desde el deploy; si no, 1. */
export function factorComisionTicket(r: Row | null | undefined): number {
  if (!r) return 1;
  const o = (r.orig && typeof r.orig === "object" ? r.orig : {}) as Row;
  if (o.subido_tarde !== true) return 1;
  const creado = s(r.created_at);
  if (creado) {
    const ms = Date.parse(creado.includes("T") || creado.includes(" ") ? creado.replace(" ", "T") : creado);
    if (Number.isFinite(ms) && ms < Date.parse(SUBIDO_TARDE_DESDE)) return 1;
  }
  const f = Number(o.comision_factor);
  return Number.isFinite(f) && f > 0 && f < 1 ? f : FACTOR_SUBIDO_TARDE;
}

export function esSubidoTarde(r: Row | null | undefined): boolean {
  return factorComisionTicket(r) < 1;
}

export function avisoTardeActivo(hoy: string): boolean {
  return !!hoy && hoy <= AVISO_TARDE_HASTA;
}
