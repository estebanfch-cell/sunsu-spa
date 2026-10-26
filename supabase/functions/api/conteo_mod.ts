// Conteo físico por secciones de familia (HT, AS, ML, PH, JN, BV, SU, …).
// Reusa erp_conteos y el kardex. Las líneas nuevas viven en erp_conteo_items
// para poder contar el mismo producto en más de una bodega.

import { enPrueba, type Db } from "./db.ts";
import { n, round2, s, skuCode, siguienteTestDoc, type Row } from "./domain.ts";
import { runErp, usoCompatible } from "./erp.ts";
import { logAccion } from "./lib.ts";

export const FAMILIA_ETIQUETA: Record<string, string> = {
  HT: "HT — ANUA",
  AS: "AS — Eyenlip",
  ML: "ML — Dr.esthe",
  PH: "PH — APHLORA",
  JN: "JN — Varios",
  BV: "BV — Bruno Vassari",
  SU: "SU — SUNSU",
  VK: "VK",
  SUNSU: "SUNSU",
};

const FAMILIA_ORDEN = ["HT", "AS", "ML", "PH", "JN", "BV", "SU", "VK", "SUNSU", "OTROS"];

function id(): string { return crypto.randomUUID(); }

export function seccionDeSku(sku: unknown): { familia: string; etiqueta: string } {
  const raw = s(sku).toUpperCase();
  const code = skuCode(raw);
  const m = code.match(/^([A-Z]{2,10})-/);
  if (m) {
    const familia = m[1];
    return { familia, etiqueta: FAMILIA_ETIQUETA[familia] || familia };
  }
  if (raw.startsWith("SUNSU")) return { familia: "SUNSU", etiqueta: FAMILIA_ETIQUETA.SUNSU };
  return { familia: "OTROS", etiqueta: "CÓDIGOS OTROS" };
}

function ordenFamilia(f: string): number {
  const i = FAMILIA_ORDEN.indexOf(f);
  return i < 0 ? 50 : i;
}

function numeroCnt(db: Db, rows: Row[]): string {
  if (enPrueba(db)) return siguienteTestDoc(rows, "CNT");
  let m = 0;
  for (const r of rows) {
    const mm = String(r.numero || "").match(/^CNT-(\d+)$/);
    if (mm) m = Math.max(m, Number(mm[1]));
  }
  return "CNT-" + String(m + 1).padStart(4, "0");
}

function numeroAju(db: Db, rows: Row[]): string {
  if (enPrueba(db)) return siguienteTestDoc(rows, "AJU");
  let m = 0;
  for (const r of rows) {
    const mm = String(r.numero || "").match(/^AJU-(\d+)$/);
    if (mm) m = Math.max(m, Number(mm[1]));
  }
  return "AJU-" + String(m + 1).padStart(4, "0");
}

export function flujoDeConteo(secciones: Row[], aplicado = false): string {
  if (aplicado) return "Aplicado";
  if (!secciones.length) return "Abierto";
  const est = secciones.map((x) => s(x.estado) || "Abierto");
  if (est.every((e) => e === "Sección completa")) return "Por aprobar";
  if (est.some((e) => e === "Sección completa")) return "Sección completa";
  if (est.some((e) => e === "En progreso")) return "En progreso";
  return "Abierto";
}

function cuentaEn(prod: Row, bodega: Row): boolean {
  if (prod.activo === false) return false;
  const clase = s(prod.clase) || "producto";
  if (clase !== "producto") return false;
  return usoCompatible(s(prod.uso) || "venta", s(bodega.tipo));
}

async function stockDe(db: Db, productoId: string, bodegaId: string): Promise<number> {
  const rows = await db.all("erp_stock");
  return round2(rows.filter((r) => r.producto_id === productoId && r.bodega_id === bodegaId).reduce((a, r) => a + n(r.cantidad), 0));
}

async function persona(db: Db, uid: string): Promise<Row | null> {
  if (!uid) return null;
  const app = await db.all("app_usuarios");
  const a = app.find((x) => String(x.id ?? x.usuario) === uid);
  if (a && a.bloqueado !== true) return { id: String(a.id ?? a.usuario), nombre: s(a.nombre ?? a.name ?? a.usuario) };
  const users = await db.all("usuarios");
  const u = users.find((x) => String(x.id) === uid);
  if (!u || u.bloqueado === true) return null;
  return { id: String(u.id), nombre: s(u.nombre || u.name || u.id) };
}

