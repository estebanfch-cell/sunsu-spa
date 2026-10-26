import type { Ctx, Ses } from "./lib.ts";
import { acceso, clampPersonal, esAdmin, gateAccion, matrizDe, modulosVisibles, normalizarRol, redactar } from "./permisos.ts";
import { actorOf, asignarTicketBeta, conTelefono, ensureUsers, espejo, guardarArchivo, kvGet, kvSet, loadSes, logAccion, nextSheet, publico, rowBySheet } from "./lib.ts";
import {
  ADMIN, ALL_ROLES, APP_VERSION, BETA_TABLES, CFG_DEF, FACIALES_2, FACIALES_3, IVA, LEGACY_APPS_SCRIPT_URL,
  PROD_COLS, RECEP, USO_FIELDS, addDays, b, calcularCiclo, comisionProductos, comisionRecepcionDia, contarExtras,
  cotCalcular, ecuadorParts, esCanje, esInterno, estadoTicket, facialSku, hashPin, hmUtc, isAdmin, n, netoCatalogo, newSalt,
  normCedula, normNombre, packSesiones, puedeCotizar, prodCol, productQtys, repartirPagos, rolCalcular, round2,
  s, skuCode, tramosDesdeConfig, validarBitacora, validarPromo, ymdUtc, type ComCfg, type Row, type TicketIn,
} from "./domain.ts";
import { montoGcAplicado, saldoGift } from "./ventas.ts";
import { activarPrueba, ocultarPrueba, purgarPrueba } from "./prueba.ts";

type R = Record<string, unknown>;

function hoy(ctx: Ctx) { return ecuadorParts(ctx.now).ymd; }
function deny(ses: Ses | null, roles: string[]): R | null {
  if (!ses) return { error: "Inicia sesión" };
  if (!roles.includes(ses.rol)) return { error: "No tienes permiso" };
  return null;
}
async function catMap(ctx: Ctx) {
  const rows = await ctx.db.all("catalogo");
  const map = new Map<string, R>();
  for (const r of rows) {
    const code = skuCode(s(r.sku));
    if (!code) continue;
    map.set(code, r);
  }
  return map;
}
function catNombre(map: Map<string, R>, sku: string): string {
  const r = map.get(skuCode(sku));
  return r ? s(r.producto_servicio) : sku;
}
function subtotalDe(map: Map<string, R>, sku: string): number {
  const facial = facialSku(sku);
  const extra = s(sku).toUpperCase().match(/SUNSU-([A-Z]{2,3}-\d+)/);
  const code = facial ? skuCode(facial) : (extra ? extra[1] : skuCode(sku));
  const r = map.get(skuCode(code));
  if (!r) return 0;
  const sub = n(r.subtotal);
  if (sub > 0) return sub;
  const tot = n(r.total_con_iva);
  return tot > 0 ? tot / IVA : 0;
}
export async function cfgConTramos(ctx: Ctx): Promise<ComCfg> {
  const pago = await kvGet(ctx.db, "pago_config");
  const alt = await kvGet(ctx.db, "paquete_tramos");
  const tramos = tramosDesdeConfig(pago) || tramosDesdeConfig(alt);
  return tramos ? { ...CFG_DEF, tramosPaquete: tramos } : CFG_DEF;
}
/** 'SUNSU-01 …' o 'SUNSU-HT-002 …' al inicio del texto, como codDeDH del Apps Script. */
function codAlInicio(txt: string): string | null {
  const m = txt.toUpperCase().match(/^SUNSU-([A-Z]{2,3}-\d+|\d+)/);
  return m ? m[1] : null;
}
function codEnTexto(txt: string): string | null {
  const m = txt.toUpperCase().match(/SUNSU-([A-Z]{2,3}-\d+|\d+)/);
  return m ? m[1] : null;
}
function textoCelda(v: unknown): string {
  const t = s(v);
  if (!t || t.toLowerCase() === "false") return "";
  return t;
}
function enteroHoja(v: unknown): number {
  const x = parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : 0;
}
/** Columna G de la hoja (apellido) si es número; si no, `valor` cuando es un monto y no el texto "Gift Card". */
function montoGift(r: R): number {
  const colG = parseFloat(s(r.apellido_comprador));
  if (colG > 0) return colG;
  const texto = s(r.valor);
  if (/[a-z]/i.test(texto)) return 0;
  const valor = parseFloat(texto);
  return valor > 0 ? valor : 0;
}
function activoCat(v: unknown): boolean {
  return !(v === false || v === "FALSE" || v === "NO" || v === 0 || v === "0");
}
async function tickets(ctx: Ctx) { return ctx.db.all("tickets"); }
const MESES_ES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_ES = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

async function compraMap(ctx: Ctx, cats: Map<string, R>): Promise<Map<string, number>> {
  const compra = new Map<string, number>();
  for (const [code, r] of cats) compra.set(code, n(r.precio_compra));
  for (const b0 of await ctx.db.all("inventario_base")) {
    const code = skuCode(s(b0.sku));
    const real = n(b0.compra);
    if (code && real > 0) compra.set(code, real);
  }
  return compra;
}
async function citasAcuity(ctx: Ctx, ymd: string): Promise<number> {
  const uid = ctx.env.ACUITY_UID;
  const key = ctx.env.ACUITY_KEY;
  if (!uid || !key) return 0;
  try {
    const res = await ctx.fetchImpl(
      "https://acuityscheduling.com/api/v1/appointments?minDate=" + ymd + "T00:00:00&maxDate=" + ymd + "T23:59:59&max=100",
      { headers: { Authorization: "Basic " + btoa(uid + ":" + key) } },
    );
    const parsed = JSON.parse(await res.text());
    if (!Array.isArray(parsed)) return 0;
    return parsed.filter((a) => a && typeof a === "object" && !(a as R).canceled).length;
  } catch {
    return 0;
  }
}
async function dashboard(ctx: Ctx): Promise<R> {
  const ec = ecuadorParts(ctx.now);
  const rows = [...await tickets(ctx)].sort((a, b) => n(a.sheet_row) - n(b.sheet_row));
  const cats = await catMap(ctx);
  const compra = await compraMap(ctx, cats);
  const lunes = addDays(ec.ymd, -((ec.dow + 6) % 7));
  const dias: { k: string; label: string; total: number; tickets: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const k = addDays(lunes, i);
    const day = Number(k.slice(8, 10));
    const dow = new Date(Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, day)).getUTCDay();
    dias.push({ k, label: `${DIAS_ES[dow]} ${day}`, total: 0, tickets: 0 });
  }
  const finMes = new Date(Date.UTC(ec.y, ec.m, 0)).getUTCDate();
  const semanas: { label: string; ini: number; fin: number; total: number }[] = [];
  let cursor = 1;
  let nSem = 1;
  while (cursor <= finMes) {
    const dow = new Date(Date.UTC(ec.y, ec.m - 1, cursor)).getUTCDay();
    let fin = dow === 0 ? cursor : cursor + (7 - dow);
    if (fin > finMes) fin = finMes;
    semanas.push({ label: `Sem ${nSem} (${cursor}–${fin}) (${fin - cursor + 1})`, ini: cursor, fin, total: 0 });
    cursor = fin + 1;
    nSem++;
  }
  const hoyT = {
    tickets: 0, venta: 0, faciales: 0, paquetes: 0, productosN: 0,
    valFac: 0, valPaq: 0, valProd: 0, costoProd: 0, facCanjes: 0,
    extrasN: 0, valExtras: 0, extrasCort: 0, canjes: 0,
    pagos: { efectivo: 0, transferencia: 0, tarjeta: 0, mixto: 0, otros: 0 },
  };
  const topFac = new Map<string, number>();
  const topProd = new Map<string, number>();
  const paqChips: { nombre: string; n: number }[] = [];
  let semTot = 0;
  let mesTot = 0;
  const mesKey = ec.ymd.slice(0, 7);
  for (const t of rows) {
    const k = ymdUtc(t.timestamp);
    if (!k) continue;
    const tot = n(t.estimado);
    if (k.slice(0, 7) === mesKey) {
      mesTot += tot;
      const dia = Number(k.slice(8, 10));
      const sem = semanas.find((w) => dia >= w.ini && dia <= w.fin);
      if (sem) sem.total += tot;
    }
    const enSem = dias.find((d) => d.k === k);
    if (enSem) { enSem.total += tot; enSem.tickets++; semTot += tot; }
    if (k !== ec.ymd) continue;
    hoyT.tickets++;
    hoyT.venta += tot;
    const extras = textoCelda(t.servicios_adicionales);
    if (extras) {
      for (const pieza of extras.split("|")) {
        const p = pieza.trim();
        if (!p) continue;
        hoyT.extrasN++;
        if (p.toUpperCase().includes("CORTES")) { hoyT.extrasCort++; continue; }
        const skuEx = codEnTexto(p);
        if (skuEx) hoyT.valExtras += subtotalDe(cats, skuEx);
      }
    }
    const fac = s(t.facial_hecho);
    const aplicaGc = montoGcAplicado(t.gift_card);
    const gcParcial = aplicaGc > 0 && tot > 0 && !s(t.paquete).toUpperCase().startsWith("SI");
    const canje = esCanje(t.paquete, t.gift_card) && !gcParcial;
    if (fac && fac !== "-" && fac !== "—") {
      hoyT.faciales++;
      topFac.set(fac, (topFac.get(fac) || 0) + 1);
      if (canje) hoyT.facCanjes++;
      else if (gcParcial) {
        const cobro = n((t.orig && typeof t.orig === "object" ? (t.orig as R).gc_facial_cobro : 0)) || Math.max(0, tot - aplicaGc);
        hoyT.valFac += round2(cobro / IVA);
      } else if (tot > 0) hoyT.valFac += subtotalDe(cats, codAlInicio(fac) || "");
      else hoyT.facCanjes++;
    }
    const clienta = s(t.nombre);
    for (const pack of [textoCelda(t.compra_pack_3), textoCelda(t.compra_pack_6)]) {
      if (!pack) continue;
      hoyT.paquetes++;
      hoyT.valPaq += subtotalDe(cats, codAlInicio(pack) || "");
      const nom = pack.replace(/^SUNSU-\d+\s*/, "");
      paqChips.push({ nombre: clienta ? nom + " · " + clienta : nom, n: 1 });
    }
    for (const pc of PROD_COLS) {
      const q = parseInt(String(t[pc.col] ?? ""), 10) || 0;
      if (!(q > 0)) continue;
      hoyT.productosN += q;
      hoyT.valProd += q * subtotalDe(cats, pc.sku);
      hoyT.costoProd += q * (compra.get(pc.sku) || 0);
      const nm = catNombre(cats, pc.sku) || pc.sku;
      topProd.set(nm, (topProd.get(nm) || 0) + q);
    }
    if (canje) hoyT.canjes++;
    const pg = repartirPagos(s(t.comp), tot);
    hoyT.pagos.efectivo += pg.efectivo;
    hoyT.pagos.transferencia += pg.transferencia;
    hoyT.pagos.tarjeta += pg.tarjeta;
    hoyT.pagos.mixto += pg.mixto;
    hoyT.pagos.otros += pg.otros;
  }
  const topFacArr = [...topFac.entries()].map(([nombre, nFac]) => ({ nombre, n: nFac })).sort((a, b) => b.n - a.n).slice(0, 6);
  const topProdArr = [...topProd.entries()].map(([nombre, nPr]) => ({ nombre, n: nPr })).sort((a, b) => b.n - a.n).slice(0, 8);
  let gcHoy = 0;
  let gcVal = 0;
  const gcChips: { nombre: string; n: number }[] = [];
  const gcs = [...await ctx.db.all("gift_cards")].sort((a, b) => n(a.sheet_row) - n(b.sheet_row));
  for (const g of gcs) {
    if (!s(g.codigo_gc)) continue;
    if (enteroHoja(g.dia) !== ec.d || enteroHoja(g.mes) !== ec.m) continue;
    const an = enteroHoja(g.ano);
    if (an && an !== ec.y && an !== ec.y % 100) continue;
    gcHoy++;
    const nom = s(g.nombre_comprador) || s(g.cedula_comprador) || "GC " + s(g.codigo_gc);
    const mon = montoGift(g);
    if (mon > 0) gcVal += mon;
    gcChips.push({ nombre: nom + (mon > 0 ? " · $" + mon.toFixed(0) : ""), n: 1 });
  }
  return {
    hoy: {
      tickets: hoyT.tickets,
      venta: round2(hoyT.venta),
      faciales: hoyT.faciales,
      valFac: round2(hoyT.valFac),
      valPaq: round2(hoyT.valPaq),
      valProd: round2(hoyT.valProd),
      costoProd: round2(hoyT.costoProd),
      facCanjes: hoyT.facCanjes,
      extrasN: hoyT.extrasN,
      valExtras: round2(hoyT.valExtras),
      extrasCort: hoyT.extrasCort,
      paquetes: hoyT.paquetes,
      productosN: hoyT.productosN,
      canjes: hoyT.canjes,
      pagos: hoyT.pagos,
      topFac: topFacArr,
      topProd: topProdArr,
    },
    semana: { total: round2(semTot), dias: dias.map((d) => ({ k: d.k, label: d.label, total: round2(d.total), tickets: d.tickets })) },
    mes: {
      total: round2(mesTot),
      nombre: MESES_ES[ec.m] || "",
      semanas: semanas.map((w) => ({ label: w.label, total: round2(w.total) })),
    },
    caja: await saldoCaja(ctx),
    citasHoy: await citasAcuity(ctx, ec.ymd),
    gcHoy, gcVal: round2(gcVal), gcChips, paqChips,
    actualizado: ec.hm,
  };
}

