// 🏷️ Promociones de la beta (Emilia 17/11). Una promo (ej. «Black Friday») con vigencia y VARIAS reglas:
//   pct   → −% sobre los productos de la regla            (ej. −20% en x3 Facial de Ginseng)
//   monto → −$ fijo (por unidad o una vez por grupo)       (ej. −$10 c/u)
//   precio→ cada unidad a precio especial                  (ej. si lleva 2, $100 c/u)
//   nxm   → lleva N, paga M (se regalan las más baratas)   (ej. 3×2)
// Alcance de la regla: códigos, marca, categoría, tipo de línea (facial/producto/paquete/extra), combo (todos los códigos juntos) o todo.
// «min» = unidades mínimas para que la regla despierte. Una línea recibe a lo más UNA regla (no se apilan promos).
// El ticket aplica el resultado como DESCUENTO POR LÍNEA con la etiqueta de la promo → la comisión se calcula sobre el neto, igual que hoy.
// Las promos del sistema viejo (hoja 🎉 PROMOS, espejo public.promos) se leen (nunca se escriben) y se pueden importar.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { n, round2, s, skuCode, type Row } from "./domain.ts";
import { catalogoTicket } from "./tickets_beta_api.ts";

const FALTA = "Falta aplicar 20261117_beta_promociones.sql";
async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
async function hay(ctx: Ctx): Promise<boolean> { try { await ctx.db.all("beta_promociones"); return true; } catch { return false; } }
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
export const TIPOS_REGLA = ["pct", "monto", "precio", "nxm"] as const;
export const ALCANCES = ["codigos", "combo", "marca", "categoria", "tipo", "todo"] as const;

export interface Regla { tipo: string; alcance: string; codigos: string[]; marca?: string; categoria?: string; tipoLinea?: string; valor: number; valor2?: number; min?: number; por?: string; etiqueta?: string }
export interface PromoB { id: string; nombre: string; desde: string; hasta: string; activa: boolean; reglas: Regla[]; origen: string; sheet_row?: number | null; notas?: string }
export interface LineaP { k: string; sku: string; nombre?: string; tipo?: string; cantidad: number; bruto: number; marca?: string; categoria?: string }

