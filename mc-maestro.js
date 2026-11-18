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
  function tkPills(t) {
    var html = "";
    try {
      if (typeof _tkPagoPill === "function") html += _tkPagoPill(t) || "";
      if (typeof _tkForma === "function" && typeof _tkFormaPill === "function") {
        var fp = _tkForma(t);
        if (fp) html += _tkFormaPill(fp);
      }
    } catch (e) {}
    return html;
  }
  function tkStatusClass(t) {
    var Lf = (window._tkLeds || {})[String(t && t.tkRow)];
    var fl = Lf && Lf.flag;
    var fa = !fl && Lf && Lf.falta && Lf.falta.length;
    if (fl) return " ss-md-flag";
    if (fa) return " ss-md-falta";
    return "";
  }
  function tkStatusTip(t) {
    var Lf = (window._tkLeds || {})[String(t && t.tkRow)];
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
      if (typeof api !== "function") return false;
      try {
        var q = window._tkQ || { desde: "", hasta: "", cosm: "", q: "" };
        var r = await api("tk_historial", { desde: q.desde || "", hasta: q.hasta || "", cosm: q.cosm || "", q: q.q || "", offset: 0, limit: Math.max(50, window._tkLim || 50) });
        if (r && r.ok) {
          window._histData = r.items || [];
          window._histVisibles = window._histData;
          window._tkLeds = window._tkLeds || {};
          (r.items || []).forEach(function (it) { if (it.led) window._tkLeds[String(it.tkRow)] = it.led; });
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

  window.MCMaestro = {
    wide: wide,
    register: register,
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
