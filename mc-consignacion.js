// 🤝 Consignación dentro de Compras (TK26, Emilia 17/11): periodo 1–15 / 16–fin (por defecto el anterior),
// lo vendido → OC de consignación del periodo, pedido de restock (cantidad que pone el admin) y un solo PDF
// de 3 páginas: OC · Pedido de restock · Stock actual en consignación (referencial, sin bodega propia aún).
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $m(v) { return "$" + (Math.round((Number(v) || 0) * 100) / 100).toFixed(2); }
  function f(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : (ymd || ""); }
  function num(v) { var x = Number(String(v == null ? "" : v).replace(",", ".")); return isFinite(x) ? x : 0; }
  function toast2(msg, bad) { if (typeof toast === "function") toast(msg, bad ? "var(--red, #c0392b)" : "var(--green)"); }
  var K = { meta: null, prov: "", per: "", c: null, rq: {} };
  async function A(act, p) { var r = await api(act, p || {}); if (!r || r.error) throw new Error((r && r.error) || "No se pudo completar"); return r; }
  function per() { return (K.meta.periodos || []).find(function (x) { return x.clave === K.per; }) || {}; }
  function sel() {
    var M = K.meta;
    return '<div class="mccf-card"><div class="mcoc-form"><div><label>Proveedor en consignación</label><select class="mcoc-in" id="cn-prov"><option value="">Elige…</option>' + M.proveedores.map(function (p) { return '<option value="' + e(p.id) + '"' + (p.id === K.prov ? " selected" : "") + ">" + e(p.nombre) + " (" + e(p.familia) + "-)</option>"; }).join("") + "</select></div>" +
      '<div><label>Periodo</label><select class="mcoc-in" id="cn-per">' + M.periodos.map(function (p) { return '<option value="' + e(p.clave) + '"' + (p.clave === K.per ? " selected" : "") + ">" + e(p.label) + (p.actual ? " (en curso)" : p.defecto ? " (anterior)" : "") + "</option>"; }).join("") + "</select></div></div></div>";
  }
  function calcHtml() {
    var c = K.c; if (!c) return K.prov ? '<p class="mccf-sub">Calculando…</p>' : '<p class="note">Elige el proveedor y el periodo.</p>';
    var fact = c.fact || [];
    var tf = fact.map(function (it) { return "<tr><td>" + e(it.sku) + "</td><td>" + e(it.nombre) + '</td><td class="num">' + e(it.vendido) + '</td><td class="num">' + e(it.consumido || 0) + '</td><td class="num">' + $m(it.compra) + '</td><td class="num">' + $m(it.subtotal) + "</td></tr>"; }).join("") || '<tr><td colspan="6" class="mccf-sub">Sin ventas de productos en consignación en este periodo</td></tr>';
    var stk = {}; (c.stock || []).forEach(function (s) { stk[s.producto_id] = s; });
    var rq = c.restock && c.restock.lineas ? c.restock.lineas.reduce(function (a, l) { a[l.producto_id] = l.cantidad; return a; }, {}) : null;
    var filasR = (c.items || []).filter(function (it) { return it.producto_id; }).map(function (it) {
      var v = K.rq[it.producto_id] != null ? K.rq[it.producto_id] : rq ? (rq[it.producto_id] || "") : (it.sugerido || "");
      var s = stk[it.producto_id] || {};
      return "<tr><td>" + e(it.sku) + "</td><td>" + e(it.nombre) + '</td><td class="num">' + e(s.total != null ? s.total : it.stock) + '</td><td class="num">' + e(Number(it.vendido || 0) + Number(it.consumido || 0)) + '</td><td class="num">' + e(it.sugerido || 0) + '</td><td class="num"><input class="mcoc-in q" data-rq="' + e(it.producto_id) + '" type="text" inputmode="decimal" value="' + e(v) + '"></td></tr>';
    }).join("");
    var restAb = !c.restock || c.restock.estado === "abierta";
    return '<div class="mccf-card"><div class="mcoc-top"><div><b>1 · Vendido en consignación</b><div class="mccf-sub">' + e(c.proveedor.nombre) + " · " + e(c.label) + " (" + e(f(c.desde)) + " → " + e(f(c.hasta)) + ')</div></div><div class="mcoc-pills">' + (c.oc ? '<a class="btn ghost small" href="#/m/compras/oc/' + encodeURIComponent(c.oc.id) + '">' + e(c.oc.numero) + " →</a>" : "") + "</div></div>" +
      '<div class="sheet-scroll" style="margin-top:8px"><table class="mcoc-t"><thead><tr><th>SKU</th><th>Producto</th><th class="num">Vendido</th><th class="num">Pasado a cabina</th><th class="num">Precio compra</th><th class="num">Subtotal</th></tr></thead><tbody>' + tf + "</tbody></table></div>" +
      '<div class="mcoc-foot"><dl class="mcoc-tot"><dt>Subtotal</dt><dd>' + $m(c.totales.subtotal) + "</dd><dt>IVA</dt><dd>" + $m(c.totales.iva) + '</dd><dt class="big">Total</dt><dd class="big">' + $m(c.totales.total) + "</dd></dl></div>" +
      '<div class="mcoc-acts">' + (c.oc ? '<span class="mccf-sub">OC del periodo: ' + e(c.oc.numero) + "</span>" : '<button class="btn small" type="button" id="cn-oc"' + (fact.length ? "" : " disabled") + ">Crear OC de consignación</button>") + "</div></div>" +
      '<div class="mccf-card"><div class="mcoc-top"><div><b>2 · Pedido de restock</b><div class="mccf-sub">Pon cuánto pedir de cada producto. ' + (c.restock ? e(c.restock.numero) + " · " + e(c.restock.estado) : "Sin guardar") + "</div></div></div>" +
      '<div class="sheet-scroll" style="margin-top:8px"><table class="mcoc-t"><thead><tr><th>SKU</th><th>Producto</th><th class="num">Stock actual</th><th class="num">Vendido</th><th class="num">Sugerido</th><th class="num">Restock</th></tr></thead><tbody>' + filasR + "</tbody></table></div>" +
      '<p class="err" id="cn-err"></p><div class="mcoc-acts">' + (c.restock && restAb ? '<button class="btn ghost small mcoc-cancel" type="button" id="cn-ranular">Anular pedido</button>' : "") + (restAb ? '<button class="btn small" type="button" id="cn-rsave">' + (c.restock ? "Actualizar pedido" : "Guardar pedido de restock") + "</button>" : "") + "</div>" +
      '<p class="mcoc-sub" style="margin-top:6px">El pedido aparece en 📥 Recepciones. Recibirlo a la bodega de consignación está en espera (decisión de Emilia).</p></div>' +
      '<div class="mccf-card"><div class="mcoc-top"><div><b>3 · Stock actual en consignación</b><div class="mccf-sub">' + e(c.stockNota) + '</div></div><div class="mcoc-pills"><button class="btn small" type="button" id="cn-pdf">📄 PDF (3 páginas)</button></div></div>' +
      '<div class="sheet-scroll" style="margin-top:8px"><table class="mcoc-t"><thead><tr><th>SKU</th><th>Producto</th><th class="num">Venta</th><th class="num">Cabinas</th><th class="num">Casa</th><th class="num">Total</th></tr></thead><tbody>' +
      ((c.stock || []).map(function (s) { return "<tr><td>" + e(s.sku) + "</td><td>" + e(s.nombre) + '</td><td class="num">' + e(s.venta) + '</td><td class="num">' + e(s.cabina) + '</td><td class="num">' + e(s.casa) + '</td><td class="num"><b>' + e(s.total) + "</b></td></tr>"; }).join("") || '<tr><td colspan="6" class="mccf-sub">Sin productos</td></tr>') + "</tbody></table></div></div>" +
      (c.historial && c.historial.length ? '<div class="mccf-card"><b>OC de consignación anteriores</b><ul class="mcoc-log">' + c.historial.map(function (h) { return '<li><a href="#/m/compras/oc/' + encodeURIComponent(h.id) + '">' + e(h.numero) + "</a> · " + e(f(h.desde)) + " → " + e(f(h.hasta)) + " · " + $m(h.total) + "</li>"; }).join("") + "</ul></div>" : "");
  }
  function html() { return sel() + '<div id="cn-res">' + calcHtml() + "</div>"; }
  async function calcular(main) {
    K.c = null; K.rq = {}; var box = main.querySelector("#cn-res"); if (box) box.innerHTML = calcHtml();
    if (!K.prov) return;
    var p = per();
    try { K.c = await A("cns_calc", { proveedor_id: K.prov, anio: p.anio, mes: p.mes, quincena: p.quincena }); } catch (x) { if (box) box.innerHTML = '<p class="err">' + e(x.message || x) + "</p>"; return; }
    if (box) { box.innerHTML = calcHtml(); wireRes(main); }
  }
  function lineasRestock(main) {
    var L = [];
    main.querySelectorAll("[data-rq]").forEach(function (i) { var q = num(i.value); if (q > 0) L.push({ producto_id: i.getAttribute("data-rq"), cantidad: q }); });
    return L;
  }
  function pdfSpec(c, oc, lineasR) {
    var P = c.proveedor;
    var info = [["Proveedor", P.nombre], ["RUC", P.ruc || ""], ["Email", P.email || ""], ["Teléfono", P.telefono || ""], ["Periodo", c.label], ["Del", f(c.desde) + " al " + f(c.hasta)]];
    var nombres = {}; (c.items || []).forEach(function (it) { nombres[it.producto_id] = it; });
    var p1 = oc ? window.MCCompras._specOc(oc).paginas[0] : {
      titulo: "Orden de compra", numero: "(sin crear)", info: info,
      tabla: { cols: [{ t: "#", w: 0.4 }, { t: "SKU", w: 1.1 }, { t: "Producto", w: 3.4 }, { t: "Cant.", w: 0.8, al: "r" }, { t: "Precio", w: 1, al: "r" }, { t: "Subtotal", w: 1.1, al: "r" }], filas: (c.fact || []).map(function (it, i) { return [i + 1, it.sku, it.nombre, Number(it.vendido || 0) + Number(it.consumido || 0), $m(it.compra), $m(it.subtotal)]; }) },
      totales: [["Subtotal", c.totales.subtotal], ["IVA", c.totales.iva], ["Total", c.totales.total, true]],
    };
    p1.aviso = "Vendido en consignación — periodo " + c.label + " (" + f(c.desde) + " al " + f(c.hasta) + "). Factúrese lo vendido en el periodo.";
    var p2 = { titulo: "Pedido de restock", numero: (c.restock && c.restock.numero) || "(sin guardar)", subt: "Consignación · " + c.label, info: info,
      tabla: { cols: [{ t: "#", w: 0.4 }, { t: "SKU", w: 1.2 }, { t: "Producto", w: 4 }, { t: "Cantidad", w: 1, al: "r" }], filas: lineasR.map(function (l, i) { var it = nombres[l.producto_id] || {}; return [i + 1, it.sku || l.sku || "", it.nombre || l.nombre || "", l.cantidad]; }), vacio: "Sin productos para reponer" },
      notas: ["Productos entregados en modalidad de consignación."] };
    var p3 = { titulo: "Stock actual en consignación", numero: "al " + f(new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)), subt: P.nombre, info: [["Proveedor", P.nombre], ["Periodo", c.label]],
      aviso: "Referencial: stock actual de los productos en consignación en Venta, Cabinas y Casa.",
      tabla: { cols: [{ t: "SKU", w: 1.2 }, { t: "Producto", w: 4 }, { t: "Unidades", w: 1, al: "r" }], filas: (c.stock || []).map(function (s) { return [s.sku, s.nombre, s.total]; }) } };
    return { nombre: "Consignación " + P.nombre + " " + c.label, paginas: [p1, p2, p3] };
  }
  function wireRes(main) {
    var c = K.c; if (!c) return;
    main.querySelectorAll("[data-rq]").forEach(function (i) { i.addEventListener("input", function () { K.rq[i.getAttribute("data-rq")] = i.value; }); });
    var err = main.querySelector("#cn-err");
    var bo = main.querySelector("#cn-oc"); if (bo) bo.onclick = async function () {
      var p = per(); if (!confirm("¿Crear la OC de consignación de " + c.label + " por " + $m(c.totales.total) + "?")) return; bo.disabled = true;
      try { var r = await A("cns_crear_oc", { proveedor_id: K.prov, anio: p.anio, mes: p.mes, quincena: p.quincena }); toast2(r.numero + " creada"); await calcular(main); } catch (x) { bo.disabled = false; toast2(x.message || x, true); }
    };
    var bs = main.querySelector("#cn-rsave"); if (bs) bs.onclick = async function () {
      bs.disabled = true;
      try { var r = await A("cns_restock_guardar", { id: c.restock ? c.restock.id : "", proveedor_id: K.prov, desde: c.desde, hasta: c.hasta, lineas: lineasRestock(main) }); toast2("Pedido " + r.numero + " guardado"); await calcular(main); } catch (x) { bs.disabled = false; err.textContent = x.message || x; }
    };
    var ba = main.querySelector("#cn-ranular"); if (ba) ba.onclick = async function () { if (!confirm("¿Anular " + c.restock.numero + "?")) return; try { await A("cns_restock_anular", { id: c.restock.id }); toast2("Pedido anulado"); await calcular(main); } catch (x) { err.textContent = x.message || x; } };
    var bp = main.querySelector("#cn-pdf"); if (bp) bp.onclick = async function () {
      try {
        var oc = c.oc ? (await A("cmpb_get", { id: c.oc.id })).oc : null;
        if (oc) { oc.desde = c.desde; oc.hasta = c.hasta; oc.periodo = c.label; }
        var LR = lineasRestock(main);
        window.MCDocPdf.ver("Consignación " + c.label, pdfSpec(c, oc, LR));
      } catch (x) { toast2(x.message || x, true); }
    };
  }
  async function render() {
    try {
      if (!K.meta) K.meta = await A("cns_meta");
      if (!K.per) { var d = K.meta.periodos.find(function (p) { return p.defecto; }); K.per = d ? d.clave : ""; }
      return html();
    } catch (x) { return '<p class="err">' + e(x.message || x) + "</p>"; }
  }
  function wire(main) {
    var sp = main.querySelector("#cn-prov"), pp = main.querySelector("#cn-per");
    if (sp) sp.onchange = function () { K.prov = sp.value; calcular(main); };
    if (pp) pp.onchange = function () { K.per = pp.value; calcular(main); };
    if (K.prov) calcular(main);
  }
  window.MCConsignacion = { render: render, wire: wire, _k: K, _spec: pdfSpec };
})();
