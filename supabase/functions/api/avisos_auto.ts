// TK223 / TK224 (Emilia): un aviso resuelto se apaga solo. Las filas de beta_notificaciones
// y los erp_avisos de bajo mínimo se reevalúan al cargar y al resolver, sin
// esperar a que alguien pulse ×. El dismiss manual (notif_leer / ×) se mantiene.
// TK224: si el ticket ya está cancelado o no existe, la solicitud pendiente
// y su aviso (incluido el virtual sol:) también se apagan. No se toca el ticket.
import type { Ctx } from "./lib.ts";
import { s, type Row } from "./domain.ts";

/** Avisos informativos: se quedan hasta que la persona los lea o los descarte con ×. */
export const AVISOS_FYI = new Set([
  "solicitud_aprobada", "solicitud_rechazada",
  "permiso_aprobado", "permiso_rechazado",
  "conteo_aprobado", "conteo_devuelto",
]);

export type DatosAvisos = { solicitudes: Row[]; permisos: Row[]; conteos: Row[]; ticketsInactivos?: Set<string> };

export function ticketDeLink(link: string): string {
  const m = s(link).match(/#\/m\/tickets\/t\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export function permisoDeAviso(n: Row, permisos: Row[]): Row | undefined {
  const ref = s(n.ref_id);
  if (ref) {
    const hit = permisos.find((p) => s(p.id_1) === ref || String(p.sheet_row) === ref || String(p.id) === ref);
    if (hit) return hit;
  }
  const m = s(n.cuerpo || n.texto).match(/^(.+?)\s+pidió\s+(\S+)\s+del\s+(\d{4}-\d{2}-\d{2})\s+al\s+(\d{4}-\d{2}-\d{2})/i);
  if (!m) return undefined;
  const nombre = s(m[1]).trim().toLowerCase();
  const tipo = s(m[2]).trim().toLowerCase();
  const d1 = m[3], d2 = m[4];
  return permisos.find((p) => {
    const em = s(p.empleada).trim().toLowerCase();
    const tp = s(p.tipo).trim().toLowerCase();
    const fi = s(p.fecha_inicio).slice(0, 10);
    const ff = s(p.fecha_fin).slice(0, 10);
    return em === nombre && (tp === tipo || tp.includes(tipo) || tipo.includes(tp)) && fi === d1 && (ff === d2 || (!ff && d1 === d2));
  });
}

function ticketDeAviso(n: Row, sol?: Row): string {
  return s(sol && sol.fila) || ticketDeLink(s(n.link || n.ruta));
}

/** true = el aviso todavía describe un pendiente; false = ya se resolvió y debe apagarse. */
export function avisoSigueVigente(n: Row, data: DatosAvisos): boolean {
  const tipo = s(n.tipo);
  if (AVISOS_FYI.has(tipo)) return true;
  if (tipo === "edicion_ticket" || tipo === "solicitud") {
    const id = s(n.ref_id) || s(n.id).replace(/^sol:/, "");
    const sol = data.solicitudes.find((r) => s(r.id) === id);
    const fila = ticketDeAviso(n, sol);
    if (fila && data.ticketsInactivos && data.ticketsInactivos.has(fila)) return false;
    if (sol) return s(sol.estado) === "pendiente" && sol.prueba !== true;
    if (!fila) return false;
    return data.solicitudes.some((r) => s(r.fila) === fila && s(r.estado) === "pendiente" && r.prueba !== true);
  }
  if (tipo === "permiso") {
    const p = permisoDeAviso(n, data.permisos);
    if (!p) return true;
    return /pend/i.test(s(p.estado)) && !p.borrado_at;
  }
  if (tipo === "conteo" || tipo === "conteo_revision") {
    const ref = s(n.ref_id);
    const c = data.conteos.find((x) => s(x.id) === ref || s(x.numero) === ref);
    if (!c) return false;
    const est = s(c.estado);
    if (tipo === "conteo_revision") return est === "en_revision";
    return est !== "aprobado" && est !== "cancelado";
  }
  return true;
}

async function todas(ctx: Ctx, t: string): Promise<Row[]> {
  try { return await ctx.db.all(t); } catch { return []; }
}

export async function cargarTicketsInactivos(ctx: Ctx): Promise<Set<string>> {
  const out = new Set<string>();
  const add = (v: string) => { if (v) out.add(v); };
  for (const r of await todas(ctx, "beta_ticket_cancelados")) {
    add(s(r.clave)); add(s(r.so_num));
  }
  for (const t of ["tickets", "beta_tickets"]) {
    for (const r of await todas(ctx, t)) {
      const o = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
      if (o.anulado === true || o.cancelado === true || r.anulado === true || r.cancelado === true) {
        add(s(r.clave)); add(s(r.so_num));
      }
    }
  }
  return out;
}

export async function cargarDatosAvisos(ctx: Ctx): Promise<DatosAvisos> {
  const [solicitudes, permisos, conteos, ticketsInactivos] = await Promise.all([
    todas(ctx, "solicitudes_cambio"),
    todas(ctx, "permisos"),
    todas(ctx, "beta_conteos"),
    cargarTicketsInactivos(ctx),
  ]);
  return { solicitudes, permisos, conteos, ticketsInactivos };
}

/** Cierra solicitudes de ticket que ya están cancelados. No toca el ticket. */
export async function cerrarSolicitudesTicketInactivo(ctx: Ctx, actor: string, inactivos?: Set<string>): Promise<number> {
  const inact = inactivos || await cargarTicketsInactivos(ctx);
  if (!inact.size) return 0;
  const sols = await todas(ctx, "solicitudes_cambio");
  const now = ctx.now.toISOString();
  let n = 0;
  for (const r of sols) {
    if (s(r.tabla) !== "ticket_detalle" || s(r.estado) !== "pendiente" || r.prueba === true) continue;
    if (!inact.has(s(r.fila))) continue;
    try {
      await ctx.db.write(actor, "solicitudes_cambio", "update", { id: r.id }, {
        estado: "aprobado",
        resuelto_at: now,
        resuelto_por: actor,
        comentario: "auto: el ticket ya estaba cancelado o eliminado",
      });
      n++;
    } catch { /* no frena la lista */ }
  }
  return n;
}

const OCULTOS_PROP = new Set(["__antes", "__campos", "__payload", "_via", "_campos", "_cambios", "edicion_form", "form", "paqPick", "colQ", "facial_hecho", "servicios_adicionales", "diff", "propuesta", "lineas", "totales", "datos"]);

function normDato(v: unknown): string {
  return s(v).replace(/\s+/g, " ").trim().toLowerCase()
    .replace(/^(sí)$/i, "si").replace(/^(yes|true)$/i, "si").replace(/^(no|false)$/i, "no");
}

/** Extrae pares campo/después de una solicitud (sin claves internas). */
export function cambiosPropuestos(sol: Row): { clave: string; despues: string }[] {
  const prop = (sol.propuestos && typeof sol.propuestos === "object" ? sol.propuestos : {}) as Row;
  const out: { clave: string; despues: string }[] = [];
  const add = (clave: string, despues: unknown) => {
    if (!clave || OCULTOS_PROP.has(clave) || clave.charAt(0) === "_") return;
    if (despues == null || typeof despues === "object") return;
    out.push({ clave, despues: s(despues) });
  };
  if (Array.isArray(prop._cambios)) {
    for (const c of prop._cambios as Row[]) add(s(c.clave || c.campo || c.etiqueta), c.despues);
  }
  const P = (prop.propuesta && typeof prop.propuesta === "object" ? prop.propuesta : null) as Row | null;
  const after = (P && P.despues && typeof P.despues === "object" ? P.despues as Row : null);
  const datos = (prop.datos && typeof prop.datos === "object" ? prop.datos as Row : (after && after.datos && typeof after.datos === "object" ? after.datos as Row : null));
  if (datos) for (const k of Object.keys(datos)) add(k, datos[k]);
  if (after) {
    for (const k of Object.keys(after)) {
      if (k === "datos" || k === "lineas" || k === "totales" || k === "descuento") continue;
      add(k, after[k]);
    }
    const tot = after.totales && typeof after.totales === "object" ? after.totales as Row : null;
    if (tot && tot.total != null) add("total", tot.total);
  }
  for (const k of Object.keys(prop)) add(k, prop[k]);
  // unique by clave, last wins
  const seen = new Map<string, string>();
  for (const c of out) seen.set(c.clave, c.despues);
  return [...seen.entries()].map(([clave, despues]) => ({ clave, despues }));
}

function valorActual(actual: Row, clave: string): unknown {
  if (clave in actual) return actual[clave];
  const d = actual.datos && typeof actual.datos === "object" ? actual.datos as Row : null;
  if (d && clave in d) return d[clave];
  const aliases: Record<string, string[]> = {
    autorizaFotos: ["autoriza_fotos", "autoriza fotos"],
    autoriza_fotos: ["autorizaFotos"],
    retorno: ["fechaRetorno", "fecha_retorno"],
    total: ["estimado", "total"],
  };
  for (const a of aliases[clave] || []) {
    if (a in actual) return actual[a];
    if (d && a in d) return d[a];
  }
  return undefined;
}

/** true solo si hay cambios comparables y TODOS ya están en el registro actual. Si no hay certeza, false. */
export function solicitudYaReflejada(sol: Row, actual: Row | null | undefined): boolean {
  if (!actual) return false;
  const cambios = cambiosPropuestos(sol);
  if (!cambios.length) return false;
  return cambios.every((c) => {
    const v = valorActual(actual, c.clave);
    if (v === undefined) return false;
    return normDato(v) === normDato(c.despues);
  });
}

async function actualDeSolicitud(ctx: Ctx, sol: Row): Promise<Row | null> {
  const tabla = s(sol.tabla), fila = s(sol.fila);
  if (!fila) return null;
  if (tabla === "cliente_beta") {
    const rows = await todas(ctx, "beta_clientes");
    const hit = rows.find((r) => s(r.key) === fila || s(r.clave) === fila || s(r.id) === fila || s(r.cedula) === fila.replace(/^c:/, ""));
    return hit || null;
  }
  if (tabla === "ticket_detalle") {
    const cabs = await todas(ctx, "beta_tickets");
    const cab = cabs.find((r) => s(r.clave) === fila || s(r.so_num) === fila);
    if (cab) {
      const d = (cab.datos && typeof cab.datos === "object" ? cab.datos as Row : {});
      const tot = d.totales && typeof d.totales === "object" ? d.totales as Row : {};
      return { ...d, datos: d, total: tot.total ?? d.total ?? cab.estimado, clave: s(cab.clave) };
    }
    const tks = await todas(ctx, "tickets");
    const tk = tks.find((r) => s(r.clave) === fila || s(r.so_num) === fila);
    return tk || null;
  }
  return null;
}

/** Cierra solicitudes pendientes cuyo cambio ya está aplicado. No toca el ticket ni la ficha. */
export async function cerrarSolicitudesYaAplicadas(ctx: Ctx, actor: string): Promise<number> {
  const sols = await todas(ctx, "solicitudes_cambio");
  const now = ctx.now.toISOString();
  let n = 0;
  for (const r of sols) {
    if (s(r.estado) !== "pendiente" || r.prueba === true) continue;
    if (s(r.tabla) !== "cliente_beta" && s(r.tabla) !== "ticket_detalle") continue;
    let actual: Row | null = null;
    try { actual = await actualDeSolicitud(ctx, r); } catch { actual = null; }
    if (!solicitudYaReflejada(r, actual)) continue;
    try {
      await ctx.db.write(actor, "solicitudes_cambio", "update", { id: r.id }, {
        estado: "aprobado",
        resuelto_at: now,
        resuelto_por: actor,
        comentario: "auto: el cambio ya estaba aplicado",
      });
      n++;
    } catch { /* no frena la lista */ }
  }
  return n;
}

/** Marca leídas las notificaciones cuya condición ya no aplica. No borra tickets. */
export async function resolverAvisosObsoletos(ctx: Ctx, actor: string): Promise<number> {
  try { await cerrarSolicitudesTicketInactivo(ctx, actor); } catch { /* sigue con los avisos */ }
  try { await cerrarSolicitudesYaAplicadas(ctx, actor); } catch { /* sigue con los avisos */ }
  const rows = await todas(ctx, "beta_notificaciones");
  if (!rows.length) return 0;
  const data = await cargarDatosAvisos(ctx);
  const now = ctx.now.toISOString();
  let n = 0;
  for (const r of rows) {
    if (s(r.leida_at)) continue;
    if (avisoSigueVigente(r, data)) continue;
    try {
      await ctx.db.write(actor, "beta_notificaciones", "update", { id: r.id }, { leida_at: now });
      n++;
    } catch { /* no frena la lista */ }
  }
  return n;
}
