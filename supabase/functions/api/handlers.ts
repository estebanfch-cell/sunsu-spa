import { bloqueada, ESPERA_MIN, hashPass, igualSeguro, ITER, MAX_INTENTOS, normUsuario } from "./credenciales.ts";
import type { Ctx, Ses } from "./lib.ts";
import { cargarOverride, conPermisosUsuario, gateNivel, redactarFlags } from "./usuario_permisos.ts";
import { acceso, clampPersonal, esAdmin, esPropio, flagsDeRol, gateAccion, lecturaEnVista, matrizDe, modulosVisibles, normalizarRol, redactar } from "./permisos.ts";
import { actorOf, asignarTicketBeta, conTelefono, ensureUsers, espejo, expSesion, guardarArchivo, kvGet, kvSet, loadSes, loadUsuario, logAccion, nextSheet, publico, rowBySheet } from "./lib.ts";
import {
  ADMIN, ALL_ROLES, APP_VERSION, BETA_TABLES, IVA, LEGACY_APPS_SCRIPT_URL,
  PROD_COLS, RECEP, USO_FIELDS, addDays, b, calcularCiclo, cantAmpollas, cicloFin, cicloInicio, ciclosEntre, comisionProductos, comisionRecepcionDia, contarExtras,
  compraParaComision, desglosePaquetesTramo, listaExtrasPagados, marcaDePersona, PCT_COMISION_PRODUCTO, toCosmMark,
  cotCalcular, ecuadorParts, esCanje, esInterno, estadoTicket, facialSku, hashPin, hmUtc, isAdmin, n, newSalt,
  nombreEsAdmin, normCedula, normNombre, normalizarTramos, packSesiones, puedeCotizar, prodCol, productQtys, repartirPagos, rolCalcular, round2,
  s, skuCode, validarBitacora, validarPromo, ymdUtc, codigoPaquete, colTicket, telefonoEc, type Row, type TicketIn, esCancelado, FACIALES_2, FACIALES_3, facialesDeTicket, paquetesDeTicket, pagaComisionFacial, personaEsRecepcionista, comisionPaquetesTramo, siguienteCodigoPaq, tarifaFacial } from "./domain.ts";
import { patchSlotsGC } from "./paquete_venta.ts";
import { backfillSO, backfillSQ, filasSerie, leerSerie, tomarNumero } from "./series.ts";
import { BODEGA_CABINA, BODEGA_CABINA_2, BODEGA_CABINA_3, BODEGA_CASA, BODEGA_VENTA } from "./erp.ts";
import { descontarVentaTicket } from "./compras_flujo.ts";
import { CORTE_MIN, CORTE_VENTA, aperturaVenta, aplicarTrasCorte, despuesDeTicket, type MovCorte } from "./stock_corte.ts";
import { datosGiftConvPaquete, etiquetaGift, familiaDe, infoSaldoGift, montoGcAplicado, notasConvPaqueteGC, saldoGift } from "./ventas.ts";
import { cfgAplicada, reemplazarTramos } from "./comision_cfg.ts";
import { activarPrueba, ocultarPrueba, purgarPrueba } from "./prueba.ts";
import { enPrueba, type Db } from "./db.ts";
import { facturaTxt } from "./ticket_total.ts";
import { cargarAlias } from "./clientes_alias.ts";
import { cedVariantes, consultar, type Filtro } from "./query.ts";
import { preciosDe, tipoDe, utilidadProducto } from "./productos.ts";
import { aplicarSnapsATicket, cargarPreciosOc, snapsPorClave } from "./costos_reales.ts";
import { claveDe } from "./ticket_beta.ts";
import { lineasRecepDe, periodoLabel as periodoRecepLabel, recepcionDeCiclo } from "./comision_recepcion.ts";

const VISTA_MSG = "Estás viendo como otra persona. Sal de la vista para guardar.";

function dbSoloLectura(db: Db): Db {
  return {
    all: (t) => db.all(t),
    prueba: db.prueba,
    write: async () => { throw new Error(VISTA_MSG); },
    rpc: async (name, args) => {
      if (/^next_|erp_tx|purgar|login_pin|hash_pin|pin_/.test(name)) throw new Error(VISTA_MSG);
      return db.rpc(name, args);
    },
  };
}

function previewPedido(p: R): boolean {
  return p.preview === true || p.preview === "true" || p.preview === 1 || !!s(p.preview_uid);
}

type R = Record<string, unknown>;

function hoy(ctx: Ctx) { return ecuadorParts(ctx.now).ymd; }
function deny(ses: Ses | null, roles: string[]): R | null {
  if (!ses) return { error: "Inicia sesión" };
  if (!roles.includes(ses.rol)) return { error: "No tienes permiso" };
  return null;
}
export async function catMap(ctx: Ctx) {
  const rows = await ctx.db.all("catalogo");
  const map = new Map<string, R>();
  for (const r of rows) {
    const code = skuCode(s(r.sku));
    if (!code) continue;
    map.set(code, r);
  }
  return map;
}
function catNombre(map: Map<string, R>, sku: string): string {
  const r = map.get(skuCode(sku));
  return r ? s(r.producto_servicio) : sku;
}
function subtotalDe(map: Map<string, R>, sku: string): number {
  const code = facialSku(sku) || sku;
  const r = map.get(skuCode(code));
  if (!r) return 0;
  const sub = n(r.subtotal);
  if (sub > 0) return sub;
  const tot = n(r.total_con_iva);
  return tot > 0 ? tot / IVA : 0;
}
/** 'SUNSU-01 …' o 'SUNSU-HT-002 …' al inicio del texto, como codDeDH del Apps Script. */
function codAlInicio(txt: string): string | null {
  const m = txt.toUpperCase().match(/^SUNSU-([A-Z]{2,3}-\d+|\d+)/);
  return m ? m[1] : null;
}
function codEnTexto(txt: string): string | null {
  const m = txt.toUpperCase().match(/SUNSU-([A-Z]{2,3}-\d+|\d+)/);
  return m ? m[1] : null;
}
function textoCelda(v: unknown): string {
  const t = s(v);
  if (!t || t.toLowerCase() === "false") return "";
  return t;
}
function enteroHoja(v: unknown): number {
  const x = parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : 0;
}
/** Columna G de la hoja (apellido) si es número; si no, `valor` cuando es un monto y no el texto "Gift Card". */
function montoGift(r: R): number {
  const colG = parseFloat(s(r.apellido_comprador));
  if (colG > 0) return colG;
  const texto = s(r.valor);
  if (/[a-z]/i.test(texto)) return 0;
  const valor = parseFloat(texto);
  return valor > 0 ? valor : 0;
}
function activoCat(v: unknown): boolean {
  return !(v === false || v === "FALSE" || v === "NO" || v === 0 || v === "0");
}
/** Estado de la beta por código (Emilia 17/11): lo que un admin fijó en Productos (beta_activo) manda;
 * si no, erp_productos.activo. Archivado o eliminado = inactivo. Solo códigos que existen en erp_productos. */
async function estadoBeta(ctx: Ctx): Promise<Map<string, { act: boolean; fijado: boolean }>> {
  const out = new Map<string, { act: boolean; fijado: boolean }>();
  let rows: R[] = [];
  try { rows = await ctx.db.all("erp_productos"); } catch { return out; }
  for (const p of rows) {
    const code = skuCode(s(p.sku));
    if (!code) continue;
    const fijado = p.beta_activo === true || p.beta_activo === false;
    const fuera = !!s(p.beta_archivado_at) || !!s(p.beta_eliminado_at);
    out.set(code, { act: (fijado ? p.beta_activo === true : p.activo !== false) && !fuera, fijado: fijado || fuera });
  }
  return out;
}
function activoVenta(est: Map<string, { act: boolean; fijado: boolean }>, sku: string, catActivo: unknown): boolean {
  const e = est.get(skuCode(sku));
  if (!e) return activoCat(catActivo);
  return e.fijado ? e.act : e.act && activoCat(catActivo);
}
/** Descuento por línea del formulario de ticket (orig.desc_lineas): sku, modo $/%, valor y monto con IVA. */
export function descLineas(v: unknown): R[] {
  if (!Array.isArray(v)) return [];
  return (v as R[]).slice(0, 60).map((x) => ({
    sku: s(x.sku).slice(0, 40), nombre: s(x.nombre).slice(0, 120), modo: s(x.modo) === "%" ? "%" : "$",
    valor: Math.max(0, n(x.valor)), bruto: Math.max(0, round2(n(x.bruto))), monto: Math.max(0, round2(n(x.monto))),
    ...(s(x.promo).trim() ? { promo: s(x.promo).trim().slice(0, 120) } : {}),
  })).filter((x) => x.sku && x.monto > 0 && x.monto <= x.bruto + 0.01);
}
async function tickets(ctx: Ctx) {
  return (await ctx.db.all("tickets")).filter((r) => !r.borrado_at);
}
const MESES_ES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_ES = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

async function compraMap(ctx: Ctx, cats: Map<string, R>): Promise<Map<string, number>> {
  const compra = new Map<string, number>();
  for (const [code, r] of cats) compra.set(code, n(r.precio_compra));
  for (const b0 of await ctx.db.all("inventario_base")) {
    const code = skuCode(s(b0.sku));
    const real = n(b0.compra);
    if (code && real > 0) compra.set(code, real);
  }
  return compra;
}
async function citasAcuity(ctx: Ctx, ymd: string): Promise<number> {
  const uid = ctx.env.ACUITY_UID;
  const key = ctx.env.ACUITY_KEY;
  if (!uid || !key) return 0;
  try {
    const res = await ctx.fetchImpl(
      "https://acuityscheduling.com/api/v1/appointments?minDate=" + ymd + "T00:00:00&maxDate=" + ymd + "T23:59:59&max=100",
      { headers: { Authorization: "Basic " + btoa(uid + ":" + key) } },
    );
    const parsed = JSON.parse(await res.text());
    if (!Array.isArray(parsed)) return 0;
    return parsed.filter((a) => a && typeof a === "object" && !(a as R).canceled).length;
  } catch {
    return 0;
  }
}
async function dashboard(ctx: Ctx): Promise<R> {
  const ec = ecuadorParts(ctx.now);
  const rows = [...(await tickets(ctx)).filter((r) => !esCancelado(r))].sort((a, b) => n(a.sheet_row) - n(b.sheet_row));
  const cats = await catMap(ctx);
  const compra = await compraMap(ctx, cats);
  const lunes = addDays(ec.ymd, -((ec.dow + 6) % 7));
  const dias: { k: string; label: string; total: number; tickets: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const k = addDays(lunes, i);
    const day = Number(k.slice(8, 10));
    const dow = new Date(Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, day)).getUTCDay();
    dias.push({ k, label: `${DIAS_ES[dow]} ${day}`, total: 0, tickets: 0 });
  }
  const finMes = new Date(Date.UTC(ec.y, ec.m, 0)).getUTCDate();
  const semanas: { label: string; ini: number; fin: number; total: number }[] = [];
  let cursor = 1;
  let nSem = 1;
  while (cursor <= finMes) {
    const dow = new Date(Date.UTC(ec.y, ec.m - 1, cursor)).getUTCDay();
    let fin = dow === 0 ? cursor : cursor + (7 - dow);
    if (fin > finMes) fin = finMes;
    semanas.push({ label: `Sem ${nSem} (${cursor}–${fin}) (${fin - cursor + 1})`, ini: cursor, fin, total: 0 });
    cursor = fin + 1;
    nSem++;
  }
  const hoyT = {
    tickets: 0, venta: 0, faciales: 0, paquetes: 0, productosN: 0,
    valFac: 0, valPaq: 0, valProd: 0, costoProd: 0, facCanjes: 0,
    extrasN: 0, valExtras: 0, extrasCort: 0, canjes: 0,
    pagos: { efectivo: 0, transferencia: 0, tarjeta: 0, mixto: 0, otros: 0 },
  };
  const topFac = new Map<string, number>();
  const topProd = new Map<string, number>();
  const paqChips: { nombre: string; n: number }[] = [];
  let semTot = 0;
  let mesTot = 0;
  const mesKey = ec.ymd.slice(0, 7);
  for (const t of rows) {
    const k = ymdUtc(t.timestamp);
    if (!k) continue;
    const tot = n(t.estimado);
    if (k.slice(0, 7) === mesKey) {
      mesTot += tot;
      const dia = Number(k.slice(8, 10));
      const sem = semanas.find((w) => dia >= w.ini && dia <= w.fin);
      if (sem) sem.total += tot;
    }
    const enSem = dias.find((d) => d.k === k);
    if (enSem) { enSem.total += tot; enSem.tickets++; semTot += tot; }
    if (k !== ec.ymd) continue;
    hoyT.tickets++;
    hoyT.venta += tot;
    const extras = textoCelda(t.servicios_adicionales);
    if (extras) {
      for (const pieza of extras.split("|")) {
        const p = pieza.trim();
        if (!p) continue;
        const cAmp = cantAmpollas(p);
        hoyT.extrasN += cAmp;
        if (p.toUpperCase().includes("CORTES")) { hoyT.extrasCort += cAmp; continue; }
        const skuEx = codEnTexto(p);
        if (skuEx) hoyT.valExtras += subtotalDe(cats, skuEx) * cAmp;
      }
    }
    const fac = s(t.facial_hecho);
    const aplicaGc = montoGcAplicado(t.gift_card);
    const gcParcial = aplicaGc > 0 && tot > 0 && !s(t.paquete).toUpperCase().startsWith("SI");
    const canje = esCanje(t.paquete, t.gift_card) && !gcParcial;
    if (fac && fac !== "-" && fac !== "—") {
      hoyT.faciales++;
      topFac.set(fac, (topFac.get(fac) || 0) + 1);
      if (canje) hoyT.facCanjes++;
      else if (gcParcial) {
        const cobro = n((t.orig && typeof t.orig === "object" ? (t.orig as R).gc_facial_cobro : 0)) || Math.max(0, tot - aplicaGc);
        hoyT.valFac += round2(cobro / IVA);
      } else if (tot > 0) hoyT.valFac += subtotalDe(cats, codAlInicio(fac) || "");
      else hoyT.facCanjes++;
    }
    const clienta = s(t.nombre);
    for (const pack of [textoCelda(t.compra_pack_3), textoCelda(t.compra_pack_6)]) {
      if (!pack) continue;
      hoyT.paquetes++;
      hoyT.valPaq += subtotalDe(cats, codAlInicio(pack) || "");
      const nom = pack.replace(/^SUNSU-\d+\s*/, "");
      paqChips.push({ nombre: clienta ? nom + " · " + clienta : nom, n: 1 });
    }
    for (const pc of PROD_COLS) {
      const q = parseInt(String(t[pc.col] ?? ""), 10) || 0;
      if (!(q > 0)) continue;
      hoyT.productosN += q;
      hoyT.valProd += q * subtotalDe(cats, pc.sku);
      hoyT.costoProd += q * (compra.get(pc.sku) || 0);
      const nm = catNombre(cats, pc.sku) || pc.sku;
      topProd.set(nm, (topProd.get(nm) || 0) + q);
    }
    if (canje) hoyT.canjes++;
    const pg = repartirPagos(s(t.comp), tot);
    hoyT.pagos.efectivo += pg.efectivo;
    hoyT.pagos.transferencia += pg.transferencia;
    hoyT.pagos.tarjeta += pg.tarjeta;
    hoyT.pagos.mixto += pg.mixto;
    hoyT.pagos.otros += pg.otros;
  }
  const topFacArr = [...topFac.entries()].map(([nombre, nFac]) => ({ nombre, n: nFac })).sort((a, b) => b.n - a.n).slice(0, 6);
  const topProdArr = [...topProd.entries()].map(([nombre, nPr]) => ({ nombre, n: nPr })).sort((a, b) => b.n - a.n).slice(0, 8);
  let gcHoy = 0;
  let gcVal = 0;
  const gcChips: { nombre: string; n: number }[] = [];
  const gcs = [...await ctx.db.all("gift_cards")].sort((a, b) => n(a.sheet_row) - n(b.sheet_row));
  for (const g of gcs) {
    if (g.borrado_at) continue;
    if (!s(g.codigo_gc)) continue;
    if (enteroHoja(g.dia) !== ec.d || enteroHoja(g.mes) !== ec.m) continue;
    const an = enteroHoja(g.ano);
    if (an && an !== ec.y && an !== ec.y % 100) continue;
    gcHoy++;
    const nom = s(g.nombre_comprador) || s(g.cedula_comprador) || "GC " + s(g.codigo_gc);
    const mon = montoGift(g);
    if (mon > 0) gcVal += mon;
    gcChips.push({ nombre: nom + (mon > 0 ? " · $" + mon.toFixed(0) : ""), n: 1 });
  }
  return {
    hoy: {
      tickets: hoyT.tickets,
      venta: round2(hoyT.venta),
      faciales: hoyT.faciales,
      valFac: round2(hoyT.valFac),
      valPaq: round2(hoyT.valPaq),
      valProd: round2(hoyT.valProd),
      costoProd: round2(hoyT.costoProd),
      facCanjes: hoyT.facCanjes,
      extrasN: hoyT.extrasN,
      valExtras: round2(hoyT.valExtras),
      extrasCort: hoyT.extrasCort,
      paquetes: hoyT.paquetes,
      productosN: hoyT.productosN,
      canjes: hoyT.canjes,
      pagos: hoyT.pagos,
      topFac: topFacArr,
      topProd: topProdArr,
    },
    semana: { total: round2(semTot), dias: dias.map((d) => ({ k: d.k, label: d.label, total: round2(d.total), tickets: d.tickets })) },
    mes: {
      total: round2(mesTot),
      nombre: MESES_ES[ec.m] || "",
      semanas: semanas.map((w) => ({ label: w.label, total: round2(w.total) })),
    },
    caja: await saldoCaja(ctx),
    citasHoy: await citasAcuity(ctx, ec.ymd),
    gcHoy, gcVal: round2(gcVal), gcChips, paqChips,
    actualizado: ec.hm,
  };
}

