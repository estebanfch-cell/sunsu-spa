// Import de facturas Migo (solo lectura), cruce horario, marcas rojo/amarillo y borradores
// «Pendiente de aprobar» cuando la factura llega antes que el ticket. Nunca emite ni anula facturas.
import { extend, crearTicket } from "./handlers.ts";
import { ADMIN, ecuadorParts, n, s, type Row } from "./domain.ts";
import { actorOf, guardarArchivo, logAccion, type Ctx, type Ses } from "./lib.ts";
import { claveDe } from "./ticket_beta.ts";
import { leerSerie } from "./series.ts";
import { esAdmin } from "./permisos.ts";
import { citaDeNombre, citasRango, fechaCita } from "./acuity.ts";
import {
  cruzar, exentoCuadre, facSeq, facturaNorm, flagsDeseadas, formaAComp, formaDeTicket, FALTA_CUADRE_DESDE,
  facturasSinTicket, fechaGye, idFlag, NUNCA_TICKET_ID, ofertaBorrador, parseFacturaVivo, splitCliente,
  type FacturaVivo, type FlagDeseada, type LinkCuadre,
} from "./migo_cuadre.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
async function logSafe(ctx: Ctx, actor: string, accion: string, detalle: string): Promise<void> {
  try { await logAccion(ctx.db, actor, accion, detalle); } catch { /* tests o log no listo */ }
}

function pubBorrador(b0: Row): Row {
  return {
    factura: s(b0.factura), fecha: s(b0.fecha).slice(0, 10), cliente: s(b0.cliente),
    total: n(b0.total), forma: s(b0.forma), lineas: Array.isArray(b0.lineas) ? b0.lineas : [],
    estado: s(b0.estado), estado_txt: s(b0.estado) === "pendiente" || s(b0.estado) === "asignado" ? "Pendiente de aprobar" : s(b0.estado),
    asignado_a: s(b0.asignado_a) || null, bandeja: s(b0.estado) === "pendiente",
    ticket_clave: s(b0.ticket_clave) || null, datos: (b0.datos && typeof b0.datos === "object" ? b0.datos : {}) as Row,
    nota: s(b0.nota) || null, acuity: s(b0.acuity_appointment_id) || null,
  };
}

function puedeVerBorrador(ses: Ses, b0: Row): boolean {
  if (esAdmin(ses.rol)) return true;
  const a = s(b0.asignado_a).toLowerCase();
  if (!a) return false;
  const yo = ses.name.toLowerCase();
  const short = s(ses.short).toLowerCase();
  return a === yo || (short && (a === short || a.startsWith(short + " ") || yo.startsWith(a)));
}

async function ticketsParaCuadre(ctx: Ctx): Promise<Row[]> {
  const tickets = (await todas(ctx, "tickets")).filter((t) => !t.borrado_at);
  const canc = new Set((await todas(ctx, "beta_ticket_cancelados")).filter((c) => c.revertido !== true).map((c) => n(c.ticket_id)));
  const cabs = new Map((await todas(ctx, "beta_tickets")).map((c) => [s(c.clave), c]));
  const out: Row[] = [];
  for (const r of tickets) {
    if (canc.has(n(r.id))) continue;
    const clave = claveDe(r, leerSerie(r, "so_num"));
    const d = (cabs.get(clave)?.datos || {}) as Row;
    out.push({
      ...r, clave, fecha: fechaGye(r.timestamp),
      facturaBeta: s(d.factura),
      nombre: s(d.nombre) || s(r.nombre),
      apellido: s(d.apellido) || s(r.apellido),
    });
  }
  return out;
}

function facturasDeFilas(rows: Row[]): FacturaVivo[] {
  const out: FacturaVivo[] = [];
  for (const r of rows) {
    const f = parseFacturaVivo(r);
    if (f) out.push(f);
  }
  return out;
}

async function guardarLinks(ctx: Ctx, actor: string, links: LinkCuadre[]): Promise<void> {
  const prev = await todas(ctx, "beta_cuadre_link");
  const nextIds = new Set(links.map((L) => L.ticket_id));
  for (const p of prev) {
    if (!nextIds.has(n(p.ticket_id))) await ctx.db.write(actor, "beta_cuadre_link", "delete", { ticket_id: p.ticket_id }, null);
  }
  const byId = new Map(prev.map((p) => [n(p.ticket_id), p]));
  const now = ctx.now.toISOString();
  for (const L of links) {
    const row = { ...L, updated_at: now };
    if (byId.has(L.ticket_id)) await ctx.db.write(actor, "beta_cuadre_link", "update", { ticket_id: L.ticket_id }, row);
    else await ctx.db.write(actor, "beta_cuadre_link", "insert", {}, row);
  }
}

