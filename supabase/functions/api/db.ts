import type { Row } from "./domain.ts";
import { type Consulta, type Resultado, urlConsulta } from "./query.ts";

export interface Db {
  all(table: string): Promise<Row[]>;
  write(actor: string, table: string, op: "insert" | "update" | "delete", match: Row, row: Row | null): Promise<Row | null>;
  rpc(name: string, args: Row): Promise<unknown>;
  /** La vista de modo prueba. La base real no lo trae. */
  prueba?: boolean;
}

export function enPrueba(db: Db): boolean {
  return db.prueba === true;
}

export interface WriteLog { actor: string; table: string; op: string; match: Row; row: Row | null }

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

export interface MemSnap {
  tables: Map<string, Row[]>;
  writes: WriteLog[];
  seq: Map<string, number>;
}

export class MemoryDb implements Db {
  tables = new Map<string, Row[]>();
  writes: WriteLog[] = [];
  seq = new Map<string, number>();
  /** Si está puesto, la escritura que lo alcanza lanza y applyPlan revierte el plan. */
  failAfterWrites: number | null = null;
  rpcImpl: (name: string, args: Row) => Promise<unknown> = async () => null;

  snapshot(): MemSnap {
    const tables = new Map<string, Row[]>();
    for (const [k, v] of this.tables) tables.set(k, clone(v));
    return { tables, writes: clone(this.writes), seq: new Map(this.seq) };
  }
  restore(snap: MemSnap): void {
    this.tables = snap.tables;
    this.writes = clone(snap.writes);
    this.seq = new Map(snap.seq);
  }

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [k, rows] of Object.entries(seed)) this.tables.set(k, clone(rows));
  }
  async all(table: string): Promise<Row[]> {
    return clone(this.tables.get(table) || []);
  }
  async write(actor: string, table: string, op: "insert" | "update" | "delete", match: Row, row: Row | null): Promise<Row | null> {
    if (!actor) throw new Error("actor requerido");
    if (this.failAfterWrites != null && this.writes.length >= this.failAfterWrites) {
      throw new Error("fallo a mitad de plan");
    }
    this.writes.push({ actor, table, op, match: clone(match), row: row ? clone(row) : null });
    const list = this.tables.get(table) || [];
    this.tables.set(table, list);
    const matchFn = (r: Row) => Object.entries(match).every(([k, v]) => r[k] === v || String(r[k]) === String(v));
    if (op === "insert") {
      const id = (this.seq.get(table) || 0) + 1;
      this.seq.set(table, id);
      const rec: Row = { id, ...(row || {}) };
      if (table === "cotizaciones" && !rec.numero) {
        const n = (this.seq.get("cot_seq") || 0) + 1;
        this.seq.set("cot_seq", n);
        rec.numero = "COT-" + String(n).padStart(4, "0");
      }
      list.push(rec);
      return clone(rec);
    }
    const i = list.findIndex(matchFn);
    if (i < 0) return null;
    if (op === "delete") {
      const [gone] = list.splice(i, 1);
      return clone(gone);
    }
    list[i] = { ...list[i], ...(row || {}) };
    return clone(list[i]);
  }
  async rpc(name: string, args: Row): Promise<unknown> {
    return this.rpcImpl(name, args);
  }
}

/** Tablas que escribe app_beta_write (0045). */
export const BETA_TABLAS = new Set(["beta_portal_cuentas", "beta_portal_sesiones", "beta_portal_propuestas", "beta_conteos", "beta_conteo_lineas", "beta_notificaciones", "beta_transferencias", "beta_transferencia_lineas", "beta_ajustes", "beta_ajuste_lineas", "beta_stock", "beta_stock_movimientos", "beta_tickets", "beta_ticket_lineas", "beta_clientes", "beta_cliente_notas",
  "beta_acuity_calendars", "beta_citas_ticket", "beta_ticket_envios", "beta_ventas", "beta_venta_lineas", "beta_pagos", "beta_caja_movimientos", "beta_caja_cierres",
  "beta_paquetes", "beta_paquete_usos", "beta_gift_cards", "beta_gift_movimientos", "beta_permisos_usuario", "beta_ticket_flags", "beta_ticket_cancelados", "beta_aperturas", "beta_paquete_ajustes", "beta_multa_tipos", "beta_multas", "beta_cliente_documentos", "beta_credenciales", "beta_gift_ajustes", "beta_gift_documentos", "beta_cliente_alias", "beta_oc_cotizaciones", "beta_consig_restock", "beta_proveedores_ficha", "beta_actas", "beta_migo_facturas_vivo", "beta_migo_importes", "beta_cuadre_link", "beta_migo_borradores", "beta_rol_publicaciones", "beta_empleados", "beta_iess_descuentos", "beta_empleado_docs", "beta_roles", "beta_roles_log", "beta_asistencia_horas_mes", "beta_asistencia_horas_log", "beta_ticket_snaps", "beta_conteo_secciones", "beta_conteo_plan", "beta_conteo_zonas", "erp_sububicaciones", "beta_sububicaciones", "beta_promociones", "beta_consig_precios", "beta_rol_descuentos", "beta_rol_descuentos_log", "beta_rol_firmas"]);
