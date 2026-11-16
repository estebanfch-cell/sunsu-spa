// Protocolos editables (0042). La beta lee y escribe beta_protocolos (sembrada desde
// cabina_protocolos); nunca escribe cabina_protocolos ni la hoja. Si 0042 no está aplicada,
// muestra los de Cabina en solo lectura.
//   proto_list  · proto_get · proto_guardar · proto_historial
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { acceso, esAdmin, matrizDe } from "./permisos.ts";
import { n, round2, s, skuCode, type Row } from "./domain.ts";
import { codigoCabina, skuVisible, tipoDe } from "./productos.ts";

async function safeAll(ctx: Ctx, t: string): Promise<Row[] | null> {
  try { return await ctx.db.all(t); } catch { return null; }
}
async function permiso(ctx: Ctx, ses: Ses) {
  const m = await matrizDe(ctx.db);
  const admin = esAdmin(ses.rol);
  const a = acceso(ses.rol, "cabina", m);
  return { ver: admin || a !== "no", editar: admin, costos: admin || acceso(ses.rol, "ver_costos", m) === "todos" };
}

export type Paso = { paso: number; descripcion: string; producto_cod: string; cantidad: number; unidad: string; minutos: number };
/** Valida y renumera los pasos (1..n en el orden recibido). */
export function limpiarPasos(v: unknown, codigos: Set<string>): { pasos: Paso[]; error?: string } {
  const L = Array.isArray(v) ? v as Row[] : [];
  const out: Paso[] = [];
  for (const x of L) {
    const descripcion = s(x?.descripcion).trim().slice(0, 200);
    const producto_cod = s(x?.producto_cod).trim().toUpperCase().replace(/^SUNSU-/, "");
    const cantidad = x?.cantidad === "" || x?.cantidad == null ? 0 : Number(String(x.cantidad).replace(",", "."));
    const minutos = x?.minutos === "" || x?.minutos == null ? 0 : Number(String(x.minutos).replace(",", "."));
    const unidad = s(x?.unidad).trim().slice(0, 12);
    if (!descripcion && !producto_cod) continue;
    if (producto_cod && !codigos.has(producto_cod)) return { pasos: [], error: "Producto no encontrado en el paso " + (out.length + 1) + ": " + producto_cod };
    if (!Number.isFinite(cantidad) || cantidad < 0) return { pasos: [], error: "Cantidad inválida en el paso " + (out.length + 1) };
    if (!Number.isFinite(minutos) || minutos < 0 || minutos > 600) return { pasos: [], error: "Minutos inválidos en el paso " + (out.length + 1) };
    if (producto_cod && cantidad > 0 && !unidad) return { pasos: [], error: "Falta la unidad en el paso " + (out.length + 1) };
    out.push({ paso: out.length + 1, descripcion, producto_cod, cantidad: round2(cantidad), unidad, minutos: round2(minutos) });
  }
  if (out.length > 120) return { pasos: [], error: "Máximo 120 pasos" };
  return { pasos: out };
}

function idDe(sku: string): string {
  return "pr-" + sku.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
function pasosDe(v: unknown): Paso[] {
  if (Array.isArray(v)) return v as Paso[];
  if (typeof v === "string") { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } }
  return [];
}

