// Paquetes estilo MineCore (Emilia 17/11): lista paginada, detalle con sesiones (fecha / ticket / cosmetóloga),
// marcar sesión con confirmación (también desde Clientes › Paquetes), edición admin inline y baja con motivo.
// Las marcas van a `paquetes` (las lee el resto del sistema); lo demás vive en beta_paquete_ajustes.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin, acceso, esPropio, matrizDe } from "./permisos.ts";
import { ecuadorParts, n, normCedula, s, USO_FIELDS, ymdUtc, type Row } from "./domain.ts";
import { consultar, type Filtro } from "./query.ts";
import { textoUso, vistaPaquete } from "./paquetes_beta.ts";
import { origConMarca } from "./handlers.ts";
import { SOLICITUD_HOOKS } from "./inline_api.ts";

const COLS = ["id", "sheet_row", "codigo", "beta_codigo", "cedula", "nombres", "apellidos", "sku", "paquete", "vendido_por", "dia", "mes", "ano", "completo", "notas", "orig", "borrado_at",
  ...USO_FIELDS.flatMap(([u, f]) => [u, f])];
async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
async function ajustes(ctx: Ctx): Promise<Map<string, Row>> {
  return new Map((await todas(ctx, "beta_paquete_ajustes")).map((a) => [String(a.paquete_id), a]));
}
async function ajusteDe(ctx: Ctx, id: unknown): Promise<Row | null> {
  try { return (await consultar(ctx.db, "beta_paquete_ajustes", { filtros: [{ col: "paquete_id", op: "eq", val: n(id) }] })).rows[0] || null; } catch { return null; }
}
async function filaPaq(ctx: Ctx, p: Row): Promise<Row | null> {
  const F: Filtro[] = [];
  if (n(p.id) > 0) F.push({ col: "id", op: "eq", val: n(p.id) });
  else if (n(p.fila) > 0) F.push({ col: "sheet_row", op: "eq", val: n(p.fila) });
  else if (s(p.codigo)) {
    const c = s(p.codigo);
    const m = c.match(/^PACK-(\d+)$/i);
    if (m) F.push({ col: "sheet_row", op: "eq", val: n(m[1]) });
    else F.push({ op: "or", de: [{ col: "beta_codigo", op: "eq", val: c }, { col: "codigo", op: "eq", val: c }, { col: "orig->>codigo", op: "eq", val: c }] });
  } else return null;
  return (await consultar(ctx.db, "paquetes", { cols: COLS, filtros: F, limite: 1 })).rows[0] || null;
}
async function permiso(ctx: Ctx, ses: Ses): Promise<"todos" | "propio" | "no"> {
  if (esAdmin(ses.rol)) return "todos";
  const a = acceso(ses.rol, "paquetes", await matrizDe(ctx.db));
  return a === "todos" ? "todos" : a === "no" ? "no" : "propio";
}
async function codigosCliente(ctx: Ctx, ceds: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const lista = [...new Set(ceds.map((c) => normCedula(c)).filter(Boolean))];
  if (!lista.length) return m;
  try {
    for (const r of (await consultar(ctx.db, "beta_clientes", { cols: ["cedula", "codigo"], filtros: [{ col: "cedula", op: "in", val: lista }] })).rows) {
      if (s(r.codigo)) m.set(normCedula(r.cedula), s(r.codigo));
    }
  } catch { /* sin códigos */ }
  return m;
}
async function guardarAjuste(ctx: Ctx, ses: Ses, r: Row, cambio: Row, accion: string, detalle: string): Promise<void> {
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const aj = await ajusteDe(ctx, r.id);
  const hist = [...(aj && Array.isArray(aj.historial) ? aj.historial as Row[] : []), { fecha: now, actor: ses.name || actor, accion, detalle }].slice(-100);
  const fila: Row = { sheet_row: r.sheet_row ?? null, ...cambio, historial: hist, actualizado_por: actor, updated_at: now };
  if (aj) await ctx.db.write(actor, "beta_paquete_ajustes", "update", { paquete_id: n(r.id) }, fila);
  else await ctx.db.write(actor, "beta_paquete_ajustes", "insert", {}, { paquete_id: n(r.id), datos: {}, usos: {}, borrado: false, ...fila });
  await logAccion(ctx.db, actor, "PAQUETE " + accion.toUpperCase(), (vistaPaquete(r).codigo as string) + " · " + detalle);
}

