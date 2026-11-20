/** TK153: resolver WhatsApp en el servidor sin exponer el número al staff. */
import { n, normCedula, normNombre, s, telefonoEc, type Row } from "./domain.ts";
import { conTelefono, actorOf, nextSheet, type Ctx } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { consultar } from "./query.ts";
import { extend } from "./handlers.ts";
import { claveDe } from "./ticket_beta.ts";
import { leerSerie } from "./series.ts";
import {
  WA_TPL_ALIAS, WA_TPL_DEFS, digitosWa, filtrarTipos, mensajeDe, mezclarPlantillas,
  respuestaWa, telefonoDeFuentes, tiposDeTicket,
} from "./wa_lib.ts";

async function buscarTelCliente(ctx: Ctx, ced: string, nombre: string, codigo: string): Promise<string> {
  const cedN = normCedula(ced);
  const nomN = normNombre(nombre);
  const partes: unknown[] = [];
  try {
    if (codigo) {
      const fr = (await consultar(ctx.db, "beta_clientes", { cols: ["key", "datos", "codigo", "telefono", "cedula", "nombre"], filtros: [{ col: "codigo", op: "eq", val: codigo }], limite: 2 })).rows[0];
      if (fr) partes.push(fr);
    }
    if (cedN) {
      const rows = (await consultar(ctx.db, "beta_clientes", { cols: ["key", "datos", "codigo", "telefono", "cedula", "nombre"], limite: 4000 })).rows
        .filter((x) => normCedula(x.cedula) === cedN || normCedula((x.datos as Row | undefined)?.cedula) === cedN);
      partes.push(...rows);
    }
  } catch { /* sin beta_clientes */ }
  try {
    if (cedN) {
      const regs = (await consultar(ctx.db, "clientas_registro", { cols: ["cedula", "telefono"], limite: 4000 })).rows
        .filter((x) => normCedula(x.cedula) === cedN);
      partes.push(...regs);
    }
  } catch { /* */ }
  try {
    const ants = await ctx.db.all("clientas_antiguas");
    const porCed = cedN ? ants.filter((x) => normCedula(x.cedula) === cedN) : [];
    if (porCed.length) partes.push(...porCed);
    else if (nomN) {
      const porNom = ants.filter((x) => normNombre(x.nombre) === nomN);
      if (porNom.length === 1) partes.push(porNom[0]);
    }
  } catch { /* */ }
  try {
    const erp = await ctx.db.all("erp_clientes");
    const porCed = cedN ? erp.filter((x) => normCedula(x.cedula || x.ci) === cedN) : [];
    if (porCed.length) partes.push(...porCed);
    else if (nomN) {
      const porNom = erp.filter((x) => normNombre(x.nombre || ((s(x.nombres) + " " + s(x.apellido)).trim())) === nomN);
      if (porNom.length === 1) partes.push(porNom[0]);
    }
  } catch { /* */ }
  return telefonoDeFuentes(partes);
}

async function cfgMsgs(ctx: Ctx): Promise<Record<string, string>> {
  const rows = await ctx.db.all("configuracion");
  const m = new Map<string, string>();
  for (const r of rows) {
    const k = s(r.col_1).toUpperCase();
    if (k) m.set(k, s(r.col_2));
  }
  return mezclarPlantillas(m);
}

async function ticketPorRef(ctx: Ctx, p: Row): Promise<Row | null> {
  const clave = s(p.ticket_clave || p.clave);
  const id = n(p.ticket_id || p.id);
  const so = s(p.so_num);
  const rows = await ctx.db.all("tickets");
  return rows.find((r) => {
    if (r.borrado_at) return false;
    if (clave && (claveDe(r, leerSerie(r, "so_num")) === clave || leerSerie(r, "so_num") === clave || s(r.beta_num) === clave)) return true;
    if (id && n(r.id) === id) return true;
    if (so && (leerSerie(r, "so_num") === so || s(r.so_num) === so)) return true;
    return false;
  }) || null;
}

// TK155: respuestaWa vive en wa_lib.ts (la copia local usaba digitosWa sin importar → «digitosWa is not defined»).

