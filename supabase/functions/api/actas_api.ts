// 📝 Actas de entrega-recepción (TK26, Emilia 17/11): se generan solas al recibir una OC. Sunsu firma en
// la app (admin); «Copiar link» da un link firmado del PDF para mandarlo por WhatsApp. EN ESPERA (Emilia
// decide): correo automático al proveedor, página pública para que firme el proveedor y sus faltantes.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { s, type Row } from "./domain.ts";
import { consultar } from "./query.ts";
import { siguienteAnual } from "./compras_beta.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const anioEc = (d: Date) => Number(new Date(d.getTime() - 5 * 3600e3).toISOString().slice(0, 4));

export async function crearActa(ctx: Ctx, actor: string, a: { oc: Row; recepcion_id?: string; restock_id?: string; lineas: Row[] }): Promise<Row> {
  const prev = await todas(ctx, "beta_actas");
  const numero = siguienteAnual(prev, "ACTA", anioEc(ctx.now));
  const id = crypto.randomUUID();
  await ctx.db.write(actor, "beta_actas", "insert", {}, {
    id, numero, oc_id: s(a.oc.id) || null, recepcion_id: a.recepcion_id || null, restock_id: a.restock_id || null, proveedor_id: s(a.oc.proveedor_id) || null,
    lineas: a.lineas, creado_por: actor, created_at: ctx.now.toISOString(),
  });
  await logAccion(ctx.db, actor, "ACTA CREAR", `${numero} · ${s(a.oc.numero)} · ${s(a.oc.id)}`);
  return { id, numero };
}
export function vistaActa(a: Row): Row {
  return { id: s(a.id), numero: s(a.numero), fecha: s(a.created_at), oc_id: s(a.oc_id), recepcion_id: s(a.recepcion_id), lineas: Array.isArray(a.lineas) ? a.lineas : [],
    firmaSunsu: s(a.firma_sunsu), firmadoPor: s(a.firmado_por), firmadoAt: s(a.firmado_at), firmaProveedor: s(a.firma_proveedor), firmaProveedorNombre: s(a.firma_proveedor_nombre), firmaProveedorAt: s(a.firma_proveedor_at), pdf: !!s(a.storage_path) };
}
export async function actasDeOc(ctx: Ctx, ocId: string): Promise<Row[]> {
  return (await todas(ctx, "beta_actas")).filter((a) => s(a.oc_id) === ocId).sort((x, y) => s(x.created_at).localeCompare(s(y.created_at))).map(vistaActa);
}
async function acta(ctx: Ctx, id: string): Promise<Row | undefined> { return (await todas(ctx, "beta_actas")).find((a) => s(a.id) === id); }

extend("acta_get", "any", async (p, ctx) => {
  const a = await acta(ctx, s(p.id)); if (!a) return { error: "Acta no encontrada" };
  return { ok: true, acta: vistaActa(a) };
});
extend("acta_firmar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin firma por Sunsu" };
  const a = await acta(ctx, s(p.id)); if (!a) return { error: "Acta no encontrada" };
  const firma = s(p.firma);
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(firma) || firma.length < 200) return { error: "Dibuja la firma" };
  if (firma.length > 400_000) return { error: "La firma pesa demasiado" };
  await ctx.db.write(actorOf(ses), "beta_actas", "update", { id: a.id }, { firma_sunsu: firma, firmado_por: s(p.nombre).trim().slice(0, 80) || ses.name, firmado_at: ctx.now.toISOString(), storage_path: null, updated_at: ctx.now.toISOString() });
  await logAccion(ctx.db, actorOf(ses), "ACTA FIRMAR", `${s(a.numero)} · ${s(a.oc_id)}`);
  return { ok: true };
});

// PDF del acta en el bucket privado «cliente-documentos», carpeta actas/; link firmado para WhatsApp.
const MAX_PDF = 8 * 1024 * 1024;
function bytesDe(dataUrl: string): Uint8Array | null {
  const m = /^data:application\/pdf;base64,(.+)$/s.exec(dataUrl); if (!m) return null;
  try { const bin = atob(m[1]); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; } catch { return null; }
}
function almacen(ctx: Ctx): { base: string; sk: string } | null {
  const base = s(ctx.env.SUPABASE_URL).replace(/\/$/, ""), sk = s(ctx.env.SUPABASE_SERVICE_ROLE_KEY);
  return base && sk ? { base, sk } : null;
}
const enc = (path: string) => path.split("/").map(encodeURIComponent).join("/");
extend("acta_pdf_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const a = await acta(ctx, s(p.id)); if (!a) return { error: "Acta no encontrada" };
  if (ses.prueba) return { error: "Modo prueba no guarda documentos reales" };
  const pdf = bytesDe(s(p.pdf));
  if (!pdf || pdf.length < 200) return { error: "El PDF no llegó bien" };
  if (pdf.length > MAX_PDF) return { error: "El PDF pesa más de 8 MB" };
  const st = almacen(ctx); if (!st) return { error: "El almacén de documentos no está configurado." };
  const path = `actas/${anioEc(ctx.now)}/${s(a.numero).replace(/[^\w-]/g, "")}_${ctx.now.getTime()}.pdf`;
  const res = await ctx.fetchImpl(`${st.base}/storage/v1/object/cliente-documentos/${enc(path)}`, {
    method: "POST", headers: { authorization: `Bearer ${st.sk}`, apikey: st.sk, "content-type": "application/pdf", "x-upsert": "false" }, body: pdf as unknown as BodyInit,
  });
  if (!res.ok) return { error: "No se pudo subir el PDF (" + res.status + ")" };
  await ctx.db.write(actorOf(ses), "beta_actas", "update", { id: a.id }, { storage_path: path, updated_at: ctx.now.toISOString() });
  return { ok: true };
});
/** Link firmado (7 días) del PDF del acta, para copiar y mandar por WhatsApp. Solo lectura: no firma nada. */
extend("acta_link", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const a = await acta(ctx, s(p.id)); if (!a) return { error: "Acta no encontrada" };
  if (!s(a.storage_path)) return { error: "Primero guarda el PDF" };
  const st = almacen(ctx); if (!st) return { error: "El almacén de documentos no está configurado." };
  const res = await ctx.fetchImpl(`${st.base}/storage/v1/object/sign/cliente-documentos/${enc(s(a.storage_path))}`, {
    method: "POST", headers: { authorization: `Bearer ${st.sk}`, apikey: st.sk, "content-type": "application/json" }, body: JSON.stringify({ expiresIn: 7 * 24 * 3600 }),
  });
  let data: Row = {}; try { data = await res.json() as Row; } catch { data = {}; }
  const signed = s(data.signedURL || data.signedUrl);
  if (!res.ok || !signed) return { error: "No se pudo crear el link" };
  const url = signed.startsWith("http") ? signed : `${st.base}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`;
  await logAccion(ctx.db, actorOf(ses), "ACTA LINK", `${s(a.numero)} · ${s(a.oc_id)}`);
  return { ok: true, url, vence: new Date(ctx.now.getTime() + 7 * 24 * 3600e3).toISOString() };
});
void consultar;
