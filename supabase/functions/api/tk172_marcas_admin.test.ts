import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./asistencia_api.ts";
import "./horarios_api.ts";
import "./personal_api.ts";
import "./roles_crear_api.ts";
import "./empleados_api.ts";
import type { Row } from "./domain.ts";

function ctx(db: MemoryDb, now = "2026-11-20T23:30:00Z") {
  db.tables.set("sesiones", [
    { token: "t-emi", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
    { token: "t-and", uid: "and", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
    { id: "and", nombre: "Andrea", short: "Andrea", rol: "cosmetologa", bloqueado: false },
  ]);
  return { db, now: new Date(now), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }), token: "t-emi" };
}
function seed() {
  return new MemoryDb({
    rrhh_empleadas: [{ cedula: "1711", nombre_app: "Andrea", apellidos_y_nombres: "Andrea Robles", sueldo_base: 482, bono_fijo: 0, fondo_reserva: "SI", fecha_ingreso: "2024-06-01", cargo: "Cosmetologa" }],
    asistencia_marcajes: [], asistencia_auditoria: [], jibble_historial: [], permisos: [], tickets: [], multas_descuentos: [],
  });
}

describe("TK172 marcas de la app editadas por admin", () => {
  it("agrega, corrige, borra y restaura marcas de hoy con auditoría antes/después", async () => {
    const db = seed();
    const c = ctx(db);
    const h = (a: string, b: Row) => handle(a, { token: "t-emi", ...b }, c) as Promise<Row>;
    for (const [tipo, hora] of [["entrada", "09:40"], ["almuerzo_inicio", "13:00"], ["almuerzo_fin", "14:00"], ["salida", "18:10"]]) {
      const r = await h("asis_marca_manual", { nombre: "Andrea", tipo, ts: `2026-11-20T${hora}:00-05:00`, motivo: "olvidó marcar" });
      assert.equal(r.ok, true, String(r.error));
    }
    let dia = await h("asis_marcas_admin", { nombre: "Andrea", fecha: "2026-11-20" });
    assert.equal(dia.ok, true, String(dia.error));
    const marcas = dia.marcas as Row[];
    assert.deepEqual(marcas.map((m) => m.tipo), ["entrada", "almuerzo_inicio", "almuerzo_fin", "salida"]);
    const antesMin = Number((dia.dia as Row).workedMin);
    const ent = marcas[0];
    const cor = await h("asis_corregir", { id: ent.id, tipo: "entrada", ts: "2026-11-20T09:30:00-05:00", motivo: "llegó 9:30" });
    assert.equal(cor.ok, true, String(cor.error));
    dia = await h("asis_marcas_admin", { nombre: "Andrea", fecha: "2026-11-20" });
    // TK198: dentro del horario las normales topan en 8 h; corregir la entrada recalcula el día sin bajar.
    assert.ok(Number((dia.dia as Row).workedMin) >= antesMin);
    const hist = dia.historial as Row[];
    const ult = hist.find((x) => x.accion === "correccion")!;
    assert.ok(ult);
    assert.match(String(ult.actor), /Emi/);
    assert.equal(new Date(String((ult.antes as Row).ts)).toISOString(), "2026-11-20T14:40:00.000Z");
    assert.equal((ult.despues as Row).ts, "2026-11-20T14:30:00.000Z");
    assert.ok(ult.ts);
    assert.equal(hist.filter((x) => x.accion === "marca_manual").length, 4);
    const del = await h("asis_corregir", { id: marcas[3].id, anulado: true, motivo: "salida duplicada" });
    assert.equal(del.ok, true);
    dia = await h("asis_marcas_admin", { nombre: "Andrea", fecha: "2026-11-20" });
    assert.equal((dia.marcas as Row[])[3].anulado, true);
    assert.equal((await h("asis_corregir", { id: marcas[3].id, anulado: false, motivo: "era correcta" })).ok, true);
  });

  it("solo admin, solo el período abierto y nunca en el futuro", async () => {
    const db = seed();
    const c = ctx(db);
    assert.match(String((await handle("asis_marcas_admin", { token: "t-and", nombre: "Andrea" }, c) as Row).error), /admin/);
    assert.match(String((await handle("asis_marca_manual", { token: "t-emi", nombre: "Andrea", tipo: "entrada", ts: "2026-10-31T09:00:00-05:00", motivo: "x" }, c) as Row).error), /período abierto/);
    assert.match(String((await handle("asis_marca_manual", { token: "t-emi", nombre: "Andrea", tipo: "entrada", ts: "2026-11-21T09:00:00-05:00", motivo: "x" }, c) as Row).error), /futuro/);
    assert.match(String((await handle("asis_marcas_admin", { token: "t-emi", nombre: "Andrea", fecha: "2026-10-30" }, c) as Row).error), /período abierto/);
    const ok = await handle("asis_marca_manual", { token: "t-emi", nombre: "Andrea", tipo: "entrada", ts: "2026-11-02T09:00:00-05:00", motivo: "x" }, c) as Row;
    assert.equal(ok.ok, true);
    // mover una marca del período abierto a un mes cerrado no se permite
    assert.match(String((await handle("asis_corregir", { token: "t-emi", id: ok.id, ts: "2026-10-30T09:00:00-05:00", motivo: "x" }, c) as Row).error), /período abierto/);
  });

  it("las marcas corregidas entran al pre-rol al instante", async () => {
    const db = seed();
    const c = ctx(db);
    const pre0 = await handle("rol_prerol", { token: "t-emi", nombre: "Andrea" }, c) as Row;
    const h0 = Number(((pre0.hastaHoy || {}) as Row).trabajadoMin || 0);
    // un día pasado del período sin Jibble: con marcas deja de ser falta
    for (const [tipo, hora] of [["entrada", "10:00"], ["salida", "19:00"]]) {
      await handle("asis_marca_manual", { token: "t-emi", nombre: "Andrea", tipo, ts: `2026-11-19T${hora}:00-05:00`, motivo: "corrección" }, c);
    }
    const pre1 = await handle("rol_prerol", { token: "t-emi", nombre: "Andrea" }, c) as Row;
    assert.ok(Number((pre1.hastaHoy as Row).trabajadoMin) > h0);
    assert.ok(Number((pre1.snap as Row).faltas) < Number((pre0.snap as Row).faltas));
  });

  it("front: editor compacto de marcas en el pre-rol", () => {
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    assert.match(html, /function htmlMarcasAdminBox\(/);
    assert.match(html, /Editar marcas de la app \(admin\)/);
    assert.match(html, /asis_marcas_admin/);
    assert.match(html, /type="time" step="60" data-mk-hora/);
    assert.match(html, /Inicio almuerzo/);
  });
});

describe("TK173 horario asignado en el rol", () => {
  it("quien no está en el mapa RRHH usa su horario de Horarios (descanso dom/mar)", async () => {
    const { horarioRolDeTabla, enMapaRrhh } = await import("./horas_rol.ts");
    const dia = (d: string, hasta = "18:30") => ({ dia: d, trabaja: true, desde: "09:30", hasta });
    const h = horarioRolDeTabla({ nombre: "Cosmetóloga – descanso dom/mar", arreglo: "fijo", descansosTipo: "pago",
      dias: [dia("Monday"), dia("Wednesday"), dia("Thursday"), dia("Friday"), dia("Saturday", "18:00")], descansos: [{ duracionMin: 60 }] })!;
    assert.deepEqual(h.diasDescanso, [0, 2]);
    assert.equal(h.jornadaMins, 540);
    assert.equal(enMapaRrhh("Daniela Mora"), true);
    assert.equal(enMapaRrhh("Evelyn"), false);
  });
});
