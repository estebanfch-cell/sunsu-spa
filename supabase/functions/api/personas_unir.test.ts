import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./personal_api.ts";
import "./empleados_api.ts";
import { mismaPersonaNombre, nombreMostrar, preferirNombreCorto, unirPersonas, personasUnicas } from "./personas_unir.ts";
import type { Ctx } from "./lib.ts";

function ctx(db: MemoryDb): Ctx {
  return { db, now: new Date("2026-11-18T19:50:00Z"), env: {}, fetchImpl: fetch, token: "", legacyLogin: async () => ({}) };
}

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(join(root, "beta.html"), "utf8");

describe("TK87 personas únicas y Evelyn Toapanta", () => {
  it("Usuarios edita la ficha en línea y reusa los interruptores de permisos", () => {
    assert.match(html, /id="usr-page"/);
    assert.match(html, /class="usr-priv"/);
    assert.match(html, /cfg_priv_get/);
    assert.match(html, /Evelyn Toapanta/);
    assert.match(html, /#usr-page \.ix-lines \{ display: flex; flex-wrap: wrap/);
  });

  it("une Andrea con Andrea Robles y deja Emi y EFCH aparte", () => {
    const u = unirPersonas([
      { nombre: "Daniela", fuente: "rrhh" },
      { nombre: "Andrea", fuente: "rrhh" },
      { nombre: "Alejandra", fuente: "rrhh" },
      { nombre: "EFCH", uid: "efch", rol: "super_admin", fuente: "usuario" },
      { nombre: "Emi", uid: "emi", rol: "admin", fuente: "usuario" },
      { nombre: "Andrea Robles", uid: "andrea", fuente: "usuario" },
      { nombre: "Daniela Mora", uid: "daniela", fuente: "usuario" },
      { nombre: "Alejandra Rodriguez", uid: "alejandra", fuente: "usuario" },
    ]);
    const names = u.map((p) => p.nombre);
    assert.deepEqual(names, ["Alejandra Rodriguez", "Andrea Robles", "Daniela Mora", "EFCH", "Emi"]);
    assert.equal(names.filter((n) => /^Andrea$/.test(n)).length, 0);
  });

  it("muestra Evelyn Toapanta y no el nombre legal largo", () => {
    assert.equal(nombreMostrar("Evelyn Anabel Toapanta Quishpe"), "Evelyn Toapanta");
    assert.equal(preferirNombreCorto(["Evelyn Anabel Toapanta Quishpe"]), "Evelyn Toapanta");
    assert.equal(mismaPersonaNombre("Evelyn Toapanta", "Evelyn Anabel Toapanta Quishpe"), true);
    assert.equal(mismaPersonaNombre("Andrea Robles", "Andrea Perez"), false);
  });

  it("personal_personas no duplica y aplica el alias", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [{ token: "t-emi", uid: "emi", rol: "super_admin", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "super_admin", bloqueado: false },
      { id: "efch", nombre: "EFCH", short: "EFCH", rol: "super_admin", bloqueado: false },
      { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      { id: "daniela", nombre: "Daniela Mora", short: "Daniela", rol: "cosmetologa", bloqueado: false },
      { id: "alejandra", nombre: "Alejandra Rodriguez", short: "Alejandra", rol: "recepcion", bloqueado: false },
    ]);
    db.tables.set("rrhh_empleadas", [
      { nombre_app: "Andrea", nombre_jibble: "Andrea Robles", apellidos_y_nombres: "ROBLES POGO ANDREA DEL CISNE", cargo: "COSMETOLOGA" },
      { nombre_app: "Daniela", nombre_jibble: "Daniela Mora", apellidos_y_nombres: "MORA PUETATE DANIELA CONSUELO", cargo: "COSMETOLOGA" },
      { nombre_app: "Alejandra", nombre_jibble: "Alejandra Rodriguez", apellidos_y_nombres: "RODRIGUEZ ALEJANDRA", cargo: "RECEPCION" },
      { nombre_app: "", nombre_jibble: "ℹ️ Solo modificar esta hoja en el sistema central", cargo: "" },
    ]);
    db.tables.set("cosmetologas", [
      { id: "evelyn", nombre: "Evelyn Anabel Toapanta Quishpe", patron: "evelyn%", es_cosmetologa: true, activa: true, comision_faciales: false },
      { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true },
    ]);
    db.tables.set("personal_bajas", []);
    const c = ctx(db);
    const r = await handle("personal_personas", { token: "t-emi" }, c) as { personas?: { nombre: string }[] };
    const names = (r.personas || []).map((p) => p.nombre);
    assert.equal(names.filter((n) => n === "Andrea" || n === "Andrea Robles").length, 1);
    assert.ok(names.includes("Andrea Robles"));
    assert.ok(names.includes("Evelyn Toapanta"));
    assert.ok(!names.includes("Evelyn Anabel Toapanta Quishpe"));
    assert.ok(names.includes("Emi"));
    assert.ok(names.includes("EFCH"));
    const live = await personasUnicas(c, { incluirAdmin: true });
    assert.equal(live.filter((p) => p.nombre.startsWith("Andrea")).length, 1);
  });
});
