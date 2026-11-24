/** TK206 + TK220: no crear un segundo ticket idéntico o casi idéntico si el primero acaba de entrar (doble toque / reintento). */
import { esCancelado, facialSku, n, normCedula, normNombre, productQtys, s, skuCode, type Row } from "./domain.ts";

/** Ventana para devolver el ticket ya creado. 15 min cierra el hueco de 2 min 9 s de TK-SO-1978. */
export const VENTANA_TICKET_DUP_MS = 15 * 60 * 1000;
/** Ventana para avisar «Posible duplicado» y pedir confirmación al crear. */
export const VENTANA_TICKET_PARECIDO_MS = 2 * 60 * 60 * 1000;
/** Tolerancia de total para tratar dos tickets como el mismo (cubre $44.996 vs $46.46). */
export const TOL_TOTAL_DUP = 3;

function facialClave(v: unknown): string {
  return (facialSku(v) || s(v).toUpperCase().replace(/\s+/g, " ").trim());
}
function skuNorm(v: unknown): string {
  const fac = (s(v).toUpperCase().match(/SUNSU-\d+/) || [])[0];
  if (fac) return fac;
  return skuCode(v);
}
function prodsClave(p: Row): string {
  const q = (p.productos && typeof p.productos === "object" && !Array.isArray(p.productos))
    ? p.productos as Row
    : null;
  if (q) return Object.keys(q).filter((k) => n(q[k]) > 0).sort().map((k) => k + ":" + n(q[k])).join(",");
  return productQtys(p).filter((x) => x.qty > 0).sort((a, b) => a.sku.localeCompare(b.sku)).map((x) => x.sku + ":" + x.qty).join(",");
}

/** Huella de un alta: misma clienta, mismo facial, mismo canje, mismos extras/productos y total. */
export function huellaAltaTicket(p: Row): string {
  return [
    normCedula(p.cedula ?? p.id_3),
    facialClave(p.facial ?? p.facial_hecho),
    String(Math.round(n(p.estimado) * 100)),
    s(p.colQ ?? p.paquete).replace(/\s+/g, " ").trim().toUpperCase(),
    s(p.extras ?? p.servicios_adicionales).replace(/\s+/g, " ").trim().toUpperCase(),
    prodsClave(p),
  ].join("|");
}

export function skusDeAlta(p: Row): string[] {
  const out = new Set<string>();
  const fac = facialSku(p.facial ?? p.facial_hecho);
  if (fac) out.add(fac);
  for (const raw of [p.extras ?? p.servicios_adicionales, p.colQ ?? p.paquete, p.pack3 ?? p.compra_pack_3, p.pack6 ?? p.compra_pack_6, p.venta_gift]) {
    for (const m of s(raw).toUpperCase().match(/SUNSU-\d+/g) || []) out.add(m);
  }
  const prods = p.productos;
  if (prods && typeof prods === "object" && !Array.isArray(prods)) {
    for (const [k, v] of Object.entries(prods as Row)) {
      if (n(v) <= 0) continue;
      const c = skuNorm(k);
      if (c) out.add(c);
    }
  } else {
    for (const pr of productQtys(p)) if (pr.qty > 0) out.add(skuNorm(pr.sku) || pr.sku);
  }
  return [...out].sort();
}

export function msDeTicket(r: Row, now?: Date): number {
  const c = Date.parse(s(r.created_at));
  if (Number.isFinite(c)) return c;
  const t = Date.parse(s(r.timestamp));
  return Number.isFinite(t) ? t : (now ? now.getTime() : 0);
}

export function mismaClientaTicket(p: Row, r: Row): boolean {
  const c1 = normCedula(p.cedula ?? p.id_3);
  const c2 = normCedula(r.cedula ?? r.id_3);
  if (c1 && c2) return c1 === c2;
  const n1 = normNombre((s(p.nombre) + " " + s(p.apellido)).trim());
  const n2 = normNombre((s(r.nombre) + " " + s(r.apellido)).trim());
  return !!n1 && n1 === n2;
}

function mismaCosm(p: Row, r: Row): boolean {
  const cosm = normNombre(p.cosmetologa ?? p.atendido_por);
  if (cosm && s(r.atendido_por) && normNombre(r.atendido_por) !== cosm) return false;
  return true;
}

function filaComoAlta(r: Row): Row {
  return {
    cedula: r.id_3 ?? r.cedula, facial: r.facial_hecho ?? r.facial, estimado: r.estimado,
    colQ: r.paquete ?? r.colQ, extras: r.servicios_adicionales ?? r.extras,
    productos: r.productos ?? productQtys(r),
    nombre: r.nombre, apellido: r.apellido,
    pack3: r.compra_pack_3, pack6: r.compra_pack_6,
    compra_pack_3: r.compra_pack_3, compra_pack_6: r.compra_pack_6,
    atendido_por: r.atendido_por, id_3: r.id_3,
  };
}

/** Casi idéntico: misma huella, o mismos SKUs (facial/extras) y total dentro de tolerancia. */
export function esGemeloTicket(p: Row, r: Row): boolean {
  const fila = filaComoAlta(r);
  if (huellaAltaTicket(p) === huellaAltaTicket(fila)) return true;
  const a = skusDeAlta(p), b = skusDeAlta(fila);
  if (!a.length || !b.length) return false;
  const facA = facialSku(p.facial ?? p.facial_hecho);
  const facB = facialSku(r.facial_hecho ?? r.facial);
  if (facA && facB && facA !== facB) return false;
  const inter = a.filter((x) => b.includes(x));
  const union = new Set([...a, ...b]);
  if (!inter.length || inter.length / union.size < 0.8) return false;
  const ta = n(p.estimado), tb = n(r.estimado);
  if (ta && tb && Math.abs(ta - tb) > TOL_TOTAL_DUP) return false;
  return true;
}

