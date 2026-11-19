// ⚠️ Multas (Emilia 17/11): Personal › Multas con filtros (persona / mes / tipo), alta/edición/anulación inline,
// catálogo de tipos con monto por defecto, y «⚠️ Aplicar multa» desde un ticket. Se descuentan solas en el rol.
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $m(v) { return "$" + (Math.round((Number(v) || 0) * 100) / 100).toFixed(2); }
  function f(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : (ymd || ""); }
  function pill(n) { return n ? (window.MCColor ? window.MCColor.pill(n) : e(n)) : ""; }
  function toast2(msg, bad) { if (typeof toast === "function") toast(msg, bad ? "var(--red, #c0392b)" : "var(--green)"); }
  var K = { F: { persona: "", mes: "", tipo: "", anuladas: false }, d: null, personas: null, tab: "multas", edit: "", nueva: false };
  function css() {
    if (window.MCConteo && window.MCConteo._css) window.MCConteo._css();
    if (document.getElementById("mcmu-css")) return;
    var s = document.createElement("style"); s.id = "mcmu-css";
    s.textContent = [
      ".mcmu-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}.mcmu-h h2{margin:0;flex:1;font-size:1.2rem}",
      ".mcmu-f{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.mcmu-f select,.mcmu-f input,.mcmu-t input,.mcmu-t select,.mcmu-dlg input,.mcmu-dlg select,.mcmu-dlg textarea{padding:7px 9px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:8px;font:inherit;font-size:.82rem;box-sizing:border-box}",
      ".mcmu-toca{cursor:pointer}.mcmu-toca:hover{background:rgba(61,90,122,.06)}.mcmu-t td{vertical-align:middle}.mcmu-t .an td{opacity:.5;text-decoration:line-through}.mcmu-t .an td:last-child{text-decoration:none;opacity:1}.mcmu-src{font-size:.62rem;border-radius:6px;padding:1px 6px;background:#eef2f8;color:#3e5f8a;font-weight:700}",
      ".mcmu-tabs{display:flex;gap:6px;margin-bottom:10px}.mcmu-tabs button{border:1.5px solid var(--cream-d,#e6dccb);background:var(--white,#fff);border-radius:999px;padding:5px 12px;font:inherit;font-size:.8rem;font-weight:700;cursor:pointer}.mcmu-tabs button.on{background:var(--navy-d,#2b3f5c);color:#fff}",
      ".mcmu-sum{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px}.mcmu-sum span{background:#fdecea;color:#922b21;border-radius:999px;padding:3px 10px;font-size:.75rem;font-weight:800}",
      ".mcmu-dlg{position:fixed;inset:0;background:rgba(20,30,50,.35);display:flex;align-items:center;justify-content:center;z-index:9999}.mcmu-box{background:var(--white,#fff);border-radius:14px;padding:16px 18px;width:min(480px,94vw);box-shadow:0 12px 40px rgba(0,0,0,.2)}",
      ".mcmu-box h3{margin:0 0 6px;display:flex;justify-content:space-between;align-items:center;font-size:1.05rem}.mcmu-box label{display:block;font-size:.74rem;color:var(--gray,#8a93a6);margin:8px 0 3px}.mcmu-box input,.mcmu-box select,.mcmu-box textarea{width:100%}",
      ".mcmu-x{border:none;background:none;font-size:1.3rem;cursor:pointer}.mcmu-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}.mcmu-red{color:#c0392b!important;border-color:#e6b0aa!important}",
    ].join("\n");
    document.head.appendChild(s);
  }
  async function personas() {
    if (K.personas) return K.personas;
    try { var r = await api("personal_personas", {}); K.personas = ((r && r.personas) || []).map(function (p) { return p.nombre; }).filter(Boolean); } catch (x) { K.personas = []; }
    return K.personas;
  }
  async function cargar() {
    var r = await api("mt_lista", { persona: K.F.persona, mes: K.F.mes, tipo: K.F.tipo, anuladas: K.F.anuladas });
    if (!r || r.error) throw new Error((r && r.error) || "No se pudieron leer las multas");
    K.d = r; await personas();
  }
  function opt(v, t, sel) { return '<option value="' + e(v) + '"' + (v === sel ? " selected" : "") + ">" + e(t) + "</option>"; }
  function listaPersonas() {
    var L = (K.personas || []).slice();
    ((K.d && K.d.items) || []).forEach(function (m) { if (m.persona && L.indexOf(m.persona) < 0) L.push(m.persona); });
    return L;
  }
  function selPersona(cur, attr) { var L = listaPersonas(); if (cur && L.indexOf(cur) < 0) L.unshift(cur); return "<select " + attr + ">" + opt("", "Persona…", cur) + L.map(function (p) { return opt(p, p, cur); }).join("") + "</select>"; }
  function selTipo(cur, attr, conVacio) { return "<select " + attr + ">" + (conVacio ? opt("", conVacio, cur) : "") + (K.d.tipos || []).filter(function (t) { return t.activo || t.nombre === cur; }).map(function (t) { return '<option value="' + e(t.nombre) + '" data-monto="' + e(t.monto) + '"' + (t.nombre === cur ? " selected" : "") + ">" + e(t.nombre) + " (" + $m(t.monto) + ")</option>"; }).join("") + "</select>"; }
  function filaEdit(m) {
    return '<tr data-row="' + e(m ? m.id : "nueva") + '"><td><input type="date" data-k="fecha" value="' + e(m ? m.fecha : K.d.hoy) + '"></td><td>' + selPersona(m ? m.persona : K.F.persona, 'data-k="persona"') + "</td><td>" + selTipo(m ? m.tipo : "", 'data-k="tipo"') +
      '</td><td><input type="text" inputmode="decimal" data-k="monto" style="width:80px;text-align:right" value="' + e(m ? m.monto : (K.d.tipos[0] ? K.d.tipos[0].monto : "")) + '"></td><td><input type="text" data-k="motivo" style="width:100%" value="' + e(m ? m.motivo : "") + '" placeholder="Motivo"></td><td>' + e(m && m.ticket || "") + '</td><td style="white-space:nowrap">' + (m ? '<span data-solo-cambio hidden><button class="btn small" type="button" data-save>💾 Guardar</button> <button class="btn ghost small" type="button" data-cancel>Descartar</button></span><button class="btn ghost small" type="button" data-cancel data-sin-cambio title="Cerrar">✕</button>' : '<button class="btn small" type="button" data-save>💾</button> <button class="btn ghost small" type="button" data-cancel>✕</button>') + "</td></tr>";
  }
  function filaVer(m) {
    var acts = K.d.admin && m.editable ? (m.estado === "anulada" ? '<button class="btn ghost small" type="button" data-react="' + e(m.id) + '">Reactivar</button>' : '<button class="btn ghost small mcmu-red" type="button" data-anular="' + e(m.id) + '">Anular</button>') : (m.editable ? "" : '<span class="mcmu-src" title="Registrada en el sistema anterior (hoja)">sistema</span>');
    var toca = K.d.admin && m.editable && m.estado !== "anulada";
    return '<tr class="' + (m.estado === "anulada" ? "an" : "") + (toca ? " mcmu-toca" : "") + '"' + (toca ? ' data-edit="' + e(m.id) + '"' : "") + ' title="' + e(toca ? "Toca para cambiar · " : "") + e(m.estado === "anulada" ? "Anulada" + (m.anuladaPor ? " por " + m.anuladaPor : "") + (m.anuladaMotivo ? ": " + m.anuladaMotivo : "") : (m.creadoPor ? "Aplicada por " + m.creadoPor : "")) + '"><td>' + e(f(m.fecha)) + "</td><td>" + pill(m.persona) + "</td><td>" + e(m.tipo) + '</td><td class="num"><b>' + $m(m.monto) + "</b></td><td>" + e(m.motivo) + "</td><td>" + (m.ticket ? '<a href="#/m/tickets/t/' + encodeURIComponent(m.ticket) + '">' + e(m.ticket) + "</a>" : "") + '</td><td style="white-space:nowrap">' + acts + "</td></tr>";
  }
  function html() {
    var d = K.d, F = K.F;
    var tabs = d.admin ? '<div class="mcmu-tabs"><button type="button" data-tab="multas" class="' + (K.tab === "multas" ? "on" : "") + '">⚠️ Multas</button><button type="button" data-tab="tipos" class="' + (K.tab === "tipos" ? "on" : "") + '">🗂️ Tipos de multa</button></div>' : "";
    if (K.tab === "tipos" && d.admin) {
      return '<div id="mcmu-root"><div class="mcmu-h"><h2>⚠️ Multas</h2></div>' + tabs + '<div class="mccf-card"><p class="mccf-sub">El monto es el sugerido al aplicar; se puede cambiar en cada multa.</p><table class="mccf-t mcmu-t"><thead><tr><th>Tipo</th><th class="num">Monto</th><th>Activo</th><th></th></tr></thead><tbody>' +
        (d.tipos || []).map(function (t) { return '<tr data-tipo="' + e(t.id) + '"><td><input type="text" data-tk="nombre" value="' + e(t.nombre) + '" style="width:100%"></td><td><input type="text" inputmode="decimal" data-tk="monto" value="' + e(t.monto) + '" style="width:80px;text-align:right"></td><td><input type="checkbox" data-tk="activo"' + (t.activo ? " checked" : "") + '></td><td><button class="btn small" type="button" data-tsave>💾</button></td></tr>'; }).join("") +
        '<tr data-tipo=""><td><input type="text" data-tk="nombre" placeholder="+ Nuevo tipo" style="width:100%"></td><td><input type="text" inputmode="decimal" data-tk="monto" placeholder="5" style="width:80px;text-align:right"></td><td><input type="checkbox" data-tk="activo" checked></td><td><button class="btn small" type="button" data-tsave>➕</button></td></tr></tbody></table></div></div>';
    }
    var tiposF = [];
    (d.tipos || []).forEach(function (t) { tiposF.push(t.nombre); });
    (d.items || []).forEach(function (m) { if (tiposF.indexOf(m.tipo) < 0) tiposF.push(m.tipo); });
    var resumen = Object.keys(d.porPersona || {}).map(function (p) { return "<span>" + e(p) + " · " + $m(d.porPersona[p]) + "</span>"; }).join("");
    return '<div id="mcmu-root"><div class="mcmu-h"><h2>⚠️ Multas</h2>' + (d.admin ? '<button class="btn small" type="button" id="mcmu-nueva">+ Nueva multa</button>' : "") + "</div>" + tabs +
      '<div class="mcmu-f">' + selPersona(F.persona, 'id="mcmu-fp"').replace("Persona…", "Todas las personas") + '<input type="month" id="mcmu-fm" value="' + e(F.mes) + '" title="Mes">' +
      '<select id="mcmu-ft">' + opt("", "Todos los tipos", F.tipo) + tiposF.map(function (t) { return opt(t, t, F.tipo); }).join("") + "</select>" +
      '<label class="mccf-sub"><input type="checkbox" id="mcmu-fa"' + (F.anuladas ? " checked" : "") + "> Ver anuladas</label></div>" +
      '<div class="mcmu-sum"><span>Total ' + $m(d.total) + "</span>" + resumen + "</div>" +
      '<div class="mccf-card"><div class="sheet-scroll"><table class="mccf-t mcmu-t"><thead><tr><th>Fecha</th><th>Persona</th><th>Tipo</th><th class="num">Monto</th><th>Motivo</th><th>Ticket</th><th></th></tr></thead><tbody>' +
      (K.nueva ? filaEdit(null) : "") + ((d.items || []).length ? d.items.map(function (m) { return K.edit === m.id ? filaEdit(m) : filaVer(m); }).join("") : '<tr><td colspan="7" class="mccf-sub">Sin multas con estos filtros.</td></tr>') +
      '</tbody></table></div><p class="mccf-sub" style="margin-top:6px">Se descuentan en el rol de pago del corte 26→25 en que caen. Las marcadas «sistema» vienen de la hoja anterior.</p></div></div>';
  }
  function rep(main) { var r = main.querySelector("#mcmu-root"); if (r) { r.outerHTML = html(); wire(main); } }
  async function recargar(main) { try { await cargar(); rep(main); } catch (x) { toast2(x.message, true); } }
  function leerFila(tr) { var o = {}; tr.querySelectorAll("[data-k]").forEach(function (i) { o[i.getAttribute("data-k")] = i.value; }); return o; }
  function wire(main) {
    var root = main.querySelector("#mcmu-root"); if (!root) return;
    root.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { K.tab = b.getAttribute("data-tab"); rep(main); }; });
    var fp = root.querySelector("#mcmu-fp"); if (fp) fp.onchange = function () { K.F.persona = fp.value; recargar(main); };
    var fm = root.querySelector("#mcmu-fm"); if (fm) fm.onchange = function () { K.F.mes = fm.value; recargar(main); };
    var ft = root.querySelector("#mcmu-ft"); if (ft) ft.onchange = function () { K.F.tipo = ft.value; recargar(main); };
    var fa = root.querySelector("#mcmu-fa"); if (fa) fa.onchange = function () { K.F.anuladas = fa.checked; recargar(main); };
    var nv = root.querySelector("#mcmu-nueva"); if (nv) nv.onclick = function () { K.nueva = true; K.edit = ""; rep(main); };
    root.querySelectorAll("select[data-k='tipo']").forEach(function (sel) { sel.onchange = function () { var o = sel.selectedOptions[0], tr = sel.closest("tr"), mi = tr && tr.querySelector("[data-k='monto']"); if (o && mi) mi.value = o.getAttribute("data-monto") || mi.value; }; });
    root.querySelectorAll("tr[data-row]").forEach(function (tr) {
      if (tr.getAttribute("data-row") === "nueva") return;
      var ini = JSON.stringify(leerFila(tr));
      var mirar = function () { var cambio = JSON.stringify(leerFila(tr)) !== ini; var a = tr.querySelector("[data-solo-cambio]"), z = tr.querySelector("[data-sin-cambio]"); if (a) a.hidden = !cambio; if (z) z.hidden = cambio; };
      tr.addEventListener("input", mirar); tr.addEventListener("change", function () { setTimeout(mirar, 0); });
    });
    root.onclick = async function (ev) {
      var b;
      if ((b = ev.target.closest("[data-cancel]"))) { K.edit = ""; K.nueva = false; rep(main); return; }
      if ((b = ev.target.closest("[data-save]"))) {
        var tr = b.closest("tr"), id = tr.getAttribute("data-row"), o = leerFila(tr); b.disabled = true;
        var r = id === "nueva" ? await api("mt_crear", o) : await api("mt_editar", Object.assign({ id: id }, o));
        if (!r || r.error) { toast2((r && r.error) || "No se pudo guardar", true); b.disabled = false; return; }
        toast2(id === "nueva" ? "Multa aplicada" : (r.sinCambios ? "Sin cambios" : "Multa actualizada")); K.edit = ""; K.nueva = false; recargar(main); return;
      }
      if ((b = ev.target.closest("[data-anular]")) || (b = ev.target.closest("[data-react]"))) {
        var react = b.hasAttribute("data-react"), mid = b.getAttribute(react ? "data-react" : "data-anular");
        dialogo('<h3>' + (react ? "Reactivar multa" : "Anular multa") + '<button type="button" class="mcmu-x">×</button></h3><p class="mccf-sub">' + (react ? "Vuelve a descontarse en el rol." : "Deja de descontarse en el rol. Queda en el historial.") + '</p><label>Motivo</label><input type="text" data-mot>', async function (box) {
          var r = await api("mt_anular", { id: mid, motivo: box.querySelector("[data-mot]").value, reactivar: react });
          if (!r || r.error) throw new Error((r && r.error) || "No se pudo");
          toast2(react ? "Multa reactivada" : "Multa anulada"); recargar(main);
        });
        return;
      }
      // Sin botón «Editar» (TK55): se toca la fila y se edita ahí; Guardar aparece solo si algo cambió.
      if ((b = ev.target.closest("[data-edit]")) && !ev.target.closest("button,a,input,select")) { K.edit = b.getAttribute("data-edit"); K.nueva = false; rep(main); return; }
      if ((b = ev.target.closest("[data-tsave]"))) {
        var tt = b.closest("tr"), q = function (k) { return tt.querySelector("[data-tk='" + k + "']"); };
        var r2 = await api("mt_tipo_guardar", { id: tt.getAttribute("data-tipo"), nombre: q("nombre").value, monto: q("monto").value, activo: q("activo").checked });
        if (!r2 || r2.error) { toast2((r2 && r2.error) || "No se pudo guardar", true); return; }
        toast2("Tipo guardado"); K.d.tipos = r2.tipos; rep(main);
      }
    };
  }
  function dialogo(inner, onOk) {
    css();
    var box = document.createElement("div"); box.className = "mcmu-dlg";
    box.innerHTML = '<div class="mcmu-box">' + inner + '<p class="err" data-err></p><div class="mcmu-acts"><button class="btn ghost small" type="button" data-no>Volver</button><button class="btn small" type="button" data-ok>Confirmar</button></div></div>';
    document.body.appendChild(box);
    var cerrar = function () { box.remove(); };
    box.querySelectorAll("[data-no],.mcmu-x").forEach(function (x) { x.onclick = cerrar; });
    box.onclick = function (ev) { if (ev.target === box) cerrar(); };
    var _el = box.querySelector("[data-ok]"); if (_el) _el.onclick = async function () { var b = this; b.disabled = true; try { await onOk(box); cerrar(); } catch (x) { box.querySelector("[data-err]").textContent = x.message || String(x); b.disabled = false; } };
    return box;
  }
  /** «⚠️ Aplicar multa» desde un ticket: persona (la del ticket), tipo, monto editable y motivo. */
  async function aplicarDesdeTicket(tk) {
    css();
    var r0 = await Promise.all([api("mt_tipos", {}), personas()]);
    var T = (r0[0] && r0[0].tipos) || [], P = K.personas.slice();
    if (tk.cosmetologa && P.indexOf(tk.cosmetologa) < 0) P.unshift(tk.cosmetologa);
    var box = dialogo('<h3>⚠️ Aplicar multa<button type="button" class="mcmu-x">×</button></h3><p class="mccf-sub">Ticket ' + e(tk.so || "") + (tk.cliente ? " · " + e(tk.cliente) : "") + ". Se descuenta en el rol del corte en que cae la fecha del ticket.</p>" +
      '<label>Cosmetóloga</label><select data-p>' + P.map(function (p) { return '<option' + (p === tk.cosmetologa ? " selected" : "") + ">" + e(p) + "</option>"; }).join("") + "</select>" +
      '<label>Tipo</label><select data-t>' + T.map(function (t) { return '<option value="' + e(t.id) + '" data-monto="' + e(t.monto) + '">' + e(t.nombre) + " (" + $m(t.monto) + ")</option>"; }).join("") + "</select>" +
      '<label>Monto</label><input type="text" inputmode="decimal" data-m value="' + e(T[0] ? T[0].monto : "") + '">' +
      '<label>Motivo</label><textarea rows="2" data-mo placeholder="Qué pasó"></textarea>',
      async function (b) {
        var r = await api("mt_crear", { persona: b.querySelector("[data-p]").value, tipoId: b.querySelector("[data-t]").value, monto: b.querySelector("[data-m]").value, motivo: b.querySelector("[data-mo]").value, fecha: tk.fecha || "", ticketId: tk.id || "", ticketSo: tk.so || "" });
        if (!r || r.error) throw new Error((r && r.error) || "No se pudo aplicar");
        toast2("⚠️ Multa aplicada a " + b.querySelector("[data-p]").value);
      });
    var st = box.querySelector("[data-t]"); st.onchange = function () { box.querySelector("[data-m]").value = st.selectedOptions[0].getAttribute("data-monto"); };
  }
  async function render() {
    css(); K.edit = ""; K.nueva = false;
    try { await cargar(); return html(); } catch (x) { return '<p class="err">' + e(x.message || x) + "</p>"; }
  }
  window.MCMultas = { render: render, wire: wire, aplicarDesdeTicket: aplicarDesdeTicket, _k: K };
})();
