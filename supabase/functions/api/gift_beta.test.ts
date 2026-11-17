import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./clientes_beta_api.ts";
import "./gift_beta_api.ts";
import { estadoGift, leerNotas, repetidos, siguienteGift, validoPorDefecto } from "./gift_beta.ts";
import type { Row } from "./domain.ts";

function semilla(fetchImpl?: typeof fetch) {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "rec", uid: "u-ale", rol: "recepcion", name: "Alejandra", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }, { id: "u-ale", nombre: "Alejandra", rol: "recepcion" }]);
  db.tables.set("gift_cards", [
    { id: 255, sheet_row: 257, codigo_gc: "26-008", dia: 15, mes: 1, ano: 2026, nombre_comprador: "María Belén", usado: true, fecha_uso: "2026-02-01", usado_por: "Andrea", origin: "sheet" },
    { id: 256, sheet_row: 258, codigo_gc: "26-008", dia: 15, mes: 1, ano: 2026, nombre_comprador: "Sylvia Ximena", usado: true, origin: "sheet" },
    { id: 400, sheet_row: 402, codigo_gc: "26-171", dia: 17, mes: 11, ano: 2026, nombre_comprador: "Camila", cedula_comprador: "1711111111", factura: "2951.0", sku: "SUNSU-35", valor: "Gift Card", notas: "PREMIUM. De: Camila. Para: Carolina Espinosa", origin: "sheet" },
    { id: 401, sheet_row: 403, codigo_gc: "26-172", origin: "sheet" },
    { id: 402, sheet_row: 404, codigo_gc: "26-173", origin: "sheet" },
    { id: 403, sheet_row: 405, codigo_gc: "26-173", origin: "sheet" },
  ]);
  for (const t of ["beta_gift_ajustes", "beta_gift_documentos", "log_acciones", "tickets", "gift_cards_digitales", "beta_tickets", "beta_cliente_documentos"]) db.tables.set(t, []);
  const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sk-test" };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { db, now: new Date("2026-11-17T22:00:00Z"), env, fetchImpl: fetchImpl || fetch, legacyLogin: async () => ({}), token: tok } as never) as Promise<Row>;
  return { db, h };
}