function cuenta(u: R): R {
  return {
    ...u,
    id: u.id ?? u.usuario,
    nombre: s(u.nombre || u.name || u.usuario),
    short: s(u.short || u.nombre || u.name),
    rol: s(u.rol || u.role),
  };
}
function toIn(r: R): TicketIn {
  return {
    fecha: ymdUtc(r.timestamp), cosm: s(r.atendido_por), cedula: s(r.id_3), facial: s(r.facial_hecho),
    pack3: s(r.compra_pack_3), pack6: s(r.compra_pack_6), extras: s(r.servicios_adicionales),
    exclFacial: b(r.excluir_facial), exclPaquete: b(r.excluir_paquete), exclProducto: b(r.excluir_producto), exclExtras: b(r.excluir_extras),
    productos: productQtys(r),
  };
}
async function marks(ctx: Ctx) {
  const rows = await ctx.db.all("cosmetologas");
  if (!rows.length) {
    return [
      { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es: true, activa: true, desde: null, hasta: null },
      { id: "daniela", nombre: "Daniela Mora", patron: "daniela%", es: true, activa: true, desde: null, hasta: null },
      { id: "dejaneira", nombre: "Dejaneira Espinoza", patron: "dejaneira%", es: false, activa: false, desde: null, hasta: "2026-09-25" },
      { id: "alejandra", nombre: "Alejandra Rodriguez", patron: "alejandra%", es: false, activa: true, desde: null, hasta: null },
    ];
  }
  return rows.map((r) => ({
    id: s(r.id), nombre: s(r.nombre), patron: s(r.patron) || s(r.nombre) + "%",
    es: r.es_cosmetologa !== false && r.es !== false, activa: r.activa !== false,
    desde: r.desde ? s(r.desde) : null, hasta: r.hasta ? s(r.hasta) : null,
  }));
}
async function cicloDe(ctx: Ctx, fecha?: string) {
  const ec = fecha || hoy(ctx);
  const { cicloInicio, cicloFin } = await import("./domain.ts");
  const ciclo = cicloInicio(ec);
  const cmap = await catMap(ctx);
  const tks = (await tickets(ctx)).filter((r) => r.timestamp).map(toIn).map((t) => ({
    ...t,
    netoPack3: netoCatalogo(cmap, t.pack3),
    netoPack6: netoCatalogo(cmap, t.pack6),
  }));
  const ov = await ctx.db.all("ciclo_override");
  const hit = ov.find((r) => s(r.ciclo).slice(0, 10) === ciclo);
  const calc = calcularCiclo(tks, await marks(ctx), await cfgConTramos(ctx), ciclo, hit ? n(hit.n_cosmetologas) : null);
  const bases = await ctx.db.all("inventario_base");
  const compraReal = new Map(bases.map((b0) => [skuCode(s(b0.sku)), n(b0.compra)]));
  for (const p of calc.personas) {
    const propios = tks.filter((t) => t.fecha >= ciclo && t.fecha <= cicloFin(ciclo) && t.cosm === p.cosm && !t.exclProducto);
    const items = propios.flatMap((t) => t.productos.map((pr) => ({
      venta: subtotalDe(cmap, pr.sku),
      compra: compraReal.get(skuCode(pr.sku)) || n(cmap.get(skuCode(pr.sku))?.precio_compra),
      qty: pr.qty, excluido: false,
    })));
    p.comProductos = comisionProductos(items, CFG_DEF.pctProd);
    p.totalProductos = items.reduce((a, it) => a + it.qty, 0);
  }
  const recepDias = new Map<string, number>();
  for (const t of tks) {
    if (t.fecha < ciclo || t.fecha > cicloFin(ciclo) || !facialSku(t.facial) || esInterno(t.cosm, t.cedula)) continue;
    recepDias.set(t.fecha, (recepDias.get(t.fecha) || 0) + 1);
  }
  let comRecep = 0, diasRecep = 0;
  for (const [f, c] of recepDias) {
    const v = comisionRecepcionDia(f, c);
    if (v > 0) { comRecep += v; diasRecep++; }
  }
  const multas = await ctx.db.all("multas_descuentos");
  return { calc, comRecep: round2(comRecep), diasRecep, multas, ciclo, fin: cicloFin(ciclo) };
}
function multasDe(nombre: string, ciclo: string, fin: string, rows: R[]) {
  let mlt = 0, desc = 0;
  const key = normNombre(nombre).split(" ")[0];
  for (const r of rows) {
    const f = ymdUtc(r.fecha);
    if (!f || f < ciclo || f > fin) continue;
    if (!normNombre(r.cosmetologa).includes(key)) continue;
    const tipo = s(r.tipo).toLowerCase();
    if (tipo === "multa") mlt += n(r.monto);
    else if (tipo === "descuento") desc += n(r.monto);
  }
  return { mlt: round2(mlt), desc: round2(desc) };
}
function usosDe(r: R) {
  return USO_FIELDS.map(([u, f]) => ({ usado: b(r[u]) || !!s(r[f]), fecha: s(r[f]) }));
}
function blankDia(v: unknown): boolean {
  if (v == null || v === "" || v === false) return true;
  return Number.isNaN(parseFloat(String(v)));
}

async function cfgMap(ctx: Ctx): Promise<Map<string, string>> {
  const rows = await ctx.db.all("configuracion");
  const m = new Map<string, string>();
  for (const r of rows) {
    const k = s(r.col_1).toUpperCase();
    if (k) m.set(k, s(r.col_2));
    const orig = r.orig;
    if (orig && typeof orig === "object") {
      const o = orig as R;
      const kk = s(o.col_1 || Object.values(o)[0]).toUpperCase();
      if (kk && !m.has(kk)) m.set(kk, s(o.col_2 || Object.values(o)[1]));
    }
  }
  return m;
}

function productosPatch(productos: R | undefined, replace: boolean, prev: R): R {
  const orig: R = { ...(prev.orig && typeof prev.orig === "object" ? prev.orig as R : {}) };
  const patch: R = {};
  if (replace) {
    for (const c of PROD_COLS) {
      patch[c.col] = null;
      delete orig[c.sku];
      delete orig["SUNSU-" + c.sku];
    }
  }
  for (const [sku, qty] of Object.entries(productos || {})) {
    const col = prodCol(String(sku));
    const q = n(qty);
    if (!col) continue;
    patch[col.col] = q > 0 ? (col.typ === "text" ? String(q) : q) : null;
    if (q > 0) orig[col.sku] = q;
    else delete orig[col.sku];
  }
  patch.orig = orig;
  return patch;
}

async function saldoCaja(ctx: Ctx): Promise<number> {
  const rows = [...await ctx.db.all("caja_chica")].sort((a, b) => n(a.sheet_row) - n(b.sheet_row));
  if (!rows.length) return 0;
  let idxIni = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (s(rows[i].tipo).toUpperCase().includes("SALDO INICIAL")) { idxIni = i; break; }
  }
  let saldo = 0;
  const start = idxIni < 0 ? 0 : idxIni;
  for (let i = start; i < rows.length; i++) {
    if (i === idxIni) saldo = n(rows[i].entrada);
    else saldo = round2(saldo + n(rows[i].entrada) - n(rows[i].salida));
  }
  return round2(saldo);
}
async function appendCaja(ctx: Ctx, ses: Ses, tipo: string, detalle: string, quien: string, entrada: number, salida: number, ref = ""): Promise<number> {
  const saldo = round2(await saldoCaja(ctx) + entrada - salida);
  const sheet_row = await nextSheet(ctx.db, "caja_chica");
  const ec = ecuadorParts(ctx.now);
  const actor = actorOf(ses);
  await ctx.db.write(actor, "caja_chica", "insert", {}, {
    sheet_row, fecha_hora: ec.isoWall, tipo, detalle_justificativo: detalle, quien,
    entrada, salida, saldo, ref, registrado_por: ses.name,
    orig: { tipo, detalle, quien, entrada, salida, saldo, ref },
  });
  return saldo;
}

export async function doLogin(p: R, ctx: Ctx): Promise<R> {
  const pin = s(p.pin);
  if (!pin) return { error: "Falta el PIN" };
  try {
    const via = await ctx.db.rpc("login_pin", { p_pin: pin, p_ip: s(p.ip) }) as R | null;
    if (via && typeof via === "object") {
      if (via.error && !via.ok) return { error: s(via.error) };
      if (via.ok) return abrirSesion(ctx, (via.user as R) || via);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/login_pin|PGRST202|schema cache|Could not find the function/i.test(msg)) {
      return { error: "No se pudo verificar el PIN" };
    }
  }
  await ensureUsers(ctx.db, "sistema");
  const users = await ctx.db.all("usuarios");
  let found: R | null = null;
  for (const u of users) {
    if (!u.pin_hash || !u.pin_salt) continue;
    const h = await hashPin(pin, String(u.pin_salt));
    if (h === u.pin_hash) { found = u; break; }
  }
  if (!found) {
    let legacy: R = {};
    try { legacy = await ctx.legacyLogin(pin); } catch { legacy = { error: "legado" }; }
    if (!legacy.ok || !legacy.user) return { error: s(legacy.error) || "PIN incorrecto" };
    const lu = legacy.user as R;
    const id = s(lu.id);
    let u = users.find((x) => x.id === id);
    const salt = newSalt();
    const pin_hash = await hashPin(pin, salt);
    if (!u) {
      await ctx.db.write("login:" + id, "usuarios", "insert", {}, {
        id, nombre: s(lu.name) || id, short: s(lu.short) || id, rol: s(lu.role) || "staff",
        color: s(lu.color) || "#5B7FA6", pin_hash, pin_salt: salt, bloqueado: false, pin_reset: false,
      });
      u = (await ctx.db.all("usuarios")).find((x) => x.id === id)!;
    } else {
      await ctx.db.write("login:" + id, "usuarios", "update", { id }, { pin_hash, pin_salt: salt });
      u = { ...u, pin_hash, pin_salt: salt };
    }
    found = u;
  }
  if (found.bloqueado === true) return { error: "⚙️ Sistema en actualización — si requieres información adicional, comunícate con el administrador" };
  const token = crypto.randomUUID();
  const exp = new Date(ctx.now.getTime() + 30 * 24 * 3600 * 1000).toISOString();
  await ctx.db.write(s(found.nombre), "sesiones", "insert", {}, { token, uid: found.id, rol: found.rol, exp });
  await logAccion(ctx.db, s(found.nombre), "LOGIN", s(found.nombre));
  const pub = publico(found);
  pub.role = normalizarRol(s(pub.role));
  const matriz = await matrizDe(ctx.db);
  return { ok: true, token, user: pub, modulos: modulosVisibles(s(pub.role), matriz), ver_costos: acceso(s(pub.role), "ver_costos", matriz) === "todos" };
}

async function abrirSesion(ctx: Ctx, u: R): Promise<R> {
  const id = s(u.id || u.usuario);
  const nombre = s(u.nombre || u.name || id);
  const rol = normalizarRol(s(u.rol || u.role));
  if (u.bloqueado === true) return { error: "⚙️ Sistema en actualización — si requieres información adicional, comunícate con el administrador" };
  const token = crypto.randomUUID();
  const exp = new Date(ctx.now.getTime() + 30 * 24 * 3600 * 1000).toISOString();
  await ctx.db.write(nombre, "sesiones", "insert", {}, { token, uid: id, rol, exp });
  await logAccion(ctx.db, nombre, "LOGIN", nombre);
  const matriz = await matrizDe(ctx.db);
  let esCosm = false;
  try {
    const marks = await ctx.db.all("cosmetologas");
    const m = marks.find((x) => x.id === id || normNombre(s(x.nombre)) === normNombre(nombre));
    esCosm = !!m && m.es_cosmetologa === true;
  } catch { esCosm = false; }
  return {
    ok: true, token,
    user: { id, name: nombre, short: s(u.short) || nombre, role: rol, color: s(u.color), bloqueado: false, pinReset: !!u.pin_reset, es_cosmetologa: esCosm },
    modulos: modulosVisibles(rol, matriz),
    ver_costos: acceso(rol, "ver_costos", matriz) === "todos",
  };
}