function hoyEc(ctx: Ctx): string { return new Date(ctx.now.getTime() - 5 * 3600000).toISOString().slice(0, 10); }
const ymd = (v: unknown) => { const t = s(v).slice(0, 10); return ymdRe.test(t) ? t : ""; };
const norm = (v: unknown) => s(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Normaliza/valida una regla. Devuelve error en texto si no sirve. */
export function reglaDe(x: Row): Regla | string {
  const tipo = s(x.tipo).toLowerCase(), alcance = s(x.alcance).toLowerCase() || "codigos";
  if (!(TIPOS_REGLA as readonly string[]).includes(tipo)) return "Tipo de regla desconocido: " + s(x.tipo);
  if (!(ALCANCES as readonly string[]).includes(alcance)) return "Alcance desconocido: " + s(x.alcance);
  const codigos = (Array.isArray(x.codigos) ? x.codigos as unknown[] : s(x.codigos).split(",")).map((c) => skuCode(s(c).trim())).filter(Boolean).slice(0, 60);
  const valor = round2(n(x.valor)), valor2 = round2(n(x.valor2)), min = Math.max(1, Math.round(n(x.min) || 1));
  if ((alcance === "codigos" || alcance === "combo") && !codigos.length) return "La regla necesita al menos un código";
  if (alcance === "combo" && codigos.length < 2) return "Un combo necesita 2 o más códigos";
  if (alcance === "marca" && !s(x.marca).trim()) return "Falta la marca";
  if (alcance === "categoria" && !s(x.categoria).trim()) return "Falta la categoría";
  if (alcance === "tipo" && !["facial", "producto", "paquete", "extra"].includes(s(x.tipoLinea))) return "Tipo de línea inválido";
  if (tipo === "pct" && !(valor > 0 && valor <= 100)) return "El % debe estar entre 1 y 100";
  if ((tipo === "monto" || tipo === "precio") && !(valor > 0)) return tipo === "monto" ? "El descuento $ debe ser mayor a 0" : "Falta el precio especial";
  if (tipo === "nxm") { const N = Math.round(valor), M = Math.round(valor2); if (N < 2 || M < 1 || M >= N) return "N×M inválido: N≥2 y M<N (ej. 3×2)"; }
  return {
    tipo, alcance, codigos, valor, valor2: tipo === "nxm" ? Math.round(valor2) : 0, min, por: tipo === "monto" ? (s(x.por) === "unidad" ? "unidad" : s(x.por) === "una" ? "una" : "grupo") : undefined,
    ...(alcance === "marca" ? { marca: s(x.marca).trim().slice(0, 80) } : {}), ...(alcance === "categoria" ? { categoria: s(x.categoria).trim().slice(0, 80) } : {}),
    ...(alcance === "tipo" ? { tipoLinea: s(x.tipoLinea) } : {}), ...(s(x.etiqueta).trim() ? { etiqueta: s(x.etiqueta).trim().slice(0, 80) } : {}),
  };
}

const $ = (v: number) => "$" + round2(v).toFixed(2);
/** Texto corto de la regla (ticket y módulo). */
export function textoRegla(r: Regla, nombreDe: (c: string) => string = (c) => c): string {
  if (r.etiqueta) return r.etiqueta;
  const a = r.alcance === "todo" ? "todo el ticket" : r.alcance === "marca" ? "marca " + r.marca : r.alcance === "categoria" ? "categoría " + r.categoria
    : r.alcance === "tipo" ? ({ facial: "faciales", producto: "productos", paquete: "paquetes", extra: "extras" } as Row)[s(r.tipoLinea)] as string
    : r.codigos.map(nombreDe).join(r.alcance === "combo" ? " + " : " / ");
  const m = (r.min || 1) > 1 ? "lleva " + r.min + "+: " : "";
  if (r.tipo === "pct") return m + "−" + r.valor + "% " + a;
  if (r.tipo === "monto") return m + "−" + $(r.valor) + (r.por === "unidad" ? " c/u " : r.por === "una" ? " (una vez) " : r.alcance === "combo" ? " por combo " : (r.min || 1) > 1 ? " cada " + r.min + " " : " ") + a;
  if (r.tipo === "precio") return m + (r.alcance === "combo" ? "combo a " + $(r.valor) + " " : $(r.valor) + " c/u ") + a;
  return Math.round(r.valor) + "×" + Math.round(n(r.valor2)) + " " + a;
}

function coincide(r: Regla, l: LineaP): boolean {
  if (s(l.tipo) === "gift") return false;
  const c = skuCode(l.sku);
  if (r.alcance === "codigos" || r.alcance === "combo") return r.codigos.includes(c);
  if (r.alcance === "marca") return !!l.marca && norm(l.marca) === norm(r.marca);
  if (r.alcance === "categoria") return !!l.categoria && norm(l.categoria) === norm(r.categoria);
  if (r.alcance === "tipo") return s(l.tipo) === s(r.tipoLinea);
  return true;
}

/** Descuento de UNA regla sobre las líneas libres. Devuelve monto por línea o el motivo de por qué no aplica. */
export function evaluarRegla(r: Regla, lineas: LineaP[], nombreDe: (c: string) => string = (c) => c): { por: Map<string, number>; monto: number; motivo?: string } {
  const por = new Map<string, number>();
  const L = lineas.filter((l) => n(l.cantidad) > 0 && n(l.bruto) > 0 && coincide(r, l));
  const unit = (l: LineaP) => n(l.bruto) / n(l.cantidad);
  const fin = () => { let m = 0; for (const [k, v] of por) { const l = lineas.find((x) => x.k === k)!; const vv = round2(Math.min(v, n(l.bruto))); if (vv > 0) por.set(k, vv); else por.delete(k); m += vv > 0 ? vv : 0; } return { por, monto: round2(m) }; };
  if (r.alcance === "combo") {
    const falta = r.codigos.filter((c) => !L.some((l) => skuCode(l.sku) === c));
    if (falta.length) return { por, monto: 0, motivo: "Falta " + falta.map(nombreDe).join(", ") };
    const qDe = (c: string) => L.filter((l) => skuCode(l.sku) === c).reduce((a, l) => a + Math.floor(n(l.cantidad)), 0);
    const sets = Math.min(...r.codigos.map(qDe));
    if (sets < 1) return { por, monto: 0, motivo: "El combo no está completo" };
    const uDe = (c: string) => { const l = L.find((x) => skuCode(x.sku) === c)!; return unit(l); };
    const S = r.codigos.reduce((a, c) => a + uDe(c), 0);
    const tot = r.tipo === "pct" ? S * sets * r.valor / 100 : r.tipo === "monto" ? r.valor * sets : r.tipo === "precio" ? Math.max(0, S - r.valor) * sets : 0;
    if (!(tot > 0)) return { por, monto: 0, motivo: "El combo ya cuesta menos que el precio especial" };
    for (const c of r.codigos) { const l = L.find((x) => skuCode(x.sku) === c)!; por.set(l.k, (por.get(l.k) || 0) + tot * (uDe(c) / S)); }
    return fin();
  }
  if (!L.length) return { por, monto: 0, motivo: r.alcance === "codigos" ? "El ticket no lleva " + r.codigos.map(nombreDe).join(" / ") : "No hay líneas de " + textoRegla({ ...r, min: 1, etiqueta: "" }, nombreDe).replace(/^[^ ]+ /, "") };
  const Q = L.reduce((a, l) => a + Math.floor(n(l.cantidad)), 0), min = r.min || 1;
  if (Q < min) return { por, monto: 0, motivo: "Lleva " + Q + "; la promo pide " + min + " o más" };
  if (r.tipo === "pct") for (const l of L) por.set(l.k, n(l.bruto) * r.valor / 100);
  else if (r.tipo === "precio") for (const l of L) por.set(l.k, Math.max(0, unit(l) - r.valor) * n(l.cantidad));
  else if (r.tipo === "monto") {
    if (r.por === "unidad") for (const l of L) por.set(l.k, r.valor * Math.floor(n(l.cantidad)));
    else { const tot = r.por === "una" ? Math.min(r.valor, L.reduce((a, l) => a + n(l.bruto), 0)) : r.valor * Math.floor(Q / min), B = L.reduce((a, l) => a + n(l.bruto), 0); for (const l of L) por.set(l.k, tot * n(l.bruto) / B); }
  } else {
    const N = Math.round(r.valor), M = Math.round(n(r.valor2));
    const us: { k: string; p: number }[] = [];
    for (const l of L) for (let i = 0; i < Math.floor(n(l.cantidad)); i++) us.push({ k: l.k, p: unit(l) });
    us.sort((a, b) => b.p - a.p);
    const libres = Math.floor(us.length / N) * (N - M);
    if (libres < 1) return { por, monto: 0, motivo: "Lleva " + us.length + "; el " + N + "×" + M + " pide " + N };
    for (let i = us.length - libres; i < us.length; i++) por.set(us[i].k, (por.get(us[i].k) || 0) + us[i].p);
  }
  const out = fin();
  if (!(out.monto > 0)) return { por, monto: 0, motivo: "No descuenta nada con estos precios" };
  return out;
}

/** Aplica varias promos (en el orden dado) sobre las líneas: cada línea recibe a lo más una regla. */
export function aplicarPromos(promos: PromoB[], lineas: LineaP[], nombreDe: (c: string) => string = (c) => c) {
  const usadas = new Set<string>(), porLinea = new Map<string, { monto: number; etiqueta: string }>();
  const aplicadas: Row[] = [], noAplican: Row[] = [];
  for (const p of promos) {
    let mp = 0; const det: Row[] = []; const motivos: string[] = [];
    for (const r of p.reglas) {
      const libres = lineas.filter((l) => !usadas.has(l.k));
      const ev = evaluarRegla(r, libres, nombreDe);
      if (!(ev.monto > 0)) { if (ev.motivo) motivos.push(p.reglas.length > 1 ? textoRegla(r, nombreDe) + ": " + ev.motivo : ev.motivo); continue; }
      const et = p.nombre + " · " + textoRegla(r, nombreDe);
      for (const [k, v] of ev.por) { usadas.add(k); porLinea.set(k, { monto: v, etiqueta: et.slice(0, 120) }); }
      mp += ev.monto; det.push({ regla: textoRegla(r, nombreDe), monto: ev.monto });
    }
    if (mp > 0) aplicadas.push({ id: p.id, nombre: p.nombre, monto: round2(mp), reglas: det });
    else noAplican.push({ id: p.id, nombre: p.nombre, motivo: motivos.join(" · ") || "No aplica a este ticket" });
  }
  const L = lineas.map((l) => { const x = porLinea.get(l.k); return { k: l.k, sku: l.sku, bruto: round2(n(l.bruto)), monto: x ? x.monto : 0, etiqueta: x ? x.etiqueta : "", neto: round2(n(l.bruto) - (x ? x.monto : 0)) }; });
  const bruto = round2(lineas.reduce((a, l) => a + n(l.bruto), 0)), desc = round2(L.reduce((a, l) => a + l.monto, 0));
  return { aplicadas, noAplican, lineas: L, bruto, descuento: desc, total: round2(bruto - desc) };
}

/** Promo de la hoja (sistema viejo) → promo de la beta con una regla, con la MISMA regla de cálculo de allá. */
export function promoDeHoja(r: Row): PromoB | null {
  const nombre = s(r.nombre).trim(); if (!nombre) return null;
  const t = s(r.tipo).toUpperCase() || "%", cods = s(r.codigos).split(",").map((x) => skuCode(x.trim())).filter(Boolean);
  let regla: Regla;
  if (t === "$") regla = { tipo: "monto", alcance: cods.length ? "codigos" : "todo", codigos: cods, valor: n(r.valor), min: 1, por: "una" };
  else if (t === "NXM") regla = { tipo: "nxm", alcance: "codigos", codigos: cods, valor: Math.round(n(r.valor)), valor2: Math.round(n(r.valor2)), min: 1 };
  else if (t === "PACK") regla = { tipo: "precio", alcance: "codigos", codigos: cods, valor: n(r.valor), min: 1 };
  else regla = { tipo: "pct", alcance: cods.length ? "codigos" : "todo", codigos: cods, valor: n(r.valor), min: 1 };
  return { id: "s:" + s(r.sheet_row), nombre, desde: ymd(r.desde), hasta: ymd(r.hasta), activa: s(r.activa).toUpperCase() !== "NO" && r.activa !== false, reglas: [regla], origen: "sheet", sheet_row: n(r.sheet_row) || null };
}
function promoDeFila(r: Row): PromoB {
  const reglas = (Array.isArray(r.reglas) ? r.reglas as Row[] : []).map(reglaDe).filter((x): x is Regla => typeof x !== "string");
  return { id: s(r.id), nombre: s(r.nombre), desde: ymd(r.desde), hasta: ymd(r.hasta), activa: r.activa !== false, reglas, origen: s(r.origen) || "beta", sheet_row: r.sheet_row == null ? null : n(r.sheet_row), notas: s(r.notas) };
}
/** Todas: beta + las de la hoja que todavía no se importaron. */
export async function todasPromos(ctx: Ctx): Promise<PromoB[]> {
  const beta = (await todas(ctx, "beta_promociones")).map(promoDeFila);
  const imp = new Set(beta.filter((p) => p.sheet_row != null).map((p) => p.sheet_row));
  const hoja = (await todas(ctx, "promos")).map(promoDeHoja).filter((p): p is PromoB => !!p && !imp.has(p.sheet_row));
  return [...beta, ...hoja];
}
export const vigente = (p: PromoB, hoy: string) => p.activa && !!p.desde && !!p.hasta && p.desde <= hoy && hoy <= p.hasta && p.reglas.length > 0;

async function nombresCat(ctx: Ctx, ses: Ses) {
  const cat = await catalogoTicket(ctx, ses);
  const por = new Map(cat.map((c) => [s(c.sku), c]));
  return { cat, por, nombreDe: (c: string) => s(por.get(skuCode(c))?.nombre) || c };
}

extend("promo_lista", "any", async (p, ctx, ses) => {
  const hoy = hoyEc(ctx), adm = esAdmin(ses.rol);
  const { nombreDe } = await nombresCat(ctx, ses);
  const todasP = await todasPromos(ctx);
  const vista = (x: PromoB) => ({ ...x, vigente: vigente(x, hoy), reglasTxt: x.reglas.map((r) => textoRegla(r, nombreDe)) });
  return { ok: true, admin: adm, hoy, falta: (await hay(ctx)) ? "" : FALTA, vigentes: todasP.filter((x) => vigente(x, hoy)).map(vista), todas: adm && p.todas ? todasP.map(vista) : [] };
});

extend("promo_calcular", "any", async (p, ctx, ses) => {
  const hoy = hoyEc(ctx);
  const { por, nombreDe } = await nombresCat(ctx, ses);
  const lineas: LineaP[] = (Array.isArray(p.lineas) ? p.lineas as Row[] : []).slice(0, 200).map((l, i) => {
    const c = por.get(skuCode(s(l.sku)));
    return { k: s(l.k) || String(i), sku: skuCode(s(l.sku)), nombre: s(l.nombre), tipo: s(l.tipo) || s(c?.tipo), cantidad: n(l.cantidad) || 1, bruto: round2(n(l.bruto)), marca: s(c?.marca), categoria: s(c?.categoria) };
  }).filter((l) => l.sku);
  const vig = (await todasPromos(ctx)).filter((x) => vigente(x, hoy));
  const ids = Array.isArray(p.ids) ? (p.ids as unknown[]).map(s) : [];
  const elegidas = ids.map((id) => vig.find((x) => x.id === id)).filter((x): x is PromoB => !!x);
  // Cada vigente sola (para decir cuáles aplican y cuánto) + la combinación elegida.
  const cada = vig.map((x) => { const r = aplicarPromos([x], lineas, nombreDe); return { id: x.id, nombre: x.nombre, origen: x.origen, reglasTxt: x.reglas.map((rr) => textoRegla(rr, nombreDe)), monto: r.descuento, motivo: r.noAplican[0] ? s(r.noAplican[0].motivo) : "" }; });
  return { ok: true, promos: cada, resultado: aplicarPromos(elegidas, lineas, nombreDe) };
});

extend("promo_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  if (!(await hay(ctx))) return { error: FALTA };
  const nombre = s(p.nombre).trim().slice(0, 120), desde = ymd(p.desde), hasta = ymd(p.hasta);
  if (!nombre) return { error: "Falta el nombre de la promo" };
  if (!desde || !hasta) return { error: "Faltan las fechas de vigencia" };
  if (desde > hasta) return { error: "«Desde» va antes de «Hasta»" };
  const reglas: Regla[] = [];
  for (const x of (Array.isArray(p.reglas) ? p.reglas as Row[] : []).slice(0, 40)) { const r = reglaDe(x); if (typeof r === "string") return { error: r }; reglas.push(r); }
  if (!reglas.length) return { error: "Agrega al menos una regla" };
  const actor = actorOf(ses), now = ctx.now.toISOString(), id = s(p.id);
  const filas = await todas(ctx, "beta_promociones");
  if (filas.some((r) => s(r.id) !== id && norm(r.nombre) === norm(nombre))) return { error: "Ya hay una promo con ese nombre" };
  const row: Row = { nombre, desde, hasta, activa: p.activa !== false, reglas, notas: s(p.notas).slice(0, 500) || null, updated_at: now };
  if (id && !id.startsWith("s:")) {
    const cur = filas.find((r) => s(r.id) === id); if (!cur) return { error: "Promo no encontrada" };
    row.historial = [...(Array.isArray(cur.historial) ? cur.historial as Row[] : []), { fecha: now, actor, accion: "editada", reglas: reglas.length }].slice(-50);
    await ctx.db.write(actor, "beta_promociones", "update", { id }, row);
    return { ok: true, id };
  }
  const nid = crypto.randomUUID();
  const sheet = id.startsWith("s:") ? n(id.slice(2)) || null : null;
  await ctx.db.write(actor, "beta_promociones", "insert", {}, { id: nid, ...row, origen: sheet ? "sheet" : "beta", sheet_row: sheet, creado_por: actor, created_at: now, historial: [{ fecha: now, actor, accion: sheet ? "importada del sistema" : "creada" }] });
  return { ok: true, id: nid };
});

