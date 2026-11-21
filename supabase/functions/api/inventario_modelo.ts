// TK127: un producto, código según la bodega, stock por dueño.
// Cabina/Oficina muestran el código interno (INV-110). Venta/consignación
// muestran el SKU del proveedor (ML-008). Una transferencia no cambia el
// producto ni el dueño: solo cambia el código que aplica. La liquidación
// al proveedor cuenta únicamente unidades vendidas de stock de consignación
// del proveedor, nunca las que son de Sunsu (aunque se vendan con el SKU
// del proveedor). No se menciona la duplicación HT/VK al proveedor.

import { n, s, skuCode, type Row } from "./domain.ts";

export const PROP_SUNSU = "sunsu";
export const PROP_CONSIG = "consignacion";

export function round4(x: number): number {
  return Math.round((x + Number.EPSILON) * 10000) / 10000;
}

/** Venta o consignación: el código que se imprime y se busca en Migo/CUADRE. */
export function esBodegaVenta(bodega: unknown, tipo?: unknown): boolean {
  const c = s(bodega).toUpperCase();
  const t = s(tipo).toLowerCase();
  if (t === "venta" || t === "consignacion") return true;
  return c === "VENTA" || c === "CONSIGNACION" || c === "BCONSIG" || c === "LOCAL";
}

/** Cabina u Oficina (Casa): el código interno de Sunsu. */
export function esBodegaInterna(bodega: unknown, tipo?: unknown): boolean {
  const c = s(bodega).toUpperCase();
  const t = s(tipo).toLowerCase();
  if (t === "cabina" || t === "casa" || t === "bodega") return true;
  return c === "CABINA" || c === "CAB2" || c === "CAB3" || c === "CASA" || c === "OFICINA";
}

export function skuInternoDe(p: Row | undefined, fallback = ""): string {
  return skuCode(s(p?.codigo_interno) || s(p?.sku) || fallback);
}

export function skuVentaDe(p: Row | undefined, fallback = ""): string {
  return skuCode(s(p?.sku_proveedor) || s(p?.sku) || fallback);
}

/** Código que se muestra / se imprime según la bodega. Un solo producto. */
export function skuPorBodega(p: Row | undefined, bodega: unknown, tipo?: unknown, fallback = ""): string {
  if (esBodegaInterna(bodega, tipo)) return skuInternoDe(p, fallback);
  if (esBodegaVenta(bodega, tipo)) return skuVentaDe(p, fallback);
  return skuCode(s(p?.sku) || fallback);
}

export function esLoteRevision(lote: unknown): boolean {
  return /^REV:/i.test(s(lote));
}

export function propietarioDe(row: { propietario?: unknown; lote?: unknown } | undefined, fallback = PROP_SUNSU): string {
  const p = s(row?.propietario).toLowerCase();
  if (p === PROP_CONSIG || p === PROP_SUNSU) return p;
  const lote = s(row?.lote);
  if (/^CONSIG/i.test(lote) || esLoteRevision(lote)) return PROP_CONSIG;
  if (/^SUNSU/i.test(lote)) return PROP_SUNSU;
  return fallback;
}

/** Dueño por defecto al migrar stock existente, según bodega y familia. */
export function propietarioPorDefecto(bodegaCodigo: unknown, tipoBodega?: unknown, esFamiliaConsig = false): string {
  if (esBodegaInterna(bodegaCodigo, tipoBodega)) return PROP_SUNSU;
  const c = s(bodegaCodigo).toUpperCase();
  const t = s(tipoBodega).toLowerCase();
  if (c === "CONSIGNACION" || t === "consignacion") return PROP_CONSIG;
  if ((c === "VENTA" || t === "venta") && esFamiliaConsig) return PROP_CONSIG;
  return PROP_SUNSU;
}

export function esFamiliaConsigSku(sku: unknown): boolean {
  return /^(ML|VK|HT|AS|PH|JN)-/i.test(skuCode(sku));
}

export type LoteStock = {
  bodega_id: string;
  lote: string;
  sububicacion: string;
  cantidad: number;
  propietario: string;
};

export type TomaLote = LoteStock & { toma: number; queda: number };

const ORDEN_BODEGA = (consigId: string, ventaId: string) => (id: string) => {
  if (id === consigId) return 0;
  if (id === ventaId) return 1;
  return 2;
};

