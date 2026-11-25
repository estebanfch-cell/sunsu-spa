// DEV-31c (Emilia t911u) · Planillas del IESS: importar el «Detalle de la planilla» mensual (XLS) y compararlo con el rol.
//  - Solo administración. Lo importado queda en beta_iess_planilla (cada importación es un lote; reimportar un mes deja
//    el lote anterior como no vigente, no se borra nada).
//  - Compara, por empleada: afiliación, sueldo aportable (suma de las filas de la planilla), aporte individual y patronal
//    contra el rol de la app (rol aprobado, histórico pagado o, para el mes en curso, el pre-rol). Solo avisa: no cambia datos.
//  - Quien consta como gerente/administrador sin relación de dependencia (R. Trabajo 109) o es administradora de la app
//    se muestra aparte y no entra en la comparación.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, adminesDe, logAccion } from "./lib.ts";
import { cedulasCompatibles, digitosCed, ecuadorParts, n, normNombre, round2, s, type Row } from "./domain.ts";
import { esAdmin } from "./permisos.ts";
import { clavePeriodo } from "./roles_api.ts";
import { armarEntrada, periodoDe } from "./roles_crear_api.ts";
import { empleadasDelRol } from "./rol_config_api.ts";

export type FilaIess = {
  periodo: string; estado: string; subTipo: string; cedula: string; nombre: string; rTrabajo: string; novedad: string;
  sueldo: number; dias: number; patronal: number; individual: number; aporteAdicional: number; ccc: number; totalAporte: number;
};

function num(v: unknown): number {
  const t = s(v).replace(/[\s$]/g, "");
  if (!t) return 0;
  // «1,223.30» (miles con coma, decimales con punto) o «1223,30».
  const x = /,\d{1,2}$/.test(t) && !/\.\d/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const f = Number(x);
  return Number.isFinite(f) ? f : 0;
}

/** Normaliza las filas del XLS del IESS (objetos con las columnas por nombre de encabezado). Ignora totales y anuladas. */
export function normalizarFilasIess(raw: Row[]): { filas: FilaIess[]; anuladas: number } {
  const filas: FilaIess[] = [];
  let anuladas = 0;
  const get = (r: Row, ...ks: string[]) => {
    for (const k of Object.keys(r)) {
      const nk = normNombre(k).replace(/[^a-z0-9% ]/g, "");
      if (ks.some((x) => nk === x)) return r[k];
    }
    return "";
  };
  for (const r of raw) {
    const periodo = s(get(r, "periodo")).trim();
    const cedula = digitosCed(get(r, "cedula"));
    if (!/^\d{4}-\d{2}$/.test(periodo) || !cedula) continue;
    const estado = s(get(r, "estado"));
    if (/anulad/i.test(estado)) { anuladas++; continue; }
    filas.push({
      periodo, estado, subTipo: s(get(r, "sub tipo")), cedula, nombre: s(get(r, "nombre")).trim(),
      rTrabajo: s(get(r, "r. trabajo", "r trabajo")).trim(), novedad: s(get(r, "novedad")).trim(),
      sueldo: round2(num(get(r, "sueldo"))), dias: num(get(r, "dias")), patronal: round2(num(get(r, "patronal"))),
      individual: round2(num(get(r, "individual"))), aporteAdicional: round2(num(get(r, "aporte adicional"))),
      ccc: round2(num(get(r, "valor ccc")) || num(get(r, "ccc valor"))), totalAporte: round2(num(get(r, "total aporte"))),
    });
  }
  return { filas, anuladas };
}

function esGerenteIess(rTrabajo: string): boolean { return /^\s*109\b|gerente|administrador sin relaci/i.test(rTrabajo); }

function tokens(v: unknown): string[] { return normNombre(v).split(" ").filter((t) => t.length > 1); }
function nombreCompatible(app: string, iess: string): boolean {
  const a = tokens(app), b = new Set(tokens(iess));
  return a.length > 0 && a.every((t) => b.has(t));
}

