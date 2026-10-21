import { extend } from "./handlers.ts";
import { actorOf, conTelefono, espejo, guardarArchivo, kvGet, kvSet, logAccion, nextSheet, rowBySheet } from "./lib.ts";
import type { Ctx, Ses } from "./lib.ts";
import {
  ADMIN, BETA_TABLES, RECEP, addDays, b, ecuadorParts, esInterno, estadoTicket, facialSku, n, normCedula, normNombre,
  productQtys, rolCalcular, round2, s, skuCode, validarBitacora, ymdUtc, type Row,
} from "./domain.ts";
import { acceso, esPropio, matrizDe } from "./permisos.ts";

type R = Record<string, unknown>;

extend("getSeguimiento", "any", async (_p, ctx, ses) => {
  const ec = ecuadorParts(ctx.now).ymd;
  const por = new Map<string, R>();
  for (const r of await ctx.db.all("tickets")) {
    if (!r.timestamp || esInterno(r.atendido_por, r.id_3)) continue;
    const ced = normCedula(r.id_3);
    const key = ced || normNombre(s(r.nombre) + " " + s(r.apellido));
    if (!key) continue;
    const vis = ymdUtc(r.timestamp);
    const prev = por.get(key);
    if (prev && s(prev.visita) >= vis) continue;
    por.set(key, {
      tkRow: r.sheet_row, cedula: ced, nombre: s(r.nombre), apellido: s(r.apellido),
      cosmetologa: s(r.atendido_por), visita: vis, retorno: s(r.fecha_retorno).slice(0, 10),
      estado: estadoTicket({ seguimiento: s(r.seguimiento), agendado: b(r.agendado), retorno: s(r.fecha_retorno) }, ec),
    });
  }
  const store = await kvGet(ctx.db, "SUNSU_SEGUIMIENTO");
  const items = [];
  for (const [k, o] of por) {
    const est = s(o.estado);
    if (!est || est.includes("Agendada") || est.includes("No desea") || est.includes("Sin respuesta")) continue;
    const reg = store[k] as R | undefined;
    if (reg && n(reg.tk) === n(o.tkRow)) {
      if (reg.r === "nd" || reg.r === "sr") continue;
      if (reg.r === "nc" && s(reg.hasta) > ec) continue;
      o.intentos = n(reg.n);
      if (reg.r === "we") { o.waEnviado = true; o.waFecha = reg.ts; o.waPor = reg.u; }
    }
    items.push(o);
  }
  const tel = conTelefono(ses);
  const regs = await ctx.db.all("clientas_registro");
  const porCed = new Map(regs.map((r) => [normCedula(r.cedula), s(r.telefono)]));
  if (tel) for (const o of items) o.telefono = porCed.get(s(o.cedula)) || "";
  else for (const o of items) o.telefono = "";
  const cumples = [];
  const mes = ecuadorParts(ctx.now).m;
  for (const r of regs) {
    const fn = ymdUtc(r.fecha_de_nacimiento);
    if (!fn || Number(fn.slice(5, 7)) !== mes) continue;
    cumples.push({ nombre: s(r.nombre), apellido: s(r.apellido), cedula: normCedula(r.cedula), dia: Number(fn.slice(8, 10)), telefono: tel ? s(r.telefono) : "" });
  }
  const msgs = await kvGet(ctx.db, "mensajes_cache");
  return {
    items, cumples, waCumples: await kvGet(ctx.db, "SUNSU_CUMPLE_WA"),
    stats: { agendadas: 0, noDesea: 0, sinRespuesta: 0, intentos: 0 },
    msgAtrasada: s(msgs.atr) || "Hola {nombre}, ya pasó tu fecha ({fecha}).",
    msgProxima: s(msgs.prox) || "Hola {nombre}, se acerca tu facial ({fecha}).",
    msgCumple: s(msgs.cum) || "Hola {nombre}, ¡feliz cumpleaños!",
    hoy: ec,
  };
});

extend("resultadoSeguimiento", "any", async (p, ctx, ses) => {
  const tipo = s(p.tipo);
  const rowN = n(p.tkRow);
  const ced = normCedula(p.cedula);
  const key = ced || normNombre(s(p.nombre) + " " + s(p.apellido));
  if (!rowN || !key || (tipo !== "nc" && tipo !== "nd")) return { error: "Parámetros inválidos" };
  const store = await kvGet(ctx.db, "SUNSU_SEGUIMIENTO");
  const prev = (store[key] as R | undefined) && n((store[key] as R).tk) === rowN ? store[key] as R : { n: 0 };
  const ec = ecuadorParts(ctx.now).ymd;
  let nuevo: R;
  if (tipo === "nd") nuevo = { tk: rowN, r: "nd", n: n(prev.n), u: ses.name, ts: ec };
  else {
    const intentos = n(prev.n) + 1;
    nuevo = { tk: rowN, r: intentos >= 3 ? "sr" : "nc", n: intentos, hasta: addDays(ec, 15), u: ses.name, ts: ec };
  }
  if (nuevo.r === "nd" || nuevo.r === "sr") {
    const row = await rowBySheet(ctx.db, "tickets", rowN);
    if (!row) return { error: "Fila inválida" };
    if (ced && normCedula(row.id_3) && ced !== normCedula(row.id_3)) return { error: "La fila no coincide. Refresca la lista e intenta de nuevo." };
    await ctx.db.write(actorOf(ses), "tickets", "update", { sheet_row: rowN }, {
      seguimiento: nuevo.r === "nd" ? "🔕 No desea" : "📵 Sin respuesta",
    });
  }
  store[key] = nuevo;
  await kvSet(ctx.db, actorOf(ses), "SUNSU_SEGUIMIENTO", store);
  await espejo(ctx.db, actorOf(ses), "seguimiento_memoria", { clave: key, ...nuevo });
  return { ok: true, estado: nuevo.r, intentos: nuevo.n };
});
extend("seguimientoWaEnviado", "any", async (p, ctx, ses) => {
  const key = normCedula(p.cedula) || normNombre(s(p.nombre) + " " + s(p.apellido));
  const store = await kvGet(ctx.db, "SUNSU_SEGUIMIENTO");
  const wa = { tk: n(p.tkRow), r: "we", n: n((store[key] as R)?.n), u: ses.name, ts: ecuadorParts(ctx.now).ymd, clave: key, tipo: "seguimiento" };
  store[key] = wa;
  await kvSet(ctx.db, actorOf(ses), "SUNSU_SEGUIMIENTO", store);
  await espejo(ctx.db, actorOf(ses), "wa_enviados", wa);
  return { ok: true };
});
extend("cumpleWaEnviado", "any", async (p, ctx, ses) => {
  const store = await kvGet(ctx.db, "SUNSU_CUMPLE_WA");
  const wa = { u: ses.name, ts: ecuadorParts(ctx.now).ymd, clave: s(p.clave), tipo: "cumple" };
  store[s(p.clave)] = wa;
  await kvSet(ctx.db, actorOf(ses), "SUNSU_CUMPLE_WA", store);
  await espejo(ctx.db, actorOf(ses), "wa_enviados", wa);
  return { ok: true };
});
extend("segPaqWaEnviado", "any", async (p, ctx, ses) => {
  const store = await kvGet(ctx.db, "SUNSU_SEG_PAQ");
  const wa = { u: ses.name, ts: ecuadorParts(ctx.now).ymd, clave: s(p.clave), tipo: "paquete" };
  store[s(p.clave)] = wa;
  await kvSet(ctx.db, actorOf(ses), "SUNSU_SEG_PAQ", store);
  await espejo(ctx.db, actorOf(ses), "wa_enviados", wa);
  return { ok: true };
});

