// 📦 Abrir producto (Emilia 17/11): buscar producto (código, nombre, código de barras o cámara) → destino
// Cabina 1/2/3 o Local → firma con el dedo → se guarda quién y cuándo, y sale 1 unidad de esa bodega
// (movimiento consumo_cabina en el kardex). Abrir el siguiente del mismo producto en el mismo destino
// cierra el anterior. Con eso: faciales por envase, uso y costo por facial («protocolo automático»).
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin, matrizDe, verCostos } from "./permisos.ts";
import { esCancelado, facialSku, n, normNombre, round2, s, skuCode, type Row } from "./domain.ts";
import { consultar } from "./query.ts";
import { claveDe } from "./ticket_beta.ts";
import { leerSerie } from "./series.ts";
import { runErp, usoCompatible } from "./erp.ts";
import { aPared, DESTINOS, destinoDeCabina, nombreDestino, promedioProducto, rendimiento, type Facial } from "./aperturas_beta.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : typeof v === "string" && v.trim().startsWith("[") ? (() => { try { return JSON.parse(v as string); } catch { return []; } })() : [];
async function costos(ctx: Ctx, ses: Ses): Promise<boolean> { return esAdmin(ses.rol) || verCostos(ses.rol, await matrizDe(ctx.db)); }

async function bodegas(ctx: Ctx): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const b of await todas(ctx, "erp_bodegas")) m.set(s(b.codigo).toUpperCase(), s(b.id));
  return m;
}
/** De qué bodega sale la unidad: la del destino si el uso del producto lo permite; si no, la que le corresponde
 * (un producto de venta abierto en cabina sale de Venta; uno de cabina abierto en el local sale de Cabina 1). */
