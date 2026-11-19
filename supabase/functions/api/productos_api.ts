// Acciones del módulo Productos (estilo MineCore). Lectura: mcprod_list / mcprod_get.
// Escritura solo admin: mcprod_save (columnas de erp_productos, nunca catalogo ni la hoja),
// mcprod_foto y mcprod_nuevo. Cada cambio queda en audit_log por el trigger trg_audit.
import { extend, FNS } from "./handlers.ts";
import { SOLICITUD_HOOKS } from "./inline_api.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, guardarArchivo } from "./lib.ts";
import { acceso, esAdmin, esSuperAdmin, matrizDe } from "./permisos.ts";
import { facialSku, n, productQtys, round2, s, skuCode, type Row } from "./domain.ts";
import { runErp } from "./erp.ts";
import {
  CAMPOS_COSTO, FAMILIA_NUMERICA, GRUPO_NOMBRE, codigoNorm, familiasDe, prefijoNormal, siguienteCodigo, SUBS_CABINA, codigoCabina, estadoStock, limpiarCambios, lineasOcLegacy,
  marcaDe, preciosDe, stockDe, stockTotal, porEstanteDe, tipoDe, skuVisible, lineasTicket, precioLineaTicket, aplicarMovimientos,
  arr, codigoBarrasNorm, ean13Valido, limpiarCodigos, limpiarEscalas, limpiarProveedores, precioEscala, type CodigoBarras,
  autoMinimos, deducirDelNombre, faltantesDe, BOD_CONSIG,
} from "./productos.ts";
import { consultar } from "./query.ts";

/** Del diff del audit_log quita lo que no se muestra (miniatura base64, sellos de edición). */
function limpiarAudit(v: unknown): Row | null {
  if (!v || typeof v !== "object") return null;
  const o: Row = {};
  for (const [k, x] of Object.entries(v as Row)) {
    if (k === "foto_thumb" || k === "beta_editado_at" || k === "beta_editado_por" || k === "beta_precio_motivo" || k === "updated_at") continue;
    o[k] = x;
  }
  return Object.keys(o).length ? o : null;
}

async function safeAll(ctx: Ctx, t: string): Promise<Row[]> {
  try { return await ctx.db.all(t); } catch { return []; }
}

async function permisos(ctx: Ctx, ses: Ses) {
  const matriz = await matrizDe(ctx.db);
  const admin = esAdmin(ses.rol);
  return {
    puede: admin || acceso(ses.rol, "productos", matriz) !== "no",
    admin,
    costos: esSuperAdmin(ses.rol),
    puedeDescargar: admin || acceso(ses.rol, "descargas", matriz) !== "no",
  };
}

const PRECIO_KEYS = ["beta_pvp", "beta_compra_real", "beta_compra_comision"];
const SIN_COSTO = ["compraReal", "compraComision", "utilidad", "margenPct", "comision", "beta_compra_real", "beta_compra_comision", "costo_promedio", "faltaCosto", "falta_costo", "costo_real", "costoReal", "sinCosto", "compra", "precio_compra", "utilidadProd", "cogs", "ganancia", "compraRealSistema", "compraComisionCatalogo"];
function sinCostos<T extends Row>(o: T): T {
  const x: Row = { ...o };
  for (const k of SIN_COSTO) delete x[k];
  if (x.precios && typeof x.precios === "object") {
    const p: Row = { ...(x.precios as Row) };
    for (const k of SIN_COSTO) delete p[k];
    x.precios = p;
  }
  return x as T;
}

interface Base {
  productos: Row[]; catalogo: Map<string, Row>; cabina: Map<string, Row>; bodegas: Row[]; stock: Row[];
  ventaLegacy: Map<string, number>; compraBase: Map<string, number>; minimos: Map<string, number>;
  antes?: Map<string, string[]>;
  movs?: Map<string, Row[]>;
  salidas90?: Map<string, number>; aperturas90?: Map<string, number>; revision?: Map<string, unknown>;
  consigVendido?: Map<string, number>;
}

