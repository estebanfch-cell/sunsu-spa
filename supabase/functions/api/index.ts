import { handle } from "./handlers.ts";
import { formatearRespuesta } from "./domain.ts";
import "./handlers_extra.ts";
import "./roles_api.ts";
import "./roles_crear_api.ts";
import "./jibble_importar.ts";
import "./empleados_api.ts";
import "./erp_api.ts";
import "./ventas_api.ts";
import "./asistencia_api.ts";
import "./horarios_api.ts";
import "./inline_api.ts";
import "./personal_api.ts";
import "./compras_api.ts";
import "./conteo_api.ts";
import "./dashboard_api.ts";
import "./productos_api.ts";
import "./productos_paridad_api.ts";
import "./protocolos_api.ts";
import "./conteo_fisico_api.ts";
import "./conteo_secciones_api.ts";
import "./transferencias_beta_api.ts";
import "./ajustes_beta_api.ts";
import "./tickets_beta_api.ts";
import "./wa_api.ts";
import "./clientes_beta_api.ts";
import "./clientes_contacto_api.ts";
import "./agenda_api.ts";
import "./staff_home_api.ts";
import "./tk109_api.ts";
import "./tickets_lista_api.ts";
import "./usuario_permisos_api.ts";
import "./priv_permisos_api.ts";
import "./colores_api.ts";
import "./tickets_cancelar_api.ts";
import "./paquetes_beta_api.ts";
import "./multas_beta_api.ts";
import "./aperturas_api.ts";
import "./credenciales_api.ts";
import "./barras_api.ts";
import "./pagos_caja_api.ts";
import "./gift_beta_api.ts";
import "./clientes_dup_api.ts";
import "./compras_beta_api.ts";
import "./recepciones_api.ts";
import "./consignacion_beta_api.ts";
import "./actas_api.ts";
import "./promos_beta_api.ts";
import "./proveedores_beta_api.ts";
import "./migo_cuadre_api.ts";
import "./cliente_factura.ts";
import "./legacy_solicitudes_api.ts";
import "./aprobaciones_api.ts";
import "./ticket_edicion_api.ts";
import "./voucher_ocr_api.ts";
import "./portal_api.ts";
import { SupabaseDb } from "./db.ts";
import { LEGACY_APPS_SCRIPT_URL } from "./domain.ts";
import type { Row } from "./domain.ts";
import { ENGINE_HEADER, SUNSU_ENGINE } from "./sunsu_version.ts";

declare const Deno: {
  serve: (h: (req: Request) => Promise<Response> | Response) => void;
  env: { get(k: string): string | undefined };
};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": ENGINE_HEADER,
  [ENGINE_HEADER]: SUNSU_ENGINE,
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...CORS } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  let body: Row = {};
  if (req.method === "POST") {
    const text = await req.text();
    try { body = text ? JSON.parse(text) as Row : {}; } catch { body = {}; }
  }
  for (const [k, v] of url.searchParams) if (body[k] === undefined) body[k] = v;
  let action = String(body.accion ?? body.action ?? body.op ?? "");
  if (!action && body.cajaAction) {
    const map: Record<string, string> = { gasto: "cajaGasto", deposito: "cajaDeposito", sync: "cajaSync", saldo: "getCajaV2" };
    action = map[String(body.cajaAction)] || "";
  }
  if (!body.ip) body.ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const ctx = {
    db: new SupabaseDb(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""),
    now: new Date(),
    env: {
      ACUITY_UID: Deno.env.get("ACUITY_UID"),
      ACUITY_KEY: Deno.env.get("ACUITY_KEY"),
      JIBBLE_CLIENT_ID: Deno.env.get("JIBBLE_CLIENT_ID"),
      JIBBLE_CLIENT_SECRET: Deno.env.get("JIBBLE_CLIENT_SECRET"),
      JIBBLE_CLIENT_ID_NEW: Deno.env.get("JIBBLE_CLIENT_ID_NEW"),
      JIBBLE_CLIENT_SECRET_NEW: Deno.env.get("JIBBLE_CLIENT_SECRET_NEW"),
      JIBBLE_API_KEY: Deno.env.get("JIBBLE_API_KEY"),
      JIBBLE_API_SECRET: Deno.env.get("JIBBLE_API_SECRET"),
      SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      MIGO_CRON_KEY: Deno.env.get("MIGO_CRON_KEY"),
      RESEND_API_KEY: Deno.env.get("RESEND_API_KEY"),
      RESEND_FROM: Deno.env.get("RESEND_FROM"),
      SUNSU_APP_URL: Deno.env.get("SUNSU_APP_URL"),
      ANTHROPIC_API_KEY: Deno.env.get("ANTHROPIC_API_KEY"),
      ANTHROPIC_MODEL: Deno.env.get("ANTHROPIC_MODEL"),
    },
    fetchImpl: fetch,
    legacyLogin: async (pin: string) => {
      const r = await fetch(LEGACY_APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ accion: "login", pin }),
      });
      return r.json();
    },
  };
  try {
    const data0 = await handle(action, body, ctx);
    // Beta (_fmt): cédulas/RUC/pasaportes y celulares limpios en toda respuesta (solo lectura; la hoja no cambia).
    const data = body && (body as Record<string, unknown>)._fmt ? formatearRespuesta(data0) : data0;
    const cb = url.searchParams.get("callback");
    if (cb && /^[$A-Z_a-z][0-9A-Z_$a-z]*$/.test(cb)) {
      return new Response(`${cb}(${JSON.stringify(data)})`, { headers: { "content-type": "application/javascript", ...CORS } });
    }
    const auth = !!(data && typeof data === "object" && ((data as Row).auth_error === true || (data as Row).error === "Inicia sesión"));
    return json(data, auth ? 401 : 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) });
  }
});
