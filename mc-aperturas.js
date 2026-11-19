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
      ".mcap-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap}.mcap-acts [hidden]{display:none!important}.mcap-card{background:#fff;border-radius:14px;padding:12px 14px;margin:10px 0;box-shadow:var(--shadow-sm,0 1px 3px rgba(0,0,0,.06))}",
      ".mcap-cam{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}.mcap-cam video{max-width:94vw;max-height:70vh;border-radius:12px}",
      ".mcap-tabs{display:flex;gap:6px;margin:6px 0 10px;flex-wrap:wrap}.mcap-tabs button{border:1.5px solid var(--cream-d,#e6dccb);background:#fff;border-radius:999px;padding:5px 12px;font:inherit;font-size:.8rem;cursor:pointer}.mcap-tabs button.on{background:var(--navy,#2c3e66);color:#fff;border-color:var(--navy,#2c3e66)}",
      ".mcap-t{width:100%;border-collapse:collapse;font-size:.8rem}.mcap-t th{text-align:left;color:var(--gray,#8a93a6);font-size:.7rem;padding:5px;border-bottom:1.2px solid var(--cream-d,#e6dccb)}.mcap-t td{padding:6px 5px;border-bottom:1px solid #f1ece2;vertical-align:top}.mcap-t .num{text-align:right}.mcap-t tr.an td{opacity:.5;text-decoration:line-through}",
      ".mcap-consig{margin-top:8px;padding:9px 11px;border-radius:10px;background:#fbf4e4;border:1px solid #e6cf9a;color:#6b5217;font-size:.78rem;line-height:1.35}.mcap-dest small.mcap-cg{color:#8A6D1F;font-weight:800}" +
      ".mcap-pill{font-size:.66rem;border-radius:999px;padding:2px 8px;background:#e8f5ee;color:#2e7d52;font-weight:800}.mcap-pill.g{background:#eef0f4;color:#6b7280}",
      ".mcap-aplica-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}",
      ".mcap-aplica-all{margin-left:auto;display:inline-flex;gap:8px}",
      ".mcap-aplica-all button{border:0;background:none;padding:0;font:inherit;font-size:.72rem;font-weight:700;color:var(--navy,#2c3e66);cursor:pointer;text-decoration:underline;text-underline-offset:2px}",
      ".mcap-aplica-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:8px;border-top:1px solid var(--cream-d,#e6dccb);border-left:1px solid var(--cream-d,#e6dccb)}",
      ".mcap-aplica-row{display:flex!important;flex-direction:row!important;align-items:center;gap:8px;margin:0!important;padding:5px 8px!important;border:0!important;border-right:1px solid var(--cream-d,#e6dccb)!important;border-bottom:1px solid var(--cream-d,#e6dccb)!important;border-radius:0!important;background:transparent;font-size:.78rem!important;font-weight:600!important;text-transform:none!important;letter-spacing:0!important;color:var(--navy,#2c3e66)!important;cursor:pointer;min-width:0;line-height:1.25}",
      ".mcap-aplica-row.on{background:var(--blue-l,#eef3fb)}",
      ".mcap-aplica-row input[type=checkbox]{width:16px!important;height:16px!important;min-width:16px!important;min-height:0!important;margin:0!important;padding:0!important;flex:0 0 16px;border-radius:3px!important;accent-color:var(--navy,#2c3e66);background:var(--white,#fff)}",
      ".mcap-aplica-row span{min-width:0;overflow-wrap:anywhere}",
      "@media(max-width:860px){.mcap-aplica-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}",
      "@media(max-width:400px){.mcap-aplica-grid{grid-template-columns:1fr}}",
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
        (p.producto.consignacion ? '<div class="mcap-consig">🤝 <b>Producto en consignación' + (p.producto.proveedor ? " de " + e(p.producto.proveedor) : "") + '</b><br>Al abrirlo se descuenta del <b>stock en consignación</b> (bodega ' + (d.some(function (x) { return x.saleDe === "Consignación"; }) ? "Consignación" : "Local, donde todavía está") + ') y queda como <b>consumo interno a costo</b>: entra a la liquidación' + (p.producto.proveedor ? " de " + e(p.producto.proveedor) : " del proveedor") + ' como una unidad vendida (se le paga). No genera comisión. Ya no hace falta el «ticket de consignación».</div>' : "") +
        '<div class="mcap-sub" style="margin-top:8px">¿Dónde se va a usar?</div><div class="mcap-dest">' + d.map(function (x) {
          return '<button type="button" data-dest="' + e(x.codigo) + '" class="' + (K.destino === x.codigo ? "on" : "") + '">' + e(x.nombre) + "<small>stock " + e(x.stock) + (x.saleDe ? " en " + e(x.saleDe) : "") + "</small>" + (p.producto.consignacion ? (x.consig ? '<small class="mcap-cg">🤝 de consignación</small>' : "<small>ya está en la cabina</small>") : "") + (x.abierto ? "<small>abierto desde " + e(fh(x.abierto.desde)) + "</small>" : "") + "</button>";
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
      toast2("✓ Abierto en " + r.destino + (r.saleDe && r.saleDe !== r.destino ? " (sale de " + r.saleDe + ")" : "") + (r.consignacion ? " · 🤝 consumo de consignación" : "") + (r.cerradas && r.cerradas.length ? " · se cerró el envase anterior" : ""));
      var nombre = K.info.producto.nombre;
      K.prod = null; K.info = null; K.destino = ""; K.items = []; K.q = "";
      pintar(main);
      main.querySelector("#mcap-res").innerHTML = '<p class="mcap-pill" style="display:inline-block">✓ ' + e(nombre) + " abierto en " + e(r.destino) + (r.consignacion ? " · 🤝 consumo de consignación (va a la liquidación del proveedor)" : "") + "</p>";
    };
  }
  /** Cámara: el módulo compartido MCScan (sirve en iPhone, con ZXing vendido si hace falta). */
  function escanear(cb) {
    var run = window.MCScan && window.MCScan.abrir || window._scanAbrir;
    if (typeof run === "function") return run(cb);
    toast2("Este navegador no lee códigos con la cámara; escribe el código", 1);
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
  // TK136: tabla compacta (no burbujas); la selección exacta (0 / subset / todos)
  // se guarda en erp_productos.beta_aplica_faciales y se recarga igual.
  // Vacío = ninguno (nunca «todos marcados»). Comparación sin importar mayúsculas.
  var aplicaSt = { pid: "", saved: [], sel: [], faciales: [], host: null, puede: false, req: 0 };
  function normCodes(a) {
    return (a || []).map(function (x) { return String(x || "").toUpperCase(); }).filter(Boolean).sort();
  }
  function codesEq(a, b) { return normCodes(a).join("\n") === normCodes(b).join("\n"); }
  function hasCode(sel, k) {
    var u = String(k || "").toUpperCase();
    return (sel || []).some(function (x) { return String(x || "").toUpperCase() === u; });
  }
  function aplicaDirty() { return !!(aplicaSt.pid && !codesEq(aplicaSt.sel, aplicaSt.saved)); }
  function aplicaReset() { var on = aplicaSt.onChange, req = aplicaSt.req; aplicaSt = { pid: "", saved: [], sel: [], faciales: [], host: null, puede: false, req: req, onChange: on }; }
  function fireAplicaChange() {
    if (typeof aplicaSt.onChange === "function") aplicaSt.onChange();
  }
  function setSelFromBox(k, on) {
    k = String(k || "").toUpperCase();
    if (on) { if (!hasCode(aplicaSt.sel, k)) aplicaSt.sel.push(k); }
    else aplicaSt.sel = aplicaSt.sel.filter(function (x) { return String(x || "").toUpperCase() !== k; });
  }
  function paintAplicaActs(host) {
    if (!host) return;
    var dirty = aplicaDirty();
    var ok = host.querySelector("#mcap-apok");
    var dx = host.querySelector("#mcap-apx");
    if (ok) { ok.disabled = !dirty; ok.setAttribute("aria-disabled", dirty ? "false" : "true"); }
    if (dx) dx.hidden = !dirty;
  }
  function drawAplica() {
    var host = aplicaSt.host;
    if (!host) return;
    var puede = aplicaSt.puede, sel = aplicaSt.sel;
    host.innerHTML = '<div class="mcap-card mcap-aplica"><div class="mcap-aplica-h"><b>Aplica a faciales</b> <span class="mcap-sub">· para el costo por facial (📦 Abrir producto)</span>' +
      (puede ? '<span class="mcap-aplica-all"><button type="button" id="mcap-todos">Todos</button><button type="button" id="mcap-ninguno">Ninguno</button></span>' : "") +
      "</div><div class=\"mcap-aplica-grid\">" + aplicaSt.faciales.map(function (f) {
        var on = hasCode(sel, f.code);
        return '<label class="mcap-aplica-row' + (on ? " on" : "") + '"><input type="checkbox" data-apf="' + e(f.code) + '"' + (on ? " checked" : "") + (puede ? "" : " disabled") + '><span>' + e(f.nombre) + "</span></label>";
      }).join("") + "</div>" +
      (puede ? '<div class="mcap-acts"><button class="btn ghost small" type="button" id="mcap-apx" hidden>Descartar</button><button class="btn small" type="button" id="mcap-apok">Guardar</button></div>' : "") +
      "</div>";
    host.querySelectorAll("[data-apf]").forEach(function (c) {
      c.onchange = function () {
        setSelFromBox(c.getAttribute("data-apf"), c.checked);
        if (c.parentNode) c.parentNode.classList.toggle("on", c.checked);
        paintAplicaActs(host);
        fireAplicaChange();
      };
    });
    var todos = host.querySelector("#mcap-todos");
    if (todos) todos.onclick = function () {
      aplicaSt.sel = aplicaSt.faciales.map(function (f) { return String(f.code || "").toUpperCase(); });
      drawAplica(); fireAplicaChange();
    };
    var ninguno = host.querySelector("#mcap-ninguno");
    if (ninguno) ninguno.onclick = function () {
      aplicaSt.sel = [];
      drawAplica(); fireAplicaChange();
    };
    var ok = host.querySelector("#mcap-apok");
    if (ok) ok.onclick = function () { void aplicaGuardar({ toast: true }); };
    var dx = host.querySelector("#mcap-apx");
    if (dx) dx.onclick = function () { aplicaDescartar(); fireAplicaChange(); };
    paintAplicaActs(host);
  }
  function aplicaDescartar() {
    aplicaSt.sel = aplicaSt.saved.slice();
    drawAplica();
  }
  async function aplicaGuardar(opts) {
    opts = opts || {};
    if (!aplicaSt.pid) return { error: "Sin producto" };
    var x = await api("ap_aplica_guardar", { producto_id: aplicaSt.pid, faciales: aplicaSt.sel.slice() });
    if (!x || !x.ok) {
      if (opts.toast) toast2((x && x.error) || "No se pudo guardar", 1);
      return x || { error: "No se pudo guardar" };
    }
    aplicaSt.sel = (x.aplica || []).map(function (c) { return String(c || "").toUpperCase(); });
    aplicaSt.saved = aplicaSt.sel.slice();
    drawAplica();
    if (opts.toast) toast2("✓ Guardado");
    fireAplicaChange();
    return x;
  }
  async function aplicaCard(host, pid, puedeEditar) {
    if (!host || !pid) return;
    css();
    var same = aplicaSt.pid === String(pid) && aplicaDirty();
    aplicaSt.host = host;
    aplicaSt.puede = !!puedeEditar;
    if (same) { drawAplica(); return; }
    var req = ++aplicaSt.req;
    var r = await api("ap_aplica_get", { producto_id: pid });
    if (req !== aplicaSt.req) return;
    if (!r || r.error) { host.innerHTML = ""; return; }
    aplicaSt.pid = String(pid);
    aplicaSt.faciales = r.faciales || [];
    aplicaSt.saved = normCodes(r.aplica);
    aplicaSt.sel = aplicaSt.saved.slice();
    drawAplica();
  }

  window.MCAperturas = {
    render: async function (route) { css(); return '<div id="mcap-root">' + (route.sub === "costo" ? await htmlCosto() : htmlAbrir()) + "</div>"; },
    wire: function (main, route) { if (route.sub === "costo") wireCosto(main); else wireAbrir(main); },
    aplicaCard: aplicaCard, escanear: escanear,
    aplicaDirty: aplicaDirty, aplicaGuardar: aplicaGuardar, aplicaDescartar: aplicaDescartar, aplicaReset: aplicaReset,
    onAplicaChange: function (fn) { aplicaSt.onChange = fn; },
  };
})();