const KIND_ID = /^(monto|clienta|sinfac)$/;

async function syncFlags(ctx: Ctx, actor: string, deseadas: FlagDeseada[]): Promise<{ creadas: number; resueltas: number }> {
  const prev = await todas(ctx, "beta_ticket_flags");
  const want = new Map(deseadas.map((f) => [idFlag(f.ticket_id, f.kind), f]));
  const now = ctx.now.toISOString();
  let creadas = 0, resueltas = 0;
  for (const f of prev) {
    const id = s(f.id);
    const m = /^migo:(\d+):(monto|clienta|sinfac)$/.exec(id);
    if (!m) continue;
    const tid = Number(m[1]);
    if (tid === NUNCA_TICKET_ID) continue;
    if (want.has(id)) continue;
    if (f.resuelto === true) continue;
    await ctx.db.write(actor, "beta_ticket_flags", "update", { id }, {
      resuelto: true, resuelto_por: actor, resuelto_at: now, nota: "cuadró automáticamente", updated_at: now,
    });
    resueltas++;
  }
  for (const [id, d] of want) {
    if (d.ticket_id === NUNCA_TICKET_ID) continue;
    const ex = prev.find((x) => s(x.id) === id);
    if (ex) {
      if (ex.resuelto === true) continue; // un admin ya lo dio por cerrado
      await ctx.db.write(actor, "beta_ticket_flags", "update", { id }, {
        motivo: d.motivo, detalle: d.detalle, factura: d.factura, fuente: "migo", updated_at: now,
      });
      continue;
    }
    await ctx.db.write(actor, "beta_ticket_flags", "insert", {}, {
      id, ticket_id: d.ticket_id, ticket_clave: d.ticket_clave, motivo: d.motivo, detalle: d.detalle,
      factura: d.factura, fuente: "migo", resuelto: false, created_at: now, updated_at: now,
    });
    creadas++;
  }
  return { creadas, resueltas };
}

async function cosmDeCita(ctx: Ctx, cliente: string, fecha: string): Promise<{ persona: string; appointment_id: string } | null> {
  const parts = splitCliente(cliente);
  if (!parts.nombre) return null;
  let citas: Row[] | { error: string };
  try { citas = await citasRango(ctx, fecha, fecha, { ms: 120000 }); }
  catch { return null; }
  if (!Array.isArray(citas) || !citas.length) return null;
  const hit = citaDeNombre(citas.filter((a) => fechaCita(a) === fecha), parts.nombre, parts.apellido)
    || citaDeNombre(citas, parts.nombre, parts.apellido);
  if (!hit) return null;
  const cals = await todas(ctx, "beta_acuity_calendars");
  const cal = cals.find((c) => String(c.calendar_id) === String(hit.calendarID) && c.activo !== false);
  const persona = s(cal?.persona) || s(hit.calendar) || s(hit.calendarName);
  if (!persona) return null;
  return { persona, appointment_id: s(hit.id) };
}

