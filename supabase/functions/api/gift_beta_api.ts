// Gift cards estilo MineCore (Emilia 17/11, TK20): lista con estados, detalle con comprador / para / de /
// servicio / validez / tickets, vender con el siguiente código único, marcar uso con confirmación,
// edición y baja admin, y el PDF de la gift card guardado en Documentos (bucket «cliente-documentos»).
// Venta y uso se escriben en gift_cards (lo lee el resto del sistema); lo nuevo en beta_gift_ajustes.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion, nextSheet } from "./lib.ts";
import { acceso, esAdmin, matrizDe } from "./permisos.ts";
import { ecuadorParts, normCedula, normNombre, s, type Row } from "./domain.ts";
import { consultar } from "./query.ts";
import { SOLICITUD_HOOKS } from "./inline_api.ts";
import { ETQ_ESTADO, codigoTomado, estadoGift, fechaVenta, leerNotas, normCod, ordenCodigo, repetidos, siguienteGift, usadaGift, validoPorDefecto, vendidaGift } from "./gift_beta.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const hoyDe = (ctx: Ctx) => ecuadorParts(ctx.now).ymd;
const yyDe = (ctx: Ctx) => String(ecuadorParts(ctx.now).y).slice(-2);
async function nivel(ctx: Ctx, ses: Ses): Promise<"todos" | "propio" | "no"> {
  if (esAdmin(ses.rol)) return "todos";
  const a = acceso(ses.rol, "gift_cards", await matrizDe(ctx.db));
  return a === "no" ? "no" : a === "todos" ? "todos" : "propio";
}
async function ajustesMap(ctx: Ctx): Promise<Map<string, Row>> { return new Map((await todas(ctx, "beta_gift_ajustes")).map((a) => [String(a.gift_id), a])); }
async function digitalesMap(ctx: Ctx): Promise<Map<string, Row>> { return new Map((await todas(ctx, "gift_cards_digitales")).map((d) => [normCod(d.codigo), d])); }
function visibles(rows: Row[], ses: Ses): Row[] { return rows.filter((r) => (ses.prueba ? true : s(r.origin) !== "test")); }

function vista(r: Row, aj: Row | undefined, dig: Row | undefined, rep: Set<string>, hoy: string, admin: boolean): Row {
  const nt = leerNotas(r.notas);
  const comprador = (s(r.nombre_comprador) + " " + s(r.apellido_comprador)).trim();
  const est = estadoGift(r, aj, hoy);
  const v: Row = {
    id: r.id, fila: r.sheet_row, codigo: s(r.codigo_gc).trim(), repetido: rep.has(normCod(r.codigo_gc)),
    estado: est, estadoTxt: ETQ_ESTADO[est], fechaVenta: fechaVenta(r),
    comprador, nombre: s(r.nombre_comprador), apellido: s(r.apellido_comprador), cedula: normCedula(r.cedula_comprador) || s(r.cedula_comprador),
    para: s(aj?.para) || s(dig?.para) || nt.para, de: s(aj?.de) || s(dig?.de) || nt.de || comprador,
    servicio: s(aj?.servicio) || s(dig?.facial) || nt.servicio, mensaje: s(aj?.mensaje) || s(dig?.mensaje),
    validoHasta: s(aj?.valido_hasta).slice(0, 10), validoTxt: s(dig?.valido),
    factura: s(r.factura).replace(/\.0+$/, ""), sku: s(r.sku), valor: s(r.valor), notas: s(r.notas),
    usado: usadaGift(r), fechaUso: s(r.fecha_uso).slice(0, 10), usadoPor: s(r.usado_por),
    ticketVenta: s(aj?.ticket_venta), ticketUso: s(aj?.ticket_uso), prueba: s(r.origin) === "test", beta: s(r.origin) === "beta",
  };
  if (!admin) delete v.notas;
  return v;
}
async function filaGift(ctx: Ctx, id: unknown): Promise<Row | null> {
  const x = s(id).trim(); if (!x) return null;
  const rows = await todas(ctx, "gift_cards");
  if (/^\d+$/.test(x)) return rows.find((r) => String(r.id) === x) || null;
  const hits = rows.filter((r) => !r.borrado_at && normCod(r.codigo_gc) === normCod(x));
  return hits.length === 1 ? hits[0] : null;
}
async function guardarAjuste(ctx: Ctx, ses: Ses, r: Row, patch: Row, accion: string, detalle: string) {
  const prev = (await consultar(ctx.db, "beta_gift_ajustes", { filtros: [{ col: "gift_id", op: "eq", val: Number(r.id) }] }).catch(() => ({ rows: [] as Row[] }))).rows[0];
  const hist = Array.isArray(prev?.historial) ? (prev!.historial as Row[]).slice(-60) : [];
  hist.push({ fecha: ecuadorParts(ctx.now).isoWall, actor: ses.name, accion, detalle });
  const row = { ...patch, codigo: s(r.codigo_gc).trim(), historial: hist, updated_at: ctx.now.toISOString() };
  if (prev) await ctx.db.write(actorOf(ses), "beta_gift_ajustes", "update", { gift_id: Number(r.id) }, row);
  else await ctx.db.write(actorOf(ses), "beta_gift_ajustes", "insert", {}, { gift_id: Number(r.id), ...row });
  await logAccion(ctx.db, actorOf(ses), "GC " + accion, s(r.codigo_gc) + (detalle ? " · " + detalle : ""));
}
function bloqueo(ses: Ses, r: Row): string | null { return ses.prueba && s(r.origin) !== "test" ? "Modo prueba no cambia gift cards reales" : null; }

