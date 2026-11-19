// Cruce de tickets con facturas vivas de Migo (solo lectura). No emite ni anula facturas.
import { b, n, s, type Row, round2 } from "./domain.ts";

import { compararFacturaYTickets, lineasDeTicket, normalizarLineaFactura, type LineaNorm } from "./migo_lineas.ts";
import { difPorSku, totalTicketCuadre } from "./cuadre_sku.ts";
import type { AliasMap } from "./inventario_modelo.ts";
import { tipoSinCobro } from "./sin_cobro.ts";
import { cruzarPerfilesSku, esCanjeCero, perfilSku } from "./cuadre_lineas.ts";
export const TOL_MONTO = 0.05;
export const NUNCA_TICKET_ID = 1820;
export const FALTA_CUADRE_DESDE = "2026-11-01";

export function facSeq(v: unknown): number | null {
  const t = s(v).trim();
  if (!t || /^(sin factura|s\/f|sf|n\/?a|none|null|false)$/i.test(t)) return null;
  const m = t.match(/(\d{3})-(\d{3})-(\d{1,9})/);
  if (m) return Number(m[3]);
  const s2 = t.replace(",", "");
  if (/^\d+(?:\.0+)?$/.test(s2)) return Number(s2.split(".")[0]);
  const d = s2.match(/(\d{3,})/);
  return d ? Number(d[1]) : null;
}

