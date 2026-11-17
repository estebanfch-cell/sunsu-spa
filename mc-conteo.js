// Conteo físico estilo MineCore (beta, 0045). Lista + crear (admin) + contar (asignada) + revisar (admin).
// Aprobar no mueve stock: el conteo queda como inventario físico inicial hasta que Emilia confirme.
(function () {
  var C = { meta: null, list: null, cur: null, q: "", est: "", soloDif: false, filtro: "", timers: {}, prods: null };
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v); }
  function q2(v) { var x = Number(v) || 0; return Math.round(x * 100) / 100 + ""; }
  function fecha(v) {
    var t = String(v || ""); if (!t) return "";
    if (/T\d\d:\d\d/.test(t)) { var d = new Date(t); if (!isNaN(d)) { var z = new Date(d.getTime() - 5 * 3600000).toISOString(); return z.slice(8, 10) + "/" + z.slice(5, 7) + "/" + z.slice(0, 4) + " " + z.slice(11, 16); } }
    return t.slice(0, 10).split("-").reverse().join("/");
  }
  var EST_CLS = { asignado: "a", en_conteo: "c", en_revision: "r", aprobado: "ok", cancelado: "x" };
  function chip(c) { return '<span class="mccf-chip ' + (EST_CLS[c.estado] || "") + '">' + e(c.estadoNombre || c.estado) + "</span>"; }
  function css() {
    if (document.getElementById("mccf-css")) return;
    var s = document.createElement("style"); s.id = "mccf-css";
    s.textContent = [
      ".mccf-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.mccf-bar input,.mccf-bar select{padding:8px 10px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit;font-size:.84rem}.mccf-bar input[type=search]{flex:1;min-width:200px}",
      ".mccf-t{width:100%;border-collapse:collapse;font-size:.84rem}.mccf-t th{text-align:left;font-size:.66rem;text-transform:uppercase;color:var(--navy-d);padding:7px;border-bottom:1px solid var(--cream-d)}.mccf-t td{padding:7px;border-bottom:1px solid var(--gray-l);vertical-align:middle}",
      ".mccf-t .num{text-align:right;white-space:nowrap}.mccf-row{cursor:pointer}.mccf-row:hover{background:var(--cream)}.mccf-sku{font-family:ui-monospace,Menlo,monospace;font-size:.76rem;color:var(--navy-d)}.mccf-sub{color:var(--gray);font-size:.72rem}",
      ".mccf-chip{display:inline-block;border-radius:999px;padding:3px 9px;font-size:.66rem;font-weight:800;background:var(--gray-l);color:var(--navy-d)}.mccf-chip.a{background:#e8eefb;color:#3b5b9a}.mccf-chip.c{background:#fff3d6;color:#9a6b00}.mccf-chip.r{background:#fde7e1;color:#b2452a}.mccf-chip.ok{background:#e6f4ea;color:#2e7d32}.mccf-chip.x{background:#eee;color:#888}",
      ".mccf-card{background:var(--white);border:1px solid var(--cream-d);border-radius:14px;padding:14px;margin-bottom:12px}.mccf-h{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.mccf-h h2{margin:0;font-size:1.15rem}",
      ".mccf-kpis{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.mccf-kpi{background:var(--cream);border-radius:10px;padding:7px 11px;font-size:.74rem}.mccf-kpi b{display:block;font-size:1rem}",
      ".mccf-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}.mccf-form label{display:flex;flex-direction:column;gap:4px;font-size:.72rem;font-weight:700;color:var(--navy-d)}.mccf-form input,.mccf-form select,.mccf-form textarea{padding:8px 9px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit;font-size:.84rem}",
      ".mccf-in{width:78px;padding:7px;border:1.5px solid var(--cream-d);border-radius:8px;font:inherit;text-align:right}.mccf-in:focus{border-color:var(--navy)}.mccf-ne{border:1.5px solid var(--cream-d);background:var(--white);border-radius:8px;padding:6px 8px;cursor:pointer;font:inherit;font-size:.72rem;white-space:nowrap}.mccf-ne.on{background:#fde7e1;border-color:#e3a593;color:#b2452a;font-weight:800}",
      ".mccf-dif-n{color:#b2452a;font-weight:800}.mccf-dif-p{color:#2e7d32;font-weight:800}.mccf-ln.ok td{background:#f6fbf7}.mccf-ln.dif td{background:#fff8f5}.mccf-ln.hit td{outline:2px solid var(--gold-m)}",
      ".mccf-sel{padding:6px;border:1.5px solid var(--cream-d);border-radius:8px;font:inherit;font-size:.74rem}.mccf-note{background:var(--gold-l);border:1px solid var(--gold-m);border-radius:10px;padding:8px 10px;font-size:.8rem;margin:8px 0}",
      ".mccf-hits{border:1px solid var(--cream-d);border-radius:10px;background:var(--white);margin:-4px 0 10px;max-height:240px;overflow:auto}.mccf-hits button{display:block;width:100%;text-align:left;border:none;border-bottom:1px solid var(--gray-l);background:none;padding:8px 10px;cursor:pointer;font:inherit;font-size:.8rem}.mccf-hits button:hover{background:var(--cream)}",
      ".mccf-dash{border:2px solid var(--gold-m);background:var(--gold-l)}.mccf-dash .row{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:6px 0;border-top:1px solid var(--gold-m)}",
      "@media(max-width:820px){.mccf-hide{display:none}.mccf-in{width:64px}}",
    ].join("");
    document.head.appendChild(s);
  }
  async function meta() { if (!C.meta) { var m = await api("cf_meta", {}); if (m && m.ok) C.meta = m; } return C.meta; }
  function opt(v, t, sel) { return '<option value="' + e(v) + '"' + (String(v) === String(sel) ? " selected" : "") + ">" + e(t) + "</option>"; }

  // ---------- Lista ----------
  function filas() {
    var q = String(C.q || "").toLowerCase();
    return (C.list || []).filter(function (c) {
      if (C.est && c.estado !== C.est) return false;
      if (!q) return true;
      return [c.numero, c.bodegaNombre, c.asignadoNombre, c.estadoNombre, c.nota].join(" ").toLowerCase().indexOf(q) >= 0;
    });
  }
  function filasHtml() {
    var r = filas();
    if (!r.length) return '<tr><td colspan="7" class="mccf-sub" style="padding:16px">' + ((C.list || []).length ? "Sin conteos con ese filtro." : "Todavía no hay conteos.") + "</td></tr>";
    return r.map(function (c) {
      return '<tr class="mccf-row" data-cf-go="' + e(c.id) + '"><td><b>' + e(c.numero) + '</b><div class="mccf-sub">' + e(fecha(c.creadoAt)) + "</div></td><td>" + e(c.bodegaNombre) + "</td><td>" + e(c.asignadoNombre || "—") + "</td><td>" + chip(c) + "</td>" +
        '<td class="num">' + (c.lineas ? e(c.contadas) + "/" + e(c.lineas) : "—") + '</td><td class="num mccf-hide">' + (c.conDiferencia ? '<span class="mccf-dif-n">' + e(c.conDiferencia) + "</span>" : "—") + '</td><td class="mccf-hide mccf-sub">' + e(c.nota || "") + "</td></tr>";
    }).join("");
  }
  function formNuevo(m) {
    return '<div class="mccf-card" id="mccf-nuevo" hidden><b>Nuevo conteo</b><p class="mccf-sub" style="margin:4px 0 10px">Se cuenta una bodega (o una cabina). La persona asignada lo ve en su inicio con un aviso. Al empezar se toma la foto del stock del sistema; aprobar no mueve stock.</p><div class="mccf-form">' +
      '<label>Bodega<select id="mccf-bod">' + m.bodegas.map(function (b) { return opt(b.id, b.nombre); }).join("") + "</select></label>" +
      '<label id="mccf-subw" hidden>Sububicación<select id="mccf-sub">' + opt("", "Toda la Bodega Cabina") + m.subsCabina.map(function (b) { return opt(b.id, b.nombre); }).join("") + "</select></label>" +
      '<label>Asignar a<select id="mccf-asg">' + opt("", "Elige quién cuenta…") + m.usuarios.map(function (u) { return opt(u.id, u.nombre); }).join("") + "</select></label>" +
      '<label>Familias (opcional)<input id="mccf-fam" placeholder="Ej. ML, HT (vacío = todo)"></label>' +
      '<label style="grid-column:1/-1">Nota<input id="mccf-nota" placeholder="Ej. Inventario físico inicial"></label></div>' +
      '<p class="err" id="mccf-err"></p><p><button class="btn small" type="button" id="mccf-crear">Crear y asignar</button> <button class="btn ghost small" type="button" id="mccf-cerrar">Cancelar</button></p></div>';
  }
  async function renderLista() {
    var m = await meta();
    var d = await api("cf_list", {});
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + "</p>";
    C.list = d.items || [];
    var adm = !!(m && m.admin);
    return '<div id="mccf-root">' + (d.falta ? '<p class="err">' + e(d.falta) + "</p>" : "") +
      '<div class="mccf-bar"><input type="search" id="mccf-q" placeholder="Buscar número, bodega o persona" value="' + e(C.q) + '">' +
      '<select id="mccf-est">' + opt("", "Todos los estados", C.est) + Object.keys((m && m.estados) || {}).map(function (k) { return opt(k, m.estados[k], C.est); }).join("") + "</select>" +
      (adm ? '<button class="btn small" type="button" id="mccf-mas">+ Nuevo conteo</button>' : "") + "</div>" +
      (adm && m ? formNuevo(m) : "") +
      '<div class="mccf-card" style="padding:0"><div class="sheet-scroll"><table class="mccf-t"><thead><tr><th>Número</th><th>Bodega</th><th>Asignado a</th><th>Estado</th><th class="num">Contados</th><th class="num mccf-hide">Diferencias</th><th class="mccf-hide">Nota</th></tr></thead><tbody id="mccf-body">' + filasHtml() + "</tbody></table></div></div>" +
      '<p class="mccf-sub">' + (adm ? "Ves todos los conteos, a quién están asignados y su estado." : "Ves los conteos asignados a ti.") + " Aprobar un conteo no mueve stock: queda como inventario físico inicial.</p></div>";
  }
  function wireLista(main) {
    var q = main.querySelector("#mccf-q"), b = main.querySelector("#mccf-body");
    if (q) q.oninput = function () { C.q = q.value; b.innerHTML = filasHtml(); };
    var es = main.querySelector("#mccf-est"); if (es) es.onchange = function () { C.est = es.value; b.innerHTML = filasHtml(); };
    var mas = main.querySelector("#mccf-mas"), nv = main.querySelector("#mccf-nuevo");
    if (mas && nv) mas.onclick = function () { nv.hidden = false; };
    var cer = main.querySelector("#mccf-cerrar"); if (cer) cer.onclick = function () { nv.hidden = true; };
    var bod = main.querySelector("#mccf-bod"), subw = main.querySelector("#mccf-subw");
    if (bod) bod.onchange = function () { subw.hidden = bod.value !== "CABINA"; };
    var cr = main.querySelector("#mccf-crear");
    if (cr) cr.onclick = async function () {
      var err = main.querySelector("#mccf-err"); err.textContent = "";
      cr.disabled = true;
      var r = await api("cf_crear", { bodega: bod.value, sububicacion: bod.value === "CABINA" ? main.querySelector("#mccf-sub").value : "", asignado_a: main.querySelector("#mccf-asg").value, familias: main.querySelector("#mccf-fam").value, nota: main.querySelector("#mccf-nota").value });
      cr.disabled = false;
      if (!r || r.error) { err.textContent = (r && r.error) || "No se pudo crear"; return; }
      go("#/m/conteos/cf/" + encodeURIComponent(r.id));
    };
    main.addEventListener("click", function (ev) { var t = ev.target.closest("[data-cf-go]"); if (t) go("#/m/conteos/cf/" + encodeURIComponent(t.getAttribute("data-cf-go"))); });
  }

  // ---------- Detalle ----------
  function difHtml(l) {
    if (l.estado === "pendiente") return '<span class="mccf-sub">—</span>';
    var d = Number(l.diferencia) || 0;
    return d < 0 ? '<span class="mccf-dif-n">' + q2(d) + "</span>" : d > 0 ? '<span class="mccf-dif-p">+' + q2(d) + "</span>" : '<span class="mccf-sub">0</span>';
  }
  function lineasVis() {
    var L = C.cur.lineas || [], f = String(C.filtro || "").trim();
    if (C.soloDif) L = L.filter(function (l) { return l.estado !== "pendiente" && Math.abs(Number(l.diferencia) || 0) > 1e-9; });
    if (f && window.MCBuscar) L = window.MCBuscar.filtrar(L, f, function (l) { return [[l.sku, l.barras || ""], [l.nombre]]; });
    return L;
  }
  function lineaHtml(l, can, cab) {
    var cls = l.estado === "pendiente" ? "" : Math.abs(Number(l.diferencia) || 0) > 1e-9 ? " dif" : " ok";
    var sub = cab ? '<select class="mccf-sel" data-cf-sub="' + e(l.id) + '"' + (can ? "" : " disabled") + '>' + opt("", l.sububicacion ? "Igual (" + nomSub(l.sububicacion) + ")" : "—", l.subContada) + C.meta.subsCabina.map(function (x) { return opt(x.id, x.nombre, l.subContada); }).join("") + opt("SIN", "Sin cabina", l.subContada) + "</select>" : "";
    return '<tr class="mccf-ln' + cls + '" data-cf-ln="' + e(l.id) + '"><td><span class="mccf-sku">' + e(l.sku) + "</span>" + (l.agregado ? ' <span class="mccf-chip a">agregado</span>' : "") + '<div class="mccf-sub">' + e(l.nombre) + "</div></td>" +
      '<td class="num">' + q2(l.sistema) + "</td>" +
      '<td class="num">' + (can ? '<input class="mccf-in" inputmode="decimal" data-cf-cant="' + e(l.id) + '" value="' + (l.contado == null ? "" : e(l.contado)) + '" placeholder="—"' + (l.estado === "no_encontrado" ? " disabled" : "") + ">" : l.estado === "no_encontrado" ? "0" : l.contado == null ? "—" : q2(l.contado)) + "</td>" +
      "<td>" + (can ? '<button type="button" class="mccf-ne' + (l.estado === "no_encontrado" ? " on" : "") + '" data-cf-ne="' + e(l.id) + '">No está</button>' : l.estado === "no_encontrado" ? '<span class="mccf-chip r">No está</span>' : "") + "</td>" +
      (cab ? '<td class="mccf-hide">' + sub + "</td>" : "") +
      '<td class="num">' + difHtml(l) + "</td></tr>";
  }
  function nomSub(c) { var x = (C.meta.subsCabina || []).find(function (s) { return s.id === c; }); return x ? x.nombre : c === "SIN" ? "Sin cabina" : c; }
  function tablaHtml() {
    var d = C.cur, can = d.puedeContar, cab = d.conteo.bodega === "CABINA";
    var L = lineasVis();
    return '<table class="mccf-t"><thead><tr><th>Producto</th><th class="num">Sistema</th><th class="num">Contado</th><th></th>' + (cab ? '<th class="mccf-hide">Sububicación real</th>' : "") + '<th class="num">Diferencia</th></tr></thead><tbody>' +
      (L.length ? L.map(function (l) { return lineaHtml(l, can, cab); }).join("") : '<tr><td colspan="6" class="mccf-sub" style="padding:14px">' + ((d.lineas || []).length ? "Sin productos con ese filtro." : "Sin líneas.") + "</td></tr>") + "</tbody></table>";
  }
  function kpisHtml(c) {
    return '<div class="mccf-kpis"><div class="mccf-kpi"><b>' + e(c.contadas) + "/" + e(c.lineas) + '</b>contados</div><div class="mccf-kpi"><b>' + e(c.pendientes) + '</b>pendientes</div><div class="mccf-kpi"><b>' + e(c.conDiferencia) + '</b>con diferencia</div>' +
      '<div class="mccf-kpi"><b class="mccf-dif-n">' + q2(c.faltan) + '</b>faltan (u)</div><div class="mccf-kpi"><b class="mccf-dif-p">+' + q2(c.sobran) + "</b>sobran (u)</div></div>";
  }
  function detalleHtml() {
    var d = C.cur, c = d.conteo;
    var acciones = "";
    if (d.puedeEmpezar) acciones += '<button class="btn small" type="button" id="mccf-empezar">Empezar conteo</button>';
    if (d.puedeContar) acciones += '<button class="btn small" type="button" id="mccf-enviar">Enviar a revisión</button>';
    if (d.puedeRevisar) acciones += '<button class="btn small" type="button" id="mccf-aprobar">Aprobar</button> <button class="btn ghost small" type="button" id="mccf-devolver">Devolver</button>';
    if (d.admin && ["asignado", "en_conteo", "en_revision"].indexOf(c.estado) >= 0) acciones += ' <button class="btn ghost small" type="button" id="mccf-cancelar">Cancelar conteo</button>';
    var aviso = "";
    if (c.estado === "asignado") aviso = '<div class="mccf-note">Al tocar <b>Empezar conteo</b> se toma la foto del stock del sistema en ' + e(c.bodegaNombre) + ". Luego cuenta cada producto (o búscalo / escanéalo).</div>";
    if (c.estado === "en_conteo" && c.revisionNota) aviso = '<div class="mccf-note"><b>Devuelto por revisión:</b> ' + e(c.revisionNota) + "</div>";
    if (c.estado === "en_revision") aviso = '<div class="mccf-note">Enviado a revisión ' + e(fecha(c.enviadoAt)) + ". " + (d.admin ? "Revisa las diferencias y aprueba o devuelve." : "Un admin lo revisará.") + "</div>";
    if (c.estado === "aprobado") aviso = '<div class="mccf-note">Aprobado por ' + e(c.aprobadoPor) + " · " + e(fecha(c.aprobadoAt)) + ". <b>No movió stock</b>: queda como inventario físico inicial hasta que se confirme el ajuste.</div>";
    var buscar = (d.puedeContar || (d.lineas || []).length) ? '<div class="mccf-bar"><input type="search" id="mccf-f" placeholder="' + (d.puedeContar ? "Buscar o escanear (código, SKU, nombre). Enter = ir al producto" : "Buscar en el conteo") + '" value="' + e(C.filtro) + '" autocomplete="off">' +
      '<label class="mccf-sub"><input type="checkbox" id="mccf-solodif"' + (C.soloDif ? " checked" : "") + "> Solo diferencias</label></div>" + (d.puedeContar ? '<div class="mccf-hits" id="mccf-hits" hidden></div>' : "") : "";
    return '<div id="mccf-root"><p><button class="btn ghost small" type="button" data-go="#/m/conteos">← Volver a la lista</button></p>' +
      '<div class="mccf-card"><div class="mccf-h"><h2>' + e(c.numero) + "</h2>" + chip(c) + '<span class="mccf-sub">' + e(c.bodegaNombre) + " · asignado a <b>" + e(c.asignadoNombre || "—") + "</b> · creado " + e(fecha(c.creadoAt)) + "</span></div>" +
      (c.nota ? '<div class="mccf-sub" style="margin-top:6px">' + e(c.nota) + "</div>" : "") + ((c.lineas || c.estado !== "asignado") ? kpisHtml(c) : "") + aviso +
      (acciones ? '<p style="margin:10px 0 0">' + acciones + '</p><p class="err" id="mccf-err"></p>' : "") + "</div>" +
      (c.estado === "asignado" ? "" : buscar + '<div class="mccf-card" style="padding:0"><div class="sheet-scroll" id="mccf-tabla">' + tablaHtml() + "</div></div>") + "</div>";
  }
  async function cargarCur(id) { var d = await api("cf_get", { id: id }); if (!d || d.error) return d || { error: "No se pudo cargar" }; C.cur = d; return null; }
  async function renderDetalle(id) {
    await meta();
    var er = await cargarCur(id);
    if (er) return '<p class="err">' + e(er.error) + '</p><button class="btn ghost small" type="button" data-go="#/m/conteos">← Volver a la lista</button>';
    // El aviso de este conteo se marca como leído al abrirlo.
    void api("notif_mias", {}).then(function (r) { var ids = ((r && r.items) || []).filter(function (x) { return !x.leida && x.link.indexOf(id) >= 0; }).map(function (x) { return x.id; }); if (ids.length) void api("notif_leer", { ids: ids }); });
    return detalleHtml();
  }
  function repintar(main) { var r = main.querySelector("#mccf-root"); if (!r) return; r.outerHTML = detalleHtml(); wireDetalle(main); }
  function repTabla(main) { var t = main.querySelector("#mccf-tabla"); if (t) t.innerHTML = tablaHtml(); }
  function lin(id) { return (C.cur.lineas || []).find(function (l) { return l.id === id; }); }
  function recalc() {
    var L = C.cur.lineas || [], c = C.cur.conteo;
    L.forEach(function (l) { l.diferencia = l.estado === "no_encontrado" ? -l.sistema : l.contado == null ? 0 : Math.round((l.contado - l.sistema) * 100) / 100; });
    var dif = L.filter(function (l) { return l.estado !== "pendiente" && Math.abs(l.diferencia) > 1e-9; });
    c.contadas = L.filter(function (l) { return l.estado !== "pendiente"; }).length; c.pendientes = L.length - c.contadas; c.lineas = L.length; c.conDiferencia = dif.length;
    c.faltan = dif.reduce(function (a, l) { return a + Math.min(0, l.diferencia); }, 0); c.sobran = dif.reduce(function (a, l) { return a + Math.max(0, l.diferencia); }, 0);
  }
  function pintarKpis(main) { var k = main.querySelector(".mccf-kpis"); if (k) k.outerHTML = kpisHtml(C.cur.conteo); }
  function guardarLinea(main, l) {
    clearTimeout(C.timers[l.id]);
    C.timers[l.id] = setTimeout(async function () {
      var r = await api("cf_guardar", { id: C.cur.conteo.id, lineas: [{ id: l.id, contado: l.contado, estado: l.estado, sub_contada: l.subContada || "" }] });
      var err = main.querySelector("#mccf-err"); if (err) err.textContent = r && r.error ? r.error : "";
    }, 450);
  }
  async function cargarProds() { if (C.prods) return C.prods; var d = await api("mcprod_list", {}); C.prods = (d && d.items || []).filter(function (p) { return p.tipo !== "servicio" && p.activo !== false; }); return C.prods; }
  function wireDetalle(main) {
    var d = C.cur; if (!d) return;
    var root = main.querySelector("#mccf-root"); if (!root) return;
    var err = function (t) { var x = main.querySelector("#mccf-err"); if (x) x.textContent = t || ""; };
    var btn = function (id, fn) { var b = root.querySelector(id); if (b) b.onclick = async function () { b.disabled = true; try { await fn(); } finally { b.disabled = false; } }; };
    btn("#mccf-empezar", async function () { var r = await api("cf_iniciar", { id: d.conteo.id }); if (!r || r.error) return err((r && r.error) || "No se pudo empezar"); await cargarCur(d.conteo.id); repintar(main); });
    btn("#mccf-enviar", async function () { await new Promise(function (ok) { setTimeout(ok, 500); }); var r = await api("cf_enviar", { id: d.conteo.id }); if (!r || r.error) return err((r && r.error) || "No se pudo enviar"); await cargarCur(d.conteo.id); repintar(main); });
    btn("#mccf-aprobar", async function () {
      if (!confirm("¿Aprobar " + d.conteo.numero + "?\nNo mueve stock: queda como inventario físico inicial.")) return;
      var r = await api("cf_revisar", { id: d.conteo.id, que: "aprobar" }); if (!r || r.error) return err((r && r.error) || "No se pudo aprobar"); await cargarCur(d.conteo.id); repintar(main);
    });
    btn("#mccf-devolver", async function () { var n = prompt("¿Qué hay que revisar o volver a contar?", ""); if (n === null) return; var r = await api("cf_revisar", { id: d.conteo.id, que: "devolver", nota: n }); if (!r || r.error) return err((r && r.error) || "No se pudo devolver"); await cargarCur(d.conteo.id); repintar(main); });
    btn("#mccf-cancelar", async function () { var n = prompt("Motivo para cancelar " + d.conteo.numero + ":", ""); if (n === null) return; var r = await api("cf_revisar", { id: d.conteo.id, que: "cancelar", nota: n }); if (!r || r.error) return err((r && r.error) || "No se pudo cancelar"); await cargarCur(d.conteo.id); repintar(main); });
    var sd = root.querySelector("#mccf-solodif"); if (sd) sd.onchange = function () { C.soloDif = sd.checked; repTabla(main); };
    var f = root.querySelector("#mccf-f"), hits = root.querySelector("#mccf-hits");
    if (f) {
      f.oninput = function () { C.filtro = f.value; repTabla(main); if (hits) void pintarHits(); };
      f.onkeydown = async function (ev) {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        var L = lineasVis();
        if (L.length >= 1 && d.puedeContar) { var inp = root.querySelector('[data-cf-cant="' + L[0].id + '"]'); if (inp) { inp.focus(); inp.select(); var tr = inp.closest("tr"); if (tr) tr.classList.add("hit"); } }
      };
    }
    async function pintarHits() {
      var qv = String(f.value || "").trim();
      if (!qv || lineasVis().length) { hits.hidden = true; return; }
      var ps = await cargarProds();
      var ya = {}; (d.lineas || []).forEach(function (l) { ya[l.productoId] = 1; });
      var H = (window.MCBuscar ? window.MCBuscar.filtrar(ps, qv, function (p) { return [[p.sku, p.skuVisible, p.skuProveedor].concat(p.barras || []), [p.nombre, p.marca]]; }) : []).filter(function (p) { return !ya[p.id]; }).slice(0, 8);
      hits.hidden = !H.length;
      hits.innerHTML = H.length ? '<div class="mccf-sub" style="padding:6px 10px">No está en la lista del conteo. ¿Lo encontraste aquí? Agrégalo:</div>' + H.map(function (p) { return '<button type="button" data-cf-add="' + e(p.id) + '"><span class="mccf-sku">' + e(p.skuVisible || p.sku) + "</span> " + e(p.nombre) + "</button>"; }).join("") : "";
    }
    if (hits) hits.onclick = async function (ev) {
      var b = ev.target.closest("[data-cf-add]"); if (!b) return;
      var cant = prompt("¿Cuántas unidades encontraste?", "1"); if (cant === null) return;
      var r = await api("cf_guardar", { id: d.conteo.id, agregar: { producto_id: b.getAttribute("data-cf-add"), contado: cant } });
      if (!r || r.error) return err((r && r.error) || "No se pudo agregar");
      C.filtro = ""; await cargarCur(d.conteo.id); repintar(main);
    };
    var tabla = root.querySelector("#mccf-tabla");
    if (tabla && d.puedeContar) {
      tabla.addEventListener("input", function (ev) {
        var i = ev.target.closest("[data-cf-cant]"); if (!i) return;
        var l = lin(i.getAttribute("data-cf-cant")); var v = String(i.value).replace(",", ".").trim();
        if (v !== "" && !(Number(v) >= 0)) return;
        l.contado = v === "" ? null : Number(v); l.estado = v === "" ? "pendiente" : "contado";
        recalc(); pintarKpis(main);
        var tr = i.closest("tr"), td = tr.lastElementChild; td.innerHTML = difHtml(l);
        tr.className = "mccf-ln" + (l.estado === "pendiente" ? "" : Math.abs(l.diferencia) > 1e-9 ? " dif" : " ok");
        guardarLinea(main, l);
      });
      tabla.addEventListener("keydown", function (ev) {
        var i = ev.target.closest("[data-cf-cant]"); if (!i || ev.key !== "Enter") return;
        ev.preventDefault(); var all = [].slice.call(tabla.querySelectorAll("[data-cf-cant]:not([disabled])")); var k = all.indexOf(i); if (all[k + 1]) { all[k + 1].focus(); all[k + 1].select(); }
      });
      tabla.addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-cf-ne]"); if (!b) return;
        var l = lin(b.getAttribute("data-cf-ne"));
        if (l.estado === "no_encontrado") { l.estado = "pendiente"; l.contado = null; } else { l.estado = "no_encontrado"; l.contado = null; }
        recalc(); pintarKpis(main); repTabla(main); guardarLinea(main, l);
      });
      tabla.addEventListener("change", function (ev) {
        var s = ev.target.closest("[data-cf-sub]"); if (!s) return;
        var l = lin(s.getAttribute("data-cf-sub")); l.subContada = s.value; guardarLinea(main, l);
      });
    }
  }

  // ---------- Tarjeta «Asignado a ti» del inicio ----------
  async function tarjetaInicio() {
    css();
    var r = await Promise.all([api("cf_list", { mios: true }), api("notif_mias", {})]);
    var mios = (r[0] && r[0].items) || [], nt = (r[1] && r[1].items) || [];
    var sinLeer = nt.filter(function (x) { return !x.leida; });
    if (!mios.length && !sinLeer.length) return "";
    var avisos = sinLeer.filter(function (x) { return !mios.some(function (c) { return x.link.indexOf(c.id) >= 0; }); }).slice(0, 4);
    return '<div class="card mccf-dash" id="mccf-dash"><div class="card-title">📋 Asignado a ti' + (sinLeer.length ? ' <span class="mccf-chip r">' + sinLeer.length + " aviso" + (sinLeer.length > 1 ? "s" : "") + "</span>" : "") + "</div>" +
      mios.map(function (c) {
        var nuevo = sinLeer.some(function (x) { return x.link.indexOf(c.id) >= 0; });
        return '<div class="row"><div><b>Conteo físico ' + e(c.numero) + "</b> " + chip(c) + (nuevo ? ' <span class="mccf-chip r">nuevo</span>' : "") + '<div class="mccf-sub">' + e(c.bodegaNombre) + (c.lineas ? " · " + e(c.contadas) + "/" + e(c.lineas) + " contados" : "") + (c.revisionNota ? " · devuelto: " + e(c.revisionNota) : "") + "</div></div>" +
          '<button class="btn small" type="button" data-cf-abrir="' + e(c.id) + '">' + (c.estado === "asignado" ? "Abrir conteo" : "Seguir contando") + "</button></div>";
      }).join("") +
      avisos.map(function (x) { return '<div class="row"><div><b>' + e(x.titulo) + '</b><div class="mccf-sub">' + e(x.cuerpo) + " · " + e(fecha(x.fecha)) + '</div></div><button class="btn ghost small" type="button" data-cf-aviso="' + e(x.id) + '" data-link="' + e(x.link) + '">Abrir</button></div>'; }).join("") + "</div>";
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("[data-cf-abrir]");
    if (a) {
      var id = a.getAttribute("data-cf-abrir");
      void api("notif_mias", {}).then(function (r) { var ids = ((r && r.items) || []).filter(function (x) { return !x.leida && x.link.indexOf(id) >= 0; }).map(function (x) { return x.id; }); if (ids.length) void api("notif_leer", { ids: ids }); });
      go("#/m/conteos/cf/" + encodeURIComponent(id)); return;
    }
    var v = ev.target.closest && ev.target.closest("[data-cf-aviso]");
    if (v) { void api("notif_leer", { ids: [v.getAttribute("data-cf-aviso")] }); go(v.getAttribute("data-link") || "#/m/conteos"); }
  });

  window.MCConteo = {
    render: async function (route) {
      css();
      if (route.sub === "cf" && route.id) return renderDetalle(String(route.id));
      C.cur = null;
      return renderLista();
    },
    wire: function (main, route) { if (route.sub === "cf") wireDetalle(main); else wireLista(main); },
    tarjetaInicio: tarjetaInicio,
    _css: css,
    _c: C,
  };
})();
