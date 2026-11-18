// TK96 (Emilia 18/11): el borrador Migo se arma SOLO con la factura: cada línea con su SKU exacto, su cantidad
// y su precio unitario de la factura (con IVA). Nunca se empareja por nombre, nunca se aplican promos ni descuentos.
// La sección sale del tipo del catálogo por SKU (hoja + ERP + facturado en Migo, TK95):
//   PAQUETE → Paquete vendido · FACIAL → Facial · ADD-ON/SERVICIO → Extras · GIFT → Venta Gift Card · resto → Productos.
// Si el SKU no está en ningún catálogo, la línea igual se copia y es el ÚNICO aviso.
import { n, round2, s, skuCode, type Row } from "./domain.ts";
import { armarCatalogoTicket, preciosMigoDeTablas } from "./catalogo_ticket.ts";

export type SeccionBorrador = "facial" | "paquete" | "extra" | "producto" | "gift";
export type LineaBorrador = {
  seccion: SeccionBorrador; tipo: string; sku: string; skuFactura: string; nombre: string;
  cantidad: number; precio_unit: number; total: number; enCatalogo: boolean; pack?: 3 | 6;
};

export function seccionDeTipo(tipo: string): SeccionBorrador {
  const t = s(tipo).toLowerCase();
  if (t === "facial") return "facial";
  if (t === "paquete") return "paquete";
  if (t === "extra" || t === "servicio") return "extra";
  if (t === "gift") return "gift";
  return "producto";
}

/** Total con IVA de la línea tal cual la factura (total, o subtotal+IVA, o precio sin IVA × 1.15). */
export function totalLineaFactura(l: Row): number {
  const q = n(l.cantidad) || 1;
  if (n(l.total) > 0) return round2(n(l.total));
  const sub = n(l.subtotal) || round2(n(l.precio_unit) * q - n(l.descuento));
  if (!(sub > 0)) return 0;
  return round2(sub + (n(l.iva) > 0 ? n(l.iva) : sub * 0.15));
}

export function lineasBorradorDeFactura(lineasFac: Row[], catalogo: Row[]): { lineas: LineaBorrador[]; avisos: string[]; total: number } {
  const porCode = new Map<string, Row>();
  for (const c of catalogo || []) { const k = skuCode(s(c.sku)); if (k && !porCode.has(k)) porCode.set(k, c); }
  const lineas: LineaBorrador[] = [], avisos: string[] = [];
  for (const l of lineasFac || []) {
    const raw = s(l.sku || l.codigo);
    const code = skuCode(raw);
    const q = n(l.cantidad) || 1;
    const tot = totalLineaFactura(l);
    const c = code ? porCode.get(code) : undefined;
    const nombre = s(l.producto || l.nombre) || s(c?.nombre) || raw;
    if (!code) { avisos.push("Revisa: «" + nombre + "» viene sin código en la factura; se copió como producto."); }
    else if (!c) { avisos.push("Revisa: el SKU " + raw + " («" + nombre + "») no está en el catálogo; se copió con el precio de la factura."); }
    const seccion = seccionDeTipo(s(c?.tipo) || "producto");
    const pack = seccion === "paquete" ? (/\(\s*6\s*\)|x\s*6\b/i.test(s(c?.nombre) + " " + nombre) ? 6 : 3) : undefined;
    lineas.push({
      seccion, tipo: seccion, sku: code || raw, skuFactura: raw, nombre: s(c?.nombre) || nombre,
      cantidad: q, precio_unit: round2(tot / q), total: tot, enCatalogo: !!c, ...(pack ? { pack } : {}),
    });
  }
  return { lineas, avisos, total: round2(lineas.reduce((a, x) => a + x.total, 0)) };
}

async function todas(ctx: { db: { all: (t: string) => Promise<Row[]> } }, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }

/** Catálogo por SKU para armar borradores (todas las familias: SUNSU, VK, AS, JN, INV…). */
export async function catalogoBorradores(ctx: { db: { all: (t: string) => Promise<Row[]> } }): Promise<Row[]> {
  const migo = preciosMigoDeTablas(await todas(ctx, "beta_migo_lineas"), await todas(ctx, "beta_migo_facturas_vivo"));
  return armarCatalogoTicket(await todas(ctx, "catalogo"), await todas(ctx, "erp_productos"), migo);
}

/** Líneas del detalle de ticket (beta_ticket_lineas) desde la factura: el total del ticket es el de la factura. */
export function lineasTicketDeBorrador(L: LineaBorrador[]): Row[] {
  return L.map((x) => {
    const bruto = round2(x.cantidad * x.precio_unit);
    const desc = round2(bruto - x.total);
    return {
      tipo: x.tipo, sku: x.sku, nombre: x.nombre, cantidad: x.cantidad, precio_unit: x.precio_unit,
      descuento_tipo: Math.abs(desc) > 0.004 && desc > 0 ? "$" : null, descuento_valor: desc > 0.004 ? desc : 0,
      descuento_monto: desc > 0.004 ? desc : 0, total_linea: x.total, excluir_comision: false, estimado: false,
    };
  });
}
