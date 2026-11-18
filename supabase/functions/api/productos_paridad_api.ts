// Productos · paridad MineCore (0041). Todo es de la beta: columnas beta_* de erp_productos y
// app_archivos. Nada va a catalogo ni a la hoja. Escribe solo admin; leer pide Productos.
//   mcprod_estado            archivar / desarchivar / eliminar (borrado suave) / restaurar, por lote
//   mcprod_duplicar          copia con el siguiente SKU de la misma familia
//   mcprod_archivo_subir / mcprod_archivo / mcprod_archivo_quitar / mcprod_archivo_principal
//   mcprod_codigos_save / mcprod_codigo_interno   códigos de barras (EAN-13 e internos)
//   mcprod_escalas_save      escalas de precio (precio fijo o markup sobre costo)
//   mcprod_proveedores_save  proveedores del producto (código, precio, predeterminado)
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, guardarArchivo, logAccion } from "./lib.ts";
import { acceso, esAdmin, matrizDe } from "./permisos.ts";
import { s, type Row } from "./domain.ts";
import { runErp } from "./erp.ts";
import {
  FAMILIA_NUMERICA, arr, codigoBarrasNorm, codigoNorm, familiaDeCodigo, familiasDe, limpiarCodigos, limpiarEscalas,
  limpiarProveedores, siguienteCodigo, siguienteInterno,
} from "./productos.ts";

async function safeAll(ctx: Ctx, t: string): Promise<Row[]> {
  try { return await ctx.db.all(t); } catch { return []; }
}
async function puedeVer(ctx: Ctx, ses: Ses): Promise<boolean> {
  return esAdmin(ses.rol) || acceso(ses.rol, "productos", await matrizDe(ctx.db)) !== "no";
}
async function producto(ctx: Ctx, id: string): Promise<Row | undefined> {
  return (await safeAll(ctx, "erp_productos")).find((p) => s(p.id) === id);
}
function sello(ses: Ses, ctx: Ctx): Row {
  return { beta_editado_por: actorOf(ses), beta_editado_at: ctx.now.toISOString() };
}
const FALTA_0041 = "Falta aplicar 0041_productos_paridad.sql";
async function actualizar(ctx: Ctx, ses: Ses, id: string, row: Row): Promise<Row | { error: string }> {
  const saved = await ctx.db.write(actorOf(ses), "erp_productos", "update", { id }, { ...row, ...sello(ses, ctx) });
  if (!saved) return { error: "Producto no encontrado" };
  const k = Object.keys(row).find((x) => x.startsWith("beta_"));
  if (k && !(k in (saved as Row))) return { error: FALTA_0041 };
  return saved as Row;
}

extend("mcprod_estado", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin archiva o elimina productos" };
  const accion = s(p.que);
  const ids = (Array.isArray(p.ids) ? p.ids : [p.id]).map((x) => s(x)).filter(Boolean).slice(0, 300);
  if (!ids.length) return { error: "Elige al menos un producto" };
  const now = ctx.now.toISOString(), yo = actorOf(ses);
  const row: Row | null = accion === "archivar" ? { beta_archivado_at: now, beta_archivado_por: yo }
    : accion === "desarchivar" ? { beta_archivado_at: null, beta_archivado_por: null }
    : accion === "eliminar" ? { beta_eliminado_at: now, beta_eliminado_por: yo }
    : accion === "restaurar" ? { beta_eliminado_at: null, beta_eliminado_por: null }
    // Activo/Inactivo de la beta (0044 beta_activo): manda sobre el catálogo viejo y la sync no lo toca.
    : accion === "activar" || accion === "desactivar" ? { beta_activo: accion === "activar", beta_activo_por: yo, beta_activo_at: now, beta_activo_motivo: s(p.motivo).trim().slice(0, 300) || null } : null;
  if (!row) return { error: "Acción inválida" };
  if (accion === "eliminar" && s(p.confirmar) !== "ELIMINAR") return { error: "Escribe ELIMINAR para confirmar" };
  let ok = 0;
  for (const id of ids) {
    const r = await actualizar(ctx, ses, id, row);
    if ("error" in r && r.error) { if (r.error === FALTA_0041) return accion === "activar" || accion === "desactivar" ? { error: "Falta aplicar 0044_productos_presentacion.sql" } : r; continue; }
    ok++;
  }
  return { ok: true, accion, cambiados: ok };
});

