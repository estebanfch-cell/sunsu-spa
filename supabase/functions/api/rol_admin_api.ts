// DEV-31c (Emilia t910u/t911u) · Roles (admin) rediseñado: el PRE-ROL de cada empleada siempre existe y se recalcula solo.
//  - rol_pre_auto: crea el borrador del mes si no existe y lo recalcula con lo último (marcas, comisiones, anticipos, multas…).
//    Si ya está aprobado devuelve ese rol tal cual. Las empleadas no ven nada hasta que se aprueba (rol_get/roles_lista lo exigen).
//  - rol_pre_leer: lee el último snapshot guardado, sin recalcular (para abrir el Rol al instante).
//  - El pre-rol se mantiene precalculado: programarRefrescoPreRol corre en fondo al guardar un ticket o una marca.
//  - rol_pre_todos: lo mismo para todas las empleadas activas (PDF de Contabilidad de todas).
//    Con recargar:false y periodo, solo lee los roles ya guardados (borradores y aprobados)
//    de ese mes, sin recalcular ni escribir. Así el «PDF de todas» es rápido y no se bloquea en el celular.
//  - rol_contab: estado opcional ante Contabilidad (sin enviar / enviado / ok). No envía nada por sí mismo.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { ecuadorParts, n, round2, s, type Row } from "./domain.ts";
import { esAdmin } from "./permisos.ts";
import { clavePeriodo, etiquetaPeriodo } from "./roles_api.ts";
import { aplicarAjustes, armarEntrada, periodoDe, vista } from "./roles_crear_api.ts";
import { empleadasDelRol } from "./rol_config_api.ts";
import { firmaDeRol, vistaFirma } from "./rol_descuentos_api.ts";
import { mismaPersonaRol } from "./roles_api.ts";

function esTest(ses: Ses): boolean { return !!ses.prueba; }

async function logRol(ctx: Ctx, ses: Ses, rolId: string, accion: string, antes: Row | null, despues: Row | null, motivo = "") {
  await ctx.db.write(actorOf(ses), "beta_roles_log", "insert", {}, {
    id: crypto.randomUUID(), rol_id: rolId, accion, actor: actorOf(ses),
    antes, despues, motivo: motivo || null, created_at: ctx.now.toISOString(),
  }).catch(() => null);
  await logAccion(ctx.db, actorOf(ses), "ROL " + accion.toUpperCase(), (despues && s(despues.persona) || "") + " " + (despues && s(despues.periodo) || rolId) + (motivo ? " · " + motivo : "")).catch(() => null);
}

function estable(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(estable).join(",") + "]";
  if (v && typeof v === "object") {
    const o = v as Row;
    return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + estable(o[k])).join(",") + "}";
  }
  return JSON.stringify(v ?? null);
}

