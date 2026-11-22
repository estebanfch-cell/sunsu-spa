// TK210: corregir la fecha real de la atención de un ticket ya creado (p. ej. el voucher es de un día anterior).
import { extend } from "./handlers.ts";
import { actorOf, logAccion, type Ctx, type Ses } from "./lib.ts";
import { ecuadorParts, s, ymdUtc, type Row } from "./domain.ts";
import { esAdmin } from "./permisos.ts";
import { veTicket } from "./inline_api.ts";
import { ticketPorClave } from "./tickets_beta_api.ts";
import {
  diaGyeDeInstante, FACTOR_SUBIDO_TARDE, parseFechaStaff, PROMPT_TARDE_TEXTO, SUBIDO_TARDE_DESDE, timestampAtencion, MAX_DIAS_ATRAS, addDias,
} from "./fecha_atencion.ts";

export async function cambiarFechaAtencion(ctx: Ctx, ses: Ses, p: Row): Promise<Row> {
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso para ese ticket" };
  const hoy = ecuadorParts(ctx.now).ymd;
  const fecha = parseFechaStaff(p.fecha, hoy);
  if (!fecha) return { error: "No entendí la fecha. Escríbela como 20/11 o 20/11/2026." };
  if (fecha > hoy) return { error: "La fecha de atención no puede ser futura." };
  if (fecha < addDias(hoy, -MAX_DIAS_ATRAS)) return { error: "Esa fecha es muy antigua; revisa el año." };
  const actual = ymdUtc(r.timestamp);
  const admin = esAdmin(ses.rol);
  if (!admin && fecha > actual) return { error: "Solo una administradora puede mover la atención a un día posterior." };
  const creadoDia = diaGyeDeInstante(r.created_at) || actual;
  const creadoMs = Date.parse(s(r.created_at));
  const aplicaRegla = !Number.isFinite(creadoMs) || creadoMs >= Date.parse(SUBIDO_TARDE_DESDE);
  const tarde = aplicaRegla && fecha < creadoDia;
  const orig: Row = { ...((r.orig && typeof r.orig === "object" ? r.orig : {}) as Row) };
  if (tarde) {
    const dias = Math.round((Date.parse(creadoDia + "T12:00:00Z") - Date.parse(fecha + "T12:00:00Z")) / 86400000);
    Object.assign(orig, { fecha_atencion: fecha, subido_tarde: true, comision_factor: FACTOR_SUBIDO_TARDE, dias_tarde: dias, subido_at: orig.subido_at || s(r.created_at) });
  } else {
    if (orig.subido_tarde === true && !admin) return { error: "Solo una administradora puede quitar «Subido tarde»." };
    orig.fecha_atencion = fecha;
    delete orig.subido_tarde; delete orig.comision_factor; delete orig.dias_tarde;
  }
  const hist = Array.isArray(orig.fecha_atencion_hist) ? orig.fecha_atencion_hist as Row[] : [];
  orig.fecha_atencion_hist = [...hist, { de: actual, a: fecha, por: actorOf(ses), at: ctx.now.toISOString() }].slice(-10);
  const actor = actorOf(ses);
  await ctx.db.write(actor, "tickets", "update", { id: r.id }, { timestamp: timestampAtencion(fecha), orig });
  try { await logAccion(ctx.db, actor, "FECHA ATENCION", `${s(r.so_num) || s(r.id)} · ${actual} → ${fecha}${tarde ? " · subido tarde 50%" : ""}`); } catch { /* log opcional */ }
  try { const { cuadreTrasTicket } = await import("./migo_cuadre_api.ts"); await cuadreTrasTicket(ctx, actor); } catch { /* el cambio ya quedó */ }
  return { ok: true, fecha_atencion: fecha, subido_tarde: tarde, comision_factor: tarde ? FACTOR_SUBIDO_TARDE : 1, ...(tarde ? { aviso_tarde: PROMPT_TARDE_TEXTO } : {}) };
}

extend("tk_fecha_atencion", "any", async (p, ctx, ses) => cambiarFechaAtencion(ctx, ses, p));
