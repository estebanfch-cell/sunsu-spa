// 🔗 Clientas duplicadas (Emilia 17/11). Una clienta = una clave canónica:
//  • automático: la misma cédula normalizada (RUC 001, «.0», puntos) ya da la misma clave «c:»;
//  • a mano: beta_cliente_alias tipo «alias» (clave → destino). «separar» saca una variante vieja de un
//    grupo automático; «no_dup» guarda «no son la misma». Reversible: deshecho_at. La hoja no se toca.
import { MemoryDb, type Db } from "./db.ts";
import { normCedula, normNombre, s, type Row } from "./domain.ts";

export interface AliasEstado { alias: Map<string, string>; separar: Set<string>; noDup: Set<string>; filas: Row[] }
const VACIO = (): AliasEstado => ({ alias: new Map(), separar: new Set(), noDup: new Set(), filas: [] });
let AL: AliasEstado = VACIO();
let CACHE: { db: unknown; t: number; e: AliasEstado } | null = null;
const TTL = 30000;

export const parClave = (a: string, b: string) => [a, b].sort().join("|");

/** Lee beta_cliente_alias (30 s de caché; las pruebas con MemoryDb leen cada vez). */
export async function cargarAlias(db: Db, forzar = false): Promise<AliasEstado> {
  const mem = db instanceof MemoryDb;
  const ahora = Date.now();
  if (!forzar && CACHE && (mem ? CACHE.db === db : !(CACHE.db instanceof MemoryDb)) && ahora - CACHE.t < TTL) { AL = CACHE.e; return AL; }
  let rows: Row[] = [];
  try { rows = await db.all("beta_cliente_alias"); } catch { rows = []; }
  const e = VACIO();
  e.filas = rows;
  for (const r of rows) {
    if (r.deshecho_at) continue;
    const t = s(r.tipo), c = s(r.clave), d = s(r.destino);
    if (t === "alias" && c && d && c !== d) e.alias.set(c, d);
    else if (t === "separar" && c) e.separar.add(c);
    else if (t === "no_dup" && c && d) e.noDup.add(parClave(c, d));
  }
  AL = e; CACHE = { db, t: ahora, e };
  return e;
}
export function estadoAlias(): AliasEstado { return AL; }
/** Fija el estado a mano (pruebas). */
export function fijarAlias(e: Partial<AliasEstado>): void { AL = { ...VACIO(), ...e }; CACHE = null; }

/** Sigue las uniones a mano hasta la clienta principal. */
export function resolverClave(k: string): string {
  let x = k;
  for (let i = 0; i < 6 && AL.alias.has(x); i++) x = AL.alias.get(x)!;
  return x;
}
/** Clave de una cédula (cruda) + nombre, ya resuelta a la clienta principal. */
export function claveIdentidad(cedRaw: unknown, nombre: string, viejaFn: (v: unknown) => string): string {
  const ced = normCedula(cedRaw);
  if (ced) {
    const vieja = "c:" + viejaFn(cedRaw);
    if (vieja !== "c:" + ced && AL.separar.has(vieja)) return vieja;
    return resolverClave("c:" + ced);
  }
  const nom = normNombre(nombre);
  return nom ? resolverClave("n:" + nom) : "";
}
/** Cualquier clave guardada (beta_clientes, enlaces viejos «c:…001») → la clave principal de hoy. */
export function canonDeClave(key: string): string {
  const k = s(key);
  if (k.startsWith("c:")) {
    if (AL.separar.has(k)) return k;
    const c = normCedula(k.slice(2));
    return resolverClave(c ? "c:" + c : k);
  }
  return resolverClave(k);
}
/** Todas las claves que hoy apuntan a esta clienta (ella incluida). */
export function clavesDe(canon: string): string[] {
  const out = new Set([canon]);
  for (const k of AL.alias.keys()) if (resolverClave(k) === canon) out.add(k);
  return [...out];
}