extend("wa_preparar", "any", async (p, ctx, ses) => {
  const modo = s(p.tipo).toLowerCase();
  const pedido = Array.isArray(p.tipos) ? p.tipos as string[] : (p.tipo ? [s(p.tipo)] : []);
  const plantillas = await cfgMsgs(ctx);
  let ced = "", nombre = "", codigo = "", facial = "", paquete = "", giftcard = "", fecha = "", usados: number | undefined, total: number | undefined, pend: number | undefined;
  let tipos: string[] = [];
  let tel = "";

  if (s(p.gc_codigo) && (modo === "giftcard" || !s(p.ticket_clave) && !n(p.ticket_id))) {
    const gc = (await ctx.db.all("gift_cards")).find((g) => !g.borrado_at && s(g.codigo_gc) === s(p.gc_codigo));
    if (!gc) return { error: "Gift card no encontrada" };
    ced = s(gc.cedula_comprador || gc.cedula_beneficiario);
    nombre = s(gc.nombre_beneficiario || gc.nombre_comprador);
    giftcard = s(gc.codigo_gc);
    tipos = ["giftcard"];
    tel = telefonoDeFuentes([gc, { telefono: gc.telefono }]);
    if (!tel) tel = await buscarTelCliente(ctx, ced, nombre, "");
  } else if (s(p.cliente_id) || s(p.cliente_key) || s(p.cliente_codigo)) {
    const key = s(p.cliente_id || p.cliente_key || p.cliente_codigo);
    try {
      const fr = (await consultar(ctx.db, "beta_clientes", { limite: 4000 })).rows
        .find((x) => s(x.key) === key || s(x.codigo) === key || s(x.id) === key);
      if (fr) {
        codigo = s(fr.codigo);
        ced = s(fr.cedula) || s((fr.datos as Row | undefined)?.cedula);
        nombre = s(fr.nombre) || ((s((fr.datos as Row | undefined)?.nombres) + " " + s((fr.datos as Row | undefined)?.apellido)).trim());
        tel = telefonoDeFuentes([fr]);
      }
    } catch { /* */ }
    if (!tel) tel = await buscarTelCliente(ctx, ced, nombre, codigo);
    tipos = modo === "recordatorio" || modo === "chat" ? [] : filtrarTipos(["facial", "paquete", "giftcard"], pedido);
  } else {
    const r = await ticketPorRef(ctx, p);
    if (!r) return { error: "Ticket no encontrado" };
    const clave = claveDe(r, leerSerie(r, "so_num"));
    const cab = (await ctx.db.all("beta_tickets")).find((c) => s(c.clave) === clave);
    const d = (cab?.datos && typeof cab.datos === "object" ? cab.datos : {}) as Row;
    ced = s(d.cedula || r.id_3);
    nombre = s(d.nombre || r.nombre) + (s(d.apellido || r.apellido) ? " " + s(d.apellido || r.apellido) : "");
    codigo = s((r.orig as Row | undefined)?.cliente_codigo);
    fecha = s(r.timestamp).slice(0, 10);
    facial = s(r.facial_hecho);
    const paqs = { uso: /^\s*SI\b/i.test(s(r.paquete)) ? s(r.paquete).replace(/^\s*SI,?\s*/i, "") : "", compra: [s(r.compra_pack_3), s(r.compra_pack_6)].filter((x) => x && x !== "-").join(" · "), vigentes: [] as Row[], delTicket: [] as Row[] };
    try {
      const { paquetesDe, paquetesDelTicket } = await import("./ventas.ts");
      const lista = await paquetesDe(ctx.db, normCedula(ced), normNombre(nombre));
      paqs.vigentes = lista.filter((x) => n(x.pendientes) > 0);
      paqs.delTicket = paquetesDelTicket(lista, r, clave);
      const ref = paqs.delTicket[0] || paqs.vigentes[0];
      if (ref) {
        paquete = s(ref.codigo || ref.nombre);
        usados = n(ref.usados);
        total = n(ref.total);
        pend = n(ref.pendientes);
      }
    } catch {
      paquete = paqs.uso || paqs.compra;
    }
    const venta = s(r.venta_gift || r.gift_card);
    if (venta && !/^(no|-|0|SI,)/i.test(venta.trim()) || /SI/i.test(s(r.gift_card))) giftcard = venta || "Gift card";
    tipos = tiposDeTicket({
      facial_hecho: r.facial_hecho,
      recomendaciones: r.recomendaciones || d.recomendaciones,
      lineas: Array.isArray(cab?.lineas) ? cab!.lineas as { tipo?: string }[] : undefined,
      paqueteInfo: paqs,
      venta_gift: r.venta_gift,
      gift_card: r.gift_card,
    });
    if (modo !== "chat" && modo !== "recordatorio") tipos = filtrarTipos(tipos.length ? tipos : ["facial"], pedido);
    tel = telefonoDeFuentes([{ telefono: d.telefono }]);
    if (!tel) tel = await buscarTelCliente(ctx, ced, nombre, codigo);
  }

  const msg = mensajeDe(tipos, plantillas, {
    cliente: nombre, nombre: s(nombre).split(" ")[0], facial, paquete, giftcard, fecha,
    usados, total, pend, atrasada: s(p.atrasada),
    sesiones: usados != null && total != null ? usados + "/" + total : "",
  }, modo === "chat" || modo === "recordatorio" ? modo : undefined);

  // Nunca devolvemos el número suelto: solo wa_url / texto / tiene_tel.
  const out = respuestaWa({ digitos: tel, texto: msg.texto, tipos, tipoMensaje: msg.tipoMensaje });
  if (conTelefono(ses) && tel) (out as Row).telefono = telefonoEc(tel);
  return out;
});

