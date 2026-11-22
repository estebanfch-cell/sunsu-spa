// Detalle de ticket de la beta (Emilia 17/11, como la orden de venta de MineCore).
import { compararLineasVisual, exigeJustificacionDescuento, resumenCuadre } from "./cuadre_lineas.ts";
import { mapaAliases } from "./inventario_modelo.ts";
// Lee el ticket del sistema (tabla tickets, que llena la hoja) y guarda lo editado SOLO en beta_tickets /
// beta_ticket_lineas (0048): cantidad, precio unitario, descuento y total por línea; descuento del ticket
// (% o $), promoción y exclusión de comisión. Admin edita directo; los demás piden el cambio (solicitudes).
import { extend, registroDe } from "./handlers.ts";
import { consultar, type Filtro } from "./query.ts";
import { leerFecha, FECHA_NO_ENTIENDO } from "./fecha_flexible.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, copiarAStorage, guardarArchivo, logAccion } from "./lib.ts";
import { esAdmin, esSuperAdmin } from "./permisos.ts";
import { b, colTicket, hmUtc, n, productQtys, round2, s, skuCode, ymdUtc, type Row } from "./domain.ts";
import { armarCatalogoTicket, preciosMigoDeTablas } from "./catalogo_ticket.ts";
import { contactoParaMostrar } from "./clientes_contacto.ts";
import { leerSerie } from "./series.ts";
import { citaDeNombre, citasRango, fechaCita } from "./acuity.ts";
import { conEmail, conTelefono } from "./lib.ts";
import { claveCliente, paquetesDe, paquetesDelTicket, parseGcCanje, recetaDe, saldoGift } from "./ventas.ts";
import { normCedula, normNombre } from "./domain.ts";
import { acceso, esPropio, matrizDe } from "./permisos.ts";
import { facturaTxt } from "./ticket_total.ts";
import { estadoCobro, esMetodoPago, filasPagoLegado, metodosPago } from "./pagos_caja.ts";
export { metodosPago } from "./pagos_caja.ts";
import { lineasTicket, precioLineaTicket } from "./productos.ts";
import { ETQ_SIN_COBRO, giftCortesia, nombreLineaGift, paqueteDeCanje, sesionPaquete, textoCanje, tipoSinCobro, valorNominalGift } from "./sin_cobro.ts";
import { listaProductos } from "./productos_api.ts";
import { SOLICITUD_HOOKS, veTicket } from "./inline_api.ts";
import { asegurarPaquetesVenta } from "./paquete_venta.ts";
import { alertaCanje } from "./canje_linea.ts";
import { calcularTicket, claveDe, type LineaTk, type Promo } from "./ticket_beta.ts";
import { cicloInicio, comisionFacialLinea, compraParaComision, marcaDePersona, pagaComisionFacial, toCosmMark } from "./domain.ts";
import { canonStaff, esNombreAdmin, listaStaffActivo } from "./tickets_staff.ts";
import { cfgAplicada } from "./comision_cfg.ts";
import { snapProducto, ventaNetaLineas } from "./productos.ts";
import { mapaCostoReal } from "./costos_reales.ts";
import { esDiferenciaMejora, esServicioSuelto, skuMigoABeta } from "./migo_lineas.ts";
import { fechaGye, namesMatch } from "./migo_cuadre.ts";
import { ajustarStockLineas } from "./tickets_cancelar_api.ts";

