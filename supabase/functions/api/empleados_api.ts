// Personal › Empleados: ficha por persona, afiliación IESS, descuentos manuales, documentos (admin) y OC de servicios.
// No se consulta el portal del IESS.

import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, nextSheet } from "./lib.ts";
import { ecuadorParts, n, normNombre, round2, s, type Row } from "./domain.ts";
import { enPrueba } from "./db.ts";
import { esAdmin } from "./permisos.ts";
import { siguienteAnual } from "./compras_beta.ts";

type R = Record<string, unknown>;

function uid(): string {
  return crypto.randomUUID();
}

export function esFilaNotasRrhh(r: Row): boolean {
  const app = s(r.nombre_app);
  const jib = s(r.nombre_jibble);
  if (!app && !jib) return true;
  if (!app && /solo modificar|ℹ️|⚠/i.test(jib)) return true;
  if (/^ℹ️|^⚠/.test(app) || /solo modificar/i.test(app)) return true;
  return false;
}

function mismoNombre(a: string, b: string): boolean {
  const na = normNombre(a), nb = normNombre(b);
  if (!na || !nb) return false;
  return na === nb || na.startsWith(nb) || nb.startsWith(na);
}

export function descuentosVigentesEn(items: Row[], ymd: string): { quir: number; hip: number; otros: number; items: Row[] } {
  const out: Row[] = [];
  let quir = 0, hip = 0, otros = 0;
  for (const r of items) {
    if (r.activo === false) continue;
    const desde = s(r.vigente_desde).slice(0, 10);
    const hasta = s(r.vigente_hasta).slice(0, 10);
    if (desde && ymd < desde) continue;
    if (hasta && ymd > hasta) continue;
    const monto = round2(n(r.monto));
    if (!(monto > 0)) continue;
    const tipo = s(r.tipo);
    if (tipo === "quirografario") quir = round2(quir + monto);
    else if (tipo === "hipotecario") hip = round2(hip + monto);
    else otros = round2(otros + monto);
    out.push({ id: r.id, tipo, descripcion: s(r.descripcion), monto, vigente_desde: desde || null, vigente_hasta: hasta || null });
  }
  return { quir, hip, otros, items: out };
}

async function overlayDe(ctx: Ctx, nombre: string): Promise<Row | undefined> {
  const rows = await ctx.db.all("beta_empleados").catch(() => [] as Row[]);
  return rows.find((r) => mismoNombre(s(r.nombre_app), nombre));
}

async function asegurarOverlay(ctx: Ctx, ses: Ses, nombre: string, extra: Row = {}): Promise<Row> {
  const prev = await overlayDe(ctx, nombre);
  if (prev) {
    if (Object.keys(extra).length) {
      const saved = await ctx.db.write(actorOf(ses), "beta_empleados", "update", { id: prev.id }, { ...extra, updated_at: ctx.now.toISOString() });
      return saved || { ...prev, ...extra };
    }
    return prev;
  }
  const id = uid();
  const rec = {
    id, nombre_app: nombre, afiliada_iess: extra.afiliada_iess != null ? extra.afiliada_iess : true,
    usuario_id: extra.usuario_id || null, proveedor_id: extra.proveedor_id || null,
    nombre_jibble: extra.nombre_jibble || null, notas: extra.notas || null,
    origin: enPrueba(ctx.db) ? "test" : "beta",
    created_at: ctx.now.toISOString(), updated_at: ctx.now.toISOString(),
  };
  const saved = await ctx.db.write(actorOf(ses), "beta_empleados", "insert", {}, rec);
  return saved || rec;
}

export function afiliadaSegunOverlay(overlays: Row[], nombre: string): boolean {
  const o = overlays.find((r) => mismoNombre(s(r.nombre_app), nombre));
  return o ? o.afiliada_iess !== false : true;
}