extend("gcb_lista", "any", async (p, ctx, ses) => {
  if (await nivel(ctx, ses) === "no") return { error: "No tienes permiso" };
  const admin = esAdmin(ses.rol), hoy = hoyDe(ctx);
  const rows0 = visibles(await todas(ctx, "gift_cards"), ses).filter((r) => s(r.codigo_gc).trim());
  const [aj, dig] = [await ajustesMap(ctx), await digitalesMap(ctx)];
  const rep = repetidos(rows0);
  const all = rows0.filter((r) => !r.borrado_at).sort(ordenCodigo).map((r) => vista(r, aj.get(String(r.id)), dig.get(normCod(r.codigo_gc)), rep, hoy, admin));
  const cuenta: Row = { vigentes: 0, usadas: 0, vencidas: 0, disponibles: 0, todas: 0 };
  for (const v of all) { if (v.estado === "disponible") cuenta.disponibles = Number(cuenta.disponibles) + 1; else { cuenta.todas = Number(cuenta.todas) + 1; const k = v.estado === "vigente" ? "vigentes" : v.estado === "usada" ? "usadas" : "vencidas"; cuenta[k] = Number(cuenta[k]) + 1; } }
  const est = s(p.estado) || "vigentes";
  const q = normNombre(s(p.q) === "*" ? "" : s(p.q));
  const lista = all.filter((v) => {
    if (est === "vigentes" && v.estado !== "vigente") return false;
    if (est === "usadas" && v.estado !== "usada") return false;
    if (est === "vencidas" && v.estado !== "vencida") return false;
    if (est === "disponibles" && v.estado !== "disponible") return false;
    if (est === "todas" && v.estado === "disponible") return false;
    if (!q) return true;
    const blob = normNombre([v.codigo, v.comprador, v.cedula, v.para, v.de, v.servicio, v.factura, v.usadoPor, v.ticketVenta, v.ticketUso].join(" "));
    return q.split(/\s+/).every((w) => blob.includes(w));
  });
  const off = Math.max(0, Number(p.offset) || 0), lim = Math.min(200, Math.max(1, Number(p.limit) || 50));
  return { ok: true, items: lista.slice(off, off + lim), total: lista.length, cuenta, admin, puedeVender: true, siguiente: siguienteGift(rows0, yyDe(ctx)).codigo };
});

