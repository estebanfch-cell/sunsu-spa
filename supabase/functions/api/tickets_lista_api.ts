// Lista de tickets rápida (hotfix Emilia 17/11: «Cargando historial…» tardaba). Solo Supabase:
// 1) índice con pocas columnas y los filtros en el servidor (conteo y subtotal exactos),
// 2) la página (50) con todas las columnas, 3) LED y marcas de esa página en lote.
// La «reagendada» por Acuity va aparte (tk_reagendadas), después de pintar, y queda en caché 10 min.
import { extend } from "./handlers.ts";
import { catMap, itemHistorial } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { conTelefono } from "./lib.ts";
import { acceso, esAdmin, esPropio, matrizDe } from "./permisos.ts";
import { colTicket, ecuadorParts, n, normCedula, normNombre, round2, s, ymdUtc, type Row } from "./domain.ts";
import { leerSerie } from "./series.ts";
import { claveDe } from "./ticket_beta.ts";
import { consultar, type Filtro } from "./query.ts";
import { faltaDe, faseA, facturaCompleta } from "./tickets_beta_api.ts";
import { esperandoFacturaLunes, exentoCuadre, fechaGye, formaDeTicket } from "./migo_cuadre.ts";
import { citaDeNombre, citasRango, fechaCita } from "./acuity.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const addD = (ymd: string, d: number) => { const t = new Date(ymd + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const IDX = ["id", "sheet_row", "timestamp", "atendido_por", "estimado", "comp", "comprobante", "cob", "fac", "fac_7", "so_num", "beta_num"];

async function verTodos(ctx: Ctx, ses: Ses): Promise<boolean> {
  return esAdmin(ses.rol) || acceso(ses.rol, "tickets", await matrizDe(ctx.db)) === "todos";
}
function hhmm(v: unknown): string { const d = new Date(s(v)); return isNaN(d.getTime()) ? "" : d.toISOString().slice(11, 16).replace(":", ""); }