async function syncBorradores(ctx: Ctx, actor: string, facturas: FacturaVivo[], links: LinkCuadre[]): Promise<{ nuevos: number; vinculados: number }> {
  const existentes = await todas(ctx, "beta_migo_borradores");
  const byFac = new Map(existentes.map((b) => [s(b.factura), b]));
  const linkedFac = new Set(links.map((L) => L.factura));
  const linksByFac = new Map<string, LinkCuadre[]>();
  for (const L of links) {
    const a = linksByFac.get(L.factura) || [];
    a.push(L); linksByFac.set(L.factura, a);
  }
  const now = ctx.now.toISOString();
  let nuevos = 0, vinculados = 0;
  // Si la factura ya tiene ticket, el borrador pendiente se vincula solo.
  for (const b0 of existentes) {
    if (!["pendiente", "asignado"].includes(s(b0.estado))) continue;
    if (!linkedFac.has(s(b0.factura))) continue;
    const Ls = linksByFac.get(s(b0.factura)) || [];
    const L = Ls[0];
    await ctx.db.write(actor, "beta_migo_borradores", "update", { factura: b0.factura }, {
      estado: "vinculado", ticket_id: L.ticket_id, ticket_clave: null, aprobado_por: actor, aprobado_at: now,
      nota: "el ticket apareció después; se vinculó solo", updated_at: now,
    });
    vinculados++;
  }
  for (const f of facturasSinTicket(facturas, links)) {
    if (byFac.has(f.factura)) continue;
    const cita = await cosmDeCita(ctx, f.cliente, f.fecha);
    const estado = cita ? "asignado" : "pendiente";
    await ctx.db.write(actor, "beta_migo_borradores", "insert", {}, {
      factura: f.factura, fecha: f.fecha, cliente: f.cliente, total: f.total, forma: f.forma || "",
      lineas: f.lineas || [], estado,
      asignado_a: cita ? cita.persona : null,
      asignado_por: cita ? "acuity" : null,
      assigned_at: cita ? now : null,
      acuity_appointment_id: cita ? cita.appointment_id : null,
      datos: {}, created_at: now, updated_at: now,
    });
    nuevos++;
  }
  return { nuevos, vinculados };
}


async function aplicarDatosMigo(ctx: Ctx, actor: string, tickets: Row[], links: LinkCuadre[], facturas: FacturaVivo[]): Promise<number> {
  const byFac = new Map(facturas.map((f) => [f.factura, f]));
  const vivoPdf = new Map((await todas(ctx, "beta_migo_facturas_vivo")).map((r) => [s(r.factura), s(r.pdf_archivo)]));
  const byId = new Map(tickets.map((t) => [n(t.id), t]));
  const cabs = new Map((await todas(ctx, "beta_tickets")).map((c) => [s(c.clave), c]));
  const now = ctx.now.toISOString();
  let nAct = 0;
  for (const L of links) {
    if (L.ticket_id === NUNCA_TICKET_ID) continue;
    const t = byId.get(L.ticket_id);
    if (!t) continue;
    const clave = s(t.clave) || claveDe(t, leerSerie(t, "so_num"));
    if (!clave) continue;
    const inv = byFac.get(L.factura);
    const cab = cabs.get(clave);
    const prev = { ...((cab?.datos && typeof cab.datos === "object" ? cab.datos : {}) as Row) };
    const forma = formaDeTicket(t, prev, inv?.forma);
    const next: Row = { ...prev };
    next.factura = L.factura;
    if (forma) next.forma_pago = forma;
    next.pago_migo = {
      factura: L.factura,
      forma: (inv?.forma || forma || "").slice(0, 80),
      fecha: inv?.fecha || "",
      total: inv?.total ?? L.total_factura,
      fuente: "migo",
    };
    const pdfUrl = s((prev.factura_pdf && typeof prev.factura_pdf === "object" ? (prev.factura_pdf as Row).url : "") || vivoPdf.get(L.factura));
    if (pdfUrl) next.factura_pdf = { url: pdfUrl, factura: L.factura, fuente: "migo" };
    if (JSON.stringify(prev) === JSON.stringify(next)) continue;
    try {
      if (cab) await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos: next, updated_at: now, actualizado_por: actor });
      else await ctx.db.write(actor, "beta_tickets", "insert", {}, { clave, sheet_row: t.sheet_row ?? null, datos: next, actualizado_por: actor, updated_at: now });
      cabs.set(clave, { ...(cab || {}), clave, datos: next });
      nAct++;
    } catch { /* overlay opcional; no tocar tickets/Sheets */ }
  }
  return nAct;
}

async function correrCuadre(ctx: Ctx, actor: string): Promise<Row> {
  const tickets = await ticketsParaCuadre(ctx);
  const facturas = facturasDeFilas(await todas(ctx, "beta_migo_facturas_vivo"));
  const links = cruzar(facturas, tickets);
  await guardarLinks(ctx, actor, links);
  const datosMigo = await aplicarDatosMigo(ctx, actor, tickets, links, facturas);
  const hoyGye = ecuadorParts(ctx.now).ymd;
  const imports = await todas(ctx, "beta_migo_importes");
  let importadoGye = "";
  for (const r of imports) {
    const g = fechaGye(r.imported_at);
    if (g > importadoGye) importadoGye = g;
  }
  const flags = flagsDeseadas({ tickets, links, facturas, hoyGye, importadoGye });
  const fl = await syncFlags(ctx, actor, flags);
  const br = await syncBorradores(ctx, actor, facturas, links);
  return {
    ok: true, hoy: hoyGye, importado: importadoGye || null, facturas: facturas.length, links: links.length,
    datos_migo: datosMigo, flags_abiertas: flags.length, flags_creadas: fl.creadas, flags_resueltas: fl.resueltas,
    borradores_nuevos: br.nuevos, borradores_vinculados: br.vinculados,
  };
}