async function cargarBase(ctx: Ctx, ses: Ses): Promise<Base> {
  const [productos, cat, cab, bodegas, stock, bases] = await Promise.all([
    safeAll(ctx, "erp_productos"), safeAll(ctx, "catalogo"), safeAll(ctx, "cabina_inventario"),
    safeAll(ctx, "erp_bodegas"), safeAll(ctx, "erp_stock"), safeAll(ctx, "inventario_base"),
  ]);
  // Códigos anteriores (0043 beta_sku_alias, ej. SUNSU-INV-000002 → INV-002): solo para buscar y mostrar.
  const antes = new Map<string, string[]>();
  for (const a of await safeAll(ctx, "beta_sku_alias")) {
    const k = skuCode(s(a.sku)); const v = s(a.alias).toUpperCase();
    if (k && v && v !== k) antes.set(k, [...(antes.get(k) || []), v]);
  }
  const catalogo = new Map<string, Row>();
  for (const r of cat) { const c = skuCode(s(r.sku)); if (c) catalogo.set(c, r); }
  const cabina = new Map<string, Row>();
  for (const k of cab) { const c = codigoCabina(k); if (c && !cabina.has(c)) cabina.set(c, k); }
  const ventaLegacy = new Map<string, number>();
  const compraBase = new Map<string, number>();
  // Stock de venta igual al del sistema viejo (corte + tickets + entradas). preview: no escribe inventario_base.
  try {
    const t = await FNS.getCatalogoTabla({ preview: true }, ctx, ses) as Row;
    for (const it of (t.items as Row[]) || []) {
      const c = skuCode(s(it.sku));
      const l = it.lugares as Row | undefined;
      if (l && l.venta != null) ventaLegacy.set(c, n(l.venta));
      if (n(it.compraReal) > 0) compraBase.set(c, n(it.compraReal));
    }
  } catch { /* sin el cálculo viejo se usa erp_stock VENTA */ }
  const minimos = new Map<string, number>();
  for (const b of bases) minimos.set(skuCode(s(b.sku)), n(b.minimo));
  // TK49 (Emilia t495u, recodificación BV): el código nuevo hereda lo que la hoja guarda con el código viejo
  // (catálogo, cabina_inventario, stock/compra del sistema viejo, mínimos). La hoja no se toca.
  for (const [nuevo, viejos] of antes) for (const v of viejos) {
    const o = skuCode(v);
    if (!o || o === nuevo) continue;
    for (const M of [catalogo, cabina, ventaLegacy, compraBase, minimos] as Map<string, unknown>[]) if (!M.has(nuevo) && M.has(o)) M.set(nuevo, M.get(o));
  }
  // Movimientos de la beta (transferencias / ajustes, 0046): se suman al stock del sistema.
  const movs = new Map<string, Row[]>();
  for (const m of await safeAll(ctx, "beta_stock_movimientos")) { const k = s(m.producto_id); movs.set(k, [...(movs.get(k) || []), m]); }
  // TK18b: salidas de 90 días (tickets + envases abiertos) para mínimo/reorden automáticos, y «Por revisar».
  const desde = new Date(ctx.now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  const salidas90 = new Map<string, number>(), aperturas90 = new Map<string, number>(), revision = new Map<string, unknown>();
  for (const t of await safeAll(ctx, "tickets")) {
    if (t.borrado_at || s(t.timestamp).slice(0, 10) < desde) continue;
    for (const x of productQtys(t)) { const c = skuCode(x.sku); salidas90.set(c, (salidas90.get(c) || 0) + x.qty); }
  }
  for (const a of await safeAll(ctx, "beta_aperturas")) {
    if (a.anulada === true || s(a.abierto_at).slice(0, 10) < desde) continue;
    aperturas90.set(s(a.producto_id), (aperturas90.get(s(a.producto_id)) || 0) + 1);
  }
  for (const r of await safeAll(ctx, "beta_v_producto_revision")) revision.set(s(r.producto), r.faltantes);
  // TK27: ventas (y sus anulaciones) que salieron de la bodega CONSIGNACION, por producto.
  const consigVendido = new Map<string, number>();
  if (bodegas.some((b) => s(b.id) === BOD_CONSIG)) {
    let mv: Row[] = [];
    try { mv = (await consultar(ctx.db, "erp_movimientos", { cols: ["producto_id", "delta", "tipo"], filtros: [{ col: "bodega_id", op: "eq", val: BOD_CONSIG }] })).rows; } catch { mv = []; }
    for (const m of mv) if (s(m.tipo) === "venta" || s(m.tipo) === "anulacion") consigVendido.set(s(m.producto_id), (consigVendido.get(s(m.producto_id)) || 0) - n(m.delta));
  }
  return { productos, catalogo, cabina, bodegas, stock, ventaLegacy, compraBase, minimos, antes, movs, salidas90, aperturas90, revision, consigVendido };
}

function fila(p: Row, b: Base): Row {
  const code = skuCode(s(p.sku));
  const cat = b.catalogo.get(code);
  const cab = b.cabina.get(code);
  const { tipo, subtipo } = tipoDe(cat, p);
  const nombre = s(p.nombre) || s(cat?.producto_servicio) || s(cab?.producto) || code;
  const mk = marcaDe(p, cat, nombre);
  const precios = preciosDe(cat, p, b.compraBase.get(code) || 0);
  const stock = tipo === "servicio" ? [] : aplicarMovimientos(stockDe({
    ventaLegacy: b.ventaLegacy.has(code) ? b.ventaLegacy.get(code) : null, cab,
    erpStock: b.stock.filter((r) => s(r.producto_id) === s(p.id)), bodegas: b.bodegas,
    consigVendido: b.consigVendido?.get(s(p.id)) || 0,
  }), b.movs?.get(s(p.id)) || []);
  const total = stockTotal(stock);
  const archivado = !!s(p.beta_archivado_at);
  // Estado: si un admin lo fijó en la beta (beta_activo) manda eso; si no, el del sistema viejo
  // (erp_productos.activo, catálogo de la hoja y Cabina con activo = NO). Archivado siempre es inactivo.
  const viejo = p.activo !== false && (cat ? cat.activo !== false : true) && !(cab && /^no$/i.test(s(cab.activo)));
  const fijado = p.beta_activo === true || p.beta_activo === false;
  const activo = (fijado ? p.beta_activo === true : viejo) && !archivado;
  const salidas90 = tipo === "servicio" ? 0 : (b.salidas90?.get(code) || 0) + (b.aperturas90?.get(s(p.id)) || 0);
  const auto = autoMinimos(salidas90);
  const minimo = p.beta_stock_minimo != null && p.beta_stock_minimo !== "" ? n(p.beta_stock_minimo) : (b.minimos.get(code) || auto.minimo || 0);
  const reorden = p.beta_punto_reorden != null && p.beta_punto_reorden !== "" ? n(p.beta_punto_reorden) : auto.reorden;
  const revisar = tipo === "servicio" || !b.revision ? [] : faltantesDe(b.revision.get(s(p.id)), s(p.uso), auto.reorden != null);
  const vis = skuVisible(code, tipo, cat);
  return {
    id: p.id, sku: code, skuVisible: vis.sku, skuAlias: vis.alias, skuAntes: b.antes?.get(code) || [], nombre, tipo, subtipo,
    categoria: s(p.categoria) || (cat ? (subtipo === "Producto" ? "Producto" : subtipo) : (cab ? "Insumo cabina" : "")),
    linea: s(p.linea), marca: mk.marca, marcaDeducida: mk.deducida, activo, activoViejo: viejo, activoFijado: fijado,
    foto_thumb: s(p.foto_thumb), tieneFoto: !!s(p.foto_url),
    stock: tipo === "servicio" ? null : total,
    porGrupo: Object.fromEntries(stock.map((g) => [g.grupo, g.cantidad])),
    // TK27: de dónde sale lo que se muestra (hoja/sistema viejo o kardex), para el conteo inicial de consignación.
    stockFuente: { venta: b.ventaLegacy.has(code) ? "hoja" : "erp", cabina: cab ? "hoja" : "erp" },
    porSubCabina: Object.fromEntries((stock.find((g) => g.grupo === "CABINA")?.subs || []).map((x) => [x.codigo || "SIN", x.cantidad])),
    porEstante: tipo === "servicio" ? {} : porEstanteDe({ erpStock: b.stock.filter((r) => s(r.producto_id) === s(p.id)), bodegas: b.bodegas, movs: b.movs?.get(s(p.id)) || [] }),
    estado: tipo === "servicio" ? "servicio" : estadoStock(total, Math.max(minimo, reorden || 0)),
    archivado, eliminado: !!s(p.beta_eliminado_at), minimo, reorden,
    minimoAuto: auto.minimo, reordenAuto: auto.reorden, salidas90, revisar,
    pvp: precios.pvp, pvpSinIva: precios.subtotal, comision: precios.comision,
    compraReal: precios.compraReal, compraComision: precios.compraComision, utilidad: precios.utilidad, margenPct: precios.margenPct, faltaCosto: precios.faltaCosto,
    fuentes: [cat ? "catalogo" : "", cab ? "cabina" : "", "erp"].filter(Boolean),
    codigoCabina: cab ? s(cab.codigo) : "",
    // Para el buscador: SKU proveedor y códigos de barras.
    skuProveedor: s(p.sku_proveedor),
    // Incluye el código de la hoja de cabina (cabina_inventario) si el producto aún no tiene uno propio.
    barras: [...new Set([s(p.codigo_barras).replace(/\.0$/, ""), ...arr(p.beta_codigos).map((x) => s((x as Row).codigo)), s(p.codigo_barras) || arr(p.beta_codigos).length ? "" : s(cab?.codigo_barras).replace(/\.0+$/, "")].filter(Boolean))],
  };
}

/** Lista de productos de la beta (misma fila que Productos) para otros módulos: conteo, transferencias, ajustes. */
export async function listaProductos(ctx: Ctx, ses: Ses): Promise<Row[]> {
  const b = await cargarBase(ctx, ses);
  return b.productos.filter((p) => !/^AC-/.test(skuCode(s(p.sku))) && !s(p.beta_eliminado_at)).map((p) => fila(p, b));
}

extend("mcprod_list", "any", async (p0, ctx, ses) => {
  const pr = await permisos(ctx, ses);
  if (!pr.puede) return { error: "No tienes permiso" };
  const b = await cargarBase(ctx, ses);
  const todos = b.productos.filter((p) => !/^AC-/.test(skuCode(s(p.sku))));
  const eliminados = todos.filter((p) => s(p.beta_eliminado_at)).length;
  // Eliminados (borrado suave) no salen; solo un admin los ve para restaurarlos.
  const verElim = pr.admin && p0.eliminados === true;
  let items = todos.filter((p) => verElim ? !!s(p.beta_eliminado_at) : !s(p.beta_eliminado_at)).map((p) => fila(p, b));
  items.sort((x, y) => String(x.sku).localeCompare(String(y.sku)));
  if (!pr.costos) items = items.map(sinCostos);
  const uniq = (k: string) => [...new Set(items.map((i) => s(i[k])).filter(Boolean))].sort((a, c) => a.localeCompare(c));
  return {
    ok: true, items, admin: pr.admin, verCostos: pr.costos, puedeDescargar: !!pr.puedeDescargar, eliminados: pr.admin ? eliminados : 0,
    filtros: { marcas: uniq("marca"), categorias: uniq("categoria"), bodegas: Object.entries(GRUPO_NOMBRE).filter(([k]) => k !== "OTRA").map(([k, v]) => ({ id: k, nombre: v })) },
  };
});

extend("mcprod_get", "any", async (p, ctx, ses) => {
  const pr = await permisos(ctx, ses);
  if (!pr.puede) return { error: "No tienes permiso" };
  const b = await cargarBase(ctx, ses);
  const want = s(p.id);
  const code0 = skuCode(s(p.sku));
  const prod = b.productos.find((x) => s(x.id) === want) || b.productos.find((x) => skuCode(s(x.sku)) === code0);
  if (!prod) return { error: "Producto no encontrado" };
  if (s(prod.beta_eliminado_at) && !pr.admin) return { error: "Producto no encontrado" };
  const code = skuCode(s(prod.sku));
  const cat = b.catalogo.get(code);
  const cab = b.cabina.get(code);
  const base = fila(prod, b);
  const precios = preciosDe(cat, prod, b.compraBase.get(code) || 0);
  const stock = base.tipo === "servicio" ? [] : aplicarMovimientos(stockDe({
    ventaLegacy: b.ventaLegacy.has(code) ? b.ventaLegacy.get(code) : null, cab,
    erpStock: b.stock.filter((r) => s(r.producto_id) === s(prod.id)), bodegas: b.bodegas,
  }), b.movs?.get(s(prod.id)) || []);
  // Aperturas con destino (Cabina 1/2/3/Local) de la beta.
  const aperturas = (await safeAll(ctx, "erp_aperturas")).filter((a) => s(a.producto_id) === s(prod.id));
  const abiertos: Row = {};
  for (const a of aperturas) { const d = s(a.destino) || "SIN_DESTINO"; abiertos[d] = n(abiertos[d]) + (s(a.tipo) === "termino" ? -1 : 1); }

  // Historial: tickets, OC (beta y hoja) y cotizaciones a clientas.
  const hist: Row[] = [];
  const esServ = base.tipo === "servicio";
  const cat0 = cat;
  const pvpDe = (c: string): number => {
    const r = b.catalogo.get(skuCode(c)) || b.catalogo.get(c);
    if (!r) return 0;
    const tot = n(r.total_con_iva), sub = n(r.subtotal);
    return tot > 0 ? tot : sub > 0 ? round2(sub * 1.15) : 0;
  };
  for (const t of await safeAll(ctx, "tickets")) {
    if (t.borrado_at) continue;
    let qty = 0;
    if (!esServ) qty = productQtys(t).filter((x) => skuCode(x.sku) === code).reduce((a, x) => a + x.qty, 0);
    else {
      const f = facialSku(t.fac) || facialSku(t.facial_hecho);
      if (f && skuCode(f) === code) qty = 1;
    }
    if (qty > 0) {
      // Precio por línea (Emilia 17/11): la hoja no guarda precio por línea. Si el ticket tiene una sola
      // línea, lo cobrado es real (total ÷ cantidad); si tiene varias, se prorratea por precio de lista
      // y se marca «estimado». Facial usado de paquete = $0 en ese ticket.
      const pv = preciosDe(cat0, prod, 0);
      const lineas = lineasTicket(t, pvpDe);
      const est = n(t.estimado);
      const pl = precioLineaTicket(lineas, lineas.some((l) => l.codigo === code) ? code : "", est);
      const cobrado = pl.unit;
      hist.push({
        tipo: "Ticket", fecha: s(t.timestamp).slice(0, 10), doc: s(t.beta_num) || s(t.so_num) || ("#" + s(t.sheet_row)), quien: s(t.atendido_por), cliente: [s(t.nombre), s(t.apellido)].filter(Boolean).join(" "), cantidad: qty,
        pvpLista: pv.pvp > 0 ? pv.pvp : null, sinIvaLista: pv.subtotal > 0 ? pv.subtotal : null,
        cobrado, cobradoSinIva: cobrado != null ? round2(cobrado / 1.15) : null, totalLinea: pl.total, estimado: pl.estimado,
        descuento: cobrado != null && pv.pvp > 0 && pv.pvp - cobrado > 0.009 ? round2(pv.pvp - cobrado) : null,
        lineasTicket: lineas.length,
      });
    }
  }
  const ocs = await safeAll(ctx, "erp_oc");
  const ocById = new Map(ocs.map((o) => [s(o.id), o]));
  const provs = await safeAll(ctx, "erp_proveedores");
  const provById = new Map(provs.map((x) => [s(x.id), x]));
  const provAgg = new Map<string, Row>();
  const addProv = (nombre: string, fecha: string, precio: number, qty: number) => {
    if (!nombre) return;
    const r = provAgg.get(nombre) || { proveedor: nombre, ultimaFecha: "", ultimoPrecio: 0, compras: 0, unidades: 0 };
    r.compras = n(r.compras) + 1; r.unidades = n(r.unidades) + qty;
    if (fecha >= s(r.ultimaFecha)) { r.ultimaFecha = fecha; if (precio) r.ultimoPrecio = precio; }
    provAgg.set(nombre, r);
  };
  for (const l of (await safeAll(ctx, "erp_oc_lineas")).filter((x) => s(x.producto_id) === s(prod.id))) {
    const o = ocById.get(s(l.oc_id));
    if (!o || s(o.estado) === "anulada") continue;
    const prov = s(provById.get(s(o.proveedor_id))?.nombre);
    hist.push({ tipo: "OC beta", fecha: s(o.fecha).slice(0, 10), doc: s(o.numero), quien: prov, cliente: "", cantidad: n(l.cantidad), precio: n(l.precio), estado: s(o.estado) });
    addProv(prov, s(o.fecha).slice(0, 10), n(l.precio), n(l.cantidad));
  }
  for (const o of await safeAll(ctx, "ordenes_compra")) {
    const ls = lineasOcLegacy(o.json, code);
    if (!ls.length) continue;
    let prov = s(o.proveedor);
    try { const j = typeof o.json === "string" ? JSON.parse(o.json) : o.json; prov = prov || s((j as Row)?.prov && ((j as Row).prov as Row).nombre); } catch { /* json libre */ }
    const qty = ls.reduce((a, x) => a + x.qty, 0);
    const precio = ls.find((x) => x.precio)?.precio || 0;
    hist.push({ tipo: "OC", fecha: s(o.fecha).slice(0, 10), doc: s(o.numorden), quien: prov, cliente: "", cantidad: qty, precio });
    addProv(prov, s(o.fecha).slice(0, 10), precio, qty);
  }
  for (const c of await safeAll(ctx, "cotizaciones")) {
    const ls = lineasOcLegacy(c.items, code);
    if (!ls.length) continue;
    hist.push({ tipo: "Cotización", fecha: s(c.fecha).slice(0, 10), doc: s(c.numero), quien: s(c.creado_por), cliente: s(c.cliente), cantidad: ls.reduce((a, x) => a + x.qty, 0), estado: s(c.estado) });
  }
  hist.sort((x, y) => s(y.fecha).localeCompare(s(x.fecha)));
  const catProv = s(cat?.proveedor) || s((cat?.orig as Row | undefined)?.proveedor);
  if (catProv && !provAgg.has(catProv)) provAgg.set(catProv, { proveedor: catProv, ultimaFecha: "", ultimoPrecio: 0, compras: 0, unidades: 0, nota: "del catálogo" });
  if (cab && s(cab.proveedor) && !provAgg.has(s(cab.proveedor))) provAgg.set(s(cab.proveedor), { proveedor: s(cab.proveedor), ultimaFecha: "", ultimoPrecio: n(cab.costo_envase), compras: 0, unidades: 0, nota: "de Cabina" });

  // Movimientos: kardex beta + cambios de la ficha (audit_log).
  const bodNom = new Map(b.bodegas.map((x) => [s(x.id), s(x.nombre)]));
  const kardex: Row[] = (await safeAll(ctx, "erp_movimientos")).filter((m) => s(m.producto_id) === s(prod.id))
    .sort((x, y) => s(y.fecha).localeCompare(s(x.fecha))).slice(0, 200)
    .map((m) => ({ fecha: s(m.fecha), tipo: s(m.tipo), bodega: bodNom.get(s(m.bodega_id)) || "", sububicacion: s(m.sububicacion), delta: n(m.delta), saldo: n(m.saldo), doc: s(m.doc_tipo) + (s(m.doc_id) ? " " + s(m.doc_id).slice(0, 8) : ""), ticket: s(m.ticket_ref), actor: s(m.actor), nota: s(m.nota), costo_unit: n(m.costo_unit) }));
  // Movimientos de la beta (transferencias / ajustes) también en el kardex de la ficha.
  for (const m of b.movs?.get(s(prod.id)) || []) {
    kardex.push({ fecha: s(m.fecha), tipo: s(m.tipo), bodega: GRUPO_NOMBRE[s(m.bodega) as keyof typeof GRUPO_NOMBRE] || s(m.bodega), sububicacion: s(m.sububicacion), delta: n(m.delta), saldo: null, doc: s(m.doc_numero), ticket: "", actor: s(m.actor), nota: s(m.nota), costo_unit: 0, beta: true });
  }
  kardex.sort((x, y) => s(y.fecha).localeCompare(s(x.fecha)));
  let cambios: Row[] = [];
  try {
    const r = await ctx.db.rpc("erp_producto_cambios", { p_id: s(prod.id) });
    if (Array.isArray(r)) cambios = (r as Row[]).map((a) => ({ fecha: s(a.ts), actor: s(a.actor), accion: s(a.accion), cambios: limpiarAudit(a.cambios), motivo: s((a.despues as Row | undefined)?.beta_precio_motivo), motivoEstado: s((a.despues as Row | undefined)?.beta_activo_motivo) }));
  } catch { /* 0039 sin aplicar */ }
  if (!pr.costos) {
    cambios = cambios.map((c) => {
      const ch = c.cambios && typeof c.cambios === "object" ? { ...(c.cambios as Row) } : c.cambios;
      if (ch && typeof ch === "object") for (const k of Object.keys(ch as Row)) if (CAMPOS_COSTO.has(k) || k === "costo_promedio") delete (ch as Row)[k];
      return { ...c, cambios: ch };
    }).filter((c) => !c.cambios || Object.keys(c.cambios as Row).length);
  }

  const estadoHist: Row[] = [];
  for (const c of cambios) {
    const ch = c.cambios && typeof c.cambios === "object" ? c.cambios as Row : {};
    const d = (ch.beta_activo ?? ch.activo) as Row | undefined;
    if (!d || typeof d !== "object") continue;
    estadoHist.push({ fecha: c.fecha, actor: c.actor, antes: d.antes ?? null, despues: d.despues ?? null, motivo: s(c.motivoEstado) });
  }
  const preciosHist: Row[] = [];
  for (const c of cambios) {
    const ch = c.cambios && typeof c.cambios === "object" ? c.cambios as Row : {};
    for (const k of PRECIO_KEYS) {
      if (!(k in ch)) continue;
      const d = ch[k] as Row;
      preciosHist.push({ fecha: c.fecha, actor: c.actor, campo: k.replace("beta_", ""), antes: d?.antes ?? null, despues: d?.despues ?? null, motivo: s(c.motivo) });
    }
  }

  let foto_data = "";
  const foto = s(prod.foto_url);
  if (foto.startsWith("archivo:")) {
    const arch = (await safeAll(ctx, "app_archivos")).find((r) => s(r.id) === foto.slice(8));
    if (arch && s(arch.data_b64)) foto_data = "data:" + (s(arch.mime) || "image/jpeg") + ";base64," + s(arch.data_b64);
  } else if (foto.startsWith("data:") || foto.startsWith("http")) foto_data = foto;

  let out: Row = {
    ok: true, admin: pr.admin, verCostos: pr.costos, puedePedir: !pr.admin,
    producto: {
      ...base, foto_data,
      sku_proveedor: s(prod.sku_proveedor), codigo_barras: s(prod.codigo_barras) || s(cab?.codigo_barras), unidad: s(prod.unidad) || s(cab?.unidad),
      observaciones: s(prod.observaciones), producto_base: s(prod.producto_base) || s(cab?.producto_base), bodega_def: s(prod.bodega_def), sububicacion_def: s(prod.sububicacion_def),
      uso: s(prod.uso), clase: s(prod.clase), beta_editado_por: s(prod.beta_editado_por), beta_editado_at: s(prod.beta_editado_at),
      beta_contenido: prod.beta_contenido ?? null, beta_contenido_unidad: s(prod.beta_contenido_unidad), beta_envase: s(prod.beta_envase), beta_unidades_empaque: prod.beta_unidades_empaque ?? null,
      nombre_catalogo: s(cat?.producto_servicio), sku_catalogo: s(cat?.sku), tipo_catalogo: s(cat?.tipo),
      cabina: cab ? { codigo: s(cab.codigo), contenido_envase: n(cab.contenido_envase), unidad: s(cab.unidad), abierto_restante: n(cab.abierto_restante), max_abiertos: n(cab.max_abiertos), ubicacion: s(cab.ubicacion), ubicacion_local: s(cab.ubicacion_local), ubicacion_abierto: s(cab.ubicacion_abierto), minimo_envases: n(cab.minimo_envases), costo_envase: n(cab.costo_envase) } : null,
    },
    precios: { ...precios, pvpCatalogo: n(cat?.total_con_iva), compraComisionCatalogo: cat ? (cat.compra_comision != null && cat.compra_comision !== "" ? n(cat.compra_comision) : n(cat.precio_compra)) : null, compraRealSistema: b.compraBase.get(code) || null, beta_pvp: prod.beta_pvp ?? null, beta_compra_real: prod.beta_compra_real ?? null, beta_compra_comision: prod.beta_compra_comision ?? null },
    stock, subsCabina: SUBS_CABINA, abiertos,
    proveedores: [...provAgg.values()], historial: hist.slice(0, 150), kardex, cambios, preciosHist, estadoHist,
    ...(await extrasFicha(ctx, prod, base, cat, cab, hist, precios)),
  };
  if (!pr.costos) {
    out = sinCostos(out);
    out.producto = sinCostos(out.producto as Row);
    if (out.producto && (out.producto as Row).cabina) delete ((out.producto as Row).cabina as Row).costo_envase;
    out.proveedores = (out.proveedores as Row[]).map((x) => { const y = { ...x }; delete y.ultimoPrecio; return y; });
    out.historial = (out.historial as Row[]).map((x) => { const y = { ...x }; delete y.precio; return y; });
    out.preciosHist = (out.preciosHist as Row[]).filter((x) => x.campo === "pvp");
    out.kardex = (out.kardex as Row[]).map((x) => { const y = { ...x }; delete y.costo_unit; return y; });
    out.provProducto = (out.provProducto as Row[] || []).map((x) => { const y = { ...x }; delete y.precio; return y; });
    delete out.costoPromedio; delete out.costoProm;
    out.escalas = (out.escalas as Row[] || []).map((x) => { const y = { ...x }; delete y.markup; if (y.precio == null) delete y.precio; return y; });
    const pz = { ...(out.precios as Row) }; delete pz.compraComisionCatalogo; delete pz.compraRealSistema; delete pz.comision; out.precios = pz;
  }
  out.puedeDescargar = !!pr.puedeDescargar;
  if (!pr.admin) out = limpioStaffFicha(out);
  return out;
});


/** El personal ve precio de venta (con/sin IVA), stock, último consumo y en qué protocolo va. Nada de costos, compras ni descargas. */
function limpioStaffFicha(out: Row): Row {
  const tickets = ((out.historial as Row[]) || []).filter((h) => s(h.tipo) === "Ticket");
  const u = tickets[0];
  const uso = u
    ? { fecha: u.fecha, tipo: u.tipo, doc: u.doc, quien: u.quien, cliente: u.cliente, cantidad: u.cantidad }
    : null;
  const pz = { ...(out.precios as Row) };
  for (const k of ["comision", "compraComisionCatalogo", "compraRealSistema", "compraReal", "compraComision", "utilidad", "margenPct", "beta_compra_real", "beta_compra_comision"]) delete pz[k];
  return {
    ...out,
    historial: uso ? [uso] : [],
    ultimoUso: uso,
    proveedores: [],
    kardex: [],
    cambios: [],
    preciosHist: [],
    estadoHist: [],
    provProducto: [],
    precios: pz,
    puedeDescargar: false,
  };
}

extend("mcprod_save", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin guarda directo: envía una solicitud" };
  return await guardarProducto(ctx, ses, p, "");
});

