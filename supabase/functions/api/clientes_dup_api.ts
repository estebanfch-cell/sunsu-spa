// 🔗 Clientes › Duplicados (Emilia 17/11): grupos unidos solos por la misma cédula normalizada (para revisar),
// uniones a mano, y sugerencias (mismo celular, nombre parecido, cédula con un dígito distinto).
// Unir / No son la misma / Deshacer unión → beta_cliente_alias (reversible) + log_acciones. La hoja no se toca.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf, logAccion } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { cedulaValida, cedulaVer, idVer, normCedula, normCedulaVieja, normNombre, s, telefonoEc, type Row } from "./domain.ts";
import { clientesResumen, codigoCliente, registrosLigeros, ticketsLigeros } from "./ventas.ts";
import { canonDeClave, cargarAlias, estadoAlias, parClave, resolverClave } from "./clientes_alias.ts";
import { lite, overlays } from "./clientes_beta_api.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }
const tel9 = (v: unknown) => { const d = telefonoEc(v).replace(/\D/g, "").replace(/^593/, "").replace(/^0+/, ""); return d.length >= 9 ? d.slice(-9) : ""; };
const nuevoId = (ctx: Ctx) => "al-" + ctx.now.getTime().toString(36) + "-" + Math.random().toString(36).slice(2, 7);

interface Variante { clave: string; crudas: Set<string>; nombres: Set<string>; tickets: number; registros: number; codigos: Set<string> }

/** Grupos automáticos: variantes viejas (c:…, c:…001) que hoy caen en la misma cédula. Pura, para pruebas. */
export function gruposAuto(tickets: Row[], regs: Row[], filas: Row[]): Map<string, Map<string, Variante>> {
  const G = new Map<string, Map<string, Variante>>();
  const add = (raw: unknown, nombre: string, f: (v: Variante) => void, viejaKey?: string) => {
    const c = normCedula(raw); if (!c) return;
    const g = "c:" + c, vk = viejaKey || "c:" + (/[a-z]/i.test(s(raw)) ? c : normCedulaVieja(raw));
    const M = G.get(g) || new Map<string, Variante>(); G.set(g, M);
    const v = M.get(vk) || { clave: vk, crudas: new Set(), nombres: new Set(), tickets: 0, registros: 0, codigos: new Set() }; M.set(vk, v);
    if (s(raw).trim()) v.crudas.add(s(raw).trim());
    if (nombre.trim()) v.nombres.add(nombre.replace(/\s+/g, " ").trim());
    f(v);
  };
  for (const r of tickets) if (!r.borrado_at) add(r.id_3, s(r.nombre) + " " + s(r.apellido), (v) => { v.tickets++; });
  for (const r of regs) if (!r.borrado_at) add(r.cedula, s(r.nombre) + " " + s(r.apellido), (v) => { v.registros++; const c = codigoCliente(r); if (c) v.codigos.add(c); });
  for (const r of filas) { const k = s(r.key); if (k.startsWith("c:")) add(k.slice(2), s(r.nombre), (v) => { if (s(r.codigo)) v.codigos.add(s(r.codigo)); }, k); }
  for (const [g, M] of G) if (M.size < 2) G.delete(g);
  return G;
}

/** Sugerencias entre clientas distintas. Pura, para pruebas. */
export function sugerencias(cli: Row[], noDup: Set<string>): Row[] {
  const pares = new Map<string, { a: Row; b: Row; motivos: Set<string> }>();
  const marcar = (a: Row, b: Row, m: string) => {
    if (s(a.key) === s(b.key)) return;
    const k = parClave(s(a.key), s(b.key)); if (noDup.has(k)) return;
    const p = pares.get(k) || { a, b, motivos: new Set<string>() }; p.motivos.add(m); pares.set(k, p);
  };
  const cubeta = (f: (c: Row) => string[], m: string, ok: (a: Row, b: Row) => boolean = () => true) => {
    const B = new Map<string, Row[]>();
    for (const c of cli) for (const k of f(c)) if (k) { const L = B.get(k) || []; L.push(c); B.set(k, L); }
    for (const L of B.values()) if (L.length > 1 && L.length <= 6) for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (ok(L[i], L[j])) marcar(L[i], L[j], m);
  };
  const ced = (c: Row) => cedulaVer(c.cedula);
  const sinCedulaBuena = (a: Row, b: Row) => !cedulaValida(a.cedula) || !cedulaValida(b.cedula);
  cubeta((c) => [tel9(c.telefono)], "mismo celular");
  cubeta((c) => { const d = ced(c); return /^\d{10}$/.test(d) ? [...d].map((_, i) => d.slice(0, i) + "_" + d.slice(i + 1)) : []; }, "cédula con un dígito distinto");
  cubeta((c) => [normNombre(c.nombre)], "mismo nombre", sinCedulaBuena);
  cubeta((c) => {
    const t = normNombre(c.nombres || "").split(" ").filter(Boolean), ap = normNombre(c.apellido || "").split(" ").filter(Boolean);
    const all = normNombre(c.nombre).split(" ").filter(Boolean);
    const n1 = t[0] || all[0], a1 = ap[0] || (all.length >= 2 ? all[all.length >= 4 ? 2 : 1] : "");
    return n1 && a1 ? [n1 + "|" + a1] : [];
  }, "nombre parecido", sinCedulaBuena);
  const peso: Record<string, number> = { "mismo celular": 3, "cédula con un dígito distinto": 3, "mismo nombre": 2, "nombre parecido": 1 };
  return [...pares.values()].map((p) => ({ a: p.a, b: p.b, motivos: [...p.motivos], puntaje: [...p.motivos].reduce((x, m) => x + (peso[m] || 1), 0) }))
    .filter((p) => p.puntaje >= 2 || p.motivos.length > 1 || !cedulaValida(p.a.cedula) || !cedulaValida(p.b.cedula))
    .sort((x, y) => y.puntaje - x.puntaje || s(x.a.nombre).localeCompare(s(y.a.nombre)));
}