async function bodegaSalida(ctx: Ctx, prod: Row, destino: string): Promise<{ id: string; codigo: string } | null> {
  const L = await todas(ctx, "erp_bodegas");
  const por = (c: string) => L.find((b) => s(b.codigo).toUpperCase() === c);
  const uso = s(prod.uso) || "venta";
  const d = por(destino);
  if (d && usoCompatible(uso, s(d.tipo))) return { id: s(d.id), codigo: destino };
  const alt = uso === "cabina" ? por("CABINA") : por("VENTA");
  return alt && usoCompatible(uso, s(alt.tipo)) ? { id: s(alt.id), codigo: s(alt.codigo).toUpperCase() } : null;
}
async function facialesCatalogo(ctx: Ctx): Promise<{ code: string; nombre: string }[]> {
  return (await todas(ctx, "catalogo")).filter((c) => /^FACIAL/i.test(s(c.tipo)) && s(c.sku))
    .map((c) => ({ code: s(c.sku).toUpperCase(), nombre: s(c.producto_servicio).replace(/\s+/g, " ").trim() }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}
function costoUnit(p: Row): number { return n(p.costo_promedio) > 0 ? n(p.costo_promedio) : n(p.beta_compra_real); }
function presentacionDe(p: Row): string {
  const c = n(p.beta_contenido), u = s(p.beta_contenido_unidad), e = s(p.beta_envase);
  return [e, c > 0 ? c + (u ? " " + u : "") : ""].filter(Boolean).join(" ") || "";
}
function codigosDe(p: Row): string[] {
  return [s(p.sku), skuCode(s(p.sku)), s(p.codigo_barras), s(p.sku_proveedor), ...arr(p.beta_codigos).map((x) => typeof x === "object" && x ? s((x as Row).codigo ?? (x as Row).valor) : s(x))].filter(Boolean);
}
async function stockDe(ctx: Ctx, pid: string): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  try { for (const x of (await consultar(ctx.db, "erp_movimientos", { cols: ["bodega_id", "delta"], filtros: [{ col: "producto_id", op: "eq", val: pid }] })).rows) m.set(s(x.bodega_id), (m.get(s(x.bodega_id)) || 0) + n(x.delta)); } catch { /* sin kardex */ }
  return m;
}

extend("ap_opciones", "any", async (_p, ctx) => {
  return { ok: true, destinos: DESTINOS, faciales: await facialesCatalogo(ctx) };
});

extend("ap_buscar", "any", async (p, ctx) => {
  const q = normNombre(s(p.q)), code = s(p.q).trim().toUpperCase();
  if (q.length < 2) return { ok: true, items: [] };
  const prods = (await todas(ctx, "erp_productos")).filter((x) => !s(x.beta_eliminado_at) && !s(x.beta_archivado_at) && x.activo !== false && (s(x.clase) || "producto") === "producto");
  const exact = prods.filter((x) => codigosDe(x).some((c) => c.toUpperCase() === code || skuCode(c) === skuCode(code)));
  const words = q.split(/\s+/);
  const porTexto = prods.filter((x) => { const t = normNombre(s(x.nombre) + " " + s(x.marca) + " " + codigosDe(x).join(" ")); return words.every((w) => t.includes(w)); });
  const L = [...new Map([...exact, ...porTexto].map((x) => [s(x.id), x])).values()].slice(0, 20);
  return { ok: true, exacto: exact.length === 1 ? s(exact[0].id) : "", items: L.map((x) => ({ id: s(x.id), sku: skuCode(s(x.sku)), nombre: s(x.nombre), marca: s(x.marca), presentacion: presentacionDe(x), foto: s(x.foto_thumb) || (s(x.foto_url).startsWith("http") ? s(x.foto_url) : "") })) };
});

/** Producto elegido: stock en cada destino y el envase abierto ahora en cada uno. */
extend("ap_producto", "any", async (p, ctx) => {
  const pid = s(p.producto_id);
  const prod = (await todas(ctx, "erp_productos")).find((x) => s(x.id) === pid);
  if (!prod) return { error: "Producto no encontrado" };
  const B = await bodegas(ctx), st = await stockDe(ctx, pid);
  const salidas = new Map<string, { id: string; codigo: string } | null>();
  for (const d of DESTINOS) salidas.set(d.codigo, await bodegaSalida(ctx, prod, d.codigo));
  const abiertas = (await consultar(ctx.db, "beta_aperturas", { filtros: [{ col: "producto_id", op: "eq", val: pid }, { col: "cerrado_at", op: "is_null" }, { col: "anulada", op: "not_true" }] }).catch(() => ({ rows: [] as Row[] }))).rows;
  return {
    ok: true, producto: { id: pid, sku: skuCode(s(prod.sku)), nombre: s(prod.nombre), presentacion: presentacionDe(prod), aplica: arr(prod.beta_aplica_faciales).map(s) },
    destinos: DESTINOS.map((d) => {
      const ab = abiertas.filter((a) => s(a.destino) === d.codigo).sort((a, b) => s(b.abierto_at).localeCompare(s(a.abierto_at)))[0];
      const sal = salidas.get(d.codigo);
      return { ...d, saleDe: sal && sal.codigo !== d.codigo ? nombreDestino(sal.codigo) : "", stock: round2(st.get((sal && sal.id) || B.get(d.codigo) || "") || 0), abierto: ab ? { id: s(ab.id), desde: s(ab.abierto_at), usuario: s(ab.usuario) } : null };
    }),
  };
});

extend("ap_abrir", "any", async (p, ctx, ses) => {
  const pid = s(p.producto_id), destino = s(p.destino).toUpperCase(), firma = s(p.firma);
  if (!DESTINOS.some((d) => d.codigo === destino)) return { error: "Elige el destino: Cabina 1, 2, 3 o Local" };
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(firma) || firma.length < 200) return { error: "Falta la firma" };
  if (firma.length > 400000) return { error: "La firma es demasiado grande" };
  const prod = (await todas(ctx, "erp_productos")).find((x) => s(x.id) === pid);
  if (!prod) return { error: "Producto no encontrado" };
  const sal = await bodegaSalida(ctx, prod, destino);
  if (!sal) return { error: "No encontré de qué bodega sacar " + s(prod.nombre) };
  const bodega = sal.id;
  const id = crypto.randomUUID(), ahora = ctx.now.toISOString(), actor = actorOf(ses), quien = s(ses.name) || actor;
  // Envase anterior del mismo producto en el mismo destino → se cierra con esta apertura.
  const previas = (await consultar(ctx.db, "beta_aperturas", { filtros: [{ col: "producto_id", op: "eq", val: pid }, { col: "destino", op: "eq", val: destino }, { col: "cerrado_at", op: "is_null" }, { col: "anulada", op: "not_true" }] }).catch(() => ({ rows: [] as Row[] }))).rows;
  // 1) Stock: sale 1 unidad de la bodega del destino.
  const mov = { producto_id: pid, bodega_id: bodega, delta: -1, tipo: "consumo_cabina", doc_tipo: "apertura", doc_id: id, nota: "Abrir producto · " + nombreDestino(destino) + (sal.codigo !== destino ? " (sale de " + nombreDestino(sal.codigo) + ")" : "") + " · " + quien, legacy_ref: "apertura:" + id };
  const out = await runErp("stock_delta", { moves: [mov], aprobar_negativo: true }, ctx.db, actor, ctx.now);
  if (out.error) return { error: "No se pudo descontar el stock: " + s(out.error) };
  // 2) La apertura.
  await ctx.db.write(actor, "beta_aperturas", "insert", {}, {
    id, producto_id: pid, sku: skuCode(s(prod.sku)), nombre: s(prod.nombre), presentacion: s(p.presentacion) || presentacionDe(prod),
    contenido: n(prod.beta_contenido) || null, contenido_unidad: s(prod.beta_contenido_unidad) || null, costo: costoUnit(prod) || null,
    destino, bodega_id: bodega, abierto_at: ahora, usuario: quien, firma_url: firma, mov_ref: "apertura:" + id, nota: s(p.nota).slice(0, 300) || null,
  });
  for (const a of previas) await ctx.db.write(actor, "beta_aperturas", "update", { id: s(a.id) }, { cerrado_at: ahora, cerrado_por_apertura_id: id });
  await logAccion(ctx.db, actor, "ABRIR PRODUCTO", `${skuCode(s(prod.sku))} ${s(prod.nombre)} · ${nombreDestino(destino)}${previas.length ? " · cierra " + previas.length + " anterior" : ""} · ${id}`);
  return { ok: true, id, destino: nombreDestino(destino), saleDe: nombreDestino(sal.codigo), cerradas: previas.map((a) => s(a.id)) };
});