type Agg = { cedula: string; nombre: string; rTrabajo: string; sueldo: number; patronal: number; individual: number; ccc: number; filas: number; gerente: boolean };
function agruparPorCedula(filas: Row[]): Agg[] {
  const m = new Map<string, Agg>();
  for (const f of filas) {
    const k = digitosCed(f.cedula);
    const g = m.get(k) || { cedula: k, nombre: s(f.nombre), rTrabajo: s(f.r_trabajo), sueldo: 0, patronal: 0, individual: 0, ccc: 0, filas: 0, gerente: false };
    g.sueldo += n(f.sueldo); g.patronal += n(f.patronal); g.individual += n(f.individual); g.ccc += n(f.ccc); g.filas++;
    if (esGerenteIess(s(f.r_trabajo))) g.gerente = true;
    m.set(k, g);
  }
  return [...m.values()].map((g) => ({ ...g, sueldo: round2(g.sueldo), patronal: round2(g.patronal), individual: round2(g.individual), ccc: round2(g.ccc) }));
}

async function vigentes(ctx: Ctx, periodo: string): Promise<Row[]> {
  const rows = await ctx.db.all("beta_iess_planilla").catch(() => [] as Row[]);
  return rows.filter((r) => s(r.periodo) === periodo && r.vigente !== false);
}

extend("iess_importar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración importa la planilla del IESS." };
  const raw = Array.isArray(p.filas) ? p.filas as Row[] : [];
  if (!raw.length) return { error: "El archivo no trae filas." };
  if (raw.length > 500) return { error: "El archivo trae demasiadas filas." };
  const { filas, anuladas } = normalizarFilasIess(raw);
  if (!filas.length) return { error: "No encuentro filas de planilla (Periodo, Cédula, Sueldo…). ¿Es el «Detalle de la planilla» del IESS?" };
  const periodos = [...new Set(filas.map((f) => f.periodo))];
  const lote = crypto.randomUUID();
  const now = ctx.now.toISOString();
  const origin = ses.prueba ? "test" : "beta";
  const previas = (await ctx.db.all("beta_iess_planilla").catch(() => [] as Row[])).filter((r) => periodos.includes(s(r.periodo)) && r.vigente !== false && s(r.origin || "beta") === origin);
  for (const r of previas) await ctx.db.write(actorOf(ses), "beta_iess_planilla", "update", { id: r.id }, { vigente: false });
  for (const f of filas) {
    await ctx.db.write(actorOf(ses), "beta_iess_planilla", "insert", {}, {
      id: crypto.randomUUID(), lote, periodo: f.periodo, estado: f.estado, sub_tipo: f.subTipo, cedula: f.cedula, nombre: f.nombre,
      r_trabajo: f.rTrabajo, novedad: f.novedad, sueldo: f.sueldo, dias: f.dias, patronal: f.patronal, individual: f.individual,
      aporte_adicional: f.aporteAdicional, ccc: f.ccc, total_aporte: f.totalAporte, archivo: s(p.archivo).slice(0, 200) || null,
      vigente: true, importado_por: actorOf(ses), origin, created_at: now,
    });
  }
  await logAccion(ctx.db, actorOf(ses), "IESS IMPORTAR PLANILLA", `${periodos.join(", ")} · ${filas.length} filas${previas.length ? " · reemplaza " + previas.length : ""}`).catch(() => null);
  return { ok: true, lote, periodos, filas: filas.length, anuladas, reemplazadas: previas.length };
});

extend("iess_lista", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración ve las planillas del IESS." };
  const origin = ses.prueba ? "test" : "beta";
  const rows = (await ctx.db.all("beta_iess_planilla").catch(() => [] as Row[])).filter((r) => r.vigente !== false && s(r.origin || "beta") === origin);
  const por = new Map<string, Row>();
  for (const r of rows) {
    const k = s(r.periodo);
    const g = por.get(k) || { periodo: k, etiqueta: clavePeriodo(periodoDe(Number(k.slice(0, 4)), Number(k.slice(5, 7)))).replace("_", " "), filas: 0, archivo: s(r.archivo), importadoPor: s(r.importado_por), importadoAt: r.created_at };
    g.filas = n(g.filas) + 1;
    por.set(k, g);
  }
  return { ok: true, items: [...por.values()].sort((a, b) => s(b.periodo).localeCompare(s(a.periodo))) };
});

