/** TK220: descartar el aviso de «Posible duplicado» (no cancela el ticket). */
import { extend } from "./handlers.ts";
import { consultar } from "./query.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin, esVisor } from "./permisos.ts";
import { s, type Row } from "./domain.ts";
import { leerSerie } from "./series.ts";
import { claveDe } from "./ticket_beta.ts";
import { dupOkDe } from "./ticket_idempotencia.ts";

async function ticketPorClave(ctx: Ctx, clave: string): Promise<Row | null> {
  const k = s(clave);
  if (!k) return null;
  try {
    const a = await consultar(ctx.db, "tickets", { filtros: [{ col: "so_num", op: "eq", val: k }], limite: 1 });
    if (a.rows[0]) return a.rows[0];
  } catch { /* sigue */ }
  try {
    const b = await consultar(ctx.db, "tickets", { filtros: [{ col: "beta_num", op: "eq", val: k }], limite: 1 });
    if (b.rows[0]) return b.rows[0];
  } catch { /* sigue */ }
  return null;
}

async function cabDe(ctx: Ctx, clave: string): Promise<Row | undefined> {
  try {
    return (await consultar(ctx.db, "beta_tickets", { filtros: [{ col: "clave", op: "eq", val: clave }], limite: 1 })).rows[0];
  } catch {
    return undefined;
  }
}

async function marcarOk(ctx: Ctx, actor: string, clave: string, con: string, sheetRow: unknown, now: string): Promise<void> {
  const cab = await cabDe(ctx, clave);
  const datos = { ...((cab?.datos && typeof cab.datos === "object" ? cab.datos : {}) as Row) };
  const prev = dupOkDe(datos);
  if (!prev.includes(con)) datos.dup_ok = [...prev, con].slice(-20);
  const hist = [...(Array.isArray(cab?.historial) ? cab!.historial as Row[] : []), { fecha: now, actor, accion: "descartar aviso duplicado", detalle: con }].slice(-100);
  if (cab) await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos, historial: hist, actualizado_por: actor, updated_at: now });
  else await ctx.db.write(actor, "beta_tickets", "insert", {}, { clave, sheet_row: sheetRow ?? null, datos, historial: hist, actualizado_por: actor, updated_at: now });
}

export async function descartarAvisoDuplicado(p: Row, ctx: Ctx, ses: Ses): Promise<Row> {
  if (esVisor(ses.rol) || !esAdmin(ses.rol)) return { error: "Solo un admin puede descartar este aviso" };
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  const con = s(p.con) || s(p.clave_par);
  if (!con) return { error: "Indica el otro ticket" };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const propia = claveDe(r, leerSerie(r, "so_num"));
  await marcarOk(ctx, actor, propia, con, r.sheet_row, now);
  const par = await ticketPorClave(ctx, con);
  if (par) {
    const otra = claveDe(par, leerSerie(par, "so_num"));
    if (otra) await marcarOk(ctx, actor, otra, propia, par.sheet_row, now);
  }
  try { await logAccion(ctx.db, actor, "DESCARTAR AVISO DUPLICADO", propia + " · " + con); } catch { /* log opcional */ }
  return { ok: true, clave: propia, con };
}

extend("tk_dup_descartar", "any", async (p, ctx, ses) => descartarAvisoDuplicado(p, ctx, ses));
