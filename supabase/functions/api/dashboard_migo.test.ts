import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { calcularDashboard, detalleDashboard } from "./dashboard_api.ts";
import type { Row } from "./domain.ts";

function base() {
  const db = new MemoryDb();
  db.tables.set("catalogo", [{ sku: "SUNSU-HT-002", subtotal: 20, precio_compra: 8, producto_servicio: "Serum" }, { sku: "SUNSU-01", subtotal: 56.52, producto_servicio: "Facial S.O.S" }]);
  db.tables.set("erp_productos", []);
  db.tables.set("beta_migo_facturas", [
    { factura: "001-001-1", fecha: "2026-04-10", cliente: "Ana Paz", subtotal: 76.52, total: 88, formas_pago: [{ forma: "Tarjeta", valor: 88 }] },
    { factura: "001-001-2", fecha: "2026-04-11", cliente: "CONSUMIDOR FINAL", subtotal: 40, total: 46, formas_pago: [{ forma: "Efectivo", valor: 46 }] },
  ]);
  db.tables.set("beta_migo_lineas", [
    { factura: "001-001-1", codigo: "SUNSU-01", producto: "FACIAL SUNSU S.O.S", tipo: "facial", cantidad: 1, subtotal: 56.52 },
    { factura: "001-001-1", codigo: "SUNSU-HT-002", producto: "Serum", tipo: "producto", cantidad: 1, subtotal: 20 },
    { factura: "001-001-2", codigo: "SUNSU-HT-002", producto: "Serum", tipo: "producto", cantidad: 2, subtotal: 40 },
  ]);
  db.tables.set("tickets", [
    // Ticket viejo (abril): ya está en Migo, no se cuenta dos veces.
    { id: 1, sheet_row: 2, timestamp: "2026-04-10T15:00:00Z", estimado: 88, facial_hecho: "SUNSU-01 Facial", atendido_por: "Andrea", nombre: "Ana", apellido: "Paz", id_3: "1711" },
    { id: 2, sheet_row: 3, timestamp: "2026-05-02T15:00:00Z", estimado: 23, atendido_por: "Andrea", nombre: "Luz", apellido: "Vera", id_3: "1722", productos: "SUNSU-HT-002 x1" },
  ]);
  return db;
}

describe("Dashboard con Migo", () => {
  it("antes de mayo usa Migo, después el sistema; utilidad solo de productos y meta 50%", async () => {
    const db = base();
    const d = await calcularDashboard(db, new Date("2026-05-10T15:00:00Z"), { periodo: "rango", desde: "2026-04-01", hasta: "2026-05-31" }) as Row;
    const a = d.actual as Row;
    assert.equal(d.metaMargen, 50);
    assert.equal((d.fuentes as Row).conMigo, true);
    assert.equal(a.faciales, 1);
    assert.equal(a.tickets, 3);
    assert.equal(a.ventaConIva, 157);
    assert.equal(a.valProd >= 60, true);
    assert.equal(a.utilidadProd, Math.round((n(a.valProd) - n(a.costoProd)) * 100) / 100);
    assert.equal(((a.pagos as Row).tarjeta as number) > 0, true);
    const det = await detalleDashboard(db, { desde: "2026-04-01", hasta: "2026-05-31", tipo: "producto", k: "HT-002" }) as Row;
    assert.equal(det.n >= 2, true);
    assert.equal((det.rows as Row[]).some((r) => r.fuente === "migo" && r.ref === "001-001-2"), true);
    const mes = await detalleDashboard(db, { desde: "2026-04-01", hasta: "2026-05-31", tipo: "mes", k: "2026-04" }) as Row;
    assert.equal(mes.n, 2);
  });
});
function n(x: unknown) { return Number(x) || 0; }
