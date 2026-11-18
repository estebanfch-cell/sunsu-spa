// Dashboard del personal: Hola + citas de hoy en filas compactas (una o dos líneas).
// En escritorio, acciones sutiles a la derecha; en iPhone, menú «Acciones ▾».
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
    var s = document.getElementById("mcsh-css");
    if (!s) { s = document.createElement("style"); s.id = "mcsh-css"; document.head.appendChild(s); }
    s.textContent = [
      "#mcsh-root{max-width:920px;margin:0 auto;padding:2px 0 16px}",
      ".mcsh-hola{font-size:1.35rem;font-weight:800;color:var(--navy-d,#3D5A7A);letter-spacing:-0.02em;line-height:1.2;margin:4px 0 2px}",
      ".mcsh-sub{color:var(--gray,#8A90A0);font-size:.78rem;font-weight:600;margin:0 0 10px}",
      ".mcsh-empty{background:#fff;border:1px solid var(--cream-d,#EDE6D8);border-radius:12px;padding:16px 14px;text-align:center;color:var(--gray);font-size:.85rem}",
      ".mcsh-empty b{display:block;color:var(--navy-d,#3D5A7A);font-size:.95rem;margin-bottom:4px}",
      ".mcsh-aviso{background:var(--gold-l,#FBF3E3);border:1px solid var(--gold-m,#E8C07A);border-radius:10px;padding:7px 10px;font-size:.75rem;color:var(--navy-d);margin-bottom:10px}",
      ".mcsh-bor{background:#fff8e6;border:1.5px solid #e8cf7a;border-radius:12px;padding:10px 12px;margin:0 0 12px}",
      ".mcsh-bor b.mcsh-bt{display:block;color:var(--navy-d,#3D5A7A);font-size:.9rem;margin-bottom:6px}",
      ".mcsh-bi{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 0;border-top:1px solid #f0e6c8}",
      ".mcsh-bi:first-of-type{border-top:0}",
      ".mcsh-bi .mcsh-n{font-weight:700;color:var(--navy-d,#3D5A7A)}",
      ".mcsh-pill-pc{display:inline-block;border:1.5px solid #e8cf7a;color:#C98A00;border-radius:999px;padding:2px 10px;font-size:.7rem;font-weight:700;background:transparent}",
      ".mcsh-pill-pa{display:inline-block;border:1.5px solid #e8cf7a;color:#8A6D00;border-radius:999px;padding:2px 10px;font-size:.7rem;font-weight:700;background:transparent}",
      ".mcsh-bor .mcsh-act{margin-left:auto}",
      ".mcsh-list{display:flex;flex-direction:column;gap:6px}",
      ".mcsh-c{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--cream-d,#EDE6D8);border-left:4px solid var(--navy);border-radius:10px;padding:7px 8px 7px 10px;position:relative}",
      ".mcsh-c.ok{opacity:.68}",
      ".mcsh-main{flex:1 1 auto;min-width:0}",
      ".mcsh-l1{display:flex;align-items:baseline;flex-wrap:wrap;gap:0 .35em;min-width:0;line-height:1.25}",
      ".mcsh-h{font-weight:800;color:var(--navy-d,#3D5A7A);font-size:.92rem;white-space:nowrap}",
      ".mcsh-dot{color:var(--gray,#8A90A0);font-weight:600}",
      ".mcsh-n{font-weight:700;color:var(--navy-d,#3D5A7A);font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:22ch}",
      ".mcsh-tipo{color:var(--gray,#8A90A0);font-size:.8rem;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:22ch}",
      ".mcsh-etq{display:inline-block;border:1px solid;border-radius:999px;padding:0 6px;font-size:.62rem;font-weight:700;white-space:nowrap;line-height:1.5;vertical-align:middle}",
      ".mcsh-tag{font-size:.58rem;font-weight:800;border-radius:6px;padding:0 5px;background:#efe9fb;color:#5d4a9c;line-height:1.5}",
      ".mcsh-prev{display:block;margin-top:1px;font-size:.68rem;color:var(--gray,#8A90A0);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".mcsh-act{appearance:none;border:0;background:transparent;color:var(--navy-d,#3D5A7A);font:inherit;font-size:.68rem;font-weight:650;padding:3px 6px;border-radius:6px;cursor:pointer;white-space:nowrap;opacity:.8}",
      ".mcsh-act:hover,.mcsh-act:focus{background:var(--blue-l,#EEF3FA);opacity:1}",
      ".mcsh-act.pri{color:var(--navy);font-weight:800}",
      ".mcsh-acts-wide{display:flex;flex:0 0 auto;align-items:center;gap:1px;flex-wrap:nowrap}",
      ".mcsh-acts-narrow{display:none;flex:0 0 auto;position:relative}",
      ".mcsh-more{appearance:none;border:1px solid var(--cream-d,#EDE6D8);background:#fff;color:var(--navy-d,#3D5A7A);font:inherit;font-size:.68rem;font-weight:650;padding:3px 8px;border-radius:8px;cursor:pointer;white-space:nowrap}",
      ".mcsh-c.open .mcsh-more{border-color:var(--navy);background:var(--blue-l,#EEF3FA)}",
      ".mcsh-menu{display:none;position:absolute;right:0;top:calc(100% + 4px);z-index:8;min-width:156px;background:#fff;border:1px solid var(--cream-d,#EDE6D8);border-radius:10px;box-shadow:0 6px 18px rgba(20,30,50,.12);padding:4px;flex-direction:column}",
      ".mcsh-c.open .mcsh-menu{display:flex}",
      ".mcsh-menu .mcsh-act{display:block;width:100%;text-align:left;padding:7px 10px;opacity:1}",
      "@media (max-width:860px){.mcsh-hola{font-size:1.2rem}.mcsh-acts-wide{display:none}.mcsh-acts-narrow{display:block}.mcsh-n{max-width:16ch}.mcsh-tipo{max-width:18ch}}",
    ].join("");
  }
  function botones(c, puede, cls) {
    var acts = [], id = e(c.id);
    function b(attr, label, pri) {
      return '<button type="button" class="mcsh-act' + (pri ? " pri" : "") + '" ' + attr + '="' + id + '">' + label + "</button>";
    }
    if (c.ticket) acts.push('<button type="button" class="mcsh-act" data-tk="' + e(c.ticket) + '">Ver ticket</button>');
    else if (!c.atendida && puede.ticket) {
      acts.push(b("data-crear", "Crear ticket", 1));
      acts.push(b("data-llego", "Llegó"));
    }
    acts.push(b("data-hist", "Historial"));
    if (puede.mover && !c.atendida) acts.push(b("data-mover", "Mover"));
    if (!c.atendida && c.etiqueta !== "NO LLEGO") acts.push(b("data-nolleg", "No llegó"));
    return acts.join("");
  }
  function card(c, puede) {
    var col = colorDe(c.calendario || "");
    var nom = ((c.nombre || "") + " " + (c.apellido || "")).trim() || "Sin nombre";
    var ant = (!c.nueva && c.anterior && c.anterior.fecha)
      ? '<span class="mcsh-prev">Visita anterior: ' + e(fechaCorta(c.anterior.fecha)) + (c.anterior.servicio ? " · " + e(c.anterior.servicio) : "") + "</span>"
      : "";
    var tipo = (c.tipo || "").replace(/\s+/g, " ").trim();
    return '<article class="mcsh-c' + (c.atendida ? " ok" : "") + '" style="border-left-color:' + col + '" data-id="' + e(c.id) + '" title="' + e(hora(c.datetime) + (c.duracion ? " · " + c.duracion + " min" : "") + " · " + nom) + '">' +
      '<div class="mcsh-main"><div class="mcsh-l1">' +
        '<span class="mcsh-h">' + e(hora(c.datetime)) + "</span>" +
        '<span class="mcsh-dot">·</span><span class="mcsh-n">' + e(nom) + "</span>" +
        (tipo ? '<span class="mcsh-dot">·</span><span class="mcsh-tipo">' + e(tipo) + "</span>" : "") +
        (c.nueva ? '<span class="mcsh-tag">Nueva</span>' : "") +
        etqPill(c.etiqueta) +
      "</div>" + ant + "</div>" +
      '<div class="mcsh-acts-wide">' + botones(c, puede) + "</div>" +
      '<div class="mcsh-acts-narrow"><button type="button" class="mcsh-more" data-acts="' + e(c.id) + '" aria-haspopup="true" aria-label="Acciones por hacer">Acciones ▾</button>' +
        '<div class="mcsh-menu" role="menu">' + botones(c, puede) + "</div></div></article>";
  }
  function cardBorrador(b) {
    var nom = ((b.nombre || "") + " " + (b.apellido || "")).trim() || "Sin nombre";
    var pill = b.listo
      ? '<span class="mcsh-pill-pa">Pendiente de aprobar</span>'
      : '<span class="mcsh-pill-pc">Por completar</span>';
    var fac = e(b.factura || "");
    return '<div class="mcsh-bi">' +
      '<span class="mcsh-n">' + e(nom) + "</span>" +
      (b.fecha ? '<span class="mcsh-dot">·</span><span>' + e(fechaCorta(b.fecha)) + "</span>" : "") +
      (fac ? '<span class="mcsh-dot">·</span><span>Fac. ' + fac + "</span>" : "") +
      pill +
      '<button type="button" class="mcsh-act pri" data-borrador="' + fac + '">Completar</button>' +
      "</div>";
  }
  function html(d) {
    var nombre = (d && d.nombre) || "";
    var citas = (d && d.citas) || [];
    var puede = (d && d.puede) || { ticket: true, noLlego: true, mover: false };
    var bor = (d && d.borradores) || [];
    var nPc = bor.filter(function (b) { return !b.listo; }).length;
    var cuerpo = citas.length
      ? '<div class="mcsh-list">' + citas.map(function (c) { return card(c, puede); }).join("") + "</div>"
      : '<div class="mcsh-empty"><b>No tienes citas hoy</b>Cuando se agende una, aparecerá aquí.</div>';
    var caja = bor.length
      ? '<div class="mcsh-bor"><b class="mcsh-bt">' + (nPc ? ("Tienes " + nPc + " ticket" + (nPc === 1 ? "" : "s") + " por completar") : "Tickets pendientes de aprobar") + "</b>" +
        bor.map(cardBorrador).join("") + "</div>"
      : "";
    return '<div id="mcsh-root"><div class="mcsh-hola">Hola ' + e(nombre) + " 👋</div>" +
      '<p class="mcsh-sub">' + e(fechaLarga(d && d.hoy)) + (citas.length ? " · " + citas.length + " cita" + (citas.length === 1 ? "" : "s") : "") + "</p>" +
      (d && d.aviso ? '<p class="mcsh-aviso">' + e(d.aviso) + "</p>" : "") +
      caja + cuerpo + "</div>";
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
  function cerrarMenus(root) {
    (root || document).querySelectorAll(".mcsh-c.open").forEach(function (x) { x.classList.remove("open"); });
  }
  async function render() {
    css();
    var d = await api("staff_home", {});
    if (d && d.error) return '<p class="err">' + e(d.error) + "</p>";
    render._last = d;
    return html(d);
  }
  function wire(main) {
    var root = main.querySelector("#mcsh-root");
    if (!root) return;
    root._citas = (render._last && render._last.citas) || [];
    root.onclick = async function (ev) {
      var more = ev.target.closest("[data-acts]");
      if (more && root.contains(more)) {
        ev.preventDefault();
        ev.stopPropagation();
        var cardEl = more.closest(".mcsh-c");
        var open = cardEl && cardEl.classList.contains("open");
        cerrarMenus(root);
        if (cardEl && !open) cardEl.classList.add("open");
        return;
      }
      var borBtn = ev.target.closest("[data-borrador]");
      if (borBtn && root.contains(borBtn)) {
        ev.preventDefault();
        var fac = borBtn.getAttribute("data-borrador");
        cerrarMenus(root);
        if (fac && typeof _migoAbrirEnTicket === "function") _migoAbrirEnTicket(fac);
        else if (fac && typeof go === "function") go("#/doc/ov?fac=" + encodeURIComponent(fac));
        return;
      }
      var t = ev.target.closest("[data-crear],[data-llego],[data-hist],[data-mover],[data-nolleg],[data-tk]");
      if (!t) { cerrarMenus(root); return; }
      var id = t.getAttribute("data-crear") || t.getAttribute("data-llego") || t.getAttribute("data-hist") || t.getAttribute("data-mover") || t.getAttribute("data-nolleg") || "";
      var c = id ? citaDe(root, id) : null;
      cerrarMenus(root);
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
