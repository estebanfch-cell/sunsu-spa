// Multas de la beta (Emilia 17/11, DEV-37). Catálogo editable de tipos con monto por defecto (beta_multa_tipos),
// tipo fijo «Descuento» (monto libre, p. ej. un producto), aplicadas desde un ticket o Personal › Multas (beta_multas),
// editar/anular con historial. El rol las suma a las del sistema central (multas_descuentos) en el corte 26→25.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin, esPropio } from "./permisos.ts";
import { ecuadorParts, n, normNombre, round2, s, ymdUtc, type Row } from "./domain.ts";
import type { Db } from "./db.ts";

async function todas(db: Db, t: string): Promise<Row[]> { try { return await db.all(t); } catch { return []; } }
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

/** Tipo libre «Descuento» (producto u otro), con o sin mayúsculas; no vive en el catálogo de multas. */
export function esTipoDescuento(tipo: unknown): boolean {
  return normNombre(tipo) === "descuento" || normNombre(tipo).startsWith("descuento ");
}

/** Misma persona por nombre (primer nombre o nombre completo), como el rol. */
export function mismaPersonaMulta(a: string, b: string): boolean {
  const x = normNombre(a), y = normNombre(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const kx = x.split(" ")[0], ky = y.split(" ")[0];
  return !!kx && kx === ky && (x.startsWith(y) || y.startsWith(x) || x.split(" ").length === 1 || y.split(" ").length === 1 || x.split(" ")[1] === y.split(" ")[1]);
}

/** Multas unificadas: sistema central (multas_descuentos) + beta (beta_multas, sin anuladas salvo que se pidan). */
export async function multasUnificadas(db: Db, conAnuladas = false): Promise<Row[]> {
  const out: Row[] = [];
  for (const r of await todas(db, "multas_descuentos")) {
    if (r.borrado_at && !conAnuladas) continue;
    out.push({
      id: "s:" + s(r.id ?? r.sheet_row), fuente: "sistema", fecha: ymdUtc(r.fecha) || s(r.fecha).slice(0, 10), persona: s(r.cosmetologa) || s(r.empleada) || s(r.nombre),
      tipo: s(r.tipo) || "MULTA", clase: s(r.tipo).toUpperCase() === "DESCUENTO" ? "DESCUENTO" : "MULTA", monto: n(r.monto), motivo: s(r.motivo),
      ticket: "", estado: r.borrado_at ? "anulada" : "activa", editable: false,
    });
  }
  for (const r of await todas(db, "beta_multas")) {
    if (s(r.estado) === "anulada" && !conAnuladas) continue;
    out.push({
      id: s(r.id), fuente: "beta", fecha: s(r.fecha).slice(0, 10), persona: s(r.persona), tipo: s(r.tipo) || "Multa", clase: esTipoDescuento(r.tipo) ? "DESCUENTO" : "MULTA", tipoId: s(r.tipo_id),
      monto: n(r.monto), motivo: s(r.motivo), ticket: s(r.ticket_so), ticketId: r.ticket_id ?? null, estado: s(r.estado) || "activa",
      anuladaMotivo: s(r.anulada_motivo), anuladaPor: s(r.anulada_por), creadoPor: s(r.creado_por), historial: Array.isArray(r.historial) ? r.historial : [], editable: true,
    });
  }
  return out.sort((a, b) => s(b.fecha).localeCompare(s(a.fecha)));
}

/** Fila de detalle para el pre-rol / PDF (multa o descuento). */
function filaDetalle(r: Row, fuente: "beta" | "sistema"): Row {
  const tipoNom = fuente === "sistema" ? (s(r.tipo) || "MULTA") : (s(r.tipo) || "Multa");
  return {
    tipo: esTipoDescuento(tipoNom) ? "DESCUENTO" : "MULTA",
    concepto: tipoNom,
    fecha: (fuente === "sistema" ? (ymdUtc(r.fecha) || s(r.fecha).slice(0, 10)) : s(r.fecha).slice(0, 10)),
    monto: n(r.monto),
    motivo: s(r.motivo) + (s(r.ticket_so) ? " (" + s(r.ticket_so) + ")" : ""),
    fuente,
  };
}

/** Multas/descuentos de la beta de una persona en el corte [desde, hasta] (las del sistema ya las suma el rol). */
export async function multasBetaRol(db: Db, persona: string, desde: string, hasta: string): Promise<{ total: number; detalle: Row[] }> {
  const detalle = (await todas(db, "beta_multas")).filter((r) => s(r.estado) !== "anulada" && s(r.fecha) >= desde && s(r.fecha).slice(0, 10) <= hasta && mismaPersonaMulta(s(r.persona), persona))
    .map((r) => filaDetalle(r, "beta"));
  return { total: round2(detalle.reduce((a, x) => a + x.monto, 0)), detalle };
}

/** Detalle de la hoja anterior (multas_descuentos) en el mismo corte: para pintar líneas en el pre-rol, sin sumar de nuevo. */
export async function detalleMultasSistema(db: Db, persona: string, desde: string, hasta: string): Promise<Row[]> {
  return (await todas(db, "multas_descuentos")).filter((r) => {
    if (r.borrado_at) return false;
    const f = ymdUtc(r.fecha) || s(r.fecha).slice(0, 10);
    if (!f || f < desde || f > hasta) return false;
    return mismaPersonaMulta(s(r.cosmetologa) || s(r.empleada) || s(r.nombre), persona);
  }).map((r) => filaDetalle(r, "sistema"));
}

async function tipos(db: Db): Promise<Row[]> {
  return (await todas(db, "beta_multa_tipos")).sort((a, b) => n(a.orden) - n(b.orden) || s(a.nombre).localeCompare(s(b.nombre)))
    .map((t) => ({ id: s(t.id), nombre: s(t.nombre), monto: n(t.monto), activo: t.activo !== false, orden: n(t.orden) }));
}

extend("mt_tipos", "any", async (_p, ctx, ses) => {
  const L = await tipos(ctx.db);
  return { ok: true, tipos: esAdmin(ses.rol) ? L : L.filter((t) => t.activo), admin: esAdmin(ses.rol) };
});

extend("mt_tipo_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita los tipos de multa" };
  const nombre = s(p.nombre).trim().slice(0, 80), monto = round2(n(p.monto));
  if (!nombre) return { error: "Escribe el nombre del tipo" };
  if (monto < 0) return { error: "Monto inválido" };
  const L = await todas(ctx.db, "beta_multa_tipos");
  const actual = s(p.id) ? L.find((t) => s(t.id) === s(p.id)) : null;
  if (L.some((t) => s(t.id) !== s(p.id) && normNombre(s(t.nombre)) === normNombre(nombre))) return { error: "Ya existe un tipo con ese nombre" };
  const actor = actorOf(ses), fila: Row = { nombre, monto, activo: p.activo !== false, actualizado_por: actor, updated_at: ctx.now.toISOString() };
  if (p.orden != null) fila.orden = n(p.orden);
  if (actual) await ctx.db.write(actor, "beta_multa_tipos", "update", { id: actual.id }, fila);
  else await ctx.db.write(actor, "beta_multa_tipos", "insert", {}, { id: crypto.randomUUID(), orden: L.length + 1, ...fila });
  await logAccion(ctx.db, actor, "MULTA TIPO", (actual ? "editar " : "nuevo ") + nombre + " $" + monto + (p.activo === false ? " (inactivo)" : ""));
  return { ok: true, tipos: await tipos(ctx.db) };
});

