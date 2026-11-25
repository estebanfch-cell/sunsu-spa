// TK210: cruce ±3 días (ticket subido al día siguiente) + «Subido tarde · 50%» de comisión.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./migo_cuadre_api.ts";
import "./fecha_atencion_api.ts";
import { cruzar, parseFacturaVivo, candidatosParaFactura, type FacturaVivo } from "./migo_cuadre.ts";
import { calcularCiclo, CFG_DEF, comisionProductos, s, type Row, type TicketIn } from "./domain.ts";
import { factorComisionTicket, parseFechaStaff, resolverFechaAtencion, avisoTardeActivo, AVISO_TARDE_TEXTO, PROMPT_TARDE_TEXTO, AVISO_TARDE_HASTA } from "./fecha_atencion.ts";

const LINEAS_2991 = [
  { cantidad: 1, codigo: "SUNSU-SU-009", producto: "Olive lip Mask 13 ml - SIDMOOL", sku: "SUNSU-SU-009", precio_unit: 13.04, subtotal: 13.04, iva: 1.96, total: 15 },
  { cantidad: 1, codigo: "SUNSU-31", producto: "PDRN SERUM", sku: "SUNSU-31", precio_unit: 13.04, subtotal: 13.04, iva: 1.96, total: 15 },
  { cantidad: 1, codigo: "SUNSU-18", producto: "PAQUETE (3) FACIAL REPARACIÓN", sku: "SUNSU-18", precio_unit: 152.61, subtotal: 152.61, iva: 22.89, total: 175.5 },
];
function fac2991(extra: Row = {}): FacturaVivo {
  return parseFacturaVivo({ factura: "001-001-000002991", fecha: "2026-11-20", cliente: "José Juan García", cliente_ruc: "GT38882026", cliente_email: "cliente@example.com", total: 205.5, forma: "tarjeta", formas_pago: [{ forma: "tarjeta", valor: 205.5 }], lineas: LINEAS_2991, ...extra })!;
}
const det = (sku: string, nombre: string, total: number, cantidad = 1) => ({ sku, codigo: sku, producto: nombre, cantidad, total, precio_unit: total / cantidad });
function tk1960(extra: Row = {}): Row {
  return {
    id: 646251, clave: "TK-SO-1960", so_num: "TK-SO-1960", fecha: "2026-11-21", nombre: "Yenyret", apellido: "Torres", id_3: "164804287", estimado: 190.5, fac_7: "",
    lineasDetalle: [det("SUNSU-18", "Paquete x3 Facial Reparación", 175.5, 3), det("SUNSU-31", "PDRN Serum", 15)],
    ocr_vouchers: [{ fecha: "2026-11-20", monto: 190.5, referencia: "430565" }], ...extra,
  };
}
function tk1961(extra: Row = {}): Row {
  return {
    id: 646252, clave: "TK-SO-1961", so_num: "TK-SO-1961", fecha: "2026-11-21", nombre: "Yenyret", apellido: "Torres", id_3: "164804287", estimado: 15, fac_7: "",
    lineasDetalle: [det("SUNSU-SU-009", "Olive lip Mask", 15)], ...extra,
  };
}

