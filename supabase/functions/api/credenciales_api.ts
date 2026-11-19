// Administración de usuario + contraseña (beta_credenciales). Cada quien pone el suyo desde «Mi acceso»;
// el admin puede poner o quitar el de cualquiera. Nunca se devuelve ni se registra la contraseña.
// TK147: correo en el perfil y reseteo por enlace (el token en claro no se guarda).
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { s, type Row } from "./domain.ts";
import { enviarCorreo, enlaceReset, proveedorCorreo } from "./correo.ts";
import { credencialActiva, hashPass, hashTokenReset, igualSeguro, ITER, marcarPinDesactivado, nuevaSal, nuevoTokenReset, normEmail, normUsuario, RESET_MIN, validarEmail, validarPass, validarUsuario } from "./credenciales.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
async function equipo(ctx: Ctx): Promise<Row[]> {
  const a = await todas(ctx, "app_usuarios");
  const L = a.length ? a : await todas(ctx, "usuarios");
  return L.filter((u) => u.activo !== false).map((u) => ({ id: s(u.id), nombre: s(u.nombre) || s(u.name), rol: s(u.rol) || s(u.role), bloqueado: u.bloqueado === true }));
}
function mascaraEmail(e: string): string {
  const [u, d] = e.split("@");
  if (!d) return "";
  const vis = u.slice(0, 1) || "•";
  return vis + "***@" + d;
}
async function guardar(ctx: Ctx, ses: Ses, uid: string, usuario0: unknown, pass: string, debeCambiar = false, email0: unknown = ""): Promise<Row> {
  const creds = await todas(ctx, "beta_credenciales");
  const ya0 = creds.find((c) => s(c.usuario_id) === uid);
  const usuario = normUsuario(usuario0) || (ya0 ? normUsuario(ya0.usuario) : "");
  const eu = validarUsuario(usuario); if (eu) return { error: eu };
  const email = normEmail(email0) || (ya0 ? normEmail(ya0.email) : "");
  const obligatorio = !ya0 || !s(ya0.email);
  const ee = validarEmail(email, obligatorio); if (ee) return { error: ee };
  if (email && creds.some((c) => normEmail(c.email) === email && s(c.usuario_id) !== uid)) return { error: "Ese correo ya lo tiene otra persona" };
  if (creds.some((c) => normUsuario(c.usuario) === usuario && s(c.usuario_id) !== uid)) return { error: "Ese usuario ya lo tiene otra persona" };
  const soloCorreo = !pass && !!ya0;
  if (soloCorreo) {
    await ctx.db.write(actorOf(ses), "beta_credenciales", "update", { usuario_id: uid }, {
      usuario, email, actualizado_por: s(ses.name) || actorOf(ses), updated_at: ctx.now.toISOString(),
    });
    return { ok: true, usuario, email, debe_cambiar: ya0.debe_cambiar_pass === true, tiene_usuario: credencialActiva(ya0) };
  }
  const ep = validarPass(pass, usuario); if (ep) return { error: ep };
  if (ya0 && ya0.debe_cambiar_pass === true) {
    const igual = await hashPass(pass, s(ya0.pass_salt), Number(ya0.iteraciones) || ITER);
    if (igualSeguro(igual, s(ya0.pass_hash))) return { error: "Elige una contraseña distinta a la temporal" };
  }
  const sal = nuevaSal(), pass_hash = await hashPass(pass, sal, ITER);
  const ya = creds.find((c) => s(c.usuario_id) === uid);
  const row: Row = { usuario, email, pass_hash, pass_salt: sal, iteraciones: ITER, intentos: 0, bloqueado_hasta: null, actualizado_por: s(ses.name) || actorOf(ses), updated_at: ctx.now.toISOString(), debe_cambiar_pass: debeCambiar };
  if (ya) await ctx.db.write(actorOf(ses), "beta_credenciales", "update", { usuario_id: uid }, row);
  else await ctx.db.write(actorOf(ses), "beta_credenciales", "insert", {}, { usuario_id: uid, ...row });
  return { ok: true, usuario, email, debe_cambiar: debeCambiar, tiene_usuario: !debeCambiar };
}

