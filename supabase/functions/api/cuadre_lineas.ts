// TK135 (Emilia 19/11): cuadre visual línea a línea y descuentos de la factura (prefill).
// Se compara solo por SKU canónico + alias TK127, nunca por nombre.
import { n, round2, s, skuCode, type Row } from "./domain.ts";
import { expandirLineasGiftCaja } from "./alias_migo.ts";
import { lineasDeTicket, normalizarLineaFactura, cerca, type LineaNorm } from "./migo_lineas.ts";
import { resolverSku, type AliasMap } from "./inventario_modelo.ts";

const IVA = 1.15;
const $ = (v: number) => "$" + round2(v).toFixed(2);
function visible(sku: string, codigo?: string): string {
  const c = s(codigo);
  if (c) return c;
  return /^\d+$/.test(sku) ? "SUNSU-" + sku : sku;
}
export function claveCuadre(sku: string, aliases?: AliasMap): string {
  const c = skuCode(sku);
  return aliases && aliases.size ? (resolverSku(c, aliases) || c) : c;
}

export type EstadoCuadreLinea = "ok" | "diff" | "falta" | "sobra" | "canje_ok";
export type CuadreLinea = {
  sku: string;
  codigo: string;
  nombre: string;
  estado: EstadoCuadreLinea;
  razon: string;
  ticket_i?: number;
  qty_tk?: number;
  qty_fac?: number;
  tot_tk?: number;
  tot_fac?: number;
  desc_fac_sin?: number;
  desc_fac_con?: number;
};

export function esCanjeCero(l: LineaNorm): boolean {
  // Diferencia por mejora con monto > 0 no es un ítem a $0.
  if (l.mejoraPaquete && n(l.totalCon) > 0.004) return false;
  if (l.canje && !(n(l.totalCon) > 0.004)) return true;
  // Promo, muestra, cortesía o desc 100%: total explícito 0, aunque no diga canje ni [CORTESIA].
  if (l.totalCon != null && s(l.totalCon) !== "" && Number.isFinite(Number(l.totalCon)) && !(n(l.totalCon) > 0.004)) return true;
  return false;
}

/** Descuento de cabecera del ticket (beta.descuento_monto o «🏷 Descuento: Desc$57.18» en notas). */
export function descuentoDeTicket(t: Row): number {
  const directo = n(t.descuento_monto);
  if (directo > 0.004) return round2(directo);
  const orig = t.orig && typeof t.orig === "object" ? t.orig as Row : {};
  const blob = [s(t.notas_generales), s(t.notas), s(orig["NOTAS GENERALES"])].join(" ");
  const m = blob.match(/Desc\$\s*([\d]+(?:[.,]\d+)?)/i) || blob.match(/descuento[:\s]+(?:Desc\$)?\s*([\d]+(?:[.,]\d+)?)/i);
  if (!m) return 0;
  const v = Number(String(m[1]).replace(",", "."));
  return Number.isFinite(v) && v > 0.004 ? round2(v) : 0;
}

/** Precio unitario con IVA y descuento con IVA, a partir de una línea Migo (unit/desc suelen ir sin IVA). */
export function montosConIva(l: LineaNorm): { unitCon: number; descCon: number; descSin: number; tot: number; qty: number } {
  const qty = l.cantidad || 1;
  const tot = round2(l.totalCon || 0);
  const descSin = round2(l.descuento || 0);
  const unitSin = n(l.unitSin);
  if (cerca(unitSin * qty - descSin, tot, 0.05)) {
    return { unitCon: round2(unitSin), descCon: descSin, descSin, tot, qty };
  }
  const unitCon = unitSin ? round2(unitSin * IVA) : (qty ? round2((tot + round2(descSin * IVA)) / qty) : 0);
  // Sin descuento en Migo no inventamos uno por el redondeo de IVA (p.ej. 34.50×1.15=39.68 vs total 39.67).
  const descCon = descSin > 0.004
    ? round2(descSin * IVA)
    : (cerca(unitCon * qty, tot, 0.05) ? 0 : round2(Math.max(0, unitCon * qty - tot)));
  return { unitCon, descCon, descSin, tot, qty };
}

