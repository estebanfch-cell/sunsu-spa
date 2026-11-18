// 🏷️ Promociones (Emilia 17/11). Módulo admin: una promo (ej. «Black Friday») con vigencia y varias reglas
// (−%, −$, precio especial, N×M; por códigos, marca, categoría, tipo, combo o todo; mínimo de unidades).
// Y el panel «🏷️ Promociones» del ticket: dice cuáles aplican, se eligen, y se aplican como descuento por línea.
// Las promos del sistema viejo (hoja 🎉 PROMOS) se ven aquí y se pueden importar; la hoja no se escribe.
(function () {
  "use strict";
  function e(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $m(v) { return "$" + (Math.round((Number(v) || 0) * 100) / 100).toFixed(2); }
  function f(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : (ymd || ""); }
  function toast2(msg, bad) { if (typeof toast === "function") toast(msg, bad ? "#B86B6B" : "var(--green)"); }
  function hoy() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  var K = { d: null, edit: null, cat: null };
  var TIPOS = [["pct", "− %"], ["monto", "− $"], ["precio", "Precio especial"], ["nxm", "Lleva N paga M"]];
  var ALC = [["codigos", "Productos / servicios"], ["combo", "Combo (todos juntos)"], ["marca", "Marca"], ["categoria", "Categoría"], ["tipo", "Tipo de línea"], ["todo", "Todo el ticket"]];
  function css() {
    if (document.getElementById("mcpm-css")) return;
    var s = document.createElement("style"); s.id = "mcpm-css";
    s.textContent = [
      ".mcpm h2{margin:0 0 8px;font-size:1.2rem}.mcpm-h{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.mcpm-h h2{flex:1;margin:0}",
      ".mcpm-toca{cursor:pointer}.mcpm-toca:hover{box-shadow:0 0 0 2px rgba(61,90,122,.25)}.mcpm-card{background:var(--white,#fff);border-radius:14px;box-shadow:var(--shadow-sm);padding:12px 14px;margin-bottom:10px}",
      ".mcpm-card h3{margin:0;font-size:1rem;color:var(--navy)}.mcpm-sub{font-size:.75rem;color:var(--gray,#8a93a6)}",
      ".mcpm-pill{display:inline-block;font-size:.66rem;font-weight:800;border-radius:999px;padding:2px 8px;border:1px solid var(--cream-d);margin-left:6px;vertical-align:middle}",
      ".mcpm-on{color:#2E7D52;border-color:#9fd3b3;background:#eef8f1}.mcpm-off{color:#8a93a6}.mcpm-old{color:#8A6D1F;border-color:#E8C07A;background:#fbf4e4}",
      ".mcpm-rg{list-style:none;margin:6px 0 0;padding:0}.mcpm-rg li{font-size:.82rem;padding:3px 0;border-top:1px dashed var(--cream-d)}",
      ".mcpm-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}",
      ".mcpm-f label{display:block;font-size:.72rem;font-weight:700;color:var(--gray);margin:8px 0 3px}.mcpm-f input,.mcpm-f select,.mcpm-f textarea{width:100%;box-sizing:border-box;padding:8px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit;font-size:.85rem;background:#fff}",
      ".mcpm-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}",
      ".mcpm-r{border:1.5px solid var(--cream-d);border-radius:12px;padding:8px 10px;margin-top:8px;background:var(--cream,#faf6ef)}",
      ".mcpm-r .mcpm-rh{display:flex;justify-content:space-between;align-items:center;font-weight:800;color:var(--navy);font-size:.82rem}",
      ".mcpm-cods{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}.mcpm-cods span{background:#fff;border:1px solid var(--cream-d);border-radius:8px;padding:3px 7px;font-size:.72rem;font-weight:700}.mcpm-cods b{cursor:pointer;color:#B84A3F;margin-left:4px}",
      ".mcpm-hits button{display:block;width:100%;text-align:left;border:1px solid var(--cream-d);background:#fff;border-radius:8px;padding:6px 8px;margin-top:3px;font:inherit;font-size:.78rem;cursor:pointer}",
      ".mcpm-dlg{position:fixed;inset:0;background:rgba(20,30,50,.4);display:flex;align-items:center;justify-content:center;z-index:9999;padding:10px}",
      ".mcpm-box{background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:92vh;overflow:auto;padding:14px 16px;box-sizing:border-box}",
      ".mcpm-box h3{margin:0 0 6px;display:flex;justify-content:space-between;align-items:center}.mcpm-x{border:none;background:none;font-size:1.4rem;cursor:pointer}",
      ".mcpm-p{text-transform:none!important;letter-spacing:normal!important;font-weight:400!important;color:inherit!important;margin:0!important;cursor:pointer;display:flex;gap:10px;align-items:flex-start;padding:8px 4px;border-bottom:1px solid var(--cream-d)}.mcpm-p input{margin-top:3px;width:18px;height:18px;flex:0 0 auto}",
      ".mcpm-p .t{font-weight:800;color:var(--navy);font-size:.85rem}.mcpm-p .m{margin-left:auto;font-weight:800;white-space:nowrap}.mcpm-p.no{opacity:.6}",
      ".mcpm-tot{margin-top:10px;font-size:.85rem}.mcpm-tot div{display:flex;justify-content:space-between;padding:2px 0}.mcpm-tot .fin{font-weight:900;font-size:1.05rem;color:var(--navy);border-top:1px solid var(--cream-d);margin-top:4px;padding-top:6px}",
      ".mcpm-ln{font-size:.76rem;color:var(--gray);display:flex;justify-content:space-between;gap:8px;padding:2px 0}.mcpm-ln span:first-child{min-width:0;overflow-wrap:anywhere}",
      ".mcpm-btn{border:1.5px solid #C9A227;background:#fbf4e4;color:#7a5c12;border-radius:10px;padding:7px 12px;font:inherit;font-weight:800;font-size:.8rem;cursor:pointer}",
    ].join("\n");
    document.head.appendChild(s);
  }
  async function cat() {
    if (K.cat) return K.cat;
    try { var r = await api("tk_catalogo", {}); K.cat = (r && r.items) || []; } catch (x) { K.cat = []; }
    return K.cat;
  }
  function nomCod(c) { var x = (K.cat || []).find(function (i) { return String(i.sku) === String(c); }); return x ? x.nombre : c; }

  // ---------- Módulo ----------
  function render() {
    css();
    return '<div class="mcpm" id="mcpm-root"><p class="note">Cargando promociones…</p></div>';
  }
  async function cargar(main) {
    var root = main.querySelector("#mcpm-root"); if (!root) return;
    var r = await api("promo_lista", { todas: true });
    if (!r || r.error) { root.innerHTML = '<p class="err">' + e((r && r.error) || "No se pudo cargar") + "</p>"; return; }
    K.d = r; await cat(); pintar(main);
  }
  function tarjeta(p) {
    var est = p.vigente ? '<span class="mcpm-pill mcpm-on">Vigente</span>' : !p.activa ? '<span class="mcpm-pill mcpm-off">Desactivada</span>' : '<span class="mcpm-pill mcpm-off">Fuera de fecha</span>';
    var vieja = String(p.id).indexOf("s:") === 0;
    return '<div class="mcpm-card mcpm-toca" data-ed="' + e(p.id) + '" title="Toca para ' + (vieja ? "importarla y cambiarla" : "cambiarla") + '"><h3>' + e(p.nombre) + est + (vieja ? '<span class="mcpm-pill mcpm-old">Sistema viejo · sin importar</span>' : p.origen === "sheet" ? '<span class="mcpm-pill mcpm-old">Importada</span>' : "") + "</h3>" +
      '<div class="mcpm-sub">' + e(f(p.desde)) + " → " + e(f(p.hasta)) + (p.notas ? " · " + e(p.notas) : "") + "</div>" +
      '<ul class="mcpm-rg">' + (p.reglasTxt || []).map(function (t) { return "<li>🏷️ " + e(t) + "</li>"; }).join("") + "</ul>" +
      '<div class="mcpm-acts">' + (vieja ? '<button class="btn ghost small" type="button" data-ed="' + e(p.id) + '">Importar</button>' : "") +
      (vieja ? "" : '<button class="btn ghost small" type="button" data-act="' + e(p.id) + '" data-v="' + (p.activa ? "0" : "1") + '">' + (p.activa ? "Desactivar" : "Activar") + "</button>") + "</div></div>";
  }
  function pintar(main) {
    var root = main.querySelector("#mcpm-root"), d = K.d; if (!root || !d) return;
    if (!d.admin) { root.innerHTML = '<p class="err">Solo administradores.</p>'; return; }
    if (K.edit) { root.innerHTML = formHtml(K.edit); wireForm(main); return; }
    var T = d.todas || [], sinImp = T.filter(function (p) { return String(p.id).indexOf("s:") === 0 && p.vigente; }).length;
    root.innerHTML = '<div class="mcpm-h"><h2>🏷️ Promociones</h2><button class="btn small" type="button" id="mcpm-nueva">+ Nueva promoción</button>' +
      (sinImp ? '<button class="btn ghost small" type="button" id="mcpm-imp">⬇️ Importar ' + sinImp + " del sistema viejo</button>" : "") + "</div>" +
      (d.falta ? '<p class="err">' + e(d.falta) + "</p>" : "") +
      '<p class="mcpm-sub">Una promoción puede tener varias reglas (ej. Black Friday: −20% en paquetes de Ginseng y $100 c/u la ampolla si lleva 2). En el ticket, el botón 🏷️ Promociones muestra las que aplican y las aplica como descuento por línea; la comisión se calcula sobre el neto.</p>' +
      (T.length ? T.slice().sort(function (a, b) { return (b.vigente - a.vigente) || String(b.desde).localeCompare(String(a.desde)); }).map(tarjeta).join("") : '<p class="note">Todavía no hay promociones.</p>');
    var nb = root.querySelector("#mcpm-nueva"); if (nb) nb.onclick = function () { K.ini = null; K.edit = { id: "", nombre: "", desde: hoy(), hasta: hoy(), activa: true, notas: "", reglas: [{ tipo: "pct", alcance: "codigos", codigos: [], valor: "", min: 1 }] }; pintar(main); };
    var ib = root.querySelector("#mcpm-imp"); if (ib) ib.onclick = async function () {
      ib.disabled = true; var r = await api("promo_importar", {}); ib.disabled = false;
      if (!r || r.error) { toast2((r && r.error) || "No se pudo", true); return; }
      toast2("Importadas: " + r.importadas); cargar(main);
    };
    root.querySelectorAll("[data-ed]").forEach(function (b) { b.onclick = function (ev) {
      if (ev && ev.target.closest("[data-act]")) return;
      if (ev) ev.stopPropagation();
      var p = T.find(function (x) { return String(x.id) === b.getAttribute("data-ed"); }); if (!p) return;
      K.edit = JSON.parse(JSON.stringify({ id: p.id, nombre: p.nombre, desde: p.desde, hasta: p.hasta, activa: p.activa, notas: p.notas || "", reglas: p.reglas }));
      K.ini = String(p.id).indexOf("s:") === 0 ? null : JSON.stringify(K.edit); K.iniNorm = false; pintar(main);
    }; });
    root.querySelectorAll("[data-act]").forEach(function (b) { b.onclick = async function () {
      var r = await api("promo_activar", { id: b.getAttribute("data-act"), activa: b.getAttribute("data-v") === "1" });
      if (!r || r.error) { toast2((r && r.error) || "No se pudo", true); return; }
      cargar(main);
    }; });
  }
  function opt(v, t, cur) { return '<option value="' + e(v) + '"' + (String(v) === String(cur) ? " selected" : "") + ">" + e(t) + "</option>"; }
  function reglaHtml(r, i) {
    var val = r.tipo === "pct" ? "Descuento %" : r.tipo === "monto" ? "Descuento $" : r.tipo === "precio" ? (r.alcance === "combo" ? "Precio del combo $" : "Precio especial c/u $") : "Lleva (N)";
    return '<div class="mcpm-r" data-r="' + i + '"><div class="mcpm-rh"><span>Regla ' + (i + 1) + '</span><button type="button" class="btn ghost small" data-rdel="' + i + '">Quitar</button></div>' +
      '<div class="mcpm-2"><div><label>Tipo</label><select data-rf="tipo">' + TIPOS.map(function (t) { return opt(t[0], t[1], r.tipo); }).join("") + "</select></div>" +
      '<div><label>Aplica a</label><select data-rf="alcance">' + ALC.map(function (t) { return opt(t[0], t[1], r.alcance); }).join("") + "</select></div></div>" +
      (r.alcance === "codigos" || r.alcance === "combo" ? '<label>' + (r.alcance === "combo" ? "Productos del combo (todos juntos)" : "Productos / servicios") + '</label><input type="search" data-rq placeholder="Buscar nombre o código" autocomplete="off"><div class="mcpm-hits" data-rh></div><div class="mcpm-cods">' +
        (r.codigos || []).map(function (c) { return "<span>" + e(c) + " " + e(nomCod(c)) + '<b data-rc="' + e(c) + '">✕</b></span>'; }).join("") + "</div>" : "") +
      (r.alcance === "marca" ? '<label>Marca</label><input data-rf="marca" value="' + e(r.marca || "") + '" placeholder="ej. Dr.esthe">' : "") +
      (r.alcance === "categoria" ? '<label>Categoría</label><input data-rf="categoria" value="' + e(r.categoria || "") + '">' : "") +
      (r.alcance === "tipo" ? '<label>Tipo de línea</label><select data-rf="tipoLinea">' + [["facial", "Faciales"], ["producto", "Productos"], ["paquete", "Paquetes"], ["extra", "Extras"]].map(function (t) { return opt(t[0], t[1], r.tipoLinea || "facial"); }).join("") + "</select>" : "") +
      '<div class="mcpm-2"><div><label>' + val + '</label><input data-rf="valor" type="number" inputmode="decimal" step="0.01" value="' + e(r.valor == null ? "" : r.valor) + '"></div>' +
      (r.tipo === "nxm" ? '<div><label>Paga (M)</label><input data-rf="valor2" type="number" inputmode="numeric" value="' + e(r.valor2 || "") + '"></div>'
        : r.alcance === "combo" ? "<div></div>" : '<div><label>Mínimo de unidades</label><input data-rf="min" type="number" inputmode="numeric" min="1" value="' + e(r.min || 1) + '"></div>') + "</div>" +
      (r.tipo === "monto" && r.alcance !== "combo" ? '<label>¿Cómo se descuenta?</label><select data-rf="por">' + opt("unidad", "Por cada unidad", r.por) + opt("grupo", "Por cada grupo del mínimo", r.por || "grupo") + opt("una", "Una sola vez", r.por) + "</select>" : "") +
      '<label>Texto en el ticket (opcional)</label><input data-rf="etiqueta" value="' + e(r.etiqueta || "") + '" placeholder="Se arma solo si lo dejas vacío"></div>';
  }
  function formHtml(p) {
    return '<div class="mcpm-h"><h2>' + (p.id && String(p.id).indexOf("s:") !== 0 ? "Promoción" : "Nueva promoción") + '</h2><button class="btn ghost small" type="button" id="mcpm-cancel">← Volver</button></div>' +
      '<div class="mcpm-card mcpm-f"><label>Nombre</label><input id="mcpm-nom" value="' + e(p.nombre) + '" placeholder="ej. Black Friday 2026">' +
      '<div class="mcpm-2"><div><label>Desde</label><input id="mcpm-d1" type="date" value="' + e(p.desde) + '"></div><div><label>Hasta</label><input id="mcpm-d2" type="date" value="' + e(p.hasta) + '"></div></div>' +
      '<label><input type="checkbox" id="mcpm-act" style="width:auto"' + (p.activa !== false ? " checked" : "") + "> Activa</label>" +
      '<label>Notas</label><input id="mcpm-notas" value="' + e(p.notas || "") + '">' +
      '<div id="mcpm-reglas">' + (p.reglas || []).map(reglaHtml).join("") + "</div>" +
      '<div class="mcpm-acts"><button class="btn ghost small" type="button" id="mcpm-addr">+ Agregar regla</button></div>' +
      '<p class="err" id="mcpm-err"></p><div class="mcpm-acts"><button class="btn small" type="button" id="mcpm-save"' + (K.ini && JSON.stringify(p) === K.ini ? " hidden" : "") + '>Guardar promoción</button>' + (K.ini ? '<button class="btn ghost small" type="button" id="mcpm-desc"' + (JSON.stringify(p) === K.ini ? " hidden" : "") + '>Descartar</button>' : "") + "</div>" + (K.ini ? '<p class="mccf-sub" id="mcpm-hint">✎ Cambia lo que necesites; «Guardar» aparece cuando hay un cambio.</p>' : "") + "</div>";
  }
  function leerForm(main) {
    var p = K.edit; if (!p) return;
    var g = function (id) { var x = main.querySelector("#" + id); return x ? x.value : ""; };
    p.nombre = g("mcpm-nom"); p.desde = g("mcpm-d1"); p.hasta = g("mcpm-d2"); p.notas = g("mcpm-notas");
    var a = main.querySelector("#mcpm-act"); p.activa = a ? a.checked : true;
    main.querySelectorAll("[data-r]").forEach(function (box) {
      var r = p.reglas[+box.getAttribute("data-r")]; if (!r) return;
      box.querySelectorAll("[data-rf]").forEach(function (x) { r[x.getAttribute("data-rf")] = x.value; });
    });
  }
  function wireForm(main) {
    var root = main.querySelector("#mcpm-root");
    root.querySelector("#mcpm-cancel").onclick = function () { K.edit = null; K.ini = null; pintar(main); };
    // Sin botón «Editar» (TK55): Guardar / Descartar aparecen solo si algo cambió.
    if (K.ini && !K.iniNorm) { leerForm(main); K.ini = JSON.stringify(K.edit); K.iniNorm = true; }
    if (K.ini) {
      var mirar = function () { setTimeout(function () { leerForm(main); var c = JSON.stringify(K.edit) !== K.ini, sv = root.querySelector("#mcpm-save"), ds = root.querySelector("#mcpm-desc"); if (sv) sv.hidden = !c; if (ds) ds.hidden = !c; }, 0); };
      root.addEventListener("input", mirar); root.addEventListener("change", mirar);
      mirar();
      var dsc = root.querySelector("#mcpm-desc"); if (dsc) dsc.onclick = function () { K.edit = JSON.parse(K.ini); pintar(main); };
    }
    root.querySelector("#mcpm-addr").onclick = function () { leerForm(main); K.edit.reglas.push({ tipo: "pct", alcance: "codigos", codigos: [], valor: "", min: 1 }); pintar(main); };
    root.querySelectorAll("[data-rdel]").forEach(function (b) { b.onclick = function () { leerForm(main); K.edit.reglas.splice(+b.getAttribute("data-rdel"), 1); pintar(main); }; });
    root.querySelectorAll('select[data-rf="tipo"],select[data-rf="alcance"]').forEach(function (s) { s.onchange = function () { leerForm(main); pintar(main); }; });
    root.querySelectorAll("[data-rc]").forEach(function (b) { b.onclick = function () {
      leerForm(main); var r = K.edit.reglas[+b.closest("[data-r]").getAttribute("data-r")]; r.codigos = (r.codigos || []).filter(function (c) { return c !== b.getAttribute("data-rc"); }); pintar(main);
    }; });
    root.querySelectorAll("[data-rq]").forEach(function (inp) {
      var box = inp.closest("[data-r]"), hits = box.querySelector("[data-rh]");
      inp.oninput = function () {
        var q = inp.value.trim().toLowerCase(); if (q.length < 2) { hits.innerHTML = ""; return; }
        var r = K.edit.reglas[+box.getAttribute("data-r")];
        var out = (K.cat || []).filter(function (c) { return c.tipo !== "gift" && (r.codigos || []).indexOf(c.sku) < 0 && (String(c.sku).toLowerCase().indexOf(q) >= 0 || String(c.skuVisible || "").toLowerCase().indexOf(q) >= 0 || String(c.nombre).toLowerCase().indexOf(q) >= 0); }).slice(0, 8);
        hits.innerHTML = out.map(function (c) { return '<button type="button" data-add="' + e(c.sku) + '"><b>' + e(c.skuVisible || c.sku) + "</b> " + e(c.nombre) + " · " + $m(c.pvp) + "</button>"; }).join("") || '<div class="mcpm-sub">Sin resultados</div>';
        hits.querySelectorAll("[data-add]").forEach(function (b) { b.onclick = function () { leerForm(main); r.codigos = (r.codigos || []).concat([b.getAttribute("data-add")]); pintar(main); var n = main.querySelector('[data-r="' + box.getAttribute("data-r") + '"] [data-rq]'); if (n) n.focus(); }; });
      };
    });
    root.querySelector("#mcpm-save").onclick = async function () {
      leerForm(main); var p = K.edit, err = root.querySelector("#mcpm-err"); err.textContent = "";
      var b = this; b.disabled = true;
      var r = await api("promo_guardar", { id: p.id, nombre: p.nombre, desde: p.desde, hasta: p.hasta, activa: p.activa, notas: p.notas, reglas: p.reglas.map(function (x) { return { tipo: x.tipo, alcance: x.alcance, codigos: x.codigos || [], marca: x.marca, categoria: x.categoria, tipoLinea: x.tipoLinea, valor: Number(x.valor) || 0, valor2: Number(x.valor2) || 0, min: Number(x.min) || 1, por: x.por, etiqueta: x.etiqueta }; }) });
      b.disabled = false;
      if (!r || r.error) { err.textContent = (r && r.error) || "No se pudo guardar"; return; }
      toast2("🏷️ Promoción guardada"); K.edit = null; K.ini = null; cargar(main);
    };
  }
  function wire(main) { css(); K.edit = null; K.ini = null; cargar(main); }

  // ---------- Panel del ticket ----------
  // opts.lineas(): [{k, sku, nombre, tipo, cantidad, bruto}] · opts.aplicadas: ids ya aplicados · opts.aplicar(resultado, ids)
  async function panel(opts) {
    css();
    var L = (opts.lineas() || []).filter(function (l) { return Number(l.bruto) > 0; });
    var dlg = document.createElement("div"); dlg.className = "mcpm-dlg";
    dlg.innerHTML = '<div class="mcpm-box"><h3>🏷️ Promociones <button class="mcpm-x" type="button">×</button></h3><div id="mcpm-pb"><p class="note">Buscando promociones…</p></div></div>';
    document.body.appendChild(dlg);
    var cerrar = function () { dlg.remove(); };
    dlg.querySelector(".mcpm-x").onclick = cerrar; dlg.onclick = function (ev) { if (ev.target === dlg) cerrar(); };
    var body = dlg.querySelector("#mcpm-pb");
    if (!L.length) { body.innerHTML = '<p class="note">Agrega primero lo que se cobra en el ticket.</p>'; return; }
    var sel = (opts.aplicadas || []).slice(), first = true, last = null;
    async function calcular() {
      var r = await api("promo_calcular", { lineas: L, ids: sel });
      if (!r || r.error) { body.innerHTML = '<p class="err">' + e((r && r.error) || "No se pudo calcular") + "</p>"; return; }
      if (first) { first = false; if (!sel.length && !opts.auto) { sel = r.promos.filter(function (p) { return p.monto > 0; }).map(function (p) { return p.id; }); if (sel.length) return calcular(); } }
      last = r; pintarPanel(r);
    }
    function pintarPanel(r) {
      if (!r.promos.length) { body.innerHTML = '<p class="note">No hay promociones vigentes hoy.</p>'; return; }
      var res = r.resultado, nom = {}; L.forEach(function (l) { nom[l.k] = l.nombre || l.sku; });
      body.innerHTML = r.promos.map(function (p) {
        var ok = p.monto > 0, on = sel.indexOf(p.id) >= 0;
        return '<label class="mcpm-p' + (ok ? "" : " no") + '"><input type="checkbox" data-pid="' + e(p.id) + '"' + (on ? " checked" : "") + ((ok || on) && opts.admin !== false ? "" : " disabled") + '><div style="min-width:0"><div class="t">' + e(p.nombre) + "</div>" +
          '<div class="mcpm-sub">' + (p.reglasTxt || []).map(e).join(" · ") + "</div>" + (ok ? "" : '<div class="mcpm-sub" style="color:#B84A3F">' + e(p.motivo || "No aplica") + "</div>") + '</div><span class="m">' + (ok ? "−" + $m(p.monto) : "") + "</span></label>";
      }).join("") +
        '<div class="mcpm-tot">' + res.lineas.filter(function (l) { return l.monto > 0; }).map(function (l) { return '<div class="mcpm-ln"><span>' + e(nom[l.k]) + " · " + e(l.etiqueta) + "</span><span>−" + $m(l.monto) + "</span></div>"; }).join("") +
        "<div><span>Total sin promociones</span><b>" + $m(res.bruto) + '</b></div><div style="color:var(--green)"><span>Descuento de promociones</span><b>−' + $m(res.descuento) + '</b></div><div class="fin"><span>Total final</span><span>' + $m(res.total) + "</span></div>" +
        '<div class="mcpm-sub">' + (opts.auto ? "Se aplican solas cuando el ticket cumple; cada línea recibe una sola (la que más descuenta). " + (opts.admin !== false ? "Como admin puedes desmarcar una que cayó mal." : "Si una cayó mal, avisa a un admin.") : "Varias promos a la vez: cada línea recibe una sola (la primera marcada que le aplica).") + "</div></div>" +
        (opts.admin === false ? '<div class="mcpm-acts" style="justify-content:flex-end"><button class="btn small" type="button" id="mcpm-cerrar">Cerrar</button></div>'
          : '<div class="mcpm-acts" style="justify-content:flex-end"><button class="btn ghost small" type="button" id="mcpm-quitar">Quitar promociones</button><button class="btn small" type="button" id="mcpm-ok">' + (opts.auto ? "Guardar elección" : "Aplicar al ticket") + "</button></div>");
      body.querySelectorAll("[data-pid]").forEach(function (c) { c.onchange = function () { var id = c.getAttribute("data-pid"); sel = sel.filter(function (x) { return x !== id; }); if (c.checked) sel.push(id); calcular(); }; });
      var bc = body.querySelector("#mcpm-cerrar"); if (bc) { bc.onclick = cerrar; return; }
      body.querySelector("#mcpm-ok").onclick = function () { opts.aplicar(last.resultado, sel.slice(), last.promos); cerrar(); toast2(last.resultado.descuento > 0 ? "🏷️ Promociones: −" + $m(last.resultado.descuento) : "Sin promociones"); };
      body.querySelector("#mcpm-quitar").onclick = function () { opts.aplicar({ lineas: [], descuento: 0 }, [], last.promos); cerrar(); };
    }
    calcular();
  }

  window.MCPromociones = { render: render, wire: wire, panel: panel };
})();
