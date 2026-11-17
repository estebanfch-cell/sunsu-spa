// Revisión de códigos de barras de todo el inventario (TK17): sin código, EAN-13 que no cuadra, repetidos.
import { codigoBarrasNorm, ean13Valido } from "./productos.ts";
import { s, type Row } from "./domain.ts";

export type Problema = { tipo: "sin_codigo" | "ean_invalido" | "repetido"; codigo?: string; con?: string };
export function revisarBarras(prods: Row[]): Map<string, Problema[]> {
  const duenos = new Map<string, Set<string>>();
  const codigosDe = (p: Row) => [...new Set(((p.barras as unknown[]) || []).map(codigoBarrasNorm).filter(Boolean))];
  for (const p of prods) for (const c of codigosDe(p)) { if (!duenos.has(c)) duenos.set(c, new Set()); duenos.get(c)!.add(s(p.id)); }
  const sku = new Map(prods.map((p) => [s(p.id), s(p.skuVisible) || s(p.sku)]));
  const out = new Map<string, Problema[]>();
  for (const p of prods) {
    const L: Problema[] = [];
    const cs = codigosDe(p);
    if (!cs.length) L.push({ tipo: "sin_codigo" });
    for (const c of cs) {
      if (/^\d{13}$/.test(c) && !ean13Valido(c)) L.push({ tipo: "ean_invalido", codigo: c });
      const otros = [...(duenos.get(c) || [])].filter((x) => x !== s(p.id));
      if (otros.length) L.push({ tipo: "repetido", codigo: c, con: otros.map((x) => sku.get(x)).join(", ") });
    }
    out.set(s(p.id), L);
  }
  return out;
}