extend("mcprod_duplicar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin copia productos" };
  const src = await producto(ctx, s(p.id));
  if (!src) return { error: "Producto no encontrado" };
  const [erp, cat, cab] = await Promise.all([safeAll(ctx, "erp_productos"), safeAll(ctx, "catalogo"), safeAll(ctx, "cabina_inventario")]);
  const existentes: { codigo: string; clase: string }[] = [];
  for (const r of erp) { const c = codigoNorm(r.sku); if (c) existentes.push({ codigo: c, clase: s(r.clase) }); }
  for (const r of cat) { const c = codigoNorm(r.sku); if (c) existentes.push({ codigo: c, clase: "catalogo" }); }
  for (const r of cab) for (const v of [r.codigo, r.sku_catalogo]) { const c = codigoNorm(v); if (c) existentes.push({ codigo: c, clase: "cabina" }); }
  const fam0 = familiaDeCodigo(src.sku);
  if (!fam0) return { error: "Este SKU no tiene familia; créalo con «Nuevo producto»" };
  const fam = familiasDe(existentes).find((f) => f.prefijo === fam0.prefijo);
  const codigos = existentes.map((x) => x.codigo);
  const sku = siguienteCodigo(fam0.prefijo, codigos, fam ? fam.ancho : fam0.prefijo === FAMILIA_NUMERICA ? 2 : 3);
  if (new Set(codigos).has(codigoNorm(sku))) return { error: "El código " + sku + " ya existe; vuelve a intentar" };
  const nombre = (s(p.nombre).trim() || s(src.nombre) + " (copia)").slice(0, 200);
  const out = await runErp("prod_save", {
    sku, nombre, marca: s(src.marca), categoria: s(src.categoria), clase: s(src.clase) || "producto",
    unidad: s(src.unidad) || "u", uso: ["cabina", "venta", "ambos"].includes(s(src.uso)) ? s(src.uso) : "venta",
    unidad_consumo: s(src.unidad_consumo), factor_consumo: src.factor_consumo, linea: s(src.linea), observaciones: s(src.observaciones),
    sku_proveedor: s(src.sku_proveedor), precio_venta: src.precio_venta ?? null, _rol: ses.rol,
  }, ctx.db, actorOf(ses), ctx.now);
  if (out.error) return out;
  const extra: Row = {};
  for (const k of ["beta_pvp", "beta_compra_real", "beta_compra_comision", "beta_descripcion", "beta_stock_minimo", "beta_punto_reorden", "beta_escalas", "beta_proveedores", "bodega_def", "sububicacion_def", "producto_base"]) {
    if (src[k] != null && src[k] !== "") extra[k] = src[k];
  }
  if (Object.keys(extra).length) await ctx.db.write(actorOf(ses), "erp_productos", "update", { id: s(out.id) }, { ...extra, ...sello(ses, ctx), beta_precio_motivo: "Copia de " + s(src.sku) });
  return { ok: true, id: out.id, sku, familia: fam0.prefijo, de: s(src.sku) };
});

// ---------- Fotos y archivos ----------
const MIMES = /^(image\/(jpeg|png|webp|gif)|application\/pdf|text\/(csv|plain)|application\/vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|application\/vnd\.ms-excel|application\/msword)$/;

extend("mcprod_archivo_subir", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin sube fotos y archivos" };
  const prod = await producto(ctx, s(p.id));
  if (!prod) return { error: "Producto no encontrado" };
  const data = s(p.data);
  const mime = data.startsWith("data:") ? data.slice(5, data.indexOf(";")) : "";
  if (!MIMES.test(mime)) return { error: "Tipo de archivo no permitido (fotos, PDF, Excel, Word, CSV)" };
  const tipo = mime.startsWith("image/") ? "foto" : "archivo";
  const nombre = (s(p.nombre).trim() || (tipo === "foto" ? "foto.jpg" : "archivo")).slice(0, 120);
  const aid = await guardarArchivo(ctx.db, actorOf(ses), tipo === "foto" ? "foto-producto" : "archivo-producto", nombre, data);
  if (!aid) return { error: "El archivo es demasiado grande (máx. ~1 MB)" };
  const lista = arr(prod.beta_archivos).concat([{ id: aid, nombre, mime, tipo, at: ctx.now.toISOString(), por: actorOf(ses) }]).slice(-60);
  const row: Row = { beta_archivos: lista };
  const thumb = s(p.thumb);
  if (tipo === "foto" && (!s(prod.foto_url) || p.principal === true)) {
    row.foto_url = "archivo:" + aid;
    if (thumb.startsWith("data:image/") && thumb.length < 60000) row.foto_thumb = thumb;
  }
  const r = await actualizar(ctx, ses, s(prod.id), row);
  if ("error" in r && r.error) return r;
  return { ok: true, archivo_id: aid, tipo };
});

