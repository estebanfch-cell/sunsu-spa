// TK116: conteo general por secciones (sububicaciones), como MineCore cc_sec_*.
// Al INICIAR se toma el snapshot (sistema). Mientras está abierta, el esperado
// se recalcula en vivo (snapshot + movimientos de venta/traslado/recepción/ajuste
// durante el conteo = stock vivo). Al TERMINAR se fija ese esperado.
// Aprobar no mueve stock. Nunca se exponen costos.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { n, round2, s, skuCode, type Row } from "./domain.ts";
import { BOD_CABINA, BOD_CASA, BOD_VENTA, grupoDeBodega } from "./productos.ts";
import { listaProductos } from "./productos_api.ts";
import { bodegaNombre, notificar, sistemaDe, ESTADOS_CONTEO, subsDe } from "./conteo_fisico_api.ts";

export const ESTADOS_SECCION: Record<string, string> = {
  pendiente: "Pendiente", en_conteo: "Contando", en_revision: "En revisión", aprobada: "Aprobada", cancelada: "Cancelada",
};

const FALTA_SEC = "Falta aplicar 20261119_tk116_conteo_secciones.sql";

const TIPO_MOV: Record<string, string> = {
  venta: "Venta", so_pick: "Venta", ticket: "Venta",
  transferencia: "Traslado", transfer: "Traslado", transfer_out: "Traslado", transfer_in: "Traslado",
  ajuste: "Ajuste", adjust: "Ajuste",
  recepcion: "Recepción", recepción: "Recepción", po_receive: "Recepción",
  po_unstock: "Reverso de recepción",
  anulacion: "Devolución", anulación: "Devolución", so_restock: "Devolución",
  conteo: "Conteo", count: "Conteo",
};

async function todas(ctx: Ctx, t: string): Promise<Row[]> {
  try { return await ctx.db.all(t); } catch { return []; }
}
function yo(ses: Ses): string { return s(ses.uid); }
function esAsignada(c: Row, ses: Ses): boolean { return !!s(c.asignado_a) && s(c.asignado_a) === yo(ses); }

export function plantillaSecciones(): { bodega: string; sub: string; nombre: string; orden: number }[] {
  return [
    { bodega: "CONSIGNACION", sub: "", nombre: "Venta", orden: 1 },
    { bodega: "OFICINA", sub: "", nombre: "Bodega Oficina", orden: 2 },
    { bodega: "CABINA", sub: "CABINA_1", nombre: "Cabina 1", orden: 3 },
    { bodega: "CABINA", sub: "CABINA_2", nombre: "Cabina 2", orden: 4 },
    { bodega: "CABINA", sub: "CABINA_3", nombre: "Cabina 3", orden: 5 },
  ];
}


export type PlantillaSec = { id?: string; bodega: string; sub: string; nombre: string; orden: number; prefijos?: string[] };

/** Bodegas y cabinas del local (no son secciones de conteo). Sirven para «Crear sububicación». */
export function lugaresBodega(): { bodega: string; sububicacion: string; nombre: string }[] {
  return plantillaSecciones().map((x) => ({ bodega: x.bodega, sububicacion: x.sub, nombre: x.nombre }));
}

async function hayZonas(ctx: Ctx): Promise<boolean> {
  try { await ctx.db.all("beta_conteo_zonas"); return true; } catch { return false; }
}
async function haySubs(ctx: Ctx): Promise<boolean> {
  try { await ctx.db.all("beta_sububicaciones"); return true; } catch { return false; }
}

/** Secciones activas del catálogo (⚙ Secciones). Vacío si el admin aún no creó ninguna. */
export async function plantillaViva(ctx: Ctx): Promise<PlantillaSec[]> {
  if (!(await hayZonas(ctx))) return [];
  const Z = (await todas(ctx, "beta_conteo_zonas")).filter((z) => z.activo !== false)
    .sort((a, b) => n(a.orden) - n(b.orden) || s(a.nombre).localeCompare(s(b.nombre), "es"));
  return Z.map((z) => ({ id: s(z.id), bodega: s(z.bodega), sub: s(z.sububicacion), nombre: s(z.nombre), orden: n(z.orden), prefijos: Array.isArray(z.prefijos) ? z.prefijos.map((x) => s(x)) : [] }));
}

function esCodigoCabina(sub: string): boolean {
  return /^CABINA_?\d+$/i.test(s(sub).trim());
}
function normSub(sub: string): string {
  const u = s(sub).trim();
  const m = u.toUpperCase().replace(/\s+/g, "_").match(/^CABINA_?(\d+)$/);
  return m ? "CABINA_" + m[1] : u;
}
export function coincidePrefijo(sub: string, prefijos: string[]): boolean {
  if (!prefijos.length) return true;
  const code = normSub(sub);
  const vacio = !code || esCodigoCabina(code);
  for (const p of prefijos) {
    const pr = s(p).trim().toUpperCase();
    if (!pr) continue;
    if (pr === "=") { if (vacio) return true; continue; }
    if (!vacio && code.toUpperCase().startsWith(pr)) return true;
  }
  return false;
}
export function sistemaEstante(p: Row, bodega: string, sub: string): number {
  const est = p.porEstante as Row | undefined;
  if (est) return n(est[s(bodega).toUpperCase() + "|" + normSub(sub)]);
  return sistemaDe(p, bodega, sub);
}
function etiquetaFromSub(sub: string, bodega: string, nombreSec: string): string {
  const code = normSub(sub);
  if (code && !esCodigoCabina(code)) return code;
  return bodegaNombre(bodega, esCodigoCabina(code) ? code : "") || nombreSec;
}
function levelsDe(p: Row, bodega: string, padre: string): { sub: string; q: number }[] {
  const est = (p.porEstante || {}) as Row;
  const out: { sub: string; q: number }[] = [];
  const keys = Object.keys(est);
  for (const k of keys) {
    const i = k.indexOf("|");
    if (i < 0) continue;
    const g = k.slice(0, i), sub = k.slice(i + 1);
    if (g !== bodega) continue;
    if (padre) {
      if (normSub(sub) !== normSub(padre) && sub !== "") {
        // estante: se filtra luego por catálogo padre en el iniciador
        out.push({ sub, q: n(est[k]) });
        continue;
      }
      if (normSub(sub) === normSub(padre) || sub === "") out.push({ sub: padre, q: n(est[k]) });
      continue;
    }
    out.push({ sub, q: n(est[k]) });
  }
  if (!out.length) {
    const q = sistemaDe(p, bodega, padre);
    if (Math.abs(q) > 1e-9) out.push({ sub: padre || "", q });
  }
  return out.filter((x) => Math.abs(x.q) > 1e-9);
}


