/** TK149: un solo motor para Control de Agenda, Mis comisiones y el rol de pagos.
 *  1 facial hecho = 1 persona única por día, atribuida a la fecha real de la cita en Acuity. */
import type { Ctx } from "./lib.ts";
import { citasRango, fechaCita, nombreCita } from "./acuity.ts";
import { claveDe } from "./ticket_beta.ts";
import { leerSerie } from "./series.ts";
import {
  addDays, b, comisionRecepcionDia, ecuadorParts, esCancelado, esInterno, facialSku,
  n, normCedula, normNombre, round2, s, type ComCfg, type Row, CFG_DEF,
} from "./domain.ts";

const DIAS_SEM = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export type LineaFacial = { tipo?: unknown; sku?: unknown; nombre?: unknown };
export type TicketRecep = {
  clave?: string;
  so?: string;
  id?: unknown;
  timestamp?: unknown;
  nombre?: unknown;
  apellido?: unknown;
  cedula?: unknown;
  cosm?: unknown;
  facial?: unknown;
  lineas?: LineaFacial[];
  anulado?: boolean;
  borrado?: boolean;
  vendido?: number;
  /** Tickets de simulación (origin=test / TEST-TK-…) no entran al Control de Agenda ni al rol. */
  origin?: unknown;
};
export type CitaRecep = {
  id?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  datetime?: unknown;
  date?: unknown;
  time?: unknown;
  calendar?: unknown;
  calendarID?: unknown;
  canceled?: unknown;
  noShow?: unknown;
};
export type LinkCita = { appointment_id?: unknown; ticket_clave?: unknown; fecha?: unknown; calendar_id?: unknown };
export type CalendarioRecep = { calendar_id?: unknown; persona?: unknown; nombre?: unknown; cosmetologa_id?: unknown };

export type PersonaDia = {
  fecha: string;
  cliente: string;
  cosm: string;
  clave?: string;
  so?: string;
  fechaTicket: string;
  fuente: "vinculo" | "acuity" | "ticket";
  tarde: boolean;
  vendido: number;
};
export type DiaRecep = {
  fecha: string;
  dia: string;
  clientas: number;
  umbral: number;
  cumple: boolean;
  comision: number;
  vendido: number;
  notas: string[];
  sinTicket: string[];
};
export type RecepcionCiclo = {
  dias: DiaRecep[];
  total: number;
  diasCumplidos: number;
  personas: PersonaDia[];
  vendido: number;
  acuityOk: boolean;
  acuityError?: string;
};

export function fechaAtencion(ts: unknown): string {
  const x = s(ts).trim();
  if (!x) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return x;
  const m = x.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
  const off = (x.match(/([Zz]|[+-]\d{2}:?\d{2})$/) || [])[1] || "";
  // Tickets Sunsu: reloj de Ecuador guardado con +00:00 (o sin zona). La fecha civil es la del string:
  // así 21:00–23:59 no pasan al día siguiente (bug del Apps Script viejo) ni 00:00–04:59 al anterior.
  if (m && (!off || /[+]00:?00$/.test(off))) return m[1];
  if (m && /[-]05:?00$/.test(off)) return m[1];
  const iso = /T/.test(x) ? x : x.replace(" ", "T");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return (m && m[1]) || x.slice(0, 10);
  return ecuadorParts(d).ymd;
}

export function fechaCitaGye(a: CitaRecep): string {
  const dt = s(a.datetime).trim();
  if (dt) {
    const y = fechaAtencion(dt);
    if (y) return y;
    const sliced = fechaCita(a as Row);
    if (sliced) return sliced;
  }
  const raw = s(a.date).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (m) {
    const months: Record<string, string> = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };
    const mm = months[m[1].toLowerCase()];
    if (mm) return m[3] + "-" + mm + "-" + String(m[2]).padStart(2, "0");
  }
  return raw.slice(0, 10);
}

export function tieneFacialReal(t: { facial?: unknown; lineas?: LineaFacial[] }): boolean {
  if (facialSku(t.facial)) return true;
  return (t.lineas || []).some((l) => s(l.tipo).toLowerCase() === "facial");
}

export function esTicketPruebaRecep(t: { origin?: unknown; so?: string; clave?: string }): boolean {
  if (s(t.origin) === "test") return true;
  return /^TEST-/i.test(s(t.clave) || s(t.so));
}

