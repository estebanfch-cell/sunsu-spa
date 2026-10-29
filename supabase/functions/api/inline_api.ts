// Edición en línea y solicitudes de cambio. El admin guarda por el mismo camino
// auditado; el resto pide un cambio y un admin lo aprueba o lo rechaza.

import { extend, crearTicket } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, kvGet, kvSet, logAccion, nextSheet } from "./lib.ts";
import { acceso, esAdmin, esPropio, matrizDe, MODULOS, normalizarRol, puedeVerContacto, ROLES } from "./permisos.ts";
import { runErp } from "./erp.ts";
import { ecuadorParts, IVA, n, normCedula, normNombre, round2, s, skuCode, ymdUtc, type Row } from "./domain.ts";
import { cargarHorarios, guardarHorario, horarioDesde, pushAPersonas, validar } from "./horarios_api.ts";
import { diasDeVacacion, instanteEcuador, validarSolicitudVacacion } from "./asistencia.ts";
import { saldoDe } from "./asistencia_api.ts";
import { claveCliente, claveRegistro } from "./ventas.ts";
import { LINEA_CAMPOS, patchLineas } from "./ticket_total.ts";
import { borrarComision, guardarComisionCampos, vistaConfig } from "./comision_cfg.ts";

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

/** La fila que quedó escrita. En modo prueba un sheet_row positivo pasa a negativo. */
function filaGuardada(saved: Row, propuesta: number | string): string {
  if (saved.sheet_row != null && String(saved.sheet_row) !== "") return String(saved.sheet_row);
  if (saved.id != null && String(saved.id) !== "") return String(saved.id);
  return String(propuesta);
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
    if (!saved) return { error: "No se pudo guardar" };
    const fila = filaGuardada(saved, sheet_row);
    await anotar(ctx, ses, "proveedores", fila, "INSERT", null, vistaProveedor(saved));
    return { ok: true, fila };
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
    if (!saved) return { error: "No se pudo guardar" };
    const fila = filaGuardada(saved, sheet_row);
    await anotar(ctx, ses, "inventario_entradas", fila, "INSERT", null, vistaEntrada(saved));
    return { ok: true, fila };
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

function filaBorrada(row: Row): boolean {
  return !!row.borrado_at;
}

function codigoOcupado(rows: Row[], codigo: string, propio?: Row): boolean {
  const code = s(codigo).toLowerCase();
  if (!code) return false;
  return rows.some((r) => {
    if (propio && (propio.id != null ? r.id === propio.id : String(r.sheet_row) === String(propio.sheet_row))) return false;
    return s(r.codigo_gc).toLowerCase() === code;
  });
}

async function giftDe(ctx: Ctx, fila: string): Promise<Row | null> {
  const rows = await ctx.db.all("gift_cards");
  return rows.find((r) => !filaBorrada(r) && (s(r.sheet_row) === fila || s(r.id) === fila || s(r.codigo_gc) === fila)) || null;
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
    if (codigoOcupado(rows, s(campos.codigo))) return { error: "Ese código ya existe" };
    const ec = ecuadorParts(ctx.now);
    const sheet_row = await nextSheet(ctx.db, "gift_cards");
    const vendida = !!(s(campos.nombre) || s(campos.cedula) || s(campos.valor));
    const rec: Row = {
      sheet_row, codigo_gc: s(campos.codigo), nombre_comprador: s(campos.nombre), apellido_comprador: s(campos.apellido),
      cedula_comprador: s(campos.cedula), valor: s(campos.valor), sku: s(campos.sku), notas: s(campos.notas),
      dia: vendida ? ec.d : null, mes: vendida ? ec.m : null, ano: vendida ? ec.y : null,
      orig: { codigo: s(campos.codigo), beta: true }, origin: "beta",
    };
    const saved = await ctx.db.write(actorOf(ses), "gift_cards", "insert", {}, rec);
    if (!saved) return { error: "No se pudo guardar" };
    const fila = filaGuardada(saved, sheet_row);
    await anotar(ctx, ses, "gift_cards", fila, "INSERT", null, vistaGift(saved));
    return { ok: true, fila };
  }
  const row = await giftDe(ctx, fila);
  if (!row) return { error: "Gift card no encontrada" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const patch: Row = {};
  if (campos.codigo != null) {
    if (!s(campos.codigo)) return { error: "El código es obligatorio" };
    if (codigoOcupado(await ctx.db.all("gift_cards"), s(campos.codigo), row)) return { error: "Ese código ya existe" };
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
  const patch = { borrado_at: ctx.now.toISOString(), borrado_por: actorOf(ses) };
  let saved: Row | null = null;
  try {
    saved = await ctx.db.write(actorOf(ses), "gift_cards", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/update vacio|column/i.test(msg)) return { error: "Aplica 0027_borrado_gc_paq.sql para el borrado con historial" };
    return { error: msg || "No se pudo eliminar" };
  }
  if (!saved || !saved.borrado_at) return { error: "Aplica 0027_borrado_gc_paq.sql para el borrado con historial" };
  await anotar(ctx, ses, "gift_cards", s(row.sheet_row), "UPDATE", antes, { ...antes, borrado: true });
  return { ok: true };
}

async function paqueteDe(ctx: Ctx, fila: string): Promise<Row | null> {
  const rows = await ctx.db.all("paquetes");
  return rows.find((r) => !filaBorrada(r) && (s(r.sheet_row) === fila || s(r.id) === fila)) || null;
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
      notas: s(campos.notas), orig: { sku: s(campos.sku) }, origin: "beta",
    };
    const saved = await ctx.db.write(actorOf(ses), "paquetes", "insert", {}, rec);
    if (!saved) return { error: "No se pudo guardar" };
    const fila = filaGuardada(saved, sheet_row);
    await anotar(ctx, ses, "paquetes", fila, "INSERT", null, vistaPaquete(saved));
    return { ok: true, fila };
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
  const patch = { borrado_at: ctx.now.toISOString(), borrado_por: actorOf(ses) };
  let saved: Row | null = null;
  try {
    saved = await ctx.db.write(actorOf(ses), "paquetes", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/update vacio|column/i.test(msg)) return { error: "Aplica 0027_borrado_gc_paq.sql para el borrado con historial" };
    return { error: msg || "No se pudo eliminar" };
  }
  if (!saved || !saved.borrado_at) return { error: "Aplica 0027_borrado_gc_paq.sql para el borrado con historial" };
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
  // El total no se edita a mano: sale de las líneas (ticket_total.ts).
  const resto: Row = { ...campos };
  delete resto.estimado;
  for (const k of LINEA_CAMPOS) delete resto[k];
  const patch = patchDe(resto);
  const lp = patchLineas(row, campos, await ctx.db.all("catalogo"));
  if (lp) Object.assign(patch, lp);
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
  return { ok: true, fila: filaDe(row), ticket: vistaDe(saved) };
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

const ESTADOS_PERMISO = new Set(["PENDIENTE", "APROBADO", "RECHAZADO", "CANCELADO"]);
const TIPOS_MARCA = new Set(["entrada", "salida", "almuerzo_inicio", "almuerzo_fin"]);
const DIAS_HORARIO = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function ymdCampo(v: unknown): string {
  const t = s(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
}

function tipoPermiso(v: unknown): string {
  return /vacac/i.test(s(v)) ? "VACACIONES" : "PERMISO";
}

async function permisoDe(ctx: Ctx, fila: string): Promise<Row | null> {
  const rows = await ctx.db.all("permisos");
  return rows.find((r) => !r.borrado_at && (s(r.sheet_row) === fila || s(r.id_1) === fila || s(r.id) === fila)) || null;
}

function vistaPermiso(row: Row): Row {
  return {
    empleada: s(row.empleada), tipo: s(row.tipo), desde: s(row.fecha_inicio).slice(0, 10),
    hasta: s(row.fecha_fin).slice(0, 10), horas: s(row.horas), motivo: s(row.motivo), estado: s(row.estado),
  };
}

export async function guardarPermisoCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  if (!fila || fila === "nuevo") {
    const empleada = s(campos.empleada);
    const desde = ymdCampo(campos.desde);
    const hasta = ymdCampo(campos.hasta) || desde;
    if (!empleada) return { error: "La empleada es obligatoria" };
    if (!desde) return { error: "Falta la fecha" };
    if (hasta < desde) return { error: "La fecha final es antes de la inicial." };
    const tipo = tipoPermiso(campos.tipo);
    const estado = s(campos.estado).toUpperCase() || "PENDIENTE";
    if (!ESTADOS_PERMISO.has(estado)) return { error: "Estado inválido" };
    if (tipo === "PERMISO" && !s(campos.motivo)) return { error: "Escribe el motivo del permiso." };
    const dias = diasDeVacacion({ desde, hasta });
    if (tipo === "VACACIONES") {
      const err = validarSolicitudVacacion(await saldoDe(ctx, empleada), dias);
      if (err) return { error: err };
    }
    const sheet_row = await nextSheet(ctx.db, "permisos");
    const rec: Row = {
      sheet_row, id_1: ctx.now.getTime() + Math.abs(sheet_row), empleada, tipo,
      fecha_inicio: desde, fecha_fin: hasta, horas: n(campos.horas), motivo: s(campos.motivo),
      estado, solicitado: ecuadorParts(ctx.now).ymd, dias, origin: "beta", orig: { tipo, por: ses.name },
    };
    const saved = await ctx.db.write(actorOf(ses), "permisos", "insert", {}, rec);
    if (!saved) return { error: "No se pudo guardar" };
    const fila = filaGuardada(saved, sheet_row);
    await anotar(ctx, ses, "permisos", fila, "INSERT", null, vistaPermiso(saved));
    return { ok: true, fila };
  }
  const row = await permisoDe(ctx, fila);
  if (!row) return { error: "Permiso no encontrado" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const patch: Row = {};
  if (campos.empleada != null) {
    if (!s(campos.empleada)) return { error: "La empleada es obligatoria" };
    patch.empleada = s(campos.empleada);
  }
  if (campos.tipo != null) patch.tipo = tipoPermiso(campos.tipo);
  if (campos.desde != null) {
    const desde = ymdCampo(campos.desde);
    if (!desde) return { error: "Falta la fecha" };
    patch.fecha_inicio = desde;
  }
  if (campos.hasta != null) {
    const hasta = ymdCampo(campos.hasta);
    if (!hasta) return { error: "Falta la fecha" };
    patch.fecha_fin = hasta;
  }
  if (campos.horas != null) patch.horas = n(campos.horas);
  if (campos.motivo != null) patch.motivo = s(campos.motivo);
  if (campos.estado != null) {
    const estado = s(campos.estado).toUpperCase();
    if (!ESTADOS_PERMISO.has(estado)) return { error: "Estado inválido" };
    patch.estado = estado;
  }
  if (!Object.keys(patch).length) return { error: "Nada que guardar" };
  const desde = s(patch.fecha_inicio || row.fecha_inicio).slice(0, 10);
  const hasta = s(patch.fecha_fin || row.fecha_fin).slice(0, 10) || desde;
  if (hasta < desde) return { error: "La fecha final es antes de la inicial." };
  patch.dias = diasDeVacacion({ desde, hasta });
  const antes = vistaPermiso(row);
  const saved = await ctx.db.write(actorOf(ses), "permisos", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  if (!saved) return { error: "No se pudo guardar el permiso" };
  await anotar(ctx, ses, "permisos", s(row.sheet_row), "UPDATE", antes, vistaPermiso(saved));
  return { ok: true, fila: s(row.sheet_row) };
}

async function borrarSuave(ctx: Ctx, ses: Ses, tabla: string, row: Row, vista: Row): Promise<Row> {
  const patch = { borrado_at: ctx.now.toISOString(), borrado_por: actorOf(ses) };
  let saved: Row | null = null;
  try {
    saved = await ctx.db.write(actorOf(ses), tabla, "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/update vacio|column/i.test(msg)) return { error: "Aplica 0028_borrado_personal.sql para el borrado con historial" };
    return { error: msg || "No se pudo eliminar" };
  }
  if (!saved || !saved.borrado_at) return { error: "Aplica 0028_borrado_personal.sql para el borrado con historial" };
  await anotar(ctx, ses, tabla, s(row.sheet_row || row.id), "UPDATE", vista, { ...vista, borrado: true });
  return { ok: true };
}

export async function borrarPermisoSuave(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const row = await permisoDe(ctx, fila);
  if (!row) return { error: "Permiso no encontrado" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  return borrarSuave(ctx, ses, "permisos", row, vistaPermiso(row));
}

async function multaDe(ctx: Ctx, fila: string): Promise<Row | null> {
  const rows = await ctx.db.all("multas_descuentos");
  return rows.find((r) => !r.borrado_at && (s(r.sheet_row) === fila || s(r.id) === fila)) || null;
}

function vistaMulta(row: Row): Row {
  return {
    cosmetologa: s(row.cosmetologa), tipo: s(row.tipo), monto: s(row.monto),
    motivo: s(row.motivo), fecha: s(row.fecha).slice(0, 10),
  };
}

export async function guardarMultaCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  const tipoDe = (v: unknown) => {
    const tipo = s(v || "MULTA").toUpperCase();
    return tipo === "DESCUENTO" ? "DESCUENTO" : tipo === "MULTA" ? "MULTA" : "";
  };
  if (!fila || fila === "nuevo") {
    if (!s(campos.cosmetologa) || !(n(campos.monto) > 0)) return { error: "Cosmetóloga y monto son obligatorios" };
    const tipo = tipoDe(campos.tipo);
    if (!tipo) return { error: "Tipo inválido" };
    const sheet_row = await nextSheet(ctx.db, "multas_descuentos");
    const fecha = ymdCampo(campos.fecha) || ecuadorParts(ctx.now).ymd;
    const rec: Row = {
      sheet_row, fecha, cosmetologa: s(campos.cosmetologa), tipo, monto: n(campos.monto),
      motivo: s(campos.motivo), orig: { tipo, monto: n(campos.monto) }, origin: "beta",
    };
    const saved = await ctx.db.write(actorOf(ses), "multas_descuentos", "insert", {}, rec);
    if (!saved) return { error: "No se pudo guardar" };
    const fila = filaGuardada(saved, sheet_row);
    await anotar(ctx, ses, "multas_descuentos", fila, "INSERT", null, vistaMulta(saved));
    return { ok: true, fila };
  }
  const row = await multaDe(ctx, fila);
  if (!row) return { error: "Multa no encontrada" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const patch: Row = {};
  if (campos.cosmetologa != null) {
    if (!s(campos.cosmetologa)) return { error: "La cosmetóloga es obligatoria" };
    patch.cosmetologa = s(campos.cosmetologa);
  }
  if (campos.tipo != null) {
    const tipo = tipoDe(campos.tipo);
    if (!tipo) return { error: "Tipo inválido" };
    patch.tipo = tipo;
  }
  if (campos.monto != null) {
    if (!(n(campos.monto) > 0)) return { error: "El monto es obligatorio" };
    patch.monto = n(campos.monto);
  }
  if (campos.motivo != null) patch.motivo = s(campos.motivo);
  if (campos.fecha != null) {
    const fecha = ymdCampo(campos.fecha);
    if (!fecha) return { error: "Falta la fecha" };
    patch.fecha = fecha;
  }
  if (!Object.keys(patch).length) return { error: "Nada que guardar" };
  const antes = vistaMulta(row);
  const saved = await ctx.db.write(actorOf(ses), "multas_descuentos", "update", row.id != null ? { id: row.id } : { sheet_row: row.sheet_row }, patch);
  if (!saved) return { error: "No se pudo guardar la multa" };
  await anotar(ctx, ses, "multas_descuentos", s(row.sheet_row), "UPDATE", antes, vistaMulta(saved));
  return { ok: true, fila: s(row.sheet_row) };
}

export async function borrarMultaSuave(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const row = await multaDe(ctx, fila);
  if (!row) return { error: "Multa no encontrada" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  return borrarSuave(ctx, ses, "multas_descuentos", row, vistaMulta(row));
}

function semanaFija() {
  return DIAS_HORARIO.map((dia, i) => ({
    orden: i + 1, dia, trabaja: i < 5, desde: i < 5 ? "09:00" : null, hasta: i < 5 ? "18:00" : null, duracionMin: i < 5 ? 540 : null,
  }));
}

export async function guardarHorarioCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  const { horarios } = await cargarHorarios(ctx);
  if (!fila || fila === "nuevo") {
    if (!s(campos.nombre)) return { error: "El horario necesita un nombre." };
    const arreglo = s(campos.arreglo) || "fijo";
    if (arreglo === "rotativo") return { error: "Un horario rotativo se arma en el editor." };
    const h = horarioDesde({
      nombre: s(campos.nombre), arreglo, es_default: campos.esDefault === true || s(campos.esDefault) === "true",
      horas_semana: n(campos.horasSemana) || (arreglo === "semanal" ? 40 : null),
      dias: semanaFija(), descansos: [{ nombre: "Almuerzo", desde: "13:00", hasta: "14:00", duracion_min: 60, franja: true }],
    }, null);
    const err = validar(h);
    if (err) return { error: err };
    await guardarHorario(ctx, ses, h);
    await anotar(ctx, ses, "horarios", h.id, "INSERT", null, { nombre: h.nombre, arreglo: h.arreglo });
    return { ok: true, fila: h.id };
  }
  const prev = horarios.find((h) => h.id === fila) || null;
  if (!prev) return { error: "Horario no encontrado" };
  const h = horarioDesde({
    id: prev.id, nombre: campos.nombre != null ? s(campos.nombre) : prev.nombre,
    arreglo: campos.arreglo != null ? s(campos.arreglo) : prev.arreglo,
    es_default: campos.esDefault != null ? (campos.esDefault === true || s(campos.esDefault) === "true") : prev.esDefault,
    horas_semana: campos.horasSemana != null ? n(campos.horasSemana) : prev.horasSemana,
    ciclo_dias: prev.cicloDias, ancla: prev.ancla, dias: prev.dias, descansos: prev.descansos, deducciones: prev.deducciones,
  }, prev);
  const err = validar(h);
  if (err) return { error: err };
  await guardarHorario(ctx, ses, h);
  await anotar(ctx, ses, "horarios", h.id, "UPDATE", { nombre: prev.nombre, arreglo: prev.arreglo }, { nombre: h.nombre, arreglo: h.arreglo });
  return { ok: true, fila: h.id };
}

export async function borrarHorarioSuave(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const rows = await ctx.db.all("horarios").catch(() => [] as Row[]);
  const row = rows.find((r) => !r.borrado_at && s(r.id) === fila);
  if (!row) return { error: "Horario no encontrado" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const patch = { borrado_at: ctx.now.toISOString(), borrado_por: actorOf(ses), es_default: false };
  let saved: Row | null = null;
  try {
    saved = await ctx.db.write(actorOf(ses), "horarios", "update", { id: row.id }, patch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/update vacio|column/i.test(msg)) return { error: "Aplica 0028_borrado_personal.sql para el borrado con historial" };
    return { error: msg || "No se pudo eliminar" };
  }
  if (!saved || !saved.borrado_at) return { error: "Aplica 0028_borrado_personal.sql para el borrado con historial" };
  for (const a of await ctx.db.all("horario_asignaciones").catch(() => [] as Row[])) {
    if (s(a.horario_id) !== fila) continue;
    if (ses.prueba && s(a.origin) !== "test") continue;
    try {
      await ctx.db.write(actorOf(ses), "horario_asignaciones", "delete", { persona: a.persona }, null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/no borra datos reales/i.test(msg)) continue;
      return { error: msg || "No se pudo soltar la asignación" };
    }
  }
  await anotar(ctx, ses, "horarios", fila, "UPDATE", { nombre: s(row.nombre) }, { nombre: s(row.nombre), borrado: true });
  return { ok: true };
}

async function marcaDe(ctx: Ctx, fila: string): Promise<Row | null> {
  const rows = await ctx.db.all("asistencia_marcajes");
  return rows.find((r) => s(r.id) === fila) || null;
}

function vistaMarca(row: Row): Row {
  const ec = ecuadorParts(new Date(s(row.ts)));
  return { nombre: s(row.nombre), tipo: s(row.tipo), fecha: ec.ymd, hora: ec.hm, anulado: row.anulado === true };
}

async function auditarMarca(ctx: Ctx, ses: Ses, accion: string, extra: Row) {
  await ctx.db.write(actorOf(ses), "asistencia_auditoria", "insert", {}, {
    actor: actorOf(ses), accion, nombre: s(extra.nombre || ses.name), ts: ctx.now.toISOString(),
    marcaje_id: s(extra.marcaje_id), motivo: s(extra.motivo), antes: extra.antes || null, despues: extra.despues || null,
  });
}

export async function guardarAsistenciaCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  if (!s(campos.motivo)) return { error: "La corrección necesita un motivo" };
  if (!fila || fila === "nuevo") {
    const tipo = s(campos.tipo);
    if (!TIPOS_MARCA.has(tipo)) return { error: "Tipo de marca desconocido." };
    const nombre = s(campos.nombre);
    if (!nombre) return { error: "Falta la empleada" };
    const fecha = ymdCampo(campos.fecha);
    const hora = s(campos.hora).slice(0, 5);
    if (!fecha || !/^\d{2}:\d{2}$/.test(hora)) return { error: "Falta la fecha o la hora" };
    const ts = instanteEcuador(fecha, hora);
    if (new Date(ts).getTime() > ctx.now.getTime()) return { error: "No se agrega una marca en el futuro." };
    const saved = await ctx.db.write(actorOf(ses), "asistencia_marcajes", "insert", {}, {
      usuario_id: nombre, nombre, tipo, ts, origen: "manual", dentro_radio: null, anulado: false,
      creado_por: ses.name, motivo_manual: s(campos.motivo),
    });
    await auditarMarca(ctx, ses, "marca_manual", { nombre, marcaje_id: s(saved?.id), despues: { tipo, ts }, motivo: s(campos.motivo) });
    return saved ? { ok: true, fila: s(saved.id) } : { error: "No se pudo guardar" };
  }
  const row = await marcaDe(ctx, fila);
  if (!row) return { error: "Marca no encontrada" };
  if (row.anulado === true) return { error: "Esa marca ya está anulada" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const patch: Row = {};
  if (campos.tipo != null) {
    const tipo = s(campos.tipo);
    if (!TIPOS_MARCA.has(tipo)) return { error: "Tipo de marca desconocido." };
    patch.tipo = tipo;
  }
  if (campos.hora != null || campos.fecha != null) {
    const ec = ecuadorParts(new Date(s(row.ts)));
    const fecha = ymdCampo(campos.fecha) || ec.ymd;
    const hora = (s(campos.hora) || ec.hm).slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(hora)) return { error: "Hora inválida" };
    const ts = instanteEcuador(fecha, hora);
    if (new Date(ts).getTime() > ctx.now.getTime()) return { error: "No se agrega una marca en el futuro." };
    patch.ts = ts;
  }
  if (!Object.keys(patch).length) return { error: "Nada que corregir" };
  const antes = vistaMarca(row);
  const saved = await ctx.db.write(actorOf(ses), "asistencia_marcajes", "update", { id: row.id }, patch);
  if (!saved) return { error: "No se pudo corregir" };
  await auditarMarca(ctx, ses, "correccion", { nombre: s(row.nombre), marcaje_id: s(row.id), antes, despues: patch, motivo: s(campos.motivo) });
  return { ok: true, fila: s(row.id) };
}

export async function anularMarca(ctx: Ctx, ses: Ses, fila: string, motivo: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  if (!s(motivo)) return { error: "Anular una marca necesita un motivo" };
  const row = await marcaDe(ctx, fila);
  if (!row) return { error: "Marca no encontrada" };
  if (row.anulado === true) return { ok: true };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const antes = vistaMarca(row);
  const saved = await ctx.db.write(actorOf(ses), "asistencia_marcajes", "update", { id: row.id }, { anulado: true, motivo_anulacion: s(motivo) });
  if (!saved) return { error: "No se pudo anular" };
  await auditarMarca(ctx, ses, "correccion", { nombre: s(row.nombre), marcaje_id: s(row.id), antes, despues: { anulado: true }, motivo: s(motivo) });
  return { ok: true };
}

async function feriadoDe(ctx: Ctx, fila: string): Promise<Row | null> {
  const fecha = ymdCampo(fila);
  const rows = await ctx.db.all("asistencia_feriados");
  return rows.find((r) => s(r.fecha).slice(0, 10) === (fecha || fila)) || null;
}

export async function guardarFeriadoCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  if (!fila || fila === "nuevo") {
    const fecha = ymdCampo(campos.fecha);
    if (!fecha) return { error: "Fecha inválida" };
    const ya = await feriadoDe(ctx, fecha);
    if (ya) await ctx.db.write(actorOf(ses), "asistencia_feriados", "update", { fecha: ya.fecha }, { nombre: s(campos.nombre) });
    else await ctx.db.write(actorOf(ses), "asistencia_feriados", "insert", {}, { fecha, nombre: s(campos.nombre) });
    await anotar(ctx, ses, "asistencia_feriados", fecha, ya ? "UPDATE" : "INSERT", ya ? { nombre: s(ya.nombre) } : null, { fecha, nombre: s(campos.nombre) });
    return { ok: true, fila: fecha };
  }
  const row = await feriadoDe(ctx, fila);
  if (!row) return { error: "Feriado no encontrado" };
  const patch: Row = {};
  if (campos.nombre != null) patch.nombre = s(campos.nombre);
  if (campos.fecha != null) {
    const fecha = ymdCampo(campos.fecha);
    if (!fecha) return { error: "Fecha inválida" };
    patch.fecha = fecha;
  }
  if (!Object.keys(patch).length) return { error: "Nada que guardar" };
  const saved = await ctx.db.write(actorOf(ses), "asistencia_feriados", "update", { fecha: row.fecha }, patch);
  if (!saved) return { error: "No se pudo guardar el feriado" };
  await anotar(ctx, ses, "asistencia_feriados", s(saved.fecha || row.fecha).slice(0, 10), "UPDATE", { nombre: s(row.nombre), fecha: s(row.fecha).slice(0, 10) }, { nombre: s(saved.nombre), fecha: s(saved.fecha).slice(0, 10) });
  return { ok: true, fila: s(saved.fecha || row.fecha).slice(0, 10) };
}

export async function borrarFeriado(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const row = await feriadoDe(ctx, fila);
  if (!row) return { error: "Feriado no encontrado" };
  const saved = await ctx.db.write(actorOf(ses), "asistencia_feriados", "delete", { fecha: row.fecha }, null);
  if (!saved) return { error: "No se pudo eliminar" };
  await anotar(ctx, ses, "asistencia_feriados", s(row.fecha).slice(0, 10), "DELETE", { nombre: s(row.nombre), fecha: s(row.fecha).slice(0, 10) }, null);
  return { ok: true };
}

async function pagosDe(ctx: Ctx): Promise<Row[]> {
  try {
    const rows = await ctx.db.all("pago_config");
    if (rows.length) return rows;
  } catch { /* sigue en app_kv */ }
  const kv = await kvGet(ctx.db, "pago_config");
  if (Array.isArray(kv)) return kv as Row[];
  const filas = (kv as Row).filas;
  return Array.isArray(filas) ? filas as Row[] : [];
}

function pagoClave(r: Row): string {
  return s(r.id) || (s(r.nombre) + "|" + s(r.vigente_desde).slice(0, 10));
}

function vistaPago(row: Row): Row {
  const pct = n(row.iess_pct);
  return {
    nombre: s(row.nombre), vigente: s(row.vigente_desde).slice(0, 10), sueldo: s(row.sueldo), bono: s(row.bono),
    iess: pct > 1 ? s(pct) : String(Math.round(pct * 10000) / 100),
    fondo: row.fondo === true || s(row.fondo).toUpperCase() === "SI" ? "SI" : "",
    fondoDesde: s(row.fondo_desde).slice(0, 10),
    vacaciones: row.vacaciones_desde_anio == null || row.vacaciones_desde_anio === "" ? "1" : s(row.vacaciones_desde_anio),
  };
}

function pagoRow(campos: Row, base: Row | null): Row | { error: string } {
  const nombre = campos.nombre != null ? s(campos.nombre) : s(base?.nombre);
  const vigente = campos.vigente != null ? ymdCampo(campos.vigente) : s(base?.vigente_desde).slice(0, 10);
  if (!nombre || !vigente) return { error: "Falta la persona o la fecha de vigencia" };
  const iessRaw = campos.iess != null ? n(campos.iess) : (base ? n(base.iess_pct) : 0.0945);
  const fondo = campos.fondo != null
    ? (campos.fondo === true || s(campos.fondo).toUpperCase() === "SI" || s(campos.fondo) === "true" || s(campos.fondo) === "1")
    : (base ? base.fondo === true || s(base.fondo).toUpperCase() === "SI" : false);
  return {
    nombre, vigente_desde: vigente,
    sueldo: campos.sueldo != null ? n(campos.sueldo) : n(base?.sueldo),
    bono: campos.bono != null ? n(campos.bono) : n(base?.bono),
    iess_pct: iessRaw > 1 ? iessRaw / 100 : iessRaw,
    fondo,
    fondo_desde: campos.fondoDesde != null ? (ymdCampo(campos.fondoDesde) || "") : s(base?.fondo_desde).slice(0, 10),
    vacaciones_desde_anio: campos.vacaciones != null && s(campos.vacaciones) !== ""
      ? n(campos.vacaciones)
      : (base && base.vacaciones_desde_anio != null && base.vacaciones_desde_anio !== "" ? n(base.vacaciones_desde_anio) : 1),
  };
}

async function guardarPagoFila(ctx: Ctx, ses: Ses, row: Row, prev: Row | null) {
  const todas = await pagosDe(ctx);
  const sin = todas.filter((r) => !(s(r.nombre) === row.nombre && s(r.vigente_desde).slice(0, 10) === s(row.vigente_desde).slice(0, 10)));
  await kvSet(ctx.db, actorOf(ses), "pago_config", { filas: [...sin, row] });
  const tabla = await ctx.db.all("pago_config").catch(() => [] as Row[]);
  const hit = prev && prev.id != null ? tabla.find((r) => r.id === prev.id) : tabla.find((r) => s(r.nombre) === row.nombre && s(r.vigente_desde).slice(0, 10) === s(row.vigente_desde).slice(0, 10));
  if (hit) return ctx.db.write(actorOf(ses), "pago_config", "update", hit.id != null ? { id: hit.id } : { nombre: row.nombre, vigente_desde: row.vigente_desde }, row);
  return ctx.db.write(actorOf(ses), "pago_config", "insert", {}, row);
}

export async function guardarPagoCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  if (ses.prueba) return { error: "Modo prueba no cambia la configuración real" };
  const rows = await pagosDe(ctx);
  if (!fila || fila === "nuevo") {
    const row = pagoRow(campos, null);
    if ("error" in row) return row;
    const saved = await guardarPagoFila(ctx, ses, row, null);
    if (saved) await anotar(ctx, ses, "pago_config", pagoClave(saved), "INSERT", null, vistaPago(saved));
    return saved ? { ok: true, fila: pagoClave(saved) } : { error: "No se pudo guardar" };
  }
  const prev = rows.find((r) => pagoClave(r) === fila || s(r.id) === fila);
  if (!prev) return { error: "Configuración no encontrada" };
  const row = pagoRow(campos, prev);
  if ("error" in row) return row;
  const saved = await guardarPagoFila(ctx, ses, row, prev);
  if (!saved) return { error: "No se pudo guardar la configuración" };
  await anotar(ctx, ses, "pago_config", pagoClave(saved), "UPDATE", vistaPago(prev), vistaPago(saved));
  return { ok: true, fila: pagoClave(saved) };
}

export async function borrarPago(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  if (ses.prueba) return { error: "Modo prueba no cambia la configuración real" };
  const rows = await pagosDe(ctx);
  const prev = rows.find((r) => pagoClave(r) === fila || s(r.id) === fila);
  if (!prev) return { error: "Configuración no encontrada" };
  const queda = rows.filter((r) => pagoClave(r) !== pagoClave(prev));
  await kvSet(ctx.db, actorOf(ses), "pago_config", { filas: queda });
  const tabla = await ctx.db.all("pago_config").catch(() => [] as Row[]);
  const hit = tabla.find((r) => (prev.id != null && r.id === prev.id) || (s(r.nombre) === s(prev.nombre) && s(r.vigente_desde).slice(0, 10) === s(prev.vigente_desde).slice(0, 10)));
  if (hit) {
    const saved = await ctx.db.write(actorOf(ses), "pago_config", "delete", hit.id != null ? { id: hit.id } : { nombre: hit.nombre, vigente_desde: hit.vigente_desde }, null);
    if (!saved) return { error: "No se pudo eliminar" };
  }
  await anotar(ctx, ses, "pago_config", pagoClave(prev), "DELETE", vistaPago(prev), null);
  return { ok: true };
}

const ROLES_ACCESO = ["cosmetologa", "asistente_cosmetologia", "recepcion", "gerente"];

function siBloqueado(v: unknown): boolean {
  const t = s(v).toLowerCase();
  return v === true || t === "si" || t === "sí" || t === "true" || t === "1";
}

function idUsuario(nombre: string, rows: Row[]): string {
  const base = s(nombre).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "").slice(0, 24) || "user";
  let id = base;
  let i = 2;
  while (rows.some((r) => String(r.id) === id)) { id = base + String(i); i++; }
  return id;
}

function vistaUsuario(row: Row): Row {
  return {
    nombre: s(row.nombre || row.name), short: s(row.short),
    rol: normalizarRol(s(row.rol || row.role)), bloqueado: row.bloqueado ? "sí" : "no",
  };
}

function cuentaProtegida(row: Row): boolean {
  return s(row.id) === "efch" || normalizarRol(s(row.rol || row.role)) === "super_admin";
}

async function usuariosDe(ctx: Ctx): Promise<{ tabla: string; rows: Row[] }> {
  const app = await ctx.db.all("app_usuarios").catch(() => [] as Row[]);
  if (app.length) return { tabla: "app_usuarios", rows: app };
  const legacy = await ctx.db.all("usuarios").catch(() => [] as Row[]);
  return { tabla: legacy.length ? "usuarios" : "app_usuarios", rows: legacy };
}

function rolPermitido(ses: Ses, rol: string): string | null {
  const r = normalizarRol(rol);
  if (!ROLES.includes(r as typeof ROLES[number])) return "Rol inválido";
  if ((r === "admin" || r === "super_admin") && normalizarRol(ses.rol) !== "super_admin") return "Solo la mega admin asigna admin";
  return null;
}

export async function guardarUsuarioCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  const { tabla, rows } = await usuariosDe(ctx);
  if (!fila || fila === "nuevo") {
    const nombre = s(campos.nombre);
    if (!nombre) return { error: "El nombre es obligatorio" };
    const rol = normalizarRol(s(campos.rol) || "recepcion");
    const malo = rolPermitido(ses, rol);
    if (malo) return { error: malo };
    const id = idUsuario(s(campos.short) || nombre, rows);
    const rec: Row = {
      id, nombre, short: s(campos.short) || nombre.split(" ")[0], rol, color: "#5B7FA6",
      bloqueado: siBloqueado(campos.bloqueado), pin_reset: true,
    };
    const saved = await ctx.db.write(actorOf(ses), tabla, "insert", {}, rec);
    if (!saved) return { error: "No se pudo guardar" };
    await anotar(ctx, ses, tabla, id, "INSERT", null, vistaUsuario(saved));
    return { ok: true, fila: id };
  }
  const row = rows.find((r) => s(r.id) === fila);
  if (!row) return { error: "Usuario no encontrado" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  if (cuentaProtegida(row) && normalizarRol(ses.rol) !== "super_admin") return { error: "Esa cuenta no se edita desde aquí" };
  const patch: Row = {};
  if (campos.nombre != null) {
    if (!s(campos.nombre)) return { error: "El nombre es obligatorio" };
    patch.nombre = s(campos.nombre);
  }
  if (campos.short != null) patch.short = s(campos.short);
  if (campos.rol != null) {
    const rol = normalizarRol(s(campos.rol));
    const malo = rolPermitido(ses, rol);
    if (malo) return { error: malo };
    if (s(row.id) === "efch" && rol !== "super_admin") return { error: "El admin_master no cambia de rol" };
    patch.rol = rol;
  }
  if (campos.bloqueado != null) {
    if (s(row.id) === "efch" && siBloqueado(campos.bloqueado)) return { error: "El admin_master no se puede bloquear" };
    patch.bloqueado = siBloqueado(campos.bloqueado);
  }
  if (!Object.keys(patch).length) return { error: "Nada que guardar" };
  const antes = vistaUsuario(row);
  const saved = await ctx.db.write(actorOf(ses), tabla, "update", { id: row.id }, patch);
  if (!saved) return { error: "No se pudo guardar el usuario" };
  if (patch.bloqueado === true) {
    for (const tk of await ctx.db.all("sesiones").catch(() => [] as Row[])) {
      if (String(tk.uid) === String(row.id)) await ctx.db.write(actorOf(ses), "sesiones", "delete", { token: tk.token }, null);
    }
  }
  await anotar(ctx, ses, tabla, s(row.id), "UPDATE", antes, vistaUsuario(saved));
  return { ok: true, fila: s(row.id) };
}

export async function borrarUsuario(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const { tabla, rows } = await usuariosDe(ctx);
  const row = rows.find((r) => s(r.id) === fila);
  if (!row) return { error: "Usuario no encontrado" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  if (s(row.id) === ses.uid) return { error: "No puedes eliminar tu propia cuenta" };
  if (cuentaProtegida(row)) return { error: "Esa cuenta no se elimina" };
  const antes = vistaUsuario(row);
  const saved = await ctx.db.write(actorOf(ses), tabla, "delete", { id: row.id }, null);
  if (!saved) return { error: "No se pudo eliminar" };
  for (const tk of await ctx.db.all("sesiones").catch(() => [] as Row[])) {
    if (String(tk.uid) === String(row.id)) await ctx.db.write(actorOf(ses), "sesiones", "delete", { token: tk.token }, null);
  }
  await anotar(ctx, ses, tabla, s(row.id), "DELETE", antes, null);
  return { ok: true };
}

function partirAcceso(fila: string): { rol: string; modulo: string } | null {
  const i = fila.indexOf("|");
  if (i <= 0) return null;
  return { rol: fila.slice(0, i), modulo: fila.slice(i + 1) };
}

export async function guardarAccesoCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  const partes = partirAcceso(fila);
  const rol = normalizarRol(partes ? partes.rol : s(campos.rol));
  const modulo = partes ? partes.modulo : s(campos.modulo);
  const acc = s(campos.acceso);
  if (!ROLES_ACCESO.includes(rol)) return { error: "Rol no editable" };
  if (!MODULOS.includes(modulo as typeof MODULOS[number]) || modulo === "permisos") return { error: "Ese permiso no se puede delegar" };
  if (!["no", "propio", "todos"].includes(acc)) return { error: "Acceso inválido" };
  if (modulo === "ver_costos" && acc !== "no") return { error: "Los costos solo los ven admin y super_admin" };
  const clave = rol + "|" + modulo;
  const rows = await ctx.db.all("app_modulos").catch(() => [] as Row[]);
  const hit = rows.find((r) => normalizarRol(s(r.rol)) === rol && s(r.modulo) === modulo);
  const antes = hit ? { rol, modulo, acceso: s(hit.acceso) } : null;
  if (hit) await ctx.db.write(actorOf(ses), "app_modulos", "update", { rol: hit.rol, modulo: hit.modulo }, { acceso: acc });
  else await ctx.db.write(actorOf(ses), "app_modulos", "insert", {}, { rol, modulo, acceso: acc });
  await anotar(ctx, ses, "app_modulos", clave, hit ? "UPDATE" : "INSERT", antes, { rol, modulo, acceso: acc });
  return { ok: true, fila: clave };
}

export async function borrarAcceso(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const partes = partirAcceso(fila);
  if (!partes) return { error: "Celda no encontrada" };
  const rol = normalizarRol(partes.rol);
  const rows = await ctx.db.all("app_modulos").catch(() => [] as Row[]);
  const hit = rows.find((r) => normalizarRol(s(r.rol)) === rol && s(r.modulo) === partes.modulo);
  if (!hit) return { error: "Esa celda ya usa el acceso de fábrica" };
  const saved = await ctx.db.write(actorOf(ses), "app_modulos", "delete", { rol: hit.rol, modulo: hit.modulo }, null);
  if (!saved) return { error: "No se pudo quitar" };
  await anotar(ctx, ses, "app_modulos", rol + "|" + partes.modulo, "DELETE", { rol, modulo: partes.modulo, acceso: s(hit.acceso) }, null);
  return { ok: true };
}

export async function guardarLugarCampos(ctx: Ctx, ses: Ses, fila: string, campos: Row): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin edita directo" };
  const actor = actorOf(ses);
  if (!fila || fila === "nuevo") {
    const tipo = s(campos.tipo) || "cabina";
    const out = await runErp("lugar_guardar", {
      tipo, nombre: s(campos.nombre), direccion: s(campos.direccion), local_id: s(campos.local), _rol: ses.rol,
    }, ctx.db, actor, ctx.now);
    if (out.error) return out;
    const id = s(out.id);
    const clave = (tipo === "local" ? "L:" : "B:") + id;
    await anotar(ctx, ses, tipo === "local" ? "erp_locales" : "erp_bodegas", id, "INSERT", null, { nombre: s(campos.nombre), tipo, direccion: s(campos.direccion) });
    return { ok: true, fila: clave };
  }
  const local = fila.startsWith("L:");
  const id = fila.slice(2);
  const tabla = local ? "erp_locales" : "erp_bodegas";
  const rows = await ctx.db.all(tabla);
  const row = rows.find((r) => s(r.id) === id);
  if (!row) return { error: "Lugar no encontrado" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  const antes = { nombre: s(row.nombre), direccion: s(row.direccion), tipo: s(row.tipo) };
  if (local) {
    const out = await runErp("lugar_guardar", {
      id, tipo: "local", nombre: campos.nombre != null ? s(campos.nombre) : s(row.nombre),
      direccion: campos.direccion != null ? s(campos.direccion) : s(row.direccion), _rol: ses.rol,
    }, ctx.db, actor, ctx.now);
    if (out.error) return out;
  } else {
    if (!s(campos.nombre) && campos.nombre != null) return { error: "Falta el nombre" };
    const out = await runErp("lugar_guardar", {
      id, tipo: s(row.tipo), local_id: s(row.local_id), nombre: campos.nombre != null ? s(campos.nombre) : s(row.nombre), _rol: ses.rol,
    }, ctx.db, actor, ctx.now);
    if (out.error) return out;
  }
  const saved = (await ctx.db.all(tabla)).find((r) => s(r.id) === id) || row;
  await anotar(ctx, ses, tabla, id, "UPDATE", antes, { nombre: s(saved.nombre), direccion: s(saved.direccion), tipo: s(saved.tipo) });
  return { ok: true, fila };
}

export async function borrarLugar(ctx: Ctx, ses: Ses, fila: string): Promise<Row> {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina" };
  const local = fila.startsWith("L:");
  const id = fila.startsWith("L:") || fila.startsWith("B:") ? fila.slice(2) : fila;
  const tabla = local ? "erp_locales" : "erp_bodegas";
  const rows = await ctx.db.all(tabla);
  const row = rows.find((r) => s(r.id) === id && r.activo !== false);
  if (!row) return { error: "Lugar no encontrado" };
  const bloqueo = bloqueoPrueba(ses, row);
  if (bloqueo) return { error: bloqueo };
  if (!local && (s(row.tipo) === "casa" || s(row.codigo) === "CASA")) return { error: "Casa se renombra, no se elimina" };
  if (local) {
    const bodegas = await ctx.db.all("erp_bodegas");
    if (bodegas.some((b) => s(b.local_id) === id && b.activo !== false)) return { error: "Ese local todavía tiene cabinas. Quítalas primero." };
  }
  const antes = { nombre: s(row.nombre), tipo: s(row.tipo), activo: true };
  const saved = await ctx.db.write(actorOf(ses), tabla, "update", { id: row.id }, { activo: false });
  if (!saved || saved.activo !== false) return { error: "No se pudo eliminar" };
  await anotar(ctx, ses, tabla, id, "DELETE", antes, { nombre: s(row.nombre), activo: false });
  return { ok: true };
}

extend("config_general", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración configura esto" };
  return { ok: true, ...(await vistaConfig(ctx)) };
});

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
  if (s(p.tabla) === "permisos") return guardarPermisoCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "multas") return guardarMultaCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "horarios") return guardarHorarioCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "asistencia") return guardarAsistenciaCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "feriados") return guardarFeriadoCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "pago_config") return guardarPagoCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla).startsWith("com_")) return guardarComisionCampos(ctx, ses, s(p.tabla), s(p.fila), campos);
  if (s(p.tabla) === "usuarios") return guardarUsuarioCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "acceso") return guardarAccesoCampos(ctx, ses, s(p.fila), campos);
  if (s(p.tabla) === "lugares") return guardarLugarCampos(ctx, ses, s(p.fila), campos);
  return { error: "Esa tabla todavía no se edita en línea" };
});

