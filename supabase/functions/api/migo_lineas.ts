/** Ítems de factura Migo (Ventas Detalladas o RIDE) y cuadre línea a línea con el ticket. */
import { n, s, skuCode, type Row } from "./domain.ts";

import { aliasMigo } from "./alias_migo.ts";
export const NOMBRE_DIFERENCIA_MEJORA = "Diferencia por mejora de paquete";

export type LineaNorm = {
  sku: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  unitSin: number;
  descuento: number;
  subtotalSin: number;
  totalCon: number;
  canje?: boolean;
  mejoraPaquete?: boolean;
  /** id del ticket de donde salió la línea (cuando se comparan varios tickets contra una factura). */
  ticketId?: number;
};

export type AvisoLinea = {
  tipo: "revisa" | "falta" | "sobra" | "sugerencia" | "cambio_sku";
  sku: string;
  texto: string;
  /** cambio_sku: la línea del ticket (desde) se corrige con el SKU de la factura (hacia). */
  desde?: string;
  hacia?: string;
  ticketId?: number;
};

/** TK81 (Emilia 18/11): servicios sueltos de la misma familia (extras SUNSU-NN, no faciales ni paquetes). */
export function esServicioSuelto(l: { sku?: unknown; nombre?: unknown }): boolean {
  return /^\d+$/.test(s(l.sku)) && !/paquete|facial/i.test(s(l.nombre));
}
/** Mismo precio y misma cantidad, distinto SKU de la misma familia: es la misma venta mal etiquetada; manda la factura. */
export function mismoServicioOtroSku(fac: LineaNorm, tk: LineaNorm, tol = TOL, precioTk = 0): boolean {
  if (!fac.sku || !tk.sku || fac.sku === tk.sku || tk.canje) return false;
  if (!esServicioSuelto(fac) || !esServicioSuelto(tk)) return false;
  if (!cerca(fac.cantidad, tk.cantidad, 0.001)) return false;
  const mf = montoLinea(fac), mt = montoLinea(tk) || precioTk * tk.cantidad;
  return mf > tol && cerca(mf, mt, tol);
}

/** Línea que cobra solo el plus cuando el facial canjeado vale más que el paquete. */
export function esDiferenciaMejora(l: { tipo?: unknown; nombre?: unknown; promo?: unknown; mejoraPaquete?: unknown }): boolean {
  if (l && l.mejoraPaquete === true) return true;
  if (s(l?.tipo) === "diferencia_mejora") return true;
  return /diferencia por mejora/i.test(s(l?.nombre) || s(l?.promo));
}

const TOL = 0.05;

export function cerca(a: number, b: number, tol = TOL): boolean {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tol;
}

/** Igual si coinciden en crudo o uno es el otro con IVA 15%. */
export function equivalentesIva(a: number, b: number, tol = TOL): boolean {
  const x = Number(a || 0), y = Number(b || 0);
  if (cerca(x, y, tol)) return true;
  if (cerca(x * 1.15, y, tol) || cerca(y * 1.15, x, tol)) return true;
  return false;
}

export function skuMigoABeta(codigo: unknown): string {
  return skuCode(codigo);
}

export function normalizarLineaFactura(l: Row): LineaNorm | null {
  const codigo = s(l.codigo || l.sku);
  const nombre = s(l.producto || l.nombre || l.descripcion || codigo);
  const qty = n(l.cantidad) || 1;
  if (!codigo && !nombre) return null;
  if (!(qty > 0)) return null;
  const unit = n(l.precio_unit ?? l.precio);
  const desc = n(l.descuento);
  let sub = n(l.subtotal);
  if (!sub && unit) sub = Math.round((unit * qty - desc) * 100) / 100;
  const iva = n(l.iva);
  let tot = n(l.total);
  if (!tot && sub) tot = Math.round((sub + (iva || Math.round(sub * 0.15 * 100) / 100)) * 100) / 100;
  const unitSin = unit || (qty ? Math.round((sub / qty) * 10000) / 10000 : 0);
  return {
    // TK98: SUNSU-35 a $3.00 es la caja de gift card (INV-123), no una gift card.
    sku: codigo ? aliasMigo(codigo, qty ? tot / qty : tot) : skuMigoABeta(nombre),
    codigo,
    nombre: nombre || codigo,
    cantidad: qty,
    unitSin,
    descuento: desc,
    subtotalSin: sub,
    totalCon: tot,
  };
}

function money(v: number): string {
  return "$" + Number(v || 0).toFixed(2);
}