export function normNombreMigo(v: unknown): string {
  const t = s(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ");
  return t.split(/\s+/).filter((w) => w && !["DE", "DEL", "LA", "LAS", "LOS", "Y", "DA", "DO", "SAN", "SANTA"].includes(w)).join(" ");
}

export function namesMatch(a: unknown, b: unknown): number {
  const ta = new Set(normNombreMigo(a).split(" ").filter(Boolean));
  const tb = new Set(normNombreMigo(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  const inter = [...ta].filter((x) => tb.has(x));
  if (ta.size === tb.size && inter.length === ta.size) return 3;
  if ([...ta].every((x) => tb.has(x)) || [...tb].every((x) => ta.has(x))) return 2;
  if (inter.length >= 2) return 1;
  if (inter.length === 1 && Math.min(ta.size, tb.size) === 1) return 1;
  if (inter.some((x) => x.length >= 5)) return 1;
  return 0;
}

export function esConsumidorFinal(cliente: unknown): boolean {
  const n0 = normNombreMigo(cliente);
  return n0 === "CF" || n0 === "CONSUMIDOR FINAL" || n0.startsWith("CONSUMIDOR FINAL ");
}

/** Fecha del ticket en America/Guayaquil (UTC-5). */
export function fechaGye(v: unknown): string {
  const x = s(v).trim();
  if (!x) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return x;
  const iso = x.replace(" ", "T");
  const ms = Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso);
  if (!Number.isFinite(ms)) return x.slice(0, 10);
  return new Date(ms - 5 * 3600e3).toISOString().slice(0, 10);
}

export function metodosTicket(comp: unknown): string[] {
  return s(comp).split(/\s*[,;|]\s*/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = x.split(":")[0].trim().toLowerCase();
    if (/^efec/.test(m)) return "efectivo";
    if (/^tarj/.test(m)) return "tarjeta";
    if (/^tran/.test(m)) return "transferencia";
    if (/^canj/.test(m)) return "canje";
    if (/^cortesia|^cortesía/.test(m)) return "cortesia";
    return m;
  });
}

export function exentoCuadre(t: Row, catalogo?: Map<string, { nombre?: string; pvpConIva?: number; pvpSinIva?: number }>): boolean {
  const fac = s(t.facturaBeta || t.fac_7);
  if (/sin\s*factura|s\/f/i.test(fac)) return true;
  const mets = metodosTicket(t.comp);
  if (mets.includes("canje") || mets.includes("cortesia") || mets.includes("cortesía")) return true;
  // TK99: en $0 por cortesía, consumo interno o canje de paquete: no se cruza con Migo.
  if (tipoSinCobro(t)) return true;
  // TK135: un ticket solo en $0 (canje puro, sin compra) no se cruza ni se marca «sin factura».
  if (ticketSoloCero(t, catalogo)) return true;
  return false;
}

/** TK135: ticket sin compra (total $0 / solo canjes). No se vincula a facturas pagadas ni se marca «sin factura». */
export function ticketSoloCero(t: Row, catalogo?: Map<string, { nombre?: string; pvpConIva?: number; pvpSinIva?: number }>): boolean {
  const L = lineasDeTicket(t, catalogo);
  if (L.some((l) => !esCanjeCero(l) && n(l.totalCon) > 0.004)) return false;
  // Líneas de compra a $0 suelen ser catálogo ausente: si el estimado es > $0, no es canje puro.
  if (L.some((l) => !esCanjeCero(l))) return !(n(t.estimado) > 0.004);
  return !(n(t.estimado) > 0.004);
}

export function estaPagado(t: Row): boolean {
  return b(t.cob);
}

export function formaNorm(v: unknown): string {
  const m = s(v).trim().toLowerCase();
  if (!m) return "";
  if (/^efec/.test(m)) return "efectivo";
  if (/^tarj/.test(m)) return "tarjeta";
  if (/^tran/.test(m)) return "transferencia";
  if (/^canj/.test(m)) return "canje";
  if (/^cortesia|^cortesía/.test(m)) return "cortesia";
  if (/^mix/.test(m)) return "mixto";
  if (/^deuna/.test(m)) return "deuna";
  if (/^gift/.test(m)) return "gift_card";
  return "no_registrado";
}

/** Forma visible: primero el ticket (comp), si no la beta, si no Migo. Varios métodos → mixto. */
export function formaDeTicket(t: Row, datos?: Row, formaMigo?: string): string {
  const fromComp = [...new Set(metodosTicket(t.comp).map(formaNorm).filter(Boolean))];
  if (fromComp.length === 1) return fromComp[0];
  if (fromComp.length > 1) return "mixto";
  const d = formaNorm(datos?.forma_pago);
  if (d) return d;
  return formaNorm(formaMigo || (datos?.pago_migo && typeof datos.pago_migo === "object" ? (datos.pago_migo as Row).forma : ""));
}


export type LineaFactura = { codigo?: string; sku?: string; producto?: string; tipo?: string; cantidad?: number; precio_unit?: number; descuento?: number; subtotal?: number; iva?: number; total?: number };

export type FacturaVivo = {
  factura: string; seq: number; fecha: string; hora?: string; cliente: string;
  total: number; subtotal?: number; descuento?: number; forma?: string;
  formas_pago?: { forma: string; valor: number }[];
  lineas?: LineaFactura[];
};
export type LinkCuadre = {
  ticket_id: number; factura: string; tipo: "numero" | "nombre_fecha_monto" | "sku_fecha" | "sku_fecha_suma" | "facturas_suma"; confianza: "alta" | "media";
  diferencia_monto: number; diferencia_fecha: number; estado: "cuadra" | "redondeo" | "diferencia";
  motivo: string; cliente_migo: string; total_factura: number; total_tickets: number;
  /** TK135: todas las facturas cuando un ticket cuadra con varias del mismo día. */
  facturas?: string[];
};
export type OptsCuadre = { catalogo?: Map<string, { nombre?: string; pvpConIva?: number; pvpSinIva?: number }>; aliases?: AliasMap };
export type FlagDeseada = { ticket_id: number; ticket_clave: string; kind: "monto" | "clienta" | "sinfac" | "lineas"; motivo: string; detalle: string; factura: string | null };

function nombreTicket(t: Row): string {
  return (s(t.nombre) + " " + s(t.apellido)).trim();
}
function facturasDeLink(L: { factura: string; facturas?: string[] }, facturas: FacturaVivo[]): FacturaVivo[] {
  const nums = [...new Set([L.factura, ...(L.facturas || [])].filter(Boolean))];
  return nums.map((f) => facturas.find((x) => x.factura === f)).filter((x): x is FacturaVivo => !!x);
}
function lineasDeFacturas(FF: FacturaVivo[]): Row[] {
  return FF.flatMap((f) => (Array.isArray(f.lineas) ? f.lineas as Row[] : []));
}
/** TK98: « Qué SKU hace la diferencia: Falta en ticket: SUNSU-35 GIFT CARD $3.00.» (solo por SKU). */
function difSkuDeLink(L: { factura: string; facturas?: string[] }, facturas: FacturaVivo[], hermanos: Row[], t: Row, catalogo?: Map<string, { nombre?: string; pvpConIva?: number }>, aliases?: AliasMap): string {
  const FF = facturasDeLink(L, facturas);
  const lineas = lineasDeFacturas(FF);
  if (!lineas.length) return "";
  const d = difPorSku(lineas, hermanos.length ? hermanos : [t], catalogo, aliases);
  return d.length ? " " + d.join(" · ") + "." : "";
}
/** TK90: cancelado/anulado (beta o sistema anterior). */
export function ticketCancelado(t: Row): boolean {
  const o = t.orig && typeof t.orig === "object" ? t.orig as Row : {};
  return o.anulado === true || t.cancelado === true || t.anulado === true || !!t.borrado_at || /cancel|anulad/i.test(s(t.estado_beta || t.estado_ticket));
}
function totalTicket(t: Row): number {
  return n(t.estimado);
}

/** Cruce: por número de factura; si no, mismo día + SKU (1-a-varios / varios-a-1) o nombre+monto. Los tickets de $0 no entran. El nombre distinto no impide el cruce si los SKU cuadran. */
export function cruzar(facturas: FacturaVivo[], tickets: Row[], opts?: OptsCuadre): LinkCuadre[] {
  const catalogo = opts?.catalogo;
  const aliases = opts?.aliases;
  const bySeq = new Map<number, FacturaVivo>();
  for (const f of facturas) if (f.seq) bySeq.set(f.seq, f);
  const usedT = new Set<number>(), usedInv = new Set<number>();
  const groups = new Map<number, Row[]>();
  for (const t of tickets) {
    if (ticketSoloCero(t, catalogo)) continue;
    const seq = facSeq(t.facturaBeta || t.fac_7);
    if (!seq || !bySeq.has(seq)) continue;
    const L = groups.get(seq) || [];
    L.push(t); groups.set(seq, L);
    usedT.add(n(t.id)); usedInv.add(seq);
  }
  const links: LinkCuadre[] = [];
  const pushGroup = (invs: FacturaVivo[], ts: Row[], tipo: LinkCuadre["tipo"], confianza: LinkCuadre["confianza"]) => {
    const invList = invs;
    const tsum = ts.reduce((a, t) => a + totalTicket(t), 0);
    const invTotal = invList.reduce((a, inv) => a + inv.total, 0);
    const diff = Math.round((tsum - invTotal) * 100) / 100;
    const estado: LinkCuadre["estado"] = Math.abs(diff) <= 0 ? "cuadra" : Math.abs(diff) <= TOL_MONTO ? "redondeo" : "diferencia";
    const motivos: string[] = [];
    if (ts.length > 1) motivos.push("una factura cubre " + ts.length + " tickets");
    if (invList.length > 1) motivos.push(invList.length + " facturas cubren un ticket");
    if (estado === "diferencia") motivos.push("diferencia de monto $" + diff.toFixed(2));
    else if (estado === "redondeo") motivos.push("redondeo");
    const facs = invList.map((x) => x.factura);
    for (const t of ts) {
      const inv0 = invList[0];
      const fd = t.fecha && inv0.fecha ? Math.round((Date.parse(s(t.fecha) + "T12:00:00Z") - Date.parse(inv0.fecha + "T12:00:00Z")) / 86400000) : 0;
      links.push({
        ticket_id: n(t.id), factura: inv0.factura, tipo, confianza,
        diferencia_monto: diff, diferencia_fecha: fd, estado,
        motivo: motivos.join("; "), cliente_migo: invList.map((x) => x.cliente).filter(Boolean).join(" · "),
        total_factura: invTotal, total_tickets: tsum,
        ...(facs.length > 1 ? { facturas: facs } : {}),
      });
    }
  };
  for (const [seq, ts] of groups) {
    const inv = bySeq.get(seq)!;
    pushGroup([inv], ts, "numero", "alta");
  }
  const unmatchedInv = facturas.filter((f) => !usedInv.has(f.seq));
  const unmatchedTk = tickets.filter((t) => !usedT.has(n(t.id)) && !exentoCuadre(t, catalogo) && !ticketSoloCero(t, catalogo));
  type Cand = { sc: number; tokens: number; days: number; ad: number; t: Row; inv: FacturaVivo };
  const cands: Cand[] = [];
  for (const t of unmatchedTk) {
    for (const inv of unmatchedInv) {
      const tokens = namesMatch(nombreTicket(t), inv.cliente);
      const ad = Math.abs((totalTicket(t) || 999) - inv.total);
      const days = t.fecha && inv.fecha ? Math.abs(Math.round((Date.parse(s(t.fecha) + "T12:00:00Z") - Date.parse(inv.fecha + "T12:00:00Z")) / 86400000)) : 99;
      let sc = 0;
      if (tokens >= 2 && ad <= TOL_MONTO && days <= 1) sc = 3;
      if (sc) cands.push({ sc, tokens, days, ad, t, inv });
    }
  }
  cands.sort((a, b) => b.sc - a.sc || b.tokens - a.tokens || a.days - b.days || a.ad - b.ad);
  const seenT = new Set<number>(), seenI = new Set<number>();
  for (const c of cands) {
    const tid = n(c.t.id);
    if (seenT.has(tid) || seenI.has(c.inv.seq)) continue;
    seenT.add(tid); seenI.add(c.inv.seq);
    usedT.add(tid); usedInv.add(c.inv.seq);
    pushGroup([c.inv], [c.t], "nombre_fecha_monto", "media");
  }

  // TK135: mismo día (da igual la hora), por SKU canónico. El nombre no es requisito.
  // 1 factura ↔ 1..3 tickets, o 2..3 facturas ↔ 1 ticket. Si los ítems cuadran y el valor no (descuento), igual se vincula.
  type SkuCand = { sc: number; invs: FacturaVivo[]; ts: Row[]; tipo: LinkCuadre["tipo"]; conf: LinkCuadre["confianza"] };
  const skuCands: SkuCand[] = [];
  const perfilFac = (f: FacturaVivo) => perfilSku((f.lineas || []).map(normalizarLineaFactura).filter((x): x is LineaNorm => !!x), aliases);
  const perfilTks = (ts: Row[]) => {
    const m = new Map<string, { q: number; tot: number }>();
    for (const t of ts) {
      for (const [k, v] of perfilSku(lineasDeTicket(t, catalogo), aliases)) {
        const a = m.get(k) || { q: 0, tot: 0 };
        a.q += v.q; a.tot = Math.round((a.tot + v.tot) * 100) / 100;
        m.set(k, a);
      }
    }
    return m;
  };
  const scoreSku = (pa: Map<string, { q: number; tot: number }>, pb: Map<string, { q: number; tot: number }>): { sc: number; conf: LinkCuadre["confianza"] } | null => {
    const r = cruzarPerfilesSku(pa, pb);
    if (r.mismoPrecio) return { sc: 8, conf: "alta" };
    if (r.mismaCantidad) return { sc: 7, conf: "media" }; // mismos ítems, distinto valor (descuento)
    return null;
  };
  // TK143: 1..N tickets (hasta 6) contra 1 factura, o 1 ticket contra N facturas, mismo día.
  const combosDe = <T,>(arr: T[], max: number): T[][] => {
    const a = arr.slice(0, 12);
    const out: T[][] = [];
    const rec = (start: number, acc: T[]) => {
      if (acc.length && acc.length <= max) out.push(acc.slice());
      if (acc.length >= max) return;
      for (let i = start; i < a.length; i++) {
        acc.push(a[i]);
        rec(i + 1, acc);
        acc.pop();
      }
    };
    rec(0, []);
    return out;
  };
  const stillTk = tickets.filter((t) => !usedT.has(n(t.id)) && !exentoCuadre(t, catalogo) && !ticketSoloCero(t, catalogo) && !ticketCancelado(t));
  const stillInv = facturas.filter((f) => !usedInv.has(f.seq));
  for (const inv of stillInv) {
    const pool = stillTk.filter((t) => fechaGye(t.fecha) === inv.fecha);
    if (!pool.length) continue;
    const pf = perfilFac(inv);
    if (!pf.size) continue;
    for (const ts of combosDe(pool, 6)) {
      const r = scoreSku(perfilTks(ts), pf);
      if (!r) continue;
      skuCands.push({ sc: r.sc + (ts.length === 1 ? 0.2 : 0), invs: [inv], ts, tipo: ts.length > 1 ? "sku_fecha_suma" : "sku_fecha", conf: r.conf });
    }
  }
  for (const t of stillTk) {
    const pool = stillInv.filter((f) => f.fecha === fechaGye(t.fecha) && perfilFac(f).size);
    if (pool.length < 2) continue;
    const pt = perfilTks([t]);
    if (!pt.size) continue;
    for (const invs of combosDe(pool, 6)) {
      if (invs.length < 2) continue;
      const pf = new Map<string, { q: number; tot: number }>();
      for (const inv of invs) {
        for (const [k, v] of perfilFac(inv)) {
          const a = pf.get(k) || { q: 0, tot: 0 };
          a.q += v.q; a.tot = Math.round((a.tot + v.tot) * 100) / 100;
          pf.set(k, a);
        }
      }
      const r = scoreSku(pt, pf);
      if (!r) continue;
      skuCands.push({ sc: r.sc, invs, ts: [t], tipo: "facturas_suma", conf: r.conf });
    }
  }
  skuCands.sort((a, b) => b.sc - a.sc);
  for (const c of skuCands) {
    if (c.ts.some((t) => usedT.has(n(t.id))) || c.invs.some((inv) => usedInv.has(inv.seq))) continue;
    for (const t of c.ts) usedT.add(n(t.id));
    for (const inv of c.invs) usedInv.add(inv.seq);
    pushGroup(c.invs, c.ts, c.tipo, c.conf);
  }
  return links;
}

/** Día de la semana de un YMD (0=domingo … 1=lunes), mediodía UTC para no cruzar fecha. */
export function dowYmd(ymd: string): number {
  return new Date(s(ymd).slice(0, 10) + "T12:00:00Z").getUTCDay();
}

/**
 * La persona de facturación no trabaja los lunes.
 * Un ticket del lunes, cobrado y aún sin factura en Migo, no se marca rojo
 * «sin factura» hasta que cierre el martes. Mientras tanto es «Pendiente por lunes».
 */
export function esperandoFacturaLunes(fecha: string, hoyGye: string): boolean {
  const f = s(fecha).slice(0, 10), h = s(hoyGye).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(h)) return false;
  if (dowYmd(f) !== 1) return false;
  const martes = new Date(f + "T12:00:00Z");
  martes.setUTCDate(martes.getUTCDate() + 1);
  return h <= martes.toISOString().slice(0, 10);
}

