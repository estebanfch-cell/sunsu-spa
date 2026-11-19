import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Row } from "./domain.ts";
import { cruzar, flagsDeseadas, type FacturaVivo, type LinkCuadre } from "./migo_cuadre.ts";
import { compararFacturaYTickets, lineasDeTicket } from "./migo_lineas.ts";
import { compararLineasVisual, resumenCuadre } from "./cuadre_lineas.ts";

const CAT = new Map<string, { nombre?: string; pvpConIva?: number }>([
  ["SUNSU-02", { nombre: "Facial Reparación", pvpConIva: 65 }],
  ["02", { nombre: "Facial Reparación", pvpConIva: 65 }],
  ["SUNSU-31", { nombre: "PDRN Serum", pvpConIva: 15 }],
  ["31", { nombre: "PDRN Serum", pvpConIva: 15 }],
  ["SUNSU-15", { nombre: "Ampolla Especial", pvpConIva: 15 }],
  ["15", { nombre: "Ampolla Especial", pvpConIva: 15 }],
  ["SUNSU-40", { nombre: "Facial Reset 3x1", pvpConIva: 95 }],
  ["40", { nombre: "Facial Reset 3x1", pvpConIva: 95 }],
  ["SUNSU-18", { nombre: "Paquete x3 Facial Reparación", pvpConIva: 175.5 }],
  ["18", { nombre: "Paquete x3 Facial Reparación", pvpConIva: 175.5 }],
  ["SUNSU-AS-002", { nombre: "AS-002", pvpConIva: 18.99 }],
  ["AS-002", { nombre: "AS-002", pvpConIva: 18.99 }],
  ["SUNSU-AS-010", { nombre: "AS-010", pvpConIva: 39.67 }],
  ["AS-010", { nombre: "AS-010", pvpConIva: 39.67 }],
  ["SUNSU-HT-007", { nombre: "HT-007", pvpConIva: 43.99 }],
  ["HT-007", { nombre: "HT-007", pvpConIva: 43.99 }],
  ["SUNSU-VK-007", { nombre: "VK-007", pvpConIva: 26.99 }],
  ["VK-007", { nombre: "VK-007", pvpConIva: 26.99 }],
  ["SUNSU-35", { nombre: "Gift Card", pvpConIva: 65 }],
]);

function tk(p: Row): Row {
  return {
    id: p.id, clave: p.clave || p.so_num, so_num: p.so_num || p.clave, fecha: p.fecha || "2026-11-18",
    nombre: p.nombre, apellido: p.apellido, estimado: p.estimado, fac_7: p.fac_7 ?? "", cob: p.cob !== false,
    lineasDetalle: p.lineasDetalle, lineas: p.lineasDetalle || p.lineas, facial_hecho: p.facial_hecho,
    gift_card: p.gift_card, paquete: p.paquete, compra_pack_3: p.compra_pack_3, orig: p.orig, extras: p.extras,
  };
}

function L(codigo: string, qty: number, total: number, producto = ""): Row {
  const unit = qty ? Math.round((total / qty / 1.15) * 100) / 100 : 0;
  return { codigo, sku: codigo, producto, cantidad: qty, precio_unit: unit, descuento: 0, subtotal: Math.round((total / 1.15) * 100) / 100, iva: Math.round((total - total / 1.15) * 100) / 100, total };
}

const FAC_2973: FacturaVivo = {
  factura: "001-001-000002973", seq: 2973, fecha: "2026-11-18", cliente: "C O",
  total: 304.64,
  lineas: [
    L("SUNSU-AS-010", 1, 39.67),
    L("SUNSU-AS-002", 1, 18.99),
    L("SUNSU-HT-007", 1, 43.99),
    L("SUNSU-02", 2, 130, "Facial Reparación"),
    L("SUNSU-31", 2, 30, "PDRN Serum"),
    L("SUNSU-15", 1, 15, "Ampolla"),
    L("SUNSU-VK-007", 1, 26.99),
  ],
};

const TK_1916 = tk({
  id: 1908, clave: "TK-SO-1916", nombre: "Carolina", apellido: "O", estimado: 157.97, fac_7: "2973",
  facial_hecho: "SUNSU-02 Facial Reparación",
  lineasDetalle: [
    { sku: "SUNSU-02", nombre: "Facial Reparación", cantidad: 1, precio_unit: 65, total_linea: 65, tipo: "facial" },
    { sku: "SUNSU-15", nombre: "Ampolla Especial · Hidratación", cantidad: 1, precio_unit: 15, total_linea: 15, tipo: "extra" },
    { sku: "SUNSU-31", nombre: "PDRN Serum", cantidad: 1, precio_unit: 15, total_linea: 15, tipo: "extra" },
    { sku: "SUNSU-AS-002", nombre: "AS-002", cantidad: 1, precio_unit: 18.99, total_linea: 18.99, tipo: "producto" },
    { sku: "SUNSU-HT-007", nombre: "HT-007", cantidad: 1, precio_unit: 43.99, total_linea: 43.99, tipo: "producto" },
  ],
});

