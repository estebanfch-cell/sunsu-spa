import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./compras_api.ts";
import "./compras_beta_api.ts";
import "./recepciones_api.ts";
import "./consignacion_beta_api.ts";
import { DEFAULT_MATRIZ, enmascararProveedores, redactar, type ProvCodigo, type SesLite } from "./permisos.ts";
import { familiaDe } from "./ventas.ts";
import type { Row } from "./domain.ts";

const PROVS: ProvCodigo[] = [
  { id: "p-ht", nombre: "Hebetronic S.A", familia: "HT", ruc: "1793161898001.0" },
  { id: "p-as", nombre: "Allskin Company S.A.S", familia: "AS", ruc: "RUC PENDIENTE" },
  { id: "p-ml", nombre: "Atencio Aguas Francisco Javier", familia: "ML", ruc: "1715933022001.0" },
  { id: "p-ph", nombre: "APHLORA", familia: "PH", ruc: "1793200552001.0" },
  { id: "p-jn", nombre: "Judith Trinidad Ayala Narvaez", familia: "JN", ruc: "400649711001.0" },
  { id: "p-bv", nombre: "Bruno Vassari Ecuador Cia Ltda", familia: "BV", ruc: "1792033454001.0" },
  { id: "p-su", nombre: "SUNSU", familia: "SU", ruc: "1793219469001.0" },
  { id: "p-vk", nombre: "Maira Fernanda Moya Rojas", familia: "VK", ruc: "1721779831001.0" },
];

const andrea: SesLite = { rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", uid: "andrea" };
const alejandra: SesLite = { rol: "recepcion", name: "Alejandra Rodríguez", short: "Alejandra", uid: "alejandra" };
const admin: SesLite = { rol: "admin", name: "Emi", short: "Emi", uid: "emi" };
const mega: SesLite = { rol: "super_admin", name: "EFCH", short: "EFCH", uid: "efch" };

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "rcp", uid: "alejandra", rol: "recepcion", name: "Alejandra Rodríguez", exp: "2099-01-01T00:00:00.000Z" },
    { token: "and", uid: "andrea", rol: "cosmetologa", name: "Andrea Robles", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", rol: "admin" },
    { id: "alejandra", nombre: "Alejandra Rodríguez", rol: "recepcion" },
    { id: "andrea", nombre: "Andrea Robles", rol: "cosmetologa" },
  ]);
  db.tables.set("erp_proveedores", PROVS.map((p) => ({ id: p.id, nombre: p.nombre, ruc: p.ruc, activo: true })));
  db.tables.set("proveedores", PROVS.map((p, i) => ({ sheet_row: i + 2, nombre: p.nombre, familia: p.familia, ruc: p.ruc })));
  db.tables.set("erp_productos", [
    { id: "ht1", sku: "HT-007", nombre: "Ampolla HT", costo_promedio: 8, activo: true, uso: "venta" },
    { id: "as1", sku: "AS-001", nombre: "Aceite Limpiador", costo_promedio: 10, activo: true, uso: "venta" },
  ]);
  db.tables.set("erp_oc", [
    { id: "oc-as", numero: "OC-2026-090", proveedor_id: "p-as", fecha: "2026-11-18", estado: "abierta", flujo: "Aprobada", tipo: "compra", total: 20, pagado: 0, saldo: 20 },
    { id: "oc-ht", numero: "OC-2026-091", proveedor_id: "p-ht", fecha: "2026-11-18", estado: "abierta", flujo: "Aprobada", tipo: "compra", total: 16, pagado: 0, saldo: 16 },
    { id: "oc-ml", numero: "RST-2026-0003", proveedor_id: "p-ml", fecha: "2026-11-18", estado: "abierta", flujo: "Aprobada", tipo: "compra", total: 10, pagado: 0, saldo: 10 },
    { id: "oc-vk", numero: "OC-2026-092", proveedor_id: "p-vk", fecha: "2026-11-18", estado: "abierta", flujo: "Aprobada", tipo: "compra", total: 12, pagado: 0, saldo: 12 },
  ]);
  db.tables.set("erp_oc_lineas", [
    { id: "l1", oc_id: "oc-as", producto_id: "as1", sku: "AS-001", cantidad: 2, recibido: 0, no_recibido: 0, orden: 1 },
    { id: "l2", oc_id: "oc-ht", producto_id: "ht1", sku: "HT-007", cantidad: 2, recibido: 0, no_recibido: 0, orden: 1 },
    { id: "l3", oc_id: "oc-ml", producto_id: "as1", sku: "AS-001", cantidad: 1, recibido: 0, no_recibido: 0, orden: 1 },
    { id: "l4", oc_id: "oc-vk", producto_id: "ht1", sku: "HT-007", cantidad: 1, recibido: 0, no_recibido: 0, orden: 1 },
  ]);
  for (const t of ["erp_oc_pagos", "erp_recepciones", "erp_recepcion_lineas", "erp_bodegas", "erp_stock", "erp_kardex", "beta_oc_cotizaciones", "log_acciones", "beta_consig_restock"]) {
    if (!db.tables.get(t)) db.tables.set(t, []);
  }
  return db;
}

