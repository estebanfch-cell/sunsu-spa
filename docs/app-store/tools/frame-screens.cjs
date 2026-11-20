/* Sunsu Spa · capturas App Store (100% datos sintéticos, modo ?preview=1 de la web, sin llamadas a la API real).
 * Uso: (1) en la raíz del repo: python3 -m http.server 8124 --bind 127.0.0.1
 *      (2) npm i playwright && node docs/app-store/tools/capture-screens.cjs && node docs/app-store/tools/frame-screens.cjs /tmp/appstore_out
 *      (3) convertir a RGB sin alfa (PIL) y copiar a docs/app-store/screenshots/iphone-6.9/ (1320x2868). */
const { chromium } = require('playwright');
const fs = require('fs');
const RAW = '/tmp/appstore_raw';
const OUT = process.argv[2] || '/tmp/appstore_out';
fs.mkdirSync(OUT, { recursive: true });
const logo = 'data:image/png;base64,' + fs.readFileSync(require('path').join(__dirname, '../../../assets/sunsu-logo-celeste.png')).toString('base64');
const SHOTS = [
  ['01-login', 'login', 'Tu spa, en tu iPhone', 'Acceso seguro con PIN o usuario para todo el equipo de Sunsu.', 'login'],
  ['02-dashboard', 'inicio', 'El día de un vistazo', 'Ventas, faciales, productos y paquetes con alertas al instante.', 'app'],
  ['03-tickets', 'tickets', 'Tickets y pagos', 'Cobra, adjunta comprobantes con la cámara y avisa por WhatsApp.', 'app'],
  ['04-clientes', 'clientes', 'Fichas de clientas', 'Historial, visitas, paquetes y documentos en un solo lugar.', 'app'],
  ['05-comisiones', 'comisiones', 'Comisiones claras', 'Cada cosmetóloga ve su ciclo y su detalle, sin hojas de cálculo.', 'app'],
];
const icons = (c) => `<svg width="66" height="13" viewBox="0 0 66 13" fill="${c}"><rect x="0" y="8" width="3" height="5" rx="1"/><rect x="5" y="5.5" width="3" height="7.5" rx="1"/><rect x="10" y="3" width="3" height="10" rx="1"/><rect x="15" y="0.5" width="3" height="12.5" rx="1"/>
<path d="M30.5 3.2a9.5 9.5 0 0 1 6.6 2.7l1.2-1.3a11.3 11.3 0 0 0-15.6 0l1.2 1.3a9.5 9.5 0 0 1 6.6-2.7zm0 3.6a5.9 5.9 0 0 1 4 1.6l1.2-1.3a7.7 7.7 0 0 0-10.4 0l1.2 1.3a5.9 5.9 0 0 1 4-1.6zm0 3.4 1.9 2-1.9 1.9-1.9-1.9z"/>
<rect x="42" y="1" width="21" height="11" rx="3" fill="none" stroke="${c}" stroke-opacity=".45"/><rect x="44" y="3" width="15" height="7" rx="1.5"/><rect x="64" y="4.5" width="1.6" height="4" rx=".8" fill-opacity=".45"/></svg>`;
const html = (img, title, sub, modo) => {
  const sbBg = modo === 'login' ? '#EEF3FA' : '#3D5A7A', sbFg = modo === 'login' ? '#1D2B3A' : '#FFFFFF';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:440px;height:956px;overflow:hidden}
  body{background:radial-gradient(120% 70% at 50% 0%, #FFFFFF 0%, #EEF3FA 45%, #F5F0E8 100%);font-family:"Inter","Noto Sans",sans-serif;color:#2E4560;position:relative}
  .logo{position:absolute;top:30px;left:50%;transform:translateX(-50%);height:40px}
  h1{position:absolute;top:88px;white-space:nowrap;left:28px;right:28px;text-align:center;font:800 33px/1.12 "Inter",sans-serif;letter-spacing:-.6px;color:#2E4560}
  p.sub{position:absolute;top:138px;left:44px;right:44px;text-align:center;font:500 15.5px/1.4 "Inter",sans-serif;color:#5B7FA6}
  .dev{position:absolute;top:226px;left:50%;transform:translateX(-50%);width:356px;height:750px;border-radius:58px;background:#1B1F26;padding:10px;
       box-shadow:0 30px 60px rgba(45,70,100,.28),0 8px 18px rgba(45,70,100,.18), inset 0 0 0 2px #3A404B}
  .scr{width:336px;height:730px;border-radius:48px;overflow:hidden;position:relative;background:#F5F0E8}
  .in{width:402px;height:874px;transform:scale(${336 / 402});transform-origin:0 0;position:absolute;top:0;left:0}
  .sb{height:54px;background:${sbBg};color:${sbFg};display:flex;align-items:center;justify-content:space-between;padding:0 30px 0 50px;font:600 17px "Inter",sans-serif}
  .di{position:absolute;top:11px;left:50%;transform:translateX(-50%);width:126px;height:37px;border-radius:20px;background:#000}
  .app{display:block;width:402px;height:820px}
  .hi{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:140px;height:5px;border-radius:3px;background:#1B1F26;opacity:.85}
  </style></head><body>
  <img class="logo" src="${logo}">
  <h1>${title}</h1><p class="sub">${sub}</p>
  <div class="dev"><div class="scr"><div class="in">
    <div class="sb"><span>9:41</span>${icons(sbFg)}</div>
    <div class="di"></div>
    <img class="app" src="data:image/png;base64,${fs.readFileSync(img).toString('base64')}">
    <div class="hi"></div>
  </div></div></div>
  </body></html>`;
};
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 })).newPage();
  for (const [name, raw, t, s, modo] of SHOTS) {
    const f = RAW + '/' + raw + '.png';
    if (!fs.existsSync(f)) { console.log('falta', f); continue; }
    await p.setContent(html(f, t, s, modo), { waitUntil: 'load' });
    await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + '/' + name + '.png', omitBackground: false });
    console.log(name);
  }
  await b.close();
})();