async function adjuntarPdfsMigo(ctx: Ctx, actor: string, raw: unknown): Promise<Row> {
  const items = Array.isArray(raw) ? raw as Row[] : [];
  if (!items.length) return { ok: true, adjuntos: 0, tickets: 0, pendientes: 0, omitidos: 0 };
  const now = ctx.now.toISOString();
  const tickets = await ticketsParaCuadre(ctx);
  const links = await todas(ctx, "beta_cuadre_link");
  const cabs = new Map((await todas(ctx, "beta_tickets")).map((c) => [s(c.clave), c]));
  const vivos = new Map((await todas(ctx, "beta_migo_facturas_vivo")).map((r) => [s(r.factura), r]));
  let adjuntos = 0, nTk = 0, omitidos = 0;
  const pendientes: string[] = [];
  for (const it of items) {
    const fac = facturaNorm(it.factura || it.nombre);
    const data = s(it.data || it.data_url || it.imagen || it.pdf);
    if (!fac || facSeq(fac) === null) { omitidos++; continue; }
    if (!data.includes("base64,")) { omitidos++; continue; }
    const id = await guardarArchivo(ctx.db, actor, "factura_migo", "Factura " + fac, data);
    if (!id) { omitidos++; continue; }
    const url = "archivo:" + id;
    const vivo = vivos.get(fac);
    if (vivo) {
      try { await ctx.db.write(actor, "beta_migo_facturas_vivo", "update", { factura: fac }, { pdf_archivo: url, updated_at: now }); }
      catch { /* columna nueva opcional */ }
      vivos.set(fac, { ...vivo, pdf_archivo: url });
    }
    const seq = facSeq(fac)!;
    const ids = new Set<number>();
    for (const L of links) if (s(L.factura) === fac && n(L.ticket_id) !== NUNCA_TICKET_ID) ids.add(n(L.ticket_id));
    for (const tk of tickets) {
      if (n(tk.id) === NUNCA_TICKET_ID) continue;
      if (facSeq(tk.facturaBeta || tk.fac_7) === seq) ids.add(n(tk.id));
    }
    if (!ids.size) { adjuntos++; pendientes.push(fac); continue; }
    for (const tid of ids) {
      const tk = tickets.find((x) => n(x.id) === tid);
      if (!tk) continue;
      const clave = s(tk.clave) || claveDe(tk, leerSerie(tk, "so_num"));
      if (!clave) continue;
      const cab = cabs.get(clave);
      const prev = { ...((cab?.datos && typeof cab.datos === "object" ? cab.datos : {}) as Row) };
      const next: Row = {
        ...prev,
        factura: s(prev.factura) || fac,
        factura_pdf: { url, factura: fac, fuente: "migo", por: actor, fecha: now },
      };
      try {
        if (cab) await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos: next, updated_at: now, actualizado_por: actor });
        else await ctx.db.write(actor, "beta_tickets", "insert", {}, { clave, sheet_row: tk.sheet_row ?? null, datos: next, actualizado_por: actor, updated_at: now });
        cabs.set(clave, { ...(cab || {}), clave, datos: next });
        nTk++;
      } catch { /* overlay opcional */ }
    }
    adjuntos++;
  }
  await logSafe(ctx, actor, "MIGO PDF", adjuntos + " pdfs, " + nTk + " tickets, " + pendientes.length + " sin ticket");
  return { ok: true, adjuntos, tickets: nTk, pendientes: pendientes.length, pendientes_fac: pendientes, omitidos };
}