extend("gcb_get", "any", async (p, ctx, ses) => {
  if (await nivel(ctx, ses) === "no") return { error: "No tienes permiso" };
  const r = await filaGift(ctx, p.id);
  if (!r || (r.borrado_at && !esAdmin(ses.rol))) return { error: "Gift card no encontrada" };
  const rows = await todas(ctx, "gift_cards");
  const aj = (await ajustesMap(ctx)).get(String(r.id));
  const dig = (await digitalesMap(ctx)).get(normCod(r.codigo_gc));
  const admin = esAdmin(ses.rol);
  const v = vista(r, aj, dig, repetidos(rows), hoyDe(ctx), admin);
  v.historial = Array.isArray(aj?.historial) ? aj!.historial : [];
  // Tickets donde se vendió / se usó (columnas venta_gift / gift_card del ticket).
  const cod = s(r.codigo_gc).trim();
  if (cod && (!v.ticketVenta || !v.ticketUso)) {
    const tks = (await todas(ctx, "tickets")).filter((t) => !t.borrado_at && (s(t.venta_gift).includes(cod) || s(t.gift_card).includes(cod)));
    const clave = (t: Row) => s(t.so_num) || s(t.beta_num) || (t.sheet_row != null ? "TK-" + t.sheet_row : "");
    if (!v.ticketVenta) { const t = tks.find((t) => s(t.venta_gift).includes(cod)); if (t) v.ticketVenta = clave(t); }
    if (!v.ticketUso) { const t = tks.find((t) => s(t.gift_card).includes(cod)); if (t) v.ticketUso = clave(t); }
  }
  const docs = (await todas(ctx, "beta_gift_documentos")).filter((d) => String(d.gift_id) === String(r.id))
    .sort((a, b) => s(b.created_at).localeCompare(s(a.created_at))).map((d) => ({ id: s(d.id), nombre: s(d.nombre), fecha: s(d.created_at), por: s(d.creado_por), bytes: Number(d.bytes) || 0 }));
  const personas = (await todas(ctx, "usuarios")).filter((u) => s(u.nombre) && u.bloqueado !== true).map((u) => s(u.nombre));
  return { ok: true, item: v, documentos: docs, admin, puedeEditar: admin, puedePedir: !admin && !r.borrado_at, puedeUsar: !v.usado && v.estado !== "disponible" && !r.borrado_at, personas, hoy: hoyDe(ctx) };
});

extend("gcb_siguiente", "any", async (_p, ctx, ses) => {
  if (await nivel(ctx, ses) === "no") return { error: "No tienes permiso" };
  return { ok: true, ...siguienteGift(visibles(await todas(ctx, "gift_cards"), ses).filter((r) => s(r.origin) !== "test"), yyDe(ctx)) };
});

extend("gcb_vender", "any", async (p, ctx, ses) => {
  if (await nivel(ctx, ses) === "no") return { error: "No tienes permiso" };
  if (ses.prueba || ctx.db.prueba) return { error: "En modo prueba vende la gift card desde el ticket de prueba" };
  const nombre = s(p.nombre).trim(), apellido = s(p.apellido).trim(), cedula = s(p.cedula).trim();
  if (!nombre) return { error: "Escribe el nombre de quien compra" };
  const servicio = s(p.servicio).trim();
  if (!servicio) return { error: "Elige el facial / servicio de la gift card" };
  const rows = await todas(ctx, "gift_cards");
  const sig = siguienteGift(rows, yyDe(ctx));
  if (s(p.codigo) && normCod(p.codigo) !== normCod(sig.codigo)) return { error: "El código cambió (otra persona vendió " + s(p.codigo) + "). El siguiente es " + sig.codigo + ".", siguiente: sig.codigo };
  const ec = ecuadorParts(ctx.now);
  const para = s(p.para).trim(), de = s(p.de).trim() || (nombre + " " + apellido).trim();
  const notas = [servicio.toUpperCase(), de ? "De: " + de : "", para ? "Para: " + para : ""].filter(Boolean).join(". ") + (s(p.notas).trim() ? ". " + s(p.notas).trim() : "");
  const venta: Row = { dia: ec.d, mes: ec.m, ano: ec.y, nombre_comprador: nombre, apellido_comprador: apellido, cedula_comprador: cedula, factura: s(p.factura).trim(), sku: "SUNSU-35", valor: s(p.valor).trim() || "Gift Card", notas };
  let row: Row | null;
  if (sig.id != null) {
    const fresca = rows.find((r) => String(r.id) === String(sig.id));
    if (!fresca || vendidaGift(fresca)) return { error: "Ese código acaba de venderse. Vuelve a intentar." };
    row = await ctx.db.write(actorOf(ses), "gift_cards", "update", { id: sig.id }, venta);
  } else {
    if (codigoTomado(rows, sig.codigo)) return { error: "El código " + sig.codigo + " ya existe" };
    const sheet_row = await nextSheet(ctx.db, "gift_cards");
    row = await ctx.db.write(actorOf(ses), "gift_cards", "insert", {}, { sheet_row, codigo_gc: sig.codigo, ...venta, usado: false, origin: "beta", orig: { codigo: sig.codigo, beta: true, ts: ec.isoWall } });
  }
  if (!row) return { error: "No se pudo guardar la gift card" };
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(s(p.validoHasta)) ? s(p.validoHasta) : validoPorDefecto(ec.ymd);
  await guardarAjuste(ctx, ses, row, { para, de, servicio, mensaje: s(p.mensaje).trim(), valido_hasta: valido || null, ticket_venta: s(p.ticket).trim() || null }, "VENTA", sig.codigo + " · " + servicio + (para ? " · para " + para : ""));
  return { ok: true, id: row.id, codigo: sig.codigo };
});

