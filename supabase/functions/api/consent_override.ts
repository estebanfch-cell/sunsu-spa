// TK183 (Emilia t796u–t799u): «Autoriza fotos» corregido en la ficha (beta_clientes) manda sobre el formulario de
// registro (clientas_registro) en TODOS los lectores: banner del ticket, Tarjetas, Agenda, getAutorizaFotos, ficha vieja.
import type { Db } from "./db.ts";
import { canonDeClave, cargarAlias } from "./clientes_alias.ts";
import { claveRegistro } from "./ventas.ts";
import { s, type Row } from "./domain.ts";

/** «Si», «SÍ, autorizo», «no autorizo»… → «SI» / «NO»; otra cosa → "". */
export function siNo(v: unknown): string {
  const t = s(v).trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (/^SI\b/.test(t) || t === "S") return "SI";
  if (/^NO\b/.test(t) || t === "N") return "NO";
  return "";
}
/** Clave canónica de la clienta → «SI»/«NO» corregido en la ficha (el más reciente gana). */
export async function autorizaFotosCorregidas(db: Db): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  try { await cargarAlias(db); } catch { /* sin alias: claves directas */ }
  let rows: Row[] = [];
  try { rows = await db.all("beta_clientes"); } catch { return m; }
  rows = [...rows].sort((a, b) => s(a.updated_at).localeCompare(s(b.updated_at)));
  for (const r of rows) {
    const v = siNo(((r.datos || {}) as Row).autorizaFotos);
    if (v) m.set(canonDeClave(s(r.key)), v);
  }
  return m;
}
/** Valor que vale para esta fila del registro: el corregido si existe, si no el del formulario. */
export function autorizaDe(m: Map<string, string>, reg: Row): string {
  if (m.size) { const v = m.get(canonDeClave(claveRegistro(reg))); if (v) return v; }
  return s(reg.autoriza_fotos);
}