const ETQ_PROD: Record<string, string> = {
  nombre: "Nombre", marca: "Marca", categoria: "Categoría", linea: "Línea", unidad: "Unidad", codigo_barras: "Código de barras", sku_proveedor: "SKU proveedor",
  observaciones: "Observaciones", producto_base: "Producto base", bodega_def: "Bodega", sububicacion_def: "Sububicación", beta_descripcion: "Descripción",
  beta_stock_minimo: "Stock mínimo", beta_punto_reorden: "Punto de reorden", beta_contenido: "Contenido", beta_contenido_unidad: "Unidad de contenido",
  beta_envase: "Envase", beta_unidades_empaque: "Unidades por empaque", activo: "Activo", beta_pvp: "PVP", beta_compra_real: "Compra real", beta_compra_comision: "Compra para comisión",
};
// Personal (TK59): pide el cambio o la eliminación de un producto; una admin lo aprueba en Solicitudes.
SOLICITUD_HOOKS["producto_beta"] = {
  fila: async (ctx, ses, fila) => {
    const pr = await permisos(ctx, ses);
    if (!pr.puede) return { error: "No tienes permiso" };
    const prod = (await safeAll(ctx, "erp_productos")).find((x) => s(x.id) === fila);
    if (!prod || s(prod.beta_eliminado_at)) return { error: "Producto no encontrado" };
    const antes: Row = { _campos: ETQ_PROD };
    for (const k of Object.keys(ETQ_PROD)) if (!PRECIO_KEYS.includes(k) || pr.costos) antes[k] = prod[k] ?? "";
    return { row: prod, antes, etiqueta: "Producto " + s(prod.sku) + " · " + s(prod.nombre), enlace: "#/m/productos/p/" + encodeURIComponent(fila) };
  },
  aplicar: async (ctx, ses, fila, propuestos, sol) =>
    await guardarProducto(ctx, ses, { id: fila, cambios: propuestos, motivo: s(sol?.motivo) }, sol ? "solicitud de " + s(sol.solicitante) + " aprobada" : "solicitud aprobada"),
  borrar: async (ctx, ses, fila, _motivo, sol) => {
    const now = ctx.now.toISOString();
    const saved = await ctx.db.write(actorOf(ses), "erp_productos", "update", { id: fila }, { beta_eliminado_at: now, beta_eliminado_por: actorOf(ses) + (sol ? " (solicitud de " + s(sol.solicitante) + ")" : "") });
    return saved ? { ok: true } : { error: "Producto no encontrado" };
  },
};

