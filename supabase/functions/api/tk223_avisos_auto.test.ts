// TK223 (Emilia): cuando un aviso ya está resuelto, se apaga solo (sin pulsar ×).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./conteo_fisico_api.ts";
import "./asistencia_api.ts";
import "./inline_api.ts";
import "./erp_api.ts";
import { avisoSigueVigente, permisoDeAviso } from "./avisos_auto.ts";
import { cerrarAvisosMinimoResueltos, runErp } from "./erp.ts";
import type { Row } from "./domain.ts";
import type { Ctx } from "./lib.ts";

const root = new URL("../../../", import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root), "utf8");

function ctxDe(db: MemoryDb, now = "2026-11-25T17:00:00-05:00"): Ctx {
  return { db, now: new Date(now), env: {}, fetchImpl: fetch, legacyLogin: async () => ({}) } as unknown as Ctx;
}

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "emi", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "u-ana", nombre: "Ana", short: "Ana", rol: "cosmetologa", bloqueado: false },
  ]);
  db.tables.set("app_usuarios", []);
  db.tables.set("beta_notificaciones", []);
  db.tables.set("solicitudes_cambio", []);
  db.tables.set("permisos", []);
  db.tables.set("beta_conteos", []);
  db.tables.set("log_acciones", []);
  db.tables.set("erp_avisos", []);
  db.tables.set("erp_stock", []);
  db.tables.set("erp_producto_bodega", []);
  db.tables.set("erp_productos", []);
  db.tables.set("erp_bodegas", []);
  db.tables.set("erp_movimientos", []);
  db.tables.set("erp_oc", []);
  const c = ctxDe(db);
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok } as never) as Promise<Row>;
  return { db, h, c };
}

describe("TK223 · avisoSigueVigente", () => {
  it("apaga edición, permiso y conteo ya resueltos; deja pendientes y los FYI", () => {
    const data = {
      solicitudes: [
        { id: "sol-ok", tabla: "ticket_detalle", fila: "TK-SO-1934", estado: "aprobado" },
        { id: "sol-pend", tabla: "ticket_detalle", fila: "TK-SO-1978", estado: "pendiente" },
      ],
      permisos: [
        { id_1: "p1", empleada: "Andrea Robles", tipo: "VACACIONES", estado: "APROBADO", fecha_inicio: "2027-01-25", fecha_fin: "2027-01-29" },
        { id_1: "p2", empleada: "Ana", tipo: "PERSONAL", estado: "PENDIENTE", fecha_inicio: "2026-12-01", fecha_fin: "2026-12-01" },
      ],
      conteos: [
        { id: "cf-1", numero: "CF-001", estado: "aprobado" },
        { id: "cf-2", numero: "CF-002", estado: "en_revision" },
        { id: "cf-3", numero: "CF-003", estado: "asignado" },
      ],
    };
    assert.equal(avisoSigueVigente({ tipo: "edicion_ticket", ref_id: "sol-ok", id: "n1" }, data), false);
    assert.equal(avisoSigueVigente({ tipo: "edicion_ticket", ref_id: "sol-pend", id: "n2" }, data), true);
    assert.equal(avisoSigueVigente({
      tipo: "permiso", cuerpo: "Andrea Robles pidió vacaciones del 2027-01-25 al 2027-01-29.",
    }, data), false);
    assert.equal(avisoSigueVigente({ tipo: "permiso", ref_id: "p2" }, data), true);
    assert.equal(avisoSigueVigente({ tipo: "conteo_revision", ref_id: "cf-1" }, data), false);
    assert.equal(avisoSigueVigente({ tipo: "conteo_revision", ref_id: "cf-2" }, data), true);
    assert.equal(avisoSigueVigente({ tipo: "conteo", ref_id: "cf-3" }, data), true);
    assert.equal(avisoSigueVigente({ tipo: "conteo", ref_id: "cf-1" }, data), false);
    assert.equal(avisoSigueVigente({ tipo: "permiso_aprobado", ref_id: "p1" }, data), true);
    assert.equal(avisoSigueVigente({ tipo: "solicitud_aprobada", ref_id: "sol-ok" }, data), true);
    assert.ok(permisoDeAviso({ cuerpo: "Andrea Robles pidió vacaciones del 2027-01-25 al 2027-01-29." }, data.permisos));
  });
});

