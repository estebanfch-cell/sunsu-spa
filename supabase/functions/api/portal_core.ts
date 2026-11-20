// TK163 · Portal de clientas y proveedores (Emilia 20/11). Reglas puras (sin base): validaciones, coincidencias
// para atar la cuenta a la clienta / proveedor y la limpieza de lo que ve cada quien. Se prueban en portal.test.ts.
import { cedulasCompatibles, n, normCedula, normNombre, s, type Row } from "./domain.ts";

/** Cédula ecuatoriana (10 dígitos con dígito verificador), RUC (13, termina en 001) o pasaporte (5–20 letras/números). */
export function validarIdentificacion(v: unknown, permitirRuc = false): string | null {
  const t = s(v).trim().toUpperCase().replace(/[\s.-]/g, "");
  if (!t) return "Escribe tu cédula";
  if (/^\d+$/.test(t)) {
    if (t.length === 10) return cedulaEcValida(t) ? null : "Esa cédula no es válida";
    if (permitirRuc && t.length === 13 && t.endsWith("001")) return null;
    return permitirRuc ? "Escribe una cédula de 10 dígitos o un RUC de 13" : "La cédula tiene 10 dígitos";
  }
  if (/^[A-Z0-9]{5,20}$/.test(t) && /\d/.test(t)) return null; // pasaporte
  return "Esa identificación no es válida";
}
export function cedulaEcValida(c: string): boolean {
  if (!/^\d{10}$/.test(c)) return false;
  const prov = Number(c.slice(0, 2));
  if (!((prov >= 1 && prov <= 24) || prov === 30)) return false;
  if (Number(c[2]) > 5) return false;
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(c[i]) * (i % 2 === 0 ? 2 : 1);
    if (d > 9) d -= 9;
    suma += d;
  }
  const ver = (10 - (suma % 10)) % 10;
  return ver === Number(c[9]);
}
/** Teléfono: los últimos 9 dígitos (09XXXXXXXX / +593 9X…). */
export function telClave(v: unknown): string {
  const d = s(v).replace(/\.0+$/, "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-9) : "";
}
export function validarTelefono(v: unknown): string | null {
  const d = s(v).replace(/\D/g, "");
  if (!d) return "Escribe tu teléfono";
  if (d.length < 7 || d.length > 15) return "Ese teléfono no es válido";
  return null;
}
export function validarNombre(v: unknown): string | null {
  const t = s(v).trim();
  if (t.length < 3) return "Escribe tu nombre completo";
  if (t.length > 120) return "El nombre es demasiado largo";
  return null;
}
/** Separa «Nombre Apellido…» en nombres + apellidos (2 primeras palabras = nombres si hay 4+). */
export function partirNombre(full: string): { nombre: string; apellido: string } {
  const w = s(full).trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (w.length <= 1) return { nombre: w[0] || "", apellido: "" };
  if (w.length === 2) return { nombre: w[0], apellido: w[1] };
  if (w.length === 3) return { nombre: w[0], apellido: w.slice(1).join(" ") };
  return { nombre: w.slice(0, 2).join(" "), apellido: w.slice(2).join(" ") };
}

/**
 * ¿Se ata sola la cuenta a la clienta existente? Regla de Emilia: cédula igual + (correo o teléfono igual) → sí.
 * Solo cédula igual → la cuenta queda atada a esa clienta pero «en revisión» hasta que un admin apruebe
 * (nadie ve la ficha de otra persona sabiendo solo su cédula).
 */
export function decidirVinculo(reg: { cedula: string; email: string; telefono: string }, ficha: { cedula?: unknown; emails?: unknown[]; telefonos?: unknown[] } | null): Row {
  if (!ficha) return { vinculo: "nuevo", auto: true, por: [] };
  const por: string[] = [];
  if (cedulasCompatibles(reg.cedula, ficha.cedula)) por.push("cedula");
  const em = s(reg.email).trim().toLowerCase();
  if (em && (ficha.emails || []).some((e) => s(e).trim().toLowerCase() === em)) por.push("email");
  const tk = telClave(reg.telefono);
  if (tk && (ficha.telefonos || []).some((t) => telClave(t) === tk)) por.push("telefono");
  const auto = por.includes("cedula") && (por.includes("email") || por.includes("telefono"));
  return { vinculo: "existente", auto, por };
}

/** Proveedor existente por RUC/cédula (RUC 13 = cédula + 001) y, para atarse solo, el correo igual. */
export function buscarProveedor(provs: Row[], ruc: string, email: string): { prov: Row | null; auto: boolean; por: string[] } {
  const ced = normCedula(ruc);
  const em = s(email).trim().toLowerCase();
  const hit = ced ? provs.find((p) => cedulasCompatibles(p.ruc, ruc)) || null : null;
  if (!hit) return { prov: null, auto: true, por: [] };
  const por = ["ruc"];
  const mails = [hit.email, hit.email_erp].map((x) => s(x).trim().toLowerCase()).filter(Boolean);
  if (em && mails.includes(em)) por.push("email");
  return { prov: hit, auto: por.includes("email"), por };
}

/** Ventas por día / mes / año (zona Ecuador) a partir de filas { fecha: YYYY-MM-DD, sku, qty }. */
export function resumenVentas(filas: { fecha: string; sku: string; qty: number }[], hoy: string, precio: (sku: string) => number): Row {
  const mes = hoy.slice(0, 7), anio = hoy.slice(0, 4);
  const z = () => ({ unidades: 0, monto: 0 });
  const out = { hoy: z(), mes: z(), anio: z() } as Record<string, { unidades: number; monto: number }>;
  const porSku = new Map<string, { unidades: number; monto: number }>();
  for (const f of filas) {
    if (!f.fecha || f.fecha.slice(0, 4) !== anio) continue;
    const m = Math.round(n(f.qty) * precio(f.sku) * 100) / 100;
    const add = (k: string) => { out[k].unidades += n(f.qty); out[k].monto = Math.round((out[k].monto + m) * 100) / 100; };
    add("anio");
    if (f.fecha.slice(0, 7) === mes) {
      add("mes");
      const c = porSku.get(f.sku) || z(); c.unidades += n(f.qty); c.monto = Math.round((c.monto + m) * 100) / 100; porSku.set(f.sku, c);
    }
    if (f.fecha === hoy) add("hoy");
  }
  return { ...out, topMes: [...porSku.entries()].sort((a, b) => b[1].unidades - a[1].unidades).slice(0, 5).map(([sku, v]) => ({ sku, ...v })) };
}

/** Lo más hecho / comprado por la clienta, para «Mis favoritos». */
export function favoritosDe(historial: Row[], esProducto: (sku: string) => boolean): Row {
  const fac = new Map<string, number>(), prod = new Map<string, { nombre: string; sku: string; veces: number; unidades: number }>();
  const fechas: string[] = [];
  for (const t of historial) {
    if (s(t.fecha)) fechas.push(s(t.fecha).slice(0, 10));
    const f = s(t.facial).trim();
    if (f && !/^(-|ninguno|n\/a)$/i.test(f)) fac.set(f, (fac.get(f) || 0) + 1);
    for (const l of (Array.isArray(t.detalle) ? t.detalle : []) as Row[]) {
      const sku = s(l.sku).toUpperCase();
      if (!sku || !esProducto(sku)) continue;
      const c = prod.get(sku) || { nombre: s(l.nombre) || sku, sku, veces: 0, unidades: 0 };
      c.veces += 1; c.unidades += n(l.cantidad) || 1; prod.set(sku, c);
    }
  }
  fechas.sort();
  let cada = 0;
  if (fechas.length >= 2) {
    const d0 = Date.parse(fechas[0]), d1 = Date.parse(fechas[fechas.length - 1]);
    cada = Math.round((d1 - d0) / 86400000 / (fechas.length - 1));
  }
  const facs = [...fac.entries()].sort((a, b) => b[1] - a[1]);
  const prods = [...prod.values()].sort((a, b) => b.unidades - a.unidades || b.veces - a.veces);
  return {
    visitas: fechas.length, primera: fechas[0] || "", ultima: fechas[fechas.length - 1] || "", cadaDias: cada,
    facial: facs[0] ? { nombre: facs[0][0], veces: facs[0][1] } : null,
    faciales: facs.slice(0, 3).map(([nombre, veces]) => ({ nombre, veces })),
    producto: prods[0] || null, productos: prods.slice(0, 3),
  };
}

/** Campos de «Mi perfil» que la clienta puede corregir (cédula y código: solo lectura). Nunca «notas» del equipo. */
export const PERFIL_EDITABLE: [string, string][] = [
  ["nombres", "Nombres"], ["apellido", "Apellidos"], ["telefono", "Teléfono"], ["email", "Correo"], ["nacimiento", "Cumpleaños"],
  ["sector", "Sector / dirección"], ["tipoPiel", "Tipo de piel"], ["alergias", "Alergias"], ["medicacion", "Medicación"],
  ["condiciones", "Condiciones de la piel o salud"], ["preferencias", "Preferencias"], ["notaClienta", "Algo que quieras contarnos"],
];
export function limpiarPerfil(cambios: Row): { limpio: Row; error?: string } {
  const ok = new Set(PERFIL_EDITABLE.map(([k]) => k));
  const limpio: Row = {};
  for (const [k, v] of Object.entries(cambios || {})) if (ok.has(k)) limpio[k] = s(v).trim().slice(0, 500);
  if (limpio.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(limpio.email))) return { limpio, error: "Ese correo no es válido" };
  if (limpio.nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(s(limpio.nacimiento))) return { limpio, error: "Cumpleaños: usa AAAA-MM-DD" };
  if (limpio.telefono && validarTelefono(limpio.telefono)) return { limpio, error: validarTelefono(limpio.telefono)! };
  if ("nombres" in limpio && !s(limpio.nombres)) return { limpio, error: "El nombre no puede quedar vacío" };
  return { limpio };
}

/** Claves que nunca salen al portal (costos, comisiones, notas del equipo, otros clientes). Red de seguridad. */
const PROHIBIDO = /"(costo|costo_promedio|compra|compra_comision|precio_compra|comision|comisiones|margen|utilidad|notas|notas_generales|bitacora|vendido_por|beta_compra_real|beta_compra_comision|total_ventas)"/i;
export function portalLimpio(payload: unknown): boolean { return !PROHIBIDO.test(JSON.stringify(payload ?? {})); }
export const mismoNombre = (a: unknown, b: unknown) => normNombre(s(a)) === normNombre(s(b));