export async function fichaIessDe(ctx: Ctx, nombre: string, ymd?: string): Promise<{ afiliada: boolean; quir: number; hip: number; otros: number; items: Row[] }> {
  const overlay = await overlayDe(ctx, nombre);
  const afiliada = overlay ? overlay.afiliada_iess !== false : true;
  if (!afiliada) return { afiliada: false, quir: 0, hip: 0, otros: 0, items: [] };
  const fecha = ymd || ecuadorParts(ctx.now).ymd;
  const todos = overlay
    ? (await ctx.db.all("beta_iess_descuentos").catch(() => [] as Row[])).filter((r) => s(r.empleado_id) === s(overlay.id))
    : [];
  const v = descuentosVigentesEn(todos, fecha);
  return { afiliada: true, ...v };
}

function pubEmpleada(rrhh: Row | undefined, overlay: Row | undefined, usuario: Row | undefined, horario: Row | undefined): Row {
  const nombre = s(overlay?.nombre_app) || s(rrhh?.nombre_app) || s(rrhh?.apellidos_y_nombres) || s(rrhh?.nombre_jibble);
  return {
    id: s(overlay?.id) || ("rrhh:" + (rrhh?.id || rrhh?.sheet_row || normNombre(nombre))),
    nombre,
    nombreJibble: s(rrhh?.nombre_jibble) || s(overlay?.nombre_jibble),
    cargo: s(rrhh?.cargo),
    fechaIngreso: s(rrhh?.fecha_ingreso).slice(0, 10) || null,
    sueldo: n(rrhh?.sueldo_base) || n(rrhh?.sueldo) || 0,
    bono: n(rrhh?.bono_fijo) || n(rrhh?.bono) || 0,
    jornada: s(rrhh?.jornada),
    tieneUsuario: !!(overlay?.usuario_id || usuario),
    usuarioId: s(overlay?.usuario_id) || s(usuario?.id) || null,
    usuarioNombre: usuario ? (s(usuario.nombre) || s(usuario.name)) : null,
    usuarioRol: usuario ? s(usuario.rol || usuario.role) : null,
    afiliadaIess: overlay ? overlay.afiliada_iess !== false : true,
    dec13Mensual: overlay?.dec13_mensual !== false,
    dec14Mensual: overlay?.dec14_mensual !== false,
    fondoMensual: overlay?.fondo_mensual !== false,
    proveedorId: s(overlay?.proveedor_id) || null,
    horarioId: horario ? s(horario.id) : null,
    horarioNombre: horario ? s(horario.nombre) : null,
    rrhhSheet: rrhh?.sheet_row ?? null,
    notas: s(overlay?.notas) || null,
  };
}

function esUsuarioActivo(u: Row): boolean {
  return u.activo !== false && !u.bloqueado;
}

async function usuariosApp(ctx: Ctx): Promise<Row[]> {
  const app = await ctx.db.all("app_usuarios").catch(() => [] as Row[]);
  if (app.length) return app.filter(esUsuarioActivo);
  return (await ctx.db.all("usuarios").catch(() => [] as Row[])).filter(esUsuarioActivo);
}

async function horarioAsignadoNombre(ctx: Ctx, nombre: string): Promise<Row | undefined> {
  try {
    const { cargarHorarios } = await import("./horarios_api.ts");
    const { horarioAsignado } = await import("./horarios.ts");
    const pack = await cargarHorarios(ctx);
    return horarioAsignado(pack.horarios, pack.asignaciones, [nombre]) || undefined;
  } catch {
    return undefined;
  }
}

