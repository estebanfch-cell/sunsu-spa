import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Row } from "./domain.ts";
import { candidatosParaFactura, cruzar, flagsDeseadas, ticketSoloCero, type FacturaVivo } from "./migo_cuadre.ts";
import { compararLineasVisual, descuentosDeFactura, exigeJustificacionDescuento, resumenCuadre } from "./cuadre_lineas.ts";
import { lineasBorradorDeFactura, lineasTicketDeBorrador } from "./borrador_lineas.ts";

const FAC_2972: FacturaVivo = {
  factura: "001-001-000002972", seq: 2972, fecha: "2026-11-18", cliente: "KARINA CHACON",
  total: 211.96, subtotal: 184.31, descuento: 55.25,
  lineas: [
    { codigo: "SUNSU-ML-002", sku: "SUNSU-ML-002", producto: "Crema", cantidad: 1, precio_unit: 86.96, descuento: 0, subtotal: 86.96, iva: 13.04, total: 100 },
    { codigo: "SUNSU-18", sku: "SUNSU-18", producto: "Paquete x3 Facial Reparación", cantidad: 1, precio_unit: 152.61, descuento: 55.25, subtotal: 97.36, iva: 14.60, total: 111.96 },
  ],
};

function tk(p: Row): Row {
  return { id: p.id, clave: p.clave || p.so_num, so_num: p.so_num || p.clave, fecha: p.fecha || "2026-11-18", nombre: p.nombre, apellido: p.apellido, estimado: p.estimado, fac_7: p.fac_7 || "", cob: p.cob !== false, lineasDetalle: p.lineasDetalle, lineas: p.lineasDetalle || p.lineas, facial_hecho: p.facial_hecho, gift_card: p.gift_card, paquete: p.paquete, compra_pack_3: p.compra_pack_3 };
}

const TK_1915 = tk({
  id: 1915, clave: "TK-SO-1915", nombre: "Carolina", apellido: "Chacon", estimado: 275.50, fac_7: "2972",
  gift_card: "SI, 26-117", facial_hecho: "SUNSU-02 Facial Reparación",
  lineasDetalle: [
    { sku: "ML-002", nombre: "Crema", cantidad: 1, precio_unit: 100, total_linea: 100, tipo: "producto" },
    { sku: "02", nombre: "Facial Reparación", cantidad: 1, precio_unit: 0, total_linea: 0, tipo: "facial", canje: true },
    { sku: "18", nombre: "Paquete x3 Facial Reparación", cantidad: 1, precio_unit: 175.50, total_linea: 175.50, tipo: "paquete" },
  ],
});

describe("TK135 · descuentos de la factura en el prefill", () => {
  it("copia el precio de lista y el descuento por línea (sin duplicar el de cabecera)", () => {
    const d = descuentosDeFactura(FAC_2972);
    assert.equal(d.hayDescuento, true);
    assert.ok(Math.abs(d.descuentoLineasSin - 55.25) < 0.02);
    assert.equal(d.descuentoCabeceraExtraSin, 0);
    const pack = d.lineas.find((l) => /18$/.test(l.sku) || /18$/.test(l.codigo));
    assert.ok(pack);
    assert.ok(Math.abs(pack!.precio_unit_con - 175.50) < 0.02);
    assert.ok(Math.abs(pack!.descuento_con - 63.54) < 0.03);
    assert.ok(Math.abs(pack!.total_con - 111.96) < 0.02);

    const armado = lineasBorradorDeFactura(FAC_2972.lineas as Row[], [], FAC_2972);
    const L = lineasTicketDeBorrador(armado.lineas);
    const lp = L.find((l) => String(l.sku).includes("18"))!;
    assert.ok(Number(lp.descuento_monto) > 60);
    assert.equal(lp.descuento_tipo, "$");
    assert.ok(Math.abs(Number(lp.total_linea) - 111.96) < 0.02);
    assert.equal(armado.descuento_cabecera_con, 0);
  });

  it("exige justificación solo si hay descuento", () => {
    assert.equal(exigeJustificacionDescuento(0, ""), null);
    assert.match(exigeJustificacionDescuento(63.54, "") || "", /Por qué se aplicó este descuento/i);
    assert.equal(exigeJustificacionDescuento(63.54, "Gift card de Karina"), null);
  });
});

