// TK145 (Emilia 19/11): ítems a $0 no disparan alerta roja; montoLinea respeta total 0;
// el descuento del ticket se aplica al comparar contra la factura; flags legacy migo:<id>:<fac> se cierran.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Row } from "./domain.ts";
import { compararLineas, montoLinea, type LineaNorm } from "./migo_lineas.ts";
import { compararLineasVisual, descuentoDeTicket, esCanjeCero, resumenCuadre } from "./cuadre_lineas.ts";
import { totalTicketCuadre } from "./cuadre_sku.ts";
import { flagsLegacyACerrar } from "./migo_cuadre_api.ts";
import { tipoSinCobro } from "./sin_cobro.ts";

const ln = (p: Partial<LineaNorm> & { sku: string }): LineaNorm => ({
  sku: p.sku, codigo: p.codigo || p.sku, nombre: p.nombre || p.sku,
  cantidad: p.cantidad ?? 1, unitSin: p.unitSin ?? 0, descuento: p.descuento ?? 0,
  subtotalSin: p.subtotalSin ?? 0, totalCon: p.totalCon ?? 0, canje: p.canje, mejoraPaquete: p.mejoraPaquete,
});

describe("TK145 · montoLinea respeta un total explícito de $0", () => {
  it("no reconstruye unitSin × 1.15 cuando totalCon es 0", () => {
    assert.equal(montoLinea(ln({ sku: "AS-009", totalCon: 0, unitSin: 24.5, subtotalSin: 24.5, cantidad: 1 })), 0);
    assert.equal(montoLinea(ln({ sku: "44", totalCon: 256.5, unitSin: 223.04, cantidad: 1 })), 256.5);
  });
});

describe("TK145 · ítems a $0 son canje_ok y nunca «sobra en ticket»", () => {
  it("promo/muestra/cortesía a $0, sin etiqueta canje, es canje_ok y no «No está en la factura»", () => {
    const muestra = ln({ sku: "15", codigo: "SUNSU-15", nombre: "Ampolla muestra", totalCon: 0, unitSin: 20, canje: false });
    assert.equal(esCanjeCero(muestra), true);
    const vis = compararLineasVisual([{
      id: 1, so_num: "TK-SO-1", estimado: 95,
      lineasDetalle: [
        { sku: "40", nombre: "Reset", cantidad: 1, precio_unit: 95, total_linea: 95, tipo: "facial" },
        { sku: "15", nombre: "Ampolla muestra", cantidad: 1, precio_unit: 20, total_linea: 0, tipo: "extra" },
      ],
    }], [
      { codigo: "SUNSU-40", sku: "SUNSU-40", cantidad: 1, precio_unit: 82.61, subtotal: 82.61, iva: 12.39, total: 95 },
    ]);
    const extra = vis.find((x) => /15/.test(x.sku + x.codigo));
    assert.equal(extra?.estado, "canje_ok");
    assert.match(extra?.razon || "", /OK sin factura \(\$0\)/);
    assert.equal(vis.some((x) => x.estado === "sobra"), false);
    assert.equal(resumenCuadre(vis, "001-001-000002909").ok, true);
  });

  it("compararLineas no emite «Sobra en ticket» por un ítem a $0 aunque tenga unitSin de lista", () => {
    const fac: LineaNorm[] = [ln({ sku: "40", codigo: "SUNSU-40", nombre: "Reset", totalCon: 95, unitSin: 82.61 })];
    const tks: LineaNorm[] = [
      ln({ sku: "40", codigo: "SUNSU-40", nombre: "Reset", totalCon: 95, unitSin: 82.61 }),
      ln({ sku: "15", codigo: "SUNSU-15", nombre: "Muestra", totalCon: 0, unitSin: 20, canje: false }),
    ];
    const avisos = compararLineas(fac, tks);
    assert.equal(avisos.some((a) => a.tipo === "sobra" || /Sobra en ticket/i.test(a.texto)), false);
  });

  it("una diferencia por mejora con monto > 0 no se trata como $0", () => {
    const mejora = ln({ sku: "42", totalCon: 30, unitSin: 26.09, mejoraPaquete: true });
    assert.equal(esCanjeCero(mejora), false);
    assert.equal(montoLinea(mejora), 30);
  });
});