extend("mcprod_archivo", "any", async (p, ctx, ses) => {
  if (!(await puedeVer(ctx, ses))) return { error: "No tienes permiso" };
  const matriz = await matrizDe(ctx.db);
  if (!esAdmin(ses.rol) && acceso(ses.rol, "descargas", matriz) === "no") return { error: "El personal no puede descargar archivos" };
  const prod = await producto(ctx, s(p.id));
  if (!prod) return { error: "Producto no encontrado" };
  const aid = s(p.archivo_id);
  const mio = arr(prod.beta_archivos).some((a) => s(a.id) === aid && !a.borrado) || s(prod.foto_url) === "archivo:" + aid;
  if (!aid || !mio) return { error: "Archivo no encontrado" };
  const a = (await safeAll(ctx, "app_archivos")).find((x) => s(x.id) === aid);
  if (!a || !s(a.data_b64)) return { error: "Archivo no encontrado" };
  return { ok: true, nombre: s(a.nombre), mime: s(a.mime), data: "data:" + (s(a.mime) || "application/octet-stream") + ";base64," + s(a.data_b64) };
});

extend("mcprod_archivo_quitar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin quita fotos y archivos" };
  const prod = await producto(ctx, s(p.id));
  if (!prod) return { error: "Producto no encontrado" };
  const aid = s(p.archivo_id);
  let hay = false;
  // No se borra el archivo: queda marcado (se puede recuperar desde app_archivos).
  const lista = arr(prod.beta_archivos).map((a) => { if (s(a.id) === aid) { hay = true; return { ...a, borrado: true, borrado_por: actorOf(ses), borrado_at: ctx.now.toISOString() }; } return a; });
  if (!hay) return { error: "Archivo no encontrado" };
  const row: Row = { beta_archivos: lista };
  if (s(prod.foto_url) === "archivo:" + aid) {
    const otra = lista.find((a) => !a.borrado && s(a.tipo) === "foto");
    row.foto_url = otra ? "archivo:" + s(otra.id) : null;
    row.foto_thumb = null;
  }
  const r = await actualizar(ctx, ses, s(prod.id), row);
  if ("error" in r && r.error) return r;
  return { ok: true };
});

extend("mcprod_archivo_principal", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin cambia la foto principal" };
  const prod = await producto(ctx, s(p.id));
  if (!prod) return { error: "Producto no encontrado" };
  const aid = s(p.archivo_id);
  const a = arr(prod.beta_archivos).find((x) => s(x.id) === aid && !x.borrado && s(x.tipo) === "foto");
  if (!a) return { error: "Esa foto no está en el producto" };
  const row: Row = { foto_url: "archivo:" + aid };
  const thumb = s(p.thumb);
  row.foto_thumb = thumb.startsWith("data:image/") && thumb.length < 60000 ? thumb : null;
  const r = await actualizar(ctx, ses, s(prod.id), row);
  if ("error" in r && r.error) return r;
  return { ok: true };
});