extend("tk_historial", "any", async (p, ctx, ses) => {
  const t0 = Date.now();
  const todos = await verTodos(ctx, ses);
  const hoy = ecuadorParts(ctx.now).ymd;
  const q = s(p.q).trim().slice(0, 80);
  const F: Filtro[] = [{ col: "borrado_at", op: "is_null" }, { col: "timestamp", op: "not_null" }];
  // Con búsqueda se mira todo el historial (como antes); si no, el rango de fechas.
  const soloRows = (Array.isArray(p.rows) ? p.rows : []).map((x: unknown) => n(x)).filter(Boolean).slice(0, 200);
  if (soloRows.length) F.push({ col: "sheet_row", op: "in", val: soloRows });
  else if (!q) {
    if (YMD.test(s(p.desde))) F.push({ col: "timestamp", op: "gte", val: s(p.desde) + "T00:00:00" });
    if (YMD.test(s(p.hasta))) F.push({ col: "timestamp", op: "lt", val: addD(s(p.hasta), 1) + "T00:00:00" });
  }
  if (q) {
    const pal = q.split(/\s+/).filter(Boolean).slice(0, 5);
    F.push({ op: "palabras", cols: ["nombre", "apellido", "id_3", "so_num", "beta_num", "fac_7"], val: pal });
  }
  if (todos && s(p.cosm) && !q) F.push({ col: "atendido_por", op: "eq", val: s(p.cosm) });
  const est = s(p.est), seg = s(p.seg);
  if (est === "pagado") F.push({ col: "cob", op: "is_true" });
  if (est === "porcobrar") F.push({ col: "cob", op: "not_true" });
  if (est === "sinfactura") F.push({ col: "fac", op: "not_true" });
  if (est === "cerrado") F.push({ col: "fac", op: "is_true" }, { col: "cob", op: "is_true" });
  if (est === "abierto") F.push({ op: "or", de: [{ col: "fac", op: "not_true" }, { col: "cob", op: "not_true" }] });
  if (est === "anulado") F.push({ col: "orig->>anulado", op: "eq", val: "true" });
  if (seg === "pago_no") F.push({ col: "cob", op: "not_true" });
  if (seg === "reag_no") F.push({ col: "agendado", op: "not_true" });
  if (seg === "porreag") F.push({ col: "agendado", op: "not_true" }, { col: "fecha_retorno", op: "gte", val: addD(hoy, -60) }, { col: "fecha_retorno", op: "lte", val: addD(hoy, 7) + "T23:59:59" });
  const flags = (await todas(ctx, "beta_ticket_flags")).filter((f) => !f.resuelto);
  if (seg === "corregir") F.push({ col: "id", op: "in", val: flags.length ? [...new Set(flags.map((f) => n(f.ticket_id)).filter(Boolean))] : [-1] });
  const extra = seg === "rep_no" ? ["id_3", "so_num", "beta_num"] : seg === "faseA_no" ? ["facial_hecho", "notas_generales", "recomendaciones", "fotos", "fotos_antes", "fotos_despues"] : [];
  // 1) índice
  const idx = await consultar(ctx.db, "tickets", { cols: [...IDX, ...extra], filtros: F, orden: [{ col: "timestamp", desc: true }, { col: "sheet_row", desc: true }] });
  let L = idx.rows;
  if (!todos) L = L.filter((r) => esPropio(s(r.atendido_por), ses));
  if (seg === "faseA_no") L = L.filter((r) => !faseA(r));
  // Datos de la beta de todos los tickets (tabla chica): factura corregida y comprobantes subidos.
  const cabsAll = await todas(ctx, "beta_tickets");
  const cabMap = new Map(cabsAll.map((c) => [s(c.clave), c]));
  const linkByTk = new Map((await todas(ctx, "beta_cuadre_link")).map((L) => [n(L.ticket_id), L]));
  const factByFac = new Map((await todas(ctx, "beta_migo_facturas_vivo")).map((f) => [s(f.factura), f]));
  const datosDe = (r: Row) => ((cabMap.get(claveDe(r, leerSerie(r, "so_num")))?.datos || {}) as Row);
  // El comprobante de la hoja vive en orig: solo para los que parecen sin comprobante se lee orig (pocos).
  const sinComp = L.filter((r) => faltaDe(r, datosDe(r)).length > 0).map((r) => n(r.id)).filter(Boolean);
  if (sinComp.length) {
    const oo = await consultar(ctx.db, "tickets", { cols: ["id", "orig"], filtros: [{ col: "id", op: "in", val: sinComp.slice(0, 1500) }] });
    const om = new Map(oo.rows.map((x) => [n(x.id), x.orig]));
    for (const r of L) if (om.has(n(r.id))) r.comprobante = colTicket({ comprobante: r.comprobante, orig: om.get(n(r.id)) }, "comprobante");
  }
  if (seg === "faltadoc") L = L.filter((r) => faltaDe(r, datosDe(r)).length > 0);
  let envB: Set<string> | null = null;
  const envClaves = async (filas: Row[]) => {
    envB ||= new Set((await todas(ctx, "beta_ticket_envios")).map((e) => s(e.ticket_clave)));
    const ceds = [...new Set(filas.map((r) => s(r.id_3).split(".")[0]).filter(Boolean))];
    const out = new Set<string>();
    for (let i = 0; i < ceds.length; i += 150) {
      const e = await consultar(ctx.db, "envios_tarjetas", { cols: ["clave", "cedula", "fecha_del_ticket"], filtros: [{ col: "cedula", op: "in", val: ceds.slice(i, i + 150) }] });
      for (const x of e.rows) { out.add(s(x.clave)); out.add(s(x.cedula).split(".")[0] + "|" + ymdUtc(x.fecha_del_ticket)); }
    }
    return out;
  };
  const enviado = (r: Row, env: Set<string>) => {
    const ced = s(r.id_3).split(".")[0], f = ymdUtc(r.timestamp);
    return envB!.has(claveDe(r, leerSerie(r, "so_num"))) || env.has("tk_" + f + "_" + hhmm(r.timestamp) + "_" + ced) || (!!ced && env.has(ced + "|" + f));
  };
  if (seg === "rep_no") { const env = await envClaves(L); L = L.filter((r) => !enviado(r, env)); }
  // Cancelados (beta_ticket_cancelados) no suman al total de la lista.
  const canc = new Set((await todas(ctx, "beta_ticket_cancelados")).filter((c) => c.revertido !== true).map((c) => n(c.ticket_id)));
  const total = L.length, suma = round2(L.reduce((a, r) => a + (canc.has(n(r.id)) ? 0 : n(r.estimado)), 0));
  const desde = Math.max(0, n(p.offset)), lim = Math.min(200, Math.max(1, n(p.limit) || 50));
  const pagIds = L.slice(desde, desde + lim).map((r) => n(r.id));
  // 2) página completa
  const pag = pagIds.length ? (await consultar(ctx.db, "tickets", { filtros: [{ col: "id", op: "in", val: pagIds }] })).rows : [];
  const porId = new Map(pag.map((r) => [s(r.id), r]));
  const filas = pagIds.map((id) => porId.get(s(id))).filter(Boolean) as Row[];
  // 3) en lote: catálogo, teléfonos, envíos, datos beta, marcas
  const telOk = conTelefono(ses);
  const ceds = [...new Set(filas.map((r) => normCedula(r.id_3)).filter(Boolean))];
  const [map, regs, env] = await Promise.all([
    catMap(ctx),
    telOk && ceds.length ? consultar(ctx.db, "clientas_registro", { cols: ["cedula", "telefono", "timestamp"], filtros: [{ col: "cedula", op: "in", val: [...new Set(filas.map((r) => s(r.id_3)).filter(Boolean))] }] }).then((x) => x.rows).catch(() => []) : Promise.resolve([] as Row[]),
    envClaves(filas),
  ]);
  const porCed = new Map<string, string>();
  for (const r of regs.sort((a, b) => s(a.timestamp).localeCompare(s(b.timestamp)))) if (s(r.telefono)) porCed.set(normCedula(r.cedula), s(r.telefono));
  const items = filas.map((r) => {
    const it = itemHistorial(r, map, hoy, telOk, porCed);
    const clave = claveDe(r, leerSerie(r, "so_num")), d = ((cabMap.get(clave)?.datos || {}) as Row);
    const g = r.agendado === true || s(r.agendado).toLowerCase() === "true";
    const ret = s(d.retorno || s(r.fecha_retorno).slice(0, 10));
    const fl = flags.filter((x) => n(x.ticket_id) === n(r.id) || s(x.ticket_clave) === clave);
    const cob = r.cob === true || s(r.cob).toLowerCase() === "true";
    const Lnk = linkByTk.get(n(r.id));
    const inv = Lnk ? factByFac.get(s(Lnk.factura)) : undefined;
    const facTxt = s(d.factura) || (Number(s(r.fac_7)) > 0 ? s(r.fac_7) : "") || s(Lnk?.factura);
    const formaMigo = s(inv?.forma) || (d.pago_migo && typeof d.pago_migo === "object" ? s((d.pago_migo as Row).forma) : "");
    it.led = {
      a: faseA(r) ? 1 : 0, p: cob ? 1 : 0, r: enviado(r, env) ? 1 : 0, g: g ? 1 : 0, ret,
      pr: !g && it.anulado !== true && YMD.test(ret) && ret <= addD(hoy, 7) && ret >= addD(hoy, -60) ? 1 : 0,
      ...(fl.length ? { flag: fl.map((x) => s(x.motivo) + (x.factura ? " · factura " + s(x.factura) : "")).join(" / ") } : {}),
      factura: facturaCompleta(facTxt),
      ...(formaDeTicket(r, d, formaMigo) ? { forma: formaDeTicket(r, d, formaMigo) } : {}),
      ...(!cob && (d.pago_migo || Lnk) ? { pagoMigo: 1 } : {}),
      ...(!facTxt && cob && !exentoCuadre(r) && esperandoFacturaLunes(fechaGye(r.timestamp), hoy) ? { pendienteLunes: 1 } : {}),
      ...(faltaDe(r, d).length ? { falta: faltaDe(r, d) } : {}),
    };
    return it;
  });
  return { ok: true, items, total, suma, offset: desde, limit: lim, hayMas: desde + items.length < total, ms: Date.now() - t0 };
});

