// DEV-31j (Emilia t926u): nombre legal (nombres y apellidos) para el rol / PDF.
import type { Ctx } from "./lib.ts";
import { normNombre, s, type Row } from "./domain.ts";
import { mismaPersonaRol } from "./roles_api.ts";

export function cedulaClave(v: unknown): string {
  return s(v).replace(/\.0+$/, "").replace(/\D/g, "");
}

/** Prefer the full legal name (2+ words). The short app name (Andrea) is only a fallback. */
export function elegirNombreLegal(completo?: unknown, corto?: unknown): string {
  const f = s(completo).trim();
  const c = s(corto).trim();
  if (f && f.split(/\s+/).length >= 2) return f;
  return f || c;
}

export type BuscaNombreLegal = (persona?: unknown, cedula?: unknown) => string;

export async function mapaNombresLegales(ctx: Ctx): Promise<BuscaNombreLegal> {
  const cfg = await ctx.db.all("beta_rol_config").catch(() => [] as Row[]);
  const rrhh = await ctx.db.all("rrhh_empleadas").catch(() => [] as Row[]);
  const byP = new Map<string, string>();
  const byC = new Map<string, string>();
  const put = (k: string, v: string) => {
    if (!k || !v) return;
    if (!byP.has(k)) byP.set(k, v);
  };
  const putC = (k: string, v: string) => { if (k && v && !byC.has(k)) byC.set(k, v); };
  for (const r of cfg) {
    const legal = elegirNombreLegal(r.nombre_completo, r.persona);
    const corto = s(r.persona);
    if (corto) put(corto.trim().toLowerCase(), legal);
    if (corto) put((corto.trim().split(/\s+/)[0] || "").toLowerCase(), legal);
    putC(cedulaClave(r.cedula), legal);
  }
  for (const r of rrhh) {
    const legal = elegirNombreLegal(r.apellidos_y_nombres, r.nombre_app);
    const corto = s(r.nombre_app);
    if (corto) put(corto.trim().toLowerCase(), legal);
    if (corto) put((corto.trim().split(/\s+/)[0] || "").toLowerCase(), legal);
    putC(cedulaClave(r.cedula), legal);
  }
  return (persona?: unknown, cedula?: unknown) => {
    const ced = cedulaClave(cedula);
    if (ced && byC.has(ced)) return byC.get(ced)!;
    const raw = s(persona).trim();
    if (!raw) return "";
    const k = raw.toLowerCase();
    if (byP.has(k)) return byP.get(k)!;
    const first = (raw.split(/\s+/)[0] || "").toLowerCase();
    if (first && byP.has(first)) return byP.get(first)!;
    return elegirNombreLegal(undefined, raw);
  };
}

export function snapConNombreLegal(snap: Row, legal: string): Row {
  const n = s(legal) || s(snap.nombreCompleto) || s(snap.nombre);
  return n ? { ...snap, nombreCompleto: n } : snap;
}

/** Resuelve la fila RRHH: nombre corto, nombre legal, jibble o cédula. Prefiere coincidencia exacta del nombre de la app. */
export function filaEmpleadaDe(rows: Row[], nombre: string, cedula?: unknown): Row | null {
  const key = normNombre(nombre);
  const first = key.split(" ")[0] || key;
  const ced = cedulaClave(cedula);
  let best: Row | null = null, bestS = 0;
  for (const r of rows) {
    if (!(s(r.nombre_app) || s(r.apellidos_y_nombres) || s(r.nombre_jibble))) continue;
    const app = normNombre(s(r.nombre_app));
    const legal = normNombre(s(r.apellidos_y_nombres));
    const jib = normNombre(s(r.nombre_jibble));
    let sc = 0;
    if (ced && cedulaClave(r.cedula) === ced) sc = 5;
    else if (app && app === key) sc = 4;
    else if (legal && legal === key) sc = 4;
    else if (jib && jib === key) sc = 3;
    else if (app && (app.startsWith(first + " ") || (first.length >= 3 && app.split(" ")[0] === first))) sc = 3;
    else if (legal && mismaPersonaRol(s(r.apellidos_y_nombres), nombre)) sc = 2;
    else if (jib && mismaPersonaRol(s(r.nombre_jibble), nombre)) sc = 2;
    if (sc > bestS) { best = r; bestS = sc; }
  }
  return best;
}

/** El nombre corto de la app (Andrea, Alejandra…) es la clave de cruce; el legal no. */
export function personaCortaDe(emp: Row | null | undefined, fallback = ""): string {
  if (!emp) return s(fallback);
  return s(emp.nombre_app) || s(fallback) || s(emp.apellidos_y_nombres);
}