async function emitirReset(ctx: Ctx, uid: string, creadoPor: string): Promise<{ token: string; exp: Date }> {
  const token = nuevoTokenReset();
  const token_hash = await hashTokenReset(token);
  const exp = new Date(ctx.now.getTime() + RESET_MIN * 60000);
  await ctx.db.write(creadoPor || "reset", "beta_password_resets", "insert", {}, {
    usuario_id: uid, token_hash, exp: exp.toISOString(), usado_at: null, created_at: ctx.now.toISOString(), creado_por: creadoPor || "",
  });
  return { token, exp };
}

async function buscarReset(ctx: Ctx, token: string): Promise<Row | null> {
  if (!s(token)) return null;
  const h = await hashTokenReset(s(token));
  const rows = await todas(ctx, "beta_password_resets");
  const r = rows.find((x) => s(x.token_hash) === h);
  if (!r) return null;
  if (r.used_at || r.usado_at) return null;
  if (!(Date.parse(s(r.exp)) > ctx.now.getTime())) return null;
  return r;
}

extend("cred_mia_get", "any", async (_p, ctx, ses) => {
  const c = (await todas(ctx, "beta_credenciales")).find((x) => s(x.usuario_id) === s(ses.uid));
  const tiene = credencialActiva(c);
  return { ok: true, usuario: c ? s(c.usuario) : "", email: c ? s(c.email) : "", desde: c ? s(c.updated_at) : "", debe_cambiar: !!(c && c.debe_cambiar_pass === true), tiene_usuario: tiene };
});
extend("cred_mia_guardar", "any", async (p, ctx, ses) => {
  if (s(p.password) || s(p.password2)) {
    if (s(p.password) !== s(p.password2)) return { error: "Las dos contraseñas no coinciden" };
  }
  const r = await guardar(ctx, ses, s(ses.uid), p.usuario, s(p.password), false, p.email);
  if (r.ok && s(p.password)) {
    await marcarPinDesactivado(ctx, actorOf(ses), s(ses.uid), true);
    await logAccion(ctx.db, actorOf(ses), "ACCESO USUARIO", "cambió su usuario/contraseña (" + s(r.usuario) + ")");
  } else if (r.ok) {
    await logAccion(ctx.db, actorOf(ses), "ACCESO USUARIO", "actualizó su correo").catch(() => null);
  }
  return r;
});
extend("cred_lista", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  const C = new Map((await todas(ctx, "beta_credenciales")).map((c) => [s(c.usuario_id), c]));
  return { ok: true, items: (await equipo(ctx)).map((u) => {
    const c = C.get(s(u.id));
    return { ...u, usuario: c ? s(c.usuario) : "", email: c ? s(c.email) : "", desde: c ? s(c.updated_at) : "", debe_cambiar: !!(c && c.debe_cambiar_pass === true), bloqueada: !!c && !!c.bloqueado_hasta && Date.parse(s(c.bloqueado_hasta)) > ctx.now.getTime(), tiene_usuario: credencialActiva(c) };
  }) };
});
extend("cred_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  const uid = s(p.usuario_id);
  const u = (await equipo(ctx)).find((x) => x.id === uid);
  if (!u) return { error: "Esa persona no está en el equipo" };
  const r = await guardar(ctx, ses, uid, p.usuario, s(p.password), p.debe_cambiar !== false, p.email);
  if (r.ok) await logAccion(ctx.db, actorOf(ses), "ACCESO USUARIO", "puso usuario/contraseña temporal a " + s(u.nombre) + " (" + s(r.usuario) + ")");
  return r;
});
extend("cred_quitar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  const uid = s(p.usuario_id);
  const c = (await todas(ctx, "beta_credenciales")).find((x) => s(x.usuario_id) === uid);
  if (!c) return { error: "No tiene usuario" };
  await ctx.db.write(actorOf(ses), "beta_credenciales", "delete", { usuario_id: uid }, null);
  await marcarPinDesactivado(ctx, actorOf(ses), uid, false);
  await logAccion(ctx.db, actorOf(ses), "ACCESO USUARIO", "quitó el usuario " + s(c.usuario) + " (" + uid + ")");
  return { ok: true };
});
extend("cred_desbloquear", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  await ctx.db.write(actorOf(ses), "beta_credenciales", "update", { usuario_id: s(p.usuario_id) }, { intentos: 0, bloqueado_hasta: null });
  await logAccion(ctx.db, actorOf(ses), "ACCESO USUARIO", "desbloqueó " + s(p.usuario_id));
  return { ok: true };
});

