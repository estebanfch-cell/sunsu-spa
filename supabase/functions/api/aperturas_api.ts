// 📦 Abrir producto (Emilia 17/11): buscar producto (código, nombre, código de barras o cámara) → destino
// Cabina 1/2/3 o Local → firma con el dedo → se guarda quién y cuándo, y sale 1 unidad de esa bodega
// (movimiento consumo_cabina en el kardex). Abrir el siguiente del mismo producto en el mismo destino
// cierra el anterior. Con eso: faciales por envase, uso y costo por facial («protocolo automático»).
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin, matrizDe, verCostos } from "./permisos.ts";
import { n, normNombre, round2, s, skuCode, type Row } from "./domain.ts";
import { consultar } from "./query.ts";
import { runErp, usoCompatible } from "./erp.ts";
import { facialesHechos, productoAProtocolos } from "./protocolo_auto.ts";
import { aPared, DESTINOS, nombreDestino, promedioProducto, rendimiento } from "./aperturas_beta.ts";
import { consigEfectiva, famDe, famsConsig } from "./consig_config.ts";
import { familiaDeFila, quincenaActual } from "./ventas.ts";
import { hojaProveedores } from "./compras_flujo.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : typeof v === "string" && v.trim().startsWith("[") ? (() => { try { return JSON.parse(v as string); } catch { return []; } })() : [];
async function costos(ctx: Ctx, ses: Ses): Promise<boolean> { return esAdmin(ses.rol) || verCostos(ses.rol, await matrizDe(ctx.db)); }

async function bodegas(ctx: Ctx): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const b of await todas(ctx, "erp_bodegas")) m.set(s(b.codigo).toUpperCase(), s(b.id));
  return m;
}
/** De qué bodega sale la unidad: la del destino si el uso del producto lo permite; si no, la que le corresponde
 * (un producto de venta abierto en cabina sale de Venta; uno de cabina abierto en el local sale de Cabina 1). */
async function bodegaSalida(ctx: Ctx, prod: Row, destino: string): Promise<{ id: string; codigo: string } | null> {
  const L = await todas(ctx, "erp_bodegas");
  const por = (c: string) => L.find((b) => s(b.codigo).toUpperCase() === c);
  const uso = s(prod.uso) || "venta";
  const d = por(destino);
  if (d && usoCompatible(uso, s(d.tipo))) return { id: s(d.id), codigo: destino };
  const alt = uso === "cabina" ? por("CABINA") : por("VENTA");
  return alt && usoCompatible(uso, s(alt.tipo)) ? { id: s(alt.id), codigo: s(alt.codigo).toUpperCase() } : null;
}
/** TK44 (Emilia t489u): un producto en 🤝 consignación (proveedor ON y el producto no apagado) que se abre
 * sale de la bodega Consignación (o de Venta, donde sigue el stock viejo de consignación) y queda como consumo
 * interno a costo en erp_consignacion_consumo → entra a la liquidación del proveedor (Compras › Consignación,
 * columna «Consumido») como una unidad vendida. Sin comisión: no es un ticket. Si ya estaba en la cabina
 * (se pasó por transferencia, que ya lo registró como consumo), sale de la cabina y no se cuenta dos veces. */