// ---------- Códigos de barras ----------
async function codigosDeOtros(ctx: Ctx, pid: string): Promise<Map<string, string>> {
  const usados = new Map<string, string>();
  for (const r of await safeAll(ctx, "erp_productos")) {
    if (s(r.id) === pid || s(r.beta_eliminado_at)) continue;
    const c = codigoBarrasNorm(r.codigo_barras);
    if (c) usados.set(c, s(r.sku));
    for (const x of arr(r.beta_codigos)) { const k = codigoBarrasNorm(x.codigo); if (k) usados.set(k, s(r.sku)); }
  }
  return usados;
}
extend("mcprod_codigos_save", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita códigos de barras" };
  const prod = await producto(ctx, s(p.id));
  if (!prod) return { error: "Producto no encontrado" };
  const { codigos, error } = limpiarCodigos(p.codigos);
  if (error) return { error };
  const otros = await codigosDeOtros(ctx, s(prod.id));
  for (const c of codigos) if (otros.has(c.codigo)) return { error: "El código " + c.codigo + " ya lo tiene " + otros.get(c.codigo) };
  const principal = codigos.find((c) => c.principal);
  const r = await actualizar(ctx, ses, s(prod.id), { beta_codigos: codigos, codigo_barras: principal ? principal.codigo : null });
  if ("error" in r && r.error) return r;
  return { ok: true, codigos };
});
extend("mcprod_codigo_interno", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin genera códigos" };
  const prod = await producto(ctx, s(p.id));
  if (!prod) return { error: "Producto no encontrado" };
  const todos = [...(await codigosDeOtros(ctx, "")).keys()];
  for (const x of arr(p.pendientes)) todos.push(codigoBarrasNorm(x));
  return { ok: true, codigo: siguienteInterno(todos) };
});

// «Generar código» (Emilia 17/11): asigna un EAN-13 interno Sunsu (prefijo 20, dígito de control válido)
// como código de barras principal. Nunca pisa un código que ya existe.
extend("mcprod_barras_generar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin genera códigos" };
  const prod = await producto(ctx, s(p.id));
  if (!prod) return { error: "Producto no encontrado" };
  const actual = codigoBarrasNorm(prod.codigo_barras);
  if (actual) return { error: "Este producto ya tiene código de barras (" + actual + "); no se reemplaza" };
  const todos = [...(await codigosDeOtros(ctx, "")).keys()];
  const codigo = siguienteInterno(todos);
  const previos = arr(prod.beta_codigos).map((c) => ({ ...c, principal: false }));
  const r = await actualizar(ctx, ses, s(prod.id), { codigo_barras: codigo, beta_codigos: [...previos, { codigo, tipo: "interno", principal: true }] });
  if ("error" in r && r.error) return r;
  return { ok: true, codigo };
});

// Presentaciones del mismo producto base (0044): lista de ids de otros productos.
extend("mcprod_presentaciones_save", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita productos" };
  const prods = await safeAll(ctx, "erp_productos");
  const prod = prods.find((x) => s(x.id) === s(p.id));
  if (!prod) return { error: "Producto no encontrado" };
  const ids = [...new Set(arr(p.ids).map((x) => s(x)))].filter((x) => x && x !== s(prod.id));
  for (const id of ids) if (!prods.some((x) => s(x.id) === id && !s(x.beta_eliminado_at))) return { error: "Producto no encontrado: " + id };
  if (ids.length > 20) return { error: "Máximo 20 presentaciones" };
  const saved = await ctx.db.write(actorOf(ses), "erp_productos", "update", { id: s(prod.id) }, { beta_presentaciones: ids, ...sello(ses, ctx) });
  if (!saved) return { error: "Producto no encontrado" };
  if (!("beta_presentaciones" in (saved as Row))) return { error: "Falta aplicar 0044_productos_presentacion.sql" };
  return { ok: true, ids };
});

// ---------- Escalas de precio y proveedores ----------
extend("mcprod_escalas_save", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita precios" };
  const prod = await producto(ctx, s(p.id));
  if (!prod) return { error: "Producto no encontrado" };
  const { escalas, error } = limpiarEscalas(p.escalas);
  if (error) return { error };
  const motivo = s(p.motivo).trim();
  if (motivo.length < 3) return { error: "El motivo es obligatorio para cambiar precios" };
  const r = await actualizar(ctx, ses, s(prod.id), { beta_escalas: escalas, beta_precio_motivo: motivo.slice(0, 300) });
  if ("error" in r && r.error) return r;
  return { ok: true, escalas };
});
extend("mcprod_proveedores_save", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita proveedores" };
  const prod = await producto(ctx, s(p.id));
  if (!prod) return { error: "Producto no encontrado" };
  const { proveedores, error } = limpiarProveedores(p.proveedores, await safeAll(ctx, "erp_proveedores"));
  if (error) return { error };
  const def = proveedores.find((x) => x.predeterminado);
  const row: Row = { beta_proveedores: proveedores };
  if (def && def.codigo) row.sku_proveedor = def.codigo;
  const r = await actualizar(ctx, ses, s(prod.id), row);
  if ("error" in r && r.error) return r;
  return { ok: true, proveedores };
});

