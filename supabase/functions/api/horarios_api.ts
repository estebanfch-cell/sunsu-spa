// Horarios por persona, import de Jibble y avisos de entrada/salida.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, kvGet, kvSet } from "./lib.ts";
import { ecuadorParts, n, s, type Row } from "./domain.ts";
import { esAdmin, normalizarRol } from "./permisos.ts";
import type { MarcajeIn } from "./asistencia.ts";
import {
  esRolAviso, horarioDePersona, normalizarJibble, resolverAviso,
  type Arreglo, type AsignacionHorario, type Horario,
} from "./horarios.ts";

const ARREGLOS = new Set(["fijo", "flexible", "semanal", "rotativo"]);

async function todas(ctx: Ctx, table: string): Promise<Row[]> {
  try { return await ctx.db.all(table); } catch { return []; }
}

async function borrarDonde(ctx: Ctx, actor: string, table: string, horarioId: string): Promise<void> {
  for (;;) {
    const rows = await todas(ctx, table);
    const hit = rows.find((r) => String(r.horario_id) === horarioId);
    if (!hit) return;
    await ctx.db.write(actor, table, "delete", { id: hit.id }, null);
  }
}

function diaFila(r: Row): Horario["dias"][number] {
  return {
    orden: n(r.orden),
    dia: s(r.dia),
    trabaja: r.trabaja !== false,
    desde: s(r.desde) || null,
    hasta: s(r.hasta) || null,
    duracionMin: r.duracion_min == null || r.duracion_min === "" ? null : n(r.duracion_min),
  };
}

export async function cargarHorarios(ctx: Ctx): Promise<{ horarios: Horario[]; asignaciones: AsignacionHorario[] }> {
  const filas = await todas(ctx, "horarios");
  const dias = await todas(ctx, "horario_dias");
  const descansos = await todas(ctx, "horario_descansos");
  const deducciones = await todas(ctx, "horario_deducciones");
  const asignaciones = await todas(ctx, "horario_asignaciones");
  const horarios: Horario[] = filas.map((r) => {
    const id = s(r.id);
    return {
      id,
      nombre: s(r.nombre) || "Horario",
      arreglo: (ARREGLOS.has(s(r.arreglo)) ? s(r.arreglo) : "fijo") as Arreglo,
      esDefault: r.es_default === true,
      descansosTipo: s(r.descansos_tipo) === "pago" ? "pago" : "impago",
      excluirTemprana: r.excluir_temprana === true,
      horasSemana: r.horas_semana == null || r.horas_semana === "" ? null : n(r.horas_semana),
      finJornada: s(r.fin_jornada) || null,
      cicloDias: r.ciclo_dias == null || r.ciclo_dias === "" ? null : n(r.ciclo_dias),
      ancla: s(r.ancla).slice(0, 10) || null,
      jibbleId: s(r.jibble_id) || null,
      dias: dias.filter((d) => String(d.horario_id) === id).map(diaFila).sort((a, b) => a.orden - b.orden),
      descansos: descansos.filter((d) => String(d.horario_id) === id).map((d) => ({
        nombre: s(d.nombre) || "Descanso",
        duracionMin: n(d.duracion_min),
        desde: s(d.desde) || null,
        hasta: s(d.hasta) || null,
        franja: d.franja === true,
      })),
      deducciones: deducciones.filter((d) => String(d.horario_id) === id).map((d) => ({
        nombre: s(d.nombre) || "Deducción",
        duracionMin: n(d.duracion_min),
        umbralMin: n(d.umbral_min),
      })),
    };
  });
  return {
    horarios,
    asignaciones: asignaciones.map((r) => ({
      persona: s(r.persona),
      horarioId: s(r.horario_id) || null,
      origen: (s(r.origen) === "grupo" || s(r.origen) === "default" ? s(r.origen) : "persona") as AsignacionHorario["origen"],
      jibblePersonId: s(r.jibble_person_id) || null,
      grupo: s(r.grupo) || null,
    })),
  };
}

