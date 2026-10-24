// Personal, gift cards, paquetes y citas de la beta. Las secuencias siguen el número que ya existe.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, bajasDe, logAccion, nextSheet } from "./lib.ts";
import { ecuadorParts, n, normNombre, s, siguienteCodigoGc, siguienteCodigoPaq, USO_FIELDS, type Row } from "./domain.ts";
import { enPrueba } from "./db.ts";
import { esAdmin, esPropio, acceso, matrizDe } from "./permisos.ts";
import { saldoGift } from "./ventas.ts";

type R = Record<string, unknown>;

function yyDe(ctx: Ctx): string {
  return String(ecuadorParts(ctx.now).y).slice(-2);
}

function codigoPaq(r: Row): string {
  const orig = r.orig && typeof r.orig === "object" ? r.orig as R : {};
  return s(orig.codigo);
}

extend("getMultas", "any", async (p, ctx, ses) => {
  const admin = esAdmin(ses.rol);
  const quien = admin && s(p.nombre) ? s(p.nombre) : "";
  const rows = await ctx.db.all("multas_descuentos");
  const items = rows.filter((r) => {
    if (r.borrado_at) return false;
    if (!s(r.cosmetologa) && !s(r.empleada) && !s(r.nombre)) return false;
    const nombre = s(r.cosmetologa) || s(r.empleada) || s(r.nombre);
    if (!admin) return esPropio(nombre, ses);
    if (quien) return esPropio(nombre, { rol: ses.rol, name: quien, short: quien, uid: "" });
    return true;
  }).map((r) => ({
    id: r.sheet_row, fecha: s(r.fecha), nombre: s(r.cosmetologa) || s(r.empleada) || s(r.nombre),
    tipo: s(r.tipo), monto: n(r.monto), motivo: s(r.motivo),
  }));
  return { ok: true, items };
});

extend("personal_personas", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { ok: true, personas: [{ nombre: ses.name, cedula: "" }] };
  const nombres = new Map<string, { nombre: string; cedula: string }>();
  const baja = await bajasDe(ctx.db);
  for (const r of await ctx.db.all("rrhh_empleadas").catch(() => [] as Row[])) {
    const nombre = s(r.nombre_app) || s(r.apellidos_y_nombres);
    if (baja(nombre) || baja(s(r.cedula)) || baja(s(r.nombre_jibble))) continue;
    if (nombre && !nombres.has(normNombre(nombre))) nombres.set(normNombre(nombre), { nombre, cedula: s(r.cedula) });
  }
  for (const r of await ctx.db.all("usuarios")) {
    const nombre = s(r.nombre);
    if (baja(nombre)) continue;
    if (nombre && !nombres.has(normNombre(nombre))) nombres.set(normNombre(nombre), { nombre, cedula: "" });
  }
  if (!nombres.size) nombres.set(normNombre(ses.name), { nombre: ses.name, cedula: "" });
  const personas = [...nombres.values()];
  return { ok: true, personas };
});

function gcPub(r: Row) {
  return {
    fila: r.sheet_row, codigo: s(r.codigo_gc), valor: s(r.valor), saldo: saldoGift(r),
    usado: r.usado === true, fechaUso: s(r.fecha_uso), usadoPor: s(r.usado_por),
    nombre: s(r.nombre_comprador), apellido: s(r.apellido_comprador), cedula: s(r.cedula_comprador),
    notas: s(r.notas), dia: r.dia, mes: r.mes, ano: r.ano,
  };
}

extend("gc_list", "any", async (p, ctx) => {
  const q = s(p.q).toLowerCase();
  const items = [];
  for (const r of await ctx.db.all("gift_cards")) {
    if (r.borrado_at || !s(r.codigo_gc)) continue;
    const pub = gcPub(r);
    const blob = [pub.codigo, pub.nombre, pub.apellido, pub.cedula, pub.notas, pub.usadoPor].join(" ").toLowerCase();
    if (q && q !== "*" && !blob.includes(q)) continue;
    items.push(pub);
  }
  items.sort((a, b) => String(b.codigo).localeCompare(String(a.codigo)));
  return { ok: true, items: items.slice(0, 80) };
});

extend("gc_detalle", "any", async (p, ctx) => {
  const row = (await ctx.db.all("gift_cards")).find((r) => !r.borrado_at && s(r.codigo_gc).toLowerCase() === s(p.codigo).toLowerCase());
  if (!row) return { error: "Gift card no encontrada" };
  return { ok: true, item: gcPub(row) };
});