const TK_1920 = tk({
  id: 1912, clave: "TK-SO-1920", nombre: "David", apellido: "A", estimado: 146.66, fac_7: "2973",
  facial_hecho: "SUNSU-02 Facial Reparación",
  lineasDetalle: [
    { sku: "SUNSU-02", nombre: "Facial Reparación", cantidad: 1, precio_unit: 65, total_linea: 65, tipo: "facial" },
    { sku: "SUNSU-31", nombre: "PDRN Serum", cantidad: 1, precio_unit: 15, total_linea: 15, tipo: "extra" },
    { sku: "SUNSU-AS-010", nombre: "AS-010", cantidad: 1, precio_unit: 39.67, total_linea: 39.67, tipo: "producto" },
    { sku: "SUNSU-VK-007", nombre: "VK-007", cantidad: 1, precio_unit: 26.99, total_linea: 26.99, tipo: "producto" },
  ],
});

function flagsDe(tickets: Row[], links: LinkCuadre[], facs: FacturaVivo[]) {
  return flagsDeseadas({ tickets, links, facturas: facs, hoyGye: "2026-11-19", importadoGye: "2026-11-19", catalogo: CAT });
}

describe("TK143 · 2 tickets que juntos cuadran 1 factura", () => {
  it("el matching vincula ambos tickets a la misma factura", () => {
    const links = cruzar([FAC_2973], [TK_1916, TK_1920], { catalogo: CAT });
    assert.equal(links.length, 2);
    assert.ok(links.every((L) => L.factura === FAC_2973.factura));
    assert.ok(links.every((L) => L.estado === "cuadra" || L.estado === "redondeo"));
    assert.ok(Math.abs(links[0].total_tickets - 304.63) < 0.02);
    assert.equal(links[0].total_factura, 304.64);
  });

  it("sin número de factura, el mejor match por SKU del mismo día también une los dos", () => {
    const a = { ...TK_1916, fac_7: "" };
    const b = { ...TK_1920, fac_7: "" };
    const links = cruzar([FAC_2973], [a, b], { catalogo: CAT });
    assert.equal(links.length, 2);
    assert.ok(links.every((L) => L.factura === FAC_2973.factura));
    assert.ok(links.some((L) => L.tipo === "sku_fecha_suma" || L.tipo === "numero"));
  });

  it("0 flags cuando la suma del grupo cuadra, y cuadre_lineas pinta ambos en verde sin filas fantasma", () => {
    const links = cruzar([FAC_2973], [TK_1916, TK_1920], { catalogo: CAT });
    const flags = flagsDe([TK_1916, TK_1920], links, [FAC_2973]);
    assert.equal(flags.length, 0, flags.map((f) => f.motivo + ": " + f.detalle).join(" | "));

    const avisos = compararFacturaYTickets(FAC_2973.lineas as Row[], [TK_1916, TK_1920], CAT, CAT);
    assert.equal(avisos.filter((a) => a.tipo !== "sugerencia" && a.tipo !== "cambio_sku").length, 0, JSON.stringify(avisos));

    const visA = compararLineasVisual([TK_1916, TK_1920], FAC_2973.lineas as Row[], CAT, undefined, { focus: 0 });
    const visB = compararLineasVisual([TK_1920, TK_1916], FAC_2973.lineas as Row[], CAT, undefined, { focus: 0 });
    assert.equal(visA.filter((x) => x.estado === "falta" || x.estado === "diff" || x.estado === "sobra").length, 0, JSON.stringify(visA));
    assert.equal(visB.filter((x) => x.estado === "falta" || x.estado === "diff" || x.estado === "sobra").length, 0, JSON.stringify(visB));
    assert.ok(visA.every((x) => x.estado === "ok" || x.estado === "canje_ok"));
    assert.equal(visA.filter((x) => x.ticket_i != null).length, 5); // solo líneas de 1916
    assert.equal(visA.some((x) => /AS-010|VK-007/.test(x.sku + x.codigo + x.nombre) && x.estado === "falta"), false);

    const rA = resumenCuadre(visA, FAC_2973.factura, { hermanos: ["TK-SO-1920"] });
    assert.equal(rA.ok, true);
    assert.match(rA.texto, /Cuadra/);
    assert.match(rA.texto, /TK-SO-1920/);
    assert.match(rA.texto, /001-001-000002973/);
  });
});

