// Ajustes de stock de la beta (Emilia 17/11, como MineCore inv_docs tipo ajuste / stk_adjust).
// Admin aplica directo; quien tiene inventario o conteos completo crea el ajuste y queda pendiente hasta
// que un admin lo apruebe. Al aplicar, las diferencias van a beta_stock_movimientos (0046) y Productos las
// suma al stock del sistema. Nada en erp_stock, cabina_inventario ni la hoja.
// Editar un número de stock en la ficha del producto crea un ajuste (origen «ficha») con motivo y nota.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { acceso, esAdmin, matrizDe } from "./permisos.ts";
import { n, round2, s, type Row } from "./domain.ts";
import { GRUPO_NOMBRE, SUBS_CABINA } from "./productos.ts";
import { listaProductos } from "./productos_api.ts";
import { BODEGAS_CONTEO, bodegaNombre, difLinea, notificar } from "./conteo_fisico_api.ts";
import { disponibleEn } from "./transferencias_beta_api.ts";

const FALTA = "Falta aplicar 0047_ajustes_beta.sql";
/** Motivos de ajuste (lista de MineCore: app.adjustment_reasons). */
export const MOTIVOS_AJUSTE = ["Conteo físico", "Corrección", "Daño", "Vencido", "Pérdida / robo", "Uso interno", "Muestra / obsequio", "Devolución", "Otro"];
export const ESTADOS_AJ: Record<string, string> = { pendiente: "Pendiente de aprobación", aplicado: "Aplicado", rechazado: "Rechazado", cancelado: "Cancelado" };
/** Un conteo aprobado NO pasa a stock hasta que Emilia lo confirme (17/11). Cambiar a true cuando lo confirme. */
export const CONTEO_A_STOCK = false;

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
async function hay(ctx: Ctx): Promise<boolean> { try { await ctx.db.all("beta_ajustes"); return true; } catch { return false; } }
async function puede(ctx: Ctx, ses: Ses): Promise<boolean> {
  if (esAdmin(ses.rol)) return true;
  const m = await matrizDe(ctx.db);
  return acceso(ses.rol, "inventario", m) === "todos" || acceso(ses.rol, "conteos", m) === "todos";
}
function sigNumero(rows: Row[]): string {
  let max = 0;
  for (const r of rows) { const m = s(r.numero).match(/^AJ-(\d+)$/); if (m) max = Math.max(max, Number(m[1])); }
  return "AJ-" + String(max + 1).padStart(3, "0");
}
async function cargar(ctx: Ctx, id: string): Promise<{ a: Row; L: Row[] } | null> {
  const a = (await todas(ctx, "beta_ajustes")).find((x) => s(x.id) === id || s(x.numero) === id);
  if (!a) return null;
  const L = (await todas(ctx, "beta_ajuste_lineas")).filter((l) => s(l.ajuste_id) === s(a.id)).sort((x, y) => n(x.orden) - n(y.orden));
  return { a, L };
}
function vista(a: Row, L: Row[]): Row {
  return {
    id: a.id, numero: a.numero, bodega: s(a.bodega), sububicacion: s(a.sububicacion), bodegaNombre: bodegaNombre(s(a.bodega), s(a.sububicacion)),
    motivo: s(a.motivo), nota: s(a.nota), origen: s(a.origen), conteoId: s(a.conteo_id), estado: s(a.estado), estadoNombre: ESTADOS_AJ[s(a.estado)] || s(a.estado),
    creadoPor: s(a.creado_por), creadoAt: s(a.creado_at), aplicadoPor: s(a.aplicado_por), aplicadoAt: s(a.aplicado_at),
    rechazadoPor: s(a.rechazado_por), rechazadoAt: s(a.rechazado_at), motivoRechazo: s(a.motivo_rechazo),
    items: L.length, neto: round2(L.reduce((x, l) => x + n(l.diferencia), 0)),
    skus: L.map((l) => s(l.sku)).join(" "), nombres: L.map((l) => s(l.nombre)).join(" "),
  };
}
/** Escribe los movimientos del ajuste y lo marca aplicado. Revalida que nada quede en negativo. */
async function aplicar(ctx: Ctx, ses: Ses, a: Row, L: Row[]): Promise<Row> {
  const prods = await listaProductos(ctx, ses);
  const porId = new Map(prods.map((p) => [s(p.id), p]));
  const bod = s(a.bodega), sub = s(a.sububicacion), actor = actorOf(ses), now = ctx.now.toISOString();
  for (const l of L) {
    const p = porId.get(s(l.producto_id));
    const ahora = p ? disponibleEn(p, bod, sub) : 0;
    if (ahora + n(l.diferencia) < -1e-9) return { error: s(l.sku) + ": el ajuste deja stock negativo en " + bodegaNombre(bod, sub) + " (hay " + round2(ahora) + ")" };
  }
  for (const l of L) {
    const p = porId.get(s(l.producto_id));
    const ahora = p ? round2(disponibleEn(p, bod, sub)) : 0;
    if (Math.abs(ahora - n(l.antes)) > 1e-9) await ctx.db.write(actor, "beta_ajuste_lineas", "update", { id: l.id }, { antes: ahora, despues: round2(ahora + n(l.diferencia)) });
    await ctx.db.write(actor, "beta_stock_movimientos", "insert", {}, {
      id: crypto.randomUUID(), fecha: now, producto_id: s(l.producto_id), sku: s(l.sku), bodega: bod, sububicacion: sub || null, delta: round2(n(l.diferencia)),
      tipo: s(a.origen) === "conteo" ? "conteo" : "ajuste", doc_id: s(a.id), doc_numero: s(a.numero), actor, nota: s(a.motivo) + (s(a.nota) ? " · " + s(a.nota) : ""),
    });
  }
  await ctx.db.write(actor, "beta_ajustes", "update", { id: a.id }, { estado: "aplicado", aplicado_por: actor, aplicado_at: now, updated_at: now });
  return { ok: true, id: a.id, numero: a.numero, estado: "aplicado" };
}
/** Crea un ajuste. Líneas con `nuevo` (cantidad final) o `delta` (+/−). */
async function crear(ctx: Ctx, ses: Ses, p: Row, origen: "manual" | "ficha" | "conteo", conteoId = ""): Promise<Row> {
  if (!(await hay(ctx))) return { error: FALTA };
  const bodega = s(p.bodega).toUpperCase(), sub = bodega === "CABINA" ? s(p.sububicacion) : "";
  if (!(BODEGAS_CONTEO as readonly string[]).includes(bodega)) return { error: "Bodega inválida" };
  if (sub && !SUBS_CABINA.some((x) => x.codigo === sub)) return { error: "Sububicación inválida" };
  const motivo = s(p.motivo).trim();
  if (!MOTIVOS_AJUSTE.includes(motivo)) return { error: "Elige el motivo del ajuste" };
  const nota = s(p.nota).trim().slice(0, 500);
  if (motivo === "Otro" && !nota) return { error: "Con motivo «Otro» escribe una nota" };
  const prods = await listaProductos(ctx, ses);
  const porId = new Map(prods.map((x) => [s(x.id), x]));
  const L: Row[] = [], ya = new Set<string>();
  for (const x of (Array.isArray(p.lineas) ? p.lineas as Row[] : []).slice(0, 500)) {
    const pr = porId.get(s(x.producto_id));
    if (!pr || pr.tipo === "servicio") return { error: "Producto inválido" };
    if (ya.has(s(pr.id))) return { error: s(pr.skuVisible || pr.sku) + " está dos veces" };
    ya.add(s(pr.id));
    const antes = round2(disponibleEn(pr, bodega, sub));
    const tieneNuevo = x.nuevo != null && x.nuevo !== "";
    const dif = round2(tieneNuevo ? n(x.nuevo) - antes : n(x.delta));
    if (tieneNuevo && n(x.nuevo) < 0) return { error: s(pr.skuVisible || pr.sku) + ": la cantidad no puede ser negativa" };
    if (!Number.isFinite(dif) || Math.abs(dif) < 1e-9) continue;
    if (antes + dif < -1e-9) return { error: s(pr.skuVisible || pr.sku) + ": el ajuste deja stock negativo en " + bodegaNombre(bodega, sub) + " (hay " + antes + ")" };
    L.push({ producto_id: s(pr.id), sku: s(pr.skuVisible || pr.sku), nombre: s(pr.nombre), antes, despues: round2(antes + dif), diferencia: dif });
  }
  if (!L.length) return { error: "Sin diferencias para ajustar" };
  const actor = actorOf(ses), now = ctx.now.toISOString(), id = crypto.randomUUID();
  const numero = sigNumero(await todas(ctx, "beta_ajustes"));
  const a: Row = { id, numero, bodega, sububicacion: sub || null, motivo, nota: nota || null, origen, conteo_id: conteoId || null, estado: "pendiente", creado_por: actor, creado_at: now };
  await ctx.db.write(actor, "beta_ajustes", "insert", {}, a);
  let i = 0;
  const filas: Row[] = [];
  for (const l of L) { const f = { id: crypto.randomUUID(), ajuste_id: id, orden: ++i, ...l }; filas.push(f); await ctx.db.write(actor, "beta_ajuste_lineas", "insert", {}, f); }
  if (esAdmin(ses.rol)) return await aplicar(ctx, ses, a, filas);
  for (const u of (await todas(ctx, "usuarios")).filter((x) => esAdmin(s(x.rol)) && !x.bloqueado)) {
    await notificar(ctx, ses, s(u.id), "Ajuste para aprobar: " + numero, actor + " pidió un ajuste en " + bodegaNombre(bodega, sub) + " (" + motivo + ").", "#/m/ajustes/a/" + id, id, "ajuste_aprobar");
  }
  return { ok: true, id, numero, estado: "pendiente" };
}

