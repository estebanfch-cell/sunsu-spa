import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./inline_api.ts";
import "./ventas_api.ts";
import "./tickets_beta_api.ts";
import "./clientes_beta_api.ts";
import "./agenda_api.ts";
import { limpiarCacheAcuity } from "./acuity.ts";
import { acceso, esVisor, gateAccion, puedePriv, redactar, VISOR_ACCIONES } from "./permisos.ts";
import type { Row } from "./domain.ts";

const CONTACTO_RE = /0991111111|0991234567|0999|maria@test|ana@spa|Cumbayá|whatsapp/i;

function sesionVisor() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "vis", uid: "visor", rol: "visor", name: "Skin Analysis", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Ana Pérez", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [
    { id: "admin", nombre: "Emilia", short: "Emilia", rol: "admin", bloqueado: false },
    { id: "visor", nombre: "Skin Analysis", short: "Visor", rol: "visor", bloqueado: false, pin_desactivado: true },
    { id: "u-ana", nombre: "Ana Pérez", short: "Ana", rol: "cosmetologa", bloqueado: false },
  ]);
  db.tables.set("clientas_registro", [
    { id: 1, sheet_row: 90, timestamp: "2026-03-02T15:00:00Z", cedula: "1700000001", nombre: "María", apellido: "Banda", tipo_de_piel: "Mixta", alergias: "Nueces", telefono: "0991111111", email: "maria@test.com", sector_donde_vive: "Cumbayá", fecha_de_nacimiento: "1990-05-12" },
    { id: 2, sheet_row: 91, timestamp: "2026-03-02T15:00:00Z", cedula: "1700000002", nombre: "Lucía", apellido: "Mora" },
  ]);
  db.tables.set("tickets", [
    { id: 1, sheet_row: 10, so_num: "TK-SO-1", timestamp: "2026-11-01T15:00:00Z", atendido_por: "Ana Pérez", nombre: "María", apellido: "Banda", id_3: "1700000001", facial_hecho: "SUNSU-57 Facial K-Lift", estimado: 95 },
  ]);
  db.tables.set("gift_cards", [{ sheet_row: 3, codigo_gc: "GC-26-001", valor: "65", saldo: 40, cedula_comprador: "1700000001", nombre_comprador: "María", apellido_comprador: "Banda", usado: false }]);
  db.tables.set("paquetes", [{ sheet_row: 4, cedula: "1700000001", nombres: "María", apellidos: "Banda", sku: "SUNSU-58", paquete: "x3 Facial K-Lift", uso_1: true, fecha_1: "2026-11-01", orig: { codigo: "PQ-001" } }]);
  db.tables.set("beta_clientes", [
    { key: "c:1700000001", codigo: "C-00004", nombre: "María Banda", cedula: "1700000001", telefono: "0991111111", datos: { nombres: "María", apellido: "Banda", cedula: "1700000001", telefono: "0991111111", email: "maria@test.com", nacimiento: "1990-05-12" }, borrado: false },
  ]);
  for (const t of ["catalogo", "erp_productos", "beta_tickets", "beta_ticket_lineas", "solicitudes_cambio", "app_modulos", "cosmetologas", "beta_citas_ticket", "wa_enviados", "app_kv"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-17T18:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}

function sesionAgenda() {
  limpiarCacheAcuity();
  const { db, h: _h } = sesionVisor();
  db.tables.set("beta_acuity_calendars", [{ calendar_id: 11689550, nombre: "Andrea", persona: "Andrea Robles", activo: true }]);
  const apts: Row[] = [
    { id: 501, firstName: "María", lastName: "Banda", email: "maria@test.com", datetime: "2026-11-17T10:00:00-0500", time: "10:00am", duration: 60, calendarID: 11689550, calendar: "Andrea", type: "Facial Reset", appointmentTypeID: 1, labels: [{ id: 19124872, name: "CONFIRMADA" }], phone: "0991234567", canceled: false, forms: [{ campo: "Teléfono", value: "0991234567" }, { campo: "Tipo de piel", value: "Mixta" }] },
  ];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url), path = u.pathname.replace("/api/v1/", "");
    const json = (d: unknown, st = 200) => new Response(JSON.stringify(d), { status: st });
    if (path === "calendars") return json([{ id: 11689550, name: "Andrea" }]);
    if (path === "labels") return json([{ id: 19124872, name: "CONFIRMADA", color: "yellow" }]);
    if (path === "appointment-types" || path === "appointment-addons") return json([]);
    if (path === "appointments" && (init.method || "GET") === "GET") return json(apts);
    const m = path.match(/^appointments\/(\d+)$/);
    if (m && (init.method || "GET") === "GET") return json(apts.find((a) => String(a.id) === m[1]));
    if (m && init.method === "PUT") return json({ ok: 1 });
    if (/\/cancel$/.test(path)) return json({ ok: 1 });
    return json({ message: "no" }, 404);
  }) as typeof fetch;
  const env = { ACUITY_UID: "1", ACUITY_KEY: "k" } as Record<string, string | undefined>;
  const c = { db, now: new Date("2026-11-17T18:30:00Z"), env, fetchImpl, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => { limpiarCacheAcuity(); return handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>; };
  return { db, h };
}