extend("wa_plantillas_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración edita los mensajes de WhatsApp" };
  const msgs = (p.msgs && typeof p.msgs === "object") ? p.msgs as Row : p;
  const permitidas = new Set<string>([
    ...Object.values(WA_TPL_DEFS).map((x) => x.clave),
    ...Object.keys(WA_TPL_ALIAS),
    "MENSAJE TARJETA SALUDO",
    "MENSAJE TARJETA PAQUETE COMPLETO",
    "MENSAJE ATRASADAS",
    "MENSAJE PRÓXIMAS",
    "MENSAJE CUMPLEAÑOS",
    "MENSAJE CLIENTAS ANTIGUAS",
    "MENSAJE CONFIRMACION CITA",
    "MENSAJE REGISTRO PRIMERA VISITA",
    "MENSAJE PAQUETE DIGITAL PENDIENTE",
    "MENSAJE PAQUETE DIGITAL COMPLETO",
    "MENSAJE PAQUETE CONTROL",
    "LINK REGISTRO",
  ]);
  const rows = await ctx.db.all("configuracion");
  const porK = new Map<string, Row>();
  for (const r of rows) {
    const k = s(r.col_1).toUpperCase();
    if (k) porK.set(k, r);
  }
  let nOk = 0;
  for (const [kRaw, v] of Object.entries(msgs)) {
    const k = s(kRaw).toUpperCase();
    if (!permitidas.has(k) && !permitidas.has(s(kRaw))) continue;
    const clave = permitidas.has(k) ? k : s(kRaw);
    const val = s(v).slice(0, 2000);
    const hit = porK.get(clave);
    if (hit) {
      await ctx.db.write(actorOf(ses), "configuracion", "update", hit.id != null ? { id: hit.id } : { sheet_row: hit.sheet_row }, { col_2: val, orig: { ...(hit.orig && typeof hit.orig === "object" ? hit.orig as Row : {}), col_1: clave, col_2: val } });
    } else {
      const sheet_row = await nextSheet(ctx.db, "configuracion");
      await ctx.db.write(actorOf(ses), "configuracion", "insert", {}, { sheet_row, col_1: clave, col_2: val, orig: { col_1: clave, col_2: val } });
    }
    nOk++;
  }
  return { ok: true, guardados: nOk, msgs: await cfgMsgs(ctx) };
});

