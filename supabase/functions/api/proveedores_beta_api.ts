// 🏭 Ficha del proveedor (TK34, Emilia 18/11): base de datos de proveedores como la de clientes — datos,
// historial (OC, cotizaciones, recepciones, restocks, actas, pagos), movimientos de sus productos y notas.
// Cada proveedor (= familia de productos) tiene «🤝 Consignación»: ON → sus productos entran a consignación
// (bodega CONSIGNACION y cálculo de Compras › Consignación); cada producto se puede apagar solo (beta_origen
// = "propio": OC normal e inventario normal). Datos base (nombre, RUC…) se guardan como siempre (proveedores);
// lo nuevo vive en beta_proveedores_ficha. Solo admin edita.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { n, round2, s, skuCode, type Row } from "./domain.ts";
import { vendeDesdeCabina } from "./ventas.ts";
import { consigEfectiva, famDe, famsConsig, fichasProv, FAM_CONSIG_DEF } from "./consig_config.ts";
import { guardarProveedorCampos } from "./inline_api.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const FALTA = "Falta aplicar la SQL de fichas de proveedor (docs/supabase/20261118_beta_proveedores_ficha.sql).";
export const DATOS_EXTRA = ["contacto", "whatsapp", "web", "banco", "cuenta", "plazo", "horario"] as const;
const COD_RE = /^[A-Z]{2,3}$/;

async function fichaDe(ctx: Ctx, cod: string): Promise<Row | null> {
  const f = await fichasProv(ctx); if (!f) return null;
  return f.find((r) => s(r.familia).toUpperCase() === cod) || null;
}
/** Crea o actualiza la ficha (por código). Devuelve error si la tabla no existe. */
async function guardarFicha(ctx: Ctx, ses: Ses, cod: string, patch: Row, accion: string): Promise<Row> {
  const f = await fichasProv(ctx); if (!f) return { error: FALTA };
  const actor = actorOf(ses), now = ctx.now.toISOString();
  const cur = f.find((r) => s(r.familia).toUpperCase() === cod);
  const hist = [...(cur && Array.isArray(cur.historial) ? cur.historial as Row[] : []), { fecha: now, actor, accion }].slice(-100);
  if (cur) await ctx.db.write(actor, "beta_proveedores_ficha", "update", { familia: s(cur.familia) }, { ...patch, historial: hist, updated_at: now });
  else {
    // Primera ficha: las demás familias que hoy son consignación por defecto quedan ON (no cambia nada para ellas).
    if (!f.length) for (const d of FAM_CONSIG_DEF) if (d !== cod) await ctx.db.write(actor, "beta_proveedores_ficha", "insert", {}, { familia: d, consignacion: true, datos: {}, notas: [], historial: [{ fecha: now, actor, accion: "consignación ON (como antes)" }], created_at: now, updated_at: now });
    await ctx.db.write(actor, "beta_proveedores_ficha", "insert", {}, { familia: cod, consignacion: FAM_CONSIG_DEF.includes(cod) && !f.length, datos: {}, notas: [], ...patch, historial: hist, created_at: now, updated_at: now });
  }
  return { ok: true };
}
const codDe = (p: Row) => s(p.codigo).trim().toUpperCase();