extend("gcb_usar", "any", async (p, ctx, ses) => {
  if (await nivel(ctx, ses) === "no") return { error: "No tienes permiso" };
  const r = await filaGift(ctx, p.id);
  if (!r || r.borrado_at) return { error: "Gift card no encontrada" };
  const b = bloqueo(ses, r); if (b) return { error: b };
  if (p.desmarcar === true) {
    if (!esAdmin(ses.rol)) return { error: "Solo un admin desmarca el uso" };
    if (!usadaGift(r)) return { error: "La gift card no está usada" };
    const motivo = s(p.motivo).trim(); if (!motivo) return { error: "Escribe el motivo" };
    await ctx.db.write(actorOf(ses), "gift_cards", "update", { id: r.id }, { usado: false, fecha_uso: "", usado_por: "" });
    await guardarAjuste(ctx, ses, r, { ticket_uso: null }, "DESMARCAR USO", motivo + " (antes: " + s(r.fecha_uso) + " · " + s(r.usado_por) + ")");
    return { ok: true };
  }
  if (usadaGift(r)) return { error: "Esa gift card ya está usada (" + s(r.fecha_uso) + " · " + s(r.usado_por) + ")" };
  if (!vendidaGift(r)) return { error: "Ese código no está vendido" };
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(s(p.fecha)) ? s(p.fecha) : hoyDe(ctx);
  const por = s(p.por).trim() || ses.name, ticket = s(p.ticket).trim();
  await ctx.db.write(actorOf(ses), "gift_cards", "update", { id: r.id }, { usado: true, fecha_uso: fecha, usado_por: por });
  await guardarAjuste(ctx, ses, r, ticket ? { ticket_uso: ticket } : {}, "USO", fecha + " · " + por + (ticket ? " · " + ticket : ""));
  return { ok: true };
});

const CAMPOS_HOJA: [string, string][] = [["nombre", "nombre_comprador"], ["apellido", "apellido_comprador"], ["cedula", "cedula_comprador"], ["factura", "factura"], ["valor", "valor"], ["notas", "notas"]];
const CAMPOS_AJ: [string, string][] = [["para", "para"], ["de", "de"], ["servicio", "servicio"], ["mensaje", "mensaje"], ["validoHasta", "valido_hasta"], ["ticketVenta", "ticket_venta"], ["ticketUso", "ticket_uso"]];
/** Edición de una gift card: solo lo que cambió, con «antes → después» y quién en el historial. */
async function guardarGift(ctx: Ctx, ses: Ses, id: unknown, d0: unknown, via = ""): Promise<Row> {
  const r = await filaGift(ctx, id);
  if (!r || r.borrado_at) return { error: "Gift card no encontrada" };
  const b = bloqueo(ses, r); if (b) return { error: b };
  const d = (d0 && typeof d0 === "object" ? d0 : {}) as Row;
  const rows = await todas(ctx, "gift_cards");
  const aj = (await ajustesMap(ctx)).get(String(r.id));
  const antes = vista(r, aj, undefined, new Set(), hoyDe(ctx), true);
  const hoja: Row = {}, extra: Row = {}, cambios: string[] = [];
  if (d.codigo != null && normCod(d.codigo) !== normCod(r.codigo_gc)) {
    const c = s(d.codigo).trim();
    if (!/^[\w-]{2,20}$/.test(c)) return { error: "Código inválido" };
    if (codigoTomado(rows, c, r.id)) return { error: "El código " + c + " ya existe: los códigos nuevos no se repiten" };
    hoja.codigo_gc = c; cambios.push("código " + s(r.codigo_gc) + " → " + c);
  }
  for (const [k, col] of CAMPOS_HOJA) if (d[k] != null && s(d[k]).trim() !== s(r[col]).trim().replace(/\.0+$/, "")) { hoja[col] = s(d[k]).trim(); cambios.push(k + ": " + (s(r[col]) || "—") + " → " + (s(d[k]).trim() || "—")); }
  if (d.fechaVenta != null && /^\d{4}-\d{2}-\d{2}$/.test(s(d.fechaVenta)) && s(d.fechaVenta) !== antes.fechaVenta) {
    const [y, m, dd] = s(d.fechaVenta).split("-").map(Number); hoja.dia = dd; hoja.mes = m; hoja.ano = y; cambios.push("fecha de venta: " + (s(antes.fechaVenta) || "—") + " → " + s(d.fechaVenta));
  }
  for (const [k, col] of CAMPOS_AJ) {
    if (d[k] == null) continue;
    const nv = s(d[k]).trim(), av = s(aj?.[col]).trim().slice(0, col === "valido_hasta" ? 10 : undefined);
    if (nv === av) continue;
    if (col === "valido_hasta" && nv && !/^\d{4}-\d{2}-\d{2}$/.test(nv)) return { error: "Fecha de validez inválida" };
    extra[col] = nv || null; cambios.push(k + ": " + (av || "—") + " → " + (nv || "—"));
  }
  if (!cambios.length) return { ok: true, sinCambios: true };
  if (Object.keys(hoja).length) await ctx.db.write(actorOf(ses), "gift_cards", "update", { id: r.id }, hoja);
  const r2 = { ...r, ...hoja };
  await guardarAjuste(ctx, ses, r2, extra, "EDITAR", cambios.join(" · ") + (via ? " (" + via + ")" : ""));
  return { ok: true, cambios };
}
extend("gcb_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin guarda directo: envía una solicitud" };
  return guardarGift(ctx, ses, p.id, p.datos);
});

