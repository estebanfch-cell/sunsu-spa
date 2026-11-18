/** Ítems de factura Migo (Ventas Detalladas o RIDE) y cuadre línea a línea con el ticket. */
import { n, s, skuCode, type Row } from "./domain.ts";

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
};

export type AvisoLinea = {
  tipo: "revisa" | "falta" | "sobra";
  sku: string;
  texto: string;
};

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
    sku: skuMigoABeta(codigo || nombre),
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
      const nrm = normalizarLineaFactura({
        codigo: s(l.sku || l.codigo),
        producto: s(l.nombre || l.producto),
        cantidad: n(l.cantidad) || 1,
        precio_unit: n(l.precio_unitario ?? l.precio_unit ?? l.precio),
        descuento: n(l.descuento_monto ?? l.descuento),
        subtotal: n(l.subtotal),
        iva: n(l.iva),
        total: n(l.total),
      });
      if (nrm) out.push(nrm);
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
  const extras = s(t.extras || orig["Servicios Adicionales "] || orig["Servicios Adicionales"] || orig.extras);
  if (extras) {
    for (const part of extras.split(/\s*[|,;]\s*/).filter(Boolean)) {
      const m = part.match(/^(SUNSU-?[A-Z0-9-]+|[A-Z]{2,}-?\d+)\s*(.*)$/i);
      if (m) pushSku(m[1], 1, m[2].replace(/^[·\-–]\s*/, "").trim() || m[1]);
    }
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

export function compararLineas(factura: LineaNorm[], tickets: LineaNorm[], tol = TOL): AvisoLinea[] {
  const fac = factura.filter(Boolean);
  const tks = tickets.filter(Boolean);
  const usedT = new Set<number>();
  const avisos: AvisoLinea[] = [];

  const tomas = (want: LineaNorm): number => {
    let hit = tks.findIndex((t, i) => !usedT.has(i) && t.sku && want.sku && t.sku === want.sku);
    if (hit < 0) {
      const wn = s(want.nombre).toLowerCase();
      hit = tks.findIndex((t, i) => {
        if (usedT.has(i)) return false;
        const tn = s(t.nombre).toLowerCase();
        return wn && tn && (wn.includes(tn) || tn.includes(wn)) && cerca(t.cantidad, want.cantidad, 0.001);
      });
    }
    return hit;
  };

  for (const f of fac) {
    const i = tomas(f);
    if (i < 0) {
      avisos.push({
        tipo: "falta",
        sku: f.sku || f.codigo,
        texto: "Falta en ticket: " + etq(f) + " " + money(montoLinea(f)) + " × " + String(f.cantidad),
      });
      continue;
    }
    usedT.add(i);
    const t = tks[i];
    const qtyOk = cerca(t.cantidad, f.cantidad, 0.001);
    const precioConocido = !t.canje && (t.unitSin > 0 || t.subtotalSin > 0 || t.totalCon > 0);
    const precioOk = !precioConocido || equivalentesIva(t.unitSin || t.subtotalSin, f.unitSin || f.subtotalSin, tol)
      || equivalentesIva(montoLinea(t), montoLinea(f), tol);
    if (qtyOk && precioOk && !t.canje) continue;
    const ticketMonto = t.canje || !precioConocido ? (t.canje ? 0 : montoLinea(t)) : montoLinea(t);
    const extra = t.canje ? " (paquete, no cobrado en el ticket)" : "";
    avisos.push({
      tipo: "revisa",
      sku: f.sku || f.codigo,
      texto: "⚠️ Revisa " + etq(f) + ": ticket " + money(ticketMonto) + " × " + String(t.cantidad) + extra
        + " vs factura " + money(montoLinea(f)) + " × " + String(f.cantidad),
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

export function compararFacturaYTickets(lineasFac: Row[] | undefined, tickets: Row[], catalogo?: Map<string, { nombre?: string; pvpConIva?: number; pvpSinIva?: number }>): AvisoLinea[] {
  const fac = (lineasFac || []).map(normalizarLineaFactura).filter((x): x is LineaNorm => !!x);
  if (!fac.length) return [];
  const tks = tickets.flatMap((t) => lineasDeTicket(t, catalogo));
  return compararLineas(fac, tks);
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
