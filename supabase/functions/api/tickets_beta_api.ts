// Detalle de ticket de la beta (Emilia 17/11, como la orden de venta de MineCore).
// Lee el ticket del sistema (tabla tickets, que llena la hoja) y guarda lo editado SOLO en beta_tickets /
// beta_ticket_lineas (0048): cantidad, precio unitario, descuento y total por línea; descuento del ticket
// (% o $), promoción y exclusión de comisión. Admin edita directo; los demás piden el cambio (solicitudes).
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { b, hmUtc, n, productQtys, round2, s, skuCode, ymdUtc, type Row } from "./domain.ts";
import { leerSerie } from "./series.ts";
import { facturaTxt } from "./ticket_total.ts";
import { lineasTicket, precioLineaTicket } from "./productos.ts";
import { listaProductos } from "./productos_api.ts";
import { SOLICITUD_HOOKS, veTicket } from "./inline_api.ts";
import { calcularTicket, claveDe, type LineaTk, type Promo } from "./ticket_beta.ts";

const FALTA = "Falta aplicar 0048_tickets_beta.sql";
const TIPOS = new Set(["producto", "facial", "extra", "paquete", "gift", "servicio"]);
async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
async function hay(ctx: Ctx): Promise<boolean> { try { await ctx.db.all("beta_tickets"); return true; } catch { return false; } }

