// Marcajes, permisos/vacaciones sobre la tabla permisos, y horas para el rol.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, guardarArchivo, nextSheet } from "./lib.ts";
import { ecuadorParts, n, s, type Row } from "./domain.ts";
import { acceso, esAdmin, esPropio, matrizDe } from "./permisos.ts";
import {
  calcularDia, calcularNomina, configDesde, evaluarUbicacion, instanteEcuador, validarSecuencia,
  type JibbleIn, type MarcajeIn, type NominaHoras, type PermisoIn,
} from "./asistencia.ts";

type R = Record<string, unknown>;

function ymdDeTs(ts: string): string {
  return ecuadorParts(new Date(ts)).ymd;
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
  return rows.filter((r) => mismo(s(r.empleada), nombre)).map((r) => ({
    tipo: s(r.tipo), estado: s(r.estado), desde: s(r.fecha_inicio), hasta: s(r.fecha_fin), horas: n(r.horas),
  }));
}

function marcajesDe(rows: Row[], nombre: string): MarcajeIn[] {
  return rows.filter((r) => mismo(s(r.nombre), nombre)).map((r) => ({
    id: s(r.id), nombre: s(r.nombre), tipo: s(r.tipo), ts: s(r.ts), anulado: r.anulado === true,
  }));
}

function jibbleDe(rows: Row[], nombre: string): JibbleIn[] {
  return rows.filter((r) => mismo(s(r.persona), nombre)).map((r) => ({
    fecha: s(r.fecha).slice(0, 10),
    payrollMin: n(r.payroll_minutes), suplMin: n(r.supplementary_minutes),
    extrMin: n(r.extraordinary_minutes), descMin: n(r.rest_day_minutes),
  }));
}

export async function horasDeEmpleada(ctx: Ctx, nombre: string, anio: number, mes: number): Promise<NominaHoras> {
  const [marcajes, jibble, permisos, feriados, config] = await Promise.all([
    ctx.db.all("asistencia_marcajes").catch(() => []),
    ctx.db.all("jibble_historial").catch(() => []),
    ctx.db.all("permisos").catch(() => []),
    feriadosDe(ctx),
    configDe(ctx).catch(() => configDesde(undefined)),
  ]);
  return calcularNomina({
    anio, mes, config, feriados, hoy: ecuadorParts(ctx.now).ymd,
    marcajes: marcajesDe(marcajes, nombre),
    jibble: jibbleDe(jibble, nombre),
    permisos: permisosDe(permisos, nombre),
  });
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
    config: admin ? cfg : {
      exigir_geo: cfg.exigir_geo, exigir_selfie: cfg.exigir_selfie, radio_m: cfg.radio_m,
      hora_entrada: cfg.hora_entrada, hora_salida: cfg.hora_salida, gracia_min: cfg.gracia_min,
      jornada_horas: cfg.jornada_horas,
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
    exigir_geo: p.exigir_geo === true || s(p.exigir_geo) === "true",
    exigir_selfie: p.exigir_selfie === true || s(p.exigir_selfie) === "true",
    hora_entrada: /^\d{2}:\d{2}$/.test(s(p.hora_entrada)) ? s(p.hora_entrada) : antes.hora_entrada,
    hora_salida: /^\d{2}:\d{2}$/.test(s(p.hora_salida)) ? s(p.hora_salida) : antes.hora_salida,
    jornada_horas: Math.min(12, Math.max(1, n(p.jornada_horas) || antes.jornada_horas)),
    gracia_min: Math.max(0, p.gracia_min == null || p.gracia_min === "" ? antes.gracia_min : n(p.gracia_min)),
    cuenta_antes: p.cuenta_antes === true || s(p.cuenta_antes) === "true",
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
  const geo = evaluarUbicacion(cfg, lat, lng, accuracy);
  if (!geo.ok) {
    await auditar(ctx, ses, "rechazo", { nombre, motivo: geo.error, despues: { tipo, distancia: geo.distancia ?? null } });
    return { error: geo.error, distancia: geo.distancia };
  }
  let foto = "";
  if (cfg.exigir_selfie) {
    if (!s(p.foto).includes("base64,")) return { error: "La marca pide una selfie." };
    const id = await guardarArchivo(ctx.db, actorOf(ses), "asistencia", tipo, s(p.foto));
    if (!id) return { error: "La selfie no cabe (máximo 1.5 MB)." };
    foto = "archivo:" + id;
  }
  const saved = await ctx.db.write(actorOf(ses), "asistencia_marcajes", "insert", {}, {
    usuario_id: ses.uid, nombre, tipo, ts, lat, lng, precision_m: accuracy,
    dentro_radio: cfg.exigir_geo ? true : null, foto, origen: s(p.origen) === "recepcion" ? "recepcion" : "telefono", anulado: false,
  });
  const dia = calcularDia(fecha, marcajesDe(await ctx.db.all("asistencia_marcajes"), nombre), cfg, await feriadosDe(ctx), permisosDe(await ctx.db.all("permisos"), nombre));
  return { ok: true, id: saved?.id, marcaje: { id: saved?.id, nombre, tipo, ts }, dia };
});

