// Conteo físico estilo MineCore (beta, 0045). Lista + crear + contar (asignada) + revisar (admin).
// TK135: al aprobar, el stock real de Productos de esa bodega se actualiza con lo contado.
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
      /* Layout y densidad de MineCore, colores de Sunsu (sin tema oscuro). */
      "#cc,#mccf-root{color:var(--text);font-size:13px}",
      "#cc .chip,#mccf-root .chip{background:var(--white);border:1.5px solid var(--cream-d);color:var(--navy-d);border-radius:20px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer}",
      "#cc .cbz-btn,#mccf-root .cbz-btn{background:var(--navy);border:0;color:#fff;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer}",
      "#cc .cbz-card,#mccf-root .cbz-card{background:var(--white);border:1px solid var(--cream-d);border-radius:12px;padding:12px 14px}",
      "#cc .cbz-muted,#mccf-root .cbz-muted{color:var(--gray)}",
      "#cc .uinput,#mccf-root .uinput{background:var(--white);border:1.5px solid var(--cream-d);color:var(--text);border-radius:8px;padding:8px 10px;font-size:14px;height:40px;box-sizing:border-box}",
      "#cc .cc-t,#mccf-root .cc-t{width:100%;border-collapse:collapse;font-size:12.5px}",
      "#cc .cc-t th,#mccf-root .cc-t th{text-align:left;font-size:11px;color:var(--navy-d);padding:6px 7px;border-bottom:1px solid var(--cream-d);font-weight:600}",
      "#cc .cc-t td,#mccf-root .cc-t td{padding:6px 7px;border-bottom:1px solid var(--gray-l);vertical-align:middle;color:var(--text)}",
      "#cc .cc-t .r,#mccf-root .cc-t .r{text-align:right}",
      "#cc .cc-t tr[data-cf-sec],#mccf-root .cc-t tr[data-cf-go],#mccf-root .cc-t tr[data-cf-sec]{cursor:pointer}",
      "#cc .st-pill,#mccf-root .st-pill{display:inline-block;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;border:1.5px solid var(--gray);color:var(--gray);background:transparent;white-space:nowrap}",
      "#cc .st-pill.pend,#mccf-root .st-pill.pend{border-color:var(--gray);color:var(--gray)}",
      "#cc .st-pill.c,#mccf-root .st-pill.c{border-color:var(--gold);color:#9a6b00;background:var(--gold-l)}",
      "#cc .st-pill.r,#mccf-root .st-pill.r{border-color:#5B7FA6;color:#3D5A7A;background:#EEF3FA}",
      "#cc .st-pill.ok,#mccf-root .st-pill.ok{border-color:#2e9e5b;color:#2e7d32;background:#e6f4ea}",
      "#cc .cc-row,#mccf-root .cc-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}",
      "#cc .cc-topbtns,#mccf-root .cc-topbtns{display:flex;gap:6px;align-items:stretch;margin:0 0 8px;flex-wrap:nowrap}",
      "#cc .cc-topbtns .cbz-btn,#cc .cc-topbtns .chip,#mccf-root .cc-topbtns .cbz-btn,#mccf-root .cc-topbtns .chip{flex:1 1 0;min-width:0;white-space:normal;text-align:center;line-height:1.2;padding:7px 8px;font-size:12px;height:auto;min-height:40px;display:inline-flex;align-items:center;justify-content:center}",
      "#cc .cc-top,#mccf-root .cc-top{position:sticky;top:0;z-index:6;display:flex;gap:8px;align-items:center;background:var(--cream);padding:6px 0}",
      "#cc .cc-qwrap,#mccf-root .cc-qwrap{flex:1;min-width:0;position:relative;display:flex;align-items:center}",
      "#cc .cc-top input,#mccf-root .cc-top input{flex:1;min-width:0;height:40px;font-size:15px;background:var(--white);border:1.5px solid var(--gold);color:var(--text);border-radius:8px;padding:0 42px 0 10px;box-sizing:border-box;width:100%}",
      "#cc .cc-scan,#mccf-root .cc-scan{position:absolute;right:2px;top:50%;transform:translateY(-50%);width:36px;height:36px;border:0;background:transparent;color:var(--navy);font-size:18px;cursor:pointer;border-radius:8px}",
      "#cc .cc-prog,#mccf-root .cc-prog{font-size:13px;white-space:nowrap;color:var(--navy-d)}",
      "#cc .cc-prog b,#mccf-root .cc-prog b{color:var(--navy);font-size:15px}",
      "#cc .cc-kb,#mccf-root .cc-kb{flex:0 0 auto;min-width:44px;height:40px;padding:0 8px;border-radius:8px;border:1.5px solid var(--navy-d);background:var(--navy-d);color:#fff;font-weight:700;font-size:12px}",
      "#cc .cc-kb.on,#mccf-root .cc-kb.on{background:var(--gold);border-color:var(--gold);color:var(--navy-d)}",
      "#cc .cc-list,#mccf-root .cc-list{background:var(--white);border:1px solid var(--cream-d);border-radius:12px;overflow:hidden}",
      "#cc .cc-ln,#mccf-root .cc-ln{display:flex;align-items:center;gap:8px;padding:5px 8px;min-height:48px;box-sizing:border-box;border-bottom:1px solid var(--cream-d)}",
      "#cc .cc-ln.cc-ya,#mccf-root .cc-ln.cc-ya{outline:2px solid var(--gold);background:var(--gold-l);border-radius:8px}",
      "#cc .cc-hits button[disabled],#mccf-root .cc-hits button[disabled]{opacity:.55;pointer-events:none}",
      "#cc .cc-nm,#mccf-root .cc-nm{font-weight:700;font-size:13px;color:var(--text);line-height:1.22;white-space:normal;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden}",
      "#cc .cc-cd,#mccf-root .cc-cd{font-size:11.5px;color:var(--gray);white-space:normal;line-height:1.3}",
      "#cc .cc-sub,#mccf-root .cc-sub{flex:0 0 auto;text-align:right;font-size:12.5px;color:var(--navy-d);white-space:nowrap;line-height:1.25}",
      "#cc .cc-mn,#mccf-root .cc-mn{flex:0 0 24px;height:40px;background:none;border:none;color:var(--gray);font-size:20px;padding:0;cursor:pointer}",
      "#cc .cc-mpop,#mccf-root .cc-mpop{display:flex;gap:6px;flex-wrap:wrap;padding:8px;background:var(--blue-ll,#F5F8FC);border-bottom:1px solid var(--cream-d)}",
      "#cc .cc-bq,#mccf-root .cc-bq{font-size:12.5px;margin:0 0 6px;padding:6px 8px;border:1px solid var(--gold);border-radius:10px;display:flex;gap:4px;flex-wrap:wrap;align-items:center;background:var(--gold-l)}",
      "#cc .cc-rved,#mccf-root .cc-rved{margin:0 0 8px;padding:8px 10px;border:1px solid var(--gold);border-radius:10px;background:var(--gold-l);color:var(--navy-d);font-size:12px}",
      "#cc .cc-pend,#mccf-root .cc-pend{margin-right:auto;font-size:12.5px;color:var(--gold);align-self:center;white-space:nowrap}",
      "#cc .cc-addbtn,#mccf-root .cc-addbtn{white-space:nowrap;min-height:40px;flex:0 0 auto}",
      "#cc .cc-bar,#mccf-root .cc-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;background:var(--white);border-top:1px solid var(--cream-d);padding:8px;position:sticky;bottom:0;z-index:5}",
      "#cc .cc-k,#mccf-root .cc-k{color:var(--gray);font-size:11px}",
      "#cc .cc-secbar,#mccf-root .cc-secbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}",
      "#cc .cc-secbar h2,#mccf-root .cc-secbar h2{margin:0;font-size:16px;font-weight:800;color:var(--navy-d);display:flex;align-items:center;gap:8px;flex:1;min-width:0}",
      "#cc .cc-when,#mccf-root .cc-when{color:var(--gray);font-size:11px;white-space:nowrap}",
      "#cc .cc-help,#mccf-root .cc-help{color:var(--gray);font-size:12px;margin:6px 0;line-height:1.4}",
      "#cc .cc-gmeta,#mccf-root .cc-gmeta{color:var(--gray);font-size:12px;margin-top:2px}",
      "#cc .cc-gstats,#mccf-root .cc-gstats{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;font-size:13px}",
      "#cc .cc-progbar,#mccf-root .cc-progbar{height:6px;background:var(--cream-d);border-radius:4px;margin-top:8px;overflow:hidden}",
      "#cc .cc-progbar>i,#mccf-root .cc-progbar>i{display:block;height:100%;background:#6fbf88;border-radius:4px}",
      "#cc .cc-hoy,#mccf-root .cc-hoy{margin-top:8px;font-size:13px}",
      "#cc .cc-lug,#mccf-root .cc-lug{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid var(--cream-d)}",
      "#cc .cc-lug:first-of-type,#mccf-root .cc-lug:first-of-type{border-top:0}",
      "#cc .cc-pick,#mccf-root .cc-pick{display:flex;flex-direction:column;gap:10px;margin-top:8px}",
      "#cc .cc-pick button,#mccf-root .cc-pick button{display:block;width:100%;text-align:left;padding:14px 16px;border-radius:12px;border:1.5px solid var(--cream-d);background:var(--white);color:var(--navy-d);font-weight:700;font-size:15px}",
      "#cc .cc-pick button small,#mccf-root .cc-pick button small{display:block;font-weight:500;font-size:12px;color:var(--gray);margin-top:2px}",
      "#cc .cc-numpad,#mccf-root .cc-numpad{display:none;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0;padding:8px;background:var(--white);border:1px solid var(--cream-d);border-radius:12px}",
      "#cc .cc-numpad.on,#mccf-root .cc-numpad.on{display:grid}",
      "#cc .cc-numpad button,#mccf-root .cc-numpad button{height:44px;background:var(--cream);border:1px solid var(--cream-d);color:var(--navy-d);border-radius:8px;font-weight:700;font-size:16px}",
      "#cc .cc-hits,#mccf-root .cc-hits{border:1px solid var(--cream-d);border-radius:10px;background:var(--white);margin:8px 0;max-height:260px;overflow:auto}",
      "#cc .cc-hits-tit,#mccf-root .cc-hits-tit{padding:8px 12px;font-size:12px;font-weight:700;color:var(--navy-d);background:var(--cream)}",
      "#cc .cc-hits button,#mccf-root .cc-hits button{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--gray-l);background:none;padding:10px 12px;cursor:pointer;font:inherit;font-size:13px;color:var(--text)}",
      "#cc .cc-hit-txt,#mccf-root .cc-hit-txt{flex:1;min-width:0;overflow-wrap:anywhere}",
      "#cc .cc-hit-marca,#mccf-root .cc-hit-marca{color:var(--gray);font-weight:500}",
      "#cc .cc-hits .cc-add,#mccf-root .cc-hits .cc-add{flex:0 0 auto;background:var(--navy);color:#fff;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700}",
      "#mccf-root .err{color:#b2452a}",
      "@media(max-width:430px){#cc .cc-top,#mccf-root .cc-top{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center}#cc .cc-qwrap,#mccf-root .cc-qwrap{grid-column:1;grid-row:1;width:100%;min-width:0}#cc .cc-top input,#mccf-root .cc-top input{width:100%}#cc .cc-kb,#mccf-root .cc-kb{grid-column:2;grid-row:1}#cc .cc-prog,#mccf-root .cc-prog{grid-column:3;grid-row:1}#cc .cc-top .cc-addbtn,#mccf-root .cc-top .cc-addbtn{grid-column:1/-1;grid-row:2;width:100%;min-height:44px;font-size:15px;font-weight:800}}",
      "html body #cc input.cc-q,html body #mccf-root input.cc-q{flex:0 0 58px!important;width:58px!important;min-width:58px!important;height:40px!important;box-sizing:border-box!important;text-align:center!important;font-size:17px!important;font-weight:700!important;color:var(--navy-d)!important;-webkit-text-fill-color:var(--navy-d)!important;background:var(--white)!important;border:1.5px solid var(--gold)!important;border-radius:9px!important;padding:0!important;box-shadow:none!important;caret-color:var(--gold)!important}",
      "html body #cc input.cc-q.cc-vacio,html body #mccf-root input.cc-q.cc-vacio{background:var(--gold-l)!important;border:2px solid var(--gold)!important}",
      "html body #cc input.cc-q.cc-dirty,html body #mccf-root input.cc-q.cc-dirty{border-color:#9a6b00!important;background:var(--gold-l)!important}",
      "html body #cc input.cc-q:focus,html body #mccf-root input.cc-q:focus{border:2px solid var(--gold)!important;box-shadow:0 0 0 3px rgba(196,148,58,.25)!important;background:var(--gold-l)!important;outline:none!important}"
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
      : "Elige la bodega o cabina y cuenta lo que ves. Al terminar, un admin lo revisa. Al aprobar, el stock real de Productos de esa bodega se actualiza con lo contado.";
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
      '<p class="mccf-sub">' + (adm ? "Ves todos los conteos, a quién están asignados y su estado." : "Ves los conteos asignados a ti.") + " Al aprobar, el stock real de esa bodega queda actualizado en Productos.</p></div>";
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
    if (c.estado === "aprobado") aviso = '<div class="mccf-note">Aprobado por ' + e(c.aprobadoPor) + " · " + e(fecha(c.aprobadoAt)) + (c.stockAplicado ? ". El stock real de Productos de esta bodega ya quedó actualizado." : ". El stock de Productos de esta bodega aún no se había aplicado.") + "</div>";
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
  async function cargarProds(force) {
    var now = Date.now();
    if (!force && C.prods && C.prodsAt && now - C.prodsAt < 2500) return C.prods;
    var d = await api("mcprod_list", {});
    // Catálogo completo (también inactivos): un producto recién creado o marcado inactivo en el sistema viejo igual se cuenta.
    C.prods = (d && d.items || []).filter(function (p) { return p.tipo !== "servicio"; });
    C.prodsAt = Date.now();
    return C.prods;
  }
  function wireDetalle(main) {
    var d = C.cur; if (!d) return;
    var root = main.querySelector("#mccf-root"); if (!root) return;
    var err = function (t) { var x = main.querySelector("#mccf-err"); if (x) x.textContent = t || ""; };
    var btn = function (id, fn) { var b = root.querySelector(id); if (b) b.onclick = async function () { b.disabled = true; try { await fn(); } finally { b.disabled = false; } }; };
    btn("#mccf-empezar", async function () { var r = await api("cf_iniciar", { id: d.conteo.id }); if (!r || r.error) return err((r && r.error) || "No se pudo empezar"); await cargarCur(d.conteo.id); repintar(main); });
    btn("#mccf-enviar", async function () { await new Promise(function (ok) { setTimeout(ok, 500); }); var r = await api("cf_enviar", { id: d.conteo.id }); if (!r || r.error) return err((r && r.error) || "No se pudo enviar"); await cargarCur(d.conteo.id); repintar(main); });
    btn("#mccf-aprobar", async function () {
      if (!confirm("¿Aprobar " + d.conteo.numero + "?\nEl stock real de Productos de esta bodega se actualizará con lo que se contó.")) return;
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
      '<button class="cbz-btn" type="button" id="mccf-nuevo-g">＋ Nuevo conteo</button>' +
      '<button class="chip" type="button" data-go="#/m/conteos/secciones">⚙ Sububicaciones</button>' +
      '<button class="chip" type="button" data-go="#/m/conteos/hojas">📋 Hojas sueltas</button></div>';
  }
  function pickerHtml() {
    return '<div class="cbz-card"><p class="cc-help">Elige la bodega. Se cargan todos los productos que deberían estar ahora ahí. Las sububicaciones se asignan o se crean mientras cuentas, producto por producto.</p>' +
      '<div class="cc-pick">' +
      '<button type="button" data-cf-bod="CONSIGNACION">Venta<small>Bodega de consignación</small></button>' +
      '<button type="button" data-cf-bod="CABINA">Bodega Cabina<small>Del local. Cabina 1, 2 y 3 ya existen como sububicaciones.</small></button>' +
      '<button type="button" data-cf-bod="OFICINA">Bodega Oficina<small>Las sububicaciones se van creando al contar.</small></button>' +
      "</div></div>";
  }
  async function renderLista() {
    var m = await meta();
    var d = await api("cf_list", {});
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + "</p>";
    C.list = d.items || [];
    var h = '<div id="cc"><div id="mccf-root">' + (d.falta ? '<p class="err">' + e(d.falta) + "</p>" : "") + topBtns();
    h += '<p class="cc-help">El conteo es por bodega (Venta, Cabina u Oficina). La sububicación es un dato de cada producto y se asigna al contar. No hace falta crear sububicaciones antes.</p>';
    if (C.pick) {
      h += pickerHtml();
      return h + "</div></div>";
    }
    var abiertos = C.list.filter(function (c) { return c.tipo !== "general" && c.estado !== "cancelado" && c.estado !== "aprobado"; });
    if (!abiertos.length) {
      h += '<div class="cbz-card"><p class="cc-help">No hay un conteo abierto. Pulsa ＋ Nuevo conteo, elige la bodega y empieza. El inventario sigue vivo; puedes guardar, salir y volver.</p></div>';
      return h + "</div></div>";
    }
    h += abiertos.map(function (c) {
      var ap = Number(c.contadas) || 0, tot = Number(c.lineas) || 0;
      var rev = Number(c.porRevisar) || (c.estado === "en_revision" ? 1 : 0);
      return '<div class="cbz-card" style="margin-bottom:10px;cursor:pointer" data-cf-abrir="' + e(c.id) + '"><div style="min-width:0"><b style="font-size:15px;white-space:nowrap">' + e(c.numero) + " · " + e(c.bodegaNombre || c.bodega) + "</b>" +
        '<div class="cc-gmeta">👤 ' + e(c.asignadoNombre || "—") + " · " + pill(c.estado, c.estadoNombre) + "</div></div>" +
        '<div class="cc-row"><span style="white-space:nowrap;font-size:12.5px">Contadas <b>' + ap + "/" + tot + "</b>" + (rev ? ' · <b style="color:var(--navy)">' + e(rev) + " por revisar</b>" : "") + "</span></div>" +
        '<div class="cc-progbar"><i style="width:' + Math.round(100 * ap / Math.max(1, tot)) + '%"></i></div></div>';
    }).join("");
    return h + "</div></div>";
  }
  function wireLista(main) {
    var nv = main.querySelector("#mccf-nuevo-g");
    if (nv) nv.onclick = function () { C.pick = true; go("#/m/conteos/nuevo"); };
    main.querySelectorAll("[data-go]").forEach(function (b) { b.onclick = function () { C.pick = false; go(b.getAttribute("data-go")); }; });
    main.querySelectorAll("[data-cf-bod]").forEach(function (b) {
      b.onclick = async function () {
        var bod = b.getAttribute("data-cf-bod");
        b.disabled = true;
        var r = await api("cf_crear", { bodega: bod, iniciar: true });
        if (!r || r.error) { b.disabled = false; return alert((r && r.error) || "No se pudo crear"); }
        C.pick = false;
        var goDet = function (id) { go("#/m/conteos/cf/" + encodeURIComponent(id)); };
        if (r.iniciado || r.reanudar && r.estado !== "asignado") return goDet(r.id);
        var r2 = await api("cf_iniciar", { id: r.id });
        b.disabled = false;
        if (!r2 || r2.error) { alert((r2 && r2.error) || "No se pudo empezar"); }
        goDet(r.id);
      };
    });
    main.querySelectorAll("[data-cf-abrir]").forEach(function (card) {
      card.onclick = function () { C.pick = false; go("#/m/conteos/cf/" + encodeURIComponent(card.getAttribute("data-cf-abrir"))); };
    });
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
    var adm = !!d.admin;
    var lugares = d.lugares || [], subs = d.subs || [];
    var h = '<div id="cc"><div id="mccf-root"><div class="cc-row" style="margin-bottom:8px"><button class="chip" type="button" data-go="#/m/conteos">← Conteos</button><b>Sububicaciones</b></div>' +
      '<p class="cc-help">Hay tres bodegas. Cabina 1, 2 y 3 ya existen dentro de Bodega Cabina. Oficina y Venta se van llenando al contar: no hace falta crearlas antes para empezar un conteo.</p>';
    h += lugares.map(function (lg) {
      var key = lg.bodega + ":" + (lg.sububicacion || "");
      var list = subs.filter(function (s) { return s.bodega === lg.bodega; });
      return '<div class="cbz-card" style="margin-bottom:10px"><div class="cc-lug"><div><b>' + e(lg.nombre) + "</b>" +
        (list.length ? '<div class="cbz-muted">' + list.map(function (s) { return e(s.nombre || s.codigo); }).join(", ") + "</div>" : '<div class="cbz-muted">Ninguna aún. Se pueden crear al contar.</div>') +
        "</div>" + (adm ? '<button class="cbz-btn" type="button" data-cf-crear-sub="' + e(key) + '">＋ Crear sububicación</button>' : "") + "</div></div>";
    }).join("");
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
        var card = inp.closest("tr"); if (card) card.style.background = "var(--gold-l)";
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
  function pintarLista() {
    var box = document.getElementById("mccf-lista");
    if (box) box.innerHTML = lineasFiltradas().map(lineaSecHtml).join("");
  }
  /** Suma la sububicación a todos los desplegables del conteo, la deja elegida en esa fila y no recarga ni borra cantidades. */
  function aplicarSubCreada(codigo, nombre, lineaId) {
    var d = C.sec; if (!d) return;
    codigo = String(codigo || "").trim();
    if (!codigo) return;
    nombre = String(nombre || codigo).trim() || codigo;
    d.subs = d.subs || [];
    if (!d.subs.some(function (x) { return String(x.codigo) === codigo; })) d.subs.push({ codigo: codigo, nombre: nombre });
    else d.subs = d.subs.map(function (x) { return String(x.codigo) === codigo ? { codigo: codigo, nombre: nombre || x.nombre } : x; });
    if (lineaId) {
      var l = (d.lineas || []).find(function (x) { return x.id === lineaId; });
      if (l) {
        l.subContada = codigo; l.subCodigo = codigo; l.sububicacion = codigo; l.fromSub = nombre;
        C.dirty[lineaId] = valLinea(l);
      }
      C.otra = lineaId;
    }
    pintarLista();
  }
  function quitarSubCreada(codigo, lineaId) {
    var d = C.sec; if (!d) return;
    d.subs = (d.subs || []).filter(function (x) { return String(x.codigo) !== codigo; });
    if (lineaId) {
      var l = (d.lineas || []).find(function (x) { return x.id === lineaId; });
      if (l && String(l.subContada || l.subCodigo || "") === String(codigo)) {
        l.subContada = ""; l.subCodigo = ""; l.sububicacion = "";
        l.fromSub = (d.seccion && (d.seccion.nombre || d.seccion.bodega)) || "—";
        C.dirty[lineaId] = valLinea(l);
      }
    }
    pintarLista();
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
    var L = (C.sec && C.sec.lineas) || [], q = String(C.filtro || "").trim();
    if (!q) return L;
    if (window.MCBuscar) return window.MCBuscar.filtrar(L, q, function (l) { return [[l.sku, l.skuVisible, l.codigo, l.codigoBarras].concat(l.barras || []), [l.nombre, l.marca, l.fromSub, l.sububicacion, l.subContada]]; });
    var n = q.toLowerCase();
    return L.filter(function (l) { return (l.sku + " " + l.nombre + " " + (l.fromSub || "")).toLowerCase().indexOf(n) >= 0; });
  }
  function barraConteoHtml(can, nOk, nLin) {
    return '<div class="cc-top"><div class="cc-qwrap"><input id="mccf-f" type="search" placeholder="🔍 Escanea o busca código / nombre" value="' + e(C.filtro) + '" autocomplete="off" aria-label="Buscar o escanear">' +
      '<button class="cc-scan" type="button" id="mccf-scan" title="Escanear código de barras" aria-label="Escanear código de barras">📷</button></div>' +
      '<button class="cc-kb' + (C.pad ? " on" : "") + '" type="button" id="mccf-pad">123</button>' +
      '<span class="cc-prog"><b>' + e(nOk) + "</b>/" + e(nLin) + "</span>" +
      (can ? '<button class="cbz-btn cc-addbtn" type="button" id="mccf-agregar">＋ Agregar producto</button>' : "") + "</div>";
  }
  function keysProd(p) {
    var pres = [].concat(p.presentaciones || p.subcodigos || []).map(function (x) { return typeof x === "string" ? x : (x && (x.sku || x.skuVisible || x.codigo || x.nombre)); });
    var antes = [].concat(p.skuAntes || []);
    return [[p.sku, p.skuVisible, p.skuAlias, p.skuProveedor, p.codigoCabina, p.codigo_barras].concat(p.barras || []).concat(pres).concat(antes), [p.nombre, p.marca, p.categoria]];
  }
  function yaEnConteo() {
    var ya = {};
    ((C.sec && C.sec.lineas) || (C.cur && C.cur.lineas) || []).forEach(function (l) { ya[l.productoId || l.producto_id] = l.id; });
    return ya;
  }
  /** Si el producto ya está en el conteo, baja a esa línea y la destaca (no se agrega otra). */
  function irALineaExistente(id) {
    if (!id) return;
    C.addOpen = false;
    var hits = document.getElementById("mccf-hits");
    if (hits) { hits.hidden = true; hits.innerHTML = ""; }
    var el = document.getElementById("cc-l" + id);
    if (!el) {
      C.filtro = "";
      var inp = document.getElementById("mccf-f");
      if (inp) inp.value = "";
      pintarLista();
      el = document.getElementById("cc-l" + id);
    }
    if (el) {
      el.classList.add("cc-ya");
      try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (x) {}
      setTimeout(function () { el.classList.remove("cc-ya"); }, 2500);
      var c = document.getElementById("cc-c" + id);
      if (c) { try { c.focus(); c.select(); } catch (x) {} }
    }
  }
  function pintarProg() {
    var d = C.sec; if (!d) return;
    var L = d.lineas || [];
    var nOk = L.filter(function (l) { return l.estado && l.estado !== "pendiente"; }).length;
    if (d.seccion) { d.seccion.contadas = nOk; d.seccion.lineas = L.length; }
    var el = document.querySelector("#mccf-root .cc-prog");
    if (el) el.innerHTML = "<b>" + nOk + "</b>/" + L.length;
  }
  /** Suma el producto al conteo en pantalla, lo deja listo para anotar cantidad y sububicación, sin recargar ni borrar lo ya contado. */
  function aplicarProductoAgregado(lin) {
    var d = C.sec; if (!d || !lin || !lin.id) return;
    d.lineas = d.lineas || [];
    if (d.lineas.some(function (x) { return x.id === lin.id; })) { irALineaExistente(lin.id); return; }
    d.lineas.push(lin);
    C.filtro = "";
    C.addOpen = false;
    C.otra = lin.id;
    var inp = document.getElementById("mccf-f");
    if (inp) inp.value = "";
    var hits = document.getElementById("mccf-hits");
    if (hits) { hits.hidden = true; hits.innerHTML = ""; }
    pintarProg();
    pintarLista();
    setTimeout(function () {
      var c = document.getElementById("cc-c" + lin.id);
      if (c) { c.focus(); c.select(); }
    }, 0);
  }
  async function pintarHitsAgregar(main, qv) {
    var hits = main.querySelector("#mccf-hits");
    if (!hits) return;
    qv = String(qv || "").trim();
    if (!qv && !C.addOpen) { hits.hidden = true; hits.innerHTML = ""; return; }
    var ps = await cargarProds(!!C.addOpen);
    var ya = yaEnConteo();
    var all = (window.MCBuscar
      ? window.MCBuscar.filtrar(ps, qv, keysProd)
      : ps.filter(function (p) { return ((p.sku || "") + " " + (p.skuVisible || "") + " " + (p.nombre || "") + " " + (p.marca || "") + " " + (p.barras || []).join(" ")).toLowerCase().indexOf(qv.toLowerCase()) >= 0; })
    );
    var Hya = qv ? all.filter(function (p) { return ya[p.id]; }).slice(0, 8) : [];
    var H = all.filter(function (p) { return !ya[p.id]; }).slice(0, 12);
    hits.hidden = false;
    if (!H.length && !Hya.length) {
      hits.innerHTML = '<div class="cc-hits-tit">' + (qv ? "No está en el catálogo de Productos. Solo se pueden agregar productos que ya existen." : "Busca por nombre, SKU, código, código de barras o marca. El catálogo completo aparece aquí debajo de las líneas del conteo.") + "</div>";
      return;
    }
    var html = "";
    if (Hya.length) {
      html += '<div class="cc-hits-tit">Ya está en el conteo</div>' + Hya.map(function (p) {
        return '<button type="button" data-cf-add="' + e(p.id) + '"><span class="cc-hit-txt"><span class="mccf-sku">' + e(p.skuVisible || p.sku) + "</span> " + e(p.nombre) + (p.marca ? '<span class="cc-hit-marca"> · ' + e(p.marca) + "</span>" : "") + '</span><span class="cc-add">Agregar</span></button>';
      }).join("");
    }
    if (H.length) {
      html += '<div class="cc-hits-tit">En el catálogo — Agregar al conteo (esperado 0)</div>' + H.map(function (p) {
        return '<button type="button" data-cf-add="' + e(p.id) + '"><span class="cc-hit-txt"><span class="mccf-sku">' + e(p.skuVisible || p.sku) + "</span> " + e(p.nombre) + (p.marca ? '<span class="cc-hit-marca"> · ' + e(p.marca) + "</span>" : "") + '</span><span class="cc-add">Agregar</span></button>';
      }).join("");
    }
    hits.innerHTML = html;
  }
  function lineaDeAgregada(r, pid) {
    var lin = r && r.linea;
    if (lin && lin.id) return lin;
    var ps = C.prods || [];
    var p = ps.find(function (x) { return x.id === pid; }) || {};
    var d = C.sec || {};
    var bod = (d.seccion && (d.seccion.nombre || d.seccion.bodega)) || "—";
    return {
      id: (r && r.agregada) || ("tmp-" + pid), productoId: pid, sku: p.skuVisible || p.sku || "", nombre: p.nombre || "",
      esperado: 0, sistema: 0, contado: null, estado: "pendiente", agregado: true,
      subContada: "", subCodigo: "", sububicacion: "", fromSub: bod
    };
  }

  function lineaSecHtml(l) {
    var v = valLinea(l), op = C.menu === l.id, otra = C.otra === l.id;
    var badge = (l.buscar ? ' <span class="cc-skb">🔎 buscar después</span>' : "") + (l.otraSub ? ' <span style="color:var(--navy)">📍 ' + e(l.otraSub) + (l.otraQty != null ? " · " + e(l.otraQty) : "") + "</span>" : "");
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
      var subs = ((C.sec && C.sec.subs) || []);
      var cur = l.subContada || l.subCodigo || l.sububicacion || "";
      var optsAsig = subs.map(function (o) {
        return '<option value="' + e(o.codigo) + '"' + (o.codigo === cur ? " selected" : "") + ">" + e(o.nombre || o.codigo) + "</option>";
      }).join("");
      var optsOtra = (l.otrasUnids || []).map(function (o) {
        return '<option value="' + e(o.bodega + ":" + (o.sub || "")) + '">' + e(o.nombre) + (o.unidades ? " · " + o.unidades + " u" : "") + "</option>";
      }).join("");
      h += '<div class="cc-bq">Sububicación de este producto en esta bodega:' +
        '<div class="cc-row" style="width:100%"><select class="uinput" data-cf-asub="' + e(l.id) + '" style="flex:1;min-width:0;height:40px"><option value="">Elige o crea…</option>' + optsAsig + "</select>" +
        '<button class="cbz-btn" type="button" data-cf-op="asig-sub" data-id="' + e(l.id) + '">Asignar</button>' +
        '<button class="chip" type="button" data-cf-op="cerrar-otra" data-id="' + e(l.id) + '">×</button></div>' +
        '<button class="chip" type="button" data-cf-op="crear-sub" data-id="' + e(l.id) + '">＋ Crear nueva sububicación</button>';
      if (optsOtra) {
        h += '<div style="margin-top:6px;color:var(--gray);font-size:12px">Está en otro lugar:</div>' +
          '<div class="cc-row" style="width:100%"><select class="uinput" data-cf-osub="' + e(l.id) + '" style="flex:1;min-width:0;height:40px"><option value="">Buscar sububicación…</option>' + optsOtra + "</select>" +
          '<input class="cc-q" data-cf-oqty="' + e(l.id) + '" inputmode="decimal" value="' + e(l.otraQty == null ? "" : l.otraQty) + '"></div>';
      }
      h += "</div>";
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
      barraConteoHtml(can, nOk, s.lineas) +
      recHtml(d.movimientos) +
      '<div class="cc-list" id="mccf-lista">' + L.map(lineaSecHtml).join("") + "</div>" +
      '<div id="mccf-hits" class="cc-hits" hidden></div>' +
      '<div class="cc-numpad' + (C.pad ? " on" : "") + '" id="mccf-numpad">' +
      [1,2,3,4,5,6,7,8,9,".","0","⌫"].map(function (k) { return '<button type="button" data-cf-key="' + e(k) + '">' + e(k) + "</button>"; }).join("") + "</div>" +
      (can || d.puedeTerminar ? '<div class="cc-bar">' + (C.saved ? '<span class="cc-pend" style="color:var(--navy)" id="mccf-saved">✓ Guardado</span>' : '<span class="cc-pend" id="mccf-saved">sin guardar</span>') +
        (d.puedeTerminar ? '<button class="cbz-btn" type="button" id="mccf-terminar" >Terminar</button>' : "") + "</div>" : "") +
      (d.puedeRevisar ? '<p class="cc-row" style="margin-top:10px"><button class="cbz-btn" type="button" id="mccf-sec-ok">Aprobar sección</button><button class="chip" type="button" id="mccf-sec-back">Devolver</button></p>' : "") +
      "</div></div>";
  }
  function markSaved(ok) {
    C.saved = !!ok;
    var el = document.getElementById("mccf-saved");
    if (el) { el.textContent = ok ? "✓ Guardado" : "sin guardar"; el.style.color = ok ? "var(--navy)" : "var(--gold)"; }
  }
  async function flushDirty() {
    var d = C.sec; if (!d || !d.puedeOperar) return;
    var ids = Object.keys(C.dirty);
    if (!ids.length) { markSaved(true); return; }
    var lineas = ids.map(function (id) {
      var l = (d.lineas || []).find(function (x) { return x.id === id; }) || { id: id };
      var v = C.dirty[id];
      return { id: id, contado: v === "" || v == null ? null : Number(String(v).replace(",", ".")), estado: l.estado, buscar: l.buscar, otra_sub: l.otraSub, otra_qty: l.otraQty, extras: l.extras, sub_contada: l.subContada || l.subCodigo || l.sububicacion, sububicacion: l.subContada || l.subCodigo || l.sububicacion };
    });
    var ep = d.modo === "bodega" ? "cf_guardar" : "cf_sec_guardar";
    var ident = d.modo === "bodega" ? (d.conteo && d.conteo.id) : d.seccion.id;
    var r = await api(ep, { id: ident, lineas: lineas });
    if (!r || r.error) return;
    C.dirty = {}; markSaved(true);
  }
  function wireSeccion(main) {
    var d = C.sec; if (!d) return;
    main.querySelectorAll("[data-go]").forEach(function (b) { b.onclick = function () { void flushDirty(); go(b.getAttribute("data-go")); }; });
    var f = main.querySelector("#mccf-f");
    if (f) f.oninput = function () { C.filtro = f.value; var box = main.querySelector("#mccf-lista"); if (box) box.innerHTML = lineasFiltradas().map(lineaSecHtml).join(""); void pintarHitsAgregar(main, f.value); };
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
          var cod = prompt("Código de la nueva sububicación:", "");
          if (!cod) return;
          var nom = prompt("Nombre (opcional):", cod);
          if (nom == null) return;
          // Misma normalización que cf_sub_save. Se pinta YA en el desplegable (sin recargar, sin perder cantidades).
          var codigo = String(cod).trim().toUpperCase().replace(/\s+/g, "");
          var nombre = String(nom || codigo).trim() || codigo;
          aplicarSubCreada(codigo, nombre, id);
          markSaved(false);
          void api("cf_sub_save", { bodega: sec.bodega, padre: sec.sububicacion || "", sububicacion: sec.sububicacion || "", codigo: codigo, nombre: nombre }).then(function (r) {
            if (!r || r.error) { quitarSubCreada(codigo, id); return alert((r && r.error) || "No se pudo crear"); }
            if (C.sec && Array.isArray(r.subs)) C.sec.subs = r.subs;
            aplicarSubCreada(r.codigo || codigo, r.nombre || nombre, id);
            markSaved(false); void flushDirty();
          }).catch(function () { quitarSubCreada(codigo, id); alert("No se pudo crear la sububicación"); });
          return;
        }
        if (que === "asig-sub" && l) {
          var sel = main.querySelector('[data-cf-asub="' + id + '"]');
          var codigo = sel ? sel.value : "";
          if (!codigo) return;
          l.subContada = codigo; l.subCodigo = codigo; l.sububicacion = codigo;
          var found = (d.subs || []).find(function (x) { return x.codigo === codigo; });
          l.fromSub = (found && found.nombre) || codigo;
          C.otra = null; C.menu = null;
          C.dirty[id] = valLinea(l); markSaved(false); void flushDirty();
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
    if (ag) ag.onclick = function () {
      C.addOpen = true;
      C.prodsAt = 0;
      var inp = main.querySelector("#mccf-f");
      if (inp) { inp.focus(); inp.select(); }
      void pintarHitsAgregar(main, inp ? inp.value : "");
    };
    var sc = main.querySelector("#mccf-scan");
    if (sc) sc.onclick = function () {
      var run = typeof _scanAbrir === "function" ? _scanAbrir : (window._scanAbrir);
      if (typeof run !== "function") { alert("El escáner no está disponible en este dispositivo"); return; }
      run(function (txt) {
        var inp = main.querySelector("#mccf-f");
        if (inp) { inp.value = txt; C.filtro = txt; }
        C.addOpen = true;
        var box = main.querySelector("#mccf-lista");
        if (box) box.innerHTML = lineasFiltradas().map(lineaSecHtml).join("");
        void pintarHitsAgregar(main, txt).then(function () {
          var hits = main.querySelector("#mccf-hits");
          var btns = hits ? hits.querySelectorAll("[data-cf-add]") : [];
          if (btns.length === 1) btns[0].click();
        });
      });
    };
    if (f) f.onkeydown = async function (ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      var L = lineasFiltradas();
      if (L.length === 1) { var inp = document.getElementById('cc-c' + L[0].id); if (inp) { inp.focus(); inp.select(); } return; }
      C.addOpen = true;
      await pintarHitsAgregar(main, f.value);
      var hits0 = main.querySelector("#mccf-hits");
      var btns = hits0 ? hits0.querySelectorAll("[data-cf-add]") : [];
      if (btns.length === 1) btns[0].click();
    };
    var hits = main.querySelector("#mccf-hits");
    if (hits) hits.onclick = async function (ev) {
      var b = ev.target.closest("[data-cf-add]"); if (!b) return;
      if (!d.puedeOperar) return;
      if (C.addBusy) return;
      var pid = b.getAttribute("data-cf-add");
      var existe = yaEnConteo()[pid];
      if (existe) { irALineaExistente(existe); return; }
      C.addBusy = true;
      var btns = hits.querySelectorAll("[data-cf-add]");
      for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
      try {
        await flushDirty();
        var ep = d.modo === "bodega" ? "cf_guardar" : "cf_sec_guardar";
        var ident = d.modo === "bodega" ? d.conteo.id : d.seccion.id;
        var r = await api(ep, { id: ident, agregar: { producto_id: pid } });
        if (!r || r.error) return alert((r && r.error) || "No se pudo agregar");
        if (r.ya) { irALineaExistente((r.linea && r.linea.id) || r.agregada); return; }
        aplicarProductoAgregado(lineaDeAgregada(r, pid));
      } finally {
        C.addBusy = false;
        for (var j = 0; j < btns.length; j++) btns[j].disabled = false;
      }
    };
    var term = main.querySelector("#mccf-terminar");
    if (term) term.onclick = async function () {
      await flushDirty();
      var ep = d.modo === "bodega" ? "cf_enviar" : "cf_sec_cerrar";
      var ident = d.modo === "bodega" ? d.conteo.id : d.seccion.id;
      var r = await api(ep, { id: ident });
      if (r && r.faltan) {
        if (!confirm(r.pregunta || ("Quedan " + r.faltan + " sin contar. ¿Terminar y enviar a revisión?"))) return;
        r = await api(ep, { id: ident, forzar: true });
      }
      if (!r || r.error) return alert((r && r.error) || "No se pudo terminar");
      go(d.modo === "bodega" ? "#/m/conteos" : "#/m/conteos/cf/" + encodeURIComponent(d.conteo.id));
    };
    var okb = main.querySelector("#mccf-sec-ok");
    if (okb) okb.onclick = async function () {
      var r = d.modo === "bodega" ? await api("cf_revisar", { id: d.conteo.id, que: "aprobar" }) : await api("cf_sec_aprobar", { id: d.seccion.id });
      if (!r || r.error) return alert((r && r.error) || "No se pudo aprobar");
      go("#/m/conteos");
    };
    var back = main.querySelector("#mccf-sec-back");
    if (back) back.onclick = async function () {
      var n = prompt("¿Qué hay que revisar?", "");
      if (n == null) return;
      var r = d.modo === "bodega" ? await api("cf_revisar", { id: d.conteo.id, que: "devolver", nota: n }) : await api("cf_sec_devolver", { id: d.seccion.id, nota: n });
      if (!r || r.error) return alert((r && r.error) || "No se pudo devolver");
      go(d.modo === "bodega" ? "#/m/conteos/cf/" + encodeURIComponent(d.conteo.id) : "#/m/conteos/s/" + encodeURIComponent(d.seccion.id));
    };
  }
  async function renderBodegaOGeneral(id) {
    var d = await api("cf_get", { id: id });
    if (d && d.ok && d.conteo && d.conteo.tipo !== "general") return renderBodega(id, d);
    var g = await api("cf_get_general", { id: id });
    if (!g || g.error) return renderDetalle(id);
    C.general = g;
    var hold = C.list;
    C.list = [{ tipo: "general", id: g.conteo.id, estado: g.conteo.estado }];
    var html = await renderLista();
    C.list = hold;
    return html;
  }
  async function renderBodega(id, d) {
    if (!d) d = await api("cf_get", { id: id });
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo abrir el conteo") + "</p>";
    if (d.puedeEmpezar) {
      var ini = await api("cf_iniciar", { id: id });
      if (ini && !ini.error) return renderBodega(id);
    }
    var c = d.conteo || {};
    var nOk = (d.lineas || []).filter(function (l) { return l.estado && l.estado !== "pendiente"; }).length;
    C.sec = {
      modo: "bodega",
      seccion: {
        id: c.id, nombre: c.bodegaNombre || c.bodega, estado: c.estado, estadoNombre: c.estadoNombre,
        iniciadoAt: c.iniciadoAt, lineas: (d.lineas || []).length, contadas: nOk,
        bodega: c.bodega, sububicacion: c.sububicacion || ""
      },
      conteo: c, lineas: d.lineas || [], movimientos: d.movimientos || [],
      puedeOperar: !!(d.puedeOperar || d.puedeContar),
      puedeTerminar: !!(d.puedeTerminar || d.puedeContar || d.puedeOperar),
      puedeRevisar: !!d.puedeRevisar,
      subs: d.subs || []
    };
    C.cur = d; C.filtro = C.filtro || "";
    var s = C.sec.seccion, L = lineasFiltradas(), can = !!C.sec.puedeOperar;
    return '<div id="cc"><div id="mccf-root"><div class="cc-secbar"><button class="chip" type="button" data-go="#/m/conteos">←</button>' +
      "<h2>" + e(s.nombre) + " " + pill(s.estado, s.estadoNombre) + "</h2>" +
      '<span class="cc-when">' + e(fecha(s.iniciadoAt)) + "</span></div>" +
      barraConteoHtml(can, s.contadas, s.lineas) +
      recHtml(C.sec.movimientos) +
      '<div class="cc-list" id="mccf-lista">' + L.map(lineaSecHtml).join("") + "</div>" +
      '<div id="mccf-hits" class="cc-hits" hidden></div>' +
      '<div class="cc-numpad' + (C.pad ? " on" : "") + '" id="mccf-numpad">' +
      [1,2,3,4,5,6,7,8,9,".","0","⌫"].map(function (k) { return '<button type="button" data-cf-key="' + e(k) + '">' + e(k) + "</button>"; }).join("") + "</div>" +
      (can || C.sec.puedeTerminar ? '<div class="cc-bar">' + (C.saved ? '<span class="cc-pend" style="color:var(--navy)" id="mccf-saved">✓ Guardado</span>' : '<span class="cc-pend" id="mccf-saved">sin guardar</span>') +
        (C.sec.puedeTerminar ? '<button class="cbz-btn" type="button" id="mccf-terminar">Terminar</button>' : "") + "</div>" : "") +
      (C.sec.puedeRevisar ? '<p class="cc-row" style="margin-top:10px"><button class="cbz-btn" type="button" id="mccf-sec-ok">Aprobar</button><button class="chip" type="button" id="mccf-sec-back">Devolver</button></p>' : "") +
      "</div></div>";
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
      if (route.sub === "nuevo") { C.pick = true; return renderLista(); }
      if (route.sub === "s" && route.id) return renderSeccion(String(route.id));
      if (route.sub === "cf" && route.id) return renderBodegaOGeneral(String(route.id));
      C.cur = null; C.pick = false;
      return renderLista();
    },
    wire: function (main, route) {
      if (route.sub === "hojas") return wireHojas(main);
      if (route.sub === "s") return wireSeccion(main);
      if (route.sub === "cf" && route.id && C.sec && C.sec.modo === "bodega") return wireSeccion(main);
      if (route.sub === "cf" && route.id && C.general) return wireLista(main);
      if (route.sub === "cf" && route.id) return wireDetalle(main);
      if (route.sub === "secciones") return wireSecciones(main);
      return wireLista(main);
    },
    tarjetaInicio: tarjetaInicio,
    _css: css,
    _c: C,
    _aplicarSubCreada: aplicarSubCreada,
    _quitarSubCreada: quitarSubCreada,
    _aplicarProductoAgregado: aplicarProductoAgregado,
    _pintarHitsAgregar: pintarHitsAgregar,
  };
})();