async function borrarGift(ctx: Ctx, ses: Ses, id: unknown, motivo0: unknown): Promise<Row> {
  const r = await filaGift(ctx, id);
  if (!r || r.borrado_at) return { error: "Gift card no encontrada" };
  const b = bloqueo(ses, r); if (b) return { error: b };
  const motivo = s(motivo0).trim(); if (!motivo) return { error: "Escribe el motivo" };
  await ctx.db.write(actorOf(ses), "gift_cards", "update", { id: r.id }, { borrado_at: ctx.now.toISOString(), borrado_por: actorOf(ses) });
  await guardarAjuste(ctx, ses, r, {}, "ELIMINAR", motivo);
  return { ok: true };
}
extend("gcb_borrar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina una gift card: envía una solicitud" };
  return borrarGift(ctx, ses, p.id, p.motivo);
});

// Solicitudes del personal (Emilia 18/11): el cambio queda pendiente hasta que un admin lo aprueba.
const ETQ_GC: Row = { codigo: "Código", nombre: "Nombre", apellido: "Apellido", cedula: "Cédula", para: "Para", de: "De", servicio: "Facial / servicio", valor: "Valor", fechaVenta: "Fecha de venta", validoHasta: "Válido hasta", factura: "Factura", ticketVenta: "Ticket de venta", ticketUso: "Ticket de uso", mensaje: "Mensaje" };
const viaSol = (sol?: Row) => "solicitud" + (sol && s(sol.solicitante) ? " de " + s(sol.solicitante) : "") + " aprobada";
SOLICITUD_HOOKS["gift_beta"] = {
  fila: async (ctx, ses, fila) => {
    if (await nivel(ctx, ses) === "no") return { error: "No tienes permiso" };
    const r = await filaGift(ctx, fila);
    if (!r || r.borrado_at) return { error: "Gift card no encontrada" };
    const v = vista(r, (await ajustesMap(ctx)).get(String(r.id)), undefined, new Set(), hoyDe(ctx), false);
    const antes: Row = {};
    for (const k of Object.keys(ETQ_GC)) antes[k] = s(v[k]);
    antes._campos = ETQ_GC;
    return { row: r, antes, etiqueta: "Gift card " + s(v.codigo) + (s(v.comprador) ? " · " + s(v.comprador) : ""), enlace: "#/m/gift/cards/" + r.id };
  },
  aplicar: (ctx, ses, fila, prop, sol) => {
    const d: Row = {};
    for (const [k, v] of Object.entries(prop || {})) if (k in ETQ_GC) d[k] = v;
    return guardarGift(ctx, ses, fila, d, viaSol(sol));
  },
  borrar: (ctx, ses, fila, motivo, sol) => borrarGift(ctx, ses, fila, (motivo || "sin motivo") + " (" + viaSol(sol) + ")"),
};

