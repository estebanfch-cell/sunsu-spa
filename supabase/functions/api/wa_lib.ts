/** TK153: plantillas y armado de WhatsApp (sin I/O). */
import { n, s, type Row } from "./domain.ts";
import { hayTel, telOk } from "./clientes_contacto.ts";

export const WA_TPL_DEFS: Record<string, { clave: string; def: string; vars: string }> = {
  facial: {
    clave: "MENSAJE TARJETA TRATAMIENTO",
    def: "Te compartimos la tarjeta de tu tratamiento con las recomendaciones para tu piel y tu próxima cita recomendada. Gracias por visitarnos!",
    vars: "{cliente} {facial} {fecha}",
  },
  paquete: {
    clave: "MENSAJE TARJETA PAQUETE PENDIENTE",
    def: "Y aquí está el control de tu paquete: has disfrutado {usados} de {total} sesiones — ¡te esperamos en la siguiente!",
    vars: "{cliente} {paquete} {sesiones} {usados} {total} {fecha}",
  },
  paquete_completo: {
    clave: "MENSAJE TARJETA PAQUETE COMPLETO",
    def: "Y aquí está el control de tu paquete: has disfrutado {usados} de {total} sesiones — ¡paquete completado!",
    vars: "{cliente} {paquete} {sesiones} {usados} {total} {fecha}",
  },
  giftcard: {
    clave: "MENSAJE GIFT CARD",
    def: "Hola {cliente}, te compartimos tu gift card {giftcard} de Sunsu Spa.",
    vars: "{cliente} {giftcard} {fecha}",
  },
  combinado: {
    clave: "MENSAJE TARJETA AMBAS",
    def: "Hola! Te compartimos la tarjeta de tu tratamiento y el control de tu paquete en Sunsu Spa.",
    vars: "{cliente} {facial} {paquete} {sesiones} {giftcard} {fecha}",
  },
  recordatorio: {
    clave: "MENSAJE PRÓXIMAS",
    def: "Hola {cliente}, se acerca tu facial ({fecha}). ¿Agendamos?",
    vars: "{cliente} {facial} {fecha}",
  },
  recordatorio_atrasada: {
    clave: "MENSAJE ATRASADAS",
    def: "Hola {cliente}, ya pasó tu fecha ({fecha}). ¿Agendamos?",
    vars: "{cliente} {facial} {fecha}",
  },
  chat: {
    clave: "MENSAJE TARJETA SALUDO",
    def: "Hola {cliente}, te saludamos de Sunsu Spa!",
    vars: "{cliente}",
  },
};

export const WA_TPL_ALIAS: Record<string, string> = {
  wa_tpl_facial: "MENSAJE TARJETA TRATAMIENTO",
  wa_tpl_paquete: "MENSAJE TARJETA PAQUETE PENDIENTE",
  wa_tpl_giftcard: "MENSAJE GIFT CARD",
  wa_tpl_combinado: "MENSAJE TARJETA AMBAS",
  wa_tpl_recordatorio: "MENSAJE PRÓXIMAS",
};

export function digitosWa(v: unknown): string {
  const pretty = telOk(v) || s(v);
  let d = pretty.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("593")) d = d.slice(3);
  d = d.replace(/^0+/, "");
  if (d.length === 9 && d[0] === "9") return "593" + d;
  if (d.length === 10 && d[0] === "0" && d[1] === "9") return "593" + d.slice(1);
  if (d.length >= 7) return d.startsWith("593") ? d : d;
  return "";
}

export function hayTelWa(v: unknown): boolean {
  return digitosWa(v).length >= 11 || hayTel(v);
}

export function aplicarPlantilla(tpl: string, vars: Record<string, string | number | undefined>): string {
  let t = String(tpl || "");
  const v = { ...vars };
  if (v.cliente == null && v.nombre) v.cliente = v.nombre;
  if (v.nombre == null && v.cliente) v.nombre = v.cliente;
  if (v.sesiones == null && (v.usados != null || v.total != null)) {
    v.sesiones = String(v.usados ?? "") + (v.total != null ? "/" + v.total : "");
  }
  for (const [k, val] of Object.entries(v)) t = t.split("{" + k + "}").join(val == null ? "" : String(val));
  return aislarLinkRegistro(t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim());
}


/** El bloque de registro debe terminar en salto: aplicarPlantilla() hace trim() y, si no, el URL se pega a lo que sigue ({registro}Nota: → registro.htmlNota:). */
export function conSaltoTrasRegistro(bloque: string): string {
  const x = String(bloque || "").replace(/[ \t]+$/g, "");
  if (!x) return "";
  return /\n\n$/.test(x) ? x : x.replace(/\n?$/, "\n\n");
}

