import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { BODEGA_CABINA, BODEGA_VENTA, runErp } from "./erp.ts";
import { acceso, esAdmin, matrizDe } from "./permisos.ts";
import { ecuadorParts, n, s, skuCode, type Row } from "./domain.ts";
import {
  aplicarGiftCard, borradorConsig, claveTicket, clienteDetalle, clientesResumen, kardexPrevio, lineasTicket,
  numeroTicket, ordenarClientes, patchProductos, recalcular, recetaDe, reporteConsumos, textoExtras, textoFacial, textoPack,
  type LineaVenta,
} from "./ventas.ts";

function soloAdmin(ses: Ses): Row | null {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  return null;
}

async function ticketDe(ctx: Ctx, ref: string): Promise<Row | null> {
  const rows = await ctx.db.all("tickets");
  return rows.find((r) => s(r.beta_num) === ref || String(r.sheet_row ?? "") === ref || String(r.id ?? "") === ref || numeroTicket(r) === ref) || null;
}

extend("clientes_resumen", "any", async (p, ctx, ses) => {
  const matriz = await matrizDe(ctx.db);
  const lite = { rol: ses.rol, name: ses.name, short: ses.short, uid: ses.uid };
  const verTodos = esAdmin(ses.rol) || acceso(ses.rol, "clientes", matriz) === "todos";
  const res = await clientesResumen(ctx.db, lite, esAdmin(ses.rol), verTodos);
  const q = s(p.q);
  if (q && Array.isArray(res.clientes)) res.clientes = ordenarClientes(res.clientes as Row[], q);
  return res;
});

extend("cliente_detalle", "any", async (p, ctx, ses) => {
  const key = s(p.key || p.cedula || p.id);
  if (!key) return { error: "Falta la clienta" };
  const k = key.startsWith("c:") || key.startsWith("n:") || key.startsWith("t:") ? key : "c:" + key.replace(/\D/g, "").replace(/^0+/, "");
  return clienteDetalle(ctx.db, { rol: ses.rol, name: ses.name, short: ses.short, uid: ses.uid }, esAdmin(ses.rol), k);
});

extend("ticket_editar", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses);
  if (no) return no;
  const row = await ticketDe(ctx, s(p.ref || p.beta_num || p.tkRow || p.id));
  if (!row) return { error: "Ticket no encontrado" };
  const crudas = (Array.isArray(p.lineas) ? p.lineas : []) as Row[];
  if (!crudas.length) return { error: "El ticket quedaría sin líneas" };
  const prods = await ctx.db.all("erp_productos");
  const lineas: LineaVenta[] = crudas.map((ln) => {
    const sku = s(ln.sku);
    const prod = prods.find((r) => skuCode(s(r.sku)) === skuCode(sku));
    return {
      clase: s(ln.clase) || "producto",
      sku, nombre: s(ln.nombre) || s(prod?.nombre) || sku,
      cantidad: n(ln.cantidad),
      precio: n(ln.precio),
      descuento_pct: n(ln.descuento_pct),
      costo: ln.costo != null ? n(ln.costo) : n(prod?.costo_promedio),
    };
  });
  const calc = recalcular(lineas, n(p.descuento));
  const cats = await ctx.db.all("catalogo").catch(() => [] as Row[]);
  const viejas = lineasTicket(row, cats, prods);
  const previo = kardexPrevio(row, viejas);
  const nuevoMap: Record<string, number> = {};
  for (const ln of calc.lineas) {
    if (ln.clase !== "producto") continue;
    const k = "venta:" + skuCode(ln.sku);
    nuevoMap[k] = (nuevoMap[k] || 0) + ln.cantidad;
  }
  for (const ln of calc.lineas) {
    if (ln.clase !== "servicio") continue;
    for (const rc of await recetaDe(ctx.db, ln.sku || ln.nombre, ln.cantidad)) {
      const k = "cabina:" + skuCode(rc.sku);
      nuevoMap[k] = (nuevoMap[k] || 0) + rc.qty;
    }
  }
  const ref = s(row.beta_num) || String(row.sheet_row || row.id);
  const moves: Row[] = [];
  const keys = new Set([...Object.keys(previo), ...Object.keys(nuevoMap)]);
  let i = 0;
  for (const k of keys) {
    const deltaQty = (nuevoMap[k] || 0) - (previo[k] || 0);
    if (!deltaQty) continue;
    const [lado, sku] = k.split(":");
    const bodega = lado === "cabina" ? BODEGA_CABINA : BODEGA_VENTA;
    const tipo = deltaQty > 0 ? (lado === "cabina" ? "consumo_cabina" : "venta") : "anulacion";
    moves.push({
      sku, bodega_id: bodega, delta: deltaQty > 0 ? -deltaQty : -deltaQty,
      tipo, ticket_ref: ref, nota: "editar " + ref,
      legacy_ref: "edit:" + ref + ":" + k + ":" + Date.now() + ":" + (i++),
    });
  }
  if (moves.length) {
    const mov = await runErp("stock_delta", { moves, aprobar_negativo: true }, ctx.db, actorOf(ses), ctx.now);
    if (mov.error) return mov;
  }
  const actor = actorOf(ses);
  const orig0 = row.orig && typeof row.orig === "object" ? { ...(row.orig as Row) } : {};
  orig0.kardex = nuevoMap;
  orig0.editado_por = actor;
  orig0.editado_en = ecuadorParts(ctx.now).isoWall;
  orig0.subtotal = calc.subtotal;
  orig0.iva = calc.iva;
  orig0.total = calc.total;
  orig0.comision = { productos: calc.comProductos, facial: calc.comFacial };
  const patch: Row = {
    ...patchProductos(calc.lineas),
    facial_hecho: textoFacial(calc.lineas),
    compra_pack_3: textoPack(calc.lineas, "3"),
    compra_pack_6: textoPack(calc.lineas, "6"),
    servicios_adicionales: textoExtras(calc.lineas),
    estimado: calc.total,
    notas_generales: p.notas != null ? s(p.notas) : s(row.notas_generales),
    orig: orig0,
  };
  if (p.gift_card != null) patch.gift_card = s(p.gift_card);
  const match = row.sheet_row != null ? { sheet_row: row.sheet_row } : { id: row.id };
  await ctx.db.write(actor, "tickets", "update", match, patch);
  await logAccion(ctx.db, actor, "TICKET EDIT", ref + " sub=" + calc.subtotal + " iva=" + calc.iva + " total=" + calc.total + " comP=" + calc.comProductos + " comF=" + calc.comFacial);
  return { ok: true, ref: numeroTicket(row), clave: claveTicket(row), ...calc, kardex: moves.length };
});

