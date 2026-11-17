import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./clientes_beta_api.ts";
import { esDeClienta, localEc, mismoNombre, nombreDeArchivo } from "./documentos_beta.ts";
import type { Row } from "./domain.ts";

describe("Documentos PDF de la clienta", () => {
  it("lee el nombre del archivo y empareja por id, cédula o nombre", () => {
    assert.equal(nombreDeArchivo("2026-05-03 14.20 - María Paz.pdf"), "María Paz");
    assert.equal(nombreDeArchivo("Simetría - Ana Sol"), "Ana Sol");
    assert.ok(mismoNombre("2026-05-03 14.20 - Paz Maria", "maria paz"));
    assert.ok(mismoNombre("2026-05-03 14.20 - Maria Paz", "maria jose paz"));
    assert.ok(!mismoNombre("2026-05-03 14.20 - Maria", "maria paz"));
    const q = { key: "c:1711", ced: "1711", nom: "maria paz", codigo: "C-00001" };
    assert.ok(esDeClienta({ cliente_id: "c:1711" }, q));
    assert.ok(esDeClienta({ cliente_id: "01711" }, q));
    assert.ok(esDeClienta({ cliente_id: "C-00001" }, q));
    assert.ok(!esDeClienta({ cliente_id: "1722", cliente_nombre_archivo: "María Paz" }, q));
    assert.ok(!esDeClienta({ cliente_id: "", cliente_nombre_archivo: "2026-01-02 10.00 - María Paz" }, q));
    assert.equal(localEc("2026-05-03T19:20:00Z"), "2026-05-03T14:20:00");
    assert.equal(localEc("2025-06-24 21:09:00+00"), "2025-06-24T16:09:00");
  });
  it("la ficha trae el PDF y el link firmado solo sale para esa clienta", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [{ token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }]);
    db.tables.set("clientas_registro", [{ id: 1, sheet_row: 2, cedula: "1711", nombre: "María", apellido: "Paz" }, { id: 2, sheet_row: 3, cedula: "1722", nombre: "Luz", apellido: "Vera" }]);
    db.tables.set("tickets", [{ id: 1, sheet_row: 5, nombre: "María", apellido: "Paz", id_3: "1711", estimado: 50, timestamp: "2026-10-18T15:00:00Z", atendido_por: "Andrea" }]);
    db.tables.set("beta_cliente_documentos", [
      { id: "d1", cliente_id: "c:1711", cliente_nombre_archivo: "María Paz", tipo: "skin_analisis", fecha: "2026-05-03T19:20:00Z", storage_path: "skin/a.pdf", origen: "drive" },
      { id: "d3", cliente_id: null, cliente_nombre_archivo: "María Paz", tipo: "klift", fecha: "2026-05-05 19:20:00+00", storage_path: "klift/sinf/00/c.zip", match_confianza: "ambiguous", origen: "x" },
      { id: "d2", cliente_id: "c:1722", cliente_nombre_archivo: "Luz Vera", tipo: "klift", fecha: "2026-05-04T19:20:00Z", storage_path: "klift/b.pdf", origen: "drive" },
    ]);
    for (const t of ["beta_clientes", "paquetes", "gift_cards", "beta_tickets", "log_acciones"]) db.tables.set(t, []);
    const llamadas: string[] = [];
    const fetchImpl = (async (u: string) => { llamadas.push(String(u)); return new Response(JSON.stringify({ signedURL: "/object/sign/cliente-documentos/skin/a.pdf?token=x" }), { status: 200 }); }) as unknown as typeof fetch;
    const c = { db, now: new Date("2026-11-17T18:30:00Z"), env: { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" } as Record<string, string | undefined>, fetchImpl, legacyLogin: async () => ({}), token: "adm" };
    const f = await handle("cl_get", { token: "adm", key: "c:1711" }, c) as Row;
    const pdfs = (f.documentos as Row[]).filter((d) => d.tipo === "pdf");
    assert.equal(pdfs.length, 1);
    assert.equal(pdfs[0].docId, "d1");
    assert.match(String(pdfs[0].nombre), /Focus Skin/);
    assert.equal(pdfs[0].fecha, "2026-05-03");
    const u = await handle("cl_doc_url", { token: "adm", key: "c:1711", id: "d1" }, c) as Row;
    assert.equal(u.ok, true);
    assert.match(String(u.url), /^https:\/\/x\.supabase\.co\/storage\/v1\/object\/sign\/cliente-documentos\/skin\/a\.pdf/);
    assert.ok(llamadas[0].includes("/storage/v1/object/sign/cliente-documentos/skin/a.pdf"));
    const otro = await handle("cl_doc_url", { token: "adm", key: "c:1711", id: "d2" }, c) as Row;
    assert.match(String(otro.error), /no es de esta clienta/);
    // Sin asignar: el admin lo ve con sugerencia, lo asigna (queda en el log) y aparece en la ficha como zip.
    const sa = await handle("doc_sin_asignar", { token: "adm" }, c) as Row;
    assert.equal(sa.total, 1);
    const it = (sa.items as Row[])[0];
    assert.equal(it.zip, true);
    assert.equal((it.sugerencias as Row[])[0].key, "c:1711");
    const z = await handle("cl_doc_url", { token: "adm", id: "d3" }, c) as Row;
    assert.match(String(z.url), /download=/);
    const as = await handle("doc_asignar", { token: "adm", id: "d3", key: "c:1711" }, c) as Row;
    assert.equal(as.ok, true);
    assert.ok(db.tables.get("log_acciones")!.some((l) => /DOCUMENTO ASIGNAR/.test(JSON.stringify(l))));
    const f2 = await handle("cl_get", { token: "adm", key: "c:1711" }, c) as Row;
    assert.equal((f2.documentos as Row[]).filter((d) => d.docId).length, 2);
    assert.equal((f2.documentos as Row[]).some((d) => d.tipo === "zip"), true);
  });
});
