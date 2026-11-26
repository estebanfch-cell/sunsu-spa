import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CICLO_TRAMOS_121520_DESDE,
  TRAMOS_PAQUETE,
  TRAMOS_PAQUETE_121520,
  cfgDesdeReglas,
  comisionPaquetesTramo,
  desglosePaquetesTramo,
  facDigitosDe,
  netoPaqueteReal,
  tramosPorCiclo,
  type TicketIn,
} from "./domain.ts";
import { aplicarNetosRealesPaquete, mapaSubtotalMigoPaquetes } from "./ticket_beta.ts";

describe("tramos 12-15-20 por ciclo y base neta real", () => {
  it("ciclos hasta el 25-nov-2026 siguen 10-10-10; desde el 26-nov-2026 usan 12-15-20", () => {
    assert.equal(CICLO_TRAMOS_121520_DESDE, "2026-11-26");
    const nov = tramosPorCiclo("2026-10-26");
    assert.deepEqual(nov.map((t) => [t.desde, t.hasta, t.valor]), TRAMOS_PAQUETE.map((t) => [t.desde, t.hasta, t.valor]));
    assert.deepEqual(tramosPorCiclo("2026-11-25").map((t) => t.hasta), [10, 20, 30, 100000]);
    const dic = tramosPorCiclo("2026-11-26");
    assert.deepEqual(dic.map((t) => [t.desde, t.hasta, t.valor]), TRAMOS_PAQUETE_121520.map((t) => [t.desde, t.hasta, t.valor]));
    assert.deepEqual(dic.map((t) => t.hasta), [12, 27, 47, 100000]);
    assert.deepEqual(tramosPorCiclo("2026-12-26").map((t) => t.desde), [1, 13, 28, 48]);
  });

  it("fábrica sin reglas: un KV viejo 10-10-10 no pisa el ciclo de diciembre", () => {
    const kvViejo = { tramos: TRAMOS_PAQUETE };
    const nov = cfgDesdeReglas([], "2026-10-26", kvViejo);
    assert.equal(nov.tramos[0].hasta, 10);
    assert.equal(nov.tramos[1].hasta, 20);
    const dic = cfgDesdeReglas([], "2026-11-26", kvViejo);
    assert.equal(dic.tramos[0].hasta, 12);
    assert.equal(dic.tramos[1].hasta, 27);
    const vacio = cfgDesdeReglas([], "2026-11-26", null);
    assert.equal(vacio.tramos[2].hasta, 47);
  });

  it("las etiquetas del desglose (DEV-35) siguen los cortes del ciclo", () => {
    const netos = Array.from({ length: 28 }, () => 100);
    const nov = desglosePaquetesTramo(28, tramosPorCiclo("2026-10-26"), netos);
    assert.deepEqual(nov.filter((t) => t.n).map((t) => `${t.desde}–${t.hasta >= 100000 ? "+" : t.hasta}`), ["1–10", "11–20", "21–30"]);
    const dic = desglosePaquetesTramo(28, tramosPorCiclo("2026-11-26"), netos);
    assert.deepEqual(dic.filter((t) => t.n).map((t) => t.hasta >= 100000 ? `${t.desde}+` : `${t.desde}–${t.hasta}`), ["1–12", "13–27", "28–47"]);
    assert.equal(dic.find((t) => t.desde === 1)?.n, 12);
    assert.equal(dic.find((t) => t.desde === 13)?.n, 15);
    assert.equal(dic.find((t) => t.desde === 28)?.n, 1);
  });

  it("el % se aplica al subtotal real sin IVA; Migo gana al catálogo (caso 1825)", () => {
    assert.equal(netoPaqueteReal({ catalogoSubtotal: 223.04, migoSubtotal: 173.32 }), 173.32);
    assert.equal(comisionPaquetesTramo(11, TRAMOS_PAQUETE, [...Array(10).fill(100), 173.32]).monto
      - comisionPaquetesTramo(10, TRAMOS_PAQUETE, Array(10).fill(100)).monto, 13);
    // Nunca usa el total con IVA como base (223.04 * 1.15 ≈ 256.50).
    assert.equal(netoPaqueteReal({ catalogoSubtotal: 223.04, totalLinea: 256.50 }), 223.04);
    assert.equal(netoPaqueteReal({ ventaNeta: 0, catalogoSubtotal: 223.04 }), 0);
    assert.equal(netoPaqueteReal({ migoSubtotal: 97.36, ventaNeta: 120 }), 97.36);
  });

  it("facDigitosDe cruza fac_7 y el número largo de Migo por el último grupo", () => {
    assert.equal(facDigitosDe({ fac_7: "2909.0" }), "2909");
    assert.equal(facDigitosDe({ datos: { factura: "001-001-000002909" } }), "2909");
    assert.equal(facDigitosDe({ orig: { "# FAC": "3017" } }), "3017");
  });

  it("aplicarNetosRealesPaquete toma el subtotal Migo descontado por SKU, no la factura entera", () => {
    const mapa = mapaSubtotalMigoPaquetes([{
      factura: "001-001-000002909",
      lineas: [
        { codigo: "SUNSU-18", producto: "Facial Reparación x3", subtotal: 173.32 },
        { codigo: "SUNSU-01", producto: "Facial S.O.S", subtotal: 40 },
      ],
    }]);
    const base: TicketIn = {
      fecha: "2026-11-09", cosm: "Andrea", cedula: "0101", facial: "",
      pack3: "SUNSU-18 Facial Reparación x3", pack6: "", extras: "",
      exclFacial: false, exclPaquete: false, exclProducto: false, exclExtras: false,
      productos: [], netoPack: 223.04,
    };
    const out = aplicarNetosRealesPaquete(base, { fac_7: "2909.0", orig: {} }, mapa);
    assert.equal(out.netoPack, 173.32);
  });
});