extend("getClientasAntiguas", "any", async (_p, ctx, ses) => {
  const tel = conTelefono(ses);
  const items = (await ctx.db.all("clientas_antiguas")).map((r) => ({
    cedula: s(r.cedula), nombre: s(r.nombre), telefono: tel ? s(r.telefono) : "", email: s(r.email),
    ultima: s(r.ultima_visita), visitas: n(r.visitas), estado: s(r.estado), intentos: n(r.intentos),
    contactadaPor: s(r.contactada_por), fechaContacto: s(r.fecha_contacto),
  }));
  return { items };
});
extend("clientaAntiguaEstado", "any", async (p, ctx, ses) => {
  const rows = await ctx.db.all("clientas_antiguas");
  const row = rows.find((r) => normCedula(r.cedula) === normCedula(p.cedula));
  if (!row) return { error: "Clienta no encontrada" };
  await ctx.db.write(actorOf(ses), "clientas_antiguas", "update", { sheet_row: row.sheet_row }, { estado: s(p.estado) });
  return { ok: true };
});
extend("clientaAntiguaContactada", "any", async (p, ctx, ses) => {
  const rows = await ctx.db.all("clientas_antiguas");
  const row = rows.find((r) => normCedula(r.cedula) === normCedula(p.cedula));
  if (!row) return { error: "Clienta no encontrada" };
  await ctx.db.write(actorOf(ses), "clientas_antiguas", "update", { sheet_row: row.sheet_row }, {
    contactada_por: ses.name, fecha_contacto: ecuadorParts(ctx.now).ymd, intentos: n(row.intentos) + 1,
  });
  return { ok: true };
});

extend("getKPIsMes", "any", async (p, ctx) => {
  const desde = s(p.desde) || ecuadorParts(ctx.now).ymd.slice(0, 8) + "01";
  const hasta = s(p.hasta) || ecuadorParts(ctx.now).ymd;
  const primera = new Map<string, string>();
  const tks = await ctx.db.all("tickets");
  for (const t of tks) {
    const c = normCedula(t.id_3);
    const f = ymdUtc(t.timestamp);
    if (!c || c === "1793219469001" || !f) continue;
    if (!primera.has(c) || f < primera.get(c)!) primera.set(c, f);
  }
  let ing = 0, tickets = 0, faciales = 0, unidades = 0, canjesPaq = 0, canjesGC = 0, gcVendidas = 0, nuevas = 0;
  const clientas = new Set<string>();
  const porCosm: R = {};
  const prod = new Map<string, R>();
  for (const t of tks) {
    const f = ymdUtc(t.timestamp);
    if (!f || f < desde || f > hasta) continue;
    const c = normCedula(t.id_3);
    if (c === "1793219469001") continue;
    tickets++;
    ing += n(t.estimado);
    if (c) {
      clientas.add(c);
      if (primera.get(c)! >= desde) nuevas += 0;
    }
    if (s(t.facial_hecho)) {
      faciales++;
      const cs = s(t.atendido_por);
      if (cs && cs.toUpperCase() !== "SUNSU") porCosm[cs] = n(porCosm[cs]) + 1;
    }
    if (s(t.paquete).startsWith("SI")) canjesPaq++;
    if (s(t.gift_card).startsWith("SI")) canjesGC++;
    if (s(t.venta_gift).toUpperCase().startsWith("SI")) gcVendidas++;
    for (const pr of productQtys(t)) {
      unidades += pr.qty;
      const cur = prod.get(pr.sku) || { sku: pr.sku, n: pr.sku, u: 0, ing: 0 };
      cur.u = n(cur.u) + pr.qty;
      prod.set(pr.sku, cur);
    }
  }
  const nuevasSet = new Set<string>();
  for (const c of clientas) if ((primera.get(c) || "") >= desde) nuevasSet.add(c);
  nuevas = nuevasSet.size;
  let paqTotal = 0;
  const paqPorVend: R = {};
  for (const r of await ctx.db.all("paquetes")) {
    const y = n(r.ano), m = n(r.mes), d = n(r.dia) || 1;
    if (!m || !y) continue;
    const f = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (f < desde || f > hasta) continue;
    paqTotal++;
    const v = s(r.vendido_por) || "—";
    paqPorVend[v] = n(paqPorVend[v]) + 1;
  }
  const topProd = [...prod.values()].sort((a, b) => n(b.u) - n(a.u)).slice(0, 12);
  return {
    ing: round2(ing), ingSin: round2(ing / 1.15), tickets, clientas: clientas.size, nuevas, faciales,
    promedio: tickets ? round2(ing / tickets) : 0, promedioSin: tickets ? round2(ing / 1.15 / tickets) : 0,
    paqTotal, unidadesProd: unidades, gcVendidas, canjesGC, canjesPaq, porCosm, paqPorVend, topProd, desde, hasta,
  };
});
extend("getKpisRango", "any", async (p, ctx, ses) => extendKpi(p, ctx));
async function extendKpi(p: R, ctx: Ctx) {
  const { handle } = await import("./handlers.ts");
  return handle("getKPIsMes", p, ctx);
}
extend("getKPIsHistoricos", "any", async () => ({ items: [], parcial: true, nota: "Los KPI históricos salían de los .xls de Mi Negocio. En la beta el mes en curso se calcula en vivo (getKPIsMes)." }));