extend("mt_lista", "any", async (p, ctx, ses) => {
  const admin = esAdmin(ses.rol);
  let L = await multasUnificadas(ctx.db, p.anuladas === true);
  if (!admin) L = L.filter((m) => esPropio(s(m.persona), ses));
  const quien = s(p.persona);
  if (quien) L = L.filter((m) => mismaPersonaMulta(s(m.persona), quien));
  const mes = s(p.mes);
  if (/^\d{4}-\d{2}$/.test(mes)) L = L.filter((m) => s(m.fecha).startsWith(mes));
  if (s(p.desde)) L = L.filter((m) => s(m.fecha) >= s(p.desde));
  if (s(p.hasta)) L = L.filter((m) => s(m.fecha) <= s(p.hasta));
  if (s(p.tipo)) L = L.filter((m) => normNombre(s(m.tipo)) === normNombre(s(p.tipo)));
  if (s(p.ticket)) L = L.filter((m) => s(m.ticket) === s(p.ticket));
  const porPersona: Record<string, number> = {};
  for (const m of L) if (m.estado !== "anulada") porPersona[s(m.persona)] = round2((porPersona[s(m.persona)] || 0) + n(m.monto));
  const total = round2(L.filter((m) => m.estado !== "anulada").reduce((a, m) => a + n(m.monto), 0));
  return { ok: true, items: L.slice(0, 500), total, porPersona, admin, tipos: await tipos(ctx.db), hoy: ecuadorParts(ctx.now).ymd };
});

function hist(r: Row | null, ses: Ses, ctx: Ctx, accion: string, detalle: string): Row[] {
  return [...(r && Array.isArray(r.historial) ? r.historial as Row[] : []), { fecha: ctx.now.toISOString(), actor: ses.name, accion, detalle }].slice(-50);
}

