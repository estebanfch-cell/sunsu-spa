// Clientes, edición de tickets, consumos, quincena de consignación y saldo de gift card.
// El saldo, si ya se usó en parte, vive en gift_cards.saldo, en notas (SALDO:n) y en orig.usos.
// Si nunca se usó, la columna valor suele decir «Gift Card» (no el monto): el monto está en el catálogo (SUNSU-35 = $65).
// La quincena de proveedores es 1–15 y 16–fin. No es el ciclo de comisiones 26–25.

import { consultar } from "./query.ts";
import { aplicarAjuste, vistaPaquete } from "./paquetes_beta.ts";
import type { Db } from "./db.ts";
import {
  FACIALES_2, FACIALES_3, IVA, PROD_COLS, USO_FIELDS, cantAmpollas, ecuadorParts, facialSku, n, normCedula, normNombre,
  packSesiones, prodCol, productQtys, round2, s, skuCode, tiposAmpolla, ymdUtc, type ComCfg, type Row,
  codigoPaquete, esCancelado, normCedulaVieja, cedulasCompatibles } from "./domain.ts";
import { claveIdentidad, clavesDe } from "./clientes_alias.ts";
import { conTelefono, logAccion, type Ses } from "./lib.ts";
import { esPropio, type SesLite } from "./permisos.ts";
import { cargarPreciosConsig, resolverPrecio } from "./consig_precios.ts";
import { NOTA_LIQUIDACION_TK127, mapaAliases, qtyPagableProveedor, resolverSku } from "./inventario_modelo.ts";

export const BUFFER_RESTOCK = 0.2;

/** 0.2 o 20 significan +20%. Vacío usa el default. */
export function bufferDe(v: unknown): number {
  if (v == null || s(v) === "") return BUFFER_RESTOCK;
  let x = Number(v);
  if (!Number.isFinite(x) || x < 0) return BUFFER_RESTOCK;
  if (x > 1) x = x / 100;
  return x;
}
export const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export interface Quincena {
  q: 1 | 2;
  y: number;
  m: number;
  ini: string;
  fin: string;
  qLabel: string;
}

export function quincenaDe(y: number, m: number, d: number, forzar?: number): Quincena {
  const q: 1 | 2 = forzar === 1 || forzar === 2 ? forzar : (d <= 15 ? 1 : 2);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  const ini = q === 1 ? `${y}-${mm}-01` : `${y}-${mm}-16`;
  const fin = q === 1 ? `${y}-${mm}-15` : `${y}-${mm}-${String(last).padStart(2, "0")}`;
  const mes = MESES[m - 1] || "";
  const qLabel = (q === 1 ? "1-15 " : "16-fin ") + mes + " " + y;
  return { q, y, m, ini, fin, qLabel };
}

export function quincenaActual(now: Date, forzar?: number): Quincena {
  const ec = ecuadorParts(now);
  return quincenaDe(ec.y, ec.m, ec.d, forzar);
}

const FAMILIA_CODIGOS = ["HT", "AS", "ML", "PH", "JN", "BV", "SU", "VK"] as const;

export function familiaSku(sku: string): string {
  const m = skuCode(sku).match(/^(HT|AS|ML|PH|JN|BV|SU|VK)-/);
  return m ? m[1] : "";
}

/** Consignación de cabina: el conjunto de antes de sumar BV, SU y VK a la búsqueda de Compras. SU es marca propia y VK es compra directa. */
export function familiaConsignacion(sku: string): string {
  const m = skuCode(sku).match(/^(HT|AS|ML|PH|JN)-/);
  return m ? m[1] : "";
}

/** Bodega Cabina de 0009. Un producto sin bodega_origen_venta sigue saliendo de Venta. */
export const BODEGA_CABINA_ORIGEN = "22222222-2222-4222-8222-222222222222";

/**
 * Máscaras Dr.esthe/Esthemax ya pagadas. El ticket descuenta Cabina, no la percha,
 * y no se facturan ni se reponen como consignación. Siguen activas para venderse.
 * Un producto con bodega_origen_venta = Cabina se trata igual aunque no esté en la lista.
 */
export const SKUS_VENTA_CABINA = ["ML-009", "ML-010", "ML-011", "ML-012", "ML-013", "ML-014"];

export function vendeDesdeCabina(p: Row | null | undefined, sku?: string): boolean {
  const code = skuCode(s(p?.sku) || sku || "");
  if (SKUS_VENTA_CABINA.includes(code)) return true;
  return s(p?.bodega_origen_venta) === BODEGA_CABINA_ORIGEN;
}

/** HT, AS, ML… tal como está en proveedores.familia. No convierte una marca en código. */
export function codigoFamilia(raw: unknown): string {
  const up = s(raw).toUpperCase();
  if (!up) return "";
  const m = up.match(/\b(HT|AS|ML|PH|JN|BV|SU|VK)\b/);
  if (m) return m[1];
  const limpio = up.replace(/[^A-Z]/g, "");
  if ((FAMILIA_CODIGOS as readonly string[]).includes(limpio)) return limpio;
  if (limpio.length >= 2 && limpio.length <= 3) return limpio;
  return "";
}

