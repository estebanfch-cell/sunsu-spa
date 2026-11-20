/* Sunsu Spa · capturas App Store de la pantalla de inicio (01-login) y de la app de la clienta (06-mi-cuenta).
 * 100% datos ficticios: la API se simula con page.route (no se llama a Supabase).
 * Uso: (1) en la raíz del repo: python3 -m http.server 8124 --bind 127.0.0.1
 *      (2) PORT=8124 node docs/app-store/tools/capture-portal.cjs && node docs/app-store/tools/frame-screens.cjs /tmp/appstore_out
 *      (3) convertir a RGB sin alfa (PIL) y copiar a docs/app-store/screenshots/iphone-6.9/ (1320x2868). */
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.env.OUT || '/tmp/appstore_raw';
fs.mkdirSync(OUT, { recursive: true });
const W = 402, H = 874 - 54;
const hoy = '2026-11-20';
const CLI = {
  ok: true, codigo: 'C-01842',
  perfil: { nombres: 'Mariana', apellido: 'Cevallos', cedula: '17•••••• 32', telefono: '099 123 4567', email: 'mariana.demo@example.com', nacimiento: '1991-04-12', sector: 'Cumbayá', tipoPiel: 'Mixta' },
  campos: [['nombres','Nombres'],['apellido','Apellidos'],['telefono','Teléfono'],['email','Correo'],['nacimiento','Fecha de nacimiento'],['sector','Sector'],['tipoPiel','Tipo de piel'],['alergias','Alergias'],['medicacion','Medicación'],['condiciones','Condiciones'],['preferencias','Preferencias'],['notaClienta','Nota para Sunsu']],
  historial: [
    { fecha: '2026-11-06', hora: '11:20', facial: 'Facial Reparación', cosmetologa: 'Valeria', paquete: true, productos: [{ nombre: 'Sérum Ginseng', cantidad: 1 }] },
    { fecha: '2026-10-09', hora: '16:00', facial: 'K-Lift', cosmetologa: 'Camila', paquete: false, productos: [] },
    { fecha: '2026-09-11', hora: '10:00', facial: 'Facial Reparación', cosmetologa: 'Valeria', paquete: true, productos: [{ nombre: 'Sérum Ginseng', cantidad: 1 }] },
    { fecha: '2026-08-14', hora: '10:30', facial: 'Facial Glow', cosmetologa: 'Valeria', paquete: false, productos: [] },
  ],
  documentos: [
    { carpeta: 'skin', nombre: 'Focus Skin Analysis.pdf', fecha: '2026-11-06', docId: 'd1' },
    { carpeta: 'klift', nombre: 'K-Lift · simetría.pdf', fecha: '2026-10-09', docId: 'd2' },
    { carpeta: 'tratamientos', nombre: 'Control de paquete Facial Reparación.pdf', fecha: '2026-11-06', docId: 'd3' },
  ],
  paquetes: [{ nombre: 'Facial Reparación x3', total: 3, usados: 2, pendientes: 1, estado: 'activo', compra: '2026-09-11', usos: ['2026-09-11', '2026-11-06'] }],
  giftcards: [{ codigo: 'GC-0458', valor: 'Facial Glow', saldo: null, usado: false, fecha: '2026-10-20', comprador: 'Mariana Cevallos', docId: '' }],
  favoritos: { visitas: 4, primera: '2026-08-14', ultima: '2026-11-06', cadaDias: 28, facial: { nombre: 'Facial Reparación', veces: 2 }, faciales: [{ nombre: 'Facial Reparación', veces: 2 }, { nombre: 'K-Lift', veces: 1 }], producto: { sku: 'GS-01', nombre: 'Sérum Ginseng', unidades: 2, veces: 2, pvp: 48, foto: '' }, productos: [] },
  recomendacion: { fecha: '2026-12-04', tratamiento: 'Facial Reparación', cosmetologa: 'Valeria', desde: '2026-11-06' },
  config: { acuity_url: 'https://app.acuityscheduling.com/schedule.php?owner=35065947', whatsapp: '' },
};
const MOCK = {
  portal_config: { ok: true, config: CLI.config, correo: false },
  portal_me: { ok: true, cuenta: { tipo: 'cliente', nombre: 'Mariana Cevallos', email: 'mariana.demo@example.com', estado: 'activa', codigo: 'C-01842', creada: '2026-11-20' } },
  portal_cliente: CLI,
  portal_ag_meta: { ok: true, nativo: true, hoy, url: CLI.config.acuity_url, citas: [], calendarios: [{ id: 1, nombre: 'Valeria' }, { id: 2, nombre: 'Camila' }],
    tipos: [{ id: 11, nombre: 'Facial Reparación', duracion: 75, precio: '80.00', categoria: 'Faciales', descripcion: '', calendarIDs: [1, 2] }, { id: 12, nombre: 'Facial Glow', duracion: 60, precio: '75.00', categoria: 'Faciales', descripcion: '', calendarIDs: [1, 2] }, { id: 13, nombre: 'K-Lift', duracion: 90, precio: '120.00', categoria: 'Faciales', descripcion: '', calendarIDs: [2] }] },
  portal_ag_fechas: { ok: true, fechas: ['2026-11-24', '2026-11-25', '2026-11-27', '2026-11-28', '2026-12-01', '2026-12-02', '2026-12-04'] },
  portal_ag_horas: { ok: true, horas: [{ time: '2026-12-04T10:00:00-0500', hora: '10:00' }, { time: '2026-12-04T11:30:00-0500', hora: '11:30' }, { time: '2026-12-04T15:00:00-0500', hora: '15:00' }] },
};
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'es-EC', timezoneId: 'America/Guayaquil',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
  await ctx.route(/supabase\.co\/functions/, async (route) => {
    let a = ''; try { a = JSON.parse(route.request().postData() || '{}').accion; } catch (e) {}
    const body = MOCK[a] || { error: 'mock: ' + a };
    if (!MOCK[a]) console.log('NOMOCK', a);
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  const CSS = '.toast{display:none!important}#sunsu-nueva-ver{display:none!important}::-webkit-scrollbar{display:none}';
  await p.goto('http://127.0.0.1:' + (process.env.PORT || 8124) + '/', { waitUntil: 'load' });
  await p.waitForSelector('#pt-u', { timeout: 10000 });
  await p.addStyleTag({ content: CSS }); await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/login.png' }); console.log('login');
  await p.click('#pt-crear'); await p.waitForTimeout(600); await p.screenshot({ path: OUT + '/crear.png', fullPage: true }); console.log('crear');
  await p.evaluate(() => { localStorage.setItem('sunsu.portal.token', 'pt_demo'); location.hash = ''; location.reload(); });
  await p.waitForTimeout(2500); await p.addStyleTag({ content: CSS }); await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/portal.png' }); console.log('portal');
  await p.screenshot({ path: OUT + '/portal_full.png', fullPage: true });
  await p.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/Agendar ahora/.test(x.textContent)); b && b.click(); });
  await p.waitForTimeout(1500); await p.screenshot({ path: OUT + '/agendar_pre.png', fullPage: true }); console.log('agendar_pre');
  await p.evaluate(() => { const b=[...document.querySelectorAll('.pt-cal button:not([disabled])')].find(x=>x.textContent.trim()==='4'); b && b.click(); });
  await p.waitForTimeout(1200); await p.screenshot({ path: OUT + '/agendar_horas.png', fullPage: true }); console.log('agendar_horas');
  for (const t of ['historial', 'docs', 'perfil']) {
    const ok = await p.evaluate((t) => { const b = document.querySelector('.pt-tabs [data-tab="' + t + '"]'); if (b) { b.click(); return true; } return false; }, t);
    await p.waitForTimeout(1200); await p.screenshot({ path: OUT + '/' + t + '.png', fullPage: true }); console.log(t, ok);
  }
  await b.close();
})();
