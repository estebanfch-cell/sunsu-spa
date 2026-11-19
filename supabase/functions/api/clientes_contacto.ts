// TK95: rellenar teléfono y email de clientas solo si están vacíos.
// Fuentes, en este orden: datos ya importados de facturas Migo, Acuity, clientas antiguas.
// Empareja por cédula; si no hay, por nombre exacto. Si el nombre es ambiguo, se registra y no se adivina.
// Nunca se sobreescribe un valor existente. Los reportes no incluyen cédulas, teléfonos ni correos.
import { normCedula, normNombre, s, telefonoEc, type Row } from "./domain.ts";

export type FuenteContacto = "migo" | "acuity" | "antiguas";

export type ContactoFuente = {
  cedula?: string;
  nombre?: string;
  telefono?: string;
  email?: string;
  fuente: FuenteContacto;
};

export type ClienteDestino = {
  key: string;
  cedula?: string;
  nombre?: string;
  telefono?: string;
  email?: string;
};

export type RellenoUpdate = {
  key: string;
  telefono?: string;
  email?: string;
  fuenteTel?: FuenteContacto;
  fuenteEmail?: FuenteContacto;
};

export type RellenoAmbiguo = { nombre: string; n: number; campo: "telefono" | "email" | "clienta" };

export type RellenoResultado = {
  updates: RellenoUpdate[];
  ambiguous: RellenoAmbiguo[];
  skipped: number;
  telFilled: number;
  emailFilled: number;
  porFuente: Record<FuenteContacto, { tel: number; email: number }>;
};

const FUENTE_ORDEN: FuenteContacto[] = ["migo", "acuity", "antiguas"];

export function emailOk(v: unknown): string {
  const t = s(v).trim().toLowerCase();
  if (!t || t === "none" || t === "null" || t === "-" || t === "n/a") return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return "";
  return t;
}

export function telOk(v: unknown): string {
  return telefonoEc(v);
}

export function hayTel(v: unknown): boolean {
  return !!telOk(v);
}
export function hayEmail(v: unknown): boolean {
  return !!emailOk(v);
}

function rank(f: FuenteContacto): number {
  const i = FUENTE_ORDEN.indexOf(f);
  return i < 0 ? 99 : i;
}

function valorUnico(cands: { valor: string; fuente: FuenteContacto }[]): { valor: string; fuente: FuenteContacto } | { ambiguous: true; n: number } | null {
  const L = cands.filter((c) => c.valor);
  if (!L.length) return null;
  const porValor = new Map<string, FuenteContacto>();
  for (const c of L) {
    const prev = porValor.get(c.valor);
    if (prev == null || rank(c.fuente) < rank(prev)) porValor.set(c.valor, c.fuente);
  }
  if (porValor.size > 1) return { ambiguous: true, n: porValor.size };
  const [valor, fuente] = [...porValor.entries()][0];
  return { valor, fuente };
}

function indexar(fuentes: ContactoFuente[]) {
  const porCed = new Map<string, ContactoFuente[]>();
  const porNom = new Map<string, ContactoFuente[]>();
  for (const f of fuentes) {
    const ced = normCedula(f.cedula);
    const nom = normNombre(f.nombre);
    if (ced) {
      const a = porCed.get(ced) || [];
      a.push(f);
      porCed.set(ced, a);
    }
    if (nom) {
      const a = porNom.get(nom) || [];
      a.push(f);
      porNom.set(nom, a);
    }
  }
  return { porCed, porNom };
}

/**
 * Calcula qué campos vacíos se pueden llenar. No escribe nada.
 * Varias fuentes con el mismo valor no son conflicto; valores distintos para el mismo
 * campo, o un nombre que corresponde a más de una clienta, se registran como ambiguos.
 */
