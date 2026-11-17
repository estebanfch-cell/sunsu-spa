// Compras de la beta como los Tickets (Emilia 17/11): estados de la OC sin «Borrador», numeración anual
// OC-AAAA-NNNN, estado de pago, y cotizaciones de proveedor aparte. Funciones puras (pruebas).
import { n, round2, s, type Row } from "./domain.ts";

export const ESTADOS_OC = ["Por recibir", "Recibida parcial", "Recibida", "Cancelada"] as const;

/** Siguiente número del año: OC-2026-0001, OC-2027-0001… Sigue después de los de la hoja (OC-2026-079 → OC-2026-0080). */
export function siguienteAnual(rows: Row[], prefijo: string, anio: number, campo = "numero"): string {
  let m = 0;
  const re = new RegExp("^" + prefijo + "-" + anio + "-(\\d+)$");
  for (const r of rows) { const x = s(r[campo]).match(re); if (x) m = Math.max(m, Number(x[1])); }
  return prefijo + "-" + anio + "-" + String(m + 1).padStart(4, "0");
}
/** Línea anulada por completo («No recibido» de todo lo pedido). */
export const lineaAnulada = (l: Row) => n(l.recibido) <= 0 && n(l.no_recibido) + 1e-9 >= n(l.cantidad ?? l.pedido);
export function estadoOc(o: Row, lineas: Row[], legacy = false): string {
  if (s(o.estado) === "cancelada") return "Cancelada";
  if (s(o.flujo) === "Borrador" || s(o.estado) === "borrador") return "Cotización";
  if (legacy) return "Histórica";
  const ped = (l: Row) => n(l.cantidad ?? l.pedido);
  const vivas = lineas.filter((l) => !lineaAnulada(l));
  if (lineas.length && !vivas.length) return "Cancelada";
  const alguna = vivas.some((l) => n(l.recibido) > 0);
  const todas = vivas.length > 0 && vivas.every((l) => n(l.recibido) + n(l.no_recibido) + 1e-9 >= ped(l));
  if (todas && alguna) return "Recibida";
  if (alguna) return "Recibida parcial";
  return "Por recibir";
}
export function estadoPago(total: number, pagado: number): string {
  if (total > 0 && pagado + 0.009 >= total) return "Pagada";
  if (pagado > 0) return "Saldo pendiente";
  return "Por pagar";
}
/** Totales de líneas con IVA 15 % (o sin IVA). */
export function totales(lineas: Row[], conIva = true): { subtotal: number; iva: number; total: number } {
  const subtotal = round2(lineas.reduce((a, l) => a + round2(n(l.cantidad) * n(l.precio)), 0));
  const iva = conIva ? round2(subtotal * 0.15) : 0;
  return { subtotal, iva, total: round2(subtotal + iva) };
}
