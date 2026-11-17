// TK19 Pagos + caja chica: reglas puras (sin base de datos) para probarlas.
import { n, round2, s, type Row } from "./domain.ts";

export const METODOS = ["efectivo", "tarjeta", "transferencia", "deuna", "gift_card", "otro"] as const;
export const ETQ_METODO: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", deuna: "DeUna", gift_card: "Gift card", otro: "Otro", canje: "Canje (paquete/gift)", corte: "Corte", mixto: "Varios métodos", sin: "Sin método" };
/** Tipos de movimiento: los que sacan plata de la caja (salida) y los que la meten (entrada). */
export const SALEN = new Set(["gasto", "deposito", "propina_pago"]);
export const ENTRAN = new Set(["ingreso", "propina_entrada"]);
export const ETQ_CAJA: Record<string, string> = {
  apertura: "⚖️ Apertura", ingreso: "➕ Ingreso", gasto: "💸 Gasto", deposito: "🏦 Depósito al banco", propina_entrada: "💝 Propina (entrada)",
  propina_pago: "💝 Pago de propinas", efectivo_ticket: "🎫 Efectivo de ticket", ajuste: "⚖️ Ajuste", cuadre: "⚖️ Cuadre",
};
export const CATEGORIAS_GASTO = ["Insumos de cabina", "Limpieza", "Transporte / envíos", "Alimentación", "Mantenimiento", "Papelería", "Servicios básicos", "Otros"];

export function saldoDe(movs: Row[]): number {
  return round2(movs.filter((m) => m.anulado !== true).reduce((a, m) => a + n(m.entrada) - n(m.salida), 0));
}
/** Monto con 2 decimales; acepta coma. NaN si no es número positivo. */
export function montoDe(v: unknown): number {
  const x = Number(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(x) && x > 0 ? round2(x) : NaN;
}
/** Pagos de la beta de un ticket (no anulados). */
export function pagosDe(pagos: Row[], clave: string): Row[] {
  return pagos.filter((p) => s(p.ticket_clave) === clave && p.anulado !== true).sort((a, b) => s(a.fecha).localeCompare(s(b.fecha)));
}
/** Método de un ticket del sistema anterior (columna comp): uno solo, varios, canje o ninguno. */
export function metodoLegado(metodos: Row[]): string {
  const L = [...new Set(metodos.map((m) => s(m.metodo)))].filter(Boolean);
  if (!L.length) return "sin";
  if (L.length > 1) return "mixto";
  return L[0];
}