/** Lo que dice el rol de la app para esa persona y mes: aprobado › histórico pagado › pre-rol (mes en curso). */
async function rolDeLaApp(ctx: Ctx, e: { nombre: string; cedula: string }, periodo: string, anio: number, mes: number): Promise<{ fuente: string; aportable: number; iess: number; patronal: number } | null> {
  const clave = clavePeriodo(periodo);
  const betas = (await ctx.db.all("beta_roles").catch(() => [] as Row[])).filter((r) => s(r.origin) !== "test" && clavePeriodo(r.periodo) === clave && s(r.estado) === "aprobado");
  const mio = betas.find((r) => s(r.persona) === e.nombre);
  if (mio && mio.snapshot && typeof mio.snapshot === "object") {
    const d = mio.snapshot as Row;
    return { fuente: "rol aprobado", aportable: round2(n(d.ingresoAportable)), iess: round2(n(d.iess)), patronal: round2(n(d.iessPatronal)) };
  }
  const det = (await ctx.db.all("beta_rol_hist_detalle").catch(() => [] as Row[])).find((x) => clavePeriodo(x.periodo) === clave && cedulasCompatibles(x.cedula, e.cedula));
  if (det && det.detalle && typeof det.detalle === "object") {
    const d = det.detalle as Row;
    const ap = round2(n(d.ingresoAportable));
    return { fuente: "rol pagado (histórico)", aportable: ap, iess: round2(n(d.iess)), patronal: round2(ap * 0.1115) };
  }
  const hoy = ecuadorParts(ctx.now).ymd;
  if (Number(hoy.slice(0, 4)) === anio && Number(hoy.slice(5, 7)) === mes) {
    const a = await armarEntrada(ctx, e.nombre, periodo, anio, mes);
    if (!a.error) {
      const d = a.snap as Row;
      return { fuente: "pre-rol de hoy", aportable: round2(n(d.ingresoAportable)), iess: round2(n(d.iess)), patronal: round2(n(d.iessPatronal)) };
    }
  }
  return null;
}

