// Asignación de borradores Migo «Pendiente de aprobar» a la cosmetóloga
// (cita del mismo día en Agenda/Acuity, o ya asignado en el borrador).
// No escribe en Migo; solo lee citas y actualiza beta_migo_borradores.
import { esAdmin, esPropio } from "./permisos.ts";
import { n, s, type Row } from "./domain.ts";
import { actorOf, logAccion, type Ctx, type Ses } from "./lib.ts";
import { citaDeNombre, citasRango, fechaCita } from "./acuity.ts";
import { borradorSePuedeVincular, splitCliente } from "./migo_cuadre.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }

export function esRecepcion(rol: string): boolean {
  const r = (rol || "").trim().toLowerCase();
  return r === "recepcion" || r === "reception";
}

export function puedeGestionarBorradores(ses: { rol: string }): boolean {
  return esAdmin(ses.rol) || esRecepcion(ses.rol);
}

export function puedeVerBorrador(ses: Ses, b0: Row): boolean {
  if (puedeGestionarBorradores(ses)) return true;
  const a = s(b0.asignado_a);
  if (!a) return false;
  const yo = ses.name;
  const short = s(ses.short);
  return esPropio(a, ses) || a.toLowerCase() === yo.toLowerCase() ||
    (!!short && (a.toLowerCase() === short.toLowerCase() || a.toLowerCase().startsWith(short.toLowerCase() + " ")));
}

export function listoBorrador(b0: Row): boolean {
  const d = (b0.datos && typeof b0.datos === "object" ? b0.datos : {}) as Row;
  return !!(d.completado_at || d.listo_at);
}

export function abiertoSinTicket(b0: Row): boolean {
  if (!borradorSePuedeVincular(b0.estado)) return false;
  return !s(b0.ticket_clave) && !n(b0.ticket_id);
}

function cosmYaEnBorrador(b0: Row): string {
  const d = (b0.datos && typeof b0.datos === "object" ? b0.datos : {}) as Row;
  return s(b0.asignado_a) || s(d.cosmetologa) || s(d.atendio) || s(d.atendido_por);
}

export async function cosmDeCita(ctx: Ctx, cliente: string, fecha: string): Promise<{ persona: string; appointment_id: string } | null> {
  const parts = splitCliente(cliente);
  if (!parts.nombre) return null;
  let citas: Row[] | { error: string };
  try { citas = await citasRango(ctx, fecha, fecha, { ms: 120000 }); }
  catch { return null; }
  if (!Array.isArray(citas) || !citas.length) return null;
  const delDia = citas.filter((a) => a.canceled !== true && fechaCita(a) === fecha);
  const hit = citaDeNombre(delDia, parts.nombre, parts.apellido)
    || citaDeNombre(citas.filter((a) => a.canceled !== true), parts.nombre, parts.apellido);
  if (!hit) return null;
  const cals = await todas(ctx, "beta_acuity_calendars");
  const cal = cals.find((c) => String(c.calendar_id) === String(hit.calendarID) && c.activo !== false);
  const persona = s(cal?.persona) || s(hit.calendar) || s(hit.calendarName);
  if (!persona) return null;
  return { persona, appointment_id: s(hit.id) };
}

async function logAsig(ctx: Ctx, actor: string, factura: string, fuente: string, persona: string): Promise<void> {
  try { await logAccion(ctx.db, actor, "MIGO BORRADOR ASIGNAR", factura + " · " + fuente + " · " + persona); } catch { /* */ }
}

export async function asignarBorradoresAbiertos(ctx: Ctx, actor: string): Promise<{ asignados: number; sin_asignar: number; ya: number }> {
  const rows = await todas(ctx, "beta_migo_borradores");
  const abiertos = rows.filter(abiertoSinTicket);
  let asignados = 0, ya = 0;
  const now = ctx.now.toISOString();
  for (const b0 of abiertos) {
    const tenia = s(b0.asignado_a);
    let persona = cosmYaEnBorrador(b0);
    let fuente = tenia || persona ? "ya_asignado" : "";
    let aptId = s(b0.acuity_appointment_id);
    if (!persona) {
      const cita = await cosmDeCita(ctx, s(b0.cliente), s(b0.fecha).slice(0, 10));
      if (cita) { persona = cita.persona; fuente = "agenda"; aptId = cita.appointment_id; }
    }
    if (!persona) continue;
    if (s(b0.estado) === "asignado" && tenia && tenia === persona) { ya++; continue; }
    await ctx.db.write(actor, "beta_migo_borradores", "update", { factura: b0.factura }, {
      estado: "asignado",
      asignado_a: persona,
      asignado_por: s(b0.asignado_por) || (fuente === "agenda" ? "acuity" : "backfill-ya-asignado"),
      assigned_at: b0.assigned_at || now,
      acuity_appointment_id: aptId || null,
      updated_at: now,
    });
    await logAsig(ctx, actor, s(b0.factura), fuente, persona);
    asignados++;
  }
  const despues = (await todas(ctx, "beta_migo_borradores")).filter(abiertoSinTicket);
  const sin = despues.filter((b) => !s(b.asignado_a)).length;
  ya = despues.filter((b) => s(b.asignado_a) && s(b.estado) === "asignado").length;
  return { asignados, sin_asignar: sin, ya };
}