export async function crearTicket(p: R, ctx: Ctx, ses: Ses): Promise<R> {
  const ec = ecuadorParts(ctx.now);
  const ident = await asignarTicketBeta(ctx.db, ctx.now);
  const notas = s(p.notas) + (p.descuento ? " · 🏷 Descuento: " + s(p.descuento) : "");
  const base: R = {
    sheet_row: null,
    origin: ident.origin,
    beta_num: ident.beta_num,
    timestamp: ec.isoWall,
    atendido_por: s(p.cosmetologa),
    id_3: s(p.cedula),
    nombre: s(p.nombre),
    apellido: s(p.apellido),
    estimado: n(p.estimado),
    fecha_retorno: s(p.fechaRetorno),
    recomendaciones: s(p.recomendaciones),
    notas_generales: notas.trim(),
    paquete: s(p.colQ),
    gift_card: s(p.colR),
    venta_gift: s(p.colS),
    facial_hecho: s(p.facial),
    compra_pack_3: s(p.pack3),
    compra_pack_6: s(p.pack6),
    servicios_adicionales: s(p.extras),
    seguimiento: "",
    agendado: false,
    orig: {},
  };
  const prod = productosPatch((p.productos || {}) as R, false, base);
  Object.assign(base, prod);
  base.estado = estadoTicket({ seguimiento: "", agendado: false, retorno: s(p.fechaRetorno) }, ec.ymd);
  const actor = actorOf(ses);
  const identRef = ident.beta_num;
  let gcAplicada: R | null = null;
  if (s(p.colR)) {
    const { consumirGiftAlCrear } = await import("./ventas_api.ts");
    gcAplicada = await consumirGiftAlCrear(ctx, ses, s(p.colR), identRef, s(p.nombre), n(p.facialPrecio));
    if (gcAplicada && gcAplicada.error && /alcanza|saldo|aplica/i.test(s(gcAplicada.error))) return gcAplicada;
    if (gcAplicada && gcAplicada.ok) {
      (base.orig as R).gc_aplica = gcAplicada.aplicado;
      (base.orig as R).gc_facial_cobro = gcAplicada.facialCobro;
    }
  }
  const fotosWarn: string[] = [];
  for (const [campo, col] of [["fotosAntes", "fotos_antes"], ["fotosDespues", "fotos_despues"]] as const) {
    const arr = Array.isArray(p[campo]) ? p[campo] as unknown[] : [];
    const urls: string[] = [];
    for (const item of arr) {
      const v = s(item);
      if (v.startsWith("http")) urls.push(v);
      else if (v.includes("base64,")) {
        const id = await guardarArchivo(ctx.db, actor, campo, "ticket", v);
        if (id) urls.push(`archivo:${id}`);
        else fotosWarn.push(campo);
      }
    }
    if (urls.length) base[col] = urls.join(" | ");
  }
  (base.orig as R).timestamp = ec.stamp;
  (base.orig as R).beta = true;
  const saved = await ctx.db.write(actor, "tickets", "insert", {}, base);
  const ticket = ident.beta_num;
  if ((s(p.pack3) || s(p.pack6)) && s(p.cedula)) {
    const paqRow = await nextSheet(ctx.db, "paquetes");
    const txt = s(p.pack3) || s(p.pack6);
    const skuM = txt.match(/SUNSU-\d+/);
    await ctx.db.write(actor, "paquetes", "insert", {}, {
      sheet_row: paqRow, dia: ec.d, mes: ec.m, ano: ec.y, cedula: s(p.cedula),
      nombres: s(p.nombre), apellidos: s(p.apellido), sku: skuM ? skuM[0] : txt, paquete: txt,
      vendido_por: s(p.cosmetologa), notas: ec.isoWall, orig: { ticket, ts: ec.isoWall },
    });
    const slots = ([] as R[]).concat((p.paq2gcSlots3 as R[]) || [], (p.paq2gcSlots6 as R[]) || []).filter((x) => x && x.codigo);
    if (slots.length) await marcarSlotsGC(ctx, actor, paqRow, slots);
  }
  await logAccion(ctx.db, actor, "TICKET", ticket);
  return {
    ok: true, fila: null, ticket, beta_num: ident.beta_num, origin: ident.origin, id: saved?.id,
    gc: gcAplicada && gcAplicada.ok ? gcAplicada : undefined,
    fotosPendientes: fotosWarn.length ? "La beta guardó el ticket. Alguna foto no cupo (límite 1.5 MB) y no se subió a Drive." : undefined,
  };
}

async function marcarSlotsGC(ctx: Ctx, actor: string, sheetRow: number, slots: R[]) {
  const row = await rowBySheet(ctx.db, "paquetes", sheetRow);
  if (!row) return;
  const patch: R = {};
  let i = 0;
  for (const [u, f] of USO_FIELDS) {
    if (i >= slots.length) break;
    if (!b(row[u]) && !s(row[f])) {
      patch[u] = true;
      patch[f] = "Gift Card, " + s(slots[i].codigo);
      i++;
    }
  }
  if (Object.keys(patch).length) await ctx.db.write(actor, "paquetes", "update", { sheet_row: sheetRow }, patch);
}

async function dispatch(action: string, p: R, ctx: Ctx): Promise<unknown> {
  if (action === "version" || action === "getVersion") return { version: APP_VERSION };
  if (action === "login") return doLogin(p, ctx);
  const ses = await loadSes(ctx, p.token);
  const need = (roles: string[]) => deny(ses, roles);
  const A = actorOf(ses, s(p.usuario) || "beta");

  if (action === "usuarioCambiarPin") {
    const uid = s(p.uid);
    const pinNuevo = s(p.pinNuevo);
    const pinActual = s(p.pinActual);
    if (!/^\d{4}$/.test(pinNuevo)) return { error: "La clave nueva debe ser de 4 dígitos" };
    const app = (await ctx.db.all("app_usuarios")).map(cuenta);
    if (app.length) {
      const u = app.find((x) => String(x.id) === uid);
      if (!u) return { error: "Usuario no encontrado" };
      if (u.bloqueado) return { error: "⚙️ Sistema en actualización — si requieres información adicional, comunícate con el administrador" };
      const falta = "No se pudo verificar el PIN. Aplica 0009b_compat_0008.sql.";
      let coincide: unknown;
      let enUso: unknown;
      let hash: unknown;
      try { coincide = await ctx.db.rpc("pin_coincide", { p_id: uid, p_pin: pinActual }); }
      catch { return { error: falta }; }
      if (coincide !== true) return { error: "Clave actual incorrecta" };
      try { enUso = await ctx.db.rpc("pin_en_uso", { p_pin: pinNuevo, p_excepto: uid }); }
      catch { return { error: falta }; }
      if (enUso === true) return { error: "Esa clave ya la usa otro usuario — elige otra" };
      try { hash = await ctx.db.rpc("hash_pin_bcrypt", { p_pin: pinNuevo }); }
      catch { return { error: falta }; }
      if (typeof hash !== "string" || !hash.startsWith("$2")) return { error: falta };
      await ctx.db.write(s(u.nombre), "app_usuarios", "update", { id: u.id }, { pin_hash: hash, pin_reset: false });
      return { ok: true };
    }
    await ensureUsers(ctx.db, "sistema");
    const users = await ctx.db.all("usuarios");
    const u = users.find((x) => x.id === uid);
    if (!u) return { error: "Usuario no encontrado" };
    if (u.bloqueado) return { error: "⚙️ Sistema en actualización — si requieres información adicional, comunícate con el administrador" };
    if (!u.pin_hash || await hashPin(pinActual, s(u.pin_salt)) !== u.pin_hash) return { error: "Clave actual incorrecta" };
    for (const o of users) {
      if (o.id === uid || !o.pin_hash) continue;
      if (await hashPin(pinNuevo, s(o.pin_salt)) === o.pin_hash) return { error: "Esa clave ya la usa otro usuario — elige otra" };
    }
    const salt = newSalt();
    await ctx.db.write(s(u.nombre), "usuarios", "update", { id: uid }, { pin_hash: await hashPin(pinNuevo, salt), pin_salt: salt, pin_reset: false });
    return { ok: true };
  }

  if (action === "getUsuarios") {
    const app = await ctx.db.all("app_usuarios");
    if (app.length) {
      return app.map((raw) => {
        const u = cuenta(raw);
        return {
          id: u.id, name: u.nombre, short: u.short, role: normalizarRol(s(u.rol)),
          color: u.color, bloqueado: !!u.bloqueado, pinReset: !!u.pin_reset,
        };
      });
    }
    await ensureUsers(ctx.db, "sistema");
    return (await ctx.db.all("usuarios")).map(publico);
  }
  if (action === "usuarioBloqueado") {
    const app = (await ctx.db.all("app_usuarios")).map(cuenta);
    const rows = app.length ? app : await ctx.db.all("usuarios");
    const u = rows.find((x) => String(x.id) === s(p.uid));
    return { bloqueado: !u || !!u.bloqueado };
  }
  if (action === "usuariosFull") {
    const d = need(["admin_master", "super_admin"]); if (d) return d;
    const app = await ctx.db.all("app_usuarios");
    const rows = app.length ? app.map(cuenta) : await ctx.db.all("usuarios");
    return { ok: true, users: rows.map((u) => ({ ...publico(u), pin: u.pin_hash ? "••••" : "" })) };
  }
  if (action === "usuarioPinReset" || action === "usuarioBloquear" || action === "saveUsuarios") {
    const d = need(action === "saveUsuarios" ? ["admin_master", "super_admin"] : ADMIN); if (d) return d;
    const app = await ctx.db.all("app_usuarios");
    const table = app.length ? "app_usuarios" : "usuarios";
    const prev = app.length ? app.map(cuenta) : await ctx.db.all("usuarios");
    if (action === "usuarioBloquear") {
      if (s(p.uid) === "efch") return { error: "El admin_master no se puede bloquear" };
      const u = prev.find((x) => String(x.id) === s(p.uid));
      if (!u) return { error: "Usuario no encontrado" };
      await ctx.db.write(A, table, "update", { id: u.id }, { bloqueado: !!p.bloqueado });
      if (p.bloqueado) {
        for (const tk of await ctx.db.all("sesiones")) {
          if (String(tk.uid) === String(u.id)) await ctx.db.write(A, "sesiones", "delete", { token: tk.token }, null);
        }
      }
      return { ok: true, uid: u.id, bloqueado: !!p.bloqueado };
    }
    if (action === "usuarioPinReset") {
      const u = prev.find((x) => String(x.id) === s(p.uid));
      if (!u) return { error: "Usuario no encontrado" };
      await ctx.db.write(A, table, "update", { id: u.id }, { pin_reset: !!p.activar });
      return { ok: true, uid: u.id, pinReset: !!p.activar };
    }
    for (const u of (p.users as R[]) || []) {
      const old = prev.find((x) => String(x.id) === s(u.id));
      const row = { id: s(u.id), nombre: s(u.name), short: s(u.short), rol: s(u.role) || "staff", color: s(u.color) };
      if (old) await ctx.db.write(A, table, "update", { id: row.id }, row);
      else await ctx.db.write(A, table, "insert", {}, { ...row, bloqueado: false, pin_reset: false });
    }
    return { ok: true };
  }

  const sessionActions = new Set(["version", "getVersion", "login", "usuarioCambiarPin", "getUsuarios", "usuarioBloqueado"]);
  if (!sessionActions.has(action)) {
    const openReads = new Set(["getCatalogo", "getPromos", "getCodigoGC", "getCodigosGC", "getProdColMap", "getMensajes", "getPlantillaGC", "existeCedula", "getRegistro"]);
    if (!ses && !openReads.has(action)) return { error: "Inicia sesión" };
  }

  if (action === "registrarCliente") return registrarCliente(p, ctx, ses!);
  if (action === "saveRegistroCliente") {
    const d = need(ADMIN); if (d) return d;
    return saveRegistro(p, ctx, ses!);
  }
  if (action === "existeCedula") return existeCedula(p, ctx);
  if (action === "getRegistro") return getRegistro(p, ctx);
  if (action === "getRegistroClientes" || action === "getFichasRegistro" || action === "getAutorizaFotos") return fichas(action, p, ctx, ses);
  if (action === "crearTicket" || action === "") return crearTicket(p, ctx, ses!);

  const fn = FNS[action];
  if (!fn) return { error: "Acción no implementada en la beta: " + action, beta: true };
  return fn(p, ctx, ses);
}

export async function handle(action: string, p: R, ctx: Ctx): Promise<unknown> {
  const ses0 = action === "login" || action === "version" || action === "getVersion" ? null : await loadSes(ctx, p.token);
  const matriz = await matrizDe(ctx.db);
  const gate = gateAccion(action, ses0, matriz);
  if (gate) return gate;
  if (action === "modo_prueba" || action === "prueba_borrar") {
    if (!ses0) return { error: "Inicia sesión" };
    if (!esAdmin(ses0.rol)) return { error: "Solo un admin puede usar el modo prueba" };
    const actor = actorOf(ses0);
    if (action === "prueba_borrar") return purgarPrueba(ctx.db, actor);
    const on = p.on === true || p.on === "true" || p.on === 1;
    const saved = await ctx.db.write(actor, "sesiones", "update", { token: ses0.token }, { modo_prueba: on });
    if (!saved) return { error: "Sesión no encontrada" };
    if (on && saved.modo_prueba !== true) return { error: "Aplica 0016_modo_prueba.sql antes de usar el modo prueba" };
    await logAccion(ctx.db, actor, on ? "MODO PRUEBA ON" : "MODO PRUEBA OFF", ses0.name);
    return { ok: true, modo_prueba: on };
  }
  const db = ses0?.prueba ? activarPrueba(ctx.db) : ocultarPrueba(ctx.db);
  const out = await dispatch(action, clampPersonal(action, p, ses0, matriz), { ...ctx, db });
  return redactar(action, out, ses0, matriz);
}

