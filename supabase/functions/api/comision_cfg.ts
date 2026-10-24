// Tarifas de comisión con vigencia. Viven en app_kv (comision_reglas).
// Un ciclo usa la última fila de cada clave con vigente_desde <= al inicio.
// Los ciclos anteriores no se reescriben.

import type { Ctx, Ses } from "./lib.ts";
import { actorOf, kvGet, kvSet, logAccion } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import {
  FACIALES_2, FACIALES_3, TRAMOS_PAQUETE, cfgDesdeReglas, cicloInicio, ecuadorParts, facialSku, n, s, skuCode,
  type ReglaCom, type Row, type TipoReglaCom, type TramoPaquete,
} from "./domain.ts";

const CLAVE = "comision_reglas";
const TIPOS: Record<string, TipoReglaCom> = {
  com_facial: "facial",
  com_producto: "producto",
  com_base: "base",
  com_extra: "extra",
  com_recep: "recepcion",
  com_tramo: "tramo",
};

export async function leerReglas(db: Ctx["db"]): Promise<ReglaCom[]> {
  const kv = await kvGet(db, CLAVE);
  const filas = Array.isArray(kv) ? kv : (kv as Row).filas;
  return Array.isArray(filas) ? filas as ReglaCom[] : [];
}

async function escribirReglas(db: Ctx["db"], actor: string, filas: ReglaCom[]) {
  await kvSet(db, actor, CLAVE, { filas });
}

export async function cfgAplicada(db: Ctx["db"], ciclo: string) {
  const reglas = await leerReglas(db);
  const kv = await kvGet(db, "paquete_tramos");
  return cfgDesdeReglas(reglas, ciclo, kv);
}

