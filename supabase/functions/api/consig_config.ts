// 🤝 Consignación por proveedor (TK34, Emilia 18/11): cada proveedor (= familia de productos) tiene su
// interruptor «Consignación» (tabla beta_proveedores_ficha). ON → todos sus productos entran a consignación;
// un producto se puede apagar solo (erp_productos.beta_origen = "propio") y entonces se compra con OC normal
// y entra al inventario normal. Sin la tabla (o vacía) rige lo de antes: HT, AS, ML, PH, JN.
import type { Ctx } from "./lib.ts";
import { s, skuCode, type Row } from "./domain.ts";
import { vendeDesdeCabina } from "./ventas.ts";

export const FAM_CONSIG_DEF = ["HT", "AS", "ML", "PH", "JN"];
/** Familia (código del proveedor) de un SKU: HT-007 → HT. */
export function famDe(sku: string): string { const m = skuCode(s(sku)).match(/^([A-Z]{2,6})-/); return m ? m[1] : ""; }
export async function fichasProv(ctx: Ctx): Promise<Row[] | null> { try { return await ctx.db.all("beta_proveedores_ficha"); } catch { return null; } }
/** Familias con consignación ON. */
export async function famsConsig(ctx: Ctx): Promise<Set<string>> {
  const f = await fichasProv(ctx);
  if (!f || !f.length) return new Set(FAM_CONSIG_DEF);
  return new Set(f.filter((r) => r.consignacion === true).map((r) => s(r.familia).toUpperCase()));
}
/** ¿El producto entra a consignación? Proveedor ON y el producto no apagado; las máscaras que se venden desde Cabina nunca. */
export function consigEfectiva(p: Row | undefined, on: Set<string>): boolean {
  if (!p || vendeDesdeCabina(p)) return false;
  return on.has(famDe(s(p.sku))) && s(p.beta_origen) !== "propio";
}
