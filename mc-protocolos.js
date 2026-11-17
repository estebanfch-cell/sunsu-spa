// Protocolos editables (beta, 0042). Lista + editor: servicio (facial), nombre, vigente, mano de obra,
// notas y pasos ordenados con producto, cantidad, unidad y minutos. Escribe beta_protocolos (proto_guardar);
// cabina_protocolos y la hoja no se tocan.
(function () {
  var P = { data: null, cur: null, q: "", dirty: false, hist: null };
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v); }
  function q2(v) { var x = Number(v) || 0; return Math.round(x * 100) / 100 + ""; }
  function fecha(v) { var t = String(v || ""); if (!t) return ""; var d = t.slice(0, 10).split("-"); return d.length === 3 ? d[2] + "/" + d[1] + "/" + d[0] : t; }
  function norm(v) { return String(v == null ? "" : v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  var UNIDADES = ["ml", "g", "u", "gotas", "pz", "cm", "aplic."];

  function css() {
    if (document.getElementById("mcpr-css")) return;
    var s = document.createElement("style");
    s.id = "mcpr-css";
    s.textContent = [
      ".mcpr-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.mcpr-bar input{flex:1;min-width:200px}",
      ".mcpr-t{width:100%;border-collapse:collapse;font-size:.84rem}.mcpr-t th{text-align:left;font-size:.68rem;text-transform:uppercase;color:var(--navy-d);padding:7px;border-bottom:1px solid var(--cream-d)}",
      ".mcpr-t td{padding:7px;border-bottom:1px solid var(--gray-l);vertical-align:middle}.mcpr-row{cursor:pointer}.mcpr-row:hover{background:var(--cream)}",
      ".mcpr-sku{font-family:ui-monospace,Menlo,monospace;font-size:.78rem;color:var(--navy-d)}.mcpr-sub{color:var(--gray);font-size:.72rem}",
      ".mcpr-tag{display:inline-block;border-radius:999px;padding:2px 8px;font-size:.66rem;font-weight:800;background:var(--green-l,#e6f4ea);color:var(--green,#2e7d32)}.mcpr-tag.off{background:var(--gray-l);color:var(--gray)}",
      ".mcpr-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}.mcpr-form label{display:flex;flex-direction:column;gap:4px;font-size:.72rem;font-weight:700;color:var(--navy-d)}",
      ".mcpr-form input,.mcpr-form select,.mcpr-form textarea,.mcpr-ps input,.mcpr-ps select{padding:8px 9px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit;font-size:.82rem}",
      ".mcpr-ps td{padding:5px 4px}.mcpr-ps .n{width:54px;white-space:nowrap;text-align:center;font-weight:800;color:var(--navy)}.mcpr-ps .num input{width:74px}.mcpr-ps .bt{white-space:nowrap}",
      ".mcpr-drag{display:inline-block;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;padding:6px 6px;margin-left:-4px;color:var(--gray);font-weight:900;letter-spacing:-2px}.mcpr-arr{background:var(--gold-l);box-shadow:0 4px 14px rgba(0,0,0,.15)}.mcpr-arr .mcpr-drag{cursor:grabbing}",
      ".mcpr-ps .bt button{border:1.5px solid var(--cream-d);background:var(--white);border-radius:8px;padding:5px 8px;cursor:pointer;font:inherit}",
      ".mcpr-save[hidden]{display:none}.mcpr-save{position:sticky;top:0;z-index:5;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--gold-l);border:1px solid var(--gold-m);border-radius:12px;padding:8px 12px;margin-bottom:10px}",
      "@media(max-width:820px){.mcpr-hide{display:none}.mcpr-ps .desc input{min-width:140px}}",
    ].join("");
    document.head.appendChild(s);
  }

  async function cargar() {
    var d = await api("proto_list", {});
    if (!d || d.error) return d || { error: "Sin respuesta" };
    P.data = d;
    return null;
  }
  function prodNombre(c) { var p = (P.data.productos || []).find(function (x) { return x.codigo === c; }); return p ? p.nombre : ""; }

  function listaHtml() {
    var d = P.data, q = norm(P.q);
    var L = window.MCBuscar ? window.MCBuscar.filtrar(d.protocolos || [], P.q, function (p) { return [[p.sku], [p.nombre, p.servicio && p.servicio.nombre]]; }) : (d.protocolos || []).filter(function (p) { return !q || norm([p.sku, p.nombre, p.servicio && p.servicio.nombre].join(" ")).indexOf(q) >= 0; });
    var sinProto = (d.servicios || []).filter(function (s) { return s.activo && !(d.protocolos || []).some(function (p) { return p.sku === s.sku; }); });
    var filas = L.map(function (p) {
      return '<tr class="mcpr-row" data-pr="' + e(p.id) + '"><td class="mcpr-sku">' + e(p.sku) + "</td><td><b>" + e(p.nombre) + '</b><div class="mcpr-sub">' + e(p.servicio ? p.servicio.nombre : "Servicio no encontrado") + "</div></td>" +
        "<td>" + (p.vigente ? '<span class="mcpr-tag">vigente</span>' : '<span class="mcpr-tag off">no vigente</span>') + "</td>" +
        '<td class="num">' + (p.pasos || []).length + '</td><td class="num mcpr-hide">' + p.productos + '</td><td class="num mcpr-hide">' + q2(p.minutos) + ' min</td><td class="mcpr-hide">v' + e(p.version) + ' <span class="mcpr-sub">' + e(p.actualizado_por || "") + "</span></td></tr>";
    }).join("");
    return '<div class="mcpr">' + (d.beta ? "" : '<p class="note">Vista de solo lectura: falta aplicar 0042 para editar.</p>') +
      '<div class="mcpr-bar"><input type="search" id="mcpr-q" placeholder="Buscar protocolo o facial" value="' + e(P.q) + '">' + (d.editable ? '<button class="btn small" type="button" data-go="#/m/mc/protocolos/nuevo">+ Nuevo protocolo</button>' : "") + "</div>" +
      '<div class="card"><div class="sheet-scroll"><table class="mcpr-t"><thead><tr><th>Facial</th><th>Protocolo</th><th>Estado</th><th class="num">Pasos</th><th class="num mcpr-hide">Productos</th><th class="num mcpr-hide">Tiempo</th><th class="mcpr-hide">Versión</th></tr></thead><tbody>' +
      (filas || '<tr><td colspan="7" class="mcpr-sub">Sin protocolos.</td></tr>') + "</tbody></table></div></div>" +
      (sinProto.length ? '<p class="note">Servicios sin protocolo: ' + sinProto.map(function (s) { return e(s.sku) + " " + e(s.nombre); }).join(" · ") + "</p>" : "") +
      '<p class="note">Qué productos lleva cada facial, en qué cantidad y en qué paso (la «orden de manufactura» de MineCore). Los editas aquí; la hoja de Cabina ya no los pisa. El descuento de stock de Cabina sigue usando su receta hasta que se decida pasarlo a estos protocolos.</p></div>';
  }

  function nuevo() {
    return { id: "", sku: "", nombre: "", vigente: true, mano_de_obra: null, notas: "", pasos: [{ paso: 1, descripcion: "", producto_cod: "", cantidad: "", unidad: "ml", minutos: "" }], version: 0 };
  }
  function editorHtml() {
    var d = P.data, p = P.cur, can = d.editable;
    var dis = can ? "" : " disabled";
    var usados = (d.protocolos || []).filter(function (x) { return x.id !== p.id; }).map(function (x) { return x.sku; });
    var svcs = (d.servicios || []).filter(function (s) { return usados.indexOf(s.sku) < 0 || s.sku === p.sku; });
    var selSvc = '<select id="mcpr-sku"' + dis + '><option value="">Elige el facial…</option>' + svcs.map(function (s) {
      return '<option value="' + e(s.sku) + '"' + (s.sku === p.sku ? " selected" : "") + ">" + e(s.sku + " · " + s.nombre + (s.activo ? "" : " (inactivo)")) + "</option>";
    }).join("") + "</select>";
    var dl = '<datalist id="mcpr-dl">' + (d.productos || []).map(function (x) { return '<option value="' + e(x.codigo) + '">' + e(x.nombre) + "</option>"; }).join("") + "</datalist>";
    var filas = (p.pasos || []).map(function (x, i) {
      var uOpts = UNIDADES.concat(x.unidad && UNIDADES.indexOf(x.unidad) < 0 ? [x.unidad] : []);
      return '<tr data-row="' + i + '"><td class="n">' + (can ? '<span class="mcpr-drag" data-drag="' + i + '" title="Arrastra para ordenar" aria-label="Arrastrar paso">⋮⋮</span> ' : "") + (i + 1) + '</td><td class="desc"><input data-ps="descripcion" data-i="' + i + '" value="' + e(x.descripcion) + '" placeholder="Qué se hace"' + dis + "></td>" +
        '<td><input data-ps="producto_cod" data-i="' + i + '" list="mcpr-dl" value="' + e(x.producto_cod) + '" placeholder="INV-…" style="width:110px"' + dis + '><div class="mcpr-sub" data-psn="' + i + '">' + e(prodNombre(x.producto_cod)) + "</div></td>" +
        '<td class="num"><input data-ps="cantidad" data-i="' + i + '" inputmode="decimal" value="' + e(x.cantidad) + '"' + dis + "></td>" +
        '<td><select data-ps="unidad" data-i="' + i + '"' + dis + ">" + uOpts.map(function (u) { return '<option value="' + e(u) + '"' + (u === x.unidad ? " selected" : "") + ">" + e(u) + "</option>"; }).join("") + "</select></td>" +
        '<td class="num"><input data-ps="minutos" data-i="' + i + '" inputmode="decimal" value="' + e(x.minutos) + '"' + dis + "></td>" +
        (can ? '<td class="bt"><button type="button" data-del="' + i + '" aria-label="Quitar">✕</button></td>' : "") + "</tr>";
    }).join("");
    var tot = (p.pasos || []).reduce(function (a, x) { return a + (Number(String(x.minutos).replace(",", ".")) || 0); }, 0);
    var hist = (P.hist || []).map(function (h) { return "<li>" + e(fecha(h.fecha)) + " · " + e(h.actor) + (h.version ? " · v" + e(h.version) : "") + "</li>"; }).join("");
    return '<div class="mcpr"><p><button class="btn ghost small" type="button" data-go="#/m/mc/protocolos">← Protocolos</button></p>' +
      (can ? '<div class="mcpr-save" id="mcpr-save"' + (P.dirty || !p.id ? "" : " hidden") + '><b>' + (p.id ? "Cambios sin guardar" : "Protocolo nuevo") + '</b><span class="mcpr-err err" id="mcpr-err"></span><button class="btn small" type="button" id="mcpr-guardar">Guardar</button>' + (p.id ? '<button class="btn ghost small" type="button" id="mcpr-descartar">Descartar</button>' : "") + "</div>" : "") +
      (can && p.id ? '<p style="text-align:right"><button class="btn ghost small" type="button" id="mcpr-borrar">Eliminar protocolo</button></p>' : "") +
      '<div class="card"><div class="card-title">' + (p.id ? e(p.nombre) + ' <span class="mcpr-sub">v' + e(p.version) + "</span>" : "Nuevo protocolo") + "</div>" +
      '<div class="mcpr-form"><label>Servicio (facial)' + selSvc + '</label><label>Nombre<input id="mcpr-nombre" value="' + e(p.nombre) + '" placeholder="Facial S.O.S"' + dis + "></label>" +
      '<label>Estado<select id="mcpr-vig"' + dis + '><option value="1"' + (p.vigente ? " selected" : "") + '>Vigente</option><option value="0"' + (p.vigente ? "" : " selected") + ">No vigente</option></select></label>" +
      (d.verCostos ? '<label>Mano de obra ($)<input id="mcpr-mo" inputmode="decimal" value="' + e(p.mano_de_obra == null ? "" : p.mano_de_obra) + '"' + dis + "></label>" : "") +
      '<label style="grid-column:1/-1">Notas<textarea id="mcpr-notas" rows="2"' + dis + ">" + e(p.notas) + "</textarea></label></div></div>" +
      '<div class="card"><div class="card-title">Pasos <span class="mcpr-sub">' + (p.pasos || []).length + " pasos · " + q2(tot) + " min</span></div>" + dl +
      '<div class="sheet-scroll"><table class="mcpr-t mcpr-ps"><thead><tr><th>#</th><th>Descripción</th><th>Producto</th><th>Cant.</th><th>Unidad</th><th>Min</th>' + (can ? "<th></th>" : "") + "</tr></thead><tbody>" + filas + "</tbody></table></div>" +
      (can ? '<p><button class="btn ghost small" type="button" id="mcpr-add">+ Paso</button></p>' : "") +
      '<p class="note">Producto: escribe o elige el código (INV-…, ML-…). Pasos sin producto (toalla caliente, extracción) llevan solo descripción y minutos.</p></div>' +
      (p.id ? '<div class="card"><div class="card-title">Historial</div>' + (hist ? '<ul class="mc-hist mcpr-sub">' + hist + "</ul>" : '<p class="note">' + (p.origen === "cabina" ? "Copiado de Cabina; sin cambios en la beta." : "Sin cambios.") + "</p>") + "</div>" : "") + "</div>";
  }
  function pinta(main) {
    var box = main.querySelector("#mcpr-root");
    if (box) { box.innerHTML = P.cur ? editorHtml() : listaHtml(); wire(main); }
  }
  function marcar(main) { P.dirty = true; var s = main.querySelector("#mcpr-save"); if (s) s.hidden = false; }
  function wire(main) {
    var root = main.querySelector("#mcpr-root");
    if (!root) return;
    root.querySelectorAll("[data-go]").forEach(function (b) {
      b.onclick = function () { if (P.dirty && !confirm("Hay cambios sin guardar. ¿Salir?")) return; P.dirty = false; go(b.getAttribute("data-go")); };
    });
    var q = root.querySelector("#mcpr-q");
    if (q) q.oninput = function () { P.q = q.value; var pos = q.selectionStart; pinta(main); var q2b = main.querySelector("#mcpr-q"); if (q2b) { q2b.focus(); q2b.setSelectionRange(pos, pos); } };
    root.querySelectorAll("[data-pr]").forEach(function (tr) { tr.onclick = function () { go("#/m/mc/protocolos/" + encodeURIComponent(tr.getAttribute("data-pr"))); }; });
    if (!P.cur) return;
    var p = P.cur;
    var bind = function (id, k, f) { var el = root.querySelector(id); if (el) el.addEventListener(el.tagName === "SELECT" ? "change" : "input", function () { p[k] = f ? f(el.value) : el.value; if (k === "sku" && !p.nombre) { var s = (P.data.servicios || []).find(function (x) { return x.sku === el.value; }); if (s) { p.nombre = s.nombre; var n = root.querySelector("#mcpr-nombre"); if (n) n.value = s.nombre; } } marcar(main); }); };
    bind("#mcpr-sku", "sku"); bind("#mcpr-nombre", "nombre"); bind("#mcpr-vig", "vigente", function (v) { return v === "1"; });
    bind("#mcpr-mo", "mano_de_obra"); bind("#mcpr-notas", "notas");
    root.querySelectorAll("[data-ps]").forEach(function (el) {
      el.addEventListener(el.tagName === "SELECT" ? "change" : "input", function () {
        var i = +el.getAttribute("data-i"), k = el.getAttribute("data-ps");
        p.pasos[i][k] = k === "producto_cod" ? el.value.trim().toUpperCase() : el.value;
        if (k === "producto_cod") { var nn = root.querySelector('[data-psn="' + i + '"]'); if (nn) nn.textContent = prodNombre(p.pasos[i].producto_cod); }
        marcar(main);
      });
    });
    // Arrastrar para ordenar (dedo en iPhone/iPad y mouse): Pointer Events sobre la manija ⋮⋮.
    root.querySelectorAll("[data-drag]").forEach(function (h) {
      h.addEventListener("pointerdown", function (ev) {
        ev.preventDefault();
        var tbody = h.closest("tbody"), fila = h.closest("tr"), desde = +h.getAttribute("data-drag"), hasta = desde;
        try { h.setPointerCapture(ev.pointerId); } catch (x) { /* sin captura */ }
        fila.classList.add("mcpr-arr");
        var mover = function (e2) {
          var y = e2.clientY, filas = [].slice.call(tbody.querySelectorAll("tr[data-row]"));
          var otra = filas.filter(function (f) { if (f === fila) return false; var r = f.getBoundingClientRect(); return y >= r.top && y <= r.bottom; })[0];
          if (!otra) return;
          var r = otra.getBoundingClientRect();
          if (y < r.top + r.height / 2) tbody.insertBefore(fila, otra); else tbody.insertBefore(fila, otra.nextSibling);
          hasta = [].indexOf.call(tbody.querySelectorAll("tr[data-row]"), fila);
        };
        var soltar = function () {
          document.removeEventListener("pointermove", mover); document.removeEventListener("pointerup", soltar); document.removeEventListener("pointercancel", soltar);
          fila.classList.remove("mcpr-arr");
          if (hasta !== desde && hasta >= 0) { var x = p.pasos.splice(desde, 1)[0]; p.pasos.splice(hasta, 0, x); P.dirty = true; }
          pinta(main);
        };
        document.addEventListener("pointermove", mover); document.addEventListener("pointerup", soltar); document.addEventListener("pointercancel", soltar);
      });
    });
    root.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { p.pasos.splice(+b.getAttribute("data-del"), 1); P.dirty = true; pinta(main); }; });
    var add = root.querySelector("#mcpr-add");
    if (add) add.onclick = function () { var last = p.pasos[p.pasos.length - 1]; p.pasos.push({ descripcion: "", producto_cod: "", cantidad: "", unidad: last ? last.unidad : "ml", minutos: "" }); P.dirty = true; pinta(main); var ins = main.querySelectorAll('[data-ps="descripcion"]'); if (ins.length) ins[ins.length - 1].focus(); };
    var ds = root.querySelector("#mcpr-descartar");
    if (ds) ds.onclick = async function () { P.dirty = false; await abrir(p.id); pinta(main); };
    var bo = root.querySelector("#mcpr-borrar");
    if (bo) bo.onclick = async function () {
      if (!confirm("¿Eliminar el protocolo «" + p.nombre + "»? Queda en el historial y se puede volver a crear.")) return;
      var r = await api("proto_guardar", { id: p.id, sku: p.sku, nombre: p.nombre, vigente: p.vigente, mano_de_obra: p.mano_de_obra, notas: p.notas, pasos: p.pasos, borrar: true });
      if (!r || r.error) { alert((r && r.error) || "No se pudo eliminar"); return; }
      P.dirty = false; go("#/m/mc/protocolos");
    };
    var g = root.querySelector("#mcpr-guardar");
    if (g) g.onclick = async function () {
      var er = root.querySelector("#mcpr-err");
      g.disabled = true;
      var r = await api("proto_guardar", { id: p.id, sku: p.sku, nombre: p.nombre, vigente: p.vigente, mano_de_obra: p.mano_de_obra, notas: p.notas, pasos: p.pasos });
      g.disabled = false;
      if (!r || r.error) { if (er) er.textContent = (r && r.error) || "No se pudo guardar"; return; }
      P.dirty = false;
      if (typeof toast === "function") try { toast("Protocolo guardado · v" + r.version); } catch (x) {}
      await cargar();
      if (!p.id) { go("#/m/mc/protocolos/" + encodeURIComponent(r.id)); return; }
      await abrir(r.id); pinta(main);
    };
  }
  async function abrir(id) {
    var x = (P.data.protocolos || []).find(function (p) { return p.id === id; });
    if (!x) { P.cur = null; return false; }
    P.cur = JSON.parse(JSON.stringify(x));
    P.hist = null;
    try { var h = await api("proto_historial", { id: id }); P.hist = (h && h.cambios) || []; } catch (z) { P.hist = []; }
    return true;
  }

  window.MCProtocolos = {
    render: async function (route) {
      css();
      var er = await cargar();
      if (er) return '<p class="err">' + e(er.error) + "</p>";
      P.dirty = false;
      var rid = String(route.id || "").split("?")[0];
      if (rid === "nuevo") {
        if (!P.data.editable) return '<p class="err">Solo un admin crea protocolos.</p>';
        P.cur = nuevo(); P.hist = [];
        var pre = String(location.hash.split("?")[1] || "").match(/sku=([^&]+)/);
        if (pre) { P.cur.sku = decodeURIComponent(pre[1]); var sv = (P.data.servicios || []).find(function (s) { return s.sku === P.cur.sku; }); if (sv) P.cur.nombre = sv.nombre; }
      } else if (rid) {
        if (!(await abrir(rid))) return '<p class="err">Protocolo no encontrado.</p><button class="btn ghost small" type="button" data-go="#/m/mc/protocolos">← Protocolos</button>';
      } else P.cur = null;
      return '<div id="mcpr-root">' + (P.cur ? editorHtml() : listaHtml()) + "</div>";
    },
    wire: function (main) { wire(main); },
    dirty: function () { return P.dirty; },
    _p: P,
  };
})();
