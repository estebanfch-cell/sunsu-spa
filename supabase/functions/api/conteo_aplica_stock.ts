// TK135: al aprobar un conteo físico, el stock real de esa bodega (el que
// muestra Productos) se actualiza solo con las líneas que sí se contaron.
// Las diferencias van a beta_stock_movimientos y a un ajuste de origen
// «conteo», igual que el resto de ajustes de la beta. No se toca la hoja
// ni cabina_inventario (Productos suma esos movimientos al stock del sistema).
// Idempotente: stock_aplicado / stock_aplicado_at y movimientos con doc_id
// del conteo. Dueño: Oficina y Cabina = sunsu; Venta/consignación = se
// conserva el dueño que ya había, o consignación si no hay desglose.
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { n, round2, s, type Row } from "./domain.ts";
import { listaProductos } from "./productos_api.ts";
import { bodegaDeLinea, bodegaNombre, sistemaDe } from "./conteo_fisico_api.ts";
import { PROP_CONSIG, PROP_SUNSU, esBodegaInterna, propietarioDe } from "./inventario_modelo.ts";

export function lineaContada(l: Row): boolean {
  if (s(l.estado) === "pendiente") return false;
  if (s(l.estado) === "no_encontrado") return true;
  return l.contado != null && l.contado !== "";
}

export function cantidadContada(l: Row): number {
  if (s(l.estado) === "no_encontrado") return 0;
  return round2(n(l.contado));
}

export function subDeLinea(l: Row, conteoSub = ""): string {
  return s(l.sub_contada) || s(l.sububicacion) || s(conteoSub);
}

function duenioDeBodega(bodega: string, stockRows: Row[], productoId: string): string {
  if (esBodegaInterna(bodega)) return PROP_SUNSU;
  const mios = stockRows.filter((r) => s(r.producto_id) === productoId && n(r.cantidad) > 0);
  const dues = new Set(mios.map((r) => propietarioDe(r, PROP_CONSIG)));
  if (dues.size === 1) return [...dues][0];
  return PROP_CONSIG;
}

async function todas(ctx: Ctx, t: string): Promise<Row[]> {
  try { return await ctx.db.all(t); } catch { return []; }
}

function sigAjuste(rows: Row[]): string {
  let max = 0;
  for (const r of rows) { const m = s(r.numero).match(/^AJ-(\d+)$/); if (m) max = Math.max(max, Number(m[1])); }
  return "AJ-" + String(max + 1).padStart(3, "0");
}

/** Aplica las líneas contadas al stock real de la bodega del conteo. No vuelve a aplicar si ya está marcado. */
export async function aplicarConteoAStock(ctx: Ctx, ses: Ses, c: Row, L: Row[]): Promise<Row> {
  if (c.stock_aplicado === true || s(c.stock_aplicado_at)) {
    return { ok: true, stockAplicado: true, yaAplicado: true, aplicadas: 0, omitidas: 0 };
  }
  const movsYa = (await todas(ctx, "beta_stock_movimientos")).filter((m) =>
    (s(m.doc_id) === s(c.id) || s(m.doc_numero) === s(c.numero)) && s(m.tipo) === "conteo");
  if (movsYa.length) {
    const actor = actorOf(ses), now = ctx.now.toISOString();
    await ctx.db.write(actor, "beta_conteos", "update", { id: c.id }, { stock_aplicado: true, stock_aplicado_at: s(c.stock_aplicado_at) || now, updated_at: now });
    return { ok: true, stockAplicado: true, yaAplicado: true, aplicadas: 0, omitidas: 0 };
  }
  const bodega = s(c.bodega).toUpperCase();
  const prods = await listaProductos(ctx, ses);
  const porId = new Map(prods.map((p) => [s(p.id), p]));
  let stockRows: Row[] = [];
  try { stockRows = await ctx.db.all("erp_stock"); } catch { stockRows = []; }
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const contadas = L.filter(lineaContada);
  const omitidas = L.length - contadas.length;
  const filas: Row[] = [];
  for (const l of contadas) {
    const pr = porId.get(s(l.producto_id));
    const bod = bodegaDeLinea(l, c);
    const sub = subDeLinea(l, bod === bodega ? s(c.sububicacion) : "");
    const ahora = pr ? round2(sistemaDe(pr, bod, "")) : round2(n(l.sistema));
    const despues = cantidadContada(l);
    const dif = round2(despues - ahora);
    filas.push({
      producto_id: s(l.producto_id), sku: s(pr?.skuVisible || pr?.sku || l.sku), nombre: s(pr?.nombre || l.nombre),
      bodega: bod, sub, antes: ahora, despues, diferencia: dif,
      propietario: duenioDeBodega(bod, stockRows, s(l.producto_id)),
    });
  }
  const conDif = filas.filter((f) => Math.abs(n(f.diferencia)) > 1e-9);
  let ajusteId = "", numero = "";
  if (conDif.length) {
    const ajustes = await todas(ctx, "beta_ajustes");
    ajusteId = crypto.randomUUID();
    numero = sigAjuste(ajustes);
    try {
      await ctx.db.write(actor, "beta_ajustes", "insert", {}, {
        id: ajusteId, numero, bodega, sububicacion: s(c.sububicacion) || null,
        motivo: "Conteo físico", nota: "Conteo " + s(c.numero), origen: "conteo",
        conteo_id: s(c.id), estado: "aplicado", creado_por: actor, creado_at: now,
        aplicado_por: actor, aplicado_at: now, updated_at: now,
      });
    } catch { /* si falta 0047, igual se escriben los movimientos */ }
    let i = 0;
    for (const f of conDif) {
      const bod = s(f.bodega) || bodega;
      try {
        await ctx.db.write(actor, "beta_ajuste_lineas", "insert", {}, {
          id: crypto.randomUUID(), ajuste_id: ajusteId, orden: ++i,
          producto_id: f.producto_id, sku: f.sku, nombre: f.nombre,
          antes: f.antes, despues: f.despues, diferencia: f.diferencia,
        });
      } catch { /* ok */ }
      await ctx.db.write(actor, "beta_stock_movimientos", "insert", {}, {
        id: crypto.randomUUID(), fecha: now, producto_id: s(f.producto_id), sku: s(f.sku),
        bodega: bod, sububicacion: s(f.sub) || null, delta: n(f.diferencia),
        tipo: "conteo", doc_id: s(c.id), doc_numero: s(c.numero), actor,
        nota: "Conteo físico " + s(c.numero) + (numero ? " · " + numero : "") + " · " + bodegaNombre(bod) + (s(f.sub) ? " · " + s(f.sub) : ""),
        propietario: s(f.propietario) || (esBodegaInterna(bod) ? PROP_SUNSU : PROP_CONSIG),
      });
    }
  }
  await ctx.db.write(actor, "beta_conteos", "update", { id: c.id }, {
    stock_aplicado: true, stock_aplicado_at: now, updated_at: now,
  });
  return {
    ok: true, stockAplicado: true, yaAplicado: false,
    aplicadas: conDif.length, igualAlSistema: filas.length - conDif.length, omitidas,
    ajuste: numero || null, bodega: bodegaNombre(bodega, s(c.sububicacion)),
  };
}
