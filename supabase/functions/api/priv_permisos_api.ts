// Permisos de privacidad por rol y por usuario (TK73), en Configuración general.
// Teléfonos, emails, sector, costos, descargas y ver todos los tickets. Admin siempre los tiene.
// Por defecto el personal no: soltarlos aquí escribe app_modulos (rol) o el flag en app_usuario_permisos.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { s, type Row } from "./domain.ts";
import { acceso, esAdmin, flagsDeRol, matrizDe, PRIV_FLAGS, type PrivFlag } from "./permisos.ts";
import { cargarOverride, vacio, type Override } from "./usuario_permisos.ts";
import { personas } from "./usuario_permisos_api.ts";

const ROLES_EDIT = ["cosmetologa", "asistente_cosmetologia", "recepcion", "gerente"];

function flagDe(id: string) {
  return PRIV_FLAGS.find((f) => f.id === id) || null;
}
function truthy(v: unknown): boolean {
  return v === true || v === "true" || v === "todos" || v === 1 || v === "1";
}

export function accesoDeFlag(id: PrivFlag, valor: boolean, rol: string, matriz: Parameters<typeof acceso>[2]): "no" | "propio" | "todos" {
  if (id === "tickets_todos") {
    if (valor) return "todos";
    return acceso(rol, "tickets", matriz) === "no" ? "no" : "propio";
  }
  return valor ? "todos" : "no";
}

function efectivo(rol: string, matriz: Parameters<typeof flagsDeRol>[1], o: Override | null) {
  const rolF = flagsDeRol(rol, matriz);
  const flags: Record<string, boolean> = { ...rolF };
  const origen: Record<string, "rol" | "usuario"> = {};
  for (const f of PRIV_FLAGS) {
    if (o?.flags[f.id] !== undefined) {
      flags[f.id] = !!o.flags[f.id];
      origen[f.id] = "usuario";
    } else origen[f.id] = "rol";
  }
  return { flags, origen, rolFlags: rolF };
}

extend("cfg_priv_get", "any", async (_p, ctx, ses) => {
  if (!ses) return { error: "Inicia sesión" };
  if (!esAdmin(ses.rol)) return { error: "Solo administración configura estos permisos" };
  const matriz = await matrizDe(ctx.db);
  const roles = ROLES_EDIT.map((rol) => ({ rol, flags: flagsDeRol(rol, matriz) }));
  const usuarios: Row[] = [];
  for (const u of await personas(ctx)) {
    const rol = String(u.rol || "");
    if (esAdmin(rol)) continue;
    const o = await cargarOverride(ctx.db, String(u.uid));
    const ev = efectivo(rol, matriz, vacio(o) ? null : o);
    usuarios.push({ uid: u.uid, nombre: u.nombre, short: u.short, rol, ...ev });
  }
  return { ok: true, flags: PRIV_FLAGS, roles, usuarios, nota: "Admin y super admin siempre tienen estos permisos. El personal arranca sin ellos; al marcarlos aquí se sueltan por rol o, si lo cambias abajo, solo para esa persona." };
});

extend("cfg_priv_guardar", "any", async (p, ctx, ses) => {
  if (!ses) return { error: "Inicia sesión" };
  if (!esAdmin(ses.rol)) return { error: "Solo administración configura estos permisos" };
  const f = flagDe(s(p.flag));
  if (!f) return { error: "Ese permiso no existe" };
  const valor = truthy(p.valor);
  const ambito = s(p.ambito);
  const matriz = await matrizDe(ctx.db);
  if (ambito === "rol") {
    const rol = s(p.rol);
    if (!ROLES_EDIT.includes(rol)) return { error: "Rol no editable" };
    const acc = accesoDeFlag(f.id, valor, rol, matriz);
    const rows = await ctx.db.all("app_modulos").catch(() => [] as Row[]);
    const hit = rows.find((r) => s(r.rol) === rol && s(r.modulo) === f.modulo);
    if (hit) await ctx.db.write(actorOf(ses), "app_modulos", "update", { rol, modulo: f.modulo }, { acceso: acc });
    else await ctx.db.write(actorOf(ses), "app_modulos", "insert", {}, { rol, modulo: f.modulo, acceso: acc });
    return { ok: true, ambito: "rol", rol, flag: f.id, acceso: acc };
  }
  if (ambito === "usuario") {
    const uid = s(p.uid);
    const u = (await personas(ctx)).find((x) => s(x.uid) === uid);
    if (!u) return { error: "Esa persona no está en el equipo" };
    if (esAdmin(String(u.rol))) return { error: "Admin y super admin siempre tienen estos permisos" };
    // Se tocan solo los flags; niveles, alcance (_crud, _personas) y perfil se dejan como están.
    const parse = (x: unknown): Row => {
      if (!x) return {};
      if (typeof x === "string") { try { return JSON.parse(x) as Row; } catch { return {}; } }
      return typeof x === "object" ? x as Row : {};
    };
    let raw: Row | undefined;
    try { raw = (await ctx.db.all("app_usuario_permisos")).find((r) => s(r.uid) === uid); } catch { raw = undefined; }
    const rolF = flagsDeRol(String(u.rol), matriz);
    const flags: Record<string, boolean> = {};
    for (const [k, b] of Object.entries(parse(raw?.flags))) if (typeof b === "boolean") flags[k] = b;
    if (valor === rolF[f.id]) delete flags[f.id];
    else flags[f.id] = valor;
    const out = await ctx.db.rpc("app_usuario_permiso_guardar", {
      p_uid: uid,
      p_perfil: raw?.perfil ? s(raw.perfil) : null,
      p_niveles: parse(raw?.niveles),
      p_alcance: parse(raw?.alcance),
      p_flags: flags,
      p_actor: actorOf(ses),
    });
    if (out == null) return { error: "Falta aplicar 0040_permisos_usuario.sql" };
    return { ok: true, ambito: "usuario", uid, flag: f.id, valor: flags[f.id] ?? rolF[f.id], origen: flags[f.id] === undefined ? "rol" : "usuario" };
  }
  return { error: "Indica si el cambio es por rol o por usuario" };
});
