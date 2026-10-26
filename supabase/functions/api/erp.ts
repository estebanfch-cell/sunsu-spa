// Inventario y compras al estilo Minecore: dos bodegas, kardex inmutable,
// recepción que postea stock, ticket = orden de venta. La regla de uso
// (cabina / venta / ambos) se prueba aquí y la repite el trigger en 0009.

import { enPrueba, MemoryDb, type Db } from "./db.ts";
import { ecuadorParts, elegirNumeroOv, facialSku, n, prodCol, round2, s, siguienteTestDoc, skuCode, type Row } from "./domain.ts";
import { CORTE_ERP, aperturaVenta, aplicarTrasCorte, despuesDeErp } from "./stock_corte.ts";
import { asignarTicketBeta } from "./lib.ts";
import { backfillSO, tomarNumero } from "./series.ts";
import { familiaSku, quincenaActual } from "./ventas.ts";

export const BODEGA_VENTA = "11111111-1111-4111-8111-111111111111";
export const BODEGA_CABINA = "22222222-2222-4222-8222-222222222222";
export const LOCAL_ESQUINA = "33333333-3333-4333-8333-333333333333";
export const BODEGA_CASA = "44444444-4444-4444-8444-444444444444";
export const BODEGA_CABINA_2 = "55555555-5555-4555-8555-555555555552";
export const BODEGA_CABINA_3 = "55555555-5555-4555-8555-555555555553";

export function usoCompatible(uso: string, tipoBodega: string): boolean {
  if (tipoBodega === "casa" || tipoBodega === "ubicacion") return true;
  if (uso === "ambos") return tipoBodega === "cabina" || tipoBodega === "venta";
  return uso === tipoBodega;
}

/** Vacío se trata como admin: los tests llaman runErp directo. */
export function puedeTransferir(rol: string, origen: Row | undefined, destino: Row | undefined): string | null {
  if (!origen || !destino) return "Elige bodega origen y destino";
  if (String(origen.id) === String(destino.id)) return "El origen y el destino son el mismo lugar";
  const r = s(rol);
  const admin = r === "" || r === "admin" || r === "super_admin";
  if (admin) return null;
  const to = s(origen.tipo);
  const td = s(destino.tipo);
  if (to === "casa" || td === "casa") return "Solo un admin mueve stock con Casa";
  if (s(origen.local_id) && s(destino.local_id) && s(origen.local_id) !== s(destino.local_id)) {
    return "Solo un admin mueve stock entre locales";
  }
  const par = new Set([to, td]);
  if (par.has("venta") && par.has("cabina")) return null;
  return "Puedes pasar stock entre Venta y Cabina de tu local";
}

export interface Negativo {
  sku: string; producto: string; bodega: string; hay: number; piden: number; queda: number;
}
export class ErpError extends Error {
  requiere = false;
  negativo?: Negativo;
  constructor(msg: string, negativo?: Negativo) {
    super(msg);
    this.negativo = negativo;
    this.requiere = !!negativo;
  }
}

type Step =
  | { op: "upsert"; table: string; match: Row; row: Row }
  | { op: "delete"; table: string; match: Row }
  | { op: "move"; producto_id: string; bodega_id: string; delta: number; tipo: string; doc_tipo?: string; doc_id?: string; ticket_ref?: string; costo_unit?: number; lote?: string; sububicacion?: string; nota?: string; aprobar_negativo?: boolean; legacy_ref?: string };

function id(): string { return crypto.randomUUID(); }
async function numeroDoc(db: Db, rpcName: string, rows: Row[], prefix: string): Promise<string> {
  if (enPrueba(db)) return siguienteTestDoc(rows, prefix);
  try {
    const v = await db.rpc(rpcName, {});
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch { /* 0009 todavía no aplicado: se numera con las filas que ya existen */ }
  return num(rows, prefix);
}

function num(rows: Row[], prefix: string, prueba = false): string {
  if (prueba) return siguienteTestDoc(rows, prefix);
  let m = 0;
  const re = new RegExp("^" + prefix + "-(\\d+)$");
  for (const r of rows) {
    const mm = String(r.numero || "").match(re);
    if (mm) m = Math.max(m, Number(mm[1]));
  }
  return prefix + "-" + String(m + 1).padStart(4, "0");
}
function round4(x: number): number { return Math.round((x + Number.EPSILON) * 10000) / 10000; }
function nombreDeActor(actor: string): string {
  const m = actor.match(/^(.*?)\s+\([^)]*\)\s*$/);
  return (m ? m[1] : actor).trim();
}
function colsTicket(ticketCols: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(ticketCols)) {
    if (k === "orig" || k === "facial_hecho") continue;
    out[k] = v;
  }
  return out;
}

function keyOf(pid: string, bid: string, sub = "", lote = ""): string {
  return [pid, bid, sub, lote].join("|");
}

function bodegaVentaDe(bodegas: Row[]): Row | undefined {
  return bodegas.find((b) => s(b.codigo) === "VENTA") || bodegas.find((b) => s(b.tipo) === "venta");
}

async function cortesVenta(db: Db): Promise<Map<string, number> | null> {
  let rows: Row[] = [];
  try { rows = await db.all("inventario_corte"); } catch { return null; }
  const deHoja = rows.filter((r) => s(r.lugar).toUpperCase() === "VENTA" && s(r.fecha).slice(0, 10) === "2026-10-24");
  if (!deHoja.length) return null;
  return new Map(deHoja.map((r) => [skuCode(s(r.sku)), n(r.cantidad)]));
}

function saldoTrasCorte(code: string, pid: string, ventaId: string, movs: Row[], dbMap: Map<string, number> | null) {
  const ap = dbMap ? (dbMap.get(code) ?? 0) : aperturaVenta(code);
  const posteriores = movs
    .filter((m) => String(m.producto_id) === pid && String(m.bodega_id) === ventaId && despuesDeErp(m.fecha))
    .sort((a, b) => s(a.fecha).localeCompare(s(b.fecha)));
  return aplicarTrasCorte(ap, posteriores.map((m) => ({
    delta: n(m.delta), tipo: s(m.tipo), aprobado: !!s(m.aprobado_negativo_por),
  })));
}

const ATOMIC = new Set(["ov_save", "ticket_aplicar", "ov_anular", "oc_recibir", "pago_save"]);

function negativoDe(msg: string): Negativo | null {
  const at = msg.indexOf("NEGATIVO");
  if (at < 0) return null;
  const candidates = [msg.slice(at), msg.slice(at).replace(/\\"/g, '"')];
  for (const text of candidates) {
    const start = text.indexOf("{");
    if (start < 0) continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            const v = JSON.parse(text.slice(start, i + 1)) as Negativo;
            if (v && typeof v === "object" && "queda" in v) return v;
          } catch { /* el otro candidato */ }
          break;
        }
      }
    }
  }
  return null;
}

