// Clientes de la beta, estilo MineCore (Emilia 17/11): lista larga con código y filtros, ficha con registro sin
// duplicados, resumen y pestañas (historial, paquetes, gift cards, documentos). Las correcciones y bajas viven en
// beta_clientes (0049); clientas_registro y la hoja no se tocan. Borrar solo por acción de admin o solicitud.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { acceso, esAdmin, esVisor, matrizDe, puedePriv, type PrivFlag } from "./permisos.ts";
import { cedulaVer, detectarIdentificacion, n, normCedula, telefonoEc, normNombre, round2, s, ymdUtc, type Row } from "./domain.ts";
import { leerSerie } from "./series.ts";
import { consultar, type Filtro } from "./query.ts";
import { claveCliente, claveRegistro, clienteDetalle, clientesResumen, codigoCliente, numeroTicket, registrosDeClave, saldoGift, ticketsDeClave } from "./ventas.ts";
import { claveDe } from "./ticket_beta.ts";
import { canonDeClave, clavesDe } from "./clientes_alias.ts";
import { docsDe } from "./tickets_beta_api.ts";
import { SOLICITUD_HOOKS } from "./inline_api.ts";
import { siNo } from "./consent_override.ts";
import { agruparDocumentos, agruparSinAsignar, esDeClienta, localEc, mismoNombre, nombreDeArchivo, nombreDescarga, vistaDoc } from "./documentos_beta.ts";

const FALTA = "Falta aplicar 0049_clientes_beta.sql";
async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
async function hay(ctx: Ctx): Promise<boolean> { try { await ctx.db.all("beta_clientes"); return true; } catch { return false; } }
export const lite = (ses: Ses) => ({ rol: ses.rol, name: ses.name, short: ses.short, uid: ses.uid, priv: ses.priv });

/** Campos de la ficha que se pueden corregir en la beta (clave → etiqueta). */
export const CAMPOS_CLIENTE: [string, string][] = [
  ["nombres", "Nombre"], ["apellido", "Apellido"], ["tipoIdentificacion", "Tipo de documento"], ["cedula", "Identificación"], ["telefono", "Teléfono"], ["email", "Email"],
  ["nacimiento", "Nacimiento"], ["sector", "Sector"], ["tipoPiel", "Tipo de piel"], ["estado", "Estado actual"],
  ["alergias", "Alergias"], ["medicacion", "Medicación"], ["condiciones", "Condiciones"], ["reacciones", "Reacciones previas"],
  ["exfoliantes", "Exfoliantes / retinoides"], ["extracciones", "Desea extracciones"], ["autorizaFotos", "Autoriza fotos"], ["ciclo", "Ciclo menstrual"], ["cortesia", "Cortesía complementaria"],
  ["consentimiento", "Aprueba consentimiento"], ["notas", "Notas"],
  // TK163: lo que la clienta escribe en «Mi perfil» de la app (el equipo lo ve en la ficha).
  ["preferencias", "Preferencias (de la clienta)"], ["notaClienta", "Nota de la clienta"],
];
/** TK183 (Emilia t797u/t799u): el personal corrige directo (con historial quién/cuándo/antes/después) todo lo que NO
 *  sea dato de contacto/identidad ni una autorización. Estos van SIEMPRE por solicitud a administración. */
export const CAMPOS_CON_SOLICITUD = new Set(["nombres", "apellido", "tipoIdentificacion", "cedula", "telefono", "email", "sector", "autorizaFotos", "consentimiento"]);
export const CAMPOS_DIRECTOS_STAFF = CAMPOS_CLIENTE.map(([k]) => k).filter((k) => !CAMPOS_CON_SOLICITUD.has(k));
/** Solo lectura en la ficha (vienen del formulario de registro). */
export const CAMPOS_LECTURA: [string, string][] = [["registrada", "Fecha de registro"], ["ultimoRegistro", "Último registro"]];
const SYS_ADMIN = { rol: "admin", uid: "sistema", short: "sistema", priv: {} };
const PRIVADOS = new Set(["telefono", "email", "sector"]);
const CAMPO_FLAG: Record<string, PrivFlag> = { telefono: "telefonos", email: "emails", sector: "sector" };
/** Teléfono, correo y sector/dirección: por defecto solo admin. Un admin puede soltarlos por rol o usuario (TK73). */
export function verPrivados(ses: Ses, matriz?: Parameters<typeof puedePriv>[2], campo?: string): boolean {
  if (esAdmin(ses.rol)) return true;
  if (!matriz) return false;
  if (campo && CAMPO_FLAG[campo]) return puedePriv(ses.rol, CAMPO_FLAG[campo], matriz);
  return puedePriv(ses.rol, "telefonos", matriz) && puedePriv(ses.rol, "emails", matriz) && puedePriv(ses.rol, "sector", matriz);
}
async function matrizSes(ctx: { db: Parameters<typeof matrizDe>[0] }) { return matrizDe(ctx.db); }
function puedeDescargarDe(ses: Ses, matriz: Parameters<typeof puedePriv>[2]): boolean {
  return puedePriv(ses.rol, "descargas", matriz);
}
const DE_REGISTRO: Record<string, string> = {
  nombres: "nombre", apellido: "apellido", cedula: "cedula", telefono: "telefono", sector: "sector_donde_vive",
  tipoPiel: "tipo_de_piel", estado: "estado_actual", alergias: "alergias", medicacion: "medicacion",
  condiciones: "condiciones_medicas_o_dermatologicas_que_debamos_saber", reacciones: "reacciones_previas_a_tratamientos",
  exfoliantes: "uso_de_exfoliantes_retintines", extracciones: "deseas_extracciones_de_comedones_o_espinillas_si_es_nec",
  autorizaFotos: "autoriza_fotos", ciclo: "ciclo_mestrual_si_aplica", cortesia: "cortesia_complementaria",
  consentimiento: "apruebo_consentimiento_individual",
};
function vacio(v: unknown): boolean { const t = s(v).trim(); return !t || t === "-" || t === "—" || /^n\/?a$/i.test(t); }

