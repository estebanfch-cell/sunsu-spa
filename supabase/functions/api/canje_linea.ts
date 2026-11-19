// TK112 (Emilia 18/11, «pon como regla para que no vuelva a pasar»): si el ticket usa una sesión de paquete,
// su línea de canje en $0 ligada a ese uso siempre existe, aunque las demás líneas vengan de la factura.
// Y el cuadre marca en amarillo un uso de paquete sin línea de canje, o una línea de canje sin uso.
import { n, s, skuCode, type Row } from "./domain.ts";
import { paqueteDeCanje, sesionPaquete, textoCanje } from "./sin_cobro.ts";

const ymd = (ts: unknown) => s(ts).replace(" ", "T").slice(0, 10);

/** Línea de canje: facial en $0 (o con «Canje paquete» en el nombre). */
export function esLineaCanje(l: Row): boolean {
  if (/canje paquete/i.test(s(l.nombre))) return true;
  return s(l.tipo) === "facial" && !(n(l.precio_unit) > 0) && !(n(l.total_linea) > 0);
}

/** Uso de paquete del ticket: la hoja («Paquete: SI, n/x») o un uso marcado ese día en un paquete de la clienta. */
export function usoPaqueteDe(t: Row, paqs: Row[] = []): { n: number; total: number; paquete: Row | null } | null {
  const dia = ymd(t.timestamp);
  const conUso = paqs.find((p) => ((p.usos as Row[]) || []).some((u) => u.usado && s(u.fecha).slice(0, 10) === dia)) || null;
  const ses = sesionPaquete(t);
  if (ses) {
    const p = conUso || (paqs.length ? paqueteDeCanje(paqs, dia, ses) : null);
    if (!ses.total && p) { ses.total = n(p.total); }
    if (!ses.n && p) { const u = ((p.usos as Row[]) || []).find((x) => x.usado && s(x.fecha).slice(0, 10) === dia); if (u) ses.n = n(u.slot); }
    return { ...ses, paquete: p };
  }
  if (conUso) {
    const u = ((conUso.usos as Row[]) || []).find((x) => x.usado && s(x.fecha).slice(0, 10) === dia);
    return { n: n(u?.slot), total: n(conUso.total), paquete: conUso };
  }
  return null;
}

/** Facial del canje: el de la hoja (facial_hecho) o el del paquete. */
function facialDe(t: Row, p: Row | null): { sku: string; nombre: string } {
  const f = s(t.facial_hecho).trim();
  const m = /SUNSU-?(\d+)\s*(.*)$/i.exec(f);
  if (m) return { sku: skuCode("SUNSU-" + m[1]), nombre: ("SUNSU-" + m[1] + " " + m[2]).trim() };
  if (f && f !== "-") return { sku: skuCode(f) || "PAQ", nombre: f };
  const pn = s(p?.nombre).replace(/^SUNSU-\d+\s*x\d+\s*/i, "");
  return { sku: skuCode(s(p?.sku)) || "PAQ", nombre: pn || "Sesión de paquete" };
}

/** La línea de canje que falta (o null si no hay uso de paquete o ya está). */
export function lineaCanjeFaltante(t: Row, lineas: Row[], paqs: Row[] = []): Row | null {
  const uso = usoPaqueteDe(t, paqs);
  if (!uso) return null;
  if (lineas.some(esLineaCanje)) return null;
  const f = facialDe(t, uso.paquete);
  return {
    tipo: "facial", sku: f.sku, nombre: f.nombre + " · " + textoCanje(uso.paquete, uso), cantidad: 1, precio_unit: 0,
    descuento_tipo: null, descuento_valor: 0, descuento_monto: 0, total_linea: 0, excluir_comision: false, estimado: false, promo: null,
  };
}

/** Amarillo del cuadre: uso sin línea de canje, o línea de canje sin uso. Solo para tickets con líneas beta. */
export function alertaCanje(t: Row, lineas: Row[], paqs: Row[] = [], gcCanje = false): string[] {
  const uso = usoPaqueteDe(t, paqs);
  const hay = lineas.some(esLineaCanje);
  if (uso && !hay) return ["Uso de paquete sin línea de canje en $0" + (uso.paquete && s(uso.paquete.codigo) ? " (" + s(uso.paquete.codigo) + ")" : "")];
  if (!uso && hay && !gcCanje && lineas.some((l) => /canje paquete/i.test(s(l.nombre)))) return ["Línea de canje de paquete sin uso de paquete ese día"];
  return [];
}