export function mismoLugar(bodega: string, sub: string, bod: string, sb: string): boolean {
  if (s(bodega).toUpperCase() !== s(bod).toUpperCase()) return false;
  return normSub(sub) === normSub(sb);
}

/** El personal (con acceso al módulo) o un admin pueden retomar un conteo general abierto. */
export function puedeOperarGeneral(c: Row, ses: Ses, verModulo: boolean): boolean {
  if (esAdmin(ses.rol)) return true;
  if (!verModulo) return false;
  if (s(c.tipo) === "general" && ["asignado", "en_conteo"].includes(s(c.estado))) return true;
  return esAsignada(c, ses);
}

function mapaBodegaId(id: string, sub: string): { grupo: string; sub: string } {
  const g = grupoDeBodega({ id }, sub);
  return { grupo: g.grupo, sub: g.sub };
}

function enVentana(at: string, desde: string, hasta: string): boolean {
  if (!at || !desde) return false;
  if (at < desde) return false;
  if (hasta && at > hasta) return false;
  return true;
}

function etiquetaMov(tipo: string): string {
  const k = s(tipo).toLowerCase();
  return TIPO_MOV[k] || (s(tipo) ? s(tipo) : "Movimiento");
}

/** Movimientos de venta, traslado, recepción o ajuste durante el conteo. Sin costos. */
export async function movimientosDurante(ctx: Ctx, productoId: string, bodega: string, sub: string, desde: string, hasta: string): Promise<Row[]> {
  const out: Row[] = [];
  for (const m of await todas(ctx, "beta_stock_movimientos")) {
    if (s(m.producto_id) !== productoId) continue;
    if (!mismoLugar(bodega, sub, s(m.bodega), s(m.sububicacion))) continue;
    const at = s(m.fecha || m.created_at || m.at);
    if (!enVentana(at, desde, hasta)) continue;
    out.push({
      sku: s(m.sku), sub: s(m.sububicacion) || bodegaNombre(bodega, sub), kind: s(m.tipo),
      label: etiquetaMov(s(m.tipo)), delta: n(m.delta), at, actor: s(m.actor), doc: s(m.doc_numero),
    });
  }
  for (const m of await todas(ctx, "erp_movimientos")) {
    if (s(m.producto_id) !== productoId) continue;
    const g = mapaBodegaId(s(m.bodega_id), s(m.sububicacion));
    // BCONSIG no entra en las secciones del conteo general.
    if (g.grupo === "BCONSIG" || g.grupo === "OTRA") continue;
    if (!mismoLugar(bodega, sub, g.grupo, g.sub || s(m.sububicacion))) continue;
    const at = s(m.fecha || m.created_at || m.at);
    if (!enVentana(at, desde, hasta)) continue;
    out.push({
      sku: s(m.sku) || "", sub: g.sub || s(m.sububicacion) || bodegaNombre(bodega, sub), kind: s(m.tipo),
      label: etiquetaMov(s(m.tipo)), delta: n(m.delta), at, actor: s(m.actor), doc: s(m.ticket_ref || m.doc_id),
    });
  }
  out.sort((a, b) => s(a.at).localeCompare(s(b.at)));
  return out;
}

export function esperadoVivo(sistema: number, movs: Row[], esperadoFijo: unknown, cerrado: boolean): number {
  if (cerrado && esperadoFijo != null && esperadoFijo !== "") return n(esperadoFijo);
  const mov = movs.reduce((a, m) => a + n(m.delta), 0);
  return round2(n(sistema) + mov);
}

async function cargarDoc(ctx: Ctx, id: string): Promise<Row | null> {
  return (await todas(ctx, "beta_conteos")).find((x) => s(x.id) === id || s(x.numero) === id) || null;
}
async function secsDe(ctx: Ctx, conteoId: string): Promise<Row[]> {
  return (await todas(ctx, "beta_conteo_secciones")).filter((x) => s(x.conteo_id) === conteoId).sort((a, b) => n(a.orden) - n(b.orden));
}
async function lineasDe(ctx: Ctx, seccionId: string): Promise<Row[]> {
  return (await todas(ctx, "beta_conteo_lineas")).filter((x) => s(x.seccion_id) === seccionId);
}

async function resumenSec(ctx: Ctx, sec: Row): Promise<Row> {
  const L = await lineasDe(ctx, s(sec.id));
  const contadas = L.filter((l) => l.contado != null && l.contado !== "" || s(l.estado) === "no_encontrado" || s(l.otra_sub)).length;
  return {
    id: sec.id, bodega: s(sec.bodega), sububicacion: s(sec.sububicacion),
    nombre: s(sec.nombre), orden: n(sec.orden), estado: s(sec.estado), estadoNombre: ESTADOS_SECCION[s(sec.estado)] || s(sec.estado),
    iniciadoAt: s(sec.iniciado_at), cerradoAt: s(sec.cerrado_at),
    lineas: L.length, contadas, pendientes: Math.max(0, L.length - contadas),
    contLabel: s(sec.estado) === "pendiente" ? "—" : (contadas + "/" + L.length),
  };
}

async function haySecciones(ctx: Ctx): Promise<boolean> {
  try { await ctx.db.all("beta_conteo_secciones"); return true; } catch { return false; }
}

extend("cf_secciones_meta", "any", async (_p, ctx, ses) => {
  if (!(await haySecciones(ctx))) return { ok: true, listo: false, falta: FALTA_SEC, secciones: await plantillaViva(ctx), admin: esAdmin(ses.rol) };
  return { ok: true, listo: true, admin: esAdmin(ses.rol), secciones: await plantillaViva(ctx) };
});