/** Crea o recalcula el borrador del mes en curso de una empleada. Un rol ya aprobado no se toca. */
export async function asegurarPreRol(ctx: Ctx, ses: Ses, nombre: string): Promise<Row> {
  const hoy = ecuadorParts(ctx.now).ymd;
  const anio = Number(hoy.slice(0, 4)), mes = Number(hoy.slice(5, 7));
  const periodo = periodoDe(anio, mes);
  const origin = esTest(ses) ? "test" : "beta";
  const armado = await armarEntrada(ctx, nombre, periodo, anio, mes, { origin });
  if (armado.error) return armado;
  const rows = await ctx.db.all("beta_roles").catch(() => [] as Row[]);
  const existing = rows.find((r) => s(r.persona) === s(armado.persona) && clavePeriodo(r.periodo) === clavePeriodo(armado.periodo) && s(r.origin || "beta") === origin);

  try {
  const extra = { hoy, actualizado: ctx.now.toISOString(), etiqueta: etiquetaPeriodo(periodo) };
  if (existing && s(existing.estado) === "aprobado") {
    const snap = (existing.snapshot && typeof existing.snapshot === "object") ? existing.snapshot as Row : {};
    const firmas = await ctx.db.all("beta_rol_firmas").catch(() => [] as Row[]);
    return { ...vista(existing, snap, true), ...extra, firmado: firmas.some((f) => s(f.rol_id) === s(existing.id)), nuevo: false };
  }
  let snap = armado.snap as Row;
  if (existing) {
    // Los ajustes manuales que ya tenía el borrador se conservan sobre el cálculo nuevo.
    const aj = existing.ajustes && typeof existing.ajustes === "object" && Object.keys(existing.ajustes as Row).length ? existing.ajustes as Row : null;
    if (aj) snap = aplicarAjustes(snap, aj);
    const antes = (existing.snapshot && typeof existing.snapshot === "object") ? existing.snapshot as Row : null;
    let saved = existing;
    if (!antes || estable(antes) !== estable(snap) || s(existing.estado) !== "borrador") {
      await ctx.db.write(actorOf(ses), "beta_roles", "update", { id: existing.id }, {
        snapshot: snap, estado: "borrador", motivo_rechazo: null, updated_at: ctx.now.toISOString(), cedula: snap.cedula, cargo: snap.cargo,
      });
      saved = { ...existing, snapshot: snap, estado: "borrador", motivo_rechazo: null };
      if (!antes || round2(n(antes.totalRecibir)) !== round2(n(snap.totalRecibir))) {
        await logRol(ctx, ses, s(existing.id), "recalculo_auto", antes, saved, "pre-rol actualizado");
      }
    }
    return { ...vista(saved, snap, true), ...extra, firmado: false, nuevo: false };
  }
  const id = crypto.randomUUID();
  const row = {
    id, persona: armado.persona, cedula: snap.cedula, cargo: snap.cargo,
    periodo: armado.periodo, anio: armado.anio, mes: armado.mes,
    ciclo_desde: armado.cicloDesde, ciclo_hasta: armado.cicloHasta,
    estado: "borrador", snapshot: snap, origin, creado_por: actorOf(ses),
    created_at: ctx.now.toISOString(), updated_at: ctx.now.toISOString(),
  };
  await ctx.db.write(actorOf(ses), "beta_roles", "insert", {}, row);
  await logRol(ctx, ses, id, "crear", null, row, "pre-rol automático");
  return { ...vista(row, snap, true), ...extra, firmado: false, nuevo: true };

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const snap = armado.snap as Row;
    return {
      ...vista({
        id: existing && s(existing.id) || "", persona: armado.persona, cedula: snap.cedula, cargo: snap.cargo,
        periodo: armado.periodo, anio: armado.anio, mes: armado.mes, estado: "borrador",
      }, snap, true),
      hoy, actualizado: ctx.now.toISOString(), etiqueta: etiquetaPeriodo(periodo),
      firmado: false, nuevo: false,
      aviso: "Se calculó el pre-rol, pero no se pudo guardar el borrador" + (msg ? ": " + msg : "."),
    };
  }
}


extend("rol_pre_auto", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración ve el pre-rol." };
  const nombre = s(p.persona || p.nombre);
  if (!nombre) return { error: "Elige a la empleada." };
  try {
    return await asegurarPreRol(ctx, ses, nombre);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: "No se pudo calcular el pre-rol de " + nombre + (msg ? ": " + msg : ".") };
  }
});

function mismaEmpleadaRol(a: string, b: string): boolean {
  const x = s(a).trim(), y = s(b).trim();
  if (!x || !y) return false;
  if (x === y) return true;
  return mismaPersonaRol(x, y);
}

/** Nombres de administración que nunca van en el rol ni en el PDF de todas. */
export function esAdminNombreRol(nombre: unknown): boolean {
  const k = s(nombre).trim().toLowerCase();
  if (!k) return false;
  if (k === "efch" || k === "emi" || k === "e.m.i.") return true;
  if (/^efch\b/.test(k) || /^emi\b/.test(k)) return true;
  if (/ferlito/.test(k)) return true;
  return false;
}

/** Recalcula pre-roles en segundo plano (no bloquea tickets ni marcas). */
export function programarRefrescoPreRol(ctx: Ctx, ses: Ses, nombres?: string[]): void {
  try {
    const nombreDb = (ctx.db as { constructor?: { name?: string } }).constructor?.name || "";
    // En los tests (MemoryDb) no disparamos recálculos en fondo: pelearían con el caso y dejarían promesas abiertas.
    if (nombreDb === "MemoryDb" && !(ses as { forzarPreRol?: boolean }).forzarPreRol) return;
  } catch { /* sigue en producción */ }
  const run = async () => {
    try {
      const lista = (nombres && nombres.length)
        ? nombres.filter((n) => n && !esAdminNombreRol(n))
        : (await empleadasDelRol(ctx)).map((e) => e.nombre).filter((n) => !esAdminNombreRol(n));
      for (const n of lista) {
        await asegurarPreRol(ctx, ses, n).catch(() => null);
      }
    } catch {
      /* el ticket o la marca ya quedaron; el pre-rol se actualizará al abrir Roles o en el siguiente ciclo */
    }
  };
  try {
    const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") { er.waitUntil(run()); return; }
  } catch { /* */ }
  void run();
}

