// TK140: staff del ticket (Atendido por) y default al enviar un borrador.
import { esAdmin, normalizarRol } from "./permisos.ts";
import { n, nombreEsAdmin, normNombre, s, type Row } from "./domain.ts";
import type { Ctx, Ses } from "./lib.ts";

export type StaffTk = { id: string; nombre: string; short: string; rol: string; etiqueta: string };

export function staffDeFilas(usuarios: Row[], cosm: Row[] = []): StaffTk[] {
  const out: StaffTk[] = [];
  const seen = new Set<string>();
  const mostrar = new Map<string, string>();
  for (const c of cosm) {
    const nom = s(c.nombre), etq = s(c.nombre_mostrar) || nom;
    if (nom) mostrar.set(normNombre(nom), etq);
  }
  const add = (id: string, nombre: string, short: string, rol: string, bloqueado?: unknown, activo?: unknown) => {
    if (bloqueado === true || activo === false) return;
    const nom = s(nombre).trim();
    if (!nom) return;
    const key = normNombre(nom);
    if (seen.has(key)) return;
    seen.add(key);
    const etq = mostrar.get(key) || s(short) || nom;
    out.push({ id: s(id) || key, nombre: nom, short: s(short) || etq, rol: normalizarRol(s(rol) || "staff"), etiqueta: etq });
  };
  for (const u of usuarios) add(s(u.id), s(u.nombre || u.name), s(u.short), s(u.rol || u.role), u.bloqueado, u.activo);
  for (const c of cosm) {
    if (c.activa === false) continue;
    add(s(c.nombre), s(c.nombre), s(c.nombre_mostrar || c.nombre), c.es_cosmetologa === false ? "recepcion" : "cosmetologa");
  }
  return out.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
}

export async function listaStaffActivo(ctx: Ctx): Promise<StaffTk[]> {
  let users: Row[] = [];
  try { users = await ctx.db.all("app_usuarios"); } catch { users = []; }
  if (!users.length) {
    try { users = await ctx.db.all("usuarios"); } catch { users = []; }
  }
  let cosm: Row[] = [];
  try { cosm = await ctx.db.all("cosmetologas"); } catch { cosm = []; }
  return staffDeFilas(users, cosm);
}

export function canonStaff(nombre: string, staff: StaffTk[]): string {
  const key = normNombre(nombre);
  if (!key) return "";
  const first = key.split(" ")[0] || key;
  for (const u of staff) {
    const nomb = normNombre(u.nombre), sh = normNombre(u.short), id = normNombre(u.id), et = normNombre(u.etiqueta);
    if (nomb === key || sh === key || id === key || et === key) return u.nombre;
  }
  if (first.length >= 3) {
    for (const u of staff) {
      const nomb = normNombre(u.nombre), sh = normNombre(u.short), id = normNombre(u.id), et = normNombre(u.etiqueta);
      if (nomb.startsWith(first + " ") || sh === first || id === first || et === first || nomb === first) return u.nombre;
    }
  }
  return s(nombre).trim();
}

export function adminsDeStaff(staff: StaffTk[]): { nombre?: string; short?: string; id?: string }[] {
  return staff.filter((u) => esAdmin(u.rol)).map((u) => ({ nombre: u.nombre, short: u.short, id: u.id }));
}

export function esNombreAdmin(nombre: string, staff: StaffTk[]): boolean {
  return nombreEsAdmin(nombre, adminsDeStaff(staff));
}

export function cosmPreferidaDeBorrador(b0: Row | null | undefined): string {
  if (!b0) return "";
  const d = (b0.datos && typeof b0.datos === "object" ? b0.datos : {}) as Row;
  return s(d.cosmetologa) || s(b0.asignado_a) || s(d.completado_por) || s(d.atendido_por) || "";
}

/** Al crear un ticket: si un admin envía un borrador de una chica y el payload trae al admin (front viejo), se queda la chica.
 *  Si el admin eligió a alguien en el dropdown (`cosmetologa_elegida`), se respeta esa elección. */
export function cosmParaAltaTicket(opts: {
  payload: string;
  sesNombre: string;
  rol: string;
  elegida?: boolean;
  borrador?: Row | null;
  staff: StaffTk[];
}): string {
  const staff = opts.staff;
  const deBorrador = canonStaff(cosmPreferidaDeBorrador(opts.borrador), staff);
  const payload = canonStaff(opts.payload, staff);
  if (opts.elegida && payload) return payload;
  if (deBorrador && esAdmin(opts.rol) && (!payload || esNombreAdmin(payload, staff)) && !esNombreAdmin(deBorrador, staff)) {
    return deBorrador;
  }
  return payload || deBorrador || canonStaff(opts.sesNombre, staff) || s(opts.sesNombre).trim();
}

export function matchTicket(row: Row): Row {
  return row.id != null && n(row.id) ? { id: row.id } : { sheet_row: row.sheet_row };
}
