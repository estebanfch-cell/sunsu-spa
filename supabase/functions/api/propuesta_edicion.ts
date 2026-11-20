import { leerFecha, fechaComo } from "./fecha_flexible.ts";
// TK154 (Emilia t671u): «Me llegó esta solicitud, pero no sé qué me está pidiendo que cambie… debería hacerme ver
// los cambios, y ahí un lockdown, veo los cambios y apruebo».
// Propuesta estructurada (sin I/O): la chica propone, el ticket real no cambia; la admin ve Antes → Después y aprueba.
import { n, round2, s, type Row } from "./domain.ts";

export type TipoPropuesta = "editar" | "anular";

/** Campos editables de la cabecera que se comparan (nunca teléfono ni email). */
export const CAMPOS_DIFF: [string, string][] = [
  ["nombre", "Nombre"], ["apellido", "Apellido"], ["cedula", "CI"], ["factura", "Factura"],
  ["cosmetologa", "Atendió"], ["notas", "Notas"], ["recomendaciones", "Recomendaciones"],
  ["retorno", "Fecha de regreso"], ["retornoTrat", "Tratamiento recomendado"], ["cabina", "Cabina"], ["local", "Local"],
  ["justificacion_descuento", "Motivo del descuento"],
];
const PRIVADOS = new Set(["telefono", "email", "celular", "whatsapp"]);

const norm = (v: unknown) => s(v).replace(/\s+/g, " ").trim();
export const money = (v: unknown) => "$" + (Number(v) || 0).toFixed(2);

/** Diferencias de cabecera. Solo cuentan los campos que la propuesta trae; un vacío solo cuenta si `explicitos`. */
export function diffCampos(antes: Row, despues: Row, explicitos = false): Row[] {
  const out: Row[] = [];
  for (const [k, lbl] of CAMPOS_DIFF) {
    if (PRIVADOS.has(k) || !(k in despues) || despues[k] === undefined || despues[k] === null) continue;
    const a = norm(antes[k]), d = norm(despues[k]);
    if (!d && !explicitos) continue;
    if (k === "retorno") {
      // TK185: misma fecha escrita distinto (12/19/2026 vs 2026-12-19) no es un cambio; se muestra como ellas la escriben.
      const fa = leerFecha(a), fd = leerFecha(d);
      if ((fa ? fa.iso : a) === (fd ? fd.iso : d)) continue;
      out.push({ campo: lbl, clave: k, antes: fa ? fechaComo(fa.iso, fd ? fd.estilo : "dmy") : (a || "—"), despues: d || "—" });
      continue;
    }
    if (a === d) continue;
    out.push({ campo: lbl, clave: k, antes: a || "—", despues: d || "—" });
  }
  return out;
}

function descTxt(d: unknown): string {
  const x = d && typeof d === "object" ? d as Row : {};
  const t = s(x.tipo), v = n(x.valor);
  if (!t || !(v > 0)) return "Sin descuento";
  return t === "pct" || t === "%" || t === "porcentaje" ? v + "%" : money(v);
}

/** Cambio del descuento del ticket (si la propuesta lo trae). */
export function diffDescuento(antes: unknown, despues: unknown): Row | null {
  if (despues === undefined || despues === null) return null;
  const a = descTxt(antes), d = descTxt(despues);
  return a === d ? null : { campo: "Descuento", clave: "descuento", antes: a, despues: d };
}

function lineaTxt(l: Row): string {
  const c = n(l.cantidad) || 1;
  const tot = l.total != null ? n(l.total) : round2(c * n(l.precio_unit));
  return c + " × " + money(l.precio_unit) + " = " + money(tot);
}

/**
 * Lista legible tipo diff: + agregada (verde), − eliminada (rojo), ~ modificada (ámbar).
 * Nombre completo siempre (la UI no lo recorta).
 */
export function diffLegible(diff: Row | null | undefined): Row[] {
  if (!diff || typeof diff !== "object") return [];
  const out: Row[] = [];
  for (const c of (Array.isArray(diff.cabecera) ? diff.cabecera : []) as Row[]) {
    out.push({ signo: "~", clase: "mod", titulo: s(c.campo), detalle: "Antes: " + (s(c.antes) || "—") + " → Después: " + (s(c.despues) || "—") });
  }
  for (const l of (Array.isArray(diff.lineas) ? diff.lineas : []) as Row[]) {
    const nom = s(l.nombre) || s(l.sku);
    if (l.estado === "agregada") out.push({ signo: "+", clase: "add", titulo: nom, detalle: lineaTxt(l) });
    else if (l.estado === "eliminada") out.push({ signo: "−", clase: "del", titulo: nom, detalle: lineaTxt(l) });
    else if (l.estado === "modificada") {
      const ant = { cantidad: l.antes_cantidad, precio_unit: l.antes_precio_unit, total: l.antes_total };
      out.push({ signo: "~", clase: "mod", titulo: nom, detalle: "Antes: " + lineaTxt(ant) + " → Después: " + lineaTxt(l) });
    }
  }
  return out;
}

