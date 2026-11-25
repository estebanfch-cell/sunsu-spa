// Une usuario ↔ empleada ↔ cosmetóloga para que en los selectores
// cada persona real aparezca una sola vez, con un nombre corto completo
// («Andrea Robles», no «Andrea» y otra vez «Andrea Robles»).
// También aplica alias de pantalla (p. ej. Evelyn Toapanta).
import { normNombre, s, type Row } from "./domain.ts";
import { esFilaNotasRrhh } from "./empleados_api.ts";
import { bajasDe } from "./lib.ts";
import type { Ctx } from "./lib.ts";
import { esAdmin } from "./permisos.ts";

export type PersonaCand = {
  nombre: string;
  uid?: string;
  short?: string;
  rol?: string;
  cedula?: string;
  fuente?: string;
  mostrar?: string;
};

export const ALIAS_FIJOS: { patron: string; mostrar: string }[] = [
  { patron: "evelyn anabel toapanta quishpe", mostrar: "Evelyn Toapanta" },
  { patron: "evelyn anabel toapanta quispe", mostrar: "Evelyn Toapanta" },
  { patron: "evelyn toapanta quishpe", mostrar: "Evelyn Toapanta" },
  { patron: "evelyn toapanta quispe", mostrar: "Evelyn Toapanta" },
];

export function tokensNombre(v: unknown): string[] {
  return normNombre(v).split(" ").filter(Boolean);
}

export function mismaPersonaNombre(a: string, b: string): boolean {
  const A = tokensNombre(a);
  const B = tokensNombre(b);
  if (!A.length || !B.length) return false;
  if (A.join(" ") === B.join(" ")) return true;
  const [corto, largo] = A.length <= B.length ? [A, B] : [B, A];
  if (corto.length === 1) return corto[0].length >= 3 && largo[0] === corto[0];
  let i = 0;
  for (const t of largo) {
    if (t === corto[i]) i++;
    if (i === corto.length) return true;
  }
  return false;
}

export function nombreMostrar(nomb: string, aliases: { patron: string; mostrar: string }[] = ALIAS_FIJOS): string {
  const k = tokensNombre(nomb).join(" ");
  if (!k) return s(nomb);
  const hit = aliases.find((a) => a.patron === k || mismaPersonaNombre(nomb, a.patron));
  return hit ? hit.mostrar : s(nomb).replace(/\s+/g, " ").trim();
}

/** Prefiere 2 tokens (nombre + apellido) sobre el nombre de pila solo o el nombre legal largo. */
export function preferirNombreCorto(nombres: string[], aliases: { patron: string; mostrar: string }[] = ALIAS_FIJOS): string {
  const limpios = nombres.map((n) => s(n).replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!limpios.length) return "";
  const alias = limpios.map((n) => nombreMostrar(n, aliases)).find((n) => aliases.some((a) => a.mostrar === n));
  if (alias) return alias;
  const mostrados = limpios.map((n) => nombreMostrar(n, aliases));
  const dos = mostrados.filter((n) => tokensNombre(n).length === 2);
  if (dos.length) {
    dos.sort((a, b) => b.length - a.length);
    return dos[0];
  }
  mostrados.sort((a, b) => tokensNombre(b).length - tokensNombre(a).length || b.length - a.length);
  return mostrados[0];
}

