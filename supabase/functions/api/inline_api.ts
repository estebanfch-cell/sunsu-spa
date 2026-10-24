// Edición en línea y solicitudes de cambio. El admin guarda por el mismo camino
// auditado; el resto pide un cambio y un admin lo aprueba o lo rechaza.

import { extend, crearTicket } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion, nextSheet } from "./lib.ts";
import { acceso, esAdmin, esPropio, matrizDe, puedeVerContacto } from "./permisos.ts";
import { ecuadorParts, n, normCedula, normNombre, s, ymdUtc, type Row } from "./domain.ts";
import { pushAPersonas } from "./horarios_api.ts";
import { claveCliente, claveRegistro } from "./ventas.ts";

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

const CAMPOS_CLIENTE: Record<string, string> = {
  nombre: "nombre",
  apellido: "apellido",
  cedula: "cedula",
  telefono: "telefono",
  sector: "sector_donde_vive",
  tipoPiel: "tipo_de_piel",
  estado: "estado_actual",
  alergias: "alergias",
  medicacion: "medicacion",
  condiciones: "condiciones_medicas_o_dermatologicas_que_debamos_saber",
  nacimiento: "fecha_de_nacimiento",
  autorizaFotos: "autoriza_fotos",
};

function patchCliente(campos: Row, ses: Ses): Row {
  const patch: Row = {};
  for (const [k, col] of Object.entries(CAMPOS_CLIENTE)) {
    if (campos[k] == null) continue;
    if (k === "telefono" && !puedeVerContacto(ses.rol)) continue;
    patch[col] = s(campos[k]);
  }
  return patch;
}

function vistaCliente(row: Row): Row {
  const out: Row = {};
  for (const [k, col] of Object.entries(CAMPOS_CLIENTE)) out[k] = k === "nacimiento" ? ymdUtc(row[col]) : (row[col] ?? "");
  return out;
}

async function fichas(ctx: Ctx): Promise<Row[]> {
  try { return await ctx.db.all("clientas_registro"); } catch { return []; }
}

function filaCliente(row: Row): string {
  return s(row.sheet_row) || s(row.id);
}

async function clientaViva(ctx: Ctx, fila: string): Promise<Row | null> {
  const rows = await fichas(ctx);
  if (fila.startsWith("k:")) {
    const key = fila.slice(2);
    return rows.find((r) => !r.borrado_at && claveRegistro(r) === key) || null;
  }
  return rows.find((r) => !r.borrado_at && (s(r.sheet_row) === fila || s(r.id) === fila)) || null;
}

async function clientaPorCedula(ctx: Ctx, cedula: string): Promise<Row | null> {
  const ced = normCedula(cedula);
  if (!ced) return null;
  return (await fichas(ctx)).find((r) => !r.borrado_at && normCedula(r.cedula) === ced) || null;
}

export async function guardarClienteCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  const patch = patchCliente(campos, ses);
  let row: Row | null = null;
  if (!fila || fila === "nuevo") row = await clientaPorCedula(ctx, s(patch.cedula));
  else if (fila.startsWith("k:")) {
    row = await clientaViva(ctx, fila);
    const key = fila.slice(2);
    if (!row && key.startsWith("c:") && !s(patch.cedula)) patch.cedula = key.slice(2);
    if (!row && key.startsWith("n:") && !s(patch.nombre)) patch.nombre = key.slice(2);
  } else {
    row = await clientaViva(ctx, fila);
    if (!row) return { error: "Clienta no encontrada" };
  }
  if (!row) {
    if (!s(patch.nombre) && !normCedula(patch.cedula)) return { error: "Escribe el nombre o la cédula" };
    const sheet_row = await nextSheet(ctx.db, "clientas_registro");
    const ec = ecuadorParts(ctx.now);
    const rec: Row = {
      sheet_row, timestamp: ec.isoWall, ...patch,
      orig: { nombre: s(patch.nombre), cedula: s(patch.cedula) },
    };
    let saved: Row | null = null;
    try { saved = await ctx.db.write(actorOf(ses), "clientas_registro", "insert", {}, rec); }
    catch (e) { return { error: e instanceof Error ? e.message : "No se pudo guardar" }; }
    if (!saved) return { error: "No se pudo guardar la clienta" };
    await anotar(ctx, ses, "clientas_registro", filaCliente(saved), "INSERT", null, vistaCliente(saved));
    return { ok: true, fila: filaCliente(saved) };
  }
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  if (!Object.keys(patch).length) return { error: "Nada que guardar" };
  const antes = vistaCliente(row);
  let saved: Row | null = null;
  try {
    saved = await ctx.db.write(actorOf(ses), "clientas_registro", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
  if (!saved) return { error: "No se pudo guardar la clienta" };
  await anotar(ctx, ses, "clientas_registro", filaCliente(row), "UPDATE", antes, vistaCliente(saved));
  return { ok: true, fila: filaCliente(row) };
}

export async function borrarClienteSuave(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const row = await clientaViva(ctx, fila);
  if (!row && fila.startsWith("k:")) {
    const key = fila.slice(2);
    const sheet_row = await nextSheet(ctx.db, "clientas_registro");
    const ec = ecuadorParts(ctx.now);
    const rec: Row = {
      sheet_row, timestamp: ec.isoWall,
      cedula: key.startsWith("c:") ? key.slice(2) : "",
      nombre: key.startsWith("n:") ? key.slice(2) : "",
      borrado_at: ctx.now.toISOString(), borrado_por: actorOf(ses),
      orig: { oculto: key },
    };
    try { await ctx.db.write(actorOf(ses), "clientas_registro", "insert", {}, rec); }
    catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/column|update vacio|insert vacio/i.test(msg)) return { error: "Aplica 0023_clientes_inline.sql para el borrado con historial" };
      return { error: msg || "No se pudo eliminar" };
    }
    await anotar(ctx, ses, "clientas_registro", String(sheet_row), "INSERT", null, { borrado: true });
    return { ok: true };
  }
  if (!row) return { error: "Clienta no encontrada" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const antes = vistaCliente(row);
  const patch = { borrado_at: ctx.now.toISOString(), borrado_por: actorOf(ses) };
  let saved: Row | null = null;
  try {
    saved = await ctx.db.write(actorOf(ses), "clientas_registro", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/update vacio|column/i.test(msg)) return { error: "Aplica 0023_clientes_inline.sql para el borrado con historial" };
    return { error: msg || "No se pudo eliminar" };
  }
  if (!saved || !saved.borrado_at) return { error: "Aplica 0023_clientes_inline.sql para el borrado con historial" };
  await anotar(ctx, ses, "clientas_registro", filaCliente(row), "UPDATE", antes, { ...antes, borrado: true });
  return { ok: true };
}

