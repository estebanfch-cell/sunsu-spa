import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const js = readFileSync(new URL("beta-screens.js", root), "utf8");
const html = readFileSync(new URL("index.html", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");

describe("TK194 · paquete nuevo + sesión 1 en el mismo ticket", () => {
  it("al vender un pack (x3, x6 o membresía en Paquete vendido) se refresca el canje y aparece el botón del paquete nuevo", () => {
    assert.match(js, /function _paqHayVenta\(\)/);
    assert.match(js, /function _paqVentaMeta\(\)/);
    assert.match(js, /function _paqRefrescarTrasVenta\(\)/);
    assert.match(js, /function _paqHtmlCardNuevo\(\)/);
    assert.match(js, /function _paqPrefijarNuevo\(\)/);
    assert.match(js, /function _paqAsegurarBtnNuevo\(\)/);
    assert.match(js, /T\.pack3 \|\| T\.pack6/);
    assert.ok(js.includes("function selP3(sku)") && js.includes("function selP6(sku)"));
    const p3 = js.slice(js.indexOf("function selP3(sku)"), js.indexOf("function selP6(sku)"));
    const p6 = js.slice(js.indexOf("function selP6(sku)"), js.indexOf("function selEx(sku)"));
    const fac = js.slice(js.indexOf("function selFacial(sku)"), js.indexOf("function _cedQuery"));
    assert.match(p3, /_paqRefrescarTrasVenta/);
    assert.match(p6, /_paqRefrescarTrasVenta/);
    assert.match(fac, /_paqRefrescarTrasVenta/);
    assert.match(js, /id="paq-nuevo-slot"/);
    assert.match(js, /_paqHtmlCardNuevo\(\)/);
    assert.match(js, /Descargar sesión #1 del paquete nuevo de este ticket/);
    // el botón ya no depende de que el pack existiera al primer renderTicket
    assert.ok(
      !/ \(\(T\.pack3\|\|T\.pack6\)\?'<button type="button" class="paq-alt" onclick="_paqElegirSesionNuevo\(\)">Descargar sesión #1/.test(js),
      "el botón del pack nuevo no debe quedar solo en el HTML inicial",
    );
  });

  it("el paquete nuevo va primero (Sugerido, no forzado) y debajo los activos; los completos no se pueden elegir", () => {
    const pintar = js.slice(js.indexOf("function _paqPintarLista()"), js.indexOf("function _paqPintarConfirm()"));
    const idxNuevo = pintar.indexOf("_paqHtmlCardNuevo()");
    const idxAct = pintar.indexOf("Paquetes activos de esta clienta");
    const idxDone = pintar.indexOf("Paquetes completos");
    assert.ok(idxNuevo >= 0 && idxAct > idxNuevo && idxDone > idxAct, "orden: nuevo, luego activos, luego completos");
    assert.match(js, /paq-card-nuevo/);
    assert.match(js, /<span class="paq-rec">Sugerido<\/span>/);
    assert.match(js, /puedes elegir un paquete activo anterior/);
    assert.match(js, /function _paqDesconfirmar\(\)\{[^}]*_paqOmitirNuevo/);
    // completos: clase done / badge Completo y sin botón de descargar para fin
    assert.match(pintar, /cards\(agoAct,'agotados',''\)/);
    assert.match(pintar, /else if\(fin\) ses\+='<div class="paq-ses used">Sesión /);
    assert.match(js, /window\._paqSugeridoI=\(typeof _paqHayVenta==='function'&&_paqHayVenta\(\)\)\?-1:/);
  });

  it("si cobro=Paquete y se vende pack, Enviar no se bloquea con «Confirma de qué paquete» sin nada que tocar", () => {
    const env = js.slice(js.indexOf("function enviarTicket"), js.indexOf("function enviarTicket")+8000);
    // fallback: auto-elige el paquete nuevo en vez de solo tostar
    assert.match(js, /if\(typeof _paqHayVenta==='function'&&_paqHayVenta\(\)\)\{\s*T\._paqOmitirNuevo=false;\s*if\(typeof _paqElegirSesionNuevo==='function'\) _paqElegirSesionNuevo\(\);/);
    assert.match(js, /toast\('Confirma de qué paquete se canjea la sesión/);
    // el toast de bloqueo queda solo cuando NO hay venta de pack en este ticket
    const guard = js.slice(js.indexOf("if(T.facial&&T.cobro==='paquete'&&!T.canjeOtro&&!(T.paqPick&&T.paqConfirmado)"));
    const block = guard.slice(0, guard.indexOf("} else if") > 0 ? 1200 : 1200);
    assert.ok(block.includes("_paqElegirSesionNuevo") && block.includes("toast('Confirma de qué paquete"), "guarda mixta");
    assert.match(js, /function _paqPrefijarNuevo/);
    assert.match(js, /if\(T\._paqOmitirNuevo\) return false;/);
  });

  it("si venden un pack y dejan «Se cobra», hay aviso y auto-cambio a Paquete (facial \$0) salvo que lo reviertan a mano", () => {
    assert.match(js, /function _paqAjustarCobroPorVenta\(\)/);
    assert.match(js, /function _paqPintarHintCobro\(\)/);
    assert.match(js, /function _paqSetCobroPaquete\(\)/);
    assert.match(js, /id="cobro-pack-hint"/);
    assert.match(js, /T\.facial && T\.cobro==='cobrado' && !T\._cobroPackManual/);
    assert.match(js, /El facial queda en \$0 como canje/);
    assert.match(js, /el total suma los dos y puede no cuadrar con la factura de Migo/);
    assert.match(js, /Tocar «Paquete» — facial \$0, sesión 1/);
    assert.match(js, /T\.cobro==='cobrado' && typeof _paqHayVenta==='function' && _paqHayVenta\(\) && T\.facial\) T\._cobroPackManual=true/);
  });

  it("cache TK194 y CSS móvil del hint / botón de 44px", () => {
    assert.match(html, /SUNSU_CACHE = "sunsu-2026-11-20-TK194"/);
    assert.match(sw, /const CACHE = "sunsu-2026-11-20-TK194"/);
    assert.match(html, /beta-screens\.js\?v=20261120tk194/);
    assert.match(html, /#paq-box \.paq-card-nuevo/);
    assert.match(html, /#cobro-pack-hint/);
    assert.match(html, /#paq-box \.paq-ses-nuevo[\s\S]{0,80}min-height: 44px/);
    assert.match(html, /@media \(max-width: 860px\)[\s\S]{0,500}#paq-box \.paq-ses-nuevo/);
  });

  it("el canje no incluye teléfonos", () => {
    const slice = js.slice(js.indexOf("function _paqHayVenta"), js.indexOf("function selCobro"));
    assert.equal(/telefono|teléfono|whatsapp/i.test(slice), false);
  });
});

describe("TK194 · prefijar el paquete nuevo no pisa una elección previa", () => {
  it("sugiere el nuevo y respeta un pack activo ya confirmado o un Cambiar", () => {
    const src = js.slice(js.indexOf("function _paqHayVenta()"), js.indexOf("function _paqHtmlCardNuevo()"));
    const prelude = `
      var T = { pack3: "SUNSU-18", pack6: null, paqPick: null, paqConfirmado: false, _paqOmitirNuevo: false, cedula: "1716920036" };
      var PAQ3 = [{sku:"SUNSU-18",n:"x3 Facial Reparación",p:175.5}];
      var PAQ6 = [];
      function _cedQuery(v){ return String(v||"").replace(/\\D/g,""); }
    `;
    const fns = src.replace(/window\._paq[A-Za-z]+=_paq[A-Za-z]+;\n/g, "");
    // run prefijar
    const r1 = eval(prelude + fns + `;
      _paqPrefijarNuevo();
      ({pick: T.paqPick, conf: T.paqConfirmado, uso: T.usoPaq});
    `);
    assert.equal(r1.pick.fila, "nuevo");
    assert.equal(r1.pick.total, 3);
    assert.equal(r1.conf, true);
    assert.equal(r1.uso, "1/3");

    const r2 = eval(prelude + fns + `;
      T.paqPick = { fila: 386, idx: 2, total: 3, nombre: "PACK-386" };
      T.paqConfirmado = true;
      var changed = _paqPrefijarNuevo();
      ({changed: changed, fila: T.paqPick.fila});
    `);
    assert.equal(r2.changed, false);
    assert.equal(r2.fila, 386);

    const r3 = eval(prelude + fns + `;
      T._paqOmitirNuevo = true;
      var changed = _paqPrefijarNuevo();
      ({changed: changed, pick: T.paqPick});
    `);
    assert.equal(r3.changed, false);
    assert.equal(r3.pick, null);

    const r4 = eval(prelude + fns + `;
      T.pack3 = null; T.pack6 = "SUNSU-24";
      _paqPrefijarNuevo();
      T.paqPick.total;
    `);
    // pack6 not in PAQ6 array still totals 6
    assert.equal(r4, 6);
  });
});
