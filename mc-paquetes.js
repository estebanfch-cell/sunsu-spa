// Paquetes estilo MineCore (Emilia 17/11): lista paginada con progreso, detalle con sesiones
// (fecha / ticket / cosmetóloga), marcar sesión con confirmación, edición admin inline y baja con motivo.
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var K = { q: "", estado: "activos", items: [], total: 0, cuenta: null, d: null, edit: false };
  function f(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : (ymd || ""); }
  function pill(nombre) { return nombre ? (window.MCColor ? window.MCColor.pill(nombre) : e(nombre)) : '<span class="mccf-sub">—</span>'; }
  function prog(v) {
    var dots = ""; for (var i = 0; i < v.total; i++) dots += '<i class="' + (i < v.usados ? "u" : "") + '"></i>';
    var c = v.estado === "completo" ? "ok" : v.usados ? "c" : "n";
    return '<span class="mcpq-prog ' + c + '"><span class="mcpq-dots">' + dots + "</span>" + e(v.usados) + "/" + e(v.total) + (v.estado === "completo" ? " · Completo" : " · quedan " + e(v.pendientes)) + "</span>";
  }
  function toast2(msg, bad) { if (typeof toast === "function") toast(msg, bad ? "var(--red, #c0392b)" : "var(--green)"); }
  function css() {
    if (window.MCConteo && window.MCConteo._css) window.MCConteo._css();
    if (document.getElementById("mcpq-css")) return;
    var s = document.createElement("style"); s.id = "mcpq-css";
    s.textContent = [
      ".mcpq-h{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.mcpq-h h2{margin:0;font-size:1.2rem;flex:1}",
      ".mcpq-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.mcpq-tools input[type=search]{flex:1;min-width:220px;padding:9px 11px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:9px;font:inherit}",
      ".mcpq-chip{border:1.5px solid var(--cream-d,#e6dccb);background:var(--white,#fff);border-radius:999px;padding:5px 12px;font:inherit;font-size:.78rem;font-weight:700;color:var(--navy-d,#2b3f5c);cursor:pointer}.mcpq-chip.on{background:var(--navy-d,#2b3f5c);color:#fff;border-color:var(--navy-d,#2b3f5c)}",
      ".mcpq-t tbody tr{cursor:pointer}.mcpq-t tbody tr:hover{background:rgba(61,90,122,.05)}.mcpq-cod{font-weight:800;color:var(--navy-d,#2b3f5c);white-space:nowrap}.mcpq-cc{color:var(--gray,#8a93a6);font-size:.72rem}",
      ".mcpq-prog{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;font-size:.72rem;font-weight:800;background:#eef2f8;color:#3e5f8a;white-space:nowrap}.mcpq-prog.ok{background:#e3f4e8;color:#2e7d4f}.mcpq-prog.c{background:#fff3d6;color:#9a6b00}",
      ".mcpq-dots{display:inline-flex;gap:3px}.mcpq-dots i{width:8px;height:8px;border-radius:50%;border:1.5px solid currentColor;display:inline-block}.mcpq-dots i.u{background:currentColor}",
      ".mcpq-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}.mcpq-top h1{margin:0;font-size:1.5rem;color:var(--navy-d,#2b3f5c)}.mcpq-cli{font-weight:700;margin-top:2px}.mcpq-cli a{color:inherit}",
      ".mcpq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px 18px;margin-top:10px;font-size:.84rem}.mcpq-grid dt{color:var(--gray,#8a93a6);font-size:.7rem;text-transform:uppercase;letter-spacing:.04em}.mcpq-grid dd{margin:0 0 6px}",
      ".mcpq-grid input,.mcpq-grid select,.mcpq-ses input,.mcpq-dlg input,.mcpq-dlg select{width:100%;box-sizing:border-box;padding:6px 8px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:8px;font:inherit;font-size:.82rem}",
      ".mcpq-ses td{vertical-align:middle}.mcpq-ses .libre{color:var(--gray,#8a93a6)}.mcpq-ses .num{width:34px}",
      ".mcpq-dlg{position:fixed;inset:0;background:rgba(20,30,50,.35);display:flex;align-items:center;justify-content:center;z-index:9999}.mcpq-box{background:var(--white,#fff);border-radius:14px;padding:16px 18px;width:min(460px,94vw);box-shadow:0 12px 40px rgba(0,0,0,.2)}",
      ".mcpq-box h3{margin:0 0 4px;font-size:1.05rem;display:flex;justify-content:space-between;align-items:center}.mcpq-box label{display:block;font-size:.75rem;color:var(--gray,#8a93a6);margin:8px 0 3px}.mcpq-x{border:none;background:none;font-size:1.3rem;cursor:pointer;color:var(--navy-d,#2b3f5c)}",
      ".mcpq-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}.mcpq-del{color:#c0392b!important;border-color:#e6b0aa!important}.mcpq-hist{font-size:.75rem;color:var(--gray,#8a93a6);margin:2px 0}",
    ].join("\n");
    document.head.appendChild(s);
  }
  async function cargarLista(mas) {
    var r = await api("pq_lista", { q: K.q || "*", estado: K.estado, offset: mas ? K.items.length : 0, limit: 50 });
    if (!r || r.error) throw new Error((r && r.error) || "No se pudo cargar");
    K.items = mas ? K.items.concat(r.items || []) : (r.items || []); K.total = r.total || 0; K.cuenta = r.cuenta || null; K.admin = !!r.admin;
  }
  function filaHtml(v) {
    var cli = ((v.nombre || "") + " " + (v.apellido || "")).trim() || "Sin nombre";
    return '<tr data-pq="' + e(v.id) + '"><td class="mcpq-cod">' + e(v.codigo) + "</td><td><b>" + e(cli) + "</b>" + (v.clienteCodigo ? ' <span class="mcpq-cc">· ' + e(v.clienteCodigo) + "</span>" : "") + '<div class="mcpq-cc">' + e(v.cedula || "") + "</div></td><td>" + e(v.paquete) + "</td><td>" + prog(v) + "</td><td>" + pill(v.vendidoPor) + "</td><td>" + e(f(v.fechaCompra)) + "</td></tr>";
  }
  function listaHtml() {
    var c = K.cuenta || {};
    var chip = function (k, t, nn) { return '<button type="button" class="mcpq-chip' + (K.estado === k ? " on" : "") + '" data-est="' + k + '">' + t + (nn != null ? " (" + nn + ")" : "") + "</button>"; };
    return '<div id="mcpq-root"><div class="mcpq-h"><h2>🎴 Paquetes</h2></div>' +
      '<div class="mcpq-tools"><input type="search" id="mcpq-q" placeholder="🔎 Código PQ, clienta, cédula o paquete" value="' + e(K.q) + '">' + chip("activos", "Activos", c.activos) + chip("completos", "Completos", c.completos) + chip("todos", "Todos", c.todos) + "</div>" +
      '<div class="mccf-card"><div class="sheet-scroll"><table class="mccf-t mcpq-t"><thead><tr><th>Código</th><th>Clienta</th><th>Paquete</th><th>Progreso</th><th>Vendió</th><th>Compra</th></tr></thead><tbody id="mcpq-body">' +
      (K.items.length ? K.items.map(filaHtml).join("") : '<tr><td colspan="6" class="mccf-sub">Sin paquetes.</td></tr>') + "</tbody></table></div>" +
      '<div class="mcpq-acts" style="justify-content:space-between"><span class="mccf-sub">' + e(K.items.length) + " de " + e(K.total) + "</span>" + (K.items.length < K.total ? '<button class="btn ghost small" type="button" id="mcpq-mas">Cargar más</button>' : "") + "</div></div></div>";
  }
  function wireLista(main) {
    var t = null, q = main.querySelector("#mcpq-q");
    if (q) q.oninput = function () { clearTimeout(t); t = setTimeout(async function () { K.q = q.value.trim(); try { await cargarLista(false); repLista(main); } catch (x) { toast2(x.message, true); } }, 300); };
    main.querySelectorAll("[data-est]").forEach(function (b) { b.onclick = async function () { K.estado = b.getAttribute("data-est"); try { await cargarLista(false); repLista(main); } catch (x) { toast2(x.message, true); } }; });
    var mas = main.querySelector("#mcpq-mas"); if (mas) mas.onclick = async function () { mas.disabled = true; try { await cargarLista(true); repLista(main); } catch (x) { toast2(x.message, true); } };
    var body = main.querySelector("#mcpq-body"); if (body) body.onclick = function (ev) { var tr = ev.target.closest("[data-pq]"); if (tr) location.hash = "#/m/gift/paquetes/" + encodeURIComponent(tr.getAttribute("data-pq")); };
  }
  function repLista(main) { var root = main.querySelector("#mcpq-root"); if (!root) return; var foco = document.activeElement && document.activeElement.id === "mcpq-q"; root.outerHTML = listaHtml(); wireLista(main); if (foco) { var q = main.querySelector("#mcpq-q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }

  // ---------- detalle ----------
  async function cargarDet(id) {
    var r = await api("pq_get", /^\d+$/.test(id) ? { id: id } : { codigo: id });
    if (!r || r.error) throw new Error((r && r.error) || "Paquete no encontrado");
    K.d = r; return r;
  }
  function detHtml() {
    var d = K.d, v = d.item, adm = d.puedeEditar, ed = K.edit && adm;
    var cli = ((v.nombre || "") + " " + (v.apellido || "")).trim() || "Sin nombre";
    var link = v.cedula ? "#/m/clientes/c/" + encodeURIComponent("c:" + v.cedula) : "";
    var inp = function (k, val, type) { return '<input data-f="' + k + '" type="' + (type || "text") + '" value="' + e(val || "") + '">'; };
    var dl = function (t, ro, rw) { return "<div><dt>" + t + "</dt><dd>" + (ed ? rw : ro) + "</dd></div>"; };
    var sesSel = '<select data-f="sesiones">' + [1, 2, 3, 4, 5, 6].map(function (x) { return '<option value="' + x + '"' + (x === v.total ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select>";
    var libre = (v.sesiones || []).findIndex(function (x) { return !x.usado; });
    var filas = (v.sesiones || []).map(function (se, i) {
      var acc = !se.usado ? (i === libre ? '<button class="btn small" type="button" data-marcar="' + se.slot + '">✓ Marcar</button>' : "") : (adm ? '<button class="btn ghost small" type="button" data-desmarcar="' + se.slot + '">Desmarcar</button>' : "");
      var fecha = se.usado ? (ed ? '<input type="date" data-fs="' + se.slot + '" value="' + e(se.fecha) + '">' : e(f(se.fecha) || se.texto)) : '<span class="libre">Libre</span>';
      var tk = se.ticket ? '<a href="#/m/tickets/t/' + encodeURIComponent(se.ticket) + '" class="mcpq-cod">' + e(se.ticket) + "</a>" : (se.usado ? '<span class="mccf-sub">—</span>' : "");
      return '<tr class="' + (se.usado ? "" : "libre") + '"><td class="num">' + se.slot + "</td><td>" + fecha + "</td><td>" + tk + "</td><td>" + (se.usado ? pill(se.cosmetologa) : "") + "</td><td>" + e(se.usado ? se.facial : "") + '</td><td style="text-align:right">' + acc + "</td></tr>";
    }).join("");
    return '<div id="mcpq-root">' +
      '<div class="mcpq-acts" style="justify-content:space-between;margin:0 0 8px"><button class="btn ghost small" type="button" data-go="#/m/gift/paquetes">← Paquetes</button><span>' +
      (adm ? (ed ? '<button class="btn ghost small" type="button" id="mcpq-cancel">Cancelar</button> <button class="btn small" type="button" id="mcpq-save">💾 Guardar</button>' : '<button class="btn ghost small" type="button" id="mcpq-edit">✏️ Editar</button> <button class="btn ghost small mcpq-del" type="button" id="mcpq-del">🗑️ Eliminar</button>') : "") + "</span></div>" +
      '<div class="mccf-card"><div class="mcpq-top"><div><h1>' + e(v.codigo) + '</h1><div class="mcpq-cli">' + (link ? '<a href="' + link + '">' + e(cli) + "</a>" : e(cli)) + (v.clienteCodigo ? ' <span class="mcpq-cc">· ' + e(v.clienteCodigo) + "</span>" : "") + '</div><div class="mccf-sub">' + e(v.paquete) + "</div></div><div>" + prog(v) + "</div></div>" +
      '<dl class="mcpq-grid">' +
      dl("Sesiones", e(v.total), sesSel) + dl("Nombre", e(v.nombre), inp("nombres", v.nombre)) + dl("Apellido", e(v.apellido), inp("apellidos", v.apellido)) + dl("Cédula", e(v.cedula), inp("cedula", v.cedula)) +
      dl("Código clienta", e(v.clienteCodigo || "—"), inp("cliente_codigo", v.clienteCodigo)) + dl("Producto", e(v.paquete), inp("paquete", v.paquete)) + dl("SKU", e(v.sku || "—"), inp("sku", v.sku)) +
      dl("Fecha de compra", e(f(v.fechaCompra) || "—"), inp("fecha_compra", v.fechaCompra, "date")) + dl("Vendió", pill(v.vendidoPor), inp("vendido_por", v.vendidoPor)) +
      (v.ticketOrigen ? "<div><dt>Ticket de venta</dt><dd>" + e(v.ticketOrigen) + "</dd></div>" : "") + "</dl></div>" +
      '<div class="mccf-card"><b>Sesiones</b><div class="sheet-scroll" style="margin-top:6px"><table class="mccf-t mcpq-ses"><thead><tr><th>#</th><th>Fecha</th><th>Ticket</th><th>Cosmetóloga</th><th>Facial</th><th></th></tr></thead><tbody>' + filas + "</tbody></table></div></div>" +
      ((v.historial || []).length ? '<div class="mccf-card"><b>Historial</b>' + v.historial.slice().reverse().map(function (h) { return '<p class="mcpq-hist">' + e(String(h.fecha || "").slice(0, 16).replace("T", " ")) + " · " + e(h.actor) + " · " + e(h.accion) + ": " + e(h.detalle) + "</p>"; }).join("") + "</div>" : "") +
      "</div>";
  }
  function dlg(html, onOk) {
    var box = document.createElement("div"); box.className = "mcpq-dlg";
    box.innerHTML = '<div class="mcpq-box">' + html + '<p class="err" data-err></p><div class="mcpq-acts"><button class="btn ghost small" type="button" data-no>Volver</button><button class="btn small" type="button" data-ok>Confirmar</button></div></div>';
    document.body.appendChild(box);
    var cerrar = function () { box.remove(); };
    box.querySelectorAll("[data-no],.mcpq-x").forEach(function (b) { b.onclick = cerrar; });
    box.onclick = function (ev) { if (ev.target === box) cerrar(); };
    box.querySelector("[data-ok]").onclick = async function () {
      var b = this; b.disabled = true;
      try { await onOk(box); cerrar(); } catch (x) { box.querySelector("[data-err]").textContent = (x && x.message) || String(x); b.disabled = false; }
    };
    return box;
  }
  /** Marca la próxima sesión libre de un paquete (detalle o Clientes › Paquetes), con confirmación. */
  function marcarSesion(pq, slot, alListo) {
    var hoy = (K.d && K.d.hoy) || new Date().toISOString().slice(0, 10);
    var yo = (window.CU && window.CU.name) || (window.state && window.state.name) || "";
    var pers = (K.d && K.d.personas) || [];
    if (yo && pers.indexOf(yo) < 0) pers = [yo].concat(pers);
    dlg('<h3>✓ Marcar sesión ' + e(slot || "") + '<button type="button" class="mcpq-x">×</button></h3><p class="mccf-sub">' + e(pq.codigo || "") + " · " + e(pq.paquete || pq.nombre || "") + '</p>' +
      '<label>Fecha</label><input type="date" data-fecha value="' + e(hoy) + '">' +
      '<label>Cosmetóloga</label>' + (pers.length ? '<select data-cos>' + pers.map(function (p) { return '<option' + (p === yo ? " selected" : "") + ">" + e(p) + "</option>"; }).join("") + "</select>" : '<input type="text" data-cos value="' + e(yo) + '">') +
      '<label>Ticket (opcional)</label><input type="text" data-tk placeholder="TK-SO-…">',
      async function (box) {
        var r = await api("pq_marcar", { id: pq.id, slot: slot || undefined, fecha: box.querySelector("[data-fecha]").value, cosmetologa: box.querySelector("[data-cos]").value, ticket: box.querySelector("[data-tk]").value.trim() });
        if (!r || r.error) throw new Error((r && r.error) || "No se pudo marcar");
        toast2("Sesión " + r.slot + " marcada" + (r.completo ? " · paquete completo" : ""));
        if (alListo) await alListo(r);
      });
  }
  async function repDet(main) { var root = main.querySelector("#mcpq-root"); if (root) { root.outerHTML = detHtml(); wireDet(main); } }
  function wireDet(main) {
    var v = K.d.item, recargar = async function () { await cargarDet(String(v.id)); repDet(main); };
    main.querySelectorAll("[data-marcar]").forEach(function (b) { b.onclick = function () { marcarSesion(v, +b.getAttribute("data-marcar"), recargar); }; });
    main.querySelectorAll("[data-desmarcar]").forEach(function (b) {
      b.onclick = function () {
        var sl = +b.getAttribute("data-desmarcar");
        dlg('<h3>Desmarcar sesión ' + sl + '<button type="button" class="mcpq-x">×</button></h3><p class="mccf-sub">La sesión vuelve a quedar libre. Queda en el historial.</p>', async function () {
          var r = await api("pq_marcar", { id: v.id, slot: sl, desmarcar: true });
          if (!r || r.error) throw new Error((r && r.error) || "No se pudo desmarcar");
          toast2("Sesión " + sl + " desmarcada"); await recargar();
        });
      };
    });
    var ed = main.querySelector("#mcpq-edit"); if (ed) ed.onclick = function () { K.edit = true; repDet(main); };
    var ca = main.querySelector("#mcpq-cancel"); if (ca) ca.onclick = function () { K.edit = false; repDet(main); };
    var sv = main.querySelector("#mcpq-save"); if (sv) sv.onclick = async function () {
      var datos = {}, fechas = {};
      main.querySelectorAll("[data-f]").forEach(function (i) { datos[i.getAttribute("data-f")] = i.value; });
      main.querySelectorAll("[data-fs]").forEach(function (i) { fechas[i.getAttribute("data-fs")] = i.value; });
      sv.disabled = true;
      try {
        var r = await api("pq_guardar", { id: v.id, datos: datos, fechas: fechas });
        if (!r || r.error) throw new Error((r && r.error) || "No se pudo guardar");
        toast2(r.sinCambios ? "Sin cambios" : "Paquete guardado"); K.edit = false; await recargar();
      } catch (x) { toast2(x.message, true); sv.disabled = false; }
    };
    var del = main.querySelector("#mcpq-del"); if (del) del.onclick = function () {
      dlg('<h3>🗑️ Eliminar ' + e(v.codigo) + '<button type="button" class="mcpq-x">×</button></h3><p class="mccf-sub">El paquete sale de la lista y de la ficha de la clienta. Queda en el historial con el motivo.</p><label>Motivo</label><input type="text" data-mot placeholder="Ej. duplicado, se devolvió">', async function (box) {
        var r = await api("pq_borrar", { id: v.id, motivo: box.querySelector("[data-mot]").value });
        if (!r || r.error) throw new Error((r && r.error) || "No se pudo eliminar");
        toast2("Paquete eliminado"); location.hash = "#/m/gift/paquetes";
      });
    };
  }
  async function render(route) {
    css(); K.edit = false;
    try {
      if (route.id) { await cargarDet(String(route.id)); return detHtml(); }
      await cargarLista(false); return listaHtml();
    } catch (x) { return '<p class="err">' + e(x.message || x) + '</p><button class="btn ghost small" type="button" data-go="#/m/gift/paquetes">← Paquetes</button>'; }
  }
  function wire(main, route) { if (route.id) { if (K.d) wireDet(main); } else wireLista(main); }
  window.MCPaquetes = { render: render, wire: wire, marcarSesion: marcarSesion, ensureList: async function () { if ((K.items || []).length) return true; await cargarLista(false); return true; }, _k: K };
})();
