import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { codigoExtra, handle } from "./handlers.ts";
import type { Row } from "./domain.ts";

function ctx(db: MemoryDb) {
  db.tables.set("sesiones", [{ token: "t-emi", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" }]);
  return { db, now: new Date("2026-11-25T16:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }), token: "t-emi" };
}
function tk(id: number, extras: string, cosm = "Andrea Robles", extra: Row = {}): Row {
  return { id, sheet_row: id, timestamp: `2026-11-0${(id % 8) + 1}T15:00:00Z`, atendido_por: cosm, id_3: "0101" + id, facial_hecho: "SUNSU-01", servicios_adicionales: extras, orig: {}, ...extra };
}
function seed(tickets: Row[]) {
  return new MemoryDb({
    usuarios: [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "super_admin", bloqueado: false },
      { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
    ],
    cosmetologas: [{ id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true }],
    tickets,
    catalogo: [
      { sku: "SUNSU-31", producto_servicio: "PDRN SERUM", subtotal: 13.04, tipo: "SERVICIO ADD-ON", orig: {} },
      { sku: "SUNSU-15", producto_servicio: "Ampolla Especial", subtotal: 13.04, tipo: "SERVICIO ADD-ON", orig: {} },
      { sku: "SUNSU-07", producto_servicio: "DERMAPLANING", subtotal: 13.04, tipo: "SERVICIO ADD-ON", orig: {} },
    ],
  });
}

describe("DEV-36 Comisiones: extras agrupados por código de catálogo", () => {
  it("codigoExtra saca el código de cualquier variante de nombre", () => {
    assert.equal(codigoExtra("SUNSU-31 PDRN Serum"), "SUNSU-31");
    assert.equal(codigoExtra("31 PDRN SERUM"), "SUNSU-31");
    assert.equal(codigoExtra("31 SUNSU-31 PDRN Serum"), "SUNSU-31");
    assert.equal(codigoExtra("SUNSU-15 Ampolla Especial · Ácido Ascórbico"), "SUNSU-15");
    assert.equal(codigoExtra("07 DERMAPLANING"), "SUNSU-07");
    assert.equal(codigoExtra("Algo sin código"), "");
  });

  it("las variantes de nombre quedan en UNA fila por código con el código visible y las mismas sumas", async () => {
    const tickets = [
      tk(1, "SUNSU-31 PDRN Serum"),
      tk(2, "31 PDRN SERUM"),
      tk(3, "31 SUNSU-31 PDRN Serum"),
      tk(4, "SUNSU-15 Ampolla Especial · Ácido Ascórbico | SUNSU-07 Dermaplaning"),
      tk(5, "15 Ampolla Especial | 07 DERMAPLANING"),
      tk(6, "SUNSU-15 Ampolla Especial · Hidratación [CORTESIA: Cumpleaños]"),
    ];
    const c = ctx(seed(tickets));
    const tabla = await handle("getComisionesTabla", { token: c.token, desde: "2026-11-01", hasta: "2026-11-25", persona: "Andrea" }, c) as Row;
    const det = tabla.detalle as Row;
    const extras = det.extras as Row[];
    const total = (tabla.filas as Row[]).find((f) => f.concepto === "Extras")?.total;
    const porCodigo = Object.fromEntries(extras.map((l) => [l.sku, l]));
    assert.equal(extras.length, 3);
    assert.equal(porCodigo["SUNSU-31"].qty, 3);
    assert.equal(porCodigo["SUNSU-15"].qty, 2);
    assert.equal(porCodigo["SUNSU-07"].qty, 2);
    assert.equal(porCodigo["SUNSU-31"].nombre, "PDRN SERUM");
    // La cortesía no paga y no suma: 3 + 2 + 2 = 7 extras, $7.
    assert.equal(total, 7);
    assert.equal(extras.reduce((a, l) => a + Number(l.monto), 0), total);
    assert.equal(extras.reduce((a, l) => a + Number(l.qty), 0), det.extrasN);
  });

  it("lo subido tarde sigue en su propia fila con el 50%", async () => {
    const tickets = [
      tk(1, "SUNSU-31 PDRN Serum"),
      tk(2, "SUNSU-31 PDRN Serum", "Andrea Robles", { orig: { subido_tarde: true, comision_factor: 0.5 } }),
    ];
    const c = ctx(seed(tickets));
    const tabla = await handle("getComisionesTabla", { token: c.token, desde: "2026-11-01", hasta: "2026-11-25", persona: "Andrea" }, c) as Row;
    const extras = (tabla.detalle as Row).extras as Row[];
    const total = (tabla.filas as Row[]).find((f) => f.concepto === "Extras")?.total;
    assert.equal(extras.length, 2);
    assert.equal(total, 1.5);
    assert.equal(extras.reduce((a, l) => a + Number(l.monto), 0), 1.5);
    assert.ok(extras.every((l) => l.sku === "SUNSU-31"));
  });
});