function cuenta(u: R): R {
  return {
    ...u,
    id: u.id ?? u.usuario,
    nombre: s(u.nombre || u.name || u.usuario),
    short: s(u.short || u.nombre || u.name),
    rol: s(u.rol || u.role),
  };
}
function toIn(r: R, cats?: Map<string, R>): TicketIn {
  const pack3 = s(r.compra_pack_3);
  const pack6 = s(r.compra_pack_6);
  return {
    fecha: ymdUtc(r.timestamp), cosm: s(r.atendido_por), cedula: s(r.id_3), facial: s(r.facial_hecho),
    pack3, pack6, extras: s(r.servicios_adicionales),
    exclFacial: b(r.excluir_facial), exclPaquete: b(r.excluir_paquete), exclProducto: b(r.excluir_producto), exclExtras: b(r.excluir_extras),
    productos: productQtys(r),
    netoPack: cats ? subtotalDe(cats, pack3) : undefined,
    netoPack6: cats ? subtotalDe(cats, pack6) : undefined,
  };
}
async function marks(ctx: Ctx) {
  const rows = await ctx.db.all("cosmetologas");
  if (!rows.length) {
    return [
      { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es: true, activa: true, desde: null, hasta: null },
      { id: "daniela", nombre: "Daniela Mora", patron: "daniela%", es: true, activa: true, desde: null, hasta: null },
      { id: "dejaneira", nombre: "Dejaneira Espinoza", patron: "dejaneira%", es: false, activa: false, desde: null, hasta: "2026-09-25" },
      { id: "alejandra", nombre: "Alejandra Rodriguez", patron: "alejandra%", es: false, activa: true, desde: null, hasta: null },
    ];
  }
  return rows.map(toCosmMark);
}
async function adminsDe(ctx: Ctx) {
  const users = await ctx.db.all("usuarios");
  return users.filter((u) => s(u.rol) === "admin" || s(u.rol) === "super_admin").map((u) => ({
    nombre: s(u.nombre), short: s(u.short), id: s(u.id),
  }));
}
export async function cicloDe(ctx: Ctx, fecha?: string) {
  const ec = fecha || hoy(ctx);
  const ciclo = cicloInicio(ec);
  const admins = await adminsDe(ctx);
  const aplicado = await cfgAplicada(ctx.db, ciclo);
  const tramos = aplicado.tramos;
  const cfg = aplicado.cfg;
  const cmap = await catMap(ctx);
  const ovb = await (await import("./ticket_beta.ts")).overlayDe(ctx.db);
  const rowsTk = (await tickets(ctx)).filter((r) => r.timestamp && !esCancelado(r));
  const claveTk = (r: R) => claveDe(r, leerSerie(r, "so_num"));
  try { const { asegurarSnapshots } = await import("./costos_reales.ts"); await asegurarSnapshots(ctx.db, "sistema-tk114", false, rowsTk, claveTk); } catch { /* columnas o tabla aún no aplicadas */ }
  const snaps = await snapsPorClave(ctx.db);
  const tks = rowsTk.map((r) => aplicarSnapsATicket(ovb(r, toIn(r, cmap)), snaps.get(claveTk(r))));
  const ov = await ctx.db.all("ciclo_override");
  const hit = ov.find((r) => s(r.ciclo).slice(0, 10) === ciclo);
  const marcas = await marks(ctx);
  const calc = calcularCiclo(tks, marcas, cfg, ciclo, hit ? n(hit.n_cosmetologas) : null, admins, tramos);
  const lineas = new Map<string, LineasPersona>();
  const finCiclo = cicloFin(ciclo);
  for (const p of calc.personas) {
    const enCiclo = (t: TicketIn) => t.fecha >= ciclo && t.fecha <= finCiclo && t.cosm === p.cosm;
    const propios = tks.filter((t) => enCiclo(t) && !t.exclProducto);
    const items = propios.flatMap((t) => t.productos.map((pr) => {
      if (pr.ventaNeta == null) {
        return { venta: subtotalDe(cmap, pr.sku), compra: compraParaComision(cmap.get(skuCode(pr.sku))), qty: pr.qty, excluido: false, sku: pr.sku };
      }
      const qty = pr.qty || 1;
      const venta = round2(n(pr.ventaNeta) / qty);
      return { venta, compra: round2(n(pr.compraComision) / qty), qty, excluido: false, sku: pr.sku, comisionFija: venta > 0 ? 0 : n(pr.comision) };
    }));
    p.comProductos = comisionProductos(items, cfg.pctProd, cfg.productoSku);
    p.totalProductos = propios.reduce((a, t) => a + t.productos.reduce((b, pr) => b + pr.qty, 0), 0);
    const nombres: string[] = [];
    const facMap = new Map<string, LineaCom>();
    const packsRaw: { sku: string; nombre: string; neto: number; fecha: string; tipo?: string }[] = [];
    for (const t of tks) {
      if (!enCiclo(t)) continue;
      if (!t.exclExtras) {
        for (const nombre of listaExtrasPagados(t.extras)) nombres.push(nombre);
      }
      for (const f of facialesDeTicket(t)) {
        const skuFac = f.sku;
        const overFacial = cfg.facialSku && cfg.facialSku[skuFac] != null ? cfg.facialSku[skuFac] : null;
        if (!(FACIALES_2.includes(skuFac) || FACIALES_3.includes(skuFac) || overFacial != null)) continue;
        const venta = subtotalDe(cmap, skuFac) * f.cantidad;
        const cobra = pagaComisionFacial(marcaDePersona(marcas, t.cosm), t.fecha);
        const com = cobra ? tarifaFacial(skuFac, cfg) * f.cantidad : 0;
        const prev = facMap.get(skuFac) || { sku: skuFac, nombre: catNombre(cmap, skuFac) || skuFac, qty: 0, monto: 0, vendido: 0 };
        prev.qty += f.cantidad;
        prev.monto = round2(prev.monto + com);
        prev.vendido = round2(prev.vendido + venta);
        facMap.set(skuFac, prev);
      }
      if (!t.exclPaquete) {
        for (const pk of paquetesDeTicket(t)) {
          const sku = facialSku(pk.texto) || skuCode(pk.texto) || s(pk.texto);
          packsRaw.push({ sku, nombre: catNombre(cmap, sku) || sku, neto: Number(pk.neto) || 0, fecha: t.fecha, tipo: pk.tipo });
        }
      }
    }
    const productos = cuadrarLineas(agruparProductos(items, cfg.pctProd, cfg.productoSku, (sku) => catNombre(cmap, sku)), p.comProductos);
    const extras = cuadrarLineas(agruparExtras(nombres, cfg.extra), p.comExtras);
    const faciales = cuadrarLineas([...facMap.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)), p.comFaciales);
    const packMap = new Map<string, LineaCom>();
    const esPack = !!(marcaDePersona(marcas, p.cosm)?.es);
    packsRaw.forEach((pk, i) => {
      const monto = esPack ? comisionPaquetesTramo(i + 1, tramos, packsRaw.map((x) => x.neto)).monto - (i ? comisionPaquetesTramo(i, tramos, packsRaw.map((x) => x.neto)).monto : 0) : 0;
      const prev = packMap.get(pk.sku) || { sku: pk.sku, nombre: pk.nombre, qty: 0, monto: 0, vendido: 0 };
      prev.qty += 1;
      prev.monto = round2(prev.monto + monto);
      prev.vendido = round2(prev.vendido + pk.neto);
      packMap.set(pk.sku, prev);
    });
    const paquetes = cuadrarLineas([...packMap.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)), p.comPaquetes);
    lineas.set(p.cosm, {
      productos, extras, faciales, paquetes,
      vendido: {
        faciales: round2(faciales.reduce((a, l) => a + l.vendido, 0)),
        paquetes: round2(paquetes.reduce((a, l) => a + l.vendido, 0)),
        productos: round2(productos.reduce((a, l) => a + l.vendido, 0)),
        extras: round2(extras.reduce((a, l) => a + l.vendido, 0)),
      },
    });
  }
  const rec = await recepcionDeCiclo(ctx, rowsTk, {
    ciclo, fin: finCiclo, cfg,
    vendidoDe: (r) => subtotalDe(cmap, facialSku(r.facial_hecho) || s(r.facial_hecho)),
  });
  const comRecep = rec.total, diasRecep = rec.diasCumplidos, vendidoRecep = rec.vendido;
  const lineasRecep: LineaCom[] = lineasRecepDe(rec);
  const multas = await ctx.db.all("multas_descuentos");
  const ymdHoy = hoy(ctx);
  const hoyPorNombre = new Map<string, ResumenHoy>();
  for (const p of calc.personas) {
    hoyPorNombre.set(p.cosm, armarResumenHoy(tks, p.cosm, ymdHoy, ciclo, finCiclo, marcas, cfg, cmap, tramos, calc.regimen));
  }
  return { calc, comRecep: round2(comRecep), diasRecep, vendidoRecep, lineasRecep, recepcion: rec, multas, ciclo, fin: finCiclo, admins, tramos, lineas, ymdHoy, hoyPorNombre };
}
type LineaCom = { sku: string; nombre: string; qty: number; monto: number; vendido: number };
type LineasPersona = {
  productos: LineaCom[]; extras: LineaCom[]; faciales: LineaCom[]; paquetes: LineaCom[];
  vendido: { faciales: number; paquetes: number; productos: number; extras: number };
};
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function etiquetaDiaRecep(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return `${d} ${MESES_CORTOS[(m || 1) - 1]}`;
}
export type ResumenHoy = {
  fecha: string; faciales: number; paquetes: number; extras: number; productos: number;
  comFaciales: number; comPaquetes: number; comExtras: number; comProductos: number; total: number;
};
function hoyVacio(fecha: string): ResumenHoy {
  return { fecha, faciales: 0, paquetes: 0, extras: 0, productos: 0, comFaciales: 0, comPaquetes: 0, comExtras: 0, comProductos: 0, total: 0 };
}
function cicloLabelDe(ciclo: string, fin: string): string {
  const [, m1, d1] = ciclo.split("-");
  const [, m2, d2] = fin.split("-");
  return `${Number(d1)}/${Number(m1)}–${Number(d2)}/${Number(m2)}`;
}
function pickHoy(pack: Awaited<ReturnType<typeof cicloDe>>, nombre: string): ResumenHoy {
  const ymd = pack.ymdHoy;
  const key = normNombre(nombre);
  const first = key.split(" ")[0] || key;
  for (const [cosm, r] of pack.hoyPorNombre) {
    if (normNombre(cosm) === key || normNombre(cosm).startsWith(first)) return r;
  }
  return hoyVacio(ymd);
}
function armarResumenHoy(
  tks: TicketIn[], cosm: string, ymd: string, ciclo: string, fin: string,
  marcas: Awaited<ReturnType<typeof marks>>, cfg: Parameters<typeof calcularCiclo>[2],
  cmap: Map<string, Row>, tramos: Parameters<typeof comisionPaquetesTramo>[1], regimen: "tramo" | "nivel",
): ResumenHoy {
  const out = hoyVacio(ymd);
  const mark = marcaDePersona(marcas, cosm);
  const dia = tks.filter((t) => t.fecha === ymd && t.cosm === cosm);
  const cobraFacial = (fecha: string) => pagaComisionFacial(mark, fecha);
  for (const t of dia) {
    for (const f of facialesDeTicket(t)) {
      if (!(FACIALES_2.includes(f.sku) || FACIALES_3.includes(f.sku) || (cfg.facialSku && cfg.facialSku[f.sku] != null))) continue;
      out.faciales += f.cantidad;
      if (cobraFacial(t.fecha)) out.comFaciales += tarifaFacial(f.sku, cfg) * f.cantidad;
    }
    if (!t.exclPaquete) out.paquetes += paquetesDeTicket(t).length;
    if (!t.exclExtras) {
      const ex = contarExtras(t.extras);
      const pagados = ex.n - ex.cortesia;
      out.extras += pagados;
      out.comExtras += pagados * cfg.extra;
    }
    if (!t.exclProducto) out.productos += t.productos.reduce((a, pr) => a + (pr.qty || 0), 0);
  }
  const items = dia.filter((t) => !t.exclProducto).flatMap((t) => t.productos.map((pr) => {
    if (pr.ventaNeta == null) {
      return { venta: subtotalDe(cmap, pr.sku), compra: compraParaComision(cmap.get(skuCode(pr.sku))), qty: pr.qty, excluido: false, sku: pr.sku };
    }
    const qty = pr.qty || 1;
    const venta = round2(n(pr.ventaNeta) / qty);
    return { venta, compra: round2(n(pr.compraComision) / qty), qty, excluido: false, sku: pr.sku, comisionFija: venta > 0 ? 0 : n(pr.comision) };
  }));
  out.comProductos = comisionProductos(items, cfg.pctProd, cfg.productoSku);
  const packsRaw: { neto: number; fecha: string }[] = [];
  for (const t of tks) {
    if (t.fecha < ciclo || t.fecha > fin || t.cosm !== cosm || t.exclPaquete) continue;
    for (const pk of paquetesDeTicket(t)) {
      if (pk.tipo === "pack6" && regimen === "nivel") packsRaw.push({ neto: Number(pk.neto) || 0, fecha: t.fecha }, { neto: Number(pk.neto) || 0, fecha: t.fecha });
      else packsRaw.push({ neto: Number(pk.neto) || 0, fecha: t.fecha });
    }
  }
  const esPack = !!(mark && mark.es);
  packsRaw.forEach((pk, i) => {
    if (pk.fecha !== ymd) return;
    const monto = esPack ? comisionPaquetesTramo(i + 1, tramos, packsRaw.map((x) => x.neto)).monto - (i ? comisionPaquetesTramo(i, tramos, packsRaw.map((x) => x.neto)).monto : 0) : 0;
    out.comPaquetes = round2(out.comPaquetes + monto);
  });
  out.comFaciales = round2(out.comFaciales);
  out.comExtras = round2(out.comExtras);
  out.comProductos = round2(out.comProductos);
  out.total = round2(out.comFaciales + out.comPaquetes + out.comExtras + out.comProductos);
  return out;
}
function cuadrarLineas(lineas: LineaCom[], oficial: number): LineaCom[] {
  if (!lineas.length) return lineas;
  const suma = round2(lineas.reduce((a, l) => a + l.monto, 0));
  const diff = round2((oficial || 0) - suma);
  if (Math.abs(diff) < 0.001) return lineas;
  let i = 0;
  lineas.forEach((l, idx) => { if (l.monto >= lineas[i].monto) i = idx; });
  lineas[i] = { ...lineas[i], monto: round2(lineas[i].monto + diff) };
  return lineas;
}
function agruparProductos(
  items: { venta: number; compra: number; qty: number; excluido: boolean; sku?: string }[],
  pct: number, porSku: Parameters<typeof comisionProductos>[2], nombreDe: (sku: string) => string,
): LineaCom[] {
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const sku = skuCode(it.sku || "") || "—";
    const g = groups.get(sku) || [];
    g.push(it);
    groups.set(sku, g);
  }
  return [...groups.entries()].map(([sku, its]) => ({
    sku,
    nombre: nombreDe(sku) || sku,
    qty: its.reduce((a, it) => a + it.qty, 0),
    monto: comisionProductos(its, pct, porSku),
    vendido: round2(its.reduce((a, it) => a + (it.excluido ? 0 : (it.venta || 0) * (it.qty || 0)), 0)),
  })).filter((l) => l.qty > 0).sort((a, b) => a.nombre.localeCompare(b.nombre));
}
function agruparExtras(nombres: string[], tarifa: number): LineaCom[] {
  const map = new Map<string, number>();
  for (const nombre of nombres) map.set(nombre, (map.get(nombre) || 0) + 1);
  return [...map.entries()].map(([nombre, qty]) => ({ sku: "", nombre, qty, monto: round2(qty * tarifa), vendido: 0 })).sort((a, b) => a.nombre.localeCompare(b.nombre));
}
function multasDe(nombre: string, ciclo: string, fin: string, rows: R[]) {
  let mlt = 0, desc = 0;
  const key = normNombre(nombre).split(" ")[0];
  for (const r of rows) {
    if (r.borrado_at) continue;
    const f = ymdUtc(r.fecha);
    if (!f || f < ciclo || f > fin) continue;
    if (!normNombre(r.cosmetologa).includes(key)) continue;
    const tipo = s(r.tipo).toLowerCase();
    if (tipo === "multa") mlt += n(r.monto);
    else if (tipo === "descuento") desc += n(r.monto);
  }
  return { mlt: round2(mlt), desc: round2(desc) };
}
function usosDe(r: R) {
  return USO_FIELDS.map(([u, f]) => ({ usado: b(r[u]) || !!s(r[f]), fecha: s(r[f]) }));
}
function blankDia(v: unknown): boolean {
  if (v == null || v === "" || v === false) return true;
  return Number.isNaN(parseFloat(String(v)));
}

async function cfgMap(ctx: Ctx): Promise<Map<string, string>> {
  const rows = await ctx.db.all("configuracion");
  const m = new Map<string, string>();
  for (const r of rows) {
    const k = s(r.col_1).toUpperCase();
    if (k) m.set(k, s(r.col_2));
    const orig = r.orig;
    if (orig && typeof orig === "object") {
      const o = orig as R;
      const kk = s(o.col_1 || Object.values(o)[0]).toUpperCase();
      if (kk && !m.has(kk)) m.set(kk, s(o.col_2 || Object.values(o)[1]));
    }
  }
  return m;
}

function productosPatch(productos: R | undefined, replace: boolean, prev: R): R {
  const orig: R = { ...(prev.orig && typeof prev.orig === "object" ? prev.orig as R : {}) };
  const patch: R = {};
  const esSkuProd = (k: string) => /^[A-Z]{2,3}-\d+$/.test(skuCode(k));
  if (replace) {
    for (const c of PROD_COLS) {
      patch[c.col] = null;
      delete orig[c.sku];
      delete orig["SUNSU-" + c.sku];
    }
    // TK101: SKUs sin columna de hoja (INV-123 caja de gift card, etc.) viven en orig.
    for (const k of Object.keys(orig)) if (esSkuProd(k)) delete orig[k];
  }
  for (const [sku, qty] of Object.entries(productos || {})) {
    const col = prodCol(String(sku));
    const q = n(qty);
    if (col) {
      patch[col.col] = q > 0 ? (col.typ === "text" ? String(q) : q) : null;
      if (q > 0) orig[col.sku] = q;
      else { delete orig[col.sku]; delete orig["SUNSU-" + col.sku]; }
      continue;
    }
    const code = skuCode(String(sku));
    if (!code || !esSkuProd(code)) continue;
    if (q > 0) orig[code] = q;
    else { delete orig[code]; delete orig["SUNSU-" + code]; }
  }
  patch.orig = orig;
  return patch;
}

async function saldoCaja(ctx: Ctx): Promise<number> {
  const rows = [...await ctx.db.all("caja_chica")].sort((a, b) => n(a.sheet_row) - n(b.sheet_row));
  if (!rows.length) return 0;
  let idxIni = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (s(rows[i].tipo).toUpperCase().includes("SALDO INICIAL")) { idxIni = i; break; }
  }
  let saldo = 0;
  const start = idxIni < 0 ? 0 : idxIni;
  for (let i = start; i < rows.length; i++) {
    if (i === idxIni) saldo = n(rows[i].entrada);
    else saldo = round2(saldo + n(rows[i].entrada) - n(rows[i].salida));
  }
  return round2(saldo);
}
async function appendCaja(ctx: Ctx, ses: Ses, tipo: string, detalle: string, quien: string, entrada: number, salida: number, ref = ""): Promise<number> {
  const saldo = round2(await saldoCaja(ctx) + entrada - salida);
  const sheet_row = await nextSheet(ctx.db, "caja_chica");
  const ec = ecuadorParts(ctx.now);
  const actor = actorOf(ses);
  await ctx.db.write(actor, "caja_chica", "insert", {}, {
    sheet_row, fecha_hora: ec.isoWall, tipo, detalle_justificativo: detalle, quien,
    entrada, salida, saldo, ref, registrado_por: ses.name,
    orig: { tipo, detalle, quien, entrada, salida, saldo, ref },
  });
  return saldo;
}

