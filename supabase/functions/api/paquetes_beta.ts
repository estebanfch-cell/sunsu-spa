// Paquetes estilo MineCore (Emilia 17/11): la fila de `paquetes` (hoja) + el ajuste beta (beta_paquete_ajustes)
// que la importación horaria no toca: sesiones, clienta, producto, fecha de compra, quién marcó y baja.
import { codigoPaquete, n, packSesiones, s, USO_FIELDS, type Row } from "./domain.ts";

/** «14/11/26 Facial Reset 3x1 · Evelyn» o «2026-11-14» → fecha ISO, facial y cosmetóloga. */
export function parseUso(txt: unknown): { fecha: string; facial: string; cosmetologa: string } {
  const t = s(txt).trim();
  if (!t) return { fecha: "", facial: "", cosmetologa: "" };
  let fecha = "", resto = t;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+Z?)?\s*(.*)$/);
  if (m) { fecha = `${m[1]}-${m[2]}-${m[3]}`; resto = m[4]; }
  else if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(.*)$/))) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    fecha = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; resto = m[4];
  }
  const [facial, cos] = resto.split(" · ");
  return { fecha, facial: s(facial).trim(), cosmetologa: s(cos).trim() };
}

/** Texto que guarda la hoja al marcar una sesión (mismo formato que el sistema). */
export function textoUso(ymd: string, facial: string, cosmetologa: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${s(y).slice(-2)}` + (facial ? " " + facial : "") + (cosmetologa ? " · " + cosmetologa : "");
}

export function aplicarAjuste(r: Row, aj?: Row | null): Row {
  if (!aj) return r;
  const d = aj.datos && typeof aj.datos === "object" ? aj.datos as Row : {};
  const out: Row = { ...r };
  for (const k of ["cedula", "nombres", "apellidos", "sku", "paquete", "vendido_por"]) if (d[k] != null && s(d[k]) !== "") out[k] = d[k];
  if (s(d.fecha_compra).match(/^\d{4}-\d{2}-\d{2}$/)) { const [y, m, dd] = s(d.fecha_compra).split("-"); out.ano = n(y); out.mes = n(m); out.dia = n(dd); }
  if (n(d.sesiones) > 0) out.__sesiones = Math.min(6, Math.max(1, n(d.sesiones)));
  if (s(d.cliente_codigo)) out.__cliente_codigo = s(d.cliente_codigo);
  if (aj.borrado === true) out.__borrado = true;
  return out;
}

export function sesionesDe(r: Row): number {
  const usos = USO_FIELDS.map(([u, f]) => ({ usado: r[u] === true || r[u] === "true" || !!s(r[f]), fecha: s(r[f]) }));
  return n(r.__sesiones) > 0 ? n(r.__sesiones) : packSesiones(s(r.sku), s(r.paquete), usos);
}

export function fechaCompra(r: Row): string {
  if (!(n(r.ano) > 0 && n(r.mes) > 0 && n(r.dia) > 0)) return "";
  const y = n(r.ano) < 100 ? 2000 + n(r.ano) : n(r.ano);
  return `${y}-${String(n(r.mes)).padStart(2, "0")}-${String(n(r.dia)).padStart(2, "0")}`;
}

export function vistaPaquete(r0: Row, aj?: Row | null): Row {
  const r = aplicarAjuste(r0, aj);
  const total = sesionesDe(r);
  const meta = aj && aj.usos && typeof aj.usos === "object" ? aj.usos as Row : {};
  const o = r.orig && typeof r.orig === "object" ? r.orig as Row : {};
  const sesiones = USO_FIELDS.slice(0, Math.max(total, 1)).map(([u, f], i) => {
    const txt = s(r[f]), usado = r[u] === true || r[u] === "true" || !!txt;
    const pu = parseUso(txt), mt = (meta[String(i + 1)] || {}) as Row;
    return { slot: i + 1, usado, fecha: pu.fecha, texto: txt, facial: pu.facial, cosmetologa: s(mt.cosmetologa) || pu.cosmetologa, ticket: s(mt.ticket) || (n(o.ultima_marca_slot) === i + 1 ? s(o.ultima_marca_ticket) : ""), por: s(mt.por) };
  });
  const usados = sesiones.filter((x) => x.usado).length;
  return {
    id: r.id, fila: r.sheet_row, codigo: codigoPaquete(r) || (r.sheet_row != null ? "PACK-" + r.sheet_row : ""), cedula: s(r.cedula).split(".")[0],
    nombre: s(r.nombres), apellido: s(r.apellidos), clienteCodigo: s(r.__cliente_codigo), sku: s(r.sku), paquete: s(r.paquete) || s(r.sku) || "Paquete",
    vendidoPor: s(r.vendido_por), fechaCompra: fechaCompra(r), ticketOrigen: s(o.ticket), notas: s(r.notas),
    total, usados, pendientes: Math.max(0, total - usados), estado: o.anulado === true ? "anulado" : usados >= total ? "completo" : usados ? "en_curso" : "nuevo",
    anulado: o.anulado === true, anuladoPor: s(o.cancelado_por_ticket), anuladoMotivo: s(o.cancelado_motivo), factura: s(r.factura).replace(/\.0+$/, ""),
    sesiones, borrado: !!r.borrado_at || r.__borrado === true, ajustado: !!aj,
    historial: aj && Array.isArray(aj.historial) ? aj.historial : [],
  };
}