export type CambioSku = { ticket_id: number; ticket_clave: string; factura: string; desde: string; hacia: string; texto: string };

export function flagsDeseadas(p: {
  tickets: Row[];
  links: LinkCuadre[];
  facturas: FacturaVivo[];
  hoyGye: string;
  importadoGye: string;
  /** TK81: aquí se juntan las líneas corregidas con la factura (mismo servicio, otro SKU). */
  cambios?: CambioSku[];
  /** TK81 + TK133: precios de catálogo (con IVA) por código; también para armar el total y las líneas de la hoja. */
  catalogo?: Map<string, { nombre?: string; pvpConIva?: number }>;
  /** TK127/TK133: alias canónicos (INV-110 → ML-008) para comparar solo por SKU. */
  aliases?: AliasMap;
}): FlagDeseada[] {
  const cambios = p.cambios || [];
  const maxSeq = p.facturas.reduce((a, f) => Math.max(a, f.seq || 0), 0);
  const linksByTk = new Map<number, LinkCuadre[]>();
  const tksByInv = new Map<string, number[]>();
  for (const L of p.links) {
    const a = linksByTk.get(L.ticket_id) || [];
    a.push(L); linksByTk.set(L.ticket_id, a);
    const b = tksByInv.get(L.factura) || [];
    b.push(L.ticket_id); tksByInv.set(L.factura, b);
  }
  const byId = new Map(p.tickets.map((t) => [n(t.id), t]));
  const out: FlagDeseada[] = [];
  for (const t of p.tickets) {
    const id = n(t.id);
    if (id === NUNCA_TICKET_ID) continue;
    if (s(t.fecha) < FALTA_CUADRE_DESDE) continue;
    if (exentoCuadre(t, p.catalogo) || !estaPagado(t)) continue;
    const clave = s(t.clave || t.so_num);
    const Ls = linksByTk.get(id) || [];
    if (Ls.length) {
      const L = Ls[0];
      const hermanos0 = (tksByInv.get(L.factura) || []).map((i) => byId.get(i)).filter(Boolean) as Row[];
      const ts0 = hermanos0.length ? hermanos0 : [t];
      const FF0 = facturasDeLink(L, p.facturas);
      const facV0 = FF0[0];
      const lineasFac0 = lineasDeFacturas(FF0);
      const sinBeta0 = (x: Row) => !(Array.isArray(x.lineasDetalle) && (x.lineasDetalle as Row[]).length);
      // TK80: ticket migrado sin líneas beta, lo cobrado = total de la factura (±$1): la vista usa las líneas de la factura (TK72).
      const desdeFactura0 = !!(facV0 && ts0.length <= 1 && sinBeta0(t) && n(L.total_factura) > 0 && Math.abs(n(L.total_factura) - n(t.estimado)) <= 1);
      if (!desdeFactura0) {
        const ts = ts0;
        // TK143: si la SUMA de los tickets (estimado / total ya vinculado) cuadra con la factura, no hay flag de monto.
        const totalEst = round2(ts.reduce((a, x) => a + n(x.estimado), 0));
        const linkCuadra = (L.estado === "cuadra" || L.estado === "redondeo") && Math.abs(n(L.diferencia_monto)) <= 0.05;
        const estimadoCuadra = Math.abs(totalEst - L.total_factura) <= 0.05;
        // TK133: si el estimado no cuadra, el letrero compara el total de las líneas (catálogo o beta).
        const totalTk = estimadoCuadra ? totalEst : round2(ts.reduce((a, x) => a + totalTicketCuadre(x, p.catalogo), 0));
        const diffLineas = round2(totalTk - L.total_factura);
        if (!linkCuadra && !estimadoCuadra && Math.abs(diffLineas) > 0.05) {
          const signo = diffLineas > 0 ? "+" : "";
          const extra = ts.length > 1 ? " una factura cubre " + ts.length + " tickets." : "";
          out.push({
            ticket_id: id, ticket_clave: clave, kind: "monto",
            motivo: "Diferencia de monto",
            detalle: "Ticket $" + totalTk.toFixed(2) + " vs factura " + L.factura + " $" + L.total_factura.toFixed(2) + " (" + signo + diffLineas.toFixed(2) + "). diferencia de monto $" + diffLineas.toFixed(2) + "." + extra + difSkuDeLink(L, p.facturas, ts, t, p.catalogo, p.aliases),
            factura: L.factura,
          });
        }
      }
      // TK84 (Emilia 18/11): una factura a otro nombre (p. ej. la mamá de la clienta) NO es un error ni bloquea el cuadre:
      // nunca se crea flag «Clienta no cuadra». El detalle muestra solo una nota gris «Facturado a otro nombre».
      const facV = facV0;
      if (lineasFac0.length) {
        const hermanos = ts0;
        // TK80: un ticket migrado sin líneas beta, solo en su factura y con lo cobrado = total de la factura (±$1)
        // ya se muestra con las líneas de esa factura (TK72): no hay nada que revisar entre ticket y factura.
        const sinBeta = sinBeta0;
        const desdeFactura = desdeFactura0;
        const avisos = desdeFactura ? [] : compararFacturaYTickets(lineasFac0, hermanos.length ? hermanos : [t], p.catalogo, p.catalogo);
        const rojos = avisos.filter((a) => a.tipo !== "sugerencia" && a.tipo !== "cambio_sku");
        for (const a of avisos) if (a.tipo === "cambio_sku" && a.ticketId === id) cambios.push({ ticket_id: id, ticket_clave: clave, factura: L.factura, desde: s(a.desde), hacia: s(a.hacia), texto: a.texto });
        if (rojos.length) {
          out.push({
            ticket_id: id, ticket_clave: clave, kind: "lineas",
            motivo: "Revisa productos vs factura",
            detalle: rojos.map((a) => a.texto).join(" "),
            factura: L.factura,
          });
        }
      }
      continue;
    }
    const seq = facSeq(t.facturaBeta || t.fac_7);
    if (seq && maxSeq && seq > maxSeq) continue; // el reporte importado aún no llega a este número
    if (p.hoyGye <= s(t.fecha)) continue; // el día del ticket no ha cerrado
    if (p.importadoGye <= s(t.fecha)) continue; // falta un import posterior al cierre del día
    if (esperandoFacturaLunes(s(t.fecha), p.hoyGye)) continue; // facturación no está el lunes: esperar al cierre del martes
    out.push({
      ticket_id: id, ticket_clave: clave, kind: "sinfac",
      motivo: "Sin factura en Migo",
      detalle: "Ticket cobrado del " + s(t.fecha) + " sin factura en Migo (clienta, fecha y monto)." + (seq ? " El # " + seq + " del ticket no aparece en el último import." : ""),
      factura: null,
    });
  }
  return out;
}