export async function doLogin(p: R, ctx: Ctx): Promise<R> {
  const pin = s(p.pin);
  if (!pin) return { error: "Falta el PIN" };
  try {
    const via = await ctx.db.rpc("login_pin", { p_pin: pin, p_ip: s(p.ip) }) as R | null;
    if (via && typeof via === "object") {
      if (via.error && !via.ok) return { error: s(via.error) };
      if (via.ok) {
        const u0 = (via.user as R) || via;
        const id0 = s(u0.id || u0.usuario);
        try {
          const app = (await ctx.db.all("app_usuarios")).find((x) => s(x.id) === id0);
          if (app && app.pin_desactivado === true) return { error: "Este PIN ya no está activo. Entra con tu usuario y contraseña." };
        } catch { /* columna nueva */ }
        return abrirSesion(ctx, u0);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/login_pin|PGRST202|schema cache|Could not find the function/i.test(msg)) {
      return { error: "No se pudo verificar el PIN" };
    }
  }
  await ensureUsers(ctx.db, "sistema");
  const users = await ctx.db.all("usuarios");
  let found: R | null = null;
  for (const u of users) {
    if (!u.pin_hash || !u.pin_salt) continue;
    const h = await hashPin(pin, String(u.pin_salt));
    if (h === u.pin_hash) { found = u; break; }
  }
  if (!found) {
    let legacy: R = {};
    try { legacy = await ctx.legacyLogin(pin); } catch { legacy = { error: "legado" }; }
    if (!legacy.ok || !legacy.user) return { error: s(legacy.error) || "PIN incorrecto" };
    const lu = legacy.user as R;
    const id = s(lu.id);
    let u = users.find((x) => x.id === id);
    const salt = newSalt();
    const pin_hash = await hashPin(pin, salt);
    if (!u) {
      await ctx.db.write("login:" + id, "usuarios", "insert", {}, {
        id, nombre: s(lu.name) || id, short: s(lu.short) || id, rol: s(lu.role) || "staff",
        color: s(lu.color) || "#5B7FA6", pin_hash, pin_salt: salt, bloqueado: false, pin_reset: false,
      });
      u = (await ctx.db.all("usuarios")).find((x) => x.id === id)!;
    } else {
      await ctx.db.write("login:" + id, "usuarios", "update", { id }, { pin_hash, pin_salt: salt });
      u = { ...u, pin_hash, pin_salt: salt };
    }
    found = u;
  }
  if (found.pin_desactivado === true) return { error: "Este PIN ya no está activo. Entra con tu usuario y contraseña." };
  if (found.bloqueado === true) return { error: "⚙️ Sistema en actualización — si requieres información adicional, comunícate con el administrador" };
  const token = crypto.randomUUID();
  const exp = expSesion(ctx.now);
  await ctx.db.write(s(found.nombre), "sesiones", "insert", {}, { token, uid: found.id, rol: found.rol, exp });
  await logAccion(ctx.db, s(found.nombre), "LOGIN", s(found.nombre));
  const pub = publico(found);
  pub.role = normalizarRol(s(pub.role));
  const matriz = await matrizDe(conPermisosUsuario(ctx.db, s(pub.role), esAdmin(s(pub.role)) ? null : await cargarOverride(ctx.db, s(found.id))));
  return { ok: true, token, user: pub, modulos: modulosVisibles(s(pub.role), matriz), ver_costos: acceso(s(pub.role), "ver_costos", matriz) === "todos" };
}

/** Login con usuario + contraseña (beta_credenciales). Mismo resultado que el PIN: abre la sesión del usuario. */
export async function doLoginPass(p: R, ctx: Ctx): Promise<R> {
  const usuario = normUsuario(p.usuario), pass = s(p.password);
  if (!usuario || !pass) return { error: "Escribe tu usuario y contraseña" };
  const ip = s(p.ip);
  if (ip) {
    try {
      const desde = new Date(ctx.now.getTime() - ESPERA_MIN * 60000).toISOString();
      const n0 = (await ctx.db.all("login_intentos")).filter((r) => s(r.ip) === ip && s(r.ts) > desde).length;
      if (n0 >= 8) return { error: "Demasiados intentos. Espera 15 minutos." };
    } catch { /* sin tabla de intentos */ }
  }
  const fallo = async (c: R | null): Promise<R> => {
    if (ip) await ctx.db.write("login", "login_intentos", "insert", {}, { ip, ts: ctx.now.toISOString() }).catch(() => null);
    if (c) {
      const intentos = n(c.intentos) + 1;
      await ctx.db.write("login", "beta_credenciales", "update", { usuario_id: s(c.usuario_id) }, {
        intentos, bloqueado_hasta: intentos >= MAX_INTENTOS ? new Date(ctx.now.getTime() + ESPERA_MIN * 60000).toISOString() : null,
      }).catch(() => null);
    }
    return { error: "Usuario o contraseña incorrectos" };
  };
  let creds: R[] = [];
  try { creds = await ctx.db.all("beta_credenciales"); } catch { return { error: "El acceso con usuario todavía no está activo" }; }
  const c = creds.find((x) => normUsuario(x.usuario) === usuario) || null;
  if (!c) { await hashPass(pass, "0".repeat(32), ITER); return fallo(null); }
  if (bloqueada(c, ctx.now)) return { error: "Demasiados intentos. Espera unos minutos." };
  const h = await hashPass(pass, s(c.pass_salt), n(c.iteraciones) || ITER);
  if (!igualSeguro(h, s(c.pass_hash))) return fallo(c);
  const uid = s(c.usuario_id);
  let u: R | undefined;
  try { u = (await ctx.db.all("app_usuarios")).find((x) => s(x.id) === uid); } catch { u = undefined; }
  if (!u) u = (await ctx.db.all("usuarios").catch(() => [] as R[])).find((x) => s(x.id) === uid);
  if (!u || u.activo === false) return { error: "Esa cuenta no está activa" };
  await ctx.db.write("login", "beta_credenciales", "update", { usuario_id: uid }, { intentos: 0, bloqueado_hasta: null }).catch(() => null);
  const out = await abrirSesion(ctx, { id: uid, nombre: s(u.nombre) || s(u.name), short: s(u.short), rol: s(u.rol) || s(u.role), color: s(u.color), bloqueado: u.bloqueado === true, pin_reset: false });
  if (out.ok) {
    out.usuario = usuario;
    out.debe_cambiar = c.debe_cambiar_pass === true;
    if (out.user && typeof out.user === "object") (out.user as R).usuario = usuario;
    await logAccion(ctx.db, s(u.nombre) || s(u.name) || uid, "LOGIN USUARIO", usuario).catch(() => null);
  }
  return out;
}

async function abrirSesion(ctx: Ctx, u: R): Promise<R> {
  const id = s(u.id || u.usuario);
  const nombre = s(u.nombre || u.name || id);
  const rol = normalizarRol(s(u.rol || u.role));
  if (u.bloqueado === true) return { error: "⚙️ Sistema en actualización — si requieres información adicional, comunícate con el administrador" };
  const token = crypto.randomUUID();
  const exp = expSesion(ctx.now);
  await ctx.db.write(nombre, "sesiones", "insert", {}, { token, uid: id, rol, exp });
  await logAccion(ctx.db, nombre, "LOGIN", nombre);
  const matriz = await matrizDe(conPermisosUsuario(ctx.db, rol, esAdmin(rol) ? null : await cargarOverride(ctx.db, id)));
  let esCosm = false;
  try {
    const marks = await ctx.db.all("cosmetologas");
    const m = marks.find((x) => x.id === id || normNombre(s(x.nombre)) === normNombre(nombre));
    esCosm = !!m && m.es_cosmetologa === true;
  } catch { esCosm = false; }
  return {
    ok: true, token,
    user: { id, name: nombre, short: s(u.short) || nombre, role: rol, color: s(u.color), bloqueado: false, pinReset: !!u.pin_reset, es_cosmetologa: esCosm },
    modulos: modulosVisibles(rol, matriz),
    ver_costos: acceso(rol, "ver_costos", matriz) === "todos",
  };
}

export async function crearTicket(p: R, ctx: Ctx, ses: Ses): Promise<R> {
  // Staff Enviar (Agenda o Nuevo ticket) crea el ticket. Si hay factura Migo,
  // se vincula; no se traga el alta dejándola solo «pendiente de aprobar».
  if (s(p.vincular_borrador) && !esAdmin(ses.rol)) {
    const { facturaNorm } = await import("./migo_cuadre.ts");
    const { puedeVerBorrador } = await import("./borradores_asig.ts");
    const fac = facturaNorm(p.vincular_borrador);
    const rows = await ctx.db.all("beta_migo_borradores").catch(() => [] as R[]);
    const b0 = rows.find((x) => s(x.factura) === fac);
    if (!b0) return { error: "No encontré ese borrador" };
    if (!puedeVerBorrador(ses, b0, ecuadorParts(ctx.now).ymd)) return { error: "No tienes permiso" };
  }
  if (!p.ignorar_borrador && !s(p.vincular_borrador)) {
    const { ofrecerBorradorMigo } = await import("./migo_cuadre_api.ts");
    const of = await ofrecerBorradorMigo(ctx, p);
    if (of) {
      return {
        ok: false, requiere: "vincular_borrador", borrador: of,
        error: "Ya hay un borrador de la factura " + s(of.factura) + " para «" + s(of.cliente) + "». Vincúlalo en vez de crear otro ticket.",
      };
    }
  }
  // TK132: ticket desde una factura Migo: la cédula/RUC del RIDE si el formulario no la trajo.
  const facCli = s(p.vincular_borrador) || s(p._factura_cliente);
  if (facCli && !s(p.cedula)) {
    try { const { clienteDeFactura } = await import("./cliente_factura.ts"); const c = await clienteDeFactura(ctx, facCli); if (c && c.cedula) p = { ...p, cedula: c.cedula }; } catch { /* sin datos del RIDE */ }
  }
  const { exigeJustificacionDescuento } = await import("./cuadre_lineas.ts");
  const lineDesc = Array.isArray(p.lineDescuentos) ? p.lineDescuentos as { monto?: unknown; v?: unknown; valor?: unknown }[] : [];
  const montoDesc = lineDesc.reduce((a, x) => a + n(x.monto ?? x.v ?? x.valor), 0) + (typeof p.descuento === "number" ? n(p.descuento) : 0);
  const hayDescLbl = typeof p.descuento === "string" && !!s(p.descuento).trim();
  const errJ = exigeJustificacionDescuento((montoDesc > 0.004 || hayDescLbl) ? Math.max(montoDesc, hayDescLbl ? 1 : 0) : 0, p.justificacion_descuento);
  if (errJ) return { error: errJ };
  const ec = ecuadorParts(ctx.now);
  const ident = await asignarTicketBeta(ctx.db, ctx.now);
  const actorPrev = actorOf(ses);
  if (!previewPedido(p)) {
    try { await backfillSO(ctx.db, actorPrev); } catch { /* vista o sin columna */ }
  }
  const soNum = await tomarNumero(ctx.db, "TK-SO", enPrueba(ctx.db) ? await ctx.db.all("tickets") : await filasSerie(ctx.db), "so_num");
  const notas = s(p.notas) + (p.descuento ? " · 🏷 Descuento: " + s(p.descuento) : "");
  let cosm = s(p.cosmetologa);
  try {
    const { listaStaffActivo, cosmParaAltaTicket } = await import("./tickets_staff.ts");
    let borrador: R | null = null;
    if (s(p.vincular_borrador)) {
      const { facturaNorm } = await import("./migo_cuadre.ts");
      const fac = facturaNorm(p.vincular_borrador);
      const rows = await ctx.db.all("beta_migo_borradores").catch(() => [] as R[]);
      borrador = rows.find((x) => s(x.factura) === fac) || null;
    }
    cosm = cosmParaAltaTicket({
      payload: s(p.cosmetologa),
      sesNombre: actorOf(ses),
      rol: ses.rol,
      elegida: p.cosmetologa_elegida === true || p.cosmetologa_elegida === "true",
      borrador,
      staff: await listaStaffActivo(ctx),
    });
  } catch { /* se usa el payload */ }
  const base: R = {
    sheet_row: null,
    origin: ident.origin,
    beta_num: ident.beta_num,
    timestamp: ec.isoWall,
    atendido_por: cosm,
    id_3: s(p.cedula),
    nombre: s(p.nombre),
    apellido: s(p.apellido),
    estimado: n(p.estimado),
    fecha_retorno: s(p.fechaRetorno),
    recomendaciones: s(p.recomendaciones),
    notas_generales: notas.trim(),
    paquete: s(p.colQ),
    gift_card: s(p.colR),
    venta_gift: s(p.colS),
    facial_hecho: s(p.facial),
    compra_pack_3: s(p.pack3),
    compra_pack_6: s(p.pack6),
    servicios_adicionales: s(p.extras),
    seguimiento: "",
    agendado: false,
    orig: {
      ...(s(p.clienteCodigo) || s(p.clienteKey) ? { cliente_codigo: s(p.clienteCodigo), cliente_key: s(p.clienteKey) } : {}),
      ...(descLineas(p.lineDescuentos).length ? { desc_lineas: descLineas(p.lineDescuentos) } : {}),
      ...(s(p.justificacion_descuento).trim() ? { justificacion_descuento: s(p.justificacion_descuento).trim().slice(0, 400) } : {}),
    },
  };
  const prod = productosPatch((p.productos || {}) as R, false, base);
  Object.assign(base, prod);
  base.estado = estadoTicket({ seguimiento: "", agendado: false, retorno: s(p.fechaRetorno) }, ec.ymd);
  const actor = actorOf(ses);
  const identRef = ident.beta_num;
  let gcAplicada: R | null = null;
  if (s(p.colR)) {
    const { consumirGiftAlCrear } = await import("./ventas_api.ts");
    gcAplicada = await consumirGiftAlCrear(ctx, ses, s(p.colR), identRef, s(p.nombre), n(p.facialPrecio));
    if (gcAplicada && gcAplicada.error && /alcanza|saldo|aplica/i.test(s(gcAplicada.error))) return gcAplicada;
    if (gcAplicada && gcAplicada.ok) {
      (base.orig as R).gc_aplica = gcAplicada.aplicado;
      (base.orig as R).gc_facial_cobro = gcAplicada.facialCobro;
    }
  }
  const fotosWarn: string[] = [];
  for (const [campo, col] of [["fotosAntes", "fotos_antes"], ["fotosDespues", "fotos_despues"]] as const) {
    const arr = Array.isArray(p[campo]) ? p[campo] as unknown[] : [];
    const urls: string[] = [];
    for (const item of arr) {
      const v = s(item);
      if (v.startsWith("http")) urls.push(v);
      else if (v.includes("base64,")) {
        const id = await guardarArchivo(ctx.db, actor, campo, "ticket", v);
        if (id) urls.push(`archivo:${id}`);
        else fotosWarn.push(campo);
      }
    }
    if (urls.length) base[col] = urls.join(" | ");
  }
  (base.orig as R).timestamp = ec.stamp;
  (base.orig as R).beta = true;
  (base.orig as R).so_num = soNum;
  (base.orig as R).creado_por = s(ses && (ses as { name?: string; nombre?: string }).name) || s(ses && (ses as { name?: string; nombre?: string }).nombre) || s(p.cosmetologa) || actor;
  if (ses && (ses as { uid?: string }).uid) (base.orig as R).creado_por_uid = s((ses as { uid?: string }).uid);
  base.so_num = soNum;
  const saved = await ctx.db.write(actor, "tickets", "insert", {}, base);
  const ticket = ident.beta_num;
  let paqueteFila: number | null = null;
  // TK110: la venta de paquete crea su paquete aunque falte la cédula (basta el nombre).
  if ((s(p.pack3) || s(p.pack6)) && (s(p.cedula) || s(p.nombre))) {
    const paqRow = await nextSheet(ctx.db, "paquetes");
    const paqCodigo = siguienteCodigoPaq(await ctx.db.all("paquetes").catch(() => [] as R[]), (ctx.db as { prueba?: boolean }).prueba === true);
    const txt = s(p.pack3) || s(p.pack6);
    const skuM = txt.match(/SUNSU-\d+/);
    const paqSaved = await ctx.db.write(actor, "paquetes", "insert", {}, {
      sheet_row: paqRow, dia: ec.d, mes: ec.m, ano: ec.y, cedula: s(p.cedula),
      nombres: s(p.nombre), apellidos: s(p.apellido), sku: skuM ? skuM[0] : txt, paquete: txt,
      vendido_por: s(p.cosmetologa), notas: "", orig: { ticket, so_num: soNum, ts: ec.isoWall, codigo: paqCodigo }, ...(paqCodigo.startsWith("PQ-") ? { beta_codigo: paqCodigo } : {}),
    });
    // En Modo prueba la fila se guarda con sheet_row negativo: usar la fila REAL guardada,
    // si no la marca de la 1ª sesión apuntaba a otra fila y el paquete quedaba 0/3.
    paqueteFila = paqSaved && paqSaved.sheet_row != null && paqSaved.sheet_row !== "" ? n(paqSaved.sheet_row) : paqRow;
    const slots = ([] as R[]).concat((p.paq2gcSlots3 as R[]) || [], (p.paq2gcSlots6 as R[]) || []).filter((x) => x && x.codigo);
    if (slots.length) {
      await marcarSlotsGC(ctx, actor, paqueteFila, slots);
      await enriquecerGiftsDePaquete(ctx, actor, slots, paqSaved);
    }
  }
  await logAccion(ctx.db, actor, "TICKET", ticket);
  if (facCli && saved) {
    try { const { completarClienteDeFactura } = await import("./cliente_factura.ts"); await completarClienteDeFactura(ctx, ses, facCli, saved, s(p.nombre), s(p.apellido)); } catch { /* el ticket ya quedó */ }
  }
  let inventario = 0;
  try { inventario = await descontarVentaTicket(ctx.db, actor, ticket, base, ctx.now); }
  catch { inventario = 0; }
  const out: R = {
    ok: true, fila: null, ticket, beta_num: ident.beta_num, so_num: soNum, origin: ident.origin, id: saved?.id,
    inventario: inventario || undefined,
    paqueteFila,
    gc: gcAplicada && gcAplicada.ok ? gcAplicada : undefined,
    fotosPendientes: fotosWarn.length ? "La beta guardó el ticket. Alguna foto no cupo (límite 1.5 MB) y no se subió a Drive." : undefined,
  };
  if (s(p.vincular_borrador) && saved) {
    const { vincularBorradorATicket } = await import("./migo_cuadre_api.ts");
    const v = await vincularBorradorATicket(ctx, ses, s(p.vincular_borrador), saved);
    out.vinculado = v;
    // TK96: el ticket nuevo de un borrador lleva las líneas exactas de la factura (total = factura).
    if (v && (v as R).ok) {
      try {
        const { lineasDeFacturaATicket } = await import("./migo_cuadre_api.ts");
        out.lineas_factura = await lineasDeFacturaATicket(ctx, actorOf(ses), s(p.vincular_borrador), { ...saved, clave: s((v as R).clave) });
        const { reevaluarFlags } = await import("./migo_cuadre_api.ts");
        await reevaluarFlags(ctx, actorOf(ses));
      } catch { /* el ticket ya quedó */ }
    }
  }
  // TK141: si la chica eligió paquete + sesión en el formulario, se descarga exactamente esa sesión (no la «siguiente libre»).
  try {
    const pick = p.paqPick && typeof p.paqPick === "object" ? p.paqPick as R : null;
    if (pick && pick.fila && pick.fila !== "luego" && pick.fila !== "nuevo" && (pick.idx != null && pick.idx !== "")) {
      const { aplicarUsoExplicit } = await import("./ticket_edicion_api.ts");
      const cosm = s(base.atendido_por) || actor;
      const facial = s(p.facial);
      const nota = ecuadorParts(ctx.now).ymd.split("-").reverse().map((x, i) => i === 2 ? x.slice(-2) : x).join("/") + " " + (facial || "Facial") + " · " + cosm;
      out.uso_paquete = await aplicarUsoExplicit(ctx, actor, { fila: pick.fila, idx: pick.idx, ticket: soNum || ticket, nota, cosm });
    }
  } catch { /* el ticket ya quedó */ }
  // TK139: «¡plac!» — cuadre al instante y la factura sale de Borradores.
  try {
    const { cuadreTrasTicket } = await import("./migo_cuadre_api.ts");
    out.cuadre = await cuadreTrasTicket(ctx, actor);
  } catch { /* el ticket ya quedó */ }
  return out;
}

async function marcarSlotsGC(ctx: Ctx, actor: string, sheetRow: number, slots: R[]) {
  const row = await rowBySheet(ctx.db, "paquetes", sheetRow);
  if (!row) return;
  const patch = patchSlotsGC(row, slots);
  if (Object.keys(patch).length) await ctx.db.write(actor, "paquetes", "update", { sheet_row: sheetRow }, patch);
}

/** TK149: la gift de una conversión nace con el facial y el valor real del paquete (Reset $95, no $65). */
async function enriquecerGiftsDePaquete(ctx: Ctx, actor: string, slots: R[], pack: R | null) {
  if (!pack || !slots.length) return;
  const cats = await ctx.db.all("catalogo").catch(() => [] as R[]);
  const cards = await ctx.db.all("gift_cards").catch(() => [] as R[]);
  for (const sl of slots) {
    const codigo = s(sl.codigo);
    if (!codigo) continue;
    const row = cards.find((r) => !r.borrado_at && s(r.codigo_gc) === codigo);
    if (!row) continue;
    const d = datosGiftConvPaquete(pack, cats, s(sl.tipo));
    const orig = { ...(row.orig && typeof row.orig === "object" ? row.orig as R : {}), ...d.orig };
    await ctx.db.write(actor, "gift_cards", "update", { sheet_row: row.sheet_row }, {
      notas: d.notas, valor: d.valor, orig,
    });
  }
}

async function dispatch(action: string, p: R, ctx: Ctx): Promise<unknown> {
  if (action === "version" || action === "getVersion") return { version: APP_VERSION };
  if (action === "login") return doLogin(p, ctx);
  if (action === "login_pass") return doLoginPass(p, ctx);
  const ses = ctx.ses !== undefined ? ctx.ses : await loadSes(ctx, p.token);
  const need = (roles: string[]) => deny(ses, roles);
  const A = actorOf(ses, s(p.usuario) || "beta");

  if (action === "usuarioCambiarPin") {
    const uid = s(p.uid);
    const pinNuevo = s(p.pinNuevo);
    const pinActual = s(p.pinActual);
    if (!/^\d{4}$/.test(pinNuevo)) return { error: "La clave nueva debe ser de 4 dígitos" };
    const app = (await ctx.db.all("app_usuarios")).map(cuenta);
    if (app.length) {
      const u = app.find((x) => String(x.id) === uid);
      if (!u) return { error: "Usuario no encontrado" };
      if (u.bloqueado) return { error: "⚙️ Sistema en actualización — si requieres información adicional, comunícate con el administrador" };
      const falta = "No se pudo verificar el PIN. Aplica 0009b_compat_0008.sql.";
      let coincide: unknown;
      let enUso: unknown;
      let hash: unknown;
      try { coincide = await ctx.db.rpc("pin_coincide", { p_id: uid, p_pin: pinActual }); }
      catch { return { error: falta }; }
      if (coincide !== true) return { error: "Clave actual incorrecta" };
      try { enUso = await ctx.db.rpc("pin_en_uso", { p_pin: pinNuevo, p_excepto: uid }); }
      catch { return { error: falta }; }
      if (enUso === true) return { error: "Esa clave ya la usa otro usuario — elige otra" };
      try { hash = await ctx.db.rpc("hash_pin_bcrypt", { p_pin: pinNuevo }); }
      catch { return { error: falta }; }
      if (typeof hash !== "string" || !hash.startsWith("$2")) return { error: falta };
      await ctx.db.write(s(u.nombre), "app_usuarios", "update", { id: u.id }, { pin_hash: hash, pin_reset: false });
      return { ok: true };
    }
    await ensureUsers(ctx.db, "sistema");
    const users = await ctx.db.all("usuarios");
    const u = users.find((x) => x.id === uid);
    if (!u) return { error: "Usuario no encontrado" };
    if (u.bloqueado) return { error: "⚙️ Sistema en actualización — si requieres información adicional, comunícate con el administrador" };
    if (!u.pin_hash || await hashPin(pinActual, s(u.pin_salt)) !== u.pin_hash) return { error: "Clave actual incorrecta" };
    for (const o of users) {
      if (o.id === uid || !o.pin_hash) continue;
      if (await hashPin(pinNuevo, s(o.pin_salt)) === o.pin_hash) return { error: "Esa clave ya la usa otro usuario — elige otra" };
    }
    const salt = newSalt();
    await ctx.db.write(s(u.nombre), "usuarios", "update", { id: uid }, { pin_hash: await hashPin(pinNuevo, salt), pin_salt: salt, pin_reset: false });
    return { ok: true };
  }

  if (action === "getUsuarios") {
    const { nombreMostrar, aliasesDe } = await import("./personas_unir.ts");
    const aliasesU = await aliasesDe(ctx);
    const marcasU = await ctx.db.all("cosmetologas").catch(() => [] as R[]);
    const conMarca = (id: unknown, nombre: unknown, base: R) => {
      const mk = marcasU.find((m) => String(m.id) === String(id) || normNombre(s(m.nombre)) === normNombre(s(nombre)));
      return {
        ...base,
        es_cosmetologa: mk ? mk.es_cosmetologa === true : false,
        comision_faciales: mk ? mk.comision_faciales !== false : true,
        comision_faciales_desde: mk && mk.comision_faciales_desde ? s(mk.comision_faciales_desde).slice(0, 10) : "",
      };
    };
    const app = await ctx.db.all("app_usuarios");
    if (app.length) {
      const incluir = p && (p.incluir_inactivos === true || p.incluir_inactivos === "1");
      return app.filter((raw) => incluir || raw.activo !== false).map((raw) => {
        const u = cuenta(raw);
        const pub = conMarca(u.id, u.nombre, {
          id: u.id, name: u.nombre, short: u.short, role: normalizarRol(s(u.rol)),
          color: u.color, bloqueado: !!u.bloqueado, pinReset: !!u.pin_reset,
          activo: raw.activo !== false,
        });
        return { ...pub, name: nombreMostrar(s(pub.name), aliasesU) };
      });
    }
    await ensureUsers(ctx.db, "sistema");
    return (await ctx.db.all("usuarios")).map((u) => {
      const pub = conMarca(u.id, u.nombre, publico(u));
      return { ...pub, name: nombreMostrar(s(pub.name), aliasesU) };
    });
  }
  if (action === "usuarioBloqueado") {
    const app = (await ctx.db.all("app_usuarios")).map(cuenta);
    const rows = app.length ? app : await ctx.db.all("usuarios");
    const u = rows.find((x) => String(x.id) === s(p.uid));
    return { bloqueado: !u || !!u.bloqueado };
  }
  if (action === "usuariosFull") {
    const d = need(["admin_master", "super_admin"]); if (d) return d;
    const app = await ctx.db.all("app_usuarios");
    const rows = app.length ? app.map(cuenta) : await ctx.db.all("usuarios");
    return { ok: true, users: rows.map((u) => ({ ...publico(u), pin: u.pin_hash ? "••••" : "" })) };
  }
  if (action === "usuarioPinReset" || action === "usuarioBloquear" || action === "saveUsuarios") {
    const d = need(action === "saveUsuarios" ? ["admin_master", "super_admin"] : ADMIN); if (d) return d;
    const app = await ctx.db.all("app_usuarios");
    const table = app.length ? "app_usuarios" : "usuarios";
    const prev = app.length ? app.map(cuenta) : await ctx.db.all("usuarios");
    if (action === "usuarioBloquear") {
      if (s(p.uid) === "efch") return { error: "El admin_master no se puede bloquear" };
      const u = prev.find((x) => String(x.id) === s(p.uid));
      if (!u) return { error: "Usuario no encontrado" };
      await ctx.db.write(A, table, "update", { id: u.id }, { bloqueado: !!p.bloqueado });
      if (p.bloqueado) {
        for (const tk of await ctx.db.all("sesiones")) {
          if (String(tk.uid) === String(u.id)) await ctx.db.write(A, "sesiones", "delete", { token: tk.token }, null);
        }
      }
      return { ok: true, uid: u.id, bloqueado: !!p.bloqueado };
    }
    if (action === "usuarioPinReset") {
      const u = prev.find((x) => String(x.id) === s(p.uid));
      if (!u) return { error: "Usuario no encontrado" };
      await ctx.db.write(A, table, "update", { id: u.id }, { pin_reset: !!p.activar });
      return { ok: true, uid: u.id, pinReset: !!p.activar };
    }
    for (const u of (p.users as R[]) || []) {
      const old = prev.find((x) => String(x.id) === s(u.id));
      const row: R = { id: s(u.id), nombre: s(u.name), short: s(u.short), rol: s(u.role) || "staff", color: s(u.color) };
      const pin = s(u.pin);
      if (pin && pin !== "••••") {
        if (!/^\d{4}$/.test(pin)) return { error: "El PIN debe ser de 4 dígitos" };
        let enUso: unknown;
        let hash: unknown;
        try { enUso = await ctx.db.rpc("pin_en_uso", { p_pin: pin, p_excepto: s(u.id) }); }
        catch { return { error: "No se pudo verificar el PIN. Aplica 0009b_compat_0008.sql." }; }
        if (enUso === true) return { error: "Esa clave ya la usa otro usuario — elige otra" };
        try { hash = await ctx.db.rpc("hash_pin_bcrypt", { p_pin: pin }); }
        catch { return { error: "No se pudo guardar el PIN. Aplica 0009b_compat_0008.sql." }; }
        if (typeof hash !== "string" || !hash.startsWith("$2")) return { error: "No se pudo guardar el PIN. Aplica 0009b_compat_0008.sql." };
        row.pin_hash = hash;
        if (!old) row.pin_reset = true;
      }
      if (old) await ctx.db.write(A, table, "update", { id: row.id }, row);
      else await ctx.db.write(A, table, "insert", {}, { ...row, bloqueado: false, pin_reset: row.pin_reset !== false, activo: true });
    }
    return { ok: true };
  }

  const sessionActions = new Set(["version", "getVersion", "login", "login_pass", "logout", "usuarioCambiarPin", "getUsuarios", "usuarioBloqueado", "reset_pedir", "reset_validar", "reset_aplicar"]);
  if (!sessionActions.has(action)) {
    const openReads = new Set(["getCatalogo", "getPromos", "getCodigoGC", "getCodigosGC", "getProdColMap", "getMensajes", "getPlantillaGC", "existeCedula", "getRegistro"]);
    if (!ses && !openReads.has(action)) return { error: "Inicia sesión" };
  }

  if (action === "registrarCliente") return registrarCliente(p, ctx, ses!);
  if (action === "saveRegistroCliente") {
    const d = need(ADMIN); if (d) return d;
    return saveRegistro(p, ctx, ses!);
  }
  if (action === "existeCedula") return existeCedula(p, ctx);
  if (action === "getRegistro") return getRegistro(p, ctx);
  if (action === "getRegistroClientes" || action === "getFichasRegistro" || action === "getAutorizaFotos") return fichas(action, p, ctx, ses);
  if (action === "crearTicket" || action === "") return crearTicket(p, ctx, ses!);

  const fn = FNS[action];
  if (!fn) return { error: "Acción no implementada: " + action, beta: true };
  return fn(p, ctx, ses);
}

export async function handle(action: string, p: R, ctx: Ctx): Promise<unknown> {
  if (action === "logout") {
    const tk = s(p.token);
    if (tk) await ctx.db.write("logout", "sesiones", "delete", { token: tk }, null).catch(() => null);
    return { ok: true };
  }
  let real = action === "login" || action === "login_pass" || action === "version" || action === "getVersion" || action === "logout" || action === "reset_pedir" || action === "reset_validar" || action === "reset_aplicar" ? null : await loadSes(ctx, p.token);
  if (!real) {
    const { MIGO_CRON_ACCIONES, sesionCronMigo } = await import("./migo_cuadre.ts");
    if (MIGO_CRON_ACCIONES.has(action)) real = sesionCronMigo(p, ctx.env);
    if (!real && action === "asis_cierre_automatico") {
      const { sesionCronAsis } = await import("./asistencia_api.ts");
      real = sesionCronAsis(p, ctx.env);
    }
  }
  if (real) await cargarAlias(ctx.db).catch(() => null); // 🔗 clientas unidas (clientes_alias)
  if (action === "ver_como") {
    if (!real || !esAdmin(real.rol)) return { error: "Solo un admin puede ver como otra persona" };
    const view = await loadUsuario(ctx, s(p.uid) || s(p.preview_uid));
    if (!view) return { error: "Esa persona no está en el equipo" };
    if (view.bloqueado) return { error: "Esa cuenta está bloqueada" };
    if (view.uid === real.uid) return { error: "Esa eres tú" };
    await logAccion(ctx.db, actorOf(real), "VER COMO", view.name + " (" + view.uid + ")");
    return { ok: true, preview: true, user: { id: view.uid, name: view.name, short: view.short, role: view.rol } };
  }
  let ses0 = real;
  let db = real?.prueba ? activarPrueba(ctx.db) : ocultarPrueba(ctx.db);
  if (previewPedido(p) && action === "solicitud_crear" && (p.prueba_vista === true || p.prueba_vista === "true")) {
    // Ver como → Modo prueba (TK59): la solicitud queda marcada PRUEBA en la bandeja de esta admin.
    if (!real || !esAdmin(real.rol)) return { error: "Solo un admin puede ver como otra persona" };
    const view = await loadUsuario(ctx, s(p.preview_uid));
    if (!view) return { error: "Esa persona no está en el equipo" };
    const vses = { ...view, token: real.token, prueba: false };
    const vdb = dbSoloLectura(ocultarPrueba(ctx.db));
    const { solicitudPrueba } = await import("./inline_api.ts");
    return await solicitudPrueba(p as R, { ...ctx, db: vdb, ses: vses }, vses, real, ctx.db);
  }
  if (previewPedido(p)) {
    if (!real || !esAdmin(real.rol)) return { error: "Solo un admin puede ver como otra persona" };
    if (!lecturaEnVista(action)) return { error: VISTA_MSG };
    const uid = s(p.preview_uid);
    if (!uid) return { error: "Falta la persona de la vista" };
    const view = await loadUsuario(ctx, uid);
    if (!view) return { error: "Esa persona no está en el equipo" };
    if (view.bloqueado) return { error: "Esa cuenta está bloqueada" };
    ses0 = { ...view, token: real.token, prueba: false };
    db = dbSoloLectura(ocultarPrueba(ctx.db));
    ctx = { ...ctx, db, ses: ses0 };
  }
  // Permisos por usuario (0040): sin fila, todo sigue igual que con el rol.
  const ovUsuario = ses0 && !esAdmin(ses0.rol) ? await cargarOverride(db, ses0.uid) : null;
  if (ovUsuario && ses0) {
    db = conPermisosUsuario(db, ses0.rol, ovUsuario);
    if (ctx.ses) ctx = { ...ctx, db };
    if (ovUsuario.personas && ovUsuario.personas.length) {
      ses0 = { ...ses0, personas: ovUsuario.personas };
      ctx = { ...ctx, ses: ses0 };
    }
  }
  const matriz = await matrizDe(db);
  if (ses0) {
    ses0 = { ...ses0, priv: flagsDeRol(ses0.rol, matriz) };
    ctx = { ...ctx, ses: ses0 };
  }
  const gate = gateAccion(action, ses0, matriz) || (ses0 ? gateNivel(action, ses0.rol, ovUsuario, p as Row) : null);
  if (gate) return gate;
  if (action === "modo_prueba" || action === "prueba_borrar") {
    if (!ses0) return { error: "Inicia sesión" };
    if (!esAdmin(ses0.rol)) return { error: "Solo un admin puede usar la simulación" };
    const actor = actorOf(ses0);
    if (action === "prueba_borrar") return purgarPrueba(ctx.db, actor);
    const on = p.on === true || p.on === "true" || p.on === 1;
    const saved = await ctx.db.write(actor, "sesiones", "update", { token: ses0.token }, { modo_prueba: on });
    if (!saved) return { error: "Sesión no encontrada" };
    if (on && saved.modo_prueba !== true) return { error: "Falta aplicar la migración 0016 antes de usar la simulación" };
    await logAccion(ctx.db, actor, on ? "SIMULACIÓN ON" : "SIMULACIÓN OFF", ses0.name);
    return { ok: true, modo_prueba: on };
  }
  try {
    const out = await dispatch(action, clampPersonal(action, p, ses0, matriz), { ...ctx, db, ses: ses0 });
    const red = redactar(action, out, ses0, matriz);
    return ses0 ? redactarFlags(red, ses0.rol, ovUsuario) : red;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === VISTA_MSG) return { error: VISTA_MSG };
    throw e;
  }
}