async function existeCedula(p: R, ctx: Ctx): Promise<R> {
  const ced = normCedula(p.ced);
  if (!ced) return { existe: false };
  const rows = await ctx.db.all("clientas_registro");
  for (const r of rows) {
    if (normCedula(r.cedula) !== ced) continue;
    if (r.timestamp) return { existe: true, fila: r.sheet_row, nombre: s(r.nombre) };
    return { existe: false, completar: true, fila: r.sheet_row, nombre: s(r.nombre), apellido: s(r.apellido) };
  }
  return { existe: false };
}
async function getRegistro(p: R, ctx: Ctx): Promise<R> {
  const q = s(p.q).toLowerCase();
  const ced = s(p.ced);
  const rows = await ctx.db.all("clientas_registro");
  const data = [];
  for (const r of rows) {
    const c = s(r.cedula).split(".")[0];
    const nom = s(r.nombre), ape = s(r.apellido);
    if (!c && !nom) continue;
    if (ced && c === ced) return { ok: true, data: [{ cedula: c, nombre: nom, apellido: ape }] };
    if (q) {
      const a = (nom + " " + ape).toLowerCase();
      const b2 = (ape + " " + nom).toLowerCase();
      if (a === q || b2 === q || a.includes(q) || b2.includes(q)) {
        data.push({ cedula: c, nombre: nom, apellido: ape });
        if (data.length >= 10) break;
      }
    }
  }
  return { ok: true, data };
}
async function registrarCliente(p: R, ctx: Ctx, ses: Ses): Promise<R> {
  const ced = normCedula(p.cedula);
  const nombre = s(p.nombre);
  if (!ced || !nombre) return { error: "Cédula y nombre son obligatorios" };
  const rows = await ctx.db.all("clientas_registro");
  const ex = rows.find((r) => normCedula(r.cedula) === ced);
  const campos = camposRegistro(p);
  const actor = actorOf(ses);
  if (ex && ex.timestamp && !p.forzar) return { existe: true, yaRegistrada: true, fila: ex.sheet_row };
  if (ex && (!ex.timestamp || p.forzar)) {
    await ctx.db.write(actor, "clientas_registro", "update", { sheet_row: ex.sheet_row }, { ...campos, timestamp: ex.timestamp || ecuadorParts(ctx.now).isoWall, cedula: ced });
    return { ok: true, fila: ex.sheet_row, actualizada: true };
  }
  const sheet_row = await nextSheet(ctx.db, "clientas_registro");
  const ec = ecuadorParts(ctx.now);
  const savedCli = await ctx.db.write(actor, "clientas_registro", "insert", {}, {
    sheet_row, timestamp: ec.isoWall, cedula: ced, ...campos,
    apruebo_consentimiento_individual: "SI — " + `${pad(ec.d)}/${pad(ec.m)}/${ec.y} ${ec.hm}`,
    orig: { cedula: ced, nombre },
  });
  return { ok: true, fila: savedCli?.sheet_row ?? sheet_row };
}
function pad(x: number) { return String(x).padStart(2, "0"); }
function camposRegistro(p: R): R {
  const c = (p.campos as R) || p;
  const out: R = {};
  const map: Record<string, string> = {
    nombre: "nombre", apellido: "apellido", telefono: "telefono", sector: "sector_donde_vive",
    tipoPiel: "tipo_de_piel", estado: "estado_actual", alergias: "alergias", medicacion: "medicacion",
    condiciones: "condiciones_medicas_o_dermatologicas_que_debamos_saber",
    fechaNacimiento: "fecha_de_nacimiento", autorizaFotos: "autoriza_fotos",
  };
  for (const [k, col] of Object.entries(map)) if (c[k] != null) out[col] = s(c[k]);
  if (p.nombre && !out.nombre) out.nombre = s(p.nombre);
  if (p.apellido && !out.apellido) out.apellido = s(p.apellido);
  if (p.telefono && !out.telefono) out.telefono = s(p.telefono);
  return out;
}
async function saveRegistro(p: R, ctx: Ctx, ses: Ses): Promise<R> {
  const row = await rowBySheet(ctx.db, "clientas_registro", n(p.row));
  if (!row) return { error: "Fila inválida" };
  if (s(p.cedula) && normCedula(row.cedula) && normCedula(p.cedula) !== normCedula(row.cedula)) return { error: "La fila no coincide. Refresca la lista." };
  const campos = camposRegistro(p);
  await ctx.db.write(actorOf(ses), "clientas_registro", "update", { sheet_row: row.sheet_row }, campos);
  return { ok: true, escritos: Object.keys(campos).length };
}
function fichaDe(r: R, tel: boolean): R {
  const o: R = {
    row: r.sheet_row, cedula: s(r.cedula).split(".")[0], nombre: s(r.nombre), apellido: s(r.apellido),
    nacimiento: ymdUtc(r.fecha_de_nacimiento), sector: s(r.sector_donde_vive), tipoPiel: s(r.tipo_de_piel),
    estado: s(r.estado_actual), alergias: s(r.alergias), medicacion: s(r.medicacion),
    condiciones: s(r.condiciones_medicas_o_dermatologicas_que_debamos_saber),
    reacciones: s(r.reacciones_previas_a_tratamientos), retinoides: s(r.uso_de_exfoliantes_retintines),
    ciclo: s(r.ciclo_mestrual_si_aplica), extracciones: s(r.deseas_extracciones_de_comedones_o_espinillas_si_es_nec),
    cortesia: s(r.cortesia_complementaria), autorizaFotos: s(r.autoriza_fotos),
  };
  if (tel) o.telefono = s(r.telefono);
  return o;
}
async function fichas(action: string, _p: R, ctx: Ctx, ses: Ses | null): Promise<R> {
  const rows = await ctx.db.all("clientas_registro");
  const tel = conTelefono(ses);
  if (action === "getAutorizaFotos") {
    const noAutoriza: R = {}, noAutorizaNom: R = {};
    for (const r of rows) {
      if (s(r.autoriza_fotos).toUpperCase() !== "NO") continue;
      const c = s(r.cedula).split(".")[0];
      const nom = normNombre(s(r.nombre) + " " + s(r.apellido));
      if (c) noAutoriza[c] = true;
      if (nom) noAutorizaNom[nom] = true;
    }
    return { noAutoriza, noAutorizaNom };
  }
  if (action === "getFichasRegistro") {
    const porCedula: R = {}, porNombre: R = {};
    for (const r of rows) {
      const f = fichaDe(r, tel);
      if (!tel) delete f.telefono;
      const c = s(f.cedula);
      const nom = normNombre(s(r.nombre) + " " + s(r.apellido));
      if (c) porCedula[c] = f;
      if (nom) porNombre[nom] = f;
    }
    return { porCedula, porNombre };
  }
  const items = rows.filter((r) => s(r.cedula) || s(r.nombre)).map((r) => fichaDe(r, tel));
  items.sort((a, b) => s(a.nombre).localeCompare(s(b.nombre)));
  return { items, conTel: tel };
}

const FNS: Record<string, (p: R, ctx: Ctx, ses: Ses | null) => Promise<unknown>> = {};

function reg(name: string, roles: string[] | "any", fn: (p: R, ctx: Ctx, ses: Ses) => Promise<unknown>) {
  FNS[name] = async (p, ctx, ses) => {
    if (roles !== "any") {
      const d = deny(ses, roles);
      if (d) return d;
    }
    if (!ses) return { error: "Inicia sesión" };
    return fn(p, ctx, ses);
  };
}

reg("getCatalogo", "any", async (_p, ctx) => {
  const map = await catMap(ctx);
  const bases = await ctx.db.all("inventario_base");
  const compra = new Map(bases.map((b0) => [skuCode(s(b0.sku)), n(b0.compra)]));
  const items = [];
  for (const r of map.values()) {
    const sku = s(r.sku);
    if (!sku) continue;
    const sub = n(r.subtotal), tot = n(r.total_con_iva);
    items.push({
      sku, nombre: s(r.producto_servicio), tipo: s(r.tipo), subtotal: sub,
      total: tot > 0 ? tot : sub, compra: n(r.precio_compra),
      compraReal: compra.get(skuCode(sku)) || 0, com: n(r.comi_producto_30), activo: activoCat(r.activo),
    });
  }
  return items;
});

reg("getProdColMap", "any", async () => {
  const mapa: R = {};
  PROD_COLS.forEach((c, i) => { mapa["SUNSU-" + c.sku] = 25 + i; mapa[c.sku] = 25 + i; });
  return { mapa };
});
reg("repararColumnasTicket", "any", async () => ({ ok: true, beta: "Las columnas viven en la tabla tickets; no hay que reparar una hoja." }));

reg("getInventario", "any", async (_p, ctx) => {
  const cmap = await catMap(ctx);
  const bases = await ctx.db.all("inventario_base");
  const base = new Map(bases.map((b0) => [skuCode(s(b0.sku)), b0]));
  const entradas = await ctx.db.all("inventario_entradas");
  const tks = await tickets(ctx);
  const ventas = new Map<string, number>();
  for (const t of tks) {
    if (ymdUtc(t.timestamp) < "2026-05-22") continue;
    for (const pr of productQtys(t)) ventas.set(pr.sku, (ventas.get(pr.sku) || 0) + pr.qty);
  }
  const ent = new Map<string, number>();
  for (const e of entradas) {
    if (s(e.notas).toUpperCase().includes("COMPRA DIRECTA")) continue;
    const rec = e.cant_recibida_llenar_aqui;
    if (rec == null || rec === "") continue;
    const code = skuCode(s(e.sku));
    ent.set(code, (ent.get(code) || 0) + n(rec));
  }
  const items = [];
  const allSkus: string[] = [];
  for (const [code, r] of cmap) {
    if (!/^[A-Z]{2,3}-\d+/.test(code)) continue;
    const sku = s(r.sku).startsWith("SUNSU-") ? s(r.sku) : "SUNSU-" + code;
    const b0 = base.get(code);
    const stock = round2(n(b0?.stock_inicial) + (ent.get(code) || 0) - (ventas.get(code) || 0));
    const minimo = n(b0?.minimo);
    const alerta = stock <= 0 ? "SIN STOCK" : stock <= minimo ? "STOCK BAJO" : "OK";
    allSkus.push(sku);
    items.push({ sku, nombre: s(r.producto_servicio), stock, minimo, alerta, sinSaldoInicial: !b0 });
  }
  const fis = await ctx.db.all("inventario_fisico");
  let ultimoFisico = "";
  for (const f of fis) if (s(f.fecha) > ultimoFisico) ultimoFisico = s(f.fecha);
  return { items, allSkus, ultimoFisico, nota: "Sin filas en inventario_base el stock no incluye el saldo inicial de la hoja 📊 INVENTARIO." };
});

reg("getHistorial", "any", async (_p, ctx, ses) => {
  const map = await catMap(ctx);
  const telOk = conTelefono(ses);
  const regs = await ctx.db.all("clientas_registro");
  const porCed = new Map(regs.map((r) => [normCedula(r.cedula), s(r.telefono)]));
  const rows = (await tickets(ctx)).filter((r) => r.timestamp);
  rows.sort((a, b) => ymdUtc(a.timestamp).localeCompare(ymdUtc(b.timestamp)) || hmUtc(a.timestamp).localeCompare(hmUtc(b.timestamp)) || n(a.sheet_row) - n(b.sheet_row));
  const ec = hoy(ctx);
  const out = rows.map((r) => {
    const prods = productQtys(r).map((pr) => (catNombre(map, pr.sku) || pr.sku) + " ×" + pr.qty);
    const item: R = {
      fecha: ymdUtc(r.timestamp), hora: hmUtc(r.timestamp), tkRow: r.sheet_row,
      cosmetologa: s(r.atendido_por), cedula: s(r.id_3), nombre: s(r.nombre), apellido: s(r.apellido),
      estimado: s(r.estimado), facial: s(r.facial_hecho), pack3: s(r.compra_pack_3), pack6: s(r.compra_pack_6),
      extras: s(r.servicios_adicionales), colQ: s(r.paquete), colR: s(r.gift_card), colS: s(r.venta_gift),
      recomendaciones: s(r.recomendaciones), notas: s(r.notas_generales), retorno: s(r.fecha_retorno).slice(0, 10),
      productos: prods, exclFacial: b(r.excluir_facial), exclPaquete: b(r.excluir_paquete),
      exclProducto: b(r.excluir_producto), exclExtras: b(r.excluir_extras),
      comprobante: s(r.comprobante), fotos: s(r.fotos), fotosAntes: s(r.fotos_antes), fotosDespues: s(r.fotos_despues),
      estado: estadoTicket({ seguimiento: s(r.seguimiento), agendado: b(r.agendado), retorno: s(r.fecha_retorno) }, ec),
    };
    if (telOk) item.telefono = porCed.get(normCedula(r.id_3)) || "";
    else item.telefono = "";
    return item;
  });
  out.reverse();
  return out;
});

reg("getTicketsDia", "any", async (p, ctx) => {
  const off = n(p.offset);
  const target = addDays(hoy(ctx), -off);
  const [y, m, d] = target.split("-").map(Number);
  const ticketsOut = [];
  for (const r of await tickets(ctx)) {
    if (ymdUtc(r.timestamp) !== target) continue;
    const fac = b(r.fac), cob = b(r.cob), numFac = s(r.fac_7);
    if (fac && cob && numFac) continue;
    ticketsOut.push({
      fila: r.sheet_row, timestamp: s(r.timestamp), cosm: s(r.atendido_por), cedula: s(r.id_3),
      nombre: s(r.nombre), apellido: s(r.apellido), facial: s(r.facial_hecho), estimado: n(r.estimado),
      fac, numFac, cob, comp: s(r.comp),
    });
  }
  return { tickets: ticketsOut, dia: d, mes: m, ano: y };
});

reg("editarTicket", "any", async (p, ctx, ses) => {
  const row = await rowBySheet(ctx.db, "tickets", n(p.tkRow));
  if (!row) return { error: "Fila inválida" };
  const patch: R = {
    id_3: s(p.cedula), nombre: s(p.nombre), apellido: s(p.apellido), facial_hecho: s(p.facial),
    compra_pack_3: s(p.pack3), compra_pack_6: s(p.pack6), servicios_adicionales: s(p.extras),
    estimado: n(p.estimado), fecha_retorno: s(p.fechaRetorno), gift_card: s(p.colR), venta_gift: s(p.colS),
    recomendaciones: s(p.recomendaciones), notas_generales: s(p.notas),
  };
  if (p.colQ != null) patch.paquete = s(p.colQ);
  if (p.cobro != null) patch.comp = s(p.cobro);
  Object.assign(patch, productosPatch((p.productos || {}) as R, true, row));
  patch.estado = estadoTicket({ seguimiento: s(row.seguimiento), agendado: b(row.agendado), retorno: s(patch.fecha_retorno) }, hoy(ctx));
  await ctx.db.write(actorOf(ses), "tickets", "update", { sheet_row: row.sheet_row }, patch);
  return { ok: true };
});

