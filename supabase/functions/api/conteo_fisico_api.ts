// Conteo físico de la beta (Emilia 17/11, flujo como MineCore cc_*): un admin crea el conteo de una
// bodega (Consignación / Bodega Cabina [Cabina 1/2/3] / Oficina) y lo asigna a una usuaria; ella lo
// empieza (se toma la foto del stock del sistema), cuenta (lista, buscar o escanear), marca «no está»,
// cambia la sububicación real y lo envía a revisión; el admin lo devuelve o lo aprueba.
// TK135: al aprobar, el stock real de esa bodega se actualiza con las líneas contadas
// (stock_aplicado = true). Re-aprobar no vuelve a mover. Todo vive en beta_conteos /
// beta_conteo_lineas / beta_notificaciones (0045) y los movimientos de stock (0046).
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { acceso, esAdmin, matrizDe } from "./permisos.ts";
import { n, round2, s, skuCode, type Row } from "./domain.ts";
import { BOD_CABINA, BOD_CASA, BOD_VENTA, GRUPO_NOMBRE, SUBS_CABINA } from "./productos.ts";
import { listaProductos } from "./productos_api.ts";
import { aplicarConteoAStock } from "./conteo_aplica_stock.ts";

export const BODEGAS_CONTEO = ["CONSIGNACION", "CABINA", "OFICINA"] as const;
export const ESTADOS_CONTEO: Record<string, string> = {
  asignado: "Asignado", en_conteo: "En conteo", en_revision: "En revisión", aprobado: "Aprobado", cancelado: "Cancelado",
};
const FALTA = "Falta aplicar 0045_conteo_fisico.sql";

async function todas(ctx: Ctx, t: string): Promise<Row[]> {
  try { return await ctx.db.all(t); } catch { return []; }
}
async function tablaLista(ctx: Ctx): Promise<boolean> {
  try { await ctx.db.all("beta_conteos"); return true; } catch { return false; }
}
function yo(ses: Ses): string { return s(ses.uid); }
export async function puedeVerModulo(ctx: Ctx, ses: Ses): Promise<boolean> {
  if (esAdmin(ses.rol)) return true;
  const m = await matrizDe(ctx.db);
  return acceso(ses.rol, "conteos", m) !== "no" || acceso(ses.rol, "productos", m) !== "no";
}
function esAsignada(c: Row, ses: Ses): boolean { return !!s(c.asignado_a) && s(c.asignado_a) === yo(ses); }
function subNombre(code: string): string { return SUBS_CABINA.find((x) => x.codigo === code)?.nombre || (code === "SIN" ? "Sin cabina asignada" : code); }

async function movsDurante(ctx: Ctx, productoId: string, bodega: string, desde: string, hasta: string): Promise<Row[]> {
  if (!desde) return [];
  const out: Row[] = [];
  for (const m of await todas(ctx, "beta_stock_movimientos")) {
    if (s(m.producto_id) !== productoId) continue;
    if (s(m.bodega) && s(m.bodega) !== bodega) continue;
    const at = s(m.fecha || m.created_at || m.at);
    if (at && at < desde) continue;
    if (hasta && at && at > hasta) continue;
    out.push({ sku: s(m.sku), sub: s(m.sububicacion) || "", kind: s(m.tipo), label: s(m.tipo), delta: n(m.delta), at, actor: s(m.actor) });
  }
  return out;
}
export async function subsDe(ctx: Ctx, bodega: string): Promise<Row[]> {
  const out: Row[] = [], seen = new Set<string>();
  const add = (codigo: string, nombre: string) => { const c = s(codigo); if (!c || seen.has(c)) return; seen.add(c); out.push({ codigo: c, nombre: nombre || c }); };
  if (bodega === "CABINA") for (const x of SUBS_CABINA) add(x.codigo, x.nombre);
  for (const x of await todas(ctx, "erp_sububicaciones")) {
    if (x.activo === false) continue;
    const codigo = s(x.codigo);
    const id = s(x.bodega_id);
    const bod = /^CABINA_?\d+$/i.test(codigo) ? "CABINA"
      : (id === BOD_CASA || id === "CASA" ? "OFICINA" : id === BOD_VENTA ? "CONSIGNACION" : id === BOD_CABINA ? "CABINA" : s(x.bodega));
    if (bod === bodega) add(codigo, s(x.nombre) || codigo);
  }
  return out;
}

