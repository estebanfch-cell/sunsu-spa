import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./erp_api.ts";
import "./asistencia_api.ts";
import { SupabaseDb } from "./db.ts";
import { LEGACY_APPS_SCRIPT_URL } from "./domain.ts";
import type { Row } from "./domain.ts";

declare const Deno: {
  serve: (h: (req: Request) => Promise<Response> | Response) => void;
  env: { get(k: string): string | undefined };
};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
      SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
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
    const data = await handle(action, body, ctx);
    const cb = url.searchParams.get("callback");
    if (cb && /^[$A-Z_a-z][0-9A-Z_$a-z]*$/.test(cb)) {
      return new Response(`${cb}(${JSON.stringify(data)})`, { headers: { "content-type": "application/javascript", ...CORS } });
    }
    return json(data);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) });
  }
});