extend("asis_hoy", "any", async (p, ctx, ses) => {
  const matriz = await matrizDe(ctx.db);
  if (acceso(ses.rol, "asistencia", matriz) === "no") return { error: "No tienes permiso" };
  const nombre = esAdmin(ses.rol) && s(p.nombre) ? s(p.nombre) : ses.name;
  const cfg = await configDe(ctx);
  const fecha = ecuadorParts(ctx.now).ymd;
  const marcajes = marcajesDe(await ctx.db.all("asistencia_marcajes"), nombre).filter((m) => ymdDeTs(m.ts) === fecha);
  const dia = calcularDia(fecha, marcajes, cfg, await feriadosDe(ctx), permisosDe(await ctx.db.all("permisos"), nombre));
  const permisos = (await ctx.db.all("permisos")).filter((r) => !propio(ses, matriz) || esPropio(s(r.empleada), ses)).map(permisoPub);
  let auditoria: Row[] = [];
  try {
    auditoria = (await ctx.db.all("asistencia_auditoria"))
      .filter((r) => esAdmin(ses.rol) || esPropio(s(r.nombre), ses))
      .slice(-8).reverse();
  } catch { auditoria = []; }
  const pendientes = esAdmin(ses.rol) ? permisos.filter((r) => /pend/i.test(s(r.estado))).length : 0;
  let equipo: R[] | undefined;
  let feriados: R[] | undefined;
  if (esAdmin(ses.rol)) {
    equipo = (await ctx.db.all("asistencia_marcajes"))
      .filter((r) => ymdDeTs(s(r.ts)) === fecha)
      .map((r) => ({ id: s(r.id), nombre: s(r.nombre), tipo: s(r.tipo), ts: s(r.ts), anulado: r.anulado === true }));
    feriados = (await feriadosDe(ctx)).map((fechaFer) => ({ fecha: fechaFer }));
    try {
      const nombres = new Map((await ctx.db.all("asistencia_feriados")).map((r) => [s(r.fecha).slice(0, 10), s(r.nombre)]));
      feriados = feriados.map((f) => ({ ...f, nombre: nombres.get(s(f.fecha)) || "" }));
    } catch { /* la lista de fechas alcanza */ }
  }
  return {
    ok: true, fecha, dia, marcajes, permisos, pendientes, equipo, feriados, auditoria: auditoria.map(audPub),
    config: {
      exigir_geo: cfg.exigir_geo, exigir_selfie: cfg.exigir_selfie, radio_m: cfg.radio_m,
      hora_entrada: cfg.hora_entrada, hora_salida: cfg.hora_salida, gracia_min: cfg.gracia_min,
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
    const set = new Set<string>();
    for (const r of await ctx.db.all("rrhh_empleadas")) if (s(r.nombre_app)) set.add(s(r.nombre_app));
    for (const r of await ctx.db.all("asistencia_marcajes")) if (s(r.nombre)) set.add(s(r.nombre));
    nombres = [...set];
    if (!nombres.length) nombres = [ses.name];
  }
  const personas = [];
  for (const nombre of nombres) personas.push({ nombre, ...(await horasDeEmpleada(ctx, nombre, anio, mes)) });
  return { ok: true, anio, mes, personas };
});

extend("asis_corregir", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin corrige una marca" };
  if (!s(p.motivo)) return { error: "La corrección necesita un motivo" };
  const rows = await ctx.db.all("asistencia_marcajes");
  const hit = rows.find((r) => s(r.id) === s(p.id));
  if (!hit) return { error: "Marca no encontrada" };
  const antes = { tipo: hit.tipo, ts: hit.ts, anulado: hit.anulado === true };
  const patch: R = {};
  if (s(p.tipo)) patch.tipo = s(p.tipo);
  if (s(p.ts)) patch.ts = s(p.ts);
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
  const tipo = /vacac/i.test(s(p.tipo)) ? "VACACIONES" : "PERMISO";
  if (!s(p.desde)) return { error: "Falta la fecha" };
  const nombre = esAdmin(ses.rol) && s(p.empleada) ? s(p.empleada) : ses.name;
  const sr = await nextSheet(ctx.db, "permisos");
  await ctx.db.write(actorOf(ses), "permisos", "insert", {}, {
    sheet_row: sr, id_1: "P-" + sr, empleada: nombre, tipo,
    fecha_inicio: s(p.desde).slice(0, 10), fecha_fin: s(p.hasta || p.desde).slice(0, 10),
    horas: n(p.horas), motivo: s(p.motivo), estado: "PENDIENTE", solicitado: ecuadorParts(ctx.now).ymd,
    orig: { tipo, por: ses.name },
  });
  return { ok: true, id: "P-" + sr };
});

