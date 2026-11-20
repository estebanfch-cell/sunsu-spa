/* Lista compacta a la izquierda + detalle a la derecha, como en MineCore, con el tema Sunsu.
   Escritorio (≥861 px): panel de ~250 px con «Filtrar…»; al elegir un registro se abre a la derecha
   y el hash cambia para que el enlace se pueda compartir. La lista conserva su scroll y su filtro.
   iPhone: la lista va primero a ancho completo; al tocar, el detalle ocupa toda la pantalla con ← Volver.
   Sin scroll horizontal. Módulos: tickets, clientas, proveedores (y los que se registren después). */
(function () {
  var Q = {};
  var scroll = {};
  var prevHash = "";
  var mods = {};

  function wide() {
    return !!(window.matchMedia && window.matchMedia("(min-width: 861px)").matches);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function money(n) {
    var x = parseFloat(n);
    if (isNaN(x)) return "—";
    return "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function norm(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  function confirmLeave(m) {
    var dirty = m && m.isDirty && m.isDirty();
    return !dirty || confirm("Hay cambios sin guardar. ¿Salir igual?");
  }

  function register(name, spec) {
    mods[name] = spec;
    if (Q[name] == null) Q[name] = "";
    if (scroll[name] == null) scroll[name] = 0;
  }
  function getMod(name) { return mods[name]; }
  function matchMod(route) {
    var n, m;
    for (n in mods) {
      if (!Object.prototype.hasOwnProperty.call(mods, n)) continue;
      m = mods[n];
      if (m.match && m.match(route)) return n;
    }
    return "";
  }

  function shellHTML(id, listInner, detailInner) {
    return '<div class="ss-md" id="ss-md-' + esc(id) + '">'
      + '<aside class="ss-md-list" id="ss-md-' + esc(id) + '-list">'
      + '<div class="ss-md-q">'
      + '<input type="search" id="ss-md-' + esc(id) + '-q" class="ss-md-input" placeholder="Filtrar…" value="' + esc(Q[id] || "") + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Filtrar la lista">'
      + '<button type="button" class="ss-md-full" title="Volver a la lista completa" data-ss-md-full="' + esc(id) + '">☰</button>'
      + "</div>"
      + '<div class="ss-md-lb" id="ss-md-' + esc(id) + '-lb">' + (listInner || "") + "</div>"
      + "</aside>"
      + '<div class="ss-md-r" id="ss-md-' + esc(id) + '-r">' + (detailInner || "") + "</div>"
      + "</div>";
  }

  function blobOf(it, m) {
    if (m.blob) return m.blob(it);
    return [m.itemId && m.itemId(it), m.title && m.title(it), m.subtitle && m.subtitle(it)].join(" ");
  }
  function matches(it, m, q) {
    if (!q) return true;
    var toks = norm(q).split(/\s+/).filter(Boolean);
    var blob = norm(blobOf(it, m));
    for (var i = 0; i < toks.length; i++) if (blob.indexOf(toks[i]) < 0) return false;
    return true;
  }
  function itemsOf(m, q) {
    var L = (m.items && m.items()) || [];
    return L.filter(function (it) { return matches(it, m, q); });
  }

  function listRowsHTML(name, sel) {
    var m = mods[name];
    if (!m) return '<div class="ss-md-empty">Sin resultados</div>';
    var L = itemsOf(m, Q[name] || "");
    if (!L.length) return '<div class="ss-md-empty">Sin resultados</div>';
    return L.map(function (it) {
      var id = m.itemId ? String(m.itemId(it) || "") : "";
      var on = id && id === String(sel || "");
      var tip = m.tip ? (m.tip(it) || "") : "";
      var cls = m.cls ? (m.cls(it) || "") : "";
      var title = m.title ? m.title(it) : id;
      var sub = m.subtitle ? m.subtitle(it) : "";
      var amt = m.amount ? m.amount(it) : "";
      var pills = m.pills ? (m.pills(it) || "") : "";
      return '<button type="button" class="ss-md-item' + (on ? " on" : "") + cls + '" data-ss-md-id="' + esc(id) + '"' + (tip ? ' title="' + esc(tip) + '"' : "") + ">"
        + '<div class="ss-md-l1"><b>' + esc(title || "—") + "</b>"
        + (amt !== "" && amt != null ? '<span class="ss-md-amt">' + esc(amt) + "</span>" : "") + "</div>"
        + (sub ? '<div class="ss-md-l2">' + esc(sub) + "</div>" : "")
        + (pills ? '<div class="ss-md-l3">' + pills + "</div>" : "")
        + "</button>";
    }).join("");
  }

  function saveListScroll(name) {
    var lb = document.getElementById("ss-md-" + name + "-lb");
    if (lb) scroll[name] = lb.scrollTop;
  }
  function restoreListScroll(name) {
    var lb = document.getElementById("ss-md-" + name + "-lb");
    if (lb) lb.scrollTop = scroll[name] || 0;
  }
  function paintList(name, sel) {
    var lb = document.getElementById("ss-md-" + name + "-lb");
    if (!lb) return;
    var st = lb.scrollTop;
    lb.innerHTML = listRowsHTML(name, sel);
    lb.scrollTop = st;
  }
  function setTitle(title) {
    if (!title) return;
    var h1 = document.querySelector("#app .top h1");
    if (h1) h1.textContent = title;
  }

  function wireList(name, root) {
    if (!root) return;
    var m = mods[name];
    if (!m) return;
    var q = root.querySelector("#ss-md-" + name + "-q");
    if (q && !q._ssMd) {
      q._ssMd = true;
      q.addEventListener("input", function () {
        Q[name] = q.value;
        var route = typeof parseRoute === "function" ? parseRoute() : {};
        paintList(name, m.sel ? m.sel(route) : (route.id || route.sub || ""));
      });
    }
    var full = root.querySelector("[data-ss-md-full='" + name + "']");
    if (full) {
      full.onclick = function () {
        if (!confirmLeave(m)) return;
        if (typeof go === "function") go(m.listHash || "#/");
      };
    }
    var lb = root.querySelector("#ss-md-" + name + "-lb");
    if (lb && !lb._ssMd) {
      lb._ssMd = true;
      lb.addEventListener("click", function (ev) {
        var it = ev.target.closest("[data-ss-md-id]");
        if (!it) return;
        var id = it.getAttribute("data-ss-md-id");
        if (!id) return;
        var route = typeof parseRoute === "function" ? parseRoute() : {};
        var cur = m.sel ? String(m.sel(route) || "") : String(route.id || route.sub || "");
        if (id === cur) return;
        if (!confirmLeave(m)) return;
        saveListScroll(name);
        prevHash = location.hash || "";
        if (typeof go === "function") go(m.itemHash ? m.itemHash(id) : "#/");
      });
    }
  }

  async function render(name, route) {
    var m = mods[name];
    if (!m) return "<p class=\"err\">Módulo no registrado</p>";
    var sel = m.sel ? m.sel(route) : String((route && (route.id || route.sub)) || "");
    var detail = "";
    try { detail = m.renderDetail ? await m.renderDetail(route) : ""; }
    catch (e) { detail = '<p class="err">' + esc((e && e.message) || e) + "</p>"; }
    var has = m.hasItems ? m.hasItems() : !!((m.items && m.items()) || []).length;
    var list = has ? listRowsHTML(name, sel) : '<div class="ss-md-empty">Cargando lista…</div>';
    return shellHTML(name, list, detail || "");
  }

  async function after(name, main, route) {
    var m = mods[name];
    if (!m) return;
    var sel = m.sel ? m.sel(route) : String((route && (route.id || route.sub)) || "");
    if (m.wireDetail) m.wireDetail(main, route);
    wireList(name, main);
    restoreListScroll(name);
    if (m.ensureItems && !(m.hasItems ? m.hasItems() : ((m.items && m.items()) || []).length)) {
      await m.ensureItems();
      paintList(name, sel);
      restoreListScroll(name);
    }
    prevHash = location.hash || "";
  }

  async function swapDetail(name, route, title) {
    var m = mods[name];
    var pane = document.getElementById("ss-md-" + name + "-r");
    if (!m || !pane) return false;
    setTitle(title);
    pane.innerHTML = '<p class="note">Cargando…</p>';
    try { pane.innerHTML = m.renderDetail ? await m.renderDetail(route) : ""; }
    catch (e) { pane.innerHTML = '<p class="err">' + esc((e && e.message) || e) + "</p>"; }
    var main = document.getElementById("main") || pane.closest("#main, .main") || document;
    if (m.wireDetail) m.wireDetail(main, route);
    paintList(name, m.sel ? m.sel(route) : "");
    restoreListScroll(name);
    wireList(name, main);
    prevHash = location.hash || "";
    return true;
  }

  async function interceptDraw(route, opts) {
    if (!wide() || !route) return false;
    var name = matchMod(route);
    if (!name) return false;
    var m = mods[name];
    var title = opts && opts.title;
    if (document.getElementById("ss-md-" + name) && document.getElementById("app")) {
      return swapDetail(name, route, title);
    }
    var onList = m.onList && m.onList();
    if (onList && document.getElementById("app") && document.getElementById("main")) {
      var main = document.getElementById("main");
      setTitle(title);
      main.innerHTML = (typeof banner === "function" ? banner() : "") + await render(name, route);
      await after(name, main, route);
      return true;
    }
    return false;
  }

  /* ---------- Tickets ---------- */
  function tkClave(t) {
    if (window.MCTickets && window.MCTickets.claveDe) return window.MCTickets.claveDe(t);
    return (t && t.so_num) || (t && t.tkRow ? "r" + t.tkRow : "");
  }
  function tkFacCorta(t) {
    var full = "";
    try { if (typeof _tkFacFull === "function") full = _tkFacFull(t) || ""; } catch (e) {}
    if (!full) {
      var raw = String((t && (t.factura || t.fac_7 || t.numFac)) || "").trim();
      try { if (typeof _facTxt === "function") raw = _facTxt(raw); } catch (e) {}
      if (raw && !/sin/i.test(raw)) full = raw;
    }
    if (!full) return t && t.sin_cobro ? (t.sin_cobro === "interno" ? "Consumo interno" : t.sin_cobro === "canje" ? "Canje de paquete" : "Cortesía") : "Sin factura"; // TK98
    var m = /(\d{1,9})$/.exec(String(full).replace(/\s/g, ""));
    if (m) {
      var n = String(Number(m[1]));
      if (n !== "0") return "Fac " + n;
    }
    return "Fac " + full;
  }
  function tkCosmPill(t) {
    var nom = String((t && t.cosmetologa) || "").trim();
    if (!nom) return "";
    var corto = nom.split(/\s+/)[0];
    if (window.MCColor && window.MCColor.pillCorto) { var hc = window.MCColor.pillCorto(nom); if (hc) return hc; }
    if (window.MCColor && window.MCColor.pill) {
      var html = window.MCColor.pill(corto) || window.MCColor.pill(nom);
      if (html) return html;
    }
    var col = (typeof colorCosm === "function" ? colorCosm(nom) : "") || "#1A237E";
    return '<span class="mc-cos ss-md-cos" style="background:' + col + ';color:#fff">' + esc(corto) + "</span>";
  }
  function tkPills(t) {
    return '<span class="ss-md-fac">' + esc(tkFacCorta(t)) + "</span>" + tkCosmPill(t);
  }
  function tkStatusClass(t) {
    var Lf = (typeof window._tkLedOf === "function" ? window._tkLedOf(t) : null);
    var fl = Lf && Lf.flag;
    var fa = !fl && Lf && Lf.falta && Lf.falta.length;
    if (fl) return " ss-md-flag";
    if (fa) return " ss-md-falta";
    return "";
  }
  function tkStatusTip(t) {
    var Lf = (typeof window._tkLedOf === "function" ? window._tkLedOf(t) : null);
    var fl = Lf && Lf.flag;
    var fa = !fl && Lf && Lf.falta && Lf.falta.length ? Lf.falta : null;
    return fl ? "No cuadra: " + fl : fa ? "Falta: " + fa.join(" · ") : "";
  }
  function tkTotal(t) {
    if (typeof _histMontos === "function") return _histMontos(t).tot;
    return parseFloat(t && (t.estimado != null ? t.estimado : t.total)) || 0;
  }
  register("tickets", {
    listHash: "#/m/tickets",
    itemHash: function (id) { return "#/m/tickets/t/" + encodeURIComponent(id); },
    match: function (route) { return !!(route && route.kind === "mod" && route.mod === "tickets" && route.sub === "t" && route.id && window.MCTickets); },
    sel: function (route) { return String((route && route.id) || ""); },
    onList: function () { return !!document.getElementById("hist-res"); },
    items: function () { return window._histVisibles || window._histData || []; },
    hasItems: function () { return !!(window._histData || []).length; },
    itemId: tkClave,
    title: function (t) { return (t && t.so_num) || tkClave(t) || "—"; },
    subtitle: function (t) { return ((((t && t.nombre) || "") + " " + ((t && t.apellido) || "")).trim() || "—"); },
    amount: function (t) { return money(tkTotal(t)); },
    pills: tkPills,
    cls: tkStatusClass,
    tip: tkStatusTip,
    blob: function (t) { return [tkClave(t), t.so_num, t.beta_num, t.nombre, t.apellido, t.cosmetologa, t.cedula, t.factura, t.fac_7].join(" "); },
    isDirty: function () { return !!(window.MCTickets && window.MCTickets.isDirty && window.MCTickets.isDirty()); },
    renderDetail: function (route) { return window.MCTickets.render(route); },
    wireDetail: function (main, route) { if (window.MCTickets) window.MCTickets.wire(main, route); },
    ensureItems: async function () {
      if ((window._histData || []).length) return true;
      // TK156: lista guardada (precalentada) → al instante; se refresca sola después.
      try { if (window._tkCacheAplicar && window._tkCacheAplicar(window._tkQ || { desde: "", hasta: "", cosm: "", q: "" })) return true; } catch (eC) {}
      if (typeof api !== "function") return false;
      try {
        var q = window._tkQ || { desde: "", hasta: "", cosm: "", q: "" };
        var r = await api("tk_historial", { desde: q.desde || "", hasta: q.hasta || "", cosm: q.cosm || "", q: q.q || "", offset: 0, limit: Math.max(50, window._tkLim || 50) });
        if (r && r.ok) {
          window._histData = r.items || [];
          window._histVisibles = window._histData;
          window._tkLeds = window._tkLeds || {};
          (r.items || []).forEach(function (it) { if (typeof window._tkLedGuardar === "function") window._tkLedGuardar(it); else if (it.led && it.so_num) window._tkLeds[String(it.so_num)] = it.led; });
          window._tkTot = { total: r.total, suma: r.suma, hayMas: r.hayMas };
          window._tkServer = true;
          return true;
        }
      } catch (e) {}
      return false;
    },
  });

  /* ---------- Clientas ---------- */
  function clK() { return (window.MCClientes && window.MCClientes._k) || {}; }
  register("clientes", {
    listHash: "#/m/clientes",
    itemHash: function (id) { return "#/m/clientes/c/" + encodeURIComponent(id); },
    match: function (route) { return !!(route && route.kind === "mod" && route.mod === "clientes" && route.sub === "c" && route.id && window.MCClientes); },
    sel: function (route) { return String((route && route.id) || ""); },
    onList: function () { return !!(document.getElementById("mccl-q") && document.getElementById("mccl-body")); },
    items: function () { return window.MCClientes && window.MCClientes.items ? window.MCClientes.items() : (clK().L || []); },
    hasItems: function () { return !!((clK().L || []).length); },
    itemId: function (c) { return c && c.key; },
    title: function (c) { return (c && c.codigo) || "—"; },
    subtitle: function (c) { return (c && c.nombre) || "Sin nombre"; },
    amount: function (c) {
      var K = clK();
      if (!K.admin) return "";
      return money(c && c.total);
    },
    pills: function (c) {
      var h = "";
      if (c && c.giftSaldo > 0) h += '<span class="mccl-pend">GC ' + money(c.giftSaldo) + "</span>";
      if (c && c.paquetesActivos > 0) h += '<span class="mccl-pend">' + esc(c.paquetesActivos) + " paq.</span>";
      return h;
    },
    blob: function (c) { return [c.codigo, c.nombre, c.cedula, c.telefono, c.sector, c.cosmetologa, c.key].join(" "); },
    isDirty: function () { return !!(window.MCClientes && window.MCClientes.isDirty && window.MCClientes.isDirty()); },
    renderDetail: function (route) { return window.MCClientes.render(route); },
    wireDetail: function (main, route) { if (window.MCClientes) window.MCClientes.wire(main, route); },
    ensureItems: async function () {
      if (window.MCClientes && window.MCClientes.ensureList) return window.MCClientes.ensureList();
      return false;
    },
  });

  /* ---------- Proveedores ---------- */
  register("proveedores", {
    listHash: "#/m/proveedores",
    itemHash: function (id) { return "#/m/proveedores/" + encodeURIComponent(id); },
    match: function (route) { return !!(route && route.kind === "mod" && route.mod === "proveedores" && route.sub && route.sub !== "nuevo"); },
    sel: function (route) { return String((route && route.sub) || ""); },
    onList: function () { return !!(document.getElementById("prov-q") && document.getElementById("prov-layout") && !document.getElementById("ss-md-proveedores")); },
    items: function () {
      if (typeof filasProveedorVisibles === "function") return filasProveedorVisibles();
      return window._provRows || [];
    },
    hasItems: function () { return !!(window._provRows || []).length; },
    itemId: function (p) { return p && p.fila; },
    title: function (p) { return (p && p.codigo) || "—"; },
    subtitle: function (p) { return (p && p.nombre) || "—"; },
    amount: function (p) { return money(p && p.saldo); },
    blob: function (p) { return [p.codigo, p.nombre, p.ruc, p.telefono, p.email, p.fila].join(" "); },
    renderDetail: async function (route) {
      if (!(window._provRows || []).length) {
        if (typeof api === "function") {
          try {
            var data = await api("getProveedoresTabla");
            if (data && !data.error) window._provRows = data.items || [];
          } catch (e) {}
        }
      }
      var id = String((route && route.sub) || "");
      window._provFila = id;
      var sel = (window._provRows || []).find(function (p) { return String(p.fila) === id; });
      if (!sel) return '<p class="err">No se encontró el proveedor.</p><button class="btn ghost small" type="button" data-go="#/m/proveedores">← Volver a la lista</button>';
      return typeof htmlProvDetalle === "function" ? htmlProvDetalle(sel) : "";
    },
    wireDetail: function (main) {
      if (typeof wireProveedoresDetalle === "function") wireProveedoresDetalle(main);
      else if (typeof wireProveedores === "function") wireProveedores(main);
    },
    ensureItems: async function () {
      if ((window._provRows || []).length) return true;
      if (typeof api !== "function") return false;
      try {
        var data = await api("getProveedoresTabla");
        if (data && !data.error) { window._provRows = data.items || []; return true; }
      } catch (e) {}
      return false;
    },
  });


  /* ---------- Órdenes de compra ---------- */
  function ocK() { return (window.MCCompras && window.MCCompras._k) || {}; }
  function ocProv(it) { return (it && it.prov && it.prov.nombre) || (it && it.proveedor) || "—"; }
  function ocPill(txt) {
    if (!txt) return "";
    return (window.MCCompras && window.MCCompras._pill) ? window.MCCompras._pill(txt) : '<span class="tk-pill">' + esc(txt) + "</span>";
  }
  register("compras", {
    listHash: "#/m/compras",
    itemHash: function (id) { return "#/m/compras/oc/" + encodeURIComponent(id); },
    match: function (route) { return !!(route && route.kind === "mod" && route.mod === "compras" && route.sub === "oc" && route.id && window.MCCompras); },
    sel: function (route) { return String((route && route.id) || ""); },
    onList: function () { return !!(document.getElementById("mcoc-q") && document.getElementById("mcoc-body") && !document.getElementById("ss-md-compras")); },
    items: function () { return ocK().items || []; },
    hasItems: function () { return !!((ocK().items || []).length); },
    itemId: function (it) { return it && it.id; },
    title: function (it) { return (it && it.numero) || "—"; },
    subtitle: ocProv,
    amount: function (it) { return ocK().admin ? money(it && it.total) : ""; },
    pills: function (it) { return ocPill(it && it.estado) + (it && it.tipo === "consignacion" ? ocPill("Consignación") : ""); },
    blob: function (it) { return [it.id, it.numero, ocProv(it), it.estado, it.nota].join(" "); },
    renderDetail: function (route) { return window.MCCompras.render(route); },
    wireDetail: function (main, route) { if (window.MCCompras) window.MCCompras.wire(main, route); },
    ensureItems: async function () {
      if ((ocK().items || []).length) return true;
      if (window.MCCompras && window.MCCompras.ensureList) return window.MCCompras.ensureList();
      return false;
    },
  });

  /* ---------- Cotizaciones de proveedor ---------- */
  register("compras_cot", {
    listHash: "#/m/compras/cotizaciones",
    itemHash: function (id) { return "#/m/compras/cot/" + encodeURIComponent(id); },
    match: function (route) { return !!(route && route.kind === "mod" && route.mod === "compras" && route.sub === "cot" && route.id && window.MCCompras); },
    sel: function (route) { return String((route && route.id) || ""); },
    onList: function () { return !!(document.getElementById("mcoc-q") && document.getElementById("mcoc-cot-body") && !document.getElementById("ss-md-compras_cot")); },
    items: function () { return ocK().cot || []; },
    hasItems: function () { return !!((ocK().cot || []).length); },
    itemId: function (it) { return it && it.id; },
    title: function (it) { return (it && it.numero) || "—"; },
    subtitle: ocProv,
    amount: function (it) { return ocK().admin ? money(it && it.total) : ""; },
    pills: function (it) { return ocPill(it && it.estado); },
    blob: function (it) { return [it.id, it.numero, ocProv(it), it.estado, it.ocNumero].join(" "); },
    renderDetail: function (route) { return window.MCCompras.render(route); },
    wireDetail: function (main, route) { if (window.MCCompras) window.MCCompras.wire(main, route); },
    ensureItems: async function () {
      if ((ocK().cot || []).length) return true;
      if (window.MCCompras && window.MCCompras.ensureList) return window.MCCompras.ensureList();
      return false;
    },
  });

  /* ---------- Cotizaciones de clienta ---------- */
  function wireCotDetalle(main) {
    var pdf = main && main.querySelector && main.querySelector("#cot-pdf");
    if (pdf) pdf.onclick = function () {
      if (window._cotAbierta && typeof _cotDescargar === "function") _cotDescargar(window._cotAbierta);
    };
  }
  register("cotizaciones", {
    listHash: "#/m/cotizaciones_cliente",
    itemHash: function (id) { return "#/m/cotizaciones_cliente/c/" + encodeURIComponent(id); },
    match: function (route) {
      if (!route) return false;
      if (route.kind === "mod" && route.mod === "cotizaciones_cliente" && route.sub === "c" && route.id) return true;
      if (route.kind === "doc" && route.doc === "cot" && route.id) return true;
      return false;
    },
    sel: function (route) { return String((route && route.id) || ""); },
    onList: function () { return !!(document.getElementById("filtro-cot") && document.getElementById("cot-md") && !document.getElementById("ss-md-cotizaciones")); },
    items: function () { return window._cotRows || []; },
    hasItems: function () { return !!((window._cotRows || []).length); },
    itemId: function (c) { return c && c.numero; },
    title: function (c) { return (c && c.numero) || "—"; },
    subtitle: function (c) { return (c && c.cliente) || "Sin clienta"; },
    amount: function (c) { return money(c && c.total); },
    pills: function (c) { return c && c.estado ? '<span class="tk-pill">' + esc(c.estado) + "</span>" : ""; },
    blob: function (c) { return [c.numero, c.cliente, c.cedula, c.estado, c.fecha].join(" "); },
    renderDetail: async function (route) {
      var id = String((route && route.id) || "");
      window._cotSel = id;
      return typeof renderCot === "function" ? await renderCot(id) : "";
    },
    wireDetail: function (main) { wireCotDetalle(main); },
    ensureItems: async function () {
      if ((window._cotRows || []).length) return true;
      if (typeof api !== "function") return false;
      try {
        var data = await api("getCotizaciones");
        if (data && !data.error) { window._cotRows = data.items || []; return true; }
      } catch (e) {}
      return false;
    },
  });

  /* ---------- Productos ---------- */
  function prK() { return (window.MCProductos && (window.MCProductos._mc || window.MCProductos._k)) || {}; }
  register("productos", {
    listHash: "#/m/productos",
    itemHash: function (id) { return "#/m/productos/p/" + encodeURIComponent(id); },
    match: function (route) { return !!(route && route.kind === "mod" && route.mod === "productos" && route.sub === "p" && route.id && window.MCProductos); },
    sel: function (route) { return String((route && route.id) || ""); },
    onList: function () { return !!(document.getElementById("mcp-q") && !document.getElementById("ss-md-productos")); },
    items: function () { return window.MCProductos && window.MCProductos.items ? window.MCProductos.items() : (prK().list || []); },
    hasItems: function () { return !!((prK().list || []).length); },
    itemId: function (p) { return p && p.id; },
    title: function (p) { return (p && (p.skuVisible || p.sku)) || "—"; },
    subtitle: function (p) { return (p && p.nombre) || "Sin nombre"; },
    amount: function (p) {
      if (!p || p.tipo === "servicio") return "";
      var n = Number(p.stock);
      return isNaN(n) ? "" : String(Math.round(n) === n ? n : n.toFixed(2));
    },
    pills: function (p) {
      if (!p || p.tipo === "servicio") return "";
      if (p.estado === "agotado") return '<span class="tk-pill" style="color:#C0392B;border-color:#C0392B">Agotado</span>';
      if (p.estado === "bajo") return '<span class="tk-pill" style="color:#C98A00;border-color:#C98A00">Bajo</span>';
      return '<span class="tk-pill" style="color:#2E8B57;border-color:#2E8B57">OK</span>';
    },
    cls: function (p) { return p && p.estado === "agotado" ? " ss-md-flag" : (p && p.estado === "bajo" ? " ss-md-falta" : ""); },
    blob: function (p) { return [p.sku, p.skuVisible, p.skuAlias, p.nombre, p.marca, p.categoria, p.subtipo, p.skuProveedor].join(" "); },
    isDirty: function () { return !!(window.MCProductos && (window.MCProductos.isDirty ? window.MCProductos.isDirty() : window.MCProductos.dirty && window.MCProductos.dirty())); },
    renderDetail: function (route) { return window.MCProductos.render(route); },
    wireDetail: function (main, route) { if (window.MCProductos) window.MCProductos.wire(main, route); },
    ensureItems: async function () {
      if ((prK().list || []).length) return true;
      if (window.MCProductos && window.MCProductos.ensureList) return window.MCProductos.ensureList();
      return false;
    },
  });

  /* ---------- Gift cards ---------- */
  function gcK() { return (window.MCGiftCards && window.MCGiftCards._k) || {}; }
  register("gift", {
    listHash: "#/m/gift/cards",
    itemHash: function (id) { return "#/m/gift/cards/" + encodeURIComponent(id); },
    match: function (route) { return !!(route && route.kind === "mod" && route.mod === "gift" && route.sub === "cards" && route.id && route.id !== "nueva" && window.MCGiftCards); },
    sel: function (route) { return String((route && route.id) || ""); },
    onList: function () { return !!(document.getElementById("mcgc-q") && !document.getElementById("ss-md-gift")); },
    items: function () { return gcK().items || []; },
    hasItems: function () { return !!((gcK().items || []).length); },
    itemId: function (v) { return v && v.id; },
    title: function (v) { return (v && v.codigo) || "—"; },
    subtitle: function (v) { return (v && (v.comprador || v.para)) || "Sin nombre"; },
    pills: function (v) { return v && (v.estadoTxt || v.estado) ? '<span class="tk-pill">' + esc(v.estadoTxt || v.estado) + "</span>" : ""; },
    blob: function (v) { return [v.id, v.codigo, v.comprador, v.cedula, v.para, v.factura, v.servicio, v.valor].join(" "); },
    isDirty: function () { return !!(gcK().edit); },
    renderDetail: function (route) { return window.MCGiftCards.render(route); },
    wireDetail: function (main, route) { if (window.MCGiftCards) window.MCGiftCards.wire(main, route); },
    ensureItems: async function () {
      if ((gcK().items || []).length) return true;
      if (window.MCGiftCards && window.MCGiftCards.ensureList) return window.MCGiftCards.ensureList();
      return false;
    },
  });

  /* ---------- Paquetes ---------- */
  function pqK() { return (window.MCPaquetes && window.MCPaquetes._k) || {}; }
  register("paquetes", {
    listHash: "#/m/gift/paquetes",
    itemHash: function (id) { return "#/m/gift/paquetes/" + encodeURIComponent(id); },
    match: function (route) {
      if (!(window.MCPaquetes) || !route) return false;
      if (route.kind === "mod" && route.mod === "gift" && route.sub === "paquetes" && route.id) return true;
      if (route.kind === "mod" && route.mod === "paquetes" && route.sub && route.sub !== "nuevo") return true;
      return false;
    },
    sel: function (route) { return String((route && (route.id || route.sub)) || ""); },
    onList: function () { return !!(document.getElementById("mcpq-q") && !document.getElementById("ss-md-paquetes")); },
    items: function () { return pqK().items || []; },
    hasItems: function () { return !!((pqK().items || []).length); },
    itemId: function (v) { return v && v.id; },
    title: function (v) { return (v && v.codigo) || "—"; },
    subtitle: function (v) { return ((((v && v.nombre) || "") + " " + ((v && v.apellido) || "")).trim() || (v && v.paquete) || "Sin nombre"); },
    amount: function (v) { return v && v.total != null ? String(v.usados || 0) + "/" + String(v.total) : ""; },
    pills: function (v) { return v && v.estado ? '<span class="tk-pill">' + esc(v.estado) + "</span>" : ""; },
    blob: function (v) { return [v.id, v.codigo, v.nombre, v.apellido, v.cedula, v.paquete, v.clienteCodigo].join(" "); },
    renderDetail: function (route) { return window.MCPaquetes.render(route); },
    wireDetail: function (main, route) { if (window.MCPaquetes) window.MCPaquetes.wire(main, route); },
    ensureItems: async function () {
      if ((pqK().items || []).length) return true;
      if (window.MCPaquetes && window.MCPaquetes.ensureList) return window.MCPaquetes.ensureList();
      return false;
    },
  });

  /* ---------- Recepciones ---------- */
  function rcK() { return (window.MCRecepciones && window.MCRecepciones._k) || {}; }
  register("recepciones", {
    listHash: "#/m/recepciones",
    itemHash: function (id) { return "#/m/recepciones/" + encodeURIComponent(id); },
    match: function (route) { return !!(route && route.kind === "mod" && route.mod === "recepciones" && route.sub && window.MCRecepciones); },
    sel: function (route) { return String((route && route.sub) || ""); },
    onList: function () { return !!(document.getElementById("mcrc-lista") && !document.getElementById("ss-md-recepciones")); },
    items: function () { return rcK().items || []; },
    hasItems: function () { return !!((rcK().items || []).length); },
    itemId: function (o) { return o && o.id; },
    title: function (o) { return (o && o.numero) || "—"; },
    subtitle: function (o) { return (o && o.proveedor) || "—"; },
    amount: function (o) { return o && o.pendiente != null ? String(o.pendiente) + " pend." : ""; },
    pills: function (o) { return ocPill(o && o.estado); },
    blob: function (o) { return [o.id, o.numero, o.proveedor, o.estado].join(" "); },
    renderDetail: function (route) { return window.MCRecepciones.render(route); },
    wireDetail: function (main, route) { if (window.MCRecepciones) window.MCRecepciones.wire(main, route); },
    ensureItems: async function () {
      if ((rcK().items || []).length) return true;
      if (window.MCRecepciones && window.MCRecepciones.ensureList) return window.MCRecepciones.ensureList();
      return false;
    },
  });

  /* ---------- Transferencias ---------- */
  function trK() { return (window.MCTransferencias && window.MCTransferencias._t) || {}; }
  register("transferencias", {
    listHash: "#/m/transferencias",
    itemHash: function (id) { return "#/m/transferencias/t/" + encodeURIComponent(id); },
    match: function (route) { return !!(route && route.kind === "mod" && route.mod === "transferencias" && route.sub === "t" && route.id && window.MCTransferencias); },
    sel: function (route) { return String((route && route.id) || ""); },
    onList: function () { return !!(document.getElementById("mctr-q") && document.getElementById("mctr-body") && !document.getElementById("ss-md-transferencias")); },
    items: function () { return trK().list || []; },
    hasItems: function () { return !!((trK().list || []).length); },
    itemId: function (t) { return t && t.id; },
    title: function (t) { return (t && t.numero) || "—"; },
    subtitle: function (t) { return ((t && t.origenNombre) || "—") + " → " + ((t && t.destinoNombre) || "—"); },
    pills: function (t) { return t && t.estado ? '<span class="tk-pill">' + esc(t.estado) + "</span>" : ""; },
    blob: function (t) { return [t.id, t.numero, t.origenNombre, t.destinoNombre, t.estado].join(" "); },
    renderDetail: function (route) { return window.MCTransferencias.render(route); },
    wireDetail: function (main, route) { if (window.MCTransferencias) window.MCTransferencias.wire(main, route); },
    ensureItems: async function () {
      if ((trK().list || []).length) return true;
      if (window.MCTransferencias && window.MCTransferencias.ensureList) return window.MCTransferencias.ensureList();
      return false;
    },
  });

  /* ---------- Ajustes de stock ---------- */
  function ajK() { return (window.MCAjustes && window.MCAjustes._a) || {}; }
  register("ajustes", {
    listHash: "#/m/ajustes",
    itemHash: function (id) { return "#/m/ajustes/a/" + encodeURIComponent(id); },
    match: function (route) { return !!(route && route.kind === "mod" && route.mod === "ajustes" && route.sub === "a" && route.id && window.MCAjustes); },
    sel: function (route) { return String((route && route.id) || ""); },
    onList: function () { return !!(document.getElementById("mcaj-q") && document.getElementById("mcaj-body") && !document.getElementById("ss-md-ajustes")); },
    items: function () { return ajK().list || []; },
    hasItems: function () { return !!((ajK().list || []).length); },
    itemId: function (a) { return a && a.id; },
    title: function (a) { return (a && a.numero) || "—"; },
    subtitle: function (a) { return [a && a.bodegaNombre, a && a.motivo].filter(Boolean).join(" · ") || "—"; },
    pills: function (a) { return a && a.estado ? '<span class="tk-pill">' + esc(a.estado) + "</span>" : ""; },
    blob: function (a) { return [a.id, a.numero, a.bodegaNombre, a.motivo, a.estado].join(" "); },
    renderDetail: function (route) { return window.MCAjustes.render(route); },
    wireDetail: function (main, route) { if (window.MCAjustes) window.MCAjustes.wire(main, route); },
    ensureItems: async function () {
      if ((ajK().list || []).length) return true;
      if (window.MCAjustes && window.MCAjustes.ensureList) return window.MCAjustes.ensureList();
      return false;
    },
  });

  /* ---------- Conteos físicos ---------- */
  function cfK() { return (window.MCConteo && window.MCConteo._c) || {}; }
  register("conteos", {
    listHash: "#/m/conteos",
    itemHash: function (id) { return "#/m/conteos/cf/" + encodeURIComponent(id); },
    match: function (route) { return !!(route && route.kind === "mod" && route.mod === "conteos" && route.sub === "cf" && route.id && window.MCConteo); },
    sel: function (route) { return String((route && route.id) || ""); },
    onList: function () { return !!(document.getElementById("mccf-q") && document.getElementById("mccf-body") && !document.getElementById("ss-md-conteos")); },
    items: function () { return cfK().list || []; },
    hasItems: function () { return !!((cfK().list || []).length); },
    itemId: function (c) { return c && c.id; },
    title: function (c) { return (c && c.numero) || "—"; },
    subtitle: function (c) { return (c && (c.bodegaNombre || c.asignadoA)) || "—"; },
    pills: function (c) { return c && c.estado ? '<span class="tk-pill">' + esc(c.estado) + "</span>" : ""; },
    blob: function (c) { return [c.id, c.numero, c.bodegaNombre, c.asignadoA, c.estado, c.nota].join(" "); },
    renderDetail: function (route) { return window.MCConteo.render(route); },
    wireDetail: function (main, route) { if (window.MCConteo) window.MCConteo.wire(main, route); },
    ensureItems: async function () {
      if ((cfK().list || []).length) return true;
      if (window.MCConteo && window.MCConteo.ensureList) return window.MCConteo.ensureList();
      return false;
    },
  });

  /* ---------- Inventario (ficha de stock) ---------- */
  register("inventario", {
    listHash: "#/m/inventario",
    itemHash: function (id) { return "#/m/inventario/prod/" + encodeURIComponent(id); },
    match: function (route) { return !!(route && route.kind === "mod" && route.mod === "inventario" && route.sub === "prod" && route.id); },
    sel: function (route) { return String((route && route.id) || ""); },
    onList: function () { return !!(document.getElementById("inv-q") && !document.getElementById("ss-md-inventario")); },
    items: function () { return window._invRows || []; },
    hasItems: function () { return !!((window._invRows || []).length); },
    itemId: function (p) { return p && p.id; },
    title: function (p) { return (p && p.sku) || "—"; },
    subtitle: function (p) { return (p && p.nombre) || "Sin nombre"; },
    amount: function (p) {
      var n = Number(p && (p.stock != null ? p.stock : p.cantidad));
      return isNaN(n) ? "" : String(Math.round(n) === n ? n : n.toFixed(2));
    },
    blob: function (p) { return [p.id, p.sku, p.nombre, p.marca, p.categoria].join(" "); },
    renderDetail: function (route) { return typeof renderInventarioFicha === "function" ? renderInventarioFicha(route, true) : ""; },
    wireDetail: function (main) { if (typeof wireInventario === "function") wireInventario(main); },
    ensureItems: async function () {
      if ((window._invRows || []).length) return true;
      if (typeof api !== "function") return false;
      try {
        var data = await api("prod_list");
        if (data && !data.error) { window._invRows = data.items || []; return true; }
      } catch (e) {}
      return false;
    },
  });


  window.MCMaestro = {
    wide: wide,
    register: register,
    which: matchMod,
    shellHTML: shellHTML,
    listRowsHTML: listRowsHTML,
    render: render,
    after: after,
    interceptDraw: interceptDraw,
    paintList: paintList,
    money: money,
    // alias para tickets (TK46)
    renderTickets: function (route) { return render("tickets", route); },
    afterTickets: function (main, route) { return after("tickets", main, route); },
    rememberHash: function () { prevHash = location.hash || ""; },
  };
})();
