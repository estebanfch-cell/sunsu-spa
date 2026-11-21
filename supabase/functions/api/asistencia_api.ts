// Marcajes, permisos/vacaciones sobre la tabla permisos, y horas para el rol.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, bajasDe, nextSheet } from "./lib.ts";
import { ecuadorParts, n, s, normNombre, type Row } from "./domain.ts";
import { acceso, esAdmin, esPropio, matrizDe } from "./permisos.ts";
import {
  diasDeVacacion, saldoVacaciones, validarSolicitudVacacion,
  calcularDia, calcularNomina, configDesde, estadoReloj, evaluarUbicacion, instanteEcuador, validarSecuencia, hmToMin,
  type JibbleIn, type MarcajeIn, type NominaHoras, type PermisoIn,
} from "./asistencia.ts";
import { enPrueba } from "./db.ts";

type R = Record<string, unknown>;

function ymdDeTs(ts: string): string {
  return ecuadorParts(new Date(ts)).ymd;
}

/** Solo admin y super_admin aprueban. gerente ve solo lo suyo, como el resto. */
function puedeAprobar(rol: string): boolean {
  return esAdmin(rol);
}

async function empleadaDe(ctx: Ctx, nombre: string): Promise<Row | undefined> {
  return (await ctx.db.all("rrhh_empleadas")).find((r) => s(r.nombre_app) && mismo(s(r.nombre_app), nombre));
}

export async function saldoDe(ctx: Ctx, nombre: string) {
  const e = await empleadaDe(ctx, nombre);
  return saldoVacaciones({
    fechaIngreso: e ? s(e.fecha_ingreso).slice(0, 10) || null : null,
    hoy: ecuadorParts(ctx.now).ymd,
    sueldo: e ? n(e.sueldo_base) : 0,
    permisos: permisosDe(await ctx.db.all("permisos"), nombre),
  });
}

function saldoPub(sal: Awaited<ReturnType<typeof saldoDe>>, conDinero: boolean) {
  if (conDinero) return sal;
  const { provisionMensual: _a, valorDia: _b, valorDisponible: _c, ...rest } = sal;
  return rest;
}

function propio(ses: Ses, matriz: Awaited<ReturnType<typeof matrizDe>>): boolean {
  return !esAdmin(ses.rol) && acceso(ses.rol, "asistencia", matriz) !== "todos";
}

function mismo(a: string, b: string): boolean {
  return esPropio(a, { rol: "", name: b, short: b, uid: "" }) || esPropio(b, { rol: "", name: a, short: a, uid: "" });
}

async function configDe(ctx: Ctx) {
  const rows = await ctx.db.all("asistencia_config");
  return configDesde(rows.find((r) => n(r.id) === 1) || rows[0]);
}

async function feriadosDe(ctx: Ctx): Promise<string[]> {
  try {
    return (await ctx.db.all("asistencia_feriados")).map((r) => s(r.fecha).slice(0, 10)).filter(Boolean);
  } catch { return []; }
}

function permisosDe(rows: Row[], nombre: string): PermisoIn[] {
  return rows.filter((r) => !r.borrado_at && mismo(s(r.empleada), nombre)).map((r) => ({
    tipo: s(r.tipo), estado: s(r.estado), desde: s(r.fecha_inicio), hasta: s(r.fecha_fin), horas: n(r.horas),
  }));
}

function marcajesDe(rows: Row[], nombre: string): MarcajeIn[] {
  return rows.filter((r) => mismo(s(r.nombre), nombre)).map((r) => ({
    id: s(r.id), nombre: s(r.nombre), tipo: s(r.tipo), ts: s(r.ts), anulado: r.anulado === true,
  }));
}

function personaJibble(r: Row): string {
  return s(r.persona) || s(r.nombre) || s(r.member) || s(r.empleada) || s(r.nombre_app);
}
function jibbleDe(rows: Row[], nombre: string): JibbleIn[] {
  return rows.filter((r) => mismo(personaJibble(r), nombre)).map((r) => ({
    fecha: s(r.fecha).slice(0, 10),
    payrollMin: n(r.payroll_minutes || r.payroll_min || r.minutos),
    suplMin: n(r.supplementary_minutes || r.supl_min),
    extrMin: n(r.extraordinary_minutes || r.extr_min),
    descMin: n(r.rest_day_minutes || r.desc_min),
  }));
}

async function nominaDe(ctx: Ctx, nombre: string, anio: number, mes: number, desde?: string, hasta?: string): Promise<NominaHoras> {
  const [marcajes, jibble, permisos, feriados, config] = await Promise.all([
    ctx.db.all("asistencia_marcajes").catch(() => []),
    ctx.db.all("jibble_historial").catch(() => []),
    ctx.db.all("permisos").catch(() => []),
    feriadosDe(ctx),
    configDe(ctx).catch(() => configDesde(undefined)),
  ]);
  let jornadaFn: ((fecha: string) => { trabaja: boolean; desde: string | null; hasta: string | null }) | undefined;
  try {
    const { cargarHorarios } = await import("./horarios_api.ts");
    const { horarioAsignado, jornadaDe } = await import("./horarios.ts");
    const pack = await cargarHorarios(ctx);
    const emp = await empleadaDe(ctx, nombre);
    const h = horarioAsignado(pack.horarios, pack.asignaciones, [nombre, s(emp?.nombre_app), s(emp?.apellidos_y_nombres), s(emp?.nombre_jibble)]);
    if (h) jornadaFn = (f) => jornadaDe(h, f);
  } catch { /* horarios opcionales */ }
  return calcularNomina({
    anio, mes, desde, hasta, config, feriados, hoy: ecuadorParts(ctx.now).ymd,
    marcajes: marcajesDe(marcajes, nombre),
    jibble: jibbleDe(jibble, nombre),
    permisos: permisosDe(permisos, nombre),
    jornadaDe: jornadaFn,
  });
}
export async function horasDeEmpleada(ctx: Ctx, nombre: string, anio: number, mes: number): Promise<NominaHoras> {
  return nominaDe(ctx, nombre, anio, mes);
}
export async function horasEnRango(ctx: Ctx, nombre: string, desde: string, hasta: string): Promise<NominaHoras> {
  const [y, m] = desde.split("-").map(Number);
  return nominaDe(ctx, nombre, y, m, desde, hasta);
}


export function hmDeMinutos(min: number): { h: number; min: number; texto: string; totalMin: number } {
  const t = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(t / 60);
  const m = t % 60;
  const texto = h === 0 ? `${m} min` : (m === 0 ? `${h} h` : `${h} h ${m} min`);
  return { h, min: m, texto, totalMin: t };
}

export function minutosDeNomina(horas: NominaHoras): { trabajadas: number; normales: number; extra50: number; extra100: number } {
  const dias = horas.dias || [];
  if (dias.length) {
    let worked = 0, ordinary = 0, e50 = 0, e100 = 0;
    for (const d of dias) {
      ordinary += Number(d.ordinaryMin) || 0;
      e50 += Number(d.supl50Min || d.suplMin) || 0;
      e100 += (Number(d.supl100Min || d.extrMin) || 0) + (Number(d.extraordinariasMin || d.descMin) || 0);
      worked += Number(d.workedMin) || 0;
    }
    return { trabajadas: worked || ordinary + e50 + e100, normales: ordinary, extra50: e50, extra100: e100 };
  }
  return {
    trabajadas: Math.round((horas.hrsTrabajadas || 0) * 60),
    normales: Math.round((horas.hrsOrdinarias || 0) * 60),
    extra50: Math.round((horas.hrsSupl || 0) * 60),
    extra100: Math.round(((horas.hrsExtr || 0) + (horas.hrsDesc || 0)) * 60),
  };
}

export function bloqueDeHoras(horas: NominaHoras) {
  const m = minutosDeNomina(horas);
  return {
    total: hmDeMinutos(m.trabajadas),
    normales: hmDeMinutos(m.normales),
    extra50: hmDeMinutos(m.extra50),
    extra100: hmDeMinutos(m.extra100),
    atrasoMin: horas.atrasoMin || 0,
    faltas: horas.faltas || 0,
    diasAsistidos: horas.diasPropios || 0,
    hayDatos: horas.hayDatos,
  };
}