function validar(h: Horario): string | null {
  if (!h.nombre.trim()) return "El horario necesita un nombre.";
  if (!ARREGLOS.has(h.arreglo)) return "Ese arreglo no existe.";
  const trabaja = h.dias.filter((d) => d.trabaja);
  if (h.arreglo === "fijo" && !trabaja.some((d) => d.desde && d.hasta)) return "Un horario fijo necesita día, entrada y salida.";
  if (h.arreglo === "flexible" && !trabaja.some((d) => (d.duracionMin || 0) > 0 || (d.desde && d.hasta))) return "Un horario flexible necesita los días y la duración.";
  if (h.arreglo === "semanal" && (!(h.horasSemana && h.horasSemana > 0) || !trabaja.length)) return "Un horario semanal necesita las horas de la semana y los días.";
  if (h.arreglo === "rotativo") {
    if (!h.cicloDias || h.cicloDias < 2) return "El ciclo rotativo necesita al menos 2 días.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(h.ancla || "")) return "El ciclo necesita una fecha de inicio.";
    if (!trabaja.some((d) => d.desde && d.hasta)) return "Marca qué días del ciclo se trabaja y a qué hora.";
  }
  return null;
}

function horarioDesde(p: Row, prev: Horario | null): Horario {
  const dias = Array.isArray(p.dias) ? p.dias as Row[] : [];
  const descansos = Array.isArray(p.descansos) ? p.descansos as Row[] : [];
  const deducciones = Array.isArray(p.deducciones) ? p.deducciones as Row[] : [];
  return {
    id: s(p.id) || prev?.id || crypto.randomUUID(),
    nombre: s(p.nombre) || prev?.nombre || "",
    arreglo: (ARREGLOS.has(s(p.arreglo)) ? s(p.arreglo) : prev?.arreglo || "fijo") as Arreglo,
    esDefault: p.es_default === true || p.esDefault === true,
    descansosTipo: s(p.descansos_tipo || p.descansosTipo) === "pago" ? "pago" : "impago",
    excluirTemprana: p.excluir_temprana === true || p.excluirTemprana === true,
    horasSemana: p.horas_semana == null && p.horasSemana == null ? prev?.horasSemana ?? null : n(p.horas_semana ?? p.horasSemana),
    finJornada: s(p.fin_jornada || p.finJornada) || null,
    cicloDias: p.ciclo_dias == null && p.cicloDias == null ? prev?.cicloDias ?? null : n(p.ciclo_dias ?? p.cicloDias),
    ancla: s(p.ancla).slice(0, 10) || null,
    jibbleId: prev?.jibbleId || s(p.jibble_id) || null,
    dias: dias.map((d, i) => ({
      orden: n(d.orden) || i + 1,
      dia: s(d.dia),
      trabaja: d.trabaja !== false && d.trabaja !== "false",
      desde: s(d.desde) || null,
      hasta: s(d.hasta) || null,
      duracionMin: d.duracion_min == null && d.duracionMin == null ? null : n(d.duracion_min ?? d.duracionMin),
    })),
    descansos: descansos.map((d) => ({
      nombre: s(d.nombre) || "Descanso",
      duracionMin: n(d.duracion_min ?? d.duracionMin),
      desde: s(d.desde) || null,
      hasta: s(d.hasta) || null,
      franja: d.franja === true,
    })),
    deducciones: deducciones.map((d) => ({
      nombre: s(d.nombre) || "Deducción",
      duracionMin: n(d.duracion_min ?? d.duracionMin),
      umbralMin: n(d.umbral_min ?? d.umbralMin),
    })),
  };
}