extend("getRoles", "any", async (_p, ctx) => {
  const hist = await ctx.db.all("rrhh_historial");
  const meses = new Map<string, R>();
  for (const r of hist) {
    if (!s(r.mes) || !s(r.empleada)) continue;
    const clave = s(r.mes) + " " + s(r.ano);
    const g = meses.get(clave) || { mes: s(r.mes), anio: r.ano, empleadas: [], sheetName: s(r.mes).toUpperCase() + "_" + s(r.ano) };
    (g.empleadas as R[]).push({
      nombre: s(r.empleada), cedula: s(r.cedula), sueldo: n(r.sueldo), bono: n(r.bono), comisiones: n(r.comisiones),
      extras: n(r.extras_m_o_q), decimos: n(r.c_13_14_fr_r_s_t), totalIngresos: n(r.total_ingresos_u),
      iessPatronal: n(r.iess_patronal_11_15), costoEmpresa: n(r.costo_empresa),
    });
    meses.set(clave, g);
  }
  const sheets = ["MAYO_2026", "JUNIO_2026", "JULIO_2026", "AGOSTO_2026", "SEPTIEMBRE_2026"];
  return { ok: true, data: { meses: [...meses.values()], resumen: [], sheetsDisponibles: sheets } };
});
extend("getRolIndividual", "any", async (p, ctx, ses) => {
  const sheet = s(p.sheet);
  const partes = sheet.split("_");
  const anio = n(partes[partes.length - 1]);
  const meses: R = { ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12 };
  const mes = n(meses[partes[0]] || 0);
  const emps = await ctx.db.all("rrhh_empleadas");
  const ced = s(p.cedula).replace(".", "");
  const e = emps.find((r) => s(r.cedula).replace(".", "") === ced || normCedula(r.cedula) === normCedula(ced));
  if (!e || !mes) return { ok: false, error: "Sheet no encontrada" };
  if (acceso(ses.rol, "rol_pagos", await matrizDe(ctx.db)) !== "todos") {
    if (!esPropio(s(e.nombre_app), ses) && !esPropio(s(e.apellidos_y_nombres), ses)) {
      return { ok: false, error: "No tienes permiso para ver el rol de otra persona" };
    }
  }
  let rpc: R | null = null;
  try {
    rpc = await ctx.db.rpc("rol_calcular", {
      p_nombre_app: s(e.nombre_app), p_anio: anio, p_mes: mes,
    }) as R;
  } catch { rpc = null; }
  const local = rolCalcular({
    sueldo: n(e.sueldo_base), bono: n(e.bono_fijo), fondoReserva: s(e.fondo_reserva).toUpperCase() === "SI",
    fechaIngreso: s(e.fecha_ingreso) || "2020-01-01", anio, mes,
    comFaciales: n(rpc?.com_faciales), comExtras: n(rpc?.com_extras), comRecepcion: n(rpc?.com_recepcion),
    comProductos: n(rpc?.com_productos), comPaquetes: n(rpc?.com_paquetes), multas: n(rpc?.multas_descuentos),
  });
  const data = {
    nombre: s(e.apellidos_y_nombres) || s(e.nombre_app), cedula: s(e.cedula), cargo: s(e.cargo),
    diasNorm: "", diasDesc: "", diasFest: "", sueldo: local.sueldo, bono: local.bono,
    comFaciales: local.comFaciales, comPaquetes: local.comPaquetes, comProductos: local.comProductos,
    hrsSupl: 0, valSupl: 0, hrsExtr: 0, valExtr: 0, hrsDesc: 0, valDesc: 0,
    dec13: local.dec13, dec14: local.dec14, fondoReserva: local.fondoReserva, vacaciones: local.vacaciones,
    totalIngresos: rpc && !rpc.error ? n(rpc.total_ingresos) : local.totalIngresos,
    iess: rpc && !rpc.error ? n(rpc.iess_personal) : local.iess,
    egresos: rpc && !rpc.error ? n(rpc.total_egresos) : local.egresos,
    totalRecibir: rpc && !rpc.error ? n(rpc.total_recibir) : local.totalRecibir,
    anticipo: 0, prestHip: 0, prestQuir: 0, sheet, multasDetalle: [],
    fuente: rpc && !rpc.error ? "rol_calcular" : "beta-local",
  };
  return { ok: true, data };
});
extend("getAprobacionesRol", "any", async (p, ctx) => {
  const sh = s(p.sheet);
  const map: R = {};
  for (const r of await ctx.db.all("roles_aprobados")) {
    if (s(r.rol_mes) !== sh) continue;
    map[s(r.cedula).replace(".", "")] = { fecha: s(r.fecha), nombre: s(r.nombre) };
  }
  return { ok: true, aprobaciones: map };
});
extend("aprobarRol", "any", async (p, ctx, ses) => {
  const sr = await nextSheet(ctx.db, "roles_aprobados");
  await ctx.db.write(actorOf(ses), "roles_aprobados", "insert", {}, {
    sheet_row: sr, fecha: ecuadorParts(ctx.now).isoWall, rol_mes: s(p.sheet), cedula: s(p.cedula),
    nombre: s(p.nombre) || ses.name, aprobado_desde: "app", orig: { sheet: s(p.sheet) },
  });
  return { ok: true };
});
extend("getPermisos", "any", async (_p, ctx) => {
  const data = (await ctx.db.all("permisos")).filter((r) => s(r.empleada) || s(r.id_1)).map((r) => ({
    id: s(r.id_1) || s(r.sheet_row), empleada: s(r.empleada), tipo: s(r.tipo),
    desde: s(r.fecha_inicio), hasta: s(r.fecha_fin), horas: s(r.horas), motivo: s(r.motivo),
    estado: s(r.estado), solicitado: s(r.solicitado), aprobadoPor: s(r.aprobado_por),
    url: s(r.url_certificado), jibble: s(r.ingresado_en_jibble), row: r.sheet_row,
  }));
  return { ok: true, data };
});
extend("savePermiso", "any", async (p, ctx, ses) => {
  const sr = await nextSheet(ctx.db, "permisos");
  let url = s(p.url);
  if (s(p.certificado).includes("base64,")) {
    const id = await guardarArchivo(ctx.db, actorOf(ses), "permiso", "certificado", s(p.certificado));
    if (id) url = "archivo:" + id;
  }
  await ctx.db.write(actorOf(ses), "permisos", "insert", {}, {
    sheet_row: sr, id_1: "P-" + sr, empleada: s(p.empleada) || ses.name, tipo: s(p.tipo),
    fecha_inicio: s(p.desde || p.fechaInicio), fecha_fin: s(p.hasta || p.fechaFin), horas: s(p.horas),
    motivo: s(p.motivo), estado: "PENDIENTE", solicitado: ecuadorParts(ctx.now).ymd, url_certificado: url,
    orig: { tipo: s(p.tipo) },
  });
  return { ok: true, id: "P-" + sr };
});
extend("updatePermiso", RECEP, async (p, ctx, ses) => {
  const row = n(p.row) ? await rowBySheet(ctx.db, "permisos", n(p.row)) : (await ctx.db.all("permisos")).find((r) => s(r.id_1) === s(p.id));
  if (!row) return { error: "Permiso no encontrado" };
  await ctx.db.write(actorOf(ses), "permisos", "update", { sheet_row: row.sheet_row }, {
    estado: s(p.estado) || s(row.estado), aprobado_por: ses.name, ingresado_en_jibble: s(p.jibble || row.ingresado_en_jibble),
  });
  return { ok: true };
});

