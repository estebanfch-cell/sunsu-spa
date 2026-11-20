// TK140: dropdown de cosmetóloga en el ticket, default del borrador y recálculo de comisiones.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./tickets_beta_api.ts";
import "./tickets_lista_api.ts";
import { n, s, type Row } from "./domain.ts";
import { comisionUnidad, ventaNetaLineas } from "./productos.ts";
import { staffDeFilas, cosmParaAltaTicket } from "./tickets_staff.ts";

const FAC = "001-001-000002977";
const TABLAS = [
  "app_modulos", "tickets", "beta_tickets", "beta_ticket_flags", "beta_ticket_cancelados",
  "beta_cuadre_link", "beta_migo_importes", "beta_ticket_envios", "beta_citas_ticket",
  "log_acciones", "clientas_registro", "beta_clientes", "beta_ticket_lineas", "beta_ticket_snaps",
  "catalogo", "erp_productos", "erp_bodegas", "erp_stock", "erp_movimientos", "beta_sku_alias",
  "beta_migo_sku_alias", "gift_cards", "paquetes", "solicitudes_cambio", "beta_stock_movimientos",
  "promos", "cabina_inventario", "inventario_base", "beta_migo_borradores", "beta_migo_facturas_vivo",
  "cosmetologas", "cfg_comisiones",
];

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "efch", uid: "efch", rol: "super_admin", name: "EFCH", short: "EFCH", exp: "2099-01-01T00:00:00.000Z" },
    { token: "emi", uid: "u-emi", rol: "super_admin", name: "Emi", short: "Emi", exp: "2099-01-01T00:00:00.000Z" },
    { token: "and", uid: "u-and", rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  const users = [
    { id: "efch", nombre: "EFCH", short: "EFCH", rol: "super_admin" },
    { id: "u-emi", nombre: "Emi", short: "Emi", rol: "super_admin" },
    { id: "u-and", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa" },
    { id: "u-dan", nombre: "Daniela Mora", short: "Daniela", rol: "cosmetologa" },
    { id: "u-ev", nombre: "Evelyn Anabel Toapanta Quishpe", short: "Evelyn", rol: "cosmetologa" },
  ];
  db.tables.set("app_usuarios", users);
  db.tables.set("usuarios", users);
  for (const t of TABLAS) if (!db.tables.has(t)) db.tables.set(t, []);
  db.tables.set("cosmetologas", [
    { nombre: "Andrea Robles", nombre_mostrar: "Andrea", activa: true, es_cosmetologa: true, comision_faciales: true },
    { nombre: "Daniela Mora", nombre_mostrar: "Daniela", activa: true, es_cosmetologa: true, comision_faciales: true },
    { nombre: "Evelyn Toapanta", nombre_mostrar: "Evelyn", activa: true, es_cosmetologa: true, comision_faciales: false },
  ]);
  db.tables.set("catalogo", [
    { sku: "SUNSU-AS-002", nombre: "Jabón", producto_servicio: "Jabón", tipo: "PRODUCTO", total_con_iva: 18.99, subtotal: 16.51, precio_compra: 11.26, compra_comision: 11.26, activo: true },
    { sku: "SUNSU-31", nombre: "PDRN SERUM", producto_servicio: "PDRN SERUM", tipo: "SERVICIO ADD-ON", total_con_iva: 15, subtotal: 13.04, precio_compra: null, compra_comision: null, activo: true },
  ]);
  db.tables.set("erp_productos", [
    { id: "p-as002", sku: "AS-002", nombre: "Jabón", clase: "producto", uso: "venta", activo: true },
    { id: "p-31", sku: "31", nombre: "PDRN SERUM", clase: "servicio", uso: "venta", activo: true },
  ]);
  const c = { db, now: new Date("2026-11-19T20:22:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (tok: string, a: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok } as never) as Promise<Row>;
  return { db, h };
}

function comiEsperada(totales: number[], total: number, compra: number) {
  const nets = ventaNetaLineas(totales.map((t) => ({ total_linea: t })), total);
  return { nets, comision: comisionUnidad(nets[0], compra) };
}

describe("TK140 cosmetóloga editable y default del borrador", () => {
  it("staffDeFilas y cosmParaAltaTicket: admin que envía un borrador de Andrea se queda Andrea, salvo que elija otra", () => {
    const staff = staffDeFilas([
      { id: "efch", nombre: "EFCH", short: "EFCH", rol: "super_admin" },
      { id: "u-and", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa" },
    ], []);
    const borrador = { asignado_a: "Andrea Robles", datos: { cosmetologa: "Andrea" } };
    const base = { sesNombre: "EFCH", rol: "super_admin", staff, borrador };
    assert.equal(cosmParaAltaTicket({ ...base, payload: "EFCH", elegida: false }), "Andrea Robles");
    assert.equal(cosmParaAltaTicket({ ...base, payload: "EFCH", elegida: true }), "EFCH");
    assert.equal(cosmParaAltaTicket({ ...base, payload: "Andrea Robles", elegida: true }), "Andrea Robles");
    assert.equal(cosmParaAltaTicket({ ...base, payload: "Daniela Mora", rol: "admin", elegida: false, borrador }), "Daniela Mora");
  });

  it("admin envía un borrador de Andrea: el ticket queda en Andrea; si eligió otra en el dropdown, se respeta", async () => {
    const { db, h } = semilla();
    db.tables.set("beta_migo_borradores", [{
      factura: FAC, fecha: "2026-11-19", cliente: "Andres Trujillo", total: 33.99, forma: "Tarjeta",
      estado: "completado", asignado_a: "Andrea Robles", datos: { cosmetologa: "Andrea" },
      lineas: [
        { sku: "SUNSU-31", producto: "PDRN SERUM", cantidad: 1, total: 15, precio_unit: 15 },
        { sku: "SUNSU-AS-002", producto: "Jabón", cantidad: 1, total: 18.99, precio_unit: 18.99 },
      ],
      ticket_id: null, ticket_clave: null,
    }]);
    const auto = await h("efch", "crearTicket", {
      nombre: "Andres", apellido: "Trujillo", estimado: 33.99, cosmetologa: "EFCH",
      vincular_borrador: FAC, extras: "SUNSU-31 PDRN SERUM",
      productos: { "SUNSU-AS-002": 1 },
    });
    assert.equal(auto.ok, true, String(auto.error));
    const tk = db.tables.get("tickets")!.at(-1)!;
    assert.equal(s(tk.atendido_por), "Andrea Robles", "sin dropdown, el admin no pisa a Andrea");

    const { db: db2, h: h2 } = semilla();
    db2.tables.set("beta_migo_borradores", [{
      factura: FAC, fecha: "2026-11-19", cliente: "Andres Trujillo", total: 33.99,
      estado: "completado", asignado_a: "Andrea Robles", datos: { cosmetologa: "Andrea" },
      lineas: [], ticket_id: null, ticket_clave: null,
    }]);
    const elige = await h2("efch", "crearTicket", {
      nombre: "Andres", apellido: "Trujillo", estimado: 33.99, cosmetologa: "EFCH",
      cosmetologa_elegida: true, vincular_borrador: FAC,
    });
    assert.equal(elige.ok, true, String(elige.error));
    assert.equal(s(db2.tables.get("tickets")!.at(-1)!.atendido_por), "EFCH", "si el admin elige EFCH en el dropdown, se respeta");
  });

  it("editar cosmetóloga EFCH → Andrea y Andrea → EFCH actualiza el ticket y recalcula comisiones", async () => {
    const { db, h } = semilla();
    db.tables.set("tickets", [{
      id: 646222, sheet_row: 1, so_num: "TK-SO-1925", timestamp: "2026-11-19T15:22:36-05:00",
      atendido_por: "EFCH", nombre: "Andres", apellido: "Trujillo", estimado: 33.99,
      servicios_adicionales: "SUNSU-31 PDRN SERUM", orig: { "SUNSU-AS-002": 1 },
    }]);
    const L = [
      { tipo: "extra", sku: "SUNSU-31", nombre: "PDRN SERUM", cantidad: 1, precio_unit: 15 },
      { tipo: "producto", sku: "SUNSU-AS-002", nombre: "Jabón", cantidad: 1, precio_unit: 18.99 },
    ];
    const g0 = await h("efch", "tk_guardar", { clave: "TK-SO-1925", lineas: L });
    assert.equal(g0.ok, true, "guardar líneas iniciales: " + String(g0.error));
    const lin0 = db.tables.get("beta_ticket_lineas") as Row[];
    const prod0 = lin0.find((x) => s(x.sku).includes("AS-002"))!;
    const ext0 = lin0.find((x) => s(x.sku).includes("31"))!;
    assert.equal(n(prod0.comision), 0, "admin no gana comisión de producto");
    assert.equal(n(ext0.comision), 0, "extra no congela comisión de producto");

    const sv = await h("efch", "tk_guardar", { clave: "TK-SO-1925", datos: { cosmetologa: "Andrea" } });
    assert.equal(sv.ok, true, String(sv.error));
    assert.equal(s(sv.cosmCambio && (sv.cosmCambio as Row).a), "Andrea Robles");
    const tk = db.tables.get("tickets")!.find((x) => s(x.so_num) === "TK-SO-1925")!;
    assert.equal(s(tk.atendido_por), "Andrea Robles");
    const cab = (db.tables.get("beta_tickets") as Row[]).find((x) => s(x.clave) === "TK-SO-1925")!;
    assert.equal(s((cab.datos as Row).cosmetologa), "Andrea Robles");
    const lin1 = db.tables.get("beta_ticket_lineas") as Row[];
    const prod1 = lin1.find((x) => s(x.sku).includes("AS-002"))!;
    const ext1 = lin1.find((x) => s(x.sku).includes("31"))!;
    const esp = comiEsperada([n(prod1.total_linea) || 18.99, n(ext1.total_linea) || 15], n(sv.total) || 33.99, 11.26);
    // venta neta del producto es la que corresponde a su total_linea
    const nets = ventaNetaLineas([{ total_linea: n(prod1.total_linea) }, { total_linea: n(ext1.total_linea) }], n(sv.total) || 33.99);
    // order might differ — recompute by matching
    const netProd = n(prod1.venta_neta);
    const comiEsp = comisionUnidad(netProd, 11.26);
    assert.equal(n(prod1.comision), comiEsp, "Andrea gana la comisión real del jabón; quedó " + prod1.comision + " neta " + netProd);
    assert.ok(comiEsp > 1, "la comisión de AS-002 debe ser > $1");
    assert.equal(n(ext1.comision), 0, "SUNSU-31 extra queda en $0 en la línea");

    const vista = await h("efch", "tk_get", { clave: "TK-SO-1925" });
    assert.equal(s((vista.ticket as Row).cosmetologa || (vista.info as Row).cosmetologa), "Andrea Robles");
    const staff = (vista.staff || []) as Row[];
    assert.ok(staff.some((u) => s(u.nombre) === "Andrea Robles"));
    assert.ok(staff.some((u) => s(u.nombre) === "EFCH"));

    const back = await h("efch", "tk_guardar", { clave: "TK-SO-1925", datos: { cosmetologa: "EFCH" } });
    assert.equal(back.ok, true, String(back.error));
    const tk2 = db.tables.get("tickets")!.find((x) => s(x.so_num) === "TK-SO-1925")!;
    assert.equal(s(tk2.atendido_por), "EFCH");
    const lin2 = db.tables.get("beta_ticket_lineas") as Row[];
    assert.ok(lin2.every((x) => n(x.comision) === 0), "al volver a un admin las comisiones quedan en $0");
    const log = db.tables.get("log_acciones") as Row[];
    assert.ok(log.some((x) => /atendido por/i.test(s(x.detalle))), "queda el registro en auditoría");
  });

  it("el detalle y el formulario de envío tienen el dropdown, la tabla no recorta Saldo, y el caché es TK140", () => {
    const mc = readFileSync(join(root, "mc-tickets.js"), "utf8");
    const sc = readFileSync(join(root, "beta-screens.js"), "utf8");
    const html = readFileSync(join(root, "index.html"), "utf8");
    const sw = readFileSync(join(root, "sw.js"), "utf8");
    assert.match(mc, /select class="mctk-in mctk-cosm"/);
    assert.match(mc, /K\.datos\.cosmetologa = nv/);
    assert.match(sc, /id="tk-atendido-por"/);
    assert.match(sc, /cosmetologa_elegida/);
    assert.match(sc, /c\.k!=='ced'&&c\.k!=='sub'&&c\.k!=='iva'&&c\.k!=='reag'/);
    assert.match(html, /\.tk-table \{[^}]*min-width: 0/);
    assert.match(html, /tk-list, \.tk-split\.tk-side \.tk-list \{ overflow-x: hidden/);
    assert.match(html, /th:last-child, \.tk-table td:last-child \{ overflow: visible/);
    assert.match(sw, /const CACHE = "sunsu-2026-11-20-TK189"/);
    assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-20-TK189"/);
    assert.match(html, /20261120tk178/);
  });
});