async function importarFacturas(ctx: Ctx, ses: Ses, p: Row): Promise<Row> {
  const raw = Array.isArray(p.facturas) ? p.facturas as Row[] : [];
  const parsed = raw.map(parseFacturaVivo).filter((x): x is FacturaVivo => !!x);
  if (!parsed.length) return { error: "No llegaron facturas para importar" };
  const actor = actorOf(ses);
  const now = ctx.now.toISOString();
  const prev = new Map((await todas(ctx, "beta_migo_facturas_vivo")).map((r) => [s(r.factura), r]));
  let nNuevas = 0, nAct = 0;
  for (const f of parsed) {
    const row = {
      factura: f.factura, seq: f.seq, fecha: f.fecha, hora: f.hora || null, cliente: f.cliente,
      total: f.total, subtotal: f.subtotal ?? null, descuento: f.descuento ?? null, forma: f.forma || null,
      lineas: f.lineas || [], imported_at: now, updated_at: now,
    };
    if (prev.has(f.factura)) {
      await ctx.db.write(actor, "beta_migo_facturas_vivo", "update", { factura: f.factura }, row);
      nAct++;
    } else {
      await ctx.db.write(actor, "beta_migo_facturas_vivo", "insert", {}, row);
      nNuevas++;
    }
  }
  const maxSeq = parsed.reduce((a, f) => Math.max(a, f.seq), 0);
  const fechas = parsed.map((f) => f.fecha).sort();
  await ctx.db.write(actor, "beta_migo_importes", "insert", {}, {
    fecha_desde: s(p.fecha_desde) || fechas[0], fecha_hasta: s(p.fecha_hasta) || fechas[fechas.length - 1],
    n_facturas: parsed.length, n_nuevas: nNuevas, n_actualizadas: nAct, max_seq: maxSeq,
    fuente: s(p.fuente) || "json", actor, imported_at: now,
  });
  const cuadre = await correrCuadre(ctx, actor);
  let pdfs: Row = { adjuntos: 0 };
  if (Array.isArray(p.pdfs) && (p.pdfs as unknown[]).length) {
    pdfs = await adjuntarPdfsMigo(ctx, actor, p.pdfs);
  }
  await logSafe(ctx, actor, "MIGO IMPORTAR", parsed.length + " facturas, +" + nNuevas + " nuevas, máx " + maxSeq);
  return { ok: true, importadas: parsed.length, nuevas: nNuevas, actualizadas: nAct, max_seq: maxSeq, cuadre, pdfs };
}

extend("migo_importar", ADMIN, (p, ctx, ses) => importarFacturas(ctx, ses, p));
extend("migo_adjuntar_pdfs", ADMIN, (p, ctx, ses) => adjuntarPdfsMigo(ctx, actorOf(ses), p.pdfs));
extend("migo_cuadre_hora", ADMIN, async (_p, ctx, ses) => {
  const out = await correrCuadre(ctx, actorOf(ses));
  await logSafe(ctx, actorOf(ses), "MIGO CUADRE", "links " + n(out.links) + ", flags " + n(out.flags_abiertas));
  return out;
});
extend("migo_cuadre_estado", ADMIN, async (_p, ctx) => {
  const facs = await todas(ctx, "beta_migo_facturas_vivo");
  const imps = [...(await todas(ctx, "beta_migo_importes"))].sort((a, b) => s(b.imported_at).localeCompare(s(a.imported_at)));
  const last = imps[0];
  const flags = (await todas(ctx, "beta_ticket_flags")).filter((f) => !f.resuelto && s(f.fuente) === "migo" && n(f.ticket_id) !== NUNCA_TICKET_ID);
  const bor = await todas(ctx, "beta_migo_borradores");
  const pend = bor.filter((b0) => s(b0.estado) === "pendiente");
  const asig = bor.filter((b0) => s(b0.estado) === "asignado");
  return {
    ok: true,
    facturas: facs.length,
    max_seq: facs.reduce((a, r) => Math.max(a, n(r.seq)), 0) || null,
    ultimo_import: last ? { at: s(last.imported_at), n: n(last.n_facturas), max_seq: n(last.max_seq), fuente: s(last.fuente) } : null,
    flags_abiertas: flags.length,
    bandeja: pend.length,
    pendientes_aprobar: asig.length + pend.length,
  };
});

extend("migo_borradores_lista", "any", async (_p, ctx, ses) => {
  const rows = await todas(ctx, "beta_migo_borradores");
  const vivas = rows.filter((b0) => ["pendiente", "asignado"].includes(s(b0.estado)));
  const mias = vivas.filter((b0) => puedeVerBorrador(ses, b0) && s(b0.estado) === "asignado");
  const bandeja = esAdmin(ses.rol) ? vivas.filter((b0) => s(b0.estado) === "pendiente") : [];
  return {
    ok: true,
    mias: mias.map(pubBorrador),
    bandeja: bandeja.map(pubBorrador),
    pendientes: (esAdmin(ses.rol) ? vivas : mias).map(pubBorrador),
  };
});

