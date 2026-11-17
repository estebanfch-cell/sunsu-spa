// 🧾 Compras v2 estilo MineCore (TK24, Emilia 17/11): lista de órdenes de compra con el mismo look de Tickets,
// detalle tipo ticket (cabecera, líneas, totales, pagos dentro de la OC), número OC-AAAA-NNNN por año,
// cotizaciones de proveedor (lo que antes era «Borrador») convertibles a OC, y el PDF de la OC con el look Sunsu.
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $m(v) { return "$" + (Math.round((Number(v) || 0) * 100) / 100).toFixed(2); }
  function r2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
  function f(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : (ymd || ""); }
  function toast2(msg, bad) { if (typeof toast === "function") toast(msg, bad ? "var(--red, #c0392b)" : "var(--green)"); }
  function hoy() { var d = new Date(Date.now() - 5 * 3600 * 1000); return d.toISOString().slice(0, 10); }
  var K = { tab: "oc", q: "", estado: "activas", items: [], cot: [], admin: false, meta: null, d: null, form: null, cons: null };
  var COL = { "Por recibir": "#3E7CB1", "Recibida parcial": "#C98A00", "Recibida": "#2E8B57", "Cancelada": "#C0392B", "Histórica": "#8A93A6", "Pagada": "#2E8B57", "Saldo pendiente": "#C98A00", "Por pagar": "#D2603A", "Abierta": "#3E7CB1", "Convertida": "#2E8B57", "Consignación": "#7C6BB0" };
  function pill(t, tip) { var c = COL[t] || "#8A93A6"; return '<span class="tk-pill mcoc-pill" style="color:' + c + ";border-color:" + c + '"' + (tip ? ' title="' + e(tip) + '"' : "") + ">" + e(t) + "</span>"; }
  function css() {
    if (window.MCConteo && window.MCConteo._css) window.MCConteo._css();
    if (document.getElementById("mcoc-css")) return;
    var s = document.createElement("style"); s.id = "mcoc-css";
    s.textContent = [
      ".mcoc-tabs{display:flex;gap:4px;border-bottom:1.5px solid var(--cream-d,#e6dccb);margin-bottom:12px;flex-wrap:wrap}.mcoc-tabs a{padding:8px 14px;font-weight:800;font-size:.84rem;color:var(--gray,#8a93a6);text-decoration:none;border-bottom:3px solid transparent;margin-bottom:-1.5px}.mcoc-tabs a.on{color:var(--navy-d,#2b3f5c);border-bottom-color:var(--navy,#3d5a7a)}",
      ".mcoc-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.mcoc-tools input[type=search]{flex:1;min-width:220px;padding:9px 11px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:9px;font:inherit}",
      ".mcoc-chip{border:1.5px solid var(--cream-d,#e6dccb);background:var(--white,#fff);border-radius:999px;padding:5px 12px;font:inherit;font-size:.76rem;font-weight:700;color:var(--navy-d,#2b3f5c);cursor:pointer}.mcoc-chip.on{background:var(--navy,#3d5a7a);border-color:var(--navy,#3d5a7a);color:#fff}",
      ".mcoc-num{font-weight:800;color:var(--navy-d,#2b3f5c);white-space:nowrap}.mcoc-sub{color:var(--gray,#8a93a6);font-size:.7rem}",
      ".mcoc-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.mcoc-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}.mcoc-top h1{margin:0;font-size:1.6rem;color:var(--navy-d,#2b3f5c);letter-spacing:.3px}.mcoc-prov{font-size:.92rem;font-weight:700;color:var(--navy-d,#2b3f5c);margin-top:2px}",
      ".mcoc-pills{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.mcoc-pills .tk-pill{font-size:.72rem;padding:2px 10px}",
      ".mcoc-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 28px;margin-top:14px}@media(max-width:720px){.mcoc-grid{grid-template-columns:1fr}}.mcoc-grid dl{margin:0}.mcoc-f{display:grid;grid-template-columns:130px 1fr;gap:8px;padding:6px 0;border-bottom:1px solid var(--cream-d,#e6dccb);font-size:.84rem}.mcoc-f dt{color:var(--gray,#8a93a6);font-size:.76rem}.mcoc-f dd{margin:0;word-break:break-word}",
      ".mcoc-t{width:100%;border-collapse:collapse;font-size:.84rem}.mcoc-t th{font-size:.66rem;text-transform:uppercase;letter-spacing:.04em;color:var(--gray,#8a93a6);text-align:left;padding:6px 8px;border-bottom:1px solid var(--cream-d,#e6dccb)}.mcoc-t td{padding:7px 8px;border-bottom:1px solid #f0ece4;vertical-align:middle}.mcoc-t .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}",
      ".mcoc-pn{font-weight:600}.mcoc-sku{color:var(--gray,#8a93a6);font-size:.68rem}.mcoc-x{border:none;background:none;color:#b2452a;font-size:1.1rem;cursor:pointer}",
      ".mcoc-foot{display:flex;justify-content:flex-end;margin-top:12px}.mcoc-tot{min-width:280px;display:grid;grid-template-columns:1fr auto;gap:4px 18px;font-size:.88rem}.mcoc-tot dt{color:var(--gray,#8a93a6)}.mcoc-tot dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}.mcoc-tot .big{font-size:1.1rem;font-weight:900;color:var(--navy-d,#2b3f5c)}",
      ".mcoc-in{padding:7px 9px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:8px;font:inherit;font-size:.84rem;box-sizing:border-box}.mcoc-in.q,.mcoc-in.p{width:84px;text-align:center;-moz-appearance:textfield;appearance:textfield}.mcoc-in::-webkit-outer-spin-button,.mcoc-in::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}",
      ".mcoc-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px 16px}.mcoc-form label{display:block;font-size:.72rem;color:var(--gray,#8a93a6);margin-bottom:3px;font-weight:700}.mcoc-form .mcoc-in{width:100%}.mcoc-form .full{grid-column:1/-1}",
      ".mcoc-busca{position:relative;margin-top:10px}.mcoc-busca input{width:100%}.mcoc-hits{border:1px solid var(--cream-d,#e6dccb);border-radius:10px;margin-top:4px;max-height:300px;overflow:auto;background:#fff}.mcoc-hit{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;cursor:pointer;font-size:.84rem;border-bottom:1px solid #f4efe5}.mcoc-hit:hover,.mcoc-hit.on{background:var(--cream,#fdfaf1)}",
      ".mcoc-dlg{position:fixed;inset:0;background:rgba(20,30,50,.35);display:flex;align-items:center;justify-content:center;z-index:9999}.mcoc-box{background:#fff;border-radius:14px;padding:16px 18px;width:min(440px,94vw);box-shadow:0 10px 40px rgba(0,0,0,.2);max-height:90vh;overflow:auto}.mcoc-box h3{margin:0 0 6px;font-size:1.05rem;display:flex;justify-content:space-between;align-items:center}.mcoc-box label{display:block;font-size:.74rem;color:var(--gray,#8a93a6);margin:9px 0 3px;font-weight:700}.mcoc-box .mcoc-in{width:100%}.mcoc-xx{background:none;border:0;font-size:1.5rem;cursor:pointer;color:var(--navy,#3d5a7a)}",
      ".mcoc-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}.mcoc-cancel{color:#C0392B!important;border-color:#E6B0AA!important}.mcoc-canc{background:#FDECEA;border:1px solid #E6B0AA;color:#922B21;border-radius:10px;padding:10px 12px;margin:8px 0;font-size:.85rem}",
      ".mcoc-qbig{display:flex;align-items:center;gap:8px;justify-content:center;margin:10px 0}.mcoc-qbig button{width:40px;height:40px;border-radius:10px;border:1.5px solid var(--cream-d,#e6dccb);background:#fff;font-size:1.2rem;cursor:pointer}.mcoc-qbig input{width:100px;font-size:1.3rem;text-align:center}",
      ".mcoc-log{list-style:none;margin:6px 0 0;padding:0;font-size:.8rem}.mcoc-log li{padding:6px 0;border-top:1px solid #f0ece4}.mcoc-log li:first-child{border-top:0}",
      ".mcoc-menu{position:relative}.mcoc-dd{position:absolute;right:0;top:100%;margin-top:4px;background:#fff;border:1px solid var(--cream-d,#e6dccb);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:4px;z-index:50;min-width:200px}.mcoc-dd[hidden]{display:none}.mcoc-dd button{display:block;width:100%;text-align:left;padding:8px 10px;border:none;background:none;font:inherit;font-size:.8rem;color:var(--navy-d,#2b3f5c);cursor:pointer;border-radius:7px}.mcoc-dd button:hover{background:var(--cream,#fdfaf1)}",
      ".mcoc-chk{display:flex!important;gap:8px;align-items:center;text-transform:none!important;letter-spacing:0!important;font-size:.82rem!important;color:var(--navy-d,#2b3f5c)!important;font-weight:600!important;margin:8px 0 0!important;cursor:pointer}.mcoc-chk input{width:16px!important;height:16px;margin:0;flex:none;accent-color:var(--navy,#3d5a7a)}",
      ".mcoc-aviso{background:#f3efe6;border-radius:10px;padding:9px 12px;font-size:.82rem;color:var(--navy-d,#2b3f5c);margin:8px 0}",
    ].join("\n");
    document.head.appendChild(s);
  }
  async function A(act, p) { var r = await api(act, p || {}); if (!r || r.error) throw new Error((r && r.error) || "No se pudo completar"); return r; }
  async function meta() { if (!K.meta) K.meta = await A("cmpb_meta"); return K.meta; }

  // ---------- lista ----------
  var CHIPS = [["activas", "Por recibir"], ["parcial", "Recibida parcial"], ["recibidas", "Recibidas"], ["pago", "Con saldo"], ["canceladas", "Canceladas"], ["historicas", "Históricas"], ["todas", "Todas"]];
  function filtra(it) {
    var q = (K.q || "").toLowerCase().trim();
    if (q && ![it.numero, it.prov && it.prov.nombre, it.proveedor, it.nota].join(" ").toLowerCase().includes(q)) return false;
    var s = K.estado;
    if (s === "activas") return it.estado === "Por recibir";
    if (s === "parcial") return it.estado === "Recibida parcial";
    if (s === "recibidas") return it.estado === "Recibida";
    if (s === "canceladas") return it.estado === "Cancelada";
    if (s === "historicas") return it.estado === "Histórica";
    if (s === "pago") return it.estado !== "Cancelada" && it.pago !== "Pagada" && Number(it.saldo) > 0;
    return true;
  }
  function tabs() {
    var t = [["oc", "Órdenes de compra", "#/m/compras"], ["cot", "Cotizaciones de proveedor", "#/m/compras/cotizaciones"]];
    if (window.MCConsignacion) t.push(["cons", "🤝 Consignación", "#/m/compras/consignacion"]);
    return '<nav class="mcoc-tabs">' + t.map(function (x) { return '<a href="' + x[2] + '" class="' + (K.tab === x[0] ? "on" : "") + '">' + x[1] + "</a>"; }).join("") + "</nav>";
  }
  function filasOc() {
    var L = K.items.filter(filtra);
    if (!L.length) return '<tr><td colspan="8" class="mcoc-sub">Sin órdenes en este filtro</td></tr>';
    return L.map(function (it) {
      return '<tr class="tk-row" data-oc="' + e(it.id) + '"><td class="mcoc-num">' + e(it.numero) + (it.tipo === "consignacion" ? " " + pill("Consignación") : "") + "</td><td>" + e((it.prov && it.prov.nombre) || it.proveedor || "—") + "</td><td>" + e(f(it.fecha)) + "</td><td>" + e(it.nLineas || 0) + "</td><td>" + pill(it.estado) + "</td><td>" + (K.admin && it.estado !== "Cancelada" ? pill(it.pago) : "") + '</td><td class="num">' + (K.admin ? $m(it.total) : "—") + '</td><td class="num">' + (K.admin ? $m(it.saldo) : "—") + "</td></tr>";
    }).join("");
  }
  function listaOc() {
    return tabs() + '<div class="mcoc-tools">' + (K.admin ? '<button class="btn small" type="button" data-go="#/m/compras/nueva">+ Nueva OC</button>' : "") +
      '<input type="search" id="mcoc-q" placeholder="Buscar número, proveedor o nota" value="' + e(K.q) + '"></div>' +
      '<div class="mcoc-tools">' + CHIPS.map(function (c) { return '<button type="button" class="mcoc-chip' + (K.estado === c[0] ? " on" : "") + '" data-est="' + c[0] + '">' + c[1] + " · " + K.items.filter(function (it) { var s = K.estado; K.estado = c[0]; var ok = filtra(it); K.estado = s; return ok; }).length + "</button>"; }).join("") + "</div>" +
      '<div class="sheet-scroll"><table class="tk-table nowrap-table"><thead><tr><th>Nº OC</th><th>Proveedor</th><th>Fecha</th><th>Líneas</th><th>Estado</th><th>Pago</th><th class="num">Total</th><th class="num">Saldo</th></tr></thead><tbody id="mcoc-body">' + filasOc() + "</tbody></table></div>" +
      '<p class="note">Una OC es una compra que el proveedor factura. Las aprobadas quedan «Por recibir» y se reciben en 📥 Recepciones. Las «Históricas» vienen del Sheet sin líneas de recepción.</p>';
  }
  function listaCot() {
    var L = K.cot.filter(function (c) { var q = (K.q || "").toLowerCase().trim(); return !q || [c.numero, c.prov && c.prov.nombre].join(" ").toLowerCase().includes(q); });
    return tabs() + '<div class="mcoc-tools"><button class="btn small" type="button" data-go="#/m/compras/nueva-cot">+ Nueva cotización</button><input type="search" id="mcoc-q" placeholder="Buscar número o proveedor" value="' + e(K.q) + '"></div>' +
      '<div class="sheet-scroll"><table class="tk-table nowrap-table"><thead><tr><th>Nº</th><th>Proveedor</th><th>Fecha</th><th>Líneas</th><th>Estado</th><th>OC</th><th class="num">Total</th></tr></thead><tbody>' +
      (L.map(function (c) { return '<tr class="tk-row" data-cot="' + e(c.id) + '"><td class="mcoc-num">' + e(c.numero) + "</td><td>" + e((c.prov && c.prov.nombre) || "—") + "</td><td>" + e(f(c.fecha)) + "</td><td>" + e(c.nLineas) + "</td><td>" + pill(c.estado) + "</td><td>" + e(c.ocNumero || "") + '</td><td class="num">' + $m(c.total) + "</td></tr>"; }).join("") || '<tr><td colspan="7" class="mcoc-sub">Sin cotizaciones</td></tr>') +
      '</tbody></table></div><p class="note">La cotización del proveedor es lo que antes era «Borrador»: no compromete nada hasta convertirla en OC (toma el siguiente número OC del año).</p>';
  }
  function wireLista(main) {
    var q = main.querySelector("#mcoc-q");
    if (q) q.addEventListener("input", function () { K.q = q.value; var b = main.querySelector("#mcoc-body"); if (b) b.innerHTML = filasOc(); else { var pos = q.selectionStart; main.innerHTML = listaCot(); wireLista(main); var q2 = main.querySelector("#mcoc-q"); q2.focus(); q2.setSelectionRange(pos, pos); } });
    main.querySelectorAll("[data-est]").forEach(function (b) { b.onclick = function () { K.estado = b.getAttribute("data-est"); main.innerHTML = listaOc(); wireLista(main); }; });
    main.addEventListener("click", function (ev) {
      var tr = ev.target.closest && ev.target.closest("tr[data-oc],tr[data-cot]"); if (!tr) return;
      if (tr.hasAttribute("data-oc")) go("#/m/compras/oc/" + encodeURIComponent(tr.getAttribute("data-oc")));
      else go("#/m/compras/cot/" + encodeURIComponent(tr.getAttribute("data-cot")));
    });
  }

  // ---------- detalle OC ----------
  function infoF(k, v) { return '<div class="mcoc-f"><dt>' + e(k) + "</dt><dd>" + (v || '<span class="mcoc-sub">—</span>') + "</dd></div>"; }
  function detOc() {
    var o = K.d, P = o.prov || {}, adm = K.admin;
    var lin = (o.lineas || []).map(function (l, i) {
      return '<tr><td class="mcoc-sub">' + (i + 1) + '</td><td><div class="mcoc-pn">' + e(l.nombre || l.sku) + '</div><div class="mcoc-sku">' + e(l.sku) + '</div></td><td class="num">' + e(l.pedido) + '</td><td class="num">' + e(l.recibido || 0) + '</td><td class="num">' + (l.no_recibido ? e(l.no_recibido) : "") + "</td>" + (adm ? '<td class="num">' + $m(l.precio) + '</td><td class="num">' + $m(l.subtotal) + "</td>" : "") + "</tr>";
    }).join("") || '<tr><td colspan="7" class="mcoc-sub">' + (o.legacy ? "OC histórica del Sheet: sin líneas de producto registradas" : "Sin líneas") + "</td></tr>";
    var pagos = adm ? ((o.pagos || []).map(function (p) { return "<tr><td>" + e(f(p.fecha)) + "</td><td>" + e(p.banco || "") + "</td><td>" + e(p.referencia || "") + "</td><td>" + e(p.comprobante || "") + '</td><td class="num">' + $m(p.monto) + "</td></tr>"; }).join("") || '<tr><td colspan="5" class="mcoc-sub">Sin pagos registrados</td></tr>') : "";
    var recs = (o.recepciones || []).map(function (r) { return "<li><b>" + e(r.numero) + "</b> · " + e(f(r.fecha)) + (r.por ? " · " + e(r.por) : "") + (r.anulada ? " · anulada" : "") + "</li>"; }).join("");
    var hist = (o.historial || []).map(function (h) { return "<li><b>" + e(h.accion) + "</b> · " + e(String(h.fecha).slice(0, 16).replace("T", " ")) + (h.actor ? " · " + e(h.actor) : "") + '<div class="mcoc-sub">' + e(h.detalle) + "</div></li>"; }).join("");
    var cancel = o.estado === "Cancelada" ? '<div class="mcoc-canc"><b>🚫 OC cancelada</b>' + (o.nota && /Cancelada:/.test(o.nota) ? "<br>" + e(o.nota.split("Cancelada:").pop().trim()) : "") + "</div>" : "";
    return '<div id="mcoc-root">' +
      '<div class="mcoc-bar"><button class="btn ghost small" type="button" data-go="#/m/compras">← Lista</button><span style="flex:1"></span>' +
      (adm ? '<div class="mcoc-menu"><button class="btn ghost small" type="button" id="mcoc-docs">Documentos ▾</button><div class="mcoc-dd" id="mcoc-dd" hidden><button type="button" id="mcoc-pdf">📄 PDF de la OC</button></div></div>' : "") +
      (adm && P.email ? '<button class="btn ghost small" type="button" id="mcoc-mail" title="Abre tu correo con el PDF descargado para adjuntar">✉️ Email</button>' : "") +
      (o.puedePagar ? '<button class="btn ghost small" type="button" id="mcoc-pagar">💵 Registrar pago</button>' : "") +
      (o.puedeCancelar ? '<button class="btn ghost small mcoc-cancel" type="button" id="mcoc-cancelar">🚫 Cancelar OC</button>' : "") + "</div>" + cancel +
      '<div class="mccf-card"><div class="mcoc-top"><div><h1>' + e(o.numero) + '</h1><div class="mcoc-prov">' + e(P.nombre || o.proveedor || "") + "</div></div>" +
      '<div class="mcoc-pills">' + pill(o.estado) + (adm && o.estado !== "Cancelada" ? pill(o.pago) : "") + (o.tipo === "consignacion" ? pill("Consignación") : "") + "</div></div>" +
      '<div class="mcoc-grid"><dl>' + infoF("Proveedor", e(P.nombre || o.proveedor || "")) + infoF("RUC", e(P.ruc || "")) + infoF("Email", e(P.email || "")) + infoF("Teléfono", e(P.telefono || "")) + "</dl><dl>" +
      infoF("Fecha", e(f(o.fecha))) + infoF("Entrega esperada", e(f(o.fecha_esperada))) + infoF("Creada por", e(o.creado_por || "")) + infoF("Nota", e(o.nota || "")) + "</dl></div></div>" +
      '<div class="mccf-card"><b>Líneas</b><div class="sheet-scroll" style="margin-top:6px"><table class="mcoc-t"><thead><tr><th>#</th><th>Producto</th><th class="num">Pedido</th><th class="num">Recibido</th><th class="num">No recibido</th>' + (adm ? '<th class="num">Precio</th><th class="num">Subtotal</th>' : "") + "</tr></thead><tbody>" + lin + "</tbody></table></div>" +
      (adm ? '<div class="mcoc-foot"><dl class="mcoc-tot"><dt>Subtotal</dt><dd>' + $m(o.subtotal) + "</dd><dt>IVA</dt><dd>" + $m(o.iva) + "</dd>" + (o.flete ? "<dt>Flete</dt><dd>" + $m(o.flete) + "</dd>" : "") + '<dt class="big">Total</dt><dd class="big">' + $m(o.total) + "</dd><dt>Pagado</dt><dd>" + $m(o.pagado) + '</dd><dt class="big">Saldo</dt><dd class="big">' + $m(o.saldo) + "</dd></dl></div>" : "") + "</div>" +
      (adm ? '<div class="mccf-card"><b>💵 Pagos</b><div class="sheet-scroll" style="margin-top:6px"><table class="mcoc-t"><thead><tr><th>Fecha</th><th>Banco / cuenta</th><th>Referencia</th><th>Comprobante</th><th class="num">Monto</th></tr></thead><tbody>' + pagos + "</tbody></table></div></div>" : "") +
      '<div class="mccf-card"><b>📥 Recepciones</b>' + (recs ? '<ul class="mcoc-log">' + recs + "</ul>" : '<p class="mcoc-sub">Aún no se recibe nada' + (o.estado === "Por recibir" ? " — se recibe en 📥 Recepciones" : "") + "</p>") + "</div>" +
      '<div class="mccf-card"><b>Historial</b>' + (hist ? '<ul class="mcoc-log">' + hist + "</ul>" : '<p class="mcoc-sub">Sin movimientos registrados</p>') + "</div></div>";
  }
  function specOc(o) {
    var P = o.prov || {};
    var esCons = o.tipo === "consignacion";
    return {
      nombre: o.numero + " " + (P.nombre || ""),
      paginas: [{
        titulo: "Orden de compra", numero: o.numero, subt: esCons && o.periodo ? "Vendido en consignación · periodo " + o.periodo : "",
        info: [["Proveedor", P.nombre || o.proveedor || ""], ["RUC", P.ruc || ""], ["Email", P.email || ""], ["Teléfono", P.telefono || ""], ["Fecha", f(o.fecha)], ["Entrega", f(o.fecha_esperada) || "—"], ["Estado", o.estado], ["Comprador", "Sunsu Spa"]],
        aviso: esCons ? "Vendido en consignación" + (o.periodo ? " — periodo " + o.periodo : "") + ". Factúrese lo vendido en el periodo." : "",
        tabla: { cols: [{ t: "#", w: 0.4 }, { t: "SKU", w: 1.1 }, { t: "Producto", w: 3.4 }, { t: "Cant.", w: 0.8, al: "r" }, { t: "Precio", w: 1, al: "r" }, { t: "Subtotal", w: 1.1, al: "r" }],
          filas: (o.lineas || []).map(function (l, i) { return [i + 1, l.sku, l.nombre || l.sku, l.pedido, $m(l.precio), $m(l.subtotal)]; }) },
        totales: [["Subtotal", Number(o.subtotal) || 0], ["IVA", Number(o.iva) || 0]].concat(o.flete ? [["Flete", Number(o.flete)]] : []).concat([["Total", Number(o.total) || 0, true]]),
        notas: [o.nota ? "Nota: " + o.nota : "", "Por favor incluir el número " + o.numero + " en la factura."].filter(Boolean),
      }],
    };
  }
  function dlg(html) {
    var d = document.createElement("div"); d.className = "mcoc-dlg"; d.innerHTML = '<div class="mcoc-box">' + html + "</div>";
    document.body.appendChild(d);
    d.addEventListener("click", function (ev) { if (ev.target === d || (ev.target.closest && ev.target.closest("[data-x]"))) d.remove(); });
    return d;
  }
  function leerArchivo(input) { return new Promise(function (ok) { var fl = input && input.files && input.files[0]; if (!fl) { ok(null); return; } var r = new FileReader(); r.onload = function () { ok({ b64: String(r.result || ""), nombre: fl.name }); }; r.onerror = function () { ok(null); }; r.readAsDataURL(fl); }); }
  function wireDet(main) {
    var o = K.d;
    var dd = main.querySelector("#mcoc-dd"), bd = main.querySelector("#mcoc-docs");
    if (bd) bd.onclick = function (ev) { ev.stopPropagation(); dd.hidden = !dd.hidden; };
    document.addEventListener("click", function () { if (dd) dd.hidden = true; }, { once: true });
    var bp = main.querySelector("#mcoc-pdf"); if (bp) bp.onclick = function () { window.MCDocPdf.ver(o.numero, specOc(o)); };
    var bm = main.querySelector("#mcoc-mail"); if (bm) bm.onclick = function () {
      var P = o.prov || {};
      window.MCDocPdf.bajar(specOc(o)).then(function () {
        location.href = "mailto:" + encodeURIComponent(P.email) + "?subject=" + encodeURIComponent("Orden de compra " + o.numero + " · Sunsu Spa") + "&body=" + encodeURIComponent("Hola " + (P.contacto || P.nombre || "") + ",\n\nAdjuntamos la orden de compra " + o.numero + " por " + $m(o.total) + ".\nPor favor incluir este número en la factura.\n\nGracias,\nSunsu Spa");
        toast2("PDF descargado: adjúntalo en el correo que se abrió");
      }).catch(function (x) { toast2(x.message || x, true); });
    };
    var bc = main.querySelector("#mcoc-cancelar"); if (bc) bc.onclick = function () {
      var d = dlg('<h3>Cancelar ' + e(o.numero) + '<button class="mcoc-xx" data-x>×</button></h3><p class="mcoc-sub">Solo se puede cancelar si no se ha recibido nada.</p><label>Motivo</label><textarea class="mcoc-in" id="mcoc-mot" rows="3"></textarea><p class="err" id="mcoc-err"></p><div class="mcoc-acts"><button class="btn ghost small" data-x type="button">Volver</button><button class="btn small mcoc-cancel" type="button" id="mcoc-okc">Cancelar OC</button></div>');
      d.querySelector("#mcoc-okc").onclick = async function () {
        try { await A("cmpb_cancelar", { id: o.id, motivo: d.querySelector("#mcoc-mot").value }); d.remove(); toast2("OC cancelada"); render2(main, { sub: "oc", id: o.id }); }
        catch (x) { d.querySelector("#mcoc-err").textContent = x.message || x; }
      };
    };
    var bpa = main.querySelector("#mcoc-pagar"); if (bpa) bpa.onclick = function () {
      var d = dlg('<h3>💵 Registrar pago · ' + e(o.numero) + '<button class="mcoc-xx" data-x>×</button></h3><p class="mcoc-sub">Saldo pendiente ' + $m(o.saldo) + '</p>' +
        '<label>Fecha</label><input class="mcoc-in" type="date" id="pg-f" value="' + hoy() + '"><label>Banco / cuenta</label><input class="mcoc-in" id="pg-b" placeholder="Pichincha cta. corriente"><label>Monto</label><input class="mcoc-in" id="pg-m" inputmode="decimal" value="' + r2(o.saldo) + '"><label>Referencia</label><input class="mcoc-in" id="pg-r" placeholder="Nº de transferencia o cheque"><label>Comprobante (opcional)</label><input type="file" id="pg-c" accept="image/*,application/pdf">' +
        '<p class="err" id="mcoc-err"></p><div class="mcoc-acts"><button class="btn ghost small" data-x type="button">Cancelar</button><button class="btn small" type="button" id="pg-ok">Registrar pago</button></div>');
      d.querySelector("#pg-ok").onclick = async function () {
        var b = this; b.disabled = true;
        try {
          var c = await leerArchivo(d.querySelector("#pg-c"));
          var r = await A("cmpb_pago", { oc_id: o.id, fecha: d.querySelector("#pg-f").value, banco: d.querySelector("#pg-b").value, monto: String(d.querySelector("#pg-m").value).replace(",", "."), referencia: d.querySelector("#pg-r").value, comprobante_b64: c ? c.b64 : "", comprobante_nombre: c ? c.nombre : "" });
          d.remove(); toast2("Pago registrado · " + r.pago); render2(main, { sub: "oc", id: o.id });
        } catch (x) { b.disabled = false; d.querySelector("#mcoc-err").textContent = x.message || x; }
      };
    };
  }

  // ---------- nueva OC / cotización (líneas arriba, búsqueda abajo, selector de cantidad) ----------
  function formHtml() {
    var F = K.form, M = K.meta, esCot = F.modo === "cot";
    var prov = M.proveedores.find(function (p) { return p.id === F.proveedor_id; });
    var lin = F.lineas.map(function (l, i) {
      return '<tr data-i="' + i + '"><td class="mcoc-sub">' + (i + 1) + '</td><td><div class="mcoc-pn">' + e(l.nombre) + '</div><div class="mcoc-sku">' + e(l.sku) + '</div></td><td class="num"><input class="mcoc-in q" data-q="' + i + '" type="text" inputmode="decimal" value="' + e(l.cantidad) + '"></td><td class="num"><input class="mcoc-in p" data-p="' + i + '" type="text" inputmode="decimal" value="' + e(l.precio) + '"></td><td class="num" data-sub="' + i + '">' + $m(l.cantidad * l.precio) + '</td><td><button class="mcoc-x" type="button" data-del="' + i + '" title="Quitar">×</button></td></tr>';
    }).join("") || '<tr><td colspan="6" class="mcoc-sub">Busca abajo y elige productos para agregarlos</td></tr>';
    return '<div class="mcoc-bar"><button class="btn ghost small" type="button" data-go="' + (esCot ? "#/m/compras/cotizaciones" : "#/m/compras") + '">← Lista</button></div>' +
      '<div class="mccf-card"><div class="mcoc-top"><div><h1>' + (F.id ? e(F.numero) : esCot ? "Nueva cotización de proveedor" : "Nueva orden de compra") + '</h1><div class="mcoc-sub">' + (esCot ? "Lo que cotiza el proveedor; no compromete nada hasta convertirla en OC." : "Se crea aprobada («Por recibir») con el número OC-" + hoy().slice(0, 4) + "-NNNN.") + "</div></div></div>" +
      '<div class="mcoc-form" style="margin-top:12px"><div><label>Proveedor</label><select class="mcoc-in" id="nf-prov"><option value="">Elige…</option>' + M.proveedores.map(function (p) { return '<option value="' + e(p.id) + '"' + (p.id === F.proveedor_id ? " selected" : "") + ">" + e(p.nombre) + (p.familia ? " (" + e(p.familia) + "-)" : "") + "</option>"; }).join("") + "</select></div>" +
      (esCot ? '<div><label>Nº de cotización del proveedor</label><input class="mcoc-in" id="nf-np" value="' + e(F.numero_prov || "") + '"></div>' : '<div><label>Entrega esperada</label><input class="mcoc-in" type="date" id="nf-fe" value="' + e(F.fecha_esperada || "") + '"></div>') +
      '<div><label>IVA</label><label class="mcoc-chk"><input type="checkbox" id="nf-iva"' + (F.con_iva !== false ? " checked" : "") + "> Precios + IVA 15 %</label></div>" +
      '<div class="full"><label>Nota</label><input class="mcoc-in" id="nf-nota" value="' + e(F.nota || "") + '"></div></div></div>' +
      '<div class="mccf-card"><b>Líneas</b><div class="sheet-scroll" style="margin-top:6px"><table class="mcoc-t"><thead><tr><th>#</th><th>Producto</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Subtotal</th><th></th></tr></thead><tbody id="nf-lin">' + lin + "</tbody></table></div>" +
      '<div class="mcoc-busca"><input class="mcoc-in" type="search" id="nf-q" placeholder="' + (prov && prov.familia ? "Buscar productos " + e(prov.familia) + "- de " + e(prov.nombre) : "Buscar producto por nombre o SKU") + '" autocomplete="off">' +
      (prov && prov.familia ? '<label class="mcoc-chk"><input type="checkbox" id="nf-todos"' + (F.todos ? " checked" : "") + "> Ver todos los productos (no solo " + e(prov.familia) + "-)</label>" : "") +
      '<div class="mcoc-hits" id="nf-hits" hidden></div></div>' +
      '<div class="mcoc-foot"><dl class="mcoc-tot" id="nf-tot"></dl></div><p class="err" id="nf-err"></p>' +
      '<div class="mcoc-acts">' + (F.id && esCot && F.estado === "abierta" ? '<button class="btn ghost small mcoc-cancel" type="button" id="nf-anular">Anular cotización</button><button class="btn ghost small" type="button" id="nf-pdf">📄 PDF</button><button class="btn ghost small" type="button" id="nf-conv">➡️ Convertir a OC</button>' : "") +
      '<button class="btn small" type="button" id="nf-save">' + (esCot ? "Guardar cotización" : "Crear OC") + "</button></div></div>";
  }
  function totF() {
    var F = K.form, sub = r2(F.lineas.reduce(function (a, l) { return a + (Number(l.cantidad) || 0) * (Number(l.precio) || 0); }, 0)), iva = F.con_iva !== false ? r2(sub * 0.15) : 0;
    return { sub: sub, iva: iva, tot: r2(sub + iva) };
  }
  function pintaTot(main) { var t = totF(), el = main.querySelector("#nf-tot"); if (el) el.innerHTML = "<dt>Subtotal</dt><dd>" + $m(t.sub) + "</dd><dt>IVA</dt><dd>" + $m(t.iva) + '</dd><dt class="big">Total</dt><dd class="big">' + $m(t.tot) + "</dd>"; }
  function num(v) { var x = Number(String(v || "").replace(",", ".")); return isFinite(x) ? x : 0; }
  function capturar(main) {
    var F = K.form; var g = function (id) { var el = main.querySelector(id); return el ? el.value : undefined; };
    F.proveedor_id = g("#nf-prov") || ""; F.nota = g("#nf-nota") || ""; if (g("#nf-fe") !== undefined) F.fecha_esperada = g("#nf-fe"); if (g("#nf-np") !== undefined) F.numero_prov = g("#nf-np");
    var iv = main.querySelector("#nf-iva"); if (iv) F.con_iva = iv.checked;
  }
  function picker(p, main) {
    var F = K.form, ya = F.lineas.find(function (l) { return l.producto_id === p.id; });
    var d = dlg('<h3>' + e(p.nombre) + '<button class="mcoc-xx" data-x>×</button></h3><div class="mcoc-sub">' + e(p.sku) + (p.marca ? " · " + e(p.marca) : "") + (ya ? " · ya en la OC: " + e(ya.cantidad) : "") + '</div>' +
      '<label>Cantidad</label><div class="mcoc-qbig"><button type="button" data-d="-1">−</button><input class="mcoc-in q" id="pk-q" type="text" inputmode="decimal" value="1"><button type="button" data-d="1">+</button></div>' +
      '<label>Precio unitario (sin IVA)</label><input class="mcoc-in" id="pk-p" type="text" inputmode="decimal" value="' + e(ya ? ya.precio : r2(p.costo)) + '">' +
      '<div class="mcoc-acts"><button class="btn ghost small" type="button" data-x>Cancelar</button><button class="btn small" type="button" id="pk-ok">Agregar</button></div>');
    var q = d.querySelector("#pk-q"); setTimeout(function () { q.focus(); q.select(); }, 30);
    d.querySelectorAll("[data-d]").forEach(function (b) { b.onclick = function () { q.value = Math.max(0, num(q.value) + Number(b.getAttribute("data-d"))); }; });
    var ok = function () {
      var c = num(q.value), pr = num(d.querySelector("#pk-p").value); if (!(c > 0)) { q.focus(); return; }
      capturar(main);
      if (ya) { ya.cantidad = r2(Number(ya.cantidad) + c); ya.precio = pr; } else F.lineas.push({ producto_id: p.id, sku: p.sku, nombre: p.nombre, cantidad: c, precio: pr });
      d.remove(); pintarForm(main); var s = main.querySelector("#nf-q"); if (s) s.focus();
    };
    d.querySelector("#pk-ok").onclick = ok;
    d.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); ok(); } if (ev.key === "Escape") d.remove(); });
  }
  function pintarForm(main) { main.innerHTML = formHtml(); wireForm(main); }
  function wireForm(main) {
    var F = K.form, M = K.meta;
    pintaTot(main);
    main.querySelector("#nf-prov").onchange = function () { capturar(main); F.todos = false; pintarForm(main); };
    var iv = main.querySelector("#nf-iva"); if (iv) iv.onchange = function () { F.con_iva = iv.checked; pintaTot(main); };
    var td = main.querySelector("#nf-todos"); if (td) td.onchange = function () { F.todos = td.checked; buscar(); };
    main.querySelectorAll("[data-q],[data-p]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var i = Number(inp.getAttribute("data-q") || inp.getAttribute("data-p")), l = F.lineas[i];
        if (inp.hasAttribute("data-q")) l.cantidad = num(inp.value); else l.precio = num(inp.value);
        var c = main.querySelector('[data-sub="' + i + '"]'); if (c) c.textContent = $m(l.cantidad * l.precio); pintaTot(main);
      });
    });
    main.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { capturar(main); F.lineas.splice(Number(b.getAttribute("data-del")), 1); pintarForm(main); }; });
    var q = main.querySelector("#nf-q"), hits = main.querySelector("#nf-hits"), H = [], sel = 0;
    function buscar() {
      var v = q.value.trim().toLowerCase(), prov = M.proveedores.find(function (p) { return p.id === main.querySelector("#nf-prov").value; });
      var fam = prov && prov.familia && !F.todos ? String(prov.familia).toUpperCase() + "-" : "";
      var base = M.productos.filter(function (p) { return !fam || String(p.sku).toUpperCase().indexOf(fam) === 0; });
      if (!v) { hits.hidden = true; return; }
      var w = v.split(/\s+/);
      H = base.filter(function (p) { var t = (p.sku + " " + p.nombre + " " + (p.marca || "")).toLowerCase(); return w.every(function (x) { return t.indexOf(x) >= 0; }); }).slice(0, 12);
      sel = 0;
      hits.innerHTML = H.map(function (p, i) { return '<div class="mcoc-hit' + (i === sel ? " on" : "") + '" data-h="' + i + '"><span><b>' + e(p.nombre) + '</b> <span class="mcoc-sku">' + e(p.sku) + '</span></span><span class="mcoc-sub">' + $m(p.costo) + "</span></div>"; }).join("") || '<div class="mcoc-hit mcoc-sub">Sin resultados' + (fam ? " en " + e(fam) + " — marca «Ver todos»" : "") + "</div>";
      hits.hidden = false;
    }
    q.addEventListener("input", buscar);
    q.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); sel = Math.max(0, Math.min(H.length - 1, sel + (ev.key === "ArrowDown" ? 1 : -1))); hits.querySelectorAll("[data-h]").forEach(function (x, i) { x.classList.toggle("on", i === sel); }); }
      if (ev.key === "Enter" && H[sel]) { ev.preventDefault(); picker(H[sel], main); }
    });
    hits.addEventListener("click", function (ev) { var h = ev.target.closest("[data-h]"); if (h) picker(H[Number(h.getAttribute("data-h"))], main); });
    var err = main.querySelector("#nf-err");
    main.querySelector("#nf-save").onclick = async function () {
      var b = this; capturar(main); err.textContent = ""; b.disabled = true;
      var L = F.lineas.map(function (l) { return { producto_id: l.producto_id, cantidad: l.cantidad, precio: l.precio }; });
      try {
        if (F.modo === "cot") { var r = await A("cmpb_cot_guardar", { id: F.id || "", proveedor_id: F.proveedor_id, lineas: L, con_iva: F.con_iva !== false, nota: F.nota, numero_prov: F.numero_prov }); toast2("Cotización " + r.numero + " guardada"); go("#/m/compras/cot/" + encodeURIComponent(r.id)); }
        else { var r2_ = await A("cmpb_crear", { proveedor_id: F.proveedor_id, lineas: L, con_iva: F.con_iva !== false, nota: F.nota, fecha_esperada: F.fecha_esperada, cotizacion_id: F.cotizacion_id || "" }); toast2(r2_.numero + " creada"); go("#/m/compras/oc/" + encodeURIComponent(r2_.id)); }
      } catch (x) { b.disabled = false; err.textContent = x.message || x; }
    };
    var bcv = main.querySelector("#nf-conv"); if (bcv) bcv.onclick = async function () {
      if (!confirm("¿Convertir " + F.numero + " en una orden de compra aprobada?")) return;
      try { capturar(main); var r = await A("cmpb_cot_convertir", { id: F.id }); toast2(r.numero + " creada"); go("#/m/compras/oc/" + encodeURIComponent(r.id)); } catch (x) { err.textContent = x.message || x; }
    };
    var ban = main.querySelector("#nf-anular"); if (ban) ban.onclick = async function () {
      if (!confirm("¿Anular " + F.numero + "?")) return;
      try { await A("cmpb_cot_anular", { id: F.id }); toast2("Cotización anulada"); go("#/m/compras/cotizaciones"); } catch (x) { err.textContent = x.message || x; }
    };
    var bpd = main.querySelector("#nf-pdf"); if (bpd) bpd.onclick = function () {
      capturar(main); var prov = M.proveedores.find(function (p) { return p.id === F.proveedor_id; }) || {}, t = totF();
      window.MCDocPdf.ver(F.numero, { nombre: F.numero + " " + (prov.nombre || ""), paginas: [{ titulo: "Cotización de proveedor", numero: F.numero, subt: F.numero_prov ? "Ref. proveedor " + F.numero_prov : "",
        info: [["Proveedor", prov.nombre || ""], ["RUC", prov.ruc || ""], ["Email", prov.email || ""], ["Teléfono", prov.telefono || ""], ["Fecha", f(F.fecha)], ["Estado", "Abierta"]],
        tabla: { cols: [{ t: "#", w: 0.4 }, { t: "SKU", w: 1.1 }, { t: "Producto", w: 3.4 }, { t: "Cant.", w: 0.8, al: "r" }, { t: "Precio", w: 1, al: "r" }, { t: "Subtotal", w: 1.1, al: "r" }], filas: F.lineas.map(function (l, i) { return [i + 1, l.sku, l.nombre, l.cantidad, $m(l.precio), $m(l.cantidad * l.precio)]; }) },
        totales: [["Subtotal", t.sub], ["IVA", t.iva], ["Total", t.tot, true]], notas: [F.nota ? "Nota: " + F.nota : "", "Documento de referencia: no es una orden de compra."].filter(Boolean) }] });
    };
  }
  async function nuevaForm(modo, cotId) {
    var M = await meta();
    K.form = { modo: modo, lineas: [], con_iva: true, proveedor_id: "", nota: "" };
    if (cotId) {
      var r = await A("cmpb_cot_get", { id: cotId }), c = r.cot;
      K.form = { modo: "cot", id: c.id, numero: c.numero, estado: c.estado, fecha: c.fecha, oc_id: c.oc_id, proveedor_id: (c.prov && c.prov.id) || c.proveedor_id || "", con_iva: c.con_iva, nota: c.nota, numero_prov: c.numero_prov,
        lineas: (c.lineas || []).map(function (l) { var p = M.productos.find(function (x) { return x.id === l.producto_id; }) || {}; return { producto_id: l.producto_id, sku: l.sku || p.sku, nombre: l.nombre || p.nombre || l.sku, cantidad: Number(l.cantidad) || 0, precio: Number(l.precio) || 0 }; }) };
    }
    return K.form;
  }
  function cotLeida() {
    var F = K.form;
    return '<div class="mcoc-bar"><button class="btn ghost small" type="button" data-go="#/m/compras/cotizaciones">← Lista</button></div><div class="mccf-card"><div class="mcoc-top"><div><h1>' + e(F.numero) + '</h1></div><div class="mcoc-pills">' + pill(F.estado === "convertida" ? "Convertida" : "Anulada") + "</div></div>" +
      (F.oc_id ? '<p>Se convirtió en la orden <a href="#/m/compras/oc/' + encodeURIComponent(F.oc_id) + '">ver OC</a>.</p>' : "") + "</div>";
  }

  async function cargarLista() { var r = await A("cmpb_lista"); K.items = r.items || []; K.cot = r.cotizaciones || []; K.admin = !!r.admin; }
  async function render(route) {
    css();
    var sub = route.sub || "", id = route.id || "";
    try {
      if (sub === "consignacion" && window.MCConsignacion) { K.tab = "cons"; await cargarLista(); return tabs() + await window.MCConsignacion.render(route); }
      if (sub === "oc" && id) { var r = await A("cmpb_get", { id: id }); K.d = r.oc; K.admin = !!r.admin; return detOc(); }
      if (sub === "nueva") { await nuevaForm("oc"); return formHtml(); }
      if (sub === "nueva-cot") { await nuevaForm("cot"); return formHtml(); }
      if (sub === "cot" && id) {
        if (/^oc:/.test(id)) { { K.form = null; return '<div class="mcoc-bar"><button class="btn ghost small" type="button" data-go="#/m/compras/cotizaciones">← Lista</button></div><div class="mccf-card"><h1>Pre-orden anterior</h1><p>Es un «Borrador» de la versión anterior. Conviértelo en OC (toma el siguiente número del año) o déjalo como está.</p><div class="mcoc-acts"><button class="btn small" type="button" id="pre-conv" data-id="' + e(id) + '">➡️ Convertir a OC</button></div><p class="err" id="pre-err"></p></div>'; } }
        await nuevaForm("cot", id); return K.form.estado === "abierta" ? formHtml() : cotLeida();
      }
      K.tab = sub === "cotizaciones" || sub === "rfq" ? "cot" : "oc";
      await cargarLista();
      return K.tab === "cot" ? listaCot() : listaOc();
    } catch (x) { return '<p class="err">' + e(x.message || x) + '</p><button class="btn ghost small" type="button" data-go="#/m/compras">← Compras</button>'; }
  }
  function render2(main, route) { render(route).then(function (h) { main.innerHTML = h; wire(main, route); }); }
  function wire(main, route) {
    var sub = route.sub || "";
    if (sub === "consignacion" && window.MCConsignacion) { window.MCConsignacion.wire(main, route); return; }
    if (sub === "oc" && K.d) { wireDet(main); return; }
    if ((sub === "nueva" || sub === "nueva-cot" || sub === "cot") && K.form && main.querySelector("#nf-save")) { wireForm(main); return; }
    var pc = main.querySelector("#pre-conv"); if (pc) { pc.onclick = async function () { try { var r = await A("cmpb_cot_convertir", { id: pc.getAttribute("data-id") }); toast2(r.numero + " creada"); go("#/m/compras/oc/" + encodeURIComponent(r.id)); } catch (x) { main.querySelector("#pre-err").textContent = x.message || x; } }; return; }
    if (main.querySelector("#mcoc-q")) wireLista(main);
  }
  window.MCCompras = { render: render, wire: wire, _k: K, _specOc: specOc, _pill: pill, _A: A, _dlg: dlg, _f: f };
})();