extend("pq_lista", "any", async (p, ctx, ses) => {
  const perm = await permiso(ctx, ses);
  if (perm === "no") return { error: "No tienes permiso" };
  const F: Filtro[] = [{ col: "borrado_at", op: "is_null" }, { op: "or", de: [{ col: "cedula", op: "not_null" }, { col: "nombres", op: "not_null" }] }];
  const q = s(p.q).trim();
  if (q && q !== "*") F.push({ op: "palabras", cols: ["codigo", "beta_codigo", "cedula", "nombres", "apellidos", "paquete", "sku", "vendido_por"], val: q.split(/\s+/).slice(0, 5) });
  if (perm === "propio" && ses.name) F.push({ op: "palabras", cols: ["vendido_por"], val: [s(ses.name).split(" ")[0]] });
  const rows = (await consultar(ctx.db, "paquetes", { cols: COLS, filtros: F, orden: [{ col: "sheet_row", desc: true }] })).rows;
  const AJ = await ajustes(ctx);
  let L = rows.map((r) => vistaPaquete(r, AJ.get(String(r.id)))).filter((v) => !v.borrado && (v.cedula || v.nombre));
  if (perm === "propio") L = L.filter((v) => esPropio(s(v.vendidoPor), ses));
  // TK111: más recientes primero por fecha de compra (las filas beta tienen sheet_row negativo y quedaban al final).
  L.sort((x, y) => s(y.fechaCompra).localeCompare(s(x.fechaCompra)) || Math.abs(n(y.fila)) - Math.abs(n(x.fila)));
  const cuenta = { todos: L.length, activos: L.filter((v) => v.estado !== "completo" && v.estado !== "anulado").length, completos: L.filter((v) => v.estado === "completo").length, anulados: L.filter((v) => v.estado === "anulado").length };
  // TK110: al buscar (nombre, código, cédula) se ven también los completos: un paquete ya usado no «desaparece».
  const est = q && q !== "*" && (!s(p.estado) || s(p.estado) === "activos") ? "todos" : s(p.estado) || "activos";
  if (est === "activos") L = L.filter((v) => v.estado !== "completo" && v.estado !== "anulado");
  if (est === "completos") L = L.filter((v) => v.estado === "completo");
  if (est === "anulados") L = L.filter((v) => v.estado === "anulado");
  const desde = Math.max(0, n(p.offset)), lim = Math.min(200, Math.max(1, n(p.limit) || 50));
  const pag = L.slice(desde, desde + lim);
  const cods = await codigosCliente(ctx, pag.map((v) => s(v.cedula)));
  for (const v of pag) if (!v.clienteCodigo) v.clienteCodigo = cods.get(normCedula(v.cedula)) || "";
  return { ok: true, items: pag.map(({ historial: _h, ...v }) => v), total: L.length, cuenta, offset: desde, limit: lim, admin: esAdmin(ses.rol) };
});