extend("emp_list", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración ve el módulo de empleados." };
  const [rrhh, overlays, users] = await Promise.all([
    ctx.db.all("rrhh_empleadas").catch(() => [] as Row[]),
    ctx.db.all("beta_empleados").catch(() => [] as Row[]),
    usuariosApp(ctx),
  ]);
  const byName = new Map<string, Row>();
  for (const r of rrhh) {
    if (esFilaNotasRrhh(r)) continue;
    const nombre = s(r.nombre_app) || s(r.apellidos_y_nombres) || s(r.nombre_jibble);
    if (!nombre) continue;
    byName.set(normNombre(nombre), r);
  }
  let pack: { horarios: { id?: string; nombre?: string }[]; asignaciones: Row[] } | null = null;
  try {
    const { cargarHorarios } = await import("./horarios_api.ts");
    pack = await cargarHorarios(ctx);
  } catch { pack = null; }
  const { horarioAsignado } = pack ? await import("./horarios.ts") : { horarioAsignado: null as unknown as typeof import("./horarios.ts").horarioAsignado };
  const horDe = (nombre: string) => {
    if (!pack || !horarioAsignado) return undefined;
    return horarioAsignado(pack.horarios as never, pack.asignaciones as never, [nombre]) || undefined;
  };
  const items: Row[] = [];
  const vistos = new Set<string>();
  for (const [key, r] of byName) {
    const nm = s(r.nombre_app) || s(r.apellidos_y_nombres);
    const ov = overlays.find((o) => mismoNombre(s(o.nombre_app), nm));
    const uidU = s(ov?.usuario_id);
    const user = uidU ? users.find((u) => s(u.id) === uidU) : users.find((u) => mismoNombre(s(u.nombre) || s(u.name), nm));
    items.push(pubEmpleada(r, ov, user, horDe(nm)));
    vistos.add(key);
  }
  for (const ov of overlays) {
    if (vistos.has(normNombre(s(ov.nombre_app)))) continue;
    const user = users.find((u) => s(u.id) === s(ov.usuario_id));
    items.push(pubEmpleada(undefined, ov, user, horDe(s(ov.nombre_app))));
  }
  items.sort((a, b) => s(a.nombre).localeCompare(s(b.nombre), "es"));
  const usuarios = users.map((u) => ({ id: s(u.id), nombre: s(u.nombre) || s(u.name), rol: s(u.rol || u.role) }));
  return { ok: true, items, usuarios };
});

extend("emp_get", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración ve la ficha de una empleada." };
  const id = s(p.id);
  const nombreQ = s(p.nombre);
  const [rrhh, overlays, users] = await Promise.all([
    ctx.db.all("rrhh_empleadas").catch(() => [] as Row[]),
    ctx.db.all("beta_empleados").catch(() => [] as Row[]),
    usuariosApp(ctx),
  ]);
  const ov = overlays.find((o) => s(o.id) === id || (nombreQ && mismoNombre(s(o.nombre_app), nombreQ)));
  const r = rrhh.find((x) => !esFilaNotasRrhh(x) && (
    (ov && mismoNombre(s(x.nombre_app) || s(x.apellidos_y_nombres), s(ov.nombre_app)))
    || (id.startsWith("rrhh:") && String(x.sheet_row) === id.slice(5))
    || (nombreQ && mismoNombre(s(x.nombre_app) || s(x.apellidos_y_nombres), nombreQ))
  ));
  const nombre = s(ov?.nombre_app) || s(r?.nombre_app) || s(r?.apellidos_y_nombres) || nombreQ;
  if (!nombre) return { error: "No se encontró a esa empleada." };
  const user = users.find((u) => s(u.id) === s(ov?.usuario_id)) || users.find((u) => mismoNombre(s(u.nombre) || s(u.name), nombre));
  const hor = await horarioAsignadoNombre(ctx, nombre);
  const ficha = pubEmpleada(r, ov, user, hor);
  const desc = ov ? (await ctx.db.all("beta_iess_descuentos").catch(() => [] as Row[])).filter((d) => s(d.empleado_id) === s(ov.id) && d.activo !== false) : [];
  const docs = ov && esAdmin(ses.rol)
    ? (await ctx.db.all("beta_empleado_docs").catch(() => [] as Row[])).filter((d) => s(d.empleado_id) === s(ov.id)).map((d) => ({
      id: s(d.id), nombre: s(d.nombre), mime: s(d.mime), created_at: s(d.created_at), creado_por: s(d.creado_por),
    }))
    : [];
  const ocs = s(ficha.proveedorId)
    ? (await ctx.db.all("erp_oc").catch(() => [] as Row[])).filter((o) => s(o.proveedor_id) === s(ficha.proveedorId) && s((o.snap as Row)?.tipo || "") === "servicios_empleado").map((o) => ({
      id: s(o.id), numero: s(o.numero), fecha: s(o.fecha), total: n(o.total), periodo: s((o.snap as Row)?.periodo), estado: s(o.estado),
    }))
    : [];
  return {
    ok: true,
    item: ficha,
    descuentos: desc.map((d) => ({ id: d.id, tipo: d.tipo, descripcion: s(d.descripcion), monto: n(d.monto), vigente_desde: s(d.vigente_desde).slice(0, 10), vigente_hasta: s(d.vigente_hasta).slice(0, 10), activo: d.activo !== false })),
    documentos: docs,
    ordenes: ocs,
    usuarios: users.map((u) => ({ id: s(u.id), nombre: s(u.nombre) || s(u.name), rol: s(u.rol || u.role) })),
  };
});

