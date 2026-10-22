import { enPrueba, type Db } from "./db.ts";
import { ecuadorParts, siguienteBetaNum, siguienteTestTicket, s, type Row } from "./domain.ts";
import { normalizarRol } from "./permisos.ts";

export interface Ses {
  uid: string;
  rol: string;
  name: string;
  short: string;
  color: string;
  token: string;
  prueba?: boolean;
}

export interface Ctx {
  db: Db;
  now: Date;
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  legacyLogin: (pin: string) => Promise<Row>;
}

export function actorOf(ses: Ses | null, fallback = ""): string {
  if (ses) return `${ses.name} (${ses.uid})`;
  return fallback || "beta";
}

export async function loadSes(ctx: Ctx, token: unknown): Promise<Ses | null> {
  const tk = s(token);
  if (!tk) return null;
  const rows = await ctx.db.all("sesiones");
  const ses = rows.find((r) => r.token === tk);
  if (!ses) return null;
  if (new Date(String(ses.exp)).getTime() < ctx.now.getTime()) return null;
  const app = await ctx.db.all("app_usuarios");
  const a = app.find((x) => String(x.id ?? x.usuario) === String(ses.uid));
  let u: Row | undefined = a
    ? { id: a.id ?? a.usuario, nombre: a.nombre ?? a.name ?? a.usuario, short: a.short ?? a.nombre ?? a.name, rol: a.rol ?? a.role, color: a.color, bloqueado: a.bloqueado }
    : undefined;
  if (!u) {
    const users = await ctx.db.all("usuarios");
    u = users.find((x) => x.id === ses.uid);
  }
  if (!u || u.bloqueado === true) return null;
  let rol = normalizarRol(String(u.rol || ses.rol));
  if (String(u.rol) === "staff") {
    const marks = await ctx.db.all("cosmetologas");
    const m = marks.find((x) => x.id === u.id);
    rol = m && m.es_cosmetologa === true ? "cosmetologa" : "asistente_cosmetologia";
  }
  return {
    uid: String(u.id), rol, name: String(u.nombre),
    short: s(u.short) || String(u.nombre), color: s(u.color), token: tk,
    prueba: ses.modo_prueba === true,
  };
}

export async function kvGet(db: Db, key: string): Promise<Row> {
  const rows = await db.all("app_kv");
  const r = rows.find((x) => x.clave === key);
  const v = r?.valor;
  if (v && typeof v === "object") return v as Row;
  return {};
}
export async function kvSet(db: Db, actor: string, key: string, valor: unknown): Promise<void> {
  const rows = await db.all("app_kv");
  if (rows.some((x) => x.clave === key)) await db.write(actor, "app_kv", "update", { clave: key }, { valor });
  else await db.write(actor, "app_kv", "insert", {}, { clave: key, valor });
}

export function esTicketBeta(r: Row): boolean {
  if (s(r.origin) === "beta" || s(r.origin) === "test") return true;
  const o = r.orig;
  if (o && typeof o === "object") {
    const orig = o as Row;
    if (s(orig.fuente) === "ov_save" || orig.beta === true) return true;
  }
  return false;
}

/** Número de ticket de la beta. sheet_row queda nulo para no chocar con la hoja. En modo prueba la serie es TEST-TK- y no llama next_ticket_num. */
export async function asignarTicketBeta(db: Db, now: Date): Promise<{ origin: "beta" | "test"; sheet_row: null; beta_num: string }> {
  const ec = ecuadorParts(now);
  const ymd = ec.ymd.replace(/-/g, "");
  if (enPrueba(db)) {
    const rows = await db.all("tickets");
    return { origin: "test", sheet_row: null, beta_num: siguienteTestTicket(rows, ec.ymd) };
  }
  try {
    const raw = await db.rpc("next_ticket_num", {});
    const v = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(v) && v > 0) {
      return { origin: "beta", sheet_row: null, beta_num: `TK-${ymd}-${String(Math.trunc(v)).padStart(4, "0")}` };
    }
  } catch { /* sin ticket_seq, el piso 900000 no pisa una fila de la hoja */ }
  const rows = await db.all("tickets");
  return { origin: "beta", sheet_row: null, beta_num: siguienteBetaNum(rows, ec.ymd) };
}

/**
 * Espejo de tickets_reimportar: borra solo filas con sheet_row de la hoja.
 * origin beta y origin test se conservan. No hay import.py en este repo;
 * la reimportación real corre en SQL. TRUNCATE no pasa por el trigger.
 */