extend("pq_get", "any", async (p, ctx, ses) => {
  const perm = await permiso(ctx, ses);
  if (perm === "no") return { error: "No tienes permiso" };
  const r = await filaPaq(ctx, p);
  if (!r || r.borrado_at) return { error: "Paquete no encontrado" };
  const aj = await ajusteDe(ctx, r.id);
  const v = vistaPaquete(r, aj);
  if (v.borrado) return { error: "Este paquete fue dado de baja" + (aj && s(aj.motivo) ? ": " + s(aj.motivo) : "") };
  if (perm === "propio" && !esPropio(s(v.vendidoPor), ses)) return { error: "No tienes permiso" };
  if (!v.clienteCodigo) v.clienteCodigo = (await codigosCliente(ctx, [s(v.cedula)])).get(normCedula(v.cedula)) || "";
  // Ticket de cada sesión: el del día con la misma cédula (si no quedó anotado al marcar).
  const ced = normCedula(v.cedula);
  if (ced) {
    try {
      const tks = (await consultar(ctx.db, "tickets", { cols: ["id", "so_num", "beta_num", "timestamp", "atendido_por", "id_3", "paquete", "facial_hecho"], filtros: [{ op: "palabras", cols: ["id_3"], val: [ced] }], orden: [{ col: "timestamp", desc: true }], limite: 200 })).rows;
      for (const se of v.sesiones as Row[]) {
        if (!se.usado || !se.fecha) continue;
        const hit = tks.filter((t) => ymdUtc(t.timestamp) === se.fecha);
        const t = hit.find((x) => /^\s*SI\b/i.test(s(x.paquete))) || hit[0];
        if (!t) continue;
        if (!se.ticket) se.ticket = s(t.so_num) || s(t.beta_num);
        if (!se.cosmetologa) se.cosmetologa = s(t.atendido_por);
      }
    } catch { /* sin tickets */ }
  }
  const personas = (await todas(ctx, "usuarios")).filter((u) => s(u.nombre) && u.bloqueado !== true).map((u) => s(u.nombre));
  return { ok: true, item: v, admin: esAdmin(ses.rol), puedeMarcar: true, puedeEditar: esAdmin(ses.rol), puedePedir: !esAdmin(ses.rol), personas, hoy: ecuadorParts(ctx.now).ymd };
});

extend("pq_marcar", "any", async (p, ctx, ses) => {
  const perm = await permiso(ctx, ses);
  if (perm === "no") return { error: "No tienes permiso" };
  const r = await filaPaq(ctx, p);
  if (!r || r.borrado_at) return { error: "Paquete no encontrado" };
  const aj = await ajusteDe(ctx, r.id);
  const v = vistaPaquete(r, aj);
  if (v.borrado) return { error: "El paquete está dado de baja" };
  const desmarcar = p.desmarcar === true;
  if (v.anulado && !desmarcar) return { error: "Este paquete está anulado" + (v.anuladoPor ? " (ticket " + v.anuladoPor + " cancelado)" : "") + ": no se pueden marcar sesiones" };
  const ses2 = v.sesiones as Row[];
  if (desmarcar && !esAdmin(ses.rol)) return { error: "Solo un admin desmarca una sesión" };
  let idx = n(p.slot) > 0 ? n(p.slot) - 1 : ses2.findIndex((x) => !x.usado);
  if (idx < 0 || idx >= n(v.total)) return { error: desmarcar ? "Sesión inválida" : "El paquete ya no tiene sesiones libres" };
  const [u, f] = USO_FIELDS[idx];
  const patch: Row = {};
  const meta = { ...(aj && aj.usos && typeof aj.usos === "object" ? aj.usos as Row : {}) };
  if (desmarcar) {
    if (!ses2[idx].usado) return { error: "Esa sesión no está marcada" };
    patch[u] = false; patch[f] = ""; patch.completo = false;
    patch.orig = origConMarca(r, idx, "", ctx.now.getTime(), true);
    delete meta[String(idx + 1)];
  } else {
    if (ses2[idx].usado) return { error: "Esa sesión ya está marcada" };
    const fecha = s(p.fecha).match(/^\d{4}-\d{2}-\d{2}$/) ? s(p.fecha) : ecuadorParts(ctx.now).ymd;
    const cos = s(p.cosmetologa) || ses.name;
    patch[u] = true; patch[f] = textoUso(fecha, s(v.paquete).replace(/\s*\[.*\]\s*$/, ""), cos);
    if (ses2.filter((x) => x.usado).length + 1 >= n(v.total)) patch.completo = true;
    patch.orig = origConMarca(r, idx, s(p.ticket), ctx.now.getTime(), false);
    meta[String(idx + 1)] = { cosmetologa: cos, ticket: s(p.ticket), por: ses.name, ts: ctx.now.toISOString() };
  }
  await ctx.db.write(actorOf(ses), "paquetes", "update", { id: r.id }, patch);
  await guardarAjuste(ctx, ses, r, { usos: meta }, desmarcar ? "desmarcar" : "marcar", "sesión " + (idx + 1) + (desmarcar ? "" : " · " + s(patch[f])));
  return { ok: true, slot: idx + 1, completo: patch.completo === true };
});

