// Dashboard del personal (no admin): saludo + citas de hoy de su calendario.
// Sin precios, teléfonos, correos ni dirección/sector. Ver como usa la sesión de la persona vista.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { esAdmin, acceso, matrizDe } from "./permisos.ts";
import { n, normNombre, s, ymdUtc, type Row } from "./domain.ts";
import { citasRango, fechaCita } from "./acuity.ts";
import { fichaDeCita, misCalendarios } from "./agenda_api.ts";
import { claveRegistro } from "./ventas.ts";
import { claveDe } from "./ticket_beta.ts";
import { leerSerie } from "./series.ts";
import { itemBorradorHome, listarBorradoresVisibles } from "./borradores_asig.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const hoyEc = (ctx: Ctx) => new Date(ctx.now.getTime() - 5 * 3600000).toISOString().slice(0, 10);

function etiquetaDe(a: Row): string {
  const L = Array.isArray(a.labels) ? a.labels as Row[] : [];
  return L.length ? s(L[0].name) : "";
}

function servicioTicket(t: Row): string {
  return s(t.facial_hecho) || s(t.notas_generales) || s(t.notas) || "";
}

function limpio(v: unknown): boolean {
  const j = JSON.stringify(v || {});
  return !/telefono|celular|whatsapp|"email"|correo|direccion|sector|precio|estimado|costo|margen/i.test(j);
}

extend("staff_home", "any", async (_p, ctx, ses) => {
  const hoy = hoyEc(ctx);
  const nombre = s(ses.short) || s(ses.name).split(" ")[0] || "";
  const admin = esAdmin(ses.rol);
  const nivAgenda = admin ? "todos" : acceso(ses.rol, "agenda", await matrizDe(ctx.db));

  const beta = await todas(ctx, "beta_acuity_calendars");
  const cals = beta.map((b) => ({ id: Number(b.calendar_id), nombre: s(b.nombre), persona: s(b.persona) }));
  const mios = misCalendarios(cals, ses);
  const verTodos = nivAgenda === "todos";

  const borHome = (await listarBorradoresVisibles(ctx, ses)).map(itemBorradorHome);
  if (nivAgenda === "no") {
    const early = { ok: true, hoy, nombre, citas: [], aviso: "", borradores: borHome };
    if (!limpio(early)) return { error: "Respuesta de staff_home con datos que el personal no debe ver" };
    return early;
  }
  if (!verTodos && !mios.length) {
    const early = { ok: true, hoy, nombre, citas: [], aviso: "No tienes un calendario de Acuity asignado. Pide a un admin que lo enlace en Agenda → Calendarios.", borradores: borHome };
    if (!limpio(early)) return { error: "Respuesta de staff_home con datos que el personal no debe ver" };
    return early;
  }

  const L = await citasRango(ctx, hoy, hoy, {});
  if (!Array.isArray(L)) return { error: L.error, hoy, nombre, citas: [] };

  const vis = L.filter((a) => a.canceled !== true && (verTodos || mios.includes(Number(a.calendarID))));
  const links = await todas(ctx, "beta_citas_ticket");
  const tks = await todas(ctx, "tickets");
  const regs = (await todas(ctx, "clientas_registro")).filter((x) => !x.borrado_at);

  const citas = vis.map((a) => {
    const f = fechaCita(a);
    const ln = links.find((x) => s(x.appointment_id) === s(a.id));
    const tkHoy = ln ? null : tks.find((t) => !t.borrado_at && ymdUtc(t.timestamp) === f && normNombre(s(t.nombre)) === normNombre(s(a.firstName)) && normNombre(s(t.apellido)).split(" ")[0] === normNombre(s(a.lastName)).split(" ")[0]);
    const ticket = ln ? s(ln.ticket_clave) : tkHoy ? claveDe(tkHoy, leerSerie(tkHoy, "so_num")) : "";
    const et = etiquetaDe(a);
    const nueva = /PRIMERA/i.test(s(a.type));
    const ficha = fichaDeCita(regs, s(a.firstName), s(a.lastName));
    let anterior: Row | null = null;
    if (!nueva) {
      const clienteNom = normNombre(s(a.firstName)), clienteAp = normNombre(s(a.lastName)).split(" ")[0];
      const previas = tks.filter((t) => {
        if (t.borrado_at) return false;
        const fecha = ymdUtc(t.timestamp);
        if (!fecha || fecha >= hoy) return false;
        return normNombre(s(t.nombre)) === clienteNom && normNombre(s(t.apellido)).split(" ")[0] === clienteAp;
      }).sort((x, y) => s(y.timestamp).localeCompare(s(x.timestamp)));
      const u = previas[0];
      if (u) anterior = { fecha: ymdUtc(u.timestamp), servicio: servicioTicket(u) || "Visita anterior" };
    }
    const out: Row = {
      id: a.id,
      datetime: s(a.datetime),
      fecha: f,
      duracion: n(a.duration),
      nombre: s(a.firstName),
      apellido: s(a.lastName),
      tipo: s(a.type),
      etiqueta: et,
      nueva,
      calendarID: a.calendarID,
      calendario: s(a.calendar),
      ticket,
      atendida: !!ln || !!tkHoy || /COMPLETADO|INGRESADO/i.test(et),
      anterior,
      clienteKey: ficha ? claveRegistro(ficha) : "",
      cedula: ficha ? s(ficha.cedula) : "",
    };
    return out;
  }).sort((x, y) => s(x.datetime).localeCompare(s(y.datetime)));

  const payload = { ok: true, hoy, nombre, citas, puede: { ticket: true, noLlego: true, mover: verTodos }, borradores: borHome };
  if (!limpio(payload)) return { error: "Respuesta de staff_home con datos que el personal no debe ver" };
  return payload;
});
