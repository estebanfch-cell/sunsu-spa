// 💵 Pagos + caja chica (TK19). Todo en tablas beta_* (beta_pagos, beta_caja_movimientos, beta_caja_cierres):
// la caja de la hoja (caja_chica) se LEE para arrancar con su saldo, nunca se escribe.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, guardarArchivo, logAccion } from "./lib.ts";
import { acceso, esAdmin, matrizDe } from "./permisos.ts";
import { b, n, round2, s, saldoPendiente, ymdUtc, type Row } from "./domain.ts";
import { ticketPorClave, metodosPago, agregarComprobante } from "./tickets_beta_api.ts";
import { veTicket } from "./inline_api.ts";
import { claveDe } from "./ticket_beta.ts";
import { leerSerie } from "./series.ts";
import { CATEGORIAS_GASTO, ENTRAN, ETQ_CAJA, ETQ_METODO, METODOS, SALEN, metodoLegado, montoDe, pagosDe, saldoDe } from "./pagos_caja.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
async function hay(ctx: Ctx): Promise<boolean> { try { await ctx.db.all("beta_caja_movimientos"); return true; } catch { return false; } }
const FALTA = "Falta aplicar 20261117_beta_pagos_caja.sql";
async function puedeCaja(ctx: Ctx, ses: Ses): Promise<boolean> { return esAdmin(ses.rol) || acceso(ses.rol, "caja", await matrizDe(ctx.db)) !== "no"; }
async function puedeTickets(ctx: Ctx, ses: Ses): Promise<boolean> { return esAdmin(ses.rol) || acceso(ses.rol, "tickets", await matrizDe(ctx.db)) !== "no"; }
const ec = (d: Date) => new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10);
const diaEc = (iso: unknown) => { const t = Date.parse(s(iso)); return Number.isFinite(t) ? ec(new Date(t)) : ""; };

async function movCaja(ctx: Ctx, ses: Ses, row: Row): Promise<Row> {
  const id = crypto.randomUUID();
  await ctx.db.write(actorOf(ses), "beta_caja_movimientos", "insert", {}, { id, fecha: ctx.now.toISOString(), registrado_por: s(ses.name) || actorOf(ses), ...row });
  return { id, ...row };
}
/** Saldo del ticket = total − (lo cobrado en el sistema anterior) − pagos de la beta. */
async function estadoTicket(ctx: Ctx, r: Row, total: number): Promise<Row> {
  const clave = claveDe(r, leerSerie(r, "so_num"));
  const beta = pagosDe(await todas(ctx, "beta_pagos"), clave);
  const legado = b(r.cob) ? round2(n(r.estimado)) : 0;
  const pagadoBeta = round2(beta.reduce((a, p) => a + n(p.monto), 0));
  return { clave, beta, legado, pagadoBeta, saldo: saldoPendiente(total, legado + pagadoBeta) };
}

