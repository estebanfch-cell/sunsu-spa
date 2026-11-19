// Catálogo del buscador de ticket (TK95): además del catálogo de la hoja, entra
// todo producto que apareció en una factura Migo, aunque no tenga PVP en la hoja
// o esté inactivo en el sistema viejo. El precio de lista, si falta, es el último
// total con IVA de Migo.
import { n, round2, s, skuCode, type Row } from "./domain.ts";
import { skuVentaDe } from "./inventario_modelo.ts";

export function tipoCatalogo(t: string): string {
  const x = s(t).toUpperCase();
  if (x.startsWith("FACIAL")) return "facial";
  if (x.includes("ADD-ON") || x.includes("SERVICIO")) return "extra";
  if (x.startsWith("PAQUETE")) return "paquete";
  if (x.startsWith("GIFT")) return "gift";
  return "producto";
}

export type PrecioMigo = { pvp: number; nombre: string; skuVisible: string; fecha: string };

function pvpLinea(l: Row): number {
  const qty = n(l.cantidad) || 1;
  if (!(qty > 0)) return 0;
  if (n(l.total) > 0) return round2(n(l.total) / qty);
  if (n(l.precio_unit) > 0) {
    const unit = n(l.precio_unit);
    // Migo histórico suele traer precio_unit sin IVA y total con IVA.
    return n(l.iva) > 0 || n(l.subtotal) > 0 ? round2(unit * 1.15) : round2(unit);
  }
  return 0;
}

function poner(m: Map<string, PrecioMigo>, sku: unknown, nombre: unknown, pvp: number, fecha: string, skuRaw: unknown) {
  const code = skuCode(sku || skuRaw);
  if (!code || !(pvp > 0)) return;
  const cur = m.get(code);
  if (cur && s(fecha) && cur.fecha && s(fecha) < cur.fecha) return;
  m.set(code, { pvp: round2(pvp), nombre: s(nombre) || cur?.nombre || code, skuVisible: s(skuRaw) || cur?.skuVisible || code, fecha: s(fecha) || cur?.fecha || "" });
}

/** Último PVP con IVA por SKU, de facturas históricas y vivas. */
export function preciosMigoDeTablas(hist: Row[], vivo: Row[]): Map<string, PrecioMigo> {
  const m = new Map<string, PrecioMigo>();
  for (const l of hist || []) {
    poner(m, l.codigo || l.sku, l.producto || l.nombre, pvpLinea(l), s(l.fecha), l.codigo || l.sku);
  }
  for (const f of vivo || []) {
    const lineas = Array.isArray(f.lineas) ? f.lineas as Row[] : [];
    for (const l of lineas) {
      poner(m, l.sku || l.codigo, l.producto || l.nombre, pvpLinea(l), s(f.fecha), l.sku || l.codigo || l.sku);
    }
  }
  return m;
}


/** TK142: stock de Bodega Venta, sububicación y comisión unitaria para el detalle compacto de líneas. */
export function extrasCatalogoProd(p: Row | undefined): { stockVenta: number | null; sububicacion: string; comision: number } {
  if (!p) return { stockVenta: null, sububicacion: "", comision: 0 };
  const pg = (p.porGrupo && typeof p.porGrupo === "object") ? p.porGrupo as Row : {};
  const stockVenta = pg.CONSIGNACION != null && pg.CONSIGNACION !== "" ? n(pg.CONSIGNACION) : (p.stock != null && p.stock !== "" ? n(p.stock) : null);
  let sub = s((p as Row).sububicacion_def || (p as Row).sububicacionDef || "");
  const pe = (p.porEstante && typeof p.porEstante === "object") ? p.porEstante as Row : {};
  const keys = Object.keys(pe);
  const venta = keys.find((k) => /^CONSIGNACION\|/i.test(k) && n(pe[k]) > 0);
  const any = keys.find((k) => n(pe[k]) > 0 && String(k).includes("|"));
  const pick = venta || any;
  if (pick) {
    const loc = pick.split("|").slice(1).join("|");
    if (loc) sub = loc;
  }
  return { stockVenta, sububicacion: sub, comision: n(p.comision) };
}