extend("getCabina", "any", async (_p, ctx) => {
  const fotos = await kvGet(ctx.db, "CABINA_FOTOS");
  const inv = (await ctx.db.all("cabina_inventario")).filter((r) => s(r.codigo) || s(r.producto)).map((r) => ({
    row: r.sheet_row, codigo: s(r.codigo), producto: s(r.producto), proveedor: s(r.proveedor),
    contenido: n(r.contenido_envase), unidad: s(r.unidad), costoEnvase: n(r.costo_envase), costoUnidad: n(r.costo_por_unidad),
    cerrados: n(r.envases_cerrados), abierto: n(r.abierto_restante), stock: n(r.stock_total), minimo: n(r.minimo_envases),
    notas: s(r.notas), activo: s(r.activo) || "SI", skuCat: s(r.sku_catalogo), bodega: n(r.bodega_cerrados),
    barras: s(r.codigo_barras), base: s(r.producto_base), ubicacion: s(r.ubicacion),
    ubicacionLocal: s(r.ubicacion_local), ubicacionAbierto: s(r.ubicacion_abierto), maxAbiertos: Math.max(1, n(r.max_abiertos) || 1),
    esterilizable: s(r.esterilizable), foto: s(fotos[s(r.codigo)] || ""),
  }));
  const activos = (await ctx.db.all("cabina_activos")).filter((r) => s(r.codigo) || s(r.activo)).map((r) => ({
    row: r.sheet_row, codigo: s(r.codigo), nombre: s(r.activo), categoria: s(r.categoria),
    local: n(r.cantidad), bodega: n(r.cantidad_bodega), unidad: s(r.unidad) || "unidad",
    ubicacion: s(r.ubicacion), estado: s(r.estado), costo: n(r.costo), notas: s(r.notas), proveedor: s(r.proveedor),
  }));
  const protocolos = (await ctx.db.all("cabina_protocolos")).map((r) => ({
    row: r.sheet_row, sku: s(r.sku), nombre: s(r.facial), version: n(r.version), vigente: s(r.vigente).toUpperCase() !== "NO",
    mo: n(r.mano_de_obra), video: s(r.video), notas: s(r.notas), por: s(r.por),
  }));
  const pasos = await ctx.db.all("cabina_protocolo_pasos");
  for (const p of protocolos) {
    (p as R).pasos = pasos.filter((x) => s(x.sku) === s((p as R).sku) && n(x.version) === n((p as R).version)).map((x) => ({
      row: x.sheet_row, paso: n(x.paso), descripcion: s(x.descripcion), producto: s(x.producto_cod), cantidad: n(x.cantidad), unidad: s(x.unidad), minutos: n(x.minutos),
    }));
  }
  const ordenes = (await ctx.db.all("cabina_ordenes")).map((r) => ({
    row: r.sheet_row, num: s(r.num), fecha: s(r.fecha), proveedor: s(r.proveedor),
    items: parseJson(r.items), estado: s(r.estado), total: n(r.total), por: s(r.por), recibida: s(r.recibida), recibidaPor: s(r.recibida_por),
  }));
  const bajas = (await ctx.db.all("cabina_bajas")).map((r) => ({
    num: s(r.num), fecha: s(r.fecha), tipo: s(r.tipo), codigo: s(r.codigo), nombre: s(r.nombre), cantidad: s(r.cantidad), razon: s(r.razon), por: s(r.por), foto: s(r.foto),
  }));
  const traspasos = (await ctx.db.all("cabina_traspasos")).map((r) => ({
    num: s(r.col_1), fecha: s(r.fecha), ruta: s(r.de_a), items: parseJson(r.items), por: s(r.por),
  }));
  const aperturas = (await ctx.db.all("cabina_aperturas")).map((r) => {
    const o = (r.orig && typeof r.orig === "object" ? r.orig : {}) as R;
    return { num: s(o.num || r.col_6), fecha: s(o.fecha || r.fecha), accion: s(o.accion), codigo: s(o.codigo || r.producto), nombre: s(o.nombre || r.contenido), cantidad: s(o.cantidad), por: s(o.por || r.quien) };
  });
  if (!inv.length && !activos.length) return { sinEstructura: true, inventario: [], activos: [], protocolos: [], ordenes: [], traspasos: [], bajas: [], aperturas: [] };
  return { inventario: inv, activos, protocolos, ordenes, traspasos, bajas, aperturas, fijosMensuales: 0, fijosDetalle: [], facialesMesRef: 0, mesRef: "", fijoPorFacial: 0 };
});
function parseJson(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  try { const x = JSON.parse(s(v) || "[]"); return Array.isArray(x) ? x : []; } catch { return []; }
}

extend("cabinaAbrirRapido", "any", async (p, ctx, ses) => {
  const rows = await ctx.db.all("cabina_inventario");
  const row = rows.find((r) => s(r.codigo) === s(p.codigo));
  if (!row) return { error: "Producto no encontrado" };
  let loc = n(row.envases_cerrados), ab = n(row.abierto_restante);
  const bod = n(row.bodega_cerrados), cont = n(row.contenido_envase);
  let acc = "";
  if (p.modo === "abrir") {
    if (loc <= 0) return { error: "No hay envases cerrados en el local" };
    loc -= 1; ab += 1; acc = "APERTURA";
  } else {
    if (ab <= 0) return { error: "No hay envase abierto" };
    ab -= 1; acc = "SE ACABO";
  }
  const stock = (loc + bod + ab) * cont;
  await ctx.db.write(actorOf(ses), "cabina_inventario", "update", { sheet_row: row.sheet_row }, { envases_cerrados: loc, abierto_restante: ab, stock_total: stock });
  const sr = await nextSheet(ctx.db, "cabina_aperturas");
  const num = "AP-" + String(sr).padStart(3, "0");
  const ec = ecuadorParts(ctx.now);
  await ctx.db.write(actorOf(ses), "cabina_aperturas", "insert", {}, {
    sheet_row: sr, fecha: ec.stamp, producto: s(p.codigo), contenido: s(row.producto), quien: ses.name,
    orig: { num, fecha: ec.stamp, accion: acc, codigo: s(p.codigo), nombre: s(row.producto), cantidad: "1 envase", por: ses.name },
  });
  return { ok: true, num, abierto: ab, cerrados: loc };
});

extend("cabinaTraspaso", ADMIN, async (p, ctx, ses) => {
  const de = p.de === "local" ? "local" : "bodega";
  const items = ((p.items as R[]) || []).filter((it) => s(it.codigo) && n(it.envases) > 0);
  if (!items.length) return { error: "El traspaso no tiene productos" };
  const rows = await ctx.db.all("cabina_inventario");
  const plan = [];
  for (const it of items) {
    const row = rows.find((r) => s(r.codigo) === s(it.codigo));
    if (!row) return { error: s(it.codigo) + ": no existe" };
    const tiene = de === "local" ? n(row.envases_cerrados) : n(row.bodega_cerrados);
    if (n(it.envases) > tiene) return { error: s(it.codigo) + ": stock insuficiente" };
    plan.push({ row, n: n(it.envases) });
  }
  for (const step of plan) {
    const loc = n(step.row.envases_cerrados) + (de === "local" ? -step.n : step.n);
    const bod = n(step.row.bodega_cerrados) + (de === "bodega" ? -step.n : step.n);
    const stock = (loc + bod + n(step.row.abierto_restante)) * (n(step.row.contenido_envase) || 0);
    await ctx.db.write(actorOf(ses), "cabina_inventario", "update", { sheet_row: step.row.sheet_row }, { envases_cerrados: loc, bodega_cerrados: bod, stock_total: stock });
  }
  const sr = await nextSheet(ctx.db, "cabina_traspasos");
  const num = "TR-" + String(sr).padStart(3, "0");
  await ctx.db.write(actorOf(ses), "cabina_traspasos", "insert", {}, {
    sheet_row: sr, col_1: num, fecha: ecuadorParts(ctx.now).isoWall, de_a: de + "→" + (de === "local" ? "bodega" : "local"),
    items: JSON.stringify(items), por: ses.name, orig: { num },
  });
  return { ok: true, num };
});

