// TK219: el personal liga o cambia una factura Migo desde el ticket, con vista previa y bitácora.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./tickets_lista_api.ts";
import "./migo_cuadre_api.ts";
import "./tk_ligar_factura_api.ts";
import type { Row } from "./domain.ts";
import type { Ctx } from "./lib.ts";

const root = new URL("../../../", import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root), "utf8");
const CACHE = "sunsu-2026-11-25-DEV31C";
const FAC = "001-001-000003007";
const FAC2 = "001-001-000003001";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "rec", uid: "alejandra", rol: "recepcion", name: "Alejandra Rodriguez", short: "Alejandra", exp: "2099-01-01T00:00:00.000Z" },
    { token: "and", uid: "andrea", rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", exp: "2099-01-01T00:00:00.000Z" },
    { token: "vis", uid: "visor1", rol: "visor", name: "Visor Skin", short: "Visor", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin" },
    { id: "alejandra", nombre: "Alejandra Rodriguez", short: "Alejandra", rol: "recepcion" },
    { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa" },
    { id: "visor1", nombre: "Visor Skin", short: "Visor", rol: "visor" },
  ]);
  db.tables.set("catalogo", [
    { sku: "SUNSU-18", producto_servicio: "PAQUETE (3) FACIAL REPARACIÓN", tipo: "PAQUETE", total_con_iva: 175.5, subtotal: 152.61, activo: true },
    { sku: "SUNSU-21", producto_servicio: "PAQUETE (3) FACIAL PORCELANA", tipo: "PAQUETE", total_con_iva: 175.5, subtotal: 152.61, activo: true },
    { sku: "SUNSU-27", producto_servicio: "PAQUETE (6) FACIAL PORCELANA", tipo: "PAQUETE", total_con_iva: 331.5, subtotal: 288.26, activo: true },
    { sku: "SUNSU-02", producto_servicio: "FACIAL REPARACIÓN", tipo: "FACIAL", total_con_iva: 65, subtotal: 56.52, activo: true },
    { sku: "SUNSU-14", producto_servicio: "AMPOLLA ESPECIAL HIDRATACIÓN", tipo: "SERVICIO ADD-ON", total_con_iva: 15, subtotal: 13.04, activo: true },
    { sku: "SUNSU-15", producto_servicio: "Ampolla Especial", tipo: "SERVICIO ADD-ON", total_con_iva: 15, subtotal: 13.04, activo: true },
  ]);
  db.tables.set("tickets", [
    { id: 646274, so_num: "TK-SO-1974", beta_num: "TK-20261123-1619", timestamp: "2026-11-23T17:59:51Z", nombre: "Joaquin", apellido: "Regalado", estimado: 175.5, compra_pack_3: "SUNSU-18 x3 Facial Reparación", paquete: "SI, 1/3", atendido_por: "Andrea Robles", orig: {} },
    { id: 646275, so_num: "TK-SO-1975", beta_num: "TK-20261123-1620", timestamp: "2026-11-23T18:01:11Z", nombre: "Diana", apellido: "Emanuele", estimado: 175.5, compra_pack_3: "SUNSU-21 x3 Facial Porcelana", paquete: "", atendido_por: "Andrea Robles", orig: {} },
    { id: 646277, so_num: "TK-SO-1977", beta_num: "TK-20261123-1622", timestamp: "2026-11-23T18:57:43Z", nombre: "Nicole", apellido: "Luzuriaga", estimado: 75, facial_hecho: "SUNSU-02 Facial Reparación", servicios_adicionales: "SUNSU-14 Ampolla Especial Hidratación", atendido_por: "Evelyn Anabel Toapanta Quishpe", orig: {} },
  ]);
  db.tables.set("beta_tickets", [
    { clave: "TK-SO-1974", lineas_beta: false, datos: {}, historial: [] },
    { clave: "TK-SO-1975", lineas_beta: false, datos: {}, historial: [] },
    { clave: "TK-SO-1977", lineas_beta: false, datos: {}, historial: [] },
  ]);
  db.tables.set("beta_migo_facturas_vivo", [
    {
      factura: FAC, fecha: "2026-11-24", cliente: "Diana Emanuele", total: 332.35, forma: "tarjeta",
      cliente_telefono: "0999999999", cliente_email: "diana@example.com", cliente_ruc: "1711111111", cliente_direccion: "secreta",
      lineas: [{ sku: "SUNSU-27", codigo: "SUNSU-27", producto: "PAQUETE (6) FACIAL PORCELANA", cantidad: 1, total: 332.35 }],
    },
    {
      factura: FAC2, fecha: "2026-11-24", cliente: "Nicole Luzuriaga", total: 80, forma: "tarjeta",
      cliente_telefono: "0988888888", lineas: [
        { sku: "SUNSU-02", producto: "FACIAL REPARACIÓN", cantidad: 1, total: 65 },
        { sku: "SUNSU-15", producto: "Ampolla Especial", cantidad: 1, total: 15 },
      ],
    },
  ]);
  db.tables.set("beta_migo_borradores", [
    { factura: FAC, fecha: "2026-11-24", cliente: "Diana Emanuele", total: 332.35, forma: "tarjeta", estado: "pendiente", datos: {} },
    { factura: FAC2, fecha: "2026-11-24", cliente: "Nicole Luzuriaga", total: 80, forma: "tarjeta", estado: "pendiente", datos: {} },
  ]);
  for (const t of [
    "beta_cuadre_link", "beta_ticket_flags", "beta_ticket_cancelados", "beta_ticket_lineas", "beta_ticket_snaps",
    "beta_ticket_envios", "beta_pagos", "log_acciones", "app_modulos", "beta_migo_importes", "beta_sku_alias",
    "beta_clientes", "clientas_registro",
  ]) if (!db.tables.has(t)) db.tables.set(t, []);
  const ctx = { db, now: new Date("2026-11-24T17:10:00-05:00"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token: "rec" } as unknown as Ctx;
  const h = (tok: string, a: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...ctx, token: tok } as never) as Promise<Row>;
  return { db, h };
}

