// Productos estilo MineCore: una sola lista que une erp_productos (maestro beta),
// catalogo (precios del sistema viejo, lo pisa el sync de Sheets cada hora) y
// cabina_inventario (envases de Cabina y de la Oficina). Funciones puras: se prueban sin BD.
//
// Bodegas que se muestran (solo etiquetas, no se mueve stock):
//   Venta          <- VENTA (inventario principal del sistema viejo; clave interna CONSIGNACION)
//   Consignación   <- bodega CONSIGNACION (TK27, clave BCONSIG; stock del kardex erp_stock)
//   Bodega Cabina  <- CABINA, CAB2, CAB3 como sububicaciones Cabina 1/2/3
//   Bodega Oficina <- CASA (más los envases "en bodega" de cabina_inventario)

import { IVA, PCT_COMISION_PRODUCTO, n, productQtys, round2, s, invCorto, skuCode, type Row } from "./domain.ts";

export const BOD_VENTA = "11111111-1111-4111-8111-111111111111";
export const BOD_CABINA = "22222222-2222-4222-8222-222222222222";
export const BOD_CASA = "44444444-4444-4444-8444-444444444444";
export const BOD_CAB2 = "55555555-5555-4555-8555-555555555552";
export const BOD_CAB3 = "55555555-5555-4555-8555-555555555553";
export const BOD_CONSIG = "66666666-6666-4666-8666-666666666666";

// La clave CONSIGNACION es la bodega VENTA (así quedó en transferencias/ajustes/conteos de la beta);
// desde TK27 se llama «Venta» y la bodega CONSIGNACION real usa la clave BCONSIG.
export type Grupo = "CONSIGNACION" | "BCONSIG" | "CABINA" | "OFICINA" | "OTRA";
export const GRUPO_NOMBRE: Record<Grupo, string> = {
  CONSIGNACION: "Venta", BCONSIG: "Consignación", CABINA: "Bodega Cabina", OFICINA: "Bodega Oficina", OTRA: "Otra bodega",
};
export const SUBS_CABINA = [
  { codigo: "CABINA_1", nombre: "Cabina 1" },
  { codigo: "CABINA_2", nombre: "Cabina 2" },
  { codigo: "CABINA_3", nombre: "Cabina 3" },
] as const;

/** Bodega física de la beta → grupo y sububicación que se muestran. Compatibilidad: CAB2/CAB3 siguen existiendo. */
export function grupoDeBodega(b: Row | undefined, sub = ""): { grupo: Grupo; sub: string } {
  const id = s(b?.id);
  const cod = s(b?.codigo).toUpperCase();
  const tipo = s(b?.tipo).toLowerCase();
  const sb = s(sub).toUpperCase().replace(/\s+/g, "_");
  if (id === BOD_CONSIG || cod === "CONSIGNACION" || tipo === "consignacion") return { grupo: "BCONSIG", sub: "" };
  if (id === BOD_VENTA || cod === "VENTA" || tipo === "venta") return { grupo: "CONSIGNACION", sub: "" };
  if (id === BOD_CASA || cod === "CASA" || tipo === "casa") return { grupo: "OFICINA", sub: "" };
  if (id === BOD_CAB2 || cod === "CAB2") return { grupo: "CABINA", sub: "CABINA_2" };
  if (id === BOD_CAB3 || cod === "CAB3") return { grupo: "CABINA", sub: "CABINA_3" };
  if (id === BOD_CABINA || cod === "CABINA" || tipo === "cabina") {
    const m = sb.match(/^CABINA_?(\d+)$/);
    return { grupo: "CABINA", sub: m ? "CABINA_" + m[1] : "" };
  }
  return { grupo: "OTRA", sub: "" };
}

export type Tipo = "servicio" | "inventariable";
/** Servicio = faciales, add-ons, paquetes y gift cards. Inventariable = productos e insumos. */
export function tipoDe(cat: Row | undefined, erp: Row | undefined): { tipo: Tipo; subtipo: string } {
  const t = s(cat?.tipo).toUpperCase();
  const clase = s(erp?.clase).toLowerCase();
  if (t.includes("GIFT") || clase === "gift") return { tipo: "servicio", subtipo: "Gift card" };
  if (t.includes("PAQ") || t.includes("PACK") || clase === "paquete") return { tipo: "servicio", subtipo: "Paquete" };
  if (t.includes("ADD")) return { tipo: "servicio", subtipo: "Add-on" };
  if (t.includes("FACIAL")) return { tipo: "servicio", subtipo: t.includes("ESPECIAL") ? "Facial especial" : "Facial" };
  if (t.includes("SERV") || clase === "servicio") return { tipo: "servicio", subtipo: "Servicio" };
  if (!cat && s(erp?.legacy_tabla) === "cabina_inventario") return { tipo: "inventariable", subtipo: "Insumo cabina" };
  return { tipo: "inventariable", subtipo: "Producto" };
}

