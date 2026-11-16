// Acciones del módulo Productos (estilo MineCore). Lectura: mcprod_list / mcprod_get.
// Escritura solo admin: mcprod_save (columnas de erp_productos, nunca catalogo ni la hoja),
// mcprod_foto y mcprod_nuevo. Cada cambio queda en audit_log por el trigger trg_audit.
import { extend, FNS } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, guardarArchivo } from "./lib.ts";
import { acceso, esAdmin, matrizDe } from "./permisos.ts";
import { facialSku, n, productQtys, round2, s, skuCode, type Row } from "./domain.ts";
import { runErp } from "./erp.ts";
import {
  CAMPOS_COSTO, FAMILIA_NUMERICA, GRUPO_NOMBRE, codigoNorm, familiasDe, prefijoNormal, siguienteCodigo, SUBS_CABINA, codigoCabina, estadoStock, limpiarCambios, lineasOcLegacy,
  marcaDe, preciosDe, stockDe, stockTotal, tipoDe, skuVisible,
} from "./productos.ts";

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
    costos: admin || acceso(ses.rol, "ver_costos", matriz) === "todos",
  };
}

const PRECIO_KEYS = ["beta_pvp", "beta_compra_real", "beta_compra_comision"];
const SIN_COSTO = ["compraReal", "compraComision", "utilidad", "margenPct", "beta_compra_real", "beta_compra_comision", "costo_promedio"];
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
}

async function cargarBase(ctx: Ctx, ses: Ses): Promise<Base> {
  const [productos, cat, cab, bodegas, stock, bases] = await Promise.all([
    safeAll(ctx, "erp_productos"), safeAll(ctx, "catalogo"), safeAll(ctx, "cabina_inventario"),
    safeAll(ctx, "erp_bodegas"), safeAll(ctx, "erp_stock"), safeAll(ctx, "inventario_base"),
  ]);
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
  return { productos, catalogo, cabina, bodegas, stock, ventaLegacy, compraBase, minimos };
}

function fila(p: Row, b: Base): Row {
  const code = skuCode(s(p.sku));
  const cat = b.catalogo.get(code);
  const cab = b.cabina.get(code);
  const { tipo, subtipo } = tipoDe(cat, p);
  const nombre = s(p.nombre) || s(cat?.producto_servicio) || s(cab?.producto) || code;
  const mk = marcaDe(p, cat, nombre);
  const precios = preciosDe(cat, p, b.compraBase.get(code) || 0);
  const stock = tipo === "servicio" ? [] : stockDe({
    ventaLegacy: b.ventaLegacy.has(code) ? b.ventaLegacy.get(code) : null, cab,
    erpStock: b.stock.filter((r) => s(r.producto_id) === s(p.id)), bodegas: b.bodegas,
  });
  const total = stockTotal(stock);
  const activo = p.activo !== false && (cat ? cat.activo !== false : true);
  const vis = skuVisible(code, tipo, cat);
  return {
    id: p.id, sku: code, skuVisible: vis.sku, skuAlias: vis.alias, nombre, tipo, subtipo,
    categoria: s(p.categoria) || (cat ? (subtipo === "Producto" ? "Producto" : subtipo) : (cab ? "Insumo cabina" : "")),
    linea: s(p.linea), marca: mk.marca, marcaDeducida: mk.deducida, activo,
    foto_thumb: s(p.foto_thumb), tieneFoto: !!s(p.foto_url),
    stock: tipo === "servicio" ? null : total,
    porGrupo: Object.fromEntries(stock.map((g) => [g.grupo, g.cantidad])),
    estado: tipo === "servicio" ? "servicio" : estadoStock(total, b.minimos.get(code) || 0),
    pvp: precios.pvp, comision: precios.comision,
    compraReal: precios.compraReal, compraComision: precios.compraComision, utilidad: precios.utilidad, margenPct: precios.margenPct,
    fuentes: [cat ? "catalogo" : "", cab ? "cabina" : "", "erp"].filter(Boolean),
    codigoCabina: cab ? s(cab.codigo) : "",
  };
}