extend("cf_crear_general", "any", async (p, ctx, ses) => {
  if (!(await haySecciones(ctx))) return { error: FALTA_SEC };
  const plantilla = await plantillaViva(ctx);
  if (!plantilla.length) return { error: "Primero crea secciones en ⚙ Secciones." };
  const rows = await todas(ctx, "beta_conteos");
  const abierto = rows.find((c) => s(c.tipo) === "general" && ["asignado", "en_conteo", "en_revision"].includes(s(c.estado)));
  if (abierto && p.forzar !== true) return { error: "Ya hay un conteo general abierto (" + s(abierto.numero) + "). Termínalo o cancélalo antes." };
  let asignado = s(p.asignado_a);
  if (!esAdmin(ses.rol)) {
    if (asignado && asignado !== yo(ses)) return { error: "Solo puedes crear un conteo para ti" };
    asignado = yo(ses);
  }
  const u = (await todas(ctx, "usuarios")).find((x) => s(x.id) === asignado) || (await todas(ctx, "app_usuarios")).find((x) => s(x.id ?? x.usuario) === asignado);
  if (!u) return { error: esAdmin(ses.rol) ? "Asigna a quién cuenta" : "No se encontró tu usuario" };
  const nombre = s(u.short) || s(u.nombre);
  let max = 0;
  for (const r of rows) { const m = s(r.numero).match(/^CF-(\d+)$/); if (m) max = Math.max(max, Number(m[1])); }
  const id = crypto.randomUUID(), numero = "CF-" + String(max + 1).padStart(3, "0"), actor = actorOf(ses), now = ctx.now.toISOString();
  await ctx.db.write(actor, "beta_conteos", "insert", {}, {
    id, numero, tipo: "general", bodega: "TODAS", sububicacion: null,
    asignado_a: asignado, asignado_nombre: nombre, estado: "en_conteo",
    nota: s(p.nota).slice(0, 500) || null, creado_por: actor, creado_at: now,
  });
  for (const pl of plantilla) {
    await ctx.db.write(actor, "beta_conteo_secciones", "insert", {}, {
      id: crypto.randomUUID(), conteo_id: id, bodega: pl.bodega, sububicacion: pl.sub || null,
      nombre: pl.nombre, orden: pl.orden, estado: "pendiente", zona_id: pl.id || null, updated_at: now,
    });
  }
  await notificar(ctx, ses, asignado, "Conteo general: " + numero, "Te asignaron el conteo físico general. Puedes guardar, salir y volver; otra persona del equipo también puede retomarlo.", "#/m/conteos/cf/" + id, id);
  return { ok: true, id, numero };
});

extend("cf_get_general", "any", async (p, ctx, ses) => {
  const c = await cargarDoc(ctx, s(p.id));
  if (!c) return { error: "Conteo no encontrado" };
  if (s(c.tipo) !== "general") return { error: "Este conteo no es general" };
  const admin = esAdmin(ses.rol);
  if (!admin && !esAsignada(c, ses) && s(c.estado) === "cancelado") return { error: "No tienes permiso" };
  const secs = await secsDe(ctx, s(c.id));
  const secciones = [];
  for (const sec of secs) secciones.push(await resumenSec(ctx, sec));
  const ap = secciones.filter((x) => x.estado === "aprobada").length;
  const rv = secciones.filter((x) => x.estado === "en_revision").length;
  const hoy = (ctx.now.toISOString() || "").slice(0, 10);
  const plan = (await todas(ctx, "beta_conteo_plan")).find((x) => s(x.conteo_id) === s(c.id) && s(x.fecha).slice(0, 10) === hoy);
  const hoySec = plan ? secciones.find((x) => s(x.id) === s(plan.seccion_id)) : null;
  return {
    ok: true, admin,
    conteo: {
      id: c.id, numero: c.numero, tipo: "general", estado: s(c.estado), estadoNombre: ESTADOS_CONTEO[s(c.estado)] || s(c.estado),
      asignadoA: s(c.asignado_a), asignadoNombre: s(c.asignado_nombre),
      creadoAt: s(c.creado_at), nota: s(c.nota),
      aprobadas: ap, total: secciones.length, porRevisar: rv,
      hoyToca: hoySec ? hoySec.nombre : "", hoySeccionId: hoySec ? hoySec.id : "",
    },
    secciones,
    puedeOperar: puedeOperarGeneral(c, ses, true),
  };
});

extend("cf_asignar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin reasigna" };
  const c = await cargarDoc(ctx, s(p.id));
  if (!c) return { error: "Conteo no encontrado" };
  const asignado = s(p.asignado_a);
  const u = (await todas(ctx, "usuarios")).find((x) => s(x.id) === asignado);
  if (!u) return { error: "Elige a quién se lo asignas" };
  const nombre = s(u.short) || s(u.nombre);
  await ctx.db.write(actorOf(ses), "beta_conteos", "update", { id: c.id }, { asignado_a: asignado, asignado_nombre: nombre, updated_at: ctx.now.toISOString() });
  await notificar(ctx, ses, asignado, "Conteo reasignado: " + s(c.numero), "Te asignaron este conteo. Puedes guardar, salir y volver.", "#/m/conteos/cf/" + s(c.id), s(c.id));
  return { ok: true };
});

extend("cf_plan_hoy", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin arma el plan" };
  if (!(await haySecciones(ctx))) return { error: FALTA_SEC };
  const c = await cargarDoc(ctx, s(p.id));
  if (!c) return { error: "Conteo no encontrado" };
  const fecha = (s(p.fecha) || ctx.now.toISOString()).slice(0, 10);
  const seccionId = s(p.seccion_id);
  if (seccionId && !(await secsDe(ctx, s(c.id))).some((x) => s(x.id) === seccionId)) return { error: "Sección inválida" };
  const ya = (await todas(ctx, "beta_conteo_plan")).find((x) => s(x.conteo_id) === s(c.id) && s(x.fecha).slice(0, 10) === fecha);
  const actor = actorOf(ses);
  if (ya) {
    await ctx.db.write(actor, "beta_conteo_plan", "update", { id: ya.id }, { seccion_id: seccionId || null });
  } else {
    await ctx.db.write(actor, "beta_conteo_plan", "insert", {}, {
      id: crypto.randomUUID(), conteo_id: c.id, seccion_id: seccionId || null, fecha, created_por: actor, created_at: ctx.now.toISOString(),
    });
  }
  return { ok: true, fecha, seccion_id: seccionId };
});

async function cargarSec(ctx: Ctx, id: string): Promise<{ c: Row; s: Row } | null> {
  const sec = (await todas(ctx, "beta_conteo_secciones")).find((x) => s(x.id) === id);
  if (!sec) return null;
  const c = await cargarDoc(ctx, s(sec.conteo_id));
  if (!c) return null;
  return { c, s: sec };
}