/** Ficha completa: { codigo, erpId } (lo demás ya viene en getProveedoresTabla). */
extend("prov_ficha", "any", async (p, ctx, ses) => {
  const cod = codDe(p), erpId = s(p.erpId);
  const [ficha, on, prods, ocsT, cots, recs, rsts, actas, pagos, movs, bods] = await Promise.all([
    cod ? fichaDe(ctx, cod) : Promise.resolve(null), famsConsig(ctx), todas(ctx, "erp_productos"), todas(ctx, "erp_oc"), todas(ctx, "beta_oc_cotizaciones"),
    todas(ctx, "erp_recepciones"), todas(ctx, "beta_consig_restock"), todas(ctx, "beta_actas"), todas(ctx, "erp_oc_pagos"), todas(ctx, "erp_movimientos"), todas(ctx, "erp_bodegas")]);
  const adm = esAdmin(ses.rol);
  const mios = cod ? prods.filter((x) => famDe(s(x.sku)) === cod && x.activo !== false && !s(x.beta_eliminado_at)) : [];
  const provOn = cod ? on.has(cod) : false;
  const productos = mios.map((x) => ({ id: s(x.id), sku: skuCode(s(x.sku)), nombre: s(x.nombre), cabina: vendeDesdeCabina(x), apagado: s(x.beta_origen) === "propio", consig: consigEfectiva(x, on) }))
    .sort((a, b) => a.sku.localeCompare(b.sku));
  const ocs = erpId ? ocsT.filter((o) => s(o.proveedor_id) === erpId) : [];
  const ocIds = new Set(ocs.map((o) => s(o.id))), numOc = new Map(ocs.map((o) => [s(o.id), s(o.numero)]));
  const idsProd = new Map(mios.map((x) => [s(x.id), skuCode(s(x.sku))])), bodN = new Map(bods.map((b) => [s(b.id), s(b.nombre)]));
  const hist: Row[] = [];
  for (const o of ocs) hist.push({ tipo: s(o.tipo) === "consignacion" ? "consignacion" : "oc", emo: s(o.tipo) === "consignacion" ? "🤝" : "🧾", id: s(o.id), numero: s(o.numero) || "Borrador", fecha: s(o.fecha).slice(0, 10), estado: s(o.flujo) || s(o.estado), total: round2(n(o.total)), saldo: round2(n(o.saldo)), go: "#/m/compras/" + s(o.id) });
  for (const c of cots) if (erpId && s(c.proveedor_id) === erpId) hist.push({ tipo: "cotizacion", emo: "📨", id: s(c.id), numero: s(c.numero), fecha: s(c.fecha || c.created_at).slice(0, 10), estado: s(c.estado), total: round2((Array.isArray(c.lineas) ? c.lineas as Row[] : []).reduce((a, l) => a + n(l.cantidad) * n(l.precio), 0)), go: "#/m/compras/cotizaciones" });
  for (const r of recs) if (ocIds.has(s(r.oc_id))) hist.push({ tipo: "recepcion", emo: "📥", id: s(r.id), numero: s(r.numero), fecha: s(r.fecha).slice(0, 10), estado: r.anulada === true ? "Anulada" : "Recibida", detalle: "OC " + s(numOc.get(s(r.oc_id))), go: "#/m/recepciones" });
  for (const r of rsts) if (erpId && s(r.proveedor_id) === erpId) hist.push({ tipo: "restock", emo: "🔁", id: s(r.id), numero: s(r.numero), fecha: s(r.created_at || r.desde).slice(0, 10), estado: s(r.estado), detalle: s(r.desde) + " → " + s(r.hasta), go: "#/m/compras/consignacion" });
  for (const a of actas) if ((erpId && s(a.proveedor_id) === erpId) || ocIds.has(s(a.oc_id))) hist.push({ tipo: "acta", emo: "📝", id: s(a.id), numero: s(a.numero), fecha: s(a.created_at).slice(0, 10), estado: s(a.firmado_at) ? "Firmada" : "Sin firmar" });
  for (const g of pagos) if (ocIds.has(s(g.oc_id))) hist.push({ tipo: "pago", emo: "💳", id: s(g.id), numero: "Pago OC " + s(numOc.get(s(g.oc_id))), fecha: s(g.fecha).slice(0, 10), total: round2(n(g.monto)), detalle: s(g.beta_banco || g.nota), go: "#/m/compras/" + s(g.oc_id) });
  hist.sort((a, b) => s(b.fecha).localeCompare(s(a.fecha)));
  const movimientos = movs.filter((m) => idsProd.has(s(m.producto_id))).sort((a, b) => s(b.fecha).localeCompare(s(a.fecha))).slice(0, 150)
    .map((m) => ({ fecha: s(m.fecha), sku: idsProd.get(s(m.producto_id)), bodega: bodN.get(s(m.bodega_id)) || "", delta: round2(n(m.delta)), tipo: s(m.tipo), doc: s(m.doc_tipo), nota: s(m.nota) }));
  const compras = ocs.filter((o) => s(o.estado) !== "cancelada" && s(o.flujo) !== "Cancelada");
  return {
    ok: true, admin: adm, codigo: cod, falta: (await fichasProv(ctx)) ? "" : FALTA,
    consignacion: provOn, datos: (ficha?.datos || {}) as Row, notas: (Array.isArray(ficha?.notas) ? ficha!.notas as Row[] : []).slice().reverse(),
    cambios: (Array.isArray(ficha?.historial) ? ficha!.historial as Row[] : []).slice().reverse().slice(0, 50),
    productos, historial: hist, movimientos,
    kpis: { ocs: compras.length, comprado: round2(compras.reduce((a, o) => a + n(o.total), 0)), saldo: round2(compras.reduce((a, o) => a + n(o.saldo), 0)), productos: productos.length, enConsig: productos.filter((x) => x.consig).length, ultima: s(hist.find((h) => h.tipo === "oc" || h.tipo === "consignacion")?.fecha) },
  };
});

extend("prov_consig", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const cod = codDe(p); if (!COD_RE.test(cod)) return { error: "Este proveedor no tiene código: créalo primero" };
  const on = p.on === true;
  const r = await guardarFicha(ctx, ses, cod, { consignacion: on }, on ? "🤝 consignación ON" : "consignación OFF");
  if (r.error) return r;
  await logAccion(ctx.db, actorOf(ses), "PROVEEDOR CONSIGNACION", `${cod} · ${on ? "ON" : "OFF"}`);
  return { ok: true };
});