/** Un solo valor por campo aunque la clienta se haya registrado varias veces: el más reciente no vacío. */
export function registroUnico(regs: Row[]): { datos: Row; veces: number; primera: string; ultima: string; consentimientos: Row[] } {
  const ord = [...regs].sort((a, b) => s(b.timestamp || "").localeCompare(s(a.timestamp || "")) || n(b.sheet_row) - n(a.sheet_row));
  const datos: Row = {};
  for (const [k, col] of Object.entries(DE_REGISTRO)) {
    const r = ord.find((x) => !vacio(x[col]));
    if (r) datos[k] = k === "cedula" ? s(r[col]).split(".")[0] : s(r[col]).trim();
  }
  const nac = ord.find((x) => ymdUtc(x.fecha_de_nacimiento));
  if (nac) datos.nacimiento = ymdUtc(nac.fecha_de_nacimiento);
  const fechas = ord.map((x) => ymdUtc(x.timestamp)).filter(Boolean).sort();
  const consentimientos = ord.filter((x) => !vacio(x.apruebo_consentimiento_individual) || !vacio(x.firma)).map((x) => ({
    fecha: ymdUtc(x.timestamp), texto: s(x.apruebo_consentimiento_individual), firma: /^https?:/.test(s(x.firma)) ? s(x.firma) : "", autorizaFotos: s(x.autoriza_fotos),
  }));
  return { datos, veces: regs.length, primera: fechas[0] || "", ultima: fechas.at(-1) || "", consentimientos };
}

async function verTodos(ctx: Ctx, ses: Ses): Promise<boolean> {
  return esAdmin(ses.rol) || acceso(ses.rol, "clientes", await matrizDe(ctx.db)) === "todos";
}
function sinPrivados(d: Row, ses: Ses, matriz?: Parameters<typeof puedePriv>[2]): Row {
  const o: Row = {};
  for (const [k, v] of Object.entries(d)) {
    if (PRIVADOS.has(k) && !verPrivados(ses, matriz, k)) continue;
    o[k] = v;
  }
  return o;
}
function limpioStaff(v: unknown, ses: Ses, matriz?: Parameters<typeof puedePriv>[2]): boolean {
  if (esAdmin(ses.rol)) return true;
  const json = JSON.stringify(v || {});
  if (!verPrivados(ses, matriz, "telefono") && /"telefono"/i.test(json)) return false;
  if (!verPrivados(ses, matriz, "email") && /"email"|"correo"/i.test(json)) return false;
  if (!verPrivados(ses, matriz, "sector") && /sector_donde|direccion|"sector"/i.test(json)) return false;
  return true;
}
function redactarBitacora(L: Row[], ses: Ses, matriz?: Parameters<typeof puedePriv>[2]): Row[] {
  return L.map((x) => {
    const c = (x.cambios || {}) as Row, limpio: Row = {};
    for (const [k, v] of Object.entries(c)) if (!PRIVADOS.has(k) || verPrivados(ses, matriz, k)) limpio[k] = v;
    return { ...x, cambios: limpio };
  });
}
export async function overlays(ctx: Ctx): Promise<Map<string, Row>> {
  // Varias filas de la misma clienta (c:…001, c:… o unidas a mano) → una sola: la de la clave principal manda,
  // los datos que le falten salen de las otras, y el código es el más antiguo.
  const grupos = new Map<string, Row[]>();
  for (const r of await todas(ctx, "beta_clientes")) { const k = canonDeClave(s(r.key)); const L = grupos.get(k) || []; L.push(r); grupos.set(k, L); }
  const m = new Map<string, Row>();
  for (const [k, L] of grupos) m.set(k, L.length === 1 ? L[0] : fusionarFilas(k, L));
  return m;
}
const nDatos = (r: Row) => Object.values((r.datos || {}) as Row).filter((v) => s(v).trim()).length;
/** Fusiona filas de beta_clientes de una misma clienta (sin escribir). Exportada para las pruebas. */
export function fusionarFilas(k: string, L: Row[]): Row {
  const orden = [...L].sort((a, b) => (s(a.key) === k ? -1 : s(b.key) === k ? 1 : nDatos(b) - nDatos(a)));
  const prin = orden[0];
  const datos: Row = {};
  for (const r of [...orden].reverse()) for (const [c, v] of Object.entries((r.datos || {}) as Row)) if (s(v).trim()) datos[c] = v;
  const cods = L.map((r) => s(r.codigo)).filter(Boolean).sort();
  const hist = L.flatMap((r) => Array.isArray(r.historial) ? r.historial as Row[] : []).sort((a, b) => s(a.fecha).localeCompare(s(b.fecha)));
  return { ...prin, datos, codigo: cods[0] || s(prin.codigo), historial: hist, borrado: s(prin.key) === k ? prin.borrado === true : L.every((r) => r.borrado === true), _filas: L.map((r) => s(r.key)), _key: s(prin.key) };
}
/** Claves con las que puede estar guardada esta clienta (documentos, filas viejas c:…001, uniones a mano, código C- y nombre n:). */
function clavesGuardadas(key: string, extra?: { ced?: string; nom?: string; codigo?: string }): string[] {
  const out = new Set(clavesDe(key));
  const add = (v: string) => { const x = String(v || "").trim(); if (x) out.add(x); };
  const addCed = (raw: string) => {
    const ced = normCedula(raw.replace(/^c:/i, ""));
    if (!ced) return;
    add("c:" + ced); add(ced);
    if (/^\d{9,10}$/.test(ced)) { add("c:" + ced + "001"); add(ced + "001"); }
    if (/^\d{12,13}$/.test(ced) && ced.endsWith("001")) { add("c:" + ced.slice(0, -3)); add(ced.slice(0, -3)); }
  };
  for (const k of [...out]) {
    if (/^c:/i.test(k)) addCed(k);
    else if (/^\d{9,13}$/.test(k)) addCed(k);
  }
  if (extra?.ced) addCed(extra.ced);
  if (extra?.nom) add("n:" + extra.nom);
  if (extra?.codigo) { add(extra.codigo); add(extra.codigo.toUpperCase()); add(extra.codigo.toLowerCase()); }
  return [...out];
}
function mismaPersona(ced: string, nom: string, c2: unknown, n2: string): boolean {
  const pc = normCedula(c2);
  return (!!ced && pc === ced) || (!!nom && normNombre(n2) === nom && (!ced || !pc));
}

