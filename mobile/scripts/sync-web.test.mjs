import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { incluir, prepararHtml } from './sync-web.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('prepararHtml agrega viewport-fit=cover y el puente nativo una sola vez', () => {
  const src = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';
  const a = prepararHtml(src);
  assert.match(a, /content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.equal((a.match(/native-ios-bridge\.js/g) || []).length, 1);
  assert.equal(prepararHtml(a), a, 'idempotente');
});

test('incluir deja fuera backend, docs, tests y el propio proyecto móvil', () => {
  for (const r of ['index.html', 'mc-tickets.js', 'assets/sunsu-logo-celeste.png', 'privacy.html', 'support.html', 'productos/INV-001.jpg']) assert.ok(incluir(r), r);
  for (const r of ['supabase/functions/api/index.ts', 'mobile/www/index.html', 'docs/BETA.md', '.git/HEAD', 'package.json', 'CNAME', 'sw.js', 'sunsu_script_completo.js', 'x.test.ts', 'migrations/a.sql']) assert.ok(!incluir(r), r);
});

test('sync() copia la web real a una carpeta y no toca la raíz', async () => {
  const out = mkdtempSync(join(tmpdir(), 'sunsu-www-'));
  process.env.SUNSU_WWW_OUT = out;
  const raiz = readFileSync(join(here, '../../index.html'), 'utf8');
  const mod = await import('./sync-web.mjs?x=' + Date.now());
  const r = mod.sync();
  try {
    const idx = readFileSync(join(out, 'index.html'), 'utf8');
    assert.match(idx, /viewport-fit=cover/);
    assert.match(idx, /native-ios-bridge\.js/);
    assert.ok(existsSync(join(out, 'native-ios-bridge.js')));
    assert.ok(existsSync(join(out, 'assets/sunsu-logo-celeste.png')));
    assert.ok(!existsSync(join(out, 'supabase')));
    assert.ok(!existsSync(join(out, 'mobile')));
    assert.equal(readFileSync(join(here, '../../index.html'), 'utf8'), raiz, 'la raíz queda intacta');
    assert.ok(r.archivos > 50);
  } finally {
    rmSync(out, { recursive: true, force: true });
    delete process.env.SUNSU_WWW_OUT;
  }
});

function cargarPuente(win) {
  const code = readFileSync(join(here, '../bridge/native-ios-bridge.js'), 'utf8');
  vm.runInNewContext(code, win);
  return win;
}

test('el puente NO hace nada en el navegador / PWA', () => {
  const open = () => 'nativo';
  const win = { window: null, document: {}, navigator: {}, location: { href: 'https://app.sunsuspa.com/' } };
  win.window = win;
  win.open = open;
  cargarPuente(win);
  assert.equal(win.SunsuNative, undefined);
  assert.equal(win.open, open);
});

test('el puente NO se activa si Capacitor dice que no es nativo', () => {
  const open = () => 'nativo';
  const win = { document: {}, navigator: {}, location: {}, Capacitor: { isNativePlatform: () => false } };
  win.window = win;
  win.open = open;
  cargarPuente(win);
  assert.equal(win.SunsuNative, undefined);
  assert.equal(win.open, open);
});