describe("TK135 · cuadre visual línea a línea", () => {
  it("la crema cuadra en verde, el paquete con descuento en rojo, el canje $0 es OK y no se marca", () => {
    const C = compararLineasVisual([TK_1915], FAC_2972.lineas as Row[]);
    const cream = C.find((x) => /ML-002/i.test(x.sku + x.codigo));
    const pack = C.find((x) => /(^|[^0-9])18$/.test(x.sku) || /SUNSU-18/i.test(x.codigo));
    const canje = C.find((x) => x.estado === "canje_ok");
    assert.equal(cream?.estado, "ok");
    assert.equal(pack?.estado, "diff");
    assert.match(pack?.razon || "", /En factura: \$111\.96/);
    assert.match(pack?.razon || "", /descuento \$55\.25 sin IVA/);
    assert.ok(canje);
    assert.match(canje!.razon, /Canje · OK/);
    assert.equal(C.some((x) => x.estado === "falta"), false);
    const r = resumenCuadre(C, FAC_2972.factura);
    assert.equal(r.ok, false);
    assert.match(r.texto, /1 línea por corregir/);
    assert.match(r.texto, /2972/);
  });

  it("un extra que no está en la factura sale en rojo y una línea de la factura que falta es fila fantasma", () => {
    const tkExtra = tk({
      id: 1, clave: "TK-SO-1", nombre: "Ana", apellido: "Perez", estimado: 130, cob: true,
      lineasDetalle: [
        { sku: "ML-002", cantidad: 1, precio_unit: 100, total_linea: 100, tipo: "producto", nombre: "Crema" },
        { sku: "31", cantidad: 1, precio_unit: 30, total_linea: 30, tipo: "extra", nombre: "PDRN" },
      ],
    });
    const fac: Row[] = [
      { codigo: "SUNSU-ML-002", cantidad: 1, precio_unit: 86.96, descuento: 0, subtotal: 86.96, iva: 13.04, total: 100 },
      { codigo: "SUNSU-18", cantidad: 1, precio_unit: 152.61, descuento: 0, subtotal: 152.61, iva: 22.89, total: 175.50 },
    ];
    const C = compararLineasVisual([tkExtra], fac);
    const extra = C.find((x) => /31$/.test(x.sku));
    const falta = C.find((x) => x.estado === "falta");
    assert.equal(extra?.estado, "sobra");
    assert.match(extra?.razon || "", /No está en la factura/);
    assert.ok(falta);
    assert.match(falta!.razon, /Falta en ticket · en factura:/);
    assert.match(falta!.razon, /18/);
  });

  it("cantidad distinta se explica en la misma línea", () => {
    const t1 = tk({
      id: 2, clave: "TK-SO-2", nombre: "Ana", apellido: "Perez", estimado: 60, cob: true,
      lineasDetalle: [{ sku: "31", cantidad: 1, precio_unit: 30, total_linea: 30, tipo: "extra", nombre: "PDRN" }],
    });
    const fac: Row[] = [{ codigo: "SUNSU-31", cantidad: 2, precio_unit: 26.09, descuento: 0, subtotal: 52.18, iva: 7.82, total: 60 }];
    const C = compararLineasVisual([t1], fac);
    const d = C.find((x) => x.estado === "diff");
    assert.ok(d);
    assert.match(d!.razon, /Cantidad: ticket 1 vs factura 2/);
  });
});

