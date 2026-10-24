// Edición en línea y solicitudes de cambio. El admin guarda por el mismo camino
// auditado; el resto pide un cambio y un admin lo aprueba o lo rechaza.

import { extend, crearTicket } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion, nextSheet } from "./lib.ts";
import { acceso, esAdmin, esPropio, matrizDe, puedeVerContacto } from "./permisos.ts";
import { ecuadorParts, IVA, n, normCedula, normNombre, round2, s, skuCode, ymdUtc, type Row } from "./domain.ts";
import { pushAPersonas } from "./horarios_api.ts";
import { claveCliente, claveRegistro } from "./ventas.ts";

const CAMPOS: Record<string, string> = {
  nombre: "nombre",
  apellido: "apellido",
  cedula: "id_3",
  facial: "facial_hecho",
  pack3: "compra_pack_3",
  pack6: "compra_pack_6",
  extras: "servicios_adicionales",
  notas: "notas_generales",
  recomendaciones: "recomendaciones",
  estimado: "estimado",
  cosmetologa: "atendido_por",
};

function filaDe(row: Row): string {
  return s(row.sheet_row) || s(row.beta_num) || s(row.so_num) || s(row.id);
}

async function anotar(ctx: Ctx, ses: Ses, tabla: string, fila: string, accion: "INSERT" | "UPDATE" | "DELETE", antes: Row | null, despues: Row | null) {
  const actor = actorOf(ses);
  try {
    await ctx.db.write(actor, "audit_log", "insert", {}, {
      actor, actor_fuente: "app.user", tabla, fila_id: fila, accion, antes, despues,
    });
  } catch { /* 0006 ya anota la fila si el trigger está enganchado */ }
  await logAccion(ctx.db, actor, accion + " " + tabla, fila);
}

function bloqueoPrueba(ses: Ses, row: Row): string | null {
  if (ses.prueba && s(row.origin) !== "test") return "Modo prueba no cambia datos reales";
  return null;
}

async function ticketDe(ctx: Ctx, fila: string): Promise<Row | null> {
  const rows = await ctx.db.all("tickets");
  return rows.find((r) => s(r.sheet_row) === fila || s(r.beta_num) === fila || s(r.so_num) === fila || s(r.id) === fila) || null;
}

function patchDe(campos: Row): Row {
  const patch: Row = {};
  for (const [k, col] of Object.entries(CAMPOS)) {
    if (campos[k] == null) continue;
    patch[col] = k === "estimado" ? n(campos[k]) : s(campos[k]);
  }
  return patch;
}

function vistaDe(row: Row): Row {
  const out: Row = {};
  for (const [k, col] of Object.entries(CAMPOS)) out[k] = row[col] ?? "";
  return out;
}

const CAMPOS_CLIENTE: Record<string, string> = {
  nombre: "nombre",
  apellido: "apellido",
  cedula: "cedula",
  telefono: "telefono",
  sector: "sector_donde_vive",
  tipoPiel: "tipo_de_piel",
  estado: "estado_actual",
  alergias: "alergias",
  medicacion: "medicacion",
  condiciones: "condiciones_medicas_o_dermatologicas_que_debamos_saber",
  nacimiento: "fecha_de_nacimiento",
  autorizaFotos: "autoriza_fotos",
};

function patchCliente(campos: Row, ses: Ses): Row {
  const patch: Row = {};
  for (const [k, col] of Object.entries(CAMPOS_CLIENTE)) {
    if (campos[k] == null) continue;
    if (k === "telefono" && !puedeVerContacto(ses.rol)) continue;
    patch[col] = s(campos[k]);
  }
  return patch;
}

function vistaCliente(row: Row): Row {
  const out: Row = {};
  for (const [k, col] of Object.entries(CAMPOS_CLIENTE)) out[k] = k === "nacimiento" ? ymdUtc(row[col]) : (row[col] ?? "");
  return out;
}

async function fichas(ctx: Ctx): Promise<Row[]> {
  try { return await ctx.db.all("clientas_registro"); } catch { return []; }
}

function filaCliente(row: Row): string {
  return s(row.sheet_row) || s(row.id);
}

async function clientaViva(ctx: Ctx, fila: string): Promise<Row | null> {
  const rows = await fichas(ctx);
  if (fila.startsWith("k:")) {
    const key = fila.slice(2);
    return rows.find((r) => !r.borrado_at && claveRegistro(r) === key) || null;
  }
  return rows.find((r) => !r.borrado_at && (s(r.sheet_row) === fila || s(r.id) === fila)) || null;
}

async function clientaPorCedula(ctx: Ctx, cedula: string): Promise<Row | null> {
  const ced = normCedula(cedula);
  if (!ced) return null;
  return (await fichas(ctx)).find((r) => !r.borrado_at && normCedula(r.cedula) === ced) || null;
}

