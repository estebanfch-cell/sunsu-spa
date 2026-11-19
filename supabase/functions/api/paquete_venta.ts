// TK110 (Emilia 18/11): toda venta de paquete en un ticket tiene su registro en Spa › Paquetes.
// Venta = columna compra_pack_3/6 del ticket o línea beta tipo «paquete» con precio > 0.
// Si no hay un paquete de esa venta (misma factura + SKU, ticket de origen, o misma clienta + SKU ±3 días), se crea.
import { b, codigoPaquete, ecuadorParts, n, normCedula, normNombre, packSesiones, s, siguienteCodigoPaq, skuCode, USO_FIELDS, type Row } from "./domain.ts";
import { nextSheet } from "./lib.ts";

export type VentaPaquete = { sku: string; txt: string; pack: 3 | 6 };

export function ventasPaqueteDeTicket(t: Row, lineasBeta?: Row[]): VentaPaquete[] {
  const out: VentaPaquete[] = [];
  for (const [col, pack] of [["compra_pack_3", 3], ["compra_pack_6", 6]] as const) {
    const v = s(t[col]).trim();
    if (!v || /^(false|no|-|—|0)$/i.test(v)) continue;
    const m = v.match(/SUNSU-?\d+/i);
    out.push({ sku: m ? "SUNSU-" + skuCode(m[0]) : v, txt: v, pack });
  }
  for (const l of lineasBeta || []) {
    if (s(l.tipo) !== "paquete" || !(n(l.precio_unit) > 0)) continue;
    const sku = "SUNSU-" + skuCode(s(l.sku));
    if (out.some((v) => v.sku === sku)) continue;
    const pack = /\(\s*6\s*\)|x\s*6\b/i.test(s(l.nombre)) ? 6 : 3;
    for (let i = 0; i < Math.max(1, Math.round(n(l.cantidad) || 1)); i++) out.push({ sku, txt: (sku + " " + s(l.nombre)).trim(), pack });
  }
  return out;
}

export function fechaPaquete(p: Row): string {
  let a = Math.trunc(n(p.ano)); if (a > 0 && a < 100) a += 2000;
  return a ? `${a}-${String(Math.trunc(n(p.mes))).padStart(2, "0")}-${String(Math.trunc(n(p.dia))).padStart(2, "0")}` : "";
}
function facSeq(v: unknown): number { const m = /(\d{1,9})(?:\.0+)?$/.exec(s(v).replace(/\s/g, "")); return m ? Number(m[1]) : 0; }
/** El timestamp del ticket es hora de pared de Ecuador guardada como UTC (igual que ymdUtc del detalle). */
export function ymdGye(ts: unknown): string { const d = new Date(s(ts)); return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10); }

/** Paquete ya registrado para esa venta (o null). `usados` evita que dos ventas iguales apunten al mismo paquete. */
export function paqueteDeVenta(P: Row[], t: Row, v: VentaPaquete, factura: string, usados: Set<string> = new Set()): Row | null {
  const clave = s(t.so_num) || s(t.beta_num);
  const ymd = ymdGye(t.timestamp), nom = normNombre(s(t.nombre) + " " + s(t.apellido)), ced = normCedula(t.id_3 || t.cedula);
  const fs = facSeq(factura || t.fac_7);
  const libres = P.filter((p) => !p.borrado_at && !usados.has(String(p.id)));
  const o = (p: Row) => (p.orig && typeof p.orig === "object" ? p.orig as Row : {});
  const porTicket = libres.find((p) => s(o(p).ticket) && (s(o(p).ticket) === clave || s(o(p).ticket) === s(t.beta_num)) && skuCode(s(p.sku)) === skuCode(v.sku));
  if (porTicket) return porTicket;
  const persona = (p: Row) => (ced && normCedula(p.cedula) === ced) || (nom && normNombre(s(p.nombres) + " " + s(p.apellidos)) === nom);
  const mismoSku = (p: Row) => skuCode(s(p.sku)) === skuCode(v.sku);
  const facSkuPersona = fs ? libres.find((p) => facSeq(p.factura) === fs && mismoSku(p) && persona(p)) : null;
  if (facSkuPersona) return facSkuPersona;
  const porPersona = libres.find((p) => {
    const f = fechaPaquete(p);
    return persona(p) && skuCode(s(p.sku)) === skuCode(v.sku) && f && ymd && Math.abs((Date.parse(f) - Date.parse(ymd)) / 864e5) <= 3;
  });
  if (porPersona) return porPersona;
  // Misma factura y SKU a otro nombre (regalo / pagó otra persona).
  const facSku = fs ? libres.find((p) => facSeq(p.factura) === fs && mismoSku(p)) : null;
  if (facSku) return facSku;
  // Misma factura con otro SKU anotado (p. ej. SUNSU-21 por SUNSU-18): es el mismo paquete mal tipeado.
  return (fs ? libres.find((p) => facSeq(p.factura) === fs && persona(p)) : null) || null;
}

