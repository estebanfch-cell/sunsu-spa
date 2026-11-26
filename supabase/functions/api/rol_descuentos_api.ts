// DEV-31 (Emilia t900u) · Rol de pagos: anticipos y préstamos internos, pre-rol de todas al día de hoy,
// firma con el dedo de la empleada y resumen del período.
//  - Anticipo: se descuenta COMPLETO en el rol del mes siguiente (o el mes que elija administración).
//  - Préstamo: una cuota por rol desde el mes de la 1ª cuota. Se puede armar por número de cuotas
//    (total/n, última ajusta centavos) o por monto de cuota (residuo: cuota extra o sumar al último).
//    "Cuotas ya pagadas" sirve para un préstamo a mitad de camino. Saldo = monto − cuotas pagadas
//    (marcadas o de roles ya aprobados). La línea del rol muestra el motivo, p.ej.
//    "Préstamo — Tratamiento Peeling ($101.50) — cuota 2/5". Sirve también sin IESS.
//  - Todo cambio (crear, editar, anular) queda en beta_rol_descuentos_log y en la bitácora.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { ecuadorParts, n, normNombre, round2, s, type Row } from "./domain.ts";
import { esAdmin, esPropio } from "./permisos.ts";
import { clavePeriodo, etiquetaPeriodo, mismaPersonaRol } from "./roles_api.ts";

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

export function periodoKey(anio: number, mes: number): string { return MESES[mes - 1] + "_" + anio; }
/** "NOVIEMBRE_2026" → { anio: 2026, mes: 11 } (o null). */
export function partesPeriodo(clave: string): { anio: number; mes: number } | null {
  const m = clavePeriodo(clave).match(/^([A-Z]+)_(\d{4})$/);
  if (!m) return null;
  const i = MESES.indexOf(m[1]);
  return i < 0 ? null : { anio: Number(m[2]), mes: i + 1 };
}
export function sumarMeses(clave: string, k: number): string {
  const p = partesPeriodo(clave);
  if (!p) return clave;
  const t = p.anio * 12 + (p.mes - 1) + k;
  return periodoKey(Math.floor(t / 12), (t % 12) + 1);
}
function ordenPeriodo(clave: string): number { const p = partesPeriodo(clave); return p ? p.anio * 12 + p.mes : 0; }
/** El rol del mes siguiente a una fecha AAAA-MM-DD. */
export function periodoSiguiente(fecha: string): string {
  const y = Number(fecha.slice(0, 4)), m = Number(fecha.slice(5, 7));
  return sumarMeses(periodoKey(y, m), 1);
}

/** Reparto del monto del préstamo.
 *  modo numero_cuotas (defecto): total/n, la última ajusta centavos.
 *  modo monto_cuota: n = ceil(total/cuota); resto_modo "cuota_extra" deja el residuo
 *  como cuota final; "sumar_ultimo" lo agrega a la última cuota llena
 *  (p.ej. 101.50 / 20 → 20, 20, 20, 20, 21.50). */
export function planMontosPrestamo(opts: {
  monto?: unknown;
  modo?: unknown;
  cuotas?: unknown;
  montoCuota?: unknown;
  restoModo?: unknown;
}): number[] {
  const monto = round2(n(opts.monto));
  if (!(monto > 0)) return [];
  const modo = s(opts.modo) === "monto_cuota" ? "monto_cuota" : "numero_cuotas";
  if (modo !== "monto_cuota") {
    const cuotas = Math.max(1, Math.min(60, Math.round(n(opts.cuotas) || 1)));
    const base = Math.floor((monto / cuotas) * 100) / 100;
    const out: number[] = [];
    let acum = 0;
    for (let i = 0; i < cuotas; i++) {
      const v = i === cuotas - 1 ? round2(monto - acum) : base;
      acum = round2(acum + v);
      out.push(v);
    }
    return out;
  }
  const cuota = round2(n(opts.montoCuota));
  if (!(cuota > 0)) return [];
  if (cuota >= monto) return [monto];
  const cuotaC = Math.round(cuota * 100);
  const montoC = Math.round(monto * 100);
  const llenas = Math.floor(montoC / cuotaC);
  const remC = montoC - llenas * cuotaC;
  const rem = remC / 100;
  if (remC <= 0) return Array.from({ length: llenas }, () => cuota);
  const resto = s(opts.restoModo) === "sumar_ultimo" ? "sumar_ultimo" : "cuota_extra";
  if (resto === "sumar_ultimo") {
    if (llenas < 1) return [monto];
    if (llenas > 60) return [];
    return [...Array.from({ length: llenas - 1 }, () => cuota), round2(cuota + rem)];
  }
  if (llenas + 1 > 60) return [];
  return [...Array.from({ length: llenas }, () => cuota), rem];
}

