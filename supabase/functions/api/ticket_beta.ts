// Cálculo del detalle de ticket de la beta (sin imports de handlers: lo usan la API y las comisiones).
// Precios con IVA (como el PVP del catálogo). Total de línea = cantidad × precio − descuento de línea.
// Total del ticket = Σ líneas − promo − descuento del ticket. Subtotal = total / 1.15; IVA = total − subtotal.
import { IVA, n, packSesiones, round2, s, skuCode, skuSunsu, type FacialLinea, type PaqueteLinea, type Row } from "./domain.ts";

export const IVA_TK = 1.15;
export interface LineaTk { id?: string; tipo: string; sku: string; nombre?: string; cantidad: number; precio_unit: number; descuento_tipo?: string | null; descuento_valor?: number; excluir_comision?: boolean; estimado?: boolean; canje?: boolean; cortesia?: boolean; promo?: string; paqueteSesion?: string; consumoInterno?: boolean; valorNominal?: number; gcCodigo?: string }
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

function prodDeLinea(l: Row): { sku: string; qty: number; ventaNeta?: number; compraComision?: number } {
  return {
    sku: s(l.sku), qty: n(l.cantidad) || 1,
    ...(l.snapshot_at != null && l.snapshot_at !== "" ? { ventaNeta: n(l.venta_neta), compraComision: n(l.compra_comision), comision: n(l.comision) } : {}),
  };
}
function productosDeLineas(L: Row[]) {
  return L.filter((l) => s(l.tipo) === "producto" && l.excluir_comision !== true).map(prodDeLinea);
}
function extrasDeLineas(L: Row[]): string[] {
  const ex: string[] = [];
  for (const l of L.filter((x) => s(x.tipo) === "extra" && x.excluir_comision !== true)) {
    for (let i = 0; i < Math.max(1, Math.round(n(l.cantidad))); i++) ex.push((s(l.sku) + " " + s(l.nombre)).trim());
  }
  return ex;
}
function extraKey(txt: string): string {
  return skuCode(txt) || s(txt).toLowerCase().trim();
}
function mergeProductos(legacy: { sku: string; qty: number; ventaNeta?: number; compraComision?: number }[], lineas: ReturnType<typeof productosDeLineas>) {
  const out = legacy.map((p) => ({ ...p }));
  for (const p of lineas) {
    const i = out.findIndex((x) => skuCode(x.sku) === skuCode(p.sku));
    if (i < 0) out.push({ ...p });
    else {
      if (p.qty > out[i].qty) out[i].qty = p.qty;
      if (p.ventaNeta != null) out[i].ventaNeta = p.ventaNeta;
      if (p.compraComision != null) out[i].compraComision = p.compraComision;
    }
  }
  return out;
}
function mergeExtras(legacy: string | undefined, L: Row[]): string {
  const fromLines = extrasDeLineas(L);
  const excl = new Set(L.filter((l) => s(l.tipo) === "extra" && l.excluir_comision === true).map((l) => extraKey(s(l.sku) + " " + s(l.nombre))));
  const have = new Map<string, number>();
  const out: string[] = [];
  for (const x of fromLines) { out.push(x); have.set(extraKey(x), (have.get(extraKey(x)) || 0) + 1); }
  for (const x of s(legacy).split("|").map((v) => v.trim()).filter(Boolean)) {
    const k = extraKey(x);
    if (excl.has(k)) continue;
    const c = have.get(k) || 0;
    if (c > 0) { have.set(k, c - 1); continue; }
    out.push(x);
  }
  return out.join(" | ");
}
function netoPaqueteLinea(l: Row, cab: Row, tipo: "pack3" | "pack6"): number {
  if (l.venta_neta != null && l.venta_neta !== "") return n(l.venta_neta);
  if (n(l.total_linea) > 0) return round2(n(l.total_linea) / IVA);
  if (tipo === "pack6" && cab.neto_pack6 != null && cab.neto_pack6 !== "") return n(cab.neto_pack6);
  if (cab.neto_pack != null && cab.neto_pack !== "") return n(cab.neto_pack);
  return 0;
}
function facialesDeLineas(L: Row[]): FacialLinea[] {
  const out: FacialLinea[] = [];
  for (const l of L.filter((x) => s(x.tipo) === "facial" && x.excluir_comision !== true)) {
    const sku = skuSunsu(l.sku, l.nombre);
    const cantidad = Math.max(1, Math.round(n(l.cantidad) || 1));
    if (sku) out.push({ sku, cantidad });
  }
  return out;
}
function tipoPackDe(l: Row): "pack3" | "pack6" {
  const sku = skuSunsu(l.sku, l.nombre);
  return packSesiones(sku, s(l.nombre)) >= 6 ? "pack6" : "pack3";
}
function paquetesDeLineas(L: Row[], cab: Row): PaqueteLinea[] {
  const out: PaqueteLinea[] = [];
  for (const l of L.filter((x) => s(x.tipo) === "paquete" && x.excluir_comision !== true)) {
    const tipo = tipoPackDe(l);
    out.push({ tipo, texto: (skuSunsu(l.sku, l.nombre) + " " + s(l.nombre)).trim(), neto: netoPaqueteLinea(l, cab, tipo) });
  }
  return out;
}