export interface Salida { id: string; codigo: string; consig: boolean }
async function salidaDe(ctx: Ctx, prod: Row, destino: string, on: Set<string>, st: Map<string, number>): Promise<Salida | null> {
  const base = await bodegaSalida(ctx, prod, destino);
  if (!consigEfectiva(prod, on)) return base ? { ...base, consig: false } : null;
  const L = await todas(ctx, "erp_bodegas");
  const por = (c: string) => L.find((b) => s(b.codigo).toUpperCase() === c);
  const tipoBase = base ? s(por(base.codigo)?.tipo) : "";
  if (base && tipoBase === "cabina" && (st.get(base.id) || 0) > 0) return { ...base, consig: false };
  const cons = L.find((b) => s(b.codigo).toUpperCase() === "CONSIGNACION" || s(b.tipo) === "consignacion");
  if (cons && (st.get(s(cons.id)) || 0) > 0) return { id: s(cons.id), codigo: "CONSIGNACION", consig: true };
  const ven = por("VENTA");
  return ven ? { id: s(ven.id), codigo: "VENTA", consig: true } : base ? { ...base, consig: false } : null;
}
const nombreSalida = (c: string) => c === "CONSIGNACION" ? "Consignación" : nombreDestino(c);
async function proveedorDe(ctx: Ctx, prod: Row): Promise<string> {
  const fam = famDe(s(prod.sku));
  if (!fam) return "";
  try {
    const hoja = await hojaProveedores(ctx.db);
    const p = (await todas(ctx, "erp_proveedores")).find((x) => x.activo !== false && s(familiaDeFila(x, hoja)).toUpperCase() === fam);
    return p ? s(p.nombre) : "";
  } catch { return ""; }
}
async function facialesCatalogo(ctx: Ctx): Promise<{ code: string; nombre: string }[]> {
  return (await todas(ctx, "catalogo")).filter((c) => /^FACIAL/i.test(s(c.tipo)) && s(c.sku))
    .map((c) => ({ code: s(c.sku).toUpperCase(), nombre: s(c.producto_servicio).replace(/\s+/g, " ").trim() }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}
function costoUnit(p: Row): number { return n(p.costo_promedio) > 0 ? n(p.costo_promedio) : n(p.beta_compra_real); }
function presentacionDe(p: Row): string {
  const c = n(p.beta_contenido), u = s(p.beta_contenido_unidad), e = s(p.beta_envase);
  return [e, c > 0 ? c + (u ? " " + u : "") : ""].filter(Boolean).join(" ") || "";
}
function codigosBase(p: Row): string[] {
  return [s(p.sku), skuCode(s(p.sku)), s(p.codigo_barras), s(p.sku_proveedor), ...arr(p.beta_codigos).map((x) => typeof x === "object" && x ? s((x as Row).codigo ?? (x as Row).valor) : s(x))].filter(Boolean);
}
async function stockDe(ctx: Ctx, pid: string): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  try { for (const x of (await consultar(ctx.db, "erp_movimientos", { cols: ["bodega_id", "delta"], filtros: [{ col: "producto_id", op: "eq", val: pid }] })).rows) m.set(s(x.bodega_id), (m.get(s(x.bodega_id)) || 0) + n(x.delta)); } catch { /* sin kardex */ }
  return m;
}

extend("ap_opciones", "any", async (_p, ctx) => {
  return { ok: true, destinos: DESTINOS, faciales: await facialesCatalogo(ctx) };
});

extend("ap_buscar", "any", async (p, ctx) => {
  const q = normNombre(s(p.q)), code = s(p.q).trim().toUpperCase();
  if (q.length < 2) return { ok: true, items: [] };
  // TK49: el código viejo (beta_sku_alias, ej. INV-098 → BV-002) también encuentra el producto.
  const viejos = new Map<string, string[]>();
  for (const al of await todas(ctx, "beta_sku_alias")) { const k = skuCode(s(al.sku)); viejos.set(k, [...(viejos.get(k) || []), s(al.alias)]); }
  const codigosDe = (x: Row) => [...codigosBase(x), ...(viejos.get(skuCode(s(x.sku))) || [])];
  const prods = (await todas(ctx, "erp_productos")).filter((x) => !s(x.beta_eliminado_at) && !s(x.beta_archivado_at) && x.activo !== false && (s(x.clase) || "producto") === "producto");
  const exact = prods.filter((x) => codigosDe(x).some((c) => c.toUpperCase() === code || skuCode(c) === skuCode(code)));
  const words = q.split(/\s+/);
  const porTexto = prods.filter((x) => { const t = normNombre(s(x.nombre) + " " + s(x.marca) + " " + codigosDe(x).join(" ")); return words.every((w) => t.includes(w)); });
  const L = [...new Map([...exact, ...porTexto].map((x) => [s(x.id), x])).values()].slice(0, 20);
  return { ok: true, exacto: exact.length === 1 ? s(exact[0].id) : "", items: L.map((x) => ({ id: s(x.id), sku: skuCode(s(x.sku)), nombre: s(x.nombre), marca: s(x.marca), presentacion: presentacionDe(x), foto: s(x.foto_thumb) || (s(x.foto_url).startsWith("http") ? s(x.foto_url) : "") })) };
});

/** Producto elegido: stock en cada destino y el envase abierto ahora en cada uno. */
extend("ap_producto", "any", async (p, ctx) => {
  const pid = s(p.producto_id);
  const prod = (await todas(ctx, "erp_productos")).find((x) => s(x.id) === pid);
  if (!prod) return { error: "Producto no encontrado" };
  const B = await bodegas(ctx), st = await stockDe(ctx, pid), on = await famsConsig(ctx);
  const salidas = new Map<string, Salida | null>();
  for (const d of DESTINOS) salidas.set(d.codigo, await salidaDe(ctx, prod, d.codigo, on, st));
  const enConsig = consigEfectiva(prod, on);
  const abiertas = (await consultar(ctx.db, "beta_aperturas", { filtros: [{ col: "producto_id", op: "eq", val: pid }, { col: "cerrado_at", op: "is_null" }, { col: "anulada", op: "not_true" }] }).catch(() => ({ rows: [] as Row[] }))).rows;
  return {
    ok: true, producto: { id: pid, sku: skuCode(s(prod.sku)), nombre: s(prod.nombre), presentacion: presentacionDe(prod), aplica: arr(prod.beta_aplica_faciales).map(s), consignacion: enConsig, proveedor: enConsig ? await proveedorDe(ctx, prod) : "" },
    destinos: DESTINOS.map((d) => {
      const ab = abiertas.filter((a) => s(a.destino) === d.codigo).sort((a, b) => s(b.abierto_at).localeCompare(s(a.abierto_at)))[0];
      const sal = salidas.get(d.codigo);
      return { ...d, saleDe: sal && sal.codigo !== d.codigo ? nombreSalida(sal.codigo) : "", consig: !!(sal && sal.consig), stock: round2(st.get((sal && sal.id) || B.get(d.codigo) || "") || 0), abierto: ab ? { id: s(ab.id), desde: s(ab.abierto_at), usuario: s(ab.usuario) } : null };
    }),
  };
});

extend("ap_abrir", "any", async (p, ctx, ses) => {
  const pid = s(p.producto_id), destino = s(p.destino).toUpperCase(), firma = s(p.firma);
  if (!DESTINOS.some((d) => d.codigo === destino)) return { error: "Elige el destino: Cabina 1, 2, 3 o Local" };
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(firma) || firma.length < 200) return { error: "Falta la firma" };
  if (firma.length > 400000) return { error: "La firma es demasiado grande" };
  const prod = (await todas(ctx, "erp_productos")).find((x) => s(x.id) === pid);
  if (!prod) return { error: "Producto no encontrado" };
  const on = await famsConsig(ctx);
  const sal = await salidaDe(ctx, prod, destino, on, await stockDe(ctx, pid));
  if (!sal) return { error: "No encontré de qué bodega sacar " + s(prod.nombre) };
  const bodega = sal.id;
  const id = crypto.randomUUID(), ahora = ctx.now.toISOString(), actor = actorOf(ses), quien = s(ses.name) || actor;
  // Envase anterior del mismo producto en el mismo destino → se cierra con esta apertura.
  const previas = (await consultar(ctx.db, "beta_aperturas", { filtros: [{ col: "producto_id", op: "eq", val: pid }, { col: "destino", op: "eq", val: destino }, { col: "cerrado_at", op: "is_null" }, { col: "anulada", op: "not_true" }] }).catch(() => ({ rows: [] as Row[] }))).rows;
  // 1) Stock: sale 1 unidad de la bodega del destino.
  const mov = { producto_id: pid, bodega_id: bodega, delta: -1, tipo: "consumo_cabina", doc_tipo: "apertura", doc_id: id, nota: "Abrir producto · " + nombreDestino(destino) + (sal.codigo !== destino ? " (sale de " + nombreSalida(sal.codigo) + ")" : "") + (sal.consig ? " · 🤝 consignación" : "") + " · " + quien, legacy_ref: "apertura:" + id };
  const out = await runErp("stock_delta", { moves: [mov], aprobar_negativo: true }, ctx.db, actor, ctx.now);
  if (out.error) return { error: "No se pudo descontar el stock: " + s(out.error) };
  // 1b) TK44: de consignación → consumo interno a costo para la liquidación del proveedor.
  if (sal.consig) {
    const q = quincenaActual(ctx.now);
    await ctx.db.write(actor, "erp_consignacion_consumo", "insert", {}, {
      id: crypto.randomUUID(), transferencia_id: null, producto_id: pid, sku: skuCode(s(prod.sku)), cantidad: 1, costo_unit: round2(costoUnit(prod)),
      quincena_ini: q.ini, quincena_fin: q.fin, familia: famDe(s(prod.sku)), bodega_id: bodega, creado_por: quien, fecha: ahora,
      nota: "Abrir producto · " + nombreDestino(destino) + " · apertura:" + id,
    });
  }
  // 2) La apertura.
  await ctx.db.write(actor, "beta_aperturas", "insert", {}, {
    id, producto_id: pid, sku: skuCode(s(prod.sku)), nombre: s(prod.nombre), presentacion: s(p.presentacion) || presentacionDe(prod),
    contenido: n(prod.beta_contenido) || null, contenido_unidad: s(prod.beta_contenido_unidad) || null, costo: costoUnit(prod) || null,
    destino, bodega_id: bodega, abierto_at: ahora, usuario: quien, firma_url: firma, mov_ref: "apertura:" + id, nota: s(p.nota).slice(0, 300) || null,
  });
  for (const a of previas) await ctx.db.write(actor, "beta_aperturas", "update", { id: s(a.id) }, { cerrado_at: ahora, cerrado_por_apertura_id: id });
  await logAccion(ctx.db, actor, "ABRIR PRODUCTO", `${skuCode(s(prod.sku))} ${s(prod.nombre)} · ${nombreDestino(destino)}${sal.consig ? " · 🤝 consignación" : ""}${previas.length ? " · cierra " + previas.length + " anterior" : ""} · ${id}`);
  return { ok: true, id, destino: nombreDestino(destino), saleDe: nombreSalida(sal.codigo), consignacion: sal.consig, cerradas: previas.map((a) => s(a.id)) };
});