export async function guardarClienteCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  const patch = patchCliente(campos, ses);
  let row: Row | null = null;
  if (!fila || fila === "nuevo") row = await clientaPorCedula(ctx, s(patch.cedula));
  else if (fila.startsWith("k:")) {
    row = await clientaViva(ctx, fila);
    const key = fila.slice(2);
    if (!row && key.startsWith("c:") && !s(patch.cedula)) patch.cedula = key.slice(2);
    if (!row && key.startsWith("n:") && !s(patch.nombre)) patch.nombre = key.slice(2);
  } else {
    row = await clientaViva(ctx, fila);
    if (!row) return { error: "Clienta no encontrada" };
  }
  if (!row) {
    if (!s(patch.nombre) && !normCedula(patch.cedula)) return { error: "Escribe el nombre o la cédula" };
    const sheet_row = await nextSheet(ctx.db, "clientas_registro");
    const ec = ecuadorParts(ctx.now);
    const rec: Row = {
      sheet_row, timestamp: ec.isoWall, ...patch,
      orig: { nombre: s(patch.nombre), cedula: s(patch.cedula) },
    };
    let saved: Row | null = null;
    try { saved = await ctx.db.write(actorOf(ses), "clientas_registro", "insert", {}, rec); }
    catch (e) { return { error: e instanceof Error ? e.message : "No se pudo guardar" }; }
    if (!saved) return { error: "No se pudo guardar la clienta" };
    await anotar(ctx, ses, "clientas_registro", filaCliente(saved), "INSERT", null, vistaCliente(saved));
    return { ok: true, fila: filaCliente(saved) };
  }
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  if (!Object.keys(patch).length) return { error: "Nada que guardar" };
  const antes = vistaCliente(row);
  let saved: Row | null = null;
  try {
    saved = await ctx.db.write(actorOf(ses), "clientas_registro", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
  if (!saved) return { error: "No se pudo guardar la clienta" };
  await anotar(ctx, ses, "clientas_registro", filaCliente(row), "UPDATE", antes, vistaCliente(saved));
  return { ok: true, fila: filaCliente(row) };
}

export async function borrarClienteSuave(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const row = await clientaViva(ctx, fila);
  if (!row && fila.startsWith("k:")) {
    const key = fila.slice(2);
    const sheet_row = await nextSheet(ctx.db, "clientas_registro");
    const ec = ecuadorParts(ctx.now);
    const rec: Row = {
      sheet_row, timestamp: ec.isoWall,
      cedula: key.startsWith("c:") ? key.slice(2) : "",
      nombre: key.startsWith("n:") ? key.slice(2) : "",
      borrado_at: ctx.now.toISOString(), borrado_por: actorOf(ses),
      orig: { oculto: key },
    };
    try { await ctx.db.write(actorOf(ses), "clientas_registro", "insert", {}, rec); }
    catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/column|update vacio|insert vacio/i.test(msg)) return { error: "Aplica 0023_clientes_inline.sql para el borrado con historial" };
      return { error: msg || "No se pudo eliminar" };
    }
    await anotar(ctx, ses, "clientas_registro", String(sheet_row), "INSERT", null, { borrado: true });
    return { ok: true };
  }
  if (!row) return { error: "Clienta no encontrada" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const antes = vistaCliente(row);
  const patch = { borrado_at: ctx.now.toISOString(), borrado_por: actorOf(ses) };
  let saved: Row | null = null;
  try {
    saved = await ctx.db.write(actorOf(ses), "clientas_registro", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/update vacio|column/i.test(msg)) return { error: "Aplica 0023_clientes_inline.sql para el borrado con historial" };
    return { error: msg || "No se pudo eliminar" };
  }
  if (!saved || !saved.borrado_at) return { error: "Aplica 0023_clientes_inline.sql para el borrado con historial" };
  await anotar(ctx, ses, "clientas_registro", filaCliente(row), "UPDATE", antes, { ...antes, borrado: true });
  return { ok: true };
}

async function veCliente(ctx: Ctx, ses: Ses, row: Row): Promise<boolean> {
  const nivel = acceso(ses.rol, "clientes", await matrizDe(ctx.db));
  if (nivel === "no") return false;
  if (nivel === "todos" || esAdmin(ses.rol)) return true;
  const key = claveRegistro(row);
  const tickets = await ctx.db.all("tickets");
  return tickets.some((t) => !t.borrado_at && claveCliente(t) === key && esPropio(s(t.atendido_por), ses));
}

async function veModulo(ctx: Ctx, ses: Ses, modulo: string): Promise<boolean> {
  return acceso(ses.rol, modulo, await matrizDe(ctx.db)) !== "no";
}

async function catalogoDe(ctx: Ctx, fila: string): Promise<Row | null> {
  const rows = await ctx.db.all("catalogo");
  const code = skuCode(fila);
  return rows.find((r) => (code && skuCode(r.sku) === code) || s(r.sheet_row) === fila || s(r.id) === fila) || null;
}

function vistaCatalogo(row: Row): Row {
  return {
    sku: s(row.sku), nombre: s(row.producto_servicio), tipo: s(row.tipo),
    subtotal: n(row.subtotal), compra: n(row.precio_compra), com: n(row.comi_producto_30),
    activo: row.activo !== false,
  };
}

