// TK132 (Emilia 19/11 13:25): el prellenado desde una factura Migo llena TODO lo que trae el RIDE
// (cédula/RUC, correo, teléfono +593, dirección) y deja el ticket ligado a la clienta por cédula
// (o la crea con esos datos al enviar). Migo solo se lee: los datos vienen del RIDE que sube el bot CUADRE.
import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { ADMIN, normCedula, s, type Row } from "./domain.ts";
import { consultar } from "./query.ts";

export interface ClienteFactura { cedula: string; email: string; telefono: string; direccion: string }

const CONSUMIDOR_FINAL = /^9{10,13}$/;

/** +593 y 9 dígitos (celular) u 8 (fijo); vacío si no es un número de Ecuador. */
export function telefonoEc(v: unknown): string {
  let d = s(v).replace(/\D/g, "");
  if (d.startsWith("593")) d = d.slice(3);
  d = d.replace(/^0+/, "");
  return d.length === 9 || d.length === 8 ? "+593" + d : "";
}

export function clienteDeFila(f: Row | null | undefined): ClienteFactura | null {
  if (!f) return null;
  const ced0 = s(f.cliente_ruc).trim();
  const cedula = ced0 && !CONSUMIDOR_FINAL.test(ced0) ? ced0 : "";
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(f.cliente_email).trim()) ? s(f.cliente_email).trim().toLowerCase() : "";
  const telefono = telefonoEc(f.cliente_telefono);
  const direccion = s(f.cliente_direccion).trim().slice(0, 200);
  if (!cedula && !email && !telefono && !direccion) return null;
  return { cedula, email, telefono, direccion };
}

export async function clienteDeFactura(ctx: Ctx, fac: string): Promise<ClienteFactura | null> {
  if (!s(fac)) return null;
  try {
    const r = (await consultar(ctx.db, "beta_migo_facturas_vivo", { cols: ["factura", "cliente_ruc", "cliente_email", "cliente_telefono", "cliente_direccion"], filtros: [{ col: "factura", op: "eq", val: s(fac) }], limite: 1 })).rows[0];
    return clienteDeFila(r);
  } catch {
    try { return clienteDeFila((await ctx.db.all("beta_migo_facturas_vivo")).find((x) => s(x.factura) === s(fac))); } catch { return null; }
  }
}

/** Ticket recién creado desde una factura: pone la cédula si falta y deja la ficha de la clienta con los datos del RIDE. */
export async function completarClienteDeFactura(ctx: Ctx, ses: Ses, fac: string, saved: Row | null, nombre: string, apellido: string): Promise<Row> {
  const c = await clienteDeFactura(ctx, fac);
  if (!c || !saved) return { ok: true, sinDatos: true };
  const actor = actorOf(ses);
  let cedula = s(saved.id_3);
  if (!cedula && c.cedula) {
    cedula = c.cedula;
    const match = saved.id != null && saved.id !== "" ? { id: saved.id } : { sheet_row: saved.sheet_row };
    try { await ctx.db.write(actor, "tickets", "update", match, { id_3: cedula }); } catch { /* el ticket ya quedó */ }
  }
  if (!normCedula(cedula)) return { ok: true, cedula: false };
  // La clienta es la de la cédula (clave c:<cédula>): si no tenía ficha, se crea aquí con los datos de la factura.
  try {
    const { propagarDesdeTicket } = await import("./clientes_beta_api.ts");
    const datos: Row = { nombre, apellido, cedula, email: c.email, telefono: c.telefono, direccion: c.direccion };
    await propagarDesdeTicket(ctx, { ...ses, rol: "admin" } as Ses, "c:" + normCedula(cedula), datos, s(saved.so_num) || s(saved.beta_num));
  } catch { /* la ficha se completa en el próximo cuadre */ }
  return { ok: true, cedula: true };
}

/** El bot CUADRE manda lo que leyó del RIDE (solo lectura de Migo). Nunca se devuelve ni se registra el dato. */
extend("migo_clientes_ride", ADMIN, async (p, ctx, ses) => {
  const L = (Array.isArray(p.clientes) ? p.clientes : []) as Row[];
  const vivos = new Set((await ctx.db.all("beta_migo_facturas_vivo")).map((f) => s(f.factura)));
  let act = 0;
  for (const x of L.slice(0, 2000)) {
    const fac = s(x.factura);
    if (!vivos.has(fac)) continue;
    const c = clienteDeFila({ cliente_ruc: x.ruc, cliente_email: x.email, cliente_telefono: x.telefono, cliente_direccion: x.direccion });
    if (!c) continue;
    const patch: Row = {};
    if (c.cedula) patch.cliente_ruc = c.cedula;
    if (c.email) patch.cliente_email = c.email;
    if (c.telefono) patch.cliente_telefono = c.telefono;
    if (c.direccion) patch.cliente_direccion = c.direccion;
    await ctx.db.write(actorOf(ses), "beta_migo_facturas_vivo", "update", { factura: fac }, patch);
    act++;
  }
  return { ok: true, actualizadas: act };
});