reg("eliminarTicket", "any", async (p, ctx, ses) => {
  const row = await rowBySheet(ctx.db, "tickets", n(p.tkRow));
  if (!row) return { error: "Fila inválida" };
  if (s(p.nombre) && normNombre(row.nombre) !== normNombre(p.nombre)) return { error: "El nombre no coincide. Refresca." };
  if (s(p.apellido) && normNombre(row.apellido) !== normNombre(p.apellido)) return { error: "El apellido no coincide. Refresca." };
  await ctx.db.write(actorOf(ses), "tickets", "delete", { sheet_row: row.sheet_row }, null);
  await logAccion(ctx.db, actorOf(ses), "ELIMINAR TICKET", "fila " + row.sheet_row);
  return { ok: true };
});

reg("excluirComision", "any", async (p, ctx, ses) => {
  const tipo = s(p.tipo);
  const col = ({ facial: "excluir_facial", paquete: "excluir_paquete", producto: "excluir_producto", extras: "excluir_extras" } as R)[tipo];
  if (!col) return { error: "Parámetros inválidos" };
  const row = await rowBySheet(ctx.db, "tickets", n(p.tkRow));
  if (!row) return { error: "Fila inválida" };
  const valor = p.valor === true || p.valor === "true";
  await ctx.db.write(actorOf(ses), "tickets", "update", { sheet_row: row.sheet_row }, { [String(col)]: valor });
  return { ok: true };
});

reg("registrarFacturaCobro", "any", async (p, ctx, ses) => facturaCobro(p, ctx, ses, !p.soloCobro || s(p.soloCobro) === "0" ? "ambos" : "cobro"));
reg("registrarFactura", "any", async (p, ctx, ses) => facturaCobro(p, ctx, ses, "fac"));
reg("registrarCobro", "any", async (p, ctx, ses) => facturaCobro(p, ctx, ses, "cobro"));

async function facturaCobro(p: R, ctx: Ctx, ses: Ses, modo: "fac" | "cobro" | "ambos"): Promise<R> {
  const row = await rowBySheet(ctx.db, "tickets", n(p.fila || p.tkRow));
  if (!row) return { error: "Fila inválida" };
  const patch: R = {};
  if (modo !== "cobro") { patch.fac = true; if (s(p.numFac)) patch.fac_7 = s(p.numFac); }
  if (modo !== "fac") { patch.cob = true; if (p.comp != null) patch.comp = s(p.comp); }
  if (s(p.comprobanteUrl)) patch.comprobante = s(p.comprobanteUrl);
  await ctx.db.write(actorOf(ses), "tickets", "update", { sheet_row: row.sheet_row }, patch);
  if (patch.fac_7) {
    const ced = normCedula(row.id_3);
    for (const paq of await ctx.db.all("paquetes")) {
      if (normCedula(paq.cedula) === ced && !s(paq.factura)) {
        await ctx.db.write(actorOf(ses), "paquetes", "update", { sheet_row: paq.sheet_row }, { factura: patch.fac_7 });
      }
    }
    for (const g of await ctx.db.all("gift_cards")) {
      if (normCedula(g.cedula_comprador) === ced && !s(g.factura) && !blankDia(g.dia)) {
        await ctx.db.write(actorOf(ses), "gift_cards", "update", { sheet_row: g.sheet_row }, { factura: patch.fac_7 });
      }
    }
  }
  return { ok: true };
}

reg("marcarAgendada", "any", async (p, ctx, ses) => {
  const row = await rowBySheet(ctx.db, "tickets", n(p.tkRow));
  if (!row) return { error: "Fila inválida" };
  if (s(p.cedula) && normCedula(row.id_3) && normCedula(p.cedula) !== normCedula(row.id_3)) return { error: "La fila no coincide. Refresca la lista." };
  await ctx.db.write(actorOf(ses), "tickets", "update", { sheet_row: row.sheet_row }, { agendado: true, estado: "✅ Agendada" });
  return { ok: true };
});
reg("marcarAgendadasLote", "any", async (p, ctx, ses) => {
  const filas = Array.isArray(p.filas) ? p.filas as R[] : Array.isArray(p.items) ? p.items as R[] : [];
  let nOk = 0;
  for (const it of filas) {
    const row = await rowBySheet(ctx.db, "tickets", n(it.tkRow || it));
    if (!row) continue;
    await ctx.db.write(actorOf(ses), "tickets", "update", { sheet_row: row.sheet_row }, { agendado: true, estado: "✅ Agendada" });
    nOk++;
  }
  return { ok: true, n: nOk };
});

reg("getCodigoGC", "any", async (p, ctx) => unoGC(p, ctx));
reg("getCodigosGC", "any", async (p, ctx) => {
  const nNeed = Math.max(1, n(p.n) || 1);
  const libres = await libresGC(ctx, {});
  if (libres.length < nNeed) return { error: "Solo hay " + libres.length + " código(s) disponibles, se necesitan " + nNeed };
  return { codigos: libres.slice(0, nNeed) };
});
async function libresGC(ctx: Ctx, exclude: R) {
  const rows = (await ctx.db.all("gift_cards")).sort((a, b) => n(a.sheet_row) - n(b.sheet_row));
  const out = [];
  for (const r of rows) {
    if (exclude[String(r.sheet_row)]) continue;
    if (s(r.codigo_gc) && blankDia(r.dia)) out.push({ codigo: s(r.codigo_gc), fila: r.sheet_row });
  }
  return out;
}
async function unoGC(p: R, ctx: Ctx) {
  const exclude: R = {};
  for (const f of s(p.excludeFilas).split(",")) if (n(f) > 0) exclude[String(n(f))] = true;
  const libres = await libresGC(ctx, exclude);
  if (!libres.length) return { error: "Sin códigos GC disponibles" };
  return libres[0];
}
reg("registrarGC", "any", async (p, ctx, ses) => {
  const fila = n(p.fila);
  const row = fila ? await rowBySheet(ctx.db, "gift_cards", fila) : (await ctx.db.all("gift_cards")).find((r) => s(r.codigo_gc) === s(p.codigo));
  if (!row) return { error: "Código no encontrado" };
  if (!blankDia(row.dia)) return { error: "Ese código ya está vendido" };
  const ec = ecuadorParts(ctx.now);
  await ctx.db.write(actorOf(ses), "gift_cards", "update", { sheet_row: row.sheet_row }, {
    dia: ec.d, mes: ec.m, ano: ec.y, cedula_comprador: s(p.cedula), nombre_comprador: s(p.nombre),
    apellido_comprador: s(p.apellido), sku: "SUNSU-35", notas: s(p.notas), valor: s(p.valor || p.monto),
  });
  return { ok: true, codigo: s(row.codigo_gc), fila: row.sheet_row };
});
reg("buscarGiftCards", "any", async (p, ctx) => {
  const q = s(p.q).toLowerCase();
  if (!q) return { resultados: [] };
  const todas = q === "*";
  const resultados = [];
  for (const r of await ctx.db.all("gift_cards")) {
    const codigo = s(r.codigo_gc);
    if (!codigo) continue;
    const nom = s(r.nombre_comprador), ape = s(r.apellido_comprador);
    const blob = [codigo, s(r.cedula_comprador), nom, ape, nom + " " + ape, s(r.usado_por), s(r.notas)].join(" ").toLowerCase();
    if (!todas && !blob.includes(q)) continue;
    resultados.push({
      fila: r.sheet_row, codigo, dia: r.dia, mes: r.mes, ano: r.ano, cedula: s(r.cedula_comprador),
      nombre: nom, apellido: ape, factura: s(r.factura), sku: s(r.sku), valor: s(r.valor),
      usado: b(r.usado), fechaUso: s(r.fecha_uso), usadoPor: s(r.usado_por), notas: s(r.notas),
      saldo: saldoGift(r),
    });
  }
  return { resultados };
});
reg("marcarGCUsada", "any", async (p, ctx, ses) => {
  let row = n(p.fila) ? await rowBySheet(ctx.db, "gift_cards", n(p.fila)) : null;
  if (!row && s(p.codigo)) {
    const hits = (await ctx.db.all("gift_cards")).filter((r) => s(r.codigo_gc) === s(p.codigo));
    row = hits.find((r) => !b(r.usado)) || hits[0] || null;
  }
  if (!row) return { error: "Gift card no encontrada" };
  if (b(row.usado)) return { error: "Esa gift card ya está usada" };
  const ec = ecuadorParts(ctx.now);
  await ctx.db.write(actorOf(ses), "gift_cards", "update", { sheet_row: row.sheet_row }, {
    usado: true, fecha_uso: ec.ymd, usado_por: s(p.usadoPor || p.usuario || ses.name),
  });
  return { ok: true };
});

reg("buscarPaquetes", "any", async (p, ctx) => {
  const q = s(p.q).toLowerCase();
  if (!q) return { resultados: [] };
  const resultados = [];
  for (const r of await ctx.db.all("paquetes")) {
    const ced = s(r.cedula), nom = s(r.nombres), ape = s(r.apellidos);
    if (!ced && !nom) continue;
    const blob = [ced, nom, ape, nom + " " + ape, s(r.notas)].join(" ").toLowerCase();
    if (!blob.includes(q)) continue;
    const usos = usosDe(r);
    const total = packSesiones(s(r.sku), s(r.paquete), usos.map((u) => ({ usado: u.usado, fecha: u.fecha })));
    resultados.push({
      fila: r.sheet_row, dia: r.dia, mes: r.mes, ano: r.ano, cedula: ced, nombre: nom, apellido: ape,
      factura: s(r.factura), sku: s(r.sku), paquete: s(r.paquete), vendidoPor: s(r.vendido_por),
      usos: usos.slice(0, total), usados: usos.slice(0, total).filter((u) => u.usado).length,
      total, completo: b(r.completo),
    });
  }
  return { resultados };
});
reg("getSeguimientoPaquetes", "any", async (p, ctx, ses) => {
  const tel = conTelefono(ses);
  const regs = await ctx.db.all("clientas_registro");
  const porCed = new Map(regs.map((r) => [normCedula(r.cedula), s(r.telefono)]));
  const wa = await kvGet(ctx.db, "SUNSU_SEG_PAQ");
  const items = [];
  for (const r of await ctx.db.all("paquetes")) {
    if (!s(r.sku)) continue;
    const usos = usosDe(r);
    const total = packSesiones(s(r.sku), s(r.paquete), usos);
    const clave = [s(r.cedula), s(r.sku), s(r.dia) + "/" + s(r.mes) + "/" + s(r.ano)].join("|");
    items.push({
      fila: r.sheet_row, dia: r.dia, mes: r.mes, ano: r.ano, cedula: s(r.cedula),
      nombre: s(r.nombres), apellido: s(r.apellidos), sku: s(r.sku), paquete: s(r.paquete),
      vendidoPor: s(r.vendido_por), usos: usos.slice(0, total), total,
      telefono: tel ? (porCed.get(normCedula(r.cedula)) || "") : "",
      claveWa: clave, wa: wa[clave] || null,
    });
  }
  return { items };
});
reg("marcarUsoManual", "any", async (p, ctx, ses) => marcarUso(p, ctx, ses, false));
reg("marcarPrimerUsoPaquete", "any", async (p, ctx, ses) => marcarUso(p, ctx, ses, true));
reg("marcarUsoGC", "any", async (p, ctx, ses) => {
  const row = await rowBySheet(ctx.db, "paquetes", n(p.fila));
  if (!row) return { error: "Paquete no encontrado" };
  const slot = Math.max(1, n(p.slot) || 1) - 1;
  const [u, f] = USO_FIELDS[slot] || USO_FIELDS[0];
  if (b(row[u]) || s(row[f])) return { error: "Ese uso ya está marcado" };
  await ctx.db.write(actorOf(ses), "paquetes", "update", { sheet_row: row.sheet_row }, { [u]: true, [f]: "Gift Card, " + s(p.codigo) });
  return { ok: true };
});
async function marcarUso(p: R, ctx: Ctx, ses: Ses, primero: boolean): Promise<R> {
  let row: R | null = null;
  if (!primero) row = await rowBySheet(ctx.db, "paquetes", n(p.fila));
  else {
    const ec = ecuadorParts(ctx.now);
    const hits = (await ctx.db.all("paquetes")).filter((r) => normCedula(r.cedula) === normCedula(p.cedula) && s(r.sku).includes(skuCode(s(p.sku)).replace(/^[A-Z]+-/, "SUNSU-") || s(p.sku)) && n(r.dia) === ec.d && n(r.mes) === ec.m && n(r.ano) === ec.y);
    row = hits.find((r) => usosDe(r).some((u) => !u.usado && !u.fecha)) || null;
    if (!row) {
      const sku = s(p.sku);
      row = (await ctx.db.all("paquetes")).find((r) => normCedula(r.cedula) === normCedula(p.cedula) && (s(r.sku) === sku || s(r.sku).includes(sku)) && n(r.dia) === ec.d && n(r.mes) === ec.m) || null;
    }
  }
  if (!row) return { error: primero ? "No hay paquete de hoy para esa cédula" : "Paquete no encontrado" };
  const usos = usosDe(row);
  const total = packSesiones(s(row.sku), s(row.paquete), usos);
  const idx = primero ? usos.findIndex((u) => !u.usado && !u.fecha) : (n(p.slot) ? n(p.slot) - 1 : usos.findIndex((u) => !u.usado && !u.fecha));
  if (idx < 0 || idx >= total) return { error: "No queda un uso libre" };
  const [u, f] = USO_FIELDS[idx];
  if (b(row[u]) || s(row[f])) return { error: "Ese uso ya está marcado" };
  const ec = ecuadorParts(ctx.now);
  const patch: R = { [u]: true, [f]: s(p.fecha) || ec.ymd };
  const usados = usos.filter((x, i) => x.usado || i === idx).length;
  if (usados >= total) patch.completo = true;
  await ctx.db.write(actorOf(ses), "paquetes", "update", { sheet_row: row.sheet_row }, patch);
  return { ok: true, slot: idx + 1, completo: !!patch.completo };
}

