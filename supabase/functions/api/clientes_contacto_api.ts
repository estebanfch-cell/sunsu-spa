// TK95: acción admin para rellenar contactos y el mismo paso en el import
// (facturas nuevas / citas de Acuity). Solo vacíos; log de ambiguos sin PII.
import { extend } from "./handlers.ts";
import { actorOf, logAccion } from "./lib.ts";
import type { Ctx, Ses } from "./lib.ts";
import { esAdmin } from "./permisos.ts";
import { ADMIN, normCedula, normNombre, s, type Row } from "./domain.ts";
import { citasRango } from "./acuity.ts";
import { acuityReq } from "./acuity.ts";
import {
  contactoDeAcuity, contactoDeAntigua, contactoDeFactura,
  rellenarContactos, resumenRelleno,
  type ClienteDestino, type ContactoFuente, type RellenoResultado,
} from "./clientes_contacto.ts";

const FALTA = "Falta la tabla beta_clientes";

async function todas(ctx: Ctx, t: string): Promise<Row[]> { try { return await ctx.db.all(t); } catch { return []; } }

function keyDe(ced: unknown, nombre: unknown): string {
  const c = normCedula(ced);
  if (c) return "c:" + c;
  const n = normNombre(nombre);
  return n ? "n:" + n : "";
}

function nombreDe(r: Row): string {
  return s(r.nombre) || [s(r.nombres), s(r.apellido)].filter(Boolean).join(" ") || s((r.datos as Row | undefined)?.nombre) || "";
}

function destinosDeTablas(clientes: Row[], registro: Row[]): ClienteDestino[] {
  const ya = new Set<string>();
  const out: ClienteDestino[] = [];
  for (const r of clientes) {
    if (r.borrado === true) continue;
    const d = (r.datos && typeof r.datos === "object" ? r.datos as Row : {}) as Row;
    const key = s(r.key);
    if (!key || ya.has(key)) continue;
    ya.add(key);
    out.push({
      key,
      cedula: s(r.cedula) || s(d.cedula) || (key.startsWith("c:") ? key.slice(2) : ""),
      nombre: nombreDe({ ...d, ...r }),
      telefono: s(d.telefono) || s(r.telefono),
      email: s(d.email) || s(r.email),
    });
  }
  for (const r of registro) {
    if (r.borrado_at) continue;
    const key = keyDe(r.cedula, [s(r.nombre), s(r.apellido)].filter(Boolean).join(" "));
    if (!key || ya.has(key)) continue;
    ya.add(key);
    out.push({
      key,
      cedula: s(r.cedula),
      nombre: [s(r.nombre), s(r.apellido)].filter(Boolean).join(" "),
      telefono: s(r.telefono),
      email: s(r.email),
    });
  }
  return out;
}

export async function fuentesContacto(ctx: Ctx, extras: ContactoFuente[] = []): Promise<ContactoFuente[]> {
  const out: ContactoFuente[] = [...extras];
  for (const f of await todas(ctx, "beta_migo_facturas_vivo")) {
    const c = contactoDeFactura(f);
    if (c) out.push(c);
  }
  for (const r of await todas(ctx, "clientas_antiguas")) {
    const c = contactoDeAntigua(r);
    if (c) out.push(c);
  }
  return out;
}

