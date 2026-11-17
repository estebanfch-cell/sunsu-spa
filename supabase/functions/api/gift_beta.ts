// Gift cards estilo MineCore (TK20): reglas puras. Las filas viven en gift_cards (la hoja);
// lo nuevo (para/de/servicio/validez/tickets/historial) en beta_gift_ajustes.
import { n, s, type Row } from "./domain.ts";

export const normCod = (c: unknown) => s(c).trim().toUpperCase();
export function sinDia(v: unknown): boolean { return v == null || s(v) === "" || s(v) === "0"; }
export function vendidaGift(r: Row): boolean { return !sinDia(r.dia) || !!s(r.nombre_comprador) || !!s(r.cedula_comprador); }
export const usadaGift = (r: Row) => r.usado === true || r.usado === "true" || s(r.usado).toUpperCase() === "SI";

export type EstadoGift = "disponible" | "vigente" | "usada" | "vencida" | "eliminada";
export function estadoGift(r: Row, aj: Row | null | undefined, hoy: string): EstadoGift {
  if (r.borrado_at) return "eliminada";
  if (usadaGift(r)) return "usada";
  if (!vendidaGift(r)) return "disponible";
  const v = s(aj?.valido_hasta).slice(0, 10);
  if (v && hoy && v < hoy) return "vencida";
  return "vigente";
}
export const ETQ_ESTADO: Record<EstadoGift, string> = { disponible: "Disponible", vigente: "Vigente", usada: "Usada", vencida: "Vencida", eliminada: "Eliminada" };

/** «PREMIUM. De: Camila. Para: Carolina Espinosa» → servicio / de / para. */
export function leerNotas(notas: unknown): { servicio: string; de: string; para: string } {
  const t = s(notas).trim();
  const de = (t.match(/\bDe:\s*(.+?)(?=\s*(?:\.|,)?\s*(?:y\s+)?Para:|\.\s*$|$)/i)?.[1] || "").trim().replace(/[.,]+$/, "");
  const para = (t.match(/\bPara:\s*(.+?)(?:\.\s*$|$)/i)?.[1] || "").trim().replace(/[.,]+$/, "");
  const prim = t.split(/[.]/)[0].trim();
  const servicio = prim && !/^(De|Para):/i.test(prim) && prim.length <= 40 ? prim : "";
  return { servicio, de, para };
}

/** Códigos repetidos (los viejos se quedan como están; no se crean nuevos repetidos). */
export function repetidos(rows: Row[]): Set<string> {
  const c = new Map<string, number>();
  for (const r of rows) { if (r.borrado_at) continue; const k = normCod(r.codigo_gc); if (k) c.set(k, (c.get(k) || 0) + 1); }
  return new Set([...c].filter(([, v]) => v > 1).map(([k]) => k));
}
/** El código ya existe en otra fila (incluye las eliminadas: un código no se reutiliza). */
export function codigoTomado(rows: Row[], codigo: string, propioId?: unknown): boolean {
  const k = normCod(codigo);
  return !!k && rows.some((r) => normCod(r.codigo_gc) === k && (propioId == null || String(r.id) !== String(propioId)));
}
/** Siguiente código para vender: el primer código en blanco del año que no esté repetido;
 *  si no queda, YY-(máximo+1), que es nuevo y único. */
export function siguienteGift(rows: Row[], yy: string): { codigo: string; id: unknown | null } {
  const rep = repetidos(rows);
  const blancos = rows.filter((r) => !r.borrado_at && s(r.origin) !== "test" && !vendidaGift(r) && !usadaGift(r) && s(r.codigo_gc).trim().startsWith(yy + "-") && !rep.has(normCod(r.codigo_gc)))
    .sort((a, b) => numDe(a.codigo_gc) - numDe(b.codigo_gc));
  if (blancos.length) return { codigo: s(blancos[0].codigo_gc).trim(), id: blancos[0].id ?? null };
  let max = 0;
  for (const r of rows) { const m = /^(\d{2})-(\d+)$/.exec(s(r.codigo_gc).trim()); if (m && m[1] === yy) max = Math.max(max, Number(m[2])); }
  let cand = yy + "-" + String(max + 1).padStart(3, "0");
  while (codigoTomado(rows, cand)) { max++; cand = yy + "-" + String(max + 1).padStart(3, "0"); }
  return { codigo: cand, id: null };
}
function numDe(c: unknown): number { const m = /-(\d+)$/.exec(s(c).trim()); return m ? Number(m[1]) : 1e9; }
export function ordenCodigo(a: Row, b: Row): number {
  const pa = /^(\d{2})-(\d+)$/.exec(s(a.codigo_gc).trim()), pb = /^(\d{2})-(\d+)$/.exec(s(b.codigo_gc).trim());
  if (pa && pb) return Number(pb[1]) - Number(pa[1]) || Number(pb[2]) - Number(pa[2]) || n(b.sheet_row) - n(a.sheet_row);
  if (pa) return -1; if (pb) return 1;
  return n(b.sheet_row) - n(a.sheet_row);
}
export function fechaVenta(r: Row): string {
  if ([r.dia, r.mes, r.ano].some((x) => sinDia(x))) return "";
  let y = Number(s(r.ano).split(".")[0]); if (y > 0 && y < 100) y += 2000;
  return `${y}-${String(n(r.mes)).padStart(2, "0")}-${String(n(r.dia)).padStart(2, "0")}`;
}
/** Válido hasta por defecto: 6 meses después de la venta (como la gift card digital). */
export function validoPorDefecto(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd); if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1 + 6, +m[3]));
  return d.toISOString().slice(0, 10);
}