/** Línea que se ve en el rol, p.ej. "Préstamo — Tratamiento Peeling ($101.50) — cuota 2/5". */
export function etiquetaCuotaPrestamo(d: Row, c: { n: number; monto: number }, total: number): string {
  const mot = s(d.motivo).trim();
  const tot = round2(n(d.monto)).toFixed(2);
  const tail = `cuota ${c.n}/${total}`;
  if (mot) return `Préstamo — ${mot} ($${tot}) — ${tail}`;
  return `Préstamo ($${tot}) — ${tail}`;
}

/** Calendario de descuentos: una fila por rol. Anticipo = 1 cuota; préstamo = N cuotas según planMontosPrestamo. */
export function planDe(d: Row): { periodo: string; n: number; monto: number }[] {
  const monto = round2(n(d.monto));
  const inicio = clavePeriodo(d.primer_periodo ?? d.primerPeriodo);
  if (!(monto > 0) || !partesPeriodo(inicio)) return [];
  if (s(d.tipo) !== "prestamo") return [{ periodo: inicio, n: 1, monto }];
  const montos = planMontosPrestamo({
    monto,
    modo: d.modo,
    cuotas: d.cuotas,
    montoCuota: d.monto_cuota ?? d.montoCuota,
    restoModo: d.resto_modo ?? d.restoModo,
  });
  return montos.map((v, i) => ({ periodo: sumarMeses(inicio, i), n: i + 1, monto: v }));
}

function mismaPersona(a: string, b: string): boolean {
  const x = normNombre(a), y = normNombre(b);
  return !!x && !!y && (x === y || mismaPersonaRol(a, b));
}

async function descuentosDe(ctx: Ctx): Promise<Row[]> {
  return await ctx.db.all("beta_rol_descuentos").catch(() => [] as Row[]);
}
async function rolesAprobados(ctx: Ctx): Promise<Row[]> {
  return (await ctx.db.all("beta_roles").catch(() => [] as Row[])).filter((r) => s(r.estado) === "aprobado");
}

/** Vista de un anticipo/préstamo con su calendario y saldo (cuotas ya pagadas + roles aprobados). */
export function vistaDescuento(d: Row, aprobados: Row[]): Row {
  const pagadasInit = Math.max(0, Math.round(n(d.cuotas_pagadas ?? d.cuotasPagadas) || 0));
  const plan = planDe(d).map((c) => {
    const pagadaRol = aprobados.some((r) => clavePeriodo(r.periodo) === c.periodo && mismaPersona(s(r.persona), s(d.persona)) && (s(r.origin) === "test") === (s(d.origin) === "test"));
    const pagada = c.n <= pagadasInit || pagadaRol;
    return { ...c, etiqueta: etiquetaPeriodo(c.periodo), pagada, pagadaRol };
  });
  const anulado = s(d.estado) === "anulado";
  const pagado = round2(plan.filter((c) => c.pagada).reduce((a, c) => a + c.monto, 0));
  const saldo = anulado ? 0 : round2(n(d.monto) - pagado);
  return {
    id: d.id, persona: d.persona, tipo: d.tipo, monto: round2(n(d.monto)), cuotas: s(d.tipo) === "prestamo" ? plan.length : 1,
    cuota: plan.length ? plan[0].monto : 0, fecha: s(d.fecha).slice(0, 10), primerPeriodo: clavePeriodo(d.primer_periodo),
    primerEtiqueta: etiquetaPeriodo(clavePeriodo(d.primer_periodo)), motivo: s(d.motivo), estado: s(d.estado) || "activo",
    modo: s(d.modo) === "monto_cuota" ? "monto_cuota" : "numero_cuotas",
    montoCuota: d.monto_cuota != null ? n(d.monto_cuota) : (d.montoCuota != null ? n(d.montoCuota) : null),
    restoModo: s(d.resto_modo ?? d.restoModo) === "sumar_ultimo" ? "sumar_ultimo" : "cuota_extra",
    cuotasPagadas: pagadasInit,
    plan, pagado, saldo, terminado: !anulado && saldo <= 0.004, prueba: s(d.origin) === "test",
    creadoPor: s(d.creado_por), createdAt: d.created_at, anuladoPor: s(d.anulado_por), motivoAnulacion: s(d.motivo_anulacion),
  };
}

