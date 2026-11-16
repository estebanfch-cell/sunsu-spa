// Productos estilo MineCore: una sola lista que une erp_productos (maestro beta),
// catalogo (precios del sistema viejo, lo pisa el sync de Sheets cada hora) y
// cabina_inventario (envases de Cabina y de la Oficina). Funciones puras: se prueban sin BD.
//
// Bodegas que se muestran (solo etiquetas, no se mueve stock):
//   Consignación   <- VENTA (inventario principal del sistema viejo)
//   Bodega Cabina  <- CABINA, CAB2, CAB3 como sububicaciones Cabina 1/2/3
//   Bodega Oficina <- CASA (más los envases "en bodega" de cabina_inventario)

import { IVA, PCT_COMISION_PRODUCTO, n, round2, s, skuCode, type Row } from "./domain.ts";

export const BOD_VENTA = "11111111-1111-4111-8111-111111111111";
export const BOD_CABINA = "22222222-2222-4222-8222-222222222222";
export const BOD_CASA = "44444444-4444-4444-8444-444444444444";
export const BOD_CAB2 = "55555555-5555-4555-8555-555555555552";
export const BOD_CAB3 = "55555555-5555-4555-8555-555555555553";

export type Grupo = "CONSIGNACION" | "CABINA" | "OFICINA" | "OTRA";
export const GRUPO_NOMBRE: Record<Grupo, string> = {
  CONSIGNACION: "Consignación", CABINA: "Bodega Cabina", OFICINA: "Bodega Oficina", OTRA: "Otra bodega",
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
  if (id === BOD_VENTA || cod === "VENTA" || tipo === "venta") return { grupo: "CONSIGNACION", sub: "" };
  if (id === BOD_CASA || cod === "CASA" || tipo === "casa") return { grupo: "OFICINA", sub: "" };
  if (id === BOD_CAB2 || cod === "CAB2") return { grupo: "CABINA", sub: "CABINA_2" };
  if (id === BOD_CAB3 || cod === "CAB3") return { grupo: "CABINA", sub: "CABINA_3" };
  if (id === BOD_CABINA || cod === "CABINA" || tipo === "cabina") {
    const m = sb.match(/^CABINA_?([123])$/);
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
  compraReal: number;     // entra a la utilidad
  compraComision: number; // entra solo a la comisión
  comision: number;       // por unidad
  utilidad: number;       // por unidad, sin IVA
  margenPct: number;
  editadoBeta: string[];  // campos que vienen de la beta y no del sistema viejo
}

/**
 * Regla actual del código (handlers.ts editarProductoCatalogo / getCatalogoTabla):
 *   comisión = 30 % × max(0, subtotal sin IVA − compra para comisiones)
 *   compra para comisiones = catalogo.compra_comision, o catalogo.precio_compra si está vacía.
 * REGLAS_NEGOCIO.md §441 dice "subtotal − compra"; la diferencia queda anotada en el reporte.
 */
export function preciosDe(cat: Row | undefined, erp: Row | undefined, compraBase: number): Precios {
  const editado: string[] = [];
  let subtotal = n(cat?.subtotal);
  let pvp = n(cat?.total_con_iva) || round2(subtotal * IVA);
  if (!cat && erp?.precio_venta != null) { pvp = n(erp.precio_venta); subtotal = round2(pvp / IVA); }
  if (erp?.beta_pvp != null && erp.beta_pvp !== "") {
    pvp = n(erp.beta_pvp); subtotal = round2(pvp / IVA); editado.push("pvp");
  }
  let compraComision = cat ? (cat.compra_comision != null && cat.compra_comision !== "" ? n(cat.compra_comision) : n(cat.precio_compra)) : n(erp?.costo_promedio);
  if (erp?.beta_compra_comision != null && erp.beta_compra_comision !== "") { compraComision = n(erp.beta_compra_comision); editado.push("compraComision"); }
  let compraReal = compraBase || n(erp?.costo_promedio) || (cat ? n(cat.precio_compra) : 0);
  if (erp?.beta_compra_real != null && erp.beta_compra_real !== "") { compraReal = n(erp.beta_compra_real); editado.push("compraReal"); }
  const comision = comisionUnidad(subtotal, compraComision);
  const utilidad = round2(subtotal - compraReal);
  return { pvp: round2(pvp), subtotal: round2(subtotal), compraReal: round2(compraReal), compraComision: round2(compraComision), comision, utilidad, margenPct: subtotal > 0 ? round2(utilidad / subtotal * 100) : 0, editadoBeta: editado };
}

export function comisionUnidad(subtotal: number, compraComision: number, pct = PCT_COMISION_PRODUCTO): number {
  return round2(Math.max(0, n(subtotal) - n(compraComision)) * pct);
}

export interface StockSub { codigo: string; nombre: string; cantidad: number }
export interface StockGrupo { grupo: Grupo; nombre: string; cantidad: number; subs: StockSub[]; nota?: string; abierto?: number; unidad?: string }

/**
 * Stock por bodega para la ficha.
 *  - Consignación: el stock de venta del sistema viejo (corte + tickets + entradas) si viene; si no, erp_stock VENTA.
 *  - Bodega Cabina: envases cerrados de cabina_inventario si la fila existe; si no, erp_stock de CABINA/CAB2/CAB3.
 *    Sububicaciones Cabina 1/2/3 salen de erp_stock (sububicacion CABINA_n o bodegas CAB2/CAB3). Lo que no tiene
 *    cabina asignada queda en "Sin cabina asignada". No se inventa a qué cabina pertenece.
 *  - Bodega Oficina: envases "en bodega" de cabina_inventario + erp_stock CASA.
 */
export function stockDe(opts: { ventaLegacy?: number | null; cab?: Row; erpStock: Row[]; bodegas: Row[] }): StockGrupo[] {
  const bod = new Map(opts.bodegas.map((b) => [s(b.id), b]));
  const erp: Record<Grupo, number> = { CONSIGNACION: 0, CABINA: 0, OFICINA: 0, OTRA: 0 };
  const subQ: Record<string, number> = {};
  for (const r of opts.erpStock) {
    const g = grupoDeBodega(bod.get(s(r.bodega_id)), s(r.sububicacion));
    erp[g.grupo] += n(r.cantidad);
    if (g.grupo === "CABINA" && g.sub) subQ[g.sub] = (subQ[g.sub] || 0) + n(r.cantidad);
  }
  const out: StockGrupo[] = [];
  const consig = opts.ventaLegacy != null ? n(opts.ventaLegacy) : erp.CONSIGNACION;
  out.push({ grupo: "CONSIGNACION", nombre: GRUPO_NOMBRE.CONSIGNACION, cantidad: round2(consig), subs: [], nota: "bodega VENTA" });
  const cab = opts.cab;
  const cabTotal = cab ? n(cab.envases_cerrados) : erp.CABINA;
  const subs: StockSub[] = SUBS_CABINA.map((x) => ({ codigo: x.codigo, nombre: x.nombre, cantidad: round2(subQ[x.codigo] || 0) }));
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
};
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
  return String(v ?? "").trim().toUpperCase().replace(/\s+/g, "").replace(/^SUNSU-/, "");
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