extend("gc_emitir", "any", async (p, ctx, ses) => {
  const codigo = siguienteCodigoGc(await ctx.db.all("gift_cards"), yyDe(ctx), enPrueba(ctx.db));
  const sr = await nextSheet(ctx.db, "gift_cards");
  const valor = s(p.valor || "65");
  await ctx.db.write(actorOf(ses), "gift_cards", "insert", {}, {
    sheet_row: sr, codigo_gc: codigo, valor, saldo: n(valor), notas: s(p.notas),
    nombre_comprador: s(p.nombre), apellido_comprador: s(p.apellido), cedula_comprador: s(p.cedula),
    usado: false, origin: enPrueba(ctx.db) ? "test" : "beta", orig: { codigo, beta: true },
  });
  await logAccion(ctx.db, actorOf(ses), "GC EMITIR", codigo + " " + valor);
  return { ok: true, codigo };
});

extend("gc_editar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin edita una gift card" };
  const row = (await ctx.db.all("gift_cards")).find((r) => !r.borrado_at && (s(r.codigo_gc).toLowerCase() === s(p.codigo).toLowerCase() || String(r.sheet_row) === s(p.fila)));
  if (!row) return { error: "Gift card no encontrada" };
  const antes = { saldo: saldoGift(row), usado: row.usado === true, valor: s(row.valor), notas: s(row.notas) };
  const patch: R = {};
  if (p.saldo != null && p.saldo !== "") patch.saldo = n(p.saldo);
  if (p.valor != null && p.valor !== "") patch.valor = s(p.valor);
  if (p.notas != null) patch.notas = s(p.notas);
  if (p.usado === true || s(p.usado) === "true" || s(p.usado) === "1") {
    patch.usado = true;
    patch.fecha_uso = s(p.fechaUso) || ecuadorParts(ctx.now).ymd;
    patch.usado_por = s(p.usadoPor) || ses.name;
  }
  if (p.usado === false || s(p.usado) === "false" || s(p.usado) === "0") {
    patch.usado = false;
    patch.fecha_uso = "";
    patch.usado_por = "";
  }
  if (!Object.keys(patch).length) return { error: "Nada que cambiar" };
  await ctx.db.write(actorOf(ses), "gift_cards", "update", { sheet_row: row.sheet_row }, patch);
  await logAccion(ctx.db, actorOf(ses), "GC EDITAR", s(row.codigo_gc) + " " + JSON.stringify({ antes, despues: patch }));
  return { ok: true, codigo: s(row.codigo_gc) };
});

function paqPub(r: Row) {
  const usos = USO_FIELDS.map(([u, f], i) => ({ slot: i + 1, usado: r[u] === true || !!s(r[f]), fecha: s(r[f]) }));
  return {
    fila: r.sheet_row, codigo: codigoPaq(r), cedula: s(r.cedula), nombre: s(r.nombres), apellido: s(r.apellidos),
    sku: s(r.sku), paquete: s(r.paquete), vendidoPor: s(r.vendido_por), notas: s(r.notas),
    completo: r.completo === true, usos, usados: usos.filter((u) => u.usado).length,
  };
}

extend("paq_list", "any", async (p, ctx, ses) => {
  const q = s(p.q).toLowerCase();
  const matriz = await matrizDe(ctx.db);
  const propio = !esAdmin(ses.rol) && acceso(ses.rol, "paquetes", matriz) !== "todos";
  const items = [];
  for (const r of await ctx.db.all("paquetes")) {
    if (r.borrado_at) continue;
    if (!s(r.cedula) && !s(r.nombres) && !codigoPaq(r)) continue;
    if (propio && !esPropio(s(r.vendido_por), ses) && !esPropio(s(r.nombres), ses)) continue;
    const pub = paqPub(r);
    const blob = [pub.codigo, pub.cedula, pub.nombre, pub.apellido, pub.sku, pub.paquete].join(" ").toLowerCase();
    if (q && q !== "*" && !blob.includes(q)) continue;
    items.push(pub);
  }
  return { ok: true, items: items.slice(0, 80) };
});

extend("paq_detalle", "any", async (p, ctx, ses) => {
  const row = (await ctx.db.all("paquetes")).find((r) => !r.borrado_at && (codigoPaq(r).toLowerCase() === s(p.codigo).toLowerCase() || String(r.sheet_row) === s(p.fila)));
  if (!row) return { error: "Paquete no encontrado" };
  const matriz = await matrizDe(ctx.db);
  if (!esAdmin(ses.rol) && acceso(ses.rol, "paquetes", matriz) !== "todos" && !esPropio(s(row.vendido_por), ses)) {
    return { error: "No tienes permiso" };
  }
  return { ok: true, item: paqPub(row) };
});

extend("paq_emitir", "any", async (p, ctx, ses) => {
  const codigo = siguienteCodigoPaq(await ctx.db.all("paquetes"), enPrueba(ctx.db));
  const sr = await nextSheet(ctx.db, "paquetes");
  const ec = ecuadorParts(ctx.now);
  await ctx.db.write(actorOf(ses), "paquetes", "insert", {}, {
    sheet_row: sr, dia: ec.d, mes: ec.m, ano: ec.y, cedula: s(p.cedula),
    nombres: s(p.nombre), apellidos: s(p.apellido), sku: s(p.sku), paquete: s(p.paquete) || s(p.sku),
    vendido_por: s(p.vendidoPor) || ses.name, notas: s(p.notas),
    orig: { codigo, beta: true },
  });
  await logAccion(ctx.db, actorOf(ses), "PAQ EMITIR", codigo);
  return { ok: true, codigo };
});