/** Lo que se descuenta en el rol de «periodo» a «persona» (solo anticipos/préstamos activos). */
export async function descuentosDelPeriodo(ctx: Ctx, persona: string, periodo: string, origin = "beta"): Promise<{ anticipo: number; prestamo: number; total: number; detalle: Row[] }> {
  const clave = clavePeriodo(periodo);
  const rows = (await descuentosDe(ctx)).filter((d) => s(d.estado || "activo") === "activo" && mismaPersona(s(d.persona), persona) && (s(d.origin || "beta") === "test") === (origin === "test"));
  const detalle: Row[] = [];
  for (const d of rows) {
    const plan = planDe(d);
    const pagadasInit = Math.max(0, Math.round(n(d.cuotas_pagadas ?? d.cuotasPagadas) || 0));
    for (const c of plan) {
      if (c.periodo !== clave) continue;
      if (c.n <= pagadasInit) continue;
      const prest = s(d.tipo) === "prestamo";
      detalle.push({
        id: d.id, tipo: prest ? "prestamo" : "anticipo", monto: c.monto, cuota: c.n, cuotas: prest ? plan.length : 1,
        etiqueta: prest ? etiquetaCuotaPrestamo(d, c, plan.length) : `Anticipo de sueldo${s(d.fecha) ? " del " + s(d.fecha).slice(0, 10) : ""}`,
      });
    }
  }
  const anticipo = round2(detalle.filter((x) => x.tipo === "anticipo").reduce((a, x) => a + n(x.monto), 0));
  const prestamo = round2(detalle.filter((x) => x.tipo === "prestamo").reduce((a, x) => a + n(x.monto), 0));
  return { anticipo, prestamo, total: round2(anticipo + prestamo), detalle };
}

async function logDesc(ctx: Ctx, ses: Ses, id: string, accion: string, antes: Row | null, despues: Row | null, motivo = "") {
  await ctx.db.write(actorOf(ses), "beta_rol_descuentos_log", "insert", {}, {
    id: crypto.randomUUID(), descuento_id: id, accion, actor: actorOf(ses), antes, despues, motivo: motivo || null,
    created_at: ctx.now.toISOString(), origin: ses.prueba ? "test" : "beta",
  }).catch(() => null);
  const quien = (despues && s(despues.persona)) || (antes && s(antes.persona)) || "";
  const tipo = (despues && s(despues.tipo)) || (antes && s(antes.tipo)) || "";
  await logAccion(ctx.db, actorOf(ses), "ROL " + (tipo === "prestamo" ? "PRÉSTAMO" : "ANTICIPO") + " " + accion.toUpperCase(),
    quien + " $" + n((despues || antes || {}).monto).toFixed(2) + (motivo ? " · " + motivo : "")).catch(() => null);
}

type EmpRol = { nombre: string; cargo: string; afiliada: boolean };
async function empleadasActivas(ctx: Ctx): Promise<EmpRol[]> {
  // DEV-31b: sin administradoras, sin bajas, sin inactivas; datos de «Configuración de rol».
  const { empleadasDelRol } = await import("./rol_config_api.ts");
  return (await empleadasDelRol(ctx)).map((e) => ({ nombre: e.nombre, cargo: e.cargo, afiliada: e.afiliada }));
}

extend("rol_desc_lista", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración ve anticipos y préstamos." };
  const aprobados = await rolesAprobados(ctx);
  const items = (await descuentosDe(ctx))
    .filter((d) => !s(p.persona) || mismaPersona(s(d.persona), s(p.persona)))
    .map((d) => vistaDescuento(d, aprobados))
    .sort((a, b) => s(b.fecha).localeCompare(s(a.fecha)) || s(b.createdAt).localeCompare(s(a.createdAt)));
  const hoy = ecuadorParts(ctx.now).ymd;
  const actual = periodoKey(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)));
  const periodos = [];
  for (let k = -12; k <= 12; k++) { const c = sumarMeses(actual, k); periodos.push({ periodo: c, etiqueta: etiquetaPeriodo(c) }); }
  const log = s(p.id)
    ? (await ctx.db.all("beta_rol_descuentos_log").catch(() => [] as Row[])).filter((r) => s(r.descuento_id) === s(p.id))
      .sort((a, b) => s(a.created_at).localeCompare(s(b.created_at)))
      .map((r) => ({ accion: r.accion, actor: r.actor, motivo: r.motivo, fecha: r.created_at }))
    : [];
  return { ok: true, items, empleadas: await empleadasActivas(ctx), periodos, hoy, siguiente: periodoSiguiente(hoy), log };
});

