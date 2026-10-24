// Edición en línea y solicitudes de cambio. El admin guarda por el mismo camino
// auditado; el resto pide un cambio y un admin lo aprueba o lo rechaza.

import { extend, crearTicket } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { acceso, esAdmin, esPropio, matrizDe } from "./permisos.ts";
import { n, normNombre, s, type Row } from "./domain.ts";
import { pushAPersonas } from "./horarios_api.ts";

const CAMPOS: Record<string, string> = {
  nombre: "nombre",
  apellido: "apellido",
  cedula: "id_3",
  facial: "facial_hecho",
  pack3: "compra_pack_3",
  pack6: "compra_pack_6",
  extras: "servicios_adicionales",
  notas: "notas_generales",
  recomendaciones: "recomendaciones",
  estimado: "estimado",
  cosmetologa: "atendido_por",
};

function filaDe(row: Row): string {
  return s(row.sheet_row) || s(row.beta_num) || s(row.so_num) || s(row.id);
}

async function anotar(ctx: Ctx, ses: Ses, tabla: string, fila: string, accion: "INSERT" | "UPDATE" | "DELETE", antes: Row | null, despues: Row | null) {
  const actor = actorOf(ses);
  try {
    await ctx.db.write(actor, "audit_log", "insert", {}, {
      actor, actor_fuente: "app.user", tabla, fila_id: fila, accion, antes, despues,
    });
  } catch { /* 0006 ya anota la fila si el trigger está enganchado */ }
  await logAccion(ctx.db, actor, accion + " " + tabla, fila);
}

function bloqueoPrueba(ses: Ses, row: Row): string | null {
  if (ses.prueba && s(row.origin) !== "test") return "Modo prueba no cambia datos reales";
  return null;
}

async function ticketDe(ctx: Ctx, fila: string): Promise<Row | null> {
  const rows = await ctx.db.all("tickets");
  return rows.find((r) => s(r.sheet_row) === fila || s(r.beta_num) === fila || s(r.so_num) === fila || s(r.id) === fila) || null;
}

function patchDe(campos: Row): Row {
  const patch: Row = {};
  for (const [k, col] of Object.entries(CAMPOS)) {
    if (campos[k] == null) continue;
    patch[col] = k === "estimado" ? n(campos[k]) : s(campos[k]);
  }
  return patch;
}

function vistaDe(row: Row): Row {
  const out: Row = {};
  for (const [k, col] of Object.entries(CAMPOS)) out[k] = row[col] ?? "";
  return out;
}

