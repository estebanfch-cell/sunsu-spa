// TK98 (Emilia 18/11): cuando ticket(s) y factura no cuadran, decir QUÉ SKU/línea hace la diferencia.
// Se compara solo por SKU (nunca por nombre), con el total con IVA de cada línea.
import { round2, s, type Row } from "./domain.ts";
import { expandirLineasGiftCaja } from "./alias_migo.ts";
import { lineasDeTicket, normalizarLineaFactura, type LineaNorm } from "./migo_lineas.ts";

type Acum = { sku: string; codigo: string; nombre: string; q: number; tot: number };
const $ = (v: number) => "$" + Number(v || 0).toFixed(2);
function visible(sku: string, codigo: string): string {
  if (codigo) return codigo;
  return /^\d+$/.test(sku) ? "SUNSU-" + sku : sku;
}
function agrupar(L: LineaNorm[]): Map<string, Acum> {
  const m = new Map<string, Acum>();
  for (const l of L) {
    if (!l.sku) continue;
    const a = m.get(l.sku) || { sku: l.sku, codigo: "", nombre: "", q: 0, tot: 0 };
    a.q += l.cantidad || 0;
    a.tot = round2(a.tot + (l.totalCon || 0));
    if (!a.codigo && /[A-Z]/i.test(s(l.codigo))) a.codigo = s(l.codigo);
    if (!a.nombre) a.nombre = s(l.nombre);
    m.set(l.sku, a);
  }
  return m;
}

/** Diferencias por SKU entre la factura y el/los ticket(s): «Falta en ticket: SUNSU-35 GIFT CARD $3.00». */
export function difPorSku(facLineas: Row[] | undefined, tickets: Row[], catalogo?: Map<string, { nombre?: string; pvpConIva?: number; pvpSinIva?: number }>): string[] {
  const F = agrupar(expandirLineasGiftCaja(facLineas).map((l) => normalizarLineaFactura(l)).filter(Boolean) as LineaNorm[]);
  const T = agrupar(tickets.flatMap((t) => lineasDeTicket(t, catalogo)));
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