extend("aj_meta", "any", async (_p, ctx, ses) => ({
  ok: true, motivos: MOTIVOS_AJUSTE, estados: ESTADOS_AJ, admin: esAdmin(ses.rol), puede: await puede(ctx, ses), conteoAStock: CONTEO_A_STOCK,
  bodegas: BODEGAS_CONTEO.map((b) => ({ id: b, nombre: GRUPO_NOMBRE[b] })), subsCabina: SUBS_CABINA.map((x) => ({ id: x.codigo, nombre: x.nombre })),
}));
extend("aj_list", "any", async (p, ctx, ses) => {
  if (!(await puede(ctx, ses))) return { error: "No tienes permiso" };
  if (!(await hay(ctx))) return { ok: true, items: [], falta: FALTA };
  const por = new Map<string, Row[]>();
  for (const l of await todas(ctx, "beta_ajuste_lineas")) { const k = s(l.ajuste_id); por.set(k, [...(por.get(k) || []), l]); }
  let items = (await todas(ctx, "beta_ajustes")).map((a) => vista(a, por.get(s(a.id)) || [])).sort((a, b) => s(b.creadoAt).localeCompare(s(a.creadoAt)));
  if (s(p.producto_id)) { const L = await todas(ctx, "beta_ajuste_lineas"); const ids = new Set(L.filter((l) => s(l.producto_id) === s(p.producto_id)).map((l) => s(l.ajuste_id))); items = items.filter((a) => ids.has(s(a.id))); }
  return { ok: true, items };
});
extend("aj_get", "any", async (p, ctx, ses) => {
  if (!(await puede(ctx, ses))) return { error: "No tienes permiso" };
  const r = await cargar(ctx, s(p.id));
  if (!r) return { error: (await hay(ctx)) ? "Ajuste no encontrado" : FALTA };
  const admin = esAdmin(ses.rol), pend = s(r.a.estado) === "pendiente";
  return {
    ok: true, ajuste: vista(r.a, r.L), admin,
    lineas: r.L.map((l) => ({ id: l.id, productoId: s(l.producto_id), sku: s(l.sku), nombre: s(l.nombre), antes: n(l.antes), despues: n(l.despues), diferencia: n(l.diferencia) })),
    puedeAprobar: admin && pend, puedeRechazar: admin && pend, puedeCancelar: pend && (admin || s(r.a.creado_por) === actorOf(ses)),
  };
});
extend("aj_crear", "any", async (p, ctx, ses) => {
  if (!(await puede(ctx, ses))) return { error: "No tienes permiso para ajustar stock" };
  return await crear(ctx, ses, p, s(p.origen) === "ficha" ? "ficha" : "manual");
});
extend("aj_revisar", "any", async (p, ctx, ses) => {
  const r = await cargar(ctx, s(p.id));
  if (!r) return { error: "Ajuste no encontrado" };
  if (s(r.a.estado) !== "pendiente") return { error: "El ajuste ya está " + s(r.a.estado) };
  const que = s(p.que), actor = actorOf(ses), now = ctx.now.toISOString();
  if (que === "cancelar") {
    if (!esAdmin(ses.rol) && s(r.a.creado_por) !== actor) return { error: "Solo quien lo pidió o un admin lo cancela" };
    await ctx.db.write(actor, "beta_ajustes", "update", { id: r.a.id }, { estado: "cancelado", rechazado_por: actor, rechazado_at: now, updated_at: now });
    return { ok: true };
  }
  if (!esAdmin(ses.rol)) return { error: "Solo un admin aprueba o rechaza ajustes" };
  if (que === "aprobar") return await aplicar(ctx, ses, r.a, r.L);
  if (que === "rechazar") {
    if (!s(p.motivo).trim()) return { error: "Escribe por qué se rechaza" };
    await ctx.db.write(actor, "beta_ajustes", "update", { id: r.a.id }, { estado: "rechazado", rechazado_por: actor, rechazado_at: now, motivo_rechazo: s(p.motivo).slice(0, 300), updated_at: now });
    return { ok: true };
  }
  return { error: "Acción inválida" };
});
/** Conteo aprobado → ajuste por las diferencias. Bloqueado hasta que Emilia confirme (CONTEO_A_STOCK). */
extend("aj_desde_conteo", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin" };
  if (!CONTEO_A_STOCK) return { error: "Todavía no: un conteo aprobado pasa a stock cuando Emilia lo confirme." };
  const c = (await todas(ctx, "beta_conteos")).find((x) => s(x.id) === s(p.id));
  if (!c || s(c.estado) !== "aprobado") return { error: "El conteo tiene que estar aprobado" };
  if (c.stock_aplicado === true) return { error: "Este conteo ya pasó a stock" };
  const L = (await todas(ctx, "beta_conteo_lineas")).filter((l) => s(l.conteo_id) === s(c.id));
  const r = await crear(ctx, ses, { bodega: c.bodega, sububicacion: c.sububicacion, motivo: "Conteo físico", nota: "Conteo " + s(c.numero), lineas: L.map((l) => ({ producto_id: l.producto_id, delta: difLinea(l) })) }, "conteo", s(c.id));
  if (r.ok) await ctx.db.write(actorOf(ses), "beta_conteos", "update", { id: c.id }, { stock_aplicado: true, updated_at: ctx.now.toISOString() });
  return r;
});