export function esCandidatoRecep(t: TicketRecep): boolean {
  if (t.borrado || t.anulado) return false;
  if (esTicketPruebaRecep(t)) return false;
  if (esInterno(t.cosm, t.cedula)) return false;
  return tieneFacialReal(t);
}

export function claveClienta(t: { cedula?: unknown; nombre?: unknown; apellido?: unknown }): string {
  const ced = normCedula(t.cedula);
  if (ced && ced.length >= 8) return "c:" + ced;
  const nom = normNombre(s(t.nombre) + " " + s(t.apellido));
  return nom ? "n:" + nom : "";
}

export function nombreClienta(t: { nombre?: unknown; apellido?: unknown }): string {
  return (s(t.nombre) + " " + s(t.apellido)).trim();
}

/** ¿El nombre del ticket y el de la cita son la misma persona? (tildes/mayúsculas, 1.er nombre + 1.er apellido). */
export function nombresCoinciden(nombre: unknown, apellido: unknown, citaFirst: unknown, citaLast: unknown): boolean {
  const pn = normNombre(nombre).split(" ")[0] || "";
  const pa = normNombre(apellido).split(" ")[0] || "";
  if (pn.length < 2) return false;
  const f = nombreCita({ firstName: citaFirst, lastName: citaLast } as Row);
  if (!f.includes(pn)) return false;
  return pa.length < 2 || f.includes(pa);
}

export function personaDeCalendario(calendarID: unknown, calendarName: unknown, calendarios: CalendarioRecep[] = []): string {
  const id = s(calendarID);
  const hit = calendarios.find((c) => s(c.calendar_id) === id || s(c.calendar_id) === String(Number(id)));
  if (hit) return s(hit.persona) || s(hit.nombre);
  return s(calendarName);
}

export function cosmCoincide(cosm: unknown, calendarID: unknown, calendarName: unknown, calendarios: CalendarioRecep[] = []): boolean {
  const c = normNombre(cosm);
  if (!c) return false;
  const per = normNombre(personaDeCalendario(calendarID, calendarName, calendarios));
  const cal = normNombre(calendarName);
  const first = c.split(" ")[0] || "";
  if (per && (c === per || c.startsWith(per + " ") || per.startsWith(c) || (first.length >= 3 && (per === first || per.startsWith(first + " "))))) return true;
  if (cal && (c === cal || c.startsWith(cal + " ") || cal === first || (first.length >= 3 && cal.startsWith(first)))) return true;
  return false;
}

export function citaViva(a: CitaRecep): boolean {
  return !b(a.canceled) && !b(a.noShow) && a.canceled !== "true" && a.noShow !== "true";
}

export function umbralRecepcion(fecha: string, cfg: ComCfg = CFG_DEF): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 1 ? cfg.recepMinLunes : cfg.recepMin;
}

export function etiquetaDiaCorto(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return (d || 0) + " " + MESES_CORTOS[(m || 1) - 1];
}

export function diaSemana(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return DIAS_SEM[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] || "";
}

export function periodoLabel(ciclo: string, fin: string): string {
  const m1 = Number(ciclo.slice(5, 7)), m2 = Number(fin.slice(5, 7)), y2 = fin.slice(0, 4);
  return (MESES[m1 - 1] || "") + " 26 — " + (MESES[m2 - 1] || "") + " 25, " + y2;
}

