import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import { lecturaEnVista, DEFAULT_MATRIZ } from "./permisos.ts";
import "./tickets_lista_api.ts";
import "./tickets_beta_api.ts";
import "./inline_api.ts";
import type { Row } from "./domain.ts";

function ctx(db: MemoryDb, rol: string, uid: string, name: string, short?: string) {
  const token = "t-" + uid;
  const ses = db.tables.get("sesiones") || [];
  ses.push({ token, uid, rol, name, exp: "2099-01-01T00:00:00.000Z" });
  db.tables.set("sesiones", ses);
  const users = db.tables.get("usuarios") || [];
  if (!users.some((u) => u.id === uid)) users.push({ id: uid, nombre: name, short: short || name.split(" ")[0], rol, bloqueado: false });
  db.tables.set("usuarios", users);
  return {
    db, now: new Date("2026-11-18T16:00:00Z"),
    env: {} as Record<string, string | undefined>,
    fetchImpl: fetch,
    legacyLogin: async () => ({ ok: false }),
    token,
  };
}

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", []);
  db.tables.set("usuarios", []);
  db.tables.set("app_modulos", []);
  db.tables.set("tickets", [
    { id: 11, sheet_row: 11, so_num: "TK-SO-11", timestamp: "2026-11-18T15:00:00Z", nombre: "María", apellido: "Paz", atendido_por: "Andrea Robles", estimado: 80, id_3: "1701", fac_7: "", cob: false, fac: false },
    { id: 22, sheet_row: 22, so_num: "TK-SO-22", timestamp: "2026-11-18T16:00:00Z", nombre: "Luz", apellido: "Vera", atendido_por: "Daniela Mora", estimado: 50, id_3: "1702", fac_7: "", cob: false, fac: false },
  ]);
  db.tables.set("beta_tickets", []);
  db.tables.set("beta_ticket_flags", []);
  db.tables.set("beta_ticket_cancelados", []);
  db.tables.set("beta_cuadre_link", []);
  db.tables.set("beta_migo_facturas_vivo", []);
  db.tables.set("beta_ticket_envios", []);
  db.tables.set("clientas_registro", [
    { cedula: "1701", nombre: "María", apellido: "Paz", telefono: "0991111111", email: "maria@test.com", sector_donde_vive: "Cumbayá" },
  ]);
  const and = ctx(db, "cosmetologa", "u-and", "Andrea Robles", "Andrea");
  const ale = ctx(db, "recepcion", "u-ale", "Alejandra Rodriguez", "Alejandra");
  const adm = ctx(db, "admin", "admin", "Emilia", "Emilia");
  const h = (c: ReturnType<typeof ctx>, a: string, p: Row = {}) => handle(a, { token: c.token, ...p }, c) as Promise<Row>;
  return { db, and, ale, adm, h };
}

describe("TK61 ventas del personal", () => {
  it("Andrea solo ve los tickets que ella generó; Alejandra ve todos", async () => {
    const { and, ale, h } = semilla();
    assert.equal(DEFAULT_MATRIZ.recepcion?.tickets, "todos");
    const a = await h(and, "tk_historial", { limit: 50 });
    assert.equal(a.ok, true, String(a.error));
    const idsA = (a.items as Row[]).map((x) => x.so_num || x.tkRow);
    assert.ok((a.items as Row[]).some((x) => String(x.so_num) === "TK-SO-11"));
    assert.ok((a.items as Row[]).every((x) => String(x.cosmetologa) === "Andrea Robles" || String(x.so_num) === "TK-SO-11"));
    assert.equal((a.items as Row[]).length, 1);
    assert.ok(!(a.items as Row[])[0].telefono, "staff no debe ver teléfono");
    const r = await h(ale, "tk_historial", { limit: 50 });
    assert.equal(r.ok, true, String(r.error));
    assert.equal((r.items as Row[]).length, 2);
    const listaA = await h(and, "getTicketsLista", {});
    assert.equal((listaA.items as Row[]).length, 1);
    const listaR = await h(ale, "getTicketsLista", {});
    assert.equal((listaR.items as Row[]).length, 2);
  });

  it("«Ver como Andrea» puede leer la lista (tk_historial) y no ve tickets ajenos", async () => {
    const { adm, h } = semilla();
    assert.equal(lecturaEnVista("tk_historial"), true);
    assert.equal(lecturaEnVista("tk_reagendadas"), true);
    const r = await h(adm, "tk_historial", { preview: true, preview_uid: "u-and", limit: 50 });
    assert.equal(r.ok, true, String(r.error));
    assert.equal((r.items as Row[]).length, 1);
    assert.equal((r.items as Row[])[0].so_num, "TK-SO-11");
  });

  it("Andrea no abre el ticket de otra cosmetóloga; el front permite tk_historial en Ver como", async () => {
    const { and, h } = semilla();
    const no = await h(and, "getTicket", { so_num: "TK-SO-22" });
    assert.match(String(no.error), /permiso/i);
    const si = await h(and, "getTicket", { so_num: "TK-SO-11" });
    assert.equal(si.ok, true, String(si.error));
    const beta = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    assert.match(beta, /"tk_historial"/);
    assert.match(beta, /"tk_reagendadas"/);
  });
});
