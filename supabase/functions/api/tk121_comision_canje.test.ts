// TK121 (Daniela 19/11): un canje de paquete en $0 NO puede mostrar comisión $0 si el facial tiene tarifa.
// Regla (sistema viejo calcularComisiones + Comisiones beta): la sesión hecha paga la tarifa fija del facial
// ($2 / $3 o la de Configuración); la VENTA del paquete paga aparte, solo una vez, por tramo. Nunca se paga dos veces.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CFG_DEF, calcularCiclo, comisionFacialLinea, tarifaFacial, type CosmMark, type TicketIn } from "./domain.ts";
import { lineaCanjeFaltante } from "./canje_linea.ts";
import { recalcular } from "./ventas.ts";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./tickets_beta_api.ts";
import "./handlers_extra.ts";
import type { Row } from "./domain.ts";

const andrea: CosmMark = { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es: true, activa: true };
const daniela: CosmMark = { id: "daniela", nombre: "Daniela Mora", patron: "daniela%", es: true, activa: true };
const evelyn: CosmMark = { id: "evelyn", nombre: "Evelyn Pérez", patron: "evelyn%", es: true, activa: true, comFac: false };
const tk = (fecha: string, cosm: string, facial: string, pack3 = ""): TicketIn => ({
  fecha, cosm, cedula: "0102030405", facial, pack3, pack6: "", extras: "",
  exclFacial: false, exclPaquete: false, exclProducto: false, exclExtras: false, productos: [], netoPack: pack3 ? 223.04 : 0,
});

