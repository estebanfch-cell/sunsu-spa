// DEV-31c (Emilia t910u/t911u) · Roles (admin) rediseñado: el PRE-ROL de cada empleada siempre existe y se recalcula solo.
//  - rol_pre_auto: crea el borrador del mes si no existe y lo recalcula con lo último (marcas, comisiones, anticipos, multas…).
//    Si ya está aprobado devuelve ese rol tal cual. Las empleadas no ven nada hasta que se aprueba (rol_get/roles_lista lo exigen).
//  - rol_pre_todos: lo mismo para todas las empleadas activas (PDF de Contabilidad de todas).
//  - rol_contab: estado opcional ante Contabilidad (sin enviar / enviado / ok). No envía nada por sí mismo.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { ecuadorParts, n, round2, s, type Row } from "./domain.ts";
import { esAdmin } from "./permisos.ts";
import { clavePeriodo, etiquetaPeriodo } from "./roles_api.ts";
import { aplicarAjustes, armarEntrada, periodoDe, vista } from "./roles_crear_api.ts";
import { empleadasDelRol } from "./rol_config_api.ts";

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

extend("rol_pre_todos", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración ve el pre-rol." };
  const items: Row[] = [];
  const errores: Row[] = [];
  for (const e of await empleadasDelRol(ctx)) {
    const r = await asegurarPreRol(ctx, ses, e.nombre);
    if (r.error) errores.push({ persona: e.nombre, error: r.error });
    else items.push(r);
  }
  return { ok: true, items, errores, hoy: ecuadorParts(ctx.now).ymd };
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

