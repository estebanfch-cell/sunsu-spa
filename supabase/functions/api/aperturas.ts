// Destino de un envase abierto dentro de la bodega Cabina.
// Cabina 1, Cabina 2, Cabina 3 y Local son sububicaciones, no bodegas nuevas.

import { ecuadorParts } from "./domain.ts";

export const DESTINOS_CABINA = ["CABINA_1", "CABINA_2", "CABINA_3", "LOCAL"] as const;
export type DestinoCabina = (typeof DESTINOS_CABINA)[number];

/** Bodega Cabina única (0009). Las salas no son bodegas aparte. */
export const BODEGA_CABINA_APERTURA = "22222222-2222-4222-8222-222222222222";

export const CLAVES_ABIERTOS: Record<DestinoCabina, string> = {
  CABINA_1: "ABIERTOS CABINA 1",
  CABINA_2: "ABIERTOS CABINA 2",
  CABINA_3: "ABIERTOS CABINA 3",
  LOCAL: "ABIERTOS LOCAL",
};

export function vacioDestinos(): Record<DestinoCabina, number> {
  return { CABINA_1: 0, CABINA_2: 0, CABINA_3: 0, LOCAL: 0 };
}

export function normDestinoCabina(raw: unknown): DestinoCabina | "" {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (t === "CABINA_1" || t === "CABINA1" || t === "C1") return "CABINA_1";
  if (t === "CABINA_2" || t === "CABINA2" || t === "C2") return "CABINA_2";
  if (t === "CABINA_3" || t === "CABINA3" || t === "C3") return "CABINA_3";
  if (t === "LOCAL" || t === "GENERAL") return "LOCAL";
  return "";
}

export function etiquetaDestino(id: string): string {
  if (id === "CABINA_1") return "Cabina 1";
  if (id === "CABINA_2") return "Cabina 2";
  if (id === "CABINA_3") return "Cabina 3";
  if (id === "LOCAL") return "Local";
  return id ? "Sin destino" : "Sin destino";
}

export function leerAbiertos(orig: Record<string, unknown> | null | undefined): Record<DestinoCabina, number> {
  const o = orig || {};
  const out = vacioDestinos();
  for (const id of DESTINOS_CABINA) {
    const v = o[CLAVES_ABIERTOS[id]];
    const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
    out[id] = Number.isFinite(n) && n > 0 ? n : 0;
  }
  return out;
}

export function escribirAbiertos(orig: Record<string, unknown>, counts: Record<DestinoCabina, number>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...orig };
  for (const id of DESTINOS_CABINA) next[CLAVES_ABIERTOS[id]] = counts[id];
  return next;
}

/** dd/MM/yyyy HH:mm en hora Ecuador, el mismo texto que escribe el Apps Script. */
export function fechaCabina(d: Date): string {
  const p = ecuadorParts(d);
  const z = (x: number) => String(x).padStart(2, "0");
  return `${z(p.d)}/${z(p.m)}/${p.y} ${z(p.hh)}:${z(p.mm)}`;
}

/** Instante de una fecha de la hoja (dd/MM/yyyy) o ISO. El día es el calendario de Ecuador cuando viene en dd/MM. */
export function parseFechaCabina(raw: unknown): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    const hh = Number(m[4] || 0);
    const mm = Number(m[5] || 0);
    let day = a;
    let month = b;
    if (a > 12 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a <= 12) { day = b; month = a; }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return Date.UTC(y, month - 1, day, hh, mm);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const ms = Date.parse(t);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

export type AperturaFila = {
  codigo: string;
  accion: string;
  fecha: string;
  destino?: string;
  num?: string;
  nombre?: string;
  cantidad?: string;
  por?: string;
};

export function esApertura(accion: string): boolean {
  return /APERT|ABRIR/i.test(accion || "");
}

/** Días de calendario entre esta apertura y la anterior del mismo producto. La primera queda en null. */
export function conDiasDesdeApertura<T extends AperturaFila>(rows: T[]): (T & { diasDesdeAnterior: number | null })[] {
  const items = rows.map((r, i) => ({ r, i, t: parseFechaCabina(r.fecha) }));
  items.sort((a, b) => (a.t ?? 0) - (b.t ?? 0) || a.i - b.i);
  const prev = new Map<string, number>();
  const out = new Map<number, number | null>();
  for (const item of items) {
    if (!esApertura(item.r.accion) || item.t == null) {
      out.set(item.i, null);
      continue;
    }
    const antes = prev.get(item.r.codigo);
    let dias: number | null = null;
    if (antes != null) {
      const da = new Date(antes).toISOString().slice(0, 10);
      const db = new Date(item.t).toISOString().slice(0, 10);
      dias = Math.round((Date.parse(db) - Date.parse(da)) / 86400000);
    }
    out.set(item.i, dias);
    prev.set(item.r.codigo, item.t);
  }
  return rows.map((r, i) => ({ ...r, diasDesdeAnterior: out.get(i) ?? null }));
}