extend("cf_sec_get", "any", async (p, ctx, ses) => {
  const r = await cargarSec(ctx, s(p.id));
  if (!r) return { error: (await haySecciones(ctx)) ? "Sección no encontrada" : FALTA_SEC };
  const admin = esAdmin(ses.rol);
  const operar = puedeOperarGeneral(r.c, ses, true);
  const L = await lineasDe(ctx, s(r.s.id));
  const cerrado = ["en_revision", "aprobada"].includes(s(r.s.estado));
  const desde = s(r.s.iniciado_at), hasta = s(r.s.cerrado_at);
  const prods = s(r.s.estado) === "pendiente" ? [] : await listaProductos(ctx, ses);
  const porId = new Map(prods.map((x) => [s(x.id), x]));
  const lineas = [];
  const recs: Row[] = [];
  const otros: Row[] = [];
  const catalogoSubs = (await haySubs(ctx)) ? await todas(ctx, "beta_sububicaciones") : [];
  for (const lg of lugaresBodega()) {
    otros.push({ id: lg.bodega + ":" + lg.sububicacion, bodega: lg.bodega, sub: lg.sububicacion, nombre: lg.nombre, crear: false });
  }
  for (const su of catalogoSubs) {
    if (su.activo === false) continue;
    otros.push({ id: s(su.bodega) + ":" + s(su.codigo), bodega: s(su.bodega), sub: s(su.codigo), nombre: s(su.nombre) || s(su.codigo), padre: s(su.padre), crear: false });
  }
  for (const l of L) {
    const subLin = s(l.sububicacion);
    const movs = desde ? await movimientosDurante(ctx, s(l.producto_id), s(r.s.bodega), subLin, desde, hasta) : [];
    if (!s(movs[0] ? movs[0].sku : "") && movs.length) {
      for (const m of movs) if (!m.sku) m.sku = s(l.sku);
    }
    const pr = porId.get(s(l.producto_id));
    const vivo = pr ? sistemaEstante(pr, s(r.s.bodega), subLin) : n(l.sistema) + movs.reduce((a, m) => a + n(m.delta), 0);
    // MineCore: esperado abierto = snapshot + mov (= stock vivo). Si hay foto de cierre, se usa esa.
    const esp = cerrado ? esperadoVivo(n(l.sistema), movs, l.esperado, true) : round2(vivo);
    const mov = movs.reduce((a, m) => a + n(m.delta), 0);
    for (const m of movs) recs.push({ ...m, sku: s(m.sku) || s(l.sku), lineaId: l.id });
    const otrasUnids: Row[] = [];
    for (const o of otros) {
      if (mismoLugar(s(r.s.bodega), subLin, s(o.bodega), s(o.sub))) continue;
      const q = pr ? sistemaEstante(pr, s(o.bodega), s(o.sub)) : 0;
      otrasUnids.push({ bodega: o.bodega, sub: o.sub, nombre: o.nombre, unidades: round2(q) });
    }
    lineas.push({
      id: l.id, orden: n(l.orden), productoId: s(l.producto_id), sku: s(l.sku), nombre: s(l.nombre),
      fromSub: etiquetaFromSub(s(l.sububicacion), s(r.s.bodega), s(r.s.nombre)),
      subCodigo: s(l.sububicacion),
      sistema: n(l.sistema), mov: round2(mov), esperado: esp, contado: l.contado == null || l.contado === "" ? null : n(l.contado),
      estado: s(l.estado), buscar: l.buscar === true, otraSub: s(l.otra_sub), otraQty: l.otra_qty == null || l.otra_qty === "" ? null : n(l.otra_qty),
      extras: Array.isArray(l.extras) ? l.extras : (l.extras && typeof l.extras === "object" ? l.extras : []),
      agregado: l.agregado === true, otrasUnids,
      // diferencia solo informativa; el front de conteo muestra «esp.» como MineCore, no costos.
      diferencia: (l.contado == null || l.contado === "") && s(l.estado) !== "no_encontrado" ? null : round2((s(l.estado) === "no_encontrado" ? 0 : n(l.contado)) - esp),
    });
  }
  lineas.sort((a, b) => s(a.fromSub).localeCompare(s(b.fromSub), "es") || s(a.sku).localeCompare(s(b.sku), "es", { numeric: true }));
  const contadas = lineas.filter((l) => l.contado != null || l.estado === "no_encontrado" || l.otraSub).length;
  return {
    ok: true, admin, puedeOperar: operar && s(r.s.estado) === "en_conteo",
    puedeIniciar: operar && s(r.s.estado) === "pendiente",
    puedeTerminar: operar && s(r.s.estado) === "en_conteo",
    puedeRevisar: admin && s(r.s.estado) === "en_revision",
    conteo: { id: r.c.id, numero: r.c.numero, asignadoNombre: s(r.c.asignado_nombre), estado: s(r.c.estado) },
    seccion: {
      id: r.s.id, nombre: s(r.s.nombre), bodega: s(r.s.bodega), sububicacion: s(r.s.sububicacion),
      estado: s(r.s.estado), estadoNombre: ESTADOS_SECCION[s(r.s.estado)] || s(r.s.estado),
      iniciadoAt: s(r.s.iniciado_at), iniciadoPor: s(r.s.iniciado_por), cerradoAt: s(r.s.cerrado_at),
      lineas: lineas.length, contadas,
    },
    lineas, movimientos: recs, otras: otros,
  };
});

