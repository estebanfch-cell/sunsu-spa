// Cruce de tickets con facturas vivas de Migo (solo lectura). No emite ni anula facturas.
import { b, n, s, type Row } from "./domain.ts";

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
    if (/^cort/.test(m)) return "cortesia";
    return m;
  });
}

export function exentoCuadre(t: Row): boolean {
  const fac = s(t.facturaBeta || t.fac_7);
  if (/sin\s*factura|s\/f/i.test(fac)) return true;
  const mets = metodosTicket(t.comp);
  if (mets.includes("canje") || mets.includes("cortesia") || mets.includes("cortesía")) return true;
  return false;
}

export function estaPagado(t: Row): boolean {
  return b(t.cob);
}

export type LineaFactura = { codigo?: string; sku?: string; producto?: string; tipo?: string; cantidad?: number; precio_unit?: number; subtotal?: number; iva?: number; total?: number };

export type FacturaVivo = {
  factura: string; seq: number; fecha: string; hora?: string; cliente: string;
  total: number; subtotal?: number; descuento?: number; forma?: string;
  lineas?: LineaFactura[];
};
export type LinkCuadre = {
  ticket_id: number; factura: string; tipo: "numero" | "nombre_fecha_monto"; confianza: "alta" | "media";
  diferencia_monto: number; diferencia_fecha: number; estado: "cuadra" | "redondeo" | "diferencia";
  motivo: string; cliente_migo: string; total_factura: number; total_tickets: number;
};
export type FlagDeseada = { ticket_id: number; ticket_clave: string; kind: "monto" | "clienta" | "sinfac"; motivo: string; detalle: string; factura: string | null };

function nombreTicket(t: Row): string {
  return (s(t.nombre) + " " + s(t.apellido)).trim();
}
function totalTicket(t: Row): number {
  return n(t.estimado);
}

/** Cruce: primero por número de factura (fac_7 o factura de la beta); si no, nombre + fecha ±1 día + monto (±$0.05). Una factura puede cubrir varios tickets. */
export function cruzar(facturas: FacturaVivo[], tickets: Row[]): LinkCuadre[] {
  const bySeq = new Map<number, FacturaVivo>();
  for (const f of facturas) if (f.seq) bySeq.set(f.seq, f);
  const usedT = new Set<number>(), usedInv = new Set<number>();
  const groups = new Map<number, Row[]>();
  for (const t of tickets) {
    const seq = facSeq(t.facturaBeta || t.fac_7);
    if (!seq || !bySeq.has(seq)) continue;
    const L = groups.get(seq) || [];
    L.push(t); groups.set(seq, L);
    usedT.add(n(t.id)); usedInv.add(seq);
  }
  const links: LinkCuadre[] = [];
  const pushGroup = (inv: FacturaVivo, ts: Row[], tipo: LinkCuadre["tipo"], confianza: LinkCuadre["confianza"]) => {
    const tsum = ts.reduce((a, t) => a + totalTicket(t), 0);
    const diff = Math.round((tsum - inv.total) * 100) / 100;
    const estado: LinkCuadre["estado"] = Math.abs(diff) <= 0 ? "cuadra" : Math.abs(diff) <= TOL_MONTO ? "redondeo" : "diferencia";
    const motivos: string[] = [];
    if (ts.length > 1) motivos.push("una factura cubre " + ts.length + " tickets");
    if (estado === "diferencia") motivos.push("diferencia de monto $" + diff.toFixed(2));
    else if (estado === "redondeo") motivos.push("redondeo");
    for (const t of ts) {
      const fd = t.fecha && inv.fecha ? Math.round((Date.parse(s(t.fecha) + "T12:00:00Z") - Date.parse(inv.fecha + "T12:00:00Z")) / 86400000) : 0;
      links.push({
        ticket_id: n(t.id), factura: inv.factura, tipo, confianza,
        diferencia_monto: diff, diferencia_fecha: fd, estado,
        motivo: motivos.join("; "), cliente_migo: inv.cliente, total_factura: inv.total, total_tickets: tsum,
      });
    }
  };
  for (const [seq, ts] of groups) {
    const inv = bySeq.get(seq)!;
    pushGroup(inv, ts, "numero", "alta");
  }
  const unmatchedInv = facturas.filter((f) => !usedInv.has(f.seq));
  const unmatchedTk = tickets.filter((t) => !usedT.has(n(t.id)) && !exentoCuadre(t) && estaPagado(t));
  type Cand = { sc: number; tokens: number; days: number; ad: number; t: Row; inv: FacturaVivo };
  const cands: Cand[] = [];
  for (const t of unmatchedTk) {
    for (const inv of unmatchedInv) {
      const tokens = namesMatch(nombreTicket(t), inv.cliente);
      const ad = Math.abs((totalTicket(t) || 999) - inv.total);
      const days = t.fecha && inv.fecha ? Math.abs(Math.round((Date.parse(s(t.fecha) + "T12:00:00Z") - Date.parse(inv.fecha + "T12:00:00Z")) / 86400000)) : 99;
      let sc = 0;
      if (tokens >= 2 && ad <= TOL_MONTO && days <= 1) sc = 3;
      else if (tokens >= 1 && ad <= TOL_MONTO && days <= 2) sc = 2;
      if (sc) cands.push({ sc, tokens, days, ad, t, inv });
    }
  }
  cands.sort((a, b) => b.sc - a.sc || b.tokens - a.tokens || a.days - b.days || a.ad - b.ad);
  const seenT = new Set<number>(), seenI = new Set<number>();
  for (const c of cands) {
    const tid = n(c.t.id);
    if (seenT.has(tid) || seenI.has(c.inv.seq)) continue;
    seenT.add(tid); seenI.add(c.inv.seq);
    pushGroup(c.inv, [c.t], "nombre_fecha_monto", "media");
  }
  return links;
}

