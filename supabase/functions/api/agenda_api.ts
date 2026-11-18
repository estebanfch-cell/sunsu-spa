// Agenda de la beta (Acuity). Acuity sigue siendo la fuente del calendario: todo pasa por la edge «api»
// con ACUITY_UID / ACUITY_KEY. Cosmetóloga: solo su calendario (ver, ficha, crear ticket, «No llegó»).
// Admin / recepción / gerencia (acceso «todos» al módulo agenda): todo el calendario, agendar, mover, cancelar.
// Acuity no tiene borrado definitivo de citas en su API: solo cancelar (queda el registro y se libera el horario).
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, conTelefono } from "./lib.ts";
import { acceso, esAdmin, esPropio, matrizDe } from "./permisos.ts";
import { esCanje, telefonoEc, n, normCedula, normNombre, s, ymdUtc, type Row } from "./domain.ts";
import { acuityCache, acuityReq, citaDeNombre, citasRango, fechaCita, limpiarCacheAcuity, nombreCita } from "./acuity.ts";
import { contactoDeAcuity } from "./clientes_contacto.ts";
import { rellenarContactosDeFuentes } from "./clientes_contacto_api.ts";
import { claveRegistro } from "./ventas.ts";
import { leerSerie } from "./series.ts";
import { claveDe } from "./ticket_beta.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const hoyEc = (ctx: Ctx) => new Date(ctx.now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
const addD = (ymd: string, d: number) => { const t = new Date(ymd + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const YMD = /^\d{4}-\d{2}-\d{2}$/;

async function nivel(ctx: Ctx, ses: Ses): Promise<"todos" | "propio" | "no"> {
  if (esAdmin(ses.rol)) return "todos";
  return acceso(ses.rol, "agenda", await matrizDe(ctx.db)) as "todos" | "propio" | "no";
}
async function calendarios(ctx: Ctx): Promise<Row[]> {
  const beta = await todas(ctx, "beta_acuity_calendars");
  const ac = await acuityCache<Row[]>(ctx, "calendars", 10 * 60000);
  const lista = Array.isArray(ac) ? ac : [];
  const ids = new Set([...beta.map((b) => s(b.calendar_id)), ...lista.map((c) => s(c.id))]);
  return [...ids].map((id) => {
    const b = beta.find((x) => s(x.calendar_id) === id), c = lista.find((x) => s(x.id) === id);
    return { id: Number(id), nombre: s(b?.nombre) || s(c?.name), persona: s(b?.persona), cosmetologaId: s(b?.cosmetologa_id), activo: b ? b.activo !== false : true, enAcuity: !!c };
  }).sort((a, b) => Number(b.activo) - Number(a.activo) || s(a.nombre).localeCompare(s(b.nombre)));
}
/** Calendarios de la persona: el de su nombre (persona) o el que se llama como su primer nombre. */
export function misCalendarios(cals: Row[], ses: { name?: string; short?: string; uid?: string; rol?: string }): number[] {
  const pn = normNombre(s(ses.short) || s(ses.name)).split(" ")[0];
  return cals.filter((c) => (s(c.persona) && esPropio(s(c.persona), ses as Ses)) || (!!pn && normNombre(s(c.nombre)).split(" ")[0] === pn)).map((c) => Number(c.id));
}
function etiquetaDe(a: Row): string { const L = Array.isArray(a.labels) ? a.labels as Row[] : []; return L.length ? s(L[0].name) : ""; }
function vistaCita(a: Row, extra: Row = {}): Row {
  return {
    id: a.id, datetime: s(a.datetime), fecha: fechaCita(a), hora: s(a.time), fin: s(a.endTime), duracion: n(a.duration), calendarID: a.calendarID, calendario: s(a.calendar),
    tipo: s(a.type), tipoID: a.appointmentTypeID, nueva: /PRIMERA/i.test(s(a.type)), etiqueta: etiquetaDe(a), notas: s(a.notes), addonIDs: a.addonIDs || [],
    nombre: s(a.firstName), apellido: s(a.lastName), cancelada: a.canceled === true, ...extra,
  };
}
async function contexto(ctx: Ctx, ses: Ses) {
  const niv = await nivel(ctx, ses);
  if (niv === "no") return { error: "No tienes acceso a la Agenda" } as const;
  const cals = await calendarios(ctx);
  const mios = misCalendarios(cals, ses);
  return { niv, cals, mios } as const;
}
function puedeCal(c: { niv: string; mios: number[] }, calID: unknown): boolean { return c.niv === "todos" || c.mios.includes(Number(calID)); }

extend("ag_meta", "any", async (_p, ctx, ses) => {
  const c = await contexto(ctx, ses);
  if ("error" in c) return c;
  const [tipos, labels, addons] = await Promise.all([acuityCache<Row[]>(ctx, "appointment-types", 10 * 60000), acuityCache<Row[]>(ctx, "labels", 10 * 60000), acuityCache<Row[]>(ctx, "appointment-addons", 10 * 60000)]);
  if (!Array.isArray(labels)) return { error: (labels as Row).error };
  return {
    ok: true, nivel: c.niv, admin: esAdmin(ses.rol), misCalendarios: c.mios, hoy: hoyEc(ctx),
    calendarios: c.niv === "todos" ? c.cals : c.cals.filter((x) => c.mios.includes(Number(x.id))),
    tipos: (Array.isArray(tipos) ? tipos : []).filter((t) => t.active !== false).map((t) => ({ id: t.id, nombre: s(t.name), duracion: n(t.duration), precio: s(t.price), calendarIDs: t.calendarIDs || [], nueva: /PRIMERA/i.test(s(t.name)) })),
    etiquetas: labels.map((l) => ({ id: l.id, nombre: s(l.name), color: s(l.color) })),
    addons: (Array.isArray(addons) ? addons : []).map((x) => ({ id: x.id, nombre: s(x.name), precio: s(x.price), duracion: n(x.duration) })),
    puede: { agendar: c.niv === "todos", mover: c.niv === "todos", cancelar: c.niv === "todos", noLlego: true, ticket: true, eliminar: false, editarCalendarios: esAdmin(ses.rol) },
    nota: "Acuity no permite borrar citas por su API: solo cancelarlas (queda el registro y se libera el horario).",
  };
});

extend("ag_citas", "any", async (p, ctx, ses) => {
  const c = await contexto(ctx, ses);
  if ("error" in c) return c;
  const desde = YMD.test(s(p.desde)) ? s(p.desde) : hoyEc(ctx), hasta = YMD.test(s(p.hasta)) ? s(p.hasta) : desde;
  if (hasta < desde) return { error: "Rango inválido" };
  if (addD(desde, 62) < hasta) return { error: "Máximo 2 meses por consulta" };
  let cal = s(p.calendarID);
  if (c.niv !== "todos") { if (!c.mios.length) return { ok: true, citas: [], porDia: {}, aviso: "No tienes un calendario de Acuity asignado. Pide a un admin que lo enlace en Agenda → Calendarios." }; if (cal && !c.mios.includes(Number(cal))) cal = ""; }
  const L = await citasRango(ctx, desde, hasta, { calendarID: cal || undefined });
  if (!Array.isArray(L)) return { error: L.error };
  try {
    const extras = L.map((a) => contactoDeAcuity(a as Row)).filter((x): x is NonNullable<typeof x> => !!x);
    if (extras.length) await rellenarContactosDeFuentes(ctx, actorOf(ses), extras);
  } catch { /* el listado de citas no depende del relleno */ }
  const vis = L.filter((a) => c.niv === "todos" || c.mios.includes(Number(a.calendarID)));
  const links = await todas(ctx, "beta_citas_ticket");
  const tks = (await todas(ctx, "tickets")).filter((t) => !t.borrado_at && ymdUtc(t.timestamp) >= desde && ymdUtc(t.timestamp) <= hasta);
  const citas = vis.map((a) => {
    const f = fechaCita(a), ln = links.find((x) => s(x.appointment_id) === s(a.id));
    const tk = ln ? null : tks.find((t) => ymdUtc(t.timestamp) === f && citaDeNombre([a], s(t.nombre), s(t.apellido)));
    const et = etiquetaDe(a).toUpperCase();
    return vistaCita(a, { ticket: ln ? s(ln.ticket_clave) : tk ? claveDe(tk, leerSerie(tk, "so_num")) : "", atendida: !!ln || !!tk || et === "COMPLETADO" || et.includes("INGRESADO") });
  }).sort((x, y) => s(x.datetime).localeCompare(s(y.datetime)));
  const porDia: Record<string, Record<string, number>> = {};
  for (const x of citas) { const d = porDia[s(x.fecha)] ||= { total: 0 }; d.total++; d[s(x.calendarID)] = (d[s(x.calendarID)] || 0) + 1; }
  return { ok: true, desde, hasta, citas, porDia };
});

/** Ficha de REGISTRO por nombre, con la regla estricta del sistema viejo (sin usar el teléfono como cédula). */
export function fichaDeCita(regs: Row[], nombre: string, apellido: string): Row | null {
  const full = normNombre(nombre + " " + apellido), pn = normNombre(nombre).split(" ")[0], ap = normNombre(apellido).split(" ").filter((x) => x.length > 2);
  const exact = regs.filter((r) => normNombre(s(r.nombre) + " " + s(r.apellido)) === full);
  const keys = (L: Row[]) => [...new Set(L.map(claveRegistro))];
  if (exact.length && keys(exact).length === 1) return exact.sort((a, b) => s(b.timestamp).localeCompare(s(a.timestamp)))[0];
  if (!pn || !ap.length) return null;
  const parc = regs.filter((r) => { const rn = normNombre(r.nombre).split(" ")[0], ra = normNombre(r.apellido); return rn === pn && ap.some((x) => ra.split(" ").includes(x)); });
  return keys(parc).length === 1 ? parc.sort((a, b) => s(b.timestamp).localeCompare(s(a.timestamp)))[0] : null;
}

extend("ag_cita", "any", async (p, ctx, ses) => {
  const c = await contexto(ctx, ses);
  if ("error" in c) return c;
  const r = await acuityReq(ctx, "appointments/" + encodeURIComponent(s(p.id)));
  if ("error" in r) return { error: r.error };
  const a = r.data as Row;
  if (!puedeCal(c, a.calendarID)) return { error: "Esa cita no es de tu calendario" };
  const regs = (await todas(ctx, "clientas_registro")).filter((x) => !x.borrado_at);
  const f = fichaDeCita(regs, s(a.firstName), s(a.lastName));
  const ln = (await todas(ctx, "beta_citas_ticket")).find((x) => s(x.appointment_id) === s(a.id));
  const forms = (Array.isArray(a.forms) ? a.forms as Row[] : []).flatMap((fm) => (Array.isArray(fm.values) ? fm.values as Row[] : []).filter((v) => s(v.value)).map((v) => ({ campo: s(v.name), valor: s(v.value) })));
  const out = vistaCita(a, {
    forms, ticket: ln ? s(ln.ticket_clave) : "",
    ficha: f ? { clienteKey: claveRegistro(f), cedula: normCedula(f.cedula), nombre: s(f.nombre), apellido: s(f.apellido), tipoPiel: s(f.tipo_de_piel), alergias: s(f.alergias), medicacion: s(f.medicacion), autorizaFotos: s(f.autoriza_fotos) } : null,
  });
  if (conTelefono(ses)) { out.telefono = telefonoEc(a.phone); out.email = s(a.email); }
  return { ok: true, cita: out };
});

extend("ag_disponibilidad", "any", async (p, ctx, ses) => {
  const c = await contexto(ctx, ses);
  if ("error" in c) return c;
  if (c.niv !== "todos") return { error: "Solo admin o recepción agenda citas" };
  if (!YMD.test(s(p.fecha)) || !s(p.tipoID)) return { error: "Elige tipo y fecha" };
  const q = `availability/times?appointmentTypeID=${encodeURIComponent(s(p.tipoID))}&date=${s(p.fecha)}` + (s(p.calendarID) ? "&calendarID=" + encodeURIComponent(s(p.calendarID)) : "");
  const r = await acuityReq(ctx, q);
  if ("error" in r) return { error: r.error };
  return { ok: true, horas: (r.data as Row[]).map((x) => ({ time: s(x.time), slots: x.slotsAvailable })) };
});

extend("ag_crear", "any", async (p, ctx, ses) => {
  const c = await contexto(ctx, ses);
  if ("error" in c) return c;
  if (c.niv !== "todos") return { error: "Solo admin o recepción agenda citas" };
  const nom = s(p.nombre).trim(), ape = s(p.apellido).trim(), dt = s(p.datetime);
  if (!nom || !ape) return { error: "Nombre y apellido de la clienta" };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dt)) return { error: "Fecha y hora" };
  if (!s(p.tipoID) || !s(p.calendarID)) return { error: "Tipo de cita y cosmetóloga" };
  const body: Row = { datetime: dt, appointmentTypeID: Number(p.tipoID), calendarID: Number(p.calendarID), firstName: nom, lastName: ape, notes: s(p.notas).slice(0, 1000) };
  if (s(p.telefono)) body.phone = s(p.telefono).replace(/[^\d+]/g, "");
  if (s(p.email)) body.email = s(p.email).trim();
  if (Array.isArray(p.addonIDs) && p.addonIDs.length) body.addonIDs = (p.addonIDs as unknown[]).map(Number).filter(Boolean);
  const r = await acuityReq(ctx, "appointments?admin=true" + (p.avisar === true ? "" : "&noEmail=true"), { method: "POST", body });
  if ("error" in r) return { error: r.error };
  limpiarCacheAcuity();
  return { ok: true, cita: vistaCita(r.data as Row) };
});