function ymdUtc(dt: Date): string {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function lunesADomingo(ymd: string): { desde: string; hasta: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  const fin = new Date(dt);
  fin.setUTCDate(fin.getUTCDate() + 6);
  return { desde: ymdUtc(dt), hasta: ymdUtc(fin) };
}

export function limitesMes(ymd: string): { desde: string; hasta: string; anio: number; mes: number } {
  const [y, m] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    desde: `${y}-${String(m).padStart(2, "0")}-01`,
    hasta: `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
    anio: y, mes: m,
  };
}

function idHorasMes(nombre: string, anio: number, mes: number): string {
  return `${normNombre(nombre)}-${anio}-${String(mes).padStart(2, "0")}`;
}

function histPub(r: Row) {
  return {
    anio: n(r.anio), mes: n(r.mes),
    total: hmDeMinutos(n(r.min_trabajadas)),
    normales: hmDeMinutos(n(r.min_normales)),
    extra50: hmDeMinutos(n(r.min_extra50)),
    extra100: hmDeMinutos(n(r.min_extra100)),
    atrasoMin: n(r.atraso_min), faltas: n(r.faltas),
    diasAsistidos: n(r.dias_asistidos),
    cerrado: r.cerrado === true,
    actualizado: s(r.actualizado_at).slice(0, 10),
  };
}

async function guardarHistorialMes(ctx: Ctx, ses: Ses, nombre: string, ymd: string, horas: NominaHoras) {
  const lim = limitesMes(ymd);
  const hoy = ecuadorParts(ctx.now);
  const cerrado = lim.anio < hoy.y || (lim.anio === hoy.y && lim.mes < hoy.m);
  const b = bloqueDeHoras(horas);
  const id = idHorasMes(nombre, lim.anio, lim.mes);
  const fila = {
    id, nombre, anio: lim.anio, mes: lim.mes,
    min_trabajadas: b.total.totalMin, min_normales: b.normales.totalMin,
    min_extra50: b.extra50.totalMin, min_extra100: b.extra100.totalMin,
    atraso_min: b.atrasoMin, faltas: b.faltas, dias_asistidos: b.diasAsistidos,
    cerrado, actualizado_por: actorOf(ses), actualizado_at: ctx.now.toISOString(),
  };
  const ya = (await ctx.db.all("beta_asistencia_horas_mes").catch(() => [] as Row[])).find((r) => s(r.id) === id || (mismo(s(r.nombre), nombre) && n(r.anio) === lim.anio && n(r.mes) === lim.mes));
  if (ya) await ctx.db.write(actorOf(ses), "beta_asistencia_horas_mes", "update", { id: ya.id }, fila);
  else await ctx.db.write(actorOf(ses), "beta_asistencia_horas_mes", "insert", {}, fila);
  await ctx.db.write(actorOf(ses), "beta_asistencia_horas_log", "insert", {}, {
    nombre, anio: lim.anio, mes: lim.mes, min_trabajadas: b.total.totalMin, cerrado,
    accion: ya ? "actualizar" : "guardar", por: actorOf(ses), created_at: ctx.now.toISOString(),
  }).catch(() => null);
}


async function auditar(ctx: Ctx, ses: Ses, accion: string, extra: R) {
  await ctx.db.write(actorOf(ses), "asistencia_auditoria", "insert", {}, {
    actor: actorOf(ses), accion, nombre: s(extra.nombre || ses.name), ...extra, ts: ctx.now.toISOString(),
  });
}

extend("asis_config", "any", async (_p, ctx, ses) => {
  const cfg = await configDe(ctx);
  const admin = esAdmin(ses.rol);
  return {
    ok: true,
    config: admin ? { ...cfg, punto_listo: cfg.lat != null && cfg.lng != null } : {
      radio_m: cfg.radio_m, punto_listo: cfg.lat != null && cfg.lng != null,
      hora_entrada: cfg.hora_entrada, hora_salida: cfg.hora_salida, gracia_min: cfg.gracia_min,
      jornada_horas: cfg.jornada_horas, lugar_nombre: cfg.lugar_nombre,
    },
  };
});

extend("asis_config_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin cambia las reglas de asistencia" };
  const antes = await configDe(ctx);
  const row = {
    id: 1,
    lat: p.lat == null || p.lat === "" ? null : n(p.lat),
    lng: p.lng == null || p.lng === "" ? null : n(p.lng),
    radio_m: Math.max(20, n(p.radio_m) || antes.radio_m),
    hora_entrada: /^\d{2}:\d{2}$/.test(s(p.hora_entrada)) ? s(p.hora_entrada) : antes.hora_entrada,
    hora_salida: /^\d{2}:\d{2}$/.test(s(p.hora_salida)) ? s(p.hora_salida) : antes.hora_salida,
    jornada_horas: Math.min(12, Math.max(1, n(p.jornada_horas) || antes.jornada_horas)),
    gracia_min: Math.max(0, p.gracia_min == null || p.gracia_min === "" ? antes.gracia_min : n(p.gracia_min)),
    cuenta_antes: p.cuenta_antes === true || s(p.cuenta_antes) === "true",
    lugar_nombre: s(p.lugar_nombre) || antes.lugar_nombre || "C.C. La Esquina",
  };
  const rows = await ctx.db.all("asistencia_config");
  if (rows.length) await ctx.db.write(actorOf(ses), "asistencia_config", "update", { id: rows[0].id }, row);
  else await ctx.db.write(actorOf(ses), "asistencia_config", "insert", {}, row);
  await auditar(ctx, ses, "config", { nombre: ses.name, antes, despues: row, motivo: s(p.motivo) || "cambio de reglas" });
  return { ok: true, config: row };
});

extend("asis_marcar", "any", async (p, ctx, ses) => {
  const matriz = await matrizDe(ctx.db);
  if (acceso(ses.rol, "asistencia", matriz) === "no") return { error: "No tienes permiso" };
  const tipo = s(p.tipo);
  if (!["entrada", "salida", "almuerzo_inicio", "almuerzo_fin"].includes(tipo)) return { error: "Tipo de marca desconocido." };
  const nombre = esAdmin(ses.rol) && s(p.nombre) ? s(p.nombre) : ses.name;
  const cfg = await configDe(ctx);
  const ts = ctx.now.toISOString();
  const fecha = ymdDeTs(ts);
  const todos = await ctx.db.all("asistencia_marcajes");
  const mios = marcajesDe(todos, nombre).filter((m) => ymdDeTs(m.ts) === fecha);
  const seq = validarSecuencia(mios, tipo);
  if (seq) return { error: seq };
  const lat = p.lat == null || p.lat === "" ? null : n(p.lat);
  const lng = p.lng == null || p.lng === "" ? null : n(p.lng);
  const accuracy = p.precision_m == null || p.precision_m === "" ? null : n(p.precision_m);
  // TK175 (Emilia, urgente): una marca NUNCA se pierde por la foto. Sin selfie no se marca, pero si la foto es
  // muy grande, de un formato raro (HEIC) o no se puede subir, la marca se guarda sin foto y queda en la auditoría.
  if (!s(p.foto)) {
    await auditar(ctx, ses, "rechazo", { nombre, motivo: "La marca pide una selfie.", despues: { tipo } });
    return { error: "La marca pide una selfie." };
  }
  const fotoIn = selfieBytes(s(p.foto));
  const fotoAviso: string[] = [];
  if ("error" in fotoIn) fotoAviso.push(fotoIn.error);
  const geo = evaluarUbicacion(cfg, lat, lng, accuracy);
  if (!geo.ok) {
    await auditar(ctx, ses, "rechazo", { nombre, motivo: geo.error, despues: { tipo, distancia: geo.distancia ?? null } });
    return { error: geo.error, distancia: geo.distancia };
  }
  let fotoPath: string | null = null;
  if (!("error" in fotoIn)) {
    const subida = await subirSelfie(ctx, ses.uid, fecha, tipo, fotoIn).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
    if ("error" in subida) fotoAviso.push(subida.error);
    else fotoPath = subida.path;
  }
  const saved = await ctx.db.write(actorOf(ses), "asistencia_marcajes", "insert", {}, {
    usuario_id: ses.uid, nombre, tipo, ts, lat, lng, precision_m: accuracy,
    dentro_radio: true, foto: fotoPath, origen: s(p.origen) === "recepcion" ? "recepcion" : "telefono", anulado: false,
    origin: enPrueba(ctx.db) ? "test" : undefined,
  });
  const dia = calcularDia(fecha, marcajesDe(await ctx.db.all("asistencia_marcajes"), nombre), cfg, await feriadosDe(ctx), permisosDe(await ctx.db.all("permisos"), nombre));
  if (fotoAviso.length) await auditar(ctx, ses, "selfie_omitida", { nombre, marcaje_id: s(saved?.id), motivo: "Marca guardada sin foto: " + fotoAviso.join(" · "), despues: { tipo, ts } }).catch(() => null);
  return { ok: true, id: saved?.id, marcaje: { id: saved?.id, nombre, tipo, ts }, dia, sinFoto: fotoAviso.length ? true : undefined };
});

extend("asis_hoy", "any", async (p, ctx, ses) => {
  const matriz = await matrizDe(ctx.db);
  if (acceso(ses.rol, "asistencia", matriz) === "no") return { error: "No tienes permiso" };
  const nombre = esAdmin(ses.rol) && s(p.nombre) ? s(p.nombre) : ses.name;
  const cfg = await configDe(ctx);
  const fecha = ecuadorParts(ctx.now).ymd;
  const crudos = (await ctx.db.all("asistencia_marcajes")).filter((r) => mismo(s(r.nombre), nombre) && ymdDeTs(s(r.ts)) === fecha);
  const marcajes = marcajesDe(crudos, nombre);
  const dia = calcularDia(fecha, marcajes, cfg, await feriadosDe(ctx), permisosDe(await ctx.db.all("permisos"), nombre));
  const reloj = estadoReloj(marcajes, ctx.now.toISOString());
  const permisos = (await ctx.db.all("permisos"))
    .filter((r) => !r.borrado_at && (!propio(ses, matriz) || esPropio(s(r.empleada), ses)))
    .map(permisoPub);
  let vacaciones: unknown = null;
  try { vacaciones = await saldoDe(ctx, nombre); } catch { vacaciones = null; }
  let auditoria: Row[] = [];
  try {
    auditoria = (await ctx.db.all("asistencia_auditoria"))
      .filter((r) => esAdmin(ses.rol) || esPropio(s(r.nombre), ses))
      .slice(-8).reverse();
  } catch { auditoria = []; }
  const pendientes = puedeAprobar(ses.rol) ? permisos.filter((r) => /pend/i.test(s(r.estado))).length : 0;
  let equipo: R[] | undefined;
  let feriados: R[] | undefined;
  if (esAdmin(ses.rol)) {
    equipo = (await ctx.db.all("asistencia_marcajes"))
      .filter((r) => ymdDeTs(s(r.ts)) === fecha)
      .map(marcaPub);
    try {
      feriados = (await ctx.db.all("asistencia_feriados")).map((r) => ({
        fecha: s(r.fecha).slice(0, 10), nombre: s(r.nombre),
        fuente: s(r.fuente) || "", ambito: s(r.ambito) || "nacional",
        traslado_de: r.traslado_de ? s(r.traslado_de).slice(0, 10) : "",
        no_recuperable: r.no_recuperable === true,
      })).filter((f) => f.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
    } catch {
      feriados = (await feriadosDe(ctx)).map((fechaFer) => ({ fecha: fechaFer, nombre: "", fuente: "", ambito: "nacional" }));
    }
  }
  const propia = await empleadaDe(ctx, ses.name);
  // TK197 (Emilia): el panel rápido de «Crear» muestra el horario de hoy de la persona.
  let horarioHoy: { trabaja: boolean; desde: string | null; hasta: string | null } | null = null;
  try {
    const { cargarHorarios } = await import("./horarios_api.ts");
    const { horarioAsignado, jornadaDe } = await import("./horarios.ts");
    const pack = await cargarHorarios(ctx);
    const emp = await empleadaDe(ctx, nombre);
    const h = horarioAsignado(pack.horarios, pack.asignaciones, [nombre, s(emp?.nombre_app), s(emp?.apellidos_y_nombres), s(emp?.nombre_jibble)]);
    if (h) horarioHoy = jornadaDe(h, fecha);
  } catch { horarioHoy = null; }
  return {
    ok: true, fecha, dia, reloj, horarioHoy, marcajes: crudos.map(marcaPub), permisos, pendientes, vacaciones, puedeAprobar: puedeAprobar(ses.rol), esAdmin: esAdmin(ses.rol), empleada: !!propia, equipo, feriados, auditoria: auditoria.map(audPub),
    config: {
      radio_m: cfg.radio_m, punto_listo: cfg.lat != null && cfg.lng != null,
      hora_entrada: cfg.hora_entrada, hora_salida: cfg.hora_salida, gracia_min: cfg.gracia_min,
      lugar_nombre: cfg.lugar_nombre || "C.C. La Esquina",
      lat: esAdmin(ses.rol) ? cfg.lat : undefined, lng: esAdmin(ses.rol) ? cfg.lng : undefined,
    },
  };
});

extend("asis_periodo", "any", async (p, ctx, ses) => {
  const matriz = await matrizDe(ctx.db);
  if (acceso(ses.rol, "asistencia", matriz) === "no") return { error: "No tienes permiso" };
  const anio = n(p.anio) || ecuadorParts(ctx.now).y;
  const mes = n(p.mes) || ecuadorParts(ctx.now).m;
  let nombres: string[] = [];
  if (propio(ses, matriz)) nombres = [ses.name];
  else if (s(p.nombre)) nombres = [s(p.nombre)];
  else {
    const baja = await bajasDe(ctx.db);
    const set = new Set<string>();
    for (const r of await ctx.db.all("rrhh_empleadas")) {
      if (baja(s(r.nombre_app)) || baja(s(r.nombre_jibble))) continue;
      if (s(r.nombre_app)) set.add(s(r.nombre_app));
    }
    for (const r of await ctx.db.all("asistencia_marcajes")) if (s(r.nombre)) set.add(s(r.nombre));
    nombres = [...set];
    if (!nombres.length) nombres = [ses.name];
  }
  const personas = [];
  for (const nombre of nombres) personas.push({ nombre, ...(await horasDeEmpleada(ctx, nombre, anio, mes)) });
  return { ok: true, anio, mes, personas };
});

/** TK172 (Emilia t774u): admin edita marcas solo del período abierto (mes en curso) y nunca en el futuro. */
function fueraDePeriodo(ctx: Ctx, ts: string): string | null {
  const hoy = ecuadorParts(ctx.now).ymd;
  const f = ymdDeTs(ts);
  if (!f) return "Hora inválida.";
  if (f.slice(0, 7) !== hoy.slice(0, 7)) return "Solo se editan marcas del período abierto (mes en curso).";
  if (new Date(ts).getTime() > ctx.now.getTime()) return "No se pone una marca en el futuro.";
  return null;
}

extend("asis_corregir", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin corrige una marca" };
  if (!s(p.motivo)) return { error: "La corrección necesita un motivo" };
  const rows = await ctx.db.all("asistencia_marcajes");
  const hit = rows.find((r) => s(r.id) === s(p.id));
  if (!hit) return { error: "Marca no encontrada" };
  const antes = { tipo: hit.tipo, ts: hit.ts, anulado: hit.anulado === true };
  const patch: R = {};
  const fueraAntes = fueraDePeriodo(ctx, s(hit.ts));
  if (fueraAntes && !/futuro/.test(fueraAntes)) return { error: fueraAntes };
  if (s(p.tipo)) {
    if (!["entrada", "salida", "almuerzo_inicio", "almuerzo_fin"].includes(s(p.tipo))) return { error: "Tipo de marca desconocido." };
    patch.tipo = s(p.tipo);
  }
  if (s(p.ts)) {
    const d = new Date(s(p.ts));
    if (!/[+-]\d{2}:?\d{2}$|Z$/.test(s(p.ts)) || Number.isNaN(d.getTime())) return { error: "Hora inválida (usa 2026-10-21T09:05:00-05:00)" };
    const fuera = fueraDePeriodo(ctx, d.toISOString());
    if (fuera) return { error: fuera };
    patch.ts = d.toISOString();
  }
  if (p.anulado === true || s(p.anulado) === "true") { patch.anulado = true; patch.motivo_anulacion = s(p.motivo); }
  if (p.anulado === false || s(p.anulado) === "false") { patch.anulado = false; patch.motivo_anulacion = ""; }
  if (!Object.keys(patch).length) return { error: "Nada que corregir" };
  await ctx.db.write(actorOf(ses), "asistencia_marcajes", "update", { id: hit.id }, patch);
  await auditar(ctx, ses, "correccion", { nombre: s(hit.nombre), marcaje_id: s(hit.id), antes, despues: patch, motivo: s(p.motivo) });
  return { ok: true };
});

extend("asis_auditoria", "any", async (_p, ctx, ses) => {
  const rows = await ctx.db.all("asistencia_auditoria");
  const mias = esAdmin(ses.rol) ? rows : rows.filter((r) => esPropio(s(r.nombre), ses));
  return { ok: true, items: mias.slice(-100).reverse().map(audPub) };
});

extend("asis_permiso_solicitar", "any", async (p, ctx, ses) => {
  const tipoRaw = s(p.tipo).toUpperCase();
  const tipo = /vacac/i.test(tipoRaw) ? "VACACIONES"
    : /med/i.test(tipoRaw) ? "PERMISO MEDICO"
    : /calam/i.test(tipoRaw) ? "CALAMIDAD"
    : /person/i.test(tipoRaw) ? "PERSONAL"
    : "PERMISO";
  const desde = s(p.desde).slice(0, 10);
  const hasta = s(p.hasta || p.desde).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return { error: "Falta la fecha" };
  if (hasta < desde) return { error: "La fecha final es antes de la inicial." };
  if (tipo === "PERMISO" && !s(p.motivo)) return { error: "Escribe el motivo del permiso." };
  const nombre = esAdmin(ses.rol) && s(p.empleada) ? s(p.empleada) : ses.name;
  const dias = diasDeVacacion({ desde, hasta });
  if (tipo === "VACACIONES") {
    const err = validarSolicitudVacacion(await saldoDe(ctx, nombre), dias);
    if (err) return { error: err };
  }
  const sr = await nextSheet(ctx.db, "permisos");
  const fila = {
    sheet_row: sr, id_1: ctx.now.getTime() + Math.abs(sr), empleada: nombre, tipo,
    fecha_inicio: desde, fecha_fin: hasta,
    horas: n(p.horas), motivo: s(p.motivo), estado: "PENDIENTE", solicitado: ecuadorParts(ctx.now).ymd,
    dias, origin: enPrueba(ctx.db) ? "test" : "beta", orig: { tipo, por: ses.name },
    url_certificado: s(p.adjunto || p.url || p.url_certificado) || null,
  };
  await ctx.db.write(actorOf(ses), "permisos", "insert", {}, fila);
  await auditar(ctx, ses, "solicitud", { nombre, permiso_sheet_row: sr, despues: { tipo, desde, hasta, dias, horas: n(p.horas) }, motivo: s(p.motivo) || tipo });
  try {
    if (enPrueba(ctx.db)) throw new Error("skip");
    const admins = (await ctx.db.all("app_usuarios").catch(() => [] as Row[])).concat(await ctx.db.all("usuarios").catch(() => [] as Row[]));
    const vistos = new Set<string>();
    for (const u of admins) {
      const rol = s(u.rol || u.role);
      if (rol !== "admin" && rol !== "super_admin" && rol !== "admin_master") continue;
      const uid = s(u.id);
      if (!uid || vistos.has(uid)) continue;
      vistos.add(uid);
      await ctx.db.write(actorOf(ses), "beta_notificaciones", "insert", {}, {
        id: crypto.randomUUID(), usuario: uid,
        titulo: "Solicitud de permiso",
        cuerpo: `${nombre} pidió ${tipo.toLowerCase()} del ${desde} al ${hasta}.`,
        tipo: "permiso", link: "#/m/personal/permisos", created_at: ctx.now.toISOString(),
      });
    }
  } catch { /* la notificación no debe tumbar la solicitud */ }
  return { ok: true, id: String(ctx.now.getTime() + Math.abs(sr)), dias };
});

extend("asis_permiso_cancelar", "any", async (p, ctx, ses) => {
  const row = (await ctx.db.all("permisos")).find((r) => s(r.id_1) === s(p.id) || String(r.sheet_row) === s(p.row));
  if (!row) return { error: "Solicitud no encontrada" };
  const duena = esPropio(s(row.empleada), ses);
  if (!esAdmin(ses.rol) && !duena) return { error: "No tienes permiso" };
  if (!esAdmin(ses.rol) && !/pend/i.test(s(row.estado))) return { error: "Solo se cancela una solicitud pendiente." };
  if (esAdmin(ses.rol) && !/pend/i.test(s(row.estado)) && !s(p.motivo)) return { error: "Cancelar una solicitud ya resuelta necesita motivo." };
  await ctx.db.write(actorOf(ses), "permisos", "update", { sheet_row: row.sheet_row }, {
    estado: "CANCELADO", resuelto_por: ses.name, resuelto_ts: ctx.now.toISOString(), motivo_resolucion: s(p.motivo) || "cancelada",
  });
  await auditar(ctx, ses, "permiso_cancelado", { nombre: s(row.empleada), permiso_sheet_row: row.sheet_row, antes: { estado: row.estado }, despues: { estado: "CANCELADO" }, motivo: s(p.motivo) || "cancelada" });
  return { ok: true };
});

extend("asis_vacaciones", "any", async (p, ctx, ses) => {
  const matriz = await matrizDe(ctx.db);
  if (acceso(ses.rol, "asistencia", matriz) === "no") return { error: "No tienes permiso" };
  if (!esAdmin(ses.rol)) return { ok: true, personas: [{ nombre: ses.name, ...saldoPub(await saldoDe(ctx, ses.name), true) }] };
  const baja = await bajasDe(ctx.db);
  const nombres = s(p.nombre) ? [s(p.nombre)] : (await ctx.db.all("rrhh_empleadas")).filter((r) => !baja(s(r.nombre_app)) && !baja(s(r.nombre_jibble))).map((r) => s(r.nombre_app)).filter(Boolean);
  const personas = [];
  for (const nombre of nombres) personas.push({ nombre, ...(await saldoDe(ctx, nombre)) });
  return { ok: true, personas };
});

extend("asis_permiso_resolver", "any", async (p, ctx, ses) => {
  if (!puedeAprobar(ses.rol)) return { error: "Solo admin aprueba permisos y vacaciones" };
  const estado = /rechaz/i.test(s(p.estado)) ? "RECHAZADO" : "APROBADO";
  const rows = await ctx.db.all("permisos");
  const row = rows.find((r) => s(r.id_1) === s(p.id) || String(r.sheet_row) === s(p.row));
  if (!row) return { error: "Permiso no encontrado" };
  if (!/pend/i.test(s(row.estado))) return { error: `Esta solicitud ya está ${s(row.estado).toLowerCase()}.` };
  if (estado === "RECHAZADO" && !s(p.motivo)) return { error: "El rechazo necesita un motivo." };
  if (estado === "APROBADO" && /vacac/i.test(s(row.tipo))) {
    const sal = await saldoDe(ctx, s(row.empleada));
    const dias = diasDeVacacion({ desde: s(row.fecha_inicio), hasta: s(row.fecha_fin) });
    // la propia solicitud cuenta como pendiente en el saldo; se descuenta para validar
    const err = validarSolicitudVacacion({ ...sal, diasPendientes: Math.max(0, sal.diasPendientes - dias) }, dias);
    if (err) return { error: err };
  }
  const antes = { estado: row.estado };
  await ctx.db.write(actorOf(ses), "permisos", "update", { sheet_row: row.sheet_row }, {
    estado, aprobado_por: ses.name, resuelto_por: ses.name, resuelto_ts: ctx.now.toISOString(), motivo_resolucion: s(p.motivo),
  });
  await auditar(ctx, ses, "permiso", { nombre: s(row.empleada), antes, despues: { estado }, motivo: s(p.motivo) || estado, permiso_sheet_row: row.sheet_row });
  try {
    const gente = (await ctx.db.all("app_usuarios").catch(() => [] as Row[])).concat(await ctx.db.all("usuarios").catch(() => [] as Row[]));
    const hit = gente.find((u) => normNombre(s(u.nombre || u.name || u.short)) === normNombre(s(row.empleada)) || s(u.id) === s(row.empleada));
    const uid = s(hit?.id);
    if (uid) {
      await ctx.db.write(actorOf(ses), "beta_notificaciones", "insert", {}, {
        id: crypto.randomUUID(), usuario: uid,
        tipo: estado === "APROBADO" ? "permiso_aprobado" : "permiso_rechazado",
        titulo: estado === "APROBADO" ? "Permiso aprobado" : "Permiso rechazado",
        cuerpo: estado === "APROBADO"
          ? ("Aprobaron tu " + s(row.tipo).toLowerCase() + ".")
          : ("Rechazaron tu " + s(row.tipo).toLowerCase() + "." + (s(p.motivo) ? " " + s(p.motivo) : "")),
        link: "#/m/personal/permisos", ref_id: s(row.id_1) || String(row.sheet_row), created_at: ctx.now.toISOString(),
      });
    }
  } catch { /* el aviso no frena la resolución */ }
  return { ok: true, estado };
});

extend("asis_marca_manual", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin agrega una marca olvidada" };
  if (!s(p.motivo)) return { error: "La marca manual necesita un motivo" };
  const tipo = s(p.tipo);
  if (!["entrada", "salida", "almuerzo_inicio", "almuerzo_fin"].includes(tipo)) return { error: "Tipo de marca desconocido." };
  const nombre = s(p.nombre);
  if (!nombre) return { error: "Falta la empleada" };
  const d = new Date(s(p.ts));
  if (!/[+-]\d{2}:?\d{2}$|Z$/.test(s(p.ts)) || Number.isNaN(d.getTime())) return { error: "Hora inválida (usa 2026-10-21T09:05:00-05:00)" };
  if (d.getTime() > ctx.now.getTime()) return { error: "No se agrega una marca en el futuro." };
  const fuera = fueraDePeriodo(ctx, d.toISOString());
  if (fuera) return { error: fuera };
  const e = await empleadaDe(ctx, nombre);
  const saved = await ctx.db.write(actorOf(ses), "asistencia_marcajes", "insert", {}, {
    usuario_id: s(e?.nombre_app) || nombre, nombre, tipo, ts: d.toISOString(), origen: "manual",
    dentro_radio: null, anulado: false, creado_por: ses.name, motivo_manual: s(p.motivo),
  });
  await auditar(ctx, ses, "marca_manual", { nombre, marcaje_id: s(saved?.id), despues: { tipo, ts: d.toISOString() }, motivo: s(p.motivo) });
  return { ok: true, id: saved?.id };
});

extend("asis_marcas_admin", "any", async (p, ctx, ses) => {
  // TK172: marcas de la app de UNA empleada en UN día del período abierto, con su historial de cambios.
  if (!esAdmin(ses.rol)) return { error: "Solo admin edita las marcas del equipo" };
  const nombre = s(p.nombre);
  if (!nombre) return { error: "Falta la empleada" };
  const hoy = ecuadorParts(ctx.now).ymd;
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(s(p.fecha)) ? s(p.fecha) : hoy;
  if (fecha.slice(0, 7) !== hoy.slice(0, 7) || fecha > hoy) return { error: "Solo se editan marcas del período abierto, hasta hoy." };
  const [marc, perms, fer, cfg, aud] = await Promise.all([
    ctx.db.all("asistencia_marcajes"), ctx.db.all("permisos").catch(() => [] as Row[]), feriadosDe(ctx), configDe(ctx),
    ctx.db.all("asistencia_auditoria").catch(() => [] as Row[]),
  ]);
  const jib = await ctx.db.all("jibble_historial").catch(() => [] as Row[]);
  const delDia = marc.filter((r) => mismo(s(r.nombre), nombre) && ymdDeTs(s(r.ts)) === fecha).sort((a, b) => s(a.ts).localeCompare(s(b.ts)));
  const ids = new Set(delDia.map((r) => s(r.id)));
  const j = jibbleDe(jib, nombre).find((x) => x.fecha === fecha) || null;
  const dia = calcularDia(fecha, marcajesDe(marc, nombre), cfg, fer, permisosDe(perms, nombre), j);
  const historial = aud.filter((r) => ids.has(s(r.marcaje_id)) || (mismo(s(r.nombre), nombre) && /marca_manual|correccion/.test(s(r.accion)) && (ymdDeTs(s((r.despues as Row)?.ts)) === fecha || ymdDeTs(s((r.antes as Row)?.ts)) === fecha)))
    .sort((a, b) => s(b.ts).localeCompare(s(a.ts))).slice(0, 30).map(audPub);
  const ini = hoy.slice(0, 8) + "01";
  return { ok: true, nombre, fecha, hoy, desde: ini, marcas: delDia.map(marcaPub), dia, historial, jibble: !!j };
});

extend("asis_tablero", "any", async (_p, ctx, ses) => {
  // TK176 (Emilia t782u): tablero en vivo del equipo para admin: estado de hoy y marcas de cada empleada activa.
  if (!esAdmin(ses.rol)) return { error: "Solo admin ve el tablero del equipo" };
  const fecha = ecuadorParts(ctx.now).ymd;
  const [marc, emps] = await Promise.all([ctx.db.all("asistencia_marcajes"), ctx.db.all("rrhh_empleadas")]);
  const baja = await bajasDe(ctx.db);
  let esFila: (r: Row) => boolean = () => false;
  try { esFila = (await import("./empleados_api.ts")).esFilaNotasRrhh; } catch { /* sin filtro */ }
  let jornadaDeNombre: ((nombre: string) => { trabaja: boolean; desde: string | null; hasta: string | null } | null) = () => null;
  try {
    const { cargarHorarios } = await import("./horarios_api.ts");
    const { horarioAsignado, jornadaDe } = await import("./horarios.ts");
    const pack = await cargarHorarios(ctx);
    jornadaDeNombre = (nombre) => {
      const e = emps.find((r) => mismo(s(r.nombre_app), nombre));
      const h = horarioAsignado(pack.horarios, pack.asignaciones, [nombre, s(e?.apellidos_y_nombres), s(e?.nombre_jibble)]);
      return h && !h.esDefault ? jornadaDe(h, fecha) : null;
    };
  } catch { /* sin horarios */ }
  const activas = emps.filter((r) => s(r.nombre_app) && !esFila(r) && !baja(s(r.nombre_app)) && !baja(s(r.nombre_jibble)));
  const personas = activas.map((e) => {
    const nombre = s(e.nombre_app);
    const marcas = marc.filter((r) => mismo(s(r.nombre), nombre) && ymdDeTs(s(r.ts)) === fecha && r.anulado !== true)
      .sort((a, b) => s(a.ts).localeCompare(s(b.ts))).map(marcaPub);
    const j = jornadaDeNombre(nombre);
    return { nombre, nombreCompleto: s(e.apellidos_y_nombres), marcas, jornada: j };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return { ok: true, fecha, ahora: ctx.now.toISOString(), personas };
});

extend("asis_dia", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin ve la asistencia del equipo" };
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(s(p.fecha)) ? s(p.fecha) : ecuadorParts(ctx.now).ymd;
  const [marc, perms, fer, cfg, emps] = await Promise.all([
    ctx.db.all("asistencia_marcajes"), ctx.db.all("permisos"), feriadosDe(ctx), configDe(ctx), ctx.db.all("rrhh_empleadas"),
  ]);
  const jib = await ctx.db.all("jibble_historial").catch(() => [] as Row[]);
  const baja = await bajasDe(ctx.db);
  const nombres = new Set(emps.filter((r) => !baja(s(r.nombre_app)) && !baja(s(r.nombre_jibble))).map((r) => s(r.nombre_app)).filter(Boolean));
  for (const r of marc) if (ymdDeTs(s(r.ts)) === fecha && s(r.nombre)) nombres.add(s(r.nombre));
  const filas = [];
  for (const nombre of nombres) {
    const mm = marcajesDe(marc, nombre);
    const j = jibbleDe(jib, nombre).find((x) => x.fecha === fecha) || null;
    const dia = calcularDia(fecha, mm, cfg, fer, permisosDe(perms, nombre), j);
    const delDia = marc.filter((r) => mismo(s(r.nombre), nombre) && ymdDeTs(s(r.ts)) === fecha).sort((a, b) => s(a.ts).localeCompare(s(b.ts)));
    filas.push({ nombre, dia, marcas: delDia.map(marcaPub) });
  }
  return { ok: true, fecha, filas };
});

extend("asis_foto", "any", async (p, ctx, ses) => {
  const hit = (await ctx.db.all("asistencia_marcajes")).find((r) => s(r.id) === s(p.id));
  if (!hit) return { error: "Marca no encontrada" };
  if (!esAdmin(ses.rol) && !esPropio(s(hit.nombre), ses)) return { error: "No tienes permiso" };
  const guardada = s(hit.foto);
  if (!guardada.startsWith("asistencia/")) return { error: "Esta marca no tiene selfie." };
  const firmada = await firmarSelfie(ctx, guardada.slice("asistencia/".length));
  if ("error" in firmada) return { error: firmada.error };
  return { ok: true, url: firmada.url };
});

extend("asis_feriado", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin carga feriados" };
  const fecha = s(p.fecha).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida" };
  const rows = await ctx.db.all("asistencia_feriados");
  const hit = rows.find((r) => s(r.fecha).slice(0, 10) === fecha);
  if (s(p.borrar) === "1" || p.borrar === true) {
    if (hit) {
      await ctx.db.write(actorOf(ses), "asistencia_feriados", "delete", { fecha: hit.fecha }, null);
      await auditar(ctx, ses, "feriado_borrado", { nombre: "", antes: { fecha, nombre: s(hit.nombre) }, motivo: s(p.motivo) || "feriado borrado" });
    }
    return { ok: true };
  }
  const fila: Record<string, unknown> = { fecha, nombre: s(p.nombre) };
  if (s(p.ambito)) fila.ambito = s(p.ambito);
  if (s(p.fuente)) fila.fuente = s(p.fuente);
  if (hit) await ctx.db.write(actorOf(ses), "asistencia_feriados", "update", { fecha: hit.fecha }, fila);
  else await ctx.db.write(actorOf(ses), "asistencia_feriados", "insert", {}, fila);
  await auditar(ctx, ses, "feriado", { nombre: "", antes: hit ? { fecha, nombre: s(hit.nombre) } : null, despues: { fecha, nombre: s(p.nombre) }, motivo: s(p.motivo) || "feriado" });
  return { ok: true };
});

function marcaPub(r: Row) {
  return {
    id: s(r.id), nombre: s(r.nombre), tipo: s(r.tipo), ts: s(r.ts),
    anulado: r.anulado === true, tieneFoto: s(r.foto).startsWith("asistencia/"),
    origen: s(r.origen) || "telefono",
    automatica: s(r.origen) === "automatica" || /salida autom[aá]tica/i.test(s(r.motivo_manual)),
    motivo_manual: s(r.motivo_manual),
  };
}

function selfieBytes(dataUrl: string): { mime: string; bytes: Uint8Array } | { error: string } {
  const i = dataUrl.indexOf("base64,");
  if (i < 0 || !dataUrl.startsWith("data:image/")) return { error: "La marca pide una selfie." };
  const mime = dataUrl.slice(5, dataUrl.indexOf(";")).toLowerCase();
  if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mime)) return { error: "La selfie tiene que ser una foto." };
  let bytes: Uint8Array;
  try {
    const bin = atob(dataUrl.slice(i + 7).replace(/\s/g, ""));
    bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  } catch {
    return { error: "La selfie no se pudo leer." };
  }
  if (bytes.byteLength < 8) return { error: "La selfie está vacía." };
  if (bytes.byteLength > 1_500_000) return { error: "La selfie no cabe (máximo 1.5 MB)." };
  return { mime: mime === "image/jpg" ? "image/jpeg" : mime, bytes };
}

async function subirSelfie(ctx: Ctx, uid: string, fecha: string, tipo: string, foto: { mime: string; bytes: Uint8Array }): Promise<{ path: string } | { error: string }> {
  if (enPrueba(ctx.db)) {
    const ext = foto.mime === "image/png" ? "png" : foto.mime === "image/webp" ? "webp" : "jpg";
    return { path: `asistencia/test/${uid}/${fecha}/${tipo}.${ext}` };
  }
  const base = s(ctx.env.SUPABASE_URL).replace(/\/$/, "");
  const key = s(ctx.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!base || !key) return { error: "El almacén de selfies no está configurado." };
  const ext = foto.mime === "image/png" ? "png" : foto.mime === "image/webp" ? "webp" : "jpg";
  const objectPath = `${uid}/${fecha}/${crypto.randomUUID()}-${tipo}.${ext}`;
  const encoded = objectPath.split("/").map(encodeURIComponent).join("/");
  const res = await ctx.fetchImpl(`${base}/storage/v1/object/asistencia/${encoded}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": foto.mime, "x-upsert": "false" },
    body: foto.bytes,
  });
  if (!res.ok) return { error: "No se pudo guardar la selfie." };
  return { path: `asistencia/${objectPath}` };
}