export async function reimportarTickets(db: Db, actor: string, filas: Row[]): Promise<{ borradas: number; escritas: number; conservadas: number }> {
  const prev = await db.all("tickets");
  const beta = prev.filter(esTicketBeta);
  const betaSheets = new Set(beta.map((r) => r.sheet_row).filter((x) => x != null).map((x) => Number(x)));
  let borradas = 0;
  for (const r of prev) {
    if (esTicketBeta(r)) continue;
    if (r.sheet_row == null || r.sheet_row === "") continue;
    const match = r.id != null ? { id: r.id } : { sheet_row: r.sheet_row };
    await db.write(actor, "tickets", "delete", match, null);
    borradas++;
  }
  let escritas = 0;
  for (const f of filas) {
    const sr = Number(f.sheet_row);
    if (!sr) continue;
    if (betaSheets.has(sr)) continue;
    const row: Row = { ...f, origin: "sheet", sheet_row: sr };
    delete row.id;
    delete row.beta_num;
    const hit = (await db.all("tickets")).find((r) => Number(r.sheet_row) === sr && !esTicketBeta(r));
    if (hit) await db.write(actor, "tickets", "update", hit.id != null ? { id: hit.id } : { sheet_row: sr }, row);
    else await db.write(actor, "tickets", "insert", {}, row);
    escritas++;
  }
  return { borradas, escritas, conservadas: beta.length };
}

export async function nextSheet(db: Db, table: string): Promise<number> {
  const rows = await db.all(table);
  let m = 1;
  for (const r of rows) m = Math.max(m, Number(r.sheet_row) || 0);
  return m + 1;
}
export async function rowBySheet(db: Db, table: string, sheetRow: number): Promise<Row | null> {
  const rows = await db.all(table);
  return rows.find((r) => Number(r.sheet_row) === sheetRow) || null;
}

export async function logAccion(db: Db, actor: string, accion: string, detalle: string): Promise<void> {
  const ec = ecuadorParts();
  const sheet_row = await nextSheet(db, "log_acciones");
  await db.write(actor, "log_acciones", "insert", {}, {
    sheet_row, fecha: ec.isoWall, usuario: actor, accion, detalle, orig: { fecha: ec.stamp, usuario: actor, accion, detalle },
  });
}

export function publico(u: Row) {
  return { id: u.id, name: u.nombre, short: u.short, role: u.rol, color: u.color, bloqueado: !!u.bloqueado, pinReset: !!u.pin_reset };
}

export async function ensureUsers(db: Db, actor: string): Promise<void> {
  const rows = await db.all("usuarios");
  if (rows.length) return;
  const seed = [
    ["efch", "EFCH", "EFCH", "super_admin", "#3D5A7A"],
    ["emi", "Emi", "Emi", "admin", "#8FA8C8"],
    ["andrea", "Andrea Robles", "Andrea", "cosmetologa", "#5B7FA6"],
    ["daniela", "Daniela Mora", "Daniela", "cosmetologa", "#C4943A"],
    ["dejaneira", "Dejaneira Espinoza", "Dejaneira", "asistente_cosmetologia", "#7A9E8A"],
    ["alejandra", "Alejandra Rodriguez", "Alejandra", "recepcion", "#D4956A"],
  ];
  for (const [id, nombre, short, rol, color] of seed) {
    await db.write(actor, "usuarios", "insert", {}, { id, nombre, short, rol, color, bloqueado: false, pin_reset: false });
  }
}

export function conTelefono(ses: Ses | null): boolean {
  return !!ses && ["admin", "admin_master", "super_admin", "gerente", "reception", "recepcion"].includes(ses.rol);
}

/** Copia a una tabla de la migración 0008. Columnas que no existan se ignoran en app_write; un NOT NULL distinto no tumba la acción que ya se guardó en kv. */
export async function espejo(db: Db, actor: string, table: string, row: Row): Promise<void> {
  try { await db.write(actor, table, "insert", {}, row); } catch { /* la copia en app_kv sigue vigente */ }
}

export async function guardarArchivo(db: Db, actor: string, kind: string, nombre: string, dataUrl: string): Promise<string | null> {
  const i = dataUrl.indexOf("base64,");
  if (i < 0) return null;
  const mime = dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg";
  const b64 = dataUrl.slice(i + 7);
  if (b64.length > 1_500_000) return null;
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  await db.write(actor, "app_archivos", "insert", {}, { id, kind, nombre, mime, data_b64: b64, created_by: actor });
  return id;
}
