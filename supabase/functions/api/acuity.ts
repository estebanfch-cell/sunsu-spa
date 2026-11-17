// Cliente de Acuity para la beta: todo pasa por la edge function «api» con los secretos ACUITY_UID / ACUITY_KEY.
// Lecturas de catálogo (calendarios, tipos, etiquetas) y ventanas de citas se cachean unos minutos.
import type { Ctx } from "./lib.ts";
import { addDays, normNombre, s, type Row } from "./domain.ts";

const CACHE = new Map<string, { t: number; v: unknown }>();
export function limpiarCacheAcuity() { CACHE.clear(); }

export async function acuityReq(ctx: Ctx, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: true; data: unknown } | { error: string; status?: number }> {
  const uid = ctx.env.ACUITY_UID, key = ctx.env.ACUITY_KEY;
  if (!uid || !key) return { error: "Acuity no está configurado (secretos ACUITY_UID y ACUITY_KEY)." };
  let res: Response;
  try {
    res = await ctx.fetchImpl("https://acuityscheduling.com/api/v1/" + path, {
      method: init.method || "GET",
      headers: { Authorization: "Basic " + btoa(uid + ":" + key), "Content-Type": "application/json", Accept: "application/json" },
      body: init.body == null ? undefined : JSON.stringify(init.body),
    });
  } catch (e) { return { error: "No se pudo conectar con Acuity: " + String((e as Error)?.message || e) }; }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const msg = data && typeof data === "object" ? s((data as Row).message) || s((data as Row).error) : "";
    return { error: "Acuity respondió " + res.status + (msg ? ": " + msg : ""), status: res.status };
  }
  return { ok: true, data };
}
export async function acuityCache<T>(ctx: Ctx, path: string, ms = 5 * 60000): Promise<T | { error: string }> {
  const c = CACHE.get(path);
  if (c && Date.now() - c.t < ms) return c.v as T;
  const r = await acuityReq(ctx, path);
  if ("error" in r) return { error: r.error };
  CACHE.set(path, { t: Date.now(), v: r.data });
  return r.data as T;
}
/** Citas no canceladas entre dos fechas (AAAA-MM-DD), en ventanas de 7 días como el script viejo. */
export async function citasRango(ctx: Ctx, desde: string, hasta: string, opts: { calendarID?: string; ms?: number } = {}): Promise<Row[] | { error: string }> {
  const ventanas: string[] = [];
  let cur = desde;
  while (cur <= hasta) {
    let fin = addDays(cur, 6); if (fin > hasta) fin = hasta;
    ventanas.push(`appointments?minDate=${cur}T00:00:00&maxDate=${fin}T23:59:59&max=500` + (opts.calendarID ? "&calendarID=" + encodeURIComponent(opts.calendarID) : ""));
    cur = addDays(fin, 1);
  }
  const res = await Promise.all(ventanas.map((q) => acuityCache<Row[]>(ctx, q, opts.ms ?? 90000)));
  const out: Row[] = [];
  for (const r of res) { if (!Array.isArray(r)) return r as { error: string }; out.push(...r); }
  return out.filter((a) => !a.canceled);
}
export function nombreCita(a: Row): string { return normNombre(s(a.firstName) + " " + s(a.lastName)); }
/** Regla de conciliarFacturasMN: el nombre de la cita contiene el primer nombre y, si tiene ≥2 letras, el primer apellido. */
export function citaDeNombre(lista: Row[], nombre: string, apellido: string): Row | null {
  const pn = normNombre(nombre).split(" ")[0] || "", pa = normNombre(apellido).split(" ")[0] || "";
  if (pn.length < 2) return null;
  return lista.find((a) => { const f = nombreCita(a); return f.includes(pn) && (pa.length < 2 || f.includes(pa)); }) || null;
}
export function fechaCita(a: Row): string { return s(a.datetime).slice(0, 10); }
