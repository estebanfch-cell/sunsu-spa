// Transferencias de la beta (Emilia 17/11, como MineCore inv_docs tipo transfer): borrador → enviada
// (en tránsito) → recibida, o cancelada. El stock se mueve SOLO al recibir y SOLO en
// beta_stock_movimientos (−origen, +destino). Nunca en erp_stock, cabina_inventario ni la hoja.
// Oficina ↔ Bodega Cabina solo la mueve un admin.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { acceso, esAdmin, matrizDe } from "./permisos.ts";
import { n, round2, s, type Row } from "./domain.ts";
import { GRUPO_NOMBRE, SUBS_CABINA } from "./productos.ts";
import { listaProductos } from "./productos_api.ts";
import { BODEGAS_CONTEO, bodegaNombre, sistemaDe } from "./conteo_fisico_api.ts";

const FALTA = "Falta aplicar 0046_transferencias_beta.sql";
export const ESTADOS_TRF: Record<string, string> = { borrador: "Borrador", enviada: "Enviada", recibida: "Recibida", cancelada: "Cancelada" };

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
async function lista(ctx: Ctx): Promise<boolean> { try { await ctx.db.all("beta_transferencias"); return true; } catch { return false; } }
async function nivel(ctx: Ctx, ses: Ses): Promise<string> { return esAdmin(ses.rol) ? "todos" : "no"; }
export function soloAdmin(origen: string, destino: string): boolean {
  const par = [origen, destino].sort().join("|");
  return par === "CABINA|OFICINA";
}
function validarLado(b: string, sub: string): string | null {
  if (!(BODEGAS_CONTEO as readonly string[]).includes(b)) return "Bodega inválida";
  if (sub && (b !== "CABINA" || !SUBS_CABINA.some((x) => x.codigo === sub))) return "Sububicación inválida";
  return null;
}
/** Disponible en un lado: en Bodega Cabina sin sububicación cuenta lo «Sin cabina asignada». */
export function disponibleEn(p: Row, bodega: string, sub: string): number {
  if (bodega === "CABINA") return n((p.porSubCabina as Row | undefined)?.[sub || "SIN"]);
  return sistemaDe(p, bodega, sub);
}
function sigNumero(rows: Row[]): string {
  let max = 0;
  for (const r of rows) { const m = s(r.numero).match(/^TR-(\d+)$/); if (m) max = Math.max(max, Number(m[1])); }
  return "TR-" + String(max + 1).padStart(3, "0");
}
async function cargar(ctx: Ctx, id: string): Promise<{ t: Row; L: Row[] } | null> {
  const t = (await todas(ctx, "beta_transferencias")).find((x) => s(x.id) === id || s(x.numero) === id);
  if (!t) return null;
  const L = (await todas(ctx, "beta_transferencia_lineas")).filter((l) => s(l.transferencia_id) === s(t.id)).sort((a, b) => n(a.orden) - n(b.orden));
  return { t, L };
}
function vista(t: Row, L: Row[]): Row {
  return {
    id: t.id, numero: t.numero, estado: s(t.estado), estadoNombre: ESTADOS_TRF[s(t.estado)] || s(t.estado),
    origen: s(t.origen), origenSub: s(t.origen_sub), destino: s(t.destino), destinoSub: s(t.destino_sub),
    origenNombre: bodegaNombre(s(t.origen), s(t.origen_sub)), destinoNombre: bodegaNombre(s(t.destino), s(t.destino_sub)),
    nota: s(t.nota), creadoPor: s(t.creado_por), creadoAt: s(t.creado_at), enviadoPor: s(t.enviado_por), enviadoAt: s(t.enviado_at),
    recibidoPor: s(t.recibido_por), recibidoAt: s(t.recibido_at), canceladoPor: s(t.cancelado_por), canceladoAt: s(t.cancelado_at),
    items: L.length, unidades: round2(L.reduce((a, l) => a + n(l.cantidad), 0)), skus: L.map((l) => s(l.sku)).join(" "), nombres: L.map((l) => s(l.nombre)).join(" "),
  };
}
/** Valida líneas contra el stock beta disponible en el origen. */
async function validarLineas(ctx: Ctx, ses: Ses, origen: string, origenSub: string, lineas: Row[]): Promise<{ L: Row[] } | { error: string }> {
  const prods = await listaProductos(ctx, ses);
  const porId = new Map(prods.map((p) => [s(p.id), p]));
  const L: Row[] = [];
  const ya = new Set<string>();
  for (const x of lineas.slice(0, 300)) {
    const p = porId.get(s(x.producto_id));
    if (!p || p.tipo === "servicio") return { error: "Producto inválido" };
    if (ya.has(s(p.id))) return { error: s(p.skuVisible || p.sku) + " está dos veces" };
    ya.add(s(p.id));
    const q = n(x.cantidad);
    if (!(q > 0)) return { error: s(p.skuVisible || p.sku) + ": la cantidad tiene que ser mayor a 0" };
    const disp = disponibleEn(p, origen, origenSub);
    if (q > disp + 1e-9) return { error: s(p.skuVisible || p.sku) + ": stock insuficiente en " + bodegaNombre(origen, origenSub) + " (" + round2(disp) + ")" };
    L.push({ producto_id: s(p.id), sku: s(p.skuVisible || p.sku), nombre: s(p.nombre), cantidad: round2(q), disponible: round2(disp) });
  }
  if (!L.length) return { error: "Agrega al menos un producto" };
  return { L };
}

