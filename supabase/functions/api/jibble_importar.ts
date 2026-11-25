// DESACTIVADO (DEV-31b, Emilia t907u): la asistencia sale solo de la app. Importador de historial Jibble → jibble_historial (aditivo, on conflict person_id+fecha).
// Las claves pueden vivir como JIBBLE_CLIENT_ID_NEW / JIBBLE_CLIENT_SECRET_NEW
// (o JIBBLE_CLIENT_ID / SECRET, o JIBBLE_API_KEY / JIBBLE_API_SECRET). Nunca se imprimen.
// El rol no depende de esta acción: si no hay claves, queda pendiente y se usan
// las filas ya importadas (última carga: script /workspace/supabase/jibble_box.py).
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { ecuadorParts, s, type Row } from "./domain.ts";
import { esAdmin } from "./permisos.ts";
import { HISTORICO_ULTIMO_DIA as JIBBLE_ULTIMO_DIA } from "./asistencia_api.ts";

const TOKEN_URL = "https://identity.prod.jibble.io/connect/token";
const TS_URL = "https://time-attendance.prod.jibble.io/v1/Timesheets";
const PEOPLE_URL = "https://time-tracking.prod.jibble.io/v1/People";

export function credencialesJibble(env: Record<string, string | undefined>): { id: string; secret: string } | null {
  const id = s(env.JIBBLE_CLIENT_ID_NEW || env.JIBBLE_CLIENT_ID || env.JIBBLE_API_KEY);
  const secret = s(env.JIBBLE_CLIENT_SECRET_NEW || env.JIBBLE_CLIENT_SECRET || env.JIBBLE_API_SECRET);
  if (!id || !secret) return null;
  return { id, secret };
}

function dur(v: unknown): number {
  if (typeof v !== "string" || !v.startsWith("P")) return 0;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/.exec(v);
  if (!m) return 0;
  const d = Number(m[1] || 0), h = Number(m[2] || 0), mi = Number(m[3] || 0), sec = Number(m[4] || 0);
  return d * 1440 + h * 60 + mi + sec / 60;
}

async function tokenDe(fetchImpl: typeof fetch, cred: { id: string; secret: string }): Promise<string> {
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: cred.id, client_secret: cred.secret });
  const res = await fetchImpl(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const data = await res.json() as Row;
  if (!res.ok || !s(data.access_token)) throw new Error("Jibble rechazó las credenciales");
  return s(data.access_token);
}

async function jget(fetchImpl: typeof fetch, url: string, token: string): Promise<Row[]> {
  const out: Row[] = [];
  let nxt: string | null = url;
  let retry = 0;
  while (nxt) {
    const res = await fetchImpl(nxt, { headers: { Authorization: "Bearer " + token } });
    if (res.status === 429 && retry < 8) {
      await new Promise((r) => setTimeout(r, 500 * (retry + 1)));
      retry++;
      continue;
    }
    if (!res.ok) throw new Error("Jibble HTTP " + res.status);
    const data = await res.json() as Row;
    const rows = Array.isArray(data) ? data : (Array.isArray(data.value) ? data.value as Row[] : []);
    out.push(...rows);
    nxt = typeof data["@odata.nextLink"] === "string" ? s(data["@odata.nextLink"]) : null;
    retry = 0;
  }
  return out;
}

/** Importa timesheets desde `desde` (inclusive) hasta hoy. Deduplica por person_id+fecha al escribir. */
export async function importarJibbleRango(ctx: Ctx, ses: Ses, desde: string): Promise<Row> {
  const cred = credencialesJibble(ctx.env);
  if (!cred) {
    return { ok: false, pendiente: true, error: "Faltan las claves de Jibble en el entorno. El historial ya importado se sigue usando." };
  }
  const token = await tokenDe(ctx.fetchImpl, cred);
  const people = await jget(ctx.fetchImpl, PEOPLE_URL, token);
  const hoy = ecuadorParts(ctx.now).ymd;
  let dias = 0;
  const porPersona: Row[] = [];
  for (const p of people) {
    const nm = s(p.fullName);
    const pid = s(p.id);
    if (!nm || !pid) continue;
    const ts = await jget(ctx.fetchImpl, `${TS_URL}?period=Custom&date=${desde}&endDate=${hoy}&personIds=${encodeURIComponent(pid)}`, token);
    const seen = new Set<string>();
    let n = 0;
    for (const t of ts) {
      const daily = Array.isArray(t.daily) ? t.daily as Row[] : [t];
      for (const x of daily) {
        const f = s(x.date || x.day).slice(0, 10);
        if (!f || seen.has(f)) continue;
        // DEV-31: desde el 26 nov 2026 las horas salen solo de la asistencia de Sunsu; Jibble ya no se importa.
        if (f > JIBBLE_ULTIMO_DIA) continue;
        const ph = (x.payrollHours && typeof x.payrollHours === "object") ? x.payrollHours as Row : {};
        const th = (x.trackedHours && typeof x.trackedHours === "object") ? x.trackedHours as Row : {};
        const g = (k: string) => dur(((ph[k] as Row) || {}).time);
        const pm = dur(ph.total) || 0;
        const tm = dur(th.total) || 0;
        if (pm <= 0 && tm <= 0 && !x.firstIn) continue;
        seen.add(f);
        const row = {
          persona: nm, person_id: pid, fecha: f,
          payroll_minutes: Math.round(pm * 100) / 100,
          supplementary_minutes: Math.round((g("dailyOvertime") + g("weeklyOvertime")) * 100) / 100,
          extraordinary_minutes: Math.round((g("dailyDoubleOvertime") + g("publicHolidayOvertime")) * 100) / 100,
          rest_day_minutes: Math.round(g("restDayOvertime") * 100) / 100,
          raw: x, imported_at: ctx.now.toISOString(),
        };
        const prev = (await ctx.db.all("jibble_historial").catch(() => [] as Row[])).find((r) => s(r.person_id) === pid && s(r.fecha).slice(0, 10) === f);
        if (prev && prev.id) await ctx.db.write(actorOf(ses), "jibble_historial", "update", { id: prev.id }, row);
        else await ctx.db.write(actorOf(ses), "jibble_historial", "insert", {}, row);
        n++;
        dias++;
      }
    }
    porPersona.push({ persona: nm, dias: n });
  }
  return { ok: true, desde, hasta: hoy, dias, personas: porPersona };
}

extend("jibble_importar", "any", async (_p, _ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración." };
  // DEV-31b (Emilia t907u): la asistencia es solo de la app. Jibble ya no se importa ni se lee.
  return { ok: false, desactivado: true, error: "Jibble ya no se usa: la asistencia, las horas y los roles salen solo de la app." };
});
