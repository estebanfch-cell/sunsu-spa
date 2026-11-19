// Daniela 19/11 15:44: el desglose aplicó $65 de una gift SUNSU-35, pero Enviar Ticket
// devolvía «Esa gift card no tiene saldo». valor es la etiqueta «Gift Card», no el monto;
// el monto vive en el catálogo. saldo/SALDO:/orig.saldo siguen ganando si existen.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { aplicarGiftCard, etiquetaGift, infoSaldoGift, saldoGift } from "./ventas.ts";
import type { Row } from "./domain.ts";

const CAT: Row[] = [
  { sku: "SUNSU-35", producto_servicio: "GIFT CARD", tipo: "GIFT CARD", total_con_iva: 65, subtotal: 56.52, activo: true },
  { sku: "SUNSU-34", producto_servicio: "GIFT CARD $30", tipo: "GIFT CARD", total_con_iva: 34.5, subtotal: 30, activo: false },
  { sku: "SUNSU-01", producto_servicio: "FACIAL PURUFICACIÓN S.O.S", tipo: "FACIAL", total_con_iva: 75, subtotal: 65.22, activo: true },
  { sku: "SUNSU-15", producto_servicio: "Ampolla Especial", tipo: "SERVICIO ADD-ON", total_con_iva: 14.996, subtotal: 13.04, activo: true },
  { sku: "SUNSU-40", producto_servicio: "FACIAL RESET 3x1", tipo: "FACIAL ESPECIAL", total_con_iva: 95, subtotal: 82.61, activo: true },
  { sku: "SUNSU-57", producto_servicio: "FACIAL K-LIFT", tipo: "FACIAL ESPECIAL", total_con_iva: 95, subtotal: 82.61, activo: true },
  { sku: "SUNSU-42", producto_servicio: "FACIAL PEELING MARINO DE PERLA", tipo: "FACIAL ESPECIAL", total_con_iva: 145, subtotal: 126.09, activo: true },
  { sku: "SUNSU-43", producto_servicio: "FACIAL DE GEISHA", tipo: "FACIAL ESPECIAL", total_con_iva: 145, subtotal: 126.09, activo: true },
  { sku: "SUNSU-04", producto_servicio: "FACIAL GOLD-AGING", tipo: "FACIAL", total_con_iva: 65, subtotal: 56.52, activo: true },
  { sku: "SUNSU-47", producto_servicio: "PAQUETE (3) FACIALES DE GEISHA", tipo: "PAQUETE", total_con_iva: 391.5, subtotal: 340.43, activo: true },
  { sku: "SUNSU-PH-005", producto_servicio: "Reset Balance (Purifying Balance) - APHLORA", tipo: "PRODUCTO", total_con_iva: 20.7, subtotal: 18, activo: true },
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

describe("saldoGift · facial en notas/valor (TK145 Andrea)", () => {
  const base: Row = { sku: "SUNSU-35", valor: "Gift Card", saldo: null, usado: false };

  it("Reset en notas vale $95 aunque el SKU sea SUNSU-35", () => {
    assert.equal(saldoGift({ ...base, codigo_gc: "26-069", notas: "SKIN RESET" }, CAT), 95);
    assert.equal(saldoGift({ ...base, codigo_gc: "P", valor: "FACIAL RESET 3x1", notas: "SKIN RESET PRE PAGADO", sku: "SUNSU-40" }, CAT), 95);
  });
  it("Geisha y Peeling Marino valen $145", () => {
    assert.equal(saldoGift({ ...base, codigo_gc: "26-166", notas: "1 GEISHA. De: Ana. Para: Bea." }, CAT), 145);
    assert.equal(saldoGift({ ...base, notas: "Facial Peeling Marino" }, CAT), 145);
  });
  it("un $95 escrito en notas gana y la etiqueta lleva Reset", () => {
    const row: Row = { ...base, codigo_gc: "26-080", notas: "Facial Skin Reset $95" };
    assert.equal(saldoGift(row, CAT), 95);
    assert.equal(infoSaldoGift(row, CAT).facial, "Reset");
    assert.equal(etiquetaGift(row, CAT), "26-080 · $95 (Reset)");
  });
  it("saldo numérico explícito sigue ganando sobre el facial", () => {
    assert.equal(saldoGift({ ...base, saldo: 40, notas: "1 GEISHA" }, CAT), 40);
    assert.equal(saldoGift({ ...base, saldo: 0, notas: "SKIN RESET" }, CAT), 0);
  });
  it("«PREMIUM» solo no se interpreta como facial de $145 (se factura como Gift Card $65)", () => {
    assert.equal(saldoGift({ ...base, codigo_gc: "26-163", notas: "PREMIUM" }, CAT), 65);
    assert.equal(infoSaldoGift({ ...base, notas: "FACIAL PREMIUM" }, CAT).origen, "catalogo");
  });
  it("Conv. paquete→GC sin facial sigue en el fallback SUNSU-35 $65", () => {
    assert.equal(saldoGift(virgen, CAT), 65);
  });
  it("un paquete «VER PAQUETE» no se lee como un solo Geisha de $145; usa el SKU del paquete si está", () => {
    assert.equal(saldoGift({ codigo_gc: "26-068", sku: "SUNSU-47", valor: "PAQUETE (3) FACIALES DE GEISHA", notas: "3 FACIALES GEISHA VER PAQUETE", saldo: null, usado: false }, CAT), 391.5);
    assert.equal(saldoGift({ ...base, valor: "PAQUETE (3) FACIALES DE GEISHA", notas: "3 FACIALES GEISHA VER PAQUETE" }, CAT), 65);
  });
  it("no confunde Reset con el producto «Reset Balance»", () => {
    assert.equal(saldoGift({ ...base, notas: "SKIN RESET" }, CAT), 95);
  });
  it("Purificación SOS y K-Lift toman el precio del facial; una ampolla «Purificación» no", () => {
    assert.equal(saldoGift({ ...base, codigo_gc: "26-168", notas: "PURIFICACION SOS" }, CAT), 75);
    assert.equal(saldoGift({ ...base, codigo_gc: "26-172", notas: "KLIFT" }, CAT), 95);
    assert.equal(saldoGift({ codigo_gc: "ANTIGUA 3", sku: "SUNSU-15", valor: "AMPOLLA ESPECIAL PURIFICACIÓN", notas: "COMPRADO", saldo: null, usado: false }, CAT), 15);
  });
});
