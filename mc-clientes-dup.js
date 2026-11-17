// 🔗 Clientes › Duplicados (Emilia 17/11, admin): grupos unidos solos por la misma cédula (RUC 001, «.0»),
// uniones a mano y sugerencias (mismo celular, nombre parecido, cédula con un dígito distinto).
// Unir / No son la misma / Deshacer unión: todo queda en el registro y se puede revertir.
(function () {
  var D = { r: null, tab: "sug", q: "" };
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v); }
  function toast2(m, mal) { if (typeof toast === "function") { try { toast(m, mal ? "#B86B6B" : undefined); return; } catch (x) {} } alert(m); }
  function norm(v) { return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function css() {
    if (document.getElementById("mcdu-css")) return;
    var s = document.createElement("style"); s.id = "mcdu-css";
    s.textContent = ".mcdu-card{background:#fff;border:1px solid var(--cream-d);border-radius:12px;padding:12px 14px;margin:10px 0}.mcdu-card h4{margin:0 0 4px;font-size:.95rem;color:var(--navy-d)}" +
      ".mcdu-cli{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.mcdu-cod{font-family:ui-monospace,monospace;font-size:.74rem;color:var(--navy)}.mcdu-m{display:inline-block;font-size:.68rem;font-weight:700;background:#fff3d6;color:#8a5a00;border-radius:6px;padding:1px 7px;margin:0 4px 2px 0}" +
      ".mcdu-pair{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:center}.mcdu-pair>div{min-width:0}.mcdu-sub{color:var(--gray);font-size:.76rem}.mcdu-acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}" +
      ".mcdu-var{display:flex;gap:10px;justify-content:space-between;align-items:center;border-top:1px solid var(--cream-d);padding:7px 2px;font-size:.82rem}.mcdu-var.sep{opacity:.6}" +
      ".mcdu-tabs{display:flex;gap:4px;border-bottom:1.5px solid var(--cream-d);margin:14px 0 10px;flex-wrap:wrap}.mcdu-tabs button{border:none;background:none;padding:8px 14px;font:inherit;font-size:.84rem;font-weight:700;color:var(--gray);cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-1.5px}.mcdu-tabs button.on{color:var(--navy-d);border-bottom-color:var(--navy)}" +
      "@media(max-width:760px){.mcdu-pair{grid-template-columns:1fr}.mcdu-acts{justify-content:flex-start}}";
    document.head.appendChild(s);
  }
  function cli(c) {
    if (!c) return "—";
    return '<div class="mcdu-cli"><a href="#/m/clientes/c/' + encodeURIComponent(c.key) + '"><b>' + e(c.nombre || "(sin nombre)") + "</b></a>" + (c.codigo ? '<span class="mcdu-cod">' + e(c.codigo) + "</span>" : "") + "</div>" +
      '<div class="mcdu-sub">' + [c.cedula ? "CI " + e(c.cedula) : "sin cédula", c.telefono ? "📱 " + e(c.telefono) : "", (c.visitas || 0) + " visita" + (c.visitas === 1 ? "" : "s"), c.ultima ? "última " + e(c.ultima) : ""].filter(Boolean).join(" · ") + "</div>";
  }
  function pasa(txt) { var q = norm(D.q).trim(); return !q || q.split(/\s+/).every(function (w) { return norm(txt).indexOf(w) >= 0; }); }
  function txtCli(c) { return c ? [c.nombre, c.codigo, c.cedula, c.telefono].join(" ") : ""; }
  function vistaSug(r) {
    var L = (r.sugerencias || []).filter(function (x) { return pasa(txtCli(x.a) + " " + txtCli(x.b)); });
    if (!L.length) return '<p class="mccf-sub">Sin sugerencias' + (D.q ? " con ese filtro" : "") + ".</p>";
    return L.slice(0, 200).map(function (x, i) {
      var vieja = String(x.a.codigo || "zz") <= String(x.b.codigo || "zz") ? x.a : x.b;
      return '<div class="mcdu-card"><div>' + x.motivos.map(function (m) { return '<span class="mcdu-m">' + e(m) + "</span>"; }).join("") + "</div>" +
        '<div class="mcdu-pair"><div>' + cli(x.a) + "</div><div>" + cli(x.b) + '</div><div class="mcdu-acts">' +
        '<button class="btn small" type="button" data-unir="' + i + '" data-p="' + e(vieja.key) + '">🔗 Unir</button>' +
        '<button class="btn ghost small" type="button" data-nodup="' + i + '">No son la misma</button></div></div>' +
        '<div class="mcdu-sub" style="margin-top:4px">Al unir queda como principal ' + e(vieja.nombre) + (vieja.codigo ? " (" + e(vieja.codigo) + ", el código más antiguo)" : "") + ".</div></div>";
    }).join("") + (L.length > 200 ? '<p class="mccf-sub">Mostrando 200 de ' + L.length + "; filtra para ver más.</p>" : "");
  }
  function vistaAuto(r) {
    var L = (r.auto || []).filter(function (g) { return pasa(txtCli(g.clienta) + " " + g.variantes.map(function (v) { return v.cedulas.join(" ") + " " + v.nombres.join(" ") + " " + v.codigos.join(" "); }).join(" ")); });
    if (!L.length) return '<p class="mccf-sub">Ningún grupo' + (D.q ? " con ese filtro" : "") + ".</p>";
    return L.slice(0, 300).map(function (g) {
      return '<div class="mcdu-card">' + cli(g.clienta) + g.variantes.map(function (v) {
        return '<div class="mcdu-var' + (v.separada ? " sep" : "") + '"><div><b>' + e(v.cedulas.join(" · ") || v.clave.slice(2)) + "</b>" + (v.principal ? ' <span class="mcdu-m">cédula principal</span>' : "") + (v.separada ? ' <span class="mcdu-m">separada</span>' : "") +
          '<div class="mcdu-sub">' + e(v.nombres.join(" / ")) + " · " + v.tickets + " ticket" + (v.tickets === 1 ? "" : "s") + " · " + v.registros + " registro" + (v.registros === 1 ? "" : "s") + (v.codigos.length ? " · " + e(v.codigos.join(", ")) : "") + "</div></div>" +
          (v.principal ? "" : v.separada ? '<button class="btn ghost small" type="button" data-deshacer="' + e(v.separarId) + '">↩️ Volver a unir</button>' : '<button class="btn ghost small" type="button" data-separar="' + e(v.clave) + '">Deshacer unión</button>') + "</div>";
      }).join("") + "</div>";
    }).join("") + (L.length > 300 ? '<p class="mccf-sub">Mostrando 300 de ' + L.length + ".</p>" : "");
  }
  function vistaManual(r) {
    var L = (r.manual || []).filter(function (x) { return pasa(txtCli(x.de) + " " + txtCli(x.a)); });
    var N = (r.noSon || []).filter(function (x) { return pasa(txtCli(x.a) + " " + txtCli(x.b)); });
    return (L.length ? L.map(function (x) {
      return '<div class="mcdu-card"><div class="mcdu-pair"><div>' + cli(x.de) + '<div class="mcdu-sub">↳ unida a</div></div><div>' + cli(x.a) + '</div><div class="mcdu-acts"><button class="btn ghost small" type="button" data-deshacer="' + e(x.id) + '">↩️ Deshacer unión</button></div></div>' +
        '<div class="mcdu-sub">' + e(x.por) + " · " + e(String(x.fecha).slice(0, 16).replace("T", " ")) + (x.motivo ? " · " + e(x.motivo) : "") + "</div></div>";
    }).join("") : '<p class="mccf-sub">Todavía no hay uniones a mano.</p>') +
      (N.length ? "<h4 style=\"margin-top:16px\">Marcadas «no son la misma»</h4>" + N.map(function (x) {
        return '<div class="mcdu-card"><div class="mcdu-pair"><div>' + cli(x.a) + "</div><div>" + cli(x.b) + '</div><div class="mcdu-acts"><button class="btn ghost small" type="button" data-deshacer="' + e(x.id) + '">↩️ Deshacer</button></div></div></div>';
      }).join("") : "");
  }
  function cuerpo() {
    var r = D.r;
    return D.tab === "auto" ? vistaAuto(r) : D.tab === "manual" ? vistaManual(r) : vistaSug(r);
  }
  async function render() {
    css();
    var r = await api("cl_dup_lista", { limit: 600 });
    if (!r || r.error) return '<p class="err">' + e((r && r.error) || "No se pudo cargar") + '</p><button class="btn ghost small" type="button" data-go="#/m/clientes">← Volver</button>';
    D.r = r; var t = r.totales || {};
    var tab = function (k, l) { return '<button type="button" data-tab="' + k + '" class="' + (D.tab === k ? "on" : "") + '">' + l + "</button>"; };
    return '<div class="mccf"><p><button class="btn ghost small" type="button" data-go="#/m/clientes">← Volver a la lista</button></p><h2>🔗 Clientas duplicadas</h2>' +
      '<p class="mccf-sub">La misma cédula (con o sin «.0», RUC con 001) ya es una sola clienta con su código más antiguo: revisa esos grupos y, si una variante no es ella, «Deshacer unión». Las sugerencias son posibles duplicadas que necesitan tu ok. Nada cambia en la hoja; todo se puede deshacer y queda en el registro.</p>' +
      '<div class="mcdu-tabs" id="mcdu-tabs">' + tab("sug", "Sugerencias (" + (t.sugerencias || 0) + ")") + tab("auto", "Unidas por cédula (" + (t.auto || 0) + ")") + tab("manual", "Unidas a mano (" + (t.manual || 0) + ")") + "</div>" +
      '<div class="mccf-bar"><input type="search" id="mcdu-q" placeholder="Filtrar por nombre, cédula, código o celular" value="' + e(D.q) + '"></div><div id="mcdu-body">' + cuerpo() + "</div></div>";
  }
  function wire(main) {
    var body = main.querySelector("#mcdu-body"); if (!body) return;
    var redib = function () { body.innerHTML = cuerpo(); };
    var recargar = async function (msg) { if (msg) toast2(msg); var h = await render(); main.innerHTML = h; wire(main); if (window.MCClientes && window.MCClientes._k) window.MCClientes._k.t = 0, window.MCClientes._k.L = null; };
    var tabs = main.querySelector("#mcdu-tabs");
    if (tabs) tabs.onclick = function (ev) { var b = ev.target.closest("[data-tab]"); if (!b) return; D.tab = b.getAttribute("data-tab"); tabs.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); }); redib(); };
    var q = main.querySelector("#mcdu-q"), tmr;
    if (q) q.oninput = function () { clearTimeout(tmr); tmr = setTimeout(function () { D.q = q.value; redib(); }, 150); };
    body.onclick = async function (ev) {
      var vis = (D.r.sugerencias || []).filter(function (x) { return pasa(txtCli(x.a) + " " + txtCli(x.b)); });
      var u = ev.target.closest("[data-unir]");
      if (u) {
        var x = vis[Number(u.getAttribute("data-unir"))]; if (!x) return;
        var pk = u.getAttribute("data-p"), prin = pk === x.a.key ? x.a : x.b, otra = prin === x.a ? x.b : x.a;
        if (!confirm("¿Unir " + otra.nombre + (otra.codigo ? " (" + otra.codigo + ")" : "") + " dentro de " + prin.nombre + (prin.codigo ? " (" + prin.codigo + ")" : "") + "?\n\nSus tickets, paquetes, gift cards y documentos se verán en una sola ficha. Se puede deshacer.")) return;
        u.disabled = true;
        var r = await api("cl_dup_unir", { a: x.a.key, b: x.b.key, principal: prin.key });
        if (!r || r.error) { u.disabled = false; toast2((r && r.error) || "No se pudo unir", true); return; }
        return recargar("✓ Unidas");
      }
      var n = ev.target.closest("[data-nodup]");
      if (n) {
        var y = vis[Number(n.getAttribute("data-nodup"))]; if (!y) return;
        n.disabled = true;
        var r2 = await api("cl_dup_nodup", { a: y.a.key, b: y.b.key });
        if (!r2 || r2.error) { n.disabled = false; toast2((r2 && r2.error) || "No se pudo", true); return; }
        return recargar("✓ Marcadas como personas distintas");
      }
      var sp = ev.target.closest("[data-separar]");
      if (sp) {
        var mot = prompt("¿Por qué esta cédula no es la misma clienta? (queda en el registro)");
        if (mot == null) return;
        sp.disabled = true;
        var r3 = await api("cl_dup_separar", { clave: sp.getAttribute("data-separar"), motivo: mot });
        if (!r3 || r3.error) { sp.disabled = false; toast2((r3 && r3.error) || "No se pudo", true); return; }
        return recargar("✓ Unión deshecha");
      }
      var dh = ev.target.closest("[data-deshacer]");
      if (dh) {
        if (!confirm("¿Deshacer?")) return;
        dh.disabled = true;
        var r4 = await api("cl_dup_deshacer", { id: dh.getAttribute("data-deshacer") });
        if (!r4 || r4.error) { dh.disabled = false; toast2((r4 && r4.error) || "No se pudo", true); return; }
        return recargar("✓ Deshecho");
      }
    };
  }
  window.MCClientesDup = { render: render, wire: wire, _d: D };
})();