extend("cf_sec_iniciar", "any", async (p, ctx, ses) => {
  const r = await cargarSec(ctx, s(p.id));
  if (!r) return { error: "Sección no encontrada" };
  if (!puedeOperarGeneral(r.c, ses, true)) return { error: "No puedes iniciar esta sección" };
  if (["aprobado", "cancelado"].includes(s(r.c.estado))) return { error: "El conteo ya está " + s(r.c.estado) };
  if (s(r.s.estado) !== "pendiente") return { ok: true, ya: true };
  const bodega = s(r.s.bodega), padre = s(r.s.sububicacion);
  let prefs: string[] = [];
  if (s(r.s.zona_id) && await hayZonas(ctx)) {
    const z = (await todas(ctx, "beta_conteo_zonas")).find((x) => s(x.id) === s(r.s.zona_id));
    if (z && Array.isArray(z.prefijos)) prefs = z.prefijos.map((x) => s(x));
  }
  const padres = (await haySubs(ctx) ? await todas(ctx, "beta_sububicaciones") : [])
    .filter((x) => x.activo !== false)
    .reduce((m, x) => { m[s(x.codigo).toUpperCase()] = s(x.padre); return m; }, {} as Record<string, string>);
  const lines: { x: Row; sub: string; q: number }[] = [];
  for (const x of (await listaProductos(ctx, ses)).filter((it) => it.tipo !== "servicio" && it.activo !== false)) {
    for (const lv of levelsDe(x, bodega, padre)) {
      if (padre && lv.sub && !esCodigoCabina(lv.sub) && padres[lv.sub.toUpperCase()] && padres[lv.sub.toUpperCase()] !== padre) continue;
      if (!coincidePrefijo(lv.sub, prefs)) continue;
      lines.push({ x, sub: lv.sub, q: lv.q });
    }
  }
  lines.sort((a, b) => s(a.x.sku).localeCompare(s(b.x.sku), "es", { numeric: true }) || s(a.sub).localeCompare(s(b.sub), "es"));
  const actor = actorOf(ses), now = ctx.now.toISOString();
  let i = 0;
  for (const o of lines.slice(0, 1500)) {
    await ctx.db.write(actor, "beta_conteo_lineas", "insert", {}, {
      id: crypto.randomUUID(), conteo_id: r.c.id, seccion_id: r.s.id, orden: ++i,
      producto_id: s(o.x.id), sku: s(o.x.skuVisible || o.x.sku), nombre: s(o.x.nombre),
      sububicacion: o.sub, sistema: round2(o.q), estado: "pendiente", buscar: false,
    });
  }
  await ctx.db.write(actor, "beta_conteo_secciones", "update", { id: r.s.id }, { estado: "en_conteo", iniciado_at: now, iniciado_por: actor, updated_at: now });
  if (s(r.c.estado) === "asignado") {
    await ctx.db.write(actor, "beta_conteos", "update", { id: r.c.id }, { estado: "en_conteo", iniciado_at: now, iniciado_por: actor, updated_at: now });
  }
  return { ok: true, lineas: i };
});

extend("cf_sec_guardar", "any", async (p, ctx, ses) => {
  const r = await cargarSec(ctx, s(p.id));
  if (!r) return { error: "Sección no encontrada" };
  if (!puedeOperarGeneral(r.c, ses, true)) return { error: "No puedes guardar este conteo" };
  if (s(r.s.estado) !== "en_conteo") return { error: "La sección no está en conteo" };
  const now = ctx.now.toISOString(), actor = actorOf(ses);
  const L = await lineasDe(ctx, s(r.s.id));
  const porId = new Map(L.map((l) => [s(l.id), l]));
  let cambiadas = 0;
  for (const x of (Array.isArray(p.lineas) ? p.lineas : []).slice(0, 2000) as Row[]) {
    const l = porId.get(s(x.id));
    if (!l) continue;
    const buscar = x.buscar === true;
    const estado = s(x.estado) === "no_encontrado" ? "no_encontrado" : x.contado == null || x.contado === "" ? "pendiente" : "contado";
    const contado = estado === "contado" ? n(x.contado) : null;
    if (contado != null && (contado < 0 || !Number.isFinite(contado))) return { error: s(l.sku) + ": cantidad inválida" };
    const extras = Array.isArray(x.extras) ? x.extras : l.extras;
    const otraSub = s(x.otra_sub ?? x.otraSub) || null;
    const otraQty = x.otra_qty == null || x.otra_qty === "" ? (x.otraQty == null || x.otraQty === "" ? null : n(x.otraQty)) : n(x.otra_qty);
    await ctx.db.write(actor, "beta_conteo_lineas", "update", { id: l.id }, {
      contado, estado, buscar, otra_sub: otraSub, otra_qty: otraQty, extras: extras || null,
      nota: s(x.nota).slice(0, 300) || null,
      contado_por: estado === "pendiente" && !otraSub ? null : actor,
      contado_at: estado === "pendiente" && !otraSub ? null : now,
      updated_at: now,
    });
    cambiadas++;
  }
  let agregada: string | null = null;
  if (p.agregar && typeof p.agregar === "object") {
    const a = p.agregar as Row;
    const prods = await listaProductos(ctx, ses);
    const code = skuCode(s(a.sku || a.codigo || a.barcode));
    const barra = s(a.barcode || a.codigo || a.sku);
    const pr = prods.find((x) => s(x.id) === s(a.producto_id))
      || (code ? prods.find((x) => skuCode(s(x.sku)) === code || skuCode(s(x.skuVisible)) === code) : undefined)
      || (barra ? prods.find((x) => (Array.isArray(x.barras) ? x.barras : []).some((b) => s(b) === barra)) : undefined);
    if (!pr || pr.tipo === "servicio") return { error: "Ese producto no está en Productos" };
    const delConteo = (await todas(ctx, "beta_conteo_lineas")).filter((l) => s(l.conteo_id) === s(r.c.id));
    const ya = delConteo.find((l) => s(l.producto_id) === s(pr.id)) || L.find((l) => s(l.producto_id) === s(pr.id));
    if (ya) {
      const sub = s(ya.sub_contada) || s(ya.sububicacion);
      return {
        ok: true, cambiadas, agregada: s(ya.id), ya: true,
        linea: {
          id: s(ya.id), orden: n(ya.orden), productoId: s(ya.producto_id), sku: s(ya.sku), nombre: s(ya.nombre),
          sububicacion: s(ya.sububicacion), fromSub: sub || bodegaNombre(s(r.s.bodega), s(r.s.sububicacion)), subCodigo: sub,
          sistema: esAdmin(ses.rol) ? n(ya.sistema) : null, mov: 0, esperado: n(ya.esperado ?? ya.sistema),
          contado: ya.contado == null || ya.contado === "" ? null : n(ya.contado), estado: s(ya.estado),
          subContada: sub, buscar: ya.buscar === true, otraSub: s(ya.otra_sub), otraQty: ya.otra_qty == null || ya.otra_qty === "" ? null : n(ya.otra_qty),
          agregado: ya.agregado === true, ya: true,
        },
      };
    }
    const sistema = sistemaDe(pr, s(r.s.bodega), s(r.s.sububicacion));
    const cont = a.contado == null || a.contado === "" ? null : n(a.contado);
    const row = {
      id: crypto.randomUUID(), conteo_id: r.c.id, seccion_id: r.s.id,
      orden: L.reduce((m, l) => Math.max(m, n(l.orden)), 0) + 1,
      producto_id: s(pr.id), sku: s(pr.skuVisible || pr.sku), nombre: s(pr.nombre),
      sububicacion: s(a.sububicacion) || s(r.s.sububicacion) || s(r.s.nombre),
      sistema: round2(sistema), esperado: round2(sistema), contado: cont, estado: cont == null ? "pendiente" : "contado",
      agregado: true, buscar: false, contado_por: cont == null ? null : actor, contado_at: cont == null ? null : now,
    };
    try {
      await ctx.db.write(actor, "beta_conteo_lineas", "insert", {}, row);
      agregada = row.id;
    } catch (err) {
      const otra = (await todas(ctx, "beta_conteo_lineas")).find((l) => s(l.conteo_id) === s(r.c.id) && s(l.producto_id) === s(pr.id));
      if (!otra) throw err;
      return { ok: true, cambiadas, agregada: s(otra.id), ya: true, linea: {
        id: s(otra.id), orden: n(otra.orden), productoId: s(otra.producto_id), sku: s(otra.sku), nombre: s(otra.nombre),
        sububicacion: s(otra.sububicacion), fromSub: s(otra.sub_contada) || s(otra.sububicacion) || bodegaNombre(s(r.s.bodega), s(r.s.sububicacion)),
        subCodigo: s(otra.sub_contada) || s(otra.sububicacion), sistema: esAdmin(ses.rol) ? n(otra.sistema) : null, mov: 0,
        esperado: n(otra.esperado ?? otra.sistema), contado: otra.contado == null || otra.contado === "" ? null : n(otra.contado),
        estado: s(otra.estado), subContada: s(otra.sub_contada) || s(otra.sububicacion), buscar: otra.buscar === true,
        otraSub: s(otra.otra_sub), otraQty: otra.otra_qty == null || otra.otra_qty === "" ? null : n(otra.otra_qty),
        agregado: otra.agregado === true, ya: true,
      } };
    }
    const linea = {
      id: row.id, orden: row.orden, productoId: s(row.producto_id), sku: s(row.sku), nombre: s(row.nombre),
      sububicacion: s(row.sububicacion), fromSub: s(row.sububicacion) || bodegaNombre(s(r.s.bodega), s(r.s.sububicacion)), subCodigo: s(row.sububicacion),
      sistema: esAdmin(ses.rol) ? n(row.sistema) : null, mov: 0, esperado: n(row.esperado),
      contado: cont, estado: s(row.estado), subContada: "", buscar: false, otraSub: "", otraQty: null, agregado: true,
    };
    return { ok: true, cambiadas, agregada, linea };
  }
  return { ok: true, cambiadas, agregada };
});