// deno-lint-ignore no-explicit-any
const call = (db: MemoryDb, token: string, action: string, p: Record<string, unknown> = {}) =>
  handle(action, { token, ...p }, { db, now: new Date("2026-11-23T23:00:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}), token } as never) as Promise<Record<string, any>>;

describe("TK215: código de proveedor en vez de razón social", () => {
  it("familiaDe cubre Maira → VK y deja el código de la hoja", () => {
    assert.equal(familiaDe("Maira Fernanda Moya Rojas"), "VK");
    assert.equal(familiaDe("Allskin Company S.A.S"), "AS");
    assert.equal(familiaDe("Atencio Aguas Francisco Javier"), "ML");
    assert.equal(familiaDe("SUNSU"), "SU");
  });

  it("redactar deja la razón social al admin y al super admin", () => {
    const data = { items: [{ numero: "OC-1", proveedor: "Allskin Company S.A.S", familia: "AS" }] };
    const a = redactar("rcp_lista", data, admin, DEFAULT_MATRIZ, PROVS) as Row;
    const m = redactar("rcp_lista", data, mega, DEFAULT_MATRIZ, PROVS) as Row;
    assert.equal(((a.items as Row[])[0]).proveedor, "Allskin Company S.A.S");
    assert.equal(((m.items as Row[])[0]).proveedor, "Allskin Company S.A.S");
  });

  it("redactar cambia el nombre por el código para Andrea y Alejandra", () => {
    const data = {
      items: [
        { numero: "RST-2026-0003", proveedor: "Allskin Company S.A.S", familia: "AS", productos: 2, pendiente: 15 },
        { numero: "OC-2", proveedor: "Atencio Aguas Francisco Javier" },
        { numero: "OC-3", proveedor: "Maira Fernanda Moya Rojas" },
        { numero: "OC-4", proveedor: "Hebetronic S.A" },
      ],
    };
    for (const ses of [andrea, alejandra]) {
      const out = redactar("rcp_lista", data, ses, DEFAULT_MATRIZ, PROVS) as Row;
      const items = out.items as Row[];
      assert.equal(items[0].proveedor, "AS");
      assert.equal(items[1].proveedor, "ML");
      assert.equal(items[2].proveedor, "VK");
      assert.equal(items[3].proveedor, "HT");
    }
  });

  it("no cambia nombres de clientas ni el SUNSU de un producto, y SUNSU proveedor pasa a SU", () => {
    const data = {
      items: [{ nombre: "Ana Rojas", telefono: "0991234567", proveedor: "SUNSU" }],
      aviso: "No hay productos HT- activos para Allskin Company S.A.S.",
      producto: { sku: "SUNSU-40", nombre: "Reset" },
    };
    const out = redactar("cli_list", data, alejandra, DEFAULT_MATRIZ, PROVS) as Row;
    const it = (out.items as Row[])[0];
    assert.equal(it.nombre, "Ana Rojas");
    assert.equal(it.telefono, undefined);
    assert.equal(it.proveedor, "SU");
    assert.equal(out.aviso, "No hay productos HT- activos para AS.");
    assert.equal((out.producto as Row).sku, "SUNSU-40");
    assert.equal((out.producto as Row).nombre, "Reset");
  });

  it("en un objeto proveedor quita RUC y deja solo el código", () => {
    const data = { prov: { id: "p-as", nombre: "Allskin Company S.A.S", ruc: "RUC PENDIENTE", email: "a@x.com", telefono: "02", familia: "AS" } };
    const out = redactar("cmpb_get", data, andrea, DEFAULT_MATRIZ, PROVS) as Row;
    const p = out.prov as Row;
    assert.equal(p.nombre, "AS");
    assert.equal(p.familia, "AS");
    assert.equal(p.ruc, undefined);
    assert.equal(p.email, undefined);
    assert.equal(p.telefono, undefined);
  });

  it("enmascararProveedores cubre las 8 razones sociales vivas", () => {
    const nombres = PROVS.map((p) => p.nombre);
    const out = enmascararProveedores({ nombres, por: PROVS.map((p) => ({ proveedor: p.nombre })) }, PROVS) as Row;
    assert.deepEqual(out.nombres, ["HT", "AS", "ML", "PH", "JN", "BV", "SU", "VK"]);
    assert.deepEqual((out.por as Row[]).map((x) => x.proveedor), ["HT", "AS", "ML", "PH", "JN", "BV", "SU", "VK"]);
  });

  it("rcp_lista y rcp_get: personal ve el código, admin ve el nombre", async () => {
    const db = semilla();
    const staff = await call(db, "rcp", "rcp_lista");
    assert.equal(staff.ok, true, JSON.stringify(staff));
    const por = Object.fromEntries((staff.items as Row[]).map((x) => [x.numero, x]));
    assert.equal(por["OC-2026-090"].proveedor, "AS");
    assert.equal(por["OC-2026-091"].proveedor, "HT");
    assert.equal(por["RST-2026-0003"].proveedor, "ML");
    assert.equal(por["OC-2026-092"].proveedor, "VK");
    const blob = JSON.stringify(staff);
    assert.doesNotMatch(blob, /Allskin Company/);
    assert.doesNotMatch(blob, /Hebetronic/);
    assert.doesNotMatch(blob, /Atencio/);
    assert.doesNotMatch(blob, /Maira Fernanda/);

    const adm = await call(db, "adm", "rcp_lista");
    const porAdm = Object.fromEntries((adm.items as Row[]).map((x) => [x.numero, x]));
    assert.equal(porAdm["OC-2026-090"].proveedor, "Allskin Company S.A.S");
    assert.equal(porAdm["OC-2026-091"].proveedor, "Hebetronic S.A");
    assert.equal(porAdm["RST-2026-0003"].proveedor, "Atencio Aguas Francisco Javier");
    assert.equal(porAdm["OC-2026-092"].proveedor, "Maira Fernanda Moya Rojas");

    const detStaff = await call(db, "rcp", "rcp_get", { id: "oc-as" });
    assert.equal(detStaff.oc.proveedor, "AS");
    assert.equal(detStaff.oc.familia, "AS");
    const detAdm = await call(db, "adm", "rcp_get", { id: "oc-as" });
    assert.equal(detAdm.oc.proveedor, "Allskin Company S.A.S");
  });

  it("cmpb_lista: la cosmiatra ve el código y no el RUC; admin ve el nombre", async () => {
    const db = semilla();
    const staff = await call(db, "and", "cmpb_lista");
    assert.equal(staff.ok, true, JSON.stringify(staff));
    const as = (staff.items as Row[]).find((x) => x.numero === "OC-2026-090") as Row;
    assert.equal((as.prov as Row).nombre, "AS");
    assert.equal((as.prov as Row).familia, "AS");
    assert.equal((as.prov as Row).ruc, undefined);
    assert.equal(as.proveedor, "AS");
    assert.doesNotMatch(JSON.stringify(staff), /Allskin Company/);
    assert.doesNotMatch(JSON.stringify(staff), /RUC PENDIENTE/);

    const adm = await call(db, "adm", "cmpb_lista");
    const asAdm = (adm.items as Row[]).find((x) => x.numero === "OC-2026-090") as Row;
    assert.equal((asAdm.prov as Row).nombre, "Allskin Company S.A.S");
  });
});