function blobHasContacto(x: unknown): boolean {
  return /0999999999|0988888888|diana@example|1711111111|secreta/.test(JSON.stringify(x));
}

describe("TK219 asociar / cambiar factura", () => {
  it("Alejandra busca una factura y ve si cuadra, sin datos de contacto", async () => {
    const { h } = semilla();
    const r = await h("rec", "tk_factura_buscar", { clave: "TK-SO-1975", factura: "3007" });
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.factura, FAC);
    assert.equal(r.factura_cliente, "Diana Emanuele");
    assert.equal(r.factura_total, 332.35);
    assert.equal((r.ticket as Row).clave, "TK-SO-1975");
    assert.equal((r.coinciden as Row).clienta, true);
    assert.equal((r.coinciden as Row).fecha, true);
    assert.equal((r.coinciden as Row).monto_ticket, false);
    assert.equal(r.puede_confirmar, true);
    assert.equal(blobHasContacto(r), false, "no debe salir teléfono, correo, RUC ni dirección");
  });

  it("la suma de Diana + Joaquín se muestra al buscar la misma factura en el segundo ticket", async () => {
    const { h } = semilla();
    const a = await h("rec", "tk_factura_ligar", { clave: "TK-SO-1975", factura: FAC, confirmar: true });
    assert.equal(a.ok, true, String(a.error));
    const r = await h("rec", "tk_factura_buscar", { clave: "TK-SO-1974", factura: "001-001-000003007" });
    assert.equal(r.ok, true, String(r.error));
    assert.equal(Number(r.suma).toFixed(2), "351.00");
    const ligados = (r.ligados as Row[]) || [];
    assert.ok(ligados.some((x) => x.clave === "TK-SO-1975"));
    assert.equal((r.coinciden as Row).monto_suma, false);
    assert.ok(String((r.avisos as string[]).join(" ")).includes("ya cubre") || String((r.avisos as string[]).join(" ")).includes("suma"));
  });

  it("confirmar asocia el ticket, deja bitácora con quién/cuándo/antes/después y el vínculo manual sobrevive al cuadre", async () => {
    const { db, h } = semilla();
    const r = await h("rec", "tk_factura_ligar", { clave: "TK-SO-1975", factura: "3007", confirmar: true });
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.ligado, true);
    assert.equal(r.factura, FAC);
    assert.equal(r.anterior, null);
    const cab = db.tables.get("beta_tickets")!.find((x) => x.clave === "TK-SO-1975")!;
    assert.equal((cab.datos as Row).factura, FAC);
    const lig = (cab.datos as Row).factura_ligar as Row;
    assert.equal(lig.nueva, FAC);
    assert.ok(String(lig.por).includes("Alejandra"));
    const L = db.tables.get("beta_cuadre_link")!.find((x) => x.ticket_id === 646275)!;
    assert.equal(L.factura, FAC);
    assert.equal(L.tipo, "manual");
    const log = db.tables.get("log_acciones")!.filter((x) => String(x.accion).includes("ASOCIAR FACTURA"));
    assert.ok(log.length >= 1, "debe quedar log_acciones");
    assert.match(String(log[0].detalle), /TK-SO-1975/);
    assert.match(String(log[0].detalle), /001-001-000003007/);
    // El auto-cuadre no debe borrar el vínculo manual aunque el monto no calce (175.50 vs 332.35).
    const after = await h("adm", "migo_cuadre_hora", {});
    assert.ok(!after.error, String(after.error));
    const L2 = db.tables.get("beta_cuadre_link")!.find((x) => x.ticket_id === 646275);
    assert.ok(L2, "el vínculo manual debe seguir");
    assert.equal(L2!.factura, FAC);
    assert.equal(L2!.tipo, "manual");
  });

  it("se puede cambiar una factura ya asociada y el log guarda la anterior", async () => {
    const { db, h } = semilla();
    const a = await h("rec", "tk_factura_ligar", { clave: "TK-SO-1977", factura: FAC, confirmar: true });
    assert.equal(a.ok, true, String(a.error));
    const b = await h("rec", "tk_factura_ligar", { clave: "TK-SO-1977", factura: FAC2, confirmar: true });
    assert.equal(b.ok, true, String(b.error));
    assert.equal(b.anterior, FAC);
    assert.equal(b.factura, FAC2);
    const cab = db.tables.get("beta_tickets")!.find((x) => x.clave === "TK-SO-1977")!;
    assert.equal((cab.datos as Row).factura, FAC2);
    const log = db.tables.get("log_acciones")!.filter((x) => String(x.accion).includes("ASOCIAR FACTURA"));
    assert.ok(log.some((x) => String(x.detalle).includes(FAC) && String(x.detalle).includes(FAC2)));
  });

  it("el visor no puede buscar ni asociar", async () => {
    const { h } = semilla();
    const a = await h("vis", "tk_factura_buscar", { clave: "TK-SO-1975", factura: "3007" });
    assert.ok(a.error, "visor no busca");
    assert.match(String(a.error), /clientas y citas|permiso|visor/i);
    const b = await h("vis", "tk_factura_ligar", { clave: "TK-SO-1975", factura: "3007", confirmar: true });
    assert.ok(b.error, "visor no asocia");
  });

  it("una cosmetóloga no asocia el ticket de otra", async () => {
    const { h } = semilla();
    const r = await h("and", "tk_factura_ligar", { clave: "TK-SO-1977", factura: FAC2, confirmar: true });
    assert.ok(r.error);
    assert.match(String(r.error), /propios tickets/i);
  });

  it("la vista previa de Nicole avisa el desfase de monto ($80 factura vs total de líneas)", async () => {
    const { h } = semilla();
    const r = await h("rec", "tk_factura_buscar", { clave: "TK-SO-1977", factura: "3001" });
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.factura_cliente, "Nicole Luzuriaga");
    assert.equal((r.coinciden as Row).clienta, true);
    assert.equal((r.coinciden as Row).fecha, true);
    // Facial $65 + ampolla $15 = $80, igual a la factura; el estimado de la hoja ($75) no manda.
    assert.equal((r.ticket as Row).total, 80);
    assert.equal((r.coinciden as Row).monto_ticket, true);
  });

  it("el botón aparece en el detalle y en la lista, y la caché es TK219", () => {
    const tk = file("mc-tickets.js");
    const sc = file("beta-screens.js");
    const sw = file("sw.js");
    const html = file("index.html");
    assert.match(tk, /Asociar factura/);
    assert.match(tk, /Cambiar factura/);
    assert.match(tk, /tk_factura_buscar/);
    assert.match(tk, /tk_factura_ligar/);
    assert.match(tk, /SunsuLigarFactura/);
    assert.match(sc, /SunsuLigarFactura/);
    assert.match(sw, new RegExp('const CACHE = "' + CACHE + '"'));
    assert.match(html, new RegExp('window\\.SUNSU_CACHE = "' + CACHE + '"'));
  });
});