async function catalogos(ctx: Ctx) {
  const [erp, cat, cab] = await Promise.all([safeAll(ctx, "erp_productos"), safeAll(ctx, "catalogo"), safeAll(ctx, "cabina_inventario")]);
  const catMap = new Map((cat || []).map((r) => [skuCode(s(r.sku)), r]));
  const servicios: Row[] = [];
  const productos = new Map<string, Row>();
  for (const p of erp || []) {
    if (s(p.beta_eliminado_at)) continue;
    const code = skuCode(s(p.sku));
    const c = catMap.get(code);
    const t = tipoDe(c, p);
    if (t.tipo === "servicio") {
      if (t.subtipo === "Paquete" || t.subtipo === "Gift card") continue;
      servicios.push({ sku: skuVisible(code, "servicio", c).sku, nombre: s(p.nombre) || s(c?.producto_servicio), subtipo: t.subtipo, activo: p.activo !== false && (c ? c.activo !== false : true) });
    } else productos.set(code, { codigo: code, nombre: s(p.nombre), unidad: s(p.unidad_consumo) || s(p.unidad) });
  }
  for (const k of cab || []) {
    const c = s(k.codigo).toUpperCase();
    if (c && !productos.has(c)) productos.set(c, { codigo: c, nombre: s(k.producto), unidad: s(k.unidad) });
    const cc = codigoCabina(k);
    if (cc && productos.has(cc) && !s(productos.get(cc)!.unidad)) productos.get(cc)!.unidad = s(k.unidad);
  }
  servicios.sort((a, b) => s(a.sku).localeCompare(s(b.sku), "es", { numeric: true }));
  return { servicios, productos: [...productos.values()].sort((a, b) => s(a.codigo).localeCompare(s(b.codigo), "es", { numeric: true })) };
}

async function leer(ctx: Ctx): Promise<{ filas: Row[]; beta: boolean }> {
  const beta = await safeAll(ctx, "beta_protocolos");
  if (beta) return { filas: beta.filter((r) => !s(r.borrado_at)), beta: true };
  // Sin 0042: los de Cabina, solo lectura.
  const [pr, ps] = await Promise.all([safeAll(ctx, "cabina_protocolos"), safeAll(ctx, "cabina_protocolo_pasos")]);
  const filas = (pr || []).map((p) => {
    const sku = s(p.sku).toUpperCase();
    const mios = (ps || []).filter((x) => s(x.sku).toUpperCase() === sku);
    const ver = Math.max(0, ...mios.map((x) => n(x.version)));
    return {
      id: idDe(sku), sku, nombre: s(p.facial), version: n(p.version), vigente: /^s/i.test(s(p.vigente)), mano_de_obra: p.mano_de_obra, notas: s(p.notas), origen: "cabina",
      pasos: mios.filter((x) => n(x.version) === ver).sort((a, b) => n(a.paso) - n(b.paso)).map((x, i) => ({ paso: i + 1, descripcion: s(x.descripcion), producto_cod: s(x.producto_cod).toUpperCase(), cantidad: n(x.cantidad), unidad: s(x.unidad), minutos: n(x.minutos) })),
    };
  });
  return { filas, beta: false };
}

function publico(r: Row, costos: boolean, nombres: Map<string, Row>): Row {
  const pasos = pasosDe(r.pasos).map((x) => ({ ...x, producto: s(nombres.get(s(x.producto_cod))?.nombre) }));
  const out: Row = {
    id: s(r.id), sku: s(r.sku), nombre: s(r.nombre), version: n(r.version), vigente: r.vigente !== false, notas: s(r.notas),
    origen: s(r.origen), actualizado_por: s(r.actualizado_por), updated_at: s(r.updated_at), pasos,
    minutos: round2(pasos.reduce((a, x) => a + n(x.minutos), 0)), productos: new Set(pasos.map((x) => x.producto_cod).filter(Boolean)).size,
  };
  if (costos) out.mano_de_obra = r.mano_de_obra == null || r.mano_de_obra === "" ? null : n(r.mano_de_obra);
  return out;
}

extend("proto_list", "any", async (_p, ctx, ses) => {
  const pr = await permiso(ctx, ses);
  if (!pr.ver) return { error: "Protocolos no está en tu menú" };
  const { filas, beta } = await leer(ctx);
  const cats = await catalogos(ctx);
  const nombres = new Map(cats.productos.map((x) => [s(x.codigo), x]));
  const svc = new Map(cats.servicios.map((x) => [s(x.sku), x]));
  const protocolos: Row[] = filas.map((r): Row => ({ ...publico(r, pr.costos, nombres), servicio: svc.get(s(r.sku).toUpperCase()) || null }))
    .sort((a, b) => s(a.sku).localeCompare(s(b.sku), "es", { numeric: true }));
  return { ok: true, editable: beta && pr.editar, beta, protocolos, servicios: cats.servicios, productos: cats.productos, verCostos: pr.costos };
});

