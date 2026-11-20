// TK163 · App Sunsu para clientas y proveedores (Emilia 20/11, t741u–t745u).
// • Cuentas propias (beta_portal_cuentas), separadas del equipo: un token del portal nunca abre una acción del
//   equipo (loadSes solo mira app_usuarios/usuarios) y un token del equipo no abre el portal.
// • Cada cuenta queda atada para siempre a UNA clienta (cliente_key + código) o UN proveedor (proveedor_id);
//   el trigger beta_portal_vinculo_fijo impide cambiarlo.
// • Todo lo que sale al portal se arma aquí con listas blancas (nunca costos, comisiones, notas del equipo ni otras
//   personas) y pasa por portalLimpio() como red de seguridad.
// • «Eliminar cuenta» borra solo el acceso a la app; la ficha, historial, facturas y documentos se quedan en Sunsu.
import { extend, FNS } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, guardarArchivo, kvGet, kvSet, logAccion, nextSheet } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { cedulaVer, esCancelado, n, normCedula, productQtys, round2, s, skuCode, telefonoEc, ymdUtc, type Row } from "./domain.ts";
import { hashPass, igualSeguro, ITER, nuevaSal, hashTokenReset, nuevoTokenReset, validarPass, normEmail, validarEmail } from "./credenciales.ts";
import { enviarCorreo, proveedorCorreo } from "./correo.ts";
import { cargarAlias, canonDeClave } from "./clientes_alias.ts";
import { ocultarPrueba } from "./prueba.ts";
import { consultar } from "./query.ts";
import { acuityCache, acuityReq, limpiarCacheAcuity } from "./acuity.ts";
import { codigoCliente, ticketsDeClave, vendeDesdeCabina } from "./ventas.ts";
import { famDe } from "./consig_config.ts";
import { cargarPreciosConsig } from "./consig_precios.ts";
import { buscarProveedor, decidirVinculo, favoritosDe, limpiarPerfil, partirNombre, PERFIL_EDITABLE, portalLimpio, resumenVentas, telClave, validarIdentificacion, validarNombre, validarTelefono } from "./portal_core.ts";

