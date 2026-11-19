// Conteo físico estilo MineCore (beta, 0045). Lista + crear + contar (asignada) + revisar (admin).
// Aprobar no mueve stock: el conteo queda como inventario físico inicial hasta que Emilia confirme.
(function () {
  var C = { meta: null, list: null, cur: null, general: null, sec: null, q: "", est: "", soloDif: false, filtro: "", timers: {}, prods: null, dirty: {}, menu: null, otra: null, pad: false, focus: null, saved: true, hits: null, zonas: null, zEdit: {}, zNew: false };
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
      /* Dark MineCore theme, scoped to conteo. Logo and Sunsu nav stay. */
      "body:has(#cc) .app,body:has(#mccf-root) .app{background:#0b1219}",
      "body:has(#cc) #content,body:has(#mccf-root) #content{background:#0b1219;color:#dce6f0}",
      "body:has(#cc) .top,body:has(#mccf-root) .top{background:#0b131c;border-color:#1c2a3a}",
      "body:has(#cc) .top h1,body:has(#mccf-root) .top h1{color:#f2f6fa;text-transform:uppercase;letter-spacing:.06em;font-size:17px;font-weight:800}",
      "#cc,#mccf-root{color:#dce6f0;font-size:13px}",
      "#cc .chip,#mccf-root .chip{background:#0f1720;border:1px solid #223142;color:#dce6f0;border-radius:20px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer}",
      "#cc .cbz-btn,#mccf-root .cbz-btn{background:#1e4976;border:0;color:#fff;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer}",
      "#cc .cbz-card,#mccf-root .cbz-card{background:#0f1720;border:1px solid #223142;border-radius:12px;padding:12px 14px}",
      "#cc .cbz-muted,#mccf-root .cbz-muted{color:#8fa3b8}",
      "#cc .uinput,#mccf-root .uinput{background:#0b1219;border:1px solid #33506e;color:#dce6f0;border-radius:8px;padding:8px 10px;font-size:14px;height:40px;box-sizing:border-box}",
      "#cc .cc-t,#mccf-root .cc-t{width:100%;border-collapse:collapse;font-size:12.5px}",
      "#cc .cc-t th,#mccf-root .cc-t th{text-align:left;font-size:11px;color:#8fa3b8;padding:6px 7px;border-bottom:1px solid #26405c;font-weight:600}",
      "#cc .cc-t td,#mccf-root .cc-t td{padding:6px 7px;border-bottom:1px solid #1c2a3a;vertical-align:middle;color:#dce6f0}",
      "#cc .cc-t .r,#mccf-root .cc-t .r{text-align:right}",
      "#cc .cc-t tr[data-cf-sec],#mccf-root .cc-t tr[data-cf-sec]{cursor:pointer}",
      "#cc .st-pill,#mccf-root .st-pill{display:inline-block;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;border:1px solid;background:transparent;white-space:nowrap}",
      "#cc .st-pill.pend,#mccf-root .st-pill.pend{border-color:#8fa3b8;color:#8fa3b8}",
      "#cc .st-pill.c,#mccf-root .st-pill.c{border-color:#f0c040;color:#f0c040}",
      "#cc .st-pill.r,#mccf-root .st-pill.r{border-color:#5cc8ff;color:#5cc8ff}",
      "#cc .st-pill.ok,#mccf-root .st-pill.ok{border-color:#6fd68f;color:#6fd68f}",
      "#cc .cc-row,#mccf-root .cc-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}",
      "#cc .cc-topbtns,#mccf-root .cc-topbtns{display:flex;gap:6px;align-items:stretch;margin:0 0 8px;flex-wrap:nowrap}",
      "#cc .cc-topbtns .cbz-btn,#cc .cc-topbtns .chip,#mccf-root .cc-topbtns .cbz-btn,#mccf-root .cc-topbtns .chip{flex:1 1 0;min-width:0;white-space:normal;text-align:center;line-height:1.2;padding:7px 8px;font-size:12px;height:auto;min-height:40px;display:inline-flex;align-items:center;justify-content:center}",
      /* Barra de abajo oscura en pantallas de conteo, como MineCore. */
      "body:has(#cc) .tabbar,body:has(#mccf-root) .tabbar{background:#0d1722;border-top-color:#26405c;box-shadow:0 -4px 16px rgba(0,0,0,.35)}",
      "body:has(#cc) .tab,body:has(#mccf-root) .tab{color:#8fa3b8}",
      "body:has(#cc) .tab.on,body:has(#mccf-root) .tab.on,body:has(#cc) .tab.on span,body:has(#mccf-root) .tab.on span{color:#dce6f0}",
      "body:has(#cc) .tab-plus,body:has(#mccf-root) .tab-plus{border-color:#0d1722}",
      "body:has(#cc) .tab-more,body:has(#mccf-root) .tab-more{color:#8fa3b8}",
      "body:has(#cc) .tab-more.on,body:has(#mccf-root) .tab-more.on{color:#b7f34a}",
      "#cc .cc-top,#mccf-root .cc-top{position:sticky;top:0;z-index:6;display:flex;gap:8px;align-items:center;background:#0b131c;padding:6px 0}",
      "#cc .cc-top input,#mccf-root .cc-top input{flex:1;min-width:0;height:40px;font-size:15px;background:#0b1219;border:1.5px solid #f0c040;color:#f2f6fa;border-radius:8px;padding:0 10px;box-sizing:border-box}",
      "#cc .cc-prog,#mccf-root .cc-prog{font-size:13px;white-space:nowrap;color:#c9d6e3}",
      "#cc .cc-prog b,#mccf-root .cc-prog b{color:#b7f34a;font-size:15px}",
      "#cc .cc-kb,#mccf-root .cc-kb{flex:0 0 auto;min-width:44px;height:40px;padding:0 8px;border-radius:8px;border:1px solid #33506e;background:#102018;color:#b7f34a;font-weight:700;font-size:12px}",
      "#cc .cc-kb.on,#mccf-root .cc-kb.on{background:#1a3a20;border-color:#b7f34a}",
      "#cc .cc-list,#mccf-root .cc-list{background:#0f1a26;border:1px solid #1f3247;border-radius:12px;overflow:hidden}",
      "#cc .cc-ln,#mccf-root .cc-ln{display:flex;align-items:center;gap:8px;padding:5px 8px;min-height:48px;box-sizing:border-box;border-bottom:1px solid #1c2a3a}",
      "#cc .cc-nm,#mccf-root .cc-nm{font-weight:700;font-size:13px;color:#f2f6fa;line-height:1.22;white-space:normal;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden}",
      "#cc .cc-cd,#mccf-root .cc-cd{font-size:11.5px;color:#8fa3b8;white-space:normal;line-height:1.3}",
      "#cc .cc-sub,#mccf-root .cc-sub{flex:0 0 auto;text-align:right;font-size:12.5px;color:#dbe6f0;white-space:nowrap;line-height:1.25}",
      "#cc .cc-mn,#mccf-root .cc-mn{flex:0 0 24px;height:40px;background:none;border:none;color:#8fa3b8;font-size:20px;padding:0;cursor:pointer}",
      "#cc .cc-mpop,#mccf-root .cc-mpop{display:flex;gap:6px;flex-wrap:wrap;padding:8px;background:#13202e;border-bottom:1px solid #1c2a3a}",
      "#cc .cc-bq,#mccf-root .cc-bq{font-size:12.5px;margin:0 0 6px;padding:6px 8px;border:1px solid #f0c040;border-radius:10px;display:flex;gap:4px;flex-wrap:wrap;align-items:center}",
      "#cc .cc-rved,#mccf-root .cc-rved{margin:0 0 8px;padding:8px 10px;border:1px solid #f0c040;border-radius:10px;background:#2a2208;color:#f6e7b2;font-size:12px}",
      "#cc .cc-pend,#mccf-root .cc-pend{margin-right:auto;font-size:12.5px;color:#f0c040;align-self:center;white-space:nowrap}",
      "#cc .cc-addbtn,#mccf-root .cc-addbtn{white-space:nowrap;min-height:40px;flex:0 0 auto}",
      "#cc .cc-bar,#mccf-root .cc-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;background:#0d1722;border-top:1px solid #26405c;padding:8px;position:sticky;bottom:0;z-index:5}",
      "#cc .cc-k,#mccf-root .cc-k{color:#8fa3b8;font-size:11px}",
      "#cc .cc-secbar,#mccf-root .cc-secbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}",
      "#cc .cc-secbar h2,#mccf-root .cc-secbar h2{margin:0;font-size:16px;font-weight:800;color:#f2f6fa;display:flex;align-items:center;gap:8px;flex:1;min-width:0}",
      "#cc .cc-when,#mccf-root .cc-when{color:#8fa3b8;font-size:11px;white-space:nowrap}",
      "#cc .cc-help,#mccf-root .cc-help{color:#8fa3b8;font-size:12px;margin:6px 0;line-height:1.4}",
      "#cc .cc-gmeta,#mccf-root .cc-gmeta{color:#8fa3b8;font-size:12px;margin-top:2px}",
      "#cc .cc-gstats,#mccf-root .cc-gstats{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;font-size:13px}",
      "#cc .cc-progbar,#mccf-root .cc-progbar{height:6px;background:#1c2a3a;border-radius:4px;margin-top:8px;overflow:hidden}",
      "#cc .cc-progbar>i,#mccf-root .cc-progbar>i{display:block;height:100%;background:#6fd68f;border-radius:4px}",
      "#cc .cc-hoy,#mccf-root .cc-hoy{margin-top:8px;font-size:13px}",
      "#cc .cc-lug,#mccf-root .cc-lug{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid #1c2a3a}",
      "#cc .cc-lug:first-of-type,#mccf-root .cc-lug:first-of-type{border-top:0}",
      "#cc .cc-numpad,#mccf-root .cc-numpad{display:none;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0;padding:8px;background:#0f1720;border:1px solid #223142;border-radius:12px}",
      "#cc .cc-numpad.on,#mccf-root .cc-numpad.on{display:grid}",
      "#cc .cc-numpad button,#mccf-root .cc-numpad button{height:44px;background:#16273a;border:1px solid #33506e;color:#f2f6fa;border-radius:8px;font-weight:700;font-size:16px}",
      "#cc .cc-hits,#mccf-root .cc-hits{border:1px solid #33506e;border-radius:10px;background:#0f1a26;margin:0 0 8px;max-height:240px;overflow:auto}",
      "#cc .cc-hits button,#mccf-root .cc-hits button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #1c2a3a;background:none;padding:10px 12px;cursor:pointer;font:inherit;font-size:13px;color:#e8eef6}",
      "#mccf-root .err{color:#ff8a8a}",
      "@media(max-width:430px){#cc .cc-top,#mccf-root .cc-top{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center}#cc .cc-top input,#mccf-root .cc-top input{grid-column:1;grid-row:1;width:100%}#cc .cc-kb,#mccf-root .cc-kb{grid-column:2;grid-row:1}#cc .cc-prog,#mccf-root .cc-prog{grid-column:3;grid-row:1}#cc .cc-top .cc-addbtn,#mccf-root .cc-top .cc-addbtn{grid-column:1/-1;grid-row:2;width:100%}}",
      "@media(max-width:1199px){#cc .cc-hm,#mccf-root .cc-hm{display:none}}",
      "html body #cc input.cc-q,html body #mccf-root input.cc-q{flex:0 0 58px!important;width:58px!important;min-width:58px!important;height:40px!important;box-sizing:border-box!important;text-align:center!important;font-size:17px!important;font-weight:700!important;color:#f4ffe4!important;-webkit-text-fill-color:#f4ffe4!important;background:#102018!important;border:1px solid rgba(183,243,74,.55)!important;border-radius:9px!important;padding:0!important;box-shadow:none!important;caret-color:#b7f34a!important}",
      "html body #cc input.cc-q.cc-vacio,html body #mccf-root input.cc-q.cc-vacio{background:rgba(183,243,74,.16)!important;border:2px solid #b7f34a!important}",
      "html body #cc input.cc-q.cc-dirty,html body #mccf-root input.cc-q.cc-dirty{border-color:#f0c040!important;background:#2a2410!important}",
      "html body #cc input.cc-q:focus,html body #mccf-root input.cc-q:focus{border:2px solid #d8ff6a!important;box-shadow:0 0 0 3px rgba(183,243,74,.45)!important;background:rgba(183,243,74,.24)!important;outline:none!important}"
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
        '<td class="num">' + (c.lineas ? e(c.contadas) + "/" + e(c.lineas) : "—") + '</td><td class="num mccf-hide">' + (c.conDiferencia == null ? "—" : c.conDiferencia ? '<span class="mccf-dif-n">' + e(c.conDiferencia) + "</span>" : "—") + '</td><td class="mccf-hide mccf-sub">' + e(c.nota || "") + "</td></tr>";
    }).join("");
  }
  function formNuevo(m, adm) {
    var txt = adm
      ? "Se cuenta una bodega (o una cabina). La persona asignada lo ve en su inicio con un aviso. Al empezar se toma la foto del stock del sistema; aprobar no mueve stock."
      : "Elige la bodega o cabina y cuenta lo que ves. Al terminar, un admin lo revisa. Aprobar no mueve el stock hasta que Emilia lo confirme.";
    return '<div class="mccf-card" id="mccf-nuevo" hidden><b>Nuevo conteo</b><p class="mccf-sub" style="margin:4px 0 10px">' + txt + '</p><div class="mccf-form">' +
      '<label>Bodega<select id="mccf-bod">' + (m.bodegas || []).map(function (b) { return opt(b.id, b.nombre); }).join("") + "</select></label>" +
      '<label id="mccf-subw" hidden>Sububicación<select id="mccf-sub">' + opt("", "Toda la Bodega Cabina") + (m.subsCabina || []).map(function (b) { return opt(b.id, b.nombre); }).join("") + "</select></label>" +
      (adm ? '<label>Asignar a<select id="mccf-asg">' + opt("", "Elige quién cuenta…") + (m.usuarios || []).map(function (u) { return opt(u.id, u.nombre); }).join("") + "</select></label>" : "") +
      '<label>Familias (opcional)<input id="mccf-fam" placeholder="Ej. ML, HT (vacío = todo)"></label>' +
      '<label style="grid-column:1/-1">Nota<input id="mccf-nota" placeholder="Ej. Inventario físico inicial"></label></div>' +
      '<p class="err" id="mccf-err"></p><p><button class="btn small" type="button" id="mccf-crear">' + (adm ? "Crear y asignar" : "Crear conteo") + '</button> <button class="btn ghost small" type="button" id="mccf-cerrar">Cancelar</button></p></div>';
  }
  async function renderHojas() {
    var m = await meta();
    var d = await api("cf_list", {});
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + "</p>";
    C.list = d.items || [];
    var adm = !!(m && m.admin);
    return '<div id="mccf-root">' + (d.falta ? '<p class="err">' + e(d.falta) + "</p>" : "") +
      '<div class="mccf-bar"><input type="search" id="mccf-q" placeholder="Buscar número, bodega o persona" value="' + e(C.q) + '">' +
      '<select id="mccf-est">' + opt("", "Todos los estados", C.est) + Object.keys((m && m.estados) || {}).map(function (k) { return opt(k, m.estados[k], C.est); }).join("") + "</select>" +
      (m ? '<button class="btn small" type="button" id="mccf-mas">+ Nuevo conteo</button>' : "") + "</div>" +
      (m ? formNuevo(m, adm) : "") +
      '<div class="mccf-card" style="padding:0"><div class="sheet-scroll"><table class="mccf-t"><thead><tr><th>Número</th><th>Bodega</th><th>Asignado a</th><th>Estado</th><th class="num">Contados</th><th class="num mccf-hide">Diferencias</th><th class="mccf-hide">Nota</th></tr></thead><tbody id="mccf-body">' + filasHtml() + "</tbody></table></div></div>" +
      '<p class="mccf-sub">' + (adm ? "Ves todos los conteos, a quién están asignados y su estado." : "Ves los conteos asignados a ti.") + " Aprobar un conteo no mueve stock: queda como inventario físico inicial.</p></div>";
  }
  function wireHojas(main) {
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
      var asg = main.querySelector("#mccf-asg");
      var r = await api("cf_crear", { bodega: bod.value, sububicacion: bod.value === "CABINA" ? main.querySelector("#mccf-sub").value : "", asignado_a: asg ? asg.value : "", familias: main.querySelector("#mccf-fam").value, nota: main.querySelector("#mccf-nota").value });
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
    if (C.soloDif && !ciego()) L = L.filter(function (l) { return l.estado !== "pendiente" && Math.abs(Number(l.diferencia) || 0) > 1e-9; });
    if (f && window.MCBuscar) L = window.MCBuscar.filtrar(L, f, function (l) { return [[l.sku, l.barras || ""], [l.nombre]]; });
    return L;
  }
  function ciego() { return !!(C.cur && C.cur.ciego); }
  function clsLinea(l) { return l.estado === "pendiente" ? "" : !ciego() && Math.abs(Number(l.diferencia) || 0) > 1e-9 ? " dif" : " ok"; }
  function lineaHtml(l, can, cab) {
    var cls = clsLinea(l), bl = ciego();
    var sub = cab ? '<select class="mccf-sel" data-cf-sub="' + e(l.id) + '"' + (can ? "" : " disabled") + '>' + opt("", l.sububicacion ? "Igual (" + nomSub(l.sububicacion) + ")" : "—", l.subContada) + C.meta.subsCabina.map(function (x) { return opt(x.id, x.nombre, l.subContada); }).join("") + opt("SIN", "Sin cabina", l.subContada) + "</select>" : "";
    return '<tr class="mccf-ln' + cls + '" data-cf-ln="' + e(l.id) + '"><td><span class="mccf-sku">' + e(l.sku) + "</span>" + (l.agregado ? ' <span class="mccf-chip a">agregado</span>' : "") + '<div class="mccf-sub">' + e(l.nombre) + "</div></td>" +
      (bl ? "" : '<td class="num">' + q2(l.sistema) + "</td>") +
      '<td class="num">' + (can ? '<input class="mccf-in" inputmode="decimal" data-cf-cant="' + e(l.id) + '" value="' + (l.contado == null ? "" : e(l.contado)) + '" placeholder="—"' + (l.estado === "no_encontrado" ? " disabled" : "") + ">" : l.estado === "no_encontrado" ? "0" : l.contado == null ? "—" : q2(l.contado)) + "</td>" +
      "<td>" + (can ? '<button type="button" class="mccf-ne' + (l.estado === "no_encontrado" ? " on" : "") + '" data-cf-ne="' + e(l.id) + '">No está</button>' : l.estado === "no_encontrado" ? '<span class="mccf-chip r">No está</span>' : "") + "</td>" +
      (cab ? '<td class="mccf-hide">' + sub + "</td>" : "") +
      (bl ? "" : '<td class="num">' + difHtml(l) + "</td>") + "</tr>";
  }
  function nomSub(c) { var x = (C.meta.subsCabina || []).find(function (s) { return s.id === c; }); return x ? x.nombre : c === "SIN" ? "Sin cabina" : c; }
  function tablaHtml() {
    var d = C.cur, can = d.puedeContar, cab = d.conteo.bodega === "CABINA";
    var L = lineasVis();
    var bl = ciego();
    return '<table class="mccf-t"><thead><tr><th>Producto</th>' + (bl ? "" : '<th class="num">Sistema</th>') + '<th class="num">Contado</th><th></th>' + (cab ? '<th class="mccf-hide">Sububicación real</th>' : "") + (bl ? "" : '<th class="num">Diferencia</th>') + "</tr></thead><tbody>" +
      (L.length ? L.map(function (l) { return lineaHtml(l, can, cab); }).join("") : '<tr><td colspan="6" class="mccf-sub" style="padding:14px">' + ((d.lineas || []).length ? "Sin productos con ese filtro." : "Sin líneas.") + "</td></tr>") + "</tbody></table>";
  }
  function kpisHtml(c) {
    if (ciego()) return '<div class="mccf-kpis"><div class="mccf-kpi"><b>' + e(c.contadas) + "/" + e(c.lineas) + '</b>contados</div><div class="mccf-kpi"><b>' + e(c.pendientes) + '</b>pendientes</div></div>';
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
    if (c.estado === "asignado") aviso = '<div class="mccf-note">' + (ciego() ? "Conteo a ciegas: cuenta lo que ves en " + e(c.bodegaNombre) + " producto por producto (o búscalo / escanéalo). No se muestra la cantidad del sistema." : "Al tocar <b>Empezar conteo</b> se toma la foto del stock del sistema en " + e(c.bodegaNombre) + ". Luego cuenta cada producto (o búscalo / escanéalo).") + "</div>";
    if (c.estado === "en_conteo" && c.revisionNota) aviso = '<div class="mccf-note"><b>Devuelto por revisión:</b> ' + e(c.revisionNota) + "</div>";
    if (c.estado === "en_revision") aviso = '<div class="mccf-note">Enviado a revisión ' + e(fecha(c.enviadoAt)) + ". " + (d.admin ? "Revisa las diferencias y aprueba o devuelve." : "Un admin lo revisará.") + "</div>";
    if (c.estado === "aprobado") aviso = '<div class="mccf-note">Aprobado por ' + e(c.aprobadoPor) + " · " + e(fecha(c.aprobadoAt)) + ". <b>No movió stock</b>: queda como inventario físico inicial hasta que se confirme el ajuste.</div>";
    var buscar = (d.puedeContar || (d.lineas || []).length) ? '<div class="mccf-bar"><input type="search" id="mccf-f" placeholder="' + (d.puedeContar ? "Buscar o escanear (código, SKU, nombre). Enter = ir al producto" : "Buscar en el conteo") + '" value="' + e(C.filtro) + '" autocomplete="off">' +
      (ciego() ? "" : '<label class="mccf-sub"><input type="checkbox" id="mccf-solodif"' + (C.soloDif ? " checked" : "") + "> Solo diferencias</label>") + "</div>" + (d.puedeContar ? '<div class="mccf-hits" id="mccf-hits" hidden></div>' : "") : "";
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
    if (ciego()) { c.contadas = L.filter(function (l) { return l.estado !== "pendiente"; }).length; c.pendientes = L.length - c.contadas; c.lineas = L.length; return; }
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
        var tr = i.closest("tr");
        if (!ciego()) tr.lastElementChild.innerHTML = difHtml(l);
        tr.className = "mccf-ln" + clsLinea(l);
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


  function pill(est, nombre) {
    var cls = est === "en_revision" ? "r" : est === "en_conteo" ? "c" : est === "aprobada" ? "ok" : "pend";
    return '<span class="st-pill ' + cls + '">' + e(nombre || est) + "</span>";
  }
  function topBtns() {
    return '<div class="cc-topbtns">' +
      '<button class="cbz-btn" type="button" id="mccf-nuevo-g">＋ Nuevo conteo general</button>' +
      '<button class="chip" type="button" data-go="#/m/conteos/secciones">⚙ Secciones</button>' +
      '<button class="chip" type="button" data-go="#/m/conteos/hojas">📋 Hojas sueltas (antes)</button></div>';
  }
  async function renderLista() {
    var m = await meta();
    var d = await api("cf_list", {});
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + "</p>";
    C.list = d.items || [];
    var adm = !!(d.admin || (m && m.admin));
    var abiertos = C.list.filter(function (c) { return c.tipo === "general" && c.estado !== "cancelado" && c.estado !== "aprobado"; });
    var activo = abiertos[0];
    var h = '<div id="cc"><div id="mccf-root">' + (d.falta ? '<p class="err">' + e(d.falta) + "</p>" : "") + topBtns();
    if (!activo) {
      h += '<div class="cbz-card"><p class="cc-help">No hay un conteo general abierto. Si aún no hay secciones, créalas en ⚙ Secciones (el catálogo empieza vacío). El inventario sigue vivo: el sistema toma el stock al iniciar cada sección. Puedes guardar, salir y volver.</p></div>';
      return h + "</div></div>";
    }
    var g = await api("cf_get_general", { id: activo.id });
    if (!g || g.error) return h + '<p class="err">' + e((g && g.error) || "No se pudo abrir el conteo") + "</p></div>";
    C.general = g;
    var c = g.conteo, SS = g.secciones || [], ap = Number(c.aprobadas) || 0, tot = Number(c.total) || SS.length;
    h += '<div class="cbz-card"><div style="min-width:0"><b style="font-size:15px;white-space:nowrap">' + e(c.numero) + '</b><div class="cc-gmeta">· Local · 👤 ' + e(c.asignadoNombre || "—") + "</div></div>" +
      '<div class="cc-row"><span style="white-space:nowrap;font-size:12.5px">Aprobadas <b>' + ap + "/" + tot + "</b>" + (c.porRevisar ? ' · <b style="color:#5cc8ff">' + e(c.porRevisar) + " por revisar</b>" : "") + "</span>" +
      (adm ? '<button class="chip" type="button" id="mccf-plan">🗓 Plan del mes</button><button class="chip" type="button" id="mccf-reasig">👤 Reasignar</button><button class="chip" type="button" id="mccf-cancelar-g" style="color:#e05c5c">✕ Cancelar</button>' : "") + "</div>" +
      '<div class="cc-progbar"><i style="width:' + Math.round(100 * ap / Math.max(1, tot)) + '%"></i></div>' +
      (c.hoyToca ? '<div class="cc-hoy">📅 Hoy toca: <b>' + e(c.hoyToca) + "</b></div>" : "") +
      '<div class="cc-help">Toca una sección para abrirla (si está pendiente, se inicia sola). El inventario sigue vivo: el sistema toma el stock al iniciar la sección. Puedes guardar, salir y volver.</div></div>';
    h += '<div class="cbz-card" style="padding:4px 6px;overflow-x:auto;margin-top:10px"><table class="cc-t"><thead><tr><th>Sección</th><th>Estado</th><th class="r">Cont.</th></tr></thead><tbody>' +
      SS.map(function (s) {
        return '<tr data-cf-sec="' + e(s.id) + '" data-cf-est="' + e(s.estado) + '"><td><b>' + e(s.nombre) + "</b></td><td>" + pill(s.estado, s.estadoNombre) + '</td><td class="r">' + e(s.contLabel || "—") + "</td></tr>";
      }).join("") + "</tbody></table></div></div></div>";
    return h;
  }
  function wireLista(main) {
    var nv = main.querySelector("#mccf-nuevo-g");
    if (nv) nv.onclick = async function () {
      nv.disabled = true;
      var r = await api("cf_crear_general", {});
      nv.disabled = false;
      if (!r || r.error) return alert((r && r.error) || "No se pudo crear");
      go("#/m/conteos/cf/" + encodeURIComponent(r.id));
    };
    main.querySelectorAll("[data-go]").forEach(function (b) { b.onclick = function () { go(b.getAttribute("data-go")); }; });
    var g = C.general, c = g && g.conteo;
    var re = main.querySelector("#mccf-reasig");
    if (re && c) re.onclick = async function () {
      var m = await meta();
      var opts = (m.usuarios || []).map(function (u) { return u.nombre + " (" + u.id + ")"; }).join("\n");
      var v = prompt("Reasignar a (escribe el nombre o el id):\n" + opts, c.asignadoNombre || "");
      if (v == null) return;
      var u = (m.usuarios || []).find(function (x) { return x.id === v.trim() || (x.nombre || "").toLowerCase() === v.trim().toLowerCase(); });
      if (!u) return alert("No encontré a esa persona");
      var r = await api("cf_asignar", { id: c.id, asignado_a: u.id });
      if (!r || r.error) return alert((r && r.error) || "No se pudo reasignar");
      go("#/m/conteos");
    };
    var cg = main.querySelector("#mccf-cancelar-g");
    if (cg && c) cg.onclick = async function () {
      var n = prompt("Motivo para cancelar " + c.numero + ":", "");
      if (n === null) return;
      var r = await api("cf_revisar", { id: c.id, que: "cancelar", nota: n });
      if (!r || r.error) return alert((r && r.error) || "No se pudo cancelar");
      go("#/m/conteos");
    };
    var pl = main.querySelector("#mccf-plan");
    if (pl && c) pl.onclick = async function () {
      var SS = (g.secciones || []);
      var lista = SS.map(function (s, i) { return (i + 1) + ". " + s.nombre; }).join("\n");
      var v = prompt("Hoy toca (número de sección, o vacío para quitar):\n" + lista, "");
      if (v == null) return;
      var sec = SS[Number(v) - 1] || SS.find(function (s) { return s.nombre.toLowerCase() === v.trim().toLowerCase(); });
      var r = await api("cf_plan_hoy", { id: c.id, seccion_id: sec ? sec.id : "" });
      if (!r || r.error) return alert((r && r.error) || "No se pudo guardar el plan");
      go("#/m/conteos");
    };
    main.querySelectorAll("[data-cf-ini]").forEach(function (b) {
      b.onclick = async function (ev) {
        ev.stopPropagation();
        var id = b.getAttribute("data-cf-ini");
        b.disabled = true;
        var r = await api("cf_sec_iniciar", { id: id });
        b.disabled = false;
        if (!r || r.error) return alert((r && r.error) || "No se pudo iniciar");
        go("#/m/conteos/s/" + encodeURIComponent(id));
      };
    });
    main.querySelectorAll("[data-cf-sec]").forEach(function (tr) {
      tr.onclick = function (ev) {
        if (ev.target.closest("[data-cf-ini]")) return;
        var id = tr.getAttribute("data-cf-sec"), est = tr.getAttribute("data-cf-est");
        if (est === "pendiente") return;
        go("#/m/conteos/s/" + encodeURIComponent(id));
      };
    });
  }

  function zVal(z, f, d) { var e = C.zEdit[z.id] || {}; return e[f] !== undefined ? e[f] : (d !== undefined ? d : z[f]); }
  function lugarOpts(z) {
    var L = (C.zonas && C.zonas.lugares) || [], cur = zVal(z, "bodega", z.bodega) + ":" + zVal(z, "sububicacion", z.sububicacion || "");
    var h = L.map(function (l) {
      var v = l.bodega + ":" + (l.sububicacion || "");
      return '<option value="' + e(v) + '"' + (v === cur ? " selected" : "") + ">" + e(l.nombre) + "</option>";
    }).join("");
    if (z.id === "_new" && !L.some(function (l) { return (l.bodega + ":" + (l.sububicacion || "")) === cur; }) && cur !== ":") h += '<option value="' + e(cur) + '" selected>Nueva…</option>';
    return h;
  }
  async function renderSeccionesCfg() {
    var d = await api("cf_zonas", {});
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + "</p>";
    C.zonas = d;
    var adm = !!d.admin, Z = d.zonas || [], E = C.zEdit;
    if (C.zNew && !Z.some(function (x) { return x.id === "_new"; })) Z = Z.concat([{ id: "_new", nombre: "", bodega: "CONSIGNACION", sububicacion: "", prefijos: [], frecuenciaDias: 30, activo: true, unidades: 0, subs: 0 }]);
    var warn = (d.sinZona && d.sinZona.length) ? '<div class="cbz-card" style="border-color:#f0c040;font-size:12.5px;margin-bottom:8px">⚠ Sububicaciones con stock que no están en ninguna sección: <b>' + d.sinZona.map(function (x) { return e(x.nombre); }).join(", ") + "</b></div>" : "";
    var h = '<div id="cc"><div id="mccf-root"><div class="cc-row" style="margin-bottom:8px"><button class="chip" type="button" data-go="#/m/conteos">← Conteos</button><b>Secciones de Sunsu Spa</b>' +
      (adm ? '<button class="chip" type="button" id="mccf-z-nueva">＋ Sección</button>' : "") + "</div>" +
      '<p class="cc-help">' + (adm ? "Cada sección agrupa estantes por prefijo (ej. 8-, = sin sub.). El catálogo empieza vacío. Solo un admin puede agregar o cambiar secciones." : "Solo un admin puede agregar o cambiar secciones y sububicaciones.") + "</p>" + warn;
    h += '<div class="cbz-card" style="padding:4px 6px;overflow-x:auto"><table class="cc-t"><thead><tr><th>Nombre</th><th>Sububicaciones (prefijo, «=» sin sub.)</th><th class="r">Cada (días)</th><th class="r">Subs</th><th>Activa</th><th></th></tr></thead><tbody>';
    h += Z.map(function (z) {
      var dt = !!E[z.id], off = zVal(z, "activo", z.activo) === false;
      var prefs = zVal(z, "prefijos", Array.isArray(z.prefijos) ? z.prefijos.join(", ") : (z.prefijos || ""));
      var act = (adm && dt ? '<button class="chip" type="button" data-cf-zdesc="' + e(z.id) + '">Descartar</button> <button class="cbz-btn" type="button" style="padding:4px 10px" data-cf-zsave="' + e(z.id) + '">Guardar</button>' : "") +
        (adm && !dt && z.id !== "_new" ? '<button class="chip" type="button" data-cf-zdel="' + e(z.id) + '" style="color:#e05c5c;padding:3px 8px">🗑</button>' : "");
      return '<tr data-zid="' + e(z.id) + '"' + (dt ? ' style="background:#1a2a1a"' : "") + (off ? ' style="opacity:.55"' : "") + '><td class="nm"><input class="uinput" ' + (adm ? "" : "disabled ") + 'style="width:100%;min-width:120px" data-zf="nombre" data-zid="' + e(z.id) + '" value="' + e(zVal(z, "nombre", z.nombre || "")) + '"></td>' +
        '<td><input class="uinput" ' + (adm ? "" : "disabled ") + 'style="width:150px;text-transform:uppercase" placeholder="ej. 7-, =" data-zf="prefijos" data-zid="' + e(z.id) + '" value="' + e(prefs) + '"></td>' +
        '<td class="r"><input class="uinput" ' + (adm ? "" : "disabled ") + 'type="number" min="1" style="width:56px;text-align:right" data-zf="frecuenciaDias" data-zid="' + e(z.id) + '" value="' + e(zVal(z, "frecuenciaDias", z.frecuenciaDias || 30)) + '"></td>' +
        '<td class="r">' + e(z.subs == null ? "" : z.subs) + "</td>" +
        '<td><input type="checkbox" ' + (adm ? "" : "disabled ") + 'data-zf="activo" data-zid="' + e(z.id) + '"' + (off ? "" : " checked") + "></td>" +
        '<td class="mccf-zact">' + act + "</td></tr>";
    }).join("");
    h += "</tbody></table></div>";
    var lugares = d.lugares || [], subs = d.subs || [];
    h += '<div class="cbz-card" style="margin-top:10px"><b>Sububicaciones</b><p class="cbz-muted" style="margin:4px 0 8px">Se crean una a una, dentro de cada bodega o cabina. El catálogo empieza vacío.</p>';
    h += lugares.map(function (lg) {
      var key = lg.bodega + ":" + (lg.sububicacion || "");
      var list = subs.filter(function (s) { return s.bodega === lg.bodega && (s.padre || "") === (lg.sububicacion || ""); });
      return '<div class="cc-lug"><div><b>' + e(lg.nombre) + "</b>" +
        (list.length ? '<div class="cbz-muted">' + list.map(function (s) { return e(s.codigo); }).join(", ") + "</div>" : '<div class="cbz-muted">Ninguna aún.</div>') +
        "</div>" + (adm ? '<button class="cbz-btn" type="button" data-cf-crear-sub="' + e(key) + '">＋ Crear sububicación</button>' : "") + "</div>";
    }).join("");
    h += "</div>";
    if (d.falta) h += '<p class="err">' + e(d.falta) + "</p>";
    return h + "</div></div>";
  }
  function wireSecciones(main) {
    main.querySelectorAll("[data-go]").forEach(function (b) { b.onclick = function () { go(b.getAttribute("data-go")); }; });
    if (!C.zonas || !C.zonas.admin) return;
    function set(id, f, v) { C.zEdit[id] = C.zEdit[id] || {}; C.zEdit[id][f] = v; }
    main.querySelectorAll("[data-zf]").forEach(function (inp) {
      inp.onchange = inp.oninput = function () {
        var id = inp.getAttribute("data-zid"), f = inp.getAttribute("data-zf");
        if (f === "lugar") {
          var p = String(inp.value || "").split(":");
          set(id, "bodega", p[0] || ""); set(id, "sububicacion", p.slice(1).join(":") || "");
        } else if (f === "activo") set(id, "activo", inp.checked);
        else set(id, f, inp.type === "number" ? Number(inp.value) : inp.value);
        var card = inp.closest("tr"); if (card) card.style.background = "#1a2a1a";
        var act = card && card.querySelector(".mccf-zact");
        if (act && !act.querySelector("[data-cf-zsave]")) {
          act.insertAdjacentHTML("beforeend", '<button class="chip" type="button" data-cf-zdesc="' + id + '">Descartar</button> <button class="cbz-btn" type="button" style="padding:4px 10px" data-cf-zsave="' + id + '">Guardar</button>');
          wireSecciones(main);
        }
      };
    });
    var nv = main.querySelector("#mccf-z-nueva");
    if (nv) nv.onclick = function () { C.zNew = true; C.zEdit._new = { nombre: "", bodega: "CONSIGNACION", sububicacion: "", prefijos: "", frecuenciaDias: 30, activo: true }; void MCConteo.render({ mod: "conteos", sub: "secciones" }).then(function (h) { main.innerHTML = h; MCConteo.wire(main, { mod: "conteos", sub: "secciones" }); }); };
    main.querySelectorAll("[data-cf-zdesc]").forEach(function (b) {
      b.onclick = function () { delete C.zEdit[b.getAttribute("data-cf-zdesc")]; if (b.getAttribute("data-cf-zdesc") === "_new") C.zNew = false; go("#/m/conteos/secciones"); };
    });
    main.querySelectorAll("[data-cf-zsave]").forEach(function (b) {
      b.onclick = async function () {
        var id = b.getAttribute("data-cf-zsave");
        var z = ((C.zonas && C.zonas.zonas) || []).find(function (x) { return x.id === id; }) || { id: id === "_new" ? "" : id };
        var ed = C.zEdit[id] || {};
        var lugar = (ed.bodega || z.bodega || "") + ":" + (ed.sububicacion != null ? ed.sububicacion : (z.sububicacion || ""));
        var p = lugar.split(":");
        b.disabled = true;
        var r = await api("cf_zona_save", {
          id: id === "_new" ? "" : id,
          nombre: ed.nombre !== undefined ? ed.nombre : z.nombre,
          bodega: ed.bodega || p[0] || z.bodega,
          sububicacion: ed.sububicacion !== undefined ? ed.sububicacion : (p.slice(1).join(":") || z.sububicacion || ""),
          frecuencia_dias: ed.frecuenciaDias !== undefined ? ed.frecuenciaDias : z.frecuenciaDias,
          prefijos: ed.prefijos !== undefined ? ed.prefijos : (Array.isArray(z.prefijos) ? z.prefijos.join(", ") : (z.prefijos || "")),
          activo: ed.activo !== undefined ? ed.activo : z.activo
        });
        b.disabled = false;
        if (!r || r.error) return alert((r && r.error) || "No se pudo guardar");
        delete C.zEdit[id]; C.zNew = false; go("#/m/conteos/secciones");
      };
    });
    main.querySelectorAll("[data-cf-zdel]").forEach(function (b) {
      b.onclick = async function () {
        if (!confirm("¿Quitar esta sección? Si ya tiene conteos, solo se desactiva.")) return;
        var r = await api("cf_zona_borrar", { id: b.getAttribute("data-cf-zdel") });
        if (!r || r.error) return alert((r && r.error) || "No se pudo quitar");
        go("#/m/conteos/secciones");
      };
    });
    function reordenar(id, dir) {
      var ids = ((C.zonas && C.zonas.zonas) || []).map(function (x) { return x.id; });
      var i = ids.indexOf(id); if (i < 0) return;
      var j = i + dir; if (j < 0 || j >= ids.length) return;
      var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
      void api("cf_zona_orden", { ids: ids }).then(function (r) { if (!r || r.error) return alert((r && r.error) || "No se pudo reordenar"); go("#/m/conteos/secciones"); });
    }
    main.querySelectorAll("[data-cf-zup]").forEach(function (b) { b.onclick = function () { reordenar(b.getAttribute("data-cf-zup"), -1); }; });
    main.querySelectorAll("[data-cf-zdn]").forEach(function (b) { b.onclick = function () { reordenar(b.getAttribute("data-cf-zdn"), 1); }; });
    main.querySelectorAll("[data-cf-crear-sub]").forEach(function (b) {
      b.onclick = async function () {
        var parts = (b.getAttribute("data-cf-crear-sub") || "").split(":");
        var bod = parts[0] || "CONSIGNACION", padre = parts.slice(1).join(":") || "";
        var cod = prompt("Código de la sububicación (ej. 8-A-1):", "");
        if (!cod) return;
        var nom = prompt("Nombre (opcional):", cod);
        if (nom == null) return;
        var r = await api("cf_sub_save", { bodega: bod, padre: padre, sububicacion: padre, codigo: cod, nombre: nom });
        if (!r || r.error) return alert((r && r.error) || "No se pudo crear");
        go("#/m/conteos/secciones");
      };
    });
  }
  function recHtml(movs) {
    if (!movs || !movs.length) return "";
    return '<div class="cc-rved"><b>Recontar: hubo movimientos durante el conteo</b>' +
      movs.map(function (m) {
        var d = Number(m.delta) || 0;
        return "<div>" + e(m.sku || "") + " · " + e(m.sub || "sin sububicación") + " · " + e(m.label || m.kind || "Movimiento") + " " + (d > 0 ? "+" : "") + d + " · " + e(fecha(m.at)) + " · " + e(m.actor || "") + "</div>";
      }).join("") + "</div>";
  }
  function valLinea(l) { return C.dirty[l.id] !== undefined ? C.dirty[l.id] : (l.contado == null ? "" : String(l.contado)); }
  function lineasFiltradas() {
    var L = (C.sec && C.sec.lineas) || [], q = String(C.filtro || "").trim().toLowerCase();
    if (!q) return L;
    return L.filter(function (l) { return (l.sku + " " + l.nombre + " " + (l.fromSub || "")).toLowerCase().indexOf(q) >= 0; });
  }
  function lineaSecHtml(l) {
    var v = valLinea(l), op = C.menu === l.id, otra = C.otra === l.id;
    var badge = (l.buscar ? ' <span class="cc-skb">🔎 buscar después</span>' : "") + (l.otraSub ? ' <span style="color:#5cc8ff">📍 ' + e(l.otraSub) + (l.otraQty != null ? " · " + e(l.otraQty) : "") + "</span>" : "");
    var h = '<div class="cc-ln' + (l.buscar ? " cc-skip" : "") + '" id="cc-l' + e(l.id) + '">' +
      '<div style="flex:1;min-width:0"><div class="cc-nm">' + e(l.nombre) + "</div>" + badge + '<div class="cc-cd">' + e(l.sku) + "</div></div>" +
      '<div class="cc-sub">' + e(l.fromSub || "—") + "<div>esp. " + e(l.esperado) + "</div></div>" +
      '<input class="cc-q' + (v === "" ? " cc-vacio" : "") + '" id="cc-c' + e(l.id) + '" data-cf-cant="' + e(l.id) + '" type="text" inputmode="' + (C.pad ? "none" : "decimal") + '" autocomplete="off" value="' + e(v) + '"' + (C.sec && C.sec.puedeOperar ? "" : " disabled") + ">" +
      '<button class="cc-mn" type="button" data-cf-menu="' + e(l.id) + '" aria-label="Más">···</button></div>';
    if (op) {
      h += '<div class="cc-mpop">' +
        '<button class="chip" type="button" data-cf-op="ubic" data-id="' + e(l.id) + '">+ Agregar ubicación</button>' +
        '<button class="chip" type="button" data-cf-op="otro" data-id="' + e(l.id) + '">📍 Está en otro lugar</button>' +
        '<button class="chip" type="button" data-cf-op="buscar" data-id="' + e(l.id) + '">🔎 Buscar después</button></div>';
    }
    if (otra) {
      var opts = (l.otrasUnids || []).map(function (o) {
        return '<option value="' + e(o.bodega + ":" + (o.sub || "")) + '">' + e(o.nombre) + (o.unidades ? " · " + o.unidades + " u" : "") + "</option>";
      }).join("");
      h += '<div class="cc-bq">' + e(l.fromSub || "—") + " (principal): — · otras sububicaciones:" +
        '<div class="cc-row" style="width:100%"><select class="uinput" data-cf-osub="' + e(l.id) + '" style="flex:1;min-width:0;height:40px"><option value="">Buscar sububicación…</option>' + opts + "</select>" +
        '<input class="cc-q" data-cf-oqty="' + e(l.id) + '" inputmode="decimal" value="' + e(l.otraQty == null ? "" : l.otraQty) + '">' +
        '<button class="chip" type="button" data-cf-op="cerrar-otra" data-id="' + e(l.id) + '">×</button></div>' +
        '<button class="chip" type="button" data-cf-op="crear-sub" data-id="' + e(l.id) + '" style="color:#b7f34a">＋ Crear nueva sububicación</button></div>';
    }
    return h;
  }
  async function renderSeccion(id) {
    var d = await api("cf_sec_get", { id: id });
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo abrir la sección") + "</p>";
    C.sec = d; C.filtro = C.filtro || "";
    if (d.seccion.estado === "pendiente" && d.puedeIniciar) {
      var ini = await api("cf_sec_iniciar", { id: id });
      if (ini && !ini.error) return renderSeccion(id);
    }
    var s = d.seccion, L = lineasFiltradas(), nOk = s.contadas || 0;
    var can = !!d.puedeOperar;
    return '<div id="cc"><div id="mccf-root"><div class="cc-secbar"><button class="chip" type="button" data-go="#/m/conteos/cf/' + e(d.conteo.id) + '">←</button>' +
      "<h2>" + e(s.nombre) + " " + pill(s.estado, s.estadoNombre) + "</h2>" +
      '<span class="cc-when">' + e(fecha(s.iniciadoAt)) + "</span></div>" +
      '<div class="cc-top"><input id="mccf-f" type="search" placeholder="🔍 Escanea o busca código / nombre" value="' + e(C.filtro) + '">' +
      '<button class="cc-kb' + (C.pad ? " on" : "") + '" type="button" id="mccf-pad">123</button>' +
      '<span class="cc-prog"><b>' + e(nOk) + "</b>/" + e(s.lineas) + "</span>" +
      (can ? '<button class="cbz-btn cc-addbtn" type="button" id="mccf-agregar">＋ Agregar producto</button>' : "") + "</div>" +
      recHtml(d.movimientos) +
      '<div id="mccf-hits" class="cc-hits" hidden></div>' +
      '<div class="cc-list" id="mccf-lista">' + L.map(lineaSecHtml).join("") + "</div>" +
      '<div class="cc-numpad' + (C.pad ? " on" : "") + '" id="mccf-numpad">' +
      [1,2,3,4,5,6,7,8,9,".","0","⌫"].map(function (k) { return '<button type="button" data-cf-key="' + e(k) + '">' + e(k) + "</button>"; }).join("") + "</div>" +
      (can || d.puedeTerminar ? '<div class="cc-bar">' + (C.saved ? '<span class="cc-pend" style="color:#8fa3b8" id="mccf-saved">✓ Guardado</span>' : '<span class="cc-pend" id="mccf-saved">sin guardar</span>') +
        (d.puedeTerminar ? '<button class="cbz-btn" type="button" id="mccf-terminar" style="background:#1e4976">Terminar</button>' : "") + "</div>" : "") +
      (d.puedeRevisar ? '<p class="cc-row" style="margin-top:10px"><button class="cbz-btn" type="button" id="mccf-sec-ok">Aprobar sección</button><button class="chip" type="button" id="mccf-sec-back">Devolver</button></p>' : "") +
      "</div></div>";
  }
  function markSaved(ok) {
    C.saved = !!ok;
    var el = document.getElementById("mccf-saved");
    if (el) { el.textContent = ok ? "✓ Guardado" : "sin guardar"; el.style.color = ok ? "#8fa3b8" : "#f0c040"; }
  }
  async function flushDirty() {
    var d = C.sec; if (!d || !d.puedeOperar) return;
    var ids = Object.keys(C.dirty);
    if (!ids.length) { markSaved(true); return; }
    var lineas = ids.map(function (id) {
      var l = (d.lineas || []).find(function (x) { return x.id === id; }) || { id: id };
      var v = C.dirty[id];
      return { id: id, contado: v === "" || v == null ? null : Number(String(v).replace(",", ".")), estado: l.estado, buscar: l.buscar, otra_sub: l.otraSub, otra_qty: l.otraQty, extras: l.extras };
    });
    var r = await api("cf_sec_guardar", { id: d.seccion.id, lineas: lineas });
    if (!r || r.error) return;
    C.dirty = {}; markSaved(true);
  }
  function wireSeccion(main) {
    var d = C.sec; if (!d) return;
    main.querySelectorAll("[data-go]").forEach(function (b) { b.onclick = function () { void flushDirty(); go(b.getAttribute("data-go")); }; });
    var f = main.querySelector("#mccf-f");
    if (f) f.oninput = function () { C.filtro = f.value; var box = main.querySelector("#mccf-lista"); if (box) box.innerHTML = lineasFiltradas().map(lineaSecHtml).join(""); };
    var pad = main.querySelector("#mccf-pad"), num = main.querySelector("#mccf-numpad");
    if (pad) pad.onclick = function () { C.pad = !C.pad; pad.classList.toggle("on", C.pad); if (num) num.classList.toggle("on", C.pad); };
    if (num) num.onclick = function (ev) {
      var k = ev.target.getAttribute("data-cf-key"); if (!k) return;
      var inp = (C.focus && document.getElementById(C.focus)) || main.querySelector(".cc-q:focus") || main.querySelector(".cc-q");
      if (!inp || inp.disabled) return;
      var v = String(inp.value || "");
      if (k === "⌫") v = v.slice(0, -1);
      else v = v + (k === "." && v.indexOf(".") >= 0 ? "" : k);
      inp.value = v; inp.dispatchEvent(new Event("input", { bubbles: true }));
    };
    main.addEventListener("focusin", function (ev) { if (ev.target && ev.target.getAttribute("data-cf-cant")) C.focus = ev.target.id; });
    main.addEventListener("input", function (ev) {
      var i = ev.target.closest("[data-cf-cant]"); if (!i) return;
      var id = i.getAttribute("data-cf-cant"), v = String(i.value).replace(",", ".");
      C.dirty[id] = v; markSaved(false);
      var l = (d.lineas || []).find(function (x) { return x.id === id; });
      if (l) { l.contado = v === "" ? null : Number(v); l.estado = v === "" ? "pendiente" : "contado"; }
      i.classList.toggle("cc-vacio", v === "");
      clearTimeout(C.timers.save); C.timers.save = setTimeout(function () { void flushDirty(); }, 500);
    });
    main.addEventListener("click", function (ev) {
      var mn = ev.target.closest("[data-cf-menu]");
      if (mn) { C.menu = C.menu === mn.getAttribute("data-cf-menu") ? null : mn.getAttribute("data-cf-menu"); C.otra = null; var box = main.querySelector("#mccf-lista"); if (box) box.innerHTML = lineasFiltradas().map(lineaSecHtml).join(""); return; }
      var op = ev.target.closest("[data-cf-op]");
      if (op) {
        var id = op.getAttribute("data-id"), que = op.getAttribute("data-cf-op");
        var l = (d.lineas || []).find(function (x) { return x.id === id; });
        if (que === "buscar" && l) {
          l.buscar = !l.buscar; C.dirty[id] = valLinea(l); markSaved(false); void flushDirty();
        }
        if (que === "otro" || que === "ubic") { C.otra = id; C.menu = id; }
        if (que === "cerrar-otra") { C.otra = null; }
        if (que === "crear-sub") {
          var sec = d.seccion || {};
          var cod = prompt("Código de la nueva sububicación (ej. 8-A-1):", "");
          if (!cod) return;
          var nom = prompt("Nombre (opcional):", cod);
          if (nom == null) return;
          void api("cf_sub_save", { bodega: sec.bodega, padre: sec.sububicacion || "", sububicacion: sec.sububicacion || "", codigo: cod, nombre: nom }).then(function (r) {
            if (!r || r.error) return alert((r && r.error) || "No se pudo crear");
            if (l) { l.otraSub = r.codigo || cod; C.dirty[id] = valLinea(l); markSaved(false); void flushDirty(); }
            var box2 = main.querySelector("#mccf-lista"); if (box2) box2.innerHTML = lineasFiltradas().map(lineaSecHtml).join("");
          });
          return;
        }
        var box = main.querySelector("#mccf-lista"); if (box) box.innerHTML = lineasFiltradas().map(lineaSecHtml).join("");
        return;
      }
    });
    main.addEventListener("change", function (ev) {
      var s = ev.target.closest("[data-cf-osub]"); var q = ev.target.closest("[data-cf-oqty]");
      var el = s || q; if (!el) return;
      var id = el.getAttribute("data-cf-osub") || el.getAttribute("data-cf-oqty");
      var l = (d.lineas || []).find(function (x) { return x.id === id; }); if (!l) return;
      if (s) { var v = s.value.split(":"); l.otraSub = v[1] || v[0] || ""; }
      if (q) l.otraQty = q.value === "" ? null : Number(String(q.value).replace(",", "."));
      C.dirty[id] = valLinea(l); markSaved(false); void flushDirty();
    });
    var ag = main.querySelector("#mccf-agregar");
    if (ag) ag.onclick = function () { var inp = main.querySelector("#mccf-f"); if (inp) { inp.focus(); alert("Busca o escanea arriba y, si no está en la lista, lo agregamos."); } };
    if (f) f.onkeydown = async function (ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      var L = lineasFiltradas();
      if (L.length === 1) { var inp = document.getElementById('cc-c' + L[0].id); if (inp) { inp.focus(); inp.select(); } return; }
      if (!L.length && d.puedeOperar) {
        var ps = await (C.prods || api("mcprod_list", {}));
        C.prods = ps && ps.items ? ps : C.prods;
        var items = (C.prods && C.prods.items) || [];
        var qv = String(f.value || "").trim().toLowerCase();
        var H = items.filter(function (p) { return p.tipo !== "servicio" && ((p.sku || "") + " " + (p.skuVisible || "") + " " + (p.nombre || "")).toLowerCase().indexOf(qv) >= 0; }).slice(0, 8);
        var hits = main.querySelector("#mccf-hits");
        if (hits) {
          hits.hidden = !H.length;
          hits.innerHTML = H.map(function (p) { return '<button type="button" data-cf-add="' + e(p.id) + '"><span class="mccf-sku">' + e(p.skuVisible || p.sku) + "</span> " + e(p.nombre) + "</button>"; }).join("");
        }
      }
    };
    var hits = main.querySelector("#mccf-hits");
    if (hits) hits.onclick = async function (ev) {
      var b = ev.target.closest("[data-cf-add]"); if (!b) return;
      var cant = prompt("¿Cuántas unidades encontraste?", "1"); if (cant === null) return;
      await flushDirty();
      var r = await api("cf_sec_guardar", { id: d.seccion.id, agregar: { producto_id: b.getAttribute("data-cf-add"), contado: cant } });
      if (!r || r.error) return alert((r && r.error) || "No se pudo agregar");
      C.filtro = ""; C.dirty = {}; go("#/m/conteos/s/" + encodeURIComponent(d.seccion.id));
    };
    var term = main.querySelector("#mccf-terminar");
    if (term) term.onclick = async function () {
      await flushDirty();
      var r = await api("cf_sec_cerrar", { id: d.seccion.id });
      if (r && r.faltan) {
        if (!confirm(r.pregunta || ("Quedan " + r.faltan + " sin contar. ¿Terminar y enviar a revisión?"))) return;
        r = await api("cf_sec_cerrar", { id: d.seccion.id, forzar: true });
      }
      if (!r || r.error) return alert((r && r.error) || "No se pudo terminar");
      go("#/m/conteos/cf/" + encodeURIComponent(d.conteo.id));
    };
    var okb = main.querySelector("#mccf-sec-ok");
    if (okb) okb.onclick = async function () {
      var r = await api("cf_sec_aprobar", { id: d.seccion.id });
      if (!r || r.error) return alert((r && r.error) || "No se pudo aprobar");
      go("#/m/conteos/cf/" + encodeURIComponent(d.conteo.id));
    };
    var back = main.querySelector("#mccf-sec-back");
    if (back) back.onclick = async function () {
      var n = prompt("¿Qué hay que revisar?", "");
      if (n == null) return;
      var r = await api("cf_sec_devolver", { id: d.seccion.id, nota: n });
      if (!r || r.error) return alert((r && r.error) || "No se pudo devolver");
      go("#/m/conteos/s/" + encodeURIComponent(d.seccion.id));
    };
  }
  async function renderGeneral(id) {
    var g = await api("cf_get_general", { id: id });
    if (!g || g.error) return renderDetalle(id); // hoja suelta
    C.general = g;
    // Reuse the list card focused on this count
    var hold = C.list;
    C.list = [{ tipo: "general", id: g.conteo.id, estado: g.conteo.estado }];
    var html = await renderLista();
    C.list = hold;
    return html;
  }

  window.MCConteo = {
    ensureList: async function () {
      if ((C.list || []).length) return true;
      var d = await api("cf_list", {});
      if (d && !d.error) { C.list = d.items || []; return true; }
      return false;
    },
    render: async function (route) {
      css();
      if (route.sub === "hojas") return renderHojas();
      if (route.sub === "secciones") return renderSeccionesCfg();
      if (route.sub === "s" && route.id) return renderSeccion(String(route.id));
      if (route.sub === "cf" && route.id) return renderGeneral(String(route.id));
      C.cur = null;
      return renderLista();
    },
    wire: function (main, route) {
      if (route.sub === "hojas") return wireHojas(main);
      if (route.sub === "s") return wireSeccion(main);
      if (route.sub === "cf" && route.id && C.general) return wireLista(main);
      if (route.sub === "cf" && route.id) return wireDetalle(main);
      if (route.sub === "secciones") return wireSecciones(main);
      return wireLista(main);
    },
    tarjetaInicio: tarjetaInicio,
    _css: css,
    _c: C,
  };
})();