async function existeCedula(p: R, ctx: Ctx): Promise<R> {
  const ced = normCedula(p.ced);
  if (!ced) return { existe: false };
  const rows = await ctx.db.all("clientas_registro");
  for (const r of rows) {
    if (r.borrado_at) continue;
    if (normCedula(r.cedula) !== ced) continue;
    if (r.timestamp) return { existe: true, fila: r.sheet_row, nombre: s(r.nombre) };
    return { existe: false, completar: true, fila: r.sheet_row, nombre: s(r.nombre), apellido: s(r.apellido) };
  }
  return { existe: false };
}
async function getRegistro(p: R, ctx: Ctx): Promise<R> {
  const q = s(p.q).toLowerCase();
  const ced = s(p.ced);
  const rows = await ctx.db.all("clientas_registro");
  const data = [];
  for (const r of rows) {
    if (r.borrado_at) continue;
    const c = s(r.cedula).split(".")[0];
    const nom = s(r.nombre), ape = s(r.apellido);
    if (!c && !nom) continue;
    if (ced && c === ced) return { ok: true, data: [{ cedula: c, nombre: nom, apellido: ape }] };
    if (q) {
      const a = (nom + " " + ape).toLowerCase();
      const b2 = (ape + " " + nom).toLowerCase();
      if (a === q || b2 === q || a.includes(q) || b2.includes(q)) {
        data.push({ cedula: c, nombre: nom, apellido: ape });
        if (data.length >= 10) break;
      }
    }
  }
  return { ok: true, data };
}
async function registrarCliente(p: R, ctx: Ctx, ses: Ses): Promise<R> {
  const ced = normCedula(p.cedula);
  const nombre = s(p.nombre);
  if (!ced || !nombre) return { error: "Cédula y nombre son obligatorios" };
  const rows = await ctx.db.all("clientas_registro");
  const ex = rows.find((r) => normCedula(r.cedula) === ced);
  const campos = camposRegistro(p);
  const actor = actorOf(ses);
  if (ex && ex.timestamp && !p.forzar) return { existe: true, yaRegistrada: true, fila: ex.sheet_row };
  if (ex && (!ex.timestamp || p.forzar)) {
    await ctx.db.write(actor, "clientas_registro", "update", { sheet_row: ex.sheet_row }, { ...campos, timestamp: ex.timestamp || ecuadorParts(ctx.now).isoWall, cedula: ced });
    return { ok: true, fila: ex.sheet_row, actualizada: true };
  }
  const sheet_row = await nextSheet(ctx.db, "clientas_registro");
  const ec = ecuadorParts(ctx.now);
  const savedCli = await ctx.db.write(actor, "clientas_registro", "insert", {}, {
    sheet_row, timestamp: ec.isoWall, cedula: ced, ...campos,
    apruebo_consentimiento_individual: "SI — " + `${pad(ec.d)}/${pad(ec.m)}/${ec.y} ${ec.hm}`,
    orig: { cedula: ced, nombre },
  });
  return { ok: true, fila: savedCli?.sheet_row ?? sheet_row };
}
function pad(x: number) { return String(x).padStart(2, "0"); }
function camposRegistro(p: R): R {
  const c = (p.campos as R) || p;
  const out: R = {};
  const map: Record<string, string> = {
    nombre: "nombre", apellido: "apellido", telefono: "telefono", sector: "sector_donde_vive",
    tipoPiel: "tipo_de_piel", estado: "estado_actual", alergias: "alergias", medicacion: "medicacion",
    condiciones: "condiciones_medicas_o_dermatologicas_que_debamos_saber",
    fechaNacimiento: "fecha_de_nacimiento", autorizaFotos: "autoriza_fotos",
  };
  for (const [k, col] of Object.entries(map)) if (c[k] != null) out[col] = s(c[k]);
  if (p.nombre && !out.nombre) out.nombre = s(p.nombre);
  if (p.apellido && !out.apellido) out.apellido = s(p.apellido);
  if (p.telefono && !out.telefono) out.telefono = s(p.telefono);
  return out;
}
async function saveRegistro(p: R, ctx: Ctx, ses: Ses): Promise<R> {
  const row = await rowBySheet(ctx.db, "clientas_registro", n(p.row));
  if (!row) return { error: "Fila inválida" };
  if (s(p.cedula) && normCedula(row.cedula) && normCedula(p.cedula) !== normCedula(row.cedula)) return { error: "La fila no coincide. Refresca la lista." };
  const campos = camposRegistro(p);
  await ctx.db.write(actorOf(ses), "clientas_registro", "update", { sheet_row: row.sheet_row }, campos);
  return { ok: true, escritos: Object.keys(campos).length };
}
function fichaDe(r: R, tel: boolean): R {
  const o: R = {
    row: r.sheet_row, cedula: s(r.cedula).split(".")[0], nombre: s(r.nombre), apellido: s(r.apellido),
    nacimiento: ymdUtc(r.fecha_de_nacimiento), sector: s(r.sector_donde_vive), tipoPiel: s(r.tipo_de_piel),
    estado: s(r.estado_actual), alergias: s(r.alergias), medicacion: s(r.medicacion),
    condiciones: s(r.condiciones_medicas_o_dermatologicas_que_debamos_saber),
    reacciones: s(r.reacciones_previas_a_tratamientos), retinoides: s(r.uso_de_exfoliantes_retintines),
    ciclo: s(r.ciclo_mestrual_si_aplica), extracciones: s(r.deseas_extracciones_de_comedones_o_espinillas_si_es_nec),
    cortesia: s(r.cortesia_complementaria), autorizaFotos: s(r.autoriza_fotos),
  };
  if (tel) o.telefono = telefonoEc(r.telefono);
  return o;
}
async function fichas(action: string, _p: R, ctx: Ctx, ses: Ses | null): Promise<R> {
  // Con «cedulas»/«apellidos» (pantalla de tarjetas) se leen solo esas fichas, no todo el registro.
  const dirigida = Array.isArray(_p.cedulas) || Array.isArray(_p.apellidos);
  const rows = (dirigida ? await registroDe(ctx, _p.cedulas as unknown[] || [], _p.apellidos as unknown[] || []) : await ctx.db.all("clientas_registro")).filter((r) => !r.borrado_at);
  const tel = conTelefono(ses);
  if (action === "getAutorizaFotos") {
    const noAutoriza: R = {}, noAutorizaNom: R = {};
    for (const r of rows) {
      if (s(r.autoriza_fotos).toUpperCase() !== "NO") continue;
      const c = s(r.cedula).split(".")[0];
      const nom = normNombre(s(r.nombre) + " " + s(r.apellido));
      if (c) noAutoriza[c] = true;
      if (nom) noAutorizaNom[nom] = true;
    }
    return { noAutoriza, noAutorizaNom };
  }
  if (action === "getFichasRegistro") {
    const porCedula: R = {}, porNombre: R = {};
    for (const r of rows) {
      const f = fichaDe(r, tel);
      if (!tel) delete f.telefono;
      const c = s(f.cedula);
      const nom = normNombre(s(r.nombre) + " " + s(r.apellido));
      if (c) porCedula[c] = f;
      if (nom) porNombre[nom] = f;
    }
    return { porCedula, porNombre };
  }
  const items = rows.filter((r) => s(r.cedula) || s(r.nombre)).map((r) => fichaDe(r, tel));
  items.sort((a, b) => s(a.nombre).localeCompare(s(b.nombre)));
  return { items, conTel: tel };
}

const FNS: Record<string, (p: R, ctx: Ctx, ses: Ses | null) => Promise<unknown>> = {};

function reg(name: string, roles: string[] | "any" | "public", fn: (p: R, ctx: Ctx, ses: Ses) => Promise<unknown>) {
  FNS[name] = async (p, ctx, ses) => {
    if (roles === "public") return fn(p, ctx, ses as Ses);
    if (roles !== "any") {
      const d = deny(ses, roles);
      if (d) return d;
    }
    if (!ses) return { error: "Inicia sesión" };
    return fn(p, ctx, ses);
  };
}

reg("getCatalogo", "any", async (_p, ctx) => {
  const map = await catMap(ctx);
  const est = await estadoBeta(ctx);
  const bases = await ctx.db.all("inventario_base");
  const compra = new Map(bases.map((b0) => [skuCode(s(b0.sku)), n(b0.compra)]));
  const items = [];
  for (const r of map.values()) {
    const sku = s(r.sku);
    if (!sku) continue;
    const sub = n(r.subtotal), tot = n(r.total_con_iva);
    items.push({
      sku, nombre: s(r.producto_servicio), tipo: s(r.tipo), subtotal: sub,
      total: tot > 0 ? tot : sub, compra: n(r.precio_compra),
      compraReal: compra.get(skuCode(sku)) || 0, com: n(r.comi_producto_30),
      // TK132: comisión de venta por unidad (lo que gana la vendedora). No es un costo: Comisión estimada del ticket
      // la necesita para todos los roles (TK115 quitó «com» a quien no es Super Admin y Productos salía $0).
      comVta: n(r.comi_producto_30), activo: activoVenta(est, sku, r.activo),
    });
  }
  return items;
});
async function preciosOc(ctx: Ctx): Promise<Map<string, { precio: number; fecha: string }>> {
  return cargarPreciosOc(ctx.db);
}
async function asegurarCompra(ctx: Ctx, ses: Ses, preview: boolean) {
  const precios = await preciosOc(ctx);
  if (preview) return precios;
  let bases: R[] = [];
  try { bases = await ctx.db.all("inventario_base"); } catch { return precios; }
  const porSku = new Map(bases.map((b0) => [skuCode(s(b0.sku)), b0]));
  for (const [sku, info] of precios) {
    const base = porSku.get(sku);
    if (base && n(base.compra) > 0) continue;
    try {
      if (!base) {
        await ctx.db.write(actorOf(ses), "inventario_base", "insert", {}, { sku: "SUNSU-" + sku, compra: info.precio, stock_inicial: 0 });
      } else {
        const match = base.id != null && base.id !== "" ? { id: base.id } : base.sheet_row != null && base.sheet_row !== "" ? { sheet_row: base.sheet_row } : { sku: base.sku };
        await ctx.db.write(actorOf(ses), "inventario_base", "update", match, { compra: info.precio });
      }
    } catch { /* vista o columna ausente: el precio igual se muestra */ }
  }
  return precios;
}
reg("getCatalogoTabla", "any", async (p, ctx, ses) => {
  const precios = await asegurarCompra(ctx, ses, previewPedido(p));
  const map = await catMap(ctx);
  const est = await estadoBeta(ctx);
  const bases = await ctx.db.all("inventario_base");
  const compra = new Map(bases.map((b0) => [skuCode(s(b0.sku)), n(b0.compra)]));
  const inv = await FNS.getInventario(p, ctx, ses) as R;
  const ventaDe = new Map(((inv.items as R[]) || []).map((it) => [skuCode(s(it.sku)), it]));
  const stockErp = new Map<string, R>();
  try {
    const prods = await ctx.db.all("erp_productos");
    const porId = new Map(prods.map((pr) => [String(pr.id), skuCode(s(pr.sku))]));
    for (const st of await ctx.db.all("erp_stock")) {
      const code = porId.get(String(st.producto_id));
      if (!code) continue;
      const bag = stockErp.get(code) || {};
      const bodega = String(st.bodega_id);
      const lugar = bodega === BODEGA_VENTA ? "venta" : bodega === BODEGA_CABINA ? "cabina1" : bodega === BODEGA_CABINA_2 ? "cab2" : bodega === BODEGA_CABINA_3 ? "cab3" : bodega === BODEGA_CASA ? "bodega" : "";
      if (lugar) bag[lugar] = round2(n(bag[lugar]) + n(st.cantidad));
      stockErp.set(code, bag);
    }
  } catch { /* sin ERP el stock de venta sale del corte */ }
  const erpPorSku = new Map<string, R>();
  try {
    for (const pr of await ctx.db.all("erp_productos")) {
      const c = skuCode(s(pr.sku));
      if (c) erpPorSku.set(c, pr);
    }
  } catch { /* sin ERP */ }
  const items = [];
  for (const r of map.values()) {
    const sku = s(r.sku);
    const code = skuCode(sku);
    if (!code) continue;
    const orig = r.orig && typeof r.orig === "object" ? r.orig as R : {};
    const sub = n(r.subtotal);
    const tot = n(r.total_con_iva);
    const deHoja = ventaDe.get(code);
    const erp = stockErp.get(code) || {};
    const prc = preciosDe(r, erpPorSku.get(code), n(compra.get(code)) || precios.get(code)?.precio || 0);
    items.push({
      sku, nombre: s(r.producto_servicio), tipo: s(r.tipo),
      marca: s(r.marca) || s(r.proveedor) || s(orig.marca) || s(orig.proveedor),
      proveedor: s(r.proveedor) || s(orig.proveedor),
      activo: activoVenta(est, sku, r.activo), pvp: tot > 0 ? tot : sub, subtotal: sub,
      compra: n(r.precio_compra), compraReal: prc.compraReal,
      compraComision: prc.compraComision,
      comision: prc.comision,
      utilidad: prc.utilidad,
      faltaCosto: prc.faltaCosto,
      margenPct: prc.margenPct,
      stock: deHoja ? n(deHoja.stock) : n(erp.venta),
      lugares: {
        venta: deHoja ? n(deHoja.stock) : n(erp.venta),
        cabina1: n(erp.cabina1), cab2: n(erp.cab2), cab3: n(erp.cab3), bodega: n(erp.bodega),
      },
    });
  }
  items.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
  const esProd = (it: { tipo?: string; categoria?: string; nombre?: string }) => tipoDe({ tipo: it.tipo, categoria: it.categoria, nombre: it.nombre, producto_servicio: it.nombre }, { categoria: it.categoria, nombre: it.nombre }).tipo === "inventariable";
  const sinCosto = items.filter((it) => it.faltaCosto && esProd(it)).length;
  return { ok: true, items, sinCosto, productos: items.filter(esProd).length };
});

reg("getProdColMap", "any", async () => {
  const mapa: R = {};
  PROD_COLS.forEach((c, i) => { mapa["SUNSU-" + c.sku] = 25 + i; mapa[c.sku] = 25 + i; });
  return { mapa };
});
reg("repararColumnasTicket", "any", async () => ({ ok: true, beta: "Las columnas viven en la tabla tickets; no hay que reparar una hoja." }));

reg("getInventario", "any", async (_p, ctx) => {
  const cmap = await catMap(ctx);
  let basesMin: R[] = [];
  try { basesMin = await ctx.db.all("inventario_base"); } catch { basesMin = []; }
  const minBase = new Map(basesMin.map((b0) => [skuCode(s(b0.sku)), n(b0.minimo)]));
  const entradas = await ctx.db.all("inventario_entradas");
  const tks = await tickets(ctx);
  let cortes: R[] = [];
  try { cortes = await ctx.db.all("inventario_corte"); } catch { cortes = []; }
  const deHoja = cortes.filter((r) => s(r.lugar).toUpperCase() === "VENTA" && s(r.fecha).slice(0, 10) === "2026-10-24");
  const dbMap = new Map(deHoja.map((r) => [skuCode(s(r.sku)), n(r.cantidad)]));
  const usarDb = deHoja.length > 0;
  const ventas = new Map<string, number>();
  for (const t of tks) {
    if (!despuesDeTicket(t.timestamp)) continue;
    for (const pr of productQtys(t)) {
      const code = skuCode(pr.sku);
      ventas.set(code, (ventas.get(code) || 0) + pr.qty);
    }
  }
  const ent = new Map<string, number>();
  for (const e of entradas) {
    if (s(e.notas).toUpperCase().includes("COMPRA DIRECTA")) continue;
    const cuando = e.fecha || e.created_at || e.timestamp;
    if (!despuesDeTicket(cuando)) continue;
    const rec = e.cant_recibida_llenar_aqui;
    if (rec == null || rec === "") continue;
    const code = skuCode(s(e.sku));
    ent.set(code, (ent.get(code) || 0) + n(rec));
  }
  const codes = new Set<string>(usarDb ? [...dbMap.keys()] : Object.keys(CORTE_VENTA));
  for (const code of cmap.keys()) if (/^[A-Z]{2,3}-\d+/.test(code)) codes.add(code);
  const items = [];
  const allSkus: string[] = [];
  const frenados: string[] = [];
  for (const code of codes) {
    const r = cmap.get(code);
    const sku = r && s(r.sku).startsWith("SUNSU-") ? s(r.sku) : "SUNSU-" + code;
    const apertura = usarDb ? (dbMap.get(code) ?? 0) : aperturaVenta(code);
    const movs: MovCorte[] = [];
    if (ent.get(code)) movs.push({ delta: ent.get(code) || 0, tipo: "recepcion" });
    if (ventas.get(code)) movs.push({ delta: -(ventas.get(code) || 0), tipo: "venta" });
    const applied = aplicarTrasCorte(apertura, movs);
    const deBase = minBase.get(code) || 0;
    const minimo = deBase > 0 ? deBase : (n(r?.minimo) || CORTE_MIN[code] || 0);
    const alerta = applied.frenado ? "BAJO CERO" : applied.saldo < 0 ? "LA HOJA" : applied.saldo <= 0 ? "SIN STOCK" : applied.saldo <= minimo ? "STOCK BAJO" : "OK";
    if (applied.frenado) frenados.push(sku);
    allSkus.push(sku);
    items.push({
      sku, nombre: r ? s(r.producto_servicio) : code, stock: applied.saldo, crudo: applied.crudo,
      apertura, minimo, alerta, frenado: applied.frenado, hojaNegativa: apertura < 0,
      lugares: { venta: applied.saldo, cabina1: 0, cab2: 0, cab3: 0, casa: 0 },
    });
  }
  items.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
  const fis = await ctx.db.all("inventario_fisico");
  let ultimoFisico = "";
  for (const f of fis) if (s(f.fecha) > ultimoFisico) ultimoFisico = s(f.fecha);
  return {
    items, allSkus, ultimoFisico, frenados, corte: "2026-10-24",
    nota: "Venta es la columna F de la hoja al 2026-10-24 08:40. Lo vendido antes ya está dentro de ese corte. Cabina 1, Cabina 2, Cabina 3 y Casa no traen saldo retail en esa hoja.",
  };
});

export function itemHistorial(r: R, map: Map<string, R>, ec: string, telOk: boolean, porCed: Map<string, string>): R {
    const prods = productQtys(r).map((pr) => (catNombre(map, pr.sku) || pr.sku) + " ×" + pr.qty);
    const item: R = {
      fecha: ymdUtc(r.timestamp), hora: hmUtc(r.timestamp), tkRow: r.sheet_row, so_num: leerSerie(r, "so_num"),
      cosmetologa: s(r.atendido_por), cedula: s(r.id_3), nombre: s(r.nombre), apellido: s(r.apellido),
      estimado: s(r.estimado), facial: s(r.facial_hecho), pack3: s(r.compra_pack_3), pack6: s(r.compra_pack_6),
      extras: s(r.servicios_adicionales), colQ: s(r.paquete), colR: s(r.gift_card), colS: s(r.venta_gift),
      recomendaciones: s(r.recomendaciones), notas: s(r.notas_generales), retorno: s(r.fecha_retorno).slice(0, 10),
      productos: prods, exclFacial: b(r.excluir_facial), exclPaquete: b(r.excluir_paquete),
      exclProducto: b(r.excluir_producto), exclExtras: b(r.excluir_extras),
      comprobante: colTicket(r, "comprobante"), fotos: colTicket(r, "fotos"), fotosAntes: colTicket(r, "fotos_antes"), fotosDespues: colTicket(r, "fotos_despues"),
      estado: estadoTicket({ seguimiento: s(r.seguimiento), agendado: b(r.agendado), retorno: s(r.fecha_retorno) }, ec),
      estado_doc: ((r.orig && typeof r.orig === "object" && (r.orig as R).anulado === true) || (b(r.fac) && b(r.cob))) ? "cerrado" : "abierto",
      factura: facturaTxt(r.fac_7),
      fac: b(r.fac), cob: b(r.cob), anulado: !!(r.orig && typeof r.orig === "object" && (r.orig as R).anulado === true), sheetId: r.id ?? null,
      saldo: ((r.orig && typeof r.orig === "object" && (r.orig as R).anulado === true) || (b(r.fac) && b(r.cob))) ? 0 : n(r.estimado),
    };
    const telFicha = porCed.get(normCedula(r.id_3)) || "";
    item.tiene_tel = !!telefonoEc(telFicha) || /\d{7,}/.test(String(telFicha).replace(/\D/g, ""));
    if (telOk) item.telefono = telefonoEc(telFicha);
    else item.telefono = "";
    return item;
  }

reg("getHistorial", "any", async (p, ctx, ses) => {
  if (!previewPedido(p)) {
    try { await backfillSO(ctx.db, actorOf(ses)); } catch { /* la lista igual sale sin número */ }
  }
  const map = await catMap(ctx);
  const telOk = conTelefono(ses);
  const regs = await ctx.db.all("clientas_registro");
  const porCed = new Map<string, string>();
  try {
    for (const r of await ctx.db.all("beta_clientes")) {
      const k = normCedula(r.cedula) || normCedula((r.datos as R | undefined)?.cedula);
      const tel = s(r.telefono) || s((r.datos as R | undefined)?.telefono);
      if (k && tel) porCed.set(k, tel);
    }
  } catch { /* sin beta */ }
  for (const r of regs) if (s(r.telefono)) porCed.set(normCedula(r.cedula), s(r.telefono));
  const matriz = await matrizDe(ctx.db);
  const todos = esAdmin(ses.rol) || acceso(ses.rol, "tickets", matriz) === "todos";
  const rows = (await tickets(ctx)).filter((r) => r.timestamp).filter((r) => todos || esPropio(s(r.atendido_por), ses));
  rows.sort((a, b) => ymdUtc(a.timestamp).localeCompare(ymdUtc(b.timestamp)) || hmUtc(a.timestamp).localeCompare(hmUtc(b.timestamp)) || n(a.sheet_row) - n(b.sheet_row));
  const ec = hoy(ctx);
  const out = rows.map((r) => itemHistorial(r, map, ec, telOk, porCed));
  out.reverse();
  return out;
});

