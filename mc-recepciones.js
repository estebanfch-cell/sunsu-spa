// 📥 Recepciones (TK25, Emilia 17/11): para quien solo recibe. Lista de OC por recibir y, por producto,
// pedido · recibido (cantidad) · Recibido / No recibido. Recibido mete el stock a su bodega; No recibido
// anula lo pendiente (se puede deshacer por 1 hora). Las líneas repetidas del mismo producto van juntas.
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function f(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : (ymd || ""); }
  function hm(iso) { try { return new Date(iso).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", timeZone: "America/Guayaquil" }); } catch (x) { return ""; } }
  function fh(iso) { try { return new Date(iso).toLocaleString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Guayaquil" }); } catch (x) { return String(iso || ""); } }
  function toast2(msg, bad) { if (typeof toast === "function") toast(msg, bad ? "var(--red, #c0392b)" : "var(--green)"); }
  function num(v) { var x = Number(String(v == null ? "" : v).replace(",", ".")); return isFinite(x) ? x : 0; }
  var K = { items: [], d: null, sel: {} };
  var COL = { "Por recibir": "#3E7CB1", "Recibida parcial": "#C98A00", "Recibida": "#2E8B57", "Cancelada": "#C0392B", consignacion: "#7C6BB0", propio: "#56627A", vendible: "#2E8B57", insumo: "#3E7CB1" };
  var TXT = { consignacion: "Consignación", propio: "Propio", vendible: "Vendible", insumo: "Insumo cabina" };
  function pill(t, c) { var col = COL[c || t] || "#8A93A6"; return '<span class="tk-pill" style="color:' + col + ";border-color:" + col + '">' + e(TXT[t] || t) + "</span>"; }
  function css() {
    if (window.MCConteo && window.MCConteo._css) window.MCConteo._css();
    if (document.getElementById("mcrc-css")) return;
    var s = document.createElement("style"); s.id = "mcrc-css";
    s.textContent = [
      ".mcrc-t{width:100%;border-collapse:collapse;font-size:.85rem}.mcrc-t th{font-size:.64rem;text-transform:uppercase;letter-spacing:.04em;color:var(--gray,#8a93a6);text-align:left;padding:7px 8px;border-bottom:1px solid var(--cream-d,#e6dccb)}.mcrc-t td{padding:9px 8px;border-bottom:1px solid #f0ece4;vertical-align:middle}.mcrc-t .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}",
      ".mcrc-t tr.ok td{background:#eef8f1}.mcrc-t tr.no td{background:#fdf0ee}.mcrc-t tr.listo td{opacity:.6}",
      ".mcrc-pn{font-weight:700;color:var(--navy-d,#2b3f5c)}.mcrc-sku{color:var(--gray,#8a93a6);font-size:.7rem}.mcrc-chips{display:flex;gap:4px;flex-wrap:wrap;margin-top:3px}.mcrc-chips select{width:auto!important;min-width:0!important;font:inherit;font-size:.68rem;padding:1px 4px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:999px;color:var(--navy-d,#2b3f5c);background:#fff}",
      ".mcrc-q{width:76px;padding:7px 8px;text-align:center;border:1.5px solid var(--cream-d,#e6dccb);border-radius:8px;font:inherit;font-weight:700;-moz-appearance:textfield;appearance:textfield}.mcrc-q::-webkit-outer-spin-button,.mcrc-q::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.mcrc-b{padding:6px 6px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:8px;font:inherit;font-size:.78rem;max-width:130px}",
      ".mcrc-ac{display:flex;gap:4px}.mcrc-ac button{border:1.5px solid var(--cream-d,#e6dccb);background:#fff;border-radius:8px;padding:6px 9px;font:inherit;font-size:.74rem;font-weight:800;cursor:pointer;white-space:nowrap;color:var(--navy-d,#2b3f5c)}.mcrc-ac button.on.r{background:#2E8B57;border-color:#2E8B57;color:#fff}.mcrc-ac button.on.n{background:#C0392B;border-color:#C0392B;color:#fff}",
      ".mcrc-nota{font-size:.7rem;color:#7C6BB0;margin-top:3px}.mcrc-undo{border:none;background:none;color:var(--navy,#3d5a7a);font:inherit;font-size:.72rem;font-weight:700;text-decoration:underline;cursor:pointer;padding:0;margin-top:3px}",
      ".mcrc-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}.mcrc-top h1{margin:0;font-size:1.5rem;color:var(--navy-d,#2b3f5c)}.mcrc-prov{font-weight:700;color:var(--navy-d,#2b3f5c)}",
      ".mcrc-acts{display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:12px;flex-wrap:wrap}.mcrc-log{list-style:none;margin:6px 0 0;padding:0;font-size:.82rem}.mcrc-log li{padding:5px 0;border-top:1px solid #f0ece4}",
    ].join("\n");
    document.head.appendChild(s);
  }
  async function A(act, p) { var r = await api(act, p || {}); if (!r || r.error) throw new Error((r && r.error) || "No se pudo completar"); return r; }

  function listaHtml() {
    var rows = K.items.map(function (o) {
      return '<tr class="tk-row" data-oc="' + e(o.id) + '"><td class="mcoc-num" style="font-weight:800">' + e(o.numero) + (o.tipo === "restock" ? " " + pill("Restock", "consignacion") : "") + "</td><td>" + e(o.proveedor || "—") + "</td><td>" + e(f(o.fecha)) + "</td><td>" + e(f(o.fecha_esperada) || "—") + '</td><td class="num">' + e(o.productos) + '</td><td class="num">' + e(o.pendiente) + "</td><td>" + pill(o.estado) + "</td></tr>";
    }).join("") || '<tr><td colspan="7" class="mccf-sub">No hay nada por recibir 🎉</td></tr>';
    return '<div class="sheet-scroll"><table class="tk-table nowrap-table"><thead><tr><th>Orden</th><th>Proveedor</th><th>Fecha</th><th>Esperada</th><th class="num">Productos</th><th class="num">Unid. pendientes</th><th>Estado</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<p class="note">Elige la orden que llegó. Por cada producto marca Recibido (con la cantidad que llegó) o No recibido.</p>';
  }
  function bodSel(g) {
    var B = K.d.bodegas || [];
    var ok = B.filter(function (b) { return g.uso === "insumo" ? b.tipo !== "venta" : (b.tipo === "venta" || b.tipo === "casa"); });
    return '<select class="mcrc-b" data-b="' + e(g.producto_id) + '">' + ok.map(function (b) { return '<option value="' + e(b.id) + '"' + (b.id === g.bodega_id ? " selected" : "") + ">" + e(b.nombre) + "</option>"; }).join("") + "</select>";
  }
  function detHtml() {
    var d = K.d, o = d.oc;
    var filas = d.grupos.map(function (g) {
      var s = K.sel[g.producto_id] || {}, listo = g.pendiente <= 0, bloq = !!d.bloqueado;
      var chips = d.admin
        ? '<div class="mcrc-chips"><select data-origen="' + e(g.producto_id) + '" title="Origen"><option value="consignacion"' + (g.origen === "consignacion" ? " selected" : "") + '>Consignación</option><option value="propio"' + (g.origen === "propio" ? " selected" : "") + '>Propio</option></select><select data-uso="' + e(g.producto_id) + '" title="Uso"><option value="vendible"' + (g.uso === "vendible" ? " selected" : "") + '>Vendible</option><option value="insumo"' + (g.uso === "insumo" ? " selected" : "") + ">Insumo cabina</option></select></div>"
        : '<div class="mcrc-chips">' + pill(g.origen) + pill(g.uso) + "</div>";
      return '<tr class="' + (listo ? "listo" : s.accion === "recibido" ? "ok" : s.accion === "no_recibido" ? "no" : "") + '" data-g="' + e(g.producto_id) + '"><td><div class="mcrc-pn">' + e(g.nombre || g.sku) + '</div><div class="mcrc-sku">' + e(g.sku) + (g.lineas.length > 1 ? " · " + g.lineas.length + " líneas juntas" : "") + "</div>" + chips +
        (g.consigEnEspera && !listo ? '<div class="mcrc-nota">Consignación: entra aquí mientras se decide la bodega de consignación</div>' : "") +
        (g.deshacer > 0 ? '<button type="button" class="mcrc-undo" data-undo="' + e(g.producto_id) + '">↶ Deshacer «No recibido» (' + e(g.deshacer) + ") — hasta las " + e(hm(g.deshacerHasta)) + "</button>" : "") + "</td>" +
        '<td class="num">' + e(g.pedido) + '</td><td class="num">' + e(g.recibido) + (g.no_recibido ? '<div class="mcrc-sku">no recibido ' + e(g.no_recibido) + "</div>" : "") + '</td><td class="num"><b>' + e(g.pendiente) + "</b></td>" +
        (bloq ? '<td colspan="3" class="mccf-sub">En espera</td>' : listo ? '<td colspan="3" class="mccf-sub">Listo</td>' :
          '<td><input class="mcrc-q" data-q="' + e(g.producto_id) + '" type="text" inputmode="decimal" value="' + e(s.cantidad != null ? s.cantidad : g.pendiente) + '"' + (s.accion === "no_recibido" ? " disabled" : "") + "></td><td>" + bodSel(g) + '</td><td><div class="mcrc-ac"><button type="button" class="r' + (s.accion === "recibido" ? " on" : "") + '" data-ac="recibido" data-p="' + e(g.producto_id) + '">✓ Recibido</button><button type="button" class="n' + (s.accion === "no_recibido" ? " on" : "") + '" data-ac="no_recibido" data-p="' + e(g.producto_id) + '">✗ No recibido</button></div></td>') + "</tr>";
    }).join("");
    var recs = (d.recepciones || []).map(function (r) { return "<li><b>" + e(r.numero) + "</b> · " + e(fh(r.fecha)) + (r.por ? " · " + e(r.por) : "") + (r.anulada ? " · deshecha" : "") + "</li>"; }).join("");
    var marcados = Object.keys(K.sel).filter(function (k) { return K.sel[k].accion; }).length;
    return '<div class="mcoc-bar" style="display:flex;gap:6px;margin-bottom:10px"><button class="btn ghost small" type="button" data-go="#/m/recepciones">← Por recibir</button></div>' +
      '<div class="mccf-card"><div class="mcrc-top"><div><h1>' + e(o.numero) + '</h1><div class="mcrc-prov">' + e(o.proveedor) + '</div><div class="mccf-sub">Fecha ' + e(f(o.fecha)) + (o.fecha_esperada ? " · esperada " + e(f(o.fecha_esperada)) : "") + "</div></div><div>" + pill(o.estado) + "</div></div></div>" +
      (d.bloqueado ? '<div class="mcoc-aviso" style="background:#f1edf8;border-radius:10px;padding:10px 12px;margin:0 0 10px;color:#4b3f72;font-size:.84rem">⏸️ ' + e(d.bloqueado) + "</div>" : "") +
      '<div class="mccf-card"><div class="sheet-scroll"><table class="mcrc-t"><thead><tr><th>Producto</th><th class="num">Pedido</th><th class="num">Ya recibido</th><th class="num">Pendiente</th><th>Llegó</th><th>Bodega</th><th></th></tr></thead><tbody>' + filas + "</tbody></table></div>" +
      '<p class="err" id="rc-err"></p><div class="mcrc-acts"><span class="mccf-sub" id="rc-cuenta">' + (marcados ? marcados + " producto(s) marcados" : "Marca cada producto") + '</span>' + (d.bloqueado ? "" : '<button class="btn small" type="button" id="rc-ok"' + (marcados ? "" : " disabled") + ">Confirmar recepción</button>") + "</div></div>" +
      '<div class="mccf-card"><b>Recepciones de esta orden</b>' + (recs ? '<ul class="mcrc-log">' + recs + "</ul>" : '<p class="mccf-sub">Todavía ninguna</p>') + "</div>";
  }
  function pintar(main) { main.innerHTML = detHtml(); wireDet(main); }
  function wireDet(main) {
    var d = K.d;
    main.querySelectorAll("[data-q]").forEach(function (i) { i.addEventListener("input", function () { var k = i.getAttribute("data-q"); K.sel[k] = K.sel[k] || {}; K.sel[k].cantidad = i.value; if (!K.sel[k].accion && num(i.value) > 0) { K.sel[k].accion = "recibido"; pintar(main); var j = main.querySelector('[data-q="' + k + '"]'); if (j) { j.focus(); j.setSelectionRange(j.value.length, j.value.length); } } }); });
    main.querySelectorAll("[data-b]").forEach(function (b) { b.onchange = function () { var k = b.getAttribute("data-b"); K.sel[k] = K.sel[k] || {}; K.sel[k].bodega_id = b.value; }; });
    main.querySelectorAll("[data-ac]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-p"), a = b.getAttribute("data-ac"); K.sel[k] = K.sel[k] || {}; var q = main.querySelector('[data-q="' + k + '"]'); if (q) K.sel[k].cantidad = q.value; K.sel[k].accion = K.sel[k].accion === a ? "" : a; pintar(main); }; });
    main.querySelectorAll("[data-undo]").forEach(function (b) { b.onclick = async function () { try { await A("rcp_no_recibido_undo", { oc_id: d.oc.id, producto_id: b.getAttribute("data-undo") }); toast2("Deshecho: vuelve a quedar pendiente"); await cargar(d.oc.id); pintar(main); } catch (x) { toast2(x.message || x, true); } }; });
    main.querySelectorAll("[data-origen],[data-uso]").forEach(function (s) { s.onchange = async function () { var p = {}; if (s.hasAttribute("data-origen")) { p.producto_id = s.getAttribute("data-origen"); p.origen = s.value; } else { p.producto_id = s.getAttribute("data-uso"); p.uso = s.value; } try { await A("rcp_producto_attr", p); toast2("Producto actualizado"); await cargar(d.oc.id); pintar(main); } catch (x) { toast2(x.message || x, true); } }; });
    var ok = main.querySelector("#rc-ok"); if (ok) ok.onclick = async function () {
      var G = [];
      d.grupos.forEach(function (g) {
        var s = K.sel[g.producto_id]; if (!s || !s.accion) return;
        var bsel = main.querySelector('[data-b="' + g.producto_id + '"]');
        G.push({ producto_id: g.producto_id, accion: s.accion, cantidad: s.accion === "recibido" ? num(s.cantidad != null ? s.cantidad : g.pendiente) : 0, bodega_id: (bsel && bsel.value) || g.bodega_id });
      });
      var no = G.filter(function (x) { return x.accion === "no_recibido"; }).length;
      if (no && !confirm(no + " producto(s) quedarán como No recibido (lo pendiente se anula). Se puede deshacer durante 1 hora. ¿Seguir?")) return;
      ok.disabled = true;
      try { var r = await A("rcp_recibir", { oc_id: d.oc.id, grupos: G }); toast2((r.recepcion ? "Recepción " + r.recepcion + " registrada" : "Listo") + (r.acta ? " · acta " + r.acta + " en la OC" : "")); K.sel = {}; await cargar(d.oc.id); pintar(main); if (window.MCRecepciones && window.MCRecepciones.trasRecibir) window.MCRecepciones.trasRecibir(main, d, r); }
      catch (x) { ok.disabled = false; main.querySelector("#rc-err").textContent = x.message || x; }
    };
  }
  async function cargar(id) { K.d = await A("rcp_get", { id: id }); }
  async function render(route) {
    css();
    try {
      var sub = route.sub ? decodeURIComponent(route.sub) : "";
      if (sub) { if (!K.d || K.d.oc.id !== sub) K.sel = {}; await cargar(sub); return detHtml(); }
      K.items = (await A("rcp_lista")).items || []; return listaHtml();
    } catch (x) { return '<p class="err">' + e(x.message || x) + '</p><button class="btn ghost small" type="button" data-go="#/m/recepciones">← Recepciones</button>'; }
  }
  function wire(main, route) {
    if (route.sub && K.d) { wireDet(main); return; }
    main.addEventListener("click", function (ev) { var tr = ev.target.closest && ev.target.closest("tr[data-oc]"); if (tr) go("#/m/recepciones/" + encodeURIComponent(tr.getAttribute("data-oc"))); });
  }
  window.MCRecepciones = { render: render, wire: wire, _k: K };
})();