reg("getPromos", "any", async (p, ctx, ses) => {
  const ec = hoy(ctx);
  const todas = [];
  const vig = [];
  for (const r of await ctx.db.all("promos")) {
    if (!s(r.nombre)) continue;
    const it = {
      fila: r.sheet_row, nombre: s(r.nombre), aplica: s(r.aplica_a), tipo: s(r.tipo).toUpperCase() || "%",
      valor: n(r.valor), desde: s(r.desde).slice(0, 10), hasta: s(r.hasta).slice(0, 10), por: s(r.creada_por),
      activa: s(r.activa).toUpperCase() !== "NO" && r.activa !== false,
      codigos: s(r.codigos).split(",").map((x) => x.trim()).filter(Boolean), valor2: n(r.valor2),
    };
    todas.push(it);
    if (it.activa && it.desde && it.hasta && ec >= it.desde && ec <= it.hasta) vig.push(it);
  }
  const esAdm = !!ses && isAdmin(ses.rol);
  return { vigentes: vig, todas: esAdm ? todas : [] };
});
reg("promoCrear", ADMIN, async (p, ctx, ses) => {
  const cods = Array.isArray(p.codigos) ? (p.codigos as unknown[]).map((x) => s(x)).filter(Boolean) : [];
  const mec = s(p.mecanismo || "%").toUpperCase();
  const err = validarPromo(mec, n(p.valor), n(p.valor2), cods);
  if (err) return { error: err };
  if (!s(p.nombre)) return { error: "Falta el nombre de la promo" };
  if (!s(p.desde) || !s(p.hasta)) return { error: "Faltan fechas de vigencia" };
  const sheet_row = await nextSheet(ctx.db, "promos");
  await ctx.db.write(actorOf(ses), "promos", "insert", {}, {
    sheet_row, nombre: s(p.nombre), aplica_a: cods.join(", ") || "Total", tipo: mec, valor: n(p.valor),
    desde: s(p.desde), hasta: s(p.hasta), creada_por: ses.name, activa: "SI", codigos: cods.join(","), valor2: n(p.valor2),
    orig: { nombre: s(p.nombre) },
  });
  return { ok: true };
});
reg("promoDesactivar", ADMIN, async (p, ctx, ses) => {
  const row = await rowBySheet(ctx.db, "promos", n(p.fila));
  if (!row) return { error: "Promo no encontrada" };
  await ctx.db.write(actorOf(ses), "promos", "update", { sheet_row: row.sheet_row }, { activa: "NO" });
  return { ok: true };
});

reg("getCajaV2", "any", async (_p, ctx, ses) => {
  await syncEfectivo(ctx, ses);
  const rows = (await ctx.db.all("caja_chica")).sort((a, b) => n(a.sheet_row) - n(b.sheet_row));
  const iniciada = rows.some((r) => s(r.tipo).toUpperCase().includes("SALDO"));
  const movs = rows.slice(-300).map((r) => ({
    f: ymdUtc(r.fecha_hora) + " " + hmUtc(r.fecha_hora), tipo: s(r.tipo), detalle: s(r.detalle_justificativo),
    quien: s(r.quien), entrada: n(r.entrada), salida: n(r.salida), saldo: n(r.saldo), por: s(r.registrado_por),
  })).reverse();
  return { iniciada, saldo: iniciada ? await saldoCaja(ctx) : 0, movs };
});
async function syncEfectivo(ctx: Ctx, ses: Ses) {
  const desde = addDays(hoy(ctx), -3);
  const refs = new Set((await ctx.db.all("caja_chica")).map((r) => s(r.ref)));
  for (const t of await tickets(ctx)) {
    const f = ymdUtc(t.timestamp);
    if (f < desde) continue;
    if (!s(t.comp).toLowerCase().includes("efect")) continue;
    const ref = "TK:" + t.sheet_row;
    if (refs.has(ref)) continue;
    const monto = n(t.estimado);
    if (!(monto > 0)) continue;
    await appendCaja(ctx, ses, "💵 EFECTIVO TICKET", s(t.nombre) + " " + s(t.apellido), s(t.atendido_por), monto, 0, ref);
    refs.add(ref);
  }
}
reg("cajaV2Iniciar", ADMIN, async (p, ctx, ses) => {
  const rows = await ctx.db.all("caja_chica");
  if (rows.some((r) => s(r.tipo).toUpperCase().includes("SALDO INICIAL"))) return { error: "La caja ya está iniciada" };
  const m = n(p.monto);
  if (!(m >= 0)) return { error: "Monto inválido" };
  const sheet_row = await nextSheet(ctx.db, "caja_chica");
  const ec = ecuadorParts(ctx.now);
  await ctx.db.write(actorOf(ses), "caja_chica", "insert", {}, {
    sheet_row, fecha_hora: ec.isoWall, tipo: "⚖️ SALDO INICIAL", detalle_justificativo: "Apertura beta",
    quien: ses.name, entrada: m, salida: 0, saldo: m, ref: "", registrado_por: ses.name, orig: { saldo: m },
  });
  return { ok: true, saldo: m };
});
reg("cajaV2Mov", "any", async (p, ctx, ses) => {
  const tipo = s(p.tipo);
  if (!(await ctx.db.all("caja_chica")).length) return { error: "La caja no está iniciada" };
  if (tipo === "cuadre") {
    const fis = n(p.montoFisico);
    if (Number.isNaN(fis) || fis < 0) return { error: "Conteo físico inválido" };
    if (!s(p.justificativo)) return { error: "El cuadre necesita justificativo" };
    const saldo = await saldoCaja(ctx);
    const dif = round2(fis - saldo);
    if (Math.abs(dif) < 0.005) return { ok: true, saldo, dif: 0, msg: "La caja ya cuadra" };
    const nuevo = dif > 0
      ? await appendCaja(ctx, ses, "⚖️ CUADRE (entrada)", s(p.justificativo), s(p.quien || ses.name), dif, 0)
      : await appendCaja(ctx, ses, "⚖️ CUADRE (salida)", s(p.justificativo), s(p.quien || ses.name), 0, -dif);
    return { ok: true, saldo: nuevo, dif };
  }
  if (tipo !== "descarga" && tipo !== "deposito" && tipo !== "ajuste") return { error: "Tipo inválido" };
  const monto = n(p.monto);
  if (!(monto > 0)) return { error: "Monto inválido" };
  if ((tipo === "descarga" || tipo === "ajuste") && !s(p.justificativo)) return { error: "La operación necesita justificativo" };
  if (!s(p.quien)) return { error: "Falta indicar quién hace la transacción" };
  const saldo = await saldoCaja(ctx);
  if (tipo !== "ajuste" && monto > saldo) return { error: "Fondos insuficientes: saldo $" + saldo.toFixed(2) };
  const nuevo = tipo === "ajuste"
    ? await appendCaja(ctx, ses, "⚖️ AJUSTE (entrada)", s(p.justificativo), s(p.quien), monto, 0)
    : await appendCaja(ctx, ses, tipo === "descarga" ? "💸 DESCARGA" : "🏦 DEPÓSITO", s(p.justificativo), s(p.quien), 0, monto);
  return { ok: true, saldo: nuevo };
});
reg("getCajaMovimientos", "any", async (_p, ctx) => {
  const day = hoy(ctx);
  const movs = (await ctx.db.all("caja_chica")).filter((r) => ymdUtc(r.fecha_hora) === day).map((r) => ({
    ts: s(r.fecha_hora), tipo: s(r.tipo), desc: s(r.detalle_justificativo), quien: s(r.quien),
    monto: n(r.salida) || n(r.entrada), saldo: n(r.saldo), notas: "", registradoPor: s(r.registrado_por), tsApp: "",
  }));
  return { movimientos: movs, saldo: await saldoCaja(ctx), nota: "La beta lee la caja V2 (la hoja V1 no se migró)." };
});
reg("cajaGasto", "any", async (p, ctx, ses) => {
  const saldo = await appendCaja(ctx, ses, "GASTO", s(p.desc), s(p.quien), 0, n(p.monto));
  return { ok: true, msg: "Gasto registrado", saldo };
});
reg("cajaDeposito", "any", async (p, ctx, ses) => {
  const saldo = await appendCaja(ctx, ses, "DEPÓSITO", s(p.banco), s(p.deposita || p.entrega), 0, n(p.monto));
  return { ok: true, msg: "Depósito registrado", saldo };
});
reg("cajaSync", "any", async (_p, ctx, ses) => {
  await syncEfectivo(ctx, ses);
  const saldo = await saldoCaja(ctx);
  return { ok: true, msg: "✅ Sincronizado — Saldo: $" + saldo.toFixed(2), saldo };
});

reg("propinaRegistrar", "any", async (p, ctx, ses) => {
  const monto = n(p.monto);
  if (!(monto > 0) || !s(p.cosmetologa)) return { error: "Monto y cosmetóloga son obligatorios" };
  const sheet_row = await nextSheet(ctx.db, "propinas");
  const ec = ecuadorParts(ctx.now);
  await ctx.db.write(actorOf(ses), "propinas", "insert", {}, {
    sheet_row, fecha: ec.isoWall, cosmetologa: s(p.cosmetologa), monto, via: s(p.via), nota: s(p.nota),
    estado: "PENDIENTE", registro: ses.name, orig: { cosmetologa: s(p.cosmetologa), monto },
  });
  if (s(p.via).toLowerCase().includes("efect")) await appendCaja(ctx, ses, "💝 PROPINA", s(p.cosmetologa), ses.name, monto, 0, "PROP:" + sheet_row);
  return { ok: true };
});
reg("propinaPagar", RECEP, async (p, ctx, ses) => {
  const cos = s(p.cosmetologa);
  const pend = (await ctx.db.all("propinas")).filter((r) => s(r.cosmetologa) === cos && s(r.estado) === "PENDIENTE");
  if (!pend.length) return { error: "No hay propinas pendientes" };
  const total = round2(pend.reduce((a, r) => a + n(r.monto), 0));
  const saldo = await saldoCaja(ctx);
  if (total > saldo) return { error: "Fondos insuficientes: saldo $" + saldo.toFixed(2) };
  const ec = ecuadorParts(ctx.now);
  for (const r of pend) {
    await ctx.db.write(actorOf(ses), "propinas", "update", { sheet_row: r.sheet_row }, { estado: "PAGADA", pagada_el: ec.ymd });
  }
  const nuevo = await appendCaja(ctx, ses, "💝 PAGO PROPINA", cos, ses.name, 0, total);
  return { ok: true, total, saldo: nuevo };
});
reg("getPropinas", "any", async (_p, ctx) => {
  const pend: R = {};
  const ult = [];
  for (const r of await ctx.db.all("propinas")) {
    const it = { fecha: s(r.fecha), cos: s(r.cosmetologa), monto: n(r.monto), via: s(r.via), nota: s(r.nota), estado: s(r.estado) };
    ult.push(it);
    if (it.estado === "PENDIENTE") pend[it.cos] = n(pend[it.cos]) + it.monto;
  }
  return { pendientes: pend, ultimas: ult.slice(-40).reverse(), clientasHoy: [] };
});

reg("registrarMulta", ADMIN, async (p, ctx, ses) => {
  if (!s(p.cosmetologa) || !(n(p.monto) > 0)) return { error: "Cosmetóloga y monto son obligatorios" };
  const tipo = s(p.tipo || "MULTA").toUpperCase();
  if (tipo !== "MULTA" && tipo !== "DESCUENTO") return { error: "Tipo inválido" };
  const sheet_row = await nextSheet(ctx.db, "multas_descuentos");
  await ctx.db.write(actorOf(ses), "multas_descuentos", "insert", {}, {
    sheet_row, fecha: ecuadorParts(ctx.now).isoWall, cosmetologa: s(p.cosmetologa), tipo, monto: n(p.monto),
    motivo: s(p.motivo), col_6: s(p.ticket || ""), orig: { tipo, monto: n(p.monto) },
  });
  return { ok: true };
});