/** Producto dentro del proveedor: on=false lo apaga (OC normal, inventario normal); on=true vuelve a heredar del proveedor. */
extend("prov_prod_consig", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const pr = (await todas(ctx, "erp_productos")).find((x) => s(x.id) === s(p.producto_id));
  if (!pr) return { error: "Producto no encontrado" };
  const cod = famDe(s(pr.sku));
  if (p.on === true && !(await famsConsig(ctx)).has(cod)) return { error: "Primero activa 🤝 Consignación en el proveedor" };
  if (vendeDesdeCabina(pr)) return { error: "Este producto se vende desde Cabina: no va a consignación" };
  const v = p.on === true ? null : "propio";
  await ctx.db.write(actorOf(ses), "erp_productos", "update", { id: pr.id }, { beta_origen: v });
  await logAccion(ctx.db, actorOf(ses), "PRODUCTO ORIGEN/USO", `${s(pr.sku)} · consignación ${p.on === true ? "ON (hereda del proveedor)" : "OFF (propio)"}`);
  if (await fichasProv(ctx)) await guardarFicha(ctx, ses, cod, {}, `${skuCode(s(pr.sku))}: consignación ${p.on === true ? "ON" : "OFF"}`);
  return { ok: true };
});

extend("prov_dato", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const cod = codDe(p); if (!COD_RE.test(cod)) return { error: "Este proveedor no tiene código: créalo primero" };
  const campo = s(p.campo); if (!(DATOS_EXTRA as readonly string[]).includes(campo)) return { error: "Campo inválido" };
  const cur = await fichaDe(ctx, cod);
  const datos = { ...((cur?.datos || {}) as Row), [campo]: s(p.valor).trim().slice(0, 300) };
  return await guardarFicha(ctx, ses, cod, { datos }, `${campo} editado`);
});

extend("prov_nota", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const cod = codDe(p); if (!COD_RE.test(cod)) return { error: "Este proveedor no tiene código: créalo primero" };
  const txt = s(p.texto).trim().slice(0, 1000); if (!txt) return { error: "Escribe la nota" };
  const cur = await fichaDe(ctx, cod);
  const notas = [...(Array.isArray(cur?.notas) ? cur!.notas as Row[] : []), { fecha: ctx.now.toISOString(), autor: ses.name || actorOf(ses), texto: txt }].slice(-200);
  return await guardarFicha(ctx, ses, cod, { notas }, "nota agregada");
});

/** Códigos ya usados: familias de proveedores, prefijos de productos y fichas. */
async function codigosUsados(ctx: Ctx): Promise<Set<string>> {
  const [hojas, prods, f] = await Promise.all([todas(ctx, "proveedores"), todas(ctx, "erp_productos"), fichasProv(ctx)]);
  const u = new Set<string>();
  for (const h of hojas) if (s(h.familia)) u.add(s(h.familia).toUpperCase());
  for (const x of prods) { const c = famDe(s(x.sku)); if (c) u.add(c); }
  for (const r of f || []) u.add(s(r.familia).toUpperCase());
  for (const r of ["SUNSU", "INV", "SU"]) u.add(r);
  return u;
}
export function sugerirCodigo(nombre: string, usados: Set<string>): string {
  const pal = s(nombre).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/)
    .filter((w) => w && !["SA", "S", "A", "SAS", "CIA", "LTDA", "DE", "DEL", "LA", "EL", "Y", "COMPANY", "CORP"].includes(w));
  const cand: string[] = [];
  if (pal.length >= 2) cand.push(pal[0][0] + pal[1][0], pal[0][0] + pal[1][0] + (pal[2] ? pal[2][0] : pal[1][1] || ""));
  if (pal[0]) { const w = pal[0]; cand.push(w.slice(0, 2)); for (let i = 1; i < w.length; i++) cand.push(w[0] + w[i]); for (let i = 1; i < w.length - 1; i++) cand.push(w[0] + w[i] + w[i + 1]); }
  for (const c of cand) if (COD_RE.test(c) && !usados.has(c)) return c;
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) { const c = String.fromCharCode(a, b); if (!usados.has(c)) return c; }
  return "";
}
extend("prov_codigo_sugerir", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  return { ok: true, codigo: sugerirCodigo(s(p.nombre), await codigosUsados(ctx)) };
});
/** Crea el código propio del proveedor (único). Solo si hoy no tiene código propio o ese código no tiene productos. */
extend("prov_codigo_crear", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const cod = codDe(p), fila = s(p.fila);
  if (!COD_RE.test(cod)) return { error: "El código son 2 o 3 letras (ej. AS)" };
  const hoja = (await todas(ctx, "proveedores")).find((r) => s(r.sheet_row) === fila || s(r.id) === fila);
  if (!hoja) return { error: "Proveedor no encontrado" };
  const actual = s(hoja.familia).toUpperCase();
  if (actual === cod) return { ok: true, codigo: cod };
  const usados = await codigosUsados(ctx);
  if (usados.has(cod)) return { error: `El código ${cod} ya existe` };
  if (actual && (await todas(ctx, "erp_productos")).some((x) => famDe(s(x.sku)) === actual)) return { error: `Este proveedor ya tiene el código ${actual} con productos: no se cambia` };
  const r = await guardarProveedorCampos(ctx, ses, fila, { familia: cod });
  if (r.error) return r;
  return { ok: true, codigo: cod };
});