/**
 * SKU que se muestra. Los servicios (faciales, add-ons, paquetes, gift cards) se guardaron en
 * erp_productos como 01, 02…, pero el sistema viejo, el catálogo, historial_ventas, erp_servicios y
 * los protocolos siempre usaron SUNSU-01, SUNSU-02… (lo que ve contabilidad). Se muestra ese código
 * del catálogo, sin inventar nada: si el catálogo no lo tiene, queda el número. El número sigue
 * siendo el alias interno (tickets, paquetes, stock).
 */
export function skuVisible(code: string, tipo: string, cat: Row | undefined): { sku: string; alias: string } {
  const c = s(cat?.sku).trim().toUpperCase();
  if (tipo === "servicio" && /^\d+$/.test(code) && /^SUNSU-\d+$/.test(c) && c === "SUNSU-" + code) return { sku: c, alias: code };
  return { sku: code, alias: "" };
}

/** Marca: la de la ficha; si no, la del catálogo; si no, lo que va después de " - " en el nombre. */
export function marcaDe(erp: Row | undefined, cat: Row | undefined, nombre: string): { marca: string; deducida: boolean } {
  const orig = cat?.orig && typeof cat.orig === "object" ? cat.orig as Row : {};
  const m = s(erp?.marca) || s(cat?.marca) || s(orig.marca);
  if (m) return { marca: m, deducida: false };
  const i = nombre.lastIndexOf(" - ");
  if (i > 0 && nombre.length - i < 30) return { marca: nombre.slice(i + 3).trim(), deducida: true };
  return { marca: "", deducida: false };
}

export interface Precios {
  pvp: number;            // con IVA
  subtotal: number;       // sin IVA
  compraReal: number;     // entra a la utilidad (costo real; 0 si falta)
  compraComision: number; // entra solo a la comisión
  comision: number;       // por unidad
  utilidad: number;       // venta neta − costo real − comisión (por unidad, sin IVA)
  margenPct: number;
  faltaCosto: boolean;    // no hay costo real: no se inventa; la UI muestra «Falta costo»
  editadoBeta: string[];  // campos que vienen de la beta y no del sistema viejo
}

/** Utilidad de producto: subtotal de venta (sin IVA, con descuentos) − costo real − comisión pagada.
 *  Si no hay costo real (> 0) no se inventa uno: faltaCosto y utilidad 0. */
export function utilidadProducto(ventaNeta: number, costoReal: number | null | undefined, comision: number): { utilidad: number; faltaCosto: boolean; margenPct: number } {
  const venta = n(ventaNeta);
  const com = n(comision);
  if (costoReal == null || !(n(costoReal) > 0)) {
    return { utilidad: 0, faltaCosto: true, margenPct: 0 };
  }
  const utilidad = round2(venta - n(costoReal) - com);
  return { utilidad, faltaCosto: false, margenPct: venta > 0 ? round2(utilidad / venta * 100) : 0 };
}

export type FuenteCosto = "beta" | "oc" | "inventario";

/** Prioridad del costo real: override de ficha (beta_compra_real), luego última orden de compra, luego inventario_base.compra.
 *  Nunca usa precio_compra, compra_comision ni costo_promedio (ese último en producción copia el precio de comisión). */
export function costoRealElegido(opts: {
  beta?: unknown;
  oc?: { precio: number; fecha?: string } | null;
  inventario?: unknown;
}): { costo: number; fuente: FuenteCosto } | { costo: null; fuente: null } {
  if (opts.beta != null && opts.beta !== "" && n(opts.beta) > 0) return { costo: round2(n(opts.beta)), fuente: "beta" };
  if (opts.oc && n(opts.oc.precio) > 0) return { costo: round2(n(opts.oc.precio)), fuente: "oc" };
  if (opts.inventario != null && opts.inventario !== "" && n(opts.inventario) > 0) return { costo: round2(n(opts.inventario)), fuente: "inventario" };
  return { costo: null, fuente: null };
}

/** Fecha comparable YYYY-MM-DD; acepta ISO y DD/MM/YYYY de las OC de hoja. */
export function fechaIso(v: unknown): string {
  const t = s(v).trim();
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return t.slice(0, 10);
}

export function ponerPrecioOc(
  precios: Map<string, { precio: number; fecha: string }>,
  sku: string, precio: number, fecha: string,
): void {
  const code = skuCode(sku);
  const f = fechaIso(fecha);
  if (!code || !(n(precio) > 0)) return;
  const prev = precios.get(code);
  if (!prev || f >= prev.fecha) precios.set(code, { precio: n(precio), fecha: f });
}

/** Líneas de costo de una OC de hoja: fact, items y directa (no stock sugerido). */
export function cargarOcJson(precios: Map<string, { precio: number; fecha: string }>, json: unknown, fecha: unknown): void {
  let obj: unknown = json;
  if (typeof json === "string") { try { obj = JSON.parse(json); } catch { return; } }
  if (!obj || typeof obj !== "object") return;
  const r = obj as Row;
  for (const key of ["fact", "items", "directa"]) {
    const arr = r[key];
    if (!Array.isArray(arr)) continue;
    for (const ln of arr) {
      if (!ln || typeof ln !== "object") continue;
      const L = ln as Row;
      ponerPrecioOc(precios, s(L.sku), n(L.compra ?? L.precio ?? L.costo), s(fecha));
    }
  }
}

