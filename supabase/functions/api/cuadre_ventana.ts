// TK210 (Emilia 21/11): cruce factura Migo ↔ ticket con ventana de ±3 días (las chicas suben tickets al día siguiente).
// Señales: SKU y cantidades (PAQUETE (3) en 1 unidad = SUNSU-18 x3), suma de hasta 6 tickets de la misma clienta
// o del mismo set de SKU, correo/documento de la factura vs ficha de la clienta, y voucher (OCR fecha/monto).
// Nunca vincula si hay ambigüedad o la confianza es baja: eso queda como sugerencia para admin.
import { n, normCedula, s, type Row } from "./domain.ts";
import { lineasDeTicket, normalizarLineaFactura, type LineaNorm } from "./migo_lineas.ts";
import { perfilSku } from "./cuadre_lineas.ts";
import type { AliasMap } from "./inventario_modelo.ts";

export const VENTANA_DIAS = 3;
/** Auto-vínculo con la ventana solo para facturas desde este día (lo anterior: dry-run y sí de Emilia). */
export const VENTANA_AUTO_DESDE = "2026-11-22";
const TOL = 0.05;
const MAX_POOL = 12;
const MAX_COMBO = 6;

export type FacturaVentana = {
  factura: string; seq: number; fecha: string; cliente: string; total: number;
  ruc?: string; email?: string; lineas?: Row[]; formas_pago?: { forma: string; valor: number }[];
};
export type CandVentana = {
  factura: string; fecha_factura: string; tickets: Row[]; ticket_ids: number[]; claves: string[];
  score: number; confianza: "alta" | "baja"; senales: string[]; dias: number[]; dias_max: number;
  suma: number; total_factura: number; motivo: string;
};
export type ResultadoVentana = {
  links: CandVentana[];
  sugerencias: (CandVentana & { razon: string })[];
};

type Cat = Map<string, { nombre?: string; pvpConIva?: number; pvpSinIva?: number }>;

function cents(v: number): number { return Math.round((Number(v) || 0) * 100); }
function cerca(a: number, b: number, tol = TOL): boolean { return Math.abs(cents(a) - cents(b)) <= Math.round(tol * 100); }
export function diasEntre(a: string, b: string): number {
  if (!a || !b) return 99;
  return Math.round((Date.parse(s(a).slice(0, 10) + "T12:00:00Z") - Date.parse(s(b).slice(0, 10) + "T12:00:00Z")) / 86400000);
}
function normEmail(v: unknown): string {
  const t = s(v).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(t) ? t : "";
}

/** Pago directo EGB: va en $0, sin factura. No entra al cruce. */
export function esPagoDirectoCuadre(t: Row): boolean {
  const o = (t.orig && typeof t.orig === "object" ? t.orig : {}) as Row;
  const txt = [s(t.notas_generales), s(t.notas), s(o.justificacion_descuento), s(o["NOTAS GENERALES"])].join(" ");
  return /pago\s*directo/i.test(txt) || /descuento:\s*directo/i.test(txt);
}

export type Perfil = Map<string, { q: number; tot: number }>;
export function perfilFactura(f: FacturaVentana, aliases?: AliasMap): Perfil {
  return perfilSku((f.lineas || []).map(normalizarLineaFactura).filter((x): x is LineaNorm => !!x), aliases);
}
export function perfilTickets(ts: Row[], catalogo?: Cat, aliases?: AliasMap): Perfil {
  const m: Perfil = new Map();
  for (const t of ts) {
    for (const [k, v] of perfilSku(lineasDeTicket(t, catalogo), aliases)) {
      const a = m.get(k) || { q: 0, tot: 0 };
      a.q += v.q; a.tot = Math.round((a.tot + v.tot) * 100) / 100;
      m.set(k, a);
    }
  }
  return m;
}
/** Mismas claves; cantidad igual, o paquete: 1 unidad en Migo = x3 / x6 sesiones en el ticket (o al revés). */
export function compararPerfiles(tk: Perfil, fac: Perfil): { mismosItems: boolean; mismoPrecio: boolean; overlap: number } {
  if (!tk.size || !fac.size) return { mismosItems: false, mismoPrecio: false, overlap: 0 };
  const keys = new Set([...tk.keys(), ...fac.keys()]);
  let overlap = 0, mismos = true, precio = true;
  for (const k of keys) {
    const a = tk.get(k), b = fac.get(k);
    if (a && b) overlap++;
    if (!a || !b) { mismos = false; precio = false; continue; }
    const qOk = Math.abs(a.q - b.q) < 0.001 || [3, 6].some((x) => Math.abs(a.q - b.q * x) < 0.001 || Math.abs(b.q - a.q * x) < 0.001);
    if (!qOk) mismos = false;
    if (!cerca(a.tot, b.tot)) precio = false;
  }
  return { mismosItems: mismos, mismoPrecio: mismos && precio, overlap };
}

