// Sistema viejo (sunsu.html): reglas Black Friday con GRUPO / MIN / POR=UNIDAD (Emilia 18/11).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const root = join(import.meta.dirname, "../../..");
const html = readFileSync(join(root, "sunsu.html"), "utf8");
const a = html.indexOf("// ── PROMOS V2: helpers compartidos"), b = html.indexOf("function toggleDescuento(tipo){");

function motor() {
  const ctx: Record<string, unknown> = { window: {}, toast: () => {} };
  vm.createContext(ctx);
  vm.runInContext(`var CU={role:'cosmetologa'};
var FACIALES=[], EXTRAS=[], PAQ3=[{sku:'SUNSU-53',n:'x3',p:256.5}], PAQ6=[{sku:'SUNSU-54',n:'x6',p:484.5}];
var PROVS=[{prods:[{sku:'SUNSU-ML-001',n:'PDRN',p:110},{sku:'SUNSU-ML-013',n:'Toner',p:110}]}];
function _ampCantValor(){return 1;} function updatePreview(){ _promoAuto(); }
var T={};
` + html.slice(a, b) + `
var G='Black Friday';
window._promosVig=[{fila:5,grupo:G,nombre:'Ginseng x3 · 10% adicional',tipo:'%',valor:10,codigos:['SUNSU-53'],minU:1},
 {fila:6,grupo:G,nombre:'Ginseng x6 · 10% adicional',tipo:'%',valor:10,codigos:['SUNSU-54'],minU:1},
 {fila:7,grupo:G,nombre:'ML-001 + ML-013',tipo:'$',valor:10,codigos:['SUNSU-ML-001','SUNSU-ML-013'],minU:2,porUnidad:true}];
function caso(set){ T={cobro:'',facial:'',extras:{},pack3:'',pack6:'',productos:{},descuento:null}; set(T); _promoAuto(); return {monto:_promoTotal().monto, label:T.descuento.promo||''}; }`, ctx);
  return ctx as { caso: (f: (t: Record<string, unknown>) => void) => { monto: number; label: string }; _promoCalc: (p: unknown, u: unknown) => { monto: number } };
}

test("Black Friday viejo: ML-001/ML-013 piden 2 unidades combinadas y descuentan $10 c/u", () => {
  const m = motor();
  assert.equal(m.caso((t) => { t.productos = { "SUNSU-ML-001": 1 }; }).monto, 0);
  assert.equal(m.caso((t) => { t.productos = { "SUNSU-ML-001": 1, "SUNSU-ML-013": 1 }; }).monto, 20);
  assert.equal(m.caso((t) => { t.productos = { "SUNSU-ML-001": 2 }; }).monto, 20);
  assert.equal(m.caso((t) => { t.productos = { "SUNSU-ML-013": 2 }; }).monto, 20);
  assert.equal(m.caso((t) => { t.productos = { "SUNSU-ML-001": 2, "SUNSU-ML-013": 1 }; }).monto, 30);
});
test("Black Friday viejo: Ginseng x3/x6 llevan 10% adicional sobre el precio del paquete; etiqueta agrupada", () => {
  const m = motor();
  assert.equal(m.caso((t) => { t.pack3 = "SUNSU-53"; }).monto, 25.65);
  assert.equal(m.caso((t) => { t.pack6 = "SUNSU-54"; }).monto, 48.45);
  const r = m.caso((t) => { t.pack3 = "SUNSU-53"; t.productos = { "SUNSU-ML-001": 2 }; });
  assert.equal(r.monto, 45.65);
  assert.equal(r.label, "Black Friday: Ginseng x3 · 10% adicional + ML-001 + ML-013");
});
test("Promos viejas sin columnas nuevas calculan igual que antes ($ una vez)", () => {
  const m = motor();
  assert.equal(m._promoCalc({ tipo: "$", valor: 10, codigos: ["SUNSU-ML-001"] }, [{ sku: "SUNSU-ML-001", p: 110 }, { sku: "SUNSU-ML-001", p: 110 }]).monto, 10);
});
test("Apps Script lee y escribe GRUPO / MIN / POR (K-M) sin tocar A-J", () => {
  const gs = readFileSync(join(root, "sunsu_script_completo.js"), "utf8");
  assert.match(gs, /grupo:\(r\[10\]\|\|''\)/);
  assert.match(gs, /minU:Math\.max\(1,Math\.round\(parseFloat\(r\[11\]\)\|\|1\)\)/);
  assert.match(gs, /porUnidad:\(\(r\[12\]\|\|''\)\+''\)\.trim\(\)\.toUpperCase\(\)==='UNIDAD'/);
  assert.match(gs, /setValues\(\[\['GRUPO','MIN','POR'\]\]\)/);
});
