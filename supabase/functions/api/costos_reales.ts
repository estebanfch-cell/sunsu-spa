// Costo real de compra (última OC, ficha beta o inventario_base) y snapshots de
// precios en el ticket. Nunca usa precio_compra, compra_comision ni costo_promedio.
import { cicloInicio, comisionFacialLinea, compraParaComision, marcaDePersona, n, pagaComisionFacial, productQtys, round2, s, skuCode, toCosmMark, ymdUtc, type Row, type TicketIn } from "./domain.ts";
import { cfgAplicada } from "./comision_cfg.ts";
import { cargarOcJson, costoRealElegido, ponerPrecioOc, snapProducto, ventaNetaLineas } from "./productos.ts";
import { IVA_TK } from "./ticket_beta.ts";
import type { Db } from "./db.ts";

export type PrecioOc = { precio: number; fecha: string };
export type CostoSku = { costo: number; fuente: "beta" | "oc" | "inventario" };

export async function cargarPreciosOc(db: { all: (t: string) => Promise<Row[]> }): Promise<Map<string, PrecioOc>> {
  const precios = new Map<string, PrecioOc>();
  try {
    const prods = await db.all("erp_productos");
    const porId = new Map(prods.map((p) => [String(p.id), skuCode(s(p.sku))]));
    const ocs = await db.all("erp_oc");
    const fechaOc = new Map(ocs.map((o) => [String(o.id), s(o.fecha)]));
    const anul = new Set(["anulada", "cancelada", "borrador", "rechazada"]);
    const skip = new Set(ocs.filter((o) => anul.has(s(o.estado).toLowerCase())).map((o) => String(o.id)));
    for (const ln of await db.all("erp_oc_lineas")) {
      if (skip.has(String(ln.oc_id))) continue;
      ponerPrecioOc(precios, porId.get(String(ln.producto_id)) || "", n(ln.precio), fechaOc.get(String(ln.oc_id)) || "");
    }
  } catch { /* sin tablas ERP */ }
  try {
    for (const oc of await db.all("ordenes_compra")) {
      cargarOcJson(precios, oc.json, oc.fecha);
    }
  } catch { /* sin órdenes de hoja */ }
  return precios;
}

export async function mapaCostoReal(db: { all: (t: string) => Promise<Row[]> }): Promise<Map<string, CostoSku>> {
  const oc = await cargarPreciosOc(db);
  const inv = new Map<string, number>();
  try {
    for (const b of await db.all("inventario_base")) {
      const code = skuCode(s(b.sku));
      if (code && n(b.compra) > 0) inv.set(code, n(b.compra));
    }
  } catch { /* sin inventario_base */ }
  const beta = new Map<string, number>();
  try {
    for (const p of await db.all("erp_productos")) {
      const code = skuCode(s(p.sku));
      if (code && p.beta_compra_real != null && p.beta_compra_real !== "" && n(p.beta_compra_real) > 0) {
        beta.set(code, n(p.beta_compra_real));
      }
    }
  } catch { /* sin erp */ }
  const out = new Map<string, CostoSku>();
  const codes = new Set<string>([...oc.keys(), ...inv.keys(), ...beta.keys()]);
  for (const code of codes) {
    const el = costoRealElegido({ beta: beta.get(code), oc: oc.get(code) || null, inventario: inv.get(code) });
    if (el.costo != null && el.fuente) out.set(code, { costo: el.costo, fuente: el.fuente });
  }
  return out;
}

export interface SnapLeido {
  sku: string;
  qty: number;
  ventaNeta: number;
  compraComision: number;
  costoReal: number;
  comision: number;
  utilidad: number;
  faltaCosto: boolean;
  esPaquete: boolean;
}

export async function snapsPorClave(db: { all: (t: string) => Promise<Row[]> }): Promise<Map<string, SnapLeido[]>> {
  const out = new Map<string, SnapLeido[]>();
  const add = (clave: string, s0: SnapLeido) => {
    const k = s(clave);
    if (!k) return;
    out.set(k, [...(out.get(k) || []), s0]);
  };
  try {
    for (const l of await db.all("beta_ticket_lineas")) {
      if (l.snapshot_at == null || l.snapshot_at === "") continue;
      const tipo = s(l.tipo);
      if (tipo !== "producto" && tipo !== "paquete") continue;
      add(s(l.ticket_clave), {
        sku: s(l.sku), qty: n(l.cantidad),
        ventaNeta: n(l.venta_neta), compraComision: n(l.compra_comision),
        costoReal: n(l.costo_real), comision: n(l.comision), utilidad: n(l.utilidad),
        faltaCosto: l.falta_costo === true, esPaquete: tipo === "paquete",
      });
    }
  } catch { /* sin líneas beta */ }
  try {
    for (const l of await db.all("beta_ticket_snaps")) {
      add(s(l.ticket_clave), {
        sku: s(l.sku), qty: n(l.qty),
        ventaNeta: n(l.venta_neta), compraComision: n(l.compra_comision),
        costoReal: n(l.costo_real), comision: n(l.comision), utilidad: n(l.utilidad),
        faltaCosto: l.falta_costo === true, esPaquete: l.es_paquete === true,
      });
    }
  } catch { /* tabla nueva */ }
  return out;
}

type DbWrite = Db;