const T_CTA = "beta_portal_cuentas", T_SES = "beta_portal_sesiones", T_PROP = "beta_portal_propuestas";
const SES_MS = 90 * 24 * 3600 * 1000, VERIF_MIN = 30, INVIT_DIAS = 7, RESET_MIN = 45;
export const ACUITY_URL_DEF = "https://app.acuityscheduling.com/schedule.php?owner=35065947";
const SYS: Ses = { uid: "portal", rol: "admin", name: "App Sunsu", short: "App", color: "", token: "" };
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const hoyEc = (now: Date) => new Date(now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
const addD = (ymd: string, d: number) => { const t = new Date(ymd + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
async function cuentas(ctx: Ctx): Promise<Row[]> { return await ctx.db.all(T_CTA); }
const actorCta = (c: Row) => "app:" + s(c.tipo) + ":" + s(c.email);
function codigo6(): string { const b = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000; return String(b).padStart(6, "0"); }

export async function portalConfig(ctx: Ctx): Promise<Row> {
  const c = await kvGet(ctx.db, "portal_config").catch(() => ({} as Row));
  return { acuity_url: s(c.acuity_url) || ACUITY_URL_DEF, whatsapp: s(c.whatsapp) };
}

// ─────────── Sesión del portal ───────────
async function abrirSesionPortal(ctx: Ctx, c: Row): Promise<Row> {
  const token = "pt_" + hex(crypto.getRandomValues(new Uint8Array(24)));
  await ctx.db.write(actorCta(c), T_SES, "insert", {}, { token, cuenta_id: c.id, exp: new Date(ctx.now.getTime() + SES_MS).toISOString() });
  await ctx.db.write(actorCta(c), T_CTA, "update", { id: c.id }, { ultimo_login: ctx.now.toISOString(), intentos: 0, bloqueado_hasta: null }).catch(() => null);
  return { ok: true, portal: true, token, tipo: s(c.tipo), cuenta: vistaCuenta(c) };
}
function vistaCuenta(c: Row): Row {
  return { tipo: s(c.tipo), nombre: s(c.nombre), email: s(c.email), estado: s(c.estado), codigo: s(c.cliente_codigo), proveedor: s(c.proveedor_familia), creada: s(c.created_at).slice(0, 10) };
}
async function cuentaDeToken(ctx: Ctx, token: unknown): Promise<Row | null> {
  const tk = s(token);
  if (!tk.startsWith("pt_")) return null;
  const r = (await consultar(ctx.db, T_SES, { filtros: [{ col: "token", op: "eq", val: tk }], limite: 1 }).catch(() => ({ rows: [] as Row[] }))).rows[0];
  if (!r || !(Date.parse(s(r.exp)) > ctx.now.getTime())) return null;
  const c = (await consultar(ctx.db, T_CTA, { filtros: [{ col: "id", op: "eq", val: s(r.cuenta_id) }], limite: 1 })).rows[0];
  if (!c || s(c.estado) !== "activa") return null;
  return c;
}

/** Login por correo + contraseña de una cuenta del portal (también lo usa login_pass cuando no es del equipo). */
export async function portalLogin(ctx: Ctx, email0: unknown, pass: string): Promise<Row | null> {
  const email = normEmail(email0);
  if (!email || !email.includes("@")) return null;
  let L: Row[] = [];
  try { L = await cuentas(ctx); } catch { return null; }
  const c = L.find((x) => normEmail(x.email) === email);
  if (!c) return null;
  if (c.bloqueado_hasta && Date.parse(s(c.bloqueado_hasta)) > ctx.now.getTime()) return { error: "Demasiados intentos. Espera unos minutos." };
  if (!s(c.pass_hash)) return { error: s(c.estado) === "invitada" ? "Abre el enlace de invitación que te mandó Sunsu para crear tu contraseña." : "Usuario o contraseña incorrectos" };
  const h = await hashPass(pass, s(c.pass_salt), n(c.iteraciones) || ITER);
  if (!igualSeguro(h, s(c.pass_hash))) {
    const intentos = n(c.intentos) + 1;
    await ctx.db.write("login", T_CTA, "update", { id: c.id }, { intentos, bloqueado_hasta: intentos >= 5 ? new Date(ctx.now.getTime() + 15 * 60000).toISOString() : null }).catch(() => null);
    return { error: "Usuario o contraseña incorrectos" };
  }
  const st = s(c.estado);
  if (st === "pendiente_email") return { error: "Confirma tu correo con el código que te enviamos.", verificar: true, email };
  if (st === "revision") return { error: "Tu cuenta está en revisión. Sunsu la confirmará pronto (te avisamos).", revision: true };
  if (st === "rechazada") return { error: "Esta cuenta no fue aprobada. Escríbenos a soporte." };
  if (st !== "activa") return { error: "Esta cuenta todavía no está activa." };
  await logAccion(ctx.db, actorCta(c), "APP LOGIN", s(c.tipo) + " " + email).catch(() => null);
  return await abrirSesionPortal(ctx, c);
}

// ─────────── Verificación de correo ───────────
async function emitirCodigo(ctx: Ctx, c: Row): Promise<{ enviado: boolean; motivo: string }> {
  const cod = codigo6();
  const verif_hash = await hashTokenReset(cod + ":" + s(c.id));
  await ctx.db.write(actorCta(c), T_CTA, "update", { id: c.id }, { verif_hash, verif_exp: new Date(ctx.now.getTime() + VERIF_MIN * 60000).toISOString(), verif_intentos: 0 });
  const r = await enviarCorreo(ctx, {
    para: s(c.email), asunto: "Tu código de Sunsu: " + cod,
    texto: "Hola " + s(c.nombre).split(" ")[0] + ". Tu código para confirmar tu correo en la app Sunsu es: " + cod + "\n\nVence en " + VERIF_MIN + " minutos. Si no fuiste tú, ignora este mensaje.",
  }).catch(() => ({ enviado: false, motivo: "no se pudo enviar" } as Row));
  return { enviado: r.enviado === true, motivo: s(r.motivo) };
}
/** Tras confirmar el correo (o sin proveedor de correo): activa si el vínculo fue automático; si no, a revisión. */
function estadoTrasCorreo(c: Row): string {
  return c.coincidencia && (c.coincidencia as Row).auto === true ? "activa" : "revision";
}

// ─────────── Crear cuenta: clienta ───────────
async function fichaSys(ctx: Ctx, key: string): Promise<Row | null> {
  const { ficha } = await import("./clientes_beta_api.ts");
  const f = await ficha(ctx, SYS, key).catch(() => ({ error: "x" } as Row));
  return f && !f.error ? f : null;
}
async function limiteIp(ctx: Ctx, ip0: string, max = 20): Promise<boolean> {
  // Registros aparte («alta:ip»): no cuentan para el bloqueo de login del equipo (la recepción comparte la IP del spa).
  if (!ip0) return false;
  const ip = "alta:" + ip0;
  try {
    const desde = new Date(ctx.now.getTime() - 60 * 60000).toISOString();
    const L = (await consultar(ctx.db, "login_intentos", { filtros: [{ col: "ip", op: "eq", val: ip }, { col: "ts", op: "gte", val: desde }] })).rows;
    if (L.length >= max) return true;
    await ctx.db.write("app-signup", "login_intentos", "insert", {}, { ip, ts: ctx.now.toISOString() });
  } catch { /* sin tabla */ }
  return false;
}
async function signupComun(ctx: Ctx, p: Row): Promise<Row> {
  const email = normEmail(p.email), pass = s(p.password);
  const ee = validarEmail(email); if (ee) return { error: ee };
  if (s(p.password) !== s(p.password2 ?? p.password)) return { error: "Las dos contraseñas no coinciden" };
  const ep = validarPass(pass); if (ep) return { error: ep };
  const L = await cuentas(ctx);
  if (L.some((c) => normEmail(c.email) === email)) return { error: "Ya hay una cuenta con ese correo. Inicia sesión o recupera tu contraseña." };
  const creds = await todas(ctx, "beta_credenciales");
  if (creds.some((c) => normEmail(c.email) === email)) return { error: "Ese correo es de una cuenta del equipo Sunsu. Usa otro correo." };
  if (await limiteIp(ctx, s(p.ip))) return { error: "Demasiados intentos desde esta conexión. Espera un rato." };
  const sal = nuevaSal();
  return { ok: true, email, L, pass_salt: sal, pass_hash: await hashPass(pass, sal, ITER) };
}
async function crearCuenta(ctx: Ctx, row: Row): Promise<Row> {
  const hayCorreo = !!proveedorCorreo(ctx.env);
  const rec: Row = { ...row, iteraciones: ITER, estado: hayCorreo ? "pendiente_email" : estadoTrasCorreo(row) };
  const saved = await ctx.db.write(actorCta(rec), T_CTA, "insert", {}, rec);
  if (!saved) return { error: "No se pudo crear la cuenta" };
  let envio = { enviado: false, motivo: "" };
  if (hayCorreo) envio = await emitirCodigo(ctx, saved);
  await logAccion(ctx.db, actorCta(saved), "APP CUENTA NUEVA", `${s(saved.tipo)} ${s(saved.email)} · ${s(saved.vinculo)} · ${s(saved.cliente_codigo || saved.proveedor_familia)} · ${s(rec.estado)}`).catch(() => null);
  const st = s(rec.estado);
  return {
    ok: true, estado: st, verificar: st === "pendiente_email", email: s(saved.email), enviado: envio.enviado,
    mensaje: st === "pendiente_email" ? "Te enviamos un código de 6 dígitos a tu correo." :
      st === "revision" ? "Recibimos tus datos. Sunsu confirmará tu cuenta pronto y te avisaremos." : "¡Listo! Ya puedes iniciar sesión.",
  };
}

async function signupCliente(ctx: Ctx, p: Row): Promise<Row> {
  const nombre = s(p.nombre).trim().replace(/\s+/g, " ");
  const en = validarNombre(nombre); if (en) return { error: en };
  const ei = validarIdentificacion(p.cedula); if (ei) return { error: ei };
  const et = validarTelefono(p.telefono); if (et) return { error: et };
  const nac = s(p.nacimiento).trim();
  if (nac && !/^\d{4}-\d{2}-\d{2}$/.test(nac)) return { error: "Fecha de nacimiento: usa AAAA-MM-DD" };
  if (p.acepta !== true && p.acepta !== "true") return { error: "Acepta la política de privacidad para continuar" };
  const base = await signupComun(ctx, p); if (base.error) return base;
  const ced = normCedula(p.cedula);
  await cargarAlias(ctx.db).catch(() => null);
  const key = canonDeClave("c:" + ced);
  const L = base.L as Row[];
  if (L.some((c) => s(c.tipo) === "cliente" && canonDeClave(s(c.cliente_key)) === key && s(c.estado) !== "rechazada")) {
    return { error: "Ya existe una cuenta para esa cédula. Inicia sesión o recupera tu contraseña." };
  }
  const f = await fichaSys(ctx, key);
  const tel = s(p.telefono).replace(/[^\d+]/g, "");
  let vinc: Row, codigo = "";
  if (f) {
    const d = (f.datos || {}) as Row;
    const regs = await consultar(ctx.db, "clientas_registro", { cols: ["cedula", "telefono"], filtros: [{ col: "borrado_at", op: "is_null" }] }).then((x) => x.rows.filter((r) => normCedula(r.cedula) === ced)).catch(() => [] as Row[]);
    vinc = decidirVinculo({ cedula: ced, email: base.email as string, telefono: tel }, { cedula: d.cedula || ced, emails: [d.email], telefonos: [d.telefono, ...regs.map((r) => r.telefono)] });
    codigo = s(f.codigo);
  } else {
    // Clienta nueva: fila en el registro (como registro.html) → código C-xxxxx propio.
    const { nombre: nom, apellido } = partirNombre(nombre);
    const sheet_row = await nextSheet(ctx.db, "clientas_registro");
    const ec = new Date(ctx.now.getTime() - 5 * 3600000).toISOString().slice(0, 19);
    const saved = await ctx.db.write("app-signup", "clientas_registro", "insert", {}, {
      sheet_row, timestamp: ec, cedula: ced, nombre: nom, apellido, telefono: tel, fecha_de_nacimiento: nac || null,
      orig: { cedula: ced, nombre: nom, fuente: "app", email: base.email },
    });
    codigo = codigoCliente(saved || { sheet_row });
    vinc = { vinculo: "nuevo", auto: true, por: [] };
    // El correo queda en la ficha (beta_clientes) para la clienta nueva.
    const { guardarCliente } = await import("./clientes_beta_api.ts");
    await guardarCliente(ctx, { ...SYS, name: "App Sunsu (registro)" }, key, { email: base.email, ...(nac ? { nacimiento: nac } : {}) }, "registro en la app").catch(() => null);
  }
  return await crearCuenta(ctx, {
    tipo: "cliente", email: base.email, pass_hash: base.pass_hash, pass_salt: base.pass_salt, nombre, cedula: ced, telefono: tel, nacimiento: nac || null,
    cliente_key: key, cliente_codigo: codigo || null, vinculo: vinc.vinculo, coincidencia: vinc,
  });
}

// ─────────── Crear cuenta: proveedor ───────────
async function provsConHoja(ctx: Ctx): Promise<Row[]> {
  const [erp, hoja] = await Promise.all([todas(ctx, "erp_proveedores"), todas(ctx, "proveedores")]);
  return erp.map((e) => {
    const h = hoja.find((x) => n(x.sheet_row) === n(e.legacy_sheet_row)) || hoja.find((x) => s(x.nombre).toLowerCase() === s(e.nombre).toLowerCase());
    return { id: s(e.id), nombre: s(e.nombre), ruc: s(e.ruc) || s(h?.ruc), email: s(h?.email), email_erp: s(e.email), telefono: s(e.telefono) || s(h?.telefono), fila: h ? n(h.sheet_row) : null, familia: s(h?.familia).toUpperCase(), activo: e.activo !== false };
  });
}
async function signupProveedor(ctx: Ctx, p: Row): Promise<Row> {
  const nombre = s(p.nombre).trim().replace(/\s+/g, " ");
  const en = validarNombre(nombre); if (en) return { error: "Escribe el nombre o razón social" };
  const ei = validarIdentificacion(p.ruc ?? p.cedula, true); if (ei) return { error: ei };
  const et = validarTelefono(p.telefono); if (et) return { error: et };
  if (p.acepta !== true && p.acepta !== "true") return { error: "Acepta la política de privacidad para continuar" };
  const base = await signupComun(ctx, p); if (base.error) return base;
  const ruc = s(p.ruc ?? p.cedula).replace(/\D/g, "") || s(p.ruc ?? p.cedula).trim().toUpperCase();
  const provs = await provsConHoja(ctx);
  const m = buscarProveedor(provs, ruc, base.email as string);
  const L = base.L as Row[];
  if (m.prov && L.some((c) => s(c.tipo) === "proveedor" && s(c.proveedor_id) === s(m.prov!.id) && s(c.estado) !== "rechazada")) {
    return { error: "Ese proveedor ya tiene una cuenta. Inicia sesión o pide a Sunsu que te invite." };
  }
  let prov = m.prov;
  const tel = s(p.telefono).replace(/[^\d+]/g, "");
  if (!prov) {
    const { codigosUsados, sugerirCodigo } = await import("./proveedores_beta_api.ts");
    const fam = sugerirCodigo(nombre, await codigosUsados(ctx));
    const sheet_row = await nextSheet(ctx.db, "proveedores");
    await ctx.db.write("app-signup", "proveedores", "insert", {}, { sheet_row, nombre, ruc, telefono: tel, email: base.email, familia: fam, notas: "Creado desde la app Sunsu", orig: { nombre, fuente: "app" } });
    const id = crypto.randomUUID();
    await ctx.db.write("app-signup", "erp_proveedores", "insert", {}, { id, nombre, ruc, telefono: tel, email: base.email, activo: true, legacy_sheet_row: sheet_row });
    prov = { id, nombre, ruc, fila: sheet_row, familia: fam };
  }
  return await crearCuenta(ctx, {
    tipo: "proveedor", email: base.email, pass_hash: base.pass_hash, pass_salt: base.pass_salt, nombre, cedula: ruc, telefono: tel,
    proveedor_id: s(prov.id), proveedor_fila: prov.fila ?? null, proveedor_familia: s(prov.familia) || null,
    vinculo: m.prov ? "existente" : "nuevo", coincidencia: { vinculo: m.prov ? "existente" : "nuevo", auto: m.prov ? m.auto : true, por: m.por },
  });
}

// ─────────── Datos de la clienta ───────────
const ES_PRODUCTO = (sku: string) => /^[A-Z]{2,3}-\d{3}$/.test(sku) && !/^(INV|AC|SU)-/.test(sku);
function carpetaDoc(d: Row): string {
  const sub = s(d.sub), blob = (s(d.nombre) + " " + sub).toLowerCase();
  if (s(d.tipo) === "foto") return "fotos";
  if (sub === "skin_analisis" || /focus\s*skin|skin/.test(blob)) return "skin";
  if (sub === "klift" || /k-?lift/.test(blob)) return "klift";
  if (s(d.tipo) === "consentimiento" || sub === "gift_card" || /acta|informe|tratamiento/.test(blob)) return "tratamientos";
  return "otros";
}
async function datosCliente(ctx: Ctx, c: Row): Promise<Row> {
  const key = canonDeClave(s(c.cliente_key));
  const f = await fichaSys(ctx, key);
  const cfg = await portalConfig(ctx);
  if (!f) return { ok: true, nueva: true, codigo: s(c.cliente_codigo), perfil: { nombres: s(c.nombre), cedula: cedulaVer(c.cedula), telefono: telefonoEc(c.telefono), email: s(c.email) }, campos: PERFIL_EDITABLE, historial: [], documentos: [], paquetes: [], giftcards: [], favoritos: favoritosDe([], ES_PRODUCTO), config: cfg };
  const d = (f.datos || {}) as Row;
  const perfil: Row = { cedula: cedulaVer(d.cedula || c.cedula) };
  for (const [k] of PERFIL_EDITABLE) if (d[k] != null) perfil[k] = s(d[k]);
  if (perfil.telefono) perfil.telefono = telefonoEc(perfil.telefono);
  const historial = ((f.historial || []) as Row[]).map((t) => ({
    fecha: s(t.fecha).slice(0, 10), hora: s(t.hora), facial: s(t.facial), cosmetologa: s(t.cosmetologa).split(" ")[0],
    paquete: !!t.paquete, productos: ((t.detalle || []) as Row[]).filter((l) => ES_PRODUCTO(s(l.sku).toUpperCase())).map((l) => ({ nombre: s(l.nombre), cantidad: n(l.cantidad) || 1 })),
    detalle: ((t.detalle || []) as Row[]).map((l) => ({ sku: s(l.sku), nombre: s(l.nombre), cantidad: n(l.cantidad) || 1 })),
  })).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const documentos: Row[] = [];
  for (const x of (f.documentos || []) as Row[]) {
    const tipo = s(x.tipo);
    if (tipo === "tarjeta" || tipo === "analisis" || tipo === "comprobante" || x.zip === true || tipo === "zip") continue;
    if (tipo === "foto") { if (s(x.url)) documentos.push({ carpeta: "fotos", nombre: s(x.nombre).replace(/\s*·\s*(TK|SO)[^·]*$/i, ""), fecha: s(x.fecha), foto: s(x.url) }); continue; }
    if (tipo === "consentimiento") { documentos.push({ carpeta: "tratamientos", nombre: "Consentimiento informado", fecha: s(x.fecha), firma: /^https?:/.test(s(x.url)) ? s(x.url) : "" }); continue; }
    if (!s(x.docId)) continue;
    documentos.push({ carpeta: carpetaDoc(x), nombre: s(x.nombre), fecha: s(x.fecha), docId: s(x.docId) });
  }
  // Fotos de tickets: solo las que viven fuera del sistema (https) o en app_archivos (se piden por portal_foto).
  const paquetes = ((f.paquetes || []) as Row[]).map((q) => ({ nombre: s(q.nombre), total: n(q.total), usados: n(q.usados), pendientes: n(q.pendientes), estado: s(q.estado), compra: s(q.fechaCompra).slice(0, 10), usos: ((q.usos || []) as Row[]).filter((u) => u.usado).map((u) => s(u.fecha).slice(0, 10)) }));
  const gdocs = new Map(((f.documentos || []) as Row[]).filter((x) => s(x.sub) === "gift_card").map((x) => [s(x.nombre).match(/Gift card (\S+)/)?.[1] || "", s(x.docId)]));
  const gifts0 = await todas(ctx, "gift_cards");
  const giftcards = ((f.giftcards || []) as Row[]).map((g) => {
    const row = gifts0.find((r) => s(r.codigo_gc) === s(g.codigo));
    return { codigo: s(g.codigo), valor: s(g.valor), saldo: g.saldo == null ? null : round2(n(g.saldo)), usado: g.usado === true, fecha: s(g.fecha), fechaUso: s(g.fechaUso), comprador: s(g.comprador), docId: gdocs.get(s(g.codigo)) || "", id: row ? row.id : null, para: s((row?.orig as Row | undefined)?.para), mensaje: s((row?.orig as Row | undefined)?.mensaje) };
  });
  const favs = favoritosDe(historial, ES_PRODUCTO);
  // Producto favorito: nombre, foto y precio de venta al público (nunca costo).
  if (favs.producto) {
    const pr = (await consultar(ctx.db, "erp_productos", { cols: ["sku", "nombre", "precio_venta", "beta_pvp", "foto_thumb", "beta_descripcion"], filtros: [{ col: "sku", op: "eq", val: s((favs.producto as Row).sku) }], limite: 1 }).catch(() => ({ rows: [] as Row[] }))).rows[0];
    if (pr) favs.producto = { ...(favs.producto as Row), nombre: s(pr.nombre) || s((favs.producto as Row).nombre), pvp: round2(n(pr.beta_pvp) || n(pr.precio_venta)), foto: s(pr.foto_thumb), descripcion: s(pr.beta_descripcion).slice(0, 400) };
  }
  const recomendacion = await recomendacionDe(ctx, key);
  return { ok: true, codigo: s(f.codigo) || s(c.cliente_codigo), perfil, campos: PERFIL_EDITABLE, historial: historial.map(({ detalle: _d, ...h }) => h), documentos, paquetes, giftcards, favoritos: favs, recomendacion, config: cfg };
}
/** Última «fecha de regreso» que puso la cosmetóloga en el ticket (+ tratamiento recomendado, o el facial que se hizo). */
async function recomendacionDe(ctx: Ctx, key: string): Promise<Row | null> {
  const rows = (await ticketsDeClave(ctx.db, key).catch(() => [] as Row[])).filter((r) => !r.borrado_at && !esCancelado(r));
  if (!rows.length) return null;
  const cabs = await consultar(ctx.db, "beta_tickets", { cols: ["clave", "datos"] }).then((x) => x.rows).catch(() => [] as Row[]);
  const { claveDe } = await import("./ticket_beta.ts");
  const { leerSerie } = await import("./series.ts");
  const datosDe = new Map(cabs.map((c) => [s(c.clave), (c.datos || {}) as Row]));
  const L = rows.map((r) => {
    const d = datosDe.get(claveDe(r, leerSerie(r, "so_num"))) || {};
    return { fecha: ymdUtc(r.timestamp), retorno: s(d.retorno || s(r.fecha_retorno).slice(0, 10)), trat: s(d.retornoTrat) || s(r.facial_hecho), cosm: s(d.cosmetologa || r.atendido_por).split(" ")[0] };
  }).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.retorno)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const r = L[0];
  if (!r) return null;
  const hoy = hoyEc(ctx.now);
  if (r.retorno < addD(hoy, -45)) return null; // muy vieja: no se insiste
  // Si ya volvió después de esa visita, la recomendación ya se cumplió.
  if (rows.some((t) => ymdUtc(t.timestamp) > r.fecha)) return null;
  return { fecha: r.retorno, tratamiento: r.trat, cosmetologa: r.cosm, desde: r.fecha };
}

// ─────────── Agenda (Acuity) ───────────
async function tiposPublicos(ctx: Ctx): Promise<Row[]> {
  const t = await acuityCache<Row[]>(ctx, "appointment-types", 10 * 60000);
  if (!Array.isArray(t)) return [];
  return t.filter((x) => x.active !== false && x.private !== true).map((x) => ({ id: x.id, nombre: s(x.name), duracion: n(x.duration), precio: s(x.price), categoria: s(x.category), descripcion: s(x.description).replace(/<[^>]+>/g, "").slice(0, 300), calendarIDs: x.calendarIDs || [] }));
}
async function citasDe(ctx: Ctx, c: Row, f?: Row | null): Promise<Row[]> {
  const hoy = hoyEc(ctx.now);
  const emails = [...new Set([s(c.email), s(((f?.datos || {}) as Row).email)].map((x) => x.trim().toLowerCase()).filter(Boolean))];
  const out = new Map<string, Row>();
  for (const em of emails) {
    const r = await acuityReq(ctx, `appointments?email=${encodeURIComponent(em)}&minDate=${hoy}&max=20`);
    if ("ok" in r && Array.isArray(r.data)) for (const a of r.data as Row[]) if (!a.canceled) out.set(s(a.id), a);
  }
  const tel = telClave(c.telefono);
  if (tel) {
    const r = await acuityReq(ctx, `appointments?phone=${encodeURIComponent("0" + tel)}&minDate=${hoy}&max=20`);
    if ("ok" in r && Array.isArray(r.data)) for (const a of r.data as Row[]) if (!a.canceled && telClave(a.phone) === tel) out.set(s(a.id), a);
  }
  return [...out.values()].map((a) => ({ id: a.id, fecha: s(a.datetime).slice(0, 10), hora: s(a.time), datetime: s(a.datetime), tipo: s(a.type), calendario: s(a.calendar).split(" ")[0], duracion: n(a.duration), puedeCancelar: a.canClientCancel !== false }))
    .sort((a, b) => s(a.datetime).localeCompare(s(b.datetime)));
}

// ─────────── Datos del proveedor ───────────
async function datosProveedor(ctx: Ctx, c: Row): Promise<Row> {
  const pid = s(c.proveedor_id);
  const provs = await provsConHoja(ctx);
  const prov = provs.find((x) => x.id === pid);
  if (!prov) return { error: "No encontramos tu proveedor" };
  const fam = s(prov.familia) || s(c.proveedor_familia);
  const prods0 = fam ? (await consultar(ctx.db, "erp_productos", { cols: ["id", "sku", "nombre", "foto_thumb", "activo", "beta_eliminado_at", "beta_origen", "uso", "clase", "sku_proveedor"] }).then((x) => x.rows).catch(() => [] as Row[]))
    .filter((x) => famDe(s(x.sku)) === fam && x.activo !== false && !s(x.beta_eliminado_at)) : [];
  const precios = fam ? await cargarPreciosConsig(ctx.db, fam).catch(() => new Map()) : new Map();
  const precio = (sku: string) => n((precios.get(skuCode(sku)) as Row | undefined)?.precio);
  // Stock en consignación (bodega Consignación + lo que todavía está en Venta), como en Compras › Consignación.
  let stock: Row[] = [];
  if (fam) { try { const { stockConsig } = await import("./consignacion_beta_api.ts"); stock = await stockConsig(ctx, SYS, fam); } catch { stock = []; } }
  const stockDe = new Map(stock.map((x) => [s(x.producto_id), n(x.enSunsu)]));
  const productos = prods0.map((x) => ({ id: s(x.id), sku: skuCode(s(x.sku)), nombre: s(x.nombre), foto: s(x.foto_thumb), precio: precio(s(x.sku)) || null, stock: stockDe.has(s(x.id)) ? stockDe.get(s(x.id)) : null, consig: stockDe.has(s(x.id)) }))
    .sort((a, b) => a.sku.localeCompare(b.sku));
  // Ventas de sus productos (tickets), por día/mes/año en Ecuador. Monto = unidades × su precio de consignación.
  const hoy = hoyEc(ctx.now), anio = hoy.slice(0, 4);
  const filas: { fecha: string; sku: string; qty: number }[] = [];
  if (fam) {
    const tks = await consultar(ctx.db, "tickets", { filtros: [{ col: "timestamp", op: "gte", val: anio + "-01-01" }] }).then((x) => x.rows).catch(() => [] as Row[]);
    const porSku = new Map(prods0.map((x) => [skuCode(s(x.sku)), x]));
    for (const t of tks) {
      if (t.borrado_at || esCancelado(t)) continue;
      const fecha = ymdUtc(t.timestamp);
      for (const q of productQtys(t)) {
        const sku = skuCode(q.sku);
        if (famDe(sku) !== fam) continue;
        if (vendeDesdeCabina(porSku.get(sku) || null, sku)) continue;
        filas.push({ fecha, sku, qty: q.qty });
      }
    }
  }
  const ventas = resumenVentas(filas, hoy, precio);
  const nomSku = new Map(productos.map((x) => [x.sku, x.nombre]));
  (ventas.topMes as Row[]).forEach((x) => { x.nombre = nomSku.get(s(x.sku)) || s(x.sku); });
  // Órdenes de compra, prepedido y actas.
  const ocs = (await todas(ctx, "erp_oc")).filter((o) => s(o.proveedor_id) === pid);
  const ocIds = new Set(ocs.map((o) => s(o.id)));
  const lineas = ocIds.size ? (await consultar(ctx.db, "erp_oc_lineas", { filtros: [{ col: "oc_id", op: "in", val: [...ocIds] }] }).then((x) => x.rows).catch(() => [] as Row[])) : [];
  const nomId = new Map(prods0.map((x) => [s(x.id), { sku: skuCode(s(x.sku)), nombre: s(x.nombre) }]));
  const allProds = lineas.some((l) => !nomId.has(s(l.producto_id))) ? await consultar(ctx.db, "erp_productos", { cols: ["id", "sku", "nombre"] }).then((x) => x.rows).catch(() => [] as Row[]) : [];
  for (const x of allProds) if (!nomId.has(s(x.id))) nomId.set(s(x.id), { sku: skuCode(s(x.sku)), nombre: s(x.nombre) });
  const vistaOc = (o: Row) => ({
    id: s(o.id), numero: s(o.numero) || "Pre-orden", fecha: s(o.fecha).slice(0, 10), estado: s(o.flujo) || s(o.estado), tipo: s(o.tipo) === "consignacion" ? "Consignación" : "Compra",
    total: round2(n(o.total)), saldo: round2(n(o.saldo)), pago: s(o.estado_pago),
    lineas: lineas.filter((l) => s(l.oc_id) === s(o.id)).sort((a, b) => n(a.orden) - n(b.orden)).map((l) => ({ ...(nomId.get(s(l.producto_id)) || { sku: "", nombre: "Producto" }), cantidad: n(l.cantidad), precio: round2(n(l.precio)), recibido: n(l.recibido) })),
  });
  const esBorr = (o: Row) => /borrador|pre-?orden|pre-?pedido/i.test(s(o.flujo) + " " + s(o.estado));
  const ordenes = ocs.filter((o) => !esBorr(o) && !/cancel/i.test(s(o.estado) + s(o.flujo))).map(vistaOc).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const prepedidos = ocs.filter(esBorr).map(vistaOc).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const rst = (await todas(ctx, "beta_consig_restock")).filter((x) => s(x.proveedor_id) === pid && s(x.estado) !== "anulada").sort((a, b) => s(b.created_at).localeCompare(s(a.created_at)));
  const restock = rst[0] ? { numero: s(rst[0].numero), desde: s(rst[0].desde), hasta: s(rst[0].hasta), estado: s(rst[0].estado), fecha: s(rst[0].created_at).slice(0, 10),
    lineas: (Array.isArray(rst[0].lineas) ? rst[0].lineas as Row[] : []).map((l) => ({ sku: skuCode(s(l.sku)), nombre: s(l.nombre) || nomSku.get(skuCode(s(l.sku))) || s(l.sku), cantidad: n(l.cantidad ?? l.pedir ?? l.qty) })).filter((l) => l.cantidad > 0) } : null;
  const actas = (await todas(ctx, "beta_actas")).filter((a) => s(a.proveedor_id) === pid || ocIds.has(s(a.oc_id))).map((a) => ({ id: s(a.id), numero: s(a.numero), fecha: s(a.created_at).slice(0, 10), firmada: !!s(a.firmado_at), firmadaProveedor: !!s(a.firma_proveedor_at), pdf: !!s(a.storage_path), oc: ocs.find((o) => s(o.id) === s(a.oc_id))?.numero || "" }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const propuestas = (await todas(ctx, T_PROP)).filter((x) => s(x.proveedor_id) === pid).sort((a, b) => s(b.created_at).localeCompare(s(a.created_at))).slice(0, 50)
    .map((x) => ({ id: s(x.id), tipo: s(x.tipo), sku: s(x.sku), producto: s(x.producto_nombre), detalle: x.detalle, mensaje: s(x.mensaje), estado: s(x.estado), nota: s(x.nota_admin), fecha: s(x.created_at).slice(0, 10) }));
  return { ok: true, proveedor: { nombre: s(prov.nombre), ruc: s(prov.ruc), codigo: fam }, productos, ventas, prepedidos, restock, ordenes, actas, propuestas };
}

// ─────────── Router del portal (acciones portal_*) ───────────
type Fn = (p: Row, ctx: Ctx, c: Row) => Promise<Row>;
const PUB: Record<string, (p: Row, ctx: Ctx) => Promise<Row>> = {
  portal_config: async (_p, ctx) => ({ ok: true, ...(await portalConfig(ctx)), correo: !!proveedorCorreo(ctx.env) }),
  portal_signup_cliente: (p, ctx) => signupCliente(ctx, p),
  portal_signup_proveedor: (p, ctx) => signupProveedor(ctx, p),
  portal_login: async (p, ctx) => (await portalLogin(ctx, p.email ?? p.usuario, s(p.password))) || { error: "Usuario o contraseña incorrectos" },
  portal_verificar: async (p, ctx) => {
    const email = normEmail(p.email), cod = s(p.codigo).replace(/\D/g, "");
    const c = (await cuentas(ctx)).find((x) => normEmail(x.email) === email);
    if (!c || s(c.estado) !== "pendiente_email") return { error: "No hay un código pendiente para ese correo" };
    if (n(c.verif_intentos) >= 5) return { error: "Demasiados intentos. Pide un código nuevo." };
    if (!(Date.parse(s(c.verif_exp)) > ctx.now.getTime())) return { error: "El código venció. Pide uno nuevo." };
    const h = await hashTokenReset(cod + ":" + s(c.id));
    if (!igualSeguro(h, s(c.verif_hash))) { await ctx.db.write(actorCta(c), T_CTA, "update", { id: c.id }, { verif_intentos: n(c.verif_intentos) + 1 }); return { error: "Código incorrecto" }; }
    const estado = estadoTrasCorreo(c);
    const upd = await ctx.db.write(actorCta(c), T_CTA, "update", { id: c.id }, { estado, email_verificado_at: ctx.now.toISOString(), verif_hash: null, verif_exp: null });
    await logAccion(ctx.db, actorCta(c), "APP CORREO OK", s(c.email) + " → " + estado).catch(() => null);
    if (estado === "activa" && upd) return await abrirSesionPortal(ctx, upd);
    return { ok: true, estado, mensaje: "Correo confirmado. Sunsu revisará tu cuenta y te avisará." };
  },
  portal_reenviar: async (p, ctx) => {
    const email = normEmail(p.email);
    const c = (await cuentas(ctx)).find((x) => normEmail(x.email) === email);
    if (c && s(c.estado) === "pendiente_email") await emitirCodigo(ctx, c);
    return { ok: true, mensaje: "Si hay una cuenta pendiente con ese correo, te enviamos un código nuevo." };
  },
  portal_reset_pedir: async (p, ctx) => {
    const email = normEmail(p.email);
    const c = (await cuentas(ctx)).find((x) => normEmail(x.email) === email && s(x.estado) === "activa");
    if (c) {
      const token = nuevoTokenReset();
      await ctx.db.write(actorCta(c), T_CTA, "update", { id: c.id }, { verif_hash: "r:" + await hashTokenReset(token), verif_exp: new Date(ctx.now.getTime() + RESET_MIN * 60000).toISOString() });
      const base = s(ctx.env.SUNSU_APP_URL) || "https://app.sunsuspa.com/";
      await enviarCorreo(ctx, { para: s(c.email), asunto: "Restablece tu contraseña de Sunsu", texto: "Abre este enlace para elegir una contraseña nueva (vale 45 minutos):\n" + base.replace(/\/?$/, "/") + "#/app-clave/" + token + "\n\nSi no fuiste tú, ignora este mensaje." }).catch(() => null);
    }
    return { ok: true, mensaje: "Si ese correo tiene una cuenta, te enviamos las instrucciones." };
  },
  portal_clave_validar: async (p, ctx) => {
    const c = await cuentaDeEnlace(ctx, s(p.token));
    return c ? { ok: true, email: s(c.email), nombre: s(c.nombre), invitacion: s(c.estado) === "invitada" } : { error: "Ese enlace no es válido o ya venció." };
  },
  portal_clave_aplicar: async (p, ctx) => {
    const c = await cuentaDeEnlace(ctx, s(p.token));
    if (!c) return { error: "Ese enlace no es válido o ya venció." };
    if (s(p.password) !== s(p.password2)) return { error: "Las dos contraseñas no coinciden" };
    const ep = validarPass(s(p.password)); if (ep) return { error: ep };
    const sal = nuevaSal();
    const inv = s(c.estado) === "invitada";
    const upd = await ctx.db.write(actorCta(c), T_CTA, "update", { id: c.id }, { pass_salt: sal, pass_hash: await hashPass(s(p.password), sal, ITER), iteraciones: ITER, verif_hash: null, verif_exp: null, intentos: 0, bloqueado_hasta: null, ...(inv ? { estado: "activa", email_verificado_at: ctx.now.toISOString() } : {}) });
    for (const x of await todas(ctx, T_SES)) if (s(x.cuenta_id) === s(c.id)) await ctx.db.write(actorCta(c), T_SES, "delete", { token: s(x.token) }, null).catch(() => null);
    await logAccion(ctx.db, actorCta(c), inv ? "APP INVITACION ACEPTADA" : "APP CLAVE NUEVA", s(c.email)).catch(() => null);
    return upd ? await abrirSesionPortal(ctx, upd) : { error: "No se pudo guardar" };
  },
};
async function cuentaDeEnlace(ctx: Ctx, token: string): Promise<Row | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const h = "r:" + await hashTokenReset(token);
  const c = (await cuentas(ctx)).find((x) => s(x.verif_hash) === h);
  if (!c || !(Date.parse(s(c.verif_exp)) > ctx.now.getTime())) return null;
  if (!["activa", "invitada"].includes(s(c.estado))) return null;
  return c;
}

const PRIV: Record<string, Fn> = {
  portal_me: async (_p, _ctx, c) => ({ ok: true, cuenta: vistaCuenta(c) }),
  portal_logout: async (p, ctx, c) => { await ctx.db.write(actorCta(c), T_SES, "delete", { token: s(p.token) }, null).catch(() => null); return { ok: true }; },
  portal_eliminar_cuenta: async (p, ctx, c) => {
    const h = await hashPass(s(p.password), s(c.pass_salt), n(c.iteraciones) || ITER);
    if (!igualSeguro(h, s(c.pass_hash))) return { error: "La contraseña no es correcta" };
    // Solo el acceso: la ficha de clienta / proveedor, historial, facturas y documentos se quedan en Sunsu.
    for (const x of await todas(ctx, T_SES)) if (s(x.cuenta_id) === s(c.id)) await ctx.db.write(actorCta(c), T_SES, "delete", { token: s(x.token) }, null).catch(() => null);
    await ctx.db.write(actorCta(c), T_CTA, "delete", { id: c.id }, null);
    await logAccion(ctx.db, actorCta(c), "APP CUENTA ELIMINADA", `${s(c.tipo)} ${s(c.email)} · ${s(c.cliente_codigo || c.proveedor_familia)} (la ficha y sus documentos se conservan)`).catch(() => null);
    return { ok: true };
  },
  // Clienta
  portal_cliente: async (_p, ctx, c) => { if (s(c.tipo) !== "cliente") return { error: "Solo para clientas" }; return await datosCliente(ctx, c); },
  portal_perfil_guardar: async (p, ctx, c) => {
    if (s(c.tipo) !== "cliente") return { error: "Solo para clientas" };
    const { limpio, error } = limpiarPerfil((p.cambios || {}) as Row);
    if (error) return { error };
    if (!Object.keys(limpio).length) return { error: "Nada que cambiar" };
    const { guardarCliente } = await import("./clientes_beta_api.ts");
    const r = await guardarCliente(ctx, { ...SYS, uid: "app-" + s(c.id).slice(0, 8), name: "App · " + s(c.nombre) }, canonDeClave(s(c.cliente_key)), limpio, "la clienta desde la app");
    if (r.ok && !r.sinCambios) await logAccion(ctx.db, actorCta(c), "APP PERFIL", s(c.cliente_codigo) + " · " + ((r.cambios || []) as string[]).join(", ")).catch(() => null);
    return r.error ? r : { ok: true, cambios: r.cambios || [], sinCambios: !!r.sinCambios };
  },
  portal_doc: async (p, ctx, c) => {
    if (s(c.tipo) !== "cliente") return { error: "Solo para clientas" };
    const id = s(p.id); if (!id) return { error: "Falta el documento" };
    // cl_doc_url vuelve a comprobar que el documento está en SU ficha.
    return await FNS["cl_doc_url"]({ id, key: canonDeClave(s(c.cliente_key)), descargar: p.descargar === true }, ctx, SYS) as Row;
  },
  portal_foto: async (p, ctx, c) => {
    if (s(c.tipo) !== "cliente") return { error: "Solo para clientas" };
    const f = await fichaSys(ctx, canonDeClave(s(c.cliente_key)));
    const url = s(p.url);
    if (!f || !((f.documentos || []) as Row[]).some((x) => s(x.tipo) === "foto" && s(x.url) === url)) return { error: "Esa foto no es tuya" };
    if (/^https?:/.test(url)) return { ok: true, url };
    const m = url.match(/^archivo:([-\w]+)$/); if (!m) return { error: "Foto no disponible" };
    const a = (await consultar(ctx.db, "app_archivos", { filtros: [{ col: "id", op: "eq", val: m[1] }], limite: 1 })).rows[0];
    if (!a) return { error: "Foto no disponible" };
    return { ok: true, url: "data:" + (s(a.mime) || "image/jpeg") + ";base64," + s(a.data_b64) };
  },
  portal_ag_meta: async (_p, ctx, c) => {
    if (s(c.tipo) !== "cliente") return { error: "Solo para clientas" };
    if (!ctx.env.ACUITY_UID || !ctx.env.ACUITY_KEY) return { ok: true, nativo: false, url: (await portalConfig(ctx)).acuity_url };
    const [tipos, cals] = await Promise.all([tiposPublicos(ctx), acuityCache<Row[]>(ctx, "calendars", 10 * 60000)]);
    const f = await fichaSys(ctx, canonDeClave(s(c.cliente_key)));
    return { ok: true, nativo: true, tipos, calendarios: (Array.isArray(cals) ? cals : []).map((x) => ({ id: x.id, nombre: s(x.name).split(" ")[0] })), citas: await citasDe(ctx, c, f), url: (await portalConfig(ctx)).acuity_url, hoy: hoyEc(ctx.now) };
  },
  portal_ag_fechas: async (p, ctx, c) => {
    if (s(c.tipo) !== "cliente") return { error: "Solo para clientas" };
    const mes = s(p.mes); if (!/^\d{4}-\d{2}$/.test(mes) || !s(p.tipoID)) return { error: "Elige el tratamiento" };
    if (!(await tiposPublicos(ctx)).some((t) => String(t.id) === s(p.tipoID))) return { error: "Ese tratamiento no se agenda en línea" };
    const q = `availability/dates?appointmentTypeID=${encodeURIComponent(s(p.tipoID))}&month=${mes}` + (s(p.calendarID) ? "&calendarID=" + encodeURIComponent(s(p.calendarID)) : "") + "&timezone=America/Guayaquil";
    const r = await acuityReq(ctx, q); if ("error" in r) return { error: r.error };
    return { ok: true, fechas: (r.data as Row[]).map((x) => s(x.date)) };
  },
  portal_ag_horas: async (p, ctx, c) => {
    if (s(c.tipo) !== "cliente") return { error: "Solo para clientas" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s(p.fecha)) || !s(p.tipoID)) return { error: "Elige tratamiento y fecha" };
    if (!(await tiposPublicos(ctx)).some((t) => String(t.id) === s(p.tipoID))) return { error: "Ese tratamiento no se agenda en línea" };
    const q = `availability/times?appointmentTypeID=${encodeURIComponent(s(p.tipoID))}&date=${s(p.fecha)}` + (s(p.calendarID) ? "&calendarID=" + encodeURIComponent(s(p.calendarID)) : "") + "&timezone=America/Guayaquil";
    const r = await acuityReq(ctx, q); if ("error" in r) return { error: r.error };
    return { ok: true, horas: (r.data as Row[]).map((x) => ({ time: s(x.time), hora: s(x.time).slice(11, 16), calendarID: x.calendarID ?? null })) };
  },
  portal_ag_reservar: async (p, ctx, c) => {
    if (s(c.tipo) !== "cliente") return { error: "Solo para clientas" };
    const dt = s(p.datetime);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dt) || !s(p.tipoID)) return { error: "Elige tratamiento, fecha y hora" };
    if (!(await tiposPublicos(ctx)).some((t) => String(t.id) === s(p.tipoID))) return { error: "Ese tratamiento no se agenda en línea" };
    const f = await fichaSys(ctx, canonDeClave(s(c.cliente_key)));
    const d = (f?.datos || {}) as Row;
    const pn = partirNombre(s(c.nombre));
    const body: Row = { datetime: dt, appointmentTypeID: Number(p.tipoID), firstName: s(d.nombres) || pn.nombre, lastName: s(d.apellido) || pn.apellido || "-", email: s(c.email), phone: s(c.telefono), notes: ("Agendada desde la app Sunsu · " + s(c.cliente_codigo) + (s(p.nota) ? " · " + s(p.nota).slice(0, 300) : "")).trim() };
    if (s(p.calendarID)) body.calendarID = Number(p.calendarID);
    const r = await acuityReq(ctx, "appointments", { method: "POST", body }); // sin admin=true: Acuity valida el horario
    if ("error" in r) return { error: r.error.replace(/^Acuity respondió \d+:?\s*/, "") || "No se pudo agendar" };
    limpiarCacheAcuity();
    const a = r.data as Row;
    await logAccion(ctx.db, actorCta(c), "APP CITA", `${s(c.cliente_codigo)} · ${s(a.type)} · ${s(a.datetime)} · #${s(a.id)}`).catch(() => null);
    return { ok: true, cita: { id: a.id, fecha: s(a.datetime).slice(0, 10), hora: s(a.time), tipo: s(a.type), calendario: s(a.calendar).split(" ")[0] } };
  },
  portal_ag_cancelar: async (p, ctx, c) => {
    if (s(c.tipo) !== "cliente") return { error: "Solo para clientas" };
    const f = await fichaSys(ctx, canonDeClave(s(c.cliente_key)));
    const mias = await citasDe(ctx, c, f);
    const cita = mias.find((x) => s(x.id) === s(p.id));
    if (!cita) return { error: "Esa cita no es tuya" };
    const r = await acuityReq(ctx, "appointments/" + encodeURIComponent(s(p.id)) + "/cancel", { method: "PUT", body: { cancelNote: "Cancelada por la clienta desde la app Sunsu" } });
    if ("error" in r) return { error: r.error };
    limpiarCacheAcuity();
    await logAccion(ctx.db, actorCta(c), "APP CITA CANCELADA", `${s(c.cliente_codigo)} · #${s(p.id)}`).catch(() => null);
    return { ok: true };
  },
  // Proveedor
  portal_proveedor: async (_p, ctx, c) => { if (s(c.tipo) !== "proveedor") return { error: "Solo para proveedores" }; return await datosProveedor(ctx, c); },
  portal_acta: async (p, ctx, c) => {
    if (s(c.tipo) !== "proveedor") return { error: "Solo para proveedores" };
    const d = await datosProveedor(ctx, c);
    if (!((d.actas || []) as Row[]).some((a) => s(a.id) === s(p.id) && a.pdf)) return { error: "Esa acta no es tuya o no tiene PDF" };
    return await FNS["acta_link"]({ id: s(p.id) }, ctx, SYS) as Row;
  },
  portal_prov_foto: async (p, ctx, c) => {
    if (s(c.tipo) !== "proveedor") return { error: "Solo para proveedores" };
    const pr = (await consultar(ctx.db, "erp_productos", { cols: ["id", "sku", "nombre", "foto_url"], filtros: [{ col: "id", op: "eq", val: s(p.id) }], limite: 1 }).catch(() => ({ rows: [] as Row[] }))).rows[0];
    const fam = s(c.proveedor_familia) || s((await provsConHoja(ctx)).find((x) => x.id === s(c.proveedor_id))?.familia);
    if (!pr || !fam || famDe(s(pr.sku)) !== fam) return { error: "Ese producto no es tuyo" };
    const raw = s(p.foto_b64);
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(raw)) return { error: "Sube una foto JPG o PNG" };
    const aid = await guardarArchivo(ctx.db, actorCta(c), "foto-producto", "foto-proveedor.jpg", raw);
    if (!aid) return { error: "La foto es demasiado grande" };
    const patch: Row = { foto_url: "archivo:" + aid, beta_editado_por: actorCta(c) + " (app proveedor)", beta_editado_at: ctx.now.toISOString() };
    const th = s(p.thumb_b64); if (th.startsWith("data:image/") && th.length < 60000) patch.foto_thumb = th;
    await ctx.db.write(actorCta(c), "erp_productos", "update", { id: pr.id }, patch);
    await logAccion(ctx.db, actorCta(c), "APP PROVEEDOR FOTO", `${skuCode(s(pr.sku))} · antes: ${s(pr.foto_url) || "sin foto"} → archivo:${aid}`).catch(() => null);
    return { ok: true };
  },
  portal_prov_propuesta: async (p, ctx, c) => {
    if (s(c.tipo) !== "proveedor") return { error: "Solo para proveedores" };
    const tipo = s(p.tipo);
    if (!["precio", "descuento", "beneficio"].includes(tipo)) return { error: "Tipo inválido" };
    const fam = s(c.proveedor_familia) || s((await provsConHoja(ctx)).find((x) => x.id === s(c.proveedor_id))?.familia);
    let pr: Row | undefined;
    if (s(p.producto_id)) {
      pr = (await consultar(ctx.db, "erp_productos", { cols: ["id", "sku", "nombre"], filtros: [{ col: "id", op: "eq", val: s(p.producto_id) }], limite: 1 }).catch(() => ({ rows: [] as Row[] }))).rows[0];
      if (!pr || famDe(s(pr.sku)) !== fam) return { error: "Ese producto no es tuyo" };
    }
    const detalle: Row = {};
    if (tipo === "precio") { const v = n(p.precio); if (!pr || !(v > 0) || v > 10000) return { error: "Elige el producto y el precio sugerido" }; detalle.precio = round2(v); }
    if (tipo === "descuento") { const v = n(p.descuento_pct); if (!(v > 0 && v < 100)) return { error: "El descuento va entre 1 y 99 %" }; detalle.descuento_pct = round2(v); if (s(p.desde)) detalle.desde = s(p.desde).slice(0, 10); if (s(p.hasta)) detalle.hasta = s(p.hasta).slice(0, 10); }
    if (tipo === "beneficio") { const u = n(p.unidades), v = n(p.descuento_pct); if (!(u > 0) || !(v > 0 && v < 100)) return { error: "Indica desde cuántas unidades y el % de descuento" }; detalle.unidades = u; detalle.descuento_pct = round2(v); detalle.periodo = s(p.periodo) || "mes"; }
    const mensaje = s(p.mensaje).trim().slice(0, 600);
    const saved = await ctx.db.write(actorCta(c), T_PROP, "insert", {}, { cuenta_id: c.id, proveedor_id: c.proveedor_id, familia: fam || null, tipo, producto_id: pr ? pr.id : null, sku: pr ? skuCode(s(pr.sku)) : null, producto_nombre: pr ? s(pr.nombre) : null, detalle, mensaje, estado: "pendiente", creado_por: s(c.nombre) });
    await logAccion(ctx.db, actorCta(c), "APP PROPUESTA", `${fam} · ${tipo} · ${pr ? skuCode(s(pr.sku)) : "general"} · ${JSON.stringify(detalle)}`).catch(() => null);
    return { ok: true, id: saved ? s(saved.id) : "", mensaje: "Enviado. Sunsu revisará tu propuesta; nada cambia hasta que la aprueben." };
  },
};

