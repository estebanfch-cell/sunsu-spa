/** TK144: resumen, fotos y creador para las tarjetas compactas de la lista de tickets. Sin N+1. */
import { n, normCedula, productQtys, s, type Row } from "./domain.ts";
import { consultar } from "./query.ts";
import { claveDe } from "./ticket_beta.ts";
import { leerSerie } from "./series.ts";
import { lineasTicket, precioLineaTicket } from "./productos.ts";
import { round2, skuCode } from "./domain.ts";

export type ResumenTk = {
  faciales: number;
  paquetes: number;
  canjes: number;
  extras: number;
  productos: number;
  gifts: number;
};

export function resumenVacio(): ResumenTk {
  return { faciales: 0, paquetes: 0, canjes: 0, extras: 0, productos: 0, gifts: 0 };
}

function qtyDe(l: Row): number {
  const q = Math.round(n(l.cantidad));
  return q > 0 ? q : 1;
}

function esCanjeLinea(l: Row): boolean {
  if (l.canje === true || s(l.canje).toLowerCase() === "true") return true;
  if (s(l.paqueteSesion) || s(l.paquete_sesion)) return true;
  const t = s(l.tipo);
  if ((t === "facial" || t === "paquete") && !(n(l.precio_unit) > 0) && !(n(l.total_linea) > 0)) return true;
  return false;
}

export function resumenDeLineas(lineas: Row[]): ResumenTk {
  const r = resumenVacio();
  for (const l of lineas || []) {
    const qty = qtyDe(l);
    if (esCanjeLinea(l)) { r.canjes += qty; continue; }
    const t = s(l.tipo);
    if (t === "facial") r.faciales += qty;
    else if (t === "paquete") r.paquetes += qty;
    else if (t === "extra" || t === "servicio") r.extras += qty;
    else if (t === "gift") r.gifts += qty;
    else if (t === "producto" || !t) r.productos += qty;
  }
  return r;
}

function partesTxt(v: unknown): string[] {
  return s(v).split(/[|,;/]+/).map((x) => x.trim()).filter((x) => x && !/^(no|n\/a|-)$/i.test(x));
}

export function resumenDeHoja(r: Row, d: Row = {}): ResumenTk {
  const out = resumenVacio();
  const facial = partesTxt(r.facial_hecho || d.facial_hecho);
  if (facial.length) out.faciales += facial.length;
  const pack = partesTxt(r.compra_pack_3 || r.compra_pack_6 || r.pack3 || r.pack6 || d.pack3 || d.pack6);
  if (pack.length) out.paquetes += pack.length;
  if (/^\s*SI/i.test(s(r.paquete))) out.canjes += 1;
  const extras = partesTxt(r.servicios_adicionales || r.extra || d.servicios_adicionales);
  if (extras.length) out.extras += extras.length;
  for (const p of productQtys(r)) out.productos += Math.max(0, Math.round(n(p.qty)));
  const gift = s(r.venta_gift || r.gift_card);
  if (gift && !/^(no|-|0)$/i.test(gift.trim())) out.gifts += 1;
  return out;
}

export function textoResumen(r: ResumenTk): string {
  const parts: string[] = [];
  const add = (num: number, uno: string, muchos: string) => {
    if (num > 0) parts.push(num === 1 ? "1 " + uno : num + " " + muchos);
  };
  add(r.faciales, "facial", "faciales");
  add(r.paquetes, "paquete", "paquetes");
  add(r.canjes, "canje", "canjes");
  add(r.extras, "extra", "extras");
  add(r.productos, "producto", "productos");
  add(r.gifts, "gift card", "gift cards");
  return parts.join(" · ");
}

/** Importe de una línea (total_linea o precio×cantidad menos descuento). Ignora la línea DIF. */
export function importeLinea(l: Row): number {
  if (s(l.tipo) === "diferencia" || s(l.sku).toUpperCase() === "DIF" || /^Diferencia sin explicar$/i.test(s(l.nombre))) return 0;
  if (n(l.total_linea)) return round2(n(l.total_linea));
  const qty = n(l.cantidad) > 0 ? n(l.cantidad) : 1;
  const bruto = round2(qty * n(l.precio_unit));
  const tipo = s(l.descuento_tipo);
  const desc = tipo === "$" ? n(l.descuento_valor) : tipo === "%" ? round2(bruto * n(l.descuento_valor) / 100) : 0;
  return round2(Math.max(0, bruto - desc));
}

