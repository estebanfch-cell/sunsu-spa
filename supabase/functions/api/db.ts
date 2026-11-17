import type { Row } from "./domain.ts";

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
export const BETA_TABLAS = new Set(["beta_conteos", "beta_conteo_lineas", "beta_notificaciones", "beta_transferencias", "beta_transferencia_lineas", "beta_ajustes", "beta_ajuste_lineas", "beta_stock", "beta_stock_movimientos", "beta_tickets", "beta_ticket_lineas", "beta_clientes", "beta_cliente_notas"]);
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
