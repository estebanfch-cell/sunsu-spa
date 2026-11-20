/**
 * TK185 (Emilia t805u): «Tiene que ser el formato en el que ellas ponen la fecha».
 * Se acepta la fecha como la escriben (MM/DD/AAAA del iPhone en inglés, DD/MM/AAAA si el primer número pasa de 12,
 * AAAA-MM-DD del calendario nativo, con / - o .) y se guarda por dentro como AAAA-MM-DD. Nunca se les exige AAAA-MM-DD.
 */
export type EstiloFecha = "mdy" | "dmy" | "iso";

export function leerFecha(v: unknown): { iso: string; estilo: EstiloFecha } | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const ok = (y: number, m: number, d: number) => {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return "";
    const f = new Date(Date.UTC(y, m - 1, d));
    if (f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return "";
    return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  };
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(t);
  if (m) { const iso = ok(+m[1], +m[2], +m[3]); return iso ? { iso, estilo: "iso" } : null; }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(t);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    // Primero > 12 → día/mes. Si no, mes/día (así lo manda el iPhone y el formulario del ticket).
    if (a > 12) { const iso = ok(y, b, a); return iso ? { iso, estilo: "dmy" } : null; }
    const iso = ok(y, a, b);
    if (iso) return { iso, estilo: "mdy" };
    const iso2 = ok(y, b, a);
    return iso2 ? { iso: iso2, estilo: "dmy" } : null;
  }
  return null;
}

/** AAAA-MM-DD → como ellas la escriben. */
export function fechaComo(iso: string, estilo: EstiloFecha): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  if (estilo === "mdy") return m[2] + "/" + m[3] + "/" + m[1];
  if (estilo === "dmy") return m[3] + "/" + m[2] + "/" + m[1];
  return m[1] + "-" + m[2] + "-" + m[3];
}

export const FECHA_NO_ENTIENDO = "No entendí la fecha de regreso. Escríbela como en el calendario (ej. 12/19/2026 o 19/12/2026)";