const FALTA = "Falta aplicar 0048_tickets_beta.sql";
const TIPOS = new Set(["producto", "facial", "extra", "paquete", "gift", "servicio"]);
async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
async function hay(ctx: Ctx): Promise<boolean> {
  try { await consultar(ctx.db, "beta_tickets", { limite: 1 }); return true; }
  catch { try { await ctx.db.all("beta_tickets"); return true; } catch { return false; } }
}
async function cabDe(ctx: Ctx, clave: string): Promise<Row | undefined> {
  try {
    const hit = (await consultar(ctx.db, "beta_tickets", { filtros: [{ col: "clave", op: "eq", val: clave }], limite: 1 })).rows[0];
    if (hit) return hit;
  } catch { /* cae a la tabla completa */ }
  return (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
}

export { tipoCatalogo } from "./catalogo_ticket.ts";
/** Catálogo para el buscador del ticket: hoja, ERP y todo producto facturado en Migo (TK95). */
export async function catalogoTicket(ctx: Ctx, ses: Ses): Promise<Row[]> {
  const prods = await listaProductos(ctx, ses);
  const migo = preciosMigoDeTablas(await todas(ctx, "beta_migo_lineas"), await todas(ctx, "beta_migo_facturas_vivo"));
  return armarCatalogoTicket(await todas(ctx, "catalogo"), prods, migo);
}
async function promosVigentes(ctx: Ctx): Promise<Promo[]> {
  const hoy = new Date(ctx.now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
  return (await todas(ctx, "promos")).filter((r) => s(r.nombre) && s(r.activa).toUpperCase() !== "NO" && r.activa !== false && s(r.desde).slice(0, 10) <= hoy && hoy <= s(r.hasta).slice(0, 10))
    .map((r) => ({ nombre: s(r.nombre), tipo: s(r.tipo).toUpperCase() || "%", valor: n(r.valor), valor2: n(r.valor2), codigos: s(r.codigos).split(",").map((x) => x.trim()).filter(Boolean) }));
}
export async function ticketPorClave(ctx: Ctx, clave: string): Promise<Row | null> {
  const k = s(clave).trim();
  if (!k) return null;
  const fila = /^r\d+$/.test(k) ? k.slice(1) : "";
  // Búsqueda directa (antes bajaba la tabla entera en cada apertura/guardado del ticket).
  try {
    const de: Filtro[] = [{ col: "so_num", op: "eq", val: k }, { col: "beta_num", op: "eq", val: k }];
    if (fila) de.push({ col: "sheet_row", op: "eq", val: Number(fila) });
    if (/^\d{1,9}$/.test(k)) de.push({ col: "id", op: "eq", val: Number(k) });
    const hit = (await consultar(ctx.db, "tickets", { filtros: [{ op: "or", de }], limite: 5 })).rows.filter((r) => !r.borrado_at);
    const x = hit.find((r) => leerSerie(r, "so_num") === k || s(r.beta_num) === k || (fila && s(r.sheet_row) === fila) || s(r.id) === k);
    if (x) return x;
  } catch { /* cae a la búsqueda completa */ }
  const rows = (await ctx.db.all("tickets")).filter((r) => !r.borrado_at);
  return rows.find((r) => leerSerie(r, "so_num") === k || s(r.beta_num) === k || (fila && s(r.sheet_row) === fila) || s(r.id) === k) || null;
}
export function docsDe(r: Row): Row[] {
  const urls = (v: unknown) => s(v).split(/\s*\|\s*|\s*,\s*(?=https?:|archivo:)|\s+(?=https?:|archivo:)/).map((x) => x.trim()).filter((x) => /^(https?:|archivo:[-\w]+$)/.test(x));
  const out: Row[] = [];
  for (const u of urls(colTicket(r, "comprobante"))) out.push({ tipo: "comprobante", nombre: "Comprobante de pago", url: u });
  urls(colTicket(r, "fotos_antes")).forEach((u, i) => out.push({ tipo: "foto", nombre: "Foto antes " + (i + 1), url: u }));
  urls(colTicket(r, "fotos_despues")).forEach((u, i) => out.push({ tipo: "foto", nombre: "Foto después " + (i + 1), url: u }));
  urls(colTicket(r, "fotos")).forEach((u, i) => out.push({ tipo: "foto", nombre: "Foto " + (i + 1), url: u }));
  return out;
}
/** Líneas del ticket: las de la beta si se editó; si no, las del sistema con el precio cobrado (real o prorrateado). */
/** Códigos marcados «[CORTESIA…]» al crear el ticket (servicios adicionales): van en $0 con la píldora Cortesía. */
export function cortesiasDe(r: Row): Set<string> {
  const out = new Set<string>();
  for (const part of s(r.servicios_adicionales).split("|")) {
    if (!/\[CORTES[IÍ]A/i.test(part)) continue;
    const m = part.trim().match(/^(SUNSU-[A-Z]{0,3}-?\d+|[A-Z]{2,3}-\d{3})/i);
    if (m) out.add(skuCode(m[1]));
  }
  return out;
}
/** TK72 (Emilia 18/11): la factura Migo del ticket (Ventas Detalladas), si está cargada: líneas con IVA tal cual se facturaron. */
export async function facturaMigoDe(ctx: Ctx, fac: string): Promise<{ total: number; lineas: { sku: string; nombre: string; cantidad: number; unitCon: number; descCon: number; totalCon: number }[] } | null> {
  const dig = s(fac).replace(/\.0+$/, "").replace(/\D/g, "").replace(/^0+/, "");
  if (!dig) return null;
  const pad = dig.padStart(9, "0");
  const es = (f: unknown) => s(f).replace(/\D/g, "").replace(/^0+/, "").endsWith(dig) && s(f).replace(/\D/g, "").slice(-9) === pad;
  const F: Filtro = { op: "palabras", cols: ["factura"], val: [pad] };
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const armar = (L: Row[]) => L.map((l) => {
    const cant = n(l.cantidad) || 1, sub = n(l.subtotal), iva = n(l.iva);
    const tot = n(l.total) || r2(sub + (iva || sub * 0.15));
    const unitSin = n(l.precio_unit) || (cant ? sub / cant : 0);
    const unitCon = r2(unitSin * 1.15), bruto = r2(unitCon * cant);
    return { sku: skuMigoABeta(s(l.codigo || l.sku) || s(l.producto)), nombre: s(l.producto || l.nombre), cantidad: cant, unitCon, descCon: Math.max(0, r2(bruto - tot)), totalCon: r2(tot) };
  }).filter((l) => l.sku || l.nombre);
  try {
    const v = (await consultar(ctx.db, "beta_migo_facturas_vivo", { cols: ["factura", "total", "lineas"], filtros: [F], limite: 3 })).rows.find((x) => es(x.factura));
    if (v && Array.isArray(v.lineas) && (v.lineas as Row[]).length) return { total: n(v.total), lineas: armar(v.lineas as Row[]) };
  } catch { /* sin tabla */ }
  try {
    const L = (await consultar(ctx.db, "beta_migo_lineas", { cols: ["factura", "codigo", "producto", "cantidad", "precio_unit", "subtotal", "iva", "total"], filtros: [F], limite: 60 })).rows.filter((x) => es(x.factura));
    if (L.length) { const ls = armar(L); return { total: r2(ls.reduce((a, l) => a + l.totalCon, 0)), lineas: ls }; }
  } catch { /* sin tabla */ }
  return null;
}
/** TK195: factura del ticket por fac_7 o, si falta, cruce estricto clienta+fecha+total (solo lectura; no escribe el vínculo). */
export async function facturaMigoDeTicket(ctx: Ctx, r: Row): Promise<{ total: number; lineas: { sku: string; nombre: string; cantidad: number; unitCon: number; descCon: number; totalCon: number }[]; factura?: string } | null> {
  const fac = s(r.fac_7);
  if (b(r.fac) || fac) {
    const fm = await facturaMigoDe(ctx, fac);
    if (fm) return { ...fm, factura: fac };
  }
  const cobrado = n(r.estimado);
  const nom = (s(r.nombre) + " " + s(r.apellido)).trim();
  if (!(cobrado > 0) || !nom) return null;
  const fechas = [...new Set([fechaGye(r.timestamp), ymdUtc(r.timestamp), ymdUtc(r.created_at)].filter(Boolean))];
  for (const ymd of fechas) {
    try {
      const rows = (await consultar(ctx.db, "beta_migo_facturas_vivo", { cols: ["factura", "fecha", "cliente", "total", "lineas"], filtros: [{ col: "fecha", op: "eq", val: ymd } as Filtro], limite: 80 })).rows;
      const hits = rows.filter((x) => Math.abs(n(x.total) - cobrado) <= 1 && namesMatch(nom, x.cliente) >= 2 && Array.isArray(x.lineas) && (x.lineas as Row[]).length);
      if (hits.length === 1) {
        // facturaMigoDe identifica por los últimos dígitos (fac_7), no por el 001-001-completo.
        const fm = await facturaMigoDe(ctx, s(hits[0].factura).replace(/\D/g, "").slice(-9));
        if (fm) return { ...fm, factura: s(hits[0].factura) };
      }
    } catch { /* sin tabla o filtro */ }
  }
  return null;
}
/** TK195: si la gift no tiene precio (o quedó el PVP muerto de SUNSU-34), usa lo cobrado menos las otras líneas. */
export function asignarCobradoGift(lineas: LineaTk[], cobrado: number): void {
  const gifts = lineas.filter((l) => l.tipo === "gift");
  if (gifts.length !== 1 || !(cobrado > 0)) return;
  const otros = lineas.filter((l) => l.tipo !== "gift" && l.tipo !== "diferencia");
  const sumaOtros = round2(otros.reduce((a, l) => {
    const bruto = round2(n(l.cantidad) * n(l.precio_unit));
    const desc = l.descuento_tipo === "$" ? n(l.descuento_valor) : l.descuento_tipo === "%" ? round2(bruto * n(l.descuento_valor) / 100) : 0;
    return a + bruto - desc;
  }, 0));
  const resto = round2(cobrado - sumaOtros);
  if (resto <= 0.05) return;
  const g = gifts[0];
  const actual = round2(n(g.cantidad) * n(g.precio_unit));
  if (!(actual > 0) || (Math.abs(actual - 34.5) <= 0.05 && Math.abs(resto - actual) > 0.05)) {
    g.precio_unit = n(g.cantidad) ? round2(resto / n(g.cantidad)) : resto;
    g.estimado = false;
  }
}
export function alertaDescuadreCobrado(cobrado: number, sumaLineas: number): string | null {
  if (!(cobrado > 0) || Math.abs(round2(cobrado) - round2(sumaLineas)) <= 0.05) return null;
  const c = round2(cobrado).toFixed(2), s0 = round2(sumaLineas).toFixed(2);
  return "Lo cobrado ($" + c + ") no cuadra con las líneas ($" + s0 + "). Revisa y vincula la factura de Migo; no se añade una línea «Diferencia sin explicar».";
}
/** TK98: cortesía de gift card y consumo interno: líneas a $0 con su píldora (nunca «Sin líneas»). */
async function lineasDe(ctx: Ctx, r: Row, cab: Row | undefined, cat: Row[]): Promise<LineaTk[]> {
  const L = await lineasDe0(ctx, r, cab, cat);
  const sc = tipoSinCobro(r);
  if (!sc) return L;
  if (sc === "canje") {
    // TK99: canje de sesión de paquete en $0: todo a $0 como canje; la línea dice el paquete y la sesión n/N.
    const ses = sesionPaquete(r)!;
    let pq: Row | null = null;
    try { pq = paqueteDeCanje(await paquetesDe(ctx.db, normCedula(s(r.id_3 || r.cedula)), normNombre(s(r.nombre) + " " + s(r.apellido))), ymdUtc(r.timestamp), ses); } catch { pq = null; }
    const txt = textoCanje(pq, ses);
    const outC = L.filter((l) => l.tipo !== "diferencia").map((l) => ({ ...l, precio_unit: 0, descuento_tipo: null, descuento_valor: 0, estimado: false, canje: true, cortesia: false }) as LineaTk);
    if (outC.some((l) => /sesi[oó]n \d+\/\d+/i.test(s(l.nombre)))) return outC.map((l) => ({ ...l, paqueteSesion: txt }) as LineaTk);
    const i = outC.findIndex((l) => l.tipo === "facial");
    if (i >= 0) outC[i] = { ...outC[i], nombre: s(outC[i].nombre) + " · " + txt, paqueteSesion: txt } as LineaTk;
    else outC.unshift({ tipo: "paquete", sku: s(pq?.sku) || "PAQ", nombre: txt + (pq ? " · " + s(pq.nombre) : ""), cantidad: 1, precio_unit: 0, descuento_tipo: null, descuento_valor: 0, excluir_comision: true, estimado: false, canje: true, paqueteSesion: txt } as LineaTk);
    return outC;
  }
  const out = L.filter((l) => l.tipo !== "diferencia").map((l) => {
    if (sc === "interno") return { ...l, precio_unit: 0, descuento_tipo: null, descuento_valor: 0, estimado: false, consumoInterno: true } as LineaTk;
    return !(n(l.precio_unit) > 0) ? { ...l, cortesia: true, estimado: false } as LineaTk : l;
  });
  const g = sc === "cortesia" ? giftCortesia(r.venta_gift) : null;
  const nominal = g ? valorNominalGift(g, cat) : 0;
  // Línea de gift card ya materializada (TK98): conserva su valor nominal para mostrarlo.
  if (g) for (const l of out) if (l.tipo === "gift" && s(l.nombre).includes(g.codigo)) { l.valorNominal = nominal; l.gcCodigo = g.codigo; l.cortesia = true; }
  if (g && !out.some((l) => l.tipo === "gift" && s(l.nombre).includes(g.codigo))) {
    out.push({ tipo: "gift", sku: "35", nombre: nombreLineaGift(g, nominal), cantidad: 1, precio_unit: 0, descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: false, cortesia: true, valorNominal: nominal, gcCodigo: g.codigo } as LineaTk);
  }
  return out;
}
async function lineasDe0(ctx: Ctx, r: Row, cab: Row | undefined, cat: Row[]): Promise<LineaTk[]> {
  const cort = cortesiasDe(r);
  if (cab && cab.lineas_beta === true) {
    let rows: Row[] = [];
    try { rows = (await consultar(ctx.db, "beta_ticket_lineas", { filtros: [{ col: "ticket_clave", op: "eq", val: s(cab.clave) }] })).rows; }
    catch { rows = (await todas(ctx, "beta_ticket_lineas")).filter((l) => s(l.ticket_clave) === s(cab.clave)); }
    return rows.sort((a, b0) => n(a.orden) - n(b0.orden))
      .map((l) => ({ id: s(l.id), tipo: s(l.tipo), sku: s(l.sku), nombre: s(l.nombre), cantidad: n(l.cantidad), precio_unit: n(l.precio_unit), descuento_tipo: s(l.descuento_tipo) || null, descuento_valor: n(l.descuento_valor), excluir_comision: l.excluir_comision === true, estimado: l.estimado === true, ...(s(l.tipo) === "facial" && !(n(l.precio_unit) > 0) && canjeFacial(r) ? { canje: true } : {}), ...(!(n(l.precio_unit) > 0) && cort.has(skuCode(s(l.sku))) ? { cortesia: true } : {}), ...(esDiferenciaMejora(l) ? { mejoraPaquete: true } : {}), promo: s(l.promo) || undefined, total_linea: n(l.total_linea) }));
  }
  const porCode = new Map(cat.map((c) => [s(c.sku), c]));
  const pvpDe = (c: string) => n(porCode.get(skuCode(c))?.pvp);
  const L0 = lineasTicket(r, pvpDe);
  const cobrado = n(r.estimado);
  // Facial canjeado (sesión de paquete o gift card de facial): va en $0.
  const canjeF = canjeFacial(r);
  // TK72: si la factura Migo del ticket está cargada y cuadra con lo cobrado, las líneas son las de la factura.
  const fm = await facturaMigoDeTicket(ctx, r);
  if (fm && fm.lineas.length && Math.abs(fm.total - cobrado) <= 1) {
    const nombreCat = (c: string) => s(porCode.get(skuCode(c))?.nombre);
    const tipoCat = (c: string) => s(porCode.get(skuCode(c))?.tipo) || (L0.find((x) => skuCode(x.codigo) === skuCode(c))?.tipo) || "producto";
    const outF: LineaTk[] = [];
    for (const l of L0) {
      if (canjeF && l.tipo === "facial" && !fm.lineas.some((x) => skuCode(x.sku) === skuCode(l.codigo))) outF.push({ tipo: l.tipo, sku: l.codigo, nombre: nombreCat(l.codigo) || l.codigo, cantidad: l.qty, precio_unit: 0, descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: false, canje: true });
      else if (cort.has(skuCode(l.codigo)) && !fm.lineas.some((x) => skuCode(x.sku) === skuCode(l.codigo))) outF.push({ tipo: l.tipo, sku: l.codigo, nombre: nombreCat(l.codigo) || l.codigo, cantidad: l.qty, precio_unit: 0, descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: false, cortesia: true });
    }
    for (const x of fm.lineas) outF.push({ tipo: tipoCat(x.sku), sku: x.sku, nombre: nombreCat(x.sku) || x.nombre, cantidad: x.cantidad, precio_unit: x.unitCon, descuento_tipo: x.descCon > 0 ? "$" : null, descuento_valor: x.descCon, excluir_comision: false, estimado: false });
    return outF;
  }
  // Descuento por línea al crear (orig.desc_lineas): esa línea va a precio de lista con su descuento real,
  // y lo cobrado restante se reparte entre las demás.
  const oD = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  const dl = new Map((Array.isArray(oD.desc_lineas) ? oD.desc_lineas as Row[] : []).map((x) => [skuCode(s(x.sku)), x]));
  let cobradoResto = cobrado;
  for (const [k, x] of dl) if (L0.some((l) => skuCode(l.codigo) === k)) cobradoResto -= n(x.bruto) - n(x.monto);
  const L = L0.filter((x) => !(canjeF && x.tipo === "facial") && !cort.has(skuCode(x.codigo)) && !dl.has(skuCode(x.codigo)));
  const nombreDe = (c: string) => s(porCode.get(skuCode(c))?.nombre) || c;
  const vistos = new Set<string>();
  const out: LineaTk[] = [];
  for (const l of L0) {
    const k = l.tipo + "|" + l.codigo;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const qty = L0.filter((x) => x.codigo === l.codigo && x.tipo === l.tipo).reduce((a, x) => a + x.qty, 0);
    if (canjeF && l.tipo === "facial") { out.push({ tipo: l.tipo, sku: l.codigo, nombre: nombreDe(l.codigo), cantidad: qty, precio_unit: 0, descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: false, canje: true }); continue; }
    if (cort.has(skuCode(l.codigo)) && l.tipo !== "facial") { out.push({ tipo: l.tipo, sku: l.codigo, nombre: nombreDe(l.codigo), cantidad: qty, precio_unit: 0, descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: false, cortesia: true }); continue; }
    const dx = dl.get(skuCode(l.codigo));
    if (dx && !(canjeF && l.tipo === "facial")) {
      const unitL = qty > 0 ? n(dx.bruto) / qty : n(dx.bruto);
      out.push({ tipo: l.tipo, sku: l.codigo, nombre: nombreDe(l.codigo), cantidad: qty, precio_unit: round2(unitL), descuento_tipo: s(dx.modo) === "%" ? "%" : "$", descuento_valor: s(dx.modo) === "%" ? n(dx.valor) : n(dx.monto), excluir_comision: false, estimado: false, ...(s(dx.promo) ? { promo: s(dx.promo) } : {}) });
      continue;
    }
    // TK72: nunca se prorratea. Una sola línea cobrada = lo cobrado es su precio; varias = precio de catálogo.
    // TK195: lo que no cuadra NO se rellena con una línea DIF; se avisa en faltan y, si hay gift, se le asigna lo cobrado.
    const pr = precioLineaTicket(L, l.codigo, Math.max(0, round2(cobradoResto)));
    const unit = !pr.estimado && pr.unit != null ? pr.unit : (l.lista > 0 ? l.lista : 0);
    out.push({ tipo: l.tipo, sku: l.codigo, nombre: l.tipo === "gift" ? "Gift card" : nombreDe(l.codigo), cantidad: qty, precio_unit: round2(unit), descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: !(l.lista > 0) && (pr.estimado || pr.unit == null) });
  }
  asignarCobradoGift(out, cobrado);
  // TK81: con factura (aunque la compartan varios tickets), un servicio suelto con otro SKU al mismo precio y cantidad
  // es el de la factura (la factura manda): se muestra con el SKU y nombre de la factura.
  if (fm && fm.lineas.length) {
    const enTk = new Set(out.map((l) => skuCode(l.sku))), enFac = new Set(fm.lineas.map((x) => skuCode(x.sku)));
    for (const l of out) {
      if (l.canje || l.cortesia || enFac.has(skuCode(l.sku)) || !esServicioSuelto({ sku: skuCode(l.sku), nombre: l.nombre })) continue;
      const x = fm.lineas.find((y) => !enTk.has(skuCode(y.sku)) && esServicioSuelto({ sku: skuCode(y.sku), nombre: y.nombre }) && Math.abs(n(y.cantidad) - n(l.cantidad)) < 0.001 && Math.abs(n(y.totalCon) - round2(n(l.cantidad) * n(l.precio_unit))) <= 0.05);
      if (!x) continue;
      enTk.add(skuCode(x.sku));
      (l as Row).corregidoFactura = l.sku;
      l.sku = skuCode(x.sku); l.nombre = s(porCode.get(skuCode(x.sku))?.nombre) || x.nombre;
    }
  }
  return out;
}
function promoDe(cab: Row | undefined, promos: Promo[]): Promo | null {
  const nom = s(cab?.promo_nombre);
  return nom ? promos.find((p) => p.nombre === nom) || null : null;
}
/** TK84: nota gris si la factura Migo del ticket está a nombre de otra persona (no es error). */
async function otroNombre(ctx: Ctx, r: Row): Promise<boolean> {
  try {
    const L = (await consultar(ctx.db, "beta_cuadre_link", { filtros: [{ col: "ticket_id", op: "eq", val: n(r.id) }], limite: 1 })).rows[0];
    if (!L || !s(L.cliente_migo)) return false;
    const { facturadoAOtroNombre } = await import("./migo_cuadre.ts");
    return facturadoAOtroNombre(s(r.nombre) + " " + s(r.apellido), L.cliente_migo);
  } catch { return false; }
}
/** TK184 (Emilia t801u): líneas de producto que llegaron solo con el código (factura de Migo: «SUNSU-AS-002»)
 *  → nombre del catálogo, para que la tarjeta de tratamiento no salga con la compra vacía. */
export async function nombresDeSku(ctx: Ctx, lineas: Row[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const codigos = [...new Set(lineas.filter((l) => s(l.tipo) === "producto").map((l) => {
    const sku = s(l.sku).trim().toUpperCase(), nom = s(l.nombre).trim();
    return !nom || /^(SUNSU-)?[A-Z]{2,3}-\d{3}$/i.test(nom) || nom.toUpperCase() === sku ? (sku || nom.replace(/^SUNSU-/i, "").toUpperCase()) : "";
  }).filter(Boolean))];
  if (!codigos.length) return out;
  try {
    const rows = (await consultar(ctx.db, "erp_productos", { cols: ["sku", "nombre"], filtros: [{ col: "sku", op: "in", val: codigos }], limite: 50 })).rows;
    for (const r of rows) if (s(r.sku) && s(r.nombre)) out[s(r.sku).toUpperCase()] = s(r.nombre);
  } catch { /* sin catálogo: la tarjeta usa el código */ }
  return out;
}
export async function vistaTicket(ctx: Ctx, ses: Ses, r: Row): Promise<Row> {
  const so = leerSerie(r, "so_num"), clave = claveDe(r, so);
  const cab = await cabDe(ctx, clave);
  const [promos, cat] = await Promise.all([
    promosVigentes(ctx),
    // Si las líneas ya están en la beta, no hace falta bajar el catálogo entero (el cliente lo pide en segundo plano).
    (cab && cab.lineas_beta === true) ? Promise.resolve([] as Row[]) : catalogoTicket(ctx, ses),
  ]);
  const L = await lineasDe(ctx, r, cab, cat);
  const promo = cab && s(cab.promo_nombre) ? (promoDe(cab, promos) || { nombre: s(cab.promo_nombre), tipo: "$", valor: n(cab.promo_monto), codigos: [] }) : null;
  const calc = calcularTicket(L, { tipo: s(cab?.descuento_tipo) || null, valor: n(cab?.descuento_valor) }, promo);
  const orig = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  const anulado = orig.anulado === true;
  const fac = b(r.fac), cob = b(r.cob);
  const usoPaquete = /^\s*SI\b/i.test(s(r.paquete));
  const exclSistema = { facial: b(r.excluir_facial), paquete: b(r.excluir_paquete), producto: b(r.excluir_producto), extras: b(r.excluir_extras) };
  const exclBeta = cab?.excluir_cosmetologa === true || calc.lineas.some((l) => l.excluir_comision);
  const admin = esAdmin(ses.rol);
  const nombresSku = await nombresDeSku(ctx, calc.lineas as unknown as Row[]);
  // TK207: el aviso compara la suma de TODOS los pagos no anulados con el total de las líneas
  // (nunca el estimado de la hoja, que puede ser un solo cobro o un descuento mal aplicado).
  let betaPagosAlerta: Row[] = [];
  try { betaPagosAlerta = (await consultar(ctx.db, "beta_pagos", { filtros: [{ col: "ticket_clave", op: "eq", val: clave }] })).rows.filter((x) => x.anulado !== true); }
  catch { betaPagosAlerta = []; }
  const avisoCobro = alertaDescuadreCobrado(sumaPagosBeta(betaPagosAlerta), calc.total);
  const dFac = cab && cab.datos && typeof cab.datos === "object" ? (cab.datos as Row).factura : "";
  let linkFac: unknown = "";
  try {
    const ln = (await consultar(ctx.db, "beta_cuadre_link", { filtros: [{ col: "ticket_id", op: "eq", val: n(r.id) }], limite: 1 })).rows[0];
    linkFac = ln?.factura;
  } catch { linkFac = ""; }
  const facRealLed = hayFactura(r.fac_7, dFac, linkFac);
  const faltaFacLed = faltaFacturaTicket({ anulado, facReal: facRealLed, total: calc.total, fecha: ymdUtc(r.timestamp) });
  return {
    ok: true, clave, admin, falta: (await hay(ctx)) ? "" : FALTA, nombresSku,
    ticket: {
      clave, id: r.id ?? null, soNum: so, betaNum: s(r.beta_num), sheetRow: r.sheet_row ?? null, fecha: ymdUtc(r.timestamp), hora: hmUtc(r.timestamp),
      nombre: s(r.nombre), apellido: s(r.apellido), cedula: s(r.id_3), cosmetologa: s(r.atendido_por),
      cobradoSistema: round2(n(r.estimado)), factura: facturaTxt(r.fac_7) || facturaTxt(dFac) || facturaTxt(linkFac), comprobante: s(r.comp),
      notas: s(r.notas_generales), recomendaciones: s(r.recomendaciones), retorno: s(r.fecha_retorno).slice(0, 10), paquete: s(r.paquete),
      estado: anulado ? "anulado" : estaCobrado(r, dFac, linkFac) && (facRealLed || fac) ? "cerrado" : "abierto",
      cancelado: anulado ? { motivo: s(orig.cancelado_motivo), por: s(orig.cancelado_por), ts: s(orig.cancelado_ts) } : null,
      leds: [
        { k: "estado", t: anulado ? "Cancelado" : estaCobrado(r, dFac, linkFac) && (facRealLed || fac) ? "Cerrado" : "Abierto", c: anulado ? "x" : estaCobrado(r, dFac, linkFac) && (facRealLed || fac) ? "ok" : "c" },
        { k: "fac", t: facRealLed ? "Facturado" + ((facturaTxt(r.fac_7) || facturaTxt(dFac) || facturaTxt(linkFac)) && !/sin/i.test(facturaTxt(r.fac_7) || facturaTxt(dFac) || facturaTxt(linkFac)) ? " " + (facturaTxt(r.fac_7) || facturaTxt(dFac) || facturaTxt(linkFac)) : "") : (faltaFacLed ? "Falta factura" : "Sin factura"), c: facRealLed ? "ok" : (faltaFacLed ? "faltafactura" : "off") },
        { k: "cob", t: estaCobrado(r) ? "Cobrado" : "Por cobrar", c: estaCobrado(r) ? "ok" : "r" },
        ...(usoPaquete ? [{ k: "paq", t: "Paquete " + s(r.paquete).replace(/^\s*SI,?\s*/i, ""), c: "a" }] : []),
        ...(exclBeta || Object.values(exclSistema).some(Boolean) ? [{ k: "com", t: "Comisión excluida", c: "r" }] : []),
        ...(cab ? [{ k: "beta", t: "Editado", c: "a" }] : []),
      ],
    },
    lineas: calc.lineas, totales: { sumaLineas: calc.sumaLineas, promo: calc.promoMonto, descuento: calc.descuentoMonto, descuentoTotal: calc.descuentoTotal, subtotal: calc.subtotal, iva: calc.iva, total: calc.total },
    descuento: { tipo: s(cab?.descuento_tipo) || null, valor: n(cab?.descuento_valor) }, promo: promo ? promo.nombre : "",
    excluirCosmetologa: cab?.excluir_cosmetologa === true, excluirNota: s(cab?.excluir_nota), exclSistema,
    editado: !!cab, lineasBeta: cab?.lineas_beta === true, historial: Array.isArray(cab?.historial) ? cab!.historial : [],
    documentos: [...docsDe(r), ...docsBeta(cab)], faltan: [...faltaDe(r, (cab?.datos || {}) as Row), ...(cab?.lineas_beta === true && ymdUtc(r.timestamp) >= FALTA_DESDE ? alertaCanje(r, calc.lineas as unknown as Row[], await paquetesDe(ctx.db, normCedula(s(r.id_3)), normNombre(s(r.nombre) + " " + s(r.apellido))).catch(() => []), !!parseGcCanje(r.gift_card) && !/^\s*SI\b/i.test(s(r.paquete))) : []), ...(avisoCobro ? [avisoCobro] : [])], promos, puedeEditar: admin && !anulado, puedeCancelar: admin && !anulado, puedePedir: !admin,
    productosSistema: productQtys(r).length,
    ...(await extrasTicket(ctx, ses, r, cab, calc.total)),
    ...(await cuadreVista(ctx, r, calc.lineas as unknown as Row[], cab)),
    staff: await listaStaffActivo(ctx),
    edicion: await (await import("./ticket_edicion_api.ts")).edicionPendienteDe(ctx, claveDe(r, leerSerie(r, "so_num"))),
  };
}

async function cuadreVista(ctx: Ctx, r: Row, lineas: Row[], cab: Row | undefined): Promise<Row> {
  const d = (cab?.datos && typeof cab.datos === "object" ? cab.datos : {}) as Row;
  const just = s(d.justificacion_descuento);
  try {
    const links = (await consultar(ctx.db, "beta_cuadre_link", { filtros: [{ col: "ticket_id", op: "eq", val: n(r.id) }], limite: 5 })).rows;
    const facs = [...new Set(links.flatMap((L) => [s(L.factura), ...((Array.isArray(L.facturas) ? L.facturas as string[] : []))] ).filter(Boolean))];
    const facTxt = s(d.factura) || facturaTxt(r.fac_7);
    if (!facs.length && facTxt) facs.push(facTxt);
    if (!facs.length) return { cuadre_lineas: [], cuadre: null, justificacion_descuento: just || "" };
    const vivos = (await todas(ctx, "beta_migo_facturas_vivo")).filter((f) => facs.includes(s(f.factura)));
    const lineasFac = vivos.flatMap((f) => (Array.isArray(f.lineas) ? f.lineas as Row[] : []));
    const aliases = mapaAliases(await todas(ctx, "beta_sku_alias").catch(() => [] as Row[]));
    const tk = { ...r, lineas, lineasDetalle: lineas };
    // TK143: comparar contra la SUMA de todos los tickets vinculados a la misma factura.
    const linksGrupo = facs.length
      ? (await consultar(ctx.db, "beta_cuadre_link", { filtros: [{ col: "factura", op: "in", val: facs }], limite: 40 })).rows
      : links;
    const hermanos: Row[] = [];
    const visto = new Set<number>([n(r.id)]);
    for (const L of linksGrupo) {
      const id = n(L.ticket_id);
      if (!id || visto.has(id)) continue;
      visto.add(id);
      const h = (await consultar(ctx.db, "tickets", { filtros: [{ col: "id", op: "eq", val: id }], limite: 1 })).rows[0];
      if (!h || h.borrado_at) continue;
      const claveH = claveDe(h, leerSerie(h, "so_num"));
      const cabH = await cabDe(ctx, claveH);
      if (cabH && cabH.lineas_beta === true) {
        const bl = (await consultar(ctx.db, "beta_ticket_lineas", { filtros: [{ col: "ticket_clave", op: "eq", val: claveH }], limite: 80 })).rows
          .slice().sort((a, b0) => n(a.orden) - n(b0.orden))
          .map((l) => ({
            sku: s(l.sku), codigo: s(l.sku), producto: s(l.nombre), nombre: s(l.nombre), tipo: s(l.tipo),
            cantidad: n(l.cantidad) || 1, precio_unit: n(l.precio_unit), descuento: n(l.descuento_monto),
            total: n(l.total_linea), total_linea: n(l.total_linea),
            canje: l.canje === true, cortesia: l.cortesia === true,
          }));
        hermanos.push({ ...h, clave: claveH, lineas: bl, lineasDetalle: bl });
      } else {
        hermanos.push({ ...h, clave: claveH });
      }
    }
    const tks = [tk, ...hermanos];
    const cuadre_lineas = compararLineasVisual(tks, lineasFac, undefined, aliases, { focus: 0 });
    const hermanosClaves = hermanos.map((h) => s(h.clave || h.so_num)).filter(Boolean);
    const cuadre = resumenCuadre(cuadre_lineas, facs[0] || facTxt, { hermanos: hermanosClaves });
    return { cuadre_lineas, cuadre, justificacion_descuento: just || "", facturas_cuadre: facs, cuadre_hermanos: hermanosClaves };
  } catch {
    return { cuadre_lineas: [], cuadre: null, justificacion_descuento: just || "" };
  }
}

extend("tk_get", "any", async (p, ctx, ses) => {
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso para ver ese ticket" };
  return await vistaTicket(ctx, ses, r);
});
/** Subir el documento que falta (comprobante). Lo puede hacer quien ve el ticket aunque no pueda editarlo. */
extend("tk_subir_doc", "any", async (p, ctx, ses) => {
  if (!(await hay(ctx))) return { error: FALTA };
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso para ese ticket" };
  const x = await agregarComprobante(ctx, ses, r, p.imagen, s(p.clave), "subió comprobante", s(p.pago_id) || undefined, { total: n(p.total) });
  if (x.error) return x;
  return { ok: true, url: x.url, faltan: faltaDe(r, x.datos as Row), ...(x.ocr ? { ocr: x.ocr, cruce: x.cruce } : {}) };
});
/** TK183 (Emilia t797u): «Agregar fotos (Antes / Después)» en un ticket ya hecho (también cerrado). Quien ve el ticket
 *  puede agregarlas; quedan en la columna del ticket, así salen en el ticket y en la ficha → Documentos → Fotos con la
 *  fecha del ticket. Nunca reemplaza ni borra fotos anteriores. */
extend("tk_agregar_fotos", "any", async (p, ctx, ses) => {
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso para ese ticket" };
  const momento = s(p.momento) === "despues" ? "despues" : s(p.momento) === "antes" ? "antes" : "";
  if (!momento) return { error: "Elige Antes o Después" };
  const imgs = (Array.isArray(p.imagenes) ? p.imagenes : [p.imagen]).map(s).filter(Boolean).slice(0, 6);
  if (!imgs.length || imgs.some((x) => !/^data:image\//.test(x))) return { error: "Sube una foto" };
  const col = momento === "antes" ? "fotos_antes" : "fotos_despues";
  const actor = actorOf(ses), nuevos: string[] = [];
  for (const img of imgs) {
    const id = await guardarArchivo(ctx.db, actor, momento === "antes" ? "fotosAntes" : "fotosDespues", "ticket " + s(p.clave), img);
    if (!id) return { error: "La foto pesa más de 1.5 MB" + (nuevos.length ? " (se guardaron " + nuevos.length + ")" : "") };
    nuevos.push("archivo:" + id);
  }
  const prev = colTicket(r, col).split(/\s*\|\s*/).map((x) => x.trim()).filter((x) => /^(https?:|archivo:)/.test(x));
  const valor = [...prev, ...nuevos].join(" | ");
  const match = r.id != null ? { id: r.id } : { sheet_row: r.sheet_row };
  await ctx.db.write(actor, "tickets", "update", match, { [col]: valor });
  try { await logAccion(ctx.db, actor, "FOTOS AGREGAR", s(p.clave) + " · " + momento + " · " + nuevos.length); } catch { /* el log no tumba la subida */ }
  return { ok: true, momento, agregadas: nuevos.length, total: prev.length + nuevos.length };
});
/** Comprobantes vivos (no borrados) en beta_tickets.datos.comprobantes. */
export function compsVivos(d: Row | undefined): Row[] {
  const L = Array.isArray(d?.comprobantes) ? d!.comprobantes as Row[] : [];
  return L.filter((x) => x && x.borrado !== true && /https?:|archivo:/.test(s(x.url)));
}
export function archivoIdDe(url: unknown): string {
  const t = s(url);
  return t.startsWith("archivo:") ? t.slice(8) : t;
}
/** Última foto del ticket que todavía no está enlazada a un pago. */
export function fotoPendienteDe(d: Row | undefined): Row | undefined {
  return [...compsVivos(d)].reverse().find((x) => !s(x.pago_id));
}
/** TK157: lectura Claude Vision al subir (lo llena voucher_ocr_api.ts). Muta el item con ocr + cruce; nunca tumba la subida. */
export const OCR_HOOK: { leer?: (ctx: Ctx, r: Row, cab: Row | undefined, datos: Row, item: Row, img: string, extra?: { montoPago?: number; total?: number }) => Promise<void> } = {};
/** Guarda la foto (app_archivos + copia en Storage si se puede) y la agrega a beta_tickets.datos.comprobantes. */
export async function agregarComprobante(ctx: Ctx, ses: Ses, r: Row, imagen: unknown, nombre: string, detalle: string, pagoId?: string, extra?: { montoPago?: number; total?: number }): Promise<Row> {
  const img = s(imagen);
  if (!/^data:(image\/|application\/pdf)/.test(img)) return { error: "Sube una foto o PDF" };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const id = await guardarArchivo(ctx.db, actor, "comprobante", "Comprobante " + nombre, img);
  if (!id) return { error: "El archivo pesa más de 1.5 MB" };
  try { await copiarAStorage(ctx.env || {}, ctx.fetchImpl, "comprobantes", id, img); } catch { /* queda en app_archivos */ }
  const clave = claveDe(r, leerSerie(r, "so_num"));
  const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
  const datos = { ...((cab?.datos || {}) as Row) };
  const item: Row = { url: "archivo:" + id, por: ses.name, fecha: now, pago_id: pagoId || null };
  datos.comprobantes = [...(Array.isArray(datos.comprobantes) ? datos.comprobantes as Row[] : []), item].slice(-10);
  if (OCR_HOOK.leer && /^data:image\/(jpeg|png|webp);/.test(img)) { try { await OCR_HOOK.leer(ctx, r, cab, datos, item, img, extra); } catch { /* la foto se guarda igual */ } }
  const hist = [...(Array.isArray(cab?.historial) ? cab!.historial as Row[] : []), { fecha: now, actor, accion: "documento", detalle }].slice(-100);
  if (cab) await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos, historial: hist, actualizado_por: actor, updated_at: now });
  else await ctx.db.write(actor, "beta_tickets", "insert", {}, { clave, sheet_row: r.sheet_row ?? null, datos, historial: hist, actualizado_por: actor, updated_at: now });
  if (pagoId) {
    try { await ctx.db.write(actor, "beta_pagos", "update", { id: pagoId }, { comprobante_id: id }); } catch { /* columna aún no aplicada */ }
  }
  try { await logAccion(ctx.db, actor, "COMPROBANTE SUBIR", clave + (pagoId ? " · pago " + pagoId : "") + " · archivo:" + id); } catch { /* el log no tumba la subida */ }
  return { ok: true, url: "archivo:" + id, datos, archivo_id: id, ...(item.ocr ? { ocr: item.ocr, cruce: item.cruce } : {}) };
}
/** Enlaza una foto del ticket (la indicada, o la última pendiente) a un pago de la beta. */
export async function vincularComprobante(ctx: Ctx, ses: Ses, r: Row, pagoId: string, url?: string): Promise<Row> {
  const clave = claveDe(r, leerSerie(r, "so_num"));
  const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
  if (!cab) return { error: "Sin comprobante" };
  const datos = { ...((cab.datos || {}) as Row) };
  const L = Array.isArray(datos.comprobantes) ? datos.comprobantes as Row[] : [];
  const hit = (url ? L.find((x) => s(x.url) === s(url) && x.borrado !== true) : undefined)
    || [...L].reverse().find((x) => x && x.borrado !== true && !s(x.pago_id));
  if (!hit) return { error: "Sin comprobante" };
  hit.pago_id = pagoId;
  const actor = actorOf(ses), now = ctx.now.toISOString();
  await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos, actualizado_por: actor, updated_at: now });
  const aid = archivoIdDe(hit.url);
  try { await ctx.db.write(actor, "beta_pagos", "update", { id: pagoId }, { comprobante_id: aid }); } catch { /* columna aún no aplicada */ }
  return { ok: true, url: s(hit.url), comprobante_id: aid };
}
/** Marca borrado el comprobante (no se borra el archivo). Admin directo; staff vía solicitud. */
export async function quitarComprobante(ctx: Ctx, ses: Ses, r: Row, url: string): Promise<Row> {
  const clave = claveDe(r, leerSerie(r, "so_num"));
  const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
  if (!cab) return { error: "Comprobante no encontrado" };
  const datos = { ...((cab.datos || {}) as Row) };
  const L = Array.isArray(datos.comprobantes) ? datos.comprobantes as Row[] : [];
  const hit = L.find((x) => s(x.url) === s(url) && x.borrado !== true);
  if (!hit) return { error: "Comprobante no encontrado" };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  hit.borrado = true;
  hit.borrado_por = ses.name;
  hit.borrado_at = now;
  const hist = [...(Array.isArray(cab.historial) ? cab.historial as Row[] : []), { fecha: now, actor, accion: "documento", detalle: "quitó comprobante" }].slice(-100);
  await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos, historial: hist, actualizado_por: actor, updated_at: now });
  if (s(hit.pago_id)) {
    try { await ctx.db.write(actor, "beta_pagos", "update", { id: s(hit.pago_id) }, { comprobante_id: null }); } catch { /* ok */ }
  }
  try { await logAccion(ctx.db, actor, "COMPROBANTE QUITAR", clave + " · " + s(url)); } catch { /* ok */ }
  return { ok: true };
}
extend("tk_quitar_doc", "any", async (p, ctx, ses) => {
  if (!(await hay(ctx))) return { error: FALTA };
  if (!esAdmin(ses.rol)) return { error: "Solicita la eliminación a un admin", solicitud: true };
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso para ese ticket" };
  const url = s(p.url);
  if (!url) return { error: "Falta el comprobante" };
  return await quitarComprobante(ctx, ses, r, url);
});
extend("tk_catalogo", "any", async (_p, ctx, ses) => ({ ok: true, items: await catalogoTicket(ctx, ses), promos: await promosVigentes(ctx) }));

