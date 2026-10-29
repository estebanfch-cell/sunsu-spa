import { assert } from "jsr:@std/assert";
const html = await Deno.readTextFile(new URL("../../../beta.html", import.meta.url));
Deno.test("desglose a cobrar: tabla sin caja blanca, texto claro sobre la tarjeta azul", () => {
  const m = html.match(/\.preview table\.ov-tabla \{([^}]*)\}/);
  assert(m && /background: transparent/.test(m[1]) && /box-shadow: none/.test(m[1]));
  assert(/\.preview \.ov-tabla th, \.preview \.ov-tabla td \{[^}]*color: inherit/.test(html));
});