export function idFlag(ticketId: number, kind: FlagDeseada["kind"]): string {
  return "migo:" + ticketId + ":" + kind;
}


export function facturaNorm(v: unknown): string {
  const seq = facSeq(v);
  return seq ? "001-001-" + String(seq).padStart(9, "0") : "";
}

export function splitCliente(cliente: unknown): { nombre: string; apellido: string } {
  const parts = s(cliente).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { nombre: "", apellido: "" };
  if (parts.length === 1) return { nombre: parts[0], apellido: "" };
  return { nombre: parts[0], apellido: parts.slice(1).join(" ") };
}

export function formaAComp(forma: unknown): string {
  const f = s(forma).toLowerCase();
  if (/tarj|credito|crédito|debito|débito|visa|master/.test(f)) return "Tarje:";
  if (/trans|depo|transf|pichincha|produbanco|guayaquil/.test(f)) return "Trans:";
  if (/efec|cash/.test(f)) return "Efect:";
  const t0 = s(forma).trim();
  return t0 || "";
}

export function parseFacturaVivo(x: Row): FacturaVivo | null {
  const factura = facturaNorm(x.factura || x.num || x.numero);
  const seq = facSeq(factura);
  const fecha = s(x.fecha).slice(0, 10);
  if (!seq || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const lineas = Array.isArray(x.lineas) ? (x.lineas as Row[]).map((l) => ({
    codigo: s(l.codigo).slice(0, 40), sku: s(l.sku || l.codigo).slice(0, 40),
    producto: s(l.producto || l.nombre).slice(0, 200), tipo: s(l.tipo).slice(0, 40),
    cantidad: n(l.cantidad) || 1, precio_unit: n(l.precio_unit ?? l.precio),
    descuento: n(l.descuento), subtotal: n(l.subtotal), iva: n(l.iva), total: n(l.total),
  })) : [];
  return {
    factura, seq, fecha, hora: s(x.hora).slice(0, 8) || undefined,
    cliente: s(x.cliente).slice(0, 200),
    total: n(x.total ?? x.total_pagar), subtotal: n(x.subtotal), descuento: n(x.descuento),
    forma: s(x.forma || x.forma_pago || (typeof x.formas === "string" ? x.formas : "")).slice(0, 80),
    // TK91: pago mixto de Migo (Cobros Realizados): cada forma con su monto.
    formas_pago: (Array.isArray(x.formas_pago) ? x.formas_pago as Row[] : []).map((f) => ({ forma: s(f.forma || f.metodo).slice(0, 80), valor: Math.round(n(f.valor ?? f.monto) * 100) / 100 })).filter((f) => f.valor > 0),
    lineas,
  };
}

export function facturasSinTicket(facturas: FacturaVivo[], links: LinkCuadre[]): FacturaVivo[] {
  const used = new Set(links.map((L) => L.factura));
  return facturas.filter((f) => !used.has(f.factura) && s(f.fecha) >= FALTA_CUADRE_DESDE);
}

/** Un borrador pendiente encaja con un ticket que se está creando (mismo día ±1, nombre y monto, o mismo nº de factura). */

export function addDaysYmd(ymd: string, d: number): string {
  const t0 = new Date(s(ymd).slice(0, 10) + "T12:00:00Z");
  t0.setUTCDate(t0.getUTCDate() + d);
  return t0.toISOString().slice(0, 10);
}

/** Mismo día de la factura; si el día anterior es lunes, también esos tickets (facturación no está el lunes). */
export function fechasCandidatasBorrador(fechaFac: string): string[] {
  const f = s(fechaFac).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return [];
  const prev = addDaysYmd(f, -1);
  return dowYmd(prev) === 1 ? [prev, f] : [f];
}

export type CandidatoBorrador = {
  ticket_ids: number[];
  claves: string[];
  nombres: string[];
  totales: number[];
  fechas: string[];
  cosmetologas: string[];
  tipo: "nombre_monto" | "nombre" | "monto" | "suma2" | "suma3";
  names: number;
  familia: number;
  cuadra: boolean;
  diferencia: number;
  motivo: string;
  total: number;
};

/** Fila vacía o clave «r1899» (sin SO): no se sugiere ni aparece en la búsqueda. */
/** Estados de los que ya no se sale: vinculado, aprobado, descartado. */
export function estadoBorrador(v: unknown): string {
  return s(v).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s]+/g, "_");
}

