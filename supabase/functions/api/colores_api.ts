// Color fijo por persona (píldora de la cosmetóloga en lista, detalle, historial y agenda). Vive en beta_permisos_usuario.
import { extend } from "./handlers.ts";
import type { Ctx } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { normNombre, s, type Row } from "./domain.ts";
import { esAdmin } from "./permisos.ts";
import { personas } from "./usuario_permisos_api.ts";

/** Pasteles bien distintos entre sí (se asignan en orden a quien no tiene color guardado). */
export const PALETA = ["#E7DBFF", "#FFF1B8", "#D4F5E2", "#FFDCE5", "#D6ECFF", "#FFE3C9", "#E2F0C4", "#F3D9F7", "#CDEFF0", "#F7E1D0", "#E0E4FF", "#FBE7A8"];
const HEX = /^#[0-9a-f]{6}$/i;

async function filas(ctx: Ctx): Promise<Row[]> { try { return await ctx.db.all("beta_permisos_usuario"); } catch { return []; } }

/** {nombreNormalizado: color} para todo el equipo; quien no eligió color recibe uno de la paleta que no esté usado. */
export function mapaColores(gente: Row[], guardados: Row[]): Record<string, { nombre: string; color: string; propio: boolean }> {
  const out: Record<string, { nombre: string; color: string; propio: boolean }> = {};
  const usados = new Set<string>();
  for (const g of guardados) if (HEX.test(s(g.color))) { out[s(g.usuario)] = { nombre: s(g.nombre) || s(g.usuario), color: s(g.color).toUpperCase(), propio: true }; usados.add(s(g.color).toUpperCase()); }
  const libres = PALETA.filter((c) => !usados.has(c));
  let i = 0;
  for (const p of [...gente].sort((a, b) => s(a.nombre).localeCompare(s(b.nombre)))) {
    const k = normNombre(s(p.nombre));
    if (!k || out[k]) continue;
    out[k] = { nombre: s(p.nombre), color: libres.length ? libres[i++ % libres.length] : PALETA[i++ % PALETA.length], propio: false };
  }
  return out;
}

extend("colores_list", "any", async (_p, ctx) => {
  const gente = await personas(ctx);
  return { ok: true, colores: mapaColores(gente, await filas(ctx)), paleta: PALETA };
});

extend("color_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin cambia los colores" };
  const nombre = s(p.nombre).trim(), color = s(p.color).trim().toUpperCase();
  if (!nombre) return { error: "Falta la persona" };
  if (color && !HEX.test(color)) return { error: "Color inválido (usa #RRGGBB)" };
  const usuario = normNombre(nombre);
  const ya = (await filas(ctx)).find((r) => s(r.usuario) === usuario);
  const fila = { nombre, color: color || null, actualizado_por: actorOf(ses), updated_at: ctx.now.toISOString() };
  if (ya) await ctx.db.write(actorOf(ses), "beta_permisos_usuario", "update", { usuario }, fila);
  else await ctx.db.write(actorOf(ses), "beta_permisos_usuario", "insert", {}, { usuario, ...fila });
  return { ok: true, usuario, color };
});
