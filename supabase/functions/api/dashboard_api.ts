// Dashboard estilo MineCore: periodo Hoy/Semana/Mes/Año/Rango contra el periodo anterior.
// Acción nueva `getDashboard`. `getDashboardHoy` sigue igual para lo que ya lo usa.
import { extend } from "./handlers.ts";
import type { Ctx } from "./lib.ts";
import { kvGet } from "./lib.ts";
import {
  ADMIN, IVA, addDays, cantAmpollas, ecuadorParts, esCanje, esInterno, facialSku, n, normCedula,
  PROD_COLS, productQtys, repartirPagos, round2, s, skuCode, ymdUtc, type Row, esCancelado, normNombre } from "./domain.ts";
import { montoGcAplicado } from "./ventas.ts";
import { runErp } from "./erp.ts";
import type { Db } from "./db.ts";
import { consultar } from "./query.ts";

type Periodo = "hoy" | "semana" | "mes" | "ano" | "rango";
const MES_CORTO = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MES_LARGO = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const META_MARGEN_DEF = 50;
/** Hasta abril 2026 la venta real está en Migo (facturas importadas); desde mayo 2026, en los tickets del sistema. */
export const CORTE_MIGO = "2026-05-01";

/** Misma cosmetóloga: «Andrea» y «Andrea Robles» cuentan como una. */
export function mismaCosmetologa(a: unknown, b: unknown): boolean {
  const x = normNombre(a), y = normNombre(b);
  if (!y) return true;
  if (!x) return false;
  if (x === y) return true;
  return x.split(" ")[0] === y.split(" ")[0];
}