describe("TK216 rol visor (solo lectura, sin contacto)", () => {
  it("acceso() queda cerrado: solo clientas y agenda, aunque la matriz le suelte tickets o teléfonos", () => {
    const abierta = { visor: { clientes: "todos", agenda: "todos", tickets: "todos", ver_telefonos: "todos", ver_emails: "todos", inventario: "todos", caja: "todos" } } as const;
    assert.equal(esVisor("visor"), true);
    assert.equal(acceso("visor", "clientes", abierta as any), "todos");
    assert.equal(acceso("visor", "agenda", abierta as any), "todos");
    assert.equal(acceso("visor", "tickets", abierta as any), "no");
    assert.equal(acceso("visor", "inventario", abierta as any), "no");
    assert.equal(acceso("visor", "caja", abierta as any), "no");
    assert.equal(puedePriv("visor", "telefonos", abierta as any), false);
    assert.equal(puedePriv("visor", "emails", abierta as any), false);
    assert.equal(acceso("admin", "tickets"), "todos");
  });

  it("gateAccion: lecturas permitidas, el resto se rechaza; admin no se ve afectado", () => {
    const vis = { rol: "visor", name: "Skin Analysis", short: "Visor", uid: "visor" };
    const adm = { rol: "admin", name: "Emilia", short: "Emilia", uid: "admin" };
    for (const a of ["cl_list", "cl_get", "cl_buscar", "buscarCliente", "clientes_resumen", "cliente_detalle", "ag_meta", "ag_citas", "ag_cita", "whoami", "bootstrap"]) {
      assert.equal(gateAccion(a, vis, {}), null, a);
    }
    for (const a of ["cl_guardar", "cl_borrar", "cl_restaurar", "cl_doc_url", "cl_rellenar_contactos", "ag_crear", "ag_reagendar", "ag_cancelar", "ag_wa", "ag_etiqueta", "ag_vincular", "ag_ingresado", "ag_calendario_guardar", "ag_disponibilidad", "crearTicket", "ov_list", "ov_save", "getDashboardHoy", "inv_list", "compras_list", "caja_list", "permisos_get", "cfg_priv_guardar"]) {
      const r = gateAccion(a, vis, {});
      assert.ok(r && r.error, a);
      assert.match(r!.error, /solo puede consultar/i);
    }
    assert.equal(gateAccion("crearTicket", adm, {}), null);
    assert.equal(gateAccion("cl_guardar", adm, {}), null);
  });

  it("visor lee clientas y cédulas, sin teléfono, correo, sector, paquetes, gift ni historial; no puede pedir ni editar", async () => {
    const { h } = sesionVisor();
    const l = await h("cl_list", "vis");
    assert.equal(l.ok, true, String(l.error));
    assert.equal(l.soloLectura, true);
    assert.equal(l.puedeEditar, false);
    assert.equal(l.puedePedir, false);
    assert.equal(l.puedeDescargar, false);
    const m = ((l.clientes || []) as Row[]).find((c) => c.key === "c:1700000001")!;
    assert.ok(m, "aparece la clienta");
    assert.equal(m.cedula, "1700000001");
    assert.match(String(m.nombre), /María/);
    assert.equal("telefono" in m, false);
    assert.equal("email" in m, false);
    assert.equal("sector" in m, false);
    assert.equal("paquetesActivos" in m, false);
    assert.equal("giftSaldo" in m, false);
    assert.doesNotMatch(JSON.stringify(l), CONTACTO_RE);

    const f = await h("cl_get", "vis", { key: "c:1700000001" });
    assert.equal(f.ok, true, String(f.error));
    assert.equal(f.soloLectura, true);
    assert.equal(f.puedeEditar, false);
    assert.equal(f.puedePedir, false);
    assert.equal(f.puedeDescargar, false);
    const datos = (f.datos || {}) as Row;
    assert.equal(datos.cedula, "1700000001");
    assert.equal(datos.telefono, undefined);
    assert.equal(datos.email, undefined);
    assert.equal((f.historial as Row[]).length, 0);
    assert.equal((f.paquetes as Row[]).length, 0);
    assert.equal((f.giftcards as Row[]).length, 0);
    assert.equal((f.documentos as Row[]).length, 0);
    assert.doesNotMatch(JSON.stringify(f), CONTACTO_RE);

    const b = await h("cl_buscar", "vis", { q: "1700000001" });
    assert.equal(b.ok, true, String(b.error));
    const item = ((b.items || []) as Row[])[0];
    assert.ok(item);
    assert.equal(item.cedula, "1700000001");
    assert.equal("telefono" in item, false);
    assert.doesNotMatch(JSON.stringify(b), CONTACTO_RE);
  });

  it("admin sigue viendo teléfonos, historial, paquetes y puede editar", async () => {
    const { h } = sesionVisor();
    const l = await h("cl_list", "adm");
    assert.equal(l.ok, true, String(l.error));
    assert.equal(l.puedeEditar, true);
    assert.notEqual(l.soloLectura, true);
    const m = ((l.clientes || []) as Row[]).find((c) => c.key === "c:1700000001")!;
    assert.match(String(m.telefono), /111\s*1111|0991111111/);
    const f = await h("cl_get", "adm", { key: "c:1700000001" });
    assert.equal(f.ok, true, String(f.error));
    assert.match(String((f.datos as Row).telefono), /111\s*1111|0991111111/);
    assert.equal((f.datos as Row).email, "maria@test.com");
    assert.ok(((f.historial as Row[]) || []).length >= 1);
    assert.ok(((f.paquetes as Row[]) || []).length >= 1);
  });

  it("visor lee la agenda (sin teléfono, correo ni ticket); las escrituras se rechazan", async () => {
    const { h } = sesionAgenda();
    const meta = await h("ag_meta", "vis");
    assert.equal(meta.ok, true, String(meta.error));
    const puede = (meta.puede || {}) as Row;
    assert.equal(puede.agendar, false);
    assert.equal(puede.mover, false);
    assert.equal(puede.cancelar, false);
    assert.equal(puede.ticket, false);
    assert.equal(puede.whatsapp, false);

    const list = await h("ag_citas", "vis", { desde: "2026-11-17", hasta: "2026-11-17" });
    assert.equal(list.ok, true, String(list.error));
    const cita = ((list.citas || []) as Row[])[0];
    assert.ok(cita, "ve la cita");
    assert.equal(cita.nombre, "María");
    assert.equal("telefono" in cita, false);
    assert.equal("email" in cita, false);
    assert.equal("ticket" in cita, false);
    assert.doesNotMatch(JSON.stringify(list), CONTACTO_RE);

    const det = await h("ag_cita", "vis", { id: 501 });
    assert.equal(det.ok, true, String(det.error));
    const d = (det.cita || {}) as Row;
    assert.equal(d.nombre, "María");
    assert.equal(d.telefono, undefined);
    assert.equal(d.email, undefined);
    assert.equal("ticket" in d, false);
    const forms = (d.forms || []) as Row[];
    assert.ok(!forms.some((x) => /tel/i.test(String(x.campo || ""))));
    assert.doesNotMatch(JSON.stringify(det), CONTACTO_RE);

    for (const [a, p] of [
      ["ag_crear", { nombre: "Ana", apellido: "Paz", datetime: "2026-11-20T10:00:00", tipoID: "1" }],
      ["ag_cancelar", { id: 501 }],
      ["ag_reagendar", { id: 501, datetime: "2026-11-20T11:00:00" }],
      ["ag_etiqueta", { id: 501, etiqueta: "NO LLEGO" }],
      ["ag_vincular", { id: 501, ticket: "TK-SO-1" }],
      ["cl_guardar", { key: "c:1700000001", datos: { nombres: "X" } }],
      ["cl_borrar", { key: "c:1700000001", motivo: "no" }],
      ["crearTicket", {}],
    ] as [string, Row][]) {
      const r = await h(a, "vis", p);
      assert.ok(r.error, a + " debió rechazarse: " + JSON.stringify(r));
    }
  });

  it("redactar() quita cualquier campo de contacto en respuestas del visor, y no cambia la de un admin", () => {
    const payload = { ok: true, cliente: { nombre: "María", cedula: "1700000001", telefono: "0991111111", email: "maria@test.com", celular: "0999", direccion: "Cumbayá", forms: [{ campo: "Teléfono", value: "0991111111" }] } };
    const vis = { rol: "visor", name: "Skin Analysis", short: "Visor", uid: "visor" };
    const adm = { rol: "admin", name: "Emilia", short: "Emilia", uid: "admin" };
    const out = redactar("cl_get", structuredClone(payload), vis) as Row;
    assert.doesNotMatch(JSON.stringify(out), CONTACTO_RE);
    assert.equal(((out.cliente as Row).cedula), "1700000001");
    const a = redactar("cl_get", structuredClone(payload), adm) as Row;
    assert.equal(((a.cliente as Row).telefono), "0991111111");
    assert.equal(((a.cliente as Row).email), "maria@test.com");
  });

  it("menú del visor: solo clientas y agenda, sin + / solicitudes / tarjetas; la UI de ficha es solo lectura", () => {
    const g: Record<string, unknown> = {};
    g.window = g;
    g.state = { admin: false, verCostos: false, user: { role: "visor" } };
    g.acceso = (m: string) => (m === "clientes" || m === "agenda" ? "todos" : "no");
    g.esc = (v: unknown) => String(v ?? "");
    g.etiquetaMia = (x: unknown) => x;
    vm.runInNewContext(fs.readFileSync(new URL("../../../mc-nav.js", import.meta.url), "utf8"), g);
    const nav = g.MCNav as { grupos: () => { id: string; label: string; items: string[][] }[]; crearItems: () => unknown[] };
    const items = nav.grupos().flatMap((x) => x.items);
    const hrefs = items.map((i) => i[2]);
    assert.ok(hrefs.includes("#/m/clientes") || hrefs.includes("#/m/clientes/lista") || items.some((i) => /client/i.test(i[1] + i[2])));
    assert.ok(hrefs.includes("#/m/agenda"));
    assert.ok(!hrefs.includes("#/m/solicitudes"));
    assert.ok(!hrefs.some((h) => /ticket|caja|compra|inventario|comision|gift|paquete/i.test(h)));
    assert.deepEqual([...nav.crearItems()], []);

    const html = fs.readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    const sw = fs.readFileSync(new URL("../../../sw.js", import.meta.url), "utf8");
    assert.match(html, /function esVisorRol\(\)/);
    assert.match(html, /destinoInicio\(\)/);
    assert.match(html, /#\/m\/clientes/);
    assert.match(html, /SUNSU_CACHE = "sunsu-2026-11-25-DEV31"/);
    assert.match(sw, /const CACHE = "sunsu-2026-11-25-DEV31"/);
    const cli = fs.readFileSync(new URL("../../../mc-clientes.js", import.meta.url), "utf8");
    assert.match(cli, /soloLectura/);
    assert.match(cli, /Buscar por nombre o cédula/);
  });

  it("la firma de redactar sigue siendo de 4 argumentos (compatible con un merge posterior de códigos de proveedor)", () => {
    // 4º argumento (matriz) es opcional, así que .length es 3; un 5º opcional (p. ej. códigos de proveedor) se puede sumar después.
    const vis = { rol: "visor", name: "Skin Analysis", short: "Visor", uid: "visor" };
    const out = redactar("cl_get", { cedula: "1700000001", telefono: "0991111111" }, vis, {}) as Row;
    assert.equal(out.cedula, "1700000001");
    assert.equal(out.telefono, undefined);
    assert.ok(VISOR_ACCIONES.has("cl_list"));
    assert.ok(!VISOR_ACCIONES.has("cl_guardar"));
  });
});