/** Orden de descuento (TK200): stock propio primero, después consignación del proveedor
 *  (bodega CONSIGNACION, luego lotes de proveedor en Venta). Nunca deja un lote en negativo. */
export function repartirSalidaVenta(qty: number, lots: LoteStock[], consigId: string, ventaId: string): { tomas: TomaLote[]; resto: number } {
  const need = round4(Math.max(0, qty));
  if (!(need > 0)) return { tomas: [], resto: 0 };
  const ordenBod = ORDEN_BODEGA(consigId, ventaId);
  const avail = lots
    .filter((l) => (l.bodega_id === consigId || l.bodega_id === ventaId) && n(l.cantidad) > 0)
    .slice()
    .sort((a, b) => {
      const oa = propietarioDe(a) === PROP_SUNSU ? 0 : 1;
      const ob = propietarioDe(b) === PROP_SUNSU ? 0 : 1;
      if (oa !== ob) return oa - ob;
      const db = ordenBod(a.bodega_id) - ordenBod(b.bodega_id);
      if (db) return db;
      return s(a.lote).localeCompare(s(b.lote));
    });
  const tomas: TomaLote[] = [];
  let queda = need;
  for (const l of avail) {
    if (queda <= 0) break;
    const toma = round4(Math.min(n(l.cantidad), queda));
    if (toma <= 0) continue;
    tomas.push({ ...l, toma, queda: round4(n(l.cantidad) - toma) });
    queda = round4(queda - toma);
  }
  return { tomas, resto: queda };
}

/** Unidades que sí se pagan al proveedor: ventas (delta < 0) de stock de consignación del proveedor. */
export function esVentaPagableProveedor(mov: Row, bodega?: Row): boolean {
  const tipo = s(mov.tipo);
  if (tipo !== "venta" && tipo !== "anulacion") return false;
  const due = propietarioDe(mov, "");
  if (due === PROP_SUNSU) return false;
  if (due === PROP_CONSIG) return true;
  // Movimiento viejo sin dueño: solo cuenta si salió de Venta/Consignación.
  return esBodegaVenta(bodega?.codigo || mov.bodega || mov.bodega_id, bodega?.tipo);
}

export function qtyPagableProveedor(mov: Row, bodega?: Row): number {
  if (!esVentaPagableProveedor(mov, bodega)) return 0;
  return round4(-n(mov.delta));
}

export type AliasMap = Map<string, string>; // alias/código → sku canónico (erp)

export function mapaAliases(aliases: Row[]): AliasMap {
  const m: AliasMap = new Map();
  for (const a of aliases || []) {
    const alias = skuCode(s(a.alias) || s(a.codigo));
    const sku = skuCode(s(a.sku));
    if (alias && sku) m.set(alias, sku);
  }
  return m;
}

/** Resuelve cualquier código (INV-110, SUNSU-ML-008, ML-008) al SKU canónico del producto. */
export function resolverSku(codigo: unknown, aliases: AliasMap, productos?: Row[]): string {
  const c = skuCode(codigo);
  if (!c) return "";
  if (aliases.has(c)) return aliases.get(c) || c;
  if (productos) {
    const hit = productos.find((p) => skuCode(s(p.sku)) === c || skuCode(s(p.codigo_interno)) === c || skuCode(s(p.sku_proveedor)) === c);
    if (hit) return skuCode(s(hit.sku));
  }
  return c;
}

/** Clave única para cuadrar ticket vs factura Migo: todos los alias de un producto caen en el SKU de venta. */
export function claveCuadre(codigo: unknown, aliases: AliasMap, porSku: Map<string, Row>): string {
  const can = resolverSku(codigo, aliases, [...porSku.values()]);
  const p = porSku.get(can);
  return p ? skuVentaDe(p, can) : can;
}

export const NOTA_LIQUIDACION_TK127 =
  "Los productos son entregados en modalidad de CONSIGNACIÓN. Sunsu Spa paga solo las unidades vendidas desde stock de consignación del proveedor, a precio de compra + IVA. No se paga stock propio de Sunsu aunque se venda con el código del proveedor, ni lo transferido a cabina.";

export const FLAG_PENDIENTE_CONTEO = "Pendiente de conteo: stock en 2 lotes";