export type DescuentosFactura = {
  lineas: { sku: string; codigo: string; nombre: string; cantidad: number; precio_unit_con: number; descuento_con: number; descuento_sin: number; total_con: number }[];
  descuentoLineasSin: number;
  descuentoLineasCon: number;
  descuentoCabeceraSin: number;
  descuentoCabeceraExtraSin: number;
  descuentoCabeceraExtraCon: number;
  hayDescuento: boolean;
};

/** Extrae descuentos por línea y el de cabecera que no esté ya en las líneas (evita duplicar). */
export function descuentosDeFactura(fac: { descuento?: number; lineas?: Row[] } | null | undefined): DescuentosFactura {
  const lineas: DescuentosFactura["lineas"] = [];
  for (const raw of expandirLineasGiftCaja(fac?.lineas)) {
    const nrm = normalizarLineaFactura(raw);
    if (!nrm) continue;
    const m = montosConIva(nrm);
    lineas.push({
      sku: nrm.sku, codigo: nrm.codigo, nombre: nrm.nombre, cantidad: m.qty,
      precio_unit_con: m.unitCon, descuento_con: m.descCon, descuento_sin: m.descSin, total_con: m.tot,
    });
  }
  const descuentoLineasSin = round2(lineas.reduce((a, l) => a + l.descuento_sin, 0));
  const descuentoLineasCon = round2(lineas.reduce((a, l) => a + l.descuento_con, 0));
  const header = round2(n(fac?.descuento));
  // Cabecera de Migo viene casi siempre sin IVA. Si ya está en las líneas, no se vuelve a aplicar.
  let extraSin = 0;
  if (header > 0.004) {
    if (cerca(header, descuentoLineasSin, 0.02) || cerca(header, descuentoLineasCon, 0.02) || cerca(header * IVA, descuentoLineasCon, 0.02)) {
      extraSin = 0;
    } else if (header > descuentoLineasSin + 0.02) extraSin = round2(header - descuentoLineasSin);
    else if (header > descuentoLineasCon + 0.02 && cerca(header, descuentoLineasCon + (header - descuentoLineasCon), 5)) {
      extraSin = 0;
    }
  }
  const extraCon = extraSin ? round2(extraSin * IVA) : 0;
  return {
    lineas, descuentoLineasSin, descuentoLineasCon,
    descuentoCabeceraSin: header, descuentoCabeceraExtraSin: extraSin, descuentoCabeceraExtraCon: extraCon,
    hayDescuento: descuentoLineasCon > 0.004 || extraCon > 0.004 || header > 0.004,
  };
}

type FacAgg = { sku: string; codigo: string; nombre: string; q: number; tot: number; descSin: number; descCon: number };
function agruparFac(lineas: Row[] | undefined, aliases?: AliasMap): Map<string, FacAgg> {
  const m = new Map<string, FacAgg>();
  for (const raw of expandirLineasGiftCaja(lineas)) {
    const nrm = normalizarLineaFactura(raw);
    if (!nrm || !nrm.sku) continue;
    const k = claveCuadre(nrm.sku, aliases);
    const mon = montosConIva(nrm);
    const a = m.get(k) || { sku: k, codigo: nrm.codigo, nombre: nrm.nombre, q: 0, tot: 0, descSin: 0, descCon: 0 };
    a.q += mon.qty;
    a.tot = round2(a.tot + mon.tot);
    a.descSin = round2(a.descSin + mon.descSin);
    a.descCon = round2(a.descCon + mon.descCon);
    if (!a.codigo && nrm.codigo) a.codigo = nrm.codigo;
    if (!a.nombre) a.nombre = nrm.nombre;
    m.set(k, a);
  }
  return m;
}

function razonDiff(tk: { q: number; tot: number }, fac: FacAgg): string {
  const parts: string[] = [];
  if (!cerca(tk.q, fac.q, 0.001)) parts.push("Cantidad: ticket " + String(tk.q) + " vs factura " + String(fac.q));
  if (!cerca(tk.tot, fac.tot, 0.05)) {
    const desc = fac.descSin > 0.004
      ? " (descuento " + $(fac.descSin) + " sin IVA)"
      : (fac.descCon > 0.004 ? " (descuento " + $(fac.descCon) + ")" : "");
    parts.push("En factura: " + $(fac.tot) + desc);
  }
  return parts.join(" · ") || "No cuadra con la factura";
}

/**
 * Comparación visual por SKU: verde si cuadra, rojo solo en la línea que no,
 * canje $0 (paquete o gift card) es OK aunque no esté en la factura,
 * y las líneas de la factura que faltan en el ticket salen como fila fantasma.
 */