/** Arma la lista del buscador: catálogo de la hoja + productos ERP + todo lo facturado en Migo. */
export function armarCatalogoTicket(catalogo: Row[], productos: Row[], migo: Map<string, PrecioMigo>): Row[] {
  const porCode = new Map(productos.map((p) => [skuCode(s(p.sku)), p]));
  const out: Row[] = [], ya = new Set<string>();
  for (const r of catalogo || []) {
    const code = skuCode(s(r.sku));
    if (!code || ya.has(code)) continue;
    ya.add(code);
    const p = porCode.get(code);
    const tot = n(r.total_con_iva) || round2(n(r.subtotal) * 1.15);
    const m = migo.get(code);
    const pvp = tot > 0 ? round2(tot) : (n(p?.pvp) > 0 ? round2(n(p!.pvp)) : n(m?.pvp));
    const enMigo = !!m;
    const venta = p && tipoCatalogo(s(r.tipo)) === "producto" ? skuVentaDe(p, code) : code;
    const aliases = p ? [...new Set([s(p.codigoInterno), s(p.skuCabina), code, ...(Array.isArray(p.skuAntes) ? p.skuAntes.map((x) => s(x)) : [])].filter((x) => x && x !== venta))] : [];
    ya.add(venta);
    out.push({
      sku: venta, skuVisible: venta, nombre: s(r.producto_servicio) || s(p?.nombre) || s(m?.nombre),
      tipo: tipoCatalogo(s(r.tipo)), pvp: round2(pvp),
      activo: (p ? p.activo !== false : r.activo !== false) || enMigo,
      enMigo, barras: [...new Set([...(p ? (p.barras || []) : []), ...aliases])], productoId: p ? s(p.id) : "", foto: p ? s(p.foto_thumb) : "",
      stock: p ? p.stock : null, marca: p ? s(p.marca) : "", categoria: p ? s(p.categoria) : "",
      codigoInterno: p ? s(p.codigoInterno || p.codigo_interno) : "", aliases, ...extrasCatalogoProd(p),
    });
  }
  for (const p of productos || []) {
    const raw = skuCode(s(p.sku));
    const code = p.tipo === "servicio" ? raw : skuVentaDe(p, raw);
    if (!code || ya.has(code) || p.tipo === "servicio") continue;
    const m = migo.get(code) || migo.get(raw);
    const pvp = n(p.pvp) > 0 ? n(p.pvp) : n(m?.pvp);
    ya.add(code); ya.add(raw);
    const enMigo = !!m;
    const aliases = [...new Set([s(p.codigoInterno), s(p.skuCabina), raw, ...(Array.isArray(p.skuAntes) ? p.skuAntes.map((x) => s(x)) : []), ...(Array.isArray(p.barras) ? p.barras.map((x) => s(x)) : [])].filter((x) => x && x !== code))];
    out.push({
      sku: code, skuVisible: code, nombre: s(p.nombre) || s(m?.nombre), tipo: "producto",
      pvp: round2(pvp), activo: p.activo !== false || enMigo, enMigo,
      barras: [...new Set([...(Array.isArray(p.barras) ? p.barras : []), ...aliases])], productoId: s(p.id), foto: s(p.foto_thumb), stock: p.stock,
      marca: s(p.marca), categoria: s(p.categoria), codigoInterno: s(p.codigoInterno || p.codigo_interno), aliases, ...extrasCatalogoProd(p),
    });
  }
  for (const [code, m] of migo) {
    if (!code || ya.has(code)) continue;
    ya.add(code);
    out.push({
      sku: code, skuVisible: m.skuVisible || code, nombre: m.nombre || code, tipo: "producto",
      pvp: round2(m.pvp), activo: true, enMigo: true, barras: [], productoId: "", foto: "", stock: null,
      marca: "", categoria: "",
    });
  }
  return out;
}
