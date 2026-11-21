/** TK206: no crear un segundo ticket idéntico si el primero acaba de entrar (doble toque / reintento). */
import { esCancelado, facialSku, n, normCedula, normNombre, productQtys, s, type Row } from "./domain.ts";

export const VENTANA_TICKET_DUP_MS = 2 * 60 * 1000;

function facialClave(v: unknown): string {
  return (facialSku(v) || s(v).toUpperCase().replace(/\s+/g, " ").trim());
}
function prodsClave(p: Row): string {
  const q = (p.productos && typeof p.productos === "object") ? p.productos as Row : productQtys(p);
  return Object.keys(q).filter((k) => n(q[k]) > 0).sort().map((k) => k + ":" + n(q[k])).join(",");
}

/** Huella de un alta: misma clienta, mismo facial, mismo canje, mismos extras/productos y total. */
export function huellaAltaTicket(p: Row): string {
  return [
    normCedula(p.cedula ?? p.id_3),
    facialClave(p.facial ?? p.facial_hecho),
    String(Math.round(n(p.estimado) * 100)),
    s(p.colQ ?? p.paquete).replace(/\s+/g, " ").trim().toUpperCase(),
    s(p.extras ?? p.servicios_adicionales).replace(/\s+/g, " ").trim().toUpperCase(),
    prodsClave(p),
  ].join("|");
}

function msDe(r: Row, now: Date): number {
  const c = Date.parse(s(r.created_at));
  if (Number.isFinite(c)) return c;
  const t = Date.parse(s(r.timestamp));
  return Number.isFinite(t) ? t : now.getTime();
}

/** Si ya existe un ticket igual de la misma cosmetóloga en la ventana, se devuelve ese (no se crea otro). */
export function ticketRecienCreado(rows: Row[], p: Row, now: Date, ventanaMs = VENTANA_TICKET_DUP_MS): Row | null {
  const h = huellaAltaTicket(p);
  if (!normCedula(p.cedula ?? p.id_3)) return null;
  const cosm = normNombre(p.cosmetologa ?? p.atendido_por);
  const t1 = now.getTime();
  for (const r of rows) {
    if (esCancelado(r)) continue;
    if (Math.abs(t1 - msDe(r, now)) > ventanaMs) continue;
    if (cosm && s(r.atendido_por) && normNombre(r.atendido_por) !== cosm) continue;
    const h2 = huellaAltaTicket({
      cedula: r.id_3, facial: r.facial_hecho, estimado: r.estimado,
      colQ: r.paquete, extras: r.servicios_adicionales, productos: productQtys(r),
    });
    if (h === h2) return r;
  }
  return null;
}