const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
function diasEntre(a: string, b: string): number {
  const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((tb - ta) / 86400000);
}
function finDeMes(y: number, m: number): number { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function etiquetaDia(k: string, conAno = false): string {
  const t = `${+k.slice(8, 10)} ${MES_CORTO[+k.slice(5, 7)]}`;
  return conAno ? `${t} ${k.slice(0, 4)}` : t;
}
function etiquetaRango(a: string, b: string): string {
  if (a === b) return etiquetaDia(a, true);
  if (a.slice(0, 7) === b.slice(0, 7)) return `${+a.slice(8, 10)}–${+b.slice(8, 10)} ${MES_CORTO[+a.slice(5, 7)]} ${a.slice(0, 4)}`;
  if (a.slice(0, 4) === b.slice(0, 4)) return `${etiquetaDia(a)} – ${etiquetaDia(b)} ${a.slice(0, 4)}`;
  return `${etiquetaDia(a, true)} – ${etiquetaDia(b, true)}`;
}

/** Rango actual y anterior según el periodo. `hoy` es la fecha de Ecuador (YYYY-MM-DD). */
export function rangos(periodo: Periodo, hoy: string, desde = "", hasta = ""): { periodo: Periodo; desde: string; hasta: string; pDesde: string; pHasta: string } {
  const y = +hoy.slice(0, 4), m = +hoy.slice(5, 7), d = +hoy.slice(8, 10);
  if (periodo === "rango" && ymdRe.test(desde) && ymdRe.test(hasta)) {
    let a = desde, b = hasta;
    if (a > b) [a, b] = [b, a];
    const len = diasEntre(a, b) + 1;
    return { periodo, desde: a, hasta: b, pDesde: addDays(a, -len), pHasta: addDays(a, -1) };
  }
  if (periodo === "semana") {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const lunes = addDays(hoy, -((dow + 6) % 7));
    return { periodo, desde: lunes, hasta: hoy, pDesde: addDays(lunes, -7), pHasta: addDays(hoy, -7) };
  }
  if (periodo === "mes") {
    const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
    return { periodo, desde: ymd(y, m, 1), hasta: hoy, pDesde: ymd(py, pm, 1), pHasta: ymd(py, pm, Math.min(d, finDeMes(py, pm))) };
  }
  if (periodo === "ano") {
    return { periodo, desde: ymd(y, 1, 1), hasta: hoy, pDesde: ymd(y - 1, 1, 1), pHasta: ymd(y - 1, m, Math.min(d, finDeMes(y - 1, m))) };
  }
  return { periodo: "hoy", desde: hoy, hasta: hoy, pDesde: addDays(hoy, -1), pHasta: addDays(hoy, -1) };
}

interface ProdLinea { sku: string; nombre: string; qty: number; val: number; costo: number }
interface Hecho {
  k: string; venta: number; cosm: string; clientaKey: string; clienta: string;
  facial: { code: string; nombre: string; canje: boolean; val: number } | null;
  paquetes: { code: string; nombre: string; val: number }[];
  productos: ProdLinea[];
  extrasN: number; extrasVal: number; extrasCosto: number; extrasCort: number;
  gcN: number; gcVal: number;
  pagos: Record<string, number>;
  /** Faciales adicionales del mismo comprobante (Migo puede traer varios por factura). */
  masFaciales?: { code: string; nombre: string; canje: boolean; val: number }[];
  fuente?: "sistema" | "migo"; ref?: string;
}

function texto(v: unknown): string {
  const t = s(v);
  return !t || t.toLowerCase() === "false" ? "" : t;
}
function codInicio(txt: string): string {
  const m = txt.toUpperCase().match(/^SUNSU-([A-Z]{2,3}-\d+|\d+)/);
  return m ? m[1] : "";
}
function codEnTexto(txt: string): string {
  const m = txt.toUpperCase().match(/SUNSU-([A-Z]{2,3}-\d+|\d+)/);
  return m ? m[1] : "";
}
function primerNombre(v: string): string {
  const t = v.trim();
  if (!t) return "";
  const p = t.split(/\s+/)[0];
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

interface Precios { sub: Map<string, number>; costo: Map<string, number>; nombre: Map<string, string> }

async function precios(db: Db): Promise<Precios> {
  const sub = new Map<string, number>(), costo = new Map<string, number>(), nombre = new Map<string, string>();
  for (const r of await db.all("catalogo")) {
    const code = skuCode(s(r.sku));
    if (!code) continue;
    const st = n(r.subtotal), tot = n(r.total_con_iva);
    sub.set(code, st > 0 ? st : tot > 0 ? tot / IVA : 0);
    if (n(r.precio_compra) > 0) costo.set(code, n(r.precio_compra));
    if (s(r.producto_servicio)) nombre.set(code, s(r.producto_servicio));
  }
  // Costo: compra del catálogo (lo mismo que usan comisiones); si falta, costo promedio del ERP.
  for (const p of await db.all("erp_productos").catch(() => [] as Row[])) {
    const code = skuCode(s(p.sku));
    if (!code) continue;
    if (!costo.has(code) && n(p.costo_promedio) > 0) costo.set(code, n(p.costo_promedio));
    if (!nombre.has(code) && s(p.nombre)) nombre.set(code, s(p.nombre));
    if (!sub.has(code) && n(p.precio_venta) > 0) sub.set(code, n(p.precio_venta) / (p.iva === false ? 1 : IVA));
  }
  for (const b of await db.all("inventario_base").catch(() => [] as Row[])) {
    const code = skuCode(s(b.sku));
    if (code && n(b.compra) > 0) costo.set(code, n(b.compra));
  }
  return { sub, costo, nombre };
}
async function costoErp(db: Db, pr: Precios): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  for (const p of await db.all("erp_productos").catch(() => [] as Row[])) {
    const code = skuCode(s(p.sku));
    if (code && n(p.costo_promedio) > 0) m.set(code, n(p.costo_promedio));
  }
  for (const [k, v] of pr.costo) if (!m.has(k)) m.set(k, v);
  return m;
}

export function hechoDe(t: Row, pr: Precios): Hecho | null {
  const k = ymdUtc(t.timestamp); // el timestamp guarda la hora de Ecuador (pared) con Z
  if (!k || !ymdRe.test(k)) return null;
  const tot = n(t.estimado);
  const h: Hecho = {
    k, venta: tot, cosm: "", clientaKey: "", clienta: "", facial: null, paquetes: [], productos: [],
    extrasN: 0, extrasVal: 0, extrasCosto: 0, extrasCort: 0, gcN: 0, gcVal: 0, pagos: repartirPagos(s(t.comp), tot),
  };
  const cosm = s(t.atendido_por);
  h.cosm = esInterno(cosm, t.id_3) ? "Interno" : primerNombre(cosm);
  const ced = normCedula(t.id_3);
  const nom = `${s(t.nombre)} ${s(t.apellido)}`.trim();
  if (!esInterno(cosm, t.id_3) && (ced && !/^0+$/.test(s(t.id_3).replace(/\D/g, "")) || nom)) {
    h.clientaKey = ced || nom.toLowerCase();
    h.clienta = nom || ced;
  }
  const extras = texto(t.servicios_adicionales);
  if (extras) {
    for (const pieza of extras.split("|")) {
      const p = pieza.trim();
      if (!p) continue;
      const c = cantAmpollas(p);
      h.extrasN += c;
      if (p.toUpperCase().includes("CORTES")) { h.extrasCort += c; continue; }
      const sku = codEnTexto(p);
      if (sku) { h.extrasVal += (pr.sub.get(sku) || 0) * c; h.extrasCosto += (pr.costo.get(sku) || 0) * c; }
    }
  }
  const fac = s(t.facial_hecho);
  if (fac && fac !== "-" && fac !== "—") {
    const aplicaGc = montoGcAplicado(t.gift_card);
    const gcParcial = aplicaGc > 0 && tot > 0 && !s(t.paquete).toUpperCase().startsWith("SI");
    const canje = esCanje(t.paquete, t.gift_card) && !gcParcial;
    const code = codInicio(fac) || (facialSku(fac) || "").replace(/^SUNSU-/, "");
    const nombre = (code && pr.nombre.get(code)) || fac.replace(/^SUNSU-\S+\s*/i, "") || fac;
    let val = 0, esCj = canje;
    if (!canje) {
      if (gcParcial) {
        const orig = t.orig && typeof t.orig === "object" ? t.orig as Row : {};
        val = round2((n(orig.gc_facial_cobro) || Math.max(0, tot - aplicaGc)) / IVA);
      } else if (tot > 0) val = pr.sub.get(code) || 0;
      else esCj = true;
    }
    h.facial = { code: code || fac, nombre, canje: esCj, val };
  }
  for (const pack of [texto(t.compra_pack_3), texto(t.compra_pack_6)]) {
    if (!pack) continue;
    const code = codInicio(pack);
    h.paquetes.push({ code, nombre: (code && pr.nombre.get(code)) || pack.replace(/^SUNSU-\S+\s*/i, ""), val: pr.sub.get(code) || 0 });
  }
  for (const q of productQtys(t)) {
    const code = skuCode(q.sku);
    h.productos.push({ sku: code, nombre: pr.nombre.get(code) || code, qty: q.qty, val: q.qty * (pr.sub.get(code) || 0), costo: q.qty * (pr.costo.get(code) || 0) });
  }
  // Venta de gift card (col S "SI, 26-077, 26-078"): el valor es lo que queda del ticket sin IVA.
  const vg = texto(t.venta_gift);
  if (vg.toUpperCase().startsWith("SI")) {
    h.gcN = Math.max(1, (vg.match(/\b\d{2}-\d{3}\b/g) || []).length);
    const otros = (h.facial?.val || 0) + h.paquetes.reduce((a, x) => a + x.val, 0) + h.productos.reduce((a, x) => a + x.val, 0) + h.extrasVal;
    h.gcVal = Math.max(0, tot / IVA - otros);
  }
  return h;
}

function pagoMigo(forma: string): string {
  const f = forma.toLowerCase();
  if (f.includes("efect")) return "efectivo";
  if (f.includes("transf") || f.includes("dep")) return "transferencia";
  if (f.includes("tarj")) return "tarjeta";
  return "otros";
}
/** Facturas de Migo (beta_migo_facturas + beta_migo_lineas) → hechos del dashboard, con la misma forma que un ticket. */
export function hechosMigo(facs: Row[], lins: Row[], pr: Precios, hasta = CORTE_MIGO): Hecho[] {
  const porFac = new Map<string, Row[]>();
  for (const l of lins) { const k = s(l.factura); const L = porFac.get(k) || []; L.push(l); porFac.set(k, L); }
  const out: Hecho[] = [];
  for (const f of facs) {
    const k = s(f.fecha).slice(0, 10);
    if (!ymdRe.test(k) || k >= hasta) continue;
    const tot = n(f.total);
    const cli = s(f.cliente).trim();
    const anon = !cli || /consumidor\s*final/i.test(cli);
    const h: Hecho = {
      k, venta: tot, cosm: "Migo", clientaKey: anon ? "" : "m:" + cli.toLowerCase().replace(/\s+/g, " "), clienta: anon ? "" : cli,
      facial: null, paquetes: [], productos: [], extrasN: 0, extrasVal: 0, extrasCosto: 0, extrasCort: 0, gcN: 0, gcVal: 0,
      pagos: { efectivo: 0, transferencia: 0, tarjeta: 0, mixto: 0, otros: 0 }, masFaciales: [], fuente: "migo", ref: s(f.factura),
    };
    const fp = Array.isArray(f.formas_pago) ? f.formas_pago as Row[] : [];
    let pagado = 0;
    for (const x of fp) { const v = n(x.valor); if (v > 0) { h.pagos[pagoMigo(s(x.forma))] += v; pagado += v; } }
    if (!(pagado > 0) && tot > 0) h.pagos.otros += tot;
    for (const l of porFac.get(s(f.factura)) || []) {
      const tipo = s(l.tipo), qty = n(l.cantidad) || 1, val = n(l.subtotal);
      const code = skuCode(s(l.codigo)) || s(l.codigo).replace(/^SUNSU-/i, "");
      const nombre = pr.nombre.get(code) || s(l.producto) || code;
      if (tipo === "facial") {
        for (let i = 0; i < qty; i++) {
          const fc = { code: code || nombre, nombre, canje: !(val > 0), val: val / qty };
          if (!h.facial) h.facial = fc; else h.masFaciales!.push(fc);
        }
      } else if (tipo === "paquete") {
        for (let i = 0; i < qty; i++) h.paquetes.push({ code, nombre, val: val / qty });
      } else if (tipo === "producto") {
        h.productos.push({ sku: code, nombre, qty, val, costo: qty * (pr.costo.get(code) || 0) });
      } else if (tipo === "gift_card") {
        h.gcN += qty; h.gcVal += val;
      } else {
        h.extrasN += qty; h.extrasVal += val;
      }
    }
    out.push(h);
  }
  return out;
}

interface Agg {
  tickets: number; ventaTickets: number; venta: number; costo: number;
  faciales: number; facCanjes: number; valFac: number;
  paquetes: number; valPaq: number;
  productosN: number; valProd: number; costoProd: number;
  extrasN: number; valExtras: number; extrasCort: number; gcN: number; gcVal: number;
  pagos: Record<string, number>;
}
function nuevoAgg(): Agg {
  return {
    tickets: 0, ventaTickets: 0, venta: 0, costo: 0, faciales: 0, facCanjes: 0, valFac: 0, paquetes: 0, valPaq: 0,
    productosN: 0, valProd: 0, costoProd: 0, extrasN: 0, valExtras: 0, extrasCort: 0, gcN: 0, gcVal: 0,
    pagos: { efectivo: 0, transferencia: 0, tarjeta: 0, mixto: 0, otros: 0 },
  };
}
function sumar(a: Agg, h: Hecho) {
  a.tickets++;
  if (h.venta > 0) a.ventaTickets++;
  a.venta += h.venta;
  for (const f of h.facial ? [h.facial, ...(h.masFaciales || [])] : []) { a.faciales++; if (f.canje) a.facCanjes++; a.valFac += f.val; }
  for (const p of h.paquetes) { a.paquetes++; a.valPaq += p.val; }
  for (const p of h.productos) { a.productosN += p.qty; a.valProd += p.val; a.costoProd += p.costo; }
  a.extrasN += h.extrasN; a.valExtras += h.extrasVal; a.extrasCort += h.extrasCort;
  a.gcN += h.gcN; a.gcVal += h.gcVal;
  a.costo += h.extrasCosto;
  for (const [k, v] of Object.entries(h.pagos)) a.pagos[k] = (a.pagos[k] || 0) + v;
}
function cerrar(a: Agg): Row {
  const sinIva = a.venta / IVA;
  const costo = a.costoProd + a.costo;
  const util = sinIva - costo;
  const r2 = (x: number) => round2(x);
  return {
    tickets: a.tickets, ticketsConVenta: a.ventaTickets,
    ventaConIva: r2(a.venta), ventaSinIva: r2(sinIva), iva: r2(a.venta - sinIva),
    costo: r2(costo), utilidad: r2(util), margen: sinIva > 0 ? Math.round(util / sinIva * 1000) / 10 : 0,
    // Utilidad real solo de productos (es lo único con costo cargado): venta de productos − su costo.
    utilidadProd: r2(a.valProd - a.costoProd),
    ticketPromedio: a.ventaTickets ? r2(sinIva / a.ventaTickets) : 0,
    faciales: a.faciales, facCanjes: a.facCanjes, valFac: r2(a.valFac),
    paquetes: a.paquetes, valPaq: r2(a.valPaq),
    productosN: a.productosN, valProd: r2(a.valProd), costoProd: r2(a.costoProd),
    margenProd: a.valProd > 0 ? Math.round((a.valProd - a.costoProd) / a.valProd * 1000) / 10 : 0,
    extrasN: a.extrasN, valExtras: r2(a.valExtras), extrasCort: a.extrasCort,
    gcN: a.gcN, gcVal: r2(a.gcVal),
    pagos: Object.fromEntries(Object.entries(a.pagos).map(([k, v]) => [k, r2(v / IVA)])),
  };
}

function totalOc(o: Row): number {
  const sub = n(o.subtotal);
  if (sub > 0) return sub;
  if (n(o.total) > 0) return n(o.total) / IVA;
  let snap: Row = {};
  if (o.snap && typeof o.snap === "object") snap = o.snap as Row;
  else { try { snap = JSON.parse(s(o.nota) || "{}"); } catch { snap = {}; } }
  const tot = snap.totales && typeof snap.totales === "object" ? snap.totales as Row : null;
  if (tot && n(tot.subtotal) > 0) return n(tot.subtotal);
  let x = 0;
  for (const f of Array.isArray(snap.fact) ? snap.fact as Row[] : []) x += n(f.vendido) * n(f.compra);
  for (const it of Array.isArray(snap.items) ? snap.items as Row[] : []) x += n(it.cantidad ?? it.sugerido) * n(it.compra);
  for (const it of Array.isArray(snap.directa) ? snap.directa as Row[] : []) x += n(it.cantidad ?? it.sugerido) * n(it.compra);
  return x;
}
function fechaOc(o: Row): string {
  const f = s(o.fecha);
  return ymdRe.test(f.slice(0, 10)) ? f.slice(0, 10) : "";
}

function top(map: Map<string, Row>, campo: string, k = 5): Row[] {
  return [...map.values()].sort((a, b) => n(b[campo]) - n(a[campo])).slice(0, k);
}

/** Hechos de venta: Migo antes del corte (mayo 2026) y tickets del sistema desde el corte. */
async function hechosTodos(db: Db, pr: Precios): Promise<Hecho[]> {
  const [rows, facs, lins] = await Promise.all([
    db.all("tickets"),
    db.all("beta_migo_facturas").catch(() => [] as Row[]),
    db.all("beta_migo_lineas").catch(() => [] as Row[]),
  ]);
  const hechos: Hecho[] = [];
  const hayMigo = facs.length > 0;
  for (const t of rows) {
    if (t.borrado_at || esCancelado(t)) continue;
    const h = hechoDe(t, pr);
    if (!h || (hayMigo && h.k < CORTE_MIGO)) continue;
    h.fuente = "sistema"; h.ref = s(t.beta_num || t.sheet_row || t.id);
    hechos.push(h);
  }
  if (hayMigo) hechos.push(...hechosMigo(facs, lins, pr));
  return hechos;
}

export async function calcularDashboard(db: Db, now: Date, p: Row): Promise<Row> {
  const ec = ecuadorParts(now);
  const per = (["hoy", "semana", "mes", "ano", "rango"].includes(s(p.periodo)) ? s(p.periodo) : "hoy") as Periodo;
  const R = rangos(per, ec.ymd, s(p.desde), s(p.hasta));
  const pr = await precios(db);
  const cosm = s(p.cosm || p.cosmetologa);
  const hechos0 = await hechosTodos(db, pr);
  const hechos = cosm ? hechos0.filter((h) => mismaCosmetologa(h.cosm, cosm)) : hechos0;
  const ocs = (await db.all("erp_oc").catch(() => [] as Row[]))
    .filter((o) => !["cancelada", "anulada", "borrador", "rechazada"].includes(s(o.estado).toLowerCase()))
    .map((o) => ({ k: fechaOc(o), val: totalOc(o) })).filter((o) => o.k);
  const meta = n((await kvGet(db, "dashboard_cfg").catch(() => ({} as Row))).meta_margen) || META_MARGEN_DEF;

  const migoMin = hechos.filter((h) => h.fuente === "migo").reduce((a, h) => (!a || h.k < a ? h.k : a), "");
  const en = (k: string, a: string, b: string) => k >= a && k <= b;
  const cur = nuevoAgg(), prev = nuevoAgg();
  const topFac = new Map<string, Row>(), topProd = new Map<string, Row>(), topCli = new Map<string, Row>(), porCosm = new Map<string, Row>();
  for (const h of hechos) {
    if (en(h.k, R.pDesde, R.pHasta)) sumar(prev, h);
    if (!en(h.k, R.desde, R.hasta)) continue;
    sumar(cur, h);
    const sinIva = h.venta / IVA;
    for (const hf of h.facial ? [h.facial, ...(h.masFaciales || [])] : []) {
      const f = topFac.get(hf.code) || { code: hf.code, nombre: hf.nombre, n: 0, canjes: 0, val: 0 };
      f.n = n(f.n) + 1; if (hf.canje) f.canjes = n(f.canjes) + 1; f.val = n(f.val) + hf.val;
      topFac.set(hf.code, f);
    }
    for (const pl of h.productos) {
      const x = topProd.get(pl.sku) || { sku: pl.sku, nombre: pl.nombre, qty: 0, val: 0, costo: 0 };
      x.qty = n(x.qty) + pl.qty; x.val = n(x.val) + pl.val; x.costo = n(x.costo) + pl.costo;
      topProd.set(pl.sku, x);
    }
    if (h.clientaKey) {
      const c = topCli.get(h.clientaKey) || { key: h.clientaKey, nombre: h.clienta, tickets: 0, val: 0 };
      c.tickets = n(c.tickets) + 1; c.val = n(c.val) + sinIva;
      topCli.set(h.clientaKey, c);
    }
    const cn = h.cosm || "Sin asignar";
    const cc = porCosm.get(cn) || { nombre: cn, tickets: 0, faciales: 0, val: 0 };
    cc.tickets = n(cc.tickets) + 1; if (h.facial) cc.faciales = n(cc.faciales) + 1 + (h.masFaciales || []).length; cc.val = n(cc.val) + sinIva;
    porCosm.set(cn, cc);
  }

  // Historia: por día (Hoy = últimos 30 días; rango largo o Año = por mes).
  const len = diasEntre(R.desde, R.hasta) + 1;
  const mensual = per === "ano" || (per === "rango" && len > 62);
  const hDesde = per === "hoy" ? addDays(R.hasta, -29) : R.desde;
  const buckets = new Map<string, { k: string; label: string; agg: Agg }>();
  if (mensual) {
    let y = +hDesde.slice(0, 4), m = +hDesde.slice(5, 7);
    const yz = +R.hasta.slice(0, 4), mz = +R.hasta.slice(5, 7);
    while (y < yz || (y === yz && m <= mz)) {
      const k = `${y}-${String(m).padStart(2, "0")}`;
      buckets.set(k, { k, label: `${MES_CORTO[m]} ${y}`, agg: nuevoAgg() });
      m++; if (m > 12) { m = 1; y++; }
    }
  } else {
    for (let k = hDesde; k <= R.hasta; k = addDays(k, 1)) buckets.set(k, { k, label: etiquetaDia(k), agg: nuevoAgg() });
  }
  for (const h of hechos) {
    if (!en(h.k, hDesde, R.hasta)) continue;
    const bk = buckets.get(mensual ? h.k.slice(0, 7) : h.k);
    if (bk) sumar(bk.agg, h);
  }
  const historia = [...buckets.values()].map((b) => {
    const c = cerrar(b.agg);
    return { k: b.k, label: b.label, venta: c.ventaSinIva, utilidad: c.utilidad, margen: c.margen, faciales: c.faciales, productos: c.productosN, tickets: c.tickets,
      utilidadProd: c.utilidadProd, margenProd: c.margenProd, valProd: c.valProd, fuente: b.k < CORTE_MIGO.slice(0, b.k.length) ? "migo" : "sistema" };
  });

  // Ventas vs compras: últimos 6 meses hasta el fin del periodo, sin IVA.
  const vc: Row[] = [];
  {
    let y = +R.hasta.slice(0, 4), m = +R.hasta.slice(5, 7);
    const meses: string[] = [];
    for (let i = 0; i < 6; i++) { meses.unshift(`${y}-${String(m).padStart(2, "0")}`); m--; if (m < 1) { m = 12; y--; } }
    for (const mk of meses) {
      let v = 0, c = 0;
      for (const h of hechos) if (h.k.slice(0, 7) === mk) v += h.venta / IVA;
      for (const o of ocs) if (o.k.slice(0, 7) === mk) c += o.val;
      vc.push({ k: mk, label: MES_CORTO[+mk.slice(5, 7)], ventas: round2(v), compras: round2(c) });
    }
  }
  let comprasCur = 0, comprasPrev = 0, ocN = 0;
  for (const o of ocs) {
    if (en(o.k, R.desde, R.hasta)) { comprasCur += o.val; ocN++; }
    if (en(o.k, R.pDesde, R.pHasta)) comprasPrev += o.val;
  }

  // Inventario: saldo ERP × costo; stock bajo con los mínimos por bodega.
  let inventario: Row = { valor: 0, unidades: 0, bodegas: [], bajos: 0, error: "" };
  try {
    const sal = await runErp("stk_saldo", { _rol: "admin" }, db, "dashboard", now);
    const cInv = await costoErp(db, pr);
    const porBod = new Map<string, { nombre: string; valor: number; unidades: number }>();
    let valor = 0, unidades = 0;
    const prodU = new Map<string, string>();
    for (const p of await db.all("erp_productos").catch(() => [] as Row[])) prodU.set(skuCode(s(p.sku)), s(p.unidad).toLowerCase());
    const raros: Row[] = [];
    for (const it of (sal.items as Row[]) || []) {
      const q = n(it.cantidad);
      if (!(q > 0)) continue;
      const code = skuCode(s(it.sku));
      // 100+ envases de un producto por unidad en una sola bodega: casi siempre son ml cargados como unidades.
      if (q >= 100 && (prodU.get(code) || "u") === "u") {
        raros.push({ sku: code, bodega: s(it.bodega), cantidad: round2(q), valor: round2(q * (cInv.get(code) || 0)) });
        continue;
      }
      const v = q * (cInv.get(skuCode(s(it.sku))) || 0);
      valor += v; unidades += q;
      const b = porBod.get(s(it.bodega)) || { nombre: s(it.bodega), valor: 0, unidades: 0 };
      b.valor += v; b.unidades += q; porBod.set(s(it.bodega), b);
    }
    let bajos = 0;
    try { const home = await runErp("home", { _rol: "admin" }, db, "dashboard", now); bajos = ((home.bajos as Row[]) || []).length; } catch { bajos = 0; }
    inventario = {
      valor: round2(valor), unidades: round2(unidades), skus: new Set(((sal.items as Row[]) || []).filter((it) => n(it.cantidad) > 0).map((it) => skuCode(s(it.sku)))).size, bajos, raros,
      bodegas: [...porBod.values()].filter((b) => b.valor > 0 || b.unidades > 0).sort((a, b) => b.valor - a.valor).map((b) => ({ nombre: b.nombre, valor: round2(b.valor), unidades: round2(b.unidades) })),
      error: "",
    };
  } catch (e) {
    inventario.error = e instanceof Error ? e.message : String(e);
  }

  const r2 = (x: unknown) => round2(n(x));
  const totFacN = cur.faciales || 0;
  const curC = cerrar(cur);
  const sumVal = (m: Map<string, Row>) => [...m.values()].reduce((a, x) => a + n(x.val), 0);
  const totProdVal = sumVal(topProd), totCli = sumVal(topCli), totCosm = sumVal(porCosm);
  const prods = [...topProd.values()].map((x) => ({
    sku: x.sku, nombre: x.nombre, qty: n(x.qty), val: r2(x.val), margen: r2(n(x.val) - n(x.costo)),
    margenPct: n(x.val) > 0 ? Math.round((n(x.val) - n(x.costo)) / n(x.val) * 1000) / 10 : 0,
    pct: totProdVal > 0 ? Math.round(n(x.val) / totProdVal * 1000) / 10 : 0,
  }));
  const labelPrev = per === "hoy" ? etiquetaDia(R.pDesde) : etiquetaRango(R.pDesde, R.pHasta);
  return {
    ok: true,
    periodo: per, desde: R.desde, hasta: R.hasta, prevDesde: R.pDesde, prevHasta: R.pHasta,
    label: per === "hoy" ? "Hoy · " + etiquetaDia(R.desde, true) : per === "mes" ? `${MES_LARGO[+R.desde.slice(5, 7)]} ${R.desde.slice(0, 4)} (1–${+R.hasta.slice(8, 10)})` : etiquetaRango(R.desde, R.hasta),
    labelPrev, hoy: ec.ymd, metaMargen: meta,
    actual: curC, anterior: cerrar(prev),
    historia, historiaMensual: mensual,
    topFaciales: top(topFac, "n").map((x) => ({ code: x.code, nombre: x.nombre, n: n(x.n), canjes: n(x.canjes), val: r2(x.val), pct: totFacN ? Math.round(n(x.n) / totFacN * 1000) / 10 : 0 })),
    productos: prods.sort((a, b) => b.val - a.val).slice(0, 60),
    productosVendidos: topProd.size,
    topClientas: top(topCli, "val").map((x) => ({ key: x.key, nombre: x.nombre, tickets: n(x.tickets), val: r2(x.val), pct: totCli ? Math.round(n(x.val) / totCli * 1000) / 10 : 0 })),
    porCosmetologa: top(porCosm, "val", 12).map((x) => ({ nombre: x.nombre, tickets: n(x.tickets), faciales: n(x.faciales), val: r2(x.val), pct: totCosm ? Math.round(n(x.val) / totCosm * 1000) / 10 : 0 })),
    ventasCompras: vc,
    compras: { actual: round2(comprasCur), anterior: round2(comprasPrev), ocs: ocN, neto: round2(n(curC.ventaSinIva) - comprasCur) },
    inventario,
    actualizado: ec.hm,
    fuentes: { corte: CORTE_MIGO, migoDesde: migoMin, migoHasta: addDays(CORTE_MIGO, -1), conMigo: R.desde < CORTE_MIGO && !!migoMin,
      nota: "Hasta abril 2026 los datos vienen de las facturas de Migo; desde mayo 2026, de los tickets del sistema. La utilidad es solo de productos: faciales, paquetes y servicios todavía no tienen costo cargado." },
  };
}

/** Detalle (drill-down) de un número del dashboard: los comprobantes que lo forman. */
export async function detalleDashboard(db: Db, p: Row): Promise<Row> {
  const desde = s(p.desde), hasta = s(p.hasta) || desde, tipo = s(p.tipo), k = s(p.k);
  if (!ymdRe.test(desde) || !ymdRe.test(hasta)) return { error: "Rango inválido" };
  const pr = await precios(db);
  const hechos = (await hechosTodos(db, pr)).filter((h) => h.k >= desde && h.k <= hasta);
  const fac = (h: Hecho) => h.facial ? [h.facial, ...(h.masFaciales || [])] : [];
  const pasa = (h: Hecho): boolean => {
    switch (tipo) {
      case "dia": return h.k === k;
      case "mes": return h.k.slice(0, 7) === k;
      case "facial": return fac(h).some((f) => f.code === k);
      case "producto": return h.productos.some((x) => x.sku === k);
      case "clienta": return h.clientaKey === k || h.clienta === k;
      case "cosmetologa": return (h.cosm || "Sin asignar") === k;
      case "pago": return n(h.pagos[k]) > 0;
      case "paquetes": return h.paquetes.length > 0;
      case "gift": return h.gcN > 0;
      case "extras": return h.extrasN > 0;
      case "productos": return h.productos.length > 0;
      case "faciales": return !!h.facial;
      default: return true;
    }
  };
  const L = hechos.filter(pasa).sort((a, b) => b.k.localeCompare(a.k));
  const rows = L.slice(0, 400).map((h) => {
    const partes = [
      ...fac(h).map((f) => f.nombre + (f.canje ? " (canje)" : "")),
      ...h.paquetes.map((x) => "📦 " + x.nombre),
      ...h.productos.map((x) => x.nombre + (x.qty > 1 ? " ×" + x.qty : "")),
      ...(h.gcN ? ["🎁 Gift card ×" + h.gcN] : []), ...(h.extrasN ? ["Extras ×" + h.extrasN] : []),
    ];
    const val = tipo === "producto" ? h.productos.filter((x) => x.sku === k).reduce((a, x) => a + x.val, 0)
      : tipo === "facial" ? fac(h).filter((f) => f.code === k).reduce((a, f) => a + f.val, 0)
      : tipo === "pago" ? n(h.pagos[k]) / IVA : h.venta / IVA;
    return { fecha: h.k, fuente: h.fuente || "sistema", ref: h.ref || "", clienta: h.clienta, cosmetologa: h.cosm, detalle: partes.join(" · "), valor: round2(val), total: round2(h.venta) };
  });
  return { ok: true, tipo, k, desde, hasta, n: L.length, mostrando: rows.length, ventaSinIva: round2(L.reduce((a, h) => a + h.venta, 0) / IVA), rows };
}
extend("getDashboardDetalle", ADMIN, async (p, ctx: Ctx) => detalleDashboard(ctx.db, p));

extend("getDashboard", ADMIN, async (p, ctx: Ctx) => calcularDashboard(ctx.db, ctx.now, p));


/** KPIs del personal (productos / paquetes / faciales) sin bajar todo el dashboard admin. */
export async function calcularKpisStaff(db: Db, now: Date, p: Row): Promise<Row> {
  const ec = ecuadorParts(now);
  const per = (["hoy", "semana", "mes", "ano"].includes(s(p.periodo)) ? s(p.periodo) : "hoy") as Periodo;
  const R = rangos(per, ec.ymd);
  const pr = await precios(db);
  const cols = [
    "id", "timestamp", "estimado", "atendido_por", "id_3", "nombre", "apellido",
    "servicios_adicionales", "facial_hecho", "gift_card", "paquete",
    "compra_pack_3", "compra_pack_6", "venta_gift", "orig", "borrado_at",
    ...PROD_COLS.map((c) => c.col),
  ];
  const q = await consultar(db, "tickets", {
    cols,
    filtros: [
      { col: "borrado_at", op: "is_null" },
      { col: "timestamp", op: "gte", val: R.desde + "T00:00:00" },
      { col: "timestamp", op: "lt", val: addDays(R.hasta, 1) + "T00:00:00" },
    ],
  });
  const cosm = s(p.cosm || p.cosmetologa);
  const agg = nuevoAgg();
  for (const t of q.rows) {
    if (esCancelado(t)) continue;
    const h = hechoDe(t, pr);
    if (!h) continue;
    if (cosm && !mismaCosmetologa(h.cosm, cosm)) continue;
    sumar(agg, h);
  }
  const c = cerrar(agg);
  return { productos: c.productosN, paquetes: c.paquetes, faciales: c.faciales, periodo: per, desde: R.desde, hasta: R.hasta };
}
