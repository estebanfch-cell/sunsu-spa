// TK150: un ticket con 2+ faciales o paquetes en beta_ticket_lineas no puede perder comisión.
// Caso real TK-SO-1938 (2 × SUNSU-40 → Andrea $6, no $3). El cob nulo de un ticket beta sigue sumando.
// Productos/extras/paquetes en líneas se recogen con lineas_beta true o false, sin duplicar.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { CFG_DEF, calcularCiclo, facialesDeTicket, type CosmMark, type TicketIn } from "./domain.ts";
import { overlayComision } from "./ticket_beta.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import type { Row } from "./domain.ts";

const andreaMark: CosmMark = { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es: true, activa: true };

function baseIn(): TicketIn {
  return {
    fecha: "2026-11-19", cosm: "Andrea Robles", cedula: "0100000001",
    facial: "SUNSU-40 Facial Reset 3x1", pack3: "", pack6: "", extras: "SUNSU-15 Ampolla Especial",
    exclFacial: false, exclPaquete: false, exclProducto: false, exclExtras: false,
    productos: [],
  };
}

function ctx(db: MemoryDb, now = new Date("2026-11-19T20:00:00Z")) {
  const token = "t-emi";
  db.tables.set("sesiones", [{ token, uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" }]);
  const users = db.tables.get("usuarios") || [];
  if (!users.some((u) => u.id === "emi")) users.push({ id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false });
  db.tables.set("usuarios", users);
  return {
    db, now,
    env: {} as Record<string, string | undefined>,
    fetchImpl: fetch,
    legacyLogin: async () => ({ ok: false }),
    token,
  };
}

function seed1938(extra: Record<string, Row[]> = {}) {
  return new MemoryDb({
    usuarios: [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
      { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
    ],
    cosmetologas: [
      { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true, comision_faciales: true },
    ],
    tickets: [
      {
        id: 646230, so_num: "TK-SO-1938", beta_num: "TK-20261119-1584",
        timestamp: "2026-11-19T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0100000001",
        facial_hecho: "SUNSU-40 Facial Reset 3x1", compra_pack_3: "", compra_pack_6: "",
        servicios_adicionales: "SUNSU-15 Ampolla Especial", cob: null, fac: true, origin: "beta", orig: {},
      },
    ],
    beta_tickets: [{ clave: "TK-SO-1938", lineas_beta: true, excluir_cosmetologa: false }],
    beta_ticket_lineas: [
      { ticket_clave: "TK-SO-1938", orden: 1, tipo: "facial", sku: "40", nombre: "SUNSU-40 Facial Reset 3x1 · Canje paquete PACK-421 · sesión 0/3", cantidad: 1, excluir_comision: false },
      { ticket_clave: "TK-SO-1938", orden: 2, tipo: "extra", sku: "15", nombre: "Ampolla Especial", cantidad: 2, excluir_comision: false },
      { ticket_clave: "TK-SO-1938", orden: 3, tipo: "facial", sku: "40", nombre: "FACIAL RESET 3x1", cantidad: 1, excluir_comision: false },
    ],
    catalogo: [
      { sku: "SUNSU-40", producto_servicio: "Facial Reset 3x1", subtotal: 82.61, total_con_iva: 95, tipo: "FACIAL", activo: true, orig: {} },
      { sku: "SUNSU-15", producto_servicio: "Ampolla Especial", subtotal: 13.04, total_con_iva: 15, tipo: "EXTRA", activo: true, orig: {} },
      { sku: "SUNSU-44", producto_servicio: "Paquete (3) Faciales Reset 3x1", subtotal: 223.04, tipo: "PAQUETE", activo: true, orig: {} },
      { sku: "SUNSU-ML-002", producto_servicio: "Crema ML", subtotal: 20, precio_compra: 8, tipo: "PRODUCTO", activo: true, orig: {} },
    ],
    ...extra,
  });
}

describe("TK150: comisiones multi-facial y resumen de Hoy", () => {
  it("overlay TK-SO-1938 recorre los 2 faciales (sku 40) y las 2 ampollas", () => {
    const t = baseIn();
    const cab = { lineas_beta: true, excluir_cosmetologa: false };
    const lineas = [
      { tipo: "facial", sku: "40", nombre: "SUNSU-40 Facial Reset 3x1 · Canje", cantidad: 1, excluir_comision: false },
      { tipo: "extra", sku: "15", nombre: "Ampolla Especial", cantidad: 2, excluir_comision: false },
      { tipo: "facial", sku: "40", nombre: "FACIAL RESET 3x1", cantidad: 1, excluir_comision: false },
    ];
    const o = overlayComision(t, cab, lineas);
    assert.equal(o.exclFacial, false);
    assert.equal(facialesDeTicket(o).reduce((a, f) => a + f.cantidad, 0), 2);
    const r = calcularCiclo([o], [andreaMark], CFG_DEF, "2026-10-26");
    const a = r.personas.find((p) => p.cosm.startsWith("Andrea"))!;
    assert.equal(a.faciales, 2);
    assert.equal(a.comFaciales, 6, "2 × SUNSU-40 = $3+$3, no el $3 del facial_hecho legado");
    assert.equal(a.extras, 2);
    assert.equal(a.comExtras, 2);
  });

  it("una sola línea facial con cantidad 2 también suma $6", () => {
    const o = overlayComision(baseIn(), { lineas_beta: true }, [
      { tipo: "facial", sku: "40", nombre: "FACIAL RESET 3x1", cantidad: 2, excluir_comision: false },
    ]);
    const a = calcularCiclo([o], [andreaMark], CFG_DEF, "2026-10-26").personas[0];
    assert.equal(a.faciales, 2);
    assert.equal(a.comFaciales, 6);
  });

  it("si se excluye un facial, el otro sigue pagando (no se apaga todo el ticket)", () => {
    const o = overlayComision(baseIn(), { lineas_beta: true }, [
      { tipo: "facial", sku: "40", nombre: "Canje", cantidad: 1, excluir_comision: true },
      { tipo: "facial", sku: "40", nombre: "FACIAL RESET 3x1", cantidad: 1, excluir_comision: false },
    ]);
    assert.equal(o.exclFacial, false);
    const a = calcularCiclo([o], [andreaMark], CFG_DEF, "2026-10-26").personas[0];
    assert.equal(a.faciales, 1);
    assert.equal(a.comFaciales, 3);
  });

  it("getDashCosm: TK-SO-1938 con cob nulo suma $6 a Andrea y Hoy es el día Ecuador", async () => {
    const db = seed1938({
      tickets: [
        {
          id: 646230, so_num: "TK-SO-1938", beta_num: "TK-20261119-1584",
          timestamp: "2026-11-19T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0100000001",
          facial_hecho: "SUNSU-40 Facial Reset 3x1", compra_pack_3: "", compra_pack_6: "",
          servicios_adicionales: "SUNSU-15 Ampolla Especial", cob: null, fac: true, origin: "beta", orig: {},
        },
        {
          id: 100, so_num: "TK-SO-1800", timestamp: "2026-11-18T15:00:00Z", atendido_por: "Andrea Robles",
          id_3: "0100000002", facial_hecho: "SUNSU-40 Facial Reset 3x1", cob: true, fac: true, origin: "beta", orig: {},
        },
      ],
    });
    const c = ctx(db);
    const dash = await handle("getDashCosm", { token: c.token, cosmetologa: "Andrea Robles" }, c) as Row;
    assert.equal(dash.faciales, 3, "2 de hoy + 1 de ayer en el ciclo");
    assert.equal(dash.comFaciales, 9);
    const hoy = dash.hoy as Row;
    assert.equal(hoy.fecha, "2026-11-19");
    assert.equal(hoy.faciales, 2);
    assert.equal(hoy.extras, 2);
    assert.equal(hoy.comFaciales, 6);
    assert.equal(hoy.comExtras, 2);
    assert.equal(hoy.total, 8);
    assert.equal(dash.cicloLabel, "26/10–25/11");

    const tarde = ctx(db, new Date("2026-11-20T04:00:00Z")); // 23:00 del 19 en Ecuador
    const dashTarde = await handle("getDashCosm", { token: tarde.token, cosmetologa: "Andrea Robles" }, tarde) as Row;
    assert.equal((dashTarde.hoy as Row).fecha, "2026-11-19", "Hoy sigue siendo el 19 mientras sea 19 en Ecuador");

    const manana = ctx(db, new Date("2026-11-20T05:00:00Z")); // 00:00 del 20 en Ecuador
    const dashMan = await handle("getDashCosm", { token: manana.token, cosmetologa: "Andrea Robles" }, manana) as Row;
    assert.equal((dashMan.hoy as Row).fecha, "2026-11-20");
    assert.equal((dashMan.hoy as Row).faciales, 0, "ya no suma los faciales del 19 en Hoy");
    assert.equal(dashMan.comFaciales, 9, "el ciclo sí los conserva");
  });

  it("ticket beta con cob nulo y un facial (sin líneas) igual suma comisión", async () => {
    const db = seed1938({
      tickets: [{
        id: 77, so_num: "TK-SO-2001", timestamp: "2026-11-19T16:00:00Z", atendido_por: "Andrea Robles",
        id_3: "0100000099", facial_hecho: "SUNSU-40 Facial Reset 3x1", cob: null, fac: true, origin: "beta", orig: {},
      }],
      beta_tickets: [],
      beta_ticket_lineas: [],
    });
    const dash = await handle("getDashCosm", { token: "t-emi", cosmetologa: "Andrea Robles" }, ctx(db)) as Row;
    assert.equal(dash.faciales, 1);
    assert.equal(dash.comFaciales, 3);
    assert.equal((dash.hoy as Row).faciales, 1);
    assert.equal((dash.hoy as Row).comFaciales, 3);
  });

  it("paquetes, productos y extras en líneas: lineas_beta true y false, sin duplicar ni perder", () => {
    const legacy: TicketIn = {
      fecha: "2026-11-19", cosm: "Andrea Robles", cedula: "0100000003",
      facial: "SUNSU-40", pack3: "SUNSU-44 Paquete (3)", pack6: "", extras: "SUNSU-15 Ampolla Especial",
      exclFacial: false, exclPaquete: false, exclProducto: false, exclExtras: false,
      productos: [{ sku: "ML-002", qty: 1 }], netoPack: 223.04,
    };
    const lineas = [
      { tipo: "facial", sku: "40", nombre: "FACIAL RESET 3x1", cantidad: 1, excluir_comision: false },
      { tipo: "paquete", sku: "44", nombre: "Paquete (3) Faciales Reset 3x1", cantidad: 1, excluir_comision: false, venta_neta: 223.04, total_linea: 256.5 },
      { tipo: "producto", sku: "ML-002", cantidad: 1, excluir_comision: false },
      { tipo: "extra", sku: "15", nombre: "Ampolla Especial", cantidad: 1, excluir_comision: false },
    ];

    const conFlag = overlayComision({ ...legacy }, { lineas_beta: true }, lineas);
    const sinFlag = overlayComision({ ...legacy }, { lineas_beta: false }, lineas);

    for (const o of [conFlag, sinFlag]) {
      const a = calcularCiclo([o], [andreaMark], CFG_DEF, "2026-10-26").personas[0];
      assert.equal(a.faciales, 1, "no duplica el facial legado + la línea");
      assert.equal(a.comFaciales, 3);
      assert.equal(a.paquetes, 1, "no duplica el paquete legado + la línea");
      assert.equal(a.netos[0], 223.04);
      assert.equal(o.productos.reduce((n, p) => n + p.qty, 0), 1, "ML-002 no se duplica");
      assert.equal(a.extras, 1, "la ampolla no se duplica");
    }

    const soloLineas: TicketIn = {
      ...legacy, facial: "", pack3: "", pack6: "", extras: "", productos: [], netoPack: undefined,
    };
    const recovered = overlayComision(soloLineas, { lineas_beta: false }, lineas);
    const b = calcularCiclo([recovered], [andreaMark], CFG_DEF, "2026-10-26").personas[0];
    assert.equal(b.faciales, 1, "con lineas_beta false igual recoge el facial de las líneas");
    assert.equal(b.paquetes, 1, "con lineas_beta false igual recoge el paquete de las líneas");
    assert.equal(recovered.productos.some((p) => p.sku.includes("ML-002") || p.sku.includes("002")), true);
    assert.equal(b.extras, 1);
  });

  it("Mis comisiones (beta.html) muestra el bloque compacto de Hoy junto al ciclo", () => {
    const src = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    const i = src.indexOf("async function renderPersonalComisiones()");
    assert.ok(i > 0);
    const bloque = src.slice(i, src.indexOf("function clavePeriodoActual", i));
    assert.match(bloque, /com-hoy/);
    assert.match(bloque, /Hoy/);
    assert.match(bloque, /cicloLabel|Acumulado del ciclo/);
    assert.match(bloque, /Faciales \$\{esc\(hoy\.faciales/);
    assert.match(bloque, /Paquetes \$\{esc\(hoy\.paquetes/);
    assert.match(bloque, /Extras \$\{esc\(hoy\.extras/);
    assert.match(bloque, /Productos \$\{esc\(hoy\.productos/);
    assert.match(src, /\.com-hoy-row/);
  });
});