export function bodegaNombre(b: string, sub?: string): string {
  const g = GRUPO_NOMBRE[b as keyof typeof GRUPO_NOMBRE] || b;
  return sub ? g + " · " + subNombre(sub) : g;
}


function subUnica(p: Row, bodega: string): string {
  if (bodega === "CABINA") {
    const sub = p.porSubCabina as Row | undefined;
    const keys = Object.entries(sub || {}).filter(([k, q]) => k && k !== "SIN" && Math.abs(n(q)) > 1e-9).map(([k]) => k);
    return keys.length === 1 ? keys[0] : "";
  }
  const est = (p.porEstante || {}) as Row;
  const keys = Object.entries(est).filter(([k, q]) => k.startsWith(bodega + "|") && k.slice(bodega.length + 1) && Math.abs(n(q)) > 1e-9).map(([k]) => k.slice(bodega.length + 1));
  return keys.length === 1 ? keys[0] : "";
}

/** Stock del sistema de un producto en la bodega/sububicación del conteo (lo mismo que muestra Productos). */
export function sistemaDe(p: Row, bodega: string, sub: string): number {
  if (bodega === "CABINA" && sub) return n((p.porSubCabina as Row | undefined)?.[sub]);
  return n((p.porGrupo as Row | undefined)?.[bodega]);
}
export function resumenLineas(L: Row[]): Row {
  const contadas = L.filter((l) => s(l.estado) !== "pendiente").length;
  const dif = L.filter((l) => s(l.estado) !== "pendiente" && Math.abs(difLinea(l)) > 1e-9);
  return {
    lineas: L.length, contadas, pendientes: L.length - contadas, conDiferencia: dif.length,
    faltan: round2(dif.reduce((a, l) => a + Math.min(0, difLinea(l)), 0)), sobran: round2(dif.reduce((a, l) => a + Math.max(0, difLinea(l)), 0)),
  };
}
export function difLinea(l: Row): number {
  if (s(l.estado) === "no_encontrado") return round2(-n(l.sistema));
  if (l.contado == null || l.contado === "") return 0;
  return round2(n(l.contado) - n(l.sistema));
}
function siguienteNumero(rows: Row[]): string {
  let max = 0;
  for (const r of rows) { const m = s(r.numero).match(/^CF-(\d+)$/); if (m) max = Math.max(max, Number(m[1])); }
  return "CF-" + String(max + 1).padStart(3, "0");
}
export async function notificar(ctx: Ctx, ses: Ses, usuario: string, titulo: string, cuerpo: string, link: string, ref: string, tipo = "conteo"): Promise<void> {
  if (!usuario) return;
  try {
    await ctx.db.write(actorOf(ses), "beta_notificaciones", "insert", {}, {
      id: crypto.randomUUID(), usuario, tipo, titulo, cuerpo, link, ref_id: ref, created_at: ctx.now.toISOString(),
    });
  } catch { /* el aviso no frena el conteo */ }
}
async function cargar(ctx: Ctx, id: string): Promise<{ c: Row; L: Row[] } | null> {
  const c = (await todas(ctx, "beta_conteos")).find((x) => s(x.id) === id || s(x.numero) === id);
  if (!c) return null;
  const L = (await todas(ctx, "beta_conteo_lineas")).filter((l) => s(l.conteo_id) === s(c.id)).sort((a, b) => n(a.orden) - n(b.orden));
  return { c, L };
}
function vista(c: Row, L: Row[], ses: Ses): Row {
  return {
    id: c.id, numero: c.numero, tipo: s(c.tipo) || "hoja", bodega: c.bodega, sububicacion: s(c.sububicacion), bodegaNombre: bodegaNombre(s(c.bodega), s(c.sububicacion)),
    familias: s(c.familias), asignadoA: s(c.asignado_a), asignadoNombre: s(c.asignado_nombre), estado: s(c.estado), estadoNombre: ESTADOS_CONTEO[s(c.estado)] || s(c.estado),
    nota: s(c.nota), revisionNota: s(c.revision_nota), creadoPor: s(c.creado_por), creadoAt: s(c.creado_at),
    iniciadoAt: s(c.iniciado_at), enviadoAt: s(c.enviado_at), aprobadoAt: s(c.aprobado_at), aprobadoPor: s(c.aprobado_por),
    stockAplicado: c.stock_aplicado === true, stockAplicadoAt: s(c.stock_aplicado_at), mia: esAsignada(c, ses), ...ciego(resumenLineas(L), ses),
  };
}
/** Conteo CIEGO (Emilia 17/11): quien no es admin nunca recibe el stock del sistema ni las diferencias. */
function ciego(r: Row, ses: Ses): Row {
  if (esAdmin(ses.rol)) return r;
  return { lineas: r.lineas, contadas: r.contadas, pendientes: r.pendientes, conDiferencia: null, faltan: null, sobran: null };
}