extend("rol_desc_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración registra anticipos y préstamos." };
  const tipo = s(p.tipo) === "prestamo" ? "prestamo" : s(p.tipo) === "anticipo" ? "anticipo" : "";
  if (!tipo) return { error: "Elige si es anticipo o préstamo." };
  const monto = round2(n(p.monto));
  if (!(monto > 0) || monto > 20000) return { error: "Escribe un monto válido." };
  const modo = tipo === "prestamo" && s(p.modo) === "monto_cuota" ? "monto_cuota" : "numero_cuotas";
  const restoModo = s(p.restoModo ?? p.resto_modo) === "sumar_ultimo" ? "sumar_ultimo" : "cuota_extra";
  const montoCuota = modo === "monto_cuota" ? round2(n(p.montoCuota ?? p.monto_cuota)) : null;
  if (tipo === "prestamo" && modo === "monto_cuota" && (!(Number(montoCuota) > 0) || Number(montoCuota) > 20000)) {
    return { error: "Escribe el monto de cada cuota." };
  }
  let cuotas = tipo === "prestamo" ? Math.round(n(p.cuotas)) : 1;
  if (tipo === "prestamo" && modo === "numero_cuotas" && (!(cuotas >= 1) || cuotas > 60)) return { error: "El préstamo va de 1 a 60 cuotas." };
  const montosPlan = tipo === "prestamo"
    ? planMontosPrestamo({ monto, modo, cuotas, montoCuota, restoModo })
    : [monto];
  if (tipo === "prestamo" && !montosPlan.length) return { error: "No se pudo armar el plan de cuotas. Revisa el monto y las cuotas." };
  cuotas = tipo === "prestamo" ? montosPlan.length : 1;
  if (cuotas > 60) return { error: "Demasiadas cuotas (máximo 60)." };
  const cuotasPagadas = tipo === "prestamo" ? Math.max(0, Math.round(n(p.cuotasPagadas ?? p.cuotas_pagadas) || 0)) : 0;
  if (tipo === "prestamo" && cuotasPagadas >= cuotas) return { error: "Las cuotas ya pagadas tienen que ser menos que el total de cuotas." };
  const hoy = ecuadorParts(ctx.now).ymd;
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(s(p.fecha)) ? s(p.fecha) : hoy;
  const primer = clavePeriodo(s(p.primerPeriodo || p.primer_periodo) || periodoSiguiente(fecha));
  if (!partesPeriodo(primer)) return { error: "Elige el mes del rol en que empieza el descuento." };
  const emps = await empleadasActivas(ctx);
  const emp = emps.find((e) => mismaPersona(e.nombre, s(p.persona)));
  if (!emp) return { error: "Elige a la empleada." };
  const origin = ses.prueba ? "test" : "beta";
  const aprobados = await rolesAprobados(ctx);
  const yaAprobado = (per: string) => aprobados.some((r) => clavePeriodo(r.periodo) === per && mismaPersona(s(r.persona), emp.nombre) && s(r.origin || "beta") !== "test");
  const now = ctx.now.toISOString();
  const motivo = s(p.motivo).slice(0, 300);
  const plan = planDe({ tipo, monto, cuotas, modo, monto_cuota: montoCuota, resto_modo: restoModo, primer_periodo: primer, cuotas_pagadas: cuotasPagadas });
  const primeraPendiente = plan.find((c) => c.n > cuotasPagadas);
  if (s(p.id)) {
    const prev = (await descuentosDe(ctx)).find((d) => s(d.id) === s(p.id));
    if (!prev) return { error: "No encuentro ese registro." };
    if (s(prev.estado) === "anulado") return { error: "Ese registro está anulado." };
    const pagadasRol = (vistaDescuento(prev, aprobados).plan as Row[]).filter((c) => c.pagadaRol);
    if (pagadasRol.length) return { error: "Ya hay cuotas descontadas en un rol aprobado. Anúlalo y registra el saldo como uno nuevo." };
    if (primeraPendiente && yaAprobado(primeraPendiente.periodo)) return { error: "El rol de " + etiquetaPeriodo(primeraPendiente.periodo) + " ya está aprobado. Elige un mes posterior o marca las cuotas ya pagadas." };
    const cambios = {
      persona: emp.nombre, tipo, monto, cuotas, fecha, primer_periodo: primer, motivo, updated_at: now,
      modo: tipo === "prestamo" ? modo : null, monto_cuota: tipo === "prestamo" ? montoCuota : null,
      resto_modo: tipo === "prestamo" && modo === "monto_cuota" ? restoModo : null, cuotas_pagadas: cuotasPagadas,
    };
    await ctx.db.write(actorOf(ses), "beta_rol_descuentos", "update", { id: prev.id }, cambios);
    const saved = { ...prev, ...cambios };
    await logDesc(ctx, ses, s(prev.id), "editar", prev, saved, s(p.motivoCambio));
    return { ok: true, item: vistaDescuento(saved, aprobados) };
  }
  if (primeraPendiente && yaAprobado(primeraPendiente.periodo)) return { error: "El rol de " + etiquetaPeriodo(primeraPendiente.periodo) + " ya está aprobado. Elige un mes posterior o marca las cuotas ya pagadas." };
  const row = {
    id: crypto.randomUUID(), persona: emp.nombre, tipo, monto, cuotas, fecha, primer_periodo: primer, motivo,
    modo: tipo === "prestamo" ? modo : null, monto_cuota: tipo === "prestamo" ? montoCuota : null,
    resto_modo: tipo === "prestamo" && modo === "monto_cuota" ? restoModo : null, cuotas_pagadas: cuotasPagadas,
    estado: "activo", origin, creado_por: actorOf(ses), created_at: now, updated_at: now,
  };
  await ctx.db.write(actorOf(ses), "beta_rol_descuentos", "insert", {}, row);
  await logDesc(ctx, ses, row.id, "crear", null, row);
  return { ok: true, item: vistaDescuento(row, aprobados) };
});

