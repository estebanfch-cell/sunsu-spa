// DEV-31b (Emilia t907u/t908u) · «Configuración de rol»: datos base de cada empleada para el rol de pagos.
//  - Fuente de verdad del rol: sueldo base, bono, afiliación IESS, fecha de ingreso, activa. Solo administración.
//  - Décimos 13º y 14º siempre mensualizados. Fondo de reserva mensualizado, solo desde que cumple 1 año de la fecha
//    de ingreso (8,33 %, primer mes prorrateado por días: ver rolCalcularOficial).
//  - Toda alta o cambio queda en beta_rol_config_log (quién, antes/después, motivo) y en la bitácora general.
//  - EFCH y Emi son administradoras, no empleadas: nunca aparecen aquí ni en el rol.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, adminesDe, bajasDe, logAccion } from "./lib.ts";
import { n, normNombre, round2, s, type Row } from "./domain.ts";
import { esAdmin } from "./permisos.ts";
import { mismaPersonaRol } from "./roles_api.ts";

export type ConfigRol = {
  persona: string; nombreCompleto: string; cedula: string; cargo: string;
  sueldoBase: number; bono: number; afiliada: boolean; fechaIngreso: string; activa: boolean; notas: string;
  /** DEV-31l (t941u): sin Jibble/asistencia, asumir la jornada de los días hábiles sin marca. */
  asumirSinMarcajes: boolean;
};

export function configDeFila(r: Row): ConfigRol {
  return {
    persona: s(r.persona), nombreCompleto: s(r.nombre_completo), cedula: s(r.cedula), cargo: s(r.cargo),
    sueldoBase: round2(n(r.sueldo_base)), bono: round2(n(r.bono)), afiliada: r.afiliada_iess !== false,
    fechaIngreso: s(r.fecha_ingreso).slice(0, 10), activa: r.activa !== false, notas: s(r.notas),
    asumirSinMarcajes: r.asumir_sin_marcajes === true,
  };
}

export async function configsRol(ctx: Ctx): Promise<Row[]> {
  return (await ctx.db.all("beta_rol_config").catch(() => [] as Row[])).filter((r) => s(r.persona));
}

export function buscarConfig(rows: Row[], persona: string): Row | null {
  const k = normNombre(persona);
  return rows.find((r) => normNombre(s(r.persona)) === k)
    || rows.find((r) => mismaPersonaRol(s(r.persona), persona) || mismaPersonaRol(s(r.nombre_completo), persona))
    || null;
}

/** Configuración de rol de una persona (o null si todavía no tiene fila: el rol usa entonces la hoja RRHH). */
export async function configRolDe(ctx: Ctx, persona: string): Promise<ConfigRol | null> {
  const hit = buscarConfig(await configsRol(ctx), persona);
  return hit ? configDeFila(hit) : null;
}

