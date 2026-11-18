// Menú lateral y botón «+» con la estructura de MineCore (MC_NAVCAT, build 703), limitado al
// alcance que fijó Emilia (prompts/mapa-modulos-sunsu.md). Script clásico: usa los globales de
// beta.html (state, acceso, api, esc, go, money, fail, lugaresVisibles).
// Lo que todavía no tiene pantalla abre «Próximamente»; nada se finge.
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v); }
  function adm() { return !!(state && state.admin); }
  function ac(mod) { return typeof acceso === "function" ? acceso(mod) : "no"; }
  function ok(mod) {
    if (mod === "*") return true;
    if (mod.indexOf("|") >= 0) return mod.split("|").some(ok);
    if (mod === "admin") return adm();
    if (mod === "ajuste") return adm() || (ac("inventario") === "todos" || ac("conteos") === "todos");
    if (mod === "ver_costos") return adm() || !!state.verCostos;
    return ac(mod) !== "no";
  }

  // Pantallas que aún no existen en la beta. Texto honesto de qué es y qué usar mientras tanto.
  var PRONTO = {
    asignado: ["Asignado a ti", "Conteos y tareas asignadas a tu usuario.", "#/m/conteos", "Conteos físicos"],
    pendientes: ["Órdenes pendientes", "Las OC enviadas que faltan por recibir, con lo que falta de cada línea.", "#/m/compras", "Órdenes de compra"],
    actas: ["Actas de recepción", "El listado de actas de todas las recepciones. Hoy el acta se abre desde cada orden de compra.", "#/m/compras", "Órdenes de compra"],
    pagos: ["Pagos a proveedores", "El listado de pagos y saldos por proveedor. Hoy el pago se registra dentro de cada orden de compra.", "#/m/compras", "Órdenes de compra"],
    rep_ventas: ["Reporte de ventas", "Ventas por producto, cosmetóloga y período.", "#/m/inicio", "Dashboard"],
    rep_stock: ["Niveles de stock", "Stock por bodega y sububicación, con valor.", "#/m/productos", "Productos"],
    rep_compras: ["Reporte de compras", "Compras por proveedor y producto.", "#/m/compras", "Órdenes de compra"],
    auditoria: ["Registro de auditoría", "Quién cambió qué y cuándo, en todos los módulos. Los cambios de la ficha de producto ya se ven en su pestaña Movimientos.", "", ""],
    consignacion: ["Consignación", "Lo que está en consignación, para que cada proveedor lo vea en su app. Las OC de consignación siguen en Compras.", "#/m/compras", "Órdenes de compra"],
    cobranza: ["Cobranza", "Saldos por cobrar de clientas.", "", ""],
    sri: ["Facturas SRI y retenciones", "Facturación electrónica y retenciones.", "", ""],
    edc: ["Estado de cuenta", "Estado de cuenta por clienta o proveedor.", "", ""],
    banco: ["Banco", "Movimientos y conciliación bancaria.", "", ""],
    aprobaciones: ["Aprobaciones", "Solicitudes que esperan aprobación. Hoy están en el botón «Solicitudes» de arriba.", "", ""],
    nuevo_protocolo: ["Nuevo protocolo", "Crear la receta de un facial: qué productos lleva, en qué cantidad y en qué paso. La lista de protocolos ya se puede ver en Protocolos.", "#/m/mc/protocolos", "Protocolos"],
  };

  // Grupos en el orden de MineCore. Ítem: [módulo que lo habilita, texto, ruta].
  function catalogo() {
    return [
      { id: "ventas", label: "Ventas", items: [
        ["tickets", "Tickets", "#/m/tickets"],
        ["cotizaciones_cliente", "Cotizaciones", "#/m/cotizaciones_cliente"],
        ["clientes", "Registro de clientas", "#/m/clientes"],
        // Agenda solo en Spa (Emilia 18/11: una sola Agenda).
      ] },
      { id: "protocolos", label: "Protocolos", items: [
        ["cabina", "Protocolos", "#/m/mc/protocolos"],
      ] },
      { id: "inventario", label: "Inventario", items: [
        ["productos", "Productos", "#/m/productos"],
        ["inventario", "Stock Venta", "#/m/inventario/venta"],
        ["inventario", "Stock Cabina", "#/m/inventario/cabina"],
        ["productos", "Códigos de barras", "#/m/barras"],
        // Reorden y Stock actual fuera del menú (Emilia 17/11); las rutas siguen existiendo.
        ["conteos", "Conteos físicos", "#/m/conteos"],
        ["transferencias", "Transferencias", "#/m/transferencias"],
        ["ajuste", "Ajustes de stock", "#/m/ajustes"],
        ["ver_costos", "Costo por facial", "#/m/aperturas/costo"],
        // Kardex, Locales y cabinas y Catálogo anterior fuera del menú (Emilia 17/11); el historial y los
        // movimientos están en la ficha de cada producto. Las rutas siguen existiendo.
      ] },
      { id: "compras", label: "Compras", items: [
        ["compras", "Órdenes de compra", "#/m/compras"],
        ["compras", "Cotizaciones de proveedor", "#/m/compras/cotizaciones"],
        ["recepciones", "Recepciones", "#/m/recepciones"],
        ["compras", "Consignación", "#/m/compras/consignacion"],
        ["proveedores", "Proveedores", "#/m/proveedores"],
        // Órdenes pendientes, Actas de recepción y Pagos a proveedores fuera (Emilia 17/11): los pagos van dentro de cada OC.
      ] },
      { id: "reportes", label: "Reportes", items: [
        ["*", "Dashboard", "#/m/inicio"],
        ["ver_costos", "Consumos y márgenes", "#/m/reportes"],
        ["admin", "KPIs", "#/s/kpis"],
        ["admin", "Ventas", "#/m/mc/pronto/rep_ventas"],
        ["ver_costos", "Niveles de stock", "#/m/mc/pronto/rep_stock"],
        ["ver_costos", "Compras", "#/m/mc/pronto/rep_compras"],
        ["admin", "Registro de auditoría", "#/m/mc/pronto/auditoria"],
      ] },
      // Consignación vive dentro de Compras (pestaña 🤝 Consignación, Emilia 17/11).
      { id: "finanzas", label: "Finanzas", items: [
        ["caja", "Caja chica", "#/m/caja"],
        ["caja", "Pagos recibidos", "#/m/caja/pagos"],
        ["admin", "Facturas SRI y retenciones", "#/m/mc/pronto/sri"],
        ["admin", "Cobranza", "#/m/mc/pronto/cobranza"],
        ["admin", "Estado de cuenta", "#/m/mc/pronto/edc"],
        ["admin", "Banco", "#/m/mc/pronto/banco"],
      ] },
      { id: "admin", label: "Admin", items: [
        ["usuarios|admin", "Usuarios", "#/m/usuarios"],
        ["admin", "Usuarios y permisos", "#/m/mc/upermisos"],
        ["permisos|admin", "Permisos por rol", "#/m/permisos"],
        ["admin", "Aprobaciones", "#/m/mc/pronto/aprobaciones"],
        ["admin", "Configuración general", "#/m/configuracion"],
      ] },
    ];
  }

  // Lo propio de Sunsu (no está en MineCore): se conserva tal cual.
  function propios() {
    var out = [];
    var mia = typeof etiquetaMia === "function" ? etiquetaMia : function (x) { return x; };
    var personal = [];
    if (ok("comisiones")) personal.push(["comisiones", mia("Mis comisiones"), "#/m/personal/comisiones"]);
    if (ok("rol_pagos")) personal.push(["rol_pagos", mia("Mi rol de pagos"), "#/m/personal/rol"]);
    if (ok("asistencia")) {
      personal.push(["asistencia", mia("Mi asistencia"), "#/m/personal/asistencia"]);
      personal.push(["asistencia", "Permisos y vacaciones", "#/m/personal/permisos"]);
      personal.push(["asistencia", "Multas", "#/m/personal/multas"]);
      if (adm()) personal.push(["asistencia", "Empleados", "#/m/personal/empleados"]);
    }
    if (personal.length) out.push({ id: "personal", label: "Personal", items: personal });
    var spa = [];
    if (ok("agenda")) spa.push(["agenda", adm() ? "Agenda" : "Mi agenda", "#/m/agenda"]);
    else if (typeof esRolCitas === "function" && esRolCitas()) spa.push(["inicio", "Mis citas", "#/m/citas"]);
    if (ok("gift_cards")) spa.push(["gift_cards", "Gift cards", "#/m/gift/cards"]);
    if (ok("paquetes")) spa.push(["paquetes", "Paquetes", "#/m/gift/paquetes"]);
    // Recepción / Seguimiento solo para recepcionista (y admin, para encontrarlo).
    var rol = (state.user && state.user.role) || "";
    if (adm() || rol === "recepcion") {
      spa.push(["*", "Seguimiento", "#/s/seguimiento"]);
      spa.push(["*", "Recepción", "#/s/recepcion"]);
    }
    if (ok("bitacora")) spa.push(["bitacora", "Bitácora de esterilización", "#/m/bitacora"]);
    // «Cabina» fuera del menú (Emilia 17/11): solo se oculta; la ruta #/m/cabina y los datos siguen.
    if (adm()) spa.push(["promos", "Promociones", "#/m/promociones"]);
    spa.push(["tarjetas", "Tarjetas", "#/s/tarjetas"]);
    out.push({ id: "spa", label: "Spa", items: spa });
    return out;
  }

  // Un emoji por módulo (Emilia 17/11): el mismo en el menú, la barra de abajo y el título de la pantalla.
  var EMO_GRUPO = { ventas: "🛍️", protocolos: "🧪", inventario: "📦", bodega: "🏬", compras: "🛒", reportes: "📊", consignacion: "🤝", finanzas: "💰", admin: "⚙️", personal: "👥", spa: "💆", otros: "☰" };
  var EMO_RUTA = [
    ["#/m/tickets", "🎫"], ["#/doc/ov", "🎫"], ["#/m/cotizaciones_cliente", "📝"], ["#/doc/cot", "📝"], ["#/m/clientes", "👩"], ["#/m/agenda", "📅"], ["#/m/citas", "📅"],
    ["#/m/mc/protocolos", "🧪"], ["#/m/mc/nuevo_protocolo", "🧪"], ["#/m/productos", "🧴"], ["#/m/inventario/venta", "🏪"], ["#/m/inventario/cabina", "🧴"], ["#/m/inventario", "📦"], ["#/m/conteos", "🔢"], ["#/m/transferencias", "🔄"], ["#/m/ajustes", "⚖️"],
    ["#/m/compras/rfq", "📨"], ["#/m/compras/cotizaciones", "📨"], ["#/m/recepciones", "📥"], ["#/m/compras/consignacion", "🤝"], ["#/m/compras", "🧾"], ["#/m/proveedores", "🏭"], ["#/m/mc/pronto/pendientes", "⏳"], ["#/m/mc/pronto/actas", "📥"], ["#/m/mc/pronto/pagos", "💸"],
    ["#/m/reportes", "📈"], ["#/s/kpis", "🎯"], ["#/m/mc/pronto/rep_ventas", "💹"], ["#/m/mc/pronto/rep_stock", "📦"], ["#/m/mc/pronto/rep_compras", "🛒"], ["#/m/mc/pronto/auditoria", "🔍"],
    ["#/m/mc/pronto/consignacion", "🤝"], ["#/m/caja", "💵"], ["#/m/mc/pronto/sri", "🧾"], ["#/m/mc/pronto/cobranza", "💳"], ["#/m/mc/pronto/edc", "📄"], ["#/m/mc/pronto/banco", "🏦"],
    ["#/m/mc/upermisos", "🔐"], ["#/m/mc/pronto/aprobaciones", "✅"], ["#/m/configuracion", "⚙️"], ["#/m/lugares", "🏬"],
    ["#/m/personal/comisiones", "💰"], ["#/m/personal/rol", "🧾"], ["#/m/personal/asistencia", "⏰"], ["#/m/personal/permisos", "🏖️"], ["#/m/personal/multas", "⚠️"], ["#/m/personal/horarios", "🗓️"], ["#/m/personal/empleados", "👥"],
    ["#/m/gift/cards", "🎁"], ["#/m/gift/paquetes", "🎴"], ["#/s/seguimiento", "📋"], ["#/s/recepcion", "🛎️"], ["#/m/bitacora", "🧼"], ["#/m/promociones", "🏷️"], ["#/s/promos", "🏷️"], ["#/s/tarjetas", "📤"],
    ["#/m/inicio", "📊"], ["#/s/historial", "🎫"], ["#/m/mc", "📦"],
  ];
  function emojiRuta(h) { h = String(h || ""); for (var i = 0; i < EMO_RUTA.length; i++) if (h === EMO_RUTA[i][0] || h.indexOf(EMO_RUTA[i][0] + "/") === 0) return EMO_RUTA[i][1]; return ""; }
  function conEmoji(txt, emo) { txt = String(txt || ""); return emo && txt.indexOf(emo) !== 0 ? emo + " " + txt : txt; }
  // Emoji por campo (fichas de clienta y ticket).
  var EMO_CAMPO = { "nombre": "👤", "nombres": "👤", "apellido": "👤", "cédula": "🪪", "ci": "🪪", "teléfono": "📱", "email": "✉️", "nacimiento": "🎂", "sector": "🏠",
    "tipo de piel": "🧴", "estado actual": "🌡️", "alergias": "⚠️", "medicación": "💊", "condiciones": "🩺", "reacciones previas": "🔴", "exfoliantes / retinoides": "🧪",
    "desea extracciones": "🔍", "autoriza fotos": "📷", "ciclo menstrual": "🌙", "cortesía complementaria": "🎀", "aprueba consentimiento": "✍️", "notas": "📝",
    "fecha de registro": "🗓️", "último registro": "🗓️", "atendió": "💆", "recomendaciones": "💡", "fecha": "📅", "local": "📍", "orden": "#️⃣", "fecha de regreso": "🔁",
    "reagendada": "📆", "ficha": "📇", "factura": "🧾", "cosmetóloga": "💆" };
  function emojiCampo(lbl) { var k = String(lbl || "").trim().toLowerCase(), m = EMO_CAMPO[k]; return m ? m + " " + lbl : lbl; }
  window.MCEmojiCampo = emojiCampo;
  // Color fijo por cosmetóloga (Usuarios). Se lee una vez y queda en el navegador.
  var COL = null; try { COL = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem("sunsu.colores")) || "null"); } catch (x) { COL = null; }
  function nn(x) { return String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function colorDe(nombre) {
    var m = (COL && COL.colores) || {}, k = nn(nombre); if (!k) return "";
    if (m[k]) return m[k].color;
    var ks = Object.keys(m), pri = k.split(" ")[0];
    var hit = ks.filter(function (x) { return x.indexOf(k) === 0 || k.indexOf(x) === 0; });
    if (hit.length === 1) return m[hit[0]].color;
    hit = ks.filter(function (x) { return x.split(" ")[0] === pri; });
    if (hit.length === 1) return m[hit[0]].color;
    // Nombre que no está en Usuarios (exempleada, texto libre): color fijo por el nombre.
    var pal = (COL && COL.paleta) || ["#E7DBFF", "#FFF1B8", "#D4F5E2", "#FFDCE5", "#D6ECFF", "#FFE3C9"], h = 0;
    for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    return pal[h % pal.length];
  }
  function oscuro(hex) { var n = parseInt(String(hex).slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return "rgb(" + Math.round(r * .55) + "," + Math.round(g * .55) + "," + Math.round(b * .55) + ")"; }
  function escH(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  window.MCColor = {
    cargar: function (forzar) {
      if (!forzar && COL && Date.now() - (COL.t || 0) < 10 * 60 * 1000) return Promise.resolve(COL);
      if (typeof window.api !== "function") return Promise.resolve(COL);
      return Promise.resolve(window.api("colores_list", {})).then(function (r) { if (r && r.ok) { COL = { t: Date.now(), colores: r.colores, paleta: r.paleta }; try { localStorage.setItem("sunsu.colores", JSON.stringify(COL)); } catch (x) {} } return COL; }).catch(function () { return COL; });
    },
    color: colorDe,
    datos: function () { return COL; },
    pill: function (nombre) {
      if (!nombre) return "";
      var c = colorDe(nombre);
      if (!c) return escH(nombre);
      return '<span class="mc-cos" style="background:' + c + ";color:" + oscuro(c) + ";border-color:" + oscuro(c) + '33">' + escH(nombre) + "</span>";
    },
  };
  if (typeof document !== "undefined") (function () { var st = document.createElement("style"); st.textContent = ".mc-cos{display:inline-block;padding:1px 9px;border-radius:999px;border:1px solid transparent;font-size:.78rem;font-weight:700;line-height:1.5;white-space:nowrap}"; document.head.appendChild(st); })();
  if (typeof setTimeout === "function" && typeof document !== "undefined") setTimeout(function () { window.MCColor.cargar(); }, 1500);
  var TABS = { ventas: 1, inventario: 1, spa: 1, compras: 1 };
  function grupos() {
    var out = [];
    // Orden (Emilia 18/11): Ventas primero, luego Spa; después el resto como en MineCore.
    var todos = catalogo().concat(propios());
    var spaG = todos.filter(function (g) { return g.id === "spa"; });
    todos = todos.filter(function (g) { return g.id !== "spa"; });
    Array.prototype.splice.apply(todos, [1, 0].concat(spaG));
    todos.forEach(function (g) {
      var items = g.items;
      if (!adm()) {
        // Personal: sin Protocolos, Reportes ni dashboard admin; Compras solo Recepciones.
        if (g.id === "protocolos" || g.id === "reportes") return;
        if (g.id === "compras") items = items.filter(function (it) { return it[0] === "recepciones" || String(it[2]) === "#/m/recepciones"; });
      }
      var vis = items.filter(function (it) { return ok(it[0]); }).map(function (it) { var c = it.slice(); c[1] = conEmoji(it[1], emojiRuta(it[2])); return c; });
      if (vis.length) out.push({ id: g.id, label: conEmoji(g.label, EMO_GRUPO[g.id]), items: vis });
    });
    // En el teléfono Ventas, Inventario, Spa y Compras van en la barra de abajo; el resto en «•••».
    var resto = out.filter(function (g) { return !TABS[g.id]; });
    out.push({ id: "otros", label: "Más", soloMovil: true, items: resto.flatMap(function (g) { return g.items; }),
      sections: resto.map(function (g) { return { title: g.label, icon: "", items: g.items }; }) });
    return out;
  }

  // Botón «+»: los mismos de MineCore que pidió Emilia, sin rutas.
  function crearItems() {
    var puedeOc = adm() && ok("compras");
    // Emilia 17/11: accesos rápidos con emoji; el 5.º es 📦 Abrir producto (cabina/local).
    var abierta = (typeof reloj !== "undefined" && reloj && reloj.abierto);
    var muestra = typeof muestraReloj === "function" && muestraReloj();
    return [
      [ok("tickets"), "🎫 Nuevo ticket", "#/doc/ov", ""],
      [ok("cotizaciones_cliente"), "📝 Nueva cotización", "#/doc/cot", ""],
      [puedeOc, "🧾 Nueva orden de compra", "#/m/compras/nueva", ""],
      [ok("caja"), "💵 Ingreso / gasto de caja chica", "#/m/caja/nuevo", ""],
      [true, "📦 Abrir producto", "#/m/aperturas", ""],
      [muestra && !abierta, "📷 Registrar entrada", "", "entrada"],
      [muestra && abierta, "📷 Registrar salida", "", "salida"],
    ].filter(function (x) { return x[0]; });
  }
  function crearHtml() {
    return crearItems().map(function (x, i) {
      var acc = x[3] ? ' data-reloj-open="' + e(x[3]) + '"' : ' data-go="' + e(x[2]) + '"';
      return '<button class="btn ' + (i === 0 ? "" : "ghost ") + 'block" type="button"' + acc + ">" + e(x[1]) + "</button>";
    }).join("");
  }

  // ---------- Pantallas ----------
  function pronto(key) {
    var p = PRONTO[key];
    if (!p) return '<p class="note">Esta pantalla no existe.</p>';
    return '<div class="card"><div class="card-title">' + e(p[0]) + '</div><p><span class="mcn-pronto">Próximamente</span></p><p class="note">' + e(p[1]) +
      " Esta pantalla todavía no está en la beta.</p>" +
      (p[2] ? '<button class="btn ghost small" type="button" data-go="' + e(p[2]) + '">Mientras tanto: ' + e(p[3]) + "</button>" : "") + "</div>";
  }

  async function protocolos() {
    var d = await api("getCabina");
    if (d.error) return fail(d);
    var ps = (d.protocolos || []).filter(function (p) { return p.vigente; });
    var inv = {};
    (d.inventario || []).forEach(function (r) { inv[String(r.codigo || "").toUpperCase()] = r.producto || r.nombre || ""; });
    if (!ps.length) return '<p class="note">Todavía no hay protocolos cargados.</p>';
    var cards = ps.map(function (p) {
      var prod = (p.pasos || []).filter(function (x) { return x.producto; });
      var filas = (p.pasos || []).slice().sort(function (a, b) { return (Number(a.paso) || 0) - (Number(b.paso) || 0); }).map(function (x) {
        return "<tr><td>" + e(x.paso) + "</td><td>" + e(x.descripcion) + "</td><td>" + (x.producto ? '<span class="mcn-sku">' + e(x.producto) + "</span> " + e(inv[String(x.producto).toUpperCase()] || "") : "") +
          "</td><td>" + (x.cantidad ? e(x.cantidad) + " " + e(x.unidad || "") : "") + "</td><td>" + (x.minutos ? e(x.minutos) + " min" : "") + "</td></tr>";
      }).join("");
      return '<details class="card mcn-proto"><summary><b>' + e(p.nombre) + '</b> <span class="mcn-sku">' + e(p.sku) + "</span> · v" + e(p.version) + " · " + (p.pasos || []).length + " pasos · " + prod.length + " con producto</summary>" +
        '<div class="sheet-scroll"><table class="nowrap-table"><thead><tr><th>Paso</th><th>Qué se hace</th><th>Producto</th><th>Cantidad</th><th>Tiempo</th></tr></thead><tbody>' + filas + "</tbody></table></div>" +
        (p.notas ? '<p class="note">' + e(p.notas) + "</p>" : "") + "</details>";
    }).join("");
    return '<p class="note">Qué productos lleva cada facial (la «orden de manufactura» de MineCore). Solo lectura por ahora; editar y crear protocolos llega en un paso siguiente.</p>' + cards;
  }

  async function reorden() {
    var d = await api("reorden_sugerir");
    if (d.error) return fail(d);
    var L = d.sugerencias || [];
    var nom = {};
    lugares().forEach(function (b) { nom[b.id] = b.label; });
    if (!L.length) return '<p class="note">Sin sugerencias. Para que un producto aparezca aquí necesita un punto de reorden en su bodega.</p>';
    return '<div class="sheet-scroll"><table class="nowrap-table desk-table"><thead><tr><th>SKU</th><th>Producto</th><th>Bodega</th><th>Stock</th><th>Punto de reorden</th><th>Pedir</th></tr></thead><tbody>' +
      L.map(function (r) { return '<tr><td class="mcn-sku">' + e(r.sku) + "</td><td>" + e(r.nombre) + "</td><td>" + e(nom[r.bodega_id] || "") + "</td><td>" + e(r.stock) + "</td><td>" + e(r.punto) + "</td><td><b>" + e(r.pedir) + "</b></td></tr>"; }).join("") +
      "</tbody></table></div>" + (adm() && ok("compras") ? '<button class="btn small" type="button" data-go="#/m/compras/nueva">Nueva orden de compra</button>' : "");
  }

  // Bodegas con las etiquetas de Emilia (solo nombres; los ids no cambian).
  function lugares() {
    var L = typeof lugaresVisibles === "function" ? lugaresVisibles() : [];
    return L.map(function (b) {
      var c = String(b.codigo || "").toUpperCase(), t = String(b.tipo || "");
      var label = b.nombre || c;
      if (c === "CONSIGNACION" || t === "consignacion") label = "Consignación";
      else if (c === "VENTA" || t === "venta") label = "Venta";
      else if (c === "CASA" || t === "casa") label = "Bodega Oficina";
      else if (c === "CAB2" || /2$/.test(b.nombre || "") && t === "cabina") label = "Bodega Cabina · Cabina 2";
      else if (c === "CAB3" || /3$/.test(b.nombre || "") && t === "cabina") label = "Bodega Cabina · Cabina 3";
      else if (t === "cabina") label = "Bodega Cabina";
      return { id: b.id, label: label };
    });
  }

  var AJ = { prods: null };
  async function ajuste() {
    if (!ok("ajuste")) return '<p class="err">Los ajustes de stock son para admin o para quien tiene inventario completo.</p>';
    var r = await api("mcprod_list", {});
    if (r.error) return fail(r);
    AJ.prods = (r.items || []).filter(function (p) { return p.tipo === "inventariable" && p.id; });
    var bods = lugares().map(function (b) { return '<option value="' + e(b.id) + '">' + e(b.label) + "</option>"; }).join("");
    return '<form class="card" id="mcn-aj"><div class="card-title">Ajuste de stock</div>' +
      '<label>Producto</label><input id="mcn-aj-q" list="mcn-aj-dl" placeholder="Busca por SKU o nombre" autocomplete="off" required>' +
      '<datalist id="mcn-aj-dl">' + AJ.prods.map(function (p) { return '<option value="' + e(p.sku + " · " + p.nombre) + '"></option>'; }).join("") + "</datalist>" +
      '<label>Bodega</label><select name="bodega_id" required>' + bods + "</select>" +
      '<label>Cantidad (+ suma, − resta)</label><input name="delta" inputmode="decimal" required placeholder="-2">' +
      '<label>Motivo</label><select name="motivo" required><option value="merma">Merma</option><option value="vencido">Vencido</option><option value="dañado">Dañado</option><option value="muestra">Muestra</option><option value="conteo">Conteo</option><option value="otro">Otro</option></select>' +
      '<label>Nota</label><textarea name="nota"></textarea>' +
      '<p class="note">Escribe el movimiento en el kardex de la beta (ajuste_save) y queda con número AJU. No toca la hoja ni el sistema actual.</p>' +
      '<p class="err" id="mcn-aj-err"></p><button class="btn" type="submit">Registrar ajuste</button></form>';
  }
  function wireAjuste(main) {
    var f = main.querySelector("#mcn-aj");
    if (!f) return;
    f.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var er = f.querySelector("#mcn-aj-err");
      var q = String(f.querySelector("#mcn-aj-q").value || "");
      var sku = q.split(" · ")[0].trim().toUpperCase();
      var p = (AJ.prods || []).find(function (x) { return String(x.sku).toUpperCase() === sku; });
      if (!p) { er.textContent = "Elige un producto de la lista"; return; }
      var body = Object.fromEntries(new FormData(f).entries());
      var delta = Number(String(body.delta).replace(",", "."));
      if (!delta) { er.textContent = "La cantidad no puede ser 0"; return; }
      if (body.motivo === "otro" && !String(body.nota || "").trim()) { er.textContent = "Con motivo «Otro» la nota es obligatoria"; return; }
      var btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      var r = await api("ajuste_save", { producto_id: p.id, bodega_id: body.bodega_id, delta: delta, motivo: body.motivo, nota: body.nota || "" });
      btn.disabled = false;
      if (!r || r.error) { er.textContent = (r && r.error) || "No se pudo registrar"; return; }
      f.innerHTML = '<div class="card-title">Ajuste ' + e(r.numero || "") + ' registrado</div><p class="note">' + e(p.sku + " · " + p.nombre) + ": " + (delta > 0 ? "+" : "") + e(delta) + '</p><button class="btn small" type="button" data-go="#/m/productos/p/' + e(p.id) + '">Ver producto</button> <button class="btn ghost small" type="button" data-go="#/m/mc/ajuste">Otro ajuste</button>';
      f.querySelectorAll("[data-go]").forEach(function (b) { b.onclick = function () { go(b.getAttribute("data-go")); }; });
    });
  }

  function css() {
    if (document.getElementById("mcn-css")) return;
    var s = document.createElement("style");
    s.id = "mcn-css";
    s.textContent = ".mcn-pronto{display:inline-block;background:var(--gold-l);color:var(--gold);border:1px solid var(--gold-m);border-radius:999px;padding:3px 10px;font-weight:800;font-size:.72rem}" +
      "#crear-menu{max-height:calc(100vh - 32px);overflow:auto}.mcn-sku{font-family:ui-monospace,Menlo,monospace;font-size:.78rem;color:var(--navy-d)}.mcn-proto{margin-bottom:10px}.mcn-proto summary{cursor:pointer;padding:4px 0}";
    document.head.appendChild(s);
  }

  var TITULOS = { protocolos: "Protocolos", reorden: "Reorden", ajuste: "Ajuste de stock", upermisos: "Usuarios y permisos" };
  window.MCNav = {
    grupos: grupos, emojiRuta: emojiRuta, emojiGrupo: function (id) { return EMO_GRUPO[id] || ""; }, conEmoji: conEmoji,
    crearHtml: crearHtml,
    crearItems: crearItems,
    titulo: function (route) {
      if (route.sub === "pronto") return (PRONTO[route.id] || ["Próximamente"])[0];
      return TITULOS[route.sub] || "Sunsu";
    },
    render: async function (route) {
      css();
      if (route.sub === "pronto") return pronto(route.id);
      if (route.sub === "protocolos") return !ok("cabina") ? '<p class="err">Este módulo no está en tu menú.</p>' : window.MCProtocolos ? window.MCProtocolos.render(route) : protocolos();
      if (route.sub === "reorden") return ok("compras") ? reorden() : '<p class="err">Este módulo no está en tu menú.</p>';
      if (route.sub === "ajuste") return ajuste();
      if (route.sub === "upermisos" && window.MCPermisos) return window.MCPermisos.render(route);
      return '<p class="note">Pantalla desconocida.</p>';
    },
    wire: function (main, route) {
      if (route.sub === "ajuste") wireAjuste(main);
      if (route.sub === "protocolos" && window.MCProtocolos) window.MCProtocolos.wire(main, route);
      if (route.sub === "upermisos" && window.MCPermisos) window.MCPermisos.wire(main, route);
    },
    _pronto: PRONTO,
  };
})();
