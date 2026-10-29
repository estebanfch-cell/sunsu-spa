import { assert } from "jsr:@std/assert";
const js = await Deno.readTextFile(new URL("../../../beta-screens.js", import.meta.url));
const sql = await Deno.readTextFile(new URL("../../../docs/supabase/pending/0033_paquetes_codigo.sql", import.meta.url));
Deno.test("hotfix: desglose como detalle, paquetes ⋮ y código, marca en un toque, sin stock", () => {
  assert(js.includes("<th>Código</th><th>Descripción</th><th class=\"n\">Cant.</th>"));
  const a = js.indexOf("function _paqDetalleHTML("), b = js.indexOf("function _paqAbrir(");
  assert(js.slice(a, b).includes("_paqMenu(p)") && js.includes("if(enDetalle) return '';"));
  assert(js.includes("th('Código')+th('Paquete')") && js.includes("esc(p.paquete||p.sku)"));
  assert(js.includes("function _canjeMarcarAuto(") && js.includes("¿Marcar la sesión de "));
  assert(js.includes("+' '+pad(hoy.getHours())+':'+pad(hoy.getMinutes())"));
  assert(js.includes("function _sinStock(") && js.includes("sin-stock") && !js.includes("${sinStk?'disabled':''}"));
  assert(/add column if not exists codigo/.test(sql) && !/drop column|delete from/i.test(sql) && sql.includes("where sheet_row = new.sheet_row and codigo is not null"));
});