export function compararLineasVisual(
  tickets: Row[],
  facLineas: Row[] | undefined,
  catalogo?: Map<string, { nombre?: string; pvpConIva?: number; pvpSinIva?: number }>,
  aliases?: AliasMap,
  opts?: { focus?: number },
): CuadreLinea[] {
  const F = agruparFac(facLineas, aliases);
  const out: CuadreLinea[] = [];
  const used = new Set<string>();
  const tkAgg = new Map<string, { q: number; tot: number; canjeQ: number; is: number[]; nombre: string; codigo: string }>();
  tickets.forEach((t, _ti) => {
    lineasDeTicket(t, catalogo).forEach((l, _li) => {
      const k = claveCuadre(l.sku || l.codigo, aliases);
      if (!k) return;
      const a = tkAgg.get(k) || { q: 0, tot: 0, canjeQ: 0, is: [], nombre: l.nombre, codigo: l.codigo, };
      if (esCanjeCero(l)) a.canjeQ += l.cantidad || 1;
      else { a.q += l.cantidad || 0; a.tot = round2(a.tot + (l.totalCon || 0)); }
      if (!a.nombre) a.nombre = l.nombre;
      if (!a.codigo) a.codigo = l.codigo;
      tkAgg.set(k, a);
    });
  });

  // Recorre las líneas del ticket en orden para poder pintar cada fila.
  // TK143: con focus, solo se pintan las líneas de ESE ticket (el agregado del grupo ya está en tkAgg).
  let descRestante = round2(tickets.reduce((a, t) => a + descuentoDeTicket(t), 0));
  let idx = 0;
  for (let ti = 0; ti < tickets.length; ti++) {
    const t = tickets[ti];
    const paint = opts?.focus == null || ti === opts.focus;
    for (const l of lineasDeTicket(t, catalogo)) {
      if (!paint) continue;
      const i = idx++;
      const k = claveCuadre(l.sku || l.codigo, aliases);
      const codigo = visible(k, l.codigo);
      if (esCanjeCero(l)) {
        const fac = F.get(k);
        const etqCero = l.canje ? (fac ? "Canje · OK" : "Canje · OK sin factura") : "OK sin factura ($0)";
        out.push({
          sku: k, codigo, nombre: l.nombre, estado: "canje_ok",
          razon: etqCero,
          ticket_i: i, qty_tk: l.cantidad, tot_tk: 0,
          qty_fac: fac?.q, tot_fac: fac?.tot,
        });
        continue;
      }
      const fac = k ? F.get(k) : undefined;
      if (!k || !fac) {
        out.push({
          sku: k, codigo, nombre: l.nombre, estado: "sobra",
          razon: "No está en la factura",
          ticket_i: i, qty_tk: l.cantidad, tot_tk: round2(l.totalCon || 0),
        });
        continue;
      }
      used.add(k);
      const agg = tkAgg.get(k)!;
      let totTk = agg.tot;
      if (descRestante > 0.004 && !cerca(totTk, fac.tot, 0.05) && cerca(round2(totTk - descRestante), fac.tot, 0.05)) {
        totTk = round2(totTk - descRestante);
        descRestante = 0;
      }
      if (cerca(agg.q, fac.q, 0.001) && cerca(totTk, fac.tot, 0.05)) {
        out.push({
          sku: k, codigo, nombre: l.nombre, estado: "ok", razon: "",
          ticket_i: i, qty_tk: l.cantidad, tot_tk: round2(l.totalCon || 0),
          qty_fac: fac.q, tot_fac: fac.tot, desc_fac_sin: fac.descSin, desc_fac_con: fac.descCon,
        });
      } else {
        out.push({
          sku: k, codigo, nombre: l.nombre, estado: "diff",
          razon: razonDiff({ q: agg.q, tot: agg.tot }, fac),
          ticket_i: i, qty_tk: agg.q, tot_tk: agg.tot,
          qty_fac: fac.q, tot_fac: fac.tot, desc_fac_sin: fac.descSin, desc_fac_con: fac.descCon,
        });
      }
    }
  }
  for (const [k, fac] of F) {
    if (used.has(k)) continue;
    const tk = tkAgg.get(k);
    // TK143: si el SKU está en un ticket hermano (o en este, pintado como ok/diff), no crear fila fantasma.
    if (tk && (tk.q > 0 || tk.canjeQ > 0)) continue;
    out.push({
      sku: k, codigo: visible(k, fac.codigo), nombre: fac.nombre, estado: "falta",
      razon: "Falta en ticket · en factura: " + visible(k, fac.codigo) + (fac.nombre ? " " + fac.nombre : "") + " " + $(fac.tot),
      qty_fac: fac.q, tot_fac: fac.tot, desc_fac_sin: fac.descSin, desc_fac_con: fac.descCon,
    });
  }
  return out;
}

