// Clientes de la beta, estilo MineCore (Emilia 17/11): lista larga con código y filtros, ficha con registro sin
// duplicados, resumen y pestañas (historial, paquetes, gift cards, documentos). Las correcciones y bajas viven en
// beta_clientes (0049); clientas_registro y la hoja no se tocan. Borrar solo por acción de admin o solicitud.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, conTelefono } from "./lib.ts";
import { acceso, esAdmin, matrizDe } from "./permisos.ts";
import { n, normCedula, telefonoEc, normNombre, round2, s, ymdUtc, type Row } from "./domain.ts";
import { leerSerie } from "./series.ts";
import { consultar, type Filtro } from "./query.ts";
import { claveCliente, claveRegistro, clienteDetalle, clientesResumen, codigoCliente, numeroTicket, saldoGift } from "./ventas.ts";
import { claveDe } from "./ticket_beta.ts";
import { docsDe } from "./tickets_beta_api.ts";
import { SOLICITUD_HOOKS } from "./inline_api.ts";

const FALTA = "Falta aplicar 0049_clientes_beta.sql";
async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
async function hay(ctx: Ctx): Promise<boolean> { try { await ctx.db.all("beta_clientes"); return true; } catch { return false; } }
const lite = (ses: Ses) => ({ rol: ses.rol, name: ses.name, short: ses.short, uid: ses.uid });

/** Campos de la ficha que se pueden corregir en la beta (clave → etiqueta). */
export const CAMPOS_CLIENTE: [string, string][] = [
  ["nombres", "Nombre"], ["apellido", "Apellido"], ["cedula", "Cédula"], ["telefono", "Teléfono"], ["email", "Email"],
  ["nacimiento", "Nacimiento"], ["sector", "Sector"], ["tipoPiel", "Tipo de piel"], ["estado", "Estado actual"],
  ["alergias", "Alergias"], ["medicacion", "Medicación"], ["condiciones", "Condiciones"], ["reacciones", "Reacciones previas"],
  ["exfoliantes", "Exfoliantes / retinoides"], ["extracciones", "Desea extracciones"], ["autorizaFotos", "Autoriza fotos"], ["ciclo", "Ciclo menstrual"], ["cortesia", "Cortesía complementaria"],
  ["consentimiento", "Aprueba consentimiento"], ["notas", "Notas"],
];
/** Solo lectura en la ficha (vienen del formulario de registro). */
export const CAMPOS_LECTURA: [string, string][] = [["registrada", "Fecha de registro"], ["ultimoRegistro", "Último registro"]];
const PRIVADOS = new Set(["telefono", "email"]);
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
function sinPrivados(d: Row, ses: Ses): Row {
  if (conTelefono(ses)) return d;
  const o: Row = {}; for (const [k, v] of Object.entries(d)) if (!PRIVADOS.has(k)) o[k] = v; return o;
}
async function overlays(ctx: Ctx): Promise<Map<string, Row>> {
  return new Map((await todas(ctx, "beta_clientes")).map((r) => [s(r.key), r]));
}
function mismaPersona(ced: string, nom: string, c2: unknown, n2: string): boolean {
  const pc = normCedula(c2);
  return (!!ced && pc === ced) || (!!nom && normNombre(n2) === nom && (!ced || !pc));
}