reg("getDashboardHoy", ADMIN, async (_p, ctx) => dashboard(ctx));
reg("getDashCosm", "any", async (p, ctx, ses) => {
  const nombre = s(p.cosmetologa) || ses.name;
  const { calc, comRecep, diasRecep, multas, ciclo, fin } = await cicloDe(ctx, hoy(ctx));
  const cosm = calc.personas.find((c) => normNombre(c.cosm) === normNombre(nombre) || normNombre(c.cosm).startsWith(normNombre(nombre).split(" ")[0])) ;
  const c = cosm || { faciales: 0, comFaciales: 0, paquetes: 0, comPaquetes: 0, nivel: "—", tramoPct: null as number | null, comProductos: 0, totalProductos: 0, extras: 0, comExtras: 0, next: null as null | { nivel: string; faltan: number; premio: number } };
  const md = multasDe(nombre, ciclo, fin, multas);
  const recep = normNombre(nombre).startsWith("alejandra");
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const [y1, m1] = ciclo.split("-").map(Number);
  const [y2, m2] = fin.split("-").map(Number);
  const tramo = !!calc.regimenTramo;
  return {
    faciales: c.faciales, comFaciales: c.comFaciales, paquetes: c.paquetes, comPaquetes: c.comPaquetes,
    nivelAlcanzado: c.nivel, tramoPct: c.tramoPct ?? null, regimenTramo: tramo,
    comProductos: c.comProductos, totalProductos: c.totalProductos,
    extras: c.extras, comExtras: c.comExtras, comRecepcion: recep ? comRecep : 0, diasRecepcion: recep ? diasRecep : 0,
    multas: md.mlt, descuentos: md.desc, totalClientas: calc.totalClientas, bonoActivo: calc.bono,
    siguienteNivel: !tramo && c.next ? n(String(c.next.nivel).replace(/^N/, "")) : null,
    nextLabel: tramo ? (c.next?.nivel || null) : null,
    paqParaSiguiente: c.next?.faltan || 0, premioSiguiente: tramo ? 0 : (c.next?.premio || 0),
    periodoLabel: meses[m1 - 1] + " — " + meses[m2 - 1] + " " + y2, nCosmetologas: calc.n,
  };
});
reg("getReporteAdmin", ADMIN, async (_p, ctx) => {
  const { calc, comRecep, diasRecep, multas, ciclo, fin } = await cicloDe(ctx, hoy(ctx));
  const users = await ctx.db.all("usuarios");
  const cosmetologas = calc.personas.map((c) => {
    const md = multasDe(c.cosm, ciclo, fin, multas);
    const recep = normNombre(c.cosm).startsWith("alejandra") ? comRecep : 0;
    const neto = round2(c.comFaciales + c.comPaquetes + c.comProductos + c.comExtras + recep - md.mlt - md.desc);
    const u = users.find((x) => normNombre(x.nombre) === normNombre(c.cosm));
    return {
      name: c.cosm, color: s(u?.color) || "#5B7FA6", f: c.faciales, paq: c.paquetes, n: c.nivel,
      cf: c.comFaciales, cp: c.comPaquetes, cprod: c.comProductos, totalProd: c.totalProductos,
      ext: c.extras, cext: c.comExtras, crecep: recep, diasRecep: recep ? diasRecep : 0,
      m: md.mlt, d: md.desc, t: Math.max(0, neto),
      nextN: c.next?.nivel || null, faltanPaq: c.next?.faltan || 0,
      nextCp: calc.regimenTramo ? 0 : (c.next?.premio || 0),
      tramoPct: c.tramoPct ?? null, regimenTramo: !!calc.regimenTramo,
    };
  });
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return {
    cosmetologas, bonoActivo: calc.bono, regimenTramo: !!calc.regimenTramo, totalClientas: calc.totalClientas, nCosmetologas: calc.n,
    periodo: meses[Number(ciclo.slice(5, 7)) - 1] + " 26 — " + meses[Number(fin.slice(5, 7)) - 1] + " 25, " + fin.slice(0, 4),
  };
});
reg("getReporte", ADMIN, async (p, ctx, ses) => FNS.getReporteAdmin(p, ctx, ses));
reg("getComisionesRol", "any", async (p, ctx, ses) => FNS.getDashCosm(p, ctx, ses));
reg("getComisionRecepcion", "any", async (_p, ctx) => {
  const { comRecep, diasRecep, ciclo, fin } = await cicloDe(ctx, hoy(ctx));
  return { comision: comRecep, dias: diasRecep, ciclo, fin };
});
reg("getHistorialComisiones", "any", async (_p, ctx) => {
  const store = await kvGet(ctx.db, "SUNSU_HISTORIAL_COMISIONES");
  let filas: R[] = [];
  try { filas = await ctx.db.all("historial_comisiones"); } catch { filas = []; }
  return { periodos: Object.keys(store), detalle: store, filas };
});
reg("getPeriodoComision", "any", async (p, ctx) => {
  const { calc } = await cicloDe(ctx, hoy(ctx));
  const nombre = s(p.nombre);
  const c = calc.personas.find((x) => normNombre(x.cosm).includes(normNombre(nombre).split(" ")[0]));
  return { ok: true, persona: c || null, totalClientas: calc.totalClientas, n: calc.n, metas: calc.metas };
});

reg("guardarCotizacion", RECEP, async (p, ctx, ses) => {
  if (!puedeCotizar(ses.rol)) return { error: "No tienes acceso a cotizaciones" };
  const calc = cotCalcular((p.lineas || p.items || []) as never[], s(p.dscMode), n(p.dscVal));
  if (!calc.lineas.length) return { error: "La cotización no tiene líneas" };
  if (!s(p.cliente)) return { error: "Falta el cliente" };
  const saved = await ctx.db.write(actorOf(ses), "cotizaciones", "insert", {}, {
    fecha: ecuadorParts(ctx.now).isoWall, creado_por: ses.name, cliente: s(p.cliente),
    telefono: s(p.telefono), email: s(p.email), cedula: s(p.cedula), items: calc.lineas,
    subtotal: calc.subtotal, descuento: calc.descuento, iva: calc.iva, total: calc.total,
    validez: s(p.validez) || "Válida por 15 días", notas: s(p.notas), estado: s(p.estado) || "Enviada",
    orig: { dscMode: calc.dscMode, dscVal: calc.dscVal },
  });
  return { ok: true, numero: saved?.numero, ...calc };
});
reg("getCotizaciones", RECEP, async (_p, ctx, ses) => {
  if (!puedeCotizar(ses.rol)) return { error: "No tienes acceso a cotizaciones" };
  const items = (await ctx.db.all("cotizaciones")).sort((a, b) => s(b.numero).localeCompare(s(a.numero)));
  return { ok: true, items };
});
reg("getCotizacion", RECEP, async (p, ctx, ses) => {
  if (!puedeCotizar(ses.rol)) return { error: "No tienes acceso a cotizaciones" };
  const row = (await ctx.db.all("cotizaciones")).find((r) => s(r.numero) === s(p.numero));
  if (!row) return { error: "No encontrada" };
  return { ok: true, item: row };
});

reg("getMensajes", "any", async (_p, ctx) => {
  const m = await cfgMap(ctx);
  const DEF: R = {
    "LINK REGISTRO": "app.sunsuspa.com/registro.html",
    "MENSAJE ATRASADAS": "Hola {nombre}, ya pasó tu fecha ({fecha}). ¿Agendamos?",
    "MENSAJE PRÓXIMAS": "Hola {nombre}, se acerca tu facial ({fecha}). ¿Agendamos?",
    "MENSAJE CUMPLEAÑOS": "Hola {nombre}, ¡feliz cumpleaños!",
    "MENSAJE CLIENTAS ANTIGUAS": "Hola {nombre}, te saludamos de Sunsu Spa.",
    "MENSAJE GIFT CARD": "Hola, tu gift card Sunsu.",
  };
  const msgs: R = { ...DEF };
  for (const [k, v] of m) if (k.startsWith("MENSAJE") || k.startsWith("LINK")) msgs[k] = v;
  return { msgs };
});
reg("getPlantillaGC", "any", async (_p, ctx) => {
  const m = await cfgMap(ctx);
  return { plantilla: m.get("MENSAJE GIFT CARD") || "Hola, tu gift card de Sunsu Spa." };
});

reg("getGCDigitales", "any", async (_p, ctx) => {
  const store = await kvGet(ctx.db, "SUNSU_GC_DIGITALES");
  const vendidas = new Set((await ctx.db.all("gift_cards")).filter((r) => s(r.cedula_comprador) || s(r.nombre_comprador)).map((r) => s(r.codigo_gc)));
  const items: R[] = [];
  for (const [codigo, o] of Object.entries(store)) {
    if (!vendidas.has(codigo)) continue;
    items.push({ ...(o as R), codigo });
  }
  items.sort((a, b) => s(b.ts).localeCompare(s(a.ts)));
  return { items };
});
reg("guardarGCDigital", "any", async (p, ctx, ses) => {
  const store = await kvGet(ctx.db, "SUNSU_GC_DIGITALES");
  const gc = { mensaje: s(p.mensaje), ts: ecuadorParts(ctx.now).isoWall, por: ses.name, imagen: s(p.imagen).startsWith("http") ? s(p.imagen) : "", codigo: s(p.codigo) };
  store[s(p.codigo)] = gc;
  await kvSet(ctx.db, actorOf(ses), "SUNSU_GC_DIGITALES", store);
  await espejo(ctx.db, actorOf(ses), "gift_cards_digitales", gc);
  return { ok: true };
});
reg("eliminarGCDigital", "any", async (p, ctx, ses) => {
  const store = await kvGet(ctx.db, "SUNSU_GC_DIGITALES");
  delete store[s(p.codigo)];
  await kvSet(ctx.db, actorOf(ses), "SUNSU_GC_DIGITALES", store);
  return { ok: true };
});

reg("subirComprobante", "any", async (p, ctx, ses) => {
  const id = await guardarArchivo(ctx.db, actorOf(ses), "comprobante", s(p.nombre) || "comprobante", s(p.imagen));
  if (!id) return { error: "Sin imagen (o pesa más de 1.5 MB). La beta no sube a Drive." };
  return { ok: true, url: "archivo:" + id, nota: "Guardado en Supabase, no en Drive." };
});
reg("fotoB64", "any", async (p, ctx) => {
  const id = s(p.id).replace(/[^-\w]/g, "");
  const rows = await ctx.db.all("app_archivos");
  const f = rows.find((r) => r.id === id);
  if (!f) return { error: "La beta no lee Drive. Esta foto no está en el almacén de la beta.", parcial: true };
  return { ok: true, mime: s(f.mime) || "image/jpeg", b64: s(f.data_b64) };
});

reg("getEntradas", "any", async (_p, ctx) => {
  const items = [];
  for (const r of await ctx.db.all("inventario_entradas")) {
    const sku = s(r.sku);
    if (!sku || sku.toLowerCase() === "sku") continue;
    if (s(r.producto).includes("←")) continue;
    if (s(r.cant_recibida_llenar_aqui) !== "") continue;
    items.push({
      fila: r.sheet_row, sku, nombre: s(r.producto), proveedor: s(r.proveedor), pedida: n(r.cant_pedida),
      recibida: "", estado: s(r.estado_automatico), orden: s(r.orden), notas: s(r.notas),
    });
  }
  return { items };
});
reg("registrarEntrada", "any", async (p, ctx, ses) => entrada(p, ctx, ses, false));
reg("editarEntrada", ADMIN, async (p, ctx, ses) => entrada(p, ctx, ses, true));
async function entrada(p: R, ctx: Ctx, ses: Ses, editar: boolean): Promise<R> {
  const row = await rowBySheet(ctx.db, "inventario_entradas", n(p.fila));
  if (!row) return { error: "Fila inválida" };
  const cant = n(p.cantidad);
  const notas = s(row.notas) + (editar ? " · editado por " + ses.name + " (" + s(row.cant_recibida_llenar_aqui) + "→" + cant + ")" : "");
  const estado = cant <= 0 ? "Pendiente" : cant + 0.001 < n(row.cant_pedida) ? "Parcial" : "Completo";
  await ctx.db.write(actorOf(ses), "inventario_entradas", "update", { sheet_row: row.sheet_row }, {
    cant_recibida_llenar_aqui: cant, estado_automatico: estado, registrado_por: ses.name, notas,
    col_11: ecuadorParts(ctx.now).stamp,
  });
  if (s(row.notas).toUpperCase().includes("COMPRA DIRECTA")) {
    await sumarCabina(ctx, ses, skuCode(s(row.sku)), cant - (editar ? n(row.cant_recibida_llenar_aqui) : 0), "compra directa");
  }
  return { ok: true, estado };
}
async function sumarCabina(ctx: Ctx, ses: Ses, sku: string, delta: number, nota: string) {
  if (!delta) return;
  const rows = await ctx.db.all("cabina_inventario");
  const hit = rows.find((r) => skuCode(s(r.sku_catalogo)) === sku || skuCode(s(r.codigo)) === sku);
  if (!hit) return;
  const cerrados = n(hit.envases_cerrados) + delta;
  const stock = (cerrados + n(hit.bodega_cerrados) + n(hit.abierto_restante)) * (n(hit.contenido_envase) || 1);
  await ctx.db.write(actorOf(ses), "cabina_inventario", "update", { sheet_row: hit.sheet_row }, {
    envases_cerrados: cerrados, stock_total: stock, notas: s(hit.notas) + " · " + nota,
  });
}