reg("getTicketsDia", "any", async (p, ctx) => {
  const off = n(p.offset);
  const target = addDays(hoy(ctx), -off);
  const [y, m, d] = target.split("-").map(Number);
  const ticketsOut = [];
  for (const r of await tickets(ctx)) {
    if (ymdUtc(r.timestamp) !== target) continue;
    const fac = b(r.fac), cob = b(r.cob), numFac = facturaTxt(r.fac_7);
    if (fac && cob && numFac) continue;
    ticketsOut.push({
      fila: r.sheet_row, timestamp: s(r.timestamp), cosm: s(r.atendido_por), cedula: s(r.id_3),
      nombre: s(r.nombre), apellido: s(r.apellido), facial: s(r.facial_hecho), estimado: n(r.estimado),
      fac, numFac, cob, comp: s(r.comp),
    });
  }
  return { tickets: ticketsOut, dia: d, mes: m, ano: y };
});

function matchTicket(row: R): R {
  if (row.id != null && row.id !== "") return { id: row.id };
  if (row.sheet_row != null && row.sheet_row !== "") return { sheet_row: row.sheet_row };
  if (s(row.beta_num)) return { beta_num: s(row.beta_num) };
  return { so_num: leerSerie(row, "so_num") };
}
async function ticketPorClave(ctx: Ctx, clave: string): Promise<R | null> {
  const k = s(clave);
  if (!k) return null;
  const rows = await tickets(ctx);
  return rows.find((r) => leerSerie(r, "so_num") === k || s(r.beta_num) === k || s(r.so_num) === k || (n(k) > 0 && n(r.sheet_row) === n(k))) || null;
}
function filaTicket(r: R) {
  const orig = r.orig && typeof r.orig === "object" ? r.orig as R : {};
  const estimado = n(r.estimado);
  const sub = n(orig.subtotal) > 0 ? n(orig.subtotal) : round2(estimado / IVA);
  const cerrado = orig.anulado === true || (b(r.fac) && b(r.cob));
  return {
    clave: leerSerie(r, "so_num") || s(r.beta_num) || s(r.sheet_row),
    so_num: leerSerie(r, "so_num"), beta_num: s(r.beta_num), sheet_row: r.sheet_row ?? null,
    fecha: ymdUtc(r.timestamp), hora: hmUtc(r.timestamp), cosmetologa: s(r.atendido_por),
    cedula: s(r.id_3), nombre: s(r.nombre), apellido: s(r.apellido),
    facial: s(r.facial_hecho), pack3: s(r.compra_pack_3), pack6: s(r.compra_pack_6),
    extras: s(r.servicios_adicionales), notas: s(r.notas_generales), recomendaciones: s(r.recomendaciones),
    subtotal: sub, iva: round2(sub * 0.15), estimado, total: estimado,
    estado: cerrado ? "cerrado" : "abierto", factura: facturaTxt(r.fac_7), saldo: cerrado ? 0 : estimado,
  };
}
reg("getTicketsLista", "any", async (p, ctx, ses) => {
  if (!previewPedido(p)) {
    try { await backfillSO(ctx.db, actorOf(ses)); } catch { /* la lista igual muestra beta_num */ }
  }
  const matriz = await matrizDe(ctx.db);
  const propio = acceso(ses.rol, "tickets", matriz) === "propio";
  const items = (await tickets(ctx))
    .filter((r) => r.timestamp || leerSerie(r, "so_num") || s(r.beta_num))
    .filter((r) => !propio || esPropio(s(r.atendido_por), ses))
    .map(filaTicket)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (a.hora < b.hora ? 1 : -1)));
  // TK94 (Emilia 18/11): los borradores Migo no van en Tickets (Ventas › Facturas borrador).
  return { ok: true, items };
});
reg("getTicket", "any", async (p, ctx, ses) => {
  const row = await ticketPorClave(ctx, s(p.clave || p.so_num || p.beta_num || p.tkRow));
  if (!row) return { error: "Ticket no encontrado" };
  const matriz = await matrizDe(ctx.db);
  if (acceso(ses.rol, "tickets", matriz) === "propio" && !esPropio(s(row.atendido_por), ses)) return { error: "No tienes permiso" };
  return { ok: true, item: filaTicket(row) };
});
reg("editarTicket", "any", async (p, ctx, ses) => {
  const row = await ticketPorClave(ctx, s(p.clave || p.so_num || p.beta_num || p.tkRow)) || await rowBySheet(ctx.db, "tickets", n(p.tkRow));
  if (!row) return { error: "Fila inválida" };
  const orig = { ...(row.orig && typeof row.orig === "object" ? row.orig as R : {}) };
  const patch: R = {
    id_3: s(p.cedula), nombre: s(p.nombre), apellido: s(p.apellido), facial_hecho: s(p.facial),
    compra_pack_3: s(p.pack3), compra_pack_6: s(p.pack6), servicios_adicionales: s(p.extras),
    estimado: n(p.estimado), fecha_retorno: s(p.fechaRetorno), gift_card: s(p.colR), venta_gift: s(p.colS),
    recomendaciones: s(p.recomendaciones), notas_generales: s(p.notas),
  };
  if (p.subtotal != null && p.subtotal !== "") {
    const sub = round2(n(p.subtotal));
    patch.estimado = round2(sub * IVA);
    orig.subtotal = sub;
    orig.iva = round2(sub * 0.15);
  }
  if (p.colQ != null) patch.paquete = s(p.colQ);
  if (p.cobro != null) patch.comp = s(p.cobro);
  if (p.productos && typeof p.productos === "object") {
    const prod = productosPatch(p.productos as R, true, row);
    Object.assign(patch, prod);
    Object.assign(orig, prod.orig as R, { subtotal: orig.subtotal, iva: orig.iva });
  }
  patch.orig = orig;
  patch.estado = estadoTicket({ seguimiento: s(row.seguimiento), agendado: b(row.agendado), retorno: s(patch.fecha_retorno) }, hoy(ctx));
  const saved = await ctx.db.write(actorOf(ses), "tickets", "update", matchTicket(row), patch);
  if (!saved) return { error: "No se pudo guardar el ticket" };
  await logAccion(ctx.db, actorOf(ses), "EDITAR TICKET", leerSerie(row, "so_num") || s(row.beta_num) || ("fila " + row.sheet_row));
  let cuadre: R | undefined;
  try {
    const { cuadreTrasTicket } = await import("./migo_cuadre_api.ts");
    cuadre = await cuadreTrasTicket(ctx, actorOf(ses));
  } catch { /* el ticket ya quedó */ }
  return { ok: true, estimado: patch.estimado, iva: orig.iva, so_num: leerSerie(row, "so_num"), cuadre };
});

reg("eliminarTicket", "any", async (p, ctx, ses) => {
  const row = await rowBySheet(ctx.db, "tickets", n(p.tkRow));
  if (!row) return { error: "Fila inválida" };
  if (s(p.nombre) && normNombre(row.nombre) !== normNombre(p.nombre)) return { error: "El nombre no coincide. Refresca." };
  if (s(p.apellido) && normNombre(row.apellido) !== normNombre(p.apellido)) return { error: "El apellido no coincide. Refresca." };
  const { borrarTicketSuave } = await import("./inline_api.ts");
  return borrarTicketSuave(ctx, ses, row);
});

reg("excluirComision", "any", async (p, ctx, ses) => {
  const tipo = s(p.tipo);
  const col = ({ facial: "excluir_facial", paquete: "excluir_paquete", producto: "excluir_producto", extras: "excluir_extras" } as R)[tipo];
  if (!col) return { error: "Parámetros inválidos" };
  const row = await rowBySheet(ctx.db, "tickets", n(p.tkRow));
  if (!row) return { error: "Fila inválida" };
  const valor = p.valor === true || p.valor === "true";
  await ctx.db.write(actorOf(ses), "tickets", "update", { sheet_row: row.sheet_row }, { [String(col)]: valor });
  return { ok: true };
});

reg("registrarFacturaCobro", "any", async (p, ctx, ses) => facturaCobro(p, ctx, ses, !p.soloCobro || s(p.soloCobro) === "0" ? "ambos" : "cobro"));
reg("registrarFactura", "any", async (p, ctx, ses) => facturaCobro(p, ctx, ses, "fac"));
reg("registrarCobro", "any", async (p, ctx, ses) => facturaCobro(p, ctx, ses, "cobro"));

async function facturaCobro(p: R, ctx: Ctx, ses: Ses, modo: "fac" | "cobro" | "ambos"): Promise<R> {
  const row = await rowBySheet(ctx.db, "tickets", n(p.fila || p.tkRow));
  if (!row) return { error: "Fila inválida" };
  const patch: R = {};
  if (modo !== "cobro") { patch.fac = true; if (s(p.numFac)) patch.fac_7 = s(p.numFac); }
  if (modo !== "fac") { patch.cob = true; if (p.comp != null) patch.comp = s(p.comp); }
  if (s(p.comprobanteUrl)) patch.comprobante = s(p.comprobanteUrl);
  await ctx.db.write(actorOf(ses), "tickets", "update", { sheet_row: row.sheet_row }, patch);
  if (patch.fac_7) {
    const ced = normCedula(row.id_3);
    for (const paq of await ctx.db.all("paquetes")) {
      if (paq.borrado_at) continue;
      if (normCedula(paq.cedula) === ced && !s(paq.factura)) {
        await ctx.db.write(actorOf(ses), "paquetes", "update", { sheet_row: paq.sheet_row }, { factura: patch.fac_7 });
      }
    }
    for (const g of await ctx.db.all("gift_cards")) {
      if (g.borrado_at) continue;
      if (normCedula(g.cedula_comprador) === ced && !s(g.factura) && !blankDia(g.dia)) {
        await ctx.db.write(actorOf(ses), "gift_cards", "update", { sheet_row: g.sheet_row }, { factura: patch.fac_7 });
      }
    }
  }
  return { ok: true };
}

reg("marcarAgendada", "any", async (p, ctx, ses) => {
  const row = await rowBySheet(ctx.db, "tickets", n(p.tkRow));
  if (!row) return { error: "Fila inválida" };
  if (s(p.cedula) && normCedula(row.id_3) && normCedula(p.cedula) !== normCedula(row.id_3)) return { error: "La fila no coincide. Refresca la lista." };
  await ctx.db.write(actorOf(ses), "tickets", "update", { sheet_row: row.sheet_row }, { agendado: true, estado: "✅ Agendada" });
  return { ok: true };
});
reg("marcarAgendadasLote", "any", async (p, ctx, ses) => {
  const filas = Array.isArray(p.filas) ? p.filas as R[] : Array.isArray(p.items) ? p.items as R[] : [];
  let nOk = 0;
  for (const it of filas) {
    const row = await rowBySheet(ctx.db, "tickets", n(it.tkRow || it));
    if (!row) continue;
    await ctx.db.write(actorOf(ses), "tickets", "update", { sheet_row: row.sheet_row }, { agendado: true, estado: "✅ Agendada" });
    nOk++;
  }
  return { ok: true, n: nOk };
});

reg("getCodigoGC", "any", async (p, ctx, ses) => unoGC(p, ctx, ses));
reg("getCodigosGC", "any", async (p, ctx, ses) => {
  const nNeed = Math.max(1, n(p.n) || 1);
  if (ctx.db.prueba) return { codigos: await codigosPruebaGC(ctx, nNeed) };
  const libres = await libresGC(ctx, {}, ses, nNeed);
  if (libres.length < nNeed) return { error: "Solo hay " + libres.length + " código(s) disponibles, se necesitan " + nNeed };
  return { codigos: libres.slice(0, nNeed) };
});
// Códigos GC: YY-NNN con secuencia POR AÑO. Se usan primero los códigos en blanco del año en curso
// (pre-cargados en la hoja); si no quedan, se crea el siguiente (p. ej. al cambiar de año: 27-001).
// Los de años anteriores que quedaron en blanco ya no se reparten.
export function siguienteCodigoGC(codigos: string[], yy: string): string {
  let max = 0;
  for (const c of codigos) {
    const m = /^(\d{2})-(\d+)$/.exec(s(c).trim());
    if (m && m[1] === yy) max = Math.max(max, Number(m[2]));
  }
  return yy + "-" + String(max + 1).padStart(3, "0");
}
async function libresGC(ctx: Ctx, exclude: R, ses?: Ses, nNeed = 1) {
  const yy = String(ecuadorParts(ctx.now).y).slice(-2);
  const todas = await ctx.db.all("gift_cards");
  const rows = todas.slice().sort((a, b) => n(a.sheet_row) - n(b.sheet_row));
  const out: R[] = [];
  for (const r of rows) {
    if (exclude[String(r.sheet_row)]) continue;
    if (r.borrado_at) continue;
    if (s(r.origin) === "test") continue;
    if (s(r.codigo_gc).startsWith(yy + "-") && blankDia(r.dia)) out.push({ codigo: s(r.codigo_gc), fila: r.sheet_row });
  }
  if (out.length < nNeed && ses && !ctx.db.prueba) {
    const usados = todas.map((r) => s(r.codigo_gc));
    while (out.length < nNeed) {
      const codigo = siguienteCodigoGC(usados, yy);
      usados.push(codigo);
      const saved = await ctx.db.write(actorOf(ses), "gift_cards", "insert", {}, { sheet_row: 1, codigo_gc: codigo, orig: { creado: "beta", ts: ecuadorParts(ctx.now).isoWall } });
      out.push({ codigo, fila: saved && saved.sheet_row != null ? saved.sheet_row : null });
    }
  }
  return out;
}
// Modo prueba: el código refleja el siguiente código REAL con prefijo TEST- (TEST-26-161 si el
// siguiente blanco real es 26-161), sin consumirlo. Si ese TEST- ya existe, el siguiente (TEST-26-162).
async function codigosPruebaGC(ctx: Ctx, nNeed: number): Promise<R[]> {
  const yy = String(ecuadorParts(ctx.now).y).slice(-2);
  const todas = await ctx.db.all("gift_cards");
  const usadosTest = new Set(todas.filter((r) => s(r.origin) === "test").map((r) => s(r.codigo_gc)));
  const reales = todas.filter((r) => s(r.origin) !== "test" && !r.borrado_at);
  const blancos = reales.filter((r) => s(r.codigo_gc).startsWith(yy + "-") && blankDia(r.dia))
    .map((r) => s(r.codigo_gc)).sort((x, y) => x.localeCompare(y, "es", { numeric: true }));
  const out: R[] = [];
  const candidatos = blancos.slice();
  const todosCod = reales.map((r) => s(r.codigo_gc));
  while (out.length < nNeed) {
    let c = candidatos.shift();
    if (!c) { c = siguienteCodigoGC(todosCod, yy); todosCod.push(c); }
    if (usadosTest.has("TEST-" + c)) continue;
    usadosTest.add("TEST-" + c);
    out.push({ codigo: "TEST-" + c, fila: "prueba" });
  }
  return out;
}
async function unoGC(p: R, ctx: Ctx, ses?: Ses) {
  if (ctx.db.prueba) return (await codigosPruebaGC(ctx, 1))[0];
  const exclude: R = {};
  for (const f of s(p.excludeFilas).split(",")) if (n(f) !== 0) exclude[String(n(f))] = true;
  const libres = await libresGC(ctx, exclude, ses);
  if (!libres.length) return { error: "Sin códigos GC disponibles" };
  return libres[0];
}

function notasYValorConv(p: R): { notas: string; valor: string; orig: R } {
  const notas0 = s(p.notas);
  const valor0 = s(p.valor || p.monto);
  const pack = s(p.pack || p.pack_codigo || p.pack_sku);
  const facial = s(p.facial);
  const precio = n(p.precio || p.facial_precio) || (valor0 && !/[a-z]/i.test(valor0) ? n(valor0) : 0);
  const esConv = /conv\.\s*paquete/i.test(notas0) || !!pack || !!s(p.pack_sku);
  if (!esConv && !facial) return { notas: notas0, valor: valor0, orig: {} };
  if (!facial && !precio && !pack) return { notas: notas0, valor: valor0, orig: {} };
  const notas = (facial || precio || pack)
    ? notasConvPaqueteGC({ facial, precio, pack, tipo: s(p.tipo) || notas0 })
    : notas0;
  const valor = facial && precio ? facial + " $" + (precio % 1 ? String(precio) : String(precio)) : (valor0 || facial);
  const orig: R = {};
  if (pack) orig.pack = pack;
  if (s(p.pack_sku)) orig.pack_sku = s(p.pack_sku);
  if (facial) orig.facial = facial;
  if (precio) orig.facial_precio = precio;
  return { notas, valor, orig };
}

reg("registrarGC", "any", async (p, ctx, ses) => {
  if (ctx.db.prueba) {
    // GC de prueba: fila propia origin=test con código TEST-…, visible en la lista con 🧪
    let codigo = s(p.codigo);
    if (!codigo.startsWith("TEST-")) codigo = s((await codigosPruebaGC(ctx, 1))[0].codigo);
    const ec0 = ecuadorParts(ctx.now);
    const convT = notasYValorConv(p);
    const saved = await ctx.db.write(actorOf(ses), "gift_cards", "insert", {}, {
      sheet_row: 1, codigo_gc: codigo, dia: ec0.d, mes: ec0.m, ano: ec0.y, cedula_comprador: s(p.cedula), nombre_comprador: s(p.nombre),
      apellido_comprador: s(p.apellido), sku: "SUNSU-35", notas: convT.notas, valor: convT.valor || "Gift Card", orig: { prueba: true, ts: ec0.isoWall, ...convT.orig },
    });
    return { ok: true, codigo, fila: saved ? saved.sheet_row : null, prueba: true };
  }
  const fila = n(p.fila);
  const row = fila ? await rowBySheet(ctx.db, "gift_cards", fila) : (await ctx.db.all("gift_cards")).find((r) => !r.borrado_at && s(r.codigo_gc) === s(p.codigo));
  if (!row || row.borrado_at) return { error: "Código no encontrado" };
  if (!blankDia(row.dia)) return { error: "Ese código ya está vendido" };
  const ec = ecuadorParts(ctx.now);
  const conv = notasYValorConv(p);
  await ctx.db.write(actorOf(ses), "gift_cards", "update", { sheet_row: row.sheet_row }, {
    dia: ec.d, mes: ec.m, ano: ec.y, cedula_comprador: s(p.cedula), nombre_comprador: s(p.nombre),
    apellido_comprador: s(p.apellido), sku: "SUNSU-35", notas: conv.notas, valor: conv.valor,
    orig: { ...(row.orig && typeof row.orig === "object" ? row.orig as R : {}), ...conv.orig },
  });
  return { ok: true, codigo: s(row.codigo_gc), fila: row.sheet_row };
});
reg("buscarGiftCards", "any", async (p, ctx) => {
  const q = s(p.q).toLowerCase();
  if (!q) return { resultados: [] };
  const todas = q === "*";
  const resultados = [];
  const cats = await ctx.db.all("catalogo").catch(() => [] as R[]);
  const packs = await ctx.db.all("paquetes").catch(() => [] as R[]);
  for (const r of await ctx.db.all("gift_cards")) {
    const codigo = s(r.codigo_gc);
    if (!codigo) continue;
    if (r.borrado_at) continue;
    const nom = s(r.nombre_comprador), ape = s(r.apellido_comprador);
    const blob = [codigo, s(r.cedula_comprador), nom, ape, nom + " " + ape, s(r.usado_por), s(r.notas)].join(" ").toLowerCase();
    if (!todas && !blob.includes(q)) continue;
    const info = infoSaldoGift(r, cats, packs);
    resultados.push({
      fila: r.sheet_row, codigo, dia: r.dia, mes: r.mes, ano: r.ano, cedula: s(r.cedula_comprador),
      nombre: nom, apellido: ape, factura: s(r.factura), sku: s(r.sku), valor: s(r.valor),
      usado: b(r.usado), fechaUso: s(r.fecha_uso), usadoPor: s(r.usado_por), notas: s(r.notas),
      saldo: info.saldo, facial: info.facial, saldoOrigen: info.origen,
      etiqueta: etiquetaGift(r, cats, packs), prueba: s(r.origin) === "test",
    });
  }
  return { resultados };
});
reg("marcarGCUsada", "any", async (p, ctx, ses) => {
  let row = n(p.fila) ? await rowBySheet(ctx.db, "gift_cards", n(p.fila)) : null;
  if (row?.borrado_at) row = null;
  if (!row && s(p.codigo)) {
    const hits = (await ctx.db.all("gift_cards")).filter((r) => !r.borrado_at && s(r.codigo_gc) === s(p.codigo));
    row = hits.find((r) => !b(r.usado)) || hits[0] || null;
  }
  if (!row) return { error: "Gift card no encontrada" };
  if (b(row.usado)) return { error: "Esa gift card ya está usada" };
  const ec = ecuadorParts(ctx.now);
  await ctx.db.write(actorOf(ses), "gift_cards", "update", { sheet_row: row.sheet_row }, {
    usado: true, fecha_uso: ec.ymd, usado_por: s(p.usadoPor || p.usuario || ses.name),
  });
  return { ok: true };
});

reg("buscarPaquetes", "any", async (p, ctx) => {
  const q = s(p.q).toLowerCase();
  if (!q) return { resultados: [] };
  const resultados = [];
  for (const r of await ctx.db.all("paquetes")) {
    const ced = s(r.cedula).replace(/\.0+$/, ""), nom = s(r.nombres), ape = s(r.apellidos);
    if (!ced && !nom) continue;
    if (r.borrado_at) continue;
    const blob = [ced, nom, ape, nom + " " + ape, s(r.notas)].join(" ").toLowerCase();
    if (!blob.includes(q)) continue;
    const usos = usosDe(r);
    const total = packSesiones(s(r.sku), s(r.paquete), usos.map((u) => ({ usado: u.usado, fecha: u.fecha })));
    resultados.push({
      fila: r.sheet_row, dia: r.dia, mes: r.mes, ano: r.ano, cedula: ced, nombre: nom, apellido: ape,
      factura: s(r.factura), sku: s(r.sku), paquete: s(r.paquete), vendidoPor: s(r.vendido_por), notas: s(r.notas),
      usos: usos.slice(0, total), usados: usos.slice(0, total).filter((u) => u.usado).length,
      total, completo: b(r.completo),
      codigo: codigoPaquete(r), prueba: s(r.origin) === "test", id: r.id,
      ticketOrigen: s((r.orig as R | undefined)?.ticket), anulado: (r.orig as R | undefined)?.anulado === true,
    });
  }
  return { resultados };
});
export async function registroDe(ctx: Ctx, cedulas: unknown[], apellidos: unknown[]): Promise<R[]> {
  const cv = cedVariantes(cedulas).slice(0, 600), ap = [...new Set(apellidos.map((x) => s(x).trim()).filter(Boolean))].slice(0, 200);
  const or: Filtro[] = [];
  if (cv.length) or.push({ col: "cedula", op: "in", val: cv });
  if (ap.length) or.push({ col: "apellido", op: "in", val: ap });
  if (!or.length) return [];
  return (await consultar(ctx.db, "clientas_registro", { filtros: [{ op: "or", de: or }], limite: 2000 })).rows;
}
reg("getSeguimientoPaquetes", "any", async (p, ctx, ses) => {
  const tel = conTelefono(ses);
  // Con «cedulas» (tarjetas / detalle de ticket) se leen solo los paquetes de esas clientas.
  const dir = Array.isArray(p.cedulas);
  const regs = dir ? await registroDe(ctx, p.cedulas as unknown[], []) : await ctx.db.all("clientas_registro");
  const porCed = new Map(regs.map((r) => [normCedula(r.cedula), s(r.telefono)]));
  const wa = await kvGet(ctx.db, "SUNSU_SEG_PAQ");
  const items = [];
  const paqs = dir ? (cedVariantes(p.cedulas as unknown[]).length ? (await consultar(ctx.db, "paquetes", { filtros: [{ col: "cedula", op: "in", val: cedVariantes(p.cedulas as unknown[]).slice(0, 600) }], limite: 2000 })).rows : []) : await ctx.db.all("paquetes");
  for (const r of paqs) {
    if (!s(r.sku)) continue;
    if (r.borrado_at) continue;
    const usos = usosDe(r);
    const total = packSesiones(s(r.sku), s(r.paquete), usos);
    const clave = [s(r.cedula), s(r.sku), s(r.dia) + "/" + s(r.mes) + "/" + s(r.ano)].join("|");
    items.push({
      fila: r.sheet_row, dia: r.dia, mes: r.mes, ano: r.ano, cedula: s(r.cedula),
      nombre: s(r.nombres), apellido: s(r.apellidos), sku: s(r.sku), paquete: s(r.paquete),
      vendidoPor: s(r.vendido_por), notas: s(r.notas), usos: usos.slice(0, total), total,
      telefono: tel ? telefonoEc(porCed.get(normCedula(r.cedula)) || "") : "",
      claveWa: clave, wa: wa[clave] || null,
      codigo: codigoPaquete(r), prueba: s(r.origin) === "test",
    });
  }
  return { items };
});
reg("marcarUsoManual", "any", async (p, ctx, ses) => marcarUso(p, ctx, ses, false));
reg("marcarPrimerUsoPaquete", "any", async () => ({ error: "La primera sesión no se marca sola. Márcala en el paquete." }));
reg("marcarUsoGC", "any", async (p, ctx, ses) => {
  const row = await rowBySheet(ctx.db, "paquetes", n(p.fila));
  if (!row || row.borrado_at) return { error: "Paquete no encontrado" };
  const slot = Math.max(1, n(p.slot) || 1) - 1;
  const [u, f] = USO_FIELDS[slot] || USO_FIELDS[0];
  if (b(row[u]) || s(row[f])) return { error: "Ese uso ya está marcado" };
  await ctx.db.write(actorOf(ses), "paquetes", "update", { sheet_row: row.sheet_row }, { [u]: true, [f]: "Gift Card, " + s(p.codigo) });
  return { ok: true };
});
const MARCA_VENTANA_MS = 2 * 60 * 1000;

