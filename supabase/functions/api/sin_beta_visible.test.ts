import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const FORBIDDEN: [RegExp, string][] = [
  [/Esta es la beta/i, "banner 'Esta es la beta'"],
  [/vive en Supabase/i, "mención de Supabase al usuario"],
  [/sunsu\.html sigue siendo/i, "sunsu.html sigue siendo la operación"],
  [/Sistema central en prueba/i, "Sistema central en prueba"],
  [/\bModo prueba\b/, "Modo prueba"],
  [/MODO PRUEBA/, "MODO PRUEBA"],
  [/datos de prueba/i, "datos de prueba"],
  [/El radio permitido es/, "El radio permitido es"],
  [/\ben la beta\b/i, "en la beta"],
  [/\bde la beta\b/i, "de la beta"],
  [/\bdesde la beta\b/i, "desde la beta"],
  [/<span class="beta-tag">\s*BETA\s*<\/span>/, "etiqueta BETA"],
  [/<span class="ix-prueba">PRUEBA<\/span>/, "badge PRUEBA"],
];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(^|[^:\"'])\/\/.*$/gm, "$1");
}

function uiFiles(): string[] {
  const names = readdirSync(root);
  const out: string[] = [];
  for (const n of names) {
    if (n === "index.html" || n === "beta.html" || n === "sunsu.html" || n === "manifest.webmanifest" || n === "sw.js") out.push(join(root, n));
    if (/^(mc-|beta-).+\.js$/.test(n)) out.push(join(root, n));
  }
  return out;
}

function apiFiles(): string[] {
  const dir = join(root, "supabase/functions/api");
  return readdirSync(dir)
    .filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))
    .map((n) => join(dir, n));
}

describe("la app no dice que es una beta ni un modo prueba", () => {
  it("no reaparecen frases de beta, prueba o Supabase en texto visible", () => {
    const hits: string[] = [];
    for (const file of [...uiFiles(), ...apiFiles()]) {
      const text = stripComments(readFileSync(file, "utf8"));
      const rel = file.slice(root.length + 1);
      for (const [re, label] of FORBIDDEN) {
        re.lastIndex = 0;
        if (re.test(text)) hits.push(`${rel}: ${label}`);
      }
    }
    assert.equal(hits.length, 0, hits.join("\n"));
  });

  it("el radio de asistencia por defecto es 20 m y el aviso solo dice la distancia", () => {
    const asis = readFileSync(join(root, "supabase/functions/api/asistencia.ts"), "utf8");
    assert.match(asis, /radio_m:\s*20/);
    assert.match(asis, /Estás a \$\{Math\.round\(distancia\)\} m de \$\{local\}\./);
    assert.doesNotMatch(asis, /El radio permitido es/);
    const html = readFileSync(join(root, "index.html"), "utf8");
    assert.match(html, /radio_m:\s*20/);
    assert.match(html, /cfg\.radio_m \?\? 20/);
    assert.doesNotMatch(html, /El radio permitido es/);
  });

  it("el encabezado en pantalla chica no tiene el reloj y no se desborda", () => {
    const html = readFileSync(join(root, "index.html"), "utf8");
    assert.match(html, /class="top-actions"/);
    const media = html.split("@media (max-width: 860px)")[1] || "";
    assert.match(media, /\.reloj-head\s*\{\s*display:\s*none/);
    assert.match(media, /\.top\s*\{[^}]*overflow-x:\s*hidden/);
  });
});