extend("cf_meta", "any", async (_p, ctx, ses) => {
  if (!(await puedeVerModulo(ctx, ses))) return { error: "No tienes permiso" };
  const usuarios = (await todas(ctx, "usuarios")).filter((u) => !u.bloqueado).map((u) => ({ id: s(u.id), nombre: s(u.short) || s(u.nombre), rol: s(u.rol) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  return {
    ok: true, admin: esAdmin(ses.rol), listo: await tablaLista(ctx), usuarios: esAdmin(ses.rol) ? usuarios : [],
    bodegas: BODEGAS_CONTEO.map((b) => ({ id: b, nombre: GRUPO_NOMBRE[b] })), subsCabina: SUBS_CABINA.map((x) => ({ id: x.codigo, nombre: x.nombre })),
    estados: ESTADOS_CONTEO,
    subs: {
      CONSIGNACION: await subsDe(ctx, "CONSIGNACION"),
      CABINA: await subsDe(ctx, "CABINA"),
      OFICINA: await subsDe(ctx, "OFICINA"),
    },
  };
});

extend("cf_list", "any", async (p, ctx, ses) => {
  const admin = esAdmin(ses.rol);
  const verMod = await puedeVerModulo(ctx, ses);
  if (!(await tablaLista(ctx))) return { ok: true, items: [], admin, falta: FALTA };
  const lineas = await todas(ctx, "beta_conteo_lineas");
  const porC = new Map<string, Row[]>();
  for (const l of lineas) { const k = s(l.conteo_id); porC.set(k, [...(porC.get(k) || []), l]); }
  let rows = (await todas(ctx, "beta_conteos"));
  // Admin (y quien tiene Conteos en todos) ve todo.
  // TK116: un conteo general abierto lo puede retomar cualquiera del equipo con acceso (guardar y terminar después).
  const todo = admin || (verMod && acceso(ses.rol, "conteos", await matrizDe(ctx.db)) === "todos");
  if (!todo) rows = rows.filter((c) => esAsignada(c, ses) || (verMod && ["asignado", "en_conteo", "en_revision"].includes(s(c.estado))));
  if (p.mios === true) rows = rows.filter((c) => esAsignada(c, ses) && ["asignado", "en_conteo"].includes(s(c.estado)));
  const items = rows.map((c) => vista(c, porC.get(s(c.id)) || [], ses)).sort((a, b) => s(b.creadoAt).localeCompare(s(a.creadoAt)));
  return { ok: true, items, admin };
});

extend("cf_crear", "any", async (p, ctx, ses) => {
  if (!(await puedeVerModulo(ctx, ses))) return { error: "No tienes permiso" };
  if (!(await tablaLista(ctx))) return { error: FALTA };
  const bodega = s(p.bodega).toUpperCase();
  if (!(BODEGAS_CONTEO as readonly string[]).includes(bodega)) return { error: "Elige la bodega" };
  const sub = bodega === "CABINA" ? s(p.sububicacion) : "";
  if (sub && !SUBS_CABINA.some((x) => x.codigo === sub)) return { error: "Sububicación inválida" };
  // TK108: el personal crea un conteo para sí mismo; un admin puede asignarlo a otra persona.
  let asignado = s(p.asignado_a);
  if (!esAdmin(ses.rol)) {
    if (asignado && asignado !== yo(ses)) return { error: "Solo puedes crear un conteo para ti" };
    asignado = yo(ses);
  } else if (!asignado) {
    asignado = yo(ses);
  }
  const u = (await todas(ctx, "usuarios")).find((x) => s(x.id) === asignado) || (await todas(ctx, "app_usuarios")).find((x) => s(x.id ?? x.usuario) === asignado);
  if (!u) return { error: esAdmin(ses.rol) ? "Asigna a quién cuenta" : "No se encontró tu usuario" };
  const familias = (Array.isArray(p.familias) ? p.familias : s(p.familias).split(",")).map((x) => s(x).trim().toUpperCase()).filter((x) => /^[A-Z0-9]{2,6}$/.test(x)).slice(0, 20);
  const rows = await todas(ctx, "beta_conteos");
  const abierto = rows.find((c) => s(c.bodega) === bodega && s(c.sububicacion) === sub && ["asignado", "en_conteo", "en_revision"].includes(s(c.estado)));
  if (abierto && p.forzar !== true) {
    if (p.iniciar === true || p.reanudar === true) {
      return { ok: true, id: s(abierto.id), numero: s(abierto.numero), reanudar: true, iniciado: s(abierto.estado) !== "asignado", estado: s(abierto.estado) };
    }
    return { error: "Ya hay un conteo abierto en " + bodegaNombre(bodega, sub) + " (" + s(abierto.numero) + "). Termínalo o cancélalo antes.", id: s(abierto.id), numero: s(abierto.numero) };
  }
  const id = crypto.randomUUID(), numero = siguienteNumero(rows);
  const nombre = s(u.short) || s(u.nombre);
  await ctx.db.write(actorOf(ses), "beta_conteos", "insert", {}, {
    id, numero, tipo: "hoja", bodega, sububicacion: sub || null, familias: familias.join(",") || null, asignado_a: asignado, asignado_nombre: nombre,
    estado: "asignado", nota: s(p.nota).slice(0, 500) || null, creado_por: actorOf(ses), creado_at: ctx.now.toISOString(),
  });
  await notificar(ctx, ses, asignado, "Conteo asignado: " + numero, "Te asignaron el conteo físico de " + bodegaNombre(bodega, sub) + ".", "#/m/conteos/cf/" + id, id);
  return { ok: true, id, numero, estado: "asignado" };
});

extend("cf_get", "any", async (p, ctx, ses) => {
  const r = await cargar(ctx, s(p.id));
  if (!r) return { error: (await tablaLista(ctx)) ? "Conteo no encontrado" : FALTA };
  const admin = esAdmin(ses.rol);
  if (!admin && !esAsignada(r.c, ses) && !(await puedeVerModulo(ctx, ses))) return { error: "No tienes permiso" };
  const cerrado = ["en_revision", "aprobado", "cancelado"].includes(s(r.c.estado));
  const desde = s(r.c.iniciado_at), hasta = s(r.c.enviado_at) || s(r.c.cerrado_at);
  const prods = s(r.c.estado) === "asignado" ? [] : await listaProductos(ctx, ses);
  const porId = new Map(prods.map((x) => [s(x.id), x]));
  const bod = s(r.c.bodega);
  const recs: Row[] = [];
  const lineas = [];
  for (const l of r.L) {
    const subLin = s(l.sub_contada) || s(l.sububicacion) || s(r.c.sububicacion);
    const movs = desde ? await movsDurante(ctx, s(l.producto_id), bod, desde, hasta) : [];
    const pr = porId.get(s(l.producto_id));
    const vivo = pr ? (subLin && bod === "CABINA" ? (Math.abs(sistemaDe(pr, bod, subLin)) > 1e-9 ? sistemaDe(pr, bod, subLin) : sistemaDe(pr, bod, "")) : sistemaDe(pr, bod, subLin) || sistemaDe(pr, bod, "")) : n(l.sistema);
    const esp = cerrado ? (l.esperado != null && l.esperado !== "" ? n(l.esperado) : n(l.sistema)) : round2(vivo);
    const mov = movs.reduce((a, m) => a + n(m.delta), 0);
    for (const m of movs) recs.push({ ...m, sku: s(m.sku) || s(l.sku), lineaId: l.id });
    const fromSub = subLin && !/^CABINA_?\d+$/i.test(subLin) && subLin !== "SIN" ? subLin : (subLin ? (subLin.replace(/^CABINA_?/, "Cabina ") ) : bodegaNombre(bod));
    lineas.push({
      id: l.id, orden: n(l.orden), productoId: s(l.producto_id), sku: s(l.sku), nombre: s(l.nombre),
      sububicacion: s(l.sububicacion), fromSub, subCodigo: subLin,
      sistema: admin ? n(l.sistema) : null, mov: round2(mov), esperado: esp,
      contado: l.contado == null || l.contado === "" ? null : n(l.contado), estado: s(l.estado),
      subContada: s(l.sub_contada), buscar: l.buscar === true, otraSub: s(l.otra_sub),
      otraQty: l.otra_qty == null || l.otra_qty === "" ? null : n(l.otra_qty),
      agregado: l.agregado === true, nota: s(l.nota), contadoPor: s(l.contado_por), contadoAt: s(l.contado_at),
      diferencia: admin ? ((l.contado == null || l.contado === "") && s(l.estado) !== "no_encontrado" ? null : round2((s(l.estado) === "no_encontrado" ? 0 : n(l.contado)) - esp)) : null,
    });
  }
  const c = vista(r.c, r.L, ses);
  const operar = (admin || esAsignada(r.c, ses) || (await puedeVerModulo(ctx, ses))) && s(r.c.estado) === "en_conteo";
  const puedeContar = (admin || esAsignada(r.c, ses)) && s(r.c.estado) === "en_conteo";
  return {
    ok: true, conteo: c, lineas, movimientos: recs, admin, ciego: !admin,
    puedeContar, puedeOperar: operar, puedeTerminar: operar,
    puedeEmpezar: (admin || esAsignada(r.c, ses)) && s(r.c.estado) === "asignado",
    puedeRevisar: admin && s(r.c.estado) === "en_revision",
    subs: await subsDe(ctx, bod),
  };
});

extend("cf_iniciar", "any", async (p, ctx, ses) => {
  const r = await cargar(ctx, s(p.id));
  if (!r) return { error: "Conteo no encontrado" };
  if (!esAdmin(ses.rol) && !esAsignada(r.c, ses)) return { error: "Este conteo no está asignado a ti" };
  if (s(r.c.estado) !== "asignado") return { ok: true, ya: true };
  const bodega = s(r.c.bodega), sub = s(r.c.sububicacion);
  const fams = s(r.c.familias).split(",").filter(Boolean);
  // Foto del stock del sistema AHORA: productos inventariables activos con stock en esa bodega/sub.
  const prods = (await listaProductos(ctx, ses)).filter((x) => x.tipo !== "servicio" && x.activo !== false)
    .filter((x) => !fams.length || fams.some((f) => s(x.sku).startsWith(f + "-")))
    .map((x) => ({ x, q: sistemaDe(x, bodega, sub) })).filter((o) => Math.abs(o.q) > 1e-9)
    .sort((a, b) => s(a.x.sku).localeCompare(s(b.x.sku), "es", { numeric: true }));
  let i = 0;
  for (const o of prods.slice(0, 1500)) {
    await ctx.db.write(actorOf(ses), "beta_conteo_lineas", "insert", {}, {
      id: crypto.randomUUID(), conteo_id: r.c.id, orden: ++i, producto_id: s(o.x.id), sku: s(o.x.skuVisible || o.x.sku), nombre: s(o.x.nombre),
      sububicacion: sub || subUnica(o.x, bodega) || null, sistema: round2(o.q), estado: "pendiente",
    });
  }
  await ctx.db.write(actorOf(ses), "beta_conteos", "update", { id: r.c.id }, { estado: "en_conteo", iniciado_at: ctx.now.toISOString(), iniciado_por: actorOf(ses), updated_at: ctx.now.toISOString() });
  return { ok: true, lineas: i };
});

function lineaConteoOut(row: Row, c: Row, ses: Ses, ya: boolean): Row {
  const sub = s(row.sub_contada) || s(row.sububicacion);
  return {
    id: s(row.id), orden: n(row.orden), productoId: s(row.producto_id), sku: s(row.sku), nombre: s(row.nombre),
    sububicacion: s(row.sububicacion), fromSub: sub || bodegaNombre(s(c.bodega), s(c.sububicacion)), subCodigo: sub,
    sistema: esAdmin(ses.rol) ? n(row.sistema) : null, mov: 0, esperado: n(row.esperado ?? row.sistema),
    contado: row.contado == null || row.contado === "" ? null : n(row.contado), estado: s(row.estado),
    subContada: sub, buscar: row.buscar === true, otraSub: s(row.otra_sub), otraQty: row.otra_qty == null || row.otra_qty === "" ? null : n(row.otra_qty),
    agregado: row.agregado === true, ya,
  };
}

extend("cf_guardar", "any", async (p, ctx, ses) => {
  const r = await cargar(ctx, s(p.id));
  if (!r) return { error: "Conteo no encontrado" };
  if (!esAdmin(ses.rol) && !esAsignada(r.c, ses) && !(await puedeVerModulo(ctx, ses))) return { error: "Este conteo no está asignado a ti" };
  if (s(r.c.estado) !== "en_conteo") return { error: "El conteo no está abierto para contar" };
  const now = ctx.now.toISOString(), actor = actorOf(ses);
  const porId = new Map(r.L.map((l) => [s(l.id), l]));
  let cambiadas = 0;
  for (const x of (Array.isArray(p.lineas) ? p.lineas : []).slice(0, 2000) as Row[]) {
    const l = porId.get(s(x.id));
    if (!l) continue;
    const estado = s(x.estado) === "no_encontrado" ? "no_encontrado" : x.contado == null || x.contado === "" ? "pendiente" : "contado";
    const contado = estado === "contado" ? n(x.contado) : null;
    if (contado != null && (contado < 0 || !Number.isFinite(contado))) return { error: s(l.sku) + ": cantidad inválida" };
    const subC = s(x.sub_contada ?? x.subContada ?? x.sububicacion);
    await ctx.db.write(actor, "beta_conteo_lineas", "update", { id: l.id }, {
      contado, estado, sub_contada: subC || null, sububicacion: subC || l.sububicacion || null,
      buscar: x.buscar === true, otra_sub: s(x.otra_sub ?? x.otraSub) || null,
      otra_qty: x.otra_qty == null || x.otra_qty === "" ? (x.otraQty == null || x.otraQty === "" ? null : n(x.otraQty)) : n(x.otra_qty),
      nota: s(x.nota).slice(0, 300) || null, contado_por: estado === "pendiente" ? null : actor, contado_at: estado === "pendiente" ? null : now, updated_at: now,
    });
    cambiadas++;
  }
  let agregada: Row | null = null;
  if (p.agregar && typeof p.agregar === "object") {
    const a = p.agregar as Row;
    const prods = await listaProductos(ctx, ses);
    const code = skuCode(s(a.sku || a.codigo || a.barcode));
    const barra = s(a.barcode || a.codigo || a.sku);
    const pr = prods.find((x) => s(x.id) === s(a.producto_id))
      || (code ? prods.find((x) => skuCode(s(x.sku)) === code || skuCode(s(x.skuVisible)) === code) : undefined)
      || (barra ? prods.find((x) => (Array.isArray(x.barras) ? x.barras : []).some((b) => s(b) === barra)) : undefined);
    if (!pr || pr.tipo === "servicio") return { error: "Ese producto no está en Productos" };
    const ya = r.L.find((l) => s(l.producto_id) === s(pr.id));
    // Un producto, una sola línea por conteo. Si ya está, devolvemos esa línea (idempotente; un doble toque no inserta otra).
    if (ya) {
      return { ok: true, cambiadas, agregada: ya.id, ya: true, linea: lineaConteoOut(ya, r.c, ses, true) };
    }
    // Producto que no estaba en la foto inicial de la bodega: el esperado es 0 (o el stock real si lo hubiera).
    const sistema = sistemaDe(pr, s(r.c.bodega), s(r.c.sububicacion));
    const cont = a.contado == null || a.contado === "" ? null : n(a.contado);
    agregada = {
      id: crypto.randomUUID(), conteo_id: r.c.id, orden: r.L.reduce((m, l) => Math.max(m, n(l.orden)), 0) + 1, producto_id: s(pr.id), sku: s(pr.skuVisible || pr.sku),
      nombre: s(pr.nombre), sububicacion: s(r.c.sububicacion) || null, sistema: round2(sistema), esperado: round2(sistema),
      contado: cont, estado: cont == null ? "pendiente" : "contado",
      agregado: true, contado_por: cont == null ? null : actor, contado_at: cont == null ? null : now,
    };
    try {
      await ctx.db.write(actor, "beta_conteo_lineas", "insert", {}, agregada);
    } catch (err) {
      const otra = (await cargar(ctx, s(r.c.id)))?.L.find((l) => s(l.producto_id) === s(pr.id));
      if (otra) return { ok: true, cambiadas, agregada: otra.id, ya: true, linea: lineaConteoOut(otra, r.c, ses, true) };
      throw err;
    }
  }
  const linea = agregada ? lineaConteoOut(agregada, r.c, ses, false) : null;
  return { ok: true, cambiadas, agregada: agregada ? agregada.id : null, ya: false, linea };
});

extend("cf_enviar", "any", async (p, ctx, ses) => {
  const r = await cargar(ctx, s(p.id));
  if (!r) return { error: "Conteo no encontrado" };
  if (!esAdmin(ses.rol) && !esAsignada(r.c, ses) && !(await puedeVerModulo(ctx, ses))) return { error: "Este conteo no está asignado a ti" };
  if (s(r.c.estado) !== "en_conteo") return { error: "El conteo no está en conteo" };
  const buscar = r.L.filter((l) => l.buscar === true).length;
  if (buscar) return { error: buscar + " producto(s) en «Buscar después»: encuéntralos antes de terminar" };
  const pend = r.L.filter((l) => s(l.estado) === "pendiente" && (l.contado == null || l.contado === "") && !s(l.otra_sub)).length;
  if (pend && p.forzar !== true) return { ok: false, error: "Faltan " + pend + " productos por contar (cuenta o marca «No está»)", faltan: pend, pregunta: "Quedan " + pend + " producto(s) sin contar; no se ajustarán. ¿Terminar y enviar a revisión?" };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const prods = await listaProductos(ctx, ses);
  const porId = new Map(prods.map((x) => [s(x.id), x]));
  for (const l of r.L) {
    const pr = porId.get(s(l.producto_id));
    const subLin = s(l.sub_contada) || s(l.sububicacion) || s(r.c.sububicacion);
    const vivo = pr ? (sistemaDe(pr, s(r.c.bodega), subLin) || sistemaDe(pr, s(r.c.bodega), "")) : n(l.sistema);
    await ctx.db.write(actor, "beta_conteo_lineas", "update", { id: l.id }, { esperado: round2(vivo), updated_at: now });
  }
  await ctx.db.write(actor, "beta_conteos", "update", { id: r.c.id }, { estado: "en_revision", enviado_at: now, enviado_por: actor, updated_at: now });
  for (const u of (await todas(ctx, "usuarios")).filter((x) => esAdmin(s(x.rol)) && !x.bloqueado)) {
    await notificar(ctx, ses, s(u.id), "Conteo para revisar: " + s(r.c.numero), s(r.c.asignado_nombre) + " terminó el conteo de " + bodegaNombre(s(r.c.bodega), s(r.c.sububicacion)) + ".", "#/m/conteos/cf/" + s(r.c.id), s(r.c.id), "conteo_revision");
  }
  return { ok: true };
});

extend("cf_revisar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin revisa conteos" };
  let r = await cargar(ctx, s(p.id));
  if (!r) return { error: "Conteo no encontrado" };
  const que = s(p.que), now = ctx.now.toISOString(), actor = actorOf(ses);
  if (que === "cancelar") {
    if (["aprobado", "cancelado"].includes(s(r.c.estado))) return { error: "Ya está " + s(r.c.estado) };
    await ctx.db.write(actor, "beta_conteos", "update", { id: r.c.id }, { estado: "cancelado", cancelado_at: now, cancelado_por: actor, revision_nota: s(p.nota) || null, updated_at: now });
    return { ok: true };
  }
  if (que === "devolver") {
    if (s(r.c.estado) !== "en_revision") return { error: "El conteo no está en revisión" };
    const nota = s(p.nota).trim();
    if (nota.length < 3) return { error: "Escribe qué hay que revisar" };
    await ctx.db.write(actor, "beta_conteos", "update", { id: r.c.id }, { estado: "en_conteo", revision_nota: nota.slice(0, 500), enviado_at: null, updated_at: now });
    await notificar(ctx, ses, s(r.c.asignado_a), "Conteo devuelto: " + s(r.c.numero), nota, "#/m/conteos/cf/" + s(r.c.id), s(r.c.id), "conteo_devuelto");
    return { ok: true };
  }
  if (que === "aprobar" || que === "aplicar") {
    // TK135: aprobar actualiza el stock real de la bodega. Si ya estaba aprobado
    // y el stock no se había aplicado (p. ej. CF-001), se aplica ahora. Re-aplicar no duplica.
    if (s(r.c.estado) === "en_revision") {
      await ctx.db.write(actor, "beta_conteos", "update", { id: r.c.id }, { estado: "aprobado", aprobado_at: now, aprobado_por: actor, revision_nota: s(p.nota) || null, updated_at: now });
      await notificar(ctx, ses, s(r.c.asignado_a), "Conteo aprobado: " + s(r.c.numero), "Gracias. El inventario de " + bodegaNombre(s(r.c.bodega), s(r.c.sububicacion)) + " quedó actualizado.", "#/m/conteos/cf/" + s(r.c.id), s(r.c.id), "conteo_aprobado");
      const rec = await cargar(ctx, s(r.c.id));
      if (rec) r = rec;
    } else if (s(r.c.estado) !== "aprobado") {
      return { error: "El conteo no está en revisión" };
    }
    const apl = await aplicarConteoAStock(ctx, ses, r.c, r.L);
    return { ok: true, stockAplicado: apl.stockAplicado !== false, ...apl };
  }
  return { error: "Acción inválida" };
});

// Avisos dentro de la app (tarjeta «Asignado a ti» del inicio y campana).
extend("notif_mias", "any", async (_p, ctx, ses) => {
  const rows = (await todas(ctx, "beta_notificaciones")).filter((x) => s(x.usuario) === yo(ses)).sort((a, b) => s(b.created_at).localeCompare(s(a.created_at))).slice(0, 30);
  return { ok: true, items: rows.map((x) => ({ id: x.id, tipo: s(x.tipo), titulo: s(x.titulo), cuerpo: s(x.cuerpo || x.texto), link: s(x.link || x.ruta), leida: !!s(x.leida_at), fecha: s(x.created_at) })), sinLeer: rows.filter((x) => !s(x.leida_at)).length };
});
extend("notif_leer", "any", async (p, ctx, ses) => {
  const ids = new Set((Array.isArray(p.ids) ? p.ids : [p.id]).map((x) => s(x)));
  for (const x of (await todas(ctx, "beta_notificaciones")).filter((r) => s(r.usuario) === yo(ses) && !s(r.leida_at) && (ids.has(s(r.id)) || p.todas === true))) {
    await ctx.db.write(actorOf(ses), "beta_notificaciones", "update", { id: x.id }, { leida_at: ctx.now.toISOString() });
  }
  return { ok: true };
});

import "./conteo_secciones_api.ts";