export function borradorEsFinal(v: unknown): boolean {
  const e = estadoBorrador(v);
  return e === "vinculado" || e === "aprobado" || e === "descartado";
}

/** pendiente, asignado, pendiente_aprobar / pendiente por aprobar, y cualquier otro no final. */
export function borradorSePuedeVincular(v: unknown): boolean {
  const e = estadoBorrador(v);
  return !!e && !borradorEsFinal(e);
}

export function clavesDeBorrador(b0: Row): string[] {
  const col = b0.tickets_vinculados;
  if (Array.isArray(col) && col.length) return (col as unknown[]).map((x) => s(x)).filter(Boolean);
  const d = (b0.datos && typeof b0.datos === "object" ? (b0.datos as Row).tickets_vinculados : null);
  if (Array.isArray(d) && d.length) return (d as unknown[]).map((x) => s(x)).filter(Boolean);
  return s(b0.ticket_clave) ? [s(b0.ticket_clave)] : [];
}

export function mensajeNoVincula(estado: unknown, ya?: string[]): string {
  const e = estadoBorrador(estado);
  if (e === "vinculado") {
    return ya && ya.length
      ? "Esta factura ya está vinculada a " + ya.join(" + ") + "."
      : "Esta factura ya está vinculada a un ticket.";
  }
  if (e === "aprobado") return "Esta factura ya fue aprobada; no se puede volver a vincular.";
  if (e === "descartado") return "Esta factura fue descartada; no se puede vincular.";
  return "No se puede vincular esta factura" + (s(estado) ? " (estado: " + s(estado) + ")" : "") + ".";
}

