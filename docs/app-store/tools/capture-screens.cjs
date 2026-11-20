/* Sunsu Spa · capturas App Store (100% datos sintéticos, modo ?preview=1 de la web, sin llamadas a la API real).
 * Uso: (1) en la raíz del repo: python3 -m http.server 8124 --bind 127.0.0.1
 *      (2) npm i playwright && node docs/app-store/tools/capture-screens.cjs && node docs/app-store/tools/frame-screens.cjs /tmp/appstore_out
 *      (3) convertir a RGB sin alfa (PIL) y copiar a docs/app-store/screenshots/iphone-6.9/ (1320x2868).
 * Pantallas: login, inventario de faciales (sin costos), carta de tratamientos (solo PVP),
 * ficha de clienta con carpetas de documentos, agenda del día. Sin márgenes, ingresos, comisiones ni totales de venta. */
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/tmp/appstore_raw';
fs.mkdirSync(OUT, { recursive: true });
const W = 402, H = 874 - 54; // iPhone 16 Pro: pantalla útil bajo la barra de estado
const INIT = () => {
  sessionStorage.setItem('sunsu.beta.avisoPin', '1');
  try { localStorage.setItem('sunsu.agenda.vista', 'lista'); } catch (e) {}
  const MAP = [["Andrea Robles","Valeria Ríos"],["Daniela Mora","Camila Ordóñez"],["Dejaneira Espinoza","Sofía Paredes"],["Alejandra Rodriguez","Isabel Vega"],["Alejandra Rodríguez","Isabel Vega"],["Evelyn Toapanta","Paula Mena"],
    ["Andrea","Valeria"],["Daniela","Camila"],["Dejaneira","Sofía"],["Alejandra","Isabel"],["Evelyn","Paula"],["Emilia","Admin"],["Emi","Admin"]];
  const swap = (s) => { let o = String(s); for (const [a, b] of MAP) o = o.replace(new RegExp('\\b' + a + '\\b', 'g'), b); return o; };
  window.__swap = swap;
  const CLIENTAS = [
    ["Mariana", "Cevallos"], ["Gabriela", "Vinueza"], ["Daniela", "Arteaga"], ["Paula", "Granda"], ["Renata", "Íñiguez"], ["Josefina", "Albornoz"],
    ["Antonella", "Moscoso"], ["Carolina", "Benalcázar"], ["Valentina", "Cordero"], ["Emilia", "Zambrano"], ["Martina", "Escobar"], ["Fernanda", "Lasso"],
  ].map(([n, a]) => [n === "Daniela" ? "Victoria" : n === "Emilia" ? "Amelia" : n, a]);
  window.__CLIENTAS = CLIENTAS;
  /* Faciales activos y PVP real (2026-11-20), de public.catalogo.total_con_iva
   * (= erp_productos.precio_venta; beta_pvp es null). Solo tipo FACIAL / FACIAL ESPECIAL y activo=true.
   * Nombres en mayúsculas iniciales para la carta; el de SUNSU-01 se muestra «Purificación»
   * (en catálogo está escrito PURUFICACIÓN). */
  const FACIALES = [
    { id: "s1", sku: "01", nombre: "Facial Purificación S.O.S", pvp: 75, minutos: 60, categoria: "Facial" },
    { id: "s2", sku: "02", nombre: "Facial Reparación", pvp: 65, minutos: 75, categoria: "Facial" },
    { id: "s3", sku: "03", nombre: "Facial 7 Pieles (Arroz+H2O)", pvp: 65, minutos: 60, categoria: "Facial" },
    { id: "s4", sku: "04", nombre: "Facial Gold-Aging", pvp: 65, minutos: 60, categoria: "Facial" },
    { id: "s5", sku: "05", nombre: "Facial Porcelana", pvp: 65, minutos: 60, categoria: "Facial" },
    { id: "s6", sku: "40", nombre: "Facial Reset 3x1", pvp: 95, minutos: 60, categoria: "Facial especial" },
    { id: "s10", sku: "57", nombre: "Facial K-Lift", pvp: 95, minutos: 90, categoria: "Facial especial" },
    { id: "s7", sku: "42", nombre: "Facial Peeling Marino de Perla", pvp: 145, minutos: 75, categoria: "Facial especial" },
    { id: "s8", sku: "43", nombre: "Facial de Geisha", pvp: 145, minutos: 75, categoria: "Facial especial" },
    { id: "s9", sku: "52", nombre: "Facial de Ginseng (Facial capilar)", pvp: 95, minutos: 60, categoria: "Facial especial" },
  ];
  window.__FACIALES = FACIALES;
  const hoy = '2026-11-20';
  const clientes = () => CLIENTAS.map((c, i) => ({
    key: 'k' + i, nombre: c[0] + ' ' + c[1], codigo: 'C-' + String(1200 + i * 7), visitas: [14, 9, 6, 11, 3, 8, 5, 2, 7, 12, 4, 1][i], ultima: ['2026-11-19', '2026-11-18', '2026-11-15', '2026-11-12', '2026-11-08', '2026-11-03', '2026-10-30', '2026-10-21', '2026-10-17', '2026-10-09', '2026-09-28', '2026-09-14'][i],
    total: 0, paquetesActivos: [1, 0, 1, 2, 0, 1, 0, 0, 1, 1, 0, 0][i], giftSaldo: 0,
    cosmetologa: ["Valeria Ríos", "Camila Ordóñez"][i % 2], sector: ["Cumbayá", "Tumbaco", "Quito"][i % 3],
  }));
  const ficha = (key) => {
    const k = String(key || 'k0');
    const idx = Math.max(0, CLIENTAS.findIndex((_, i) => k === ('k' + i)));
    const c = CLIENTAS[idx] || CLIENTAS[0];
    return {
      ok: true, admin: false, key: k, codigo: 'C-' + String(1200 + idx * 7),
      datos: { nombres: c[0], apellido: c[1], cedula: '', telefono: '', tipoPiel: 'Mixta', alergias: 'Ninguna', sector: 'Cumbayá' },
      campos: [['tipoPiel', 'Tipo de piel'], ['alergias', 'Alergias'], ['sector', 'Sector']],
      lectura: [], corregidos: [], puedeEditar: false, puedePedir: false, borrado: false,
      historial: [
        { fecha: '2026-11-12', hora: '11:20', ref: 'TK-2041', clave: 'demo-h1', cosmetologa: 'Valeria Ríos', facial: 'Facial S.O.S', detalle: [{ nombre: 'Facial S.O.S', cantidad: 1 }] },
        { fecha: '2026-10-28', hora: '16:00', ref: 'TK-2030', clave: 'demo-h2', cosmetologa: 'Camila Ordóñez', facial: 'K-Lift', detalle: [{ nombre: 'K-Lift', cantidad: 1 }] },
        { fecha: '2026-10-15', hora: '10:00', ref: 'TK-2018', clave: 'demo-h3', cosmetologa: 'Valeria Ríos', facial: 'Facial Reparación', detalle: [{ nombre: 'Facial Reparación', cantidad: 1 }] },
      ],
      paquetes: [{ id: 'pq1', codigo: 'PQ-0104', nombre: 'Facial Reparación x3', usados: 1, pendientes: 2, total: 3, usos: [{ slot: 1, usado: true, fecha: '2026-10-15' }, { slot: 2, usado: false, fecha: '' }, { slot: 3, usado: false, fecha: '' }] }],
      giftcards: [],
      documentos: [
        { tipo: 'pdf', sub: 'skin_analisis', nombre: 'Focus Skin Analysis.pdf', fecha: '2026-11-12', hora: '11:20', docId: 'd1' },
        { tipo: 'pdf', sub: 'skin_analisis', nombre: 'Focus Skin Analysis.pdf', fecha: '2026-10-15', hora: '10:05', docId: 'd2' },
        { tipo: 'pdf', sub: 'klift', nombre: 'K-Lift · simetría.pdf', fecha: '2026-10-28', hora: '16:10', docId: 'd3' },
        { tipo: 'pdf', nombre: 'Control de paquete Facial Reparación.pdf', fecha: '2026-10-15', hora: '10:10', docId: 'd4' },
      ],
      bitacora: [],
      resumen: { tickets: 3, ultima: '2026-11-12', primera: '2026-10-15', sesionesPendientes: 2, total: 0, promedio: 0, registros: 1 },
    };
  };
  const citasHoy = () => {
    const rows = [
      ['a1', '09:00', 'Amelia', 'Zambrano', 'Facial Porcelana', 'cal1', 60, '', 1, 0],
      ['a2', '10:30', 'Gabriela', 'Vinueza', 'Facial Purificación S.O.S', 'cal2', 75, 'CONFIRMADA', 0, 0],
      ['a3', '12:00', 'Victoria', 'Arteaga', 'Facial 7 Pieles (Arroz+H2O)', 'cal1', 60, 'CONFIRMADA', 0, 0],
      ['a4', '14:00', 'Paula', 'Granda', 'Facial K-Lift', 'cal3', 90, '', 0, 1],
      ['a5', '16:00', 'Renata', 'Íñiguez', 'Facial Reparación', 'cal2', 75, 'CONFIRMADA', 0, 0],
      ['a6', '17:30', 'Josefina', 'Albornoz', 'Facial Reset 3x1', 'cal1', 60, '', 0, 1],
    ];
    const cals = { cal1: 'Valeria Ríos', cal2: 'Camila Ordóñez', cal3: 'Isabel Vega' };
    return rows.map((r) => ({
      id: r[0], fecha: hoy, datetime: hoy + 'T' + r[1] + ':00-05:00',
      nombre: r[2], apellido: r[3], tipo: r[4], calendarID: r[5], calendario: cals[r[5]],
      duracion: r[6], etiqueta: r[7], atendida: !!r[8], nueva: !!r[9], ticket: r[8] ? 'TK-2039' : '',
    }));
  };
  const wrap = () => {
    const orig = window.previewApi;
    if (!orig || orig.__w) return;
    const w = function (a, body) {
      body = body || {};
      if (a === 'prod_list') {
        return { ok: true, items: FACIALES.map((f) => ({ id: f.id, sku: f.sku, nombre: f.nombre, uso: f.categoria, categoria: f.categoria, marca: 'Sunsu' })) };
      }
      if (a === 'mcprod_list') {
        const cats = [...new Set(FACIALES.map((f) => f.categoria))];
        return {
          ok: true, admin: false, verCostos: false, puedeDescargar: false, eliminados: 0,
          filtros: { marcas: [], categorias: cats },
          items: FACIALES.map((f) => ({
            id: f.id, sku: f.sku, skuVisible: f.sku, nombre: f.nombre,
            tipo: 'servicio', subtipo: f.categoria, categoria: f.categoria, marca: 'Sunsu',
            pvp: f.pvp, activo: true,
          })),
        };
      }
      if (a === 'proto_list') {
        return { ok: true, verCostos: false, items: FACIALES.map((f) => ({ id: f.id, sku: 'SUNSU-' + f.sku, nombre: f.nombre, vigente: true, pasos: new Array(4), productos: 4, minutos: f.minutos, version: 1 })) };
      }
      if (a === 'cl_list') return { ok: true, clientes: clientes(), admin: false, puedeDescargar: false, cosmetologas: ['Valeria Ríos', 'Camila Ordóñez'], sectores: ['Cumbayá', 'Tumbaco', 'Quito'] };
      if (a === 'cl_get' || a === 'cliente_detalle') return ficha(body.key);
      if (a === 'ag_meta') {
        return {
          ok: true, hoy,
          calendarios: [
            { id: 'cal1', nombre: 'Valeria Ríos', persona: 'Valeria Ríos' },
            { id: 'cal2', nombre: 'Camila Ordóñez', persona: 'Camila Ordóñez' },
            { id: 'cal3', nombre: 'Isabel Vega', persona: 'Isabel Vega' },
          ],
          etiquetas: [{ nombre: 'CONFIRMADA', color: 'green' }, { nombre: 'NO LLEGO', color: 'red' }],
          puede: { mover: false, agendar: false, crear: false },
        };
      }
      if (a === 'ag_citas') {
        let L = citasHoy();
        if (body.calendarID) L = L.filter((c) => String(c.calendarID) === String(body.calendarID));
        return { ok: true, citas: L, porDia: { [hoy]: L.length } };
      }
      if (a === 'tk_historial') return { ok: true, items: [], total: 0, suma: 0, hayMas: false };
      let r = orig.apply(this, arguments);
      try { r = JSON.parse(swap(JSON.stringify(r))); } catch (e) {}
      if (a === 'whoami' || a === 'login' || a === 'login_pass') {
        r = r || {};
        r.ver_costos = false;
        const mods = r.modulos || [];
        if (!mods.some((m) => (m.modulo || m) === 'agenda')) mods.push({ modulo: 'agenda', acceso: 'todos' });
        r.modulos = mods;
      }
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
  const txt = document.body.innerText || '';
  const money = (txt.match(/\$[\s]*[0-9]+([.,][0-9]+)?/g) || []);
  const real = ["Andrea", "Daniela Mora", "Dejaneira", "Alejandra", "Emilia", "Evelyn"].filter((x) => txt.includes(x));
  const sensitive = ["margen", "comisi", "utilidad", "venta sin iva", "total gastado", "ticket promedio", "costo", "compra", "ingreso", "cedula", "cédula"].filter((x) => txt.toLowerCase().includes(x));
  return { money, real, sensitive, vendido: /vendido/i.test(txt) };
};
const CSS = `
  html{ }
  .tabbar{ height: calc(var(--tab-h) + 34px) !important; padding-bottom: 34px !important; }
  :root{ --tab-clear: calc(118px + 34px) !important; }
  .toast{ display:none !important; }
  #sunsu-nueva-ver{ display:none !important; }
  ::-webkit-scrollbar{ display:none; }
  /* Inventario: sin stock, marca ni costos; se ven nombre, código y categoría de faciales. */
  #inv-root .desk-table th:nth-child(1), #inv-root .desk-table td:nth-child(1),
  #inv-root .desk-table th:nth-child(6), #inv-root .desk-table td:nth-child(6),
  #inv-root .desk-table th:nth-child(7), #inv-root .desk-table td:nth-child(7) { display:none !important; }
  #inv-root .desk-bar .btn, #inv-root [data-go="#/m/inventario/nuevo"] { display:none !important; }
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
  const plan = (process.argv[2] || 'login,inventario,catalogo,ficha,agenda').split(',');

  const ready = async () => {
    await p.addStyleTag({ content: CSS });
    await p.evaluate(() => {
      const m = document.getElementById('aviso-pin-modal'); if (m) m.remove();
      const b = document.getElementById('aviso-pin-5d'); if (b) b.remove();
      window.scrollTo(0, 0);
      document.activeElement && document.activeElement.blur();
    });
  };

  if (plan.includes('login')) {
    await p.goto('http://127.0.0.1:8124/', { waitUntil: 'load' });
    await p.waitForSelector('#login-form');
    await p.addStyleTag({ content: CSS });
    await p.evaluate(() => { document.activeElement && document.activeElement.blur(); });
    await p.waitForTimeout(600);
    const s = await p.evaluate(SCRUB);
    await p.screenshot({ path: OUT + '/login.png' });
    console.log('login', JSON.stringify(s));
  }

  await p.goto('http://127.0.0.1:8124/?preview=1', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  if (await p.$('#login-form')) { await p.fill('#pin', '1234'); await p.click('#login-btn'); await p.waitForTimeout(2500); }

  const shots = {
    inventario: async () => {
      await p.evaluate(() => { location.hash = '#/m/inventario'; });
      await p.waitForTimeout(2600);
      await ready();
      await p.waitForSelector('#inv-root, #inv-body, .desk-table', { timeout: 8000 }).catch(() => {});
      await p.evaluate(() => {
        window._invSort = 'sku';
        window._invDir = 1;
        if (typeof pintarInventario === 'function') pintarInventario();
      });
      await p.waitForTimeout(700);
    },
    catalogo: async () => {
      await p.evaluate(() => { location.hash = '#/m/productos'; });
      await p.waitForTimeout(2800);
      await ready();
      await p.waitForSelector('.mcp, .mcp-card-row, .ss-card', { timeout: 8000 }).catch(() => {});
      await p.addStyleTag({ content: '.mcp-card-row,.ss-card.mcp-card-row{padding-top:7px!important;padding-bottom:7px!important;margin-bottom:6px!important}.ss-micro{margin:4px 0!important}' });
      await p.evaluate(() => {
        document.querySelectorAll('.mcp-cost-pill, #mcp-cost-pill, #mcp-cols-wrap, #mcp-nuevo').forEach((el) => el.remove());
      });
      await p.waitForTimeout(700);
    },
    ficha: async () => {
      await p.evaluate(() => { location.hash = '#/m/clientes/c/k0'; });
      await p.waitForTimeout(2800);
      await ready();
      await p.waitForSelector('#mccl-root, .mccl-h', { timeout: 8000 }).catch(() => {});
      const tab = await p.$('[data-tab="docs"]');
      if (tab) { await tab.click(); await p.waitForTimeout(600); }
      await p.evaluate(() => {
        document.querySelectorAll('.mccl-meta').forEach((el) => {
          el.innerHTML = el.innerHTML.replace(/\s*·\s*CI\s[^·<]*/gi, '').replace(/\s*·\s*☎\s[^·<]*/g, '');
        });
        const box = document.getElementById('mccl-regbox');
        if (box) {
          const title = box.previousElementSibling;
          if (title && /Datos de registro/i.test(title.textContent || '')) title.remove();
          box.remove();
        }
        document.querySelectorAll('#mccl-del, .mccl-del').forEach((el) => el.remove());
        document.querySelectorAll('.mccl-kpi').forEach((el) => {
          const t = (el.innerText || '').toLowerCase();
          if (/total|gastado|promedio|\$/.test(t)) el.remove();
        });
      });
      await p.waitForTimeout(500);
    },
    agenda: async () => {
      await p.evaluate(() => {
        try { localStorage.setItem('sunsu.agenda.vista', 'lista'); } catch (e) {}
        if (window.state) { window.state.acceso = window.state.acceso || {}; window.state.acceso.agenda = 'todos'; }
        location.hash = '#/m/agenda';
      });
      await p.waitForTimeout(2800);
      await ready();
      await p.waitForSelector('.mcag-list, .mcag-c, .mcag-bar', { timeout: 8000 }).catch(() => {});
      await p.evaluate(() => {
        document.querySelectorAll('[data-crear], [data-tk], [data-etq], [data-mover], [data-cancel], #mcag-nueva').forEach((el) => el.remove());
      });
      await p.waitForTimeout(600);
    },
  };

  for (const k of plan) {
    if (!shots[k]) continue;
    await shots[k]();
    const s = await p.evaluate(SCRUB);
    await p.screenshot({ path: OUT + '/' + k + '.png' });
    console.log(k, JSON.stringify(s));
  }
  console.log('NET', net.length);
  await b.close();
})();