export async function conteoUsuarios(db: Db): Promise<Row> {
  const out: Row[] = [];
  const vistos = new Set<string>();
  for (const u of await db.all("usuarios")) {
    if (u.bloqueado === true) continue;
    const idu = String(u.id || "");
    if (!idu || vistos.has(idu)) continue;
    vistos.add(idu);
    out.push({ id: idu, nombre: s(u.nombre || u.short || idu), rol: s(u.rol) });
  }
  for (const u of await db.all("app_usuarios")) {
    if (u.bloqueado === true) continue;
    const idu = String(u.id ?? u.usuario ?? "");
    if (!idu || vistos.has(idu)) continue;
    vistos.add(idu);
    out.push({ id: idu, nombre: s(u.nombre ?? u.name ?? idu), rol: s(u.rol ?? u.role) });
  }
  out.sort((a, b) => s(a.nombre).localeCompare(s(b.nombre)));
  return { ok: true, items: out };
}

export async function conteoPlan(db: Db, p: Row): Promise<Row> {
  const ids = Array.isArray(p.bodega_ids) ? (p.bodega_ids as unknown[]).map((x) => s(x)).filter(Boolean) : [s(p.bodega_id)].filter(Boolean);
  if (!ids.length) return { error: "Elige al menos una bodega" };
  const bodegas = await db.all("erp_bodegas");
  const prods = await db.all("erp_productos");
  const secciones: Row[] = [];
  for (const bid of ids) {
    const b = bodegas.find((r) => r.id === bid);
    if (!b) return { error: "Bodega no existe" };
    const grupos = new Map<string, { etiqueta: string; n: number }>();
    for (const prod of prods) {
      if (!cuentaEn(prod, b)) continue;
      const sec = seccionDeSku(prod.sku);
      const g = grupos.get(sec.familia) || { etiqueta: sec.etiqueta, n: 0 };
      g.n++;
      grupos.set(sec.familia, g);
    }
    for (const [familia, g] of grupos) {
      secciones.push({ bodega_id: b.id, bodega: s(b.nombre), familia, etiqueta: g.etiqueta, productos: g.n });
    }
  }
  secciones.sort((a, b) => s(a.bodega).localeCompare(s(b.bodega)) || ordenFamilia(s(a.familia)) - ordenFamilia(s(b.familia)) || s(a.familia).localeCompare(s(b.familia)));
  if (!secciones.length) return { error: "Esas bodegas no tienen productos para contar" };
  return { ok: true, secciones };
}

async function refrescarFlujo(db: Db, actor: string, conteoId: string): Promise<string> {
  const c = (await db.all("erp_conteos")).find((r) => r.id === conteoId);
  if (!c) return "";
  if (s(c.flujo) === "Aplicado" || s(c.estado) === "aplicado") return "Aplicado";
  const secs = (await db.all("erp_conteo_secciones")).filter((r) => r.conteo_id === conteoId);
  const flujo = flujoDeConteo(secs, false);
  await db.write(actor, "erp_conteos", "update", { id: conteoId }, { flujo });
  return flujo;
}

export async function conteoCrear(db: Db, actor: string, p: Row, now: Date): Promise<Row> {
  const plan = await conteoPlan(db, p);
  if (plan.error) return plan;
  const asigna = new Map<string, string>();
  for (const a of (Array.isArray(p.asignaciones) ? p.asignaciones : []) as Row[]) {
    asigna.set(s(a.bodega_id) + "|" + s(a.familia).toUpperCase(), s(a.uid || a.asignado_uid));
  }
  const secs = plan.secciones as Row[];
  const quienDe = new Map<string, Row | null>();
  for (const sec of secs) {
    const key = s(sec.bodega_id) + "|" + s(sec.familia);
    const uid = asigna.get(key) || "";
    if (!uid) { quienDe.set(key, null); continue; }
    const quien = await persona(db, uid);
    if (!quien) return { error: "Esa persona no está en el equipo" };
    quienDe.set(key, quien);
  }
  const cid = id();
  const numero = numeroCnt(db, await db.all("erp_conteos"));
  const primera = s(secs[0].bodega_id);
  await db.write(actor, "erp_conteos", "insert", {}, {
    id: cid, numero, bodega_id: primera, estado: "abierto", flujo: "Abierto",
    fecha: now.toISOString(), creado_por: actor, nota: s(p.nota),
  });
  const bodegas = await db.all("erp_bodegas");
  const prods = await db.all("erp_productos");
  let nItems = 0;
  for (const sec of secs) {
    const quien = quienDe.get(s(sec.bodega_id) + "|" + s(sec.familia)) || null;
    const sid = id();
    await db.write(actor, "erp_conteo_secciones", "insert", {}, {
      id: sid, conteo_id: cid, bodega_id: sec.bodega_id, familia: sec.familia, etiqueta: sec.etiqueta,
      asignado_uid: quien ? quien.id : "", asignado_nombre: quien ? quien.nombre : "", estado: "Abierto",
    });
    const b = bodegas.find((r) => r.id === sec.bodega_id);
    for (const prod of prods) {
      if (!b || !cuentaEn(prod, b)) continue;
      if (seccionDeSku(prod.sku).familia !== s(sec.familia)) continue;
      const sistema = await stockDe(db, String(prod.id), String(sec.bodega_id));
      await db.write(actor, "erp_conteo_items", "insert", {}, {
        id: id(), conteo_id: cid, seccion_id: sid, bodega_id: sec.bodega_id, producto_id: prod.id,
        sku: skuCode(prod.sku), nombre: s(prod.nombre), lote: "", sistema, contado: null,
      });
      nItems++;
    }
  }
  await logAccion(db, actor, "CONTEO CREADO", numero + " · " + secs.length + " secciones · " + nItems + " códigos");
  return { ok: true, id: cid, numero, flujo: "Abierto", secciones: secs.length, items: nItems };
}