const CAMPOS_PQ: [string, string, string][] = [["sesiones", "Sesiones", "total"], ["nombres", "Nombre", "nombre"], ["apellidos", "Apellido", "apellido"], ["cedula", "Cédula", "cedula"], ["cliente_codigo", "Código clienta", "clienteCodigo"], ["paquete", "Producto", "paquete"], ["sku", "SKU", "sku"], ["fecha_compra", "Fecha de compra", "fechaCompra"], ["vendido_por", "Vendió", "vendidoPor"]];
/** Valores planos del paquete (para «antes» de una solicitud y el diff de la bandeja). */
function planoPaquete(v: Row): Row {
  const o: Row = {};
  for (const [k, , c] of CAMPOS_PQ) o[k] = s(v[c]);
  for (const se of (v.sesiones as Row[]) || []) if (se.usado) o["fs:" + se.slot] = s(se.fecha);
  const campos: Row = {};
  for (const [k, lab] of CAMPOS_PQ) campos[k] = lab;
  for (const se of (v.sesiones as Row[]) || []) campos["fs:" + se.slot] = "Fecha sesión " + se.slot;
  o._campos = campos;
  return o;
}
/** Edición de un paquete: solo lo que cambió, con «antes → después» y quién en el historial. */
async function guardarPaquete(ctx: Ctx, ses: Ses, p: Row, via = ""): Promise<Row> {
  const r = await filaPaq(ctx, p);
  if (!r || r.borrado_at) return { error: "Paquete no encontrado" };
  const aj = await ajusteDe(ctx, r.id);
  const antes = vistaPaquete(r, aj);
  if (antes.borrado) return { error: "El paquete está dado de baja" };
  const dIn = p.datos && typeof p.datos === "object" ? p.datos as Row : {};
  const datos: Row = { ...(aj && aj.datos && typeof aj.datos === "object" ? aj.datos as Row : {}) };
  const cambios: string[] = [];
  const set = (k: string, val: unknown, label: string, prev: unknown) => { datos[k] = val; cambios.push(label + ": " + (s(prev) || "—") + " → " + (s(val) || "—")); };
  if (dIn.sesiones != null && s(dIn.sesiones) !== "") {
    const ns = Math.round(n(dIn.sesiones));
    if (!(ns >= 1 && ns <= 6)) return { error: "Las sesiones van de 1 a 6" };
    if (ns < n(antes.usados)) return { error: "Ya hay " + antes.usados + " sesiones marcadas: desmarca antes de bajar el total" };
    if (ns !== n(antes.total)) set("sesiones", ns, "sesiones", antes.total);
  }
  for (const [k, lab, cur] of [["cedula", "cédula", antes.cedula], ["nombres", "nombre", antes.nombre], ["apellidos", "apellido", antes.apellido], ["cliente_codigo", "código clienta", antes.clienteCodigo], ["sku", "SKU", antes.sku], ["paquete", "producto", antes.paquete], ["vendido_por", "vendido por", antes.vendidoPor]] as const) {
    if (dIn[k] != null && s(dIn[k]).trim() !== s(cur)) set(k, s(dIn[k]).trim().slice(0, 160), lab, cur);
  }
  if (dIn.fecha_compra != null && s(dIn.fecha_compra) !== s(antes.fechaCompra)) {
    if (!s(dIn.fecha_compra).match(/^\d{4}-\d{2}-\d{2}$/)) return { error: "Fecha de compra inválida" };
    set("fecha_compra", s(dIn.fecha_compra), "fecha de compra", antes.fechaCompra);
  }
  // Fechas de sesiones ya marcadas (van a la fila, como la marca).
  const patch: Row = {};
  const fechas = p.fechas && typeof p.fechas === "object" ? p.fechas as Row : {};
  for (const [slot, f0] of Object.entries(fechas)) {
    const i = n(slot) - 1, se = (antes.sesiones as Row[])[i];
    if (!se || !se.usado || !s(f0).match(/^\d{4}-\d{2}-\d{2}$/) || s(f0) === s(se.fecha)) continue;
    patch[USO_FIELDS[i][1]] = textoUso(s(f0), s(se.facial), s(se.cosmetologa));
    cambios.push("sesión " + (i + 1) + ": " + s(se.fecha) + " → " + s(f0));
  }
  if (!cambios.length) return { ok: true, sinCambios: true };
  if (Object.keys(patch).length) await ctx.db.write(actorOf(ses), "paquetes", "update", { id: r.id }, patch);
  await guardarAjuste(ctx, ses, r, { datos }, "editar", cambios.join(", ") + (via ? " (" + via + ")" : ""));
  return { ok: true, cambios };
}
async function borrarPaquete(ctx: Ctx, ses: Ses, p: Row, motivo0: string): Promise<Row> {
  const motivo = s(motivo0).trim().slice(0, 300);
  if (motivo.length < 3) return { error: "Escribe el motivo" };
  const r = await filaPaq(ctx, p);
  if (!r || r.borrado_at) return { error: "Paquete no encontrado" };
  await guardarAjuste(ctx, ses, r, { borrado: true, motivo }, "eliminar", motivo);
  await ctx.db.write(actorOf(ses), "paquetes", "update", { id: r.id }, { borrado_at: ctx.now.toISOString(), borrado_por: s(ses.name) || actorOf(ses) });
  return { ok: true };
}

