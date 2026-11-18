import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import { calcularDashboard, rangos } from "./dashboard_api.ts";
import "./erp_api.ts";
import type { Row } from "./domain.ts";

function ctx(db: MemoryDb, rol = "admin", now = new Date("2026-11-16T16:00:00Z")) {
  const token = "t-" + rol;
  db.tables.set("sesiones", [{ token, uid: rol, rol, exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: rol, nombre: rol, short: rol, rol, bloqueado: false }]);
  return { db, now, env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}), token };
}
const cat: Row[] = [
  { sku: "SUNSU-02", producto_servicio: "Facial Reparación", tipo: "FACIAL", subtotal: 60, total_con_iva: 69, precio_compra: 0, activo: true },
  { sku: "SUNSU-ML-001", producto_servicio: "PDRN Salmon", tipo: "PRODUCTO", subtotal: 100, total_con_iva: 115, precio_compra: 80, activo: true },
];
function tk(ts: string, extra: Row = {}): Row {
  return { sheet_row: Math.floor(Math.random() * 1e6), timestamp: ts, atendido_por: "Andrea Robles", id_3: "1712345678", nombre: "Ana", apellido: "Pérez", comp: "Efect", ...extra };
}

describe("dashboard MineCore", () => {
  it("rangos: hoy, semana, mes, año y rango contra el periodo anterior", () => {
    assert.deepEqual(rangos("hoy", "2026-11-16"), { periodo: "hoy", desde: "2026-11-16", hasta: "2026-11-16", pDesde: "2026-11-15", pHasta: "2026-11-15" });
    const sem = rangos("semana", "2026-11-19"); // jueves
    assert.equal(sem.desde, "2026-11-16"); assert.equal(sem.pDesde, "2026-11-09"); assert.equal(sem.pHasta, "2026-11-12");
    const mes = rangos("mes", "2026-03-31");
    assert.equal(mes.pDesde, "2026-02-01"); assert.equal(mes.pHasta, "2026-02-28");
    const ano = rangos("ano", "2028-02-29");
    assert.equal(ano.pDesde, "2027-01-01"); assert.equal(ano.pHasta, "2027-02-28");
    const r = rangos("rango", "2026-11-16", "2026-11-15", "2026-11-01");
    assert.deepEqual([r.desde, r.hasta, r.pDesde, r.pHasta], ["2026-11-01", "2026-11-15", "2026-10-17", "2026-10-31"]);
  });

  it("suma venta sin IVA, canjes en $0, productos con margen y compara con ayer", async () => {
    const db = new MemoryDb({
      catalogo: cat,
      tickets: [
        tk("2026-11-16T10:00:00+00:00", { estimado: 69, facial_hecho: "SUNSU-02 Facial Reparación" }),
        tk("2026-11-16T18:30:00+00:00", { estimado: 0, facial_hecho: "SUNSU-02 Facial Reparación", paquete: "SI, 2/3", comp: "Canje" }),
        tk("2026-11-16T19:00:00+00:00", { estimado: 230, ml_001: 2, comp: "Tarje:123" }),
        tk("2026-11-15T12:00:00+00:00", { estimado: 115, facial_hecho: "SUNSU-02 Facial Reparación" }),
        tk("2026-11-16T12:00:00+00:00", { estimado: 500, borrado_at: "2026-11-16T13:00:00Z" }),
      ],
    });
    const d = await calcularDashboard(db, new Date("2026-11-16T16:00:00Z"), { periodo: "hoy" }) as Row;
    const a = d.actual as Row, p = d.anterior as Row;
    assert.equal(a.tickets, 3);
    assert.equal(a.ventaSinIva, 260);
    assert.equal(a.ventaConIva, 299);
    assert.equal(a.faciales, 2);
    assert.equal(a.facCanjes, 1);
    assert.equal(a.valFac, 60);
    assert.equal(a.productosN, 2);
    assert.equal(a.valProd, 200);
    assert.equal(a.costoProd, 160);
    assert.equal(a.utilidad, 100);
    assert.equal(a.margen, 38.5);
    assert.equal((a.pagos as Row).efectivo, 60);
    assert.equal((a.pagos as Row).tarjeta, 200);
    assert.equal(p.ventaSinIva, 100);
    assert.equal(d.labelPrev, "15 nov");
    const prods = d.productos as Row[];
    assert.equal(prods[0].sku, "ML-001");
    assert.equal(prods[0].margenPct, 20);
    assert.equal((d.historia as Row[]).length, 30);
  });

  it("solo administración: getDashboard pide rol admin", async () => {
    const db = new MemoryDb({ catalogo: cat, tickets: [] });
    const c1 = ctx(db, "cosmetologa");
    const no = await handle("getDashboard", { token: c1.token }, c1) as Row;
    assert.ok(no.error);
    const c2 = ctx(db, "admin");
    const ok = await handle("getDashboard", { token: c2.token, periodo: "mes" }, c2) as Row;
    assert.equal(ok.ok, true);
    assert.equal(ok.periodo, "mes");
  });
});


describe("TK90 botones de periodo en el dashboard admin", () => {
  it("tiene Día / Semana / Mes / Año y el rango desde–hasta; no fuerza solo rango", () => {
    const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    assert.match(js, /dsh-tabs/);
    assert.match(js, /\['hoy','Día'\]/);
    assert.match(js, /function dashPeriodo\(/);
    assert.match(js, /dsh-rango/);
    assert.match(js, /id="dsh-desde"/);
    assert.match(js, /id="dsh-hasta"/);
    assert.doesNotMatch(js, /if\(_dashSt\.periodo!=='rango'\)/);
    assert.match(js, /periodo:'hoy'/);
  });
});