export function rechazoSegundaMarca(row: R, idx: number, ticket: string, nowMs: number): string | null {
  const orig = row.orig && typeof row.orig === "object" ? row.orig as R : {};
  const tickets = Array.isArray(orig.marcas_ticket) ? (orig.marcas_ticket as unknown[]).map((x) => s(x)) : [];
  if (ticket && tickets.includes(ticket)) return "Este paquete ya tiene una sesión marcada para este ticket";
  const ts = n(orig.ultima_marca_ms);
  if (ts && nowMs - ts < MARCA_VENTANA_MS && n(orig.ultima_marca_slot) !== idx + 1) {
    return "Este paquete ya se marcó hace un momento. Espera 2 minutos antes de marcar otra sesión.";
  }
  return null;
}

export function origConMarca(row: R, idx: number, ticket: string, nowMs: number, limpiar: boolean): R {
  const orig = row.orig && typeof row.orig === "object" ? { ...(row.orig as R) } : {};
  if (limpiar) {
    orig.ultima_marca_ms = 0;
    orig.ultima_marca_ticket = "";
    orig.ultima_marca_slot = 0;
    return orig;
  }
  const tickets = Array.isArray(orig.marcas_ticket) ? (orig.marcas_ticket as unknown[]).map((x) => s(x)).filter(Boolean) : [];
  if (ticket && !tickets.includes(ticket)) tickets.push(ticket);
  orig.marcas_ticket = tickets.slice(-8);
  // Qué sesión marcó cada ticket (TK58): al cancelar el ticket se libera justo esa sesión.
  if (ticket) {
    const ms = orig.marcas_slot && typeof orig.marcas_slot === "object" ? { ...(orig.marcas_slot as R) } : {};
    const L = Array.isArray(ms[ticket]) ? (ms[ticket] as unknown[]).map((x) => n(x)) : [];
    if (!L.includes(idx + 1)) L.push(idx + 1);
    ms[ticket] = L;
    orig.marcas_slot = ms;
  }
  orig.ultima_marca_ms = nowMs;
  orig.ultima_marca_ticket = ticket;
  orig.ultima_marca_slot = idx + 1;
  return orig;
}

async function marcarUso(p: R, ctx: Ctx, ses: Ses, primero: boolean): Promise<R> {
  let row: R | null = null;
  if (!primero) row = await rowBySheet(ctx.db, "paquetes", n(p.fila));
  else {
    const ec = ecuadorParts(ctx.now);
    const hits = (await ctx.db.all("paquetes")).filter((r) => !r.borrado_at && normCedula(r.cedula) === normCedula(p.cedula) && s(r.sku).includes(skuCode(s(p.sku)).replace(/^[A-Z]+-/, "SUNSU-") || s(p.sku)) && n(r.dia) === ec.d && n(r.mes) === ec.m && n(r.ano) === ec.y);
    row = hits.find((r) => usosDe(r).some((u) => !u.usado && !u.fecha)) || null;
    if (!row) {
      const sku = s(p.sku);
      row = (await ctx.db.all("paquetes")).find((r) => !r.borrado_at && normCedula(r.cedula) === normCedula(p.cedula) && (s(r.sku) === sku || s(r.sku).includes(sku)) && n(r.dia) === ec.d && n(r.mes) === ec.m) || null;
    }
  }
  if (!row || row.borrado_at) return { error: primero ? "No hay paquete de hoy para esa cédula" : "Paquete no encontrado" };
  if ((row.orig as R | undefined)?.anulado === true) return { error: "Ese paquete está anulado (su ticket se canceló): no se pueden marcar sesiones" };
  const usos = usosDe(row);
  const total = packSesiones(s(row.sku), s(row.paquete), usos);
  const pedido = s(p.idx) !== "" ? n(p.idx) : (s(p.slot) !== "" ? n(p.slot) - 1 : -1);
  const idx = primero ? usos.findIndex((u) => !u.usado && !u.fecha) : (pedido >= 0 ? pedido : usos.findIndex((u) => !u.usado && !u.fecha));
  if (idx < 0 || idx >= total) return { error: "No queda un uso libre" };
  const [u, f] = USO_FIELDS[idx];
  if (b(row[u]) || s(row[f])) return { error: "Esta sesión ya fue marcada" };
  const ticket = s(p.ticket);
  const rechazo = rechazoSegundaMarca(row, idx, ticket, ctx.now.getTime());
  if (rechazo) return { error: rechazo };
  const ec = ecuadorParts(ctx.now);
  const patch: R = { [u]: true, [f]: s(p.fecha || p.nota) || ec.ymd, orig: origConMarca(row, idx, ticket, ctx.now.getTime(), false) };
  const usados = usos.filter((x, i) => x.usado || i === idx).length;
  if (usados >= total) patch.completo = true;
  await ctx.db.write(actorOf(ses), "paquetes", "update", { sheet_row: row.sheet_row }, patch);
  return { ok: true, slot: idx + 1, completo: !!patch.completo };
}

reg("getPromos", "any", async (p, ctx, ses) => {
  const ec = hoy(ctx);
  const todas = [];
  const vig = [];
  for (const r of await ctx.db.all("promos")) {
    if (!s(r.nombre)) continue;
    const it = {
      fila: r.sheet_row, nombre: s(r.nombre), aplica: s(r.aplica_a), tipo: s(r.tipo).toUpperCase() || "%",
      valor: n(r.valor), desde: s(r.desde).slice(0, 10), hasta: s(r.hasta).slice(0, 10), por: s(r.creada_por),
      activa: s(r.activa).toUpperCase() !== "NO" && r.activa !== false,
      codigos: s(r.codigos).split(",").map((x) => x.trim()).filter(Boolean), valor2: n(r.valor2),
    };
    todas.push(it);
    if (it.activa && it.desde && it.hasta && ec >= it.desde && ec <= it.hasta) vig.push(it);
  }
  const esAdm = !!ses && isAdmin(ses.rol);
  return { vigentes: vig, todas: esAdm ? todas : [] };
});
reg("promoCrear", ADMIN, async (p, ctx, ses) => {
  const cods = Array.isArray(p.codigos) ? (p.codigos as unknown[]).map((x) => s(x)).filter(Boolean) : [];
  const mec = s(p.mecanismo || "%").toUpperCase();
  const err = validarPromo(mec, n(p.valor), n(p.valor2), cods);
  if (err) return { error: err };
  if (!s(p.nombre)) return { error: "Falta el nombre de la promo" };
  if (!s(p.desde) || !s(p.hasta)) return { error: "Faltan fechas de vigencia" };
  const sheet_row = await nextSheet(ctx.db, "promos");
  await ctx.db.write(actorOf(ses), "promos", "insert", {}, {
    sheet_row, nombre: s(p.nombre), aplica_a: cods.join(", ") || "Total", tipo: mec, valor: n(p.valor),
    desde: s(p.desde), hasta: s(p.hasta), creada_por: ses.name, activa: "SI", codigos: cods.join(","), valor2: n(p.valor2),
    orig: { nombre: s(p.nombre) },
  });
  return { ok: true };
});
reg("promoDesactivar", ADMIN, async (p, ctx, ses) => {
  const row = await rowBySheet(ctx.db, "promos", n(p.fila));
  if (!row) return { error: "Promo no encontrada" };
  await ctx.db.write(actorOf(ses), "promos", "update", { sheet_row: row.sheet_row }, { activa: "NO" });
  return { ok: true };
});

reg("getCajaV2", "any", async (_p, ctx, ses) => {
  await syncEfectivo(ctx, ses);
  const rows = (await ctx.db.all("caja_chica")).sort((a, b) => n(a.sheet_row) - n(b.sheet_row));
  const iniciada = rows.some((r) => s(r.tipo).toUpperCase().includes("SALDO"));
  const movs = rows.slice(-300).map((r) => ({
    f: ymdUtc(r.fecha_hora) + " " + hmUtc(r.fecha_hora), tipo: s(r.tipo), detalle: s(r.detalle_justificativo),
    quien: s(r.quien), entrada: n(r.entrada), salida: n(r.salida), saldo: n(r.saldo), por: s(r.registrado_por),
  })).reverse();
  return { iniciada, saldo: iniciada ? await saldoCaja(ctx) : 0, movs };
});
async function syncEfectivo(ctx: Ctx, ses: Ses) {
  const desde = addDays(hoy(ctx), -3);
  const refs = new Set((await ctx.db.all("caja_chica")).map((r) => s(r.ref)));
  for (const t of (await tickets(ctx)).filter((r) => !esCancelado(r))) {
    const f = ymdUtc(t.timestamp);
    if (f < desde) continue;
    if (!s(t.comp).toLowerCase().includes("efect")) continue;
    const ref = "TK:" + t.sheet_row;
    if (refs.has(ref)) continue;
    const monto = n(t.estimado);
    if (!(monto > 0)) continue;
    await appendCaja(ctx, ses, "💵 EFECTIVO TICKET", s(t.nombre) + " " + s(t.apellido), s(t.atendido_por), monto, 0, ref);
    refs.add(ref);
  }
}
reg("cajaV2Iniciar", ADMIN, async (p, ctx, ses) => {
  const rows = await ctx.db.all("caja_chica");
  if (rows.some((r) => s(r.tipo).toUpperCase().includes("SALDO INICIAL"))) return { error: "La caja ya está iniciada" };
  const m = n(p.monto);
  if (!(m >= 0)) return { error: "Monto inválido" };
  const sheet_row = await nextSheet(ctx.db, "caja_chica");
  const ec = ecuadorParts(ctx.now);
  await ctx.db.write(actorOf(ses), "caja_chica", "insert", {}, {
    sheet_row, fecha_hora: ec.isoWall, tipo: "⚖️ SALDO INICIAL", detalle_justificativo: "Apertura beta",
    quien: ses.name, entrada: m, salida: 0, saldo: m, ref: "", registrado_por: ses.name, orig: { saldo: m },
  });
  return { ok: true, saldo: m };
});
reg("cajaV2Mov", "any", async (p, ctx, ses) => {
  const tipo = s(p.tipo);
  if (!(await ctx.db.all("caja_chica")).length) return { error: "La caja no está iniciada" };
  if (tipo === "cuadre") {
    const fis = n(p.montoFisico);
    if (Number.isNaN(fis) || fis < 0) return { error: "Conteo físico inválido" };
    if (!s(p.justificativo)) return { error: "El cuadre necesita justificativo" };
    const saldo = await saldoCaja(ctx);
    const dif = round2(fis - saldo);
    if (Math.abs(dif) < 0.005) return { ok: true, saldo, dif: 0, msg: "La caja ya cuadra" };
    const nuevo = dif > 0
      ? await appendCaja(ctx, ses, "⚖️ CUADRE (entrada)", s(p.justificativo), s(p.quien || ses.name), dif, 0)
      : await appendCaja(ctx, ses, "⚖️ CUADRE (salida)", s(p.justificativo), s(p.quien || ses.name), 0, -dif);
    return { ok: true, saldo: nuevo, dif };
  }
  if (tipo !== "descarga" && tipo !== "deposito" && tipo !== "ajuste") return { error: "Tipo inválido" };
  const monto = n(p.monto);
  if (!(monto > 0)) return { error: "Monto inválido" };
  if ((tipo === "descarga" || tipo === "ajuste") && !s(p.justificativo)) return { error: "La operación necesita justificativo" };
  if (!s(p.quien)) return { error: "Falta indicar quién hace la transacción" };
  const saldo = await saldoCaja(ctx);
  if (tipo !== "ajuste" && monto > saldo) return { error: "Fondos insuficientes: saldo $" + saldo.toFixed(2) };
  const nuevo = tipo === "ajuste"
    ? await appendCaja(ctx, ses, "⚖️ AJUSTE (entrada)", s(p.justificativo), s(p.quien), monto, 0)
    : await appendCaja(ctx, ses, tipo === "descarga" ? "💸 DESCARGA" : "🏦 DEPÓSITO", s(p.justificativo), s(p.quien), 0, monto);
  return { ok: true, saldo: nuevo };
});
reg("getCajaMovimientos", "any", async (_p, ctx) => {
  const day = hoy(ctx);
  const movs = (await ctx.db.all("caja_chica")).filter((r) => ymdUtc(r.fecha_hora) === day).map((r) => ({
    ts: s(r.fecha_hora), tipo: s(r.tipo), desc: s(r.detalle_justificativo), quien: s(r.quien),
    monto: n(r.salida) || n(r.entrada), saldo: n(r.saldo), notas: "", registradoPor: s(r.registrado_por), tsApp: "",
  }));
  return { movimientos: movs, saldo: await saldoCaja(ctx), nota: "La beta lee la caja V2 (la hoja V1 no se migró)." };
});
reg("cajaGasto", "any", async (p, ctx, ses) => {
  const saldo = await appendCaja(ctx, ses, "GASTO", s(p.desc), s(p.quien), 0, n(p.monto));
  return { ok: true, msg: "Gasto registrado", saldo };
});
reg("cajaDeposito", "any", async (p, ctx, ses) => {
  const saldo = await appendCaja(ctx, ses, "DEPÓSITO", s(p.banco), s(p.deposita || p.entrega), 0, n(p.monto));
  return { ok: true, msg: "Depósito registrado", saldo };
});
reg("cajaSync", "any", async (_p, ctx, ses) => {
  await syncEfectivo(ctx, ses);
  const saldo = await saldoCaja(ctx);
  return { ok: true, msg: "✅ Sincronizado — Saldo: $" + saldo.toFixed(2), saldo };
});

reg("propinaRegistrar", "any", async (p, ctx, ses) => {
  const monto = n(p.monto);
  if (!(monto > 0) || !s(p.cosmetologa)) return { error: "Monto y cosmetóloga son obligatorios" };
  const sheet_row = await nextSheet(ctx.db, "propinas");
  const ec = ecuadorParts(ctx.now);
  await ctx.db.write(actorOf(ses), "propinas", "insert", {}, {
    sheet_row, fecha: ec.isoWall, cosmetologa: s(p.cosmetologa), monto, via: s(p.via), nota: s(p.nota),
    estado: "PENDIENTE", registro: ses.name, orig: { cosmetologa: s(p.cosmetologa), monto },
  });
  if (s(p.via).toLowerCase().includes("efect")) await appendCaja(ctx, ses, "💝 PROPINA", s(p.cosmetologa), ses.name, monto, 0, "PROP:" + sheet_row);
  return { ok: true };
});
reg("propinaPagar", RECEP, async (p, ctx, ses) => {
  const cos = s(p.cosmetologa);
  const pend = (await ctx.db.all("propinas")).filter((r) => s(r.cosmetologa) === cos && s(r.estado) === "PENDIENTE");
  if (!pend.length) return { error: "No hay propinas pendientes" };
  const total = round2(pend.reduce((a, r) => a + n(r.monto), 0));
  const saldo = await saldoCaja(ctx);
  if (total > saldo) return { error: "Fondos insuficientes: saldo $" + saldo.toFixed(2) };
  const ec = ecuadorParts(ctx.now);
  for (const r of pend) {
    await ctx.db.write(actorOf(ses), "propinas", "update", { sheet_row: r.sheet_row }, { estado: "PAGADA", pagada_el: ec.ymd });
  }
  const nuevo = await appendCaja(ctx, ses, "💝 PAGO PROPINA", cos, ses.name, 0, total);
  return { ok: true, total, saldo: nuevo };
});
reg("getPropinas", "any", async (_p, ctx) => {
  const pend: R = {};
  const ult = [];
  for (const r of await ctx.db.all("propinas")) {
    const it = { fecha: s(r.fecha), cos: s(r.cosmetologa), monto: n(r.monto), via: s(r.via), nota: s(r.nota), estado: s(r.estado) };
    ult.push(it);
    if (it.estado === "PENDIENTE") pend[it.cos] = n(pend[it.cos]) + it.monto;
  }
  return { pendientes: pend, ultimas: ult.slice(-40).reverse(), clientasHoy: [] };
});

reg("registrarMulta", ADMIN, async (p, ctx, ses) => {
  if (!s(p.cosmetologa) || !(n(p.monto) > 0)) return { error: "Cosmetóloga y monto son obligatorios" };
  const tipo = s(p.tipo || "MULTA").toUpperCase();
  if (tipo !== "MULTA" && tipo !== "DESCUENTO") return { error: "Tipo inválido" };
  const sheet_row = await nextSheet(ctx.db, "multas_descuentos");
  await ctx.db.write(actorOf(ses), "multas_descuentos", "insert", {}, {
    sheet_row, fecha: ecuadorParts(ctx.now).isoWall, cosmetologa: s(p.cosmetologa), tipo, monto: n(p.monto),
    motivo: s(p.motivo), col_6: s(p.ticket || ""), orig: { tipo, monto: n(p.monto) },
  });
  return { ok: true };
});