extend("cabinaBaja", ADMIN, async (p, ctx, ses) => {
  if (!s(p.razon)) return { error: "La baja necesita una razón" };
  const tipo = s(p.tipo || "producto");
  const table = tipo === "activo" ? "cabina_activos" : "cabina_inventario";
  const rows = await ctx.db.all(table);
  const row = rows.find((r) => s(r.codigo) === s(p.codigo)) || (n(p.row) ? await rowBySheet(ctx.db, table, n(p.row)) : null);
  if (!row) return { error: "No encontrado" };
  const cant = n(p.cantidad) || 1;
  if (tipo === "activo") {
    await ctx.db.write(actorOf(ses), table, "update", { sheet_row: row.sheet_row }, { estado: "DADO DE BAJA", cantidad: Math.max(0, n(row.cantidad) - cant) });
  } else {
    const loc = Math.max(0, n(row.envases_cerrados) - cant);
    await ctx.db.write(actorOf(ses), table, "update", { sheet_row: row.sheet_row }, { envases_cerrados: loc });
  }
  const sr = await nextSheet(ctx.db, "cabina_bajas");
  const num = "BJ-" + String(sr).padStart(3, "0");
  await ctx.db.write(actorOf(ses), "cabina_bajas", "insert", {}, {
    sheet_row: sr, num, fecha: ecuadorParts(ctx.now).stamp, tipo, codigo: s(p.codigo), nombre: s(row.producto || row.activo),
    cantidad: String(cant), razon: s(p.razon), por: ses.name, foto: s(p.foto), orig: { num },
  });
  return { ok: true, num };
});

extend("cabinaSaveProducto", ADMIN, async (p, ctx, ses) => saveCab(ctx, ses, "cabina_inventario", p, {
  codigo: s(p.codigo), producto: s(p.producto || p.nombre), proveedor: s(p.proveedor), contenido_envase: n(p.contenido),
  unidad: s(p.unidad), costo_envase: n(p.costoEnvase), costo_por_unidad: n(p.costoUnidad), envases_cerrados: n(p.cerrados),
  abierto_restante: n(p.abierto), minimo_envases: n(p.minimo), notas: s(p.notas), activo: s(p.activo) || "SI",
  sku_catalogo: s(p.skuCat), bodega_cerrados: n(p.bodega), esterilizable: s(p.esterilizable),
}));
extend("cabinaSaveActivo", ADMIN, async (p, ctx, ses) => saveCab(ctx, ses, "cabina_activos", p, {
  codigo: s(p.codigo), activo: s(p.nombre || p.activo), categoria: s(p.categoria), cantidad: n(p.local ?? p.cantidad),
  cantidad_bodega: n(p.bodega), unidad: s(p.unidad), ubicacion: s(p.ubicacion), estado: s(p.estado) || "ACTIVO",
  costo: n(p.costo), notas: s(p.notas), proveedor: s(p.proveedor),
}));
extend("cabinaProductoActivo", ADMIN, async (p, ctx, ses) => {
  const row = await rowBySheet(ctx.db, "cabina_inventario", n(p.row));
  if (!row) return { error: "No encontrado" };
  await ctx.db.write(actorOf(ses), "cabina_inventario", "update", { sheet_row: row.sheet_row }, { activo: p.activo ? "SI" : "NO" });
  return { ok: true };
});
async function saveCab(ctx: Ctx, ses: Ses, table: string, p: R, fields: R): Promise<R> {
  const actor = actorOf(ses);
  if (!s(fields.codigo) && !n(p.row)) return { error: "Falta el código" };
  fields.orig = { codigo: fields.codigo };
  if (n(p.row)) {
    await ctx.db.write(actor, table, "update", { sheet_row: n(p.row) }, fields);
    return { ok: true, row: n(p.row) };
  }
  const rows = await ctx.db.all(table);
  const max = rows.reduce((m, r) => Math.max(m, n(String(r.codigo).replace(/\D/g, ""))), 0);
  if (!s(fields.codigo)) fields.codigo = (table.includes("activo") ? "AC-" : "INV-") + String(max + 1).padStart(3, "0");
  const sheet_row = await nextSheet(ctx.db, table);
  await ctx.db.write(actor, table, "insert", {}, { ...fields, sheet_row });
  return { ok: true, row: sheet_row, codigo: fields.codigo };
}