export interface SnapLinea {
  venta_neta: number;
  costo_real: number;
  compra_comision: number;
  comision: number;
  utilidad: number;
  falta_costo: boolean;
}

/** Snapshot de una línea al vender. ventaNeta ya viene sin IVA y con descuentos del ticket. */
export function snapProducto(opts: {
  tipo: string;
  ventaNeta: number;
  qty: number;
  costoRealUnit: number | null | undefined;
  compraComisionUnit: number;
  excluir?: boolean;
}): SnapLinea {
  const venta = round2(n(opts.ventaNeta));
  if (s(opts.tipo) !== "producto") {
    return { venta_neta: venta, costo_real: 0, compra_comision: 0, comision: 0, utilidad: 0, falta_costo: false };
  }
  const qty = n(opts.qty) || 1;
  const compraLinea = round2(n(opts.compraComisionUnit) * qty);
  const comision = opts.excluir ? 0 : comisionUnidad(venta, compraLinea);
  const costoLinea = opts.costoRealUnit != null && n(opts.costoRealUnit) > 0 ? round2(n(opts.costoRealUnit) * qty) : null;
  const u = utilidadProducto(venta, costoLinea, comision);
  return {
    venta_neta: venta,
    costo_real: costoLinea ?? 0,
    compra_comision: compraLinea,
    comision,
    utilidad: u.utilidad,
    falta_costo: u.faltaCosto,
  };
}

/** Reparte el total del ticket (con IVA, ya con promo y descuento de cabecera) a cada línea y lo pasa a neto sin IVA. */
export function ventaNetaLineas(lineas: { total_linea: number }[], totalConIva: number, iva = IVA): number[] {
  const suma = lineas.reduce((a, l) => a + n(l.total_linea), 0);
  const tot = n(totalConIva);
  const factor = iva > 0 ? iva : 1.15;
  return lineas.map((l) => {
    if (!(suma > 0)) return 0;
    return round2((n(l.total_linea) / suma) * tot / factor);
  });
}

/**
 * Comisión = 30 % × max(0, subtotal sin IVA − compra para comisiones).
 * compra para comisiones = catalogo.compra_comision, o catalogo.precio_compra si está vacía.
 * Utilidad = subtotal − costo real − comisión. compraBase es el costo real (OC / inventario);
 * no se usa precio_compra ni costo_promedio como costo real. Sin costo real → faltaCosto.
 */
export function preciosDe(cat: Row | undefined, erp: Row | undefined, compraBase: number): Precios {
  const editado: string[] = [];
  let subtotal = n(cat?.subtotal);
  let pvp = n(cat?.total_con_iva) || round2(subtotal * IVA);
  if (!cat && erp?.precio_venta != null) { pvp = n(erp.precio_venta); subtotal = round2(pvp / IVA); }
  if (erp?.beta_pvp != null && erp.beta_pvp !== "") {
    pvp = n(erp.beta_pvp); subtotal = round2(pvp / IVA); editado.push("pvp");
  }
  let compraComision = cat ? (cat.compra_comision != null && cat.compra_comision !== "" ? n(cat.compra_comision) : n(cat.precio_compra)) : 0;
  if (erp?.beta_compra_comision != null && erp.beta_compra_comision !== "") { compraComision = n(erp.beta_compra_comision); editado.push("compraComision"); }
  let compraReal = n(compraBase) > 0 ? n(compraBase) : 0;
  if (erp?.beta_compra_real != null && erp.beta_compra_real !== "" && n(erp.beta_compra_real) > 0) {
    compraReal = n(erp.beta_compra_real); editado.push("compraReal");
  }
  const comision = comisionUnidad(subtotal, compraComision);
  const u = utilidadProducto(subtotal, compraReal > 0 ? compraReal : null, comision);
  return { pvp: round2(pvp), subtotal: round2(subtotal), compraReal: round2(compraReal), compraComision: round2(compraComision), comision, utilidad: u.utilidad, margenPct: u.margenPct, faltaCosto: u.faltaCosto, editadoBeta: editado };
}

export function comisionUnidad(subtotal: number, compraComision: number, pct = PCT_COMISION_PRODUCTO): number {
  return round2(Math.max(0, n(subtotal) - n(compraComision)) * pct);
}

export interface StockSub { codigo: string; nombre: string; cantidad: number }
export interface StockGrupo { grupo: Grupo; nombre: string; cantidad: number; subs: StockSub[]; nota?: string; abierto?: number; unidad?: string; beta?: number }

/**
 * Stock por bodega para la ficha.
 *  - Consignación: el stock de venta del sistema viejo (corte + tickets + entradas) si viene; si no, erp_stock VENTA.
 *  - Bodega Cabina: envases cerrados de cabina_inventario si la fila existe; si no, erp_stock de CABINA/CAB2/CAB3.
 *    Sububicaciones Cabina 1/2/3 salen de erp_stock (sububicacion CABINA_n o bodegas CAB2/CAB3). Lo que no tiene
 *    cabina asignada queda en "Sin cabina asignada". No se inventa a qué cabina pertenece.
 *  - Bodega Oficina: envases "en bodega" de cabina_inventario + erp_stock CASA.
 */