extend("cf_sec_cerrar", "any", async (p, ctx, ses) => {
  const r = await cargarSec(ctx, s(p.id));
  if (!r) return { error: "Sección no encontrada" };
  if (!puedeOperarGeneral(r.c, ses, true)) return { error: "No puedes terminar esta sección" };
  if (s(r.s.estado) !== "en_conteo") return { error: "La sección no está en conteo" };
  const L = await lineasDe(ctx, s(r.s.id));
  const buscar = L.filter((l) => l.buscar === true).length;
  if (buscar) return { error: buscar + " producto(s) en «Buscar después»: encuéntralos antes de terminar la sección" };
  const faltan = L.filter((l) => (l.contado == null || l.contado === "") && s(l.estado) !== "no_encontrado" && !s(l.otra_sub)).length;
  if (faltan && p.forzar !== true) return { ok: false, faltan, pregunta: "Quedan " + faltan + " producto(s) sin contar; no se ajustarán. ¿Terminar la sección y enviarla a revisión?" };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const prods = await listaProductos(ctx, ses);
  const porId = new Map(prods.map((x) => [s(x.id), x]));
  // Fijar esperado = stock vivo al cierre (snapshot + movimientos = stock actual), como MineCore.
  for (const l of L) {
    const pr = porId.get(s(l.producto_id));
    const vivo = pr ? sistemaEstante(pr, s(r.s.bodega), s(l.sububicacion)) : n(l.sistema);
    await ctx.db.write(actor, "beta_conteo_lineas", "update", { id: l.id }, { esperado: round2(vivo), updated_at: now });
  }
  await ctx.db.write(actor, "beta_conteo_secciones", "update", { id: r.s.id }, { estado: "en_revision", cerrado_at: now, cerrado_por: actor, revision_nota: null, updated_at: now });
  for (const u of (await todas(ctx, "usuarios")).filter((x) => esAdmin(s(x.rol)) && !x.bloqueado)) {
    await notificar(ctx, ses, s(u.id), "Sección para revisar: " + s(r.s.nombre) + " · " + s(r.c.numero), actor + " terminó " + s(r.s.nombre) + ".", "#/m/conteos/s/" + s(r.s.id), s(r.s.id), "conteo_revision");
  }
  return { ok: true };
});

extend("cf_sec_devolver", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin devuelve la sección" };
  const r = await cargarSec(ctx, s(p.id));
  if (!r) return { error: "Sección no encontrada" };
  if (s(r.s.estado) !== "en_revision") return { error: "La sección no está en revisión" };
  const nota = s(p.nota).trim();
  if (nota.length < 3) return { error: "Escribe qué hay que revisar" };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  await ctx.db.write(actor, "beta_conteo_secciones", "update", { id: r.s.id }, { estado: "en_conteo", cerrado_at: null, revision_nota: nota.slice(0, 500), updated_at: now });
  const L = await lineasDe(ctx, s(r.s.id));
  for (const l of L) await ctx.db.write(actor, "beta_conteo_lineas", "update", { id: l.id }, { esperado: null, updated_at: now });
  await notificar(ctx, ses, s(r.c.asignado_a), "Sección devuelta: " + s(r.s.nombre), nota, "#/m/conteos/s/" + s(r.s.id), s(r.s.id), "conteo_devuelto");
  return { ok: true };
});

extend("cf_sec_aprobar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin aprueba la sección" };
  const r = await cargarSec(ctx, s(p.id));
  if (!r) return { error: "Sección no encontrada" };
  if (s(r.s.estado) !== "en_revision") return { error: "La sección no está en revisión" };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  await ctx.db.write(actor, "beta_conteo_secciones", "update", { id: r.s.id }, { estado: "aprobada", aprobado_at: now, aprobado_por: actor, updated_at: now });
  const secs = await secsDe(ctx, s(r.c.id));
  const todasOk = secs.every((x) => s(x.id) === s(r.s.id) || s(x.estado) === "aprobada");
  if (todasOk) {
    await ctx.db.write(actor, "beta_conteos", "update", { id: r.c.id }, { estado: "aprobado", aprobado_at: now, aprobado_por: actor, stock_aplicado: false, updated_at: now });
  }
  return { ok: true, stockAplicado: false, conteoAprobado: todasOk };
});


