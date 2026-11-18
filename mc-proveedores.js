// 🏭 Ficha del proveedor (TK34, Emilia 18/11): como la ficha de clientes. Datos con cada valor junto a su
// etiqueta (clic para editar, solo admin), «Crear código» único, 🤝 Consignación del proveedor y por producto,
// historial (OC, cotizaciones, recepciones, restocks, actas, pagos), movimientos y notas. Sin scroll horizontal.
(function () {
  var K = { tab: "productos", fh: "", d: null, p: null };
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function $m(v) { return "$" + (Math.round((Number(v) || 0) * 100) / 100).toFixed(2); }
  function f(v) { return v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—"; }
  function t2(m, mal) { if (typeof toast === "function") { try { toast(m, mal ? "#B86B6B" : undefined); return; } catch (x) {} } alert(m); }
  function adm() { return !!(window.state && state.admin && !state.vista); }
  var BASE = [["nombre", "🏷️", "Nombre"], ["familia", "🔤", "Código"], ["ruc", "🧾", "RUC"], ["telefono", "📞", "Teléfono"], ["email", "✉️", "Email"], ["direccion", "📍", "Dirección"], ["notas", "🗒️", "Notas"]];
  var EXTRA = [["contacto", "👤", "Contacto"], ["whatsapp", "💬", "WhatsApp"], ["web", "🌐", "Web"], ["banco", "🏦", "Banco"], ["cuenta", "💳", "Cuenta"], ["plazo", "⏳", "Plazo de pago"], ["horario", "🕒", "Horario de entrega"]];
  var TH = { oc: "🧾 OC", consignacion: "🤝 Consignación", cotizacion: "📨 Cotizaciones", recepcion: "📥 Recepciones", restock: "🔁 Restocks", acta: "📝 Actas", pago: "💳 Pagos" };
  function css() {
    if (document.getElementById("mcpf-css")) return;
    var s = document.createElement("style"); s.id = "mcpf-css";
    s.textContent = [
      ".mcpf{max-width:100%;overflow-x:hidden}.mcpf *{box-sizing:border-box}",
      ".mcpf-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:2px 0 8px}.mcpf-h h2{margin:0;font-size:1.15rem;color:var(--navy-d,#1a2744);overflow-wrap:anywhere}",
      ".mcpf-chip{font-size:.7rem;font-weight:800;border-radius:999px;padding:3px 9px;background:#efeaf8;color:#5d4c96}.mcpf-chip.off{background:#eef1f5;color:#56627a}",
      ".mcpf-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px;margin:8px 0 12px}.mcpf-k div{background:var(--white,#fff);border:1px solid var(--cream-d);border-radius:12px;padding:8px 10px;font-size:.72rem;color:var(--gray)}.mcpf-k b{display:block;font-size:1rem;color:var(--navy-d,#1a2744)}",
      ".mcpf-d{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px 16px;background:var(--white,#fff);border:1px solid var(--cream-d);border-radius:14px;padding:10px 12px;margin-bottom:10px}",
      ".mcpf-i{display:flex;align-items:baseline;gap:6px;min-width:0;font-size:.84rem;padding:3px 0}.mcpf-i .l{flex:0 0 auto;color:var(--gray);font-weight:700;font-size:.76rem}.mcpf-i .v{min-width:0;overflow-wrap:anywhere;color:var(--navy-d,#1a2744);font-weight:600}",
      ".mcpf-i .v.ed{cursor:text;border-radius:6px;padding:1px 5px;margin:-1px -5px}.mcpf-i .v.ed:hover{background:var(--cream);outline:1px dashed var(--cream-d)}.mcpf-i .v.vac{color:#b7b2a8;font-weight:500}",
      ".mcpf-i input,.mcpf-i textarea{flex:1;min-width:0;font:inherit;font-size:.84rem;padding:4px 7px;border:1.5px solid var(--navy,#2b3a67);border-radius:8px}",
      ".mcpf-sw{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#f6f2fc;border:1px solid #ddd3f1;border-radius:14px;padding:10px 12px;margin-bottom:10px}.mcpf-sw b{color:#4b3b84}.mcpf-sw small{display:block;color:var(--gray);font-size:.72rem;margin-top:2px}",
      ".mcpf-tg{position:relative;flex:0 0 auto;width:46px;height:26px;border-radius:999px;border:none;background:#cfd5de;cursor:pointer;transition:background .15s}.mcpf-tg:after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .15s}.mcpf-tg.on{background:#7c6bb0}.mcpf-tg.on:after{left:23px}.mcpf-tg[disabled]{opacity:.45;cursor:not-allowed}",
      ".mcpf-tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1.5px solid var(--cream-d);margin:6px 0 10px}.mcpf-tabs button{border:none;background:none;padding:7px 10px;font:inherit;font-size:.8rem;font-weight:700;color:var(--gray);cursor:pointer;border-bottom:2.5px solid transparent;margin-bottom:-1.5px}.mcpf-tabs button.on{color:var(--navy-d,#1a2744);border-bottom-color:var(--navy,#2b3a67)}",
      ".mcpf-row{display:flex;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid var(--cream-d);min-width:0}.mcpf-row .x{flex:1;min-width:0}.mcpf-row .x b{display:block;font-size:.84rem;color:var(--navy-d,#1a2744);overflow-wrap:anywhere}.mcpf-row .x span{font-size:.72rem;color:var(--gray);overflow-wrap:anywhere}.mcpf-row .m{flex:0 0 auto;font-weight:800;font-size:.82rem;text-align:right}",
      ".mcpf-row.go{cursor:pointer}.mcpf-row.go:hover{background:var(--cream)}.mcpf-f{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px}.mcpf-f button{border:1px solid var(--cream-d);background:#fff;border-radius:999px;padding:3px 9px;font:inherit;font-size:.72rem;cursor:pointer}.mcpf-f button.on{background:var(--navy,#2b3a67);color:#fff;border-color:var(--navy,#2b3a67)}",
      ".mcpf-n textarea{width:100%;min-height:64px;font:inherit;font-size:.84rem;padding:8px;border:1.5px solid var(--cream-d);border-radius:10px}.mcpf-nota{background:#fffaf0;border:1px solid #f0e2c0;border-radius:10px;padding:8px 10px;margin:6px 0;font-size:.82rem;overflow-wrap:anywhere}.mcpf-nota small{display:block;color:var(--gray);font-size:.7rem;margin-bottom:2px}",
      ".mcpf-btn{border:1.5px solid var(--navy,#2b3a67);background:#fff;color:var(--navy,#2b3a67);border-radius:8px;padding:2px 8px;font:inherit;font-size:.74rem;font-weight:800;cursor:pointer}",
      ".mcpf-vacio{color:var(--gray);font-size:.82rem;padding:10px 2px}",
    ].join("");
    document.head.appendChild(s);
  }
  function valor(k) { var p = K.p || {}, d = (K.d && K.d.datos) || {}; return k === "familia" ? (p.codigoPropio != null ? p.codigoPropio : p.codigo) : (p[k] != null ? p[k] : d[k]); }
  function item(x, extra) {
    var k = x[0], v = String(valor(k) == null ? "" : valor(k)), ed = adm() && k !== "familia";
    var val = v ? e(v) : (ed ? "agregar…" : "—");
    var cod = k === "familia" && adm() ? ' <button class="mcpf-btn" type="button" data-mcpf-cod>' + (v ? "Cambiar código" : "＋ Crear código") + "</button>" : "";
    return '<div class="mcpf-i"><span class="l">' + x[1] + " " + e(x[2]) + '</span><span class="v' + (ed ? " ed" : "") + (v ? "" : " vac") + '"' + (ed ? ' data-mcpf-k="' + k + '" data-mcpf-x="' + (extra ? 1 : 0) + '"' : "") + ">" + val + "</span>" + cod + "</div>";
  }
  function datos() { return '<div class="mcpf-d">' + BASE.map(function (x) { return item(x, false); }).join("") + EXTRA.map(function (x) { return item(x, true); }).join("") + "</div>"; }
  function sw() {
    var d = K.d, on = !!d.consignacion, sinCod = !/^[A-Z]{2,3}$/.test(d.codigo || "");
    return '<div class="mcpf-sw"><div><b>🤝 Consignación</b><small>' + (on ? "Sus productos entran a la bodega de consignación y salen en Compras › Consignación. Puedes apagar productos sueltos en 📦 Productos." : "Sus productos se compran con OC normal y entran al inventario normal.") + (sinCod ? " Crea el código del proveedor para activarla." : "") + "</small></div>" +
      '<button type="button" class="mcpf-tg' + (on ? " on" : "") + '" data-mcpf-sw aria-label="Consignación"' + (adm() && !sinCod ? "" : " disabled") + "></button></div>";
  }
  function kpis() {
    var k = K.d.kpis || {};
    return '<div class="mcpf-k"><div>🧾 OCs<b>' + e(k.ocs || 0) + "</b></div><div>💵 Comprado<b>" + $m(k.comprado) + "</b></div><div>💳 Saldo<b>" + $m(k.saldo) + "</b></div><div>📦 Productos<b>" + e(k.productos || 0) + (K.d.consignacion ? ' <small style="font-size:.7rem;color:#7c6bb0">· ' + e(k.enConsig || 0) + " 🤝</small>" : "") + "</b></div><div>📅 Última OC<b>" + f(k.ultima) + "</b></div></div>";
  }
  function tabProductos() {
    var L = K.d.productos || [], on = !!K.d.consignacion;
    if (!L.length) return '<div class="mcpf-vacio">Este proveedor no tiene productos con su código' + (K.d.codigo ? " (" + e(K.d.codigo) + "-…)" : "") + ".</div>";
    return (on ? '<div class="mcpf-vacio" style="padding-top:0">Todos heredan 🤝 del proveedor; apaga el que compres con OC normal.</div>' : "") + L.map(function (x) {
      var dis = !adm() || !on || x.cabina;
      var est = x.cabina ? "Se vende desde Cabina · no va a consignación" : !on ? "Inventario normal (proveedor sin consignación)" : x.consig ? "🤝 Consignación" : "Apagado · OC normal → inventario normal";
      return '<div class="mcpf-row"><div class="x"><b>' + e(x.sku) + " · " + e(x.nombre) + "</b><span>" + e(est) + '</span></div><button type="button" class="mcpf-tg' + (x.consig ? " on" : "") + '" data-mcpf-p="' + e(x.id) + '"' + (dis ? " disabled" : "") + ' aria-label="Consignación ' + e(x.sku) + '"></button></div>';
    }).join("");
  }
  function tabHist() {
    var H = K.d.historial || [], tipos = [];
    H.forEach(function (h) { if (tipos.indexOf(h.tipo) < 0) tipos.push(h.tipo); });
    var fil = '<div class="mcpf-f"><button type="button" data-mcpf-fh=""' + (K.fh ? "" : ' class="on"') + ">Todo (" + H.length + ")</button>" + tipos.map(function (t) { return '<button type="button" data-mcpf-fh="' + t + '"' + (K.fh === t ? ' class="on"' : "") + ">" + e(TH[t] || t) + "</button>"; }).join("") + "</div>";
    var L = H.filter(function (h) { return !K.fh || h.tipo === K.fh; });
    return fil + (L.length ? L.map(function (h) {
      return '<div class="mcpf-row' + (h.go ? ' go" data-go="' + e(h.go) + '"' : '"') + '><div class="x"><b>' + e(h.emo) + " " + e(h.numero || "") + "</b><span>" + f(h.fecha) + (h.estado ? " · " + e(h.estado) : "") + (h.detalle ? " · " + e(h.detalle) : "") + "</span></div>" + (h.total != null ? '<div class="m">' + $m(h.total) + (h.saldo ? '<div style="font-size:.68rem;color:#b2452a">saldo ' + $m(h.saldo) + "</div>" : "") + "</div>" : "") + "</div>";
    }).join("") : '<div class="mcpf-vacio">Sin movimientos de este tipo.</div>');
  }
  function tabMov() {
    var M = K.d.movimientos || [];
    if (!M.length) return '<div class="mcpf-vacio">Sin movimientos de stock de sus productos.</div>';
    return M.map(function (m) {
      var pos = m.delta > 0;
      return '<div class="mcpf-row"><div class="x"><b>' + e(m.sku) + " · " + e(m.bodega || "") + "</b><span>" + f(m.fecha) + " · " + e(m.tipo || m.doc || "") + (m.nota ? " · " + e(m.nota) : "") + '</span></div><div class="m" style="color:' + (pos ? "#2e8b57" : "#b2452a") + '">' + (pos ? "+" : "") + e(m.delta) + "</div></div>";
    }).join("");
  }
  /** TK44: lo que se consumió de su consignación (📦 Abrir producto o pasado a cabina): se le paga a costo en la liquidación. */
  function tabConsumo() {
    var C = K.d.consumos || [];
    var tot = C.reduce(function (a, x) { return a + (x.total || 0); }, 0);
    return '<div class="mcpf-vacio" style="text-align:left">Cada envase de consignación que se abre (📦 Abrir producto) o se pasa a cabina se registra aquí y entra a Compras › Consignación como vendido, a costo. No genera comisión.' + (adm() && C.length ? " Total: <b>" + $m(tot) + "</b>." : "") + "</div>" +
      (C.length ? C.map(function (x) {
        return '<div class="mcpf-row"><div class="x"><b>' + e(x.producto) + "</b><span>" + f(x.fecha) + " · " + e(x.origen) + (x.detalle ? " · " + e(x.detalle) : "") + (x.por ? " · " + e(x.por) : "") + " · periodo " + e(x.periodo) + '</span></div><div class="m">' + (x.cantidad > 0 ? "" : "") + e(x.cantidad) + (x.total != null ? '<div style="font-size:.68rem">' + $m(x.total) + "</div>" : "") + "</div></div>";
      }).join("") : '<div class="mcpf-vacio">Todavía no hay consumo interno de este proveedor.</div>');
  }
  function tabNotas() {
    var N = K.d.notas || [];
    return (adm() ? '<div class="mcpf-n"><textarea id="mcpf-nt" placeholder="🗒️ Nota interna del proveedor (acuerdos, contactos, reclamos…)"></textarea><div style="text-align:right;margin-top:4px"><button class="btn small" type="button" id="mcpf-nb">Guardar nota</button></div></div>' : "") +
      (N.length ? N.map(function (x) { return '<div class="mcpf-nota"><small>' + f(x.fecha) + " · " + e(x.autor || "") + "</small>" + e(x.texto) + "</div>"; }).join("") : '<div class="mcpf-vacio">Sin notas.</div>');
  }
  function tabCambios() {
    var C = K.d.cambios || [];
    return C.length ? C.map(function (x) { return '<div class="mcpf-row"><div class="x"><b>' + e(x.accion) + "</b><span>" + f(x.fecha) + " · " + e(x.actor || "") + "</span></div></div>"; }).join("") : '<div class="mcpf-vacio">Sin cambios registrados.</div>';
  }
  function cuerpo() {
    var T = [["productos", "📦 Productos (" + (K.d.productos || []).length + ")"], ["historial", "🗂️ Historial (" + (K.d.historial || []).length + ")"], ["movimientos", "🔄 Movimientos"]].concat((K.d.consumos || []).length || K.d.consignacion ? [["consumo", "🤝 Consumo interno (" + (K.d.consumos || []).length + ")"]] : []).concat([ ["notas", "🗒️ Notas (" + (K.d.notas || []).length + ")"], ["cambios", "🕓 Cambios"]]);
    var tb = K.tab === "historial" ? tabHist() : K.tab === "movimientos" ? tabMov() : K.tab === "consumo" ? tabConsumo() : K.tab === "notas" ? tabNotas() : K.tab === "cambios" ? tabCambios() : tabProductos();
    return '<div class="mcpf-tabs">' + T.map(function (t) { return '<button type="button" data-mcpf-tab="' + t[0] + '"' + (K.tab === t[0] ? ' class="on"' : "") + ">" + t[1] + "</button>"; }).join("") + "</div>" + tb;
  }
  function pintar(el) {
    var p = K.p, d = K.d;
    el.innerHTML = '<div class="mcpf"><div class="mcpf-h"><h2>🏭 ' + e(d.codigo || p.codigo || "—") + " · " + e(p.nombre || "") + '</h2><span class="mcpf-chip' + (d.consignacion ? "" : " off") + '">' + (d.consignacion ? "🤝 Consignación" : "📦 Inventario normal") + "</span></div>" +
      (d.falta && adm() ? '<div class="mcpf-vacio" style="color:#b2452a">' + e(d.falta) + "</div>" : "") + kpis() + datos() + sw() + '<div id="mcpf-b">' + cuerpo() + "</div></div>";
    wire(el);
  }
  async function cargar(el) {
    var d = await api("prov_ficha", { codigo: (K.p.codigoPropio || K.p.codigo || ""), erpId: K.p.erpId || "" });
    if (!d || d.error) { el.innerHTML = '<p class="note">' + e((d && d.error) || "No se pudo cargar la ficha") + "</p>"; return; }
    K.d = d; pintar(el);
  }
  async function recargarTabla(el) {
    var t = await api("getProveedoresTabla");
    if (t && t.items) { window._provRows = t.items; var np = t.items.find(function (r) { return String(r.fila) === String(K.p.fila); }); if (np) K.p = np; if (typeof pintarProveedores === "function") pintarProveedores(); }
    await cargar(el);
  }
  function editar(span, el) {
    var k = span.getAttribute("data-mcpf-k"), extra = span.getAttribute("data-mcpf-x") === "1";
    var v = String(valor(k) == null ? "" : valor(k));
    var inp = document.createElement(k === "notas" || k === "direccion" ? "textarea" : "input");
    inp.value = v; if (k === "email") inp.type = "email";
    span.replaceWith(inp); inp.focus();
    var hecho = false;
    async function fin(guardar) {
      if (hecho) return; hecho = true;
      var nv = inp.value.trim();
      if (!guardar || nv === v) { pintar(el); return; }
      if (k === "nombre" && !nv) { t2("El nombre es obligatorio", true); pintar(el); return; }
      var r = extra ? await api("prov_dato", { codigo: K.d.codigo, campo: k, valor: nv }) : await api("inline_guardar", { tabla: "proveedores", fila: String(K.p.fila), campos: (function () { var c = {}; c[k] = nv; return c; })() });
      if (r && r.error) { t2(r.error, true); pintar(el); return; }
      t2("✓ Guardado"); await recargarTabla(el);
    }
    inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && inp.tagName === "INPUT") { ev.preventDefault(); fin(true); } if (ev.key === "Escape") fin(false); });
    inp.addEventListener("blur", function () { fin(true); });
  }
  function wire(el) {
    el.querySelectorAll("[data-mcpf-k]").forEach(function (sp) { sp.onclick = function () { editar(sp, el); }; });
    var bc = el.querySelector("[data-mcpf-cod]");
    if (bc) bc.onclick = async function () {
      if (!/^\d+$/.test(String(K.p.fila))) { t2("Este proveedor solo existe en el ERP: agrégalo a la lista de proveedores para darle código", true); return; }
      var sug = await api("prov_codigo_sugerir", { nombre: K.p.nombre });
      var c = prompt("Código propio del proveedor (2 o 3 letras, único). Sus productos se codifican como " + ((sug && sug.codigo) || "XX") + "-001…", (sug && sug.codigo) || "");
      if (c == null) return;
      var r = await api("prov_codigo_crear", { fila: String(K.p.fila), codigo: String(c).trim().toUpperCase() });
      if (r && r.error) { t2(r.error, true); return; }
      t2("✓ Código " + r.codigo + " creado"); K.p.codigoPropio = r.codigo; await recargarTabla(el);
    };
    var s = el.querySelector("[data-mcpf-sw]");
    if (s) s.onclick = async function () {
      var on = !K.d.consignacion;
      if (!on && !confirm("¿Apagar 🤝 Consignación para " + (K.p.nombre || "") + "?\nSus productos se comprarán con OC normal y entrarán al inventario normal. El stock que ya está en consignación no se mueve.")) return;
      s.disabled = true;
      var r = await api("prov_consig", { codigo: K.d.codigo, on: on });
      if (r && r.error) { t2(r.error, true); s.disabled = false; return; }
      t2(on ? "🤝 Consignación activada" : "Consignación apagada"); await cargar(el);
    };
    var b = el.querySelector("#mcpf-b"); if (!b) return;
    b.querySelectorAll("[data-mcpf-tab]").forEach(function (x) { x.onclick = function () { K.tab = x.getAttribute("data-mcpf-tab"); b.innerHTML = cuerpo(); wire(el); }; });
    b.querySelectorAll("[data-mcpf-fh]").forEach(function (x) { x.onclick = function () { K.fh = x.getAttribute("data-mcpf-fh"); b.innerHTML = cuerpo(); wire(el); }; });
    b.querySelectorAll("[data-go]").forEach(function (x) { x.onclick = function () { if (typeof go === "function") go(x.getAttribute("data-go")); }; });
    b.querySelectorAll("[data-mcpf-p]").forEach(function (x) {
      x.onclick = async function () {
        var id = x.getAttribute("data-mcpf-p"), pr = (K.d.productos || []).find(function (q) { return q.id === id; }); if (!pr) return;
        x.disabled = true;
        var r = await api("prov_prod_consig", { producto_id: id, on: !pr.consig });
        if (r && r.error) { t2(r.error, true); x.disabled = false; return; }
        t2(pr.consig ? pr.sku + ": OC normal → inventario normal" : pr.sku + ": 🤝 consignación"); await cargar(el);
      };
    });
    var nb = b.querySelector("#mcpf-nb");
    if (nb) nb.onclick = async function () {
      var t = (b.querySelector("#mcpf-nt") || {}).value || "";
      if (!t.trim()) return;
      nb.disabled = true;
      var r = await api("prov_nota", { codigo: K.d.codigo, texto: t });
      if (r && r.error) { t2(r.error, true); nb.disabled = false; return; }
      t2("🗒️ Nota guardada"); await cargar(el);
    };
  }
  window.MCProveedores = {
    montar: function (el, p) { if (!el || !p) return; css(); if (!K.p || K.p.fila !== p.fila) { K.tab = "productos"; K.fh = ""; } K.p = p; el.innerHTML = '<p class="note">Cargando ficha…</p>'; cargar(el); },
  };
})();
