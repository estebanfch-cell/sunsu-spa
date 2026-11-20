import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./erp_api.ts";
import "./inline_api.ts";
import "./ventas_api.ts";
import "./tickets_beta_api.ts";
import "./clientes_beta_api.ts";
import "./aprobaciones_api.ts";
import "./agenda_api.ts";
import { CAMPOS_CON_SOLICITUD, CAMPOS_DIRECTOS_STAFF } from "./clientes_beta_api.ts";
import { siNo } from "./consent_override.ts";
import type { Row } from "./domain.ts";

const root = new URL("../../../", import.meta.url);
const IMG = "data:image/jpeg;base64," + "A".repeat(200);

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "rec", uid: "u-ale", rol: "recepcion", name: "Alejandra", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Ana Pérez", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "u-ale", nombre: "Alejandra", short: "Alejandra", rol: "recepcion", bloqueado: false },
    { id: "u-ana", nombre: "Ana Pérez", short: "Ana", rol: "cosmetologa", bloqueado: false },
  ]);
  db.tables.set("clientas_registro", [
    { id: 1, sheet_row: 5, timestamp: "2025-01-10T15:00:00Z", cedula: "1700000001", nombre: "María", apellido: "Banda", tipo_de_piel: "Mixta", alergias: "", autoriza_fotos: "NO", telefono: "0991111111" },
  ]);
  db.tables.set("tickets", [
    { id: 1, sheet_row: 10, so_num: "TK-SO-1", timestamp: "2026-11-01T15:00:00Z", atendido_por: "Ana Pérez", nombre: "María", apellido: "Banda", id_3: "1700000001", facial_hecho: "SUNSU-57 Facial K-Lift", estimado: 95, fotos_antes: "https://x/a.jpg" },
  ]);
  for (const t of ["catalogo", "erp_productos", "beta_clientes", "beta_tickets", "beta_ticket_lineas", "solicitudes_cambio", "app_modulos", "cosmetologas", "gift_cards", "paquetes", "app_archivos", "notificaciones"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-20T16:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}

describe("TK183 ficha: personal edita lo no sensible; contacto y autorizaciones por solicitud", () => {
  it("listas de campos", () => {
    for (const k of ["telefono", "email", "cedula", "sector", "nombres", "apellido", "autorizaFotos", "consentimiento"]) assert.ok(CAMPOS_CON_SOLICITUD.has(k), k);
    for (const k of ["alergias", "medicacion", "nacimiento", "notas", "preferencias", "tipoPiel"]) assert.ok(CAMPOS_DIRECTOS_STAFF.includes(k), k);
    assert.equal(CAMPOS_DIRECTOS_STAFF.includes("autorizaFotos"), false);
    assert.equal(siNo("Sí, autorizo"), "SI"); assert.equal(siNo("no autorizo"), "NO"); assert.equal(siNo("tal vez"), "");
  });
  it("recepción guarda alergias directo con bitácora; el backend rechaza teléfono, cédula y Autoriza fotos directo", async () => {
    const { h } = semilla();
    const ok = await h("cl_guardar", "rec", { key: "c:1700000001", cambios: { alergias: "Látex" } });
    assert.equal(ok.ok, true, String(ok.error));
    for (const k of ["telefono", "cedula", "email", "sector", "autorizaFotos", "nombres"]) {
      const r = await h("cl_guardar", "rec", { key: "c:1700000001", cambios: { [k]: k === "autorizaFotos" ? "SI" : "1700000099" } });
      assert.match(String(r.error), /necesita solicitud/, k);
    }
    const mixto = await h("cl_guardar", "cos", { key: "c:1700000001", cambios: { alergias: "x", telefono: "0990000000" } });
    assert.match(String(mixto.error), /Teléfono/);
    const f = await h("cl_get", "adm", { key: "c:1700000001" });
    assert.equal((f.datos as Row).alergias, "Látex");
    const bit = (f.bitacora as Row[]).at(-1)!;
    assert.equal(bit.por, "Alejandra");
    assert.deepEqual(bit.cambios, { alergias: { antes: "", despues: "Látex" } });
    const fr = await h("cl_get", "rec", { key: "c:1700000001" });
    assert.ok((fr.conSolicitud as string[]).includes("autorizaFotos"));
    assert.ok((fr.directos as string[]).includes("alergias"));
  });
  it("Autoriza fotos: solicitud con motivo obligatorio, Emilia ve campo antes → después, quién y por qué; al aprobar los avisos dejan de decir NO", async () => {
    const { h } = semilla();
    assert.match(String((await h("solicitud_crear", "rec", { tabla: "cliente_beta", fila: "c:1700000001", tipo: "cambio", motivo: "", propuestos: { autorizaFotos: "SI" } })).error), /motivo es obligatorio/);
    const antes = await h("getAutorizaFotos", "rec");
    assert.equal((antes.noAutoriza as Row)["1700000001"], true);
    const s1 = await h("solicitud_crear", "rec", { tabla: "cliente_beta", fila: "c:1700000001", tipo: "cambio", motivo: "La clienta ahora sí autoriza", propuestos: { autorizaFotos: "si" } });
    assert.equal(s1.ok, true, String(s1.error));
    const apr = await h("aprobaciones_pendientes", "adm");
    const it0 = ((apr.grupos as Row[]).find((g) => g.id === "solicitudes")!.items as Row[])[0];
    assert.match(String(it0.titulo), /^Alejandra pide cambiar la ficha/);
    assert.match(String(it0.detalle), /María Banda · Autoriza fotos: NO → SI · Motivo: La clienta ahora sí autoriza/);
    assert.deepEqual(it0.cambios, [{ etiqueta: "Autoriza fotos", antes: "NO", despues: "SI" }]);
    assert.equal(it0.motivo, "La clienta ahora sí autoriza");
    assert.equal((await h("solicitud_resolver", "adm", { id: s1.id, aprobar: true })).ok, true);
    const f = await h("cl_get", "adm", { key: "c:1700000001" });
    assert.equal((f.datos as Row).autorizaFotos, "SI");
    const desp = await h("getAutorizaFotos", "rec");
    assert.equal((desp.noAutoriza as Row)["1700000001"], undefined);
    const fichas = await h("getFichasRegistro", "rec");
    assert.equal(((fichas.porCedula as Row)["1700000001"] as Row).autorizaFotos, "SI");
    const det = await h("cliente_detalle", "adm", { key: "c:1700000001" });
    assert.equal((det.cliente as Row).autorizaFotos, "SI");
  });
  it("Agregar fotos Antes / Después a un ticket ya hecho; salen en la ficha → Documentos con la fecha del ticket", async () => {
    const { h, db } = semilla();
    const r = await h("tk_agregar_fotos", "rec", { clave: "TK-SO-1", momento: "despues", imagenes: [IMG] });
    assert.equal(r.ok, true, String(r.error));
    assert.match(String(db.tables.get("tickets")![0].fotos_despues), /^archivo:/);
    assert.equal(db.tables.get("tickets")![0].fotos_antes, "https://x/a.jpg");
    const r2 = await h("tk_agregar_fotos", "rec", { clave: "TK-SO-1", momento: "antes", imagenes: [IMG] });
    assert.equal(r2.total, 2);
    assert.match(String((await h("tk_agregar_fotos", "rec", { clave: "TK-SO-1", momento: "x", imagen: IMG })).error), /Antes o Después/);
    assert.match(String((await h("tk_agregar_fotos", "rec", { clave: "TK-SO-1", momento: "antes", imagen: "hola" })).error), /Sube una foto/);
    const f = await h("cl_get", "rec", { key: "c:1700000001" });
    const fotos = (f.documentos as Row[]).filter((d) => d.tipo === "foto");
    assert.equal(fotos.length, 3);
    assert.ok(fotos.every((d) => d.fecha === "2026-11-01"));
  });
  it("UI: 🔒 en campos con solicitud, motivo obligatorio, Autoriza fotos SI/NO, botón Agregar fotos y tabla en Aprobaciones", () => {
    const cl = readFileSync(new URL("mc-clientes.js", root), "utf8");
    const tk = readFileSync(new URL("mc-tickets.js", root), "utf8");
    const html = readFileSync(new URL("index.html", root), "utf8");
    assert.match(cl, /Motivo de la solicitud \(obligatorio\)/);
    assert.match(cl, /mccl-lock/);
    assert.match(cl, /<option value="SI"/);
    assert.match(tk, /Agregar fotos Antes/);
    assert.match(tk, /tk_agregar_fotos/);
    assert.doesNotMatch(tk.slice(tk.indexOf("mctk-addfotos"), tk.indexOf("mctk-addfotos") + 600), /capture=/);
    assert.match(html, /apr-camb/);
  });
});
