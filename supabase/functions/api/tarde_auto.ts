// TK212 (Emilia 22/11): «Subido tarde» automático.
// Si la factura Migo vinculada, o el voucher leído (OCR), es de un día calendario (Ecuador) ANTERIOR al día en que
// se creó el ticket, el ticket se marca subido tarde: la fecha de atención pasa a ese día, aplica el 50% de comisión
// (factorComisionTicket) y sale la etiqueta «Subido tarde».
// - Solo tickets creados desde el deploy de TK210 (21/11 21:31 Ecuador). Nunca retroactivo.
// - Si la persona ya puso la fecha de atención (prompt o corrección manual), no se toca.
// - Se re-evalúa al vincular factura (cada corrida del cuadre) y al subir/leer un voucher.
import { n, s, ymdUtc, type Row } from "./domain.ts";
import { logAccion, type Ctx } from "./lib.ts";
import { consultar } from "./query.ts";
import { claveDe } from "./ticket_beta.ts";
import { leerSerie } from "./series.ts";
import { addDias, diaGyeDeInstante, FACTOR_SUBIDO_TARDE, timestampAtencion } from "./fecha_atencion.ts";

/** Deploy de TK210: 21/11/2026 21:31 Ecuador. Antes de esto, nada se marca solo. */
export const TARDE_AUTO_DESDE = "2026-11-22T02:31:00Z";
/** Más días que esto entre la evidencia y la subida = probable error (factura mal tipeada, voucher viejo): no se adivina. */
export const TARDE_AUTO_MAX_DIAS = 7;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export interface EvidenciaTarde { fecha: string; fuente: "factura" | "voucher"; ref: string }

function origDe(r: Row): Row { return (r.orig && typeof r.orig === "object" ? r.orig : {}) as Row; }

/** ¿El ticket puede marcarse solo? (fecha de creación, sin fecha puesta por una persona, no cancelado). */
export function candidatoTardeAuto(r: Row): boolean {
  const ms = Date.parse(s(r.created_at).replace(" ", "T"));
  if (!Number.isFinite(ms) || ms < Date.parse(TARDE_AUTO_DESDE)) return false;
  const o = origDe(r);
  if (o.subido_tarde === true || o.anulado === true) return false;
  if (s(o.fecha_atencion) || (Array.isArray(o.fecha_atencion_hist) && o.fecha_atencion_hist.length)) return false;
  if (o.tarde_auto_quitado === true) return false;
  return true;
}

/**
 * La fecha que manda: la factura vinculada (la más reciente si hay varias); si no hay factura, el voucher
 * leído más reciente (un abono de días antes no debe correr la atención hacia atrás).
 */
export function evidenciaTarde(facturas: { fecha: string; factura: string }[], vouchers: { fecha: string; ref: string }[]): EvidenciaTarde | null {
  const fs = facturas.filter((f) => YMD.test(s(f.fecha))).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  if (fs.length) return { fecha: fs[0].fecha, fuente: "factura", ref: fs[0].factura };
  const vs = vouchers.filter((v) => YMD.test(s(v.fecha))).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  if (vs.length) return { fecha: vs[0].fecha, fuente: "voucher", ref: vs[0].ref };
  return null;
}

/** Decide sin escribir: devuelve la fecha de atención y los días tarde, o null. */
export function decidirTardeAuto(r: Row, ev: EvidenciaTarde | null): { fecha: string; dias: number; ev: EvidenciaTarde } | null {
  if (!ev || !candidatoTardeAuto(r)) return null;
  const creado = diaGyeDeInstante(r.created_at);
  if (!creado || !(ev.fecha < creado)) return null;
  if (ev.fecha < addDias(creado, -TARDE_AUTO_MAX_DIAS)) return null;
  if (ymdUtc(r.timestamp) && ymdUtc(r.timestamp) <= ev.fecha) return null; // ya está en ese día (o antes)
  const dias = Math.round((Date.parse(creado + "T12:00:00Z") - Date.parse(ev.fecha + "T12:00:00Z")) / 86400000);
  return { fecha: ev.fecha, dias, ev };
}

function vouchersDe(cab: Row | undefined): { fecha: string; ref: string }[] {
  const d = (cab?.datos && typeof cab.datos === "object" ? cab.datos : {}) as Row;
  const L = Array.isArray(d.comprobantes) ? d.comprobantes as Row[] : [];
  return L.filter((x) => x && x.borrado !== true && x.ocr && s((x.ocr as Row).estado) === "ok")
    .map((x) => ({ fecha: s((x.ocr as Row).fecha).slice(0, 10), ref: s((x.ocr as Row).referencia) || s(x.url) }));
}

/** Solo los últimos 14 días (y nunca antes del deploy de TK210). */
function desdeReciente(now: Date): string {
  const d = new Date(now.getTime() - 14 * 86400000).toISOString();
  return d > TARDE_AUTO_DESDE ? d : TARDE_AUTO_DESDE;
}

