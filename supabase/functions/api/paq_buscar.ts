// TK190: búsqueda de paquetes para el canje en el ticket.
// Cruce de cédula tolerante (.0 de Excel, cero de provincia, RUC 001) y sugerencias
// por nombre (sin tildes, cualquier orden, typo, nombre o apellido parcial).
// Nunca devuelve teléfonos.
import { b, cedulasCompatibles, codigoPaquete, n, normCedula, packSesiones, s, USO_FIELDS, type Row } from "./domain.ts";

export function cedDigitosPack(v: unknown): string {
  return s(v).trim().replace(/\.0+$/, "").replace(/\D/g, "");
}

/** Igual que cedulasCompatibles, más el artefacto «604070706.0» → dígitos «6040707060». */
export function cedulasPackCompatibles(a: unknown, b: unknown): boolean {
  if (cedulasCompatibles(a, b)) return true;
  const na = normCedula(a), nb = normCedula(b);
  if (na && nb && na === nb) return true;
  const da = cedDigitosPack(a), db = cedDigitosPack(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const [lo, hi] = da.length <= db.length ? [da, db] : [db, da];
  if (hi === lo + "0" && (lo.length === 9 || lo.length === 10)) return true;
  const na2 = normCedula(lo), nb2 = normCedula(hi.replace(/0$/, ""));
  if (na2 && nb2 && na2 === nb2 && (lo.length === 9 || lo.length === 10) && hi === lo + "0") return true;
  return false;
}

export function foldNombre(v: unknown): string {
  return s(v).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const STOP = new Set(["de", "del", "la", "las", "los", "el", "y", "e"]);
export function tokensNombre(v: unknown): string[] {
  return foldNombre(v).split(/\s+/).filter((t) => t.length >= 2 && !STOP.has(t));
}

export function distLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 2) return 99;
  const m = a.length, n0 = b.length;
  const prev = new Array<number>(n0 + 1), cur = new Array<number>(n0 + 1);
  for (let j = 0; j <= n0; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n0; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
    }
    for (let j = 0; j <= n0; j++) prev[j] = cur[j];
  }
  return prev[n0];
}

export function scoreNombrePaquete(query: string, nombre: string, apellido: string): number {
  const qt = tokensNombre(query), pt = tokensNombre((nombre || "") + " " + (apellido || ""));
  if (!qt.length || !pt.length) return 0;
  let score = 0, matched = 0;
  for (const q of qt) {
    let best = 0;
    for (const p of pt) {
      if (q === p) best = Math.max(best, 50);
      else if (q.length >= 3 && p.length >= 3 && (p.startsWith(q) || q.startsWith(p))) best = Math.max(best, 28);
      else if (q.length >= 4 && p.length >= 4) {
        const d = distLevenshtein(q, p);
        if (d === 1) best = Math.max(best, 22);
        else if (d === 2 && Math.min(q.length, p.length) >= 6) best = Math.max(best, 12);
      }
    }
    if (best) { score += best; matched++; }
  }
  if (matched === qt.length && qt.length >= 2) score += 40;
  if (score < 22) return 0;
  return score;
}

export function usosDePack(r: Row): { usado: boolean; fecha: string }[] {
  return USO_FIELDS.map(([u, f]) => ({ usado: b(r[u]) || !!s(r[f]), fecha: s(r[f]) }));
}

export function packEstaActivo(r: Row, vista?: { total: number; usados: number; anulado?: boolean; completo?: boolean }): boolean {
  if (r.borrado_at) return false;
  const anulado = vista ? vista.anulado === true : (r.orig && typeof r.orig === "object" ? (r.orig as Row).anulado === true : false);
  if (anulado) return false;
  const usos = vista ? null : usosDePack(r);
  const total = vista ? vista.total : packSesiones(s(r.sku), s(r.paquete), usos!);
  const usados = vista ? vista.usados : usos!.slice(0, total).filter((u) => u.usado).length;
  const completo = vista ? vista.completo === true : b(r.completo);
  return !completo && usados < total;
}

export type VistaPaqueteBusca = {
  fila: unknown;
  dia: unknown;
  mes: unknown;
  ano: unknown;
  cedula: string;
  nombre: string;
  apellido: string;
  factura: string;
  sku: string;
  paquete: string;
  vendidoPor: string;
  notas: string;
  usos: { usado: boolean; fecha: string }[];
  usados: number;
  total: number;
  quedan: number;
  completo: boolean;
  codigo: string;
  prueba: boolean;
  id: unknown;
  ticketOrigen: string;
  anulado: boolean;
  match: "cedula" | "codigo" | "nombre";
  score: number;
};

