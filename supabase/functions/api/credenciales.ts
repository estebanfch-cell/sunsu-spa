// Usuario + contraseña (Emilia 17/11), al lado del PIN. PBKDF2-SHA256 con sal por usuario; nunca se guarda
// ni se devuelve la contraseña. 5 intentos fallidos → 15 minutos de espera.
import { s, type Row } from "./domain.ts";

export const ITER = 120000;
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export function nuevaSal(): string { return hex(crypto.getRandomValues(new Uint8Array(16))); }
export async function hashPass(pass: string, sal: string, iter = ITER): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(sal), iterations: iter }, k, 256);
  return hex(bits);
}
export function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export const normUsuario = (u: unknown) => s(u).trim().toLowerCase();
export const normEmail = (e: unknown) => s(e).trim().toLowerCase();
export function validarEmail(e: string, obligatorio = true): string | null {
  if (!e) return obligatorio ? "Escribe tu correo electrónico" : null;
  if (e.length > 160) return "Ese correo es demasiado largo";
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)) return "Ese correo no es válido";
  return null;
}
export function nuevoTokenReset(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}
export async function hashTokenReset(token: string): Promise<string> {
  const bits = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return hex(bits);
}
export const RESET_MIN = 45;

export function validarUsuario(u: string): string | null {
  return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(u) ? null : "El usuario va en minúsculas, de 3 a 30 letras o números (se permiten . _ -)";
}
export function validarPass(p: string, usuario = ""): string | null {
  if (p.length < 8) return "La contraseña necesita al menos 8 caracteres";
  if (p.length > 128) return "La contraseña es demasiado larga";
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return "Usa letras y números en la contraseña";
  if (usuario && p.toLowerCase().includes(usuario.toLowerCase())) return "La contraseña no puede contener el usuario";
  return null;
}
export const ESPERA_MIN = 15, MAX_INTENTOS = 5;
export function bloqueada(c: Row, ahora: Date): boolean { return !!c.bloqueado_hasta && Date.parse(s(c.bloqueado_hasta)) > ahora.getTime(); }


/** ¿Esta persona ya tiene usuario + contraseña propios (no temporal)? No expone el hash. */
export function credencialActiva(c: { pass_hash?: unknown; debe_cambiar_pass?: unknown } | null | undefined): boolean {
  if (!c) return false;
  const h = c.pass_hash == null ? "" : String(c.pass_hash);
  if (!h) return false;
  return c.debe_cambiar_pass !== true;
}

export async function marcarPinDesactivado(ctx: { db: { all: (t: string) => Promise<any[]>; write: Function } }, actor: string, uid: string, off: boolean): Promise<void> {
  const id = String(uid || "");
  if (!id) return;
  for (const tabla of ["app_usuarios", "usuarios"]) {
    try {
      const rows = await ctx.db.all(tabla);
      const hit = rows.find((r: any) => String(r.id) === id);
      if (hit) await ctx.db.write(actor, tabla, "update", { id }, { pin_desactivado: off });
    } catch { /* tabla o columna aún no está */ }
  }
}