/** Completa snapshots que faltan, con los precios/costos vigentes. No pisa un snapshot ya guardado. No escribe en preview. */
export async function asegurarSnapshots(
  db: DbWrite,
  actor: string,
  preview: boolean,
  tickets: Row[],
  claveDe: (r: Row) => string,
): Promise<void> {
  if (preview) return;
  const costos = await mapaCostoReal(db);
  const cats = new Map((await db.all("catalogo").catch(() => [] as Row[])).map((r) => [skuCode(s(r.sku)), r]));
  const cabs = await db.all("beta_tickets").catch(() => [] as Row[]);
  const porClave = new Map(cabs.map((c) => [s(c.clave), c]));
  const lineas = await db.all("beta_ticket_lineas").catch(() => [] as Row[]);
  const snaps = await db.all("beta_ticket_snaps").catch(() => [] as Row[]);
  const snapSet = new Set(snaps.map((x) => s(x.ticket_clave) + "\t" + skuCode(s(x.sku)) + "\t" + (x.es_paquete === true ? "1" : "0")));

  // TK121: datos para congelar la comisión de las líneas faciales (canje incluido).
  const tkPorClave = new Map(tickets.map((r) => [claveDe(r), r]));
  const marcas = (await db.all("cosmetologas").catch(() => [] as Row[])).map(toCosmMark);
  const cfgCache = new Map<string, Awaited<ReturnType<typeof cfgAplicada>>["cfg"]>();
  const cfgDe = async (ciclo: string) => { if (!cfgCache.has(ciclo)) { try { cfgCache.set(ciclo, (await cfgAplicada(db, ciclo)).cfg); } catch { return null; } } return cfgCache.get(ciclo)!; };
  for (const l of lineas) {
    if (l.snapshot_at != null && l.snapshot_at !== "") continue;
    const cab = porClave.get(s(l.ticket_clave));
    const hermanas = lineas.filter((x) => s(x.ticket_clave) === s(l.ticket_clave));
    const suma = hermanas.reduce((a, x) => a + n(x.total_linea), 0);
    const total = cab && cab.total != null && cab.total !== "" ? n(cab.total) : suma;
    const nets = ventaNetaLineas(hermanas.map((x) => ({ total_linea: n(x.total_linea) })), total, IVA_TK);
    const idx = hermanas.findIndex((x) => x === l || (s(x.id) && s(x.id) === s(l.id)));
    const venta = idx >= 0 ? nets[idx] : round2(n(l.total_linea) / IVA_TK);
    const code = skuCode(s(l.sku));
    const snap = snapProducto({
      tipo: s(l.tipo),
      ventaNeta: venta,
      qty: n(l.cantidad),
      costoRealUnit: costos.get(code)?.costo ?? null,
      compraComisionUnit: compraParaComision(cats.get(code)),
      excluir: l.excluir_comision === true,
    });
    const id = s(l.id);
    if (!id) continue;
    if (s(l.tipo) === "facial") {
      const tk = tkPorClave.get(s(l.ticket_clave));
      const fecha = tk ? ymdUtc(tk.timestamp) : "";
      const cfg = fecha ? await cfgDe(cicloInicio(fecha)) : null;
      if (tk && cfg) {
        const paga = cab?.excluir_cosmetologa !== true && pagaComisionFacial(marcaDePersona(marcas, s(tk.atendido_por)), fecha);
        snap.comision = comisionFacialLinea({ sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, excluir: l.excluir_comision === true }, cfg, paga);
      }
    }
    try {
      await db.write(actor, "beta_ticket_lineas", "update", { id }, { ...snap, snapshot_at: new Date().toISOString() });
    } catch { /* columna aún no aplicada */ }
  }

  const tksConLineasBeta = new Set(cabs.filter((c) => c.lineas_beta === true).map((c) => s(c.clave)));
  for (const r of tickets) {
    if (r.borrado_at) continue;
    const clave = claveDe(r);
    if (!clave || tksConLineasBeta.has(clave)) continue;
    for (const pr of productQtys(r)) {
      const code = skuCode(pr.sku);
      const key = clave + "\t" + code + "\t0";
      if (snapSet.has(key)) continue;
      const cat = cats.get(code);
      const ventaUnit = cat ? (n(cat.subtotal) || (n(cat.total_con_iva) > 0 ? round2(n(cat.total_con_iva) / IVA_TK) : 0)) : 0;
      const snap = snapProducto({
        tipo: "producto",
        ventaNeta: round2(ventaUnit * pr.qty),
        qty: pr.qty,
        costoRealUnit: costos.get(code)?.costo ?? null,
        compraComisionUnit: compraParaComision(cat),
      });
      try {
        await db.write(actor, "beta_ticket_snaps", "insert", {}, {
          id: crypto.randomUUID(), ticket_clave: clave, sku: code, qty: pr.qty, ...snap, es_paquete: false, snapshot_at: new Date().toISOString(),
        });
        snapSet.add(key);
      } catch { /* tabla aún no aplicada */ }
    }
  }
}

/** Aplica snapshots de producto/paquete al ticket interno de comisiones. */
export function aplicarSnapsATicket<T extends TicketIn>(t: T, snaps: SnapLeido[] | undefined): T {
  if (!snaps || !snaps.length) return t;
  const packs = snaps.filter((x) => x.esPaquete);
  const prods = snaps.filter((x) => !x.esPaquete);
  const out = { ...t };
  if (prods.length) {
    out.productos = prods.map((p) => ({
      sku: p.sku, qty: p.qty, ventaNeta: p.ventaNeta, compraComision: p.compraComision,
    }));
  }
  if (packs[0] && !(n(out.netoPack) > 0)) out.netoPack = packs[0].ventaNeta;
  if (packs[1] && !(n(out.netoPack6) > 0)) out.netoPack6 = packs[1].ventaNeta;
  return out;
}