extend("emp_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración edita empleados." };
  const nombre = s(p.nombre).trim();
  if (!nombre) return { error: "Falta el nombre." };
  let rrhh = (await ctx.db.all("rrhh_empleadas").catch(() => [] as Row[])).find((x) => !esFilaNotasRrhh(x) && mismoNombre(s(x.nombre_app) || s(x.apellidos_y_nombres), nombre));
  if (!rrhh && (p.cargo != null || p.fecha_ingreso || p.nuevo === true)) {
    const sr = await nextSheet(ctx.db, "rrhh_empleadas");
    const rec: Row = {
      sheet_row: sr, nombre_app: nombre, nombre_jibble: s(p.nombre_jibble) || nombre,
      apellidos_y_nombres: nombre, cargo: s(p.cargo) || null,
      fecha_ingreso: s(p.fecha_ingreso).slice(0, 10) || null,
      sueldo_base: p.sueldo != null && s(p.sueldo) !== "" ? n(p.sueldo) : null,
      bono_fijo: p.bono != null && s(p.bono) !== "" ? n(p.bono) : null,
      origin: enPrueba(ctx.db) ? "test" : "beta",
    };
    rrhh = await ctx.db.write(actorOf(ses), "rrhh_empleadas", "insert", {}, rec) || rec;
  } else if (rrhh && (p.cargo != null || p.fecha_ingreso != null || p.sueldo != null || p.bono != null || p.nombre_jibble != null)) {
    const patch: Row = {};
    if (p.cargo != null) patch.cargo = s(p.cargo) || null;
    if (p.fecha_ingreso != null) patch.fecha_ingreso = s(p.fecha_ingreso).slice(0, 10) || null;
    if (p.sueldo != null && s(p.sueldo) !== "") patch.sueldo_base = n(p.sueldo);
    if (p.bono != null && s(p.bono) !== "") patch.bono_fijo = n(p.bono);
    if (p.nombre_jibble != null) patch.nombre_jibble = s(p.nombre_jibble);
    if (Object.keys(patch).length) {
      const key = rrhh.id != null ? { id: rrhh.id } : { sheet_row: rrhh.sheet_row };
      rrhh = await ctx.db.write(actorOf(ses), "rrhh_empleadas", "update", key, patch) || { ...rrhh, ...patch };
    }
  }
  const extra: Row = { nombre_jibble: s(p.nombre_jibble) || s(rrhh?.nombre_jibble) || null };
  if (p.afiliada_iess != null) extra.afiliada_iess = p.afiliada_iess === true || p.afiliada_iess === "1" || p.afiliada_iess === "si" || p.afiliada_iess === "sí";
  if (p.tiene_usuario === false || p.tiene_usuario === "0" || p.tiene_usuario === "no") extra.usuario_id = null;
  else if (p.usuario_id != null) extra.usuario_id = s(p.usuario_id) || null;
  if (p.notas != null) extra.notas = s(p.notas);
  // TK166: décimo tercero / cuarto / fondo de reserva mensualizados (sí) o acumulados (no)
  const siNoB = (v: unknown) => v === true || v === "1" || s(v).toLowerCase() === "si" || s(v).toLowerCase() === "sí" || s(v).toLowerCase() === "true";
  for (const k of ["dec13_mensual", "dec14_mensual", "fondo_mensual"]) if (p[k] != null) extra[k] = siNoB(p[k]);
  const ov = await asegurarOverlay(ctx, ses, nombre, extra);
  return { ok: true, id: s(ov.id), nombre };
});