/** Valor del ticket = suma de sus líneas. Nunca lo cobrado ni el estimado de la hoja. */
export function totalDeLineas(lineas: Row[] | undefined): number {
  return round2((lineas || []).reduce((a, l) => a + importeLinea(l), 0));
}

/**
 * Total a mostrar en listas y cruces: líneas beta, o líneas sintéticas del catálogo.
 * No usa el estimado/cobrado de la hoja (TK207, Emilia: el valor del ticket, nunca lo cobrado).
 */
export function totalValorTicket(r: Row, opts?: { lineas?: Row[]; cab?: Row | null; map?: Map<string, Row>; canje?: boolean }): number {
  const cab = opts?.cab;
  if (cab && cab.lineas_beta === true && n(cab.total) > 0) return round2(n(cab.total));
  if (opts?.lineas && opts.lineas.length) return totalDeLineas(opts.lineas);
  const canje = opts?.canje ?? /^\s*SI\b/i.test(s(r.paquete));
  const syn = lineasSinteticas(r, opts?.map, canje);
  if (syn.length) return totalDeLineas(syn);
  return 0;
}

/** Factura compacta para una sola línea en iPhone: Fac. 001-001-2982 */
export function facListaTxt(fac: string): string {
  const t = s(fac).trim();
  if (!t) return "";
  const m = t.match(/^(\d{3})-(\d{3})-(\d{6,12})$/);
  if (m) return "Fac. " + m[1] + "-" + m[2] + "-" + String(Number(m[3]));
  const nOnly = t.match(/(\d{6,12})$/);
  if (nOnly) return "Fac. " + String(Number(nOnly[1]));
  return "Fac. " + t.replace(/\.0+$/, "");
}

export function nombreCorto(nom: string): string {
  const t = s(nom).replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!t) return "";
  return t.split(/\s+/)[0];
}

/** Solo URLs que el <img> puede pintar (http o data:image). No archivo: ni placeholders. */
export function urlsFoto(v: unknown): string[] {
  return refsFoto(v).filter((u) => u.startsWith("http") || u.startsWith("data:image"));
}

/** Fotos reales: http, data:image o archivo:<id> de app_archivos. Nunca placeholders. */
export function refsFoto(v: unknown): string[] {
  if (v == null || v === "") return [];
  if (Array.isArray(v)) return v.flatMap(refsFoto);
  if (typeof v === "object") {
    const o = v as Row;
    const out: string[] = [];
    for (const k of ["url", "foto", "foto_url", "foto_thumb", "src", "imagen", "avatar"]) {
      out.push(...refsFoto(o[k]));
    }
    return out;
  }
  const raw = s(v).trim();
  if (!raw) return [];
  if (raw.includes("|")) return raw.split("|").map((x) => x.trim()).flatMap(refsFoto);
  if (raw.startsWith("http") || raw.startsWith("data:image")) return [raw];
  const arch = raw.match(/^archivo:([\w-]+)$/);
  if (arch) return ["archivo:" + arch[1]];
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try { return refsFoto(JSON.parse(raw)); } catch { /* no era JSON */ }
  }
  return [];
}

export type FotoCard = { url?: string; archivo?: string; k: string };

export function aFotoCard(ref: string, k: string): FotoCard | null {
  const u = s(ref).trim();
  if (!u) return null;
  if (u.startsWith("http") || u.startsWith("data:image")) return { url: u, k };
  const m = u.match(/^archivo:([\w-]+)$/);
  return m ? { archivo: m[1], k } : null;
}

/** Hasta 4 miniaturas reales; si hay 5 o más, el +N es total-4. */
export function topeFotosCard(fotos: FotoCard[]): { fotosCard: FotoCard[]; fotosMore: number } {
  const L = (fotos || []).filter((f) => f && (s(f.url) || s(f.archivo)));
  return { fotosCard: L.slice(0, 4), fotosMore: Math.max(0, L.length - 4) };
}

export function fotoDeDatos(datos: unknown): string {
  const hits = urlsFoto(datos);
  return hits[0] || "";
}

export function creadoPorDe(r: Row, it: Row = {}): string {
  const orig = (r.orig && typeof r.orig === "object" ? r.orig : {}) as Row;
  return s(orig.creado_por) || s(r.creado_por) || s(it.creado_por) || s(r.atendido_por) || s(it.cosmetologa) || s(r.cosmetologa);
}

async function consultarSafe(db: Parameters<typeof consultar>[0], table: string, q: Parameters<typeof consultar>[2]): Promise<Row[]> {
  try {
    return (await consultar(db, table, q)).rows || [];
  } catch {
    return [];
  }
}