async function fuentesAcuity(ctx: Ctx): Promise<ContactoFuente[]> {
  const out: ContactoFuente[] = [];
  try {
    const hoy = new Date(ctx.now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
    const desde = new Date(new Date(hoy + "T12:00:00Z").getTime() - 400 * 86400000).toISOString().slice(0, 10);
    const L = await citasRango(ctx, desde, hoy, { ms: 120000 });
    if (Array.isArray(L)) {
      for (const a of L) {
        const c = contactoDeAcuity(a as Row);
        if (c) out.push(c);
      }
    }
  } catch { /* Acuity no configurado o ventana grande: se intenta /clients */ }
  try {
    const r = await acuityReq(ctx, "clients?max=1000");
    if (r && !("error" in r) && Array.isArray(r.data)) {
      for (const a of r.data as Row[]) {
        const c = contactoDeAcuity(a);
        if (c) out.push(c);
      }
    }
  } catch { /* sin /clients no pasa nada: las citas ya cubren a quien agendó */ }
  return out;
}

async function aplicar(ctx: Ctx, actor: string, destinos: ClienteDestino[], res: RellenoResultado): Promise<void> {
  if (!res.updates.length) return;
  const porKey = new Map(destinos.map((d) => [d.key, d]));
  let existentes: Row[] = [];
  try { existentes = await todas(ctx, "beta_clientes"); } catch { throw new Error(FALTA); }
  const mapa = new Map(existentes.map((r) => [s(r.key), r]));
  const now = ctx.now.toISOString();
  for (const u of res.updates) {
    const cur = mapa.get(u.key);
    const d0 = (cur?.datos && typeof cur.datos === "object" ? { ...(cur.datos as Row) } : {}) as Row;
    const dest = porKey.get(u.key);
    if (u.telefono) d0.telefono = u.telefono;
    if (u.email) d0.email = u.email;
    const fuentes = [u.fuenteTel && "teléfono desde " + u.fuenteTel, u.fuenteEmail && "email desde " + u.fuenteEmail].filter(Boolean).join(", ");
    const histItem = { fecha: now, actor, accion: "contacto rellenado", detalle: fuentes };
    const hist = [...(Array.isArray(cur?.historial) ? cur!.historial as Row[] : []), histItem].slice(-100);
    const fila: Row = {
      datos: d0,
      historial: hist,
      actualizado_por: actor,
      updated_at: now,
    };
    if (u.telefono && !s(cur?.telefono)) fila.telefono = u.telefono;
    if (dest?.cedula && !s(cur?.cedula)) fila.cedula = dest.cedula;
    if (dest?.nombre && !s(cur?.nombre)) fila.nombre = dest.nombre;
    if (cur) await ctx.db.write(actor, "beta_clientes", "update", { key: u.key }, fila);
    else {
      await ctx.db.write(actor, "beta_clientes", "insert", {}, {
        key: u.key, datos: d0, historial: hist, actualizado_por: actor, updated_at: now,
        telefono: u.telefono || null, cedula: dest?.cedula || null, nombre: dest?.nombre || null,
        origen: "relleno-contacto", created_at: now, borrado: false,
      });
    }
  }
  try {
    await logAccion(ctx.db, actor, "CONTACTO RELLENADO", "tel " + res.telFilled + ", email " + res.emailFilled + ", ambiguos " + res.ambiguous.length);
  } catch { /* el relleno ya quedó */ }
}

/** Rellena vacíos con las fuentes dadas (o las de la base + Acuity si se pide). */
export async function rellenarContactosClientes(ctx: Ctx, actor: string, opts: { acuity?: boolean; extras?: ContactoFuente[] } = {}): Promise<Row> {
  const destinos = destinosDeTablas(await todas(ctx, "beta_clientes"), await todas(ctx, "clientas_registro"));
  const fuentes = await fuentesContacto(ctx, opts.extras || []);
  if (opts.acuity !== false) fuentes.push(...await fuentesAcuity(ctx));
  const res = rellenarContactos(destinos, fuentes);
  await aplicar(ctx, actor, destinos, res);
  return { ...resumenRelleno(res), aplicados: res.updates.length };
}

/** Relleno chico, para el import horario o al cargar la agenda: solo las fuentes que ya vienen en memoria. */
export async function rellenarContactosDeFuentes(ctx: Ctx, actor: string, extras: ContactoFuente[]): Promise<Row | null> {
  if (!extras.length) return null;
  try {
    const destinos = destinosDeTablas(await todas(ctx, "beta_clientes"), await todas(ctx, "clientas_registro"));
    const fuentes = [...extras, ...await fuentesContacto(ctx)];
    const res = rellenarContactos(destinos, fuentes);
    if (!res.updates.length) return resumenRelleno(res);
    await aplicar(ctx, actor, destinos, res);
    return { ...resumenRelleno(res), aplicados: res.updates.length };
  } catch {
    return null;
  }
}

extend("cl_rellenar_contactos", ADMIN, async (p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo un admin puede rellenar contactos" };
  return await rellenarContactosClientes(ctx, actorOf(ses), { acuity: p.sin_acuity !== true });
});