/** consigVendido (TK27): lo que se vendió desde la bodega CONSIGNACION. El cálculo viejo de Venta resta
 *  todos los tickets; esas unidades no salieron de Venta, así que se le devuelven a Venta. */
export function stockDe(opts: { ventaLegacy?: number | null; cab?: Row; erpStock: Row[]; bodegas: Row[]; consigVendido?: number }): StockGrupo[] {
  const bod = new Map(opts.bodegas.map((b) => [s(b.id), b]));
  const erp: Record<Grupo, number> = { CONSIGNACION: 0, BCONSIG: 0, CABINA: 0, OFICINA: 0, OTRA: 0 };
  const subQ: Record<string, number> = {};
  for (const r of opts.erpStock) {
    const g = grupoDeBodega(bod.get(s(r.bodega_id)), s(r.sububicacion));
    erp[g.grupo] += n(r.cantidad);
    if (g.grupo === "CABINA" && g.sub) subQ[g.sub] = (subQ[g.sub] || 0) + n(r.cantidad);
  }
  const out: StockGrupo[] = [];
  const consig = opts.ventaLegacy != null ? n(opts.ventaLegacy) + n(opts.consigVendido) : erp.CONSIGNACION;
  out.push({ grupo: "CONSIGNACION", nombre: GRUPO_NOMBRE.CONSIGNACION, cantidad: round2(consig), subs: [], nota: "bodega VENTA" });
  out.push({ grupo: "BCONSIG", nombre: GRUPO_NOMBRE.BCONSIG, cantidad: round2(erp.BCONSIG), subs: [], nota: "bodega CONSIGNACION" });
  const cab = opts.cab;
  const cabTotal = cab ? n(cab.envases_cerrados) : erp.CABINA;
  const cabinas = SUBS_CABINA.map((x) => ({ codigo: x.codigo, nombre: x.nombre as string }));
  for (const k of Object.keys(subQ)) {
    if (!cabinas.some((x) => x.codigo === k)) cabinas.push({ codigo: k, nombre: k.replace(/^CABINA_/, "Cabina ") });
  }
  const subs: StockSub[] = cabinas.map((x) => ({ codigo: x.codigo, nombre: x.nombre, cantidad: round2(subQ[x.codigo] || 0) }));
  const asignado = subs.reduce((a, x) => a + x.cantidad, 0);
  subs.push({ codigo: "", nombre: "Sin cabina asignada", cantidad: round2(Math.max(0, cabTotal - asignado)) });
  out.push({
    grupo: "CABINA", nombre: GRUPO_NOMBRE.CABINA, cantidad: round2(Math.max(cabTotal, asignado)), subs,
    nota: cab ? "envases cerrados (Cabina del sistema actual)" : "CABINA / CAB2 / CAB3",
    abierto: cab ? n(cab.abierto_restante) : undefined, unidad: cab ? s(cab.unidad) : undefined,
  });
  const ofi = (cab ? n(cab.bodega_cerrados) : 0) + erp.OFICINA;
  out.push({ grupo: "OFICINA", nombre: GRUPO_NOMBRE.OFICINA, cantidad: round2(ofi), subs: [], nota: "bodega CASA" });
  if (erp.OTRA) out.push({ grupo: "OTRA", nombre: GRUPO_NOMBRE.OTRA, cantidad: round2(erp.OTRA), subs: [] });
  return out;
}

export function stockTotal(g: StockGrupo[]): number {
  return round2(g.reduce((a, x) => a + n(x.cantidad), 0));
}

export function estadoStock(total: number, minimo: number): "agotado" | "bajo" | "ok" {
  if (total <= 0) return "agotado";
  if (minimo > 0 && total <= minimo) return "bajo";
  return "ok";
}

/** Código de cabina_inventario que une con el catálogo: sku_catalogo si lo tiene, si no su código INV-###. */
export function codigoCabina(k: Row): string {
  return skuCode(s(k.sku_catalogo) || s(k.codigo));
}

/** Busca líneas de un producto dentro de una OC vieja (json libre de la hoja). */
export function lineasOcLegacy(json: unknown, code: string): { qty: number; precio: number }[] {
  let obj: unknown = json;
  if (typeof json === "string") { try { obj = JSON.parse(json); } catch { return []; } }
  const out: { qty: number; precio: number }[] = [];
  const walk = (v: unknown, depth: number) => {
    if (!v || depth > 6) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (typeof v !== "object") return;
    const r = v as Row;
    if (r.sku != null && skuCode(s(r.sku)) === code) {
      const qty = n(r.cantidad ?? r.pedir ?? r.qty ?? r.cant ?? r.vendido);
      out.push({ qty, precio: n(r.compra ?? r.precio ?? r.costo) });
      return;
    }
    for (const x of Object.values(r)) if (x && typeof x === "object") walk(x, depth + 1);
  };
  walk(obj, 0);
  return out;
}