extend("trfb_list", "any", async (_p, ctx, ses) => {
  const nv = await nivel(ctx, ses);
  if (nv === "no") return { error: "No tienes permiso" };
  if (!(await lista(ctx))) return { ok: true, items: [], falta: FALTA };
  const L = await todas(ctx, "beta_transferencia_lineas");
  const por = new Map<string, Row[]>();
  for (const l of L) { const k = s(l.transferencia_id); por.set(k, [...(por.get(k) || []), l]); }
  const items = (await todas(ctx, "beta_transferencias")).map((t) => vista(t, por.get(s(t.id)) || [])).sort((a, b) => s(b.creadoAt).localeCompare(s(a.creadoAt)));
  return {
    ok: true, items, admin: esAdmin(ses.rol), puedeCrear: nv === "todos" || nv === "propio",
    bodegas: BODEGAS_CONTEO.map((b) => ({ id: b, nombre: GRUPO_NOMBRE[b] })), subsCabina: SUBS_CABINA.map((x) => ({ id: x.codigo, nombre: x.nombre })), estados: ESTADOS_TRF,
  };
});

extend("trfb_get", "any", async (p, ctx, ses) => {
  if ((await nivel(ctx, ses)) === "no") return { error: "No tienes permiso" };
  const r = await cargar(ctx, s(p.id));
  if (!r) return { error: (await lista(ctx)) ? "Transferencia no encontrada" : FALTA };
  const prods = await listaProductos(ctx, ses);
  const porId = new Map(prods.map((x) => [s(x.id), x]));
  const lineas = r.L.map((l) => {
    const pr = porId.get(s(l.producto_id));
    return { id: l.id, productoId: s(l.producto_id), sku: s(l.sku), nombre: s(l.nombre), cantidad: n(l.cantidad), disponibleAlCrear: n(l.disponible), disponibleAhora: pr ? round2(disponibleEn(pr, s(r.t.origen), s(r.t.origen_sub))) : null };
  });
  const movs = (await todas(ctx, "beta_stock_movimientos")).filter((m) => s(m.doc_id) === s(r.t.id)).sort((a, b) => s(a.fecha).localeCompare(s(b.fecha)));
  let log: Row[] = [];
  try { const a = await ctx.db.rpc("app_beta_cambios", { p_tabla: "beta_transferencias", p_id: s(r.t.id) }); if (Array.isArray(a)) log = (a as Row[]).map((x) => ({ fecha: s(x.ts), actor: s(x.actor), accion: s(x.accion), cambios: x.cambios })); } catch { /* sin RPC el historial sale de las fechas */ }
  const v = vista(r.t, r.L);
  const admin = esAdmin(ses.rol), sa = soloAdmin(s(r.t.origen), s(r.t.destino));
  const puedeMover = admin || !sa;
  return {
    ok: true, transferencia: v, lineas, movimientos: movs.map((m) => ({ fecha: s(m.fecha), sku: s(m.sku), bodega: bodegaNombre(s(m.bodega), s(m.sububicacion)), delta: n(m.delta), actor: s(m.actor) })), log,
    admin, soloAdmin: sa, puedeEditar: puedeMover && v.estado === "borrador", puedeEnviar: puedeMover && v.estado === "borrador", puedeRecibir: puedeMover && v.estado === "enviada",
    puedeCancelar: puedeMover && (v.estado === "borrador" || v.estado === "enviada"),
  };
});