/** Valida y guarda lo propuesto (líneas, descuento, promo, exclusiones). Lo usan el admin y la solicitud aprobada. */
async function guardar(ctx: Ctx, ses: Ses, r: Row, p: Row): Promise<Row> {
  if (!(await hay(ctx))) return { error: FALTA };
  if ((r.orig as Row | undefined)?.anulado === true) return { error: "El ticket está cancelado: no se edita" };
  const so = leerSerie(r, "so_num"), clave = claveDe(r, so);
  const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
  const cat = await catalogoTicket(ctx, ses);
  const porCode = new Map(cat.map((c) => [s(c.sku), c]));
  const entrada = Array.isArray(p.lineas) ? p.lineas as Row[] : null;
  const actuales = await lineasDe(ctx, r, cab, cat);
  const L: LineaTk[] = [];
  for (const x of (entrada || actuales).slice(0, 200)) {
    const raw = skuCode(s(x.sku));
    const tipo = TIPOS.has(s(x.tipo)) ? s(x.tipo) : "producto";
    let c = porCode.get(raw);
    if (!c) c = cat.find((r) => skuCode(s(r.sku)) === raw || skuCode(s(r.skuVisible)) === raw || skuCode(s(r.codigoInterno)) === raw || (Array.isArray(r.aliases) && r.aliases.some((a) => skuCode(s(a)) === raw)) || (Array.isArray(r.barras) && r.barras.some((a) => skuCode(s(a)) === raw)));
    const code = tipo === "producto" && c ? skuCode(s(c.sku) || raw) : raw;
    const nueva = !actuales.some((a) => skuCode(a.sku) === code && a.tipo === tipo);
    if (!code) return { error: "Línea sin código" };
    if (nueva && tipo !== "gift" && (!c || (c.activo === false && !c.enMigo))) return { error: (c ? s(c.nombre) : code) + (c ? " está inactivo: no se puede vender" : " no está en el catálogo") };
    const q = n(x.cantidad);
    if (!(q > 0)) return { error: code + ": la cantidad tiene que ser mayor a 0" };
    const pu = x.precio_unit != null && x.precio_unit !== "" ? n(x.precio_unit) : n(c?.pvp);
    if (pu < 0) return { error: code + ": precio inválido" };
    const dt = s(x.descuento_tipo);
    if (dt && dt !== "%" && dt !== "$") return { error: "Descuento inválido" };
    if (dt === "%" && n(x.descuento_valor) > 100) return { error: "El descuento no puede pasar de 100%" };
    L.push({ tipo, sku: code, nombre: s(x.nombre) || s(c?.nombre) || code, cantidad: round2(q), precio_unit: round2(pu), descuento_tipo: dt || null, descuento_valor: n(x.descuento_valor), excluir_comision: x.excluir_comision === true, estimado: x.estimado === true && !nueva && n(x.precio_unit) === n(actuales.find((a) => skuCode(a.sku) === code)?.precio_unit) , ...(s(x.promo).trim() && dt && n(x.descuento_valor) > 0 ? { promo: s(x.promo).trim().slice(0, 120) } : {}) });
  }
  const dTipo = p.descuento && typeof p.descuento === "object" ? s((p.descuento as Row).tipo) : s(cab?.descuento_tipo);
  const dVal = p.descuento && typeof p.descuento === "object" ? n((p.descuento as Row).valor) : n(cab?.descuento_valor);
  if (dTipo && dTipo !== "%" && dTipo !== "$") return { error: "Descuento inválido" };
  if (dTipo === "%" && dVal > 100) return { error: "El descuento no puede pasar de 100%" };
  const promos = await promosVigentes(ctx);
  const promoNom = p.promo != null ? s(p.promo) : s(cab?.promo_nombre);
  const promo = promoNom ? promos.find((x) => x.nombre === promoNom) || null : null;
  if (promoNom && !promo && promoNom !== s(cab?.promo_nombre)) return { error: "Esa promoción no está vigente" };
  const calc = calcularTicket(L, { tipo: dTipo || null, valor: dVal }, promo || (promoNom ? { nombre: promoNom, tipo: "$", valor: n(cab?.promo_monto), codigos: [] } : null));
  const just = s(p.justificacion_descuento) || s((p.datos && typeof p.datos === "object" ? (p.datos as Row).justificacion_descuento : "")) || s((cab?.datos && typeof cab.datos === "object" ? (cab.datos as Row).justificacion_descuento : ""));
  const errJust = exigeJustificacionDescuento(calc.descuentoTotal, just);
  if (errJust) return { error: errJust };
  if (entrada) {
    // Quitar un producto devuelve a su bodega lo que el ticket sacó; agregar uno lo descuenta (kardex).
    try { await ajustarStockLineas(ctx, ses, r, actuales, L); }
    catch (e) { return { error: "No se pudo mover el stock: " + (e instanceof Error ? e.message : String(e)) }; }
  }
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const exclC = p.excluir_cosmetologa != null ? p.excluir_cosmetologa === true : cab?.excluir_cosmetologa === true;
  const exclN = p.excluir_nota != null ? s(p.excluir_nota).slice(0, 300) : s(cab?.excluir_nota);
  const cambios: string[] = [];
  if (entrada) cambios.push("líneas");
  if (p.descuento) cambios.push("descuento " + (dTipo ? dVal + dTipo : "quitado"));
  if (p.promo != null) cambios.push(promoNom ? "promo " + promoNom : "sin promo");
  if (p.excluir_cosmetologa != null || L.some((l) => l.excluir_comision) !== actuales.some((l) => l.excluir_comision)) cambios.push("comisión " + (exclC || L.some((l) => l.excluir_comision) ? "excluida" : "incluida") + (exclN ? " (" + exclN + ")" : ""));
  const hist = [...(Array.isArray(cab?.historial) ? cab!.historial as Row[] : []), { fecha: now, actor, accion: s(p._via) || "edición", detalle: cambios.join(", ") || "guardado", total: calc.total }].slice(-100);
  const costos = await mapaCostoReal(ctx.db);
  const cats = new Map((await ctx.db.all("catalogo").catch(() => [] as Row[])).map((x) => [skuCode(s(x.sku)), x]));
  const nets = ventaNetaLineas(calc.lineas.map((l) => ({ total_linea: l.total_linea })), calc.total);
  const snaps = calc.lineas.map((l, i) => snapProducto({
    tipo: l.tipo,
    ventaNeta: nets[i] || 0,
    qty: l.cantidad,
    costoRealUnit: costos.get(skuCode(l.sku))?.costo ?? null,
    compraComisionUnit: compraParaComision(cats.get(skuCode(l.sku))),
    excluir: l.excluir_comision === true,
  }));
  // TK121: la línea facial (también el canje de paquete en $0) congela la tarifa fija de la cosmetóloga que lo hizo.
  try {
    const fechaTk = ymdUtc(r.timestamp) || ymdUtc(ctx.now);
    const cfgTk = (await cfgAplicada(ctx.db, cicloInicio(fechaTk))).cfg;
    const marcasTk = (await ctx.db.all("cosmetologas").catch(() => [] as Row[])).map(toCosmMark);
    const paga = !exclC && pagaComisionFacial(marcaDePersona(marcasTk, s(r.atendido_por)), fechaTk);
    calc.lineas.forEach((l, i) => { if (l.tipo === "facial") snaps[i] = { ...snaps[i], comision: comisionFacialLinea({ sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, excluir: l.excluir_comision === true }, cfgTk, paga) }; });
    const staffTk = await listaStaffActivo(ctx);
    if (esNombreAdmin(s(r.atendido_por), staffTk)) snaps.forEach((sn, i) => { snaps[i] = { ...sn, comision: 0 }; });
  } catch { /* sin config: queda en 0 como antes */ }
  const packSnap = calc.lineas.map((l, i) => ({ l, s: snaps[i] })).filter((x) => x.l.tipo === "paquete");
  const netoPackVenta = packSnap.filter((x) => n(x.l.precio_unit) > 0).map((x) => x.s.venta_neta);
  const datosJ = { ...((cab?.datos && typeof cab.datos === "object" ? cab.datos : {}) as Row), ...(just.trim() ? { justificacion_descuento: just.trim().slice(0, 400) } : {}) };
  const fila: Row = {
    sheet_row: r.sheet_row ?? null, descuento_tipo: dTipo || null, descuento_valor: dVal, descuento_monto: calc.descuentoMonto, promo_nombre: promoNom || null, promo_monto: calc.promoMonto, datos: datosJ,
    excluir_cosmetologa: exclC, excluir_nota: exclN || null, lineas_beta: true, subtotal: calc.subtotal, iva: calc.iva, total: calc.total, actualizado_por: actor, updated_at: now, historial: hist,
    neto_pack: netoPackVenta[0] != null ? netoPackVenta[0] : null,
    neto_pack6: netoPackVenta[1] != null ? netoPackVenta[1] : null,
    precios_snapshot_at: now,
  };
  if (cab) await ctx.db.write(actor, "beta_tickets", "update", { clave }, fila);
  else await ctx.db.write(actor, "beta_tickets", "insert", {}, { clave, ...fila });
  for (const l of await todas(ctx, "beta_ticket_lineas")) if (s(l.ticket_clave) === clave) await ctx.db.write(actor, "beta_ticket_lineas", "delete", { id: l.id }, null);
  let i = 0;
  for (const l of calc.lineas) {
    await ctx.db.write(actor, "beta_ticket_lineas", "insert", {}, {
      id: crypto.randomUUID(), ticket_clave: clave, orden: ++i, tipo: l.tipo, sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, precio_unit: l.precio_unit,
      descuento_tipo: l.descuento_tipo || null, descuento_valor: l.descuento_valor, descuento_monto: l.descuento_monto, total_linea: l.total_linea, excluir_comision: l.excluir_comision === true, estimado: l.estimado === true,
      ...(l.promo && l.descuento_monto > 0 ? { promo: l.promo } : {}),
      ...snaps[i - 1], snapshot_at: now,
    });
  }
  // TK110: una línea de venta de paquete siempre deja su paquete en Spa › Paquetes (idempotente).
  let paquetesCreados: string[] = [];
  if (entrada) { try { paquetesCreados = await asegurarPaquetesVenta(ctx, actor, r, calc.lineas as unknown as Row[]); } catch { paquetesCreados = []; } }
  return { ok: true, clave, total: calc.total, ...(paquetesCreados.length ? { paquetes_creados: paquetesCreados } : {}) };
}

