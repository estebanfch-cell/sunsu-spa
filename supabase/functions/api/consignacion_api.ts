import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { csgCierre, csgEntrada, csgGet, csgList, csgPedido } from "./consignacion.ts";
import type { Row } from "./domain.ts";

extend("csg_list", "any", async (_p, ctx: Ctx) => csgList(ctx.db));

extend("csg_get", "any", async (p, ctx: Ctx) => csgGet(ctx.db, p as Row));

extend("csg_entrada", "any", async (p, ctx: Ctx, ses: Ses) => {
  return csgEntrada(ctx.db, actorOf(ses), p as Row, ctx.now);
});

extend("csg_pedido", "any", async (p, ctx: Ctx, ses: Ses) => {
  return csgPedido(ctx.db, actorOf(ses), p as Row, ctx.now);
});

extend("csg_cierre", "any", async (p, ctx: Ctx, ses: Ses) => {
  return csgCierre(ctx.db, actorOf(ses), p as Row, ctx.now);
});
