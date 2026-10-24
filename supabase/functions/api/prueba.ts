// Modo prueba: la sesión ve datos reales + filas origin=test.
// El stock de pantalla es el real más los deltas de prueba. erp_stock no se escribe.
// Fuera del modo, all() esconde origin=test. La purga corre sobre la base cruda.

import { enPrueba, type Db } from "./db.ts";
import { n, round2, s, siguienteTestDoc, type Row } from "./domain.ts";
import { logAccion } from "./lib.ts";
import { saldoGift } from "./ventas.ts";

const TABLAS = [
  "tickets", "erp_ordenes_venta", "erp_ov_lineas", "cotizaciones",
  "erp_oc", "erp_oc_lineas", "erp_recepciones", "erp_recepcion_lineas",
  "erp_movimientos", "gift_card_movimientos", "gift_cards", "clientas_registro",
  "asistencia_marcajes", "asistencia_auditoria", "permisos", "paquetes",
  "erp_rfq", "erp_rfq_lineas", "erp_rfq_prov",
  "erp_transferencias", "erp_transferencia_lineas",
  "erp_conteos", "erp_conteo_lineas", "erp_ajustes", "erp_avisos",
  "erp_tickets_procesados", "erp_clientes", "erp_proveedores", "erp_productos",
  "log_acciones", "ordenes_compra", "caja_chica", "propinas", "multas_descuentos",
  "solicitudes_cambio", "audit_log", "catalogo",
  "proveedores", "inventario_entradas", "erp_locales", "erp_consignacion_consumo",
  "horarios", "horario_dias", "horario_descansos", "horario_deducciones", "horario_asignaciones",
  "app_archivos", "cabina_ordenes", "roles_aprobados", "historial_comisiones",
  "erp_stock",
];

function round4(x: number): number {
  return Math.round((x + Number.EPSILON) * 10000) / 10000;
}

function coincide(r: Row, match: Row): boolean {
  return Object.entries(match).every(([k, v]) => r[k] === v || String(r[k]) === String(v));
}

async function hojaNegativa(inner: Db, table: string): Promise<number> {
  const rows = await inner.all(table);
  let min = 0;
  for (const r of rows) {
    const v = Number(r.sheet_row);
    if (Number.isFinite(v)) min = Math.min(min, v);
  }
  return min - 1;
}

async function stockVirtual(inner: Db): Promise<Row[]> {
  const stock = (await inner.all("erp_stock")).filter((r) => s(r.origin) !== "test").map((r) => ({ ...r }));
  let movs: Row[] = [];
  try { movs = await inner.all("erp_movimientos"); } catch { movs = []; }
  const deltas = new Map<string, { pid: string; bid: string; sub: string; lote: string; delta: number }>();
  for (const m of movs) {
    if (s(m.origin) !== "test") continue;
    const pid = String(m.producto_id);
    const bid = String(m.bodega_id);
    const sub = s(m.sububicacion);
    const lote = s(m.lote);
    const k = [pid, bid, sub, lote].join("\u0000");
    const prev = deltas.get(k) || { pid, bid, sub, lote, delta: 0 };
    prev.delta = round4(prev.delta + n(m.delta));
    deltas.set(k, prev);
  }
  for (const d of deltas.values()) {
    const hit = stock.find((r) => String(r.producto_id) === d.pid && String(r.bodega_id) === d.bid && s(r.sububicacion) === d.sub && s(r.lote) === d.lote);
    if (hit) hit.cantidad = round4(n(hit.cantidad) + d.delta);
    else stock.push({ producto_id: d.pid, bodega_id: d.bid, sububicacion: d.sub, lote: d.lote, cantidad: d.delta, origin: "test" });
  }
  return stock;
}

async function giftVirtual(inner: Db): Promise<Row[]> {
  const cards = await inner.all("gift_cards");
  let movs: Row[] = [];
  try { movs = await inner.all("gift_card_movimientos"); } catch { movs = []; }
  const gastado = new Map<string, number>();
  for (const m of movs) {
    if (s(m.origin) !== "test") continue;
    const c = s(m.codigo).toLowerCase();
    if (!c) continue;
    gastado.set(c, round2((gastado.get(c) || 0) + n(m.monto)));
  }
  return cards.map((card) => {
    if (s(card.origin) === "test") return card;
    const g = gastado.get(s(card.codigo_gc).toLowerCase()) || 0;
    if (!(g > 0)) return card;
    const nuevo = round2(Math.max(0, saldoGift(card) - g));
    return { ...card, saldo: nuevo, usado: nuevo <= 0.009 };
  });
}

