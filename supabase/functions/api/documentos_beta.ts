// Documentos PDF de la clienta (K-Lift simetría y Focus Skin) cargados al bucket privado «cliente-documentos».
// La tabla beta_cliente_documentos la llena otro proceso; aquí solo se lee y se empareja con la clienta.
import { normCedula, normNombre, s, type Row } from "./domain.ts";

export interface QuienDoc { key: string; ced: string; nom: string; codigo: string }

const palabras = (x: string) => normNombre(x).split(/\s+/).filter((w) => w.length > 1);
/** Nombre del archivo → nombre de clienta: «2026-05-03 14.20 - Ana Paz.pdf» → «Ana Paz». */
export function nombreDeArchivo(x: unknown): string {
  let t = s(x).replace(/\.pdf$/i, "").replace(/_/g, " ").trim();
  t = t.replace(/^\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}[.:]\d{2}(?:[.:]\d{2})?)?\s*-?\s*/, "");
  t = t.replace(/^(?:simetr[ií]a|k-?lift|focus\s*skin|skin\s*an[aá]lisis)\s*-\s*/i, "");
  return t.replace(/\s*-\s*(?:simetr[ií]a|k-?lift|focus\s*skin)\s*$/i, "").trim();
}
/** El nombre del archivo es de esta clienta: mismas palabras (en cualquier orden), o ≥2 palabras y todas en su nombre. */
export function mismoNombre(archivo: string, nom: string): boolean {
  const a = palabras(nombreDeArchivo(archivo)), b = palabras(nom);
  if (!a.length || !b.length) return false;
  if (a.length === b.length && a.every((w) => b.includes(w))) return true;
  return a.length >= 2 && a.every((w) => b.includes(w));
}
export function esDeClienta(d: Row, q: QuienDoc): boolean {
  const id = s(d.cliente_id).trim();
  if (id) {
    if (id === q.key || (q.codigo && id.toUpperCase() === q.codigo.toUpperCase())) return true;
    const c = normCedula(id.replace(/^c:/, ""));
    if (q.ced && c && c === q.ced) return true;
    if (/^n:/.test(id) && q.nom && normNombre(id.slice(2)) === q.nom) return true;
    if (c || /^(c:|n:|C-)/.test(id)) return false;
  }
  // Sin cliente_id = «sin asignar» (nombre ambiguo o sin match): no se adivina; lo asigna el admin.
  return false;
}
export const esZip = (d: Row) => /\.zip$/i.test(s(d.storage_path));
/** Nombre legible para descargar: «2026-05-03 Focus Skin - Ana Paz.pdf». */
export function nombreDescarga(d: Row): string {
  const ext = esZip(d) ? ".zip" : ".pdf";
  const f = localEc(d.fecha).slice(0, 10);
  const nom = nombreDeArchivo(d.cliente_nombre_archivo) || "clienta";
  return ((f ? f + " " : "") + (s(d.tipo) === "klift" ? "K-Lift" : "Focus Skin") + " - " + nom).replace(/[\\/:*?"<>|]+/g, " ").trim() + ext;
}
/** Hora de Ecuador (UTC-5) de un timestamp; el texto sin zona se deja igual. */
export function localEc(v: unknown): string {
  const x = s(v); if (!x) return "";
  if (!/(?:[zZ]|[+-]\d{2}(?::?\d{2})?)$/.test(x) || !/\d[T ]\d/.test(x)) return x.replace(" ", "T");
  const iso = x.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const ms = Date.parse(iso); if (!Number.isFinite(ms)) return x;
  return new Date(ms - 5 * 3600e3).toISOString().slice(0, 19);
}
export const ETIQUETA_DOC: Record<string, string> = { klift: "K-Lift · simetría", skin_analisis: "Focus Skin · análisis de piel" };
export function vistaDoc(d: Row): Row {
  const tipo = s(d.tipo);
  return {
    tipo: esZip(d) ? "zip" : "pdf", sub: tipo, docId: s(d.id), zip: esZip(d),
    nombre: (ETIQUETA_DOC[tipo] || "Documento PDF") + (esZip(d) ? " · fotos (zip)" : "") + (s(d.cliente_nombre_archivo) ? " · " + nombreDeArchivo(d.cliente_nombre_archivo) : ""),
    fecha: localEc(d.fecha || d.created_at).slice(0, 10), hora: localEc(d.fecha).slice(11, 16),
  };
}
