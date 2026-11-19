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
      ".mccf-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.mccf-bar input,.mccf-bar select{padding:8px 10px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit;font-size:.84rem}.mccf-bar input[type=search]{flex:1;min-width:200px}",
      ".mccf-t{width:100%;border-collapse:collapse;font-size:.84rem}.mccf-t th{text-align:left;font-size:.66rem;text-transform:uppercase;color:var(--navy-d);padding:7px;border-bottom:1px solid var(--cream-d)}.mccf-t td{padding:7px;border-bottom:1px solid var(--gray-l);vertical-align:middle}",
      ".mccf-t .num{text-align:right;white-space:nowrap}.mccf-row{cursor:pointer}.mccf-row:hover{background:var(--cream)}.mccf-sku{font-family:ui-monospace,Menlo,monospace;font-size:.76rem;color:var(--navy-d)}.mccf-sub{color:var(--gray);font-size:.72rem}",
      ".mccf-chip{display:inline-block;border-radius:999px;padding:3px 9px;font-size:.66rem;font-weight:800;background:var(--gray-l);color:var(--navy-d)}.mccf-chip.a{background:#e8eefb;color:#3b5b9a}.mccf-chip.c{background:#fff3d6;color:#9a6b00}.mccf-chip.r{background:#fde7e1;color:#b2452a}.mccf-chip.ok{background:#e6f4ea;color:#2e7d32}.mccf-chip.x{background:#eee;color:#888}",
      ".mccf-card{background:var(--white);border:1px solid var(--cream-d);border-radius:14px;padding:14px;margin-bottom:12px}.mccf-h{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.mccf-h h2{margin:0;font-size:1.15rem}",
      ".mccf-kpis{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.mccf-kpi{background:var(--cream);border-radius:10px;padding:7px 11px;font-size:.74rem}.mccf-kpi b{display:block;font-size:1rem}",
      ".mccf-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(0,1fr));gap:10px}@media(max-width:640px){.mccf-bar input[type=search]{min-width:0;flex:1 1 100%;width:100%;box-sizing:border-box}.mccf-form{grid-template-columns:1fr}.mccf-t{min-width:0}}.mccf-form label{display:flex;flex-direction:column;gap:4px;font-size:.72rem;font-weight:700;color:var(--navy-d)}.mccf-form input,.mccf-form select,.mccf-form textarea{padding:8px 9px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit;font-size:.84rem}",
      ".mccf-in{width:78px;padding:7px;border:1.5px solid var(--cream-d);border-radius:8px;font:inherit;text-align:right}.mccf-in:focus{border-color:var(--navy)}.mccf-ne{border:1.5px solid var(--cream-d);background:var(--white);border-radius:8px;padding:6px 8px;cursor:pointer;font:inherit;font-size:.72rem;white-space:nowrap}.mccf-ne.on{background:#fde7e1;border-color:#e3a593;color:#b2452a;font-weight:800}",
      ".mccf-dif-n{color:#b2452a;font-weight:800}.mccf-dif-p{color:#2e7d32;font-weight:800}.mccf-ln.ok td{background:#f6fbf7}.mccf-ln.dif td{background:#fff8f5}.mccf-ln.hit td{outline:2px solid var(--gold-m)}",
      ".mccf-sel{padding:6px;border:1.5px solid var(--cream-d);border-radius:8px;font:inherit;font-size:.74rem}.mccf-note{background:var(--gold-l);border:1px solid var(--gold-m);border-radius:10px;padding:8px 10px;font-size:.8rem;margin:8px 0}",
      ".mccf-hits{border:1px solid var(--cream-d);border-radius:10px;background:var(--white);margin:-4px 0 10px;max-height:240px;overflow:auto}.mccf-hits button{display:block;width:100%;text-align:left;border:none;border-bottom:1px solid var(--gray-l);background:none;padding:8px 10px;cursor:pointer;font:inherit;font-size:.8rem}.mccf-hits button:hover{background:var(--cream)}",
      ".mccf-dash{border:2px solid var(--gold-m);background:var(--gold-l)}.mccf-dash .row{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:6px 0;border-top:1px solid var(--gold-m)}",
      ".mccf-topbtns{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}.mccf-topbtns .btn{flex:1 1 calc(50% - 8px);min-width:0;justify-content:center;white-space:normal;text-align:center;font-size:.78rem;line-height:1.2}",
      ".mccf-gcard{background:var(--white);border:1px solid var(--cream-d);border-radius:16px;padding:14px;margin-bottom:14px}",
      ".mccf-ghead{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap}.mccf-ghead b{font-size:1.05rem;color:var(--navy-d)}",
      ".mccf-gmeta{color:var(--gray);font-size:.78rem;margin-top:2px}.mccf-gstats{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;font-size:.82rem}",
      ".mccf-gstats .por{color:#3b5b9a;font-weight:800}.mccf-prog{height:6px;background:var(--cream-d);border-radius:4px;margin-top:8px;overflow:hidden}.mccf-prog>i{display:block;height:100%;background:#6fbf88;border-radius:4px}",
      ".mccf-hoy{margin-top:8px;font-size:.82rem}.mccf-help{color:var(--gray);font-size:.72rem;margin-top:6px;line-height:1.4}",
      ".mccf-st{width:100%;border-collapse:collapse;font-size:.84rem;min-width:0}.mccf-st th{text-align:left;font-size:.66rem;text-transform:uppercase;color:var(--navy-d);padding:8px 6px;border-bottom:1px solid var(--cream-d)}.mccf-st td{padding:9px 6px;border-bottom:1px solid var(--gray-l);vertical-align:middle}",
      ".mccf-st .r{text-align:right;white-space:nowrap}.mccf-st tr[data-cf-sec]{cursor:pointer}",
      ".mccf-pill{display:inline-block;border-radius:999px;padding:2px 8px;font-size:.66rem;font-weight:800;border:1.5px solid var(--gray);color:var(--gray);background:transparent;white-space:nowrap}.mccf-pill.r{border-color:#5B7FA6;color:#3D5A7A;background:#EEF3FA}.mccf-pill.c{border-color:var(--gold);color:#9a6b00;background:var(--gold-l)}.mccf-pill.ok{border-color:#2e9e5b;color:#2e7d32;background:#e6f4ea}",
      ".mccf-secbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}.mccf-secbar .back{border:1px solid var(--cream-d);background:#fff;border-radius:999px;padding:4px 10px;font-weight:700;color:var(--navy)}",
      ".mccf-secbar h2{margin:0;font-size:1.05rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;flex:1}.mccf-secbar .when{color:var(--gray);font-size:.72rem;white-space:nowrap}",
      ".mccf-search{display:flex;gap:8px;align-items:center;margin-bottom:10px}",
      ".mccf-search .qwrap{flex:1;min-width:0;display:flex;align-items:center;gap:6px;border:1.5px solid var(--gold);background:#fff;border-radius:10px;padding:8px 10px}",
      ".mccf-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:.78rem}",
      ".mccf-padbtn{flex:none;border:1.5px solid var(--navy-d);background:var(--navy-d);color:#fff;border-radius:10px;font-weight:800;font-size:.8rem;padding:8px 10px;min-width:44px}",
      ".mccf-padbtn.on{background:var(--gold);border-color:var(--gold);color:var(--navy-d)}.mccf-cnt{flex:none;font-weight:800;color:var(--navy-d);font-size:.9rem;white-space:nowrap}",
      ".mccf-add{display:block;width:100%;box-sizing:border-box;margin:0 0 10px;padding:10px;border:0;border-radius:10px;background:var(--navy);color:#fff;font-weight:700;font-size:.86rem}",
      ".mccf-rec{margin:0 0 10px;padding:10px 12px;border:1.5px solid var(--gold);border-radius:12px;background:var(--gold-l);color:var(--navy-d);font-size:.78rem;overflow-wrap:anywhere}",
      ".mccf-rec b{display:block;margin-bottom:4px}.mccf-rec div{margin-top:3px}",
      ".mccf-ln{display:flex;align-items:flex-start;gap:8px;padding:10px 2px;border-bottom:1px solid var(--cream-d)}",
      ".mccf-ln .nm{flex:1;min-width:0}.mccf-ln .nm b{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;font-size:.86rem;line-height:1.25;color:var(--text);font-weight:700}",
      ".mccf-ln .sku{color:var(--gray);font-size:.72rem;font-family:ui-monospace,Menlo,monospace}",
      ".mccf-ln .subc{flex:none;width:4.6rem;text-align:right;font-size:.68rem;color:var(--navy-d);line-height:1.2}.mccf-ln .subc .esp{color:var(--gray)}",
      ".mccf-ln .cc-q{flex:none;width:52px;height:44px;border:2px solid #2e9e5b;border-radius:10px;background:#fff;text-align:center;font:inherit;font-weight:800;font-size:1rem;color:var(--text);box-sizing:border-box}",
      ".mccf-ln .cc-q.cc-vacio{background:#f4faf6}.mccf-ln .cc-q:focus{outline:2px solid var(--navy)}",
      ".mccf-mn{flex:none;border:0;background:transparent;color:var(--gray);font-size:1.2rem;line-height:1;padding:6px 4px;cursor:pointer}",
      ".mccf-ops{display:flex;gap:6px;flex-wrap:wrap;padding:4px 0 10px}",
      ".mccf-ops button{flex:1 1 30%;min-width:0;border:1.5px solid var(--cream-d);background:#fff;border-radius:999px;padding:8px 6px;font-size:.7rem;font-weight:700;color:var(--navy-d)}",
      ".mccf-otra{padding:0 2px 10px;font-size:.72rem;color:var(--gray)}",
      ".mccf-otra-row{display:flex;gap:8px;align-items:center;margin-top:6px}.mccf-otra-row input[type=search],.mccf-otra-row select{min-width:0;flex:1;padding:8px;border:1.5px solid var(--gold);border-radius:8px;font:inherit;background:#fff}",
      ".mccf-otra-row .cc-q{width:52px;flex:none;height:40px}.mccf-otra-row .x{border:0;background:transparent;font-size:1.1rem;color:var(--gray)}",
      ".mccf-sug{max-height:180px;overflow:auto;background:#fff;border:1px solid var(--cream-d);border-radius:8px;margin-top:4px}",
      ".mccf-sug button{display:block;width:100%;text-align:left;border:0;background:#fff;padding:8px 10px;font-size:.8rem;border-bottom:1px solid var(--cream-d)}",
      ".mccf-secwrap{padding-bottom:70px}.mccf-foot{position:fixed;left:0;right:0;bottom:calc(var(--tab-h,62px) + env(safe-area-inset-bottom,0px));display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 16px 10px;background:var(--cream);z-index:5;border-top:1px solid var(--cream-d);box-sizing:border-box}",
      ".mccf-foot .ok{color:var(--gray);font-size:.8rem}.mccf-foot .ok.pend{color:var(--navy-d);font-weight:700}",
      ".mccf-numpad{display:none;position:sticky;bottom:calc(var(--tab-h,62px) + 52px + env(safe-area-inset-bottom,0px));background:#fff;border:1px solid var(--cream-d);border-radius:12px 12px 0 0;padding:8px;z-index:6;box-shadow:0 -4px 16px rgba(61,90,122,.1);grid-template-columns:repeat(3,1fr);gap:6px}",
      ".mccf-numpad.on{display:grid}.mccf-numpad button{padding:12px 0;border:0;border-radius:8px;background:var(--cream);font-weight:800;font-size:1.05rem;color:var(--navy-d)}",
      ".mccf-zwarn{margin:0 0 10px;padding:10px 12px;border:1.5px solid var(--gold);border-radius:12px;background:var(--gold-l);color:var(--navy-d);font-size:.78rem;overflow-wrap:anywhere}.mccf-zcard{background:var(--white);border:1px solid var(--cream-d);border-radius:14px;padding:12px;margin-bottom:10px}.mccf-zcard.dirty{border-color:var(--gold);background:var(--gold-l)}.mccf-zcard.off{opacity:.72}.mccf-zrow{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap}.mccf-zrow label{display:flex;flex-direction:column;gap:3px;font-size:.66rem;font-weight:700;color:var(--navy-d);min-width:0}.mccf-zrow label.nm{flex:1 1 140px}.mccf-zrow label.lugar{flex:1 1 150px}.mccf-zrow label.dias{flex:0 0 72px}.mccf-zrow input,.mccf-zrow select{padding:8px 9px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit;font-size:.84rem;min-width:0;width:100%;background:#fff}.mccf-zact{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px}.mccf-zord{display:flex;flex-direction:column;gap:2px;flex:none}.mccf-zord button{border:1px solid var(--cream-d);background:#fff;border-radius:8px;width:32px;height:28px;font-weight:800;color:var(--navy-d)}.mccf-zchk{display:flex;align-items:center;gap:6px;font-size:.78rem;font-weight:700;color:var(--navy-d);margin-top:18px;white-space:nowrap}@media(max-width:640px){.mccf-zrow label.nm,.mccf-zrow label.lugar{flex:1 1 100%}}@media(max-width:640px){.mccf-gcard,.mccf-st{min-width:0}.mccf-topbtns .btn:first-child{flex:1 1 100%}.mccf-st .btn{margin-top:4px}}",
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
    var cls = est === "en_revision" ? "r" : est === "en_conteo" ? "c" : est === "aprobada" ? "ok" : "";
    return '<span class="mccf-pill ' + cls + '">' + e(nombre || est) + "</span>";
  }
  function topBtns() {
    return '<div class="mccf-topbtns">' +
      '<button class="btn small" type="button" id="mccf-nuevo-g">+ Nuevo conteo general</button>' +
      '<button class="btn ghost small" type="button" data-go="#/m/conteos/secciones">⚙ Secciones</button>' +
      '<button class="btn ghost small" type="button" data-go="#/m/conteos/hojas">Hojas sueltas (antes)</button></div>';
  }
  async function renderLista() {
    var m = await meta();
    var d = await api("cf_list", {});
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + "</p>";
    C.list = d.items || [];
    var adm = !!(d.admin || (m && m.admin));
    var abiertos = C.list.filter(function (c) { return c.tipo === "general" && c.estado !== "cancelado" && c.estado !== "aprobado"; });
    var activo = abiertos[0];
    var h = '<div id="mccf-root">' + (d.falta ? '<p class="err">' + e(d.falta) + "</p>" : "") + topBtns();
    if (!activo) {
      h += '<div class="mccf-gcard"><p class="mccf-help">No hay un conteo general abierto. Crea uno con «+ Nuevo conteo general». El inventario sigue vivo: el sistema toma el stock al iniciar cada sección. Puedes guardar, salir y volver.</p></div>';
      return h + "</div>";
    }
    var g = await api("cf_get_general", { id: activo.id });
    if (!g || g.error) return h + '<p class="err">' + e((g && g.error) || "No se pudo abrir el conteo") + "</p></div>";
    C.general = g;
    var c = g.conteo, SS = g.secciones || [], ap = Number(c.aprobadas) || 0, tot = Number(c.total) || SS.length;
    h += '<div class="mccf-gcard"><div class="mccf-ghead"><div style="min-width:0"><b>' + e(c.numero) + '</b><div class="mccf-gmeta">· Local · 👤 ' + e(c.asignadoNombre || "—") + "</div></div></div>" +
      '<div class="mccf-gstats"><span>Aprobadas <b>' + ap + "/" + tot + "</b>" + (c.porRevisar ? ' <span class="por">' + e(c.porRevisar) + " por revisar</span>" : "") + "</span>" +
      (adm ? '<button class="btn ghost small" type="button" id="mccf-plan">📅 Plan del mes</button>' : "") + "</div>" +
      (adm ? '<p style="margin:8px 0 0;display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost small" type="button" id="mccf-reasig">👤 Reasignar</button><button class="btn ghost small" type="button" id="mccf-cancelar-g" style="color:#b2452a">✕ Cancelar</button></p>' : "") +
      '<div class="mccf-prog"><i style="width:' + Math.round(100 * ap / Math.max(1, tot)) + '%"></i></div>' +
      (c.hoyToca ? '<div class="mccf-hoy">📅 Hoy toca: <b>' + e(c.hoyToca) + "</b></div>" : "") +
      '<div class="mccf-help">Elige una sección, pulsa «Iniciar» y cuenta. El inventario sigue vivo: el sistema toma el stock al iniciar la sección. Puedes guardar, salir y volver.</div></div>';
    h += '<div class="mccf-gcard" style="padding:0"><div class="sheet-scroll"><table class="mccf-st"><thead><tr><th>Sección</th><th>Estado</th><th class="r">Cont.</th></tr></thead><tbody>' +
      SS.map(function (s) {
        return '<tr data-cf-sec="' + e(s.id) + '" data-cf-est="' + e(s.estado) + '"><td><b>' + e(s.nombre) + "</b></td><td>" + pill(s.estado, s.estadoNombre) + (s.estado === "pendiente" ? ' <button class="btn ghost small" type="button" data-cf-ini="' + e(s.id) + '">Iniciar</button>' : "") + '</td><td class="r">' + e(s.contLabel || "—") + "</td></tr>";
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
    if (C.zNew && !Z.some(function (x) { return x.id === "_new"; })) Z = Z.concat([{ id: "_new", nombre: "", bodega: "CABINA", sububicacion: "", frecuenciaDias: 30, activo: true, unidades: 0, subs: 0 }]);
    var warn = (d.sinZona && d.sinZona.length) ? '<div class="mccf-zwarn"><b>⚠ Sububicaciones con stock que no están en ninguna sección:</b> ' + d.sinZona.map(function (x) { return e(x.nombre) + " (" + e(x.unidades) + " u)"; }).join(", ") + "</div>" : "";
    var h = '<div id="mccf-root"><div class="mccf-secbar"><button class="back" type="button" data-go="#/m/conteos">←</button><h2>Secciones del local</h2>' +
      (adm ? '<button class="btn small" type="button" id="mccf-z-nueva">＋ Sección</button>' : "") + "</div>" +
      '<p class="mccf-help">Cada sección es una sububicación del local. El inventario se cuenta por sección. ' + (adm ? "Puedes agregar, renombrar, reordenar, cambiar de lugar o desactivar. Los cambios quedan registrados." : "Solo un admin puede agregar o cambiar sububicaciones.") + "</p>" + warn;
    h += Z.map(function (z, i) {
      var dt = !!E[z.id], off = zVal(z, "activo", z.activo) === false;
      var body = '<div class="mccf-zrow">' +
        (adm ? '<div class="mccf-zord"><button type="button" data-cf-zup="' + e(z.id) + '" ' + (i === 0 || z.id === "_new" ? "disabled" : "") + '>↑</button><button type="button" data-cf-zdn="' + e(z.id) + '" ' + (i === Z.length - 1 || z.id === "_new" ? "disabled" : "") + '>↓</button></div>' : "") +
        '<label class="nm">Nombre<input ' + (adm ? "" : "disabled ") + 'data-zf="nombre" data-zid="' + e(z.id) + '" value="' + e(zVal(z, "nombre", z.nombre || "")) + '"></label>' +
        '<label class="lugar">Sububicación<select ' + (adm ? "" : "disabled ") + 'data-zf="lugar" data-zid="' + e(z.id) + '">' + lugarOpts(z) + "</select></label>" +
        '<label class="dias">Cada (días)<input ' + (adm ? "" : "disabled ") + 'type="number" min="1" data-zf="frecuenciaDias" data-zid="' + e(z.id) + '" value="' + e(zVal(z, "frecuenciaDias", z.frecuenciaDias || 30)) + '"></label>' +
        '<label class="mccf-zchk"><input type="checkbox" ' + (adm ? "" : "disabled ") + 'data-zf="activo" data-zid="' + e(z.id) + '"' + (off ? "" : " checked") + "> Activa</label></div>" +
        '<div class="mccf-zact"><span class="mccf-sub">Stock: ' + e(z.unidades || 0) + " u</span>" +
        (adm && dt ? '<button class="btn ghost small" type="button" data-cf-zdesc="' + e(z.id) + '">Descartar</button><button class="btn small" type="button" data-cf-zsave="' + e(z.id) + '">Guardar</button>' : "") +
        (adm && !dt && z.id !== "_new" ? '<button class="btn ghost small" type="button" data-cf-zdel="' + e(z.id) + '" style="color:#b2452a;margin-left:auto">🗑 Quitar</button>' : "") +
        "</div>";
      return '<div class="mccf-zcard' + (dt ? " dirty" : "") + (off ? " off" : "") + '" data-zid="' + e(z.id) + '">' + body + "</div>";
    }).join("");
    if (adm) h += '<p style="margin-top:8px"><button class="btn ghost small" type="button" id="mccf-z-sub">＋ Nueva sububicación</button></p>';
    if (d.falta) h += '<p class="err">' + e(d.falta) + "</p>";
    return h + "</div>";
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
        var card = inp.closest(".mccf-zcard"); if (card) card.classList.add("dirty");
        var act = card && card.querySelector(".mccf-zact");
        if (act && !act.querySelector("[data-cf-zsave]")) {
          act.insertAdjacentHTML("beforeend", '<button class="btn ghost small" type="button" data-cf-zdesc="' + id + '">Descartar</button><button class="btn small" type="button" data-cf-zsave="' + id + '">Guardar</button>');
          wireSecciones(main);
        }
      };
    });
    var nv = main.querySelector("#mccf-z-nueva");
    if (nv) nv.onclick = function () { C.zNew = true; C.zEdit._new = { nombre: "", bodega: "CABINA", sububicacion: "", frecuenciaDias: 30, activo: true }; void MCConteo.render({ mod: "conteos", sub: "secciones" }).then(function (h) { main.innerHTML = h; MCConteo.wire(main, { mod: "conteos", sub: "secciones" }); }); };
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
    var sub = main.querySelector("#mccf-z-sub");
    if (sub) sub.onclick = async function () {
      var bod = prompt("Bodega de la nueva sububicación (Cabina, Oficina o Venta):", "Cabina");
      if (bod == null) return;
      var g = /oficina/i.test(bod) ? "OFICINA" : /venta/i.test(bod) ? "CONSIGNACION" : "CABINA";
      if (g !== "CABINA") return alert("Una sección nueva de Venta u Oficina se crea con «＋ Sección». Las sububicaciones extra (Cabina 4, etc.) van en Bodega Cabina.");
      var cod = prompt("Código (ej. CABINA_4):", "CABINA_4");
      if (!cod) return;
      var nom = prompt("Nombre:", cod.replace(/^CABINA_?/i, "Cabina "));
      if (nom == null) return;
      var r = await api("cf_sub_save", { bodega: "CABINA", codigo: cod, nombre: nom, como_seccion: true });
      if (!r || r.error) return alert((r && r.error) || "No se pudo crear");
      go("#/m/conteos/secciones");
    };
  }
  function recHtml(movs) {
    if (!movs || !movs.length) return "";
    return '<div class="mccf-rec"><b>Recontar: hubo movimientos durante el conteo</b>' +
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
    var badge = (l.buscar ? ' <span style="color:var(--gold)">🔎 buscar después</span>' : "") + (l.otraSub ? ' <span style="color:var(--navy)">📍 ' + e(l.otraSub) + (l.otraQty != null ? " · " + e(l.otraQty) : "") + "</span>" : "");
    var h = '<div class="mccf-ln' + (l.buscar ? " skip" : "") + '" id="cc-l' + e(l.id) + '">' +
      '<div class="nm"><b>' + e(l.nombre) + "</b>" + badge + '<div class="sku">' + e(l.sku) + "</div></div>" +
      '<div class="subc">' + e(l.fromSub || "—") + '<div class="esp">esp. ' + e(l.esperado) + "</div></div>" +
      '<input class="cc-q' + (v === "" ? " cc-vacio" : "") + '" id="cc-c' + e(l.id) + '" data-cf-cant="' + e(l.id) + '" type="text" inputmode="' + (C.pad ? "none" : "decimal") + '" autocomplete="off" value="' + e(v) + '"' + (C.sec && C.sec.puedeOperar ? "" : " disabled") + ">" +
      '<button class="mccf-mn" type="button" data-cf-menu="' + e(l.id) + '" aria-label="Más">···</button></div>';
    if (op) {
      h += '<div class="mccf-ops">' +
        '<button type="button" data-cf-op="ubic" data-id="' + e(l.id) + '">+ Agregar ubicación</button>' +
        '<button type="button" data-cf-op="otro" data-id="' + e(l.id) + '">📍 Está en otro lugar</button>' +
        '<button type="button" data-cf-op="buscar" data-id="' + e(l.id) + '">🔎 Buscar después</button></div>';
    }
    if (otra) {
      var opts = (l.otrasUnids || []).map(function (o) {
        return '<option value="' + e(o.bodega + ":" + (o.sub || "")) + '">' + e(o.nombre) + (o.unidades ? " · " + o.unidades + " u" : "") + "</option>";
      }).join("");
      h += '<div class="mccf-otra">' + e(l.fromSub || "—") + " (principal): — · otras sububicaciones de esta bodega:" +
        '<div class="mccf-otra-row"><select data-cf-osub="' + e(l.id) + '"><option value="">Buscar sububicación…</option>' + opts + "</select>" +
        '<input class="cc-q" data-cf-oqty="' + e(l.id) + '" inputmode="decimal" value="' + e(l.otraQty == null ? "" : l.otraQty) + '">' +
        '<button class="x" type="button" data-cf-op="cerrar-otra" data-id="' + e(l.id) + '">×</button></div></div>';
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
    return '<div id="mccf-root" class="mccf-secwrap"><div class="mccf-secbar"><button class="back" type="button" data-go="#/m/conteos/cf/' + e(d.conteo.id) + '">←</button>' +
      "<h2>" + e(s.nombre) + " " + pill(s.estado, s.estadoNombre) + "</h2>" +
      '<span class="when">' + e(fecha(s.iniciadoAt)) + "</span></div>" +
      '<div class="mccf-search"><div class="qwrap">🔍 <input id="mccf-f" type="search" placeholder="Escanea o busca código / nombre" value="' + e(C.filtro) + '"></div>' +
      '<button class="mccf-padbtn' + (C.pad ? " on" : "") + '" type="button" id="mccf-pad">123</button>' +
      '<span class="mccf-cnt">' + e(nOk) + "/" + e(s.lineas) + "</span></div>" +
      (can ? '<button class="mccf-add" type="button" id="mccf-agregar">+ Agregar producto</button>' : "") +
      recHtml(d.movimientos) +
      '<div id="mccf-hits" class="mccf-hits" hidden></div>' +
      '<div id="mccf-lista">' + L.map(lineaSecHtml).join("") + "</div>" +
      '<div class="mccf-numpad' + (C.pad ? " on" : "") + '" id="mccf-numpad">' +
      [1,2,3,4,5,6,7,8,9,".","0","⌫"].map(function (k) { return '<button type="button" data-cf-key="' + e(k) + '">' + e(k) + "</button>"; }).join("") + "</div>" +
      (can || d.puedeTerminar ? '<div class="mccf-foot"><span class="ok' + (C.saved ? "" : " pend") + '" id="mccf-saved">' + (C.saved ? "✓ Guardado" : "sin guardar") + "</span>" +
        (d.puedeTerminar ? '<button class="btn small" type="button" id="mccf-terminar">Terminar</button>' : "") + "</div>" : "") +
      (d.puedeRevisar ? '<p style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn small" type="button" id="mccf-sec-ok">Aprobar sección</button><button class="btn ghost small" type="button" id="mccf-sec-back">Devolver</button></p>' : "") +
      "</div>";
  }
  function markSaved(ok) {
    C.saved = !!ok;
    var el = document.getElementById("mccf-saved");
    if (el) { el.textContent = ok ? "✓ Guardado" : "sin guardar"; el.classList.toggle("pend", !ok); }
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