extend("cred_enviar_reset", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  const uid = s(p.usuario_id);
  const c = (await todas(ctx, "beta_credenciales")).find((x) => s(x.usuario_id) === uid);
  if (!c || !s(c.pass_hash)) return { error: "Esa persona todavía no tiene usuario y contraseña" };
  const email = normEmail(c.email);
  const { token } = await emitirReset(ctx, uid, actorOf(ses));
  const enlace = enlaceReset(ctx.env, token);
  let enviado = false, motivo = "";
  if (email) {
    const envio = await enviarCorreo(ctx, {
      para: email,
      asunto: "Restablece tu contraseña de Sunsu Spa",
      texto: "Hola. Emilia o un administrador pidió restablecer tu contraseña. Abre este enlace (vale 45 minutos):\n" + enlace + "\n\nSi no fuiste tú, ignora este mensaje.",
    });
    enviado = envio.enviado === true;
    motivo = s(envio.motivo);
  } else {
    motivo = "esta persona todavía no tiene un correo registrado";
  }
  await logAccion(ctx.db, actorOf(ses), "RESET CLAVE", "solicitó reseteo para " + s(c.usuario) + (enviado ? " (correo enviado)" : " (enlace para copiar)")).catch(() => null);
  return { ok: true, enviado, email: email ? mascaraEmail(email) : "", motivo, enlace, proveedor: proveedorCorreo(ctx.env) };
});

extend("reset_pedir", "public", async (p, ctx) => {
  const q = normEmail(p.email) || normUsuario(p.usuario);
  const generico = { ok: true, mensaje: "Si ese usuario o correo está registrado, te enviamos las instrucciones." };
  if (!q) return generico;
  const creds = await todas(ctx, "beta_credenciales");
  const c = creds.find((x) => normUsuario(x.usuario) === q || normEmail(x.email) === q) || null;
  if (!c || !s(c.pass_hash) || !normEmail(c.email)) return generico;
  const { token } = await emitirReset(ctx, s(c.usuario_id), "reset_pedir");
  const enlace = enlaceReset(ctx.env, token);
  await enviarCorreo(ctx, {
    para: normEmail(c.email),
    asunto: "Restablece tu contraseña de Sunsu Spa",
    texto: "Hola. Pediste restablecer tu contraseña. Abre este enlace (vale 45 minutos):\n" + enlace + "\n\nSi no fuiste tú, ignora este mensaje.",
  }).catch(() => null);
  await logAccion(ctx.db, "reset", "RESET CLAVE", "pedido de reseteo para " + s(c.usuario)).catch(() => null);
  return generico;
});

extend("reset_validar", "public", async (p, ctx) => {
  const r = await buscarReset(ctx, s(p.token));
  if (!r) return { ok: false, error: "Ese enlace no es válido o ya venció. Pide uno nuevo." };
  const c = (await todas(ctx, "beta_credenciales")).find((x) => s(x.usuario_id) === s(r.usuario_id));
  return { ok: true, usuario: c ? s(c.usuario) : "" };
});

extend("reset_aplicar", "public", async (p, ctx) => {
  if (s(p.password) !== s(p.password2)) return { error: "Las dos contraseñas no coinciden" };
  const r = await buscarReset(ctx, s(p.token));
  if (!r) return { error: "Ese enlace no es válido o ya venció. Pide uno nuevo." };
  const uid = s(r.usuario_id);
  const c = (await todas(ctx, "beta_credenciales")).find((x) => s(x.usuario_id) === uid);
  if (!c) return { error: "Esa cuenta ya no existe" };
  const usuario = s(c.usuario);
  const ep = validarPass(s(p.password), usuario); if (ep) return { error: ep };
  const sal = nuevaSal(), pass_hash = await hashPass(s(p.password), sal, ITER);
  await ctx.db.write("reset", "beta_credenciales", "update", { usuario_id: uid }, {
    pass_hash, pass_salt: sal, iteraciones: ITER, intentos: 0, bloqueado_hasta: null, debe_cambiar_pass: false, updated_at: ctx.now.toISOString(), actualizado_por: "reset",
  });
  const key = r.id != null ? { id: r.id } : { token_hash: r.token_hash };
  await ctx.db.write("reset", "beta_password_resets", "update", key, { used_at: ctx.now.toISOString() }).catch(() => null);
  await marcarPinDesactivado(ctx, "reset", uid, true);
  await logAccion(ctx.db, usuario || uid, "RESET CLAVE", "contraseña restablecida").catch(() => null);
  return { ok: true };
});