// ---------- Pagos de tickets ----------
extend("pg_ticket", "any", async (p, ctx, ses) => {
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso para ver ese ticket" };
  const e = await estadoTicket(ctx, r, n(p.total));
  return { ok: true, ...e, metodos: METODOS.map((m) => ({ id: m, nombre: ETQ_METODO[m] })), legadoMetodos: metodosPago(r.comp), admin: esAdmin(ses.rol) };
});
extend("pg_registrar", "any", async (p, ctx, ses) => {
  if (!(await hay(ctx))) return { error: FALTA };
  if (!(await puedeTickets(ctx, ses))) return { error: "No tienes permiso" };
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso para ese ticket" };
  const metodo = s(p.metodo);
  if (!(METODOS as readonly string[]).includes(metodo)) return { error: "Elige la forma de pago" };
  const monto = montoDe(p.monto);
  if (!(monto > 0)) return { error: "Escribe el monto" };
  const total = n(p.total);
  const e = await estadoTicket(ctx, r, total);
  if (total > 0 && monto > n(e.saldo) + 0.009 && p.forzar !== true) return { error: "El pago ($" + monto.toFixed(2) + ") es mayor que el saldo ($" + n(e.saldo).toFixed(2) + ")", mayor: true };
  const ref = s(p.ref).trim().slice(0, 80);
  if ((metodo === "tarjeta" || metodo === "transferencia" || metodo === "deuna") && !ref) return { error: "Escribe el número de voucher / comprobante" };
  // TK42: tarjeta y transferencia piden también la foto del voucher / comprobante (misma bodega que tk_subir_doc).
  let fotoUrl = "";
  if (metodo === "tarjeta" || metodo === "transferencia") {
    if (!/^data:(image\/|application\/pdf)/.test(s(p.imagen))) return { error: metodo === "tarjeta" ? "Toma la foto del voucher de la tarjeta" : "Toma la foto del comprobante de la transferencia", foto: true };
    const f = await agregarComprobante(ctx, ses, r, p.imagen, e.clave + " · " + (ETQ_METODO[metodo] || metodo) + " " + ref, "subió comprobante (cobro en Caja)");
    if (f.error) return f;
    fotoUrl = s(f.url);
  }
  const id = crypto.randomUUID();
  const actor = actorOf(ses), quien = s(ses.name) || actor;
  const cliente = [s(r.nombre), s(r.apellido)].filter(Boolean).join(" ");
  let caja_mov_id: string | null = null;
  if (metodo === "efectivo") {
    const m = await movCaja(ctx, ses, { tipo: "efectivo_ticket", entrada: monto, salida: 0, detalle: "Ticket " + e.clave + (cliente ? " · " + cliente : ""), quien: s(r.atendido_por) || quien, ref: "PAGO:" + id });
    caja_mov_id = s(m.id);
  }
  await ctx.db.write(actor, "beta_pagos", "insert", {}, { id, ticket_clave: e.clave, ticket_id: r.id ?? null, fecha: ctx.now.toISOString(), metodo, monto, ref: ref || null, nota: (s(p.nota).trim().slice(0, 300) || (fotoUrl ? "foto " + fotoUrl : "")) || null, registrado_por: quien, caja_mov_id });
  await logAccion(ctx.db, actor, "PAGO REGISTRAR", e.clave + " · " + ETQ_METODO[metodo] + " $" + monto.toFixed(2) + (ref ? " · " + ref : ""));
  return { ok: true, id, saldo: saldoPendiente(n(e.saldo), monto) };
});
extend("pg_anular", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin anula pagos" };
  const motivo = s(p.motivo).trim();
  if (!motivo) return { error: "Escribe el motivo" };
  const pg = (await todas(ctx, "beta_pagos")).find((x) => s(x.id) === s(p.id));
  if (!pg) return { error: "Pago no encontrado" };
  if (pg.anulado === true) return { error: "Ya estaba anulado" };
  const now = ctx.now.toISOString(), actor = actorOf(ses);
  await ctx.db.write(actor, "beta_pagos", "update", { id: s(pg.id) }, { anulado: true, anulado_por: s(ses.name) || actor, anulado_motivo: motivo, anulado_at: now });
  if (s(pg.caja_mov_id)) await ctx.db.write(actor, "beta_caja_movimientos", "update", { id: s(pg.caja_mov_id) }, { anulado: true, anulado_por: s(ses.name) || actor, anulado_motivo: "Pago anulado: " + motivo, anulado_at: now });
  await logAccion(ctx.db, actor, "PAGO ANULAR", s(pg.ticket_clave) + " · $" + n(pg.monto).toFixed(2) + " · " + motivo);
  return { ok: true };
});
/** Pagos recibidos en un rango: los de la beta y, del sistema anterior, los tickets cobrados con su forma de pago. */
extend("pg_lista", "any", async (p, ctx, ses) => {
  if (!(await puedeCaja(ctx, ses))) return { error: "No tienes permiso" };
  const hoy = ec(ctx.now);
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(s(p.desde)) ? s(p.desde) : hoy, hasta = /^\d{4}-\d{2}-\d{2}$/.test(s(p.hasta)) ? s(p.hasta) : hoy;
  const beta = (await todas(ctx, "beta_pagos")).filter((x) => { const d = diaEc(x.fecha); return d >= desde && d <= hasta; })
    .map((x) => ({ id: s(x.id), fuente: "beta", fecha: s(x.fecha), clave: s(x.ticket_clave), metodo: s(x.metodo), monto: n(x.monto), ref: s(x.ref), por: s(x.registrado_por), anulado: x.anulado === true, motivo: s(x.anulado_motivo) }));
  const conBeta = new Set(beta.map((x) => x.clave));
  const legado: Row[] = [];
  for (const t of await todas(ctx, "tickets")) {
    if (t.borrado_at || !b(t.cob)) continue;
    const d = ymdUtc(t.timestamp); if (d < desde || d > hasta) continue;
    const clave = claveDe(t, leerSerie(t, "so_num"));
    if (conBeta.has(clave)) continue;
    const ms = metodosPago(t.comp);
    legado.push({ fuente: "sistema", fecha: s(t.timestamp), clave, metodo: metodoLegado(ms), monto: round2(n(t.estimado)), ref: ms.map((m) => s(m.ref)).filter(Boolean).join(", "), por: s(t.atendido_por), cliente: [s(t.nombre), s(t.apellido)].filter(Boolean).join(" ") });
  }
  const items = [...beta, ...legado].sort((a, b0) => s(b0.fecha).localeCompare(s(a.fecha)));
  const tot = new Map<string, number>();
  for (const x of items) if (!x.anulado) tot.set(s(x.metodo), round2((tot.get(s(x.metodo)) || 0) + n(x.monto)));
  return { ok: true, desde, hasta, items, totales: [...tot.entries()].map(([m, v]) => ({ metodo: m, nombre: ETQ_METODO[m] || m, total: v })).sort((a, b0) => b0.total - a.total), total: round2([...tot.values()].reduce((a, v) => a + v, 0)), etiquetas: ETQ_METODO, admin: esAdmin(ses.rol) };
});

