import { assert } from "jsr:@std/assert";
const js = await Deno.readTextFile(new URL("../../../beta-screens.js", import.meta.url));
const h = await Deno.readTextFile(new URL("./handlers.ts", import.meta.url));
Deno.test("ticket: picker de paquete activo y fila real del paquete nuevo", () => {
  assert(js.includes('id="paq-pick"') && js.includes("function _paqCargarPicker") && js.includes("function _paqElegir"));
  assert(js.includes("_paqPick.fila!=='nuevo'") && js.includes("_marcarSesionPaqueteUnaVez({fila:_paqPick.fila"));
  assert(h.includes("paqueteFila = paqSaved") && h.includes("marcarSlotsGC(ctx, actor, paqueteFila"));
});
