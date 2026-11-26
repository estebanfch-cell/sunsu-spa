// DEV-31c (Emilia t910u/t911u): pre-rol siempre creado y recalculado solo, aprobación, estado ante Contabilidad
// y nada visible para la empleada antes de aprobar.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./asistencia_api.ts";
import "./personal_api.ts";
import "./roles_api.ts";
import "./roles_crear_api.ts";
import "./rol_descuentos_api.ts";
import "./rol_config_api.ts";
import "./rol_admin_api.ts";
import { esAdminNombreRol } from "./rol_admin_api.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "./empleados_api.ts";
import type { Row } from "./domain.ts";

function seed(): MemoryDb {
  return new MemoryDb({
    sesiones: [
      { token: "t-emi", uid: "emi", rol: "super_admin", exp: "2099-01-01T00:00:00.000Z" },
      { token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
    ],
    usuarios: [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "super_admin", bloqueado: false },
      { id: "efch", nombre: "EFCH", short: "EFCH", rol: "super_admin", bloqueado: false },
      { id: "andrea", nombre: "Andrea", short: "Andrea", rol: "cosmetologa", bloqueado: false },
    ],
    rrhh_empleadas: [
      { cedula: "1711", nombre_app: "Andrea", apellidos_y_nombres: "Andrea Robles", sueldo_base: 482, fecha_ingreso: "2025-05-01", cargo: "Cosmetologa" },
      { cedula: "1713", nombre_app: "Alejandra", apellidos_y_nombres: "Alejandra Rodriguez", sueldo_base: 482, fecha_ingreso: "2026-01-14", cargo: "Recepcion" },
      { cedula: "1714", nombre_app: "Dejaneira", apellidos_y_nombres: "Dejaneira Espinoza", sueldo_base: 482, fecha_ingreso: "2025-01-01", cargo: "Cosmetologa" },
      { cedula: "9", nombre_app: "Emi", apellidos_y_nombres: "Emilia Gallegos", sueldo_base: 999, fecha_ingreso: "2020-01-01", cargo: "Gerente" },
    ],
    beta_empleados: [],
    beta_rol_config: [
      { persona: "Andrea", nombre_completo: "Andrea Robles", sueldo_base: 482, bono: 130, afiliada_iess: true, fecha_ingreso: "2025-05-01", activa: true },
      { persona: "Alejandra", nombre_completo: "Alejandra Rodriguez", sueldo_base: 482, bono: 30, afiliada_iess: true, fecha_ingreso: "2026-01-14", activa: true },
      { persona: "Dejaneira", nombre_completo: "Dejaneira Espinoza", sueldo_base: 0, bono: 0, afiliada_iess: true, fecha_ingreso: "2025-01-01", activa: false },
    ],
    beta_rol_config_log: [], asistencia_historico: [], tickets: [], multas_descuentos: [], asistencia_marcajes: [], permisos: [],
    beta_roles: [], beta_roles_log: [], beta_rol_descuentos: [], beta_rol_firmas: [], beta_rol_publicaciones: [],
  });
}
function ctx(db: MemoryDb, now = "2026-11-25T15:00:00Z") {
  return { db, now: new Date(now), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }) };
}