function claveCliente(t: Row): string {
  const ced = normCedula(t.id_3 || t.cedula);
  if (ced) return "c:" + ced;
  const o = (t.orig && typeof t.orig === "object" ? t.orig : {}) as Row;
  if (s(o.cliente_key)) return s(o.cliente_key);
  return "n:" + (s(t.nombre) + " " + s(t.apellido)).trim().toLowerCase();
}

function combos<T>(arr: T[], max: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length) out.push(acc.slice());
    if (acc.length >= max) return;
    for (let i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}

export type OptsVentana = {
  catalogo?: Cat; aliases?: AliasMap; dias?: number;
  /** namesMatch inyectado (evita import circular con migo_cuadre). */
  nombres: (a: unknown, b: unknown) => number;
  /** Total del ticket (TK207: total de líneas). */
  totalDe: (t: Row) => number;
  /** Ticket fuera del cruce (canje $0, cortesía, cancelado, sin factura explícita…). */
  excluido: (t: Row) => boolean;
};

/** Evalúa todos los candidatos (factura ↔ 1..6 tickets) dentro de ±dias. No escribe nada. */
export function candidatosVentana(facturas: FacturaVentana[], tickets: Row[], opts: OptsVentana): CandVentana[] {
  const D = opts.dias ?? VENTANA_DIAS;
  const cache = new Map<Row, Perfil>();
  const perfilDe = (t: Row): Perfil => { let p = cache.get(t); if (!p) { p = perfilTickets([t], opts.catalogo, opts.aliases); cache.set(t, p); } return p; };
  const perfilGrupo = (ts: Row[]): Perfil => {
    const m: Perfil = new Map();
    for (const t of ts) for (const [k, v] of perfilDe(t)) { const a = m.get(k) || { q: 0, tot: 0 }; a.q += v.q; a.tot = Math.round((a.tot + v.tot) * 100) / 100; m.set(k, a); }
    return m;
  };
  const libres = tickets.filter((t) => !opts.excluido(t) && !esPagoDirectoCuadre(t) && opts.totalDe(t) > 0.004 && s(t.fecha));
  const out: CandVentana[] = [];
  for (const inv of facturas) {
    if (!inv.fecha || !(n(inv.total) > 0)) continue;
    const pf = perfilFactura(inv, opts.aliases);
    const ruc = normCedula(inv.ruc);
    const email = normEmail(inv.email);
    const formas = (inv.formas_pago || []).map((f) => n(f.valor)).filter((v) => v > 0);
    const señalesTk = (t: Row) => {
      const docs = [normCedula(t.id_3 || t.cedula), ...((t.docs_cliente as string[] | undefined) || []).map(normCedula)].filter(Boolean);
      const emails = ((t.emails_cliente as string[] | undefined) || []).map(normEmail).filter(Boolean);
      const ocr = ((t.ocr_vouchers as Row[] | undefined) || []);
      const doc = !!ruc && docs.includes(ruc);
      const mail = !!email && emails.includes(email);
      const tot = opts.totalDe(t);
      const voucher = ocr.some((o) => s(o.fecha) === inv.fecha && n(o.monto) > 0 && (cerca(n(o.monto), tot) || cerca(n(o.monto), inv.total) || formas.some((v) => cerca(v, n(o.monto)))));
      const nom = opts.nombres((s(t.nombre) + " " + s(t.apellido)).trim(), inv.cliente);
      const ov = pf.size ? compararPerfiles(perfilDe(t), pf).overlap : 0;
      return { doc, mail, voucher, nom, ov };
    };
    const pool0 = libres
      .filter((t) => Math.abs(diasEntre(s(t.fecha), inv.fecha)) <= D)
      .map((t) => ({ t, sg: señalesTk(t) }))
      // relevante: comparte SKU con la factura, o hay documento/correo/voucher/nombre
      .filter((x) => x.sg.ov > 0 || x.sg.doc || x.sg.mail || x.sg.voucher || x.sg.nom >= 2 || cerca(opts.totalDe(x.t), inv.total));
    // cercanía primero (mismo día manda), luego más señales
    pool0.sort((a, b) => Math.abs(diasEntre(s(a.t.fecha), inv.fecha)) - Math.abs(diasEntre(s(b.t.fecha), inv.fecha))
      || (Number(b.sg.doc) + Number(b.sg.mail) + Number(b.sg.voucher)) - (Number(a.sg.doc) + Number(a.sg.mail) + Number(a.sg.voucher)));
    const pool = pool0.slice(0, MAX_POOL);
    for (const grupo of combos(pool, MAX_COMBO)) {
      const ts = grupo.map((x) => x.t);
      const suma = Math.round(ts.reduce((a, t) => a + opts.totalDe(t), 0) * 100) / 100;
      const montoOk = cerca(suma, inv.total);
      const cmp = pf.size ? compararPerfiles(perfilGrupo(ts), pf) : { mismosItems: false, mismoPrecio: false, overlap: 0 };
      const mismaClienta = new Set(ts.map(claveCliente)).size === 1;
      if (ts.length > 1 && !mismaClienta && !cmp.mismosItems) continue;
      if (!cmp.mismosItems && !montoOk) continue;
      const doc = grupo.some((x) => x.sg.doc), mail = grupo.some((x) => x.sg.mail), voucher = grupo.some((x) => x.sg.voucher);
      const nom = Math.max(0, ...grupo.map((x) => x.sg.nom));
      const dias = ts.map((t) => diasEntre(s(t.fecha), inv.fecha));
      const diasMax = Math.max(...dias.map((d) => Math.abs(d)));
      const senales: string[] = [];
      if (cmp.mismoPrecio) senales.push("SKU y cantidades");
      else if (cmp.mismosItems) senales.push("SKU (valor distinto)");
      if (montoOk) senales.push(ts.length > 1 ? "suma de " + ts.length + " tickets" : "monto");
      if (doc) senales.push("documento");
      if (mail) senales.push("correo");
      if (voucher) senales.push("voucher");
      if (nom >= 2) senales.push("nombre");
      let score = (cmp.mismoPrecio ? 40 : cmp.mismosItems ? 30 : 0) + (montoOk ? 20 : 0) + (doc ? 25 : 0) + (mail ? 25 : 0) + (voucher ? 20 : 0) + (nom >= 2 ? 15 : nom === 1 ? 5 : 0);
      score -= diasMax * 3 + (ts.length - 1);
      const identidad = doc || mail || voucher || nom >= 2;
      const alta = cmp.mismosItems && montoOk && identidad && (cmp.mismoPrecio || doc || mail);
      const cuando = diasMax === 0 ? "mismo día" : dias.map((d) => d === 0 ? "mismo día" : (Math.abs(d) + (Math.abs(d) === 1 ? " día " : " días ") + (d > 0 ? "después" : "antes"))).filter((x, i, a) => a.indexOf(x) === i).join(", ");
      out.push({
        factura: inv.factura, fecha_factura: inv.fecha, tickets: ts, ticket_ids: ts.map((t) => n(t.id)), claves: ts.map((t) => s(t.clave || t.so_num)),
        score, confianza: alta ? "alta" : "baja", senales, dias, dias_max: diasMax, suma, total_factura: n(inv.total),
        motivo: "Ventana ±" + D + " días: " + senales.join(" + ") + " · ticket " + cuando + " de la factura",
      });
    }
  }
  return out;
}

