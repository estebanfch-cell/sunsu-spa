// Cálculo del detalle de ticket de la beta (sin imports de handlers: lo usan la API y las comisiones).
// Precios con IVA (como el PVP del catálogo). Total de línea = cantidad × precio − descuento de línea.
// Total del ticket = Σ líneas − promo − descuento del ticket. Subtotal = total / 1.15; IVA = total − subtotal.
import { n, round2, s, skuCode, type Row } from "./domain.ts";

export const IVA_TK = 1.15;
export interface LineaTk { id?: string; tipo: string; sku: string; nombre?: string; cantidad: number; precio_unit: number; descuento_tipo?: string | null; descuento_valor?: number; excluir_comision?: boolean; estimado?: boolean; canje?: boolean; cortesia?: boolean }
export interface Promo { nombre: string; tipo: string; valor: number; valor2?: number; codigos: string[] }

export function descuentoDe(base: number, tipo: string | null | undefined, valor: number): number {
  if (!(base > 0) || !(valor > 0)) return 0;
  if (tipo === "%") return round2(base * Math.min(100, valor) / 100);
  if (tipo === "$") return round2(Math.min(base, valor));
  return 0;
}
/** Promo del ticket (misma regla que el ticket del sistema: solo cae sobre los ítems de sus códigos). */
export function promoMonto(p: Promo | null | undefined, lineas: { sku: string; cantidad: number; unit: number; tipo: string }[]): number {
  if (!p) return 0;
  const cods = (p.codigos || []).map((c) => skuCode(c));
  const units: { p: number; pack: boolean }[] = [];
  for (const l of lineas) {
    if (cods.length && !cods.includes(skuCode(l.sku))) continue;
    for (let i = 0; i < Math.round(l.cantidad); i++) units.push({ p: l.unit, pack: l.tipo === "paquete" });
  }
  const sum = units.reduce((a, u) => a + u.p, 0);
  const t = s(p.tipo).toUpperCase();
  let m = 0;
  if (t === "$") m = Math.min(n(p.valor), sum);
  else if (t === "NXM") {
    const N = Math.round(n(p.valor)), M = Math.round(n(p.valor2));
    if (N >= 2 && M >= 1 && M < N) {
      const ps = units.map((u) => u.p).sort((a, b) => b - a);
      const libres = Math.floor(ps.length / N) * (N - M);
      for (let i = ps.length - libres; i < ps.length; i++) m += ps[i];
    }
  } else if (t === "PACK") { for (const u of units) if (u.pack) m += Math.max(0, u.p - n(p.valor)); }
  else m = sum * n(p.valor) / 100;
  return round2(m);
}
export function calcularTicket(lineas: LineaTk[], desc: { tipo?: string | null; valor?: number }, promo?: Promo | null) {
  const L = lineas.map((l) => {
    const bruto = round2(n(l.cantidad) * n(l.precio_unit));
    const dm = descuentoDe(bruto, l.descuento_tipo, n(l.descuento_valor));
    return { ...l, cantidad: n(l.cantidad), precio_unit: round2(n(l.precio_unit)), descuento_valor: n(l.descuento_valor), descuento_monto: dm, total_linea: round2(bruto - dm) };
  });
  const sumaLineas = round2(L.reduce((a, l) => a + l.total_linea, 0));
  const pm = Math.min(sumaLineas, promoMonto(promo, L.map((l) => ({ sku: l.sku, cantidad: l.cantidad, unit: l.cantidad ? l.total_linea / l.cantidad : 0, tipo: l.tipo }))));
  const base = round2(sumaLineas - pm);
  const dt = descuentoDe(base, desc.tipo, n(desc.valor));
  const total = round2(base - dt);
  const subtotal = round2(total / IVA_TK);
  return { lineas: L, sumaLineas, promoMonto: pm, descuentoMonto: dt, total, subtotal, iva: round2(total - subtotal), descuentoTotal: round2(L.reduce((a, l) => a + l.descuento_monto, 0) + pm + dt) };
}

/** Clave del ticket: la misma que usa la lista (número SO; si no, número beta; si no, r<fila>). */
export function claveDe(r: Row, so: string): string {
  return so || s(r.beta_num) || (r.sheet_row != null && r.sheet_row !== "" ? "r" + s(r.sheet_row) : s(r.id));
}

/** Comisiones: aplica sobre el ticket del sistema las exclusiones y las líneas editadas en la beta. */
export function overlayComision<T extends { productos: { sku: string; qty: number }[]; exclFacial: boolean; exclPaquete: boolean; exclProducto: boolean; exclExtras: boolean; extras?: string; facial?: string }>(t: T, cab: Row | undefined, lineas: Row[] | undefined): T {
  if (!cab) return t;
  const out = { ...t };
  if (cab.excluir_cosmetologa === true) { out.exclFacial = true; out.exclPaquete = true; out.exclProducto = true; out.exclExtras = true; return out; }
  const L = lineas || [];
  if (cab.lineas_beta === true) {
    out.productos = L.filter((l) => s(l.tipo) === "producto" && l.excluir_comision !== true).map((l) => ({ sku: s(l.sku), qty: n(l.cantidad) }));
    // Extras: los de la beta (sin los excluidos), en el formato «SKU nombre | …» que leen las comisiones.
    const ex: string[] = [];
    for (const l of L.filter((x) => s(x.tipo) === "extra" && x.excluir_comision !== true)) for (let i = 0; i < Math.max(1, Math.round(n(l.cantidad))); i++) ex.push((s(l.sku) + " " + s(l.nombre)).trim());
    out.extras = ex.join(" | ");
  } else {
    const fuera = new Set(L.filter((l) => s(l.tipo) === "producto" && l.excluir_comision === true).map((l) => skuCode(s(l.sku))));
    if (fuera.size) out.productos = t.productos.filter((p) => !fuera.has(skuCode(p.sku)));
    if (L.some((l) => s(l.tipo) === "extra" && l.excluir_comision === true)) out.exclExtras = true;
  }
  if (L.some((l) => s(l.tipo) === "facial" && l.excluir_comision === true)) out.exclFacial = true;
  if (L.some((l) => s(l.tipo) === "paquete" && l.excluir_comision === true)) out.exclPaquete = true;
  return out;
}

/** Carga lo editado en la beta y devuelve una función que lo aplica a cada ticket del cálculo de comisiones. */
export async function overlayDe(db: { all: (t: string) => Promise<Row[]> }) {
  let cabs: Row[] = [], lins: Row[] = [];
  try { cabs = await db.all("beta_tickets"); lins = await db.all("beta_ticket_lineas"); } catch { return <T>(_r: Row, t: T) => t; }
  if (!cabs.length) return <T>(_r: Row, t: T) => t;
  const { leerSerie } = await import("./series.ts");
  const C = new Map(cabs.map((c) => [s(c.clave), c]));
  const P = new Map<string, Row[]>();
  for (const l of lins) { const k = s(l.ticket_clave); P.set(k, [...(P.get(k) || []), l]); }
  // deno-lint-ignore no-explicit-any
  return <T>(r: Row, t: T): T => { const k = claveDe(r, leerSerie(r, "so_num")); return overlayComision(t as any, C.get(k), P.get(k)) as T; };
}