export function vistaPaqueteBusca(r: Row, match: VistaPaqueteBusca["match"], score: number): VistaPaqueteBusca | null {
  if (r.borrado_at) return null;
  const ced = s(r.cedula).replace(/\.0+$/, ""), nom = s(r.nombres), ape = s(r.apellidos);
  if (!ced && !nom) return null;
  const usos = usosDePack(r);
  const total = packSesiones(s(r.sku), s(r.paquete), usos);
  const usados = usos.slice(0, total).filter((u) => u.usado).length;
  const anulado = (r.orig && typeof r.orig === "object" ? (r.orig as Row).anulado === true : false);
  return {
    fila: r.sheet_row, dia: r.dia, mes: r.mes, ano: r.ano, cedula: ced, nombre: nom, apellido: ape,
    factura: s(r.factura), sku: s(r.sku), paquete: s(r.paquete), vendidoPor: s(r.vendido_por), notas: s(r.notas),
    usos: usos.slice(0, total), usados, total, quedan: Math.max(0, total - usados),
    completo: b(r.completo), codigo: codigoPaquete(r), prueba: s(r.origin) === "test", id: r.id,
    ticketOrigen: s((r.orig as Row | undefined)?.ticket), anulado, match, score,
  };
}

function codigoNorm(v: unknown): string {
  return s(v).trim().toUpperCase().replace(/\s+/g, "");
}
function qEsCodigoPack(q: string): string {
  const m = /^pack-?\s*0*(\d+)$/i.exec(s(q).trim());
  return m ? "PACK-" + m[1].padStart(3, "0") : "";
}
function qPareceCedula(q: string): boolean {
  const d = cedDigitosPack(q);
  return d.length >= 8 && d.length <= 14 && !/[a-z]/i.test(s(q));
}

export function buscarPaquetesEn(rows: Row[], p: {
  q?: string;
  nombre?: string;
  apellido?: string;
  soloActivos?: boolean;
  limiteSugerencias?: number;
}): { resultados: VistaPaqueteBusca[]; sugerencias: VistaPaqueteBusca[] } {
  const q = s(p.q).trim();
  const nombreQ = s(p.nombre).trim(), apellidoQ = s(p.apellido).trim();
  const queryNombre = [nombreQ, apellidoQ].filter(Boolean).join(" ") || (!qPareceCedula(q) && !qEsCodigoPack(q) ? q : "");
  const codigoQ = qEsCodigoPack(q);
  const resultados: VistaPaqueteBusca[] = [];
  const fuzzy: VistaPaqueteBusca[] = [];
  const seen = new Set<string>();
  const push = (list: VistaPaqueteBusca[], v: VistaPaqueteBusca | null) => {
    if (!v) return;
    if (p.soloActivos && !packEstaActivo(v as unknown as Row, v)) return;
    const k = String(v.id ?? v.fila ?? "") + ":" + v.codigo;
    if (seen.has(k) && list === resultados) return;
    if (list === resultados) seen.add(k);
    list.push(v);
  };

  for (const r of rows) {
    if (r.borrado_at) continue;
    if (q && qPareceCedula(q) && cedulasPackCompatibles(r.cedula, q)) {
      push(resultados, vistaPaqueteBusca(r, "cedula", 1000));
      continue;
    }
    if (codigoQ) {
      const c = codigoNorm(codigoPaquete(r));
      if (c === codigoQ || c.replace(/^PACK-0+/, "PACK-") === codigoQ.replace(/^PACK-0+/, "PACK-") || c.endsWith(codigoQ.replace(/^PACK-/, ""))) {
        push(resultados, vistaPaqueteBusca(r, "codigo", 900));
        continue;
      }
    }
    if (q && !qPareceCedula(q) && !codigoQ) {
      const blob = [s(r.nombres), s(r.apellidos), s(r.nombres) + " " + s(r.apellidos), codigoPaquete(r), s(r.sku), s(r.paquete)].join(" ");
      const sc = scoreNombrePaquete(q, s(r.nombres), s(r.apellidos));
      const packHit = codigoNorm(codigoPaquete(r)).includes(codigoNorm(q)) && codigoNorm(q).length >= 4;
      const cedHit = cedulasPackCompatibles(r.cedula, q);
      if (cedHit) push(resultados, vistaPaqueteBusca(r, "cedula", 1000));
      else if (packHit) push(resultados, vistaPaqueteBusca(r, "codigo", 900));
      else if (sc > 0) { const v = vistaPaqueteBusca(r, "nombre", sc); if (v) push(resultados, v); }
      else if (foldNombre(blob).includes(foldNombre(q)) && foldNombre(q).length >= 3) {
        const v = vistaPaqueteBusca(r, "nombre", 15);
        if (v) push(resultados, v);
      }
    }
  }

  if (!resultados.length && queryNombre) {
    for (const r of rows) {
      if (r.borrado_at) continue;
      const sc = scoreNombrePaquete(queryNombre, s(r.nombres), s(r.apellidos));
      if (sc <= 0) continue;
      const v = vistaPaqueteBusca(r, "nombre", sc);
      if (v && (!p.soloActivos || packEstaActivo(r, v))) fuzzy.push(v);
    }
    fuzzy.sort((a, b) => b.score - a.score || b.quedan - a.quedan || s(a.codigo).localeCompare(s(b.codigo)));
  }

  resultados.sort((a, b) => b.score - a.score || b.quedan - a.quedan);
  const lim = n(p.limiteSugerencias) || 8;
  return { resultados, sugerencias: fuzzy.slice(0, lim) };
}