// «+ Nueva presentación» (TK18b): crea el subcódigo HT-007-1, HT-007-2… del producto base, copia marca/categoría/uso/precios,
// guarda su contenido y envase, y enlaza las dos fichas. El producto base no se toca salvo la lista de presentaciones.
export function siguientePresentacion(base: string, existentes: string[]): string {
  const b = codigoNorm(base);
  let max = 0;
  const re = new RegExp("^" + b.replace(/[-]/g, "\\-") + "-(\\d+)$");
  for (const c of existentes) { const m = codigoNorm(c).match(re); if (m) max = Math.max(max, Number(m[1])); }
  return b + "-" + (max + 1);
}
extend("mcprod_presentacion_nueva", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin crea presentaciones" };
  const prods = await safeAll(ctx, "erp_productos");
  let src = prods.find((x) => s(x.id) === s(p.id));
  if (!src) return { error: "Producto no encontrado" };
  // Si se crea desde una presentación, el base es su producto_base (HT-007-1 → HT-007).
  const baseSku = s(src.producto_base) && prods.some((x) => codigoNorm(x.sku) === codigoNorm(src!.producto_base)) ? codigoNorm(src.producto_base) : codigoNorm(src.sku);
  if (!/^[A-Z]{1,6}-\d+$|^\d+$/.test(baseSku)) return { error: "El producto base debe tener un código como HT-007" };
  src = prods.find((x) => codigoNorm(x.sku) === baseSku) || src;
  const contenido = Number(String(p.contenido ?? "").replace(",", "."));
  const unidad = s(p.unidad);
  if (!(contenido > 0)) return { error: "Escribe el contenido (por ejemplo 50)" };
  if (!["g", "ml", "unidades"].includes(unidad)) return { error: "Elige la unidad: g, ml o unidades" };
  const envase = s(p.envase).trim().slice(0, 40);
  const sku = siguientePresentacion(baseSku, prods.map((x) => s(x.sku)));
  if (prods.some((x) => codigoNorm(x.sku) === sku)) return { error: "El código " + sku + " ya existe; vuelve a intentar" };
  const etq = (unidad === "unidades" ? contenido + " u" : contenido + unidad);
  const sinCont = s(src.nombre).replace(/\s*\d+(?:[.,]\d+)?\s*(ml|g|gr|u|pads?)\b/i, "").trim();
  const guion = sinCont.lastIndexOf(" - ");
  const auto = guion > 0 ? sinCont.slice(0, guion).trim() + " " + etq + sinCont.slice(guion) : sinCont + " " + etq;
  const nombre = (s(p.nombre).trim() || auto).slice(0, 200);
  const out = await runErp("prod_save", {
    sku, nombre, marca: s(src.marca), categoria: s(src.categoria), clase: s(src.clase) || "producto",
    unidad: s(src.unidad) || "u", uso: ["cabina", "venta", "ambos"].includes(s(src.uso)) ? s(src.uso) : "venta",
    linea: s(src.linea), sku_proveedor: s(p.sku_proveedor), precio_venta: null, _rol: ses.rol,
  }, ctx.db, actorOf(ses), ctx.now);
  if (out.error) return out;
  await ctx.db.write(actorOf(ses), "erp_productos", "update", { id: s(out.id) }, {
    producto_base: baseSku, beta_contenido: contenido, beta_contenido_unidad: unidad, beta_envase: envase || null,
    beta_presentaciones: [s(src.id)], ...sello(ses, ctx),
  });
  const ya = arr(src.beta_presentaciones).map((x) => s(x));
  await ctx.db.write(actorOf(ses), "erp_productos", "update", { id: s(src.id) }, { beta_presentaciones: [...new Set([...ya, s(out.id)])].slice(0, 20), ...sello(ses, ctx) });
  await logAccion(ctx.db, actorOf(ses), "PRODUCTO PRESENTACION", sku + " (" + etq + ") de " + baseSku);
  return { ok: true, id: out.id, sku, nombre };
});