reg("getDashboardHoy", ADMIN, async (_p, ctx) => dashboard(ctx));
reg("getDashCosm", "any", async (p, ctx, ses) => {
  const nombre = s(p.cosmetologa) || ses.name;
  const pack = await cicloDe(ctx, hoy(ctx));
  const { calc, comRecep, diasRecep, multas, ciclo, fin, admins } = pack;
  if (nombreEsAdmin(nombre, admins)) {
    const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const [, m1] = ciclo.split("-").map(Number);
    const [, m2] = fin.split("-").map(Number);
    return {
      faciales: 0, comFaciales: 0, paquetes: 0, comPaquetes: 0, nivelAlcanzado: "—",
      comProductos: 0, totalProductos: 0, extras: 0, comExtras: 0, comRecepcion: 0, diasRecepcion: 0,
      multas: 0, descuentos: 0, totalClientas: calc.totalClientas, bonoActivo: calc.bono,
      siguienteNivel: null, paqParaSiguiente: 0, premioSiguiente: 0,
      periodoLabel: meses[m1 - 1] + " — " + meses[m2 - 1] + " " + fin.slice(0, 4), nCosmetologas: calc.n,
      adminExcluido: true, cicloLabel: cicloLabelDe(ciclo, fin), hoy: hoyVacio(pack.ymdHoy),
    };
  }
  const cosm = calc.personas.find((c) => normNombre(c.cosm) === normNombre(nombre) || normNombre(c.cosm).startsWith(normNombre(nombre).split(" ")[0])) ;
  const c = cosm || { faciales: 0, comFaciales: 0, paquetes: 0, comPaquetes: 0, nivel: "—", comProductos: 0, totalProductos: 0, extras: 0, comExtras: 0, next: null as null | { nivel: string; faltan: number; premio: number } };
  const md = multasDe(nombre, ciclo, fin, multas);
  const recep = personaEsRecepcionista(nombre, await ctx.db.all("usuarios"));
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const [y1, m1] = ciclo.split("-").map(Number);
  const [y2, m2] = fin.split("-").map(Number);
  const marcaDash = marcaDePersona(await marks(ctx), nombre);
  return {
    faciales: recep ? 0 : c.faciales, comFaciales: recep ? 0 : c.comFaciales,
    comFacialesOn: recep ? false : (!marcaDash || marcaDash.comFac !== false),
    paquetes: c.paquetes, comPaquetes: c.comPaquetes,
    nivelAlcanzado: c.nivel, comProductos: c.comProductos, totalProductos: c.totalProductos,
    extras: c.extras, comExtras: c.comExtras, comRecepcion: recep ? comRecep : 0, diasRecepcion: recep ? diasRecep : 0,
    multas: md.mlt, descuentos: md.desc, totalClientas: calc.totalClientas, bonoActivo: calc.bono,
    siguienteNivel: c.next ? n(c.next.nivel.replace("N", "")) : null,
    paqParaSiguiente: c.next?.faltan || 0, premioSiguiente: c.next?.premio || 0,
    periodoLabel: meses[m1 - 1] + " — " + meses[m2 - 1] + " " + y2, nCosmetologas: calc.n,
    cicloLabel: cicloLabelDe(ciclo, fin), hoy: pickHoy(pack, nombre),
  };
});
reg("getReporteAdmin", ADMIN, async (_p, ctx) => {
  const { calc, comRecep, diasRecep, multas, ciclo, fin } = await cicloDe(ctx, hoy(ctx));
  const users = await ctx.db.all("usuarios");
  const cosmetologas = calc.personas.map((c) => {
    const md = multasDe(c.cosm, ciclo, fin, multas);
    const esRecep = personaEsRecepcionista(c.cosm, users);
    const recep = esRecep ? comRecep : 0;
    const cf = esRecep ? 0 : c.comFaciales;
    const neto = round2(cf + c.comPaquetes + c.comProductos + c.comExtras + recep - md.mlt - md.desc);
    const u = users.find((x) => normNombre(x.nombre) === normNombre(c.cosm));
    return {
      name: c.cosm, color: s(u?.color) || "#5B7FA6", f: esRecep ? 0 : c.faciales, paq: c.paquetes, n: c.nivel,
      cf, cp: c.comPaquetes, cprod: c.comProductos, totalProd: c.totalProductos,
      ext: c.extras, cext: c.comExtras, crecep: recep, diasRecep: recep ? diasRecep : 0,
      m: md.mlt, d: md.desc, t: Math.max(0, neto), nextN: c.next?.nivel || null, faltanPaq: c.next?.faltan || 0, nextCp: c.next?.premio || 0,
    };
  });
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return {
    cosmetologas, bonoActivo: calc.bono, totalClientas: calc.totalClientas, nCosmetologas: calc.n,
    periodo: meses[Number(ciclo.slice(5, 7)) - 1] + " 26 — " + meses[Number(fin.slice(5, 7)) - 1] + " 25, " + fin.slice(0, 4),
  };
});
reg("getReporte", ADMIN, async (p, ctx, ses) => FNS.getReporteAdmin(p, ctx, ses));
reg("getComisionesRol", "any", async (p, ctx, ses) => FNS.getDashCosm(p, ctx, ses));
async function payloadComisionRecepcion(ctx: Ctx) {
  const pack = await cicloDe(ctx, hoy(ctx));
  const rec = pack.recepcion;
  return {
    ok: true,
    comision: pack.comRecep,
    total: rec?.total ?? pack.comRecep,
    dias: rec?.dias ?? [],
    diasCumplidos: rec?.diasCumplidos ?? pack.diasRecep,
    porClienta: 0.50,
    meta: 10,
    metaLunes: 5,
    periodoLabel: periodoRecepLabel(pack.ciclo, pack.fin),
    ciclo: pack.ciclo,
    fin: pack.fin,
    acuityOk: rec?.acuityOk !== false,
    acuityError: rec?.acuityError,
  };
}
reg("getComisionRecepcion", "any", async (_p, ctx) => payloadComisionRecepcion(ctx));
reg("comision_recepcion", "any", async (_p, ctx) => payloadComisionRecepcion(ctx));
type MontosFila = { com: number; vendido: number };
function montosPersona(nombre: string, pack: Awaited<ReturnType<typeof cicloDe>>, esRecep: boolean): Record<string, MontosFila> {
  const key = normNombre(nombre);
  const primero = key.split(" ")[0] || key;
  const p = pack.calc.personas.find((c) => normNombre(c.cosm) === key || normNombre(c.cosm).startsWith(primero));
  const extra = p ? pack.lineas.get(p.cosm) : undefined;
  const faciales = esRecep ? 0 : (p?.comFaciales || 0);
  const paquetes = p?.comPaquetes || 0;
  const productos = p?.comProductos || 0;
  const recepcion = esRecep ? pack.comRecep : 0;
  const extras = p?.comExtras || 0;
  const vFac = esRecep ? 0 : (extra?.vendido.faciales || 0);
  const vPaq = extra?.vendido.paquetes || 0;
  const vProd = extra?.vendido.productos || 0;
  const vRec = esRecep ? (pack.vendidoRecep || 0) : 0;
  const vExt = extra?.vendido.extras || 0;
  return {
    Faciales: { com: faciales, vendido: vFac },
    Paquetes: { com: paquetes, vendido: vPaq },
    Productos: { com: productos, vendido: vProd },
    Extras: { com: extras, vendido: vExt },
    "Recepción": { com: recepcion, vendido: vRec },
    Total: { com: round2(faciales + paquetes + productos + recepcion + extras), vendido: round2(vFac + vPaq + vProd + vExt + vRec) },
  };
}
type FilaCom = { concepto: string; porCiclo: number[]; total: number; vendido: number; vendidoPorCiclo: number[] };
type DetalleCom = {
  faciales: number; paquetes: number; regimen: string; nivel: string;
  tramos: { etiqueta: string; pct: string; n: number; monto: number }[];
  productos: LineaCom[]; productosN: number; extras: LineaCom[]; extrasN: number;
  facialesDet: LineaCom[]; paquetesDet: LineaCom[]; recepcion: LineaCom[];
  comFac: boolean; esRecepcionista: boolean;
};
const CONCEPTOS_COM = ["Faciales", "Paquetes", "Productos", "Extras", "Recepción", "Total"] as const;
function filasPersona(nombre: string, packs: Awaited<ReturnType<typeof cicloDe>>[], esRecep: boolean): FilaCom[] {
  return CONCEPTOS_COM.filter((concepto) => {
    if (concepto === "Recepción") return esRecep;
    if (concepto === "Faciales") return !esRecep;
    return true;
  }).map((concepto) => {
    const vals = packs.map((pack) => montosPersona(nombre, pack, esRecep)[concepto]);
    return {
      concepto,
      porCiclo: vals.map((v) => v.com),
      total: round2(vals.reduce((a, v) => a + v.com, 0)),
      vendidoPorCiclo: vals.map((v) => v.vendido),
      vendido: round2(vals.reduce((a, v) => a + v.vendido, 0)),
    };
  });
}
function juntarLineas(a: LineaCom[], b: LineaCom[]): LineaCom[] {
  const map = new Map<string, LineaCom>();
  for (const ln of a.concat(b)) {
    const clave = (ln.sku || "") + "|" + ln.nombre;
    const prev = map.get(clave);
    if (!prev) map.set(clave, { ...ln });
    else {
      prev.qty += ln.qty;
      prev.monto = round2(prev.monto + ln.monto);
      prev.vendido = round2((prev.vendido || 0) + (ln.vendido || 0));
    }
  }
  return [...map.values()];
}
function detallePersona(nombre: string, packs: Awaited<ReturnType<typeof cicloDe>>[], esRecep: boolean): DetalleCom {
  const out: DetalleCom = {
    faciales: 0, paquetes: 0, regimen: "tramo", nivel: "—", tramos: [], productos: [], productosN: 0, extras: [], extrasN: 0,
    facialesDet: [], paquetesDet: [], recepcion: [], comFac: true, esRecepcionista: esRecep,
  };
  const tramos = new Map<string, { etiqueta: string; pct: string; n: number; monto: number }>();
  const key = normNombre(nombre);
  const primero = key.split(" ")[0] || key;
  for (const pack of packs) {
    const p = pack.calc.personas.find((c) => normNombre(c.cosm) === key || normNombre(c.cosm).startsWith(primero));
    out.regimen = pack.calc.regimen;
    if (esRecep) out.recepcion = juntarLineas(out.recepcion, pack.lineasRecep || []);
    if (!p) continue;
    out.faciales += esRecep ? 0 : (p.faciales || 0);
    out.paquetes += p.paquetes || 0;
    out.productosN += p.totalProductos || 0;
    out.extrasN += p.extras || 0;
    out.nivel = p.nivel || out.nivel;
    const extra = pack.lineas.get(p.cosm);
    if (extra) {
      out.productos = juntarLineas(out.productos, extra.productos);
      out.extras = juntarLineas(out.extras, extra.extras);
      if (!esRecep) out.facialesDet = juntarLineas(out.facialesDet, extra.faciales || []);
      out.paquetesDet = juntarLineas(out.paquetesDet, extra.paquetes || []);
    }
    if (pack.calc.regimen === "tramo" && p.es) {
      for (const t of desglosePaquetesTramo(p.paquetes, pack.tramos, p.netos || [])) {
        const etiqueta = t.hasta >= 100000 ? `${t.desde}+` : `${t.desde}–${t.hasta}`;
        const pct = t.pct == null ? "" : `${t.pct}%`;
        const id = etiqueta + "|" + pct;
        const prev = tramos.get(id) || { etiqueta, pct, n: 0, monto: 0 };
        prev.n += t.n;
        prev.monto = round2(prev.monto + t.monto);
        tramos.set(id, prev);
      }
    }
  }
  out.tramos = [...tramos.values()];
  return out;
}

function sanitizarVendidoComisiones(data: R, admin: boolean): R {
  if (admin) return data;
  const limpiaFila = (f: R) => {
    const o = { ...f } as R;
    delete o.vendido;
    delete o.vendidoPorCiclo;
    return o;
  };
  const limpiaLinea = (l: R) => {
    const o = { ...l } as R;
    delete o.vendido;
    return o;
  };
  const limpiaDet = (d: R | undefined) => {
    if (!d) return d;
    const o = { ...d } as R;
    delete o.vendido;
    for (const k of ["productos", "extras", "recepcion", "facialesDet", "paquetesDet"]) {
      if (Array.isArray(o[k])) o[k] = (o[k] as R[]).map(limpiaLinea);
    }
    return o;
  };
  const out = { ...data } as R;
  if (Array.isArray(out.filas)) out.filas = (out.filas as R[]).map(limpiaFila);
  if (out.detalle) out.detalle = limpiaDet(out.detalle as R);
  if (Array.isArray(out.equipo)) {
    out.equipo = (out.equipo as R[]).map((e) => ({
      ...e,
      filas: Array.isArray(e.filas) ? (e.filas as R[]).map(limpiaFila) : e.filas,
      detalle: limpiaDet(e.detalle as R),
    }));
  }
  return out;
}

reg("getComisionesTabla", "any", async (p, ctx, ses) => {
  const desde = s(p.desde) || cicloInicio(hoy(ctx));
  const hasta = s(p.hasta) || desde;
  const packs = [];
  for (const c of ciclosEntre(desde, hasta)) packs.push(await cicloDe(ctx, c));
  const admins = packs[0]?.admins || [];
  const personas = new Map<string, string>();
  for (const pack of packs) {
    for (const per of pack.calc.personas) {
      if (!nombreEsAdmin(per.cosm, admins)) personas.set(normNombre(per.cosm), per.cosm);
    }
  }
  const marcasCom = await marks(ctx);
  for (const m of marcasCom) {
    if (m.es && !nombreEsAdmin(m.nombre, admins) && !nombreEsAdmin(m.id, admins)) personas.set(normNombre(m.nombre), m.nombre);
  }
  const users = await ctx.db.all("usuarios");
  for (const u of users) {
    if (u.bloqueado || !personaEsRecepcionista(s(u.nombre) || s(u.short) || s(u.id), [u])) continue;
    const nom = s(u.nombre) || s(u.short) || s(u.id);
    if (nom && !nombreEsAdmin(nom, admins)) personas.set(normNombre(nom), nom);
  }
  const ciclos = packs.map((pack) => ({ inicio: pack.ciclo, fin: pack.fin, regimen: pack.calc.regimen, n: pack.calc.n }));
  const esRecepDe = (nombre: string) => personaEsRecepcionista(nombre, users);
  const detalleDe = (nombre: string) => {
    const esRecep = esRecepDe(nombre);
    const det = detallePersona(nombre, packs, esRecep);
    const mk = marcaDePersona(marcasCom, nombre);
    det.comFac = esRecep ? false : (!mk || mk.comFac !== false);
    return det;
  };
  const { unirPersonas, aliasesDe } = await import("./personas_unir.ts");
  const lista = unirPersonas([...personas.values()].map((nombre) => ({ nombre })), await aliasesDe(ctx)).map((x) => x.nombre);
  const pideTodas = esAdmin(ses.rol) && (s(p.persona) === "Todas" || s(p.persona) === "*");
  if (pideTodas) {
    const equipo = lista.map((nombre) => {
      const filas = filasPersona(nombre, packs, esRecepDe(nombre));
      return { persona: nombre, filas, detalle: detalleDe(nombre), total: filas.find((f) => f.concepto === "Total")?.total || 0 };
    });
    return sanitizarVendidoComisiones({
      ok: true, todas: true, persona: "Todas", personas: lista, equipo,
      totalEquipo: round2(equipo.reduce((a, e) => a + e.total, 0)),
      ciclos, tramos: packs[0]?.tramos || [], admin: true,
      hoy: hoyVacio(packs[0]?.ymdHoy || ""), cicloLabel: packs[0] ? cicloLabelDe(packs[0].ciclo, packs[0].fin) : "",
    } as R, true);
  }
  let persona = s(p.persona || p.cosmetologa || p.nombre);
  if (!esAdmin(ses.rol)) persona = ses.name;
  if (!persona || nombreEsAdmin(persona, admins)) persona = lista[0] || "";
  const filas = filasPersona(persona, packs, esRecepDe(persona));
  const packHoy = packs.find((x) => x.ciclo <= (x.ymdHoy || "") && (x.ymdHoy || "") <= x.fin) || packs[0];
  return sanitizarVendidoComisiones({
    ok: true, persona, personas: lista, adminExcluido: nombreEsAdmin(s(p.persona), admins),
    ciclos, filas, detalle: detalleDe(persona), tramos: packs[0]?.tramos || [], admin: esAdmin(ses.rol),
    hoy: packHoy ? pickHoy(packHoy, persona) : hoyVacio(""), cicloLabel: packHoy ? cicloLabelDe(packHoy.ciclo, packHoy.fin) : "",
  } as R, esAdmin(ses.rol));
});
reg("getTramos", "any", async (_p, ctx) => {
  const ciclo = cicloInicio(hoy(ctx));
  const cuando = ciclo < "2026-10-26" ? "2026-10-26" : ciclo;
  return { ok: true, tramos: (await cfgAplicada(ctx.db, cuando)).tramos };
});
reg("tramos_guardar", ADMIN, async (p, ctx, ses) => {
  const tramos = normalizarTramos(p.tramos);
  const ciclo = cicloInicio(hoy(ctx));
  const bloqueo = await reemplazarTramos(ctx, ses, tramos, ciclo < "2026-10-26" ? "2026-10-26" : ciclo);
  if (bloqueo) return bloqueo;
  await logAccion(ctx.db, actorOf(ses), "TRAMOS PAQUETE", tramos.map((t) => `${t.desde}-${t.hasta} ${t.modo} ${t.valor}`).join(", "));
  return { ok: true, tramos };
});
reg("getHistorialComisiones", "any", async (_p, ctx) => {
  const store = await kvGet(ctx.db, "SUNSU_HISTORIAL_COMISIONES");
  let filas: R[] = [];
  try { filas = await ctx.db.all("historial_comisiones"); } catch { filas = []; }
  return { periodos: Object.keys(store), detalle: store, filas };
});
reg("getPeriodoComision", "any", async (p, ctx) => {
  const { calc } = await cicloDe(ctx, hoy(ctx));
  const nombre = s(p.nombre);
  const c = calc.personas.find((x) => normNombre(x.cosm).includes(normNombre(nombre).split(" ")[0]));
  return { ok: true, persona: c || null, totalClientas: calc.totalClientas, n: calc.n, metas: calc.metas };
});

reg("guardarCotizacion", RECEP, async (p, ctx, ses) => {
  if (!puedeCotizar(ses.rol)) return { error: "No tienes acceso a cotizaciones" };
  const calc = cotCalcular((p.lineas || p.items || []) as never[], s(p.dscMode), n(p.dscVal));
  if (!calc.lineas.length) return { error: "La cotización no tiene líneas" };
  if (!s(p.cliente)) return { error: "Falta el cliente" };
  const actor = actorOf(ses);
  if (s(p.numero)) {
    const prev = (await ctx.db.all("cotizaciones")).find((r) => s(r.numero) === s(p.numero) || leerSerie(r, "sq_num") === s(p.numero));
    if (!prev) return { error: "Cotización no encontrada" };
    const orig = { ...(prev.orig && typeof prev.orig === "object" ? prev.orig as R : {}), sq_num: s(prev.numero), dscMode: calc.dscMode, dscVal: calc.dscVal };
    const saved = await ctx.db.write(actor, "cotizaciones", "update", matchTicket(prev), {
      cliente: s(p.cliente), telefono: s(p.telefono), email: s(p.email), cedula: s(p.cedula),
      items: calc.lineas, subtotal: calc.subtotal, descuento: calc.descuento, iva: calc.iva, total: calc.total,
      validez: s(p.validez) || s(prev.validez) || "Válida por 15 días", notas: s(p.notas), estado: s(p.estado) || s(prev.estado) || "Enviada",
      orig,
    });
    await logAccion(ctx.db, actor, "EDITAR COTIZACION", s(prev.numero));
    return { ok: true, numero: s(prev.numero), ...calc, id: saved?.id };
  }
  if (!previewPedido(p)) {
    try { await backfillSQ(ctx.db, actor); } catch { /* sigue con el máximo local */ }
  }
  const numero = await tomarNumero(ctx.db, "COT", await ctx.db.all("cotizaciones"), "numero");
  const saved = await ctx.db.write(actor, "cotizaciones", "insert", {}, {
    numero, fecha: ecuadorParts(ctx.now).isoWall, creado_por: ses.name, cliente: s(p.cliente),
    telefono: s(p.telefono), email: s(p.email), cedula: s(p.cedula), items: calc.lineas,
    subtotal: calc.subtotal, descuento: calc.descuento, iva: calc.iva, total: calc.total,
    validez: s(p.validez) || "Válida por 15 días", notas: s(p.notas), estado: s(p.estado) || "Enviada",
    orig: { dscMode: calc.dscMode, dscVal: calc.dscVal, sq_num: numero },
  });
  return { ok: true, numero: saved?.numero || numero, ...calc };
});
reg("getCotizaciones", RECEP, async (p, ctx, ses) => {
  if (!puedeCotizar(ses.rol)) return { error: "No tienes acceso a cotizaciones" };
  if (!previewPedido(p)) {
    try { await backfillSQ(ctx.db, actorOf(ses)); } catch { /* la lista usa el número que ya tenga */ }
  }
  const items = (await ctx.db.all("cotizaciones")).sort((a, b) => s(b.fecha).localeCompare(s(a.fecha)) || s(b.numero).localeCompare(s(a.numero)));
  return { ok: true, items };
});
reg("getCotizacion", RECEP, async (p, ctx, ses) => {
  if (!puedeCotizar(ses.rol)) return { error: "No tienes acceso a cotizaciones" };
  const clave = s(p.numero);
  const row = (await ctx.db.all("cotizaciones")).find((r) => s(r.numero) === clave || leerSerie(r, "sq_num") === clave);
  if (!row) return { error: "No encontrada" };
  return { ok: true, item: row };
});

reg("getMensajes", "any", async (_p, ctx) => {
  const { mezclarPlantillas } = await import("./wa_lib.ts");
  const m = await cfgMap(ctx);
  return { msgs: mezclarPlantillas(m) };
});
reg("getPlantillaGC", "any", async (_p, ctx) => {
  const m = await cfgMap(ctx);
  return { plantilla: m.get("MENSAJE GIFT CARD") || "Hola, tu gift card de Sunsu Spa." };
});

reg("getGCDigitales", "any", async (_p, ctx) => {
  const store = await kvGet(ctx.db, "SUNSU_GC_DIGITALES");
  const vendidas = new Set((await ctx.db.all("gift_cards")).filter((r) => !r.borrado_at && (s(r.cedula_comprador) || s(r.nombre_comprador))).map((r) => s(r.codigo_gc)));
  const items: R[] = [];
  for (const [codigo, o] of Object.entries(store)) {
    if (!vendidas.has(codigo)) continue;
    items.push({ ...(o as R), codigo });
  }
  items.sort((a, b) => s(b.ts).localeCompare(s(a.ts)));
  return { items };
});
reg("guardarGCDigital", "any", async (p, ctx, ses) => {
  if (ctx.db.prueba) {
    // app_kv / gift_cards_digitales no tienen 'origin': en prueba el detalle digital va en la propia fila de prueba
    const row = (await ctx.db.all("gift_cards")).find((r) => s(r.origin) === "test" && s(r.codigo_gc) === s(p.codigo));
    if (row) await ctx.db.write(actorOf(ses), "gift_cards", "update", { sheet_row: row.sheet_row }, { orig: { ...((row.orig || {}) as R), digital: { mensaje: s(p.mensaje), ts: ecuadorParts(ctx.now).isoWall, por: ses.name } } });
    return { ok: true, prueba: true };
  }
  const store = await kvGet(ctx.db, "SUNSU_GC_DIGITALES");
  const gc = { mensaje: s(p.mensaje), ts: ecuadorParts(ctx.now).isoWall, por: ses.name, imagen: s(p.imagen).startsWith("http") ? s(p.imagen) : "", codigo: s(p.codigo) };
  store[s(p.codigo)] = gc;
  await kvSet(ctx.db, actorOf(ses), "SUNSU_GC_DIGITALES", store);
  await espejo(ctx.db, actorOf(ses), "gift_cards_digitales", gc);
  return { ok: true };
});
reg("eliminarGCDigital", "any", async (p, ctx, ses) => {
  const store = await kvGet(ctx.db, "SUNSU_GC_DIGITALES");
  delete store[s(p.codigo)];
  await kvSet(ctx.db, actorOf(ses), "SUNSU_GC_DIGITALES", store);
  return { ok: true };
});