extend("cl_list", "any", async (_p, ctx, ses) => {
  const admin = esAdmin(ses.rol);
  const matriz = await matrizSes(ctx);
  const veTel = verPrivados(ses, matriz, "telefono");
  const veSec = verPrivados(ses, matriz, "sector");
  const veMail = verPrivados(ses, matriz, "email");
  // Todo en paralelo y con columnas livianas (la lista tardaba por bajar tablas enteras en serie).
  const [res, ov, paqs0, gcs0, cats] = await Promise.all([
    verTodos(ctx, ses).then((vt) => clientesResumen(ctx.db, lite(ses), admin, vt)),
    overlays(ctx),
    consultar(ctx.db, "paquetes", { cols: ["id", "cedula", "nombres", "apellidos", "completo", "borrado_at", "sku", "paquete", "factura", "codigo", "beta_codigo", "fecha_1", "fecha_2", "fecha_3", "fecha_4", "fecha_5", "fecha_6", "orig"] }).then((x) => x.rows).catch(() => todas(ctx, "paquetes")),
    todas(ctx, "gift_cards"),
    ctx.db.all("catalogo").catch(() => [] as Row[]),
  ]);
  const paqs = paqs0.filter((r) => !r.borrado_at);
  const gcs = gcs0.filter((r) => !r.borrado_at && s(r.codigo_gc));
  const porKeyP = new Map<string, number>(), porKeyG = new Map<string, number>(), porCedP = new Map<string, number>(), porNomP = new Map<string, number>(), porCedG = new Map<string, number>(), porNomG = new Map<string, number>();
  for (const r of paqs) {
    if (r.completo === true) continue;
    const c = normCedula(r.cedula), nm = normNombre((s(r.nombres) + " " + s(r.apellidos)).trim());
    const kk = c ? canonDeClave("c:" + c) : nm ? canonDeClave("n:" + nm) : "";
    if (kk) porKeyP.set(kk, (porKeyP.get(kk) || 0) + 1);
    if (c) porCedP.set(c, (porCedP.get(c) || 0) + 1); else if (nm) porNomP.set(nm, (porNomP.get(nm) || 0) + 1);
  }
  for (const r of gcs) {
    const sal = saldoGift(r, cats as Row[], paqs); if (!(sal > 0)) continue;
    const c = normCedula(r.cedula_comprador), nm = normNombre((s(r.nombre_comprador) + " " + s(r.apellido_comprador)).trim());
    const kk = c ? canonDeClave("c:" + c) : nm ? canonDeClave("n:" + nm) : "";
    if (kk) porKeyG.set(kk, round2((porKeyG.get(kk) || 0) + sal));
    if (c) porCedG.set(c, round2((porCedG.get(c) || 0) + sal)); else if (nm) porNomG.set(nm, round2((porNomG.get(nm) || 0) + sal));
  }
  const clientes: Row[] = [];
  for (const c of (res.clientes || []) as Row[]) {
    const o = ov.get(s(c.key));
    if (o?.borrado === true) continue;
    const d = sinPrivados((o?.datos || {}) as Row, ses, matriz);
    const item: Row = { ...c };
    if (s(o?.codigo)) item.codigo = s(o!.codigo);
    if (d.nombres != null) item.nombres = s(d.nombres);
    if (d.apellido != null) item.apellido = s(d.apellido);
    item.nombre = (s(item.nombres) + " " + s(item.apellido)).trim() || s(c.nombre);
    if (d.cedula != null) item.cedula = s(d.cedula);
    if (veSec && d.sector != null) item.sector = s(d.sector);
    else delete item.sector;
    if (veTel) {
      const tel = d.telefono != null ? s(d.telefono) : item.telefono;
      if (s(tel)) item.telefono = telefonoEc(tel);
      else delete item.telefono;
    } else delete item.telefono;
    if (veMail && d.email != null) item.email = s(d.email);
    else delete item.email;
    const ced = normCedula(c.cedula), nom = normNombre(s(c.nombre));
    item.paquetesActivos = porKeyP.get(s(c.key)) || (ced && porCedP.get(ced)) || porNomP.get(nom) || 0;
    if (admin) item.giftSaldo = porKeyG.get(s(c.key)) || (ced && porCedG.get(ced)) || porNomG.get(nom) || 0;
    item.cedula = cedulaVer(item.cedula);
    item.editado = !!o;
    clientes.push(item);
  }
  const uniq = (k: string) => [...new Set(clientes.map((c) => s(c[k])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const visor = esVisor(ses.rol);
  if (visor) for (const c of clientes) { delete c.telefono; delete c.email; delete c.sector; delete c.paquetesActivos; delete c.giftSaldo; }
  const payload = { ok: true, admin, puedeDescargar: visor ? false : puedeDescargarDe(ses, matriz), clientes, cosmetologas: admin ? uniq("cosmetologa") : [], sectores: veSec && !visor ? uniq("sector") : [], puedeEditar: admin, puedePedir: !admin && !visor, soloLectura: visor };
  if (!limpioStaff(payload, ses, matriz)) return { error: "Respuesta de cl_list con datos que el personal no debe ver" };
  return payload;
});

export async function ficha(ctx: Ctx, ses: Ses, key0: string): Promise<Row> {
  const admin = esAdmin(ses.rol);
  const matriz = await matrizSes(ctx);
  const key = canonDeClave(key0), claves = clavesGuardadas(key);
  const ov = (await overlays(ctx)).get(key);
  if (ov?.borrado === true && !admin) return { error: "Esa clienta está eliminada" };
  const vt = admin || await verTodos(ctx, ses);
  const [det, regs0, filas0, cabs0, gifts0, pdfsIn] = await Promise.all([
    clienteDetalle(ctx.db, lite(ses), admin, key, vt),
    registrosDeClave(ctx.db, key),
    ticketsDeClave(ctx.db, key),
    todas(ctx, "beta_tickets"),
    todas(ctx, "gift_cards"),
    consultar(ctx.db, "beta_cliente_documentos", { filtros: [{ col: "cliente_id", op: "in", val: claves }] }).then((x) => x.rows).catch(() => [] as Row[]),
  ]);
  if (det.error) return det;
  let pdfs0 = pdfsIn;
  const cli = det.cliente as Row;
  const regs = regs0.filter((r) => !r.borrado_at && claveRegistro(r) === key);
  const reg = registroUnico(regs);
  const codigo = s(ov?.codigo) || regs.map((r) => codigoCliente(r)).filter(Boolean).sort()[0] || "";
  const datos: Row = { ...reg.datos };
  if (reg.primera) datos.registrada = reg.primera;
  if (reg.ultima && reg.ultima !== reg.primera) datos.ultimoRegistro = reg.ultima;
  for (const k of ["nombres", "apellido", "cedula"]) if (vacio(datos[k]) && !vacio(cli[k])) datos[k] = s(cli[k]);
  if (!vacio(cli.email)) datos.email = s(cli.email);
  const corr = (ov?.datos || {}) as Row;
  for (const [k, v] of Object.entries(corr)) datos[k] = s(v);
  if (datos.telefono) datos.telefono = telefonoEc(datos.telefono);
  if (datos.cedula) datos.cedula = cedulaVer(datos.cedula) || s(datos.cedula);
  const ced = normCedula(datos.cedula || cli.cedula), nom = normNombre((s(datos.nombres) + " " + s(datos.apellido)).trim() || s(cli.nombre));
  const claves2 = clavesGuardadas(key, { ced, nom, codigo });
  const faltan = claves2.filter((k) => !claves.includes(k));
  if (faltan.length) {
    try {
      const more = (await consultar(ctx.db, "beta_cliente_documentos", { filtros: [{ col: "cliente_id", op: "in", val: faltan }] })).rows;
      if (more.length) pdfs0 = pdfs0.concat(more);
    } catch { /* sin tabla o sin filas nuevas */ }
  }
  // Historial: cada ticket con la clave que abre el detalle de ticket de la beta.
  const filas = filas0.filter((r) => !r.borrado_at && claveCliente(r) === key);
  const porNum = new Map(filas.map((r) => [numeroTicket(r), r]));
  const cabs = new Map(cabs0.map((c) => [s(c.clave), c]));
  const documentos: Row[] = [];
  const historial = ((det.tickets || []) as Row[]).map((t) => {
    const r = porNum.get(s(t.ref));
    const clave = r ? claveDe(r, leerSerie(r, "so_num")) : "";
    const cab = clave ? cabs.get(clave) : undefined;
    if (r) {
      const tk = s(t.ref), f = s(t.fecha);
      documentos.push({ tipo: "tarjeta", nombre: "Tarjeta del tratamiento · " + tk, fecha: f, clave, sheetRow: r.sheet_row ?? null });
      for (const d of docsDe(r)) documentos.push({ ...d, nombre: d.nombre + " · " + tk, fecha: f, clave });
      if (/k-?lift|skin|an[aá]lisis|primera/i.test(s(r.facial_hecho))) documentos.push({ tipo: "analisis", nombre: "Análisis de piel / " + s(r.facial_hecho) + " · " + tk, fecha: f, clave });
    }
    const item: Row = { ref: t.ref, clave, fecha: t.fecha, hora: t.hora, cosmetologa: t.cosmetologa, facial: t.facial, paquete: t.paquete, gift_card: t.gift_card,
      lineas: ((t.lineas || []) as Row[]).map((l) => s(l.nombre || l.sku) + (n(l.cantidad) > 1 ? " ×" + n(l.cantidad) : "")).join(", "),
      detalle: ((t.lineas || []) as Row[]).slice(0, 30).map((l) => ({ nombre: s(l.nombre || l.sku), sku: s(l.sku), cantidad: n(l.cantidad) || 1 })),
      notas: r ? s(r.notas_generales).slice(0, 400) : "", recomendaciones: r ? s(r.recomendaciones).slice(0, 400) : "",
      fotos: r ? docsDe(r).filter((d) => d.tipo === "foto").map((d) => ({ nombre: s(d.nombre), url: s(d.url) })) : [], sheetRow: r?.sheet_row ?? null };
    if (admin) item.total = cab && cab.total != null ? n(cab.total) : n(t.total);
    if (cab) item.editadoBeta = true;
    return item;
  });
  // PDFs del bucket (K-Lift simetría, Focus Skin): por id de clienta, cédula, código o nombre del archivo.
  const quien = { key, ced, nom, codigo };
  for (const d of pdfs0) if (esDeClienta(d, quien)) documentos.push(vistaDoc(d));
  for (const c of reg.consentimientos) documentos.push({ tipo: "consentimiento", nombre: "Consentimiento informado" + (c.autorizaFotos ? " · fotos: " + c.autorizaFotos : ""), fecha: c.fecha, url: c.firma, texto: c.texto });
  // Gift cards: de ella o de las clientas unidas a ella (🔗 Duplicados).
  const otras = clavesDe(key).filter((k) => k !== key).map((k) => ({ ced: k.startsWith("c:") ? k.slice(2) : "", nom: k.startsWith("n:") ? k.slice(2) : "" }));
  const giftsCli = gifts0.filter((r) => !r.borrado_at && s(r.codigo_gc) && [{ ced, nom }, ...otras].some((q) =>
    mismaPersona(q.ced, q.nom, r.cedula_comprador, s(r.nombre_comprador) + " " + s(r.apellido_comprador)) || (!!q.nom && normNombre(r.usado_por) === q.nom)));
  // PDFs de gift cards (TK20) de las gift cards de esta clienta → Documentos.
  if (giftsCli.length) {
    const ids = new Set(giftsCli.map((r) => String(r.id)));
    let gdocs: Row[] = [];
    try { gdocs = (await consultar(ctx.db, "beta_gift_documentos", { filtros: [{ col: "gift_id", op: "in", val: [...ids].map(Number) }] })).rows; } catch { gdocs = []; }
    for (const d of gdocs) if (ids.has(String(d.gift_id))) documentos.push({ tipo: "pdf", sub: "gift_card", docId: "gc:" + s(d.id), nombre: "Gift card " + s(d.codigo) + " · certificado PDF", fecha: localEc(d.created_at).slice(0, 10), hora: localEc(d.created_at).slice(11, 16), giftId: d.gift_id });
  }
  const cats = await ctx.db.all("catalogo").catch(() => [] as Row[]);
  const paqs = await ctx.db.all("paquetes").catch(() => [] as Row[]);
  const gifts = giftsCli
    .map((r) => ({ codigo: s(r.codigo_gc), valor: s(r.valor), saldo: admin ? saldoGift(r, cats, paqs) : undefined, usado: r.usado === true, fechaUso: s(r.fecha_uso), usadoPor: s(r.usado_por),
      comprador: (s(r.nombre_comprador) + " " + s(r.apellido_comprador)).trim(), fecha: [r.dia, r.mes, r.ano].every((x) => x != null && s(x) !== "") ? `${s(r.ano).split(".")[0]}-${String(n(r.mes)).padStart(2, "0")}-${String(n(r.dia)).padStart(2, "0")}` : "" }));
  const total = historial.reduce((a, t) => a + n(t.total), 0);
  const fechas = historial.map((t) => s(t.fecha)).filter(Boolean).sort();
  const resumen: Row = { tickets: historial.length, ultima: fechas.at(-1) || "", primera: fechas[0] || "", registros: reg.veces };
  if (admin) { resumen.total = round2(total); resumen.promedio = historial.length ? round2(total / historial.length) : 0; }
  const paquetes = ((det.paquetes || []) as Row[]);
  resumen.sesionesPendientes = paquetes.reduce((a, p) => a + n(p.pendientes), 0);
  const visor = esVisor(ses.rol);
  const payload = {
    ok: true, admin, key, unidas: ov?._filas || undefined, codigo, datos: sinPrivados(datos, ses, matriz), campos: CAMPOS_CLIENTE.filter(([k]) => verPrivados(ses, matriz, k) || !PRIVADOS.has(k)), lectura: CAMPOS_LECTURA,
    corregidos: Object.keys(corr).filter((k) => verPrivados(ses, matriz, k) || !PRIVADOS.has(k)),
    resumen: visor ? { registros: resumen.registros } : resumen,
    historial: visor ? [] : historial,
    paquetes: visor ? [] : paquetes,
    giftcards: visor ? [] : gifts,
    documentos: visor ? [] : documentos.sort((a, b) => s(b.fecha).localeCompare(s(a.fecha))),
    grupos: visor ? {} : agruparDocumentos(documentos),
    bitacora: visor ? [] : (admin ? ((ov?.historial || []) as Row[]) : redactarBitacora((ov?.historial || []) as Row[], ses, matriz)),
    borrado: ov?.borrado === true, borradoMotivo: s(ov?.borrado_motivo),
    puedeEditar: admin, puedePedir: !admin && !visor, puedeDescargar: visor ? false : puedeDescargarDe(ses, matriz), soloLectura: visor,
    // TK218: el personal y visor ven si el formulario de registro está completo, aunque no haya visitas.
    registroEstado: regs.length ? "completo" : "falta",
    fechaRegistro: s(datos.registrada) || reg.primera || "",
    // TK183: qué guarda directo el personal y qué va por solicitud (el admin guarda todo directo).
    directos: visor ? [] : (admin ? CAMPOS_CLIENTE.map(([k]) => k) : CAMPOS_DIRECTOS_STAFF), conSolicitud: admin ? [] : visor ? [] : [...CAMPOS_CON_SOLICITUD].filter((k) => verPrivados(ses, matriz, k) || !PRIVADOS.has(k)),
  };
  if (!limpioStaff(payload, ses, matriz)) return { error: "Respuesta de cl_get con datos que el personal no debe ver" };
  return payload;
}

/** Link firmado (10 min) de un PDF del bucket «cliente-documentos»; solo quien puede ver la ficha de esa clienta. */
async function docPorId(ctx: Ctx, id: string): Promise<Row | null> {
  try { return (await consultar(ctx.db, "beta_cliente_documentos", { filtros: [{ col: "id", op: "eq", val: id }] })).rows[0] || null; } catch { return null; }
}
extend("cl_doc_url", "any", async (p, ctx, ses) => {
  const id = s(p.id), key = s(p.key);
  if (!id) return { error: "Falta el documento" };
  const quiereBajar = p.descargar === true || p.descargar === "1";
  const matrizDoc = await matrizSes(ctx);
  if (quiereBajar && !puedeDescargarDe(ses, matrizDoc)) return { error: "El personal no puede descargar archivos" };
  if (id.startsWith("gc:")) {
    // PDF de gift card: quien ve la ficha de la clienta (y el documento está en su lista).
    if (!key) return { error: "Falta la clienta" };
    const f = await ficha(ctx, ses, key);
    if (f.error) return f;
    if (!((f.documentos || []) as Row[]).some((x) => s(x.docId) === id)) return { error: "Ese documento no es de esta clienta" };
    const { urlGiftDoc } = await import("./gift_beta_api.ts");
    return urlGiftDoc(ctx, id.slice(3), quiereBajar && puedeDescargarDe(ses, matrizDoc));
  }
  const d = await docPorId(ctx, id);
  if (!d || !s(d.storage_path)) return { error: "No encontré ese documento" };
  if (!s(d.cliente_id)) {
    // Sin asignar: solo el admin lo abre (para decidir a quién va).
    if (!esAdmin(ses.rol)) return { error: "Ese documento todavía no está asignado" };
  } else {
    if (!key) return { error: "Falta la clienta" };
    const f = await ficha(ctx, ses, key);
    if (f.error) return f;
    if (!((f.documentos || []) as Row[]).some((x) => s(x.docId) === id)) return { error: "Ese documento no es de esta clienta" };
  }
  const base = s(ctx.env.SUPABASE_URL).replace(/\/$/, ""), sk = s(ctx.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!base || !sk) return { error: "El almacén de documentos no está configurado." };
  const path = s(d.storage_path).replace(/^\/+/, "").replace(/^cliente-documentos\//, "");
  const res = await ctx.fetchImpl(`${base}/storage/v1/object/sign/cliente-documentos/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST", headers: { authorization: `Bearer ${sk}`, apikey: sk, "content-type": "application/json" }, body: JSON.stringify({ expiresIn: 600 }),
  });
  let data: Row = {}; try { data = await res.json() as Row; } catch { data = {}; }
  const signed = s(data.signedURL || data.signedUrl);
  if (!res.ok || !signed) return { error: "No se pudo abrir el PDF" };
  const nombre = nombreDescarga(d);
  let url = signed.startsWith("http") ? signed : `${base}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`;
  if (/\.zip$/i.test(path) && !puedeDescargarDe(ses, matrizDoc)) return { error: "El personal no puede descargar archivos" };
  if (quiereBajar || /\.zip$/i.test(path)) url += (url.includes("?") ? "&" : "?") + "download=" + encodeURIComponent(nombre);
  return { ok: true, url, nombre, zip: /\.zip$/i.test(path) };
});

// ── Documentos sin asignar (admin): los que el cruce por nombre no pudo emparejar (ambiguo / sin match).
extend("doc_sin_asignar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  const q = normNombre(s(p.q));
  const docs = (await consultar(ctx.db, "beta_cliente_documentos", { filtros: [{ col: "cliente_id", op: "is_null" }] }).catch(() => ({ rows: [] as Row[] }))).rows
    .filter((d) => !q || normNombre(d.cliente_nombre_archivo).includes(q))
    .sort((a, b) => s(b.fecha).localeCompare(s(a.fecha)));
  // Sugerencias: clientas cuyo nombre contiene las palabras del archivo.
  const res = await clientesResumen(ctx.db, lite(ses), true, true);
  const ov = await overlays(ctx);
  const cl = ((res.clientes || []) as Row[]).filter((c) => ov.get(s(c.key))?.borrado !== true).map((c) => {
    const o = ov.get(s(c.key)); const dd = (o?.datos || {}) as Row;
    const nom = ((dd.nombres != null ? s(dd.nombres) : s(c.nombres)) + " " + (dd.apellido != null ? s(dd.apellido) : s(c.apellido))).trim() || s(c.nombre);
    return { key: s(c.key), nombre: nom, codigo: s(o?.codigo) || s(c.codigo), cedula: cedulaVer(dd.cedula ?? c.cedula), ultima: s(c.ultima) };
  });
  const lim = Math.min(300, Math.max(1, n(p.limit) || 120));
  const items = docs.slice(0, lim).map((d) => ({
    ...vistaDoc(d), archivo: nombreDeArchivo(d.cliente_nombre_archivo), confianza: s(d.match_confianza) || "none",
    sugerencias: cl.filter((c) => mismoNombre(s(d.cliente_nombre_archivo), normNombre(c.nombre))).slice(0, 6),
  }));
  const grupos = agruparSinAsignar(items);
  return { ok: true, total: docs.length, items, grupos, gruposTotal: grupos.length };
});
extend("doc_asignar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin" };
  const ids = (Array.isArray(p.ids) ? p.ids : [p.id]).map((x) => s(x)).filter(Boolean);
  const key = s(p.key);
  if (!ids.length) return { error: "Falta el documento" };
  if (key && !/^(c|n|t):/.test(key)) return { error: "Clienta inválida" };
  for (const id of ids) {
    const d = await docPorId(ctx, id);
    if (!d) return { error: "No encontré ese documento" };
    const antes = s(d.cliente_id);
    await ctx.db.write(actorOf(ses), "beta_cliente_documentos", "update", { id }, { cliente_id: key || null, match_confianza: key ? "manual" : "none" });
    await logAccion(ctx.db, actorOf(ses), key ? "DOCUMENTO ASIGNAR" : "DOCUMENTO DESASIGNAR",
      `${s(d.tipo)} «${s(d.cliente_nombre_archivo)}» ${localEc(d.fecha).slice(0, 16)} · ${antes || "sin asignar"} → ${key || "sin asignar"} · ${id}`);
  }
  return { ok: true, id: ids[0], ids, key: key || null, n: ids.length };
});

extend("cl_get", "any", async (p, ctx, ses) => {
  const key = s(p.key);
  if (!key) return { error: "Falta la clienta" };
  return ficha(ctx, ses, key);
});

/** Datos de la clienta editados en un ticket → ficha (beta_clientes), con historial «desde ticket». */
export async function propagarDesdeTicket(ctx: Ctx, ses: Ses, key: string, datosTk: Row, so: string): Promise<Row> {
  const MAPA: Record<string, string> = { nombre: "nombres", apellido: "apellido", cedula: "cedula", email: "email", telefono: "telefono", direccion: "sector" };
  const cambios: Row = {};
  for (const [k, v] of Object.entries(datosTk || {})) if (MAPA[k] && s(v)) cambios[MAPA[k]] = k === "telefono" ? s(v).replace(/[^\d+]/g, "") : s(v);
  if (!key || !Object.keys(cambios).length) return { ok: true, sinCambios: true };
  return await guardarCliente(ctx, ses, key, cambios, "desde ticket " + so);
}
export async function guardarCliente(ctx: Ctx, ses: Ses, key0: string, cambios: Row, via: string): Promise<Row> {
  if (!(await hay(ctx))) return { error: FALTA };
  const key = canonDeClave(key0);
  const permitidos = new Set(CAMPOS_CLIENTE.map(([k]) => k));
  const limpio: Row = {};
  for (const [k, v] of Object.entries(cambios || {})) if (permitidos.has(k)) limpio[k] = s(v).trim().slice(0, 500);
  if (!Object.keys(limpio).length) return { error: "Nada que cambiar" };
  if (limpio.cedula) {
    const det = detectarIdentificacion(limpio.cedula, limpio.tipoIdentificacion);
    if (det.error) return { error: det.error, sugerencia: det.sugerencia };
    limpio.cedula = det.valor;
    if (det.tipo) limpio.tipoIdentificacion = det.tipo;
  }
  if (limpio.nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(String(limpio.nacimiento))) return { error: "Nacimiento: usa AAAA-MM-DD" };
  if (limpio.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(limpio.email))) return { error: "Email inválido" };
  if ("autorizaFotos" in limpio) { const v = siNo(limpio.autorizaFotos); if (!v) return { error: "Autoriza fotos: SI o NO" }; limpio.autorizaFotos = v; }
  const actual = await ficha(ctx, { ...ses, rol: "admin" } as Ses, key);
  if (actual.error) return actual;
  const antes = actual.datos as Row;
  const cambio: Row = {};
  for (const [k, v] of Object.entries(limpio)) if (s(antes[k]) !== s(v)) cambio[k] = { antes: s(antes[k]), despues: v };
  if (!Object.keys(cambio).length) return { ok: true, sinCambios: true };
  const ov = (await overlays(ctx)).get(key);
  const datos = { ...((ov?.datos || {}) as Row), ...limpio };
  const historial = [...((ov?.historial || []) as Row[]), { fecha: ctx.now.toISOString(), por: ses.name, accion: via, cambios: cambio }];
  const fila = { datos, historial, actualizado_por: ses.name, updated_at: ctx.now.toISOString() };
  if (ov && s(ov._key ?? ov.key) === key) await ctx.db.write(actorOf(ses), "beta_clientes", "update", { key }, fila);
  else await ctx.db.write(actorOf(ses), "beta_clientes", "insert", {}, { key, ...fila });
  return { ok: true, key, cambios: Object.keys(cambio) };
}
async function borrarCliente(ctx: Ctx, ses: Ses, key0: string, motivo: string, via: string): Promise<Row> {
  const key = canonDeClave(key0);
  if (!(await hay(ctx))) return { error: FALTA };
  if (!s(motivo).trim()) return { error: "El motivo es obligatorio" };
  const ov = (await overlays(ctx)).get(key);
  const historial = [...((ov?.historial || []) as Row[]), { fecha: ctx.now.toISOString(), por: ses.name, accion: via, motivo }];
  const fila = { borrado: true, borrado_motivo: s(motivo).trim(), borrado_por: ses.name, borrado_at: ctx.now.toISOString(), historial, actualizado_por: ses.name, updated_at: ctx.now.toISOString() };
  if (ov && s(ov._key ?? ov.key) === key) await ctx.db.write(actorOf(ses), "beta_clientes", "update", { key }, fila);
  else await ctx.db.write(actorOf(ses), "beta_clientes", "insert", {}, { key, datos: {}, ...fila });
  return { ok: true, key, borrado: true };
}

extend("cl_guardar", "any", async (p, ctx, ses) => {
  const cambios = (p.cambios || {}) as Row;
  if (esAdmin(ses.rol)) return guardarCliente(ctx, ses, s(p.key), cambios, "edición");
  // TK183: el personal guarda directo solo los campos no sensibles; contacto/identidad y autorizaciones → solicitud.
  const etq = new Map(CAMPOS_CLIENTE);
  const bloqueados = Object.keys(cambios).filter((k) => !CAMPOS_DIRECTOS_STAFF.includes(k));
  if (bloqueados.length) return { error: bloqueados.map((k) => "«" + (etq.get(k) || k) + "»").join(", ") + " necesita solicitud a administración (con motivo)", requiereSolicitud: bloqueados };
  if (acceso(ses.rol, "clientes", await matrizDe(ctx.db)) === "no") return { error: "No tienes acceso a Clientes" };
  return guardarCliente(ctx, ses, s(p.key), cambios, "edición directa (personal)");
});
extend("cl_borrar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina; usa «Solicitar eliminación»" };
  return borrarCliente(ctx, ses, s(p.key), s(p.motivo), "eliminación");
});
extend("cl_restaurar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const key = canonDeClave(s(p.key)), ov = (await overlays(ctx)).get(key);
  if (!ov?.borrado) return { error: "La clienta no está eliminada" };
  const historial = [...((ov.historial || []) as Row[]), { fecha: ctx.now.toISOString(), por: ses.name, accion: "restaurada" }];
  for (const k of ((ov._filas as string[] | undefined) || [s(ov.key)])) await ctx.db.write(actorOf(ses), "beta_clientes", "update", { key: k }, { borrado: false, borrado_motivo: null, borrado_por: null, borrado_at: null, historial, actualizado_por: ses.name, updated_at: ctx.now.toISOString() });
  return { ok: true, key };
});

SOLICITUD_HOOKS["cliente_beta"] = {
  fila: async (ctx, ses, key) => {
    const f = await ficha(ctx, ses, key);
    if (f.error) return { error: s(f.error) };
    const d = f.datos as Row, nom = (s(d.nombres) + " " + s(d.apellido)).trim() || s(f.codigo) || "clienta";
    return { row: { key }, antes: d, etiqueta: nom, enlace: "#/m/clientes/c/" + encodeURIComponent(s(f.key) || key) };
  },
  /* TK183 (Emilia t800u): la solicitud dice QUÉ cambia (campo: antes → después); la admin solo revisa y aprueba. */
  preparar: async (ctx, _ses, key, tipo, propuestos, _motivo, hecho) => {
    if (tipo !== "cambio") return null;
    const f = await ficha(ctx, { ...SYS_ADMIN, name: "sistema" } as Ses, key);
    const antes = (f && !f.error ? f.datos : (hecho as Row).antes) as Row || {};
    const etq = new Map(CAMPOS_CLIENTE), cambios: Row[] = [];
    const limpio: Row = {};
    for (const [k, v] of Object.entries(propuestos || {})) {
      if (!etq.has(k)) continue;
      const nv = k === "autorizaFotos" ? (siNo(v) || s(v).trim()) : s(v).trim();
      if (nv === s(antes[k]).trim()) continue;
      limpio[k] = nv; cambios.push({ campo: k, etiqueta: etq.get(k), antes: s(antes[k]), despues: nv });
    }
    const nom = (s(antes.nombres) + " " + s(antes.apellido)).trim() || "clienta";
    const txt = cambios.map((c) => s(c.etiqueta) + ": " + (s(c.antes) || "—") + " → " + (s(c.despues) || "—")).join("; ");
    return { propuestos: { ...limpio, _cambios: cambios }, etiqueta: nom + (txt ? " · " + txt : "") };
  },
  aplicar: (ctx, ses, key, propuestos) => guardarCliente(ctx, ses, key, propuestos, "solicitud aprobada"),
  borrar: (ctx, ses, key, motivo) => borrarCliente(ctx, ses, key, motivo || "solicitud aprobada", "eliminación por solicitud"),
};

/** Buscador de clientas para el ticket nuevo: nombre, cédula, RUC, celular o código C-xxxxx (beta_clientes).
 * TK66 (Emilia 18/11): la cédula o el RUC (cédula+001) siempre encuentran a la clienta, aunque estén guardados
 * con .0, sin el 0 inicial, como RUC o con guiones; el nombre no distingue tildes ni orden de palabras. */
export function nucleoCedula(v: unknown): string {
  let d = s(v).trim().replace(/\.0+$/, "").replace(/\D/g, "");
  if (d.length === 13 && d.endsWith("001")) d = d.slice(0, 10);
  return d.replace(/^0+/, "");
}
function nucleoTelefono(v: unknown): string {
  const d = s(v).replace(/\.0+$/, "").replace(/\D/g, "");
  return d.replace(/^593/, "").replace(/^0+/, "");
}
const normTexto = (v: unknown) => s(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();
const COLS_BUSCAR = ["key", "codigo", "nombre", "cedula", "telefono", "datos", "borrado"];
const _cacheClientas = new WeakMap<object, { t: number; rows: Row[] }>();
const _llaveProd = {};
async function todasLasClientas(ctx: Ctx): Promise<Row[]> {
  // En producción cada pedido trae su propia conexión: la copia vive en el proceso (1 minuto).
  const llave = (ctx.db as unknown as { tables?: unknown }).tables ? ctx.db as object : _llaveProd;
  const c = _cacheClientas.get(llave);
  if (c && ctx.now.getTime() - c.t < 60_000 && ctx.now.getTime() >= c.t) return c.rows;
  const rows: Row[] = [];
  for (let desde = 0; desde < 50_000; desde += 1000) {
    const r = (await consultar(ctx.db, "beta_clientes", { cols: COLS_BUSCAR, limite: 1000, desde, orden: [{ col: "key" }] })).rows;
    rows.push(...r);
    if (r.length < 1000) break;
  }
  _cacheClientas.set(llave, { t: ctx.now.getTime(), rows });
  return rows;
}
/** 0 = no coincide; más alto = mejor. Cada palabra debe calzar con el nombre, la cédula/RUC, el celular o el código. */
export function puntajeClienta(r: Row, q: string, conTel = true): number {
  const d = (r.datos || {}) as Row;
  const nombre = normTexto([s(d.nombres), s(d.apellido), s(r.nombre)].join(" "));
  const palabrasNom = nombre.split(" ").filter(Boolean);
  const ced = nucleoCedula(s(d.cedula) || s(r.cedula)), cedK = nucleoCedula(s(r.key).replace(/^c:/, ""));
  const tel = conTel ? nucleoTelefono(s(d.telefono) || s(r.telefono)) : "";
  const cod = s(r.codigo).toUpperCase(), codN = cod.replace(/\D/g, "").replace(/^0+/, "");
  const limpio = q.trim();
  const soloDig = limpio.replace(/\.0+$/, "").replace(/[\s.()+-]/g, "");
  // Todo el texto es un número (cédula, RUC, celular): se compara como número.
  if (/^\d{5,}(\.0+)?$/.test(soloDig)) {
    const qc = nucleoCedula(soloDig), qt = nucleoTelefono(soloDig);
    if (qc && (ced === qc || cedK === qc)) return 100;
    if (qc.length >= 5 && (ced.startsWith(qc) || cedK.startsWith(qc))) return 80;
    if (qt.length >= 6 && tel && (tel === qt || tel.endsWith(qt) || tel.startsWith(qt))) return 70;
    if (qc.length >= 6 && (ced.includes(qc) || cedK.includes(qc))) return 50;
    return 0;
  }
  const mCod = limpio.match(/^c-?(b?)\s*0*(\d+)$/i);
  if (mCod) return codN === mCod[2].replace(/^0+/, "") && (!mCod[1] || /CB/.test(cod)) ? 100 : 0;
  const toks = normTexto(limpio).split(" ").filter(Boolean);
  if (!toks.length) return 0;
  let pts = 0, fallan = 0, calzan = 0;
  for (const t of toks) {
    if (/^\d+$/.test(t)) {
      const qc = nucleoCedula(t);
      if (t.length >= 4 && (ced.includes(qc) || cedK.includes(qc) || (tel && tel.includes(nucleoTelefono(t))) || codN === qc)) { pts += 5; calzan++; continue; }
      return 0;
    }
    if (palabrasNom.includes(t)) { pts += 10; calzan++; }
    else if (palabrasNom.some((w) => w.startsWith(t))) { pts += 7; calzan++; }
    else if (t.length >= 3 && nombre.includes(t)) { pts += 3; calzan++; }
    else fallan++;
  }
  // «Esteban Ferlito Chiriboga» encuentra a «Esteban Ferlito»: se tolera UNA palabra de más si al menos dos calzan.
  if (fallan && !(fallan === 1 && calzan >= 2)) return 0;
  pts -= fallan * 6;
  if (nombre.startsWith(toks[0])) pts += 2;
  return pts;
}
extend("cl_buscar", "any", async (p, ctx, ses) => {
  const q = s(p.q).trim();
  if (q.length < 2) return { ok: true, items: [] };
  const matriz = await matrizSes(ctx);
  const veTel = verPrivados(ses, matriz, "telefono");
  let todas: Row[] = [];
  try { todas = await todasLasClientas(ctx); } catch { todas = []; }
  let rows: Row[] = todas.map((r) => ({ r, pts: puntajeClienta(r, q, veTel) })).filter((x) => x.pts > 0)
    .sort((a, b) => b.pts - a.pts || s(a.r.nombre).localeCompare(s(b.r.nombre))).slice(0, 12).map((x) => x.r);
  // Recién creadas (aún no están en la copia de 1 minuto): también la consulta directa.
  const dig = q.replace(/\D/g, "");
  const F: Filtro = dig.length >= 5 && dig.length === q.replace(/[\s+.()-]/g, "").length
    ? { op: "palabras", cols: veTel ? ["cedula", "telefono", "key"] : ["cedula", "key"], val: [nucleoCedula(dig).slice(0, 10) || dig] }
    : /^c-?b?\d+$/i.test(q) ? { op: "palabras", cols: ["codigo"], val: [q.toUpperCase().replace(/^C-?/, "")] }
    : { op: "palabras", cols: ["nombre", "cedula"], val: q.split(/\s+/).filter(Boolean) };
  try {
    const ya = new Set(rows.map((r) => s(r.key)));
    const directas = (await consultar(ctx.db, "beta_clientes", { cols: COLS_BUSCAR, filtros: [F], limite: 12, orden: [{ col: "nombre" }] })).rows;
    for (const r of directas) if (!ya.has(s(r.key)) && puntajeClienta(r, q, veTel) > 0) rows.push(r);
  } catch { /* solo la copia */ }
  const tel = veTel;
  // Una sola fila por clienta (🔗 Duplicados): se juntan sus otras filas (c:…001, unidas a mano) aunque la búsqueda no las trajo.
  const canon = [...new Set(rows.map((r) => canonDeClave(s(r.key))))];
  const extra = new Set(canon.flatMap((k) => clavesGuardadas(k)));
  for (const r of rows) extra.delete(s(r.key));
  if (extra.size) { try { rows = rows.concat((await consultar(ctx.db, "beta_clientes", { cols: ["key", "codigo", "nombre", "cedula", "telefono", "datos", "borrado"], filtros: [{ col: "key", op: "in", val: [...extra] }] })).rows); } catch { /* sin extra */ } }
  const grupos = new Map<string, Row[]>();
  for (const r of rows) { const k = canonDeClave(s(r.key)); const L = grupos.get(k) || []; L.push(r); grupos.set(k, L); }
  const items = canon.map((k) => fusionarFilas(k, grupos.get(k) || [])).filter((r) => r.borrado !== true).slice(0, 8).map((r) => {
    const d = (r.datos || {}) as Row, k = canonDeClave(s(r.key));
    const nombre = ((s(d.nombres) || "") + " " + (s(d.apellido) || "")).trim() || s(r.nombre);
    return { key: k, codigo: s(r.codigo), nombre, cedula: cedulaVer(s(d.cedula) || s(r.cedula) || (k.startsWith("c:") ? k.slice(2) : "")), tipoIdentificacion: s(d.tipoIdentificacion || d.tipo_identificacion) || "", ...(tel ? { telefono: telefonoEc(s(d.telefono) || s(r.telefono)) } : {}) };
  });
  return { ok: true, items };
});
