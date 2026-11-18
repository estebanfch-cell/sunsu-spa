// TK98 (Emilia 18/11 17:03): en Migo el SKU SUNSU-35 «GIFT CARD» a $3.00 (con IVA) NO es una venta de gift card:
// es la CAJA física de la gift card (producto INV-123 «Caja de gift card», $3.00 con IVA). El alias aplica solo
// cuando el precio unitario con IVA de la línea es $3.00 (±$0.05). Nunca se empareja por nombre.
// TK101 (Emilia 18/11 17:23): SUNSU-35 a $68.00 (±$0.05) = gift card Facial Premium $65 + caja $3; se parte
// en dos líneas (gift $65 + INV-123 $3). $65 / $75 / $148 (u otro valor) siguen siendo una gift card de ese valor.
import { n, round2, s, skuCode, type Row } from "./domain.ts";

export const CAJA_GIFT = { sku: "INV-123", nombre: "Caja de gift card", pvp: 3, tipo: "producto" } as const;
export const GIFT_SKU = "35";
export const GIFT_CODIGO = "SUNSU-35";
export const GIFT_PREMIUM_IVA = 65;
export const GIFT_CAJA_BUNDLE_IVA = 68;

export function cercaMonto(a: number, b: number, tol = 0.05): boolean {
  return Math.abs(round2(Number(a) || 0) - round2(Number(b) || 0)) <= tol;
}

/** SKU beta de una línea de factura Migo, con el alias de la caja de gift card (solo a $3). */
export function aliasMigo(codigo: unknown, unitConIva: number): string {
  const code = skuCode(s(codigo));
  if (code === GIFT_SKU && cercaMonto(unitConIva, CAJA_GIFT.pvp)) return CAJA_GIFT.sku;
  return code;
}

export function esGiftConCajaBundled(codigo: unknown, unitConIva: number): boolean {
  return skuCode(s(codigo)) === GIFT_SKU && cercaMonto(unitConIva, GIFT_CAJA_BUNDLE_IVA);
}

function totalLineaConIva(l: Row): number {
  const q = n(l.cantidad) || 1;
  if (n(l.total) > 0) return round2(n(l.total));
  if (n(l.total_linea) > 0) return round2(n(l.total_linea));
  const sub = n(l.subtotal) || round2((n(l.precio_unit) || n(l.precio_unitario) || 0) * q - n(l.descuento));
  if (!(sub > 0)) return 0;
  return round2(sub + (n(l.iva) > 0 ? n(l.iva) : sub * 0.15));
}

function desgloseConIva(totalCon: number): { sub: number; iva: number; total: number } {
  const total = round2(totalCon);
  const sub = round2(total / 1.15);
  return { sub, iva: round2(total - sub), total };
}

/** SUNSU-35 a $68 → gift $65 + INV-123 $3 (misma cantidad). Cualquier otra línea queda igual. */
export function partirLineaGiftCaja(l: Row): Row[] {
  const codigo = s(l.codigo || l.sku);
  const q = n(l.cantidad) || 1;
  const tot = totalLineaConIva(l);
  const unit = q ? tot / q : tot;
  if (!esGiftConCajaBundled(codigo, unit)) return [l];
  const gift = desgloseConIva(GIFT_PREMIUM_IVA * q);
  const caja = desgloseConIva(CAJA_GIFT.pvp * q);
  const nombreGift = s(l.producto || l.nombre) || "GIFT CARD";
  return [
    {
      ...l,
      codigo: GIFT_CODIGO,
      sku: GIFT_CODIGO,
      producto: nombreGift,
      nombre: nombreGift,
      cantidad: q,
      precio_unit: gift.sub,
      subtotal: gift.sub,
      iva: gift.iva,
      total: gift.total,
      total_linea: gift.total,
    },
    {
      ...l,
      codigo: CAJA_GIFT.sku,
      sku: CAJA_GIFT.sku,
      producto: CAJA_GIFT.nombre,
      nombre: CAJA_GIFT.nombre,
      cantidad: q,
      precio_unit: caja.sub,
      subtotal: caja.sub,
      iva: caja.iva,
      total: caja.total,
      total_linea: caja.total,
    },
  ];
}

export function expandirLineasGiftCaja(lineas: Row[] | undefined | null): Row[] {
  return (lineas || []).flatMap((l) => partirLineaGiftCaja(l));
}