/** Admin: anular una apertura por error → vuelve la unidad y se reabre el envase que había cerrado. */
extend("ap_anular", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  const id = s(p.id), motivo = s(p.motivo).trim().slice(0, 300);
  if (!motivo) return { error: "Escribe el motivo" };
  const a = (await consultar(ctx.db, "beta_aperturas", { filtros: [{ col: "id", op: "eq", val: id }] })).rows[0];
  if (!a) return { error: "No encontré esa apertura" };
  if (a.anulada === true) return { error: "Ya está anulada" };
  const actor = actorOf(ses);
  const out = await runErp("stock_delta", { moves: [{ producto_id: s(a.producto_id), bodega_id: s(a.bodega_id), delta: 1, tipo: "anulacion", doc_tipo: "apertura", doc_id: id, nota: "Anular apertura: " + motivo, legacy_ref: "apertura-anular:" + id }], aprobar_negativo: true }, ctx.db, actor, ctx.now);
  if (out.error) return { error: "No se pudo devolver el stock: " + s(out.error) };
  await ctx.db.write(actor, "beta_aperturas", "update", { id }, { anulada: true, anulada_motivo: motivo, anulada_por: s(ses.name) || actor });
  const reab = (await consultar(ctx.db, "beta_aperturas", { filtros: [{ col: "cerrado_por_apertura_id", op: "eq", val: id }] }).catch(() => ({ rows: [] as Row[] }))).rows;
  for (const r of reab) await ctx.db.write(actor, "beta_aperturas", "update", { id: s(r.id) }, { cerrado_at: null, cerrado_por_apertura_id: null });
  await logAccion(ctx.db, actor, "ABRIR PRODUCTO ANULAR", `${s(a.sku)} ${s(a.nombre)} · ${nombreDestino(s(a.destino))} · ${motivo} · ${id}`);
  return { ok: true, reabiertas: reab.length };
});

