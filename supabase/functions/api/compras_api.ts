import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import {
  comprasAprobar, comprasEnviar, comprasGuardar, comprasLista, comprasPago, comprasPeriodo, comprasRecibir, comprasReporte, comprasSaldo,
} from "./compras_flujo.ts";
import { esAdmin } from "./permisos.ts";
import { s, type Row } from "./domain.ts";

function soloAdmin(ses: Ses): Row | null {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  return null;
}

async function subirFactura(ctx: Ctx, actor: string, pagoId: string, nombre: string, b64: string): Promise<string> {
  const base = s(ctx.env.SUPABASE_URL).replace(/\/$/, "");
  const key = s(ctx.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!base || !key || !b64) return "";
  const raw = b64.includes("base64,") ? b64.slice(b64.indexOf("base64,") + 7) : b64;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)); }
  catch { return ""; }
  const path = pagoId + "/" + (nombre || "factura").replace(/[^\w.\-]+/g, "_");
  const res = await ctx.fetchImpl(`${base}/storage/v1/object/compras/${encodeURIComponent(path)}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/octet-stream",
      "x-upsert": "true",
    },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) return "";
  await ctx.db.write(actor, "erp_oc_pagos", "update", { id: pagoId }, { storage_path: path });
  return path;
}

extend("compras_periodo", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  return comprasPeriodo(ctx.db, p as Row);
});

extend("compras_guardar", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  return comprasGuardar(ctx.db, actorOf(ses), p as Row, ctx.now);
});

extend("compras_aprobar", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  return comprasAprobar(ctx.db, actorOf(ses), p as Row);
});

extend("compras_enviar", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  return comprasEnviar(ctx.db, actorOf(ses), p as Row);
});

extend("compras_lista", "any", async (_p, _ctx, ses) => {
  return comprasLista(_ctx.db, esAdmin(ses.rol));
});

extend("compras_recibir", "any", async (p, ctx, ses) => {
  return comprasRecibir(ctx.db, actorOf(ses), p as Row, ctx.now, esAdmin(ses.rol));
});

extend("compras_pago", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const out = await comprasPago(ctx.db, actorOf(ses), p as Row, ctx.now);
  if (out.ok && s((p as Row).factura_b64 || (p as Row).archivo)) {
    const path = await subirFactura(ctx, actorOf(ses), s(out.pago_id), s((p as Row).factura_nombre), s((p as Row).factura_b64 || (p as Row).archivo));
    if (path) out.storage_path = path;
  }
  return out;
});

extend("compras_saldo", "any", async (_p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  return comprasSaldo(ctx.db);
});

extend("compras_reporte", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  return comprasReporte(ctx.db, p as Row);
});
