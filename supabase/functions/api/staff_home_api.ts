// Dashboard del personal (no admin): saludo + citas de hoy de su calendario.
// Sin precios, teléfonos, correos ni dirección/sector. Ver como usa la sesión de la persona vista.
// TK167: sin el texto de Acuity en la tarjeta; «Nueva» solo si es su primera visita en el sistema;
// visita anterior con el facial; paquete y gift card vigentes, en lote.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { esAdmin, acceso, matrizDe } from "./permisos.ts";
import { addDays, cedulasCompatibles, n, normCedula, normNombre, s, ymdUtc, type Row } from "./domain.ts";
import { calcularKpisStaff } from "./dashboard_api.ts";
import { consultar } from "./query.ts";
import { citasRango, fechaCita } from "./acuity.ts";
import { fichaDeCita, misCalendarios } from "./agenda_api.ts";
import { claveRegistro, saldoGift } from "./ventas.ts";
import { claveDe } from "./ticket_beta.ts";
import { leerSerie } from "./series.ts";
import { itemBorradorHome, listarBorradoresVisibles } from "./borradores_asig.ts";
import { aplicarAjuste, vistaPaquete } from "./paquetes_beta.ts";
import { leerNotas } from "./gift_beta.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const hoyEc = (ctx: Ctx) => new Date(ctx.now.getTime() - 5 * 3600000).toISOString().slice(0, 10);

function etiquetaDe(a: Row): string {
  const L = Array.isArray(a.labels) ? a.labels as Row[] : [];
  return L.length ? s(L[0].name) : "";
}

function servicioTicket(t: Row): string {
  return s(t.facial_hecho).trim();
}

function limpio(v: unknown): boolean {
  const j = JSON.stringify(v || {});
  return !/telefono|celular|whatsapp|"email"|correo|direccion|sector|precio|estimado|costo|margen/i.test(j);
}

function primeraAcuity(a: Row): boolean {
  return /PRIMERA/i.test(s(a.type));
}

function nomCompleto(nombre: string, apellido: string): string {
  return normNombre((nombre + " " + apellido).trim());
}

