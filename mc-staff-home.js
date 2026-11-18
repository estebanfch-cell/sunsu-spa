// Dashboard del personal: Hola + citas de hoy en tarjetas grandes (estilo Agenda).
// Solo lectura de staff_home. Crear ticket reutiliza el precargado de la Agenda.
(function () {
  function e(v) { return String(v ?? "").replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function hm24(iso) { var m = /T(\d{2}):(\d{2})/.exec(String(iso || "")); return m ? m[1] + ":" + m[2] : ""; }
  function hora12(hm) {
    if (window.MCAgenda && window.MCAgenda.hora12) return window.MCAgenda.hora12(hm);
    var m = /^(\d{1,2}):(\d{2})/.exec(String(hm || "").trim());
    if (!m) return String(hm || "");
    var h = +m[1], min = m[2], ap = h >= 12 ? "PM" : "AM";
    h = h % 12; if (!h) h = 12;
    return h + ":" + min + " " + ap;
  }
  function hora(iso) { return window.MCAgenda && window.MCAgenda.hora ? window.MCAgenda.hora(iso) : hora12(hm24(iso)); }
  function colorDe(nom) {
    if (window.MCColor && window.MCColor.color) { var c = window.MCColor.color(nom); if (c) return c; }
    if (typeof colorCosm === "function") return colorCosm(nom) || "#5B7FA6";
    return "#5B7FA6";
  }
  function pill(nom) {
    if (!nom) return "";
    if (window.MCColor && window.MCColor.pill) return window.MCColor.pill(nom);
    var c = colorDe(nom);
    return '<span class="mcsh-pill" style="background:' + c + ";border-color:" + c + ';color:#fff">' + e(nom) + "</span>";
  }
  function etqPill(nom) {
    if (!nom) return "";
    var col = /NO LLEGO/i.test(nom) ? "#8A90A0" : /CONFIRMADA/i.test(nom) ? "#2f7a4d" : /INGRESADO|COMPLETADO/i.test(nom) ? "#3D5A7A" : "#7A5EA6";
    return '<span class="mcsh-etq" style="color:' + col + ";border-color:" + col + '">' + e(nom) + "</span>";
  }
  function fechaLarga(ymd) {
    var d = new Date(ymd + "T12:00:00-05:00");
    if (Number.isNaN(d.getTime())) return ymd || "";
    var t = d.toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Guayaquil" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function fechaCorta(ymd) {
    var m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(ymd || "");
    var meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return Number(m[3]) + " " + meses[+m[2] - 1] + " " + m[1];
  }
  function css() {
    if (document.getElementById("mcsh-css")) return;
    var s = document.createElement("style");
    s.id = "mcsh-css";
    s.textContent = [
      "#mcsh-root{max-width:720px;margin:0 auto;padding:4px 0 28px}",
      ".mcsh-hola{font-size:1.85rem;font-weight:800;color:var(--navy-d,#3D5A7A);letter-spacing:-0.03em;line-height:1.15;margin:8px 0 4px}",
      ".mcsh-sub{color:var(--gray,#8A90A0);font-size:.92rem;font-weight:600;margin:0 0 18px;text-transform:capitalize}",
      ".mcsh-empty{background:#fff;border:1px solid var(--cream-d,#EDE6D8);border-radius:18px;padding:28px 20px;text-align:center;color:var(--gray)}",
      ".mcsh-empty b{display:block;color:var(--navy-d,#3D5A7A);font-size:1.05rem;margin-bottom:6px}",
      ".mcsh-aviso{background:var(--gold-l,#FBF3E3);border:1px solid var(--gold-m,#E8C07A);border-radius:12px;padding:10px 12px;font-size:.82rem;color:var(--navy-d);margin-bottom:14px}",
      ".mcsh-list{display:flex;flex-direction:column;gap:14px}",
      ".mcsh-c{display:grid;grid-template-columns:132px 1fr;gap:12px 16px;align-items:start;background:#fff;border:1px solid var(--cream-d,#EDE6D8);border-left:8px solid var(--navy);border-radius:18px;padding:16px 16px 14px;box-shadow:0 2px 14px rgba(91,127,166,.08)}",
      ".mcsh-c.ok{opacity:.72}",
      ".mcsh-h{font-weight:800;color:var(--navy-d,#3D5A7A);font-size:1.45rem;line-height:1.1;letter-spacing:-0.02em}",
      ".mcsh-h small{display:block;color:var(--gray);font-weight:600;font-size:.78rem;margin-top:4px;letter-spacing:0}",
      ".mcsh-n{font-weight:800;color:var(--navy-d,#3D5A7A);font-size:1.22rem;line-height:1.2}",
      ".mcsh-tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}",
      ".mcsh-tag{font-size:.68rem;font-weight:800;border-radius:8px;padding:2px 8px;background:#efe9fb;color:#5d4a9c}",
      ".mcsh-tag.ant{background:#e8f1f8;color:#2f5f86}",
      ".mcsh-etq,.mcsh-pill{display:inline-block;border:1.5px solid;border-radius:999px;padding:1px 9px;font-size:.68rem;font-weight:700;white-space:nowrap}",
      ".mcsh-tipo{color:var(--gray);font-size:.88rem;margin-top:6px;font-weight:600}",
      ".mcsh-prev{margin-top:8px;font-size:.82rem;color:var(--navy-d,#3D5A7A);background:var(--cream,#F5F0E8);border-radius:10px;padding:8px 10px}",
      ".mcsh-prev b{font-weight:800}",
      ".mcsh-acts{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}",
      "@media (max-width:860px){.mcsh-hola{font-size:1.55rem}.mcsh-c{grid-template-columns:1fr;padding:16px 14px}.mcsh-h{font-size:1.35rem}.mcsh-n{font-size:1.12rem}.mcsh-acts .btn{min-height:40px}}",
    ].join("");
    document.head.appendChild(s);
  }
  function card(c, puede) {
    var col = colorDe(c.calendario || "");
    var nom = ((c.nombre || "") + " " + (c.apellido || "")).trim() || "Sin nombre";
    var acts = [];
    if (c.ticket) acts.push('<button class="btn ghost small" type="button" data-tk="' + e(c.ticket) + '">Ver ticket</button>');
    else if (!c.atendida && puede.ticket) {
      acts.push('<button class="btn small" type="button" data-crear="' + e(c.id) + '">Crear ticket</button>');
      acts.push('<button class="btn ghost small" type="button" data-llego="' + e(c.id) + '">Llegó</button>');
    }
    acts.push('<button class="btn ghost small" type="button" data-hist="' + e(c.id) + '">Historial de la clienta</button>');
    if (puede.mover && !c.atendida) acts.push('<button class="btn ghost small" type="button" data-mover="' + e(c.id) + '">Mover</button>');
    if (!c.atendida && c.etiqueta !== "NO LLEGO") acts.push('<button class="btn ghost small" type="button" data-nolleg="' + e(c.id) + '">No llegó</button>');
    var ant = (!c.nueva && c.anterior && c.anterior.fecha)
      ? '<div class="mcsh-prev"><b>Visita anterior:</b> ' + e(fechaCorta(c.anterior.fecha)) + (c.anterior.servicio ? " · " + e(c.anterior.servicio) : "") + "</div>"
      : "";
    return '<article class="mcsh-c' + (c.atendida ? " ok" : "") + '" style="border-left-color:' + col + '" data-id="' + e(c.id) + '">' +
      '<div class="mcsh-h">' + e(hora(c.datetime)) + "<small>" + e(c.duracion ? c.duracion + " min" : "") + "</small></div>" +
      "<div><div class=\"mcsh-n\">" + e(nom) + "</div>" +
      '<div class="mcsh-tags">' +
        '<span class="mcsh-tag' + (c.nueva ? "" : " ant") + '">' + (c.nueva ? "Nueva" : "Antigua") + "</span>" +
        etqPill(c.etiqueta) + pill(c.calendario) +
      "</div>" +
      (c.tipo ? '<div class="mcsh-tipo">' + e(c.tipo) + "</div>" : "") +
      ant +
      "</div>" +
      '<div class="mcsh-acts">' + acts.join("") + "</div></article>";
  }
  function html(d) {
    var nombre = (d && d.nombre) || "";
    var citas = (d && d.citas) || [];
    var puede = (d && d.puede) || { ticket: true, noLlego: true, mover: false };
    var cuerpo = citas.length
      ? '<div class="mcsh-list">' + citas.map(function (c) { return card(c, puede); }).join("") + "</div>"
      : '<div class="mcsh-empty"><b>No tienes citas hoy</b>Cuando se agende una, aparecerá aquí en grande, con su hora y botones.</div>';
    return '<div id="mcsh-root"><div class="mcsh-hola">Hola ' + e(nombre) + " 👋</div>" +
      '<p class="mcsh-sub">' + e(fechaLarga(d && d.hoy)) + (citas.length ? " · " + citas.length + " cita" + (citas.length === 1 ? "" : "s") : "") + "</p>" +
      (d && d.aviso ? '<p class="mcsh-aviso">' + e(d.aviso) + "</p>" : "") +
      cuerpo + "</div>";
  }
  function citaDe(root, id) {
    var L = (root._citas || []);
    return L.find(function (c) { return String(c.id) === String(id); });
  }
  function crearTicket(c) {
    try { sessionStorage.setItem("ag.tk", JSON.stringify({ id: c.id, nombre: c.nombre, apellido: c.apellido, cedula: c.cedula || "" })); } catch (er) {}
    if (typeof go === "function") go("#/doc/ov");
    else location.hash = "#/doc/ov";
  }
  function historial(c) {
    var dest = c.clienteKey ? "#/m/clientes/c/" + encodeURIComponent(c.clienteKey) : "#/m/clientes";
    if (typeof go === "function") go(dest);
    else location.hash = dest;
  }
  async function render() {
    css();
    var d = await api("staff_home", {});
    if (d && d.error) return '<p class="err">' + e(d.error) + "</p>";
    var out = html(d);
    // se adjunta _citas al pintar en wire
    render._last = d;
    return out;
  }
  function wire(main) {
    var root = main.querySelector("#mcsh-root");
    if (!root) return;
    root._citas = (render._last && render._last.citas) || [];
    root.onclick = async function (ev) {
      var t = ev.target.closest("[data-crear],[data-llego],[data-hist],[data-mover],[data-nolleg],[data-tk]");
      if (!t) return;
      var id = t.getAttribute("data-crear") || t.getAttribute("data-llego") || t.getAttribute("data-hist") || t.getAttribute("data-mover") || t.getAttribute("data-nolleg") || "";
      var c = id ? citaDe(root, id) : null;
      if (t.hasAttribute("data-tk")) {
        var tk = t.getAttribute("data-tk");
        if (typeof go === "function") go("#/m/tickets/t/" + encodeURIComponent(tk));
        else location.hash = "#/m/tickets/t/" + encodeURIComponent(tk);
        return;
      }
      if (!c) return;
      if (t.hasAttribute("data-crear") || t.hasAttribute("data-llego")) { crearTicket(c); return; }
      if (t.hasAttribute("data-hist")) { historial(c); return; }
      if (t.hasAttribute("data-mover")) {
        if (typeof go === "function") go("#/m/agenda");
        else location.hash = "#/m/agenda";
        return;
      }
      if (t.hasAttribute("data-nolleg")) {
        if (!confirm("¿Marcar que " + (c.nombre || "la clienta") + " no llegó? Se libera el horario en Acuity.")) return;
        var r = await api("ag_etiqueta", { id: c.id, etiqueta: "NO LLEGO" });
        if (r && r.error) { if (typeof toast === "function") toast(r.error); else alert(r.error); return; }
        if (typeof toast === "function") toast("Marcada como No llegó");
        if (typeof draw === "function") draw();
      }
    };
  }
  window.MCStaffHome = { render: render, wire: wire, hora: hora, hora12: hora12 };
})();