/** Admin: anular una apertura por error → vuelve la unidad y se reabre el envase que había cerrado. */
extend("ap_anular", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  const id = s(p.id), motivo = s(p.motivo).trim().slice(0, 300);
  if (!motivo) return { error: "Escribe el motivo" };
  const a = (await consultar(ctx.db, "beta_aperturas", { filtros: [{ col: "id", op: "eq", val: id }] })).rows[0];
  if (!a) return { error: "No encontré esa apertura" };
  if (a.anulada === true) return { error: "Ya está anulada" };
  const actor = actorOf(ses);
  const out = await runErp("stock_delta", { moves: [{ producto_id: s(a.producto_id), bodega_id: s(a.bodega_id), delta: 1, tipo: "anulacion", doc_tipo: "apertura", doc_id: id, nota: "Anular apertura: " + motivo, legacy_ref: "apertura-anular:" + id }], aprobar_negativo: true }, ctx.db, actor, ctx.now);
  if (out.error) return { error: "No se pudo devolver el stock: " + s(out.error) };
  // TK44: si salió de consignación, el consumo se compensa (−1 en el mismo periodo); no se borra nada.
  const cons = (await todas(ctx, "erp_consignacion_consumo")).filter((c) => s(c.nota).endsWith("apertura:" + id));
  const neto = cons.reduce((x, c) => x + n(c.cantidad), 0);
  if (cons.length && neto > 0) {
    const c0 = cons[0];
    await ctx.db.write(actor, "erp_consignacion_consumo", "insert", {}, { ...c0, id: crypto.randomUUID(), cantidad: -neto, creado_por: s(ses.name) || actor, fecha: ctx.now.toISOString(), nota: "Anulada (" + motivo.slice(0, 80) + ") · apertura:" + id });
  }
  await ctx.db.write(actor, "beta_aperturas", "update", { id }, { anulada: true, anulada_motivo: motivo, anulada_por: s(ses.name) || actor });
  const reab = (await consultar(ctx.db, "beta_aperturas", { filtros: [{ col: "cerrado_por_apertura_id", op: "eq", val: id }] }).catch(() => ({ rows: [] as Row[] }))).rows;
  for (const r of reab) await ctx.db.write(actor, "beta_aperturas", "update", { id: s(r.id) }, { cerrado_at: null, cerrado_por_apertura_id: null });
  await logAccion(ctx.db, actor, "ABRIR PRODUCTO ANULAR", `${s(a.sku)} ${s(a.nombre)} · ${nombreDestino(s(a.destino))} · ${motivo} · ${id}`);
  return { ok: true, reabiertas: reab.length };
});

