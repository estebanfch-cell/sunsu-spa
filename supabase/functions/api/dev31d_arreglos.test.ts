// DEV-31d (Emilia t915u): CCC 1% en el costo empresa (no se descuenta a la empleada), el visor no sale
// en selectores de personal, y la afiliación IESS tiene una sola fuente (Configuración de rol).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./asistencia_api.ts";
import "./personal_api.ts";
import "./horarios_api.ts";
import "./roles_api.ts";
import "./roles_crear_api.ts";
import "./rol_config_api.ts";
import "./rol_descuentos_api.ts";
import "./empleados_api.ts";
import { adminesDe } from "./lib.ts";
import { rolCalcularOficial } from "./domain.ts";
import type { Row } from "./domain.ts";

function seed(): MemoryDb {
  return new MemoryDb({
    sesiones: [
      { token: "t-emi", uid: "emi", rol: "super_admin", exp: "2099-01-01T00:00:00.000Z" },
    ],
    usuarios: [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "super_admin", bloqueado: false },
      { id: "visor", nombre: "Skin Analysis", short: "Visor", rol: "visor", bloqueado: false },
      { id: "andrea", nombre: "Andrea", short: "Andrea", rol: "cosmetologa", bloqueado: false },
    ],
    rrhh_empleadas: [
      { cedula: "1726468133", nombre_app: "Andrea", apellidos_y_nombres: "Andrea Robles", sueldo_base: 482, bono_fijo: 130, fecha_ingreso: "2025-05-01", cargo: "Cosmetologa" },
    ],
    beta_empleados: [
      { id: "ov-andrea", nombre_app: "Andrea", afiliada_iess: false },
    ],
    beta_rol_config: [
      { persona: "Andrea", nombre_completo: "Andrea Robles", cedula: "1726468133", sueldo_base: 482, bono: 130, afiliada_iess: true, fecha_ingreso: "2025-05-01", activa: true },
    ],
    beta_rol_config_log: [], asistencia_historico: [], tickets: [], multas_descuentos: [], asistencia_marcajes: [], permisos: [],
    beta_roles: [], beta_roles_log: [], beta_rol_descuentos: [], beta_rol_firmas: [],
  });
}
function ctx(db: MemoryDb) {
  return { db, now: new Date("2026-11-25T15:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }) };
}

describe("DEV-31d arreglos", () => {
  it("el costo empresa suma la CCC 1% y no se descuenta del neto", () => {
    const r = rolCalcularOficial({ sueldoBase: 482, bono: 130, faltas: 0, comFaciales: 0, comExtras: 0, comRecepcion: 0, comProductos: 0, comPaquetes: 0, fondoReserva: true, fechaIngreso: "2025-05-01", anio: 2026, mes: 11 });
    assert.ok(Math.abs(r.ccc - r.ingresoAportable * 0.01) < 0.011);
    assert.ok(Math.abs(r.costoEmpresa - (r.totalIngresos + r.aportePatronal + r.ccc)) < 0.011);
    const sinCcc = r.totalIngresos - r.totalEgresos;
    assert.ok(Math.abs(r.totalRecibir - sinCcc) < 0.011);
  });

  it("Skin Analysis / visor no aparece en selectores de personal ni de asistencia", async () => {
    const db = seed();
    const es = await adminesDe(db);
    assert.equal(es("Skin Analysis"), true);
    assert.equal(es("Visor"), true);
    assert.equal(es("Andrea"), false);
    const p = await handle("personal_personas", { token: "t-emi" }, ctx(db)) as Row;
    const nombres = ((p.personas as Row[]) || []).map((x) => x.nombre);
    assert.equal(nombres.includes("Skin Analysis"), false);
    assert.equal(nombres.includes("Visor"), false);
    assert.ok(nombres.includes("Andrea"));
  });

  it("la afiliación la manda Configuración de rol, no el interruptor de Empleados", async () => {
    const db = seed();
    // El overlay dice no afiliada, la config dice sí: el rol y la ficha deben decir sí.
    const lista = await handle("emp_list", { token: "t-emi" }, ctx(db)) as Row;
    const andrea = ((lista.items as Row[]) || []).find((x) => x.nombre === "Andrea")!;
    assert.equal(andrea.afiliadaIess, true);
    const pre = await handle("rol_prerol_resumen", { token: "t-emi" }, ctx(db)) as Row;
    const fila = ((pre.filas as Row[]) || []).find((x) => x.nombre === "Andrea")!;
    assert.equal(fila.afiliada, true);
    assert.ok(Number(fila.iess) > 0);
  });
});