extend("rol_desc_anular", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración anula anticipos y préstamos." };
  const motivo = s(p.motivo).slice(0, 300);
  if (!motivo) return { error: "Escribe el motivo." };
  const prev = (await descuentosDe(ctx)).find((d) => s(d.id) === s(p.id));
  if (!prev) return { error: "No encuentro ese registro." };
  if (s(prev.estado) === "anulado") return { error: "Ya estaba anulado." };
  const now = ctx.now.toISOString();
  const cambios = { estado: "anulado", anulado_por: actorOf(ses), anulado_at: now, motivo_anulacion: motivo, updated_at: now };
  await ctx.db.write(actorOf(ses), "beta_rol_descuentos", "update", { id: prev.id }, cambios);
  const saved = { ...prev, ...cambios };
  await logDesc(ctx, ses, s(prev.id), "anular", prev, saved, motivo);
  return { ok: true, item: vistaDescuento(saved, await rolesAprobados(ctx)) };
});

// ── Firma de la empleada ─────────────────────────────────────────────────────────────────────────────────────
export async function firmaDeRol(ctx: Ctx, rolId: string): Promise<Row | null> {
  const rows = (await ctx.db.all("beta_rol_firmas").catch(() => [] as Row[])).filter((r) => s(r.rol_id) === rolId);
  rows.sort((a, b) => s(b.firmado_at).localeCompare(s(a.firmado_at)));
  return rows[0] || null;
}
export function vistaFirma(f: Row | null, conImagen: boolean): Row | null {
  if (!f) return null;
  const fecha = s(f.firmado_at);
  const local = fecha ? ecuadorParts(new Date(fecha)) : null;
  return { firmado: true, firmadoAt: fecha, fechaLocal: local ? local.ymd + " " + s(local.isoWall).slice(11, 16) : "", nombre: s(f.persona), ...(conImagen ? { png: s(f.firma_png) } : {}) };
}