/** Ficha de producto: a qué faciales aplica. */
extend("ap_aplica_get", "any", async (p, ctx) => {
  const prod = (await todas(ctx, "erp_productos")).find((x) => s(x.id) === s(p.producto_id));
  if (!prod) return { error: "Producto no encontrado" };
  return { ok: true, aplica: arr(prod.beta_aplica_faciales).map(s), faciales: await facialesCatalogo(ctx) };
});
extend("ap_aplica_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  const pid = s(p.producto_id);
  const validos = new Set((await facialesCatalogo(ctx)).map((f) => f.code));
  const L = [...new Set(arr(p.faciales).map((x) => s(x).toUpperCase()).filter((x) => validos.has(x)))];
  const prod = (await todas(ctx, "erp_productos")).find((x) => s(x.id) === pid);
  if (!prod) return { error: "Producto no encontrado" };
  const previos = arr(prod.beta_aplica_faciales).map((x) => s(x).toUpperCase());
  await ctx.db.write(actorOf(ses), "erp_productos", "update", { id: pid }, { beta_aplica_faciales: L, beta_editado_por: s(ses.name), beta_editado_at: ctx.now.toISOString() });
  await logAccion(ctx.db, actorOf(ses), "PRODUCTO APLICA FACIALES", `${skuCode(s(prod.sku))} ${s(prod.nombre)} → ${L.join(", ") || "ninguno"}`);
  // TK36: el producto entra (o sale) solo del protocolo de cada facial.
  const nombres = new Map((await facialesCatalogo(ctx)).map((f) => [f.code, f.nombre]));
  const protocolos = await productoAProtocolos(ctx, ses, prod, L, previos, nombres);
  return { ok: true, aplica: L, protocolos };
});