extend("migo_borrador_get", "any", async (p, ctx, ses) => {
  const fac = facturaNorm(p.factura);
  const b0 = (await todas(ctx, "beta_migo_borradores")).find((x) => s(x.factura) === fac);
  if (!b0) return { error: "No encontré ese borrador" };
  if (!puedeVerBorrador(ses, b0) && s(b0.estado) !== "pendiente") return { error: "No tienes permiso" };
  if (s(b0.estado) === "pendiente" && !esAdmin(ses.rol)) return { error: "Esta factura está en la bandeja de admin" };
  return { ok: true, borrador: pubBorrador(b0) };
});

extend("migo_borrador_guardar", "any", async (p, ctx, ses) => {
  const fac = facturaNorm(p.factura);
  const b0 = (await todas(ctx, "beta_migo_borradores")).find((x) => s(x.factura) === fac);
  if (!b0) return { error: "No encontré ese borrador" };
  if (!["pendiente", "asignado"].includes(s(b0.estado))) return { error: "Ese borrador ya no se edita" };
  if (!puedeVerBorrador(ses, b0)) return { error: "No tienes permiso" };
  const prev = (b0.datos && typeof b0.datos === "object" ? b0.datos : {}) as Row;
  const datos = { ...prev, ...((p.datos && typeof p.datos === "object" ? p.datos : {}) as Row) };
  const patch: Row = { datos, updated_at: ctx.now.toISOString() };
  if (p.nota != null) patch.nota = s(p.nota).slice(0, 500);
  if (Array.isArray(p.lineas)) patch.lineas = p.lineas;
  await ctx.db.write(actorOf(ses), "beta_migo_borradores", "update", { factura: fac }, patch);
  return { ok: true };
});

extend("migo_borrador_asignar", ADMIN, async (p, ctx, ses) => {
  const fac = facturaNorm(p.factura);
  const b0 = (await todas(ctx, "beta_migo_borradores")).find((x) => s(x.factura) === fac);
  if (!b0) return { error: "No encontré ese borrador" };
  if (!["pendiente", "asignado"].includes(s(b0.estado))) return { error: "Ese borrador ya no se asigna" };
  const quien = s(p.asignado_a).trim();
  if (!quien) return { error: "Indica la cosmetóloga" };
  const now = ctx.now.toISOString();
  await ctx.db.write(actorOf(ses), "beta_migo_borradores", "update", { factura: fac }, {
    estado: "asignado", asignado_a: quien, asignado_por: actorOf(ses), assigned_at: now, updated_at: now,
  });
  return { ok: true };
});

extend("migo_borrador_descartar", ADMIN, async (p, ctx, ses) => {
  const fac = facturaNorm(p.factura);
  const b0 = (await todas(ctx, "beta_migo_borradores")).find((x) => s(x.factura) === fac);
  if (!b0) return { error: "No encontré ese borrador" };
  if (!["pendiente", "asignado"].includes(s(b0.estado))) return { error: "Ese borrador ya no se descarta" };
  const now = ctx.now.toISOString();
  await ctx.db.write(actorOf(ses), "beta_migo_borradores", "update", { factura: fac }, {
    estado: "descartado", nota: s(p.nota).slice(0, 300) || s(b0.nota), updated_at: now,
  });
  return { ok: true };
});