extend("cabinaSaveProtocolo", ADMIN, async (p, ctx, ses) => {
  const rows = await ctx.db.all("cabina_protocolos");
  const prev = rows.filter((r) => s(r.sku) === s(p.sku));
  const ver = (prev.reduce((m, r) => Math.max(m, n(r.version)), 0) || 0) + 1;
  for (const r of prev) if (s(r.vigente).toUpperCase() !== "NO") {
    await ctx.db.write(actorOf(ses), "cabina_protocolos", "update", { sheet_row: r.sheet_row }, { vigente: "NO" });
  }
  const sr = await nextSheet(ctx.db, "cabina_protocolos");
  await ctx.db.write(actorOf(ses), "cabina_protocolos", "insert", {}, {
    sheet_row: sr, sku: s(p.sku), facial: s(p.nombre), version: ver, vigente: "SI", mano_de_obra: n(p.mo),
    video: s(p.video), notas: s(p.notas), por: ses.name, actualizado: ecuadorParts(ctx.now).isoWall, orig: { sku: s(p.sku), version: ver },
  });
  let paso = 1;
  for (const it of (p.pasos as R[]) || []) {
    const pr = await nextSheet(ctx.db, "cabina_protocolo_pasos");
    await ctx.db.write(actorOf(ses), "cabina_protocolo_pasos", "insert", {}, {
      sheet_row: pr, sku: s(p.sku), version: ver, paso: paso++, descripcion: s(it.descripcion || it.texto),
      producto_cod: s(it.producto || it.productoCod), cantidad: n(it.cantidad), unidad: s(it.unidad), minutos: n(it.minutos),
      orig: { sku: s(p.sku) },
    });
  }
  return { ok: true, version: ver };
});
extend("cabinaBorrarFila", ADMIN, async (p, ctx, ses) => {
  const hoja = s(p.hoja);
  const table = hoja.includes("PASO") ? "cabina_protocolo_pasos" : hoja.includes("PROTO") ? "cabina_protocolos" : "";
  if (!table) return { error: "Hoja no borrable desde la beta" };
  const row = await rowBySheet(ctx.db, table, n(p.row));
  if (!row) return { error: "Fila no encontrada" };
  await ctx.db.write(actorOf(ses), table, "delete", { sheet_row: row.sheet_row }, null);
  return { ok: true };
});
extend("cabinaFoto", ADMIN, async (p, ctx, ses) => {
  const urlIn = s(p.url);
  let url = urlIn;
  if (!url && s(p.dataB64 || p.imagen).includes("base64,")) {
    const id = await guardarArchivo(ctx.db, actorOf(ses), "cabina", s(p.codigo), s(p.dataB64 || p.imagen));
    if (!id) return { error: "No se pudo guardar la foto (límite 1.5 MB). Drive no está conectado." };
    url = "archivo:" + id;
  }
  if (!url) return { error: "La beta no sube a Drive. Pasa una URL o una imagen pequeña." };
  const fotos = await kvGet(ctx.db, "CABINA_FOTOS");
  fotos[s(p.codigo)] = url;
  await kvSet(ctx.db, actorOf(ses), "CABINA_FOTOS", fotos);
  await espejo(ctx.db, actorOf(ses), "cabina_fotos", { codigo: s(p.codigo), url, por: ses.name });
  return { ok: true, url };
});
extend("cabinaOCGuardar", ADMIN, async (p, ctx, ses) => {
  const items = (p.items as R[]) || [];
  if (!items.length) return { error: "Sin ítems" };
  const sr = await nextSheet(ctx.db, "cabina_ordenes");
  const num = "CO-" + String(sr).padStart(3, "0");
  const total = items.reduce((a, it) => a + n(it.costo || it.total) * (n(it.cant) || 1), 0);
  await ctx.db.write(actorOf(ses), "cabina_ordenes", "insert", {}, {
    sheet_row: sr, num, fecha: ecuadorParts(ctx.now).stamp, proveedor: s(p.proveedor), items: JSON.stringify(items),
    estado: "PENDIENTE", total, por: ses.name, orig: { num },
  });
  return { ok: true, num };
});
extend("cabinaOCRecibir", ADMIN, async (p, ctx, ses) => {
  const row = await rowBySheet(ctx.db, "cabina_ordenes", n(p.row));
  if (!row) return { error: "Orden no encontrada" };
  if (s(row.estado).toUpperCase().startsWith("RECIB")) return { error: "Ya está recibida" };
  const destino = s(p.destino).toLowerCase() === "bodega" ? "bodega" : "local";
  const items = parseJson(row.items) as R[];
  const inv = await ctx.db.all("cabina_inventario");
  for (const it of items) {
    const prod = inv.find((r) => s(r.codigo) === s(it.codigo));
    if (!prod) continue;
    const cant = n(it.cant || it.envases);
    const patch: R = destino === "bodega"
      ? { bodega_cerrados: n(prod.bodega_cerrados) + cant }
      : { envases_cerrados: n(prod.envases_cerrados) + cant };
    if (n(it.costo)) patch.costo_envase = n(it.costo);
    const loc = n(patch.envases_cerrados ?? prod.envases_cerrados);
    const bod = n(patch.bodega_cerrados ?? prod.bodega_cerrados);
    patch.stock_total = (loc + bod + n(prod.abierto_restante)) * (n(prod.contenido_envase) || 0);
    await ctx.db.write(actorOf(ses), "cabina_inventario", "update", { sheet_row: prod.sheet_row }, patch);
  }
  await ctx.db.write(actorOf(ses), "cabina_ordenes", "update", { sheet_row: row.sheet_row }, {
    estado: "RECIBIDA " + destino.toUpperCase(), recibida: ecuadorParts(ctx.now).stamp, recibida_por: ses.name,
  });
  return { ok: true };
});
extend("cabinaFijosGuardar", ADMIN, async (p, ctx, ses) => {
  await kvSet(ctx.db, actorOf(ses), "CABINA_FIJOS", { items: p.items || [] });
  return { ok: true };
});
extend("cabinaManoObraSugerida", "any", async (_p, ctx) => {
  const hist = await ctx.db.all("rrhh_historial");
  const tks = await ctx.db.all("tickets");
  const mes = ecuadorParts(ctx.now).ymd.slice(0, 7);
  const fac = tks.filter((t) => ymdUtc(t.timestamp).startsWith(mes) && facialSku(s(t.facial_hecho)) && !esInterno(t.atendido_por, t.id_3)).length;
  const costo = hist.filter((r) => s(r.mes) && s(r.ano) && (s(r.ano) + "-" + s(r.mes)).includes(mes.slice(0, 4))).reduce((a, r) => a + n(r.costo_empresa), 0);
  return { sugerida: fac ? round2(costo / fac) : 0, faciales: fac, costo, parcial: true, nota: "Prorrateo con el historial RRHH cargado. Jibble no está conectado." };
});
extend("cabinaCrearEstructura", ADMIN, async (_p, ctx) => {
  const nInv = (await ctx.db.all("cabina_inventario")).length;
  if (nInv) return { error: "La estructura ya existe" };
  return { ok: true, beta: true, nota: "En la beta las tablas de cabina ya están creadas. No se crea un Google Sheet." };
});
extend("cabinaResembrar", ADMIN, async () => ({ error: "Resembrar desde el Excel no está en la beta.", parcial: true }));
extend("cabinaConvertir", ADMIN, async (p, ctx, ses) => {
  const row = (await ctx.db.all("cabina_inventario")).find((r) => s(r.codigo) === s(p.codigo));
  if (!row) return { error: "No encontrado" };
  const pasos = await ctx.db.all("cabina_protocolo_pasos");
  if (pasos.some((x) => s(x.producto_cod) === s(row.codigo))) return { error: "Un protocolo vigente lo usa: no se convierte" };
  return { ok: true, nota: "Conversión registrada solo como aviso en beta: " + s(p.de), convertido: false, parcial: true };
});
extend("fase2Espejo", ADMIN, async (p, ctx, ses) => {
  const dias = n(p.dias) || 1;
  const desde = addDays(ecuadorParts(ctx.now).ymd, -dias);
  const protos = (await ctx.db.all("cabina_protocolos")).filter((r) => s(r.vigente).toUpperCase() !== "NO");
  const pasos = await ctx.db.all("cabina_protocolo_pasos");
  const ya = new Set((await ctx.db.all("cabina_consumos")).map((r) => s(r.tk) + "|" + s(r.producto_cod)));
  let nIns = 0;
  for (const t of await ctx.db.all("tickets")) {
    const f = ymdUtc(t.timestamp);
    if (!f || f < desde) continue;
    const sku = facialSku(s(t.facial_hecho));
    if (!sku) continue;
    const proto = protos.find((r) => s(r.sku) === sku);
    if (!proto) continue;
    for (const paso of pasos.filter((x) => s(x.sku) === sku && n(x.version) === n(proto.version))) {
      const key = s(t.sheet_row) + "|" + s(paso.producto_cod);
      if (ya.has(key)) continue;
      const sr = await nextSheet(ctx.db, "cabina_consumos");
      await ctx.db.write(actorOf(ses), "cabina_consumos", "insert", {}, {
        sheet_row: sr, fecha: t.timestamp, tk: t.timestamp, sku_facial: sku, version: String(proto.version),
        producto_cod: s(paso.producto_cod), cantidad: String(paso.cantidad), unidad: s(paso.unidad),
        col_11: "ESPEJO", orig: { modo: "ESPEJO", ticket: t.sheet_row },
      });
      ya.add(key); nIns++;
    }
  }
  return { ok: true, insertados: nIns, nota: "Modo espejo: no descuenta stock." };
});