/** Si el enlace de registro quedó pegado al texto siguiente, lo separa. */
export function aislarLinkRegistro(t: string): string {
  return String(t || "").replace(/((?:https?:\/\/)?(?:app\.)?sunsuspa\.com\/registro\.html)(?=[^\s/?#])/gi, "$1\n\n");
}

export function plantillasDefault(): Record<string, string> {
  const out: Record<string, string> = {
    "LINK REGISTRO": "app.sunsuspa.com/registro.html",
    "MENSAJE CONFIRMACION CITA": "Hola {nombre} 🌸 Te saludamos de Sunsu Spa!\n\nTe escribimos para confirmar tu cita de mañana {dia} a las {hora} 💆‍♀️\n\n{registro}\n\n¿Nos confirmas tu asistencia? 💙",
    "MENSAJE REGISTRO PRIMERA VISITA": "Como es tu primera visita, te pedimos llenar tu tarjeta de registro antes de venir. Toma menos de 2 minutos y nos permite cuidar tu piel como se merece ✨\n\n📝 Tarjeta de registro\n{link}\n\n",
    "MENSAJE CLIENTAS ANTIGUAS": "Hola {nombre}, te saludamos de Sunsu Spa.",
    "MENSAJE CUMPLEAÑOS": "Hola {nombre}, ¡feliz cumpleaños!",
    "MENSAJE PAQUETE DIGITAL PENDIENTE": "Hola {nombre}! Te compartimos la tarjeta digital de tu paquete en Sunsu Spa. Ya disfrutaste {usados} de {total} sesiones — te esperamos para la siguiente. Escríbenos para agendar tu cita.",
    "MENSAJE PAQUETE DIGITAL COMPLETO": "Hola {nombre}! Te compartimos la tarjeta digital de tu paquete en Sunsu Spa. Completaste tus {total} sesiones — gracias por confiar en nosotras.",
    "MENSAJE PAQUETE CONTROL": "Hola {nombre}! Te compartimos el control de tu paquete en Sunsu Spa.",
  };
  for (const x of Object.values(WA_TPL_DEFS)) out[x.clave] = x.def;
  for (const [alias, clave] of Object.entries(WA_TPL_ALIAS)) out[alias] = out[clave];
  return out;
}

export function mezclarPlantillas(cfg: Record<string, string> | Map<string, string>): Record<string, string> {
  const src: Record<string, string> = cfg instanceof Map ? Object.fromEntries(cfg) : { ...(cfg || {}) };
  const get = (k: string) => s(src[k] || src[k.toUpperCase()]);
  const out = plantillasDefault();
  for (const [alias, clave] of Object.entries(WA_TPL_ALIAS)) {
    const v = get(alias);
    if (v && !get(clave)) { out[alias] = v; out[clave] = v; }
  }
  for (const k of Object.keys(out)) {
    if (k.startsWith("wa_tpl_")) continue;
    const v = get(k);
    if (v) out[k] = v;
  }
  for (const [alias, clave] of Object.entries(WA_TPL_ALIAS)) {
    if (!get(alias)) out[alias] = out[clave];
    else if (get(alias) && !get(clave)) out[alias] = get(alias);
  }
  return out;
}

export function conPaqueteTicket(p: { vigentes?: unknown[]; uso?: unknown; compra?: unknown; delTicket?: unknown[] } | null | undefined): boolean {
  if (!p) return false;
  return !!((p.vigentes && p.vigentes.length) || s(p.uso) || s(p.compra) || (p.delTicket && p.delTicket.length));
}

export function tiposDeTicket(d: {
  facial?: boolean;
  paquete?: boolean;
  giftcard?: boolean;
  lineas?: { tipo?: string }[];
  facial_hecho?: unknown;
  recomendaciones?: unknown;
  paqueteInfo?: { vigentes?: unknown[]; uso?: unknown; compra?: unknown; delTicket?: unknown[] };
  giftcards?: { uso?: string }[];
  venta_gift?: unknown;
  gift_card?: unknown;
}): string[] {
  const tipos: string[] = [];
  const fac = d.facial === true
    || !!s(d.facial_hecho)
    || !!s(d.recomendaciones)
    || (d.lineas || []).some((l) => l.tipo === "facial" || l.tipo === "servicio" || l.tipo === "extra");
  if (fac) tipos.push("facial");
  if (d.paquete === true || conPaqueteTicket(d.paqueteInfo)) tipos.push("paquete");
  const gc = d.giftcard === true
    || (d.giftcards || []).some((g) => s(g.uso) === "vendida")
    || !/^(no|-|0)?$/i.test(s(d.venta_gift).trim())
    || (!!s(d.gift_card) && !/^(no|-|0)$/i.test(s(d.gift_card).trim()));
  if (gc) tipos.push("giftcard");
  return tipos;
}

export function filtrarTipos(disponibles: string[], pedido?: string | string[]): string[] {
  const raw = Array.isArray(pedido) ? pedido : (pedido ? [pedido] : []);
  const limpio = raw.map((x) => s(x).toLowerCase()).filter((x) => x && x !== "chat" && x !== "recordatorio" && x !== "combinado");
  if (!limpio.length) return disponibles.slice();
  return limpio.filter((x) => disponibles.includes(x));
}

export function mensajeDe(tipos: string[], plantillas: Record<string, string>, vars: Record<string, string | number | undefined>, modo?: string): { texto: string; tipoMensaje: string } {
  const t = (tipos || []).filter((x) => x === "facial" || x === "paquete" || x === "giftcard");
  const p = mezclarPlantillas(plantillas);
  const nombre = s(vars.cliente || vars.nombre).split(" ")[0] || s(vars.nombre);
  const base = { ...vars, cliente: nombre, nombre };
  if (modo === "chat") return { texto: aplicarPlantilla(p["MENSAJE TARJETA SALUDO"], base), tipoMensaje: "chat" };
  if (modo === "recordatorio") {
    const atrasada = s(vars.atrasada) === "1" || s(vars.atrasada).toLowerCase() === "true";
    const clave = atrasada ? "MENSAJE ATRASADAS" : "MENSAJE PRÓXIMAS";
    return { texto: aplicarPlantilla(p[clave], base), tipoMensaje: "recordatorio" };
  }
  if (t.length >= 2) {
    let txt = aplicarPlantilla(p["MENSAJE TARJETA AMBAS"], base);
    if (t.includes("giftcard") && p["MENSAJE GIFT CARD"]) {
      const g = aplicarPlantilla(p["MENSAJE GIFT CARD"], base);
      if (g && txt.indexOf(g) < 0) txt = (txt + "\n\n" + g).trim();
    }
    return { texto: txt, tipoMensaje: "combinado" };
  }
  if (t[0] === "paquete") {
    const pend = n(base.pend) > 0 || (n(base.total) > 0 && n(base.usados) < n(base.total));
    const clave = pend || base.pend == null ? "MENSAJE TARJETA PAQUETE PENDIENTE" : "MENSAJE TARJETA PAQUETE COMPLETO";
    const cuerpo = aplicarPlantilla(p[n(base.pend) === 0 && n(base.total) > 0 ? "MENSAJE TARJETA PAQUETE COMPLETO" : clave], base);
    const hola = aplicarPlantilla(p["MENSAJE TARJETA SALUDO"], base);
    return { texto: [hola, cuerpo].filter(Boolean).join("\n\n"), tipoMensaje: "paquete" };
  }
  if (t[0] === "giftcard") {
    return { texto: aplicarPlantilla(p["MENSAJE GIFT CARD"], base), tipoMensaje: "giftcard" };
  }
  const hola = aplicarPlantilla(p["MENSAJE TARJETA SALUDO"], base);
  const cuerpo = aplicarPlantilla(p["MENSAJE TARJETA TRATAMIENTO"], base);
  return { texto: [hola, cuerpo].filter(Boolean).join("\n\n"), tipoMensaje: t[0] || "facial" };
}

export function waUrls(digitos: string, texto: string): { wa_url: string; wa_url_web: string } {
  const tel = digitosWa(digitos);
  const enc = encodeURIComponent(texto || "");
  return {
    wa_url: "https://wa.me/" + tel + (enc ? "?text=" + enc : ""),
    wa_url_web: "https://web.whatsapp.com/send?phone=" + tel + (enc ? "&text=" + enc : ""),
  };
}

/** Recoge un teléfono usable de varias fichas (sin devolverlo al cliente). */
export function telefonoDeFuentes(partes: unknown[]): string {
  for (const p of partes) {
    if (p == null) continue;
    if (typeof p !== "object") {
      const d = digitosWa(p);
      if (d) return d;
      continue;
    }
    const o = p as Row;
    for (const k of ["telefono", "tel", "celular", "whatsapp", "tel_acuity", "_telCol"]) {
      const d = digitosWa(o[k]);
      if (d) return d;
    }
    const datos = o.datos && typeof o.datos === "object" ? o.datos as Row : null;
    if (datos) {
      const d = digitosWa(datos.telefono || datos.tel || datos.celular || datos.whatsapp);
      if (d) return d;
    }
  }
  return "";
}


export function respuestaWa(opts: {
  digitos: string;
  texto: string;
  tipos: string[];
  tipoMensaje: string;
}): Row {
  const tel = digitosWa(opts.digitos);
  if (!tel) return { ok: true, tiene_tel: false, tipos_disponibles: opts.tipos, texto: opts.texto, tipo_mensaje: opts.tipoMensaje };
  const urls = waUrls(tel, opts.texto);
  return { ok: true, tiene_tel: true, ...urls, texto: opts.texto, tipos_disponibles: opts.tipos, tipo_mensaje: opts.tipoMensaje };
}
