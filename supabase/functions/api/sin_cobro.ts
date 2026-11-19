// TK98 (Emilia 18/11): tickets en $0 que no se cobran ni se facturan.
//  · Gift card de cortesía («CORTESIA, 26-173, PREMIUM. De: Emilia. Para: Mónica Ribadeneira.»)
//  · Consumo interno (clienta «Sunsu Spa» o RUC de Sunsu): productos sacados para cabina/carrito.
// Se muestran con sus líneas a $0 y estado gris «Cortesía» / «Consumo interno»; nunca «Por cobrar» ni «Sin factura».
import { CEDULA_INTERNA, n, normCedula, round2, s, skuCode, type Row } from "./domain.ts";

export type SinCobro = "cortesia" | "interno" | "canje";
// TK99 (Emilia 18/11): canje de sesión de paquete en $0 («Paquete?» = «SI, 2/3»): estado gris «Canje de paquete».
export type GiftCortesia = { codigo: string; tipo: string; de: string; para: string };

function sinTildes(v: unknown): string { return s(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }

export function giftCortesia(v: unknown): GiftCortesia | null {
  const x = s(v).trim();
  if (!/^cortes[ií]a\b/i.test(x)) return null;
  const cod = (x.match(/\b\d{2}-\d{3}\b/) || [""])[0];
  const resto = x.replace(/^cortes[ií]a\s*,?\s*/i, "").replace(cod, "").replace(/^\s*,\s*/, "");
  const tipo = s(resto.split(/[.,]/)[0]).replace(/^(de|para):.*/i, "").trim();
  const de = s((resto.match(/\bDe:\s*([^.]+)/i) || [])[1]).trim();
  const para = s((resto.match(/\bPara:\s*([^.]+)/i) || [])[1]).trim();
  return { codigo: cod, tipo, de, para };
}

export function esConsumoInterno(t: Row): boolean {
  if (sinTildes(s(t.nombre) + " " + s(t.apellido)) === "sunsu spa") return true;
  const ced = normCedula(t.id_3 || t.cedula);
  return !!ced && ced === CEDULA_INTERNA;
}

/** Solo si el ticket no cobró nada (estimado ≤ 0). */
export function tipoSinCobro(t: Row): SinCobro | null {
  const orig = t.orig && typeof t.orig === "object" ? t.orig as Row : {};
  if (orig.anulado === true) return null;
  if (n(t.estimado) > 0.004) return null;
  if (esConsumoInterno(t)) return "interno";
  if (giftCortesia(t.venta_gift)) return "cortesia";
  if (/^cortes[ií]a\b/i.test(s(t.paquete)) || /^cortes[ií]a\b/i.test(s(t.comp))) return "cortesia";
  const notas = s(t.notas_generales) + " " + s(t.notas);
  if (/\[CORTESIA\]/i.test(notas)) return "cortesia";
  if (sesionPaquete(t)) return "canje";
  return null;
}
export const ETQ_SIN_COBRO: Record<SinCobro, string> = { cortesia: "Cortesía", interno: "Consumo interno", canje: "Canje de paquete" };

/** Sesión canjeada del paquete: «SI, 2/3» → { n: 2, total: 3 }. Solo «SI…» (canje); «NO» o vacío → null. */
export function sesionPaquete(t: Row): { n: number; total: number } | null {
  const v = s(t.paquete || (t.orig && typeof t.orig === "object" ? (t.orig as Row)["Paquete?"] : ""));
  if (!/^\s*SI\b/i.test(v)) return null;
  const m = /(\d+)\s*\/\s*(\d+)/.exec(v);
  return m ? { n: Number(m[1]), total: Number(m[2]) } : { n: 0, total: 0 };
}

/** Paquete del que sale la sesión: el que tiene un uso con la fecha del ticket; si no, el de N sesiones más reciente. */
export function paqueteDeCanje(paqs: Row[], fecha: string, ses: { n: number; total: number }): Row | null {
  const ymd = s(fecha).slice(0, 10);
  const conFecha = paqs.find((p) => (Array.isArray(p.usos) ? p.usos as Row[] : []).some((u) => u.usado && s(u.fecha).slice(0, 10) === ymd));
  if (conFecha) return conFecha;
  const mismos = paqs.filter((p) => !ses.total || n(p.total) === ses.total).sort((a, b0) => Number(b0.id || 0) - Number(a.id || 0));
  return mismos[0] || null;
}

export function textoCanje(p: Row | null, ses: { n: number; total: number }): string {
  const cod = p ? s(p.codigo) || s(p.sku) : "";
  return ["Canje paquete" + (cod ? " " + cod : ""), ses.total ? "sesión " + ses.n + "/" + ses.total : ""].filter(Boolean).join(" · ");
}

/** Valor nominal de la gift card: $ escrito, o el facial del catálogo por su tipo (K-LIFT → Facial K-Lift), o la gift card estándar. */
export function valorNominalGift(g: GiftCortesia, catalogo: Row[]): number {
  const m = /\$\s*(\d+(?:[.,]\d+)?)/.exec(g.tipo);
  if (m) return round2(Number(m[1].replace(",", ".")));
  const k = sinTildes(g.tipo).replace(/[^a-z0-9]/g, "");
  const pvp = (c: Row) => n(c.total_con_iva) || n(c.pvp) || round2(n(c.subtotal) * 1.15);
  if (k && k !== "premium") {
    const f = (catalogo || []).find((c) => /^facial/i.test(s(c.tipo)) && sinTildes(c.producto_servicio || c.nombre).replace(/[^a-z0-9]/g, "").endsWith(k));
    if (f) return round2(pvp(f));
  }
  const gc = (catalogo || []).find((c) => skuCode(s(c.sku)) === "35");
  return gc ? round2(pvp(gc)) : 65;
}

export function nombreLineaGift(g: GiftCortesia, nominal: number): string {
  return ["Gift card " + g.codigo, g.tipo, g.para ? "para " + g.para : "", nominal > 0 ? "valor $" + nominal.toFixed(2) : ""].filter(Boolean).join(" · ");
}