function mismoNombre(a: string, b: string): boolean {
  const x = normNombre(a), y = normNombre(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xp = x.split(" "), yp = y.split(" ");
  return !!(xp[0] && yp[0] && xp[0] === yp[0] && xp[1] && yp[1] && xp[1] === yp[1]);
}

function mismaCed(a: unknown, b: unknown): boolean {
  const ca = normCedula(a), cb = normCedula(b);
  if (!ca || !cb) return false;
  return ca === cb || cedulasCompatibles(a, b);
}

function ticketsPrevios(tks: Row[], opts: { ced: string; nombre: string; apellido: string; antesDe: string }): Row[] {
  const clienteNom = normNombre(opts.nombre);
  const clienteAp = normNombre(opts.apellido).split(" ")[0];
  return tks.filter((t) => {
    if (t.borrado_at) return false;
    const fecha = ymdUtc(t.timestamp);
    if (!fecha || fecha >= opts.antesDe) return false;
    if (opts.ced && mismaCed(t.id_3, opts.ced)) return true;
    if (opts.ced && normCedula(t.id_3) && !mismaCed(t.id_3, opts.ced)) return false;
    const tn = normNombre(s(t.nombre)), ta = normNombre(s(t.apellido)).split(" ")[0];
    return (tn === clienteNom || tn.split(" ")[0] === clienteNom.split(" ")[0]) && ta === clienteAp;
  }).sort((x, y) => s(y.timestamp).localeCompare(s(x.timestamp)));
}

type PaqVista = { ced: string; nom: string; pendientes: number; total: number; estado: string };
type GiftVista = { ced: string; comprador: string; para: string; saldo: number };

function paquetesDePersona(paqs: PaqVista[], ced: string, nom: string): PaqVista[] {
  return paqs.filter((p) => {
    if (p.estado === "anulado" || !(p.pendientes > 0)) return false;
    if (ced && p.ced && mismaCed(p.ced, ced)) return true;
    if (nom && p.nom && mismoNombre(p.nom, nom) && (!ced || !p.ced)) return true;
    return false;
  });
}

function giftsDePersona(gcs: GiftVista[], ced: string, nom: string): GiftVista[] {
  return gcs.filter((g) => {
    if (!(g.saldo > 0)) return false;
    if (ced && g.ced && mismaCed(g.ced, ced)) return true;
    if (g.comprador && mismoNombre(g.comprador, nom) && (!g.ced || !ced || mismaCed(g.ced, ced))) return true;
    if (g.para && mismoNombre(g.para, nom)) return true;
    return false;
  });
}

extend("staff_home", "any", async (p, ctx, ses) => {
  const hoy = hoyEc(ctx);
  const nombre = s(ses.short) || s(ses.name).split(" ")[0] || "";
  const admin = esAdmin(ses.rol);
  const [matriz, beta, borRows] = await Promise.all([
    admin ? Promise.resolve(null) : matrizDe(ctx.db),
    todas(ctx, "beta_acuity_calendars"),
    listarBorradoresVisibles(ctx, ses),
  ]);
  const nivAgenda = admin ? "todos" : acceso(ses.rol, "agenda", matriz || {});
  const cals = beta.map((b) => ({ id: Number(b.calendar_id), nombre: s(b.nombre), persona: s(b.persona) }));
  const mios = misCalendarios(cals, ses);
  const verTodos = nivAgenda === "todos";
  const borHome = borRows.map(itemBorradorHome);
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

  const periodo = (["hoy", "semana", "mes", "ano"].includes(s(p.periodo)) ? s(p.periodo) : "hoy");
  // Un solo viaje a Acuity (hoy + 14 días). Si hoy no hay citas, se muestra el siguiente día completo.
  const L = await citasRango(ctx, hoy, addDays(hoy, 14), {});
  if (!Array.isArray(L)) return { error: L.error, hoy, nombre, citas: [] };
  const mine = (a: Row) => a.canceled !== true && (verTodos || mios.includes(Number(a.calendarID)));
  let vis = L.filter((a) => mine(a) && (fechaCita(a) || s(a.datetime).slice(0, 10)) === hoy);
  let citasFecha = hoy;
  if (!vis.length) {
    const prox = L.filter(mine).sort((a, b) => s(a.datetime).localeCompare(s(b.datetime)));
    if (prox.length) {
      citasFecha = fechaCita(prox[0]) || s(prox[0].datetime).slice(0, 10);
      vis = prox.filter((a) => (fechaCita(a) || s(a.datetime).slice(0, 10)) === citasFecha);
    }
  }

  const TK_SLIM = ["id", "timestamp", "nombre", "apellido", "facial_hecho", "notas", "notas_generales", "so_num", "beta_num", "sheet_row", "borrado_at", "id_3"];
  const REG_SLIM = ["id", "cedula", "nombre", "apellido", "sheet_row", "borrado_at", "timestamp"];
  const PAQ_SLIM = ["id", "cedula", "nombres", "apellidos", "completo", "borrado_at", "sku", "paquete", "codigo", "beta_codigo", "factura", "ano", "mes", "dia", "orig",
    "uso_1", "fecha_1", "uso_2", "fecha_2", "uso_3", "fecha_3", "uso4", "fecha_4", "uso_5", "fecha_5", "uso_6", "fecha_6"];
  const [links, tksRes, regsRes, kpisDash, paqsRes, giftsRes, catsRes, ajPaqRes, ajGiftRes] = await Promise.all([
    consultar(ctx.db, "beta_citas_ticket", { cols: ["appointment_id", "ticket_clave"] }).then((r) => r.rows).catch(() => [] as Row[]),
    consultar(ctx.db, "tickets", { cols: TK_SLIM }).then((r) => r.rows).catch(() => [] as Row[]),
    consultar(ctx.db, "clientas_registro", { cols: REG_SLIM, filtros: [{ col: "borrado_at", op: "is_null" }] }).then((r) => r.rows).catch(() => [] as Row[]),
    calcularKpisStaff(ctx.db, ctx.now, { periodo, cosm: s(ses.name) || s(ses.short) }).catch(() => null),
    consultar(ctx.db, "paquetes", { cols: PAQ_SLIM }).then((r) => r.rows).catch(() => todas(ctx, "paquetes")),
    todas(ctx, "gift_cards"),
    ctx.db.all("catalogo").catch(() => [] as Row[]),
    todas(ctx, "beta_paquete_ajustes"),
    todas(ctx, "beta_gift_ajustes"),
  ]);
  const tks = tksRes;
  const regs = regsRes;
  const ajPaq = new Map(ajPaqRes.map((a) => [String(a.paquete_id), a]));
  const ajGift = new Map(ajGiftRes.map((a) => [String(a.gift_id || a.id), a]));
  const paqsVivos = (paqsRes as Row[]).filter((r) => !r.borrado_at);
  const paqsVista: PaqVista[] = [];
  for (const r0 of paqsVivos) {
    const aj = ajPaq.get(String(r0.id)) || null;
    const r = aplicarAjuste(r0, aj);
    if (r.__borrado === true) continue;
    const v = vistaPaquete(r0, aj);
    if (v.borrado === true) continue;
    paqsVista.push({
      ced: normCedula(v.cedula) || normCedula(r.cedula),
      nom: nomCompleto(s(r.nombres), s(r.apellidos)),
      pendientes: n(v.pendientes),
      total: n(v.total),
      estado: s(v.estado),
    });
  }
  const giftsVista: GiftVista[] = [];
  for (const r of (giftsRes as Row[]).filter((x) => !x.borrado_at && s(x.codigo_gc))) {
    const sal = saldoGift(r, catsRes as Row[], paqsVivos);
    if (!(sal > 0)) continue;
    const aj = ajGift.get(String(r.id)) || ajGiftRes.find((x) => s(x.codigo) === s(r.codigo_gc)) || null;
    const paraAj = s(aj?.para) || s((r.orig && typeof r.orig === "object" ? r.orig as Row : {}).para) || leerNotas(r.notas).para;
    giftsVista.push({
      ced: normCedula(r.cedula_comprador),
      comprador: nomCompleto(s(r.nombre_comprador), s(r.apellido_comprador)),
      para: normNombre(paraAj),
      saldo: sal,
    });
  }

  const citas = vis.map((a) => {
    const f = fechaCita(a);
    const ln = links.find((x) => s(x.appointment_id) === s(a.id));
    const tkHoy = ln ? null : tks.find((t) => !t.borrado_at && ymdUtc(t.timestamp) === f && normNombre(s(t.nombre)) === normNombre(s(a.firstName)) && normNombre(s(t.apellido)).split(" ")[0] === normNombre(s(a.lastName)).split(" ")[0]);
    const ticket = ln ? s(ln.ticket_clave) : tkHoy ? claveDe(tkHoy, leerSerie(tkHoy, "so_num")) : "";
    const et = etiquetaDe(a);
    const ficha = fichaDeCita(regs, s(a.firstName), s(a.lastName));
    const ced = ficha ? normCedula(ficha.cedula) : "";
    const nom = nomCompleto(s(a.firstName), s(a.lastName));
    const previas = ticketsPrevios(tks, { ced, nombre: s(a.firstName), apellido: s(a.lastName), antesDe: f || hoy });
    let nueva = false;
    let anterior: Row | null = null;
    if (previas.length) {
      const u = previas[0];
      anterior = { fecha: ymdUtc(u.timestamp), ...(servicioTicket(u) ? { servicio: servicioTicket(u) } : {}) };
    } else if (ficha) {
      nueva = true;
    } else {
      nueva = primeraAcuity(a);
    }
    const paqs = paquetesDePersona(paqsVista, ced, nom);
    const gifts = giftsDePersona(giftsVista, ced, nom);
    const pendientes = paqs.reduce((acc, x) => acc + x.pendientes, 0);
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
      paquete: { activo: pendientes > 0, ...(pendientes > 0 ? { pendientes } : {}) },
      gift: { activo: gifts.length > 0 },
    };
    return out;
  }).sort((x, y) => s(x.datetime).localeCompare(s(y.datetime)));

  const kpis: Row = kpisDash && typeof kpisDash === "object"
    ? { productos: n((kpisDash as Row).productos), paquetes: n((kpisDash as Row).paquetes), faciales: n((kpisDash as Row).faciales), periodo: s((kpisDash as Row).periodo) || periodo, desde: s((kpisDash as Row).desde) || hoy, hasta: s((kpisDash as Row).hasta) || hoy }
    : { productos: 0, paquetes: 0, faciales: 0, periodo, desde: hoy, hasta: hoy };

  const payload = { ok: true, hoy, citasFecha, nombre, citas, kpis, puede: { ticket: true, noLlego: true, mover: verTodos }, borradores: borHome };
  if (!limpio(payload)) return { error: "Respuesta de staff_home con datos que el personal no debe ver" };
  return payload;
});