export async function guardarCatalogoCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  if (!fila || fila === "nuevo") {
    const code = skuCode(s(campos.sku));
    if (!/^[A-Z]{2,3}-\d{3}$/.test(code)) return { error: "SKU con formato FAM-###" };
    if (!s(campos.nombre)) return { error: "El nombre es obligatorio" };
    const rows = await ctx.db.all("catalogo");
    if (rows.some((r) => skuCode(r.sku) === code && r.activo !== false)) return { error: "Ese SKU ya existe" };
    const sub = n(campos.subtotal);
    const compra = n(campos.compra);
    const sheet_row = await nextSheet(ctx.db, "catalogo");
    const rec: Row = {
      sheet_row, sku: "SUNSU-" + code, producto_servicio: s(campos.nombre), tipo: s(campos.tipo) || "PRODUCTO",
      subtotal: sub, iva: round2(sub * 0.15), total_con_iva: round2(sub * IVA), precio_compra: compra,
      utilidad: round2(sub - compra), comi_producto_30: round2(Math.max(0, sub - compra) * 0.3), activo: true,
      orig: { sku: code },
    };
    const saved = await ctx.db.write(actorOf(ses), "catalogo", "insert", {}, rec);
    await ctx.db.write(actorOf(ses), "inventario_base", "insert", {}, { sku: "SUNSU-" + code, stock_inicial: 0, minimo: n(campos.minimo) });
    if (saved) await anotar(ctx, ses, "catalogo", "SUNSU-" + code, "INSERT", null, vistaCatalogo(saved));
    return { ok: true, fila: "SUNSU-" + code };
  }
  const row = await catalogoDe(ctx, fila);
  if (!row) return { error: "Producto no encontrado" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const sub = campos.subtotal == null || campos.subtotal === "" ? n(row.subtotal) : n(campos.subtotal);
  const compra = campos.compra == null || campos.compra === "" ? n(row.precio_compra) : n(campos.compra);
  const patch: Row = {
    producto_servicio: campos.nombre == null ? s(row.producto_servicio) : s(campos.nombre),
    tipo: campos.tipo == null || campos.tipo === "" ? s(row.tipo) : s(campos.tipo),
    subtotal: sub, iva: round2(sub * 0.15), total_con_iva: round2(sub * IVA), precio_compra: compra,
  };
  if (campos.com != null && campos.com !== "") patch.comi_producto_30 = n(campos.com);
  const antes = vistaCatalogo(row);
  const saved = await ctx.db.write(actorOf(ses), "catalogo", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  if (!saved) return { error: "No se pudo guardar el producto" };
  await anotar(ctx, ses, "catalogo", s(row.sku), "UPDATE", antes, vistaCatalogo(saved));
  return { ok: true, fila: s(row.sku) };
}

export async function borrarCatalogoSuave(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const row = await catalogoDe(ctx, fila);
  if (!row) return { error: "Producto no encontrado" };
  if (row.activo === false) return { ok: true };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const antes = vistaCatalogo(row);
  const saved = await ctx.db.write(actorOf(ses), "catalogo", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, { activo: false });
  if (!saved) return { error: "No se pudo eliminar" };
  await anotar(ctx, ses, "catalogo", s(row.sku), "UPDATE", antes, { ...antes, activo: false });
  return { ok: true };
}

async function baseDe(ctx: Ctx, fila: string): Promise<Row | null> {
  const code = skuCode(fila);
  const rows = await ctx.db.all("inventario_base").catch(() => [] as Row[]);
  return rows.find((r) => skuCode(r.sku) === code) || null;
}

export async function guardarInventarioCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  if (campos.nombre != null) {
    const hecho = await guardarCatalogoCampos(ctx, ses, fila, { nombre: campos.nombre });
    if (hecho.error) return hecho;
  }
  if (campos.minimo == null && campos.compra == null) {
    return campos.nombre != null ? { ok: true, fila } : { error: "Nada que guardar" };
  }
  const code = skuCode(fila);
  if (!code) return { error: "Producto no encontrado" };
  const base = await baseDe(ctx, fila);
  const patch: Row = {};
  if (campos.minimo != null) patch.minimo = n(campos.minimo);
  if (campos.compra != null) patch.compra = n(campos.compra);
  if (!base) {
    const rec = { sku: fila.startsWith("SUNSU-") ? fila : "SUNSU-" + code, stock_inicial: 0, ...patch };
    const saved = await ctx.db.write(actorOf(ses), "inventario_base", "insert", {}, rec);
    await anotar(ctx, ses, "inventario_base", s(rec.sku), "INSERT", null, patch);
    return saved ? { ok: true, fila: s(rec.sku) } : { error: "No se pudo guardar" };
  }
  const bloqueo = bloqueoPrueba(ses, base);
  if (bloqueo) return { error: bloqueo };
  const antes = { minimo: n(base.minimo), compra: n(base.compra) };
  const match = base.sku != null ? { sku: base.sku } : { id: base.id };
  const saved = await ctx.db.write(actorOf(ses), "inventario_base", "update", match, patch);
  if (!saved) return { error: "No se pudo guardar el inventario" };
  await anotar(ctx, ses, "inventario_base", s(base.sku), "UPDATE", antes, { minimo: n(saved.minimo), compra: n(saved.compra) });
  return { ok: true, fila: s(base.sku) };
}

async function proveedorDe(ctx: Ctx, fila: string): Promise<Row | null> {
  const rows = await ctx.db.all("proveedores");
  return rows.find((r) => s(r.sheet_row) === fila || s(r.id) === fila) || null;
}

