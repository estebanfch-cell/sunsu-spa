// Series visibles TK-SO (tickets) y COT (cotizaciones nuevas). TK-SQ ya emitido se queda. beta_num sigue siendo el id secundario.
import type { Db } from "./db.ts";
import { enPrueba } from "./db.ts";
import { n, s, siguienteTestDoc, type Row } from "./domain.ts";
import { consultar } from "./query.ts";

export function formatoSerie(serie: string, num: number): string {
  return `${serie}-${String(Math.trunc(num)).padStart(4, "0")}`;
}

export function leerSerie(row: Row, campo: string): string {
  const directo = s(row[campo]);
  if (directo) return directo;
  const o = row.orig;
  if (o && typeof o === "object") return s((o as Row)[campo]);
  return "";
}

export function esFilaPrueba(row: Row): boolean {
  if (s(row.origin) === "test") return true;
  return [s(row.beta_num), s(row.numero), s(row.so_num), leerSerie(row, "so_num"), leerSerie(row, "sq_num")]
    .some((c) => c.startsWith("TEST-"));
}

export function maxSerie(rows: Row[], serie: string, campo: string): number {
  const re = new RegExp("^" + serie.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-(\\d+)$");
  let max = 0;
  for (const r of rows) {
    if (esFilaPrueba(r)) continue;
    for (const raw of [s(r[campo]), leerSerie(r, campo)]) {
      const m = re.exec(raw);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return max;
}

/** Fila de la hoja en blanco (sin fecha, nombre ni cédula): no lleva número. */
export function filaVacia(r: Row): boolean {
  return !s(r.timestamp) && !s(r.nombre) && !s(r.id_3) && !s(r.beta_num);
}
/** Lo justo para numerar (la tabla tickets sin orig, que es lo pesado). */
export async function filasSerie(db: Db): Promise<Row[]> {
  return (await consultar(db, "tickets", { cols: ["id", "sheet_row", "timestamp", "nombre", "id_3", "so_num", "origin", "beta_num"] })).rows;
}
function matchDe(row: Row): Row {
  if (row.id != null && row.id !== "") return { id: row.id };
  if (row.sheet_row != null && row.sheet_row !== "") return { sheet_row: row.sheet_row };
  return {};
}

function porFecha(a: Row, b: Row): number {
  const ta = s(a.timestamp || a.fecha);
  const tb = s(b.timestamp || b.fecha);
  if (!ta !== !tb) return ta ? -1 : 1;
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (n(a.sheet_row) !== n(b.sheet_row)) return n(a.sheet_row) - n(b.sheet_row);
  return n(a.id) - n(b.id);
}

/** Asigna TK-SO-0001 en orden cronológico a los tickets reales que todavía no tienen serie. */
export async function backfillSO(db: Db, actor: string, opts: { preview?: boolean } = {}): Promise<number> {
  if (opts.preview || enPrueba(db)) return 0;
  // Columnas livianas (sin orig): antes bajaba la tabla entera en cada ticket nuevo y tardaba ~30 s.
  const rows = await filasSerie(db);
  const faltanIds = rows.filter((r) => !esFilaPrueba(r) && !filaVacia(r) && !/^TK-SO-\d+$/.test(s(r.so_num))).map((r) => r.id as string | number).filter((x) => x != null);
  const conOrig = faltanIds.length ? (await consultar(db, "tickets", { cols: ["id", "sheet_row", "timestamp", "so_num", "origin", "beta_num", "orig"], filtros: [{ col: "id", op: "in", val: faltanIds.slice(0, 2000) }] })).rows : [];
  const faltan = conOrig.filter((r) => !esFilaPrueba(r) && !/^TK-SO-\d+$/.test(leerSerie(r, "so_num")));
  faltan.sort(porFecha);
  let seq = maxSerie(rows, "TK-SO", "so_num");
  let nAsig = 0;
  for (const r of faltan) {
    const match = matchDe(r);
    if (!Object.keys(match).length) continue;
    seq++;
    const num = formatoSerie("TK-SO", seq);
    const orig = { ...(r.orig && typeof r.orig === "object" ? r.orig as Row : {}), so_num: num };
    await db.write(actor, "tickets", "update", match, { so_num: num, orig });
    nAsig++;
  }
  return nAsig;
}

/** Asigna COT-#### a las cotizaciones reales que todavía no tienen número. COT- y TK-SQ- se quedan. */
export async function backfillSQ(db: Db, actor: string, opts: { preview?: boolean } = {}): Promise<number> {
  if (opts.preview || enPrueba(db)) return 0;
  const rows = await db.all("cotizaciones");
  const ya = (raw: string) => /^(TK-SQ|COT)-\d+$/.test(raw);
  const tiene = (r: Row) => ya(s(r.numero)) || ya(leerSerie(r, "numero")) || ya(leerSerie(r, "sq_num"));
  const faltan = rows.filter((r) => !esFilaPrueba(r) && !tiene(r));
  faltan.sort(porFecha);
  let seq = Math.max(maxSerie(rows, "COT", "numero"), maxSerie(rows, "COT", "sq_num"));
  let nAsig = 0;
  for (const r of faltan) {
    const match = matchDe(r);
    if (!Object.keys(match).length) continue;
    seq++;
    const num = formatoSerie("COT", seq);
    const orig = { ...(r.orig && typeof r.orig === "object" ? r.orig as Row : {}), sq_num: num };
    await db.write(actor, "cotizaciones", "update", match, { numero: num, orig });
    nAsig++;
  }
  return nAsig;
}

/**
 * Siguiente número. En prueba es TEST-TK-SO-0001 y no llama la secuencia real.
 * Si doc_seq quedó detrás del backfill, se adelanta hasta el máximo local.
 */
export async function tomarNumero(db: Db, serie: string, rows: Row[], campo: string): Promise<string> {
  if (enPrueba(db)) return siguienteTestDoc(rows, serie);
  const local = maxSerie(rows, serie, campo) + 1;
  try {
    let v = Number(await db.rpc("next_doc_num", { p_serie: serie }));
    let guard = 0;
    while (Number.isFinite(v) && v > 0 && v < local && guard < 20000) {
      v = Number(await db.rpc("next_doc_num", { p_serie: serie }));
      guard++;
    }
    if (Number.isFinite(v) && v >= local) return formatoSerie(serie, Math.trunc(v));
  } catch { /* sin doc_seq: el máximo local no choca con el backfill */ }
  return formatoSerie(serie, local);
}