extend("rol_pre_leer", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración ve el pre-rol." };
  const nombre = s(p.persona || p.nombre);
  if (!nombre) return { error: "Elige a la empleada." };
  if (esAdminNombreRol(nombre)) return { error: "EFCH y Emi son administradoras: no tienen rol de pagos." };
  const hoy = ecuadorParts(ctx.now).ymd;
  const actual = periodoDe(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)));
  const periodo = clavePeriodo(s(p.periodo)) || actual;
  const origin = esTest(ses) ? "test" : "beta";
  const row = (await ctx.db.all("beta_roles").catch(() => [] as Row[])).find((r) =>
    clavePeriodo(r.periodo) === periodo
    && mismaEmpleadaRol(s(r.persona), nombre)
    && (s(r.origin || "beta") === "test") === (origin === "test")
  );
  if (!row) return { ok: true, vacio: true, persona: nombre, periodo, etiqueta: etiquetaPeriodo(periodo) };
  const snap = (row.snapshot && typeof row.snapshot === "object") ? row.snapshot as Row : {};
  const firma = vistaFirma(await firmaDeRol(ctx, s(row.id)), true);
  return { ...vista(row, snap, true), firma, deCache: true, vacio: false };
});

extend("rol_pre_refrescar_todas", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración actualiza el pre-rol de todas." };
  const emps = (await empleadasDelRol(ctx)).filter((e) => !esAdminNombreRol(e.nombre));
  const items: Row[] = [];
  const errores: Row[] = [];
  for (const e of emps) {
    const r = await asegurarPreRol(ctx, ses, e.nombre);
    if (r.error) errores.push({ persona: e.nombre, error: r.error });
    else items.push(r);
  }
  return { ok: true, items, errores, hoy: ecuadorParts(ctx.now).ymd };
});

extend("rol_pre_todos", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración ve el pre-rol." };
  const hoy = ecuadorParts(ctx.now).ymd;
  const actual = periodoDe(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)));
  const periodo = clavePeriodo(s(p.periodo)) || actual;
  const recargar = p.recargar !== false && p.recalcular !== false;
  const emps = (await empleadasDelRol(ctx)).filter((e) => !esAdminNombreRol(e.nombre));
  const items: Row[] = [];
  const errores: Row[] = [];
  if (!recargar) {
    const origin = esTest(ses) ? "test" : "beta";
    const roles = (await ctx.db.all("beta_roles").catch(() => [] as Row[])).filter((r) =>
      clavePeriodo(r.periodo) === periodo && (s(r.origin || "beta") === "test") === (origin === "test") && !esAdminNombreRol(r.persona)
    );
    for (const e of emps) {
      const row = roles.find((r) => mismaEmpleadaRol(s(r.persona), e.nombre));
      if (!row) { errores.push({ persona: e.nombre, error: "Todavía no hay un rol guardado de este período." }); continue; }
      const snap = (row.snapshot && typeof row.snapshot === "object") ? row.snapshot as Row : {};
      const firma = vistaFirma(await firmaDeRol(ctx, s(row.id)), true);
      items.push({ ...vista(row, snap, true), firma });
    }
    return { ok: true, items, errores, periodo, etiqueta: etiquetaPeriodo(periodo), hoy };
  }
  for (const e of emps) {
    const r = await asegurarPreRol(ctx, ses, e.nombre);
    if (r.error) errores.push({ persona: e.nombre, error: r.error });
    else items.push(r);
  }
  return { ok: true, items, errores, periodo: actual, etiqueta: etiquetaPeriodo(actual), hoy };
});

const ESTADOS_CONTAB = new Set(["", "enviado", "ok"]);
extend("rol_contab", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración marca el estado ante Contabilidad." };
  const estado = s(p.estado);
  if (!ESTADOS_CONTAB.has(estado)) return { error: "Estado no válido." };
  const rows = await ctx.db.all("beta_roles").catch(() => [] as Row[]);
  const row = rows.find((r) => s(r.id) === s(p.id));
  if (!row) return { error: "No encuentro ese rol." };
  if (esTest(ses) && s(row.origin) !== "test") return { error: "La simulación no cambia un rol real." };
  const now = ctx.now.toISOString();
  const cambio = { contab_estado: estado || null, contab_por: estado ? actorOf(ses) : null, contab_at: estado ? now : null, updated_at: now };
  await ctx.db.write(actorOf(ses), "beta_roles", "update", { id: row.id }, cambio);
  const saved: Row = { ...row, ...cambio };
  await logRol(ctx, ses, s(row.id), "contabilidad", { contab_estado: s(row.contab_estado) }, { persona: row.persona, periodo: row.periodo, contab_estado: estado }, estado === "ok" ? "Ok de contabilidad" : estado === "enviado" ? "Enviado a contabilidad" : "Sin enviar");
  const snap = (saved.snapshot && typeof saved.snapshot === "object") ? saved.snapshot as Row : {};
  return vista(saved, snap, true);
});