extend("getBitacora", "any", async (_p, ctx) => {
  const inv = await ctx.db.all("cabina_inventario");
  const items = (await ctx.db.all("cabina_bitacora")).map((r) => ({
    id: s(r.id_1), ts: s(r.timestamp), usuario: s(r.usuario), items: s(r.items),
    paso1: s(r.paso1_ok), paso2Opcion: s(r.paso2_opcion), paso2: s(r.paso2_ok), paso3: s(r.paso3_ok),
    resultado: s(r.resultado), observacion: s(r.observacion_texto), estado: s(r.estado) || "OK",
    motivo: s(r.motivo_anulacion), anuladoPor: s(r.anulado_por), reemplazo: s(r.registro_reemplazo_id),
    row: r.sheet_row,
  })).reverse();
  const esterilizables = inv.filter((r) => s(r.esterilizable).toUpperCase().startsWith("S") && s(r.activo).toUpperCase() !== "NO").map((r) => ({
    codigo: s(r.codigo), producto: s(r.producto),
  }));
  return { items, esterilizables };
});
extend("bitacoraCrear", "any", async (p, ctx, ses) => {
  const v = validarBitacora(p);
  if ("error" in v) return v;
  const inv = await ctx.db.all("cabina_inventario");
  for (const it of v.items) {
    const row = inv.find((r) => s(r.codigo).toUpperCase() === it.codigo.toUpperCase());
    if (!row || !s(row.esterilizable).toUpperCase().startsWith("S")) return { error: it.codigo + " no es esterilizable" };
    if (s(row.activo).toUpperCase() === "NO") return { error: it.codigo + " está inactivo" };
  }
  const sr = await nextSheet(ctx.db, "cabina_bitacora");
  const id = "BE-" + String(sr).padStart(4, "0");
  await ctx.db.write(actorOf(ses), "cabina_bitacora", "insert", {}, {
    sheet_row: sr, id_1: id, timestamp: ecuadorParts(ctx.now).stamp, usuario: ses.name,
    items: JSON.stringify(v.items), paso1_ok: "SI", paso2_opcion: v.paso2, paso2_ok: "SI", paso3_ok: "SI",
    resultado: v.resultado, observacion_texto: v.observacion, estado: "OK", orig: { id },
  });
  return { ok: true, id };
});
extend("bitacoraAnular", ADMIN, async (p, ctx, ses) => {
  if (!s(p.motivo)) return { error: "El motivo es obligatorio" };
  const rows = await ctx.db.all("cabina_bitacora");
  const row = rows.find((r) => s(r.id_1) === s(p.id));
  if (!row) return { error: "Registro no encontrado" };
  if (s(row.estado).toUpperCase() === "ANULADO") return { error: "Ya está anulado" };
  await ctx.db.write(actorOf(ses), "cabina_bitacora", "update", { sheet_row: row.sheet_row }, {
    estado: "ANULADO", motivo_anulacion: s(p.motivo), anulado_por: ses.name, anulado_ts: ecuadorParts(ctx.now).stamp,
    registro_reemplazo_id: s(p.reemplazoId),
  });
  return { ok: true };
});
extend("bitacoraMarcarEsterilizable", ADMIN, async (p, ctx, ses) => {
  const rows = await ctx.db.all("cabina_inventario");
  const row = rows.find((r) => s(r.codigo).toUpperCase() === s(p.codigo).toUpperCase());
  if (!row) return { error: "Producto no encontrado" };
  await ctx.db.write(actorOf(ses), "cabina_inventario", "update", { sheet_row: row.sheet_row }, { esterilizable: s(p.esterilizable) || "Sí" });
  return { ok: true };
});