/** Campos que la ficha deja editar. Todo va a columnas de erp_productos (la beta es dueña), nunca a catalogo. */
export const CAMPOS_EDITABLES: Record<string, "text" | "num" | "bool"> = {
  nombre: "text", marca: "text", categoria: "text", linea: "text", sku_proveedor: "text", codigo_barras: "text",
  unidad: "text", observaciones: "text", producto_base: "text", bodega_def: "text", sububicacion_def: "text",
  activo: "bool", beta_pvp: "num", beta_compra_real: "num", beta_compra_comision: "num",
  beta_descripcion: "text", beta_stock_minimo: "num", beta_punto_reorden: "num",
  // Presentación / envase (0044): para costo por g/ml.
  beta_contenido: "num", beta_contenido_unidad: "text", beta_envase: "text", beta_unidades_empaque: "num",
};
export const UNIDADES_CONTENIDO = ["g", "ml", "unidades"];
export const ENVASES = ["frasco", "tubo", "ampolla", "sachet", "caja", "pote", "botella", "spray", "gotero", "sobre", "otro"];
/** Costo por g/ml/unidad del contenido: compra real ÷ contenido del envase. Null si falta algo. */
export function costoPorContenido(compraReal: unknown, contenido: unknown): number | null {
  const c = n(compraReal), q = n(contenido);
  if (!(c > 0) || !(q > 0)) return null;
  return Math.round(c / q * 10000) / 10000;
}
export const CAMPOS_COSTO = new Set(["beta_compra_real", "beta_compra_comision"]);

export function limpiarCambios(cambios: Row): { row: Row; error?: string } {
  const row: Row = {};
  for (const [k, v] of Object.entries(cambios || {})) {
    const t = CAMPOS_EDITABLES[k];
    if (!t) return { row: {}, error: "Campo no editable: " + k };
    if (t === "num") {
      if (v === "" || v == null) { row[k] = null; continue; }
      const x = Number(String(v).replace(",", "."));
      if (!Number.isFinite(x) || x < 0) return { row: {}, error: "Valor inválido en " + k };
      row[k] = round2(x);
    } else if (t === "bool") row[k] = !(v === false || v === "false" || v === "NO" || v === 0);
    else row[k] = s(v).trim();
  }
  if ("nombre" in row && !row.nombre) return { row: {}, error: "El nombre es obligatorio" };
  return { row };
}

// ---------- Familias de SKU ----------
// Los SKU que ya existen no se tocan nunca. Un producto nuevo elige una familia (el prefijo
// que ya usan los SKU: ML-, VK-, INV-… o la serie numérica 01, 02… de los servicios) y el
// servidor le da el siguiente código libre después del mayor de esa familia.

/** Código comparable: mayúsculas, sin espacios y sin el «SUNSU-» del catálogo. */
export function codigoNorm(v: unknown): string {
  return invCorto(String(v ?? "").trim().toUpperCase().replace(/\s+/g, "").replace(/^SUNSU-/, ""));
}

/** Prefijo «#» = serie numérica (01, 02…). */
export const FAMILIA_NUMERICA = "#";

export function familiaDeCodigo(v: unknown): { prefijo: string; num: number; ancho: number } | null {
  const c = codigoNorm(v);
  let m = c.match(/^([A-Z]{1,6}-)(\d+)$/);
  if (m) return { prefijo: m[1], num: Number(m[2]), ancho: m[2].length };
  m = c.match(/^(\d+)$/);
  if (m) return { prefijo: FAMILIA_NUMERICA, num: Number(m[1]), ancho: m[1].length };
  return null;
}

/** Un prefijo nuevo: 2 a 5 letras y un guion (ej. «KR-»). */
export function prefijoNormal(v: unknown): string {
  const p = String(v ?? "").trim().toUpperCase();
  if (p === FAMILIA_NUMERICA) return p;
  const conGuion = p.endsWith("-") ? p : p + "-";
  return /^[A-Z]{2,5}-$/.test(conGuion) ? conGuion : "";
}

export type Familia = { prefijo: string; etiqueta: string; total: number; max: number; ancho: number; ejemplo: string; siguiente: string; clases: Record<string, number> };

/** Siguiente código libre de la familia: mayor + 1, saltando cualquiera que ya exista. */
export function siguienteCodigo(prefijo: string, codigos: Iterable<string>, anchoMin?: number): string {
  const usados = new Set<string>();
  let max = 0;
  let ancho = anchoMin || (prefijo === FAMILIA_NUMERICA ? 2 : 3);
  for (const c of codigos) {
    const k = codigoNorm(c);
    usados.add(k);
    const f = familiaDeCodigo(k);
    if (f && f.prefijo === prefijo) { if (f.num > max) max = f.num; if (f.ancho > ancho && !anchoMin) ancho = f.ancho; }
  }
  const armar = (x: number) => (prefijo === FAMILIA_NUMERICA ? "" : prefijo) + String(x).padStart(ancho, "0");
  let x = max + 1;
  while (usados.has(armar(x))) x++;
  return armar(x);
}