/** Comisiones: aplica sobre el ticket del sistema las exclusiones y TODAS las líneas de la beta (varios faciales/paquetes). */
export function overlayComision<T extends { productos: { sku: string; qty: number; ventaNeta?: number; compraComision?: number }[]; exclFacial: boolean; exclPaquete: boolean; exclProducto: boolean; exclExtras: boolean; extras?: string; facial?: string; pack3?: string; pack6?: string; netoPack?: number; netoPack6?: number; faciales?: FacialLinea[]; paquetes?: PaqueteLinea[] }>(t: T, cab: Row | undefined, lineas: Row[] | undefined): T {
  if (!cab) return t;
  const out = { ...t };
  if (cab.neto_pack != null && cab.neto_pack !== "") out.netoPack = n(cab.neto_pack);
  if (cab.neto_pack6 != null && cab.neto_pack6 !== "") out.netoPack6 = n(cab.neto_pack6);
  if (cab.total != null && cab.total !== "") out.total = n(cab.total);
  if (cab.excluir_cosmetologa === true) { out.exclFacial = true; out.exclPaquete = true; out.exclProducto = true; out.exclExtras = true; return out; }
  const L = lineas || [];
  const hayProd = L.some((l) => s(l.tipo) === "producto");
  const hayExtra = L.some((l) => s(l.tipo) === "extra");
  const hayFacial = L.some((l) => s(l.tipo) === "facial");
  const hayPaq = L.some((l) => s(l.tipo) === "paquete");
  if (cab.lineas_beta === true) {
    out.productos = productosDeLineas(L);
    out.extras = extrasDeLineas(L).join(" | ");
  } else {
    const fuera = new Set(L.filter((l) => s(l.tipo) === "producto" && l.excluir_comision === true).map((l) => skuCode(s(l.sku))));
    let prods = fuera.size ? t.productos.filter((p) => !fuera.has(skuCode(p.sku))) : t.productos.slice();
    if (hayProd) prods = mergeProductos(prods, productosDeLineas(L));
    out.productos = prods;
    if (hayExtra) {
      out.extras = mergeExtras(t.extras, L);
      out.exclExtras = false;
    } else if (L.some((l) => s(l.tipo) === "extra" && l.excluir_comision === true)) out.exclExtras = true;
  }
  if (hayFacial) {
    const fac = facialesDeLineas(L);
    out.faciales = fac;
    if (!fac.length) out.exclFacial = true;
    else {
      out.exclFacial = false;
      out.facial = fac.map((f) => f.sku).join(" | ");
    }
  } else if (L.some((l) => s(l.tipo) === "facial" && l.excluir_comision === true)) out.exclFacial = true;
  if (hayPaq) {
    const pks = paquetesDeLineas(L, cab);
    out.paquetes = pks;
    if (!pks.length) out.exclPaquete = true;
    else {
      out.exclPaquete = false;
      const p3 = pks.filter((p) => p.tipo === "pack3");
      const p6 = pks.filter((p) => p.tipo === "pack6");
      if (p3.length) { out.pack3 = p3.map((p) => p.texto).join(" | "); if (p3[0].neto) out.netoPack = p3[0].neto; }
      if (p6.length) { out.pack6 = p6.map((p) => p.texto).join(" | "); if (p6[0].neto) out.netoPack6 = p6[0].neto; }
    }
  } else if (L.some((l) => s(l.tipo) === "paquete" && l.excluir_comision === true)) out.exclPaquete = true;
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
