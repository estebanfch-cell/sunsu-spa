import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MemoryDb } from "./db.ts";
import { CFG_DEF, calcularCiclo, comisionPaquetesTramo, comisionProductos, contarExtras, desglosePaquetesTramo, listaExtrasPagados, nCosmetologas, normalizarTramos, puedeCotizar, rolCalcular, siguienteOv, type CosmMark, type TicketIn } from "./domain.ts";
import { CORTE_VENTA, aplicarTrasCorte } from "./stock_corte.ts";
import { applyPlan, BODEGA_CABINA, BODEGA_CASA, BODEGA_VENTA, ErpError, LOCAL_ESQUINA, SEED_IDS, erpSeed, puedeTransferir, runErp, usoCompatible } from "./erp.ts";
import { handle } from "./handlers.ts";
import { numeroTicket, ordenarClientes, quincenaDe } from "./ventas.ts";
import "./handlers_extra.ts";
import "./erp_api.ts";
import "./ventas_api.ts";
import "./asistencia_api.ts";
import "./horarios_api.ts";
import "./inline_api.ts";
import "./personal_api.ts";
import "./compras_api.ts";
import "./conteo_api.ts";
import { reimportarTickets } from "./lib.ts";
import { jornadaDe, normalizarJibble, slotRotativo, type Horario } from "./horarios.ts";
import { acceso, esPropio, evaluarBloqueo, lecturaEnVista, redactar, type SesLite } from "./permisos.ts";
import type { Row } from "./domain.ts";

const andrea: SesLite = { rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", uid: "andrea" };
const admin: SesLite = { rol: "admin", name: "Emi", short: "Emi", uid: "emi" };

function ctx(db: MemoryDb, rol = "admin", uid = "emi", name = "Emi") {
  const token = "t-" + uid;
  db.tables.set("sesiones", [{ token, uid, rol, exp: "2099-01-01T00:00:00.000Z" }]);
  const users = db.tables.get("usuarios") || [];
  if (!users.some((u) => u.id === uid)) users.push({ id: uid, nombre: name, short: name, rol, bloqueado: false });
  db.tables.set("usuarios", users);
  return {
    db, now: new Date("2026-10-21T15:00:00Z"),
    env: {} as Record<string, string | undefined>,
    fetchImpl: fetch,
    legacyLogin: async () => ({ ok: false }),
    token,
  };
}

describe("inventario corte", () => {
  it("la percha usa la columna F de la hoja y no resta las ventas viejas", async () => {
    const db = new MemoryDb({
      tickets: [{
        timestamp: "2026-10-01T15:00:00.000Z", atendido_por: "Andrea", id_3: "0101",
        ht_004: 20, ht_006: 30, ht_013: 11, as_001: 9, orig: {},
      }],
      inventario_base: [{ sku: "HT-004", stock_inicial: 0, minimo: 3 }],
      inventario_entradas: [{ sku: "SUNSU-HT-004", cant_recibida_llenar_aqui: 1, notas: "" }],
    });
    const c = ctx(db);
    const inv = await handle("getInventario", { token: c.token }, c) as Row;
    const por = (sku: string) => (inv.items as Row[]).find((r) => String(r.sku).endsWith(sku));
    assert.equal(por("HT-004")?.stock, 2);
    assert.equal(por("HT-006")?.stock, 0);
    assert.equal(por("HT-013")?.stock, 0);
    assert.equal(por("AS-001")?.stock, 4);
    const neg = (inv.items as Row[]).filter((r) => Number(r.stock) < 0);
    assert.equal(neg.length, 0);
    const ml = por("ML-013");
    assert.equal(ml?.stock, 0);
    assert.equal(ml?.hojaNegativa, true);
    assert.equal(ml?.apertura, -1);
    for (const [code, qty] of Object.entries(CORTE_VENTA)) {
      assert.equal(por(code)?.stock, qty < 0 ? 0 : qty, code);
    }
    (db.tables.get("tickets") as Row[]).push({
      timestamp: "2026-10-24T10:00:00.000Z", atendido_por: "Andrea", ht_004: 1, orig: {},
    });
    const luego = await handle("getInventario", { token: c.token }, c) as Row;
    assert.equal((luego.items as Row[]).find((r) => String(r.sku).endsWith("HT-004"))?.stock, 1);
    (db.tables.get("tickets") as Row[]).push({
      timestamp: "2026-10-24T11:00:00.000Z", atendido_por: "Andrea", ht_004: 50, orig: {},
    });
    const frenado = await handle("getInventario", { token: c.token }, c) as Row;
    const ht = (frenado.items as Row[]).find((r) => String(r.sku).endsWith("HT-004"));
    assert.equal(ht?.stock, 0);
    assert.equal(ht?.frenado, true);
    assert.equal(aplicarTrasCorte(2, [{ delta: -1, tipo: "ajuste" }]).saldo, 1);
    assert.equal(aplicarTrasCorte(2, [{ delta: -5, tipo: "ajuste" }]).saldo, -3);
  });
});

describe("permisos", () => {
  it("admin ve costos y la cosmetóloga no", () => {
    assert.equal(acceso("admin", "ver_costos"), "todos");
    assert.equal(acceso("super_admin", "compras"), "todos");
    assert.equal(acceso("cosmetologa", "ver_costos"), "no");
    assert.equal(acceso("gerente", "ver_costos"), "no");
    assert.equal(acceso("cosmetologa", "comisiones"), "propio");
    assert.equal(acceso("recepcion", "tickets"), "propio");
    assert.equal(acceso("cosmetologa", "permisos"), "no");
    assert.equal(acceso("super_admin", "permisos"), "todos");
    assert.equal(acceso("admin", "permisos"), "no");
    assert.equal(acceso("super_admin", "configuracion"), "todos");
    assert.equal(acceso("admin", "configuracion"), "todos");
    assert.equal(acceso("admin_master", "configuracion"), "todos");
    assert.equal(acceso("cosmetologa", "configuracion"), "no");
  });

  it("whoami de super_admin incluye Configuración general", async () => {
    const db = new MemoryDb();
    const c = ctx(db, "super_admin", "efch", "EFCH");
    const who = await handle("whoami", { token: c.token }, c) as Row;
    const mods = who.modulos as Row[];
    assert.equal(mods.find((m) => m.modulo === "configuracion")?.acceso, "todos");
    const vista = await handle("config_general", { token: c.token }, c) as Row;
    assert.equal(vista.ok, true);
    const cosm = ctx(new MemoryDb(), "cosmetologa", "andrea", "Andrea");
    const no = await handle("config_general", { token: cosm.token }, cosm) as Row;
    assert.equal(no.ok, undefined);
    assert.ok(no.error);
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    assert.match(beta, /id="com-ciclo"/);
    assert.match(beta, /value="Todas"/);
    assert.doesNotMatch(beta, /id="com-desde"/);
    assert.doesNotMatch(beta, /id="com-hasta"/);
    assert.match(beta, /route\.mod === "configuracion" && state\.admin/);
  });

  it("redacta costos, tickets ajenos y roles de pago ajenos", () => {
    const cat = redactar("getCatalogo", [{ sku: "HT-002", total: 20, compra: 8, precio_compra: 8, margen: 12 }], andrea);
    assert.deepEqual(cat, [{ sku: "HT-002", total: 20 }]);
    const hist = redactar("getHistorial", [
      { cosmetologa: "Andrea Robles", nombre: "Ana" },
      { cosmetologa: "Daniela Mora", nombre: "Luis" },
    ], andrea);
    assert.equal((hist as Row[]).length, 1);
    const roles = redactar("getRoles", { ok: true, data: { meses: [{ empleadas: [
      { nombre: "Andrea Robles", sueldo: 500, costoEmpresa: 80 },
      { nombre: "Daniela Mora", sueldo: 500 },
    ] }] } }, andrea);
    const emps = (((roles as Row).data as Row).meses as Row[])[0].empleadas as Row[];
    assert.equal(emps.length, 1);
    assert.equal(emps[0].nombre, "Andrea Robles");
    assert.equal(emps[0].costoEmpresa, undefined);
    assert.equal(emps[0].sueldo, 500);
    const ajeno = redactar("getRolIndividual", { ok: true, data: { nombre: "Daniela Mora", sueldo: 1 } }, andrea);
    assert.equal((ajeno as Row).error?.toString().includes("permiso"), true);
    assert.equal((redactar("getCatalogo", [{ compra: 1 }], admin) as Row[])[0].compra, 1);
    const tel = redactar("cli_list", { items: [{ nombre: "Ana", telefono: "099", email: "a@b.c" }] }, andrea) as Row;
    assert.equal(((tel.items as Row[])[0]).telefono, undefined);
    assert.equal(((tel.items as Row[])[0]).email, undefined);
    assert.equal(((tel.items as Row[])[0]).nombre, "Ana");
    const recep: SesLite = { rol: "recepcion", name: "Alejandra", short: "Alejandra", uid: "alejandra" };
    const telOk = redactar("cli_list", { items: [{ telefono: "099" }] }, recep) as Row;
    assert.equal(((telOk.items as Row[])[0]).telefono, "099");
  });

  it("solo reconoce a la propia persona", () => {
    assert.equal(esPropio("Andrea", andrea), true);
    assert.equal(esPropio("Daniela Mora", andrea), false);
  });

  it("bloqueo de PIN: 5 del usuario, 8 de la IP, y la fecha de bloqueo", () => {
    const ahora = Date.parse("2026-10-21T15:00:00Z");
    assert.equal(evaluarBloqueo({ intentosIp: 8, intentosUsuario: 0, bloqueadoHasta: null, ahora }).bloqueado, true);
    assert.equal(evaluarBloqueo({ intentosIp: 7, intentosUsuario: 4, bloqueadoHasta: null, ahora }).bloqueado, false);
    assert.equal(evaluarBloqueo({ intentosIp: 0, intentosUsuario: 5, bloqueadoHasta: null, ahora }).bloqueado, true);
    assert.equal(evaluarBloqueo({ intentosIp: 0, intentosUsuario: 0, bloqueadoHasta: "2026-10-21T15:10:00Z", ahora }).bloqueado, true);
  });

  it("el N de paquetes usa la bandera, no el rol", () => {
    const marks: CosmMark[] = [
      { id: "andrea", nombre: "Andrea", patron: "andrea%", es: true, activa: true },
      { id: "dejaneira", nombre: "Dejaneira", patron: "dejaneira%", es: false, activa: true },
      { id: "alejandra", nombre: "Alejandra", patron: "alejandra%", es: true, activa: true },
    ];
    assert.equal(nCosmetologas(marks, "2026-09-26", "2026-10-25"), 3);
  });

  it("comisión de producto 30% del margen y rol con año cumplido", () => {
    assert.equal(comisionProductos([{ venta: 20, compra: 8, qty: 2, excluido: false }]), 7.2);
    const nuevo = rolCalcular({
      sueldo: 480, bono: 0, fondoReserva: true, fechaIngreso: "2026-08-01", anio: 2026, mes: 10,
      comFaciales: 10, comExtras: 0, comRecepcion: 0, comProductos: 7.2, comPaquetes: 5, multas: 0,
    });
    assert.equal(nuevo.vacaciones, 0);
    assert.equal(nuevo.fondoReserva, 0);
    assert.equal(nuevo.comisiones, 22.2);
    const antigua = rolCalcular({
      sueldo: 480, bono: 0, fondoReserva: true, fechaIngreso: "2020-01-01", anio: 2026, mes: 10,
      comFaciales: 0, comExtras: 0, comRecepcion: 0, comProductos: 0, comPaquetes: 20, multas: 0,
    });
    assert.equal(antigua.vacaciones, 20);
    assert.equal(antigua.fondoReserva, 40);
    assert.ok(antigua.comisiones >= 20);
  });

  it("cotizar es por rol, no por nombre", () => {
    assert.equal(puedeCotizar("recepcion"), true);
    assert.equal(puedeCotizar("cosmetologa"), false);
    assert.equal(puedeCotizar("admin"), true);
  });
});

describe("erp", () => {
  it("no guarda un producto sin uso y rechaza bodega incompatible", async () => {
    const db = new MemoryDb(erpSeed());
    const malo = await runErp("prod_save", { sku: "X-1", nombre: "X" }, db, "Emi");
    assert.match(String(malo.error), /uso/i);
    assert.equal(usoCompatible("cabina", "venta"), false);
    const oc = await runErp("oc_save", {
      proveedor_id: SEED_IDS.prov,
      lineas: [{ producto_id: SEED_IDS.cabina, cantidad: 4, precio: 3 }],
    }, db, "Emi");
    const rec = await runErp("oc_recibir", {
      oc_id: oc.id, lineas: [{ oc_linea_id: (await db.all("erp_oc_lineas"))[0].id, bodega_id: BODEGA_VENTA, cantidad: 4 }],
    }, db, "Emi");
    assert.match(String(rec.error), /no puede ir a bodega/);
    const ok = await runErp("oc_recibir", {
      oc_id: oc.id, lineas: [{ oc_linea_id: (await db.all("erp_oc_lineas"))[0].id, bodega_id: BODEGA_CABINA, cantidad: 4 }],
    }, db, "Emi");
    assert.equal(ok.ok, true);
    const stock = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.cabina && r.bodega_id === BODEGA_CABINA);
    assert.equal(stock?.cantidad, 14);
    assert.equal((await db.all("erp_movimientos")).some((m) => m.tipo === "recepcion"), true);
  });

  it("ambos se reparte y la OC pasa de parcial a recibida y vuelve al deshacer", async () => {
    const db = new MemoryDb(erpSeed());
    const oc = await runErp("oc_save", {
      proveedor_id: SEED_IDS.prov,
      lineas: [{ producto_id: SEED_IDS.ambos, cantidad: 10, precio: 5 }],
    }, db, "Emi");
    const lid = (await db.all("erp_oc_lineas"))[0].id;
    const p1 = await runErp("oc_recibir", { oc_id: oc.id, lineas: [
      { oc_linea_id: lid, bodega_id: BODEGA_VENTA, cantidad: 6 },
      { oc_linea_id: lid, bodega_id: BODEGA_CABINA, cantidad: 0 },
    ] }, db, "Emi");
    assert.equal(p1.estado, "parcial");
    const v = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.ambos && r.bodega_id === BODEGA_VENTA);
    assert.equal(v?.cantidad, 10);
    const recId = (await db.all("erp_recepciones"))[0].id;
    const p2 = await runErp("oc_recibir", { oc_id: oc.id, lineas: [{ oc_linea_id: lid, bodega_id: BODEGA_CABINA, cantidad: 4 }] }, db, "Emi");
    assert.equal(p2.estado, "recibida");
    const c = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.ambos && r.bodega_id === BODEGA_CABINA);
    assert.equal(c?.cantidad, 4);
    await runErp("oc_recibir_undo", { recepcion_id: recId }, db, "Emi");
    const oc2 = (await db.all("erp_oc")).find((r) => r.id === oc.id);
    assert.equal(oc2?.estado, "parcial");
    assert.ok((await db.all("erp_movimientos")).some((m) => m.tipo === "anulacion"));
    assert.equal((await db.all("erp_movimientos")).filter((m) => m.tipo === "recepcion").length >= 1, true);
  });

  it("transferencia, ticket idempotente, receta y anulación", async () => {
    const db = new MemoryDb(erpSeed());
    const tr = await runErp("trf_enviar", {
      origen_id: BODEGA_VENTA, destino_id: BODEGA_CABINA,
      lineas: [{ producto_id: SEED_IDS.ambos, cantidad: 2 }],
    }, db, "Emi");
    assert.equal(tr.ok, true);
    await runErp("trf_recibir", { id: tr.id }, db, "Emi");
    const origen = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.ambos && r.bodega_id === BODEGA_VENTA);
    const destino = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.ambos && r.bodega_id === BODEGA_CABINA);
    assert.equal(origen?.cantidad, 2);
    assert.equal(destino?.cantidad, 2);

    const venta = await runErp("ov_save", {
      ticket_ref: "TK-1", nombre: "María",
      lineas: [{ sku: "HT-002", cantidad: 1, precio: 20, clase: "producto" }],
    }, db, "Andrea");
    assert.equal(venta.ok, true);
    assert.equal(venta.numero, "OV-0001");
    const tk1 = (await db.all("tickets")).find((t) => (t.orig as Row)?.ticket_ref === "TK-1");
    assert.equal(tk1?.origin, "beta");
    assert.equal(tk1?.sheet_row ?? null, null);
    assert.match(String(tk1?.beta_num), /^TK-\d{8}-900001$/);
    assert.equal(tk1?.atendido_por, "Andrea");
    assert.equal(tk1?.ht_002, 1);
    assert.equal(tk1?.estimado, 23);
    assert.equal(tk1?.nombre, "María");
    const otra = await runErp("ov_save", { ticket_ref: "TK-1", lineas: [{ sku: "HT-002", cantidad: 1 }] }, db, "Andrea");
    assert.equal(otra.sinCambios, true);
    assert.equal((await db.all("tickets")).filter((t) => (t.orig as Row)?.ticket_ref === "TK-1").length, 1);
    const ht = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta);
    assert.equal(ht?.cantidad, 4);

    const srv = await runErp("ov_save", {
      ticket_ref: "TK-2",
      lineas: [{ sku: "SUNSU-01", cantidad: 1, precio: 30, clase: "servicio" }],
    }, db, "Andrea");
    assert.equal(srv.ok, true);
    const amp = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.cabina && r.bodega_id === BODEGA_CABINA);
    assert.equal(amp?.cantidad, 8);
    const tk2 = (await db.all("tickets")).find((t) => (t.orig as Row)?.ticket_ref === "TK-2");
    assert.equal(tk2?.facial_hecho, "SUNSU-01");
    await runErp("ov_anular", { ticket_ref: "TK-2" }, db, "Andrea");
    const amp2 = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.cabina && r.bodega_id === BODEGA_CABINA);
    assert.equal(amp2?.cantidad, 10);
    const anulado = (await db.all("tickets")).find((t) => (t.orig as Row)?.ticket_ref === "TK-2");
    assert.equal(anulado?.atendido_por, "");
    assert.equal((anulado?.orig as Row)?.anulado, true);
  });

  it("pago_save y oc_devolver mueven saldo y stock", async () => {
    const db = new MemoryDb(erpSeed());
    const oc = await runErp("oc_save", {
      proveedor_id: SEED_IDS.prov,
      lineas: [{ producto_id: SEED_IDS.cabina, cantidad: 4, precio: 3 }],
    }, db, "Emi");
    const lid = (await db.all("erp_oc_lineas"))[0].id;
    await runErp("oc_recibir", { oc_id: oc.id, lineas: [{ oc_linea_id: lid, bodega_id: BODEGA_CABINA, cantidad: 4 }] }, db, "Emi");
    const pago = await runErp("pago_save", { oc_id: oc.id, monto: 6 }, db, "Emi");
    assert.equal(pago.estado_pago, "parcial");
    const full = await runErp("pago_save", { oc_id: oc.id, monto: (await db.all("erp_oc")).find((r) => r.id === oc.id)?.saldo }, db, "Emi");
    assert.equal(full.estado_pago, "pagada");
    assert.equal(full.saldo, 0);
    const dev = await runErp("oc_devolver", { oc_id: oc.id, lineas: [{ oc_linea_id: lid, bodega_id: BODEGA_CABINA, cantidad: 2 }] }, db, "Emi");
    assert.equal(dev.estado, "parcial");
    const stock = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.cabina && r.bodega_id === BODEGA_CABINA);
    assert.equal(stock?.cantidad, 12);
    assert.equal((await db.all("erp_movimientos")).some((m) => m.tipo === "devolucion"), true);
    const deMas = await runErp("oc_devolver", { oc_id: oc.id, lineas: [{ oc_linea_id: lid, cantidad: 9, bodega_id: BODEGA_CABINA }] }, db, "Emi");
    assert.match(String(deMas.error), /recibido/);
  });

  it("el negativo pide aprobación y el conteo ajusta", async () => {
    const db = new MemoryDb(erpSeed());
    await assert.rejects(() => runErp("ov_save", {
      ticket_ref: "TK-9", lineas: [{ sku: "HT-002", cantidad: 9, precio: 20 }],
    }, db, "Andrea"), (e: unknown) => e instanceof ErpError && e.requiere);
    assert.equal((await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta)?.cantidad, 5);
    const si = await runErp("ov_save", {
      ticket_ref: "TK-9", aprobar_negativo: true, lineas: [{ sku: "HT-002", cantidad: 9, precio: 20 }],
    }, db, "Andrea");
    assert.equal(si.ok, true);
    const mov = (await db.all("erp_movimientos")).find((m) => m.ticket_ref === "TK-9");
    assert.equal(mov?.aprobado_negativo_por, "Andrea");
    const abierto = await runErp("conteo_abrir", { bodega_id: BODEGA_VENTA }, db, "Emi");
    const linea = (await db.all("erp_conteo_lineas")).find((r) => r.producto_id === SEED_IDS.venta);
    await runErp("conteo_guardar", { conteo_id: abierto.id, lineas: [{ producto_id: SEED_IDS.venta, contado: 1, lote: "" }] }, db, "Emi");
    await runErp("conteo_aplicar", { conteo_id: abierto.id }, db, "Emi");
    assert.equal((await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta)?.cantidad, 1);
    assert.equal(linea && n(linea.sistema) < 0, true);
  });

  it("la OV sigue al pedido importado y el ticket beta no ocupa sheet_row", async () => {
    assert.equal(siguienteOv([]), "OV-0001");
    assert.equal(siguienteOv([{ numero: "TK-ROW-80" }]), "OV-0081");
    assert.equal(siguienteOv([{ numero: "OV-0003" }, { numero: "TK-ROW-80" }]), "OV-0081");
    assert.equal(siguienteOv([{ numero: "TK-80" }]), "OV-0081");
    assert.equal(siguienteOv([
      { numero: "TK-ROW-1642" },
      { numero: "TK-20261021-900001" },
      { numero: "OV-0001" },
    ]), "OV-1643");
    assert.equal(siguienteOv([
      { numero: "OV-1643" },
      { numero: "TK-ROW-1642", ticket_sheet_row: 1642 },
    ]), "OV-1644");
    assert.equal(siguienteOv([{ numero: "legacy", ticket_sheet_row: 1642 }]), "OV-1643");
    const seed = erpSeed();
    seed.tickets = [{ sheet_row: 5, origin: "sheet", nombre: "Hoja", orig: {}, atendido_por: "X", timestamp: "2026-10-01T00:00:00Z" }];
    seed.erp_ordenes_venta = [{ id: "ov-imp", numero: "TK-ROW-80", ticket_ref: "TK-ROW-80", estado: "despachada" }];
    const db = new MemoryDb(seed);
    const venta = await runErp("ov_save", {
      nombre: "María",
      lineas: [{ sku: "HT-002", cantidad: 1, precio: 20, clase: "producto" }],
    }, db, "Andrea");
    assert.equal(venta.numero, "OV-0081");
    const tk = (await db.all("tickets")).find((t) => t.origin === "beta");
    assert.equal(tk?.sheet_row ?? null, null);
    assert.match(String(tk?.beta_num), /^TK-/);
    assert.equal((tk?.orig as Row)?.fuente, "ov_save");
    assert.equal((await db.all("tickets")).find((t) => t.sheet_row === 5)?.nombre, "Hoja");
    const otra = await runErp("ov_save", {
      nombre: "Ana", numero: "OV-0001",
      lineas: [{ sku: "HT-002", cantidad: 1, precio: 20 }],
    }, db, "Andrea");
    assert.equal(otra.numero, "OV-0082");
  });

  it("erp_tx no escribe otra vez en local y un NEGATIVO no cae al plan partido", async () => {
    const seed = erpSeed();
    seed.erp_ordenes_venta = [{ id: "ov-imp", numero: "TK-ROW-80", ticket_ref: "TK-ROW-80", estado: "despachada" }];
    const db = new MemoryDb(seed);
    let calls = 0;
    db.rpcImpl = async (name, args) => {
      if (name !== "erp_tx") return null;
      calls++;
      const steps = args.p_steps as Row[];
      const tk = steps.find((s) => s.op === "upsert" && s.table === "tickets");
      assert.equal((tk?.row as Row)?.origin, "beta");
      assert.equal((tk?.row as Row)?.sheet_row ?? null, null);
      assert.equal(args.p_op, "ov_save");
      return { ok: true, numero: "OV-0099" };
    };
    const venta = await runErp("ov_save", {
      lineas: [{ sku: "HT-002", cantidad: 1, precio: 20 }],
    }, db, "Andrea");
    assert.equal(calls, 1);
    assert.equal(venta.numero, "OV-0099");
    assert.equal(db.writes.length, 0);
    assert.equal((await db.all("erp_ordenes_venta")).length, 1);

    db.rpcImpl = async (name) => {
      if (name === "erp_tx") throw new Error('rpc erp_tx 400 NEGATIVO {"sku":"HT-002","producto":"Crema retail","bodega":"Venta","hay":0,"piden":1,"queda":-1}');
      return null;
    };
    await assert.rejects(() => runErp("ov_save", {
      lineas: [{ sku: "HT-002", cantidad: 1, precio: 20 }],
    }, db, "Andrea"), (e: unknown) => e instanceof ErpError && (e as ErpError).requiere);
    assert.equal(db.writes.length, 0);
    assert.equal((await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta)?.cantidad, 5);
  });

  it("sin erp_tx el plan local sigue, y un corte a mitad no deja stock ni ticket", async () => {
    const db = new MemoryDb(erpSeed());
    db.rpcImpl = async (name) => {
      if (name === "erp_tx") throw new Error("rpc erp_tx 404 Could not find the function public.erp_tx in the schema cache");
      return null;
    };
    const venta = await runErp("ov_save", {
      ticket_ref: "TK-LOCAL",
      lineas: [{ sku: "HT-002", cantidad: 1, precio: 20 }],
    }, db, "Andrea");
    assert.equal(venta.ok, true);
    assert.equal((await db.all("tickets")).some((t) => t.origin === "beta" && (t.sheet_row ?? null) === null), true);

    const db2 = new MemoryDb(erpSeed());
    db2.failAfterWrites = 1;
    const stock = await db2.all("erp_stock");
    await assert.rejects(() => runErp("ov_save", {
      lineas: [{ sku: "HT-002", cantidad: 1, precio: 20 }],
    }, db2, "Andrea"));
    assert.deepEqual(await db2.all("erp_stock"), stock);
    assert.equal((await db2.all("tickets")).length, 0);
    assert.equal((await db2.all("erp_ordenes_venta")).length, 0);
    assert.equal(db2.writes.length, 0);
  });

  it("oc_recibir y pago_save se aplican una vez dentro de erp_tx", async () => {
    const db = new MemoryDb(erpSeed());
    const ops: string[] = [];
    db.rpcImpl = async (name, args) => {
      if (name !== "erp_tx") return null;
      ops.push(String(args.p_op));
      const steps = Array.isArray(args.p_steps) ? args.p_steps as Parameters<typeof applyPlan>[2] : [];
      await applyPlan(db, "erp_tx", steps, String(args.p_now || new Date().toISOString()), "");
      return { ok: true };
    };
    const oc = await runErp("oc_save", {
      proveedor_id: SEED_IDS.prov,
      lineas: [{ producto_id: SEED_IDS.cabina, cantidad: 2, precio: 3 }],
    }, db, "Emi");
    const lid = (await db.all("erp_oc_lineas"))[0].id;
    const rec = await runErp("oc_recibir", {
      oc_id: oc.id, lineas: [{ oc_linea_id: lid, bodega_id: BODEGA_CABINA, cantidad: 2 }],
    }, db, "Emi");
    assert.equal(rec.ok, true);
    assert.equal(rec.estado, "recibida");
    const pago = await runErp("pago_save", { oc_id: oc.id, monto: 1 }, db, "Emi");
    assert.equal(pago.estado_pago, "parcial");
    assert.equal(pago.pagado, 1);
    assert.deepEqual(ops, ["oc_recibir", "pago_save"]);
    const movs = (await db.all("erp_movimientos")).filter((m) => m.tipo === "recepcion");
    assert.equal(movs.length, 1);
    assert.equal(movs[0]?.delta, 2);
    const guardada = (await db.all("erp_oc")).find((r) => r.id === oc.id);
    assert.equal(guardada?.estado, "recibida");
    assert.equal(guardada?.pagado, 1);
    assert.equal(guardada?.saldo, 5.9);
    assert.equal(guardada?.estado_pago, "parcial");
    assert.equal((await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.cabina)?.cantidad, 12);
    assert.equal((await db.all("erp_recepciones")).length, 1);
  });

  it("reimportar la hoja no borra el ticket beta", async () => {
    const db = new MemoryDb({
      tickets: [
        { id: 1, sheet_row: 5, origin: "sheet", nombre: "Hoja", orig: {}, timestamp: "2026-10-01T00:00:00Z", atendido_por: "Andrea" },
        { id: 2, sheet_row: null, origin: "beta", beta_num: "TK-20261021-900001", nombre: "Beta", orig: { beta: true, fuente: "ov_save" }, timestamp: "2026-10-21T15:00:00Z", atendido_por: "Andrea" },
        { id: 4, sheet_row: null, origin: "sheet", nombre: "Sin fila", orig: {}, timestamp: "2026-10-03T00:00:00Z", atendido_por: "Andrea" },
        { id: 5, sheet_row: 9, origin: "beta", beta_num: "TK-20261021-900002", nombre: "Beta con fila", orig: { beta: true }, timestamp: "2026-10-04T00:00:00Z", atendido_por: "Andrea" },
      ],
    });
    const out = await reimportarTickets(db, "import", [
      { sheet_row: 5, nombre: "Hoja nueva", orig: {}, timestamp: "2026-10-01T00:00:00Z", atendido_por: "Andrea" },
      { sheet_row: 6, nombre: "Nueva", orig: {}, timestamp: "2026-10-02T00:00:00Z", atendido_por: "Andrea" },
    ]);
    assert.equal(out.conservadas, 2);
    const rows = await db.all("tickets");
    const beta = rows.find((t) => t.beta_num === "TK-20261021-900001");
    assert.equal(beta?.nombre, "Beta");
    assert.equal(beta?.sheet_row ?? null, null);
    assert.equal(rows.find((t) => t.nombre === "Sin fila")?.origin, "sheet");
    assert.equal(rows.find((t) => t.nombre === "Beta con fila")?.sheet_row, 9);
    assert.equal(rows.find((t) => Number(t.sheet_row) === 5)?.nombre, "Hoja nueva");
    assert.equal(rows.find((t) => Number(t.sheet_row) === 5)?.origin, "sheet");
    assert.equal(rows.find((t) => Number(t.sheet_row) === 6)?.origin, "sheet");
    assert.equal(rows.filter((t) => t.origin === "beta").length, 2);
  });
});

