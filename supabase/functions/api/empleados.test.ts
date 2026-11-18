import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./roles_api.ts";
import "./empleados_api.ts";
import "./horarios_api.ts";
import "./multas_beta_api.ts";
import { descuentosVigentesEn, esFilaNotasRrhh, afiliadaSegunOverlay } from "./empleados_api.ts";
import { rolCalcular, type Row } from "./domain.ts";
import type { Ctx } from "./lib.ts";

function ctx(db: MemoryDb, now = "2026-11-18T18:00:00Z"): Ctx {
  return { db, now: new Date(now), env: {}, fetchImpl: fetch, token: "", legacyLogin: async () => ({}) };
}

function seed() {
  const db = new MemoryDb();
  db.tables.set("app_modulos", []);
  db.tables.set("beta_empleados", []);
  db.tables.set("beta_iess_descuentos", []);
  db.tables.set("beta_empleado_docs", []);
  db.tables.set("beta_rol_publicaciones", []);
  db.tables.set("beta_multas", []);
  db.tables.set("rrhh_empleadas", [
    { nombre_app: "Andrea Robles", apellidos_y_nombres: "ROBLES ANDREA", cargo: "COSMETOLOGA", fecha_ingreso: "2025-05-01", sueldo_base: 800, bono_fijo: 0, nombre_jibble: "Andrea", cedula: "x" },
    { nombre_app: "Daniela Mora", apellidos_y_nombres: "MORA DANIELA", cargo: "COSMETOLOGA", fecha_ingreso: "2025-06-01", sueldo_base: 800, nombre_jibble: "Daniela", cedula: "y" },
    { nombre_app: "", apellidos_y_nombres: "", nombre_jibble: "ℹ️ Solo modificar esta hoja en el sistema central", cargo: "" },
  ]);
  db.tables.set("rrhh_historial", [
    { mes: "Octubre", ano: 2026, empleada: "Andrea Robles", total_ingresos_u: 900, comisiones: 200 },
    { mes: "Octubre", ano: 2026, empleada: "Daniela Mora", total_ingresos_u: 880, comisiones: 230 },
  ]);
  db.tables.set("usuarios", [
    { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false, activo: true },
    { id: "daniela", nombre: "Daniela Mora", short: "Daniela", rol: "cosmetologa", bloqueado: false, activo: true },
    { id: "emi", nombre: "Emi", short: "Emi", rol: "super_admin", bloqueado: false, activo: true },
  ]);
  db.tables.set("app_usuarios", [
    { id: "andrea", nombre: "Andrea Robles", rol: "cosmetologa", activo: true },
    { id: "daniela", nombre: "Daniela Mora", rol: "cosmetologa", activo: true },
    { id: "emi", nombre: "Emi", rol: "super_admin", activo: true },
  ]);
  db.tables.set("sesiones", [
    { token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
    { token: "t-emi", uid: "emi", rol: "super_admin", exp: "2099-01-01T00:00:00.000Z" },
    { token: "t-prueba", uid: "emi", rol: "super_admin", exp: "2099-01-01T00:00:00.000Z", modo_prueba: true },
  ]);
  db.tables.set("tickets", []);
  db.tables.set("catalogo", []);
  db.tables.set("cosmetologas", []);
  db.tables.set("multas_descuentos", []);
  db.tables.set("erp_proveedores", []);
  db.tables.set("erp_oc", []);
  db.tables.set("erp_oc_lineas", []);
  db.tables.set("horarios", []);
  db.tables.set("horario_dias", []);
  db.tables.set("horario_asignaciones", []);
  db.tables.set("app_archivos", []);
  db.tables.set("pago_config", []);
  return db;
}

describe("TK73 empleados e IESS", () => {
  it("el front tiene Personal › Empleados, horario compacto sin lápiz y Descuentos IESS", () => {
    const js = readFileSync(new URL("../../../mc-empleados.js", import.meta.url), "utf8");
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    const nav = readFileSync(new URL("../../../mc-nav.js", import.meta.url), "utf8");
    assert.match(js, /#\/m\/personal\/empleados/);
    assert.match(js, /¿Afiliada al IESS\?/);
    assert.match(js, /¿Tiene usuario\?/);
    assert.match(js, /Descuentos IESS/);
    assert.match(js, /Orden de compra de servicios/);
    assert.match(js, /Los horarios se guardan al cambiar el dato, sin lápiz/);
    assert.doesNotMatch(js, /✏️|ix-pencil|data-edit="pencil"/);
    assert.match(nav, /#\/m\/personal\/empleados/);
    assert.match(beta, /mc-empleados\.js\?v=20261118tk84/);
    const sw = readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
    assert.match(sw, /sunsu-beta-2026-11-18-TK84/);
  });

  it("omite la fila de notas de RRHH y no deja ver el módulo al personal", async () => {
    assert.equal(esFilaNotasRrhh({ nombre_app: "", nombre_jibble: "ℹ️ Solo modificar esta hoja en el sistema central" }), true);
    assert.equal(esFilaNotasRrhh({ nombre_app: "Andrea Robles", nombre_jibble: "Andrea" }), false);
    const db = seed();
    const c = ctx(db);
    const no = await handle("emp_list", { token: "t-andrea" }, c) as Row;
    assert.match(String(no.error), /Solo administración/);
    const ok = await handle("emp_list", { token: "t-emi" }, c) as Row;
    assert.equal(ok.ok, true, String(ok.error || ""));
    const items = ok.items as Row[];
    assert.ok(items.some((x) => x.nombre === "Andrea Robles"));
    assert.ok(items.some((x) => x.nombre === "Daniela Mora"));
    assert.ok(!items.some((x) => /solo modificar/i.test(String(x.nombre || "")) || /ℹ️/.test(String(x.nombre || ""))));
    const personas = await handle("personal_personas", { token: "t-emi" }, c) as Row;
    const names = ((personas.personas as Row[]) || []).map((p) => String(p.nombre));
    assert.ok(!names.some((n) => /solo modificar/i.test(n) || /ℹ️/.test(n)));
  });

  it("admin vincula usuario y marca afiliación; Ver como no escribe; modo prueba deja origin=test", async () => {
    const db = seed();
    const c = ctx(db);
    const g = await handle("emp_guardar", { token: "t-emi", nombre: "Andrea Robles", afiliada_iess: true, tiene_usuario: true, usuario_id: "andrea" }, c) as Row;
    assert.equal(g.ok, true, String(g.error || ""));
    const ov = (db.tables.get("beta_empleados") || []).find((r) => r.nombre_app === "Andrea Robles")!;
    assert.equal(ov.afiliada_iess, true);
    assert.equal(ov.usuario_id, "andrea");
    assert.equal(ov.origin, "beta");

    const vista = await handle("emp_guardar", { token: "t-emi", preview: true, preview_uid: "andrea", nombre: "Andrea Robles", afiliada_iess: false }, c) as Row;
    assert.ok(vista.error, "Ver como no debe guardar la ficha");
    const after = (db.tables.get("beta_empleados") || []).find((r) => r.nombre_app === "Andrea Robles")!;
    assert.equal(after.afiliada_iess, true);

    const pr = await handle("emp_guardar", { token: "t-prueba", nombre: "Daniela Mora", afiliada_iess: false }, c) as Row;
    assert.equal(pr.ok, true, String(pr.error || ""));
    const d = (db.tables.get("beta_empleados") || []).find((r) => r.nombre_app === "Daniela Mora")!;
    assert.equal(d.origin, "test");
    assert.equal(d.afiliada_iess, false);

    const doc = await handle("emp_doc_subir", { token: "t-prueba", nombre: "Daniela Mora", archivo: "data:text/plain;base64,Zg==", filename: "x.txt" }, c) as Row;
    assert.match(String(doc.error), /Modo prueba/);
    assert.equal((db.tables.get("beta_empleado_docs") || []).length, 0);
  });

  it("descuentos IESS vigentes alimentan el rol (hip, quir y otros)", async () => {
    const v = descuentosVigentesEn([
      { tipo: "quirografario", monto: 40, activo: true, vigente_desde: "2026-01-01", vigente_hasta: "2026-12-31" },
      { tipo: "hipotecario", monto: 25, activo: true, vigente_desde: "2026-10-01" },
      { tipo: "otro", monto: 10, descripcion: "Sándalo", activo: true },
      { tipo: "quirografario", monto: 99, activo: true, vigente_hasta: "2026-09-30" },
      { tipo: "hipotecario", monto: 50, activo: false },
    ], "2026-10-25");
    assert.equal(v.quir, 40);
    assert.equal(v.hip, 25);
    assert.equal(v.otros, 10);
    const base = { sueldo: 800, bono: 0, fondoReserva: false, fechaIngreso: "2025-05-01", anio: 2026, mes: 10, comFaciales: 0, comExtras: 0, comRecepcion: 0, comProductos: 0, comPaquetes: 0, multas: 0 };
    const sin = rolCalcular(base);
    const con = rolCalcular({ ...base, quir: 40, hip: 25, sandalo: 10 });
    assert.equal(con.egresos, Math.round((sin.egresos + 75) * 100) / 100);
    assert.ok(con.totalRecibir < sin.totalRecibir);

    const db = seed();
    const c = ctx(db);
    await handle("emp_guardar", { token: "t-emi", nombre: "Andrea Robles", afiliada_iess: true }, c);
    await handle("emp_iess_guardar", { token: "t-emi", nombre: "Andrea Robles", tipo: "quirografario", monto: 40, vigente_desde: "2026-01-01" }, c);
    await handle("emp_iess_guardar", { token: "t-emi", nombre: "Andrea Robles", tipo: "hipotecario", monto: 25, vigente_desde: "2026-10-01" }, c);
    await handle("emp_iess_guardar", { token: "t-emi", nombre: "Andrea Robles", tipo: "otro", monto: 10, descripcion: "Retención" }, c);
    const rol = await handle("getRolIndividual", { token: "t-emi", sheet: "OCTUBRE_2026", cedula: "x", persona: "Andrea Robles" }, c) as Row;
    // La empleada de prueba no tiene cédula real; getRolIndividual busca por cédula. Reintentamos si hace falta vía ciclo.
    if (rol.error && /no encontrado/i.test(String(rol.error))) {
      const ciclo = await handle("getRolCiclo", { token: "t-emi", persona: "Andrea Robles", ciclo: "2026-09-26" }, c) as Row;
      assert.equal(!ciclo.error, true, String(ciclo.error || ""));
      const desc = (ciclo.descuentos as Row[]) || [];
      assert.ok(desc.some((d) => d.concepto === "Préstamo quirografario" && Number(d.monto) === 40));
      assert.ok(desc.some((d) => d.concepto === "Préstamo hipotecario" && Number(d.monto) === 25));
      assert.ok(desc.some((d) => d.concepto === "Otros descuentos IESS" && Number(d.monto) === 10));
    } else {
      const data = (rol.data || rol) as Row;
      assert.equal(data.prestQuir, 40, JSON.stringify({ err: rol.error, prestQuir: data.prestQuir }));
      assert.equal(data.prestHip, 25);
      assert.equal(data.prestOtro, 10);
    }
  });

  it("si no está afiliada no hay rol: se genera OC de servicios por comisiones menos multas", async () => {
    const db = seed();
    db.tables.set("multas_descuentos", [
      { cosmetologa: "Daniela Mora", fecha: "2026-10-10", monto: 30, tipo: "multa", motivo: "atraso" },
    ]);
    const c = ctx(db);
    await handle("emp_guardar", { token: "t-emi", nombre: "Daniela Mora", afiliada_iess: false }, c);
    const overlays = db.tables.get("beta_empleados") || [];
    assert.equal(afiliadaSegunOverlay(overlays, "Daniela Mora"), false);

    const lista = await handle("roles_lista", { token: "t-emi", anio: 2026 }, c) as Row;
    const items = (lista.items as Row[]) || [];
    assert.ok(!items.some((x) => x.persona === "Daniela Mora"));

    const rol = await handle("getRolCiclo", { token: "t-emi", persona: "Daniela Mora", ciclo: "2026-09-26" }, c) as Row;
    assert.match(String(rol.error), /no está afiliada al IESS/);
    assert.equal(rol.ocServicios, true);

    const oc = await handle("emp_oc_servicios", { token: "t-emi", nombre: "Daniela Mora", periodo: "2026-10" }, c) as Row;
    assert.equal(oc.ok, true, String(oc.error || JSON.stringify(oc)));
    assert.equal(oc.comisiones, 230);
    assert.equal(oc.multas, 30);
    assert.equal(oc.total, 200);
    assert.equal(oc.subtotal, Math.round((200 / 1.15) * 100) / 100);
    assert.equal(Number(oc.iva), Math.round((200 - Number(oc.subtotal)) * 100) / 100);
    assert.match(String(oc.numero), /^OC-2026-\d{4}$/);
    assert.match(String(oc.nota), /factura/);
    const row = (db.tables.get("erp_oc") || []).find((r) => r.id === oc.id)!;
    assert.equal(row.total, 200);
    assert.equal((row.snap as Row).tipo, "servicios_empleado");
    assert.equal((row.snap as Row).conIva, true);
    const lin = (db.tables.get("erp_oc_lineas") || []).find((r) => r.oc_id === oc.id)!;
    assert.equal(lin.producto_id, null);
    assert.equal(lin.precio, oc.subtotal);
    const staff = await handle("emp_oc_servicios", { token: "t-andrea", nombre: "Daniela Mora", periodo: "2026-10" }, c) as Row;
    assert.match(String(staff.error), /Solo administración/);
  });
});
