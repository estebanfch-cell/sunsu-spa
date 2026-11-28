// TK141: la chica edita un ticket con el formulario que ya conoce; Emilia aprueba.
// El canje de paquete se elige explícitamente (paquete + sesión) y no se marca solo.
import { extend } from "./handlers.ts";
import { leerFecha, FECHA_NO_ENTIENDO } from "./fecha_flexible.ts";
import { esAdmin } from "./permisos.ts";
import {
  USO_FIELDS, cedulasCompatibles, comisionFacialLinea, cicloInicio, marcaDePersona,
  n, pagaComisionFacial, round2, s, skuCode, toCosmMark, type Row, ymdUtc,
} from "./domain.ts";
import { actorOf, logAccion, type Ctx, type Ses } from "./lib.ts";
import { catalogoTicket, guardarTodo, ticketPorClave, vistaTicket } from "./tickets_beta_api.ts";
import { textoCanje } from "./sin_cobro.ts";
import { snapProducto, comisionUnidad, ventaNetaLineas } from "./productos.ts";
import { calcularTicket } from "./ticket_beta.ts";
import { compraParaComision } from "./domain.ts";
import { CAMPOS_DIFF, diffCampos, diffDescuento, propuestaAnulacion, propuestaEdicion, resumenSolicitudTicket } from "./propuesta_edicion.ts";
import { origConMarca, rechazoSegundaMarca } from "./handlers.ts";

export type LinProp = {
  tipo: string; sku: string; nombre: string; cantidad: number; precio_unit: number;
  descuento_tipo?: string | null; descuento_valor?: number; excluir_comision?: boolean; total_linea?: number;
};

function cobroEsCanjePaquete(p: Row): boolean {
  const c = s(p.cobro || p.cobTipo).toLowerCase();
  return c === "paquete" || /^paquete/.test(c) || /^si\b/i.test(s(p.colQ));
}

export function paqPickDe(p: Row): Row | null {
  const x = p.paqPick && typeof p.paqPick === "object" ? p.paqPick as Row : null;
  if (!x) return null;
  if (s(x.fila) === "luego" || s(x.fila) === "nuevo") return x;
  if (x.fila == null || x.fila === "") return null;
  return x;
}

function skuDeTexto(txt: string): string {
  const m = /SUNSU-?[A-Z]*-?\d+/i.exec(txt);
  return m ? skuCode(m[0]) : skuCode(txt);
}

