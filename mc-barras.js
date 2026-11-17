// 🏷️ Códigos de barras (TK17, paridad MineCore): escanear para encontrar o asignar, revisar todo el inventario
// (sin código, EAN-13 que no cuadra, repetidos), generar internos en lote e imprimir etiquetas 50 × 25 mm.
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast2(msg, bad) { if (typeof toast === "function") toast(msg, bad ? "var(--red, #c0392b)" : "var(--green)"); }
  var K = { d: null, filtro: "todos", q: "", sel: {}, cant: {}, scan: null };
  var PROB = { sin_codigo: "sin código", ean_invalido: "EAN-13 no cuadra", repetido: "repetido" };
  function norm(v) { return String(v || "").trim().replace(/\.0+$/, "").replace(/\s+/g, ""); }
  function css() {
    if (document.getElementById("mcbr-css")) return;
    var s = document.createElement("style"); s.id = "mcbr-css";
    s.textContent = [
      ".mcbr h2{margin:0 0 6px;font-size:1.2rem}.mcbr-sub{font-size:.76rem;color:var(--gray,#8a93a6)}",
      ".mcbr-card{background:#fff;border-radius:14px;padding:12px 14px;margin:10px 0;box-shadow:var(--shadow-sm,0 1px 3px rgba(0,0,0,.08))}",
      ".mcbr-q{display:flex;gap:8px}.mcbr-q input{flex:1;padding:11px 12px;border:1.5px solid var(--navy,#2c3e66);border-radius:10px;font:inherit;font-size:1rem}",
      ".mcbr-chips{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.mcbr-chips button{border:1.5px solid var(--cream-d,#e6dccb);background:#fff;border-radius:999px;padding:5px 12px;font:inherit;font-size:.76rem;cursor:pointer}.mcbr-chips button.on{border-color:var(--navy,#2c3e66);background:var(--blue-l,#eef3fb);font-weight:800}",
      ".mcbr-t{width:100%;border-collapse:collapse;font-size:.8rem}.mcbr-t th{text-align:left;color:var(--gray,#8a93a6);font-size:.7rem;padding:5px;border-bottom:1.2px solid var(--cream-d,#e6dccb);position:sticky;top:0;background:#fff}.mcbr-t td{padding:6px 5px;border-bottom:1px solid #f1ede6;vertical-align:middle}",
      ".mcbr-sku{font-family:ui-monospace,Menlo,monospace;font-size:.74rem}.mcbr-cod{font-family:ui-monospace,Menlo,monospace;font-size:.78rem}.mcbr-bars svg{width:110px;height:22px;display:block;fill:#1f2a44}",
      ".mcbr-pill{font-size:.66rem;border-radius:999px;padding:2px 8px;background:#e8f5ee;color:#2e7d52;font-weight:800;white-space:nowrap}.mcbr-pill.r{background:#fdecea;color:#b03a2e}.mcbr-pill.a{background:#fff4e0;color:#a35b00}.mcbr-pill.g{background:#eef0f4;color:#6b7280}",
      ".mcbr-bar{position:sticky;bottom:0;background:#fff;border-top:1.5px solid var(--cream-d,#e6dccb);padding:8px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      ".mcbr-res{margin-top:10px}.mcbr-hit{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.mcbr-scroll{max-height:62vh;overflow:auto}",
      ".mcbr-cant{width:52px;padding:4px 6px;border:1.2px solid var(--cream-d,#e6dccb);border-radius:8px;font:inherit;text-align:right}",
    ].join("\n");
    document.head.appendChild(s);
  }
  function svgDe(c) {
    var P = window.MCProductos; if (!P) return "";
    try { return /^\d{13}$/.test(c) ? P.barras(c) : P.code128(c); } catch (_) { return ""; }
  }
  function visibles() {
    var L = (K.d && K.d.items) || [], q = K.q.toLowerCase();
    return L.filter(function (i) {
      if (K.filtro === "sin" && !i.problemas.some(function (p) { return p.tipo === "sin_codigo"; })) return false;
      if (K.filtro === "prob" && !i.problemas.some(function (p) { return p.tipo !== "sin_codigo"; })) return false;
      if (K.filtro === "con" && !i.barras.length) return false;
      if (!q) return true;
      return [i.sku, i.skuVisible, i.nombre, i.marca].concat(i.barras).join(" ").toLowerCase().indexOf(q) >= 0;
    });
  }
  function porCodigo(code) { var c = norm(code); return ((K.d && K.d.items) || []).filter(function (i) { return i.barras.indexOf(c) >= 0; }); }
  function htmlScan() {
    var s = K.scan; if (!s) return "";
    if (s.hits.length) return s.hits.map(function (i) {
      return '<div class="mcbr-hit"><span class="mcbr-pill">✓ ' + e(s.codigo) + "</span><b>" + e(i.nombre) + '</b> <span class="mcbr-sku">' + e(i.skuVisible || i.sku) + "</span>" + (i.stock != null ? ' <span class="mcbr-sub">stock ' + e(i.stock) + "</span>" : "") +
        ' <a class="btn ghost small" href="#/m/productos/p/' + e(i.id) + '">Abrir ficha</a> <button class="btn ghost small" type="button" data-etq1="' + e(i.id) + '">🖨 Etiqueta</button></div>';
    }).join("");
    var adm = K.d && K.d.admin;
    return '<div><span class="mcbr-pill a">' + e(s.codigo) + "</span> no lo tiene ningún producto." + (adm ? ' Asígnalo:' +
      '<div class="mcbr-q" style="margin-top:6px"><input id="mcbr-asig-q" placeholder="Busca el producto (SKU o nombre)" autocomplete="off"></div><div id="mcbr-asig-res" class="mcbr-res"></div>' : " Pídele a un admin que lo asigne.") + "</div>";
  }
  function htmlTabla() {
    var V = visibles(), adm = K.d && K.d.admin;
    if (!V.length) return '<p class="mcbr-sub">Nada que mostrar con este filtro.</p>';
    return '<div class="mcbr-scroll"><table class="mcbr-t"><thead><tr><th><input type="checkbox" id="mcbr-all" style="width:auto"></th><th>Producto</th><th>Código principal</th><th>Otros</th><th>Estado</th><th class="num">Etiquetas</th></tr></thead><tbody>' +
      V.map(function (i) {
        var pr = i.problemas.map(function (p) { return '<span class="mcbr-pill ' + (p.tipo === "sin_codigo" ? "g" : "r") + '" title="' + e(p.con ? "también en " + p.con : "") + '">' + e(PROB[p.tipo]) + (p.codigo ? " " + e(p.codigo) : "") + (p.con ? " · " + e(p.con) : "") + "</span>"; }).join(" ") || '<span class="mcbr-pill">OK</span>';
        var c0 = i.barras[0] || "";
        return '<tr><td><input type="checkbox" data-sel="' + e(i.id) + '"' + (K.sel[i.id] ? " checked" : "") + ' style="width:auto"></td>' +
          '<td><a href="#/m/productos/p/' + e(i.id) + '"><b>' + e(i.nombre) + '</b></a><br><span class="mcbr-sku">' + e(i.skuVisible || i.sku) + "</span>" + (i.archivado ? ' <span class="mcbr-pill g">archivado</span>' : i.activo ? "" : ' <span class="mcbr-pill g">inactivo</span>') + "</td>" +
          "<td>" + (c0 ? '<div class="mcbr-bars">' + svgDe(c0) + '</div><span class="mcbr-cod">' + e(c0) + "</span>" : "—") + "</td>" +
          '<td class="mcbr-cod">' + e(i.barras.slice(1).join(", ")) + "</td><td>" + pr + "</td>" +
          '<td class="num"><input class="mcbr-cant" type="number" min="1" max="200" data-cant="' + e(i.id) + '" value="' + e(K.cant[i.id] || 1) + '"></td></tr>';
      }).join("") + "</tbody></table></div>" +
      '<div class="mcbr-bar"><span class="mcbr-sub" id="mcbr-nsel">' + nSel() + " elegidos</span>" +
      (adm ? '<button class="btn ghost small" type="button" id="mcbr-gen">⚙ Generar EAN-13 interno a los elegidos sin código</button>' : "") +
      '<button class="btn small" type="button" id="mcbr-print">🖨 Imprimir etiquetas</button></div>';
  }
  function nSel() { return Object.keys(K.sel).filter(function (k) { return K.sel[k]; }).length; }
  function htmlTodo() {
    var d = K.d;
    if (!d) return '<p class="mcbr-sub">Cargando…</p>';
    if (d.error) return '<p class="err">' + e(d.error) + "</p>";
    var chips = [["todos", "Todos (" + d.total + ")"], ["con", "Con código (" + (d.total - d.sinCodigo) + ")"], ["sin", "Sin código (" + d.sinCodigo + ")"], ["prob", "Con problemas (" + (d.items.filter(function (i) { return i.problemas.some(function (p) { return p.tipo !== "sin_codigo"; }); }).length) + ")"]];
    return '<div class="mcbr"><h2>🏷️ Códigos de barras</h2><p class="mcbr-sub">Escanea con el lector (USB/Bluetooth) o la cámara para encontrar el producto. Revisa qué productos no tienen código o lo tienen mal, genera códigos internos e imprime etiquetas de 50 × 25 mm.</p>' +
      '<div class="mcbr-card"><div class="mcbr-q"><input id="mcbr-scan" placeholder="Escanea o escribe un código y Enter" autocomplete="off" inputmode="numeric"><button class="btn ghost" type="button" id="mcbr-cam" title="Usar la cámara">📷</button></div><div class="mcbr-res" id="mcbr-scanres">' + htmlScan() + "</div></div>" +
      '<div class="mcbr-card"><div class="mcbr-chips">' + chips.map(function (c) { return '<button type="button" data-f="' + c[0] + '" class="' + (K.filtro === c[0] ? "on" : "") + '">' + e(c[1]) + "</button>"; }).join("") +
      '<input id="mcbr-q" type="search" placeholder="Filtrar por SKU, nombre o código" value="' + e(K.q) + '" style="flex:1;min-width:180px;padding:6px 10px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:999px;font:inherit;font-size:.8rem"></div>' +
      '<p class="mcbr-sub">Los EAN-13 se validan con su dígito de control. Los internos empiezan con 20 (uso interno GS1) y nunca se repiten. Para editar los códigos de un producto, abre su ficha › Códigos de barras.</p>' +
      '<div id="mcbr-tabla">' + htmlTabla() + "</div></div></div>";
  }
  async function cargar() { K.d = await api("barras_resumen", {}); }
  function repTodo(main) { var r = main.querySelector("#mcbr-root"); if (r) { r.innerHTML = htmlTodo(); wire(main); } }
  function repTabla(main) { var t = main.querySelector("#mcbr-tabla"); if (t) { t.innerHTML = htmlTabla(); wireTabla(main); } }
  function repScan(main) { var t = main.querySelector("#mcbr-scanres"); if (t) { t.innerHTML = htmlScan(); wireScan(main); } }
  function buscarCodigo(main, code) {
    var c = norm(code); if (!c) return;
    K.scan = { codigo: c, hits: porCodigo(c) }; repScan(main);
    var inp = main.querySelector("#mcbr-scan"); if (inp) { inp.value = ""; inp.focus(); }
  }
  function wireScan(main) {
    main.querySelectorAll("[data-etq1]").forEach(function (b) { b.onclick = function () { imprimir([{ id: b.dataset.etq1, n: 1 }]); }; });
    var aq = main.querySelector("#mcbr-asig-q"); if (!aq) return;
    aq.focus();
    aq.oninput = function () {
      var q = aq.value.trim().toLowerCase(), res = main.querySelector("#mcbr-asig-res");
      if (q.length < 2) { res.innerHTML = ""; return; }
      var H = K.d.items.filter(function (i) { return [i.sku, i.skuVisible, i.nombre].join(" ").toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
      res.innerHTML = H.map(function (i) { return '<div class="mcbr-hit" style="margin:4px 0"><button class="btn ghost small" type="button" data-asig="' + e(i.id) + '">Asignar</button><b>' + e(i.nombre) + '</b> <span class="mcbr-sku">' + e(i.skuVisible || i.sku) + "</span>" + (i.barras.length ? ' <span class="mcbr-sub">ya tiene ' + e(i.barras.join(", ")) + " (quedará como adicional)</span>" : "") + "</div>"; }).join("") || '<p class="mcbr-sub">Sin resultados.</p>';
      res.querySelectorAll("[data-asig]").forEach(function (b) {
        b.onclick = async function () {
          b.disabled = true;
          var r = await api("barras_asignar", { id: b.dataset.asig, codigo: K.scan.codigo });
          if (!r || !r.ok) { b.disabled = false; toast2((r && r.error) || "No se pudo asignar", 1); return; }
          toast2("Código asignado"); var c = K.scan.codigo; await cargar(); K.scan = { codigo: c, hits: porCodigo(c) }; repTodo(main);
        };
      });
    };
  }
  function wireTabla(main) {
    main.querySelectorAll("[data-sel]").forEach(function (c) { c.onchange = function () { K.sel[c.dataset.sel] = c.checked; var n = main.querySelector("#mcbr-nsel"); if (n) n.textContent = nSel() + " elegidos"; }; });
    main.querySelectorAll("[data-cant]").forEach(function (c) { c.onchange = function () { K.cant[c.dataset.cant] = Math.max(1, Math.min(200, +c.value || 1)); }; });
    var all = main.querySelector("#mcbr-all");
    if (all) all.onchange = function () { visibles().forEach(function (i) { K.sel[i.id] = all.checked; }); repTabla(main); };
    var gen = main.querySelector("#mcbr-gen");
    if (gen) gen.onclick = async function () {
      var ids = visibles().filter(function (i) { return K.sel[i.id] && !i.barras.length; }).map(function (i) { return i.id; });
      if (!ids.length) { toast2("Elige productos que no tengan código", 1); return; }
      if (!confirm("¿Generar un EAN-13 interno para " + ids.length + " producto(s)? Los que ya tienen código no se tocan.")) return;
      gen.disabled = true;
      var r = await api("barras_generar_lote", { ids: ids });
      gen.disabled = false;
      if (!r || !r.ok) { toast2((r && r.error) || "No se pudo", 1); return; }
      toast2(r.hechos.length + " código(s) generado(s)"); await cargar(); repTodo(main);
    };
    var pr = main.querySelector("#mcbr-print");
    if (pr) pr.onclick = function () {
      var L = visibles().filter(function (i) { return K.sel[i.id]; }).map(function (i) { return { id: i.id, n: K.cant[i.id] || 1 }; });
      if (!L.length) { toast2("Elige al menos un producto", 1); return; }
      imprimir(L);
    };
  }
  function imprimir(L) {
    var by = {}; (K.d.items || []).forEach(function (i) { by[i.id] = i; });
    var sinCod = L.filter(function (x) { return !(by[x.id] && by[x.id].barras.length); });
    L = L.filter(function (x) { return by[x.id] && by[x.id].barras.length; });
    if (!L.length) { toast2("Los elegidos no tienen código; genera uno primero", 1); return; }
    var conPvp = confirm("¿Incluir el PVP en las etiquetas?\nAceptar = con PVP · Cancelar = sin PVP");
    var html = "";
    L.forEach(function (x) {
      var i = by[x.id], cod = i.barras[0], svg = svgDe(cod).replace('width="190" height="44"', 'width="100%" height="100%"');
      var lab = "<div class='l'><div class='n'>" + e(String(i.nombre || "").slice(0, 34)) + "</div><div class='b'>" + svg + "</div><div class='f'><span>" + e(cod) + " · " + e(i.skuVisible || i.sku) + "</span>" + (conPvp && i.pvp ? "<b>$" + Number(i.pvp).toFixed(2) + "</b>" : "") + "</div></div>";
      for (var k = 0; k < Math.min(200, x.n || 1); k++) html += lab;
    });
    var w = window.open("", "_blank");
    if (!w) { alert("Permite ventanas emergentes para imprimir"); return; }
    w.document.write("<!doctype html><html><head><meta charset='utf-8'><title>Etiquetas Sunsu</title><style>@page{size:50mm 25mm;margin:0}html,body{margin:0;padding:0}" +
      ".l{width:50mm;height:25mm;box-sizing:border-box;padding:1.2mm 2mm;font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;page-break-after:always;break-after:page}" +
      ".n{font-size:7pt;font-weight:700;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.b{flex:1;min-height:0;margin:.6mm 0}.b svg{width:100%;height:100%;display:block}" +
      ".f{display:flex;justify-content:space-between;font-size:6.5pt}.f b{font-size:8pt}</style></head><body>" + html +
      "<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>");
    w.document.close();
    if (sinCod.length) toast2(sinCod.length + " sin código no se imprimieron", 1);
  }
  function wire(main) {
    main.querySelectorAll("[data-f]").forEach(function (b) { b.onclick = function () { K.filtro = b.dataset.f; main.querySelectorAll("[data-f]").forEach(function (x) { x.classList.toggle("on", x === b); }); repTabla(main); }; });
    var q = main.querySelector("#mcbr-q"); if (q) q.oninput = function () { K.q = q.value; repTabla(main); };
    var sc = main.querySelector("#mcbr-scan");
    if (sc) { sc.focus(); sc.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); buscarCodigo(main, sc.value); } }; }
    var cam = main.querySelector("#mcbr-cam");
    if (cam) cam.onclick = function () { if (window.MCAperturas && window.MCAperturas.escanear) window.MCAperturas.escanear(function (c) { buscarCodigo(main, c); }); else toast2("Cámara no disponible; usa el lector o escribe el código", 1); };
    wireScan(main); wireTabla(main);
  }
  window.MCBarras = {
    render: async function () { css(); await cargar(); return '<div id="mcbr-root">' + htmlTodo() + "</div>"; },
    wire: wire,
    _k: K,
  };
})();
