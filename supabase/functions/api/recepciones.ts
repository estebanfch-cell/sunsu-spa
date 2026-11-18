// 📥 Recepciones (TK25, Emilia 17/11): reglas puras. Origen del producto (Consignación | Propio), uso
// (Vendible | Insumo cabina), a qué bodega entra lo recibido, y líneas repetidas de la misma OC agrupadas.
import { n, round2, s, skuCode, type Row } from "./domain.ts";
import { familiaConsignacion, vendeDesdeCabina } from "./ventas.ts";

export const BOD_VENTA = "11111111-1111-4111-8111-111111111111";
export const BOD_CASA = "44444444-4444-4444-8444-444444444444";
/** TK27: bodega CONSIGNACION (aparte de Venta). */
export const BOD_CONSIG = "66666666-6666-4666-8666-666666666666";
export const BOD_CABINA = "22222222-2222-4222-8222-222222222222";
export const UNDO_MS = 3600e3;

/** Consignación si el producto lo dice; si no, lo que diga el proveedor (HT, AS, ML, PH, JN entregan en consignación). */
export function origenDe(p: Row | undefined, on?: Set<string>): "consignacion" | "propio" {
  // TK34: con la lista de proveedores en consignación manda el interruptor del proveedor (+ el del producto).
  if (on) { const m = skuCode(s(p?.sku)).match(/^([A-Z]{2,6})-/); return p && !vendeDesdeCabina(p) && on.has(m ? m[1] : "") && s(p.beta_origen) !== "propio" ? "consignacion" : "propio"; }
  const o = s(p?.beta_origen);
  if (o === "consignacion" || o === "propio") return o;
  const sku = skuCode(s(p?.sku));
  return familiaConsignacion(sku) && !vendeDesdeCabina(p, sku) ? "consignacion" : "propio";
}
/** Vendible (venta / ambos) o Insumo cabina (cabina). */
export const usoDe = (p: Row | undefined): "vendible" | "insumo" => s(p?.uso) === "cabina" ? "insumo" : "vendible";

/** Bodega a la que entra lo recibido. Propio+Vendible → Venta; Insumo → Casa (o la cabina que se elija);
 *  Consignación (TK27) → bodega CONSIGNACION. Las máscaras que se venden desde Cabina siguen yendo a Cabina. */
export function destinoDe(p: Row | undefined, on?: Set<string>): { bodega_id: string } {
  if (vendeDesdeCabina(p)) return { bodega_id: BOD_CABINA };
  if (origenDe(p, on) === "consignacion") return { bodega_id: BOD_CONSIG };
  return { bodega_id: usoDe(p) === "insumo" ? BOD_CASA : BOD_VENTA };
}

/** Une las líneas del mismo producto (OC-0001 tenía JN-001 dos veces) en una sola fila para recibir. */
export function agrupar(lineas: Row[], prods: Map<string, Row>, now: Date, on?: Set<string>): Row[] {
  const g = new Map<string, Row>();
  for (const l of lineas) {
    const k = s(l.producto_id);
    const p = prods.get(k);
    const x = g.get(k) || { producto_id: k, sku: skuCode(s(p?.sku)), nombre: s(p?.nombre), uso: usoDe(p), origen: origenDe(p, on), pedido: 0, recibido: 0, no_recibido: 0, lineas: [] as string[], deshacer: 0, deshacerHasta: "" };
    x.pedido = round2(n(x.pedido) + n(l.cantidad));
    x.recibido = round2(n(x.recibido) + n(l.recibido));
    x.no_recibido = round2(n(x.no_recibido) + n(l.no_recibido));
    (x.lineas as string[]).push(s(l.id));
    const at = s(l.beta_no_recibido_at);
    if (at && n(l.beta_no_recibido_qty) > 0 && now.getTime() - new Date(at).getTime() < UNDO_MS) {
      x.deshacer = round2(n(x.deshacer) + n(l.beta_no_recibido_qty));
      const hasta = new Date(new Date(at).getTime() + UNDO_MS).toISOString();
      if (!x.deshacerHasta || hasta < s(x.deshacerHasta)) x.deshacerHasta = hasta;
    }
    g.set(k, x);
  }
  return [...g.values()].map((x) => ({ ...x, pendiente: Math.max(0, round2(n(x.pedido) - n(x.recibido) - n(x.no_recibido))), ...destinoDe(prods.get(s(x.producto_id)), on) }));
}

/** Reparte una cantidad recibida del grupo entre sus líneas, en orden, sin pasar lo pendiente de cada una. */
export function repartir(lineas: Row[], qty: number): { id: string; cantidad: number }[] {
  const out: { id: string; cantidad: number }[] = [];
  let resto = round2(qty);
  for (const l of lineas) {
    if (resto <= 0) break;
    const pend = round2(n(l.cantidad) - n(l.recibido) - n(l.no_recibido));
    if (pend <= 0) continue;
    const q = Math.min(pend, resto);
    out.push({ id: s(l.id), cantidad: round2(q) });
    resto = round2(resto - q);
  }
  return out;
}

/** Estado de la OC después de recibir o anular líneas (lo anulado cuenta como resuelto). */
export function estadoTrasRecibir(lineas: Row[]): string {
  const alguna = lineas.some((l) => n(l.recibido) > 0);
  const todas = lineas.length > 0 && lineas.every((l) => n(l.recibido) + n(l.no_recibido) + 1e-9 >= n(l.cantidad));
  return alguna ? (todas ? "recibida" : "parcial") : "abierta";
}
