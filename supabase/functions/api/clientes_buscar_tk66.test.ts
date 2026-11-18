// TK66 (Emilia 18/11): el buscador de clientas del ticket encuentra por cédula, RUC, celular, nombre y código.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./clientes_beta_api.ts";
import "./clientes_dup_api.ts";
import { nucleoCedula } from "./clientes_beta_api.ts";
import type { Row } from "./domain.ts";

function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Ana", exp: "2099-01-01T00:00:00.000Z" },
    { token: "rec", uid: "u-ale", rol: "recepcion", name: "Ale", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [{ id: "admin", rol: "admin" }, { id: "u-ana", rol: "cosmetologa" }, { id: "u-ale", rol: "recepcion" }]);
  db.tables.set("beta_clientes", [
    { key: "c:1700000017001", codigo: "C-00296", nombre: "Esteban Ferlito", cedula: "1700000017001", telefono: "593991112233", datos: {} },
    { key: "c:1700000025", codigo: "C-00260", nombre: "Emilia Gallegos", cedula: "1700000025.0", telefono: "0987776655", datos: {} },
    { key: "c:912345678", codigo: "C-00511", nombre: "María José Núñez", cedula: "912345678", telefono: "", datos: {} },
    { key: "c:1799999999", codigo: "C-00999", nombre: "Otra Persona", cedula: "1799999999", telefono: "", datos: { nombres: "Otra", apellido: "Persona" } },
  ]);
  for (const t of ["beta_cliente_alias", "app_modulos", "permisos", "log_acciones"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-18T18:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (tok: string, q: string) => handle("cl_buscar", { token: tok, q }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}
const primero = async (h: (t: string, q: string) => Promise<Row>, tok: string, q: string) => s0(((await h(tok, q)).items as Row[] || [])[0]);
const s0 = (r: Row | undefined) => (r ? String(r.codigo) : "—");

describe("TK66 · buscador de clientas del ticket", () => {
  it("núcleo de cédula: RUC, .0, ceros y guiones dan lo mismo", () => {
    for (const v of ["1700000017", "1700000017001", "1700000017.0", "17000000-17", "1700000017001.0"]) assert.equal(nucleoCedula(v), "1700000017");
    assert.equal(nucleoCedula("0912345678"), nucleoCedula("912345678"));
  });
  for (const tok of ["adm", "rec", "cos"]) it(`encuentra en todos los formatos (${tok})`, async () => {
    const { h } = semilla();
    const casos: [string, string][] = [
      ["1700000017", "C-00296"], ["1700000017001", "C-00296"], ["1700000017.0", "C-00296"], ["170000001-7", "C-00296"],
      ["1700000025", "C-00260"], ["1700000025001", "C-00260"], ["1700000025.0", "C-00260"],
      ["0912345678", "C-00511"], ["0912345678001", "C-00511"], ["912345678", "C-00511"],
      ["esteban ferlito chiriboga", "C-00296"], ["FERLITO esteban", "C-00296"], ["est fer", "C-00296"],
      ["maria jose nunez", "C-00511"], ["Núñez", "C-00511"], ["C-00260", "C-00260"], ["c260", "C-00260"],
    ];
    if (tok === "adm") { assert.equal(await primero(h, tok, "0991112233"), "C-00296"); assert.equal(await primero(h, tok, "+593 99 111 2233"), "C-00296"); }
    for (const [q, cod] of casos) assert.equal(await primero(h, tok, q), cod, q);
    assert.equal(((await h(tok, "zzzz qqqq")).items as Row[]).length, 0);
  });
  it("el ticket muestra el error en vez de «Sin resultados» y en «Ver como» se puede buscar", () => {
    const root = join(import.meta.dirname, "../../..");
    assert.match(readFileSync(join(root, "beta-screens.js"), "utf8"), /if\(r&&r\.error\)\{box\.innerHTML/);
    assert.match(readFileSync(join(root, "beta.html"), "utf8"), /"cl_buscar"/);
  });
});
