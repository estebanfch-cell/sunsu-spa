// Total de un ticket a partir de sus líneas (facial, extras, paquetes), con el
// precio con IVA del catálogo. Regla de canje: si el ticket canjea un paquete
// (columna "Paquete?" = SI…) o una gift card, el facial vale $0. Extras marcados
// [CORTESIA…] valen $0. El resto del ticket (productos, venta de GC, promos)
// no se recalcula: al editar líneas el total se mueve exactamente por la
// diferencia de las líneas, así el total guardado sigue siendo la única fuente.
import { n, round2, s, skuCode, type Row } from "./domain.ts";

export const LINEA_CAMPOS = ["facial", "extras", "pack3", "pack6"] as const;
const COL: Record<string, string> = { facial: "facial_hecho", extras: "servicios_adicionales", pack3: "compra_pack_3", pack6: "compra_pack_6" };

/** "2833.0" → "2833"; deja el texto (p. ej. "SIN FACTURA") como está. */
export function facturaTxt(v: unknown): string {
  const t = s(v).trim();
  const m = t.match(/^(\d+)\.0+$/);
  return m ? m[1] : t;
}

export function partes(v: unknown): string[] {
  return s(v).split("|").map((x) => x.trim()).filter(Boolean);
}

export function precioCatalogo(cat: Row[], txt: string): number {
  const m = s(txt).match(/SUNSU-\d+/i);
  if (!m) return 0;
  const code = skuCode(m[0].toUpperCase());
  const r = cat.find((c) => skuCode(s(c.sku)) === code);
  return r ? n(r.total_con_iva) : 0;
}

export function esCanjeTicket(row: Row): boolean {
  return /^SI/i.test(s(row.paquete).trim()) || /^SI/i.test(s(row.gift_card).trim());
}

/** Suma con IVA de las líneas editables de un ticket (columnas de la tabla tickets). */
export function totalLineas(row: Row, cat: Row[]): number {
  const canje = esCanjeTicket(row);
  let t = 0;
  if (!canje) for (const f of partes(row.facial_hecho)) t += precioCatalogo(cat, f);
  for (const e of partes(row.servicios_adicionales)) if (!/\[CORTESIA/i.test(e)) t += precioCatalogo(cat, e);
  for (const p of [...partes(row.compra_pack_3), ...partes(row.compra_pack_6)]) t += precioCatalogo(cat, p);
  return round2(t);
}

/** Columnas a escribir cuando se editan líneas: el total nunca viene del cliente. */
export function patchLineas(row: Row, campos: Row, cat: Row[]): Row | null {
  const patch: Row = {};
  for (const k of LINEA_CAMPOS) if (campos[k] != null) patch[COL[k]] = partes(campos[k]).join(" | ");
  if (!Object.keys(patch).length) return null;
  const despues = { ...row, ...patch };
  const nuevo = round2(n(row.estimado) - totalLineas(row, cat) + totalLineas(despues, cat));
  patch.estimado = Math.max(0, nuevo);
  return patch;
}
