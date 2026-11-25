// DEV-31 (Emilia t900u/t901u): pre-rol de todas, anticipos (mes siguiente), préstamos en cuotas, firma con el dedo,
// cada empleada ve solo su rol y, desde el 26 nov 2026, las horas salen solo de la asistencia de Sunsu.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./asistencia_api.ts";
import "./horarios_api.ts";
import "./personal_api.ts";
import "./roles_api.ts";
import "./roles_crear_api.ts";
import "./rol_descuentos_api.ts";
import "./empleados_api.ts";
import { planDe, periodoSiguiente } from "./rol_descuentos_api.ts";
import { historicoVigente } from "./asistencia_api.ts";
import type { Row } from "./domain.ts";

function seed(): MemoryDb {
  return new MemoryDb({
    sesiones: [
      { token: "t-emi", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
      { token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
      { token: "t-dani", uid: "dani", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
      { token: "t-visor", uid: "visor", rol: "visor", exp: "2099-01-01T00:00:00.000Z" },
    ],
    usuarios: [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
      { id: "andrea", nombre: "Andrea", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      { id: "dani", nombre: "Daniela", short: "Daniela", rol: "cosmetologa", bloqueado: false },
      { id: "visor", nombre: "Visor", short: "Visor", rol: "visor", bloqueado: false },
    ],
    rrhh_empleadas: [
      { cedula: "1711", nombre_app: "Andrea", apellidos_y_nombres: "Andrea Robles", sueldo_base: 482, bono_fijo: 0, fondo_reserva: "SI", fecha_ingreso: "2024-06-01", cargo: "Cosmetologa" },
      { cedula: "1712", nombre_app: "Evelyn", apellidos_y_nombres: "Evelyn Toapanta", sueldo_base: 482, bono_fijo: 0, fondo_reserva: "NO", fecha_ingreso: "2026-11-14", cargo: "Cosmetologa" },
    ],
    beta_empleados: [{ id: "emp-evelyn", nombre_app: "Evelyn", afiliada_iess: false }],
    asistencia_historico: [], tickets: [], multas_descuentos: [], asistencia_marcajes: [], permisos: [],
    beta_roles: [], beta_rol_descuentos: [], beta_rol_firmas: [],
  });
}
function ctx(db: MemoryDb, now = "2026-11-25T15:00:00Z") {
  return { db, now: new Date(now), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }) };
}
const PNG = "data:image/png;base64," + "iVBORw0KGgo".repeat(200);

describe("DEV-31 rol de pagos", () => {
  it("anticipo: por defecto en el rol del mes siguiente; préstamo: una cuota por rol (última ajusta centavos)", () => {
    assert.equal(periodoSiguiente("2026-11-25"), "DICIEMBRE_2026");
    assert.equal(periodoSiguiente("2026-12-03"), "ENERO_2027");
    assert.deepEqual(planDe({ tipo: "anticipo", monto: 100, primer_periodo: "DICIEMBRE_2026" }), [{ periodo: "DICIEMBRE_2026", n: 1, monto: 100 }]);
    const p = planDe({ tipo: "prestamo", monto: 100, cuotas: 3, primer_periodo: "DICIEMBRE_2026" });
    assert.deepEqual(p.map((x) => x.periodo), ["DICIEMBRE_2026", "ENERO_2027", "FEBRERO_2027"]);
    assert.deepEqual(p.map((x) => x.monto), [33.33, 33.33, 33.34]);
  });

  it("registrar anticipo y préstamo; se descuentan en el rol del mes que toca (también sin IESS)", async () => {
    const db = seed(); const c = ctx(db);
    const a = await handle("rol_desc_guardar", { token: "t-emi", persona: "Andrea", tipo: "anticipo", monto: 80, fecha: "2026-11-25" }, c) as Row;
    assert.equal(a.ok, true, String(a.error || ""));
    assert.equal((a.item as Row).primerPeriodo, "DICIEMBRE_2026");
    const pr = await handle("rol_desc_guardar", { token: "t-emi", persona: "Evelyn", tipo: "prestamo", monto: 90, cuotas: 3, primerPeriodo: "NOVIEMBRE_2026" }, c) as Row;
    assert.equal(pr.ok, true, String(pr.error || ""));
    // Noviembre: Andrea sin anticipo (es del mes siguiente); Evelyn (sin IESS) con la cuota 1 de 3.
    const nov = await handle("rol_prerol_resumen", { token: "t-emi" }, c) as Row;
    assert.equal(nov.ok, true, String(nov.error || ""));
    const fil = nov.filas as Row[];
    const an = fil.find((x) => x.nombre === "Andrea")!, ev = fil.find((x) => x.nombre === "Evelyn")!;
    assert.equal(an.anticipos, 0);
    assert.equal(ev.prestamos, 30);
    assert.equal(ev.afiliada, false);
    // Diciembre: Andrea con el anticipo completo, Evelyn cuota 2.
    const dic = await handle("rol_prerol_resumen", { token: "t-emi", periodo: "DICIEMBRE_2026" }, c) as Row;
    const an2 = (dic.filas as Row[]).find((x) => x.nombre === "Andrea")!;
    assert.equal(an2.anticipos, 80);
    assert.ok(Math.abs(Number(an2.totalEgresos) - (Number(an2.iess) + 80)) < 0.02);
    // El borrador lleva el detalle por línea.
    const rol = await handle("rol_crear", { token: "t-emi", persona: "Evelyn", periodo: "NOVIEMBRE_2026" }, c) as Row;
    const det = ((rol.data as Row).descuentosInternos as Row[]);
    assert.equal(det.length, 1);
    assert.match(String(det[0].etiqueta), /Préstamo Sunsu \(cuota 1 de 3\)/);
  });

  it("aprobar → la empleada lo ve, firma con el dedo una vez; otra empleada no lo ve ni lo firma; admin ve el estado", async () => {
    const db = seed(); const c = ctx(db);
    const rol = await handle("rol_crear", { token: "t-emi", persona: "Andrea", periodo: "NOVIEMBRE_2026" }, c) as Row;
    assert.equal((await handle("rol_firmar", { token: "t-andrea", id: rol.id, firma: PNG }, c) as Row).error, "Este rol todavía no está aprobado.");
    const ap = await handle("rol_aprobar", { token: "t-emi", id: rol.id }, c) as Row;
    assert.equal(ap.estado, "aprobado", String(ap.error || ""));
    const otra = await handle("rol_get", { token: "t-dani", id: rol.id }, c) as Row;
    assert.match(String(otra.error), /Solo puedes ver tu propio rol/);
    assert.match(String((await handle("rol_firmar", { token: "t-dani", id: rol.id, firma: PNG }, c) as Row).error), /Solo la persona del rol/);
    const suya = await handle("rol_get", { token: "t-andrea", id: rol.id }, c) as Row;
    assert.equal(suya.puedeFirmar, true);
    assert.equal((await handle("rol_firmar", { token: "t-andrea", id: rol.id, firma: "data:image/png;base64,AAAA" }, c) as Row).error, "La firma está vacía. Dibújala con el dedo.");
    const f = await handle("rol_firmar", { token: "t-andrea", id: rol.id, firma: PNG }, c) as Row;
    assert.equal(f.ok, true, String(f.error || ""));
    assert.equal((await handle("rol_firmar", { token: "t-andrea", id: rol.id, firma: PNG }, c) as Row).error, "Ya firmaste este rol.");
    const adm = await handle("rol_get", { token: "t-emi", id: rol.id }, c) as Row;
    assert.equal(((adm.firma as Row) || {}).firmado, true);
    const lista = await handle("roles_lista", { token: "t-emi" }, c) as Row;
    assert.equal(((lista.items as Row[]).find((x) => x.id === rol.id) || {}).firmado, true);
    const res = await handle("rol_resumen_periodo", { token: "t-emi", periodo: "NOVIEMBRE_2026" }, c) as Row;
    assert.equal(((res.items as Row[])[0].firma as Row).firmado, true);
    // Con una cuota en un rol aprobado, el préstamo ya no se edita (se anula y se registra el saldo).
  });

  it("préstamo: saldo baja con cada rol aprobado; anular deja historial; visor y personal no tocan nada", async () => {
    const db = seed(); const c = ctx(db);
    const pr = await handle("rol_desc_guardar", { token: "t-emi", persona: "Andrea", tipo: "prestamo", monto: 300, cuotas: 3, primerPeriodo: "NOVIEMBRE_2026" }, c) as Row;
    const id = (pr.item as Row).id;
    const rol = await handle("rol_crear", { token: "t-emi", persona: "Andrea", periodo: "NOVIEMBRE_2026" }, c) as Row;
    await handle("rol_aprobar", { token: "t-emi", id: rol.id }, c);
    const l = await handle("rol_desc_lista", { token: "t-emi" }, c) as Row;
    const it = (l.items as Row[]).find((x) => x.id === id)!;
    assert.equal(it.pagado, 100); assert.equal(it.saldo, 200);
    assert.match(String((await handle("rol_desc_guardar", { token: "t-emi", id, persona: "Andrea", tipo: "prestamo", monto: 400, cuotas: 4, primerPeriodo: "NOVIEMBRE_2026" }, c) as Row).error), /Ya hay cuotas descontadas/);
    const an = await handle("rol_desc_anular", { token: "t-emi", id, motivo: "pagó en efectivo" }, c) as Row;
    assert.equal((an.item as Row).estado, "anulado");
    const h = await handle("rol_desc_lista", { token: "t-emi", id }, c) as Row;
    assert.deepEqual((h.log as Row[]).map((x) => x.accion), ["crear", "anular"]);
    for (const tk of ["t-andrea", "t-visor"]) {
      const r = await handle("rol_desc_guardar", { token: tk, persona: "Andrea", tipo: "anticipo", monto: 10 }, c) as Row;
      assert.ok(r.error, tk);
      assert.ok((await handle("rol_prerol_resumen", { token: tk }, c) as Row).error, tk);
    }
  });

  it("solo el histórico de la app hasta el 19 nov: nada posterior cuenta como importado", () => {
    const rows = [{ fecha: "2026-11-19" }, { fecha: "2026-11-20" }, { fecha: "2026-11-26" }];
    assert.deepEqual(historicoVigente(rows).map((r) => r.fecha), ["2026-11-19"]);
  });

  it("front: pre-rol en tabla, botón Anticipos y préstamos, firma con el dedo, sin «ligar»", () => {
    const js = readFileSync(new URL("../../../mc-rol.js", import.meta.url), "utf8");
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    assert.match(js, /Anticipos y préstamos/);
    assert.match(js, /pointerdown/);
    assert.match(js, /rol_firmar/);
    assert.match(html, /mc-rol\.js\?v=20261125tk227/);
    assert.match(html, /touch-action:none/);
    assert.doesNotMatch(js, /ligar/i);
  });
});