extend("ag_reagendar", "any", async (p, ctx, ses) => {
  const c = await contexto(ctx, ses);
  if ("error" in c) return c;
  if (c.niv !== "todos") return { error: "Solo admin o recepción mueve citas" };
  const dt = s(p.datetime);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dt)) return { error: "Nueva fecha y hora" };
  const body: Row = { datetime: dt };
  if (s(p.calendarID)) body.calendarID = Number(p.calendarID);
  const r = await acuityReq(ctx, "appointments/" + encodeURIComponent(s(p.id)) + "/reschedule?admin=true" + (p.avisar === true ? "" : "&noEmail=true"), { method: "PUT", body });
  if ("error" in r) return { error: r.error };
  limpiarCacheAcuity();
  return { ok: true, cita: vistaCita(r.data as Row) };
});

extend("ag_cancelar", "any", async (p, ctx, ses) => {
  const c = await contexto(ctx, ses);
  if ("error" in c) return c;
  if (c.niv !== "todos") return { error: "Solo admin o recepción cancela citas" };
  const r = await acuityReq(ctx, "appointments/" + encodeURIComponent(s(p.id)) + "/cancel?admin=true" + (p.avisar === true ? "" : "&noEmail=true"), { method: "PUT", body: { cancelNote: s(p.motivo).slice(0, 300) } });
  if ("error" in r) return { error: r.error };
  limpiarCacheAcuity();
  return { ok: true };
});
extend("ag_eliminar", "any", async () => ({ error: "Acuity no permite borrar citas por su API. Usa «Cancelar»: libera el horario y queda el registro." }));