extend("migo_borrador_aprobar", "any", async (p, ctx, ses) => {
  const fac = facturaNorm(p.factura);
  const b0 = (await todas(ctx, "beta_migo_borradores")).find((x) => s(x.factura) === fac);
  if (!b0) return { error: "No encontré ese borrador" };
  if (!["pendiente", "asignado"].includes(s(b0.estado))) return { error: "Ese borrador ya no se aprueba" };
  if (!puedeVerBorrador(ses, b0) && !esAdmin(ses.rol)) return { error: "No tienes permiso" };
  const d = { ...((b0.datos && typeof b0.datos === "object" ? b0.datos : {}) as Row), ...((p.datos && typeof p.datos === "object" ? p.datos : {}) as Row) };
  const nom = splitCliente(s(d.nombre) && s(d.apellido) ? s(d.nombre) + " " + s(d.apellido) : b0.cliente);
  const cosm = s(p.cosmetologa) || s(d.cosmetologa) || s(b0.asignado_a);
  if (!cosm) return { error: "Asigna una cosmetóloga antes de aprobar" };
  const creado = await crearTicket({
    token: ses.token,
    nombre: nom.nombre, apellido: nom.apellido,
    cosmetologa: cosm, estimado: n(b0.total),
    notas: s(d.notas) || s(d.notas_generales) || s(p.notas) || s(b0.nota),
    recomendaciones: s(d.recomendaciones),
    facial: s(d.facial) || s(d.facial_hecho),
    extras: s(d.extras) || s(d.servicios_adicionales) || s(d.cabina),
    fechaRetorno: s(d.retorno) || s(d.fecha_retorno),
    ignorar_borrador: true,
  }, ctx, ses) as Row;
  if (creado.error || creado.ok === false) return creado;
  const actor = actorOf(ses);
  const now = ctx.now.toISOString();
  const tid = n(creado.id);
  const clave = s(creado.so_num) || s(creado.beta_num);
  if (tid) {
    await ctx.db.write(actor, "tickets", "update", { id: tid }, {
      fac: true, fac_7: String(facSeq(fac) || ""), cob: true, comp: formaAComp(b0.forma),
    });
  }
  try {
    const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
    const datos = { ...((cab?.datos || {}) as Row), factura: fac, atendio: cosm };
    if (cab) await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos, updated_at: now, actualizado_por: actor });
    else await ctx.db.write(actor, "beta_tickets", "insert", {}, { clave, datos, actualizado_por: actor, updated_at: now });
  } catch { /* overlay opcional */ }
  await ctx.db.write(actor, "beta_migo_borradores", "update", { factura: fac }, {
    estado: "aprobado", ticket_id: tid || null, ticket_clave: clave, aprobado_por: actor, aprobado_at: now, updated_at: now,
    datos: d,
  });
  await correrCuadre(ctx, actor);
  await logSafe(ctx, actor, "MIGO BORRADOR", "aprobó " + fac + " → " + clave);
  return { ok: true, ticket: creado.beta_num || clave, so_num: creado.so_num, id: tid, factura: fac };
});

export async function ofrecerBorradorMigo(ctx: Ctx, p: Row): Promise<Row | null> {
  const bor = await todas(ctx, "beta_migo_borradores");
  const hit = ofertaBorrador(bor, {
    nombre: p.nombre, apellido: p.apellido, estimado: p.estimado,
    fecha: s(p.fecha) || ecuadorParts(ctx.now).ymd, factura: p.factura || p.fac_7 || p.fac,
  });
  return hit ? pubBorrador(hit) : null;
}

export async function vincularBorradorATicket(ctx: Ctx, ses: Ses, factura: string, ticket: Row): Promise<Row> {
  const fac = facturaNorm(factura);
  const b0 = (await todas(ctx, "beta_migo_borradores")).find((x) => s(x.factura) === fac);
  if (!b0) return { error: "No encontré ese borrador" };
  if (!["pendiente", "asignado"].includes(s(b0.estado))) return { error: "Ese borrador ya no se vincula" };
  const actor = actorOf(ses);
  const now = ctx.now.toISOString();
  const clave = claveDe(ticket, leerSerie(ticket, "so_num"));
  if (n(ticket.id)) {
    await ctx.db.write(actor, "tickets", "update", { id: ticket.id }, {
      fac: true, fac_7: String(facSeq(fac) || ticket.fac_7 || ""),
    });
  }
  try {
    const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
    const datos = { ...((cab?.datos || {}) as Row), factura: fac };
    if (cab) await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos, updated_at: now, actualizado_por: actor });
    else await ctx.db.write(actor, "beta_tickets", "insert", {}, { clave, sheet_row: ticket.sheet_row ?? null, datos, actualizado_por: actor, updated_at: now });
  } catch { /* */ }
  await ctx.db.write(actor, "beta_migo_borradores", "update", { factura: fac }, {
    estado: "vinculado", ticket_id: ticket.id ?? null, ticket_clave: clave, aprobado_por: actor, aprobado_at: now, updated_at: now,
    nota: s(b0.nota) || "vinculado al crear el ticket",
  });
  await correrCuadre(ctx, actor);
  return { ok: true, vinculado: true, factura: fac, clave };
}

export { KIND_ID, pubBorrador };
