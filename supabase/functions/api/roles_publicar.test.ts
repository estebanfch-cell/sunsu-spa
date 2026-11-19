import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./roles_api.ts";
import { clavePeriodo, estaPublicado, etiquetaPeriodo, mismaPersonaRol, rolDesdeHistorial } from "./roles_api.ts";
import type { Ctx } from "./lib.ts";
import type { Row } from "./domain.ts";

function ctx(db: MemoryDb): Ctx {
  return { db, now: new Date("2026-11-18T17:00:00Z"), env: {}, fetchImpl: fetch, token: "", legacyLogin: async () => ({}) };
}

function seed() {
  const db = new MemoryDb();
  db.tables.set("app_modulos", []);
  db.tables.set("beta_rol_publicaciones", []);
  db.tables.set("rrhh_historial", [
    { mes: "Agosto", ano: 2026, empleada: "Andrea Robles", cedula: "x", total_ingresos_u: 500 },
    { mes: "Septiembre", ano: 2026, empleada: "Andrea Robles", cedula: "x", total_ingresos_u: 520 },
    { mes: "Agosto", ano: 2026, empleada: "Daniela Mora", cedula: "y", total_ingresos_u: 480 },
  ]);
  db.tables.set("rrhh_empleadas", [
    { nombre_app: "Andrea Robles", apellidos_y_nombres: "ROBLES ANDREA", cedula: "x", cargo: "COSMETOLOGA", fecha_ingreso: "2025-05-01" },
  ]);
  db.tables.set("usuarios", [
    { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
    { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
  ]);
  db.tables.set("sesiones", [
    { token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
    { token: "t-emi", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  return db;
}

describe("roles publicados", () => {
  it("clavePeriodo normaliza mes y ciclo", () => {
    assert.equal(clavePeriodo("Agosto", 2026), "AGOSTO_2026");
    assert.equal(clavePeriodo("Agosto 2026"), "AGOSTO_2026");
    assert.equal(clavePeriodo("agosto_2026"), "AGOSTO_2026");
    assert.equal(clavePeriodo("CICLO_2026-09-26"), "CICLO_2026-09-26");
    assert.equal(clavePeriodo("2026-09-26"), "CICLO_2026-09-26");
    assert.equal(etiquetaPeriodo("AGOSTO_2026"), "Agosto 2026");
  });

  it("persona=* publica a todas; una fila de persona manda", () => {
    const pubs: Row[] = [
      { periodo: "AGOSTO_2026", persona: "*", publicado: true },
      { periodo: "AGOSTO_2026", persona: "Daniela Mora", publicado: false },
    ];
    assert.equal(estaPublicado(pubs, "AGOSTO_2026", "Andrea Robles"), true);
    assert.equal(estaPublicado(pubs, "Agosto", "Daniela Mora"), false);
    assert.equal(estaPublicado([], "AGOSTO_2026", "Andrea Robles"), false);
  });

  it("staff ve su historial (aunque no esté publicado) y solo el suyo", async () => {
    const db = seed();
    const c = ctx(db);
    const lista = await handle("roles_lista", { token: "t-andrea", anio: 2026 }, c) as Row;
    const items = lista.items as Row[];
    assert.equal(items.length, 2, JSON.stringify(items));
    assert.ok(items.every((x) => x.persona === "Andrea Robles"));
    assert.ok(items.some((x) => x.periodo === "AGOSTO_2026"));
    assert.ok(items.some((x) => x.periodo === "SEPTIEMBRE_2026"));
    assert.ok(items.every((x) => x.fuente === "historial" && x.estado === "aprobado"));
    const no = await handle("rol_publicar", { token: "t-andrea", periodo: "AGOSTO_2026", publicado: true }, c) as Row;
    assert.match(String(no.error), /Solo un admin/);
  });

  it("staff no abre el historial de otra persona", async () => {
    const db = seed();
    const c = ctx(db);
    const no = await handle("getRolIndividual", { token: "t-andrea", sheet: "AGOSTO_2026", cedula: "y", persona: "Daniela Mora" }, c) as Row;
    // clampPersonal reescribe la persona a la de la sesión: no puede ver el de Daniela.
    assert.equal(no.ok, true, String(no.error || JSON.stringify(no)));
    assert.equal((no.data as Row).nombre, "Andrea Robles");
    assert.notEqual((no.data as Row).totalIngresos, 480);
    const ok = await handle("getRolIndividual", { token: "t-andrea", sheet: "AGOSTO_2026", cedula: "x", persona: "Andrea Robles" }, c) as Row;
    assert.equal(ok.ok, true, String(ok.error || ""));
    assert.equal((ok.data as Row).fuente, "historial");
    assert.equal(ok.estado, "aprobado");
    assert.equal((ok.data as Row).totalIngresos, 500);
  });

  it("mismaPersonaRol cruza el nombre de la app con el legal de la hoja", () => {
    assert.equal(mismaPersonaRol("Andrea Robles", "ROBLES POGO ANDREA DEL CISNE"), true);
    assert.equal(mismaPersonaRol("Andrea", "ROBLES POGO ANDREA DEL CISNE"), true);
    assert.equal(mismaPersonaRol("Daniela Mora", "ROBLES POGO ANDREA DEL CISNE"), false);
    const d = rolDesdeHistorial({ empleada: "Andrea Robles", cedula: "x", sueldo: 400, bono: 50, comisiones: 30, extras_m_o_q: 10, c_13_14_fr_r_s_t: 20, total_ingresos_u: 510, iess_patronal_11_15: 44, costo_empresa: 554 }, "AGOSTO_2026");
    assert.equal(d.fuente, "historial");
    assert.equal(d.totalIngresos, 510);
    assert.equal(d.comisiones, 30);
    assert.equal(d.periodo, "AGOSTO_2026");
  });

  it("admin puede publicar o ocultar un periodo completo; el historial del staff sigue visible", async () => {
    const db = seed();
    const c = ctx(db);
    await handle("rol_publicar", { token: "t-emi", periodo: "AGOSTO_2026", publicado: true, todos: true }, c);
    const all = await handle("roles_lista", { token: "t-emi", anio: 2026 }, c) as Row;
    const ago = (all.items as Row[]).filter((x) => x.periodo === "AGOSTO_2026");
    assert.equal(ago.length, 2);
    assert.ok(ago.every((x) => x.publicado === true));
    await handle("rol_publicar", { token: "t-emi", periodo: "AGOSTO_2026", publicado: false, todos: true }, c);
    const staff = await handle("roles_lista", { token: "t-andrea" }, c) as Row;
    const items = staff.items as Row[];
    assert.equal(items.length, 2);
    const agoStaff = items.find((x) => x.periodo === "AGOSTO_2026");
    assert.equal(agoStaff && agoStaff.publicado, false);
  });
});
