// Detalle de ticket de la beta (Emilia 17/11, como la orden de venta de MineCore).
// Lee el ticket del sistema (tabla tickets, que llena la hoja) y guarda lo editado SOLO en beta_tickets /
// beta_ticket_lineas (0048): cantidad, precio unitario, descuento y total por línea; descuento del ticket
// (% o $), promoción y exclusión de comisión. Admin edita directo; los demás piden el cambio (solicitudes).
import { extend, registroDe } from "./handlers.ts";
import { consultar } from "./query.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, guardarArchivo } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { b, colTicket, telefonoEc, hmUtc, n, productQtys, round2, s, skuCode, ymdUtc, type Row } from "./domain.ts";
import { leerSerie } from "./series.ts";
import { citaDeNombre, citasRango, fechaCita } from "./acuity.ts";
import { conTelefono } from "./lib.ts";
import { claveCliente, paquetesDe, parseGcCanje, recetaDe, saldoGift } from "./ventas.ts";
import { normCedula, normNombre } from "./domain.ts";
import { acceso, esPropio, matrizDe } from "./permisos.ts";
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
async function lineasDe(ctx: Ctx, r: Row, cab: Row | undefined, cat: Row[]): Promise<LineaTk[]> {
  if (cab && cab.lineas_beta === true) {
    return (await todas(ctx, "beta_ticket_lineas")).filter((l) => s(l.ticket_clave) === s(cab.clave)).sort((a, b0) => n(a.orden) - n(b0.orden))
      .map((l) => ({ id: s(l.id), tipo: s(l.tipo), sku: s(l.sku), nombre: s(l.nombre), cantidad: n(l.cantidad), precio_unit: n(l.precio_unit), descuento_tipo: s(l.descuento_tipo) || null, descuento_valor: n(l.descuento_valor), excluir_comision: l.excluir_comision === true, estimado: l.estimado === true, ...(s(l.tipo) === "facial" && !(n(l.precio_unit) > 0) && canjeFacial(r) ? { canje: true } : {}) }));
  }
  const porCode = new Map(cat.map((c) => [s(c.sku), c]));
  const pvpDe = (c: string) => n(porCode.get(skuCode(c))?.pvp);
  const L0 = lineasTicket(r, pvpDe);
  const cobrado = n(r.estimado);
  // Facial canjeado (sesión de paquete o gift card de facial): va en $0 y el cobro se reparte en el resto.
  const canjeF = canjeFacial(r);
  const L = canjeF ? L0.filter((x) => x.tipo !== "facial") : L0;
  const nombreDe = (c: string) => s(porCode.get(skuCode(c))?.nombre) || c;
  const vistos = new Set<string>();
  const out: LineaTk[] = [];
  for (const l of L0) {
    const k = l.tipo + "|" + l.codigo;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const qty = L0.filter((x) => x.codigo === l.codigo && x.tipo === l.tipo).reduce((a, x) => a + x.qty, 0);
    if (canjeF && l.tipo === "facial") { out.push({ tipo: l.tipo, sku: l.codigo, nombre: nombreDe(l.codigo), cantidad: qty, precio_unit: 0, descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: false, canje: true }); continue; }
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
    documentos: [...docsDe(r), ...docsBeta(cab)], faltan: faltaDe(r, (cab?.datos || {}) as Row), promos, puedeEditar: admin, puedePedir: !admin,
    productosSistema: productQtys(r).length,
    ...(await extrasTicket(ctx, ses, r, cab, calc.total)),
  };
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
  const img = s(p.imagen);
  if (!/^data:(image\/|application\/pdf)/.test(img)) return { error: "Sube una foto o PDF" };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const id = await guardarArchivo(ctx.db, actor, "comprobante", "Comprobante " + s(p.clave), img);
  if (!id) return { error: "El archivo pesa más de 1.5 MB" };
  const clave = claveDe(r, leerSerie(r, "so_num"));
  const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
  const datos = { ...((cab?.datos || {}) as Row) };
  datos.comprobantes = [...(Array.isArray(datos.comprobantes) ? datos.comprobantes as Row[] : []), { url: "archivo:" + id, por: ses.name, fecha: now }].slice(-10);
  const hist = [...(Array.isArray(cab?.historial) ? cab!.historial as Row[] : []), { fecha: now, actor, accion: "documento", detalle: "subió comprobante" }].slice(-100);
  if (cab) await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos, historial: hist, actualizado_por: actor, updated_at: now });
  else await ctx.db.write(actor, "beta_tickets", "insert", {}, { clave, sheet_row: r.sheet_row ?? null, datos, historial: hist, actualizado_por: actor, updated_at: now });
  return { ok: true, url: "archivo:" + id, faltan: faltaDe(r, datos) };
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
  return await guardarTodo(ctx, ses, r, p);
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
    return await guardarTodo(ctx, ses, r, { ...propuestos, _via: "solicitud aprobada" });
  },
};