export async function portalHandle(action: string, p: Row, ctx0: Ctx): Promise<unknown> {
  const ctx: Ctx = { ...ctx0, db: ocultarPrueba(ctx0.db), ses: null };
  await cargarAlias(ctx.db).catch(() => null);
  try {
    const pub = PUB[action];
    if (pub) { const out = await pub(p, ctx); return portalLimpio(out) ? out : { error: "Respuesta bloqueada por privacidad" }; }
    const fn = PRIV[action];
    if (!fn) return { error: "Acción no disponible" };
    const c = await cuentaDeToken(ctx, p.token);
    if (!c) return { error: "Inicia sesión", auth_error: true };
    const out = await fn(p, ctx, c);
    return portalLimpio(out) ? out : { error: "Respuesta bloqueada por privacidad" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────── Admin (equipo): cuentas, invitaciones, revisión de propuestas, ajustes ───────────
const soloAdmin = (ses: Ses) => esAdmin(ses.rol) ? null : { error: "Solo administradores" };
extend("padm_resumen", "any", async (_p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const [L, P] = await Promise.all([todas(ctx, T_CTA), todas(ctx, T_PROP)]);
  return { ok: true, revision: L.filter((c) => s(c.estado) === "revision").length, propuestas: P.filter((x) => s(x.estado) === "pendiente").length };
});
extend("padm_cuentas", "any", async (_p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const [L, provs] = await Promise.all([todas(ctx, T_CTA), provsConHoja(ctx)]);
  const pn = new Map(provs.map((x) => [x.id, x.nombre]));
  return {
    ok: true, correo: !!proveedorCorreo(ctx.env), config: await portalConfig(ctx),
    cuentas: L.sort((a, b) => s(b.created_at).localeCompare(s(a.created_at))).map((c) => ({
      id: s(c.id), tipo: s(c.tipo), nombre: s(c.nombre), email: s(c.email), telefono: telefonoEc(c.telefono), cedula: cedulaVer(c.cedula), estado: s(c.estado), vinculo: s(c.vinculo),
      coincidencia: ((c.coincidencia || {}) as Row).por || [], codigo: s(c.cliente_codigo), clienteKey: s(c.cliente_key), proveedor: pn.get(s(c.proveedor_id)) || "", familia: s(c.proveedor_familia),
      correoOk: !!s(c.email_verificado_at), creada: s(c.created_at), ultimo: s(c.ultimo_login), revisadoPor: s(c.revisado_por), invitadoPor: s(c.invitado_por),
    })),
    proveedores: provs.filter((x) => x.activo).map((x) => ({ id: x.id, nombre: x.nombre, familia: x.familia, email: x.email || x.email_erp })).sort((a, b) => s(a.nombre).localeCompare(s(b.nombre))),
  };
});
extend("padm_cuenta_aprobar", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const c = (await todas(ctx, T_CTA)).find((x) => s(x.id) === s(p.id));
  if (!c) return { error: "Cuenta no encontrada" };
  if (!["revision", "pendiente_email"].includes(s(c.estado))) return { error: "Esa cuenta no está en revisión" };
  await ctx.db.write(actorOf(ses), T_CTA, "update", { id: c.id }, { estado: "activa", revisado_por: ses.name, revisado_at: ctx.now.toISOString(), nota_revision: s(p.nota).slice(0, 300) || null });
  await logAccion(ctx.db, actorOf(ses), "APP CUENTA APROBADA", `${s(c.tipo)} ${s(c.email)} · ${s(c.cliente_codigo || c.proveedor_familia)}`);
  await enviarCorreo(ctx, { para: s(c.email), asunto: "Tu cuenta de Sunsu está lista", texto: "Hola " + s(c.nombre).split(" ")[0] + ". Sunsu aprobó tu cuenta. Ya puedes iniciar sesión en la app con tu correo y contraseña." }).catch(() => null);
  return { ok: true };
});
extend("padm_cuenta_rechazar", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const c = (await todas(ctx, T_CTA)).find((x) => s(x.id) === s(p.id));
  if (!c) return { error: "Cuenta no encontrada" };
  // Se borra el acceso (no la ficha). Así la persona real puede crear su cuenta después.
  for (const x of await todas(ctx, T_SES)) if (s(x.cuenta_id) === s(c.id)) await ctx.db.write(actorOf(ses), T_SES, "delete", { token: s(x.token) }, null).catch(() => null);
  await ctx.db.write(actorOf(ses), T_CTA, "delete", { id: c.id }, null);
  await logAccion(ctx.db, actorOf(ses), "APP CUENTA RECHAZADA", `${s(c.tipo)} ${s(c.email)} · ${s(c.cliente_codigo || c.proveedor_familia)} · ${s(p.motivo).slice(0, 200)}`);
  return { ok: true };
});
extend("padm_invitar_proveedor", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const email = normEmail(p.email);
  const ee = validarEmail(email); if (ee) return { error: ee };
  const prov = (await provsConHoja(ctx)).find((x) => x.id === s(p.proveedor_id));
  if (!prov) return { error: "Elige el proveedor" };
  const L = await todas(ctx, T_CTA);
  if (L.some((c) => normEmail(c.email) === email)) return { error: "Ya hay una cuenta con ese correo" };
  if (L.some((c) => s(c.proveedor_id) === prov.id && s(c.estado) !== "rechazada")) return { error: "Ese proveedor ya tiene una cuenta (bórrala primero si quieres invitar otro correo)" };
  const token = nuevoTokenReset();
  const saved = await ctx.db.write(actorOf(ses), T_CTA, "insert", {}, {
    tipo: "proveedor", email, nombre: s(p.nombre).trim() || s(prov.nombre), cedula: s(prov.ruc), telefono: s(prov.telefono), proveedor_id: prov.id, proveedor_fila: prov.fila, proveedor_familia: prov.familia || null,
    estado: "invitada", vinculo: "existente", coincidencia: { vinculo: "existente", auto: true, por: ["invitacion"] }, invitado_por: ses.name,
    verif_hash: "r:" + await hashTokenReset(token), verif_exp: new Date(ctx.now.getTime() + INVIT_DIAS * 86400000).toISOString(),
  });
  const base = (s(ctx.env.SUNSU_APP_URL) || "https://app.sunsuspa.com/").replace(/\/?$/, "/");
  const enlace = base + "#/app-clave/" + token;
  const envio = await enviarCorreo(ctx, { para: email, asunto: "Sunsu te invita a su app de proveedores", texto: "Hola. Sunsu Spa te invitó a su app para ver tu stock en consignación, ventas, pedidos y actas. Crea tu contraseña aquí (vale " + INVIT_DIAS + " días):\n" + enlace }).catch(() => ({ enviado: false } as Row));
  await logAccion(ctx.db, actorOf(ses), "APP INVITACION PROVEEDOR", `${prov.nombre} (${prov.familia}) · ${email}`);
  return { ok: true, id: saved ? s(saved.id) : "", enlace, enviado: envio.enviado === true };
});
extend("padm_propuestas", "any", async (_p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const [P, provs] = await Promise.all([todas(ctx, T_PROP), provsConHoja(ctx)]);
  const pn = new Map(provs.map((x) => [x.id, x.nombre]));
  return { ok: true, items: P.sort((a, b) => (s(a.estado) === "pendiente" ? 0 : 1) - (s(b.estado) === "pendiente" ? 0 : 1) || s(b.created_at).localeCompare(s(a.created_at))).slice(0, 200)
    .map((x) => ({ id: s(x.id), proveedor: pn.get(s(x.proveedor_id)) || s(x.familia), familia: s(x.familia), tipo: s(x.tipo), sku: s(x.sku), producto: s(x.producto_nombre), detalle: x.detalle, mensaje: s(x.mensaje), estado: s(x.estado), nota: s(x.nota_admin), por: s(x.creado_por), fecha: s(x.created_at), revisadoPor: s(x.revisado_por) })) };
});
extend("padm_propuesta_resolver", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const estado = s(p.estado);
  if (!["aprobada", "rechazada"].includes(estado)) return { error: "Elige aprobar o rechazar" };
  const x = (await todas(ctx, T_PROP)).find((r) => s(r.id) === s(p.id));
  if (!x) return { error: "Propuesta no encontrada" };
  if (s(x.estado) !== "pendiente") return { error: "Esa propuesta ya se resolvió" };
  // Aprobar deja constancia; el precio / descuento se aplica a mano en Compras › Consignación (nada se cambia solo).
  await ctx.db.write(actorOf(ses), T_PROP, "update", { id: x.id }, { estado, revisado_por: ses.name, revisado_at: ctx.now.toISOString(), nota_admin: s(p.nota).slice(0, 400) || null });
  await logAccion(ctx.db, actorOf(ses), "APP PROPUESTA " + estado.toUpperCase(), `${s(x.familia)} · ${s(x.tipo)} · ${s(x.sku) || "general"} · ${JSON.stringify(x.detalle)}`);
  return { ok: true };
});
extend("padm_config_guardar", "any", async (p, ctx, ses) => {
  const no = soloAdmin(ses); if (no) return no;
  const url = s(p.acuity_url).trim();
  if (url && !/^https:\/\/[a-z0-9.-]+\.(acuityscheduling\.com|as\.me)\//i.test(url)) return { error: "Pega un enlace de Acuity (https://…acuityscheduling.com/… o …as.me/…)" };
  const cur = await kvGet(ctx.db, "portal_config").catch(() => ({} as Row));
  await kvSet(ctx.db, actorOf(ses), "portal_config", { ...cur, acuity_url: url || ACUITY_URL_DEF, whatsapp: s(p.whatsapp).replace(/[^\d+]/g, "").slice(0, 20) });
  return { ok: true, config: await portalConfig(ctx) };
});