/** Líneas de un ticket: beta_ticket_lineas, o reconstrucción desde orig / facial / extras. */
export function lineasDeTicket(t: Row, catalogo?: Map<string, { nombre?: string; pvpConIva?: number; pvpSinIva?: number }>): LineaNorm[] {
  const out: LineaNorm[] = [];
  const beta = (t.lineasDetalle || t.lineasBeta || t.lineas_beta || t.lineas) as Row[] | undefined;
  if (Array.isArray(beta) && beta.length && beta.some((l) => s(l.sku || l.codigo))) {
    for (const l of beta) {
      const tot = n(l.total ?? l.total_linea);
      const nrm = normalizarLineaFactura({
        codigo: s(l.sku || l.codigo),
        producto: s(l.nombre || l.producto),
        cantidad: n(l.cantidad) || 1,
        precio_unit: n(l.precio_unitario ?? l.precio_unit ?? l.precio),
        descuento: n(l.descuento_monto ?? l.descuento),
        subtotal: n(l.subtotal),
        iva: n(l.iva),
        total: tot,
      });
      if (!nrm) continue;
      if (l.canje === true || (s(l.tipo) === "facial" && !(nrm.totalCon > 0) && !(nrm.unitSin > 0))) nrm.canje = true;
      if (esDiferenciaMejora(l)) { nrm.mejoraPaquete = true; nrm.canje = false; }
      out.push(nrm);
    }
    if (out.length) return out;
  }
  const orig = (t.orig && typeof t.orig === "object" ? t.orig : {}) as Row;
  const paq = s(t.paquete || orig["Paquete?"] || orig.paquete);
  const canje = /^si\b/i.test(paq);

  const pushSku = (raw: string, qty: number, nombre: string, canjeLinea = false) => {
    const codigo = s(raw).split(/\s+/)[0];
    const sku = skuMigoABeta(codigo);
    if (!sku || !qty) return;
    const cat = catalogo?.get(sku) || catalogo?.get(codigo);
    const unitSin = canjeLinea ? 0 : (cat?.pvpSinIva ?? (cat?.pvpConIva ? Math.round((cat.pvpConIva / 1.15) * 100) / 100 : 0));
    const tot = canjeLinea ? 0 : (cat?.pvpConIva ?? Math.round(unitSin * 1.15 * 100) / 100);
    out.push({
      sku, codigo, nombre: nombre || s(cat?.nombre) || codigo,
      cantidad: qty, unitSin, descuento: 0,
      subtotalSin: Math.round(unitSin * qty * 100) / 100,
      totalCon: Math.round(tot * qty * 100) / 100,
      canje: canjeLinea || undefined,
    });
  };

  const facial = s(t.facial_hecho || t.facial || orig["Facial hecho"] || orig.facial);
  if (facial) {
    const m = facial.match(/^(SUNSU-?\d+|[A-Z]{2,}-?\d+)/i);
    const codigo = m ? m[1] : facial;
    const nombre = facial.replace(codigo, "").trim() || facial;
    pushSku(codigo, 1, nombre, canje);
  }
  const extras = s(t.extras || t.servicios_adicionales || orig["Servicios Adicionales "] || orig["Servicios Adicionales"] || orig.extras);
  if (extras) {
    for (const part of extras.split(/\s*[|,;]\s*/).filter(Boolean)) {
      const m = part.match(/^(SUNSU-?[A-Z0-9-]+|[A-Z]{2,}-?\d+)\s*(.*)$/i);
      if (m) pushSku(m[1], 1, m[2].replace(/^[·\-–]\s*/, "").trim() || m[1]);
    }
  }
  // TK81: la compra de paquete (compra_pack_3/6) también es una línea del ticket (como en el detalle del ticket).
  for (const pk of [s(t.compra_pack_3), s(t.compra_pack_6)]) {
    if (!pk || /^(false|no|-|—)$/i.test(pk)) continue;
    const m = pk.match(/SUNSU-?\d+/i);
    if (m) pushSku(m[0], 1, pk.replace(m[0], "").replace(/^[·\-–\s]+/, "").trim() || m[0]);
  }
  const skip = new Set(["id", "estado", "nombre", "apellido", "so_num", "timestamp", "paquete?", "paquete", "facial hecho", "fotos antes", "fotos despues", "fecha retorno", "atendido por:", "atendido por", "notas generales", "recomendaciónes", "recomendaciones", "servicios adicionales", "servicios adicionales ", "$$ estimado"]);
  for (const [k, v] of Object.entries(orig)) {
    const key = s(k);
    if (skip.has(key.toLowerCase())) continue;
    if (/excluir/i.test(key)) continue;
    if (!/^(SUNSU-)?[A-Z]{2,}-?\d+$/i.test(key)) continue;
    const qty = n(v);
    if (qty > 0) pushSku(key, qty, key);
  }
  return out;
}

