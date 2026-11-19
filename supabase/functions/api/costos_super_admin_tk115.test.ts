import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import { esClaveCosto, esSuperAdmin, redactar, verCostos, type SesLite } from "./permisos.ts";
import "./handlers_extra.ts";
import "./tickets_beta_api.ts";
import "./productos_api.ts";
import "./dashboard_api.ts";
import "./erp_api.ts";
import type { Row } from "./domain.ts";

function ctx(db: MemoryDb, rol: string, uid: string, name: string) {
  const token = "t-" + uid;
  const sesiones = db.tables.get("sesiones") || [];
  if (!sesiones.some((s) => s.token === token)) sesiones.push({ token, uid, rol, exp: "2099-01-01T00:00:00.000Z" });
  db.tables.set("sesiones", sesiones);
  const users = db.tables.get("usuarios") || [];
  if (!users.some((u) => u.id === uid)) users.push({ id: uid, nombre: name, short: name, rol, bloqueado: false });
  db.tables.set("usuarios", users);
  return {
    db, now: new Date("2026-10-27T15:00:00Z"),
    env: {} as Record<string, string | undefined>,
    fetchImpl: fetch,
    legacyLogin: async () => ({ ok: false }),
    token,
  };
}

function semilla(): MemoryDb {
  return new MemoryDb({
    usuarios: [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
      { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      { id: "alejandra", nombre: "Alejandra Rodriguez", short: "Alejandra", rol: "recepcion", bloqueado: false },
      { id: "efch", nombre: "EFCH", short: "EFCH", rol: "super_admin", bloqueado: false },
    ],
    catalogo: [
      { sku: "SUNSU-HT-002", producto_servicio: "Serum niacinamide", tipo: "PRODUCTO", subtotal: 20, total_con_iva: 23, precio_compra: 6, compra_comision: 6, utilidad: 9.8, comi_producto_30: 4.2, activo: true, orig: {} },
    ],
    inventario_base: [{ sku: "SUNSU-HT-002", compra: 8, stock_inicial: 4, minimo: 1 }],
    erp_productos: [{ id: "p1", sku: "HT-002", nombre: "Serum niacinamide", costo_promedio: 7, beta_compra_real: 8, beta_compra_comision: 6, beta_pvp: 23, activo: true }],
    tickets: [
      { id: 1, sheet_row: 1, so_num: "TK-SO-115", timestamp: "2026-10-27T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0101", nombre: "Ana", apellido: "Pérez", estimado: 23, orig: { "HT-002": 1 } },
    ],
    beta_tickets: [{ clave: "TK-SO-115", so_num: "TK-SO-115", lineas_beta: true, precios_snapshot_at: "2026-10-27T15:00:00Z" }],
    beta_ticket_lineas: [{
      ticket_clave: "TK-SO-115", orden: 1, tipo: "producto", sku: "SUNSU-HT-002", nombre: "Serum niacinamide",
      cantidad: 1, precio_unit: 20, total_linea: 20, venta_neta: 20, costo_real: 8, compra_comision: 6,
      comision: 4.2, utilidad: 7.8, falta_costo: false, snapshot_at: "2026-10-27T15:00:00Z",
    }],
    erp_bodegas: [], erp_stock: [], erp_movimientos: [], app_modulos: [], cabina_inventario: [],
    promos: [], solicitudes_cambio: [], clientas_registro: [], beta_stock_movimientos: [], beta_ticket_snaps: [],
    erp_oc: [], erp_oc_lineas: [], ordenes_compra: [],
  });
}

const CLAVES_PROHIBIDAS = [
  "compra", "compraReal", "compraComision", "precio_compra", "costo_real", "costoReal",
  "utilidad", "utilidadProd", "margen", "margenPct", "faltaCosto", "falta_costo",
  "sinCosto", "cogs", "ganancia", "beta_compra_real", "beta_compra_comision",
  "costo_promedio", "costoProd", "comi_producto_30",
];

function clavesCostoEn(v: unknown, acc: string[] = [], path = ""): string[] {
  if (v == null) return acc;
  if (Array.isArray(v)) {
    v.forEach((x, i) => clavesCostoEn(x, acc, path + "[" + i + "]"));
    return acc;
  }
  if (typeof v !== "object") return acc;
  for (const [k, val] of Object.entries(v as Row)) {
    const p = path ? path + "." + k : k;
    if (esClaveCosto(k, "getCatalogoTabla") || CLAVES_PROHIBIDAS.includes(k)) acc.push(p);
    else clavesCostoEn(val, acc, p);
  }
  return acc;
}

describe("TK115 costos solo Super Admin", () => {
  it("ni un flag ni un admin reciben ver_costos; solo super_admin", () => {
    assert.equal(esSuperAdmin("admin"), false);
    assert.equal(esSuperAdmin("super_admin"), true);
    assert.equal(esSuperAdmin("admin_master"), true);
    assert.equal(verCostos("admin"), false);
    assert.equal(verCostos("cosmetologa"), false);
    assert.equal(verCostos("recepcion"), false);
    assert.equal(verCostos("super_admin"), true);
  });

  it("redactar deja costos al super_admin y los quita a staff, admin y sin sesión, incluso claves nuevas", () => {
    const fila = {
      sku: "HT-002", subtotal: 20, compra: 8, compraReal: 8, compraComision: 6,
      costo_real: 8, utilidad: 7.8, margenPct: 39, faltaCosto: false, sinCosto: 0, comision: 4.2,
    };
    const staff: SesLite = { rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", uid: "andrea" };
    const admin: SesLite = { rol: "admin", name: "Emi", short: "Emi", uid: "emi" };
    const mega: SesLite = { rol: "super_admin", name: "EFCH", short: "EFCH", uid: "efch" };
    const rStaff = redactar("getCatalogoTabla", [fila], staff) as Row[];
    const rAdm = redactar("getCatalogoTabla", [fila], admin) as Row[];
    const rMega = redactar("getCatalogoTabla", [fila], mega) as Row[];
    const rAnon = redactar("getCatalogo", [fila], null) as Row[];
    assert.equal(rStaff[0].subtotal, 20);
    assert.equal(rStaff[0].compraReal, undefined);
    assert.equal(rStaff[0].compraComision, undefined);
    assert.equal(rStaff[0].costo_real, undefined);
    assert.equal(rStaff[0].faltaCosto, undefined);
    assert.equal(rStaff[0].margenPct, undefined);
    assert.equal(rAdm[0].compraReal, undefined);
    assert.equal(rAdm[0].utilidad, undefined);
    assert.equal(rAnon[0].compra, undefined);
    assert.equal(rMega[0].compraReal, 8);
    assert.equal(rMega[0].utilidad, 7.8);
    assert.equal(rMega[0].compraComision, 6);
  });

  it("JWT de staff y de admin no reciben campos de costo en ningún endpoint; super_admin sí", async () => {
    const db = semilla();
    const staff = ctx(db, "cosmetologa", "andrea", "Andrea Robles");
    const admin = ctx(db, "admin", "emi", "Emi");
    const mega = ctx(db, "super_admin", "efch", "EFCH");

    const acciones: { accion: string; body?: Row }[] = [
      { accion: "whoami" },
      { accion: "getCatalogo" },
      { accion: "getCatalogoTabla" },
      { accion: "mcprod_list" },
      { accion: "tk_get", body: { clave: "TK-SO-115" } },
      { accion: "getDashboard", body: { periodo: "mes" } },
      { accion: "getDashboardHoy" },
      { accion: "tk_costos", body: { clave: "TK-SO-115" } },
    ];

    for (const a of acciones) {
      for (const ses of [staff, admin]) {
        const out = await handle(a.accion, { token: ses.token, ...(a.body || {}) }, ses) as Row;
        const found = clavesCostoEn(out);
        assert.equal(found.length, 0, a.accion + " " + ses.token + " filtró mal: " + found.join(", ") + " :: " + JSON.stringify(out).slice(0, 400));
      }
    }

    const whoStaff = await handle("whoami", { token: staff.token }, staff) as Row;
    const whoAdm = await handle("whoami", { token: admin.token }, admin) as Row;
    const whoMega = await handle("whoami", { token: mega.token }, mega) as Row;
    assert.equal(whoStaff.ver_costos, false);
    assert.equal(whoAdm.ver_costos, false);
    assert.equal(whoMega.ver_costos, true);

    const catMega = await handle("getCatalogoTabla", { token: mega.token }, mega) as Row;
    const item = ((catMega.items as Row[]) || [])[0];
    assert.ok(item && (item.compraReal === 8 || item.compra === 8 || item.utilidad != null), "super_admin debe ver costo real o utilidad: " + JSON.stringify(item));

    const tkMega = await handle("tk_get", { token: mega.token, clave: "TK-SO-115" }, mega) as Row;
    assert.equal(tkMega.error, undefined, String(tkMega.error));
    // Si el endpoint expone el snapshot, Super Admin lo ve; si no lo mapea, no debe filtrarse mal en catálogo/dashboard.

    const dashMega = await handle("getDashboard", { token: mega.token, periodo: "mes" }, mega) as Row;
    assert.equal(dashMega.error, undefined, String(dashMega.error));
    const costosTk = await handle("tk_costos", { token: admin.token, clave: "TK-SO-115" }, admin) as Row;
    assert.match(String(costosTk.error || ""), /Super Admin/i);
    const costosMega = await handle("tk_costos", { token: mega.token, clave: "TK-SO-115" }, mega) as Row;
    assert.equal(costosMega.ok, true, String(costosMega.error));
    assert.ok((costosMega.costos as Row)?.cogs != null || (costosMega.costos as Row)?.ganancia != null);
  });

  it("Ver como nunca revela costos, ni si Super Admin mira como admin o como staff", async () => {
    const db = semilla();
    const mega = ctx(db, "super_admin", "efch", "EFCH");
    const comoStaff = await handle("getCatalogoTabla", { token: mega.token, preview: true, preview_uid: "andrea" }, mega) as Row;
    assert.equal(clavesCostoEn(comoStaff).length, 0, "ver como staff: " + clavesCostoEn(comoStaff).join(", "));
    const comoAdmin = await handle("getCatalogoTabla", { token: mega.token, preview: true, preview_uid: "emi" }, mega) as Row;
    assert.equal(clavesCostoEn(comoAdmin).length, 0, "ver como admin: " + clavesCostoEn(comoAdmin).join(", "));
    const tkComo = await handle("tk_get", { token: mega.token, preview: true, preview_uid: "andrea", clave: "TK-SO-115" }, mega) as Row;
    assert.equal(clavesCostoEn(tkComo).length, 0, "tk_get ver como: " + clavesCostoEn(tkComo).join(", "));
  });

  it("el SQL 0064 respalda grants y revoca columnas de costo a no super-admin", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0064_tk115_costos_super_admin.sql", import.meta.url), "utf8");
    assert.match(sql, /tk115_grants_bak_20261119/);
    assert.match(sql, /revoke all/i);
    for (const col of ["precio_compra", "beta_compra_real", "costo_real", "compra_comision", "utilidad"]) {
      assert.match(sql, new RegExp(col));
    }
    assert.match(sql, /v_ticket_productos/);
    assert.match(sql, /no se recorta app_beta_write/);
  });
});