extend("proto_get", "any", async (p, ctx, ses) => {
  const pr = await permiso(ctx, ses);
  if (!pr.ver) return { error: "Protocolos no está en tu menú" };
  const { filas } = await leer(ctx);
  const r = filas.find((x) => s(x.id) === s(p.id) || s(x.sku).toUpperCase() === s(p.sku).toUpperCase());
  if (!r) return { error: "Protocolo no encontrado" };
  const cats = await catalogos(ctx);
  return { ok: true, protocolo: publico(r, pr.costos, new Map(cats.productos.map((x) => [s(x.codigo), x]))) };
});

extend("proto_guardar", "any", async (p, ctx, ses) => {
  const pr = await permiso(ctx, ses);
  if (!pr.editar) return { error: "Solo un admin edita protocolos" };
  const beta = await safeAll(ctx, "beta_protocolos");
  if (!beta) return { error: "Falta aplicar 0042_protocolos_beta.sql" };
  const cats = await catalogos(ctx);
  const sku = s(p.sku).trim().toUpperCase();
  if (!cats.servicios.some((x) => s(x.sku) === sku)) return { error: "Elige el servicio (facial) de este protocolo" };
  const nombre = s(p.nombre).trim().slice(0, 120);
  if (nombre.length < 2) return { error: "El protocolo necesita un nombre" };
  const vivos = beta.filter((r) => !s(r.borrado_at));
  const id = s(p.id);
  const actual = id ? vivos.find((r) => s(r.id) === id) : undefined;
  if (id && !actual) return { error: "Protocolo no encontrado" };
  const otro = vivos.find((r) => s(r.sku).toUpperCase() === sku && s(r.id) !== id);
  if (otro) return { error: sku + " ya tiene protocolo («" + s(otro.nombre) + "»). Edita ese." };
  const { pasos, error } = limpiarPasos(p.pasos, new Set(cats.productos.map((x) => s(x.codigo))));
  if (error) return { error };
  if (!pasos.length) return { error: "Agrega al menos un paso" };
  let mano: number | null = null;
  if (p.mano_de_obra != null && p.mano_de_obra !== "") {
    mano = Number(String(p.mano_de_obra).replace(",", "."));
    if (!Number.isFinite(mano) || mano < 0) return { error: "Mano de obra inválida" };
  }
  if (!pr.costos) mano = actual ? (actual.mano_de_obra == null ? null : n(actual.mano_de_obra)) : null;
  const usado = new Set(beta.map((r) => s(r.id)));
  let nuevoId = id || idDe(sku);
  while (!id && usado.has(nuevoId)) nuevoId = idDe(sku) + "-" + crypto.randomUUID().slice(0, 4);
  const row: Row = { sku, nombre, vigente: p.vigente !== false, mano_de_obra: mano, notas: s(p.notas).slice(0, 500), pasos, origen: actual ? s(actual.origen) || "beta" : "beta", borrar: p.borrar === true };
  const out = await ctx.db.rpc("app_protocolo_guardar", { p_id: nuevoId, p_row: row, p_actor: actorOf(ses) });
  if (out == null) return { error: "Falta aplicar 0042_protocolos_beta.sql" };
  return { ok: true, id: nuevoId, version: n((out as Row).version) || 1 };
});

extend("proto_historial", "any", async (p, ctx, ses) => {
  const pr = await permiso(ctx, ses);
  if (!pr.ver) return { error: "Protocolos no está en tu menú" };
  let rows: unknown = null;
  try { rows = await ctx.db.rpc("app_protocolo_cambios", { p_id: s(p.id) }); } catch { rows = null; }
  const L = Array.isArray(rows) ? rows as Row[] : [];
  return { ok: true, cambios: L.slice(0, 30).map((a) => ({ fecha: s(a.ts), actor: s(a.actor), accion: s(a.accion), version: n((a.despues as Row | undefined)?.version) })) };
});