describe("TK135 · motor de cruce (best match)", () => {
  it("excluye tickets de $0: no los vincula a una factura pagada ni los marca sin factura", () => {
    const cero = tk({ id: 10, clave: "TK-SO-10", nombre: "Carolina", apellido: "Chacon", estimado: 0, cob: true, gift_card: "SI, 26-117", facial_hecho: "SUNSU-02 Facial Reparación", lineasDetalle: [{ sku: "02", tipo: "facial", canje: true, cantidad: 1, precio_unit: 0, total_linea: 0, nombre: "Facial" }] });
    assert.equal(ticketSoloCero(cero), true);
    const links = cruzar([FAC_2972], [cero]);
    assert.equal(links.length, 0);
    const flags = flagsDeseadas({ tickets: [cero], links: [], facturas: [FAC_2972], hoyGye: "2026-11-19", importadoGye: "2026-11-19" });
    assert.equal(flags.some((f) => f.kind === "sinfac"), false);
  });

  it("une varios tickets del mismo día a una factura por SKU aunque los nombres no coincidan", () => {
    const fac: FacturaVivo = {
      factura: "001-001-000003000", seq: 3000, fecha: "2026-11-18", cliente: "MAMA PEREZ", total: 130,
      lineas: [
        { codigo: "SUNSU-ML-002", cantidad: 1, precio_unit: 86.96, descuento: 0, subtotal: 86.96, iva: 13.04, total: 100 },
        { codigo: "SUNSU-31", cantidad: 1, precio_unit: 26.09, descuento: 0, subtotal: 26.09, iva: 3.91, total: 30 },
      ],
    };
    const a = tk({ id: 21, clave: "TK-SO-21", nombre: "Hija", apellido: "Ninez", estimado: 100, fac_7: "", cob: true, lineasDetalle: [{ sku: "ML-002", cantidad: 1, precio_unit: 100, total_linea: 100, tipo: "producto" }] });
    const b = tk({ id: 22, clave: "TK-SO-22", nombre: "Hija", apellido: "Ninez", estimado: 30, fac_7: "", cob: true, lineasDetalle: [{ sku: "31", cantidad: 1, precio_unit: 30, total_linea: 30, tipo: "extra" }] });
    const links = cruzar([fac], [a, b]);
    assert.equal(links.length, 2);
    assert.ok(links.every((L) => L.factura === fac.factura));
    assert.ok(links[0].tipo === "sku_fecha_suma" || links[1].tipo === "sku_fecha_suma" || links.every((L) => L.tipo.startsWith("sku")));
  });

  it("une varias facturas del mismo día a un ticket cuando los SKU juntos cuadran", () => {
    const f1: FacturaVivo = { factura: "001-001-000003001", seq: 3001, fecha: "2026-11-18", cliente: "ANA", total: 100, lineas: [{ codigo: "SUNSU-ML-002", cantidad: 1, precio_unit: 86.96, descuento: 0, subtotal: 86.96, iva: 13.04, total: 100 }] };
    const f2: FacturaVivo = { factura: "001-001-000003002", seq: 3002, fecha: "2026-11-18", cliente: "ANA", total: 30, lineas: [{ codigo: "SUNSU-31", cantidad: 1, precio_unit: 26.09, descuento: 0, subtotal: 26.09, iva: 3.91, total: 30 }] };
    const t1 = tk({ id: 31, clave: "TK-SO-31", nombre: "Ana", apellido: "Perez", estimado: 130, fac_7: "", cob: true, lineasDetalle: [
      { sku: "ML-002", cantidad: 1, precio_unit: 100, total_linea: 100, tipo: "producto" },
      { sku: "31", cantidad: 1, precio_unit: 30, total_linea: 30, tipo: "extra" },
    ] });
    const links = cruzar([f1, f2], [t1]);
    assert.equal(links.length, 1);
    assert.equal(links[0].tipo, "facturas_suma");
    assert.ok(links[0].facturas && links[0].facturas.length === 2);
  });

  it("si el nombre no coincide pero los SKU, cantidades y precios del mismo día sí, igual se vincula (no es error de nombre)", () => {
    const fac: FacturaVivo = { factura: "001-001-000003010", seq: 3010, fecha: "2026-11-18", cliente: "MAMA LOPEZ", total: 100, lineas: [{ codigo: "SUNSU-ML-002", cantidad: 1, precio_unit: 86.96, descuento: 0, subtotal: 86.96, iva: 13.04, total: 100 }] };
    const t1 = tk({ id: 41, clave: "TK-SO-41", nombre: "Nina", apellido: "Hija", estimado: 100, fac_7: "", cob: true, lineasDetalle: [{ sku: "ML-002", cantidad: 1, precio_unit: 100, total_linea: 100, tipo: "producto" }] });
    const links = cruzar([fac], [t1]);
    assert.equal(links.length, 1);
    assert.equal(links[0].tipo, "sku_fecha");
    const flags = flagsDeseadas({ tickets: [t1], links, facturas: [fac], hoyGye: "2026-11-19", importadoGye: "2026-11-19" });
    assert.equal(flags.some((f) => f.kind === "clienta" || /nombre/i.test(f.motivo)), false);
  });

  it("si el nombre y los ítems coinciden pero el valor no (descuento), igual se vincula y la línea queda en rojo", () => {
    const t1 = tk({ id: 51, clave: "TK-SO-51", nombre: "Karina", apellido: "Chacon", estimado: 275.50, fac_7: "", cob: true, lineasDetalle: [
      { sku: "ML-002", cantidad: 1, precio_unit: 100, total_linea: 100, tipo: "producto" },
      { sku: "18", cantidad: 1, precio_unit: 175.50, total_linea: 175.50, tipo: "paquete" },
    ] });
    const links = cruzar([FAC_2972], [t1]);
    assert.equal(links.length, 1);
    const C = compararLineasVisual([t1], FAC_2972.lineas as Row[]);
    const pack = C.find((x) => x.estado === "diff");
    assert.ok(pack);
    assert.match(pack!.razon, /111\.96/);
  });

  it("los candidatos también sugieren un ticket de otro nombre si los SKU cuadran", () => {
    const t1 = tk({ id: 61, clave: "TK-SO-61", nombre: "Nina", apellido: "Hija", estimado: 211.96, fac_7: "", cob: true, lineasDetalle: [
      { sku: "ML-002", cantidad: 1, precio_unit: 100, total_linea: 100, tipo: "producto" },
      { sku: "18", cantidad: 1, precio_unit: 175.50, descuento_monto: 63.54, total_linea: 111.96, tipo: "paquete" },
    ] });
    const C = candidatosParaFactura({ fecha: FAC_2972.fecha, cliente: FAC_2972.cliente, total: FAC_2972.total, lineas: FAC_2972.lineas as Row[] }, [t1]);
    assert.ok(C.some((c) => c.claves.includes("TK-SO-61")));
  });
});