/** Ficha de producto: a qué faciales aplica. */
extend("ap_aplica_get", "any", async (p, ctx) => {
  const prod = (await todas(ctx, "erp_productos")).find((x) => s(x.id) === s(p.producto_id));
  if (!prod) return { error: "Producto no encontrado" };
  return { ok: true, aplica: arr(prod.beta_aplica_faciales).map(s), faciales: await facialesCatalogo(ctx) };
});
extend("ap_aplica_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  const pid = s(p.producto_id);
  const validos = new Set((await facialesCatalogo(ctx)).map((f) => f.code));
  const L = [...new Set(arr(p.faciales).map((x) => s(x).toUpperCase()).filter((x) => validos.has(x)))];
  const prod = (await todas(ctx, "erp_productos")).find((x) => s(x.id) === pid);
  if (!prod) return { error: "Producto no encontrado" };
  await ctx.db.write(actorOf(ses), "erp_productos", "update", { id: pid }, { beta_aplica_faciales: L, beta_editado_por: s(ses.name), beta_editado_at: ctx.now.toISOString() });
  await logAccion(ctx.db, actorOf(ses), "PRODUCTO APLICA FACIALES", `${skuCode(s(prod.sku))} ${s(prod.nombre)} → ${L.join(", ") || "ninguno"}`);
  return { ok: true, aplica: L };
});

/** Faciales hechos (tickets) en escala de pared, sin cancelados ni borrados. */
async function facialesHechos(ctx: Ctx, desdeIso: string): Promise<Facial[]> {
  let rows: Row[] = [];
  try { rows = (await consultar(ctx.db, "tickets", { cols: ["id", "timestamp", "facial_hecho", "borrado_at", "orig", "so_num", "beta_num", "sheet_row"], filtros: [{ col: "timestamp", op: "gte", val: desdeIso }] })).rows; }
  catch { rows = (await todas(ctx, "tickets")).filter((r) => s(r.timestamp) >= desdeIso); }
  // Cabina del ticket (beta_tickets.datos.cabina, opcional).
  const cab = new Map<string, string>();
  try { for (const c of await todas(ctx, "beta_tickets")) { const d = c.datos && typeof c.datos === "object" ? c.datos as Row : {}; const k = destinoDeCabina(d.cabina); if (k) cab.set(s(c.clave), k); } } catch { /* sin tabla: sin cabina */ }
  const out: Facial[] = [];
  for (const r of rows) {
    if (r.borrado_at || esCancelado(r)) continue;
    const code = facialSku(r.facial_hecho); const t = Date.parse(s(r.timestamp));
    const cb = cab.size ? cab.get(claveDe(r, leerSerie(r, "so_num"))) : undefined;
    if (code && Number.isFinite(t)) out.push(cb ? { t, code, cabina: cb } : { t, code });
  }
  return out;
}

