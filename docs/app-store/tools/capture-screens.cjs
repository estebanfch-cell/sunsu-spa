/* Sunsu Spa · capturas App Store (100% datos sintéticos, modo ?preview=1 de la web, sin llamadas a la API real).
 * Uso: (1) en la raíz del repo: python3 -m http.server 8124 --bind 127.0.0.1
 *      (2) npm i playwright && node docs/app-store/tools/capture-screens.cjs && node docs/app-store/tools/frame-screens.cjs /tmp/appstore_out
 *      (3) convertir a RGB sin alfa (PIL) y copiar a docs/app-store/screenshots/iphone-6.9/ (1320x2868). */
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/tmp/appstore_raw';
fs.mkdirSync(OUT, { recursive: true });
const W = 402, H = 874 - 54; // iPhone 16 Pro: pantalla útil bajo la barra de estado
const INIT = () => {
  sessionStorage.setItem('sunsu.beta.avisoPin', '1');
  const MAP = [["Andrea Robles","Valeria Ríos"],["Daniela Mora","Camila Ordóñez"],["Dejaneira Espinoza","Sofía Paredes"],["Alejandra Rodriguez","Isabel Vega"],["Alejandra Rodríguez","Isabel Vega"],["Evelyn Toapanta","Paula Mena"],
    ["Andrea","Valeria"],["Daniela","Camila"],["Dejaneira","Sofía"],["Alejandra","Isabel"],["Evelyn","Paula"],["Emilia","Admin"],["Emi","Admin"]];
  const swap = (s) => { let o = String(s); for (const [a, b] of MAP) o = o.replace(new RegExp('\\b' + a + '\\b', 'g'), b); return o; };
  window.__swap = swap;
  const CLIENTAS = [
    ["Mariana", "Cevallos"], ["Gabriela", "Vinueza"], ["Daniela", "Arteaga"], ["Paula", "Granda"], ["Renata", "Íñiguez"], ["Josefina", "Albornoz"],
    ["Antonella", "Moscoso"], ["Carolina", "Benalcázar"], ["Valentina", "Cordero"], ["Emilia", "Zambrano"], ["Martina", "Escobar"], ["Fernanda", "Lasso"],
  ].map(([n, a]) => [n === "Daniela" ? "Victoria" : n === "Emilia" ? "Amelia" : n, a]);
  window.__CLIENTAS = CLIENTAS;
  const hoy = '2026-11-19';
  const tickets = () => {
    const quien = ["Valeria Ríos", "Camila Ordóñez", "Isabel Vega", "Valeria Ríos", "Camila Ordóñez", "Isabel Vega", "Valeria Ríos", "Camila Ordóñez"];
    const res = [{ faciales: 1, productos: 2 }, { paquetes: 1 }, { faciales: 1, extras: 1 }, { canjes: 1 }, { faciales: 1, productos: 1 }, { productos: 3 }, { faciales: 2 }, { gifts: 1 }];
    const tot = [96.6, 276, 48.3, 0, 71.3, 112.7, 92, 50];
    return CLIENTAS.slice(0, 8).map((c, i) => ({
      so_num: 'TK-' + (2041 - i), sheetRow: 9000 + i, tkRow: 9000 + i, clave: 'demo' + i, nombre: c[0], apellido: c[1], fecha: i < 5 ? hoy : '2026-11-18', hora: '1' + (i % 8) + ':30',
      estimado: String(tot[i]), creado_por: quien[i], cosmetologa: quien[i], resumen: res[i], estado_doc: i === 2 || i === 4 ? 'abierto' : 'cerrado', fac: true, cob: i !== 2 && i !== 4,
      factura: tot[i] ? '001-001-00000' + (4120 - i) : '', sin_cobro: !tot[i], saldo: i === 2 || i === 4 ? tot[i] : 0,
    }));
  };
  const clientes = () => CLIENTAS.map((c, i) => ({
    key: 'k' + i, nombre: c[0] + ' ' + c[1], codigo: 'C-' + String(1200 + i * 7), visitas: [14, 9, 6, 11, 3, 8, 5, 2, 7, 12, 4, 1][i], ultima: ['2026-11-19', '2026-11-18', '2026-11-15', '2026-11-12', '2026-11-08', '2026-11-03', '2026-10-30', '2026-10-21', '2026-10-17', '2026-10-09', '2026-09-28', '2026-09-14'][i],
    total: [1260, 845, 410, 990, 180, 640, 325, 96, 515, 1120, 240, 48][i], paquetesActivos: [1, 0, 1, 2, 0, 1, 0, 0, 1, 1, 0, 0][i], giftSaldo: i === 3 ? 25 : 0,
    cosmetologa: ["Valeria Ríos", "Camila Ordóñez"][i % 2], sector: ["Cumbayá", "Tumbaco", "Quito"][i % 3],
  }));
  const wrap = () => {
    const orig = window.previewApi;
    if (!orig || orig.__w) return;
    const w = function (a, body) {
      if (a === 'tk_historial') { const it = tickets(); return { ok: true, items: it, total: it.length, suma: it.reduce((x, t) => x + Number(t.estimado), 0), hayMas: false }; }
      if (a === 'cl_list') return { ok: true, clientes: clientes(), admin: true, puedeDescargar: false, cosmetologas: ["Valeria Ríos", "Camila Ordóñez"], sectores: ["Cumbayá", "Tumbaco", "Quito"] };
      let r = orig.apply(this, arguments);
      try { r = JSON.parse(swap(JSON.stringify(r))); } catch (e) {}
      return r;
    };
    w.__w = true;
    window.previewApi = w;
  };
  try { Object.defineProperty(window, '__hook', { value: setInterval(wrap, 5) }); } catch (e) {}
  document.addEventListener('DOMContentLoaded', wrap);
};
const SCRUB = () => {
  const swap = window.__swap;
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = tw.nextNode())) { const v = swap(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
  document.querySelectorAll('input, option, [title], [aria-label]').forEach((el) => {
    if (el.value) el.value = swap(el.value);
    if (el.title) el.title = swap(el.title);
    const al = el.getAttribute('aria-label'); if (al) el.setAttribute('aria-label', swap(al));
  });
  const txt = document.body.innerText;
  return { vendido: /vendido/i.test(txt), real: ["Andrea", "Daniela Mora", "Dejaneira", "Alejandra", "Emilia", "Evelyn"].filter((x) => txt.includes(x)) };
};
const CSS = `
  html{ }
  .tabbar{ height: calc(var(--tab-h) + 34px) !important; padding-bottom: 34px !important; }
  :root{ --tab-clear: calc(118px + 34px) !important; }
  .toast{ display:none !important; }
  #sunsu-nueva-ver{ display:none !important; }
  ::-webkit-scrollbar{ display:none; }
`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'es-EC', timezoneId: 'America/Guayaquil',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message));
  const net = [];
  p.on('request', (r) => { if (/supabase\.co/.test(r.url())) net.push(r.url()); });
  const plan = (process.argv[2] || 'login,inicio,tickets,clientes,comisiones').split(',');
  // 1) login (sin preview, pantalla real de entrada)
  if (plan.includes('login')) {
    await p.goto('http://localhost:8124/', { waitUntil: 'load' });
    await p.waitForSelector('#login-form');
    await p.addStyleTag({ content: CSS });
    await p.evaluate(() => { document.activeElement && document.activeElement.blur(); });
    await p.waitForTimeout(600);
    await p.screenshot({ path: OUT + '/login.png' });
    console.log('login', JSON.stringify(await p.evaluate(SCRUB)));
  }
  await p.goto('http://localhost:8124/?preview=1', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  if (await p.$('#login-form')) { await p.fill('#pin', '1234'); await p.click('#login-btn'); await p.waitForTimeout(2500); }
  const rutas = { inicio: '#/m/inicio', tickets: '#/m/tickets', clientes: '#/m/clientes', comisiones: '#/m/comisiones' };
  for (const k of plan.filter((x) => rutas[x])) {
    await p.evaluate((h) => { location.hash = h; }, rutas[k]);
    await p.waitForTimeout(2600);
    await p.addStyleTag({ content: CSS });
    await p.evaluate(() => { const m = document.getElementById('aviso-pin-modal'); if (m) m.remove(); const b = document.getElementById('aviso-pin-5d'); if (b) b.remove(); window.scrollTo(0, 0); document.activeElement && document.activeElement.blur(); });
    if (k === 'inicio') await p.evaluate(() => { document.querySelectorAll('.card, .dash-card, section, div').forEach((el) => { const t = (el.firstElementChild && el.firstElementChild.innerText) || ''; if (/^UTILIDAD/i.test(t.trim()) && el.offsetHeight < 600) el.remove(); }); });
    await p.waitForTimeout(700);
    if (k === 'comisiones') { for (const t of ['Faciales', 'Paquetes', 'Productos']) { const el = await p.$('text=' + t); if (el) { await el.click().catch(() => {}); await p.waitForTimeout(250); } } }
    if (k === 'comisiones') await p.evaluate(() => {
      const all = [...document.querySelectorAll('main *, .content *')];
      const hit = all.filter((el) => /Editar tarifas|Hasta el ciclo que cierra/.test(el.innerText || '') && el.offsetHeight < 400);
      const top = hit.filter((el) => !hit.some((o) => o !== el && o.contains(el) === false && el.contains(o) === false ? false : o !== el && o.contains(el)));
      (top.length ? top : hit).forEach((el) => el.remove());
    });
    const s = await p.evaluate(SCRUB);
    await p.screenshot({ path: OUT + '/' + k + '.png' });
    console.log(k, JSON.stringify(s));
  }
  console.log('NET', net.length);
  await b.close();
})();