function etq(l: LineaNorm): string {
  return (l.nombre ? l.nombre : l.codigo) + (l.codigo ? " (" + l.codigo + ")" : (l.sku ? " (" + l.sku + ")" : ""));
}

function montoLinea(l: LineaNorm): number {
  return l.totalCon || Math.round((l.subtotalSin || l.unitSin * l.cantidad) * 1.15 * 100) / 100;
}

function pvpCatalogo(sku: string, catalogo?: Map<string, { nombre?: string; pvpConIva?: number; pvpSinIva?: number }>): number {
  if (!catalogo) return 0;
  const cat = catalogo.get(sku) || catalogo.get("SUNSU-" + sku);
  if (!cat) return 0;
  return Number(cat.pvpConIva || 0) || (cat.pvpSinIva ? Math.round(cat.pvpSinIva * 1.15 * 100) / 100 : 0);
}

export function compararLineas(factura: LineaNorm[], tickets: LineaNorm[], tol = TOL, catalogo?: Map<string, { nombre?: string; pvpConIva?: number; pvpSinIva?: number }>, catPrecios?: Map<string, { nombre?: string; pvpConIva?: number; pvpSinIva?: number }>): AvisoLinea[] {
  const fac = factura.filter(Boolean);
  const tks = tickets.filter(Boolean);
  const usedT = new Set<number>();
  const avisos: AvisoLinea[] = [];

  const tomas = (want: LineaNorm): number => {
    // La diferencia por mejora (mismo SKU, con monto) manda sobre el canje a $0.
    let hit = tks.findIndex((t, i) => !usedT.has(i) && t.sku && want.sku && t.sku === want.sku && !t.canje);
    if (hit < 0) hit = tks.findIndex((t, i) => !usedT.has(i) && t.sku && want.sku && t.sku === want.sku);
    // TK96 (Emilia 18/11): nunca por nombre; solo SKU/código exacto.
    return hit;
  };

  const sinPar: LineaNorm[] = [];
  for (const f of fac) {
    const i = tomas(f);
    if (i < 0) { sinPar.push(f); continue; }
    usedT.add(i);
    const t = tks[i];
    if (t.canje) {
      const j = tks.findIndex((x, k) => !usedT.has(k) && (x.mejoraPaquete || esDiferenciaMejora(x)) && x.sku === (f.sku || t.sku));
      if (j >= 0) {
        usedT.add(j);
        const d = tks[j];
        if (equivalentesIva(montoLinea(d), montoLinea(f), tol) || equivalentesIva(d.unitSin || d.subtotalSin, f.unitSin || f.subtotalSin, tol)) continue;
        avisos.push({
          tipo: "revisa",
          sku: f.sku || f.codigo,
          texto: "⚠️ Revisa " + etq(f) + ": diferencia por mejora " + money(montoLinea(d)) + " vs factura " + money(montoLinea(f)),
        });
        continue;
      }
      const pvp = pvpCatalogo(f.sku || t.sku, catalogo);
      const facMonto = montoLinea(f);
      const menorQueLista = !pvp || facMonto + tol < pvp;
      if (menorQueLista && facMonto > tol) {
        avisos.push({
          tipo: "sugerencia",
          sku: f.sku || f.codigo,
          texto: "Sugerencia: agrega «" + NOMBRE_DIFERENCIA_MEJORA + "» en " + etq(f)
            + ": la factura cobró " + money(facMonto) + " (sin IVA " + money(Math.round((facMonto / 1.15) * 100) / 100)
            + "). El canje de paquete cubre el resto.",
        });
        continue;
      }
      avisos.push({
        tipo: "revisa",
        sku: f.sku || f.codigo,
        texto: "⚠️ Revisa " + etq(f) + ": ticket $0.00 × " + String(t.cantidad) + " (paquete, no cobrado en el ticket)"
          + " vs factura " + money(facMonto) + " × " + String(f.cantidad),
      });
      continue;
    }
    const qtyOk = cerca(t.cantidad, f.cantidad, 0.001);
    const precioConocido = (t.unitSin > 0 || t.subtotalSin > 0 || t.totalCon > 0);
    const precioOk = !precioConocido || equivalentesIva(t.unitSin || t.subtotalSin, f.unitSin || f.subtotalSin, tol)
      || equivalentesIva(montoLinea(t), montoLinea(f), tol);
    if (qtyOk && precioOk) continue;
    avisos.push({
      tipo: "revisa",
      sku: f.sku || f.codigo,
      texto: "⚠️ Revisa " + etq(f) + ": ticket " + money(montoLinea(t)) + " × " + String(t.cantidad)
        + " vs factura " + money(montoLinea(f)) + " × " + String(f.cantidad),
    });
  }
  // TK81: lo que falta en el ticket puede ser el mismo servicio con otro SKU (mismo precio y cantidad): se corrige con la factura.
  const facSkus = new Set(fac.map((f) => f.sku));
  // TK96: sin nombres. Si hay varios candidatos del mismo precio, se emparejan por código más cercano (estable).
  const numSku = (x: string) => { const m = /^(\d+)$/.exec(s(x)); return m ? Number(m[1]) : 9999; };
  const pares: { fi: number; tj: number; d: number }[] = [];
  sinPar.forEach((f, fi) => tks.forEach((t, k) => {
    if (!usedT.has(k) && !facSkus.has(t.sku) && mismoServicioOtroSku(f, t, tol, pvpCatalogo(t.sku, catalogo || catPrecios))) pares.push({ fi, tj: k, d: Math.abs(numSku(f.sku) - numSku(t.sku)) });
  }));
  pares.sort((x, y) => x.d - y.d || x.fi - y.fi || x.tj - y.tj);
  const parDe = new Map<number, number>();
  for (const pr of pares) if (!parDe.has(pr.fi) && ![...parDe.values()].includes(pr.tj)) parDe.set(pr.fi, pr.tj);
  for (let fi = 0; fi < sinPar.length; fi++) {
    const f = sinPar[fi];
    const j = parDe.has(fi) ? parDe.get(fi)! : -1;
    if (j >= 0) {
      usedT.add(j);
      const t = tks[j];
      avisos.push({ tipo: "cambio_sku", sku: f.sku || f.codigo, desde: t.sku, hacia: f.sku, ticketId: t.ticketId, texto: "Corregido con la factura: " + etq(t) + " → " + etq(f) + " " + money(montoLinea(f)) + " × " + String(f.cantidad) });
      continue;
    }
    avisos.push({
      tipo: "falta",
      sku: f.sku || f.codigo,
      texto: "Falta en ticket: " + etq(f) + " " + money(montoLinea(f)) + " × " + String(f.cantidad),
    });
  }
  for (let i = 0; i < tks.length; i++) {
    if (usedT.has(i)) continue;
    const t = tks[i];
    if (t.canje || montoLinea(t) <= tol) continue; // sesión de paquete / $0 no se cobra en la factura
    avisos.push({
      tipo: "sobra",
      sku: t.sku || t.codigo,
      texto: "Sobra en ticket: " + etq(t) + " " + money(montoLinea(t)) + " × " + String(t.cantidad),
    });
  }
  return avisos;
}