async function guardarHorario(ctx: Ctx, ses: Ses, h: Horario): Promise<void> {
  const actor = actorOf(ses);
  const row = {
    id: h.id, nombre: h.nombre, arreglo: h.arreglo, es_default: h.esDefault,
    descansos_tipo: h.descansosTipo, excluir_temprana: h.excluirTemprana,
    horas_semana: h.horasSemana, fin_jornada: h.finJornada, ciclo_dias: h.cicloDias,
    ancla: h.ancla, jibble_id: h.jibbleId,
  };
  const ya = (await todas(ctx, "horarios")).some((r) => String(r.id) === h.id);
  if (h.esDefault) {
    for (const otro of await todas(ctx, "horarios")) {
      if (otro.es_default === true && String(otro.id) !== h.id) {
        await ctx.db.write(actor, "horarios", "update", { id: otro.id }, { es_default: false });
      }
    }
  }
  if (ya) await ctx.db.write(actor, "horarios", "update", { id: h.id }, row);
  else await ctx.db.write(actor, "horarios", "insert", {}, row);
  await borrarDonde(ctx, actor, "horario_dias", h.id);
  await borrarDonde(ctx, actor, "horario_descansos", h.id);
  await borrarDonde(ctx, actor, "horario_deducciones", h.id);
  for (const d of h.dias) {
    await ctx.db.write(actor, "horario_dias", "insert", {}, {
      horario_id: h.id, orden: d.orden, dia: d.dia, trabaja: d.trabaja,
      desde: d.desde, hasta: d.hasta, duracion_min: d.duracionMin,
    });
  }
  for (const d of h.descansos) {
    await ctx.db.write(actor, "horario_descansos", "insert", {}, {
      horario_id: h.id, nombre: d.nombre, duracion_min: d.duracionMin,
      desde: d.desde, hasta: d.hasta, franja: d.franja,
    });
  }
  for (const d of h.deducciones) {
    await ctx.db.write(actor, "horario_deducciones", "insert", {}, {
      horario_id: h.id, nombre: d.nombre, duracion_min: d.duracionMin, umbral_min: d.umbralMin,
    });
  }
}

async function personasDe(ctx: Ctx): Promise<{ nombre: string; rol: string }[]> {
  const out: { nombre: string; rol: string }[] = [];
  const vistos = new Set<string>();
  const sumar = (nombre: string, rol: string) => {
    const nomb = s(nombre);
    if (!nomb || vistos.has(nomb)) return;
    vistos.add(nomb);
    out.push({ nombre: nomb, rol: normalizarRol(rol || "") });
  };
  for (const u of await todas(ctx, "app_usuarios")) sumar(s(u.nombre || u.name), s(u.rol));
  for (const u of await todas(ctx, "usuarios")) sumar(s(u.nombre || u.name), s(u.rol));
  for (const e of await todas(ctx, "rrhh_empleadas")) sumar(s(e.nombre_app || e.nombre), "");
  return out;
}

function marcajesDe(rows: Row[], nombre: string): MarcajeIn[] {
  return rows.filter((r) => s(r.nombre) === nombre).map((r) => ({
    id: s(r.id), nombre: s(r.nombre), tipo: s(r.tipo), ts: s(r.ts), anulado: r.anulado === true,
  }));
}

export async function leerJibble(fetchImpl: typeof fetch, env: Record<string, string | undefined>): Promise<{ ok: true; schedules: unknown; people: unknown; groups: unknown } | { ok: false; error: string }> {
  const id = env.JIBBLE_CLIENT_ID;
  const secret = env.JIBBLE_CLIENT_SECRET;
  if (!id || !secret) return { ok: false, error: "Jibble no está configurado (JIBBLE_CLIENT_ID / JIBBLE_CLIENT_SECRET)." };
  const tokRes = await fetchImpl("https://identity.prod.jibble.io/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&client_id=" + encodeURIComponent(id) + "&client_secret=" + encodeURIComponent(secret),
  });
  const tok = await tokRes.json() as Row;
  if (!tokRes.ok || !s(tok.access_token)) return { ok: false, error: "Jibble rechazó las credenciales." };
  const headers = { Authorization: "Bearer " + s(tok.access_token) };
  const schRes = await fetchImpl("https://workspace.prod.jibble.io/v1/Schedules?$expand=daySchedules,breaks,autoDeductions", { headers });
  if (!schRes.ok) return { ok: false, error: "Jibble no devolvió los horarios (" + schRes.status + ")." };
  const schedules = await schRes.json();
  const peopleRes = await fetchImpl("https://time-tracking.prod.jibble.io/v1/People?$top=500&$select=id,fullName,scheduleId,groupId", { headers });
  const people = peopleRes.ok ? await peopleRes.json() : { value: [] };
  const groupRes = await fetchImpl("https://workspace.prod.jibble.io/v1/Groups?$top=200", { headers });
  const groups = groupRes.ok ? await groupRes.json() : { value: [] };
  return { ok: true, schedules, people, groups };
}

