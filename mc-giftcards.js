// 🎁 Gift cards estilo MineCore (TK20, Emilia 17/11): lista con estados, detalle (comprador, para, de,
// servicio, validez, tickets de venta y uso), vender con el siguiente código único, marcar uso con
// confirmación, edición y baja admin, y el PDF de la gift card guardado en Documentos.
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var K = { q: "", estado: "vigentes", items: [], total: 0, cuenta: null, d: null, edit: false, siguiente: "" };
  var SERVICIOS = ["Facial Premium", "Purificación SOS", "Glass Skin", "Facial Reset", "Hydra Glow", "Valor en dólares"];
  function f(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : (ymd || ""); }
  function toast2(msg, bad) { if (typeof toast === "function") toast(msg, bad ? "var(--red, #c0392b)" : "var(--green)"); }
  function pill(nombre) { return nombre ? (window.MCColor ? window.MCColor.pill(nombre) : e(nombre)) : '<span class="mccf-sub">—</span>'; }
  function css() {
    if (document.getElementById("mcgc-css")) return;
    var s = document.createElement("style"); s.id = "mcgc-css";
    s.textContent = [
      ".mcgc-h{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.mcgc-h h2{margin:0;font-size:1.2rem;flex:1}",
      ".mcgc-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.mcgc-tools input[type=search]{flex:1;min-width:220px;padding:9px 11px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:9px;font:inherit}",
      ".mcgc-chip{border:1.5px solid var(--cream-d,#e6dccb);background:var(--white,#fff);border-radius:999px;padding:5px 12px;font:inherit;font-size:.78rem;font-weight:700;color:var(--navy-d,#2b3f5c);cursor:pointer}.mcgc-chip.on{background:var(--navy-d,#2b3f5c);color:#fff;border-color:var(--navy-d,#2b3f5c)}",
      ".mcgc-t tbody tr{cursor:pointer}.mcgc-t tbody tr:hover{background:rgba(61,90,122,.05)}.mcgc-cod{font-weight:800;color:var(--navy-d,#2b3f5c);white-space:nowrap}.mcgc-sub{color:var(--gray,#8a93a6);font-size:.72rem}",
      ".mcgc-est{display:inline-block;border-radius:999px;padding:3px 10px;font-size:.72rem;font-weight:800;white-space:nowrap}.mcgc-est.vigente{background:#e3f4e8;color:#2e7d4f}.mcgc-est.usada{background:#eef2f8;color:#3e5f8a}.mcgc-est.vencida{background:#fdecea;color:#b03a2e}.mcgc-est.disponible{background:#f6f1e7;color:#8a6d1a}.mcgc-est.eliminada{background:#f3f3f3;color:#888}",
      ".mcgc-rep{display:inline-block;margin-left:4px;border-radius:6px;padding:0 5px;font-size:.66rem;font-weight:800;background:#fff4d6;color:#8a6d1a}",
      ".mcgc-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}.mcgc-top h1{margin:0;font-size:1.6rem;color:var(--navy-d,#2b3f5c)}",
      ".mcgc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px 18px;margin-top:10px;font-size:.84rem}.mcgc-grid dt{color:var(--gray,#8a93a6);font-size:.7rem;text-transform:uppercase;letter-spacing:.04em}.mcgc-grid dd{margin:0;font-weight:600;overflow-wrap:anywhere}",
      ".mcgc-grid input,.mcgc-grid select,.mcgc-box input,.mcgc-box select,.mcgc-box textarea,.mcgc-form input,.mcgc-form select,.mcgc-form textarea{width:100%;box-sizing:border-box;padding:7px 9px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:8px;font:inherit;font-size:.84rem;text-transform:none}",
      ".mcgc-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px 16px}.mcgc-form label{display:block;font-size:.72rem;color:var(--gray,#8a93a6);margin-bottom:3px;font-weight:700}.mcgc-form .full{grid-column:1/-1}",
      ".mcgc-big{font-size:1.5rem;font-weight:900;color:var(--navy-d,#2b3f5c);letter-spacing:.02em}",
      ".mcgc-dlg{position:fixed;inset:0;background:rgba(20,30,50,.35);display:flex;align-items:center;justify-content:center;z-index:9999}.mcgc-box{background:var(--white,#fff);border-radius:14px;padding:16px 18px;width:min(460px,94vw);box-shadow:0 12px 40px rgba(0,0,0,.2)}",
      ".mcgc-box h3{margin:0 0 4px;font-size:1.05rem;display:flex;justify-content:space-between;align-items:center}.mcgc-box label{display:block;font-size:.75rem;color:var(--gray,#8a93a6);margin:8px 0 3px}.mcgc-x{border:none;background:none;font-size:1.3rem;cursor:pointer;color:var(--gray,#8a93a6)}",
      ".mcgc-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}.mcgc-del{color:#c0392b!important;border-color:#e6b0aa!important}",
      ".mcgc-docs{list-style:none;padding:0;margin:8px 0 0}.mcgc-docs li{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:7px 4px;border-top:1px solid var(--cream-d,#e6dccb);font-size:.82rem}.mcgc-docs li:first-child{border-top:0}",
    ].join("\n");
    document.head.appendChild(s);
  }
  function estHtml(v) { return '<span class="mcgc-est ' + e(v.estado) + '">' + e(v.estadoTxt || v.estado) + "</span>"; }

  // ---------- lista ----------
  async function cargarLista(mas) {
    var r = await api("gcb_lista", { q: K.q || "*", estado: K.estado, offset: mas ? K.items.length : 0, limit: 50 });
    if (!r || r.error) throw new Error((r && r.error) || "No se pudo cargar");
    K.items = mas ? K.items.concat(r.items || []) : (r.items || []); K.total = r.total || 0; K.cuenta = r.cuenta || null; K.admin = !!r.admin; K.siguiente = r.siguiente || "";
  }
  function filaHtml(v) {
    var uso = v.usado ? e(f(v.fechaUso)) + (v.usadoPor ? '<div class="mcgc-sub">' + e(v.usadoPor) + "</div>" : "") : '<span class="mcgc-sub">—</span>';
    return '<tr data-gc="' + e(v.id) + '"><td class="mcgc-cod">' + e(v.codigo) + (v.repetido ? '<span class="mcgc-rep" title="Código repetido en la hoja (se deja como está)">repetido</span>' : "") + (v.prueba ? " 🧪" : "") + "</td>" +
      "<td>" + e(f(v.fechaVenta)) + "</td><td><b>" + e(v.comprador || "—") + "</b>" + (v.cedula ? '<div class="mcgc-sub">' + e(v.cedula) + "</div>" : "") + "</td>" +
      "<td>" + e(v.para || "—") + "</td><td>" + e(v.servicio || v.valor || "—") + "</td><td>" + e(v.factura || "—") + "</td><td>" + estHtml(v) + "</td><td>" + uso + "</td></tr>";
  }
  function listaHtml() {
    var c = K.cuenta || {};
    var chip = function (k, t, nn) { return '<button type="button" class="mcgc-chip' + (K.estado === k ? " on" : "") + '" data-est="' + k + '">' + t + (nn != null ? " (" + nn + ")" : "") + "</button>"; };
    return '<div id="mcgc-root"><div class="mcgc-h"><h2>🎁 Gift cards</h2><button class="btn small" type="button" data-go="#/m/gift/cards/nueva">＋ Vender gift card</button></div>' +
      '<div class="mcgc-tools"><input type="search" id="mcgc-q" placeholder="🔎 Código, comprador, cédula, para, factura o ticket" value="' + e(K.q) + '">' +
      chip("vigentes", "Vigentes", c.vigentes) + chip("usadas", "Usadas", c.usadas) + chip("vencidas", "Vencidas", c.vencidas) + chip("todas", "Todas", c.todas) + chip("disponibles", "Códigos libres", c.disponibles) + "</div>" +
      '<div class="mccf-card"><div class="sheet-scroll"><table class="mccf-t mcgc-t"><thead><tr><th>Código</th><th>Venta</th><th>Comprador</th><th>Para</th><th>Servicio</th><th>Factura</th><th>Estado</th><th>Uso</th></tr></thead><tbody id="mcgc-body">' +
      (K.items.length ? K.items.map(filaHtml).join("") : '<tr><td colspan="8" class="mccf-sub">Sin gift cards.</td></tr>') + "</tbody></table></div>" +
      '<div class="mcgc-acts" style="justify-content:space-between"><span class="mccf-sub">' + e(K.items.length) + " de " + e(K.total) + (K.siguiente ? " · siguiente código: <b>" + e(K.siguiente) + "</b>" : "") + "</span>" + (K.items.length < K.total ? '<button class="btn ghost small" type="button" id="mcgc-mas">Cargar más</button>' : "") + "</div></div></div>";
  }
  function wireLista(main) {
    var t = null, q = main.querySelector("#mcgc-q");
    if (q) q.oninput = function () { clearTimeout(t); t = setTimeout(async function () { K.q = q.value.trim(); try { await cargarLista(false); repLista(main); } catch (x) { toast2(x.message, true); } }, 300); };
    main.querySelectorAll("[data-est]").forEach(function (b) { b.onclick = async function () { K.estado = b.getAttribute("data-est"); try { await cargarLista(false); repLista(main); } catch (x) { toast2(x.message, true); } }; });
    var mas = main.querySelector("#mcgc-mas"); if (mas) mas.onclick = async function () { mas.disabled = true; try { await cargarLista(true); repLista(main); } catch (x) { toast2(x.message, true); } };
    var body = main.querySelector("#mcgc-body"); if (body) body.onclick = function (ev) { var tr = ev.target.closest("[data-gc]"); if (tr) location.hash = "#/m/gift/cards/" + encodeURIComponent(tr.getAttribute("data-gc")); };
  }
  function repLista(main) { var root = main.querySelector("#mcgc-root"); if (!root) return; var foco = document.activeElement && document.activeElement.id === "mcgc-q"; root.outerHTML = listaHtml(); wireLista(main); if (foco) { var q = main.querySelector("#mcgc-q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }

  // ---------- vender ----------
  function sumar6(ymd) { var d = new Date(ymd + "T12:00:00"); d.setMonth(d.getMonth() + 6); return d.toISOString().slice(0, 10); }
  async function nuevaHtml() {
    var r = await api("gcb_siguiente", {});
    if (!r || r.error) throw new Error((r && r.error) || "No se pudo leer el siguiente código");
    K.siguiente = r.codigo;
    var hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
    var inp = function (k, lbl, extra, cls) { return '<div class="' + (cls || "") + '"><label>' + lbl + '</label><input data-v="' + k + '" ' + (extra || "") + "></div>"; };
    return '<div id="mcgc-root"><div class="mcgc-acts" style="justify-content:space-between;margin:0 0 8px"><button class="btn ghost small" type="button" data-go="#/m/gift/cards">← Gift cards</button></div>' +
      '<div class="mccf-card"><div class="mcgc-top"><div><div class="mcgc-sub">Nueva gift card · código</div><div class="mcgc-big" id="mcgc-sig">' + e(r.codigo) + '</div><div class="mcgc-sub">' + (r.id ? "Código libre de la serie (pre-cargado en la hoja)." : "Código nuevo: siguiente número de la serie.") + " Los códigos nuevos nunca se repiten.</div></div></div>" +
      '<div class="mcgc-form" style="margin-top:12px">' +
      inp("nombre", "Nombre de quien compra *", 'autocomplete="off"') + inp("apellido", "Apellido") + inp("cedula", "Cédula", 'inputmode="numeric"') +
      inp("para", "Para (quien recibe)") + inp("de", "De (quien regala)", 'placeholder="Si se deja vacío: quien compra"') +
      '<div><label>Facial / servicio *</label><input data-v="servicio" list="mcgc-serv" value="Facial Premium"><datalist id="mcgc-serv">' + SERVICIOS.map(function (s) { return "<option>" + e(s) + "</option>"; }).join("") + "</datalist></div>" +
      inp("valor", "Valor (si es en dólares)", 'placeholder="Gift Card"') + inp("factura", "Factura") + inp("ticket", "Ticket de venta", 'placeholder="TK-SO-…"') +
      inp("validoHasta", "Válido hasta", 'type="date" value="' + e(sumar6(hoy)) + '"') +
      '<div class="full"><label>Mensaje (para la tarjeta)</label><input data-v="mensaje" placeholder="Ej. ¡Feliz cumpleaños!"></div>' +
      '<div class="full"><label>Notas</label><input data-v="notas"></div></div>' +
      '<p class="err" id="mcgc-err"></p><div class="mcgc-acts"><button class="btn" type="button" id="mcgc-vender">🎁 Vender ' + e(r.codigo) + "</button></div></div></div>";
  }
  function wireNueva(main) {
    var b = main.querySelector("#mcgc-vender"); if (!b) return;
    b.onclick = async function () {
      var p = { codigo: K.siguiente }; main.querySelectorAll("[data-v]").forEach(function (i) { p[i.getAttribute("data-v")] = i.value.trim(); });
      var err = main.querySelector("#mcgc-err"); err.textContent = ""; b.disabled = true;
      try {
        var r = await api("gcb_vender", p);
        if (r && r.siguiente) { K.siguiente = r.siguiente; main.querySelector("#mcgc-sig").textContent = r.siguiente; b.textContent = "🎁 Vender " + r.siguiente; }
        if (!r || r.error) throw new Error((r && r.error) || "No se pudo vender");
        toast2("Gift card " + r.codigo + " vendida"); K.recienVendida = String(r.id);
        location.hash = "#/m/gift/cards/" + encodeURIComponent(r.id);
      } catch (x) { err.textContent = x.message; b.disabled = false; }
    };
  }

  // ---------- detalle ----------
  async function cargarDet(id) { var r = await api("gcb_get", { id: id }); if (!r || r.error) throw new Error((r && r.error) || "Gift card no encontrada"); K.d = r; return r; }
  function detHtml() {
    var d = K.d, v = d.item, adm = d.puedeEditar, ed = K.edit && adm;
    var inp = function (k, val, type) { return '<input data-f="' + k + '" type="' + (type || "text") + '" value="' + e(val || "") + '">'; };
    var dl = function (t, ro, rw) { return "<div><dt>" + t + "</dt><dd>" + (ed && rw ? rw : ro) + "</dd></div>"; };
    var tk = function (c) { return c ? '<a href="#/m/tickets/t/' + encodeURIComponent(c) + '" class="mcgc-cod">' + e(c) + "</a>" : '<span class="mccf-sub">—</span>'; };
    var cli = v.cedula ? '<a href="#/m/clientes/c/' + encodeURIComponent("c:" + v.cedula) + '">' + e(v.comprador || v.cedula) + "</a>" : e(v.comprador || "—");
    var acc = "";
    if (d.puedeUsar) acc += '<button class="btn small" type="button" id="mcgc-usar">✓ Marcar usada</button> ';
    if (v.usado && adm) acc += '<button class="btn ghost small" type="button" id="mcgc-desusar">Desmarcar uso</button> ';
    if (v.estado !== "disponible") acc += '<button class="btn ghost small" type="button" id="mcgc-pdf">📄 Generar PDF → Documentos</button> ';
    var docs = (d.documentos || []).length ? '<ul class="mcgc-docs">' + d.documentos.map(function (x) { return '<li><span>📄 ' + e(x.nombre) + '<div class="mcgc-sub">' + e(String(x.fecha || "").slice(0, 16).replace("T", " ")) + " · " + e(x.por) + (x.bytes ? " · " + Math.round(x.bytes / 1024) + " KB" : "") + '</div></span><span><button class="btn ghost small" type="button" data-doc="' + e(x.id) + '">Abrir</button> <button class="btn ghost small" type="button" data-doc="' + e(x.id) + '" data-dl="1">⬇️</button></span></li>'; }).join("") + "</ul>" : '<p class="mccf-sub">Todavía no hay PDF guardado. «Generar PDF» lo crea y lo guarda aquí y en Documentos de la clienta.</p>';
    return '<div id="mcgc-root">' +
      '<div class="mcgc-acts" style="justify-content:space-between;margin:0 0 8px"><button class="btn ghost small" type="button" data-go="#/m/gift/cards">← Gift cards</button><span>' +
      (adm && v.estado !== "eliminada" ? (ed ? '<button class="btn ghost small" type="button" id="mcgc-cancel">Cancelar</button> <button class="btn small" type="button" id="mcgc-save">💾 Guardar</button>' : '<button class="btn ghost small" type="button" id="mcgc-edit">✏️ Editar</button> <button class="btn ghost small mcgc-del" type="button" id="mcgc-del">🗑️ Eliminar</button>') : "") + "</span></div>" +
      '<div class="mccf-card"><div class="mcgc-top"><div><h1>' + e(v.codigo) + (v.repetido ? '<span class="mcgc-rep">código repetido en la hoja</span>' : "") + (v.prueba ? " 🧪" : "") + '</h1><div style="margin-top:4px">' + estHtml(v) + ' <span class="mcgc-sub">' + e(v.servicio || v.valor || "") + '</span></div></div><div>' + acc + "</div></div>" +
      '<dl class="mcgc-grid">' +
      (ed ? dl("Código", "", inp("codigo", v.codigo)) : "") +
      dl("Comprador", cli, inp("nombre", v.nombre) + inp("apellido", v.apellido)) + dl("Cédula", e(v.cedula || "—"), inp("cedula", v.cedula)) +
      dl("Para", e(v.para || "—"), inp("para", v.para)) + dl("De", e(v.de || "—"), inp("de", v.de)) +
      dl("Facial / servicio", e(v.servicio || "—"), inp("servicio", v.servicio)) + dl("Valor", e(v.valor || "—"), inp("valor", v.valor)) +
      dl("Fecha de venta", e(f(v.fechaVenta) || "—"), inp("fechaVenta", v.fechaVenta, "date")) + dl("Válido hasta", e(f(v.validoHasta) || v.validoTxt || "—"), inp("validoHasta", v.validoHasta, "date")) +
      dl("Factura", e(v.factura || "—"), inp("factura", v.factura)) + dl("Ticket de venta", tk(v.ticketVenta), inp("ticketVenta", v.ticketVenta)) +
      dl("Uso", v.usado ? e(f(v.fechaUso)) + " · " + pill(v.usadoPor) : '<span class="mccf-sub">Sin usar</span>') + dl("Ticket de uso", tk(v.ticketUso), inp("ticketUso", v.ticketUso)) +
      (v.mensaje || ed ? dl("Mensaje", e(v.mensaje || "—"), inp("mensaje", v.mensaje)) : "") +
      (adm ? dl("Notas (hoja)", e(v.notas || "—"), inp("notas", v.notas)) : "") + "</dl></div>" +
      '<div class="mccf-card"><b>Documentos</b>' + docs + "</div>" +
      ((v.historial || []).length ? '<div class="mccf-card"><b>Historial</b><ul class="mc-hist">' + v.historial.slice().reverse().map(function (h) { return "<li>" + e(String(h.fecha || "").slice(0, 16).replace("T", " ")) + " · " + e(h.actor) + " · <b>" + e(h.accion) + "</b>" + (h.detalle ? " · " + e(h.detalle) : "") + "</li>"; }).join("") + "</ul></div>" : "") +
      "</div>";
  }
  function dlg(html, onOk) {
    var box = document.createElement("div"); box.className = "mcgc-dlg";
    box.innerHTML = '<div class="mcgc-box">' + html + '<p class="err" data-err></p><div class="mcgc-acts"><button class="btn ghost small" type="button" data-no>Volver</button><button class="btn small" type="button" data-ok>Confirmar</button></div></div>';
    document.body.appendChild(box);
    var cerrar = function () { box.remove(); };
    box.querySelectorAll("[data-no],.mcgc-x").forEach(function (b) { b.onclick = cerrar; });
    box.onclick = function (ev) { if (ev.target === box) cerrar(); };
    box.querySelector("[data-ok]").onclick = async function () { var b = this; b.disabled = true; try { await onOk(box); cerrar(); } catch (x) { box.querySelector("[data-err]").textContent = (x && x.message) || String(x); b.disabled = false; } };
    return box;
  }
  var MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  function mesAno(ymd) { var m = /^(\d{4})-(\d{2})/.exec(ymd || ""); return m ? MES[+m[2] - 1] + " " + m[1] : ""; }
  /** PDF de la gift card con el mismo diseño de la Gift Card Digital (portada + tarjeta + mensaje). */
  function armarPdf(v) {
    return new Promise(function (res, rej) {
      if (typeof dibujarGiftCard !== "function" || typeof _gcdPDF !== "function") return rej(new Error("El generador de gift cards no está cargado"));
      var vieja = document.getElementById("gcd-canvas"); if (vieja) return rej(new Error("Cierra la Gift Card Digital antes de generar el PDF"));
      var w = document.createElement("div"); w.style.cssText = "position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden";
      var campos = { "gcd-para": v.para || "", "gcd-de": v.de || v.comprador || "", "gcd-facial": v.servicio || v.valor || "Facial", "gcd-msg": v.mensaje || "", "gcd-cod": v.codigo, "gcd-val": mesAno(v.validoHasta) || v.validoTxt || "" };
      w.innerHTML = Object.keys(campos).map(function (k) { return '<input id="' + k + '" value="' + e(campos[k]) + '">'; }).join("") + '<canvas id="gcd-canvas"></canvas>';
      document.body.appendChild(w);
      var fin = function (err, x) { w.remove(); if (err) rej(err); else res(x); };
      dibujarGiftCard();
      var t0 = Date.now();
      (function esperar() {
        var base = window._gcdBaseImg, listo = base && (base.complete || base._fallo);
        if (!listo && Date.now() - t0 < 6000) return setTimeout(esperar, 150);
        dibujarGiftCard();
        setTimeout(function () {
          try { _gcdPDF(function (blob, nombre) { if (!blob) fin(new Error("No se pudo armar el PDF")); else fin(null, { blob: blob, nombre: nombre }); }); } catch (x) { fin(x); }
        }, 250);
      })();
    });
  }
  function aDataUrl(blob) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).replace(/^data:[^;,]*/, "data:application/pdf")); }; r.onerror = function () { rej(new Error("No se pudo leer el PDF")); }; r.readAsDataURL(blob); }); }
  function descargar(blob, nombre) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
  async function repDet(main) { var root = main.querySelector("#mcgc-root"); if (root) { root.outerHTML = detHtml(); wireDet(main); } }
  function wireDet(main) {
    var v = K.d.item, recargar = async function () { await cargarDet(String(v.id)); repDet(main); };
    var us = main.querySelector("#mcgc-usar"); if (us) us.onclick = function () {
      var hoy = K.d.hoy, yo = (window.CU && window.CU.name) || "", pers = K.d.personas || [];
      if (yo && pers.indexOf(yo) < 0) pers = [yo].concat(pers);
      dlg('<h3>✓ Marcar ' + e(v.codigo) + ' como usada<button type="button" class="mcgc-x">×</button></h3><p class="mccf-sub">' + e(v.servicio || "") + (v.para ? " · para " + e(v.para) : "") + '</p>' +
        '<label>Fecha</label><input type="date" data-fecha value="' + e(hoy) + '">' +
        '<label>Atendió</label>' + (pers.length ? "<select data-por>" + pers.map(function (p) { return "<option" + (p === yo ? " selected" : "") + ">" + e(p) + "</option>"; }).join("") + "</select>" : '<input data-por value="' + e(yo) + '">') +
        '<label>Ticket (opcional)</label><input data-tk placeholder="TK-SO-…">', async function (box) {
          var r = await api("gcb_usar", { id: v.id, fecha: box.querySelector("[data-fecha]").value, por: box.querySelector("[data-por]").value, ticket: box.querySelector("[data-tk]").value.trim() });
          if (!r || r.error) throw new Error((r && r.error) || "No se pudo marcar");
          toast2("Gift card " + v.codigo + " usada"); await recargar();
        });
    };
    var du = main.querySelector("#mcgc-desusar"); if (du) du.onclick = function () {
      dlg('<h3>Desmarcar uso de ' + e(v.codigo) + '<button type="button" class="mcgc-x">×</button></h3><p class="mccf-sub">Vuelve a quedar vigente. Queda en el historial.</p><label>Motivo</label><input data-mot>', async function (box) {
        var r = await api("gcb_usar", { id: v.id, desmarcar: true, motivo: box.querySelector("[data-mot]").value });
        if (!r || r.error) throw new Error((r && r.error) || "No se pudo desmarcar");
        toast2("Uso desmarcado"); await recargar();
      });
    };
    var pd = main.querySelector("#mcgc-pdf"); if (pd) pd.onclick = async function () {
      pd.disabled = true; var txt = pd.textContent; pd.textContent = "⏳ Generando…";
      try {
        var x = await armarPdf(v);
        descargar(x.blob, x.nombre);
        pd.textContent = "⏳ Guardando…";
        var r = await api("gcb_pdf_guardar", { id: v.id, pdf: await aDataUrl(x.blob) });
        if (!r || r.error) throw new Error("Se descargó, pero no se guardó en Documentos: " + ((r && r.error) || "error"));
        toast2("PDF guardado en Documentos"); await recargar();
      } catch (err) { toast2(err.message || String(err), true); pd.disabled = false; pd.textContent = txt; }
    };
    main.querySelectorAll("[data-doc]").forEach(function (b) {
      b.onclick = async function () {
        var r = await api("gcb_doc_url", { id: b.getAttribute("data-doc"), descargar: b.getAttribute("data-dl") === "1" });
        if (!r || r.error) { toast2((r && r.error) || "No se pudo abrir", true); return; }
        window.open(r.url, "_blank", "noopener");
      };
    });
    var ed = main.querySelector("#mcgc-edit"); if (ed) ed.onclick = function () { K.edit = true; repDet(main); };
    var ca = main.querySelector("#mcgc-cancel"); if (ca) ca.onclick = function () { K.edit = false; repDet(main); };
    var sv = main.querySelector("#mcgc-save"); if (sv) sv.onclick = async function () {
      var datos = {}; main.querySelectorAll("[data-f]").forEach(function (i) { datos[i.getAttribute("data-f")] = i.value; });
      sv.disabled = true;
      try {
        var r = await api("gcb_guardar", { id: v.id, datos: datos });
        if (!r || r.error) throw new Error((r && r.error) || "No se pudo guardar");
        toast2(r.sinCambios ? "Sin cambios" : "Gift card guardada"); K.edit = false; await recargar();
      } catch (x) { toast2(x.message, true); sv.disabled = false; }
    };
    var del = main.querySelector("#mcgc-del"); if (del) del.onclick = function () {
      dlg('<h3>🗑️ Eliminar ' + e(v.codigo) + '<button type="button" class="mcgc-x">×</button></h3><p class="mccf-sub">Sale de la lista y de la ficha de la clienta. El código no se vuelve a usar. Queda en el historial con el motivo.</p><label>Motivo</label><input data-mot placeholder="Ej. duplicada, anulada">', async function (box) {
        var r = await api("gcb_borrar", { id: v.id, motivo: box.querySelector("[data-mot]").value });
        if (!r || r.error) throw new Error((r && r.error) || "No se pudo eliminar");
        toast2("Gift card eliminada"); location.hash = "#/m/gift/cards";
      });
    };
    if (K.recienVendida === String(v.id)) { K.recienVendida = ""; var b = main.querySelector("#mcgc-pdf"); if (b) b.classList.remove("ghost"); }
  }

  async function render(route) {
    css(); K.edit = false;
    try {
      if (route.id === "nueva") return await nuevaHtml();
      if (route.id) { await cargarDet(String(route.id)); return detHtml(); }
      await cargarLista(false); return listaHtml();
    } catch (x) { return '<p class="err">' + e(x.message || x) + '</p><button class="btn ghost small" type="button" data-go="#/m/gift/cards">← Gift cards</button>'; }
  }
  function wire(main, route) { if (route.id === "nueva") wireNueva(main); else if (route.id) { if (K.d) wireDet(main); } else wireLista(main); }
  window.MCGiftCards = { render: render, wire: wire, _k: K };
})();
