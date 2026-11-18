// Paquetes estilo MineCore (Emilia 17/11): lista paginada con progreso, detalle con sesiones
// (fecha / ticket / cosmetóloga), marcar sesión con confirmación, edición en línea sin botón «Editar» (TK55: la admin guarda, el personal
// manda solicitud) y baja con motivo.
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var K = { q: "", estado: "activos", items: [], total: 0, cuenta: null, d: null, st: null };
  function f(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : (ymd || ""); }
  function pill(nombre) { return nombre ? (window.MCColor ? window.MCColor.pill(nombre) : e(nombre)) : '<span class="mccf-sub">—</span>'; }
  function prog(v) {
    var dots = ""; for (var i = 0; i < v.total; i++) dots += '<i class="' + (i < v.usados ? "u" : "") + '"></i>';
    if (v.estado === "anulado") return '<span class="mcpq-prog n" style="background:#F6E3E3;color:#B86B6B">⛔ Anulado · ' + e(v.usados) + "/" + e(v.total) + "</span>";
    var c = v.estado === "completo" ? "ok" : v.usados ? "c" : "n";
    return '<span class="mcpq-prog ' + c + '"><span class="mcpq-dots">' + dots + "</span>" + e(v.usados) + "/" + e(v.total) + (v.estado === "completo" ? " · Completo" : " · quedan " + e(v.pendientes)) + "</span>";
  }
  function hora(iso) { var d = new Date(iso || ""); return isNaN(d) ? String(iso || "") : d.toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
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
      '<div class="mcpq-tools"><input type="search" id="mcpq-q" placeholder="🔎 Código PQ, clienta, cédula o paquete" value="' + e(K.q) + '">' + chip("activos", "Activos", c.activos) + chip("completos", "Completos", c.completos) + (c.anulados ? chip("anulados", "Anulados", c.anulados) : "") + chip("todos", "Todos", c.todos) + "</div>" +
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
    K.d = r; K.st = null; return r;
  }
  function detHtml() {
    var d = K.d, v = d.item, adm = d.puedeEditar, st = K.st || (K.st = window.MCEdit.nuevo({ admin: adm, pedir: d.puedePedir }));
    var cli = ((v.nombre || "") + " " + (v.apellido || "")).trim() || "Sin nombre";
    var link = v.cedula ? "#/m/clientes/c/" + encodeURIComponent("c:" + v.cedula) : "";
    var E = function (k, shown, raw, o) { return window.MCEdit.v(st, k, shown, raw, o); };
    var dl = function (t, html) { return "<div><dt>" + t + "</dt><dd>" + html + "</dd></div>"; };
    var fmtF = function (x) { return e(f(x) || "—"); };
    var pers = (d.personas || []).slice(); if (v.vendidoPor && pers.indexOf(v.vendidoPor) < 0) pers.unshift(v.vendidoPor);
    var libre = (v.sesiones || []).findIndex(function (x) { return !x.usado; });
    var filas = (v.sesiones || []).map(function (se, i) {
      var acc = v.anulado && !se.usado ? "" : !se.usado ? (i === libre ? '<button class="btn small" type="button" data-marcar="' + se.slot + '">✓ Marcar</button>' : "") : (adm ? '<button class="btn ghost small" type="button" data-desmarcar="' + se.slot + '">Desmarcar</button>' : "");
      var fecha = se.usado ? E("fs:" + se.slot, e(f(se.fecha) || se.texto), se.fecha, { tipo: "date", fmt: fmtF, label: "Fecha sesión " + se.slot }) : '<span class="libre">Libre</span>';
      var tk = se.ticket ? '<a href="#/m/tickets/t/' + encodeURIComponent(se.ticket) + '" class="mcpq-cod">' + e(se.ticket) + "</a>" : (se.usado ? '<span class="mccf-sub">—</span>' : "");
      return '<tr class="' + (se.usado ? "" : "libre") + '"><td class="num">' + se.slot + "</td><td>" + fecha + "</td><td>" + tk + "</td><td>" + (se.usado ? pill(se.cosmetologa) : "") + "</td><td>" + e(se.usado ? se.facial : "") + '</td><td style="text-align:right">' + acc + "</td></tr>";
    }).join("");
    return '<div id="mcpq-root">' +
      '<div class="mcpq-acts" style="justify-content:space-between;margin:0 0 8px"><button class="btn ghost small" type="button" data-go="#/m/gift/paquetes">← Paquetes</button><span>' +
      '<button class="btn ghost small" type="button" id="mcpq-ficha">📄 Descargar ficha</button> ' + window.MCEdit.botonBorrar(st, "mcpq-del") + "</span></div>" +
      '<div class="mccf-card"><div class="mcpq-top"><div><h1>' + e(v.codigo) + '</h1><div class="mcpq-cli">' + (link ? '<a href="' + link + '">' + e(cli) + "</a>" : e(cli)) + (v.clienteCodigo ? ' <span class="mcpq-cc">· ' + e(v.clienteCodigo) + "</span>" : "") + '</div><div class="mccf-sub">' + e(v.paquete) + "</div></div><div>" + prog(v) + "</div></div>" +
      (v.anulado ? '<p style="background:#F6E3E3;color:#8A3B3B;border-radius:10px;padding:8px 12px;font-size:0.8rem;font-weight:700;margin:8px 0">⛔ Paquete anulado' + (v.anuladoPor ? " · ticket " + e(v.anuladoPor) + " cancelado" : "") + (v.anuladoMotivo ? " · " + e(v.anuladoMotivo) : "") + ". Sus sesiones ya no se pueden usar.</p>" : "") +
      '<dl class="mcpq-grid">' +
      dl("Sesiones", E("sesiones", e(v.total), v.total, { opciones: [1, 2, 3, 4, 5, 6], label: "Sesiones" })) + dl("Nombre", E("nombres", e(v.nombre), v.nombre, { label: "Nombre" })) + dl("Apellido", E("apellidos", e(v.apellido), v.apellido, { label: "Apellido" })) + dl("Cédula", E("cedula", e(v.cedula), v.cedula, { label: "Cédula" })) +
      dl("Código clienta", E("cliente_codigo", e(v.clienteCodigo || ""), v.clienteCodigo, { label: "Código clienta" })) + dl("Producto", E("paquete", e(v.paquete), v.paquete, { label: "Producto" })) + dl("SKU", E("sku", e(v.sku || ""), v.sku, { label: "SKU" })) +
      dl("Fecha de compra", E("fecha_compra", e(f(v.fechaCompra) || ""), v.fechaCompra, { tipo: "date", fmt: fmtF, label: "Fecha de compra" })) + dl("Vendió", E("vendido_por", pill(v.vendidoPor), v.vendidoPor, { opciones: pers.length ? pers : null, label: "Vendió" })) +
      (v.ticketOrigen ? "<div><dt>Ticket de venta</dt><dd>" + e(v.ticketOrigen) + "</dd></div>" : "") + "</dl>" + window.MCEdit.hint(st) + window.MCEdit.barra(st) + "</div>" +
      '<div class="mccf-card"><b>Sesiones</b><div class="sheet-scroll" style="margin-top:6px"><table class="mccf-t mcpq-ses"><thead><tr><th>#</th><th>Fecha</th><th>Ticket</th><th>Cosmetóloga</th><th>Facial</th><th></th></tr></thead><tbody>' + filas + "</tbody></table></div></div>" +
      ((v.historial || []).length ? '<div class="mccf-card"><b>Historial</b>' + v.historial.slice().reverse().map(function (h) { return '<p class="mcpq-hist">' + e(hora(h.fecha)) + " · " + e(h.actor) + " · " + e(h.accion) + ": " + e(h.detalle) + "</p>"; }).join("") + "</div>" : "") +
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
    var st = K.st;
    window.MCEdit.wire(main.querySelector("#mcpq-root"), st, {
      redibujar: function () { repDet(main); },
      guardar: function (pend) { var x = partir(pend); return api("pq_guardar", { id: v.id, datos: x.datos, fechas: x.fechas }); },
      pedir: function (pend, motivo) { return api("solicitud_crear", { tabla: "paquete_beta", fila: String(v.id), tipo: "cambio", motivo: motivo, propuestos: pend }); },
      listo: async function (r) { toast2(st.admin ? (r.sinCambios ? "Sin cambios" : "Paquete guardado") : "📨 Solicitud enviada a Emilia / Emi"); await recargar(); },
    });
    var fb = main.querySelector("#mcpq-ficha"); if (fb) fb.onclick = async function () {
      if (!window.MCDocPdf) { toast2("El generador de PDF no cargó. Recarga la página.", true); return; }
      fb.disabled = true; var t0 = fb.textContent; fb.textContent = "Generando…";
      try { await window.MCDocPdf.bajar(fichaSpec(v)); toast2("📄 Ficha descargada"); } catch (x) { toast2((x && x.message) || "No se pudo generar la ficha", true); }
      fb.disabled = false; fb.textContent = t0;
    };
    var del = main.querySelector("#mcpq-del"); if (del) del.onclick = function () {
      var adm = st.admin;
      dlg('<h3>🗑️ ' + (adm ? "Eliminar " : "Solicitar eliminación de ") + e(v.codigo) + '<button type="button" class="mcpq-x">×</button></h3><p class="mccf-sub">' + (adm ? "El paquete sale de la lista y de la ficha de la clienta. Queda en el historial con el motivo." : "No se borra ahora: la solicitud llega a Emilia / Emi para que la aprueben.") + '</p><label>Motivo</label><input type="text" data-mot placeholder="Ej. duplicado, se devolvió">', async function (box) {
        var mot = box.querySelector("[data-mot]").value.trim();
        if (!mot) throw new Error("Escribe el motivo");
        var r = adm ? await api("pq_borrar", { id: v.id, motivo: mot }) : await api("solicitud_crear", { tabla: "paquete_beta", fila: String(v.id), tipo: "eliminacion", motivo: mot });
        if (!r || r.error) throw new Error((r && r.error) || "No se pudo");
        if (adm) { toast2("Paquete eliminado"); location.hash = "#/m/gift/paquetes"; } else toast2("📨 Solicitud de eliminación enviada");
      });
    };
  }
  /** Ficha del paquete en PDF (Emilia 18/11): clienta, producto, sesiones con fecha / ticket / cosmetóloga, cuántas quedan y quién vendió. */
  function fichaSpec(v) {
    var cli = ((v.nombre || "") + " " + (v.apellido || "")).trim() || "Sin nombre";
    var yo = (window.state && window.state.user && (window.state.user.name || window.state.user.short)) || "";
    var ahora = new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    var filas = (v.sesiones || []).map(function (se) { return [String(se.slot), se.usado ? (f(se.fecha) || se.texto || "") : "", se.ticket || "", se.usado ? (se.cosmetologa || "") : "", se.usado ? (se.facial || "") : "", se.usado ? "Usada" : "Libre"]; });
    return {
      nombre: "Ficha " + v.codigo + " " + cli,
      paginas: [{
        titulo: "Ficha de paquete", numero: v.codigo, subt: v.paquete || "",
        info: [["Clienta", cli], ["Cédula", v.cedula || ""], ["Código clienta", v.clienteCodigo || ""], ["Producto", v.paquete || ""], ["SKU", v.sku || ""],
          ["Fecha de compra", f(v.fechaCompra) || ""], ["Vendió", v.vendidoPor || ""], ["Ticket de venta", v.ticketOrigen || ""],
          ["Sesiones", v.usados + " de " + v.total + " usadas"], ["Quedan", v.estado === "completo" ? "0 · Completo" : String(v.pendientes)]],
        aviso: v.estado === "completo" ? "Paquete completo: ya se usaron todas las sesiones." : "Quedan " + v.pendientes + " de " + v.total + " sesiones.",
        tabla: { cols: [{ t: "#", w: 0.5 }, { t: "Fecha", w: 1.2 }, { t: "Ticket", w: 1.5 }, { t: "Cosmetóloga", w: 1.8 }, { t: "Facial", w: 2.2 }, { t: "Estado", w: 0.9 }], filas: filas, vacio: "Sin sesiones" },
        notas: ["Generada el " + ahora + (yo ? " por " + yo : "") + "."],
      }],
    };
  }
  function partir(pend) {
    var datos = {}, fechas = {};
    Object.keys(pend).forEach(function (k) { if (k.indexOf("fs:") === 0) fechas[k.slice(3)] = pend[k]; else datos[k] = pend[k]; });
    return { datos: datos, fechas: fechas };
  }
  async function render(route) {
    css(); K.st = null;
    try {
      if (route.id) { await cargarDet(String(route.id)); return detHtml(); }
      await cargarLista(false); return listaHtml();
    } catch (x) { return '<p class="err">' + e(x.message || x) + '</p><button class="btn ghost small" type="button" data-go="#/m/gift/paquetes">← Paquetes</button>'; }
  }
  function wire(main, route) { if (route.id) { if (K.d) wireDet(main); } else wireLista(main); }
  window.MCPaquetes = { render: render, wire: wire, marcarSesion: marcarSesion, fichaSpec: fichaSpec, ensureList: async function () { if ((K.items || []).length) return true; await cargarLista(false); return true; }, _k: K };
})();