// ---------- Caja chica ----------
async function saldoHoja(ctx: Ctx): Promise<{ saldo: number; fecha: string } | null> {
  const L = (await todas(ctx, "caja_chica")).sort((a, b0) => n(a.sheet_row) - n(b0.sheet_row));
  const u = L[L.length - 1];
  return u ? { saldo: round2(n(u.saldo)), fecha: s(u.fecha_hora) } : null;
}
extend("cj_resumen", "any", async (p, ctx, ses) => {
  if (!(await puedeCaja(ctx, ses))) return { error: "No tienes permiso" };
  if (!(await hay(ctx))) return { error: FALTA };
  const movs = await todas(ctx, "beta_caja_movimientos");
  const hoy = ec(ctx.now);
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(s(p.desde)) ? s(p.desde) : hoy, hasta = /^\d{4}-\d{2}-\d{2}$/.test(s(p.hasta)) ? s(p.hasta) : hoy;
  const orden = movs.slice().sort((a, b0) => s(a.fecha).localeCompare(s(b0.fecha)));
  let acc = 0;
  const conSaldo: Row[] = orden.map((m: Row): Row => { if (m.anulado !== true) acc = round2(acc + n(m.entrada) - n(m.salida)); return { ...m, saldo: acc }; });
  const rango = conSaldo.filter((m) => { const d = diaEc(m.fecha); return d >= desde && d <= hasta; }).reverse();
  const porTipo = new Map<string, { entrada: number; salida: number }>();
  for (const m of rango) { if (m.anulado === true) continue; const k = s(m.tipo); const x = porTipo.get(k) || { entrada: 0, salida: 0 }; x.entrada = round2(x.entrada + n(m.entrada)); x.salida = round2(x.salida + n(m.salida)); porTipo.set(k, x); }
  const cierres = (await todas(ctx, "beta_caja_cierres")).sort((a, b0) => s(b0.fecha).localeCompare(s(a.fecha))).slice(0, 15);
  return {
    ok: true, admin: esAdmin(ses.rol), iniciada: movs.some((m) => s(m.tipo) === "apertura" && m.anulado !== true), saldo: saldoDe(movs), desde, hasta,
    movimientos: rango.map((m) => ({ id: s(m.id), fecha: s(m.fecha), tipo: s(m.tipo), etiqueta: ETQ_CAJA[s(m.tipo)] || s(m.tipo), categoria: s(m.categoria), entrada: n(m.entrada), salida: n(m.salida), saldo: n(m.saldo), detalle: s(m.detalle), quien: s(m.quien), por: s(m.registrado_por), ref: s(m.ref), comprobante: !!s(m.comprobante_id), anulado: m.anulado === true, motivo: s(m.anulado_motivo) })),
    porTipo: [...porTipo.entries()].map(([t, v]) => ({ tipo: t, etiqueta: ETQ_CAJA[t] || t, ...v })),
    cierres: cierres.map((c) => ({ fecha: s(c.fecha), saldo_sistema: n(c.saldo_sistema), contado: n(c.contado), diferencia: n(c.diferencia), nota: s(c.nota), por: s(c.cerrado_por) })),
    hoja: await saldoHoja(ctx), categorias: CATEGORIAS_GASTO,
  };
});
extend("cj_iniciar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin abre la caja" };
  if (!(await hay(ctx))) return { error: FALTA };
  const movs = await todas(ctx, "beta_caja_movimientos");
  if (movs.some((m) => s(m.tipo) === "apertura" && m.anulado !== true)) return { error: "La caja ya está abierta" };
  let monto: number, detalle: string;
  if (p.desdeHoja === true) {
    const h = await saldoHoja(ctx);
    if (!h) return { error: "La hoja no tiene caja" };
    monto = h.saldo; detalle = "Saldo de la caja de la hoja al " + h.fecha;
  } else {
    monto = Number(String(p.monto ?? "").replace(",", "."));
    if (!(monto >= 0)) return { error: "Monto inválido" };
    monto = round2(monto); detalle = s(p.detalle).trim() || "Apertura de la caja beta";
  }
  const m = await movCaja(ctx, ses, { tipo: "apertura", entrada: monto, salida: 0, detalle, quien: s(ses.name) });
  await logAccion(ctx.db, actorOf(ses), "CAJA APERTURA", "$" + monto.toFixed(2) + " · " + detalle);
  return { ok: true, id: m.id, saldo: monto };
});
extend("cj_mov", "any", async (p, ctx, ses) => {
  if (!(await puedeCaja(ctx, ses))) return { error: "No tienes permiso" };
  if (!(await hay(ctx))) return { error: FALTA };
  const tipo = s(p.tipo);
  if (!SALEN.has(tipo) && !ENTRAN.has(tipo)) return { error: "Tipo inválido" };
  const movs = await todas(ctx, "beta_caja_movimientos");
  if (!movs.some((m) => s(m.tipo) === "apertura" && m.anulado !== true)) return { error: "Primero un admin abre la caja" };
  const monto = montoDe(p.monto);
  if (!(monto > 0)) return { error: "Escribe el monto" };
  const detalle = s(p.detalle).trim().slice(0, 300);
  if (!detalle) return { error: "Escribe el detalle / justificativo" };
  const quien = s(p.quien).trim().slice(0, 80) || s(ses.name);
  const categoria = tipo === "gasto" ? (CATEGORIAS_GASTO.includes(s(p.categoria)) ? s(p.categoria) : "Otros") : null;
  if (SALEN.has(tipo)) { const sd = saldoDe(movs); if (monto > sd + 0.009) return { error: "Fondos insuficientes: la caja tiene $" + sd.toFixed(2) }; }
  let comprobante_id: string | null = null;
  const img = s(p.comprobante);
  if (img) {
    if (!/^data:(image\/|application\/pdf)/.test(img)) return { error: "El comprobante debe ser foto o PDF" };
    comprobante_id = await guardarArchivo(ctx.db, actorOf(ses), "caja", "Caja " + tipo + " " + ec(ctx.now), img);
    if (!comprobante_id) return { error: "El comprobante pesa más de 1.5 MB" };
  }
  const m = await movCaja(ctx, ses, { tipo, categoria, entrada: ENTRAN.has(tipo) ? monto : 0, salida: SALEN.has(tipo) ? monto : 0, detalle, quien, comprobante_id });
  await logAccion(ctx.db, actorOf(ses), "CAJA " + tipo.toUpperCase(), "$" + monto.toFixed(2) + " · " + detalle);
  return { ok: true, id: m.id, saldo: saldoDe([...movs, m]) };
});
extend("cj_cuadre", "any", async (p, ctx, ses) => {
  if (!(await puedeCaja(ctx, ses))) return { error: "No tienes permiso" };
  if (!(await hay(ctx))) return { error: FALTA };
  const contado = Number(String(p.contado ?? "").replace(",", "."));
  if (!(contado >= 0)) return { error: "Escribe lo que contaste" };
  const movs = await todas(ctx, "beta_caja_movimientos");
  if (!movs.some((m) => s(m.tipo) === "apertura" && m.anulado !== true)) return { error: "Primero un admin abre la caja" };
  const sistema = saldoDe(movs), dif = round2(contado - sistema), nota = s(p.nota).trim().slice(0, 300);
  if (Math.abs(dif) >= 0.01 && !nota) return { error: "Hay diferencia de $" + dif.toFixed(2) + ": escribe una nota" };
  let ajuste_id: string | null = null;
  if (Math.abs(dif) >= 0.01) {
    const m = await movCaja(ctx, ses, { tipo: "cuadre", entrada: dif > 0 ? dif : 0, salida: dif < 0 ? -dif : 0, detalle: "Cuadre: contado $" + round2(contado).toFixed(2) + " · " + nota, quien: s(ses.name) });
    ajuste_id = s(m.id);
  }
  await ctx.db.write(actorOf(ses), "beta_caja_cierres", "insert", {}, { id: crypto.randomUUID(), fecha: ctx.now.toISOString(), saldo_sistema: sistema, contado: round2(contado), diferencia: dif, ajuste_id, nota: nota || null, cerrado_por: s(ses.name) || actorOf(ses) });
  await logAccion(ctx.db, actorOf(ses), "CAJA CUADRE", "sistema $" + sistema.toFixed(2) + " · contado $" + round2(contado).toFixed(2) + " · dif $" + dif.toFixed(2));
  return { ok: true, sistema, contado: round2(contado), diferencia: dif };
});
extend("cj_anular", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin anula movimientos" };
  const motivo = s(p.motivo).trim();
  if (!motivo) return { error: "Escribe el motivo" };
  const m = (await todas(ctx, "beta_caja_movimientos")).find((x) => s(x.id) === s(p.id));
  if (!m) return { error: "Movimiento no encontrado" };
  if (m.anulado === true) return { error: "Ya estaba anulado" };
  if (s(m.tipo) === "efectivo_ticket") return { error: "Este efectivo viene de un pago de ticket: anula el pago en el ticket" };
  await ctx.db.write(actorOf(ses), "beta_caja_movimientos", "update", { id: s(m.id) }, { anulado: true, anulado_por: s(ses.name) || actorOf(ses), anulado_motivo: motivo, anulado_at: ctx.now.toISOString() });
  await logAccion(ctx.db, actorOf(ses), "CAJA ANULAR", (ETQ_CAJA[s(m.tipo)] || s(m.tipo)) + " $" + (n(m.entrada) || n(m.salida)).toFixed(2) + " · " + motivo);
  return { ok: true };
});
extend("cj_comprobante", "any", async (p, ctx, ses) => {
  if (!(await puedeCaja(ctx, ses))) return { error: "No tienes permiso" };
  const m = (await todas(ctx, "beta_caja_movimientos")).find((x) => s(x.id) === s(p.id));
  if (!m || !s(m.comprobante_id)) return { error: "Sin comprobante" };
  const a = (await todas(ctx, "app_archivos")).find((x) => s(x.id) === s(m.comprobante_id));
  if (!a) return { error: "Archivo no encontrado" };
  return { ok: true, url: "data:" + (s(a.mime) || "image/jpeg") + ";base64," + s(a.data_b64) };
});