/** Fila nueva de `paquetes` para una venta sin registro (no marca sesiones salvo `uso1`). */
export function filaPaquete(t: Row, v: VentaPaquete, sheetRow: number, codigo: string, factura: string, uso1 = ""): Row {
  const ymd = ymdGye(t.timestamp) || ecuadorParts().ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  return {
    sheet_row: sheetRow, dia: d, mes: m, ano: y, cedula: s(t.id_3 || t.cedula) || null,
    nombres: s(t.nombre), apellidos: s(t.apellido), factura: factura || s(t.fac_7) || null,
    sku: v.sku, paquete: v.txt, vendido_por: s(t.atendido_por), notas: "",
    ...(uso1 ? { uso_1: true, fecha_1: uso1 } : {}),
    orig: { ticket: s(t.so_num) || s(t.beta_num), codigo, beta: true, desde: "venta en ticket (TK110)" }, beta_codigo: codigo, origin: "beta",
  };
}

/** Crea los paquetes que falten para las ventas de paquete del ticket. Devuelve los códigos creados. */
export async function asegurarPaquetesVenta(ctx: { db: { all: (t: string) => Promise<Row[]>; write: (a: string, t: string, op: string, w: Row, v: Row | null) => Promise<Row | null> } }, actor: string, t: Row, lineasBeta?: Row[], factura = ""): Promise<string[]> {
  const ventas = ventasPaqueteDeTicket(t, lineasBeta);
  if (!ventas.length || !(s(t.nombre) || s(t.id_3) || s(t.cedula))) return [];
  const P = await ctx.db.all("paquetes").catch(() => [] as Row[]);
  const usados = new Set<string>(), creados: string[] = [];
  for (const v of ventas) {
    const hit = paqueteDeVenta(P, t, v, factura, usados);
    if (hit) { usados.add(String(hit.id)); continue; }
    const codigo = siguienteCodigoPaq(P);
    const fila = filaPaquete(t, v, await nextSheet(ctx.db as never, "paquetes"), codigo, factura);
    const saved = await ctx.db.write(actor, "paquetes", "insert", {}, fila);
    if (saved) { P.push(saved); usados.add(String(saved.id)); creados.push(codigoPaquete(saved) || codigo); }
  }
  return creados;
}

/** Sesiones del paquete convertidas en gift card: idempotente (un código ya marcado no se repite) y nunca más allá
 * del tamaño del paquete. Antes un doble guardado dejaba 26-174, 26-175, 26-174, 26-175 en un paquete de 3. */
export function patchSlotsGC(row: Row, slots: Row[]): Row {
  const patch: Row = {};
  const total = Math.max(1, packSesiones(s(row.sku), s(row.paquete)) || 3);
  const ya = new Set(USO_FIELDS.map(([, f]) => (s(row[f]).match(/\b\d{2}-\d{3}\b/) || [""])[0]).filter(Boolean));
  const pend = (slots || []).map((x) => s(x.codigo)).filter((c, k, A) => c && !ya.has(c) && A.indexOf(c) === k);
  let i = 0;
  for (const [u, f] of USO_FIELDS.slice(0, total)) {
    if (i >= pend.length) break;
    if (!b(row[u]) && !s(row[f])) { patch[u] = true; patch[f] = "Gift Card, " + pend[i]; i++; }
  }
  return patch;
}