async function filas(ctx: Ctx, t: string, q: Parameters<typeof consultar>[2]): Promise<Row[]> {
  try { return (await consultar(ctx.db, t, q)).rows; } catch { return []; }
}

/**
 * Re-evalúa tickets recientes (o solo `ids`). Escribe tickets.timestamp + orig y la fila de paquete vendida en ese ticket.
 * Nunca tumba a quien lo llama.
 */
export async function evaluarTardeAuto(ctx: Ctx, actor: string, opts: { ids?: number[] } = {}): Promise<Row[]> {
  const out: Row[] = [];
  try {
    const filtros: Row[] = opts.ids && opts.ids.length
      ? [{ col: "id", op: "in", val: opts.ids }]
      : [{ col: "created_at", op: "gte", val: desdeReciente(ctx.now) }];
    let tks = await filas(ctx, "tickets", { filtros: filtros as never });
    tks = tks.filter((r) => !r.borrado_at && candidatoTardeAuto(r));
    if (!tks.length) return out;
    const ids = new Set(tks.map((r) => n(r.id)));
    const links = (await filas(ctx, "beta_cuadre_link", { filtros: [{ col: "ticket_id", op: "in", val: [...ids] }] as never }))
      .filter((L) => ids.has(n(L.ticket_id)) && (s(L.tipo) === "numero" || s(L.confianza) === "alta"));
    const facNums = [...new Set(links.flatMap((L) => [s(L.factura), ...(Array.isArray(L.facturas) ? (L.facturas as unknown[]).map(s) : [])]).filter(Boolean))];
    const vivos = facNums.length ? await filas(ctx, "beta_migo_facturas_vivo", { cols: ["factura", "fecha"], filtros: [{ col: "factura", op: "in", val: facNums }] as never }) : [];
    const fechaFac = new Map(vivos.map((v) => [s(v.factura), s(v.fecha).slice(0, 10)]));
    const claves = tks.map((r) => claveDe(r, leerSerie(r, "so_num"))).filter(Boolean);
    const cabs = claves.length ? await filas(ctx, "beta_tickets", { cols: ["clave", "datos"], filtros: [{ col: "clave", op: "in", val: claves }] as never }) : [];
    const cabBy = new Map(cabs.map((c) => [s(c.clave), c]));
    for (const r of tks) {
      const clave = claveDe(r, leerSerie(r, "so_num"));
      const facs = links.filter((L) => n(L.ticket_id) === n(r.id))
        .flatMap((L) => [s(L.factura), ...(Array.isArray(L.facturas) ? (L.facturas as unknown[]).map(s) : [])])
        .filter(Boolean).map((f) => ({ factura: f, fecha: fechaFac.get(f) || "" }));
      const dec = decidirTardeAuto(r, evidenciaTarde(facs, vouchersDe(cabBy.get(clave))));
      if (!dec) continue;
      const o = origDe(r);
      const orig: Row = {
        ...o, fecha_atencion: dec.fecha, subido_tarde: true, comision_factor: FACTOR_SUBIDO_TARDE, dias_tarde: dec.dias,
        subido_at: s(o.subido_at) || s(r.created_at), tarde_auto: { fuente: dec.ev.fuente, ref: dec.ev.ref, de: ymdUtc(r.timestamp), at: ctx.now.toISOString() },
      };
      await ctx.db.write(actor, "tickets", "update", { id: r.id }, { timestamp: timestampAtencion(dec.fecha), orig });
      // El paquete vendido en este ticket toma el día real de la atención (como al crear un ticket tarde).
      const so = s(r.so_num) || leerSerie(r, "so_num");
      if (so) {
        for (const pq of await filas(ctx, "paquetes", { filtros: [{ col: "orig->>so_num", op: "eq", val: so }] as never })) {
          const po = (pq.orig && typeof pq.orig === "object" ? pq.orig : {}) as Row;
          try {
            await ctx.db.write(actor, "paquetes", "update", { id: pq.id }, {
              dia: Number(dec.fecha.slice(8, 10)), mes: Number(dec.fecha.slice(5, 7)), ano: Number(dec.fecha.slice(0, 4)),
              orig: { ...po, ts: timestampAtencion(dec.fecha) },
            });
          } catch { /* sin paquete */ }
        }
      }
      try { await logAccion(ctx.db, actor, "SUBIDO TARDE AUTO", `${so || clave} · atención ${dec.fecha} (${dec.ev.fuente} ${dec.ev.ref}) · 50% comisión`); } catch { /* log opcional */ }
      out.push({ ticket_id: r.id, clave, fecha_atencion: dec.fecha, dias: dec.dias, fuente: dec.ev.fuente, ref: dec.ev.ref });
    }
  } catch { /* nunca tumba el cuadre ni la subida */ }
  return out;
}
