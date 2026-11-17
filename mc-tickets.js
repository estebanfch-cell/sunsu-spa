// Detalle de ticket estilo orden de venta de MineCore (beta, 0048). Lo abre la lista de tickets.
// Admin edita en línea y guarda; los demás arman el cambio y lo piden (Solicitudes). Lector de código de
// barras (USB/Bluetooth = teclado + Enter) en «Agregar producto».
(function () {
  var K = { d: null, cat: null, dirty: false, L: null, desc: null, promo: "", exclC: false, exclN: "" };
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v); }
  function r2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
  function $m(v) { return "$" + r2(v).toFixed(2); }
  function q2(v) { return r2(v) + ""; }
  function opt(v, t, sel) { return '<option value="' + e(v) + '"' + (String(v) === String(sel == null ? "" : sel) ? " selected" : "") + ">" + e(t) + "</option>"; }
  function fecha(f, h) { return f ? f.split("-").reverse().join("/") + (h ? " " + h : "") : ""; }
  function fechaIso(v) { var d = new Date(v); if (isNaN(d)) return String(v || ""); var z = new Date(d.getTime() - 5 * 3600000).toISOString(); return z.slice(8, 10) + "/" + z.slice(5, 7) + "/" + z.slice(0, 4) + " " + z.slice(11, 16); }
  var TIPO = { producto: "Producto", facial: "Facial", extra: "Servicio", paquete: "Paquete", gift: "Gift card", servicio: "Servicio" };
  function toast2(msg, mal) { if (typeof toast === "function") { try { toast(msg, mal ? "#B86B6B" : undefined); return; } catch (x) {} } alert(msg); }
  function beep(ok) {
    try {
      var A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      var c = K.ac || (K.ac = new A()), o = c.createOscillator(), g = c.createGain();
      o.frequency.value = ok ? 1320 : 220; o.type = ok ? "sine" : "square"; g.gain.value = 0.08;
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + (ok ? 0.09 : 0.25));
    } catch (x) {}
  }
  function css() {
    if (window.MCConteo && window.MCConteo._css) window.MCConteo._css();
    if (document.getElementById("mctk-css")) return;
    var s = document.createElement("style"); s.id = "mctk-css";
    s.textContent = [
      ".mctk-h{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.mctk-h h2{margin:0;font-size:1.25rem}.mctk-meta{color:var(--gray);font-size:.8rem;margin-top:3px}",
      ".mctk-leds{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.mctk-led{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:3px 10px;font-size:.7rem;font-weight:800;background:var(--gray-l);color:var(--navy-d)}",
      ".mctk-led:before{content:'';width:8px;height:8px;border-radius:50%;background:#aaa}.mctk-led.ok:before{background:#2e9e4f}.mctk-led.r:before{background:#d9534f}.mctk-led.c:before{background:#e0a800}.mctk-led.a:before{background:#4a74c9}.mctk-led.x:before{background:#666}.mctk-led.off:before{background:#ccc}",
      ".mctk-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.mctk-acts[hidden],.mctk-dd[hidden]{display:none}.mctk-menu{position:relative}.mctk-dd{position:absolute;right:0;top:100%;margin-top:4px;background:var(--white,#fff);border:1px solid var(--cream-d);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);min-width:240px;z-index:50;padding:4px}",
      ".mctk-dd a,.mctk-dd button{display:block;width:100%;text-align:left;padding:8px 10px;border:none;background:none;font:inherit;font-size:.8rem;color:var(--navy-d);text-decoration:none;cursor:pointer;border-radius:7px}.mctk-dd a:hover,.mctk-dd button:hover{background:var(--cream)}",
      ".mctk-t input,.mctk-t select{padding:5px 6px;border:1.5px solid var(--cream-d);border-radius:7px;font:inherit;font-size:.8rem}.mctk-t .q{width:58px;text-align:right}.mctk-t .p{width:80px;text-align:right}.mctk-t .dv{width:58px;text-align:right}",
      ".mctk-tot{display:grid;grid-template-columns:1fr auto;gap:4px 18px;max-width:360px;margin-left:auto;font-size:.88rem}.mctk-tot b{text-align:right}.mctk-tot .big{font-size:1.2rem;color:var(--navy-d)}",
      ".mctk-flash{animation:mctkf .6s}@keyframes mctkf{0%{background:#c9f2d3}100%{background:transparent}}.mctk-flash-bad{animation:mctkb .6s}@keyframes mctkb{0%{background:#f9d0cc}100%{background:transparent}}",
      ".mctk-scan{display:flex;gap:8px;align-items:center}.mctk-scan input{flex:1;padding:9px 11px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit}.mctk-est{font-size:.62rem;background:#fff3d6;color:#9a6b00;border-radius:6px;padding:1px 5px;margin-left:4px}",
      ".mctk-dlg{position:fixed;inset:0;background:rgba(20,30,50,.35);display:flex;align-items:center;justify-content:center;z-index:9999}.mctk-box{background:var(--white,#fff);border-radius:14px;padding:16px;width:min(520px,94vw);max-height:88vh;overflow:auto}",
      ".mctk-box label{display:flex;gap:8px;align-items:center;font-size:.84rem;margin:6px 0}.mctk-box textarea,.mctk-box input[type=text]{width:100%;box-sizing:border-box;padding:8px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit}",
      ".mctk-xc{color:#b2452a;font-size:.68rem;font-weight:800}",
    ].join("");
    document.head.appendChild(s);
  }

  // ---------- cálculo en vivo (mismo que ticket_beta.ts) ----------
  function descDe(base, tipo, valor) { valor = Number(valor) || 0; if (!(base > 0) || !(valor > 0)) return 0; if (tipo === "%") return r2(base * Math.min(100, valor) / 100); if (tipo === "$") return r2(Math.min(base, valor)); return 0; }
  function promoMonto(p, L) {
    if (!p) return 0;
    var cods = (p.codigos || []).map(function (c) { return String(c).toUpperCase().replace(/^SUNSU-/, ""); }), u = [];
    L.forEach(function (l) { var c = String(l.sku).toUpperCase().replace(/^SUNSU-/, ""); if (cods.length && cods.indexOf(c) < 0) return; for (var i = 0; i < Math.round(l.cantidad); i++) u.push({ p: l.cantidad ? l.total_linea / l.cantidad : 0, pack: l.tipo === "paquete" }); });
    var sum = u.reduce(function (a, x) { return a + x.p; }, 0), t = String(p.tipo || "%").toUpperCase(), m = 0;
    if (t === "$") m = Math.min(Number(p.valor) || 0, sum);
    else if (t === "NXM") { var N = Math.round(p.valor), M = Math.round(p.valor2); if (N >= 2 && M >= 1 && M < N) { var ps = u.map(function (x) { return x.p; }).sort(function (a, b) { return b - a; }); var lib = Math.floor(ps.length / N) * (N - M); for (var i = ps.length - lib; i < ps.length; i++) m += ps[i]; } }
    else if (t === "PACK") u.forEach(function (x) { if (x.pack) m += Math.max(0, x.p - (Number(p.valor) || 0)); });
    else m = sum * (Number(p.valor) || 0) / 100;
    return r2(m);
  }
  function calc() {
    var L = K.L.map(function (l) { var br = r2(l.cantidad * l.precio_unit), dm = descDe(br, l.descuento_tipo, l.descuento_valor); l.descuento_monto = dm; l.total_linea = r2(br - dm); return l; });
    var suma = r2(L.reduce(function (a, l) { return a + l.total_linea; }, 0));
    var pr = (K.d.promos || []).find(function (p) { return p.nombre === K.promo; }) || (K.promo && K.promo === K.d.promo ? { tipo: "$", valor: K.d.totales.promo, codigos: [] } : null);
    var pm = Math.min(suma, promoMonto(pr, L)), base = r2(suma - pm), dt = descDe(base, K.desc.tipo, K.desc.valor), tot = r2(base - dt), sub = r2(tot / 1.15);
    return { suma: suma, promo: pm, desc: dt, total: tot, subtotal: sub, iva: r2(tot - sub) };
  }

  // ---------- pintar ----------
  function lineasHtml() {
    calc(); // deja total_linea al día antes de pintar
    if (!K.L.length) return '<tr><td colspan="9" class="mccf-sub" style="padding:14px">Sin líneas. Agrega productos o servicios arriba.</td></tr>';
    return K.L.map(function (l, i) {
      return '<tr data-i="' + i + '" class="mctk-ln"><td><span class="mccf-chip">' + e(TIPO[l.tipo] || l.tipo) + '</span></td><td><span class="mccf-sku">' + e(l.sku) + "</span></td><td>" + e(l.nombre) + (l.estimado ? '<span class="mctk-est" title="Precio prorrateado del total cobrado">estimado</span>' : "") + (l.excluir_comision ? ' <span class="mctk-xc">sin comisión</span>' : "") + "</td>" +
        '<td class="num"><input class="q" type="number" min="0" step="any" data-f="cantidad" value="' + e(q2(l.cantidad)) + '"></td>' +
        '<td class="num"><input class="p" type="number" min="0" step="0.01" data-f="precio_unit" value="' + e(r2(l.precio_unit).toFixed(2)) + '"></td>' +
        '<td class="num" style="white-space:nowrap"><select data-f="descuento_tipo">' + opt("", "—", l.descuento_tipo || "") + opt("%", "%", l.descuento_tipo) + opt("$", "$", l.descuento_tipo) + '</select> <input class="dv" type="number" min="0" step="any" data-f="descuento_valor" value="' + e(l.descuento_valor ? q2(l.descuento_valor) : "") + '"></td>' +
        '<td class="num" data-tl>' + e($m(l.total_linea)) + "</td>" + '<td><button class="mccf-ne" type="button" data-del="' + i + '">Quitar</button></td></tr>';
    }).join("");
  }
  function totHtml() {
    var c = calc(), d = K.d;
    return '<div class="mctk-tot"><span>Suma de líneas</span><b>' + $m(c.suma) + "</b>" + (c.promo ? "<span>Promoción " + e(K.promo) + "</span><b>−" + $m(c.promo) + "</b>" : "") + (c.desc ? "<span>Descuento del ticket</span><b>−" + $m(c.desc) + "</b>" : "") +
      "<span>Subtotal sin IVA</span><b>" + $m(c.subtotal) + "</b><span>IVA 15%</span><b>" + $m(c.iva) + '</b><span class="big">Total</span><b class="big">' + $m(c.total) + "</b>" +
      (Math.abs(c.total - d.ticket.cobradoSistema) > 0.009 ? '<span class="mccf-sub">Cobrado en el sistema</span><b class="mccf-sub">' + $m(d.ticket.cobradoSistema) + "</b>" : "") + "</div>";
  }
  function docsHtml() {
    var d = K.d, t = d.ticket, h = "";
    if (t.sheetRow) h += '<button type="button" data-doc="tarjeta">📄 Tarjeta del tratamiento (PDF)</button>';
    (d.documentos || []).forEach(function (x) { h += '<a href="' + e(x.url) + '" target="_blank" rel="noopener">' + (x.tipo === "foto" ? "🖼️ " : "🧾 ") + e(x.nombre) + "</a>"; });
    return h || '<div class="mccf-sub" style="padding:8px">Sin documentos adjuntos.</div>';
  }
  function html() {
    var d = K.d, t = d.ticket;
    var nombre = (t.nombre + " " + t.apellido).trim() || "Sin nombre";
    return '<div id="mctk-root">' + (d.falta ? '<p class="err">' + e(d.falta) + "</p>" : "") +
      '<p><button class="btn ghost small" type="button" id="mctk-volver">' + (sessionStorage.getItem("mctk.volver") ? "← Volver a la clienta" : "← Volver a la lista") + '</button></p>' +
      '<div class="mccf-card"><div class="mctk-h"><div><h2>' + e(nombre) + '</h2><div class="mctk-meta">Ticket <b>' + e(t.soNum || t.betaNum || ("#" + t.sheetRow)) + "</b>" + (t.sheetRow ? " · orden " + e(t.sheetRow) : "") + " · " + e(fecha(t.fecha, t.hora)) + " · atendió <b>" + e(t.cosmetologa || "—") + "</b>" + (t.cedula ? " · CI " + e(t.cedula) : "") + "</div>" +
      '<div class="mctk-leds">' + t.leds.map(function (l) { return '<span class="mctk-led ' + e(l.c) + '">' + e(l.t) + "</span>"; }).join("") + "</div></div>" +
      '<div class="mctk-acts"><div class="mctk-menu"><button class="btn ghost small" type="button" id="mctk-docs">Documentos ▾</button><div class="mctk-dd" id="mctk-dd" hidden>' + docsHtml() + "</div></div>" +
      '<button class="btn ghost small" type="button" id="mctk-excl">Excluir comisión</button></div></div>' +
      (t.notas ? '<p class="mccf-sub" style="margin:10px 0 0"><b>Notas:</b> ' + e(t.notas) + "</p>" : "") + (t.recomendaciones ? '<p class="mccf-sub" style="margin:4px 0 0"><b>Recomendaciones:</b> ' + e(t.recomendaciones) + "</p>" : "") +
      (d.excluirCosmetologa ? '<p class="mccf-note">Comisión excluida para ' + e(t.cosmetologa) + (d.excluirNota ? ": " + e(d.excluirNota) : "") + "</p>" : "") + "</div>" +
      '<div class="mccf-card"><b>Agregar producto</b> <span class="mccf-sub">· busca por nombre o SKU, o escanea el código de barras</span><div class="mctk-scan" style="margin-top:8px"><input type="search" id="mctk-q" placeholder="Buscar o escanear: productos, faciales, servicios, paquetes" autocomplete="off"></div><div class="mccf-hits" id="mctk-hits" hidden></div>' +
      '<div class="sheet-scroll" style="margin-top:10px"><table class="mccf-t mctk-t"><thead><tr><th>Tipo</th><th>SKU</th><th>Producto / servicio</th><th class="num">Cant.</th><th class="num">P. unit. (con IVA)</th><th class="num">Descuento</th><th class="num">Total línea</th><th></th></tr></thead><tbody id="mctk-lin">' + lineasHtml() + "</tbody></table></div>" +
      '<div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:space-between;margin-top:12px"><div class="mccf-form" style="min-width:260px;flex:1;max-width:420px">' +
      '<label>Promoción<select id="mctk-promo">' + opt("", "Sin promoción", K.promo) + (d.promos || []).map(function (p) { return opt(p.nombre, p.nombre, K.promo); }).join("") + (K.promo && !(d.promos || []).some(function (p) { return p.nombre === K.promo; }) ? opt(K.promo, K.promo + " (ya no vigente)", K.promo) : "") + "</select></label>" +
      '<label>Descuento del ticket<span style="display:flex;gap:6px"><select id="mctk-dt">' + opt("", "—", K.desc.tipo || "") + opt("%", "%", K.desc.tipo) + opt("$", "$", K.desc.tipo) + '</select><input id="mctk-dv" type="number" min="0" step="any" value="' + e(K.desc.valor ? q2(K.desc.valor) : "") + '" style="flex:1"></span></label></div><div id="mctk-tot" style="flex:1">' + totHtml() + "</div></div>" +
      '<p class="err" id="mctk-err"></p><div class="mctk-acts" id="mctk-save"' + (K.dirty ? "" : " hidden") + '>' + (d.puedeEditar ? '<button class="btn small" type="button" id="mctk-guardar">Guardar cambios</button>' : '<button class="btn small" type="button" id="mctk-pedir">Solicitar cambio</button>') + '<button class="btn ghost small" type="button" id="mctk-descartar">Descartar</button></div></div>' +
      '<div class="mccf-card"><b>Historial</b>' + ((d.historial || []).length ? '<ul class="mctr-log">' + d.historial.slice().reverse().map(function (h) { return "<li>" + e(fechaIso(h.fecha)) + " · <b>" + e(h.accion) + "</b> · " + e(h.detalle) + " · " + e(h.actor) + (h.total != null ? " · total " + $m(h.total) : "") + "</li>"; }).join("") + "</ul>" : '<p class="mccf-sub">Sin cambios en la beta. ' + (d.lineasBeta ? "" : "Las líneas salen del sistema; si el ticket tiene varias, el precio por línea es un estimado del total cobrado.") + "</p>") + "</div></div>";
  }
  function marcar() { K.dirty = true; var s = document.getElementById("mctk-save"); if (s) s.hidden = false; }
  function pintarTot() { var t = document.getElementById("mctk-tot"); if (t) t.innerHTML = totHtml(); }
  function pintarLin() { var b = document.getElementById("mctk-lin"); if (b) b.innerHTML = lineasHtml(); pintarTot(); }

  // ---------- agregar / escanear ----------
  function norm(c) { return String(c || "").trim().replace(/\.0+$/, "").replace(/\s+/g, ""); }
  function porBarras(code) {
    var c = norm(code); if (!c) return null;
    return (K.cat || []).find(function (p) { return (p.barras || []).some(function (b) { return norm(b) === c; }); }) || null;
  }
  function agregar(p, flashBad) {
    if (!p) return false;
    if (p.activo === false) { beep(false); toast2("«" + p.nombre + "» está inactivo: no se puede vender", true); flashBad(); return false; }
    var l = K.L.find(function (x) { return x.sku === p.sku && x.tipo === p.tipo; });
    if (l) l.cantidad = r2(l.cantidad + 1);
    else K.L.push({ tipo: p.tipo, sku: p.sku, nombre: p.nombre, cantidad: 1, precio_unit: r2(p.pvp), descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: false });
    marcar(); pintarLin(); beep(true);
    var idx = K.L.indexOf(l || K.L[K.L.length - 1]), tr = document.querySelector('#mctk-lin tr[data-i="' + idx + '"]');
    if (tr) { tr.classList.remove("mctk-flash"); void tr.offsetWidth; tr.classList.add("mctk-flash"); }
    return true;
  }
  function wireBuscar(main) {
    var q = main.querySelector("#mctk-q"), hits = main.querySelector("#mctk-hits");
    function bad() { q.classList.remove("mctk-flash-bad"); void q.offsetWidth; q.classList.add("mctk-flash-bad"); }
    function lista() {
      var v = q.value.trim(); if (!v) { hits.hidden = true; return; }
      var H = (window.MCBuscar ? window.MCBuscar.filtrar(K.cat || [], v, function (p) { return [[p.sku, p.skuVisible].concat(p.barras || []), [p.nombre]]; }) : []).filter(function (p) { return p.activo !== false; }).slice(0, 10);
      hits.hidden = false;
      hits.innerHTML = H.length ? H.map(function (p) { return '<button type="button" data-add="' + e(p.tipo + "|" + p.sku) + '"><span class="mccf-chip">' + e(TIPO[p.tipo] || p.tipo) + '</span> <span class="mccf-sku">' + e(p.skuVisible || p.sku) + "</span> " + e(p.nombre) + ' <span class="mccf-sub">· ' + e($m(p.pvp)) + (p.stock != null ? " · stock " + e(q2(p.stock)) : "") + "</span></button>"; }).join("") : '<div class="mccf-sub" style="padding:8px">Sin resultados</div>';
    }
    q.oninput = lista;
    q.onkeydown = function (ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      var v = q.value.trim(); if (!v) return;
      var p = porBarras(v);
      if (p) { agregar(p, bad); q.value = ""; hits.hidden = true; return; }
      if (/^\d{6,14}$/.test(norm(v))) { beep(false); bad(); toast2("Código " + norm(v) + " no encontrado", true); q.select(); return; }
      var f = hits.querySelector("[data-add]"); if (f) f.click();
    };
    hits.onclick = function (ev) {
      var b = ev.target.closest("[data-add]"); if (!b) return;
      var k = b.getAttribute("data-add").split("|"), p = (K.cat || []).find(function (x) { return x.tipo === k[0] && x.sku === k[1]; });
      if (agregar(p, bad)) { q.value = ""; hits.hidden = true; q.focus(); }
    };
    // Lector: si escanean sin el foco en el buscador (y no en otro campo), igual entra al buscador.
    if (!K.scanWired) {
      K.scanWired = true; var buf = "", last = 0;
      document.addEventListener("keydown", function (ev) {
        var box = document.getElementById("mctk-q"); if (!box || document.activeElement === box) return;
        var tg = ev.target; if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable)) return;
        var now = Date.now(); if (now - last > 60) buf = ""; last = now;
        if (ev.key === "Enter" && buf.length >= 6) { box.value = buf; buf = ""; box.focus(); box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); ev.preventDefault(); return; }
        if (ev.key.length === 1) buf += ev.key;
      });
    }
  }

  // ---------- excluir comisión ----------
  function dlgExcluir() {
    var d = K.d, t = d.ticket, box = document.createElement("div"); box.className = "mctk-dlg";
    box.innerHTML = '<div class="mctk-box"><h3 style="margin:0 0 6px">Excluir comisión</h3><p class="mccf-sub">Marca las líneas que no pagan comisión, o toda la comisión de la cosmetóloga en este ticket. Queda en el historial y entra en el cálculo de comisiones de la beta.</p>' +
      '<label><input type="checkbox" id="mctk-xall"' + (K.exclC ? " checked" : "") + "> Toda la comisión de <b>" + e(t.cosmetologa || "la cosmetóloga") + "</b> en este ticket</label><hr>" +
      K.L.map(function (l, i) { return '<label><input type="checkbox" data-x="' + i + '"' + (l.excluir_comision ? " checked" : "") + "> " + e(TIPO[l.tipo] || l.tipo) + " · " + e(l.sku) + " · " + e(l.nombre) + " ×" + e(q2(l.cantidad)) + "</label>"; }).join("") +
      '<p style="margin:10px 0 4px;font-size:.8rem;font-weight:700">Motivo</p><input type="text" id="mctk-xn" value="' + e(K.exclN) + '" placeholder="Ej. producto de cortesía, ticket de prueba">' +
      '<p class="err" id="mctk-xerr"></p><div class="mctk-acts" style="justify-content:flex-end;margin-top:10px"><button class="btn ghost small" type="button" id="mctk-xno">Cancelar</button><button class="btn small" type="button" id="mctk-xok">Aplicar</button></div></div>';
    document.body.appendChild(box);
    box.querySelector("#mctk-xno").onclick = function () { box.remove(); };
    box.querySelector("#mctk-xok").onclick = function () {
      var all = box.querySelector("#mctk-xall").checked, nota = box.querySelector("#mctk-xn").value.trim();
      var marcadas = [].slice.call(box.querySelectorAll("[data-x]")).filter(function (c) { return c.checked; }).length;
      if ((all || marcadas) && nota.length < 3) { box.querySelector("#mctk-xerr").textContent = "Escribe el motivo"; return; }
      K.exclC = all; K.exclN = nota;
      box.querySelectorAll("[data-x]").forEach(function (c) { K.L[+c.getAttribute("data-x")].excluir_comision = c.checked; });
      box.remove(); marcar(); pintarLin();
      var note = "Comisión: guarda los cambios para aplicarla.";
      document.getElementById("mctk-err").textContent = note;
    };
  }

  // ---------- guardar / pedir ----------
  function propuesta() {
    return { lineas: K.L.map(function (l) { return { tipo: l.tipo, sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, precio_unit: l.precio_unit, descuento_tipo: l.descuento_tipo || "", descuento_valor: l.descuento_valor || 0, excluir_comision: !!l.excluir_comision, estimado: !!l.estimado }; }),
      descuento: { tipo: K.desc.tipo || "", valor: Number(K.desc.valor) || 0 }, promo: K.promo || "", excluir_cosmetologa: K.exclC, excluir_nota: K.exclN };
  }
  function cargarEstado(d) {
    K.d = d; K.dirty = false;
    K.L = (d.lineas || []).map(function (l) { return { tipo: l.tipo, sku: l.sku, nombre: l.nombre, cantidad: Number(l.cantidad), precio_unit: Number(l.precio_unit), descuento_tipo: l.descuento_tipo || null, descuento_valor: Number(l.descuento_valor) || 0, excluir_comision: !!l.excluir_comision, estimado: !!l.estimado, total_linea: Number(l.total_linea) || 0 }; });
    K.desc = { tipo: (d.descuento && d.descuento.tipo) || null, valor: (d.descuento && d.descuento.valor) || 0 };
    K.promo = d.promo || ""; K.exclC = !!d.excluirCosmetologa; K.exclN = d.excluirNota || "";
  }
  async function render(clave) {
    css();
    var r = await Promise.all([api("tk_get", { clave: clave }), K.cat ? Promise.resolve(null) : api("tk_catalogo", {})]);
    var d = r[0];
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + '</p><button class="btn ghost small" type="button" data-go="#/m/tickets">← Volver a la lista</button>';
    if (r[1] && r[1].items) K.cat = r[1].items;
    cargarEstado(d);
    return html();
  }
  function repintar(main) { var root = main.querySelector("#mctk-root"); if (root) { root.outerHTML = html(); wire(main); } }
  function wire(main) {
    if (!K.d) return;
    main.querySelector("#mctk-volver").onclick = function () { if (K.dirty && !confirm("Hay cambios sin guardar. ¿Salir igual?")) return; var vv = sessionStorage.getItem("mctk.volver"); sessionStorage.removeItem("mctk.volver"); go(vv || "#/m/tickets"); };
    var dd = main.querySelector("#mctk-dd");
    main.querySelector("#mctk-docs").onclick = function (ev) { ev.stopPropagation(); dd.hidden = !dd.hidden; };
    if (!K.ddWired) { K.ddWired = true; document.addEventListener("click", function (ev) { var x = document.getElementById("mctk-dd"); if (x && !ev.target.closest(".mctk-menu")) x.hidden = true; }); }
    dd.onclick = async function (ev) {
      var b = ev.target.closest("[data-doc]"); if (!b) return;
      var t = K.d.ticket, busca = function () { return (window._histData || []).find(function (x) { return String(x.tkRow) === String(t.sheetRow); }); };
      var h = busca();
      if (!h && typeof APPS_SCRIPT_URL !== "undefined") {
        // Si se llegó desde la ficha de la clienta, el historial aún no está cargado: se pide una vez.
        toast2("⏳ Cargando la tarjeta…");
        try { var r = await fetch(APPS_SCRIPT_URL + "?action=getHistorial&_t=" + Date.now()); var data = await r.json(); if (Array.isArray(data)) { _histData = data; window._histData = data; } } catch (x) {}
        h = busca();
      }
      if (!h || typeof tarjetaTicket !== "function") { toast2("No encontré la tarjeta de este ticket", true); return; }
      (window._tkCards = window._tkCards || {})[t.sheetRow] = h; tarjetaTicket(t.sheetRow);
    };
    main.querySelector("#mctk-excl").onclick = dlgExcluir;
    var lin = main.querySelector("#mctk-lin");
    lin.addEventListener("input", function (ev) {
      var tr = ev.target.closest("tr[data-i]"), f = ev.target.getAttribute("data-f"); if (!tr || !f) return;
      var l = K.L[+tr.getAttribute("data-i")];
      l[f] = f === "descuento_tipo" ? (ev.target.value || null) : Number(ev.target.value) || 0;
      if (f === "precio_unit") l.estimado = false;
      calc(); tr.querySelector("[data-tl]").textContent = $m(l.total_linea); pintarTot(); marcar();
    });
    lin.addEventListener("change", function (ev) { if (ev.target.getAttribute("data-f") === "descuento_tipo") { var l = K.L[+ev.target.closest("tr").getAttribute("data-i")]; l.descuento_tipo = ev.target.value || null; calc(); ev.target.closest("tr").querySelector("[data-tl]").textContent = $m(l.total_linea); pintarTot(); marcar(); } });
    lin.addEventListener("click", function (ev) { var b = ev.target.closest("[data-del]"); if (!b) return; K.L.splice(+b.getAttribute("data-del"), 1); marcar(); pintarLin(); });
    main.querySelector("#mctk-promo").onchange = function () { K.promo = this.value; marcar(); pintarTot(); };
    main.querySelector("#mctk-dt").onchange = function () { K.desc.tipo = this.value || null; marcar(); pintarTot(); };
    main.querySelector("#mctk-dv").oninput = function () { K.desc.valor = Number(this.value) || 0; marcar(); pintarTot(); };
    wireBuscar(main);
    var err = main.querySelector("#mctk-err");
    var g = main.querySelector("#mctk-guardar");
    if (g) g.onclick = async function () {
      err.textContent = ""; g.disabled = true;
      var r = await api("tk_guardar", Object.assign({ clave: K.d.clave }, propuesta()));
      g.disabled = false;
      if (!r || r.error) { err.textContent = (r && r.error) || "No se pudo guardar"; return; }
      toast2("Ticket guardado · total " + $m(r.total));
      var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok) { cargarEstado(d); repintar(main); }
    };
    var pd = main.querySelector("#mctk-pedir");
    if (pd) pd.onclick = async function () {
      var mot = prompt("¿Por qué se cambia el ticket? (lo aprueba un admin)"); if (!mot || !mot.trim()) return;
      var r = await api("solicitud_crear", { tabla: "ticket_detalle", fila: K.d.clave, tipo: "cambio", motivo: mot.trim(), propuestos: propuesta() });
      if (!r || r.error) { err.textContent = (r && r.error) || "No se pudo enviar"; return; }
      toast2("Solicitud enviada: un admin la revisa");
      var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok) { cargarEstado(d); repintar(main); }
    };
    main.querySelector("#mctk-descartar").onclick = async function () { var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok) { cargarEstado(d); repintar(main); } };
  }

  // Lector en la pantalla «Nuevo ticket» (la de siempre): un escaneo suma +1 al producto de la lista.
  function escanerCrear() {
    if (K.crearWired) return; K.crearWired = true;
    var buf = "", last = 0;
    document.addEventListener("keydown", function (ev) {
      if (document.getElementById("mctk-q") || !document.querySelector('[id^="q-SUNSU-"]') || typeof window.chgQ !== "function") return;
      var tg = ev.target; if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable)) return;
      var now = Date.now(); if (now - last > 60) buf = ""; last = now;
      if (ev.key === "Enter" && buf.length >= 6) { var code = buf; buf = ""; ev.preventDefault(); escaneoCrear(code); return; }
      if (ev.key && ev.key.length === 1) buf += ev.key;
    });
  }
  async function escaneoCrear(code) {
    try { if (!K.cat) { var r = await api("tk_catalogo", {}); K.cat = (r && r.items) || []; } } catch (x) { toast2("No se pudo leer el catálogo: " + ((x && x.message) || x), true); return; }
    var p = porBarras(code);
    if (!p) { beep(false); toast2("Código " + norm(code) + " no encontrado", true); return; }
    if (p.activo === false) { beep(false); toast2("«" + p.nombre + "» está inactivo: no se puede vender", true); return; }
    var hit = null;
    (window.PROVS || []).some(function (pv) { return (pv.prods || []).some(function (x) { if (x.sku === p.skuVisible || x.sku === "SUNSU-" + p.sku) { hit = { sku: x.sku, pv: pv.id }; return true; } return false; }); });
    if (!hit) { beep(false); toast2("«" + p.nombre + "» no está en la lista de productos de esta pantalla", true); return; }
    window.chgQ(hit.sku, 1, hit.pv); beep(true);
    var row = document.getElementById("pr-" + hit.sku);
    if (row) { row.classList.remove("mctk-flash"); void row.offsetWidth; row.classList.add("mctk-flash"); try { row.scrollIntoView({ block: "nearest" }); } catch (x) {} }
    toast2("✓ " + p.nombre + " +1");
  }
  try { css(); } catch (x) {} escanerCrear();
  window.MCTickets = {
    render: function (route) { return render(String(route.id)); },
    wire: wire,
    claveDe: function (t) { return (t && t.so_num) || (t && t.tkRow ? "r" + t.tkRow : ""); },
    _k: K, _calc: calc,
  };
})();
