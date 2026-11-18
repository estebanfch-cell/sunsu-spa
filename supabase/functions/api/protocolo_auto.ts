// TK36 (Emilia 18/11): protocolo automático.
//  · Marcar en un producto «Aplica a faciales» (📦 Abrir producto) lo agrega solo al protocolo de ese facial,
//    y quitarlo lo saca. Agregar el producto a un paso del protocolo marca el facial en el producto (y al revés).
//  · Costo del protocolo = suma del costo de uso de cada producto: si el paso tiene cantidad y el producto tiene
//    contenido en la misma unidad → costo × cantidad ÷ contenido; si no, el costo por facial real de las aperturas.
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { esCancelado, facialSku, n, round2, s, skuCode, type Row } from "./domain.ts";
import { consultar } from "./query.ts";
import { claveDe } from "./ticket_beta.ts";
import { leerSerie } from "./series.ts";
import { aPared, destinoDeCabina, promedioProducto, rendimiento, type Facial } from "./aperturas_beta.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
export const arrDe = (v: unknown): unknown[] => Array.isArray(v) ? v : typeof v === "string" && v.trim().startsWith("[") ? (() => { try { return JSON.parse(v as string); } catch { return []; } })() : [];
export function costoUnit(p: Row): number { return n(p.costo_promedio) > 0 ? n(p.costo_promedio) : n(p.beta_compra_real); }
const uni = (u: unknown) => s(u).trim().toLowerCase().replace(/\.$/, "").replace(/^(gr|grs|gramos?)$/, "g").replace(/^(mls?|mililitros?)$/, "ml").replace(/^(unidad(es)?|und|uds?)$/, "u");

/** Costo de un paso por la cantidad del protocolo (null si falta cantidad, contenido o la unidad no coincide). */
export function costoPorCantidad(prod: Row | undefined, cantidad: unknown, unidad: unknown): number | null {
  if (!prod) return null;
  const q = n(cantidad), cont = n(prod.beta_contenido), cu = costoUnit(prod);
  if (!(q > 0) || !(cont > 0) || !(cu > 0)) return null;
  const a = uni(unidad), b = uni(prod.beta_contenido_unidad || prod.unidad_consumo);
  if (a && b && a !== b) return null;
  return round2(cu * q / cont);
}