extend("asis_permiso_resolver", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin aprueba permisos y vacaciones" };
  const estado = /rechaz/i.test(s(p.estado)) ? "RECHAZADO" : "APROBADO";
  const rows = await ctx.db.all("permisos");
  const row = rows.find((r) => s(r.id_1) === s(p.id) || String(r.sheet_row) === s(p.row));
  if (!row) return { error: "Permiso no encontrado" };
  const antes = { estado: row.estado };
  await ctx.db.write(actorOf(ses), "permisos", "update", { sheet_row: row.sheet_row }, { estado, aprobado_por: ses.name });
  await auditar(ctx, ses, "permiso", { nombre: s(row.empleada), antes, despues: { estado }, motivo: s(p.motivo) || estado, permiso_sheet_row: row.sheet_row });
  return { ok: true, estado };
});

extend("asis_feriado", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin carga feriados" };
  const fecha = s(p.fecha).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida" };
  const rows = await ctx.db.all("asistencia_feriados");
  const hit = rows.find((r) => s(r.fecha).slice(0, 10) === fecha);
  if (s(p.borrar) === "1" || p.borrar === true) {
    if (hit) await ctx.db.write(actorOf(ses), "asistencia_feriados", "delete", { fecha: hit.fecha }, null);
    return { ok: true };
  }
  if (hit) await ctx.db.write(actorOf(ses), "asistencia_feriados", "update", { fecha: hit.fecha }, { nombre: s(p.nombre) });
  else await ctx.db.write(actorOf(ses), "asistencia_feriados", "insert", {}, { fecha, nombre: s(p.nombre) });
  return { ok: true };
});

function permisoPub(r: Row) {
  return {
    id: s(r.id_1) || s(r.sheet_row), row: r.sheet_row, empleada: s(r.empleada), tipo: s(r.tipo),
    desde: s(r.fecha_inicio).slice(0, 10), hasta: s(r.fecha_fin).slice(0, 10), horas: n(r.horas),
    motivo: s(r.motivo), estado: s(r.estado), aprobadoPor: s(r.aprobado_por),
  };
}

function audPub(r: Row) {
  return { ts: s(r.ts), actor: s(r.actor), accion: s(r.accion), nombre: s(r.nombre), motivo: s(r.motivo), antes: r.antes || null, despues: r.despues || null };
}

export { instanteEcuador };