extend("paq_editar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo admin edita un paquete" };
  const row = (await ctx.db.all("paquetes")).find((r) => !r.borrado_at && (codigoPaq(r).toLowerCase() === s(p.codigo).toLowerCase() || String(r.sheet_row) === s(p.fila)));
  if (!row) return { error: "Paquete no encontrado" };
  const accion = s(p.accion || "marcar");
  let idx = n(p.slot) - 1;
  if (accion === "agregar") idx = USO_FIELDS.findIndex(([u, f]) => row[u] !== true && !s(row[f]));
  if (idx < 0 || idx >= USO_FIELDS.length) return { error: "No queda un cupo libre" };
  const [u, f] = USO_FIELDS[idx];
  const antes = { slot: idx + 1, usado: row[u] === true, fecha: s(row[f]) };
  const patch: R = {};
  if (accion === "desmarcar") {
    patch[u] = false;
    patch[f] = "";
    patch.completo = false;
  } else {
    patch[u] = true;
    patch[f] = s(p.fecha) || ecuadorParts(ctx.now).ymd;
  }
  if (p.notas != null) patch.notas = s(p.notas);
  await ctx.db.write(actorOf(ses), "paquetes", "update", { sheet_row: row.sheet_row }, patch);
  await logAccion(ctx.db, actorOf(ses), "PAQ EDITAR", codigoPaq(row) || String(row.sheet_row) + " " + JSON.stringify({ antes, despues: patch, accion }));
  return { ok: true, slot: idx + 1, codigo: codigoPaq(row) };
});

function citaMatch(cal: string, ses: Ses, nombre: string): boolean {
  if (!cal) return false;
  const quien = nombre || ses.name;
  return esPropio(cal, { rol: ses.rol, name: quien, short: quien.split(" ")[0] || quien, uid: ses.uid });
}

extend("citas_proximas", "any", async (p, ctx, ses) => {
  const uid = s(ctx.env.ACUITY_UID);
  const key = s(ctx.env.ACUITY_KEY);
  const hoy = ecuadorParts(ctx.now).ymd;
  const fin = new Date(ctx.now.getTime() + 14 * 86400000);
  const hasta = ecuadorParts(fin).ymd;
  let arr: R[] = [];
  if (uid && key) {
    const res = await ctx.fetchImpl(`https://acuityscheduling.com/api/v1/appointments?minDate=${hoy}T00:00:00&maxDate=${hasta}T23:59:59&max=100`, {
      headers: { Authorization: "Basic " + btoa(uid + ":" + key) },
    });
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) arr = data;
    } catch { arr = []; }
  }
  const admin = esAdmin(ses.rol);
  const filtro = admin ? s(p.nombre) : ses.name;
  const conPrecio = admin || acceso(ses.rol, "ver_costos", await matrizDe(ctx.db)) === "todos";
  const tickets = await ctx.db.all("tickets").catch(() => [] as Row[]);
  const citas = [];
  for (const apt of arr) {
    const cal = s(apt.calendar);
    if (!admin && !citaMatch(cal, ses, ses.name)) continue;
    if (admin && filtro && !citaMatch(cal, ses, filtro)) continue;
    const cliente = (s(apt.firstName) + " " + s(apt.lastName)).trim();
    const previas = tickets.filter((t) => {
      const nom = (s(t.nombre) + " " + s(t.apellido)).trim();
      return nom && cliente && normNombre(nom).includes(normNombre(cliente).split(" ")[0] || "—");
    }).sort((a, b) => s(b.timestamp).localeCompare(s(a.timestamp)));
    const ultima = previas[0];
    const anterior = ultima ? {
      fecha: s(ultima.timestamp).slice(0, 10),
      resumen: [s(ultima.facial_hecho), s(ultima.notas_generales) || s(ultima.notas)].filter(Boolean).join(" · ") || "Visita anterior",
      ref: s(ultima.beta_num) || "",
      ...(conPrecio ? { precio: n(ultima.estimado) } : {}),
    } : null;
    const item: R = {
      id: s(apt.id), cuando: s(apt.datetime), cliente, servicio: s(apt.type),
      notas: s(apt.notes), calendario: cal, anterior,
    };
    if (conPrecio && apt.price != null) item.precio = n(apt.price);
    citas.push(item);
  }
  citas.sort((a, b) => s(a.cuando).localeCompare(s(b.cuando)));
  return { ok: true, citas };
});
