// Administración de usuario + contraseña (beta_credenciales). Cada quien pone el suyo desde «Mi acceso»;
// el admin puede poner o quitar el de cualquiera. Nunca se devuelve ni se registra la contraseña.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { s, type Row } from "./domain.ts";
import { hashPass, ITER, nuevaSal, normUsuario, validarPass, validarUsuario } from "./credenciales.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
async function equipo(ctx: Ctx): Promise<Row[]> {
  const a = await todas(ctx, "app_usuarios");
  const L = a.length ? a : await todas(ctx, "usuarios");
  return L.filter((u) => u.activo !== false).map((u) => ({ id: s(u.id), nombre: s(u.nombre) || s(u.name), rol: s(u.rol) || s(u.role), bloqueado: u.bloqueado === true }));
}
async function guardar(ctx: Ctx, ses: Ses, uid: string, usuario0: unknown, pass: string): Promise<Row> {
  const usuario = normUsuario(usuario0);
  const eu = validarUsuario(usuario); if (eu) return { error: eu };
  const ep = validarPass(pass, usuario); if (ep) return { error: ep };
  const creds = await todas(ctx, "beta_credenciales");
  if (creds.some((c) => normUsuario(c.usuario) === usuario && s(c.usuario_id) !== uid)) return { error: "Ese usuario ya lo tiene otra persona" };
  const sal = nuevaSal(), pass_hash = await hashPass(pass, sal, ITER);
  const row = { usuario, pass_hash, pass_salt: sal, iteraciones: ITER, intentos: 0, bloqueado_hasta: null, actualizado_por: s(ses.name) || actorOf(ses), updated_at: ctx.now.toISOString() };
  const ya = creds.find((c) => s(c.usuario_id) === uid);
  if (ya) await ctx.db.write(actorOf(ses), "beta_credenciales", "update", { usuario_id: uid }, row);
  else await ctx.db.write(actorOf(ses), "beta_credenciales", "insert", {}, { usuario_id: uid, ...row });
  return { ok: true, usuario };
}

extend("cred_mia_get", "any", async (_p, ctx, ses) => {
  const c = (await todas(ctx, "beta_credenciales")).find((x) => s(x.usuario_id) === s(ses.uid));
  return { ok: true, usuario: c ? s(c.usuario) : "", desde: c ? s(c.updated_at) : "" };
});
extend("cred_mia_guardar", "any", async (p, ctx, ses) => {
  if (s(p.password) !== s(p.password2)) return { error: "Las dos contraseñas no coinciden" };
  const r = await guardar(ctx, ses, s(ses.uid), p.usuario, s(p.password));
  if (r.ok) await logAccion(ctx.db, actorOf(ses), "ACCESO USUARIO", "cambió su usuario/contraseña (" + s(r.usuario) + ")");
  return r;
});
extend("cred_lista", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  const C = new Map((await todas(ctx, "beta_credenciales")).map((c) => [s(c.usuario_id), c]));
  return { ok: true, items: (await equipo(ctx)).map((u) => { const c = C.get(s(u.id)); return { ...u, usuario: c ? s(c.usuario) : "", desde: c ? s(c.updated_at) : "", bloqueada: !!c && !!c.bloqueado_hasta && Date.parse(s(c.bloqueado_hasta)) > ctx.now.getTime() }; }) };
});
extend("cred_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  const uid = s(p.usuario_id);
  const u = (await equipo(ctx)).find((x) => x.id === uid);
  if (!u) return { error: "Esa persona no está en el equipo" };
  const r = await guardar(ctx, ses, uid, p.usuario, s(p.password));
  if (r.ok) await logAccion(ctx.db, actorOf(ses), "ACCESO USUARIO", "puso usuario/contraseña a " + s(u.nombre) + " (" + s(r.usuario) + ")");
  return r;
});
extend("cred_quitar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  const uid = s(p.usuario_id);
  const c = (await todas(ctx, "beta_credenciales")).find((x) => s(x.usuario_id) === uid);
  if (!c) return { error: "No tiene usuario" };
  await ctx.db.write(actorOf(ses), "beta_credenciales", "delete", { usuario_id: uid }, null);
  await logAccion(ctx.db, actorOf(ses), "ACCESO USUARIO", "quitó el usuario " + s(c.usuario) + " (" + uid + ")");
  return { ok: true };
});
extend("cred_desbloquear", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  await ctx.db.write(actorOf(ses), "beta_credenciales", "update", { usuario_id: s(p.usuario_id) }, { intentos: 0, bloqueado_hasta: null });
  await logAccion(ctx.db, actorOf(ses), "ACCESO USUARIO", "desbloqueó " + s(p.usuario_id));
  return { ok: true };
});