async function listaClientes(ctx: Ctx, ses: Ses): Promise<Row[]> {
  const [res, ov] = await Promise.all([clientesResumen(ctx.db, lite(ses), true, true), overlays(ctx)]);
  return ((res.clientes || []) as Row[]).filter((c) => ov.get(s(c.key))?.borrado !== true).map((c) => {
    const o = ov.get(s(c.key)), d = (o?.datos || {}) as Row;
    const nombres = d.nombres != null ? s(d.nombres) : s(c.nombres), apellido = d.apellido != null ? s(d.apellido) : s(c.apellido);
    return { key: s(c.key), codigo: s(o?.codigo) || s(c.codigo), nombres, apellido, nombre: (nombres + " " + apellido).trim() || s(c.nombre),
      cedula: cedulaVer(d.cedula ?? c.cedula), telefono: telefonoEc(d.telefono ?? c.telefono), visitas: c.visitas, ultima: c.ultima };
  });
}
const corta = (c: Row | undefined, k: string) => c ? { key: s(c.key), codigo: s(c.codigo), nombre: s(c.nombre), cedula: s(c.cedula), telefono: s(c.telefono), visitas: c.visitas ?? 0, ultima: s(c.ultima) } : { key: k, codigo: "", nombre: k.replace(/^[cnt]:/, ""), cedula: "", telefono: "", visitas: 0, ultima: "" };

extend("cl_dup_lista", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  await cargarAlias(ctx.db, true);
  const AL = estadoAlias();
  const [tks, regs, filas, cli] = await Promise.all([ticketsLigeros(ctx.db), registrosLigeros(ctx.db), todas(ctx, "beta_clientes"), listaClientes(ctx, ses)]);
  const porKey = new Map(cli.map((c) => [s(c.key), c]));
  const sepId = new Map(AL.filas.filter((r) => s(r.tipo) === "separar" && !r.deshecho_at).map((r) => [s(r.clave), s(r.id)]));
  const auto = [...gruposAuto(tks, regs, filas)].map(([g, M]) => {
    const canon = resolverClave(g), c = porKey.get(canon);
    const vars = [...M.values()].map((v) => ({ clave: v.clave, cedulas: [...new Set([...v.crudas].map(idVer))].slice(0, 6), nombres: [...v.nombres].slice(0, 6), tickets: v.tickets, registros: v.registros,
      codigos: [...v.codigos].sort(), principal: v.clave === g, separada: sepId.has(v.clave), separarId: sepId.get(v.clave) || null }));
    return { grupo: g, clienta: corta(c, canon), variantes: vars.sort((a, b) => Number(b.principal) - Number(a.principal)) };
  }).sort((a, b) => s(a.clienta.nombre).localeCompare(s(b.clienta.nombre)));
  const manual = AL.filas.filter((r) => s(r.tipo) === "alias" && !r.deshecho_at).map((r) => ({
    id: s(r.id), de: corta(porKey.get(s(r.clave)), s(r.clave)), a: corta(porKey.get(resolverClave(s(r.destino))), resolverClave(s(r.destino))), por: s(r.por), fecha: s(r.created_at), motivo: s(r.motivo),
  }));
  const noSon = AL.filas.filter((r) => s(r.tipo) === "no_dup" && !r.deshecho_at).map((r) => ({ id: s(r.id), a: corta(porKey.get(canonDeClave(s(r.clave))), s(r.clave)), b: corta(porKey.get(canonDeClave(s(r.destino))), s(r.destino)), por: s(r.por), fecha: s(r.created_at) }));
  const sug = sugerencias(cli, AL.noDup);
  const lim = Math.min(600, Math.max(20, Number(p.limit) || 300));
  return { ok: true, auto, manual, noSon, sugerencias: sug.slice(0, lim).map((x) => ({ a: corta(x.a as Row, ""), b: corta(x.b as Row, ""), motivos: x.motivos, puntaje: x.puntaje })),
    totales: { auto: auto.length, autoSeparadas: auto.filter((g) => g.variantes.some((v) => v.separada)).length, manual: manual.length, sugerencias: sug.length, noSon: noSon.length } };
});