export function ticketClaveValida(t: Row): boolean {
  const clave = s(t.clave || t.so_num);
  if (!clave || /^r\d+$/i.test(clave)) return false;
  if (n(t.id) === NUNCA_TICKET_ID) return false;
  if (!nombreTicket(t) && !(totalTicket(t) > 0.004)) return false;
  return true;
}

function cents(v: number): number {
  return Math.round((Number(v) || 0) * 100);
}
function montoDiff(a: number, b: number): number {
  return (cents(a) - cents(b)) / 100;
}
function montoCerca(a: number, b: number): boolean {
  return Math.abs(cents(a) - cents(b)) <= Math.round(TOL_MONTO * 100);
}

const APE_STOP = new Set(["de", "del", "la", "las", "los", "van", "von", "da", "di", "san", "santa", "y", "e"]);
function apellidoToken(nombre: string): string {
  const toks = s(nombre).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !APE_STOP.has(w));
  return toks.length ? toks[toks.length - 1] : "";
}
function familiaEn(nombres: string[]): number {
  const ape = new Map<string, number>();
  for (const nom of nombres) {
    const a = apellidoToken(nom);
    if (a) ape.set(a, (ape.get(a) || 0) + 1);
  }
  let nFam = 0;
  for (const c of ape.values()) if (c >= 2) nFam += c;
  return nFam;
}

