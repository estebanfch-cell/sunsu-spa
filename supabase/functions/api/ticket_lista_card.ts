/** TK144: resumen, fotos y creador para las tarjetas compactas de la lista de tickets. Sin N+1. */
import { n, normCedula, productQtys, s, type Row } from "./domain.ts";
import { consultar } from "./query.ts";
import { claveDe } from "./ticket_beta.ts";
import { leerSerie } from "./series.ts";

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

export function urlsFoto(v: unknown): string[] {
  if (v == null || v === "") return [];
  if (Array.isArray(v)) return v.flatMap(urlsFoto);
  if (typeof v === "object") {
    const o = v as Row;
    const out: string[] = [];
    for (const k of ["url", "foto", "foto_url", "foto_thumb", "src", "imagen", "avatar"]) {
      out.push(...urlsFoto(o[k]));
    }
    return out;
  }
  const raw = s(v).trim();
  if (!raw || raw.startsWith("archivo:")) return [];
  if (raw.includes("|")) {
    return raw.split("|").map((x) => x.trim()).filter((x) => x.startsWith("http") || x.startsWith("data:image"));
  }
  if (raw.startsWith("http") || raw.startsWith("data:image")) return [raw];
  if ((raw.startsWith("{") || raw.startsWith("["))) {
    try { return urlsFoto(JSON.parse(raw)); } catch { /* no era JSON */ }
  }
  return [];
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

export async function enriquecerItemsLista(
  db: Parameters<typeof consultar>[0],
  filas: Row[],
  items: Row[],
  cabMap: Map<string, Row>,
): Promise<void> {
  if (!filas.length || !items.length) return;
  const claves = filas.map((r) => claveDe(r, leerSerie(r, "so_num")));
  let lineas = await consultarSafe(db, "beta_ticket_lineas", {
    cols: ["ticket_clave", "tipo", "sku", "nombre", "cantidad", "precio_unit", "total_linea", "canje"],
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
    it.resumenTxt = textoResumen(res);
    const fotos: { url: string; k: string }[] = [];
    const seen = new Set<string>();
    const add = (url: string, k: string) => {
      if (!url || seen.has(url) || fotos.length >= 12) return;
      seen.add(url);
      fotos.push({ url, k });
    };
    const ced = normCedula(r.id_3 || r.cedula);
    add(fotoCli.get(ced) || urlsFoto(r.fotos_antes)[0] || urlsFoto(d.fotos_antes)[0] || urlsFoto(r.fotos)[0] || "", "c");
    const addSku = (sku: string) => {
      const u = fotoProd.get(s(sku).toUpperCase());
      if (u) add(u, "p");
    };
    if (L.length) {
      for (const l of L) {
        if (s(l.tipo) && s(l.tipo) !== "producto") continue;
        if (s(l.sku)) addSku(s(l.sku));
      }
    } else {
      for (const p of productQtys(r)) addSku(p.sku);
    }
    it.fotosCard = fotos.slice(0, 5);
    it.fotosMore = Math.max(0, fotos.length - 5);
  }
}