/** Fecha en que cumple 1 año (el fondo corre desde ese día, inclusive). */
export function fondoDesdeDe(fechaIngreso: string): string {
  const m = s(fechaIngreso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return new Date(Date.UTC(Number(m[1]) + 1, Number(m[2]) - 1, Number(m[3]))).toISOString().slice(0, 10);
}

async function logCfg(ctx: Ctx, ses: Ses, persona: string, accion: string, antes: Row | null, despues: Row | null, motivo: string) {
  await ctx.db.write(actorOf(ses), "beta_rol_config_log", "insert", {}, {
    id: crypto.randomUUID(), persona, accion, actor: actorOf(ses), antes, despues, motivo: motivo || null,
    origin: ses.prueba ? "test" : "beta", created_at: ctx.now.toISOString(),
  });
  await logAccion(ctx.db, actorOf(ses), "CONFIG ROL " + accion.toUpperCase(), persona + (motivo ? " · " + motivo : ""));
}

function vistaCfg(c: ConfigRol, hoy: string): Row {
  const desde = fondoDesdeDe(c.fechaIngreso);
  const fondo = !c.afiliada ? "No aplica (sin IESS)" : !desde ? "Falta la fecha de ingreso" : desde <= hoy ? "Desde " + desde : "A partir del " + desde;
  return { ...c, fondoDesde: desde, fondoEstado: fondo, fondoActivo: c.afiliada && !!desde && desde <= hoy };
}

/** Empleadas del rol: hoja RRHH sin bajas ni administradoras. */
async function plantillaRrhh(ctx: Ctx): Promise<Row[]> {
  const { esFilaNotasRrhh } = await import("./empleados_api.ts");
  const baja = await bajasDe(ctx.db);
  const esAdm = await adminesDe(ctx.db);
  return (await ctx.db.all("rrhh_empleadas").catch(() => [] as Row[]))
    .filter((r) => !esFilaNotasRrhh(r) && (s(r.nombre_app) || s(r.apellidos_y_nombres)))
    .filter((r) => !baja(s(r.nombre_app)) && !baja(s(r.nombre_jibble)) && !baja(s(r.cedula)) && !esAdm(s(r.nombre_app) || s(r.apellidos_y_nombres)));
}

extend("rolcfg_lista", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración ve la configuración de rol." };
  const hoy = ctx.now.toISOString().slice(0, 10);
  const esAdm = await adminesDe(ctx.db);
  const baja = await bajasDe(ctx.db);
  const filas = (await configsRol(ctx)).filter((r) => !esAdm(s(r.persona)));
  const items = filas.filter((r) => r.activa !== false && !baja(s(r.persona))).map((r) => vistaCfg(configDeFila(r), hoy)).sort((a, b) => s(a.persona).localeCompare(s(b.persona), "es"));
  const inactivas = filas.filter((r) => r.activa === false || baja(s(r.persona))).map((r) => vistaCfg(configDeFila(r), hoy));
  const sinConfig: Row[] = [];
  for (const e of await plantillaRrhh(ctx)) {
    const nombre = s(e.nombre_app) || s(e.apellidos_y_nombres);
    if (buscarConfig(filas, nombre)) continue;
    sinConfig.push({ persona: nombre, nombreCompleto: s(e.apellidos_y_nombres), cedula: s(e.cedula), cargo: s(e.cargo), sueldoBase: n(e.sueldo_base), bono: n(e.bono_fijo), fechaIngreso: s(e.fecha_ingreso).slice(0, 10) });
  }
  const log = (await ctx.db.all("beta_rol_config_log").catch(() => [] as Row[]))
    .sort((a, b) => s(b.created_at).localeCompare(s(a.created_at))).slice(0, 60)
    .map((r) => ({ persona: s(r.persona), accion: s(r.accion), actor: s(r.actor), motivo: s(r.motivo), fecha: s(r.created_at), antes: r.antes || null, despues: r.despues || null }));
  return { ok: true, hoy, items, inactivas, sinConfig, log };
});