const BOD_IDS: Record<string, string> = { CONSIGNACION: BOD_VENTA, OFICINA: BOD_CASA, CABINA: BOD_CABINA };
const BOD_OK = ["CONSIGNACION", "CABINA", "OFICINA"] as const;

function claveLugar(bodega: string, sub: string): string {
  return s(bodega).toUpperCase() + "|" + s(sub).toUpperCase();
}

async function stockPorLugar(ctx: Ctx, ses: Ses): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const prods = await listaProductos(ctx, ses);
  for (const p of prods) {
    const est = p.porEstante as Row | undefined;
    if (est && Object.keys(est).length) {
      for (const [k, q] of Object.entries(est)) {
        if (!n(q)) continue;
        out[k] = (out[k] || 0) + n(q);
      }
      continue;
    }
    const g = p.porGrupo as Row | undefined;
    const sub = p.porSubCabina as Row | undefined;
    if (g) {
      for (const k of ["CONSIGNACION", "OFICINA"]) {
        const q = n(g[k]);
        if (q) out[claveLugar(k, "")] = (out[claveLugar(k, "")] || 0) + q;
      }
    }
    if (sub) {
      for (const [cod, q] of Object.entries(sub)) {
        if (!cod || !n(q)) continue;
        out[claveLugar("CABINA", cod)] = (out[claveLugar("CABINA", cod)] || 0) + n(q);
      }
    }
  }
  return out;
}

async function usadoEnConteo(ctx: Ctx, z: Row): Promise<boolean> {
  const secs = await todas(ctx, "beta_conteo_secciones");
  return secs.some((x) => s(x.zona_id) === s(z.id) || (s(x.bodega) === s(z.bodega) && s(x.sububicacion) === s(z.sububicacion) && s(x.nombre) === s(z.nombre)));
}

function vistaZona(z: Row, stock: Record<string, number>, nSubs: number): Row {
  const bod = s(z.bodega), sub = s(z.sububicacion);
  const prefs = Array.isArray(z.prefijos) ? z.prefijos.map((x) => s(x)) : [];
  let unidades = 0, cubiertos = 0;
  for (const [k, q] of Object.entries(stock)) {
    const i = k.indexOf("|");
    const g = i < 0 ? k : k.slice(0, i), sb = i < 0 ? "" : k.slice(i + 1);
    if (g !== bod) continue;
    if (sub && esCodigoCabina(sb) && normSub(sb) !== normSub(sub)) continue;
    if (sub && sb && !esCodigoCabina(sb) && !coincidePrefijo(sb, prefs.length ? prefs : [])) {
      // still count if no prefs (all in lugar)
    }
    if (!coincidePrefijo(sb, prefs)) continue;
    unidades += n(q);
    cubiertos++;
  }
  return {
    id: z.id, nombre: s(z.nombre), bodega: bod, sububicacion: sub,
    prefijos: prefs,
    orden: n(z.orden), frecuenciaDias: n(z.frecuencia_dias) || 30,
    activo: z.activo !== false, unidades: round2(unidades), subs: nSubs,
    lugar: bodegaNombre(bod, sub),
  };
}

async function asegurarZonas(_ctx: Ctx, _actor: string): Promise<void> {
  // TK118: no se siembran secciones ni sububicaciones. Quedan vacías hasta que las cree un admin.
}

extend("cf_zonas", "any", async (_p, ctx, ses) => {
  const admin = esAdmin(ses.rol);
  const lugares = [
    { bodega: "CONSIGNACION", sububicacion: "", nombre: "Venta" },
    { bodega: "CABINA", sububicacion: "", nombre: "Bodega Cabina" },
    { bodega: "OFICINA", sububicacion: "", nombre: "Bodega Oficina" },
  ];
  const erp = await todas(ctx, "erp_sububicaciones");
  const catalogo = (await haySubs(ctx)) ? await todas(ctx, "beta_sububicaciones") : [];
  const subs = [];
  const visto = new Set<string>();
  const add = (bodega: string, codigo: string, nombre: string, id?: string, padre?: string) => {
    const k = bodega + ":" + codigo;
    if (!codigo || visto.has(k)) return;
    visto.add(k);
    subs.push({ id: id || k, bodega, padre: padre || "", codigo, nombre: nombre || codigo, activo: true, lugar: bodegaNombre(bodega) });
  };
  // Cabina 1/2/3 ya existen (erp_sububicaciones); no se duplican ni se tratan como bodegas.
  for (const x of erp) {
    if (x.activo === false) continue;
    const codigo = s(x.codigo);
    const bod = esCodigoCabina(codigo) ? "CABINA" : (s(x.bodega) || (s(x.bodega_id) === BOD_IDS.OFICINA || s(x.bodega_id) === "CASA" ? "OFICINA" : s(x.bodega_id) === BOD_IDS.CONSIGNACION ? "CONSIGNACION" : "CABINA"));
    add(bod, codigo, s(x.nombre) || codigo, s(x.id));
  }
  for (const x of [{ codigo: "CABINA_1", nombre: "Cabina 1" }, { codigo: "CABINA_2", nombre: "Cabina 2" }, { codigo: "CABINA_3", nombre: "Cabina 3" }]) {
    add("CABINA", x.codigo, x.nombre);
  }
  for (const su of catalogo) {
    if (su.activo === false) continue;
    add(s(su.bodega), s(su.codigo), s(su.nombre) || s(su.codigo), s(su.id), s(su.padre));
  }
  let zonas: Row[] = [];
  try {
    zonas = (await todas(ctx, "beta_conteo_zonas")).sort((a, b) => n(a.orden) - n(b.orden) || s(a.nombre).localeCompare(s(b.nombre), "es"))
      .map((z) => ({ id: z.id, nombre: s(z.nombre), bodega: s(z.bodega), sububicacion: s(z.sububicacion), prefijos: z.prefijos, frecuenciaDias: n(z.frecuencia_dias || z.frecuenciaDias) || 30, activo: z.activo !== false, orden: n(z.orden) }));
  } catch { /* sin tabla de zonas */ }
  return { ok: true, listo: true, admin, zonas, sinZona: [], lugares, subs };

});

