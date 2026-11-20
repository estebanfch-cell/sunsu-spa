import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const srcTk = () => readFileSync(join(root, "mc-tickets.js"), "utf8");

type Nodeish = {
  nodeType: number;
  tagName?: string;
  parentNode: Nodeish | null;
  childNodes: Nodeish[];
  text?: string;
  attrs: Record<string, string>;
  _id?: string;
  _class?: string;
  _hidden?: boolean;
  _listeners: Record<string, ((ev: any) => void)[]>;
  _handlers: Record<string, ((ev: any) => void) | null>;
  style: Record<string, string>;
  ownerDocument: any;
};

function makeDom() {
  const byId = new Map<string, Nodeish>();
  function el(tag: string, attrs: Record<string, string> = {}): Nodeish {
    const n: Nodeish = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      parentNode: null,
      childNodes: [],
      attrs: { ...attrs },
      _listeners: {},
      _handlers: {},
      style: {},
      ownerDocument: null as any,
    };
    if (attrs.id) { n._id = attrs.id; byId.set(attrs.id, n); }
    n._class = attrs.class || attrs.className || "";
    wrap(n);
    return n;
  }
  function text(s: string): Nodeish {
    return { nodeType: 3, text: s, parentNode: null, childNodes: [], attrs: {}, _listeners: {}, _handlers: {}, style: {}, ownerDocument: null as any };
  }
  function wrap(n: Nodeish) {
    const api: any = n;
    Object.defineProperties(api, {
      id: {
        get: () => n._id || n.attrs.id || "",
        set: (v: string) => { if (n._id) byId.delete(n._id); n._id = String(v || ""); n.attrs.id = n._id; if (n._id) byId.set(n._id, n); },
      },
      className: {
        get: () => n._class || "",
        set: (v: string) => { n._class = String(v || ""); n.attrs.class = n._class; },
      },
      classList: {
        get: () => ({
          contains: (c: string) => (" " + (n._class || "") + " ").includes(" " + c + " "),
          add: (c: string) => { if (!api.classList.contains(c)) n._class = ((n._class || "") + " " + c).trim(); n.attrs.class = n._class; },
          remove: (c: string) => { n._class = (n._class || "").split(/\s+/).filter((x) => x && x !== c).join(" "); n.attrs.class = n._class; },
          toggle: (c: string, on?: boolean) => { const has = api.classList.contains(c); if (on === true || (on == null && !has)) api.classList.add(c); else api.classList.remove(c); },
        }),
      },
      hidden: {
        get: () => n._hidden === true || n.attrs.hidden != null,
        set: (v: boolean) => { n._hidden = !!v; if (v) n.attrs.hidden = ""; else delete n.attrs.hidden; },
      },
      children: { get: () => n.childNodes.filter((c) => c.nodeType === 1) },
      textContent: {
        get: () => n.childNodes.map((c) => c.nodeType === 3 ? (c.text || "") : (c as any).textContent).join(""),
        set: (v: string) => { n.childNodes = [text(String(v ?? ""))]; n.childNodes[0].parentNode = n; },
      },
      innerHTML: {
        get: () => serialize(n),
        set: (html: string) => { n.childNodes = parse(String(html || ""), n); },
      },
      onclick: {
        get: () => n._handlers.onclick || null,
        set: (fn: any) => { n._handlers.onclick = fn; },
      },
      oninput: {
        get: () => n._handlers.oninput || null,
        set: (fn: any) => { n._handlers.oninput = fn; },
      },
      onchange: {
        get: () => n._handlers.onchange || null,
        set: (fn: any) => { n._handlers.onchange = fn; },
      },
      onkeydown: {
        get: () => n._handlers.onkeydown || null,
        set: (fn: any) => { n._handlers.onkeydown = fn; },
      },
      disabled: { get: () => n.attrs.disabled != null, set: (v: boolean) => { if (v) n.attrs.disabled = ""; else delete n.attrs.disabled; } },
      value: { get: () => n.attrs.value || "", set: (v: string) => { n.attrs.value = String(v ?? ""); } },
    });
    api.getAttribute = (k: string) => (k in n.attrs ? n.attrs[k] : (k === "class" ? n._class : k === "id" ? n._id : null));
    api.setAttribute = (k: string, v: string) => {
      n.attrs[k] = String(v ?? "");
      if (k === "id") api.id = v;
      if (k === "class") api.className = v;
    };
    api.hasAttribute = (k: string) => k in n.attrs || (k === "hidden" && n._hidden);
    api.appendChild = (c: Nodeish) => { c.parentNode = n; n.childNodes.push(c); if (c._id) byId.set(c._id, c); return c; };
    api.remove = () => { if (!n.parentNode) return; const p = n.parentNode; p.childNodes = p.childNodes.filter((x) => x !== n); n.parentNode = null; if (n._id) byId.delete(n._id); };
    api.focus = () => {};
    api.click = () => dispatch(n, { type: "click", target: n, preventDefault() {}, stopPropagation() { (this as any)._stop = true; }, bubbles: true });
    api.addEventListener = (type: string, fn: (ev: any) => void) => { (n._listeners[type] = n._listeners[type] || []).push(fn); };
    api.querySelector = (sel: string) => qs(n, sel, true);
    api.querySelectorAll = (sel: string) => qs(n, sel, false);
    api.closest = (sel: string) => { let c: Nodeish | null = n; while (c) { if (c.nodeType === 1 && matches(c, sel)) return c; c = c.parentNode; } return null; };
    api.matches = (sel: string) => matches(n, sel);
    api.getElementById = (id: string) => byId.get(id) || null;
  }
  function matches(n: Nodeish, sel: string): boolean {
    sel = sel.trim();
    if (sel.includes(",")) return sel.split(",").some((s) => matches(n, s));
    if (sel === "*") return n.nodeType === 1;
    // compound: tag#id.class[attr][attr=val]...
    let rest = sel;
    const tag = rest.match(/^[a-zA-Z][\w-]*/);
    if (tag) { if ((n.tagName || "") !== tag[0].toUpperCase()) return false; rest = rest.slice(tag[0].length); }
    while (rest) {
      if (rest[0] === "#") { const m = rest.match(/^#([\w-]+)/); if (!m || n._id !== m[1]) return false; rest = rest.slice(m[0].length); continue; }
      if (rest[0] === ".") { const m = rest.match(/^\.([\w-]+)/); if (!m || !(" " + (n._class || "") + " ").includes(" " + m[1] + " ")) return false; rest = rest.slice(m[0].length); continue; }
      if (rest[0] === "[") {
        const m = rest.match(/^\[([^\]]+)\]/);
        if (!m) return false;
        const body = m[1];
        const eq = body.match(/^([\w-]+)(?:\s*=\s*["']?([^"'\]]+)["']?)?$/);
        if (!eq) return false;
        const k = eq[1], v = eq[2];
        const has = k in n.attrs || (k === "class" && n._class) || (k === "id" && n._id);
        if (!has) return false;
        if (v != null) {
          const got = k === "class" ? n._class : k === "id" ? n._id : n.attrs[k];
          if (String(got) !== v) return false;
        }
        rest = rest.slice(m[0].length);
        continue;
      }
      return false;
    }
    return true;
  }
  function qs(root: Nodeish, sel: string, first: boolean): any {
    const parts = sel.split(",").map((s) => s.trim()).filter(Boolean);
    const out: Nodeish[] = [];
    for (const p of parts) {
      const tokens = p.split(/\s+/).filter(Boolean);
      let set: Nodeish[] = [root];
      for (const tok of tokens) {
        const next: Nodeish[] = [];
        for (const s of set) walk(s, (n) => { if (n !== s && n.nodeType === 1 && matches(n, tok)) next.push(n); });
        set = next;
      }
      for (const n of set) if (!out.includes(n)) out.push(n);
      if (first && out.length) return out[0];
    }
    return first ? null : out;
  }
  function walk(n: Nodeish, fn: (n: Nodeish) => void) { fn(n); for (const c of n.childNodes) walk(c, fn); }
  function parse(html: string, parent: Nodeish): Nodeish[] {
    const VOID = new Set(["BR","HR","IMG","INPUT","META","LINK","AREA","BASE","COL","EMBED","SOURCE","TRACK","WBR"]);
    const out: Nodeish[] = [];
    let i = 0;
    const stack: Nodeish[] = [];
    const top = () => stack[stack.length - 1] || null;
    const attach = (n: Nodeish) => { const p = top() || parent; n.parentNode = p; if (top()) top()!.childNodes.push(n); else out.push(n); };
    while (i < html.length) {
      if (html[i] === "<") {
        if (html.startsWith("<!--", i)) { const e = html.indexOf("-->", i + 4); i = e < 0 ? html.length : e + 3; continue; }
        const close = html[i + 1] === "/";
        const end = html.indexOf(">", i);
        if (end < 0) break;
        const raw = html.slice(i + (close ? 2 : 1), end).trim();
        const self = raw.endsWith("/");
        const body = self ? raw.slice(0, -1).trim() : raw;
        if (close) {
          const tag = body.split(/\s+/)[0].toUpperCase();
          for (let k = stack.length - 1; k >= 0; k--) { if (stack[k].tagName === tag) { stack.length = k; break; } }
          i = end + 1;
          continue;
        }
        const sp = body.search(/\s/);
        const tag = (sp < 0 ? body : body.slice(0, sp)).toUpperCase();
        const attrs: Record<string, string> = {};
        const rest = sp < 0 ? "" : body.slice(sp);
        rest.replace(/([\w:-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, (_m, k, _v, dq, sq, uq) => {
          attrs[k] = dq != null ? dq : sq != null ? sq : uq != null ? uq : "";
          return "";
        });
        const node = el(tag, attrs);
        if (attrs.hidden != null) node._hidden = true;
        attach(node);
        if (!self && !VOID.has(tag)) stack.push(node);
        i = end + 1;
        continue;
      }
      const next = html.indexOf("<", i);
      const chunk = html.slice(i, next < 0 ? html.length : next);
      if (chunk) attach(text(chunk));
      i = next < 0 ? html.length : next;
    }
    return out;
  }
  function serialize(n: Nodeish): string {
    return n.childNodes.map((c) => {
      if (c.nodeType === 3) return c.text || "";
      const attrs = Object.entries(c.attrs).map(([k, v]) => v === "" && k !== "value" ? " " + k : " " + k + '="' + v + '"').join("");
      const open = "<" + (c.tagName || "div").toLowerCase() + attrs + ">";
      return open + serialize(c) + "</" + (c.tagName || "div").toLowerCase() + ">";
    }).join("");
  }
  function dispatch(n: Nodeish, ev: any) {
    ev.target = ev.target || n;
    ev.currentTarget = n;
    const path: Nodeish[] = [];
    for (let c: Nodeish | null = n; c; c = c.parentNode) path.push(c);
    for (const node of path) {
      const typ = ev.type;
      const h = node._handlers["on" + typ];
      if (h) h.call(node, ev);
      for (const fn of (node._listeners[typ] || [])) fn.call(node, ev);
      if (ev._stop) break;
    }
  }

  const docEl = el("html", {});
  const head = el("head", {});
  const body = el("body", {});
  docEl.appendChild(head);
  docEl.appendChild(body);
  const document: any = {
    documentElement: docEl,
    head,
    body,
    getElementById: (id: string) => byId.get(id) || null,
    querySelector: (sel: string) => (docEl as any).querySelector(sel) || (body as any).querySelector(sel),
    querySelectorAll: (sel: string) => { const a = (docEl as any).querySelectorAll(sel); const b = (body as any).querySelectorAll(sel); return [...new Set([...a, ...b])]; },
    createElement: (tag: string) => el(tag, {}),
    addEventListener: () => {},
  };
  (docEl as any).ownerDocument = document;
  (head as any).ownerDocument = document;
  (body as any).ownerDocument = document;
  const window: any = {
    document,
    matchMedia: (q: string) => ({ matches: !/min-width:\s*861px/.test(q), addListener() {}, addEventListener() {} }),
    addEventListener: () => {},
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { hash: "#/m/tickets/t/TK-SO-1914" },
    confirm: () => true,
    alert: () => {},
    prompt: () => null,
    toast: () => {},
    esc: (v: unknown) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
    go() {},
    api: async () => ({ items: [] }),
    console,
    CSS: { escape: (s: string) => s },
  };
  document.defaultView = window;
  window.window = window;
  return { window, document, byId, dispatch };
}

const ticket = {
  ok: true,
  clave: "TK-SO-1914",
  admin: true,
  ticket: { clave: "TK-SO-1914", soNum: "TK-SO-1914", sheetRow: 1907, cobradoSistema: 350.16, cancelado: null, nombre: "Test", apellido: "" },
  info: { nombre: "Test", apellido: "", factura: "001-001-000002971", fecha: "2026-11-18" },
  lineas: [
    { tipo: "facial", sku: "02", nombre: "Facial", cantidad: 1, precio_unit: 0, total_linea: 0, canje: true },
    { tipo: "producto", sku: "INV-123", nombre: "Caja de gift card", cantidad: 1, precio_unit: 3, total_linea: 3 },
  ],
  totales: { subtotal: 307.1, iva: 46.06, total: 353.16 },
  descuento: { tipo: null, valor: 0 },
  pagos: { pagado: 350.16, total: 353.16, saldo: 3, cobrado: true, metodos: [{ metodo: "Tarjeta" }] },
  chips: [], documentos: [{ tipo: "factura", url: "https://example/fac.pdf", nombre: "Factura 2971" }], faltan: [], flags: [], reagendada: {},
  puedeEditar: true, puedePedir: false, puedeCancelar: true, clienteKey: "",
  giftcards: [{ uso: "vendida", codigo: "26-174" }],
  paquete: { vigentes: [{ id: 1 }], uso: true },
};

describe("TK113 · ticket móvil sin error en Documentos", () => {
  it("el error de pantalla es un mensaje corto y no vuelca el código fuente", () => {
    const js = srcTk();
    assert.match(js, /No se pudo mostrar esta pantalla\. Recarga e inténtalo de nuevo/);
    assert.doesNotMatch(js, /Error en la pantalla: " \+ \(\(x && x\.message\)/);
    assert.match(js, /onDocs/);
    assert.match(js, /#mctk-acc/);
    assert.match(js, /on\(main, "#mctk-dd"/);
  });

  it("sube el cache a TK113", () => {
    const beta = readFileSync(join(root, "index.html"), "utf8");
    const sw = readFileSync(join(root, "sw.js"), "utf8");
    assert.match(beta, /20261120tk178/);
    assert.match(sw, /sunsu-2026-11-20-TK182/);    assert.doesNotMatch(sw, /sunsu-beta-2026-11-18-TK112/);
  });

  it("abre un ticket a ancho de celular sin errores de JS y Documentos vive en Acciones", () => {
    const { window, document } = makeDom();
    const jsErr: string[] = [];
    window.onerror = (m: string) => { jsErr.push(String(m)); };
    const opened: string[] = [];
    window.MCPrevia = {
      abrir: (u: string) => { opened.push("pv:" + u); },
      tarjeta: () => { opened.push("tarjeta"); },
      pdf: () => { opened.push("pdf"); },
    };
    window.api = async (accion: string) => {
      if (accion === "tk_get") return new Promise(() => { /* no rehidratar a media prueba */ });
      return { ok: true, items: [] };
    };
    const js = srcTk();
    Object.assign(window, { sessionStorage: window.sessionStorage, document, api: window.api, esc: window.esc, go: window.go, toast: window.toast, confirm: window.confirm, alert: window.alert, prompt: window.prompt, location: window.location, matchMedia: window.matchMedia, console, MCPrevia: window.MCPrevia });
    vm.createContext(window);
    assert.doesNotThrow(() => { vm.runInContext(js, window); });
    const MC = window.MCTickets;
    assert.ok(MC && MC.wire && MC.render);
    window._tkVista = { "TK-SO-1914": ticket };
    window.sessionStorage.getItem = (k: string) => k === "sunsu.tk.TK-SO-1914" ? JSON.stringify(ticket) : null;
    const html = MC.render({ id: "TK-SO-1914" });
    assert.match(html, /id="mctk-acc"/);
    assert.doesNotMatch(html, /id="mctk-dd"/);
    assert.match(html, /data-doc="tarjeta"|data-doc="paquete"|data-doc="gc"/);
    assert.match(html, /Acciones/);
    const main = document.createElement("div");
    main.id = "main";
    document.body.appendChild(main);
    main.innerHTML = html;
    assert.ok(document.getElementById("mctk-root"), "falta #mctk-root");
    assert.doesNotThrow(() => MC.wire(main));
    const err = main.querySelector("#mctk-err");
    assert.ok(err);
    assert.equal(err.textContent || "", "", "no debe haber error visible: " + (err.textContent || ""));
    assert.equal(jsErr.join(" | "), "");
    assert.ok(main.querySelector("#mctk-acc"));
    assert.equal(main.querySelector("#mctk-dd"), null);
    const docBtn = main.querySelector("[data-doc='gc']") || main.querySelector("[data-doc='paquete']") || main.querySelector("[data-doc='tarjeta']");
    assert.ok(docBtn, "faltan botones de Documentos en Acciones");
    assert.doesNotThrow(() => docBtn.click());
  });
});
