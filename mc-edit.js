// Edición en línea sin botón «Editar» (Emilia 18/11, TK55). Se toca el dato y se edita ahí mismo.
// La barra Guardar / Descartar aparece solo si algo cambió de verdad. Quien no es admin ve
// «Enviar solicitud» (con motivo) y el cambio llega a la bandeja de las admins.
// Uso: var st = MCEdit.nuevo({ admin, pedir }); MCEdit.v(st, "clave", htmlMostrado, crudo, { tipo, opciones, fmt, label });
//      MCEdit.barra(st) dentro del root; MCEdit.wire(root, st, { redibujar, guardar(pend), pedir(pend, motivo) }).
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var ACTIVO = null;
  function css() {
    if (document.getElementById("mce-css")) return;
    var s = document.createElement("style"); s.id = "mce-css";
    s.textContent = [
      ".mce-v{cursor:text;border-radius:5px;padding:1px 4px;margin:-1px -4px;border-bottom:1.5px dashed rgba(61,90,122,.28);display:inline-block;min-width:24px;min-height:1.1em}",
      ".mce-v:hover,.mce-v:focus{background:rgba(61,90,122,.08);outline:none;border-bottom-color:var(--navy-d,#2b3f5c)}",
      ".mce-v.mod{background:#fff3d6;border-bottom-color:#c99a2e}",
      ".mce-in{width:100%;box-sizing:border-box;padding:5px 7px;border:1.5px solid var(--navy-d,#2b3f5c);border-radius:8px;font:inherit;font-size:.84rem;background:#fff}",
      ".mce-bar{position:sticky;bottom:8px;z-index:30;margin:10px 0;background:var(--white,#fff);border:1.5px solid #c99a2e;border-radius:12px;padding:10px 12px;box-shadow:0 8px 24px rgba(20,30,50,.14)}",
      ".mce-bar .mce-l{font-size:.78rem;margin:0 0 6px;color:var(--navy-d,#2b3f5c)}.mce-bar .mce-l b{font-weight:800}.mce-bar ul{margin:0 0 8px;padding-left:18px;font-size:.78rem}",
      ".mce-bar .mce-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.mce-bar input.mce-mot{flex:1;min-width:200px;padding:8px 10px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:9px;font:inherit;font-size:.84rem}",
      ".mce-bar .err{margin:6px 0 0;font-size:.78rem}",
      ".mce-hint{font-size:.72rem;color:var(--gray,#8a93a6);margin:6px 0 0}",
    ].join("\n");
    document.head.appendChild(s);
  }
  function nuevo(o) { css(); o = o || {}; return { admin: !!o.admin, pedir: !!o.pedir, pend: {}, raw: {}, meta: {}, motivo: "", err: "" }; }
  function puede(st) { return st && (st.admin || st.pedir); }
  function hay(st) { return !!(st && Object.keys(st.pend).length); }
  /** Campo editable: muestra `shown` (HTML) y, al tocarlo, un input con el valor crudo. */
  function v(st, k, shown, raw, o) {
    o = o || {};
    raw = raw == null ? "" : String(raw);
    st.raw[k] = raw; st.meta[k] = o;
    if (!puede(st) || o.ro) return shown;
    var mod = Object.prototype.hasOwnProperty.call(st.pend, k);
    var vis = mod ? (o.fmt ? o.fmt(st.pend[k]) : e(st.pend[k] || "—")) : (shown === "" || shown == null ? '<span class="mccf-sub">—</span>' : shown);
    return '<span class="mce-v' + (mod ? " mod" : "") + '" data-mce="' + e(k) + '" tabindex="0" title="Toca para cambiar">' + vis + "</span>";
  }
  function label(st, k) { return (st.meta[k] && st.meta[k].label) || k; }
  function barra(st) {
    if (!hay(st)) return "";
    var ks = Object.keys(st.pend);
    var lista = "<ul>" + ks.map(function (k) { var m = st.meta[k] || {}, f = m.fmt || function (x) { return e(x || "—"); }; return "<li><b>" + e(label(st, k)) + ":</b> " + f(st.raw[k]) + " → " + f(st.pend[k]) + "</li>"; }).join("") + "</ul>";
    var acts = st.admin
      ? '<button class="btn small" type="button" data-mce-ok>💾 Guardar (' + ks.length + ')</button><button class="btn ghost small" type="button" data-mce-no>Descartar</button>'
      : '<input class="mce-mot" type="text" data-mce-mot placeholder="Motivo del cambio (obligatorio)" value="' + e(st.motivo) + '"><button class="btn small" type="button" data-mce-ok>📨 Enviar solicitud (' + ks.length + ')</button><button class="btn ghost small" type="button" data-mce-no>Descartar</button>';
    return '<div class="mce-bar" data-mce-bar><p class="mce-l"><b>' + (st.admin ? "Cambios sin guardar" : "Cambios para pedir a la admin") + "</b></p>" + lista + '<div class="mce-acts">' + acts + "</div>" + (st.err ? '<p class="err">' + e(st.err) + "</p>" : "") + (st.admin ? "" : '<p class="mce-hint">No se guarda directo: Emilia o Emi lo aprueban desde Solicitudes.</p>') + "</div>";
  }
  function hint(st) { return puede(st) ? '<p class="mce-hint">✎ Toca cualquier dato para cambiarlo.' + (st.admin ? "" : " Se envía como solicitud.") + "</p>" : ""; }
  function editor(st, k) {
    var m = st.meta[k] || {}, cur = Object.prototype.hasOwnProperty.call(st.pend, k) ? st.pend[k] : st.raw[k];
    if (m.opciones) {
      var ops = m.opciones.map(function (x) { var val = Array.isArray(x) ? x[0] : x, t = Array.isArray(x) ? x[1] : x; return '<option value="' + e(val) + '"' + (String(val) === String(cur) ? " selected" : "") + ">" + e(t) + "</option>"; });
      if (m.opciones.map(function (x) { return String(Array.isArray(x) ? x[0] : x); }).indexOf(String(cur)) < 0) ops.unshift('<option value="' + e(cur) + '" selected>' + e(cur || "—") + "</option>");
      return '<select class="mce-in" data-mce-in="' + e(k) + '">' + ops.join("") + "</select>";
    }
    return '<input class="mce-in" data-mce-in="' + e(k) + '" type="' + (m.tipo || "text") + '" value="' + e(cur) + '"' + (m.lista ? ' list="' + e(m.lista) + '"' : "") + ">";
  }
  function wire(root, st, h) {
    if (!root || !puede(st)) return;
    h = h || {};
    var redibujar = function () { if (h.redibujar) h.redibujar(); };
    root.querySelectorAll("[data-mce]").forEach(function (sp) {
      var abrir = function (ev) {
        if (ev && ev.target && ev.target.closest && ev.target.closest("a")) return;
        if (ev) ev.preventDefault();
        var k = sp.getAttribute("data-mce");
        sp.outerHTML = editor(st, k);
        var inp = root.querySelector('[data-mce-in="' + k.replace(/"/g, '\\"') + '"]');
        if (!inp) return;
        ACTIVO = k;
        var hecho = false;
        var cerrar = function (aplicar) {
          if (hecho) return; hecho = true; ACTIVO = null;
          if (aplicar) {
            var val = String(inp.value == null ? "" : inp.value).trim();
            if (val === String(st.raw[k]).trim()) delete st.pend[k]; else st.pend[k] = val;
            st.err = "";
          }
          redibujar();
        };
        inp.focus(); if (inp.select && inp.type === "text") inp.select();
        inp.addEventListener("keydown", function (ev2) { if (ev2.key === "Enter") { ev2.preventDefault(); cerrar(true); } else if (ev2.key === "Escape") { ev2.preventDefault(); cerrar(false); } });
        inp.addEventListener("blur", function () { cerrar(true); });
        if (inp.tagName === "SELECT") inp.addEventListener("change", function () { cerrar(true); });
      };
      sp.addEventListener("click", abrir);
      sp.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") abrir(ev); });
    });
    // Si se toca otro dato mientras uno está abierto, el redibujo no se come el toque: se abre el siguiente.
    root.addEventListener("mousedown", function (ev) { var t = ev.target.closest && ev.target.closest("[data-mce]"); if (t && ACTIVO) st.sig = t.getAttribute("data-mce"); }, true);
    if (st.sig) { var sig = st.sig; st.sig = null; var sp2 = root.querySelector('[data-mce="' + sig.replace(/"/g, '\\"') + '"]'); if (sp2) setTimeout(function () { sp2.click(); }, 0); }
    var mot = root.querySelector("[data-mce-mot]");
    if (mot) mot.addEventListener("input", function () { st.motivo = mot.value; });
    var no = root.querySelector("[data-mce-no]");
    if (no) no.onclick = function () { st.pend = {}; st.motivo = ""; st.err = ""; redibujar(); };
    var ok = root.querySelector("[data-mce-ok]");
    if (ok) ok.onclick = async function () {
      if (!hay(st)) return;
      var pend = {}; Object.keys(st.pend).forEach(function (k) { pend[k] = st.pend[k]; });
      if (!st.admin && !String(st.motivo || "").trim()) { st.err = "Escribe el motivo del cambio"; redibujar(); var m2 = root.querySelector("[data-mce-mot]"); if (m2) m2.focus(); return; }
      ok.disabled = true;
      try {
        var r = st.admin ? await h.guardar(pend) : await h.pedir(pend, String(st.motivo).trim());
        if (!r || r.error) throw new Error((r && r.error) || "No se pudo");
        st.pend = {}; st.motivo = ""; st.err = "";
        if (h.listo) await h.listo(r); else redibujar();
      } catch (x) { st.err = (x && x.message) || String(x); ok.disabled = false; redibujar(); }
    };
  }
  /** Eliminar (admin) o Solicitar eliminación (personal): mismo botón, con motivo. */
  function botonBorrar(st, id, txtAdmin) {
    if (st.admin) return '<button class="btn ghost small mce-del" type="button" id="' + id + '" style="color:#c0392b;border-color:#e6b0aa">🗑️ ' + e(txtAdmin || "Eliminar") + "</button>";
    if (st.pedir) return '<button class="btn ghost small mce-del" type="button" id="' + id + '" style="color:#c0392b;border-color:#e6b0aa">🗑️ Solicitar eliminación</button>';
    return "";
  }
  window.addEventListener("beforeunload", function (ev) { if (window.MCEdit && window.MCEdit._sucio && window.MCEdit._sucio()) { ev.preventDefault(); ev.returnValue = ""; } });
  window.MCEdit = { nuevo: nuevo, v: v, barra: barra, hint: hint, wire: wire, hay: hay, puede: puede, botonBorrar: botonBorrar, _activo: function () { return ACTIVO; }, _sucio: null };
})();
