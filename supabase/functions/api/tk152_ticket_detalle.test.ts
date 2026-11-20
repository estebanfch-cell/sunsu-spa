import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MemoryDb } from "./db.ts";
import { enriquecerItemsLista, lineaHistorial } from "./ticket_lista_card.ts";
import type { Row } from "./domain.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const tickets = () => readFileSync(join(root, "mc-tickets.js"), "utf8");
const caja = () => readFileSync(join(root, "mc-caja.js"), "utf8");
const screens = () => readFileSync(join(root, "beta-screens.js"), "utf8");
const listaApi = () => readFileSync(join(root, "supabase/functions/api/tickets_lista_api.ts"), "utf8");
const card = () => readFileSync(join(root, "supabase/functions/api/ticket_lista_card.ts"), "utf8");

describe("TK152 precarga de líneas: tk_historial + cache, sin «Cargando líneas…»", () => {
  it("lineaHistorial conserva nombre completo, tipo, sku y totales", () => {
    const l = lineaHistorial({
      tipo: "facial", sku: "SUNSU-44",
      nombre: "Facial Reset 3x1 · cubierto por GC 26-157",
      cantidad: 1, precio_unit: 0, total_linea: 0, canje: true,
    });
    assert.equal(l.nombre, "Facial Reset 3x1 · cubierto por GC 26-157");
    assert.equal(l.tipo, "facial");
    assert.equal(l.sku, "SUNSU-44");
    assert.equal(l.canje, true);
  });

  it("enriquecerItemsLista adjunta lineas en lote IN por ticket_clave", async () => {
    const db = new MemoryDb({
      beta_ticket_lineas: [
        { ticket_clave: "TK-SO-1937", tipo: "facial", sku: "SUNSU-44", nombre: "Facial Reset 3x1 · cubierto por GC 26-157", cantidad: 1, precio_unit: 0, total_linea: 0, canje: true },
        { ticket_clave: "TK-SO-1937", tipo: "producto", sku: "SUNSU-PDRN", nombre: "PDRN Serum", cantidad: 1, precio_unit: 13.043, total_linea: 13.043 },
        { ticket_clave: "TK-SO-1900", tipo: "facial", sku: "SUNSU-02", nombre: "Facial Reparación", cantidad: 1, precio_unit: 30, total_linea: 30 },
      ],
      erp_productos: [],
      beta_clientes: [],
    });
    const filas: Row[] = [
      { id: 1937, so_num: "TK-SO-1937", id_3: "1711111111", timestamp: "2026-11-19T16:00:00+00:00" },
    ];
    const items: Row[] = [{ so_num: "TK-SO-1937", tkRow: 1937 }];
    const cabMap = new Map<string, Row>([["TK-SO-1937", { datos: {}, clave: "TK-SO-1937" }]]);
    await enriquecerItemsLista(db, filas, items, cabMap);
    const L = (items[0].lineas || []) as Row[];
    assert.equal(L.length, 2);
    assert.equal(L[0].nombre, "Facial Reset 3x1 · cubierto por GC 26-157");
    assert.equal(L[1].nombre, "PDRN Serum");
    assert.ok(!L.some((x) => x.ticket_clave === "TK-SO-1900" || x.nombre === "Facial Reparación"));
  });

  it("tk_historial sigue llamando enriquecerItemsLista (batch, sin N+1)", () => {
    assert.match(listaApi(), /enriquecerItemsLista\(ctx\.db, filas, items, cabMap(, \{ map, canje: canjeFacial \})?\)/);
    assert.match(card(), /it\.lineas = L\.map\(\(l\) => lineaHistorial\(l\)\)/);
    assert.match(card(), /col: "ticket_clave", op: "in"/);
  });

  it("el front cachea las líneas de la lista y las usa al abrir, sin «Cargando líneas» si ya hay cache", () => {
    const tk = tickets();
    const sc = screens();
    assert.match(sc, /MCTickets\.cacheLineasLista/);
    assert.match(tk, /function cacheLineasLista/);
    assert.match(tk, /function lineasCacheDe/);
    assert.match(tk, /lineas: lineasCacheDe\(clave\) \|\| t\.lineas \|\| \[\]/);
    assert.match(tk, /if \(!K\.L\.length\) return[\s\S]*?Cargando líneas/);
    // hidratar no tapa con Cargando detalle si ya hay líneas
    assert.match(tk, /hidratando && !\(K\.L && K\.L\.length\) \? '<p class="mctk-load"/);
    // cache se actualiza al guardar la vista
    assert.match(tk, /cacheLineasClave\(d\.clave, d\.lineas\)/);
  });
});

describe("TK152 nombres de ítems sin truncar y Pagos compacto", () => {
  it("el nombre del facial/producto en el detalle no usa ellipsis ni nowrap", () => {
    const tk = tickets();
    const pn = (tk.match(/\.mctk-pn\{display:block[^}]+\}/) || [])[0] || "";
    assert.match(pn, /white-space:\s*normal/);
    assert.match(pn, /overflow-wrap:\s*break-word/);
    assert.doesNotMatch(pn, /text-overflow:\s*ellipsis/);
    assert.doesNotMatch(pn, /white-space:\s*nowrap/);
    assert.doesNotMatch(tk, /\.mctk-pn\{[^}]*text-overflow:\s*ellipsis/);
    assert.doesNotMatch(tk, /\.mctk-pn\{[^}]*-webkit-line-clamp/);
    assert.match(tk, /\.mctk-x\{[^}]*flex-shrink:\s*0/);
    assert.match(tk, /\.mctk-r1\{[^}]*align-items:\s*flex-start/);
  });

  it("el bloque Pagos cabe en 2 filas, sin el párrafo largo de ayuda", () => {
    const src = caja();
    assert.match(src, /mccj-pay-row/);
    assert.match(src, /💵 Pagos · saldo/);
    assert.match(src, /N\.° ref\. \/ voucher/);
    assert.match(src, />Registrar</);
    assert.match(src, /\+ Pago/);
    assert.match(src, /mccj-pay-cam/);
    assert.doesNotMatch(src, /El efectivo entra solo a la caja chica\. 📷 Voucher abre el menú del iPhone/);
    assert.equal((src.match(/mccj-pay-row/g) || []).length > 1, true);
    // ids de siempre, para no romper el registro
    assert.match(src, /id="pg-met"/);
    assert.match(src, /id="pg-monto"/);
    assert.match(src, /id="pg-ref"/);
    assert.match(src, /id="pg-voucher"/);
    assert.match(src, /id="pg-ok"/);
    assert.doesNotMatch(src, /id="pg-voucher"[^>]*capture=/);
    assert.doesNotMatch(src, /pg-vbtn[^>]{0,80}capture=/);
  });

  it("cache TK152", () => {
    const sw = readFileSync(join(root, "sw.js"), "utf8");
    const html = readFileSync(join(root, "index.html"), "utf8");
    assert.match(sw, /const CACHE = "sunsu-2026-11-20-TK183"/);
    assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-20-TK183"/);
    assert.match(html, /20261120tk178/);
    assert.match(readFileSync(join(root, "supabase/functions/api/sunsu_version.ts"), "utf8"), /sunsu-engine-2026-11-19-TK157/);
  });
});