async function guardarProducto(ctx: Ctx, ses: Ses, p: Row, via: string): Promise<Row> {
  const id = s(p.id);
  if (!id) return { error: "Falta el producto" };
  const { row, error } = limpiarCambios((p.cambios || {}) as Row);
  if (error) return { error };
  if (!Object.keys(row).length) return { ok: true, sinCambios: true };
  // Como MineCore (b516 costo_manual): cambiar precio o costo pide motivo y queda en el historial.
  if (PRECIO_KEYS.some((k) => k in row)) {
    const motivo = s(p.motivo).trim();
    if (motivo.length < 3) return { error: "El motivo es obligatorio para cambiar precio o costo" };
    row.beta_precio_motivo = motivo.slice(0, 300);
  }
  // Código de barras de fábrica (tecleado o escaneado): único entre productos.
  if ("codigo_barras" in row && row.codigo_barras != null && s(row.codigo_barras) !== "") {
    const c = codigoBarrasNorm(row.codigo_barras);
    if (!/^\d{6,14}$|^[A-Z0-9-]{4,30}$/i.test(c)) return { error: "Código de barras inválido" };
    for (const o of await safeAll(ctx, "erp_productos")) {
      if (s(o.id) === id || s(o.beta_eliminado_at)) continue;
      if (codigoBarrasNorm(o.codigo_barras) === c || arr(o.beta_codigos).some((x) => codigoBarrasNorm((x as Row).codigo) === c)) return { error: "El código " + c + " ya lo tiene " + (s(o.sku) || "otro producto") + " · " + s(o.nombre) };
    }
    row.codigo_barras = c;
  }
  row.beta_editado_por = actorOf(ses) + (via ? " (" + via + ")" : "");
  row.beta_editado_at = ctx.now.toISOString();
  const saved = await ctx.db.write(actorOf(ses), "erp_productos", "update", { id }, row);
  if (!saved) return { error: "Producto no encontrado" };
  return { ok: true, id };
}