describe("🎁 Gift cards (TK20)", () => {
  it("reglas puras: notas, estados, repetidos y siguiente código único", () => {
    assert.deepEqual(leerNotas("PREMIUM. De: Camila. Para: Carolina Espinosa"), { servicio: "PREMIUM", de: "Camila", para: "Carolina Espinosa" });
    assert.deepEqual(leerNotas("PREMIUM. De: Isabel, Julia y Antonia y Para: Andre."), { servicio: "PREMIUM", de: "Isabel, Julia y Antonia", para: "Andre" });
    assert.equal(estadoGift({ codigo_gc: "x" }, null, "2026-11-17"), "disponible");
    assert.equal(estadoGift({ dia: 1, nombre_comprador: "A" }, { valido_hasta: "2026-10-01" }, "2026-11-17"), "vencida");
    assert.equal(estadoGift({ dia: 1, usado: true }, null, "2026-11-17"), "usada");
    const rows = [{ id: 1, codigo_gc: "26-008" }, { id: 2, codigo_gc: "26-008 " }, { id: 3, codigo_gc: "26-010" }, { id: 4, codigo_gc: "26-011" }, { id: 5, codigo_gc: "26-011" }];
    assert.deepEqual([...repetidos(rows)].sort(), ["26-008", "26-011"]);
    assert.deepEqual(siguienteGift(rows, "26"), { codigo: "26-010", id: 3 });
    assert.deepEqual(siguienteGift(rows.filter((r) => r.id !== 3), "26"), { codigo: "26-012", id: null });
    assert.equal(validoPorDefecto("2026-11-17"), "2027-05-17");
  });

  it("lista: vigentes por defecto, repetidos marcados, el siguiente salta los blancos repetidos", async () => {
    const { h } = semilla();
    const L = await h("gcb_lista", "rec");
    assert.equal(L.total, 1);
    const it0 = (L.items as Row[])[0];
    assert.equal(it0.codigo, "26-171"); assert.equal(it0.para, "Carolina Espinosa"); assert.equal(it0.servicio, "PREMIUM"); assert.equal(it0.factura, "2951");
    assert.deepEqual(L.cuenta, { vigentes: 1, usadas: 2, vencidas: 0, disponibles: 3, todas: 3 });
    assert.equal(L.siguiente, "26-172");
    const U = await h("gcb_lista", "rec", { estado: "usadas" });
    assert.ok((U.items as Row[]).every((x) => x.repetido === true));
    assert.equal((await h("gcb_get", "rec", { id: "26-008" })).error, "Gift card no encontrada");
    assert.equal(((await h("gcb_get", "rec", { id: "256" })).item as Row).comprador, "Sylvia Ximena");
  });

  it("vender usa el blanco único, luego crea un código nuevo; nunca repite", async () => {
    const { db, h } = semilla();
    assert.equal((await h("gcb_vender", "rec", { nombre: "Ana" })).error, "Elige el facial / servicio de la gift card");
    const v1 = await h("gcb_vender", "rec", { codigo: "26-172", nombre: "Ana", apellido: "Ruiz", servicio: "Premium", para: "Sol", factura: "3001" });
    assert.equal(v1.codigo, "26-172"); assert.equal(v1.id, 401);
    const g = db.tables.get("gift_cards")!.find((r) => r.id === 401)!;
    assert.equal(g.nombre_comprador, "Ana"); assert.equal(g.notas, "PREMIUM. De: Ana Ruiz. Para: Sol"); assert.equal(g.sku, "SUNSU-35");
    const aj = db.tables.get("beta_gift_ajustes")!.find((a) => a.gift_id === 401)!;
    assert.equal(aj.valido_hasta, "2027-05-17"); assert.equal(aj.para, "Sol");
    // 26-173 está repetido en blanco: no se reparte; se crea 26-174
    const stale = await h("gcb_vender", "rec", { codigo: "26-172", nombre: "Bea", servicio: "Premium" });
    assert.match(String(stale.error), /El siguiente es 26-174/);
    const v2 = await h("gcb_vender", "rec", { nombre: "Bea", servicio: "Purificación SOS" });
    assert.equal(v2.codigo, "26-174");
    assert.equal(db.tables.get("gift_cards")!.filter((r) => r.codigo_gc === "26-174").length, 1);
    assert.equal(db.tables.get("gift_cards")!.find((r) => r.codigo_gc === "26-174")!.origin, "beta");
  });

  it("usar con confirmación, desmarcar admin con motivo, editar sin repetir códigos, eliminar", async () => {
    const { db, h } = semilla();
    assert.equal((await h("gcb_usar", "rec", { id: 401 })).error, "Ese código no está vendido");
    assert.equal((await h("gcb_usar", "rec", { id: 400, por: "Andrea", ticket: "TK-SO-2100", fecha: "2026-11-17" })).ok, true);
    assert.match(String((await h("gcb_usar", "rec", { id: 400 })).error), /ya está usada/);
    assert.equal((await h("gcb_usar", "rec", { id: 400, desmarcar: true, motivo: "x" })).error, "Solo un admin desmarca el uso");
    assert.equal((await h("gcb_usar", "adm", { id: 400, desmarcar: true })).error, "Escribe el motivo");
    assert.equal((await h("gcb_usar", "adm", { id: 400, desmarcar: true, motivo: "se marcó por error" })).ok, true);
    assert.equal(db.tables.get("gift_cards")!.find((r) => r.id === 400)!.usado, false);
    assert.equal((await h("gcb_guardar", "rec", { id: 400, datos: { para: "X" } })).error, "Solo un admin edita una gift card");
    assert.match(String((await h("gcb_guardar", "adm", { id: 400, datos: { codigo: "26-008" } })).error), /ya existe/);
    assert.equal((await h("gcb_guardar", "adm", { id: 400, datos: { para: "Carolina E.", validoHasta: "2027-01-31", factura: "2951" } })).ok, true);
    // el repetido viejo se puede editar sin tocar su código
    assert.equal((await h("gcb_guardar", "adm", { id: 256, datos: { codigo: "26-008", notas: "duplicado de la hoja" } })).ok, true);
    const d = await h("gcb_get", "adm", { id: 400 });
    assert.equal((d.item as Row).para, "Carolina E."); assert.equal((d.item as Row).validoHasta, "2027-01-31");
    assert.deepEqual(((d.item as Row).historial as Row[]).map((x) => x.accion), ["USO", "DESMARCAR USO", "EDITAR"]);
    assert.equal((await h("gcb_borrar", "adm", { id: 400 })).error, "Escribe el motivo");
    assert.equal((await h("gcb_borrar", "adm", { id: 400, motivo: "anulada" })).ok, true);
    assert.equal((await h("gcb_lista", "rec")).total, 0);
  });

  it("PDF: sube al bucket, queda en la gift card y en Documentos de la clienta", async () => {
    const llamadas: string[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      llamadas.push(String(url) + " " + (init?.method || "GET"));
      if (String(url).includes("/object/sign/")) return new Response(JSON.stringify({ signedURL: "/object/sign/cliente-documentos/x.pdf?token=t" }), { status: 200 });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const { db, h } = semilla(fake);
    db.tables.set("beta_clientes", [{ key: "c:1711111111", nombre: "Camila", apellido: "Paz", cedula: "1711111111" }]);
    db.tables.set("tickets", [{ id: 1, sheet_row: 5, so_num: "TK-SO-1", timestamp: "2026-11-01T15:00:00Z", nombre: "Camila", apellido: "Paz", id_3: "1711111111", atendido_por: "Emilia", estimado: 10 }]);
    assert.equal((await h("gcb_pdf_guardar", "rec", { id: 400, pdf: "data:image/png;base64,AAAA" })).error, "El PDF no llegó bien");
    const pdf = "data:application/pdf;base64," + Buffer.from("%PDF-1.4 " + "x".repeat(400)).toString("base64");
    const r = await h("gcb_pdf_guardar", "rec", { id: 400, pdf });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.match(llamadas[0], /storage\/v1\/object\/cliente-documentos\/gift_cards\/2026\/26-171_400_\d+\.pdf POST/);
    const d = await h("gcb_get", "rec", { id: 400 });
    assert.equal((d.documentos as Row[]).length, 1);
    const u = await h("gcb_doc_url", "rec", { id: (d.documentos as Row[])[0].id });
    assert.match(String(u.url), /^https:\/\/x\.supabase\.co\/storage\/v1\/object\/sign\//);
    const f = await h("cl_get", "adm", { key: "c:1711111111" });
    const gd = ((f.documentos || []) as Row[]).find((x) => x.sub === "gift_card");
    assert.ok(gd, JSON.stringify(f).slice(0, 300));
    assert.match(String(gd!.nombre), /Gift card 26-171/);
    const u2 = await h("cl_doc_url", "adm", { id: gd!.docId, key: "c:1711111111" });
    assert.equal(u2.ok, true, JSON.stringify(u2));
  });
});
