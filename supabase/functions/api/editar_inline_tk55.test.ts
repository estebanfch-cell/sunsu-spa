// TK55 (Emilia 18/11): sin botón «Editar». La admin edita en línea y guarda solo si cambió algo;
// el personal manda solicitud (cambio o eliminación) que una admin aprueba o rechaza.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./inline_api.ts";
import "./paquetes_beta_api.ts";
import "./gift_beta_api.ts";
import "./productos_api.ts";
import "./tickets_beta_api.ts";
import "./tickets_cancelar_api.ts";
import type { Row } from "./domain.ts";

const root = join(import.meta.dirname, "../../..");
function semilla() {
  const db = new MemoryDb();
  db.tables.set("sesiones", [
    { token: "adm", uid: "admin", rol: "admin", name: "Emilia", exp: "2099-01-01T00:00:00.000Z" },
    { token: "cos", uid: "u-ana", rol: "cosmetologa", name: "Ana Pérez", exp: "2099-01-01T00:00:00.000Z" },
    { token: "rec", uid: "u-ale", rol: "recepcion", name: "Alejandra", exp: "2099-01-01T00:00:00.000Z" },
  ]);
  db.tables.set("usuarios", [{ id: "admin", nombre: "Emilia", rol: "admin" }, { id: "u-ana", nombre: "Ana Pérez", rol: "cosmetologa" }, { id: "u-ale", nombre: "Alejandra", rol: "recepcion" }]);
  db.tables.set("paquetes", [
    { id: 5, sheet_row: 7, beta_codigo: "PQ-0005", cedula: "1700000001", nombres: "Elena", apellidos: "Oña", sku: "SUNSU-40", paquete: "Facial Reset 3x1", vendido_por: "Ana Pérez", dia: 14, mes: 11, ano: 2026, uso_1: true, fecha_1: "14/11/26 Facial Reset 3x1 · Daniela Mora" },
  ]);
  db.tables.set("gift_cards", [
    { id: 400, sheet_row: 402, codigo_gc: "26-171", dia: 17, mes: 11, ano: 2026, nombre_comprador: "Camila", cedula_comprador: "1711111111", factura: "2951", sku: "SUNSU-35", valor: "Gift Card", notas: "PREMIUM. De: Camila. Para: Carolina", origin: "sheet" },
  ]);
  for (const t of ["beta_paquete_ajustes", "beta_gift_ajustes", "beta_gift_documentos", "gift_cards_digitales", "beta_clientes", "log_acciones", "app_modulos", "permisos", "tickets", "solicitudes_cambio", "audit_log", "beta_notificaciones"]) db.tables.set(t, []);
  const c = { db, now: new Date("2026-11-18T17:30:00Z"), env: {} as Record<string, string | undefined>, fetchImpl: (async () => new Response("{}")) as unknown as typeof fetch, legacyLogin: async () => ({}) };
  const h = (a: string, tok: string, p: Row = {}) => handle(a, { token: tok, ...p }, { ...c, token: tok }) as Promise<Row>;
  return { db, h };
}