export function unirPersonas(cands: PersonaCand[], aliases: { patron: string; mostrar: string }[] = ALIAS_FIJOS): PersonaCand[] {
  const vivos = cands.filter((c) => s(c.nombre).trim());
  const grupos: PersonaCand[][] = [];
  for (const c of vivos) {
    const g = grupos.find((grp) => {
      const uid = s(c.uid);
      if (uid && grp.some((x) => s(x.uid) && s(x.uid) === uid)) return true;
      return grp.some((x) => mismaPersonaNombre(x.nombre, c.nombre) || (c.short ? mismaPersonaNombre(x.nombre, c.short) : false) || (x.short ? mismaPersonaNombre(c.nombre, x.short) : false));
    });
    if (g) g.push(c);
    else grupos.push([c]);
  }
  return grupos.map((grp) => {
    const nombres = grp.flatMap((c) => [c.mostrar, c.nombre, c.short]).filter(Boolean) as string[];
    const nombre = preferirNombreCorto(nombres, aliases);
    const uid = s(grp.find((c) => c.uid)?.uid) || undefined;
    const short = s(grp.find((c) => tokensNombre(c.short || "").length === 1 ? c.short : "")?.short) || tokensNombre(nombre)[0] || nombre;
    const rol = s(grp.find((c) => c.rol)?.rol) || "";
    const cedula = s(grp.find((c) => c.cedula)?.cedula) || "";
    return { nombre, uid, short, rol, cedula, fuente: grp.map((c) => c.fuente).filter(Boolean).join(",") };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export async function aliasesDe(ctx: Ctx): Promise<{ patron: string; mostrar: string }[]> {
  const extra: { patron: string; mostrar: string }[] = [];
  try {
    for (const r of await ctx.db.all("beta_persona_alias")) {
      const patron = tokensNombre(r.patron).join(" ");
      const mostrar = s(r.nombre_mostrar).replace(/\s+/g, " ").trim();
      if (patron && mostrar) extra.push({ patron, mostrar });
    }
  } catch { /* la tabla entra con 0057; mientras tanto valen los fijos */ }
  const seen = new Set(ALIAS_FIJOS.map((a) => a.patron));
  return [...ALIAS_FIJOS, ...extra.filter((a) => !seen.has(a.patron))];
}

export async function personasUnicas(ctx: Ctx, opts?: { incluirAdmin?: boolean; incluirInactivas?: boolean }): Promise<PersonaCand[]> {
  const aliases = await aliasesDe(ctx);
  const baja = await bajasDe(ctx.db);
  const cands: PersonaCand[] = [];
  const overlays = await ctx.db.all("beta_empleados").catch(() => [] as Row[]);
  const porUid = new Map<string, string>();
  for (const o of overlays) {
    if (s(o.usuario_id) && s(o.nombre_app)) porUid.set(s(o.usuario_id), s(o.nombre_app));
  }
  for (const u of await ctx.db.all("usuarios").catch(() => [] as Row[])) {
    if (u.bloqueado === true || u.activo === false) continue;
    const nombre = s(u.nombre || u.name);
    if (!nombre || baja(nombre)) continue;
    if (!opts?.incluirAdmin && (esAdmin(s(u.rol)) || s(u.rol) === "visor")) continue;
    cands.push({
      nombre, uid: s(u.id || u.uid), short: s(u.short), rol: s(u.rol),
      fuente: "usuario", mostrar: porUid.get(s(u.id || u.uid)) || nombre,
    });
  }
  for (const e of await ctx.db.all("rrhh_empleadas").catch(() => [] as Row[])) {
    if (esFilaNotasRrhh(e)) continue;
    const nombre = s(e.nombre_app) || s(e.apellidos_y_nombres);
    const jibble = s(e.nombre_jibble);
    if (baja(nombre) || baja(jibble) || baja(s(e.cedula))) continue;
    if (nombre) cands.push({ nombre, short: jibble || nombre, cedula: s(e.cedula), fuente: "rrhh", mostrar: jibble || nombre });
    if (jibble && jibble !== nombre) cands.push({ nombre: jibble, short: nombre || jibble, cedula: s(e.cedula), fuente: "jibble" });
  }
  for (const o of overlays) {
    const nombre = s(o.nombre_app);
    if (!nombre || baja(nombre)) continue;
    cands.push({ nombre, uid: s(o.usuario_id) || undefined, fuente: "overlay" });
  }
  for (const c of await ctx.db.all("cosmetologas").catch(() => [] as Row[])) {
    if (!opts?.incluirInactivas && c.activa === false) continue;
    const nombre = s(c.nombre_mostrar) || s(c.nombre);
    if (!nombre || baja(nombre)) continue;
    cands.push({ nombre: s(c.nombre) || nombre, mostrar: nombre, uid: s(c.id), fuente: "cosmetologas" });
  }
  return unirPersonas(cands, aliases);
}
