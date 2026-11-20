#!/usr/bin/env node
/**
 * Sunsu Spa · sync-web
 * Copia la web de producción (raíz del repo, la misma que publica https://app.sunsuspa.com/)
 * a mobile/www/ para empaquetarla DENTRO del .ipa, y agrega SOLO en la copia nativa:
 *   - viewport-fit=cover (para env(safe-area-inset-*) en iPhone con notch / Dynamic Island)
 *   - native-ios.css + native-ios-bridge.js (mejoras nativas que solo se activan en Capacitor)
 * Los archivos de la raíz NO se modifican.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MOBILE = resolve(here, '..');
const ROOT = resolve(MOBILE, '..');
const OUT = resolve(process.env.SUNSU_WWW_OUT || join(MOBILE, 'www'));

/** Carpetas / archivos de la raíz que NO son parte de la web publicada. */
export const EXCLUDE_DIRS = new Set(['.git', '.github', 'mobile', 'supabase', 'docs', 'migrations', 'sql', 'node_modules', 'tests', 'test', '.vscode', '.idea']);
export const EXCLUDE_FILES = new Set([
  'package.json', 'package-lock.json', 'deno.lock', 'tsconfig.json', 'CNAME', '.gitignore', '.nojekyll',
  'sunsu_script_completo.js', // script legacy de Apps Script (solo referencia, la web no lo carga)
  'sw.js', // el service worker no aplica dentro de la app nativa (assets ya van en el bundle)
]);
const EXCLUDE_EXT = ['.md', '.ts', '.sql', '.map', '.log', '.sh', '.py'];

export function incluir(rel) {
  const parts = rel.split(/[\\/]/);
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return false;
  const base = parts[parts.length - 1];
  if (parts.length === 1 && EXCLUDE_FILES.has(base)) return false;
  if (base.startsWith('.')) return false;
  if (/\.test\.(m?js|ts)$/.test(base)) return false;
  if (EXCLUDE_EXT.some((x) => base.endsWith(x))) return false;
  return true;
}

export function prepararHtml(html) {
  let out = html;
  // 1) viewport-fit=cover en el meta viewport (solo en la copia nativa)
  out = out.replace(/<meta\s+name=["']viewport["']\s+content=["']([^"']*)["']\s*\/?>/i, (m, content) => {
    if (/viewport-fit\s*=\s*cover/i.test(content)) return m;
    return `<meta name="viewport" content="${content.trim().replace(/,\s*$/, '')}, viewport-fit=cover">`;
  });
  // 2) CSS + puente nativo (idempotente)
  if (!out.includes('native-ios-bridge.js')) {
    const tags = '<link rel="stylesheet" href="./native-ios.css">\n<script src="./native-ios-bridge.js" defer></script>\n';
    if (!/<\/head>/i.test(out)) throw new Error('index.html sin </head>: no puedo inyectar el puente nativo');
    out = out.replace(/<\/head>/i, tags + '</head>');
  }
  return out;
}

function copiarArbol(src, dst) {
  let n = 0;
  for (const name of readdirSync(src)) {
    const abs = join(src, name);
    const rel = relative(ROOT, abs);
    if (!incluir(rel)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) {
      n += copiarArbol(abs, join(dst, name));
    } else if (st.isFile()) {
      mkdirSync(dst, { recursive: true });
      cpSync(abs, join(dst, name));
      n += 1;
    }
  }
  return n;
}

export function sync() {
  if (!existsSync(join(ROOT, 'index.html'))) throw new Error('No encuentro index.html en la raíz: ' + ROOT);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const n = copiarArbol(ROOT, OUT);
  for (const f of ['native-ios-bridge.js', 'native-ios.css']) cpSync(join(MOBILE, 'bridge', f), join(OUT, f));
  const idx = join(OUT, 'index.html');
  writeFileSync(idx, prepararHtml(readFileSync(idx, 'utf8')));
  // Marca de build (útil para soporte): qué commit de la web va dentro del .ipa
  const build = { generado: new Date().toISOString(), commit: process.env.GITHUB_SHA || null };
  writeFileSync(join(OUT, 'native-build.json'), JSON.stringify(build, null, 2) + '\n');
  return { archivos: n + 3, out: OUT };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = sync();
  console.log(`sync-web: ${r.archivos} archivos → ${relative(process.cwd(), r.out) || r.out}`);
}