reg("getEntradasHistorial", "any", async (_p, ctx) => {
  const items = (await ctx.db.all("inventario_entradas")).filter((r) => s(r.cant_recibida_llenar_aqui) !== "").map((r) => ({
    fila: r.sheet_row, sku: s(r.sku), nombre: s(r.producto), pedida: n(r.cant_pedida), recibida: n(r.cant_recibida_llenar_aqui),
    estado: s(r.estado_automatico), orden: s(r.orden), notas: s(r.notas), por: s(r.registrado_por),
  }));
  return { items };
});
reg("getProveedoresApp", "any", async (_p, ctx) => ({
  items: (await ctx.db.all("proveedores")).map((r) => ({
    fila: r.sheet_row, nombre: s(r.nombre), ruc: s(r.ruc), telefono: s(r.telefono), direccion: s(r.direccion),
    email: s(r.email), familia: s(r.familia), notas: s(r.notas),
  })),
}));
reg("guardarProveedorApp", ADMIN, async (p, ctx, ses) => {
  const row = { nombre: s(p.nombre), ruc: s(p.ruc), telefono: s(p.telefono), direccion: s(p.direccion), email: s(p.email), familia: s(p.familia), notas: s(p.notas), orig: { nombre: s(p.nombre) } };
  if (n(p.fila)) await ctx.db.write(actorOf(ses), "proveedores", "update", { sheet_row: n(p.fila) }, row);
  else await ctx.db.write(actorOf(ses), "proveedores", "insert", {}, { ...row, sheet_row: await nextSheet(ctx.db, "proveedores") });
  return { ok: true };
});
reg("eliminarProveedorApp", ADMIN, async (p, ctx, ses) => {
  await ctx.db.write(actorOf(ses), "proveedores", "delete", { sheet_row: n(p.fila) }, null);
  return { ok: true };
});
reg("getOCDataApp", "any", async (p, ctx) => {
  const rows = (await ctx.db.all("ordenes_compra")).filter((r) => s(r.numorden) === s(p.orden));
  const row = rows[rows.length - 1];
  if (!row) return { error: "Sin datos" };
  let data: unknown = row.json;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch { /* keep */ } }
  return { ok: true, orden: s(row.numorden), fecha: s(row.fecha), proveedor: s(row.proveedor), data };
});
reg("getBorradorOCApp", "any", async (p, ctx) => borradorOC(p, ctx));
async function borradorOC(p: R, ctx: Ctx): Promise<R> {
  const fam = s(p.familia).toUpperCase();
  const cmap = await catMap(ctx);
  const inv = await FNS.getInventario({}, ctx, { uid: "x", rol: "admin", name: "x", short: "x", color: "", token: "" });
  const stock = new Map<string, number>();
  for (const it of ((inv as R).items as R[]) || []) stock.set(skuCode(s(it.sku)), n(it.stock));
  const ventas = new Map<string, number>();
  for (const t of await tickets(ctx)) {
    const f = ymdUtc(t.timestamp);
    if (!f) continue;
    const day = Number(f.slice(8, 10));
    const mes = f.slice(0, 7);
    const qn = s(p.quincena);
    const wantMes = s(p.anio) && s(p.mes) ? s(p.anio) + "-" + String(s(p.mes)).padStart(2, "0") : mes;
    if (!f.startsWith(wantMes)) continue;
    if (qn === "1" && day > 15) continue;
    if (qn === "2" && day < 16) continue;
    for (const pr of productQtys(t)) if (pr.sku.startsWith(fam)) ventas.set(pr.sku, (ventas.get(pr.sku) || 0) + pr.qty);
  }
  const lineas = [];
  for (const [code, r] of cmap) {
    if (!code.startsWith(fam) || !activoCat(r.activo)) continue;
    const vendido = ventas.get(code) || 0;
    lineas.push({
      sku: s(r.sku), nombre: s(r.producto_servicio), vendido, stock: stock.get(code) || 0,
      sugerido: Math.ceil(vendido * 1.2), compra: n(r.precio_compra),
    });
  }
  return { items: lineas, familia: fam };
}
reg("crearOCApp", ADMIN, async (p, ctx, ses) => guardarOC(p, ctx, ses, false));
reg("editarOCApp", ADMIN, async (p, ctx, ses) => guardarOC(p, ctx, ses, true));
async function guardarOC(p: R, ctx: Ctx, ses: Ses, edit: boolean): Promise<R> {
  const items = (p.items as unknown[]) || [];
  const fact = (p.fact as unknown[]) || [];
  const directa = (p.directa as unknown[]) || [];
  if (!items.length && !fact.length && !directa.length) return { error: "La orden no tiene contenido" };
  let num = s(p.numOrden);
  if (!edit) {
    const prev = await ctx.db.all("ordenes_compra");
    let max = 0;
    for (const r of prev) { const m = s(r.numorden).match(/(\d+)/); if (m) max = Math.max(max, Number(m[1])); }
    num = "OC-" + String(max + 1).padStart(4, "0");
    const sheet_row = await nextSheet(ctx.db, "ordenes_compra");
    await ctx.db.write(actorOf(ses), "ordenes_compra", "insert", {}, {
      sheet_row, numorden: num, fecha: ecuadorParts(ctx.now).isoWall, proveedor: s(p.proveedor),
      json: { items, fact, directa, stock: p.stock, qLabel: p.qLabel, prov: p.provData }, orig: { num },
    });
    for (const ln of (p.stock as R[]) || items as R[]) {
      if (!(n(ln.cant || ln.qty || ln.restock) > 0)) continue;
      const sr = await nextSheet(ctx.db, "inventario_entradas");
      await ctx.db.write(actorOf(ses), "inventario_entradas", "insert", {}, {
        sheet_row: sr, sku: s(ln.sku), producto: s(ln.nombre), proveedor: s(p.proveedor),
        cant_pedida: n(ln.cant || ln.qty || ln.restock), orden: num, notas: s(ln.notas),
        orig: { orden: num },
      });
    }
  } else {
    const row = (await ctx.db.all("ordenes_compra")).find((r) => s(r.numorden) === num);
    if (!row) return { error: "Orden no encontrada" };
    await ctx.db.write(actorOf(ses), "ordenes_compra", "update", { sheet_row: row.sheet_row }, {
      proveedor: s(p.proveedor), json: { items, fact, directa, stock: p.stock, qLabel: p.qLabel },
    });
  }
  return { ok: true, numOrden: num };
}
reg("ocEliminar", ADMIN, async (p, ctx, ses) => {
  const num = s(p.num);
  const ents = (await ctx.db.all("inventario_entradas")).filter((r) => s(r.orden) === num);
  if (ents.some((r) => s(r.cant_recibida_llenar_aqui) !== "" && n(r.cant_recibida_llenar_aqui) > 0)) return { error: "Hay líneas recibidas" };
  for (const e of ents) await ctx.db.write(actorOf(ses), "inventario_entradas", "delete", { sheet_row: e.sheet_row }, null);
  const oc = (await ctx.db.all("ordenes_compra")).find((r) => s(r.numorden) === num);
  if (oc) await ctx.db.write(actorOf(ses), "ordenes_compra", "delete", { sheet_row: oc.sheet_row }, null);
  return { ok: true };
});

reg("toggleActivoCatalogo", ADMIN, async (p, ctx, ses) => {
  const rows = await ctx.db.all("catalogo");
  const row = rows.find((r) => skuCode(r.sku) === skuCode(s(p.sku)));
  if (!row) return { error: "SKU no encontrado" };
  await ctx.db.write(actorOf(ses), "catalogo", "update", { sheet_row: row.sheet_row }, { activo: p.activo === false || p.activo === "NO" ? false : true });
  return { ok: true };
});
reg("editarProductoCatalogo", ADMIN, async (p, ctx, ses) => {
  const rows = await ctx.db.all("catalogo");
  const row = rows.find((r) => skuCode(r.sku) === skuCode(s(p.sku)));
  if (!row) return { error: "SKU no encontrado" };
  const sub = n(p.subtotal);
  await ctx.db.write(actorOf(ses), "catalogo", "update", { sheet_row: row.sheet_row }, {
    producto_servicio: s(p.nombre) || s(row.producto_servicio), tipo: s(p.tipo) || s(row.tipo),
    subtotal: sub || n(row.subtotal), iva: round2((sub || n(row.subtotal)) * 0.15),
    total_con_iva: round2((sub || n(row.subtotal)) * IVA), precio_compra: n(p.compra ?? row.precio_compra),
  });
  return { ok: true };
});
reg("crearProductoApp", ADMIN, async (p, ctx, ses) => {
  const code = skuCode(s(p.sku));
  if (!/^[A-Z]{2,3}-\d{3}$/.test(code)) return { error: "SKU con formato FAM-###" };
  const rows = await ctx.db.all("catalogo");
  if (rows.some((r) => skuCode(r.sku) === code)) return { error: "Ese SKU ya existe" };
  const sub = n(p.subtotal);
  const sheet_row = await nextSheet(ctx.db, "catalogo");
  await ctx.db.write(actorOf(ses), "catalogo", "insert", {}, {
    sheet_row, sku: "SUNSU-" + code, producto_servicio: s(p.nombre), tipo: s(p.tipo) || "PRODUCTO",
    subtotal: sub, iva: round2(sub * 0.15), total_con_iva: round2(sub * IVA), precio_compra: n(p.compra),
    utilidad: round2(sub - n(p.compra)), comi_producto_30: round2((sub - n(p.compra)) * 0.3), activo: true,
    orig: { sku: code },
  });
  await ctx.db.write(actorOf(ses), "inventario_base", "insert", {}, { sku: "SUNSU-" + code, stock_inicial: 0, minimo: n(p.minimo) });
  return { ok: true, sku: "SUNSU-" + code };
});
reg("eliminarProductoApp", ADMIN, async (p, ctx, ses) => {
  if (s(p.confirmacion) && s(p.confirmacion) !== s(p.sku)) return { error: "Confirmación no coincide" };
  const rows = await ctx.db.all("catalogo");
  const row = rows.find((r) => skuCode(r.sku) === skuCode(s(p.sku)));
  if (!row) return { error: "SKU no encontrado" };
  await ctx.db.write(actorOf(ses), "catalogo", "delete", { sheet_row: row.sheet_row }, null);
  return { ok: true, aviso: "El historial de cantidades en tickets no se borra." };
});

reg("guardarInvFisico", "any", async (p, ctx, ses) => {
  const conteos = (p.conteos as R[]) || [];
  const ec = ecuadorParts(ctx.now).isoWall;
  for (const c of conteos) {
    const sr = await nextSheet(ctx.db, "inventario_fisico");
    const dif = n(c.fisico) - n(c.sistema);
    await ctx.db.write(actorOf(ses), "inventario_fisico", "insert", {}, {
      sheet_row: sr, fecha: ec, usuario: ses.name, sku: s(c.sku), producto: s(c.nombre),
      stock_sistema: n(c.sistema), conteo_fisico: n(c.fisico), diferencia: dif, estado: dif === 0 ? "OK" : "DIF",
      orig: { sku: s(c.sku) },
    });
  }
  return { ok: true, n: conteos.length };
});
reg("getInvFisicoSesiones", "any", async (_p, ctx) => {
  const map = new Map<string, R>();
  for (const r of await ctx.db.all("inventario_fisico")) {
    const id = s(r.fecha).slice(0, 19);
    if (!id) continue;
    const s0 = map.get(id) || { id, fecha: id, usuario: s(r.usuario), total: 0, difs: 0, resueltas: 0, fechaCuadre: "" };
    s0.total = n(s0.total) + 1;
    if (n(r.diferencia) !== 0) {
      s0.difs = n(s0.difs) + 1;
      if (s(r.col_9) || s(r.estado) === "RESUELTO") s0.resueltas = n(s0.resueltas) + 1;
    }
    map.set(id, s0);
  }
  return { sesiones: [...map.values()].reverse() };
});
reg("getInvFisicoDetalle", "any", async (p, ctx) => {
  const id = s(p.id);
  const inv = await FNS.getInventario({}, ctx, { uid: "x", rol: "admin", name: "x", short: "x", color: "", token: "" }) as R;
  const stock = new Map<string, number>();
  for (const it of (inv.items as R[]) || []) stock.set(s(it.sku), n(it.stock));
  const lineas = (await ctx.db.all("inventario_fisico")).filter((r) => s(r.fecha).slice(0, 19) === id).map((r) => ({
    sku: s(r.sku), producto: s(r.producto), sistema: n(r.stock_sistema), fisico: n(r.conteo_fisico),
    diferencia: n(r.diferencia), stockAhora: stock.get(s(r.sku)) ?? stock.get("SUNSU-" + skuCode(s(r.sku))) ?? null,
    estado: s(r.estado), nota: s(r.col_10 || r.col_9),
  }));
  return { id, lineas };
});
reg("resolverInvFisico", "any", async (p, ctx, ses) => {
  if (!s(p.nota)) return { error: "La justificación es obligatoria" };
  const rows = (await ctx.db.all("inventario_fisico")).filter((r) => s(r.fecha).startsWith(s(p.id)) && skuCode(r.sku) === skuCode(s(p.sku)));
  const row = rows[0];
  if (!row) return { error: "Línea no encontrada" };
  const patch: R = { col_10: s(p.nota), estado: p.modo === "corregir" ? "CORREGIDO" : "RESUELTO", col_9: ecuadorParts(ctx.now).isoWall };
  if (p.modo === "corregir") patch.conteo_fisico = n(p.nuevoFisico);
  await ctx.db.write(actorOf(ses), "inventario_fisico", "update", { sheet_row: row.sheet_row }, patch);
  return { ok: true };
});
reg("getMovimientosSku", "any", async (p, ctx) => {
  const code = skuCode(s(p.sku));
  const dias = n(p.dias) || 60;
  const desde = addDays(hoy(ctx), -dias);
  const ventas = [];
  for (const t of await tickets(ctx)) {
    if (ymdUtc(t.timestamp) < desde) continue;
    const pr = productQtys(t).find((x) => x.sku === code);
    if (pr) ventas.push({ fecha: ymdUtc(t.timestamp), fila: t.sheet_row, nombre: s(t.nombre), qty: pr.qty });
  }
  const entradas = (await ctx.db.all("inventario_entradas")).filter((r) => skuCode(r.sku) === code).map((r) => ({
    fila: r.sheet_row, pedida: n(r.cant_pedida), recibida: n(r.cant_recibida_llenar_aqui), orden: s(r.orden), notas: s(r.notas),
  }));
  return { ventas, entradas };
});
reg("getRendimientoProductos", ADMIN, async (p, ctx) => {
  const modo = s(p.modo || "mes");
  const cmap = await catMap(ctx);
  const buckets = new Map<string, R>();
  for (const t of await tickets(ctx)) {
    const f = ymdUtc(t.timestamp);
    if (!f) continue;
    const key = modo === "ano" || modo === "año" ? f.slice(0, 4) : f.slice(0, 7);
    for (const pr of productQtys(t)) {
      const k = key + "|" + pr.sku;
      const cur = buckets.get(k) || { periodo: key, sku: pr.sku, nombre: catNombre(cmap, pr.sku), unidades: 0, venta: 0, costo: 0 };
      cur.unidades = n(cur.unidades) + pr.qty;
      cur.venta = n(cur.venta) + pr.qty * subtotalDe(cmap, pr.sku);
      cur.costo = n(cur.costo) + pr.qty * n(cmap.get(pr.sku)?.precio_compra);
      buckets.set(k, cur);
    }
  }
  const items = [...buckets.values()].map((r) => ({ ...r, margen: round2(n(r.venta) - n(r.costo)) }));
  return { items };
});

export function extend(name: string, roles: string[] | "any", fn: (p: R, ctx: Ctx, ses: Ses) => Promise<unknown>) {
  reg(name, roles, fn);
}
export { FNS };