async function aplicarImport(ctx: Ctx, ses: Ses, schedules: unknown, people: unknown, groups: unknown): Promise<{ importados: number; asignados: number }> {
  const parsed = normalizarJibble({ schedules, people, groups });
  const actor = actorOf(ses);
  const actuales = await cargarHorarios(ctx);
  const porJibble = new Map(actuales.horarios.filter((h) => h.jibbleId).map((h) => [h.jibbleId as string, h.id]));
  let importados = 0;
  for (const h of parsed.horarios) {
    const id = (h.jibbleId && porJibble.get(h.jibbleId)) || crypto.randomUUID();
    if (h.jibbleId) porJibble.set(h.jibbleId, id);
    await guardarHorario(ctx, ses, { ...h, id });
    importados++;
  }
  let asignados = 0;
  for (const a of parsed.asignaciones) {
    const horarioId = a.horarioId ? porJibble.get(a.horarioId) || null : null;
    if (!horarioId) continue;
    const ya = (await todas(ctx, "horario_asignaciones")).find((r) => s(r.persona) === a.persona);
    const row = { persona: a.persona, horario_id: horarioId, origen: a.origen, jibble_person_id: a.jibblePersonId, grupo: a.grupo };
    if (ya) await ctx.db.write(actor, "horario_asignaciones", "update", { persona: a.persona }, row);
    else await ctx.db.write(actor, "horario_asignaciones", "insert", {}, row);
    asignados++;
  }
  return { importados, asignados };
}

async function clavesPush(ctx: Ctx, ses: Ses): Promise<{ publicKey: string; privateKey: string } | null> {
  const pub = ctx.env.VAPID_PUBLIC_KEY;
  const priv = ctx.env.VAPID_PRIVATE_KEY;
  if (pub && priv) return { publicKey: pub, privateKey: priv };
  const cur = await kvGet(ctx.db, "vapid");
  if (s(cur.publicKey) && s(cur.privateKey)) return { publicKey: s(cur.publicKey), privateKey: s(cur.privateKey) };
  try {
    const spec = "npm:web-push";
    const mod = await import(spec) as { default?: { generateVAPIDKeys(): { publicKey: string; privateKey: string } }; generateVAPIDKeys?: () => { publicKey: string; privateKey: string } };
    const webpush = mod.default || mod;
    if (!webpush.generateVAPIDKeys) return null;
    const keys = webpush.generateVAPIDKeys();
    await kvSet(ctx.db, actorOf(ses), "vapid", keys);
    return keys;
  } catch {
    return null;
  }
}

async function enviarPush(ctx: Ctx, ses: Ses, subs: Row[], texto: string, tipo: string): Promise<void> {
  if (!subs.length) return;
  const keys = await clavesPush(ctx, ses);
  if (!keys) return;
  try {
    const spec = "npm:web-push";
    const mod = await import(spec) as { default?: { setVapidDetails(s: string, a: string, b: string): void; sendNotification(sub: unknown, payload: string): Promise<unknown> } };
    const webpush = mod.default;
    if (!webpush) return;
    webpush.setVapidDetails("mailto:asistencia@sunsuspa.com", keys.publicKey, keys.privateKey);
    for (const sub of subs) {
      try {
        await webpush.sendNotification({
          endpoint: s(sub.endpoint),
          keys: { p256dh: s(sub.p256dh), auth: s(sub.auth) },
        }, JSON.stringify({ title: "Sunsu", body: texto, tag: "sunsu-reloj-" + tipo }));
      } catch { /* el banner de la app sigue */ }
    }
  } catch { /* sin librería de push el banner sigue */ }
}

export async function despacharAvisos(ctx: Ctx, ses: Ses): Promise<void> {
  const { horarios, asignaciones } = await cargarHorarios(ctx);
  if (!horarios.length) return;
  const marcas = await todas(ctx, "asistencia_marcajes");
  const subs = await todas(ctx, "push_suscripciones");
  const enviados = await todas(ctx, "horario_avisos");
  const fecha = ecuadorParts(ctx.now).ymd;
  const actor = actorOf(ses);
  for (const persona of await personasDe(ctx)) {
    if (!esRolAviso(persona.rol)) continue;
    const horario = horarioDePersona(horarios, asignaciones, persona.nombre);
    const aviso = resolverAviso({ rol: persona.rol, ahora: ctx.now, horario, marcajes: marcajesDe(marcas, persona.nombre) });
    if (!aviso) continue;
    if (enviados.some((r) => s(r.persona) === persona.nombre && s(r.fecha).slice(0, 10) === fecha && s(r.tipo) === aviso.tipo)) continue;
    await ctx.db.write(actor, "horario_avisos", "insert", {}, { persona: persona.nombre, fecha, tipo: aviso.tipo });
    const suyos = subs.filter((r) => s(r.persona) === persona.nombre);
    await enviarPush(ctx, ses, suyos, aviso.texto, aviso.tipo);
  }
}