extend("promo_activar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  if (!(await hay(ctx))) return { error: FALTA };
  const id = s(p.id), cur = (await todas(ctx, "beta_promociones")).find((r) => s(r.id) === id);
  if (!cur) return { error: "Promo no encontrada (las del sistema viejo se importan primero)" };
  const actor = actorOf(ses), now = ctx.now.toISOString(), act = p.activa === true;
  await ctx.db.write(actor, "beta_promociones", "update", { id }, { activa: act, updated_at: now, historial: [...(Array.isArray(cur.historial) ? cur.historial as Row[] : []), { fecha: now, actor, accion: act ? "activada" : "desactivada" }].slice(-50) });
  return { ok: true };
});

/** Importa a la beta las promos de la hoja que faltan (solo lectura de la hoja). Opcional: agruparlas en una promo con un nombre. */
extend("promo_importar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  if (!(await hay(ctx))) return { error: FALTA };
  const hoy = hoyEc(ctx), soloVig = p.todas !== true;
  const ya = new Set((await todas(ctx, "beta_promociones")).filter((r) => r.sheet_row != null).map((r) => n(r.sheet_row)));
  const hoja = (await todas(ctx, "promos")).map(promoDeHoja).filter((x): x is PromoB => !!x && !ya.has(n(x.sheet_row)) && (!soloVig || vigente(x, hoy)));
  const actor = actorOf(ses), now = ctx.now.toISOString();
  for (const x of hoja) {
    await ctx.db.write(actor, "beta_promociones", "insert", {}, { id: crypto.randomUUID(), nombre: x.nombre, desde: x.desde || hoy, hasta: x.hasta || hoy, activa: x.activa, reglas: x.reglas, origen: "sheet", sheet_row: x.sheet_row, creado_por: actor, created_at: now, updated_at: now, historial: [{ fecha: now, actor, accion: "importada del sistema" }] });
  }
  return { ok: true, importadas: hoja.length };
});