export function rellenarContactos(destinos: ClienteDestino[], fuentes: ContactoFuente[]): RellenoResultado {
  const { porCed, porNom } = indexar(fuentes);
  const porNomDest = new Map<string, ClienteDestino[]>();
  for (const d of destinos) {
    const nom = normNombre(d.nombre);
    if (!nom) continue;
    const a = porNomDest.get(nom) || [];
    a.push(d);
    porNomDest.set(nom, a);
  }

  const updates: RellenoUpdate[] = [];
  const ambiguous: RellenoAmbiguo[] = [];
  let skipped = 0;
  const porFuente: Record<FuenteContacto, { tel: number; email: number }> = {
    migo: { tel: 0, email: 0 }, acuity: { tel: 0, email: 0 }, antiguas: { tel: 0, email: 0 },
  };

  const yaAmbiguo = new Set<string>();
  const markAmb = (nombre: string, n: number, campo: RellenoAmbiguo["campo"]) => {
    const k = campo + ":" + nombre;
    if (yaAmbiguo.has(k)) return;
    yaAmbiguo.add(k);
    // Solo el nombre normalizado (no cédula, teléfono ni email).
    ambiguous.push({ nombre, n, campo });
  };

  for (const d of destinos) {
    const needTel = !hayTel(d.telefono);
    const needEmail = !hayEmail(d.email);
    if (!needTel && !needEmail) { skipped++; continue; }

    const ced = normCedula(d.cedula);
    const nom = normNombre(d.nombre);
    let hits: ContactoFuente[] | undefined;
    if (ced && porCed.has(ced)) hits = porCed.get(ced);
    else if (nom) {
      const destMismoNombre = porNomDest.get(nom) || [];
      const src = porNom.get(nom) || [];
      if (destMismoNombre.length > 1 && src.length) {
        markAmb(nom, destMismoNombre.length, "clienta");
        skipped++;
        continue;
      }
      hits = src;
    }
    if (!hits || !hits.length) { skipped++; continue; }

    const u: RellenoUpdate = { key: d.key };
    if (needTel) {
      const r = valorUnico(hits.map((h) => ({ valor: telOk(h.telefono), fuente: h.fuente })));
      if (r && "ambiguous" in r) markAmb(nom || ced || d.key, r.n, "telefono");
      else if (r) { u.telefono = r.valor; u.fuenteTel = r.fuente; porFuente[r.fuente].tel++; }
    }
    if (needEmail) {
      const r = valorUnico(hits.map((h) => ({ valor: emailOk(h.email), fuente: h.fuente })));
      if (r && "ambiguous" in r) markAmb(nom || ced || d.key, r.n, "email");
      else if (r) { u.email = r.valor; u.fuenteEmail = r.fuente; porFuente[r.fuente].email++; }
    }
    if (u.telefono || u.email) updates.push(u);
    else skipped++;
  }

  return {
    updates,
    ambiguous,
    skipped,
    telFilled: updates.filter((u) => u.telefono).length,
    emailFilled: updates.filter((u) => u.email).length,
    porFuente,
  };
}

/** Contacto de una cita o clienta de Acuity (campos documentados de su API, solo lectura). */
export function contactoDeAcuity(a: Row): ContactoFuente | null {
  const tel = telOk(a.phone || a.telefono);
  const email = emailOk(a.email || a.correo);
  if (!tel && !email) return null;
  const ced = s(a.certificate || a.cedula || a.ci);
  const nombre = [s(a.firstName || a.nombre), s(a.lastName || a.apellido)].filter(Boolean).join(" ") || s(a.name);
  return { cedula: ced || undefined, nombre: nombre || undefined, telefono: tel || undefined, email: email || undefined, fuente: "acuity" };
}

/** Contacto opcional ya guardado en una factura viva (si el import empezó a traerlo). */
export function contactoDeFactura(f: Row): ContactoFuente | null {
  const tel = telOk(f.cliente_telefono || f.telefono || (f.cliente && typeof f.cliente === "object" ? (f.cliente as Row).telefono : ""));
  const email = emailOk(f.cliente_email || f.email || (f.cliente && typeof f.cliente === "object" ? (f.cliente as Row).email : ""));
  if (!tel && !email) return null;
  const ced = s(f.cliente_ruc || f.cliente_cedula || f.cedula || f.identificacion || (f.cliente && typeof f.cliente === "object" ? (f.cliente as Row).cedula : ""));
  const nombre = s(f.cliente_nombre || (typeof f.cliente === "string" ? f.cliente : "") || (f.cliente && typeof f.cliente === "object" ? (f.cliente as Row).nombre : ""));
  return { cedula: ced || undefined, nombre: nombre || undefined, telefono: tel || undefined, email: email || undefined, fuente: "migo" };
}

export function contactoDeAntigua(r: Row): ContactoFuente | null {
  const tel = telOk(r.telefono) || telOk(r.tel_acuity);
  const email = emailOk(r.email);
  if (!tel && !email) return null;
  return { cedula: s(r.cedula) || undefined, nombre: s(r.nombre) || undefined, telefono: tel || undefined, email: email || undefined, fuente: "antiguas" };
}

/** Elige el primer teléfono/email no vacío, para mostrar en el ticket (ficha manda). */
export function contactoParaMostrar(partes: { telefono?: unknown; email?: unknown }[]): { telefono: string; email: string } {
  let telefono = "", email = "";
  for (const p of partes) {
    if (!telefono) telefono = telOk(p.telefono);
    if (!email) email = emailOk(p.email);
    if (telefono && email) break;
  }
  return { telefono, email };
}

export function resumenRelleno(r: RellenoResultado): Row {
  // Solo conteos: nada de cédulas, teléfonos ni correos.
  return {
    ok: true,
    tel_rellenados: r.telFilled,
    email_rellenados: r.emailFilled,
    ambiguos: r.ambiguous.length,
    omitidos: r.skipped,
    de_migo: { tel: r.porFuente.migo.tel, email: r.porFuente.migo.email },
    de_acuity: { tel: r.porFuente.acuity.tel, email: r.porFuente.acuity.email },
    de_antiguas: { tel: r.porFuente.antiguas.tel, email: r.porFuente.antiguas.email },
  };
}
