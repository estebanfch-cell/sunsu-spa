// Daniela 19/11 15:44: el desglose aplicó $65 de una gift SUNSU-35, pero Enviar Ticket
// devolvía «Esa gift card no tiene saldo». valor es la etiqueta «Gift Card», no el monto;
// el monto vive en el catálogo. saldo/SALDO:/orig.saldo siguen ganando si existen.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { aplicarGiftCard, datosGiftConvPaquete, etiquetaGift, facialDePaquete, infoSaldoGift, notasConvPaqueteGC, saldoGift } from "./ventas.ts";
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
  { sku: "SUNSU-44", producto_servicio: "PAQUETE (3) FACIALES RESET 3x1", tipo: "PAQUETE", total_con_iva: 256.5, subtotal: 223.04, activo: true },
  { sku: "SUNSU-18", producto_servicio: "PAQUETE (3) FACIAL REPARACIÓN", tipo: "PAQUETE", total_con_iva: 175.5, subtotal: 152.61, activo: true },
  { sku: "SUNSU-02", producto_servicio: "FACIAL REPARACIÓN", tipo: "FACIAL", total_con_iva: 65, subtotal: 56.52, activo: true },
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
    assert.equal(r.error, "Esa gift card ya está usada");
  });

  it("sin catálogo, el monto indicado (Manual) sí se aplica", async () => {
    const db = new MemoryDb({ catalogo: [], gift_cards: [{ ...virgen }], log_acciones: [], gift_card_movimientos: [] });
    const r = await aplicarGiftCard(db, "Daniela Mora", {
      codigo: "26-157", aplica: 65, ticket: "TK-SO-TEMP", usadoPor: "Daniela Mora", facialPrecio: 95,
    });
    assert.equal(r.error, undefined, String(r.error || ""));
    assert.equal(r.aplicado, 65);
    assert.equal(r.facialCobro, 30);
    assert.equal(r.saldo, 0);
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
  it("un facial específico gana sobre un saldo residual de SUNSU-35 ($65 o SALDO:0)", () => {
    assert.equal(saldoGift({ ...base, saldo: 65, notas: "1 GEISHA" }, CAT), 145);
    assert.equal(saldoGift({ ...base, saldo: 0, notas: "SKIN RESET" }, CAT), 95);
    assert.equal(infoSaldoGift({ ...base, saldo: 65, notas: "1 GEISHA" }, CAT).origen, "servicio");
  });
  it("una gift ya usada sigue en $0 aunque nombre un facial", () => {
    assert.equal(saldoGift({ ...base, usado: true, saldo: 0, notas: "1 GEISHA" }, CAT), 0);
  });
  it("«PREMIUM» solo no se interpreta como facial de $145 (se factura como Gift Card $65)", () => {
    assert.equal(saldoGift({ ...base, codigo_gc: "26-163", notas: "PREMIUM" }, CAT), 65);
    assert.equal(infoSaldoGift({ ...base, notas: "FACIAL PREMIUM" }, CAT).origen, "catalogo");
  });
  it("Conv. paquete→GC sin facial ni paquete ligado sigue en el fallback SUNSU-35 $65", () => {
    assert.equal(saldoGift(virgen, CAT), 65);
    assert.equal(infoSaldoGift(virgen, CAT).origen, "catalogo");
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


describe("TK149 · conversión paquete→GC hereda el facial del paquete", () => {
  const packReset: Row = {
    id: 674, codigo: "PACK-674", sku: "SUNSU-44", paquete: "SUNSU-44 x3 Facial Reset 3x1",
    factura: "2815.0", uso_1: true, fecha_1: "Gift Card, 26-157",
  };
  const historica: Row = {
    sheet_row: 157, codigo_gc: "26-157", sku: "SUNSU-35", valor: "Gift Card",
    saldo: null, usado: null, notas: "Conv. paquete→GC · Digital", factura: "2815.0",
  };

  it("notasConvPaqueteGC / datosGiftConvPaquete guardan facial + valor real (SUNSU-44 → $95)", () => {
    assert.equal(
      notasConvPaqueteGC({ facial: "Facial Reset 3x1", precio: 95, pack: "PACK-674", tipo: "digital" }),
      "Facial Reset 3x1 · $95 · Conv. paquete PACK-674→GC · Digital",
    );
    const d = datosGiftConvPaquete(packReset, CAT, "digital");
    assert.equal(d.precio, 95);
    assert.equal(d.facialSku, "SUNSU-40");
    assert.match(d.notas, /Facial Reset 3x1/);
    assert.match(d.notas, /\$95/);
    assert.match(d.notas, /PACK-674/);
    assert.match(d.valor, /\$95/);
    assert.equal(facialDePaquete("SUNSU-44 x3 Facial Reset 3x1", CAT)?.precio, 95);
    assert.equal(facialDePaquete("SUNSU-18 x3 Facial Reparación", CAT)?.precio, 65);
  });

  it("saldoGift de una GC histórica Conv. paquete→GC sin texto de facial hereda $95, no $65", () => {
    assert.equal(saldoGift(historica, CAT), 65, "sin paquete ligado sigue el fallback");
    const info = infoSaldoGift(historica, CAT, [packReset]);
    assert.equal(info.saldo, 95);
    assert.equal(info.origen, "paquete");
    assert.match(info.facial, /Reset/i);
    assert.equal(saldoGift(historica, CAT, [packReset]), 95);
    assert.match(etiquetaGift(historica, CAT, [packReset]), /\$95/);
  });

  it("buscarGiftCards / infoSaldoGift sobre la misma histórica no cae a $65", () => {
    const info = infoSaldoGift(historica, CAT, [packReset]);
    assert.equal(info.saldo, 95);
    assert.notEqual(info.origen, "catalogo");
  });

  it("aplicarGiftCard con el paquete ligado cubre el Reset completo ($95)", async () => {
    const db = new MemoryDb({
      catalogo: CAT,
      paquetes: [packReset],
      gift_cards: [{ ...historica }],
      log_acciones: [],
      gift_card_movimientos: [],
    });
    const r = await aplicarGiftCard(db, "Andrea Robles", {
      codigo: "26-157", aplica: 95, ticket: "TK-SO-1937", usadoPor: "Andrea Robles", facialPrecio: 95,
    });
    assert.equal(r.error, undefined, String(r.error || ""));
    assert.equal(r.aplicado, 95);
    assert.equal(r.facialCobro, 0);
    assert.equal(r.saldo, 0);
  });

  it("el front de conversión escribe facial + valor + pack en las notas", () => {
    const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    assert.match(js, /function notasConvPaqueteGC/);
    assert.match(js, /function facialDePackTxt/);
    assert.match(js, /SUNSU-44':'SUNSU-40/);
    assert.match(js, /encodeURIComponent\(notasConvPaqueteGC\(s\)\)/);
  });
});


describe("TK213 · gift de servicio cubre el facial completo (26-104 Peeling Marino)", () => {
  const card104: Row = {
    codigo_gc: "26-104", sku: "SUNSU-35", valor: "Gift Card", saldo: 65, usado: false,
    notas: "SALDO:0.00 | De: Chris, Cari y Mabe\nPara: Carol.",
  };

  it("digital.facial «Peeling Marino» vale $145 aunque el SKU sea SUNSU-35 y quede saldo $65", () => {
    const info = infoSaldoGift(card104, CAT, [], { facial: "Peeling Marino" });
    assert.equal(info.saldo, 145);
    assert.equal(info.origen, "servicio");
    assert.match(info.facial, /Peeling/i);
    assert.equal(info.sku, "SUNSU-42");
  });

  it("aplicar contra SUNSU-42 de $145 (o un precio de catálogo más alto) deja cobro $0", async () => {
    const db = new MemoryDb({
      catalogo: CAT,
      gift_cards: [{ ...card104, sheet_row: 104 }],
      gift_cards_digitales: [{ codigo: "26-104", facial: "Peeling Marino" }],
      log_acciones: [],
      gift_card_movimientos: [],
    });
    const r = await aplicarGiftCard(db, "Evelyn", {
      codigo: "26-104", aplica: 65, ticket: "TK-SO-1971", usadoPor: "Carol",
      facialPrecio: 145, facialSku: "SUNSU-42", facialNombre: "Facial Peeling Marino de Perla",
    });
    assert.equal(r.error, undefined, String(r.error || ""));
    assert.equal(r.aplicado, 145);
    assert.equal(r.facialCobro, 0);
    assert.equal(r.saldo, 0);
    const r2 = await aplicarGiftCard(new MemoryDb({
      catalogo: CAT,
      gift_cards: [{ ...card104, sheet_row: 104 }],
      gift_cards_digitales: [{ codigo: "26-104", facial: "Peeling Marino" }],
      log_acciones: [],
      gift_card_movimientos: [],
    }), "Evelyn", {
      codigo: "26-104", aplica: 65, ticket: "TK-SO-TEMP", usadoPor: "Carol",
      facialPrecio: 160, facialSku: "SUNSU-42", facialNombre: "Facial Peeling Marino de Perla",
    });
    assert.equal(r2.aplicado, 160);
    assert.equal(r2.facialCobro, 0);
  });

  it("no cubre un facial distinto (p. ej. Reset)", async () => {
    const db = new MemoryDb({
      catalogo: CAT,
      gift_cards: [{ ...card104, sheet_row: 104 }],
      gift_cards_digitales: [{ codigo: "26-104", facial: "Peeling Marino" }],
      log_acciones: [],
      gift_card_movimientos: [],
    });
    const r = await aplicarGiftCard(db, "Evelyn", {
      codigo: "26-104", aplica: 65, ticket: "TK-SO-TEMP", usadoPor: "Carol",
      facialPrecio: 95, facialSku: "SUNSU-40", facialNombre: "Facial Reset 3x1",
    });
    assert.match(String(r.error), /Peeling|no cubre/i);
    assert.equal(r.ok, undefined);
  });

  it("«Facial Premium» / 26-103 sigue siendo monetaria de $65", () => {
    const row: Row = { codigo_gc: "26-103", sku: "SUNSU-35", valor: "Gift Card", saldo: null, usado: false, notas: "De: Ana. Para: Bea." };
    const info = infoSaldoGift(row, CAT, [], { facial: "Facial Premium" });
    assert.equal(info.saldo, 65);
    assert.equal(info.origen, "catalogo");
    assert.equal(saldoGift({ ...row, notas: "PREMIUM" }, CAT), 65);
  });

  it("26-092 con «1 Facial Geisha» en notas sigue valiendo $145", () => {
    assert.equal(saldoGift({ codigo_gc: "26-092", sku: "SUNSU-35", valor: "Gift Card", saldo: null, usado: false, notas: "1 Facial Geisha" }, CAT), 145);
  });
});
