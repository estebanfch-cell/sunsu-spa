import { extend } from "./handlers.ts";
import type { Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import type { Row } from "./domain.ts";
import {
  conteoAprobar, conteoAsignar, conteoCerrarSec, conteoCrear, conteoGuardarSec, conteoMios, conteoPanel, conteoPlan, conteoSeccion, conteoUsuarios,
} from "./conteo_mod.ts";

function soloAdmin(ses: Ses): Row | null {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  return null;
}

extend("conteo_usuarios", "any", async (_p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  return conteoUsuarios(ctx.db);
});

extend("conteo_plan", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  return conteoPlan(ctx.db, p as Row);
});

extend("conteo_crear", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  return conteoCrear(ctx.db, actorOf(ses), p as Row, ctx.now);
});

extend("conteo_panel", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  return conteoPanel(ctx.db, p as Row);
});

extend("conteo_asignar", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  return conteoAsignar(ctx.db, actorOf(ses), p as Row);
});

extend("conteo_aprobar", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  return conteoAprobar(ctx.db, actorOf(ses), p as Row, ctx.now);
});

extend("conteo_mios", "any", async (_p, ctx, ses) => {
  return conteoMios(ctx.db, ses.uid);
});

extend("conteo_seccion", "any", async (p, ctx, ses) => {
  return conteoSeccion(ctx.db, p as Row, ses.uid, esAdmin(ses.rol));
});

extend("conteo_guardar_sec", "any", async (p, ctx, ses) => {
  return conteoGuardarSec(ctx.db, actorOf(ses), p as Row, ses.uid, esAdmin(ses.rol));
});

extend("conteo_cerrar_sec", "any", async (p, ctx, ses) => {
  return conteoCerrarSec(ctx.db, actorOf(ses), p as Row, ses.uid, esAdmin(ses.rol));
});