describe("TK145 · el descuento del ticket se aplica al comparar contra la factura", () => {
  it("lee Desc$57.18 de las notas y descuento_monto de beta", () => {
    assert.equal(descuentoDeTicket({ notas_generales: "Canjea sesión. · 🏷 Descuento: Desc$57.18 (IVA incl., $49.72 sin IVA)" }), 57.18);
    assert.equal(descuentoDeTicket({ descuento_monto: 57.18, notas_generales: "otra cosa" }), 57.18);
    assert.equal(descuentoDeTicket({ notas_generales: "sin descuento" }), 0);
  });

  it("paquete en lista $256.50 con desc $57.18 cuadra con factura $199.32; total ticket $235.31", () => {
    const tk = {
      id: 1818, so_num: "TK-SO-1825", estimado: 235.31, descuento_monto: 57.18,
      notas_generales: "Canjea su última sesión. · 🏷 Descuento: Desc$57.18 (IVA incl., $49.72 sin IVA)",
      paquete: "SI, 3/3. Y 1/3", facial_hecho: "SUNSU-40 Facial Reset 3x1", compra_pack_3: "SUNSU-44 x3 Facial Reset 3x1",
      lineasDetalle: [
        { sku: "40", nombre: "Facial Reset 3x1", cantidad: 1, precio_unit: 0, total_linea: 0, tipo: "facial", canje: true },
        { sku: "44", nombre: "Paquete (3) Faciales Reset 3x1", cantidad: 1, precio_unit: 256.50, total_linea: 256.50, tipo: "paquete" },
        { sku: "VK-011", nombre: "Producto", cantidad: 1, precio_unit: 35.99, total_linea: 35.99, tipo: "producto" },
      ],
    };
    const fac = [
      { codigo: "SUNSU-44", sku: "SUNSU-44", producto: "PAQUETE (3) FACIALES RESET 3x1", cantidad: 1, precio_unit: 223.04, descuento: 49.72, subtotal: 173.32, iva: 26.00, total: 199.32 },
      { codigo: "SUNSU-VK-011", sku: "SUNSU-VK-011", producto: "Producto", cantidad: 1, precio_unit: 31.30, descuento: 0, subtotal: 31.30, iva: 4.69, total: 35.99 },
    ];
    assert.equal(totalTicketCuadre(tk), 235.31);
    const C = compararLineasVisual([tk], fac);
    const pack = C.find((x) => /44/.test(x.sku + x.codigo));
    const canje = C.find((x) => x.estado === "canje_ok");
    assert.equal(pack?.estado, "ok", pack?.razon);
    assert.ok(canje);
    assert.equal(C.some((x) => x.estado === "diff" || x.estado === "sobra" || x.estado === "falta"), false);
    assert.equal(resumenCuadre(C, "001-001-000002909").ok, true);
  });
});

describe("TK145 · flags legacy migo:<ticket_id>:<num_fac> se cierran al cuadrar", () => {
  it("cierra migo:1819:2910 cuando ya no hay diferencia de monto/líneas", () => {
    const prev: Row[] = [
      { id: "migo:1819:2910", ticket_id: 1819, ticket_clave: "TK-SO-1826", resuelto: false, motivo: "Gift card 26-092 no cuadra" },
      { id: "migo:1819:monto", ticket_id: 1819, resuelto: true },
      { id: "migo:1818:2909", ticket_id: 1818, resuelto: false },
    ];
    const cerrar = flagsLegacyACerrar(prev, new Set());
    assert.ok(cerrar.some((f) => f.id === "migo:1819:2910"));
    // want vacío = todos los tickets cuadraron: también se cierra la legacy de 1818
    assert.ok(cerrar.some((f) => f.id === "migo:1818:2909"));
    const solo1826 = flagsLegacyACerrar(prev, new Set(["migo:1818:monto"]));
    assert.deepEqual(solo1826.map((f) => f.id), ["migo:1819:2910"]);
  });

  it("no cierra la flag legacy si el ticket todavía tiene diferencia de monto", () => {
    const prev: Row[] = [{ id: "migo:1819:2910", ticket_id: 1819, resuelto: false }];
    const cerrar = flagsLegacyACerrar(prev, new Set(["migo:1819:monto"]));
    assert.equal(cerrar.length, 0);
  });
});

describe("TK145 · cortesía $0 no queda como por cobrar / sin factura", () => {
  it("paquete CORTESIA, comp Cortesía o [CORTESIA] en notas, con estimado 0, es tipo cortesia", () => {
    assert.equal(tipoSinCobro({ estimado: 0, paquete: "CORTESIA", facial_hecho: "SUNSU-40 Facial Reset 3x1" }), "cortesia");
    assert.equal(tipoSinCobro({ estimado: 0, comp: "Cortesía", notas_generales: "sesión" }), "cortesia");
    assert.equal(tipoSinCobro({ estimado: 0, notas_generales: "Próxima sesión: reset\n[CORTESIA] Marcado como cortesía $0 aprobado por Emilia" }), "cortesia");
    assert.equal(tipoSinCobro({ estimado: 95, paquete: "CORTESIA" }), null, "si cobró no es sin cobro");
  });
});

describe("TK145 · UI", () => {
  it("mc-tickets pinta $0 como canje_ok / OK sin factura ($0)", () => {
    const js = readFileSync(new URL("../../../mc-tickets.js", import.meta.url), "utf8");
    assert.match(js, /OK sin factura \(\$0\)/);
    assert.match(js, /Canje · OK sin factura/);
    assert.match(js, /!\(Number\(l\.total_linea\) > 0\)/);
  });
});