extend("iess_comparar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración compara la planilla del IESS." };
  const periodo = s(p.periodo);
  if (!/^\d{4}-\d{2}$/.test(periodo)) return { error: "Elige el mes de la planilla." };
  const anio = Number(periodo.slice(0, 4)), mes = Number(periodo.slice(5, 7));
  const origin = ses.prueba ? "test" : "beta";
  const filasIess = (await vigentes(ctx, periodo)).filter((r) => s(r.origin || "beta") === origin);
  if (!filasIess.length) return { error: "Todavía no hay una planilla importada de ese mes." };
  const aggs = agruparPorCedula(filasIess);
  const usada = new Set<string>();
  const esAdminApp = await adminesDe(ctx.db);
  const rrhh = await ctx.db.all("rrhh_empleadas").catch(() => [] as Row[]);
  const completoDe = (nombre: string) => s(rrhh.find((r) => s(r.nombre_app) === nombre)?.apellidos_y_nombres) || nombre;
  const emps = (await empleadasDelRol(ctx)).filter((e) => !e.ingreso || e.ingreso <= `${periodo}-31`);
  const items: Row[] = [];
  const TOL = 0.05;
  for (const e of emps) {
    let a = aggs.find((g) => !g.gerente && cedulasCompatibles(g.cedula, e.cedula));
    let por = "cédula";
    if (!a) { a = aggs.find((g) => !g.gerente && !usada.has(g.cedula) && nombreCompatible(completoDe(e.nombre), g.nombre)); por = "nombre"; }
    const app = await rolDeLaApp(ctx, e, periodoDe(anio, mes), anio, mes);
    const avisos: string[] = [];
    let estado = "ok";
    if (a) usada.add(a.cedula);
    if (a && por === "nombre") { estado = "revisar"; avisos.push(`La cédula no coincide: en la app ${e.cedula || "(vacía)"}, en el IESS ${a.cedula}. Corrígela en Configuración de rol.`); }
    if (!a && e.afiliada) { estado = "revisar"; avisos.push("Está afiliada en la app pero no consta en la planilla de ese mes."); }
    if (a && !e.afiliada) { estado = "revisar"; avisos.push("Consta en el IESS pero en la app figura sin afiliación."); }
    if (!a && !e.afiliada) avisos.push("Sin afiliación (correcto: no está en la planilla).");
    const sueldoIess = a ? a.sueldo : 0;
    const dif = app && a ? round2(sueldoIess - app.aportable) : null;
    if (a && !app) { estado = estado === "ok" ? "sin_rol" : estado; avisos.push("No encuentro el rol de ese mes en la app para comparar."); }
    if (dif != null && Math.abs(dif) > TOL) { estado = "revisar"; avisos.push(`El IESS tiene ${dif > 0 ? "más" : "menos"} sueldo aportable que el rol: ${dif > 0 ? "+" : "−"}$${Math.abs(dif).toFixed(2)}.`); }
    const difInd = app && a ? round2(a.individual - app.iess) : null;
    const difPat = app && a ? round2(a.patronal - app.patronal) : null;
    items.push({
      persona: e.nombre, afiliadaApp: e.afiliada, cedulaApp: e.cedula, cedulaIess: a ? a.cedula : "", nombreIess: a ? a.nombre : "", coincidePor: a ? por : "",
      enPlanilla: !!a, aportableIess: a ? sueldoIess : null, aportableApp: app ? app.aportable : null, dif,
      individualIess: a ? a.individual : null, individualApp: app ? app.iess : null, difIndividual: difInd,
      patronalIess: a ? a.patronal : null, patronalApp: app ? app.patronal : null, difPatronal: difPat,
      cccIess: a ? a.ccc : null, fuenteApp: app ? app.fuente : "", estado, avisos,
    });
  }
  const otros: Row[] = [];
  for (const g of aggs) {
    if (usada.has(g.cedula)) continue;
    const admin = g.gerente || esAdminApp(g.nombre);
    otros.push({
      cedulaIess: g.cedula, nombreIess: g.nombre, rTrabajo: g.rTrabajo, aportableIess: g.sueldo, individualIess: g.individual, patronalIess: g.patronal,
      estado: admin ? "admin" : "sin_empleada",
      avisos: [admin ? "Administradora/gerente: está en el IESS pero no tiene rol de pagos (fuera de la comparación)." : "Consta en la planilla pero no es empleada activa en la app."],
    });
  }
  const suma = (k: string) => round2(items.reduce((a, x) => a + n(x[k]), 0));
  const iessEmp = aggs.filter((g) => usada.has(g.cedula));
  return {
    ok: true, periodo, etiqueta: clavePeriodo(periodoDe(anio, mes)).replace("_", " "), items, otros,
    totales: {
      aportableIess: round2(iessEmp.reduce((a, g) => a + g.sueldo, 0)), aportableApp: suma("aportableApp"),
      individualIess: round2(iessEmp.reduce((a, g) => a + g.individual, 0)), individualApp: suma("individualApp"),
      patronalIess: round2(iessEmp.reduce((a, g) => a + g.patronal, 0)), patronalApp: suma("patronalApp"),
      cccIess: round2(aggs.reduce((a, g) => a + g.ccc, 0)),
      planillaCompleta: { sueldo: round2(aggs.reduce((a, g) => a + g.sueldo, 0)), patronal: round2(aggs.reduce((a, g) => a + g.patronal, 0)), individual: round2(aggs.reduce((a, g) => a + g.individual, 0)) },
    },
    nota: "La app compara el sueldo aportable (sueldo + bono + comisiones + horas extra) con la suma de las filas de la planilla del IESS (normal + ajuste INS). La planilla incluye la contribución CCC (1 % del aportable). En la app la CCC suma al costo empresa (solo administración) y no se descuenta a la empleada.",
  };
});