extend("rolcfg_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración cambia la configuración de rol." };
  if (ses.prueba) return { error: "La simulación no cambia la configuración real del rol." };
  const persona = s(p.persona).trim();
  if (!persona) return { error: "Elige a la empleada." };
  if ((await adminesDe(ctx.db))(persona)) return { error: "EFCH y Emi son administradoras: no tienen rol de pagos." };
  const filas = await configsRol(ctx);
  const prev = buscarConfig(filas, persona);
  const roster = await plantillaRrhh(ctx);
  const rrhh = roster.find((e) => normNombre(s(e.nombre_app)) === normNombre(persona) || mismaPersonaRol(s(e.nombre_app), persona));
  if (!prev && !rrhh) return { error: "Esa persona no está en Personal › Empleados. Primero créala allí." };
  const sueldo = round2(n(p.sueldoBase ?? p.sueldo_base));
  const bono = round2(n(p.bono));
  if (!(sueldo >= 0) || sueldo > 20000) return { error: "El sueldo base no es válido." };
  if (!(bono >= 0) || bono > 20000) return { error: "El bono no es válido." };
  const afiliada = p.afiliada === true || p.afiliada === "true" || p.afiliada === 1 || p.afiliada === "1" || p.afiliada === "si" || p.afiliada === "sí";
  const fecha = s(p.fechaIngreso ?? p.fecha_ingreso).slice(0, 10);
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "La fecha de ingreso no es válida." };
  if (!fecha) return { error: "Escribe la fecha de ingreso: de ella depende el fondo de reserva." };
  const activa = !(p.activa === false || p.activa === "false" || p.activa === 0 || p.activa === "0");
  const asumirDado = p.asumirSinMarcajes !== undefined || p.asumir_sin_marcajes !== undefined;
  const asumirSinMarcajes = asumirDado
    ? p.asumirSinMarcajes === true || p.asumirSinMarcajes === "true" || p.asumirSinMarcajes === 1 || p.asumirSinMarcajes === "1" || p.asumirSinMarcajes === "si" || p.asumir_sin_marcajes === true
    : (prev ? prev.asumir_sin_marcajes === true : false);
  const now = ctx.now.toISOString();
  const fila: Row = {
    persona: prev ? s(prev.persona) : persona,
    nombre_completo: s(p.nombreCompleto) || s(prev?.nombre_completo) || s(rrhh?.apellidos_y_nombres) || null,
    cedula: s(p.cedula) || s(prev?.cedula) || (rrhh ? s(rrhh.cedula).replace(/\.0$/, "") : "") || null,
    cargo: s(p.cargo) || s(prev?.cargo) || s(rrhh?.cargo) || null,
    sueldo_base: sueldo, bono, afiliada_iess: afiliada, fecha_ingreso: fecha, activa,
    notas: s(p.notas).slice(0, 400) || null,
    asumir_sin_marcajes: asumirSinMarcajes,
    origin: "beta", actualizado_por: actorOf(ses), updated_at: now,
  };
  const motivo = s(p.motivo).slice(0, 300);
  if (prev) {
    const antes = configDeFila(prev);
    const despues = configDeFila({ ...prev, ...fila });
    if (JSON.stringify(antes) === JSON.stringify(despues)) return { ok: true, sinCambios: true, item: vistaCfg(despues, now.slice(0, 10)) };
    await ctx.db.write(actorOf(ses), "beta_rol_config", "update", { persona: s(prev.persona) }, fila);
    await logCfg(ctx, ses, s(prev.persona), antes.activa !== despues.activa ? (despues.activa ? "reactivar" : "desactivar") : "editar", antes as unknown as Row, despues as unknown as Row, motivo);
    try { const { asegurarOverlay } = await import("./empleados_api.ts"); await asegurarOverlay(ctx, ses, s(fila.persona), { afiliada_iess: afiliada }); } catch { /* el rol ya usa esta fila */ }
    return { ok: true, item: vistaCfg(despues, now.slice(0, 10)) };
  }
  await ctx.db.write(actorOf(ses), "beta_rol_config", "insert", {}, { ...fila, created_at: now });
  const despues = configDeFila(fila);
  await logCfg(ctx, ses, despues.persona, "crear", null, despues as unknown as Row, motivo);
  try { const { asegurarOverlay } = await import("./empleados_api.ts"); await asegurarOverlay(ctx, ses, despues.persona, { afiliada_iess: afiliada }); } catch { /* el rol ya usa esta fila */ }
  return { ok: true, item: vistaCfg(despues, now.slice(0, 10)) };
});

/**
 * Empleadas con rol de pagos: hoja RRHH sin bajas, sin administradoras (EFCH, Emi) y sin las marcadas inactivas en
 * «Configuración de rol». Cargo, cédula y afiliación IESS salen de esa configuración cuando existe.
 */
export async function empleadasDelRol(ctx: Ctx): Promise<{ nombre: string; cargo: string; cedula: string; afiliada: boolean; ingreso: string }[]> {
  const { afiliadaSegunOverlay } = await import("./empleados_api.ts");
  const overlays = await ctx.db.all("beta_empleados").catch(() => [] as Row[]);
  const cfgs = await configsRol(ctx);
  const out = [];
  for (const e of await plantillaRrhh(ctx)) {
    const nombre = s(e.nombre_app) || s(e.apellidos_y_nombres);
    const c = buscarConfig(cfgs, nombre);
    if (c && c.activa === false) continue;
    out.push({
      nombre, cargo: (c && s(c.cargo)) || s(e.cargo), cedula: (c && s(c.cedula)) || s(e.cedula).replace(/\.0$/, ""),
      afiliada: c ? c.afiliada_iess !== false : afiliadaSegunOverlay(overlays, nombre),
      ingreso: (c && s(c.fecha_ingreso).slice(0, 10)) || s(e.fecha_ingreso).slice(0, 10),
    });
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