export class SupabaseDb implements Db {
  private url: string;
  private key: string;
  private fetchImpl: typeof fetch;
  constructor(url: string, key: string, fetchImpl: typeof fetch = fetch) {
    this.url = url;
    this.key = key;
    this.fetchImpl = fetchImpl;
  }
  private headers(extra: Record<string, string> = {}) {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }
  async all(table: string): Promise<Row[]> {
    const out: Row[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const res = await this.fetchImpl(`${this.url}/rest/v1/${encodeURIComponent(table)}?select=*`, {
        headers: this.headers({ Range: `${from}-${from + page - 1}`, Prefer: "count=none" }),
      });
      if (!res.ok) throw new Error(`${table} ${res.status} ${await res.text()}`);
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error(`${table} no es una lista`);
      out.push(...rows);
      if (rows.length < page) break;
    }
    return out;
  }
  async consultar(table: string, q: Consulta): Promise<Resultado> {
    // Sin límite: PostgREST corta en 1000 filas (max-rows), así que se pide por bloques hasta el final.
    if (q.limite == null) {
      const out: Row[] = []; let total: number | null = null, d = q.desde || 0;
      for (let i = 0; i < 100; i++) {
        const r = await this.consultar1(table, { ...q, desde: d, limite: 1000, contar: q.contar && i === 0 });
        if (i === 0) total = r.total;
        out.push(...r.rows); d += r.rows.length;
        if (r.rows.length < 1000) break;
      }
      return { rows: out, total: q.contar ? (total ?? out.length) : null };
    }
    // TK184: PostgREST también corta un límite > 1000 (p. ej. limite: 4000 → solo 1000 filas). Clientas más allá de la
    // fila 1000 «no tenían WhatsApp». Se pide por bloques de 1000 hasta llegar al límite pedido.
    if (q.limite > 1000) {
      const out: Row[] = []; let total: number | null = null, d = q.desde || 0;
      for (let i = 0; out.length < q.limite && i < 100; i++) {
        const lim = Math.min(1000, q.limite - out.length);
        const r = await this.consultar1(table, { ...q, desde: d, limite: lim, contar: q.contar && i === 0 });
        if (i === 0) total = r.total;
        out.push(...r.rows); d += r.rows.length;
        if (r.rows.length < lim) break;
      }
      return { rows: out, total: q.contar ? (total ?? out.length) : null };
    }
    return await this.consultar1(table, q);
  }
  private async consultar1(table: string, q: Consulta): Promise<Resultado> {
    const d = q.desde || 0, lim = q.limite;
    const headers: Record<string, string> = { Prefer: q.contar ? "count=exact" : "count=none" };
    if (lim != null) headers.Range = `${d}-${d + Math.max(0, lim - 1)}`;
    else if (d) headers.Range = `${d}-`;
    const res = await this.fetchImpl(urlConsulta(this.url, table, q), { headers: this.headers(headers) });
    if (!res.ok && res.status !== 416) throw new Error(`${table} ${res.status} ${await res.text()}`);
    const rows = res.status === 416 ? [] : await res.json();
    const cr = res.headers.get("content-range") || "";
    const tot = q.contar ? Number(cr.split("/")[1]) : NaN;
    return { rows: Array.isArray(rows) ? rows : [], total: Number.isFinite(tot) ? tot : null };
  }
  async write(actor: string, table: string, op: "insert" | "update" | "delete", match: Row, row: Row | null): Promise<Row | null> {
    // Tablas nuevas de la beta (0045+) van por app_beta_write; app_write sigue igual.
    const fn = BETA_TABLAS.has(table) ? "app_beta_write" : "app_write";
    const res = await this.fetchImpl(`${this.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ p_actor: actor, p_table: table, p_op: op, p_match: match || {}, p_row: row || {} }),
    });
    if (!res.ok) throw new Error(`${fn} ${table} ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data || null;
  }
  async rpc(name: string, args: Row): Promise<unknown> {
    const res = await this.fetchImpl(`${this.url}/rest/v1/rpc/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`rpc ${name} ${res.status} ${await res.text()}`);
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  }
}
