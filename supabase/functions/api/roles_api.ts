// Publicación de roles de pago: el personal solo ve los que un admin publicó.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { n, s, type Row } from "./domain.ts";
import { acceso, esAdmin, esPropio, matrizDe } from "./permisos.ts";

const MESES: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};
const NOMBRE_MES = Object.fromEntries(Object.entries(MESES).map(([k, v]) => [v, k]));

function normMes(raw: string): string {
  const t = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  if (MESES[t]) return t;
  const hit = Object.keys(MESES).find((m) => t.startsWith(m) || m.startsWith(t));
  return hit || t;
}

export function clavePeriodo(mes: unknown, ano?: unknown): string {
  const raw = s(mes).trim();
  if (/^CICLO_\d{4}-\d{2}-\d{2}$/i.test(raw)) return raw.toUpperCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "CICLO_" + raw;
  const unido = raw.match(/^([A-Za-zÁÉÍÓÚáéíóúüñ]+)[_\s-]+(\d{4})(?:\.0)?$/);
  if (unido) return normMes(unido[1]) + "_" + unido[2];
  const a = String(ano ?? "").replace(/\.0$/, "");
  if (raw && /^\d{4}$/.test(a)) return normMes(raw) + "_" + a;
  return raw.toUpperCase();
}

export function etiquetaPeriodo(clave: string): string {
  const c = clavePeriodo(clave);
  const m = c.match(/^CICLO_(\d{4}-\d{2}-\d{2})$/);
  if (m) return "Ciclo " + m[1];
  const p = c.split("_");
  const mes = p[0] || c;
  const anio = p[1] || "";
  return (mes.charAt(0) + mes.slice(1).toLowerCase() + (anio ? " " + anio : "")).trim();
}

export function anioDeClave(clave: string): number {
  const c = clavePeriodo(clave);
  const m = c.match(/(\d{4})/);
  return m ? Number(m[1]) : 0;
}

function mismoNombre(a: string, b: string): boolean {
  if (!a || !b || a === "*" || b === "*") return false;
  return esPropio(a, { rol: "", name: b, short: b, uid: "" }) || esPropio(b, { rol: "", name: a, short: a, uid: "" });
}


function tokensNom(v: string): string[] {
  return s(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z ]/g, " ").split(/\s+/)
    .filter((w) => w.length >= 3 && !["DEL", "LAS", "LOS", "SAN", "SANTA"].includes(w));
}

/** Cruza "Andrea Robles" con el nombre legal de la hoja ("ROBLES POGO ANDREA DEL CISNE"). */
export function mismaPersonaRol(a: string, b: string): boolean {
  if (!a || !b || a === "*" || b === "*") return false;
  if (mismoNombre(a, b)) return true;
  const ta = new Set(tokensNom(a)), tb = new Set(tokensNom(b));
  const inter = [...ta].filter((x) => tb.has(x));
  if (inter.length >= 2) return true;
  if (inter.length === 1 && (ta.size === 1 || tb.size === 1)) return true;
  return false;
}

/** Arma el preview oficial a partir de una fila de rrhh_historial (lo pagado en la hoja). */
export function rolDesdeHistorial(r: Row, periodo?: string): Row {
  const clave = clavePeriodo(periodo || r.mes, periodo ? undefined : r.ano);
  const sueldo = n(r.sueldo);
  const bono = n(r.bono);
  const comisiones = n(r.comisiones);
  const extras = n(r.extras_m_o_q);
  const decimosFondo = n(r.c_13_14_fr_r_s_t);
  const totalIngresos = n(r.total_ingresos_u) || (sueldo + bono + comisiones + extras + decimosFondo);
  const iessPatronal = n(r.iess_patronal_11_15);
  const costoEmpresa = n(r.costo_empresa);
  return {
    nombre: s(r.empleada),
    cedula: s(r.cedula),
    etiqueta: etiquetaPeriodo(clave),
    periodo: clave,
    sueldoBase: sueldo,
    sueldo,
    bono,
    comisiones,
    extras,
    decimosFondo,
    totalIngresos,
    iess: 0,
    totalEgresos: 0,
    aportesPatronal: { iess: iessPatronal, secap: 0, iece: 0, total: iessPatronal, costoEmpresa },
    fuente: "historial",
    fuenteHoras: "Historial RRHH",
  };
}

export function histClave(r: Row): string {
  return clavePeriodo(r.mes, r.ano);
}

export function estaPublicado(pubs: Row[], periodo: string, persona: string): boolean {
  const clave = clavePeriodo(periodo);
  const rows = pubs.filter((r) => clavePeriodo(r.periodo) === clave);
  const own = rows.find((r) => mismoNombre(s(r.persona), persona));
  if (own) return own.publicado === true;
  const star = rows.find((r) => s(r.persona) === "*" || s(r.persona) === "");
  return star ? star.publicado === true : false;
}