describe("TK223 · notif_mias apaga avisos resueltos", () => {
  it("al cargar, marca leídos los avisos de solicitudes/permisos/conteos ya cerrados y no los lista", async () => {
    const { db, h } = semilla();
    db.tables.set("solicitudes_cambio", [
      { id: "87321a5e-c7d7-4d99-bc1c-8a4ca138fa84", tabla: "ticket_detalle", fila: "TK-SO-1934", estado: "aprobado", creado: "2026-11-20T17:21:00Z" },
      { id: "7360aaed-1996-4a11-95d9-bd507f468a46", tabla: "ticket_detalle", fila: "TK-SO-1978", tipo: "eliminacion", estado: "pendiente", creado: "2026-11-24T18:09:00Z", solicitante: "Ana" },
    ]);
    db.tables.set("permisos", [
      { id_1: "1795117715780", empleada: "Andrea Robles", tipo: "VACACIONES", estado: "APROBADO", fecha_inicio: "2027-01-25", fecha_fin: "2027-01-29" },
    ]);
    db.tables.set("beta_conteos", [
      { id: "5cf84247-f69b-4505-bfb0-5812b780e0e7", numero: "CF-001", estado: "aprobado" },
    ]);
    db.tables.set("beta_notificaciones", [
      { id: "n-edit", usuario: "emi", tipo: "edicion_ticket", titulo: "Solicitud de edición de ticket", cuerpo: "Ana pidió editar TK-SO-1934", link: "#/m/tickets/t/TK-SO-1934", ref_id: "87321a5e-c7d7-4d99-bc1c-8a4ca138fa84", created_at: "2026-11-20T17:21:00Z" },
      { id: "n-perm", usuario: "emi", tipo: "permiso", titulo: "Solicitud de permiso", cuerpo: "Andrea Robles pidió vacaciones del 2027-01-25 al 2027-01-29.", link: "#/m/personal/permisos", created_at: "2026-11-19T19:48:00Z" },
      { id: "n-cf", usuario: "emi", tipo: "conteo_revision", titulo: "Conteo para revisar: CF-001", cuerpo: "EFCH terminó el conteo.", link: "#/m/conteos/cf/5cf84247-f69b-4505-bfb0-5812b780e0e7", ref_id: "5cf84247-f69b-4505-bfb0-5812b780e0e7", created_at: "2026-11-19T18:05:00Z" },
      { id: "n-fyi", usuario: "emi", tipo: "solicitud_aprobada", titulo: "Solicitud aprobada", cuerpo: "Aprobaron tu solicitud.", link: "#/m/solicitudes", ref_id: "otra", created_at: "2026-11-20T20:00:00Z" },
    ]);
    const r = await h("notif_mias", "adm");
    const items = (r.items || []) as Row[];
    const ids = items.filter((x) => !x.leida).map((x) => s(x.id));
    assert.equal(items.find((x) => x.id === "n-edit")?.leida, true);
    assert.equal(items.find((x) => x.id === "n-perm")?.leida, true);
    assert.equal(items.find((x) => x.id === "n-cf")?.leida, true);
    assert.ok(ids.includes("n-fyi"), "el aviso FYI sigue hasta leerlo o descartarlo");
    assert.ok(ids.some((id) => String(id).startsWith("sol:")), "la solicitud pendiente sigue como aviso virtual");
    assert.equal(r.sinLeer, ids.length);
    const rows = db.tables.get("beta_notificaciones") || [];
    assert.ok(rows.find((x) => x.id === "n-edit")?.leida_at);
    assert.ok(rows.find((x) => x.id === "n-perm")?.leida_at);
    assert.ok(rows.find((x) => x.id === "n-cf")?.leida_at);
    assert.ok(!rows.find((x) => x.id === "n-fyi")?.leida_at);
  });

  it("al aprobar un permiso se apaga el aviso de la admin y queda el FYI de la empleada", async () => {
    const { db, h } = semilla();
    db.tables.set("permisos", [
      { sheet_row: 1, id_1: "p-9", empleada: "Ana", tipo: "PERSONAL", estado: "PENDIENTE", fecha_inicio: "2026-12-01", fecha_fin: "2026-12-01", origin: "beta" },
    ]);
    db.tables.set("beta_notificaciones", [
      { id: "n-admin", usuario: "emi", tipo: "permiso", titulo: "Solicitud de permiso", cuerpo: "Ana pidió personal del 2026-12-01 al 2026-12-01.", link: "#/m/personal/permisos", ref_id: "p-9", created_at: "2026-11-25T12:00:00Z" },
    ]);
    const ok = await h("asis_permiso_resolver", "adm", { id: "p-9", estado: "APROBADO" });
    assert.equal(ok.ok, true, String(ok.error || ""));
    const admin = await h("notif_mias", "adm");
    assert.ok(!(admin.items as Row[]).some((x) => x.id === "n-admin" && !x.leida));
    const cos = await h("notif_mias", "cos");
    assert.ok((cos.items as Row[]).some((x) => x.tipo === "permiso_aprobado" && !x.leida));
  });

  it("el × / notif_leer sigue marcando leído un aviso FYI", async () => {
    const { db, h } = semilla();
    db.tables.set("beta_notificaciones", [
      { id: "n-fyi", usuario: "emi", tipo: "solicitud_aprobada", titulo: "Solicitud aprobada", cuerpo: "Listo.", created_at: "2026-11-25T12:00:00Z" },
    ]);
    const unread = (r: { items?: { id?: string; leida?: boolean }[] }) => ((r.items || []) as { id?: string; leida?: boolean }[]).filter((x) => x.id === "n-fyi" && !x.leida);
    assert.equal(unread(await h("notif_mias", "adm") as { items?: { id?: string; leida?: boolean }[] }).length, 1);
    await h("notif_leer", "adm", { id: "n-fyi" });
    assert.equal(unread(await h("notif_mias", "adm") as { items?: { id?: string; leida?: boolean }[] }).length, 0);
  });
});