describe("TK143 · 3 tickets compartiendo 1 factura", () => {
  it("la suma exacta cuadra en verde y vincula los tres", () => {
    const fac: FacturaVivo = {
      factura: "001-001-000003200", seq: 3200, fecha: "2026-11-18", cliente: "GRUPO",
      total: 95,
      lineas: [L("SUNSU-02", 1, 65, "Facial"), L("SUNSU-31", 2, 30, "PDRN")],
    };
    const a = tk({ id: 1, clave: "TK-SO-A", nombre: "A", apellido: "A", estimado: 65, lineasDetalle: [{ sku: "SUNSU-02", nombre: "Facial", cantidad: 1, precio_unit: 65, total_linea: 65, tipo: "facial" }] });
    const b = tk({ id: 2, clave: "TK-SO-B", nombre: "B", apellido: "B", estimado: 15, lineasDetalle: [{ sku: "SUNSU-31", nombre: "PDRN", cantidad: 1, precio_unit: 15, total_linea: 15, tipo: "extra" }] });
    const c = tk({ id: 3, clave: "TK-SO-C", nombre: "C", apellido: "C", estimado: 15, lineasDetalle: [{ sku: "SUNSU-31", nombre: "PDRN", cantidad: 1, precio_unit: 15, total_linea: 15, tipo: "extra" }] });
    const links = cruzar([fac], [a, b, c], { catalogo: CAT });
    assert.equal(links.length, 3);
    assert.ok(links.every((L) => L.factura === fac.factura && (L.estado === "cuadra" || L.estado === "redondeo")));
    const flags = flagsDe([a, b, c], links, [fac]);
    assert.equal(flags.length, 0, flags.map((f) => f.detalle).join(" | "));
    const vis = compararLineasVisual([a, b, c], fac.lineas as Row[], CAT, undefined, { focus: 0 });
    assert.equal(vis.some((x) => x.estado === "falta" || x.estado === "diff"), false);
    assert.equal(resumenCuadre(vis, fac.factura, { hermanos: ["TK-SO-B", "TK-SO-C"] }).ok, true);
  });
});