/** Familias detectadas en los códigos existentes, con cuántos SKU tiene cada una. */
export function familiasDe(items: { codigo: unknown; clase?: unknown }[]): Familia[] {
  const map = new Map<string, { codigos: Set<string>; max: number; ancho: number; clases: Record<string, number> }>();
  const todos: string[] = [];
  for (const it of items) {
    const c = codigoNorm(it.codigo);
    if (!c) continue;
    todos.push(c);
    const f = familiaDeCodigo(c);
    if (!f) continue;
    const g = map.get(f.prefijo) || { codigos: new Set<string>(), max: 0, ancho: 0, clases: {} };
    if (!g.codigos.has(c)) {
      g.codigos.add(c);
      const cl = String(it.clase || "") || "sin clase";
      g.clases[cl] = (g.clases[cl] || 0) + 1;
    }
    if (f.num > g.max) g.max = f.num;
    if (f.ancho > g.ancho) g.ancho = f.ancho;
    map.set(f.prefijo, g);
  }
  const out: Familia[] = [];
  for (const [prefijo, g] of map) {
    const ejemplo = (prefijo === FAMILIA_NUMERICA ? "" : prefijo) + String(g.max).padStart(g.ancho, "0");
    out.push({
      prefijo, etiqueta: prefijo === FAMILIA_NUMERICA ? "Numérica (01, 02…)" : prefijo + "###",
      total: g.codigos.size, max: g.max, ancho: g.ancho, ejemplo, siguiente: siguienteCodigo(prefijo, todos, g.ancho), clases: g.clases,
    });
  }
  return out.sort((a, b) => b.total - a.total || a.prefijo.localeCompare(b.prefijo));
}

// ---------- Paridad MineCore (0041): códigos de barras, escalas, proveedores, archivos ----------

/** Dígito de control EAN-13 para los 12 primeros dígitos. */
export function ean13Control(doce: string): number {
  let t = 0;
  for (let i = 0; i < 12; i++) t += Number(doce[i]) * (i % 2 ? 3 : 1);
  return (10 - (t % 10)) % 10;
}
export function ean13Valido(c: string): boolean {
  return /^\d{13}$/.test(c) && ean13Control(c.slice(0, 12)) === Number(c[12]);
}
/** Código interno EAN-13 de uso en tienda (prefijo 20, rango GS1 reservado para uso interno). */
export function siguienteInterno(existentes: string[]): string {
  let max = 0;
  for (const c of existentes) if (/^20\d{11}$/.test(c)) max = Math.max(max, Number(c.slice(2, 12)));
  const doce = "20" + String(max + 1).padStart(10, "0");
  return doce + ean13Control(doce);
}
/** Normaliza un código leído (los de la hoja vienen como 8809937360834.0). */
export function codigoBarrasNorm(v: unknown): string {
  return String(v ?? "").trim().replace(/\.0+$/, "").replace(/\s+/g, "");
}
export type CodigoBarras = { codigo: string; tipo: "ean13" | "interno" | "otro"; principal: boolean };
export function limpiarCodigos(v: unknown): { codigos: CodigoBarras[]; error?: string } {
  const L = Array.isArray(v) ? v : [];
  const out: CodigoBarras[] = [];
  for (const x of L as Row[]) {
    const codigo = codigoBarrasNorm(x?.codigo);
    if (!codigo) continue;
    if (codigo.length > 40 || !/^[0-9A-Za-z\-.]+$/.test(codigo)) return { codigos: [], error: "Código inválido: " + codigo };
    let tipo = (s(x?.tipo) || (/^\d{13}$/.test(codigo) ? "ean13" : "otro")) as CodigoBarras["tipo"];
    if (!["ean13", "interno", "otro"].includes(tipo)) tipo = "otro";
    if ((tipo === "ean13" || tipo === "interno") && !ean13Valido(codigo)) return { codigos: [], error: "El EAN-13 " + codigo + " no cuadra (dígito de control)" };
    if (out.some((y) => y.codigo === codigo)) return { codigos: [], error: "Código repetido: " + codigo };
    out.push({ codigo, tipo, principal: x?.principal === true });
  }
  if (out.length && !out.some((x) => x.principal)) out[0].principal = true;
  let vis = false;
  for (const x of out) { if (x.principal && vis) x.principal = false; if (x.principal) vis = true; }
  return { codigos: out.slice(0, 20) };
}
export type Escala = { nombre: string; desde: number; precio: number | null; markup: number | null };
export function limpiarEscalas(v: unknown): { escalas: Escala[]; error?: string } {
  const out: Escala[] = [];
  for (const x of (Array.isArray(v) ? v : []) as Row[]) {
    const nombre = s(x?.nombre).trim().slice(0, 60);
    const desde = Number(x?.desde ?? 1);
    const precio = x?.precio === "" || x?.precio == null ? null : Number(String(x.precio).replace(",", "."));
    const markup = x?.markup === "" || x?.markup == null ? null : Number(String(x.markup).replace(",", "."));
    if (!nombre && precio == null && markup == null) continue;
    if (!nombre) return { escalas: [], error: "Cada escala necesita un nombre (por ejemplo Mayorista)" };
    if (!Number.isFinite(desde) || desde < 1) return { escalas: [], error: "«Desde» va de 1 en adelante en " + nombre };
    if (precio == null && markup == null) return { escalas: [], error: "Pon precio o markup en " + nombre };
    if (precio != null && (!Number.isFinite(precio) || precio < 0)) return { escalas: [], error: "Precio inválido en " + nombre };
    if (markup != null && (!Number.isFinite(markup) || markup < -100 || markup > 1000)) return { escalas: [], error: "Markup inválido en " + nombre };
    out.push({ nombre, desde: Math.floor(desde), precio: precio == null ? null : round2(precio), markup: markup == null ? null : round2(markup) });
  }
  out.sort((a, b) => a.desde - b.desde || a.nombre.localeCompare(b.nombre));
  return { escalas: out.slice(0, 20) };
}
/** Precio de una escala: el fijo, o costo × (1 + markup %). Con IVA 15 % para mostrarlo como PVP. */
export function precioEscala(e: Escala, costo: number, iva = 0.15): number | null {
  if (e.precio != null) return e.precio;
  if (e.markup == null || !(costo > 0)) return null;
  return round2(costo * (1 + e.markup / 100) * (1 + iva));
}
export type ProvProducto = { proveedor_id: string; proveedor: string; codigo: string; precio: number | null; predeterminado: boolean };
export function limpiarProveedores(v: unknown, catalogo: Row[]): { proveedores: ProvProducto[]; error?: string } {
  const byId = new Map(catalogo.map((p) => [s(p.id), p]));
  const out: ProvProducto[] = [];
  for (const x of (Array.isArray(v) ? v : []) as Row[]) {
    const id = s(x?.proveedor_id);
    const nombre = s(x?.proveedor).trim();
    if (!id && !nombre) continue;
    const p = id ? byId.get(id) : undefined;
    if (id && !p) return { proveedores: [], error: "Proveedor no encontrado" };
    const precio = x?.precio === "" || x?.precio == null ? null : Number(String(x.precio).replace(",", "."));
    if (precio != null && (!Number.isFinite(precio) || precio < 0)) return { proveedores: [], error: "Precio inválido" };
    const key = id || nombre.toLowerCase();
    if (out.some((y) => (y.proveedor_id || y.proveedor.toLowerCase()) === key)) return { proveedores: [], error: "Proveedor repetido: " + (p ? s(p.nombre) : nombre) };
    out.push({ proveedor_id: id, proveedor: p ? s(p.nombre) : nombre.slice(0, 80), codigo: s(x?.codigo).trim().slice(0, 60), precio: precio == null ? null : round2(precio), predeterminado: x?.predeterminado === true });
  }
  let vis = false;
  for (const x of out) { if (x.predeterminado && vis) x.predeterminado = false; if (x.predeterminado) vis = true; }
  if (out.length && !vis) out[0].predeterminado = true;
  return { proveedores: out.slice(0, 20) };
}
/** jsonb de la fila → arreglo (llega como texto en algunos lectores). */
export function arr(v: unknown): Row[] {
  if (Array.isArray(v)) return v as Row[];
  if (typeof v === "string" && v.trim().startsWith("[")) { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } }
  return [];
}

