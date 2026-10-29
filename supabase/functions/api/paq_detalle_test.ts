import { assert } from "jsr:@std/assert";
const js = await Deno.readTextFile(new URL("../../../beta-screens.js", import.meta.url));
const h = await Deno.readTextFile(new URL("./handlers.ts", import.meta.url));
Deno.test("paquetes: detalle sin edición duplicada, cédula sin .0, notas sin ISO", () => {
  const a = js.indexOf("function _paqDetalleHTML("), b = js.indexOf("function _paqAbrir(");
  assert(!js.slice(a, b).includes('ix.lineas("paquetes"'));
  assert(js.includes("function _buildPaqueteCard(p, enDetalle)"));
  const ced = new Function(js.slice(js.indexOf("function _cedTxt"), js.indexOf("function _buildPaqueteCard")) + "return [_cedTxt('1727428326.0'), _paqNotaTxt('2026-10-29T00:27:59.961Z'), _paqNotaTxt('pago 2/3')];")();
  assert(ced[0] === "1727428326" && ced[1] === "" && ced[2] === "pago 2/3");
  assert(!h.includes("notas: ec.isoWall"));
});