/** Historial de aperturas + rendimiento; y el costo por facial por producto y por protocolo. */
extend("ap_lista", "any", async (p, ctx, ses) => {
  const verC = await costos(ctx, ses);
  let aps = await todas(ctx, "beta_aperturas");
  if (s(p.producto_id)) aps = aps.filter((a) => s(a.producto_id) === s(p.producto_id));
  if (s(p.destino)) aps = aps.filter((a) => s(a.destino) === s(p.destino));
  const prods = new Map((await todas(ctx, "erp_productos")).map((x) => [s(x.id), x]));
  const minIso = aps.reduce((m, a) => (!m || s(a.abierto_at) < m ? s(a.abierto_at) : m), "");
  const fac = minIso ? await facialesHechos(ctx, new Date(aPared(minIso)).toISOString()) : [];
  const ahora = ctx.now.getTime() - 5 * 3600e3;
  const porProd = new Map<string, Row[]>();
  for (const a of aps) { const L = porProd.get(s(a.producto_id)) || []; L.push(a); porProd.set(s(a.producto_id), L); }
  const items: Row[] = [], productos: Row[] = [];
  const catF = await facialesCatalogo(ctx);
  const protocolo = new Map<string, Row>(catF.map((f) => [f.code, { code: f.code, nombre: f.nombre, costo: 0, productos: [] as Row[] }]));
  for (const [pid, L] of porProd) {
    const pr = prods.get(pid) || {};
    const aplica = arr(pr.beta_aplica_faciales).map(s);
    const R = rendimiento(L, fac, aplica, ahora);
    for (const a of L) {
      const r = R.get(s(a.id));
      const it: Row = {
        id: s(a.id), producto_id: pid, sku: s(a.sku), nombre: s(a.nombre), presentacion: s(a.presentacion), destino: s(a.destino), destinoNombre: nombreDestino(s(a.destino)),
        abierto_at: s(a.abierto_at), cerrado_at: s(a.cerrado_at), usuario: s(a.usuario), anulada: a.anulada === true, anulada_motivo: s(a.anulada_motivo), tieneFirma: !!s(a.firma_url),
        contenido: a.contenido ?? null, unidad: s(a.contenido_unidad), faciales: r ? r.faciales : 0, enCurso: r ? r.enCurso : !a.cerrado_at,
        usoPorFacial: r ? r.usoPorFacial : null, sinAplica: !aplica.length,
      };
      if (verC) { it.costo = a.costo ?? null; it.costoPorFacial = r ? r.costoPorFacial : null; }
      items.push(it);
    }
    const prom = promedioProducto([...R.values()]);
    const fila: Row = { producto_id: pid, sku: skuCode(s(pr.sku)), nombre: s(pr.nombre), aplica, envases: L.filter((a) => a.anulada !== true).length, cerrados: prom.envases, faciales: prom.faciales, usoPorFacial: prom.usoPorFacial, unidad: s(pr.beta_contenido_unidad) };
    if (verC) fila.costoPorFacial = prom.costoPorFacial;
    productos.push(fila);
    if (prom.costoPorFacial != null || prom.usoPorFacial != null) for (const c of aplica) {
      const pf = protocolo.get(c.toUpperCase()); if (!pf) continue;
      (pf.productos as Row[]).push({ sku: fila.sku, nombre: fila.nombre, usoPorFacial: prom.usoPorFacial, unidad: fila.unidad, ...(verC ? { costoPorFacial: prom.costoPorFacial } : {}) });
      pf.costo = round2(n(pf.costo) + n(prom.costoPorFacial));
    }
  }
  items.sort((a, b) => s(b.abierto_at).localeCompare(s(a.abierto_at)));
  const prot = [...protocolo.values()].filter((x) => (x.productos as Row[]).length).map((x) => verC ? x : { ...x, costo: undefined });
  return { ok: true, admin: esAdmin(ses.rol), verCostos: verC, items: items.slice(0, Math.min(500, n(p.limit) || 300)), total: items.length, productos, protocolo: prot,
    nota: "Cada facial se reparte entre los envases de ese producto abiertos en ese momento; si el ticket tiene «Cabina», solo entre los abiertos en esa cabina. El promedio usa solo envases ya cerrados." };
});

extend("ap_firma", "any", async (p, ctx) => {
  const a = (await consultar(ctx.db, "beta_aperturas", { cols: ["id", "firma_url"], filtros: [{ col: "id", op: "eq", val: s(p.id) }] }).catch(() => ({ rows: [] as Row[] }))).rows[0];
  return a ? { ok: true, firma: s(a.firma_url) } : { error: "No encontrada" };
});