/** «Total: $125.00 → $30.00» solo si cambió. */
export function cambioTotal(diff: Row | null | undefined): Row | null {
  const t = diff && typeof diff.totales === "object" ? diff.totales as Row : null;
  if (!t) return null;
  const a = n((t.antes as Row | undefined)?.total), d = n((t.despues as Row | undefined)?.total);
  if (round2(a) === round2(d)) return null;
  return { antes: round2(a), despues: round2(d), texto: "Total: " + money(a) + " → " + money(d) };
}

export function propuestaEdicion(antes: Row, despues: Row, diff: Row, motivo: string): Row {
  return {
    v: 154, tipo: "editar" as TipoPropuesta, motivo,
    antes, despues, diff, legible: diffLegible(diff), total: cambioTotal(diff),
  };
}

export function propuestaAnulacion(antes: Row, motivo: string): Row {
  const tot = n((antes.totales as Row | undefined)?.total);
  return {
    v: 154, tipo: "anular" as TipoPropuesta, motivo, antes,
    despues: { anulado: true, totales: { total: 0 } },
    legible: [{ signo: "−", clase: "del", titulo: "Anular el ticket completo", detalle: "Se anularía " + money(tot) }],
    total: { antes: round2(tot), despues: 0, texto: "Total que se anularía: " + money(tot) },
  };
}

export const AVISO_LEGACY = "Solicitud anterior sin detalle de cambios; al aprobar se habilitará la edición manual";

/** Lo que ve la admin en la tarjeta «Solicitud pendiente» (y el resumen de Alertas). */
export function resumenSolicitudTicket(sol: Row): Row {
  const prop = (sol.propuestos && typeof sol.propuestos === "object" ? sol.propuestos : {}) as Row;
  const P = (prop.propuesta && typeof prop.propuesta === "object" ? prop.propuesta : null) as Row | null;
  const anular = s(sol.tipo) === "eliminacion" || s(P?.tipo) === "anular";
  const diff = (P?.diff || prop.diff || null) as Row | null;
  const totAntes = n(((P?.antes as Row | undefined)?.totales as Row | undefined)?.total) || n((sol.antes as Row | undefined)?.total) || n(((sol.antes as Row | undefined)?.totales as Row | undefined)?.total);
  const tieneCambios = !!diff && (diffLegible(diff).length > 0 || !!cambioTotal(diff));
  const legacy = !anular && !tieneCambios && !(Array.isArray(prop.lineas) || (prop.datos && typeof prop.datos === "object" && Object.keys(prop.datos as Row).length));
  return {
    id: sol.id, solicitante: sol.solicitante, creado: sol.creado, motivo: sol.motivo,
    tipo: anular ? "anular" : legacy ? "legacy" : "editar",
    diff, form: prop.form, edicion_form: prop.edicion_form === true,
    legible: anular ? (P?.legible || propuestaAnulacion({ totales: { total: totAntes } }, s(sol.motivo)).legible) : diffLegible(diff),
    total: anular ? { antes: totAntes, despues: 0, texto: "Total que se anularía: " + money(totAntes) } : cambioTotal(diff),
    legacy,
    ...(legacy ? { aviso: AVISO_LEGACY } : {}),
    lockdown: true,
  };
}

/** Quita lo que solo sirve para mostrar antes de aplicar los cambios reales. */
export function soloAplicable(propuestos: Row): Row {
  const r = { ...propuestos };
  delete r.propuesta; delete r.diff;
  return r;
}

export function propuestaVacia(propuestos: Row): boolean {
  const r = soloAplicable(propuestos || {});
  return !Object.keys(r).filter((k) => k !== "_via" && r[k] != null && r[k] !== "" && !(typeof r[k] === "object" && !Array.isArray(r[k]) && !Object.keys(r[k] as Row).length)).length;
}

/** Mapa clave → resumen corto, para pintar la lista de Tickets en violeta. */
export function pendientesPorClave(sols: Row[]): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const r of sols) {
    if (s(r.tabla) !== "ticket_detalle" || s(r.estado) !== "pendiente" || r.prueba === true) continue;
    m.set(s(r.fila), { id: r.id, tipo: s(r.tipo) === "eliminacion" ? "anular" : "editar", solicitante: s(r.solicitante), creado: s(r.creado) });
  }
  return m;
}