describe("TK210 · cruce ±3 días", () => {
  it("2991 (20/11) ↔ 1960 + 1961 (21/11): SKU (paquete 1 = x3) + suma + voucher → vincula ambos, 1 día de diferencia", () => {
    const links = cruzar([fac2991()], [tk1960(), tk1961()], { ventana: { desde: "" } });
    assert.equal(links.length, 2, JSON.stringify(links));
    for (const L of links) {
      assert.equal(L.factura, "001-001-000002991");
      assert.equal(L.tipo, "ventana_3d");
      assert.equal(L.diferencia_fecha, 1);
      assert.match(L.motivo, /Ventana ±3 días/);
      assert.match(L.motivo, /SKU y cantidades/);
      assert.match(L.motivo, /voucher/);
      assert.equal(L.estado, "cuadra");
    }
  });
  it("el mismo día gana: si hay ticket del día de la factura, no se usa el del día siguiente", () => {
    const hoyT = tk1960({ id: 1, clave: "TK-SO-1", fecha: "2026-11-20", lineasDetalle: tk1960().lineasDetalle, estimado: 190.5 });
    const f = fac2991({ lineas: LINEAS_2991.slice(1), total: 190.5, formas_pago: [] });
    const links = cruzar([f], [hoyT, tk1960({ ocr_vouchers: [] })], { ventana: { desde: "" } });
    assert.equal(links.length, 1);
    assert.equal(links[0].ticket_id, 1);
    assert.equal(links[0].diferencia_fecha, 0);
  });
  it("histórico: con la ventana en producción (desde 22/11) la factura del 20/11 NO se vincula sola", () => {
    const captura: Row[] = [];
    const links = cruzar([fac2991()], [tk1960(), tk1961()], { onVentana: (r) => captura.push(r as unknown as Row) });
    assert.equal(links.length, 0);
    assert.equal(((captura[0].links as Row[]) || []).length, 1, "el dry-run sí la propone");
    assert.deepEqual(captura[0].aplicados, []);
  });
  it("nunca vincula si es ambiguo: dos clientas con los mismos SKU y monto ±3 días → sugerencia", () => {
    const f = fac2991({ lineas: [LINEAS_2991[0]], total: 15, formas_pago: [], cliente_email: "", cliente_ruc: "" });
    const a = tk1961({ id: 10, clave: "TK-SO-10", nombre: "Ana", apellido: "Uno", id_3: "1700000001", ocr_vouchers: [{ fecha: "2026-11-20", monto: 15 }] });
    const b = tk1961({ id: 11, clave: "TK-SO-11", nombre: "Bea", apellido: "Dos", id_3: "1700000002", ocr_vouchers: [{ fecha: "2026-11-20", monto: 15 }] });
    const cap: Row[] = [];
    const links = cruzar([f], [a, b], { ventana: { desde: "" }, onVentana: (r) => cap.push(r as unknown as Row) });
    assert.equal(links.length, 0);
    assert.match(s(((cap[0].sugerencias as Row[])[0] || {}).razon), /ambiguo/);
  });
  it("confianza baja (sin voucher, documento, correo ni nombre) → solo sugerencia", () => {
    const t = tk1961({ nombre: "Otra", apellido: "Persona", id_3: "1700000003", ocr_vouchers: [] });
    const f = fac2991({ lineas: [LINEAS_2991[0]], total: 15, formas_pago: [], cliente_email: "", cliente_ruc: "" });
    const cap: Row[] = [];
    // mismo SKU y precio pero sin identidad: no se vincula
    const links = cruzar([f], [{ ...t, fecha: "2026-11-22" }], { ventana: { desde: "" }, onVentana: (r) => cap.push(r as unknown as Row) });
    assert.equal(links.length, 0);
    assert.equal(s(((cap[0].sugerencias as Row[])[0] || {}).razon), "confianza baja");
  });
  it("correo de la ficha = correo del RIDE cuenta como identidad", () => {
    const t = tk1961({ nombre: "Otra", apellido: "Persona", id_3: "1700000003", ocr_vouchers: [], emails_cliente: ["cliente@example.com"], fecha: "2026-11-22" });
    const f = fac2991({ lineas: [LINEAS_2991[0]], total: 15, formas_pago: [] });
    const links = cruzar([f], [t], { ventana: { desde: "" } });
    assert.equal(links.length, 1);
    assert.match(links[0].motivo, /correo/);
    assert.equal(links[0].diferencia_fecha, 2);
  });
  it("factura ya vinculada en otro ticket (por número) no se vuelve a vincular", () => {
    const otro = tk1961({ id: 99, clave: "TK-SO-99", fac_7: "001-001-000002991", fecha: "2026-11-20" });
    const links = cruzar([fac2991()], [otro, tk1960(), tk1961()], { ventana: { desde: "" } });
    assert.ok(links.every((L) => L.ticket_id === 99), JSON.stringify(links.map((L) => [L.ticket_id, L.tipo])));
  });
  it("pago directo y canje $0 no entran a la ventana", () => {
    const pd = tk1961({ notas_generales: "Pago Directo EGB", ocr_vouchers: [{ fecha: "2026-11-20", monto: 15 }] });
    const f = fac2991({ lineas: [LINEAS_2991[0]], total: 15, formas_pago: [] });
    assert.equal(cruzar([f], [pd], { ventana: { desde: "" } }).length, 0);
  });
  it("bandeja: candidatos ±3 días, el mismo día primero y con señales", () => {
    const inv = { fecha: "2026-11-20", cliente: "José Juan García", total: 205.5, lineas: LINEAS_2991 };
    const C = candidatosParaFactura(inv, [tk1960(), tk1961()]);
    const par = C.find((c) => c.claves.includes("TK-SO-1960") && c.claves.includes("TK-SO-1961"));
    assert.ok(par && par.cuadra, JSON.stringify(C.map((c) => c.claves)));
    assert.equal(par!.dias, 1);
    assert.match(par!.motivo, /voucher/);
  });
});