async function pubsDe(ctx: Ctx): Promise<Row[]> {
  try { return await ctx.db.all("beta_rol_publicaciones"); } catch { return []; }
}

async function upsertPub(ctx: Ctx, ses: Ses, periodo: string, persona: string, publicado: boolean) {
  const rows = await pubsDe(ctx);
  const clave = clavePeriodo(periodo);
  const qui = persona || "*";
  const hit = rows.find((r) => clavePeriodo(r.periodo) === clave && (s(r.persona) === qui || (qui === "*" && (s(r.persona) === "*" || s(r.persona) === ""))));
  const now = ctx.now.toISOString();
  const row = {
    periodo: clave, persona: qui, publicado,
    publicado_por: publicado ? actorOf(ses) : (hit ? s(hit.publicado_por) : actorOf(ses)),
    publicado_at: publicado ? now : (hit ? hit.publicado_at : null),
    updated_at: now,
  };
  if (hit && hit.id) await ctx.db.write(actorOf(ses), "beta_rol_publicaciones", "update", { id: hit.id }, row);
  else await ctx.db.write(actorOf(ses), "beta_rol_publicaciones", "insert", {}, row);
}


extend("roles_lista", "any", async (p, ctx, ses) => {
  const pubs = await pubsDe(ctx);
  const admin = esAdmin(ses.rol);
  const hist = await ctx.db.all("rrhh_historial").catch(() => [] as Row[]);
  const porPeriodo = new Map<string, Row[]>();
  for (const r of hist) {
    const clave = histClave(r);
    if (!clave || !s(r.empleada)) continue;
    if (clave.startsWith("ℹ️") || /solo modificar/i.test(s(r.empleada))) continue;
    const arr = porPeriodo.get(clave) || [];
    arr.push(r);
    porPeriodo.set(clave, arr);
  }
  const overlays = await ctx.db.all("beta_empleados").catch(() => [] as Row[]);
  const { afiliadaSegunOverlay } = await import("./empleados_api.ts");
  const anioFiltro = n(p.anio) || 0;
  // TK166: el neto del historial sale del detalle congelado (ingresos − IESS 9.45 % − descuentos), no del total de ingresos.
  const detalles = await ctx.db.all("beta_rol_hist_detalle").catch(() => [] as Row[]);
  const cedN = (v: unknown) => s(v).replace(/\.0+$/, "").replace(/\D/g, "");
  const netoDe = (periodo: string, cedula: unknown, total: number, r: Row): number => {
    const hit = detalles.find((x) => s(x.periodo).toUpperCase() === periodo.toUpperCase() && cedN(x.cedula) === cedN(cedula));
    const d = hit && hit.detalle && typeof hit.detalle === "object" ? hit.detalle as Row : null;
    if (d && d.neto != null) return n(d.neto);
    const aportable = n(r.sueldo) + n(r.bono) + n(r.comisiones) + n(r.extras_m_o_q);
    return Math.round((total - aportable * 0.0945) * 100) / 100;
  };
  const items: Row[] = [];
  for (const [periodo, filas] of porPeriodo) {
    const anio = anioDeClave(periodo);
    if (anioFiltro && anio !== anioFiltro) continue;
    for (const r of filas) {
      const persona = s(r.empleada);
      const pub = estaPublicado(pubs, periodo, persona);
      // El historial de la hoja ya fue pagado: el personal ve el suyo aunque no haya publicación beta.
      if (!admin && !esPropio(persona, ses) && !esPropio(s(r.nombre_app), ses) && !mismaPersonaRol(persona, ses.name || "") && !mismaPersonaRol(persona, ses.short || "")) continue;
      if (admin && s(p.persona) && !mismaPersonaRol(persona, s(p.persona))) continue;
      if (admin && !afiliadaSegunOverlay(overlays, persona)) continue;
      items.push({
        periodo, etiqueta: etiquetaPeriodo(periodo), anio,
        persona, cedula: s(r.cedula),
        totalIngresos: n(r.total_ingresos_u),
        neto: netoDe(periodo, r.cedula, n(r.total_ingresos_u), r),
        publicado: pub,
        estado: "aprobado",
        fuente: "historial",
        sheet: periodo,
      });
    }
  }
  const propios = await ctx.db.all("beta_roles").catch(() => [] as Row[]);
  const firmasRol = await ctx.db.all("beta_rol_firmas").catch(() => [] as Row[]);
  for (const r of propios) {
    if (s(r.origin) === "test") continue;
    const persona = s(r.persona);
    const periodo = clavePeriodo(r.periodo);
    const snap = (r.snapshot && typeof r.snapshot === "object") ? r.snapshot as Row : {};
    const pub = s(r.estado) === "aprobado" || estaPublicado(pubs, periodo, persona);
    if (!admin && s(r.estado) !== "aprobado") continue;
    if (!admin && !esPropio(persona, ses) && !mismaPersonaRol(persona, ses.name || "") && !mismaPersonaRol(persona, ses.short || "")) continue;
    if (admin && s(p.persona) && !mismaPersonaRol(persona, s(p.persona))) continue;
    const anio = anioDeClave(periodo) || n(r.anio);
    if (anioFiltro && anio !== anioFiltro) continue;
    const ix = items.findIndex((x) => clavePeriodo(x.periodo) === periodo && mismoNombre(s(x.persona), persona));
    const item: Row = {
      id: r.id, periodo, etiqueta: etiquetaPeriodo(periodo), anio,
      persona, cedula: s(r.cedula) || s(snap.cedula),
      totalIngresos: n(snap.totalIngresos), neto: n(snap.totalRecibir || snap.neto),
      publicado: pub, estado: s(r.estado) || "borrador",
      fuente: "beta", sheet: periodo, motivoRechazo: s(r.motivo_rechazo),
      firmado: firmasRol.some((f) => s(f.rol_id) === s(r.id)),
    };
    if (ix >= 0) items[ix] = item;
    else items.push(item);
  }
  items.sort((a, b) => s(b.periodo).localeCompare(s(a.periodo)) || s(a.persona).localeCompare(s(b.persona)));
  const anios = [...new Set(items.map((x) => n(x.anio)).filter(Boolean))].sort((a, b) => b - a);
  return { ok: true, items, anios, admin };
});

