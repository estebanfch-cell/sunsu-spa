// Marcajes, permisos/vacaciones sobre la tabla permisos, y horas para el rol.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, bajasDe, nextSheet } from "./lib.ts";
import { ecuadorParts, n, s, type Row } from "./domain.ts";
import { acceso, esAdmin, esPropio, matrizDe } from "./permisos.ts";
import {
  diasDeVacacion, saldoVacaciones, validarSolicitudVacacion,
  calcularDia, calcularNomina, configDesde, estadoReloj, evaluarUbicacion, instanteEcuador, validarSecuencia,
  type JibbleIn, type MarcajeIn, type NominaHoras, type PermisoIn,
} from "./asistencia.ts";

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
    config: admin ? { ...cfg, punto_listo: cfg.lat != null && cfg.lng != null } : {
      radio_m: cfg.radio_m, punto_listo: cfg.lat != null && cfg.lng != null,
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
  const fotoIn = selfieBytes(s(p.foto));
  if ("error" in fotoIn) {
    await auditar(ctx, ses, "rechazo", { nombre, motivo: fotoIn.error, despues: { tipo } });
    return { error: fotoIn.error };
  }
  const geo = evaluarUbicacion(cfg, lat, lng, accuracy);
  if (!geo.ok) {
    await auditar(ctx, ses, "rechazo", { nombre, motivo: geo.error, despues: { tipo, distancia: geo.distancia ?? null } });
    return { error: geo.error, distancia: geo.distancia };
  }
  const subida = await subirSelfie(ctx, ses.uid, fecha, tipo, fotoIn);
  if ("error" in subida) {
    await auditar(ctx, ses, "rechazo", { nombre, motivo: subida.error, despues: { tipo } });
    return { error: subida.error };
  }
  const saved = await ctx.db.write(actorOf(ses), "asistencia_marcajes", "insert", {}, {
    usuario_id: ses.uid, nombre, tipo, ts, lat, lng, precision_m: accuracy,
    dentro_radio: true, foto: subida.path, origen: s(p.origen) === "recepcion" ? "recepcion" : "telefono", anulado: false,
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
  const crudos = (await ctx.db.all("asistencia_marcajes")).filter((r) => mismo(s(r.nombre), nombre) && ymdDeTs(s(r.ts)) === fecha);
  const marcajes = marcajesDe(crudos, nombre);
  const dia = calcularDia(fecha, marcajes, cfg, await feriadosDe(ctx), permisosDe(await ctx.db.all("permisos"), nombre));
  const reloj = estadoReloj(marcajes, ctx.now.toISOString());
  const permisos = (await ctx.db.all("permisos"))
    .filter((r) => !propio(ses, matriz) || esPropio(s(r.empleada), ses))
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
    feriados = (await feriadosDe(ctx)).map((fechaFer) => ({ fecha: fechaFer }));
    try {
      const nombres = new Map((await ctx.db.all("asistencia_feriados")).map((r) => [s(r.fecha).slice(0, 10), s(r.nombre)]));
      feriados = feriados.map((f) => ({ ...f, nombre: nombres.get(s(f.fecha)) || "" }));
    } catch { /* la lista de fechas alcanza */ }
  }
  const propia = await empleadaDe(ctx, ses.name);
  return {
    ok: true, fecha, dia, reloj, marcajes: crudos.map(marcaPub), permisos, pendientes, vacaciones, puedeAprobar: puedeAprobar(ses.rol), esAdmin: esAdmin(ses.rol), empleada: !!propia, equipo, feriados, auditoria: auditoria.map(audPub),
    config: {
      radio_m: cfg.radio_m, punto_listo: cfg.lat != null && cfg.lng != null,
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
    dias, origin: "beta", orig: { tipo, por: ses.name },
  };
  await ctx.db.write(actorOf(ses), "permisos", "insert", {}, fila);
  await auditar(ctx, ses, "solicitud", { nombre, permiso_sheet_row: sr, despues: { tipo, desde, hasta, dias, horas: n(p.horas) }, motivo: s(p.motivo) || tipo });
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
  const e = await empleadaDe(ctx, nombre);
  const saved = await ctx.db.write(actorOf(ses), "asistencia_marcajes", "insert", {}, {
    usuario_id: s(e?.nombre_app) || nombre, nombre, tipo, ts: d.toISOString(), origen: "manual",
    dentro_radio: null, anulado: false, creado_por: ses.name, motivo_manual: s(p.motivo),
  });
  await auditar(ctx, ses, "marca_manual", { nombre, marcaje_id: s(saved?.id), despues: { tipo, ts: d.toISOString() }, motivo: s(p.motivo) });
  return { ok: true, id: saved?.id };
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
  if (hit) await ctx.db.write(actorOf(ses), "asistencia_feriados", "update", { fecha: hit.fecha }, { nombre: s(p.nombre) });
  else await ctx.db.write(actorOf(ses), "asistencia_feriados", "insert", {}, { fecha, nombre: s(p.nombre) });
  await auditar(ctx, ses, "feriado", { nombre: "", antes: hit ? { fecha, nombre: s(hit.nombre) } : null, despues: { fecha, nombre: s(p.nombre) }, motivo: s(p.motivo) || "feriado" });
  return { ok: true };
});

function marcaPub(r: Row) {
  return {
    id: s(r.id), nombre: s(r.nombre), tipo: s(r.tipo), ts: s(r.ts),
    anulado: r.anulado === true, tieneFoto: s(r.foto).startsWith("asistencia/"),
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

export { instanteEcuador };