async function ponerEtiqueta(ctx: Ctx, aptId: string, prefijo: string, siNoTiene?: RegExp): Promise<Row> {
  const labels = await acuityCache<Row[]>(ctx, "labels", 10 * 60000);
  if (!Array.isArray(labels)) return { error: (labels as Row).error };
  const lab = labels.find((l) => s(l.name).toUpperCase().includes(prefijo.toUpperCase()));
  if (!lab) return { error: "No existe la etiqueta " + prefijo + " en Acuity" };
  if (siNoTiene) {
    const cur = await acuityReq(ctx, "appointments/" + encodeURIComponent(aptId));
    if ("error" in cur) return { error: cur.error };
    if (siNoTiene.test(etiquetaDe(cur.data as Row).toUpperCase())) return { ok: true, omitida: true, etiqueta: etiquetaDe(cur.data as Row) };
  }
  const r = await acuityReq(ctx, "appointments/" + encodeURIComponent(aptId) + "?admin=true", { method: "PUT", body: { labels: [{ id: lab.id }] } });
  if ("error" in r) return { error: r.error };
  limpiarCacheAcuity();
  return { ok: true, etiqueta: s(lab.name) };
}
const ETQ_STAFF = new Set(["NO LLEGO"]);
extend("ag_etiqueta", "any", async (p, ctx, ses) => {
  const c = await contexto(ctx, ses);
  if ("error" in c) return c;
  const et = s(p.etiqueta).toUpperCase().trim();
  if (!et) return { error: "Etiqueta" };
  if (c.niv !== "todos" && !ETQ_STAFF.has(et)) return { error: "Solo puedes marcar «No llegó»" };
  if (/INGRESADO/.test(et) && !esAdmin(ses.rol)) return { error: "INGRESADO Y COMP la pone la conciliación de facturas" };
  const cur = await acuityReq(ctx, "appointments/" + encodeURIComponent(s(p.id)));
  if ("error" in cur) return { error: cur.error };
  if (!puedeCal(c, (cur.data as Row).calendarID)) return { error: "Esa cita no es de tu calendario" };
  return await ponerEtiqueta(ctx, s(p.id), et);
});

