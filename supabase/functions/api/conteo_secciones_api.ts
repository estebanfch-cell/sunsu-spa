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
import { grupoDeBodega } from "./productos.ts";
import { listaProductos } from "./productos_api.ts";
import { bodegaNombre, notificar, sistemaDe, ESTADOS_CONTEO } from "./conteo_fisico_api.ts";

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

export function mismoLugar(bodega: string, sub: string, bod: string, sb: string): boolean {
  if (s(bodega).toUpperCase() !== s(bod).toUpperCase()) return false;
  const a = s(sub).toUpperCase(), b = s(sb).toUpperCase();
  if (s(bodega).toUpperCase() === "CABINA") return a === b;
  return true;
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
  if (!(await haySecciones(ctx))) return { ok: true, listo: false, falta: FALTA_SEC, secciones: plantillaSecciones() };
  return { ok: true, listo: true, admin: esAdmin(ses.rol), secciones: plantillaSecciones() };
});

extend("cf_crear_general", "any", async (p, ctx, ses) => {
  if (!(await haySecciones(ctx))) return { error: FALTA_SEC };
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
  for (const pl of plantillaSecciones()) {
    await ctx.db.write(actor, "beta_conteo_secciones", "insert", {}, {
      id: crypto.randomUUID(), conteo_id: id, bodega: pl.bodega, sububicacion: pl.sub || null,
      nombre: pl.nombre, orden: pl.orden, estado: "pendiente", updated_at: now,
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
  for (const pl of plantillaSecciones()) {
    if (mismoLugar(s(r.s.bodega), s(r.s.sububicacion), pl.bodega, pl.sub)) continue;
    // stock vivo en otras subs (sin costos) para el desplegable «Está en otro lugar»
    otros.push({ id: pl.bodega + ":" + pl.sub, bodega: pl.bodega, sub: pl.sub, nombre: pl.nombre });
  }
  for (const l of L) {
    const movs = desde ? await movimientosDurante(ctx, s(l.producto_id), s(r.s.bodega), s(r.s.sububicacion), desde, hasta) : [];
    if (!s(movs[0] ? movs[0].sku : "") && movs.length) {
      for (const m of movs) if (!m.sku) m.sku = s(l.sku);
    }
    const pr = porId.get(s(l.producto_id));
    const vivo = pr ? sistemaDe(pr, s(r.s.bodega), s(r.s.sububicacion)) : n(l.sistema) + movs.reduce((a, m) => a + n(m.delta), 0);
    // MineCore: esperado abierto = snapshot + mov (= stock vivo). Si hay foto de cierre, se usa esa.
    const esp = cerrado ? esperadoVivo(n(l.sistema), movs, l.esperado, true) : round2(vivo);
    const mov = movs.reduce((a, m) => a + n(m.delta), 0);
    for (const m of movs) recs.push({ ...m, sku: s(m.sku) || s(l.sku), lineaId: l.id });
    const otrasUnids: Row[] = [];
    for (const pl of plantillaSecciones()) {
      if (mismoLugar(s(r.s.bodega), s(r.s.sububicacion), pl.bodega, pl.sub)) continue;
      const q = pr ? sistemaDe(pr, pl.bodega, pl.sub) : 0;
      otrasUnids.push({ bodega: pl.bodega, sub: pl.sub, nombre: pl.nombre, unidades: round2(q) });
    }
    lineas.push({
      id: l.id, orden: n(l.orden), productoId: s(l.producto_id), sku: s(l.sku), nombre: s(l.nombre),
      fromSub: s(l.sububicacion) || s(r.s.nombre),
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
  const bodega = s(r.s.bodega), sub = s(r.s.sububicacion);
  const prods = (await listaProductos(ctx, ses)).filter((x) => x.tipo !== "servicio" && x.activo !== false)
    .map((x) => ({ x, q: sistemaDe(x, bodega, sub) })).filter((o) => Math.abs(o.q) > 1e-9)
    .sort((a, b) => s(a.x.sku).localeCompare(s(b.x.sku), "es", { numeric: true }));
  const actor = actorOf(ses), now = ctx.now.toISOString();
  let i = 0;
  for (const o of prods.slice(0, 1500)) {
    await ctx.db.write(actor, "beta_conteo_lineas", "insert", {}, {
      id: crypto.randomUUID(), conteo_id: r.c.id, seccion_id: r.s.id, orden: ++i,
      producto_id: s(o.x.id), sku: s(o.x.skuVisible || o.x.sku), nombre: s(o.x.nombre),
      sububicacion: sub || s(r.s.nombre), sistema: round2(o.q), estado: "pendiente", buscar: false,
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
    const pr = prods.find((x) => s(x.id) === s(a.producto_id)) || prods.find((x) => skuCode(s(x.sku)) === skuCode(s(a.sku)));
    if (!pr || pr.tipo === "servicio") return { error: "Ese producto no está en Productos" };
    const ya = L.find((l) => s(l.producto_id) === s(pr.id) && s(l.sububicacion) === (s(a.sububicacion) || s(r.s.sububicacion) || s(r.s.nombre)));
    if (ya) return { error: s(pr.skuVisible || pr.sku) + " ya está en la lista", lineaId: ya.id };
    const sistema = sistemaDe(pr, s(r.s.bodega), s(r.s.sububicacion));
    const cont = a.contado == null || a.contado === "" ? null : n(a.contado);
    const row = {
      id: crypto.randomUUID(), conteo_id: r.c.id, seccion_id: r.s.id,
      orden: L.reduce((m, l) => Math.max(m, n(l.orden)), 0) + 1,
      producto_id: s(pr.id), sku: s(pr.skuVisible || pr.sku), nombre: s(pr.nombre),
      sububicacion: s(a.sububicacion) || s(r.s.sububicacion) || s(r.s.nombre),
      sistema: round2(sistema), contado: cont, estado: cont == null ? "pendiente" : "contado",
      agregado: true, buscar: false, contado_por: cont == null ? null : actor, contado_at: cont == null ? null : now,
    };
    await ctx.db.write(actor, "beta_conteo_lineas", "insert", {}, row);
    agregada = row.id;
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
    const vivo = pr ? sistemaDe(pr, s(r.s.bodega), s(r.s.sububicacion)) : n(l.sistema);
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
