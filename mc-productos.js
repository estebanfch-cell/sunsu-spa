// Productos estilo MineCore (lista única + ficha), con el tema de Sunsu.
// Portado de MineCore portal (index.html: Inv / MCVsel PF2 / MCProd2) y conectado a la función api de Sunsu
// con las acciones mcprod_list, mcprod_get, mcprod_save, mcprod_foto y mcprod_nuevo.
// Regla de la beta: el admin edita en línea (toca el dato); la barra Guardar/Descartar aparece solo si hay cambios.
// Quien no es admin solo ve; los costos solo con ver_costos.
(function () {
  "use strict";
  var MC = {
    list: null, listAt: 0, admin: false, verCostos: false, filtrosData: null,
    f: { q: "", tipo: "", sub: "", bodega: "", marca: "", categoria: "", estado: "", linea: "", activo: "" }, orden: null,
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
      ".mcp-sort{cursor:pointer;user-select:none;white-space:nowrap}.mcp-ck{width:34px}.mcp-ck input{width:18px;height:18px;margin:0}",
      ".mcp-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.mcp-acc{display:flex;gap:6px;flex-wrap:wrap;align-items:center}",
      ".mcp-danger{color:var(--red)!important;border-color:var(--red)!important}",
      ".mcp-af{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--gray-l)}.mcp-afb{border:0;background:none;color:var(--navy);font:inherit;cursor:pointer;text-align:left}",
      ".mcp-bars svg{display:block;margin-top:4px}.mcp-bars rect{fill:#1f2d3d}",
      ".mcp-mini input,.mcp-mini select{padding:6px 8px;border:1.5px solid var(--cream-d);border-radius:8px;font:inherit;font-size:.8rem}",
      ".mcp-bulk{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--navy);color:#fff;border-radius:12px;padding:8px 12px;margin:0 0 10px}.mcp-bulk .btn{background:#fff;color:var(--navy)}",
      ".mcp-colsp{background:var(--white);border:1.5px solid var(--cream-d);border-radius:12px;padding:10px 12px;margin:0 0 10px;display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center}",
      ".mcp-colsp label{display:flex;gap:6px;align-items:center;font-size:.8rem;color:var(--text)}.mcp-colsp input{width:auto;margin:0}",
      "@media(max-width:820px){.mcp-head{flex-direction:column}.mcp-ph{flex:none;width:100%;height:210px}.mcp-cols{grid-template-columns:1fr}.mcp-tbl .mcp-hide{display:none}.mcp-g{grid-template-columns:1fr}}",
    ].join("");
    document.head.appendChild(s);
  }

  // ---------- Lista ----------
  async function cargarLista(force) {
    var elim = !!MC.verElim;
    if (!force && MC.list && MC.listElim === elim && Date.now() - MC.listAt < 60000) return { ok: true };
    var d = await api("mcprod_list", elim ? { eliminados: true } : {});
    if (!d || d.error) return d || { error: "No se pudo cargar" };
    MC.list = d.items || [];
    MC.listAt = Date.now(); MC.listElim = elim; MC.eliminadosN = d.eliminados || 0; MC.sel = {};
    MC.admin = !!d.admin;
    MC.verCostos = !!d.verCostos;
    MC.filtrosData = d.filtros || { marcas: [], categorias: [] };
    return { ok: true };
  }
  // Columnas (como MineCore): el usuario elige cuáles ve; se guarda en este equipo.
  var COLS = [
    { id: "sku", t: "SKU", def: 1 }, { id: "tipo", t: "Tipo", def: 1 }, { id: "categoria", t: "Categoría", def: 1, hide: 1 },
    { id: "marca", t: "Marca", def: 1, hide: 1 }, { id: "pvp", t: "PVP", num: 1 },
    { id: "costo", t: "Costo", num: 1, costos: 1 }, { id: "margen", t: "Margen", num: 1, costos: 1 },
    { id: "g_CONSIGNACION", t: "Consignación", num: 1 }, { id: "g_CABINA", t: "Bodega Cabina", num: 1 }, { id: "g_OFICINA", t: "Bodega Oficina", num: 1 },
    { id: "stock", t: "Stock", def: 1, num: 1 },
  ];
  var COLS_KEY = "sunsu.mcp.cols";
  function colsVis() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(COLS_KEY) || "null"); } catch (x) { saved = null; }
    return COLS.filter(function (c) { return (!c.costos || MC.verCostos) && (Array.isArray(saved) ? saved.indexOf(c.id) >= 0 : c.def); });
  }
  function guardarCols(ids) { try { localStorage.setItem(COLS_KEY, JSON.stringify(ids)); } catch (x) {} }
  // Árbol de categorías: tipo → subtipo → categoría.
  var ARBOL = [["inventariable", "Inventariable", ["Producto", "Insumo cabina"]], ["servicio", "Servicio", ["Facial", "Facial especial", "Add-on", "Paquete", "Gift card", "Servicio"]]];
  function valor(p, id) {
    if (id === "sku") return p.skuVisible || p.sku;
    if (id === "tipo") return p.tipo;
    if (id === "pvp") return Number(p.pvp) || 0;
    if (id === "costo") return Number(p.compraReal) || 0;
    if (id === "margen") return Number(p.margenPct) || 0;
    if (id === "stock") return p.tipo === "servicio" ? -1 : Number(p.stock) || 0;
    if (id.indexOf("g_") === 0) return Number((p.porGrupo || {})[id.slice(2)]) || 0;
    return String(p[id] || "");
  }
  function filtrar() {
    var f = MC.f, qq = norm(f.q).trim();
    var rows = (MC.list || []).filter(function (p) {
      if (f.tipo && p.tipo !== f.tipo) return false;
      if (f.sub && p.subtipo !== f.sub) return false;
      if (f.marca && p.marca !== f.marca) return false;
      if (f.categoria && p.categoria !== f.categoria) return false;
      if (f.bodega && !(p.porGrupo && Number(p.porGrupo[f.bodega]) > 0)) return false;
      var act = f.activo || (f.estado === "inactivos" ? "inactivos" : "");
      if (act === "inactivos") { if (p.activo !== false) return false; }
      else if (act !== "todos" && p.activo === false && !qq) return false;
      if (f.estado === "con" && !(Number(p.stock) > 0)) return false;
      if (f.estado === "bajo" && p.estado !== "bajo") return false;
      if (f.estado === "agotado" && p.estado !== "agotado") return false;
      return true;
    });
    // Buscador común (mc-buscar.js): SKU con o sin guion, nombre, marca, SKU proveedor y código de barras.
    // INV-000123 (código viejo de 6 dígitos) busca también INV-123.
    if (qq) {
      var m6 = qq.match(/^(?:sunsu-)?inv-?(\d{4,})$/), q2b = m6 ? "inv-" + String(Number(m6[1])).padStart(3, "0") : f.q;
      rows = window.MCBuscar.filtrar(rows, q2b, function (p) {
        return [[p.sku, p.skuVisible, p.skuAlias, p.codigoCabina, p.skuProveedor].concat(p.skuAntes || [], p.barras || []), [p.nombre, p.marca, p.categoria, p.subtipo]];
      });
    }
    if (MC.orden && MC.orden.col) {
      var c = MC.orden.col, dir = MC.orden.dir === "desc" ? -1 : 1;
      rows = rows.slice().sort(function (a, b) {
        var x = c === "nombre" ? String(a.nombre || "") : valor(a, c), y = c === "nombre" ? String(b.nombre || "") : valor(b, c);
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es", { numeric: true })) * dir;
      });
    }
    return rows;
  }
  function iniciales(n) { return e(String(n || "?").replace(/[^A-Za-zÁÉÍÓÚÑ0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase() || "?"); }
  function thumb(p) { return '<div class="mcp-th">' + (p.foto_thumb ? '<img src="' + e(p.foto_thumb) + '" alt="">' : iniciales(p.nombre)) + "</div>"; }
  function money(v) { return v == null || v === "" ? "—" : "$" + (Number(v) || 0).toFixed(2); }
  function celda(p, c) {
    var cls = (c.num ? "num" : "") + (c.hide ? " mcp-hide" : "");
    var v;
    if (c.id === "sku") v = '<span class="mcp-sku">' + e(p.skuVisible || p.sku) + "</span>" + (p.skuAlias ? '<span class="mcp-sub" style="display:block" title="Código interno (tickets, paquetes)">alias ' + e(p.skuAlias) + "</span>" : "");
    else if (c.id === "tipo") v = p.tipo === "servicio" ? '<span class="mcp-tag serv">Servicio</span>' : '<span class="mcp-tag">Inventariable</span>';
    else if (c.id === "stock") v = p.tipo === "servicio" ? '<span class="mcp-sub">—</span>' : "<b>" + q2(p.stock) + "</b>" + (p.estado === "agotado" ? ' <span class="mcp-tag agot">agotado</span>' : p.estado === "bajo" ? ' <span class="mcp-tag bajo">bajo</span>' : "");
    else if (c.id === "pvp") v = money(p.pvp);
    else if (c.id === "costo") v = money(p.compraReal);
    else if (c.id === "margen") v = p.margenPct == null ? "—" : q2(Math.round(Number(p.margenPct) * 10) / 10) + "%";
    else if (c.id.indexOf("g_") === 0) v = p.tipo === "servicio" ? '<span class="mcp-sub">—</span>' : q2((p.porGrupo || {})[c.id.slice(2)] || 0);
    else v = e(p[c.id] || "—");
    return '<td class="' + cls + '">' + v + "</td>";
  }
  function filasHtml() {
    var rows = filtrar(), cols = colsVis();
    var cnt = document.getElementById("mcp-count");
    if (cnt) cnt.textContent = rows.length + " de " + (MC.list || []).length + " productos";
    MC.vis = rows.map(function (p) { return p.id; });
    if (!rows.length) return '<tr><td colspan="' + (cols.length + 2) + '" class="mcp-sub" style="padding:18px">Sin productos con ese filtro.</td></tr>';
    return rows.map(function (p) {
      return '<tr class="mcp-row" data-mcp-id="' + e(p.id) + '">' + (MC.admin ? '<td class="mcp-ck"><input type="checkbox" data-mcp-sel="' + e(p.id) + '"' + (MC.sel && MC.sel[p.id] ? " checked" : "") + ' aria-label="Elegir"></td>' : "") + '<td><div class="mcp-pn">' + thumb(p) + "<div><b>" + e(p.nombre) + '</b><span class="mcp-sub">' + e(p.subtipo) + (p.activo === false ? " · inactivo" : "") + "</span></div></div></td>" +
        cols.map(function (c) { return celda(p, c); }).join("") + "</tr>";
    }).join("");
  }
  function cabeceraHtml() {
    var o = MC.orden || {};
    var th = function (id, t, cls) { return '<th class="' + (cls || "") + ' mcp-sort" data-mcp-sort="' + id + '">' + e(t) + (o.col === id ? (o.dir === "desc" ? " ▾" : " ▴") : "") + "</th>"; };
    return "<tr>" + (MC.admin ? '<th class="mcp-ck"><input type="checkbox" id="mcp-selall" aria-label="Elegir todos"></th>' : "") + th("nombre", "Producto") + colsVis().map(function (c) { return th(c.id, c.t, (c.num ? "num" : "") + (c.hide ? " mcp-hide" : "")); }).join("") + "</tr>";
  }
  function colsPanelHtml() {
    var vis = colsVis().map(function (c) { return c.id; });
    return '<div class="mcp-colsp" id="mcp-colsp" hidden><div class="mcp-sub" style="margin-bottom:6px">Columnas que ves (se guarda en este equipo)</div>' +
      COLS.filter(function (c) { return !c.costos || MC.verCostos; }).map(function (c) {
        return '<label><input type="checkbox" data-mcp-col="' + e(c.id) + '"' + (vis.indexOf(c.id) >= 0 ? " checked" : "") + "> " + e(c.t) + "</label>";
      }).join("") + '<button class="btn ghost small" type="button" id="mcp-cols-def">Volver a las de siempre</button></div>';
  }
  function opt(v, t, cur) { return '<option value="' + e(v) + '"' + (String(v) === String(cur) ? " selected" : "") + ">" + e(t) + "</option>"; }
  function arbolSel(f) {
    var cur = f.sub ? "s:" + f.sub : f.tipo ? "t:" + f.tipo : "";
    return '<select id="mcp-f-arbol" aria-label="Tipo y categoría">' + opt("", "Todos los tipos", cur) + ARBOL.map(function (t) {
      return '<optgroup label="' + e(t[1]) + '">' + opt("t:" + t[0], "Todo " + t[1].toLowerCase(), cur) + t[2].map(function (s2) { return opt("s:" + s2, "· " + s2, cur); }).join("") + "</optgroup>";
    }).join("") + "</select>";
  }
  async function renderLista() {
    var r = await cargarLista(false);
    if (r && r.error) return '<p class="err">' + e(r.error) + "</p>";
    var f = MC.f, fd = MC.filtrosData || {};
    var nuevo = MC.admin ? '<button class="btn small" type="button" id="mcp-nuevo">+ Nuevo producto</button>' : "";
    return '<div class="mcp">' +
      '<div class="mcp-bar"><input class="mcp-q" id="mcp-q" type="search" placeholder="Buscar producto, SKU, marca o código" aria-label="Buscar producto, SKU, marca o código" value="' + e(f.q) + '">' + nuevo + "</div>" +
      '<div class="mcp-bar">' + arbolSel(f) +
      '<select id="mcp-f-bodega" aria-label="Bodega">' + opt("", "Todas las bodegas", f.bodega) + GRUPOS.map(function (g) { return opt(g[0], g[1], f.bodega); }).join("") + "</select>" +
      '<select id="mcp-f-marca" aria-label="Marca">' + opt("", "Todas las marcas", f.marca) + (fd.marcas || []).map(function (m) { return opt(m, m, f.marca); }).join("") + "</select>" +
      '<select id="mcp-f-categoria" aria-label="Categoría">' + opt("", "Todas las categorías", f.categoria) + (fd.categorias || []).map(function (m) { return opt(m, m, f.categoria); }).join("") + "</select>" +
      '<select id="mcp-f-estado" aria-label="Stock">' + opt("", "Todo el stock", f.estado) + opt("con", "Con stock", f.estado) + opt("bajo", "Stock bajo", f.estado) + opt("agotado", "Agotado", f.estado) + "</select>" +
      '<select id="mcp-f-activo" aria-label="Activo">' + opt("", "Activos", f.activo) + opt("inactivos", "Inactivos / archivados", f.activo) + opt("todos", "Activos e inactivos", f.activo) + "</select>" +
      '<button class="btn ghost small" type="button" id="mcp-cols">Columnas</button>' +
      '<button class="btn ghost small" type="button" id="mcp-limpiar">Limpiar</button></div>' + colsPanelHtml() +
      (MC.admin && (MC.eliminadosN || MC.verElim) ? '<p><button class="btn ghost small" type="button" id="mcp-elim">' + (MC.verElim ? "← Volver a productos" : "Eliminados (" + MC.eliminadosN + ")") + "</button>" + (MC.verElim ? ' <span class="mcp-sub">Productos eliminados: elige y restaura.</span>' : "") + "</p>" : "") +
      '<div class="mcp-bulk" id="mcp-bulk" hidden></div>' +
      '<div class="mcp-count" id="mcp-count"></div>' +
      '<div class="sheet-scroll"><table class="mcp-tbl"><thead id="mcp-head">' + cabeceraHtml() + '</thead><tbody id="mcp-body"></tbody></table></div>' +
      '<p class="note">Una sola lista: catálogo, Cabina y productos de la beta unidos por código. Consignación = bodega VENTA · Bodega Cabina = Cabina 1/2/3 · Bodega Oficina = CASA. Toca un encabezado para ordenar. <a href="#/m/productos/catalogo">Catálogo anterior</a></p>' +
      "</div>";
  }
  function wireLista(main) {
    var body = main.querySelector("#mcp-body");
    if (!body) return;
    var head = main.querySelector("#mcp-head");
    var pintar = function () { body.innerHTML = filasHtml(); if (head) head.innerHTML = cabeceraHtml(); };
    pintar();
    var q = main.querySelector("#mcp-q");
    if (q) q.addEventListener("input", function () { MC.f.q = q.value; pintar(); });
    ["bodega", "marca", "categoria", "estado", "activo"].forEach(function (k) {
      var s = main.querySelector("#mcp-f-" + k);
      if (s) s.addEventListener("change", function () { MC.f[k] = s.value; pintar(); });
    });
    var ar = main.querySelector("#mcp-f-arbol");
    if (ar) ar.addEventListener("change", function () {
      var v = ar.value;
      MC.f.tipo = v.indexOf("t:") === 0 ? v.slice(2) : "";
      MC.f.sub = v.indexOf("s:") === 0 ? v.slice(2) : "";
      if (MC.f.sub) ARBOL.forEach(function (t) { if (t[2].indexOf(MC.f.sub) >= 0) MC.f.tipo = t[0]; });
      pintar();
    });
    if (head) head.addEventListener("click", function (ev) {
      var th = ev.target.closest("[data-mcp-sort]");
      if (!th) return;
      var c = th.getAttribute("data-mcp-sort"), o = MC.orden || {};
      MC.orden = o.col === c ? { col: c, dir: o.dir === "desc" ? "asc" : "desc" } : { col: c, dir: "asc" };
      pintar();
    });
    var cb = main.querySelector("#mcp-cols"), cp = main.querySelector("#mcp-colsp");
    if (cb && cp) cb.onclick = function () { cp.hidden = !cp.hidden; };
    if (cp) {
      cp.querySelectorAll("[data-mcp-col]").forEach(function (x) {
        x.onchange = function () {
          var ids = [].map.call(cp.querySelectorAll("[data-mcp-col]:checked"), function (y) { return y.getAttribute("data-mcp-col"); });
          guardarCols(ids); pintar();
        };
      });
      var dflt = cp.querySelector("#mcp-cols-def");
      if (dflt) dflt.onclick = function () { try { localStorage.removeItem(COLS_KEY); } catch (x) {} go("#/m/productos"); };
    }
    var lim = main.querySelector("#mcp-limpiar");
    if (lim) lim.onclick = function () { MC.f = { q: "", tipo: "", sub: "", bodega: "", marca: "", categoria: "", estado: "", linea: "", activo: "" }; MC.orden = null; go("#/m/productos"); };
    var bulk = main.querySelector("#mcp-bulk");
    var pintaBulk = function () {
      if (!bulk) return;
      var ids = Object.keys(MC.sel || {}).filter(function (k) { return MC.sel[k]; });
      bulk.hidden = !ids.length;
      bulk.innerHTML = ids.length ? "<b>" + ids.length + " elegidos</b>" + (MC.verElim ? '<button class="btn small" type="button" data-mcp-bulk="restaurar">Restaurar</button>' :
        '<button class="btn small" type="button" data-mcp-bulk="archivar">Archivar</button><button class="btn small" type="button" data-mcp-bulk="desarchivar">Desarchivar</button><button class="btn small" type="button" data-mcp-bulk="eliminar">Eliminar</button>') +
        '<button class="btn small" type="button" data-mcp-bulk="limpiar">Quitar selección</button>' : "";
    };
    body.addEventListener("change", function (ev) {
      var id = ev.target.getAttribute && ev.target.getAttribute("data-mcp-sel");
      if (id == null) return;
      MC.sel = MC.sel || {}; MC.sel[id] = ev.target.checked; pintaBulk();
    });
    if (head) head.addEventListener("change", function (ev) {
      if (ev.target.id !== "mcp-selall") return;
      MC.sel = {}; if (ev.target.checked) (MC.vis || []).forEach(function (id) { MC.sel[id] = true; });
      body.innerHTML = filasHtml(); pintaBulk();
    });
    if (bulk) bulk.addEventListener("click", async function (ev) {
      var b = ev.target.closest("[data-mcp-bulk]"); if (!b) return;
      var a = b.getAttribute("data-mcp-bulk"), ids = Object.keys(MC.sel || {}).filter(function (k) { return MC.sel[k]; });
      if (a === "limpiar") { MC.sel = {}; body.innerHTML = filasHtml(); pintaBulk(); return; }
      var cuerpo = { ids: ids, que: a };
      if (a === "eliminar") {
        var c = prompt("Eliminar " + ids.length + " productos. No se borran: dejan de aparecer y se pueden restaurar. Escribe ELIMINAR para confirmar.");
        if (c !== "ELIMINAR") return;
        cuerpo.confirmar = "ELIMINAR";
      } else if (!confirm((a === "archivar" ? "Archivar " : a === "desarchivar" ? "Desarchivar " : "Restaurar ") + ids.length + " productos?")) return;
      var r = await api("mcprod_estado", cuerpo);
      if (!r || r.error) { alert((r && r.error) || "No se pudo"); return; }
      if (typeof toast === "function") try { toast(r.cambiados + " productos: " + a); } catch (x) {}
      MC.listAt = 0; go("#/m/productos");
    });
    var el = main.querySelector("#mcp-elim");
    if (el) el.onclick = function () { MC.verElim = !MC.verElim; MC.listAt = 0; go("#/m/productos"); };
    body.addEventListener("click", function (ev) {
      if (ev.target.closest(".mcp-ck")) return;
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
    beta_descripcion: "Descripción", beta_stock_minimo: "Stock mínimo", beta_punto_reorden: "Punto de reorden",
  };
  function base(k) {
    var p = MC.cur.producto, pr = MC.cur.precios || {};
    if (k === "beta_pvp") return pr.pvp;
    if (k === "beta_compra_real") return pr.compraReal;
    if (k === "beta_compra_comision") return pr.compraComision;
    if (k === "beta_descripcion") return MC.cur.descripcion;
    if (k === "beta_stock_minimo") { var mm = MC.cur.minimos || {}; return mm.minimo != null ? mm.minimo : null; }
    if (k === "beta_punto_reorden") return (MC.cur.minimos || {}).reorden;
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
  function kvMin(k) {
    var mm = (MC.cur && MC.cur.minimos) || {};
    return '<div class="mcp-kv"><span class="mcp-l">' + e(CAMPOS[k]) + (mm.minimo == null && mm.minimoSistema ? ' <span class="mcp-sub">(sistema ' + q2(mm.minimoSistema) + ")</span>" : "") + "</span>" + V(k) + "</div>";
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
      '<div class="mcp-kv"><span class="mcp-l">SKU</span><span class="mcp-v mcp-sku">' + e(p.skuVisible || p.sku) + (p.skuAlias ? ' <span class="mcp-sub">· alias interno ' + e(p.skuAlias) + " (tickets y paquetes)</span>" : p.sku_catalogo && p.sku_catalogo.toUpperCase() !== p.sku ? ' <span class="mcp-sub">(' + e(p.sku_catalogo) + ")</span>" : "") + (p.codigoCabina && p.codigoCabina !== p.sku ? ' <span class="mcp-sub">· Cabina ' + e(p.codigoCabina) + "</span>" : "") + (p.skuAntes && p.skuAntes.length ? ' <span class="mcp-sub">· antes ' + e(p.skuAntes.join(", ")) + "</span>" : "") + "</span></div>" +
      kv("sku_proveedor") + kv("codigo_barras") +
      '<div class="mcp-g">' + kv("marca") + kv("categoria") +
      '<div class="mcp-kv"><span class="mcp-l">Tipo</span><span class="mcp-v">' + e(tipo) + "</span></div>" +
      kv("unidad") + (p.tipo === "servicio" ? "" : kv("bodega_def") + kv("sububicacion_def") + kvMin("beta_stock_minimo") + kv("beta_punto_reorden")) + kv("producto_base") + kv("observaciones") + kv("activo") + "</div>" +
      kv("beta_descripcion") +
      (r.archivado ? '<p class="note"><span class="mcp-tag bajo">Archivado</span> por ' + e(r.archivadoPor) + " · " + e(fecha(r.archivadoAt)) + ". No aparece en la lista activa ni en buscadores.</p>" : "") +
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
    var serv = MC.cur && MC.cur.producto && MC.cur.producto.tipo === "servicio";
    var T = [["resumen", "Resumen"]].concat(serv ? [] : [["proveedores", "Proveedores"]]).concat([["historial", "Historial"]]).concat(serv ? [] : [["movimientos", "Movimientos"], ["codigos", "Códigos de barras"]]).concat([["archivos", "Fotos y archivos"], ["protocolo", serv ? "Protocolo" : "Se usa en"]]);
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
      if (MC.verCostos) right += '<div class="mcp-pr"><span>Costo promedio<br><span class="mcp-ref">ponderado de las compras registradas' + (r.costoPromedio != null ? " · ERP " + $m(r.costoPromedio) : "") + "</span></span><b>" + (r.costoProm != null ? $m(r.costoProm) : "—") + "</b></div>";
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
  // ---------- Paridad MineCore: acciones, precios, proveedores, códigos, archivos, protocolo ----------
  function acciones() {
    var r = MC.cur, p = r.producto;
    if (!puede()) return '<button class="btn ghost small" type="button" id="mcp-pdf">PDF ficha</button>';
    if (r.eliminado) return '<span class="mcp-tag agot">Eliminado por ' + e(r.eliminadoPor) + '</span> <button class="btn small" type="button" data-mcp-acc="restaurar">Restaurar</button>';
    return '<button class="btn ghost small" type="button" id="mcp-pdf">PDF ficha</button>' +
      '<button class="btn ghost small" type="button" id="mcp-dup">Copiar (siguiente SKU)</button>' +
      (r.archivado ? '<button class="btn ghost small" type="button" data-mcp-acc="desarchivar">Desarchivar</button>' : '<button class="btn ghost small" type="button" data-mcp-acc="archivar">Archivar</button>') +
      '<button class="btn ghost small mcp-danger" type="button" data-mcp-acc="eliminar">Eliminar</button>';
  }
  function tabPrecios() {
    var r = MC.cur, can = puede(), L = MC.escalas || (r.escalas || []).map(function (x) { return Object.assign({}, x); });
    MC.escalas = L;
    var costos = MC.verCostos;
    var filas = L.map(function (x, i) {
      if (!can) return "<tr><td>" + e(x.nombre) + '</td><td class="num">' + e(x.desde) + '</td><td class="num">' + (x.pvp != null ? $m(x.pvp) : x.precio != null ? $m(x.precio) : "—") + "</td></tr>";
      return '<tr><td><input data-mcp-es="nombre" data-i="' + i + '" value="' + e(x.nombre) + '" placeholder="Mayorista"></td>' +
        '<td><input data-mcp-es="desde" data-i="' + i + '" inputmode="numeric" value="' + e(x.desde) + '" style="width:70px"></td>' +
        '<td><input data-mcp-es="precio" data-i="' + i + '" inputmode="decimal" value="' + e(x.precio == null ? "" : x.precio) + '" placeholder="fijo con IVA" style="width:110px"></td>' +
        (costos ? '<td><input data-mcp-es="markup" data-i="' + i + '" inputmode="decimal" value="' + e(x.markup == null ? "" : x.markup) + '" placeholder="%" style="width:70px"></td>' : "") +
        '<td class="num">' + (x.pvp != null ? $m(x.pvp) : "—") + '</td><td><button class="btn ghost small" type="button" data-mcp-es-del="' + i + '">Quitar</button></td></tr>';
    }).join("");
    var head = can ? "<tr><th>Escala / lista</th><th>Desde (u)</th><th>Precio fijo</th>" + (costos ? "<th>Markup %</th>" : "") + '<th class="num">PVP</th><th></th></tr>' : '<tr><th>Escala</th><th class="num">Desde</th><th class="num">PVP</th></tr>';
    return '<div class="mcp-card"><div class="card-title">Precio base</div><div class="mcp-pvp">' + V("beta_pvp") + '</div><p class="note">El PVP base se edita aquí o en Resumen (pide motivo).</p>' +
      '<div class="card-title" style="margin-top:12px">Escalas y listas de precio</div>' +
      '<div class="sheet-scroll"><table class="mcp-mini"><thead>' + head + "</thead><tbody>" + (filas || '<tr><td colspan="6" class="mcp-sub">Sin escalas. Solo aplica el PVP base.</td></tr>') + "</tbody></table></div>" +
      (can ? '<p style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn ghost small" type="button" id="mcp-es-add">+ Escala</button><input id="mcp-es-mot" placeholder="Motivo (obligatorio)" style="flex:1;min-width:180px"><button class="btn small" type="button" id="mcp-es-save">Guardar escalas</button></p>' +
        '<p class="note">Precio fijo con IVA, o markup sobre el costo (costo × (1 + markup) + IVA 15 %). «Desde» = cantidad mínima.</p>' : "") + "</div>";
  }
  function tabProveedores() {
    var r = MC.cur, can = puede(), L = MC.provs || (r.provProducto || []).map(function (x) { return Object.assign({}, x); });
    MC.provs = L;
    var cat = r.proveedoresCat || [];
    var filas = L.map(function (x, i) {
      if (!can) return "<tr><td>" + e(x.proveedor) + (x.predeterminado ? ' <span class="mcp-tag serv">predeterminado</span>' : "") + "</td><td>" + e(x.codigo || "—") + "</td>" + (MC.verCostos ? '<td class="num">' + (x.precio != null ? $m(x.precio) : "—") + "</td>" : "") + "</tr>";
      var sel = '<select data-mcp-pv="proveedor_id" data-i="' + i + '">' + opt("", x.proveedor_id ? "—" : (x.proveedor || "Elige…"), x.proveedor_id) + cat.map(function (c) { return opt(c.id, c.nombre, x.proveedor_id); }).join("") + "</select>";
      return "<tr><td>" + sel + '</td><td><input data-mcp-pv="codigo" data-i="' + i + '" value="' + e(x.codigo || "") + '" placeholder="código del proveedor"></td>' +
        (MC.verCostos ? '<td><input data-mcp-pv="precio" data-i="' + i + '" inputmode="decimal" value="' + e(x.precio == null ? "" : x.precio) + '" style="width:90px"></td>' : "") +
        '<td><label style="display:flex;gap:4px;align-items:center"><input type="radio" name="mcp-pvdef" data-mcp-pvdef="' + i + '"' + (x.predeterminado ? " checked" : "") + ' style="width:auto"> predeterminado</label></td>' +
        '<td><button class="btn ghost small" type="button" data-mcp-pv-del="' + i + '">Quitar</button></td></tr>';
    }).join("");
    var head = "<tr><th>Proveedor</th><th>Código proveedor</th>" + (MC.verCostos ? "<th>Precio</th>" : "") + (can ? "<th></th><th></th>" : "") + "</tr>";
    var cols = [["proveedor", "Proveedor"], [function (x) { return e(fecha(x.ultimaFecha)); }, "Última compra"], ["compras", "Compras", 1], ["unidades", "Unidades", 1]];
    if (MC.verCostos) cols.push([function (x) { return x.ultimoPrecio ? $m(x.ultimoPrecio) : "—"; }, "Último costo", 1]);
    cols.push(["nota", "Nota"]);
    return '<div class="mcp-card"><div class="card-title">Proveedores de este producto</div><div class="sheet-scroll"><table class="mcp-mini"><thead>' + head + "</thead><tbody>" + (filas || '<tr><td colspan="5" class="mcp-sub">Sin proveedores asignados.</td></tr>') + "</tbody></table></div>" +
      (can ? '<p style="display:flex;gap:8px;margin-top:8px"><button class="btn ghost small" type="button" id="mcp-pv-add">+ Proveedor</button><button class="btn small" type="button" id="mcp-pv-save">Guardar proveedores</button></p><p class="note">El código del predeterminado pasa a «SKU proveedor».</p>' : "") +
      '<div class="card-title" style="margin-top:14px">Compras registradas</div>' + mini(cols, r.proveedores || [], "Sin compras registradas para este producto.") + "</div>";
  }
  function tabCodigos() {
    var r = MC.cur, can = puede(), L = MC.codigos || (r.codigos || []).map(function (x) { return Object.assign({}, x); });
    MC.codigos = L;
    var T = { ean13: "EAN-13", interno: "Interno (20…)", otro: "Otro" };
    var filas = L.map(function (x, i) {
      var bars = /^\d{13}$/.test(x.codigo) ? '<div class="mcp-bars">' + barras(x.codigo) + "</div>" : "";
      return '<tr><td class="mcp-sku">' + e(x.codigo) + bars + "</td><td>" + e(T[x.tipo] || x.tipo) + (x.legado ? ' <span class="mcp-sub">de la hoja</span>' : "") + "</td>" +
        "<td>" + (can ? '<label style="display:flex;gap:4px;align-items:center"><input type="radio" name="mcp-cbdef" data-mcp-cbdef="' + i + '"' + (x.principal ? " checked" : "") + ' style="width:auto"> principal</label>' : (x.principal ? "principal" : "")) + "</td>" +
        (can ? '<td><button class="btn ghost small" type="button" data-mcp-cb-del="' + i + '">Quitar</button></td>' : "") + "</tr>";
    }).join("");
    return '<div class="mcp-card"><div class="card-title">Códigos de barras</div><table class="mcp-mini"><tbody>' + (filas || '<tr><td class="mcp-sub">Sin códigos.</td></tr>') + "</tbody></table>" +
      (can ? '<p style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><input id="mcp-cb-new" placeholder="Escanea o escribe un código" inputmode="numeric" style="flex:1;min-width:180px"><button class="btn ghost small" type="button" id="mcp-cb-add">Agregar</button><button class="btn ghost small" type="button" id="mcp-cb-gen">Generar interno (EAN-13)</button><button class="btn small" type="button" id="mcp-cb-save">Guardar códigos</button></p>' +
        '<p class="note">Los EAN-13 se validan con su dígito de control. Los internos empiezan con 20 (rango GS1 de uso interno) y no se repiten entre productos.</p>' : "") + "</div>";
  }
  // Barras EAN-13 en SVG (para ver y para imprimir).
  function barras(c) {
    var L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
    var G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
    var R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
    var P = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
    var pat = P[+c[0]], bits = "101";
    for (var i = 1; i <= 6; i++) bits += (pat[i - 1] === "L" ? L : G)[+c[i]];
    bits += "01010";
    for (var j = 7; j <= 12; j++) bits += R[+c[j]];
    bits += "101";
    var rects = "";
    for (var k = 0; k < bits.length; k++) if (bits[k] === "1") rects += '<rect x="' + k + '" y="0" width="1" height="40"/>';
    return '<svg viewBox="0 0 ' + bits.length + ' 40" width="190" height="44" preserveAspectRatio="none" aria-hidden="true">' + rects + "</svg>";
  }
  function tabArchivos() {
    var r = MC.cur, can = puede(), L = r.archivos || [];
    var fotos = L.filter(function (a) { return a.tipo === "foto"; }), otros = L.filter(function (a) { return a.tipo !== "foto"; });
    var fl = fotos.map(function (a) {
      return '<div class="mcp-af"><button type="button" class="mcp-afb" data-mcp-ver="' + e(a.id) + '">🖼 ' + e(a.nombre) + "</button>" + (a.principal ? '<span class="mcp-tag serv">principal</span>' : can ? '<button class="btn ghost small" type="button" data-mcp-princ="' + e(a.id) + '">Hacer principal</button>' : "") +
        (can ? '<button class="btn ghost small" type="button" data-mcp-quitar="' + e(a.id) + '">Quitar</button>' : "") + '<span class="mcp-sub">' + e(a.por) + " · " + e(fecha(a.at)) + "</span></div>";
    }).join("");
    var ol = otros.map(function (a) {
      return '<div class="mcp-af"><button type="button" class="mcp-afb" data-mcp-ver="' + e(a.id) + '">📎 ' + e(a.nombre) + "</button>" + (can ? '<button class="btn ghost small" type="button" data-mcp-quitar="' + e(a.id) + '">Quitar</button>' : "") + '<span class="mcp-sub">' + e(a.por) + " · " + e(fecha(a.at)) + "</span></div>";
    }).join("");
    return '<div class="mcp-card"><div class="card-title">Fotos</div>' + (fl || '<p class="note">Sin fotos en la galería.' + (r.producto.foto_data ? " La foto actual se subió antes de la galería." : "") + "</p>") +
      '<div class="card-title" style="margin-top:12px">Archivos (fichas técnicas, registros, facturas)</div>' + (ol || '<p class="note">Sin archivos.</p>') +
      (can ? '<p style="margin-top:10px"><input type="file" id="mcp-up" multiple accept="image/*,application/pdf,.csv,.xlsx,.xls,.docx,.doc,.txt" hidden><button class="btn small" type="button" id="mcp-up-btn">Subir fotos o archivos</button></p><p class="note">Fotos se achican a 1000 px. Archivos hasta ~1 MB. Quitar no borra: queda guardado.</p>' : "") + "</div>";
  }
  function tabProtocolo() {
    var r = MC.cur, p = r.producto;
    if (p.tipo === "servicio") {
      var pr = r.protocolo;
      if (!pr) return '<div class="mcp-card"><p class="note">Este servicio no tiene protocolo todavía. ' + (MC.admin || (typeof state !== "undefined" && state.admin) ? '<a href="#/m/mc/protocolos/nuevo?sku=' + encodeURIComponent(p.skuVisible || p.sku) + '">Crear su protocolo</a>' : '<a href="#/m/mc/protocolos">Ir a Protocolos</a>') + "</p></div>";
      var cols = [["paso", "Paso", 1], ["descripcion", "Descripción"], ["producto", "Producto"], [function (x) { return q2(x.cantidad) + " " + e(x.unidad); }, "Cantidad", 1], ["minutos", "Min", 1]];
      return '<div class="mcp-card"><div class="card-title">Protocolo ' + e(pr.sku) + " · " + e(pr.nombre) + "</div>" +
        '<p class="mcp-sub">Versión ' + e(pr.version) + (pr.vigente ? " · vigente " + e(pr.vigente) : "") + (MC.verCostos && pr.manoDeObra ? " · mano de obra " + $m(pr.manoDeObra) : "") + "</p>" +
        mini(cols, pr.pasos || [], "Sin pasos.") + '<p class="note"><a href="#/m/mc/protocolos">Abrir en Protocolos</a></p></div>';
    }
    var cols2 = [["sku", "Facial"], ["nombre", "Protocolo"], ["pasos", "Pasos", 1], [function (x) { return q2(x.cantidad) + " " + e(x.unidad); }, "Usa por servicio", 1]];
    return '<div class="mcp-card"><div class="card-title">Se usa en</div>' + mini(cols2, r.seUsaEn || [], "No aparece en ningún protocolo.") + '<p class="note"><a href="#/m/mc/protocolos">Ver Protocolos</a></p></div>';
  }
  function pdfFicha() {
    var r = MC.cur, p = r.producto, pr = r.precios || {};
    var cod = (r.codigos || []).find(function (x) { return x.principal; });
    var h = "<!doctype html><html><head><meta charset='utf-8'><title>" + e(p.skuVisible || p.sku) + " · " + e(p.nombre) + "</title><style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2d3d;margin:28px}h1{font-size:20px;margin:0 0 4px}table{border-collapse:collapse;width:100%;margin-top:12px;font-size:12px}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}.s{color:#666;font-size:12px}img{max-width:180px;max-height:180px;float:right;border-radius:8px}</style></head><body>" +
      (p.foto_data ? "<img src='" + e(p.foto_data) + "'>" : "") + "<div class='s'>SUNSU SPA · ficha de producto</div><h1>" + e(p.nombre) + "</h1><div class='s'>SKU " + e(p.skuVisible || p.sku) + (p.skuAlias ? " (alias " + e(p.skuAlias) + ")" : "") + "</div>" +
      (cod && /^\d{13}$/.test(cod.codigo) ? "<div style='margin-top:8px'>" + barras(cod.codigo) + "<div class='s'>" + e(cod.codigo) + "</div></div>" : "") +
      "<table><tbody>" + [["Tipo", (p.tipo === "servicio" ? "Servicio" : "Inventariable") + (p.subtipo ? " · " + p.subtipo : "")], ["Marca", p.marca], ["Categoría", p.categoria], ["Unidad", p.unidad], ["SKU proveedor", p.sku_proveedor], ["PVP con IVA", $m(pr.pvp)], ["Sin IVA", $m(pr.subtotal)], ["Stock", p.tipo === "servicio" ? "—" : q2(p.stock)], ["Descripción", r.descripcion], ["Observaciones", p.observaciones]]
        .filter(function (x) { return x[1] != null && x[1] !== ""; }).map(function (x) { return "<tr><th>" + e(x[0]) + "</th><td>" + e(x[1]) + "</td></tr>"; }).join("") + "</tbody></table>" +
      ((r.escalas || []).length ? "<table><thead><tr><th>Escala</th><th>Desde</th><th>PVP</th></tr></thead><tbody>" + r.escalas.map(function (x) { return "<tr><td>" + e(x.nombre) + "</td><td>" + e(x.desde) + "</td><td>" + (x.pvp != null ? $m(x.pvp) : "—") + "</td></tr>"; }).join("") + "</tbody></table>" : "") +
      (r.protocolo ? "<h3>Protocolo</h3><table><tbody>" + (r.protocolo.pasos || []).map(function (x) { return "<tr><td>" + e(x.paso) + "</td><td>" + e(x.descripcion) + "</td><td>" + e(x.producto) + "</td><td>" + q2(x.cantidad) + " " + e(x.unidad) + "</td></tr>"; }).join("") + "</tbody></table>" : "") +
      "<p class='s'>Generado " + e(new Date().toLocaleString("es-EC")) + "</p><script>setTimeout(function(){print()},300)<\/script></body></html>";
    var w = window.open("", "_blank");
    if (!w) { alert("Permite ventanas emergentes para generar el PDF."); return; }
    w.document.open(); w.document.write(h); w.document.close();
  }
  function leerArchivo(file) {
    return new Promise(function (ok, bad) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = function () { bad(new Error("No se pudo leer " + file.name)); }; fr.readAsDataURL(file); });
  }
  async function recargarFicha() {
    var d = await api("mcprod_get", { id: MC.cur.producto.id });
    if (d && d.ok) { var keep = MC.ch; MC.cur = d; MC.ch = keep; }
    MC.escalas = null; MC.provs = null; MC.codigos = null; MC.listAt = 0;
    repintar();
  }
  async function accionFicha(t) {
    var r = MC.cur, p = r.producto;
    var acc = t.closest("[data-mcp-acc]");
    if (acc) {
      var a = acc.getAttribute("data-mcp-acc"), body = { ids: [p.id], que: a };
      if (a === "eliminar") {
        var c = prompt("Eliminar " + (p.skuVisible || p.sku) + " · " + p.nombre + ".\nNo se borra: deja de aparecer y se puede restaurar. Tickets y kardex quedan igual.\nEscribe ELIMINAR para confirmar.");
        if (c !== "ELIMINAR") return true;
        body.confirmar = "ELIMINAR";
      }
      var x = await api("mcprod_estado", body);
      if (!x || x.error) { alert((x && x.error) || "No se pudo"); return true; }
      if (a === "eliminar") { MC.listAt = 0; go("#/m/productos"); return true; }
      await recargarFicha(); return true;
    }
    if (t.closest("#mcp-pdf")) { pdfFicha(); return true; }
    if (t.closest("#mcp-dup")) {
      if (!confirm("Copiar " + p.nombre + " con el siguiente SKU de su familia?")) return true;
      var d = await api("mcprod_duplicar", { id: p.id });
      if (!d || d.error) { alert((d && d.error) || "No se pudo copiar"); return true; }
      MC.listAt = 0; if (typeof toast === "function") try { toast("Copia creada: " + d.sku); } catch (z) {}
      go("#/m/productos/p/" + encodeURIComponent(d.id)); return true;
    }
    // Escalas
    if (t.closest("#mcp-es-add")) { MC.escalas.push({ nombre: "", desde: 1, precio: null, markup: null }); repintar(); return true; }
    var ed = t.closest("[data-mcp-es-del]"); if (ed) { MC.escalas.splice(+ed.getAttribute("data-mcp-es-del"), 1); repintar(); return true; }
    if (t.closest("#mcp-es-save")) {
      var mot = (document.getElementById("mcp-es-mot") || {}).value || "";
      var s1 = await api("mcprod_escalas_save", { id: p.id, escalas: MC.escalas, motivo: mot });
      if (!s1 || s1.error) { alert((s1 && s1.error) || "No se pudo"); return true; }
      await recargarFicha(); return true;
    }
    // Proveedores
    if (t.closest("#mcp-pv-add")) { MC.provs.push({ proveedor_id: "", proveedor: "", codigo: "", precio: null, predeterminado: !MC.provs.length }); repintar(); return true; }
    var pd = t.closest("[data-mcp-pv-del]"); if (pd) { MC.provs.splice(+pd.getAttribute("data-mcp-pv-del"), 1); repintar(); return true; }
    if (t.closest("#mcp-pv-save")) {
      var s2 = await api("mcprod_proveedores_save", { id: p.id, proveedores: MC.provs });
      if (!s2 || s2.error) { alert((s2 && s2.error) || "No se pudo"); return true; }
      await recargarFicha(); return true;
    }
    // Códigos
    if (t.closest("#mcp-cb-add")) {
      var inp = document.getElementById("mcp-cb-new"), v = String((inp && inp.value) || "").trim();
      if (v) { MC.codigos.push({ codigo: v, tipo: /^\d{13}$/.test(v) ? "ean13" : "otro", principal: !MC.codigos.length }); repintar(); }
      return true;
    }
    if (t.closest("#mcp-cb-gen")) {
      var g = await api("mcprod_codigo_interno", { id: p.id, pendientes: MC.codigos.map(function (x) { return x.codigo; }) });
      if (!g || g.error) { alert((g && g.error) || "No se pudo"); return true; }
      MC.codigos.push({ codigo: g.codigo, tipo: "interno", principal: !MC.codigos.length }); repintar(); return true;
    }
    var cd = t.closest("[data-mcp-cb-del]"); if (cd) { MC.codigos.splice(+cd.getAttribute("data-mcp-cb-del"), 1); repintar(); return true; }
    if (t.closest("#mcp-cb-save")) {
      var s3 = await api("mcprod_codigos_save", { id: p.id, codigos: MC.codigos });
      if (!s3 || s3.error) { alert((s3 && s3.error) || "No se pudo"); return true; }
      await recargarFicha(); return true;
    }
    // Archivos
    if (t.closest("#mcp-up-btn")) { var up = document.getElementById("mcp-up"); if (up) up.click(); return true; }
    var ver = t.closest("[data-mcp-ver]");
    if (ver) {
      var f = await api("mcprod_archivo", { id: p.id, archivo_id: ver.getAttribute("data-mcp-ver") });
      if (!f || f.error) { alert((f && f.error) || "No se pudo abrir"); return true; }
      var w = window.open("", "_blank");
      if (w) { if (/^image\//.test(f.mime)) w.document.write("<title>" + e(f.nombre) + "</title><img src='" + f.data + "' style='max-width:100%'>"); else w.location.href = f.data; }
      return true;
    }
    var pq = t.closest("[data-mcp-quitar]");
    if (pq) {
      if (!confirm("¿Quitar este archivo de la ficha? (queda guardado)")) return true;
      var q = await api("mcprod_archivo_quitar", { id: p.id, archivo_id: pq.getAttribute("data-mcp-quitar") });
      if (!q || q.error) { alert((q && q.error) || "No se pudo"); return true; }
      await recargarFicha(); return true;
    }
    var pp = t.closest("[data-mcp-princ]");
    if (pp) {
      var aid = pp.getAttribute("data-mcp-princ"), th = "";
      try {
        var fx = await api("mcprod_archivo", { id: p.id, archivo_id: aid });
        if (fx && fx.data) { var blob = await (await fetch(fx.data)).blob(); th = await resize(blob, 96, 0.7); }
      } catch (z) { th = ""; }
      var pr2 = await api("mcprod_archivo_principal", { id: p.id, archivo_id: aid, thumb: th });
      if (!pr2 || pr2.error) { alert((pr2 && pr2.error) || "No se pudo"); return true; }
      await recargarFicha(); return true;
    }
    return false;
  }
  async function subirVarios(files) {
    var p = MC.cur.producto, errores = [];
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      try {
        var data, thumb = "";
        if (/^image\//.test(file.type)) { data = await resize(file, 1000, 0.82); thumb = await resize(file, 96, 0.7); }
        else data = await leerArchivo(file);
        var r = await api("mcprod_archivo_subir", { id: p.id, data: data, thumb: thumb, nombre: file.name });
        if (!r || r.error) errores.push(file.name + ": " + ((r && r.error) || "no se pudo"));
      } catch (x) { errores.push(file.name + ": " + (x.message || x)); }
    }
    if (errores.length) alert(errores.join("\n"));
    await recargarFicha();
  }
  function cuerpo() {
    if (MC.tab === "proveedores") return tabProveedores();
    if (MC.tab === "precios") return tabPrecios();
    if (MC.tab === "codigos") return tabCodigos();
    if (MC.tab === "archivos") return tabArchivos();
    if (MC.tab === "protocolo") return tabProtocolo();
    if (MC.tab === "historial") return tabHistorial();
    if (MC.tab === "movimientos") return tabMov();
    return resumen();
  }
  function fichaHtml() {
    return '<div class="mcp mcp-ficha"><div class="mcp-top"><button class="btn ghost small" type="button" id="mcp-volver">← Productos</button><span class="mcp-acc" id="mcp-acc">' + acciones() + "</span></div>" +
      '<div id="mcp-head">' + head() + "</div>" + tabs() + '<div id="mcp-cuerpo">' + cuerpo() + "</div></div>";
  }
  function repintar(foco) {
    var h = document.getElementById("mcp-head"), c = document.getElementById("mcp-cuerpo"), t = document.querySelector(".mcp-tabs");
    if (h) h.innerHTML = head();
    if (c) c.innerHTML = cuerpo();
    if (t) t.outerHTML = tabs();
    var ac = document.getElementById("mcp-acc"); if (ac) ac.innerHTML = acciones();
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
    MC.ch = {}; MC.ed = null; MC.motivo = ""; MC.escalas = null; MC.provs = null; MC.codigos = null;
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
      if (t.closest("[data-mcp-acc],#mcp-pdf,#mcp-dup,#mcp-es-add,[data-mcp-es-del],#mcp-es-save,#mcp-pv-add,[data-mcp-pv-del],#mcp-pv-save,#mcp-cb-add,#mcp-cb-gen,[data-mcp-cb-del],#mcp-cb-save,#mcp-up-btn,[data-mcp-ver],[data-mcp-quitar],[data-mcp-princ]")) { void accionFicha(t); return; }
      if (t.closest("#mcp-descartar")) { MC.ch = {}; MC.ed = null; MC.motivo = ""; repintar(); return; }
      if (t.closest("#mcp-foto")) {
        if (puede()) { var f = document.getElementById("mcp-file"); if (f) f.click(); }
        else { var im = host.querySelector("#mcp-foto img"); if (im) window.open(im.src, "_blank"); }
      }
    });
    host.addEventListener("input", function (ev) {
      var es = ev.target.getAttribute && ev.target.getAttribute("data-mcp-es");
      if (es && MC.escalas) { var x = MC.escalas[+ev.target.getAttribute("data-i")]; if (x) x[es] = ev.target.value === "" && es !== "nombre" ? null : ev.target.value; return; }
      var pv = ev.target.getAttribute && ev.target.getAttribute("data-mcp-pv");
      if (pv && MC.provs && ev.target.tagName !== "SELECT") { var y = MC.provs[+ev.target.getAttribute("data-i")]; if (y) y[pv] = ev.target.value === "" && pv === "precio" ? null : ev.target.value; return; }
      var k = ev.target.getAttribute && ev.target.getAttribute("data-mcp-in");
      if (ev.target.id === "mcp-motivo") { MC.motivo = ev.target.value; return; }
      if (!k || ev.target.tagName === "SELECT") return;
      setVal(k, ev.target.value);
      var bar = document.getElementById("mcp-savebar"); if (bar) bar.hidden = !Object.keys(MC.ch).length;
    });
    host.addEventListener("change", function (ev) {
      var k = ev.target.getAttribute && ev.target.getAttribute("data-mcp-in");
      if (k && ev.target.tagName === "SELECT") { setVal(k, ev.target.value); MC.ed = null; repintar(); }
      var pv = ev.target.getAttribute && ev.target.getAttribute("data-mcp-pv");
      if (pv === "proveedor_id" && MC.provs) { var y = MC.provs[+ev.target.getAttribute("data-i")]; if (y) { y.proveedor_id = ev.target.value; y.proveedor = ev.target.value ? ev.target.options[ev.target.selectedIndex].text : y.proveedor; } }
      var pvd = ev.target.getAttribute && ev.target.getAttribute("data-mcp-pvdef");
      if (pvd != null && MC.provs) MC.provs.forEach(function (z, i) { z.predeterminado = String(i) === pvd; });
      var cbd = ev.target.getAttribute && ev.target.getAttribute("data-mcp-cbdef");
      if (cbd != null && MC.codigos) MC.codigos.forEach(function (z, i) { z.principal = String(i) === cbd; });
      if (ev.target.id === "mcp-up" && ev.target.files && ev.target.files.length) { void subirVarios([].slice.call(ev.target.files)); return; }
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
      return "<tr><td><b>" + e(f.prefijo === "#" ? "SUNSU-01, 02… (servicios)" : f.prefijo) + "</b></td><td>" + f.total + "</td><td>" + e(f.ejemplo) + '</td><td class="mcp-sku">' + e(f.siguiente) + "</td></tr>";
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
      '<label>PVP con IVA (opcional)<input name="pvp" inputmode="decimal" placeholder="Lo puedes poner después en la ficha"></label>' +
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