extend("rol_publicar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin publica o oculta un rol de pagos." };
  const periodo = clavePeriodo(p.periodo || p.sheet || p.ciclo);
  if (!periodo) return { error: "Falta el periodo." };
  const publicado = p.publicado !== false && s(p.publicado) !== "0";
  const todos = p.todos === true || s(p.todos) === "1" || s(p.persona) === "*" || !s(p.persona);
  if (todos) {
    await upsertPub(ctx, ses, periodo, "*", publicado);
    if (p.limpiarPersonas === true) {
      const rows = await pubsDe(ctx);
      for (const r of rows) {
        if (clavePeriodo(r.periodo) === periodo && s(r.persona) && s(r.persona) !== "*") {
          await ctx.db.write(actorOf(ses), "beta_rol_publicaciones", "delete", { id: r.id }, null);
        }
      }
    }
  } else {
    await upsertPub(ctx, ses, periodo, s(p.persona), publicado);
  }
  return { ok: true, periodo, publicado, alcance: todos ? "*" : s(p.persona) };
});

export async function exigirRolPublicado(ctx: Ctx, ses: Ses, periodo: string, persona: string): Promise<string | null> {
  if (esAdmin(ses.rol)) return null;
  if (acceso(ses.rol, "rol_pagos", await matrizDe(ctx.db)) === "todos") return null;
  const pubs = await pubsDe(ctx);
  if (estaPublicado(pubs, periodo, persona)) return null;
  return "Este rol todavía no está publicado.";
}

extend("getRoles", "any", async (_p, ctx, ses) => {
  const pubs = await pubsDe(ctx);
  const hist = await ctx.db.all("rrhh_historial");
  const overlaysGet = await ctx.db.all("beta_empleados").catch(() => [] as Row[]);
  const { afiliadaSegunOverlay } = await import("./empleados_api.ts");
  const meses = new Map<string, Row>();
  const admin = esAdmin(ses.rol);
  for (const r of hist) {
    if (!s(r.mes) || !s(r.empleada)) continue;
    const periodo = histClave(r);
    const pub = estaPublicado(pubs, periodo, s(r.empleada));
    if (!admin && !esPropio(s(r.empleada), ses) && !mismaPersonaRol(s(r.empleada), ses.name || "") && !mismaPersonaRol(s(r.empleada), ses.short || "")) continue;
    if (admin && !afiliadaSegunOverlay(overlaysGet || [], s(r.empleada))) continue;
    const g = meses.get(periodo) || { mes: s(r.mes), anio: r.ano, empleadas: [], sheetName: periodo, publicado: pub };
    (g.empleadas as Row[]).push({
      nombre: s(r.empleada), cedula: s(r.cedula), sueldo: n(r.sueldo), bono: n(r.bono), comisiones: n(r.comisiones),
      extras: n(r.extras_m_o_q), decimos: n(r.c_13_14_fr_r_s_t), totalIngresos: n(r.total_ingresos_u),
      iessPatronal: n(r.iess_patronal_11_15), costoEmpresa: n(r.costo_empresa),
      publicado: pub,
    });
    g.publicado = pub;
    meses.set(periodo, g);
  }
  return { ok: true, data: { meses: [...meses.values()], resumen: [], sheetsDisponibles: [...meses.keys()] } };
});