// ───────────── Detalle v2 (Emilia 17/11, como la orden de venta de MineCore) ─────────────
// Cabecera editable (factura completa, clienta, contacto, notas…), pagos, gift cards, paquete, reportes enviados,
// marcas «por corregir» (cruce con Migo), detalle de costos y estados para la lista (LED).
export const DATOS_TK: [string, string][] = [
  ["factura", "Factura"], ["nombre", "Nombre"], ["apellido", "Apellido"], ["cedula", "CI"], ["email", "Email"], ["telefono", "Teléfono"],
  ["cosmetologa", "Atendió"], ["notas", "Notas"], ["recomendaciones", "Recomendaciones"], ["retorno", "Fecha de regreso"], ["local", "Local"],
];
export function facturaCompleta(v: unknown): string {
  const t = s(v).trim();
  if (!t || /sin/i.test(t)) return "";
  const m = t.match(/^(\d{3})-(\d{3})-(\d{1,9})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3].padStart(9, "0")}`;
  const d = facturaTxt(t).replace(/\D/g, "");
  return d ? "001-001-" + d.slice(-9).padStart(9, "0") : t;
}
const METODO: [RegExp, string][] = [[/^efec/i, "efectivo"], [/^tarj/i, "tarjeta"], [/^tran/i, "transferencia"], [/^canj/i, "canje"], [/^cort/i, "cortesía"], [/^gift|^gc/i, "gift card"]];
export function metodosPago(comp: unknown): Row[] {
  return s(comp).split(/\s*[,;|]\s*/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const [m, ref] = x.split(":");
    const met = METODO.find(([re]) => re.test(m.trim()))?.[1] || m.trim().toLowerCase();
    return { metodo: met, ref: s(ref).trim() };
  });
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
const tieneUrl = (v: unknown) => /https?:|archivo:/.test(s(v));
/** Lo que falta en un ticket que sí cuadra (fila amarilla): comprobante de transferencia, número de factura. */
export function faltaDe(r: Row, d: Row): string[] {
  if (ymdUtc(r.timestamp) < FALTA_DESDE) return [];
  const orig = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  if (orig.anulado === true) return [];
  const out: string[] = [];
  const mets = metodosPago(r.comp).map((m) => s(m.metodo));
  const comps = Array.isArray(d.comprobantes) ? d.comprobantes as Row[] : [];
  if (mets.includes("transferencia") && !tieneUrl(colTicket(r, "comprobante")) && !comps.length) out.push("Foto del comprobante de transferencia");
  const fac7 = s(r.fac_7);
  if (b(r.cob) && !b(r.fac) && !s(d.factura) && !/sin/i.test(fac7) && !(Number(fac7) > 0) && !mets.includes("canje") && !mets.includes("cortesía")) out.push("Número de factura");
  return out;
}
/** Documentos subidos en la beta (comprobantes que faltaban). */
export function docsBeta(cab: Row | undefined): Row[] {
  const d = (cab?.datos || {}) as Row, L = Array.isArray(d.comprobantes) ? d.comprobantes as Row[] : [];
  return L.map((x, i) => ({ tipo: "comprobante", nombre: "Comprobante subido " + (i + 1) + (x.por ? " · " + s(x.por) : ""), url: s(x.url) }));
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
  for (const e of await todas(ctx, "beta_ticket_envios")) if (s(e.ticket_clave) === clave) out.push({ tipo: s(e.tipo), fecha: s(e.created_at), por: s(e.por), fuente: "beta" });
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
  try { const k = claveCliente(r); if (k) fc = ((await consultar(ctx.db, "beta_clientes", { cols: ["key", "datos"], filtros: [{ col: "key", op: "eq", val: k }], limite: 1 })).rows[0]?.datos || {}) as Row; } catch { fc = {}; }
  const vf = (x: unknown) => (s(x) ? s(x) : undefined);
  const info: Row = {
    factura: s(d.factura) || facturaCompleta(r.fac_7), nombre: s(d.nombre ?? vf(fc.nombres) ?? r.nombre), apellido: s(d.apellido ?? vf(fc.apellido) ?? r.apellido), cedula: s(d.cedula ?? ced),
    email: s(d.email ?? vf(fc.email) ?? reg?.email), telefono: telefonoEc(d.telefono ?? vf(fc.telefono) ?? reg?.telefono), cosmetologa: s(d.cosmetologa ?? r.atendido_por),
    notas: s(d.notas ?? r.notas_generales), recomendaciones: s(d.recomendaciones ?? r.recomendaciones), retorno: s(d.retorno ?? s(r.fecha_retorno).slice(0, 10)),
    local: s(d.local) || "Sunsu Spa", fecha: ymdUtc(r.timestamp), hora: hmUtc(r.timestamp), orden: r.id ?? null,
  };
  if (!conTelefono(ses)) { delete info.email; delete info.telefono; }
  const pagadoSis = b(r.cob) ? round2(n(r.estimado)) : 0;
  const metodos = metodosPago(r.comp);
  const pagos = { metodos, pagado: pagadoSis, saldo: round2(Math.max(0, total - pagadoSis)), cobrado: b(r.cob) };
  // Gift cards: vendidas en el ticket y canjeadas en el ticket.
  const codsGc = [...codigosGc(r.venta_gift), ...codigosGc(r.gift_card)];
  const gcs = codsGc.length ? (await consultar(ctx.db, "gift_cards", { filtros: [{ col: "codigo_gc", op: "in", val: codsGc }] })).rows : [];
  const dig = codsGc.length ? (await consultar(ctx.db, "gift_cards_digitales", { filtros: [{ col: "codigo", op: "in", val: codsGc }] })).rows : [];
  const gc = (cod: string, uso: string) => {
    const g = gcs.find((x) => !x.borrado_at && s(x.codigo_gc) === cod), dg = dig.find((x) => s(x.codigo) === cod);
    return { codigo: cod, uso, valor: s(g?.valor), saldo: g && admin ? saldoGift(g) : undefined, usado: g?.usado === true,
      comprador: g ? (s(g.nombre_comprador) + " " + s(g.apellido_comprador)).trim() : "", para: s(dg?.para), de: s(dg?.de), facial: s(dg?.facial), mensaje: s(dg?.mensaje), valido: s(dg?.valido), digital: !!dg };
  };
  const giftcards = [...codigosGc(r.venta_gift).map((c) => gc(c, "vendida")), ...codigosGc(r.gift_card).map((c) => gc(c, "canjeada"))];
  // Paquete: uso en este ticket, compra y paquetes vigentes de la clienta.
  const paqs = await paquetesDe(ctx.db, normCedula(ced), normNombre(s(r.nombre) + " " + s(r.apellido)));
  const paquete = {
    uso: /^\s*SI\b/i.test(s(r.paquete)) ? s(r.paquete).replace(/^\s*SI,?\s*/i, "") : "",
    compra: [s(r.compra_pack_3), s(r.compra_pack_6)].filter((x) => x && x !== "-").join(" · "),
    vigentes: paqs.filter((p) => n(p.pendientes) > 0).map((p) => ({ codigo: p.codigo, nombre: p.nombre, usados: p.usados, total: p.total, pendientes: p.pendientes })),
  };
  const envios = await enviosDe(ctx, r, clave);
  const flags = (await todas(ctx, "beta_ticket_flags")).filter((f) => !f.resuelto && (n(f.ticket_id) === n(r.id) || s(f.ticket_clave) === clave))
    .map((f) => ({ id: s(f.id), motivo: s(f.motivo), detalle: admin ? s(f.detalle) : "", factura: s(f.factura), fuente: s(f.fuente) }));
  const reag = await reagendadaDe(ctx, r);
  const orig = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  const anulado = orig.anulado === true, fac = b(r.fac) || !!s(d.factura);
  const chips: Row[] = [
    { k: "estado", t: anulado ? "Anulado" : fac && b(r.cob) ? "Cerrado" : "Abierto", c: anulado ? "anulado" : fac && b(r.cob) ? "cerrado" : "abierto" },
    { k: "cobro", t: b(r.cob) ? "Pagado" : "Por cobrar", c: b(r.cob) ? "pagado" : "porcobrar" },
    { k: "fac", t: fac ? "Facturado" : "Sin factura", c: fac ? "facturado" : "sinfactura" },
    ...(canjeFacial(r) ? [{ k: "canje", t: "Canje", c: "info" }] : []),
    { k: "rep", t: envios.length ? "Reporte enviado" : "Reporte no enviado", c: envios.length ? "ok" : "pend" },
    { k: "reag", t: reag.si ? "Reagendada" : "Sin reagendar", c: reag.si ? "ok" : "pend" },
    ...(paquete.uso ? [{ k: "paq", t: "Paquete " + paquete.uso, c: "info" }] : []),
    ...(flags.length ? [{ k: "flag", t: "Por corregir", c: "anulado" }] : []),
  ];
  return { info, campos: DATOS_TK.filter(([k]) => conTelefono(ses) || (k !== "email" && k !== "telefono")), corregidos: Object.keys(d), pagos, giftcards, paquete, envios, flags, reagendada: reag, faseA: faseA(r), chips, clienteKey: claveCliente(r),
    costosVisibles: admin };
}

async function guardarDatos(ctx: Ctx, ses: Ses, r: Row, datos: Row, via: string): Promise<Row> {
  if (!(await hay(ctx))) return { error: FALTA };
  const so = leerSerie(r, "so_num"), clave = claveDe(r, so);
  const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
  const ok = new Set(DATOS_TK.map(([k]) => k)), limpio: Row = {};
  for (const [k, v] of Object.entries(datos || {})) if (ok.has(k)) limpio[k] = s(v).trim().slice(0, 600);
  if (!Object.keys(limpio).length) return { error: "Nada que cambiar" };
  if (limpio.factura && !/^\d{3}-\d{3}-\d{9}$/.test(facturaCompleta(limpio.factura))) return { error: "Factura: usa 001-001-000000000" };
  if (limpio.factura) limpio.factura = facturaCompleta(limpio.factura);
  if (limpio.retorno && !/^\d{4}-\d{2}-\d{2}$/.test(String(limpio.retorno))) return { error: "Fecha de regreso: AAAA-MM-DD" };
  if (limpio.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(limpio.email))) return { error: "Email inválido" };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const nuevo = { ...((cab?.datos || {}) as Row), ...limpio };
  const hist = [...(Array.isArray(cab?.historial) ? cab!.historial as Row[] : []), { fecha: now, actor, accion: via, detalle: "datos: " + Object.keys(limpio).join(", ") }].slice(-100);
  if (cab) await ctx.db.write(actor, "beta_tickets", "update", { clave }, { datos: nuevo, historial: hist, actualizado_por: actor, updated_at: now });
  else await ctx.db.write(actor, "beta_tickets", "insert", {}, { clave, sheet_row: r.sheet_row ?? null, datos: nuevo, historial: hist, actualizado_por: actor, updated_at: now });
  // Lo de la clienta (nombre, apellido, CI, email, teléfono) también va a su ficha.
  let ficha: Row = {};
  try { const { propagarDesdeTicket } = await import("./clientes_beta_api.ts"); ficha = await propagarDesdeTicket(ctx, ses, claveCliente(r), limpio, so || clave); } catch (e) { ficha = { error: String((e as Error)?.message || e) }; }
  return { ok: true, clave, ficha: ficha.error ? { error: ficha.error } : { ok: true, cambios: ficha.cambios || [] } };
}
const SOLO_DATOS = (p: Row) => p.datos && typeof p.datos === "object" && p.lineas == null && p.descuento == null && p.promo == null && p.excluir_cosmetologa == null;
export async function guardarTodo(ctx: Ctx, ses: Ses, r: Row, p: Row): Promise<Row> {
  if (p.datos && typeof p.datos === "object" && Object.keys(p.datos as Row).length) {
    const g = await guardarDatos(ctx, ses, r, p.datos as Row, s(p._via) || "edición");
    if (g.error || SOLO_DATOS(p)) return g;
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
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const r = await ticketPorClave(ctx, s(p.clave));
  if (!r) return { error: "Ticket no encontrado" };
  const v = await vistaTicket(ctx, ses, r);
  const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === s(v.clave));
  return { ok: true, costos: { numero: (v.ticket as Row).soNum, ...(await costosDe(ctx, r, cab, v.lineas as Row[], n((v.totales as Row).subtotal))) } };
});
extend("tk_costos_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
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
  const tipo = s(p.tipo) === "paquete" ? "paquete" : "facial";
  try {
    await ctx.db.write(actorOf(ses), "beta_ticket_envios", "insert", {}, { id: crypto.randomUUID(), ticket_clave: claveDe(r, leerSerie(r, "so_num")), tipo, telefono_fin: s(p.telefono).replace(/\D/g, "").slice(-4), por: ses.name, created_at: ctx.now.toISOString() });
  } catch { return { error: "Falta aplicar 0050_agenda_beta.sql" }; }
  return { ok: true };
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
      ...(d.factura ? { factura: s(d.factura) } : {}),
    };
  }
  return { ok: true, items, acuity: conAcuity, hoy };
});
