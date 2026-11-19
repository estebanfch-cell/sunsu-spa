/** Detección de actualización PWA / motor (TK144). Sin recarga automática. */
export function hayActualizacion(
  localCache: string,
  remoteCache: string,
  localEngine: string,
  remoteEngine: string,
): "app" | "motor" | null {
  const lc = String(localCache || "").trim();
  const rc = String(remoteCache || "").trim();
  const le = String(localEngine || "").trim();
  const re = String(remoteEngine || "").trim();
  if (rc && lc && rc !== lc) return "app";
  if (re && le && re !== le) return "motor";
  return null;
}

export function parseCacheSw(txt: string): string {
  const m = String(txt || "").match(/const CACHE = "([^"]+)"/);
  return m ? m[1] : "";
}

export function claveOcultarBanner(remoteCache: string, remoteEngine: string): string {
  return "sunsu.banner.hide." + (remoteCache || "") + "|" + (remoteEngine || "");
}

/** Primera lectura del motor: memoriza la versión de esta sesión, no dispara banner. */
export function notarMotor(
  localEngine: string,
  incoming: string,
): { localEngine: string; remoteEngine: string; primera: boolean } {
  const eng = String(incoming || "").trim();
  if (!eng) return { localEngine, remoteEngine: "", primera: false };
  if (!localEngine) return { localEngine: eng, remoteEngine: eng, primera: true };
  return { localEngine, remoteEngine: eng, primera: false };
}
