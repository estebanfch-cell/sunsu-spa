// Daniela 19/11 15:44: el desglose aplicó $65 de una gift SUNSU-35, pero Enviar Ticket
// devolvía «Esa gift card no tiene saldo». valor es la etiqueta «Gift Card», no el monto;
// el monto vive en el catálogo. saldo/SALDO:/orig.saldo siguen ganando si existen.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { aplicarGiftCard, saldoGift } from "./ventas.ts";
import type { Row } from "./domain.ts";

const CAT: Row[] = [
  { sku: "SUNSU-35", producto_servicio: "GIFT CARD", tipo: "GIFT CARD", total_con_iva: 65, subtotal: 56.52, activo: true },
  { sku: "SUNSU-34", producto_servicio: "GIFT CARD $30", tipo: "GIFT CARD", total_con_iva: 34.5, subtotal: 30, activo: false },
];

const virgen: Row = {
  sheet_row: 157,
  codigo_gc: "26-157",
  sku: "SUNSU-35",
  valor: "Gift Card",
  saldo: null,
  usado: null,
  notas: "Conv. paquete→GC · Digital",
  nombre_comprador: "Maria Fernanda",
  apellido_comprador: "Rosales",
};

describe("saldoGift · catálogo cuando valor es «Gift Card»", () => {
  it("SUNSU-35 virgen (saldo null, valor etiqueta) vale $65", () => {
    assert.equal(saldoGift(virgen, CAT), 65);
    assert.equal(saldoGift(virgen, []), 0, "sin catálogo no inventa el monto");
  });
  it("una gift ya usada sigue en $0 aunque el SKU valga $65", () => {
    assert.equal(saldoGift({ ...virgen, usado: true }, CAT), 0);
    assert.equal(saldoGift({ ...virgen, usado: "SI" }, CAT), 0);
  });
  it("la columna saldo y el tag SALDO:n ganan sobre el catálogo", () => {
    assert.equal(saldoGift({ ...virgen, saldo: 40 }, CAT), 40);
    assert.equal(saldoGift({ ...virgen, notas: "SALDO:12.50 | resto" }, CAT), 12.5);
    assert.equal(saldoGift({ ...virgen, orig: { saldo: 20 } }, CAT), 20);
  });
  it("lee $30 escrito en valor/notas aunque no haya catálogo", () => {
    assert.equal(saldoGift({ codigo_gc: "ANTIGUA 1", valor: "GIFT CARD $30", saldo: null, usado: false }, []), 30);
    assert.equal(saldoGift({ codigo_gc: "X", valor: "Gift Card", notas: "saldo $15.00", sku: "" }, []), 15);
  });
  it("SUNSU-34 usa total_con_iva del catálogo ($34.50)", () => {
    assert.equal(saldoGift({ codigo_gc: "A1", sku: "SUNSU-34", valor: "GIFT CARD", saldo: null, usado: false }, CAT), 34.5);
  });
});

describe("aplicarGiftCard · canje de una SUNSU-35 virgen (caso Daniela)", () => {
  function dbCon(card: Row): MemoryDb {
    return new MemoryDb({
      catalogo: CAT,
      gift_cards: [card],
      log_acciones: [],
      gift_card_movimientos: [],
    });
  }

  it("aplica $65 a un Reset 3x1 de $95 y deja $30 a cobrar; no dice sin saldo", async () => {
    const db = dbCon({ ...virgen });
    const r = await aplicarGiftCard(db, "Daniela Mora", {
      codigo: "26-157", aplica: 65, ticket: "TK-SO-TEMP", usadoPor: "Daniela Mora", facialPrecio: 95,
    });
    assert.equal(r.error, undefined, String(r.error || ""));
    assert.equal(r.ok, true);
    assert.equal(r.aplicado, 65);
    assert.equal(r.facialCobro, 30);
    assert.equal(r.saldo, 0);
    const after = (await db.all("gift_cards"))[0];
    assert.equal(after.usado, true);
    assert.equal(after.saldo, 0);
    assert.match(String(after.notas), /SALDO:0/);
  });

  it("una gift ya marcada usada sigue rechazando el canje", async () => {
    const db = dbCon({ ...virgen, usado: true, fecha_uso: "2026-06-11" });
    const r = await aplicarGiftCard(db, "Daniela Mora", {
      codigo: "26-157", aplica: 65, ticket: "TK-SO-TEMP", usadoPor: "Daniela Mora", facialPrecio: 95,
    });
    assert.equal(r.error, "Esa gift card no tiene saldo");
  });

  it("sin el arreglo (sin catálogo) la misma gift virgen fallaba", async () => {
    const db = new MemoryDb({ catalogo: [], gift_cards: [{ ...virgen }], log_acciones: [] });
    const r = await aplicarGiftCard(db, "Daniela Mora", {
      codigo: "26-157", aplica: 65, ticket: "TK-SO-TEMP", usadoPor: "Daniela Mora", facialPrecio: 95,
    });
    assert.equal(r.error, "Esa gift card no tiene saldo");
  });
});

describe("front · desglose no aplica $65 si la búsqueda dijo saldo 0", () => {
  it("updatePreview topea por T.gcSaldo cuando ya hubo lookup", () => {
    const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    assert.match(js, /T\._gcLookup\s*=\s*true/);
    assert.match(js, /T\._gcLookup\s*\?\s*saldo/);
  });
});