async function conteoDe(db: Db, p: Row): Promise<Row | undefined> {
  const rows = await db.all("erp_conteos");
  return rows.find((r) => r.id === p.id || r.id === p.conteo_id || r.numero === p.numero);
}

function vistaItem(it: Row, ahora: number, admin: boolean): Row {
  const contado = it.contado == null || it.contado === "" ? null : n(it.contado);
  const base: Row = { id: it.id, sku: skuCode(it.sku), nombre: s(it.nombre), contado };
  if (!admin) return base;
  return { ...base, sistema: n(it.sistema), ahora, diferencia: contado == null ? null : round2(contado - ahora) };
}

export async function conteoPanel(db: Db, p: Row): Promise<Row> {
  const uno = s(p.id || p.conteo_id || p.numero);
  const conteos = (await db.all("erp_conteos")).filter((r) => s(r.flujo));
  const want = uno ? conteos.filter((r) => r.id === uno || r.numero === uno) : conteos;
  const secciones = await db.all("erp_conteo_secciones");
  const items = await db.all("erp_conteo_items");
  const bodegas = await db.all("erp_bodegas");
  const out = [];
  for (const c of want.sort((a, b) => s(b.fecha).localeCompare(s(a.fecha)))) {
    const secs = secciones.filter((r) => r.conteo_id === c.id).sort((a, b) => s(a.bodega_id).localeCompare(s(b.bodega_id)) || ordenFamilia(s(a.familia)) - ordenFamilia(s(b.familia)));
    const secVista = [];
    for (const sec of secs) {
      const lineas = items.filter((r) => r.seccion_id === sec.id);
      const contadas = lineas.filter((r) => r.contado != null && r.contado !== "").length;
      const b = bodegas.find((r) => r.id === sec.bodega_id);
      const diffs = [];
      for (const it of lineas) {
        if (it.contado == null || it.contado === "") continue;
        const ahora = await stockDe(db, String(it.producto_id), String(it.bodega_id));
        const d = round2(n(it.contado) - ahora);
        if (Math.abs(d) < 1e-9) continue;
        diffs.push({ sku: skuCode(it.sku), nombre: s(it.nombre), sistema: n(it.sistema), ahora, contado: n(it.contado), diferencia: d });
      }
      secVista.push({
        id: sec.id, bodega_id: sec.bodega_id, bodega: s(b?.nombre), familia: s(sec.familia), etiqueta: s(sec.etiqueta),
        asignado_uid: s(sec.asignado_uid), asignado_nombre: s(sec.asignado_nombre), estado: s(sec.estado) || "Abierto",
        productos: lineas.length, contadas, diferencias: diffs,
      });
    }
    out.push({
      id: c.id, numero: s(c.numero), flujo: s(c.flujo) || s(c.estado), nota: s(c.nota), fecha: s(c.fecha),
      secciones: secVista,
    });
  }
  return { ok: true, items: out };
}