extend("cf_zona_save", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin configura las secciones" };
  if (!(await hayZonas(ctx))) return { error: "Falta aplicar 20261119_tk117_conteo_zonas.sql" };
  const nombre = s(p.nombre).trim();
  if (!nombre) return { error: "Nombre requerido" };
  const bodega = s(p.bodega).toUpperCase();
  if (!BOD_OK.includes(bodega as (typeof BOD_OK)[number])) return { error: "Bodega inválida" };
  let sub = s(p.sububicacion).toUpperCase().replace(/\s+/g, "_");
  if (bodega !== "CABINA") sub = esCodigoCabina(sub) ? "" : sub;
  if (sub && esCodigoCabina(sub)) sub = normSub(sub);
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const freq = Math.max(1, Math.round(n(p.frecuencia_dias) || n(p.frecuenciaDias) || 30));
  const activo = p.activo !== false && p.activo !== "false";
  const prefijos = (Array.isArray(p.prefijos) ? p.prefijos : String(p.prefijos || "").split(",")).map((x) => s(x).trim().toUpperCase()).filter(Boolean);
  const id = s(p.id);
  const row = {
    nombre, bodega, sububicacion: sub || null,
    prefijos,
    frecuencia_dias: freq, activo, updated_por: actor, updated_at: now,
  };
  if (id) {
    const z = (await todas(ctx, "beta_conteo_zonas")).find((x) => s(x.id) === id);
    if (!z) return { error: "Sección no encontrada" };
    await ctx.db.write(actor, "beta_conteo_zonas", "update", { id }, row);
    return { ok: true, id };
  }
  const ids = await todas(ctx, "beta_conteo_zonas");
  const orden = n(p.orden) || (ids.reduce((a, x) => Math.max(a, n(x.orden)), 0) + 1);
  const nid = crypto.randomUUID();
  await ctx.db.write(actor, "beta_conteo_zonas", "insert", {}, { id: nid, ...row, orden, created_por: actor, created_at: now });
  return { ok: true, id: nid };
});

extend("cf_zona_borrar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin configura las secciones" };
  const z = (await todas(ctx, "beta_conteo_zonas")).find((x) => s(x.id) === s(p.id));
  if (!z) return { error: "Sección no encontrada" };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  if (await usadoEnConteo(ctx, z)) {
    await ctx.db.write(actor, "beta_conteo_zonas", "update", { id: z.id }, { activo: false, updated_por: actor, updated_at: now });
    return { ok: true, desactivada: true };
  }
  await ctx.db.write(actor, "beta_conteo_zonas", "delete", { id: z.id }, {});
  return { ok: true, borrada: true };
});

extend("cf_zona_orden", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin configura las secciones" };
  const ids = (Array.isArray(p.ids) ? p.ids : []).map((x) => s(x)).filter(Boolean);
  if (ids.length < 2) return { error: "Indica el nuevo orden" };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const rows = await todas(ctx, "beta_conteo_zonas");
  for (let i = 0; i < ids.length; i++) {
    const z = rows.find((x) => s(x.id) === ids[i]);
    if (!z) continue;
    await ctx.db.write(actor, "beta_conteo_zonas", "update", { id: z.id }, { orden: i + 1, updated_por: actor, updated_at: now });
  }
  return { ok: true };
});

extend("cf_sub_save", "any", async (p, ctx, ses) => {
  const admin = esAdmin(ses.rol);
  const bodega = s(p.bodega).toUpperCase();
  if (!BOD_OK.includes(bodega as (typeof BOD_OK)[number])) return { error: "Bodega inválida" };
  const codigo = s(p.codigo).trim().toUpperCase().replace(/\s+/g, "");
  if (!codigo) return { error: "El código es obligatorio" };
  const nombre = s(p.nombre).trim() || (esCodigoCabina(codigo) ? codigo.replace(/^CABINA_?/, "Cabina ") : codigo);
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const activo = p.activo !== false && p.activo !== "false";
  const destBodega = s(p.mover_a || p.moverA).toUpperCase() || bodega;
  if (destBodega && !BOD_OK.includes(destBodega as (typeof BOD_OK)[number])) return { error: "Bodega destino inválida" };
  const stock = await stockPorLugar(ctx, ses);
  const q = n(stock[claveLugar(bodega, codigo)]);
  const erp = await todas(ctx, "erp_sububicaciones");
  const id = s(p.id);
  const ya = erp.find((x) => s(x.id) === id) || erp.find((x) => s(x.codigo).toUpperCase() === codigo);

  if (ya) {
    if (!admin) return { error: "Solo un admin cambia o desactiva una sububicación" };
    if (q > 0.0001 && (s(ya.codigo).toUpperCase() !== codigo || destBodega !== bodega || !activo)) {
      return { error: "La sububicación tiene stock (" + round2(q) + "); muévelo antes de renombrarla, cambiarla de bodega o desactivarla" };
    }
    await ctx.db.write(actor, "erp_sububicaciones", "update", { id: ya.id }, {
      codigo, nombre, bodega_id: BOD_IDS[destBodega] || ya.bodega_id, activo,
    });
    return { ok: true, id: ya.id, codigo, bodega: destBodega, nombre, subs: await subsDe(ctx, destBodega) };
  }

  // El personal puede crear un estante al momento del conteo. No se crea una sección ni una bodega.
  const nid = id || crypto.randomUUID();
  const orden = erp.filter((x) => s(x.bodega_id) === (BOD_IDS[bodega] || "")).reduce((a, x) => Math.max(a, n(x.orden)), 0) + 1;
  await ctx.db.write(actor, "erp_sububicaciones", "insert", {}, {
    id: nid, bodega_id: BOD_IDS[bodega], codigo, nombre, orden, activo: true, created_at: now,
  });
  if (await haySubs(ctx)) {
    try {
      await ctx.db.write(actor, "beta_sububicaciones", "insert", {}, {
        id: nid, bodega, padre: s(p.padre) || null, codigo, nombre, activo: true,
        created_por: actor, created_at: now, updated_por: actor, updated_at: now,
      });
    } catch { /* el catálogo erp basta */ }
  }
  return { ok: true, id: nid, codigo, bodega, nombre, subs: await subsDe(ctx, bodega) };
});
