// TK132 (Emilia 19/11 13:25): ticket prellenado desde la Fac. 001-001-000002977 salió sin cédula ni ficha ligada,
// y con Comisión estimada · Productos $0. Datos ficticios: nada de producción.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./migo_cuadre_api.ts";
import "./cliente_factura.ts";
import "./clientes_beta_api.ts";
import { clienteDeFila, telefonoEc } from "./cliente_factura.ts";
import { redactar } from "./permisos.ts";
import type { Row } from "./domain.ts";

const FAC = "001-001-000009977";
const CED = "1700000001"; // ficticia
function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cron", uid: "cron", rol: "admin", name: "CUADRE", exp: "2099-01-01T00:00:00.000Z" },
    { token: "and", uid: "u-and", rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin" },
    { id: "u-and", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa" },
  ]);
  for (const t of ["app_modulos", "tickets", "beta_tickets", "beta_ticket_flags", "beta_ticket_cancelados", "beta_cuadre_link", "beta_migo_importes",
    "beta_ticket_envios", "beta_citas_ticket", "log_acciones", "clientas_registro", "beta_clientes", "beta_ticket_lineas", "beta_ticket_snaps", "catalogo", "erp_productos"]) db.tables.set(t, []);
  db.tables.set("beta_migo_facturas_vivo", [{ factura: FAC, fecha: "2026-11-19", cliente: "Andres Trujillo", total: 33.99, forma: "Efectivo",
    lineas: [{ sku: "SUNSU-31", codigo: "SUNSU-31", producto: "PDRN SERUM", cantidad: 1, total: 15 }, { sku: "SUNSU-AS-002", codigo: "SUNSU-AS-002", producto: "Jabón Limpiador Ceramide Foam - Eyenlip", cantidad: 1, total: 18.99 }] }]);
  db.tables.set("beta_migo_borradores", [{ factura: FAC, fecha: "2026-11-19", cliente: "Andres Trujillo", total: 33.99, forma: "Efectivo", estado: "asignado", asignado_a: "Andrea Robles", datos: {}, lineas: [] }]);
  const c = { db, now: new Date("2026-11-19T18:20:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (tok: string, a: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok } as never) as Promise<Row>;
  return { db, h };
}

describe("TK132 prellenado desde factura", () => {
  it("normaliza el RIDE: +593, consumidor final fuera, correo válido", () => {
    assert.equal(telefonoEc("0991234567"), "+593991234567");
    assert.equal(telefonoEc("+593 99 123 4567"), "+593991234567");
    assert.equal(telefonoEc("123"), "");
    assert.equal(clienteDeFila({ cliente_ruc: "9999999999999" }), null);
    assert.deepEqual(clienteDeFila({ cliente_ruc: CED, cliente_email: "A@B.EC", cliente_telefono: "0991234567", cliente_direccion: "Tumbaco" }),
      { cedula: CED, email: "a@b.ec", telefono: "+593991234567", direccion: "Tumbaco" });
  });

  it("CUADRE sube los datos del RIDE; el borrador los trae; el contacto solo a quien puede verlo", async () => {
    const { db, h } = semilla();
    const up = await h("adm", "migo_clientes_ride", { clientes: [{ factura: FAC, ruc: CED, email: "andres@example.com", telefono: "0991234567", direccion: "Tumbaco" }, { factura: "no-existe", ruc: CED }] });
    assert.equal(up.ok, true, String(up.error)); assert.equal(up.actualizadas, 1);
    const v = db.tables.get("beta_migo_facturas_vivo")![0];
    assert.equal(v.cliente_ruc, CED); assert.equal(v.cliente_telefono, "+593991234567");
    const g = await h("adm", "migo_borrador_get", { factura: FAC });
    assert.equal(g.ok, true, String(g.error));
    const cd = (g.borrador as Row).cliente_datos as Row;
    assert.equal(cd.cedula, CED); assert.equal(cd.email, "andres@example.com"); assert.equal(cd.direccion, "Tumbaco");
    const staff = redactar("migo_borrador_get", g, { rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", uid: "u-and" }) as Row;
    const cds = (staff.borrador as Row).cliente_datos as Row;
    assert.equal(cds.cedula, CED, "la cédula sí llega para ligar la ficha");
    assert.equal(cds.telefono, undefined); assert.equal(cds.email, undefined);
  });

  it("staff envía el ticket (TK134): queda con cédula y la ficha se crea con correo, celular y dirección", async () => {
    const { db, h } = semilla();
    await h("adm", "migo_clientes_ride", { clientes: [{ factura: FAC, ruc: CED, email: "andres@example.com", telefono: "0991234567", direccion: "Tumbaco" }] });
    const st = await h("and", "crearTicket", { nombre: "Andres", apellido: "Trujillo", estimado: 33.99, cosmetologa: "Andrea Robles", vincular_borrador: FAC });
    assert.equal(st.ok, true, String(st.error));
    const tk = db.tables.get("tickets")!.at(-1)!;
    assert.equal(tk.id_3, CED);
    const fic = (db.tables.get("beta_clientes") || []).find((x) => String(x.key).includes(CED));
    assert.ok(fic, "ficha creada/ligada por cédula");
    const d = fic!.datos as Row;
    assert.equal(d.email, "andres@example.com"); assert.equal(d.telefono, "+593991234567"); assert.equal(d.sector, "Tumbaco");
  });

  it("admin abre el borrador y envía sin cédula: la pone el servidor desde la factura", async () => {
    const { db, h } = semilla();
    await h("adm", "migo_clientes_ride", { clientes: [{ factura: FAC, ruc: CED }] });
    const r = await h("adm", "crearTicket", { nombre: "Andres", apellido: "Trujillo", estimado: 33.99, cosmetologa: "Andrea Robles", vincular_borrador: FAC });
    assert.equal(r.ok, true, String(r.error));
    assert.equal(db.tables.get("tickets")!.at(-1)!.id_3, CED);
  });

  it("getCatalogo trae la comisión de venta (comVta) a todo rol, sin costos", async () => {
    const { db, h } = semilla();
    db.tables.set("catalogo", [{ sku: "SUNSU-AS-002", producto_servicio: "Jabón Limpiador Ceramide Foam - Eyenlip", tipo: "PRODUCTO", subtotal: 16.51, total_con_iva: 18.99, precio_compra: 11.26, comi_producto_30: 1.575, activo: true }]);
    db.tables.set("inventario_base", []);
    const r = await h("and", "getCatalogo", {}) as unknown as Row[];
    const it = (Array.isArray(r) ? r : []).find((x) => x.sku === "SUNSU-AS-002")!;
    assert.equal(it.comVta, 1.575);
    assert.equal(it.compra, undefined); assert.equal(it.com, undefined); assert.equal(it.compraReal, undefined);
  });

  it("front: la línea prellenada toma la comisión del catálogo por SKU (no por nombre) y llena cédula y la liga", () => {
    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    assert.match(src, /pv\.prods\[pi\]\._com=_comVta\(item\)/);
    assert.match(src, /window\._catCom\[_migoSkuKey\(item\.sku\)\]/);
    assert.match(src, /var cc=window\._catCom&&window\._catCom\[key\]/);
    assert.match(src, /if\(cd\.cedula\) T\.cedula=String\(cd\.cedula\)/);
    assert.match(src, /_migoLigarClienta\(T\.cedula\)/);
    // Simula el ajuste: catálogo $18.99 com 1.575; factura al mismo precio → 1.575; a $16.99 → 1.575 − 0.3×2/1.15.
    const f = (base: number, p: number, pCat: number) => Math.max(0, Math.round((base + 0.3 * (p - pCat) / 1.15) * 100) / 100);
    assert.equal(f(1.575, 18.99, 18.99), 1.58);
    assert.equal(f(1.575, 16.99, 18.99), 1.05);
  });
});
