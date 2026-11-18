// TK19 Pagos + caja chica: reglas puras (sin base de datos) para probarlas.
// TK82: redondeo de tickets migrados (cobrado del sistema anterior es la verdad si la
// diferencia con las líneas es ≤ $0.05) y filas de pago legado con el método real.
import { n, repartirPagos, round2, s, saldoPendiente, type Row } from "./domain.ts";

export const METODOS = ["efectivo", "tarjeta", "transferencia", "deuna", "gift_card", "otro"] as const;
export const ETQ_METODO: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", deuna: "DeUna", gift_card: "Gift card", otro: "Otro", canje: "Canje (paquete/gift)", cortesía: "Cortesía", corte: "Corte", "gift card": "Gift card", mixto: "Varios métodos", sin: "Sin método" };
/** Tipos de movimiento: los que sacan plata de la caja (salida) y los que la meten (entrada). */
export const SALEN = new Set(["gasto", "deposito", "propina_pago"]);
export const ENTRAN = new Set(["ingreso", "propina_entrada"]);
export const ETQ_CAJA: Record<string, string> = {
  apertura: "⚖️ Apertura", ingreso: "➕ Ingreso", gasto: "💸 Gasto", deposito: "🏦 Depósito al banco", propina_entrada: "💝 Propina (entrada)",
  propina_pago: "💝 Pago de propinas", efectivo_ticket: "🎫 Efectivo de ticket", ajuste: "⚖️ Ajuste", cuadre: "⚖️ Cuadre",
};
export const CATEGORIAS_GASTO = ["Insumos de cabina", "Limpieza", "Transporte / envíos", "Alimentación", "Mantenimiento", "Papelería", "Servicios básicos", "Otros"];

/** Tope para tratar la diferencia líneas vs cobrado (Migo / sistema anterior) como redondeo, no saldo. */
export const REDONDEO_MAX = 0.05;

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

const METODO: [RegExp, string][] = [[/^efec/i, "efectivo"], [/^tarj/i, "tarjeta"], [/^tran/i, "transferencia"], [/^deuna/i, "deuna"], [/^canj/i, "canje"], [/^cort/i, "cortesía"], [/^gift|^gc/i, "gift card"]];
/** Forma de pago del sistema anterior (columna comp: «Tarje:950», «Trans:43959839», «Efect:10», o mixto). */
export function metodosPago(comp: unknown): Row[] {
  return s(comp).split(/\s*[,;|]\s*/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const [m, ref] = x.split(":");
    const met = METODO.find(([re]) => re.test(m.trim()))?.[1] || m.trim().toLowerCase();
    return { metodo: met, ref: s(ref).trim() };
  });
}

export type EstadoCobro = {
  total: number;
  cobrado: number;
  pagadoSis: number;
  pagadoBeta: number;
  pagado: number;
  saldo: number;
  redondeo: boolean;
  dif: number;
};

/** Total, pagado y saldo de un ticket. Si está cobrado en el sistema anterior y las líneas
 *  difieren ≤ $0.05, el cobrado es la verdad: total = cobrado, saldo 0 (no amarillo). */
export function estadoCobro(o: { cobrado: boolean; cobradoMonto: number; totalLineas: number; pagadoBeta?: number; anulado?: boolean }): EstadoCobro {
  const cobrado = o.cobrado ? round2(n(o.cobradoMonto)) : 0;
  const lineas = round2(n(o.totalLineas));
  const dif = cobrado > 0 ? round2(lineas - cobrado) : 0;
  const redondeo = cobrado > 0 && Math.abs(dif) > 0 && Math.abs(dif) <= REDONDEO_MAX;
  const total = redondeo ? cobrado : lineas;
  const pagadoSis = cobrado;
  const pagadoBeta = round2(n(o.pagadoBeta));
  const pagado = round2(pagadoSis + pagadoBeta);
  const saldo = o.anulado ? 0 : saldoPendiente(total, pagado);
  return { total, cobrado, pagadoSis, pagadoBeta, pagado, saldo, redondeo, dif };
}

/** Filas de pago del sistema anterior, con el método y voucher reales (no un texto suelto). */
export function filasPagoLegado(comp: unknown, monto: number, fecha?: string): Row[] {
  const total = round2(n(monto));
  if (!(total > 0)) return [];
  const base = { fuente: "sistema", fecha: fecha || "", registrado_por: "Sistema anterior" };
  const ms = metodosPago(comp);
  const money = ms.filter((m) => m.metodo !== "canje" && m.metodo !== "cortesía");
  const fila = (metodo: string, m: number, ref: string): Row => ({ ...base, metodo, monto: round2(m), ref: s(ref), nombre: ETQ_METODO[metodo] || metodo });
  if (!money.length) {
    const m0 = ms[0];
    return [fila(s(m0?.metodo) || "otro", total, s(m0?.ref))];
  }
  if (money.length === 1) return [fila(s(money[0].metodo), total, s(money[0].ref))];
  const parts = repartirPagos(s(comp), total);
  const keys: [string, number][] = [["efectivo", parts.efectivo], ["tarjeta", parts.tarjeta], ["transferencia", parts.transferencia]];
  const rows: Row[] = [];
  for (const [met, amt] of keys) {
    if (amt > 0) rows.push(fila(met, amt, s(money.find((x) => x.metodo === met)?.ref)));
  }
  const cubierto = round2(rows.reduce((a, x) => a + n(x.monto), 0));
  if (parts.mixto > 0 || cubierto + 0.009 < total) {
    const resto = round2(total - cubierto);
    if (resto > 0) {
      const ref = money.map((m) => [ETQ_METODO[s(m.metodo)] || m.metodo, m.ref].filter(Boolean).join(" ")).join(", ");
      rows.push(fila("mixto", resto, ref || s(comp)));
    }
  }
  if (!rows.length) {
    const ref = money.map((m) => [ETQ_METODO[s(m.metodo)] || m.metodo, m.ref].filter(Boolean).join(" ")).join(", ");
    rows.push(fila("mixto", total, ref || s(comp)));
  }
  return rows;
}