extend("inline_borrar", "any", async (p, ctx, ses) => {
  if (s(p.tabla) === "clientes") return borrarClienteSuave(ctx, ses, s(p.fila));
  if (s(p.tabla) === "catalogo" || s(p.tabla) === "inventario") return borrarCatalogoSuave(ctx, ses, s(p.fila));
  if (s(p.tabla) === "proveedores") return borrarProveedor(ctx, ses, s(p.fila));
  if (s(p.tabla) === "compras") return borrarCompra(ctx, ses, s(p.fila));
  if (s(p.tabla) === "gift_cards") return borrarGiftSuave(ctx, ses, s(p.fila));
  if (s(p.tabla) === "paquetes") return borrarPaqueteSuave(ctx, ses, s(p.fila));
  if (s(p.tabla) === "permisos") return borrarPermisoSuave(ctx, ses, s(p.fila));
  if (s(p.tabla) === "multas") return borrarMultaSuave(ctx, ses, s(p.fila));
  if (s(p.tabla) === "horarios") return borrarHorarioSuave(ctx, ses, s(p.fila));
  if (s(p.tabla) === "asistencia") return anularMarca(ctx, ses, s(p.fila), s(p.motivo));
  if (s(p.tabla) === "feriados") return borrarFeriado(ctx, ses, s(p.fila));
  if (s(p.tabla) === "pago_config") return borrarPago(ctx, ses, s(p.fila));
  if (s(p.tabla).startsWith("com_")) return borrarComision(ctx, ses, s(p.tabla), s(p.fila));
  if (s(p.tabla) === "usuarios") return borrarUsuario(ctx, ses, s(p.fila));
  if (s(p.tabla) === "acceso") return borrarAcceso(ctx, ses, s(p.fila));
  if (s(p.tabla) === "lugares") return borrarLugar(ctx, ses, s(p.fila));
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
  if (tabla === "permisos") {
    const row = await permisoDe(ctx, fila);
    if (!row) return { error: "Permiso no encontrado" };
    if (!(await veModulo(ctx, ses, "asistencia")) || !esPropio(s(row.empleada), ses)) return { error: "No tienes permiso para pedir un cambio de ese permiso" };
    return { row, antes: vistaPermiso(row) };
  }
  if (tabla === "multas") {
    const row = await multaDe(ctx, fila);
    if (!row) return { error: "Multa no encontrada" };
    if (!(await veModulo(ctx, ses, "asistencia")) || !esPropio(s(row.cosmetologa), ses)) return { error: "No tienes permiso para pedir un cambio de esa multa" };
    return { row, antes: vistaMulta(row) };
  }
  if (tabla === "horarios") {
    const prev = (await cargarHorarios(ctx)).horarios.find((h) => h.id === fila);
    if (!prev) return { error: "Horario no encontrado" };
    if (!(await veModulo(ctx, ses, "asistencia"))) return { error: "No tienes permiso para pedir un cambio de ese horario" };
    return { row: { id: prev.id, nombre: prev.nombre }, antes: { nombre: prev.nombre, arreglo: prev.arreglo, horasSemana: prev.horasSemana || "" } };
  }
  if (tabla === "asistencia") {
    const row = await marcaDe(ctx, fila);
    if (!row || row.anulado === true) return { error: "Marca no encontrada" };
    if (!(await veModulo(ctx, ses, "asistencia")) || !esPropio(s(row.nombre), ses)) return { error: "No tienes permiso para pedir un cambio de esa marca" };
    return { row, antes: vistaMarca(row) };
  }
  if (tabla === "feriados") {
    const row = await feriadoDe(ctx, fila);
    if (!row) return { error: "Feriado no encontrado" };
    if (!(await veModulo(ctx, ses, "asistencia"))) return { error: "No tienes permiso para pedir un cambio de ese feriado" };
    return { row, antes: { fecha: s(row.fecha).slice(0, 10), nombre: s(row.nombre) } };
  }
  if (tabla === "pago_config") {
    const row = (await pagosDe(ctx)).find((r) => pagoClave(r) === fila || s(r.id) === fila);
    if (!row) return { error: "Configuración no encontrada" };
    if (!(await veModulo(ctx, ses, "rol_pagos")) || !esPropio(s(row.nombre), ses)) return { error: "No tienes permiso para pedir un cambio de esa configuración" };
    return { row, antes: vistaPago(row) };
  }
  if (tabla === "usuarios") {
    const { rows } = await usuariosDe(ctx);
    const row = rows.find((r) => s(r.id) === fila);
    if (!row) return { error: "Usuario no encontrado" };
    if (cuentaProtegida(row)) return { error: "Esa cuenta no se toca con una solicitud" };
    return { row, antes: vistaUsuario(row) };
  }
  if (tabla === "acceso") {
    const partes = partirAcceso(fila);
    if (!partes) return { error: "Celda no encontrada" };
    const rol = normalizarRol(partes.rol);
    const rows = await ctx.db.all("app_modulos").catch(() => [] as Row[]);
    const hit = rows.find((r) => normalizarRol(s(r.rol)) === rol && s(r.modulo) === partes.modulo);
    const efectivo = hit ? s(hit.acceso) : acceso(rol, partes.modulo, await matrizDe(ctx.db));
    return { row: { rol, modulo: partes.modulo, acceso: efectivo }, antes: { rol, modulo: partes.modulo, acceso: efectivo } };
  }
  if (tabla === "lugares") {
    if (!(await veModulo(ctx, ses, "inventario"))) return { error: "No tienes permiso para pedir un cambio de ese lugar" };
    const local = fila.startsWith("L:");
    const id = fila.startsWith("L:") || fila.startsWith("B:") ? fila.slice(2) : fila;
    const row = (await ctx.db.all(local ? "erp_locales" : "erp_bodegas")).find((r) => s(r.id) === id && r.activo !== false);
    if (!row) return { error: "Lugar no encontrado" };
    return { row, antes: { nombre: s(row.nombre), direccion: s(row.direccion), tipo: s(row.tipo) } };
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
  if (tabla === "permisos") return borrar ? borrarPermisoSuave(ctx, ses, fila) : guardarPermisoCampos(ctx, ses, fila, propuestos);
  if (tabla === "multas") return borrar ? borrarMultaSuave(ctx, ses, fila) : guardarMultaCampos(ctx, ses, fila, propuestos);
  if (tabla === "horarios") return borrar ? borrarHorarioSuave(ctx, ses, fila) : guardarHorarioCampos(ctx, ses, fila, propuestos);
  if (tabla === "asistencia") {
    const motivo = s(propuestos.motivo) || s(row.motivo);
    return borrar ? anularMarca(ctx, ses, fila, motivo) : guardarAsistenciaCampos(ctx, ses, fila, { ...propuestos, motivo });
  }
  if (tabla === "feriados") return borrar ? borrarFeriado(ctx, ses, fila) : guardarFeriadoCampos(ctx, ses, fila, propuestos);
  if (tabla === "pago_config") return borrar ? borrarPago(ctx, ses, fila) : guardarPagoCampos(ctx, ses, fila, propuestos);
  if (tabla === "usuarios") return borrar ? borrarUsuario(ctx, ses, fila) : guardarUsuarioCampos(ctx, ses, fila, propuestos);
  if (tabla === "acceso") return borrar ? borrarAcceso(ctx, ses, fila) : guardarAccesoCampos(ctx, ses, fila, propuestos);
  if (tabla === "lugares") return borrar ? borrarLugar(ctx, ses, fila) : guardarLugarCampos(ctx, ses, fila, propuestos);
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
  const cosa = tabla === "clientes" ? "una clienta" : tabla === "catalogo" || tabla === "inventario" ? "un producto" : tabla === "proveedores" ? "un proveedor" : tabla === "compras" ? "una línea de compra" : tabla === "gift_cards" ? "una gift card" : tabla === "paquetes" ? "un paquete" : tabla === "permisos" ? "un permiso" : tabla === "multas" ? "una multa" : tabla === "horarios" ? "un horario" : tabla === "asistencia" ? "una marca" : tabla === "feriados" ? "un feriado" : tabla === "pago_config" ? "una configuración de pago" : tabla === "usuarios" ? "un usuario" : tabla === "acceso" ? "un acceso" : tabla === "lugares" ? "un lugar" : "un ticket";
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