/** Reagendada por Acuity (próxima cita después del ticket) para las filas que se ven; caché de 10 min. */
extend("tk_reagendadas", "any", async (p, ctx, ses) => {
  const rows = (Array.isArray(p.rows) ? p.rows : []).map((x) => n(x)).filter(Boolean).slice(0, 200);
  if (!rows.length) return { ok: true, items: {} };
  const todos = await verTodos(ctx, ses);
  const hoy = ecuadorParts(ctx.now).ymd;
  const tk = (await consultar(ctx.db, "tickets", { cols: ["sheet_row", "timestamp", "nombre", "apellido", "atendido_por", "agendado"], filtros: [{ col: "sheet_row", op: "in", val: rows }] })).rows
    .filter((r) => todos || esPropio(s(r.atendido_por), ses));
  const citas = await citasRango(ctx, addD(hoy, -30), addD(hoy, 90), { ms: 600000 });
  if (!Array.isArray(citas)) return { ok: true, items: {}, acuity: false };
  const items: Record<string, Row> = {};
  for (const r of tk) {
    const f = ymdUtc(r.timestamp);
    const c = f >= addD(hoy, -120) ? citaDeNombre(citas.filter((a) => fechaCita(a) > f), s(r.nombre), s(r.apellido)) : null;
    items[String(r.sheet_row)] = { g: c ? 1 : 0, cita: c ? s(c.datetime) : "" };
  }
  return { ok: true, items, acuity: true };
});
export { normNombre };
