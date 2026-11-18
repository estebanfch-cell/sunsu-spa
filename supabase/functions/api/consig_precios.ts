// TK70: precio de consignación (sin IVA) por familia+SKU. No es el costo_promedio ni
// la «Compra real» de la ficha: es lo que se le paga al proveedor en la liquidación,
// por defecto el de la última OC enviada, editable por el admin.
import { n, round2, s, skuCode, type Row } from "./domain.ts";
import type { Db } from "./lib.ts";

export type PrecioConsig = { sku: string; precio: number; fuente: "manual" | "oc" | "costo"; oc_numero?: string };

function skuNorm(raw: unknown): string {
  return skuCode(s(raw).replace(/^SUNSU-/i, ""));
}

/** Precio que gana: el guardado a mano, si no el de la última OC, si no el costo_promedio. */
export function resolverPrecio(sku: string, opts: {
  guardados?: Map<string, { precio: number; fuente?: string; oc_numero?: string }>;
  ultimaOc?: Map<string, { precio: number; oc_numero?: string }>;
  costo?: number;
}): PrecioConsig {
  const code = skuNorm(sku);
  const g = opts.guardados?.get(code);
  if (g && n(g.precio) > 0 && s(g.fuente) === "manual") {
    return { sku: code, precio: n(g.precio), fuente: "manual", oc_numero: g.oc_numero };
  }
  const oc = opts.ultimaOc?.get(code);
  if (oc && n(oc.precio) > 0) return { sku: code, precio: n(oc.precio), fuente: "oc", oc_numero: oc.oc_numero };
  if (g && n(g.precio) > 0) return { sku: code, precio: n(g.precio), fuente: s(g.fuente) === "manual" ? "manual" : "oc", oc_numero: g.oc_numero };
  return { sku: code, precio: n(opts.costo), fuente: "costo" };
}

/** Recorre ordenes_compra (json del sistema viejo) y deja, por SKU, el precio de la última OC de esa familia. */
export function preciosDesdeOrdenes(ordenes: Row[], familia: string): Map<string, { precio: number; oc_numero: string; qLabel?: string }> {
  const fam = s(familia).toUpperCase();
  const out = new Map<string, { precio: number; oc_numero: string; qLabel?: string; n: string }>();
  const rows = [...ordenes].sort((a, b) => s(a.numorden).localeCompare(s(b.numorden)));
  for (const o of rows) {
    let j: Row = {};
    try { j = (typeof o.json === "string" ? JSON.parse(o.json) : (o.json || {})) as Row; } catch { continue; }
    const pf = s((j.prov as Row | undefined)?.familia).toUpperCase();
    if (pf && pf !== fam) continue;
    const numero = s(o.numorden);
    const qLabel = s(j.qLabel);
    for (const key of ["fact", "items", "directa"] as const) {
      const arr = Array.isArray(j[key]) ? j[key] as Row[] : [];
      for (const it of arr) {
        const sku = skuNorm(it.sku);
        const precio = n(it.compra);
        if (!sku || !(precio > 0)) continue;
        if (!pf && !sku.startsWith(fam + "-")) continue;
        const prev = out.get(sku);
        if (!prev || numero >= prev.n) out.set(sku, { precio, oc_numero: numero, qLabel, n: numero });
      }
    }
  }
  const clean = new Map<string, { precio: number; oc_numero: string; qLabel?: string }>();
  for (const [k, v] of out) clean.set(k, { precio: v.precio, oc_numero: v.oc_numero, qLabel: v.qLabel });
  return clean;
}

export async function cargarPreciosConsig(db: Db, familia: string): Promise<Map<string, PrecioConsig>> {
  const fam = s(familia).toUpperCase();
  let guardados: Row[] = [], ordenes: Row[] = [];
  try { guardados = await db.all("beta_consig_precios"); } catch { guardados = []; }
  try { ordenes = await db.all("ordenes_compra"); } catch { ordenes = []; }
  const gMap = new Map<string, { precio: number; fuente?: string; oc_numero?: string }>();
  for (const r of guardados) {
    if (s(r.familia).toUpperCase() !== fam) continue;
    const sku = skuNorm(r.sku);
    if (sku) gMap.set(sku, { precio: n(r.precio), fuente: s(r.fuente), oc_numero: s(r.oc_numero) });
  }
  const ocMap = preciosDesdeOrdenes(ordenes, fam);
  const skus = new Set([...gMap.keys(), ...ocMap.keys()]);
  const out = new Map<string, PrecioConsig>();
  for (const sku of skus) out.set(sku, resolverPrecio(sku, { guardados: gMap, ultimaOc: ocMap }));
  return out;
}

export function ocLegacyDelPeriodo(ordenes: Row[], familia: string, qLabel: string): Row | null {
  const fam = s(familia).toUpperCase();
  const q = s(qLabel);
  if (!q) return null;
  const hits: Row[] = [];
  for (const o of ordenes) {
    let j: Row = {};
    try { j = (typeof o.json === "string" ? JSON.parse(o.json) : (o.json || {})) as Row; } catch { continue; }
    if (s((j.prov as Row | undefined)?.familia).toUpperCase() !== fam) continue;
    if (s(j.qLabel) !== q) continue;
    const fact = Array.isArray(j.fact) ? j.fact as Row[] : [];
    let sub = 0;
    for (const it of fact) sub += n(it.vendido || it.cant) * n(it.compra);
    hits.push({ numero: s(o.numorden), fecha: s(o.fecha), qLabel: q, subtotal: round2(sub), iva: round2(sub * 0.15), total: round2(round2(sub) + round2(sub * 0.15)), proveedor: s(o.proveedor) });
  }
  hits.sort((a, b) => s(a.numero).localeCompare(s(b.numero)));
  return hits.length ? hits[hits.length - 1] : null;
}
