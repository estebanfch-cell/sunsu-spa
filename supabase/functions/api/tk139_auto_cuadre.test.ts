// TK139: el ticket se ve al instante en la lista de Emilia y, si calza con
// una factura Migo del mismo día, se vincula en el mismo request y sale de Borradores.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./tickets_lista_api.ts";
import "./migo_cuadre_api.ts";
import type { Row } from "./domain.ts";

const FAC = "001-001-000009801";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "emi", uid: "u-emi", rol: "super_admin", name: "Emilia", short: "Emi", exp: "2099-01-01T00:00:00.000Z" },
    { token: "and", uid: "u-and", rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin" },
    { id: "u-emi", nombre: "Emilia", short: "Emi", rol: "super_admin" },
    { id: "u-and", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa" },
  ]);
  for (const t of [
    "app_modulos", "tickets", "beta_tickets", "beta_ticket_flags", "beta_ticket_cancelados",
    "beta_cuadre_link", "beta_migo_importes", "beta_ticket_envios", "beta_citas_ticket",
    "log_acciones", "clientas_registro", "beta_clientes", "beta_ticket_lineas", "beta_ticket_snaps",
    "catalogo", "erp_productos", "beta_sku_alias", "beta_migo_sku_alias",
  ]) db.tables.set(t, []);
  const lineas = [
    { sku: "SUNSU-40", codigo: "SUNSU-40", producto: "Facial Reset 3x1", cantidad: 1, total: 95, precio_unit: 95 },
    { sku: "SUNSU-15", codigo: "SUNSU-15", producto: "Ampolla Especial", cantidad: 1, total: 30, precio_unit: 30 },
  ];
  db.tables.set("beta_migo_facturas_vivo", [{
    factura: FAC, fecha: "2026-11-19", cliente: "Maria Judith Rosales", total: 125, forma: "Tarjeta", lineas,
  }]);
  db.tables.set("beta_migo_borradores", [{
    factura: FAC, fecha: "2026-11-19", cliente: "Maria Judith Rosales", total: 125, forma: "Tarjeta",
    estado: "asignado", asignado_a: "Andrea Robles", datos: {}, lineas, ticket_id: null, ticket_clave: null,
  }]);
  db.tables.set("catalogo", [
    { sku: "SUNSU-40", nombre: "Facial Reset 3x1", pvp: 95, precio: 95 },
    { sku: "SUNSU-15", nombre: "Ampolla Especial", pvp: 30, precio: 30 },
  ]);
  const c = { db, now: new Date("2026-11-19T18:20:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (tok: string, a: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok } as never) as Promise<Row>;
  return { db, h };
}

describe("TK139 visibilidad + auto-cuadre al crear ticket", () => {
  it("staff envía desde un Borrador: el ticket aparece al instante en la lista de admin/super_admin", async () => {
    const { db, h } = semilla();
    const st = await h("and", "crearTicket", {
      nombre: "Maria Judith", apellido: "Rosales", estimado: 125, cosmetologa: "Andrea Robles",
      vincular_borrador: FAC, facial: "SUNSU-40 Facial Reset 3x1", extras: "SUNSU-15 Ampolla Especial",
    });
    assert.equal(st.ok, true, String(st.error));
    assert.ok(st.so_num || st.beta_num, "debe devolver un código de ticket");
    const tk = db.tables.get("tickets")!.at(-1)!;
    const listaAdm = await h("adm", "tk_historial", { limit: 50 });
    assert.equal(listaAdm.ok, true, String(listaAdm.error));
    const itemsAdm = (listaAdm.items || []) as Row[];
    assert.ok(itemsAdm.some((x) => s(x.so_num || x.clave || x.ticket) === s(st.so_num) || s(x.id) === s(tk.id) || s(x.beta_num) === s(st.beta_num)),
      "admin debe ver el ticket nuevo: " + JSON.stringify((itemsAdm[0] || {}) && Object.keys(itemsAdm[0] || {})));
    const listaEmi = await h("emi", "tk_historial", { limit: 50 });
    assert.equal(listaEmi.ok, true, String(listaEmi.error));
    const itemsEmi = (listaEmi.items || []) as Row[];
    assert.ok(itemsEmi.some((x) => s(x.so_num) === s(st.so_num) || s(x.id) === s(tk.id) || s(x.beta_num) === s(st.beta_num)),
      "super_admin debe ver el ticket de la chica");
  });

  it("al crear un ticket que calza con una factura Migo, se vincula en el mismo request y sale de Borradores", async () => {
    const { db, h } = semilla();
    const st = await h("and", "crearTicket", {
      nombre: "Maria Judith", apellido: "Rosales", estimado: 125, cosmetologa: "Andrea Robles",
      vincular_borrador: FAC, facial: "SUNSU-40 Facial Reset 3x1", extras: "SUNSU-15 Ampolla Especial",
    });
    assert.equal(st.ok, true, String(st.error));
    const links = db.tables.get("beta_cuadre_link") || [];
    assert.ok(links.length >= 1, "debe haber vínculo en el mismo request");
    const facs = links.map((L) => s(L.factura));
    assert.ok(facs.includes(FAC), "la factura del día queda aplicada al ticket");
    const bor = (db.tables.get("beta_migo_borradores") || []).find((b) => s(b.factura) === FAC)!;
    assert.equal(s(bor.estado), "vinculado", "el borrador debe salir de la bandeja");
    assert.ok(bor.ticket_id, "el borrador queda con ticket_id");
    const lista = await h("adm", "migo_borradores_lista", {});
    assert.equal(lista.ok, true, String(lista.error));
    const visibles = ([] as Row[]).concat((lista.mias as Row[]) || [], (lista.bandeja as Row[]) || [], (lista.pendientes as Row[]) || []);
    assert.equal(visibles.filter((x) => s(x.factura) === FAC).length, 0, "la factura ya cuadrada no puede quedarse en Borradores");
    assert.ok(st.cuadre && (st.cuadre as Row).ok !== false, "crearTicket devuelve el resultado del cuadre");
  });

  it("ticket manual/Agenda (sin vincular_borrador) también se ve y se cuadra si los SKU del mismo día calzan", async () => {
    const { db, h } = semilla();
    const st = await h("and", "crearTicket", {
      nombre: "Maria Judith", apellido: "Rosales", estimado: 125, cosmetologa: "Andrea Robles",
      facial: "SUNSU-40 Facial Reset 3x1", extras: "SUNSU-15 Ampolla Especial",
      ignorar_borrador: true,
    });
    assert.equal(st.ok, true, String(st.error));
    const lista = await h("adm", "tk_historial", { limit: 50 });
    const items = (lista.items || []) as Row[];
    assert.ok(items.some((x) => s(x.so_num) === s(st.so_num) || s(x.beta_num) === s(st.beta_num)), "aparece en Tickets");
    const links = db.tables.get("beta_cuadre_link") || [];
    assert.ok(links.some((L) => s(L.factura) === FAC), "auto-cuadra por SKU en el mismo request");
    const bor = (db.tables.get("beta_migo_borradores") || []).find((b) => s(b.factura) === FAC)!;
    assert.equal(s(bor.estado), "vinculado");
    const bandeja = await h("adm", "migo_borradores_lista", {});
    const visibles = ([] as Row[]).concat((bandeja.mias as Row[]) || [], (bandeja.bandeja as Row[]) || [], (bandeja.pendientes as Row[]) || []);
    assert.equal(visibles.filter((x) => s(x.factura) === FAC).length, 0);
  });

  it("el listado de Borradores excluye una factura que ya tiene vínculo en beta_cuadre_link aunque el borrador siga 'pendiente'", async () => {
    const { db, h } = semilla();
    db.tables.get("tickets")!.push({
      id: 4242, so_num: "TK-SO-4242", timestamp: "2026-11-19T13:00:00Z",
      nombre: "Maria Judith", apellido: "Rosales", atendido_por: "Andrea Robles", estimado: 125,
    });
    db.tables.get("beta_cuadre_link")!.push({
      ticket_id: 4242, factura: FAC, tipo: "sku", confianza: "alta", diferencia_monto: 0,
      diferencia_fecha: 0, estado: "cuadra", motivo: "test", total_factura: 125, total_tickets: 125,
    });
    // el borrador quedó sucio (estado asignado, sin ticket_id) como pasaba antes de syncBorradores
    const lista = await h("adm", "migo_borradores_lista", {});
    const visibles = ([] as Row[]).concat((lista.mias as Row[]) || [], (lista.bandeja as Row[]) || [], (lista.pendientes as Row[]) || []);
    assert.equal(visibles.filter((x) => s(x.factura) === FAC).length, 0, "nunca debe quedarse pegada una factura ya cuadrada");
    const facturas = await h("adm", "mb_facturas_borrador", {});
    const items = (facturas.items || []) as Row[];
    assert.equal(items.filter((x) => s(x.factura) === FAC).length, 0);
  });

  it("el caché de la beta apunta a TK139", () => {
    const sw = readFileSync(join(root, "sw.js"), "utf8");
    const beta = readFileSync(join(root, "beta.html"), "utf8");
    const screens = readFileSync(join(root, "beta-screens.js"), "utf8");
    assert.match(sw, /const CACHE = "sunsu-beta-2026-11-19-TK148"/);
    assert.match(beta, /window\.SUNSU_CACHE = "sunsu-beta-2026-11-19-TK148"/);
    assert.match(beta, /20261119tk146/);
    assert.doesNotMatch(sw, /sunsu-beta-2026-11-19-TK138/);
    assert.match(screens, /CU\.role==='super_admin'/);
    assert.match(screens, /ROLES_OK=\['admin','admin_master','super_admin'/);
  });
});

function s(v: unknown) { return String(v ?? ""); }
