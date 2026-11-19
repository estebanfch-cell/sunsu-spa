// TK98 (Emilia 18/11): cuando ticket(s) y factura no cuadran, decir QUÉ SKU/línea hace la diferencia.
// Se compara solo por SKU (nunca por nombre), con el total con IVA de cada línea.
// TK133: el catálogo da el precio de las líneas reconstruidas de la hoja (sin él salía «ticket $0.00»).
// Los alias de TK127 (INV-110 = ML-008) se resuelven a un SKU canónico; nunca se compara por nombre.
import { n, round2, s, skuCode, type Row } from "./domain.ts";
import { expandirLineasGiftCaja } from "./alias_migo.ts";
import { lineasDeTicket, normalizarLineaFactura, type LineaNorm } from "./migo_lineas.ts";
import { descuentoDeTicket, esCanjeCero } from "./cuadre_lineas.ts";
import { resolverSku, type AliasMap } from "./inventario_modelo.ts";

type Acum = { sku: string; codigo: string; nombre: string; q: number; tot: number };
const $ = (v: number) => "$" + Number(v || 0).toFixed(2);
function visible(sku: string, codigo: string): string {
  if (codigo) return codigo;
  return /^\d+$/.test(sku) ? "SUNSU-" + sku : sku;
}
function claveSku(sku: string, aliases?: AliasMap): string {
  const c = skuCode(sku);
  return aliases && aliases.size ? (resolverSku(c, aliases) || c) : c;
}
function agrupar(L: LineaNorm[], aliases?: AliasMap): Map<string, Acum> {
  const m = new Map<string, Acum>();
  for (const l of L) {
    if (!l.sku) continue;
    const k = claveSku(l.sku, aliases);
    const a = m.get(k) || { sku: k, codigo: "", nombre: "", q: 0, tot: 0 };
    a.q += l.cantidad || 0;
    a.tot = round2(a.tot + (l.totalCon || 0));
    if (!a.codigo && /[A-Z]/i.test(s(l.codigo))) a.codigo = s(l.codigo);
    if (!a.nombre) a.nombre = s(l.nombre);
    m.set(k, a);
  }
  return m;
}

export type CatCuadre = Map<string, { nombre?: string; pvpConIva?: number; pvpSinIva?: number }>;

/** Total del ticket para el letrero de cuadre: suma de líneas (canje $0 no cuenta). Si no hay precios, el estimado de la hoja. */
export function totalTicketCuadre(t: Row, catalogo?: CatCuadre): number {
  const L = lineasDeTicket(t, catalogo);
  const sum = round2(L.filter((l) => !esCanjeCero(l)).reduce((a, l) => a + (l.totalCon || 0), 0));
  if (sum > 0) return round2(Math.max(0, sum - descuentoDeTicket(t)));
  return round2(n(t.estimado));
}

/** Diferencias por SKU entre la factura y el/los ticket(s): «Falta en ticket: SUNSU-35 GIFT CARD $3.00». */
export function difPorSku(facLineas: Row[] | undefined, tickets: Row[], catalogo?: CatCuadre, aliases?: AliasMap): string[] {
  const F = agrupar(expandirLineasGiftCaja(facLineas).map((l) => normalizarLineaFactura(l)).filter(Boolean) as LineaNorm[], aliases);
  const T = agrupar(tickets.flatMap((t) => lineasDeTicket(t, catalogo)), aliases);
  const out: string[] = [];
  for (const [k, f] of F) {
    const t = T.get(k);
    const nom = (visible(k, f.codigo) + " " + f.nombre).trim();
    if (!t) { out.push("Falta en ticket: " + nom + " " + $(f.tot)); continue; }
    if (Math.abs(t.tot - f.tot) > 0.05) out.push("Distinto: " + nom + " ticket " + $(t.tot) + (t.q !== f.q ? " (×" + t.q + ")" : "") + " vs factura " + $(f.tot) + (t.q !== f.q ? " (×" + f.q + ")" : ""));
  }
  for (const [k, t] of T) {
    if (F.has(k) || !(t.tot > 0)) continue;
    out.push("Sobra en ticket: " + (visible(k, t.codigo) + " " + t.nombre).trim() + " " + $(t.tot));
  }
  return out;
}
