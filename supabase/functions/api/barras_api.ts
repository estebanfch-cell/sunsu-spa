// 🏷️ Códigos de barras (TK17, paridad MineCore): revisar todo el inventario, generar internos en lote,
// asignar un código escaneado a un producto. Las etiquetas se imprimen en el navegador.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { acceso, esAdmin, matrizDe } from "./permisos.ts";
import { s, type Row } from "./domain.ts";
import { listaProductos } from "./productos_api.ts";
import { codigoBarrasNorm, limpiarCodigos, siguienteInterno } from "./productos.ts";
import { revisarBarras } from "./barras.ts";

async function safeAll(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
async function puede(ctx: Ctx, ses: Ses) { return esAdmin(ses.rol) || acceso(ses.rol, "productos", await matrizDe(ctx.db)) !== "no"; }
function todosLosCodigos(prods: Row[]): string[] {
  const out: string[] = [];
  for (const r of prods) { if (s(r.beta_eliminado_at)) continue; const c = codigoBarrasNorm(r.codigo_barras); if (c) out.push(c); for (const x of (Array.isArray(r.beta_codigos) ? r.beta_codigos : []) as Row[]) { const k = codigoBarrasNorm(x.codigo); if (k) out.push(k); } }
  return out;
}

extend("barras_resumen", "any", async (_p, ctx, ses) => {
  if (!(await puede(ctx, ses))) return { error: "No tienes permiso" };
  const prods = (await listaProductos(ctx, ses)).filter((p) => p.tipo !== "servicio");
  const prob = revisarBarras(prods);
  const items = prods.map((p) => {
    const barras = [...new Set(((p.barras as unknown[]) || []).map(codigoBarrasNorm).filter(Boolean))];
    return { id: p.id, sku: p.sku, skuVisible: p.skuVisible, nombre: p.nombre, marca: p.marca, pvp: p.pvp, activo: p.activo !== false, archivado: !!p.archivado, stock: p.stock, barras, problemas: prob.get(s(p.id)) || [] };
  });
  const cuenta = (t: string) => items.filter((i) => i.problemas.some((x) => x.tipo === t)).length;
  return { ok: true, admin: esAdmin(ses.rol), items, total: items.length, sinCodigo: cuenta("sin_codigo"), invalidos: cuenta("ean_invalido"), repetidos: cuenta("repetido") };
});

/** Genera un EAN-13 interno (prefijo 20) para cada producto elegido que no tenga ningún código. Nunca pisa uno existente. */
extend("barras_generar_lote", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin genera códigos" };
  const ids = [...new Set((Array.isArray(p.ids) ? p.ids : []).map((x) => s(x)).filter(Boolean))].slice(0, 300);
  if (!ids.length) return { error: "Elige al menos un producto" };
  const prods = await safeAll(ctx, "erp_productos");
  const vista = await listaProductos(ctx, ses);
  const conCodigo = new Set(vista.filter((x) => ((x.barras as unknown[]) || []).length).map((x) => s(x.id)));
  const usados = [...todosLosCodigos(prods), ...vista.flatMap((x) => ((x.barras as unknown[]) || []).map(codigoBarrasNorm))];
  const hechos: Row[] = [], saltados: string[] = [];
  for (const id of ids) {
    const prod = prods.find((x) => s(x.id) === id && !s(x.beta_eliminado_at));
    if (!prod) { saltados.push(id); continue; }
    const tiene = codigoBarrasNorm(prod.codigo_barras) || (Array.isArray(prod.beta_codigos) && prod.beta_codigos.length);
    if (tiene || conCodigo.has(id)) { saltados.push(s(prod.sku)); continue; }
    const codigo = siguienteInterno(usados); usados.push(codigo);
    const saved = await ctx.db.write(actorOf(ses), "erp_productos", "update", { id }, { codigo_barras: codigo, beta_codigos: [{ codigo, tipo: "interno", principal: true }], beta_editado_por: actorOf(ses), beta_editado_at: ctx.now.toISOString() });
    if (!saved) { saltados.push(s(prod.sku)); continue; }
    hechos.push({ id, sku: s(prod.sku), codigo });
  }
  if (hechos.length) await logAccion(ctx.db, actorOf(ses), "CODIGOS GENERAR", hechos.map((h) => h.sku + "=" + h.codigo).join(", ").slice(0, 900));
  return { ok: true, hechos, saltados };
});

/** Código escaneado que no existe → se agrega como código adicional (o principal si no tenía) del producto elegido. */
extend("barras_asignar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita códigos de barras" };
  const codigo = codigoBarrasNorm(p.codigo);
  if (!codigo) return { error: "Falta el código" };
  const prods = await safeAll(ctx, "erp_productos");
  const prod = prods.find((x) => s(x.id) === s(p.id) && !s(x.beta_eliminado_at));
  if (!prod) return { error: "Producto no encontrado" };
  for (const o of prods) {
    if (s(o.id) === s(prod.id) || s(o.beta_eliminado_at)) continue;
    if (todosLosCodigos([o]).includes(codigo)) return { error: "El código " + codigo + " ya lo tiene " + s(o.sku) };
  }
  const previos = (Array.isArray(prod.beta_codigos) ? prod.beta_codigos : []) as Row[];
  const legado = codigoBarrasNorm(prod.codigo_barras);
  // Si solo tenía el código de la hoja de cabina, se conserva como principal.
  const hoja = previos.length || legado ? "" : codigoBarrasNorm(((await listaProductos(ctx, ses)).find((x) => s(x.id) === s(prod.id))?.barras as unknown[] || [])[0]);
  const base: Row[] = previos.length ? previos : legado ? [{ codigo: legado, principal: true }] : hoja ? [{ codigo: hoja, principal: true }] : [];
  if (base.some((x) => codigoBarrasNorm(x.codigo) === codigo)) return { ok: true, ya: true };
  const { codigos, error } = limpiarCodigos([...base, { codigo, principal: !base.length }]);
  if (error) return { error };
  const principal = codigos.find((c) => c.principal);
  const saved = await ctx.db.write(actorOf(ses), "erp_productos", "update", { id: s(prod.id) }, { beta_codigos: codigos, codigo_barras: principal ? principal.codigo : null, beta_editado_por: actorOf(ses), beta_editado_at: ctx.now.toISOString() });
  if (!saved) return { error: "No se pudo guardar" };
  await logAccion(ctx.db, actorOf(ses), "CODIGO ASIGNAR", s(prod.sku) + " ← " + codigo);
  return { ok: true, codigos };
});
