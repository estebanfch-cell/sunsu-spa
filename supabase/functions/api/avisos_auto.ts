// TK223 (Emilia): un aviso resuelto se apaga solo. Las filas de beta_notificaciones
// y los erp_avisos de bajo mínimo se reevalúan al cargar y al resolver, sin
// esperar a que alguien pulse ×. El dismiss manual (notif_leer / ×) se mantiene.
import type { Ctx } from "./lib.ts";
import { s, type Row } from "./domain.ts";

/** Avisos informativos: se quedan hasta que la persona los lea o los descarte con ×. */
export const AVISOS_FYI = new Set([
  "solicitud_aprobada", "solicitud_rechazada",
  "permiso_aprobado", "permiso_rechazado",
  "conteo_aprobado", "conteo_devuelto",
]);

export type DatosAvisos = { solicitudes: Row[]; permisos: Row[]; conteos: Row[] };

function ticketDeLink(link: string): string {
  const m = s(link).match(/#\/m\/tickets\/t\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export function permisoDeAviso(n: Row, permisos: Row[]): Row | undefined {
  const ref = s(n.ref_id);
  if (ref) {
    const hit = permisos.find((p) => s(p.id_1) === ref || String(p.sheet_row) === ref || String(p.id) === ref);
    if (hit) return hit;
  }
  const m = s(n.cuerpo || n.texto).match(/^(.+?)\s+pidió\s+(\S+)\s+del\s+(\d{4}-\d{2}-\d{2})\s+al\s+(\d{4}-\d{2}-\d{2})/i);
  if (!m) return undefined;
  const nombre = s(m[1]).trim().toLowerCase();
  const tipo = s(m[2]).trim().toLowerCase();
  const d1 = m[3], d2 = m[4];
  return permisos.find((p) => {
    const em = s(p.empleada).trim().toLowerCase();
    const tp = s(p.tipo).trim().toLowerCase();
    const fi = s(p.fecha_inicio).slice(0, 10);
    const ff = s(p.fecha_fin).slice(0, 10);
    return em === nombre && (tp === tipo || tp.includes(tipo) || tipo.includes(tp)) && fi === d1 && (ff === d2 || (!ff && d1 === d2));
  });
}

/** true = el aviso todavía describe un pendiente; false = ya se resolvió y debe apagarse. */
export function avisoSigueVigente(n: Row, data: DatosAvisos): boolean {
  const tipo = s(n.tipo);
  if (AVISOS_FYI.has(tipo)) return true;
  if (tipo === "edicion_ticket" || tipo === "solicitud") {
    const id = s(n.ref_id) || s(n.id).replace(/^sol:/, "");
    const sol = data.solicitudes.find((r) => s(r.id) === id);
    if (sol) return s(sol.estado) === "pendiente" && sol.prueba !== true;
    const fila = ticketDeLink(s(n.link || n.ruta));
    if (!fila) return false;
    return data.solicitudes.some((r) => s(r.fila) === fila && s(r.estado) === "pendiente" && r.prueba !== true);
  }
  if (tipo === "permiso") {
    const p = permisoDeAviso(n, data.permisos);
    if (!p) return true;
    return /pend/i.test(s(p.estado)) && !p.borrado_at;
  }
  if (tipo === "conteo" || tipo === "conteo_revision") {
    const ref = s(n.ref_id);
    const c = data.conteos.find((x) => s(x.id) === ref || s(x.numero) === ref);
    if (!c) return false;
    const est = s(c.estado);
    if (tipo === "conteo_revision") return est === "en_revision";
    return est !== "aprobado" && est !== "cancelado";
  }
  return true;
}

async function todas(ctx: Ctx, t: string): Promise<Row[]> {
  try { return await ctx.db.all(t); } catch { return []; }
}

export async function cargarDatosAvisos(ctx: Ctx): Promise<DatosAvisos> {
  const [solicitudes, permisos, conteos] = await Promise.all([
    todas(ctx, "solicitudes_cambio"),
    todas(ctx, "permisos"),
    todas(ctx, "beta_conteos"),
  ]);
  return { solicitudes, permisos, conteos };
}

/** Marca leídas las notificaciones cuya condición ya no aplica. No toca otro dato de negocio. */
export async function resolverAvisosObsoletos(ctx: Ctx, actor: string): Promise<number> {
  const rows = await todas(ctx, "beta_notificaciones");
  if (!rows.length) return 0;
  const data = await cargarDatosAvisos(ctx);
  const now = ctx.now.toISOString();
  let n = 0;
  for (const r of rows) {
    if (s(r.leida_at)) continue;
    if (avisoSigueVigente(r, data)) continue;
    try {
      await ctx.db.write(actor, "beta_notificaciones", "update", { id: r.id }, { leida_at: now });
      n++;
    } catch { /* no frena la lista */ }
  }
  return n;
}
