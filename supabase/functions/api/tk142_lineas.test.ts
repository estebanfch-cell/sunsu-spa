// TK142: bloque Líneas compacto tipo MineCore, paleta clara Sunsu.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import { extrasCatalogoProd } from "./catalogo_ticket.ts";

const root = new URL("../../../", import.meta.url);
const src = fs.readFileSync(new URL("mc-tickets.js", root), "utf8");
const sw = fs.readFileSync(new URL("sw.js", root), "utf8");
const html = fs.readFileSync(new URL("index.html", root), "utf8");

describe("TK142 líneas compactas (MineCore claro)", () => {
  it("un solo bloque Líneas, sin cajas gigantes ni botón Eliminar de ancho completo", () => {
    assert.match(src, /mctk-lcard>b\{display:block/);
    assert.match(src, /\+ Agregar producto/);
    assert.doesNotMatch(src, />Eliminar<\/button>/);
    assert.doesNotMatch(src, /class="mctk-del"/);
    assert.doesNotMatch(src, /Etiqueta/);
    assert.doesNotMatch(src, /Venta puntual/);
    // sin fondo oscuro tipo MineCore
    assert.doesNotMatch(src, /#0b1|#111827|#0f172a|background:#121/);
    // paleta clara
    assert.match(src, /var\(--cream/);
    assert.match(src, /var\(--white,#fff\)/);
  });

  it("línea cerrada compacta: nombre, ↗, × chiquita, stock/bodega, descuento, cuadre y flecha ▾", () => {
    assert.match(src, /mctk-irp/);
    assert.match(src, /class="mctk-x"/);
    assert.match(src, /Quitar línea/);
    assert.match(src, /BODEGA VENTA: Stock/);
    assert.match(src, /mctk-desc/);
    assert.match(src, /mctk-ok-txt"> cuadrado</);
    assert.match(src, /data-tog/);
    assert.match(src, /mctk-arr/);
    assert.match(src, /"▾"/);
    assert.match(src, /"▴"/);
  });

  it("panel desplegable con Editar punteado, Sububicación o Paquete, Comisión, Cuadre; Costo / Util. solo super_admin", () => {
    assert.match(src, />Editar<\//);
    assert.match(src, /P\. sin IVA/);
    assert.match(src, /mctk-dot/);
    assert.match(src, /lbl: "Sububicación"/);
    assert.match(src, /lbl: "Paquete"/);
    assert.match(src, />Comisión<\//);
    assert.match(src, />Cuadre<\//);
    assert.match(src, /Canje · OK sin factura/);
    assert.match(src, /Costo \/ Util\./);
    assert.match(src, /function esSuperAdminCu\(\)/);
    assert.match(src, /CU\.role === "super_admin"/);
    assert.match(src, /if \(!esSuperAdminCu\(\)\) return ""/);
    // no se piden costos si no es super_admin
    assert.match(src, /api\("tk_costos"/);
  });

  it("conserva filas faltantes de factura, totales correctos y caché TK142", () => {
    assert.match(src, /data-falta="1"/);
    assert.match(src, /Falta en ticket/);
    assert.ok(src.includes("<span>Subtotal</span>"));
    assert.ok(src.includes("<span>IVA 15%</span>"));
    assert.ok(src.includes("<span>Pagado</span>"));
    assert.ok(src.includes("<span>Saldo</span>"));
    assert.doesNotMatch(src, /Subtotal gravado 15%|<span>Subtotal 0%|Subtotal \(sin IVA\)|Subtotal sin IVA/);
    assert.match(sw, /const CACHE = "sunsu-2026-11-19-TK158"/);
    assert.match(html, /window\.SUNSU_CACHE = "sunsu-2026-11-19-TK158"/);
    assert.match(html, /20261119tk158/);
    assert.doesNotThrow(() => new Function(src));
  });

  it("el catálogo expone stock de Bodega Venta, sububicación y comisión", () => {
    const x = extrasCatalogoProd({
      stock: 3,
      porGrupo: { CONSIGNACION: 8, OFICINA: 2 },
      porEstante: { "CONSIGNACION|1-A-1": 8, "OFICINA|C-2": 2 },
      comision: 1.58,
    });
    assert.equal(x.stockVenta, 8);
    assert.equal(x.sububicacion, "1-A-1");
    assert.equal(x.comision, 1.58);
  });
});
