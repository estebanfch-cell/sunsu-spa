// TK97 (Emilia 18/11 17:03): en Migo el SKU SUNSU-35 «GIFT CARD» a $3.00 (con IVA) NO es una venta de gift card:
// es la CAJA física de la gift card (producto INV-123 «Caja de gift card», $3.00 con IVA). Las ventas reales de
// gift card siguen usando SUNSU-35 con su valor ($65, $68, $75…), así que el alias aplica solo cuando el precio
// unitario con IVA de la línea es $3.00 (±$0.05). Nunca se empareja por nombre.
import { round2, s, skuCode } from "./domain.ts";

export const CAJA_GIFT = { sku: "INV-123", nombre: "Caja de gift card", pvp: 3, tipo: "producto" } as const;

/** SKU beta de una línea de factura Migo, con el alias de la caja de gift card. */
export function aliasMigo(codigo: unknown, unitConIva: number): string {
  const code = skuCode(s(codigo));
  if (code === "35" && Math.abs(round2(Number(unitConIva) || 0) - CAJA_GIFT.pvp) <= 0.05) return CAJA_GIFT.sku;
  return code;
}
