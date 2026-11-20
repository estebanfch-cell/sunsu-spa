import { assert, assertEquals } from "jsr:@std/assert@1";

const html = await Deno.readTextFile(new URL("../../../index.html", import.meta.url));
const nav = await Deno.readTextFile(new URL("../../../mc-nav.js", import.meta.url));

Deno.test("TK196: el menú Crear se repinta con el estado real del reloj", () => {
  assert(html.includes("function pintarCrearMenu()"));
  assert(/function pintarReloj\(\) \{[\s\S]{0,200}pintarCrearMenu\(\)/.test(html));
  assert(html.includes("abrirCamara(siguienteMarcaReloj())"));
});

Deno.test("TK196: Crear ofrece salida / fin de almuerzo según el estado", () => {
  assert(nav.includes('"📷 Registrar salida", "", "auto"'));
  assert(nav.includes('"📷 Fin almuerzo", "", "auto"'));
});

Deno.test("TK196: cache igual en index.html y sw.js", async () => {
  const sw = await Deno.readTextFile(new URL("../../../sw.js", import.meta.url));
  const a = /SUNSU_CACHE = "([^"]+)"/.exec(html)?.[1];
  const b = /const CACHE = "([^"]+)"/.exec(sw)?.[1];
  assertEquals(a, b);
});

import fs from "node:fs";
import vm from "node:vm";
function crearCon(reloj: unknown): string[] {
  const g: Record<string, unknown> = {};
  g.window = g;
  g.state = { admin: false, user: { role: "cosmetologa" } };
  g.acceso = () => "todos";
  g.esc = (v: unknown) => String(v ?? "");
  g.reloj = reloj;
  g.muestraReloj = () => true;
  vm.runInNewContext(fs.readFileSync(new URL("../../../mc-nav.js", import.meta.url), "utf8"), g);
  return ((g.MCNav as { crearItems: () => unknown[][] }).crearItems()).map((x) => String(x[1]));
}
Deno.test("TK196: Crear con entrada abierta → Registrar salida; almuerzo abierto → Fin almuerzo", () => {
  assert(crearCon({ abierto: false }).includes("📷 Registrar entrada"));
  const t = crearCon({ abierto: true, almuerzo: "inicio" });
  assert(t.includes("📷 Registrar salida") && !t.includes("📷 Registrar entrada"));
  const l = crearCon({ abierto: true, almuerzo: "fin" });
  assert(l.includes("📷 Fin almuerzo") && !l.includes("📷 Registrar salida"));
});