describe("DEV-31c pre-rol automático", () => {
  it("crea el borrador la primera vez, lo recalcula sin duplicar y no avisa a la empleada", async () => {
    const db = seed();
    const a = await handle("rol_pre_auto", { token: "t-emi", persona: "Andrea" }, ctx(db)) as Row;
    assert.equal(a.error, undefined);
    assert.equal(a.estado, "borrador");
    assert.equal(a.nuevo, true);
    assert.equal(a.etiqueta, "Noviembre 2026");
    const b = await handle("rol_pre_auto", { token: "t-emi", persona: "Andrea" }, ctx(db)) as Row;
    assert.equal(b.id, a.id);
    assert.equal(b.nuevo, false);
    assert.equal((await db.all("beta_roles")).length, 1);
    // Sin cambios no se escribe ni se registra de nuevo.
    assert.equal((await db.all("beta_roles_log")).length, 1);
  });

  it("se actualiza solo cuando aparece algo nuevo (un anticipo) y lo anota en el historial", async () => {
    const db = seed();
    const a = await handle("rol_pre_auto", { token: "t-emi", persona: "Andrea" }, ctx(db)) as Row;
    const neto0 = (a.data as Row).totalRecibir as number;
    const r = await handle("rol_desc_guardar", { token: "t-emi", persona: "Andrea", tipo: "anticipo", monto: 100, fecha: "2026-11-10", primerPeriodo: "NOVIEMBRE_2026" }, ctx(db)) as Row;
    assert.equal(r.error, undefined, JSON.stringify(r));
    const b = await handle("rol_pre_auto", { token: "t-emi", persona: "Andrea" }, ctx(db)) as Row;
    assert.equal(b.id, a.id);
    assert.ok(Math.abs(neto0 - ((b.data as Row).totalRecibir as number) - 100) < 0.011);
    assert.ok((await db.all("beta_roles_log")).some((l) => l.accion === "recalculo_auto"));
  });

  it("administradoras e inactivas no tienen pre-rol; todas = solo las activas", async () => {
    const db = seed();
    for (const n of ["Emi", "EFCH", "Dejaneira"]) {
      const r = await handle("rol_pre_auto", { token: "t-emi", persona: n }, ctx(db)) as Row;
      assert.ok(r.error, n);
    }
    const t = await handle("rol_pre_todos", { token: "t-emi" }, ctx(db)) as Row;
    assert.deepEqual((t.items as Row[]).map((x) => x.persona).sort(), ["Alejandra", "Andrea"]);
  });

  it("PDF de todas: recargar:false lee el período pedido, incluye borradores y no escribe de nuevo", async () => {
    const db = seed();
    const c = ctx(db);
    await handle("rol_pre_auto", { token: "t-emi", persona: "Andrea" }, c);
    await handle("rol_pre_auto", { token: "t-emi", persona: "Alejandra" }, c);
    const writes = db.writes ? db.writes.length : null;
    // MemoryDb may not expose writes; compare updated_at / log length.
    const logs0 = (await db.all("beta_roles_log")).length;
    const r = await handle("rol_pre_todos", { token: "t-emi", periodo: "NOVIEMBRE_2026", recargar: false }, c) as Row;
    assert.equal(r.ok, true, String(r.error || ""));
    assert.equal(r.periodo, "NOVIEMBRE_2026");
    assert.deepEqual((r.items as Row[]).map((x) => x.persona).sort(), ["Alejandra", "Andrea"]);
    assert.ok((r.items as Row[]).every((x) => x.estado === "borrador" && x.data));
    assert.equal((await db.all("beta_roles_log")).length, logs0);
    const vacio = await handle("rol_pre_todos", { token: "t-emi", periodo: "ENERO_2026", recargar: false }, c) as Row;
    assert.equal((vacio.items as Row[]).length, 0);
    assert.equal((vacio.errores as Row[]).length, 2);
    const leer = await handle("rol_pre_leer", { token: "t-emi", persona: "Andrea" }, c) as Row;
    assert.equal(leer.vacio, false);
    assert.equal(leer.deCache, true);
    assert.equal(leer.persona, "Andrea");
    assert.ok(leer.data);
    const logs1 = (await db.all("beta_roles_log")).length;
    const leer2 = await handle("rol_pre_leer", { token: "t-emi", persona: "Andrea" }, c) as Row;
    assert.equal((await db.all("beta_roles_log")).length, logs1);
    assert.equal(leer2.estado, "borrador");
    const noHay = await handle("rol_pre_leer", { token: "t-emi", persona: "Andrea", periodo: "ENERO_2026" }, c) as Row;
    assert.equal(noHay.vacio, true);
  });

  it("la empleada no ve nada antes de aprobar y no puede usar las acciones de admin", async () => {
    const db = seed();
    const a = await handle("rol_pre_auto", { token: "t-emi", persona: "Andrea" }, ctx(db)) as Row;
    const lista = await handle("roles_lista", { token: "t-andrea" }, ctx(db)) as Row;
    assert.equal((lista.items as Row[]).filter((x) => x.fuente === "beta").length, 0);
    const g = await handle("rol_get", { token: "t-andrea", id: a.id }, ctx(db)) as Row;
    assert.ok(g.error);
    for (const [act, body] of [["rol_pre_auto", { persona: "Andrea" }], ["rol_pre_todos", {}], ["rol_contab", { id: a.id, estado: "ok" }]] as [string, Row][]) {
      const r = await handle(act, { token: "t-andrea", ...body }, ctx(db)) as Row;
      assert.ok(r.error, act);
    }
  });

  it("estado ante Contabilidad: enviado / ok / sin enviar, con historial; aprobar lo publica a la empleada", async () => {
    const db = seed();
    const a = await handle("rol_pre_auto", { token: "t-emi", persona: "Andrea" }, ctx(db)) as Row;
    assert.equal(((a.contab as Row).estado), "");
    const e = await handle("rol_contab", { token: "t-emi", id: a.id, estado: "enviado" }, ctx(db)) as Row;
    assert.equal((e.contab as Row).estado, "enviado");
    const o = await handle("rol_contab", { token: "t-emi", id: a.id, estado: "ok" }, ctx(db)) as Row;
    assert.equal((o.contab as Row).estado, "ok");
    assert.ok((await handle("rol_contab", { token: "t-emi", id: a.id, estado: "x" }, ctx(db)) as Row).error);
    // El recálculo conserva el estado de Contabilidad.
    const b = await handle("rol_pre_auto", { token: "t-emi", persona: "Andrea" }, ctx(db)) as Row;
    assert.equal((b.contab as Row).estado, "ok");
    const ap = await handle("rol_aprobar", { token: "t-emi", id: a.id }, ctx(db)) as Row;
    assert.equal(ap.estado, "aprobado");
    // Aprobado: pre_auto devuelve el rol aprobado sin tocarlo.
    const c = await handle("rol_pre_auto", { token: "t-emi", persona: "Andrea" }, ctx(db)) as Row;
    assert.equal(c.estado, "aprobado");
    assert.equal(c.firmado, false);
    const g = await handle("rol_get", { token: "t-andrea", id: a.id }, ctx(db)) as Row;
    assert.equal(g.error, undefined);
    assert.equal(g.contab, undefined);
    assert.equal(JSON.stringify(g).includes("aportesPatronal"), false);
    assert.equal((await db.all("beta_roles_log")).filter((l) => l.accion === "contabilidad").length, 2);
  });
});

