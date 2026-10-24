import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { comisionPaquetesTramo, comisionProductos, nCosmetologas, normalizarTramos, puedeCotizar, rolCalcular, siguienteOv, type CosmMark } from "./domain.ts";
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
      { sheet_row: 1, cedula: "1711", nombre: "María", apellido: "Paz", telefono: "099" },
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
    assert.equal((own.clientes as Row[]).some((c) => c.cedula === "1733"), false);
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
    assert.match(html, /class="cli-line/);
    assert.match(html, /cli-desk/);
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
    assert.equal(casaTest?.cantidad, Number(stockAntes) + 2);
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
    assert.match(String(cot.numero), /^TEST-TK-SQ-/);

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
  it("los tramos por defecto siguen en dólares y el porcentaje usa el neto", () => {
    assert.equal(comisionPaquetesTramo(12).monto, 10 * 10 + 2 * 15);
    assert.equal(comisionPaquetesTramo(12).etiqueta, "11–20 · $15");
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
    ]);
    const cot = await handle("guardarCotizacion", {
      token: cotVieja.token, cliente: "C", lineas: [{ nombre: "Facial", cant: 1, precio: 20 }],
    }, cotVieja) as Row;
    assert.equal((await db.all("cotizaciones")).find((r) => r.cliente === "A")?.numero, "TK-SQ-0001");
    assert.equal((await db.all("cotizaciones")).find((r) => r.cliente === "B")?.numero, "TK-SQ-0002");
    assert.equal(cot.numero, "TK-SQ-0003");
    const otra = await handle("guardarCotizacion", {
      token: cotVieja.token, numero: "TK-SQ-0003", cliente: "C editada", lineas: [{ nombre: "Facial", cant: 2, precio: 20 }],
    }, cotVieja) as Row;
    assert.equal(otra.ok, true);
    assert.equal(otra.numero, "TK-SQ-0003");
    assert.equal((await db.all("cotizaciones")).filter((r) => r.numero === "TK-SQ-0003").length, 1);
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
});