async function veCliente(ctx: Ctx, ses: Ses, row: Row): Promise<boolean> {
  const nivel = acceso(ses.rol, "clientes", await matrizDe(ctx.db));
  if (nivel === "no") return false;
  if (nivel === "todos" || esAdmin(ses.rol)) return true;
  const key = claveRegistro(row);
  const tickets = await ctx.db.all("tickets");
  return tickets.some((t) => !t.borrado_at && claveCliente(t) === key && esPropio(s(t.atendido_por), ses));
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
  const campos = (p.campos && typeof p.campos === "object" ? p.campos : {}) as Row;
  if (s(p.tabla) === "tickets") return guardarTicketCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "clientes") return guardarClienteCampos(ctx, ses, s(p.fila), campos);
  return { error: "Esa tabla todavía no se edita en línea" };
});

extend("inline_borrar", "any", async (p, ctx, ses) => {
  if (s(p.tabla) === "clientes") return borrarClienteSuave(ctx, ses, s(p.fila));
  if (s(p.tabla) !== "tickets") return { error: "Esa tabla todavía no se edita en línea" };
  const row = await ticketDe(ctx, s(p.fila));
  if (!row) return { error: "Ticket no encontrado" };
  return borrarTicketSuave(ctx, ses, row);
});

async function filaSolicitud(ctx: Ctx, ses: Ses, tabla: string, fila: string): Promise<{ row: Row; antes: Row } | { error: string }> {
  if (tabla === "tickets") {
    const row = await ticketDe(ctx, fila);
    if (!row || row.borrado_at) return { error: "Ticket no encontrado" };
    if (!(await veTicket(ctx, ses, row))) return { error: "No tienes permiso para pedir un cambio de ese ticket" };
    return { row, antes: vistaDe(row) };
  }
  if (tabla === "clientes") {
    const viva = await clientaViva(ctx, fila);
    const key = fila.startsWith("k:") ? fila.slice(2) : "";
    const row = viva || (key.startsWith("c:") ? { cedula: key.slice(2) } : key.startsWith("n:") ? { nombre: key.slice(2) } : null);
    if (!row) return { error: "Clienta no encontrada" };
    if (!(await veCliente(ctx, ses, row))) return { error: "No tienes permiso para pedir un cambio de esa clienta" };
    return { row, antes: vistaCliente(row) };
  }
  return { error: "Esa tabla todavía no recibe solicitudes" };
}

extend("solicitud_crear", "any", async (p, ctx, ses) => {
  if (esAdmin(ses.rol)) return { error: "Un admin guarda el cambio directo" };
  const tabla = s(p.tabla);
  const fila = s(p.fila);
  const tipo = s(p.tipo);
  const motivo = s(p.motivo).trim();
  if (tipo !== "cambio" && tipo !== "eliminacion") return { error: "Elige cambio o eliminación" };
  if (!motivo) return { error: "El motivo es obligatorio" };
  const hecho = await filaSolicitud(ctx, ses, tabla, fila);
  if ("error" in hecho) return hecho;
  const id = crypto.randomUUID();
  const propuestos = tipo === "cambio" && p.propuestos && typeof p.propuestos === "object" ? p.propuestos as Row : {};
  const rec = {
    id, solicitante: ses.name, solicitante_uid: ses.uid, creado: ctx.now.toISOString(),
    tabla, fila, tipo, propuestos, antes: hecho.antes, motivo, estado: "pendiente",
  };
  await ctx.db.write(actorOf(ses), "solicitudes_cambio", "insert", {}, rec);
  await anotar(ctx, ses, "solicitudes_cambio", id, "INSERT", null, rec);
  const cosa = tabla === "clientes" ? "una clienta" : "un ticket";
  await avisarAdmins(ctx, ses, ses.name + " pidió " + (tipo === "eliminacion" ? "eliminar" : "un cambio en") + " " + cosa);
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
    const propuestos = (row.propuestos && typeof row.propuestos === "object" ? row.propuestos : {}) as Row;
    const hecho = s(row.tabla) === "clientes"
      ? (s(row.tipo) === "eliminacion" ? await borrarClienteSuave(ctx, ses, s(row.fila)) : await guardarClienteCampos(ctx, ses, s(row.fila), propuestos))
      : (s(row.tipo) === "eliminacion"
        ? await (async () => {
          const ticket = await ticketDe(ctx, s(row.fila));
          if (!ticket) return { error: "Ticket no encontrado" };
          return borrarTicketSuave(ctx, ses, ticket);
        })()
        : await guardarTicketCampos(ctx, ses, s(row.fila), propuestos));
    if (hecho.error) return hecho;
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
