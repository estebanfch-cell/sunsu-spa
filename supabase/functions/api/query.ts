// Consulta paginada con columnas y filtros (Emilia 17/11: la lista de tickets no puede bajar las 2.000 filas).
// SupabaseDb la traduce a PostgREST; las demás bases (memoria, vista de prueba) filtran en JS con la misma regla.
import type { Db } from "./db.ts";
import type { Row } from "./domain.ts";

export type Filtro =
  | { col: string; op: "eq" | "neq" | "gte" | "lt" | "lte"; val: string | number | boolean }
  | { col: string; op: "is_null" | "not_null" | "is_true" | "not_true" }
  | { col: string; op: "in"; val: (string | number)[] }
  /** Cada palabra tiene que aparecer (ilike) en alguna de las columnas. */
  | { op: "palabras"; cols: string[]; val: string[] }
  /** Alguna de las condiciones simples. */
  | { op: "or"; de: Filtro[] };
export interface Consulta { cols?: string[]; filtros?: Filtro[]; orden?: { col: string; desc?: boolean }[]; limite?: number; desde?: number; contar?: boolean }
export interface Resultado { rows: Row[]; total: number | null }
export interface DbConsulta { consultar(table: string, q: Consulta): Promise<Resultado> }

function valor(r: Row, col: string): unknown {
  const m = col.match(/^(\w+)->>(\w+)$/);
  if (m) { const o = r[m[1]]; return o && typeof o === "object" ? (o as Row)[m[2]] : undefined; }
  return r[col];
}
const sx = (v: unknown) => (v == null ? "" : String(v));
const norm = (v: unknown) => sx(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const ts = (v: unknown) => sx(v).replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T");
const verdad = (v: unknown) => v === true || sx(v).toLowerCase() === "true";
export function cumple(r: Row, f: Filtro): boolean {
  if (f.op === "palabras") return f.val.every((w) => f.cols.some((c) => norm(valor(r, c)).includes(norm(w))));
  if (f.op === "or") return f.de.some((x) => cumple(r, x));
  const v = valor(r, f.col);
  switch (f.op) {
    case "eq": return typeof f.val === "boolean" ? verdad(v) === f.val : sx(v) === sx(f.val);
    case "neq": return sx(v) !== sx(f.val);
    case "gte": return ts(v) >= ts(f.val);
    case "lt": return ts(v) < ts(f.val);
    case "lte": return ts(v) <= ts(f.val);
    case "is_null": return v == null || v === "";
    case "not_null": return !(v == null || v === "");
    case "is_true": return verdad(v);
    case "not_true": return !verdad(v);
    case "in": return f.val.map(sx).includes(sx(v));
  }
  return true;
}
export function consultarEnJs(rows: Row[], q: Consulta): Resultado {
  let L = rows.filter((r) => (q.filtros || []).every((f) => cumple(r, f)));
  for (const o of [...(q.orden || [])].reverse()) L = L.sort((a, b) => { const x = sx(valor(a, o.col)), y = sx(valor(b, o.col)); return (x < y ? -1 : x > y ? 1 : 0) * (o.desc ? -1 : 1); });
  const total = L.length, d = q.desde || 0;
  L = q.limite != null ? L.slice(d, d + q.limite) : L.slice(d);
  if (q.cols && q.cols.length) L = L.map((r) => Object.fromEntries(q.cols!.map((c) => [c, r[c]])));
  return { rows: L, total: q.contar ? total : null };
}
// ---- PostgREST ----
const esc = (v: unknown) => { const t = sx(v); return /[,()."\s:]/.test(t) ? '"' + t.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"' : t; };
const likeEsc = (w: string) => w.replace(/[%_*,()"\\]/g, " ").trim();
function cond(f: Filtro): string {
  if (f.op === "palabras") return "and(" + f.val.map((w) => "or(" + f.cols.map((c) => `${c}.ilike.*${likeEsc(w)}*`).join(",") + ")").join(",") + ")";
  if (f.op === "or") return "or(" + f.de.map(cond).join(",") + ")";
  const c = f.col;
  switch (f.op) {
    case "eq": case "neq": case "gte": case "lt": case "lte": return `${c}.${f.op}.${esc(f.val)}`;
    case "is_null": return `${c}.is.null`;
    case "not_null": return `${c}.not.is.null`;
    case "is_true": return `${c}.is.true`;
    case "not_true": return `or(${c}.is.null,${c}.is.false)`;
    case "in": return `${c}.in.(${f.val.map(esc).join(",")})`;
  }
  return "";
}
export function urlConsulta(base: string, table: string, q: Consulta): string {
  const ps: string[] = ["select=" + encodeURIComponent((q.cols && q.cols.length ? q.cols : ["*"]).join(","))];
  const fs = q.filtros || [];
  if (fs.length) ps.push("and=" + encodeURIComponent("(" + fs.map(cond).join(",") + ")"));
  if (q.orden && q.orden.length) ps.push("order=" + encodeURIComponent(q.orden.map((o) => o.col + (o.desc ? ".desc.nullslast" : ".asc")).join(",")));
  return `${base}/rest/v1/${encodeURIComponent(table)}?${ps.join("&")}`;
}
/** Usa la consulta del servidor si la base la tiene; si no, baja la tabla y filtra (memoria / pruebas). */
export async function consultar(db: Db, table: string, q: Consulta): Promise<Resultado> {
  const x = db as unknown as Partial<DbConsulta>;
  if (typeof x.consultar === "function") return await x.consultar(table, q);
  return consultarEnJs(await db.all(table), q);
}