async function firmarSelfie(ctx: Ctx, objectPath: string): Promise<{ url: string } | { error: string }> {
  const base = s(ctx.env.SUPABASE_URL).replace(/\/$/, "");
  const key = s(ctx.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!base || !key) return { error: "El almacén de selfies no está configurado." };
  const encoded = objectPath.split("/").map(encodeURIComponent).join("/");
  const res = await ctx.fetchImpl(`${base}/storage/v1/object/sign/asistencia/${encoded}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: 120 }),
  });
  let data: R = {};
  try { data = await res.json() as R; } catch { data = {}; }
  const signed = s(data.signedURL || data.signedUrl);
  if (!res.ok || !signed) return { error: "No se pudo abrir la selfie." };
  const url = signed.startsWith("http") ? signed : `${base}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`;
  return { url };
}

function permisoPub(r: Row) {
  return {
    id: s(r.id_1) || s(r.sheet_row), row: r.sheet_row, empleada: s(r.empleada), tipo: s(r.tipo),
    desde: s(r.fecha_inicio).slice(0, 10), hasta: s(r.fecha_fin).slice(0, 10), horas: n(r.horas),
    motivo: s(r.motivo), estado: s(r.estado), aprobadoPor: s(r.aprobado_por),
    dias: n(r.dias) || diasDeVacacion({ desde: s(r.fecha_inicio), hasta: s(r.fecha_fin) }),
    resueltoTs: s(r.resuelto_ts), motivoResolucion: s(r.motivo_resolucion),
  };
}

function audPub(r: Row) {
  return { ts: s(r.ts), actor: s(r.actor), accion: s(r.accion), nombre: s(r.nombre), motivo: s(r.motivo), antes: r.antes || null, despues: r.despues || null };
}


export function sesionCronAsis(p: Row, env: Record<string, string | undefined>): { uid: string; rol: string; name: string; short: string; color: string; token: string } | null {
  const key = s(env.ASIS_CRON_KEY || env.MIGO_CRON_KEY);
  if (key.length < 16) return null;
  const got = s(p.cron_key || p.asis_cron_key || p.migo_cron_key);
  if (got.length !== key.length) return null;
  let x = 0;
  for (let i = 0; i < key.length; i++) x |= key.charCodeAt(i) ^ got.charCodeAt(i);
  if (x !== 0) return null;
  return { uid: "asis-cron", rol: "admin", name: "Asistencia cron", short: "asis", color: "", token: "" };
}

extend("asis_calendario", "any", async (p, ctx, ses) => {
  const matriz = await matrizDe(ctx.db);
  if (acceso(ses.rol, "asistencia", matriz) === "no") return { error: "No tienes permiso" };
  const nombre = (!esAdmin(ses.rol) || propio(ses, matriz)) ? ses.name : (s(p.nombre) || ses.name);
  const hoyYmd = ecuadorParts(ctx.now).ymd;
  const ingresoCal = s((await empleadaDe(ctx, nombre).catch(() => undefined))?.fecha_ingreso).slice(0, 10);
  const ancla = s(p.fecha) || hoyYmd;
  const vista = s(p.vista || "mes") || "mes";
  let desde = ancla, hasta = ancla;
  if (vista === "semana") {
    const semVista = lunesADomingo(ancla);
    desde = semVista.desde; hasta = semVista.hasta;
  } else if (vista === "mes") {
    const mesVista = limitesMes(ancla);
    desde = mesVista.desde; hasta = mesVista.hasta;
  }
  const semHoy = lunesADomingo(hoyYmd);
  const mesHoy = limitesMes(hoyYmd);
  const [horas, horasHoy, horasSem, horasMes] = await Promise.all([
    horasEnRango(ctx, nombre, desde, hasta),
    horasEnRango(ctx, nombre, hoyYmd, hoyYmd),
    horasEnRango(ctx, nombre, semHoy.desde, semHoy.hasta),
    horasEnRango(ctx, nombre, mesHoy.desde, mesHoy.hasta),
  ]);
  let rango: ReturnType<typeof bloqueDeHoras> | null = null;
  const rDesde = s(p.desde).slice(0, 10), rHasta = s(p.hasta).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(rDesde) && /^\d{4}-\d{2}-\d{2}$/.test(rHasta) && rHasta >= rDesde) {
    rango = bloqueDeHoras(await horasEnRango(ctx, nombre, rDesde, rHasta));
  }
  const feriados = await feriadosDe(ctx);
  const [y, m] = ancla.split("-").map(Number);
  const historialMeses: string[] = [];
  for (let k = 0; k < 12; k++) {
    const dt = new Date(Date.UTC(y, m - 1 - k, 1));
    historialMeses.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const enVista = p.preview === true || Boolean(p.preview_uid);
  if (!enVista) {
    try {
      await guardarHistorialMes(ctx, ses, nombre, hoyYmd, horasMes);
      const prev = new Date(Date.UTC(mesHoy.anio, mesHoy.mes - 2, 1));
      const prevYmd = ymdUtc(prev);
      const horasPrev = await horasEnRango(ctx, nombre, limitesMes(prevYmd).desde, limitesMes(prevYmd).hasta);
      await guardarHistorialMes(ctx, ses, nombre, prevYmd, horasPrev);
    } catch { /* la tabla puede no existir todavía; el dashboard igual muestra el cálculo vivo */ }
  }
  let historial: ReturnType<typeof histPub>[] = [];
  try {
    historial = (await ctx.db.all("beta_asistencia_horas_mes"))
      .filter((r) => mismo(s(r.nombre), nombre))
      .sort((a, b) => (n(b.anio) * 100 + n(b.mes)) - (n(a.anio) * 100 + n(a.mes)))
      .slice(0, 18)
      .map(histPub);
  } catch { historial = []; }
  let color = "#E7DBFF";
  try {
    const { mapaColores, PALETA } = await import("./colores_api.ts");
    const { personas } = await import("./usuario_permisos_api.ts");
    const gente = await personas(ctx).catch(() => [{ nombre }]);
    const guardados = await ctx.db.all("beta_permisos_usuario").catch(() => [] as Row[]);
    const mapa = mapaColores(gente, guardados);
    color = (mapa[normNombre(nombre)] || Object.values(mapa)[0])?.color || PALETA[0];
  } catch { /* paleta por defecto */ }
  let mostrar = nombre;
  try {
    const { nombreMostrar, aliasesDe } = await import("./personas_unir.ts");
    mostrar = nombreMostrar(nombre, await aliasesDe(ctx));
  } catch { mostrar = nombre; }
  const permisos = (await ctx.db.all("permisos").catch(() => [] as Row[]))
    .filter((r) => !r.borrado_at && mismo(s(r.empleada), nombre))
    .filter((r) => !(enPrueba(ctx.db) === false && s(r.origin) === "test"))
    .map(permisoPub)
    .sort((a, b) => s(b.desde).localeCompare(s(a.desde)))
    .slice(0, 24);
  let vacaciones: { diasDisponibles: number; diasPendientes: number } | null = null;
  try {
    const sal = await saldoDe(ctx, nombre);
    vacaciones = { diasDisponibles: sal.diasDisponibles, diasPendientes: sal.diasPendientes };
  } catch { vacaciones = null; }
  // TK166: las horas del mes tal como entran al rol de pagos (mismo cálculo que «Crear rol» y el rol del mes).
  let rolMes: Row | null = null;
  try {
    const { horasRolDe } = await import("./roles_crear_api.ts");
    const { floorCent } = await import("./domain.ts");
    const { horas: hr } = await horasRolDe(ctx, nombre, y, m);
    const emp = await empleadaDe(ctx, nombre);
    const base = n(emp?.sueldo_base) || 482;
    const val = (h: number, f: number) => floorCent(h * base / 240 * f);
    rolMes = {
      anio: y, mes: m,
      hrsNormales: hr.hrsOrdinarias, hrsSupl: hr.hrsSupl, hrsExtr: hr.hrsExtr, hrsDesc: hr.hrsDesc,
      valSupl: val(hr.hrsSupl, 1.5), valExtr: val(hr.hrsExtr, 2), valDesc: val(hr.hrsDesc, 2),
      diasTrabajados: hr.diasTrabajados, diasAsumidos: hr.diasAsumidos, diasFalta: hr.diasFalta,
      diasFeriado: hr.diasFest, diasDescanso: hr.diasDesc, diasPermiso: hr.diasPermiso,
      regla: "Cada tipo de hora extra se suma en el mes y se redondea hacia abajo a bloques de 15 minutos (regla del rol RRHH). Valor: sueldo base / 240 × horas × 1,5 (suplementarias) o × 2 (extraordinarias, descanso y feriado).",
      appDesde: (await import("./asistencia.ts")).APP_PRIORIDAD_DESDE,
    };
  } catch { rolMes = null; }
  return {
    ok: true, vista, fecha: ancla, desde, hasta, nombre, nombreMostrar: mostrar, color, rolMes,
    feriados,
    // TK177: antes del ingreso no hay faltas (el calendario los deja neutros).
    ingreso: ingresoCal || null,
    dias: ((horas.dias || []) as Row[]).map((d) => ingresoCal && s(d.fecha).slice(0, 10) < ingresoCal ? { ...d, falta: false, antesIngreso: true } : d),
    resumen: {
      diasAsistidos: horas.diasPropios,
      hrsNormales: horas.hrsOrdinarias,
      hrsSupl50: horas.hrsSupl,
      hrsSupl100: horas.hrsExtr,
      hrsExtraordinarias: horas.hrsDesc,
      hrsTrabajadas: horas.hrsTrabajadas,
      atrasoMin: horas.atrasoMin,
      faltas: horas.faltas,
    },
    bloques: {
      hoy: bloqueDeHoras(horasHoy),
      semana: bloqueDeHoras(horasSem),
      mes: bloqueDeHoras(horasMes),
      rango,
      rangoDesde: rDesde || "",
      rangoHasta: rHasta || "",
    },
    historialMeses,
    historial,
    permisos,
    vacaciones,
    hayDatos: horas.hayDatos,
  };
});

extend("asis_cierre_automatico", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un proceso de admin o el cron cierra las salidas automáticas." };
  const cfg = await configDe(ctx);
  const todos = (await ctx.db.all("asistencia_marcajes").catch(() => [] as Row[])).filter((r) => r.anulado !== true);
  const porPersona = new Map<string, Row[]>();
  for (const r of todos) {
    const nomb = s(r.nombre);
    if (!nomb) continue;
    const arr = porPersona.get(nomb) || [];
    arr.push(r);
    porPersona.set(nomb, arr);
  }
  const { debeCerrarAutomaticamente } = await import("./asistencia.ts");
  const { cargarHorarios } = await import("./horarios_api.ts").catch(() => ({ cargarHorarios: async () => ({ horarios: [], asignaciones: [] }) }));
  const { horarioAsignado, jornadaDe } = await import("./horarios.ts").catch(() => ({ horarioAsignado: () => null, jornadaDe: () => ({ trabaja: true, desde: cfg.hora_entrada, hasta: cfg.hora_salida }) }));
  let pack: { horarios: unknown[]; asignaciones: unknown[] } | null = null;
  try { pack = await cargarHorarios(ctx) as { horarios: unknown[]; asignaciones: unknown[] }; } catch { pack = null; }
  const cerrados: Row[] = [];
  const ahora = ctx.now.toISOString();
  for (const [nombre, filas] of porPersona) {
    const vivos = filas.slice().sort((a, b) => s(a.ts).localeCompare(s(b.ts)));
    const lastE = [...vivos].reverse().find((r) => s(r.tipo) === "entrada");
    const lastS = [...vivos].reverse().find((r) => s(r.tipo) === "salida");
    if (!lastE || (lastS && s(lastS.ts) >= s(lastE.ts))) continue;
    let hasta = cfg.hora_salida;
    try {
      const emp = await empleadaDe(ctx, nombre);
      const h = pack ? horarioAsignado(pack.horarios as never, pack.asignaciones as never, [nombre, s(emp?.nombre_app), s(emp?.apellidos_y_nombres)]) : null;
      const { ecuadorParts } = await import("./domain.ts");
      const ymd = ecuadorParts(new Date(s(lastE.ts))).ymd;
      const dia = h ? jornadaDe(h as never, ymd) : null;
      if (dia && dia.hasta) hasta = dia.hasta;
    } catch { /* usa hora de config */ }
    const dec = debeCerrarAutomaticamente({ entradaTs: s(lastE.ts), horaSalida: hasta, ahoraIso: ahora });
    if (!dec.aplicar) continue;
    const despues = vivos.filter((r) => s(r.ts) > s(lastE.ts));
    if (despues.some((r) => s(r.tipo) === "almuerzo_inicio") && !despues.some((r) => s(r.tipo) === "almuerzo_fin")) {
      await ctx.db.write(actorOf(ses), "asistencia_marcajes", "insert", {}, {
        usuario_id: s(lastE.usuario_id) || "", nombre, tipo: "almuerzo_fin", ts: dec.tsSalida,
        origen: "automatica", motivo_manual: "Salida automática", creado_por: "sistema",
      });
    }
    const saved = await ctx.db.write(actorOf(ses), "asistencia_marcajes", "insert", {}, {
      usuario_id: s(lastE.usuario_id) || "", nombre, tipo: "salida", ts: dec.tsSalida,
      origen: "automatica", motivo_manual: "Salida automática", creado_por: "sistema",
    });
    await auditar(ctx, ses, "salida_automatica", { nombre, marcaje_id: saved && s((saved as Row).id), motivo: "Salida automática", despues: { ts: dec.tsSalida, hora_salida: hasta } });
    cerrados.push({ nombre, ts: dec.tsSalida });
  }
  return { ok: true, cerrados: cerrados.length, detalle: cerrados };
});


export { instanteEcuador };


/**
 * TK170 (Emilia t768u): recalcula cada día de Jibble desde sus horas crudas (primera entrada / última salida /
 * pausas) con las MISMAS reglas que la marca de la app: horario de la persona, almuerzo del horario si en Jibble
 * no marcó pausa, extra 50 % después de la salida o pasadas 8 h, 100 % de noche, descanso o feriado.
 * Devuelve las diferencias contra lo guardado (payroll / suplementarias / extraordinarias / descanso).
 * No cambia nada: el rol sigue usando Jibble tal cual hasta que Emilia confirme.
 */
export function recalcularDiaJibble(raw: Row, fecha: string, config: ReturnType<typeof configDesde>, feriados: string[], jornada: { trabaja: boolean; desde: string | null; hasta: string | null } | null, almuerzo: { desde: string | null; hasta: string | null; duracionMin: number } | null): { abierto: boolean; workedMin: number; suplMin: number; extrMin: number; descMin: number; almuerzoMin: number } | null {
  const ini = s(raw?.firstInTimestamp) || s(raw?.startTime);
  const fin = s(raw?.lastOutTimestamp) || s(raw?.endTime);
  if (!ini) return null;
  if (!fin) return { abierto: true, workedMin: 0, suplMin: 0, extrMin: 0, descMin: 0, almuerzoMin: 0 };
  const marcas: { tipo: string; ts: string; anulado?: boolean }[] = [{ tipo: "entrada", ts: new Date(ini).toISOString() }];
  const pausas = (Array.isArray((raw?.trackedHours as Row)?.breaks) ? (raw.trackedHours as Row).breaks as Row[] : [])
    .filter((b) => s(b.type).toLowerCase() !== "paid" && s(b.start) && s(b.end));
  const pausa = pausas.sort((a, b) => (Date.parse(s(b.end)) - Date.parse(s(b.start))) - (Date.parse(s(a.end)) - Date.parse(s(a.start))))[0];
  let li: string | null = null, lf: string | null = null;
  if (pausa && Date.parse(s(pausa.end)) - Date.parse(s(pausa.start)) >= 10 * 60000) {
    li = new Date(s(pausa.start)).toISOString(); lf = new Date(s(pausa.end)).toISOString();
  } else if (almuerzo) {
    // Sin pausa en Jibble: se descuenta el almuerzo del horario (impago) si la jornada lo cubre.
    const d0 = almuerzo.desde || "13:00";
    // franja 12:00–15:00 con 60 min: se toma la duración (no toda la franja)
    const dur = almuerzo.duracionMin || (almuerzo.hasta ? Math.max(0, hmToMin(almuerzo.hasta) - hmToMin(d0)) : 60);
    const a = Date.parse(instanteEcuador(fecha, d0)), b = a + dur * 60000;
    if (Date.parse(ini) < a && Date.parse(fin) > b) { li = new Date(a).toISOString(); lf = new Date(b).toISOString(); }
  }
  if (li && lf) { marcas.push({ tipo: "almuerzo_inicio", ts: li }, { tipo: "almuerzo_fin", ts: lf }); }
  marcas.push({ tipo: "salida", ts: new Date(fin).toISOString() });
  const d = calcularDia(fecha, marcas as never, config, feriados, [], null, jornada as never, true);
  const alm = li && lf ? Math.round((Date.parse(lf) - Date.parse(li)) / 60000) : 0;
  return { abierto: false, workedMin: n(d.workedMin), suplMin: n(d.suplMin), extrMin: n(d.extrMin), descMin: n(d.descMin), almuerzoMin: alm };
}

export async function correccionesJibble(ctx: Ctx, nombre: string, desde: string, hasta: string): Promise<{ dias: Row[]; resumen: Row; importadoHasta: string | null }> {
  const [jib, feriados, config] = await Promise.all([
    ctx.db.all("jibble_historial").catch(() => [] as Row[]),
    feriadosDe(ctx),
    configDe(ctx).catch(() => configDesde(undefined)),
  ]);
  let jornadaFn: ((f: string) => { trabaja: boolean; desde: string | null; hasta: string | null }) | null = null;
  let almuerzo: { desde: string | null; hasta: string | null; duracionMin: number } | null = { desde: "13:00", hasta: "14:00", duracionMin: 60 };
  try {
    const { cargarHorarios } = await import("./horarios_api.ts");
    const { horarioAsignado, jornadaDe } = await import("./horarios.ts");
    const pack = await cargarHorarios(ctx);
    const emp = await empleadaDe(ctx, nombre);
    const h = horarioAsignado(pack.horarios, pack.asignaciones, [nombre, s(emp?.nombre_app), s(emp?.apellidos_y_nombres), s(emp?.nombre_jibble)])
      || pack.horarios.find((x) => x.esDefault) || null;
    if (h) {
      jornadaFn = (f) => jornadaDe(h, f);
      const dz = (h.descansos || [])[0];
      // La jornada de 9 h del horario incluye 1 h de almuerzo: el tope legal es 8 h, así que el almuerzo se
      // descuenta siempre que Jibble no tenga pausa (igual que Jibble, que cuenta extra pasada la jornada del horario).
      almuerzo = dz ? { desde: dz.desde, hasta: dz.hasta, duracionMin: dz.duracionMin || 60 } : almuerzo;
    }
  } catch { /* horario por defecto */ }
  const propias = jib.filter((r) => mismo(personaJibble(r), nombre));
  const importadoHasta = propias.map((r) => s(r.fecha).slice(0, 10)).sort().pop() || null;
  const dias: Row[] = [];
  const tot = { guardado: { payroll: 0, supl: 0, extr: 0, desc: 0 }, recalculado: { payroll: 0, supl: 0, extr: 0, desc: 0 }, abiertos: 0 };
  for (const r of propias) {
    const fecha = s(r.fecha).slice(0, 10);
    if (fecha < desde || fecha > hasta) continue;
    const g = { payroll: Math.round(n(r.payroll_minutes)), supl: Math.round(n(r.supplementary_minutes)), extr: Math.round(n(r.extraordinary_minutes)), desc: Math.round(n(r.rest_day_minutes)) };
    const rc = recalcularDiaJibble((r.raw || {}) as Row, fecha, config, feriados, jornadaFn ? jornadaFn(fecha) : null, almuerzo);
    if (!rc) continue;
    tot.guardado.payroll += g.payroll; tot.guardado.supl += g.supl; tot.guardado.extr += g.extr; tot.guardado.desc += g.desc;
    if (rc.abierto) {
      tot.abiertos++;
      dias.push({ fecha, abierto: true, guardado: g, nota: "Sin salida en Jibble: lo guardado es parcial (se importó con la jornada abierta)." });
      continue;
    }
    // payroll de Jibble = presencia (incluye el almuerzo pagado del horario): se compara igual.
    const nv = { payroll: rc.workedMin + rc.almuerzoMin, supl: rc.suplMin, extr: rc.extrMin, desc: rc.descMin };
    tot.recalculado.payroll += nv.payroll; tot.recalculado.supl += nv.supl; tot.recalculado.extr += nv.extr; tot.recalculado.desc += nv.desc;
    // extraordinarias y descanso/feriado se pagan igual (100 %): se comparan juntas.
    const dif = Math.abs(nv.payroll - g.payroll) >= 15 || Math.abs(nv.supl - g.supl) >= 15 || Math.abs((nv.extr + nv.desc) - (g.extr + g.desc)) >= 15;
    if (dif) dias.push({ fecha, abierto: false, guardado: g, recalculado: nv, almuerzoMin: rc.almuerzoMin });
  }
  return { dias: dias.sort((a, b) => s(a.fecha).localeCompare(s(b.fecha))), resumen: tot, importadoHasta };
}