class VistaDb implements Db {
  prueba: boolean;
  inner: Db;
  private on: boolean;
  constructor(inner: Db, on: boolean) {
    this.inner = inner;
    this.on = on;
    this.prueba = on;
  }
  async all(table: string): Promise<Row[]> {
    if (!this.on) {
      const rows = await this.inner.all(table);
      return rows.filter((r) => s(r.origin) !== "test");
    }
    if (table === "erp_stock") return stockVirtual(this.inner);
    if (table === "gift_cards") return giftVirtual(this.inner);
    return this.inner.all(table);
  }
  async write(actor: string, table: string, op: "insert" | "update" | "delete", match: Row, row: Row | null): Promise<Row | null> {
    if (!this.on) return this.inner.write(actor, table, op, match, row);
    if (table === "erp_stock") {
      if (op === "delete") throw new Error("Modo prueba no borra datos reales");
      return { ...(row || {}), origin: "test" };
    }
    if (op === "insert") {
      const rec: Row = { ...(row || {}), origin: "test" };
      const sr = Number(rec.sheet_row);
      if (rec.sheet_row != null && rec.sheet_row !== "" && Number.isFinite(sr) && sr > 0) {
        rec.sheet_row = await hojaNegativa(this.inner, table);
      }
      if (table === "cotizaciones" && !s(rec.numero)) {
        rec.numero = siguienteTestDoc(await this.inner.all("cotizaciones"), "COT");
      }
      return this.inner.write(actor, table, "insert", {}, rec);
    }
    if (!match || !Object.keys(match).length) throw new Error("update/delete sin filtro");
    const rows = await this.inner.all(table);
    const hit = rows.find((r) => coincide(r, match));
    if (!hit) return null;
    if (s(hit.origin) !== "test") {
      if (op === "delete") throw new Error("Modo prueba no borra datos reales");
      return { ...hit };
    }
    if (op === "delete") return this.inner.write(actor, table, "delete", match, null);
    return this.inner.write(actor, table, "update", match, { ...(row || {}), origin: "test" });
  }
  async rpc(name: string, args: Row): Promise<unknown> {
    if (this.on) {
      if (name === "erp_tx") return null;
      if (name.startsWith("next_")) throw new Error("Modo prueba no usa la secuencia real");
    }
    return this.inner.rpc(name, args);
  }
}

export function ocultarPrueba(db: Db): Db {
  if (db instanceof VistaDb) return db;
  return new VistaDb(db, false);
}

export function activarPrueba(db: Db): Db {
  if (enPrueba(db)) return db;
  if (db instanceof VistaDb) return new VistaDb(unwrap(db), true);
  return new VistaDb(db, true);
}

export async function purgarPrueba(db: Db, actor: string): Promise<Row> {
  const base = unwrap(db);
  try {
    const raw = await base.rpc("prueba_purgar", { p_actor: actor });
    if (raw && typeof raw === "object") {
      const row = raw as Row;
      if (row.ok === true || row.borradas != null) return row;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const falta = /PGRST202|Could not find the function|schema cache|does not exist|prueba_purgar/i.test(msg);
    if (!falta) throw e instanceof Error ? e : new Error(msg);
  }
  const counts: Row = {};
  let total = 0;
  const names = new Set<string>(TABLAS);
  const mem = base as Db & { tables?: Map<string, Row[]> };
  if (mem.tables) for (const k of mem.tables.keys()) names.add(k);
  for (const table of names) {
    let rows: Row[] = [];
    try { rows = await base.all(table); } catch { continue; }
    let nDel = 0;
    if (table === "audit_log") continue;
    for (const r of rows) {
      if (s(r.origin) !== "test") continue;
      const match = r.id != null ? { id: r.id } : r.sheet_row != null && r.sheet_row !== "" ? { sheet_row: r.sheet_row } : null;
      if (!match) continue;
      try {
        await base.write(actor, table, "delete", match, null);
        nDel++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/kardex no se borra|no se borra/i.test(msg)) {
          throw new Error("Aplica 0016_modo_prueba.sql para borrar datos de prueba");
        }
        throw e;
      }
    }
    if (nDel) counts[table] = nDel;
    total += nDel;
  }
  await logAccion(base, actor, "PURGA PRUEBA", JSON.stringify(counts));
  return { ok: true, borradas: total, tablas: counts };
}

function unwrap(db: Db): Db {
  let cur = db;
  while (cur instanceof VistaDb) cur = cur.inner;
  return cur;
}