function filaRpc(raw: unknown): Row | null {
  if (typeof raw === "string") {
    try { return filaRpc(JSON.parse(raw)); } catch { return null; }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Row;
  return null;
}

/** Una transacción en Postgres. Si la función todavía no existe, el plan sigue en app_write. Un NEGATIVO no se reintenta en local. */
async function commitErpTx(db: Db, actor: string, op: string, steps: Step[], now: string): Promise<Row | null> {
  try {
    const raw = await db.rpc("erp_tx", { p_actor: actor, p_op: op, p_steps: steps, p_now: now });
    const row = filaRpc(raw);
    if (!row) return null;
    if (row.ok === false) throw new Error(s(row.error) || "erp_tx");
    return row;
  } catch (e) {
    if (e instanceof ErpError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("NEGATIVO")) {
      const neg = negativoDe(msg);
      if (neg) throw new ErpError(`Tu stock va a quedar en ${neg.queda} (${neg.sku} ${neg.producto}, ${neg.bodega}). ¿Aprobar?`, neg);
      throw new ErpError(msg);
    }
    if (/PGRST202|Could not find the function|schema cache/i.test(msg) || /function .*erp_tx.* does not exist/i.test(msg)) return null;
    throw e instanceof Error ? e : new Error(msg);
  }
}

export async function applyPlan(db: Db, actor: string, steps: Step[], now = new Date().toISOString(), op = ""): Promise<Row> {
  const productos = await db.all("erp_productos");
  const bodegas = await db.all("erp_bodegas");
  const stock0 = await db.all("erp_stock");
  const movs = await db.all("erp_movimientos");
  const prod = new Map(productos.map((p) => [String(p.id), { ...p }]));
  const bod = new Map(bodegas.map((b) => [String(b.id), b]));
  const legacy = new Set(movs.map((m) => String(m.legacy_ref || "")).filter(Boolean));
  const saldo = new Map<string, number>();
  for (const r of stock0) {
    const k = keyOf(String(r.producto_id), String(r.bodega_id), s(r.sububicacion), s(r.lote));
    saldo.set(k, (saldo.get(k) || 0) + n(r.cantidad));
  }
  if (Date.parse(now) >= Date.parse(CORTE_ERP)) {
    const ventaB = bodegaVentaDe(bodegas);
    const dbMap = await cortesVenta(db);
    if (ventaB) {
      const vid = String(ventaB.id);
      for (const p of productos) {
        const pid = String(p.id);
        const applied = saldoTrasCorte(skuCode(s(p.sku)), pid, vid, movs, dbMap);
        let cur = 0;
        for (const [k, q] of saldo) if (k.startsWith(pid + "|" + vid + "|")) cur += q;
        if (dbMap || cur < applied.saldo - 1e-9) {
          for (const k of [...saldo.keys()]) if (k.startsWith(pid + "|" + vid + "|")) saldo.delete(k);
          saldo.set(keyOf(pid, vid), applied.saldo);
        }
      }
    }
  }
  const onHand = (pid: string) => {
    let t = 0;
    for (const [k, q] of saldo) if (k.startsWith(pid + "|")) t += q;
    return t;
  };
  const costos = new Map<string, number>();
  for (const p of productos) costos.set(String(p.id), n(p.costo_promedio));
  const quedaDe = new Map<Step, number>();

  for (const step of steps) {
    if (step.op !== "move") continue;
    if (step.legacy_ref && legacy.has(step.legacy_ref)) continue;
    const p = prod.get(step.producto_id);
    const b = bod.get(step.bodega_id);
    if (!p) throw new ErpError("Producto no existe");
    if (!b) throw new ErpError("Bodega no existe");
    if (!usoCompatible(s(p.uso), s(b.tipo))) {
      throw new ErpError(`Producto de uso ${s(p.uso)} no puede ir a bodega ${s(b.tipo)}`);
    }
    const k = keyOf(step.producto_id, step.bodega_id, step.sububicacion || "", step.lote || "");
    const hay = saldo.get(k) || 0;
    const queda = round4(hay + step.delta);
    if (queda < -1e-6 && !step.aprobar_negativo) {
      const neg: Negativo = {
        sku: s(p.sku), producto: s(p.nombre), bodega: s(b.nombre),
        hay: round4(hay), piden: round4(Math.abs(step.delta)), queda,
      };
      throw new ErpError(`Tu stock va a quedar en ${queda} (${neg.sku} ${neg.producto}, ${neg.bodega}). ¿Aprobar?`, neg);
    }
    saldo.set(k, queda);
    quedaDe.set(step, queda);
    if (step.tipo === "recepcion" && step.delta > 0) {
      const antes = onHand(step.producto_id) - step.delta;
      const old = costos.get(step.producto_id) || 0;
      const costo = n(step.costo_unit);
      const den = antes + step.delta;
      if (den > 0) costos.set(step.producto_id, round4((antes * old + step.delta * costo) / den));
    }
  }

  if (op && ATOMIC.has(op)) {
    const committed = await commitErpTx(db, actor, op, steps, now);
    if (committed) return committed;
  }

  const mem = db instanceof MemoryDb ? db : null;
  const snap = mem?.snapshot();
  try {
  for (const step of steps) {
    if (step.op === "delete") {
      await db.write(actor, step.table, "delete", step.match, null);
      continue;
    }
    if (step.op === "upsert") {
      const rows = await db.all(step.table);
      const hit = rows.find((r) => Object.entries(step.match).every(([k, v]) => r[k] === v || String(r[k]) === String(v)));
      if (hit) await db.write(actor, step.table, "update", step.match, step.row);
      else await db.write(actor, step.table, "insert", {}, { ...step.match, ...step.row });
      continue;
    }
    if (step.legacy_ref && legacy.has(step.legacy_ref)) continue;
    const k = keyOf(step.producto_id, step.bodega_id, step.sububicacion || "", step.lote || "");
    const queda = quedaDe.get(step) ?? (saldo.get(k) || 0);
    const rows = await db.all("erp_stock");
    const hit = rows.find((r) => keyOf(String(r.producto_id), String(r.bodega_id), s(r.sububicacion), s(r.lote)) === k);
    const stockRow = { producto_id: step.producto_id, bodega_id: step.bodega_id, sububicacion: step.sububicacion || "", lote: step.lote || "", cantidad: queda, caducidad: null };
    if (hit) await db.write(actor, "erp_stock", "update", { id: hit.id }, { cantidad: queda });
    else await db.write(actor, "erp_stock", "insert", {}, stockRow);
    const aprobado = queda < -1e-6 && step.aprobar_negativo ? actor : null;
    await db.write(actor, "erp_movimientos", "insert", {}, {
      fecha: now, actor, producto_id: step.producto_id, bodega_id: step.bodega_id,
      sububicacion: step.sububicacion || "", lote: step.lote || "", delta: step.delta, saldo: queda,
      costo_unit: step.costo_unit ?? null, tipo: step.tipo, doc_tipo: step.doc_tipo || null, doc_id: step.doc_id || null,
      ticket_ref: step.ticket_ref || null, aprobado_negativo_por: aprobado, nota: step.nota || null, legacy_ref: step.legacy_ref || null,
    });
    if (step.legacy_ref) legacy.add(step.legacy_ref);
    const nuevo = costos.get(step.producto_id);
    if (nuevo != null && step.tipo === "recepcion" && step.delta > 0) {
      await db.write(actor, "erp_productos", "update", { id: step.producto_id }, { costo_promedio: nuevo });
    }
  }
  } catch (e) {
    if (mem && snap) mem.restore(snap);
    throw e;
  }
  return { ok: true };
}

function lineNet(cant: number, precio: number, desc = 0): number {
  return round2(cant * precio * (1 - (desc || 0) / 100));
}

function pasosConsumoCabina(destino: Row, lineas: Row[], tid: string, numero: string, actor: string, now: Date): Step[] {
  if (s(destino.tipo) !== "cabina") return [];
  const q = quincenaActual(now);
  const steps: Step[] = [];
  for (const ln of lineas) {
    const fam = familiaSku(s(ln.sku));
    const cant = n(ln.cantidad);
    if (!fam || !(cant > 0)) continue;
    steps.push({ op: "upsert", table: "erp_consignacion_consumo", match: { id: id() }, row: {
      transferencia_id: tid, producto_id: ln.producto_id, sku: skuCode(s(ln.sku)), cantidad: cant,
      costo_unit: n(ln.costo), quincena_ini: q.ini, quincena_fin: q.fin, familia: fam,
      bodega_id: destino.id, creado_por: actor, fecha: now.toISOString(), nota: numero,
    } });
  }
  return steps;
}

function codigoNuevo(rows: Row[], prefix: string): string {
  let m = 0;
  const re = new RegExp("^" + prefix + "-(\\d+)$");
  for (const r of rows) {
    const mm = String(r.codigo || "").match(re);
    if (mm) m = Math.max(m, Number(mm[1]));
  }
  return prefix + "-" + String(m + 1).padStart(3, "0");
}

export async function runErp(op: string, body: Row, db: Db, actor: string, now = new Date()): Promise<Row> {
  const bodegas = await db.all("erp_bodegas");
  const productos = await db.all("erp_productos");
  const porId = new Map(productos.map((p) => [String(p.id), p]));
  const porSku = new Map(productos.map((p) => [skuCode(s(p.sku)), p]));
  const bod = new Map(bodegas.map((b) => [String(b.id), b]));
  const venta = bodegas.find((b) => s(b.codigo) === "VENTA");
  const cabina = bodegas.find((b) => s(b.codigo) === "CABINA");

  if (op === "home" || op === "erp_home") {
    const stock = await db.all("erp_stock");
    const movs = await db.all("erp_movimientos");
    const dbMap = now.toISOString() >= CORTE_ERP ? await cortesVenta(db) : null;
    const ventaB = bodegaVentaDe(bodegas);
    const mins = await db.all("erp_producto_bodega");
    const avisos = (await db.all("erp_avisos")).filter((a) => s(a.estado) !== "cerrado");
    const bajos = [];
    for (const m of mins) {
      let q = stock.filter((r) => r.producto_id === m.producto_id && r.bodega_id === m.bodega_id).reduce((a, r) => a + n(r.cantidad), 0);
      if (ventaB && String(m.bodega_id) === String(ventaB.id) && now.toISOString() >= CORTE_ERP) {
        const p = porId.get(String(m.producto_id));
        q = saldoTrasCorte(skuCode(s(p?.sku)), String(m.producto_id), String(ventaB.id), movs, dbMap).saldo;
      } else if (q < 0 && now.toISOString() >= CORTE_ERP) q = 0;
      if (q <= n(m.stock_min)) {
        const p = porId.get(String(m.producto_id));
        const b = bod.get(String(m.bodega_id));
        bajos.push({ sku: s(p?.sku), nombre: s(p?.nombre), bodega: s(b?.nombre), stock: round4(q), stock_min: n(m.stock_min) });
      }
    }
    const ocs = (await db.all("erp_oc")).filter((o) => ["abierta", "parcial"].includes(s(o.estado)));
    return { ok: true, avisos, bajos, ocAbiertas: ocs.length };
  }

  if (op === "prod_list") {
    const stock = await db.all("erp_stock");
    return { ok: true, items: productos.map((p) => {
      const porBodega: Row = {};
      for (const b of bodegas) {
        porBodega[s(b.codigo)] = round4(stock.filter((r) => r.producto_id === p.id && r.bodega_id === b.id).reduce((a, r) => a + n(r.cantidad), 0));
      }
      return { ...p, porBodega };
    }) };
  }
  if (op === "prod_get") {
    const p = porId.get(s(body.id)) || porSku.get(skuCode(s(body.sku)));
    if (!p) return { error: "Producto no encontrado" };
    const stock = (await db.all("erp_stock")).filter((r) => r.producto_id === p.id);
    const kardex = (await db.all("erp_movimientos")).filter((r) => r.producto_id === p.id);
    const mins = (await db.all("erp_producto_bodega")).filter((r) => r.producto_id === p.id);
    return { ok: true, producto: p, stock, kardex, mins };
  }
  if (op === "prod_save") {
    const uso = s(body.uso);
    if (uso !== "cabina" && uso !== "venta" && uso !== "ambos") return { error: "El uso es obligatorio: cabina, venta o ambos" };
    if (!s(body.sku) || !s(body.nombre)) return { error: "SKU y nombre son obligatorios" };
    const sku = s(body.sku).toUpperCase().replace(/^SUNSU-/, "");
    const prev = porSku.get(skuCode(sku));
    const pid = prev ? String(prev.id) : id();
    const row: Row = {
      sku, nombre: s(body.nombre), marca: s(body.marca), categoria: s(body.categoria),
      clase: s(body.clase) || "producto", unidad: s(body.unidad) || "u",
      unidad_consumo: s(body.unidad_consumo), factor_consumo: n(body.factor_consumo) || 1,
      uso, precio_venta: body.precio_venta == null ? null : n(body.precio_venta),
      iva: body.iva !== false, activo: body.activo !== false, foto_url: s(body.foto_url),
    };
    if (body.costo_promedio != null) row.costo_promedio = n(body.costo_promedio);
    await applyPlan(db, actor, [{ op: "upsert", table: "erp_productos", match: { id: pid }, row }]);
    if (Array.isArray(body.mins)) {
      for (const m of body.mins as Row[]) {
        if (!m.bodega_id) continue;
        await applyPlan(db, actor, [{ op: "upsert", table: "erp_producto_bodega", match: { producto_id: pid, bodega_id: s(m.bodega_id) }, row: { stock_min: n(m.stock_min), punto_reorden: n(m.punto_reorden) } }]);
      }
    }
    return { ok: true, id: pid, sku };
  }

  if (op === "prov_list") return { ok: true, items: await db.all("erp_proveedores") };
  if (op === "prov_save") {
    if (!s(body.nombre)) return { error: "Falta el nombre" };
    const pid = s(body.id) || id();
    await applyPlan(db, actor, [{ op: "upsert", table: "erp_proveedores", match: { id: pid }, row: {
      nombre: s(body.nombre), ruc: s(body.ruc), telefono: s(body.telefono), email: s(body.email),
      contacto: s(body.contacto), plazo_dias: n(body.plazo_dias), activo: body.activo !== false,
    } }]);
    return { ok: true, id: pid };
  }
  if (op === "cli_list") return { ok: true, items: await db.all("erp_clientes") };
  if (op === "cli_save") {
    if (!s(body.nombre)) return { error: "Falta el nombre" };
    const cid = s(body.id) || id();
    await applyPlan(db, actor, [{ op: "upsert", table: "erp_clientes", match: { id: cid }, row: {
      cedula: s(body.cedula), nombre: s(body.nombre), apellido: s(body.apellido),
      telefono: s(body.telefono), email: s(body.email), sector: s(body.sector), activo: body.activo !== false,
    } }]);
    return { ok: true, id: cid };
  }

  if (op === "lugares_list") {
    const locales = (await db.all("erp_locales")).filter((r) => r.activo !== false);
    const lugares = bodegas.filter((b) => b.activo !== false).map((b) => ({
      id: b.id, codigo: b.codigo, nombre: b.nombre, tipo: b.tipo, local_id: b.local_id || null, orden: n(b.orden), activo: b.activo !== false,
    }));
    lugares.sort((a, b) => n(a.orden) - n(b.orden) || s(a.nombre).localeCompare(s(b.nombre)));
    const localId = s(body.local_id) || (locales[0] ? String(locales[0].id) : "");
    return { ok: true, locales, lugares, local_id: localId, uno: locales.length < 2 };
  }
  if (op === "lugar_guardar") {
    const rol = s(body._rol);
    if (rol && rol !== "admin" && rol !== "super_admin") return { error: "Solo un admin edita locales y cabinas" };
    const tipo = s(body.tipo);
    const nombre = s(body.nombre).trim();
    if (!nombre) return { error: "Falta el nombre" };
    if (tipo === "local") {
      const locales = await db.all("erp_locales");
      const prev = locales.find((r) => r.id === body.id);
      const lid = prev ? String(prev.id) : id();
      const codigo = prev ? s(prev.codigo) : codigoNuevo(locales, "LOC");
      await applyPlan(db, actor, [{ op: "upsert", table: "erp_locales", match: { id: lid }, row: {
        codigo, nombre, direccion: s(body.direccion), activo: body.activo !== false,
      } }]);
      return { ok: true, id: lid, codigo, tipo: "local" };
    }
    if (!["cabina", "venta", "ubicacion", "casa"].includes(tipo)) return { error: "Elige local, cabina, venta, ubicación o casa" };
    if (tipo === "casa" && bodegas.some((b) => s(b.tipo) === "casa" && b.id !== body.id)) return { error: "Casa ya está creada. La puedes renombrar." };
    const localId = tipo === "casa" ? null : s(body.local_id);
    if (tipo !== "casa" && !localId) return { error: "Elige el local" };
    const prev = bodegas.find((b) => b.id === body.id);
    const bid = prev ? String(prev.id) : id();
    const codigo = prev ? s(prev.codigo) : codigoNuevo(bodegas, tipo === "cabina" ? "CAB" : tipo === "venta" ? "VEN" : "UBI");
    const orden = prev ? n(prev.orden) : bodegas.filter((b) => String(b.local_id || "") === String(localId || "")).length + 1;
    await applyPlan(db, actor, [{ op: "upsert", table: "erp_bodegas", match: { id: bid }, row: {
      codigo, nombre, tipo, local_id: localId, orden, activo: body.activo !== false,
    } }]);
    return { ok: true, id: bid, codigo, tipo };
  }
  if (op === "lugar_elegir") {
    const lid = s(body.local_id);
    const loc = (await db.all("erp_locales")).find((r) => r.id === lid && r.activo !== false);
    if (!loc) return { error: "Ese local no está activo" };
    if (s(body.token)) {
      await db.write(actor, "sesiones", "update", { token: s(body.token) }, { local_id: lid });
    }
    return { ok: true, local_id: lid, nombre: s(loc.nombre) };
  }

  if (op === "stk_saldo") {
    const stock = await db.all("erp_stock");
    const movs = await db.all("erp_movimientos");
    const corteOn = now.toISOString() >= CORTE_ERP;
    const dbMap = corteOn ? await cortesVenta(db) : null;
    const ventaB = bodegaVentaDe(bodegas);
    const bid = s(body.bodega_id);
    const items = [];
    for (const p of productos) {
      if (s(body.sku) && skuCode(s(p.sku)) !== skuCode(s(body.sku))) continue;
      for (const b of bodegas) {
        if (bid && String(b.id) !== bid) continue;
        let q = stock.filter((r) => r.producto_id === p.id && r.bodega_id === b.id).reduce((a, r) => a + n(r.cantidad), 0);
        let frenado = false;
        if (corteOn && ventaB && String(b.id) === String(ventaB.id)) {
          const applied = saldoTrasCorte(skuCode(s(p.sku)), String(p.id), String(b.id), movs, dbMap);
          q = applied.saldo;
          frenado = applied.frenado;
        } else if (corteOn && q < 0) {
          const aprobado = movs.some((m) => String(m.producto_id) === String(p.id) && String(m.bodega_id) === String(b.id) && s(m.aprobado_negativo_por));
          if (!aprobado) { frenado = true; q = 0; }
        }
        items.push({ producto_id: p.id, sku: p.sku, nombre: p.nombre, uso: p.uso, bodega_id: b.id, bodega: b.nombre, tipo: b.tipo, cantidad: round4(q), frenado });
      }
    }
    return { ok: true, items, corte: corteOn ? "2026-10-24" : "" };
  }
  if (op === "stk_kardex") {
    const pid = s(body.producto_id) || String(porSku.get(skuCode(s(body.sku)))?.id || "");
    let rows = await db.all("erp_movimientos");
    if (pid) rows = rows.filter((r) => String(r.producto_id) === pid);
    if (s(body.bodega_id)) rows = rows.filter((r) => String(r.bodega_id) === s(body.bodega_id));
    rows.sort((a, b) => s(a.fecha).localeCompare(s(b.fecha)));
    return { ok: true, items: rows.map((r) => ({ ...r, sku: s(porId.get(String(r.producto_id))?.sku), bodega: s(bod.get(String(r.bodega_id))?.nombre) })) };
  }

  if (op === "oc_list" || op === "rfq_list" || op === "trf_list" || op === "conteo_list" || op === "ov_list") {
    const table = op === "oc_list" ? "erp_oc" : op === "rfq_list" ? "erp_rfq" : op === "trf_list" ? "erp_transferencias" : op === "conteo_list" ? "erp_conteos" : "erp_ordenes_venta";
    const items = await db.all(table);
    items.sort((a, b) => s(b.numero).localeCompare(s(a.numero)));
    return { ok: true, items };
  }

  if (op === "oc_get") {
    const o = (await db.all("erp_oc")).find((r) => r.id === body.id || r.numero === body.numero);
    if (!o) return { error: "OC no encontrada" };
    const lineas = (await db.all("erp_oc_lineas")).filter((r) => r.oc_id === o.id);
    const recepciones = (await db.all("erp_recepciones")).filter((r) => r.oc_id === o.id);
    return { ok: true, orden: o, lineas, recepciones };
  }

  if (op === "rfq_save") {
    const rid = s(body.id) || id();
    const rfqs = await db.all("erp_rfq");
    const numero = s(body.numero) || (rfqs.find((r) => r.id === rid)?.numero as string) || num(rfqs, "RFQ", enPrueba(db));
    await applyPlan(db, actor, [{ op: "upsert", table: "erp_rfq", match: { id: rid }, row: { numero, fecha: ecuadorParts(now).ymd, estado: s(body.estado) || "borrador", nota: s(body.nota), creado_por: actor } }]);
    return { ok: true, id: rid, numero };
  }
  if (op === "rfq_respuesta") {
    const lid = s(body.id) || id();
    await applyPlan(db, actor, [{ op: "upsert", table: "erp_rfq_lineas", match: { id: lid }, row: {
      rfq_id: s(body.rfq_id), rfq_prov_id: s(body.rfq_prov_id), producto_id: s(body.producto_id),
      cantidad: n(body.cantidad), precio: n(body.precio), plazo: s(body.plazo), elegida: !!body.elegida,
    } }]);
    if (s(body.rfq_prov_id)) {
      await applyPlan(db, actor, [{ op: "upsert", table: "erp_rfq_prov", match: { id: s(body.rfq_prov_id) }, row: { rfq_id: s(body.rfq_id), proveedor_id: s(body.proveedor_id), respondida: true, plazo_dias: n(body.plazo_dias) } }]);
    }
    return { ok: true, id: lid };
  }
  if (op === "rfq_adjudicar") {
    const rfq = (await db.all("erp_rfq")).find((r) => r.id === body.rfq_id);
    if (!rfq) return { error: "Cotización de compra no encontrada" };
    const lineas = (await db.all("erp_rfq_lineas")).filter((r) => r.rfq_id === rfq.id && (body.linea_ids ? (body.linea_ids as string[]).includes(String(r.id)) : r.elegida === true));
    if (!lineas.length) return { error: "Marca la línea ganadora" };
    const prov = s(body.proveedor_id) || s(lineas[0].proveedor_id);
    const ocs = await db.all("erp_oc");
    const ocId = id();
    const numero = await numeroDoc(db, "next_oc_num", ocs, "OC");
    const steps: Step[] = [{ op: "upsert", table: "erp_oc", match: { id: ocId }, row: {
      numero, proveedor_id: prov, rfq_id: rfq.id, fecha: ecuadorParts(now).ymd, estado: "abierta",
      bodega_destino_id: s(body.bodega_id) || venta?.id || null, creado_por: actor, subtotal: 0, iva: 0, total: 0, saldo: 0, estado_pago: "pendiente",
    } }];
    let sub = 0;
    let i = 0;
    for (const ln of lineas) {
      const neto = lineNet(n(ln.cantidad), n(ln.precio));
      sub += neto;
      steps.push({ op: "upsert", table: "erp_oc_lineas", match: { id: id() }, row: {
        oc_id: ocId, producto_id: ln.producto_id, cantidad: n(ln.cantidad), precio: n(ln.precio), descuento_pct: 0,
        bodega_id: s(body.bodega_id) || null, subtotal: neto, recibido: 0, orden: i++,
      } });
      steps.push({ op: "upsert", table: "erp_rfq_lineas", match: { id: ln.id }, row: { elegida: true } });
    }
    const iva = round2(sub * 0.15);
    steps[0] = { op: "upsert", table: "erp_oc", match: { id: ocId }, row: { ...(steps[0] as { row: Row }).row, subtotal: round2(sub), iva, total: round2(sub + iva), saldo: round2(sub + iva) } };
    steps.push({ op: "upsert", table: "erp_rfq", match: { id: rfq.id }, row: { estado: "adjudicada" } });
    await applyPlan(db, actor, steps);
    return { ok: true, id: ocId, numero };
  }

  if (op === "stock_delta") {
    const moves = (body.moves as Row[]) || [];
    const steps: Step[] = [];
    for (const m of moves) {
      const delta = n(m.delta);
      if (!delta) continue;
      const p = porId.get(s(m.producto_id)) || porSku.get(skuCode(s(m.sku)));
      if (!p) continue;
      const bodegaId = s(m.bodega_id);
      if (!bodegaId) continue;
      steps.push({
        op: "move", producto_id: String(p.id), bodega_id: bodegaId, delta,
        tipo: s(m.tipo) || "ajuste", doc_tipo: s(m.doc_tipo) || "ticket", doc_id: s(m.doc_id) || undefined,
        ticket_ref: s(m.ticket_ref), nota: s(m.nota), aprobar_negativo: body.aprobar_negativo !== false,
        legacy_ref: s(m.legacy_ref) || undefined,
      });
    }
    if (steps.length) await applyPlan(db, actor, steps, now.toISOString(), "stock_delta");
    return { ok: true, n: steps.length };
  }

  if (op === "oc_save") {
    const lineasIn = (body.lineas as Row[]) || [];
    if (!lineasIn.length) return { error: "La OC no tiene líneas" };
    if (!s(body.proveedor_id)) return { error: "Falta el proveedor" };
    const ocs = await db.all("erp_oc");
    const ocId = s(body.id) || id();
    const prev = ocs.find((r) => r.id === ocId);
    const numero = prev ? s(prev.numero) : await numeroDoc(db, "next_oc_num", ocs, "OC");
    let sub = 0;
    const steps: Step[] = [];
    if (prev) {
      for (const old of (await db.all("erp_oc_lineas")).filter((r) => r.oc_id === ocId)) {
        steps.push({ op: "delete", table: "erp_oc_lineas", match: { id: old.id } });
      }
    }
    let i = 0;
    for (const ln of lineasIn) {
      const p = porId.get(s(ln.producto_id)) || porSku.get(skuCode(s(ln.sku)));
      if (!p) return { error: "Producto no está en el catálogo: " + s(ln.sku || ln.producto_id) };
      const neto = lineNet(n(ln.cantidad), n(ln.precio), n(ln.descuento_pct));
      sub += neto;
      steps.push({ op: "upsert", table: "erp_oc_lineas", match: { id: s(ln.id) || id() }, row: {
        oc_id: ocId, producto_id: p.id, cantidad: n(ln.cantidad), precio: n(ln.precio), descuento_pct: n(ln.descuento_pct),
        bodega_id: s(ln.bodega_id) || s(body.bodega_destino_id) || null, subtotal: neto, recibido: n(ln.recibido), plazo: s(ln.plazo), orden: i++,
      } });
    }
    const iva = round2(sub * 0.15);
    const total = round2(sub + iva + n(body.flete));
    steps.unshift({ op: "upsert", table: "erp_oc", match: { id: ocId }, row: {
      numero, proveedor_id: s(body.proveedor_id), fecha: s(body.fecha) || ecuadorParts(now).ymd,
      fecha_esperada: s(body.fecha_esperada), bodega_destino_id: s(body.bodega_destino_id) || venta?.id || null,
      estado: s(body.estado) || "abierta", subtotal: round2(sub), iva, flete: n(body.flete), total,
      pagado: n(prev?.pagado), saldo: round2(total - n(prev?.pagado)), estado_pago: n(prev?.pagado) <= 0 ? "pendiente" : s(prev?.estado_pago),
      nota: s(body.nota), creado_por: actor,
      tipo: s(body.tipo) || s(prev?.tipo) || "compra",
      q_label: s(body.q_label || prev?.q_label),
      snap: body.snap ?? prev?.snap ?? null,
    } });
    await applyPlan(db, actor, steps);
    return { ok: true, id: ocId, numero, total };
  }

  if (op === "oc_cancel") {
    const o = (await db.all("erp_oc")).find((r) => r.id === body.id);
    if (!o) return { error: "OC no encontrada" };
    const rec = (await db.all("erp_oc_lineas")).filter((r) => r.oc_id === o.id).reduce((a, r) => a + n(r.recibido), 0);
    if (rec > 0) return { error: "Ya tiene recepciones. Deshaz la recepción antes de cancelar." };
    await applyPlan(db, actor, [{ op: "upsert", table: "erp_oc", match: { id: o.id }, row: { estado: "cancelada" } }]);
    return { ok: true };
  }

  if (op === "oc_recibir") {
    const o = (await db.all("erp_oc")).find((r) => r.id === body.oc_id);
    if (!o) return { error: "OC no encontrada" };
    if (s(o.estado) === "cancelada") return { error: "OC cancelada" };
    const pedidas = (await db.all("erp_oc_lineas")).filter((r) => r.oc_id === o.id);
    const ins = (body.lineas as Row[]) || [];
    if (!ins.length) return { error: "Indica qué se recibe" };
    const recId = id();
    const receps = await db.all("erp_recepciones");
    const numero = num(receps, "REC", enPrueba(db));
    const steps: Step[] = [{ op: "upsert", table: "erp_recepciones", match: { id: recId }, row: {
      oc_id: o.id, numero, fecha: now.toISOString(), recibido_por: actor, factura_prov: s(body.factura_prov), nota: s(body.nota), anulada: false,
    } }];
    const sumar = new Map<string, number>();
    for (const ln of ins) {
      const ol = pedidas.find((r) => r.id === ln.oc_linea_id);
      if (!ol) return { error: "Línea de OC no existe" };
      const q = n(ln.cantidad);
      if (!(q > 0)) continue;
      if (n(ol.recibido) + q > n(ol.cantidad) + 1e-9) return { error: `Recibes más de lo pedido (pedido ${ol.cantidad}, ya recibido ${ol.recibido})` };
      const p = porId.get(String(ol.producto_id));
      if (!p) return { error: "Producto no existe" };
      let bodegaId = s(ln.bodega_id) || s(ol.bodega_id) || s(o.bodega_destino_id);
      if (!bodegaId && s(p.uso) === "cabina") bodegaId = String(cabina?.id || "");
      if (!bodegaId && s(p.uso) === "venta") bodegaId = String(venta?.id || "");
      if (!bodegaId) return { error: `Elige bodega para ${s(p.sku)} (uso ambos)` };
      const b = bod.get(bodegaId);
      if (!b) return { error: "Bodega no existe" };
      if (!usoCompatible(s(p.uso), s(b.tipo))) return { error: `Producto de uso ${s(p.uso)} no puede ir a bodega ${s(b.tipo)}` };
      steps.push({ op: "upsert", table: "erp_recepcion_lineas", match: { id: id() }, row: {
        recepcion_id: recId, oc_linea_id: ol.id, producto_id: p.id, bodega_id: bodegaId,
        lote: s(ln.lote), caducidad: s(ln.caducidad) || null, cantidad: q, costo_unit: n(ol.precio),
      } });
      steps.push({
        op: "move", producto_id: String(p.id), bodega_id: bodegaId, delta: q, tipo: "recepcion",
        doc_tipo: "recepcion", doc_id: recId, costo_unit: n(ol.precio), lote: s(ln.lote), nota: numero,
      });
      sumar.set(String(ol.id), (sumar.get(String(ol.id)) || 0) + q);
    }
    let todas = true;
    let alguna = false;
    for (const ol of pedidas) {
      const rec = n(ol.recibido) + (sumar.get(String(ol.id)) || 0);
      if (rec > 0) alguna = true;
      if (rec + 1e-9 < n(ol.cantidad)) todas = false;
      steps.push({ op: "upsert", table: "erp_oc_lineas", match: { id: ol.id }, row: { recibido: round4(rec) } });
    }
    const estado = todas && alguna ? "recibida" : alguna ? "parcial" : s(o.estado);
    steps.push({ op: "upsert", table: "erp_oc", match: { id: o.id }, row: { estado } });
    await applyPlan(db, actor, steps, now.toISOString(), "oc_recibir");
    await alertarMinimos(db, actor);
    return { ok: true, id: recId, numero, estado };
  }

  if (op === "oc_recibir_undo") {
    const rec = (await db.all("erp_recepciones")).find((r) => r.id === body.recepcion_id);
    if (!rec) return { error: "Recepción no existe" };
    if (rec.anulada === true) return { error: "Ya estaba deshecha" };
    const lns = (await db.all("erp_recepcion_lineas")).filter((r) => r.recepcion_id === rec.id);
    const ols = await db.all("erp_oc_lineas");
    const steps: Step[] = [];
    for (const ln of lns) {
      steps.push({
        op: "move", producto_id: String(ln.producto_id), bodega_id: String(ln.bodega_id), delta: -n(ln.cantidad),
        tipo: "anulacion", doc_tipo: "recepcion", doc_id: String(rec.id), nota: "deshacer " + s(rec.numero),
        aprobar_negativo: !!body.aprobar_negativo, lote: s(ln.lote),
      });
      const ol = ols.find((r) => r.id === ln.oc_linea_id);
      if (ol) steps.push({ op: "upsert", table: "erp_oc_lineas", match: { id: ol.id }, row: { recibido: round4(Math.max(0, n(ol.recibido) - n(ln.cantidad))) } });
    }
    steps.push({ op: "upsert", table: "erp_recepciones", match: { id: rec.id }, row: { anulada: true } });
    await applyPlan(db, actor, steps, now.toISOString());
    const o = (await db.all("erp_oc")).find((r) => r.id === rec.oc_id);
    if (o) {
      const nuevas = (await db.all("erp_oc_lineas")).filter((r) => r.oc_id === o.id);
      const alguna = nuevas.some((r) => n(r.recibido) > 0);
      const todas = nuevas.every((r) => n(r.recibido) + 1e-9 >= n(r.cantidad)) && alguna;
      const estado = todas ? "recibida" : alguna ? "parcial" : "abierta";
      await applyPlan(db, actor, [{ op: "upsert", table: "erp_oc", match: { id: o.id }, row: { estado } }]);
    }
    return { ok: true };
  }

  if (op === "trf_save" || op === "trf_enviar") {
    const lineasIn = (body.lineas as Row[]) || [];
    if (!lineasIn.length) return { error: "Sin líneas" };
    const origen = s(body.origen_id);
    const destino = s(body.destino_id);
    const bo = bod.get(origen);
    const bd = bod.get(destino);
    const permiso = puedeTransferir(s(body._rol), bo, bd);
    if (permiso) return { error: permiso };
    const trs = await db.all("erp_transferencias");
    const tid = s(body.id) || id();
    const numero = s(trs.find((r) => r.id === tid)?.numero) || num(trs, "TRF", enPrueba(db));
    const inmediata = op === "trf_enviar" && body.inmediata === true;
    const steps: Step[] = [{ op: "upsert", table: "erp_transferencias", match: { id: tid }, row: {
      numero, origen_id: origen, destino_id: destino, estado: op === "trf_enviar" ? (inmediata ? "recibida" : "enviada") : "borrador",
      fecha: now.toISOString(), creado_por: actor, recibido_por: inmediata ? actor : "", nota: s(body.nota),
    } }];
    const paraConsumo: Row[] = [];
    for (const ln of lineasIn) {
      const p = porId.get(s(ln.producto_id)) || porSku.get(skuCode(s(ln.sku)));
      if (!p) return { error: "Producto no existe" };
      const cant = n(ln.cantidad);
      if (!(cant > 0)) return { error: "La cantidad tiene que ser mayor que cero" };
      const lid = id();
      steps.push({ op: "upsert", table: "erp_transferencia_lineas", match: { id: lid }, row: { transferencia_id: tid, producto_id: p.id, lote: s(ln.lote), cantidad: cant } });
      if (op === "trf_enviar") {
        if (bo && !usoCompatible(s(p.uso), s(bo.tipo))) return { error: `Producto de uso ${s(p.uso)} no puede salir de ${s(bo.tipo)}` };
        if (bd && !usoCompatible(s(p.uso), s(bd.tipo))) return { error: `Producto de uso ${s(p.uso)} no puede ir a bodega ${s(bd.tipo)}` };
        steps.push({ op: "move", producto_id: String(p.id), bodega_id: origen, delta: -cant, tipo: "transferencia_out", doc_tipo: "transferencia", doc_id: tid, lote: s(ln.lote), aprobar_negativo: !!body.aprobar_negativo, nota: numero });
        if (inmediata && bd) {
          steps.push({ op: "move", producto_id: String(p.id), bodega_id: destino, delta: cant, tipo: "transferencia_in", doc_tipo: "transferencia", doc_id: tid, lote: s(ln.lote), nota: numero });
          paraConsumo.push({ producto_id: p.id, sku: p.sku, cantidad: cant, costo: p.costo_promedio });
        }
      }
    }
    if (inmediata && bd) steps.push(...pasosConsumoCabina(bd, paraConsumo, tid, numero, actor, now));
    await applyPlan(db, actor, steps, now.toISOString());
    const consumo = inmediata && bd && s(bd.tipo) === "cabina" && paraConsumo.some((ln) => familiaSku(s(ln.sku)));
    return { ok: true, id: tid, numero, inmediata, consumo: !!consumo };
  }
  if (op === "trf_recibir") {
    const t = (await db.all("erp_transferencias")).find((r) => r.id === body.id);
    if (!t) return { error: "Transferencia no existe" };
    if (s(t.estado) !== "enviada") return { error: "Solo se recibe una transferencia enviada" };
    const bd = bod.get(String(t.destino_id));
    const lns = (await db.all("erp_transferencia_lineas")).filter((r) => r.transferencia_id === t.id);
    const steps: Step[] = [{ op: "upsert", table: "erp_transferencias", match: { id: t.id }, row: { estado: "recibida", recibido_por: actor } }];
    const paraConsumo: Row[] = [];
    for (const ln of lns) {
      const p = porId.get(String(ln.producto_id));
      steps.push({ op: "move", producto_id: String(ln.producto_id), bodega_id: String(t.destino_id), delta: n(ln.cantidad), tipo: "transferencia_in", doc_tipo: "transferencia", doc_id: String(t.id), lote: s(ln.lote), nota: s(t.numero) });
      paraConsumo.push({ producto_id: ln.producto_id, sku: s(p?.sku), cantidad: n(ln.cantidad), costo: p?.costo_promedio });
    }
    if (bd) steps.push(...pasosConsumoCabina(bd, paraConsumo, String(t.id), s(t.numero), actor, now));
    await applyPlan(db, actor, steps, now.toISOString());
    return { ok: true };
  }

  if (op === "conteo_abrir") {
    const bid = s(body.bodega_id);
    if (!bod.get(bid)) return { error: "Bodega no existe" };
    const cts = await db.all("erp_conteos");
    const cid = id();
    const numero = num(cts, "CNT", enPrueba(db));
    const stock = await db.all("erp_stock");
    const steps: Step[] = [{ op: "upsert", table: "erp_conteos", match: { id: cid }, row: { numero, bodega_id: bid, estado: "abierto", fecha: now.toISOString(), creado_por: actor, nota: s(body.nota) } }];
    for (const p of productos) {
      if (s(p.clase) && s(p.clase) !== "producto") continue;
      if (!usoCompatible(s(p.uso), s(bod.get(bid)?.tipo))) continue;
      const sistema = stock.filter((r) => r.producto_id === p.id && r.bodega_id === bid).reduce((a, r) => a + n(r.cantidad), 0);
      steps.push({ op: "upsert", table: "erp_conteo_lineas", match: { conteo_id: cid, producto_id: p.id, lote: "" }, row: { sistema: round4(sistema), contado: null } });
    }
    await applyPlan(db, actor, steps);
    return { ok: true, id: cid, numero };
  }
  if (op === "conteo_get") {
    const c = (await db.all("erp_conteos")).find((r) => r.id === body.conteo_id || r.numero === body.numero);
    if (!c) return { error: "Conteo no existe" };
    const lns = (await db.all("erp_conteo_lineas")).filter((r) => r.conteo_id === c.id);
    const b = bod.get(String(c.bodega_id));
    return { ok: true, id: c.id, numero: c.numero, estado: c.estado, bodega_id: c.bodega_id, bodega: s(b?.nombre), tipo: s(b?.tipo), nota: s(c.nota), lineas: lns.map((ln) => {
      const p = porId.get(String(ln.producto_id));
      return { producto_id: ln.producto_id, sku: s(p?.sku), nombre: s(p?.nombre), sistema: ln.sistema, contado: ln.contado == null || ln.contado === "" ? null : n(ln.contado), lote: s(ln.lote) };
    }) };
  }
  if (op === "conteo_guardar") {
    const steps: Step[] = [];
    for (const ln of (body.lineas as Row[]) || []) {
      if (ln.contado == null || s(ln.contado) === "") continue;
      if (n(ln.contado) < 0) return { error: "La cantidad contada no puede ser negativa" };
      steps.push({ op: "upsert", table: "erp_conteo_lineas", match: { conteo_id: s(body.conteo_id), producto_id: s(ln.producto_id), lote: s(ln.lote) }, row: { contado: n(ln.contado) } });
    }
    if (!steps.length) return { error: "Escribe cuántos hay" };
    await applyPlan(db, actor, steps);
    return { ok: true };
  }
  if (op === "conteo_aplicar") {
    const c = (await db.all("erp_conteos")).find((r) => r.id === body.conteo_id);
    if (!c) return { error: "Conteo no existe" };
    if (s(c.estado) === "aplicado") return { error: "Ya estaba aplicado" };
    const lns = (await db.all("erp_conteo_lineas")).filter((r) => r.conteo_id === c.id && r.contado != null && r.contado !== "");
    if (!lns.length) return { error: "Todavía no hay cantidades contadas. Lo que no contaste no se mueve." };
    const stock = await db.all("erp_stock");
    const aj = id();
    const numero = num(await db.all("erp_ajustes"), "AJU", enPrueba(db));
    const steps: Step[] = [{ op: "upsert", table: "erp_ajustes", match: { id: aj }, row: { numero, bodega_id: c.bodega_id, motivo: "conteo", nota: s(c.numero), creado_por: actor, fecha: now.toISOString() } }];
    for (const ln of lns) {
      const hay = stock.filter((r) => r.producto_id === ln.producto_id && r.bodega_id === c.bodega_id && s(r.lote) === s(ln.lote)).reduce((a, r) => a + n(r.cantidad), 0);
      const delta = round4(n(ln.contado) - hay);
      if (Math.abs(delta) < 1e-9) continue;
      steps.push({ op: "move", producto_id: String(ln.producto_id), bodega_id: String(c.bodega_id), delta, tipo: "conteo", doc_tipo: "conteo", doc_id: String(c.id), lote: s(ln.lote), aprobar_negativo: !!body.aprobar_negativo, nota: numero });
    }
    steps.push({ op: "upsert", table: "erp_conteos", match: { id: c.id }, row: { estado: "aplicado" } });
    await applyPlan(db, actor, steps, now.toISOString());
    return { ok: true, numero };
  }

  if (op === "ajuste_save") {
    const p = porId.get(s(body.producto_id)) || porSku.get(skuCode(s(body.sku)));
    if (!p) return { error: "Producto no existe" };
    const motivos = ["merma", "vencido", "dañado", "muestra", "conteo", "otro"];
    if (!motivos.includes(s(body.motivo))) return { error: "Motivo inválido" };
    if (!s(body.nota) && s(body.motivo) === "otro") return { error: "La nota es obligatoria" };
    const aj = id();
    const numero = num(await db.all("erp_ajustes"), "AJU", enPrueba(db));
    const delta = n(body.delta);
    await applyPlan(db, actor, [
      { op: "upsert", table: "erp_ajustes", match: { id: aj }, row: { numero, bodega_id: s(body.bodega_id), motivo: s(body.motivo), nota: s(body.nota), creado_por: actor, fecha: now.toISOString() } },
      { op: "move", producto_id: String(p.id), bodega_id: s(body.bodega_id), delta, tipo: "ajuste", doc_tipo: "ajuste", doc_id: aj, aprobar_negativo: !!body.aprobar_negativo, nota: s(body.nota) || numero },
    ], now.toISOString());
    await alertarMinimos(db, actor);
    return { ok: true, numero };
  }

  if (op === "reorden_sugerir") {
    const stock = await db.all("erp_stock");
    const movs = await db.all("erp_movimientos");
    const dbMap = now.toISOString() >= CORTE_ERP ? await cortesVenta(db) : null;
    const ventaB = bodegaVentaDe(bodegas);
    const mins = await db.all("erp_producto_bodega");
    const ocs = await db.all("erp_oc");
    const sugerencias = [];
    for (const m of mins) {
      let q = stock.filter((r) => r.producto_id === m.producto_id && r.bodega_id === m.bodega_id).reduce((a, r) => a + n(r.cantidad), 0);
      if (ventaB && String(m.bodega_id) === String(ventaB.id) && now.toISOString() >= CORTE_ERP) {
        const p = porId.get(String(m.producto_id));
        q = saldoTrasCorte(skuCode(s(p?.sku)), String(m.producto_id), String(ventaB.id), movs, dbMap).saldo;
      } else if (q < 0 && now.toISOString() >= CORTE_ERP) q = 0;
      const punto = n(m.punto_reorden) || n(m.stock_min);
      if (q <= punto) {
        const p = porId.get(String(m.producto_id));
        const ultima = ocs.find((o) => o.proveedor_id);
        sugerencias.push({
          sku: s(p?.sku), nombre: s(p?.nombre), bodega_id: m.bodega_id, stock: round4(q), punto,
          pedir: round4(Math.max(punto * 2 - q, punto - q, 1)), proveedor_id: ultima?.proveedor_id || null,
        });
      }
    }
    return { ok: true, sugerencias };
  }

  if (op === "ov_save" || op === "ticket_aplicar") {
    return await vender(db, actor, body, now, porId, porSku, venta, cabina);
  }
  if (op === "ov_anular") {
    const ov = (await db.all("erp_ordenes_venta")).find((r) => r.id === body.id || r.numero === body.numero || r.ticket_ref === body.ticket_ref);
    if (!ov) return { error: "Orden de venta no existe" };
    if (s(ov.estado) === "anulada") return { ok: true, sinCambios: true };
    const movs = (await db.all("erp_movimientos")).filter((r) => r.doc_id === ov.id && s(r.tipo) !== "anulacion");
    const steps: Step[] = movs.map((r) => ({
      op: "move" as const, producto_id: String(r.producto_id), bodega_id: String(r.bodega_id), delta: -n(r.delta),
      tipo: "anulacion", doc_tipo: "ov", doc_id: String(ov.id), ticket_ref: s(ov.ticket_ref), nota: "anular " + s(ov.numero),
      aprobar_negativo: true, legacy_ref: "anul:" + s(r.id),
    }));
    steps.push({ op: "upsert", table: "erp_ordenes_venta", match: { id: ov.id }, row: { estado: "anulada" } });
    const refAnula = s(ov.ticket_ref);
    if (refAnula) {
      const tk = (await db.all("tickets")).find((r) => r.orig && typeof r.orig === "object" && s((r.orig as Row).ticket_ref) === refAnula);
      if (tk && tk.id != null) {
        steps.push({ op: "upsert", table: "tickets", match: { id: tk.id }, row: {
          atendido_por: "",
          orig: { ...(tk.orig as Row), anulado: true },
        } });
      }
    }
    await applyPlan(db, actor, steps, now.toISOString(), "ov_anular");
    return { ok: true };
  }

  if (op === "pago_save") {
    const o = (await db.all("erp_oc")).find((r) => r.id === body.oc_id || r.id === body.id || r.numero === body.numero);
    if (!o) return { error: "OC no encontrada" };
    if (s(o.estado) === "cancelada") return { error: "OC cancelada" };
    const monto = n(body.monto);
    if (!(monto > 0)) return { error: "Indica el monto del pago" };
    const pagado = round2(n(o.pagado) + monto);
    const total = n(o.total);
    if (pagado > total + 0.009) return { error: "El pago supera el saldo" };
    const saldo = round2(total - pagado);
    const estado_pago = pagado + 0.009 >= total && total > 0 ? "pagada" : pagado > 0 ? "parcial" : "pendiente";
    await applyPlan(db, actor, [{ op: "upsert", table: "erp_oc", match: { id: o.id }, row: { pagado, saldo, estado_pago } }], now.toISOString(), "pago_save");
    return { ok: true, id: o.id, pagado, saldo, estado_pago };
  }

  if (op === "oc_devolver") {
    const o = (await db.all("erp_oc")).find((r) => r.id === body.oc_id || r.id === body.id);
    if (!o) return { error: "OC no encontrada" };
    if (s(o.estado) === "cancelada") return { error: "OC cancelada" };
    const pedidas = (await db.all("erp_oc_lineas")).filter((r) => r.oc_id === o.id);
    const ins = (body.lineas as Row[]) || [];
    if (!ins.length) return { error: "Indica qué se devuelve" };
    const steps: Step[] = [];
    const restar = new Map<string, number>();
    for (const ln of ins) {
      const ol = pedidas.find((r) => r.id === ln.oc_linea_id);
      if (!ol) return { error: "Línea de OC no existe" };
      const q = n(ln.cantidad);
      if (!(q > 0)) continue;
      if (n(ol.recibido) + 1e-9 < (restar.get(String(ol.id)) || 0) + q) return { error: "Devuelves más de lo recibido" };
      const p = porId.get(String(ol.producto_id));
      if (!p) return { error: "Producto no existe" };
      const bodegaId = s(ln.bodega_id) || s(ol.bodega_id) || s(o.bodega_destino_id);
      if (!bodegaId || !bod.get(bodegaId)) return { error: "Elige la bodega de la devolución" };
      steps.push({
        op: "move", producto_id: String(p.id), bodega_id: bodegaId, delta: -q, tipo: "devolucion",
        doc_tipo: "oc", doc_id: String(o.id), nota: "devolver " + s(o.numero),
        aprobar_negativo: !!body.aprobar_negativo, lote: s(ln.lote),
      });
      restar.set(String(ol.id), (restar.get(String(ol.id)) || 0) + q);
    }
    if (!restar.size) return { error: "Indica qué se devuelve" };
    for (const ol of pedidas) {
      const rec = Math.max(0, n(ol.recibido) - (restar.get(String(ol.id)) || 0));
      steps.push({ op: "upsert", table: "erp_oc_lineas", match: { id: ol.id }, row: { recibido: round4(rec) } });
    }
    await applyPlan(db, actor, steps, now.toISOString());
    const nuevas = (await db.all("erp_oc_lineas")).filter((r) => r.oc_id === o.id);
    const alguna = nuevas.some((r) => n(r.recibido) > 0);
    const todas = nuevas.every((r) => n(r.recibido) + 1e-9 >= n(r.cantidad)) && alguna;
    const estado = todas ? "recibida" : alguna ? "parcial" : "abierta";
    await applyPlan(db, actor, [{ op: "upsert", table: "erp_oc", match: { id: o.id }, row: { estado } }]);
    return { ok: true, estado };
  }

  if (op === "refs") {
    const pid = s(body.producto_id);
    const ocl = (await db.all("erp_oc_lineas")).filter((r) => r.producto_id === pid);
    const ocs = await db.all("erp_oc");
    const historial = ocl.slice(-8).map((ln) => {
      const o = ocs.find((r) => r.id === ln.oc_id);
      return { tipo: "OC", n: s(o?.numero), f: s(o?.fecha), q: ln.cantidad, p: ln.precio };
    });
    return { ok: true, historial };
  }

  return { error: "Operación ERP desconocida: " + op };
}

async function vender(db: Db, actor: string, body: Row, now: Date, porId: Map<string, Row>, porSku: Map<string, Row>, venta: Row | undefined, cabina: Row | undefined): Promise<Row> {
  const ticketRef = s(body.ticket_ref) || s(body.ticket);
  const ya = (await db.all("erp_tickets_procesados")).filter((r) => r.ticket_ref === ticketRef && ticketRef);
  if (ticketRef && ya.length && ya.every((r) => s(r.estado) === "ok")) return { ok: true, sinCambios: true, ticket_ref: ticketRef };
  const lineas = (body.lineas as Row[]) || [];
  if (!lineas.length) return { error: "El ticket no tiene líneas" };
  if (!venta) return { error: "Falta la bodega Venta. Aplica 0009_erp_permisos.sql." };
  const ovs = await db.all("erp_ordenes_venta");
  const ovId = id();
  const numero = enPrueba(db) ? siguienteTestDoc(ovs, "OV") : elegirNumeroOv(ovs, s(body.numero));
  const ref = ticketRef || numero;
  const steps: Step[] = [];
  let sub = 0;
  const ec = ecuadorParts(now);
  const ticketCols: Row = { orig: {} as Row };
  for (const ln of lineas) {
    const clase = s(ln.clase || ln.tipo) || "producto";
    const p = porId.get(s(ln.producto_id)) || porSku.get(skuCode(s(ln.sku)));
    const cant = n(ln.cantidad || ln.cant || 1);
    const precio = n(ln.precio || ln.precio_venta || p?.precio_venta);
    const neto = lineNet(cant, precio, n(ln.descuento_pct));
    sub += neto;
    const lid = id();
    steps.push({ op: "upsert", table: "erp_ov_lineas", match: { id: lid }, row: {
      ov_id: ovId, producto_id: p?.id || null, sku: s(ln.sku || p?.sku), nombre: s(ln.nombre || p?.nombre),
      cantidad: cant, precio, descuento_pct: n(ln.descuento_pct), subtotal: neto, clase, bodega_id: clase === "servicio" ? cabina?.id : venta.id,
    } });
    const lineaRef = s(ln.linea_ref) || s(ln.sku || p?.sku) || lid;
    if (clase === "servicio") {
      const skuTxt = s(ln.sku || p?.sku);
      if (facialSku(skuTxt)) ticketCols.facial_hecho = skuTxt;
      const serv = (await db.all("erp_servicios")).find((r) => skuCode(s(r.codigo)) === skuCode(s(ln.sku)) || r.id === ln.servicio_id);
      const receta = serv ? (await db.all("erp_receta")).filter((r) => r.servicio_id === serv.id) : [];
      if (cabina && receta.length) {
        for (const rc of receta) {
          steps.push({
            op: "move", producto_id: String(rc.producto_id), bodega_id: String(cabina.id), delta: -n(rc.cantidad) * cant,
            tipo: "consumo_cabina", doc_tipo: "ov", doc_id: ovId, ticket_ref: ref, aprobar_negativo: !!body.aprobar_negativo,
            nota: numero, legacy_ref: `tk:${ref}:${lineaRef}:${rc.producto_id}`,
          });
        }
      }
      steps.push({ op: "upsert", table: "erp_tickets_procesados", match: { ticket_ref: ref, linea_ref: lineaRef }, row: { tipo: "servicio", estado: "ok" } });
    } else if (p && s(p.clase) !== "servicio") {
      if (!usoCompatible(s(p.uso), "venta") && s(p.uso) !== "ambos") {
        return { error: `${s(p.sku)} es de uso ${s(p.uso)} y no se vende en Venta` };
      }
      steps.push({
        op: "move", producto_id: String(p.id), bodega_id: String(venta.id), delta: -cant,
        tipo: "venta", doc_tipo: "ov", doc_id: ovId, ticket_ref: ref, aprobar_negativo: !!body.aprobar_negativo,
        nota: numero, legacy_ref: `tk:${ref}:${lineaRef}`,
      });
      const col = prodCol(s(p.sku));
      if (col) ticketCols[col.col] = cant;
      (ticketCols.orig as Row)[s(p.sku)] = cant;
      steps.push({ op: "upsert", table: "erp_tickets_procesados", match: { ticket_ref: ref, linea_ref: lineaRef }, row: { tipo: "venta", estado: "ok" } });
    }
  }
  const iva = round2(sub * 0.15);
  const total = round2(sub + iva);
  const ident = await asignarTicketBeta(db, now);
  try { await backfillSO(db, actor); } catch { /* la serie local sigue si la tabla no acepta el update */ }
  const soNum = await tomarNumero(db, "TK-SO", await db.all("tickets"), "so_num");
  const atendido = nombreDeActor(s(body.cosmetologa) || s(body.atendido_por) || actor);
  const orig = ticketCols.orig as Row;
  orig.ticket_ref = ref;
  orig.ov = numero;
  orig.fuente = "ov_save";
  orig.beta = true;
  orig.so_num = soNum;
  steps.push({ op: "upsert", table: "tickets", match: { beta_num: ident.beta_num }, row: {
    sheet_row: null,
    origin: ident.origin,
    beta_num: ident.beta_num,
    so_num: soNum,
    timestamp: ec.isoWall,
    atendido_por: atendido,
    id_3: s(body.cedula),
    nombre: s(body.nombre),
    apellido: s(body.apellido),
    estimado: total,
    notas_generales: s(body.notas),
    facial_hecho: s(ticketCols.facial_hecho),
    ...colsTicket(ticketCols),
    orig,
  } });
  steps.unshift({ op: "upsert", table: "erp_ordenes_venta", match: { id: ovId }, row: {
    numero, ticket_ref: ref, cliente_id: s(body.cliente_id) || null, cedula: s(body.cedula),
    nombre: (s(body.nombre) + " " + s(body.apellido)).trim(), fecha: ec.isoWall, estado: "despachada",
    subtotal: round2(sub), iva, total, bodega_id: venta.id, nota: s(body.notas), creado_por: actor,
  } });
  const applied = await applyPlan(db, actor, steps, now.toISOString(), "ov_save");
  const numeroFinal = s(applied.numero) || numero;
  const refFinal = ticketRef || numeroFinal;
  await alertarMinimos(db, actor);
  return { ok: true, id: ovId, numero: numeroFinal, ticket_ref: refFinal, total, subtotal: round2(sub), iva, ticketCols };
}

async function alertarMinimos(db: Db, actor: string): Promise<void> {
  const stock = await db.all("erp_stock");
  const mins = await db.all("erp_producto_bodega");
  const avisos = await db.all("erp_avisos");
  const prods = await db.all("erp_productos");
  const bods = await db.all("erp_bodegas");
  for (const m of mins) {
    const q = stock.filter((r) => r.producto_id === m.producto_id && r.bodega_id === m.bodega_id).reduce((a, r) => a + n(r.cantidad), 0);
    if (q > n(m.stock_min)) continue;
    const ref = String(m.producto_id) + "|" + String(m.bodega_id);
    if (avisos.some((a) => a.ref === ref && s(a.estado) !== "cerrado")) continue;
    const p = prods.find((r) => r.id === m.producto_id);
    const b = bods.find((r) => r.id === m.bodega_id);
    await db.write(actor, "erp_avisos", "insert", {}, {
      tipo: "bajo_minimo", ref, texto: `${s(p?.sku)} ${s(p?.nombre)} en ${s(b?.nombre)} quedó en ${round4(q)} (mínimo ${n(m.stock_min)})`,
      destino: "inventario", estado: "abierto",
    });
  }
}

export function erpSeed(): Record<string, Row[]> {
  const ventaP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const cabinaP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
  const ambosP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
  const prov = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
  return {
    erp_locales: [
      { id: LOCAL_ESQUINA, codigo: "ESQUINA", nombre: "La Esquina", direccion: "C.C. La Esquina, Cumbayá", activo: true },
    ],
    erp_bodegas: [
      { id: BODEGA_CASA, codigo: "CASA", nombre: "Casa", tipo: "casa", activo: true, local_id: null, orden: 0 },
      { id: BODEGA_VENTA, codigo: "VENTA", nombre: "Venta", tipo: "venta", activo: true, local_id: LOCAL_ESQUINA, orden: 1 },
      { id: BODEGA_CABINA, codigo: "CABINA", nombre: "Cabina 1", tipo: "cabina", activo: true, local_id: LOCAL_ESQUINA, orden: 2 },
      { id: BODEGA_CABINA_2, codigo: "CAB2", nombre: "Cabina 2", tipo: "cabina", activo: true, local_id: LOCAL_ESQUINA, orden: 3 },
      { id: BODEGA_CABINA_3, codigo: "CAB3", nombre: "Cabina 3", tipo: "cabina", activo: true, local_id: LOCAL_ESQUINA, orden: 4 },
    ],
    erp_productos: [
      { id: ventaP, sku: "HT-002", nombre: "Crema retail", uso: "venta", clase: "producto", precio_venta: 20, costo_promedio: 8, activo: true },
      { id: cabinaP, sku: "CB-001", nombre: "Ampolla cabina", uso: "cabina", clase: "producto", precio_venta: 0, costo_promedio: 3, activo: true },
      { id: ambosP, sku: "AB-001", nombre: "Aceite ambos", uso: "ambos", clase: "producto", precio_venta: 15, costo_promedio: 5, activo: true },
    ],
    erp_producto_bodega: [
      { producto_id: ventaP, bodega_id: BODEGA_VENTA, stock_min: 2, punto_reorden: 4 },
    ],
    erp_proveedores: [{ id: prov, nombre: "Proveedor Demo", ruc: "1790000000001", activo: true }],
    erp_clientes: [{ id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", nombre: "María", apellido: "Paz", cedula: "1712345678" }],
    erp_servicios: [{ id: "ssssssss-ssss-4sss-8sss-sssssssssss1", codigo: "SUNSU-01", nombre: "Limpieza", activo: true }],
    erp_receta: [{ servicio_id: "ssssssss-ssss-4sss-8sss-sssssssssss1", producto_id: cabinaP, cantidad: 2, unidad: "ml" }],
    erp_stock: [
      { id: "st1", producto_id: ventaP, bodega_id: BODEGA_VENTA, sububicacion: "", lote: "", cantidad: 5 },
      { id: "st2", producto_id: cabinaP, bodega_id: BODEGA_CABINA, sububicacion: "", lote: "", cantidad: 10 },
      { id: "st3", producto_id: ambosP, bodega_id: BODEGA_VENTA, sububicacion: "", lote: "", cantidad: 4 },
    ],
    erp_movimientos: [],
    erp_oc: [], erp_oc_lineas: [], erp_recepciones: [], erp_recepcion_lineas: [],
    erp_rfq: [], erp_rfq_prov: [], erp_rfq_lineas: [],
    erp_transferencias: [], erp_transferencia_lineas: [],
    erp_conteos: [], erp_conteo_lineas: [], erp_ajustes: [], erp_consignacion_consumo: [],
    erp_ordenes_venta: [], erp_ov_lineas: [], erp_tickets_procesados: [], erp_avisos: [],
  };
}

export const SEED_IDS = {
  venta: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  cabina: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  ambos: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  prov: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  servicio: "ssssssss-ssss-4sss-8sss-sssssssssss1",
};