function daysBetween(a: string, b: string): number {
  if (!a || !b) return 99;
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function fmtDiaNota(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const dia = diaSemana(fecha).toLowerCase();
  return dia + " " + String(d).padStart(2, "0");
}

export function mejorCita(
  t: TicketRecep,
  citas: CitaRecep[],
  calendarios: CalendarioRecep[],
  fechaTicket: string,
): CitaRecep | null {
  const cand: { a: CitaRecep; score: number }[] = [];
  for (const a of citas) {
    if (!citaViva(a)) continue;
    if (!nombresCoinciden(t.nombre, t.apellido, a.firstName, a.lastName)) continue;
    const fd = fechaCitaGye(a);
    const dist = Math.abs(daysBetween(fechaTicket, fd));
    if (dist > 1) continue;
    let score = 10 - dist;
    if (cosmCoincide(t.cosm, a.calendarID, a.calendar, calendarios)) score += 5;
    cand.push({ a, score });
  }
  cand.sort((x, y) => y.score - x.score);
  return cand[0]?.a || null;
}

export function calcularRecepcion(o: {
  tickets: TicketRecep[];
  citas?: CitaRecep[];
  links?: LinkCita[];
  calendarios?: CalendarioRecep[];
  desde: string;
  hasta: string;
  cfg?: ComCfg;
}): RecepcionCiclo {
  const cfg = o.cfg || CFG_DEF;
  const citas = o.citas || [];
  const links = o.links || [];
  const calendarios = o.calendarios || [];
  const linkByClave = new Map<string, LinkCita>();
  for (const L of links) {
    const k = s(L.ticket_clave);
    if (k) linkByClave.set(k, L);
  }
  const citaById = new Map<string, CitaRecep>();
  for (const a of citas) if (a.id != null && a.id !== "") citaById.set(s(a.id), a);

  const personas: PersonaDia[] = [];
  const usadosCita = new Set<string>();
  for (const t of o.tickets) {
    if (!esCandidatoRecep(t)) continue;
    const fechaTicket = fechaAtencion(t.timestamp);
    if (!fechaTicket) continue;
    let fecha = fechaTicket, fuente: PersonaDia["fuente"] = "ticket", cita: CitaRecep | null = null;
    const claves = [s(t.clave), s(t.so)].filter(Boolean);
    const link = claves.map((k) => linkByClave.get(k)).find(Boolean);
    if (link) {
      cita = citaById.get(s(link.appointment_id)) || null;
      const fLink = cita ? fechaCitaGye(cita) : s(link.fecha).slice(0, 10);
      if (fLink) { fecha = fLink; fuente = "vinculo"; }
    } else {
      cita = mejorCita(t, citas, calendarios, fechaTicket);
      if (cita) { fecha = fechaCitaGye(cita) || fechaTicket; fuente = "acuity"; }
    }
    if (cita?.id != null) usadosCita.add(s(cita.id));
    personas.push({
      fecha, cliente: nombreClienta(t), cosm: s(t.cosm), clave: t.clave, so: t.so,
      fechaTicket, fuente, tarde: fecha !== fechaTicket, vendido: n(t.vendido),
    });
  }

  // 1 persona por clienta por día (si hay dos tickets, nos quedamos con el primero / el vinculado).
  const porDia = new Map<string, PersonaDia[]>();
  const visto = new Set<string>();
  for (const p of personas) {
    const t = o.tickets.find((x) => (x.so && x.so === p.so) || (x.clave && x.clave === p.clave)) || {};
    const key = p.fecha + "|" + (claveClienta(t) || normNombre(p.cliente) || p.so || p.clave);
    if (!key.endsWith("|") && visto.has(key)) continue;
    if (!key.endsWith("|")) visto.add(key);
    const L = porDia.get(p.fecha) || [];
    L.push(p);
    porDia.set(p.fecha, L);
  }

  const sinPorDia = new Map<string, string[]>();
  for (const a of citas) {
    if (!citaViva(a)) continue;
    const f = fechaCitaGye(a);
    if (!f || f < o.desde || f > o.hasta) continue;
    if (a.id != null && usadosCita.has(s(a.id))) continue;
    const nom = nombreCita(a as Row) || (s(a.firstName) + " " + s(a.lastName)).trim();
    // title case light for display: use original names
    const pretty = (s(a.firstName) + " " + s(a.lastName)).trim() || nom;
    const cal = s(a.calendar) || personaDeCalendario(a.calendarID, a.calendar, calendarios);
    const hora = s(a.time);
    const txt = pretty + (cal || hora ? " (" + [cal, hora].filter(Boolean).join(", ") + ")" : "");
    const L = sinPorDia.get(f) || [];
    L.push(txt);
    sinPorDia.set(f, L);
  }

  const fechas = new Set<string>([...porDia.keys(), ...sinPorDia.keys()]);
  const dias: DiaRecep[] = [];
  let total = 0, diasCumplidos = 0, vendido = 0;
  for (const f of [...fechas].sort()) {
    if (f < o.desde || f > o.hasta) continue;
    const ps = porDia.get(f) || [];
    const clientas = ps.length;
    const umbral = umbralRecepcion(f, cfg);
    const com = comisionRecepcionDia(f, clientas, cfg);
    const v = round2(ps.reduce((a, p) => a + n(p.vendido), 0));
    const notas: string[] = [];
    for (const p of ps) {
      if (p.tarde && p.fechaTicket) notas.push(p.cliente + " (subido " + fmtDiaNota(p.fechaTicket) + ")");
    }
    const sinTicket = sinPorDia.get(f) || [];
    if (com > 0) { total = round2(total + com); diasCumplidos++; }
    vendido = round2(vendido + v);
    dias.push({ fecha: f, dia: diaSemana(f), clientas, umbral, cumple: com > 0, comision: com, vendido: v, notas, sinTicket });
  }
  return { dias, total: round2(total), diasCumplidos, personas, vendido, acuityOk: true };
}

export function ticketDeFila(r: Row, lineas: Row[] = [], vendido = 0): TicketRecep {
  const orig = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  return {
    clave: claveDe(r, leerSerie(r, "so_num")),
    so: s(r.so_num) || s(leerSerie(r, "so_num")),
    id: r.id,
    timestamp: r.timestamp,
    nombre: r.nombre,
    apellido: r.apellido,
    cedula: r.id_3 || r.cedula,
    cosm: r.atendido_por,
    facial: r.facial_hecho,
    lineas,
    anulado: esCancelado(r) || orig.anulado === true || orig.cancelado === true,
    borrado: !!r.borrado_at,
    vendido,
    origin: r.origin,
  };
}

function citaDeRow(a: Row): CitaRecep {
  return {
    id: a.id, firstName: a.firstName, lastName: a.lastName,
    datetime: a.datetime, date: a.date, time: a.time,
    calendar: a.calendar, calendarID: a.calendarID ?? a.calendar_id,
    canceled: a.canceled, noShow: a.noShow,
  };
}

/** Carga citas, vínculos y calendarios y calcula la recepción del ciclo. Si Acuity falla, usa la fecha Ecuador del ticket. */
export async function recepcionDeCiclo(
  ctx: Ctx,
  rowsTk: Row[],
  o: { ciclo: string; fin: string; cfg?: ComCfg; vendidoDe?: (r: Row) => number },
): Promise<RecepcionCiclo> {
  const cfg = o.cfg || CFG_DEF;
  const desde = o.ciclo, hasta = o.fin;
  let lineas: Row[] = [];
  try { lineas = await ctx.db.all("beta_ticket_lineas"); } catch { lineas = []; }
  const porClave = new Map<string, Row[]>();
  for (const l of lineas) {
    const k = s(l.ticket_clave);
    const L = porClave.get(k) || [];
    L.push(l);
    porClave.set(k, L);
  }
  const tickets: TicketRecep[] = rowsTk
    .filter((r) => r.timestamp && !r.borrado_at && s(r.origin) !== "test")
    .map((r) => ticketDeFila(r, porClave.get(claveDe(r, leerSerie(r, "so_num"))) || [], o.vendidoDe ? o.vendidoDe(r) : 0));

  let links: LinkCita[] = [], calendarios: CalendarioRecep[] = [];
  try { links = (await ctx.db.all("beta_citas_ticket")) as LinkCita[]; } catch { links = []; }
  try { calendarios = (await ctx.db.all("beta_acuity_calendars")) as CalendarioRecep[]; } catch { calendarios = []; }

  let citas: CitaRecep[] = [];
  let acuityOk = true, acuityError: string | undefined;
  try {
    const raw = await citasRango(ctx, addDays(desde, -1), addDays(hasta, 1), { ms: 90_000 });
    if (Array.isArray(raw)) citas = raw.map(citaDeRow);
    else { acuityOk = false; acuityError = s((raw as { error?: string }).error) || "Acuity no respondió"; }
  } catch (e) {
    acuityOk = false;
    acuityError = String((e as Error)?.message || e);
  }
  const out = calcularRecepcion({ tickets, citas, links, calendarios, desde, hasta, cfg });
  out.acuityOk = acuityOk;
  if (acuityError) out.acuityError = acuityError;
  return out;
}

export function lineasRecepDe(rec: RecepcionCiclo): { sku: string; nombre: string; qty: number; monto: number; vendido: number }[] {
  return rec.dias.map((d) => ({ sku: "", nombre: etiquetaDiaCorto(d.fecha), qty: d.clientas, monto: d.comision, vendido: d.vendido }));
}