describe("lugares, conteo y transferencias", () => {
  it("el saldo de venta y cabina se queda, y casa arranca vacía", async () => {
    const db = new MemoryDb(erpSeed());
    const lista = await runErp("lugares_list", {}, db, "Emi");
    assert.equal((lista.locales as Row[])[0].nombre, "La Esquina");
    assert.equal((lista.lugares as Row[]).some((b) => b.nombre === "Cabina 1"), true);
    assert.equal((lista.lugares as Row[]).some((b) => b.nombre === "Cabina 3"), true);
    assert.equal((await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta && r.bodega_id === BODEGA_VENTA)?.cantidad, 5);
    assert.equal((await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.cabina && r.bodega_id === BODEGA_CABINA)?.cantidad, 10);
    assert.equal((await db.all("erp_stock")).some((r) => r.bodega_id === BODEGA_CASA), false);
    assert.equal(usoCompatible("venta", "casa"), true);
    assert.equal(puedeTransferir("cosmetologa", { id: BODEGA_CASA, tipo: "casa" }, { id: BODEGA_VENTA, tipo: "venta", local_id: LOCAL_ESQUINA }), "Solo un admin mueve stock con Casa");
    assert.equal(puedeTransferir("cosmetologa", { id: BODEGA_VENTA, tipo: "venta", local_id: LOCAL_ESQUINA }, { id: BODEGA_CABINA, tipo: "cabina", local_id: LOCAL_ESQUINA }), null);
  });

  it("el conteo mueve solo lo contado y deja el ajuste en el kardex", async () => {
    const db = new MemoryDb(erpSeed());
    const abierto = await runErp("conteo_abrir", { bodega_id: BODEGA_VENTA, nota: "inicio" }, db, "Emi");
    await runErp("conteo_guardar", { conteo_id: abierto.id, lineas: [{ producto_id: SEED_IDS.venta, contado: 3, lote: "" }] }, db, "Emi");
    const antesAmbos = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.ambos && r.bodega_id === BODEGA_VENTA)?.cantidad;
    const apl = await runErp("conteo_aplicar", { conteo_id: abierto.id }, db, "Emi");
    assert.match(String(apl.numero), /^AJU-/);
    assert.equal((await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta && r.bodega_id === BODEGA_VENTA)?.cantidad, 3);
    assert.equal((await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.ambos && r.bodega_id === BODEGA_VENTA)?.cantidad, antesAmbos);
    assert.equal((await db.all("erp_movimientos")).some((m) => m.tipo === "conteo" && m.bodega_id === BODEGA_VENTA), true);
    assert.equal((await db.all("erp_ajustes")).length, 1);
  });

  it("la cosmetóloga pasa venta a cabina y la consignación entra a la quincena", async () => {
    const db = new MemoryDb(erpSeed());
    await runErp("prod_save", { sku: "HT-090", nombre: "Sérum consigna", uso: "ambos", costo_promedio: 8, precio_venta: 20 }, db, "Emi");
    const prod = (await db.all("erp_productos")).find((r) => r.sku === "HT-090");
    const oc = await runErp("oc_save", { proveedor_id: SEED_IDS.prov, lineas: [{ producto_id: prod?.id, cantidad: 4, precio: 8 }] }, db, "Emi");
    const lid = (await db.all("erp_oc_lineas"))[0].id;
    await runErp("oc_recibir", { oc_id: oc.id, lineas: [{ oc_linea_id: lid, bodega_id: BODEGA_VENTA, cantidad: 4 }] }, db, "Emi");
    const no = await runErp("trf_enviar", {
      inmediata: true, _rol: "cosmetologa", origen_id: BODEGA_CASA, destino_id: BODEGA_VENTA,
      lineas: [{ producto_id: prod?.id, cantidad: 1 }],
    }, db, "Andrea");
    assert.match(String(no.error), /admin/i);
    const si = await runErp("trf_enviar", {
      inmediata: true, _rol: "cosmetologa", origen_id: BODEGA_VENTA, destino_id: BODEGA_CABINA,
      lineas: [{ producto_id: prod?.id, cantidad: 2 }],
    }, db, "Andrea");
    assert.equal(si.ok, true);
    assert.equal(si.consumo, true);
    assert.equal((await db.all("erp_stock")).find((r) => r.producto_id === prod?.id && r.bodega_id === BODEGA_VENTA)?.cantidad, 2);
    assert.equal((await db.all("erp_stock")).find((r) => r.producto_id === prod?.id && r.bodega_id === BODEGA_CABINA)?.cantidad, 2);
    const cons = (await db.all("erp_consignacion_consumo"))[0];
    assert.equal(cons.familia, "HT");
    assert.equal(cons.cantidad, 2);
    assert.equal(cons.costo_unit, 8);
    const prov = (await db.all("erp_proveedores"))[0];
    await db.write("Emi", "erp_proveedores", "update", { id: prov.id }, { nombre: "Hebetronic" });
    const per = await (await import("./ventas.ts")).borradorConsig(db, new Date("2026-10-21T15:00:00Z"), { proveedor_id: prov.id });
    const fila = (per.fact as Row[]).find((r) => r.sku === "HT-090");
    assert.equal(fila?.consumido, 2);
    assert.equal(fila?.subtotal, 16);
    const otro = await runErp("lugar_guardar", { _rol: "admin", tipo: "local", nombre: "Norte", direccion: "Otra plaza" }, db, "Emi");
    assert.equal(otro.ok, true);
    const cab = await runErp("lugar_guardar", { _rol: "admin", tipo: "cabina", nombre: "Cabina 4", local_id: otro.id }, db, "Emi");
    assert.equal(cab.ok, true);
    const cosm = await runErp("lugar_guardar", { _rol: "cosmetologa", tipo: "cabina", nombre: "Cabina 5", local_id: LOCAL_ESQUINA }, db, "Andrea");
    assert.match(String(cosm.error), /admin/i);
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0017_lugares.sql", import.meta.url), "utf8");
    assert.match(sql, /La Esquina/);
    assert.match(sql, /Cabina 1/);
    assert.equal(sql.includes("update public.erp_stock"), false);
  });

  it("SU, VK y BV no entran a la consignación de cabina y Compras sigue buscándolos", async () => {
    const { familiaConsignacion, familiaSku, codigoFamilia } = await import("./ventas.ts");
    const { skusProveedor } = await import("./compras_flujo.ts");
    assert.equal(familiaSku("SU-001"), "SU");
    assert.equal(familiaSku("VK-010"), "VK");
    assert.equal(familiaSku("BV-002"), "BV");
    assert.equal(familiaConsignacion("SU-001"), "");
    assert.equal(familiaConsignacion("VK-010"), "");
    assert.equal(familiaConsignacion("BV-002"), "");
    assert.equal(familiaConsignacion("HT-091"), "HT");
    assert.equal(familiaConsignacion("AS-003"), "AS");
    assert.equal(familiaConsignacion("ML-004"), "ML");
    assert.equal(familiaConsignacion("PH-005"), "PH");
    assert.equal(familiaConsignacion("JN-006"), "JN");
    assert.equal(codigoFamilia("SU"), "SU");
    assert.equal(codigoFamilia("VK"), "VK");

    const db = new MemoryDb(erpSeed());
    const skus = ["HT-091", "AS-003", "ML-004", "PH-005", "JN-006", "BV-002", "SU-001", "VK-010"];
    for (const sku of skus) {
      const saved = await runErp("prod_save", { sku, nombre: sku, uso: "ambos", costo_promedio: 4, precio_venta: 10 }, db, "Emi");
      assert.equal(saved.ok, true, String(saved.error));
    }
    const prods = await db.all("erp_productos");
    const idDe = (sku: string) => prods.find((r) => r.sku === sku)?.id;
    for (const sku of skus) {
      const oc = await runErp("oc_save", { proveedor_id: SEED_IDS.prov, lineas: [{ producto_id: idDe(sku), cantidad: 2, precio: 4 }] }, db, "Emi");
      const lid = (await db.all("erp_oc_lineas")).find((r) => r.oc_id === oc.id)?.id;
      const rec = await runErp("oc_recibir", { oc_id: oc.id, lineas: [{ oc_linea_id: lid, bodega_id: BODEGA_VENTA, cantidad: 2 }] }, db, "Emi");
      assert.equal(rec.ok, true, String(rec.error));
    }
    const fuera = await runErp("trf_enviar", {
      inmediata: true, _rol: "admin", origen_id: BODEGA_VENTA, destino_id: BODEGA_CABINA,
      lineas: ["BV-002", "SU-001", "VK-010"].map((sku) => ({ producto_id: idDe(sku), cantidad: 1 })),
    }, db, "Emi");
    assert.equal(fuera.ok, true, String(fuera.error));
    assert.equal(fuera.consumo, false);
    assert.equal((await db.all("erp_consignacion_consumo")).length, 0);
    const envio = await runErp("trf_enviar", {
      _rol: "admin", origen_id: BODEGA_VENTA, destino_id: BODEGA_CABINA,
      lineas: [{ producto_id: idDe("SU-001"), cantidad: 1 }],
    }, db, "Emi");
    assert.equal(envio.ok, true, String(envio.error));
    const recibido = await runErp("trf_recibir", { id: envio.id }, db, "Emi");
    assert.equal(recibido.ok, true, String(recibido.error));
    assert.equal((await db.all("erp_consignacion_consumo")).length, 0);
    for (const sku of ["HT-091", "AS-003", "ML-004", "PH-005", "JN-006"]) {
      const si = await runErp("trf_enviar", {
        inmediata: true, _rol: "admin", origen_id: BODEGA_VENTA, destino_id: BODEGA_CABINA,
        lineas: [{ producto_id: idDe(sku), cantidad: 1 }],
      }, db, "Emi");
      assert.equal(si.ok, true, String(si.error));
      assert.equal(si.consumo, true);
    }
    const familias = (await db.all("erp_consignacion_consumo")).map((r) => r.familia).sort();
    assert.deepEqual(familias, ["AS", "HT", "JN", "ML", "PH"]);
    const catalogo = await db.all("erp_productos");
    assert.equal(skusProveedor({ nombre: "Sunsu", familia: "SU" }, catalogo).some((p) => p.sku === "SU-001"), true);
    assert.equal(skusProveedor({ nombre: "Vika", familia: "VK" }, catalogo).some((p) => p.sku === "VK-010"), true);
    assert.equal(skusProveedor({ nombre: "Vassari", familia: "BV" }, catalogo).some((p) => p.sku === "BV-002"), true);
    assert.equal(skusProveedor({ nombre: "Sunsu", familia: "SU" }, catalogo).some((p) => p.sku === "HT-091"), false);
  });
});

describe("sql erp", () => {
  it("0010b deja escribir el kardex y 0011 guarda la transacción", () => {
    const kardex = readFileSync(new URL("../../../migrations/0010b_app_write_kardex.sql", import.meta.url), "utf8");
    const tx = readFileSync(new URL("../../../docs/supabase/pending/0011_erp_tx.sql", import.meta.url), "utf8");
    assert.match(kardex, /'erp_movimientos'/);
    assert.match(kardex, /El kardex no se borra/);
    assert.match(tx, /origin/);
    assert.match(tx, /beta_num/);
    assert.match(tx, /tickets_conservar_beta/);
    assert.match(tx, /tickets_reimportar/);
    assert.match(tx, /function public\.erp_tx/);
    assert.match(tx, /pg_advisory_xact_lock/);
    assert.match(tx, /v_lote text/);
    assert.match(tx, /s\.lote = v_lote/);
    assert.equal(/\blote text\b/.test(tx), false);
    assert.match(tx, /sheet_row is not null/);
    assert.match(tx, /\^TK-ROW-/);
    assert.equal(/select\s+public\.erp_importar_legado/i.test(tx), false);
    assert.equal(/select\s+public\.audit_attach_all/i.test(tx), false);
  });
});

function n(v: unknown): number { return Number(v) || 0; }

