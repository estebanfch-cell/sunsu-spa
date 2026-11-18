// TK84 (Emilia 18/11): factura a otro nombre (hija atendida, factura a la mamá) no es error: nunca flag rojo,
// no bloquea el cuadre; solo una nota gris «Facturado a otro nombre» en el detalle.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./productos_api.ts";
import "./tickets_beta_api.ts";
import "./migo_cuadre_api.ts";
import type { Row } from "./domain.ts";
import { facturadoAOtroNombre } from "./migo_cuadre.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false }]);
  db.tables.set("catalogo", [{ sku: "SUNSU-40", producto_servicio: "FACIAL RESET", tipo: "FACIAL", total_con_iva: 46, subtotal: 40, activo: true }]);
  db.tables.set("tickets", [{ id: 1769, sheet_row: 1770, so_num: "TK-SO-1770", timestamp: "2026-11-05T15:00:00Z", nombre: "Hija", apellido: "Prueba", facial_hecho: "SUNSU-40 Facial Reset", estimado: 46, fac: true, fac_7: "2871.0", cob: true, comp: "Tarje:1" }]);
  db.tables.set("beta_migo_facturas_vivo", [{ factura: "001-001-000002871", fecha: "2026-11-05", cliente: "MAMÁ DISTINTA", forma: "Tarjeta de crédito", total: 46, subtotal: 40, lineas: [{ sku: "SUNSU-40", codigo: "SUNSU-40", producto: "FACIAL RESET", cantidad: 1, precio_unit: 40, subtotal: 40, iva: 6, total: 46 }] }]);
  db.tables.set("beta_migo_importes", [{ id: 1, imported_at: "2026-11-18T12:00:00Z" }]);
  db.tables.set("beta_ticket_flags", [{ id: "migo:1769:clienta", ticket_id: 1769, ticket_clave: "TK-SO-1770", motivo: "Clienta no cuadra", detalle: "La factura está a nombre de otra persona", factura: "001-001-000002871", fuente: "migo", resuelto: false }]);
  for (const t of ["erp_productos", "erp_bodegas", "erp_stock", "erp_movimientos", "app_modulos", "cabina_inventario", "inventario_base", "promos", "beta_tickets", "beta_ticket_lineas", "solicitudes_cambio", "clientas_registro", "beta_stock_movimientos", "beta_migo_lineas", "beta_cuadre_link", "beta_ticket_cancelados", "beta_migo_borradores", "log_acciones"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-18T19:45:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, p: Row = {}) => handle(a, { token: "adm", ...p }, { ...c, token: "adm" }) as Promise<Row>;
  return { db, h };
}

describe("TK84 · factura a otro nombre no es flag", () => {
  it("el cuadre resuelve el «Clienta no cuadra» viejo, no crea otro, y queda en el log", async () => {
    const { db, h } = semilla();
    const r = await h("migo_cuadre_hora");
    assert.equal(r.ok, true, JSON.stringify(r));
    const fl = db.tables.get("beta_ticket_flags")!;
    assert.equal(fl.filter((f) => !f.resuelto).length, 0, JSON.stringify(fl));
    assert.match(String(fl[0].nota), /otro nombre/);
    assert.ok(db.tables.get("log_acciones")!.some((x) => x.accion === "FLAG AUTO-RESUELTO" && /Clienta no cuadra/.test(String(x.detalle))));
    await h("migo_cuadre_hora");
    assert.equal(db.tables.get("beta_ticket_flags")!.filter((f) => !f.resuelto).length, 0, "nunca vuelve");
  });
  it("detalle: sin «Por corregir», solo la nota gris «Facturado a otro nombre»", async () => {
    const { h } = semilla();
    await h("migo_cuadre_hora");
    const g = await h("tk_get", { clave: "TK-SO-1770" });
    const chips = ((g.chips || (g.info as Row)?.chips || []) as Row[]);
    assert.equal(chips.some((c) => c.k === "flag"), false);
    const o = chips.find((c) => c.k === "otronombre");
    assert.ok(o, JSON.stringify(chips)); assert.equal(o!.c, "neutro");
  });
  it("facturadoAOtroNombre", () => {
    assert.equal(facturadoAOtroNombre("Hija Prueba", "MAMÁ DISTINTA"), true);
    assert.equal(facturadoAOtroNombre("Hija Prueba", "PRUEBA HIJA"), false);
    assert.equal(facturadoAOtroNombre("Hija Prueba", "CONSUMIDOR FINAL"), false);
  });
});
