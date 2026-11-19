import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function inlineScripts(html: string): { start: number; body: string; attrs: string }[] {
  const out: { start: number; body: string; attrs: string }[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/i.test(m[1]) && !m[2].trim()) continue;
    out.push({ start: html.slice(0, m.index).split("\n").length, body: m[2], attrs: m[1] });
  }
  return out;
}

/** `</script>` en una línea de código (no el cierre real de la etiqueta) corta el script en el navegador. */
function lineasPeligrosas(src: string): string[] {
  return src.split("\n").filter((line) => {
    if (!/<\/script>/i.test(line)) return false;
    const t = line.trim();
    if (/^<\/script>\s*$/i.test(t)) return false;
    if (/^<script\b[^>]*>[\s\S]*<\/script>\s*$/i.test(t) && !/`/.test(t) && !/function\s/.test(t) && !/\$\{/.test(t)) return false;
    return true;
  });
}

function extractFunction(src: string, name: string): string {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const i = src.search(re);
  if (i < 0) throw new Error("No está " + name);
  let pos = src.indexOf("{", i);
  let depth = 0;
  let quote: string | null = null;
  let esc = false;
  let tpl = 0;
  for (let j = pos; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (quote === "`" && c === "$" && src[j + 1] === "{") { quote = null; tpl++; j++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (tpl) {
      if (c === "'" || c === "\"" || c === "`") { quote = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") {
        if (depth === 0) { tpl--; quote = "`"; }
        else depth--;
      }
      continue;
    }
    if (c === "'" || c === "\"" || c === "`") { quote = c; continue; }
    if (c === "/" && src[j + 1] === "/") { while (j < src.length && src[j] !== "\n") j++; continue; }
    if (c === "/" && src[j + 1] === "*") { const k = src.indexOf("*/", j + 2); j = k < 0 ? src.length : k + 1; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  throw new Error("No cerró " + name);
}

describe("TK78 Configuración general no se corta por </script>", () => {
  it("ningún HTML de la beta deja un </script> crudo dentro de un template JS", () => {
    const files = ["index.html", ...readdirSync(root).filter((f) => f.endsWith(".html") && f !== "sunsu.html" && f !== "beta.html" && f !== "index.html")];
    const hits: string[] = [];
    for (const f of files) {
      const p = join(root, f);
      let src = "";
      try { src = readFileSync(p, "utf8"); } catch { continue; }
      const bad = lineasPeligrosas(src);
      for (const line of bad) hits.push(`${f}: ${line.trim().slice(0, 160)}`);
    }
    // también módulos que se inyectan en la página: un </script> en un string de .js no corta el archivo, pero sí si luego se document.write
    for (const f of readdirSync(root).filter((x) => /^(mc-|beta-).*\.js$/.test(x))) {
      const bad = lineasPeligrosas(readFileSync(join(root, f), "utf8")).filter((l) => /document\.write|innerHTML|insertAdjacentHTML|<\/script>/i.test(l));
      // en .js solo reportamos si construyen HTML con </script> sin escapar
      for (const line of bad) {
        if (/`[^`]*<\/script>/i.test(line) || /"[^"]*<\/script>/i.test(line) || /'[^']*<\/script>/i.test(line)) {
          hits.push(`${f}: ${line.trim().slice(0, 160)}`);
        }
      }
    }
    assert.deepEqual(hits, []);
  });

  it("el parser HTML del navegador deja entero el script con renderConfiguracion, Comisiones y Rol", () => {
    const html = readFileSync(join(root, "index.html"), "utf8");
    const scripts = inlineScripts(html);
    const main = scripts.find((s) => s.body.includes("async function renderConfiguracion"));
    assert.ok(main, "el </script> de cfg-priv-json no debe cortar el script principal");
    assert.match(main!.body, /async function renderComisiones/);
    assert.match(main!.body, /async function renderRol/);
    assert.match(main!.body, /id="cfg-priv-json" hidden/);
    assert.equal(main!.body.includes("</script>"), false);
  });

  it("renderConfiguracion devuelve HTML de permisos, no el fuente", async () => {
    const html = readFileSync(join(root, "index.html"), "utf8");
    const main = inlineScripts(html).find((s) => s.body.includes("async function renderConfiguracion"));
    assert.ok(main);
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
    const sliceFn = (body: string, start: RegExp, end: RegExp) => {
      const i = body.search(start);
      if (i < 0) throw new Error("No empieza " + start);
      const e = body.slice(i + 1).search(end);
      if (e < 0) throw new Error("No termina " + start);
      return body.slice(i, i + 1 + e);
    };
    const src = [
      sliceFn(main!.body, /function htmlCfgPriv\b/, /\nasync function renderConfiguracion\b/),
      sliceFn(main!.body, /async function renderConfiguracion\b/, /\nasync function renderComisiones\b/),
    ].join("\n");
    const api = async (accion: string) => {
      if (accion === "cfg_priv_get") {
        return {
          ok: true,
          nota: "Admin y super admin siempre tienen estos permisos.",
          flags: [{ id: "telefonos", label: "Teléfonos" }],
          roles: [{ rol: "cosmetologa", flags: { telefonos: false } }],
          usuarios: [{ uid: "andrea", nombre: "Andrea Robles", rol: "cosmetologa", flags: {}, origen: {} }],
        };
      }
      return { ok: true, faciales: [], base: [], extra: [], recepcion: [], tramos: [], productos: [] };
    };
    const fn = new Function(
      "state", "api", "esc", "cfgLinea", "window", "fail", "htmlPagoConfig", "htmlAsisConfig", "htmlCfgJump",
      src + "\n; return renderConfiguracion;",
    );
    const render = fn(
      { admin: true },
      api,
      esc,
      () => "",
      { SunsuInline: null },
      (d: { error?: string }) => `<p class="err">${d && d.error ? d.error : ""}</p>`,
      async () => `<p>pago</p>`,
      async () => `<p>asis</p>`,
      () => "",
    ) as () => Promise<string>;
    const out = await render();
    assert.equal(out.includes("async function"), false, out.slice(0, 400));
    assert.equal(out.includes("${"), false, out.slice(0, 400));
    assert.match(out, /Permisos por rol y usuario/);
    assert.match(out, /Teléfonos/);
    assert.match(out, /Una vigencia nueva no cambia/);
    assert.match(out, /id="cfg-roles"/);
    assert.equal(out.includes("</script>"), false);
  });
});