/** Historial de aperturas + rendimiento; y el costo por facial por producto y por protocolo. */
extend("ap_lista", "any", async (p, ctx, ses) => {
  const verC = await costos(ctx, ses);
  let aps = await todas(ctx, "beta_aperturas");
  if (s(p.producto_id)) aps = aps.filter((a) => s(a.producto_id) === s(p.producto_id));
  if (s(p.destino)) aps = aps.filter((a) => s(a.destino) === s(p.destino));
  const prods = new Map((await todas(ctx, "erp_productos")).map((x) => [s(x.id), x]));
  const minIso = aps.reduce((m, a) => (!m || s(a.abierto_at) < m ? s(a.abierto_at) : m), "");
  const fac = minIso ? await facialesHechos(ctx, new Date(aPared(minIso)).toISOString()) : [];
  const ahora = ctx.now.getTime() - 5 * 3600e3;
  const porProd = new Map<string, Row[]>();
  for (const a of aps) { const L = porProd.get(s(a.producto_id)) || []; L.push(a); porProd.set(s(a.producto_id), L); }
  const items: Row[] = [], productos: Row[] = [];
  const catF = await facialesCatalogo(ctx);
  const protocolo = new Map<string, Row>(catF.map((f) => [f.code, { code: f.code, nombre: f.nombre, costo: 0, productos: [] as Row[] }]));
  for (const [pid, L] of porProd) {
    const pr = prods.get(pid) || {};
    const aplica = arr(pr.beta_aplica_faciales).map(s);
    const R = rendimiento(L, fac, aplica, ahora);
    for (const a of L) {
      const r = R.get(s(a.id));
      const it: Row = {
        id: s(a.id), producto_id: pid, sku: s(a.sku), nombre: s(a.nombre), presentacion: s(a.presentacion), destino: s(a.destino), destinoNombre: nombreDestino(s(a.destino)),
        abierto_at: s(a.abierto_at), cerrado_at: s(a.cerrado_at), usuario: s(a.usuario), anulada: a.anulada === true, anulada_motivo: s(a.anulada_motivo), tieneFirma: !!s(a.firma_url),
        contenido: a.contenido ?? null, unidad: s(a.contenido_unidad), faciales: r ? r.faciales : 0, enCurso: r ? r.enCurso : !a.cerrado_at,
        usoPorFacial: r ? r.usoPorFacial : null, sinAplica: !aplica.length,
      };
      if (verC) { it.costo = a.costo ?? null; it.costoPorFacial = r ? r.costoPorFacial : null; }
      items.push(it);
    }
    const prom = promedioProducto([...R.values()]);
    const fila: Row = { producto_id: pid, sku: skuCode(s(pr.sku)), nombre: s(pr.nombre), aplica, envases: L.filter((a) => a.anulada !== true).length, cerrados: prom.envases, faciales: prom.faciales, usoPorFacial: prom.usoPorFacial, unidad: s(pr.beta_contenido_unidad) };
    if (verC) fila.costoPorFacial = prom.costoPorFacial;
    productos.push(fila);
    if (prom.costoPorFacial != null || prom.usoPorFacial != null) for (const c of aplica) {
      const pf = protocolo.get(c.toUpperCase()); if (!pf) continue;
      (pf.productos as Row[]).push({ sku: fila.sku, nombre: fila.nombre, usoPorFacial: prom.usoPorFacial, unidad: fila.unidad, ...(verC ? { costoPorFacial: prom.costoPorFacial } : {}) });
      pf.costo = round2(n(pf.costo) + n(prom.costoPorFacial));
    }
  }
  items.sort((a, b) => s(b.abierto_at).localeCompare(s(a.abierto_at)));
  const prot = [...protocolo.values()].filter((x) => (x.productos as Row[]).length).map((x) => verC ? x : { ...x, costo: undefined });
  return { ok: true, admin: esAdmin(ses.rol), verCostos: verC, items: items.slice(0, Math.min(500, n(p.limit) || 300)), total: items.length, productos, protocolo: prot,
    nota: "Cada facial se reparte entre los envases de ese producto abiertos en ese momento; si el ticket tiene «Cabina», solo entre los abiertos en esa cabina. El promedio usa solo envases ya cerrados." };
});

extend("ap_firma", "any", async (p, ctx) => {
  const a = (await consultar(ctx.db, "beta_aperturas", { cols: ["id", "firma_url"], filtros: [{ col: "id", op: "eq", val: s(p.id) }] }).catch(() => ({ rows: [] as Row[] }))).rows[0];
  return a ? { ok: true, firma: s(a.firma_url) } : { error: "No encontrada" };
});
