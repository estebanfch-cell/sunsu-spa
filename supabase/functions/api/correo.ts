// Envío de correo para reseteo de clave (TK147). Nunca registra el cuerpo con tokens en claro
// ni imprime secretos. Si no hay proveedor configurado, no finge que el correo salió.
import type { Ctx } from "./lib.ts";
import { s, type Row } from "./domain.ts";

export type ProveedorCorreo = "resend" | null;

export function proveedorCorreo(env: Record<string, string | undefined> | undefined): ProveedorCorreo {
  if (env && s(env.RESEND_API_KEY)) return "resend";
  return null;
}

export function appUrl(env: Record<string, string | undefined> | undefined): string {
  const u = s(env && env.SUNSU_APP_URL) || "https://app.sunsuspa.com";
  return u.replace(/\/$/, "");
}

export function enlaceReset(env: Record<string, string | undefined> | undefined, token: string): string {
  return appUrl(env) + "/#/reset/" + encodeURIComponent(token);
}

/** Envía un correo. Si no hay proveedor, {ok:true, enviado:false, motivo}. Nunca incluye el token en el motivo. */
export async function enviarCorreo(ctx: Ctx, p: { para: string; asunto: string; texto: string; html?: string }): Promise<Row> {
  const para = s(p.para).trim().toLowerCase();
  if (!para) return { ok: false, enviado: false, motivo: "falta el correo" };
  const prov = proveedorCorreo(ctx.env);
  if (prov === "resend") {
    const key = s(ctx.env.RESEND_API_KEY);
    const from = s(ctx.env.RESEND_FROM) || "Sunsu Spa <no-reply@sunsuspa.com>";
    try {
      const r = await ctx.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [para], subject: p.asunto, text: p.texto, html: p.html || undefined }),
      });
      if (!r.ok) return { ok: true, enviado: false, motivo: "el proveedor rechazó el envío" };
      return { ok: true, enviado: true, proveedor: "resend" };
    } catch {
      return { ok: true, enviado: false, motivo: "no se pudo contactar al proveedor de correo" };
    }
  }
  return { ok: true, enviado: false, motivo: "no hay proveedor de correo configurado (falta RESEND_API_KEY o RESEND_FROM en los secrets de Supabase)" };
}