export async function conteoAsignar(db: Db, actor: string, p: Row): Promise<Row> {
  const sec = (await db.all("erp_conteo_secciones")).find((r) => r.id === p.seccion_id || r.id === p.id);
  if (!sec) return { error: "Sección no encontrada" };
  const c = (await db.all("erp_conteos")).find((r) => r.id === sec.conteo_id);
  if (!c || s(c.flujo) === "Aplicado") return { error: "Ese conteo ya está aplicado" };
  const uid = s(p.uid || p.asignado_uid);
  const quien = uid ? await persona(db, uid) : null;
  if (uid && !quien) return { error: "Esa persona no está en el equipo" };
  await db.write(actor, "erp_conteo_secciones", "update", { id: sec.id }, {
    asignado_uid: quien ? quien.id : "", asignado_nombre: quien ? quien.nombre : "",
  });
  return { ok: true, id: sec.id, asignado_nombre: quien ? quien.nombre : "" };
}

export async function conteoMios(db: Db, uid: string): Promise<Row> {
  const secs = (await db.all("erp_conteo_secciones")).filter((r) => s(r.asignado_uid) === uid && s(r.estado) !== "Sección completa");
  const conteos = await db.all("erp_conteos");
  const items = await db.all("erp_conteo_items");
  const bodegas = await db.all("erp_bodegas");
  const tareas = [];
  for (const sec of secs) {
    const c = conteos.find((r) => r.id === sec.conteo_id);
    if (!c || s(c.flujo) === "Aplicado" || s(c.estado) === "aplicado") continue;
    const lineas = items.filter((r) => r.seccion_id === sec.id);
    const contadas = lineas.filter((r) => r.contado != null && r.contado !== "").length;
    const b = bodegas.find((r) => r.id === sec.bodega_id);
    tareas.push({
      id: sec.id, conteo_id: c.id, numero: s(c.numero), bodega: s(b?.nombre),
      etiqueta: s(sec.etiqueta), familia: s(sec.familia), estado: s(sec.estado) || "Abierto",
      productos: lineas.length, contadas,
    });
  }
  return { ok: true, items: tareas };
}

async function seccionVisible(db: Db, p: Row, uid: string, admin: boolean): Promise<Row | { error: string }> {
  const sec = (await db.all("erp_conteo_secciones")).find((r) => r.id === p.seccion_id || r.id === p.id);
  if (!sec) return { error: "Sección no encontrada" };
  if (!admin && s(sec.asignado_uid) !== uid) return { error: "Esta sección no es tuya" };
  const c = (await db.all("erp_conteos")).find((r) => r.id === sec.conteo_id);
  if (!c) return { error: "Conteo no encontrado" };
  if (s(c.flujo) === "Aplicado" || s(c.estado) === "aplicado") return { error: "Este conteo ya está aplicado" };
  return { sec, conteo: c };
}

export async function conteoSeccion(db: Db, p: Row, uid: string, admin: boolean): Promise<Row> {
  const hit = await seccionVisible(db, p, uid, admin);
  if ("error" in hit && !("sec" in hit)) return hit;
  const sec = (hit as { sec: Row; conteo: Row }).sec;
  const c = (hit as { sec: Row; conteo: Row }).conteo;
  const b = (await db.all("erp_bodegas")).find((r) => r.id === sec.bodega_id);
  const lineas = (await db.all("erp_conteo_items")).filter((r) => r.seccion_id === sec.id).sort((a, b0) => skuCode(a.sku).localeCompare(skuCode(b0.sku)));
  const vista = [];
  for (const it of lineas) {
    const ahora = admin ? await stockDe(db, String(it.producto_id), String(it.bodega_id)) : 0;
    vista.push(vistaItem(it, ahora, admin));
  }
  const out: Row = {
    ok: true, id: sec.id, conteo_id: c.id, numero: s(c.numero),
    etiqueta: s(sec.etiqueta), familia: s(sec.familia), estado: s(sec.estado) || "Abierto",
    productos: vista,
  };
  if (admin) {
    out.bodega = s(b?.nombre);
    out.asignado_nombre = s(sec.asignado_nombre);
    out.flujo = s(c.flujo);
  }
  return out;
}

