// TK133 (Emilia 19/11 14:06): el cuadre decía «ticket $0.00» aunque el ítem estaba
// en el ticket (ML-002 vs SUNSU-ML-002) y comparaba el Pagado de la hoja, no el Total.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { cruzar, flagsDeseadas, type FacturaVivo } from "./migo_cuadre.ts";
import { difPorSku, totalTicketCuadre } from "./cuadre_sku.ts";
import { lineasDeTicket } from "./migo_lineas.ts";
import { mapaAliases } from "./inventario_modelo.ts";
import type { Row } from "./domain.ts";

const CAT = new Map([
  ["ML-002", { nombre: "C.Tox Eye Cream - Dr.esthe", pvpConIva: 100, pvpSinIva: 86.96 }],
  ["18", { nombre: "PAQUETE (3) FACIAL REPARACIÓN", pvpConIva: 175.5, pvpSinIva: 152.61 }],
  ["02", { nombre: "Facial Reparación", pvpConIva: 65, pvpSinIva: 56.52 }],
  ["ML-008", { nombre: "AC Solution Swab", pvpConIva: 10, pvpSinIva: 8.7 }],
]);

const FAC_2972: Row[] = [
  { codigo: "SUNSU-ML-002", sku: "SUNSU-ML-002", producto: "C.Tox Eye Cream - Dr.esthe", cantidad: 1, precio_unit: 86.96, descuento: 0, subtotal: 86.96, iva: 13.04, total: 100 },
  { codigo: "SUNSU-18", sku: "SUNSU-18", producto: "PAQUETE (3) FACIAL REPARACIÓN", cantidad: 1, precio_unit: 152.61, descuento: 55.25, subtotal: 97.36, iva: 14.6, total: 111.96 },
];

function tk1915(extra: Row = {}): Row {
  return {
    id: 1907, clave: "TK-SO-1915", so_num: "TK-SO-1915", fecha: "2026-11-18",
    estimado: 225.5, fac_7: "2972.0", cob: true, fac: true,
    facial_hecho: "SUNSU-02 Facial Reparación",
    compra_pack_3: "SUNSU-18 x3 Facial Reparación",
    gift_card: "SI, 26-117",
    orig: { "ML-002": 1, "Facial hecho": "SUNSU-02 Facial Reparación", "Compra pack (3)": "SUNSU-18 x3 Facial Reparación", "Gift Card": "SI, 26-117" },
    ml_002: 1,
    ...extra,
  };
}

describe("TK133 cuadre: ticket $0.00 falso y total de líneas", () => {
  it("normaliza el prefijo SUNSU- y toma el precio del catálogo (nunca $0 si el ítem está en el ticket)", () => {
    const sinCat = difPorSku(FAC_2972, [tk1915()]);
    assert.ok(sinCat.some((x) => /ticket \$0\.00/.test(x)), "sin catálogo el bug original sigue visible en el test de control");

    const d = difPorSku(FAC_2972, [tk1915()], CAT);
    assert.equal(d.some((x) => /ticket \$0\.00/.test(x)), false);
    assert.equal(d.some((x) => /SUNSU-ML-002/.test(x) && /\$100/.test(x) && /\$0\.00/.test(x)), false);
    // La crema cuadra ($100 = $100). El paquete no: lista $175.50 vs factura con descuento $111.96.
    assert.equal(d.some((x) => /SUNSU-ML-002/.test(x)), false);
    const pack = d.find((x) => /SUNSU-18/.test(x) || /PAQUETE/.test(x));
    assert.ok(pack, "debe avisar el paquete");
    assert.match(pack!, /ticket \$175\.50/);
    assert.match(pack!, /factura \$111\.96/);
  });

  it("el facial canjeado con gift card «SI, código» queda en $0 y no sobra frente a la factura", () => {
    const L = lineasDeTicket(tk1915(), CAT);
    const facial = L.find((l) => l.sku === "02" || /SUNSU-02/i.test(l.codigo));
    assert.ok(facial);
    assert.equal(facial!.canje, true);
    assert.equal(facial!.totalCon, 0);
    const d = difPorSku(FAC_2972, [tk1915()], CAT);
    assert.equal(d.some((x) => /Sobra.*02|Sobra.*Facial/i.test(x)), false);
  });

  it("el total del letrero es la suma de líneas (Total), no el Pagado/estimado de la hoja", () => {
    assert.equal(totalTicketCuadre(tk1915(), CAT), 275.5); // 100 + 175.50, sin el canje ni el estimado 225.50
    assert.equal(totalTicketCuadre({ estimado: 225.5 }, CAT), 225.5); // sin líneas, cae al estimado
  });

  it("la bandera roja usa $275.50 vs $211.96 (+63.54) y no dice ticket $0.00", () => {
    const facs: FacturaVivo[] = [{
      factura: "001-001-000002972", seq: 2972, fecha: "2026-11-18", cliente: "CAROLINA CHACON",
      total: 211.96, lineas: FAC_2972,
    }];
    const tickets = [tk1915()];
    const links = cruzar(facs, tickets);
    const flags = flagsDeseadas({ tickets, links, facturas: facs, hoyGye: "2026-11-19", importadoGye: "2026-11-19", catalogo: CAT });
    const monto = flags.find((f) => f.kind === "monto");
    assert.ok(monto);
    assert.match(monto!.detalle, /Ticket \$275\.50 vs factura 001-001-000002972 \$211\.96 \(\+63\.54\)/);
    assert.equal(/ticket \$0\.00/.test(monto!.detalle), false);
    assert.match(monto!.detalle, /ticket \$175\.50 vs factura \$111\.96/);
  });

  it("INV-110 y SUNSU-ML-008 cuadran con ML-008 por alias, nunca por nombre", () => {
    const al = mapaAliases([{ alias: "INV-110", sku: "ML-008" }, { alias: "SUNSU-ML-008", sku: "ML-008" }]);
    const fac = [{ sku: "SUNSU-ML-008", codigo: "SUNSU-ML-008", nombre: "AC Solution Swab", cantidad: 1, total: 10 }];
    const tk = { lineas: [{ sku: "INV-110", nombre: "otro nombre", cantidad: 1, total: 10, totalCon: 10 }] } as Row;
    assert.deepEqual(difPorSku(fac, [tk], CAT, al), []);
    // Sin alias, códigos distintos no deben unirse por el nombre.
    const sin = difPorSku(fac, [tk], CAT);
    assert.ok(sin.some((x) => /Falta en ticket: SUNSU-ML-008/.test(x)));
  });

  it("cache TK133", () => {
    const sw = readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    assert.match(sw, /sunsu-beta-2026-11-19-BOOT/);
    assert.match(beta, /20261119boot/);
    assert.doesNotMatch(sw, /sunsu-beta-2026-11-19-TK132/);
  });
});