// ── PDF de la gift card → Documentos (bucket privado «cliente-documentos», carpeta gift_cards/).
const MAX_PDF = 8 * 1024 * 1024;
function bytesDe(dataUrl: string): Uint8Array | null {
  const m = /^data:application\/pdf;base64,(.+)$/s.exec(dataUrl); if (!m) return null;
  try { const bin = atob(m[1]); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; } catch { return null; }
}
function almacen(ctx: Ctx): { base: string; sk: string } | null {
  const base = s(ctx.env.SUPABASE_URL).replace(/\/$/, ""), sk = s(ctx.env.SUPABASE_SERVICE_ROLE_KEY);
  return base && sk ? { base, sk } : null;
}
const enc = (path: string) => path.split("/").map(encodeURIComponent).join("/");
extend("gcb_pdf_guardar", "any", async (p, ctx, ses) => {
  if (await nivel(ctx, ses) === "no") return { error: "No tienes permiso" };
  const r = await filaGift(ctx, p.id);
  if (!r || r.borrado_at) return { error: "Gift card no encontrada" };
  if (ses.prueba && s(r.origin) !== "test") return { error: "Modo prueba no guarda documentos reales" };
  const pdf = bytesDe(s(p.pdf));
  if (!pdf || pdf.length < 200) return { error: "El PDF no llegó bien" };
  if (pdf.length > MAX_PDF) return { error: "El PDF pesa más de 8 MB" };
  const st = almacen(ctx); if (!st) return { error: "El almacén de documentos no está configurado." };
  const cod = s(r.codigo_gc).trim().replace(/[^\w-]/g, "") || "GC";
  const ec = ecuadorParts(ctx.now);
  const path = `gift_cards/${ec.y}/${cod}_${r.id}_${ctx.now.getTime()}.pdf`;
  const res = await ctx.fetchImpl(`${st.base}/storage/v1/object/cliente-documentos/${enc(path)}`, {
    method: "POST", headers: { authorization: `Bearer ${st.sk}`, apikey: st.sk, "content-type": "application/pdf", "x-upsert": "false" }, body: pdf as unknown as BodyInit,
  });
  if (!res.ok) return { error: "No se pudo subir el PDF (" + res.status + ")" };
  const nombre = "Certificado de regalo GIFT CARD SUNSU " + cod + ".pdf";
  const doc = await ctx.db.write(actorOf(ses), "beta_gift_documentos", "insert", {}, { gift_id: Number(r.id), codigo: s(r.codigo_gc).trim(), storage_path: path, bytes: pdf.length, nombre, creado_por: ses.name });
  await guardarAjuste(ctx, ses, r, {}, "PDF", nombre);
  return { ok: true, id: s(doc?.id), nombre };
});
/** Link firmado (10 min) de un PDF de gift card. */
export async function urlGiftDoc(ctx: Ctx, id: string, descargar: boolean): Promise<Row> {
  const d = (await consultar(ctx.db, "beta_gift_documentos", { filtros: [{ col: "id", op: "eq", val: id }] }).catch(() => ({ rows: [] as Row[] }))).rows[0];
  if (!d) return { error: "No encontré ese documento" };
  const st = almacen(ctx); if (!st) return { error: "El almacén de documentos no está configurado." };
  const res = await ctx.fetchImpl(`${st.base}/storage/v1/object/sign/cliente-documentos/${enc(s(d.storage_path))}`, {
    method: "POST", headers: { authorization: `Bearer ${st.sk}`, apikey: st.sk, "content-type": "application/json" }, body: JSON.stringify({ expiresIn: 600 }),
  });
  let data: Row = {}; try { data = await res.json() as Row; } catch { data = {}; }
  const signed = s(data.signedURL || data.signedUrl);
  if (!res.ok || !signed) return { error: "No se pudo abrir el PDF" };
  let url = signed.startsWith("http") ? signed : `${st.base}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`;
  if (descargar) url += (url.includes("?") ? "&" : "?") + "download=" + encodeURIComponent(s(d.nombre) || "giftcard.pdf");
  return { ok: true, url, nombre: s(d.nombre), giftId: d.gift_id };
}
extend("gcb_doc_url", "any", async (p, ctx, ses) => {
  if (await nivel(ctx, ses) === "no") return { error: "No tienes permiso" };
  return urlGiftDoc(ctx, s(p.id), p.descargar === true);
});