extend("mcprod_foto", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin cambia fotos" };
  const pid = s(p.id);
  const raw = s(p.foto_b64);
  if (!pid || !raw) return { error: "Falta la foto" };
  const dataUrl = raw.startsWith("data:") ? raw : "data:image/jpeg;base64," + raw;
  const aid = await guardarArchivo(ctx.db, actorOf(ses), "foto-producto", s(p.nombre) || "foto.jpg", dataUrl);
  if (!aid) return { error: "La foto es demasiado grande o no se pudo leer" };
  const thumb = s(p.thumb_b64);
  const patch: Row = { foto_url: "archivo:" + aid };
  if (thumb.startsWith("data:image/") && thumb.length < 60000) patch.foto_thumb = thumb;
  const saved = await ctx.db.write(actorOf(ses), "erp_productos", "update", { id: pid }, patch);
  if (!saved) return { error: "Producto no encontrado" };
  // Copia en Storage (bucket privado "productos"). Si falla, la ficha usa app_archivos.
  const base = s(ctx.env.SUPABASE_URL).replace(/\/$/, "");
  const key = s(ctx.env.SUPABASE_SERVICE_ROLE_KEY);
  const b64 = dataUrl.slice(dataUrl.indexOf("base64,") + 7);
  if (base && key && b64) {
    try {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await ctx.fetchImpl(`${base}/storage/v1/object/productos/${encodeURIComponent(pid + "/" + aid)}`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/octet-stream", "x-upsert": "true" },
        body: bytes as unknown as BodyInit,
      });
    } catch { /* queda en app_archivos */ }
  }
  return { ok: true, id: pid, foto_url: patch.foto_url };
});

