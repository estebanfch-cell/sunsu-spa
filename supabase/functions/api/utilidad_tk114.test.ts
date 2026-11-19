import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import { calcularDashboard } from "./dashboard_api.ts";
import { preciosDe, utilidadProducto } from "./productos.ts";
import "./tickets_beta_api.ts";
import "./handlers_extra.ts";
import type { Row } from "./domain.ts";

function ctx(db: MemoryDb, rol = "admin", uid = "emi", name = "Emi", now = "2026-11-05T15:00:00Z") {
  const token = "t-" + uid;
  db.tables.set("sesiones", [{ token, uid, rol, exp: "2099-01-01T00:00:00.000Z" }]);
  const users = db.tables.get("usuarios") || [];
  if (!users.some((u) => u.id === uid)) users.push({ id: uid, nombre: name, short: name, rol, bloqueado: false });
  db.tables.set("usuarios", users);
  return {
    db, now: new Date(now),
    env: {} as Record<string, string | undefined>,
    fetchImpl: fetch,
    legacyLogin: async () => ({ ok: false }),
    token,
  };
}

describe("TK114 utilidad con costo real y precios congelados", () => {
  it("falla si la utilidad toma el precio de comisiones como costo o no resta la comisión", () => {
    const p = preciosDe({ subtotal: 20, precio_compra: 6, compra_comision: 6 }, {}, 8);
    assert.equal(p.utilidad, 7.8);
    assert.notEqual(p.utilidad, 14);
    assert.notEqual(p.utilidad, 12);
    assert.equal(utilidadProducto(20, 6, 4.2).utilidad, 9.8); // 6 sería el precio de comisión; el helper no decide la fuente
    assert.equal(preciosDe({ subtotal: 20, precio_compra: 6 }, {}, 0).faltaCosto, true);
  });

  it("al cambiar el catálogo, un ticket ya guardado no cambia comisión ni utilidad", async () => {
    const db = new MemoryDb({
      usuarios: [
        { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
        { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      ],
      cosmetologas: [
        { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true },
      ],
      catalogo: [
        { sku: "SUNSU-01", producto_servicio: "Facial S.O.S", subtotal: 30, total_con_iva: 34.5, tipo: "FACIAL", activo: true, orig: {} },
        { sku: "SUNSU-HT-002", producto_servicio: "Serum niacinamide", subtotal: 20, total_con_iva: 23, precio_compra: 6, compra_comision: 6, tipo: "PRODUCTO", activo: true, orig: {} },
      ],
      inventario_base: [{ sku: "SUNSU-HT-002", compra: 8, stock_inicial: 0 }],
      tickets: [
        { id: 1, sheet_row: 1, so_num: "TK-SO-114", timestamp: "2026-10-27T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0101", nombre: "Ana", apellido: "Pérez", facial_hecho: "SUNSU-01", estimado: 57.5, orig: { "HT-002": 1 } },
      ],
      erp_bodegas: [], erp_stock: [], erp_movimientos: [], app_modulos: [], cabina_inventario: [],
      promos: [], beta_tickets: [], beta_ticket_lineas: [], beta_ticket_snaps: [],
      solicitudes_cambio: [], clientas_registro: [], beta_stock_movimientos: [],
    });
    const c = ctx(db);
    const h = (a: string, p: Row = {}) => handle(a, { token: c.token, ...p }, c) as Promise<Row>;

    const g = await h("tk_get", { clave: "TK-SO-114" });
    assert.equal(g.ok, true, String(g.error));
    const lineas = ((g.lineas as Row[]) || []).map((l) => ({
      tipo: l.tipo, sku: l.sku, cantidad: l.cantidad, precio_unit: l.precio_unit,
    }));
    const sv = await h("tk_guardar", { clave: "TK-SO-114", lineas });
    assert.equal(sv.ok, true, String(sv.error));
    const ln = (db.tables.get("beta_ticket_lineas") || []).find((l) => String(l.sku).includes("HT-002"));
    assert.ok(ln, "la línea de producto debe quedar guardada");
    assert.equal(ln!.snapshot_at != null && ln!.snapshot_at !== "", true);
    assert.equal(Number(ln!.venta_neta), 20);
    assert.equal(Number(ln!.costo_real), 8);
    assert.equal(Number(ln!.compra_comision), 6);
    assert.equal(Number(ln!.comision), 4.2);
    assert.equal(Number(ln!.utilidad), 7.8);

    const antes = await h("getComisionesTabla", { desde: "2026-10-26", hasta: "2026-10-26", persona: "Andrea Robles" });
    const filaProd = ((antes.filas as Row[]) || []).find((f) => f.concepto === "Productos");
    assert.equal(Number(filaProd?.total ?? filaProd?.monto), 4.2);

    const dash1 = await calcularDashboard(db, c.now, { periodo: "rango", desde: "2026-10-27", hasta: "2026-10-27" }) as Row;
    const a1 = dash1.actual as Row;
    assert.equal(Number(a1.valProd), 20);
    assert.equal(Number(a1.costoProd), 8);
    assert.equal(Number(a1.utilidadProd), 7.8);

    // El catálogo y el costo vivo cambian: no pueden alterar el ticket ya vendido.
    const cat = (db.tables.get("catalogo") || []).map((r) => String(r.sku).includes("HT-002")
      ? { ...r, subtotal: 40, total_con_iva: 46, precio_compra: 30, compra_comision: 30 }
      : r);
    db.tables.set("catalogo", cat);
    db.tables.set("inventario_base", [{ sku: "SUNSU-HT-002", compra: 1, stock_inicial: 0 }]);

    const despues = await h("getComisionesTabla", { desde: "2026-10-26", hasta: "2026-10-26", persona: "Andrea Robles" });
    const fila2 = ((despues.filas as Row[]) || []).find((f) => f.concepto === "Productos");
    assert.equal(Number(fila2?.total ?? fila2?.monto), 4.2);
    const ln2 = (db.tables.get("beta_ticket_lineas") || []).find((l) => String(l.sku).includes("HT-002"))!;
    assert.equal(Number(ln2.venta_neta), 20);
    assert.equal(Number(ln2.costo_real), 8);
    assert.equal(Number(ln2.comision), 4.2);
    assert.equal(Number(ln2.utilidad), 7.8);

    const dash2 = await calcularDashboard(db, c.now, { periodo: "rango", desde: "2026-10-27", hasta: "2026-10-27" }) as Row;
    const a2 = dash2.actual as Row;
    assert.equal(Number(a2.valProd), 20);
    assert.equal(Number(a2.costoProd), 8);
    assert.equal(Number(a2.utilidadProd), 7.8);

    const vivo = await h("getCatalogoTabla");
    const serum = ((vivo.items as Row[]) || []).find((r) => String(r.sku).includes("HT-002"));
    assert.equal(Number(serum?.subtotal), 40);
    assert.equal(Number(serum?.compraReal), 1);
  });
});
