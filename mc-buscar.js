// Buscador común de la beta (Emilia 17/11): sin distinguir mayúsculas ni tildes, parcial, y el SKU
// con o sin guion/espacios («ml», «ml0», «ML 00» encuentran ML-001). Ordena: SKU exacto, SKU que
// empieza así, SKU que lo contiene, y después nombre/marca/código. También reemplaza la lista nativa
// de cualquier <input list="…"> por una lista propia con esta búsqueda (iPhone filtra solo por inicio).
(function () {
  function norm(v) { return String(v == null ? "" : v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function compacto(v) { return norm(v).replace(/[^a-z0-9]/g, ""); }
  /** Puntaje >0 si coincide. codigos = SKU/códigos (texto o lista); textos = nombre, marca, etc. */
  function puntaje(q, codigos, textos) {
    var qn = norm(q).trim();
    if (!qn) return 1;
    var qc = compacto(qn);
    var C = [].concat(codigos || []).filter(function (x) { return x != null && x !== ""; });
    var T = [].concat(textos || []).filter(function (x) { return x != null && x !== ""; });
    var best = 0;
    if (qc) C.forEach(function (c) {
      var cc = compacto(c), sinPref = cc.replace(/^sunsu/, "");
      if (cc === qc || sinPref === qc) best = Math.max(best, 100);
      else if (cc.indexOf(qc) === 0 || sinPref.indexOf(qc) === 0) best = Math.max(best, 80);
      else if (cc.indexOf(qc) >= 0) best = Math.max(best, 60);
    });
    if (best) return best;
    var hay = norm(C.concat(T).join(" "));
    var ws = qn.split(/\s+/).filter(Boolean);
    var toks = hay.split(/[^a-z0-9]+/).filter(Boolean);
    function palabraOk(w) {
      if (!w) return true;
      if (hay.indexOf(w) >= 0) return true;
      if (w.length > 3 && w.charAt(w.length - 1) === "s" && hay.indexOf(w.slice(0, -1)) >= 0) return true;
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i];
        if (t.indexOf(w) === 0) return true;
        if (w.length >= 4 && t.length >= 4 && w.indexOf(t) === 0) return true;
      }
      return false;
    }
    function dist(a, b) {
      if (a === b) return 0;
      if (Math.abs(a.length - b.length) > 1) return 99;
      var i, j, prev = [], cur;
      for (j = 0; j <= b.length; j++) prev[j] = j;
      for (i = 1; i <= a.length; i++) {
        cur = [i];
        for (j = 1; j <= b.length; j++) {
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        }
        prev = cur;
      }
      return prev[b.length];
    }
    var miss = ws.filter(function (w) { return !palabraOk(w); });
    var ok = ws.filter(function (w) { return palabraOk(w); });
    if (ws.length && !miss.length) return 40 + (norm(T[0] || "").indexOf(ws[0]) === 0 ? 5 : 0);
    if (miss.length === 1 && miss[0].length >= 3 && toks.some(function (t) { return t.length >= 3 && dist(miss[0], t) <= 1; })) return 35;
    // Una palabra puede fallar si las demás ya identifican el producto (p. ej. «AC Solutions Fab» → AC Solution Swab).
    if (miss.length === 1 && ok.some(function (w) { return w.length >= 4; })) return 28;
    if (qc.length >= 2 && T.some(function (t) { return compacto(t).indexOf(qc) >= 0; })) return 30;
    return 0;
  }
  function coincide(q, codigos, textos) { return puntaje(q, codigos, textos) > 0; }
  /** Filtra y ordena por puntaje (estable). f(item) → [codigos, textos]. */
  function filtrar(lista, q, f) {
    if (!norm(q).trim()) return (lista || []).slice();
    return (lista || []).map(function (it, i) { var ct = f(it); return { it: it, i: i, p: puntaje(q, ct[0], ct[1]) }; })
      .filter(function (x) { return x.p > 0; })
      .sort(function (a, b) { return b.p - a.p || a.i - b.i; })
      .map(function (x) { return x.it; });
  }
  /** Texto libre «SKU · nombre»: separa un código al inicio para puntuarlo como SKU. */
  function partes(txt) {
    var s = String(txt == null ? "" : txt), m = s.match(/^\s*([A-Za-z]{1,6}[-\s]?\d{1,6}|\d{1,4}|SUNSU-[A-Z0-9-]+)\b/);
    return m ? [[m[1]], [s]] : [[], [s]];
  }

  // ---- Lista propia para <input list> ----
  var css = false;
  function ponerCss() {
    if (css) return; css = true;
    var s = document.createElement("style");
    s.textContent = ".mcb-l{position:absolute;z-index:9999;background:#fff;border:1.5px solid #e5dccb;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);max-height:260px;overflow:auto;font-size:.82rem;min-width:220px}" +
      ".mcb-l div{padding:8px 10px;cursor:pointer;border-bottom:1px solid #f3efe6}.mcb-l div:hover,.mcb-l div.on{background:#f7f2e8}.mcb-l small{color:#888;margin-left:6px}";
    document.head.appendChild(s);
  }
  var abierta = null;
  function cerrar() { if (abierta) { abierta.l.remove(); abierta = null; } }
  function opciones(inp) {
    var dl = document.getElementById(inp.getAttribute("data-mcb-dl") || "");
    if (!dl) return [];
    return [].map.call(dl.querySelectorAll("option"), function (o) { return { v: o.value, t: o.textContent || o.label || "" }; });
  }
  function pintar(inp) {
    ponerCss();
    var ops = opciones(inp), q = inp.value;
    var hits = filtrar(ops, q, function (o) { var p = partes(o.v); return [p[0].concat(partes(o.t)[0]), p[1].concat([o.t])]; }).slice(0, 40);
    if (!hits.length || (hits.length === 1 && hits[0].v === q)) { cerrar(); return; }
    var l = abierta && abierta.inp === inp ? abierta.l : document.createElement("div");
    l.className = "mcb-l";
    l.innerHTML = hits.map(function (o, i) { return '<div data-i="' + i + '">' + esc(o.v) + (o.t && o.t !== o.v ? "<small>" + esc(o.t) + "</small>" : "") + "</div>"; }).join("");
    var r = inp.getBoundingClientRect();
    l.style.left = (r.left + window.scrollX) + "px"; l.style.top = (r.bottom + window.scrollY + 2) + "px"; l.style.width = Math.max(r.width, 220) + "px";
    if (!abierta || abierta.inp !== inp) { cerrar(); document.body.appendChild(l); }
    abierta = { inp: inp, l: l, hits: hits, sel: -1 };
    l.onmousedown = function (ev) { ev.preventDefault(); };
    l.onclick = function (ev) { var d = ev.target.closest("[data-i]"); if (d) elegir(inp, hits[+d.getAttribute("data-i")]); };
  }
  function elegir(inp, o) {
    if (!o) return;
    inp.value = o.v; cerrar();
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function esc(v) { return String(v).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function preparar(inp) {
    if (!inp || inp.tagName !== "INPUT") return false;
    if (inp.hasAttribute("list")) { inp.setAttribute("data-mcb-dl", inp.getAttribute("list")); inp.removeAttribute("list"); inp.setAttribute("autocomplete", "off"); }
    return inp.hasAttribute("data-mcb-dl");
  }
  document.addEventListener("focusin", function (ev) { if (preparar(ev.target)) pintar(ev.target); }, true);
  document.addEventListener("input", function (ev) { if (ev.isTrusted !== false && preparar(ev.target)) pintar(ev.target); }, true);
  document.addEventListener("keydown", function (ev) {
    if (!abierta || ev.target !== abierta.inp) return;
    var a = abierta, n = a.hits.length;
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); a.sel = (a.sel + (ev.key === "ArrowDown" ? 1 : -1) + n) % n; [].forEach.call(a.l.children, function (d, i) { d.className = i === a.sel ? "on" : ""; }); }
    else if (ev.key === "Enter" && a.sel >= 0) { ev.preventDefault(); elegir(a.inp, a.hits[a.sel]); }
    else if (ev.key === "Escape") cerrar();
  }, true);
  document.addEventListener("focusout", function (ev) { if (abierta && ev.target === abierta.inp) setTimeout(cerrar, 150); }, true);
  window.addEventListener("hashchange", cerrar);

  window.MCBuscar = { norm: norm, compacto: compacto, puntaje: puntaje, coincide: coincide, filtrar: filtrar, partes: partes };
})();
