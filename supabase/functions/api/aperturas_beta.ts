// 📦 Abrir producto: rendimiento de cada envase abierto (faciales por envase) y costo por facial.
// Cada facial se reparte en partes iguales entre los envases de ese producto abiertos en ese momento.
// Si el ticket dice la cabina (campo opcional «Cabina» del ticket) y hay envases abiertos ahí, solo entre esos;
// si no dice o no hay ninguno abierto en esa cabina, entre todos los abiertos (en cualquier destino).
import { n, round2, s, type Row } from "./domain.ts";

export const DESTINOS = [
  { codigo: "CABINA", nombre: "Cabina 1" }, { codigo: "CAB2", nombre: "Cabina 2" },
  { codigo: "CAB3", nombre: "Cabina 3" }, { codigo: "VENTA", nombre: "Local" },
];
export const nombreDestino = (c: string) => DESTINOS.find((d) => d.codigo === c)?.nombre || c;
const H5 = 5 * 3600e3;
/** Instante real (UTC) → misma escala que el timestamp de los tickets (hora de pared de Ecuador con Z). */
export const aPared = (iso: unknown) => { const t = Date.parse(s(iso)); return Number.isFinite(t) ? t - H5 : NaN; };

export interface Facial { t: number; code: string; cabina?: string }
/** «Cabina 2» del ticket → código de bodega del destino (CAB2). */
export const destinoDeCabina = (c: unknown) => DESTINOS.find((d) => d.nombre.toLowerCase() === s(c).trim().toLowerCase() || d.codigo === s(c).trim().toUpperCase())?.codigo || "";
export interface Rendimiento { id: string; faciales: number; enCurso: boolean; usoPorFacial: number | null; costoPorFacial: number | null }

/** Faciales que rindió cada apertura (no anuladas) de UN producto. `ahora` en escala de pared. */
export function rendimiento(aps: Row[], faciales: Facial[], aplica: string[], ahora: number): Map<string, Rendimiento> {
  const A = new Set(aplica.map((x) => s(x).toUpperCase()));
  const vivas = aps.filter((a) => a.anulada !== true).map((a) => ({ a, ini: aPared(a.abierto_at), fin: a.cerrado_at ? aPared(a.cerrado_at) : ahora }));
  const cuenta = new Map<string, number>(vivas.map((v) => [s(v.a.id), 0]));
  if (A.size) for (const f of faciales) {
    if (!A.has(f.code.toUpperCase())) continue;
    const todasAb = vivas.filter((v) => f.t >= v.ini && f.t < v.fin);
    const enCab = f.cabina ? todasAb.filter((v) => s(v.a.destino) === f.cabina) : [];
    const abiertas = enCab.length ? enCab : todasAb;
    for (const v of abiertas) cuenta.set(s(v.a.id), (cuenta.get(s(v.a.id)) || 0) + 1 / abiertas.length);
  }
  const out = new Map<string, Rendimiento>();
  for (const v of vivas) {
    const c = Math.round((cuenta.get(s(v.a.id)) || 0) * 100) / 100;
    const cont = n(v.a.contenido), cost = n(v.a.costo);
    out.set(s(v.a.id), {
      id: s(v.a.id), faciales: c, enCurso: !v.a.cerrado_at,
      usoPorFacial: c > 0 && cont > 0 ? Math.round(cont / c * 100) / 100 : null,
      costoPorFacial: c > 0 && cost > 0 ? round2(cost / c) : null,
    });
  }
  return out;
}
/** Promedios de un producto con sus envases ya cerrados (los abiertos todavía no terminaron). */
export function promedioProducto(rs: Rendimiento[]): { envases: number; faciales: number; costoPorFacial: number | null; usoPorFacial: number | null } {
  const c = rs.filter((r) => !r.enCurso && r.faciales > 0);
  const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const cpf = avg(c.map((r) => r.costoPorFacial)), upf = avg(c.map((r) => r.usoPorFacial));
  return { envases: c.length, faciales: Math.round(c.reduce((a, r) => a + r.faciales, 0) * 100) / 100, costoPorFacial: cpf == null ? null : round2(cpf), usoPorFacial: upf == null ? null : Math.round(upf * 100) / 100 };
}
