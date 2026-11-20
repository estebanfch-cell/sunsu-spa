import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./roles_api.ts";
import "./roles_crear_api.ts";
import "./empleados_api.ts";
import "./jibble_importar.ts";
import { floorCent, n, rolCalcularOficial, type Row } from "./domain.ts";
import { clasificarHorasRol, horarioRrhhDe } from "./horas_rol.ts";
import { credencialesJibble } from "./jibble_importar.ts";
import type { Ctx } from "./lib.ts";

function ctx(db: MemoryDb, now = "2026-11-18T19:00:00Z"): Ctx {
  return { db, now: new Date(now), env: {}, fetchImpl: fetch, token: "", legacyLogin: async () => ({}) };
}

function seed() {
  const db = new MemoryDb();
  for (const t of [
    "app_modulos", "beta_empleados", "beta_iess_descuentos", "beta_empleado_docs", "beta_rol_publicaciones",
    "beta_roles", "beta_roles_log", "beta_multas", "log_acciones", "pago_config", "tickets", "catalogo",
    "cosmetologas", "multas_descuentos", "horarios", "horario_dias", "horario_asignaciones",
    "asistencia_marcajes", "asistencia_feriados", "jibble_historial", "permisos", "app_kv",
  ]) db.tables.set(t, []);
  db.tables.set("rrhh_empleadas", [
    { nombre_app: "Andrea Robles", apellidos_y_nombres: "ROBLES ANDREA", cargo: "COSMETOLOGA", fecha_ingreso: "2025-05-01", sueldo_base: 482, bono_fijo: 130, fondo_reserva: "SI", nombre_jibble: "Andrea", cedula: "1711" },
    { nombre_app: "Daniela Mora", apellidos_y_nombres: "MORA DANIELA", cargo: "COSMETOLOGA", fecha_ingreso: "2025-06-01", sueldo_base: 482, bono_fijo: 130, fondo_reserva: "SI", nombre_jibble: "Daniela", cedula: "1712" },
  ]);
  db.tables.set("rrhh_historial", []);
  db.tables.set("usuarios", [
    { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false, activo: true },
    { id: "emi", nombre: "Emi", short: "Emi", rol: "super_admin", bloqueado: false, activo: true },
  ]);
  db.tables.set("app_usuarios", [
    { id: "andrea", nombre: "Andrea Robles", rol: "cosmetologa", activo: true },
    { id: "emi", nombre: "Emi", rol: "super_admin", activo: true },
  ]);
  db.tables.set("sesiones", [
    { token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
    { token: "t-emi", uid: "emi", rol: "super_admin", exp: "2099-01-01T00:00:00.000Z" },
    { token: "t-prueba", uid: "emi", rol: "super_admin", exp: "2099-01-01T00:00:00.000Z", modo_prueba: true },
  ]);
  // Feriados nacionales 2 y 3 de noviembre 2026 (como en el rol RRHH y en la beta)
  db.tables.set("asistencia_feriados", [
    { fecha: "2026-11-02", nombre: "Día de los Difuntos" },
    { fecha: "2026-11-03", nombre: "Independencia de Cuenca" },
  ]);
  return db;
}

describe("TK88 rol oficial", () => {
  it("el ejemplo RRHH de $482+$130 con fondo coincide a dos decimales", () => {
    const r = rolCalcularOficial({
      sueldoBase: 482, bono: 130, faltas: 0, fondoReserva: true, fechaIngreso: "2024-01-01", anio: 2026, mes: 11,
      comFaciales: 0, comExtras: 0, comRecepcion: 0, comProductos: 0, comPaquetes: 0,
    });
    assert.equal(r.ingresoAportable, 612);
    assert.equal(r.dec13, 51);
    assert.equal(Math.round(r.dec14 * 100) / 100, 40.17);
    assert.equal(Math.round(r.fondoReserva * 100) / 100, 50.98);
    // U = A + 13° + 14° + fondo = 612 + 51 + 40.1666… + 50.9796 = 754.1462… (el .md ilustrativo escribió 854 por un typo de $100)
    assert.equal(Math.round(r.totalIngresos * 100) / 100, 754.15);
    assert.equal(Math.round(r.iess * 100) / 100, 57.83);
    assert.equal(Math.round(r.totalRecibir * 100) / 100, 696.31);
    assert.equal(r.iessPatronal, 68.24);
    assert.equal(r.secap, 3.06);
    assert.equal(r.iece, 3.06);
    assert.equal(r.aportePatronal, 74.36);
  });

  it("una falta usa divisor 30 y las extras se recortan con FLOOR", () => {
    const sueldo = rolCalcularOficial({
      sueldoBase: 482, bono: 0, faltas: 1, fondoReserva: false,
      comFaciales: 0, comExtras: 0, comRecepcion: 0, comProductos: 0, comPaquetes: 0,
    });
    assert.equal(sueldo.sueldo, 465.93);
    assert.equal(floorCent(1.25 * 482 / 240 * 1.5), 3.76);
    const extra = rolCalcularOficial({
      sueldoBase: 482, bono: 0, faltas: 0, hrsSupl: 1.25, fondoReserva: false,
      comFaciales: 0, comExtras: 0, comRecepcion: 0, comProductos: 0, comPaquetes: 0,
    });
    assert.equal(extra.valSupl, 3.76);
  });

  it("si el rol se arma el 26, los días hábiles hasta el 30 se asumen y no son falta", () => {
    // Andrea: lun-vie. Nov 2026: 26 jue, 27 vie, 28 sáb descanso, 29 dom descanso, 30 lun.
    const h = clasificarHorasRol({
      anio: 2026, mes: 11, hoy: "2026-11-26",
      horario: horarioRrhhDe("Andrea Robles"),
      feriados: ["2026-11-02", "2026-11-03"],
      dias: {
        "2026-11-24": { fecha: "2026-11-24", nomMin: 480, suplMin: 0, festMin: 0, descMin: 0, fuente: "jibble" },
        "2026-11-25": { fecha: "2026-11-25", nomMin: 480, suplMin: 0, festMin: 0, descMin: 0, fuente: "jibble" },
      },
    });
    assert.equal(h.diasAsumidos, 3); // 26, 27, 30
    assert.ok(!h.fechasFalta.includes("26/11") && !h.fechasFalta.includes("27/11") && !h.fechasFalta.includes("30/11"));
    // El 24 y 25 tienen marcas. Los hábiles pasados sin marca (2 y 3 son feriados; 1 dom, 21-22 fin de semana…)
    assert.ok(h.diasFalta >= 1); // p.ej. 23 lun si no hay marca (23 es lunes? Nov 23 2026 is Monday)
    assert.match(h.regla, /asumen/);
  });

  it("sin claves el importador queda pendiente y no bloquea", () => {
    assert.equal(credencialesJibble({}), null);
    assert.ok(credencialesJibble({ JIBBLE_CLIENT_ID_NEW: "x", JIBBLE_CLIENT_SECRET_NEW: "y" }));
  });

  it("el admin crea el rol, lo ve completo y el personal no lo ve hasta aprobarlo", async () => {
    const db = seed();
    const c = ctx(db, "2026-11-18T19:00:00Z");
    const no = await handle("rol_crear", { token: "t-andrea", persona: "Andrea Robles", periodo: "NOVIEMBRE_2026" }, c) as Row;
    assert.match(String(no.error), /Solo administración/);

    const creado = await handle("rol_crear", { token: "t-emi", persona: "Andrea Robles", periodo: "NOVIEMBRE_2026" }, c) as Row;
    assert.equal(creado.ok, true, String(creado.error || ""));
    assert.equal(creado.estado, "borrador");
    const data = creado.data as Row;
    assert.equal(data.sueldoBase, 482);
    assert.equal(data.bono, 130);
    assert.ok(data.aportesPatronal);
    assert.equal((data.aportesPatronal as Row).pct, 0.1215);
    assert.ok(n(data.diasAsumidos) >= 1); // hoy 18 y lo que falta del mes
    assert.ok(Array.isArray(data.fechasFalta));

    const listaStaff = await handle("roles_lista", { token: "t-andrea" }, c) as Row;
    assert.ok(!((listaStaff.items as Row[]) || []).some((x) => x.persona === "Andrea Robles" && x.estado === "borrador"));

    const vista = await handle("rol_aprobar", { token: "t-emi", preview: true, preview_uid: "andrea", id: creado.id }, c) as Row;
    assert.ok(vista.error, "Ver como no debe aprobar");

    const prueba = await handle("rol_aprobar", { token: "t-prueba", id: creado.id }, c) as Row;
    assert.match(String(prueba.error), /simulación/i);

    const ok = await handle("rol_aprobar", { token: "t-emi", id: creado.id }, c) as Row;
    assert.equal(ok.ok, true, String(ok.error || JSON.stringify(ok)));
    assert.equal(ok.estado, "aprobado");

    const lista = await handle("roles_lista", { token: "t-andrea" }, c) as Row;
    assert.ok(((lista.items as Row[]) || []).some((x) => x.persona === "Andrea Robles" && x.estado === "aprobado"));

    const ind = await handle("getRolIndividual", { token: "t-andrea", sheet: "NOVIEMBRE_2026", cedula: "1711" }, c) as Row;
    assert.equal(ind.ok, true, String(ind.error || ""));
    assert.equal((ind.data as Row).fuente, "beta-aprobado");
  });

  it("TK170: sin afiliación sale un rol sin IESS ni décimos/fondo y con el total a facturar", async () => {
    const db = seed();
    const c = ctx(db);
    await handle("emp_guardar", { token: "t-emi", nombre: "Daniela Mora", afiliada_iess: false }, c);
    const rol = await handle("rol_crear", { token: "t-emi", persona: "Daniela Mora", periodo: "NOVIEMBRE_2026" }, c) as Row;
    assert.equal(rol.ok, true, String(rol.error || JSON.stringify(rol)));
    const fila = (db.tables.get("beta_roles") || [])[0];
    const snap = (fila?.snapshot || {}) as Row;
    assert.equal(snap.afiliada, false);
    assert.equal(Number(snap.iess), 0);
    assert.equal(Number(snap.dec13) + Number(snap.dec14) + Number(snap.fondoReserva), 0);
    assert.equal(Number(snap.facturar), Number(snap.totalRecibir));
    assert.match(String(snap.mensajeFactura), /Debes facturarnos \$\d+\.\d{2} por este período/);
  });

  it("No aprobar pide motivo, deja el rol en rechazado y se puede volver a generar", async () => {
    const db = seed();
    const c = ctx(db);
    const creado = await handle("rol_crear", { token: "t-emi", persona: "Andrea Robles", periodo: "NOVIEMBRE_2026" }, c) as Row;
    const malo = await handle("rol_rechazar", { token: "t-emi", id: creado.id }, c) as Row;
    assert.match(String(malo.error), /motivo/);
    const no = await handle("rol_rechazar", { token: "t-emi", id: creado.id, motivo: "Faltan horas del 10" }, c) as Row;
    assert.equal(no.ok, true, String(no.error || ""));
    assert.equal(no.estado, "rechazado");
    assert.match(String(no.motivoRechazo), /Faltan horas/);
    const otra = await handle("rol_crear", { token: "t-emi", persona: "Andrea Robles", periodo: "NOVIEMBRE_2026" }, c) as Row;
    assert.equal(otra.ok, true, String(otra.error || ""));
    assert.equal(otra.estado, "borrador");
    assert.equal(otra.id, creado.id);
  });

  it("ajustar un anticipo recalcula el neto y solo aparece Guardar en el front después de un cambio", async () => {
    const db = seed();
    const c = ctx(db);
    const creado = await handle("rol_crear", { token: "t-emi", persona: "Andrea Robles", periodo: "NOVIEMBRE_2026" }, c) as Row;
    const antes = n((creado.data as Row).totalRecibir);
    const aj = await handle("rol_ajustar", { token: "t-emi", id: creado.id, ajustes: { anticipo: 40 } }, c) as Row;
    assert.equal(aj.ok, true, String(aj.error || ""));
    assert.equal(n((aj.data as Row).anticipo), 40);
    assert.ok(n((aj.data as Row).totalRecibir) < antes);
    const beta = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    assert.match(beta, /Crear rol/);
    assert.match(beta, /Aporte patronal a pagar/);
    assert.match(beta, /data-rol-guardar/);
    assert.match(beta, /rol-dirty/);
  });

  it("el front no hace scroll horizontal a 375 y tiene pastillas de estado", () => {
    const beta = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    assert.match(beta, /rol-pill/);
    assert.match(beta, /Borrador|Aprobado|Rechazado/);
    assert.match(beta, /max-width:375px[\s\S]{0,200}overflow-x:\s*hidden|#rol-preview[\s\S]{0,400}overflow-x:\s*hidden|rol-preview[\s\S]{0,200}overflow-x:\s*auto/);
    assert.match(beta, /Generar OC del mes|#\/m\/personal\/empleados/);
  });
});