function nombreDeTexto(txt: string, sku: string): string {
  const t = s(txt).replace(new RegExp("^" + sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*", "i"), "").trim();
  return (sku.startsWith("SUNSU-") ? sku + " " : "") + (t || sku);
}

/** Convierte el payload del formulario de ticket a líneas que guarda el detalle. */
export function formALineas(p: Row): LinProp[] {
  const L: LinProp[] = [];
  const canje = cobroEsCanjePaquete(p);
  const cortesia = /cortes[ií]a/.test(s(p.cobro || p.cobTipo).toLowerCase());
  const facTxt = s(p.facial);
  if (facTxt) {
    const sku = skuDeTexto(facTxt) || "FAC";
    let nombre = nombreDeTexto(facTxt, sku);
    const pick = paqPickDe(p);
    if (canje && pick && pick.fila !== "luego" && pick.fila !== "nuevo") {
      const ses = { n: n(pick.idx) + 1, total: n(pick.total) || 3 };
      nombre = nombre.replace(/\s*·\s*Canje paquete.*$/i, "").trim() + " · " + textoCanje({ codigo: s(pick.codigo) || s(pick.nombre) }, ses);
    } else if (canje) {
      nombre = nombre.replace(/\s*·\s*Canje paquete.*$/i, "").trim() + " · Canje paquete";
    }
    const pu = canje || cortesia ? 0 : (s(p.cobro) === "giftcard" ? n(p.gcDif ?? p._gcDif) : n(p.facialPrecio));
    L.push({ tipo: "facial", sku, nombre, cantidad: 1, precio_unit: round2(pu) });
  }
  const extras = s(p.extras);
  if (extras) {
    for (const part of extras.split("|")) {
      const t = part.trim();
      if (!t) continue;
      const sku = skuDeTexto(t);
      const cort = /\[CORTESIA/i.test(t);
      const nombre = nombreDeTexto(t.replace(/\s*\[CORTESIA[^\]]*\]/i, ""), sku);
      const px = (p.precios_extra && typeof p.precios_extra === "object" ? p.precios_extra : {}) as Row;
      const precio = cort ? 0 : (n(px[sku]) || n(px[t]) || n(px[skuCode(sku)]) || n(px["SUNSU-" + skuCode(sku)]) || 0);
      L.push({ tipo: "extra", sku: sku || t, nombre, cantidad: 1, precio_unit: precio });
    }
  }
  const prods = p.productos && typeof p.productos === "object" ? p.productos as Row : {};
  const precios = (p.precios_producto && typeof p.precios_producto === "object" ? p.precios_producto : {}) as Row;
  for (const [sku0, qty] of Object.entries(prods)) {
    const q = n(qty);
    if (!(q > 0)) continue;
    const sku = skuCode(sku0) || sku0;
    L.push({ tipo: "producto", sku, nombre: s(precios[sku + "_nombre"]) || sku0, cantidad: q, precio_unit: n(precios[sku] ?? precios[sku0]) });
  }
  const packs: Array<[string, string]> = [["pack3", s(p.pack3_sku || p.pack3)], ["pack6", s(p.pack6_sku || p.pack6)]];
  const pp = (p.precios_paquete && typeof p.precios_paquete === "object" ? p.precios_paquete : {}) as Row;
  for (const [campo, txt] of packs) {
    if (!txt) continue;
    const sku = skuDeTexto(txt) || txt;
    L.push({ tipo: "paquete", sku, nombre: nombreDeTexto(s(p[campo]) || txt, sku), cantidad: 1, precio_unit: n(pp[sku]) || n((p as Row)[campo + "Precio"]) });
  }
  return L;
}

function keyLin(l: Row): string {
  return s(l.tipo) + "|" + skuCode(s(l.sku) || s(l.nombre));
}

export function diffLineas(antes: Row[], despues: Row[]): Row[] {
  const A = new Map(antes.map((l) => [keyLin(l), l]));
  const D = new Map(despues.map((l) => [keyLin(l), l]));
  const out: Row[] = [];
  for (const [k, l] of D) {
    const prev = A.get(k);
    if (!prev) out.push({ estado: "agregada", sku: l.sku, nombre: l.nombre, tipo: l.tipo, cantidad: l.cantidad, precio_unit: l.precio_unit, total: n(l.total_linea) || round2(n(l.cantidad) * n(l.precio_unit)) });
    else if (n(prev.cantidad) !== n(l.cantidad) || n(prev.precio_unit) !== n(l.precio_unit) || n(prev.total_linea) !== n(l.total_linea || n(l.cantidad) * n(l.precio_unit))) {
      out.push({
        estado: "modificada", sku: l.sku, nombre: l.nombre, tipo: l.tipo,
        cantidad: l.cantidad, precio_unit: l.precio_unit,
        total: n(l.total_linea) || round2(n(l.cantidad) * n(l.precio_unit)),
        antes_cantidad: prev.cantidad, antes_precio_unit: prev.precio_unit, antes_total: n(prev.total_linea) || round2(n(prev.cantidad) * n(prev.precio_unit)),
      });
    } else {
      out.push({ estado: "igual", sku: l.sku, nombre: l.nombre, tipo: l.tipo, cantidad: l.cantidad, precio_unit: l.precio_unit, total: n(l.total_linea) || round2(n(l.cantidad) * n(l.precio_unit)) });
    }
  }
  for (const [k, l] of A) {
    if (!D.has(k)) out.push({ estado: "eliminada", sku: l.sku, nombre: l.nombre, tipo: l.tipo, cantidad: l.cantidad, precio_unit: l.precio_unit, total: n(l.total_linea) || round2(n(l.cantidad) * n(l.precio_unit)) });
  }
  return out;
}

function lineasDeVista(v: Row): Row[] {
  return Array.isArray(v.lineas) ? v.lineas as Row[] : [];
}

function totalesDe(v: Row): Row {
  const t = (v.totales && typeof v.totales === "object" ? v.totales : v) as Row;
  const pagado = n(t.pagado ?? (v.pagos as Row | undefined)?.pagado);
  const total = n(t.total);
  const saldo = t.saldo != null && t.saldo !== "" ? n(t.saldo) : round2(total - pagado);
  return { subtotal: n(t.subtotal), iva: n(t.iva), total, pagado, saldo };
}

function comisionDeLineas(L: Row[]): number {
  return round2(L.reduce((a, l) => a + n(l.comision), 0));
}

async function snapshotTicket(ctx: Ctx, ses: Ses, r: Row): Promise<Row> {
  const v = await vistaTicket(ctx, ses, r);
  const L = lineasDeVista(v);
  const info = (v.info && typeof v.info === "object" ? v.info : {}) as Row;
  const ticket = (v.ticket && typeof v.ticket === "object" ? v.ticket : {}) as Row;
  return {
    lineas: L.map((l) => ({ tipo: l.tipo, sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, precio_unit: l.precio_unit, total_linea: l.total_linea, comision: l.comision, descuento_tipo: l.descuento_tipo, descuento_valor: l.descuento_valor })),
    totales: totalesDe(v),
    comision: comisionDeLineas(L),
    facial: s(info.facial || r.facial_hecho || ticket.facial),
    paquete: s(r.paquete),
    extras: s(r.servicios_adicionales),
    atendido_por: s(r.atendido_por),
    factura: s(info.factura),
    // TK154: cabecera editable para el comparativo (nunca teléfono ni email).
    datos: {
      nombre: s(info.nombre), apellido: s(info.apellido), cedula: s(info.cedula), factura: s(info.factura),
      cosmetologa: s(info.cosmetologa || r.atendido_por), notas: s(info.notas), recomendaciones: s(info.recomendaciones),
      retorno: s(info.retorno), cabina: s(info.cabina), local: s(info.local),
    },
    descuento: (v.descuento && typeof v.descuento === "object") ? v.descuento : null,
  };
}

function notaSesion(facial: string, cosm: string, now: Date): string {
  const d = now.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "2-digit", year: "2-digit" });
  return d.replace(/\//g, "/") + " " + (facial || "Facial") + " · " + (cosm || "—");
}

/** Marca exactamente la sesión elegida. No elige «la siguiente libre» por su cuenta. */
/**
 * Paquete al que apunta `fila` en un canje. Un número es SIEMPRE el sheet_row (así lo manda la pantalla);
 * un texto tipo PACK-661 / PQ-0053 es solo el código. Nunca se cruza un número con `id`: en los paquetes
 * importados sheet_row = id + 2, y el cruce marcaba la sesión en el paquete de otra clienta
 * (TK-SO-2030 de Marisol cayó en PACK-663 de Emely, 27-nov-2026).
 */
export function paqueteDeFila(rows: Row[], fila: unknown): Row | null {
  const t = s(fila).trim();
  if (!t) return null;
  if (/^-?\d+(\.0+)?$/.test(t)) {
    const sr = Number(t);
    return rows.find((x) => x.sheet_row != null && s(x.sheet_row) !== "" && Number(x.sheet_row) === sr) || null;
  }
  const cod = t.toUpperCase().replace(/^PACK(?!-)\s*/, "PACK-");
  return rows.find((x) => [s(x.codigo), s(x.beta_codigo)].some((c) => c && c.toUpperCase() === cod)) || null;
}

export async function aplicarUsoExplicit(ctx: Ctx, actor: string, opts: {
  fila: unknown; idx: unknown; ticket: string; nota: string; cosm: string;
}): Promise<Row> {
  const sheet = n(opts.fila);
  const idx = n(opts.idx);
  if (!(sheet > 0) && sheet !== 0) {
    // sheet_row puede ser el id de fila; también se acepta código vía busca
    if (sheet < 0) { /* modo prueba */ }
    else if (!(s(opts.fila))) return { error: "Falta el paquete" };
  }
  const rows = await ctx.db.all("paquetes").catch(() => [] as Row[]);
  const row = paqueteDeFila(rows, opts.fila);
  if (!row || row.borrado_at) return { error: "Paquete no encontrado" };
  if (idx < 0 || idx > 5) return { error: "Elige una sesión del paquete" };
  const [u, f] = USO_FIELDS[idx];
  const yaMismo = s(row.orig && (row.orig as Row).marcas_slot && ((row.orig as Row).marcas_slot as Row)[opts.ticket]);
  if (s(row[u]) === "true" || row[u] === true || s(row[f])) {
    // Idempotente si este ticket ya tenía esa sesión.
    const orig = row.orig && typeof row.orig === "object" ? row.orig as Row : {};
    const slots = orig.marcas_slot && typeof orig.marcas_slot === "object" ? orig.marcas_slot as Row : {};
    const L = Array.isArray(slots[opts.ticket]) ? (slots[opts.ticket] as unknown[]).map((x) => n(x)) : [];
    if (L.includes(idx + 1)) return { ok: true, slot: idx + 1, ya: true, codigo: s((row.orig as Row | undefined)?.codigo) || s(row.codigo) };
    return { error: "Esa sesión ya está descargada" };
  }
  const rechazo = rechazoSegundaMarca(row, idx, opts.ticket, ctx.now.getTime());
  if (rechazo) return { error: rechazo };
  const patch: Row = { [u]: true, [f]: opts.nota || notaSesion("", opts.cosm, ctx.now), orig: origConMarca(row, idx, opts.ticket, ctx.now.getTime(), false) };
  const usados = USO_FIELDS.filter((ff, i) => i === idx || row[ff[0]] === true || s(row[ff[0]]) === "true" || s(row[ff[1]])).length;
  // total unknown here; completo lo deja el módulo de paquetes si aplica
  await ctx.db.write(actor, "paquetes", "update", row.sheet_row != null ? { sheet_row: row.sheet_row } : { id: row.id }, patch);
  return { ok: true, slot: idx + 1, codigo: s((row.orig as Row | undefined)?.codigo) || s(row.codigo) || s(row.beta_codigo) };
}

export async function revertirUsoDeTicket(ctx: Ctx, actor: string, ticket: string): Promise<void> {
  const rows = await ctx.db.all("paquetes").catch(() => [] as Row[]);
  for (const row of rows) {
    const orig = row.orig && typeof row.orig === "object" ? { ...(row.orig as Row) } : {};
    const slots = orig.marcas_slot && typeof orig.marcas_slot === "object" ? { ...(orig.marcas_slot as Row) } : {};
    const L = Array.isArray(slots[ticket]) ? (slots[ticket] as unknown[]).map((x) => n(x)) : [];
    if (!L.length) continue;
    const patch: Row = { orig: { ...orig } };
    for (const nro of L) {
      const i = nro - 1;
      if (i < 0 || i > 5) continue;
      const [u, f] = USO_FIELDS[i];
      patch[u] = false;
      patch[f] = "";
    }
    delete slots[ticket];
    (patch.orig as Row).marcas_slot = slots;
    const marks = Array.isArray(orig.marcas_ticket) ? (orig.marcas_ticket as unknown[]).map((x) => s(x)).filter((x) => x && x !== ticket) : [];
    (patch.orig as Row).marcas_ticket = marks;
    (patch.orig as Row).completo = false;
    patch.completo = false;
    await ctx.db.write(actor, "paquetes", "update", row.sheet_row != null ? { sheet_row: row.sheet_row } : { id: row.id }, patch);
  }
}

function colQDePick(pick: Row | null): string {
  if (!pick || s(pick.fila) === "luego") return "";
  if (s(pick.fila) === "nuevo") return "SI, 1/" + (n(pick.total) || 3);
  const nro = n(pick.idx) + 1, tot = n(pick.total) || 3;
  return "SI, " + nro + "/" + tot;
}

export function diffEdicion(antes: Row, form: Row, lineas: LinProp[], totDes: Row, comDes: number): Row {
  const pick = paqPickDe(form);
  const cabecera: Row[] = [];
  const facNuevo = s(form.facial);
  if (s(antes.facial) !== facNuevo || cobroEsCanjePaquete(form)) {
    const ses = pick && pick.fila !== "luego" && pick.fila !== "nuevo" ? ("Canje " + (s(pick.codigo) || s(pick.nombre) || "paquete") + " · Sesión " + (n(pick.idx) + 1) + "/" + (n(pick.total) || 3)) : (cobroEsCanjePaquete(form) ? "Canje paquete" : "");
    cabecera.push({ campo: "Facial", antes: s(antes.facial) || "—", despues: facNuevo ? (facNuevo + (ses ? " (" + ses + ")" : "")) : "—" });
  }
  const q = colQDePick(pick) || s(form.colQ);
  if (s(antes.paquete) !== q && (s(antes.paquete) || q)) cabecera.push({ campo: "Paquete", antes: s(antes.paquete) || "—", despues: q || "—" });
  const extras = s(form.extras);
  if (s(antes.extras) !== extras) cabecera.push({ campo: "Extras", antes: s(antes.extras) || "—", despues: extras || "—" });
  // TK154: notas, cosmetóloga, datos y descuento también salen en el comparativo.
  const datosExp = !!(form.datos && typeof form.datos === "object");
  const datosDes = (datosExp ? form.datos : { nombre: form.nombre, apellido: form.apellido, cedula: form.cedula, factura: form.factura, notas: form.notas, recomendaciones: form.recomendaciones, retorno: form.fechaRetorno }) as Row;
  for (const c of diffCampos((antes.datos || {}) as Row, datosDes, datosExp)) cabecera.push(c);
  const dd = diffDescuento(antes.descuento, form.descuento ?? form._descuento);
  if (dd) cabecera.push(dd);
  const ta = (antes.totales || {}) as Row;
  return {
    cabecera,
    lineas: diffLineas((antes.lineas || []) as Row[], lineas as unknown as Row[]),
    totales: {
      antes: { subtotal: n(ta.subtotal), iva: n(ta.iva), total: n(ta.total), pagado: n(ta.pagado), saldo: n(ta.saldo) },
      despues: { subtotal: n(totDes.subtotal), iva: n(totDes.iva), total: n(totDes.total), pagado: n(totDes.pagado ?? ta.pagado), saldo: n(totDes.saldo) },
    },
    comision: { antes: n(antes.comision), despues: comDes },
  };
}

function calcTotales(lineas: LinProp[], desc?: Row): Row {
  const L = lineas.map((l) => ({ tipo: l.tipo, sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, precio_unit: l.precio_unit, descuento_tipo: l.descuento_tipo || null, descuento_valor: n(l.descuento_valor) }));
  const dTipo = desc && s(desc.tipo);
  const r = calcularTicket(L, dTipo ? { tipo: dTipo, valor: n(desc?.valor) } : { tipo: null, valor: 0 });
  return { subtotal: r.subtotal, iva: r.iva, total: r.total, pagado: 0, saldo: r.total };
}

/** TK154: «Eliminar ticket» de las chicas → solicitud de anulación con snapshot. El ticket real no se toca. */
export async function pedirAnulacionTicket(p: Row, ctx: Ctx, ses: Ses): Promise<Row> {
  if (esAdmin(ses.rol) && p.forzar_solicitud !== true) return { error: "Un admin elimina el ticket directo (Cancelar ticket)" };
  const clave = s(p.clave || p.fila);
  const motivo = s(p.motivo).trim();
  if (motivo.length < 3) return { error: "Escribe el motivo para eliminar el ticket" };
  const r = await ticketPorClave(ctx, clave);
  if (!r) return { error: "Ticket no encontrado" };
  const { veTicket } = await import("./inline_api.ts");
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso para este ticket" };
  if ((r.orig as Row | undefined)?.anulado === true) return { error: "El ticket ya está cancelado" };
  const antes = await snapshotTicket(ctx, ses, r);
  const propuesta = propuestaAnulacion(antes, motivo);
  const recBase = {
    solicitante: ses.name, solicitante_uid: ses.uid, creado: ctx.now.toISOString(),
    tabla: "ticket_detalle", fila: clave, tipo: "eliminacion", motivo, estado: "pendiente",
    etiqueta: "Eliminar " + clave, enlace: "#/m/tickets/t/" + encodeURIComponent(clave),
    propuestos: { propuesta, _via: "solicitud de eliminación" }, antes,
  } as Row;
  const sols = await ctx.db.all("solicitudes_cambio").catch(() => [] as Row[]);
  const hay = sols.find((x) => s(x.tabla) === "ticket_detalle" && s(x.fila) === clave && s(x.estado) === "pendiente" && x.prueba !== true);
  if (hay && s(hay.solicitante_uid) && s(hay.solicitante_uid) !== ses.uid && s(hay.solicitante) !== ses.name) {
    return { error: "Ya hay una solicitud pendiente de " + (s(hay.solicitante) || "otra persona") + " para este ticket." };
  }
  const id = hay ? s(hay.id) : crypto.randomUUID();
  if (hay) await ctx.db.write(actorOf(ses), "solicitudes_cambio", "update", { id: hay.id }, { ...recBase, id });
  else await ctx.db.write(actorOf(ses), "solicitudes_cambio", "insert", {}, { ...recBase, id });
  try { await logAccion(ctx.db, actorOf(ses), "SOLICITUD ELIMINAR TICKET", clave + " · " + motivo); } catch { /* */ }
  try { await avisarEdicionTicket(ctx, ses, clave, id, !!hay, true); } catch { /* el aviso no frena */ }
  return { ok: true, id, clave, tipo: "anular", propuesta, mensaje: "Se le solicitó al administrador eliminar este ticket" };
}

/**
 * TK185 (Emilia): una línea que la chica NO tocó (misma cantidad y precio) conserva su prorrateo/descuento de paquete
 * (p. ej. Facial Reset 3x1 $95 → $31.46). El formulario de edición lo perdía y la propuesta subía el total sin querer.
 */
export function conservarProrrateo(nuevas: LinProp[], antes: Row[]): LinProp[] {
  const prev = new Map<string, Row>();
  for (const l of antes || []) prev.set(s(l.tipo) + "|" + skuCode(s(l.sku) || s(l.nombre)), l);
  return nuevas.map((l) => {
    const old = prev.get(s(l.tipo) + "|" + skuCode(s(l.sku) || s(l.nombre)));
    if (!old) return l;
    const explicito = !!s(l.descuento_tipo) && n(l.descuento_valor) > 0;
    if (explicito || n(old.cantidad) !== n(l.cantidad) || n(old.precio_unit) !== n(l.precio_unit)) return l;
    if (!s(old.descuento_tipo) || !(n(old.descuento_valor) > 0)) return l;
    return { ...l, descuento_tipo: s(old.descuento_tipo), descuento_valor: n(old.descuento_valor), ...(n(old.total_linea) > 0 ? { total_linea: n(old.total_linea) } : {}) };
  });
}

/** TK185: de los datos del formulario, solo los que cambian (como en el comparativo). Vacío sin intención explícita = sin cambio. */
export function datosCambiados(antes: Row, des: Row, explicitos: boolean): Row {
  const out: Row = {};
  const comparables = new Set(CAMPOS_DIFF.map(([k]) => k));
  if (explicitos) for (const [k, v] of Object.entries(des || {})) if (!comparables.has(k)) out[k] = v;
  for (const c of diffCampos(antes || {}, des || {}, explicitos)) { const k = s(c.clave); if (k) out[k] = des[k]; }
  return out;
}

export async function pedirEdicionTicket(p: Row, ctx: Ctx, ses: Ses): Promise<Row> {
  if (p.anular === true || s(p.tipo) === "anular" || s(p.tipo) === "eliminacion") return pedirAnulacionTicket(p, ctx, ses);
  if (esAdmin(ses.rol) && p.forzar_solicitud !== true) return { error: "Un admin guarda el cambio directo o lo aprueba en Aprobaciones" };
  const clave = s(p.clave || p.fila);
  const r = await ticketPorClave(ctx, clave);
  if (!r) return { error: "Ticket no encontrado" };
  const { veTicket } = await import("./inline_api.ts");
  if (!(await veTicket(ctx, ses, r))) return { error: "No tienes permiso para editar este ticket" };
  if ((r.orig as Row | undefined)?.anulado === true) return { error: "El ticket está cancelado: no se edita" };
  const form = (p.form && typeof p.form === "object" ? p.form : p) as Row;
  if (cobroEsCanjePaquete(form) && !form.canjeOtro) {
    const pick = paqPickDe(form);
    if (!pick) return { error: "Elige el paquete y la sesión que vas a descargar" };
    if (pick.fila !== "luego" && pick.fila !== "nuevo" && !(n(pick.idx) >= 0)) return { error: "Marca qué sesión del paquete se descarga" };
  }
  const antes = await snapshotTicket(ctx, ses, r);
  let lineas = Array.isArray(p.lineas) ? p.lineas as LinProp[] : formALineas(form);
  const prev = new Map(((antes.lineas || []) as Row[]).map((l) => [s(l.tipo) + "|" + skuCode(s(l.sku) || s(l.nombre)), l]));
  lineas = lineas.map((l) => {
    if (n(l.precio_unit) > 0) return l;
    if (l.tipo === "facial" && cobroEsCanjePaquete(form)) return l;
    const old = prev.get(l.tipo + "|" + skuCode(l.sku));
    return old && n(old.precio_unit) > 0 ? { ...l, precio_unit: n(old.precio_unit) } : l;
  });
  if (!lineas.length) return { error: "Agrega al menos un servicio o producto" };
  lineas = conservarProrrateo(lineas, (antes.lineas || []) as Row[]);
  {
    const dRaw = (form.datos && typeof form.datos === "object" ? (form.datos as Row).retorno : form.fechaRetorno);
    if (s(dRaw).trim() && !leerFecha(dRaw)) return { error: FECHA_NO_ENTIENDO };
  }
  const tot = calcTotales(lineas, p.descuento as Row | undefined);
  const pagadoAntes = n((antes.totales as Row | undefined)?.pagado);
  tot.pagado = pagadoAntes;
  tot.saldo = round2(n(tot.total) - pagadoAntes);
  // Comisión estimada del después: las de producto se recalculan al aprobar; acá mostramos un estimado + facial fijo.
  let comDes = 0;
  try {
    const { cfgAplicada } = await import("./comision_cfg.ts");
    const fechaTk = ymdUtc(r.timestamp) || ymdUtc(ctx.now);
    const cfgTk = (await cfgAplicada(ctx.db, cicloInicio(fechaTk))).cfg;
    const marcas = (await ctx.db.all("cosmetologas").catch(() => [] as Row[])).map(toCosmMark);
    const paga = pagaComisionFacial(marcaDePersona(marcas, s(r.atendido_por)), fechaTk);
    const cat = await catalogoTicket(ctx, ses);
    const por = new Map(cat.map((c) => [skuCode(s(c.sku)), c]));
    const nets = ventaNetaLineas(lineas.map((l) => ({ total_linea: round2(l.cantidad * l.precio_unit) })), tot.total as number);
    lineas.forEach((l, i) => {
      if (l.tipo === "facial") comDes += comisionFacialLinea({ sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, excluir: false }, cfgTk, paga);
      else if (l.tipo === "producto") {
        const c = por.get(skuCode(l.sku));
        comDes += comisionUnidad(nets[i] || 0, compraParaComision(c) * l.cantidad);
      }
    });
    comDes = round2(comDes);
  } catch { comDes = 0; }
  // TK185: si ninguna línea cambia, la comisión tampoco (no inventar «$0.00 → $3.00»).
  if (diffLineas((antes.lineas || []) as Row[], lineas as unknown as Row[]).every((x) => s(x.estado) === "igual")) comDes = n(antes.comision);
  const diff = diffEdicion(antes, form, lineas, tot, comDes);
  const motivo = s(p.motivo).trim() || "Edición del ticket";
  const recBase = {
    solicitante: ses.name, solicitante_uid: ses.uid, creado: ctx.now.toISOString(),
    tabla: "ticket_detalle", fila: clave, tipo: "cambio",
    motivo, estado: "pendiente",
    etiqueta: "Edición de " + clave,
    enlace: "#/m/tickets/t/" + encodeURIComponent(clave),
    propuestos: {
      // TK185: solo los datos que de verdad cambian (antes iba factura "" y al aprobar borraba la factura).
      edicion_form: true, form, lineas, datos: datosCambiados((antes.datos || {}) as Row, (form.datos || { nombre: form.nombre, apellido: form.apellido, cedula: form.cedula, factura: form.factura, notas: form.notas, recomendaciones: form.recomendaciones, retorno: form.fechaRetorno }) as Row, !!form.datos),
      colQ: colQDePick(paqPickDe(form)) || s(form.colQ), facial_hecho: s(form.facial), servicios_adicionales: s(form.extras), paqPick: paqPickDe(form), diff,
      // TK154: propuesta estructurada (antes / después / diff legible). Se aplica tal cual al aprobar.
      propuesta: propuestaEdicion(antes, { lineas, totales: tot, datos: form.datos || null, descuento: p.descuento ?? null }, diff, motivo),
      _via: "edición de ticket",
    },
    antes,
  } as Row;
  const sols = await ctx.db.all("solicitudes_cambio").catch(() => [] as Row[]);
  const hay = sols.find((x) => s(x.tabla) === "ticket_detalle" && s(x.fila) === clave && s(x.estado) === "pendiente" && x.prueba !== true);
  if (hay && s(hay.solicitante_uid) && s(hay.solicitante_uid) !== ses.uid && s(hay.solicitante) !== ses.name) {
    return { error: "Ya hay una edición pendiente de " + (s(hay.solicitante) || "otra persona") + ". Espera a que la revisen o pídele que la ajuste." };
  }
  if (hay) {
    await ctx.db.write(actorOf(ses), "solicitudes_cambio", "update", { id: hay.id }, { ...recBase, id: hay.id });
    try { await logAccion(ctx.db, actorOf(ses), "SOLICITUD EDICIÓN", clave + " · actualizada"); } catch { /* */ }
    try { await avisarEdicionTicket(ctx, ses, clave, s(hay.id), true); } catch { /* el aviso no frena */ }
    return { ok: true, id: hay.id, actualizada: true, diff, clave };
  }
  const id = crypto.randomUUID();
  await ctx.db.write(actorOf(ses), "solicitudes_cambio", "insert", {}, { ...recBase, id });
  try { await logAccion(ctx.db, actorOf(ses), "SOLICITUD EDICIÓN", clave); } catch { /* */ }
  try { await avisarEdicionTicket(ctx, ses, clave, id, false); } catch { /* el aviso no frena */ }
  return { ok: true, id, actualizada: false, diff, clave };
}

export async function avisarEdicionTicket(ctx: Ctx, ses: Ses, clave: string, solId: string, actualizada: boolean, anular = false): Promise<void> {
  const titulo = anular ? "Solicitud para eliminar ticket" : actualizada ? "Solicitud de edición actualizada" : "Solicitud de edición de ticket";
  const cuerpo = s(ses.name) + (anular ? " pidió eliminar " : actualizada ? " actualizó la edición de " : " pidió editar ") + clave;
  const link = "#/m/tickets/t/" + encodeURIComponent(clave);
  const users = await ctx.db.all("usuarios").catch(() => [] as Row[]);
  const { esAdmin } = await import("./permisos.ts");
  for (const u of users) {
    if (!esAdmin(s(u.rol))) continue;
    const uid = s(u.uid) || s(u.id);
    if (!uid || uid === s(ses.uid)) continue;
    try {
      await ctx.db.write(actorOf(ses), "beta_notificaciones", "insert", {}, {
        id: crypto.randomUUID(), usuario: uid, tipo: "edicion_ticket",
        titulo, cuerpo, link, ref_id: solId, created_at: ctx.now.toISOString(),
      });
    } catch { /* sigue con el resto */ }
  }
  try {
    const { pushAPersonas } = await import("./horarios_api.ts");
    const nombres = users.filter((u) => esAdmin(s(u.rol)) && s(u.nombre) !== s(ses.name)).map((u) => s(u.nombre));
    await pushAPersonas(ctx, ses, nombres, cuerpo, "edicion_ticket");
  } catch { /* push opcional */ }
}

export function avisosVirtualesEdicion(sols: Row[], existentes: Row[], ses: Ses, esAdminRol: boolean, inactivos?: Set<string>): Row[] {
  if (!esAdminRol) return [];
  const out: Row[] = [];
  for (const r of sols) {
    if (s(r.tabla) !== "ticket_detalle" || s(r.estado) !== "pendiente" || r.prueba === true) continue;
    if (inactivos && inactivos.has(s(r.fila))) continue;
    const link = s(r.enlace) || ("#/m/tickets/t/" + encodeURIComponent(s(r.fila)));
    const sid = s(r.id);
    // TK224: si ya hay un aviso (leído o no) de esta solicitud, no se resucita uno virtual.
    // Antes solo se omitía si había uno SIN leer, y el × no servía: al marcar leído reaparecía el virtual.
    if (existentes.some((x) => {
      const same = s(x.ref_id) === sid || s(x.id) === "sol:" + sid || s(x.id) === sid || s(x.link) === link;
      return same && (s(x.tipo) === "edicion_ticket" || s(x.tipo) === "solicitud" || !s(x.tipo));
    })) continue;
    const anu = s(r.tipo) === "eliminacion";
    out.push({
      id: "sol:" + s(r.id), tipo: "edicion_ticket",
      titulo: anu ? "Solicitud para eliminar ticket" : "Solicitud de edición de ticket",
      cuerpo: (s(r.solicitante) || "Alguien") + (anu ? " pidió eliminar " : " pidió editar ") + s(r.fila) + (s(r.motivo) ? " · " + s(r.motivo) : ""),
      link, leida: false, fecha: s(r.creado),
    });
  }
  return out;
}

export async function aplicarEdicionTicket(ctx: Ctx, ses: Ses, fila: string, propuestos: Row, sol?: Row): Promise<Row> {
  const r = await ticketPorClave(ctx, fila);
  if (!r) return { error: "Ticket no encontrado" };
  const form = (propuestos.form && typeof propuestos.form === "object" ? propuestos.form : propuestos) as Row;
  let lineas = (Array.isArray(propuestos.lineas) ? propuestos.lineas : formALineas(form)) as LinProp[];
  // TK185: propuestas viejas sin el prorrateo → se conserva el de la línea actual si no cambió cantidad ni precio.
  const antesL = (sol?.antes && typeof sol.antes === "object" && Array.isArray((sol.antes as Row).lineas)) ? (sol.antes as Row).lineas as Row[] : (await snapshotTicket(ctx, ses, r)).lineas as Row[];
  lineas = conservarProrrateo(lineas, antesL || []);
  const cosm = s(r.atendido_por); // NUNCA el admin que aprueba
  const actor = actorOf(ses);
  const pick = paqPickDe(form) || paqPickDe(propuestos);
  const canjeNuevo = cobroEsCanjePaquete(form) && pick && pick.fila !== "luego" && pick.fila !== "nuevo";
  const canjeAntes = /^SI\b/i.test(s(r.paquete));
  if (canjeAntes && !canjeNuevo) {
    await revertirUsoDeTicket(ctx, actor, s(r.so_num) || fila);
  }
  // TK185: si las líneas quedan iguales (solo cambian notas/recomendaciones/fecha), no se reescriben: así no se piden
  // justificaciones ni se recalcula un ticket que nadie tocó.
  const sinCambioLineas = !propuestos.descuento && diffLineas(antesL || [], lineas as unknown as Row[]).every((x) => s(x.estado) === "igual");
  // Descuento que el ticket YA tenía (prorrateo de paquete): no se le pide justificación nueva.
  const carried = lineas.some((l) => n(l.descuento_valor) > 0 && (antesL || []).some((o) => s(o.tipo) === s(l.tipo) && skuCode(s(o.sku) || s(o.nombre)) === skuCode(s(l.sku) || s(l.nombre)) && n(o.descuento_valor) === n(l.descuento_valor)));
  const g = await guardarTodo(ctx, ses, r, {
    ...(sinCambioLineas ? {} : { lineas }),
    ...(carried && !s(form.justificacion_descuento) ? { justificacion_descuento: "Prorrateo del paquete (sin cambio)" } : {}),
    datos: (propuestos.datos && typeof propuestos.datos === "object" ? propuestos.datos : {}) as Row,
    descuento: propuestos.descuento,
    ...(s(form.justificacion_descuento) ? { justificacion_descuento: s(form.justificacion_descuento) } : {}),
    _via: "solicitud aprobada (edición" + (sol && s(sol.solicitante) ? " pedida por " + s(sol.solicitante) : "") + ")",
  });
  if (g.error) return g;
  const patch: Row = {};
  if (s(form.facial) || s(propuestos.facial_hecho)) patch.facial_hecho = s(form.facial || propuestos.facial_hecho);
  if (s(form.extras) || s(propuestos.servicios_adicionales)) patch.servicios_adicionales = s(form.extras || propuestos.servicios_adicionales);
  const q = s(propuestos.colQ) || colQDePick(pick);
  if (q || canjeAntes) patch.paquete = q;
  if (Object.keys(patch).length) {
    const match = r.id != null ? { id: r.id } : { sheet_row: r.sheet_row };
    await ctx.db.write(actor, "tickets", "update", match, patch);
  }
  let uso: Row | null = null;
  if (canjeNuevo && pick) {
    uso = await aplicarUsoExplicit(ctx, actor, {
      fila: pick.fila, idx: pick.idx, ticket: s(r.so_num) || fila,
      nota: notaSesion(s(form.facial), cosm, ctx.now), cosm,
    });
    if (uso.error) return { error: "El ticket se actualizó pero el canje no se marcó: " + s(uso.error) };
  }
  try {
    const { cuadreTrasTicket, reevaluarFlags } = await import("./migo_cuadre_api.ts");
    await cuadreTrasTicket(ctx, actor);
    void reevaluarFlags(ctx, actor).catch(() => { /* no frena la aprobación */ });
  } catch { /* el ticket ya quedó */ }
  try { await logAccion(ctx.db, actor, "APROBAR EDICIÓN", (s(r.so_num) || fila) + " · pedido por " + s(sol?.solicitante) + " · atendió " + cosm); } catch { /* */ }
  return { ok: true, clave: s(r.so_num) || fila, uso, atendido_por: cosm, total: g.total };
}

export async function edicionPendienteDe(ctx: Ctx, clave: string): Promise<Row | null> {
  const sols = await ctx.db.all("solicitudes_cambio").catch(() => [] as Row[]);
  const hay = sols.find((x) => s(x.tabla) === "ticket_detalle" && s(x.fila) === clave && s(x.estado) === "pendiente" && x.prueba !== true);
  if (!hay) return null;
  return resumenSolicitudTicket(hay);
}

/**
 * TK154: «Solicitar cambio» del detalle (líneas/datos inline) y «Eliminar ticket» por solicitud_crear también
 * guardan la propuesta estructurada, así la admin ve exactamente qué cambia. Nunca toca el ticket real.
 */
export async function prepararPropuestaTicket(ctx: Ctx, ses: Ses, fila: string, tipo: string, propuestos: Row, motivo: string): Promise<{ propuestos: Row; antes: Row } | null> {
  const r = await ticketPorClave(ctx, fila);
  if (!r) return null;
  const antes = await snapshotTicket(ctx, ses, r);
  if (tipo === "eliminacion") return { propuestos: { propuesta: propuestaAnulacion(antes, motivo) }, antes };
  const lineas = conservarProrrateo((Array.isArray(propuestos.lineas) ? propuestos.lineas : antes.lineas) as LinProp[], (antes.lineas || []) as Row[]);
  if (Array.isArray(propuestos.lineas)) propuestos = { ...propuestos, lineas };
  const desc = (propuestos.descuento && typeof propuestos.descuento === "object" ? propuestos.descuento : antes.descuento) as Row | undefined;
  const tot = calcTotales(lineas, desc && s(desc.tipo) ? desc : undefined);
  const pagadoAntes = n((antes.totales as Row | undefined)?.pagado);
  tot.pagado = pagadoAntes; tot.saldo = round2(n(tot.total) - pagadoAntes);
  const cabecera: Row[] = [];
  const datos = (propuestos.datos && typeof propuestos.datos === "object" ? propuestos.datos : {}) as Row;
  for (const c of diffCampos((antes.datos || {}) as Row, datos, true)) cabecera.push(c);
  const dd = Array.isArray(propuestos.lineas) ? diffDescuento(antes.descuento, propuestos.descuento) : null;
  if (dd) cabecera.push(dd);
  const ta = (antes.totales || {}) as Row;
  const diff: Row = {
    cabecera,
    lineas: Array.isArray(propuestos.lineas) ? diffLineas((antes.lineas || []) as Row[], lineas as unknown as Row[]) : [],
    totales: {
      antes: { subtotal: n(ta.subtotal), iva: n(ta.iva), total: n(ta.total), pagado: n(ta.pagado), saldo: n(ta.saldo) },
      despues: Array.isArray(propuestos.lineas) ? { subtotal: n(tot.subtotal), iva: n(tot.iva), total: n(tot.total), pagado: n(tot.pagado), saldo: n(tot.saldo) } : { subtotal: n(ta.subtotal), iva: n(ta.iva), total: n(ta.total), pagado: n(ta.pagado), saldo: n(ta.saldo) },
    },
  };
  const despues = { lineas: Array.isArray(propuestos.lineas) ? lineas : null, datos, descuento: propuestos.descuento ?? null, totales: diff.totales && (diff.totales as Row).despues };
  return { propuestos: { ...propuestos, diff, propuesta: propuestaEdicion(antes, despues, diff, motivo) }, antes };
}

extend("tk_edicion_pedir", "any", async (p, ctx, ses) => pedirEdicionTicket(p, ctx, ses));

extend("tk_ediciones_pendientes", "any", async (_p, ctx, ses) => {
  const sols = await ctx.db.all("solicitudes_cambio").catch(() => [] as Row[]);
  const items = sols.filter((r) => s(r.tabla) === "ticket_detalle" && s(r.estado) === "pendiente" && r.prueba !== true)
    .filter((r) => esAdmin(ses.rol) || s(r.solicitante_uid) === ses.uid || s(r.solicitante) === ses.name)
    .map((r) => {
      const rs = resumenSolicitudTicket(r);
      return { id: r.id, clave: r.fila, solicitante: r.solicitante, creado: r.creado, motivo: r.motivo, diff: rs.diff, tipo: rs.tipo, legible: rs.legible, total: rs.total, enlace: r.enlace };
    });
  return { ok: true, items, pendientes: items.length };
});
