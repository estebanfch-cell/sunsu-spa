import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { comisionProductos, nCosmetologas, puedeCotizar, rolCalcular, type CosmMark } from "./domain.ts";
import { BODEGA_CABINA, BODEGA_VENTA, ErpError, SEED_IDS, erpSeed, runErp, usoCompatible } from "./erp.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./erp_api.ts";
import { acceso, esPropio, evaluarBloqueo, redactar, type SesLite } from "./permisos.ts";
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
    assert.equal(nCosmetologas(marks, "2026-09-26", "2026-10-25"), 2);
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
    const otra = await runErp("ov_save", { ticket_ref: "TK-1", lineas: [{ sku: "HT-002", cantidad: 1 }] }, db, "Andrea");
    assert.equal(otra.sinCambios, true);
    const ht = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.venta);
    assert.equal(ht?.cantidad, 4);

    const srv = await runErp("ov_save", {
      ticket_ref: "TK-2",
      lineas: [{ sku: "SUNSU-01", cantidad: 1, precio: 30, clase: "servicio" }],
    }, db, "Andrea");
    assert.equal(srv.ok, true);
    const amp = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.cabina && r.bodega_id === BODEGA_CABINA);
    assert.equal(amp?.cantidad, 8);
    await runErp("ov_anular", { ticket_ref: "TK-2" }, db, "Andrea");
    const amp2 = (await db.all("erp_stock")).find((r) => r.producto_id === SEED_IDS.cabina && r.bodega_id === BODEGA_CABINA);
    assert.equal(amp2?.cantidad, 10);
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
});
