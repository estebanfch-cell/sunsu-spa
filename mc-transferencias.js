// Transferencias estilo MineCore (beta, 0046): lista + nueva/editar (borrador) + detalle con estados,
// PDF e historial. El stock se mueve solo al recibir, en los movimientos de la beta.
(function () {
  var T = { list: null, meta: null, q: "", est: "", prods: null, form: null, cur: null };
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v); }
  function q2(v) { var x = Number(v) || 0; return Math.round(x * 100) / 100 + ""; }
  function fecha(v) {
    var t = String(v || ""); if (!t) return "";
    if (/T\d\d:\d\d/.test(t)) { var d = new Date(t); if (!isNaN(d)) { var z = new Date(d.getTime() - 5 * 3600000).toISOString(); return z.slice(8, 10) + "/" + z.slice(5, 7) + "/" + z.slice(0, 4) + " " + z.slice(11, 16); } }
    return t.slice(0, 10).split("-").reverse().join("/");
  }
  var CLS = { borrador: "a", enviada: "c", recibida: "ok", cancelada: "x" };
  function chip(t) { return '<span class="mccf-chip ' + (CLS[t.estado] || "") + '">' + e(t.estadoNombre || t.estado) + "</span>"; }
  function opt(v, t, sel) { return '<option value="' + e(v) + '"' + (String(v) === String(sel) ? " selected" : "") + ">" + e(t) + "</option>"; }
  function css() {
    if (window.MCConteo && window.MCConteo._css) window.MCConteo._css();
    if (document.getElementById("mctr-css")) return;
    var s = document.createElement("style"); s.id = "mctr-css";
    s.textContent = ".mctr-toca{cursor:pointer}.mctr-toca:hover{background:rgba(61,90,122,.06)}.mctr-flow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:.9rem}.mctr-flow b{background:var(--cream);border-radius:9px;padding:5px 10px}.mctr-steps{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}.mctr-step{font-size:.7rem;border-radius:999px;padding:4px 10px;background:var(--gray-l);color:var(--gray)}.mctr-step.on{background:var(--navy);color:#fff}.mctr-step.done{background:#e6f4ea;color:#2e7d32}.mctr-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.mctr-log li{margin:3px 0;font-size:.8rem}";
    document.head.appendChild(s);
  }
  async function meta() { if (!T.meta) { var d = await api("trfb_list", {}); if (d && d.ok) { T.meta = d; T.list = d.items; } return d; } return T.meta; }
  async function prods(force) { var now = Date.now(); if (!force && T.prods && T.prodsAt && now - T.prodsAt < 2500) return T.prods; var d = await api("mcprod_list", {}); T.prods = (d && d.items || []).filter(function (p) { return p.tipo !== "servicio"; }); T.prodsAt = Date.now(); return T.prods; }
  function disp(p, bod, sub) {
    if (!p) return 0;
    if (bod === "CABINA") return Number((p.porSubCabina || {})[sub || "SIN"]) || 0;
    return Number((p.porGrupo || {})[bod]) || 0;
  }
  function lugar(m, bod, sub) {
    var b = (m.bodegas || []).find(function (x) { return x.id === bod; }), s = (m.subsCabina || []).find(function (x) { return x.id === sub; });
    return (b ? b.nombre : bod) + (s ? " · " + s.nombre : "");
  }

  // ---------- Lista ----------
  function filas() {
    var q = String(T.q || "").trim();
    var L = (T.list || []).filter(function (t) { return !T.est || t.estado === T.est; });
    if (q && window.MCBuscar) L = window.MCBuscar.filtrar(L, q, function (t) { return [[t.numero].concat(String(t.skus || "").split(" ")), [t.origenNombre, t.destinoNombre, t.nombres, t.nota, t.creadoPor, t.estadoNombre]]; });
    return L;
  }
  function filasHtml() {
    var r = filas();
    if (!r.length) return '<tr><td colspan="7" class="mccf-sub" style="padding:16px">' + ((T.list || []).length ? "Sin transferencias con ese filtro." : "Todavía no hay transferencias.") + "</td></tr>";
    return r.map(function (t) {
      return '<tr class="mccf-row" data-tr-go="' + e(t.id) + '"><td><b>' + e(t.numero) + '</b></td><td>' + e(fecha(t.creadoAt)) + '</td><td>' + e(t.origenNombre) + ' → ' + e(t.destinoNombre) + "</td><td>" + chip(t) + '</td><td class="num">' + e(t.items) + '</td><td class="num mccf-hide">' + e(q2(t.unidades)) + '</td><td class="mccf-hide mccf-sub">' + e(t.creadoPor) + "</td></tr>";
    }).join("");
  }
  async function renderLista() {
    T.meta = null;
    var d = await meta();
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + "</p>";
    return (d.falta ? '<p class="err">' + e(d.falta) + "</p>" : "") +
      '<div class="mccf-bar"><input type="search" id="mctr-q" placeholder="Buscar número, bodega, producto o SKU" value="' + e(T.q) + '">' +
      '<select id="mctr-est">' + opt("", "Todos los estados", T.est) + Object.keys(d.estados || {}).map(function (k) { return opt(k, d.estados[k], T.est); }).join("") + "</select>" +
      (d.puedeCrear ? '<button class="btn small" type="button" id="mctr-mas">+ Nueva transferencia</button>' : "") + "</div>" +
      '<div class="mccf-card" style="padding:0"><div class="sheet-scroll"><table class="mccf-t"><thead><tr><th>Número</th><th>Fecha</th><th>Origen → destino</th><th>Estado</th><th class="num">Ítems</th><th class="num mccf-hide">Unidades</th><th class="mccf-hide">Creada por</th></tr></thead><tbody id="mctr-body">' + filasHtml() + "</tbody></table></div></div>" +
      '<p class="mccf-sub">Borrador → Enviada (en tránsito) → Recibida. El stock se mueve solo al recibir. Entre Oficina y Bodega Cabina solo mueve un admin.</p>';
  }
  function wireLista(main) {
    var q = main.querySelector("#mctr-q"), b = main.querySelector("#mctr-body");
    if (q) q.oninput = function () { T.q = q.value; b.innerHTML = filasHtml(); };
    var es = main.querySelector("#mctr-est"); if (es) es.onchange = function () { T.est = es.value; b.innerHTML = filasHtml(); };
    var mas = main.querySelector("#mctr-mas"); if (mas) mas.onclick = function () { go("#/m/transferencias/nueva"); };
    main.addEventListener("click", function (ev) { var t = ev.target.closest("[data-tr-go]"); if (t) go("#/m/transferencias/t/" + encodeURIComponent(t.getAttribute("data-tr-go"))); });
  }

  // ---------- Nueva / editar ----------
  function permitido(m, o, d) { return m.admin || [o, d].sort().join("|") !== "CABINA|OFICINA"; }
  function ladoHtml(m, k, bod, sub) {
    return '<label>' + (k === "o" ? "Origen" : "Destino") + '<select id="mctr-' + k + 'b">' + m.bodegas.map(function (b) { return opt(b.id, b.nombre, bod); }).join("") + "</select></label>" +
      '<label id="mctr-' + k + 'sw"' + (bod === "CABINA" ? "" : " hidden") + '>Sububicación ' + (k === "o" ? "origen" : "destino") + '<select id="mctr-' + k + 's">' + opt("", "Sin cabina asignada", sub) + m.subsCabina.map(function (b) { return opt(b.id, b.nombre, sub); }).join("") + "</select></label>";
  }
  function lineasFormHtml() {
    var F = T.form, byId = {};
    (T.prods || []).forEach(function (p) { byId[p.id] = p; });
    if (!F.lineas.length) return '<tr><td colspan="5" class="mccf-sub" style="padding:14px">Busca y agrega productos arriba.</td></tr>';
    return F.lineas.map(function (l, i) {
      var p = byId[l.producto_id], dv = disp(p, F.origen, F.origen_sub), mal = Number(l.cantidad) > dv;
      return '<tr class="mccf-ln' + (mal ? " dif" : "") + '"><td><span class="mccf-sku">' + e(l.sku) + "</span></td><td>" + e(l.nombre) + '</td><td class="num">' + e(q2(dv)) + '</td><td class="num"><input class="mccf-in" type="number" min="0" step="any" data-tr-q="' + i + '" value="' + e(l.cantidad) + '">' + '<div class="mccf-dif-n mctr-warn" style="font-size:.7rem"' + (mal ? "" : " hidden") + '>Más que el disponible</div>' + '</td><td><button class="mccf-ne" type="button" data-tr-del="' + i + '">Quitar</button></td></tr>';
    }).join("");
  }
  async function renderForm(id) {
    var m = await meta(); await prods();
    if (!m || m.error) return '<p class="err">' + e((m && m.error) || "No se pudo cargar") + "</p>";
    if (id) {
      var d = await api("trfb_get", { id: id });
      if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + "</p>";
      if (!d.puedeEditar) return '<p class="err">Esta transferencia ya no se puede editar.</p>';
      var t = d.transferencia;
      T.form = { id: t.id, numero: t.numero, origen: t.origen, origen_sub: t.origenSub, destino: t.destino, destino_sub: t.destinoSub, nota: t.nota, lineas: d.lineas.map(function (l) { return { producto_id: l.productoId, sku: l.sku, nombre: l.nombre, cantidad: l.cantidad }; }) };
    } else T.form = { id: "", origen: "CONSIGNACION", origen_sub: "", destino: "CABINA", destino_sub: "", nota: "", lineas: [] };
    var F = T.form;
    return '<p><button class="btn ghost small" type="button" id="mctr-volver">← Volver a la lista</button></p><div class="mccf-card"><div class="mccf-h"><h2>' + (F.id ? "Editar " + e(F.numero) : "Nueva transferencia") + "</h2></div>" +
      '<div class="mccf-form" style="margin-top:10px">' + ladoHtml(m, "o", F.origen, F.origen_sub) + ladoHtml(m, "d", F.destino, F.destino_sub) +
      '<label style="grid-column:1/-1">Nota<input id="mctr-nota" value="' + e(F.nota || "") + '" placeholder="Ej. Reposición de Cabina 2"></label></div>' +
      '<p class="mccf-note" id="mctr-aviso" hidden></p></div>' +
      '<div class="mccf-card"><b>Productos</b><div class="mccf-bar" style="margin-top:8px"><input type="search" id="mctr-buscar" placeholder="Buscar producto por nombre, SKU o código de barras"></div><div class="mccf-hits" id="mctr-hits" hidden></div>' +
      '<div class="sheet-scroll"><table class="mccf-t"><thead><tr><th>SKU</th><th>Producto</th><th class="num">Disponible en origen</th><th class="num">Cantidad</th><th></th></tr></thead><tbody id="mctr-lin">' + lineasFormHtml() + "</tbody></table></div>" +
      '<p class="err" id="mctr-err"></p><div class="mctr-acts"><button class="btn small" type="button" id="mctr-guardar"' + (F.id ? " hidden" : "") + '>Guardar borrador</button>' + (F.id ? '<button class="btn ghost small" type="button" id="mctr-descartar" hidden>Descartar</button>' : "") + '<button class="btn small" type="button" id="mctr-enviar">Guardar y enviar</button></div></div>';
  }
  function wireForm(main) {
    var F = T.form, m = T.meta;
    function leer() {
      F.origen = main.querySelector("#mctr-ob").value; F.destino = main.querySelector("#mctr-db").value;
      main.querySelector("#mctr-osw").hidden = F.origen !== "CABINA"; main.querySelector("#mctr-dsw").hidden = F.destino !== "CABINA";
      F.origen_sub = F.origen === "CABINA" ? main.querySelector("#mctr-os").value : ""; F.destino_sub = F.destino === "CABINA" ? main.querySelector("#mctr-ds").value : "";
      var av = main.querySelector("#mctr-aviso"), msg = "";
      if (F.origen === F.destino && F.origen_sub === F.destino_sub) msg = "Origen y destino son el mismo lugar.";
      else if (!permitido(m, F.origen, F.destino)) msg = "Solo un admin mueve entre Oficina y Bodega Cabina.";
      av.hidden = !msg; av.textContent = msg;
      main.querySelector("#mctr-lin").innerHTML = lineasFormHtml();
    }
    ["#mctr-ob", "#mctr-db", "#mctr-os", "#mctr-ds"].forEach(function (s) { var _el = main.querySelector(s); if (_el) _el.onchange = leer; });
    var _el = main.querySelector("#mctr-nota"); if (_el) _el.oninput = function () { F.nota = this.value; };
    var _el = main.querySelector("#mctr-volver"); if (_el) _el.onclick = function () { go(F.id ? "#/m/transferencias/t/" + encodeURIComponent(F.id) : "#/m/transferencias"); };
    var bq = main.querySelector("#mctr-buscar"), hits = main.querySelector("#mctr-hits");
    function buscar() {
      var qv = bq.value.trim(); if (!qv) { hits.hidden = true; return; }
      var ya = {}; F.lineas.forEach(function (l) { ya[l.producto_id] = 1; });
      var H = (window.MCBuscar ? window.MCBuscar.filtrar(T.prods, qv, function (p) { return [[p.sku, p.skuVisible, p.skuProveedor].concat(p.barras || []), [p.nombre, p.marca]]; }) : []).filter(function (p) { return !ya[p.id] && p.activo !== false; }).slice(0, 8);
      hits.hidden = false;
      hits.innerHTML = H.length ? H.map(function (p) { return '<button type="button" data-tr-add="' + e(p.id) + '"><span class="mccf-sku">' + e(p.skuVisible || p.sku) + "</span> " + e(p.nombre) + ' <span class="mccf-sub">· disponible ' + e(q2(disp(p, F.origen, F.origen_sub))) + "</span></button>"; }).join("") : '<div class="mccf-sub" style="padding:8px">Sin resultados</div>';
    }
    bq.oninput = buscar;
    bq.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); var f = hits.querySelector("[data-tr-add]"); if (f) f.click(); } };
    hits.onclick = function (ev) {
      var b = ev.target.closest("[data-tr-add]"); if (!b) return;
      var p = T.prods.find(function (x) { return x.id === b.getAttribute("data-tr-add"); });
      F.lineas.push({ producto_id: p.id, sku: p.skuVisible || p.sku, nombre: p.nombre, cantidad: 1 });
      bq.value = ""; hits.hidden = true; main.querySelector("#mctr-lin").innerHTML = lineasFormHtml(); bq.focus();
    };
    var lin = main.querySelector("#mctr-lin");
    lin.addEventListener("input", function (ev) {
      var i = ev.target.getAttribute("data-tr-q"); if (i == null) return;
      F.lineas[+i].cantidad = Number(ev.target.value) || 0;
      var tr = ev.target.closest("tr"), dv = Number(tr.children[2].textContent) || 0, mal = F.lineas[+i].cantidad > dv;
      tr.classList.toggle("dif", mal);
      var w = tr.querySelector(".mctr-warn"); if (w) w.hidden = !mal;
    });
    lin.addEventListener("click", function (ev) { var b = ev.target.closest("[data-tr-del]"); if (b) { F.lineas.splice(+b.getAttribute("data-tr-del"), 1); lin.innerHTML = lineasFormHtml(); } });
    async function guardar(enviar) {
      leer();
      var err = main.querySelector("#mctr-err"); err.textContent = "";
      if (enviar && !confirm("¿Enviar la transferencia? Queda en tránsito hasta que se reciba.")) return;
      var r = await api("trfb_save", { id: F.id, origen: F.origen, origen_sub: F.origen_sub, destino: F.destino, destino_sub: F.destino_sub, nota: F.nota, lineas: F.lineas, enviar: !!enviar });
      if (!r || r.error) { err.textContent = (r && r.error) || "No se pudo guardar"; return; }
      go("#/m/transferencias/t/" + encodeURIComponent(r.id));
    }
    var _el = main.querySelector("#mctr-guardar"); if (_el) _el.onclick = function () { void guardar(false); };
    // Editando un borrador: Guardar / Descartar aparecen solo si algo cambió de verdad.
    if (F.id) {
      var foto = function () { return JSON.stringify([F.origen, F.origen_sub, F.destino, F.destino_sub, F.nota || "", F.lineas.map(function (l) { return [l.producto_id, Number(l.cantidad) || 0]; })]); };
      var ini = foto();
      var mirar = function () { setTimeout(function () { var c = foto() !== ini, g = main.querySelector("#mctr-guardar"), x = main.querySelector("#mctr-descartar"); if (g) g.hidden = !c; if (x) x.hidden = !c; }, 0); };
      ["input", "change", "click"].forEach(function (ev) { if (main._mctrMirar) main.removeEventListener(ev, main._mctrMirar); main.addEventListener(ev, mirar); });
      main._mctrMirar = mirar;
      var ds = main.querySelector("#mctr-descartar"); if (ds) ds.onclick = function () { go("#/m/transferencias/t/" + encodeURIComponent(F.id)); };
    }
    var _el = main.querySelector("#mctr-enviar"); if (_el) _el.onclick = function () { void guardar(true); };
  }

  // ---------- Detalle ----------
  function pasos(t) {
    if (t.estado === "cancelada") return '<div class="mctr-steps"><span class="mctr-step on">Cancelada</span></div>';
    var orden = ["borrador", "enviada", "recibida"], i = orden.indexOf(t.estado);
    return '<div class="mctr-steps">' + ["Borrador", "Enviada (en tránsito)", "Recibida"].map(function (n, k) { return '<span class="mctr-step ' + (k < i ? "done" : k === i ? "on" : "") + '">' + n + "</span>"; }).join("") + "</div>";
  }
  function historial(t) {
    var L = [["Creada", t.creadoAt, t.creadoPor], ["Enviada", t.enviadoAt, t.enviadoPor], ["Recibida", t.recibidoAt, t.recibidoPor], ["Cancelada", t.canceladoAt, t.canceladoPor]].filter(function (x) { return x[1]; });
    return '<ul class="mctr-log">' + L.map(function (x) { return "<li><b>" + e(x[0]) + "</b> · " + e(fecha(x[1])) + " · " + e(x[2] || "") + "</li>"; }).join("") + "</ul>";
  }
  async function renderDetalle(id) {
    var d = await api("trfb_get", { id: id });
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + "</p>";
    T.cur = d;
    var t = d.transferencia;
    return '<p><button class="btn ghost small" type="button" id="mctr-volver">← Volver a la lista</button></p><div class="mccf-card"><div class="mccf-h"><h2>' + e(t.numero) + "</h2>" + chip(t) + '<span class="mccf-sub">' + e(fecha(t.creadoAt)) + "</span></div>" +
      '<div class="mctr-flow' + (d.puedeEditar ? " mctr-toca" : "") + '" style="margin-top:10px"' + (d.puedeEditar ? ' data-tr-tocar title="Toca para cambiar el borrador"' : "") + '><b>' + e(t.origenNombre) + "</b> → <b>" + e(t.destinoNombre) + "</b></div>" + pasos(t) +
      (d.puedeEditar ? '<p class="mccf-sub" style="margin-top:6px">✎ Es un borrador: toca el origen / destino o un producto para cambiarlo.</p>' : "") +
      (t.nota ? '<p class="mccf-sub" style="margin-top:8px">' + e(t.nota) + "</p>" : "") +
      (d.soloAdmin && !d.admin ? '<p class="mccf-note">Entre Oficina y Bodega Cabina solo mueve un admin.</p>' : "") +
      '<div class="mccf-kpis"><div class="mccf-kpi"><b>' + e(t.items) + '</b>ítems</div><div class="mccf-kpi"><b>' + e(q2(t.unidades)) + "</b>unidades</div></div>" +
      '<div class="mctr-acts">' + "" + (d.puedeEnviar ? '<button class="btn small" type="button" data-tr-est="enviar">Enviar</button>' : "") +
      (d.puedeRecibir ? '<button class="btn small" type="button" data-tr-est="recibir">Recibir (mueve el stock)</button>' : "") + (d.puedeCancelar ? '<button class="btn ghost small" type="button" data-tr-est="cancelar">Cancelar</button>' : "") +
      '<button class="btn ghost small" type="button" data-tr-pdf="doc">PDF</button><button class="btn ghost small" type="button" data-tr-pdf="bodega">PDF para bodega</button></div><p class="err" id="mctr-err"></p></div>' +
      '<div class="mccf-card" style="padding:0"><div class="sheet-scroll"><table class="mccf-t"><thead><tr><th>SKU</th><th>Producto</th><th class="num">Cantidad</th><th class="num mccf-hide">Disponible en origen</th></tr></thead><tbody>' +
      d.lineas.map(function (l) { return '<tr' + (d.puedeEditar ? ' class="mctr-toca" data-tr-tocar' : "") + '><td><span class="mccf-sku">' + e(l.sku) + "</span></td><td>" + e(l.nombre) + '</td><td class="num"><b>' + e(q2(l.cantidad)) + '</b></td><td class="num mccf-hide">' + (t.estado === "recibida" || t.estado === "cancelada" ? "—" : e(q2(l.disponibleAhora))) + "</td></tr>"; }).join("") + "</tbody></table></div></div>" +
      '<div class="mccf-card"><b>Historial</b>' + historial(t) +
      (d.movimientos.length ? '<b>Movimientos de stock</b><ul class="mctr-log">' + d.movimientos.map(function (m) { return "<li>" + e(fecha(m.fecha)) + " · " + e(m.sku) + " · " + e(m.bodega) + " · " + (m.delta > 0 ? "+" : "") + e(q2(m.delta)) + " · " + e(m.actor) + "</li>"; }).join("") + "</ul>" : '<p class="mccf-sub">Todavía no mueve stock (se mueve al recibir).</p>') + "</div>";
  }
  function pdf(d, tipo) {
    var t = d.transferencia, w = window.open("", "_blank");
    if (!w) { alert("Permite ventanas emergentes para ver el PDF"); return; }
    var bod = tipo === "bodega";
    var rows = d.lineas.map(function (l, i) { return "<tr><td>" + (i + 1) + "</td><td>" + e(l.sku) + "</td><td>" + e(l.nombre) + '</td><td class="n">' + e(q2(l.cantidad)) + "</td>" + (bod ? '<td class="c">☐</td><td></td>' : "") + "</tr>"; }).join("");
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + e(t.numero) + '</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#222}h1{font-size:20px;margin:0}.m{color:#666;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f3efe8}.n{text-align:right}.c{text-align:center;font-size:16px}.g{display:flex;gap:30px;margin-top:10px;font-size:13px}.f{margin-top:50px;display:flex;gap:60px;font-size:12px}.f div{border-top:1px solid #333;padding-top:4px;min-width:200px}</style></head><body>' +
      "<h1>Sunsu Spa · " + (bod ? "Hoja de bodega " : "Transferencia ") + e(t.numero) + '</h1><div class="m">Estado: ' + e(t.estadoNombre) + " · Creada " + e(fecha(t.creadoAt)) + " por " + e(t.creadoPor) + "</div>" +
      '<div class="g"><div><b>Origen:</b> ' + e(t.origenNombre) + "</div><div><b>Destino:</b> " + e(t.destinoNombre) + "</div></div>" + (t.nota ? '<div class="m" style="margin-top:6px">Nota: ' + e(t.nota) + "</div>" : "") +
      "<table><thead><tr><th>#</th><th>SKU</th><th>Producto</th><th class=\"n\">Cantidad</th>" + (bod ? "<th>Listo</th><th>Observación</th>" : "") + "</tr></thead><tbody>" + rows + "</tbody></table>" +
      '<div class="m" style="margin-top:8px">' + e(t.items) + " ítems · " + e(q2(t.unidades)) + " unidades</div>" +
      '<div class="f"><div>Entrega</div><div>Recibe</div></div><script>setTimeout(function(){print()},300)<\/script></body></html>');
    w.document.close();
  }
  function wireDetalle(main) {
    var d = T.cur; if (!d) return;
    var v = main.querySelector("#mctr-volver"); if (v) v.onclick = function () { go("#/m/transferencias"); };
    // Sin botón «Editar» (TK55): en borrador se toca el dato y se abre el borrador para cambiarlo.
    main.querySelectorAll("[data-tr-tocar]").forEach(function (x) { x.onclick = function () { go("#/m/transferencias/editar/" + encodeURIComponent(d.transferencia.id)); }; });
    main.querySelectorAll("[data-tr-pdf]").forEach(function (b) { b.onclick = function () { pdf(d, b.getAttribute("data-tr-pdf")); }; });
    main.querySelectorAll("[data-tr-est]").forEach(function (b) {
      b.onclick = async function () {
        var que = b.getAttribute("data-tr-est"), extra = {};
        var msg = { enviar: "¿Enviar? Queda en tránsito hasta que se reciba.", recibir: "¿Recibir? Se mueve el stock: sale del origen y entra al destino.", cancelar: "" }[que];
        if (que === "cancelar") { var mo = prompt("Motivo de la cancelación"); if (mo == null) return; extra.motivo = mo; }
        else if (!confirm(msg)) return;
        b.disabled = true;
        var r = await api("trfb_estado", Object.assign({ id: d.transferencia.id, que: que }, extra));
        b.disabled = false;
        if (!r || r.error) { main.querySelector("#mctr-err").textContent = (r && r.error) || "No se pudo"; return; }
        T.prods = null;
        if (typeof draw === "function") draw();
      };
    });
  }

  window.MCTransferencias = {
    ensureList: async function () { if ((T.list || []).length) return true; await meta(); return !!(T.list || []).length; },
    render: async function (r) {
      css();
      if (r.sub === "t" && r.id) return renderDetalle(String(r.id));
      if (r.sub === "nueva") return renderForm("");
      if (r.sub === "editar" && r.id) return renderForm(String(r.id));
      return renderLista();
    },
    wire: function (main, r) { if (r.sub === "t") wireDetalle(main); else if (r.sub === "nueva" || r.sub === "editar") wireForm(main); else wireLista(main); },
    _t: T,
  };
})();
