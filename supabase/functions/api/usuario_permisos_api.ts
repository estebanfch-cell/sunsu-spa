// Acciones de Permisos por usuario (pantalla Admin → Usuarios y permisos). Solo admin y super_admin editan.
import { extend } from "./handlers.ts";
import type { Ctx } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { s, type Row } from "./domain.ts";
import { acceso, esAdmin, matrizDe, normalizarRol } from "./permisos.ts";
import { FINOS, FLAGS, ROLES_EDITABLES, accesoEfectivo, limpiarOverride, nivelDeRol, perfilDeRol, vacio, type Override } from "./usuario_permisos.ts";

async function safeAll(ctx: Ctx, t: string): Promise<Row[]> {
  try { return await ctx.db.all(t); } catch { return []; }
}

const ROL_LABEL: Record<string, string> = {
  cosmetologa: "Cosmetóloga", asistente_cosmetologia: "Asistente de cosmetología", recepcion: "Recepción",
  gerente: "Gerencia", admin: "Admin", super_admin: "Super admin",
};

async function personas(ctx: Ctx): Promise<Row[]> {
  const app = await safeAll(ctx, "app_usuarios");
  const rows = app.length ? app : await safeAll(ctx, "usuarios");
  const marks = await safeAll(ctx, "cosmetologas");
  return rows.filter((u) => u.activo !== false).map((u) => {
    const id = String(u.id ?? u.usuario);
    const crudo = s(u.rol || u.role);
    let rol = normalizarRol(crudo);
    if (crudo === "staff") {
      const m = marks.find((x) => String(x.id) === id);
      rol = m && m.es_cosmetologa === true ? "cosmetologa" : "asistente_cosmetologia";
    }
    return { uid: id, nombre: s(u.nombre || u.name || id), short: s(u.short), rol, bloqueado: u.bloqueado === true };
  });
}

function efectivo(rol: string, matriz: Record<string, Partial<Record<string, "no" | "propio" | "todos">>>, o: Override | null) {
  const admin = esAdmin(rol);
  const niveles: Record<string, number> = {};
  const alcance: Record<string, string> = {};
  for (const m of FINOS) {
    const base = acceso(rol, m.id, matriz);
    const a = admin ? "todos" : accesoEfectivo(base, m.id, o);
    niveles[m.id] = admin ? m.max : o && o.niveles[m.id] !== undefined ? o.niveles[m.id] : nivelDeRol(base, m.id);
    alcance[m.id] = a;
  }
  const flags: Record<string, boolean> = {
    costos: admin || (o?.flags.costos ?? acceso(rol, "ver_costos", matriz) === "todos"),
    precios: admin || (o?.flags.precios ?? true),
    saldos: admin || (o?.flags.saldos ?? true),
  };
  return { niveles, alcance, flags };
}

extend("uperm_list", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin ve los permisos por usuario" };
  const matriz = await matrizDe(ctx.db);
  const filas = await safeAll(ctx, "app_usuario_permisos");
  const perfilesRows = await safeAll(ctx, "app_perfiles_permiso");
  const usuarios = (await personas(ctx)).map((u) => {
    const r = filas.find((x) => String(x.uid) === u.uid);
    const o = r ? limpiarOverride(r) : null;
    const ov = vacio(o) ? null : o;
    return {
      ...u, rolLabel: ROL_LABEL[String(u.rol)] || u.rol, admin: esAdmin(String(u.rol)),
      perfil: ov?.perfil || "", personalizado: !!ov, override: ov,
      efectivo: efectivo(String(u.rol), matriz, ov), rolBase: perfilDeRol(String(u.rol), matriz),
      editadoPor: r ? s(r.actualizado_por) : "", editadoAt: r ? s(r.updated_at) : "",
    };
  });
  const perfiles = ROLES_EDITABLES.map((rol) => ({ id: "rol:" + rol, nombre: "Como " + (ROL_LABEL[rol] || rol), sistema: true, ...perfilDeRol(rol, matriz) }))
    .concat(perfilesRows.filter((x) => x.activo !== false).map((x) => {
      const o = limpiarOverride({ uid: "", ...x })!;
      return { id: s(x.id), nombre: s(x.nombre), sistema: false, niveles: o.niveles, alcance: o.alcance, flags: o.flags };
    }));
  return { ok: true, modulos: FINOS, flags: FLAGS, usuarios, perfiles };
});

function validar(p: Row): { o: Override; error?: string } {
  const o = limpiarOverride({ uid: s(p.uid), perfil: s(p.perfil), niveles: p.niveles, alcance: p.alcance, flags: p.flags })!;
  for (const [k, n] of Object.entries((p.niveles as Row) || {})) {
    const m = FINOS.find((x) => x.id === k);
    if (!m) return { o, error: "Módulo desconocido: " + k };
    const x = Number(n);
    if (!Number.isInteger(x) || x < 0 || x > m.max) return { o, error: "«" + m.label + "» va de 0 a " + m.max };
  }
  return { o };
}

extend("uperm_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita permisos" };
  const uid = s(p.uid);
  const u = (await personas(ctx)).find((x) => x.uid === uid);
  if (!u) return { error: "Esa persona no está en el equipo" };
  if (esAdmin(String(u.rol))) return { error: "Admin y super admin siempre tienen todo; no llevan permisos por usuario" };
  const { o, error } = validar(p);
  if (error) return { error };
  const out = await ctx.db.rpc("app_usuario_permiso_guardar", {
    p_uid: uid, p_perfil: o.perfil || null, p_niveles: o.niveles, p_alcance: o.alcance, p_flags: o.flags, p_actor: actorOf(ses),
  });
  if (out == null) return { error: "Falta aplicar 0040_permisos_usuario.sql" };
  return { ok: true, uid, personalizado: !vacio(o) };
});

extend("uperm_perfil_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita perfiles" };
  const nombre = s(p.nombre).slice(0, 60);
  if (nombre.length < 3) return { error: "El perfil necesita un nombre" };
  const { o, error } = validar(p);
  if (error) return { error };
  const id = s(p.id) && !s(p.id).startsWith("rol:") ? s(p.id) : "pf-" + crypto.randomUUID().slice(0, 8);
  const out = await ctx.db.rpc("app_perfil_permiso_guardar", {
    p_id: id, p_nombre: nombre, p_niveles: o.niveles, p_alcance: o.alcance, p_flags: o.flags, p_activo: p.activo !== false, p_actor: actorOf(ses),
  });
  if (out == null) return { error: "Falta aplicar 0040_permisos_usuario.sql" };
  return { ok: true, id };
});

extend("uperm_historial", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin ve el historial de permisos" };
  let rows: unknown = null;
  try { rows = await ctx.db.rpc("app_usuario_permiso_cambios", { p_uid: s(p.uid) }); } catch { rows = null; }
  return { ok: true, cambios: Array.isArray(rows) ? rows.slice(0, 50) : [] };
});