export function flagsDeseadas(p: {
  tickets: Row[];
  links: LinkCuadre[];
  facturas: FacturaVivo[];
  hoyGye: string;
  importadoGye: string;
}): FlagDeseada[] {
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
    if (exentoCuadre(t) || !estaPagado(t)) continue;
    const clave = s(t.clave || t.so_num);
    const Ls = linksByTk.get(id) || [];
    if (Ls.length) {
      const L = Ls[0];
      if (L.estado === "diferencia") {
        const signo = L.diferencia_monto > 0 ? "+" : "";
        out.push({
          ticket_id: id, ticket_clave: clave, kind: "monto",
          motivo: "Diferencia de monto",
          detalle: "Ticket $" + L.total_tickets.toFixed(2) + " vs factura " + L.factura + " $" + L.total_factura.toFixed(2) + " (" + signo + L.diferencia_monto.toFixed(2) + ")." + (L.motivo ? " " + L.motivo + "." : ""),
          factura: L.factura,
        });
      }
      if (!esConsumidorFinal(L.cliente_migo)) {
        const nom = nombreTicket(t);
        const hermanos = (tksByInv.get(L.factura) || []).map((i) => byId.get(i)).filter(Boolean) as Row[];
        const ok = hermanos.some((h) => namesMatch(nombreTicket(h), L.cliente_migo) > 0) || namesMatch(nom, L.cliente_migo) > 0;
        if (!ok) {
          out.push({
            ticket_id: id, ticket_clave: clave, kind: "clienta",
            motivo: "Clienta no cuadra",
            detalle: "La factura " + L.factura + " está a nombre de «" + L.cliente_migo + "», no de «" + nom + "».",
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
    subtotal: n(l.subtotal), iva: n(l.iva), total: n(l.total),
  })) : [];
  return {
    factura, seq, fecha, hora: s(x.hora).slice(0, 8) || undefined,
    cliente: s(x.cliente).slice(0, 200),
    total: n(x.total ?? x.total_pagar), subtotal: n(x.subtotal), descuento: n(x.descuento),
    forma: s(x.forma || x.forma_pago || x.formas).slice(0, 80),
    lineas,
  };
}

export function facturasSinTicket(facturas: FacturaVivo[], links: LinkCuadre[]): FacturaVivo[] {
  const used = new Set(links.map((L) => L.factura));
  return facturas.filter((f) => !used.has(f.factura) && s(f.fecha) >= FALTA_CUADRE_DESDE);
}

/** Un borrador pendiente encaja con un ticket que se está creando (mismo día ±1, nombre y monto, o mismo nº de factura). */
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

export const MIGO_CRON_ACCIONES = new Set(["migo_importar", "migo_cuadre_hora"]);

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