extend("pq_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin guarda directo: envía una solicitud" };
  return guardarPaquete(ctx, ses, p);
});

extend("pq_borrar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina un paquete: envía una solicitud" };
  return borrarPaquete(ctx, ses, p, s(p.motivo));
});

// Solicitudes del personal (Emilia 18/11): el cambio queda pendiente hasta que un admin lo aprueba.
const viaSol = (sol?: Row) => "solicitud" + (sol && s(sol.solicitante) ? " de " + s(sol.solicitante) : "") + " aprobada";
SOLICITUD_HOOKS["paquete_beta"] = {
  fila: async (ctx, ses, fila) => {
    const perm = await permiso(ctx, ses);
    if (perm === "no") return { error: "No tienes permiso" };
    const r = await filaPaq(ctx, { id: fila });
    if (!r || r.borrado_at) return { error: "Paquete no encontrado" };
    const v = vistaPaquete(r, await ajusteDe(ctx, r.id));
    if (v.borrado) return { error: "El paquete está dado de baja" };
    if (perm === "propio" && !esPropio(s(v.vendidoPor), ses)) return { error: "No tienes permiso" };
    const cli = (s(v.nombre) + " " + s(v.apellido)).trim();
    return { row: r, antes: planoPaquete(v), etiqueta: "Paquete " + s(v.codigo) + (cli ? " · " + cli : ""), enlace: "#/m/gift/paquetes/" + r.id };
  },
  aplicar: (ctx, ses, fila, prop, sol) => {
    const datos: Row = {}, fechas: Row = {};
    for (const [k, v] of Object.entries(prop || {})) {
      if (k.startsWith("fs:")) fechas[k.slice(3)] = v; else if (!k.startsWith("_")) datos[k] = v;
    }
    return guardarPaquete(ctx, ses, { id: fila, datos, fechas }, viaSol(sol));
  },
  borrar: (ctx, ses, fila, motivo, sol) => borrarPaquete(ctx, ses, { id: fila }, (motivo || "sin motivo") + " (" + viaSol(sol) + ")"),
};