/** Faciales hechos (tickets) en escala de pared, sin cancelados ni borrados. */
export async function facialesHechos(ctx: Ctx, desdeIso: string): Promise<Facial[]> {
  let rows: Row[] = [];
  try { rows = (await consultar(ctx.db, "tickets", { cols: ["id", "timestamp", "facial_hecho", "borrado_at", "orig", "so_num", "beta_num", "sheet_row"], filtros: [{ col: "timestamp", op: "gte", val: desdeIso }] })).rows; }
  catch { rows = (await todas(ctx, "tickets")).filter((r) => s(r.timestamp) >= desdeIso); }
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

/** Costo y uso por facial reales (aperturas cerradas) por código de producto. */
export async function usoReal(ctx: Ctx, prods: Row[]): Promise<Map<string, { usoPorFacial: number | null; costoPorFacial: number | null }>> {
  const out = new Map<string, { usoPorFacial: number | null; costoPorFacial: number | null }>();
  const aps = await todas(ctx, "beta_aperturas");
  if (!aps.length) return out;
  const byId = new Map(prods.map((p) => [s(p.id), p]));
  const minIso = aps.reduce((m, a) => (!m || s(a.abierto_at) < m ? s(a.abierto_at) : m), "");
  const fac = minIso ? await facialesHechos(ctx, new Date(aPared(minIso)).toISOString()) : [];
  const ahora = ctx.now.getTime() - 5 * 3600e3;
  const por = new Map<string, Row[]>();
  for (const a of aps) { const L = por.get(s(a.producto_id)) || []; L.push(a); por.set(s(a.producto_id), L); }
  for (const [pid, L] of por) {
    const pr = byId.get(pid); if (!pr) continue;
    const prom = promedioProducto([...rendimiento(L, fac, arrDe(pr.beta_aplica_faciales).map(s), ahora).values()]);
    out.set(skuCode(s(pr.sku)), { usoPorFacial: prom.usoPorFacial, costoPorFacial: prom.costoPorFacial });
  }
  return out;
}

/** Costo de cada paso y del protocolo. Devuelve los pasos con `costo` y `costoFuente` ('cantidad' | 'aperturas' | ''). */
export function costearPasos(pasos: Row[], prodPorCod: Map<string, Row>, real: Map<string, { costoPorFacial: number | null }>): { pasos: Row[]; costoProductos: number; sinCosto: number } {
  let tot = 0, sin = 0; const vistos = new Set<string>();
  const out = pasos.map((x) => {
    const cod = s(x.producto_cod);
    if (!cod) return { ...x, costo: null, costoFuente: "" };
    let c = costoPorCantidad(prodPorCod.get(cod), x.cantidad, x.unidad), f = c == null ? "" : "cantidad";
    // Sin cantidad: el costo real por facial del producto, una sola vez por protocolo.
    if (c == null && !vistos.has(cod)) { const r = real.get(cod); if (r && r.costoPorFacial != null) { c = r.costoPorFacial; f = "aperturas"; } }
    vistos.add(cod);
    if (c == null) sin++; else tot += c;
    return { ...x, costo: c, costoFuente: f };
  });
  return { pasos: out, costoProductos: round2(tot), sinCosto: sin };
}

async function protocolosVivos(ctx: Ctx): Promise<Row[] | null> { try { return (await ctx.db.all("beta_protocolos")).filter((r) => !s(r.borrado_at)); } catch { return null; } }
const pasosDe = (v: unknown): Row[] => arrDe(v) as Row[];
async function guardarProto(ctx: Ctx, ses: Ses, id: string, r: Row, pasos: Row[]) {
  const row: Row = { sku: s(r.sku), nombre: s(r.nombre), vigente: r.vigente !== false, mano_de_obra: r.mano_de_obra == null || r.mano_de_obra === "" ? null : n(r.mano_de_obra), notas: s(r.notas), pasos: pasos.map((x, i) => ({ ...x, paso: i + 1 })), origen: s(r.origen) || "beta", borrar: false };
  return await ctx.db.rpc("app_protocolo_guardar", { p_id: id, p_row: row, p_actor: actorOf(ses) });
}

/** Producto → faciales: agrega el producto al protocolo de cada facial nuevo y lo quita de los que ya no aplica. */
export async function productoAProtocolos(ctx: Ctx, ses: Ses, prod: Row, nuevos: string[], previos: string[], nombresFacial: Map<string, string>): Promise<string[]> {
  const vivos = await protocolosVivos(ctx); if (!vivos) return [];
  const cod = skuCode(s(prod.sku)); if (!cod) return [];
  const N = new Set(nuevos.map((x) => x.toUpperCase())), P = new Set(previos.map((x) => x.toUpperCase()));
  const tocados: string[] = [];
  for (const f of new Set([...N, ...P])) {
    const r = vivos.find((x) => s(x.sku).toUpperCase() === f);
    const pasos = r ? pasosDe(r.pasos) : [];
    const tiene = pasos.some((x) => s(x.producto_cod).toUpperCase() === cod);
    if (N.has(f) && !tiene) {
      const nuevo = { descripcion: s(prod.nombre).slice(0, 200), producto_cod: cod, cantidad: 0, unidad: s(prod.beta_contenido_unidad) || s(prod.unidad_consumo) || s(prod.unidad), minutos: 0, auto: true };
      const id = r ? s(r.id) : "pr-" + f.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await guardarProto(ctx, ses, id, r || { sku: f, nombre: nombresFacial.get(f) || f, origen: "beta" }, [...pasos, nuevo]);
      tocados.push(f);
    } else if (!N.has(f) && P.has(f) && r && tiene) {
      await guardarProto(ctx, ses, s(r.id), r, pasos.filter((x) => s(x.producto_cod).toUpperCase() !== cod));
      tocados.push(f);
    }
  }
  return tocados;
}

/** Protocolo → productos: los productos de los pasos quedan marcados en ese facial; los que salieron, desmarcados. */
export async function protocoloAProductos(ctx: Ctx, ses: Ses, facial: string, pasosNuevos: Row[], pasosPrevios: Row[]): Promise<number> {
  const F = facial.toUpperCase();
  const N = new Set(pasosNuevos.map((x) => s(x.producto_cod).toUpperCase()).filter(Boolean));
  const P = new Set(pasosPrevios.map((x) => s(x.producto_cod).toUpperCase()).filter(Boolean));
  if (!N.size && !P.size) return 0;
  const prods = (await todas(ctx, "erp_productos")).filter((p) => !s(p.beta_eliminado_at));
  let k = 0;
  for (const p of prods) {
    const cod = skuCode(s(p.sku)); if (!N.has(cod) && !P.has(cod)) continue;
    const ap = arrDe(p.beta_aplica_faciales).map((x) => s(x).toUpperCase());
    let L = ap;
    if (N.has(cod) && !ap.includes(F)) L = [...ap, F];
    else if (!N.has(cod) && P.has(cod) && ap.includes(F)) L = ap.filter((x) => x !== F);
    if (L === ap) continue;
    await ctx.db.write(actorOf(ses), "erp_productos", "update", { id: s(p.id) }, { beta_aplica_faciales: L, beta_editado_por: s(ses.name), beta_editado_at: ctx.now.toISOString() });
    k++;
  }
  return k;
}