export function tipoCatalogo(t: string): string {
  const x = s(t).toUpperCase();
  if (x.startsWith("FACIAL")) return "facial";
  if (x.includes("ADD-ON") || x.includes("SERVICIO")) return "extra";
  if (x.startsWith("PAQUETE")) return "paquete";
  if (x.startsWith("GIFT")) return "gift";
  return "producto";
}
/** Catálogo para el buscador del ticket: productos, faciales/servicios y paquetes, con códigos de barras. */
export async function catalogoTicket(ctx: Ctx, ses: Ses): Promise<Row[]> {
  const prods = await listaProductos(ctx, ses);
  const porCode = new Map(prods.map((p) => [skuCode(s(p.sku)), p]));
  const out: Row[] = [], ya = new Set<string>();
  for (const r of await todas(ctx, "catalogo")) {
    const code = skuCode(s(r.sku));
    if (!code || ya.has(code)) continue;
    ya.add(code);
    const p = porCode.get(code);
    const tot = n(r.total_con_iva) || round2(n(r.subtotal) * 1.15);
    out.push({
      sku: code, skuVisible: s(r.sku), nombre: s(r.producto_servicio) || s(p?.nombre), tipo: tipoCatalogo(s(r.tipo)), pvp: round2(tot),
      activo: p ? p.activo !== false : r.activo !== false, barras: p ? p.barras || [] : [], productoId: p ? s(p.id) : "", foto: p ? s(p.foto_thumb) : "",
      stock: p ? p.stock : null,
    });
  }
  for (const p of prods) {
    const code = skuCode(s(p.sku));
    if (ya.has(code) || p.tipo === "servicio" || !(n(p.pvp) > 0)) continue;
    ya.add(code);
    out.push({ sku: code, skuVisible: s(p.skuVisible || p.sku), nombre: s(p.nombre), tipo: "producto", pvp: round2(n(p.pvp)), activo: p.activo !== false, barras: p.barras || [], productoId: s(p.id), foto: s(p.foto_thumb), stock: p.stock });
  }
  return out;
}
async function promosVigentes(ctx: Ctx): Promise<Promo[]> {
  const hoy = new Date(ctx.now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
  return (await todas(ctx, "promos")).filter((r) => s(r.nombre) && s(r.activa).toUpperCase() !== "NO" && r.activa !== false && s(r.desde).slice(0, 10) <= hoy && hoy <= s(r.hasta).slice(0, 10))
    .map((r) => ({ nombre: s(r.nombre), tipo: s(r.tipo).toUpperCase() || "%", valor: n(r.valor), valor2: n(r.valor2), codigos: s(r.codigos).split(",").map((x) => x.trim()).filter(Boolean) }));
}
export async function ticketPorClave(ctx: Ctx, clave: string): Promise<Row | null> {
  const k = s(clave).trim();
  if (!k) return null;
  const rows = (await ctx.db.all("tickets")).filter((r) => !r.borrado_at);
  const fila = /^r\d+$/.test(k) ? k.slice(1) : "";
  return rows.find((r) => leerSerie(r, "so_num") === k || s(r.beta_num) === k || (fila && s(r.sheet_row) === fila) || s(r.id) === k) || null;
}
function docsDe(r: Row): Row[] {
  const urls = (v: unknown) => s(v).split(/\s*\|\s*|\s*,\s*(?=https?:)|\s+(?=https?:)/).map((x) => x.trim()).filter((x) => /^https?:/.test(x));
  const out: Row[] = [];
  for (const u of urls(r.comprobante)) out.push({ tipo: "comprobante", nombre: "Comprobante de pago", url: u });
  urls(r.fotos_antes).forEach((u, i) => out.push({ tipo: "foto", nombre: "Foto antes " + (i + 1), url: u }));
  urls(r.fotos_despues).forEach((u, i) => out.push({ tipo: "foto", nombre: "Foto después " + (i + 1), url: u }));
  urls(r.fotos).forEach((u, i) => out.push({ tipo: "foto", nombre: "Foto " + (i + 1), url: u }));
  return out;
}
/** Líneas del ticket: las de la beta si se editó; si no, las del sistema con el precio cobrado (real o prorrateado). */
async function lineasDe(ctx: Ctx, r: Row, cab: Row | undefined, cat: Row[]): Promise<LineaTk[]> {
  if (cab && cab.lineas_beta === true) {
    return (await todas(ctx, "beta_ticket_lineas")).filter((l) => s(l.ticket_clave) === s(cab.clave)).sort((a, b0) => n(a.orden) - n(b0.orden))
      .map((l) => ({ id: s(l.id), tipo: s(l.tipo), sku: s(l.sku), nombre: s(l.nombre), cantidad: n(l.cantidad), precio_unit: n(l.precio_unit), descuento_tipo: s(l.descuento_tipo) || null, descuento_valor: n(l.descuento_valor), excluir_comision: l.excluir_comision === true, estimado: l.estimado === true }));
  }
  const porCode = new Map(cat.map((c) => [s(c.sku), c]));
  const pvpDe = (c: string) => n(porCode.get(skuCode(c))?.pvp);
  const L = lineasTicket(r, pvpDe);
  const cobrado = n(r.estimado);
  const nombreDe = (c: string) => s(porCode.get(skuCode(c))?.nombre) || c;
  const vistos = new Set<string>();
  const out: LineaTk[] = [];
  for (const l of L) {
    const k = l.tipo + "|" + l.codigo;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const qty = L.filter((x) => x.codigo === l.codigo && x.tipo === l.tipo).reduce((a, x) => a + x.qty, 0);
    const pr = precioLineaTicket(L, l.codigo, cobrado);
    const unit = pr.unit != null ? pr.unit : l.lista;
    out.push({ tipo: l.tipo, sku: l.codigo, nombre: l.tipo === "gift" ? "Gift card" : nombreDe(l.codigo), cantidad: qty, precio_unit: round2(unit), descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: pr.estimado || pr.unit == null });
  }
  return out;
}
function promoDe(cab: Row | undefined, promos: Promo[]): Promo | null {
  const nom = s(cab?.promo_nombre);
  return nom ? promos.find((p) => p.nombre === nom) || null : null;
}
async function vistaTicket(ctx: Ctx, ses: Ses, r: Row): Promise<Row> {
  const so = leerSerie(r, "so_num"), clave = claveDe(r, so);
  const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
  const cat = await catalogoTicket(ctx, ses);
  const promos = await promosVigentes(ctx);
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
  return {
    ok: true, clave, admin, falta: (await hay(ctx)) ? "" : FALTA,
    ticket: {
      clave, soNum: so, betaNum: s(r.beta_num), sheetRow: r.sheet_row ?? null, fecha: ymdUtc(r.timestamp), hora: hmUtc(r.timestamp),
      nombre: s(r.nombre), apellido: s(r.apellido), cedula: s(r.id_3), cosmetologa: s(r.atendido_por),
      cobradoSistema: round2(n(r.estimado)), factura: facturaTxt(r.fac_7), comprobante: s(r.comp),
      notas: s(r.notas_generales), recomendaciones: s(r.recomendaciones), retorno: s(r.fecha_retorno).slice(0, 10), paquete: s(r.paquete),
      estado: anulado ? "anulado" : fac && cob ? "cerrado" : "abierto",
      leds: [
        { k: "estado", t: anulado ? "Anulado" : fac && cob ? "Cerrado" : "Abierto", c: anulado ? "x" : fac && cob ? "ok" : "c" },
        { k: "fac", t: fac ? "Facturado" + (facturaTxt(r.fac_7) ? " " + facturaTxt(r.fac_7) : "") : "Sin factura", c: fac ? "ok" : "off" },
        { k: "cob", t: cob ? "Cobrado" : "Por cobrar", c: cob ? "ok" : "r" },
        ...(usoPaquete ? [{ k: "paq", t: "Paquete " + s(r.paquete).replace(/^\s*SI,?\s*/i, ""), c: "a" }] : []),
        ...(exclBeta || Object.values(exclSistema).some(Boolean) ? [{ k: "com", t: "Comisión excluida", c: "r" }] : []),
        ...(cab ? [{ k: "beta", t: "Editado en la beta", c: "a" }] : []),
      ],
    },
    lineas: calc.lineas, totales: { sumaLineas: calc.sumaLineas, promo: calc.promoMonto, descuento: calc.descuentoMonto, descuentoTotal: calc.descuentoTotal, subtotal: calc.subtotal, iva: calc.iva, total: calc.total },
    descuento: { tipo: s(cab?.descuento_tipo) || null, valor: n(cab?.descuento_valor) }, promo: promo ? promo.nombre : "",
    excluirCosmetologa: cab?.excluir_cosmetologa === true, excluirNota: s(cab?.excluir_nota), exclSistema,
    editado: !!cab, lineasBeta: cab?.lineas_beta === true, historial: Array.isArray(cab?.historial) ? cab!.historial : [],
    documentos: docsDe(r), promos, puedeEditar: admin, puedePedir: !admin,
    productosSistema: productQtys(r).length,
  };
}

extend("tk_get", "any", async (p, ctx, ses) => {
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso para ver ese ticket" };
  return await vistaTicket(ctx, ses, r);
});
extend("tk_catalogo", "any", async (_p, ctx, ses) => ({ ok: true, items: await catalogoTicket(ctx, ses), promos: await promosVigentes(ctx) }));

/** Valida y guarda lo propuesto (líneas, descuento, promo, exclusiones). Lo usan el admin y la solicitud aprobada. */
async function guardar(ctx: Ctx, ses: Ses, r: Row, p: Row): Promise<Row> {
  if (!(await hay(ctx))) return { error: FALTA };
  const so = leerSerie(r, "so_num"), clave = claveDe(r, so);
  const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
  const cat = await catalogoTicket(ctx, ses);
  const porCode = new Map(cat.map((c) => [s(c.sku), c]));
  const entrada = Array.isArray(p.lineas) ? p.lineas as Row[] : null;
  const actuales = await lineasDe(ctx, r, cab, cat);
  const L: LineaTk[] = [];
  for (const x of (entrada || actuales).slice(0, 200)) {
    const code = skuCode(s(x.sku));
    const tipo = TIPOS.has(s(x.tipo)) ? s(x.tipo) : "producto";
    const c = porCode.get(code);
    const nueva = !actuales.some((a) => skuCode(a.sku) === code && a.tipo === tipo);
    if (!code) return { error: "Línea sin código" };
    if (nueva && tipo !== "gift" && (!c || c.activo === false)) return { error: (c ? s(c.nombre) : code) + (c ? " está inactivo: no se puede vender" : " no está en el catálogo") };
    const q = n(x.cantidad);
    if (!(q > 0)) return { error: code + ": la cantidad tiene que ser mayor a 0" };
    const pu = x.precio_unit != null && x.precio_unit !== "" ? n(x.precio_unit) : n(c?.pvp);
    if (pu < 0) return { error: code + ": precio inválido" };
    const dt = s(x.descuento_tipo);
    if (dt && dt !== "%" && dt !== "$") return { error: "Descuento inválido" };
    if (dt === "%" && n(x.descuento_valor) > 100) return { error: "El descuento no puede pasar de 100%" };
    L.push({ tipo, sku: code, nombre: s(x.nombre) || s(c?.nombre) || code, cantidad: round2(q), precio_unit: round2(pu), descuento_tipo: dt || null, descuento_valor: n(x.descuento_valor), excluir_comision: x.excluir_comision === true, estimado: x.estimado === true && !nueva && n(x.precio_unit) === n(actuales.find((a) => skuCode(a.sku) === code)?.precio_unit) });
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
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const exclC = p.excluir_cosmetologa != null ? p.excluir_cosmetologa === true : cab?.excluir_cosmetologa === true;
  const exclN = p.excluir_nota != null ? s(p.excluir_nota).slice(0, 300) : s(cab?.excluir_nota);
  const cambios: string[] = [];
  if (entrada) cambios.push("líneas");
  if (p.descuento) cambios.push("descuento " + (dTipo ? dVal + dTipo : "quitado"));
  if (p.promo != null) cambios.push(promoNom ? "promo " + promoNom : "sin promo");
  if (p.excluir_cosmetologa != null || L.some((l) => l.excluir_comision) !== actuales.some((l) => l.excluir_comision)) cambios.push("comisión " + (exclC || L.some((l) => l.excluir_comision) ? "excluida" : "incluida") + (exclN ? " (" + exclN + ")" : ""));
  const hist = [...(Array.isArray(cab?.historial) ? cab!.historial as Row[] : []), { fecha: now, actor, accion: s(p._via) || "edición", detalle: cambios.join(", ") || "guardado", total: calc.total }].slice(-100);
  const fila: Row = {
    sheet_row: r.sheet_row ?? null, descuento_tipo: dTipo || null, descuento_valor: dVal, descuento_monto: calc.descuentoMonto, promo_nombre: promoNom || null, promo_monto: calc.promoMonto,
    excluir_cosmetologa: exclC, excluir_nota: exclN || null, lineas_beta: true, subtotal: calc.subtotal, iva: calc.iva, total: calc.total, actualizado_por: actor, updated_at: now, historial: hist,
  };
  if (cab) await ctx.db.write(actor, "beta_tickets", "update", { clave }, fila);
  else await ctx.db.write(actor, "beta_tickets", "insert", {}, { clave, ...fila });
  for (const l of await todas(ctx, "beta_ticket_lineas")) if (s(l.ticket_clave) === clave) await ctx.db.write(actor, "beta_ticket_lineas", "delete", { id: l.id }, null);
  let i = 0;
  for (const l of calc.lineas) {
    await ctx.db.write(actor, "beta_ticket_lineas", "insert", {}, {
      id: crypto.randomUUID(), ticket_clave: clave, orden: ++i, tipo: l.tipo, sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, precio_unit: l.precio_unit,
      descuento_tipo: l.descuento_tipo || null, descuento_valor: l.descuento_valor, descuento_monto: l.descuento_monto, total_linea: l.total_linea, excluir_comision: l.excluir_comision === true, estimado: l.estimado === true,
    });
  }
  return { ok: true, clave, total: calc.total };
}

extend("tk_guardar", "any", async (p, ctx, ses) => {
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso" };
  if (!esAdmin(ses.rol)) return { error: "Un cambio de ticket lo pide con «Solicitar cambio» (lo aprueba un admin)" };
  return await guardar(ctx, ses, r, p);
});

// Solicitud de cambio del detalle de ticket (quien no es admin): la aprueba un admin en Solicitudes.
SOLICITUD_HOOKS["ticket_detalle"] = {
  fila: async (ctx, ses, fila) => {
    const r = await ticketPorClave(ctx, fila);
    if (!r) return { error: "Ticket no encontrado" };
    if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso para pedir un cambio de ese ticket" };
    const v = await vistaTicket(ctx, ses, r);
    return { row: r, antes: { total: (v.totales as Row).total, lineas: (v.lineas as Row[]).map((l) => s(l.sku) + " ×" + n(l.cantidad) + " $" + n(l.total_linea)).join(", ") } };
  },
  aplicar: async (ctx, ses, fila, propuestos) => {
    const r = await ticketPorClave(ctx, fila);
    if (!r) return { error: "Ticket no encontrado" };
    return await guardar(ctx, ses, r, { ...propuestos, _via: "solicitud aprobada" });
  },
};