function vistaProveedor(row: Row): Row {
  return {
    nombre: s(row.nombre), ruc: s(row.ruc), telefono: s(row.telefono), direccion: s(row.direccion),
    email: s(row.email), familia: s(row.familia), notas: s(row.notas),
  };
}

export async function guardarProveedorCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  if (!fila || fila === "nuevo") {
    if (!s(campos.nombre)) return { error: "El nombre es obligatorio" };
    if (!s(campos.familia)) return { error: "La familia es obligatoria" };
    const sheet_row = await nextSheet(ctx.db, "proveedores");
    const rec: Row = {
      sheet_row, nombre: s(campos.nombre), ruc: s(campos.ruc), telefono: s(campos.telefono),
      direccion: s(campos.direccion), email: s(campos.email), familia: s(campos.familia).toUpperCase(),
      notas: s(campos.notas), orig: { nombre: s(campos.nombre) },
    };
    const saved = await ctx.db.write(actorOf(ses), "proveedores", "insert", {}, rec);
    if (saved) await anotar(ctx, ses, "proveedores", String(sheet_row), "INSERT", null, vistaProveedor(saved));
    return saved ? { ok: true, fila: String(sheet_row) } : { error: "No se pudo guardar" };
  }
  const row = await proveedorDe(ctx, fila);
  if (!row) return { error: "Proveedor no encontrado" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const patch: Row = {};
  if (campos.nombre != null) {
    if (!s(campos.nombre)) return { error: "El nombre es obligatorio" };
    patch.nombre = s(campos.nombre);
  }
  if (campos.familia != null) {
    if (!s(campos.familia)) return { error: "La familia es obligatoria" };
    patch.familia = s(campos.familia).toUpperCase();
  }
  for (const k of ["ruc", "telefono", "direccion", "email", "notas"]) {
    if (campos[k] != null) patch[k] = s(campos[k]);
  }
  if (!Object.keys(patch).length) return { error: "Nada que guardar" };
  const antes = vistaProveedor(row);
  const saved = await ctx.db.write(actorOf(ses), "proveedores", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  if (!saved) return { error: "No se pudo guardar el proveedor" };
  await anotar(ctx, ses, "proveedores", s(row.sheet_row), "UPDATE", antes, vistaProveedor(saved));
  return { ok: true, fila: s(row.sheet_row) };
}

export async function borrarProveedor(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const row = await proveedorDe(ctx, fila);
  if (!row) return { error: "Proveedor no encontrado" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const antes = vistaProveedor(row);
  const match = row.id != null ? { id: row.id } : { sheet_row: row.sheet_row };
  const saved = await ctx.db.write(actorOf(ses), "proveedores", "delete", match, null);
  if (!saved) return { error: "No se pudo eliminar" };
  await anotar(ctx, ses, "proveedores", s(row.sheet_row), "DELETE", antes, null);
  return { ok: true };
}

async function entradaDe(ctx: Ctx, fila: string): Promise<Row | null> {
  const rows = await ctx.db.all("inventario_entradas");
  return rows.find((r) => s(r.sheet_row) === fila || s(r.id) === fila) || null;
}

function vistaEntrada(row: Row): Row {
  return {
    sku: s(row.sku), nombre: s(row.producto), pedida: n(row.cant_pedida),
    proveedor: s(row.proveedor), orden: s(row.orden),
  };
}

export async function guardarCompraCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  if (!fila || fila === "nuevo") {
    if (!s(campos.sku) || !s(campos.nombre)) return { error: "SKU y nombre son obligatorios" };
    const sheet_row = await nextSheet(ctx.db, "inventario_entradas");
    const rec: Row = {
      sheet_row, sku: s(campos.sku), producto: s(campos.nombre), proveedor: s(campos.proveedor),
      cant_pedida: n(campos.pedida), orden: s(campos.orden), orig: { sku: s(campos.sku) },
    };
    const saved = await ctx.db.write(actorOf(ses), "inventario_entradas", "insert", {}, rec);
    if (saved) await anotar(ctx, ses, "inventario_entradas", String(sheet_row), "INSERT", null, vistaEntrada(saved));
    return saved ? { ok: true, fila: String(sheet_row) } : { error: "No se pudo guardar" };
  }
  const row = await entradaDe(ctx, fila);
  if (!row) return { error: "Línea no encontrada" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const patch: Row = {};
  if (campos.nombre != null) patch.producto = s(campos.nombre);
  if (campos.pedida != null) patch.cant_pedida = n(campos.pedida);
  if (campos.proveedor != null) patch.proveedor = s(campos.proveedor);
  if (campos.sku != null && s(campos.sku)) patch.sku = s(campos.sku);
  if (campos.orden != null) patch.orden = s(campos.orden);
  if (!Object.keys(patch).length) return { error: "Nada que guardar" };
  const antes = vistaEntrada(row);
  const saved = await ctx.db.write(actorOf(ses), "inventario_entradas", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  if (!saved) return { error: "No se pudo guardar la línea" };
  await anotar(ctx, ses, "inventario_entradas", s(row.sheet_row), "UPDATE", antes, vistaEntrada(saved));
  return { ok: true, fila: s(row.sheet_row) };
}

export async function borrarCompra(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const row = await entradaDe(ctx, fila);
  if (!row) return { error: "Línea no encontrada" };
  if (s(row.cant_recibida_llenar_aqui) !== "") return { error: "Esa línea ya está marcada" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const antes = vistaEntrada(row);
  const match = row.id != null ? { id: row.id } : { sheet_row: row.sheet_row };
  const saved = await ctx.db.write(actorOf(ses), "inventario_entradas", "delete", match, null);
  if (!saved) return { error: "No se pudo eliminar" };
  await anotar(ctx, ses, "inventario_entradas", s(row.sheet_row), "DELETE", antes, null);
  return { ok: true };
}

function marcadoBorrado(row: Row): boolean {
  let orig = row.orig;
  if (typeof orig === "string") {
    try { orig = JSON.parse(orig) as Row; } catch { return false; }
  }
  return !!(orig && typeof orig === "object" && (orig as Row).borrado === true);
}

function origConBorrado(row: Row): Row {
  const base = row.orig && typeof row.orig === "object" ? { ...(row.orig as Row) } : {};
  base.borrado = true;
  return base;
}

async function giftDe(ctx: Ctx, fila: string): Promise<Row | null> {
  const rows = await ctx.db.all("gift_cards");
  return rows.find((r) => !marcadoBorrado(r) && (s(r.sheet_row) === fila || s(r.id) === fila || s(r.codigo_gc) === fila)) || null;
}

function vistaGift(row: Row): Row {
  return {
    codigo: s(row.codigo_gc), nombre: s(row.nombre_comprador), apellido: s(row.apellido_comprador),
    cedula: s(row.cedula_comprador), valor: s(row.valor), sku: s(row.sku), notas: s(row.notas),
  };
}

export async function guardarGiftCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  if (!fila || fila === "nuevo") {
    if (!s(campos.codigo)) return { error: "El código es obligatorio" };
    const rows = await ctx.db.all("gift_cards");
    if (rows.some((r) => !marcadoBorrado(r) && s(r.codigo_gc).toLowerCase() === s(campos.codigo).toLowerCase())) return { error: "Ese código ya existe" };
    const ec = ecuadorParts(ctx.now);
    const sheet_row = await nextSheet(ctx.db, "gift_cards");
    const vendida = !!(s(campos.nombre) || s(campos.cedula) || s(campos.valor));
    const rec: Row = {
      sheet_row, codigo_gc: s(campos.codigo), nombre_comprador: s(campos.nombre), apellido_comprador: s(campos.apellido),
      cedula_comprador: s(campos.cedula), valor: s(campos.valor), sku: s(campos.sku), notas: s(campos.notas),
      dia: vendida ? ec.d : null, mes: vendida ? ec.m : null, ano: vendida ? ec.y : null,
      orig: { codigo: s(campos.codigo) },
    };
    const saved = await ctx.db.write(actorOf(ses), "gift_cards", "insert", {}, rec);
    if (saved) await anotar(ctx, ses, "gift_cards", String(sheet_row), "INSERT", null, vistaGift(saved));
    return saved ? { ok: true, fila: String(sheet_row) } : { error: "No se pudo guardar" };
  }
  const row = await giftDe(ctx, fila);
  if (!row) return { error: "Gift card no encontrada" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const patch: Row = {};
  if (campos.codigo != null) {
    if (!s(campos.codigo)) return { error: "El código es obligatorio" };
    patch.codigo_gc = s(campos.codigo);
  }
  if (campos.nombre != null) patch.nombre_comprador = s(campos.nombre);
  if (campos.apellido != null) patch.apellido_comprador = s(campos.apellido);
  if (campos.cedula != null) patch.cedula_comprador = s(campos.cedula);
  if (campos.valor != null) patch.valor = s(campos.valor);
  if (campos.sku != null) patch.sku = s(campos.sku);
  if (campos.notas != null) patch.notas = s(campos.notas);
  if (!Object.keys(patch).length) return { error: "Nada que guardar" };
  const antes = vistaGift(row);
  const saved = await ctx.db.write(actorOf(ses), "gift_cards", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  if (!saved) return { error: "No se pudo guardar la gift card" };
  await anotar(ctx, ses, "gift_cards", s(row.sheet_row), "UPDATE", antes, vistaGift(saved));
  return { ok: true, fila: s(row.sheet_row) };
}

export async function borrarGiftSuave(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const row = await giftDe(ctx, fila);
  if (!row) return { error: "Gift card no encontrada" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const antes = vistaGift(row);
  const saved = await ctx.db.write(actorOf(ses), "gift_cards", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, { orig: origConBorrado(row) });
  if (!saved) return { error: "No se pudo eliminar" };
  await anotar(ctx, ses, "gift_cards", s(row.sheet_row), "UPDATE", antes, { ...antes, borrado: true });
  return { ok: true };
}

async function paqueteDe(ctx: Ctx, fila: string): Promise<Row | null> {
  const rows = await ctx.db.all("paquetes");
  return rows.find((r) => !marcadoBorrado(r) && (s(r.sheet_row) === fila || s(r.id) === fila)) || null;
}

function vistaPaquete(row: Row): Row {
  return {
    nombre: s(row.nombres), apellido: s(row.apellidos), cedula: s(row.cedula),
    sku: s(row.sku), paquete: s(row.paquete), vendidoPor: s(row.vendido_por), notas: s(row.notas),
  };
}

export async function guardarPaqueteCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  if (!fila || fila === "nuevo") {
    if (!s(campos.nombre)) return { error: "El nombre es obligatorio" };
    if (!s(campos.sku)) return { error: "El SKU es obligatorio" };
    const ec = ecuadorParts(ctx.now);
    const sheet_row = await nextSheet(ctx.db, "paquetes");
    const rec: Row = {
      sheet_row, dia: ec.d, mes: ec.m, ano: ec.y, nombres: s(campos.nombre), apellidos: s(campos.apellido),
      cedula: s(campos.cedula), sku: s(campos.sku), paquete: s(campos.paquete), vendido_por: s(campos.vendidoPor),
      notas: s(campos.notas), orig: { sku: s(campos.sku) },
    };
    const saved = await ctx.db.write(actorOf(ses), "paquetes", "insert", {}, rec);
    if (saved) await anotar(ctx, ses, "paquetes", String(sheet_row), "INSERT", null, vistaPaquete(saved));
    return saved ? { ok: true, fila: String(sheet_row) } : { error: "No se pudo guardar" };
  }
  const row = await paqueteDe(ctx, fila);
  if (!row) return { error: "Paquete no encontrado" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const patch: Row = {};
  if (campos.nombre != null) patch.nombres = s(campos.nombre);
  if (campos.apellido != null) patch.apellidos = s(campos.apellido);
  if (campos.cedula != null) patch.cedula = s(campos.cedula);
  if (campos.sku != null) patch.sku = s(campos.sku);
  if (campos.paquete != null) patch.paquete = s(campos.paquete);
  if (campos.vendidoPor != null) patch.vendido_por = s(campos.vendidoPor);
  if (campos.notas != null) patch.notas = s(campos.notas);
  if (!Object.keys(patch).length) return { error: "Nada que guardar" };
  const antes = vistaPaquete(row);
  const saved = await ctx.db.write(actorOf(ses), "paquetes", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  if (!saved) return { error: "No se pudo guardar el paquete" };
  await anotar(ctx, ses, "paquetes", s(row.sheet_row), "UPDATE", antes, vistaPaquete(saved));
  return { ok: true, fila: s(row.sheet_row) };
}

export async function borrarPaqueteSuave(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const row = await paqueteDe(ctx, fila);
  if (!row) return { error: "Paquete no encontrado" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const antes = vistaPaquete(row);
  const saved = await ctx.db.write(actorOf(ses), "paquetes", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, { orig: origConBorrado(row) });
  if (!saved) return { error: "No se pudo eliminar" };
  await anotar(ctx, ses, "paquetes", s(row.sheet_row), "UPDATE", antes, { ...antes, borrado: true });
  return { ok: true };
}

export async function guardarTicketCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  if (!fila || fila === "nuevo") {
    const creado = await crearTicket({
      nombre: s(campos.nombre), apellido: s(campos.apellido), cedula: s(campos.cedula),
      facial: s(campos.facial), pack3: s(campos.pack3), pack6: s(campos.pack6),
      extras: s(campos.extras), notas: s(campos.notas), recomendaciones: s(campos.recomendaciones),
      estimado: campos.estimado, cosmetologa: s(campos.cosmetologa) || ses.name,
    }, ctx, ses);
    if (!creado.error) await anotar(ctx, ses, "tickets", s(creado.beta_num || creado.so_num), "INSERT", null, creado);
    return creado;
  }
  const row = await ticketDe(ctx, fila);
  if (!row) return { error: "Ticket no encontrado" };
  if (row.borrado_at) return { error: "Ese ticket ya está eliminado" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const patch = patchDe(campos);
  if (!Object.keys(patch).length) return { error: "Nada que guardar" };
  const antes = vistaDe(row);
  let saved: Row | null = null;
  try {
    saved = await ctx.db.write(actorOf(ses), "tickets", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
  if (!saved) return { error: "No se pudo guardar el ticket" };
  await anotar(ctx, ses, "tickets", filaDe(row), "UPDATE", antes, vistaDe(saved));
  return { ok: true, fila: filaDe(row) };
}

export async function borrarTicketSuave(ctx: Ctx, ses: Ses, row: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  if (row.borrado_at) return { ok: true };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const antes = vistaDe(row);
  const patch = { borrado_at: ctx.now.toISOString(), borrado_por: actorOf(ses) };
  let saved: Row | null = null;
  try {
    saved = await ctx.db.write(actorOf(ses), "tickets", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/update vacio|column/i.test(msg)) return { error: "Aplica 0022_inline_solicitudes.sql para el borrado con historial" };
    return { error: msg || "No se pudo eliminar" };
  }
  if (!saved || !saved.borrado_at) return { error: "Aplica 0022_inline_solicitudes.sql para el borrado con historial" };
  await anotar(ctx, ses, "tickets", filaDe(row), "UPDATE", antes, { ...antes, borrado: true });
  return { ok: true };
}

async function veTicket(ctx: Ctx, ses: Ses, row: Row): Promise<boolean> {
  const nivel = acceso(ses.rol, "tickets", await matrizDe(ctx.db));
  if (nivel === "no") return false;
  if (nivel === "todos" || esAdmin(ses.rol)) return true;
  return esPropio(s(row.atendido_por), ses);
}

async function avisarAdmins(ctx: Ctx, ses: Ses, texto: string) {
  const admins = (await ctx.db.all("usuarios")).filter((u) => esAdmin(s(u.rol))).map((u) => s(u.nombre));
  try { await pushAPersonas(ctx, ses, admins, texto, "solicitud"); } catch { /* la lista sigue */ }
}

extend("inline_guardar", "any", async (p, ctx, ses) => {
  const campos = (p.campos && typeof p.campos === "object" ? p.campos : {}) as Row;
  if (s(p.tabla) === "tickets") return guardarTicketCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "clientes") return guardarClienteCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "catalogo") return guardarCatalogoCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "inventario") return guardarInventarioCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "proveedores") return guardarProveedorCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "compras") return guardarCompraCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "gift_cards") return guardarGiftCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "paquetes") return guardarPaqueteCampos(ctx, ses, s(p.fila), campos);
  return { error: "Esa tabla todavía no se edita en línea" };
});

extend("inline_borrar", "any", async (p, ctx, ses) => {
  if (s(p.tabla) === "clientes") return borrarClienteSuave(ctx, ses, s(p.fila));
  if (s(p.tabla) === "catalogo" || s(p.tabla) === "inventario") return borrarCatalogoSuave(ctx, ses, s(p.fila));
  if (s(p.tabla) === "proveedores") return borrarProveedor(ctx, ses, s(p.fila));
  if (s(p.tabla) === "compras") return borrarCompra(ctx, ses, s(p.fila));
  if (s(p.tabla) === "gift_cards") return borrarGiftSuave(ctx, ses, s(p.fila));
  if (s(p.tabla) === "paquetes") return borrarPaqueteSuave(ctx, ses, s(p.fila));
  if (s(p.tabla) !== "tickets") return { error: "Esa tabla todavía no se edita en línea" };
  const row = await ticketDe(ctx, s(p.fila));
  if (!row) return { error: "Ticket no encontrado" };
  return borrarTicketSuave(ctx, ses, row);
});

async function filaSolicitud(ctx: Ctx, ses: Ses, tabla: string, fila: string): Promise<{ row: Row; antes: Row } | { error: string }> {
  if (tabla === "tickets") {
    const row = await ticketDe(ctx, fila);
    if (!row || row.borrado_at) return { error: "Ticket no encontrado" };
    if (!(await veTicket(ctx, ses, row))) return { error: "No tienes permiso para pedir un cambio de ese ticket" };
    return { row, antes: vistaDe(row) };
  }
  if (tabla === "clientes") {
    const viva = await clientaViva(ctx, fila);
    const key = fila.startsWith("k:") ? fila.slice(2) : "";
    const row = viva || (key.startsWith("c:") ? { cedula: key.slice(2) } : key.startsWith("n:") ? { nombre: key.slice(2) } : null);
    if (!row) return { error: "Clienta no encontrada" };
    if (!(await veCliente(ctx, ses, row))) return { error: "No tienes permiso para pedir un cambio de esa clienta" };
    return { row, antes: vistaCliente(row) };
  }
  if (tabla === "catalogo" || tabla === "inventario") {
    const row = await catalogoDe(ctx, fila);
    if (!row) return { error: "Producto no encontrado" };
    if (!(await veModulo(ctx, ses, tabla === "inventario" ? "inventario" : "productos"))) {
      return { error: "No tienes permiso para pedir un cambio de ese producto" };
    }
    const base = tabla === "inventario" ? await baseDe(ctx, s(row.sku)) : null;
    const antes = tabla === "inventario"
      ? { nombre: s(row.producto_servicio), minimo: base ? n(base.minimo) : 0, compra: base ? n(base.compra) : 0 }
      : vistaCatalogo(row);
    return { row, antes };
  }
  if (tabla === "proveedores") {
    const row = await proveedorDe(ctx, fila);
    if (!row) return { error: "Proveedor no encontrado" };
    if (!(await veModulo(ctx, ses, "proveedores"))) return { error: "No tienes permiso para pedir un cambio de ese proveedor" };
    return { row, antes: vistaProveedor(row) };
  }
  if (tabla === "compras") {
    const row = await entradaDe(ctx, fila);
    if (!row) return { error: "Línea no encontrada" };
    if (!(await veModulo(ctx, ses, "compras"))) return { error: "No tienes permiso para pedir un cambio de esa línea" };
    return { row, antes: vistaEntrada(row) };
  }
  if (tabla === "gift_cards") {
    const row = await giftDe(ctx, fila);
    if (!row) return { error: "Gift card no encontrada" };
    if (!(await veModulo(ctx, ses, "gift_cards"))) return { error: "No tienes permiso para pedir un cambio de esa gift card" };
    return { row, antes: vistaGift(row) };
  }
  if (tabla === "paquetes") {
    const row = await paqueteDe(ctx, fila);
    if (!row) return { error: "Paquete no encontrado" };
    if (!(await veModulo(ctx, ses, "paquetes"))) return { error: "No tienes permiso para pedir un cambio de ese paquete" };
    return { row, antes: vistaPaquete(row) };
  }
  return { error: "Esa tabla todavía no recibe solicitudes" };
}

async function aplicarAprobado(ctx: Ctx, ses: Ses, row: Row): Promise<Row> {
  const tabla = s(row.tabla);
  const fila = s(row.fila);
  const propuestos = (row.propuestos && typeof row.propuestos === "object" ? row.propuestos : {}) as Row;
  const borrar = s(row.tipo) === "eliminacion";
  if (tabla === "clientes") return borrar ? borrarClienteSuave(ctx, ses, fila) : guardarClienteCampos(ctx, ses, fila, propuestos);
  if (tabla === "catalogo") return borrar ? borrarCatalogoSuave(ctx, ses, fila) : guardarCatalogoCampos(ctx, ses, fila, propuestos);
  if (tabla === "inventario") return borrar ? borrarCatalogoSuave(ctx, ses, fila) : guardarInventarioCampos(ctx, ses, fila, propuestos);
  if (tabla === "proveedores") return borrar ? borrarProveedor(ctx, ses, fila) : guardarProveedorCampos(ctx, ses, fila, propuestos);
  if (tabla === "compras") return borrar ? borrarCompra(ctx, ses, fila) : guardarCompraCampos(ctx, ses, fila, propuestos);
  if (tabla === "gift_cards") return borrar ? borrarGiftSuave(ctx, ses, fila) : guardarGiftCampos(ctx, ses, fila, propuestos);
  if (tabla === "paquetes") return borrar ? borrarPaqueteSuave(ctx, ses, fila) : guardarPaqueteCampos(ctx, ses, fila, propuestos);
  if (borrar) {
    const ticket = await ticketDe(ctx, fila);
    if (!ticket) return { error: "Ticket no encontrado" };
    return borrarTicketSuave(ctx, ses, ticket);
  }
  return guardarTicketCampos(ctx, ses, fila, propuestos);
}

extend("solicitud_crear", "any", async (p, ctx, ses) => {
  if (esAdmin(ses.rol)) return { error: "Un admin guarda el cambio directo" };
  const tabla = s(p.tabla);
  const fila = s(p.fila);
  const tipo = s(p.tipo);
  const motivo = s(p.motivo).trim();
  if (tipo !== "cambio" && tipo !== "eliminacion") return { error: "Elige cambio o eliminación" };
  if (!motivo) return { error: "El motivo es obligatorio" };
  const hecho = await filaSolicitud(ctx, ses, tabla, fila);
  if ("error" in hecho) return hecho;
  const id = crypto.randomUUID();
  const propuestos = tipo === "cambio" && p.propuestos && typeof p.propuestos === "object" ? p.propuestos as Row : {};
  const rec = {
    id, solicitante: ses.name, solicitante_uid: ses.uid, creado: ctx.now.toISOString(),
    tabla, fila, tipo, propuestos, antes: hecho.antes, motivo, estado: "pendiente",
  };
  await ctx.db.write(actorOf(ses), "solicitudes_cambio", "insert", {}, rec);
  await anotar(ctx, ses, "solicitudes_cambio", id, "INSERT", null, rec);
  const cosa = tabla === "clientes" ? "una clienta" : tabla === "catalogo" || tabla === "inventario" ? "un producto" : tabla === "proveedores" ? "un proveedor" : tabla === "compras" ? "una línea de compra" : tabla === "gift_cards" ? "una gift card" : tabla === "paquetes" ? "un paquete" : "un ticket";
  await avisarAdmins(ctx, ses, ses.name + " pidió " + (tipo === "eliminacion" ? "eliminar" : "un cambio en") + " " + cosa);
  return { ok: true, id };
});

extend("getSolicitudes", "any", async (_p, ctx, ses) => {
  let rows: Row[] = [];
  try { rows = await ctx.db.all("solicitudes_cambio"); } catch { rows = []; }
  const admin = esAdmin(ses.rol);
  const items = rows
    .filter((r) => admin || s(r.solicitante_uid) === ses.uid || normNombre(s(r.solicitante)) === normNombre(ses.name))
    .sort((a, b) => s(b.creado).localeCompare(s(a.creado)));
  return { ok: true, items, pendientes: items.filter((r) => s(r.estado) === "pendiente").length };
});

extend("solicitud_resolver", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin resuelve solicitudes" };
  const rows = await ctx.db.all("solicitudes_cambio").catch(() => [] as Row[]);
  const row = rows.find((r) => s(r.id) === s(p.id));
  if (!row) return { error: "Solicitud no encontrada" };
  if (s(row.estado) !== "pendiente") return { error: "Esa solicitud ya está cerrada" };
  const aprobar = p.aprobar === true || s(p.aprobar) === "true" || s(p.aprobar) === "aprobar";
  if (aprobar) {
    const hecho = await aplicarAprobado(ctx, ses, row);
    if (hecho.error) return hecho;
  }
  const patch = {
    estado: aprobar ? "aprobado" : "rechazado",
    resuelto_por: ses.name,
    resuelto_at: ctx.now.toISOString(),
    comentario: s(p.comentario),
  };
  await ctx.db.write(actorOf(ses), "solicitudes_cambio", "update", { id: row.id }, patch);
  await anotar(ctx, ses, "solicitudes_cambio", s(row.id), "UPDATE", { estado: "pendiente" }, patch);
  return { ok: true, estado: patch.estado };
});
