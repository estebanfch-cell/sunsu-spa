// DEV-31c (Emilia t911u): importar la planilla del IESS (detalle mensual) y compararla con el rol de la app.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./roles_api.ts";
import "./roles_crear_api.ts";
import "./rol_config_api.ts";
import "./rol_iess_api.ts";
import "./empleados_api.ts";
import { normalizarFilasIess } from "./rol_iess_api.ts";
import type { Row } from "./domain.ts";

const cab = ["", "Periodo", "Estado", "Sub Tipo", "Cédula", "Nombre", "R. Trabajo", "Novedad", "Sueldo", "Días", "Patronal", "Individual", "Aporte Adicional", "Cesantía", "% CCC", "", "Valor CCC", "Total Aporte"];
function fila(v: (string | number)[]): Row { return Object.fromEntries(cab.map((c, i) => [c, v[i]])); }
const ESTADO = "Cancelada por Trámites Normales";
const FILAS: Row[] = [
  fila(["", "2026-10", ESTADO, "AA", "1700000001", "PEREZ LOPEZ ANA MARIA", "06-CODIGO DEL TRABAJO - CT ", "INS", "978.32", "0", "109.08", "92.45", "0", "0", "1", "9.78", "", "201.53"]),
  fila(["", "2026-10", ESTADO, "A", "1700000001", "PEREZ LOPEZ ANA MARIA", "06-CODIGO DEL TRABAJO - CT ", "NNA", "482.00", "30", "53.74", "45.55", "0", "0", "1", "4.82", "", "99.29"]),
  fila(["", "2026-10", ESTADO, "AA", "1700000099", "SOTO RUIZ BEATRIZ ELENA", "06-CODIGO DEL TRABAJO - CT ", "INS", "1,223.30", "0", "136.40", "115.60", "0", "0", "1", "12.23", "", "252.00"]),
  fila(["", "2026-10", ESTADO, "A", "1700000099", "SOTO RUIZ BEATRIZ ELENA", "06-CODIGO DEL TRABAJO - CT ", "NNA", "482.00", "30", "53.74", "45.55", "0", "0", "1", "4.82", "", "99.29"]),
  fila(["", "2026-10", ESTADO, "A", "1700000500", "GERENTE JEFA MARIA", "109-GERENTE ADMINISTRADOR SIN RELACIÓN DE DEPENDENCIA", "NNA", "1,500.00", "30", "0", "264.00", "0", "0", "0", "0", "", "264.00"]),
  fila(["", "2026-10", "Anulada", "A", "1700000001", "PEREZ LOPEZ ANA MARIA", "06-CODIGO DEL TRABAJO - CT ", "NNA", "999.00", "30", "1", "1", "0", "0", "1", "1", "", "2"]),
  fila(["", "Totales (NO SE TOMA EN CUENTA LAS ANULADAS)", "", "", "", "", "", "", "5305.15"]),
];
function seed(): MemoryDb {
  return new MemoryDb({
    sesiones: [
      { token: "t-emi", uid: "emi", rol: "super_admin", exp: "2099-01-01T00:00:00.000Z" },
      { token: "t-ana", uid: "ana", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
    ],
    usuarios: [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "super_admin", bloqueado: false },
      { id: "ana", nombre: "Ana", short: "Ana", rol: "cosmetologa", bloqueado: false },
    ],
    rrhh_empleadas: [
      { cedula: "1700000001", nombre_app: "Ana", apellidos_y_nombres: "PEREZ ANA", sueldo_base: 482, fecha_ingreso: "2025-01-01", cargo: "Cosmetologa" },
      { cedula: "1700000002", nombre_app: "Bea", apellidos_y_nombres: "SOTO BEATRIZ", sueldo_base: 482, fecha_ingreso: "2025-01-01", cargo: "Cosmetologa" },
      { cedula: "1700000003", nombre_app: "Cora", apellidos_y_nombres: "DIAZ CORA", sueldo_base: 482, fecha_ingreso: "2025-01-01", cargo: "Cosmetologa" },
      { cedula: "1700000004", nombre_app: "Dina", apellidos_y_nombres: "VERA DINA", sueldo_base: 482, fecha_ingreso: "2025-01-01", cargo: "Cosmetologa" },
    ],
    beta_empleados: [],
    beta_rol_config: [
      { persona: "Ana", sueldo_base: 482, bono: 0, afiliada_iess: true, fecha_ingreso: "2025-01-01", activa: true },
      { persona: "Bea", sueldo_base: 482, bono: 0, afiliada_iess: true, fecha_ingreso: "2025-01-01", activa: true },
      { persona: "Cora", sueldo_base: 482, bono: 0, afiliada_iess: true, fecha_ingreso: "2025-01-01", activa: true },
      { persona: "Dina", sueldo_base: 482, bono: 0, afiliada_iess: false, fecha_ingreso: "2025-01-01", activa: true },
    ],
    beta_rol_hist_detalle: [
      { cedula: "1700000001.0", periodo: "OCTUBRE_2026", detalle: { ingresoAportable: 1460.32, iess: 138.0 } },
      { cedula: "1700000002.0", periodo: "OCTUBRE_2026", detalle: { ingresoAportable: 1673.15, iess: 158.11 } },
    ],
    beta_roles: [], beta_iess_planilla: [], asistencia_marcajes: [], tickets: [], multas_descuentos: [], permisos: [], beta_rol_descuentos: [], asistencia_historico: [],
  });
}
function ctx(db: MemoryDb) { return { db, now: new Date("2026-11-25T15:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }) }; }

describe("DEV-31c planilla IESS", () => {
  it("normaliza el XLS: números con coma, ignora totales y anuladas", () => {
    const { filas, anuladas } = normalizarFilasIess(FILAS);
    assert.equal(filas.length, 5);
    assert.equal(anuladas, 1);
    assert.equal(filas.find((f) => f.cedula === "1700000099" && f.novedad === "INS")!.sueldo, 1223.3);
  });

  it("importa, reimporta sin borrar y compara contra el rol", async () => {
    const db = seed();
    const r = await handle("iess_importar", { token: "t-emi", archivo: "planilla.xls", filas: FILAS }, ctx(db)) as Row;
    assert.equal(r.error, undefined);
    assert.equal(r.filas, 5);
    const r2 = await handle("iess_importar", { token: "t-emi", archivo: "planilla.xls", filas: FILAS }, ctx(db)) as Row;
    assert.equal(r2.reemplazadas, 5);
    const todas = await db.all("beta_iess_planilla");
    assert.equal(todas.length, 10);
    assert.equal(todas.filter((x) => x.vigente === false).length, 5);
    const l = await handle("iess_lista", { token: "t-emi" }, ctx(db)) as Row;
    assert.equal((l.items as Row[]).length, 1);
    assert.equal((l.items as Row[])[0].filas, 5);

    const c = await handle("iess_comparar", { token: "t-emi", periodo: "2026-10" }, ctx(db)) as Row;
    assert.equal(c.error, undefined);
    const por = Object.fromEntries((c.items as Row[]).map((x) => [x.persona, x]));
    // Ana: igual al rol (1460.32), por cédula.
    assert.equal(por.Ana.estado, "ok");
    assert.equal(por.Ana.aportableIess, 1460.32);
    assert.equal(por.Ana.dif, 0);
    assert.equal(por.Ana.coincidePor, "cédula");
    assert.equal(por.Ana.individualIess, 138);
    // Bea: cédula distinta (por nombre) y el IESS tiene +32.15.
    assert.equal(por.Bea.coincidePor, "nombre");
    assert.equal(por.Bea.estado, "revisar");
    assert.equal(por.Bea.cedulaIess, "1700000099");
    assert.ok(Math.abs((por.Bea.dif as number) - 32.15) < 0.011);
    assert.ok((por.Bea.avisos as string[]).some((a) => /cédula/.test(a)) && (por.Bea.avisos as string[]).some((a) => /32\.15/.test(a)));
    // Cora afiliada y ausente en planilla; Dina sin afiliación y ausente = correcto.
    assert.equal(por.Cora.estado, "revisar");
    assert.equal(por.Dina.estado, "ok");
    // La gerente aparece aparte y no entra en los totales.
    const g = (c.otros as Row[]).find((x) => x.cedulaIess === "1700000500")!;
    assert.equal(g.estado, "admin");
    assert.equal((c.totales as Row).aportableIess, 3165.62);
  });

  it("solo administración; la empleada no importa ni compara ni ve", async () => {
    const db = seed();
    for (const [a, b] of [["iess_importar", { filas: FILAS }], ["iess_lista", {}], ["iess_comparar", { periodo: "2026-10" }]] as [string, Row][]) {
      const r = await handle(a, { token: "t-ana", ...b }, ctx(db)) as Row;
      assert.ok(r.error, a);
    }
    assert.equal((await db.all("beta_iess_planilla")).length, 0);
    const vacio = await handle("iess_comparar", { token: "t-emi", periodo: "2026-10" }, ctx(db)) as Row;
    assert.match(String(vacio.error), /Todavía no hay/);
    const mal = await handle("iess_importar", { token: "t-emi", filas: [{ x: 1 }] }, ctx(db)) as Row;
    assert.ok(mal.error);
  });
});
