// Productos estilo MineCore (lista única + ficha), con el tema de Sunsu.
// Portado de MineCore portal (index.html: Inv / MCVsel PF2 / MCProd2) y conectado a la función api de Sunsu
// con las acciones mcprod_list, mcprod_get, mcprod_save, mcprod_foto y mcprod_nuevo.
// Regla de la beta: el admin edita en línea (toca el dato); la barra Guardar/Descartar aparece solo si hay cambios.
// Quien no es admin solo ve; los costos solo con ver_costos.
(function () {
  "use strict";
  var MC = {
    list: null, listAt: 0, admin: false, verCostos: false, filtrosData: null,
    f: { q: "", tipo: "", bodega: "", marca: "", categoria: "", estado: "" },
    cur: null, ch: {}, ed: null, tab: "resumen", motivo: "",
  };
  var GRUPOS = [["CONSIGNACION", "Consignación"], ["CABINA", "Bodega Cabina"], ["OFICINA", "Bodega Oficina"]];
  var SUBS = [["CABINA_1", "Cabina 1"], ["CABINA_2", "Cabina 2"], ["CABINA_3", "Cabina 3"]];
  var PRECIO = { beta_pvp: 1, beta_compra_real: 1, beta_compra_comision: 1 };

  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v); }
  function $m(v) { var x = Number(v); return Number.isFinite(x) ? "$" + x.toFixed(2) : "—"; }
  function q2(v) { var x = Number(v) || 0; return Math.round(x) === x ? String(x) : x.toFixed(2); }
  function norm(v) { return String(v == null ? "" : v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function fecha(v) { var t = String(v || ""); if (!t) return ""; var d = t.slice(0, 10).split("-"); return d.length === 3 ? d[2] + "/" + d[1] + "/" + d[0] + (t.length > 11 ? " " + t.slice(11, 16) : "") : t; }

  function css() {
    if (document.getElementById("mcp-css")) return;
    var s = document.createElement("style");
    s.id = "mcp-css";
    s.textContent = [
      ".mcp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}",
      ".mcp-bar .mcp-q{flex:1 1 280px;min-width:200px;padding:10px 12px;border:1.5px solid var(--cream-d);border-radius:10px;font:inherit;background:var(--white)}",
      ".mcp-bar select{padding:9px 10px;border:1.5px solid var(--cream-d);border-radius:10px;font:inherit;background:var(--white);color:var(--text);max-width:200px}",
      ".mcp-count{color:var(--gray);font-size:.78rem;margin:2px 0 8px}",
      ".mcp-tbl{width:100%;border-collapse:separate;border-spacing:0;background:var(--white);border-radius:14px;box-shadow:var(--shadow-sm);overflow:hidden}",
      ".mcp-tbl th{background:var(--blue-ll);color:var(--navy-d);font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;text-align:left;padding:10px;border-bottom:1px solid var(--cream-d);white-space:nowrap}",
      ".mcp-tbl td{padding:8px 10px;border-bottom:1px solid var(--gray-l);font-size:.85rem;vertical-align:middle}",
      ".mcp-tbl tr.mcp-row{cursor:pointer}.mcp-tbl tr.mcp-row:hover td{background:var(--gold-l)}",
      ".mcp-tbl td.num,.mcp-tbl th.num{text-align:right}",
      ".mcp-th{width:44px;height:44px;border-radius:10px;background:var(--cream);display:flex;align-items:center;justify-content:center;overflow:hidden;color:var(--navy);font-weight:700;font-size:.8rem;flex:none}",
      ".mcp-th img{width:100%;height:100%;object-fit:cover}",
      ".mcp-pn{display:flex;gap:10px;align-items:center;min-width:220px}.mcp-pn b{display:block;color:var(--text);font-weight:600;line-height:1.25}",
      ".mcp-sub{color:var(--gray);font-size:.72rem}",
      ".mcp-tag{display:inline-block;border-radius:999px;padding:2px 9px;font-size:.7rem;font-weight:700;background:var(--blue-l);color:var(--navy-d);white-space:nowrap}",
      ".mcp-tag.serv{background:var(--gold-l);color:#8a6420}.mcp-tag.bajo{background:var(--peach-l);color:var(--pink-d)}.mcp-tag.agot{background:var(--red-l);color:var(--red)}.mcp-tag.beta{background:var(--green-l);color:#4d7360}",
      ".mcp-sku{font-family:ui-monospace,Menlo,monospace;font-size:.8rem;color:var(--navy-d)}",
      ".mcp-top{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}",
      ".mcp-card{background:var(--white);border-radius:16px;box-shadow:var(--shadow);padding:16px}",
      ".mcp-head{display:flex;gap:18px}.mcp-ph{flex:0 0 190px;height:190px;border-radius:14px;background:var(--cream);display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;color:var(--navy);font-size:2rem}",
      ".mcp-ph img{width:100%;height:100%;object-fit:contain;background:#fff}.mcp-ph.can{cursor:pointer}.mcp-ph .mcp-phh{position:absolute;bottom:6px;right:6px;background:rgba(255,255,255,.9);border-radius:8px;padding:2px 8px;font-size:.7rem;color:var(--navy)}",
      ".mcp-tt{font-size:1.35rem;font-weight:700;color:var(--navy);margin:0 0 6px;line-height:1.2}",
      ".mcp-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:2px 26px;margin-top:8px}",
      ".mcp-kv{display:grid;grid-template-columns:minmax(100px,42%) minmax(0,1fr);align-items:center;min-height:30px;gap:10px}",
      ".mcp-l{font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--navy-d)}",
      ".mcp-v{font-size:.86rem;overflow-wrap:anywhere}.mcp-v.can{cursor:text;border-bottom:1px dashed transparent}.mcp-v.can:hover{border-bottom-color:var(--gold-m)}",
      ".mcp-v.vac{color:var(--gray);font-style:italic}.mcp-v.ch{background:var(--gold-l);border-radius:6px;padding:0 4px}",
      ".mcp-in{width:100%;box-sizing:border-box;padding:6px 8px;border:1.5px solid var(--gold);border-radius:8px;font:inherit}",
      ".mcp-stk{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--cream-d)}",
      ".mcp-sc{background:var(--blue-ll);border:1px solid var(--blue-l);border-radius:7px;padding:1px 7px;font-size:.72rem;font-weight:700;color:var(--navy-d)}",
      ".mcp-save{position:sticky;top:0;z-index:5;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--gold-l);border:1px solid var(--gold-m);border-radius:12px;padding:8px 12px;margin:10px 0}",
      ".mcp-save[hidden]{display:none}.mcp-tt .mcp-v,.mcp-pvp .mcp-v{font-size:inherit}",
      ".mcp-save span{font-weight:700;color:#8a6420;margin-right:auto}.mcp-save input{flex:1 1 220px;padding:7px 9px;border:1.5px solid var(--gold);border-radius:8px;font:inherit}",
      ".mcp-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 10px}.mcp-tab{flex:1 1 120px;border:1.5px solid var(--cream-d);background:var(--white);border-radius:999px;padding:8px 10px;font:inherit;font-size:.8rem;color:var(--navy);cursor:pointer}",
      ".mcp-tab.on{background:var(--navy);border-color:var(--navy);color:#fff;font-weight:700}",
      ".mcp-cols{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:14px}",
      ".mcp-big{font-size:1.9rem;font-weight:700;color:var(--navy)}",
      ".mcp-grp{margin-top:10px}.mcp-gh{display:flex;justify-content:space-between;align-items:center;font-weight:700;color:var(--navy-d);padding:6px 0;border-bottom:1px solid var(--cream-d)}",
      ".mcp-gh small{font-weight:400;color:var(--gray);margin-left:6px}.mcp-gq{color:var(--green);font-weight:700}",
      ".mcp-sr{display:flex;justify-content:space-between;padding:6px 0 6px 18px;border-bottom:1px dashed var(--gray-l);font-size:.85rem}.mcp-sr.vac{color:var(--gray)}",
      ".mcp-pr{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--gray-l);gap:10px}",
      ".mcp-pvp{font-size:1.7rem;font-weight:700;color:var(--green)}.mcp-ref{color:var(--gray);font-size:.72rem}",
      ".mcp-mini{width:100%;border-collapse:collapse;font-size:.8rem}.mcp-mini th{text-align:left;color:var(--navy-d);font-size:.68rem;text-transform:uppercase;padding:6px;border-bottom:1px solid var(--cream-d)}.mcp-mini td{padding:6px;border-bottom:1px solid var(--gray-l)}.mcp-mini td.num{text-align:right}",
      ".mcp-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}.mcp-form label{display:flex;flex-direction:column;gap:4px;font-size:.72rem;font-weight:700;color:var(--navy-d)}",
      ".mcp-form input,.mcp-form select{padding:9px 10px;border:1.5px solid var(--cream-d);border-radius:10px;font:inherit}",
      "@media(max-width:820px){.mcp-head{flex-direction:column}.mcp-ph{flex:none;width:100%;height:210px}.mcp-cols{grid-template-columns:1fr}.mcp-tbl .mcp-hide{display:none}.mcp-g{grid-template-columns:1fr}}",
    ].join("");
    document.head.appendChild(s);
  }

  // ---------- Lista ----------
  async function cargarLista(force) {
    if (!force && MC.list && Date.now() - MC.listAt < 60000) return { ok: true };
    var d = await api("mcprod_list", {});
    if (!d || d.error) return d || { error: "No se pudo cargar" };
    MC.list = d.items || [];
    MC.listAt = Date.now();
    MC.admin = !!d.admin;
    MC.verCostos = !!d.verCostos;
    MC.filtrosData = d.filtros || { marcas: [], categorias: [] };
    return { ok: true };
  }
  function filtrar() {
    var f = MC.f, qq = norm(f.q).trim();
    return (MC.list || []).filter(function (p) {
      if (f.tipo && p.tipo !== f.tipo) return false;
      if (f.marca && p.marca !== f.marca) return false;
      if (f.categoria && p.categoria !== f.categoria) return false;
      if (f.bodega && !(p.porGrupo && Number(p.porGrupo[f.bodega]) > 0)) return false;
      if (f.estado === "inactivos") { if (p.activo !== false) return false; }
      else if (p.activo === false && !qq) return false;
      if (f.estado === "con" && !(Number(p.stock) > 0)) return false;
      if (f.estado === "bajo" && p.estado !== "bajo") return false;
      if (f.estado === "agotado" && p.estado !== "agotado") return false;
      if (qq) {
        var hay = norm([p.nombre, p.sku, p.marca, p.categoria, p.codigoCabina, p.subtipo].join(" "));
        if (qq.split(/\s+/).some(function (w) { return hay.indexOf(w) < 0; })) return false;
      }
      return true;
    });
  }
  function iniciales(n) { return e(String(n || "?").replace(/[^A-Za-zÁÉÍÓÚÑ0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase() || "?"); }
  function thumb(p) { return '<div class="mcp-th">' + (p.foto_thumb ? '<img src="' + e(p.foto_thumb) + '" alt="">' : iniciales(p.nombre)) + "</div>"; }
  function filasHtml() {
    var rows = filtrar();
    var cnt = document.getElementById("mcp-count");
    if (cnt) cnt.textContent = rows.length + " de " + (MC.list || []).length + " productos";
    if (!rows.length) return '<tr><td colspan="6" class="mcp-sub" style="padding:18px">Sin productos con ese filtro.</td></tr>';
    return rows.map(function (p) {
      var tipo = p.tipo === "servicio" ? '<span class="mcp-tag serv">Servicio</span>' : '<span class="mcp-tag">Inventariable</span>';
      var st = p.tipo === "servicio" ? '<span class="mcp-sub">—</span>' : "<b>" + q2(p.stock) + "</b>" + (p.estado === "agotado" ? ' <span class="mcp-tag agot">agotado</span>' : p.estado === "bajo" ? ' <span class="mcp-tag bajo">bajo</span>' : "");
      return '<tr class="mcp-row" data-mcp-id="' + e(p.id) + '"><td><div class="mcp-pn">' + thumb(p) + "<div><b>" + e(p.nombre) + '</b><span class="mcp-sub">' + e(p.subtipo) + (p.activo === false ? " · inactivo" : "") + "</span></div></div></td>" +
        '<td class="mcp-sku">' + e(p.sku) + "</td><td>" + tipo + '</td><td class="mcp-hide">' + e(p.categoria || "—") + '</td><td class="mcp-hide">' + e(p.marca || "—") + '</td><td class="num">' + st + "</td></tr>";
    }).join("");
  }
  function opt(v, t, cur) { return '<option value="' + e(v) + '"' + (String(v) === String(cur) ? " selected" : "") + ">" + e(t) + "</option>"; }
  async function renderLista() {
    var r = await cargarLista(false);
    if (r && r.error) return '<p class="err">' + e(r.error) + "</p>";
    var f = MC.f, fd = MC.filtrosData || {};
    var nuevo = MC.admin ? '<button class="btn small" type="button" id="mcp-nuevo">+ Nuevo producto</button>' : "";
    return '<div class="mcp">' +
      '<div class="mcp-bar"><input class="mcp-q" id="mcp-q" type="search" placeholder="Buscar producto, SKU, marca o código" aria-label="Buscar producto, SKU, marca o código" value="' + e(f.q) + '">' + nuevo + "</div>" +
      '<div class="mcp-bar">' +
      '<select id="mcp-f-tipo" aria-label="Tipo">' + opt("", "Todos los tipos", f.tipo) + opt("inventariable", "Inventariable", f.tipo) + opt("servicio", "Servicio", f.tipo) + "</select>" +
      '<select id="mcp-f-bodega" aria-label="Bodega">' + opt("", "Todas las bodegas", f.bodega) + GRUPOS.map(function (g) { return opt(g[0], g[1], f.bodega); }).join("") + "</select>" +
      '<select id="mcp-f-marca" aria-label="Marca">' + opt("", "Todas las marcas", f.marca) + (fd.marcas || []).map(function (m) { return opt(m, m, f.marca); }).join("") + "</select>" +
      '<select id="mcp-f-categoria" aria-label="Categoría">' + opt("", "Todas las categorías", f.categoria) + (fd.categorias || []).map(function (m) { return opt(m, m, f.categoria); }).join("") + "</select>" +
      '<select id="mcp-f-estado" aria-label="Stock">' + opt("", "Todo el stock", f.estado) + opt("con", "Con stock", f.estado) + opt("bajo", "Stock bajo", f.estado) + opt("agotado", "Agotado", f.estado) + opt("inactivos", "Inactivos", f.estado) + "</select>" +
      '<button class="btn ghost small" type="button" id="mcp-limpiar">Limpiar</button></div>' +
      '<div class="mcp-count" id="mcp-count"></div>' +
      '<div class="sheet-scroll"><table class="mcp-tbl"><thead><tr><th>Producto</th><th>SKU</th><th>Tipo</th><th class="mcp-hide">Categoría</th><th class="mcp-hide">Marca</th><th class="num">Stock</th></tr></thead><tbody id="mcp-body"></tbody></table></div>' +
      '<p class="note">Una sola lista: catálogo, Cabina y productos de la beta unidos por código. Consignación = bodega VENTA · Bodega Cabina = Cabina 1/2/3 · Bodega Oficina = CASA. <a href="#/m/productos/catalogo">Catálogo anterior</a></p>' +
      "</div>";
  }
  function wireLista(main) {
    var body = main.querySelector("#mcp-body");
    if (!body) return;
    var pintar = function () { body.innerHTML = filasHtml(); };
    pintar();
    var q = main.querySelector("#mcp-q");
    if (q) q.addEventListener("input", function () { MC.f.q = q.value; pintar(); });
    ["tipo", "bodega", "marca", "categoria", "estado"].forEach(function (k) {
      var s = main.querySelector("#mcp-f-" + k);
      if (s) s.addEventListener("change", function () { MC.f[k] = s.value; pintar(); });
    });
    var lim = main.querySelector("#mcp-limpiar");
    if (lim) lim.onclick = function () { MC.f = { q: "", tipo: "", bodega: "", marca: "", categoria: "", estado: "" }; go("#/m/productos"); };
    body.addEventListener("click", function (ev) {
      var tr = ev.target.closest("tr[data-mcp-id]");
      if (tr) go("#/m/productos/p/" + encodeURIComponent(tr.getAttribute("data-mcp-id")));
    });
    var nv = main.querySelector("#mcp-nuevo");
    if (nv) nv.onclick = function () { go("#/m/productos/nuevo"); };
  }

  // ---------- Ficha ----------
  var CAMPOS = {
    nombre: "Nombre", sku_proveedor: "SKU proveedor", codigo_barras: "Código de barras", marca: "Marca", categoria: "Categoría",
    linea: "Línea", unidad: "Unidad", bodega_def: "Bodega por defecto", sububicacion_def: "Sububicación por defecto",
    producto_base: "Producto base (subcódigos)", observaciones: "Observaciones", activo: "Activo",
    beta_pvp: "PVP con IVA", beta_compra_real: "Compra real", beta_compra_comision: "Compra para comisiones",
  };
  function base(k) {
    var p = MC.cur.producto, pr = MC.cur.precios || {};
    if (k === "beta_pvp") return pr.pvp;
    if (k === "beta_compra_real") return pr.compraReal;
    if (k === "beta_compra_comision") return pr.compraComision;
    return p[k];
  }
  function val(k) { return Object.prototype.hasOwnProperty.call(MC.ch, k) ? MC.ch[k] : base(k); }
  function txt(k) {
    var v = val(k);
    if (k === "activo") return v === false || v === "false" ? "No" : "Sí";
    if (k === "bodega_def") { var g = GRUPOS.filter(function (x) { return x[0] === v; })[0]; return g ? g[1] : (v || ""); }
    if (k === "sububicacion_def") { var sb = SUBS.filter(function (x) { return x[0] === v; })[0]; return sb ? sb[1] : (v || ""); }
    if (PRECIO[k]) return v == null || v === "" ? "" : $m(v);
    if (k === "codigo_barras" && /^\d+\.0$/.test(String(v))) return String(v).slice(0, -2);
    return v == null ? "" : String(v);
  }
  function puede() { return MC.admin && !(typeof state !== "undefined" && state.vista); }
  function V(k, cls) {
    var can = puede(), t = txt(k), ch = Object.prototype.hasOwnProperty.call(MC.ch, k);
    if (MC.ed === k) return '<span class="mcp-v">' + input(k) + "</span>";
    return '<span class="mcp-v ' + (cls || "") + (can ? " can" : "") + (ch ? " ch" : "") + (t ? "" : " vac") + '"' + (can ? ' data-mcp-ed="' + k + '"' : "") + ' title="' + e(t) + '">' + (t ? e(t) : (can ? "Agregar dato" : "—")) + "</span>";
  }
  function input(k) {
    var v = val(k);
    if (k === "activo") return '<select class="mcp-in" data-mcp-in="' + k + '">' + opt("true", "Sí", v === false || v === "false" ? "" : "true") + opt("false", "No", v === false || v === "false" ? "false" : "") + "</select>";
    if (k === "bodega_def") return '<select class="mcp-in" data-mcp-in="' + k + '">' + opt("", "—", v) + GRUPOS.map(function (g) { return opt(g[0], g[1], v); }).join("") + "</select>";
    if (k === "sububicacion_def") return '<select class="mcp-in" data-mcp-in="' + k + '">' + opt("", "—", v) + SUBS.map(function (g) { return opt(g[0], g[1], v); }).join("") + "</select>";
    var num = PRECIO[k];
    return '<input class="mcp-in" data-mcp-in="' + k + '"' + (num ? ' inputmode="decimal"' : "") + ' value="' + e(v == null ? "" : (num ? Number(v).toFixed(2) : v)) + '">';
  }
  function kv(k, label) { return '<div class="mcp-kv"><span class="mcp-l">' + e(label || CAMPOS[k]) + "</span>" + V(k) + "</div>"; }
  function hayPrecio() { return Object.keys(MC.ch).some(function (k) { return PRECIO[k]; }); }

  function stockChips(stock) {
    var out = [];
    (stock || []).forEach(function (g) {
      if (g.grupo === "CABINA") (g.subs || []).forEach(function (s) { if (Number(s.cantidad)) out.push('<span class="mcp-sc">' + e(s.nombre) + "</span> " + q2(s.cantidad) + " u"); });
      else if (Number(g.cantidad)) out.push('<span class="mcp-sc">' + e(g.nombre) + "</span> " + q2(g.cantidad) + " u");
    });
    return out.length ? out.join(" &nbsp; ") : '<span class="mcp-sub">Sin stock</span>';
  }
  function head() {
    var r = MC.cur, p = r.producto, can = puede();
    var foto = p.foto_data ? '<img src="' + e(p.foto_data) + '" alt="">' : "📷";
    var tipo = (p.tipo === "servicio" ? "Servicio" : "Inventariable") + (p.subtipo ? " · " + p.subtipo : "");
    var h = '<div class="mcp-card"><div class="mcp-head">' +
      '<div class="mcp-ph' + (can ? " can" : "") + '" id="mcp-foto">' + foto + (can ? '<span class="mcp-phh">' + (p.foto_data ? "Cambiar foto" : "Subir foto") + "</span>" : "") + "</div>" +
      '<input type="file" accept="image/*" id="mcp-file" hidden>' +
      '<div style="flex:1;min-width:0"><h2 class="mcp-tt">' + V("nombre") + "</h2>" +
      '<div class="mcp-kv"><span class="mcp-l">SKU</span><span class="mcp-v mcp-sku">' + e(p.sku) + (p.sku_catalogo && p.sku_catalogo.toUpperCase() !== p.sku ? ' <span class="mcp-sub">(' + e(p.sku_catalogo) + ")</span>" : "") + (p.codigoCabina ? ' <span class="mcp-sub">· Cabina ' + e(p.codigoCabina) + "</span>" : "") + "</span></div>" +
      kv("sku_proveedor") + kv("codigo_barras") +
      '<div class="mcp-g">' + kv("marca") + kv("categoria") + kv("linea") +
      '<div class="mcp-kv"><span class="mcp-l">Tipo</span><span class="mcp-v">' + e(tipo) + "</span></div>" +
      kv("unidad") + (p.tipo === "servicio" ? "" : kv("bodega_def") + kv("sububicacion_def")) + kv("producto_base") + kv("observaciones") + kv("activo") + "</div>" +
      (p.tipo === "servicio" ? "" : '<div class="mcp-stk"><span class="mcp-l">Stock por sububicación</span>' + stockChips(r.stock) + "</div>") +
      (p.beta_editado_por ? '<p class="note" style="margin-top:8px">Última edición en la beta: ' + e(p.beta_editado_por) + " · " + e(fecha(p.beta_editado_at)) + "</p>" : "") +
      "</div></div></div>";
    var n = Object.keys(MC.ch).length;
    h += '<div class="mcp-save" id="mcp-savebar"' + (n ? "" : " hidden") + "><span>Cambios sin guardar (" + n + ")</span>" +
      (hayPrecio() ? '<input id="mcp-motivo" placeholder="Motivo del cambio de precio o costo (obligatorio)" value="' + e(MC.motivo) + '">' : "") +
      '<button class="btn small" type="button" id="mcp-guardar">Guardar</button><button class="btn ghost small" type="button" id="mcp-descartar">Descartar</button></div>';
    return h;
  }
  function tabs() {
    var T = [["resumen", "Resumen"], ["proveedores", "Proveedores"], ["historial", "Historial"], ["movimientos", "Movimientos"]];
    return '<div class="mcp-tabs">' + T.map(function (t) { return '<button type="button" class="mcp-tab' + (MC.tab === t[0] ? " on" : "") + '" data-mcp-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>";
  }
  function resumen() {
    var r = MC.cur, p = r.producto, pr = r.precios || {}, serv = p.tipo === "servicio";
    var left = "";
    if (!serv) {
      var tot = (r.stock || []).reduce(function (a, g) { return a + (Number(g.cantidad) || 0); }, 0);
      left = '<div class="mcp-card"><div class="mcp-sub">Cantidad disponible · todas las bodegas</div><div class="mcp-big">' + q2(tot) + "</div>" +
        (r.stock || []).map(function (g) {
          var hh = '<div class="mcp-grp"><div class="mcp-gh"><span>▾ ' + e(g.nombre) + (g.nota ? "<small>" + e(g.nota) + "</small>" : "") + '</span><span class="mcp-gq">' + q2(g.cantidad) + " u</span></div>";
          if (g.grupo === "CABINA") {
            hh += (g.subs || []).map(function (s) { return '<div class="mcp-sr' + (Number(s.cantidad) ? "" : " vac") + '"><span>' + e(s.nombre) + "</span><span>" + q2(s.cantidad) + "</span></div>"; }).join("");
            if (g.abierto) hh += '<div class="mcp-sr"><span>Abierto en uso</span><span>' + q2(g.abierto) + " " + e(g.unidad || "") + "</span></div>";
            var ab = r.abiertos || {}, ks = Object.keys(ab);
            if (ks.length) hh += '<div class="mcp-sr"><span>Aperturas registradas</span><span>' + ks.map(function (k) { return e(k.replace("CABINA_", "Cabina ").replace("LOCAL", "Local")) + ": " + q2(ab[k]); }).join(" · ") + "</span></div>";
          }
          return hh + "</div>";
        }).join("") +
        (p.cabina ? '<p class="note" style="margin-top:8px">Cabina ' + e(p.cabina.codigo) + ": envase de " + q2(p.cabina.contenido_envase) + " " + e(p.cabina.unidad) + (p.cabina.ubicacion ? " · ubicación " + e(p.cabina.ubicacion) : "") + (p.cabina.ubicacion_local ? " · oficina " + e(p.cabina.ubicacion_local) : "") + (p.cabina.minimo_envases ? " · mínimo " + q2(p.cabina.minimo_envases) : "") + "</p>" : "") +
        '<p class="note">Solo se muestra cómo están hoy las bodegas; no se movió stock. Lo que no tiene cabina asignada queda en «Sin cabina asignada».</p></div>';
    }
    var ed = pr.editadoBeta || [];
    var badge = function (k) { return ed.indexOf(k) >= 0 ? ' <span class="mcp-tag beta">editado en beta</span>' : ""; };
    var right = '<div class="mcp-card"><div class="card-title">Precios y costo</div>' +
      '<div class="mcp-sub">Precio PVP (con IVA)' + badge("pvp") + '</div><div class="mcp-pvp">' + V("beta_pvp") + "</div>" +
      '<div class="mcp-ref">Sin IVA ' + $m(pr.subtotal) + (pr.pvpCatalogo && ed.indexOf("pvp") >= 0 ? " · sistema actual " + $m(pr.pvpCatalogo) : "") + "</div>";
    if (!serv) {
      if (MC.verCostos) {
        right += '<div class="mcp-pr"><span>Compra real' + badge("compraReal") + '<br><span class="mcp-ref">entra a la utilidad' + (pr.compraRealSistema != null && ed.indexOf("compraReal") >= 0 ? " · sistema " + $m(pr.compraRealSistema) : "") + "</span></span>" + V("beta_compra_real") + "</div>" +
          '<div class="mcp-pr"><span>Compra para comisiones' + badge("compraComision") + '<br><span class="mcp-ref">entra solo a la comisión' + (pr.compraComisionCatalogo != null && ed.indexOf("compraComision") >= 0 ? " · sistema " + $m(pr.compraComisionCatalogo) : "") + "</span></span>" + V("beta_compra_comision") + "</div>";
      }
      right += '<div class="mcp-pr"><span>Comisión por unidad<br><span class="mcp-ref">30 % × (precio sin IVA − compra para comisiones)</span></span><b>' + $m(pr.comision) + "</b></div>";
      if (MC.verCostos) right += '<div class="mcp-pr"><span>Utilidad por unidad</span><b>' + $m(pr.utilidad) + ' <span class="mcp-ref">' + q2(pr.margenPct) + " %</span></b></div>";
    } else {
      right += '<p class="note" style="margin-top:8px">Servicio: sin stock. La comisión de faciales y paquetes sale de Configuración general.</p>';
    }
    var hist = r.preciosHist || [];
    if (hist.length) right += '<div class="mcp-sub" style="margin-top:10px">Historial de precios y costos</div><table class="mcp-mini"><tbody>' + hist.slice(0, 15).map(function (x) {
      return "<tr><td>" + e(fecha(x.fecha)) + "</td><td>" + e({ pvp: "PVP", compra_real: "Compra real", compra_comision: "Compra comisión" }[x.campo] || x.campo) + '</td><td class="num">' + (x.antes == null ? "sistema" : $m(x.antes)) + " → " + (x.despues == null ? "sistema" : $m(x.despues)) + "</td><td>" + e(x.motivo || "") + '<br><span class="mcp-ref">' + e(x.actor) + "</span></td></tr>";
    }).join("") + "</tbody></table>";
    right += "</div>";
    return serv ? '<div class="mcp-cols"><div>' + right + "</div><div></div></div>" : '<div class="mcp-cols">' + left + right + "</div>";
  }
  function mini(cols, rows, vacio) {
    if (!rows.length) return '<p class="note">' + e(vacio) + "</p>";
    return '<div class="sheet-scroll"><table class="mcp-mini"><thead><tr>' + cols.map(function (c) { return "<th" + (c[2] ? ' class="num"' : "") + ">" + e(c[1]) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr>" + cols.map(function (c) { var v = typeof c[0] === "function" ? c[0](r) : e(r[c[0]] == null ? "" : r[c[0]]); return "<td" + (c[2] ? ' class="num"' : "") + ">" + v + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  }
  function tabProveedores() {
    var cols = [["proveedor", "Proveedor"], [function (r) { return e(fecha(r.ultimaFecha)); }, "Última compra"], ["compras", "Compras", 1], ["unidades", "Unidades", 1]];
    if (MC.verCostos) cols.push([function (r) { return r.ultimoPrecio ? $m(r.ultimoPrecio) : "—"; }, "Último costo", 1]);
    cols.push(["nota", "Nota"]);
    return '<div class="mcp-card">' + mini(cols, MC.cur.proveedores || [], "Sin proveedores registrados para este producto.") + "</div>";
  }
  function tabHistorial() {
    var cols = [["tipo", "Tipo"], [function (r) { return e(fecha(r.fecha)); }, "Fecha"], ["doc", "Documento"], ["quien", "Quién / proveedor"], ["cliente", "Clienta"], ["cantidad", "Cant.", 1]];
    if (MC.verCostos) cols.push([function (r) { return r.precio ? $m(r.precio) : ""; }, "Precio", 1]);
    cols.push(["estado", "Estado"]);
    return '<div class="mcp-card"><div class="mcp-sub" style="margin-bottom:6px">Tickets, órdenes de compra y cotizaciones (últimos 150).</div>' + mini(cols, MC.cur.historial || [], "Sin tickets, órdenes ni cotizaciones con este producto.") + "</div>";
  }
  function tabMov() {
    var k = MC.cur.kardex || [];
    var kcols = [[function (r) { return e(fecha(r.fecha)); }, "Fecha"], ["tipo", "Tipo"], ["bodega", "Bodega"], ["sububicacion", "Sububic."], [function (r) { return (r.delta > 0 ? "+" : "") + q2(r.delta); }, "Cantidad", 1], [function (r) { return q2(r.saldo); }, "Saldo", 1], [function (r) { return e(r.doc || r.ticket); }, "Documento"], ["actor", "Quién"], ["nota", "Nota"]];
    var c = (MC.cur.cambios || []).filter(function (x) { return x.cambios; });
    var ccols = [[function (r) { return e(fecha(r.fecha)); }, "Fecha"], ["actor", "Quién"], [function (r) {
      return Object.keys(r.cambios || {}).map(function (f) { var d = r.cambios[f] || {}; return "<b>" + e(CAMPOS[f] || f) + "</b>: " + e(d.antes == null ? "—" : d.antes) + " → " + e(d.despues == null ? "—" : d.despues); }).join("<br>");
    }, "Cambio"], ["motivo", "Motivo"]];
    return '<div class="mcp-card"><div class="card-title">Kardex (beta)</div>' + mini(kcols, k, "Sin movimientos en el kardex de la beta.") +
      '<div class="card-title" style="margin-top:14px">Cambios de la ficha</div>' + mini(ccols, c, "Sin cambios registrados.") + "</div>";
  }
  function cuerpo() {
    if (MC.tab === "proveedores") return tabProveedores();
    if (MC.tab === "historial") return tabHistorial();
    if (MC.tab === "movimientos") return tabMov();
    return resumen();
  }
  function fichaHtml() {
    return '<div class="mcp mcp-ficha"><div class="mcp-top"><button class="btn ghost small" type="button" id="mcp-volver">← Productos</button></div>' +
      '<div id="mcp-head">' + head() + "</div>" + tabs() + '<div id="mcp-cuerpo">' + cuerpo() + "</div></div>";
  }
  function repintar(foco) {
    var h = document.getElementById("mcp-head"), c = document.getElementById("mcp-cuerpo"), t = document.querySelector(".mcp-tabs");
    if (h) h.innerHTML = head();
    if (c) c.innerHTML = cuerpo();
    if (t) t.outerHTML = tabs();
    if (foco) { var i = document.querySelector("[data-mcp-in]"); if (i) { i.focus(); try { if (i.select) i.select(); } catch (x) { /* select */ } } }
  }
  function setVal(k, v) {
    var b = base(k);
    if (PRECIO[k]) { var x = String(v).trim() === "" ? null : Number(String(v).replace(",", ".")); v = x; if (b != null && x != null && Math.abs(Number(b) - x) < 0.005) { delete MC.ch[k]; return; } }
    if (k === "activo") v = v !== "false";
    var same = (b == null ? "" : String(b)) === (v == null ? "" : String(v));
    if (same) delete MC.ch[k]; else MC.ch[k] = v;
  }
  async function renderFicha(id) {
    MC.ch = {}; MC.ed = null; MC.motivo = "";
    var d = await api("mcprod_get", { id: id });
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + '</p><button class="btn ghost small" type="button" data-go="#/m/productos">← Productos</button>';
    MC.cur = d; MC.admin = !!d.admin; MC.verCostos = !!d.verCostos;
    return fichaHtml();
  }
  function resize(file, max, q) {
    return new Promise(function (ok, bad) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.width, h = img.height, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
        var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", q));
      };
      img.onerror = function () { URL.revokeObjectURL(url); bad(new Error("No se pudo leer la imagen")); };
      img.src = url;
    });
  }
  async function guardar() {
    var cambios = {}, ch = MC.ch;
    Object.keys(ch).forEach(function (k) { cambios[k] = ch[k]; });
    var mot = document.getElementById("mcp-motivo");
    if (mot) MC.motivo = mot.value;
    if (hayPrecio() && String(MC.motivo || "").trim().length < 3) { alert("Escribe el motivo del cambio de precio o costo."); if (mot) mot.focus(); return; }
    var bt = document.getElementById("mcp-guardar"); if (bt) { bt.disabled = true; bt.textContent = "Guardando…"; }
    var r = await api("mcprod_save", { id: MC.cur.producto.id, cambios: cambios, motivo: MC.motivo });
    if (!r || r.error) { if (bt) { bt.disabled = false; bt.textContent = "Guardar"; } alert((r && r.error) || "No se pudo guardar"); return; }
    MC.listAt = 0;
    var d = await api("mcprod_get", { id: MC.cur.producto.id });
    if (d && d.ok) MC.cur = d;
    MC.ch = {}; MC.ed = null; MC.motivo = "";
    repintar();
  }
  function wireFicha(main) {
    var host = main.querySelector(".mcp-ficha");
    if (!host) return;
    host.addEventListener("click", function (ev) {
      var t = ev.target;
      if (t.closest("#mcp-volver")) { if (Object.keys(MC.ch).length && !confirm("Hay cambios sin guardar. ¿Salir sin guardar?")) return; go("#/m/productos"); return; }
      var tb = t.closest("[data-mcp-tab]"); if (tb) { MC.tab = tb.getAttribute("data-mcp-tab"); repintar(); return; }
      var ed = t.closest("[data-mcp-ed]"); if (ed && puede()) { MC.ed = ed.getAttribute("data-mcp-ed"); repintar(true); return; }
      if (t.closest("#mcp-guardar")) { void guardar(); return; }
      if (t.closest("#mcp-descartar")) { MC.ch = {}; MC.ed = null; MC.motivo = ""; repintar(); return; }
      if (t.closest("#mcp-foto")) {
        if (puede()) { var f = document.getElementById("mcp-file"); if (f) f.click(); }
        else { var im = host.querySelector("#mcp-foto img"); if (im) window.open(im.src, "_blank"); }
      }
    });
    host.addEventListener("input", function (ev) {
      var k = ev.target.getAttribute && ev.target.getAttribute("data-mcp-in");
      if (ev.target.id === "mcp-motivo") { MC.motivo = ev.target.value; return; }
      if (!k || ev.target.tagName === "SELECT") return;
      setVal(k, ev.target.value);
      var bar = document.getElementById("mcp-savebar"); if (bar) bar.hidden = !Object.keys(MC.ch).length;
    });
    host.addEventListener("change", function (ev) {
      var k = ev.target.getAttribute && ev.target.getAttribute("data-mcp-in");
      if (k && ev.target.tagName === "SELECT") { setVal(k, ev.target.value); MC.ed = null; repintar(); }
      if (ev.target.id === "mcp-file" && ev.target.files && ev.target.files[0]) {
        var file = ev.target.files[0];
        var ph = document.getElementById("mcp-foto"); if (ph) ph.innerHTML = '<span class="mcp-sub">Subiendo…</span>';
        Promise.all([resize(file, 1000, 0.82), resize(file, 96, 0.7)]).then(function (x) {
          return api("mcprod_foto", { id: MC.cur.producto.id, foto_b64: x[0], thumb_b64: x[1], nombre: file.name });
        }).then(function (r) {
          if (!r || r.error) throw new Error((r && r.error) || "No se pudo subir");
          MC.listAt = 0;
          return api("mcprod_get", { id: MC.cur.producto.id });
        }).then(function (d) { if (d && d.ok) { var keep = MC.ch; MC.cur = d; MC.ch = keep; } repintar(); })
          .catch(function (err) { alert(err.message || err); repintar(); });
      }
    });
    host.addEventListener("focusout", function (ev) {
      var k = ev.target.getAttribute && ev.target.getAttribute("data-mcp-in");
      if (!k) return;
      setTimeout(function () { if (MC.ed === k) { MC.ed = null; repintar(); } }, 120);
    });
    host.addEventListener("keydown", function (ev) {
      var k = ev.target.getAttribute && ev.target.getAttribute("data-mcp-in");
      if (!k) return;
      if (ev.key === "Enter") ev.target.blur();
      if (ev.key === "Escape") { delete MC.ch[k]; MC.ed = null; repintar(); }
    });
  }

  // ---------- Nuevo ----------
  async function nuevoHtml() {
    if (!(typeof state !== "undefined" && state.admin)) return '<p class="err">Solo un admin crea productos.</p>';
    var r = await api("mcprod_familias", {});
    if (!r || r.error) return '<p class="err">' + e((r && r.error) || "No se pudieron leer las familias de SKU") + "</p>";
    MC.familias = r.familias || [];
    var opts = MC.familias.map(function (f) {
      var cl = Object.keys(f.clases || {}).sort(function (a, b) { return f.clases[b] - f.clases[a]; })[0] || "";
      return '<option value="' + e(f.prefijo) + '">' + e(f.etiqueta) + " · " + f.total + " SKU · último " + e(f.ejemplo) + (cl ? " · " + e(cl) : "") + "</option>";
    }).join("");
    var filas = MC.familias.map(function (f) {
      return "<tr><td><b>" + e(f.prefijo === "#" ? "01, 02…" : f.prefijo) + "</b></td><td>" + f.total + "</td><td>" + e(f.ejemplo) + '</td><td class="mcp-sku">' + e(f.siguiente) + "</td></tr>";
    }).join("");
    return '<div class="mcp"><div class="mcp-top"><button class="btn ghost small" type="button" data-go="#/m/productos">← Productos</button></div>' +
      '<form class="mcp-card" id="mcp-f-nuevo"><div class="card-title">Nuevo producto</div><div class="mcp-form">' +
      '<label>Tipo<select name="tipo"><option value="producto">Inventariable</option><option value="servicio">Servicio</option></select></label>' +
      '<label>Familia de SKU<select name="familia" id="mcp-fam" required><option value="">Elige la familia…</option>' + opts + '<option value="__nueva">+ Nueva familia…</option></select></label>' +
      '<label id="mcp-fam-nueva-l" style="display:none">Prefijo nuevo (2 a 5 letras)<input name="prefijo_nuevo" id="mcp-fam-nueva" maxlength="6" placeholder="KR-"></label>' +
      '<label>SKU asignado<input id="mcp-sku-prev" readonly class="mcp-sku"></label>' +
      '<label>Nombre<input name="nombre" required></label>' +
      '<label>Marca<input name="marca"></label>' +
      '<label>Categoría<input name="categoria"></label>' +
      '<label>Uso<select name="uso"><option value="venta">Venta (Consignación)</option><option value="cabina">Cabina</option><option value="ambos">Ambos</option></select></label>' +
      '<label>PVP con IVA<input name="pvp" inputmode="decimal"></label>' +
      '</div><p class="note">El SKU lo asigna el servidor: el siguiente libre después del mayor de la familia, revisado contra productos, catálogo e inventario de cabina. Los SKU que ya existen no cambian. Se crea en la beta; el catálogo del sistema actual no cambia.</p><p class="err" id="mcp-f-err"></p>' +
      '<button class="btn" type="submit">Crear producto</button></form>' +
      '<div class="mcp-card"><div class="card-title">Familias de SKU detectadas</div><table class="mcp-mini"><thead><tr><th>Familia</th><th>SKU</th><th>Último</th><th>Siguiente</th></tr></thead><tbody>' + filas + "</tbody></table></div></div>";
  }
  function wireNuevo(main) {
    var f = main.querySelector("#mcp-f-nuevo");
    if (!f) return;
    var sel = f.querySelector("#mcp-fam"), nueva = f.querySelector("#mcp-fam-nueva"), nuevaL = f.querySelector("#mcp-fam-nueva-l"), prev = f.querySelector("#mcp-sku-prev");
    function prefijoNuevo() {
      var p = String(nueva.value || "").trim().toUpperCase();
      if (p && p.slice(-1) !== "-") p += "-";
      return /^[A-Z]{2,5}-$/.test(p) ? p : "";
    }
    function pinta() {
      var esNueva = sel.value === "__nueva";
      nuevaL.style.display = esNueva ? "" : "none";
      if (esNueva) {
        var p = prefijoNuevo();
        var ya = (MC.familias || []).some(function (x) { return x.prefijo === p; });
        prev.value = !p ? "Escribe el prefijo" : ya ? p + " ya existe: elígelo en la lista" : p + "001";
        return;
      }
      var fam = (MC.familias || []).find(function (x) { return x.prefijo === sel.value; });
      prev.value = fam ? fam.siguiente + " (se confirma al guardar)" : "Elige una familia";
    }
    sel.addEventListener("change", pinta);
    nueva.addEventListener("input", pinta);
    var tipo = f.querySelector("[name=tipo]");
    tipo.addEventListener("change", function () {
      if (tipo.value === "servicio" && (MC.familias || []).some(function (x) { return x.prefijo === "#"; })) { sel.value = "#"; pinta(); }
    });
    pinta();
    f.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var body = Object.fromEntries(new FormData(f).entries());
      var er = f.querySelector("#mcp-f-err");
      if (body.familia === "__nueva") {
        var p = prefijoNuevo();
        if (!p) { er.textContent = "El prefijo nuevo va con 2 a 5 letras, por ejemplo KR-"; return; }
        body.familia = p; body.familia_nueva = true;
      }
      delete body.prefijo_nuevo;
      var r = await api("mcprod_nuevo", body);
      if (!r || r.error) { if (er) er.textContent = (r && r.error) || "No se pudo crear"; return; }
      MC.listAt = 0;
      if (typeof toast === "function") try { toast("Creado " + r.sku); } catch (x) {}
      go("#/m/productos/p/" + encodeURIComponent(r.id));
    });
  }

  window.MCProductos = {
    render: async function (route) {
      css();
      if (route.sub === "p" && route.id) return renderFicha(route.id);
      if (route.sub === "nuevo") return nuevoHtml();
      MC.tab = "resumen";
      return renderLista();
    },
    wire: function (main, route) {
      if (route.sub === "p") return wireFicha(main);
      if (route.sub === "nuevo") return wireNuevo(main);
      return wireLista(main);
    },
    dirty: function () { return Object.keys(MC.ch).length > 0; },
    _mc: MC,
  };
})();