describe("TK135 · pantalla: sin cajas feas, badge corto, justificación", () => {
  const js = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
  const tk = readFileSync(new URL("../../../mc-tickets.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
  const beta = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");

  it("Tickets ya no trae las dos cajas de facturas; hay una pastilla compacta a Borradores", () => {
    assert.equal(js.includes("<b>Facturas sin ticket</b>"), false);
    assert.equal(js.includes("<b>Facturas vinculadas</b>"), false);
    assert.match(js, /_migoBorradoresPill/);
    assert.match(js, /#\/m\/borradores/);
    assert.match(js, /📄 Borradores/);
  });

  it("el ticket abierto tiene badge de una línea, verde/rojo por línea, canje OK y justificación", () => {
    const api = readFileSync(new URL("./cuadre_lineas.ts", import.meta.url), "utf8");
    assert.match(tk, /mctk-cuadre/);
    assert.match(tk, /mctk-ln\.diff/);
    assert.match(tk, /data-falta/);
    assert.match(tk, /¿Por qué se aplicó este descuento\?/);
    assert.match(api, /Cuadrado con fac/);
    assert.match(api, /por corregir/);
    assert.match(api, /Canje · OK sin factura/);
    assert.match(api, /Falta en ticket · en factura/);
    assert.doesNotMatch(tk, /⚠ Por corregir: /);
  });

  it("cache TK138", () => {
    assert.match(sw, /sunsu-2026-11-20-TK184/);
    assert.match(beta, /20261120tk178/);
    assert.doesNotMatch(sw, /TK137"/);
  });
});