extend("emp_iess_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración carga los descuentos IESS." };
  const nombre = s(p.nombre);
  if (!nombre) return { error: "Falta la empleada." };
  const tipo = s(p.tipo);
  if (!["quirografario", "hipotecario", "otro"].includes(tipo)) return { error: "Tipo: quirografario, hipotecario u otro." };
  const monto = round2(n(p.monto));
  if (!(monto >= 0)) return { error: "Indica el monto mensual." };
  const ov = await asegurarOverlay(ctx, ses, nombre);
  const rec: Row = {
    empleado_id: ov.id, tipo, descripcion: s(p.descripcion).slice(0, 200),
    monto, vigente_desde: s(p.vigente_desde).slice(0, 10) || null,
    vigente_hasta: s(p.vigente_hasta).slice(0, 10) || null,
    activo: p.activo === false || p.activo === "0" ? false : true,
    origin: enPrueba(ctx.db) ? "test" : "beta",
    creado_por: actorOf(ses), updated_at: ctx.now.toISOString(),
  };
  if (s(p.id)) {
    await ctx.db.write(actorOf(ses), "beta_iess_descuentos", "update", { id: s(p.id) }, rec);
    return { ok: true, id: s(p.id) };
  }
  const id = uid();
  await ctx.db.write(actorOf(ses), "beta_iess_descuentos", "insert", {}, { ...rec, id, created_at: ctx.now.toISOString() });
  return { ok: true, id };
});

extend("emp_iess_borrar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración quita un descuento IESS." };
  if (!s(p.id)) return { error: "Falta el descuento." };
  await ctx.db.write(actorOf(ses), "beta_iess_descuentos", "update", { id: s(p.id) }, { activo: false, updated_at: ctx.now.toISOString() });
  return { ok: true };
});

extend("emp_doc_subir", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración sube documentos de una empleada." };
  if (enPrueba(ctx.db)) return { error: "La simulación no guarda documentos reales de empleadas." };
  const nombre = s(p.nombre);
  if (!nombre) return { error: "Falta la empleada." };
  const archivo = s(p.archivo || p.data);
  const filename = s(p.filename || p.nombre_archivo) || "documento";
  if (!archivo.includes("base64,")) return { error: "Adjunta un archivo." };
  const ov = await asegurarOverlay(ctx, ses, nombre);
  const { guardarArchivo } = await import("./lib.ts");
  const aid = await guardarArchivo(ctx.db, actorOf(ses), "empleado", filename, archivo);
  if (!aid) return { error: "No se pudo guardar el documento." };
  const id = uid();
  await ctx.db.write(actorOf(ses), "beta_empleado_docs", "insert", {}, {
    id, empleado_id: ov.id, nombre: filename, mime: s(p.mime) || null,
    archivo_id: aid, origin: "beta", creado_por: actorOf(ses), created_at: ctx.now.toISOString(),
  });
  return { ok: true, id };
});