/** Lo nuevo de la ficha (0041): descripción, mínimos, escalas, proveedores, códigos, archivos, protocolo. */
/** Presentaciones enlazadas (0044) en las dos direcciones, con su contenido para comparar. */
async function presentacionesDe(ctx: Ctx, prod: Row): Promise<Row[]> {
  const todos = await safeAll(ctx, "erp_productos");
  const mias = new Set(arr(prod.beta_presentaciones).map((x) => s(x)));
  return todos.filter((x) => s(x.id) !== s(prod.id) && !s(x.beta_eliminado_at) && (mias.has(s(x.id)) || arr(x.beta_presentaciones).map((y) => s(y)).includes(s(prod.id))))
    .map((x) => ({ id: s(x.id), sku: skuCode(s(x.sku)), nombre: s(x.nombre), contenido: x.beta_contenido ?? null, unidad: s(x.beta_contenido_unidad), envase: s(x.beta_envase), propia: mias.has(s(x.id)) }));
}
async function extrasFicha(ctx: Ctx, prod: Row, base: Row, cat: Row | undefined, cab: Row | undefined, hist: Row[], precios: { compraReal?: number | null }): Promise<Row> {
  const code = skuCode(s(prod.sku));
  // Costo promedio ponderado de las compras (OC beta y de la hoja) + el de la ficha si existe.
  let q = 0, v = 0;
  for (const h of hist) if (/^OC/.test(s(h.tipo)) && n(h.precio) > 0 && n(h.cantidad) > 0) { q += n(h.cantidad); v += n(h.cantidad) * n(h.precio); }
  const costoProm = q > 0 ? round2(v / q) : null;
  const costoPromedio = prod.costo_promedio != null && prod.costo_promedio !== "" ? n(prod.costo_promedio) : null;
  const costo = n(precios.compraReal) || costoProm || 0;
  const escalas = limpiarEscalas(arr(prod.beta_escalas)).escalas.map((e) => ({ ...e, pvp: precioEscala(e, costo) }));
  const legado = codigoBarrasNorm(prod.codigo_barras) || codigoBarrasNorm(cab?.codigo_barras);
  const codigos = limpiarCodigos(arr(prod.beta_codigos)).codigos;
  if (legado && !codigos.some((c) => c.codigo === legado)) codigos.unshift({ codigo: legado, tipo: ean13Valido(legado) ? "ean13" : "otro", principal: !codigos.length, legado: true } as CodigoBarras);
  const archivos = arr(prod.beta_archivos).filter((a) => !a.borrado).map((a) => ({ id: s(a.id), nombre: s(a.nombre), mime: s(a.mime), tipo: s(a.tipo) || "archivo", at: s(a.at), por: s(a.por), principal: s(prod.foto_url) === "archivo:" + s(a.id) }));
  // Protocolo (servicios) o «Se usa en» (insumos y productos).
  let protos: Row[], pasos: Row[];
  let beta: Row[] | null = null;
  try { beta = (await ctx.db.all("beta_protocolos")).filter((r) => !s(r.borrado_at)); } catch { beta = null; }
  if (beta && beta.length) {
    // Protocolos de la beta (0042): mismos campos que Cabina para lo de abajo.
    protos = beta.map((r) => ({ sku: s(r.sku), facial: s(r.nombre), version: n(r.version), vigente: r.vigente !== false ? "SI" : "NO", mano_de_obra: r.mano_de_obra }));
    pasos = beta.flatMap((r) => arr(r.pasos).map((x) => ({ ...x, sku: s(r.sku), version: 1 })));
  } else {
    [protos, pasos] = await Promise.all([safeAll(ctx, "cabina_protocolos"), safeAll(ctx, "cabina_protocolo_pasos")]);
  }
  const visible = s(base.skuVisible) || code;
  const nombreProto = new Map(protos.map((x) => [s(x.sku).toUpperCase(), s(x.facial)]));
  let protocolo: Row | null = null;
  const seUsaEn: Row[] = [];
  if (base.tipo === "servicio") {
    const pr = protos.find((x) => s(x.sku).toUpperCase() === visible.toUpperCase());
    const ps = pasos.filter((x) => s(x.sku).toUpperCase() === visible.toUpperCase());
    const ver = Math.max(0, ...ps.map((x) => n(x.version)));
    if (pr || ps.length) protocolo = {
      sku: visible, nombre: s(pr?.facial), version: n(pr?.version), vigente: s(pr?.vigente), manoDeObra: n(pr?.mano_de_obra),
      pasos: ps.filter((x) => n(x.version) === ver).sort((a, b) => n(a.paso) - n(b.paso)).map((x) => ({ paso: n(x.paso), descripcion: s(x.descripcion), producto: s(x.producto_cod), cantidad: n(x.cantidad), unidad: s(x.unidad), minutos: n(x.minutos) })),
    };
  } else {
    const mios = new Set([code, s(cab?.codigo).toUpperCase()].filter(Boolean));
    const agg = new Map<string, Row>();
    for (const x of pasos) {
      if (!mios.has(s(x.producto_cod).toUpperCase())) continue;
      const k = s(x.sku).toUpperCase();
      const r = agg.get(k) || { sku: k, nombre: nombreProto.get(k) || "", pasos: 0, cantidad: 0, unidad: s(x.unidad) };
      r.pasos = n(r.pasos) + 1; r.cantidad = round2(n(r.cantidad) + n(x.cantidad));
      agg.set(k, r);
    }
    seUsaEn.push(...[...agg.values()].sort((a, b) => s(a.sku).localeCompare(s(b.sku))));
  }
  return {
    descripcion: s(prod.beta_descripcion),
    minimos: { minimo: prod.beta_stock_minimo ?? null, reorden: prod.beta_punto_reorden ?? null, minimoSistema: base.minimo, minimoAuto: base.minimoAuto, reordenAuto: base.reordenAuto, salidas90: base.salidas90 },
    revisar: base.revisar, sugeridos: deducirDelNombre(s(prod.nombre) || s(base.nombre)),
    archivado: !!s(prod.beta_archivado_at), archivadoPor: s(prod.beta_archivado_por), archivadoAt: s(prod.beta_archivado_at),
    eliminado: !!s(prod.beta_eliminado_at), eliminadoPor: s(prod.beta_eliminado_por),
    costoProm, costoPromedio, escalas, provProducto: arr(prod.beta_proveedores),
    codigos, archivos, protocolo, seUsaEn,
    presentaciones: await presentacionesDe(ctx, prod),
    proveedoresCat: (await safeAll(ctx, "erp_proveedores")).filter((x) => x.activo !== false).map((x) => ({ id: s(x.id), nombre: s(x.nombre) })),
  };
}