export function partesCliente(b0: Row): { nombre: string; apellido: string } {
  const d = (b0.datos && typeof b0.datos === "object" ? b0.datos : {}) as Row;
  if (s(d.nombre) || s(d.apellido)) return { nombre: s(d.nombre), apellido: s(d.apellido) };
  return splitCliente(s(b0.cliente));
}

export function itemBorradorHistorial(b0: Row): Row {
  const p = partesCliente(b0);
  const listo = listoBorrador(b0);
  const fac = s(b0.factura);
  const tot = n(b0.total);
  return {
    fecha: s(b0.fecha).slice(0, 10), hora: "", tkRow: null, so_num: "",
    cosmetologa: s(b0.asignado_a) || "",
    cedula: "", telefono: "",
    nombre: p.nombre, apellido: p.apellido,
    estimado: tot, factura: fac, fac: true, cob: true, anulado: false,
    estado_doc: "abierto", saldo: 0, sheetId: null,
    borrador: true, por_completar: !listo, listo,
    factura_migo: fac,
    led: { factura: fac, porCompletar: listo ? 0 : 1, pendienteAprobar: 1 },
  };
}

export function itemBorradorLista(b0: Row): Row {
  const p = partesCliente(b0);
  const listo = listoBorrador(b0);
  const fac = s(b0.factura);
  const tot = n(b0.total);
  return {
    clave: "borrador:" + fac, so_num: "", beta_num: "", sheet_row: null,
    fecha: s(b0.fecha).slice(0, 10), hora: "",
    cosmetologa: s(b0.asignado_a) || "",
    cedula: "", nombre: p.nombre, apellido: p.apellido,
    estimado: tot, total: tot, subtotal: tot, iva: 0,
    estado: "abierto", factura: fac, saldo: 0,
    borrador: true, por_completar: !listo, listo, factura_migo: fac,
  };
}

/** Para el home del personal: sin totales, cédulas, teléfonos ni correos. */
export function itemBorradorHome(b0: Row): Row {
  const p = partesCliente(b0);
  const listo = listoBorrador(b0);
  return {
    factura: s(b0.factura),
    fecha: s(b0.fecha).slice(0, 10),
    nombre: p.nombre,
    apellido: p.apellido,
    por_completar: !listo,
    listo,
  };
}

export async function listarBorradoresVisibles(ctx: Ctx, ses: Ses): Promise<Row[]> {
  const rows = await todas(ctx, "beta_migo_borradores");
  return rows.filter((b0) => abiertoSinTicket(b0) && puedeVerBorrador(ses, b0));
}

export async function completarBorradorStaff(ctx: Ctx, ses: Ses, p: Row): Promise<Row> {
  const { facturaNorm } = await import("./migo_cuadre.ts");
  const fac = facturaNorm(p.vincular_borrador || p.factura);
  const b0 = (await todas(ctx, "beta_migo_borradores")).find((x) => s(x.factura) === fac);
  if (!b0) return { error: "No encontré ese borrador" };
  if (!abiertoSinTicket(b0)) return { error: "Ese borrador ya no se completa" };
  if (!puedeVerBorrador(ses, b0)) return { error: "No tienes permiso" };
  const actor = actorOf(ses);
  const now = ctx.now.toISOString();
  const prev = (b0.datos && typeof b0.datos === "object" ? b0.datos : {}) as Row;
  const datos: Row = {
    ...prev,
    nombre: s(p.nombre) || prev.nombre,
    apellido: s(p.apellido) || prev.apellido,
    cosmetologa: s(p.cosmetologa) || prev.cosmetologa || s(b0.asignado_a),
    notas: s(p.notas) || prev.notas,
    recomendaciones: s(p.recomendaciones) || prev.recomendaciones,
    facial: s(p.facial) || prev.facial,
    extras: s(p.extras) || prev.extras,
    retorno: s(p.fechaRetorno) || prev.retorno,
    productos: p.productos != null ? p.productos : prev.productos,
    pack3: s(p.pack3) || prev.pack3,
    pack6: s(p.pack6) || prev.pack6,
    completado_por: actor,
    completado_at: now,
  };
  const patch: Row = { datos, updated_at: now };
  if (Array.isArray(p.lineas)) patch.lineas = p.lineas;
  if (!s(b0.asignado_a) && s(datos.cosmetologa)) {
    patch.estado = "asignado";
    patch.asignado_a = s(datos.cosmetologa);
    patch.asignado_por = actor;
    patch.assigned_at = now;
  }
  await ctx.db.write(actor, "beta_migo_borradores", "update", { factura: fac }, patch);
  try { await logAccion(ctx.db, actor, "MIGO BORRADOR", "completó " + fac + " · queda pendiente de aprobar"); } catch { /* */ }
  return { ok: true, pendiente_aprobar: true, factura: fac, mensaje: "Quedó pendiente de aprobar. Una administradora lo revisa." };
}