extend("horarios_list", "any", async (_p, ctx, ses) => {
  const { horarios, asignaciones } = await cargarHorarios(ctx);
  const personas = await personasDe(ctx);
  if (!esAdmin(ses.rol)) {
    const mio = horarioDePersona(horarios, asignaciones, ses.name);
    return { ok: true, horarios: mio ? [mio] : [], asignaciones: [], personas: [], mio };
  }
  return { ok: true, horarios, asignaciones, personas, importados: horarios.filter((h) => h.jibbleId).length };
});

extend("horarios_guardar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin arma los horarios." };
  const prev = (await cargarHorarios(ctx)).horarios.find((h) => h.id === s(p.id)) || null;
  const h = horarioDesde(p, prev);
  const err = validar(h);
  if (err) return { error: err };
  await guardarHorario(ctx, ses, h);
  return { ok: true, id: h.id };
});

extend("horarios_asignar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin asigna horarios." };
  const persona = s(p.persona);
  if (!persona) return { error: "Falta la persona." };
  const actor = actorOf(ses);
  const horarioId = s(p.horario_id || p.horarioId);
  const ya = (await todas(ctx, "horario_asignaciones")).find((r) => s(r.persona) === persona);
  if (!horarioId) {
    if (ya) await ctx.db.write(actor, "horario_asignaciones", "delete", { persona }, null);
    return { ok: true };
  }
  const existe = (await todas(ctx, "horarios")).some((r) => String(r.id) === horarioId);
  if (!existe) return { error: "Ese horario no está." };
  const row = { persona, horario_id: horarioId, origen: "persona", jibble_person_id: ya ? s(ya.jibble_person_id) || null : null, grupo: null };
  if (ya) await ctx.db.write(actor, "horario_asignaciones", "update", { persona }, row);
  else await ctx.db.write(actor, "horario_asignaciones", "insert", {}, row);
  return { ok: true };
});

extend("horarios_importar", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin trae los horarios de Jibble." };
  const leido = await leerJibble(ctx.fetchImpl, ctx.env);
  if (!leido.ok) return { ok: false, vacio: true, importados: 0, asignados: 0, error: leido.error };
  const res = await aplicarImport(ctx, ses, leido.schedules, leido.people, leido.groups);
  return { ok: true, vacio: res.importados === 0, ...res };
});

extend("asis_aviso", "any", async (_p, ctx, ses) => {
  try { await despacharAvisos(ctx, ses); } catch { /* sin tablas el banner de esta persona sigue */ }
  const { horarios, asignaciones } = await cargarHorarios(ctx);
  const horario = horarioDePersona(horarios, asignaciones, ses.name);
  const marcas = marcajesDe(await todas(ctx, "asistencia_marcajes"), ses.name);
  const aviso = resolverAviso({ rol: normalizarRol(ses.rol), ahora: ctx.now, horario, marcajes: marcas });
  return { ok: true, aviso };
});

extend("push_clave", "any", async (_p, ctx, ses) => {
  const keys = await clavesPush(ctx, ses);
  if (!keys) return { ok: false, error: "Los avisos push no tienen clave todavía. El banner de la app sigue." };
  return { ok: true, publicKey: keys.publicKey };
});

extend("push_suscribir", "any", async (p, ctx, ses) => {
  const endpoint = s(p.endpoint);
  const p256dh = s(p.p256dh);
  const auth = s(p.auth);
  if (!endpoint || !p256dh || !auth) return { error: "Falta la suscripción del navegador." };
  const actor = actorOf(ses);
  const row = { endpoint, persona: ses.name, uid: ses.uid, p256dh, auth };
  const ya = (await todas(ctx, "push_suscripciones")).some((r) => s(r.endpoint) === endpoint);
  if (ya) await ctx.db.write(actor, "push_suscripciones", "update", { endpoint }, row);
  else await ctx.db.write(actor, "push_suscripciones", "insert", {}, row);
  return { ok: true };
});