export function claveNombre(nombre: string): string {
  return s(nombre)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(s\s*\.?\s*a\s*\.?\s*s\s*\.?|s\s*\.?\s*a\s*\.?|cia\.?|ltda\.?|company|compania|corp\.?|inc\.?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mismoNombre(a: string, b: string): boolean {
  const x = claveNombre(a);
  const y = claveNombre(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export function familiaDe(nombre: string, familia?: string): string {
  const codigo = codigoFamilia(familia);
  if (codigo) return codigo;
  const n = s(nombre).toLowerCase();
  if (n.includes("hebetronic") || n.includes("anua") || n.includes("common")) return "HT";
  if (n.includes("allskin") || n.includes("eyenlip")) return "AS";
  if (n.includes("atencio") || n.includes("esthe")) return "ML";
  if (n.includes("aphlora")) return "PH";
  if (n.includes("rire") || n.includes("holika") || n.includes("ayala")) return "JN";
  if (n.includes("vassari")) return "BV";
  if (n.includes("maira") || n.includes("moya rojas") || n.includes("valkir")) return "VK";
  if (n === "sunsu" || n === "sunsu spa") return "SU";
  return "";
}

/** La familia sale de proveedores.familia (la hoja). El nombre solo cubre si la hoja no la trae. */
export function familiaDeFila(prov: Row | null | undefined, hoja: Row[] = []): string {
  if (!prov) return "";
  const directa = codigoFamilia(prov.familia);
  if (directa) return directa;
  const hit = hoja.find((r) =>
    (prov.legacy_sheet_row != null && r.sheet_row != null && String(r.sheet_row) === String(prov.legacy_sheet_row))
    || mismoNombre(s(r.nombre), s(prov.nombre))
  );
  if (hit) {
    const deHoja = codigoFamilia(hit.familia);
    if (deHoja) return deHoja;
  }
  return familiaDe(s(prov.nombre));
}

export function parseGcCanje(colR: unknown): { codigo: string; aplica: number | null } | null {
  const t = s(colR).trim();
  if (!/^SI\b/i.test(t)) return null;
  const aplicaM = t.match(/aplica\s*\$?\s*([\d.]+)/i);
  const codigoM = t.match(/SI\s*,\s*([^,]+)/i);
  return { codigo: codigoM ? codigoM[1].trim() : "", aplica: aplicaM ? round2(Number(aplicaM[1])) : null };
}

export function montoGcAplicado(colR: unknown): number {
  return parseGcCanje(colR)?.aplica || 0;
}

export function precioGiftCatalogo(sku: string, catalogo: Row[] = []): number {
  const k = s(sku).toUpperCase();
  if (!k) return 0;
  const c = catalogo.find((x) => s(x.sku).toUpperCase() === k);
  if (!c) return 0;
  const p = n(c.total_con_iva) || n(c.total) || n(c.subtotal);
  return p > 0 ? round2(p) : 0;
}

/** Nombre corto y precio de catálogo si valor/notas nombran un facial (Reset, Geisha, etc.).
 *  No interpreta «PREMIUM» (en facturas suele ser una Gift Card SUNSU-35 de $65/$68)
 *  ni un paquete («VER PAQUETE» / «PAQUETE (3|6)») como un facial suelto. */
export function facialDesdeTexto(texto: string, catalogo: Row[] = []): { precio: number; sku: string; etiqueta: string } | null {
  const blob = s(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!blob.trim()) return null;
  if (/\bver\s+paquete\b/.test(blob) || /\bpaquete\s*\(?\s*[36]\b/.test(blob)) return null;
  const aliases: { re: RegExp; sku: string; etiqueta: string }[] = [
    { re: /\bpeeling\s*marino\b/, sku: "SUNSU-42", etiqueta: "Peeling Marino" },
    { re: /\bgeisha\b/, sku: "SUNSU-43", etiqueta: "Geisha" },
    { re: /\b(skin\s*)?reset(\s*3\s*x\s*1)?\b/, sku: "SUNSU-40", etiqueta: "Reset" },
    { re: /\bdomo(\s*de\s*oxigeno)?\b/, sku: "SUNSU-41", etiqueta: "Domo de Oxígeno" },
    { re: /\bginseng\b/, sku: "SUNSU-52", etiqueta: "Ginseng" },
    { re: /\bk\s*-?\s*lift\b/, sku: "SUNSU-57", etiqueta: "K-Lift" },
    { re: /\bgold\s*-?\s*aging\b/, sku: "SUNSU-04", etiqueta: "Gold-Aging" },
    { re: /\bporcelana\b/, sku: "SUNSU-05", etiqueta: "Porcelana" },
    { re: /\b7\s*pieles\b/, sku: "SUNSU-03", etiqueta: "7 Pieles" },
    { re: /\brice\s*flow\b/, sku: "SUNSU-06", etiqueta: "Rice Flow" },
    { re: /(?:\bfacial\s+)?(?:puruficacion|purificacion)(?:\s+s\.?o\.?s\.?\b)?|\bs\.?o\.?s\.?\b/, sku: "SUNSU-01", etiqueta: "S.O.S" },
    { re: /\breparacion\b/, sku: "SUNSU-02", etiqueta: "Reparación" },
    { re: /\bbio\s*-?\s*glow\b/, sku: "", etiqueta: "Bio-Glow" },
    { re: /\blimpieza\b/, sku: "", etiqueta: "Limpieza" },
  ];
  const precioDe = (sku: string): number => (sku ? precioGiftCatalogo(sku, catalogo) : 0);
  for (const a of aliases) {
    if (!a.re.test(blob)) continue;
    // «AMPOLLA ESPECIAL PURIFICACIÓN» no es el Facial S.O.S.
    if (a.sku === "SUNSU-01" && /\bampolla\b/.test(blob) && !/\bs\.?o\.?s\.?\b/.test(blob)) continue;
    const precio = precioDe(a.sku);
    if (precio > 0) return { precio, sku: a.sku, etiqueta: a.etiqueta };
    // Alias conocido pero sin precio en este catálogo: sigue buscando por nombre.
    if (a.sku) continue;
  }
  let best: { precio: number; sku: string; etiqueta: string; score: number } | null = null;
  for (const c of catalogo) {
    const tipo = s(c.tipo).toUpperCase();
    if (!/FACIAL/.test(tipo) || /PAQUETE/.test(tipo) || /PRODUCTO|ADD-?ON|GIFT/.test(tipo)) continue;
    const nombre = s(c.producto_servicio).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const toks = nombre.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
      .filter((w) => w.length >= 4 && !/^(facial|sunsu|pieles)$/.test(w));
    if (!toks.length || !toks.every((w) => blob.includes(w))) continue;
    const precio = n(c.total_con_iva) || n(c.total) || n(c.subtotal);
    if (!(precio > 0)) continue;
    const score = toks.join(" ").length;
    if (!best || score > best.score) {
      const etiqueta = s(c.producto_servicio).replace(/^FACIAL(?:ES)?\s+(?:DE\s+)?/i, "").replace(/\s+3x1$/i, "").trim();
      best = { precio: round2(precio), sku: s(c.sku), etiqueta: etiqueta || s(c.sku), score };
    }
  }
  return best ? { precio: best.precio, sku: best.sku, etiqueta: best.etiqueta } : null;
}


/** true si la gift nació de una conversión de sesión de paquete (notas u orig). */
export function esConvPaqueteGc(row: Row): boolean {
  const orig = row.orig && typeof row.orig === "object" ? row.orig as Row : {};
  const blob = [s(row.notas), s(row.valor), s(orig.NOTAS), s(orig.pack), s(orig.pack_sku)].join(" ");
  return /conv\.?\s*paquete/i.test(blob) || !!s(orig.pack) || !!s(orig.pack_sku) || !!s(orig.facial_sku);
}

function packRefsDe(row: Row): string[] {
  const orig = row.orig && typeof row.orig === "object" ? row.orig as Row : {};
  const blob = s(row.notas) + " " + s(row.valor) + " " + s(orig.pack) + " " + s(orig.pack_sku) + " " + s(orig.codigo);
  const out: string[] = [];
  for (const m of blob.matchAll(/\b(?:PACK-?\d+|PQ-\d+|TEST-PQ-\d+)\b/gi)) out.push(m[0].toUpperCase().replace(/PACK(?!-)/, "PACK-"));
  if (s(orig.pack)) out.push(s(orig.pack).toUpperCase());
  return [...new Set(out.filter(Boolean))];
}

function facSeqGift(v: unknown): number {
  const m = /(\d{1,9})(?:\.0+)?$/.exec(s(v).replace(/\s/g, ""));
  return m ? Number(m[1]) : 0;
}

function codigoEnFechaGc(fecha: unknown, codigo: string): boolean {
  const t = s(fecha), c = s(codigo).trim();
  if (!t || !c) return false;
  const hit = (t.match(/\b\d{2}-\d{3}\b/g) || []).some((x) => x === c);
  return hit && /gift\s*card/i.test(t);
}

/** Paquete del que salió esta gift (PACK-XXX / PQ-XXX, «Gift Card, 26-XXX» en un uso, o factura si es conv.). */
export function paqueteDeGift(row: Row, paquetes: Row[] = []): Row | null {
  const libres = (paquetes || []).filter((p) => !p.borrado_at);
  if (!libres.length) return null;
  const refs = packRefsDe(row);
  if (refs.length) {
    const hit = libres.find((p) => {
      const cods = [codigoPaquete(p), s(p.codigo), s(p.beta_codigo), p.id != null ? "PACK-" + p.id : ""].map((x) => s(x).toUpperCase());
      return refs.some((r) => cods.includes(r) || cods.includes(r.replace(/PACK(?!-)/, "PACK-")));
    });
    if (hit) return hit;
  }
  const codigo = s(row.codigo_gc);
  if (codigo) {
    const hit = libres.find((p) => USO_FIELDS.some(([, f]) => codigoEnFechaGc(p[f], codigo)));
    if (hit) return hit;
  }
  if (esConvPaqueteGc(row)) {
    const fs = facSeqGift(row.factura);
    if (fs) {
      const hits = libres.filter((p) => facSeqGift(p.factura) === fs);
      if (hits.length === 1) return hits[0];
    }
  }
  return null;
}

/** Precio de lista del facial que representa un paquete (SUNSU-44 → Reset $95), no el paquete/3. */
export function facialDePaquete(texto: string, catalogo: Row[] = []): { precio: number; sku: string; etiqueta: string } | null {
  const raw = s(texto);
  if (!raw.trim()) return null;
  const skuM = raw.match(/SUNSU-\d+/i);
  let blob = raw;
  if (skuM) {
    const c = catalogo.find((x) => s(x.sku).toUpperCase() === skuM[0].toUpperCase());
    if (c) blob = raw + " " + s(c.producto_servicio);
  }
  const limpio = blob
    .replace(/\bver\s+paquete\b/ig, " ")
    .replace(/\bpaquete\s*\(\s*[36]\s*\)\s*facial(?:es)?/ig, " ")
    .replace(/\bpaquete\s*\(\s*[36]\s*\)/ig, " ")
    .replace(/\bx\s*[36]\b/ig, " ");
  return facialDesdeTexto(limpio, catalogo);
}

function nombreFacialBonito(raw: string, fallback = ""): string {
  const t = s(raw).trim();
  if (!t) return fallback;
  return t.toLowerCase()
    .replace(/(^|[\s/()+-]+)\S/g, (c) => c.toUpperCase())
    .replace(/3X1/g, "3x1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Notas al nacer una gift de conversión: «Facial Reset 3x1 · $95 · Conv. paquete PACK-674→GC · Digital». */
export function notasConvPaqueteGC(opts: { facial?: string; precio?: number; pack?: string; tipo?: string }): string {
  const tipo = /fisic/i.test(s(opts.tipo)) ? "Física" : "Digital";
  const bits: string[] = [];
  if (s(opts.facial).trim()) bits.push(s(opts.facial).trim());
  const p = n(opts.precio);
  if (p > 0) bits.push("$" + (p % 1 ? String(round2(p)) : String(p)));
  const pack = s(opts.pack).trim();
  bits.push("Conv. paquete" + (pack ? " " + pack : "") + "→GC");
  bits.push(tipo);
  return bits.join(" · ");
}

export function datosGiftConvPaquete(pack: Row, catalogo: Row[] = [], tipo?: string): {
  notas: string; valor: string; pack: string; facialNombre: string; facialSku: string; precio: number; orig: Row;
} {
  const packCod = codigoPaquete(pack) || (pack.id != null ? "PACK-" + pack.id : s(pack.sku));
  const fac = facialDePaquete((s(pack.sku) + " " + s(pack.paquete)).trim(), catalogo);
  const catNom = fac ? s(catalogo.find((c) => s(c.sku) === fac.sku)?.producto_servicio) : "";
  const facialNombre = nombreFacialBonito(catNom, fac?.etiqueta ? ( /facial/i.test(fac.etiqueta) ? fac.etiqueta : "Facial " + fac.etiqueta ) : "");
  const precio = fac?.precio || 0;
  const notas = notasConvPaqueteGC({ facial: facialNombre, precio, pack: packCod, tipo });
  const valor = facialNombre && precio ? facialNombre + " $" + (precio % 1 ? String(round2(precio)) : String(precio)) : (facialNombre || "Gift Card");
  return {
    notas, valor, pack: packCod, facialNombre, facialSku: fac?.sku || "", precio,
    orig: {
      pack: packCod, pack_sku: s(pack.sku), facial: facialNombre, facial_sku: fac?.sku || "", facial_precio: precio,
    },
  };
}

/** Facial/precio de una conv. paquete→GC: orig, texto, o el paquete ligado. */
export function facialDeConvPaquete(row: Row, catalogo: Row[] = [], paquetes: Row[] = []): { precio: number; sku: string; etiqueta: string } | null {
  const orig = row.orig && typeof row.orig === "object" ? row.orig as Row : {};
  if (n(orig.facial_precio) > 0) {
    const etq = s(orig.facial) || facialDesdeTexto(s(orig.facial) + " " + s(orig.facial_sku), catalogo)?.etiqueta || "";
    return { precio: round2(n(orig.facial_precio)), sku: s(orig.facial_sku), etiqueta: etq };
  }
  const pack = paqueteDeGift(row, paquetes);
  if (pack) {
    const fac = facialDePaquete((s(pack.sku) + " " + s(pack.paquete)).trim(), catalogo);
    if (fac) return fac;
  }
  if (s(orig.pack_sku) || s(orig.facial)) {
    const fac = facialDePaquete((s(orig.pack_sku) + " " + s(orig.facial)).trim(), catalogo) || facialDesdeTexto(s(orig.facial), catalogo);
    if (fac) return fac;
  }
  return null;
}

export type InfoSaldoGift = { saldo: number; origen: string; facial: string; sku: string };
export type ExtraServicioGift = { facial?: unknown; servicio?: unknown };

function blobServicioGift(row: Row, extra?: ExtraServicioGift): string {
  const orig = row.orig && typeof row.orig === "object" ? row.orig as Row : {};
  return [s(extra?.servicio), s(extra?.facial), s(orig.servicio), s(orig.facial), s(row.valor), s(row.notas), s(orig.NOTAS)].join(" ");
}

/** Facial específico de una gift (Peeling Marino, Geisha, etc.).
 *  No cuenta «Facial Premium» / «Gift Card»: esas siguen siendo monetarias de $65. */
export function servicioDesignadoGift(row: Row, extra: ExtraServicioGift | undefined, catalogo: Row[] = []): { precio: number; sku: string; etiqueta: string } | null {
  const fac = facialDesdeTexto(blobServicioGift(row, extra), catalogo);
  if (!fac || !(fac.precio > 0)) return null;
  const etq = fac.etiqueta.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (/^(facial\s+)?premium$/.test(etq) || /^gift\s*card$/.test(etq)) return null;
  return fac;
}

export function notasConServicio(prev: string, facial: string): string {
  const t = s(prev).replace(/(?:^|\s*\|\s*)SALDO:[\d.]+/g, "").replace(/^\s*\|\s*/, "").trim();
  const f = s(facial).trim();
  if (!f) return t;
  const blob = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const key = f.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (key && blob.includes(key)) return t;
  return t ? f + ". " + t : f;
}

/** Monto disponible de una gift card.
 *  0) si nombra un facial específico (digital, ajustes, orig o notas), cubre ese servicio al precio de hoy
 *  1) saldo numérico (incl. 0) / tag SALDO:n / orig.saldo
 *  2) valor numérico (p. ej. «95» o «$95» sin letras)
 *  3) monto explícito en notas/valor (p. ej. «$95») o facial de catálogo nombrado en notas/valor
 *  4) recién entonces, precio del SKU de la fila (SUNSU-35 = $65). */
export function infoSaldoGift(row: Row, catalogo: Row[] = [], paquetes: Row[] = [], extra?: ExtraServicioGift): InfoSaldoGift {
  const skuRow = s(row.sku);
  if (row.usado === true || row.usado === "true" || row.usado === "SI") {
    return { saldo: 0, origen: "usado", facial: "", sku: skuRow };
  }
  const serv = servicioDesignadoGift(row, extra, catalogo);
  if (serv) return { saldo: serv.precio, origen: "servicio", facial: serv.etiqueta, sku: serv.sku };
  const facHint = facialDesdeTexto(s(row.valor) + " " + s(row.notas), catalogo);
  const conFac = (saldo: number, origen: string): InfoSaldoGift => ({
    saldo, origen, facial: facHint?.etiqueta || "", sku: facHint?.sku || skuRow,
  });
  if (row.saldo != null && s(row.saldo) !== "" && Number.isFinite(Number(row.saldo))) {
    return conFac(round2(n(row.saldo)), "saldo");
  }
  const notas = s(row.notas);
  const m = notas.match(/SALDO:([\d.]+)/);
  if (m) return conFac(round2(Number(m[1])), "saldo");
  const orig = row.orig && typeof row.orig === "object" ? row.orig as Row : null;
  if (orig && orig.saldo != null && s(orig.saldo) !== "" && Number.isFinite(Number(orig.saldo))) {
    return conFac(round2(n(orig.saldo)), "saldo");
  }
  const valor = s(row.valor);
  const v = parseFloat(valor.replace(",", "."));
  if (Number.isFinite(v) && v > 0 && !/[a-z]/i.test(valor)) return conFac(round2(v), "valor");
  const ape = parseFloat(s(row.apellido_comprador));
  if (Number.isFinite(ape) && ape > 0) return conFac(round2(ape), "valor");
  const dolar = (valor + " " + notas).match(/\$\s*([\d.,]+)/);
  if (dolar) {
    const x = parseFloat(dolar[1].replace(",", "."));
    if (Number.isFinite(x) && x > 0) return conFac(round2(x), "notas");
  }
  if (facHint && facHint.precio > 0) {
    return { saldo: facHint.precio, origen: "facial", facial: facHint.etiqueta, sku: facHint.sku };
  }
  // TK149: una Conv. paquete→GC (o ligada a un paquete) hereda el facial de lista, no el fallback SUNSU-35 $65.
  const packFac = (esConvPaqueteGc(row) || !!paqueteDeGift(row, paquetes)) ? facialDeConvPaquete(row, catalogo, paquetes) : null;
  if (packFac && packFac.precio > 0) {
    return { saldo: packFac.precio, origen: "paquete", facial: packFac.etiqueta, sku: packFac.sku || skuRow };
  }
  const cat = precioGiftCatalogo(skuRow, catalogo);
  return { saldo: cat, origen: cat > 0 ? "catalogo" : "ninguno", facial: "", sku: skuRow };
}

export function saldoGift(row: Row, catalogo: Row[] = [], paquetes: Row[] = [], extra?: ExtraServicioGift): number {
  return infoSaldoGift(row, catalogo, paquetes, extra).saldo;
}

export function etiquetaGift(row: Row, catalogo: Row[] = [], paquetes: Row[] = [], extra?: ExtraServicioGift): string {
  const info = infoSaldoGift(row, catalogo, paquetes, extra);
  const codigo = s(row.codigo_gc);
  const mon = "$" + info.saldo.toFixed(info.saldo % 1 ? 2 : 0);
  return (codigo ? codigo + " · " : "") + mon + (info.facial ? " (" + info.facial + ")" : "");
}

export function notasConSaldo(prev: string, saldo: number): string {
  const limpio = prev.replace(/(?:^|\s*\|\s*)SALDO:[\d.]+/g, "").replace(/^\s*\|\s*/, "").trim();
  const tag = "SALDO:" + saldo.toFixed(2);
  return limpio ? tag + " | " + limpio : tag;
}

export async function aplicarGiftCard(db: Db, actor: string, p: {
  codigo: string; aplica: number | null; ticket: string; usadoPor: string; facialPrecio: number; now?: Date;
  facialSku?: string; facialNombre?: string;
}): Promise<Row> {
  const codigo = s(p.codigo).trim();
  if (!codigo) return { error: "Falta el código de la gift card" };
  const cats = await db.all("catalogo").catch(() => [] as Row[]);
  const packs = await db.all("paquetes").catch(() => [] as Row[]);
  const rows = (await db.all("gift_cards")).filter((r) => !r.borrado_at);
  const row = rows.find((r) => s(r.codigo_gc).toLowerCase() === codigo.toLowerCase() && !bUsado(r) && saldoGift(r, cats, packs) > 0)
    || rows.find((r) => s(r.codigo_gc).toLowerCase() === codigo.toLowerCase());
  if (!row) return { error: "Gift card no encontrada" };
  const logs = await db.all("log_acciones");
  const ya = logs.find((r) => s(r.accion) === "GIFT CARD" && s(r.detalle).includes("ticket=" + p.ticket) && s(r.detalle).includes("codigo=" + codigo));
  if (ya) {
    const saldo = saldoGift(row, cats, packs);
    const aplicado = n((s(ya.detalle).match(/monto=([\d.]+)/) || [])[1]);
    const facialCobro = p.facialPrecio > 0 ? round2(Math.max(0, p.facialPrecio - aplicado)) : 0;
    return { ok: true, codigo, aplicado, saldo, facialCobro, ya: true };
  }
  const digs = await db.all("gift_cards_digitales").catch(() => [] as Row[]);
  const ajs = await db.all("beta_gift_ajustes").catch(() => [] as Row[]);
  const dig = digs.find((d) => s(d.codigo).trim().toUpperCase() === codigo.toUpperCase());
  const aj = ajs.find((a) => String(a.gift_id) === String(row.id) || s(a.codigo).trim().toUpperCase() === codigo.toUpperCase());
  const extra = { facial: dig?.facial, servicio: aj?.servicio };
  const info = infoSaldoGift(row, cats, packs, extra);
  const saldo = info.saldo;
  if (!(saldo > 0)) return { error: "Esa gift card no tiene saldo" };
  let aplicado: number;
  let facialCobro: number;
  if (info.origen === "servicio") {
    const ticketFac = facialDesdeTexto(s(p.facialNombre) + " " + s(p.facialSku), cats);
    const skuTicket = skuCode(ticketFac?.sku || p.facialSku);
    const skuServ = skuCode(info.sku);
    if (!skuTicket) return { error: "Esta gift card es para " + (info.facial || "un facial específico") };
    if (skuTicket !== skuServ) return { error: "Esta gift card es para " + (info.facial || skuServ) + ". No cubre ese servicio." };
    aplicado = p.facialPrecio > 0 ? round2(p.facialPrecio) : saldo;
    facialCobro = 0;
  } else {
    aplicado = p.aplica == null ? saldo : round2(p.aplica);
    if (p.facialPrecio > 0) aplicado = Math.min(aplicado, round2(p.facialPrecio));
    aplicado = Math.min(aplicado, saldo);
    if (!(aplicado > 0)) return { error: "Indica cuánto de la gift card se aplica" };
    if (p.aplica != null && p.aplica - saldo > 0.009 && !(p.facialPrecio > 0 && p.aplica > p.facialPrecio)) {
      return { error: "La gift card no alcanza. Saldo $" + saldo.toFixed(2) };
    }
    facialCobro = p.facialPrecio > 0 ? round2(Math.max(0, p.facialPrecio - aplicado)) : 0;
  }
  const nuevo = info.origen === "servicio" ? 0 : round2(saldo - aplicado);
  const orig0 = row.orig && typeof row.orig === "object" ? { ...(row.orig as Row) } : {};
  const usos = Array.isArray(orig0.usos) ? [...(orig0.usos as Row[])] : [];
  const ec = ecuadorParts(p.now || new Date());
  usos.push({ ticket: p.ticket, monto: aplicado, saldo: nuevo, actor, fecha: ec.isoWall });
  orig0.usos = usos;
  orig0.saldo = nuevo;
  const patch: Row = {
    notas: notasConSaldo(s(row.notas), nuevo),
    saldo: nuevo,
    orig: orig0,
  };
  if (nuevo <= 0.009) {
    patch.usado = true;
    patch.fecha_uso = ec.ymd;
    patch.usado_por = s(p.usadoPor);
    patch.saldo = 0;
  } else {
    patch.usado = false;
  }
  await db.write(actor, "gift_cards", "update", { sheet_row: row.sheet_row }, patch);
  const det = `ticket=${p.ticket} codigo=${codigo} monto=${aplicado.toFixed(2)} saldo=${nuevo.toFixed(2)} facial=${facialCobro.toFixed(2)}`;
  await logAccion(db, actor, "GIFT CARD", det);
  try {
    await db.write(actor, "gift_card_movimientos", "insert", {}, {
      codigo, ticket_ref: p.ticket, monto: aplicado, saldo: nuevo, actor, nota: det, fecha: ec.isoWall,
    });
  } catch { /* 0015 todavía no aplicado: el saldo quedó en orig.usos y en notas */ }
  return { ok: true, codigo, aplicado, saldo: nuevo <= 0.009 ? 0 : nuevo, facialCobro };
}

function bUsado(r: Row): boolean {
  return r.usado === true || r.usado === "true" || r.usado === "SI";
}

export function claveCliente(r: Row): string {
  // Misma cédula normalizada (RUC 001, «.0») = misma clienta; uniones a mano de 🔗 Duplicados (clientes_alias).
  return claveIdentidad(r.id_3, s(r.nombre) + " " + s(r.apellido), normCedulaVieja) || "t:" + s(r.beta_num || r.sheet_row || r.id);
}

export interface LineaVenta {
  clase: string;
  sku: string;
  nombre: string;
  cantidad: number;
  precio: number;
  descuento_pct: number;
  costo?: number;
}

export function lineasTicket(t: Row, cats: Row[], prods: Row[]): LineaVenta[] {
  const out: LineaVenta[] = [];
  const fac = s(t.facial_hecho);
  if (fac && fac !== "-" && fac !== "—") {
    const sku = facialSku(fac) || "";
    out.push({ clase: "servicio", sku, nombre: rotulo(cats, prods, sku, fac), cantidad: 1, precio: precioDe(cats, prods, sku), descuento_pct: 0 });
  }
  for (const pack of [s(t.compra_pack_3), s(t.compra_pack_6)]) {
    if (!pack || pack.toLowerCase() === "false") continue;
    const sku = facialSku(pack) || skuCode(pack);
    out.push({ clase: "paquete", sku, nombre: rotulo(cats, prods, sku, pack), cantidad: 1, precio: precioDe(cats, prods, sku), descuento_pct: 0 });
  }
  const ex = s(t.servicios_adicionales);
  if (ex) {
    for (const pieza of ex.split("|")) {
      const p = pieza.trim();
      if (!p) continue;
      const sku = facialSku(p) || "";
      const tipos = tiposAmpolla(p);
      const cortesia = /\[CORTESIA[^\]]*\]/i.exec(p);
      let nombre = rotulo(cats, prods, sku, p).replace(/\s*·[\s\S]*$/, "").replace(/\s*\[CORTESIA[^\]]*\]/i, "").trim();
      if (tipos.length) nombre += " · " + tipos.join(", ");
      if (cortesia) nombre += " " + cortesia[0];
      out.push({
        clase: "extra", sku, nombre, cantidad: cantAmpollas(p),
        precio: cortesia ? 0 : precioDe(cats, prods, sku), descuento_pct: 0,
      });
    }
  }
  for (const pr of productQtys(t)) {
    out.push({
      clase: "producto", sku: pr.sku, nombre: nombreDe(cats, prods, pr.sku), cantidad: pr.qty,
      precio: precioDe(cats, prods, pr.sku), descuento_pct: 0, costo: costoDe(prods, pr.sku),
    });
  }
  return out;
}

function precioDe(cats: Row[], prods: Row[], sku: string): number {
  const c = skuCode(sku);
  if (!c) return 0;
  const cat = cats.find((r) => skuCode(r.sku) === c);
  if (cat && n(cat.subtotal) > 0) return round2(n(cat.subtotal));
  if (cat && n(cat.total_con_iva) > 0) return round2(n(cat.total_con_iva) / IVA);
  const p = prods.find((r) => skuCode(r.sku) === c);
  if (p && n(p.precio_venta) > 0) return round2(n(p.precio_venta) / IVA);
  return 0;
}
function costoDe(prods: Row[], sku: string): number {
  const p = prods.find((r) => skuCode(r.sku) === skuCode(sku));
  return p ? n(p.costo_promedio) : 0;
}
function nombreDe(cats: Row[], prods: Row[], sku: string): string {
  const c = skuCode(sku);
  const cat = cats.find((r) => skuCode(r.sku) === c);
  if (cat && s(cat.producto_servicio || cat.nombre)) return s(cat.producto_servicio || cat.nombre);
  const p = prods.find((r) => skuCode(r.sku) === c);
  return s(p?.nombre) || sku;
}

/** Nombre de catálogo. Si la ficha solo trae el código, se queda el texto de la línea. */
function rotulo(cats: Row[], prods: Row[], sku: string, fallback: string): string {
  const cat = nombreDe(cats, prods, sku);
  if (cat && cat !== sku && skuCode(cat) !== skuCode(sku)) return cat;
  const limpio = s(fallback).replace(new RegExp("^" + s(sku).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*", "i"), "").trim();
  return limpio || s(fallback) || cat || sku;
}

/** TK-YYYYMMDD-####. Un TK-ROW-n o la fila de la hoja no se muestran. TEST-TK- se deja igual. */
export function numeroTicket(r: Row): string {
  const beta = s(r.beta_num);
  if (/^TEST-TK-\d{8}-\d+$/.test(beta)) return beta;
  if (/^TK-\d{8}-\d+$/.test(beta)) return beta;
  const ymd = ymdUtc(r.timestamp).replace(/-/g, "");
  const toma = (raw: string) => {
    const nro = raw.replace(/\D/g, "").replace(/^0+/, "") || "0";
    const cuerpo = nro.padStart(4, "0");
    return ymd ? `TK-${ymd}-${cuerpo}` : `TK-${cuerpo}`;
  };
  const rowM = /^TK-ROW-(\d+)$/i.exec(beta);
  if (rowM) return toma(rowM[1]);
  const plain = /^TK-(\d+)$/.exec(beta);
  if (plain) return toma(plain[1]);
  if (r.sheet_row != null && s(r.sheet_row) !== "") return toma(s(r.sheet_row));
  if (beta && !/row/i.test(beta)) return beta;
  return ymd ? `TK-${ymd}-0000` : "TK";
}

/** Clave con la que se guarda. El número que se lee es numeroTicket. */
export function claveTicket(r: Row): string {
  if (s(r.beta_num)) return s(r.beta_num);
  if (r.sheet_row != null && s(r.sheet_row) !== "") return String(r.sheet_row);
  return String(r.id ?? "");
}

export function recalcular(lineas: LineaVenta[], descuento: number, cfg?: ComCfg, opts?: { pagaFacial?: boolean }): {
  lineas: LineaVenta[]; subtotal: number; iva: number; total: number;
  comProductos: number; comFacial: number;
} {
  const out = lineas.filter((ln) => n(ln.cantidad) > 0 || ln.clase === "servicio").map((ln) => ({
    clase: s(ln.clase) || "producto",
    sku: s(ln.sku),
    nombre: s(ln.nombre) || s(ln.sku),
    cantidad: n(ln.cantidad) || (ln.clase === "servicio" ? 1 : 0),
    precio: round2(n(ln.precio)),
    descuento_pct: n(ln.descuento_pct),
    costo: n(ln.costo),
  })).filter((ln) => ln.cantidad > 0);
  let sub = 0;
  let comP = 0;
  let comF = 0;
  for (const ln of out) {
    const neto = round2(ln.cantidad * ln.precio * (1 - (ln.descuento_pct || 0) / 100));
    sub += neto;
    if (ln.clase === "producto") {
      const over = cfg?.productoSku?.[skuCode(ln.sku)];
      const margen = Math.max(0, neto - ln.costo * ln.cantidad);
      if (over && (over.pct != null || over.fijo != null)) {
        if (over.pct != null) comP += margen * over.pct;
        if (over.fijo != null) comP += over.fijo * ln.cantidad;
      } else comP += margen * (cfg?.pctProd ?? 0.3);
    }
    if (ln.clase === "servicio" && opts?.pagaFacial !== false) {
      const sku = facialSku(ln.sku) || facialSku(ln.nombre) || "";
      const overF = sku && cfg?.facialSku && cfg.facialSku[sku] != null ? cfg.facialSku[sku] : null;
      const tarifa = overF != null ? overF : (FACIALES_2.includes(sku) ? (cfg?.facial2 ?? 2) : FACIALES_3.includes(sku) ? (cfg?.facial3 ?? 3) : 0);
      const base = ln.precio > 0 ? ln.precio * ln.cantidad : 0;
      // TK121: facial en $0 (canje de paquete / cortesía) paga la tarifa completa; no sale del precio $0.
      const ratio = base > 0 ? Math.min(1, neto / base) : 1;
      comF += tarifa * ratio * ln.cantidad;
    }
  }
  sub = round2(Math.max(0, sub - (n(descuento) || 0)));
  const iva = round2(sub * 0.15);
  return { lineas: out, subtotal: sub, iva, total: round2(sub + iva), comProductos: round2(comP), comFacial: round2(comF) };
}

export function mapaQty(lineas: LineaVenta[], clase: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const ln of lineas) {
    if (ln.clase !== clase) continue;
    const k = skuCode(ln.sku) || s(ln.nombre);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + n(ln.cantidad));
  }
  return m;
}

export async function recetaDe(db: Db, sku: string, cant: number): Promise<{ sku: string; producto_id: string; qty: number }[]> {
  if (!(cant > 0)) return [];
  const servicios = await db.all("erp_servicios");
  const want = skuCode(facialSku(sku) || sku);
  const serv = servicios.find((r) => skuCode(s(r.codigo)) === want || skuCode(facialSku(s(r.codigo)) || "") === want);
  if (!serv) return [];
  const receta = (await db.all("erp_receta")).filter((r) => r.servicio_id === serv.id);
  const prods = await db.all("erp_productos");
  return receta.map((rc) => {
    const p = prods.find((r) => r.id === rc.producto_id);
    return { sku: s(p?.sku), producto_id: String(rc.producto_id), qty: n(rc.cantidad) * cant };
  }).filter((r) => r.qty > 0);
}

export function patchProductos(lineas: LineaVenta[]): Row {
  const patch: Row = {};
  for (const c of PROD_COLS) patch[c.col] = c.typ === "numeric" ? 0 : "";
  for (const ln of lineas) {
    if (ln.clase !== "producto") continue;
    const col = prodCol(ln.sku);
    if (!col) continue;
    patch[col.col] = col.typ === "numeric" ? ln.cantidad : String(ln.cantidad);
  }
  return patch;
}

export function textoFacial(lineas: LineaVenta[]): string {
  return lineas.filter((ln) => ln.clase === "servicio").map((ln) => (s(ln.sku) && s(ln.nombre).includes(s(ln.sku)) ? s(ln.nombre) : (s(ln.sku) + " " + s(ln.nombre)).trim())).filter(Boolean).join(" | ");
}
export function textoPack(lineas: LineaVenta[], cual: "3" | "6"): string {
  const packs = lineas.filter((ln) => ln.clase === "paquete");
  const hit = cual === "6"
    ? packs.find((ln) => /x\s*6|pack\s*6|6 ses/i.test(ln.nombre)) || packs[1]
    : packs.find((ln) => !/x\s*6|pack\s*6|6 ses/i.test(ln.nombre)) || packs[0];
  if (!hit) return "";
  return (s(hit.sku) + " " + s(hit.nombre)).trim();
}
export function textoExtras(lineas: LineaVenta[]): string {
  return lineas.filter((ln) => ln.clase === "extra").map((ln) => (s(ln.sku) + " " + s(ln.nombre)).trim()).join(" | ");
}

export function kardexPrevio(row: Row, lineasViejas: LineaVenta[]): Record<string, number> {
  const orig = row.orig && typeof row.orig === "object" ? row.orig as Row : {};
  const posted = orig.kardex && typeof orig.kardex === "object" ? orig.kardex as Row : null;
  if (posted) {
    const m: Record<string, number> = {};
    for (const [k, v] of Object.entries(posted)) m[k] = n(v);
    return m;
  }
  const deHoja = s(row.origin) !== "beta" || s(orig.fuente) === "ov_save";
  if (!deHoja) return {};
  const m: Record<string, number> = {};
  for (const ln of lineasViejas) {
    if (ln.clase !== "producto") continue;
    const k = skuCode(ln.sku);
    if (k) m["venta:" + k] = (m["venta:" + k] || 0) + ln.cantidad;
  }
  return m;
}

interface GrupoCliente {
  key: string;
  cedula: string;
  nombres: string;
  apellido: string;
  visitas: number;
  ultima: string;
  total: number;
  cosmetologa: string;
  fila: string;
}

/** Código visible de clienta: C-00001 = primera fila del registro (fila 2 de la hoja). Filas creadas en beta: C-B00001. */
export function codigoCliente(r: Row | undefined): string {
  const sr = Math.trunc(n(r?.sheet_row));
  if (sr > 1) return "C-" + String(sr - 1).padStart(5, "0");
  if (sr < 0) return "C-B" + String(-sr).padStart(5, "0");
  return "";
}

export function claveRegistro(r: Row): string {
  return claveIdentidad(r.cedula, (s(r.nombre) + " " + s(r.apellido)).trim(), normCedulaVieja) || "r:" + s(r.sheet_row || r.id);
}

function aplicarTicket(g: GrupoCliente, r: Row): void {
  g.visitas += 1;
  const fecha = ymdUtc(r.timestamp);
  if (fecha >= g.ultima) {
    g.ultima = fecha;
    g.cosmetologa = s(r.atendido_por);
    if (s(r.nombre)) g.nombres = s(r.nombre);
    if (s(r.apellido)) g.apellido = s(r.apellido);
    if (!g.cedula && s(r.id_3)) g.cedula = s(r.id_3).split(".")[0];
  }
  // estimado es el total con IVA guardado en el ticket (hoja y beta).
  if (!esCancelado(r)) g.total = round2(g.total + n(r.estimado));
}

export function normBusca(v: unknown): string {
  return s(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n || Math.abs(m - n) > 2) return 3;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let min = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < min) min = v;
    }
    if (min > 2) return 3;
    prev = cur;
  }
  return prev[n];
}

/** 0 = no coincide. Desde 3 caracteres tolera palabras parciales, otro orden y un typo corto. */
export function puntajeCliente(c: Row, qRaw: string): number {
  const q = normBusca(qRaw);
  if (!q) return 1;
  const completo = normBusca([c.nombres, c.nombre, c.apellido].filter(Boolean).join(" "));
  const ced = normCedula(c.cedula);
  const qCed = q.replace(/\D/g, "").replace(/^0+/, "");
  const words = completo.split(" ").filter(Boolean);
  const qWords = q.split(" ").filter(Boolean);
  let score = 0;
  if (qCed && ced) {
    if (ced === qCed) score = 1000;
    else if (q.length >= 3 && ced.startsWith(qCed)) score = 820;
    else if (q.length >= 3 && ced.includes(qCed)) score = 640;
  }
  if (completo === q) score = Math.max(score, 960);
  if (q.length < 3) {
    if (completo.includes(q) || (qCed && ced.includes(qCed))) score = Math.max(score, 200 + q.length);
    return score;
  }
  if (!qWords.length) return score;
  const used = new Set<number>();
  let wordScore = 0;
  for (const qw of qWords) {
    let best = 0;
    let idx = -1;
    words.forEach((w, i) => {
      if (used.has(i)) return;
      let p = 0;
      if (w === qw) p = 140;
      else if (w.startsWith(qw) || (qw.startsWith(w) && w.length >= 3)) p = 100;
      else if (w.includes(qw) || (qw.length >= 4 && w.length >= 3 && qw.includes(w))) p = 80;
      else {
        const allow = qw.length >= 7 ? 2 : 1;
        const d = distancia(w, qw);
        if (d > 0 && d <= allow) p = 60 - d * 15;
      }
      if (p > best) { best = p; idx = i; }
    });
    const dig = qw.replace(/\D/g, "");
    if (dig.length >= 3 && ced.includes(dig)) best = Math.max(best, 90);
    if (!best) return score;
    if (idx >= 0) used.add(idx);
    wordScore += best;
  }
  return Math.max(score, 400 + wordScore);
}

function veTelefono(ses: SesLite): boolean {
  const completo: Ses = { ...ses, color: "", token: "" };
  return conTelefono(completo);
}

export function ordenarClientes(rows: Row[], q: string): Row[] {
  if (!normBusca(q)) return rows;
  return rows
    .map((r, i) => ({ r, i, p: puntajeCliente(r, q) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map((x) => x.r);
}


// ── Lecturas livianas (Emilia 17/11: Clientes tardaba): solo las columnas que se usan, en paralelo.
const TK_LIGERO = ["id", "sheet_row", "beta_num", "timestamp", "atendido_por", "nombre", "apellido", "id_3", "estimado", "borrado_at"];
/** Tickets con columnas mínimas; los cancelados/anulados llevan orig.anulado para que no sumen. */
export async function ticketsLigeros(db: Db): Promise<Row[]> {
  try {
    const [rows, anul] = await Promise.all([
      consultar(db, "tickets", { cols: TK_LIGERO }),
      consultar(db, "tickets", { cols: ["id"], filtros: [{ op: "or", de: [{ col: "orig->>anulado", op: "eq", val: "true" }, { col: "orig->>cancelado", op: "eq", val: "true" }] }] }),
    ]);
    const A = new Set(anul.rows.map((r) => String(r.id)));
    for (const r of rows.rows) if (A.has(String(r.id))) r.orig = { anulado: true };
    return rows.rows;
  } catch { return await db.all("tickets"); }
}
/** Tickets completos de una clienta (por su clave), sin bajar la tabla entera. */
export async function ticketsDeClave(db: Db, key: string): Promise<Row[]> {
  try {
    const idx = (await consultar(db, "tickets", { cols: ["id", "sheet_row", "beta_num", "nombre", "apellido", "id_3"] })).rows.filter((r) => claveCliente(r) === key);
    if (!idx.length) return [];
    if (idx.some((r) => r.id == null)) throw new Error("sin id");
    const out: Row[] = [];
    for (let i = 0; i < idx.length; i += 150) out.push(...(await consultar(db, "tickets", { filtros: [{ col: "id", op: "in", val: idx.slice(i, i + 150).map((r) => n(r.id)) }] })).rows);
    return out;
  } catch { return (await db.all("tickets")).filter((r) => claveCliente(r) === key); }
}
/** Registros (QR) completos de una clienta por su clave. */
export async function registrosDeClave(db: Db, key: string): Promise<Row[]> {
  try {
    const idx = (await consultar(db, "clientas_registro", { cols: ["id", "sheet_row", "cedula", "nombre", "apellido"] })).rows.filter((r) => claveRegistro(r) === key);
    if (!idx.length) return [];
    if (idx.some((r) => r.id == null)) throw new Error("sin id");
    return (await consultar(db, "clientas_registro", { filtros: [{ col: "id", op: "in", val: idx.slice(0, 150).map((r) => n(r.id)) }] })).rows;
  } catch { return (await db.all("clientas_registro").catch(() => [] as Row[])).filter((r) => claveRegistro(r) === key); }
}
const REG_LIGERO = ["id", "sheet_row", "cedula", "nombre", "apellido", "borrado_at", "sector_donde_vive", "telefono"];
export async function registrosLigeros(db: Db): Promise<Row[]> {
  try { return (await consultar(db, "clientas_registro", { cols: REG_LIGERO })).rows; } catch { return await db.all("clientas_registro").catch(() => [] as Row[]); }
}
export async function clientesResumen(db: Db, ses: SesLite, admin: boolean, verTodos = admin): Promise<Row> {
  let [rows, regs] = await Promise.all([ticketsLigeros(db), registrosLigeros(db)]);
  if (!verTodos) rows = rows.filter((r) => esPropio(s(r.atendido_por), ses));
  const map = new Map<string, GrupoCliente>();
  // Oculta solo si TODOS sus registros están borrados (con clientas unidas, uno borrado no esconde a las demás).
  const vivas = new Set(regs.filter((r) => !r.borrado_at).map((r) => claveRegistro(r)));
  const ocultas = new Set(regs.filter((r) => r.borrado_at).map((r) => claveRegistro(r)).filter((k) => !vivas.has(k)));
  const fichas = new Map<string, Row>();
  const codigos = new Map<string, { sr: number; cod: string }>();
  for (const r of regs) {
    if (r.borrado_at) continue;
    const k = claveRegistro(r);
    fichas.set(k, r);
    const cod = codigoCliente(r);
    const sr = Math.abs(n(r.sheet_row));
    const prev = codigos.get(k);
    if (cod && (!prev || sr < prev.sr)) codigos.set(k, { sr, cod });
  }
  const telOk = veTelefono(ses);
  if (verTodos) {
    for (const r of regs) {
      if (r.borrado_at) continue;
      const nombres = s(r.nombre);
      const apellido = s(r.apellido);
      const cedula = s(r.cedula).split(".")[0];
      if (!nombres && !apellido && !normCedula(cedula)) continue;
      const key = claveRegistro(r);
      if (map.has(key)) continue;
      map.set(key, { key, cedula, nombres, apellido, visitas: 0, ultima: "", total: 0, cosmetologa: "", fila: s(r.sheet_row) });
    }
  }
  for (const r of rows) {
    if (!s(r.nombre) && !s(r.apellido) && !normCedula(r.id_3)) continue;
    const key = claveCliente(r);
    if (ocultas.has(key)) continue;
    let g = map.get(key);
    if (!g) {
      const nom = normNombre((s(r.nombre) + " " + s(r.apellido)).trim());
      if (nom) {
        for (const cur of map.values()) {
          if (normNombre((cur.nombres + " " + cur.apellido).trim()) === nom) { g = cur; break; }
        }
      }
    }
    if (!g) {
      g = { key, cedula: s(r.id_3).split(".")[0], nombres: s(r.nombre), apellido: s(r.apellido), visitas: 0, ultima: "", total: 0, cosmetologa: "", fila: "" };
      map.set(key, g);
    }
    aplicarTicket(g, r);
  }
  const clientes = [...map.values()].map((g) => {
    const ficha = fichas.get(g.key);
    const item: Row = {
      key: g.key, fila: g.fila, cedula: g.cedula, nombres: g.nombres, apellido: g.apellido,
      nombre: (g.nombres + " " + g.apellido).trim(),
      visitas: g.visitas, ultima: g.ultima, cosmetologa: g.cosmetologa,
      sector: s(ficha?.sector_donde_vive),
      codigo: codigos.get(g.key)?.cod || "",
    };
    if (telOk) item.telefono = s(ficha?.telefono);
    if (admin) item.total = round2(g.total);
    return item;
  }).sort((a, b) => s(b.ultima).localeCompare(s(a.ultima)) || s(a.nombre).localeCompare(s(b.nombre)));
  return { ok: true, admin, clientes };
}

function usosPaquete(r: Row): { usado: boolean; fecha: string }[] {
  return USO_FIELDS.map(([u, f]) => ({ usado: r[u] === true || r[u] === "true" || !!s(r[f]), fecha: s(r[f]) }));
}

export async function paquetesDe(db: Db, ced: string, nom: string): Promise<Row[]> {
  let rows: Row[] = [];
  // Ajustes beta del paquete (sesiones, clienta, producto, baja): beta_paquete_ajustes.
  const AJ = new Map(((await db.all("beta_paquete_ajustes").catch(() => [] as Row[])) as Row[]).map((a) => [String(a.paquete_id), a]));
  try {
    // Índice liviano → solo se bajan completos los paquetes de esta clienta.
    const idx = (await consultar(db, "paquetes", { cols: ["id", "cedula", "nombres", "apellidos", "borrado_at"] })).rows.filter((r0) => {
      const r = aplicarAjuste(r0, AJ.get(String(r0.id)) || null);
      const pc = normCedula(r.cedula), pn = normNombre((s(r.nombres) + " " + s(r.apellidos)).trim());
      return (ced && (pc === ced || cedulasCompatibles(r.cedula, ced))) || (nom && pn === nom && (!ced || !pc));
    });
    if (idx.some((r) => r.id == null)) throw new Error("sin id");
    for (let i = 0; i < idx.length; i += 150) rows.push(...(await consultar(db, "paquetes", { filtros: [{ col: "id", op: "in", val: idx.slice(i, i + 150).map((r) => r.id as string | number) }] })).rows);
  } catch {
    try { rows = await db.all("paquetes"); } catch { return []; }
  }
  const out: Row[] = [];
  for (const r0 of rows) {
    if (r0.borrado_at) continue;
    const aj = AJ.get(String(r0.id)) || null;
    const r = aplicarAjuste(r0, aj);
    if (r.__borrado === true) continue;
    const pc = normCedula(r.cedula);
    const pn = normNombre((s(r.nombres) + " " + s(r.apellidos)).trim());
    if (!(ced && (pc === ced || cedulasCompatibles(r.cedula, ced))) && !(nom && pn === nom && (!ced || !pc))) continue;
    const v = vistaPaquete(r0, aj);
    const corte = v.sesiones as Row[];
    out.push({
      id: r0.id, fila: r0.sheet_row, codigo: s(v.codigo), sku: s(r.sku), nombre: s(r.paquete) || s(r.sku) || "Paquete",
      usados: v.usados, pendientes: v.pendientes, total: v.total, estado: s(v.estado), fechaCompra: s(v.fechaCompra), factura: s(v.factura), ticketOrigen: s(v.ticketOrigen),
      usos: corte.map((u) => ({ slot: u.slot, usado: u.usado, fecha: u.fecha || (u.texto ? s(u.texto) : ""), cosmetologa: u.cosmetologa })),
    });
  }
  return out;
}

/** TK111: paquetes de la clienta ligados a un ticket (vendido en él, misma factura o sesión usada ese día), completos incluidos. */
export function paquetesDelTicket(paqs: Row[], t: Row, clave = ""): Row[] {
  const dia = s(t.timestamp).slice(0, 10), fac = s(t.fac_7).replace(/\.0+$/, "").replace(/^0+/, "");
  const facSeq = (x: unknown) => { const m = s(x).replace(/\.0+$/, "").match(/(\d+)$/); return m ? String(Number(m[1])) : ""; };
  const claves = [clave, s(t.so_num), s(t.beta_num)].filter(Boolean);
  return paqs.filter((p) => (s(p.ticketOrigen) && claves.includes(s(p.ticketOrigen))) ||
    (fac && /^\d+$/.test(fac) && facSeq(p.factura) === String(Number(fac))) ||
    (dia && (s(p.fechaCompra) === dia || ((p.usos as Row[]) || []).some((u) => u.usado && s(u.fecha) === dia))));
}

export async function clienteDetalle(db: Db, ses: SesLite, admin: boolean, key: string, verTodos = admin): Promise<Row> {
  // En paralelo y liviano: tickets de la clienta, catálogo, productos (sin fotos) y su registro.
  let [rows, cats, prods, regs] = await Promise.all([
    ticketsDeClave(db, key),
    db.all("catalogo").catch(() => [] as Row[]),
    consultar(db, "erp_productos", { cols: ["id", "sku", "nombre", "clase", "uso", "precio_venta", "beta_pvp", "costo_promedio", "activo"] }).then((x) => x.rows).catch(() => db.all("erp_productos").catch(() => [] as Row[])),
    registrosDeClave(db, key),
  ]);
  if (!verTodos) rows = rows.filter((r) => esPropio(s(r.atendido_por), ses));
  const ficha = regs.find((r) => !r.borrado_at && claveRegistro(r) === key) || {};
  if (!s(ficha.cedula) && !s(ficha.nombre) && regs.some((r) => r.borrado_at && claveRegistro(r) === key)) {
    return { error: "Esa clienta está eliminada" };
  }
  if (!rows.length && !s(ficha.nombre) && !s(ficha.apellido) && !normCedula(ficha.cedula)) {
    return { error: "No hay visitas de esa clienta en tus tickets" };
  }
  if (!verTodos && !rows.length) return { error: "No hay visitas de esa clienta en tus tickets" };
  const primero = rows.length ? [...rows].sort((a, b) => ymdUtc(b.timestamp).localeCompare(ymdUtc(a.timestamp)))[0] : null;
  const ced = normCedula(primero?.id_3 || ficha.cedula);
  const nom = normNombre(((primero ? s(primero.nombre) : s(ficha.nombre)) + " " + (primero ? s(primero.apellido) : s(ficha.apellido))).trim());
  const paquetes = await paquetesDe(db, ced, nom);
  // Clientas unidas a mano (🔗 Duplicados): también sus paquetes.
  for (const k of clavesDe(key)) {
    if (k === key) continue;
    const extra = await paquetesDe(db, k.startsWith("c:") ? k.slice(2) : "", k.startsWith("n:") ? k.slice(2) : "");
    for (const x of extra) if (!paquetes.some((y) => String(y.id) === String(x.id))) paquetes.push(x);
  }
  let total = 0;
  const tickets = rows.map((r) => {
    if (!esCancelado(r)) total += n(r.estimado);
    const lineas = lineasTicket(r, cats, prods);
    const item: Row = {
      ref: numeroTicket(r),
      clave: claveTicket(r),
      id: r.id,
      fecha: ymdUtc(r.timestamp), hora: s(r.timestamp).slice(11, 16),
      cosmetologa: s(r.atendido_por), nombre: s(r.nombre), apellido: s(r.apellido), cedula: s(r.id_3),
      facial: s(r.facial_hecho), pack3: s(r.compra_pack_3), pack6: s(r.compra_pack_6),
      extras: s(r.servicios_adicionales), notas: s(r.notas_generales),
      gift_card: s(r.gift_card), paquete: s(r.paquete),
      lineas: admin ? lineas : lineas.map((ln) => ({ clase: ln.clase, sku: ln.sku, nombre: ln.nombre, cantidad: ln.cantidad })),
    };
    if (admin) {
      item.estimado = n(r.estimado);
      item.subtotal = round2(n(r.estimado) / IVA);
      item.iva = round2(n(r.estimado) - n(item.subtotal));
      item.total = n(r.estimado);
    }
    return item;
  }).sort((a, b) => s(b.fecha).localeCompare(s(a.fecha)));
  const nombres = s(primero?.nombre) || s(ficha.nombre);
  const apellido = s(primero?.apellido) || s(ficha.apellido);
  const cliente: Row = {
    key, cedula: s(primero?.id_3) || s(ficha.cedula).split(".")[0],
    nombres, apellido, nombre: (nombres + " " + apellido).trim(),
    fila: s(ficha.sheet_row),
    telefono: s(ficha.telefono), email: s(ficha.email), notas: s(ficha.notas || ficha.observaciones),
    sector: s(ficha.sector_donde_vive), tipoPiel: s(ficha.tipo_de_piel), estado: s(ficha.estado_actual),
    alergias: s(ficha.alergias), medicacion: s(ficha.medicacion),
    condiciones: s(ficha.condiciones_medicas_o_dermatologicas_que_debamos_saber),
    nacimiento: ymdUtc(ficha.fecha_de_nacimiento), autorizaFotos: s(ficha.autoriza_fotos),
    visitas: tickets.length, ultima: s(tickets[0]?.fecha),
  };
  if (admin) cliente.total = round2(total);
  if (!veTelefono(ses)) {
    delete cliente.telefono;
    delete cliente.email;
  }
  return { ok: true, admin, cliente, tickets, paquetes };
}

export async function reporteConsumos(db: Db, p: Row): Promise<Row> {
  const desde = s(p.desde);
  const hasta = s(p.hasta);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return { error: "Indica desde y hasta (AAAA-MM-DD)" };
  const filtroSku = skuCode(p.sku);
  const filtroFac = s(p.facial).toLowerCase();
  const cats = await db.all("catalogo").catch(() => [] as Row[]);
  const prods = await db.all("erp_productos").catch(() => [] as Row[]);
  const venta = new Map<string, { sku: string; nombre: string; unidades: number }>();
  const cabina = new Map<string, { sku: string; nombre: string; unidades: number }>();
  const faciales = new Map<string, number>();
  for (const t of (await db.all("tickets")).filter((r) => !esCancelado(r))) {
    const fecha = ymdUtc(t.timestamp);
    if (!fecha || fecha < desde || fecha > hasta) continue;
    const fac = s(t.facial_hecho);
    if (fac && fac !== "-" && fac !== "—") {
      if (!filtroFac || fac.toLowerCase().includes(filtroFac)) faciales.set(fac, (faciales.get(fac) || 0) + 1);
      if (!filtroSku) {
        for (const rc of await recetaDe(db, fac, 1)) {
          const k = skuCode(rc.sku);
          const cur = cabina.get(k) || { sku: k, nombre: nombreDe(cats, prods, k), unidades: 0 };
          cur.unidades = round2(cur.unidades + rc.qty);
          cabina.set(k, cur);
        }
      }
    }
    for (const pr of productQtys(t)) {
      const k = skuCode(pr.sku);
      if (filtroSku && k !== filtroSku) continue;
      const cur = venta.get(k) || { sku: k, nombre: nombreDe(cats, prods, k), unidades: 0 };
      cur.unidades += pr.qty;
      venta.set(k, cur);
    }
    for (const pieza of s(t.servicios_adicionales).split("|")) {
      const pAmp = pieza.trim();
      if (!/SUNSU-15\b/i.test(pAmp)) continue;
      for (const rc of await recetaDe(db, "SUNSU-15", cantAmpollas(pAmp))) {
        const k = skuCode(rc.sku);
        if (filtroSku && k !== filtroSku) continue;
        const cur = cabina.get(k) || { sku: k, nombre: nombreDe(cats, prods, k), unidades: 0 };
        cur.unidades = round2(cur.unidades + rc.qty);
        cabina.set(k, cur);
      }
    }
    if (filtroSku && fac && (!filtroFac || fac.toLowerCase().includes(filtroFac))) {
      for (const rc of await recetaDe(db, fac, 1)) {
        if (skuCode(rc.sku) !== filtroSku) continue;
        const cur = cabina.get(filtroSku) || { sku: filtroSku, nombre: nombreDe(cats, prods, filtroSku), unidades: 0 };
        cur.unidades = round2(cur.unidades + rc.qty);
        cabina.set(filtroSku, cur);
      }
    }
  }
  const vArr = [...venta.values()].sort((a, b) => b.unidades - a.unidades);
  const cArr = [...cabina.values()].sort((a, b) => b.unidades - a.unidades);
  const fArr = [...faciales.entries()].map(([nombre, nFac]) => ({ nombre, n: nFac })).sort((a, b) => b.n - a.n);
  const totales = {
    unidadesVenta: vArr.reduce((a, r) => a + r.unidades, 0),
    unidadesCabina: round2(cArr.reduce((a, r) => a + r.unidades, 0)),
    faciales: fArr.reduce((a, r) => a + r.n, 0),
  };
  return { ok: true, desde, hasta, venta: vArr, cabina: cArr, faciales: fArr, totales };
}

export async function borradorConsig(db: Db, now: Date, p: Row): Promise<Row> {
  const provs = await db.all("erp_proveedores");
  const prov = provs.find((r) => r.id === p.proveedor_id || s(r.nombre).toLowerCase() === s(p.proveedor).toLowerCase());
  const nombre = s(prov?.nombre || p.proveedor);
  if (!nombre && !s(p.familia)) return { error: "Elige el proveedor" };
  const familia = familiaDe(nombre, s(p.familia));
  if (!familia) return { error: "Ese proveedor no tiene familia de consignación (HT, AS, ML, PH, JN)" };
  // Periodo elegido (Consignación en Compras, TK26): año + mes + quincena; si no, la quincena actual de siempre.
  const q = n(p.anio) && n(p.mes) ? quincenaDe(n(p.anio), n(p.mes), 1, (n(p.quincena) === 2 ? 2 : 1)) : quincenaActual(now, n(p.quincena) || undefined);
  const buffer = bufferDe(p.buffer);
  const prods = await db.all("erp_productos");
  const porSkuProd = new Map(prods.map((r) => [skuCode(s(r.sku)), r]));
  const precios = await cargarPreciosConsig(db, familia);
  const stock = await db.all("erp_stock");
  const ventaId = "11111111-1111-4111-8111-111111111111";
  // TK27: lo que está en la bodega CONSIGNACION también es stock en consignación (Venta + Consignación).
  const consigId = "66666666-6666-4666-8666-666666666666";
  const items: Row[] = [];
  const aliases = mapaAliases(await (async () => { try { return await db.all("beta_sku_alias"); } catch { return []; } })());
  const bods = await (async () => { try { return await db.all("erp_bodegas"); } catch { return []; } })();
  const bodDe = new Map(bods.map((b) => [String(b.id), b]));
  const canonDe = (code: string) => resolverSku(code, aliases, prods);
  const skuPagoDe = (pid: string, fallback: string) => {
    const pr = prods.find((r) => s(r.id) === pid);
    return pr ? skuCode(s(pr.sku_proveedor) || s(pr.sku)) || fallback : fallback;
  };
  const vendido = new Map<string, number>();
  const vistosMov = new Set<string>();
  try {
    for (const m of await db.all("erp_movimientos")) {
      const fecha = ymdUtc(m.fecha) || s(m.fecha).slice(0, 10);
      if (!fecha || fecha < q.ini || fecha > q.fin) continue;
      const pr = prods.find((r) => s(r.id) === s(m.producto_id));
      const sku = skuPagoDe(s(m.producto_id), skuCode(s(pr?.sku) || s(m.sku)));
      const fam = sku.startsWith(familia + "-") || skuCode(s(pr?.sku)).startsWith(familia + "-") || skuCode(s(pr?.sku_proveedor)).startsWith(familia + "-");
      if (!fam) continue;
      if (vendeDesdeCabina(pr || porSkuProd.get(sku), sku)) continue;
      const qPag = qtyPagableProveedor(m, bodDe.get(String(m.bodega_id)));
      if (!qPag && s(m.tipo) !== "venta" && s(m.tipo) !== "anulacion") continue;
      if (s(m.tipo) === "venta" || s(m.tipo) === "anulacion") {
        vistosMov.add(s(m.producto_id) || sku);
        if (qPag) vendido.set(sku, round2((vendido.get(sku) || 0) + qPag));
      }
    }
  } catch { /* sin kardex se usa el fallback de tickets */ }
  for (const t of await db.all("tickets")) {
    const fecha = ymdUtc(t.timestamp);
    if (!fecha || fecha < q.ini || fecha > q.fin) continue;
    for (const pr of productQtys(t)) {
      const raw = skuCode(pr.sku);
      const sku = canonDe(raw);
      const prod = porSkuProd.get(sku) || prods.find((r) => skuCode(s(r.sku_proveedor)) === raw || skuCode(s(r.codigo_interno)) === raw);
      const skuPago = skuCode(s(prod?.sku_proveedor) || sku || raw);
      if (!skuPago.startsWith(familia + "-") && !sku.startsWith(familia + "-") && !raw.startsWith(familia + "-")) continue;
      if (vendeDesdeCabina(prod || porSkuProd.get(sku), skuPago)) continue;
      // Si ya hay movimientos de este producto en el periodo, el kardex (con dueño) manda.
      if (prod && vistosMov.has(s(prod.id))) continue;
      vendido.set(skuPago, (vendido.get(skuPago) || 0) + pr.qty);
    }
  }
  const consumido = new Map<string, number>();
  let consumos: Row[] = [];
  try { consumos = await db.all("erp_consignacion_consumo"); } catch { consumos = []; }
  for (const c of consumos) {
    if (s(c.familia) !== familia) continue;
    if (s(c.quincena_ini).slice(0, 10) !== q.ini || s(c.quincena_fin).slice(0, 10) !== q.fin) continue;
    const sku = skuCode(c.sku);
    if (vendeDesdeCabina(porSkuProd.get(sku), sku)) continue;
    consumido.set(sku, (consumido.get(sku) || 0) + n(c.cantidad));
  }
  const vistos = new Set<string>();
  for (const pr of prods) {
    const sku = skuCode(pr.sku);
    if (vendeDesdeCabina(pr)) continue;
    if (!sku.startsWith(familia + "-") || pr.activo === false) continue;
    vistos.add(sku);
    // TK34: en Compras › Consignación, un producto apagado en la ficha del proveedor no entra al cálculo.
    if (p.soloConsig === true && s(pr.beta_origen) === "propio") continue;
    const hay = stock.filter((r) => r.producto_id === pr.id && (String(r.bodega_id) === ventaId || String(r.bodega_id) === consigId)).reduce((a, r) => a + n(r.cantidad), 0);
    const v = vendido.get(sku) || 0;
    const cns = consumido.get(sku) || 0;
    const paga = v;
    const res = precios.get(sku) || resolverPrecio(sku, { costo: n(pr.costo_promedio) });
    const compra = n(res.precio);
    items.push({
      sku, nombre: s(pr.nombre), stock: round2(hay), vendido: v, consumido: cns, paga,
      compra, precioFuente: res.fuente, ocNumero: res.oc_numero || "",
      sugerido: paga > 0 ? Math.ceil(paga * (1 + buffer)) : 0,
      subtotal: round2(paga * compra),
    });
  }
  for (const [sku, v] of vendido) {
    if (vendeDesdeCabina(porSkuProd.get(sku), sku)) continue;
    if (vistos.has(sku)) continue;
    const cns = consumido.get(sku) || 0;
    const paga = v;
    const res = precios.get(sku) || resolverPrecio(sku, { costo: 0 });
    items.push({ sku, nombre: sku, stock: 0, vendido: v, consumido: cns, paga, compra: n(res.precio), precioFuente: res.fuente, ocNumero: res.oc_numero || "", sugerido: Math.ceil(paga * (1 + buffer)), subtotal: round2(paga * n(res.precio)) });
    vistos.add(sku);
  }
  for (const [sku, cns] of consumido) {
    if (vendeDesdeCabina(porSkuProd.get(sku), sku)) continue;
    if (vistos.has(sku)) continue;
    const res = precios.get(sku) || resolverPrecio(sku, { costo: 0 });
    items.push({ sku, nombre: sku, stock: 0, vendido: 0, consumido: cns, paga: 0, compra: n(res.precio), precioFuente: res.fuente, ocNumero: res.oc_numero || "", sugerido: 0, subtotal: 0 });
  }
  items.sort((a, b) => s(a.sku).localeCompare(s(b.sku)));
  const fact = items.filter((it) => n(it.vendido) > 0);
  const restock = items.filter((it) => n(it.sugerido) > 0);
  const sub = round2(fact.reduce((a, it) => a + n(it.subtotal), 0));
  const iva = round2(sub * 0.15);
  return {
    ok: true,
    proveedor: { id: prov?.id || null, nombre, ruc: s(prov?.ruc) },
    familia, buffer, ...q,
    items, fact, restock,
    totales: { subtotal: sub, iva, total: round2(sub + iva) },
    nota: NOTA_LIQUIDACION_TK127,
  };
}