function etiquetaCuadra(sum: number, invTotal: number): string {
  const d = montoDiff(sum, invTotal);
  if (cents(d) === 0) return "✅ Cuadra. Monto exacto ($" + Number(invTotal).toFixed(2) + ", total con IVA).";
  const signo = d > 0 ? "+" : "";
  return "✅ Cuadra. Suma $" + Number(sum).toFixed(2) + " vs factura $" + Number(invTotal).toFixed(2) + " (diferencia " + signo + "$" + Math.abs(d).toFixed(2) + ", dentro de ±$0.05, total con IVA).";
}
function etiquetaNoCuadra(sum: number, invTotal: number): string {
  const d = montoDiff(sum, invTotal);
  const signo = d > 0 ? "+" : "";
  return "⚠️ No cuadra (diferencia " + signo + "$" + Math.abs(d).toFixed(2) + "). Ticket(s) $" + Number(sum).toFixed(2) + " vs factura $" + Number(invTotal).toFixed(2) + " (total con IVA).";
}

/**
 * Candidatos para vincular un borrador de Migo a tickets ya existentes.
 * Combos de 2 o 3 que cuadran (±$0.05) van primero, marcados ✅ Cuadra.
 * Misma familia (apellido) suma puntos. No vincula solo: la admin elige.
 */
export function candidatosParaFactura(inv: { fecha: string; cliente: string; total: number; lineas?: Row[] }, tickets: Row[], opts?: OptsCuadre): CandidatoBorrador[] {
  const dias = new Set(fechasCandidatasBorrador(inv.fecha));
  const pool = tickets.filter((t) => {
    if (!ticketClaveValida(t)) return false;
    if (exentoCuadre(t, opts?.catalogo)) return false;
    if (!dias.has(s(t.fecha).slice(0, 10))) return false;
    const fac = s(t.facturaBeta || t.fac_7);
    if (fac && !/sin/i.test(fac)) return false;
    // TK90 (Emilia 18/11): nunca tickets de $0 (retiros internos, gift cards de cortesía) ni cancelados.
    if (!(totalTicket(t) > 0.004)) return false;
    if (ticketCancelado(t)) return false;
    return true;
  });
  const pub = (t: Row) => ({
    id: n(t.id),
    clave: s(t.clave || t.so_num),
    nombre: nombreTicket(t),
    total: totalTicket(t),
    fecha: s(t.fecha).slice(0, 10),
    cosm: s(t.atendido_por || t.cosmetologa),
  });
  const avisoNombre = (nombres: string[], scores: number[]): string => {
    const max = Math.max(0, ...scores);
    const parts: string[] = [];
    if (max >= 2) parts.push("El nombre cuadra con «" + s(inv.cliente) + "».");
    else if (max >= 1) parts.push("Hay una coincidencia de nombre, pero no es el mismo de Migo («" + s(inv.cliente) + "»).");
    else parts.push("El nombre no coincide con «" + s(inv.cliente) + "».");
    const shared = [...new Set(nombres.map(apellidoToken).filter(Boolean))].filter((a) => nombres.filter((nm) => apellidoToken(nm) === a).length >= 2);
    if (shared.length) parts.push("Hay tickets de la misma familia (" + shared.map((a) => a[0].toUpperCase() + a.slice(1)).join(", ") + ").");
    return parts.join(" ");
  };
  const item = (xs: ReturnType<typeof pub>[], tipo: CandidatoBorrador["tipo"]): CandidatoBorrador => {
    const sum = xs.reduce((a, x) => a + x.total, 0);
    const scores = xs.map((x) => namesMatch(x.nombre, inv.cliente));
    const cuadra = montoCerca(sum, inv.total);
    const motivo = (cuadra ? etiquetaCuadra(sum, inv.total) : etiquetaNoCuadra(sum, inv.total)) + " " + avisoNombre(xs.map((x) => x.nombre), scores);
    return {
      ticket_ids: xs.map((x) => x.id), claves: xs.map((x) => x.clave), nombres: xs.map((x) => x.nombre),
      totales: xs.map((x) => x.total), fechas: xs.map((x) => x.fecha), cosmetologas: xs.map((x) => x.cosm),
      tipo, names: Math.max(0, ...scores), familia: familiaEn(xs.map((x) => x.nombre)),
      cuadra, diferencia: montoDiff(sum, inv.total), motivo, total: sum,
    };
  };

  const pfInv = inv.lineas && inv.lineas.length
    ? perfilSku((inv.lineas || []).map(normalizarLineaFactura).filter((x): x is LineaNorm => !!x), opts?.aliases)
    : null;
  const skuDe = (t: Row) => pfInv && pfInv.size ? cruzarPerfilesSku(perfilSku(lineasDeTicket(t, opts?.catalogo), opts?.aliases), pfInv) : null;
  const singles: CandidatoBorrador[] = [];
  for (const t of pool) {
    const x = pub(t);
    const tokens = namesMatch(x.nombre, inv.cliente);
    const exact = montoCerca(x.total, inv.total);
    const sku = skuDe(t);
    const itemsOk = !!(sku && (sku.mismoPrecio || sku.mismaCantidad));
    // TK135: el nombre distinto no descarta si los SKU del mismo día cuadran (también si el valor difiere por un descuento).
    if (tokens < 1 && !exact && !itemsOk) continue;
    const tipo: CandidatoBorrador["tipo"] = exact && tokens >= 1 ? "nombre_monto" : exact ? "monto" : "nombre";
    singles.push(item([x], tipo));
  }

  // TK90: un ticket que cuadra solo va solo: nunca se mezcla en combinaciones de 2 o 3.
  const solos = new Set(singles.filter((c) => c.cuadra).map((c) => c.ticket_ids[0]));
  const combos: CandidatoBorrador[] = [];
  const P = pool.map(pub).filter((x) => !solos.has(x.id));
  for (let i = 0; i < P.length; i++) {
    for (let j = i + 1; j < P.length; j++) {
      const two = [P[i], P[j]];
      if (montoCerca(two[0].total + two[1].total, inv.total)) combos.push(item(two, "suma2"));
      for (let k = j + 1; k < P.length; k++) {
        const three = [P[i], P[j], P[k]];
        const sum = three[0].total + three[1].total + three[2].total;
        if (montoCerca(sum, inv.total)) combos.push(item(three, "suma3"));
      }
    }
  }

  const rank = (a: CandidatoBorrador, b: CandidatoBorrador) => {
    if (a.cuadra !== b.cuadra) return a.cuadra ? -1 : 1;
    const as = a.names + a.familia, bs = b.names + b.familia;
    if (as !== bs) return bs - as;
    if (a.names !== b.names) return b.names - a.names;
    if (a.familia !== b.familia) return b.familia - a.familia;
    if (Math.abs(a.diferencia) !== Math.abs(b.diferencia)) return Math.abs(a.diferencia) - Math.abs(b.diferencia);
    if (a.claves.length !== b.claves.length) return b.claves.length - a.claves.length;
    return (a.claves.join()).localeCompare(b.claves.join());
  };
  // TK90: sin repetidos (mismo conjunto de tickets en otro orden).
  const vistos = new Set<string>();
  const unicos = [...combos, ...singles].filter((c) => { const k = c.ticket_ids.slice().sort((x, y) => x - y).join(","); if (vistos.has(k)) return false; vistos.add(k); return true; });
  return unicos.sort(rank);
}


