/* Lista compacta a la izquierda + detalle a la derecha, como en MineCore, con el tema Sunsu.
   Escritorio (≥861 px): panel de ~250 px con «Filtrar…»; al elegir un registro se abre a la derecha
   y el hash cambia para que el enlace se pueda compartir. La lista conserva su scroll y su filtro.
   iPhone: la lista va primero a ancho completo; al tocar, el detalle ocupa toda la pantalla con ← Volver.
   Sin scroll horizontal. Reutilizable: primero Tickets, después Clientas y Proveedores. */
(function () {
  var Q = { tickets: "" };
  var scroll = { tickets: 0 };
  var prevHash = "";
  var ignoring = false;

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
  function dirty() {
    return !!(window.MCTickets && window.MCTickets.isDirty && window.MCTickets.isDirty());
  }
  function confirmLeave() {
    return !dirty() || confirm("Hay cambios sin guardar. ¿Salir igual?");
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

  function tkClave(t) {
    if (window.MCTickets && window.MCTickets.claveDe) return window.MCTickets.claveDe(t);
    return (t && t.so_num) || (t && t.tkRow ? "r" + t.tkRow : "");
  }
  function tkNombre(t) {
    return (((t && t.nombre) || "") + " " + ((t && t.apellido) || "")).trim() || "—";
  }
  function tkTotal(t) {
    if (typeof _histMontos === "function") return _histMontos(t).tot;
    return parseFloat(t && (t.estimado != null ? t.estimado : t.total)) || 0;
  }
  function tkMatch(t, q) {
    if (!q) return true;
    var toks = norm(q).split(/\s+/).filter(Boolean);
    var blob = norm([tkClave(t), t.so_num, t.beta_num, t.nombre, t.apellido, t.cosmetologa, t.cedula, t.factura, t.fac_7].join(" "));
    for (var i = 0; i < toks.length; i++) if (blob.indexOf(toks[i]) < 0) return false;
    return true;
  }
  function tkItems() {
    var L = window._histVisibles || window._histData || [];
    return L.filter(function (t) { return tkMatch(t, Q.tickets); });
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

  function listRowsHTML(sel) {
    var L = tkItems();
    if (!L.length) return '<div class="ss-md-empty">Sin resultados</div>';
    return L.map(function (t) {
      var id = tkClave(t);
      var on = id === sel;
      var tip = tkStatusTip(t);
      return '<button type="button" class="ss-md-item' + (on ? " on" : "") + tkStatusClass(t) + '" data-ss-md-id="' + esc(id) + '"' + (tip ? ' title="' + esc(tip) + '"' : "") + ">"
        + '<div class="ss-md-l1"><b>' + esc(t.so_num || id || "—") + '</b><span class="ss-md-amt">' + money(tkTotal(t)) + "</span></div>"
        + '<div class="ss-md-l2">' + esc(tkNombre(t)) + "</div>"
        + (tkPills(t) ? '<div class="ss-md-l3">' + tkPills(t) + "</div>" : "")
        + "</button>";
    }).join("");
  }

  function saveListScroll() {
    var lb = document.getElementById("ss-md-tickets-lb");
    if (lb) scroll.tickets = lb.scrollTop;
  }
  function restoreListScroll() {
    var lb = document.getElementById("ss-md-tickets-lb");
    if (lb) lb.scrollTop = scroll.tickets || 0;
  }
  function paintList(sel) {
    var lb = document.getElementById("ss-md-tickets-lb");
    if (!lb) return;
    var st = lb.scrollTop;
    lb.innerHTML = listRowsHTML(sel);
    lb.scrollTop = st;
  }
  function setTitle(title) {
    if (!title) return;
    var h1 = document.querySelector("#app .top h1");
    if (h1) h1.textContent = title;
  }
  function wireList(root) {
    if (!root) return;
    var q = root.querySelector("#ss-md-tickets-q");
    if (q && !q._ssMd) {
      q._ssMd = true;
      q.addEventListener("input", function () {
        Q.tickets = q.value;
        var route = typeof parseRoute === "function" ? parseRoute() : {};
        paintList(route.id || "");
      });
    }
    var full = root.querySelector("[data-ss-md-full='tickets']");
    if (full) {
      full.onclick = function () {
        if (!confirmLeave()) return;
        if (typeof go === "function") go("#/m/tickets");
      };
    }
    var lb = root.querySelector("#ss-md-tickets-lb");
    if (lb && !lb._ssMd) {
      lb._ssMd = true;
      lb.addEventListener("click", function (ev) {
        var it = ev.target.closest("[data-ss-md-id]");
        if (!it) return;
        var id = it.getAttribute("data-ss-md-id");
        if (!id) return;
        var cur = typeof parseRoute === "function" ? (parseRoute().id || "") : "";
        if (id === cur) return;
        if (!confirmLeave()) return;
        saveListScroll();
        prevHash = location.hash || "";
        if (typeof go === "function") go("#/m/tickets/t/" + encodeURIComponent(id));
      });
    }
  }

  async function ensureHist() {
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
  }

  async function renderTickets(route) {
    var sel = String(route.id || "");
    var detail = "";
    try { detail = await window.MCTickets.render(route); }
    catch (e) { detail = '<p class="err">' + esc((e && e.message) || e) + "</p>"; }
    var list = (window._histData || []).length ? listRowsHTML(sel) : '<div class="ss-md-empty">Cargando lista…</div>';
    return shellHTML("tickets", list, detail || "");
  }

  async function afterTickets(main, route) {
    var sel = String(route.id || "");
    if (window.MCTickets) window.MCTickets.wire(main, route);
    wireList(main);
    restoreListScroll();
    if (!(window._histData || []).length) {
      await ensureHist();
      paintList(sel);
      restoreListScroll();
    }
    prevHash = location.hash || "";
  }

  async function swapDetail(route, title) {
    var pane = document.getElementById("ss-md-tickets-r");
    if (!pane) return false;
    setTitle(title);
    pane.innerHTML = '<p class="note">Cargando…</p>';
    try { pane.innerHTML = await window.MCTickets.render(route); }
    catch (e) { pane.innerHTML = '<p class="err">' + esc((e && e.message) || e) + "</p>"; }
    var main = document.getElementById("main") || pane.closest("#main, .main") || document;
    if (window.MCTickets) window.MCTickets.wire(main, route);
    paintList(String(route.id || ""));
    restoreListScroll();
    wireList(main);
    prevHash = location.hash || "";
    return true;
  }

  async function interceptDraw(route, opts) {
    if (!(route && route.kind === "mod" && route.mod === "tickets" && route.sub === "t" && route.id)) return false;
    if (!wide() || !window.MCTickets) return false;
    if (ignoring) { ignoring = false; return true; }
    var title = opts && opts.title;
    if (document.getElementById("ss-md-tickets") && document.getElementById("app")) {
      return swapDetail(route, title);
    }
    // Ya estamos en el historial (misma sesión): no reconstruir el chrome, solo pasar al split.
    if (document.getElementById("hist-res") && document.getElementById("app") && document.getElementById("main")) {
      var main = document.getElementById("main");
      setTitle(title);
      main.innerHTML = (typeof banner === "function" ? banner() : "") + await renderTickets(route);
      await afterTickets(main, route);
      return true;
    }
    return false;
  }

  window.MCMaestro = {
    wide: wide,
    shellHTML: shellHTML,
    listRowsHTML: listRowsHTML,
    renderTickets: renderTickets,
    afterTickets: afterTickets,
    interceptDraw: interceptDraw,
    paintList: paintList,
    rememberHash: function () { prevHash = location.hash || ""; },
  };
})();