/** Ticket creado desde la cita: queda enlazado (beta) y la cita pasa a COMPLETADO, salvo que ya esté INGRESADO. */
extend("ag_vincular", "any", async (p, ctx, ses) => {
  const c = await contexto(ctx, ses);
  if ("error" in c) return c;
  const cur = await acuityReq(ctx, "appointments/" + encodeURIComponent(s(p.id)));
  if ("error" in cur) return { error: cur.error };
  const a = cur.data as Row;
  if (!puedeCal(c, a.calendarID)) return { error: "Esa cita no es de tu calendario" };
  const clave = s(p.ticket).trim();
  if (!clave) return { error: "Falta el ticket" };
  const ya = (await todas(ctx, "beta_citas_ticket")).find((x) => s(x.appointment_id) === s(a.id));
  const fila = { ticket_clave: clave, fecha: fechaCita(a) || null, calendar_id: a.calendarID ?? null, por: actorOf(ses) };
  try {
    if (ya) await ctx.db.write(actorOf(ses), "beta_citas_ticket", "update", { appointment_id: a.id }, fila);
    else await ctx.db.write(actorOf(ses), "beta_citas_ticket", "insert", {}, { appointment_id: a.id, ...fila });
  } catch { return { error: "Falta aplicar 0050_agenda_beta.sql" }; }
  const et = /INGRESADO/.test(etiquetaDe(a).toUpperCase()) ? { ok: true, omitida: true } : await ponerEtiqueta(ctx, s(a.id), "COMPLETADO");
  try { await ctx.db.write(actorOf(ses), "beta_citas_ticket", "update", { appointment_id: a.id }, { etiqueta: et.ok ? s(et.etiqueta) || etiquetaDe(a) : null }); } catch { /* */ }
  return { ok: true, etiqueta: et };
});