/** Línea compacta para precargar el detalle desde tk_historial (TK152). */
export function lineaHistorial(l: Row): Row {
  return {
    tipo: l.tipo, sku: l.sku, nombre: l.nombre,
    cantidad: l.cantidad, precio_unit: l.precio_unit, total_linea: l.total_linea,
    canje: l.canje === true || s(l.canje).toLowerCase() === "true",
    cortesia: l.cortesia === true || s(l.cortesia).toLowerCase() === "true",
    consumoInterno: l.consumoInterno === true || l.consumo_interno === true,
    descuento_tipo: l.descuento_tipo || "", descuento_valor: l.descuento_valor || 0,
    excluir_comision: l.excluir_comision === true, estimado: l.estimado === true,
    promo: l.promo || "", paqueteSesion: l.paqueteSesion || l.paquete_sesion || "",
    valorNominal: l.valorNominal || l.valor_nominal || 0,
  };
}

/**
 * TK154 (Emilia t673u): líneas al instante para el 100% de los tickets de la lista. Si el ticket no tiene filas en
 * beta_ticket_lineas (tickets del formulario/hoja), se arman aquí con el catálogo ya cargado (0 consultas extra),
 * con la misma base que lineasDe0: canje en $0, nombre completo del catálogo, 1 sola línea = lo cobrado.
 * Van marcadas `previa`: tk_get las reemplaza en segundo plano sin parpadeo.
 */
export function lineasSinteticas(r: Row, map: Map<string, Row> | undefined, canje: boolean): Row[] {
  const cat = map || new Map<string, Row>();
  const pvpDe = (c: string) => { const x = cat.get(skuCode(c)); return n(x?.total_con_iva ?? x?.pvp); };
  const nombreDe = (c: string) => { const x = cat.get(skuCode(c)); return s(x?.producto_servicio || x?.nombre) || c; };
  const L0 = lineasTicket(r, pvpDe);
  if (!L0.length) return [];
  const cobrado = Math.max(0, round2(n(r.estimado)));
  const cobrables = L0.filter((x) => !(canje && x.tipo === "facial"));
  const out: Row[] = [];
  const vistos = new Set<string>();
  for (const l of L0) {
    const k = l.tipo + "|" + l.codigo;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const qty = L0.filter((x) => x.codigo === l.codigo && x.tipo === l.tipo).reduce((a, x) => a + x.qty, 0);
    const nombre = l.tipo === "gift" ? "Gift card" : nombreDe(l.codigo);
    if (canje && l.tipo === "facial") {
      out.push({ tipo: l.tipo, sku: l.codigo, nombre, cantidad: qty, precio_unit: 0, total_linea: 0, canje: true, estimado: false, previa: true });
      continue;
    }
    const pr = precioLineaTicket(cobrables, l.codigo, cobrado);
    const unit = !pr.estimado && pr.unit != null ? pr.unit : (l.lista > 0 ? l.lista : (pr.unit ?? 0));
    out.push({ tipo: l.tipo, sku: l.codigo, nombre, cantidad: qty, precio_unit: round2(unit), total_linea: round2(unit * qty), canje: false, estimado: pr.estimado || !(l.lista > 0), previa: true });
  }
  return out;
}