describe("TK143 · diferencia real del grupo (no ítems del ticket hermano)", () => {
  it("marca solo el producto que falta en todos o la diferencia de precio, no los ítems del hermano", () => {
    const fac: FacturaVivo = {
      factura: "001-001-000003201", seq: 3201, fecha: "2026-11-18", cliente: "PAR",
      total: 110,
      lineas: [L("SUNSU-02", 2, 130, "Facial")], // tickets suman 1 facial $65 — falta uno de verdad
    };
    const a = tk({ id: 11, clave: "TK-SO-11", nombre: "A", apellido: "A", estimado: 65, fac_7: "3201", lineasDetalle: [{ sku: "SUNSU-02", nombre: "Facial", cantidad: 1, precio_unit: 65, total_linea: 65, tipo: "facial" }] });
    const b = tk({ id: 12, clave: "TK-SO-12", nombre: "B", apellido: "B", estimado: 15, fac_7: "3201", lineasDetalle: [{ sku: "SUNSU-31", nombre: "PDRN", cantidad: 1, precio_unit: 15, total_linea: 15, tipo: "extra" }] });
    const links = cruzar([fac], [a, b], { catalogo: CAT });
    const flags = flagsDe([a, b], links, [fac]);
    assert.ok(flags.length > 0, "debe haber flag por diferencia real");
    const det = flags.map((f) => f.detalle).join(" ");
    // No debe acusar al PDRN del hermano como 'falta en ticket' al revisar el facial, ni pintar el facial del hermano como sobra si se agrega bien… 
    // En el detalle del grupo: falta un facial o distinto qty, y PDRN sobra de verdad (no está en la factura).
    const visA = compararLineasVisual([a, b], fac.lineas as Row[], CAT, undefined, { focus: 0 });
    assert.equal(visA.some((x) => x.estado === "falta" && /31|PDRN/i.test(x.sku + x.nombre)), false, "no hay fila fantasma del PDRN en el ticket A");
    assert.ok(visA.some((x) => x.estado === "diff" && /02|Facial/i.test(x.sku + x.nombre)), "el facial del grupo no cuadra (×1 vs ×2)");
    const visB = compararLineasVisual([b, a], fac.lineas as Row[], CAT, undefined, { focus: 0 });
    assert.ok(visB.some((x) => x.estado === "sobra" && /31|PDRN/i.test(x.sku + x.nombre)), "el PDRN del grupo sí sobra de verdad");
    assert.equal(visB.filter((x) => x.estado === "falta" && /02|Facial/i.test(x.sku + x.nombre + (x.razon || ""))).length, 0, "al abrir B no aparece una fila fantasma del facial que está en A; el gap se ve en A");
  });

  it("cortesía $0 y sesión del paquete comprado en el mismo ticket no inflan el total ni generan rojo", () => {
    const fac: FacturaVivo = {
      factura: "001-001-000002902", seq: 2902, fecha: "2026-11-07", cliente: "J A",
      total: 205.50,
      lineas: [L("SUNSU-31", 2, 30, "PDRN"), L("SUNSU-18", 1, 175.50, "Paquete x3 Facial Reparación")],
    };
    const a = tk({
      id: 1806, clave: "TK-SO-1813", fecha: "2026-11-07", nombre: "Jose", apellido: "A", estimado: 190.50, fac_7: "2902",
      facial_hecho: "SUNSU-02 Facial Reparación", compra_pack_3: "SUNSU-18 x3 Facial Reparación",
      extras: "SUNSU-15 Ampolla Especial · Hidratación [CORTESIA: Cumpleaños] | SUNSU-31 PDRN Serum",
    });
    const b = tk({
      id: 1807, clave: "TK-SO-1814", fecha: "2026-11-07", nombre: "Rachel", apellido: "S", estimado: 14.99, fac_7: "2902",
      facial_hecho: "SUNSU-02 Facial Reparación", paquete: "SI, 1/3, José A.",
      extras: "SUNSU-31 PDRN Serum",
    });
    const la = lineasDeTicket(a, CAT);
    const cortesia = la.find((l) => /15/.test(l.sku || l.codigo));
    assert.ok(cortesia && cortesia.canje && !(cortesia.totalCon > 0), "cortesía queda en $0");
    const facial = la.find((l) => /02/.test(l.sku || "") && /facial/i.test(l.nombre));
    assert.ok(facial && facial.canje && !(facial.totalCon > 0), "sesión del pack queda en $0");
    const links = cruzar([fac], [a, b], { catalogo: CAT });
    const flags = flagsDe([a, b], links, [fac]);
    assert.equal(flags.length, 0, flags.map((f) => f.motivo + ": " + f.detalle).join(" | "));
  });
});

describe("TK143 · no rompe regresiones TK138–TK142 ni Gift Cards", () => {
  it("un canje $0 (paquete o gift card) sigue siendo OK sin factura y no genera flag de producto", () => {
    const fac: FacturaVivo = {
      factura: "001-001-000003202", seq: 3202, fecha: "2026-11-18", cliente: "K C",
      total: 175.50,
      lineas: [L("SUNSU-18", 1, 175.50, "Paquete")],
    };
    const t1 = tk({
      id: 51, clave: "TK-SO-51", nombre: "Karina", apellido: "C", estimado: 175.50, fac_7: "3202",
      gift_card: "SI, 26-117", facial_hecho: "SUNSU-02 Facial Reparación",
      lineasDetalle: [
        { sku: "SUNSU-02", nombre: "Facial Reparación", cantidad: 1, precio_unit: 0, total_linea: 0, tipo: "facial", canje: true },
        { sku: "SUNSU-18", nombre: "Paquete x3", cantidad: 1, precio_unit: 175.50, total_linea: 175.50, tipo: "paquete" },
      ],
    });
    const vis = compararLineasVisual([t1], fac.lineas as Row[], CAT);
    const facial = vis.find((x) => /02/.test(x.sku) || /Facial/i.test(x.nombre));
    assert.ok(facial && facial.estado === "canje_ok");
    assert.equal(vis.some((x) => x.estado === "falta" || x.estado === "diff" || x.estado === "sobra"), false);
    const links = cruzar([fac], [t1], { catalogo: CAT });
    const flags = flagsDe([t1], links, [fac]);
    assert.equal(flags.length, 0, flags.map((f) => f.detalle).join(" | "));
  });

  it("el cache live es TK143 y el archivo de pruebas queda en el paquete", () => {
    const sw = readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
    assert.match(sw, /sunsu-beta-2026-11-19-TK147/);
    const pkg = readFileSync(new URL("../../../package.json", import.meta.url), "utf8");
    assert.match(pkg, /tk143_cuadre_multi_ticket\.test\.ts/);
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    assert.match(beta, /20261119tk147/);
    assert.doesNotMatch(beta, /20261119tk142/);
  });
});