extend("cl_list", "any", async (_p, ctx, ses) => {
  const admin = esAdmin(ses.rol);
  const res = await clientesResumen(ctx.db, lite(ses), admin, await verTodos(ctx, ses));
  const ov = await overlays(ctx);
  const paqs = (await todas(ctx, "paquetes")).filter((r) => !r.borrado_at);
  const gcs = (await todas(ctx, "gift_cards")).filter((r) => !r.borrado_at && s(r.codigo_gc));
  const porCedP = new Map<string, number>(), porNomP = new Map<string, number>(), porCedG = new Map<string, number>(), porNomG = new Map<string, number>();
  for (const r of paqs) {
    if (r.completo === true) continue;
    const c = normCedula(r.cedula), nm = normNombre((s(r.nombres) + " " + s(r.apellidos)).trim());
    if (c) porCedP.set(c, (porCedP.get(c) || 0) + 1); else if (nm) porNomP.set(nm, (porNomP.get(nm) || 0) + 1);
  }
  for (const r of gcs) {
    const sal = saldoGift(r); if (!(sal > 0)) continue;
    const c = normCedula(r.cedula_comprador), nm = normNombre((s(r.nombre_comprador) + " " + s(r.apellido_comprador)).trim());
    if (c) porCedG.set(c, round2((porCedG.get(c) || 0) + sal)); else if (nm) porNomG.set(nm, round2((porNomG.get(nm) || 0) + sal));
  }
  const clientes: Row[] = [];
  for (const c of (res.clientes || []) as Row[]) {
    const o = ov.get(s(c.key));
    if (o?.borrado === true) continue;
    const d = sinPrivados((o?.datos || {}) as Row, ses);
    const item: Row = { ...c };
    if (s(o?.codigo)) item.codigo = s(o!.codigo);
    if (d.nombres != null) item.nombres = s(d.nombres);
    if (d.apellido != null) item.apellido = s(d.apellido);
    item.nombre = (s(item.nombres) + " " + s(item.apellido)).trim() || s(c.nombre);
    if (d.cedula != null) item.cedula = s(d.cedula);
    if (d.sector != null) item.sector = s(d.sector);
    if (d.telefono != null && "telefono" in c) item.telefono = s(d.telefono);
    if ("telefono" in item) item.telefono = telefonoEc(item.telefono);
    const ced = normCedula(c.cedula), nom = normNombre(s(c.nombre));
    item.paquetesActivos = (ced && porCedP.get(ced)) || porNomP.get(nom) || 0;
    if (admin) item.giftSaldo = (ced && porCedG.get(ced)) || porNomG.get(nom) || 0;
    item.editado = !!o;
    clientes.push(item);
  }
  const uniq = (k: string) => [...new Set(clientes.map((c) => s(c[k])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return { ok: true, admin, clientes, cosmetologas: uniq("cosmetologa"), sectores: uniq("sector"), puedeEditar: admin, puedePedir: !admin };
});

async function ficha(ctx: Ctx, ses: Ses, key: string): Promise<Row> {
  const admin = esAdmin(ses.rol);
  const ov = (await overlays(ctx)).get(key);
  if (ov?.borrado === true && !admin) return { error: "Esa clienta está eliminada" };
  const det = await clienteDetalle(ctx.db, lite(ses), admin || await verTodos(ctx, ses), key);
  if (det.error) return det;
  const cli = det.cliente as Row;
  const regs = (await todas(ctx, "clientas_registro")).filter((r) => !r.borrado_at && claveRegistro(r) === key);
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
  const ced = normCedula(datos.cedula || cli.cedula), nom = normNombre((s(datos.nombres) + " " + s(datos.apellido)).trim() || s(cli.nombre));
  // Historial: cada ticket con la clave que abre el detalle de ticket de la beta.
  const filas = (await todas(ctx, "tickets")).filter((r) => !r.borrado_at && claveCliente(r) === key);
  const porNum = new Map(filas.map((r) => [numeroTicket(r), r]));
  const cabs = new Map((await todas(ctx, "beta_tickets")).map((c) => [s(c.clave), c]));
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
  for (const c of reg.consentimientos) documentos.push({ tipo: "consentimiento", nombre: "Consentimiento informado" + (c.autorizaFotos ? " · fotos: " + c.autorizaFotos : ""), fecha: c.fecha, url: c.firma, texto: c.texto });
  const gifts = (await todas(ctx, "gift_cards")).filter((r) => !r.borrado_at && s(r.codigo_gc) &&
    (mismaPersona(ced, nom, r.cedula_comprador, s(r.nombre_comprador) + " " + s(r.apellido_comprador)) || (!!nom && normNombre(r.usado_por) === nom)))
    .map((r) => ({ codigo: s(r.codigo_gc), valor: s(r.valor), saldo: admin ? saldoGift(r) : undefined, usado: r.usado === true, fechaUso: s(r.fecha_uso), usadoPor: s(r.usado_por),
      comprador: (s(r.nombre_comprador) + " " + s(r.apellido_comprador)).trim(), fecha: [r.dia, r.mes, r.ano].every((x) => x != null && s(x) !== "") ? `${s(r.ano).split(".")[0]}-${String(n(r.mes)).padStart(2, "0")}-${String(n(r.dia)).padStart(2, "0")}` : "" }));
  const total = historial.reduce((a, t) => a + n(t.total), 0);
  const fechas = historial.map((t) => s(t.fecha)).filter(Boolean).sort();
  const resumen: Row = { tickets: historial.length, ultima: fechas.at(-1) || "", primera: fechas[0] || "", registros: reg.veces };
  if (admin) { resumen.total = round2(total); resumen.promedio = historial.length ? round2(total / historial.length) : 0; }
  const paquetes = ((det.paquetes || []) as Row[]);
  resumen.sesionesPendientes = paquetes.reduce((a, p) => a + n(p.pendientes), 0);
  return {
    ok: true, admin, key, codigo, datos: sinPrivados(datos, ses), campos: CAMPOS_CLIENTE.filter(([k]) => conTelefono(ses) || !PRIVADOS.has(k)), lectura: CAMPOS_LECTURA,
    corregidos: Object.keys(corr), resumen, historial, paquetes, giftcards: gifts, documentos: documentos.sort((a, b) => s(b.fecha).localeCompare(s(a.fecha))),
    bitacora: (ov?.historial || []) as Row[], borrado: ov?.borrado === true, borradoMotivo: s(ov?.borrado_motivo),
    puedeEditar: admin, puedePedir: !admin,
  };
}

extend("cl_get", "any", async (p, ctx, ses) => {
  const key = s(p.key);
  if (!key) return { error: "Falta la clienta" };
  return ficha(ctx, ses, key);
});

/** Datos de la clienta editados en un ticket → ficha (beta_clientes), con historial «desde ticket». */
export async function propagarDesdeTicket(ctx: Ctx, ses: Ses, key: string, datosTk: Row, so: string): Promise<Row> {
  const MAPA: Record<string, string> = { nombre: "nombres", apellido: "apellido", cedula: "cedula", email: "email", telefono: "telefono" };
  const cambios: Row = {};
  for (const [k, v] of Object.entries(datosTk || {})) if (MAPA[k] && s(v)) cambios[MAPA[k]] = k === "telefono" ? s(v).replace(/[^\d+]/g, "") : s(v);
  if (!key || !Object.keys(cambios).length) return { ok: true, sinCambios: true };
  return await guardarCliente(ctx, ses, key, cambios, "desde ticket " + so);
}
async function guardarCliente(ctx: Ctx, ses: Ses, key: string, cambios: Row, via: string): Promise<Row> {
  if (!(await hay(ctx))) return { error: FALTA };
  const permitidos = new Set(CAMPOS_CLIENTE.map(([k]) => k));
  const limpio: Row = {};
  for (const [k, v] of Object.entries(cambios || {})) if (permitidos.has(k)) limpio[k] = s(v).trim().slice(0, 500);
  if (!Object.keys(limpio).length) return { error: "Nada que cambiar" };
  if (limpio.cedula && !/^\d{10}(\d{3})?$|^[A-Z0-9-]{5,20}$/i.test(String(limpio.cedula))) return { error: "Cédula inválida" };
  if (limpio.nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(String(limpio.nacimiento))) return { error: "Nacimiento: usa AAAA-MM-DD" };
  if (limpio.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(limpio.email))) return { error: "Email inválido" };
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
  if (ov) await ctx.db.write(actorOf(ses), "beta_clientes", "update", { key }, fila);
  else await ctx.db.write(actorOf(ses), "beta_clientes", "insert", {}, { key, ...fila });
  return { ok: true, key, cambios: Object.keys(cambio) };
}
async function borrarCliente(ctx: Ctx, ses: Ses, key: string, motivo: string, via: string): Promise<Row> {
  if (!(await hay(ctx))) return { error: FALTA };
  if (!s(motivo).trim()) return { error: "El motivo es obligatorio" };
  const ov = (await overlays(ctx)).get(key);
  const historial = [...((ov?.historial || []) as Row[]), { fecha: ctx.now.toISOString(), por: ses.name, accion: via, motivo }];
  const fila = { borrado: true, borrado_motivo: s(motivo).trim(), borrado_por: ses.name, borrado_at: ctx.now.toISOString(), historial, actualizado_por: ses.name, updated_at: ctx.now.toISOString() };
  if (ov) await ctx.db.write(actorOf(ses), "beta_clientes", "update", { key }, fila);
  else await ctx.db.write(actorOf(ses), "beta_clientes", "insert", {}, { key, datos: {}, ...fila });
  return { ok: true, key, borrado: true };
}

extend("cl_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin guarda directo; usa «Solicitar cambio»" };
  return guardarCliente(ctx, ses, s(p.key), (p.cambios || {}) as Row, "edición");
});
extend("cl_borrar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin elimina; usa «Solicitar eliminación»" };
  return borrarCliente(ctx, ses, s(p.key), s(p.motivo), "eliminación");
});
extend("cl_restaurar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const key = s(p.key), ov = (await overlays(ctx)).get(key);
  if (!ov?.borrado) return { error: "La clienta no está eliminada" };
  const historial = [...((ov.historial || []) as Row[]), { fecha: ctx.now.toISOString(), por: ses.name, accion: "restaurada" }];
  await ctx.db.write(actorOf(ses), "beta_clientes", "update", { key }, { borrado: false, borrado_motivo: null, borrado_por: null, borrado_at: null, historial, actualizado_por: ses.name, updated_at: ctx.now.toISOString() });
  return { ok: true, key };
});

