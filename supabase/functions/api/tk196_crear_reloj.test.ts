import { assert, assertEquals } from "jsr:@std/assert@1";

const html = await Deno.readTextFile(new URL("../../../index.html", import.meta.url));
const nav = await Deno.readTextFile(new URL("../../../mc-nav.js", import.meta.url));

Deno.test("TK196: el menú Crear se repinta con el estado real del reloj", () => {
  assert(html.includes("function pintarCrearMenu()"));
  assert(/async function cargarReloj\(\) \{[\s\S]{0,400}pintarCrearMenu\(\)/.test(html));
  assert(html.includes("abrirCamara(siguienteMarcaReloj())"));
});

Deno.test("TK196: Crear ofrece salida / fin de almuerzo según el estado", () => {
  assert(nav.includes('"📷 Registrar salida", "", "panel"'));
  assert(!nav.includes("Fin almuerzo"));
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
  assert(l.includes("📷 Registrar salida") && !l.some((x) => /almuerzo/i.test(x)));
});

Deno.test("TK197: Crear muestra el panel de Mi asistencia (horario, marcas, mismos botones)", async () => {
  assert(/function htmlCrearAsis\(hoy\) \{[\s\S]{0,1200}htmlBotonesAsis\(hoy\.marcajes/.test(html));
  assert(/function pintarCrearAsis\(\) \{[\s\S]{0,600}abrirCamara\(b\.getAttribute\("data-marca"\)\)/.test(html));
  assert(nav.includes('id="crear-asis"'));
  const api = await Deno.readTextFile(new URL("./asistencia_api.ts", import.meta.url));
  assert(api.includes("horarioHoy"));
});

import { calcularDia, configDesde } from "./asistencia.ts";
Deno.test("TK198: extra solo fuera del horario asignado; 9:30–18:30 completo = 0 extra", () => {
  const cfg = configDesde(undefined);
  const j = { trabaja: true, desde: "09:30", hasta: "18:30" };
  const m = (tipo: string, hm: string) => ({ id: tipo + hm, nombre: "X", tipo, ts: `2026-11-20T${hm}:00-05:00`, anulado: false });
  const d = calcularDia("2026-11-20", [m("entrada", "09:30"), m("salida", "18:30")], cfg, [], [], null, j as never);
  assertEquals([d.ordinaryMin, d.suplMin, d.almuerzoPendiente], [480, 0, false]);
  const a = calcularDia("2026-11-20", [m("entrada", "09:28"), m("salida", "19:04")], cfg, [], [], null, j as never);
  assertEquals([a.ordinaryMin, a.suplMin], [480, 34]);
  assert(!html.includes("Falta el almuerzo"));
});

import { clasificarHorasRol } from "./horas_rol.ts";
Deno.test("TK199: feriado y descanso por separado (feriado aunque caiga en descanso)", () => {
  const cfg = configDesde(undefined);
  const m = (f: string, tipo: string, hm: string) => ({ id: f + tipo, nombre: "X", tipo, ts: `${f}T${hm}:00-05:00`, anulado: false });
  const fer = calcularDia("2026-11-20", [m("2026-11-20", "entrada", "10:03"), m("2026-11-20", "salida", "18:30")], cfg, ["2026-11-20"], [], null, { trabaja: true, desde: "10:00", hasta: "19:00" } as never);
  assertEquals([fer.extrMin, fer.descMin], [507, 0]);
  const sab = calcularDia("2026-11-07", [m("2026-11-07", "entrada", "09:54"), m("2026-11-07", "salida", "17:35")], cfg, [], [], null, { trabaja: false, desde: null, hasta: null } as never);
  assertEquals([sab.extrMin, sab.descMin], [0, 461]);
  const r = clasificarHorasRol({ anio: 2026, mes: 11, hoy: "2026-11-30", horario: { diasDescanso: [0, 6], jornadaMins: 480 }, feriados: ["2026-11-07"],
    dias: { "2026-11-07": { fecha: "2026-11-07", nomMin: 461, suplMin: 0, festMin: 0, descMin: 461 } } });
  assertEquals([r.hrsExtr, r.hrsDesc], [7.5, 0]);
  assert(html.includes('fila("Feriado 100%"') && html.includes('fila("Descanso 100%"'));
});

Deno.test("TK204: Mi asistencia sin «Este mes»; la tabla del rol sale de rolHorasMesDe (mismo armado que el rol)", async () => {
  assert(!html.includes('tot("mes","Este mes"'));
  assert(html.includes("igual que tu rol de pagos"));
  const api = await Deno.readTextFile(new URL("./asistencia_api.ts", import.meta.url));
  assert(api.includes("rolHorasMesDe(ctx, nombre, y, m)"));
  const rc = await Deno.readTextFile(new URL("./roles_crear_api.ts", import.meta.url));
  assert(rc.includes("export async function rolHorasMesDe"));
});