/** Revisado = conciliado (efch ✓) o canje/cortesía puro sin consumo, como conciliarFacturasMN. */
export function ticketRevisado(t: Row): boolean {
  if (t.efch === true || s(t.efch).toLowerCase() === "true") return true;
  const fac = s(t.fac_7).trim();
  return !fac && (esCanje(t.paquete, t.gift_card) || /^CORTESIA/i.test(s(t.paquete))) && n(t.estimado) <= 0.01;
}
/** Marca INGRESADO Y COMP en las citas de los tickets revisados del rango (misma regla que _marcarIngresadoAcuity_). */
export async function marcarIngresados(ctx: Ctx, desde: string, hasta: string, simular: boolean): Promise<Row> {
  const tks = (await todas(ctx, "tickets")).filter((t) => !t.borrado_at && ymdUtc(t.timestamp) >= desde && ymdUtc(t.timestamp) <= hasta && ticketRevisado(t));
  const L = await citasRango(ctx, desde, hasta, { ms: 60000 });
  if (!Array.isArray(L)) return { error: L.error };
  const links = await todas(ctx, "beta_citas_ticket");
  let marcadas = 0, yaTenian = 0, sinCita = 0; const hechas = new Set<string>(), errores: string[] = [];
  for (const t of tks) {
    const f = ymdUtc(t.timestamp), clave = claveDe(t, leerSerie(t, "so_num"));
    const ln = links.find((x) => s(x.ticket_clave) === clave);
    const a = (ln && L.find((x) => s(x.id) === s(ln.appointment_id))) || citaDeNombre(L.filter((x) => fechaCita(x) === f), s(t.nombre), s(t.apellido));
    if (!a) { sinCita++; continue; }
    if (hechas.has(s(a.id))) continue;
    hechas.add(s(a.id));
    if (/INGRESADO/.test(etiquetaDe(a).toUpperCase())) { yaTenian++; continue; }
    if (simular) { marcadas++; continue; }
    const r = await ponerEtiqueta(ctx, s(a.id), "INGRESADO");
    if (r.error) errores.push(s(r.error)); else marcadas++;
  }
  return { ok: true, revisados: tks.length, marcadas, yaTenian, sinCita, errores: errores.slice(0, 5), simulado: simular };
}
extend("ag_ingresado", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const hasta = YMD.test(s(p.hasta)) ? s(p.hasta) : hoyEc(ctx), desde = YMD.test(s(p.desde)) ? s(p.desde) : addD(hasta, -30);
  if (addD(desde, 62) < hasta) return { error: "Máximo 2 meses por corrida" };
  return await marcarIngresados(ctx, desde, hasta, p.simular === true);
});

extend("ag_calendario_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const id = Number(p.calendarID);
  if (!id) return { error: "Calendario" };
  const ya = (await todas(ctx, "beta_acuity_calendars")).find((x) => Number(x.calendar_id) === id);
  const fila = { nombre: s(p.nombre).trim() || s(ya?.nombre) || String(id), persona: s(p.persona).trim() || null, cosmetologa_id: s(p.cosmetologaId).trim() || null, activo: p.activo !== false, updated_at: ctx.now.toISOString() };
  if (ya) await ctx.db.write(actorOf(ses), "beta_acuity_calendars", "update", { calendar_id: id }, fila);
  else await ctx.db.write(actorOf(ses), "beta_acuity_calendars", "insert", {}, { calendar_id: id, ...fila });
  return { ok: true };
});
export { nombreCita };