SOLICITUD_HOOKS["cliente_beta"] = {
  fila: async (ctx, ses, key) => {
    const f = await ficha(ctx, ses, key);
    if (f.error) return { error: s(f.error) };
    return { row: { key }, antes: f.datos as Row };
  },
  aplicar: (ctx, ses, key, propuestos) => guardarCliente(ctx, ses, key, propuestos, "solicitud aprobada"),
  borrar: (ctx, ses, key, motivo) => borrarCliente(ctx, ses, key, motivo || "solicitud aprobada", "eliminación por solicitud"),
};

/** Buscador de clientas para el ticket nuevo: nombre, cédula, celular o código C-xxxxx (beta_clientes). */
extend("cl_buscar", "any", async (p, ctx, ses) => {
  const q = s(p.q).trim();
  if (q.length < 2) return { ok: true, items: [] };
  const dig = q.replace(/\D/g, "");
  let F: Filtro;
  if (/^c-?b?\d+$/i.test(q)) F = { op: "palabras", cols: ["codigo"], val: [q.toUpperCase().replace(/^C-?/, "")] };
  else if (dig.length >= 5 && dig.length === q.replace(/[\s+.()-]/g, "").length) F = { op: "palabras", cols: ["cedula", "telefono"], val: [dig.length >= 9 && !dig.startsWith("1") && !dig.startsWith("2") ? dig.replace(/^(593)?0?/, "").slice(-9) : dig.replace(/^0+/, "")] };
  else F = { op: "palabras", cols: ["nombre", "cedula"], val: q.split(/\s+/).filter(Boolean) };
  let rows: Row[] = [];
  try { rows = (await consultar(ctx.db, "beta_clientes", { cols: ["key", "codigo", "nombre", "cedula", "telefono", "datos", "borrado"], filtros: [F], limite: 12, orden: [{ col: "nombre" }] })).rows; } catch { rows = []; }
  const tel = conTelefono(ses);
  const items = rows.filter((r) => r.borrado !== true).slice(0, 8).map((r) => {
    const d = (r.datos || {}) as Row;
    const nombre = ((s(d.nombres) || "") + " " + (s(d.apellido) || "")).trim() || s(r.nombre);
    return { key: s(r.key), codigo: s(r.codigo), nombre, cedula: s(d.cedula) || s(r.cedula), ...(tel ? { telefono: telefonoEc(s(d.telefono) || s(r.telefono)) } : {}) };
  });
  return { ok: true, items };
});