describe("TK223 · avisos de bajo mínimo", () => {
  it("home cierra el aviso cuando el stock ya no está bajo el mínimo", async () => {
    const db = new MemoryDb();
    const pid = "p1", bid = "11111111-1111-4111-8111-111111111111";
    db.tables.set("erp_productos", [{ id: pid, sku: "ML-001", nombre: "Ampoule", uso: "venta", activo: true }]);
    db.tables.set("erp_bodegas", [{ id: bid, codigo: "VENTA", nombre: "Venta", tipo: "venta" }]);
    db.tables.set("erp_producto_bodega", [{ producto_id: pid, bodega_id: bid, stock_min: 2 }]);
    db.tables.set("erp_stock", [{ producto_id: pid, bodega_id: bid, cantidad: 10 }]);
    db.tables.set("erp_movimientos", []);
    db.tables.set("erp_oc", []);
    db.tables.set("erp_avisos", [{ id: 1, tipo: "bajo_minimo", ref: pid + "|" + bid, texto: "ML-001 quedó en 0", estado: "abierto" }]);
    const home = await runErp("home", {}, db, "Emilia (emi)", new Date("2026-11-25T17:00:00-05:00"));
    assert.equal((home.avisos as Row[]).length, 0);
    assert.equal(db.tables.get("erp_avisos")![0].estado, "cerrado");
    assert.equal((await cerrarAvisosMinimoResueltos(db, "emi", new Set(), new Date())).constructor, Number);
  });
});

describe("TK223 · UI", () => {
  it("el Dashboard pide notif_mias y voucher_alertas; tras resolver se refresca la campana; cache al día", () => {
    const html = file("index.html");
    const sw = file("sw.js");
    assert.match(html, /api\("notif_mias"/);
    assert.match(html, /api\("voucher_alertas"/);
    assert.match(html, /asis_permiso_resolver[\s\S]{0,400}pintarBadgeNotif/);
    assert.match(html, /solicitud_resolver[\s\S]{0,250}pintarBadgeNotif/);
assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-26-PAQ1215"/);
    assert.match(sw, /const CACHE = "sunsu-2026-11-26-PAQ1215"/);
  });
});

function s(v: unknown): string { return v == null ? "" : String(v); }
