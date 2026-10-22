// Horarios al estilo de Jibble: fijo, flexible, semanal y un ciclo rotativo
// (día por medio o un ciclo propio). Los avisos salen de ese horario.

import { ecuadorParts, normNombre, s } from "./domain.ts";
import { estadoReloj, type MarcajeIn } from "./asistencia.ts";

export type Arreglo = "fijo" | "flexible" | "semanal" | "rotativo";
export type OrigenAsignacion = "persona" | "grupo" | "default";

export interface DiaHorario {
  orden: number;
  dia: string;
  trabaja: boolean;
  desde: string | null;
  hasta: string | null;
  duracionMin: number | null;
}

export interface DescansoHorario {
  nombre: string;
  duracionMin: number;
  desde: string | null;
  hasta: string | null;
  franja: boolean;
}

export interface DeduccionHorario {
  nombre: string;
  duracionMin: number;
  umbralMin: number;
}

export interface Horario {
  id: string;
  nombre: string;
  arreglo: Arreglo;
  esDefault: boolean;
  descansosTipo: "pago" | "impago";
  excluirTemprana: boolean;
  horasSemana: number | null;
  finJornada: string | null;
  cicloDias: number | null;
  ancla: string | null;
  jibbleId: string | null;
  dias: DiaHorario[];
  descansos: DescansoHorario[];
  deducciones: DeduccionHorario[];
}

export interface AsignacionHorario {
  persona: string;
  horarioId: string | null;
  origen: OrigenAsignacion;
  jibblePersonId: string | null;
  grupo: string | null;
}

export interface AvisoReloj {
  tipo: "entrada" | "salida";
  texto: "Recuerda marcar entrada" | "Recuerda marcar salida";
}

const SEMANA = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SEMANA_CORTA: Record<string, string> = {
  sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday",
};

export function esRolAviso(rol: string): boolean {
  return rol === "cosmetologa" || rol === "asistente_cosmetologia";
}

export function diaSemana(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return SEMANA[new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay()];
}

export function hmDe(v: unknown): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return String(h).padStart(2, "0") + ":" + m[2];
}

export function isoDuracionMin(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  const t = String(v || "").trim();
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(t);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] || 0) * 60 + Number(m[2] || 0);
}

function hmAMin(hm: string | null): number | null {
  if (!hm) return null;
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function sumarMin(hm: string | null, min: number | null): string | null {
  const base = hmAMin(hm);
  if (base == null || min == null) return null;
  const t = Math.max(0, Math.min(24 * 60 - 1, base + min));
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}

function arregloDe(v: unknown): Arreglo {
  const t = String(v || "").toLowerCase();
  if (t.includes("rotat") || t.includes("altern") || t.includes("cycle") || t.includes("rotativ")) return "rotativo";
  if (t.includes("week")) return "semanal";
  if (t.includes("flex")) return "flexible";
  return "fijo";
}

function diaNombre(v: unknown, rotativo: boolean): string {
  const t = String(v ?? "").trim();
  const dayN = /^day\s*(\d+)$/i.exec(t);
  if (dayN) return String(Number(dayN[1]) || 1);
  if (/^\d+$/.test(t) || typeof v === "number") {
    const num = Number(t);
    if (rotativo) return String(num);
    if (num >= 0 && num <= 6) return SEMANA[num];
  }
  const key = t.slice(0, 3).toLowerCase();
  if (SEMANA_CORTA[key]) return SEMANA_CORTA[key];
  const full = SEMANA.find((d) => d.toLowerCase() === t.toLowerCase());
  return full || t;
}

function lista(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.value)) return lista(o.value);
  }
  return [];
}

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (o[k] != null && o[k] !== "") return o[k];
  return null;
}