export async function enriquecerItemsLista(
  db: Parameters<typeof consultar>[0],
  filas: Row[],
  items: Row[],
  cabMap: Map<string, Row>,
  opts: { map?: Map<string, Row>; canje?: (r: Row) => boolean } = {},
): Promise<void> {
  if (!filas.length || !items.length) return;
  const claves = filas.map((r) => claveDe(r, leerSerie(r, "so_num")));
  let lineas = await consultarSafe(db, "beta_ticket_lineas", {
    cols: ["ticket_clave", "tipo", "sku", "nombre", "cantidad", "precio_unit", "total_linea", "canje", "descuento_tipo", "descuento_valor", "excluir_comision", "estimado", "promo", "cortesia", "paquete_sesion", "valor_nominal"],
    filtros: [{ col: "ticket_clave", op: "in", val: claves }],
  });
  if (!lineas.length && claves.length) {
    lineas = await consultarSafe(db, "beta_ticket_lineas", {
      filtros: [{ col: "ticket_clave", op: "in", val: claves }],
    });
  }
  const lineasPor = new Map<string, Row[]>();
  for (const l of lineas) {
    const k = s(l.ticket_clave);
    const L = lineasPor.get(k) || [];
    L.push(l);
    lineasPor.set(k, L);
  }

  const skus = new Set<string>();
  for (const L of lineasPor.values()) {
    for (const l of L) if (s(l.sku)) skus.add(s(l.sku));
  }
  for (const r of filas) {
    for (const p of productQtys(r)) if (p.sku) skus.add(p.sku);
  }
  const skuList = [...skus].slice(0, 400);
  const prods = skuList.length
    ? await consultarSafe(db, "erp_productos", {
      cols: ["sku", "codigo_interno", "foto_thumb", "foto_url", "foto"],
      filtros: [{ col: "sku", op: "in", val: skuList }],
    })
    : [];
  const fotoProd = new Map<string, string>();
  const ponerFoto = (k: string, u: string) => {
    const key = k.toUpperCase();
    if (key && u && !fotoProd.has(key)) fotoProd.set(key, u);
  };
  for (const p of prods) {
    const u = urlsFoto(p.foto_thumb)[0] || urlsFoto(p.foto_url)[0] || urlsFoto(p.foto)[0];
    if (!u) continue;
    if (s(p.sku)) ponerFoto(s(p.sku), u);
    if (s(p.codigo_interno)) ponerFoto(s(p.codigo_interno), u);
  }

  const ceds = [...new Set(filas.map((r) => normCedula(r.id_3 || r.cedula)).filter(Boolean))];
  const clientes = ceds.length
    ? await consultarSafe(db, "beta_clientes", {
      cols: ["cedula", "key", "datos"],
      filtros: [{ col: "cedula", op: "in", val: ceds }],
    })
    : [];
  const fotoCli = new Map<string, string>();
  for (const c of clientes) {
    const u = fotoDeDatos(c.datos);
    const ced = normCedula(c.cedula);
    if (u && ced) fotoCli.set(ced, u);
  }

  for (let i = 0; i < items.length; i++) {
    const r = filas[i], it = items[i];
    if (!r || !it) continue;
    const clave = claves[i];
    const d = ((cabMap.get(clave)?.datos || {}) as Row);
    it.creado_por = creadoPorDe(r, it);
    const L = lineasPor.get(clave) || [];
    const res = L.length ? resumenDeLineas(L) : resumenDeHoja(r, d);
    it.resumen = res;
    if (L.length) it.lineas = L.map((l) => lineaHistorial(l));
    else {
      const syn = lineasSinteticas(r, opts.map, opts.canje ? opts.canje(r) : /^\s*SI\b/i.test(s(r.paquete)));
      if (syn.length) { it.lineas = syn.map((l) => ({ ...lineaHistorial(l), previa: true })); it.lineasPrevia = true; }
    }
    it.resumenTxt = textoResumen(res);
    const fotos: FotoCard[] = [];
    const seen = new Set<string>();
    const addRef = (ref: string, k: string) => {
      const card = aFotoCard(ref, k);
      if (!card) return;
      const key = card.url || ("archivo:" + s(card.archivo));
      if (!key || seen.has(key) || fotos.length >= 12) return;
      seen.add(key);
      fotos.push(card);
    };
    const ced = normCedula(r.id_3 || r.cedula);
    const antes = refsFoto(r.fotos_antes)[0] || refsFoto(d.fotos_antes)[0] || "";
    const despues = refsFoto(r.fotos_despues)[0] || refsFoto(d.fotos_despues)[0] || "";
    if (antes) addRef(antes, "a");
    if (despues) addRef(despues, "d");
    if (!antes && !despues) {
      const perfil = fotoCli.get(ced) || refsFoto(r.fotos)[0] || refsFoto(d.fotos)[0] || refsFoto(d.foto)[0] || "";
      if (perfil) addRef(perfil, "c");
    }
    const addSku = (sku: string) => {
      const u = fotoProd.get(s(sku).toUpperCase());
      if (u) addRef(u, "p");
    };
    if (L.length) {
      for (const l of L) {
        if (s(l.tipo) && s(l.tipo) !== "producto") continue;
        if (s(l.sku)) addSku(s(l.sku));
      }
    } else {
      for (const p of productQtys(r)) addSku(p.sku);
    }
    const tope = topeFotosCard(fotos);
    it.fotosCard = tope.fotosCard;
    it.fotosMore = tope.fotosMore;
    // TK207: el monto de la tarjeta es el total de las líneas, nunca lo cobrado ni el estimado de la hoja.
    const Lshow = Array.isArray(it.lineas) ? it.lineas as Row[] : [];
    if (Lshow.length) {
      const tot = totalDeLineas(Lshow);
      it.total = tot;
      it.estimado = tot;
    }
  }
}