async function acuity(ctx: Ctx, path: string, init: RequestInit = {}): Promise<{ ok: true; data: unknown } | { error: string }> {
  const uid = ctx.env.ACUITY_UID, key = ctx.env.ACUITY_KEY;
  if (!uid || !key) return { error: "Acuity no está configurado en la beta (secretos ACUITY_UID y ACUITY_KEY)." };
  const res = await ctx.fetchImpl("https://acuityscheduling.com/api/v1/" + path, {
    ...init,
    headers: { Authorization: "Basic " + btoa(uid + ":" + key), "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  try { return { ok: true, data: JSON.parse(text) }; } catch { return { error: "Acuity respondió " + res.status }; }
}
extend("getCitas", "any", async (p, ctx) => {
  const off = s(p.dia) === "ayer" ? -1 : s(p.dia) === "manana" ? 1 : 0;
  const f = addDays(ecuadorParts(ctx.now).ymd, off);
  const r = await acuity(ctx, `appointments?minDate=${f}T00:00:00&maxDate=${f}T23:59:59&max=100`);
  if ("error" in r) return [];
  const arr = Array.isArray(r.data) ? r.data : [];
  return arr;
});
extend("marcarEtiquetaAcuity", "any", async (p, ctx, ses) => {
  const r = await acuity(ctx, "appointments/" + encodeURIComponent(s(p.aptId)), { method: "PUT", body: JSON.stringify({ labels: [{ name: s(p.etiqueta) }] }) });
  if ("error" in r) return r;
  await logAccion(ctx.db, actorOf(ses), "ACUITY", s(p.etiqueta) + " " + s(p.aptId));
  return { ok: true };
});
extend("cancelarCitaAcuity", "any", async (p, ctx, ses) => {
  const r = await acuity(ctx, "appointments/" + encodeURIComponent(s(p.aptId)) + "/cancel", { method: "PUT", body: JSON.stringify({ cancelNote: s(p.detalle) }) });
  if ("error" in r) return r;
  await logAccion(ctx.db, actorOf(ses), "ACUITY CANCEL", s(p.aptId));
  return { ok: true };
});
extend("refrescarTelefonos", "any", async () => ({ ok: true, nota: "Los teléfonos salen de REGISTRO. Acuity solo si ACUITY_UID/KEY están en el entorno.", parcial: true }));
extend("buscarCliente", "any", async (p, ctx) => {
  const { handle } = await import("./handlers.ts");
  return handle("getRegistro", p, ctx);
});
extend("testDiasJibble", "any", async (p, ctx, ses) => {
  const id = ctx.env.JIBBLE_CLIENT_ID;
  const secret = ctx.env.JIBBLE_CLIENT_SECRET;
  if (!id || !secret) return { ok: false, error: "Jibble no está configurado (JIBBLE_CLIENT_ID / JIBBLE_CLIENT_SECRET).", parcial: true };
  const nombre = s(p.nombre) || ses.name;
  if (acceso(ses.rol, "asistencia", await matrizDe(ctx.db)) === "propio" && !esPropio(nombre, ses)) {
    return { error: "No tienes permiso para ver la asistencia de otra persona" };
  }
  const tokRes = await ctx.fetchImpl("https://identity.prod.jibble.io/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&client_id=" + encodeURIComponent(id) + "&client_secret=" + encodeURIComponent(secret),
  });
  const tok = await tokRes.json() as R;
  if (!tokRes.ok || !tok.access_token) return { ok: false, error: "Jibble rechazó las credenciales", parcial: true };
  const peopleRes = await ctx.fetchImpl("https://time-tracking.prod.jibble.io/v1/People?$top=20&$filter=contains(fullName,'" + encodeURIComponent(nombre.split(" ")[0] || nombre) + "')", {
    headers: { Authorization: "Bearer " + s(tok.access_token) },
  });
  const people = await peopleRes.json() as R;
  const lista = (people.value as R[]) || [];
  const person = lista.find((x) => s(x.fullName).toLowerCase().includes((nombre.split(" ")[0] || "").toLowerCase())) || null;
  return { ok: true, nombre, persona: person ? s(person.fullName) : null, encontrados: lista.map((x) => s(x.fullName)) };
});
extend("getSheetUrl", "any", async () => ({ url: "", nota: "La beta no abre el Google Sheet. Los datos están en Supabase." }));

extend("getEnviosTarjetas", "any", async (_p, ctx) => ({
  envios: (await ctx.db.all("envios_tarjetas")).slice(-400).map((r) => ({
    f: s(r.fecha_envio), clienta: s(r.clienta), cedula: s(r.cedula), telefono: s(r.telefono),
    que: s(r.que_se_envio), fTicket: s(r.fecha_del_ticket), por: s(r.enviado_por),
  })).reverse(),
}));
extend("getHistorialEnvios", "any", async (p, ctx, ses) => {
  const base = await (await import("./handlers.ts")).handle("getEnviosTarjetas", p, ctx);
  return { items: (base as R).envios || [] };
});
extend("getTarjetasInfo", "any", async () => ({ ok: true, nota: "Las tarjetas se arman en el navegador con el historial." }));
extend("marcarTarjetaEnviada", "any", async (p, ctx, ses) => {
  const sr = await nextSheet(ctx.db, "envios_tarjetas");
  await ctx.db.write(actorOf(ses), "envios_tarjetas", "insert", {}, {
    sheet_row: sr, fecha_envio: ecuadorParts(ctx.now).isoWall, clienta: s(p.clienta || p.nombre), cedula: s(p.cedula),
    telefono: conTelefono(ses) ? s(p.telefono) : "", que_se_envio: s(p.que || p.tipo), fecha_del_ticket: s(p.fechaTicket),
    enviado_por: ses.name, clave: s(p.clave), orig: { clave: s(p.clave) },
  });
  await espejo(ctx.db, actorOf(ses), "tarjetas_enviadas", {
    clienta: s(p.clienta || p.nombre), cedula: s(p.cedula), que: s(p.que || p.tipo), clave: s(p.clave), por: ses.name,
  });
  return { ok: true };
});

extend("betaTablas", ADMIN, async () => ({ tablas: BETA_TABLES }));
extend("betaFilas", ADMIN, async (p, ctx) => {
  const table = s(p.tabla);
  if (!(BETA_TABLES as readonly string[]).includes(table)) return { error: "Tabla no editable desde la beta" };
  const q = s(p.q).toLowerCase();
  let rows = await ctx.db.all(table);
  rows.sort((a, b) => n(b.sheet_row) - n(a.sheet_row));
  if (q) rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  const limit = Math.min(80, n(p.limit) || 40);
  return { filas: rows.slice(0, limit).map(slim) };
});
function slim(r: R): R {
  const o: R = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === "orig" || k === "data_b64" || k === "pin" || k === "pin_hash" || k === "pin_salt") continue;
    if (typeof v === "string" && v.length > 180) o[k] = v.slice(0, 180) + "…";
    else o[k] = v;
  }
  return o;
}
extend("betaGuardar", ADMIN, async (p, ctx, ses) => {
  const table = s(p.tabla);
  if (!(BETA_TABLES as readonly string[]).includes(table)) return { error: "Tabla no editable" };
  const campos = (p.campos || {}) as R;
  delete campos.id; delete campos.orig;
  if (n(p.sheet_row)) {
    await ctx.db.write(actorOf(ses), table, "update", { sheet_row: n(p.sheet_row) }, campos);
    await logAccion(ctx.db, actorOf(ses), "BETA EDITAR", table + " fila " + n(p.sheet_row));
    return { ok: true };
  }
  const sheet_row = await nextSheet(ctx.db, table);
  await ctx.db.write(actorOf(ses), table, "insert", {}, { ...campos, sheet_row, orig: { beta: true } });
  return { ok: true, sheet_row };
});
extend("betaEliminar", ADMIN, async (p, ctx, ses) => {
  const table = s(p.tabla);
  if (!(BETA_TABLES as readonly string[]).includes(table)) return { error: "Tabla no editable" };
  await ctx.db.write(actorOf(ses), table, "delete", { sheet_row: n(p.sheet_row) }, null);
  await logAccion(ctx.db, actorOf(ses), "BETA ELIMINAR", table + " fila " + n(p.sheet_row));
  return { ok: true };
});
extend("betaMover", ADMIN, async (p, ctx, ses) => {
  const table = s(p.tabla);
  if (!(BETA_TABLES as readonly string[]).includes(table)) return { error: "Tabla no editable" };
  const from = n(p.sheet_row), to = n(p.destino);
  if (!from || !to || from === to) return { error: "Destino inválido" };
  const a = await rowBySheet(ctx.db, table, from);
  if (!a) return { error: "Fila no encontrada" };
  const bRow = await rowBySheet(ctx.db, table, to);
  const actor = actorOf(ses);
  if (bRow) {
    await ctx.db.write(actor, table, "update", { sheet_row: from }, { sheet_row: -1 });
    await ctx.db.write(actor, table, "update", { sheet_row: to }, { sheet_row: from });
    await ctx.db.write(actor, table, "update", { sheet_row: -1 }, { sheet_row: to });
  } else {
    await ctx.db.write(actor, table, "update", { sheet_row: from }, { sheet_row: to });
  }
  await logAccion(ctx.db, actor, "BETA MOVER", table + " " + from + " → " + to);
  return { ok: true, sheet_row: to };
});
