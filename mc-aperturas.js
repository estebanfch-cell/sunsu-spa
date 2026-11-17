// 📦 Abrir producto (Emilia 17/11): buscar producto (código, nombre, código de barras o cámara) → destino
// Cabina 1/2/3 o Local → firma con el dedo → guarda quién/cuándo y descuenta 1 unidad de esa bodega.
// Costo por facial / protocolo automático: cuántos faciales rindió cada envase y cuánto cuesta por facial.
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $m(v) { return v == null ? "—" : "$" + (Math.round((Number(v) || 0) * 100) / 100).toFixed(2); }
  function fh(iso) { if (!iso) return ""; try { return new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (x) { return iso; } }
  function toast2(msg, bad) { if (typeof toast === "function") toast(msg, bad ? "var(--red, #c0392b)" : "var(--green)"); }
  var K = { prod: null, info: null, destino: "", items: [], firmado: false, tab: "producto", d: null };
  function css() {
    if (document.getElementById("mcap-css")) return;
    var s = document.createElement("style"); s.id = "mcap-css";
    s.textContent = [
      ".mcap{max-width:760px}.mcap h2{margin:0 0 8px;font-size:1.2rem}.mcap-sub{font-size:.78rem;color:var(--gray,#8a93a6)}",
      ".mcap-q{display:flex;gap:8px}.mcap-q input{flex:1;padding:10px 12px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:10px;font:inherit}",
      ".mcap-res{margin:8px 0;display:flex;flex-direction:column;gap:6px}.mcap-it{display:flex;gap:10px;align-items:center;padding:8px 10px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:10px;background:#fff;cursor:pointer;text-align:left;font:inherit}",
      ".mcap-it:hover,.mcap-it.on{border-color:var(--navy,#2c3e66)}.mcap-it img{width:38px;height:38px;object-fit:cover;border-radius:8px}.mcap-sku{font-family:ui-monospace,Menlo,monospace;font-size:.74rem;color:var(--navy-d,#1f2d4d)}",
      ".mcap-dest{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}.mcap-dest button{border:1.5px solid var(--cream-d,#e6dccb);background:#fff;border-radius:12px;padding:10px 6px;font:inherit;cursor:pointer;text-align:center}",
      ".mcap-dest button.on{border-color:var(--navy,#2c3e66);background:var(--blue-l,#eef3fb);font-weight:800}.mcap-dest small{display:block;color:var(--gray,#8a93a6);font-size:.66rem;margin-top:3px}",
      ".mcap-firma{border:1.5px dashed var(--navy,#2c3e66);border-radius:12px;background:#fff;touch-action:none;width:100%;height:180px;display:block}",
      ".mcap-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap}.mcap-card{background:#fff;border-radius:14px;padding:12px 14px;margin:10px 0;box-shadow:var(--shadow-sm,0 1px 3px rgba(0,0,0,.06))}",
      ".mcap-cam{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}.mcap-cam video{max-width:94vw;max-height:70vh;border-radius:12px}",
      ".mcap-tabs{display:flex;gap:6px;margin:6px 0 10px;flex-wrap:wrap}.mcap-tabs button{border:1.5px solid var(--cream-d,#e6dccb);background:#fff;border-radius:999px;padding:5px 12px;font:inherit;font-size:.8rem;cursor:pointer}.mcap-tabs button.on{background:var(--navy,#2c3e66);color:#fff;border-color:var(--navy,#2c3e66)}",
      ".mcap-t{width:100%;border-collapse:collapse;font-size:.8rem}.mcap-t th{text-align:left;color:var(--gray,#8a93a6);font-size:.7rem;padding:5px;border-bottom:1.2px solid var(--cream-d,#e6dccb)}.mcap-t td{padding:6px 5px;border-bottom:1px solid #f1ece2;vertical-align:top}.mcap-t .num{text-align:right}.mcap-t tr.an td{opacity:.5;text-decoration:line-through}",
      ".mcap-pill{font-size:.66rem;border-radius:999px;padding:2px 8px;background:#e8f5ee;color:#2e7d52;font-weight:800}.mcap-pill.g{background:#eef0f4;color:#6b7280}.mcap-chips{display:flex;flex-wrap:wrap;gap:6px}.mcap-chips label{border:1.5px solid var(--cream-d,#e6dccb);border-radius:999px;padding:4px 10px;font-size:.78rem;cursor:pointer}.mcap-chips label.on{border-color:var(--navy,#2c3e66);background:var(--blue-l,#eef3fb)}",
      "@media(max-width:560px){.mcap-dest{grid-template-columns:repeat(2,1fr)}}",
    ].join("\n");
    document.head.appendChild(s);
  }

  // ---------- Abrir producto ----------
  function htmlAbrir() {
    var p = K.info, d = (p && p.destinos) || [];
    return '<div class="mcap"><h2>📦 Abrir producto</h2><p class="mcap-sub">Busca el envase que vas a abrir, elige dónde se usa y firma. Sale 1 unidad de esa bodega; si había uno abierto del mismo producto ahí, se cierra.</p>' +
      '<div class="mcap-card"><div class="mcap-q"><input id="mcap-q" type="search" placeholder="Código, nombre o código de barras" autocomplete="off" value="' + e(K.q || "") + '"><button class="btn ghost" type="button" id="mcap-cam">📷 Escanear</button></div>' +
      '<div class="mcap-res" id="mcap-res">' + (p ? "" : htmlRes()) + "</div></div>" +
      (p ? '<div class="mcap-card"><div><b>' + e(p.producto.nombre) + '</b> <span class="mcap-sku">' + e(p.producto.sku) + "</span>" + (p.producto.presentacion ? ' <span class="mcap-sub">· ' + e(p.producto.presentacion) + "</span>" : "") + "</div>" +
        '<div class="mcap-sub" style="margin-top:8px">¿Dónde se va a usar?</div><div class="mcap-dest">' + d.map(function (x) {
          return '<button type="button" data-dest="' + e(x.codigo) + '" class="' + (K.destino === x.codigo ? "on" : "") + '">' + e(x.nombre) + "<small>stock " + e(x.stock) + (x.saleDe ? " en " + e(x.saleDe) : "") + "</small>" + (x.abierto ? "<small>abierto desde " + e(fh(x.abierto.desde)) + "</small>" : "") + "</button>";
        }).join("") + "</div>" +
        '<div class="mcap-sub">Firma con el dedo</div><canvas class="mcap-firma" id="mcap-firma"></canvas>' +
        '<div class="mcap-acts"><button class="btn ghost small" type="button" id="mcap-limpiar">Borrar firma</button><button class="btn" type="button" id="mcap-ok">📦 Abrir y descontar 1</button></div></div>' : "") +
      '<p><button class="btn ghost small" type="button" data-go="#/m/aperturas/costo">📊 Costo por facial / protocolo automático</button></p></div>';
  }
  function htmlRes() {
    if (!K.items.length) return K.q && K.q.length >= 2 ? '<p class="mcap-sub">Sin resultados.</p>' : "";
    return K.items.map(function (x) {
      return '<button type="button" class="mcap-it' + (K.prod === x.id ? " on" : "") + '" data-pid="' + e(x.id) + '">' + (x.foto ? '<img src="' + e(x.foto) + '" alt="">' : "📦") + '<span><b>' + e(x.nombre) + '</b><br><span class="mcap-sku">' + e(x.sku) + "</span>" + (x.presentacion ? ' <span class="mcap-sub">· ' + e(x.presentacion) + "</span>" : "") + "</span></button>";
    }).join("");
  }
  async function buscar(main, q, auto) {
    K.q = q;
    if (!q || q.length < 2) { K.items = []; main.querySelector("#mcap-res").innerHTML = ""; return; }
    var r = await api("ap_buscar", { q: q });
    if (K.q !== q) return;
    K.items = (r && r.items) || [];
    if (auto && r && r.exacto) { await elegir(main, r.exacto); return; }
    main.querySelector("#mcap-res").innerHTML = htmlRes();
  }
  async function elegir(main, pid) {
    var r = await api("ap_producto", { producto_id: pid });
    if (!r || r.error) { toast2((r && r.error) || "No se pudo leer el producto", 1); return; }
    K.prod = pid; K.info = r; K.destino = ""; K.firmado = false;
    pintar(main);
  }
  function pintar(main) { main.querySelector("#mcap-root").innerHTML = htmlAbrir(); wireAbrir(main); }
  function firmaPad(cv) {
    var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(300, r.width) * dpr; cv.height = 180 * dpr;
    var c = cv.getContext("2d"); c.scale(dpr, dpr); c.lineWidth = 2.4; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#1f2d4d";
    var on = false, last = null;
    var pt = function (ev) { var b = cv.getBoundingClientRect(); return { x: ev.clientX - b.left, y: ev.clientY - b.top }; };
    cv.onpointerdown = function (ev) { on = true; last = pt(ev); cv.setPointerCapture(ev.pointerId); ev.preventDefault(); };
    cv.onpointermove = function (ev) { if (!on) return; var p = pt(ev); c.beginPath(); c.moveTo(last.x, last.y); c.lineTo(p.x, p.y); c.stroke(); last = p; K.firmado = true; ev.preventDefault(); };
    cv.onpointerup = cv.onpointercancel = function () { on = false; };
  }
  function wireAbrir(main) {
    var q = main.querySelector("#mcap-q"), tmr;
    if (q) {
      q.oninput = function () { clearTimeout(tmr); tmr = setTimeout(function () { buscar(main, q.value.trim(), false); }, 200); };
      q.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); buscar(main, q.value.trim(), true); } };
    }
    var res = main.querySelector("#mcap-res"); if (res) res.onclick = function (ev) { var b = ev.target.closest("[data-pid]"); if (b) elegir(main, b.getAttribute("data-pid")); };
    var cam = main.querySelector("#mcap-cam"); if (cam) cam.onclick = function () { escanear(function (code) { q.value = code; buscar(main, code, true); }); };
    main.querySelectorAll("[data-dest]").forEach(function (b) { b.onclick = function () { K.destino = b.getAttribute("data-dest"); main.querySelectorAll("[data-dest]").forEach(function (x) { x.classList.toggle("on", x === b); }); }; });
    var cv = main.querySelector("#mcap-firma"); if (cv) firmaPad(cv);
    var lim = main.querySelector("#mcap-limpiar"); if (lim) lim.onclick = function () { K.firmado = false; firmaPad(cv); };
    var ok = main.querySelector("#mcap-ok");
    if (ok) ok.onclick = async function () {
      if (!K.destino) { toast2("Elige el destino", 1); return; }
      if (!K.firmado) { toast2("Falta la firma", 1); return; }
      ok.disabled = true; ok.textContent = "Guardando…";
      var r = await api("ap_abrir", { producto_id: K.prod, destino: K.destino, firma: cv.toDataURL("image/png") });
      if (!r || !r.ok) { ok.disabled = false; ok.textContent = "📦 Abrir y descontar 1"; toast2((r && r.error) || "No se pudo guardar", 1); return; }
      toast2("✓ Abierto en " + r.destino + (r.saleDe && r.saleDe !== r.destino ? " (sale de " + r.saleDe + ")" : "") + (r.cerradas && r.cerradas.length ? " · se cerró el envase anterior" : ""));
      var nombre = K.info.producto.nombre;
      K.prod = null; K.info = null; K.destino = ""; K.items = []; K.q = "";
      pintar(main);
      main.querySelector("#mcap-res").innerHTML = '<p class="mcap-pill" style="display:inline-block">✓ ' + e(nombre) + " abierto en " + e(r.destino) + "</p>";
    };
  }
  /** Cámara: BarcodeDetector del navegador (Chrome/Android, Safari reciente). Si no hay, se escribe el código. */
  async function escanear(cb) {
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices) { toast2("Este navegador no lee códigos con la cámara; escribe el código", 1); return; }
    var ov = document.createElement("div"); ov.className = "mcap-cam";
    ov.innerHTML = '<video playsinline muted></video><div style="color:#fff;font-weight:700">Apunta al código de barras</div><button class="btn" type="button">Cancelar</button>';
    document.body.appendChild(ov);
    var vid = ov.querySelector("video"), stream = null, vivo = true;
    var fin = function () { vivo = false; if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); ov.remove(); };
    ov.querySelector("button").onclick = fin;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      vid.srcObject = stream; await vid.play();
      var det = new window.BarcodeDetector();
      var loop = async function () {
        if (!vivo) return;
        try { var c = await det.detect(vid); if (c && c.length) { var v = c[0].rawValue; fin(); cb(v); return; } } catch (x) { /* siguiente cuadro */ }
        setTimeout(loop, 250);
      };
      loop();
    } catch (x) { fin(); toast2("No se pudo abrir la cámara", 1); }
  }

  // ---------- Costo por facial / protocolo automático ----------
  async function htmlCosto() {
    var r = await api("ap_lista", {});
    if (!r || r.error) return '<p class="err">' + e((r && r.error) || "No se pudo cargar") + "</p>";
    K.d = r; var C = r.verCostos;
    var tabs = [["producto", "Por producto"], ["protocolo", "Protocolo automático"], ["envases", "Envases abiertos (" + r.total + ")"]].map(function (t) { return '<button type="button" data-tab="' + t[0] + '" class="' + (K.tab === t[0] ? "on" : "") + '">' + t[1] + "</button>"; }).join("");
    var body = "";
    if (K.tab === "producto") {
      body = r.productos.length ? '<table class="mcap-t"><thead><tr><th>Producto</th><th>Aplica a</th><th class="num">Envases (cerrados)</th><th class="num">Faciales por envase</th><th class="num">Uso por facial</th>' + (C ? '<th class="num">Costo por facial</th>' : "") + "</tr></thead><tbody>" + r.productos.map(function (p) {
        var fpe = p.cerrados ? Math.round(p.faciales / p.cerrados * 10) / 10 : null;
        return "<tr><td><b>" + e(p.nombre) + '</b><br><span class="mcap-sku">' + e(p.sku) + "</span></td><td>" + (p.aplica.length ? e(p.aplica.join(", ")) : '<span class="mcap-pill g">elige en la ficha</span>') + '</td><td class="num">' + e(p.envases) + " (" + e(p.cerrados) + ')</td><td class="num">' + (fpe == null ? "—" : e(fpe)) + '</td><td class="num">' + (p.usoPorFacial == null ? "—" : e(p.usoPorFacial) + " " + e(p.unidad)) + "</td>" + (C ? '<td class="num"><b>' + $m(p.costoPorFacial) + "</b></td>" : "") + "</tr>";
      }).join("") + "</tbody></table>" : '<p class="mcap-sub">Todavía no se abrió ningún producto.</p>';
    } else if (K.tab === "protocolo") {
      body = r.protocolo.length ? r.protocolo.map(function (f) {
        return '<div class="mcap-card"><div style="display:flex;justify-content:space-between"><b>' + e(f.nombre) + ' <span class="mcap-sku">' + e(f.code) + "</span></b>" + (C ? "<b>" + $m(f.costo) + " por facial</b>" : "") + '</div><table class="mcap-t"><tbody>' + f.productos.map(function (p) {
          return "<tr><td>" + e(p.nombre) + ' <span class="mcap-sku">' + e(p.sku) + '</span></td><td class="num">' + (p.usoPorFacial == null ? "—" : e(p.usoPorFacial) + " " + e(p.unidad)) + "</td>" + (C ? '<td class="num">' + $m(p.costoPorFacial) + "</td>" : "") + "</tr>";
        }).join("") + "</tbody></table></div>";
      }).join("") : '<p class="mcap-sub">Aparece cuando un envase con «Aplica a faciales» se cierra (al abrir el siguiente).</p>';
    } else {
      body = '<table class="mcap-t"><thead><tr><th>Abierto</th><th>Producto</th><th>Destino</th><th>Quién</th><th class="num">Faciales</th><th class="num">Uso/facial</th>' + (C ? '<th class="num">Costo/facial</th>' : "") + "<th></th></tr></thead><tbody>" + r.items.map(function (x) {
        return '<tr class="' + (x.anulada ? "an" : "") + '"><td>' + e(fh(x.abierto_at)) + (x.cerrado_at ? '<br><span class="mcap-sub">cerrado ' + e(fh(x.cerrado_at)) + "</span>" : ' <span class="mcap-pill">en uso</span>') + "</td><td>" + e(x.nombre) + '<br><span class="mcap-sku">' + e(x.sku) + "</span></td><td>" + e(x.destinoNombre) + "</td><td>" + e(x.usuario) + '</td><td class="num">' + (x.sinAplica ? '<span class="mcap-pill g">sin «aplica»</span>' : e(x.faciales)) + '</td><td class="num">' + (x.usoPorFacial == null ? "—" : e(x.usoPorFacial) + " " + e(x.unidad)) + "</td>" + (C ? '<td class="num">' + $m(x.costoPorFacial) + "</td>" : "") +
          '<td>' + (x.tieneFirma ? '<button class="btn ghost small" type="button" data-firma="' + e(x.id) + '">✍️</button> ' : "") + (r.admin && !x.anulada ? '<button class="btn ghost small" type="button" data-anular="' + e(x.id) + '">Anular</button>' : x.anulada ? '<span class="mcap-sub">' + e(x.anulada_motivo) + "</span>" : "") + "</td></tr>";
      }).join("") + "</tbody></table>";
    }
    return '<div class="mcap" style="max-width:1000px"><p><button class="btn ghost small" type="button" data-go="#/m/aperturas">📦 Abrir producto</button></p><h2>📊 Costo por facial / protocolo automático</h2>' +
      '<p class="mcap-sub">' + e(r.nota) + "</p><div class=\"mcap-tabs\">" + tabs + '</div><div class="mcap-card" style="overflow:auto">' + body + "</div></div>";
  }
  function wireCosto(main) {
    var root = main.querySelector("#mcap-root"); if (!root) return;
    root.onclick = async function (ev) {
      var t = ev.target.closest("[data-tab]"); if (t) { K.tab = t.getAttribute("data-tab"); root.innerHTML = await htmlCosto(); return; }
      var fi = ev.target.closest("[data-firma]");
      if (fi) { var r = await api("ap_firma", { id: fi.getAttribute("data-firma") }); if (r && r.firma) { var w = document.createElement("div"); w.className = "mcap-cam"; w.innerHTML = '<img src="' + e(r.firma) + '" style="background:#fff;border-radius:12px;max-width:90vw"><button class="btn" type="button">Cerrar</button>'; w.onclick = function () { w.remove(); }; document.body.appendChild(w); } return; }
      var an = ev.target.closest("[data-anular]");
      if (an) {
        var motivo = prompt("Motivo para anular esta apertura (vuelve la unidad al stock):"); if (!motivo) return;
        var x = await api("ap_anular", { id: an.getAttribute("data-anular"), motivo: motivo });
        if (!x || !x.ok) { toast2((x && x.error) || "No se pudo anular", 1); return; }
        toast2("Apertura anulada"); root.innerHTML = await htmlCosto();
      }
    };
  }

  // ---------- Ficha de producto: «Aplica a faciales» ----------
  async function aplicaCard(host, pid, puedeEditar) {
    if (!host || !pid) return;
    css();
    var r = await api("ap_aplica_get", { producto_id: pid });
    if (!r || r.error) { host.innerHTML = ""; return; }
    var sel = r.aplica.slice();
    var draw = function () {
      host.innerHTML = '<div class="mcap-card"><b>Aplica a faciales</b> <span class="mcap-sub">· para el costo por facial (📦 Abrir producto)</span><div class="mcap-chips" style="margin-top:8px">' + r.faciales.map(function (f) {
        var on = sel.indexOf(f.code) >= 0;
        return '<label class="' + (on ? "on" : "") + '"><input type="checkbox" data-apf="' + e(f.code) + '"' + (on ? " checked" : "") + (puedeEditar ? "" : " disabled") + ' style="margin-right:4px">' + e(f.nombre) + "</label>";
      }).join("") + "</div>" + (puedeEditar ? '<div class="mcap-acts"><button class="btn small" type="button" id="mcap-apok">Guardar</button></div>' : "") + "</div>";
      host.querySelectorAll("[data-apf]").forEach(function (c) { c.onchange = function () { var k = c.getAttribute("data-apf"); if (c.checked) { if (sel.indexOf(k) < 0) sel.push(k); } else sel = sel.filter(function (x) { return x !== k; }); c.parentNode.classList.toggle("on", c.checked); }; });
      var ok = host.querySelector("#mcap-apok");
      if (ok) ok.onclick = async function () { var x = await api("ap_aplica_guardar", { producto_id: pid, faciales: sel }); if (!x || !x.ok) { toast2((x && x.error) || "No se pudo guardar", 1); return; } sel = x.aplica; toast2("✓ Guardado"); draw(); };
    };
    draw();
  }

  window.MCAperturas = {
    render: async function (route) { css(); return '<div id="mcap-root">' + (route.sub === "costo" ? await htmlCosto() : htmlAbrir()) + "</div>"; },
    wire: function (main, route) { if (route.sub === "costo") wireCosto(main); else wireAbrir(main); },
    aplicaCard: aplicaCard, escanear: escanear,
  };
})();
