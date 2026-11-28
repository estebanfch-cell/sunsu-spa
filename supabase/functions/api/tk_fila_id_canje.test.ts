// 27-nov-2026: el canje buscaba el paquete por sheet_row O id O código. En los paquetes importados
// sheet_row = id + 2, así que fila=663 (PACK-661 de Marisol) podía caer en el id 663 (PACK-663 de Emely).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemoryDb } from "./db.ts";
import { aplicarUsoExplicit, paqueteDeFila } from "./ticket_edicion_api.ts";
import type { Row } from "./domain.ts";

function paquetes(): Row[] {
  const base = { uso_1: true, fecha_1: "x", uso_2: false, fecha_2: null, uso_3: false, fecha_3: null, orig: {}, borrado_at: null };
  return [
    // El paquete de Emely va PRIMERO a propósito: con la búsqueda vieja ganaba el id 663.
    { ...base, id: 663, sheet_row: 665, codigo: "PACK-663", beta_codigo: null, nombres: "Emely", apellidos: "Gordillo", sku: "SUNSU-18", paquete: "SUNSU-18 x3 Facial Reparación" },
    { ...base, id: 661, sheet_row: 663, codigo: "PACK-661", beta_codigo: null, nombres: "Marisol", apellidos: "Pazmiño", sku: "SUNSU-48", paquete: "SUNSU-48 x6 Facial Reset 3x1", uso_2: true, fecha_2: "y" },
    { ...base, id: 665, sheet_row: 667, codigo: "PACK-665", beta_codigo: null, nombres: "Elvira", apellidos: "Brugues", sku: "SUNSU-55", paquete: "SUNSU-55 x3 Glass Skin + Facial Advance" },
    { ...base, id: 396577, sheet_row: -2700, codigo: "PACK-6694", beta_codigo: "PQ-0053", nombres: "Marisol", apellidos: "Pazmiño", sku: "SUNSU-54", paquete: "SUNSU-54 x6 Facial de Ginseng", uso_1: null },
  ];
}

describe("canje: fila numérica = sheet_row, nunca id", () => {
  it("fila 663 es PACK-661 (Marisol), no el id 663 (Emely)", () => {
    const r = paqueteDeFila(paquetes(), 663)!;
    assert.equal(r.codigo, "PACK-661");
    assert.equal(paqueteDeFila(paquetes(), "663")!.codigo, "PACK-661");
    assert.equal(paqueteDeFila(paquetes(), "663.0")!.codigo, "PACK-661");
  });
  it("fila 665 es PACK-663 (Emely), no el id 665 (Elvira)", () => {
    assert.equal(paqueteDeFila(paquetes(), 665)!.codigo, "PACK-663");
    assert.equal(paqueteDeFila(paquetes(), 667)!.codigo, "PACK-665");
  });
  it("un número que solo existe como id no encuentra nada", () => {
    assert.equal(paqueteDeFila(paquetes(), 396577), null);
    assert.equal(paqueteDeFila(paquetes(), 661), null);
  });
  it("códigos: PACK-661, pack 661 y PQ-0053 solo contra codigo/beta_codigo; sheet_row negativo sí", () => {
    assert.equal(paqueteDeFila(paquetes(), "PACK-661")!.id, 661);
    assert.equal(paqueteDeFila(paquetes(), "pack-663")!.id, 663);
    assert.equal(paqueteDeFila(paquetes(), "PQ-0053")!.id, 396577);
    assert.equal(paqueteDeFila(paquetes(), -2700)!.id, 396577);
    assert.equal(paqueteDeFila(paquetes(), ""), null);
    assert.equal(paqueteDeFila(paquetes(), null), null);
  });
  it("aplicarUsoExplicit: el canje de Marisol (fila 663, sesión 3) marca PACK-661 y deja PACK-663 intacto", async () => {
    const db = new MemoryDb({ paquetes: paquetes() });
    const ctx = { db, now: new Date("2026-11-27T23:51:14Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }) } as never;
    const r = await aplicarUsoExplicit(ctx, "andrea", {
      fila: 663, idx: 2, ticket: "TK-SO-2030", nota: "27/11/26 SUNSU-40 Facial Reset 3x1 · Andrea Robles", cosm: "Andrea Robles",
    });
    assert.equal(r.ok, true, String(r.error));
    const P = db.tables.get("paquetes")!;
    const marisol = P.find((x) => x.id === 661)!, emely = P.find((x) => x.id === 663)!, elvira = P.find((x) => x.id === 665)!;
    assert.equal(marisol.uso_3, true);
    assert.match(String(marisol.fecha_3), /Reset 3x1/);
    assert.equal(emely.uso_3, false);
    assert.equal(emely.fecha_3, null);
    assert.equal(elvira.uso_3, false);
    assert.deepEqual((marisol.orig as Row).marcas_slot, { "TK-SO-2030": [3] });
  });
  it("aplicarUsoExplicit: el canje de Emely (fila 665, sesión 2) marca PACK-663 y no PACK-665", async () => {
    const db = new MemoryDb({ paquetes: paquetes() });
    const ctx = { db, now: new Date("2026-11-28T00:12:07Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }) } as never;
    const r = await aplicarUsoExplicit(ctx, "andrea", { fila: 665, idx: 1, ticket: "TK-SO-2031", nota: "27/11/26 Facial Reparación · Andrea", cosm: "Andrea" });
    assert.equal(r.ok, true, String(r.error));
    const P = db.tables.get("paquetes")!;
    assert.equal(P.find((x) => x.id === 663)!.uso_2, true);
    assert.equal(P.find((x) => x.id === 665)!.uso_2, false);
  });
});