describe("TK210 · fecha de atención y «Subido tarde · 50%»", () => {
  it("acepta las fechas como las escriben las chicas", () => {
    const hoy = "2026-11-22";
    for (const v of ["20/11", "20/11/26", "20/11/2026", "20-11-2026", "20.11.2026", "2026-11-20", "20 nov", "20 de noviembre"]) assert.equal(parseFechaStaff(v, hoy), "2026-11-20", v);
    assert.equal(parseFechaStaff("ayer", hoy), "2026-11-21");
    assert.equal(parseFechaStaff("31/12", "2027-01-02"), "2026-12-31");
    assert.equal(resolverFechaAtencion("25/11", hoy).tarde, false, "futuro → hoy, no bloquea");
    assert.deepEqual(resolverFechaAtencion("21/11", hoy), { fecha: "2026-11-21", tarde: true, dias: 1, invalida: false });
  });
  it("aviso al equipo 15 días", () => {
    assert.equal(avisoTardeActivo("2026-11-21"), true);
    assert.equal(avisoTardeActivo("2026-12-06"), true);
    assert.equal(avisoTardeActivo("2026-12-07"), false);
    assert.match(AVISO_TARDE_TEXTO, /50% de la comisión/);
    assert.equal(PROMPT_TARDE_TEXTO, "Este ticket se paga al 50% de comisión por subirse tarde.");
  });
  it("factor 0.5 solo para tickets creados desde el deploy con el flag", () => {
    assert.equal(factorComisionTicket({ created_at: "2026-11-22T15:00:00Z", orig: { subido_tarde: true, comision_factor: 0.5 } }), 0.5);
    assert.equal(factorComisionTicket({ created_at: "2026-11-20T15:00:00Z", orig: { subido_tarde: true } }), 1, "no retroactivo");
    assert.equal(factorComisionTicket({ created_at: "2026-11-22T15:00:00Z", orig: {} }), 1);
  });
  it("ticket de prueba: facial + extra + paquete + producto, subido tarde → cada parte al 50%", () => {
    const base = { cosm: "Andrea Robles", cedula: "1700000009", exclFacial: false, exclPaquete: false, exclProducto: false, exclExtras: false };
    const normal: TicketIn = { ...base, fecha: "2026-11-27", facial: "SUNSU-40 Facial Reset", pack3: "SUNSU-18 x3", pack6: "", extras: "SUNSU-15 Ampolla", productos: [], netoPack: 152.61 };
    const tarde: TicketIn = { ...normal, fecha: "2026-11-27", factor: 0.5 };
    const marks = [{ id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es: true, activa: true }];
    const c1 = calcularCiclo([normal], marks, CFG_DEF, "2026-11-26").personas[0];
    const c2 = calcularCiclo([tarde], marks, CFG_DEF, "2026-11-26").personas[0];
    assert.ok(c1.comFaciales > 0 && c1.comPaquetes > 0 && c1.comExtras > 0);
    assert.equal(c2.comFaciales, Math.round(c1.comFaciales * 50) / 100);
    assert.equal(c2.comExtras, Math.round(c1.comExtras * 50) / 100);
    assert.equal(c2.comPaquetes, Math.round(c1.comPaquetes * 50) / 100);
    assert.equal(c2.paquetes, c1.paquetes, "el paquete sigue contando para el tramo");
    const p1 = comisionProductos([{ venta: 30, compra: 10, qty: 1, excluido: false, sku: "SUNSU-SU-009" }]);
    const p2 = comisionProductos([{ venta: 30, compra: 10, qty: 1, excluido: false, sku: "SUNSU-SU-009", factor: 0.5 }]);
    assert.equal(p2, Math.round(p1 * 50) / 100);
  });
  it("crearTicket con fecha de atención de ayer: timestamp = atención, created_at aparte, flag 50%", async () => {
    const db = new MemoryDb();
    db.tables.set("sesiones", [{ token: "and", uid: "u-and", rol: "cosmetologa", name: "Andrea Robles", short: "Andrea", exp: "2099-01-01T00:00:00.000Z" }]);
    db.tables.set("usuarios", [{ id: "u-and", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa" }]);
    for (const t of ["app_modulos", "tickets", "beta_tickets", "beta_ticket_flags", "beta_ticket_cancelados", "beta_cuadre_link", "beta_migo_importes", "beta_migo_facturas_vivo", "beta_migo_borradores", "log_acciones", "clientas_registro", "beta_clientes", "beta_ticket_lineas", "catalogo", "paquetes"]) db.tables.set(t, []);
    const c = { db, now: new Date("2026-11-22T15:00:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: fetch, legacyLogin: async () => ({}) };
    const r = await handle("crearTicket", { token: "and", nombre: "Prueba", apellido: "Tarde", cedula: "", esSunsu: false, estimado: 95, cosmetologa: "Andrea Robles", facial: "SUNSU-40 Facial Reset 3x1", ignorar_borrador: true, fecha_atencion: "21/11" }, { ...c, token: "and" } as never) as Row;
    assert.equal(r.ok, true, String(r.error));
    assert.equal(r.subido_tarde, true);
    assert.equal(r.aviso_tarde, PROMPT_TARDE_TEXTO);
    const tk = db.tables.get("tickets")!.at(-1)!;
    assert.equal(s(tk.timestamp).slice(0, 10), "2026-11-21");
    assert.equal((tk.orig as Row).subido_tarde, true);
    assert.equal((tk.orig as Row).comision_factor, 0.5);
    assert.equal((tk.orig as Row).fecha_atencion, "2026-11-21");
    const r2 = await handle("crearTicket", { token: "and", nombre: "Prueba", apellido: "Hoy", estimado: 95, cosmetologa: "Andrea Robles", facial: "SUNSU-40 Facial Reset 3x1", ignorar_borrador: true }, { ...c, token: "and" } as never) as Row;
    assert.equal(r2.subido_tarde, undefined);
    assert.equal(s(db.tables.get("tickets")!.at(-1)!.timestamp).slice(0, 10), "2026-11-22");
  });
});

it("TK210 · frontend: aviso 15 días, prompt del 50% y cache vigente", async () => {
  const { readFileSync } = await import("node:fs");
  const raiz = new URL("../../../", import.meta.url);
  const js = readFileSync(new URL("mc-aviso-tarde.js", raiz), "utf8");
  const sw = readFileSync(new URL("sw.js", raiz), "utf8");
  const html = readFileSync(new URL("index.html", raiz), "utf8");
  const bs = readFileSync(new URL("beta-screens.js", raiz), "utf8");
  assert.ok(js.includes(AVISO_TARDE_TEXTO));
  assert.ok(js.includes(PROMPT_TARDE_TEXTO));
  assert.ok(js.includes('"' + AVISO_TARDE_HASTA + '"'));
  assert.match(sw, /const CACHE = "sunsu-2026-11-25-DEV35"/);
  assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-25-DEV35"/);
  assert.ok(sw.includes('"/mc-aviso-tarde.js"'));
  assert.ok(html.includes('<script src="mc-aviso-tarde.js'));
  assert.ok(bs.includes("payload.fecha_atencion=_fAt"));
});