extend("rol_firmar", "any", async (p, ctx, ses) => {
  if (!s(ses.token)) return { error: "Solo la empleada firma su rol, desde su cuenta." };
  const rows = await ctx.db.all("beta_roles").catch(() => [] as Row[]);
  const row = rows.find((r) => s(r.id) === s(p.id));
  if (!row) return { error: "No encuentro ese rol." };
  const propio = esPropio(s(row.persona), ses) || mismaPersonaRol(s(row.persona), ses.name || "") || mismaPersonaRol(s(row.persona), ses.short || "");
  if (!propio) return { error: "Solo la persona del rol puede firmarlo." };
  if (s(row.estado) !== "aprobado") return { error: "Este rol todavía no está aprobado." };
  if ((s(row.origin) === "test") !== !!ses.prueba) return { error: "Este rol no se puede firmar desde aquí." };
  const png = s(p.firma || p.png);
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png)) return { error: "Dibuja tu firma con el dedo." };
  if (png.length < 1200) return { error: "La firma está vacía. Dibújala con el dedo." };
  if (png.length > 400000) return { error: "La firma es demasiado grande. Bórrala y vuelve a intentar." };
  const prev = await firmaDeRol(ctx, s(row.id));
  if (prev) return { error: "Ya firmaste este rol.", firma: vistaFirma(prev, true) };
  const now = ctx.now.toISOString();
  const firma = {
    id: crypto.randomUUID(), rol_id: row.id, persona: row.persona, periodo: row.periodo, usuario_id: ses.uid,
    firma_png: png, firmado_at: now, user_agent: s(p.userAgent).slice(0, 300) || null,
    neto: n(((row.snapshot || {}) as Row).totalRecibir), origin: s(row.origin) === "test" ? "test" : "beta", created_at: now,
  };
  await ctx.db.write(actorOf(ses), "beta_rol_firmas", "insert", {}, firma);
  await ctx.db.write(actorOf(ses), "beta_roles_log", "insert", {}, {
    id: crypto.randomUUID(), rol_id: row.id, accion: "firmar", actor: actorOf(ses), antes: null,
    despues: { firmado_at: now, neto: firma.neto }, motivo: null, created_at: now,
  }).catch(() => null);
  await logAccion(ctx.db, actorOf(ses), "ROL FIRMADO", s(row.persona) + " " + s(row.periodo)).catch(() => null);
  return { ok: true, firma: vistaFirma(firma, true) };
});