/** Todos los códigos que ya existen: erp_productos + catalogo + cabina_inventario. */
async function codigosExistentes(ctx: Ctx): Promise<{ codigo: string; clase: string }[]> {
  const [erp, cat, cab] = await Promise.all([safeAll(ctx, "erp_productos"), safeAll(ctx, "catalogo"), safeAll(ctx, "cabina_inventario")]);
  const out: { codigo: string; clase: string }[] = [];
  const claseDe = new Map<string, string>();
  for (const r of erp) { const c = codigoNorm(r.sku); if (c) { claseDe.set(c, s(r.clase) || "producto"); out.push({ codigo: c, clase: s(r.clase) || "producto" }); } }
  for (const r of cat) { const c = codigoNorm(r.sku); if (c) out.push({ codigo: c, clase: claseDe.get(c) || "catalogo" }); }
  for (const r of cab) {
    for (const v of [r.codigo, r.sku_catalogo]) { const c = codigoNorm(v); if (c) out.push({ codigo: c, clase: claseDe.get(c) || "insumo cabina" }); }
  }
  return out;
}

extend("mcprod_familias", "any", async (_p, ctx, ses) => {
  const pr = await permisos(ctx, ses);
  if (!pr.puede) return { error: "Productos no está en tu menú" };
  const fams = familiasDe(await codigosExistentes(ctx));
  const b = await cargarBase(ctx, ses);
  const items = b.productos.filter((p) => !/^AC-/.test(skuCode(s(p.sku))) && !s(p.beta_eliminado_at)).map((p) => fila(p, b));
  const uniq = (k: string) => [...new Set(items.map((i) => s(i[k])).filter(Boolean))].sort((a, c) => a.localeCompare(c, "es"));
  return { ok: true, admin: pr.admin, familias: fams, marcas: uniq("marca"), categorias: uniq("categoria") };
});