describe("api", () => {
  it("la cosmetóloga no abre compras y el actor queda en la escritura", async () => {
    const db = new MemoryDb(erpSeed());
    const c = ctx(db, "cosmetologa", "andrea", "Andrea Robles");
    const no = await handle("oc_save", { token: c.token, proveedor_id: "x", lineas: [] }, c);
    assert.match(String((no as Row).error), /permiso/i);
    const si = ctx(db, "admin", "emi", "Emi");
    db.tables.set("sesiones", [
      ...(db.tables.get("sesiones") || []),
      { token: si.token, uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
    ]);
    const prod = await handle("prod_save", { token: si.token, sku: "ZZ-001", nombre: "Nuevo", uso: "venta", precio_venta: 10 }, si);
    assert.equal((prod as Row).ok, true);
    assert.equal(db.writes.some((w) => w.actor.includes("Emi") && w.table === "erp_productos"), true);
  });

  it("el dashboard separa hoy, semana y mes con las cifras del Apps Script", async () => {
    const db = new MemoryDb({
      catalogo: [
        { sheet_row: 3, sku: "SUNSU-01", producto_servicio: "Facial S.O.S", subtotal: 0, total_con_iva: 46, precio_compra: "1" },
        { sheet_row: 4, sku: "SUNSU-17", producto_servicio: "Paquete Glow", subtotal: 80, total_con_iva: 92 },
        { sheet_row: 5, sku: "SUNSU-15", producto_servicio: "Ampolla PDRN", subtotal: 12, total_con_iva: 13.8 },
        { sheet_row: 6, sku: "HT-002", producto_servicio: "Niacinamida", subtotal: 0, total_con_iva: 11.5, precio_compra: "4" },
        { sheet_row: 7, sku: "HT-003", producto_servicio: "Tónico", subtotal: 5, total_con_iva: 5.75, precio_compra: "2" },
      ],
      inventario_base: [{ sku: "HT-002", compra: 6, stock_inicial: 0, minimo: 0 }],
      tickets: [
        {
          sheet_row: 2, timestamp: "2026-10-21T15:00:00Z", atendido_por: "Andrea", id_3: "1", nombre: "Ana",
          estimado: 115, facial_hecho: "SUNSU-01 Facial S.O.S", compra_pack_3: "SUNSU-17 Paquete Glow",
          servicios_adicionales: "SUNSU-15 Ampolla PDRN | SUNSU-12 X [CORTESIA: cumple]",
          ht_002: 2, ht_003: "1", comp: "Efectivo", orig: {},
        },
        {
          sheet_row: 3, timestamp: "2026-10-21T16:00:00Z", atendido_por: "Andrea", id_3: "2", nombre: "Luz",
          estimado: 25, facial_hecho: "SUNSU-02 Hidra", paquete: "SI · pack", comp: "Transferencia", orig: {},
        },
        {
          sheet_row: 4, timestamp: "2026-10-21T17:00:00Z", atendido_por: "Andrea", id_3: "4", nombre: "Paz",
          estimado: 0, facial_hecho: "SUNSU-03", orig: {},
        },
        { sheet_row: 5, timestamp: "2026-10-21T18:00:00Z", atendido_por: "Andrea", id_3: "5", estimado: 5, facial_hecho: "-", comp: "", orig: {} },
        { sheet_row: 6, timestamp: "2026-10-21T19:00:00Z", atendido_por: "Andrea", id_3: "6", estimado: 8, facial_hecho: "—", comp: "Tarjeta", orig: {} },
        { sheet_row: 7, timestamp: "2026-10-21T20:00:00Z", atendido_por: "SUNSU", id_3: "3", estimado: 99, orig: {} },
        { sheet_row: 8, timestamp: "2026-10-01T15:00:00Z", atendido_por: "Andrea", id_3: "8", estimado: 40, orig: {} },
      ],
      gift_cards: [
        { sheet_row: 3, codigo_gc: "GC1", dia: 21, mes: 10, ano: 2026, nombre_comprador: "Maria", apellido_comprador: "Perez", valor: "50" },
        { sheet_row: 4, codigo_gc: "GC2", dia: 21, mes: 10, ano: 26, nombre_comprador: "", cedula_comprador: "010", apellido_comprador: "30", valor: "Gift Card" },
        { sheet_row: 5, codigo_gc: "GC3", dia: 21, mes: 10, ano: "", nombre_comprador: "Ana", apellido_comprador: "", valor: "Gift Card" },
        { sheet_row: 6, codigo_gc: "GC4", dia: 20, mes: 10, ano: 2026, nombre_comprador: "Ayer", valor: "80" },
        { sheet_row: 7, codigo_gc: "", dia: 21, mes: 10, ano: 2026, nombre_comprador: "Vacio", valor: "10" },
        { sheet_row: 8, codigo_gc: "GC6", dia: 21, mes: 10, ano: 2025, nombre_comprador: "Vieja", valor: "40" },
      ],
      caja_chica: [
        { sheet_row: 2, tipo: "⚖️ SALDO INICIAL", entrada: 100, salida: 0, saldo: 100 },
        { sheet_row: 3, tipo: "GASTO", entrada: 0, salida: 20, saldo: 999 },
        { sheet_row: 4, tipo: "⚖️ SALDO INICIAL", entrada: 50, salida: 0, saldo: 50 },
        { sheet_row: 5, tipo: "GASTO", entrada: 0, salida: 5, saldo: 1 },
      ],
    });
    const c = ctx(db, "admin", "emi", "Emi");
    let red = false;
    c.fetchImpl = async () => { red = true; throw new Error("no red"); };
    const dash = await handle("getDashboardHoy", { token: c.token }, c) as Row;
    const hoy = dash.hoy as Row;
    const semana = dash.semana as Row;
    const mes = dash.mes as Row;
    const pagos = hoy.pagos as Row;
    assert.equal(red, false);
    assert.equal(hoy.tickets, 6);
    assert.equal(hoy.venta, 252);
    assert.equal(hoy.faciales, 3);
    assert.equal(hoy.valFac, 40);
    assert.equal(hoy.facCanjes, 2);
    assert.equal(hoy.paquetes, 1);
    assert.equal(hoy.valPaq, 80);
    assert.equal(hoy.productosN, 3);
    assert.equal(hoy.valProd, 25);
    assert.equal(hoy.costoProd, 14);
    assert.equal(hoy.extrasN, 2);
    assert.equal(hoy.valExtras, 12);
    assert.equal(hoy.extrasCort, 1);
    assert.equal(hoy.canjes, 1);
    assert.equal(pagos.efectivo, 115);
    assert.equal(pagos.transferencia, 25);
    assert.equal(pagos.tarjeta, 8);
    assert.equal(pagos.otros, 104);
    assert.deepEqual(hoy.topFac, [
      { nombre: "SUNSU-01 Facial S.O.S", n: 1 },
      { nombre: "SUNSU-02 Hidra", n: 1 },
      { nombre: "SUNSU-03", n: 1 },
    ]);
    assert.deepEqual(hoy.topProd, [
      { nombre: "Niacinamida", n: 2 },
      { nombre: "Tónico", n: 1 },
    ]);
    assert.deepEqual(dash.paqChips, [{ nombre: "Paquete Glow · Ana", n: 1 }]);
    assert.equal(dash.gcHoy, 3);
    assert.equal(dash.gcVal, 80);
    assert.deepEqual(dash.gcChips, [
      { nombre: "Maria · $50", n: 1 },
      { nombre: "010 · $30", n: 1 },
      { nombre: "Ana", n: 1 },
    ]);
    assert.equal(dash.citasHoy, 0);
    assert.equal(dash.caja, 45);
    assert.equal(semana.total, 252);
    assert.equal((semana.dias as Row[]).length, 7);
    assert.equal((semana.dias as Row[])[2].k, "2026-10-21");
    assert.equal(mes.total, 292);
    assert.equal(mes.nombre, "octubre");
  });

  it("una cosmetóloga no recibe el dashboard ni los costos", async () => {
    const db = new MemoryDb({
      tickets: [{ sheet_row: 2, timestamp: "2026-10-21T15:00:00Z", atendido_por: "Andrea", estimado: 10, facial_hecho: "SUNSU-01", orig: {} }],
      catalogo: [{ sheet_row: 3, sku: "HT-002", precio_compra: "9", subtotal: 20 }],
    });
    const c = ctx(db, "cosmetologa", "andrea", "Andrea Robles");
    const dash = await handle("getDashboardHoy", { token: c.token }, c) as Row;
    assert.match(String(dash.error), /permiso/i);
    assert.equal(dash.hoy, undefined);
    assert.equal(JSON.stringify(dash).includes("costoProd"), false);
  });

  it("las citas de hoy cuentan Acuity y dejan fuera las canceladas", async () => {
    const db = new MemoryDb({ tickets: [] });
    const c = ctx(db, "admin", "emi", "Emi");
    c.env = { ACUITY_UID: "uid", ACUITY_KEY: "key" };
    let url = "";
    c.fetchImpl = async (input) => {
      url = String(input);
      return new Response(JSON.stringify([
        { id: 1, canceled: false },
        { id: 2, canceled: true },
        { id: 3 },
      ]), { status: 200 });
    };
    const dash = await handle("getDashboardHoy", { token: c.token }, c) as Row;
    assert.equal(dash.citasHoy, 2);
    assert.match(url, /minDate=2026-10-21T00:00:00/);
    assert.match(url, /maxDate=2026-10-21T23:59:59/);
    assert.match(url, /acuityscheduling\.com\/api\/v1\/appointments/);
    c.fetchImpl = async () => { throw new Error("acuity caído"); };
    const caido = await handle("getDashboardHoy", { token: c.token }, c) as Row;
    assert.equal(caido.citasHoy, 0);
  });

  it("clientas antiguas ocultan el teléfono a gerencia y recepción", async () => {
    const db = new MemoryDb({
      clientas_antiguas: [{
        sheet_row: 2, cedula: "010", nombre: "Ana", telefono: "099111", tel_acuity: "099222",
        email: "a@b.c", orig: { telefono: "099111" },
      }],
    });
    const g = ctx(db, "gerente", "geri", "Geri");
    const recep = { token: "t-ale", uid: "alejandra", rol: "recepcion", exp: "2099-01-01T00:00:00.000Z" };
    db.tables.set("sesiones", [db.tables.get("sesiones")![0], recep]);
    db.tables.get("usuarios")!.push({ id: "alejandra", nombre: "Alejandra", short: "Alejandra", rol: "recepcion", bloqueado: false });
    const ger = await handle("getClientasAntiguas", { token: g.token }, g) as Row;
    const itemG = (ger.items as Row[])[0];
    assert.equal(itemG.telefono, "");
    assert.equal(itemG.tel_acuity, "");
    assert.equal(itemG.orig, undefined);
    assert.equal(itemG.email, "a@b.c");
    const recCtx = { ...g, token: "t-ale" };
    const rec = await handle("getClientasAntiguas", { token: "t-ale" }, recCtx) as Row;
    assert.equal((rec.items as Row[])[0].telefono, "");
    const a = ctx(db, "admin", "emi", "Emi");
    const adm = await handle("getClientasAntiguas", { token: a.token }, a) as Row;
    assert.equal((adm.items as Row[])[0].telefono, "099111");
    assert.equal((adm.items as Row[])[0].tel_acuity, "099222");
  });

  it("cambiar el PIN escribe bcrypt en app_usuarios", async () => {
    const db = new MemoryDb({
      app_usuarios: [
        { id: "emi", nombre: "Emi", rol: "admin", pin_hash: "$2a$06$viejo", bloqueado: false },
        { id: "andrea", nombre: "Andrea", rol: "cosmetologa", pin_hash: "$2a$06$otro", bloqueado: false },
      ],
    });
    db.rpcImpl = async (name, args) => {
      if (name === "pin_coincide") return args.p_id === "emi" && args.p_pin === "1111";
      if (name === "pin_en_uso") return args.p_pin === "2222";
      if (name === "hash_pin_bcrypt") return "$2b$06$" + String(args.p_pin);
      return null;
    };
    const c = ctx(db, "admin", "emi", "Emi");
    const mal = await handle("usuarioCambiarPin", { token: c.token, uid: "emi", pinActual: "0000", pinNuevo: "3333" }, c) as Row;
    assert.equal(mal.error, "Clave actual incorrecta");
    const dup = await handle("usuarioCambiarPin", { token: c.token, uid: "emi", pinActual: "1111", pinNuevo: "2222" }, c) as Row;
    assert.match(String(dup.error), /otro usuario/);
    const ok = await handle("usuarioCambiarPin", { token: c.token, uid: "emi", pinActual: "1111", pinNuevo: "4444" }, c) as Row;
    assert.equal(ok.ok, true);
    const emi = (await db.all("app_usuarios")).find((u) => u.id === "emi");
    assert.equal(emi?.pin_hash, "$2b$06$4444");
    assert.equal(emi?.pin_reset, false);
    assert.equal(db.writes.some((w) => w.table === "usuarios"), false);
  });

  it("getRolIndividual lee tickets de Supabase", async () => {
    const db = new MemoryDb({
      rrhh_empleadas: [{
        cedula: "1711", nombre_app: "Andrea", apellidos_y_nombres: "Andrea Robles",
        sueldo_base: 480, bono_fijo: 0, fondo_reserva: "NO", fecha_ingreso: "2024-06-01", cargo: "Cosmetologa",
      }],
      tickets: [{
        sheet_row: 2, timestamp: "2026-10-21T15:00:00Z", atendido_por: "Andrea Robles",
        id_3: "0102030405", facial_hecho: "SUNSU-01 Facial", estimado: 30, orig: {},
      }],
    });
    const c = ctx(db, "admin", "emi", "Emi");
    const out = await handle("getRolIndividual", { token: c.token, sheet: "OCTUBRE_2026", cedula: "1711" }, c) as Row;
    assert.equal(out.ok, true);
    const data = out.data as Row;
    assert.equal(data.comFaciales, 2);
    assert.equal(data.sueldo, 480);
    assert.equal(data.fuente, "beta-local");
    assert.equal(Math.round(((data.iess as number) + (data.egresos as number)) * 100), Math.round(((data.totalIngresos as number) - (data.totalRecibir as number)) * 100));
    assert.equal(String(out.error || "").includes("Sheet"), false);
    const cfg = await handle("pago_config_guardar", {
      token: c.token, nombre: "Andrea", vigente_desde: "2026-10-01", sueldo: 500, bono: 25, iess_pct: 9.45, fondo: false,
    }, c) as Row;
    assert.equal(cfg.ok, true);
    const con = await handle("getRolIndividual", { token: c.token, sheet: "OCTUBRE_2026", cedula: "1711" }, c) as Row;
    const d2 = con.data as Row;
    assert.equal(d2.sueldo, 500);
    assert.equal(d2.bono, 25);
    assert.equal(Math.round(((d2.iess as number) + (d2.egresos as number)) * 100), Math.round(((d2.totalIngresos as number) - (d2.totalRecibir as number)) * 100));
    const no = await handle("getRolIndividual", { token: c.token, sheet: "MAYO_2026", cedula: "999" }, c) as Row;
    assert.match(String(no.error), /Empleada o periodo/);
  });

  it("crearTicket numera en beta y deja libre la fila de la hoja", async () => {
    const db = new MemoryDb({
      tickets: [{ sheet_row: 5, origin: "sheet", nombre: "Hoja", orig: {}, timestamp: "2026-10-01T00:00:00Z", atendido_por: "Andrea" }],
    });
    const c = ctx(db);
    const out = await handle("crearTicket", {
      token: c.token, nombre: "Ana", apellido: "Paz", cedula: "1711", estimado: 10, cosmetologa: "Andrea",
    }, c) as Row;
    assert.equal(out.ok, true);
    assert.equal(out.fila ?? null, null);
    assert.match(String(out.beta_num), /^TK-20261021-900001$/);
    const creada = (await db.all("tickets")).find((t) => t.nombre === "Ana");
    assert.equal(creada?.origin, "beta");
    assert.equal(creada?.sheet_row ?? null, null);
    assert.equal((creada?.orig as Row)?.beta, true);
    assert.equal((await db.all("tickets")).some((t) => t.sheet_row === 5 && t.nombre === "Hoja"), true);
  });

  it("pago_save y oc_devolver pasan por el API", async () => {
    const db = new MemoryDb(erpSeed());
    const cos = ctx(db, "cosmetologa", "andrea", "Andrea Robles");
    const no = await handle("oc_devolver", { token: cos.token, oc_id: "x", lineas: [{ cantidad: 1 }] }, cos) as Row;
    assert.match(String(no.error), /permiso/i);
    const c = ctx(db, "admin", "emi", "Emi");
    const oc = await runErp("oc_save", {
      proveedor_id: SEED_IDS.prov,
      lineas: [{ producto_id: SEED_IDS.cabina, cantidad: 2, precio: 3 }],
    }, db, "Emi");
    const pago = await handle("pago_save", { token: c.token, oc_id: oc.id, monto: 1 }, c) as Row;
    assert.equal(pago.ok, true);
    assert.equal(pago.estado_pago, "parcial");
    assert.equal(String(pago.error || "").includes("desconocida"), false);
  });
});

describe("clientes, reportes, consignación y gift card", () => {
  it("el número visible del ticket es TK-YYYYMMDD-####", () => {
    assert.equal(numeroTicket({ beta_num: "TK-20261021-900001", timestamp: "2026-10-21T15:00:00Z" }), "TK-20261021-900001");
    assert.equal(numeroTicket({ beta_num: "TK-ROW-1642", timestamp: "2026-10-21T15:00:00Z" }), "TK-20261021-1642");
    assert.equal(numeroTicket({ sheet_row: 1, timestamp: "2026-10-21T15:00:00Z" }), "TK-20261021-0001");
    assert.equal(/row/i.test(numeroTicket({ beta_num: "TK-ROW-5", sheet_row: 5, timestamp: "2026-10-21T15:00:00Z" })), false);
  });

  it("la quincena de proveedores corta el 15 y el fin de mes", () => {
    assert.equal(quincenaDe(2026, 10, 21).qLabel, "16-fin Oct 2026");
    assert.equal(quincenaDe(2026, 10, 21).ini, "2026-10-16");
    assert.equal(quincenaDe(2026, 10, 10).q, 1);
    assert.equal(quincenaDe(2026, 2, 20).fin, "2026-02-28");
  });

  it("agrupa clientas y una cosmetóloga no ve montos ni tickets ajenos", async () => {
    const db = new MemoryDb();
    db.tables.set("catalogo", [
      { sku: "HT-002", producto_servicio: "Niacinamide 10%+TXA 4% Serum 30ml", subtotal: 38.25 },
      { sku: "SUNSU-01", producto_servicio: "Facial S.O.S", subtotal: 65.22 },
    ]);
    db.tables.set("tickets", [
      { id: 1, sheet_row: 1, nombre: "María", apellido: "Paz", id_3: "1711", estimado: 80, timestamp: "2026-10-21T15:00:00Z", atendido_por: "Andrea Robles", ht_002: 1, facial_hecho: "SUNSU-01" },
      { id: 2, sheet_row: 2, nombre: "María", apellido: "Paz", id_3: "1711", estimado: 40, timestamp: "2026-10-18T15:00:00Z", atendido_por: "Andrea Robles" },
      { id: 3, sheet_row: 3, nombre: "Luz", apellido: "Vera", id_3: "1722", estimado: 99, timestamp: "2026-10-21T15:00:00Z", atendido_por: "Daniela Mora" },
    ]);
    const adm = ctx(db);
    const res = await handle("clientes_resumen", { token: adm.token }, adm) as Row;
    const clientes = res.clientes as Row[];
    assert.equal(clientes.length, 2);
    const maria = clientes.find((c) => c.cedula === "1711") as Row;
    assert.equal(maria.visitas, 2);
    assert.equal(maria.total, 120);
    assert.equal(maria.ultima, "2026-10-21");
    const and = ctx(db, "cosmetologa", "andrea", "Andrea Robles");
    db.tables.set("sesiones", [
      { token: adm.token, uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
      { token: and.token, uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
    ]);
    const own = await handle("clientes_resumen", { token: and.token }, and) as Row;
    assert.equal((own.clientes as Row[]).length, 1);
    assert.equal((own.clientes as Row[])[0].total, undefined);
    const det = await handle("cliente_detalle", { token: adm.token, key: "c:1711" }, adm) as Row;
    assert.equal((det.tickets as Row[]).length, 2);
    const visita = (det.tickets as Row[])[0];
    assert.match(String(visita.ref), /^TK-\d{8}-\d{4}$/);
    assert.equal(/row/i.test(JSON.stringify(visita)), false);
    assert.equal(visita.sheet_row, undefined);
    const prod = (visita.lineas as Row[]).find((ln) => ln.clase === "producto");
    assert.match(String(prod?.nombre), /Niacinamide 10%\+TXA 4% Serum 30ml/);
    assert.equal(prod?.sku, "HT-002");
    const facial = (visita.lineas as Row[]).find((ln) => ln.clase === "servicio");
    assert.equal(facial?.nombre, "Facial S.O.S");
    const den = await handle("ticket_editar", { token: and.token, ref: "1", lineas: [{ clase: "producto", sku: "HT-002", cantidad: 1, precio: 10 }] }, and) as Row;
    assert.match(String(den.error), /admin/i);
  });

  it("el registro completo entra a la lista, el total suma todos los tickets y la búsqueda ordena", async () => {
    const db = new MemoryDb();
    db.tables.set("clientas_registro", [
      { sheet_row: 1, cedula: "1711", nombre: "María", apellido: "Paz", telefono: "099", sector_donde_vive: "Cumbayá", tipo_de_piel: "Mixta", alergias: "Ninguna" },
      { sheet_row: 2, cedula: "1733", nombre: "Rosa", apellido: "Díaz" },
      { sheet_row: 3, cedula: "", nombre: "Ana", apellido: "Sol" },
    ]);
    db.tables.set("tickets", [
      { id: 1, sheet_row: 1, origin: "sheet", nombre: "María", apellido: "Paz", id_3: "1711", estimado: 80, timestamp: "2026-10-18T15:00:00Z", atendido_por: "Andrea Robles" },
      { id: 2, sheet_row: 2, origin: "beta", nombre: "María", apellido: "Paz", id_3: "01711", estimado: 10.1, timestamp: "2026-10-21T15:00:00Z", atendido_por: "Andrea Robles" },
      { id: 3, sheet_row: 3, origin: "beta", nombre: "María", apellido: "Paz", id_3: "1711", estimado: 10.2, timestamp: "2026-10-20T15:00:00Z", atendido_por: "Daniela Mora" },
      { id: 4, sheet_row: 4, origin: "sheet", nombre: "Luz", apellido: "Vera", id_3: "1722", estimado: 15, timestamp: "2026-09-01T15:00:00Z", atendido_por: "Andrea Robles" },
    ]);
    db.tables.set("paquetes", [{
      sheet_row: 8, cedula: "1711", nombres: "María", apellidos: "Paz", sku: "SUNSU-17", paquete: "x3 Facial S.O.S",
      uso_1: true, fecha_1: "2026-10-01", uso_2: false, fecha_2: "", uso_3: false, fecha_3: "",
      orig: { codigo: "PQ-0008" },
    }]);
    const adm = ctx(db);
    const res = await handle("clientes_resumen", { token: adm.token }, adm) as Row;
    const clientes = res.clientes as Row[];
    const cedulas = clientes.map((c) => c.cedula);
    assert.ok(cedulas.includes("1733"));
    assert.ok(cedulas.includes("1722"));
    const rosa = clientes.find((c) => c.cedula === "1733") as Row;
    assert.equal(rosa.visitas, 0);
    assert.equal(rosa.total, 0);
    const maria = clientes.find((c) => c.cedula === "1711") as Row;
    assert.equal(maria.visitas, 3);
    assert.equal(maria.total, 100.3);
    assert.equal(maria.ultima, "2026-10-21");
    assert.equal(maria.telefono, "099");
    assert.equal(maria.sector, "Cumbayá");
    const porNombre = await handle("clientes_resumen", { token: adm.token, q: "paz maría" }, adm) as Row;
    assert.equal((porNombre.clientes as Row[])[0].cedula, "1711");
    const porTypo = ordenarClientes(clientes, "mria");
    assert.equal(porTypo[0].cedula, "1711");
    const corto = ordenarClientes(clientes, "pz");
    assert.equal(corto.some((c) => c.cedula === "1711"), false);
    const acento = ordenarClientes(clientes, "diaz");
    assert.equal(acento[0].cedula, "1733");
    const det = await handle("cliente_detalle", { token: adm.token, key: "c:1711" }, adm) as Row;
    assert.equal((det.cliente as Row).total, 100.3);
    assert.equal((det.cliente as Row).telefono, "099");
    assert.equal((det.cliente as Row).tipoPiel, "Mixta");
    assert.equal((det.cliente as Row).sector, "Cumbayá");
    const paq = (det.paquetes as Row[])[0];
    assert.equal(paq.usados, 1);
    assert.equal(paq.pendientes, 2);
    assert.equal(paq.total, 3);
    const sola = await handle("cliente_detalle", { token: adm.token, key: "c:1733" }, adm) as Row;
    assert.equal(sola.ok, true);
    assert.equal((sola.tickets as Row[]).length, 0);
    assert.equal((sola.cliente as Row).total, 0);
    const and = ctx(db, "cosmetologa", "andrea", "Andrea Robles");
    db.tables.set("sesiones", [
      { token: adm.token, uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
      { token: and.token, uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
    ]);
    const own = await handle("clientes_resumen", { token: and.token }, and) as Row;
    assert.equal((own.clientes as Row[]).every((c) => c.total == null), true);
    assert.equal((own.clientes as Row[]).every((c) => c.telefono == null), true);
    assert.equal((own.clientes as Row[]).some((c) => c.cedula === "1733"), false);
    const detAnd = await handle("cliente_detalle", { token: and.token, key: "c:1711" }, and) as Row;
    assert.ok((detAnd.tickets as Row[]).length > 0);
    assert.equal((detAnd.cliente as Row).telefono, undefined);
    assert.equal((detAnd.cliente as Row).tipoPiel, "Mixta");
  });

  it("editar un ticket recalcula IVA, comisión y el kardex", async () => {
    const db = new MemoryDb(erpSeed());
    db.tables.set("tickets", [{
      id: 9, sheet_row: null, origin: "beta", beta_num: "TK-9", nombre: "María", apellido: "Paz", id_3: "1711",
      estimado: 20, timestamp: "2026-10-21T15:00:00Z", atendido_por: "Andrea Robles",
      ht_002: 1, facial_hecho: "SUNSU-01 Limpieza", orig: {},
    }]);
    const c = ctx(db);
    const antes = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta)?.cantidad;
    const out = await handle("ticket_editar", { token: c.token, ref: "TK-9", lineas: [
      { clase: "producto", sku: "HT-002", nombre: "Crema", cantidad: 2, precio: 20, costo: 8 },
    ] }, c) as Row;
    assert.equal(out.ok, true);
    assert.equal(out.subtotal, 40);
    assert.equal(out.iva, 6);
    assert.equal(out.total, 46);
    assert.equal(out.comProductos, 7.2);
    const tk = (await db.all("tickets")).find((r) => r.beta_num === "TK-9");
    assert.equal(tk?.ht_002, 2);
    assert.equal(tk?.estimado, 46);
    assert.equal(tk?.facial_hecho, "");
    const stock = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta)?.cantidad;
    assert.equal(stock, Number(antes) - 2);
    const log = (await db.all("log_acciones")).find((r) => r.accion === "TICKET EDIT");
    assert.match(String(log?.detalle), /TK-9/);
    assert.match(String(log?.usuario), /Emi/);
    const otra = await handle("ticket_editar", { token: c.token, ref: "TK-9", lineas: [
      { clase: "producto", sku: "HT-002", nombre: "Crema", cantidad: 1, precio: 20, costo: 8 },
    ] }, c) as Row;
    assert.equal(otra.ok, true);
    const stock2 = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta)?.cantidad;
    assert.equal(stock2, Number(stock) + 1);
  });

  it("una gift card de 65 sobre un facial de 80 cobra la diferencia", async () => {
    const db = new MemoryDb();
    db.tables.set("gift_cards", [{ sheet_row: 4, codigo_gc: "26-065", valor: "100", usado: false, notas: "", orig: {} }]);
    const c = ctx(db);
    const out = await handle("crearTicket", {
      token: c.token, nombre: "María", apellido: "Paz", cedula: "1711", cosmetologa: "Emi",
      facial: "SUNSU-40 Glow", estimado: 15, facialPrecio: 80, colR: "SI, 26-065, aplica 65",
    }, c) as Row;
    assert.equal(out.ok, true);
    const gc = out.gc as Row;
    assert.equal(gc.aplicado, 65);
    assert.equal(gc.saldo, 35);
    assert.equal(gc.facialCobro, 15);
    const dash = await handle("getDashCosm", { token: c.token, cosmetologa: "Emi" }, c) as Row;
    assert.equal(dash.comFaciales, 0);
    assert.equal(dash.adminExcluido, true);
    const row = (await db.all("gift_cards"))[0];
    assert.equal(row.usado, false);
    assert.match(String(row.notas), /SALDO:35\.00/);
    assert.equal(((row.orig as Row).usos as Row[])[0].ticket, out.ticket);
    const otra = await handle("crearTicket", {
      token: c.token, nombre: "Ana", cedula: "9", cosmetologa: "Emi", estimado: 10, facialPrecio: 80,
      colR: "SI, 26-065, aplica 40",
    }, c) as Row;
    assert.match(String(otra.error), /saldo|alcanza/i);
    assert.equal((await db.all("gift_cards"))[0].saldo, 35);
  });

  it("el reporte suma venta, receta de cabina y faciales, y no es de staff", async () => {
    const db = new MemoryDb(erpSeed());
    db.tables.set("tickets", [
      { id: 1, timestamp: "2026-10-21T15:00:00Z", ht_002: 2, facial_hecho: "SUNSU-01 Limpieza", atendido_por: "Andrea" },
      { id: 2, timestamp: "2026-09-01T15:00:00Z", ht_002: 9, facial_hecho: "SUNSU-02", atendido_por: "Andrea" },
    ]);
    const c = ctx(db);
    const rep = await handle("reporte_consumos", { token: c.token, desde: "2026-10-01", hasta: "2026-10-31" }, c) as Row;
    const venta = (rep.venta as Row[]).find((r) => r.sku === "HT-002");
    const cabina = (rep.cabina as Row[]).find((r) => r.sku === "CB-001");
    assert.equal(venta?.unidades, 2);
    assert.equal(cabina?.unidades, 2);
    assert.equal((rep.totales as Row).faciales, 1);
    const and = ctx(db, "cosmetologa", "andrea", "Andrea Robles");
    const no = await handle("reporte_consumos", { token: and.token, desde: "2026-10-01", hasta: "2026-10-31" }, and) as Row;
    assert.match(String(no.error), /permiso/i);
  });

  it("la consignación arma la quincena y al recibir mueve Casa", async () => {
    const seed = erpSeed();
    seed.erp_proveedores[0].nombre = "Hebetronic S.A.";
    seed.erp_proveedores[0].ruc = "1793161898001";
    const db = new MemoryDb(seed);
    db.tables.set("tickets", [{ id: 1, timestamp: "2026-10-21T15:00:00Z", ht_002: 1, atendido_por: "Andrea" }]);
    const c = ctx(db);
    const per = await handle("periodo_consignacion", { token: c.token, proveedor_id: SEED_IDS.prov }, c) as Row;
    assert.equal(per.qLabel, "16-fin Oct 2026");
    assert.equal(per.familia, "HT");
    const ht = (per.fact as Row[]).find((r) => r.sku === "HT-002");
    assert.equal(ht?.vendido, 1);
    assert.equal(ht?.sugerido, 2);
    assert.equal(per.buffer, 0.2);
    const cero = await handle("periodo_consignacion", { token: c.token, proveedor_id: SEED_IDS.prov, buffer: 0 }, c) as Row;
    assert.equal((cero.fact as Row[]).find((r) => r.sku === "HT-002")?.sugerido, 1);
    const oc = await handle("oc_consignacion", {
      token: c.token, proveedor_id: SEED_IDS.prov, fecha_entrega: "2026-10-28", buffer: 20,
      lineas: [{ sku: "HT-002", cantidad: 5 }],
    }, c) as Row;
    assert.equal(oc.ok, true);
    assert.match(String(oc.numero), /^OC-/);
    const linea = (await db.all("erp_oc_lineas"))[0];
    assert.equal(linea.cantidad, 5);
    assert.equal((oc.snap as Row).buffer, 0.2);
    assert.equal(linea.bodega_id, BODEGA_VENTA);
    assert.equal(linea.plazo, "RESTOCK");
    const rec = await handle("oc_recibir", {
      token: c.token, oc_id: oc.id, lineas: [{ oc_linea_id: linea.id, bodega_id: BODEGA_VENTA, cantidad: 5 }],
    }, c) as Row;
    assert.equal(rec.ok, true);
    const stock = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta && r.bodega_id === BODEGA_VENTA);
    assert.equal(stock?.cantidad, 10);
    assert.equal((await db.all("erp_movimientos")).some((m) => m.tipo === "recepcion"), true);
  });
});

describe("beta shell", () => {
  const html = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
  const sqlHorarios = readFileSync(new URL("../../../docs/supabase/pending/0018_horarios.sql", import.meta.url), "utf8");
  it("el escritorio usa el ancho de la ventana y el teléfono trae la barra de abajo", () => {
    assert.equal(html.includes("max-width: 580px"), false);
    assert.match(html, /max-width:\s*none/);
    assert.match(html, /class="tabbar"/);
    assert.match(html, /tabButton\("bodega", "Bodega"\)/);
    assert.match(html, /Stock Venta/);
    assert.match(html, /Stock Cabina/);
    assert.match(html, /La Esquina/);
    assert.match(html, /Cabina 1/);
    assert.match(html, /id="local-sel"/);
    assert.match(html, /Pasar stock/);
    assert.match(html, /Aplicar ajuste/);
    assert.match(html, /Locales y cabinas/);
    assert.match(html, /aria-label="Crear ticket"/);
    assert.match(html, /aria-label="Más"/);
    assert.match(html, /safe-area-inset-bottom/);
    assert.match(html, /height:\s*40px/);
    assert.match(html, /Nueva orden de compra/);
    assert.match(html, /Pagar\/Ver periodo actual/);
    assert.match(html, /Consumos \/ reportes/);
    assert.match(html, /data-cli/);
    assert.match(html, /class="sheet-scroll cli-sheet"/);
    assert.match(html, /id="cli-head"/);
    assert.match(html, /Total gastado/);
    assert.match(html, /Registro inicial/);
    assert.match(html, /function puntajeCliente/);
    assert.match(html, /pendientes/);
    assert.match(html, /id="cli-q"/);
    const screens = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    assert.match(screens, /id="gc-aplica"/);
    assert.match(screens, /diferencia a cobrar/);
    assert.equal(screens.includes("facialP/f.p"), false);
    assert.match(html, /id="consig-buffer"/);
    assert.match(html, /function pdfPaginas/);
    assert.match(html, /PRE-FACTURA DE CONSIGNACION/);
    assert.match(html, /PEDIDO DE RESTOCK/);
    assert.match(html, /\.cli-name/);
    assert.match(html, /white-space:\s*nowrap/);
    assert.match(html, /sku-badge/);
    assert.match(html, /money-col/);
    assert.match(html, /tot-block/);
    assert.match(html, /TK-20261021-1643/);
    assert.match(html, /Niacinamide 10%\+TXA 4% Serum 30ml/);
    assert.equal(html.includes("OC-2026-0080"), false);
    assert.match(html, /OC-0080/);
    assert.match(screens, /gc-line/);
    assert.match(screens, /diferencia a cobrar/);
    assert.match(html, /MODO PRUEBA/);
    assert.match(html, /id="btn-prueba"/);
    assert.match(html, /Borrar datos de prueba/);
    assert.match(html, /modo-prueba/);
    assert.match(html, /fly-sec/);
    assert.match(html, /Personal/);
    assert.match(html, /Gift cards y paquetes/);
    assert.match(html, /Marcar entrada/);
    assert.match(html, /Seguimiento/);
    assert.match(html, /Caja chica/);
    assert.match(html, /Bitácora/);
    assert.match(html, /Kardex/);
    assert.match(html, /Ficha de producto/);
    assert.equal(html.includes('["facturacion"'), false);
    assert.equal(html.includes('id="f-asis-perm"'), false);
    assert.match(html, /id="f-personal-perm"/);
    assert.match(html, /reloj-btn/);
    assert.match(html, /Marcar salida/);
    assert.match(html, /facingMode:\s*"user"/);
    assert.match(html, /id="reloj-selfie" type="file" accept="image\/\*" capture="user" hidden/);
    assert.equal(/<label[^>]*>\s*Selfie\s*<input/.test(html), false);
    assert.match(html, /Horarios/);
    assert.match(sqlHorarios, /create table if not exists public\.horarios/);
    assert.equal(sqlHorarios.includes("insert into public.horarios"), false);
    assert.match(html, /Ver como…/);
    assert.match(html, /Viendo como/);
    assert.match(html, /id="btn-ver-como"/);
    assert.equal(html.includes("Citas hoy"), false);
    assert.match(html, /esRolCitas/);
  });
});

describe("personal, gift y citas", () => {
  it("la cosmetóloga ve solo su multa y el admin ve las dos", async () => {
    const db = new MemoryDb();
    const adminC = ctx(db);
    db.tables.get("sesiones")!.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    db.tables.get("usuarios")!.push({ id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false });
    db.tables.set("multas_descuentos", [
      { sheet_row: 1, fecha: "2026-10-18", cosmetologa: "Andrea Robles", tipo: "MULTA", monto: 5, motivo: "atraso" },
      { sheet_row: 2, fecha: "2026-10-19", cosmetologa: "Daniela", tipo: "MULTA", monto: 8, motivo: "falta" },
    ]);
    const propia = await handle("getMultas", { token: "t-andrea" }, adminC) as Row;
    assert.equal(propia.ok, true);
    assert.deepEqual((propia.items as Row[]).map((m) => m.nombre), ["Andrea Robles"]);
    const todas = await handle("getMultas", { token: adminC.token }, adminC) as Row;
    assert.equal((todas.items as Row[]).length, 2);
  });

  it("gift card y paquete siguen su serie y la prueba no gasta el número real", async () => {
    const db = new MemoryDb();
    const real = ctx(db);
    db.tables.set("gift_cards", [{ sheet_row: 4, codigo_gc: "26-065", valor: "65", usado: false, notas: "", orig: {} }]);
    const uno = await handle("gc_emitir", { token: real.token, valor: "65", nombre: "María" }, real) as Row;
    assert.equal(uno.codigo, "26-066");
    db.tables.get("sesiones")!.push({ token: "t-prueba", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z", modo_prueba: true });
    const test = await handle("gc_emitir", { token: "t-prueba", valor: "65" }, real) as Row;
    assert.equal(test.codigo, "TEST-26-001");
    const sigue = await handle("gc_emitir", { token: real.token, valor: "80" }, real) as Row;
    assert.equal(sigue.codigo, "26-067");
    const paq = await handle("paq_emitir", { token: real.token, nombre: "Ana", apellido: "Luz", cedula: "1722", paquete: "Glow x3" }, real) as Row;
    assert.equal(paq.codigo, "PQ-0001");
    const paq2 = await handle("paq_emitir", { token: real.token, nombre: "Luz", paquete: "x6" }, real) as Row;
    assert.equal(paq2.codigo, "PQ-0002");
    db.tables.get("sesiones")!.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    db.tables.get("usuarios")!.push({ id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false });
    const no2 = await handle("paq_editar", { token: "t-andrea", codigo: "PQ-0001", accion: "marcar", slot: 1 }, real) as Row;
    assert.match(String(no2.error), /admin/i);
    const si = await handle("paq_editar", { token: real.token, codigo: "PQ-0001", accion: "marcar", slot: 1 }, real) as Row;
    assert.equal(si.ok, true);
    const log = (await db.all("log_acciones")).filter((r) => r.accion === "PAQ EDITAR");
    assert.equal(log.length >= 1, true);
    const des = await handle("paq_editar", { token: real.token, codigo: "PQ-0001", accion: "desmarcar", slot: 1 }, real) as Row;
    assert.equal(des.ok, true);
  });

  it("comprar un paquete no marca la primera sesión y una segunda marca seguida se rechaza", async () => {
    const db = new MemoryDb();
    const c = ctx(db);
    const out = await handle("crearTicket", {
      token: c.token, nombre: "Ana", apellido: "Paz", cedula: "1711", estimado: 80,
      cosmetologa: "Andrea", facial: "SUNSU-01 Facial", pack3: "SUNSU-17 x3 Facial S.O.S",
    }, c) as Row;
    assert.equal(out.ok, true);
    assert.ok(out.paqueteFila);
    const paq = (await db.all("paquetes")).find((r) => r.sheet_row === out.paqueteFila);
    assert.notEqual(paq?.uso_1, true);
    const auto = await handle("marcarPrimerUsoPaquete", { token: c.token, cedula: "1711", sku: "SUNSU-17" }, c) as Row;
    assert.match(String(auto.error), /no se marca sola/i);
    assert.notEqual((await db.all("paquetes")).find((r) => r.sheet_row === out.paqueteFila)?.uso_1, true);
    const uno = await handle("marcarUsoManual", {
      token: c.token, fila: out.paqueteFila, idx: 0, nota: "24/10/26 Facial", total: 3, ticket: "TK-1",
    }, c) as Row;
    assert.equal(uno.ok, true);
    assert.equal(uno.slot, 1);
    const otraVez = await handle("marcarUsoManual", {
      token: c.token, fila: out.paqueteFila, idx: 0, nota: "24/10/26 Facial", total: 3, ticket: "TK-1",
    }, c) as Row;
    assert.match(String(otraVez.error), /ya fue marcada/i);
    const dos = await handle("marcarUsoManual", {
      token: c.token, fila: out.paqueteFila, idx: 1, nota: "24/10/26 Facial", total: 3, ticket: "TK-1",
    }, c) as Row;
    assert.match(String(dos.error), /ticket/i);
    assert.notEqual((await db.all("paquetes")).find((r) => r.sheet_row === out.paqueteFila)?.uso_2, true);
    c.now = new Date(c.now.getTime() + 3 * 60 * 1000);
    const tres = await handle("marcarUsoManual", {
      token: c.token, fila: out.paqueteFila, idx: 1, nota: "otra visita", total: 3, ticket: "TK-2",
    }, c) as Row;
    assert.equal(tres.ok, true);
    assert.equal((await db.all("paquetes")).find((r) => r.sheet_row === out.paqueteFila)?.uso_2, true);
  });

  it("citas de otra cosmetóloga no salen y el precio solo lo ve admin", async () => {
    const db = new MemoryDb();
    const adminC = ctx(db);
    db.tables.get("sesiones")!.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    db.tables.get("usuarios")!.push({ id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false });
    db.tables.set("tickets", [{
      id: 9, sheet_row: -1, nombre: "María", apellido: "Paz", timestamp: "2026-09-18T15:00:00Z",
      facial_hecho: "SUNSU-01", notas_generales: "hidratación", beta_num: "TK-20260918-1102", estimado: 80,
    }]);
    const citas = [
      { id: 1, datetime: "2026-10-22T15:30:00-05:00", firstName: "María", lastName: "Paz", type: "Facial S.O.S", notes: "Manchas", calendar: "Andrea Robles", price: 40 },
      { id: 2, datetime: "2026-10-23T11:00:00-05:00", firstName: "Luz", lastName: "Vera", type: "Limpieza", notes: "", calendar: "Daniela", price: 30 },
    ];
    adminC.env = { ACUITY_UID: "u", ACUITY_KEY: "k" };
    adminC.fetchImpl = async () => new Response(JSON.stringify(citas));
    const andrea = await handle("citas_proximas", { token: "t-andrea" }, adminC) as Row;
    const lista = andrea.citas as Row[];
    assert.equal(lista.length, 1);
    assert.equal(lista[0].cliente, "María Paz");
    assert.equal("precio" in lista[0], false);
    const ant = lista[0].anterior as Row;
    assert.match(String(ant.resumen), /SUNSU-01/);
    assert.equal("precio" in ant, false);
    const emi = await handle("citas_proximas", { token: adminC.token }, adminC) as Row;
    const todas = emi.citas as Row[];
    assert.equal(todas.length, 2);
    assert.equal(todas.some((c) => c.precio === 40), true);
  });

  it("asis_hoy trae el reloj en marcar entrada", async () => {
    const db = new MemoryDb();
    const c = ctx(db);
    const hoy = await handle("asis_hoy", { token: c.token }, c) as Row;
    assert.equal((hoy.reloj as Row).etiqueta, "Marcar entrada");
  });
});

describe("modo prueba", () => {
  function conPrueba(db: MemoryDb) {
    const real = ctx(db);
    const prueba = "t-prueba";
    db.tables.get("sesiones")!.push({ token: prueba, uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z", modo_prueba: true });
    return { real, prueba };
  }

  it("solo un admin enciende el modo, y la otra sesión sigue real", async () => {
    const db = new MemoryDb();
    const cosm = ctx(db, "cosmetologa", "andrea", "Andrea");
    const no = await handle("modo_prueba", { token: cosm.token, on: true }, cosm) as Row;
    assert.match(String(no.error), /admin/i);
    const admin = ctx(db);
    const on = await handle("modo_prueba", { token: admin.token, on: true }, admin) as Row;
    assert.equal(on.modo_prueba, true);
    const ses = (await db.all("sesiones")).find((r) => r.token === admin.token);
    assert.equal(ses?.modo_prueba, true);
    const who = await handle("whoami", { token: admin.token }, admin) as Row;
    assert.equal(who.modo_prueba, true);
    const off = await handle("modo_prueba", { token: admin.token, on: false }, admin) as Row;
    assert.equal(off.modo_prueba, false);
    assert.equal((await db.all("sesiones")).find((r) => r.token === admin.token)?.modo_prueba, false);
  });

  it("la actividad de prueba no mueve totales reales, y la purga los deja igual", async () => {
    const db = new MemoryDb(erpSeed());
    db.tables.set("tickets", [{
      id: 50, sheet_row: 5, origin: "sheet", nombre: "María", apellido: "Paz", id_3: "1711",
      estimado: 80, timestamp: "2026-10-21T15:00:00Z", atendido_por: "Andrea",
      ht_002: 1, facial_hecho: "SUNSU-01 Limpieza", orig: {},
    }]);
    db.tables.set("gift_cards", [{ sheet_row: 4, codigo_gc: "26-065", valor: "100", usado: false, notas: "", orig: {} }]);
    let nextCalls = 0;
    db.rpcImpl = async (name) => {
      if (String(name).startsWith("next_")) {
        nextCalls++;
        throw new Error("secuencia real");
      }
      return null;
    };
    const { real, prueba } = conPrueba(db);
    const costoAntes = (await db.all("erp_productos")).find((r) => r.id === SEED_IDS.venta)?.costo_promedio;
    const stockAntes = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta && r.bodega_id === BODEGA_VENTA)?.cantidad;

    const tk = await handle("crearTicket", {
      token: prueba, nombre: "María", apellido: "Paz", cedula: "1711", cosmetologa: "Emi",
      facial: "SUNSU-40 Glow", estimado: 40, facialPrecio: 80, colR: "SI, 26-065, aplica 65",
      productos: { "HT-002": 2 },
    }, real) as Row;
    assert.equal(tk.ok, true);
    assert.equal(tk.origin, "test");
    assert.match(String(tk.beta_num), /^TEST-TK-20261021-0001$/);
    assert.equal(numeroTicket({ beta_num: tk.beta_num }), "TEST-TK-20261021-0001");
    assert.equal(nextCalls, 0);

    const otraGc = await handle("crearTicket", {
      token: prueba, nombre: "Ana", cedula: "9", cosmetologa: "Emi", estimado: 10, facialPrecio: 80,
      colR: "SI, 26-065, aplica 40",
    }, real) as Row;
    assert.match(String(otraGc.error), /saldo|alcanza/i);
    const card = (await db.all("gift_cards"))[0];
    assert.equal(card.saldo, undefined);
    assert.equal(String(card.notas || ""), "");
    assert.equal(card.usado, false);
    const movGc = (await db.all("gift_card_movimientos")).find((r) => r.codigo === "26-065");
    assert.equal(movGc?.origin, "test");
    assert.equal(movGc?.monto, 65);
    const buscaReal = await handle("buscarGiftCards", { token: real.token, q: "26-065" }, real) as Row;
    assert.equal((buscaReal.resultados as Row[])[0].saldo, 100);
    const buscaTest = await handle("buscarGiftCards", { token: prueba, q: "26-065" }, real) as Row;
    assert.equal((buscaTest.resultados as Row[])[0].saldo, 35);

    const oc = await handle("oc_save", {
      token: prueba, proveedor_id: SEED_IDS.prov,
      lineas: [{ producto_id: SEED_IDS.venta, cantidad: 2, precio: 9 }],
    }, real) as Row;
    assert.equal(oc.ok, true);
    assert.match(String(oc.numero), /^TEST-OC-\d+$/);
    assert.equal(nextCalls, 0);
    const linea = (await db.all("erp_oc_lineas")).find((r) => r.origin === "test");
    const rec = await handle("oc_recibir", {
      token: prueba, oc_id: oc.id, lineas: [{ oc_linea_id: linea?.id, bodega_id: BODEGA_VENTA, cantidad: 2 }],
    }, real) as Row;
    assert.equal(rec.ok, true);
    assert.match(String(rec.numero), /^TEST-REC-/);
    const stockReal = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta && r.bodega_id === BODEGA_VENTA);
    assert.equal(stockReal?.cantidad, stockAntes);
    assert.equal((await db.all("erp_productos")).find((r) => r.id === SEED_IDS.venta)?.costo_promedio, costoAntes);
    const mov = (await db.all("erp_movimientos")).find((r) => r.tipo === "recepcion");
    assert.equal(mov?.origin, "test");
    assert.equal(mov?.delta, 2);

    const saldoTest = await handle("stk_saldo", { token: prueba, sku: "HT-002" }, real) as Row;
    const casaTest = (saldoTest.items as Row[]).find((r) => r.bodega_id === BODEGA_VENTA);
    // Venta de prueba −2 y recepción de prueba +2. El saldo real sigue en stockAntes.
    assert.equal(casaTest?.cantidad, Number(stockAntes));
    const saldoReal = await handle("stk_saldo", { token: real.token, sku: "HT-002" }, real) as Row;
    const casaReal = (saldoReal.items as Row[]).find((r) => r.bodega_id === BODEGA_VENTA);
    assert.equal(casaReal?.cantidad, stockAntes);
    const kardexReal = await handle("stk_kardex", { token: real.token, sku: "HT-002" }, real) as Row;
    assert.equal((kardexReal.items as Row[]).some((r) => r.origin === "test"), false);
    const kardexTest = await handle("stk_kardex", { token: prueba, sku: "HT-002" }, real) as Row;
    assert.equal((kardexTest.items as Row[]).some((r) => r.origin === "test"), true);

    const cliReal = await handle("clientes_resumen", { token: real.token }, real) as Row;
    assert.equal((cliReal.clientes as Row[])[0].total, 80);
    const cliTest = await handle("clientes_resumen", { token: prueba }, real) as Row;
    assert.equal((cliTest.clientes as Row[])[0].total, 120);
    const repReal = await handle("reporte_consumos", { token: real.token, desde: "2026-10-01", hasta: "2026-10-31" }, real) as Row;
    assert.equal((repReal.totales as Row).unidadesVenta, 1);
    const repTest = await handle("reporte_consumos", { token: prueba, desde: "2026-10-01", hasta: "2026-10-31" }, real) as Row;
    assert.equal((repTest.totales as Row).unidadesVenta, 3);
    const dashReal = await handle("getDashboardHoy", { token: real.token }, real) as Row;
    assert.equal((dashReal.hoy as Row).venta, 80);
    const dashTest = await handle("getDashboardHoy", { token: prueba }, real) as Row;
    assert.equal((dashTest.hoy as Row).venta, 120);
    const comReal = await handle("getDashCosm", { token: real.token, cosmetologa: "Emi" }, real) as Row;
    assert.equal(comReal.comFaciales, 0);
    const comTest = await handle("getDashCosm", { token: prueba, cosmetologa: "Emi" }, real) as Row;
    assert.equal(comTest.comFaciales, 0);
    assert.equal(comTest.adminExcluido, true);

    const marca = await handle("asis_marca_manual", {
      token: prueba, nombre: "Andrea", tipo: "entrada", motivo: "olvido", ts: "2026-10-21T09:05:00-05:00",
    }, real) as Row;
    assert.equal(marca.ok, true);
    const marcaRow = (await db.all("asistencia_marcajes"))[0];
    assert.equal(marcaRow.origin, "test");
    assert.equal(marcaRow.origen, "manual");
    const diaReal = await handle("asis_dia", { token: real.token, fecha: "2026-10-21" }, real) as Row;
    const equipo = JSON.stringify(diaReal);
    assert.equal(equipo.includes("09:05") || equipo.includes("14:05"), false);

    const permiso = await handle("asis_permiso_solicitar", {
      token: prueba, tipo: "PERMISO", desde: "2026-10-22", motivo: "prueba",
    }, real) as Row;
    assert.equal(permiso.ok, true);
    const per = (await db.all("permisos"))[0];
    assert.equal(per.origin, "test");
    assert.equal(Number(per.sheet_row) < 0, true);
    const perReal = await handle("getPermisos", { token: real.token }, real) as Row;
    assert.equal((perReal.data as Row[]).length, 0);

    const cli = await handle("registrarCliente", { token: prueba, cedula: "1711999888", nombre: "Prueba", apellido: "Test" }, real) as Row;
    assert.equal(cli.ok, true);
    assert.equal(Number(cli.fila) < 0, true);
    const ficha = (await db.all("clientas_registro"))[0];
    assert.equal(ficha.origin, "test");

    const cot = await handle("guardarCotizacion", {
      token: prueba, cliente: "María", lineas: [{ nombre: "Facial", cant: 1, precio: 57 }],
    }, real) as Row;
    assert.equal(cot.ok, true);
    assert.match(String(cot.numero), /^TEST-COT-/);

    const editReal = await handle("ticket_editar", {
      token: prueba, ref: "5", lineas: [{ clase: "producto", sku: "HT-002", nombre: "Crema", cantidad: 4, precio: 20, costo: 8 }],
    }, real) as Row;
    assert.equal(editReal.ok, true);
    const hoja = (await db.all("tickets")).find((r) => r.sheet_row === 5);
    assert.equal(hoja?.estimado, 80);
    assert.equal(hoja?.ht_002, 1);
    assert.equal((await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta && r.bodega_id === BODEGA_VENTA)?.cantidad, stockAntes);

    const realTk = await handle("crearTicket", {
      token: real.token, nombre: "Luz", cedula: "1722", cosmetologa: "Emi", estimado: 10,
    }, real) as Row;
    assert.match(String(realTk.beta_num), /^TK-20261021-900001$/);
    assert.equal(realTk.origin, "beta");
    assert.ok(nextCalls >= 1);
    const realOc = await handle("oc_save", {
      token: real.token, proveedor_id: SEED_IDS.prov,
      lineas: [{ producto_id: SEED_IDS.venta, cantidad: 1, precio: 8 }],
    }, real) as Row;
    assert.equal(realOc.numero, "OC-0001");

    const antesReimport = (await db.all("tickets")).filter((r) => r.origin === "test").length;
    await reimportarTickets(db, "import", [
      { sheet_row: 5, nombre: "María", apellido: "Reimport", id_3: "1711", estimado: 80, ht_002: 1, orig: {}, timestamp: "2026-10-21T15:00:00Z", atendido_por: "Andrea" },
      { sheet_row: 7, nombre: "Otra hoja", orig: {}, timestamp: "2026-10-02T00:00:00Z", atendido_por: "Andrea" },
    ]);
    const testTk = (await db.all("tickets")).find((r) => r.origin === "test" && String(r.beta_num).startsWith("TEST-TK-"));
    assert.equal(testTk?.nombre, "María");
    assert.equal((await db.all("tickets")).filter((r) => r.origin === "test").length, antesReimport);
    assert.equal((await db.all("tickets")).find((r) => Number(r.sheet_row) === 5)?.apellido, "Reimport");

    const purga = await handle("prueba_borrar", { token: real.token }, real) as Row;
    assert.equal(purga.ok, true);
    assert.ok(Number(purga.borradas) > 0);
    assert.equal((await db.all("tickets")).some((r) => r.origin === "test"), false);
    assert.equal((await db.all("erp_movimientos")).some((r) => r.origin === "test"), false);
    assert.equal((await db.all("asistencia_marcajes")).length, 0);
    assert.equal((await db.all("permisos")).some((r) => r.origin === "test"), false);
    assert.equal((await db.all("gift_cards"))[0].usado, false);
    assert.equal((await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta && r.bodega_id === BODEGA_VENTA)?.cantidad, stockAntes);
    assert.equal((await db.all("erp_productos")).find((r) => r.id === SEED_IDS.venta)?.costo_promedio, costoAntes);
    const hojaFin = (await db.all("tickets")).find((r) => Number(r.sheet_row) === 5);
    assert.equal(hojaFin?.apellido, "Reimport");
    assert.equal(hojaFin?.estimado, 80);
    const betaFin = (await db.all("tickets")).find((r) => r.origin === "beta");
    assert.match(String(betaFin?.beta_num), /^TK-20261021-900001$/);
    const ocRealFin = (await db.all("erp_oc")).find((r) => r.numero === "OC-0001");
    assert.ok(ocRealFin);
    assert.notEqual(ocRealFin?.origin, "test");
    const log = (await db.all("log_acciones")).find((r) => r.accion === "PURGA PRUEBA");
    assert.ok(log);
    assert.notEqual(log?.origin, "test");
    const cliDespues = await handle("clientes_resumen", { token: real.token }, real) as Row;
    const maria = (cliDespues.clientes as Row[]).find((r) => String(r.cedula) === "1711");
    assert.equal(maria?.visitas, 1);
    assert.equal(maria?.total, 80);
    const repDespues = await handle("reporte_consumos", { token: real.token, desde: "2026-10-01", hasta: "2026-10-31" }, real) as Row;
    assert.equal((repDespues.totales as Row).unidadesVenta, 1);
    const saldoDespues = await handle("stk_saldo", { token: prueba, sku: "HT-002" }, real) as Row;
    assert.equal((saldoDespues.items as Row[]).find((r) => r.bodega_id === BODEGA_VENTA)?.cantidad, stockAntes);
  });

  it("0016 deja borrar solo origin test y la reimportación no lo pisa", () => {
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0016_modo_prueba.sql", import.meta.url), "utf8");
    assert.match(sql, /modo_prueba boolean/);
    assert.match(sql, /origin in \('sheet', 'beta', 'test'\)/);
    assert.match(sql, /old\.origin, ''\) = 'test'/);
    assert.match(sql, /not in \('beta', 'test'\)/);
    assert.match(sql, /prueba_purgar/);
    assert.match(sql, /PURGA PRUEBA/);
    assert.match(sql, /El kardex no se borra/);
    assert.match(sql, /No hay import\.py/);
  });

  it("ver como deja la app en solo lectura y anota quién entró", async () => {
    const db = new MemoryDb();
    const adminC = ctx(db, "admin", "emi", "Emi");
    db.tables.get("usuarios")!.push({ id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false });
    db.tables.get("sesiones")!.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    db.tables.set("multas_descuentos", [
      { sheet_row: 1, fecha: "2026-10-18", cosmetologa: "Andrea Robles", tipo: "MULTA", monto: 5, motivo: "atraso" },
      { sheet_row: 2, fecha: "2026-10-19", cosmetologa: "Daniela", tipo: "MULTA", monto: 8, motivo: "falta" },
    ]);
    db.tables.set("rrhh_empleadas", [{ sheet_row: 2, nombre_app: "Andrea Robles", fecha_ingreso: "2024-01-10", sueldo_base: 460 }]);
    const no = await handle("ver_como", { token: "t-andrea", uid: "emi" }, adminC) as Row;
    assert.match(String(no.error), /admin/);
    assert.equal((await db.all("log_acciones")).length, 0);
    const entra = await handle("ver_como", { token: adminC.token, uid: "andrea" }, adminC) as Row;
    assert.equal(entra.ok, true);
    assert.equal((entra.user as Row).role, "cosmetologa");
    const logs = await db.all("log_acciones");
    assert.equal(logs.length, 1);
    assert.equal(logs[0].accion, "VER COMO");
    assert.match(String(logs[0].detalle), /Andrea Robles/);
    const who = await handle("whoami", { token: adminC.token, preview_uid: "andrea", preview: true }, adminC) as Row;
    assert.equal((who.user as Row).role, "cosmetologa");
    assert.equal(who.ver_costos, false);
    assert.equal((await db.all("log_acciones")).length, 1);
    const dash = await handle("getDashboardHoy", { token: adminC.token, preview_uid: "andrea" }, adminC) as Row;
    assert.match(String(dash.error), /permiso|vista/i);
    const multas = await handle("getMultas", { token: adminC.token, preview_uid: "andrea" }, adminC) as Row;
    assert.deepEqual((multas.items as Row[]).map((m) => m.nombre), ["Andrea Robles"]);
    const marca = await handle("asis_marcar", { token: adminC.token, preview_uid: "andrea", preview: true, tipo: "entrada" }, adminC) as Row;
    assert.match(String(marca.error), /Sal de la vista para guardar/);
    assert.equal((await db.all("asistencia_marcajes")).length, 0);
    const propia = await handle("asis_hoy", { token: "t-andrea" }, adminC) as Row;
    assert.equal(propia.empleada, true);
    const adminHoy = await handle("asis_hoy", { token: adminC.token }, adminC) as Row;
    assert.equal(adminHoy.empleada, false);
    assert.equal(lecturaEnVista("asis_hoy"), true);
    assert.equal(lecturaEnVista("asis_marcar"), false);
    const ajena = await handle("whoami", { token: "t-andrea", preview_uid: "emi" }, adminC) as Row;
    assert.match(String(ajena.error), /admin/);
  });

  it("0016b respeta origin test y el importador no lo borra", () => {
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0016b_espejo_test.sql", import.meta.url), "utf8");
    assert.match(sql, /new\.origin is distinct from 'test'/);
    assert.match(sql, /new\.origin := 'beta'/);
    const py = readFileSync(new URL("../../../docs/supabase/tools/import.py", import.meta.url), "utf8");
    assert.match(py, /origin=not\.in\.\(beta,test\)/);
  });
});

describe("horarios", () => {
  const jibble = {
    schedules: { value: [
      {
        id: "sch-1", name: "Cabina Mar-Sáb", default: true, workArrangement: "Fixed", breaksType: "Unpaid",
        daySchedules: ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => ({ day, from: "09:00:00", to: "18:00:00", duration: "PT8H" })),
        breaks: [{ name: "Almuerzo", duration: "PT1H", from: "13:00:00", to: "14:00:00", allowToBeTakenFromTo: true }],
        autoDeductions: [{ name: "Almuerzo", duration: "PT1H", threshold: "PT6H" }],
      },
      {
        id: "sch-2", name: "Día por medio", workArrangement: "Rotating", cycleAnchor: "2026-10-21",
        daySchedules: [{ day: "Day 1", from: "10:00:00", to: "19:00:00" }, { day: "Day 2", isRest: true }],
      },
    ] },
    people: { value: [
      { id: "p1", fullName: "Andrea Robles", scheduleId: "sch-1" },
      { id: "p2", fullName: "Daniela Mora", groupId: "g1" },
    ] },
    groups: { value: [{ id: "g1", scheduleId: "sch-2" }] },
  };

  it("el lunes no se trabaja en un mar-sáb y el día por medio cae en el otro slot", () => {
    const parsed = normalizarJibble(jibble);
    assert.equal(parsed.horarios[0].arreglo, "fijo");
    assert.equal(parsed.horarios[0].descansosTipo, "impago");
    assert.equal(parsed.horarios[0].descansos[0].duracionMin, 60);
    assert.equal(parsed.horarios[0].deducciones[0].umbralMin, 360);
    assert.equal(parsed.horarios[1].arreglo, "rotativo");
    assert.equal(parsed.horarios[1].dias[0].dia, "1");
    assert.equal(parsed.horarios[1].dias[1].trabaja, false);
    assert.equal(parsed.asignaciones[0].origen, "persona");
    assert.equal(parsed.asignaciones[1].origen, "grupo");
    const fijo = { ...parsed.horarios[0], id: "h1" } as Horario;
    assert.equal(jornadaDe(fijo, "2026-10-19").trabaja, false);
    assert.deepEqual(jornadaDe(fijo, "2026-10-21"), { trabaja: true, desde: "09:00", hasta: "18:00" });
    assert.equal(slotRotativo("2026-10-21", "2026-10-21", 2), 1);
    assert.equal(slotRotativo("2026-10-22", "2026-10-21", 2), 2);
    assert.equal(slotRotativo("2026-10-23", "2026-10-21", 2), 1);
  });

  it("importa Jibble, deja la tabla vacía si no hay credenciales y avisa a la cosmetóloga", async () => {
    const db = new MemoryDb();
    const adminC = ctx(db);
    db.tables.get("usuarios")!.push({ id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false });
    db.tables.get("sesiones")!.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    const sin = await handle("horarios_importar", { token: adminC.token }, adminC) as Row;
    assert.equal(sin.ok, false);
    assert.equal(sin.vacio, true);
    assert.equal(sin.importados, 0);
    assert.equal((await db.all("horarios")).length, 0);
    const negado = await handle("horarios_guardar", { token: "t-andrea", nombre: "X", arreglo: "fijo", dias: [] }, adminC) as Row;
    assert.match(String(negado.error), /admin/);
    function json(body: unknown, status = 200) {
      return { ok: status < 300, status, json: async () => body };
    }
    adminC.env = { JIBBLE_CLIENT_ID: "id", JIBBLE_CLIENT_SECRET: "secret" };
    adminC.fetchImpl = (async (url: string) => {
      if (url.includes("connect/token")) return json({ access_token: "tok" });
      if (url.includes("/Schedules")) {
        assert.equal(url, "https://workspace.prod.jibble.io/v1/Schedules");
        return json(jibble.schedules);
      }
      if (url.includes("/People")) return json(jibble.people);
      if (url.includes("/Groups")) return json(jibble.groups);
      return json({}, 404);
    }) as typeof fetch;
    const imp = await handle("horarios_importar", { token: adminC.token }, adminC) as Row;
    assert.equal(imp.ok, true);
    assert.equal(imp.importados, 2);
    assert.equal(imp.asignados, 2);
    assert.equal(lecturaEnVista("horarios_list"), true);
    assert.equal(lecturaEnVista("horarios_importar"), false);
    adminC.now = new Date("2026-10-21T13:50:00Z");
    const aviso = await handle("asis_aviso", { token: "t-andrea" }, adminC) as Row;
    assert.equal((aviso.aviso as Row).texto, "Recuerda marcar entrada");
    await handle("asis_aviso", { token: "t-andrea" }, adminC);
    assert.equal((await db.all("horario_avisos")).length, 1);
    db.tables.set("asistencia_marcajes", [{ id: "m", nombre: "Andrea Robles", tipo: "entrada", ts: "2026-10-21T14:05:00Z", anulado: false }]);
    adminC.now = new Date("2026-10-21T23:05:00Z");
    const salida = await handle("asis_aviso", { token: "t-andrea" }, adminC) as Row;
    assert.equal((salida.aviso as Row).texto, "Recuerda marcar salida");
    assert.equal((await db.all("horario_avisos")).length, 2);
    const guardado = await handle("horarios_guardar", {
      token: adminC.token, nombre: "Día por medio", arreglo: "rotativo", ancla: "2026-10-21", ciclo_dias: 2,
      dias: [{ dia: "1", trabaja: true, desde: "09:00", hasta: "18:00" }, { dia: "2", trabaja: false }],
    }, adminC) as Row;
    assert.equal(guardado.ok, true);
    assert.equal((await handle("horarios_asignar", { token: adminC.token, persona: "Andrea Robles", horario_id: guardado.id }, adminC) as Row).ok, true);
    adminC.now = new Date("2026-10-22T13:50:00Z");
    const descanso = await handle("asis_aviso", { token: "t-andrea" }, adminC) as Row;
    assert.equal(descanso.aviso, null);
  });
});

describe("personal bajas", () => {
  it("esconde a quien ya no trabaja y deja el historial", async () => {
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0019_personal_bajas.sql", import.meta.url), "utf8");
    assert.match(sql, /create table if not exists public\.personal_bajas/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /grant select, insert, update, delete on public\.personal_bajas to sunsu_admin, sunsu_rls/);
    const db = new MemoryDb();
    const adminC = ctx(db);
    db.tables.get("usuarios")!.push(
      { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      { id: "carla", nombre: "Carla Salio", short: "Carla", rol: "cosmetologa", bloqueado: false },
    );
    db.tables.set("rrhh_empleadas", [
      { nombre_app: "Andrea Robles", nombre_jibble: "Andrea", cedula: "111", fecha_ingreso: "2024-01-10", sueldo_base: 460 },
      { nombre_app: "María López", nombre_jibble: "Maria J", cedula: "222", fecha_ingreso: "2020-01-01", sueldo_base: 460 },
      { nombre_app: "Luisa Cedula", cedula: "17123", fecha_ingreso: "2020-01-01", sueldo_base: 460 },
      { nombre_app: "Ana Actual", nombre_jibble: "Ana Vieja", cedula: "333", fecha_ingreso: "2020-01-01", sueldo_base: 460 },
    ]);
    db.tables.set("personal_bajas", [
      { nombre: "Maria Lopez", nombre_app: "María López" },
      { nombre: "Luisa Cedula", cedula: "17123" },
      { nombre: "Ana Vieja" },
      { nombre: "Carla Salio" },
    ]);
    db.tables.set("tickets", [{ sheet_row: 9, cosm1: "Carla Salio", total: 40 }]);
    db.tables.set("horario_asignaciones", [{ persona: "Carla Salio", horario_id: "viejo" }]);

    const personas = (await handle("personal_personas", { token: adminC.token }, adminC) as Row).personas as Row[];
    const nombres = personas.map((p) => p.nombre);
    assert.ok(nombres.includes("Andrea Robles"));
    assert.ok(nombres.includes("Emi"));
    for (const fuera of ["María López", "Luisa Cedula", "Ana Actual", "Carla Salio"]) assert.equal(nombres.includes(fuera), false, fuera);

    const periodo = (await handle("asis_periodo", { token: adminC.token, anio: 2026, mes: 10 }, adminC) as Row).personas as Row[];
    assert.ok(periodo.some((p) => p.nombre === "Andrea Robles"));
    assert.equal(periodo.some((p) => p.nombre === "María López"), false);
    assert.equal(periodo.some((p) => p.nombre === "Ana Actual"), false);

    db.tables.set("asistencia_marcajes", [{ id: "m1", nombre: "María López", tipo: "entrada", ts: "2026-10-21T14:00:00Z", anulado: false }]);
    const conHistoria = (await handle("asis_periodo", { token: adminC.token, anio: 2026, mes: 10 }, adminC) as Row).personas as Row[];
    assert.ok(conHistoria.some((p) => p.nombre === "María López"));

    const vac = (await handle("asis_vacaciones", { token: adminC.token }, adminC) as Row).personas as Row[];
    assert.deepEqual(vac.map((p) => p.nombre), ["Andrea Robles"]);
    const una = (await handle("asis_vacaciones", { token: adminC.token, nombre: "María López" }, adminC) as Row).personas as Row[];
    assert.deepEqual(una.map((p) => p.nombre), ["María López"]);

    const dia = (await handle("asis_dia", { token: adminC.token, fecha: "2026-10-21" }, adminC) as Row).filas as Row[];
    const diaNom = dia.map((f) => f.nombre);
    assert.ok(diaNom.includes("Andrea Robles"));
    assert.ok(diaNom.includes("María López"));
    assert.equal(diaNom.includes("Ana Actual"), false);

    const lista = (await handle("horarios_list", { token: adminC.token }, adminC) as Row).personas as Row[];
    const horNom = lista.map((p) => p.nombre);
    assert.ok(horNom.includes("Andrea Robles"));
    assert.equal(horNom.includes("Carla Salio"), false);
    assert.equal(horNom.includes("María López"), false);

    function json(body: unknown, status = 200) {
      return { ok: status < 300, status, json: async () => body };
    }
    adminC.env = { JIBBLE_CLIENT_ID: "id", JIBBLE_CLIENT_SECRET: "secret" };
    adminC.fetchImpl = (async (url: string) => {
      if (url.includes("connect/token")) return json({ access_token: "tok" });
      if (url.includes("/Schedules")) {
        assert.equal(url, "https://workspace.prod.jibble.io/v1/Schedules");
        return json({ value: [{ id: "sch-1", name: "Cabina", workArrangement: "Fixed", daySchedules: [{ day: "Wednesday", from: "09:00:00", to: "18:00:00" }] }] });
      }
      if (url.includes("/People")) return json({ value: [
        { id: "p1", fullName: "Andrea Robles", scheduleId: "sch-1" },
        { id: "p2", fullName: "Carla Salio", scheduleId: "sch-1" },
      ] });
      if (url.includes("/Groups")) return json({ value: [] });
      return json({}, 404);
    }) as typeof fetch;
    const imp = await handle("horarios_importar", { token: adminC.token }, adminC) as Row;
    assert.equal(imp.ok, true);
    assert.equal(imp.asignados, 1);
    const asigs = await db.all("horario_asignaciones");
    assert.equal(asigs.some((r) => r.persona === "Andrea Robles"), true);
    assert.equal(asigs.some((r) => r.persona === "Carla Salio" && r.horario_id === "viejo"), true);
    assert.equal((await db.all("tickets"))[0].cosm1, "Carla Salio");
  });
});

describe("series, comisiones y rol", () => {
  it("los tramos de paquete son 5/8/11/14% del neto, redondeados hacia abajo", () => {
    const netos = Array.from({ length: 12 }, () => 100);
    assert.equal(comisionPaquetesTramo(12, undefined, netos).monto, 10 * 5 + 2 * 8);
    const partes = desglosePaquetesTramo(12, undefined, netos);
    assert.equal(partes.reduce((a, t) => a + t.monto, 0), comisionPaquetesTramo(12, undefined, netos).monto);
    assert.deepEqual(partes.map((t) => [t.desde, t.n, t.pct, t.monto]), [[1, 10, 5, 50], [11, 2, 8, 16]]);
    assert.equal(listaExtrasPagados("Dermaplaning | LED | CORTESIA").length, contarExtras("Dermaplaning | LED | CORTESIA").n - contarExtras("Dermaplaning | LED | CORTESIA").cortesia);
    assert.equal(comisionPaquetesTramo(12, undefined, netos).etiqueta, "11–20 · 8%");
    assert.equal(comisionPaquetesTramo(1, undefined, [33]).monto, 1);
    const pct = normalizarTramos([
      { desde: 1, hasta: 10, modo: "pct", valor: 5 },
      { desde: 11, hasta: 20, modo: "pct", valor: 8 },
      { desde: 21, hasta: 30, modo: "fijo", valor: 11 },
      { desde: 31, hasta: 100000, modo: "pct", valor: 14 },
    ]);
    assert.equal(pct[0].valor, 0.05);
    assert.equal(comisionPaquetesTramo(2, pct, [100, 80]).monto, 9);
    assert.equal(comisionPaquetesTramo(2, pct).monto, 0);
  });

  it("la comisión % del paquete toma el SUNSU-NN del texto del ticket", async () => {
    const db = new MemoryDb({
      cosmetologas: [{ id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true }],
      tickets: [{
        id: 1, sheet_row: 1, timestamp: "2026-10-27T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0101",
        facial_hecho: "SUNSU-01", compra_pack_3: "SUNSU-18 x3 Facial Reparación", orig: {},
      }],
      catalogo: [{ sku: "SUNSU-18", producto_servicio: "Facial Reparación x3", subtotal: 100, tipo: "PAQUETE", orig: {} }],
    });
    const c = ctx(db, "admin", "emi", "Emi");
    const tabla = await handle("getComisionesTabla", { token: c.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Andrea" }, c) as Row;
    const filas = tabla.filas as Row[];
    assert.equal((filas.find((f) => f.concepto === "Paquetes")?.porCiclo as number[])[0], 5);
    const det = tabla.detalle as Row;
    assert.equal(det.faciales, 1);
    assert.equal(det.paquetes, 1);
    assert.equal((det.tramos as Row[])[0]?.n, 1);
    assert.equal((det.tramos as Row[])[0]?.pct, "5%");
    assert.equal((det.tramos as Row[]).reduce((a, t) => a + Number(t.monto), 0), 5);
  });

  it("Todas lista a cada persona y el detalle no cambia el monto", async () => {
    const db = new MemoryDb({
      cosmetologas: [
        { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true },
        { id: "daniela", nombre: "Daniela Mora", patron: "daniela%", es_cosmetologa: true, activa: true },
      ],
      tickets: [{
        id: 1, sheet_row: 1, timestamp: "2026-10-27T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0101",
        facial_hecho: "SUNSU-01", compra_pack_3: "SUNSU-18", servicios_adicionales: "Dermaplaning | LED",
        ht_002: 2, orig: {},
      }],
      catalogo: [
        { sku: "SUNSU-18", producto_servicio: "Facial Reparación x3", subtotal: 100, tipo: "PAQUETE", orig: {} },
        { sku: "SUNSU-HT-002", producto_servicio: "Serum niacinamide", subtotal: 20, precio_compra: 8, tipo: "PRODUCTO", orig: {} },
      ],
    });
    const c = ctx(db, "super_admin", "efch", "EFCH");
    const tabla = await handle("getComisionesTabla", { token: c.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Todas" }, c) as Row;
    assert.equal(tabla.todas, true);
    const equipo = tabla.equipo as Row[];
    assert.ok(equipo.some((e) => e.persona === "Andrea Robles"));
    assert.equal(equipo.find((e) => e.persona === "Daniela Mora")?.total, 0);
    const andrea = equipo.find((e) => e.persona === "Andrea Robles") as Row;
    const filas = andrea.filas as Row[];
    const det = andrea.detalle as Row;
    assert.equal(filas.find((f) => f.concepto === "Faciales")?.total, 2);
    assert.equal(det.faciales, 1);
    assert.equal(filas.find((f) => f.concepto === "Paquetes")?.total, 5);
    assert.equal((det.tramos as Row[]).reduce((a, t) => a + Number(t.monto), 0), 5);
    assert.equal(det.productosN, 2);
    assert.equal((det.productos as Row[])[0]?.nombre, "Serum niacinamide");
    assert.equal((det.productos as Row[])[0]?.qty, 2);
    assert.equal(filas.find((f) => f.concepto === "Productos")?.total, (det.productos as Row[]).reduce((a, t) => a + Number(t.monto), 0));
    assert.equal(det.extrasN, 2);
    assert.equal((det.extras as Row[]).length, 2);
    assert.equal(filas.find((f) => f.concepto === "Extras")?.total, (det.extras as Row[]).reduce((a, t) => a + Number(t.monto), 0));
    assert.equal(tabla.totalEquipo, equipo.reduce((a, e) => a + Number(e.total), 0));
    const propia = ctx(db, "cosmetologa", "andrea", "Andrea Robles");
    const no = await handle("getComisionesTabla", { token: propia.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Todas" }, propia) as Row;
    assert.equal(no.todas, undefined);
    assert.match(String(no.persona), /Andrea/);
  });

  it("un x6 cuenta como 1 y paga el % de su neto completo; el ciclo anterior sigue en 2", async () => {
    const db = new MemoryDb({
      cosmetologas: [{ id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true }],
      tickets: [
        ...Array.from({ length: 10 }, (_, i) => ({
          id: i + 1, sheet_row: i + 1, timestamp: "2026-10-27T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0101",
          facial_hecho: "SUNSU-01", compra_pack_3: "SUNSU-18 x3 Facial Reparación", orig: {},
        })),
        {
          id: 11, sheet_row: 11, timestamp: "2026-10-28T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0102",
          facial_hecho: "SUNSU-01", compra_pack_6: "SUNSU-23 x6 Facial S.O.S", orig: {},
        },
        {
          id: 12, sheet_row: 12, timestamp: "2026-10-10T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0103",
          facial_hecho: "SUNSU-01", compra_pack_6: "SUNSU-23 x6 Facial S.O.S", orig: {},
        },
      ],
      catalogo: [
        { sku: "SUNSU-18", producto_servicio: "Facial Reparación x3", subtotal: 100, tipo: "PAQUETE", orig: {} },
        { sku: "SUNSU-23", producto_servicio: "Facial S.O.S x6", subtotal: 332.35, tipo: "PAQUETE", orig: {} },
      ],
    });
    const c = ctx(db, "admin", "emi", "Emi");
    const tabla = await handle("getComisionesTabla", { token: c.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Andrea" }, c) as Row;
    const filas = tabla.filas as Row[];
    assert.equal((filas.find((f) => f.concepto === "Paquetes")?.porCiclo as number[])[0], 10 * 5 + 26);
    const viejo = await handle("getReporteAdmin", { token: c.token }, c) as Row;
    const andrea = (viejo.cosmetologas as Row[]).find((r) => String(r.name).startsWith("Andrea"));
    assert.equal(andrea?.paq, 2);
    assert.equal(andrea?.cp, 320);
  });

  it("backfill TK-SO respeta el orden y la prueba no gasta la serie", async () => {
    const db = new MemoryDb({
      tickets: [
        { id: 2, sheet_row: 8, origin: "sheet", timestamp: "2026-10-02T10:00:00Z", nombre: "Tarde", orig: {} },
        { id: 1, sheet_row: 3, origin: "sheet", timestamp: "2026-10-01T10:00:00Z", nombre: "Temprano", orig: {} },
        { id: 4, origin: "test", beta_num: "TEST-TK-20261001-0001", timestamp: "2026-09-01T10:00:00Z", nombre: "Prueba", orig: {} },
      ],
    });
    const c = ctx(db);
    const lista = await handle("getTicketsLista", { token: c.token }, c) as Row;
    const items = lista.items as Row[];
    const temprano = (await db.all("tickets")).find((r) => r.nombre === "Temprano");
    const tarde = (await db.all("tickets")).find((r) => r.nombre === "Tarde");
    const prueba = (await db.all("tickets")).find((r) => r.nombre === "Prueba");
    assert.equal(temprano?.so_num, "TK-SO-0001");
    assert.equal(tarde?.so_num, "TK-SO-0002");
    assert.equal(prueba?.so_num, undefined);
    assert.equal(items[0].so_num, "TK-SO-0002");
    assert.equal(items[0].estado, "abierto");
    assert.equal(items[0].factura, "");
    assert.equal(items[0].saldo, items[0].estimado);
    const nuevo = await handle("crearTicket", { token: c.token, nombre: "Nueva", cedula: "1", cosmetologa: "Andrea", estimado: 10 }, c) as Row;
    assert.equal(nuevo.so_num, "TK-SO-0003");
    assert.match(String(nuevo.beta_num), /^TK-20261021-900001$/);
    const edit = await handle("editarTicket", { token: c.token, clave: "TK-SO-0003", nombre: "Nueva", apellido: "Paz", cedula: "1", subtotal: 100 }, c) as Row;
    assert.equal(edit.ok, true);
    assert.equal(edit.estimado, 115);
    assert.equal(edit.iva, 15);
    const cotVieja = await ctx(db);
    db.tables.set("cotizaciones", [
      { id: 1, numero: "COT-0002", fecha: "2026-10-02T00:00:00Z", cliente: "B", items: [], orig: {} },
      { id: 2, numero: "COT-0001", fecha: "2026-10-01T00:00:00Z", cliente: "A", items: [], orig: {} },
      { id: 3, numero: "", fecha: "2026-10-03T00:00:00Z", cliente: "Sin", items: [], orig: {} },
      { id: 4, numero: "TK-SQ-0009", fecha: "2026-10-04T00:00:00Z", cliente: "Vieja", items: [], orig: {} },
    ]);
    const antesTk = (await db.all("tickets")).length;
    const cot = await handle("guardarCotizacion", {
      token: cotVieja.token, cliente: "C", cedula: "1711", lineas: [{ nombre: "Facial", cant: 1, precio: 20 }],
    }, cotVieja) as Row;
    assert.equal((await db.all("cotizaciones")).find((r) => r.cliente === "A")?.numero, "COT-0001");
    assert.equal((await db.all("cotizaciones")).find((r) => r.cliente === "B")?.numero, "COT-0002");
    assert.equal((await db.all("cotizaciones")).find((r) => r.cliente === "Vieja")?.numero, "TK-SQ-0009");
    assert.equal((await db.all("cotizaciones")).find((r) => r.cliente === "Sin")?.numero, "COT-0003");
    assert.equal(cot.numero, "COT-0004");
    assert.equal((await db.all("tickets")).length, antesTk);
    const otra = await handle("guardarCotizacion", {
      token: cotVieja.token, numero: "COT-0004", cliente: "C editada", lineas: [{ nombre: "Facial", cant: 2, precio: 20 }],
    }, cotVieja) as Row;
    assert.equal(otra.ok, true);
    assert.equal(otra.numero, "COT-0004");
    assert.equal((await db.all("cotizaciones")).filter((r) => r.numero === "COT-0004").length, 1);
  });

  it("un admin no entra en la tabla ni en N, y el rol usa sueldo, ciclo y jibble", async () => {
    const db = new MemoryDb({
      usuarios: [
        { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
        { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      ],
      cosmetologas: [
        { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true },
        { id: "emi", nombre: "Emi", patron: "emi%", es_cosmetologa: true, activa: true },
      ],
      tickets: [
        { id: 1, sheet_row: 1, timestamp: "2026-10-27T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0101", facial_hecho: "SUNSU-01", compra_pack_3: "SUNSU-60", orig: {} },
        { id: 2, sheet_row: 2, timestamp: "2026-10-27T16:00:00Z", atendido_por: "Emi", id_3: "0202", facial_hecho: "SUNSU-40", compra_pack_6: "SUNSU-61", orig: {} },
      ],
      catalogo: [{ sku: "SUNSU-60", producto_servicio: "Pack", subtotal: 200, tipo: "PAQUETE", orig: {} }],
      rrhh_empleadas: [{ cedula: "1711", nombre_app: "Andrea", apellidos_y_nombres: "Andrea Robles", sueldo: 460, bono: 40, fondo_reserva: "NO", fecha_ingreso: "2024-01-01", cargo: "Cosmetologa" }],
      jibble_historial: [{ nombre: "Andrea Robles", fecha: "2026-10-27", payroll_minutes: 480, supplementary_minutes: 60 }],
    });
    const c = ctx(db, "admin", "emi", "Emi");
    const tabla = await handle("getComisionesTabla", { token: c.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Emi" }, c) as Row;
    assert.equal(tabla.persona, "Andrea Robles");
    assert.equal((tabla.personas as string[]).includes("Emi"), false);
    assert.equal((tabla.ciclos as Row[])[0].regimen, "tramo");
    assert.equal((tabla.ciclos as Row[])[0].n, 1);
    const filas = tabla.filas as Row[];
    assert.deepEqual(filas.map((f) => f.concepto), ["Faciales", "Paquetes", "Productos", "Recepción", "Extras", "Total"]);
    assert.equal((filas.find((f) => f.concepto === "Faciales")?.porCiclo as number[])[0], 2);
    assert.equal((filas.find((f) => f.concepto === "Paquetes")?.porCiclo as number[])[0], 10);
    const rol0 = await handle("getRolCiclo", { token: c.token, desde: "2026-10-26", persona: "Andrea" }, c) as Row;
    assert.equal(rol0.fuenteHoras, "jibble");
    assert.equal((rol0.ingresos as Row[]).find((r) => r.concepto === "Sueldo")?.monto, 460);
    assert.equal((rol0.ingresos as Row[]).find((r) => r.concepto === "Bono")?.monto, 40);
    assert.equal((rol0.ingresos as Row[]).find((r) => r.concepto === "Faciales")?.monto, 2);
    const cfg = await handle("pago_config_guardar", {
      token: c.token, nombre: "Andrea", vigente_desde: "2026-10-01", sueldo: 500, bono: 20, iess_pct: 9.45, fondo: false,
    }, c) as Row;
    assert.equal(cfg.ok, true);
    const rol1 = await handle("getRolCiclo", { token: c.token, desde: "2026-10-26", persona: "Andrea" }, c) as Row;
    assert.equal((rol1.ingresos as Row[]).find((r) => r.concepto === "Sueldo")?.monto, 500);
    const cat = await handle("getCatalogoTabla", { token: c.token }, c) as Row;
    db.tables.set("catalogo", [{ sheet_row: 1, sku: "SUNSU-HT-002", producto_servicio: "Serum", tipo: "PRODUCTO", subtotal: 20, total_con_iva: 23, activo: true, orig: {} }]);
    db.tables.set("erp_productos", [{ id: "p1", sku: "HT-002", nombre: "Serum" }]);
    db.tables.set("erp_oc", [{ id: "oc1", fecha: "2026-10-01" }]);
    db.tables.set("erp_oc_lineas", [{ id: "l1", oc_id: "oc1", producto_id: "p1", precio: 8 }]);
    db.tables.set("inventario_base", [{ id: 3, sku: "SUNSU-HT-002", compra: 0, stock_inicial: 0 }]);
    const tablaCat = await handle("getCatalogoTabla", { token: c.token }, c) as Row;
    const serum = (tablaCat.items as Row[]).find((r) => String(r.sku).includes("HT-002"));
    assert.equal(serum?.compraReal, 8);
    assert.equal((await db.all("inventario_base"))[0].compra, 8);
    assert.equal(cat.ok, true);
  });

  it("getRolCiclo cuenta faltas en el horario propio y solo hasta el último dato", async () => {
    const dias = (id: string, nombres: string[]) => nombres.map((dia, orden) => ({ horario_id: id, orden, dia, trabaja: true, desde: "09:00", hasta: "18:00" }));
    const ymds = (desde: string, hasta: string) => {
      const out: string[] = [];
      let t = Date.parse(desde + "T00:00:00Z");
      const end = Date.parse(hasta + "T00:00:00Z");
      while (t <= end) { out.push(new Date(t).toISOString().slice(0, 10)); t += 86400000; }
      return out;
    };
    const dow = (ymd: string) => new Date(ymd + "T00:00:00Z").getUTCDay();
    const jibble: Row[] = [];
    const marca = (nombre: string, ymd: string) => jibble.push({ nombre, fecha: ymd, payroll_minutes: 480 });
    for (const f of ymds("2026-06-26", "2026-07-25")) {
      const d = dow(f);
      if (d === 0 || d === 1) continue;
      if (f === "2026-06-30" || f === "2026-07-07" || f === "2026-07-14" || f === "2026-07-25") continue;
      marca("Daniela Mora", f);
    }
    for (const f of ymds("2026-09-26", "2026-10-21")) {
      const d = dow(f);
      if (d >= 1 && d <= 5) marca("Andrea Robles", f);
      if (d >= 2 && d <= 6) marca("Daniela Mora", f);
    }
    const db = new MemoryDb({
      usuarios: [
        { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
        { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
        { id: "daniela", nombre: "Daniela Mora", short: "Daniela", rol: "cosmetologa", bloqueado: false },
      ],
      rrhh_empleadas: [
        { cedula: "1726", nombre_app: "Andrea", apellidos_y_nombres: "Andrea Robles", sueldo: 482, bono: 0, fondo_reserva: "NO", fecha_ingreso: "2026-05-01", cargo: "Cosmetologa" },
        { cedula: "1004", nombre_app: "Daniela", apellidos_y_nombres: "Daniela Mora", sueldo: 482, bono: 0, fondo_reserva: "NO", fecha_ingreso: "2026-05-01", cargo: "Cosmetologa" },
      ],
      horarios: [
        { id: "h-and", nombre: "Andrea", arreglo: "fijo", es_default: false },
        { id: "h-dan", nombre: "Daniela", arreglo: "fijo", es_default: false },
      ],
      horario_dias: [
        ...dias("h-and", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]),
        ...dias("h-dan", ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]),
      ],
      horario_asignaciones: [
        { persona: "Andrea Robles", horario_id: "h-and" },
        { persona: "Daniela Mora", horario_id: "h-dan" },
      ],
      jibble_historial: jibble,
      tickets: [{ sheet_row: 30, atendido_por: "Daniela Mora", timestamp: "2026-06-30T15:00:00Z", nombre: "Ana", apellido: "Paz" }],
      asistencia_feriados: [{ fecha: "2026-07-07", nombre: "Feriado" }],
      permisos: [{ empleada: "Daniela Mora", tipo: "VACACIONES", estado: "APROBADO", fecha_inicio: "2026-07-14", fecha_fin: "2026-07-14" }],
    });
    const c = ctx(db, "admin", "emi", "Emi");
    c.now = new Date("2026-10-24T18:00:00Z");
    const sueldoDe = (rol: Row) => (rol.ingresos as Row[]).find((r) => r.concepto === "Sueldo")?.monto;
    const julio = await handle("getRolCiclo", { token: c.token, desde: "2026-06-26", persona: "Daniela" }, c) as Row;
    assert.equal(sueldoDe(julio), 465.93);
    assert.deepEqual(julio.marcajesFaltantes, ["2026-06-30"]);
    const sepA = await handle("getRolCiclo", { token: c.token, desde: "2026-09-26", persona: "Andrea" }, c) as Row;
    const sepD = await handle("getRolCiclo", { token: c.token, desde: "2026-09-26", persona: "Daniela" }, c) as Row;
    assert.equal(sueldoDe(sepA), 482);
    assert.equal(sueldoDe(sepD), 482);
  });

  it("el admin edita el ticket en línea y el personal pide el cambio", async () => {
    const db = new MemoryDb({
      usuarios: [
        { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
        { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      ],
      tickets: [{ id: 9, sheet_row: 9, timestamp: "2026-10-21T15:00:00Z", atendido_por: "Andrea Robles", nombre: "Ana", apellido: "Paz", id_3: "1711", estimado: 40, origin: "beta" }],
      push_suscripciones: [{ endpoint: "https://push.example/andrea", persona: "Emi", p256dh: "k", auth: "a" }],
    });
    const adminC = ctx(db, "admin", "emi", "Emi");
    const ses = await db.all("sesiones");
    ses.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    db.tables.set("sesiones", ses);
    const no = await handle("inline_guardar", { token: "t-andrea", tabla: "tickets", fila: "9", campos: { nombre: "Anita" } }, adminC) as Row;
    assert.match(String(no.error), /admin/i);
    const sinMotivo = await handle("solicitud_crear", { token: "t-andrea", tabla: "tickets", fila: "9", tipo: "cambio", motivo: "  ", propuestos: { nombre: "Anita" } }, adminC) as Row;
    assert.match(String(sinMotivo.error), /motivo/i);
    const ped = await handle("solicitud_crear", { token: "t-andrea", tabla: "tickets", fila: "9", tipo: "cambio", motivo: "El nombre va con i", propuestos: { nombre: "Anita" } }, adminC) as Row;
    assert.equal(ped.ok, true);
    const lista = await handle("getSolicitudes", { token: adminC.token }, adminC) as Row;
    assert.equal(lista.pendientes, 1);
    const mia = await handle("getSolicitudes", { token: "t-andrea" }, adminC) as Row;
    assert.equal((mia.items as Row[]).length, 1);
    const rechazo = await handle("solicitud_resolver", { token: adminC.token, id: ped.id, aprobar: false, comentario: "no" }, adminC) as Row;
    assert.equal(rechazo.estado, "rechazado");
    assert.equal((await db.all("tickets"))[0].nombre, "Ana");
    const ped2 = await handle("solicitud_crear", { token: "t-andrea", tabla: "tickets", fila: "9", tipo: "cambio", motivo: "Otra vez", propuestos: { nombre: "Anita" } }, adminC) as Row;
    const ok = await handle("solicitud_resolver", { token: adminC.token, id: ped2.id, aprobar: true }, adminC) as Row;
    assert.equal(ok.estado, "aprobado");
    assert.equal((await db.all("tickets"))[0].nombre, "Anita");
    const aud = (await db.all("audit_log")).find((r) => r.tabla === "tickets" && r.accion === "UPDATE");
    assert.equal((aud?.antes as Row)?.nombre, "Ana");
    assert.equal((aud?.despues as Row)?.nombre, "Anita");
    const directo = await handle("inline_guardar", { token: adminC.token, tabla: "tickets", fila: "9", campos: { notas: "piel seca" } }, adminC) as Row;
    assert.equal(directo.ok, true);
    const borrado = await handle("inline_borrar", { token: adminC.token, tabla: "tickets", fila: "9" }, adminC) as Row;
    assert.equal(borrado.ok, true);
    const hist = await handle("getHistorial", { token: adminC.token }, adminC) as Row[];
    assert.equal(hist.length, 0);
    assert.equal(Boolean((await db.all("tickets"))[0].borrado_at), true);
    const vista = await handle("inline_guardar", { token: adminC.token, preview: true, preview_uid: "andrea", tabla: "tickets", fila: "9", campos: { nombre: "X" } }, adminC) as Row;
    assert.match(String(vista.error), /vista/i);
  });

  it("el admin edita la clienta en línea y el personal pide el cambio", async () => {
    const db = new MemoryDb({
      usuarios: [
        { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
        { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      ],
      clientas_registro: [
        { sheet_row: 4, cedula: "1711", nombre: "María", apellido: "Paz", sector_donde_vive: "Norte", telefono: "099" },
      ],
      tickets: [{ id: 1, sheet_row: 1, timestamp: "2026-10-21T15:00:00Z", atendido_por: "Andrea Robles", nombre: "María", apellido: "Paz", id_3: "1711", estimado: 40 }],
      push_suscripciones: [{ endpoint: "https://push.example/emi", persona: "Emi", p256dh: "k", auth: "a" }],
    });
    const adminC = ctx(db, "admin", "emi", "Emi");
    const ses = await db.all("sesiones");
    ses.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    db.tables.set("sesiones", ses);
    const no = await handle("inline_guardar", { token: "t-andrea", tabla: "clientes", fila: "4", campos: { apellido: "Pazos" } }, adminC) as Row;
    assert.match(String(no.error), /admin/i);
    const ped = await handle("solicitud_crear", { token: "t-andrea", tabla: "clientes", fila: "4", tipo: "cambio", motivo: "El apellido cambió", propuestos: { apellido: "Pazos" } }, adminC) as Row;
    assert.equal(ped.ok, true);
    const rechazo = await handle("solicitud_resolver", { token: adminC.token, id: ped.id, aprobar: false }, adminC) as Row;
    assert.equal(rechazo.estado, "rechazado");
    assert.equal((await db.all("clientas_registro"))[0].apellido, "Paz");
    const ped2 = await handle("solicitud_crear", { token: "t-andrea", tabla: "clientes", fila: "4", tipo: "cambio", motivo: "Otra vez", propuestos: { apellido: "Pazos" } }, adminC) as Row;
    const ok = await handle("solicitud_resolver", { token: adminC.token, id: ped2.id, aprobar: true }, adminC) as Row;
    assert.equal(ok.estado, "aprobado");
    assert.equal((await db.all("clientas_registro"))[0].apellido, "Pazos");
    assert.equal((await db.all("clientas_registro"))[0].sector_donde_vive, "Norte");
    const aud = (await db.all("audit_log")).find((r) => r.tabla === "clientas_registro" && r.accion === "UPDATE");
    assert.equal((aud?.antes as Row)?.apellido, "Paz");
    assert.equal((aud?.despues as Row)?.apellido, "Pazos");
    const nuevo = await handle("inline_guardar", { token: adminC.token, tabla: "clientes", fila: "nuevo", campos: { nombre: "Rosa", apellido: "Díaz", cedula: "1733" } }, adminC) as Row;
    assert.equal(nuevo.ok, true);
    const lista = await handle("clientes_resumen", { token: adminC.token }, adminC) as Row;
    assert.equal((lista.clientes as Row[]).some((c) => c.cedula === "1733" && c.fila), true);
    const ajena = await handle("solicitud_crear", { token: "t-andrea", tabla: "clientes", fila: String(nuevo.fila), tipo: "cambio", motivo: "no es mía", propuestos: { nombre: "Rosa" } }, adminC) as Row;
    assert.match(String(ajena.error), /permiso/i);
    const borrado = await handle("inline_borrar", { token: adminC.token, tabla: "clientes", fila: "4" }, adminC) as Row;
    assert.equal(borrado.ok, true);
    const despues = await handle("clientes_resumen", { token: adminC.token }, adminC) as Row;
    assert.equal((despues.clientes as Row[]).some((c) => c.cedula === "1711"), false);
    assert.equal(Boolean((await db.all("clientas_registro")).find((r) => r.sheet_row === 4)?.borrado_at), true);
    const det = await handle("cliente_detalle", { token: adminC.token, key: "c:1711" }, adminC) as Row;
    assert.match(String(det.error), /eliminada/i);
    db.tables.get("sesiones")!.find((r) => r.token === adminC.token)!.modo_prueba = true;
    const prueba = await handle("inline_guardar", { token: adminC.token, tabla: "clientes", fila: String(nuevo.fila), campos: { nombre: "Rosita" } }, adminC) as Row;
    assert.match(String(prueba.error), /prueba/i);
    const vista = await handle("inline_guardar", { token: adminC.token, preview: true, preview_uid: "andrea", tabla: "clientes", fila: String(nuevo.fila), campos: { nombre: "X" } }, adminC) as Row;
    assert.match(String(vista.error), /vista/i);
  });

  it("0024 marca las solicitudes de prueba y 0021 no reescribe importaciones", () => {
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0024_prueba_audit.sql", import.meta.url), "utf8");
    assert.match(sql, /alter table public\.solicitudes_cambio add column if not exists origin text/);
    assert.match(sql, /audit_log solo acepta insert/);
    const purga = sql.slice(sql.indexOf("function public.prueba_purgar"));
    assert.match(purga, /'solicitudes_cambio'/);
    assert.equal(purga.includes("audit_log"), false);
    const espejo = readFileSync(new URL("../../../docs/supabase/pending/0021_tk_so_vacias.sql", import.meta.url), "utf8");
    assert.match(espejo, /ticket_es_real/);
    assert.match(espejo, /tickets_so_num/);
    assert.match(espejo, /CREATE TRIGGER tickets_zz_so_num/);
    assert.doesNotMatch(espejo, /create trigger trg_tickets_so_vacio/i);
    const purgaCat = readFileSync(new URL("../../../docs/supabase/pending/0025_purga_catalogo.sql", import.meta.url), "utf8");
    assert.match(purgaCat, /alter table public\.catalogo add column if not exists origin text/);
    const cuerpo = purgaCat.slice(purgaCat.indexOf("function public.prueba_purgar"));
    assert.match(cuerpo, /'catalogo'/);
    assert.equal(cuerpo.includes("audit_log"), false);
  });

  it("una solicitud de modo prueba queda origin test y la purga no toca audit_log", async () => {
    const db = new MemoryDb({
      usuarios: [
        { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
        { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      ],
      catalogo: [{ sheet_row: 1, sku: "SUNSU-HT-002", producto_servicio: "Serum", tipo: "PRODUCTO", subtotal: 20, precio_compra: 8, activo: true, orig: {}, origin: "sheet" }],
      tickets: [{ id: 1, sheet_row: 1, nombre: "Real", origin: "beta" }],
      audit_log: [{ id: 1, tabla: "tickets", accion: "INSERT", origin: "sheet" }],
    });
    const adminC = ctx(db, "admin", "emi", "Emi");
    const ses = await db.all("sesiones");
    ses.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z", modo_prueba: true });
    ses.find((r) => r.token === adminC.token)!.modo_prueba = true;
    db.tables.set("sesiones", ses);
    const ped = await handle("solicitud_crear", {
      token: "t-andrea", tabla: "catalogo", fila: "SUNSU-HT-002", tipo: "cambio", motivo: "nombre", propuestos: { nombre: "Sérum" },
    }, adminC) as Row;
    assert.equal(ped.ok, true);
    assert.equal((await db.all("solicitudes_cambio"))[0].origin, "test");
    const no = await handle("solicitud_resolver", { token: adminC.token, id: ped.id, aprobar: false, comentario: "luego" }, adminC) as Row;
    assert.equal(no.estado, "rechazado");
    const sol = (await db.all("solicitudes_cambio"))[0];
    assert.equal(sol.estado, "rechazado");
    assert.equal(sol.comentario, "luego");
    assert.equal(sol.origin, "test");
    const creado = await handle("inline_guardar", {
      token: adminC.token, tabla: "catalogo", fila: "nuevo", campos: { sku: "HT-091", nombre: "Test", subtotal: 10, compra: 2 },
    }, adminC) as Row;
    assert.equal(creado.ok, true);
    assert.equal((await db.all("catalogo")).find((r) => String(r.sku).includes("HT-091"))?.origin, "test");
    const ped2 = await handle("solicitud_crear", {
      token: "t-andrea", tabla: "catalogo", fila: "SUNSU-HT-091", tipo: "cambio", motivo: "nombre", propuestos: { nombre: "Test 2" },
    }, adminC) as Row;
    const ap = await handle("solicitud_resolver", { token: adminC.token, id: ped2.id, aprobar: true }, adminC) as Row;
    assert.equal(ap.estado, "aprobado");
    assert.equal((await db.all("catalogo")).find((r) => String(r.sku).includes("HT-091"))?.producto_servicio, "Test 2");
    const audAntes = (await db.all("audit_log")).length;
    assert.ok(audAntes > 1);
    const purga = await handle("prueba_borrar", { token: adminC.token }, adminC) as Row;
    assert.equal(purga.ok, true);
    assert.equal((await db.all("solicitudes_cambio")).length, 0);
    assert.equal((await db.all("catalogo")).some((r) => r.origin === "test"), false);
    assert.equal((await db.all("catalogo")).some((r) => String(r.sku).includes("HT-002")), true);
    assert.equal((await db.all("tickets"))[0].nombre, "Real");
    assert.ok((await db.all("audit_log")).length >= audAntes);
  });

  it("el admin edita el catálogo y el inventario en línea y el personal pide el cambio", async () => {
    const db = new MemoryDb({
      usuarios: [
        { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
        { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      ],
      push_suscripciones: [{ endpoint: "https://push.example/emi", persona: "Emi", p256dh: "k", auth: "a" }],
    });
    const adminC = ctx(db, "admin", "emi", "Emi");
    const ses = await db.all("sesiones");
    ses.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    db.tables.set("sesiones", ses);
    const nuevo = await handle("inline_guardar", {
      token: adminC.token, tabla: "catalogo", fila: "nuevo", campos: { sku: "HT-090", nombre: "Serum", subtotal: 20, compra: 8 },
    }, adminC) as Row;
    assert.equal(nuevo.ok, true);
    assert.equal(nuevo.fila, "SUNSU-HT-090");
    const row = (await db.all("catalogo")).find((r) => r.sku === "SUNSU-HT-090");
    assert.equal(row?.total_con_iva, 23);
    const no = await handle("inline_guardar", { token: "t-andrea", tabla: "catalogo", fila: "SUNSU-HT-090", campos: { nombre: "X" } }, adminC) as Row;
    assert.match(String(no.error), /admin/i);
    const ped = await handle("solicitud_crear", {
      token: "t-andrea", tabla: "catalogo", fila: "SUNSU-HT-090", tipo: "cambio", motivo: "el nombre", propuestos: { nombre: "Sérum" },
    }, adminC) as Row;
    const ok = await handle("solicitud_resolver", { token: adminC.token, id: ped.id, aprobar: true }, adminC) as Row;
    assert.equal(ok.estado, "aprobado");
    assert.equal((await db.all("catalogo")).find((r) => r.sku === "SUNSU-HT-090")?.producto_servicio, "Sérum");
    const borrado = await handle("inline_borrar", { token: adminC.token, tabla: "catalogo", fila: "SUNSU-HT-090" }, adminC) as Row;
    assert.equal(borrado.ok, true);
    const cat = await handle("getCatalogo", { token: adminC.token }, adminC) as Row[];
    assert.equal(cat.find((r) => r.sku === "SUNSU-HT-090")?.activo, false);
    const min = await handle("inline_guardar", { token: adminC.token, tabla: "inventario", fila: "SUNSU-HT-090", campos: { minimo: 4 } }, adminC) as Row;
    assert.equal(min.ok, true);
    assert.equal((await db.all("inventario_base")).find((r) => String(r.sku).includes("HT-090"))?.minimo, 4);
    const inv = await handle("getInventario", { token: adminC.token }, adminC) as Row;
    assert.equal((inv.items as Row[]).find((r) => String(r.sku).endsWith("HT-090"))?.minimo, 4);
  });

  it("el admin edita proveedores y líneas de compra en línea", async () => {
    const db = new MemoryDb({
      usuarios: [
        { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
        { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      ],
      app_modulos: [
        { rol: "cosmetologa", modulo: "proveedores", acceso: "todos" },
        { rol: "cosmetologa", modulo: "compras", acceso: "todos" },
      ],
      inventario_entradas: [
        { sheet_row: 3, sku: "SUNSU-HT-002", producto: "Serum", proveedor: "Hebetronic", cant_pedida: 2, orden: "OC-0001", cant_recibida_llenar_aqui: "", orig: {} },
        { sheet_row: 4, sku: "SUNSU-HT-004", producto: "Crema", proveedor: "Hebetronic", cant_pedida: 1, orden: "OC-0001", cant_recibida_llenar_aqui: 1, orig: {} },
      ],
      push_suscripciones: [{ endpoint: "https://push.example/emi", persona: "Emi", p256dh: "k", auth: "a" }],
    });
    const adminC = ctx(db, "admin", "emi", "Emi");
    const ses = await db.all("sesiones");
    ses.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    db.tables.set("sesiones", ses);
    const nuevo = await handle("inline_guardar", {
      token: adminC.token, tabla: "proveedores", fila: "nuevo", campos: { nombre: "Hebetronic", familia: "ht", ruc: "179" },
    }, adminC) as Row;
    assert.equal(nuevo.ok, true);
    const prov = (await db.all("proveedores")).find((r) => r.nombre === "Hebetronic");
    assert.equal(prov?.familia, "HT");
    const no = await handle("inline_guardar", { token: "t-andrea", tabla: "proveedores", fila: String(prov?.sheet_row), campos: { nombre: "Heb" } }, adminC) as Row;
    assert.match(String(no.error), /admin/i);
    const ped = await handle("solicitud_crear", {
      token: "t-andrea", tabla: "proveedores", fila: String(prov?.sheet_row), tipo: "cambio", motivo: "razón social", propuestos: { nombre: "Hebetronic S.A." },
    }, adminC) as Row;
    const ok = await handle("solicitud_resolver", { token: adminC.token, id: ped.id, aprobar: true }, adminC) as Row;
    assert.equal(ok.estado, "aprobado");
    assert.equal((await db.all("proveedores"))[0].nombre, "Hebetronic S.A.");
    const linea = await handle("inline_guardar", { token: adminC.token, tabla: "compras", fila: "3", campos: { pedida: 6 } }, adminC) as Row;
    assert.equal(linea.ok, true);
    const ent = await handle("getEntradas", { token: adminC.token }, adminC) as Row;
    assert.equal((ent.items as Row[]).find((r) => r.fila === 3)?.pedida, 6);
    const marcada = await handle("inline_borrar", { token: adminC.token, tabla: "compras", fila: "4" }, adminC) as Row;
    assert.match(String(marcada.error), /marcada/i);
    const borrada = await handle("inline_borrar", { token: adminC.token, tabla: "compras", fila: "3" }, adminC) as Row;
    assert.equal(borrada.ok, true);
    assert.equal((await db.all("inventario_entradas")).some((r) => r.sheet_row === 3), false);
    const baja = await handle("inline_borrar", { token: adminC.token, tabla: "proveedores", fila: String(prov?.sheet_row) }, adminC) as Row;
    assert.equal(baja.ok, true);
    assert.equal((await db.all("proveedores")).length, 0);
  });

  it("la tabla de proveedores suma órdenes sin duplicar la misma OC y abre el detalle", async () => {
    const db = new MemoryDb({
      usuarios: [{ id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false }],
      proveedores: [
        { sheet_row: 3, nombre: "Hebetronic S.A.", familia: "ht", ruc: "179", telefono: "099", email: "a@b.c", direccion: "Quito", notas: "", orig: {} },
        { sheet_row: 4, nombre: "Allskin", familia: "AS", ruc: "", telefono: "", email: "", direccion: "", notas: "", orig: {} },
      ],
      erp_proveedores: [{ id: "p-ht", nombre: "Hebetronic", ruc: "179", legacy_sheet_row: 3 }],
      erp_oc: [
        { id: "oc-1", numero: "OC-0001", proveedor_id: "p-ht", fecha: "2026-10-15", flujo: "Enviada", estado: "abierta", total: 100, saldo: 40 },
      ],
      ordenes_compra: [
        { sheet_row: 1, numorden: "OC-0001", fecha: "2026-10-15", proveedor: "Hebetronic S.A.", json: { fact: [{ vendido: 9, compra: 9 }] }, orig: {} },
        { sheet_row: 2, numorden: "OC-0002", fecha: "2026-09-01", proveedor: "Hebetronic", json: { fact: [{ vendido: 2, compra: 10 }] }, orig: {} },
      ],
    });
    const c = ctx(db, "admin", "emi", "Emi");
    const tabla = await handle("getProveedoresTabla", { token: c.token }, c) as Row;
    const heb = (tabla.items as Row[]).find((r) => r.fila === "3");
    assert.equal(heb?.codigo, "HT");
    assert.equal(heb?.ordenes, 2);
    assert.equal(heb?.total, 120);
    assert.equal(heb?.saldo, 60);
    const ocs = heb?.ocs as Row[];
    assert.equal(ocs[0].numero, "OC-0001");
    assert.equal(ocs[0].id, "oc-1");
    assert.equal(ocs[1].numero, "OC-0002");
    assert.equal(ocs[1].id, "");
    const all = (tabla.items as Row[]).find((r) => r.codigo === "AS");
    assert.equal(all?.ordenes, 0);
    const cosm = ctx(new MemoryDb(), "cosmetologa", "andrea", "Andrea");
    const no = await handle("getProveedoresTabla", { token: cosm.token }, cosm) as Row;
    assert.match(String(no.error), /permiso/i);
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    const screens = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    assert.match(beta, /window\.state = state/);
    assert.match(beta, /id="prov-q"/);
    assert.match(beta, /\+ Agregar proveedor/);
    assert.match(beta, /data-prov-sort/);
    assert.match(beta, /Saldo pendiente/);
    assert.match(beta, /if \(m === "proveedores"\) return "";/);
    assert.match(screens, /go\("#\/m\/proveedores"/);
    assert.match(screens, /function renderProveedores\(c\)\{\s*var fila = window\._provFila/);
  });

  it("0026 purga proveedores e inventario_entradas y el resto de tablas con origin", () => {
    const nombres = (sql: string, marker: string) => {
      const i = sql.indexOf(marker);
      assert.ok(i >= 0, marker);
      const slice = sql.slice(i, sql.indexOf("];", i));
      return [...slice.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
    };
    const write = readFileSync(new URL("../../../docs/supabase/pending/0024_prueba_audit.sql", import.meta.url), "utf8");
    const modo = readFileSync(new URL("../../../docs/supabase/pending/0016_modo_prueba.sql", import.meta.url), "utf8");
    const purga = readFileSync(new URL("../../../docs/supabase/pending/0026_purga_compras.sql", import.meta.url), "utf8");
    const allowed = new Set(nombres(write, "allowed text[] := array["));
    const origin = new Set([
      ...nombres(modo, "foreach t in array array["),
      "solicitudes_cambio", "catalogo", "proveedores", "inventario_entradas",
    ]);
    const tablas = nombres(purga, "tablas text[] := array[");
    assert.match(purga, /alter table public\.proveedores add column if not exists origin text/);
    assert.match(purga, /alter table public\.inventario_entradas add column if not exists origin text/);
    assert.equal(tablas.includes("proveedores"), true);
    assert.equal(tablas.includes("inventario_entradas"), true);
    assert.equal(tablas.includes("clientas_registro"), true);
    assert.equal(tablas.includes("audit_log"), false);
    for (const t of origin) {
      if (!allowed.has(t)) continue;
      assert.equal(tablas.includes(t), true, t);
    }
  });

  it("0027 guarda el borrado fuera de orig y el código de gift card es único", () => {
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0027_borrado_gc_paq.sql", import.meta.url), "utf8");
    const tickets = readFileSync(new URL("../../../docs/supabase/pending/0022_inline_solicitudes.sql", import.meta.url), "utf8");
    const clientes = readFileSync(new URL("../../../docs/supabase/pending/0023_clientes_inline.sql", import.meta.url), "utf8");
    assert.match(sql, /alter table public\.gift_cards add column if not exists borrado_at timestamptz/);
    assert.match(sql, /alter table public\.gift_cards add column if not exists borrado_por text/);
    assert.match(sql, /alter table public\.paquetes add column if not exists borrado_at timestamptz/);
    assert.match(sql, /alter table public\.paquetes add column if not exists borrado_por text/);
    assert.match(sql, /orig, '\{\}'::jsonb\)->>'borrado' = 'true'/);
    assert.match(sql, /drop index if exists public\.gift_cards_codigo_uidx/);
    assert.doesNotMatch(sql, /create unique index/i);
    assert.match(sql, /create index if not exists gift_cards_codigo_lower_idx/);
    assert.match(sql, /create trigger trg_gift_cards_zz_codigo_unico/);
    assert.match(sql, /gift_cards_codigo_unico\(\)/);
    assert.match(sql, /origin in \('beta', 'test'\)/);
    assert.match(sql, /lower\(btrim\(codigo_gc\)\)/);
    const desde = sql.indexOf("if exists (");
    const existe = sql.slice(desde, sql.indexOf(") then", desde));
    assert.match(existe, /lower\(btrim\(g\.codigo_gc\)\) = lower\(btrim\(new\.codigo_gc\)\)/);
    assert.match(existe, /g\.id is distinct from new\.id/);
    assert.doesNotMatch(existe, /g\.origin/);
    assert.doesNotMatch(existe, /borrado_at/);
    assert.doesNotMatch(sql, /alter table public\.tickets/i);
    assert.doesNotMatch(sql, /alter table public\.clientas_registro/i);
    assert.match(tickets, /alter table public\.tickets add column if not exists borrado_at timestamptz/);
    assert.match(tickets, /alter table public\.tickets add column if not exists borrado_por text/);
    assert.match(clientes, /alter table public\.clientas_registro add column if not exists borrado_at timestamptz/);
    assert.match(clientes, /alter table public\.clientas_registro add column if not exists borrado_por text/);
  });

  it("el admin edita gift cards y paquetes en línea y el borrado suave los esconde", async () => {
    const db = new MemoryDb({
      usuarios: [
        { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
        { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      ],
      app_modulos: [
        { rol: "cosmetologa", modulo: "gift_cards", acceso: "todos" },
        { rol: "cosmetologa", modulo: "paquetes", acceso: "todos" },
      ],
      gift_cards: [{ sheet_row: 2, codigo_gc: "26-001", dia: null, orig: {}, origin: "sheet" }],
      proveedores: [{ sheet_row: 1, nombre: "Real", familia: "HT", orig: {}, origin: "sheet" }],
      inventario_entradas: [{ sheet_row: 8, sku: "SUNSU-HT-001", producto: "Real", cant_pedida: 1, orig: {}, origin: "sheet" }],
    });
    const adminC = ctx(db, "admin", "emi", "Emi");
    const ses = await db.all("sesiones");
    ses.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    db.tables.set("sesiones", ses);
    const nueva = await handle("inline_guardar", {
      token: adminC.token, tabla: "gift_cards", fila: "nuevo", campos: { codigo: "26-099", nombre: "Ana", valor: "50" },
    }, adminC) as Row;
    assert.equal(nueva.ok, true);
    const busca = await handle("buscarGiftCards", { token: adminC.token, q: "Ana" }, adminC) as Row;
    assert.equal((busca.resultados as Row[])[0].codigo, "26-099");
    const no = await handle("inline_guardar", { token: "t-andrea", tabla: "gift_cards", fila: String(nueva.fila), campos: { valor: "80" } }, adminC) as Row;
    assert.match(String(no.error), /admin/i);
    const ped = await handle("solicitud_crear", {
      token: "t-andrea", tabla: "gift_cards", fila: String(nueva.fila), tipo: "cambio", motivo: "el valor", propuestos: { valor: "80" },
    }, adminC) as Row;
    const ok = await handle("solicitud_resolver", { token: adminC.token, id: ped.id, aprobar: true }, adminC) as Row;
    assert.equal(ok.estado, "aprobado");
    const vendida = (await db.all("gift_cards")).find((r) => r.codigo_gc === "26-099");
    assert.equal(vendida?.valor, "80");
    assert.ok(vendida?.dia);
    const baja = await handle("inline_borrar", { token: adminC.token, tabla: "gift_cards", fila: String(nueva.fila) }, adminC) as Row;
    assert.equal(baja.ok, true);
    const oculta = await handle("buscarGiftCards", { token: adminC.token, q: "26-099" }, adminC) as Row;
    assert.equal((oculta.resultados as Row[]).length, 0);
    const queda = (await db.all("gift_cards")).find((r) => r.codigo_gc === "26-099");
    assert.ok(queda?.borrado_at);
    assert.equal(queda?.borrado_por, "Emi (emi)");
    assert.equal((queda?.orig as Row).borrado, undefined);
    assert.ok(queda?.dia);
    const re = await handle("inline_guardar", {
      token: adminC.token, tabla: "gift_cards", fila: "nuevo", campos: { codigo: "26-099" },
    }, adminC) as Row;
    assert.match(String(re.error), /ya existe/i);
    const reFila = await handle("inline_guardar", {
      token: adminC.token, tabla: "gift_cards", fila: "2", campos: { codigo: "26-099" },
    }, adminC) as Row;
    assert.match(String(reFila.error), /ya existe/i);
    const lista = await handle("gc_list", { token: adminC.token, q: "26-099" }, adminC) as Row;
    assert.equal((lista.items as Row[]).length, 0);
    const libre = await handle("getCodigoGC", { token: adminC.token }, adminC) as Row;
    assert.equal(libre.codigo, "26-001");
    const bajaBlanca = await handle("inline_borrar", { token: adminC.token, tabla: "gift_cards", fila: "2" }, adminC) as Row;
    assert.equal(bajaBlanca.ok, true);
    const sin = await handle("getCodigoGC", { token: adminC.token }, adminC) as Row;
    assert.match(String(sin.error), /sin códigos/i);
    const paq = await handle("inline_guardar", {
      token: adminC.token, tabla: "paquetes", fila: "nuevo", campos: { nombre: "Luz", sku: "SUNSU-P3", paquete: "Pack 3" },
    }, adminC) as Row;
    assert.equal(paq.ok, true);
    const seg = await handle("getSeguimientoPaquetes", { token: adminC.token }, adminC) as Row;
    assert.equal((seg.items as Row[]).some((r) => r.nombre === "Luz"), true);
    const bajaPaq = await handle("inline_borrar", { token: adminC.token, tabla: "paquetes", fila: String(paq.fila) }, adminC) as Row;
    assert.equal(bajaPaq.ok, true);
    const seg2 = await handle("getSeguimientoPaquetes", { token: adminC.token }, adminC) as Row;
    assert.equal((seg2.items as Row[]).length, 0);
    const paqRow = (await db.all("paquetes"))[0];
    assert.ok(paqRow.borrado_at);
    assert.equal(paqRow.borrado_por, "Emi (emi)");
    assert.equal((paqRow.orig as Row).borrado, undefined);
    ses.find((r) => r.token === adminC.token)!.modo_prueba = true;
    const prov = await handle("inline_guardar", {
      token: adminC.token, tabla: "proveedores", fila: "nuevo", campos: { nombre: "Prueba", familia: "ht" },
    }, adminC) as Row;
    assert.equal(prov.ok, true);
    assert.equal((await db.all("proveedores")).find((r) => r.nombre === "Prueba")?.origin, "test");
    const linea = await handle("inline_guardar", {
      token: adminC.token, tabla: "compras", fila: "nuevo", campos: { sku: "HT-009", nombre: "Test", pedida: 2 },
    }, adminC) as Row;
    assert.equal(linea.ok, true);
    assert.equal((await db.all("inventario_entradas")).find((r) => r.producto === "Test")?.origin, "test");
    const purga = await handle("prueba_borrar", { token: adminC.token }, adminC) as Row;
    assert.equal(purga.ok, true);
    assert.equal((await db.all("proveedores")).some((r) => r.origin === "test"), false);
    assert.equal((await db.all("proveedores")).some((r) => r.nombre === "Real"), true);
    assert.equal((await db.all("inventario_entradas")).some((r) => r.origin === "test"), false);
    assert.equal((await db.all("inventario_entradas")).some((r) => r.producto === "Real"), true);
  });

  it("el admin edita personal en línea y el borrado queda fuera de orig", async () => {
    const db = new MemoryDb({
      usuarios: [
        { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
        { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      ],
      rrhh_empleadas: [{ nombre_app: "Andrea Robles", fecha_ingreso: "2020-01-01", sueldo_base: 482 }],
    });
    const adminC = ctx(db, "admin", "emi", "Emi");
    const ses = await db.all("sesiones");
    ses.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    db.tables.set("sesiones", ses);
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0028_borrado_personal.sql", import.meta.url), "utf8");
    assert.match(sql, /alter table public\.permisos add column if not exists borrado_at/);
    assert.match(sql, /alter table public\.multas_descuentos add column if not exists borrado_at/);
    assert.match(sql, /alter table public\.horarios add column if not exists borrado_at/);

    const multa = await handle("inline_guardar", {
      token: adminC.token, tabla: "multas", fila: "nuevo", campos: { cosmetologa: "Andrea Robles", tipo: "MULTA", monto: "10", motivo: "tarde", fecha: "2026-10-21" },
    }, adminC) as Row;
    assert.equal(multa.ok, true);
    const noMulta = await handle("inline_guardar", { token: "t-andrea", tabla: "multas", fila: String(multa.fila), campos: { monto: "5" } }, adminC) as Row;
    assert.match(String(noMulta.error), /admin/i);
    const ped = await handle("solicitud_crear", {
      token: "t-andrea", tabla: "multas", fila: String(multa.fila), tipo: "cambio", motivo: "fue 5", propuestos: { monto: "5" },
    }, adminC) as Row;
    const ok = await handle("solicitud_resolver", { token: adminC.token, id: ped.id, aprobar: true }, adminC) as Row;
    assert.equal(ok.estado, "aprobado");
    assert.equal(Number((await db.all("multas_descuentos"))[0].monto), 5);
    const bajaM = await handle("inline_borrar", { token: adminC.token, tabla: "multas", fila: String(multa.fila) }, adminC) as Row;
    assert.equal(bajaM.ok, true);
    const listaM = await handle("getMultas", { token: adminC.token }, adminC) as Row;
    assert.equal((listaM.items as Row[]).length, 0);
    assert.ok((await db.all("multas_descuentos"))[0].borrado_at);

    const perm = await handle("inline_guardar", {
      token: adminC.token, tabla: "permisos", fila: "nuevo",
      campos: { empleada: "Andrea Robles", tipo: "PERMISO", desde: "2026-10-22", hasta: "2026-10-22", motivo: "médico", estado: "APROBADO" },
    }, adminC) as Row;
    assert.equal(perm.ok, true);
    const hoy = await handle("asis_hoy", { token: adminC.token }, adminC) as Row;
    assert.equal((hoy.permisos as Row[]).some((p) => p.empleada === "Andrea Robles"), true);
    const bajaP = await handle("inline_borrar", { token: adminC.token, tabla: "permisos", fila: String(perm.fila) }, adminC) as Row;
    assert.equal(bajaP.ok, true);
    const hoy2 = await handle("asis_hoy", { token: adminC.token }, adminC) as Row;
    assert.equal((hoy2.permisos as Row[]).length, 0);
    assert.ok((await db.all("permisos"))[0].borrado_at);

    const hor = await handle("inline_guardar", {
      token: adminC.token, tabla: "horarios", fila: "nuevo", campos: { nombre: "Mar-Sáb", arreglo: "fijo" },
    }, adminC) as Row;
    assert.equal(hor.ok, true);
    const listaH = await handle("horarios_list", { token: adminC.token }, adminC) as Row;
    assert.equal((listaH.horarios as Row[]).some((h) => h.nombre === "Mar-Sáb"), true);
    const bajaH = await handle("inline_borrar", { token: adminC.token, tabla: "horarios", fila: String(hor.fila) }, adminC) as Row;
    assert.equal(bajaH.ok, true);
    const listaH2 = await handle("horarios_list", { token: adminC.token }, adminC) as Row;
    assert.equal((listaH2.horarios as Row[]).length, 0);
    assert.ok((await db.all("horarios"))[0].borrado_at);

    const marca = await handle("inline_guardar", {
      token: adminC.token, tabla: "asistencia", fila: "nuevo",
      campos: { nombre: "Andrea Robles", tipo: "entrada", fecha: "2026-10-21", hora: "09:05", motivo: "olvidó el reloj" },
    }, adminC) as Row;
    assert.equal(marca.ok, true);
    const corr = await handle("inline_guardar", {
      token: adminC.token, tabla: "asistencia", fila: String(marca.fila), campos: { hora: "09:10", motivo: "la hora real" },
    }, adminC) as Row;
    assert.equal(corr.ok, true);
    const anula = await handle("inline_borrar", { token: adminC.token, tabla: "asistencia", fila: String(marca.fila), motivo: "duplicada" }, adminC) as Row;
    assert.equal(anula.ok, true);
    assert.equal((await db.all("asistencia_marcajes"))[0].anulado, true);

    const fer = await handle("inline_guardar", {
      token: adminC.token, tabla: "feriados", fila: "nuevo", campos: { fecha: "2026-12-25", nombre: "Navidad" },
    }, adminC) as Row;
    assert.equal(fer.ok, true);
    const bajaF = await handle("inline_borrar", { token: adminC.token, tabla: "feriados", fila: "2026-12-25" }, adminC) as Row;
    assert.equal(bajaF.ok, true);
    assert.equal((await db.all("asistencia_feriados")).length, 0);

    const pago = await handle("inline_guardar", {
      token: adminC.token, tabla: "pago_config", fila: "nuevo",
      campos: { nombre: "Andrea Robles", vigente: "2026-10-01", sueldo: "482", bono: "20", iess: "9.45", fondo: "SI" },
    }, adminC) as Row;
    assert.equal(pago.ok, true);
    const pago2 = await handle("inline_guardar", {
      token: adminC.token, tabla: "pago_config", fila: String(pago.fila), campos: { sueldo: "500" },
    }, adminC) as Row;
    assert.equal(pago2.ok, true);
    assert.equal(Number((await db.all("pago_config"))[0].sueldo), 500);
    const bajaC = await handle("inline_borrar", { token: adminC.token, tabla: "pago_config", fila: String(pago.fila) }, adminC) as Row;
    assert.equal(bajaC.ok, true);
    assert.equal((await db.all("pago_config")).length, 0);
  });

  it("en modo prueba el alta devuelve la fila real y un horario de prueba se borra", async () => {
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0029_horarios_origin.sql", import.meta.url), "utf8");
    assert.match(sql, /alter table public\.horarios add column if not exists origin text/);
    assert.match(sql, /'horarios','horario_dias','horario_descansos','horario_deducciones','horario_asignaciones'/);
    const db = new MemoryDb({
      usuarios: [
        { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
      ],
      gift_cards: [
        { sheet_row: 554, codigo_gc: "26-008", origin: "sheet", orig: {} },
        { sheet_row: 555, codigo_gc: "26-008", origin: "sheet", orig: {} },
      ],
      horarios: [{ id: "real-h", nombre: "Lun-Vie", arreglo: "fijo", es_default: true }],
    });
    const adminC = ctx(db, "admin", "emi", "Emi");
    db.tables.get("sesiones")!.find((r) => r.token === adminC.token)!.modo_prueba = true;
    const nueva = await handle("inline_guardar", {
      token: adminC.token, tabla: "gift_cards", fila: "nuevo", campos: { codigo: "26-200", nombre: "Ana" },
    }, adminC) as Row;
    assert.equal(nueva.ok, true);
    const card = (await db.all("gift_cards")).find((r) => r.codigo_gc === "26-200");
    assert.equal(String(nueva.fila), String(card?.sheet_row));
    assert.equal(Number(card?.sheet_row) < 0, true);
    assert.equal(card?.origin, "test");
    const baja = await handle("inline_borrar", { token: adminC.token, tabla: "gift_cards", fila: String(nueva.fila) }, adminC) as Row;
    assert.equal(baja.ok, true);
    const dupHoja = (await db.all("gift_cards")).filter((r) => r.codigo_gc === "26-008");
    assert.equal(dupHoja.length, 2);

    const paq = await handle("inline_guardar", {
      token: adminC.token, tabla: "paquetes", fila: "nuevo", campos: { nombre: "Luz", sku: "SUNSU-P3" },
    }, adminC) as Row;
    assert.equal(String(paq.fila), String((await db.all("paquetes")).find((r) => r.nombres === "Luz")?.sheet_row));
    const multa = await handle("inline_guardar", {
      token: adminC.token, tabla: "multas", fila: "nuevo", campos: { cosmetologa: "Emi", tipo: "MULTA", monto: "4", motivo: "tarde" },
    }, adminC) as Row;
    assert.equal(String(multa.fila), String((await db.all("multas_descuentos"))[0]?.sheet_row));
    const perm = await handle("inline_guardar", {
      token: adminC.token, tabla: "permisos", fila: "nuevo",
      campos: { empleada: "Emi", tipo: "PERMISO", desde: "2026-10-22", hasta: "2026-10-22", motivo: "médico" },
    }, adminC) as Row;
    assert.equal(String(perm.fila), String((await db.all("permisos"))[0]?.sheet_row));

    const hor = await handle("inline_guardar", {
      token: adminC.token, tabla: "horarios", fila: "nuevo", campos: { nombre: "Mar-Sáb", arreglo: "fijo" },
    }, adminC) as Row;
    assert.equal(hor.ok, true);
    assert.equal((await db.all("horarios")).find((r) => r.id === hor.fila)?.origin, "test");
    const bajaH = await handle("inline_borrar", { token: adminC.token, tabla: "horarios", fila: String(hor.fila) }, adminC) as Row;
    assert.equal(bajaH.ok, true);
    assert.ok((await db.all("horarios")).find((r) => r.id === hor.fila)?.borrado_at);
    const real = await handle("inline_borrar", { token: adminC.token, tabla: "horarios", fila: "real-h" }, adminC) as Row;
    assert.match(String(real.error), /prueba/i);
    assert.equal((await db.all("horarios")).find((r) => r.id === "real-h")?.borrado_at, undefined);
  });

  it("el admin edita usuarios, accesos y lugares en línea", async () => {
    const db = new MemoryDb({
      usuarios: [
        { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
        { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      ],
      erp_locales: [{ id: LOCAL_ESQUINA, codigo: "ESQUINA", nombre: "La Esquina", direccion: "Cumbayá", activo: true }],
      erp_bodegas: [{ id: "44444444-4444-4444-8444-444444444444", codigo: "CASA", nombre: "Casa", tipo: "casa", activo: true }],
    });
    const adminC = ctx(db, "admin", "emi", "Emi");
    const ses = await db.all("sesiones");
    ses.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    db.tables.set("sesiones", ses);
    const nuevo = await handle("inline_guardar", {
      token: adminC.token, tabla: "usuarios", fila: "nuevo", campos: { nombre: "Rosa Díaz", short: "Rosa", rol: "recepcion" },
    }, adminC) as Row;
    assert.equal(nuevo.ok, true);
    const rosa = (await db.all("usuarios")).find((r) => r.id === nuevo.fila);
    assert.equal(rosa?.rol, "recepcion");
    const no = await handle("inline_guardar", { token: "t-andrea", tabla: "usuarios", fila: String(nuevo.fila), campos: { short: "R" } }, adminC) as Row;
    assert.match(String(no.error), /admin/i);
    const ped = await handle("solicitud_crear", {
      token: "t-andrea", tabla: "usuarios", fila: String(nuevo.fila), tipo: "cambio", motivo: "el corto", propuestos: { short: "Ros" },
    }, adminC) as Row;
    const ok = await handle("solicitud_resolver", { token: adminC.token, id: ped.id, aprobar: true }, adminC) as Row;
    assert.equal(ok.estado, "aprobado");
    assert.equal((await db.all("usuarios")).find((r) => r.id === nuevo.fila)?.short, "Ros");
    const baja = await handle("inline_borrar", { token: adminC.token, tabla: "usuarios", fila: String(nuevo.fila) }, adminC) as Row;
    assert.equal(baja.ok, true);
    assert.equal((await db.all("usuarios")).some((r) => r.id === nuevo.fila), false);
    assert.ok((await db.all("audit_log")).some((r) => r.tabla === "usuarios" && r.accion === "DELETE"));

    const celda = await handle("inline_guardar", {
      token: adminC.token, tabla: "acceso", fila: "recepcion|tickets", campos: { acceso: "todos" },
    }, adminC) as Row;
    assert.equal(celda.ok, true);
    assert.equal((await db.all("app_modulos")).find((r) => r.rol === "recepcion" && r.modulo === "tickets")?.acceso, "todos");
    const costos = await handle("inline_guardar", {
      token: adminC.token, tabla: "acceso", fila: "recepcion|ver_costos", campos: { acceso: "todos" },
    }, adminC) as Row;
    assert.match(String(costos.error), /costos/i);
    const quita = await handle("inline_borrar", { token: adminC.token, tabla: "acceso", fila: "recepcion|tickets" }, adminC) as Row;
    assert.equal(quita.ok, true);
    assert.equal((await db.all("app_modulos")).length, 0);

    const cab = await handle("inline_guardar", {
      token: adminC.token, tabla: "lugares", fila: "nuevo", campos: { tipo: "cabina", nombre: "Cabina 4", local: LOCAL_ESQUINA },
    }, adminC) as Row;
    assert.equal(cab.ok, true);
    assert.match(String(cab.fila), /^B:/);
    const ren = await handle("inline_guardar", {
      token: adminC.token, tabla: "lugares", fila: String(cab.fila), campos: { nombre: "Cabina norte" },
    }, adminC) as Row;
    assert.equal(ren.ok, true);
    const casa = await handle("inline_borrar", { token: adminC.token, tabla: "lugares", fila: "B:44444444-4444-4444-8444-444444444444" }, adminC) as Row;
    assert.match(String(casa.error), /Casa/);
    const fuera = await handle("inline_borrar", { token: adminC.token, tabla: "lugares", fila: String(cab.fila) }, adminC) as Row;
    assert.equal(fuera.ok, true);
    assert.equal((await db.all("erp_bodegas")).find((r) => r.nombre === "Cabina norte")?.activo, false);
    const pide = await handle("solicitud_crear", {
      token: "t-andrea", tabla: "lugares", fila: "L:" + LOCAL_ESQUINA, tipo: "cambio", motivo: "el nombre", propuestos: { nombre: "Esquina" },
    }, adminC) as Row;
    assert.equal(pide.ok, true);
  });

  it("la configuración general cambia la comisión desde su vigencia y el rol lee el sueldo", async () => {
    const db = new MemoryDb({
      usuarios: [
        { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
        { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      ],
      cosmetologas: [{ id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true }],
      tickets: [
        { id: 1, sheet_row: 1, timestamp: "2026-10-01T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0101", facial_hecho: "SUNSU-01", orig: {} },
        { id: 2, sheet_row: 2, timestamp: "2026-10-27T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0101", facial_hecho: "SUNSU-01", compra_pack_3: "SUNSU-60", ht_002: 2, orig: {} },
      ],
      catalogo: [
        { sku: "SUNSU-60", producto_servicio: "Pack", subtotal: 33, tipo: "PAQUETE", orig: {} },
        { sku: "HT-002", producto_servicio: "Serum", tipo: "PRODUCTO", subtotal: 20, precio_compra: 8, orig: {} },
      ],
      rrhh_empleadas: [{ nombre_app: "Andrea Robles", sueldo_base: 460, bono_fijo: 0, fondo_reserva: "NO", fecha_ingreso: "2024-01-01" }],
    });
    const c = ctx(db, "admin", "emi", "Emi");
    db.tables.get("sesiones")!.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    const monto = async (desde: string, concepto: string) => {
      const tabla = await handle("getComisionesTabla", { token: c.token, desde, hasta: desde, persona: "Andrea" }, c) as Row;
      return ((tabla.filas as Row[]).find((f) => f.concepto === concepto)?.porCiclo as number[])[0];
    };
    assert.equal(await monto("2026-09-26", "Faciales"), 2);
    assert.equal(await monto("2026-10-26", "Faciales"), 2);
    assert.equal(await monto("2026-10-26", "Paquetes"), 1);
    assert.equal(await monto("2026-10-26", "Productos"), 7.2);
    const vista = await handle("config_general", { token: c.token }, c) as Row;
    assert.equal((vista.tramos as Row[])[0].valor, 5);
    assert.equal((vista.tramos as Row[])[0].modo, "pct");
    const facial = await handle("inline_guardar", {
      token: c.token, tabla: "com_facial", fila: "def|facial|SUNSU-01", campos: { monto: "9", vigente: "2026-10-26" },
    }, c) as Row;
    assert.equal(facial.ok, true);
    const despues = await handle("inline_guardar", {
      token: c.token, tabla: "com_facial", fila: String(facial.fila), campos: { monto: "4", vigente: "2026-11-26" },
    }, c) as Row;
    assert.equal(despues.ok, true);
    assert.equal(await monto("2026-09-26", "Faciales"), 2);
    assert.equal(await monto("2026-10-26", "Faciales"), 9);
    const prod = await handle("inline_guardar", {
      token: c.token, tabla: "com_producto", fila: "def|producto|HT-002", campos: { fijo: "4", pct: "", vigente: "2026-10-26" },
    }, c) as Row;
    assert.equal(prod.ok, true);
    assert.equal(await monto("2026-10-26", "Productos"), 8);
    assert.equal(await monto("2026-09-26", "Productos"), 0);
    const pago = await handle("inline_guardar", {
      token: c.token, tabla: "pago_config", fila: "nuevo",
      campos: { nombre: "Andrea Robles", vigente: "2026-10-26", sueldo: "500", bono: "15", iess: "9.45", fondo: "" },
    }, c) as Row;
    assert.equal(pago.ok, true);
    const rol = await handle("getRolCiclo", { token: c.token, desde: "2026-10-26", persona: "Andrea" }, c) as Row;
    assert.equal((rol.ingresos as Row[]).find((r) => r.concepto === "Sueldo")?.monto, 500);
    assert.equal((rol.ingresos as Row[]).find((r) => r.concepto === "Bono")?.monto, 15);
    assert.equal((rol.ingresos as Row[]).find((r) => r.concepto === "Faciales")?.monto, 9);
    const ajena = await handle("config_general", { token: "t-andrea" }, c) as Row;
    assert.match(String(ajena.error), /admin/i);
    const no = await handle("inline_guardar", {
      token: "t-andrea", tabla: "com_facial", fila: "def|facial|SUNSU-01", campos: { monto: "1", vigente: "2026-10-26" },
    }, c) as Row;
    assert.match(String(no.error), /admin/i);
    assert.ok((await db.all("audit_log")).some((r) => r.tabla === "comision_reglas" && r.accion === "INSERT"));
  });

  it("modo prueba no escribe la configuración real de comisiones ni de roles", async () => {
    const db = new MemoryDb({
      usuarios: [{ id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false }],
      app_kv: [
        { clave: "comision_reglas", valor: { filas: [{ tipo: "facial", clave: "SUNSU-01", vigente_desde: "2026-10-26", monto: 2 }] } },
        { clave: "pago_config", valor: { filas: [{ nombre: "Andrea Robles", vigente_desde: "2026-10-26", sueldo: 460, bono: 0 }] } },
      ],
      pago_config: [{ id: 1, nombre: "Andrea Robles", vigente_desde: "2026-10-26", sueldo: 460, bono: 0, origin: "sheet" }],
    });
    const c = ctx(db, "admin", "emi", "Emi");
    db.tables.get("sesiones")!.find((r) => r.token === c.token)!.modo_prueba = true;
    const facial = await handle("inline_guardar", {
      token: c.token, tabla: "com_facial", fila: "def|facial|SUNSU-01", campos: { monto: "9", vigente: "2026-10-26" },
    }, c) as Row;
    assert.match(String(facial.error), /prueba/i);
    const borrar = await handle("inline_borrar", {
      token: c.token, tabla: "com_facial", fila: "facial|SUNSU-01|2026-10-26",
    }, c) as Row;
    assert.match(String(borrar.error), /prueba/i);
    const pago = await handle("inline_guardar", {
      token: c.token, tabla: "pago_config", fila: "nuevo",
      campos: { nombre: "Andrea Robles", vigente: "2026-10-26", sueldo: "999", bono: "1" },
    }, c) as Row;
    assert.match(String(pago.error), /prueba/i);
    const quitar = await handle("inline_borrar", {
      token: c.token, tabla: "pago_config", fila: "1",
    }, c) as Row;
    assert.match(String(quitar.error), /prueba/i);
    const viejo = await handle("pago_config_guardar", {
      token: c.token, nombre: "Andrea Robles", vigente_desde: "2026-10-26", sueldo: 999, bono: 1,
    }, c) as Row;
    assert.match(String(viejo.error), /prueba/i);
    const tramos = await handle("tramos_guardar", {
      token: c.token, tramos: [{ desde: 1, hasta: 10, modo: "pct", valor: 50 }],
    }, c) as Row;
    assert.match(String(tramos.error), /prueba/i);
    const kv = await db.all("app_kv");
    const reglas = kv.find((r) => r.clave === "comision_reglas")!.valor as Row;
    assert.equal((reglas.filas as Row[])[0].monto, 2);
    const pagos = kv.find((r) => r.clave === "pago_config")!.valor as Row;
    assert.equal((pagos.filas as Row[])[0].sueldo, 460);
    assert.equal((await db.all("pago_config"))[0].sueldo, 460);
  });
});

function escalonLive() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const src = readFileSync(join(root, "sunsu_script_completo.js"), "utf8");
  const a = src.indexOf("// --- PAQ-ESCALON-START ---");
  const b = src.indexOf("// --- PAQ-ESCALON-END ---");
  assert.ok(a >= 0 && b > a, "marcadores del escalón en el Apps Script");
  const body = src.slice(a, b);
  const fn = new Function("CONFIG", `${body}\nreturn { usaTramoPaquetes_, esCicloCongeladoN8_, esAndreaODaniela_, comisionPaquetesEscalon_, netoCatalogoTexto_, premioNivelesPaquete_, aplicarPremioPaquetes_, rolUsaTramo_, aplicarDeltaPaquetesRol_ };`);
  return fn({
    NIVELES: [
      [0.05, 5], [0.10, 20], [0.15, 45], [0.20, 80], [0.25, 125],
      [0.30, 180], [0.40, 245], [0.50, 320], [0.60, 405], [0.80, 500],
    ],
  }) as {
    usaTramoPaquetes_: (d: Date) => boolean;
    esCicloCongeladoN8_: (d: Date) => boolean;
    esAndreaODaniela_: (n: string) => boolean;
    comisionPaquetesEscalon_: (u: number, netos: number[]) => { monto: number; etiqueta: string };
    netoCatalogoTexto_: (t: string, precios: Record<string, { venta: number }>) => number;
    premioNivelesPaquete_: (paq: number, clientas: number, n: number, bono: boolean) => { comPaquetes: number; nivelAlcanzado: string };
    aplicarPremioPaquetes_: (nombre: string, c: { paquetes: number; _nets?: number[]; comPaquetes?: number; nivelAlcanzado?: string; congeladoN8?: boolean }, clientas: number, n: number, bono: boolean, inicio: Date) => void;
    rolUsaTramo_: (sheet: string) => boolean;
    aplicarDeltaPaquetesRol_: (rol: { comPaquetes: number; totalIngresos: number; totalRecibir: number; paquetes?: number; nivelPaquete?: string }, nuevo: number, paquetes: number, nivel: string) => void;
  };
}

describe("escalón en el app en vivo", () => {
  const live = escalonLive();
  const ago26 = new Date(2026, 7, 26);
  const sep26 = new Date(2026, 8, 26);
  const oct26 = new Date(2026, 9, 26);

  it("los ciclos viejos siguen en N1–N10 y el x6 cuenta como 2", () => {
    assert.equal(live.usaTramoPaquetes_(ago26), false);
    assert.equal(live.usaTramoPaquetes_(sep26), false);
    assert.equal(live.usaTramoPaquetes_(new Date(2026, 8, 26, 23, 59, 59)), false);
    const andrea = live.premioNivelesPaquete_(24, 60, 2, true);
    const daniela = live.premioNivelesPaquete_(15, 60, 2, true);
    assert.equal(andrea.comPaquetes, 500);
    assert.equal(andrea.nivelAlcanzado, "N10");
    assert.equal(daniela.comPaquetes, 320);
    assert.equal(daniela.nivelAlcanzado, "N8");
    assert.equal(live.premioNivelesPaquete_(24, 60, 2, false).comPaquetes, 0);
    const vieja = { paquetes: 24 };
    live.aplicarPremioPaquetes_("Andrea Robles", vieja, 60, 2, true, ago26);
    assert.equal(vieja.comPaquetes, 500);
    assert.equal(vieja.nivelAlcanzado, "N10");
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../..", "sunsu_script_completo.js"), "utf8");
    assert.match(src, /\} else \{\s*if \(pack3 && pack3 !== "" && pack3.toLowerCase\(\) !== "false"\) c\.paquetes \+= 1;\s*if \(pack6 && pack6 !== "" && pack6.toLowerCase\(\) !== "false"\) c\.paquetes \+= 2;\s*\}/);
  });

  it("27 paquetes pagan escalón por escalón, igual que la API", () => {
    const netos = Array.from({ length: 27 }, () => 100);
    const api = comisionPaquetesTramo(27, undefined, netos);
    const esc = live.comisionPaquetesEscalon_(27, netos);
    assert.equal(api.monto, 10 * 5 + 10 * 8 + 7 * 11);
    assert.equal(api.etiqueta, "21–30 · 11%");
    assert.equal(esc.monto, api.monto);
    assert.equal(esc.etiqueta, api.etiqueta);
    const mixto = [...Array.from({ length: 20 }, () => 152.6), ...Array.from({ length: 7 }, () => 288.25)];
    const apiMix = comisionPaquetesTramo(27, undefined, mixto);
    assert.equal(apiMix.monto, 10 * 7 + 10 * 12 + 7 * 31);
    assert.equal(live.comisionPaquetesEscalon_(27, mixto).monto, apiMix.monto);
    assert.equal(live.comisionPaquetesEscalon_(27, mixto).etiqueta, apiMix.etiqueta);
  });

  it("Andrea y Daniela quedan en N8 $320 el 26 sep y en el escalón desde el 26 oct", () => {
    assert.equal(live.usaTramoPaquetes_(oct26), true);
    assert.equal(live.esCicloCongeladoN8_(sep26), true);
    const marks: CosmMark[] = [
      { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es: true, activa: true },
      { id: "daniela", nombre: "Daniela Vega", patron: "daniela%", es: true, activa: true },
    ];
    const tk = (fecha: string, cosm: string, i: number, pack: "3" | "6", neto: number): TicketIn => ({
      fecha, cosm, cedula: String(2000 + i), facial: "SUNSU-01",
      pack3: pack === "3" ? "SUNSU-18" : "",
      pack6: pack === "6" ? "SUNSU-23" : "",
      extras: "", exclFacial: false, exclPaquete: false, exclProducto: true, exclExtras: true, productos: [],
      netoPack: pack === "3" ? neto : 0,
      netoPack6: pack === "6" ? neto : 0,
    });
    const freeze = calcularCiclo([
      tk("2026-10-10", "Andrea Robles", 1, "3", 152.6),
      tk("2026-10-11", "Daniela Vega", 2, "6", 288.25),
    ], marks, CFG_DEF, "2026-09-26");
    for (const nombre of ["Andrea Robles", "Daniela Vega"]) {
      const apiP = freeze.personas.find((p) => p.cosm === nombre);
      const row = { paquetes: 1 };
      live.aplicarPremioPaquetes_(nombre, row, 2, 2, false, sep26);
      assert.equal(apiP?.comPaquetes, 320);
      assert.equal(apiP?.nivel, "N8");
      assert.equal(row.comPaquetes, apiP?.comPaquetes);
      assert.equal(row.nivelAlcanzado, apiP?.nivel);
    }
    const otra = { paquetes: 24 };
    live.aplicarPremioPaquetes_("Carla", otra, 60, 2, true, sep26);
    assert.equal(otra.comPaquetes, 500);
    assert.equal(otra.nivelAlcanzado, "N10");

    const aNets = [...Array.from({ length: 20 }, () => 152.6), ...Array.from({ length: 7 }, () => 288.25)];
    const dNets = [...Array.from({ length: 11 }, () => 152.6), 288.25];
    const tickets: TicketIn[] = [
      ...aNets.map((neto, i) => tk("2026-10-27", "Andrea Robles", 10 + i, i < 20 ? "3" : "6", neto)),
      ...dNets.map((neto, i) => tk("2026-10-27", "Daniela Vega", 50 + i, i < 11 ? "3" : "6", neto)),
    ];
    const ciclo = calcularCiclo(tickets, marks, CFG_DEF, "2026-10-26");
    const aRow = { paquetes: aNets.length, _nets: aNets.slice() };
    const dRow = { paquetes: dNets.length, _nets: dNets.slice() };
    live.aplicarPremioPaquetes_("Andrea Robles", aRow, 40, 2, true, oct26);
    live.aplicarPremioPaquetes_("Daniela Vega", dRow, 40, 2, false, oct26);
    const apiA = ciclo.personas.find((p) => p.cosm === "Andrea Robles");
    const apiD = ciclo.personas.find((p) => p.cosm === "Daniela Vega");
    assert.equal(aRow.comPaquetes, apiA?.comPaquetes);
    assert.equal(aRow.nivelAlcanzado, apiA?.nivel);
    assert.equal(dRow.comPaquetes, apiD?.comPaquetes);
    assert.equal(dRow.nivelAlcanzado, apiD?.nivel);
    assert.equal(aRow.comPaquetes, 10 * 7 + 10 * 12 + 7 * 31);
    assert.equal(aRow.nivelAlcanzado, "21–30 · 11%");
    assert.equal(aRow._nets, undefined);
  });

  it("el rol de octubre no se pisa y el de noviembre toma el escalón en vivo", () => {
    assert.equal(live.rolUsaTramo_("OCTUBRE_2026"), false);
    assert.equal(live.rolUsaTramo_("SEPTIEMBRE_2026"), false);
    assert.equal(live.rolUsaTramo_("NOVIEMBRE_2026"), true);
    const rol = { comPaquetes: 0, totalIngresos: 1000, totalRecibir: 800 };
    live.aplicarDeltaPaquetesRol_(rol, 207, 27, "21–30 · 11%");
    assert.equal(rol.comPaquetes, 207);
    assert.equal(rol.paquetes, 27);
    assert.equal(rol.nivelPaquete, "21–30 · 11%");
    assert.equal(rol.totalIngresos, 1207);
    assert.equal(rol.totalRecibir, 1007);
  });

  it("el neto sale del SUNSU-NN y el sello del motor coincide", () => {
    const precios = { "SUNSU-18": { venta: 152.6 }, "18": { venta: 100 }, "SUNSU-HT-002": { venta: 9 } };
    assert.equal(live.netoCatalogoTexto_("SUNSU-18 x3 Facial Reparación", precios), 152.6);
    assert.equal(live.netoCatalogoTexto_("paquete 18 suelto", { "18": { venta: 100 } }), 0);
    assert.equal(live.netoCatalogoTexto_("SUNSU-18", { "18": { venta: 100 } }), 100);
    assert.equal(live.netoCatalogoTexto_("SUNSU-HT-002 crema", precios), 0);
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const script = readFileSync(join(root, "sunsu_script_completo.js"), "utf8");
    const html = readFileSync(join(root, "sunsu.html"), "utf8");
    const beta = readFileSync(join(root, "beta.html"), "utf8");
    const screens = readFileSync(join(root, "beta-screens.js"), "utf8");
    const sw = readFileSync(join(root, "sw.js"), "utf8");
    assert.match(script, /APP_VERSION = '2026-10-26-ESC /);
    assert.match(html, /SUNSU_MOTOR_ESPERADO='2026-10-26-ESC'/);
    assert.match(html, /SUNSU_APP_VERSION='v2026.10.26.01'/);
    assert.match(html, /var v='20261026.01'/);
    assert.match(html, /nivel\.indexOf\('%'\)/);
    assert.match(screens, /nivel\.indexOf\('%'\)/);
    assert.match(beta, /Escalón/);
    assert.match(beta, /beta-screens\.js\?v=20261029tklin/);
    assert.match(sw, /sunsu-beta-2026-10-29-TKLIN/);
    assert.doesNotMatch(readFileSync(join(root, "supabase/functions/api/domain.ts"), "utf8"), /2026-10-26-ESC/);
  });

  it("Andrea y Daniela en la tabla de la API coinciden con el escalón del app", async () => {
    const aN = 20;
    const a6 = 7;
    const dN = 11;
    const tickets = [
      ...Array.from({ length: aN }, (_, i) => ({
        id: i + 1, sheet_row: i + 1, timestamp: "2026-10-27T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0101",
        facial_hecho: "SUNSU-01", compra_pack_3: "SUNSU-18 x3 Facial Reparación", orig: {},
      })),
      ...Array.from({ length: a6 }, (_, i) => ({
        id: 100 + i, sheet_row: 100 + i, timestamp: "2026-10-28T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0102",
        facial_hecho: "SUNSU-01", compra_pack_6: "SUNSU-23 x6 Facial S.O.S", orig: {},
      })),
      ...Array.from({ length: dN }, (_, i) => ({
        id: 200 + i, sheet_row: 200 + i, timestamp: "2026-10-27T16:00:00Z", atendido_por: "Daniela Vega", id_3: "0103",
        facial_hecho: "SUNSU-01", compra_pack_3: "SUNSU-18 x3 Facial Reparación", orig: {},
      })),
      {
        id: 300, sheet_row: 300, timestamp: "2026-10-28T16:00:00Z", atendido_por: "Daniela Vega", id_3: "0104",
        facial_hecho: "SUNSU-01", compra_pack_6: "SUNSU-23 x6 Facial S.O.S", orig: {},
      },
      {
        id: 400, sheet_row: 400, timestamp: "2026-10-10T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0105",
        facial_hecho: "SUNSU-01", compra_pack_3: "SUNSU-18 x3 Facial Reparación", orig: {},
      },
      {
        id: 401, sheet_row: 401, timestamp: "2026-10-11T15:00:00Z", atendido_por: "Daniela Vega", id_3: "0106",
        facial_hecho: "SUNSU-01", compra_pack_6: "SUNSU-23 x6 Facial S.O.S", orig: {},
      },
    ];
    const db = new MemoryDb({
      cosmetologas: [
        { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true },
        { id: "daniela", nombre: "Daniela Vega", patron: "daniela%", es_cosmetologa: true, activa: true },
      ],
      tickets,
      catalogo: [
        { sku: "SUNSU-18", producto_servicio: "Facial Reparación x3", subtotal: 152.6, tipo: "PAQUETE", orig: {} },
        { sku: "SUNSU-23", producto_servicio: "Facial S.O.S x6", subtotal: 288.25, tipo: "PAQUETE", orig: {} },
      ],
    });
    const precios = { "SUNSU-18": { venta: 152.6 }, "SUNSU-23": { venta: 288.25 } };
    const aNets = [
      ...Array.from({ length: aN }, () => live.netoCatalogoTexto_("SUNSU-18 x3 Facial Reparación", precios)),
      ...Array.from({ length: a6 }, () => live.netoCatalogoTexto_("SUNSU-23 x6 Facial S.O.S", precios)),
    ];
    const dNets = [
      ...Array.from({ length: dN }, () => live.netoCatalogoTexto_("SUNSU-18 x3 Facial Reparación", precios)),
      live.netoCatalogoTexto_("SUNSU-23 x6 Facial S.O.S", precios),
    ];
    const aEsc = live.comisionPaquetesEscalon_(aNets.length, aNets);
    const dEsc = live.comisionPaquetesEscalon_(dNets.length, dNets);
    const c = ctx(db, "admin", "emi", "Emi");
    c.now = new Date("2026-10-27T18:00:00Z");
    const tablaA = await handle("getComisionesTabla", { token: c.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Andrea" }, c) as Row;
    const tablaD = await handle("getComisionesTabla", { token: c.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Daniela" }, c) as Row;
    const paq = (tabla: Row) => ((tabla.filas as Row[]).find((f) => f.concepto === "Paquetes")?.porCiclo as number[])[0];
    assert.equal(paq(tablaA), aEsc.monto);
    assert.equal(paq(tablaD), dEsc.monto);
    const dashA = await handle("getDashCosm", { token: c.token, cosmetologa: "Andrea Robles" }, c) as Row;
    const dashD = await handle("getDashCosm", { token: c.token, cosmetologa: "Daniela Vega" }, c) as Row;
    assert.equal(dashA.comPaquetes, aEsc.monto);
    assert.equal(dashA.nivelAlcanzado, aEsc.etiqueta);
    assert.equal(dashD.comPaquetes, dEsc.monto);
    assert.equal(dashD.nivelAlcanzado, dEsc.etiqueta);
    const congelado = ctx(db, "admin", "emi", "Emi");
    const rep = await handle("getReporteAdmin", { token: congelado.token }, congelado) as Row;
    const filas = rep.cosmetologas as Row[];
    assert.equal(filas.find((r) => String(r.name).startsWith("Andrea"))?.cp, 320);
    assert.equal(filas.find((r) => String(r.name).startsWith("Daniela"))?.cp, 320);
    assert.equal(filas.find((r) => String(r.name).startsWith("Andrea"))?.n, "N8");
    assert.equal(filas.find((r) => String(r.name).startsWith("Daniela"))?.n, "N8");
  });
});

describe("tickets de venta", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const src = readFileSync(join(root, "beta-screens.js"), "utf8");
  const beta = readFileSync(join(root, "beta.html"), "utf8");
  const sw = readFileSync(join(root, "sw.js"), "utf8");
  const fns = new Function(
    src.slice(src.indexOf("function _histEsc("), src.indexOf("function _histResAdminHTML("))
    + "\nreturn { _histSkus, _histFechaFmt, _histClave, _histMasterHTML };",
  )() as {
    _histSkus: (t: Record<string, unknown>) => string[];
    _histFechaFmt: (f: string) => string;
    _histClave: (t: Record<string, unknown>) => string;
    _histMasterHTML: (tickets: Record<string, unknown>[], showPrices: boolean) => string;
  };

  it("la lista es tabla maestra y el detalle conserva multa y exclusión", () => {
    assert.match(src, /id="hist-cosm"/);
    assert.match(src, /class="tk-split/);
    assert.match(src, /t:'Nº ticket'[\s\S]*t:'Clienta'[\s\S]*t:'Cédula'[\s\S]*t:'Fecha'[\s\S]*t:'Cosmetóloga'[\s\S]*t:'Subtotal'[\s\S]*t:'IVA'[\s\S]*t:'Total'/);
    assert.doesNotMatch(src, /<th>SKU<\/th><th>Cosmetóloga/);
    assert.doesNotMatch(src, /onclick="editarTicket\(/);
    assert.doesNotMatch(src, /onclick="eliminarTicket\(/);
    assert.match(src, /abrirModalMulta/);
    assert.match(src, /Excluir de comisión/);
    assert.match(src, /Descargar PDF/);
    assert.match(src, /class="hist-filtrar"/);
    assert.match(src, /\['todos','Todos'\],\['hoy','Hoy'\]/);
    assert.match(src, /_histFiltroBtns\('sf-','aplicarFiltroStaff'/);
    assert.match(beta, /\.tk-split/);
    assert.match(beta, /beta-screens\.js\?v=20261029tklin/);
    assert.match(sw, /sunsu-beta-2026-10-29-TKLIN/);
    assert.doesNotMatch(readFileSync(join(root, "supabase/functions/api/domain.ts"), "utf8"), /_histMasterHTML/);
    assert.doesNotThrow(() => new Function(src));
  });

  it("arma los SKU del ticket y la fila de la tabla", () => {
    const g = globalThis as { window?: Record<string, unknown>; _buildTicketCard?: (t: { tkRow?: number }) => string };
    g.window = g.window || {};
    g._buildTicketCard = (t) => `<div class="ticket-card" data-row="${t.tkRow}"></div>`;
    assert.deepEqual(fns._histSkus({
      facial: "SUNSU-02 Limpieza",
      extras: "SUNSU-HT-002 crema",
      productos: ["SUNSU-AS-005 crema ×1", { sku: "SUNSU-02", nombre: "repetido" }],
    }), ["SUNSU-02", "SUNSU-HT-002", "SUNSU-AS-005"]);
    assert.equal(fns._histFechaFmt("2026-10-26"), "26/10/2026");
    assert.equal(fns._histClave({ tkRow: 12 }), "r12");
    g.window._histTkSel = "r12";
    const html = fns._histMasterHTML([{
      tkRow: 12, so_num: "TK-SO-0123", nombre: "Ana", apellido: "Paz", cedula: "0101", fecha: "2026-10-26",
      facial: "SUNSU-02 Limpieza", productos: ["SUNSU-AS-005 crema ×1"],
      cosmetologa: "Andrea Robles", estimado: "40.25",
    }], true);
    assert.match(html, /class="tk-split tk-side"/);
    assert.match(html, /Ana Paz/);
    assert.doesNotMatch(html, />Cédula</);
    assert.doesNotMatch(html, /SUNSU-02, SUNSU-AS-005/);
    assert.match(html, /TK-SO-0123/);
    assert.match(html, />Total</);
    assert.match(html, /\$40\.25/);
    assert.match(html, /class="tk-row on"/);
    assert.match(html, /tk-open/);
    assert.doesNotMatch(html, />Factura</);
    g.window._histTkSel = "";
    const wide = fns._histMasterHTML([{
      tkRow: 12, so_num: "TK-SO-0123", nombre: "Ana", apellido: "Paz", cedula: "0101", fecha: "2026-10-26",
      facial: "SUNSU-02 Limpieza", productos: ["SUNSU-AS-005 crema ×1"],
      cosmetologa: "Andrea Robles", estimado: "40.25",
    }], true);
    assert.match(wide, /0101/);
    assert.match(wide, /26\/10\/2026/);
    assert.match(wide, /\$35\.00/);
    assert.match(wide, /\$5\.25/);
    assert.match(wide, /Andrea Robles/);
    assert.match(wide, />Estado</);
    assert.match(wide, />abierto</);
    assert.match(wide, />Factura</);
    assert.match(wide, />Saldo</);
    assert.doesNotMatch(wide, /tk-side/);
    assert.match(html, /class="ticket-card" data-row="12"/);
    assert.doesNotMatch(html, /editarTicket/);
    assert.doesNotMatch(html, /eliminarTicket/);
  });
});

describe("gift cards lista", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const src = readFileSync(join(root, "beta-screens.js"), "utf8");
  const beta = readFileSync(join(root, "beta.html"), "utf8");
  const sw = readFileSync(join(root, "sw.js"), "utf8");
  const fns = new Function(
    src.slice(src.indexOf("function _gcEsc("), src.indexOf("function verTodasGC("))
    + "\nreturn { _gcCerrada, _gcEstado, _gcTablaHTML, _gcFechaEmision };",
  )() as {
    _gcCerrada: (g: Record<string, unknown>) => boolean;
    _gcEstado: (g: Record<string, unknown>) => string;
    _gcTablaHTML: (lista: Record<string, unknown>[]) => string;
    _gcFechaEmision: (g: Record<string, unknown>) => string;
  };

  it("abre con las abiertas y la tabla trae código, clienta, monto, saldo y estado", async () => {
    assert.match(src, /verTodasGC\('abiertas'\)/);
    assert.match(src, /id="gc-f-todas"/);
    assert.match(src, /id="gc-f-vig"/);
    assert.match(src, /id="gc-f-cad"/);
    assert.match(src, /id="bgc-inp"/);
    assert.match(src, /Clienta \/ beneficiaria/);
    assert.match(beta, /\.gc-table/);
    assert.match(beta, /beta-screens\.js\?v=20261029tklin/);
    assert.match(sw, /sunsu-beta-2026-10-29-TKLIN/);
    assert.doesNotThrow(() => new Function(src));
    const g = globalThis as { window?: Record<string, unknown>; _gcVencimiento?: (g: unknown) => { cad: boolean; sinCad: boolean; str: string } };
    g.window = g.window || {};
    g._gcVencimiento = () => ({ cad: false, sinCad: false, str: "14/01/2027" });
    assert.equal(fns._gcCerrada({ usado: true, saldo: 65 }), true);
    assert.equal(fns._gcCerrada({ usado: false, saldo: 0 }), true);
    assert.equal(fns._gcCerrada({ usado: false, saldo: 35 }), false);
    assert.equal(fns._gcEstado({ usado: false, saldo: 35 }), "Vigente");
    assert.equal(fns._gcEstado({ usado: true, saldo: 0 }), "Usada");
    assert.equal(fns._gcFechaEmision({ dia: 14, mes: 7, ano: 2026 }), "14/07/2026");
    const html = fns._gcTablaHTML([{ codigo: "26-070", nombre: "María", apellido: "Paz", valor: "65", saldo: 35, dia: 14, mes: 7, ano: 2026, usado: false }]);
    assert.match(html, /26-070/);
    assert.match(html, /María Paz/);
    assert.match(html, /35\.00/);
    assert.match(html, /14\/07\/2026/);
    assert.match(html, /Vigente/);

    const db = new MemoryDb({
      gift_cards: [
        { sheet_row: 4, codigo_gc: "26-065", valor: "100", usado: false, nombre_comprador: "Ana", apellido_comprador: "Paz", dia: 1, mes: 8, ano: 2026, orig: {} },
        { sheet_row: 5, codigo_gc: "26-099", valor: "65", usado: true, nombre_comprador: "Rosa", apellido_comprador: "Díaz", dia: 1, mes: 1, ano: 2026, orig: {} },
      ],
    });
    const real = ctx(db);
    const todas = await handle("buscarGiftCards", { token: real.token, q: "*" }, real) as Row;
    assert.deepEqual((todas.resultados as Row[]).map((r) => r.codigo).sort(), ["26-065", "26-099"]);
    assert.equal((todas.resultados as Row[]).find((r) => r.codigo === "26-065")?.saldo, 100);
    const prueba = "t-prueba";
    db.tables.get("sesiones")!.push({ token: prueba, uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z", modo_prueba: true });
    const enPrueba = await handle("buscarGiftCards", { token: prueba, q: "*" }, real) as Row;
    assert.equal((enPrueba.resultados as Row[]).find((r) => r.codigo === "26-065")?.saldo, 100);
    assert.equal((enPrueba.resultados as Row[]).find((r) => r.codigo === "26-099")?.usado, true);
  });
});

describe("paquetes en columnas", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const src = readFileSync(join(root, "beta-screens.js"), "utf8");
  const beta = readFileSync(join(root, "beta.html"), "utf8");
  const sw = readFileSync(join(root, "sw.js"), "utf8");

  it("alinea clienta, progreso, tarjeta, WhatsApp y el desplegable", () => {
    assert.match(src, /class="paq-line"/);
    assert.match(src, /class="paq-prog/);
    assert.match(src, /paq-wa-vacio/);
    assert.match(src, /onclick="tarjetaPaqueteDe\(/);
    assert.match(src, /onclick="paqDesplegar\(/);
    assert.match(src, /de '\+x\.total\+' · queda/);
    assert.match(beta, /grid-template-columns: minmax\(0, 1\.7fr\) 11\.5rem 6\.4rem 2\.8rem 2\.4rem/);
    assert.match(beta, /beta-screens\.js\?v=20261029tklin/);
    assert.match(sw, /sunsu-beta-2026-10-29-TKLIN/);
    assert.doesNotThrow(() => new Function(src));
    const fila = src.slice(src.indexOf("var wa=telQ"), src.indexOf("html+='<div class=\"card paq-row\""));
    assert.match(fila, /paq-wa-vacio/);
    assert.match(fila, /paq-wa"/);
  });
});

describe("cotizaciones visor", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const src = readFileSync(join(root, "beta-screens.js"), "utf8");
  const beta = readFileSync(join(root, "beta.html"), "utf8");
  const sw = readFileSync(join(root, "sw.js"), "utf8");

  it("nueva cotización es el ticket con aviso, sin notas ni fotos, y no vende", () => {
    const env = src.indexOf("function enviarTicket(");
    const corte = src.indexOf("window._esCotizacion", env);
    const gc = src.indexOf("registrarGC", env);
    assert.ok(corte > env && corte < gc);
    assert.match(src, /id="cot-banner"/);
    assert.match(src, /Esto es una COTIZACIÓN/);
    assert.match(src, /_notasCard=_cotMode\?'':/);
    assert.match(src, /_fotosCard=_cotMode\?'':/);
    assert.match(src, /accion:'guardarCotizacion'|api\('guardarCotizacion'/);
    assert.match(src, /validez:'Válida por 15 días'/);
    assert.match(beta, /route\.doc === "cot" && !route\.id\) return "ticket"/);
    assert.match(beta, /m === "cotizaciones_cliente"\) return ""/);
    assert.match(beta, /return renderListaCotizaciones\(\)/);
    assert.match(beta, /window\._esCotizacion = route\.kind === "doc" && route\.doc === "cot" && !route\.id/);
    assert.match(beta, /th\("numero", "Número"\)/);
    assert.match(beta, /id="cot-pdf"/);
    assert.match(beta, /Descargar PDF/);
    assert.doesNotMatch(beta, /<th>TK-SQ<\/th>/);
    assert.match(beta, /beta-screens\.js\?v=20261029tklin/);
    assert.match(sw, /sunsu-beta-2026-10-29-TKLIN/);
    assert.doesNotThrow(() => new Function(src));
    const build = new Function(
      "T", "FACIALES", "EXTRAS", "PAQ3", "PAQ6", "PROVS",
      src.slice(src.indexOf("function _lineasCotizacionTicket("), src.indexOf("function _enviarCotizacionTicket("))
      + "\nreturn _lineasCotizacionTicket();",
    ) as (t: Record<string, unknown>, f: unknown, e: unknown, p3: unknown, p6: unknown, pv: unknown) => { sku: string; nombre: string; precio: number; cant: number }[];
    const lineas = build(
      {
        facial: "SUNSU-01", cobro: "cobrado", extras: { "SUNSU-07": true, "SUNSU-08": true },
        extrasCourtesy: { "SUNSU-08": true }, pack3: "SUNSU-18", pack6: "",
        productos: { "SUNSU-HT-002": 2 }, gcVenta: { activo: true, codigo: "26-070", valor: 65, tipo: "digital", cortesia: false },
      },
      [{ sku: "SUNSU-01", n: "Facial S.O.S", p: 75 }],
      [{ sku: "SUNSU-07", n: "Dermaplaning", t: 15 }, { sku: "SUNSU-08", n: "Mascarilla", t: 12 }],
      [{ sku: "SUNSU-18", n: "x3 Facial Reparación", p: 166.2 }],
      [],
      [{ prods: [{ sku: "SUNSU-HT-002", n: "Serum", p: 43.99 }] }],
    );
    assert.equal(lineas.find((l) => l.sku === "SUNSU-01")?.precio, 75);
    assert.equal(lineas.find((l) => l.sku === "SUNSU-07")?.precio, 15);
    assert.equal(lineas.find((l) => l.sku === "SUNSU-08")?.precio, 0);
    assert.equal(lineas.find((l) => l.sku === "SUNSU-18")?.precio, 166.2);
    assert.equal(lineas.find((l) => l.sku === "SUNSU-HT-002")?.cant, 2);
    assert.equal(lineas.find((l) => l.sku === "26-070")?.precio, 65);
  });
});

describe("clientes en columnas", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const beta = readFileSync(join(root, "beta.html"), "utf8");
  const sw = readFileSync(join(root, "sw.js"), "utf8");

  it("lista nombre, cédula, visitas, última visita y total, y abre el registro inicial", () => {
    assert.match(beta, /\["codigo", "Código"\]/);
    assert.match(beta, /\["nombre", "Clienta"\]/);
    assert.match(beta, /\["cedula", "Cédula"\]/);
    assert.match(beta, /\["visitas", "Visitas", "num"\]/);
    assert.match(beta, /\["ultima", "Última visita"\]/);
    assert.match(beta, /\["total", "Total gastado", "num"\]/);
    assert.match(beta, /\["telefono", "Teléfono"\]/);
    assert.match(beta, /\["sector", "Sector"\]/);
    assert.match(beta, /\["cosmetologa", "Cosmetóloga"\]/);
    assert.match(beta, /id="cli-registro"/);
    assert.match(beta, /data-cli-sort/);
    assert.match(beta, /hasOwnProperty.call\(c, "telefono"\)/);
    assert.match(beta, /beta-screens\.js\?v=20261029tklin/);
    assert.match(sw, /sunsu-beta-2026-10-29-TKLIN/);
  });
});

describe("tickets v2 y código de clienta", () => {
  it("C-00001 sale de la fila del registro y es estable", async () => {
    const { codigoCliente } = await import("./ventas.ts");
    assert.equal(codigoCliente({ sheet_row: 2 }), "C-00001");
    assert.equal(codigoCliente({ sheet_row: 1796 }), "C-01795");
    assert.equal(codigoCliente({ sheet_row: -7 }), "C-B00007");
    assert.equal(codigoCliente({}), "");
  });
  it("tickets: buscador arriba, Filtrar en desplegable, columnas ordenables y todos por defecto", () => {
    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    assert.match(src, /mostrarHistorialAdmin\(c,'','',''\)/);
    assert.match(src, /function _histSortBy\(k\)/);
    assert.match(src, /so_num/);
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    assert.match(beta, /\.nowrap-table th, \.nowrap-table td \{ white-space: nowrap;/);
  });
});

class OcFkDb extends MemoryDb {
  override async write(actor: string, table: string, op: "insert" | "update" | "delete", match: Row, row: Row | null): Promise<Row | null> {
    if (table === "erp_oc_lineas" && (op === "insert" || op === "update")) {
      let ocId = row && row.oc_id != null ? String(row.oc_id) : "";
      if (!ocId && op === "update") {
        const hit = (this.tables.get("erp_oc_lineas") || []).find((r) =>
          Object.entries(match).every(([k, v]) => r[k] === v || String(r[k]) === String(v)));
        if (hit?.oc_id != null) ocId = String(hit.oc_id);
      }
      if (ocId && !(this.tables.get("erp_oc") || []).some((r) => String(r.id) === ocId)) {
        throw new Error('violates foreign key constraint "erp_oc_lineas_oc_id_fkey"');
      }
    }
    return super.write(actor, table, op, match, row);
  }
}

describe("compras flujo", () => {
  it("la pre-orden se llena con lo vendido, se aprueba con número y la cosmetóloga recibe sin precios", async () => {
    const seed = erpSeed();
    seed.erp_proveedores[0].nombre = "Hebetronic S.A.";
    const db = new MemoryDb(seed);
    db.tables.set("tickets", [
      { id: "t-viejo", beta_num: "TK-VIEJO", timestamp: "2026-10-02T15:00:00Z", ht_002: 1 },
      { id: "t-nuevo", beta_num: "TK-NUEVO", timestamp: "2026-10-20T15:00:00Z", ht_002: 1 },
    ]);
    const c = ctx(db);
    const per = await handle("compras_periodo", {
      token: c.token, proveedor_id: SEED_IDS.prov, desde: "2026-10-01", hasta: "2026-10-31",
    }, c) as Row;
    assert.equal(per.ok, true);
    const ht = (per.lineas as Row[]).find((r) => r.sku === "HT-002");
    assert.equal(ht?.vendido, 2);
    assert.equal(ht?.subtotal, 16);
    const draft = await handle("compras_guardar", {
      token: c.token, proveedor_id: SEED_IDS.prov, desde: "2026-10-01", hasta: "2026-10-31",
      numero_prov: "P-19", lineas: per.lineas, fact: per.lineas,
    }, c) as Row;
    assert.equal(draft.flujo, "Borrador");
    assert.equal((await db.all("erp_oc"))[0].numero ?? null, null);
    db.tables.get("usuarios")!.push({ id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false });
    db.tables.get("sesiones")!.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    const no = await handle("compras_aprobar", { token: "t-andrea", id: draft.id }, c) as Row;
    assert.match(String(no.error), /admin/i);
    const ok = await handle("compras_aprobar", { token: c.token, id: draft.id }, c) as Row;
    assert.equal(ok.ok, true);
    assert.equal(ok.numero, "OC-0001");
    assert.equal((ok.liquidacion as Row).titulo, "Liquidación de consignación");
    assert.equal((ok.pedido as Row).numero, "OC-0001");
    const vista = await handle("compras_lista", { token: "t-andrea" }, c) as Row;
    const ocCos = (vista.items as Row[])[0];
    assert.equal(ocCos.proveedor, undefined);
    assert.equal(ocCos.numero_prov, undefined);
    assert.equal(ocCos.facturas, undefined);
    assert.equal((ocCos.lineas as Row[])[0].precio, undefined);
    assert.equal((ocCos.lineas as Row[])[0].sku, "HT-002");
    const linea = (await db.all("erp_oc_lineas"))[0];
    const antes = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta && r.bodega_id === BODEGA_VENTA)?.cantidad;
    const rec = await handle("compras_recibir", {
      token: "t-andrea", oc_id: draft.id, lineas: [{ oc_linea_id: linea.id, recibido: 1, no_recibido: 1 }],
    }, c) as Row;
    assert.equal(rec.ok, true);
    assert.equal(rec.flujo, "Recibida");
    assert.equal(rec.proveedor, undefined);
    const despues = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta && r.bodega_id === BODEGA_VENTA)?.cantidad;
    assert.equal(Number(despues), Number(antes) + 1);
    const pago = await handle("compras_pago", {
      token: c.token, oc_id: draft.id, monto: 8, factura_b64: "QQ==", factura_nombre: "fac.pdf",
    }, c) as Row;
    assert.equal(pago.ok, true);
    assert.ok(pago.archivo_id);
    const cierres = pago.cierres as Row[];
    assert.equal(cierres.length, 1);
    assert.equal(cierres[0].ticket_ref, "TK-VIEJO");
    assert.equal(cierres[0].qty, 1);
    const saldo = await handle("compras_saldo", { token: c.token }, c) as Row;
    const heb = (saldo.items as Row[]).find((r) => r.id === SEED_IDS.prov);
    assert.equal(heb?.pagado, 8);
    assert.ok(Number(heb?.pendiente) > 0);
    const adminLista = await handle("compras_lista", { token: c.token }, c) as Row;
    const ocAd = (adminLista.items as Row[]).find((r) => r.id === draft.id);
    assert.equal(ocAd?.numero_prov, "P-19");
    assert.deepEqual(ocAd?.facturas, ["fac.pdf"]);
    const rep = await handle("compras_reporte", { token: c.token, proveedor_id: SEED_IDS.prov }, c) as Row;
    assert.equal(rep.titulo, "Consignación a la fecha");
    assert.equal((rep.items as Row[]).find((r) => r.sku === "HT-002")?.stock, Number(despues));
  });

  it("un pago cierra solo el periodo y los SKU de la OC, en parciales de centavo, y el PDF cuadra", async () => {
    const seed = erpSeed();
    seed.erp_proveedores[0].nombre = "Hebetronic S.A.";
    seed.erp_productos.push({
      id: "ht-extra", sku: "HT-090", nombre: "Serum", uso: "venta", clase: "producto",
      precio_venta: 20, costo_promedio: 8, activo: true,
    });
    const db = new MemoryDb(seed);
    const tickets: Row[] = [];
    for (let i = 0; i < 302; i++) {
      tickets.push({
        id: "old-" + i, beta_num: "TK-OLD-" + String(i).padStart(4, "0"),
        timestamp: "2025-06-01T15:00:00Z", ht_002: 1,
      });
    }
    tickets.push(
      { id: "en-a", beta_num: "TK-A", timestamp: "2026-10-02T15:00:00Z", ht_002: 1 },
      { id: "en-b", beta_num: "TK-B", timestamp: "2026-10-10T15:00:00Z", ht_002: 1, orig: { "HT-090": 4 } },
      { id: "fuera", beta_num: "TK-FUERA", timestamp: "2026-10-20T15:00:00Z", ht_002: 1 },
    );
    db.tables.set("tickets", tickets);
    const c = ctx(db);
    const draft = await handle("compras_guardar", {
      token: c.token, proveedor_id: SEED_IDS.prov, desde: "2026-10-01", hasta: "2026-10-15",
      lineas: [{ sku: "HT-002", cantidad: 2, precio: 8 }],
      fact: [
        { sku: "HT-002", vendido: 9, cantidad: 9, precio: 8, subtotal: 72 },
        { sku: "HT-090", vendido: 4, cantidad: 4, precio: 8, subtotal: 32 },
      ],
    }, c) as Row;
    assert.equal(draft.ok, true);
    const ok = await handle("compras_aprobar", { token: c.token, id: draft.id }, c) as Row;
    const liq = ok.liquidacion as Row;
    const lineas = liq.lineas as Row[];
    assert.equal(lineas.length, 1);
    assert.equal(lineas[0].sku, "HT-002");
    assert.equal(lineas[0].cantidad, 2);
    assert.equal(lineas[0].subtotal, 16);
    const suma = (lineas).reduce((a, ln) => a + Number(ln.subtotal), 0);
    assert.equal(liq.subtotal, suma);
    assert.equal(liq.iva, 2.4);
    assert.equal(liq.total, 18.4);
    assert.equal((ok.pedido as Row).total, 18.4);
    const uno = await handle("compras_pago", { token: c.token, oc_id: draft.id, monto: 1 }, c) as Row;
    const c1 = uno.cierres as Row[];
    assert.equal(c1.length, 1);
    assert.equal(c1[0].ticket_ref, "TK-A");
    assert.equal(c1[0].sku, "HT-002");
    assert.equal(c1[0].qty, 0.125);
    assert.equal(c1[0].monto, 1);
    const cent = await handle("compras_pago", { token: c.token, oc_id: draft.id, monto: 0.01 }, c) as Row;
    const cCent = cent.cierres as Row[];
    assert.equal(cCent.length, 1);
    assert.equal(cCent[0].ticket_ref, "TK-A");
    assert.equal(cCent[0].monto, 0.01);
    assert.ok(Number(cCent[0].qty) > 0 && Number(cCent[0].qty) < 0.01);
    const resto = await handle("compras_pago", { token: c.token, oc_id: draft.id, monto: 14.99 }, c) as Row;
    const cResto = resto.cierres as Row[];
    assert.ok(cResto.length >= 1 && cResto.length <= 4);
    const todos = await db.all("erp_consignacion_cierre");
    assert.ok(todos.length < 10);
    assert.equal(todos.some((r) => !(Number(r.qty) > 0) || !(Number(r.monto) > 0)), false);
    assert.equal(todos.some((r) => String(r.ticket_ref).startsWith("TK-OLD") || r.ticket_ref === "TK-FUERA" || r.sku === "HT-090"), false);
    const montos = todos.reduce((a, r) => a + Number(r.monto), 0);
    assert.ok(Math.abs(montos - 16) < 0.02);
  });

  it("un ticket de producto vendible baja el inventario de venta", async () => {
    const db = new MemoryDb(erpSeed());
    const c = ctx(db);
    const antes = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta && r.bodega_id === BODEGA_VENTA)?.cantidad;
    const out = await handle("crearTicket", {
      token: c.token, nombre: "Ana", cedula: "1711", cosmetologa: "Andrea", estimado: 20,
      productos: { "HT-002": 2 },
    }, c) as Row;
    assert.equal(out.ok, true);
    assert.equal(out.inventario, 2);
    const despues = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta && r.bodega_id === BODEGA_VENTA)?.cantidad;
    assert.equal(Number(despues), Number(antes) - 2);
    const mov = (await db.all("erp_movimientos")).find((m) => m.tipo === "venta" && m.ticket_ref === out.beta_num);
    assert.equal(mov?.delta, -2);
  });

  it("en modo prueba la OC usa la serie TEST y no pisa OC-0001", async () => {
    const db = new MemoryDb(erpSeed());
    const c = ctx(db);
    db.tables.get("sesiones")!.find((r) => r.token === c.token)!.modo_prueba = true;
    db.tables.get("erp_oc")!.push({
      id: "oc-real", numero: "OC-0001", proveedor_id: SEED_IDS.prov, flujo: "Aprobada", estado: "abierta", origin: "beta",
    });
    const draft = await handle("compras_guardar", {
      token: c.token, proveedor_id: SEED_IDS.prov, lineas: [{ sku: "HT-002", cantidad: 1, precio: 8 }],
    }, c) as Row;
    const ok = await handle("compras_aprobar", { token: c.token, id: draft.id }, c) as Row;
    assert.equal(ok.numero, "TEST-OC-0001");
    assert.equal((await db.all("erp_oc")).find((r) => r.numero === "OC-0001")?.origin, "beta");
  });

  it("guardar escribe la cabecera antes que las líneas y la base falsa exige esa FK", async () => {
    const db = new OcFkDb(erpSeed());
    const c = ctx(db);
    await assert.rejects(
      () => db.write("emi", "erp_oc_lineas", "insert", {}, { id: "huerfana", oc_id: "oc-ausente", cantidad: 1, precio: 8 }),
      /erp_oc_lineas_oc_id_fkey/,
    );
    assert.equal(db.writes.length, 0);
    const malo = await handle("compras_guardar", {
      token: c.token, proveedor_id: SEED_IDS.prov, lineas: [{ sku: "NO-EXISTE", cantidad: 1 }],
    }, c) as Row;
    assert.match(String(malo.error), /catálogo/);
    const vacio = await handle("compras_guardar", {
      token: c.token, proveedor_id: SEED_IDS.prov, lineas: [{ sku: "HT-002", cantidad: 0 }],
    }, c) as Row;
    assert.match(String(vacio.error), /cantidades/);
    assert.equal((await db.all("erp_oc")).length, 0);
    const draft = await handle("compras_guardar", {
      token: c.token, proveedor_id: SEED_IDS.prov, lineas: [{ sku: "HT-002", cantidad: 2, precio: 8 }],
    }, c) as Row;
    assert.equal(draft.ok, true);
    assert.equal(draft.flujo, "Borrador");
    assert.equal(draft.total, 18.4);
    const ocAt = db.writes.findIndex((w) => w.table === "erp_oc" && w.op === "insert");
    const lnAt = db.writes.findIndex((w) => w.table === "erp_oc_lineas" && w.op === "insert");
    assert.ok(ocAt >= 0 && lnAt > ocAt);
    const antes = db.writes.length;
    const otra = await handle("compras_guardar", {
      token: c.token, id: draft.id, proveedor_id: SEED_IDS.prov, lineas: [{ sku: "HT-002", cantidad: 3, precio: 8 }],
    }, c) as Row;
    assert.equal(otra.ok, true);
    assert.equal(otra.total, 27.6);
    const tail = db.writes.slice(antes);
    const up = tail.findIndex((w) => w.table === "erp_oc" && w.op === "update");
    const reescrita = tail.findIndex((w) => w.table === "erp_oc_lineas");
    assert.ok(up >= 0 && reescrita > up);
    const lineas = (await db.all("erp_oc_lineas")).filter((r) => r.oc_id === draft.id);
    assert.equal(lineas.length, 1);
    assert.equal(lineas[0].cantidad, 3);
  });

  it("Allskin usa la familia AS de la hoja y llena solo esos códigos", async () => {
    const seed = erpSeed();
    seed.erp_proveedores[0].nombre = "Allskin Company S.A.S";
    seed.erp_productos.push(
      { id: "as-1", sku: "AS-001", nombre: "Aceite", uso: "venta", clase: "producto", costo_promedio: 5, activo: true },
      { id: "ht-extra", sku: "HT-009", nombre: "Otro", uso: "venta", clase: "producto", costo_promedio: 5, activo: true },
    );
    const db = new MemoryDb(seed);
    db.tables.set("proveedores", [{ sheet_row: 4, nombre: "Allskin Company S.A.S", familia: "AS", orig: {} }]);
    db.tables.set("tickets", [{ id: "t1", timestamp: "2026-10-20T15:00:00Z", as_001: 2, ht_002: 9 }]);
    const c = ctx(db);
    const per = await handle("compras_periodo", {
      token: c.token, proveedor_id: SEED_IDS.prov, desde: "2026-10-15", hasta: "2026-10-31",
    }, c) as Row;
    assert.equal(per.ok, true);
    assert.equal(per.familia, "AS");
    assert.equal(per.vacio, false);
    assert.deepEqual((per.lineas as Row[]).map((r) => r.sku), ["AS-001"]);
    assert.equal((per.lineas as Row[])[0].vendido, 2);
    const lista = await handle("prov_list", { token: c.token }, c) as Row;
    const as = (lista.items as Row[]).find((r) => r.id === SEED_IDS.prov);
    assert.equal(as?.familia, "AS");
  });

  it("Atencio es ML por la hoja, aunque el nombre no diga Dr.esthe", async () => {
    const seed = erpSeed();
    seed.erp_proveedores[0].nombre = "Atencio Aguas Francisco Javier";
    seed.erp_productos.push({ id: "ml-1", sku: "ML-001", nombre: "Ampolla", uso: "venta", clase: "producto", costo_promedio: 40, activo: true });
    const db = new MemoryDb(seed);
    db.tables.set("proveedores", [{ sheet_row: 8, nombre: "Atencio Aguas Francisco Javier", familia: "ML", orig: {} }]);
    db.tables.set("tickets", [{ id: "t1", timestamp: "2026-10-16T15:00:00Z", orig: { "ML-001": 1 } }]);
    const c = ctx(db);
    const per = await handle("compras_periodo", {
      token: c.token, proveedor: "Atencio Aguas Francisco Javier", desde: "2026-10-15", hasta: "2026-10-31",
    }, c) as Row;
    assert.equal(per.familia, "ML");
    assert.equal((per.lineas as Row[])[0].sku, "ML-001");
    assert.equal((per.lineas as Row[])[0].vendido, 1);
  });

  it("sin ventas del periodo avisa en vez de quedar en silencio", async () => {
    const seed = erpSeed();
    seed.erp_proveedores[0].nombre = "APHLORA";
    seed.erp_productos.push({ id: "ph-1", sku: "PH-001", nombre: "Balance", uso: "venta", clase: "producto", costo_promedio: 4, activo: true });
    const db = new MemoryDb(seed);
    db.tables.set("proveedores", [{ sheet_row: 2, nombre: "APHLORA", familia: "PH", orig: {} }]);
    db.tables.set("tickets", [{ id: "fuera", timestamp: "2026-09-01T15:00:00Z", orig: { "PH-001": 4 } }]);
    const c = ctx(db);
    const per = await handle("compras_periodo", {
      token: c.token, proveedor_id: SEED_IDS.prov, desde: "2026-10-15", hasta: "2026-10-31",
    }, c) as Row;
    assert.equal(per.ok, true);
    assert.equal(per.vacio, true);
    assert.match(String(per.aviso), /No hubo ventas de PH/);
    assert.equal((per.lineas as Row[]).length, 0);
  });

  it("una OC importada en cero toma el total del json y, si hay líneas, de las líneas", async () => {
    const seed = erpSeed();
    const db = new MemoryDb(seed);
    db.tables.get("erp_oc")!.push({
      id: "oc-legacy", numero: "OC-2026-0079", proveedor_id: SEED_IDS.prov, fecha: "2026-10-21",
      estado: "abierta", flujo: "", subtotal: 0, iva: 0, total: 0, pagado: 0, saldo: 0,
    });
    db.tables.set("ordenes_compra", [{
      numorden: "OC-2026-0079", proveedor: "Hebetronic S.A.", fecha: "2026-10-02",
      json: { fact: [{ sku: "HT-002", nombre: "Crema", vendido: 2, compra: 10 }] },
    }]);
    const c = ctx(db);
    const lista = await handle("compras_lista", { token: c.token }, c) as Row;
    const oc = (lista.items as Row[]).find((r) => r.numero === "OC-2026-0079");
    assert.equal(oc?.subtotal, 20);
    assert.equal(oc?.total, 23);
    assert.equal(oc?.saldo, 23);
    assert.equal((oc?.lineas as Row[])[0].sku, "HT-002");
    db.tables.get("erp_oc_lineas")!.push({
      id: "ln-real", oc_id: "oc-legacy", producto_id: SEED_IDS.venta, cantidad: 2, precio: 8, subtotal: 16, orden: 0,
    });
    const otra = await handle("compras_lista", { token: c.token }, c) as Row;
    const fija = (otra.items as Row[]).find((r) => r.numero === "OC-2026-0079");
    assert.equal(fija?.subtotal, 16);
    assert.equal(fija?.total, 18.4);
    assert.equal(fija?.saldo, 18.4);
  });

  it("0030 suma el flujo, las tablas nuevas y la purga", () => {
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0030_compras_flujo.sql", import.meta.url), "utf8");
    assert.match(sql, /add column if not exists flujo text/);
    assert.match(sql, /add column if not exists no_recibido numeric/);
    assert.match(sql, /create table if not exists public\.erp_oc_pagos/);
    assert.match(sql, /create table if not exists public\.erp_consignacion_cierre/);
    assert.match(sql, /'erp_oc_pagos','erp_consignacion_cierre'/);
    const purga = sql.slice(sql.indexOf("function public.prueba_purgar"));
    assert.match(purga, /'erp_oc_pagos'/);
    assert.match(purga, /'erp_consignacion_cierre'/);
    assert.match(purga, /where origin = %L', t, 'test'/);
  });
});

describe("conteo por secciones", () => {
  it("el admin parte el conteo por familia, la cosmetóloga cuenta a ciegas y al aprobar se ajusta el stock", async () => {
    const db = new MemoryDb(erpSeed());
    const c = ctx(db);
    db.tables.get("usuarios")!.push({ id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false });
    db.tables.get("sesiones")!.push({ token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" });
    const plan = await handle("conteo_plan", { token: c.token, bodega_ids: [BODEGA_VENTA, BODEGA_CABINA] }, c) as Row;
    assert.equal(plan.ok, true);
    const secs = plan.secciones as Row[];
    const ht = secs.find((r) => r.familia === "HT" && r.bodega_id === BODEGA_VENTA);
    assert.equal(ht?.etiqueta, "HT — ANUA");
    assert.equal(secs.some((r) => r.familia === "CB" && r.bodega_id === BODEGA_CABINA), true);
    assert.equal(secs.some((r) => r.familia === "AB" && r.bodega_id === BODEGA_VENTA), true);
    const no = await handle("conteo_crear", { token: "t-andrea", bodega_ids: [BODEGA_VENTA] }, c) as Row;
    assert.match(String(no.error), /admin|permiso/i);
    const creado = await handle("conteo_crear", {
      token: c.token, bodega_ids: [BODEGA_VENTA, BODEGA_CABINA],
      asignaciones: [{ bodega_id: BODEGA_VENTA, familia: "HT", uid: "andrea" }],
    }, c) as Row;
    assert.equal(creado.ok, true);
    assert.match(String(creado.numero), /^CNT-/);
    assert.equal(creado.flujo, "Abierto");
    const mios = await handle("conteo_mios", { token: "t-andrea" }, c) as Row;
    const tarea = (mios.items as Row[])[0];
    assert.equal((mios.items as Row[]).length, 1);
    assert.equal(tarea.familia, "HT");
    const sec = await handle("conteo_seccion", { token: "t-andrea", seccion_id: tarea.id }, c) as Row;
    const linea = (sec.productos as Row[])[0];
    assert.equal(linea.sku, "HT-002");
    assert.equal(linea.nombre, "Crema retail");
    assert.equal(linea.sistema, undefined);
    assert.equal("precio" in linea, false);
    assert.equal("proveedor" in sec, false);
    const panel0 = await handle("conteo_panel", { token: c.token, id: creado.id }, c) as Row;
    const cb = ((panel0.items as Row[])[0].secciones as Row[]).find((r) => r.familia === "CB");
    const vedada = await handle("conteo_seccion", { token: "t-andrea", seccion_id: cb?.id }, c) as Row;
    assert.match(String(vedada.error), /tuya/i);
    const parcial = await handle("conteo_guardar_sec", {
      token: "t-andrea", seccion_id: tarea.id, lineas: [{ id: linea.id, contado: 3 }],
    }, c) as Row;
    assert.equal(parcial.estado, "En progreso");
    assert.equal(parcial.flujo, "En progreso");
    const fin = await handle("conteo_cerrar_sec", { token: "t-andrea", seccion_id: tarea.id }, c) as Row;
    assert.equal(fin.estado, "Sección completa");
    assert.equal(fin.flujo, "Sección completa");
    const temprano = await handle("conteo_aprobar", { token: c.token, id: creado.id }, c) as Row;
    assert.match(String(temprano.error), /secciones/i);
    const noApr = await handle("conteo_aprobar", { token: "t-andrea", id: creado.id }, c) as Row;
    assert.match(String(noApr.error), /admin|permiso/i);
    const panel = await handle("conteo_panel", { token: c.token, id: creado.id }, c) as Row;
    const todas = (panel.items as Row[])[0].secciones as Row[];
    const htSec = todas.find((r) => r.familia === "HT");
    assert.equal((htSec?.diferencias as Row[])[0].diferencia, -2);
    for (const s of todas) {
      if (s.estado === "Sección completa") continue;
      const cerrado = await handle("conteo_cerrar_sec", { token: c.token, seccion_id: s.id }, c) as Row;
      assert.equal(cerrado.ok, true);
    }
    const antes = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta && r.bodega_id === BODEGA_VENTA)?.cantidad;
    const ok = await handle("conteo_aprobar", { token: c.token, id: creado.id }, c) as Row;
    assert.equal(ok.flujo, "Aplicado");
    assert.ok(Number(ok.ajustes) >= 1);
    const despues = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta && r.bodega_id === BODEGA_VENTA)?.cantidad;
    assert.equal(Number(despues), 3);
    assert.equal(Number(antes), 5);
    const mov = (await db.all("erp_movimientos")).find((m) => m.tipo === "conteo" && m.producto_id === SEED_IDS.venta);
    assert.equal(mov?.delta, -2);
    assert.equal(mov?.doc_tipo, "conteo");
    assert.equal((await db.all("log_acciones")).some((r) => r.accion === "CONTEO APLICADO"), true);
    const ya = await handle("conteo_mios", { token: "t-andrea" }, c) as Row;
    assert.equal((ya.items as Row[]).length, 0);
  });

  it("0031 agrega secciones de conteo sin tocar el conteo viejo", () => {
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0031_conteo_secciones.sql", import.meta.url), "utf8");
    assert.match(sql, /add column if not exists flujo text/);
    assert.match(sql, /create table if not exists public\.erp_conteo_secciones/);
    assert.match(sql, /create table if not exists public\.erp_conteo_items/);
    assert.match(sql, /'erp_conteo_secciones','erp_conteo_items'/);
    assert.equal(sql.includes("drop table"), false);
    const screens = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    assert.match(screens, /Hacer conteo/);
    assert.match(screens, /HT — ANUA/);
  });
});

describe("compras: la bandera de admin no pisa la función", () => {
  it("window._cmpAdmin nunca se asigna; la bandera es _cmpEsAdmin", () => {
    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    assert.match(src, /function _cmpAdmin\(\)\{ return !!window\._cmpEsAdmin; \}/);
    assert.doesNotMatch(src + beta, /window\._cmpAdmin\s*=[^=]/);
    assert.match(beta, /window\._cmpEsAdmin = !!state\.admin;/);
  });
});

describe("escritorio lista y detalle", () => {
  it("compras copia la estructura, no la lógica de MineCore", () => {
    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    const bloque = src.slice(src.indexOf("async function renderComprasFlujo"), src.indexOf("// ══════ CONTEO"));
    assert.match(bloque, /Nueva OC/);
    assert.match(bloque, /Buscar nº, proveedor, factura o SKU/);
    assert.match(bloque, /Nº proveedor/);
    assert.match(bloque, /PDF bodega \(sin precios\)/);
    assert.match(bloque, /Agregar producto/);
    assert.match(bloque, /Registrar pago/);
    assert.match(bloque, /Llenar con ventas del periodo/);
    assert.match(bloque, /id="cmp-fam"/);
    assert.doesNotMatch(bloque, /id="cmp-nprov"/);
    assert.match(bloque, /desk-full/);
    assert.match(beta, /desk-split\.desk-open \{ grid-template-columns: minmax\(200px, 280px\)/);
    assert.match(beta, /tk-split\.tk-side/);
    assert.match(beta, /id="inv-mini"/);
    assert.doesNotMatch(bloque, /id="cmp-bar"/);
    assert.doesNotMatch(bloque, /<select id="cmp-prov"/);
    assert.doesNotMatch(bloque, /<select/);
    assert.doesNotMatch(bloque, /inFlow/);
    assert.doesNotMatch(bloque, /retencion/i);
    assert.match(beta, /Nueva orden de compra/);
    assert.match(beta, /data-go="#\/m\/inventario\/nuevo"/);
    assert.match(beta, /\.desk-table th, \.desk-table td \{ white-space: nowrap;/);
    const sql = readFileSync(new URL("../../../docs/supabase/pending/0032_producto_ficha.sql", import.meta.url), "utf8");
    assert.match(sql, /sku_proveedor text/);
    assert.match(sql, /linea text/);
    assert.match(sql, /observaciones text/);
    assert.match(sql, /'productos', 'productos', false/);
    assert.equal(sql.includes("drop table"), false);
    assert.doesNotMatch(sql, /create or replace function public\.app_write/);
  });

  it("la ficha guarda sku de proveedor, línea y observaciones, y la foto sale del archivo", async () => {
    const db = new MemoryDb(erpSeed());
    const c = ctx(db);
    const ok = await handle("prod_save", {
      token: c.token, sku: "HT-009", nombre: "Tónico", uso: "venta",
      sku_proveedor: "PROV-1", linea: "Glass", observaciones: "frágil",
    }, c) as Row;
    assert.equal(ok.ok, true);
    const row = (await db.all("erp_productos")).find((r) => r.sku === "HT-009");
    assert.equal(row?.sku_proveedor, "PROV-1");
    assert.equal(row?.linea, "Glass");
    assert.equal(row?.observaciones, "frágil");
    const foto = await handle("prod_foto", {
      token: c.token, id: ok.id, foto_b64: "data:image/png;base64,QQ==", nombre: "a.png",
    }, c) as Row;
    assert.equal(foto.ok, true);
    assert.match(String(foto.foto_url), /^archivo:/);
    const got = await handle("prod_get", { token: c.token, id: ok.id }, c) as Row;
    assert.match(String((got.producto as Row).foto_data), /^data:image\/png;base64,/);
  });
});

describe("ninguna variable window._x pisa una función global _x", () => {
  it("beta-screens.js y beta.html no reasignan funciones globales vía window", () => {
    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    const fns = new Set([...(src + "\n" + beta).matchAll(/^\s*function (_[A-Za-z0-9]+)\s*\(/gm)].map((m) => m[1]));
    const asign = new Set([...(src + "\n" + beta).matchAll(/window\.(_[A-Za-z0-9]+)\s*=(?!=)/g)].map((m) => m[1]));
    const choque = [...asign].filter((x) => fns.has(x));
    assert.deepEqual(choque, []);
  });
});

describe("total del ticket desde sus líneas", () => {
  it("factura sin decimales, canje = facial $0, el total se mueve solo por las líneas", async () => {
    const { facturaTxt, totalLineas, patchLineas } = await import("./ticket_total.ts");
    assert.equal(facturaTxt("2833.0"), "2833");
    assert.equal(facturaTxt(2833), "2833");
    assert.equal(facturaTxt("SIN FACTURA"), "SIN FACTURA");
    assert.equal(facturaTxt(""), "");
    const cat = [
      { sku: "SUNSU-52", total_con_iva: "95.0" }, { sku: "SUNSU-53", total_con_iva: "256.5" },
      { sku: "SUNSU-31", total_con_iva: "20" }, { sku: "SUNSU-01", total_con_iva: "75" },
    ];
    // TK-SO-1722: canje de paquete, facial $0, pack x3 = 256.50 → cuadra con lo guardado
    const tk = { estimado: "256.5", paquete: "SI, 1/3", facial_hecho: "SUNSU-52 Facial de Ginseng", compra_pack_3: "SUNSU-53 x3 Facial de Ginseng" };
    assert.equal(totalLineas(tk, cat), 256.5);
    // agregar un extra cobrable y otro de cortesía
    const p1 = patchLineas(tk, { extras: "SUNSU-31 PDRN Serum | SUNSU-31 PDRN Serum [CORTESIA: Promo]" }, cat)!;
    assert.equal(p1.estimado, 276.5);
    // el total enviado por el cliente se ignora
    const p2 = patchLineas(tk, { estimado: 1, pack3: "" }, cat)!;
    assert.equal(p2.estimado, 0);
    // un ticket con promo guardada conserva su descuento al cambiar líneas
    const promo = { estimado: "60", facial_hecho: "SUNSU-01 Facial S.O.S" };
    const p3 = patchLineas(promo, { facial: "SUNSU-01 Facial S.O.S | SUNSU-52 Facial de Ginseng" }, cat)!;
    assert.equal(p3.facial_hecho, "SUNSU-01 Facial S.O.S | SUNSU-52 Facial de Ginseng");
    assert.equal(p3.estimado, 155);
    assert.equal(patchLineas(promo, { notas: "x" }, cat), null);
  });

  it("el detalle no recalcula el canje con precios fijos y el total no es campo libre", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const src = readFileSync(join(root, "beta-screens.js"), "utf8");
    assert.doesNotMatch(src, /totalCliente=extrasCobrables\+\(packInfo/);
    assert.doesNotMatch(src, /\["estimado","Total",t\.estimado\]/);
    assert.match(src, /\+ Agregar facial/);
    assert.match(src, /\+ Agregar extra/);
    assert.match(src, /\+ Agregar paquete/);
    assert.match(src, /function _facTxt/);
    assert.doesNotThrow(() => new Function(src));
  });
});