/**
 * Líneas de un ticket viejo con su precio de lista (con IVA) y lo cobrado por línea.
 * Los tickets de la hoja no guardan precio por línea (revisado 17/11: tickets, orig, historial_ventas,
 * erp_ordenes_venta con total 0, v_ticket_productos usa el catálogo). Por eso:
 *  - si el ticket tiene una sola línea, lo cobrado es real: total del ticket ÷ cantidad;
 *  - si tiene varias, se prorratea el total cobrado según el precio de lista ("estimado").
 * Un facial usado de un paquete ("SI, 2/3") no se cobra en ese ticket y no entra al prorrateo.
 */
export type LineaTicket = { codigo: string; qty: number; lista: number; tipo: "producto" | "facial" | "extra" | "paquete" | "gift" };
export function lineasTicket(t: Row, pvpDe: (codigo: string) => number): LineaTicket[] {
  const out: LineaTicket[] = [];
  const sunsu = (v: unknown) => [...s(v).toUpperCase().matchAll(/SUNSU-\d+/g)].map((m) => skuCode(m[0]));
  for (const x of productQtys(t)) out.push({ codigo: skuCode(x.sku), qty: x.qty, lista: pvpDe(skuCode(x.sku)), tipo: "producto" });
  const usoPaquete = /^\s*SI\b/i.test(s(t.paquete)) && !s(t.compra_pack_3) && !s(t.compra_pack_6);
  const fac = sunsu(t.facial_hecho)[0] || sunsu(t.fac)[0];
  if (fac) out.push({ codigo: fac, qty: 1, lista: usoPaquete ? 0 : pvpDe(fac), tipo: "facial" });
  for (const c of sunsu(t.servicios_adicionales)) out.push({ codigo: c, qty: 1, lista: pvpDe(c), tipo: "extra" });
  for (const c of [...sunsu(t.compra_pack_3), ...sunsu(t.compra_pack_6)]) out.push({ codigo: c, qty: 1, lista: pvpDe(c), tipo: "paquete" });
  if (/^\s*SI\b/i.test(s(t.venta_gift))) out.push({ codigo: "GIFT", qty: 1, lista: pvpDe(skuCode("SUNSU-34")) || 65, tipo: "gift" });
  return out;
}

