import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./clientes_beta_api.ts";
import { agruparDocumentos, agruparSinAsignar, carpetaFoto, esDeClienta, esInformePrincipal, esZipOculto, localEc, mismoNombre, nombreDeArchivo, visibleEnDocumentos } from "./documentos_beta.ts";
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


describe("Documentos agrupados por día / ticket", () => {
  it("clasifica fotos del ticket y oculta zips y stubs de análisis", () => {
    assert.equal(carpetaFoto({ nombre: "Foto antes 1" }), "antes");
    assert.equal(carpetaFoto({ nombre: "Foto después 2" }), "despues");
    assert.equal(carpetaFoto({ nombre: "Foto 1" }), "fotos");
    assert.equal(carpetaFoto({ nombre: "pre_rostro.jpg" }), "antes");
    assert.equal(carpetaFoto({ nombre: "post-perfil.jpg" }), "despues");
    assert.equal(esZipOculto({ tipo: "zip", zip: true, storage_path: "klift/a.zip" }), true);
    assert.equal(esZipOculto({ tipo: "pdf", storage_path: "klift/a.pdf" }), false);
    assert.equal(visibleEnDocumentos({ tipo: "analisis", nombre: "Análisis de piel / Facial K-Lift" }), false);
    assert.equal(esInformePrincipal({ tipo: "pdf", sub: "klift", nombre: "K-Lift · simetría" }), true);
    assert.equal(esInformePrincipal({ tipo: "pdf", sub: "skin_analisis", nombre: "Focus Skin · análisis de piel" }), true);
    assert.equal(esInformePrincipal({ tipo: "tarjeta", nombre: "Tarjeta del tratamiento" }), false);
    assert.equal(esInformePrincipal({ tipo: "zip", zip: true, sub: "klift", nombre: "K-Lift · fotos (zip)" }), false);
  });
  it("une el informe PDF y las fotos del ticket en una sola entrada; el zip no aparece", () => {
    const g = agruparDocumentos([
      { tipo: "tarjeta", nombre: "Tarjeta del tratamiento · TK-SO-1896", fecha: "2026-11-17", hora: "11:23", clave: "TK-SO-1896", sheetRow: 1889 },
      { tipo: "foto", nombre: "Foto antes 1", fecha: "2026-11-17", clave: "TK-SO-1896", url: "https://ejemplo/a" },
      { tipo: "foto", nombre: "Foto después 1", fecha: "2026-11-17", clave: "TK-SO-1896", url: "https://ejemplo/d" },
      { tipo: "foto", nombre: "Foto 1", fecha: "2026-11-17", clave: "TK-SO-1896", url: "https://ejemplo/f" },
      { tipo: "zip", zip: true, sub: "klift", nombre: "K-Lift · fotos (zip)", fecha: "2026-11-17", hora: "13:00", docId: "z1", storage_path: "klift/n.zip" },
      { tipo: "pdf", sub: "klift", nombre: "K-Lift · simetría · Nayeli", fecha: "2026-11-17", hora: "13:00", docId: "p1" },
      { tipo: "analisis", nombre: "Análisis de piel / Facial Reset 3x1 · TK-SO-1896", fecha: "2026-11-17", clave: "TK-SO-1896" },
      { tipo: "comprobante", nombre: "Comprobante de pago · TK-SO-1896", fecha: "2026-11-17", clave: "TK-SO-1896", url: "https://ejemplo/c" },
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].clave, "TK-SO-1896");
    assert.equal((g[0].informes as Row[]).length, 1);
    assert.equal((g[0].informes as Row[])[0].docId, "p1");
    assert.equal((g[0].otros as Row[]).map((d) => d.tipo).sort().join(","), "comprobante,tarjeta");
    const fo = g[0].fotos as { antes: Row[]; despues: Row[]; fotos: Row[] };
    assert.equal(fo.antes.length, 1);
    assert.equal(fo.despues.length, 1);
    assert.equal(fo.fotos.length, 1);
    assert.equal(g[0].nFotos, 3);
    assert.equal(JSON.stringify(g).includes("zip"), false);
  });
  it("dos tickets el mismo día quedan en dos entradas; el PDF sin ticket se acerca por la hora", () => {
    const g = agruparDocumentos([
      { tipo: "tarjeta", nombre: "Tarjeta A", fecha: "2026-11-17", hora: "10:00", clave: "TK-A" },
      { tipo: "tarjeta", nombre: "Tarjeta B", fecha: "2026-11-17", hora: "16:00", clave: "TK-B" },
      { tipo: "pdf", sub: "skin_analisis", nombre: "Focus Skin · análisis de piel", fecha: "2026-11-17", hora: "16:10", docId: "fs" },
    ]);
    assert.equal(g.length, 2);
    const b = g.find((x) => x.clave === "TK-B")!;
    assert.equal((b.informes as Row[])[0].docId, "fs");
    assert.equal((g.find((x) => x.clave === "TK-A")!.informes as Row[]).length, 0);
  });
  it("sin asignar agrupa el PDF del día y guarda el id del zip oculto para asignarlo junto", () => {
    const g = agruparSinAsignar([
      { tipo: "pdf", sub: "klift", nombre: "K-Lift · simetría · Ana Paz", fecha: "2026-05-05", hora: "14:20", docId: "p1", archivo: "Ana Paz", confianza: "none" },
      { tipo: "zip", zip: true, sub: "klift", nombre: "K-Lift · fotos (zip) · Ana Paz", fecha: "2026-05-05", hora: "14:20", docId: "z1", archivo: "Ana Paz", storage_path: "klift/a.zip", confianza: "none" },
      { tipo: "zip", zip: true, sub: "klift", nombre: "K-Lift · fotos (zip) · Luz Vera", fecha: "2026-05-06", hora: "10:00", docId: "z2", archivo: "Luz Vera", storage_path: "klift/b.zip", confianza: "none" },
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].archivo, "Ana Paz");
    assert.deepEqual(g[0].ids, ["p1", "z1"]);
    assert.equal((g[0].informes as Row[])[0].docId, "p1");
  });
});