extend("emp_doc_url", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración descarga documentos de una empleada." };
  const doc = (await ctx.db.all("beta_empleado_docs").catch(() => [] as Row[])).find((d) => s(d.id) === s(p.id));
  if (!doc) return { error: "Documento no encontrado." };
  if (!s(doc.archivo_id)) return { error: "Este documento no tiene archivo." };
  const rows = await ctx.db.all("app_archivos").catch(() => [] as Row[]);
  const a = rows.find((x) => s(x.id) === s(doc.archivo_id));
  if (!a) return { error: "El archivo ya no está." };
  return { ok: true, nombre: s(doc.nombre), mime: s(a.mime) || s(doc.mime) || "application/octet-stream", data_b64: s(a.data_b64), descargar: p.descargar === true || p.descargar === "1" };
});

const MES_ES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

async function comisionesMenosMultas(ctx: Ctx, nombre: string, anio: number, mes: number): Promise<{ comisiones: number; multas: number; neto: number; detalle: Row }> {
  let com = { comFaciales: 0, comExtras: 0, comRecepcion: 0, comProductos: 0, comPaquetes: 0, multas: 0 };
  try {
    const extra = await import("./handlers_extra.ts") as unknown as { comisionesDeTablas?: (c: Ctx, n: string, a: number, m: number) => Promise<typeof com> };
    if (extra.comisionesDeTablas) com = await extra.comisionesDeTablas(ctx, nombre, anio, mes);
  } catch { /* tablas incompletas en prueba: se usa el historial si existe */ }
  const { multasBetaRol } = await import("./multas_beta_api.ts");
  const prev = mes === 1 ? { y: anio - 1, m: 12 } : { y: anio, m: mes - 1 };
  const cicloM = `${prev.y}-${String(prev.m).padStart(2, "0")}-26`;
  const finM = `${anio}-${String(mes).padStart(2, "0")}-25`;
  const mBeta = await multasBetaRol(ctx.db, nombre, cicloM, finM);
  let comisiones = round2(n(com.comFaciales) + n(com.comExtras) + n(com.comRecepcion) + n(com.comProductos) + n(com.comPaquetes));
  if (!(comisiones > 0)) {
    const hist = (await ctx.db.all("rrhh_historial").catch(() => [] as Row[])).find((r) =>
      mismoNombre(s(r.empleada), nombre) && n(r.ano) === anio && s(r.mes).toLowerCase() === MES_ES[mes].toLowerCase());
    if (hist) comisiones = round2(n(hist.comisiones));
  }
  let multasSis = n(com.multas);
  if (!(multasSis > 0)) {
    for (const r of await ctx.db.all("multas_descuentos").catch(() => [] as Row[])) {
      if (r.borrado_at) continue;
      const f = s(r.fecha).slice(0, 10);
      if (!f || f < cicloM || f > finM) continue;
      if (!mismoNombre(s(r.cosmetologa) || s(r.empleada) || s(r.nombre), nombre) && !normNombre(s(r.cosmetologa) || s(r.empleada) || s(r.nombre)).startsWith(normNombre(nombre).split(" ")[0] || "—")) continue;
      multasSis = round2(multasSis + n(r.monto));
    }
  }
  const multas = round2(multasSis + mBeta.total);
  return {
    comisiones, multas, neto: round2(Math.max(0, comisiones - multas)),
    detalle: { ...com, cicloM, finM, multasBeta: mBeta.total },
  };
}

export async function totalServiciosMes(ctx: Ctx, nombre: string, anio: number, mes: number) {
  return comisionesMenosMultas(ctx, nombre, anio, mes);
}