/** Precio unitario cobrado (con IVA) de `codigo` en el ticket: real si es la única línea, si no prorrateado. */
export function precioLineaTicket(lineas: LineaTicket[], codigo: string, totalCobrado: number): { unit: number | null; total: number | null; estimado: boolean } {
  const mia = lineas.filter((l) => l.codigo === codigo);
  const qty = mia.reduce((a, l) => a + l.qty, 0);
  if (!qty || !(totalCobrado > 0)) return { unit: null, total: null, estimado: false };
  if (lineas.length === mia.length) return { unit: round2(totalCobrado / qty), total: round2(totalCobrado), estimado: false };
  const lista = lineas.reduce((a, l) => a + l.qty * l.lista, 0);
  const mio = mia.reduce((a, l) => a + l.qty * l.lista, 0);
  if (!(lista > 0) || !(mio > 0)) return { unit: null, total: null, estimado: true };
  const tot = totalCobrado * (mio / lista);
  return { unit: round2(tot / qty), total: round2(tot), estimado: true };
}

/** Stock beta = stock del sistema + movimientos de la beta (beta_stock_movimientos, 0046). */
export function aplicarMovimientos(stock: StockGrupo[], movs: Row[]): StockGrupo[] {
  if (!movs.length) return stock;
  const out = stock.map((g) => ({ ...g, subs: g.subs.map((x) => ({ ...x })) }));
  for (const m of movs) {
    const gr = s(m.bodega).toUpperCase();
    const g = out.find((x) => x.grupo === gr);
    if (!g) continue;
    const d = n(m.delta);
    g.cantidad = round2(n(g.cantidad) + d);
    g.beta = round2(n(g.beta) + d);
    if (gr === "CABINA") {
      const code = s(m.sububicacion);
      const sub = g.subs.find((x) => x.codigo === code) || g.subs.find((x) => x.codigo === "");
      if (sub) sub.cantidad = round2(n(sub.cantidad) + d);
    }
  }
  return out;
}

// ---------- TK18b: datos que se deducen solos ----------
/** Del nombre «Heartleaf Cleansing Oil 200ml - ANUA» sale contenido 200 ml; «70 Pads» = 70 unidades; «Spray» = spray. */
export function deducirDelNombre(nombre: unknown): { contenido?: number; unidad?: string; envase?: string } {
  const t = String(nombre ?? "").toLowerCase().replace(/,/g, ".");
  const out: { contenido?: number; unidad?: string; envase?: string } = {};
  const m = t.match(/(\d+(?:\.\d+)?)\s*(ml|g|gr|grs|gramos|oz|pads?|parches|patches|unidades|uds?|piezas|sheets?|ampollas?|ampoules?|sachets?|tabletas)\b/);
  if (m) {
    const q = Number(m[1]), u = m[2];
    if (q > 0 && q < 100000) {
      if (u === "ml") { out.contenido = q; out.unidad = "ml"; }
      else if (/^(g|gr|grs|gramos)$/.test(u)) { out.contenido = q; out.unidad = "g"; }
      else if (u === "oz") { out.contenido = Math.round(q * 29.57); out.unidad = "ml"; }
      else { out.contenido = q; out.unidad = "unidades"; }
    }
  }
  const ENV: [RegExp, string][] = [[/\bspray|mist\b/, "spray"], [/ampoule|ampolla/, "ampolla"], [/sachet|sobre\b/, "sachet"], [/\btub[eo]\b/, "tubo"], [/serum|s[eé]rum|essence|oil\b|aceite/, "gotero"], [/\bpads?\b|parches|patch/, "pote"], [/cream|crema|balm|mask\b|mascarilla/, "pote"], [/toner|t[oó]nico|cleanser|foam|gel|lotion|loci[oó]n/, "botella"]];
  for (const [re, env] of ENV) if (re.test(t)) { out.envase = env; break; }
  return out;
}
/** Mínimo y punto de reorden automáticos desde lo que salió en 90 días (ventas + envases abiertos en cabina).
 *  Mínimo = 1 semana de consumo; reorden = 3 semanas (2 de entrega + 1 de colchón). Sin movimiento: null. */
export function autoMinimos(salidas90: number): { minimo: number | null; reorden: number | null; porDia: number } {
  const d = salidas90 > 0 ? salidas90 / 90 : 0;
  if (!(d > 0)) return { minimo: null, reorden: null, porDia: 0 };
  const minimo = Math.max(1, Math.ceil(d * 7));
  return { minimo, reorden: Math.max(minimo, Math.ceil(d * 21)), porDia: Math.round(d * 1000) / 1000 };
}
export const ETIQUETA_REVISION: Record<string, string> = { sin_precio: "sin precio", sin_costo: "sin costo", sin_contenido: "sin contenido", sin_envase: "sin envase", sin_reorden: "sin punto de reorden", sin_foto: "sin foto" };
/** «Por revisar» (beta_v_producto_revision). Insumos de cabina no se venden: no piden precio. Si hay reorden automático, no falta. */
export function faltantesDe(vista: unknown, uso: string, hayReordenAuto: boolean): string[] {
  const L = Array.isArray(vista) ? vista.map((x) => String(x)) : [];
  return L.filter((f) => !(f === "sin_precio" && uso === "cabina") && !(f === "sin_reorden" && hayReordenAuto));
}