async function insertar(ctx: Ctx, ses: Ses, fila: Row): Promise<string> {
  const id = nuevoId(ctx);
  await ctx.db.write(actorOf(ses), "beta_cliente_alias", "insert", {}, { id, por: ses.name, created_at: ctx.now.toISOString(), ...fila });
  return id;
}
extend("cl_dup_unir", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  await cargarAlias(ctx.db, true);
  const a = canonDeClave(s(p.a)), b = canonDeClave(s(p.b));
  if (!/^(c|n|t|r):./.test(a) || !/^(c|n|t|r):./.test(b)) return { error: "Elige las dos clientas" };
  if (a === b) return { error: "Ya son la misma clienta" };
  const principal = canonDeClave(s(p.principal)) === b ? b : a, otra = principal === a ? b : a;
  const id = await insertar(ctx, ses, { tipo: "alias", clave: otra, destino: principal, motivo: s(p.motivo).slice(0, 300) || null });
  for (const r of estadoAlias().filas) if (s(r.tipo) === "no_dup" && !r.deshecho_at && parClave(canonDeClave(s(r.clave)), canonDeClave(s(r.destino))) === parClave(a, b))
    await ctx.db.write(actorOf(ses), "beta_cliente_alias", "update", { id: s(r.id) }, { deshecho_at: ctx.now.toISOString(), deshecho_por: ses.name });
  await logAccion(ctx.db, actorOf(ses), "CLIENTA UNIR", `${otra} → ${principal}${s(p.motivo) ? " · " + s(p.motivo).slice(0, 120) : ""} · ${id}`);
  await cargarAlias(ctx.db, true);
  return { ok: true, id, principal, unida: otra };
});
extend("cl_dup_nodup", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const a = canonDeClave(s(p.a)), b = canonDeClave(s(p.b));
  if (!a || !b || a === b) return { error: "Elige dos clientas distintas" };
  const id = await insertar(ctx, ses, { tipo: "no_dup", clave: a, destino: b });
  await logAccion(ctx.db, actorOf(ses), "CLIENTA NO SON LA MISMA", `${a} ≠ ${b} · ${id}`);
  await cargarAlias(ctx.db, true);
  return { ok: true, id };
});
/** Saca una variante (p. ej. c:1716768062001) de su grupo automático por cédula. */
extend("cl_dup_separar", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  const k = s(p.clave);
  if (!/^c:./.test(k)) return { error: "Variante inválida" };
  if ("c:" + normCedula(k.slice(2)) === k) return { error: "Esa es la cédula principal del grupo: separa las otras variantes" };
  const id = await insertar(ctx, ses, { tipo: "separar", clave: k, motivo: s(p.motivo).slice(0, 300) || null });
  await logAccion(ctx.db, actorOf(ses), "CLIENTA SEPARAR", `${k} sale de c:${normCedula(k.slice(2))} · ${id}`);
  await cargarAlias(ctx.db, true);
  return { ok: true, id };
});
/** Deshacer: una unión a mano, una separación o un «no son la misma». */
extend("cl_dup_deshacer", "any", async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administradores" };
  await cargarAlias(ctx.db, true);
  const r = estadoAlias().filas.find((x) => s(x.id) === s(p.id) && !x.deshecho_at);
  if (!r) return { error: "No encontré esa unión" };
  await ctx.db.write(actorOf(ses), "beta_cliente_alias", "update", { id: s(r.id) }, { deshecho_at: ctx.now.toISOString(), deshecho_por: ses.name });
  await logAccion(ctx.db, actorOf(ses), "CLIENTA DESHACER " + s(r.tipo).toUpperCase(), `${s(r.clave)}${r.destino ? " / " + s(r.destino) : ""} · ${s(r.id)}`);
  await cargarAlias(ctx.db, true);
  return { ok: true };
});