export async function guardarTicketCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  if (!fila || fila === "nuevo") {
    const creado = await crearTicket({
      nombre: s(campos.nombre), apellido: s(campos.apellido), cedula: s(campos.cedula),
      facial: s(campos.facial), pack3: s(campos.pack3), pack6: s(campos.pack6),
      extras: s(campos.extras), notas: s(campos.notas), recomendaciones: s(campos.recomendaciones),
      estimado: campos.estimado, cosmetologa: s(campos.cosmetologa) || ses.name,
    }, ctx, ses);
    if (!creado.error) await anotar(ctx, ses, "tickets", s(creado.beta_num || creado.so_num), "INSERT", null, creado);
    return creado;
  }
  const row = await ticketDe(ctx, fila);
  if (!row) return { error: "Ticket no encontrado" };
  if (row.borrado_at) return { error: "Ese ticket ya está eliminado" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const patch = patchDe(campos);
  if (!Object.keys(patch).length) return { error: "Nada que guardar" };
  const antes = vistaDe(row);
  let saved: Row | null = null;
  try {
    saved = await ctx.db.write(actorOf(ses), "tickets", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
  if (!saved) return { error: "No se pudo guardar el ticket" };
  await anotar(ctx, ses, "tickets", filaDe(row), "UPDATE", antes, vistaDe(saved));
  return { ok: true, fila: filaDe(row) };
}

export async function borrarTicketSuave(ctx: Ctx, ses: Ses, row: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  if (row.borrado_at) return { ok: true };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const antes = vistaDe(row);
  const patch = { borrado_at: ctx.now.toISOString(), borrado_por: actorOf(ses) };
  let saved: Row | null = null;
  try {
    saved = await ctx.db.write(actorOf(ses), "tickets", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/update vacio|column/i.test(msg)) return { error: "Aplica 0022_inline_solicitudes.sql para el borrado con historial" };
    return { error: msg || "No se pudo eliminar" };
  }
  if (!saved || !saved.borrado_at) return { error: "Aplica 0022_inline_solicitudes.sql para el borrado con historial" };
  await anotar(ctx, ses, "tickets", filaDe(row), "UPDATE", antes, { ...antes, borrado: true });
  return { ok: true };
}

async function veTicket(ctx: Ctx, ses: Ses, row: Row): Promise<boolean> {
  const nivel = acceso(ses.rol, "tickets", await matrizDe(ctx.db));
  if (nivel === "no") return false;
  if (nivel === "todos" || esAdmin(ses.rol)) return true;
  return esPropio(s(row.atendido_por), ses);
}

async function avisarAdmins(ctx: Ctx, ses: Ses, texto: string) {
  const admins = (await ctx.db.all("usuarios")).filter((u) => esAdmin(s(u.rol))).map((u) => s(u.nombre));
  try { await pushAPersonas(ctx, ses, admins, texto, "solicitud"); } catch { /* la lista sigue */ }
}

extend("inline_guardar", "any", async (p, ctx, ses) => {
  if (s(p.tabla) !== "tickets") return { error: "Esa tabla todavía no se edita en línea" };
  return guardarTicketCampos(ctx, ses, s(p.fila), (p.campos && typeof p.campos === "object" ? p.campos : {}) as Row);
});

extend("inline_borrar", "any", async (p, ctx, ses) => {
  if (s(p.tabla) !== "tickets") return { error: "Esa tabla todavía no se edita en línea" };
  const row = await ticketDe(ctx, s(p.fila));
  if (!row) return { error: "Ticket no encontrado" };
  return borrarTicketSuave(ctx, ses, row);
});

extend("solicitud_crear", "any", async (p, ctx, ses) => {
  if (esAdmin(ses.rol)) return { error: "Un admin guarda el cambio directo" };
  const tabla = s(p.tabla);
  const fila = s(p.fila);
  const tipo = s(p.tipo);
  const motivo = s(p.motivo).trim();
  if (tabla !== "tickets") return { error: "Esa tabla todavía no recibe solicitudes" };
  if (tipo !== "cambio" && tipo !== "eliminacion") return { error: "Elige cambio o eliminación" };
  if (!motivo) return { error: "El motivo es obligatorio" };
  const row = await ticketDe(ctx, fila);
  if (!row || row.borrado_at) return { error: "Ticket no encontrado" };
  if (!(await veTicket(ctx, ses, row))) return { error: "No tienes permiso para pedir un cambio de ese ticket" };
  const id = crypto.randomUUID();
  const propuestos = tipo === "cambio" && p.propuestos && typeof p.propuestos === "object" ? p.propuestos as Row : {};
  const rec = {
    id, solicitante: ses.name, solicitante_uid: ses.uid, creado: ctx.now.toISOString(),
    tabla, fila, tipo, propuestos, antes: vistaDe(row), motivo, estado: "pendiente",
  };
  await ctx.db.write(actorOf(ses), "solicitudes_cambio", "insert", {}, rec);
  await anotar(ctx, ses, "solicitudes_cambio", id, "INSERT", null, rec);
  await avisarAdmins(ctx, ses, ses.name + " pidió " + (tipo === "eliminacion" ? "eliminar" : "un cambio en") + " un ticket");
  return { ok: true, id };
});

extend("getSolicitudes", "any", async (_p, ctx, ses) => {
  let rows: Row[] = [];
  try { rows = await ctx.db.all("solicitudes_cambio"); } catch { rows = []; }
  const admin = esAdmin(ses.rol);
  const items = rows
    .filter((r) => admin || s(r.solicitante_uid) === ses.uid || normNombre(s(r.solicitante)) === normNombre(ses.name))
    .sort((a, b) => s(b.creado).localeCompare(s(a.creado)));
  return { ok: true, items, pendientes: items.filter((r) => s(r.estado) === "pendiente").length };
});

extend("solicitud_resolver", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin resuelve solicitudes" };
  const rows = await ctx.db.all("solicitudes_cambio").catch(() => [] as Row[]);
  const row = rows.find((r) => s(r.id) === s(p.id));
  if (!row) return { error: "Solicitud no encontrada" };
  if (s(row.estado) !== "pendiente") return { error: "Esa solicitud ya está cerrada" };
  const aprobar = p.aprobar === true || s(p.aprobar) === "true" || s(p.aprobar) === "aprobar";
  if (aprobar) {
    if (s(row.tipo) === "eliminacion") {
      const ticket = await ticketDe(ctx, s(row.fila));
      if (!ticket) return { error: "Ticket no encontrado" };
      const hecho = await borrarTicketSuave(ctx, ses, ticket);
      if (hecho.error) return hecho;
    } else {
      const hecho = await guardarTicketCampos(ctx, ses, s(row.fila), (row.propuestos && typeof row.propuestos === "object" ? row.propuestos : {}) as Row);
      if (hecho.error) return hecho;
    }
  }
  const patch = {
    estado: aprobar ? "aprobado" : "rechazado",
    resuelto_por: ses.name,
    resuelto_at: ctx.now.toISOString(),
    comentario: s(p.comentario),
  };
  await ctx.db.write(actorOf(ses), "solicitudes_cambio", "update", { id: row.id }, patch);
  await anotar(ctx, ses, "solicitudes_cambio", s(row.id), "UPDATE", { estado: "pendiente" }, patch);
  return { ok: true, estado: patch.estado };
});