extend("mt_crear", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin aplica multas" };
  const persona = s(p.persona).trim();
  if (!persona) return { error: "Elige la persona" };
  const T = await tipos(ctx.db);
  const tipoLibre = esTipoDescuento(p.tipoId) || esTipoDescuento(p.tipo) ? "Descuento" : "";
  const tp = tipoLibre ? undefined : (T.find((t) => t.id === s(p.tipoId)) || T.find((t) => normNombre(s(t.nombre)) === normNombre(s(p.tipo))));
  const tipo = tp ? s(tp.nombre) : (s(p.tipo).trim() || tipoLibre);
  if (!tipo) return { error: "Elige el tipo de multa o descuento" };
  const monto = round2(p.monto != null && s(p.monto) !== "" ? n(p.monto) : n(tp?.monto));
  if (!(monto > 0)) return { error: "El monto tiene que ser mayor a 0" };
  const motivo = s(p.motivo).trim().slice(0, 500);
  if (motivo.length < 3) return { error: "Escribe el motivo" };
  const fecha = ymdRe.test(s(p.fecha)) ? s(p.fecha) : ecuadorParts(ctx.now).ymd;
  const actor = actorOf(ses), id = crypto.randomUUID();
  const det = persona + " · " + tipo + " $" + monto + (s(p.ticketSo) ? " · " + s(p.ticketSo) : "") + " · " + motivo;
  await ctx.db.write(actor, "beta_multas", "insert", {}, {
    id, fecha, persona, tipo_id: tp ? tp.id : null, tipo, monto, motivo, ticket_id: n(p.ticketId) > 0 ? n(p.ticketId) : null, ticket_so: s(p.ticketSo) || null,
    estado: "activa", creado_por: ses.name || actor, historial: hist(null, ses, ctx, "crear", det),
  });
  await logAccion(ctx.db, actor, "MULTA", det);
  return { ok: true, id };
});

async function multaBeta(ctx: Ctx, id: string): Promise<Row | null> {
  return (await todas(ctx.db, "beta_multas")).find((r) => s(r.id) === id) || null;
}

extend("mt_editar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita multas" };
  const r = await multaBeta(ctx, s(p.id));
  if (!r) return { error: "Multa no encontrada (las del sistema anterior se editan en la hoja)" };
  if (s(r.estado) === "anulada") return { error: "La multa está anulada" };
  const patch: Row = {}, cambios: string[] = [];
  if (p.persona != null && s(p.persona).trim() && s(p.persona).trim() !== s(r.persona)) { patch.persona = s(p.persona).trim(); cambios.push("persona: " + s(r.persona) + " → " + patch.persona); }
  if (p.tipo != null && s(p.tipo).trim() && s(p.tipo).trim() !== s(r.tipo)) {
    const nom = esTipoDescuento(p.tipo) ? "Descuento" : s(p.tipo).trim();
    const tp = esTipoDescuento(nom) ? undefined : (await tipos(ctx.db)).find((t) => normNombre(s(t.nombre)) === normNombre(nom));
    patch.tipo = tp ? s(tp.nombre) : nom; patch.tipo_id = tp ? tp.id : null; cambios.push("tipo: " + s(r.tipo) + " → " + patch.tipo);
  }
  if (p.monto != null && s(p.monto) !== "" && round2(n(p.monto)) !== round2(n(r.monto))) {
    if (!(n(p.monto) > 0)) return { error: "El monto tiene que ser mayor a 0" };
    patch.monto = round2(n(p.monto)); cambios.push("monto: $" + n(r.monto) + " → $" + patch.monto);
  }
  if (p.motivo != null && s(p.motivo).trim() !== s(r.motivo)) { if (s(p.motivo).trim().length < 3) return { error: "Escribe el motivo" }; patch.motivo = s(p.motivo).trim().slice(0, 500); cambios.push("motivo"); }
  if (p.fecha != null && ymdRe.test(s(p.fecha)) && s(p.fecha) !== s(r.fecha).slice(0, 10)) { patch.fecha = s(p.fecha); cambios.push("fecha: " + s(r.fecha).slice(0, 10) + " → " + patch.fecha); }
  if (!cambios.length) return { ok: true, sinCambios: true };
  patch.historial = hist(r, ses, ctx, "editar", cambios.join(", "));
  patch.updated_at = ctx.now.toISOString();
  await ctx.db.write(actorOf(ses), "beta_multas", "update", { id: r.id }, patch);
  await logAccion(ctx.db, actorOf(ses), "MULTA EDITAR", s(r.persona) + " · " + cambios.join(", "));
  return { ok: true };
});

extend("mt_anular", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin anula multas" };
  const r = await multaBeta(ctx, s(p.id));
  if (!r) return { error: "Multa no encontrada (las del sistema anterior se anulan en la hoja)" };
  const motivo = s(p.motivo).trim().slice(0, 300);
  if (motivo.length < 3) return { error: "Escribe el motivo de la anulación" };
  const reactivar = p.reactivar === true;
  if (!reactivar && s(r.estado) === "anulada") return { error: "Ya estaba anulada" };
  await ctx.db.write(actorOf(ses), "beta_multas", "update", { id: r.id }, reactivar
    ? { estado: "activa", anulada_motivo: null, anulada_por: null, anulada_ts: null, historial: hist(r, ses, ctx, "reactivar", motivo), updated_at: ctx.now.toISOString() }
    : { estado: "anulada", anulada_motivo: motivo, anulada_por: ses.name, anulada_ts: ctx.now.toISOString(), historial: hist(r, ses, ctx, "anular", motivo), updated_at: ctx.now.toISOString() });
  await logAccion(ctx.db, actorOf(ses), reactivar ? "MULTA REACTIVAR" : "MULTA ANULAR", s(r.persona) + " · " + s(r.tipo) + " $" + n(r.monto) + " · " + motivo);
  return { ok: true };
});
