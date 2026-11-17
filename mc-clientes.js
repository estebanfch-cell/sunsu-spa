// Clientes de la beta estilo MineCore (Emilia 17/11): lista larga con código, búsqueda y filtros (sin papelera en
// las filas) y ficha con registro único, resumen y pestañas. Admin edita/elimina; los demás piden el cambio.
(function () {
  var K = { L: null, q: "", f: { cosm: "", sector: "", paq: false, gift: false, visita: "" }, sort: "ultima", dir: -1, max: 300, tab: "historial", d: null, edit: false };
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v); }
  function $m(v) { return "$" + (Math.round((Number(v) || 0) * 100) / 100).toFixed(2); }
  function f(v) { return v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—"; }
  function toast2(m, mal) { if (typeof toast === "function") { try { toast(m, mal ? "#B86B6B" : undefined); return; } catch (x) {} } alert(m); }
  function norm(v) { return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }
  function css() {
    if (window.MCConteo && window.MCConteo._css) window.MCConteo._css();
    if (document.getElementById("mccl-css")) return;
    var s = document.createElement("style"); s.id = "mccl-css";
    s.textContent = [
      ".mccl-t tr[data-k]{cursor:pointer}.mccl-t tr[data-k]:hover td{background:var(--cream)}.mccl-cod{font-family:ui-monospace,monospace;font-size:.74rem;color:var(--navy)}",
      ".mccl-h{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}.mccl-h h2{margin:0;font-size:1.3rem}.mccl-meta{color:var(--gray);font-size:.8rem;margin-top:3px}",
      ".mccl-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:12px 0}.mccl-kpi{background:var(--white,#fff);border:1px solid var(--cream-d);border-radius:12px;padding:10px 12px}.mccl-kpi b{display:block;font-size:1.15rem;color:var(--navy-d)}.mccl-kpi span{font-size:.7rem;color:var(--gray);text-transform:uppercase}",
      ".mccl-reg{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:6px 18px;font-size:.84rem}.mccl-reg div b{color:var(--navy-d);font-weight:700}.mccl-reg input{width:100%;box-sizing:border-box;padding:6px 8px;border:1.5px solid var(--cream-d);border-radius:8px;font:inherit;font-size:.82rem}",
      ".mccl-tabs{display:flex;gap:4px;border-bottom:1.5px solid var(--cream-d);margin:14px 0 10px;flex-wrap:wrap}.mccl-tabs button{border:none;background:none;padding:8px 14px;font:inherit;font-size:.84rem;font-weight:700;color:var(--gray);cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-1.5px}.mccl-tabs button.on{color:var(--navy-d);border-bottom-color:var(--navy)}",
      ".mccl-acts{display:flex;gap:8px;flex-wrap:wrap}.mccl-del{color:#b2452a!important;border-color:#e4b4a8!important}.mccl-pend{font-size:.66rem;background:#e3f0e6;color:#226b38;border-radius:6px;padding:1px 6px;margin-left:4px}",
      ".mccl-ses{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid var(--navy);margin-right:3px;vertical-align:middle}.mccl-ses.u{background:var(--navy)}",
    ].join("");
    document.head.appendChild(s);
  }

  // ---------- lista ----------
  function filtrados() {
    var q = norm(K.q), F = K.f, hoy = Date.now();
    var rows = (K.L || []).filter(function (c) {
      if (F.cosm && c.cosmetologa !== F.cosm) return false;
      if (F.sector && c.sector !== F.sector) return false;
      if (F.paq && !(c.paquetesActivos > 0)) return false;
      if (F.gift && !(c.giftSaldo > 0)) return false;
      if (F.visita) {
        var d = c.ultima ? (hoy - new Date(c.ultima + "T12:00:00").getTime()) / 864e5 : 1e9;
        if (F.visita === "30" && d > 30) return false; if (F.visita === "90" && d > 90) return false; if (F.visita === "365" && d > 365) return false;
        if (F.visita === "180+" && !(d > 180 && d < 1e9)) return false; if (F.visita === "nunca" && c.visitas > 0) return false;
      }
      if (!q) return true;
      var blob = norm([c.codigo, c.nombre, c.cedula, c.telefono, c.sector].join(" "));
      return q.split(/\s+/).every(function (w) { return blob.indexOf(w) >= 0 || blob.replace(/\D/g, "").indexOf(w.replace(/\D/g, "") || "~") >= 0; });
    });
    var k = K.sort, dir = K.dir;
    var val = function (c) { if (k === "visitas" || k === "total" || k === "paquetesActivos") return Number(c[k]) || 0; if (k === "codigo") { var m = /(\d+)$/.exec(c.codigo || ""); return m ? Number(m[1]) + (String(c.codigo).indexOf("C-B") === 0 ? 1e6 : 0) : 1e9; } return norm(c[k]); };
    return rows.slice().sort(function (a, b) { var x = val(a), y = val(b); return x < y ? -dir : x > y ? dir : norm(a.nombre).localeCompare(norm(b.nombre)); });
  }
  function cols() {
    var c = [["codigo", "Código"], ["nombre", "Clienta"], ["cedula", "Cédula"], ["visitas", "Visitas", 1], ["ultima", "Última visita"]];
    if (K.admin) c.push(["total", "Total gastado", 1]);
    if ((K.L || []).some(function (x) { return "telefono" in x; })) c.push(["telefono", "Teléfono"]);
    c.push(["paquetesActivos", "Paquetes", 1], ["sector", "Sector"], ["cosmetologa", "Cosmetóloga"]);
    return c;
  }
  function cuerpo() {
    var R = filtrados(), C = cols();
    var head = "<tr>" + C.map(function (c) { return '<th' + (c[2] ? ' class="num"' : "") + '><button class="link" type="button" data-sort="' + c[0] + '">' + e(c[1]) + (K.sort === c[0] ? (K.dir > 0 ? " ▲" : " ▼") : "") + "</button></th>"; }).join("") + "</tr>";
    var body = R.slice(0, K.max).map(function (c) {
      return '<tr data-k="' + e(c.key) + '">' + C.map(function (col) {
        var k = col[0], v = c[k];
        if (k === "codigo") return '<td class="mccl-cod">' + e(v || "—") + "</td>";
        if (k === "nombre") return "<td><b>" + e(v || "Sin nombre") + "</b>" + (c.giftSaldo > 0 ? ' <span class="mccl-pend" title="Gift card con saldo">GC ' + e($m(c.giftSaldo)) + "</span>" : "") + "</td>";
        if (k === "ultima") return "<td>" + e(f(v)) + "</td>";
        if (k === "total") return '<td class="num">' + e($m(v)) + "</td>";
        if (k === "paquetesActivos") return '<td class="num">' + (v ? '<span class="mccl-pend">' + e(v) + " activo" + (v > 1 ? "s" : "") + "</span>" : "") + "</td>";
        return "<td" + (col[2] ? ' class="num"' : "") + ">" + e(v == null ? "" : v) + "</td>";
      }).join("") + "</tr>";
    }).join("") || '<tr><td colspan="' + C.length + '" class="mccf-sub">' + (K.q ? "Nada coincide con la búsqueda." : "Sin clientas con esos filtros.") + "</td></tr>";
    return { head: head, body: body, n: R.length };
  }
  function htmlLista() {
    var F = K.f, o = function (v, t, sel) { return '<option value="' + e(v) + '"' + (v === sel ? " selected" : "") + ">" + e(t) + "</option>"; };
    var c = cuerpo();
    return '<div id="mccl-root"><div class="mccf-bar"><input type="search" id="mccl-q" placeholder="Buscar por código, nombre, cédula o teléfono" value="' + e(K.q) + '" autocomplete="off">' +
      '<select id="mccl-cosm">' + o("", "Todas las cosmetólogas", F.cosm) + (K.cosms || []).map(function (x) { return o(x, x, F.cosm); }).join("") + "</select>" +
      '<select id="mccl-sec">' + o("", "Todos los sectores", F.sector) + (K.secs || []).map(function (x) { return o(x, x, F.sector); }).join("") + "</select>" +
      '<select id="mccl-vis">' + o("", "Cualquier visita", F.visita) + o("30", "Vino en 30 días", F.visita) + o("90", "Vino en 90 días", F.visita) + o("365", "Vino en el año", F.visita) + o("180+", "Sin venir +6 meses", F.visita) + o("nunca", "Sin tickets", F.visita) + "</select>" +
      '<label class="mccf-sub"><input type="checkbox" id="mccl-paq"' + (F.paq ? " checked" : "") + "> Con paquete activo</label>" +
      (K.admin ? '<label class="mccf-sub"><input type="checkbox" id="mccl-gift"' + (F.gift ? " checked" : "") + "> Con gift card con saldo</label>" : "") +
      '<button class="btn small" type="button" data-go="#/doc/ov">Nuevo ticket</button></div>' +
      '<p class="mccf-sub" id="mccl-n">' + c.n + " clienta" + (c.n === 1 ? "" : "s") + (c.n > K.max ? " · mostrando " + K.max : "") + "</p>" +
      '<div class="sheet-scroll"><table class="mccf-t mccl-t"><thead id="mccl-head">' + c.head + '</thead><tbody id="mccl-body">' + c.body + "</tbody></table></div>" +
      (c.n > K.max ? '<p><button class="btn ghost small" type="button" id="mccl-mas">Mostrar más</button></p>' : "") + "</div>";
  }
  async function renderLista() {
    css();
    if (!K.L || Date.now() - (K.t || 0) > 60000) {
      var d = await api("cl_list", {});
      if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + "</p>";
      K.L = d.clientes || []; K.admin = !!d.admin; K.cosms = d.cosmetologas || []; K.secs = d.sectores || []; K.t = Date.now();
    }
    return htmlLista();
  }
  function repintarLista(main) {
    var c = cuerpo();
    main.querySelector("#mccl-head").innerHTML = c.head; main.querySelector("#mccl-body").innerHTML = c.body;
    main.querySelector("#mccl-n").textContent = c.n + " clienta" + (c.n === 1 ? "" : "s") + (c.n > K.max ? " · mostrando " + K.max : "");
    var m = main.querySelector("#mccl-mas"); if (m) m.hidden = c.n <= K.max;
  }
  function wireLista(main) {
    var q = main.querySelector("#mccl-q"); if (!q) return;
    var tmr; q.oninput = function () { clearTimeout(tmr); tmr = setTimeout(function () { K.q = q.value; K.max = 300; repintarLista(main); }, 120); };
    var set = function (id, k, chk) { var x = main.querySelector(id); if (x) x.onchange = function () { K.f[k] = chk ? x.checked : x.value; K.max = 300; repintarLista(main); }; };
    set("#mccl-cosm", "cosm"); set("#mccl-sec", "sector"); set("#mccl-vis", "visita"); set("#mccl-paq", "paq", 1); set("#mccl-gift", "gift", 1);
    main.querySelector("#mccl-head").onclick = function (ev) { var b = ev.target.closest("[data-sort]"); if (!b) return; var k = b.getAttribute("data-sort"); K.dir = K.sort === k ? -K.dir : (/ultima|total|visitas|paquetes/.test(k) ? -1 : 1); K.sort = k; repintarLista(main); };
    main.querySelector("#mccl-body").onclick = function (ev) { var tr = ev.target.closest("tr[data-k]"); if (tr) go("#/m/clientes/c/" + encodeURIComponent(tr.getAttribute("data-k"))); };
    var m = main.querySelector("#mccl-mas"); if (m) m.onclick = function () { K.max += 500; repintarLista(main); };
    if (!K.q) q.focus();
  }

  // ---------- ficha ----------
  function tabHtml() {
    var d = K.d, t = K.tab;
    if (t === "historial") {
      if (!d.historial.length) return '<p class="mccf-sub">Sin tickets.</p>';
      return '<table class="mccf-t mccl-t"><thead><tr><th>Fecha</th><th>Ticket</th><th>Cosmetóloga</th><th>Detalle</th>' + (d.admin ? '<th class="num">Total</th>' : "") + "</tr></thead><tbody>" +
        d.historial.map(function (h) { return '<tr' + (h.clave ? ' data-tk="' + e(h.clave) + '"' : "") + "><td>" + e(f(h.fecha)) + " " + e(h.hora || "") + '</td><td class="mccl-cod">' + e(h.ref) + (h.editadoBeta ? ' <span class="mccl-pend">beta</span>' : "") + "</td><td>" + e(h.cosmetologa) + "</td><td>" + e([h.facial, h.lineas].filter(function (x) { return x && x !== "-"; }).join(" · ")) + "</td>" + (d.admin ? '<td class="num">' + e($m(h.total)) + "</td>" : "") + "</tr>"; }).join("") + "</tbody></table>";
    }
    if (t === "paquetes") {
      if (!d.paquetes.length) return '<p class="mccf-sub">Sin paquetes.</p>';
      return '<table class="mccf-t"><thead><tr><th>Código</th><th>Paquete</th><th>Sesiones</th><th class="num">Quedan</th></tr></thead><tbody>' +
        d.paquetes.map(function (p) { return '<tr><td class="mccl-cod">' + e(p.codigo || "—") + "</td><td>" + e(p.nombre) + "</td><td>" + (p.usos || []).map(function (u) { return '<span class="mccl-ses' + (u.usado ? " u" : "") + '" title="Sesión ' + u.slot + (u.fecha ? " · " + e(u.fecha) : "") + '"></span>'; }).join("") + " " + e(p.usados) + "/" + e(p.total) + '</td><td class="num"><b>' + e(p.pendientes) + "</b></td></tr>"; }).join("") + "</tbody></table>";
    }
    if (t === "gift") {
      if (!d.giftcards.length) return '<p class="mccf-sub">Sin gift cards.</p>';
      return '<table class="mccf-t"><thead><tr><th>Código</th><th>Fecha</th><th>Compró</th><th>Valor</th>' + (d.admin ? '<th class="num">Saldo</th>' : "") + "<th>Estado</th></tr></thead><tbody>" +
        d.giftcards.map(function (g) { return '<tr><td class="mccl-cod">' + e(g.codigo) + "</td><td>" + e(f(g.fecha)) + "</td><td>" + e(g.comprador) + "</td><td>" + e(g.valor) + "</td>" + (d.admin ? '<td class="num">' + e($m(g.saldo)) + "</td>" : "") + "<td>" + (g.usado ? "Usada " + e(f(g.fechaUso)) + (g.usadoPor ? " · " + e(g.usadoPor) : "") : "Disponible") + "</td></tr>"; }).join("") + "</tbody></table>";
    }
    if (t === "docs") {
      if (!d.documentos.length) return '<p class="mccf-sub">Sin documentos.</p>';
      var ico = { tarjeta: "📄", foto: "🖼️", comprobante: "🧾", consentimiento: "✍️", analisis: "🔬" };
      return '<table class="mccf-t mccl-t"><thead><tr><th>Fecha</th><th>Documento</th><th></th></tr></thead><tbody>' + d.documentos.map(function (x) {
        var acc = x.url ? '<a class="btn ghost small" href="' + e(x.url) + '" target="_blank" rel="noopener">Abrir</a>' : x.clave ? '<button class="btn ghost small" type="button" data-tk="' + e(x.clave) + '">Ver ticket</button>' : "";
        return "<tr><td>" + e(f(x.fecha)) + "</td><td>" + (ico[x.tipo] || "•") + " " + e(x.nombre) + (x.texto ? '<div class="mccf-sub">' + e(x.texto) + "</div>" : "") + "</td><td>" + acc + "</td></tr>";
      }).join("") + "</tbody></table>";
    }
    if (t === "bitacora") return d.bitacora.length ? "<ul>" + d.bitacora.slice().reverse().map(function (h) { return "<li>" + e(new Date(h.fecha).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })) + " · <b>" + e(h.accion) + "</b> · " + e(h.por) + (h.motivo ? " · " + e(h.motivo) : "") + (h.cambios ? " · " + e(Object.keys(h.cambios).map(function (k) { return k + ": " + h.cambios[k].antes + " → " + h.cambios[k].despues; }).join("; ")) : "") + "</li>"; }).join("") + "</ul>" : '<p class="mccf-sub">Sin cambios hechos en la beta.</p>';
    return "";
  }
  function regHtml() {
    var d = K.d;
    if (K.edit) return '<div class="mccl-reg">' + d.campos.map(function (c) { return "<div><b>" + e(c[1]) + '</b><input data-c="' + e(c[0]) + '" value="' + e(d.datos[c[0]] || "") + '"' + (c[0] === "nacimiento" ? ' type="date"' : "") + "></div>"; }).join("") + "</div>" +
      (d.puedeEditar ? "" : '<p style="margin:10px 0 4px;font-size:.8rem;font-weight:700">Motivo del cambio</p><input type="text" id="mccl-mot" style="width:100%;padding:8px;border:1.5px solid var(--cream-d);border-radius:9px" placeholder="Ej. cambió de teléfono">') +
      '<p class="err" id="mccl-err"></p><div class="mccl-acts"><button class="btn small" type="button" id="mccl-ok">' + (d.puedeEditar ? "Guardar" : "Enviar solicitud") + '</button><button class="btn ghost small" type="button" id="mccl-no">Cancelar</button></div>';
    var v = d.campos.filter(function (c) { return d.datos[c[0]]; });
    return v.length ? '<div class="mccl-reg">' + v.map(function (c) { return "<div><b>" + e(c[1]) + ":</b> " + e(c[0] === "nacimiento" ? f(d.datos[c[0]]) : d.datos[c[0]]) + (d.corregidos.indexOf(c[0]) >= 0 ? ' <span class="mccl-pend" title="Corregido en la beta">corregido</span>' : "") + "</div>"; }).join("") + "</div>" : '<p class="mccf-sub">Sin datos de registro.</p>';
  }
  function htmlFicha() {
    var d = K.d, r = d.resumen, nombre = ((d.datos.nombres || "") + " " + (d.datos.apellido || "")).trim() || "Sin nombre";
    var tabs = [["historial", "Historial (" + d.historial.length + ")"], ["paquetes", "Paquetes (" + d.paquetes.length + ")"], ["gift", "Gift cards (" + d.giftcards.length + ")"], ["docs", "Documentos (" + d.documentos.length + ")"]];
    if (d.bitacora.length) tabs.push(["bitacora", "Cambios"]);
    return '<div id="mccl-root"><p><button class="btn ghost small" type="button" data-go="#/m/clientes">← Volver a la lista</button></p>' +
      (d.borrado ? '<p class="err">Clienta eliminada en la beta' + (d.borradoMotivo ? ": " + e(d.borradoMotivo) : "") + "</p>" : "") +
      '<div class="card"><div class="mccl-h"><div><h2>' + e(nombre) + '</h2><div class="mccl-meta"><span class="mccl-cod">' + e(d.codigo || "sin código") + "</span> · CI " + e(d.datos.cedula || "—") + (d.datos.telefono ? " · ☎ " + e(d.datos.telefono) : "") + (r.registros > 1 ? " · registrada " + r.registros + " veces (se muestra una vez)" : "") + "</div></div>" +
      '<div class="mccl-acts"><button class="btn small" type="button" data-go="#/doc/ov">Nuevo ticket</button>' +
      (d.borrado ? (d.puedeEditar ? '<button class="btn ghost small" type="button" id="mccl-rest">Restaurar</button>' : "") :
        '<button class="btn ghost small" type="button" id="mccl-ed">' + (d.puedeEditar ? "Editar datos" : "Solicitar cambio") + '</button><button class="btn ghost small mccl-del" type="button" id="mccl-del">' + (d.puedeEditar ? "Eliminar clienta" : "Solicitar eliminación") + "</button>") + "</div></div>" +
      '<div class="mccl-kpis">' + (d.admin ? '<div class="mccl-kpi"><span>Total gastado</span><b>' + e($m(r.total)) + '</b></div><div class="mccl-kpi"><span>Ticket promedio</span><b>' + e($m(r.promedio)) + "</b></div>" : "") +
      '<div class="mccl-kpi"><span>Tickets</span><b>' + e(r.tickets) + '</b></div><div class="mccl-kpi"><span>Última visita</span><b>' + e(f(r.ultima)) + '</b></div><div class="mccl-kpi"><span>Primera visita</span><b>' + e(f(r.primera)) + '</b></div><div class="mccl-kpi"><span>Sesiones por usar</span><b>' + e(r.sesionesPendientes) + "</b></div></div>" +
      '<div class="card-title" style="margin-top:4px">Datos de registro</div><div id="mccl-regbox">' + regHtml() + "</div></div>" +
      '<div class="card"><div class="mccl-tabs">' + tabs.map(function (t) { return '<button type="button" data-tab="' + t[0] + '" class="' + (K.tab === t[0] ? "on" : "") + '">' + e(t[1]) + "</button>"; }).join("") + '</div><div id="mccl-tab">' + tabHtml() + "</div></div></div>";
  }
  async function renderFicha(key) {
    css();
    var d = await api("cl_get", { key: key });
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + '</p><button class="btn ghost small" type="button" data-go="#/m/clientes">← Volver a la lista</button>';
    if (K.d && K.d.key !== d.key) K.tab = "historial";
    K.d = d; K.edit = false;
    return htmlFicha();
  }
  function repintarFicha(main) { var root = main.querySelector("#mccl-root"); if (root) { root.outerHTML = htmlFicha(); wireFicha(main); } }
  function wireFicha(main) {
    var d = K.d; if (!d || !main.querySelector("#mccl-root")) return;
    main.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { K.tab = b.getAttribute("data-tab"); repintarFicha(main); }; });
    main.querySelector("#mccl-tab").onclick = function (ev) {
      var tr = ev.target.closest("[data-tk]"); if (!tr || ev.target.closest("a")) return;
      sessionStorage.setItem("mctk.volver", location.hash); go("#/m/tickets/t/" + encodeURIComponent(tr.getAttribute("data-tk")));
    };
    var ed = main.querySelector("#mccl-ed"); if (ed) ed.onclick = function () { K.edit = true; repintarFicha(main); };
    var no = main.querySelector("#mccl-no"); if (no) no.onclick = function () { K.edit = false; repintarFicha(main); };
    var ok = main.querySelector("#mccl-ok");
    if (ok) ok.onclick = async function () {
      var cambios = {}; main.querySelectorAll("[data-c]").forEach(function (i) { var k = i.getAttribute("data-c"); if ((d.datos[k] || "") !== i.value.trim()) cambios[k] = i.value.trim(); });
      var err = main.querySelector("#mccl-err");
      if (!Object.keys(cambios).length) { err.textContent = "No cambiaste nada"; return; }
      ok.disabled = true;
      var r = d.puedeEditar ? await api("cl_guardar", { key: d.key, cambios: cambios })
        : await api("solicitud_crear", { tabla: "cliente_beta", fila: d.key, tipo: "cambio", motivo: (main.querySelector("#mccl-mot") || {}).value || "", propuestos: cambios });
      ok.disabled = false;
      if (!r || r.error) { err.textContent = (r && r.error) || "No se pudo"; return; }
      toast2(d.puedeEditar ? "✓ Datos guardados" : "✓ Solicitud enviada a administración");
      K.t = 0; draw();
    };
    var del = main.querySelector("#mccl-del");
    if (del) del.onclick = async function () {
      var mot = prompt(d.puedeEditar ? "¿Eliminar a esta clienta de la beta? Escribe el motivo (queda en el registro; sus tickets no se borran):" : "Motivo para pedir la eliminación:");
      if (!mot || !mot.trim()) return;
      var r = d.puedeEditar ? await api("cl_borrar", { key: d.key, motivo: mot }) : await api("solicitud_crear", { tabla: "cliente_beta", fila: d.key, tipo: "eliminacion", motivo: mot });
      if (!r || r.error) { toast2((r && r.error) || "No se pudo", true); return; }
      toast2(d.puedeEditar ? "Clienta eliminada" : "✓ Solicitud enviada"); K.t = 0;
      if (d.puedeEditar) go("#/m/clientes"); else draw();
    };
    var rest = main.querySelector("#mccl-rest");
    if (rest) rest.onclick = async function () { var r = await api("cl_restaurar", { key: d.key }); if (!r || r.error) { toast2((r && r.error) || "No se pudo", true); return; } K.t = 0; draw(); };
  }

  window.MCClientes = {
    render: function (route) { return route.sub === "c" && route.id ? renderFicha(String(route.id)) : renderLista(); },
    wire: function (main, route) { if (route.sub === "c") wireFicha(main); else wireLista(main); },
    _k: K,
  };
})();