reg("subirComprobante", "any", async (p, ctx, ses) => {
  const id = await guardarArchivo(ctx.db, actorOf(ses), "comprobante", s(p.nombre) || "comprobante", s(p.imagen));
  if (!id) return { error: "Sin imagen (o pesa más de 1.5 MB). La beta no sube a Drive." };
  return { ok: true, url: "archivo:" + id, nota: "Guardado en Supabase, no en Drive." };
});
reg("fotoB64", "any", async (p, ctx) => {
  const id = s(p.id).replace(/[^-\w]/g, "");
  if (!id) return { error: "Falta la foto" };
  // Solo esa fila (antes bajaba todo el almacén con los base64).
  const f = (await consultar(ctx.db, "app_archivos", { filtros: [{ col: "id", op: "eq", val: id }], limite: 1 }).catch(() => ({ rows: [] as R[] }))).rows[0];
  if (f) return { ok: true, mime: s(f.mime) || "image/jpeg", b64: s(f.data_b64) };
  // Fotos del sistema en Drive (compartidas por enlace): se leen por la miniatura pública, solo id de Drive.
  if (!/^[-\w]{25,}$/.test(id)) return { error: "Foto no encontrada", parcial: true };
  try {
    const res = await (ctx.fetchImpl || fetch)("https://drive.google.com/thumbnail?id=" + id + "&sz=w" + Math.min(2000, Math.max(120, n(p.sz) || 1600)), { redirect: "follow" });
    const mime = s(res.headers.get("content-type")).split(";")[0];
    if (!res.ok || !/^image\//.test(mime)) return { error: "No se pudo leer la foto de Drive", parcial: true };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 6_000_000) return { error: "Foto muy grande", parcial: true };
    let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { ok: true, mime, b64: btoa(bin), fuente: "drive" };
  } catch { return { error: "No se pudo leer la foto de Drive", parcial: true }; }
});

/**
 * TK154 (Emilia t674u): miniaturas de la lista de tickets en UNA sola consulta (antes 1 fotoB64 por foto).
 * Máx 60 ids; tope ~4 MB de base64 por respuesta: lo que no entra vuelve en `faltan` para otro lote.
 */
export const FOTOS_BATCH_MAX = 60;
export const FOTOS_BATCH_BYTES = 4_000_000;
reg("fotos_batch", "any", async (p, ctx) => {
  const ids = [...new Set((Array.isArray(p.ids) ? p.ids : []).map((x: unknown) => s(x).replace(/^archivo:/, "").replace(/[^-\w]/g, "")).filter(Boolean))].slice(0, FOTOS_BATCH_MAX) as string[];
  if (!ids.length) return { ok: true, items: {}, faltan: [] };
  const rows = (await consultar(ctx.db, "app_archivos", { cols: ["id", "mime", "data_b64"], filtros: [{ col: "id", op: "in", val: ids }] }).catch(() => ({ rows: [] as R[] }))).rows;
  const items: Record<string, { mime: string; b64: string }> = {};
  const faltan: string[] = [];
  let bytes = 0;
  const por = new Map(rows.map((r) => [s(r.id), r]));
  for (const id of ids) {
    const f = por.get(id);
    if (!f || !s(f.data_b64)) continue;
    const b64 = s(f.data_b64);
    if (bytes + b64.length > FOTOS_BATCH_BYTES && Object.keys(items).length) { faltan.push(id); continue; }
    bytes += b64.length;
    items[id] = { mime: s(f.mime) || "image/jpeg", b64 };
  }
  return { ok: true, items, faltan, n: Object.keys(items).length };
});

reg("getEntradas", "any", async (_p, ctx) => {
  const items = [];
  for (const r of await ctx.db.all("inventario_entradas")) {
    const sku = s(r.sku);
    if (!sku || sku.toLowerCase() === "sku") continue;
    if (s(r.producto).includes("←")) continue;
    if (s(r.cant_recibida_llenar_aqui) !== "") continue;
    items.push({
      fila: r.sheet_row, sku, nombre: s(r.producto), proveedor: s(r.proveedor), pedida: n(r.cant_pedida),
      recibida: "", estado: s(r.estado_automatico), orden: s(r.orden), notas: s(r.notas),
    });
  }
  return { items };
});
reg("registrarEntrada", "any", async (p, ctx, ses) => entrada(p, ctx, ses, false));
reg("editarEntrada", ADMIN, async (p, ctx, ses) => entrada(p, ctx, ses, true));
async function entrada(p: R, ctx: Ctx, ses: Ses, editar: boolean): Promise<R> {
  const row = await rowBySheet(ctx.db, "inventario_entradas", n(p.fila));
  if (!row) return { error: "Fila inválida" };
  const cant = n(p.cantidad);
  const notas = s(row.notas) + (editar ? " · editado por " + ses.name + " (" + s(row.cant_recibida_llenar_aqui) + "→" + cant + ")" : "");
  const estado = cant <= 0 ? "Pendiente" : cant + 0.001 < n(row.cant_pedida) ? "Parcial" : "Completo";
  await ctx.db.write(actorOf(ses), "inventario_entradas", "update", { sheet_row: row.sheet_row }, {
    cant_recibida_llenar_aqui: cant, estado_automatico: estado, registrado_por: ses.name, notas,
    col_11: ecuadorParts(ctx.now).stamp,
  });
  if (s(row.notas).toUpperCase().includes("COMPRA DIRECTA")) {
    await sumarCabina(ctx, ses, skuCode(s(row.sku)), cant - (editar ? n(row.cant_recibida_llenar_aqui) : 0), "compra directa");
  }
  return { ok: true, estado };
}
async function sumarCabina(ctx: Ctx, ses: Ses, sku: string, delta: number, nota: string) {
  if (!delta) return;
  const rows = await ctx.db.all("cabina_inventario");
  const hit = rows.find((r) => skuCode(s(r.sku_catalogo)) === sku || skuCode(s(r.codigo)) === sku);
  if (!hit) return;
  const cerrados = n(hit.envases_cerrados) + delta;
  const stock = (cerrados + n(hit.bodega_cerrados) + n(hit.abierto_restante)) * (n(hit.contenido_envase) || 1);
  await ctx.db.write(actorOf(ses), "cabina_inventario", "update", { sheet_row: hit.sheet_row }, {
    envases_cerrados: cerrados, stock_total: stock, notas: s(hit.notas) + " · " + nota,
  });
}

reg("getEntradasHistorial", "any", async (_p, ctx) => {
  const items = (await ctx.db.all("inventario_entradas")).filter((r) => s(r.cant_recibida_llenar_aqui) !== "").map((r) => ({
    fila: r.sheet_row, sku: s(r.sku), nombre: s(r.producto), pedida: n(r.cant_pedida), recibida: n(r.cant_recibida_llenar_aqui),
    estado: s(r.estado_automatico), orden: s(r.orden), notas: s(r.notas), por: s(r.registrado_por),
  }));
  return { items };
});
reg("getProveedoresApp", "any", async (_p, ctx) => ({
  items: (await ctx.db.all("proveedores")).map((r) => ({
    fila: r.sheet_row, nombre: s(r.nombre), ruc: s(r.ruc), telefono: s(r.telefono), direccion: s(r.direccion),
    email: s(r.email), familia: s(r.familia), notas: s(r.notas),
  })),
}));
function mismoProv(a: string, b: string): boolean {
  const x = normNombre(a);
  const y = normNombre(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const fx = x.split(" ")[0] || "";
  const fy = y.split(" ")[0] || "";
  return (fx.length >= 4 && (y === fx || y.startsWith(fx + " "))) || (fy.length >= 4 && (x === fy || x.startsWith(fy + " ")));
}
function totalOrdenHoja(raw: unknown): number {
  const json = raw && typeof raw === "object" ? raw as R : {};
  const sum = (rows: unknown, qty: string) => {
    if (!Array.isArray(rows)) return 0;
    return (rows as R[]).reduce((a, ln) => a + n(ln[qty] ?? ln.cant ?? ln.qty) * n(ln.compra ?? ln.precio), 0);
  };
  const fact = sum(json.fact, "vendido");
  const directa = sum(json.directa, "cant");
  const items = sum(json.items, "cant");
  return round2(fact + directa > 0 ? fact + directa : items);
}
async function tablaProveedores(ctx: Ctx): Promise<R[]> {
  const hojas = await ctx.db.all("proveedores");
  let erps: R[] = [];
  let ocs: R[] = [];
  let ordenes: R[] = [];
  try { erps = await ctx.db.all("erp_proveedores"); } catch { erps = []; }
  try { ocs = await ctx.db.all("erp_oc"); } catch { ocs = []; }
  try { ordenes = await ctx.db.all("ordenes_compra"); } catch { ordenes = []; }
  const fuentes = hojas.map((r) => ({
    fila: s(r.sheet_row), nombre: s(r.nombre), ruc: s(r.ruc), telefono: s(r.telefono),
    direccion: s(r.direccion), email: s(r.email), familia: s(r.familia), notas: s(r.notas),
    erpId: "",
  }));
  for (const e of erps) {
    const ya = fuentes.find((r) => (e.legacy_sheet_row != null && s(r.fila) === s(e.legacy_sheet_row)) || mismoProv(r.nombre, s(e.nombre)));
    if (ya) { ya.erpId = s(e.id); if (!ya.ruc) ya.ruc = s(e.ruc); if (!ya.telefono) ya.telefono = s(e.telefono); if (!ya.email) ya.email = s(e.email); continue; }
    fuentes.push({
      fila: s(e.id), nombre: s(e.nombre), ruc: s(e.ruc), telefono: s(e.telefono),
      direccion: "", email: s(e.email), familia: "", notas: "", erpId: s(e.id),
    });
  }
  return fuentes.filter((r) => r.nombre).map((r) => {
    const codigo = (s(r.familia) || familiaDe(r.nombre)).toUpperCase();
    const vistas: R[] = [];
    const nums = new Set<string>();
    for (const o of ocs) {
      if (!r.erpId || s(o.proveedor_id) !== r.erpId) continue;
      const numero = s(o.numero) || "Borrador";
      nums.add(numero.toUpperCase());
      vistas.push({
        id: s(o.id), numero, fecha: s(o.fecha).slice(0, 10),
        estado: s(o.flujo) || s(o.estado) || "abierta",
        total: round2(n(o.total)), saldo: round2(n(o.saldo)),
      });
    }
    for (const o of ordenes) {
      if (!mismoProv(s(o.proveedor), r.nombre)) continue;
      const numero = s(o.numorden) || "Borrador";
      if (nums.has(numero.toUpperCase())) continue;
      const json = o.json && typeof o.json === "object" ? o.json as R : {};
      const total = totalOrdenHoja(o.json);
      vistas.push({
        id: "", numero, fecha: s(o.fecha).slice(0, 10),
        estado: s(json.estado) || "Registrada", total, saldo: total,
      });
    }
    vistas.sort((a, b) => s(b.fecha).localeCompare(s(a.fecha)) || s(b.numero).localeCompare(s(a.numero)));
    return {
      fila: r.fila, codigo, erpId: r.erpId, nombre: r.nombre, ruc: r.ruc, telefono: r.telefono, email: r.email,
      direccion: r.direccion, notas: r.notas, ordenes: vistas.length,
      total: round2(vistas.reduce((a, o) => a + n(o.total), 0)),
      saldo: round2(vistas.reduce((a, o) => a + n(o.saldo), 0)),
      ocs: vistas,
    };
  });
}
reg("getProveedoresTabla", "any", async (_p, ctx) => ({ ok: true, items: await tablaProveedores(ctx) }));
reg("guardarProveedorApp", ADMIN, async (p, ctx, ses) => {
  const row = { nombre: s(p.nombre), ruc: s(p.ruc), telefono: s(p.telefono), direccion: s(p.direccion), email: s(p.email), familia: s(p.familia), notas: s(p.notas), orig: { nombre: s(p.nombre) } };
  if (n(p.fila)) await ctx.db.write(actorOf(ses), "proveedores", "update", { sheet_row: n(p.fila) }, row);
  else await ctx.db.write(actorOf(ses), "proveedores", "insert", {}, { ...row, sheet_row: await nextSheet(ctx.db, "proveedores") });
  return { ok: true };
});
reg("eliminarProveedorApp", ADMIN, async (p, ctx, ses) => {
  await ctx.db.write(actorOf(ses), "proveedores", "delete", { sheet_row: n(p.fila) }, null);
  return { ok: true };
});
reg("getOCDataApp", "any", async (p, ctx) => {
  const rows = (await ctx.db.all("ordenes_compra")).filter((r) => s(r.numorden) === s(p.orden));
  const row = rows[rows.length - 1];
  if (!row) return { error: "Sin datos" };
  let data: unknown = row.json;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch { /* keep */ } }
  return { ok: true, orden: s(row.numorden), fecha: s(row.fecha), proveedor: s(row.proveedor), data };
});
reg("getBorradorOCApp", "any", async (p, ctx) => borradorOC(p, ctx));
async function borradorOC(p: R, ctx: Ctx): Promise<R> {
  const fam = s(p.familia).toUpperCase();
  const cmap = await catMap(ctx);
  const inv = await FNS.getInventario({}, ctx, { uid: "x", rol: "admin", name: "x", short: "x", color: "", token: "" });
  const stock = new Map<string, number>();
  for (const it of ((inv as R).items as R[]) || []) stock.set(skuCode(s(it.sku)), n(it.stock));
  const ventas = new Map<string, number>();
  for (const t of await tickets(ctx)) {
    const f = ymdUtc(t.timestamp);
    if (!f) continue;
    const day = Number(f.slice(8, 10));
    const mes = f.slice(0, 7);
    const qn = s(p.quincena);
    const wantMes = s(p.anio) && s(p.mes) ? s(p.anio) + "-" + String(s(p.mes)).padStart(2, "0") : mes;
    if (!f.startsWith(wantMes)) continue;
    if (qn === "1" && day > 15) continue;
    if (qn === "2" && day < 16) continue;
    for (const pr of productQtys(t)) if (pr.sku.startsWith(fam)) ventas.set(pr.sku, (ventas.get(pr.sku) || 0) + pr.qty);
  }
  const lineas = [];
  for (const [code, r] of cmap) {
    if (!code.startsWith(fam) || !activoCat(r.activo)) continue;
    const vendido = ventas.get(code) || 0;
    lineas.push({
      sku: s(r.sku), nombre: s(r.producto_servicio), vendido, stock: stock.get(code) || 0,
      sugerido: Math.ceil(vendido * 1.2), compra: n(r.precio_compra),
    });
  }
  return { items: lineas, familia: fam };
}
reg("crearOCApp", ADMIN, async (p, ctx, ses) => guardarOC(p, ctx, ses, false));
reg("editarOCApp", ADMIN, async (p, ctx, ses) => guardarOC(p, ctx, ses, true));
async function guardarOC(p: R, ctx: Ctx, ses: Ses, edit: boolean): Promise<R> {
  const items = (p.items as unknown[]) || [];
  const fact = (p.fact as unknown[]) || [];
  const directa = (p.directa as unknown[]) || [];
  if (!items.length && !fact.length && !directa.length) return { error: "La orden no tiene contenido" };
  let num = s(p.numOrden);
  if (!edit) {
    const prev = await ctx.db.all("ordenes_compra");
    let max = 0;
    for (const r of prev) { const m = s(r.numorden).match(/(\d+)/); if (m) max = Math.max(max, Number(m[1])); }
    num = "OC-" + String(max + 1).padStart(4, "0");
    const sheet_row = await nextSheet(ctx.db, "ordenes_compra");
    await ctx.db.write(actorOf(ses), "ordenes_compra", "insert", {}, {
      sheet_row, numorden: num, fecha: ecuadorParts(ctx.now).isoWall, proveedor: s(p.proveedor),
      json: { items, fact, directa, stock: p.stock, qLabel: p.qLabel, prov: p.provData }, orig: { num },
    });
    for (const ln of (p.stock as R[]) || items as R[]) {
      if (!(n(ln.cant || ln.qty || ln.restock) > 0)) continue;
      const sr = await nextSheet(ctx.db, "inventario_entradas");
      await ctx.db.write(actorOf(ses), "inventario_entradas", "insert", {}, {
        sheet_row: sr, sku: s(ln.sku), producto: s(ln.nombre), proveedor: s(p.proveedor),
        cant_pedida: n(ln.cant || ln.qty || ln.restock), orden: num, notas: s(ln.notas),
        orig: { orden: num },
      });
    }
  } else {
    const row = (await ctx.db.all("ordenes_compra")).find((r) => s(r.numorden) === num);
    if (!row) return { error: "Orden no encontrada" };
    await ctx.db.write(actorOf(ses), "ordenes_compra", "update", { sheet_row: row.sheet_row }, {
      proveedor: s(p.proveedor), json: { items, fact, directa, stock: p.stock, qLabel: p.qLabel },
    });
  }
  return { ok: true, numOrden: num };
}
reg("ocEliminar", ADMIN, async (p, ctx, ses) => {
  const num = s(p.num);
  const ents = (await ctx.db.all("inventario_entradas")).filter((r) => s(r.orden) === num);
  if (ents.some((r) => s(r.cant_recibida_llenar_aqui) !== "" && n(r.cant_recibida_llenar_aqui) > 0)) return { error: "Hay líneas recibidas" };
  for (const e of ents) await ctx.db.write(actorOf(ses), "inventario_entradas", "delete", { sheet_row: e.sheet_row }, null);
  const oc = (await ctx.db.all("ordenes_compra")).find((r) => s(r.numorden) === num);
  if (oc) await ctx.db.write(actorOf(ses), "ordenes_compra", "delete", { sheet_row: oc.sheet_row }, null);
  return { ok: true };
});

reg("toggleActivoCatalogo", ADMIN, async (p, ctx, ses) => {
  const rows = await ctx.db.all("catalogo");
  const row = rows.find((r) => skuCode(r.sku) === skuCode(s(p.sku)));
  if (!row) return { error: "SKU no encontrado" };
  await ctx.db.write(actorOf(ses), "catalogo", "update", { sheet_row: row.sheet_row }, { activo: p.activo === false || p.activo === "NO" ? false : true });
  return { ok: true };
});
reg("editarProductoCatalogo", ADMIN, async (p, ctx, ses) => {
  const rows = await ctx.db.all("catalogo");
  const row = rows.find((r) => skuCode(r.sku) === skuCode(s(p.sku)));
  if (!row) return { error: "SKU no encontrado" };
  const sub = p.subtotal == null || p.subtotal === "" ? n(row.subtotal) : n(p.subtotal);
  const orig = { ...(row.orig && typeof row.orig === "object" ? row.orig as R : {}) };
  if (p.marca != null) orig.marca = s(p.marca);
  if (p.proveedor != null) orig.proveedor = s(p.proveedor);
  const patch: R = {
    producto_servicio: s(p.nombre) || s(row.producto_servicio), tipo: s(p.tipo) || s(row.tipo),
    subtotal: sub, iva: round2(sub * 0.15), total_con_iva: round2(sub * IVA),
    precio_compra: p.compra == null || p.compra === "" ? n(row.precio_compra) : n(p.compra),
    orig,
  };
  if (p.marca != null) patch.marca = s(p.marca);
  if (p.proveedor != null) patch.proveedor = s(p.proveedor);
  if (p.activo != null) patch.activo = p.activo === false || p.activo === "NO" || p.activo === "false" ? false : true;
  if (p.compraComision != null && p.compraComision !== "") {
    const comision = n(p.compraComision);
    patch.compra_comision = comision;
    patch.comi_producto_30 = round2(Math.max(0, sub - comision) * PCT_COMISION_PRODUCTO);
  }
  if (p.compraReal != null && p.compraReal !== "") {
    const bases = await ctx.db.all("inventario_base");
    const base = bases.find((b0) => skuCode(s(b0.sku)) === skuCode(s(row.sku)));
    const compraReal = n(p.compraReal);
    const comisionLinea = patch.comi_producto_30 != null ? n(patch.comi_producto_30) : round2(Math.max(0, sub - compraParaComision({ ...row, ...patch })) * PCT_COMISION_PRODUCTO);
    const uEdit = utilidadProducto(sub, compraReal > 0 ? compraReal : null, comisionLinea);
    patch.utilidad = uEdit.faltaCosto ? null : uEdit.utilidad;
    if (base) {
      const match = base.id != null && base.id !== "" ? { id: base.id } : base.sheet_row != null ? { sheet_row: base.sheet_row } : { sku: base.sku };
      await ctx.db.write(actorOf(ses), "inventario_base", "update", match, { compra: compraReal });
    } else {
      await ctx.db.write(actorOf(ses), "inventario_base", "insert", {}, { sku: s(row.sku), compra: compraReal, stock_inicial: 0 });
    }
  }
  await ctx.db.write(actorOf(ses), "catalogo", "update", { sheet_row: row.sheet_row }, patch);
  await logAccion(ctx.db, actorOf(ses), "EDITAR CATALOGO", skuCode(s(row.sku)));
  return { ok: true };
});
function skuNuevoCatalogo(raw: string): string | null {
  const code = skuCode(raw);
  if (/^[A-Z]{2,3}-\d{3}$/.test(code)) return "SUNSU-" + code;
  if (/^\d{1,3}$/.test(code)) return "SUNSU-" + String(Number(code)).padStart(2, "0");
  return null;
}
reg("crearProductoApp", ADMIN, async (p, ctx, ses) => {
  const sku = skuNuevoCatalogo(s(p.sku));
  if (!sku) return { error: "SKU FAM-### o SUNSU-NN" };
  const rows = await ctx.db.all("catalogo");
  if (rows.some((r) => skuCode(r.sku) === skuCode(sku))) return { error: "Ese SKU ya existe" };
  const sub = n(p.subtotal);
  const comisionCosto = p.compraComision == null || p.compraComision === "" ? n(p.compra) : n(p.compraComision);
  const real = n(p.compraReal);
  const sheet_row = await nextSheet(ctx.db, "catalogo");
  await ctx.db.write(actorOf(ses), "catalogo", "insert", {}, {
    sheet_row, sku, producto_servicio: s(p.nombre), tipo: s(p.tipo) || "PRODUCTO",
    subtotal: sub, iva: round2(sub * 0.15), total_con_iva: round2(sub * IVA),
    precio_compra: comisionCosto, compra_comision: comisionCosto,
    comi_producto_30: round2(Math.max(0, sub - comisionCosto) * PCT_COMISION_PRODUCTO),
    utilidad: utilidadProducto(sub, real > 0 ? real : null, round2(Math.max(0, sub - comisionCosto) * PCT_COMISION_PRODUCTO)).faltaCosto ? null : utilidadProducto(sub, real > 0 ? real : null, round2(Math.max(0, sub - comisionCosto) * PCT_COMISION_PRODUCTO)).utilidad,
    activo: true, orig: { sku },
  });
  await ctx.db.write(actorOf(ses), "inventario_base", "insert", {}, { sku, stock_inicial: 0, minimo: n(p.minimo), compra: real });
  return { ok: true, sku };
});
reg("eliminarProductoApp", ADMIN, async (p, ctx, ses) => {
  if (s(p.confirmacion) && s(p.confirmacion) !== s(p.sku)) return { error: "Confirmación no coincide" };
  const rows = await ctx.db.all("catalogo");
  const row = rows.find((r) => skuCode(r.sku) === skuCode(s(p.sku)));
  if (!row) return { error: "SKU no encontrado" };
  await ctx.db.write(actorOf(ses), "catalogo", "delete", { sheet_row: row.sheet_row }, null);
  return { ok: true, aviso: "El historial de cantidades en tickets no se borra." };
});

reg("guardarInvFisico", "any", async (p, ctx, ses) => {
  const conteos = (p.conteos as R[]) || [];
  const ec = ecuadorParts(ctx.now).isoWall;
  for (const c of conteos) {
    const sr = await nextSheet(ctx.db, "inventario_fisico");
    const dif = n(c.fisico) - n(c.sistema);
    await ctx.db.write(actorOf(ses), "inventario_fisico", "insert", {}, {
      sheet_row: sr, fecha: ec, usuario: ses.name, sku: s(c.sku), producto: s(c.nombre),
      stock_sistema: n(c.sistema), conteo_fisico: n(c.fisico), diferencia: dif, estado: dif === 0 ? "OK" : "DIF",
      orig: { sku: s(c.sku) },
    });
  }
  return { ok: true, n: conteos.length };
});
reg("getInvFisicoSesiones", "any", async (_p, ctx) => {
  const map = new Map<string, R>();
  for (const r of await ctx.db.all("inventario_fisico")) {
    const id = s(r.fecha).slice(0, 19);
    if (!id) continue;
    const s0 = map.get(id) || { id, fecha: id, usuario: s(r.usuario), total: 0, difs: 0, resueltas: 0, fechaCuadre: "" };
    s0.total = n(s0.total) + 1;
    if (n(r.diferencia) !== 0) {
      s0.difs = n(s0.difs) + 1;
      if (s(r.col_9) || s(r.estado) === "RESUELTO") s0.resueltas = n(s0.resueltas) + 1;
    }
    map.set(id, s0);
  }
  return { sesiones: [...map.values()].reverse() };
});
reg("getInvFisicoDetalle", "any", async (p, ctx) => {
  const id = s(p.id);
  const inv = await FNS.getInventario({}, ctx, { uid: "x", rol: "admin", name: "x", short: "x", color: "", token: "" }) as R;
  const stock = new Map<string, number>();
  for (const it of (inv.items as R[]) || []) stock.set(s(it.sku), n(it.stock));
  const lineas = (await ctx.db.all("inventario_fisico")).filter((r) => s(r.fecha).slice(0, 19) === id).map((r) => ({
    sku: s(r.sku), producto: s(r.producto), sistema: n(r.stock_sistema), fisico: n(r.conteo_fisico),
    diferencia: n(r.diferencia), stockAhora: stock.get(s(r.sku)) ?? stock.get("SUNSU-" + skuCode(s(r.sku))) ?? null,
    estado: s(r.estado), nota: s(r.col_10 || r.col_9),
  }));
  return { id, lineas };
});
reg("resolverInvFisico", "any", async (p, ctx, ses) => {
  if (!s(p.nota)) return { error: "La justificación es obligatoria" };
  const rows = (await ctx.db.all("inventario_fisico")).filter((r) => s(r.fecha).startsWith(s(p.id)) && skuCode(r.sku) === skuCode(s(p.sku)));
  const row = rows[0];
  if (!row) return { error: "Línea no encontrada" };
  const patch: R = { col_10: s(p.nota), estado: p.modo === "corregir" ? "CORREGIDO" : "RESUELTO", col_9: ecuadorParts(ctx.now).isoWall };
  if (p.modo === "corregir") patch.conteo_fisico = n(p.nuevoFisico);
  await ctx.db.write(actorOf(ses), "inventario_fisico", "update", { sheet_row: row.sheet_row }, patch);
  return { ok: true };
});
reg("getMovimientosSku", "any", async (p, ctx) => {
  const code = skuCode(s(p.sku));
  const dias = n(p.dias) || 60;
  const desde = addDays(hoy(ctx), -dias);
  const ventas = [];
  for (const t of await tickets(ctx)) {
    if (ymdUtc(t.timestamp) < desde) continue;
    const pr = productQtys(t).find((x) => x.sku === code);
    if (pr) ventas.push({ fecha: ymdUtc(t.timestamp), fila: t.sheet_row, nombre: s(t.nombre), qty: pr.qty });
  }
  const entradas = (await ctx.db.all("inventario_entradas")).filter((r) => skuCode(r.sku) === code).map((r) => ({
    fila: r.sheet_row, pedida: n(r.cant_pedida), recibida: n(r.cant_recibida_llenar_aqui), orden: s(r.orden), notas: s(r.notas),
  }));
  return { ventas, entradas };
});
reg("getRendimientoProductos", ADMIN, async (p, ctx) => {
  const modo = s(p.modo || "mes");
  const cmap = await catMap(ctx);
  const buckets = new Map<string, R>();
  for (const t of await tickets(ctx)) {
    const f = ymdUtc(t.timestamp);
    if (!f) continue;
    const key = modo === "ano" || modo === "año" ? f.slice(0, 4) : f.slice(0, 7);
    for (const pr of productQtys(t)) {
      const k = key + "|" + pr.sku;
      const cur = buckets.get(k) || { periodo: key, sku: pr.sku, nombre: catNombre(cmap, pr.sku), unidades: 0, venta: 0, costo: 0 };
      cur.unidades = n(cur.unidades) + pr.qty;
      cur.venta = n(cur.venta) + pr.qty * subtotalDe(cmap, pr.sku);
      cur.costo = n(cur.costo) + pr.qty * n(cmap.get(pr.sku)?.precio_compra);
      buckets.set(k, cur);
    }
  }
  const items = [...buckets.values()].map((r) => ({ ...r, margen: round2(n(r.venta) - n(r.costo)) }));
  return { items };
});

export function extend(name: string, roles: string[] | "any" | "public", fn: (p: R, ctx: Ctx, ses: Ses) => Promise<unknown>) {
  reg(name, roles, fn);
}
export { FNS };