extend("trfb_save", "any", async (p, ctx, ses) => {
  const nv = await nivel(ctx, ses);
  if (nv !== "todos" && nv !== "propio") return { error: "No tienes permiso para crear transferencias" };
  if (!(await lista(ctx))) return { error: FALTA };
  const origen = s(p.origen).toUpperCase(), destino = s(p.destino).toUpperCase();
  const oSub = origen === "CABINA" ? s(p.origen_sub) : "", dSub = destino === "CABINA" ? s(p.destino_sub) : "";
  const e1 = validarLado(origen, oSub) || validarLado(destino, dSub);
  if (e1) return { error: e1 };
  if (origen === destino && oSub === dSub) return { error: "Origen y destino son el mismo lugar" };
  if (soloAdmin(origen, destino) && !esAdmin(ses.rol)) return { error: "Solo un admin mueve entre Oficina y Bodega Cabina" };
  const v = await validarLineas(ctx, ses, origen, oSub, Array.isArray(p.lineas) ? p.lineas as Row[] : []);
  if ("error" in v) return v;
  const actor = actorOf(ses), now = ctx.now.toISOString();
  let id = s(p.id), numero = "";
  if (id) {
    const r = await cargar(ctx, id);
    if (!r) return { error: "Transferencia no encontrada" };
    if (s(r.t.estado) !== "borrador") return { error: "Solo se edita en borrador" };
    numero = s(r.t.numero);
    await ctx.db.write(actor, "beta_transferencias", "update", { id }, { origen, origen_sub: oSub || null, destino, destino_sub: dSub || null, nota: s(p.nota).slice(0, 500) || null, updated_at: now });
    for (const l of r.L) await ctx.db.write(actor, "beta_transferencia_lineas", "delete", { id: l.id }, null);
  } else {
    id = crypto.randomUUID(); numero = sigNumero(await todas(ctx, "beta_transferencias"));
    await ctx.db.write(actor, "beta_transferencias", "insert", {}, { id, numero, origen, origen_sub: oSub || null, destino, destino_sub: dSub || null, estado: "borrador", nota: s(p.nota).slice(0, 500) || null, creado_por: actor, creado_at: now });
  }
  let i = 0;
  for (const l of v.L) await ctx.db.write(actor, "beta_transferencia_lineas", "insert", {}, { id: crypto.randomUUID(), transferencia_id: id, orden: ++i, ...l });
  if (p.enviar === true) return await enviar(ctx, ses, id);
  return { ok: true, id, numero };
});

async function enviar(ctx: Ctx, ses: Ses, id: string): Promise<Row> {
  const r = await cargar(ctx, id);
  if (!r) return { error: "Transferencia no encontrada" };
  if (s(r.t.estado) !== "borrador") return { error: "Solo se envía un borrador" };
  if (soloAdmin(s(r.t.origen), s(r.t.destino)) && !esAdmin(ses.rol)) return { error: "Solo un admin mueve entre Oficina y Bodega Cabina" };
  if (!r.L.length) return { error: "Agrega al menos un producto" };
  await ctx.db.write(actorOf(ses), "beta_transferencias", "update", { id: r.t.id }, { estado: "enviada", enviado_por: actorOf(ses), enviado_at: ctx.now.toISOString(), updated_at: ctx.now.toISOString() });
  return { ok: true, id: r.t.id, numero: r.t.numero, estado: "enviada" };
}
extend("trfb_estado", "any", async (p, ctx, ses) => {
  const nv = await nivel(ctx, ses);
  if (nv !== "todos" && nv !== "propio") return { error: "No tienes permiso" };
  const que = s(p.que), id = s(p.id);
  if (que === "enviar") return await enviar(ctx, ses, id);
  const r = await cargar(ctx, id);
  if (!r) return { error: "Transferencia no encontrada" };
  if (soloAdmin(s(r.t.origen), s(r.t.destino)) && !esAdmin(ses.rol)) return { error: "Solo un admin mueve entre Oficina y Bodega Cabina" };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  if (que === "cancelar") {
    if (!["borrador", "enviada"].includes(s(r.t.estado))) return { error: "Ya está " + s(r.t.estado) };
    await ctx.db.write(actor, "beta_transferencias", "update", { id: r.t.id }, { estado: "cancelada", cancelado_por: actor, cancelado_at: now, nota: [s(r.t.nota), s(p.motivo) ? "Cancelada: " + s(p.motivo) : ""].filter(Boolean).join(" · ") || null, updated_at: now });
    return { ok: true };
  }
  if (que === "recibir") {
    if (s(r.t.estado) !== "enviada") return { error: "Solo se recibe una transferencia enviada" };
    // Se vuelve a validar el stock del origen al recibir (no se deja el origen en negativo).
    const v = await validarLineas(ctx, ses, s(r.t.origen), s(r.t.origen_sub), r.L.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad })));
    if ("error" in v) return v;
    for (const l of r.L) {
      for (const [bod, sub, d] of [[s(r.t.origen), s(r.t.origen_sub), -n(l.cantidad)], [s(r.t.destino), s(r.t.destino_sub), n(l.cantidad)]] as [string, string, number][]) {
        await ctx.db.write(actor, "beta_stock_movimientos", "insert", {}, {
          id: crypto.randomUUID(), fecha: now, producto_id: s(l.producto_id), sku: s(l.sku), bodega: bod, sububicacion: sub || null, delta: round2(d),
          tipo: "transferencia", doc_id: s(r.t.id), doc_numero: s(r.t.numero), actor, nota: bodegaNombre(s(r.t.origen), s(r.t.origen_sub)) + " → " + bodegaNombre(s(r.t.destino), s(r.t.destino_sub)),
        });
      }
    }
    await ctx.db.write(actor, "beta_transferencias", "update", { id: r.t.id }, { estado: "recibida", recibido_por: actor, recibido_at: now, updated_at: now });
    return { ok: true };
  }
  return { error: "Acción inválida" };
});
