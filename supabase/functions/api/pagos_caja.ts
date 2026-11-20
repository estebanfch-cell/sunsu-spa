// TK19 Pagos + caja chica: reglas puras (sin base de datos) para probarlas.
// TK82: redondeo de tickets migrados (cobrado del sistema anterior es la verdad si la
// diferencia con las líneas es ≤ $0.05) y filas de pago legado con el método real.
import { n, repartirPagos, round2, s, saldoPendiente, type Row } from "./domain.ts";

export const METODOS = ["efectivo", "tarjeta", "transferencia", "deuna", "gift_card", "otro"] as const;
export const ETQ_METODO: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", deuna: "DeUna", gift_card: "Gift card", otro: "Método no registrado", canje: "Canje (paquete/gift)", cortesía: "Cortesía", corte: "Método no registrado", "gift card": "Gift card", mixto: "Varios métodos", sin: "Método no registrado", no_registrado: "Método no registrado" };
/** Tipos de movimiento: los que sacan plata de la caja (salida) y los que la meten (entrada). */
export const SALEN = new Set(["gasto", "consumo", "deposito", "propina_pago"]);
/** TK164 (Emilia t757u): lo que recepción/personal puede registrar. Ingresos y propinas solo admin (los ingresos entran solos). */
export const MOV_PERSONAL = new Set(["gasto", "consumo", "deposito"]);
export const ENTRAN = new Set(["ingreso", "propina_entrada"]);
export const ETQ_CAJA: Record<string, string> = {
  apertura: "⚖️ Apertura", ingreso: "➕ Ingreso", gasto: "💸 Gasto", consumo: "🧾 Consumo", deposito: "🏦 Entrega para depósito", propina_entrada: "💝 Propina (entrada)",
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

const METODOS_PAGO = new Set(["efectivo", "tarjeta", "transferencia", "deuna", "gift_card", "gift card", "canje", "cortesía", "cortesia", "mixto"]);
/** Métodos de cobro reales. «Corte» u otro texto suelto no se adivina: se muestra «Método no registrado». */
export function esMetodoPago(m: unknown): boolean {
  return METODOS_PAGO.has(s(m).toLowerCase());
}
export function metodoVisible(m: unknown): string {
  const x = s(m).toLowerCase();
  return esMetodoPago(x) ? (x === "cortesia" ? "cortesía" : x === "gift card" ? "gift_card" : x) : "no_registrado";
}
/** En el sheet, Tarje:950 y Trans:59585784 son vouchers; Efect:40.33 es el monto en efectivo. */
export function esVoucherPago(num: number, total: number, metodo?: string): boolean {
  if (!Number.isFinite(num) || !(num > 0)) return false;
  const met = s(metodo).toLowerCase();
  if (met === "tarjeta") return true;
  if (met === "transferencia") return Number.isInteger(num) || num > round2(total) + 0.05;
  if (met === "efectivo") return num > round2(total) + 0.05;
  return num > round2(total) + 0.05;
}

function filaPago(base: Row, metodo: string, m: number, ref: string): Row {
  const met = metodoVisible(metodo);
  return { ...base, metodo: met, monto: round2(m), ref: s(ref), nombre: ETQ_METODO[met] || "Método no registrado" };
}

/** Formas de pago de Migo (`formas_pago: [{forma, valor}]`) si suman cerca del total. */
export function filasDesdeMigo(formas: Row[] | undefined, total: number, fecha?: string, comps?: Row[]): Row[] {
  if (!formas || !formas.length) return [];
  const base = { fuente: "sistema", fecha: fecha || "", registrado_por: "Sistema anterior" };
  const rows: Row[] = [];
  for (const f of formas) {
    const met = metodoVisible(f.forma || f.metodo);
    const amt = round2(n(f.valor ?? f.monto));
    if (!(amt > 0)) continue;
    const ref = s(f.ref) || s((comps || []).find((c) => metodoVisible(c.metodo) === met && esVoucherPago(Number(s(c.ref).replace(",", ".")), total, met))?.ref);
    rows.push(filaPago(base, met, amt, ref));
  }
  const sum = round2(rows.reduce((a, x) => a + n(x.monto), 0));
  if (!rows.length || (rows.length === 1 && rows[0].metodo === "no_registrado")) return [];
  if (Math.abs(sum - round2(total)) > Math.max(0.05, round2(total) * 0.02) && rows.length > 1) return [];
  return rows;
}

/** Reparte un mixto: un valor ≤ total es monto; uno mayor (voucher / id de transferencia) se deja como referencia y el resto va a ese método. */
export function repartirMixto(comp: unknown, total: number): Row[] | null {
  const T = round2(total);
  const money = metodosPago(comp).map((m) => ({ ...m, metodo: metodoVisible(m.metodo) }))
    .filter((m) => m.metodo !== "canje" && m.metodo !== "cortesía" && m.metodo !== "no_registrado");
  if (money.length < 2) return null;
  const parsed = money.map((m) => {
    const raw = s(m.ref).replace(",", ".");
    const num = raw && Number.isFinite(Number(raw)) ? Number(raw) : NaN;
    const esMonto = Number.isFinite(num) && num > 0 && !esVoucherPago(num, T, s(m.metodo));
    return { metodo: s(m.metodo), ref: s(m.ref), num, esMonto };
  });
  const mon = parsed.filter((p) => p.esMonto);
  const vou = parsed.filter((p) => !p.esMonto);
  const base: Row[] = [];
  if (mon.length >= 2 && Math.abs(round2(mon.reduce((a, p) => a + p.num, 0)) - T) <= 0.05) {
    return mon.map((p) => ({ metodo: p.metodo, monto: round2(p.num), ref: "" }));
  }
  if (mon.length === 1 && vou.length >= 1) {
    const amt = round2(mon[0].num);
    const resto = round2(T - amt);
    if (resto >= -0.009) {
      if (amt > 0) base.push({ metodo: mon[0].metodo, monto: amt, ref: "" });
      if (resto > 0.009) {
        if (vou.length === 1) base.push({ metodo: vou[0].metodo, monto: resto, ref: vou[0].ref });
        else return null;
      }
      return base.length ? base : null;
    }
  }
  return null;
}

/** Filas de pago del sistema anterior, con el método y voucher reales (no un texto suelto). */
export function filasPagoLegado(comp: unknown, monto: number, fecha?: string, formasMigo?: Row[]): Row[] {
  const total = round2(n(monto));
  if (!(total > 0)) return [];
  const base = { fuente: "sistema", fecha: fecha || "", registrado_por: "Sistema anterior" };
  const fila = (metodo: string, m: number, ref: string) => filaPago(base, metodo, m, ref);
  const deMigo = filasDesdeMigo(formasMigo, total, fecha, metodosPago(comp));
  if (deMigo.length) return deMigo;
  const ms = metodosPago(comp);
  const money = ms.map((m) => ({ ...m, metodo: metodoVisible(m.metodo) })).filter((m) => m.metodo !== "canje" && m.metodo !== "cortesía");
  if (!money.length || money.every((m) => m.metodo === "no_registrado")) {
    return [fila("no_registrado", total, s(ms[0]?.ref))];
  }
  const reales = money.filter((m) => m.metodo !== "no_registrado");
  if (reales.length === 1) return [fila(s(reales[0].metodo), total, s(reales[0].ref))];
  const split = repartirMixto(comp, total);
  if (split && split.length) return split.map((x) => fila(s(x.metodo), n(x.monto), s(x.ref)));
  const parts = repartirPagos(s(comp), total);
  const keys: [string, number][] = [["efectivo", parts.efectivo], ["tarjeta", parts.tarjeta], ["transferencia", parts.transferencia]];
  const rows: Row[] = [];
  for (const [met, amt] of keys) {
    if (amt > 0) {
      const ref0 = s(reales.find((x) => x.metodo === met)?.ref);
      const num = Number(ref0.replace(",", "."));
      rows.push(fila(met, amt, Number.isFinite(num) && !esVoucherPago(num, total, met) ? "" : ref0));
    }
  }
  const cubierto = round2(rows.reduce((a, x) => a + n(x.monto), 0));
  if (parts.mixto > 0 || cubierto + 0.009 < total) {
    const resto = round2(total - cubierto);
    if (resto > 0) {
      const ref = reales.map((m) => [ETQ_METODO[s(m.metodo)] || m.metodo, m.ref].filter(Boolean).join(" ")).join(", ");
      rows.push(fila("mixto", resto, ref || s(comp)));
    }
  }
  if (!rows.length) {
    const ref = reales.map((m) => [ETQ_METODO[s(m.metodo)] || m.metodo, m.ref].filter(Boolean).join(" ")).join(", ");
    rows.push(fila("mixto", total, ref || s(comp)));
  }
  return rows;
}
