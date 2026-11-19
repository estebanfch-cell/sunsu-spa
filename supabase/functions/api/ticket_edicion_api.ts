// TK141: la chica edita un ticket con el formulario que ya conoce; Emilia aprueba.
// El canje de paquete se elige explícitamente (paquete + sesión) y no se marca solo.
import { extend } from "./handlers.ts";
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
import { origConMarca, rechazoSegundaMarca } from "./handlers.ts";

export type LinProp = {
  tipo: string; sku: string; nombre: string; cantidad: number; precio_unit: number;
  descuento_tipo?: string | null; descuento_valor?: number; excluir_comision?: boolean;
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
  };
}

function notaSesion(facial: string, cosm: string, now: Date): string {
  const d = now.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "2-digit", year: "2-digit" });
  return d.replace(/\//g, "/") + " " + (facial || "Facial") + " · " + (cosm || "—");
}

/** Marca exactamente la sesión elegida. No elige «la siguiente libre» por su cuenta. */
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
  const row = rows.find((x) => n(x.sheet_row) === n(opts.fila) || s(x.codigo) === s(opts.fila) || s(x.beta_codigo) === s(opts.fila) || s(x.id) === s(opts.fila)) || null;
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

export async function pedirEdicionTicket(p: Row, ctx: Ctx, ses: Ses): Promise<Row> {
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
  const diff = diffEdicion(antes, form, lineas, tot, comDes);
  const motivo = s(p.motivo).trim() || "Edición del ticket";
  const recBase = {
    solicitante: ses.name, solicitante_uid: ses.uid, creado: ctx.now.toISOString(),
    tabla: "ticket_detalle", fila: clave, tipo: "cambio",
    motivo, estado: "pendiente",
    etiqueta: "Edición de " + clave,
    enlace: "#/m/tickets/t/" + encodeURIComponent(clave),
    propuestos: { edicion_form: true, form, lineas, datos: form.datos || { nombre: form.nombre, apellido: form.apellido, cedula: form.cedula, factura: form.factura, notas: form.notas, recomendaciones: form.recomendaciones, retorno: form.fechaRetorno }, colQ: colQDePick(paqPickDe(form)) || s(form.colQ), facial_hecho: s(form.facial), servicios_adicionales: s(form.extras), paqPick: paqPickDe(form), diff, _via: "edición de ticket" },
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
    return { ok: true, id: hay.id, actualizada: true, diff, clave };
  }
  const id = crypto.randomUUID();
  await ctx.db.write(actorOf(ses), "solicitudes_cambio", "insert", {}, { ...recBase, id });
  try { await logAccion(ctx.db, actorOf(ses), "SOLICITUD EDICIÓN", clave); } catch { /* */ }
  return { ok: true, id, actualizada: false, diff, clave };
}

export async function aplicarEdicionTicket(ctx: Ctx, ses: Ses, fila: string, propuestos: Row, sol?: Row): Promise<Row> {
  const r = await ticketPorClave(ctx, fila);
  if (!r) return { error: "Ticket no encontrado" };
  const form = (propuestos.form && typeof propuestos.form === "object" ? propuestos.form : propuestos) as Row;
  const lineas = (Array.isArray(propuestos.lineas) ? propuestos.lineas : formALineas(form)) as LinProp[];
  const cosm = s(r.atendido_por); // NUNCA el admin que aprueba
  const actor = actorOf(ses);
  const pick = paqPickDe(form) || paqPickDe(propuestos);
  const canjeNuevo = cobroEsCanjePaquete(form) && pick && pick.fila !== "luego" && pick.fila !== "nuevo";
  const canjeAntes = /^SI\b/i.test(s(r.paquete));
  if (canjeAntes && !canjeNuevo) {
    await revertirUsoDeTicket(ctx, actor, s(r.so_num) || fila);
  }
  const g = await guardarTodo(ctx, ses, r, {
    lineas,
    datos: (propuestos.datos && typeof propuestos.datos === "object" ? propuestos.datos : {}) as Row,
    descuento: propuestos.descuento,
    justificacion_descuento: s(form.justificacion_descuento),
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
    await reevaluarFlags(ctx, actor);
  } catch { /* el ticket ya quedó */ }
  try { await logAccion(ctx.db, actor, "APROBAR EDICIÓN", (s(r.so_num) || fila) + " · pedido por " + s(sol?.solicitante) + " · atendió " + cosm); } catch { /* */ }
  return { ok: true, clave: s(r.so_num) || fila, uso, atendido_por: cosm, total: g.total };
}

export async function edicionPendienteDe(ctx: Ctx, clave: string): Promise<Row | null> {
  const sols = await ctx.db.all("solicitudes_cambio").catch(() => [] as Row[]);
  const hay = sols.find((x) => s(x.tabla) === "ticket_detalle" && s(x.fila) === clave && s(x.estado) === "pendiente" && x.prueba !== true);
  if (!hay) return null;
  const prop = (hay.propuestos && typeof hay.propuestos === "object" ? hay.propuestos : {}) as Row;
  return { id: hay.id, solicitante: hay.solicitante, creado: hay.creado, motivo: hay.motivo, diff: prop.diff, form: prop.form, edicion_form: prop.edicion_form === true };
}

extend("tk_edicion_pedir", "any", async (p, ctx, ses) => pedirEdicionTicket(p, ctx, ses));

extend("tk_ediciones_pendientes", "any", async (_p, ctx, ses) => {
  const sols = await ctx.db.all("solicitudes_cambio").catch(() => [] as Row[]);
  const items = sols.filter((r) => s(r.tabla) === "ticket_detalle" && s(r.estado) === "pendiente" && r.prueba !== true)
    .filter((r) => esAdmin(ses.rol) || s(r.solicitante_uid) === ses.uid || s(r.solicitante) === ses.name)
    .map((r) => {
      const prop = (r.propuestos && typeof r.propuestos === "object" ? r.propuestos : {}) as Row;
      return { id: r.id, clave: r.fila, solicitante: r.solicitante, creado: r.creado, motivo: r.motivo, diff: prop.diff, enlace: r.enlace };
    });
  return { ok: true, items, pendientes: items.length };
});
