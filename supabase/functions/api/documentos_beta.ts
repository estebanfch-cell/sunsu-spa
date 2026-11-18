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

/** ZIP de fotos K-Lift: queda en el bucket, no se lista en Documentos (solo el PDF final / informe). */
export function esZipOculto(d: Row): boolean {
  return d.zip === true || s(d.tipo) === "zip" || /\.zip$/i.test(s(d.storage_path));
}

/** Stubs sin archivo (el «Análisis de piel / …» del ticket) y zips no se muestran. */
export function visibleEnDocumentos(d: Row): boolean {
  if (esZipOculto(d)) return false;
  if (s(d.tipo) === "analisis") return false;
  return true;
}

/** Fotos del ticket (Antes/Después 1-3) o pistas en el nombre (antes/despues/pre/post). */
export function carpetaFoto(d: Row): "antes" | "despues" | "fotos" {
  const n = s(d.nombre).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/(^|[^a-z])(despues|after|post)([^a-z]|$)/.test(n)) return "despues";
  if (/(^|[^a-z])(antes|before|pre)([^a-z]|$)/.test(n)) return "antes";
  return "fotos";
}

/** Acta, informe K-Lift o análisis Focus Skin (PDF). */
export function esInformePrincipal(d: Row): boolean {
  if (!visibleEnDocumentos(d) || s(d.tipo) === "foto") return false;
  if (s(d.sub) === "skin_analisis" || s(d.sub) === "klift") return s(d.tipo) === "pdf";
  const blob = [d.nombre, d.sub, d.tipo].map(s).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return s(d.tipo) === "pdf" && /acta|informe|focus\s*skin|k-?lift/.test(blob);
}

function mins(h: string): number {
  const m = s(h).match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

type Cubo = { fecha: string; clave: string; hora: string; items: Row[] };

function masCercano(grupos: Cubo[], hora: string): Cubo | null {
  const t = mins(hora);
  if (!Number.isFinite(t)) return null;
  let best: Cubo | null = null, bestD = Infinity;
  for (const g of grupos) {
    const u = mins(g.hora);
    if (!Number.isFinite(u)) continue;
    const d = Math.abs(u - t);
    if (d < bestD) { bestD = d; best = g; }
  }
  return best;
}

function armaGrupo(b: Cubo): Row {
  const fotos: { antes: Row[]; despues: Row[]; fotos: Row[] } = { antes: [], despues: [], fotos: [] };
  const informes: Row[] = [], otros: Row[] = [];
  for (const d of b.items) {
    if (s(d.tipo) === "foto") fotos[carpetaFoto(d)].push(d);
    else if (esInformePrincipal(d)) informes.push(d);
    else otros.push(d);
  }
  const nFotos = fotos.antes.length + fotos.despues.length + fotos.fotos.length;
  const tipos = [...new Set(informes.map((d) => s(d.sub) === "klift" ? "K-Lift" : s(d.sub) === "skin_analisis" ? "Focus Skin" : /acta/i.test(s(d.nombre)) ? "Acta" : "Informe"))];
  const titulo = [b.clave, tipos.join(" · ")].filter(Boolean).join(" · ") || (nFotos ? "Fotos del ticket" : "Documentos");
  return {
    fecha: b.fecha, hora: b.hora || "", clave: b.clave || "", titulo,
    informes, otros, fotos, nFotos,
    ids: b.items.map((d) => s(d.docId)).filter(Boolean),
  };
}

/** Una entrada por día / ticket: informe PDF primero, fotos del ticket en Antes / Después. Los zip no entran. */
export function agruparDocumentos(docs: Row[]): Row[] {
  const raw = new Map<string, Cubo>();
  for (const d of docs.filter(visibleEnDocumentos)) {
    const fecha = s(d.fecha).slice(0, 10);
    const clave = s(d.clave);
    const k = clave ? fecha + "|" + clave : fecha;
    const b = raw.get(k) || { fecha, clave, hora: s(d.hora), items: [] };
    b.items.push(d);
    if (!b.hora && d.hora) b.hora = s(d.hora);
    raw.set(k, b);
  }
  const porDia = new Map<string, Cubo[]>();
  for (const b of raw.values()) {
    const L = porDia.get(b.fecha) || [];
    L.push(b);
    porDia.set(b.fecha, L);
  }
  const merged: Cubo[] = [];
  for (const L of porDia.values()) {
    const conTk = L.filter((b) => b.clave), sinTk = L.filter((b) => !b.clave);
    if (conTk.length === 1 && sinTk.length) {
      conTk[0].items.push(...sinTk.flatMap((b) => b.items));
      if (!conTk[0].hora) conTk[0].hora = sinTk[0].hora;
      merged.push(conTk[0]);
    } else if (conTk.length > 1 && sinTk.length) {
      for (const b of sinTk) {
        for (const d of b.items) {
          (masCercano(conTk, s(d.hora) || b.hora) || conTk[0]).items.push(d);
        }
      }
      merged.push(...conTk);
    } else {
      merged.push(...L);
    }
  }
  return merged.map(armaGrupo).sort((a, b) => (s(b.fecha) + s(b.hora)).localeCompare(s(a.fecha) + s(a.hora)));
}

/** Misma agrupación para Documentos sin asignar: por día y nombre, solo PDFs visibles; ids incluye zips ocultos para asignarlos juntos. */
export function agruparSinAsignar(items: Row[]): Row[] {
  const cubos = new Map<string, Row[]>();
  for (const d of items) {
    const dia = s(d.fecha).slice(0, 10);
    const nom = normNombre(s(d.archivo) || nombreDeArchivo(d.cliente_nombre_archivo) || d.nombre);
    const k = dia + "|" + nom;
    const L = cubos.get(k) || [];
    L.push(d);
    cubos.set(k, L);
  }
  const out: Row[] = [];
  for (const L of cubos.values()) {
    const vis = L.filter((d) => !esZipOculto(d));
    if (!vis.length) continue;
    const informes = vis.filter(esInformePrincipal);
    const otros = vis.filter((d) => !esInformePrincipal(d) && s(d.tipo) !== "foto");
    const first = informes[0] || vis[0];
    const sub = s(first.sub);
    out.push({
      fecha: first.fecha, hora: first.hora, archivo: first.archivo, confianza: first.confianza, sub,
      titulo: (sub === "klift" ? "K-Lift" : "Focus Skin") + (first.archivo ? " · " + s(first.archivo) : ""),
      informes, otros, fotos: { antes: [], despues: [], fotos: [] }, nFotos: 0,
      ids: L.map((d) => s(d.docId)).filter(Boolean),
      sugerencias: first.sugerencias, docId: first.docId, zip: false,
    });
  }
  return out.sort((a, b) => (s(b.fecha) + s(b.hora)).localeCompare(s(a.fecha) + s(a.hora)));
}
