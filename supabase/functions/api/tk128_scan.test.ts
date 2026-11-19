import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../../../", import.meta.url);
const scan = readFileSync(new URL("mc-scan.js", root), "utf8");
const html = readFileSync(new URL("beta.html", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");
const prod = readFileSync(new URL("mc-productos.js", root), "utf8");
const aperturas = readFileSync(new URL("mc-aperturas.js", root), "utf8");
const barras = readFileSync(new URL("mc-barras.js", root), "utf8");
const tickets = readFileSync(new URL("mc-tickets.js", root), "utf8");
const conteo = readFileSync(new URL("mc-conteo.js", root), "utf8");
const zxing = readFileSync(new URL("vendor-zxing.js", root), "utf8");

describe("TK128 escáner compartido", () => {
  it("un solo módulo, ZXing en el repo, sin CDN, y todos los botones de cámara lo usan", () => {
    assert.match(html, /mc-scan\.js\?v=20261119tk139/);
    assert.match(html, /vendor-zxing\.js\?v=20261119tk139/);
    assert.match(sw, /\/mc-scan\.js/);
    assert.match(sw, /\/vendor-zxing\.js/);
    assert.match(zxing, /BrowserMultiFormatReader/);
    assert.doesNotMatch(scan, /cdn\.jsdelivr\.net/);
    assert.match(scan, /ean_13/);
    assert.match(scan, /upc_a/);
    assert.match(scan, /code_128/);
    assert.match(scan, /code_39/);
    assert.match(scan, /qr_code/);
    assert.match(scan, /facingMode/);
    assert.match(scan, /playsinline/);
    assert.match(scan, /Cancelar/);
    assert.match(scan, /Linterna/);
    assert.match(scan, /vibrate/);
    assert.match(scan, /Ajustes → Safari → Cámara/);
    assert.match(prod, /MCScan\.abrir/);
    assert.match(prod, /agregarCodigoEscaneado/);
    assert.match(prod, /¿Agregar el código/);
    assert.match(prod, /mcprod_codigos_save/);
    assert.match(aperturas, /MCScan\.abrir/);
    assert.doesNotMatch(aperturas, /new window\.BarcodeDetector/);
    assert.match(barras, /MCScan\.abrir/);
    assert.match(tickets, /id="mctk-cam"/);
    assert.match(tickets, /MCScan\.abrir/);
    assert.match(conteo, /_scanAbrir/);
  });

  it("sin getUserMedia muestra el aviso de escribir el código", () => {
    const toasts: string[] = [];
    const g: Record<string, unknown> = {
      toast2(m: string) { toasts.push(m); },
      document: { getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild() {} }, body: { appendChild() {} } },
      navigator: {},
    };
    (g as { window: unknown }).window = g;
    vm.runInNewContext(scan, g);
    (g as { MCScan: { abrir: (cb: (t: string) => void) => void } }).MCScan.abrir(() => { throw new Error("no debía leer"); });
    assert.equal(toasts[0], "Este navegador no lee códigos con la cámara; escribe el código");
  });

  it("con BarcodeDetector y getUserMedia entrega el código, vibra y cierra el overlay", async () => {
    const leidos: string[] = [];
    const vibrar: number[] = [];
    const bodyKids: { id?: string }[] = [];
    const byId: Record<string, { id: string; hidden: boolean; srcObject: unknown; muted: boolean; textContent: string; onclick: unknown; setAttribute: () => void; play: () => Promise<void> }> = {};
    const mk = (id: string) => {
      const n = { id, hidden: false, srcObject: null as unknown, muted: true, textContent: "", onclick: null as unknown, setAttribute() {}, play: () => Promise.resolve() };
      byId[id] = n;
      return n;
    };
    const g: any = {
      toast2() {},
      document: {
        getElementById(id: string) { return byId[id] || null; },
        createElement(tag: string) {
          const n: any = { id: "", style: {}, hidden: false, textContent: "", setAttribute() {}, appendChild() {}, play: () => Promise.resolve(), querySelector() { return mk("mcscan-cancel"); } };
          if (tag === "div") {
            Object.defineProperty(n, "innerHTML", { set() { n.id = "mcscan-ov"; mk("mcscan-ov"); mk("mcscan-vid"); mk("mcscan-cancel"); mk("mcscan-torch"); }, get() { return ""; } });
          }
          return n;
        },
        head: { appendChild() {} },
        body: { appendChild(n: { id?: string }) { bodyKids.push(n); }, removeChild() {}, children: bodyKids },
      },
      navigator: {
        vibrate(n: number) { vibrar.push(n); },
        mediaDevices: { getUserMedia: async () => ({ getVideoTracks: () => [{ enabled: true, getCapabilities: () => ({}) }] }) },
      },
    };
    g.window = g;
    g.setTimeout = setTimeout;
    g.clearTimeout = clearTimeout;
    g.Map = Map;
    g.BarcodeDetector = class { async detect() { return [{ rawValue: "7501234567890" }]; } };
    vm.runInNewContext(scan, g);
    g.MCScan.abrir((t: string) => leidos.push(t));
    await new Promise((r) => setTimeout(r, 450));
    assert.deepEqual(leidos, ["7501234567890"]);
    assert.deepEqual(vibrar, [60]);
  });

  it("si se niega el permiso, explica cómo activar la cámara en Safari", async () => {
    const toasts: string[] = [];
    const g: any = {
      window: null,
      toast2(m: string) { toasts.push(m); },
      document: {
        getElementById() { return { setAttribute() {}, play: () => Promise.resolve(), srcObject: null, muted: true, onclick: null, hidden: false, textContent: "" }; },
        createElement() { return { setAttribute() {}, style: {}, innerHTML: "", querySelector() { return { onclick: null }; } }; },
        head: { appendChild() {} },
        body: { appendChild() {}, children: [] },
      },
      navigator: {
        mediaDevices: { getUserMedia: async () => { const e: any = new Error("denied"); e.name = "NotAllowedError"; throw e; } },
      },
    };
    g.window = g;
    g.window.BarcodeDetector = function () { return { detect: async () => [] }; };
    vm.runInNewContext(scan, g);
    g.MCScan.abrir(function () {});
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(toasts.some((t) => /Ajustes → Safari → Cámara/.test(t)), toasts.join(" | "));
    assert.ok(!toasts.some((t) => /este navegador no lee/i.test(t)));
  });
});
