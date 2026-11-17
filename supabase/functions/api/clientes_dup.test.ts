import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./clientes_beta_api.ts";
import "./clientes_dup_api.ts";
import { cedulaValida, cedulaVer, formatearRespuesta, idVer, normCedula } from "./domain.ts";
import { claveCliente } from "./ventas.ts";
import { fijarAlias } from "./clientes_alias.ts";
import type { Row } from "./domain.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }]);
  const tk = (id: number, ced: string, nombre: string, apellido: string, ts: string) => ({ id, sheet_row: 100 + id, so_num: "TK-SO-" + id, timestamp: ts, atendido_por: "Ana", nombre, apellido, id_3: ced, estimado: 50, facial_hecho: "SUNSU-40 Facial" });
  db.tables.set("tickets", [
    tk(1, "1716768062001.0", "Luz ", "Gallegos Bustamante", "2026-10-01T15:00:00Z"),
    tk(2, "1716768062.0", "Luz Elena ", "Gallegos ", "2026-10-05T15:00:00Z"),
    tk(3, "1716768062", "Luz elena", "Gallegos", "2026-11-01T15:00:00Z"),
    tk(4, "1716768062001", "Luz", "Gallegos", "2026-11-10T15:00:00Z"),
    tk(5, "", "Marta", "Ruiz", "2026-11-11T15:00:00Z"),
    tk(6, "1713061271", "Marta", "Ruiz Paz", "2026-11-12T15:00:00Z"),
  ]);
  db.tables.set("clientas_registro", [
    { id: 1, sheet_row: 9, cedula: "1716768062.0", nombre: "Luz Elena", apellido: "Gallegos", telefono: "0991234567" },
    { id: 2, sheet_row: 30, cedula: "1716768062001.0", nombre: "Luz", apellido: "Gallegos Bustamante", telefono: "0991234567" },
    { id: 3, sheet_row: 40, cedula: "1713061271", nombre: "Marta", apellido: "Ruiz Paz", telefono: "0987654321" },
  ]);
  db.tables.set("beta_clientes", [
    { key: "c:1716768062", codigo: "C-00008", nombre: "Luz Elena Gallegos", cedula: "1716768062", datos: {} },
    { key: "c:1716768062001", codigo: "C-00029", nombre: "Luz Gallegos Bustamante", cedula: "1716768062001", datos: { email: "luz@x.com" } },
  ]);
  for (const t of ["beta_cliente_alias", "log_acciones", "paquetes", "gift_cards", "catalogo", "erp_productos", "beta_tickets", "beta_cliente_documentos", "beta_paquete_ajustes"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-17T18:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, p: Row = {}) => handle(a, { token: "adm", ...p }, { ...c, token: "adm" }) as Promise<Row>;
  return { db, h };
}

describe("🔗 clientas duplicadas", () => {
  it("cédula/RUC: sin .0, RUC 001 = cédula, 0 de provincia al mostrar, dígito verificador", () => {
    fijarAlias({});
    for (const v of ["1716768062", "1716768062001", "1716768062.0", "17167680620010", "1716768062001.0"]) assert.equal(normCedula(v), "1716768062");
    assert.equal(cedulaVer("0912345678001"), "0912345678");
    assert.equal(normCedula("A80302695 "), "A80302695");
    assert.equal(normCedula("Emily Hernaiz"), "");
    assert.equal(cedulaValida("1716768062"), true);
    assert.equal(cedulaValida("1716768063"), false);
    assert.equal(claveCliente({ id_3: "1716768062001.0" }), "c:1716768062");    // Formato de lectura en todos los módulos: RUC de proveedor queda RUC, sin .0; celular +593.
    assert.equal(idVer("1793161898001.0"), "1793161898001");
    assert.equal(idVer(912345678), "0912345678");
    const r = formatearRespuesta({ items: [{ RUC: "1793161898001.0", "TELÉFONO": "987684789.0", telefono: 982553873, nombre: "Ana 1.0" }] });
    assert.deepEqual(r.items[0], { RUC: "1793161898001", "TELÉFONO": "+593 98 768 4789", telefono: "+593 98 255 3873", nombre: "Ana 1.0" });
  });
  it("misma cédula = una clienta con el código más antiguo; separar y unir a mano son reversibles", async () => {
    const { h } = semilla();
    const L = await h("cl_list");
    const luz = (L.clientes as Row[]).filter((c) => /luz/i.test(s(c.nombre)));
    assert.equal(luz.length, 1);
    assert.equal(luz[0].codigo, "C-00008");
    assert.equal(luz[0].cedula, "1716768062");
    assert.equal(luz[0].visitas, 4);
    const f = await h("cl_get", { key: "c:1716768062001" });
    assert.equal(f.key, "c:1716768062");
    assert.equal((f.datos as Row).email, "luz@x.com");
    const b = await h("cl_buscar", { q: "Luz" });
    assert.equal((b.items as Row[]).length, 1);
    assert.equal((b.items as Row[])[0].codigo, "C-00008");
    const d = await h("cl_dup_lista");
    assert.equal((d.totales as Row).auto, 1);
    assert.ok((d.sugerencias as Row[]).some((x) => /marta/i.test(s((x.a as Row).nombre))));
    // Deshacer la unión automática de la variante RUC.
    const sp = await h("cl_dup_separar", { clave: "c:1716768062001" });
    assert.equal(sp.ok, true, s(sp.error));
    const L2 = await h("cl_list");
    assert.equal((L2.clientes as Row[]).filter((c) => /luz/i.test(s(c.nombre))).length, 2);
    assert.equal((await h("cl_dup_deshacer", { id: sp.id })).ok, true);
    assert.equal(((await h("cl_list")).clientes as Row[]).filter((c) => /luz/i.test(s(c.nombre))).length, 1);
    // Unir a mano Marta sin cédula con Marta Ruiz Paz.
    const u = await h("cl_dup_unir", { a: "c:1713061271", b: "n:marta ruiz", principal: "c:1713061271" });
    assert.equal(u.ok, true, s(u.error));
    const m = ((await h("cl_list")).clientes as Row[]).filter((c) => /marta/i.test(s(c.nombre)));
    assert.equal(m.length, 1); assert.equal(m[0].visitas, 2);
    assert.equal((((await h("cl_dup_lista")).manual) as Row[]).length, 1);
    assert.equal((await h("cl_dup_deshacer", { id: u.id })).ok, true);
    assert.equal(((await h("cl_list")).clientes as Row[]).filter((c) => /marta/i.test(s(c.nombre))).length, 2);
    // No son la misma: desaparece de sugerencias.
    await h("cl_dup_nodup", { a: "c:1713061271", b: "n:marta ruiz" });
    assert.ok(!(((await h("cl_dup_lista")).sugerencias) as Row[]).some((x) => /marta/i.test(s((x.a as Row).nombre))));
    fijarAlias({});
  });
});
function s(v: unknown): string { return v == null ? "" : String(v); }