/** Misma clienta con ítems que se solapan (mismo facial o buena intersección de SKUs). */
export function esParecidoTicket(p: Row, r: Row): boolean {
  if (esGemeloTicket(p, r)) return true;
  const facA = facialSku(p.facial ?? p.facial_hecho);
  const facB = facialSku(r.facial_hecho ?? r.facial);
  if (facA && facB && facA === facB) return true;
  const a = skusDeAlta(p), b = skusDeAlta(filaComoAlta(r));
  const inter = a.filter((x) => b.includes(x));
  if (!inter.length) return false;
  const union = new Set([...a, ...b]);
  return inter.length / (union.size || 1) >= 0.4;
}

/** Si ya existe un ticket gemelo de la misma cosmetóloga en la ventana, se devuelve ese (no se crea otro). */
export function ticketRecienCreado(rows: Row[], p: Row, now: Date, ventanaMs = VENTANA_TICKET_DUP_MS): Row | null {
  const tieneId = !!normCedula(p.cedula ?? p.id_3);
  const tieneNom = !!normNombre((s(p.nombre) + " " + s(p.apellido)).trim());
  if (!tieneId && !tieneNom) return null;
  const t1 = now.getTime();
  for (const r of rows) {
    if (esCancelado(r)) continue;
    if (Math.abs(t1 - msDeTicket(r, now)) > ventanaMs) continue;
    if (!mismaClientaTicket(p, r)) continue;
    if (!mismaCosm(p, r)) continue;
    if (esGemeloTicket(p, r)) return r;
  }
  return null;
}

export function haceMinutos(ms: number): number {
  return Math.max(1, Math.round(Math.abs(ms) / 60000));
}

export function mensajeTicketParecido(num: string, haceMin: number): string {
  const cuando = haceMin <= 1 ? "hace menos de 1 min" : ("hace " + haceMin + " min");
  return "Ya existe un ticket parecido de esta clienta " + cuando + " (" + num + "), ¿crear igual?";
}

/** Ticket parecido en una ventana más amplia: se pide confirmación, no se crea solo. */
export function ticketParecido(rows: Row[], p: Row, now: Date, ventanaMs = VENTANA_TICKET_PARECIDO_MS): { ticket: Row; haceMin: number } | null {
  const tieneId = !!normCedula(p.cedula ?? p.id_3);
  const tieneNom = !!normNombre((s(p.nombre) + " " + s(p.apellido)).trim());
  if (!tieneId && !tieneNom) return null;
  const t1 = now.getTime();
  let best: { ticket: Row; haceMin: number; dist: number } | null = null;
  for (const r of rows) {
    if (esCancelado(r)) continue;
    const dist = Math.abs(t1 - msDeTicket(r, now));
    if (dist > ventanaMs) continue;
    if (!mismaClientaTicket(p, r)) continue;
    if (!esParecidoTicket(p, r)) continue;
    if (!best || dist < best.dist) best = { ticket: r, haceMin: haceMinutos(dist), dist };
  }
  return best ? { ticket: best.ticket, haceMin: best.haceMin } : null;
}

export type AvisoDuplicado = { con: string; clave: string; hace_min: number };

export function dupOkDe(datos: Row | undefined): string[] {
  const L = Array.isArray(datos?.dup_ok) ? datos!.dup_ok as unknown[] : [];
  return L.map((x) => s(x)).filter(Boolean);
}

export function tieneDupOk(datos: Row | undefined, con: string): boolean {
  const k = s(con);
  if (!k) return false;
  return dupOkDe(datos).includes(k);
}

function numDe(r: Row, claveDe?: (r: Row) => string): string {
  return s(r.so_num) || s(r.beta_num) || (claveDe ? claveDe(r) : "") || s(r.clave);
}

function datosCab(x: Row | undefined): Row | undefined {
  if (!x) return undefined;
  if (x.datos && typeof x.datos === "object") return x.datos as Row;
  return x;
}

/** Pares activos (misma clienta, ítems que se solapan, creados en la ventana). Ignora tickets importados de la hoja. */
export function avisosDuplicado(rows: Row[], opts?: {
  datosPorClave?: Map<string, Row>;
  claveDe?: (r: Row) => string;
  ventanaMs?: number;
}): Map<string, AvisoDuplicado> {
  const ventana = opts?.ventanaMs ?? VENTANA_TICKET_PARECIDO_MS;
  const claveDe = opts?.claveDe;
  const datos = opts?.datosPorClave;
  const vivos = rows.filter((r) => !esCancelado(r) && s(r.origin) !== "sheet" && !!msDeTicket(r));
  const out = new Map<string, AvisoDuplicado>();
  for (let i = 0; i < vivos.length; i++) {
    for (let j = i + 1; j < vivos.length; j++) {
      const a = vivos[i], b = vivos[j];
      const dist = Math.abs(msDeTicket(a) - msDeTicket(b));
      if (dist > ventana) continue;
      if (!mismaClientaTicket(a, b)) continue;
      if (!esParecidoTicket(a, b)) continue;
      const ka = numDe(a, claveDe), kb = numDe(b, claveDe);
      if (!ka || !kb || ka === kb) continue;
      const da = datosCab(datos?.get(ka) || datos?.get(s(a.clave)));
      const db = datosCab(datos?.get(kb) || datos?.get(s(b.clave)));
      const min = haceMinutos(dist);
      if (!tieneDupOk(da, kb) && !out.has(ka)) out.set(ka, { con: kb, clave: kb, hace_min: min });
      if (!tieneDupOk(db, ka) && !out.has(kb)) out.set(kb, { con: ka, clave: ka, hace_min: min });
    }
  }
  return out;
}