extend("tk_guardar", "any", async (p, ctx, ses) => {
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso" };
  if (!esAdmin(ses.rol)) return { error: "Un cambio de ticket lo pide con «Solicitar cambio» (lo aprueba un admin)" };
  return await reflags(ctx, ses, p, await guardarTodo(ctx, ses, r, p));
});
/** TK81 (Emilia 18/11): cada cambio de líneas o factura vuelve a evaluar los flags contra las líneas actuales (nunca quedan rancios). */
async function reflags(ctx: Ctx, ses: Ses, p: Row, out: Row): Promise<Row> {
  if (!out || out.error || !(Array.isArray(p.lineas) || (p.datos && typeof p.datos === "object"))) return out;
  try { const { reevaluarFlags } = await import("./migo_cuadre_api.ts"); await reevaluarFlags(ctx, actorOf(ses)); } catch { /* el guardado ya quedó; el cuadre de la hora lo recalcula */ }
  return out;
}

// Solicitud de cambio del detalle de ticket (quien no es admin): la aprueba un admin en Solicitudes.
SOLICITUD_HOOKS["ticket_detalle"] = {
  fila: async (ctx, ses, fila) => {
    const r = await ticketPorClave(ctx, fila);
    if (!r) return { error: "Ticket no encontrado" };
    if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso para pedir un cambio de ese ticket" };
    const v = await vistaTicket(ctx, ses, r);
    const clave = claveDe(r, leerSerie(r, "so_num"));
    return { row: r, antes: { total: (v.totales as Row).total, lineas: (v.lineas as Row[]).map((l) => s(l.sku) + " ×" + n(l.cantidad) + " $" + n(l.total_linea)).join(", ") }, etiqueta: "Edición de " + clave, enlace: "#/m/tickets/t/" + encodeURIComponent(clave) };
  },
  // TK154: guarda antes/después/diff para que la admin vea qué cambia (el ticket real no se toca).
  preparar: async (ctx, ses, fila, tipo, propuestos, motivo) => {
    const { prepararPropuestaTicket } = await import("./ticket_edicion_api.ts");
    return await prepararPropuestaTicket(ctx, ses, fila, tipo, propuestos, motivo);
  },
  // TK154: «Aprobar y aplicar» aplica EXACTAMENTE la propuesta y el ticket sigue bloqueado para el personal.
  aplicar: async (ctx, ses, fila, propuestos, sol) => {
    if (propuestos && (propuestos as Row).edicion_form) {
      const { aplicarEdicionTicket } = await import("./ticket_edicion_api.ts");
      const out = await aplicarEdicionTicket(ctx, ses, fila, propuestos as Row, sol);
      return out.error ? out : { ...out, lockdown: true };
    }
    const { propuestaVacia, soloAplicable } = await import("./propuesta_edicion.ts");
    if (propuestaVacia((propuestos || {}) as Row)) {
      // Solicitud anterior (solo motivo): no hay nada que aplicar; la admin edita a mano si hace falta.
      try { await logAccion(ctx.db, actorOf(ses), "APROBAR SOLICITUD", fila + " · sin detalle de cambios (anterior)" + (sol && s(sol.solicitante) ? " · pedido por " + s(sol.solicitante) : "")); } catch { /* */ }
      return { ok: true, legacy: true, sin_cambios: true, lockdown: true };
    }
    const r = await ticketPorClave(ctx, fila);
    if (!r) return { error: "Ticket no encontrado" };
    const qurl = s((propuestos as Row).quitar_comprobante);
    const rest = soloAplicable({ ...(propuestos as Row) });
    delete rest.quitar_comprobante;
    if (qurl) {
      const q = await quitarComprobante(ctx, ses, r, qurl);
      if (q.error) return q;
      if (!Object.keys(rest).filter((k) => k !== "_via" && rest[k] != null && rest[k] !== "").length) return q;
    }
    const out = await reflags(ctx, ses, rest, await guardarTodo(ctx, ses, r, { ...rest, _via: "solicitud aprobada" }));
    if (out && !out.error) { try { await logAccion(ctx.db, actorOf(ses), "APROBAR EDICIÓN", fila + (sol && s(sol.solicitante) ? " · pedido por " + s(sol.solicitante) : "")); } catch { /* */ } }
    return out && !out.error ? { ...out, lockdown: true } : out;
  },
  // «Solicitar eliminación» (TK59): al aprobar, la admin cancela el ticket (no se borra; queda Cancelado).
  borrar: async (ctx, ses, fila, motivo, sol) => {
    const { cancelarTicket } = await import("./tickets_cancelar_api.ts");
    return await cancelarTicket({ clave: fila, motivo: (motivo || "solicitud aprobada") + (sol && s(sol.solicitante) ? " (pedido por " + s(sol.solicitante) + ")" : "") }, ctx, ses);
  },
};