export function slotRotativo(ymd: string, ancla: string, ciclo: number): number {
  const n = Math.max(1, ciclo || 1);
  const a = Date.parse(ancla + "T00:00:00Z");
  const b = Date.parse(ymd + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  const days = Math.round((b - a) / 86400000);
  return ((days % n) + n) % n + 1;
}

export function horarioDePersona(horarios: Horario[], asignaciones: AsignacionHorario[], persona: string): Horario | null {
  const a = asignaciones.find((x) => x.horarioId && normNombre(x.persona) === normNombre(persona));
  if (a) return horarios.find((h) => h.id === a.horarioId) || null;
  return horarios.find((h) => h.esDefault) || null;
}

export function jornadaDe(h: Horario, ymd: string): { trabaja: boolean; desde: string | null; hasta: string | null } {
  let dia: DiaHorario | undefined;
  if (h.arreglo === "rotativo") {
    const ciclo = h.cicloDias || h.dias.length || 1;
    const slot = String(slotRotativo(ymd, h.ancla || ymd, ciclo));
    dia = h.dias.find((d) => d.dia === slot) || h.dias[Number(slot) - 1];
  } else {
    const nombre = diaSemana(ymd);
    dia = h.dias.find((d) => d.dia === nombre || d.dia === nombre.slice(0, 3));
  }
  if (!dia || !dia.trabaja) return { trabaja: false, desde: null, hasta: null };
  const desde = dia.desde;
  const hasta = dia.hasta || (h.arreglo === "flexible" ? sumarMin(desde, dia.duracionMin) : null);
  return { trabaja: true, desde, hasta };
}

export function resolverAviso(opts: {
  rol: string;
  ahora: Date;
  horario: Horario | null;
  marcajes: MarcajeIn[];
}): AvisoReloj | null {
  if (!esRolAviso(opts.rol) || !opts.horario) return null;
  const p = ecuadorParts(opts.ahora);
  const j = jornadaDe(opts.horario, p.ymd);
  if (!j.trabaja || !j.desde) return null;
  const ahoraMin = (p.hh === 24 ? 0 : p.hh) * 60 + p.mm;
  const ini = hmAMin(j.desde);
  const fin = hmAMin(j.hasta);
  const vivos = opts.marcajes.filter((m) => !m.anulado);
  const entro = vivos.some((m) => m.tipo === "entrada" && ecuadorParts(new Date(m.ts)).ymd === p.ymd);
  const reloj = estadoReloj(opts.marcajes, opts.ahora.toISOString());
  if (!entro && ini != null && ahoraMin >= ini - 15 && ahoraMin <= ini + 10) {
    return { tipo: "entrada", texto: "Recuerda marcar entrada" };
  }
  if (reloj.abierto && fin != null && ahoraMin >= fin && ahoraMin <= fin + 30) {
    return { tipo: "salida", texto: "Recuerda marcar salida" };
  }
  return null;
}

function diaDeJibble(raw: Record<string, unknown>, orden: number, rotativo: boolean): DiaHorario {
  const dia = diaNombre(pick(raw, ["day", "Day", "dia"]), rotativo);
  const desde = hmDe(pick(raw, ["from", "fromTime", "from_time", "start", "startTime"]));
  const hasta = hmDe(pick(raw, ["to", "toTime", "to_time", "end", "endTime"]));
  const duracionMin = isoDuracionMin(pick(raw, ["duration", "Duration"]));
  return {
    orden,
    dia: rotativo && /^\d+$/.test(dia) ? String(Number(dia)) : dia,
    trabaja: raw.trabaja === false || raw.isRest === true ? false : true,
    desde, hasta, duracionMin,
  };
}

export function normalizarJibble(carga: { schedules?: unknown; people?: unknown; groups?: unknown }): {
  horarios: Omit<Horario, "id">[];
  asignaciones: AsignacionHorario[];
} {
  const horarios: Omit<Horario, "id">[] = lista(carga.schedules).map((raw) => {
    const arreglo = arregloDe(pick(raw, ["workArrangement", "work_arrangement", "arrangement"]));
    const days = lista(pick(raw, ["daySchedules", "day_schedules", "days"]));
    const rotativo = arreglo === "rotativo" || days.some((d) => /day\s*\d+/i.test(String(pick(d, ["day", "Day"]) || "")));
    const horas = isoDuracionMin(pick(raw, ["weeklyHours", "weekly_hours"]));
    return {
      nombre: s(pick(raw, ["name", "Name"])) || "Horario",
      arreglo: rotativo ? "rotativo" : arreglo,
      esDefault: pick(raw, ["default", "defaults", "isDefault"]) === true,
      descansosTipo: /paid|pago/i.test(String(pick(raw, ["breaksType", "breaks_type"]) || "")) && !/unpaid|impago/i.test(String(pick(raw, ["breaksType", "breaks_type"]) || "")) ? "pago" : "impago",
      excluirTemprana: pick(raw, ["excludeEarlyClockIn", "exclude_early_clock_in"]) === true,
      horasSemana: horas != null ? Math.round(horas / 60 * 100) / 100 : null,
      finJornada: hmDe(pick(raw, ["overtimeEndWorkDayAt", "overtime_end_work_day_at", "endWorkDayAt"])),
      cicloDias: rotativo ? Math.max(2, days.length || 2) : null,
      ancla: s(pick(raw, ["cycleAnchor", "anchor", "ancla"])).slice(0, 10) || null,
      jibbleId: s(pick(raw, ["id", "Id"])) || null,
      dias: days.map((d, i) => diaDeJibble(d, i + 1, rotativo)),
      descansos: lista(pick(raw, ["breaks", "Breaks"])).map((b) => ({
        nombre: s(pick(b, ["name", "Name"])) || "Descanso",
        duracionMin: isoDuracionMin(pick(b, ["duration", "Duration"])) || 0,
        desde: hmDe(pick(b, ["from", "fromTime", "from_time"])),
        hasta: hmDe(pick(b, ["to", "toTime", "to_time"])),
        franja: pick(b, ["allowToBeTakenFromTo", "allow_to_be_taken_from_to"]) === true,
      })),
      deducciones: lista(pick(raw, ["autoDeductions", "auto_deductions"])).map((d) => ({
        nombre: s(pick(d, ["name", "Name"])) || "Deducción",
        duracionMin: isoDuracionMin(pick(d, ["duration", "Duration"])) || 0,
        umbralMin: isoDuracionMin(pick(d, ["threshold", "Threshold"])) || 0,
      })),
    };
  });
  const porJibble = new Map(horarios.filter((h) => h.jibbleId).map((h) => [h.jibbleId as string, h]));
  const grupos = new Map<string, string>();
  for (const g of lista(carga.groups)) {
    const id = s(pick(g, ["id", "Id"]));
    const sch = s(pick(g, ["scheduleId", "schedule_id"]));
    if (id && sch) grupos.set(id, sch);
  }
  const def = horarios.find((h) => h.esDefault);
  const asignaciones: AsignacionHorario[] = [];
  for (const p of lista(carga.people)) {
    const persona = s(pick(p, ["fullName", "full_name", "name", "preferredName"]));
    if (!persona) continue;
    const propia = s(pick(p, ["scheduleId", "schedule_id"]));
    const grupoId = s(pick(p, ["groupId", "group_id"]));
    const deGrupo = grupoId ? grupos.get(grupoId) || "" : "";
    const jid = propia || deGrupo || (def?.jibbleId || "");
    const origen: OrigenAsignacion = propia ? "persona" : deGrupo ? "grupo" : "default";
    if (!jid || !porJibble.has(jid)) continue;
    asignaciones.push({
      persona,
      horarioId: jid,
      origen,
      jibblePersonId: s(pick(p, ["id", "Id"])) || null,
      grupo: grupoId || null,
    });
  }
  return { horarios, asignaciones };
}