describe("TK121: comisión del canje de paquete", () => {
  it("la tarifa sale del facial hecho, no del precio $0 de la línea", () => {
    assert.equal(tarifaFacial("SUNSU-40", CFG_DEF), 3);
    assert.equal(tarifaFacial("SUNSU-02", CFG_DEF), 2);
    assert.equal(tarifaFacial("SUNSU-44", CFG_DEF), 0, "el SKU del paquete no es un facial");
    assert.equal(tarifaFacial("SUNSU-40", { ...CFG_DEF, facialSku: { "SUNSU-40": 4 } }), 4, "respeta la tarifa por facial de Configuración");
  });

  it("línea canje «Facial Reset 3x1» qty 1 $0 → $3 congelados (nunca $0)", () => {
    const l = { tipo: "facial", sku: "40", nombre: "Facial Reset 3x1", cantidad: 1, precio_unit: 0, total_linea: 0 };
    assert.equal(comisionFacialLinea(l, CFG_DEF, true), 3);
    assert.equal(comisionFacialLinea({ ...l, excluir: true }, CFG_DEF, true), 0, "excluida a mano sí queda en 0");
    assert.equal(comisionFacialLinea(l, CFG_DEF, false), 0, "aprendiz sin comisión de faciales queda en 0");
  });

  it("la línea automática TK112 paga la tarifa del facial hecho", () => {
    const t = { id: 1, timestamp: "2026-11-19T16:00:00Z", paquete: "SI, 2/3", facial_hecho: "SUNSU-40 Facial Reset 3x1" };
    const paq = { codigo: "PQ-0100", sku: "SUNSU-44", nombre: "SUNSU-44 x3 Facial Reset 3x1", total: 3, usos: [{ slot: 1, usado: true, fecha: "2026-11-01" }, { slot: 2, usado: true, fecha: "2026-11-19" }] };
    const l = lineaCanjeFaltante(t, [], [paq])!;
    assert.equal(l.precio_unit, 0);
    assert.equal(comisionFacialLinea({ sku: l.sku, nombre: l.nombre, cantidad: l.cantidad }, CFG_DEF, true), 3);
  });

  it("editar ticket (recalcular): servicio en $0 paga la tarifa completa", () => {
    const c = recalcular([{ clase: "servicio", sku: "SUNSU-40", nombre: "Facial Reset 3x1", cantidad: 1, precio: 0, descuento_pct: 0, costo: 0 }], 0, CFG_DEF);
    assert.equal(c.comFacial, 3);
    assert.equal(c.total, 0);
  });

  it("no se paga dos veces: venta del paquete = 1 paquete (tramo); cada sesión = tarifa del facial", () => {
    const tks = [
      tk("2026-11-01", "Daniela Mora", "SUNSU-40", "SUNSU-44 x3 Facial Reset 3x1"), // compra + 1ª sesión
      tk("2026-11-10", "Daniela Mora", "SUNSU-40"), // canje 2/3
      tk("2026-11-19", "Andrea Robles", "SUNSU-40"), // canje 3/3 lo hace otra cosmetóloga
      tk("2026-11-19", "Evelyn Pérez", "SUNSU-40"),
    ];
    const r = calcularCiclo(tks, [andrea, daniela, evelyn], CFG_DEF, "2026-10-26");
    const d = r.personas.find((p) => p.cosm.startsWith("Daniela"))!;
    const a = r.personas.find((p) => p.cosm.startsWith("Andrea"))!;
    const e = r.personas.find((p) => p.cosm.startsWith("Evelyn"))!;
    assert.equal(d.faciales, 2); assert.equal(d.comFaciales, 6);
    assert.equal(d.paquetes, 1, "el paquete cuenta una sola vez, en la venta");
    assert.equal(a.comFaciales, 3); assert.equal(a.paquetes, 0, "el canje no cuenta como paquete vendido");
    assert.equal(e.comFaciales, 0, "aprendiz: sin comisión de faciales");
  });

  it("Comisión estimada del ticket (beta-screens.js) paga la tarifa en canje de paquete / cortesía", () => {
    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const i = src.indexOf("function updatePreview(){");
    const bloque = src.slice(i, src.indexOf("var _gcDifEl", i));
    assert.match(bloque, /else if\(!esCanje\)\{ comF=f\.com; facialP=f\.p; \}\s*\/\/ TK121[\s\S]*?else \{ comF=f\.com; \}/);
    assert.match(bloque, /_sinComFaciales_\(CU\.name\)\) comF=0/);
    // Simula el bloque: canje de paquete del Facial Reset 3x1 → $3; la clienta paga $0.
    const run = new Function("T", "FACIALES", "CU", "_sinComFaciales_", "document",
      "let comF=0,comP=0; const esCanje=T.cobro==='paquete'||T.cobro==='giftcard'||T.cobro==='cortesia';" +
      bloque.slice(bloque.indexOf("let facialP")) + "; return {comF, facialP};");
    const F = [{ sku: "SUNSU-40", n: "Facial Reset 3x1", p: 95, com: 3 }];
    for (const cobro of ["paquete", "cortesia"]) {
      const o = run({ facial: "SUNSU-40", cobro }, F, { name: "Daniela Mora" }, () => false, {});
      assert.deepEqual(o, { comF: 3, facialP: 0 }, cobro);
    }
    assert.equal(run({ facial: "SUNSU-40", cobro: "paquete" }, F, { name: "Evelyn" }, () => true, {}).comF, 0);
  });

  it("guardar el ticket congela la comisión del canje en la línea (columna comision TK114)", async () => {
    const db = new MemoryDb({
      usuarios: [{ id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false }],
      cosmetologas: [{ id: "daniela", nombre: "Daniela Mora", patron: "daniela%", es_cosmetologa: true, activa: true }],
      sesiones: [{ token: "t-emi", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" }],
      catalogo: [{ sku: "SUNSU-40", producto_servicio: "Facial Reset 3x1", subtotal: 82.61, total_con_iva: 95, tipo: "FACIAL", activo: true, orig: {} }],
      tickets: [{ id: 9, sheet_row: 9, so_num: "TK-SO-121", timestamp: "2026-11-19T16:20:00Z", atendido_por: "Daniela Mora", id_3: "0101", nombre: "Ana", apellido: "Pérez", facial_hecho: "SUNSU-40 Facial Reset 3x1", paquete: "SI, 2/3", estimado: 0, orig: {} }],
      erp_bodegas: [], erp_stock: [], erp_movimientos: [], app_modulos: [], cabina_inventario: [], inventario_base: [],
      promos: [], beta_tickets: [], beta_ticket_lineas: [], beta_ticket_snaps: [], solicitudes_cambio: [], clientas_registro: [], beta_stock_movimientos: [], paquetes: [],
    });
    const c = { db, now: new Date("2026-11-19T16:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }), token: "t-emi" };
    const h = (a: string, p: Row = {}) => handle(a, { token: c.token, ...p }, c as never) as Promise<Row>;
    const sv = await h("tk_guardar", { clave: "TK-SO-121", lineas: [{ tipo: "facial", sku: "40", nombre: "Facial Reset 3x1", cantidad: 1, precio_unit: 0 }] });
    assert.equal(sv.ok, true, String(sv.error));
    const ln = (db.tables.get("beta_ticket_lineas") || []).find((l) => l.tipo === "facial")!;
    assert.equal(Number(ln.total_linea), 0);
    assert.equal(Number(ln.comision), 3, "canje de paquete: la línea congela $3, no $0");
  });
});