extend("reporte_consumos", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses);
  if (no) return no;
  return reporteConsumos(ctx.db, p as Row);
});

extend("periodo_consignacion", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses);
  if (no) return no;
  return borradorConsig(ctx.db, ctx.now, p as Row);
});

extend("oc_consignacion", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses);
  if (no) return no;
  const draft = await borradorConsig(ctx.db, ctx.now, p as Row);
  if (draft.error) return draft;
  const directa = (Array.isArray(p.directa) ? p.directa : []) as Row[];
  const pedidas = (Array.isArray(p.lineas) ? p.lineas : []) as Row[];
  const base = new Map(((draft.items as Row[]) || []).map((it) => [skuCode(it.sku), it]));
  const origen = pedidas.length ? pedidas : ((draft.restock as Row[]) || []);
  const restock: Row[] = origen.map((it) => {
    const sku = skuCode(it.sku);
    const known = base.get(sku);
    const cant = pedidas.length ? n(it.cantidad ?? it.sugerido ?? it.pedir) : n(it.sugerido);
    return {
      sku, nombre: s(it.nombre) || s(known?.nombre) || sku,
      compra: it.precio != null || it.compra != null ? n(it.precio ?? it.compra) : n(known?.compra),
      vendido: n(known?.vendido), sugerido: cant,
    };
  }).filter((it) => n(it.sugerido) > 0);
  const lineas: Row[] = restock.map((it) => ({
    sku: it.sku, cantidad: it.sugerido, precio: it.compra, bodega_id: BODEGA_VENTA, plazo: "RESTOCK",
  }));
  for (const d of directa) {
    if (!(n(d.cantidad || d.cant) > 0)) continue;
    lineas.push({
      sku: s(d.sku), cantidad: n(d.cantidad || d.cant), precio: n(d.precio || d.compra),
      bodega_id: BODEGA_CABINA, plazo: "COMPRA DIRECTA",
    });
  }
  if (!lineas.length && !((draft.fact as Row[]) || []).length) return { error: "La quincena no tiene ventas ni restock" };
  if (!lineas.length) return { error: "No hay unidades para reponer en esta quincena", draft };
  const snap = {
    tipo: "consignacion",
    prov: draft.proveedor, qLabel: draft.qLabel, familia: draft.familia,
    fact: draft.fact, items: restock, restock, buffer: draft.buffer, directa, stock: draft.items,
    totales: draft.totales, nota: draft.nota,
  };
  const saved = await runErp("oc_save", {
    proveedor_id: (draft.proveedor as Row).id,
    fecha_esperada: s(p.fecha_entrega) || s(draft.fin),
    bodega_destino_id: BODEGA_VENTA,
    tipo: "consignacion",
    q_label: s(draft.qLabel),
    snap,
    nota: JSON.stringify(snap),
    lineas,
  }, ctx.db, actorOf(ses), ctx.now);
  if (saved.error) return saved;
  await logAccion(ctx.db, actorOf(ses), "OC CONSIGNACION", s(saved.numero) + " " + s(draft.qLabel) + " " + s((draft.proveedor as Row).nombre));
  return { ...saved, snap, qLabel: draft.qLabel };
});

export async function consumirGiftAlCrear(ctx: Ctx, ses: Ses, colR: string, ticket: string, usadoPor: string, facialPrecio: number): Promise<Row | null> {
  const { parseGcCanje } = await import("./ventas.ts");
  const gc = parseGcCanje(colR);
  if (!gc || !gc.codigo) return null;
  return aplicarGiftCard(ctx.db, actorOf(ses), {
    codigo: gc.codigo, aplica: gc.aplica, ticket, usadoPor, facialPrecio, now: ctx.now,
  });
}