export async function conteoGuardarSec(db: Db, actor: string, p: Row, uid: string, admin: boolean): Promise<Row> {
  const hit = await seccionVisible(db, p, uid, admin);
  if ("error" in hit && !("sec" in hit)) return hit;
  const sec = (hit as { sec: Row }).sec;
  const lineas = (Array.isArray(p.lineas) ? p.lineas : []) as Row[];
  if (!lineas.length && p.contado == null) return { error: "Indica las cantidades" };
  const items = (await db.all("erp_conteo_items")).filter((r) => r.seccion_id === sec.id);
  let nSav = 0;
  const entradas = lineas.length ? lineas : [{ id: p.item_id, contado: p.contado }];
  for (const ln of entradas) {
    if (ln.contado == null || s(ln.contado) === "") continue;
    if (n(ln.contado) < 0) return { error: "La cantidad contada no puede ser negativa" };
  }
  for (const ln of entradas) {
    if (ln.contado == null || s(ln.contado) === "") continue;
    if (n(ln.contado) < 0) return { error: "La cantidad contada no puede ser negativa" };
    const it = items.find((r) => r.id === ln.id || r.id === ln.item_id || skuCode(r.sku) === skuCode(ln.sku));
    if (!it) return { error: "Ese código no está en tu sección" };
    await db.write(actor, "erp_conteo_items", "update", { id: it.id }, { contado: n(ln.contado), contado_por: actor });
    nSav++;
  }
  if (!nSav) return { error: "Escribe cuántos hay" };
  await db.write(actor, "erp_conteo_secciones", "update", { id: sec.id }, { estado: "En progreso" });
  const flujo = await refrescarFlujo(db, actor, String(sec.conteo_id));
  return { ok: true, id: sec.id, guardadas: nSav, estado: "En progreso", flujo };
}

export async function conteoCerrarSec(db: Db, actor: string, p: Row, uid: string, admin: boolean): Promise<Row> {
  const hit = await seccionVisible(db, p, uid, admin);
  if ("error" in hit && !("sec" in hit)) return hit;
  const sec = (hit as { sec: Row }).sec;
  if (Array.isArray(p.lineas) && (p.lineas as Row[]).length) {
    const guardado = await conteoGuardarSec(db, actor, p, uid, admin);
    if (guardado.error) return guardado;
  }
  await db.write(actor, "erp_conteo_secciones", "update", { id: sec.id }, { estado: "Sección completa" });
  const flujo = await refrescarFlujo(db, actor, String(sec.conteo_id));
  const lineas = (await db.all("erp_conteo_items")).filter((r) => r.seccion_id === sec.id);
  const faltan = lineas.filter((r) => r.contado == null || r.contado === "").length;
  await logAccion(db, actor, "CONTEO SECCION", s(sec.etiqueta) + (faltan ? " · " + faltan + " sin contar" : " · completa"));
  return { ok: true, id: sec.id, estado: "Sección completa", flujo, sin_contar: faltan };
}

export async function conteoAprobar(db: Db, actor: string, p: Row, now: Date): Promise<Row> {
  const c = await conteoDe(db, p);
  if (!c) return { error: "Conteo no encontrado" };
  if (s(c.flujo) === "Aplicado" || s(c.estado) === "aplicado") return { error: "Ya estaba aplicado" };
  const secs = (await db.all("erp_conteo_secciones")).filter((r) => r.conteo_id === c.id);
  if (!secs.length) return { error: "Este conteo no tiene secciones" };
  if (!secs.every((r) => s(r.estado) === "Sección completa")) return { error: "Termina todas las secciones antes de aprobar" };
  const items = (await db.all("erp_conteo_items")).filter((r) => r.conteo_id === c.id && r.contado != null && r.contado !== "");
  const aj = id();
  const numero = numeroAju(db, await db.all("erp_ajustes"));
  await db.write(actor, "erp_ajustes", "insert", {}, {
    id: aj, numero, bodega_id: c.bodega_id, motivo: "conteo", nota: s(c.numero), creado_por: actor, fecha: now.toISOString(),
  });
  const moves: Row[] = [];
  for (const it of items) {
    const hay = await stockDe(db, String(it.producto_id), String(it.bodega_id));
    const delta = round2(n(it.contado) - hay);
    if (Math.abs(delta) < 1e-9) continue;
    moves.push({
      producto_id: it.producto_id, bodega_id: it.bodega_id, delta, tipo: "conteo",
      doc_tipo: "conteo", doc_id: String(c.id), nota: numero + " " + skuCode(it.sku),
    });
  }
  if (moves.length) {
    try {
      const out = await runErp("stock_delta", { moves, aprobar_negativo: true }, db, actor, now);
      if (out.error) return out;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }
  await db.write(actor, "erp_conteos", "update", { id: c.id }, { flujo: "Aplicado", estado: "aplicado" });
  const detalle = s(c.numero) + " · " + numero + " · " + moves.length + " ajustes";
  await logAccion(db, actor, "CONTEO APLICADO", detalle);
  return { ok: true, id: c.id, numero: s(c.numero), ajuste: numero, flujo: "Aplicado", ajustes: moves.length };
}
