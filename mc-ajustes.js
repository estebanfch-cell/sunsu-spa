// Ajustes de stock estilo MineCore (beta, 0047): lista + nuevo ajuste + detalle con PDF y aprobación.
// Admin aplica directo; los demás quedan pendientes hasta que un admin apruebe. También lo usa la ficha
// del producto: editar un número de stock abre MCAjustes.editarStock(...).
(function () {
  var A = { meta: null, list: null, q: "", est: "", prods: null, form: null, cur: null };
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v); }
  function q2(v) { var x = Number(v) || 0; return Math.round(x * 100) / 100 + ""; }
  function sg(v) { var x = Number(v) || 0; return (x > 0 ? "+" : "") + q2(x); }
  function fecha(v) {
    var t = String(v || ""); if (!t) return "";
    if (/T\d\d:\d\d/.test(t)) { var d = new Date(t); if (!isNaN(d)) { var z = new Date(d.getTime() - 5 * 3600000).toISOString(); return z.slice(8, 10) + "/" + z.slice(5, 7) + "/" + z.slice(0, 4) + " " + z.slice(11, 16); } }
    return t.slice(0, 10).split("-").reverse().join("/");
  }
  var CLS = { pendiente: "c", aplicado: "ok", rechazado: "r", cancelado: "x" };
  var ORIG = { manual: "Manual", ficha: "Ficha del producto", conteo: "Conteo físico" };
  function chip(a) { return '<span class="mccf-chip ' + (CLS[a.estado] || "") + '">' + e(a.estadoNombre || a.estado) + "</span>"; }
  function opt(v, t, sel) { return '<option value="' + e(v) + '"' + (String(v) === String(sel) ? " selected" : "") + ">" + e(t) + "</option>"; }
  function css() {
    if (window.MCConteo && window.MCConteo._css) window.MCConteo._css();
    if (document.getElementById("mcaj-css")) return;
    var s = document.createElement("style"); s.id = "mcaj-css";
    s.textContent = ".mcaj-dlg{position:fixed;inset:0;background:rgba(20,30,50,.35);display:flex;align-items:center;justify-content:center;z-index:9999}.mcaj-box{background:var(--white,#fff);border-radius:14px;padding:16px;width:min(420px,94vw);box-shadow:0 10px 40px rgba(0,0,0,.2)}.mcaj-box h3{margin:0 0 6px;font-size:1rem}.mcaj-box label{display:flex;flex-direction:column;gap:4px;font-size:.74rem;font-weight:700;margin-top:10px}.mcaj-box input,.mcaj-box select{padding:8px;border:1.5px solid var(--cream-d,#ddd);border-radius:9px;font:inherit}.mcaj-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}.mcaj-edit{border:none;background:none;cursor:pointer;color:var(--navy,#345);font-size:.78rem;padding:0 4px}.mcaj-edit:hover{text-decoration:underline}.mctr-log li{margin:3px 0;font-size:.8rem}";
    document.head.appendChild(s);
  }
  async function meta() { if (!A.meta) { var m = await api("aj_meta", {}); if (m && m.ok) A.meta = m; } return A.meta; }
  async function prods(force) { var now = Date.now(); if (!force && A.prods && A.prodsAt && now - A.prodsAt < 2500) return A.prods; var d = await api("mcprod_list", {}); A.prods = (d && d.items || []).filter(function (p) { return p.tipo !== "servicio"; }); A.prodsAt = Date.now(); return A.prods; }
  function disp(p, bod, sub) {
    if (!p) return 0;
    if (bod === "CABINA") return Number((p.porSubCabina || {})[sub || "SIN"]) || 0;
    return Number((p.porGrupo || {})[bod]) || 0;
  }
  function motivoSel(id, m, sel) { return '<select id="' + id + '">' + opt("", "Elige el motivo…", sel) + m.motivos.map(function (x) { return opt(x, x, sel); }).join("") + "</select>"; }

  // ---------- Editar stock desde la ficha ----------
  async function editarStock(o) {
    css();
    var m = await meta();
    if (!m || !m.puede) { alert("No tienes permiso para ajustar stock."); return null; }
    return new Promise(function (resolve) {
      var d = document.createElement("div"); d.className = "mcaj-dlg";
      d.innerHTML = '<div class="mcaj-box"><h3>Ajustar stock</h3><div class="mccf-sub">' + e(o.nombre) + " · " + e(o.lugar) + '</div><div class="mccf-sub">En sistema: <b>' + e(q2(o.actual)) + "</b></div>" +
        '<label>Nueva cantidad<input id="mcaj-n" type="number" min="0" step="any" value="' + e(q2(o.actual)) + '"></label><div class="mccf-sub" id="mcaj-d"></div>' +
        "<label>Motivo" + motivoSel("mcaj-m", m, "") + '</label><label>Nota<input id="mcaj-nt" placeholder="Qué pasó"></label>' +
        (m.admin ? '<p class="mccf-sub">Se aplica al guardar y queda registrado como ajuste.</p>' : '<p class="mccf-note">Queda pendiente hasta que un admin lo apruebe.</p>') +
        '<p class="err" id="mcaj-err"></p><div class="mcaj-acts"><button class="btn ghost small" type="button" id="mcaj-x">Cancelar</button><button class="btn small" type="button" id="mcaj-ok">Guardar ajuste</button></div></div>';
      document.body.appendChild(d);
      var inp = d.querySelector("#mcaj-n"), dd = d.querySelector("#mcaj-d");
      function dif() { var x = (Number(inp.value) || 0) - (Number(o.actual) || 0); dd.innerHTML = "Diferencia: <b>" + e(sg(x)) + "</b>"; }
      inp.oninput = dif; dif(); inp.focus(); inp.select();
      function cerrar(v) { d.remove(); resolve(v); }
      var _el = d.querySelector("#mcaj-x"); if (_el) _el.onclick = function () { cerrar(null); };
      d.onclick = function (ev) { if (ev.target === d) cerrar(null); };
      var _el = d.querySelector("#mcaj-ok"); if (_el) _el.onclick = async function () {
        var err = d.querySelector("#mcaj-err"); err.textContent = "";
        if (inp.value === "" || Number(inp.value) < 0) { err.textContent = "Escribe la cantidad"; return; }
        var r = await api("aj_crear", { origen: "ficha", bodega: o.bodega, sububicacion: o.sub || "", motivo: d.querySelector("#mcaj-m").value, nota: d.querySelector("#mcaj-nt").value, lineas: [{ producto_id: o.productoId, nuevo: Number(inp.value) }] });
        if (!r || r.error) { err.textContent = (r && r.error) || "No se pudo"; return; }
        if (typeof toast === "function") try { toast(r.estado === "aplicado" ? "Ajuste " + r.numero + " aplicado" : "Ajuste " + r.numero + " enviado para aprobación"); } catch (_) {}
        A.prods = null; A.list = null;
        cerrar(r);
      };
    });
  }

  // ---------- Lista ----------
  function filas() {
    var q = String(A.q || "").trim();
    var L = (A.list || []).filter(function (a) { return !A.est || a.estado === A.est; });
    if (q && window.MCBuscar) L = window.MCBuscar.filtrar(L, q, function (a) { return [[a.numero].concat(String(a.skus || "").split(" ")), [a.bodegaNombre, a.motivo, a.nota, a.nombres, a.creadoPor, a.estadoNombre]]; });
    return L;
  }
  function filasHtml() {
    var r = filas();
    if (!r.length) return '<tr><td colspan="8" class="mccf-sub" style="padding:16px">' + ((A.list || []).length ? "Sin ajustes con ese filtro." : "Todavía no hay ajustes.") + "</td></tr>";
    return r.map(function (a) {
      return '<tr class="mccf-row" data-aj-go="' + e(a.id) + '"><td><b>' + e(a.numero) + "</b></td><td>" + e(fecha(a.creadoAt)) + "</td><td>" + e(a.bodegaNombre) + "</td><td>" + e(a.motivo) + "</td><td>" + chip(a) + '</td><td class="num">' + e(a.items) + '</td><td class="num mccf-hide">' + e(sg(a.neto)) + '</td><td class="mccf-hide mccf-sub">' + e(a.creadoPor) + " · " + e(ORIG[a.origen] || a.origen) + "</td></tr>";
    }).join("");
  }
  async function renderLista() {
    var m = await meta();
    var d = await api("aj_list", {});
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + "</p>";
    A.list = d.items || [];
    return (d.falta ? '<p class="err">' + e(d.falta) + "</p>" : "") +
      '<div class="mccf-bar"><input type="search" id="mcaj-q" placeholder="Buscar número, producto, SKU, motivo o bodega" value="' + e(A.q) + '">' +
      '<select id="mcaj-est">' + opt("", "Todos los estados", A.est) + Object.keys(m.estados || {}).map(function (k) { return opt(k, m.estados[k], A.est); }).join("") + "</select>" +
      (m.puede ? '<button class="btn small" type="button" id="mcaj-mas">+ Nuevo ajuste</button>' : "") + "</div>" +
      '<div class="mccf-card" style="padding:0"><div class="sheet-scroll"><table class="mccf-t"><thead><tr><th>Número</th><th>Fecha</th><th>Bodega</th><th>Motivo</th><th>Estado</th><th class="num">Ítems</th><th class="num mccf-hide">Neto</th><th class="mccf-hide">Por · origen</th></tr></thead><tbody id="mcaj-body">' + filasHtml() + "</tbody></table></div></div>" +
      '<p class="mccf-sub">' + (m.admin ? "Los ajustes de admin se aplican al guardar. Los de otras personas quedan pendientes hasta que apruebes." : "Tus ajustes quedan pendientes hasta que un admin los apruebe.") + " Editar un número de stock en la ficha del producto también crea un ajuste.</p>";
  }
  function wireLista(main) {
    var q = main.querySelector("#mcaj-q"), b = main.querySelector("#mcaj-body");
    if (q) q.oninput = function () { A.q = q.value; b.innerHTML = filasHtml(); };
    var es = main.querySelector("#mcaj-est"); if (es) es.onchange = function () { A.est = es.value; b.innerHTML = filasHtml(); };
    var mas = main.querySelector("#mcaj-mas"); if (mas) mas.onclick = function () { go("#/m/ajustes/nueva"); };
    main.addEventListener("click", function (ev) { var t = ev.target.closest("[data-aj-go]"); if (t) go("#/m/ajustes/a/" + encodeURIComponent(t.getAttribute("data-aj-go"))); });
  }

  // ---------- Nuevo ----------
  function lineasHtml() {
    var F = A.form, byId = {};
    (A.prods || []).forEach(function (p) { byId[p.id] = p; });
    if (!F.lineas.length) return '<tr><td colspan="6" class="mccf-sub" style="padding:14px">Busca y agrega productos arriba.</td></tr>';
    return F.lineas.map(function (l, i) {
      var ac = disp(byId[l.producto_id], F.bodega, F.sub), dif = (l.nuevo === "" ? 0 : Number(l.nuevo) - ac);
      return '<tr class="mccf-ln' + (dif ? " dif" : "") + '"><td><span class="mccf-sku">' + e(l.sku) + "</span></td><td>" + e(l.nombre) + '</td><td class="num">' + e(q2(ac)) + '</td><td class="num"><input class="mccf-in" type="number" min="0" step="any" data-aj-n="' + i + '" value="' + e(l.nuevo) + '"></td><td class="num">' + (dif < 0 ? '<span class="mccf-dif-n">' + e(q2(dif)) + "</span>" : dif > 0 ? '<span class="mccf-dif-p">+' + e(q2(dif)) + "</span>" : "0") + '</td><td><button class="mccf-ne" type="button" data-aj-del="' + i + '">Quitar</button></td></tr>';
    }).join("");
  }
  async function renderForm() {
    var m = await meta(); await prods();
    if (!m.puede) return '<p class="err">Los ajustes de stock son para admin o para quien tiene inventario completo.</p>';
    A.form = { bodega: "CONSIGNACION", sub: "", motivo: "", nota: "", lineas: [] };
    return '<p><button class="btn ghost small" type="button" id="mcaj-volver">← Volver a la lista</button></p><div class="mccf-card"><div class="mccf-h"><h2>Nuevo ajuste</h2></div><div class="mccf-form" style="margin-top:10px">' +
      '<label>Bodega<select id="mcaj-b">' + m.bodegas.map(function (b) { return opt(b.id, b.nombre); }).join("") + "</select></label>" +
      '<label id="mcaj-sw" hidden>Sububicación<select id="mcaj-s">' + opt("", "Sin cabina asignada") + m.subsCabina.map(function (b) { return opt(b.id, b.nombre); }).join("") + "</select></label>" +
      "<label>Motivo" + motivoSel("mcaj-m", m, "") + '</label><label style="grid-column:1/-1">Nota<input id="mcaj-nt" placeholder="Qué pasó"></label></div>' +
      (m.admin ? "" : '<p class="mccf-note">Queda pendiente hasta que un admin lo apruebe.</p>') + "</div>" +
      '<div class="mccf-card"><b>Productos</b> <span class="mccf-sub">· escribe la cantidad real; la diferencia se calcula sola</span><div class="mccf-bar" style="margin-top:8px"><input type="search" id="mcaj-buscar" placeholder="Buscar producto por nombre, SKU o código de barras"></div><div class="mccf-hits" id="mcaj-hits" hidden></div>' +
      '<div class="sheet-scroll"><table class="mccf-t"><thead><tr><th>SKU</th><th>Producto</th><th class="num">En sistema</th><th class="num">Cantidad real</th><th class="num">Diferencia</th><th></th></tr></thead><tbody id="mcaj-lin">' + lineasHtml() + "</tbody></table></div>" +
      '<p class="err" id="mcaj-err"></p><div class="mctr-acts" style="display:flex;gap:8px;margin-top:12px"><button class="btn small" type="button" id="mcaj-guardar">' + (m.admin ? "Aplicar ajuste" : "Enviar para aprobación") + "</button></div></div>";
  }
  function wireForm(main) {
    var F = A.form;
    var _el = main.querySelector("#mcaj-volver"); if (_el) _el.onclick = function () { go("#/m/ajustes"); };
    var b = main.querySelector("#mcaj-b"), sw = main.querySelector("#mcaj-sw"), sb = main.querySelector("#mcaj-s"), lin = main.querySelector("#mcaj-lin");
    function lado() { F.bodega = b.value; sw.hidden = F.bodega !== "CABINA"; F.sub = F.bodega === "CABINA" ? sb.value : ""; lin.innerHTML = lineasHtml(); }
    b.onchange = lado; sb.onchange = lado;
    var bq = main.querySelector("#mcaj-buscar"), hits = main.querySelector("#mcaj-hits");
    bq.oninput = function () {
      var qv = bq.value.trim(); if (!qv) { hits.hidden = true; return; }
      var ya = {}; F.lineas.forEach(function (l) { ya[l.producto_id] = 1; });
      var H = (window.MCBuscar ? window.MCBuscar.filtrar(A.prods, qv, function (p) { return [[p.sku, p.skuVisible, p.skuProveedor].concat(p.barras || []), [p.nombre, p.marca]]; }) : []).filter(function (p) { return !ya[p.id]; }).slice(0, 8);
      hits.hidden = false;
      hits.innerHTML = H.length ? H.map(function (p) { return '<button type="button" data-aj-add="' + e(p.id) + '"><span class="mccf-sku">' + e(p.skuVisible || p.sku) + "</span> " + e(p.nombre) + ' <span class="mccf-sub">· en sistema ' + e(q2(disp(p, F.bodega, F.sub))) + "</span></button>"; }).join("") : '<div class="mccf-sub" style="padding:8px">Sin resultados</div>';
    };
    bq.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); var f = hits.querySelector("[data-aj-add]"); if (f) f.click(); } };
    hits.onclick = function (ev) {
      var x = ev.target.closest("[data-aj-add]"); if (!x) return;
      var p = A.prods.find(function (y) { return y.id === x.getAttribute("data-aj-add"); });
      F.lineas.push({ producto_id: p.id, sku: p.skuVisible || p.sku, nombre: p.nombre, nuevo: q2(disp(p, F.bodega, F.sub)) });
      bq.value = ""; hits.hidden = true; lin.innerHTML = lineasHtml();
      var ins = lin.querySelectorAll("[data-aj-n]"); if (ins.length) { ins[ins.length - 1].focus(); ins[ins.length - 1].select(); }
    };
    lin.addEventListener("input", function (ev) {
      var i = ev.target.getAttribute("data-aj-n"); if (i == null) return;
      F.lineas[+i].nuevo = ev.target.value;
      var tr = ev.target.closest("tr"), td = tr.children[4], ac = Number(tr.children[2].textContent) || 0, dif = ev.target.value === "" ? 0 : Number(ev.target.value) - ac;
      dif = Math.round(dif * 100) / 100;
      td.innerHTML = dif < 0 ? '<span class="mccf-dif-n">' + e(q2(dif)) + "</span>" : dif > 0 ? '<span class="mccf-dif-p">+' + e(q2(dif)) + "</span>" : "0";
      tr.classList.toggle("dif", !!dif);
    });
    lin.addEventListener("click", function (ev) { var x = ev.target.closest("[data-aj-del]"); if (x) { F.lineas.splice(+x.getAttribute("data-aj-del"), 1); lin.innerHTML = lineasHtml(); } });
    var _el = main.querySelector("#mcaj-guardar"); if (_el) _el.onclick = async function () {
      var err = main.querySelector("#mcaj-err"); err.textContent = "";
      var r = await api("aj_crear", { bodega: F.bodega, sububicacion: F.sub, motivo: main.querySelector("#mcaj-m").value, nota: main.querySelector("#mcaj-nt").value, lineas: F.lineas.map(function (l) { return { producto_id: l.producto_id, nuevo: l.nuevo === "" ? null : Number(l.nuevo) }; }) });
      if (!r || r.error) { err.textContent = (r && r.error) || "No se pudo guardar"; return; }
      A.prods = null;
      go("#/m/ajustes/a/" + encodeURIComponent(r.id));
    };
  }

  // ---------- Detalle ----------
  async function renderDetalle(id) {
    var d = await api("aj_get", { id: id });
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + "</p>";
    A.cur = d;
    var a = d.ajuste;
    var hist = [["Creado", a.creadoAt, a.creadoPor], ["Aplicado", a.aplicadoAt, a.aplicadoPor], [a.estado === "cancelado" ? "Cancelado" : "Rechazado", a.rechazadoAt, a.rechazadoPor]].filter(function (x) { return x[1]; });
    return '<p><button class="btn ghost small" type="button" id="mcaj-volver">← Volver a la lista</button></p><div class="mccf-card"><div class="mccf-h"><h2>' + e(a.numero) + "</h2>" + chip(a) + '<span class="mccf-sub">' + e(fecha(a.creadoAt)) + "</span></div>" +
      '<div class="mccf-kpis"><div class="mccf-kpi"><b>' + e(a.bodegaNombre) + '</b>bodega</div><div class="mccf-kpi"><b>' + e(a.motivo) + '</b>motivo</div><div class="mccf-kpi"><b>' + e(a.items) + '</b>ítems</div><div class="mccf-kpi"><b>' + e(sg(a.neto)) + '</b>neto</div><div class="mccf-kpi"><b>' + e(ORIG[a.origen] || a.origen) + "</b>origen</div></div>" +
      (a.nota ? '<p class="mccf-sub" style="margin-top:8px">' + e(a.nota) + "</p>" : "") + (a.motivoRechazo ? '<p class="mccf-note">Rechazado: ' + e(a.motivoRechazo) + "</p>" : "") +
      (a.estado === "pendiente" ? '<p class="mccf-note">Pendiente: todavía no mueve stock. ' + (d.admin ? "Revisa y aprueba o rechaza." : "Un admin tiene que aprobarlo.") + "</p>" : "") +
      '<div class="mctr-acts" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' + (d.puedeAprobar ? '<button class="btn small" type="button" data-aj-est="aprobar">Aprobar y aplicar</button>' : "") + (d.puedeRechazar ? '<button class="btn ghost small" type="button" data-aj-est="rechazar">Rechazar</button>' : "") +
      (d.puedeCancelar && !d.admin ? '<button class="btn ghost small" type="button" data-aj-est="cancelar">Cancelar</button>' : "") + '<button class="btn ghost small" type="button" id="mcaj-pdf">PDF</button></div><p class="err" id="mcaj-err"></p></div>' +
      '<div class="mccf-card" style="padding:0"><div class="sheet-scroll"><table class="mccf-t"><thead><tr><th>SKU</th><th>Producto</th><th class="num">Antes</th><th class="num">Después</th><th class="num">Diferencia</th></tr></thead><tbody>' +
      d.lineas.map(function (l) { return '<tr><td><span class="mccf-sku">' + e(l.sku) + "</span></td><td>" + e(l.nombre) + '</td><td class="num">' + e(q2(l.antes)) + '</td><td class="num">' + e(q2(l.despues)) + '</td><td class="num">' + (l.diferencia < 0 ? '<span class="mccf-dif-n">' + e(q2(l.diferencia)) + "</span>" : '<span class="mccf-dif-p">+' + e(q2(l.diferencia)) + "</span>") + "</td></tr>"; }).join("") + "</tbody></table></div></div>" +
      '<div class="mccf-card"><b>Historial</b><ul class="mctr-log">' + hist.map(function (x) { return "<li><b>" + e(x[0]) + "</b> · " + e(fecha(x[1])) + " · " + e(x[2] || "") + "</li>"; }).join("") + "</ul></div>";
  }
  function pdf(d) {
    var a = d.ajuste, w = window.open("", "_blank");
    if (!w) { alert("Permite ventanas emergentes para ver el PDF"); return; }
    var rows = d.lineas.map(function (l, i) { return "<tr><td>" + (i + 1) + "</td><td>" + e(l.sku) + "</td><td>" + e(l.nombre) + '</td><td class="n">' + e(q2(l.antes)) + '</td><td class="n">' + e(q2(l.despues)) + '</td><td class="n">' + e(sg(l.diferencia)) + "</td></tr>"; }).join("");
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + e(a.numero) + '</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#222}h1{font-size:20px;margin:0}.m{color:#666;font-size:12px;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f3efe8}.n{text-align:right}.f{margin-top:50px;display:flex;gap:60px;font-size:12px}.f div{border-top:1px solid #333;padding-top:4px;min-width:200px}</style></head><body>' +
      "<h1>Sunsu Spa · Ajuste de stock " + e(a.numero) + '</h1><div class="m">Estado: ' + e(a.estadoNombre) + " · " + e(a.bodegaNombre) + " · Motivo: " + e(a.motivo) + "</div>" +
      '<div class="m">Creado ' + e(fecha(a.creadoAt)) + " por " + e(a.creadoPor) + (a.aplicadoAt ? " · Aplicado " + e(fecha(a.aplicadoAt)) + " por " + e(a.aplicadoPor) : "") + "</div>" + (a.nota ? '<div class="m">Nota: ' + e(a.nota) + "</div>" : "") +
      '<table><thead><tr><th>#</th><th>SKU</th><th>Producto</th><th class="n">Antes</th><th class="n">Después</th><th class="n">Diferencia</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      '<div class="f"><div>Elaborado por</div><div>Aprobado por</div></div><script>setTimeout(function(){print()},300)<\/script></body></html>');
    w.document.close();
  }
  function wireDetalle(main) {
    var d = A.cur; if (!d) return;
    var _el = main.querySelector("#mcaj-volver"); if (_el) _el.onclick = function () { go("#/m/ajustes"); };
    var _el = main.querySelector("#mcaj-pdf"); if (_el) _el.onclick = function () { pdf(d); };
    main.querySelectorAll("[data-aj-est]").forEach(function (b) {
      b.onclick = async function () {
        var que = b.getAttribute("data-aj-est"), extra = {};
        if (que === "rechazar") { var mo = prompt("¿Por qué se rechaza?"); if (!mo) return; extra.motivo = mo; }
        else if (!confirm(que === "aprobar" ? "¿Aprobar y aplicar? Se mueve el stock." : "¿Cancelar el ajuste?")) return;
        b.disabled = true;
        var r = await api("aj_revisar", Object.assign({ id: d.ajuste.id, que: que }, extra));
        b.disabled = false;
        if (!r || r.error) { main.querySelector("#mcaj-err").textContent = (r && r.error) || "No se pudo"; return; }
        A.prods = null;
        if (typeof draw === "function") draw();
      };
    });
  }

  window.MCAjustes = {
    ensureList: async function () {
      if ((A.list || []).length) return true;
      var d = await api("aj_list", {});
      if (d && !d.error) { A.list = d.items || []; return true; }
      return false;
    },
    render: async function (r) {
      css();
      if (r.sub === "a" && r.id) return renderDetalle(String(r.id));
      if (r.sub === "nueva") return renderForm();
      return renderLista();
    },
    wire: function (main, r) { if (r.sub === "a") wireDetalle(main); else if (r.sub === "nueva") wireForm(main); else wireLista(main); },
    editarStock: editarStock,
    _a: A,
  };
})();