extend("mcprod_nuevo", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin crea productos" };
  // El SKU lo asigna el servidor dentro de la familia elegida; nunca se toma el que mande la pantalla
  // ni se reescribe uno que ya existe.
  const pedido = s(p.familia);
  const prefijo = prefijoNormal(pedido);
  if (!prefijo) return { error: "Elige una familia de SKU (por ejemplo ML- o la serie numérica)" };
  const existentes = await codigosExistentes(ctx);
  const fams = familiasDe(existentes);
  const fam = fams.find((f) => f.prefijo === prefijo);
  if (!fam && !p.familia_nueva) return { error: "Esa familia no existe. Márcala como familia nueva para crearla." };
  if (fam && p.familia_nueva) return { error: "La familia " + prefijo + " ya existe" };
  const codigos = existentes.map((x) => x.codigo);
  const sku = siguienteCodigo(prefijo, codigos, fam ? fam.ancho : prefijo === FAMILIA_NUMERICA ? 2 : 3);
  if (new Set(codigos).has(codigoNorm(sku))) return { error: "El código " + sku + " ya existe; vuelve a intentar" };
  const tipo = s(p.tipo) === "servicio" ? "servicio" : "producto";
  const uso = s(p.uso) || (tipo === "servicio" ? "cabina" : "venta");
  if (!s(p.nombre)) return { error: "El nombre es obligatorio" };
  const out = await runErp("prod_save", {
    sku, nombre: s(p.nombre), marca: s(p.marca), categoria: s(p.categoria), clase: tipo,
    unidad: s(p.unidad) || "u", uso, _rol: ses.rol,
  }, ctx.db, actorOf(ses), ctx.now);
  if (out.error) return out;
  if (p.pvp != null && p.pvp !== "") await ctx.db.write(actorOf(ses), "erp_productos", "update", { id: s(out.id) }, { beta_pvp: round2(n(p.pvp)), beta_editado_por: actorOf(ses), beta_editado_at: ctx.now.toISOString() });
  return { ok: true, id: out.id, sku, familia: prefijo };
});