extend("mcprod_list", "any", async (_p, ctx, ses) => {
  const pr = await permisos(ctx, ses);
  if (!pr.puede) return { error: "No tienes permiso" };
  const b = await cargarBase(ctx, ses);
  let items = b.productos.filter((p) => !/^AC-/.test(skuCode(s(p.sku)))).map((p) => fila(p, b));
  items.sort((x, y) => String(x.sku).localeCompare(String(y.sku)));
  if (!pr.costos) items = items.map(sinCostos);
  const uniq = (k: string) => [...new Set(items.map((i) => s(i[k])).filter(Boolean))].sort((a, c) => a.localeCompare(c));
  return {
    ok: true, items, admin: pr.admin, verCostos: pr.costos,
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
  const code = skuCode(s(prod.sku));
  const cat = b.catalogo.get(code);
  const cab = b.cabina.get(code);
  const base = fila(prod, b);
  const precios = preciosDe(cat, prod, b.compraBase.get(code) || 0);
  const stock = base.tipo === "servicio" ? [] : stockDe({
    ventaLegacy: b.ventaLegacy.has(code) ? b.ventaLegacy.get(code) : null, cab,
    erpStock: b.stock.filter((r) => s(r.producto_id) === s(prod.id)), bodegas: b.bodegas,
  });
  // Aperturas con destino (Cabina 1/2/3/Local) de la beta.
  const aperturas = (await safeAll(ctx, "erp_aperturas")).filter((a) => s(a.producto_id) === s(prod.id));
  const abiertos: Row = {};
  for (const a of aperturas) { const d = s(a.destino) || "SIN_DESTINO"; abiertos[d] = n(abiertos[d]) + (s(a.tipo) === "termino" ? -1 : 1); }

  // Historial: tickets, OC (beta y hoja) y cotizaciones a clientas.
  const hist: Row[] = [];
  const esServ = base.tipo === "servicio";
  for (const t of await safeAll(ctx, "tickets")) {
    if (t.borrado_at) continue;
    let qty = 0;
    if (!esServ) qty = productQtys(t).filter((x) => skuCode(x.sku) === code).reduce((a, x) => a + x.qty, 0);
    else {
      const f = facialSku(t.fac) || facialSku(t.facial_hecho);
      if (f && skuCode(f) === code) qty = 1;
    }
    if (qty > 0) hist.push({ tipo: "Ticket", fecha: s(t.timestamp).slice(0, 10), doc: s(t.beta_num) || s(t.so_num) || ("#" + s(t.sheet_row)), quien: s(t.atendido_por), cliente: [s(t.nombre), s(t.apellido)].filter(Boolean).join(" "), cantidad: qty });
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
  const kardex = (await safeAll(ctx, "erp_movimientos")).filter((m) => s(m.producto_id) === s(prod.id))
    .sort((x, y) => s(y.fecha).localeCompare(s(x.fecha))).slice(0, 200)
    .map((m) => ({ fecha: s(m.fecha), tipo: s(m.tipo), bodega: bodNom.get(s(m.bodega_id)) || "", sububicacion: s(m.sububicacion), delta: n(m.delta), saldo: n(m.saldo), doc: s(m.doc_tipo) + (s(m.doc_id) ? " " + s(m.doc_id).slice(0, 8) : ""), ticket: s(m.ticket_ref), actor: s(m.actor), nota: s(m.nota), costo_unit: n(m.costo_unit) }));
  let cambios: Row[] = [];
  try {
    const r = await ctx.db.rpc("erp_producto_cambios", { p_id: s(prod.id) });
    if (Array.isArray(r)) cambios = (r as Row[]).map((a) => ({ fecha: s(a.ts), actor: s(a.actor), accion: s(a.accion), cambios: limpiarAudit(a.cambios), motivo: s((a.despues as Row | undefined)?.beta_precio_motivo) }));
  } catch { /* 0039 sin aplicar */ }
  if (!pr.costos) {
    cambios = cambios.map((c) => {
      const ch = c.cambios && typeof c.cambios === "object" ? { ...(c.cambios as Row) } : c.cambios;
      if (ch && typeof ch === "object") for (const k of Object.keys(ch as Row)) if (CAMPOS_COSTO.has(k) || k === "costo_promedio") delete (ch as Row)[k];
      return { ...c, cambios: ch };
    }).filter((c) => !c.cambios || Object.keys(c.cambios as Row).length);
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
    ok: true, admin: pr.admin, verCostos: pr.costos,
    producto: {
      ...base, foto_data,
      sku_proveedor: s(prod.sku_proveedor), codigo_barras: s(prod.codigo_barras) || s(cab?.codigo_barras), unidad: s(prod.unidad) || s(cab?.unidad),
      observaciones: s(prod.observaciones), producto_base: s(prod.producto_base) || s(cab?.producto_base), bodega_def: s(prod.bodega_def), sububicacion_def: s(prod.sububicacion_def),
      uso: s(prod.uso), clase: s(prod.clase), beta_editado_por: s(prod.beta_editado_por), beta_editado_at: s(prod.beta_editado_at),
      nombre_catalogo: s(cat?.producto_servicio), sku_catalogo: s(cat?.sku), tipo_catalogo: s(cat?.tipo),
      cabina: cab ? { codigo: s(cab.codigo), contenido_envase: n(cab.contenido_envase), unidad: s(cab.unidad), abierto_restante: n(cab.abierto_restante), max_abiertos: n(cab.max_abiertos), ubicacion: s(cab.ubicacion), ubicacion_local: s(cab.ubicacion_local), ubicacion_abierto: s(cab.ubicacion_abierto), minimo_envases: n(cab.minimo_envases), costo_envase: n(cab.costo_envase) } : null,
    },
    precios: { ...precios, pvpCatalogo: n(cat?.total_con_iva), compraComisionCatalogo: cat ? (cat.compra_comision != null && cat.compra_comision !== "" ? n(cat.compra_comision) : n(cat.precio_compra)) : null, compraRealSistema: b.compraBase.get(code) || null, beta_pvp: prod.beta_pvp ?? null, beta_compra_real: prod.beta_compra_real ?? null, beta_compra_comision: prod.beta_compra_comision ?? null },
    stock, subsCabina: SUBS_CABINA, abiertos,
    proveedores: [...provAgg.values()], historial: hist.slice(0, 150), kardex, cambios, preciosHist,
  };
  if (!pr.costos) {
    out = sinCostos(out);
    out.producto = sinCostos(out.producto as Row);
    if (out.producto && (out.producto as Row).cabina) delete ((out.producto as Row).cabina as Row).costo_envase;
    out.proveedores = (out.proveedores as Row[]).map((x) => { const y = { ...x }; delete y.ultimoPrecio; return y; });
    out.historial = (out.historial as Row[]).map((x) => { const y = { ...x }; delete y.precio; return y; });
    out.preciosHist = (out.preciosHist as Row[]).filter((x) => x.campo === "pvp");
    out.kardex = (out.kardex as Row[]).map((x) => { const y = { ...x }; delete y.costo_unit; return y; });
    const pz = { ...(out.precios as Row) }; delete pz.compraComisionCatalogo; delete pz.compraRealSistema; out.precios = pz;
  }
  return out;
});

extend("mcprod_save", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita productos" };
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
  row.beta_editado_por = actorOf(ses);
  row.beta_editado_at = ctx.now.toISOString();
  const saved = await ctx.db.write(actorOf(ses), "erp_productos", "update", { id }, row);
  if (!saved) return { error: "Producto no encontrado" };
  return { ok: true, id };
});

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
  return { ok: true, admin: pr.admin, familias: fams };
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