export function compararFacturaYTickets(lineasFac: Row[] | undefined, tickets: Row[], catalogo?: Map<string, { nombre?: string; pvpConIva?: number; pvpSinIva?: number }>, catPrecios?: Map<string, { nombre?: string; pvpConIva?: number; pvpSinIva?: number }>): AvisoLinea[] {
  const fac = (lineasFac || []).map(normalizarLineaFactura).filter((x): x is LineaNorm => !!x);
  if (!fac.length) return [];
  const tks = tickets.flatMap((t) => lineasDeTicket(t, catalogo).map((l) => ({ ...l, ticketId: n(t.id) || undefined })));
  return compararLineas(fac, tks, TOL, catalogo, catPrecios);
}

function claveSkuCant(l: LineaNorm): string {
  return (l.sku || l.codigo) + ":" + String(l.cantidad);
}

/** Misma mercadería (sku + cantidad). Un facial de paquete (canje) en el ticket no cuenta. */
export function mismoProductoYCantidad(factura: LineaNorm[], tickets: LineaNorm[]): boolean {
  const fCore = factura.map(claveSkuCant).sort().join("|");
  const tCore = tickets.filter((t) => !t.canje).map(claveSkuCant).sort().join("|");
  return !!fCore && fCore === tCore;
}

export function gapPrecioGrande(factura: LineaNorm[], tickets: LineaNorm[], maxAbs = 5, maxPct = 0.05): { grande: boolean; diferencia: number; totalFac: number } {
  const fac = factura.reduce((a, l) => a + montoLinea(l), 0);
  const tk = tickets.filter((t) => !t.canje).reduce((a, l) => a + montoLinea(l), 0);
  const diff = Math.round((tk - fac) * 100) / 100;
  const grande = Math.abs(diff) > maxAbs || (fac > 0 && Math.abs(diff) / fac > maxPct);
  return { grande, diferencia: diff, totalFac: fac };
}

export { TOL as TOL_LINEA };