describe("TK55 · sin botón Editar: admin guarda en línea, personal pide", () => {
  it("admin: guarda solo si cambió; historial con antes → después y quién", async () => {
    const { db, h } = semilla();
    const sin = await h("pq_guardar", "adm", { id: 5, datos: { nombres: "Elena", sesiones: "3" } });
    assert.equal(sin.sinCambios, true);
    assert.equal(db.tables.get("beta_paquete_ajustes")!.length, 0, "sin cambios no escribe nada");
    const r = await h("pq_guardar", "adm", { id: 5, datos: { nombres: "Elena María", sesiones: "4" }, fechas: { 1: "2026-11-15" } });
    assert.equal(r.ok, true);
    const aj = db.tables.get("beta_paquete_ajustes")![0];
    const hh = (aj.historial as Row[]).at(-1)!;
    assert.equal(hh.actor, "Emilia");
    assert.match(String(hh.detalle), /sesiones: 3 → 4/);
    assert.match(String(hh.detalle), /nombre: Elena → Elena María/);
    assert.match(String(hh.detalle), /sesión 1: 2026-11-14 → 2026-11-15/);
  });

  it("personal: no guarda directo; la solicitud de paquete se aprueba (aplica y queda en el historial) o se rechaza (no cambia)", async () => {
    const { db, h } = semilla();
    assert.match(String((await h("pq_guardar", "cos", { id: 5, datos: { nombres: "X" } })).error), /solicitud/);
    assert.match(String((await h("pq_borrar", "cos", { id: 5, motivo: "dup" })).error), /solicitud/);
    const g = await h("pq_get", "cos", { id: 5 });
    assert.equal(g.puedeEditar, false); assert.equal(g.puedePedir, true);
    assert.equal(((g.item as Row).sesiones as Row[]).length, 3, "la cosmetóloga ve todas las sesiones (aunque las hizo otra)");
    assert.equal((((g.item as Row).sesiones as Row[])[0]).cosmetologa, "Daniela Mora");
    assert.equal((await h("solicitud_crear", "cos", { tabla: "paquete_beta", fila: "5", tipo: "cambio", motivo: "", propuestos: { nombres: "Elenita" } })).error, "El motivo es obligatorio");
    const s1 = await h("solicitud_crear", "cos", { tabla: "paquete_beta", fila: "5", tipo: "cambio", motivo: "se escribió mal", propuestos: { nombres: "Elenita", "fs:1": "2026-11-16" } });
    assert.equal(s1.ok, true);
    const sol = db.tables.get("solicitudes_cambio")![0];
    assert.equal(sol.etiqueta, "Paquete PQ-0005 · Elena Oña"); assert.equal(sol.enlace, "#/m/gift/paquetes/5");
    assert.equal((sol.antes as Row).nombres, "Elena"); assert.equal(((sol.antes as Row)._campos as Row).nombres, "Nombre");
    // Nada cambió todavía
    assert.equal(((await h("pq_get", "adm", { id: 5 })).item as Row).nombre, "Elena");
    const B = await h("getSolicitudes", "adm");
    assert.equal(B.pendientes, 1);
    assert.equal((await h("solicitud_resolver", "adm", { id: s1.id, aprobar: true })).estado, "aprobado");
    const v = (await h("pq_get", "adm", { id: 5 })).item as Row;
    assert.equal(v.nombre, "Elenita"); assert.equal((v.sesiones as Row[])[0].fecha, "2026-11-16");
    const det = String(((v.historial as Row[]).at(-1) as Row).detalle);
    assert.match(det, /nombre: Elena → Elenita/); assert.match(det, /solicitud de Ana Pérez aprobada/);
    // Rechazo: no cambia nada
    const s2 = await h("solicitud_crear", "cos", { tabla: "paquete_beta", fila: "5", tipo: "cambio", motivo: "prueba", propuestos: { paquete: "Otro" } });
    assert.equal((await h("solicitud_resolver", "adm", { id: s2.id, aprobar: false, comentario: "no" })).estado, "rechazado");
    assert.equal(((await h("pq_get", "adm", { id: 5 })).item as Row).paquete, "Facial Reset 3x1");
    // Eliminación por solicitud
    const s3 = await h("solicitud_crear", "cos", { tabla: "paquete_beta", fila: "5", tipo: "eliminacion", motivo: "duplicado" });
    assert.equal((await h("pq_get", "adm", { id: 5 })).ok, true);
    await h("solicitud_resolver", "adm", { id: s3.id, aprobar: true });
    assert.ok(db.tables.get("paquetes")![0].borrado_at);
  });

  it("gift card: la misma regla (solicitud con antes, aprobación aplica con antes → después)", async () => {
    const { db, h } = semilla();
    const g = await h("gcb_get", "rec", { id: 400 });
    assert.equal(g.puedeEditar, false); assert.equal(g.puedePedir, true);
    const s1 = await h("solicitud_crear", "rec", { tabla: "gift_beta", fila: "400", tipo: "cambio", motivo: "corregir para", propuestos: { para: "Carolina Espinosa" } });
    assert.equal(s1.ok, true);
    assert.equal(db.tables.get("solicitudes_cambio")![0].etiqueta, "Gift card 26-171 · Camila");
    await h("solicitud_resolver", "adm", { id: s1.id, aprobar: true });
    const v = (await h("gcb_get", "adm", { id: 400 })).item as Row;
    assert.equal(v.para, "Carolina Espinosa");
    assert.match(String(((v.historial as Row[]).at(-1) as Row).detalle), /para: — → Carolina Espinosa \(solicitud de Alejandra aprobada\)/);
    assert.equal((await h("solicitud_crear", "adm", { tabla: "gift_beta", fila: "400", tipo: "cambio", motivo: "x", propuestos: {} })).error, "Un admin guarda el cambio directo");
  });

  it("pantallas: Paquetes y Gift cards ya no tienen botón Editar; usan MCEdit", () => {
    for (const f of ["mc-paquetes.js", "mc-giftcards.js"]) {
      const src = readFileSync(join(root, f), "utf8");
      assert.doesNotMatch(src, /✏️ Editar/, f);
      assert.match(src, /MCEdit\.wire/, f);
      assert.match(src, /solicitud_crear/, f);
    }
    const ed = readFileSync(join(root, "mc-edit.js"), "utf8");
    assert.match(ed, /Enviar solicitud/); assert.match(ed, /Solicitar eliminación/); assert.match(ed, /Descartar/);
    const beta = readFileSync(join(root, "beta.html"), "utf8");
    assert.match(beta, /mc-edit\.js\?v=20261119tk142/);    assert.match(readFileSync(join(root, "sw.js"), "utf8"), /"\/mc-edit\.js"/);
  });

  it("Multas, Transferencias y Promociones: sin botón Editar; Guardar solo con cambios", () => {
    const mu = readFileSync(join(root, "mc-multas.js"), "utf8");
    assert.doesNotMatch(mu, />✏️<\/button>/); assert.match(mu, /data-solo-cambio hidden/); assert.match(mu, /mcmu-toca/);
    const tr = readFileSync(join(root, "mc-transferencias.js"), "utf8");
    assert.doesNotMatch(tr, /id="mctr-editar"/); assert.match(tr, /data-tr-tocar/); assert.match(tr, /id="mctr-descartar" hidden/);
    const pm = readFileSync(join(root, "mc-promociones.js"), "utf8");
    assert.doesNotMatch(pm, /"Importar y editar" : "Editar"/); assert.match(pm, /mcpm-toca/); assert.match(pm, /id="mcpm-desc"/);
    assert.match(readFileSync(join(root, "beta.html"), "utf8"), /\.btn\[hidden\] \{ display: none !important; \}/);
  });

  it("Paquete: botón «Descargar ficha» arma el PDF Sunsu con clienta, producto, sesiones, quedan y vendió", () => {
    const src = readFileSync(join(root, "mc-paquetes.js"), "utf8");
    assert.match(src, /📄 Descargar ficha/); assert.match(src, /MCDocPdf\.bajar\(fichaSpec\(v\)\)/);
    for (const k of ["Clienta", "Producto", "Vendió", "Quedan", "Cosmetóloga", "Ticket"]) assert.match(src, new RegExp('"' + k + '"'));
  });

  it("Paquete anulado (su ticket se canceló): se ve como «anulado», no se marcan sesiones y el buscador lo avisa", async () => {
    const { db, h } = semilla();
    db.tables.get("paquetes")![0].orig = { ticket: "TK-SO-9", anulado: true, cancelado_por_ticket: "TK-SO-9", cancelado_motivo: "dup" };
    const g = await h("pq_get", "adm", { id: 5 });
    assert.equal((g.item as Row).estado, "anulado");
    assert.match(String((await h("pq_marcar", "adm", { id: 5, slot: 2 })).error), /anulado/);
    const L = await h("pq_lista", "adm", {});
    assert.equal(((L.cuenta as Row).anulados), 1); assert.equal(((L.cuenta as Row).activos), 0);
    const b = await h("buscarPaquetes", "adm", { q: "1700000001" });
    const p0 = (b.resultados as Row[])[0];
    assert.equal(p0.anulado, true); assert.equal(p0.ticketOrigen, "TK-SO-9"); assert.equal(p0.id, 5);
  });

  it("Ticket con canje de paquete: sugiere el paquete pero exige confirmarlo y avisa duplicados lado a lado", () => {
    const src = readFileSync(join(root, "beta-screens.js"), "utf8");
    assert.match(src, /✓ Confirmo: canjear de/);
    assert.match(src, /T\.cobro==='paquete'&&!T\.canjeOtro&&!\(T\.paqPick&&T\.paqConfirmado\)/);
    assert.match(src, /parecen duplicados/);
    assert.match(src, /mismo ticket de origen/); assert.match(src, /mismo producto y fecha de compra/);
    assert.match(src, /No está en la lista — lo marco después en Paquetes/);
    assert.match(src, /!p\.anulado && !p\.completo/);
  });

  it("Ver como → Modo prueba: la solicitud queda PRUEBA solo para esa admin y aprobarla no cambia nada", async () => {
    const { db, h } = semilla();
    const sinPrueba = await h("solicitud_crear", "adm", { preview_uid: "u-ana", preview: true, tabla: "paquete_beta", fila: "5", tipo: "cambio", motivo: "x", propuestos: { nombres: "Z" } });
    assert.ok(sinPrueba.error, "sin Modo prueba la vista sigue de solo lectura");
    const r = await h("solicitud_crear", "adm", { preview_uid: "u-ana", preview: true, prueba_vista: true, tabla: "paquete_beta", fila: "5", tipo: "cambio", motivo: "probando", propuestos: { nombres: "Zoila" } });
    assert.equal(r.ok, true, String(r.error)); assert.equal(r.prueba, true);
    const sol = db.tables.get("solicitudes_cambio")!.at(-1)!;
    assert.equal(sol.prueba, true); assert.equal(sol.prueba_para, "admin"); assert.equal(sol.solicitante, "Ana Pérez");
    const mia = await h("getSolicitudes", "adm", {});
    assert.equal((mia.items as Row[]).length, 1); assert.equal(mia.pendientesPrueba, 1);
    assert.equal(((await h("getSolicitudes", "cos", {})).items as Row[]).length, 0, "la cosmetóloga real no la ve");
    const ap = await h("solicitud_resolver", "adm", { id: sol.id, aprobar: true });
    assert.equal(ap.ok, true); assert.equal(ap.prueba, true);
    assert.equal(db.tables.get("paquetes")![0].nombres, "Elena", "el dato real no cambia");
    assert.equal((db.tables.get("beta_paquete_ajustes") || []).length, 0);
    const del = await h("solicitud_crear", "adm", { preview_uid: "u-ana", preview: true, prueba_vista: true, tabla: "paquete_beta", fila: "5", tipo: "eliminacion", motivo: "probando" });
    await h("solicitud_resolver", "adm", { id: del.id, aprobar: true });
    assert.equal(db.tables.get("paquetes")![0].borrado_at ?? null, null, "eliminar en prueba no borra");
  });

  it("Productos: el personal pide el cambio o la eliminación; la admin aprueba y queda quién", async () => {
    const { db, h } = semilla();
    db.tables.set("erp_productos", [{ id: "p1", sku: "ML-001", nombre: "Crema", clase: "producto", uso: "venta", activo: true, marca: "Sunsu" }]);
    db.tables.set("catalogo", [{ sku: "SUNSU-ML-001", producto_servicio: "Crema", tipo: "PRODUCTO", total_con_iva: 20, activo: true }]);
    assert.match(String((await h("mcprod_save", "rec", { id: "p1", cambios: { marca: "X" } })).error), /solicitud/);
    const g = await h("mcprod_get", "rec", { id: "p1" });
    assert.equal(g.puedePedir, true, String(g.error));
    const s1 = await h("solicitud_crear", "rec", { tabla: "producto_beta", fila: "p1", tipo: "cambio", motivo: "marca mal", propuestos: { marca: "Sunsu Pro" } });
    assert.equal(s1.ok, true, String(s1.error));
    const sol = db.tables.get("solicitudes_cambio")!.at(-1)!;
    assert.match(String(sol.etiqueta), /Producto ML-001/);
    await h("solicitud_resolver", "adm", { id: s1.id, aprobar: true });
    const p1 = db.tables.get("erp_productos")![0];
    assert.equal(p1.marca, "Sunsu Pro");
    assert.match(String(p1.beta_editado_por), /solicitud de Alejandra aprobada/);
    const s2 = await h("solicitud_crear", "rec", { tabla: "producto_beta", fila: "p1", tipo: "eliminacion", motivo: "duplicado" });
    await h("solicitud_resolver", "adm", { id: s2.id, aprobar: false });
    assert.ok(!db.tables.get("erp_productos")![0].beta_eliminado_at, "rechazar no cambia nada");
    const s3 = await h("solicitud_crear", "rec", { tabla: "producto_beta", fila: "p1", tipo: "eliminacion", motivo: "duplicado" });
    await h("solicitud_resolver", "adm", { id: s3.id, aprobar: true });
    assert.ok(db.tables.get("erp_productos")![0].beta_eliminado_at);
  });

  it("Tickets: «Solicitar eliminación» del personal; al aprobar se cancela el ticket", async () => {
    const { db, h } = semilla();
    db.tables.set("tickets", [{ id: 1, sheet_row: 10, so_num: "TK-SO-1", beta_num: "TK-20261117-1", origin: "beta", timestamp: "2026-11-17T15:00:00Z", atendido_por: "Alejandra", nombre: "María", apellido: "Banda", id_3: "1700000001", estimado: 10, orig: { beta: true } }]);
    for (const t of ["erp_movimientos", "erp_productos", "erp_stock", "erp_bodegas", "beta_ticket_cancelados", "beta_tickets", "beta_ticket_lineas", "catalogo", "promos", "clientas_registro"]) if (!db.tables.has(t)) db.tables.set(t, []);
    const s1 = await h("solicitud_crear", "rec", { tabla: "ticket_detalle", fila: "TK-SO-1", tipo: "eliminacion", motivo: "ticket duplicado" });
    assert.equal(s1.ok, true, String(s1.error));
    const ap = await h("solicitud_resolver", "adm", { id: s1.id, aprobar: true });
    assert.equal(ap.ok, true, String(ap.error));
    const o = db.tables.get("tickets")![0].orig as Row;
    assert.equal(o.anulado === true || o.cancelado === true, true);
    assert.match(String(o.cancelado_motivo || o.motivo_cancelacion || JSON.stringify(o)), /pedido por Alejandra/);
  });

  it("UI: Modo prueba en la barra de Ver como; productos y tickets con solicitud", () => {
    const b = readFileSync(join(root, "beta.html"), "utf8");
    assert.match(b, /id="vista-prueba"/); assert.match(b, /prueba_vista: true/);
    const pr = readFileSync(join(root, "mc-productos.js"), "utf8");
    assert.match(pr, /📨 Enviar solicitud/); assert.match(pr, /🗑️ Solicitar eliminación/); assert.match(pr, /tabla: "producto_beta"/);
    assert.match(readFileSync(join(root, "mc-tickets.js"), "utf8"), /id="mctk-solcancel"/);
  });
});