// ───────────── Detalle v2 (Emilia 17/11, como la orden de venta de MineCore) ─────────────
// Cabecera editable (factura completa, clienta, contacto, notas…), pagos, gift cards, paquete, reportes enviados,
// marcas «por corregir» (cruce con Migo), detalle de costos y estados para la lista (LED).
export const DATOS_TK: [string, string][] = [
  ["factura", "Factura"], ["nombre", "Nombre"], ["apellido", "Apellido"], ["cedula", "CI"], ["email", "Email"], ["telefono", "Teléfono"],
  ["cosmetologa", "Atendió"], ["notas", "Notas"], ["recomendaciones", "Recomendaciones"], ["retorno", "Fecha de regreso"], ["retornoTrat", "Tratamiento recomendado"], ["local", "Local"], ["cabina", "Cabina"],
];
/** Dónde se hizo el servicio (opcional): para repartir el consumo de cabina por cabina en el costo por facial. */
export const CABINAS_TK = ["Cabina 1", "Cabina 2", "Cabina 3", "Local"];
export function facturaCompleta(v: unknown): string {
  const t = s(v).trim();
  if (!t || /sin/i.test(t)) return "";
  const m = t.match(/^(\d{3})-(\d{3})-(\d{1,9})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3].padStart(9, "0")}`;
  const d = facturaTxt(t).replace(/\D/g, "");
  return d ? "001-001-" + d.slice(-9).padStart(9, "0") : t;
}
/** Hay una factura real (no el texto «SIN FACTURA» ni el flag fac solo). */
export function hayFactura(fac7: unknown, datosFac?: unknown, linkFac?: unknown): boolean {
  for (const v of [datosFac, linkFac, fac7]) {
    const nro = s(v).trim();
    if (nro && !/sin/i.test(nro) && (facturaCompleta(nro) || /^\d+(\.0+)?$/.test(nro))) return true;
  }
  return !!facturaCompleta(fac7);
}

/** Suma de pagos vivos de la beta (no anulados). */
export function sumaPagosBeta(pagos: Row[] | undefined): number {
  return round2((pagos || []).filter((p) => p && p.anulado !== true).reduce((a, p) => a + n(p.monto), 0));
}

/** Pagado de verdad: cobrado en el sistema, o los pagos de beta_pagos cubren el total (saldo ≤ $0.05). */
export function estaPagado(r: Row, opts?: { factura?: unknown; linkFac?: unknown; pagadoBeta?: number; total?: number }): boolean {
  if (estaCobrado(r, opts?.factura, opts?.linkFac)) return true;
  const pagadoBeta = n(opts?.pagadoBeta);
  if (!(pagadoBeta > 0)) return false;
  const orig = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  if (orig.anulado === true) return false;
  const st = estadoCobro({ cobrado: false, cobradoMonto: 0, totalLineas: n(opts?.total) || n(r.estimado), pagadoBeta, anulado: false });
  return st.saldo <= 0;
}

/** Cobrado en el sistema anterior: flag cob, o (si no está anulado ni es de prueba) tiene método de pago o factura real. */
export function estaCobrado(r: Row, datosFac?: unknown, linkFac?: unknown): boolean {
  const orig = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  if (orig.anulado === true) return false;
  if (s(r.origin) === "test" || /^TEST-/i.test(s(r.so_num) || s(r.beta_num))) return b(r.cob);
  if (b(r.cob)) return true;
  if (metodosPago(r.comp).some((m) => esMetodoPago(m.metodo))) return true;
  if (tipoSinCobro(r)) return true; // TK98: $0 de cortesía / consumo interno: no hay nada por cobrar
  return hayFactura(r.fac_7, datosFac, linkFac);
}
/** El facial del ticket se canjeó (sesión de paquete o gift card de facial, sin monto aplicado). */
export function canjeFacial(r: Row): boolean {
  if (/^\s*SI\b/i.test(s(r.paquete))) return true;
  const g = parseGcCanje(r.gift_card);
  if (g && g.aplica == null) return true;
  return /\[F\]/.test(s(r.gift_card)) || metodosPago(r.comp).some((m) => m.metodo === "canje");
}
/** Desde cuándo se marca en amarillo lo que falta (antes del corte de Migo no se revisó). */
export const FALTA_DESDE = "2026-11-01";
/** TK208 (Emilia): ticket con valor de líneas > $0 y sin factura Migo vinculada.
 *  El total es el de las líneas (TK207), nunca lo cobrado. Canjes, gift y otros $0 no se marcan.
 *  Se avisa de inmediato (no se espera al import horario ni al martes). */
export function faltaFacturaTicket(opts: { anulado?: boolean; facReal?: boolean; total?: number; fecha?: string }): boolean {
  if (opts.anulado) return false;
  if (opts.facReal) return false;
  if (!(n(opts.total) > 0.05)) return false;
  const f = s(opts.fecha).slice(0, 10);
  if (f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f < FALTA_DESDE) return false;
  return true;
}
/** Desde cuándo un ticket con tarjeta pide la foto del voucher (hora de pared, como el timestamp del ticket). */
export const VOUCHER_FOTO_DESDE = "2026-11-18T10:30:00";
const tieneUrl = (v: unknown) => /https?:|archivo:/.test(s(v));
/** Tipo de botón de foto: efectivo, canje y gift no piden comprobante. */
export function tipoFotoPago(metodo: unknown): "tarjeta" | "voucher" | "transferencia" | "" {
  const m = s(metodo).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (m === "transferencia" || m === "deuna") return "transferencia";
  if (m === "tarjeta") return "tarjeta";
  if (m === "voucher") return "voucher";
  return "";
}
export function etiquetaFotoPago(tipo: string): string {
  return tipo === "transferencia" ? "Transferencia" : tipo === "tarjeta" ? "Tarjeta" : "Voucher";
}
function pagoTieneFoto(p: Row, comps: Row[]): boolean {
  if (s(p.comprobante_id) || s(p.foto)) return true;
  const id = s(p.id);
  if (id && comps.some((c) => s(c.pago_id) === id)) return true;
  return /foto\s+(archivo:[\w-]+|https?:\S+)/i.test(s(p.nota));
}
/** Un botón por tipo de pago que aún no tiene foto. El efectivo no aparece. */
export function pagosFaltanFoto(opts: { beta?: Row[]; legado?: Row[]; comps?: Row[]; comprobanteTicket?: unknown; fecha?: string }): Row[] {
  const comps = opts.comps || [], fecha = s(opts.fecha).replace(" ", "T").slice(0, 19);
  const hayFotoTicket = comps.length > 0 || tieneUrl(opts.comprobanteTicket);
  const seen = new Set<string>(), out: Row[] = [];
  const add = (p: Row, legado: boolean) => {
    if (!p || p.anulado === true) return;
    const tipo = tipoFotoPago(p.metodo);
    if (!tipo || seen.has(tipo)) return;
    if (tipo === "tarjeta" && fecha && fecha < VOUCHER_FOTO_DESDE && /\d/.test(s(p.ref))) return;
    if (legado) { if (hayFotoTicket) return; } else if (pagoTieneFoto(p, comps)) return;
    seen.add(tipo);
    out.push({ id: s(p.id) || null, metodo: s(p.metodo), tipo, etiqueta: etiquetaFotoPago(tipo) });
  };
  for (const p of opts.beta || []) add(p, false);
  for (const p of opts.legado || []) add(p, true);
  return out;
}
/** Lo que falta en un ticket que sí cuadra (fila amarilla): foto de transferencia o voucher de tarjeta. El efectivo no pide foto. La factura que no cuadra va en rojo (flags), no aquí. */
export function faltaDe(r: Row, d: Row): string[] {
  if (ymdUtc(r.timestamp) < FALTA_DESDE) return [];
  const orig = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  if (orig.anulado === true) return [];
  const out: string[] = [];
  const mets = metodosPago(r.comp).map((m) => s(m.metodo));
  const comps = compsVivos(d);
  // TK41 (Emilia 18/11): transferencia siempre pide foto. Tarjeta: los tickets viejos con N.º de voucher ya cuentan
  // como completos; desde VOUCHER_FOTO_DESDE la tarjeta también pide la foto del voucher.
  const tarj = metodosPago(r.comp).filter((m) => m.metodo === "tarjeta");
  const tarjOk = tarj.length > 0 && s(r.timestamp).replace(" ", "T").slice(0, 19) < VOUCHER_FOTO_DESDE && tarj.every((m) => /\d/.test(s(m.ref)));
  const pideFoto = mets.includes("transferencia") || (mets.includes("tarjeta") && !tarjOk);
  if (pideFoto && !tieneUrl(colTicket(r, "comprobante")) && !comps.length) out.push("Foto del comprobante de pago (transferencia o voucher de tarjeta)");
  return out;
}
/** Documentos subidos en la beta (comprobantes que faltaban). */
export function docsBeta(cab: Row | undefined): Row[] {
  const d = (cab?.datos || {}) as Row;
  // TK156 (TK-SO-1927): la misma foto subida como voucher del ticket y, segundos después, enlazada al pago quedaba 2 veces.
  const L0 = compsVivos(d), vistos = new Set<string>();
  const L = L0.filter((x) => {
    const u = s(x.url); if (vistos.has(u)) return false; vistos.add(u);
    if (s(x.pago_id)) return true;
    const t = Date.parse(s(x.fecha));
    return !L0.some((y) => y !== x && s(y.pago_id) && s(y.por) === s(x.por) && Number.isFinite(t) && Math.abs(Date.parse(s(y.fecha)) - t) <= 15000);
  });
  const out: Row[] = L.map((x, i) => ({ tipo: "comprobante", nombre: "Comprobante subido " + (i + 1) + (x.por ? " · " + s(x.por) : ""), url: s(x.url), ...(x.ocr ? { ocr: x.ocr } : {}), ...(x.cruce ? { cruce: x.cruce } : {}), ...(s(x.pago_id) ? { pago_id: s(x.pago_id) } : {}) }));
  const pdfs = Array.isArray(d.factura_pdfs) ? d.factura_pdfs as Row[] : (d.factura_pdf && typeof d.factura_pdf === "object" ? [d.factura_pdf as Row] : []);
  for (const x of pdfs) {
    if (!s(x.url)) continue;
    const fac = s(x.factura);
    out.unshift({ tipo: "factura", nombre: "Factura " + (fac || "Migo") + " (PDF)", url: s(x.url), factura: fac || undefined });
  }
  return out;
}
export function faseA(r: Row): boolean {
  const fac = s(r.facial_hecho).trim(), notas = s(r.notas_generales).trim() || s(r.recomendaciones).trim();
  const fotos = [r.fotos, r.fotos_antes, r.fotos_despues].some((v) => /https?:/.test(s(v)));
  return !!fac && fac !== "-" && !!notas && fotos;
}
function codigosGc(v: unknown): string[] { return [...new Set((s(v).match(/\b\d{2}-\d{3}\b/g) || []))]; }
function hhmm(v: unknown): string { return hmUtc(v).replace(":", ""); }
function claveTarjeta(r: Row): string { return "tk_" + ymdUtc(r.timestamp) + "_" + hhmm(r.timestamp) + "_" + s(r.id_3).split(".")[0]; }

async function enviosDe(ctx: Ctx, r: Row, clave: string): Promise<Row[]> {
  const out: Row[] = [];
  let envBeta: Row[] = [];
  try { envBeta = (await consultar(ctx.db, "beta_ticket_envios", { filtros: [{ col: "ticket_clave", op: "eq", val: clave }] })).rows; }
  catch { envBeta = (await todas(ctx, "beta_ticket_envios")).filter((e) => s(e.ticket_clave) === clave); }
  for (const e of envBeta) out.push({ tipo: s(e.tipo) + (s(e.telefono_fin) === "manual" ? " (manual)" : ""), fecha: s(e.created_at), por: s(e.por), fuente: "beta", manual: s(e.telefono_fin) === "manual" });
  const ck = claveTarjeta(r), ced = s(r.id_3).split(".")[0], f = ymdUtc(r.timestamp);
  for (const e of await todas(ctx, "envios_tarjetas")) {
    if (s(e.clave) === ck || (ced && s(e.cedula).split(".")[0] === ced && ymdUtc(e.fecha_del_ticket) === f)) {
      out.push({ tipo: /paquete/i.test(s(e.que_se_envio)) ? "facial+paquete" : "facial", fecha: s(e.fecha_envio), por: s(e.enviado_por), fuente: "sistema" });
    }
  }
  return out.sort((a, b0) => s(b0.fecha).localeCompare(s(a.fecha)));
}
async function reagendadaDe(ctx: Ctx, r: Row): Promise<{ si: boolean; cita: string; fuente: string }> {
  if (r.agendado === true || s(r.agendado).toLowerCase() === "true") return { si: true, cita: "", fuente: "sistema" };
  const f = ymdUtc(r.timestamp); if (!f) return { si: false, cita: "", fuente: "" };
  const hoy = new Date(ctx.now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
  const desde = f > hoy ? f : (addDaysYmd(hoy, -30) > f ? addDaysYmd(hoy, -30) : addDaysYmd(f, 1));
  const L = await citasRango(ctx, desde, addDaysYmd(hoy, 90), { ms: 600000 });
  if (!Array.isArray(L)) return { si: false, cita: "", fuente: "sin acuity" };
  const c = citaDeNombre(L.filter((a) => fechaCita(a) > f), s(r.nombre), s(r.apellido));
  return c ? { si: true, cita: s(c.datetime), fuente: "acuity" } : { si: false, cita: "", fuente: "acuity" };
}
function addDaysYmd(ymd: string, d: number): string { const t = new Date(ymd + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); }

async function extrasTicket(ctx: Ctx, ses: Ses, r: Row, cab: Row | undefined, total: number): Promise<Row> {
  const admin = esAdmin(ses.rol), clave = claveDe(r, leerSerie(r, "so_num"));
  const d = (cab?.datos && typeof cab.datos === "object" ? cab.datos : {}) as Row;
  const ced = s(r.id_3).split(".")[0];
  const reg = (ced ? await registroDe(ctx, [ced], []) : []).filter((x) => !x.borrado_at && normCedula(x.cedula) === normCedula(ced)).sort((a, b0) => s(b0.timestamp).localeCompare(s(a.timestamp)))[0];
  // Ficha de la clienta (beta_clientes): manda sobre la fila vieja del ticket y el registro.
  let fc: Row = {};
  try { const k = claveCliente(r); if (k) { const fr = (await consultar(ctx.db, "beta_clientes", { cols: ["key", "datos", "codigo", "telefono"], filtros: [{ col: "key", op: "eq", val: k }], limite: 1 })).rows[0]; fc = { ...((fr?.datos || {}) as Row), _codigo: s(fr?.codigo), _telCol: s(fr?.telefono) }; } } catch { fc = {}; }
  const vf = (x: unknown) => (s(x) ? s(x) : undefined);
  let antigua: Row = {};
  try {
    const ants = await todas(ctx, "clientas_antiguas");
    const porCed = ced ? ants.filter((x) => normCedula(x.cedula) === normCedula(ced)) : [];
    if (porCed.length === 1) antigua = porCed[0];
    else if (!porCed.length) {
      const nom = normNombre([s(d.nombre ?? vf(fc.nombres) ?? r.nombre), s(d.apellido ?? vf(fc.apellido) ?? r.apellido)].filter(Boolean).join(" "));
      const porNom = nom ? ants.filter((x) => normNombre(x.nombre) === nom) : [];
      if (porNom.length === 1) antigua = porNom[0];
    }
  } catch { antigua = {}; }
  const ct = contactoParaMostrar([
    { telefono: d.telefono, email: d.email },
    { telefono: fc.telefono, email: fc.email },
    { telefono: (fc as Row)._telCol, email: "" },
    { telefono: reg?.telefono, email: reg?.email },
    { telefono: antigua.telefono || antigua.tel_acuity, email: antigua.email },
  ]);
  const info: Row = {
    factura: s(d.factura) || facturaCompleta(r.fac_7), nombre: s(d.nombre ?? vf(fc.nombres) ?? r.nombre), apellido: s(d.apellido ?? vf(fc.apellido) ?? r.apellido), cedula: s(d.cedula ?? ced),
    email: ct.email, telefono: ct.telefono, cosmetologa: s(d.cosmetologa ?? r.atendido_por),
    notas: s(d.notas ?? r.notas_generales), recomendaciones: s(d.recomendaciones ?? r.recomendaciones), retorno: s(d.retorno ?? s(r.fecha_retorno).slice(0, 10)),
    retornoTrat: s(d.retornoTrat),
    clienteCodigo: s(fc._codigo) || s((r.orig as Row | undefined)?.cliente_codigo),
    cabina: s(d.cabina),
    local: s(d.local) || "Sunsu Spa", fecha: ymdUtc(r.timestamp), hora: hmUtc(r.timestamp), orden: r.id ?? null,
  };
  const tiene_tel = !!s(ct.telefono);
  info.tiene_tel = tiene_tel;
  if (!conTelefono(ses)) delete info.telefono;
  if (!conEmail(ses) && !conTelefono(ses)) delete info.email;
  let betaPagos: Row[] = [];
  try { betaPagos = (await consultar(ctx.db, "beta_pagos", { filtros: [{ col: "ticket_clave", op: "eq", val: clave }] })).rows.filter((x) => x.anulado !== true); }
  catch { betaPagos = []; }
  const pagadoBeta = sumaPagosBeta(betaPagos);
  const stCob = estadoCobro({ cobrado: estaCobrado(r, d.factura), cobradoMonto: n(r.estimado), totalLineas: total, pagadoBeta, anulado: (r.orig && typeof r.orig === "object" ? (r.orig as Row).anulado === true : false) });
  const metodos = metodosPago(r.comp);
  const pagos = { metodos, pagado: stCob.pagado, saldo: stCob.saldo, cobrado: stCob.saldo <= 0 && !((r.orig && typeof r.orig === "object" ? (r.orig as Row).anulado === true : false)), total: stCob.total, redondeo: stCob.redondeo, dif: stCob.dif, pagadoBeta: stCob.pagadoBeta, pagosLegado: stCob.pagadoSis > 0 ? filasPagoLegado(r.comp, stCob.pagadoSis, s(r.timestamp)) : [] };
  const pagosFaltan = pagosFaltanFoto({ beta: betaPagos, legado: pagos.pagosLegado, comps: compsVivos(d), comprobanteTicket: colTicket(r, "comprobante"), fecha: s(r.timestamp) });
  // Gift cards: vendidas en el ticket y canjeadas en el ticket.
  const codsGc = [...codigosGc(r.venta_gift), ...codigosGc(r.gift_card)];
  const gcs = codsGc.length ? (await consultar(ctx.db, "gift_cards", { filtros: [{ col: "codigo_gc", op: "in", val: codsGc }] })).rows : [];
  const dig = codsGc.length ? (await consultar(ctx.db, "gift_cards_digitales", { filtros: [{ col: "codigo", op: "in", val: codsGc }] })).rows : [];
  const cats = await ctx.db.all("catalogo").catch(() => [] as Row[]);
  const packsGc = await ctx.db.all("paquetes").catch(() => [] as Row[]);
  const gc = (cod: string, uso: string) => {
    const g = gcs.find((x) => !x.borrado_at && s(x.codigo_gc) === cod), dg = dig.find((x) => s(x.codigo) === cod);
    return { codigo: cod, uso, valor: s(g?.valor), saldo: g && admin ? saldoGift(g, cats, packsGc) : undefined, usado: g?.usado === true,
      comprador: g ? (s(g.nombre_comprador) + " " + s(g.apellido_comprador)).trim() : "", para: s(dg?.para), de: s(dg?.de), facial: s(dg?.facial), mensaje: s(dg?.mensaje), valido: s(dg?.valido), digital: !!dg };
  };
  const giftcards = [...codigosGc(r.venta_gift).map((c) => gc(c, "vendida")), ...codigosGc(r.gift_card).map((c) => gc(c, "canjeada"))];
  // Paquete: uso en este ticket, compra y paquetes vigentes de la clienta.
  const paqs = await paquetesDe(ctx.db, normCedula(ced), normNombre(s(r.nombre) + " " + s(r.apellido)));
  const paquete = {
    uso: /^\s*SI\b/i.test(s(r.paquete)) ? s(r.paquete).replace(/^\s*SI,?\s*/i, "") : "",
    compra: [s(r.compra_pack_3), s(r.compra_pack_6)].filter((x) => x && x !== "-").join(" · "),
    vigentes: paqs.filter((p) => n(p.pendientes) > 0).map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, usados: p.usados, total: p.total, pendientes: p.pendientes, estado: p.estado })),
    // TK111: el paquete comprado o usado en ESTE ticket se ve aunque esté completo.
    delTicket: paquetesDelTicket(paqs, r, clave).map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, usados: p.usados, total: p.total, pendientes: p.pendientes, estado: p.estado })),
  };
  const envios = await enviosDe(ctx, r, clave);
  let flagsSrc: Row[] = [];
  try {
    flagsSrc = (await consultar(ctx.db, "beta_ticket_flags", { filtros: [{ op: "or", de: [{ col: "ticket_clave", op: "eq", val: clave }, { col: "ticket_id", op: "eq", val: n(r.id) }] }] })).rows;
  } catch { flagsSrc = await todas(ctx, "beta_ticket_flags"); }
  const flags = flagsSrc.filter((f) => !f.resuelto && (n(f.ticket_id) === n(r.id) || s(f.ticket_clave) === clave))
    .map((f) => ({ id: s(f.id), motivo: s(f.motivo), detalle: admin ? s(f.detalle) : "", factura: s(f.factura), fuente: s(f.fuente) }));
  const reag = await reagendadaDe(ctx, r);
  const orig = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  let linkFac: unknown = "";
  try {
    const ln = (await consultar(ctx.db, "beta_cuadre_link", { filtros: [{ col: "ticket_id", op: "eq", val: n(r.id) }], limite: 1 })).rows[0];
    linkFac = ln?.factura;
  } catch { linkFac = ""; }
  const anulado = orig.anulado === true, facReal = hayFactura(r.fac_7, d.factura, linkFac), cobrado = estaPagado(r, { factura: d.factura, linkFac, pagadoBeta, total });
  const sinCobro = tipoSinCobro(r);
  const faltaFac = faltaFacturaTicket({ anulado, facReal, total, fecha: ymdUtc(r.timestamp) });
  const fac = facReal || b(r.fac) || (!!sinCobro && !faltaFac);
  const chips: Row[] = [
    { k: "estado", t: anulado ? "Cancelado" : cobrado && fac ? "Cerrado" : "Abierto", c: anulado ? "anulado" : cobrado && fac ? "cerrado" : "abierto" },
    // TK98: cortesía / consumo interno / canje en $0, en gris. TK208: si hay valor de líneas y no hay factura Migo, «Falta factura» (rojo).
    ...(sinCobro && !faltaFac ? [{ k: "sincobro", t: ETQ_SIN_COBRO[sinCobro], c: "neutro" }] : [
      { k: "cobro", t: cobrado ? "Pagado" : "Por cobrar", c: cobrado ? "pagado" : "porcobrar" },
      { k: "fac", t: facReal ? "Facturado" : (faltaFac ? "Falta factura" : "Sin factura"), c: facReal ? "facturado" : (faltaFac ? "faltafactura" : "sinfactura") },
    ]),
    ...(canjeFacial(r) ? [{ k: "canje", t: "Canje", c: "info" }] : []),
    { k: "rep", t: envios.length ? "Reporte enviado" : "Reporte no enviado", c: envios.length ? "ok" : "pend" },
    { k: "reag", t: reag.si ? "Reagendada" : "Sin reagendar", c: reag.si ? "ok" : "pend" },
    ...(paquete.uso ? [{ k: "paq", t: "Paquete " + paquete.uso, c: "info" }] : []),
    ...(flags.length ? [{ k: "flag", t: "Por corregir", c: "anulado" }] : []),
    ...(await otroNombre(ctx, r) ? [{ k: "otronombre", t: "Facturado a otro nombre", c: "neutro" }] : []),
  ];
  return { info, tiene_tel, falta_factura: faltaFac || undefined, campos: DATOS_TK.filter(([k]) => (k !== "telefono" || conTelefono(ses)) && (k !== "email" || conEmail(ses) || conTelefono(ses))), corregidos: Object.keys(d), pagos, pagosFaltan, giftcards, paquete, envios, flags, reagendada: reag, faseA: faseA(r), chips, clienteKey: claveCliente(r),
    costosVisibles: admin };
}

async function guardarDatos(ctx: Ctx, ses: Ses, r: Row, datos: Row, via: string): Promise<Row> {
  if (!(await hay(ctx))) return { error: FALTA };
  if ((r.orig as Row | undefined)?.anulado === true) return { error: "El ticket está cancelado: no se edita" };
  const so = leerSerie(r, "so_num"), clave = claveDe(r, so);
  const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
  const ok = new Set(DATOS_TK.map(([k]) => k)), limpio: Row = {};
  for (const [k, v] of Object.entries(datos || {})) if (ok.has(k)) limpio[k] = s(v).trim().slice(0, 600);
  if (!Object.keys(limpio).length) return { error: "Nada que cambiar" };
  if (limpio.factura && !/^\d{3}-\d{3}-\d{9}$/.test(facturaCompleta(limpio.factura))) return { error: "Factura: usa 001-001-000000000" };
  if (limpio.factura) limpio.factura = facturaCompleta(limpio.factura);
  // TK185 (Emilia t805u): la fecha en el formato en que la escriben; por dentro AAAA-MM-DD.
  if (limpio.retorno) { const f = leerFecha(limpio.retorno); if (!f) return { error: FECHA_NO_ENTIENDO }; limpio.retorno = f.iso; }
  if (limpio.cabina) { const c = CABINAS_TK.find((x) => x.toLowerCase() === String(limpio.cabina).toLowerCase()); if (!c) return { error: "Cabina: elige Cabina 1, 2, 3 o Local" }; limpio.cabina = c; }
  if (limpio.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(limpio.email))) return { error: "Email inválido" };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const nuevo = { ...((cab?.datos || {}) as Row), ...limpio };
  const hist = [...(Array.isArray(cab?.historial) ? cab!.historial as Row[] : []), { fecha: now, actor, accion: via, detalle: "datos: " + Object.keys(limpio).join(", ") }].slice(-100);
  let cosmCambio: { de: string; a: string } | null = null;
  if (limpio.cosmetologa != null) {
    const staff = await listaStaffActivo(ctx);
    const canon = canonStaff(s(limpio.cosmetologa), staff);
    if (!canon) return { error: "Elige una cosmetóloga de la lista" };
    limpio.cosmetologa = canon;
    nuevo.cosmetologa = canon;
    const prev = s(r.atendido_por);
    if (canon && canon !== prev) {
      const match = r.id != null ? { id: r.id } : { sheet_row: r.sheet_row };
      await ctx.db.write(actor, "tickets", "update", match, { atendido_por: canon });
      r.atendido_por = canon;
      cosmCambio = { de: prev, a: canon };
      hist[hist.length - 1] = { ...hist[hist.length - 1], detalle: "Atendido por: " + (prev || "—") + " → " + canon };
      try { await logAccion(ctx.db, actor, "EDITAR TICKET", (so || clave) + " · atendido por " + (prev || "—") + " → " + canon); } catch { /* log opcional */ }
    }
  }
  if (cab) await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos: nuevo, historial: hist, actualizado_por: actor, updated_at: now });
  else await ctx.db.write(actor, "beta_tickets", "insert", {}, { clave, sheet_row: r.sheet_row ?? null, datos: nuevo, historial: hist, actualizado_por: actor, updated_at: now });
  // Lo de la clienta (nombre, apellido, CI, email, teléfono) también va a su ficha.
  let ficha: Row = {};
  try { const { propagarDesdeTicket } = await import("./clientes_beta_api.ts"); ficha = await propagarDesdeTicket(ctx, ses, claveCliente(r), limpio, so || clave); } catch (e) { ficha = { error: String((e as Error)?.message || e) }; }
  return { ok: true, clave, cosmCambio, ficha: ficha.error ? { error: ficha.error } : { ok: true, cambios: ficha.cambios || [] } };
}
const SOLO_DATOS = (p: Row) => p.datos && typeof p.datos === "object" && p.lineas == null && p.descuento == null && p.promo == null && p.excluir_cosmetologa == null;
export async function guardarTodo(ctx: Ctx, ses: Ses, r: Row, p: Row): Promise<Row> {
  if (p.datos && typeof p.datos === "object" && Object.keys(p.datos as Row).length) {
    const g = await guardarDatos(ctx, ses, r, p.datos as Row, s(p._via) || "edición");
    if (g.error) return g;
    if (g.cosmCambio) {
      const pRecalc = SOLO_DATOS(p) ? { _via: s(p._via) || "cambio de cosmetóloga" } : { ...p, _via: s(p._via) || "cambio de cosmetóloga" };
      const out = await guardar(ctx, ses, r, pRecalc);
      return out.error ? out : { ...out, cosmCambio: g.cosmCambio, ficha: g.ficha };
    }
    if (SOLO_DATOS(p)) return g;
  }
  return guardar(ctx, ses, r, p);
}

/** Costo de lo vendido por línea: producto = costo promedio; facial/servicio = receta de cabina a costo promedio. */
async function costosDe(ctx: Ctx, r: Row, cab: Row | undefined, lineas: Row[], subtotal: number): Promise<Row> {
  const prods = await todas(ctx, "erp_productos");
  const costoDe = (code: string, id?: string) => { const p = prods.find((x) => (id && s(x.id) === id) || skuCode(s(x.sku)) === skuCode(code)); return n(p?.costo_promedio ?? p?.costo); };
  const out: Row[] = [];
  let cogs = 0; const notas = new Set<string>();
  for (const l of lineas) {
    let cu = 0;
    if (l.tipo === "producto") { cu = costoDe(s(l.sku)); if (!(cu > 0)) notas.add("productos sin costo cargado: costo 0"); }
    else if (l.tipo === "facial" || l.tipo === "extra" || l.tipo === "servicio") {
      const rec = await recetaDe(ctx.db, s(l.sku) || s(l.nombre), 1);
      cu = rec.reduce((a, x) => a + costoDe(x.sku, x.producto_id) * n(x.qty), 0);
      if (!rec.length) notas.add("servicios sin receta: costo 0");
    } else notas.add(l.tipo === "gift" ? "gift card: sin costo" : "paquete: el costo va en cada sesión");
    const ct = round2(cu * n(l.cantidad));
    cogs += ct;
    out.push({ sku: l.sku, descripcion: l.nombre, cantidad: n(l.cantidad), costo_unit: round2(cu), costo_total: ct });
  }
  const tipo = s(cab?.costos_nc_tipo) || "$", valor = n(cab?.costos_nc_valor);
  const nc = round2(tipo === "%" ? subtotal * valor / 100 : valor);
  const ganancia = round2(subtotal - nc - cogs);
  return { subtotal, costos_no_cliente_tipo: tipo, costos_no_cliente_valor: valor, costos_no_cliente: nc, cogs: round2(cogs), cogs_nota: [...notas].join(" · ") || "costo promedio actual", ganancia, margenPct: subtotal > 0 ? Math.round(ganancia / subtotal * 1000) / 10 : null, lineas: out };
}

extend("tk_costos", "any", async (p, ctx, ses) => {
  if (!esSuperAdmin(ses.rol)) return { error: "Solo Super Admin ve los costos" };
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  const v = await vistaTicket(ctx, ses, r);
  const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === s(v.clave));
  return { ok: true, costos: { numero: (v.ticket as Row).soNum, ...(await costosDe(ctx, r, cab, v.lineas as Row[], n((v.totales as Row).subtotal))) } };
});
extend("tk_costos_guardar", "any", async (p, ctx, ses) => {
  if (!esSuperAdmin(ses.rol)) return { error: "Solo Super Admin ve los costos" };
  if (!(await hay(ctx))) return { error: FALTA };
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  const tipo = s(p.tipo) === "%" ? "%" : "$", valor = n(p.valor);
  if (valor < 0 || (tipo === "%" && valor > 100)) return { error: tipo === "%" ? "Máximo 100%" : "Valor inválido" };
  const clave = claveDe(r, leerSerie(r, "so_num")), cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave), actor = actorOf(ses), now = ctx.now.toISOString();
  if (cab) await ctx.db.write(actor, "beta_tickets", "update", { clave }, { costos_nc_tipo: tipo, costos_nc_valor: valor, actualizado_por: actor, updated_at: now });
  else await ctx.db.write(actor, "beta_tickets", "insert", {}, { clave, sheet_row: r.sheet_row ?? null, costos_nc_tipo: tipo, costos_nc_valor: valor, actualizado_por: actor, updated_at: now });
  return { ok: true };
});
extend("tk_envio", "any", async (p, ctx, ses) => {
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso" };
  const raw = Array.isArray(p.tipos) ? (p.tipos as unknown[]).map((x) => s(x)) : [s(p.tipo)];
  // TK187: «Marcar como enviado (manual)»: mismo registro (quién = ses.name, cuándo = created_at) con telefono_fin «manual».
  const manual = p.manual === true || p.manual === 1 || s(p.manual) === "1" || s(p.manual) === "true";
  let tipos = [...new Set(raw.map((x) => x.toLowerCase()).filter((x) => x === "facial" || x === "paquete" || x === "giftcard"))];
  if (manual) { tipos = tipos.filter((x) => x !== "giftcard"); if (!tipos.length) tipos = ["facial"]; }
  if (!tipos.length) return { error: "Indica el tipo de reporte (facial, paquete o giftcard)" };
  const clave = claveDe(r, leerSerie(r, "so_num"));
  const fin = manual ? "manual" : s(p.telefono).replace(/\D/g, "").slice(-4);
  try {
    for (const tipo of tipos) {
      await ctx.db.write(actorOf(ses), "beta_ticket_envios", "insert", {}, { id: crypto.randomUUID(), ticket_clave: clave, tipo, telefono_fin: fin, por: ses.name, created_at: ctx.now.toISOString() });
    }
  } catch { return { error: "Falta aplicar 0050_agenda_beta.sql" }; }
  return { ok: true, tipos, manual, por: ses.name, fecha: ctx.now.toISOString() };
});
extend("tk_flag_resolver", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin marca resuelto; pide la corrección con «Solicitar cambio»" };
  const f = (await todas(ctx, "beta_ticket_flags")).find((x) => s(x.id) === s(p.id));
  if (!f) return { error: "Marca no encontrada" };
  await ctx.db.write(actorOf(ses), "beta_ticket_flags", "update", { id: f.id }, { resuelto: true, resuelto_por: ses.name, resuelto_at: ctx.now.toISOString(), nota: s(p.nota).slice(0, 300) || null, updated_at: ctx.now.toISOString() });
  return { ok: true };
});
extend("tk_flag_crear", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  if (!s(p.motivo).trim()) return { error: "Escribe el motivo" };
  const id = "manual:" + crypto.randomUUID();
  await ctx.db.write(actorOf(ses), "beta_ticket_flags", "insert", {}, { id, ticket_id: r.id ?? null, ticket_clave: claveDe(r, leerSerie(r, "so_num")), motivo: s(p.motivo).trim().slice(0, 120), detalle: s(p.detalle).slice(0, 500) || null, fuente: "manual" });
  return { ok: true, id };
});

/** Estados para la lista de tickets: Fase A, pagado, reporte, reagendada, fecha de regreso y marcas por corregir. */
extend("tk_estados", "any", async (_p, ctx, ses) => {
  const verTodos = esAdmin(ses.rol) || acceso(ses.rol, "tickets", await matrizDe(ctx.db)) === "todos";
  const rows = (await todas(ctx, "tickets")).filter((r) => !r.borrado_at && (verTodos || esPropio(s(r.atendido_por), ses)));
  const flags = (await todas(ctx, "beta_ticket_flags")).filter((f) => !f.resuelto);
  const envB = new Set((await todas(ctx, "beta_ticket_envios")).map((e) => s(e.ticket_clave)));
  const envS = new Set<string>(), envCF = new Set<string>();
  for (const e of await todas(ctx, "envios_tarjetas")) { envS.add(s(e.clave)); envCF.add(s(e.cedula).split(".")[0] + "|" + ymdUtc(e.fecha_del_ticket)); }
  const cabs = new Map((await todas(ctx, "beta_tickets")).map((c) => [s(c.clave), c]));
  const pagosPorClave = new Map<string, Row[]>();
  for (const x of await todas(ctx, "beta_pagos")) {
    if (x.anulado === true) continue;
    const k = s(x.ticket_clave);
    const L0 = pagosPorClave.get(k) || [];
    L0.push(x);
    pagosPorClave.set(k, L0);
  }
  const linkByTk = new Map((await todas(ctx, "beta_cuadre_link")).map((L) => [n(L.ticket_id), L]));
  const hoy = new Date(ctx.now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
  const citas = await citasRango(ctx, addDaysYmd(hoy, -30), addDaysYmd(hoy, 90), { ms: 600000 });
  const conAcuity = Array.isArray(citas);
  const items: Record<string, Row> = {};
  for (const r of rows) {
    const clave = claveDe(r, leerSerie(r, "so_num")), f = ymdUtc(r.timestamp), ced = s(r.id_3).split(".")[0];
    const d = ((cabs.get(clave)?.datos || {}) as Row);
    const rep = envB.has(clave) || envS.has(claveTarjeta(r)) || (!!ced && envCF.has(ced + "|" + f));
    let g = r.agendado === true || s(r.agendado).toLowerCase() === "true";
    if (!g && conAcuity && f >= addDaysYmd(hoy, -120)) g = !!citaDeNombre((citas as Row[]).filter((a) => fechaCita(a) > f), s(r.nombre), s(r.apellido));
    const ret = s(d.retorno || s(r.fecha_retorno).slice(0, 10));
    const orig = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
    const fl = flags.filter((x) => n(x.ticket_id) === n(r.id) || s(x.ticket_clave) === clave);
    items[String(r.sheet_row)] = {
      a: faseA(r) ? 1 : 0, p: b(r.cob) ? 1 : 0, r: rep ? 1 : 0, g: g ? 1 : 0, ret,
      pr: !g && orig.anulado !== true && /^\d{4}-\d{2}-\d{2}$/.test(ret) && ret <= addDaysYmd(hoy, 7) && ret >= addDaysYmd(hoy, -60) ? 1 : 0,
      ...(fl.length ? { flag: fl.map((x) => s(x.motivo) + (x.factura ? " · factura " + s(x.factura) : "")).join(" / ") } : {}),
      ...((s(d.factura) || (Number(s(r.fac_7)) > 0 ? s(r.fac_7) : "") || s(linkByTk.get(n(r.id))?.factura))
        ? { factura: facturaCompleta(s(d.factura) || (Number(s(r.fac_7)) > 0 ? s(r.fac_7) : "") || s(linkByTk.get(n(r.id))?.factura)) }
        : {}),
      ...((() => { const pf = pagosFaltanFoto({ beta: pagosPorClave.get(clave) || [], legado: metodosPago(r.comp), comps: compsVivos(d), comprobanteTicket: colTicket(r, "comprobante"), fecha: s(r.timestamp) }); return pf.length ? { pagosFaltan: pf } : {}; })()),
    };
  }
  return { ok: true, items, acuity: conAcuity, hoy };
});