extend("emp_oc_servicios", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración genera la orden de compra de servicios." };
  const nombre = s(p.nombre);
  if (!nombre) return { error: "Falta la empleada." };
  const ymd = s(p.periodo).slice(0, 7) || ecuadorParts(ctx.now).ymd.slice(0, 7);
  const [anio, mes] = ymd.split("-").map(Number);
  const ov0 = await overlayDe(ctx, nombre);
  if (ov0 && ov0.afiliada_iess !== false) return { error: "Esta persona está afiliada al IESS: se le hace rol de pagos, no una orden de compra." };
  const ov = await asegurarOverlay(ctx, ses, nombre, { afiliada_iess: false });
  const sums = await comisionesMenosMultas(ctx, nombre, anio, mes);
  if (!(sums.neto > 0) && p.forzar !== true && p.forzar !== "1") return { error: "No hay comisiones netas en ese periodo.", ...sums, periodo: ymd };
  let provId = s(ov.proveedor_id);
  const provs = await ctx.db.all("erp_proveedores").catch(() => [] as Row[]);
  let prov = provId ? provs.find((x) => s(x.id) === provId) : undefined;
  if (!prov) prov = provs.find((x) => mismoNombre(s(x.nombre), nombre) && (x.beta_empleado === true || s((x as Row).tipo) === "servicios_empleado"));
  if (!prov) {
    provId = uid();
    await ctx.db.write(actorOf(ses), "erp_proveedores", "insert", {}, {
      id: provId, nombre, activo: true, origin: enPrueba(ctx.db) ? "test" : "beta",
      nota: "Proveedor de servicios profesionales (empleada no afiliada al IESS)",
    });
    await ctx.db.write(actorOf(ses), "beta_empleados", "update", { id: ov.id }, { proveedor_id: provId, updated_at: ctx.now.toISOString() });
  } else {
    provId = s(prov.id);
    if (s(ov.proveedor_id) !== provId) await ctx.db.write(actorOf(ses), "beta_empleados", "update", { id: ov.id }, { proveedor_id: provId, updated_at: ctx.now.toISOString() });
  }
  const ocs = await ctx.db.all("erp_oc").catch(() => [] as Row[]);
  const dup = ocs.find((o) => s(o.proveedor_id) === provId && s((o.snap as Row)?.periodo) === ymd && s(o.estado) !== "cancelada" && s((o.snap as Row)?.tipo) === "servicios_empleado");
  if (dup && p.reemplazar !== true && p.reemplazar !== "1") return { ok: true, id: s(dup.id), numero: s(dup.numero), total: n(dup.total), periodo: ymd, existente: true, ...sums };
  const IVA = 0.15;
  const total = sums.neto;
  const subtotal = round2(total / (1 + IVA));
  const iva = round2(total - subtotal);
  const numero = siguienteAnual(ocs, "OC", anio);
  const id = uid();
  const lineaNombre = `Servicios profesionales · comisiones ${ymd} (menos multas)`;
  const nota = `Por favor emite una factura por tus servicios profesionales de ${ymd} (comisiones $${sums.comisiones.toFixed(2)} menos multas $${sums.multas.toFixed(2)}). Incluye el número ${numero} en la factura.`;
  const snap = {
    tipo: "servicios_empleado", periodo: ymd, persona: nombre,
    comisiones: sums.comisiones, multas: sums.multas, neto: sums.neto,
    conIva: true,
    lineas: [{ sku: "SERV-PROF", nombre: lineaNombre, pedido: 1, precio: subtotal, subtotal }],
    prov: { id: provId, nombre },
  };
  await ctx.db.write(actorOf(ses), "erp_oc", "insert", {}, {
    id, numero, proveedor_id: provId, fecha: ecuadorParts(ctx.now).ymd,
    flujo: "Aprobada", estado: "abierta", tipo: "compra",
    subtotal, iva, total, pagado: 0, saldo: total, estado_pago: "pendiente",
    nota, creado_por: actorOf(ses), origin: enPrueba(ctx.db) ? "test" : "beta",
    snap, q_label: "Servicios profesionales",
  });
  await ctx.db.write(actorOf(ses), "erp_oc_lineas", "insert", {}, {
    id: uid(), oc_id: id, producto_id: null, cantidad: 1, precio: subtotal, descuento_pct: 0,
    subtotal, recibido: 0, plazo: "SERVICIOS", orden: 0,
  });
  return { ok: true, id, numero, total, periodo: ymd, subtotal, iva, nota, ...sums };
});