describe("DEV-31n PDF de todas (front e iOS)", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  it("el botón existe, respeta el período, no recarga al vuelo y el PDF se entrega sin pop-up en iOS/PWA", () => {
    const rol = readFileSync(join(root, "mc-rol.js"), "utf8");
    const screens = readFileSync(join(root, "beta-screens.js"), "utf8");
    const html = readFileSync(join(root, "index.html"), "utf8");
    assert.match(rol, /PDF de todas/);
    assert.match(rol, /recargar:\s*false/);
    assert.match(rol, /periodo:\s*periodo/);
    assert.doesNotMatch(rol.split("data-rolx-pdf-todas")[2] || rol, /if \(RX\.pack\) cargarRol\(root\)/);
    assert.match(screens, /function _pdfEntregaHoja/);
    assert.match(screens, /function _nombrePdfRolesTodas/);
    assert.match(screens, /Roles_\s*'\s*\+|Roles_'\s*\+|_nombrePdfRolesTodas/);
    assert.match(screens, /_esIOS_\(\) \|\| _esPwa_\(\)/);
    assert.match(screens, /it\.estado!=='aprobado'/);
    assert.match(screens, /_esAdminNombreRol/);
    assert.doesNotMatch(screens.split("function _pdfPreRolVarios")[1].split("function ")[0], /_pdfPreRolResumenHoja/);
    assert.match(html, /#sunsu-pdf-entrega/);
    assert.match(rol, /rol_pre_leer/);
    assert.match(rol, /prefetchTodos/);
    assert.match(rol, /último pre-rol guardado/);
    assert.doesNotMatch(rol, /sel\.onchange[\s\S]{0,400}Calculando el pre-rol/);
  });

  it("nombres de administración no entran y el archivo se llama Roles_Noviembre_2026.pdf", async () => {
    const { esAdminNombreRol } = await import("./rol_admin_api.ts");
    assert.equal(esAdminNombreRol("EFCH"), true);
    assert.equal(esAdminNombreRol("Emi"), true);
    assert.equal(esAdminNombreRol("EFCH (efch)"), true);
    assert.equal(esAdminNombreRol("Andrea"), false);
    assert.equal(esAdminNombreRol("Alejandra"), false);
    const screens = readFileSync(join(root, "beta-screens.js"), "utf8");
    // Helper lives in the browser bundle; we check the template used for the example Emilia asked for.
    assert.match(screens, /Roles_\s*['"]?\s*\+\s*slug|return 'Roles_'/);
  });
});
