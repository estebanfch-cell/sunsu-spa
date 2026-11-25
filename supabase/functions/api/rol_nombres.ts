// DEV-31j (Emilia t926u): nombre legal (nombres y apellidos) para el rol / PDF.
import type { Ctx } from "./lib.ts";
import { s, type Row } from "./domain.ts";

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