export function resumenCuadre(lineas: CuadreLinea[], factura?: string, extra?: { hermanos?: string[] }): { ok: boolean; nDiff: number; texto: string; factura: string; hermanos?: string[] } {
  const nDiff = lineas.filter((l) => l.estado === "diff" || l.estado === "falta" || l.estado === "sobra").length;
  const facFull = s(factura);
  const fac = facFull.replace(/^001-001-0+/, "") || facFull;
  const hermanos = (extra?.hermanos || []).map((h) => s(h)).filter(Boolean);
  const junto = hermanos.length ? "junto con " + hermanos.join(", ") : "";
  if (!fac && !lineas.length) return { ok: true, nDiff: 0, texto: "", factura: "", hermanos };
  if (!nDiff) {
    if (junto && facFull) return { ok: true, nDiff: 0, texto: "✓ Cuadra (" + junto + " · Fac. " + facFull + ")", factura: fac, hermanos };
    if (junto) return { ok: true, nDiff: 0, texto: "✓ Cuadra (" + junto + ")", factura: fac, hermanos };
    return { ok: true, nDiff: 0, texto: fac ? "Cuadrado con fac. " + fac : "Cuadrado", factura: fac, hermanos };
  }
  const n = nDiff;
  const extraTxt = junto ? " (" + junto + ")" : "";
  return { ok: false, nDiff: n, texto: n + " línea" + (n === 1 ? "" : "s") + " por corregir" + (fac ? " · fac. " + fac : "") + extraTxt, factura: fac, hermanos };
}

/** Perfil de SKU (sin canjes $0) para el motor de best-match. */
export function perfilSku(
  lineas: LineaNorm[],
  aliases?: AliasMap,
): Map<string, { q: number; tot: number }> {
  const m = new Map<string, { q: number; tot: number }>();
  for (const l of lineas) {
    if (esCanjeCero(l) || !l.sku) continue;
    const k = claveCuadre(l.sku, aliases);
    const a = m.get(k) || { q: 0, tot: 0 };
    a.q += l.cantidad || 0;
    a.tot = round2(a.tot + (l.totalCon || 0));
    m.set(k, a);
  }
  return m;
}

export function cruzarPerfilesSku(a: Map<string, { q: number; tot: number }>, b: Map<string, { q: number; tot: number }>): {
  mismasClaves: boolean;
  mismaCantidad: boolean;
  mismoPrecio: boolean;
  overlap: number;
  diffTot: number;
} {
  const keys = new Set([...a.keys(), ...b.keys()]);
  let overlap = 0, mismasClaves = a.size === b.size && a.size > 0, mismaCantidad = true, mismoPrecio = true;
  let totA = 0, totB = 0;
  for (const k of keys) {
    const x = a.get(k), y = b.get(k);
    totA = round2(totA + (x?.tot || 0));
    totB = round2(totB + (y?.tot || 0));
    if (x && y) overlap++;
    else mismasClaves = false;
    if (!x || !y || !cerca(x.q, y.q, 0.001)) mismaCantidad = false;
    if (!x || !y || !cerca(x.tot, y.tot, 0.05)) mismoPrecio = false;
  }
  if (!a.size || !b.size) { mismasClaves = false; mismaCantidad = false; mismoPrecio = false; }
  return { mismasClaves, mismaCantidad: !!(mismasClaves && mismaCantidad), mismoPrecio: !!(mismasClaves && mismaCantidad && mismoPrecio), overlap, diffTot: round2(totA - totB) };
}

export function exigeJustificacionDescuento(descuentoTotal: number, texto: unknown): string | null {
  if (!(round2(Number(descuentoTotal) || 0) > 0.004)) return null;
  if (s(texto).trim().length < 3) return "Indica por qué se aplicó este descuento (gift card, promo, F&F, cortesía…).";
  return null;
}