// ── Pre-rol de TODAS al día de hoy (una tabla) ──────────────────────────────────────────────────────────────
extend("rol_prerol_resumen", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración ve el pre-rol." };
  const { armarEntrada } = await import("./roles_crear_api.ts");
  const hoy = ecuadorParts(ctx.now).ymd;
  const anio = Number(hoy.slice(0, 4)), mes = Number(hoy.slice(5, 7));
  const periodo = clavePeriodo(s(p.periodo)) && partesPeriodo(clavePeriodo(s(p.periodo))) ? clavePeriodo(s(p.periodo)) : periodoKey(anio, mes);
  const pp = partesPeriodo(periodo)!;
  const roles = (await ctx.db.all("beta_roles").catch(() => [] as Row[])).filter((r) => clavePeriodo(r.periodo) === periodo && s(r.origin || "beta") !== "test");
  const firmas = await ctx.db.all("beta_rol_firmas").catch(() => [] as Row[]);
  const filas: Row[] = [];
  for (const e of await empleadasActivas(ctx)) {
    const a = await armarEntrada(ctx, e.nombre, periodo, pp.anio, pp.mes);
    const rol = roles.find((r) => mismaPersona(s(r.persona), e.nombre));
    const f = rol ? firmas.filter((x) => s(x.rol_id) === s(rol.id)).sort((x, y) => s(y.firmado_at).localeCompare(s(x.firmado_at)))[0] : null;
    if (a.error) { filas.push({ nombre: e.nombre, error: a.error }); continue; }
    const d = a.snap as Row;
    const comisiones = round2(n(d.comFacialesSolo) + n(d.comExtras) + n(d.comRecepcion) + n(d.comPaquetes) + n(d.comProductos));
    filas.push({
      nombre: e.nombre, nombreCompleto: s(d.nombreCompleto) || e.nombre, cargo: e.cargo, afiliada: d.afiliada !== false,
      diasTrabajados: n(d.diasTrabajados), diasAsumidos: n(d.diasAsumidos), diasFest: n(d.diasFest), diasDesc: n(d.diasDesc), faltas: n(d.faltas),
      hrsNomina: n(d.hrsNomina), hrsNormales: n(d.hrsOrdinarias), hrsSupl: n(d.hrsSupl), hrsExtr: n(d.hrsExtr), hrsDesc: n(d.hrsDesc),
      sueldo: n(d.sueldo), bono: n(d.bono), comisiones,
      comFaciales: n(d.comFacialesSolo), comExtras: n(d.comExtras), comRecepcion: n(d.comRecepcion), comPaquetes: n(d.comPaquetes), comProductos: n(d.comProductos),
      horasExtra: round2(n(d.valSupl) + n(d.valExtr) + n(d.valDesc)),
      decimosFondo: round2(n(d.dec13) + n(d.dec14) + n(d.fondoReserva)),
      dec13: round2(n(d.dec13)), dec14: round2(n(d.dec14)), fondoReserva: round2(n(d.fondoReserva)),
      fondoFactor: n(d.fondoFactor), fondoDesde: s(d.fondoDesde),
      // DEV-31d (t915u): costo empresa = ingresos + patronal + CCC 1 % (la CCC no se descuenta a la empleada).
      patronal: round2(n(d.aportePatronal)), ccc: round2(n(d.ccc)), costoEmpresa: round2(n(d.costoEmpresa)),
      totalIngresos: n(d.totalIngresos), iess: n(d.iess),
      anticipos: n(d.anticipoSueldo), prestamos: n(d.prestamoEmpresa),
      prestamosIess: round2(n(d.prestQuir) + n(d.prestHip) + n(d.prestOtro)), multas: n(d.multas),
      totalEgresos: n(d.totalEgresos), neto: n(d.totalRecibir), fuenteHoras: s(d.fuenteHoras),
      asumidoDesde: s(d.asumidoDesde), ultimoDato: s(d.ultimoDato),
      rol: rol ? { id: rol.id, estado: s(rol.estado), firmado: !!f, firmadoAt: f ? s(f.firmado_at) : "" } : null,
    });
  }
  const tot = (k: string) => round2(filas.reduce((acc, x) => acc + n(x[k]), 0));
  return {
    ok: true, periodo, etiqueta: etiquetaPeriodo(periodo), hoy, filas,
    totales: { totalIngresos: tot("totalIngresos"), iess: tot("iess"), totalEgresos: tot("totalEgresos"), neto: tot("neto"), comisiones: tot("comisiones"), patronal: tot("patronal"), ccc: tot("ccc"), costoEmpresa: tot("costoEmpresa") },
    nota: "Horas: asistencia de la app (Mi asistencia). Hoy y los días hábiles que faltan se asumen como jornada completa. Un feriado sin marca no es falta; si se trabajó, va en horas extraordinarias periodo. Las horas en día de descanso van en horas extraordinarias descanso. Comisiones y multas del ciclo 26→25.",
  };
});

/** Resumen del período para el PDF general: roles guardados con estado y firma. */
extend("rol_resumen_periodo", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración ve el resumen." };
  const periodo = clavePeriodo(s(p.periodo));
  if (!partesPeriodo(periodo)) return { error: "Falta el período." };
  const origin = ses.prueba ? "test" : "beta";
  const roles = (await ctx.db.all("beta_roles").catch(() => [] as Row[])).filter((r) => clavePeriodo(r.periodo) === periodo && (s(r.origin || "beta") === "test") === (origin === "test"));
  const firmas = await ctx.db.all("beta_rol_firmas").catch(() => [] as Row[]);
  const items = roles.map((r) => {
    const d = (r.snapshot && typeof r.snapshot === "object") ? r.snapshot as Row : {};
    const f = firmas.filter((x) => s(x.rol_id) === s(r.id)).sort((x, y) => s(y.firmado_at).localeCompare(s(x.firmado_at)))[0] || null;
    return {
      id: r.id, persona: r.persona, cedula: r.cedula, cargo: r.cargo, estado: r.estado, afiliada: d.afiliada !== false,
      totalIngresos: n(d.totalIngresos), iess: n(d.iess), totalEgresos: n(d.totalEgresos), neto: n(d.totalRecibir),
      aportePatronal: n(((d.aportesPatronal || {}) as Row).total), costoEmpresa: n(d.costoEmpresa), firma: vistaFirma(f, false),
    };
  }).sort((a, b) => s(a.persona).localeCompare(s(b.persona), "es"));
  return { ok: true, periodo, etiqueta: etiquetaPeriodo(periodo), items };
});