function ymd(v: unknown): string {
  const t = s(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
}

function pctFraccion(v: unknown): number | null {
  if (v == null || s(v) === "") return null;
  const x = n(v);
  return x > 1 ? x / 100 : x;
}

function filaDe(r: ReglaCom): string {
  return r.tipo + "|" + r.clave + "|" + s(r.vigente_desde).slice(0, 10);
}

function pctUi(v: number | null | undefined): string {
  if (v == null || s(v) === "") return "";
  return String(Math.round(n(v) * 1000) / 10);
}

async function anotar(ctx: Ctx, ses: Ses, fila: string, accion: "INSERT" | "UPDATE" | "DELETE", antes: Row | null, despues: Row | null) {
  const actor = actorOf(ses);
  try {
    await ctx.db.write(actor, "audit_log", "insert", {}, {
      actor, actor_fuente: "app.user", tabla: "comision_reglas", fila_id: fila, accion, antes, despues,
    });
  } catch { /* el trigger de audit_log también anota */ }
  await logAccion(ctx.db, actor, accion + " comision_reglas", fila);
}

function clonarTramos(vigente: string, reglas: ReglaCom[]): ReglaCom[] {
  const previos = reglas.filter((r) => r.tipo === "tramo" && s(r.vigente_desde).slice(0, 10) <= vigente);
  const fecha = previos.map((r) => s(r.vigente_desde).slice(0, 10)).sort().pop();
  const base = fecha ? previos.filter((r) => s(r.vigente_desde).slice(0, 10) === fecha) : TRAMOS_PAQUETE.map((t) => ({
    tipo: "tramo" as const, clave: String(t.desde), vigente_desde: vigente,
    desde: t.desde, hasta: t.hasta, modo: t.modo, valor: t.valor,
  }));
  return base.map((r) => ({ ...r, tipo: "tramo" as const, vigente_desde: vigente, clave: String(r.desde ?? r.clave) }));
}

function bloqueoConfig(ses: Ses): Row | null {
  if (ses.prueba) return { error: "Modo prueba no cambia la configuración real" };
  return null;
}

export async function guardarComisionCampos(ctx: Ctx, ses: Ses, tabla: string, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  const bloqueo = bloqueoConfig(ses);
  if (bloqueo) return bloqueo;
  const tipo = TIPOS[tabla];
  if (!tipo) return { error: "Esa tabla todavía no se edita en línea" };
  const hoy = ecuadorParts(ctx.now).ymd;
  const vigente = ymd(campos.vigente) || cicloInicio(hoy);
  const reglas = await leerReglas(ctx.db);
  const prev = reglas.find((r) => filaDe(r) === fila);
  const clavePrev = prev ? prev.clave : (fila.startsWith("def|") ? fila.split("|")[2] || "" : "");
  let clave = clavePrev;
  if (tipo === "facial") clave = facialSku(campos.sku != null ? campos.sku : clave) || s(campos.sku || clave).toUpperCase();
  else if (tipo === "producto") clave = skuCode(campos.sku != null ? campos.sku : clave);
  else if (tipo === "tramo") clave = String(Math.max(1, Math.floor(n(campos.desde != null ? campos.desde : (prev?.desde ?? clave)))));
  else clave = tipo === "recepcion" ? "recepcion" : tipo;
  if ((tipo === "facial" || tipo === "producto" || tipo === "tramo") && !clave) return { error: "Falta el código" };

  const row: ReglaCom = { ...(prev || { tipo, clave, vigente_desde: vigente }), tipo, clave, vigente_desde: vigente };
  if (tipo === "facial" || tipo === "extra") row.monto = campos.monto != null ? n(campos.monto) : n(prev?.monto ?? (tipo === "extra" ? 1 : 0));
  if (tipo === "producto") {
    row.pct = campos.pct != null ? pctFraccion(campos.pct) : (prev ? prev.pct ?? null : null);
    row.fijo = campos.fijo != null ? (s(campos.fijo) === "" ? null : n(campos.fijo)) : (prev ? prev.fijo ?? null : null);
    if (row.pct == null && row.fijo == null) return { error: "Pon un % o un monto fijo" };
  }
  if (tipo === "base") {
    const pct = campos.pct != null ? pctFraccion(campos.pct) : pctFraccion(prev?.pct ?? 0.3);
    if (pct == null) return { error: "Falta el porcentaje" };
    row.pct = pct;
  }
  if (tipo === "recepcion") {
    row.por = campos.por != null ? n(campos.por) : n(prev?.por ?? 0.5);
    row.min = campos.min != null ? n(campos.min) : n(prev?.min ?? 10);
    row.lunes = campos.lunes != null ? n(campos.lunes) : n(prev?.lunes ?? 5);
  }
  if (tipo === "tramo") {
    row.desde = Math.max(1, Math.floor(n(clave)));
    row.hasta = Math.max(row.desde, Math.floor(n(campos.hasta != null && s(campos.hasta) !== "" ? campos.hasta : (prev?.hasta ?? 100000)) || 100000));
    row.modo = s(campos.modo || prev?.modo) === "fijo" ? "fijo" : "pct";
    const crudo = campos.valor != null ? n(campos.valor) : n(prev?.valor);
    row.valor = row.modo === "pct" && crudo > 1 ? crudo / 100 : crudo;
    row.clave = String(row.desde);
  }

  let siguiente = reglas.slice();
  if (tipo === "tramo" && !siguiente.some((r) => r.tipo === "tramo" && s(r.vigente_desde).slice(0, 10) === vigente)) {
    siguiente = siguiente.concat(clonarTramos(vigente, siguiente).filter((r) => r.clave !== row.clave));
  }
  const misma = (r: ReglaCom) => r.tipo === row.tipo && r.clave === row.clave && s(r.vigente_desde).slice(0, 10) === vigente;
  const ya = siguiente.find(misma);
  siguiente = siguiente.filter((r) => !misma(r));
  siguiente.push(row);
  await escribirReglas(ctx.db, actorOf(ses), siguiente);
  if (tipo === "tramo") {
    const juego = siguiente.filter((r) => r.tipo === "tramo" && s(r.vigente_desde).slice(0, 10) === vigente);
    await kvSet(ctx.db, actorOf(ses), "paquete_tramos", { tramos: juego.map((r) => ({ desde: r.desde, hasta: r.hasta, modo: r.modo, valor: r.valor })) });
  }
  await anotar(ctx, ses, filaDe(row), ya || prev ? "UPDATE" : "INSERT", ya || prev ? { ...ya, ...prev } : null, { ...row });
  return { ok: true, fila: filaDe(row) };
}

export async function borrarComision(ctx: Ctx, ses: Ses, tabla: string, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const bloqueo = bloqueoConfig(ses);
  if (bloqueo) return bloqueo;
  if (!TIPOS[tabla]) return { error: "Esa tabla todavía no se edita en línea" };
  if (fila.startsWith("def|")) return { error: "El valor de fábrica sigue vigente hasta que guardes otra fecha" };
  const reglas = await leerReglas(ctx.db);
  const prev = reglas.find((r) => filaDe(r) === fila);
  if (!prev) return { error: "Configuración no encontrada" };
  await escribirReglas(ctx.db, actorOf(ses), reglas.filter((r) => filaDe(r) !== fila));
  await anotar(ctx, ses, fila, "DELETE", { ...prev }, null);
  return { ok: true };
}

export async function reemplazarTramos(ctx: Ctx, ses: Ses, tramos: TramoPaquete[], vigente: string): Promise<Row | null> {
  const bloqueo = bloqueoConfig(ses);
  if (bloqueo) return bloqueo;
  const reglas = await leerReglas(ctx.db);
  const otras = reglas.filter((r) => !(r.tipo === "tramo" && s(r.vigente_desde).slice(0, 10) === vigente));
  const nuevas: ReglaCom[] = tramos.map((t) => ({
    tipo: "tramo", clave: String(t.desde), vigente_desde: vigente,
    desde: t.desde, hasta: t.hasta, modo: t.modo, valor: t.valor,
  }));
  await escribirReglas(ctx.db, actorOf(ses), otras.concat(nuevas));
  await kvSet(ctx.db, actorOf(ses), "paquete_tramos", { tramos });
  return null;
}

function nombreCat(rows: Row[], sku: string): string {
  const code = skuCode(sku);
  const hit = rows.find((r) => skuCode(s(r.sku)) === code);
  return hit ? s(hit.producto_servicio || hit.nombre) : "";
}

export async function vistaConfig(ctx: Ctx): Promise<Row> {
  const reglas = await leerReglas(ctx.db);
  const cat = await ctx.db.all("catalogo").catch(() => [] as Row[]);
  const faciales = [...FACIALES_2, ...FACIALES_3].flatMap((sku) => {
    const saved = reglas.filter((r) => r.tipo === "facial" && (facialSku(r.clave) || r.clave) === sku);
    const fabrica = FACIALES_2.includes(sku) ? 2 : 3;
    if (!saved.length) return [{ sku, nombre: nombreCat(cat, sku), monto: fabrica, vigente: "", fila: "def|facial|" + sku, fabrica: true }];
    return saved.map((r) => ({ sku, nombre: nombreCat(cat, sku), monto: n(r.monto), vigente: s(r.vigente_desde).slice(0, 10), fila: filaDe(r), fabrica: false }));
  });
  const productosGuardados = reglas.filter((r) => r.tipo === "producto");
  const vistos = new Set(productosGuardados.map((r) => skuCode(r.clave)));
  const deCatalogo = cat.filter((r) => {
    if (r.borrado_at || r.activo === false) return false;
    const code = skuCode(s(r.sku));
    const tipo = s(r.tipo).toUpperCase();
    return tipo.includes("PROD") || /^[A-Z]{2,3}-\d+/.test(code);
  });
  const productos = [
    ...productosGuardados.map((r) => ({
      sku: skuCode(r.clave), nombre: nombreCat(cat, r.clave), pct: pctUi(r.pct), fijo: r.fijo == null ? "" : s(r.fijo),
      vigente: s(r.vigente_desde).slice(0, 10), fila: filaDe(r), fabrica: false,
    })),
    ...deCatalogo.filter((r) => !vistos.has(skuCode(s(r.sku)))).map((r) => ({
      sku: skuCode(s(r.sku)), nombre: s(r.producto_servicio || r.nombre), pct: "", fijo: "",
      vigente: "", fila: "def|producto|" + skuCode(s(r.sku)), fabrica: true,
    })),
  ];
  const baseSaved = reglas.filter((r) => r.tipo === "base");
  const base = baseSaved.length
    ? baseSaved.map((r) => ({ pct: pctUi(r.pct), vigente: s(r.vigente_desde).slice(0, 10), fila: filaDe(r), fabrica: false }))
    : [{ pct: "30", vigente: "", fila: "def|base|base", fabrica: true }];
  const extraSaved = reglas.filter((r) => r.tipo === "extra");
  const extra = extraSaved.length
    ? extraSaved.map((r) => ({ monto: n(r.monto), vigente: s(r.vigente_desde).slice(0, 10), fila: filaDe(r), fabrica: false }))
    : [{ monto: 1, vigente: "", fila: "def|extra|extra", fabrica: true }];
  const recepSaved = reglas.filter((r) => r.tipo === "recepcion");
  const recepcion = recepSaved.length
    ? recepSaved.map((r) => ({ por: n(r.por), min: n(r.min), lunes: n(r.lunes), vigente: s(r.vigente_desde).slice(0, 10), fila: filaDe(r), fabrica: false }))
    : [{ por: 0.5, min: 10, lunes: 5, vigente: "", fila: "def|recepcion|recepcion", fabrica: true }];
  const tramoSaved = reglas.filter((r) => r.tipo === "tramo");
  const tramos = tramoSaved.length
    ? tramoSaved.map((r) => ({
      desde: r.desde, hasta: r.hasta && r.hasta < 100000 ? r.hasta : "", modo: r.modo || "pct",
      valor: r.modo === "fijo" ? n(r.valor) : Math.round(n(r.valor) * 1000) / 10,
      vigente: s(r.vigente_desde).slice(0, 10), fila: filaDe(r), fabrica: false,
    }))
    : TRAMOS_PAQUETE.map((t) => ({
      desde: t.desde, hasta: t.hasta >= 100000 ? "" : t.hasta, modo: t.modo,
      valor: Math.round(t.valor * 1000) / 10, vigente: "", fila: "def|tramo|" + t.desde, fabrica: true,
    }));
  return { faciales, productos, base, extra, recepcion, tramos };
}
