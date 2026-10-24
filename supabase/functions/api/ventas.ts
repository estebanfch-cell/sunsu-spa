// Clientes, edición de tickets, consumos, quincena de consignación y saldo de gift card.
// El saldo vive en gift_cards.notas (SALDO:n), en orig.usos y, si 0015 ya corrió, en saldo.
// La quincena de proveedores es 1–15 y 16–fin. No es el ciclo de comisiones 26–25.

import type { Db } from "./db.ts";
import {
  FACIALES_2, FACIALES_3, IVA, PROD_COLS, USO_FIELDS, ecuadorParts, facialSku, n, normCedula, normNombre,
  packSesiones, prodCol, productQtys, round2, s, skuCode, ymdUtc, type ComCfg, type Row,
} from "./domain.ts";
import { logAccion } from "./lib.ts";
import { esPropio, type SesLite } from "./permisos.ts";

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

export function familiaSku(sku: string): string {
  const m = skuCode(sku).match(/^(HT|AS|ML|PH|JN)-/);
  return m ? m[1] : "";
}

export function familiaDe(nombre: string, familia?: string): string {
  const f = s(familia).toUpperCase();
  if (f) return f.replace(/[^A-Z]/g, "");
  const n = nombre.toLowerCase();
  if (n.includes("hebetronic") || n.includes("anua") || n.includes("common")) return "HT";
  if (n.includes("eyenlip")) return "AS";
  if (n.includes("esthe")) return "ML";
  if (n.includes("aphlora")) return "PH";
  if (n.includes("rire") || n.includes("holika")) return "JN";
  return "";
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

export function saldoGift(row: Row): number {
  if (row.usado === true || row.usado === "true" || row.usado === "SI") return 0;
  if (row.saldo != null && s(row.saldo) !== "" && Number.isFinite(Number(row.saldo))) return round2(n(row.saldo));
  const notas = s(row.notas);
  const m = notas.match(/SALDO:([\d.]+)/);
  if (m) return round2(Number(m[1]));
  const orig = row.orig && typeof row.orig === "object" ? row.orig as Row : null;
  if (orig && orig.saldo != null && s(orig.saldo) !== "") return round2(n(orig.saldo));
  const valor = s(row.valor);
  const v = parseFloat(valor.replace(",", "."));
  if (Number.isFinite(v) && v > 0 && !/[a-z]/i.test(valor)) return round2(v);
  const ape = parseFloat(s(row.apellido_comprador));
  if (Number.isFinite(ape) && ape > 0) return round2(ape);
  return 0;
}

function notasConSaldo(prev: string, saldo: number): string {
  const limpio = prev.replace(/(?:^|\s*\|\s*)SALDO:[\d.]+/g, "").replace(/^\s*\|\s*/, "").trim();
  const tag = "SALDO:" + saldo.toFixed(2);
  return limpio ? tag + " | " + limpio : tag;
}

export async function aplicarGiftCard(db: Db, actor: string, p: {
  codigo: string; aplica: number | null; ticket: string; usadoPor: string; facialPrecio: number; now?: Date;
}): Promise<Row> {
  const codigo = s(p.codigo).trim();
  if (!codigo) return { error: "Falta el código de la gift card" };
  const rows = (await db.all("gift_cards")).filter((r) => !r.borrado_at);
  const row = rows.find((r) => s(r.codigo_gc).toLowerCase() === codigo.toLowerCase() && !bUsado(r) && saldoGift(r) > 0)
    || rows.find((r) => s(r.codigo_gc).toLowerCase() === codigo.toLowerCase());
  if (!row) return { error: "Gift card no encontrada" };
  const logs = await db.all("log_acciones");
  const ya = logs.find((r) => s(r.accion) === "GIFT CARD" && s(r.detalle).includes("ticket=" + p.ticket) && s(r.detalle).includes("codigo=" + codigo));
  if (ya) {
    const saldo = saldoGift(row);
    const aplicado = n((s(ya.detalle).match(/monto=([\d.]+)/) || [])[1]);
    const facialCobro = p.facialPrecio > 0 ? round2(Math.max(0, p.facialPrecio - aplicado)) : 0;
    return { ok: true, codigo, aplicado, saldo, facialCobro, ya: true };
  }
  const saldo = saldoGift(row);
  if (!(saldo > 0)) return { error: "Esa gift card no tiene saldo" };
  let aplicado = p.aplica == null ? saldo : round2(p.aplica);
  if (p.facialPrecio > 0) aplicado = Math.min(aplicado, round2(p.facialPrecio));
  aplicado = Math.min(aplicado, saldo);
  if (!(aplicado > 0)) return { error: "Indica cuánto de la gift card se aplica" };
  if (p.aplica != null && p.aplica - saldo > 0.009 && !(p.facialPrecio > 0 && p.aplica > p.facialPrecio)) {
    return { error: "La gift card no alcanza. Saldo $" + saldo.toFixed(2) };
  }
  const nuevo = round2(saldo - aplicado);
  const facialCobro = p.facialPrecio > 0 ? round2(Math.max(0, p.facialPrecio - aplicado)) : 0;
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
  const ced = normCedula(r.id_3);
  if (ced) return "c:" + ced;
  const nom = normNombre(s(r.nombre) + " " + s(r.apellido));
  return nom ? "n:" + nom : "t:" + s(r.beta_num || r.sheet_row || r.id);
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
      out.push({ clase: "extra", sku, nombre: rotulo(cats, prods, sku, p), cantidad: 1, precio: precioDe(cats, prods, sku), descuento_pct: 0 });
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

export function recalcular(lineas: LineaVenta[], descuento: number, cfg?: ComCfg): {
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
    if (ln.clase === "servicio") {
      const sku = facialSku(ln.sku) || facialSku(ln.nombre) || "";
      const overF = sku && cfg?.facialSku && cfg.facialSku[sku] != null ? cfg.facialSku[sku] : null;
      const tarifa = overF != null ? overF : (FACIALES_2.includes(sku) ? (cfg?.facial2 ?? 2) : FACIALES_3.includes(sku) ? (cfg?.facial3 ?? 3) : 0);
      const base = ln.precio > 0 ? ln.precio * ln.cantidad : 0;
      const ratio = base > 0 ? Math.min(1, neto / base) : (neto > 0 ? 1 : 0);
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

export function claveRegistro(r: Row): string {
  const ced = normCedula(r.cedula);
  if (ced) return "c:" + ced;
  const nom = normNombre((s(r.nombre) + " " + s(r.apellido)).trim());
  if (nom) return "n:" + nom;
  return "r:" + s(r.sheet_row || r.id);
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
  g.total = round2(g.total + n(r.estimado));
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

export function ordenarClientes(rows: Row[], q: string): Row[] {
  if (!normBusca(q)) return rows;
  return rows
    .map((r, i) => ({ r, i, p: puntajeCliente(r, q) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map((x) => x.r);
}

export async function clientesResumen(db: Db, ses: SesLite, admin: boolean, verTodos = admin): Promise<Row> {
  let rows = await db.all("tickets");
  if (!verTodos) rows = rows.filter((r) => esPropio(s(r.atendido_por), ses));
  const map = new Map<string, GrupoCliente>();
  let regs: Row[] = [];
  try { regs = await db.all("clientas_registro"); } catch { regs = []; }
  const ocultas = new Set(regs.filter((r) => r.borrado_at).map((r) => claveRegistro(r)));
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
    const item: Row = {
      key: g.key, fila: g.fila, cedula: g.cedula, nombres: g.nombres, apellido: g.apellido,
      nombre: (g.nombres + " " + g.apellido).trim(),
      visitas: g.visitas, ultima: g.ultima, cosmetologa: g.cosmetologa,
    };
    if (admin) item.total = round2(g.total);
    return item;
  }).sort((a, b) => s(b.ultima).localeCompare(s(a.ultima)) || s(a.nombre).localeCompare(s(b.nombre)));
  return { ok: true, admin, clientes };
}

function usosPaquete(r: Row): { usado: boolean; fecha: string }[] {
  return USO_FIELDS.map(([u, f]) => ({ usado: r[u] === true || r[u] === "true" || !!s(r[f]), fecha: s(r[f]) }));
}

async function paquetesDe(db: Db, ced: string, nom: string): Promise<Row[]> {
  let rows: Row[] = [];
  try { rows = await db.all("paquetes"); } catch { return []; }
  const out: Row[] = [];
  for (const r of rows) {
    if (r.borrado_at) continue;
    const pc = normCedula(r.cedula);
    const pn = normNombre((s(r.nombres) + " " + s(r.apellidos)).trim());
    if (!(ced && pc === ced) && !(nom && pn === nom && (!ced || !pc))) continue;
    const usos = usosPaquete(r);
    const total = packSesiones(s(r.sku), s(r.paquete), usos);
    const corte = usos.slice(0, total);
    const usados = corte.filter((u) => u.usado).length;
    const orig = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
    out.push({
      codigo: s(orig.codigo), sku: s(r.sku), nombre: s(r.paquete) || s(r.sku) || "Paquete",
      usados, pendientes: Math.max(0, total - usados), total,
      usos: corte.map((u, i) => ({ slot: i + 1, usado: u.usado, fecha: u.fecha })),
    });
  }
  return out;
}

export async function clienteDetalle(db: Db, ses: SesLite, admin: boolean, key: string): Promise<Row> {
  let rows = (await db.all("tickets")).filter((r) => claveCliente(r) === key);
  if (!admin) rows = rows.filter((r) => esPropio(s(r.atendido_por), ses));
  const cats = await db.all("catalogo").catch(() => [] as Row[]);
  const prods = await db.all("erp_productos").catch(() => [] as Row[]);
  const regs = await db.all("clientas_registro").catch(() => [] as Row[]);
  const ficha = regs.find((r) => !r.borrado_at && claveRegistro(r) === key) || {};
  if (!s(ficha.cedula) && !s(ficha.nombre) && regs.some((r) => r.borrado_at && claveRegistro(r) === key)) {
    return { error: "Esa clienta está eliminada" };
  }
  if (!rows.length && !s(ficha.nombre) && !s(ficha.apellido) && !normCedula(ficha.cedula)) {
    return { error: "No hay visitas de esa clienta en tus tickets" };
  }
  if (!admin && !rows.length) return { error: "No hay visitas de esa clienta en tus tickets" };
  const primero = rows.length ? [...rows].sort((a, b) => ymdUtc(b.timestamp).localeCompare(ymdUtc(a.timestamp)))[0] : null;
  const ced = normCedula(primero?.id_3 || ficha.cedula);
  const nom = normNombre(((primero ? s(primero.nombre) : s(ficha.nombre)) + " " + (primero ? s(primero.apellido) : s(ficha.apellido))).trim());
  const paquetes = await paquetesDe(db, ced, nom);
  let total = 0;
  const tickets = rows.map((r) => {
    total += n(r.estimado);
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
  for (const t of await db.all("tickets")) {
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
  const q = quincenaActual(now, n(p.quincena) || undefined);
  const buffer = bufferDe(p.buffer);
  const prods = await db.all("erp_productos");
  const stock = await db.all("erp_stock");
  const ventaId = "11111111-1111-4111-8111-111111111111";
  const items: Row[] = [];
  const vendido = new Map<string, number>();
  for (const t of await db.all("tickets")) {
    const fecha = ymdUtc(t.timestamp);
    if (!fecha || fecha < q.ini || fecha > q.fin) continue;
    for (const pr of productQtys(t)) {
      if (!skuCode(pr.sku).startsWith(familia + "-")) continue;
      vendido.set(skuCode(pr.sku), (vendido.get(skuCode(pr.sku)) || 0) + pr.qty);
    }
  }
  const consumido = new Map<string, number>();
  let consumos: Row[] = [];
  try { consumos = await db.all("erp_consignacion_consumo"); } catch { consumos = []; }
  for (const c of consumos) {
    if (s(c.familia) !== familia) continue;
    if (s(c.quincena_ini) !== q.ini || s(c.quincena_fin) !== q.fin) continue;
    const sku = skuCode(c.sku);
    consumido.set(sku, (consumido.get(sku) || 0) + n(c.cantidad));
  }
  const vistos = new Set<string>();
  for (const pr of prods) {
    const sku = skuCode(pr.sku);
    if (!sku.startsWith(familia + "-") || pr.activo === false) continue;
    vistos.add(sku);
    const hay = stock.filter((r) => r.producto_id === pr.id && String(r.bodega_id) === ventaId).reduce((a, r) => a + n(r.cantidad), 0);
    const v = vendido.get(sku) || 0;
    const cns = consumido.get(sku) || 0;
    const paga = v + cns;
    const compra = n(pr.costo_promedio);
    items.push({
      sku, nombre: s(pr.nombre), stock: round2(hay), vendido: v, consumido: cns, compra,
      sugerido: paga > 0 ? Math.ceil(paga * (1 + buffer)) : 0,
      subtotal: round2(paga * compra),
    });
  }
  for (const [sku, v] of vendido) {
    if (vistos.has(sku)) continue;
    const cns = consumido.get(sku) || 0;
    const paga = v + cns;
    items.push({ sku, nombre: sku, stock: 0, vendido: v, consumido: cns, compra: 0, sugerido: Math.ceil(paga * (1 + buffer)), subtotal: 0 });
    vistos.add(sku);
  }
  for (const [sku, cns] of consumido) {
    if (vistos.has(sku)) continue;
    items.push({ sku, nombre: sku, stock: 0, vendido: 0, consumido: cns, compra: 0, sugerido: Math.ceil(cns * (1 + buffer)), subtotal: 0 });
  }
  items.sort((a, b) => s(a.sku).localeCompare(s(b.sku)));
  const fact = items.filter((it) => n(it.vendido) + n(it.consumido) > 0);
  const restock = items.filter((it) => n(it.sugerido) > 0);
  const sub = round2(fact.reduce((a, it) => a + n(it.subtotal), 0));
  const iva = round2(sub * 0.15);
  return {
    ok: true,
    proveedor: { id: prov?.id || null, nombre, ruc: s(prov?.ruc) },
    familia, buffer, ...q,
    items, fact, restock,
    totales: { subtotal: sub, iva, total: round2(sub + iva) },
    nota: "Los productos son entregados en modalidad de CONSIGNACIÓN. Sunsu Spa pagará lo vendido y lo pasado a cabina en la quincena, a precio de compra + IVA.",
  };
}
