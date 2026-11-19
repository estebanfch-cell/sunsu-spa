// TK109: ping para mantener tibia la función y un bootstrap con datos comunes (lugares).
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import type { Row } from "./domain.ts";
import { s } from "./domain.ts";
import { runErp } from "./erp.ts";

extend("ping", "any", async (_p: Row, ctx: Ctx) => {
  return { ok: true, t: ctx.now.toISOString() };
});

extend("bootstrap", "any", async (p: Row, ctx: Ctx, ses: Ses) => {
  const local_id = s(p.local_id);
  let lugares: Row = {};
  try {
    const r = await runErp("lugares_list", { local_id }, ctx.db, actorOf(ses), ctx.now) as Row;
    if (r && typeof r === "object") lugares = r;
  } catch { /* sin lugares el front usa el cache o el default */ }
  return { ok: true, t: ctx.now.toISOString(), lugares };
});