/**
 * Elige los vínculos seguros: por factura, el mejor candidato «alta» sin empate cercano;
 * un ticket que es el mejor de dos facturas no se vincula. Lo demás queda como sugerencia.
 */
export function resolverVentana(cands: CandVentana[]): ResultadoVentana {
  const porFac = new Map<string, CandVentana[]>();
  for (const c of cands) { const L = porFac.get(c.factura) || []; L.push(c); porFac.set(c.factura, L); }
  const mejores: CandVentana[] = [];
  const sugerencias: (CandVentana & { razon: string })[] = [];
  for (const [, L] of porFac) {
    L.sort((a, b) => b.score - a.score || a.dias_max - b.dias_max || a.tickets.length - b.tickets.length);
    const best = L[0];
    const rival = L.find((c) => c !== best && c.score >= best.score - 5 && c.ticket_ids.join() !== best.ticket_ids.join());
    if (best.confianza !== "alta") { sugerencias.push({ ...best, razon: "confianza baja" }); continue; }
    if (rival) { sugerencias.push({ ...best, razon: "ambiguo: también encaja " + rival.claves.join(" + ") }); continue; }
    mejores.push(best);
  }
  const usoTk = new Map<number, number>();
  for (const c of mejores) for (const id of c.ticket_ids) usoTk.set(id, (usoTk.get(id) || 0) + 1);
  const links: CandVentana[] = [];
  for (const c of mejores) {
    if (c.ticket_ids.some((id) => (usoTk.get(id) || 0) > 1)) sugerencias.push({ ...c, razon: "ambiguo: el ticket encaja con otra factura" });
    else links.push(c);
  }
  return { links, sugerencias };
}