export function ofertaBorrador(borradores: Row[], p: { nombre?: unknown; apellido?: unknown; estimado?: unknown; fecha?: unknown; factura?: unknown }): Row | null {
  const vivos = borradores.filter((b) => ["pendiente", "asignado"].includes(s(b.estado)));
  const fac = facturaNorm(p.factura);
  if (fac) {
    const hit = vivos.find((b) => s(b.factura) === fac);
    if (hit) return hit;
  }
  const nom = (s(p.nombre) + " " + s(p.apellido)).trim();
  const fecha = s(p.fecha).slice(0, 10);
  const monto = n(p.estimado);
  let best: { sc: number; b: Row } | null = null;
  for (const b of vivos) {
    const tokens = namesMatch(nom, b.cliente);
    const ad = Math.abs(n(b.total) - monto);
    const days = fecha && s(b.fecha) ? Math.abs(Math.round((Date.parse(fecha + "T12:00:00Z") - Date.parse(s(b.fecha) + "T12:00:00Z")) / 86400000)) : 99;
    let sc = 0;
    if (tokens >= 2 && ad <= TOL_MONTO && days <= 1) sc = 3;
    else if (tokens >= 1 && ad <= TOL_MONTO && days <= 2) sc = 2;
    if (sc && (!best || sc > best.sc)) best = { sc, b };
  }
  return best ? best.b : null;
}

export const MIGO_CRON_ACCIONES = new Set(["migo_importar", "migo_cuadre_hora", "migo_adjuntar_pdfs", "migo_clientes_ride"]);

export function sesionCronMigo(p: Row, env: Record<string, string | undefined>): { uid: string; rol: string; name: string; short: string; color: string; token: string } | null {
  const key = s(env.MIGO_CRON_KEY);
  if (key.length < 16) return null;
  const got = s(p.cron_key || p.migo_cron_key);
  if (got.length !== key.length) return null;
  let x = 0;
  for (let i = 0; i < key.length; i++) x |= key.charCodeAt(i) ^ got.charCodeAt(i);
  if (x !== 0) return null;
  return { uid: "migo-cron", rol: "admin", name: "Migo cron", short: "migo", color: "", token: "" };
}

/** TK84: nota neutra (gris) cuando la factura está a nombre de otra persona; nunca es flag. */
export function facturadoAOtroNombre(nombreTk: unknown, clienteMigo: unknown): boolean {
  const c = s(clienteMigo).trim();
  if (!c || esConsumidorFinal(c)) return false;
  return namesMatch(s(nombreTk), c) <= 0;
}
