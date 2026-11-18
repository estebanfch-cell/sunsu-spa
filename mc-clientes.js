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
      ".mccl-hx td{background:var(--cream)!important;cursor:default}.mccl-hx ul{margin:4px 0 6px 18px;padding:0;font-size:.82rem}.mccl-car{display:inline-block;width:12px;color:var(--gray);transition:transform .15s}tr.open .mccl-car{transform:rotate(90deg)}",
      ".mccl-ph{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.mccl-ph img{width:72px;height:72px;object-fit:cover;border-radius:8px;cursor:zoom-in;border:1px solid var(--cream-d)}",
      ".mccl-reg .mccl-v{cursor:text;border-radius:5px;padding:1px 4px;display:inline-block;min-width:30px}.mccl-reg .mccl-v:hover{background:var(--cream);outline:1px dashed var(--cream-d)}.mccl-reg .mccl-v.mod{background:#fff3d6}.mccl-reg .ro{color:var(--gray)}",
      ".mcpv-b.pdf{flex-direction:column;align-items:stretch;justify-content:flex-start}.mcpv-acc{display:flex;gap:8px;justify-content:flex-end;padding:8px 12px;background:#fff;border-bottom:1px solid var(--cream-d)}.mcpv-b.pdf iframe{flex:1;min-height:0}.mcpv-h .mctk-x{background:none;border:0;font-size:1.5rem;line-height:1;color:var(--navy);cursor:pointer;padding:0 4px}",
      ".mcpv{position:fixed;inset:0;background:rgba(20,30,50,.6);display:flex;align-items:center;justify-content:center;z-index:10000}.mcpv-box{background:#fff;border-radius:12px;width:min(980px,96vw);height:min(90vh,900px);display:flex;flex-direction:column;overflow:hidden}.mcpv-h{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--cream-d);font-size:.86rem;font-weight:700}.mcpv-b{flex:1;display:flex;align-items:center;justify-content:center;background:#f4f4f6;overflow:auto}.mcpv-b img{max-width:100%;max-height:100%;object-fit:contain}.mcpv-b iframe{width:100%;height:100%;border:0}",
      ".mccl-ses{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid var(--navy);margin-right:3px;vertical-align:middle}.mccl-ses.u{background:var(--navy)}",
      ".mcd-g{border:1px solid var(--cream-d);border-radius:12px;padding:10px 12px;margin:0 0 10px;background:var(--white,#fff)}.mcd-gh{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:8px}.mcd-gh b{color:var(--navy-d)}.mcd-rep{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:6px 0;border-top:1px solid var(--cream-d)}.mcd-g>.mcd-rep:first-of-type{border-top:0}",
      ".mcd-fotos,.mcd-fold{margin:6px 0 0;border:1px solid var(--cream-d);border-radius:10px;background:#fafaf8}.mcd-fotos>summary,.mcd-fold>summary{cursor:pointer;list-style:none;padding:8px 12px;font-weight:700;font-size:.84rem;color:var(--navy-d)}.mcd-fotos>summary::-webkit-details-marker,.mcd-fold>summary::-webkit-details-marker{display:none}.mcd-fotos>summary:before,.mcd-fold>summary:before{content:'▸ ';display:inline-block;transition:transform .15s}.mcd-fotos[open]>summary:before,.mcd-fold[open]>summary:before{transform:rotate(90deg)}.mcd-fold{margin:6px 10px 8px;background:#fff}.mcd-fold .mccl-ph{padding:0 10px 10px}",
    ].join("");
    document.head.appendChild(s);
  }

  // ---------- Documentos: una entrada por día / ticket; informe PDF primero; fotos del ticket en Antes / Después; zips K-Lift ocultos ----------
  function esZipOculto(d) { return !!(d && (d.zip === true || d.tipo === "zip" || /\.zip$/i.test(d.storage_path || ""))); }
  function visibleDoc(d) { return !!(d && !esZipOculto(d) && d.tipo !== "analisis"); }
  function carpetaFoto(d) {
    var n = norm(d && d.nombre);
    if (/(^|[^a-z])(despues|after|post)([^a-z]|$)/.test(n)) return "despues";
    if (/(^|[^a-z])(antes|before|pre)([^a-z]|$)/.test(n)) return "antes";
    return "fotos";
  }
  function esInforme(d) {
    if (!visibleDoc(d) || d.tipo === "foto") return false;
    if (d.sub === "skin_analisis" || d.sub === "klift") return d.tipo === "pdf";
    return d.tipo === "pdf" && /acta|informe|focus\s*skin|k-?lift/.test(norm([d.nombre, d.sub, d.tipo].join(" ")));
  }
  function minsH(h) { var m = String(h || "").match(/(\d{1,2}):(\d{2})/); return m ? (+m[1] * 60 + +m[2]) : NaN; }
  function armaGrupo(b) {
    var fotos = { antes: [], despues: [], fotos: [] }, informes = [], otros = [];
    (b.items || []).forEach(function (d) {
      if (d.tipo === "foto") fotos[carpetaFoto(d)].push(d);
      else if (esInforme(d)) informes.push(d);
      else otros.push(d);
    });
    var nFotos = fotos.antes.length + fotos.despues.length + fotos.fotos.length;
    var tipos = [];
    informes.forEach(function (d) {
      var lab = d.sub === "klift" ? "K-Lift" : d.sub === "skin_analisis" ? "Focus Skin" : /acta/i.test(d.nombre || "") ? "Acta" : "Informe";
      if (tipos.indexOf(lab) < 0) tipos.push(lab);
    });
    var titulo = [b.clave, tipos.join(" · ")].filter(Boolean).join(" · ") || (nFotos ? "Fotos del ticket" : "Documentos");
    return { fecha: b.fecha, hora: b.hora || "", clave: b.clave || "", titulo: titulo, informes: informes, otros: otros, fotos: fotos, nFotos: nFotos, ids: (b.items || []).map(function (d) { return d.docId; }).filter(Boolean) };
  }
  function agruparDocs(docs) {
    var raw = {}, i, d, k, b, dia, L, con, sin, merged = [];
    (docs || []).filter(visibleDoc).forEach(function (d) {
      var fecha = String(d.fecha || "").slice(0, 10), clave = d.clave ? String(d.clave) : "";
      k = clave ? fecha + "|" + clave : fecha;
      b = raw[k] || { fecha: fecha, clave: clave, hora: d.hora || "", items: [] };
      b.items.push(d);
      if (!b.hora && d.hora) b.hora = d.hora;
      raw[k] = b;
    });
    var porDia = {};
    Object.keys(raw).forEach(function (k) { b = raw[k]; (porDia[b.fecha] = porDia[b.fecha] || []).push(b); });
    function cerca(grupos, hora) {
      var t = minsH(hora), best = null, bestD = Infinity, u, dist;
      if (!isFinite(t)) return null;
      grupos.forEach(function (g) { u = minsH(g.hora); if (!isFinite(u)) return; dist = Math.abs(u - t); if (dist < bestD) { bestD = dist; best = g; } });
      return best;
    }
    Object.keys(porDia).forEach(function (dia) {
      L = porDia[dia]; con = L.filter(function (x) { return x.clave; }); sin = L.filter(function (x) { return !x.clave; });
      if (con.length === 1 && sin.length) { con[0].items = con[0].items.concat(sin.reduce(function (a, x) { return a.concat(x.items); }, [])); if (!con[0].hora) con[0].hora = sin[0].hora; merged.push(con[0]); }
      else if (con.length > 1 && sin.length) {
        sin.forEach(function (x) { x.items.forEach(function (d) { (cerca(con, d.hora || x.hora) || con[0]).items.push(d); }); });
        merged = merged.concat(con);
      } else merged = merged.concat(L);
    });
    return merged.map(armaGrupo).sort(function (a, b) { return (b.fecha + (b.hora || "")).localeCompare(a.fecha + (a.hora || "")); });
  }
  function agruparSinAsignarJs(items) {
    var cubos = {};
    (items || []).forEach(function (d) {
      var dia = String(d.fecha || "").slice(0, 10), nom = norm(d.archivo || d.nombre || "");
      var k = dia + "|" + nom; (cubos[k] = cubos[k] || []).push(d);
    });
    return Object.keys(cubos).map(function (k) {
      var L = cubos[k], vis = L.filter(function (d) { return !esZipOculto(d); });
      if (!vis.length) return null;
      var informes = vis.filter(esInforme), otros = vis.filter(function (d) { return !esInforme(d) && d.tipo !== "foto"; }), first = informes[0] || vis[0];
      return { fecha: first.fecha, hora: first.hora, archivo: first.archivo, confianza: first.confianza, sub: first.sub,
        titulo: (first.sub === "klift" ? "K-Lift" : "Focus Skin") + (first.archivo ? " · " + first.archivo : ""),
        informes: informes, otros: otros, fotos: { antes: [], despues: [], fotos: [] }, nFotos: 0,
        ids: L.map(function (d) { return d.docId; }).filter(Boolean), sugerencias: first.sugerencias, docId: first.docId, zip: false };
    }).filter(Boolean).sort(function (a, b) { return (String(b.fecha) + (b.hora || "")).localeCompare(String(a.fecha) + (a.hora || "")); });
  }
  function accDoc(x) {
    if (x.docId) return (x.zip ? "" : '<button class="btn ghost small" type="button" data-pvd="' + e(x.docId) + '" data-pvn="' + e(x.nombre) + '">Ver</button> ') + '<button class="btn ghost small" type="button" data-dzip="' + e(x.docId) + '" title="Descargar">⬇️</button>';
    if (x.url) return '<button class="btn ghost small" type="button" data-pv="' + e(x.url) + '" data-pvn="' + e(x.nombre) + '">Ver</button>';
    if (x.tipo === "tarjeta" && x.sheetRow) return '<button class="btn ghost small" type="button" data-pvt="' + e(x.sheetRow) + '" data-pvn="' + e(x.nombre) + '">Ver</button>';
    return "";
  }
  function carpetaHtml(titulo, fotos) {
    if (!fotos || !fotos.length) return "";
    return '<details class="mcd-fold"><summary>' + e(titulo) + " (" + fotos.length + ")</summary><div class=\"mccl-ph\">" +
      fotos.map(function (x) { return '<img data-mini="' + e(x.url) + '" src="' + e(VACIA) + '" alt="' + e(x.nombre) + '" data-pv="' + e(x.url) + '" data-pvn="' + e(x.nombre) + '">'; }).join("") + "</div></details>";
  }
  function fotosBlock(g) {
    var fo = g.fotos || {}, n = g.nFotos || ((fo.antes || []).length + (fo.despues || []).length + (fo.fotos || []).length);
    if (!n) return "";
    return '<details class="mcd-fotos"><summary>Fotos' + (n ? " (" + n + ")" : "") + "</summary>" +
      carpetaHtml("Antes", fo.antes) + carpetaHtml("Después", fo.despues) + carpetaHtml("Fotos", fo.fotos) + "</details>";
  }
  function grupoHtml(g) {
    var ico = { pdf: "📑", tarjeta: "📄", comprobante: "🧾", consentimiento: "✍️", foto: "🖼️" };
    var informes = (g.informes || []).map(function (x) { return '<div class="mcd-rep"><span>📑 ' + e(x.nombre) + "</span><span>" + accDoc(x) + "</span></div>"; }).join("");
    var otros = (g.otros || []).map(function (x) { return '<div class="mcd-rep"><span>' + (ico[x.tipo] || "📄") + " " + e(x.nombre) + "</span><span>" + accDoc(x) + "</span></div>"; }).join("");
    var tk = g.clave ? '<button class="btn ghost small" type="button" data-tk="' + e(g.clave) + '">Abrir ticket</button>' : "";
    return '<div class="mcd-g"><div class="mcd-gh"><b>' + e(f(g.fecha)) + (g.hora ? " " + e(g.hora) : "") + "</b>" +
      (g.titulo ? '<span class="mccf-sub"> · ' + e(g.titulo) + "</span>" : "") + tk + "</div>" + informes + otros + fotosBlock(g) + "</div>";
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
      '<button class="btn small" type="button" data-go="#/doc/ov">Nuevo ticket</button>' + (K.admin ? ' <button class="btn ghost small" type="button" data-go="#/m/clientes/docs">📑 Documentos sin asignar</button> <button class="btn ghost small" type="button" data-go="#/m/clientes/duplicados">🔗 Duplicados</button>' : "") + "</div>" +
      '<p class="mccf-sub" id="mccl-n">' + c.n + " clienta" + (c.n === 1 ? "" : "s") + (c.n > K.max ? " · mostrando " + K.max : "") + "</p>" +
      '<div class="sheet-scroll"><table class="mccf-t mccl-t"><thead id="mccl-head">' + c.head + '</thead><tbody id="mccl-body">' + c.body + "</tbody></table></div>" +
      (c.n > K.max ? '<p><button class="btn ghost small" type="button" id="mccl-mas">Mostrar más</button></p>' : "") + "</div>";
  }
  async function renderLista() {
    css();
    var poner = function (d) { K.L = d.clientes || []; K.admin = !!d.admin; K.cosms = d.cosmetologas || []; K.secs = d.sectores || []; K.t = Date.now(); };
    if (!K.L) {
      var d = await api("cl_list", {});
      if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + "</p>";
      poner(d);
    } else if (Date.now() - (K.t || 0) > 60000 && !K.cargando) {
      // Se muestra la lista que ya estaba y se actualiza por detrás (sin esperar a la base).
      K.cargando = true;
      api("cl_list", {}).then(function (d2) {
        K.cargando = false; if (!d2 || d2.error) return; poner(d2);
        var main = document.querySelector("#mccl-body") && document.querySelector("#mccl-body").closest("main, .main, #main, body");
        if (main) repintarLista(main);
      }, function () { K.cargando = false; });
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

  // ---------- vista previa de documentos (solo el documento, sin salir de la página) ----------
  function driveId(u) { var m = String(u || "").match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=|thumbnail\?id=)([-\w]{20,})/); return m ? m[1] : ""; }
  function miniatura(u) { var id = driveId(u); return id ? "https://drive.google.com/thumbnail?id=" + id + "&sz=w400" : /^archivo:/.test(String(u)) ? "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72'><text x='36' y='44' font-size='28' text-anchor='middle'>🖼️</text></svg>" : u; }
  function lblE(x) { return window.MCEmojiCampo ? window.MCEmojiCampo(x) : x; }
  function cerrarPrevia() { var x = document.getElementById("mcpv"); if (x) { var fr = x.querySelector("[data-blob]"); if (fr) URL.revokeObjectURL(fr.getAttribute("data-blob")); x.remove(); } }
  function marcoPrevia(titulo, cuerpo) {
    cerrarPrevia(); css();
    var box = document.createElement("div"); box.className = "mcpv"; box.id = "mcpv";
    box.innerHTML = '<div class="mcpv-box"><div class="mcpv-h"><span>' + e(titulo || "Documento") + '</span><button type="button" class="mctk-x" data-x title="Cerrar">×</button></div><div class="mcpv-b">' + cuerpo + "</div></div>";
    box.onclick = function (ev) { if (ev.target === box || ev.target.closest("[data-x]")) cerrarPrevia(); };
    document.addEventListener("keydown", function esc1(ev) { if (ev.key === "Escape") { cerrarPrevia(); document.removeEventListener("keydown", esc1); } });
    document.body.appendChild(box); return box;
  }
  async function previaArchivo(u, titulo) {
    var box = marcoPrevia(titulo, '<p class="mccf-sub">Cargando…</p>');
    var r = await api("fotoB64", { id: u.slice(8) });
    if (!document.getElementById("mcpv")) return;
    if (!r || !r.ok) { box.querySelector(".mcpv-b").innerHTML = '<p class="err">' + e((r && r.error) || "No se pudo abrir") + "</p>"; return; }
    if (/pdf/i.test(r.mime || "")) {
      var bin = atob(r.b64), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var nom = /\.pdf$/i.test(titulo || "") ? titulo : (titulo || "Factura") + ".pdf";
      mostrarPdf(box, { output: function () { return new Blob([arr], { type: "application/pdf" }); } }, nom);
      return;
    }
    var src = "data:" + (r.mime || "image/jpeg") + ";base64," + r.b64;
    box.querySelector(".mcpv-b").innerHTML = '<img src="' + src + '" alt="">';
  }
  function previa(url, titulo) {
    var id = driveId(url), u = String(url || "");
    if (/^archivo:/.test(u)) return previaArchivo(u, titulo);
    var img = /\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(u) || /^data:image\//.test(u) || (id && /foto/i.test(titulo || ""));
    if (id && img) return previaArchivo("archivo:" + id, titulo);
    if (id) return marcoPrevia(titulo, '<iframe src="https://drive.google.com/file/d/' + id + '/preview" allow="autoplay"></iframe>');
    if (img) return marcoPrevia(titulo, '<img src="' + e(u) + '" alt="">');
    return marcoPrevia(titulo, '<iframe src="' + e(u) + '"></iframe>');
  }
  async function previaTarjeta(sheetRow, titulo) {
    var box = marcoPrevia(titulo, '<p class="mccf-sub">Generando la tarjeta…</p>');
    var cards = window._tkCards = window._tkCards || {};
    if (!cards[sheetRow]) { try { var r = await api("tk_historial", { rows: [sheetRow], limit: 1 }); if (r && r.items && r.items[0]) cards[sheetRow] = r.items[0]; } catch (x) {} }
    if (!cards[sheetRow] || typeof tarjetaTicket !== "function") { box.querySelector(".mcpv-b").innerHTML = '<p class="err">No encontré la tarjeta de este ticket</p>'; return; }
    tarjetaTicket(sheetRow, function (doc, nom) { mostrarPdf(box, doc, nom || "Tarjeta.pdf"); });
  }
  /** Muestra un PDF de jsPDF en la ventana con «Descargar» y «Abrir»: en el iPhone el visor dentro de la página a veces sale en blanco. */
  function mostrarPdf(box, doc, nom) {
    if (!document.getElementById("mcpv")) return;
    try {
      var u = URL.createObjectURL(doc.output("blob"));
      box.querySelector(".mcpv-b").classList.add("pdf"); box.querySelector(".mcpv-b").innerHTML = '<div class="mcpv-acc"><a class="btn small" href="' + u + '" download="' + e(nom) + '">⬇️ Descargar PDF</a> <a class="btn ghost small" href="' + u + '" target="_blank" rel="noopener">↗ Abrir en otra pestaña</a></div><iframe data-blob="' + u + '" src="' + u + '"></iframe>';
    } catch (x) { box.querySelector(".mcpv-b").innerHTML = '<p class="err">No se pudo generar el PDF</p>'; }
  }
  /** PDF guardado en el bucket (K-Lift / Focus Skin): link firmado → se muestra dentro de la página. */
  async function previaBucket(id, titulo) {
    var box = marcoPrevia(titulo, '<p class="mccf-sub">Abriendo el PDF…</p>');
    var r = await api("cl_doc_url", { id: id, key: (K.d && K.d.key) || "" });
    if (!document.getElementById("mcpv")) return;
    if (!r || !r.ok) { box.querySelector(".mcpv-b").innerHTML = '<p class="err">' + e((r && r.error) || "No se pudo abrir el PDF") + "</p>"; return; }
    var nom = /\.pdf$/i.test(r.nombre || "") ? r.nombre : (r.nombre || "documento") + ".pdf";
    try {
      var bl = await (await fetch(r.url)).blob();
      mostrarPdf(box, { output: function () { return new Blob([bl], { type: "application/pdf" }); } }, nom);
    } catch (x) {
      box.querySelector(".mcpv-b").classList.add("pdf");
      box.querySelector(".mcpv-b").innerHTML = '<div class="mcpv-acc"><a class="btn ghost small" href="' + e(r.url) + '" target="_blank" rel="noopener">↗ Abrir en otra pestaña</a></div><iframe src="' + e(r.url) + '"></iframe>';
    }
  }
  /** ZIP de fotos K-Lift (o cualquier documento): link firmado de descarga. */
  async function descargarDoc(id, key) {
    var r = await api("cl_doc_url", { id: id, key: key || (K.d && K.d.key), descargar: "1" });
    if (!r || !r.ok) { alert((r && r.error) || "No se pudo descargar"); return; }
    var a = document.createElement("a"); a.href = r.url; a.download = r.nombre || ""; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
  }
  // ---------- Documentos sin asignar (admin) ----------
  var SA = { q: "", items: null, total: 0, busca: {} };
  function saFila(x) {
    var id = x.docId || (x.ids && x.ids[0]) || "";
    var ids = (x.ids && x.ids.length) ? x.ids : (id ? [id] : []);
    var b = SA.busca[id] || "";
    var cands = b.length >= 2 ? (K.L || []).filter(function (c) { var t = norm(c.nombre + " " + (c.cedula || "") + " " + (c.codigo || "")); return norm(b).split(/\s+/).every(function (w) { return t.indexOf(w) >= 0; }); }).slice(0, 8) : [];
    var opt = function (c) { return '<button class="btn ghost small" type="button" data-sa-as="' + e(id) + '" data-sa-ids="' + e(ids.join(",")) + '" data-sa-k="' + e(c.key) + '" data-sa-n="' + e(c.nombre) + '">' + e(c.nombre) + (c.codigo ? " · " + e(c.codigo) : "") + (c.cedula ? " · " + e(c.cedula) : "") + "</button>"; };
    var informes = (x.informes && x.informes.length) ? x.informes : (id && !x.zip ? [x] : []);
    var ver = informes.map(function (d) { return '<button class="btn ghost small" type="button" data-sa-ver="' + e(d.docId) + '" data-sa-z="0" data-pvn="' + e(d.nombre || x.titulo || "") + '">Ver</button>'; }).join(" ");
    var det = informes.map(function (d) { return e(d.nombre); }).join(" · ");
    return '<tr data-sa="' + e(id) + '" data-sa-ids="' + e(ids.join(",")) + '"><td>' + e(f(x.fecha)) + (x.hora ? " " + e(x.hora) : "") + "</td><td>📑 " + e(x.sub === "klift" ? "K-Lift" : "Focus Skin") + "</td><td><b>" + e(x.archivo || "—") + '</b><div class="mccf-sub">' + e(det || x.titulo || "") + (x.confianza === "ambiguous" ? " · Nombre ambiguo (varias clientas)" : " · Sin coincidencia") + "</div></td>" +
      "<td>" + (ver || "—") + "</td>" +
      '<td style="min-width:240px">' + (x.sugerencias && x.sugerencias.length ? '<div class="mccf-sub">Sugeridas:</div>' + x.sugerencias.map(opt).join(" ") : "") +
      '<div style="margin-top:4px"><input type="search" placeholder="Buscar clienta (nombre, cédula, código)" data-sa-q="' + e(id) + '" value="' + e(b) + '" style="width:100%"></div><div data-sa-c="' + e(id) + '">' + cands.map(opt).join(" ") + "</div></td></tr>";
  }
  function norm(x) { return String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  async function renderSinAsignar() {
    css();
    if (!K.L) { var d = await api("cl_list", {}); if (d && !d.error) { K.L = d.clientes || []; K.admin = !!d.admin; K.cosms = d.cosmetologas || []; K.secs = d.sectores || []; K.t = Date.now(); } }
    var r = await api("doc_sin_asignar", { q: SA.q, limit: 300 });
    if (!r || r.error) return '<p class="err">' + e((r && r.error) || "No se pudo cargar") + '</p><button class="btn ghost small" type="button" data-go="#/m/clientes">← Volver</button>';
    SA.items = r.items || [];
    SA.grupos = r.grupos || agruparSinAsignarJs(SA.items);
    SA.total = r.gruposTotal != null ? r.gruposTotal : SA.grupos.length;
    return '<div class="mccf"><p><button class="btn ghost small" type="button" data-go="#/m/clientes">← Volver a la lista</button></p><h2>📑 Documentos sin asignar</h2>' +
      '<p class="mccf-sub">Análisis Focus Skin y K-Lift (PDF final) que no se pudieron emparejar solos. Los zips de fotos no se listan. Elige la clienta y queda en su pestaña Documentos; al asignar también se ata el zip oculto del mismo día.</p>' +
      '<div class="mccf-bar"><input type="search" id="sa-q" placeholder="Filtrar por nombre del archivo" value="' + e(SA.q) + '"></div>' +
      '<p class="mccf-sub" id="sa-n">' + SA.total + " documento" + (SA.total === 1 ? "" : "s") + " sin asignar" + "</p>" +
      '<div class="sheet-scroll"><table class="mccf-t"><thead><tr><th>Fecha</th><th>Tipo</th><th>Nombre en el archivo</th><th></th><th>Asignar a</th></tr></thead><tbody id="sa-body">' + SA.grupos.map(saFila).join("") + "</tbody></table></div></div>";
  }
  function wireSinAsignar(main) {
    var q = main.querySelector("#sa-q"), tmr;
    if (q) q.onchange = function () { SA.q = q.value; renderSinAsignar().then(function (h) { main.innerHTML = h; wireSinAsignar(main); }); };
    var body = main.querySelector("#sa-body"); if (!body) return;
    body.oninput = function (ev) {
      var i = ev.target.closest("[data-sa-q]"); if (!i) return;
      var id = i.getAttribute("data-sa-q"); SA.busca[id] = i.value; clearTimeout(tmr);
      tmr = setTimeout(function () { var x = (SA.grupos || SA.items || []).filter(function (y) { return y.docId === id || (y.ids || []).indexOf(id) >= 0; })[0]; var box = body.querySelector('[data-sa-c="' + id + '"]'); if (x && box) { var tmp = document.createElement("tbody"); tmp.innerHTML = saFila(x); var nb = tmp.querySelector('[data-sa-c="' + id + '"]'); box.innerHTML = nb ? nb.innerHTML : ""; } }, 150);
    };
    body.onclick = async function (ev) {
      var v = ev.target.closest("[data-sa-ver]");
      if (v) { var id0 = v.getAttribute("data-sa-ver"); if (v.getAttribute("data-sa-z") === "1") descargarDoc(id0, ""); else { previaBucket(id0, v.getAttribute("data-pvn")); } return; }
      var a = ev.target.closest("[data-sa-as]"); if (!a) return;
      var id = a.getAttribute("data-sa-as"), key = a.getAttribute("data-sa-k"), nom = a.getAttribute("data-sa-n");
      var ids = (a.getAttribute("data-sa-ids") || id).split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      if (!confirm("¿Asignar este documento a " + nom + "?")) return;
      a.disabled = true;
      var r = await api("doc_asignar", { id: ids[0] || id, ids: ids, key: key });
      if (!r || !r.ok) { a.disabled = false; alert((r && r.error) || "No se pudo asignar"); return; }
      var toma = function (y) { return y.docId === id || (y.ids || []).some(function (z) { return ids.indexOf(z) >= 0; }); };
      SA.items = (SA.items || []).filter(function (y) { return !toma(y); });
      SA.grupos = (SA.grupos || []).filter(function (y) { return !toma(y); });
      SA.total = Math.max(0, (SA.grupos || []).length);
      var tr = body.querySelector('tr[data-sa="' + id + '"]'); if (tr) tr.remove();
      var n = main.querySelector("#sa-n"); if (n) n.textContent = SA.total + " documento" + (SA.total === 1 ? "" : "s") + " sin asignar · ✓ asignado a " + nom;
    };
  }
  /** Igual que la tarjeta, para cualquier PDF que se arma en el navegador (reporte del paquete). */
  function previaPdf(titulo, hacer) {
    var box = marcoPrevia(titulo, '<p class="mccf-sub">Generando…</p>');
    Promise.resolve().then(hacer).then(function (x) { if (!x || !x.doc) { box.querySelector(".mcpv-b").innerHTML = '<p class="err">No se pudo generar el PDF</p>'; return; } mostrarPdf(box, x.doc, x.nom || "Documento.pdf"); })
      .catch(function (x) { box.querySelector(".mcpv-b").innerHTML = '<p class="err">' + e((x && x.message) || "No se pudo generar el PDF") + "</p>"; });
  }
  var VACIA = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
  var MINIS = {};
  /** Miniaturas por el servidor (Drive no deja leerlas directo desde la beta). */
  function cargarMinis(root) {
    [].slice.call(root.querySelectorAll("img[data-mini]")).slice(0, 12).forEach(function (im) {
      var u = im.getAttribute("data-mini"), id = driveId(u) || (/^archivo:/.test(u) ? u.slice(8) : "");
      if (!id) { im.src = u; return; }
      if (MINIS[id]) { im.src = MINIS[id]; return; }
      api("fotoB64", { id: id, sz: 240 }).then(function (r) { if (r && r.ok) { MINIS[id] = "data:" + (r.mime || "image/jpeg") + ";base64," + r.b64; im.src = MINIS[id]; } });
    });
  }
  window.MCPrevia = { abrir: previa, tarjeta: previaTarjeta, pdf: previaPdf, miniatura: miniatura };

  // ---------- ficha ----------
  function tabHtml() {
    var d = K.d, t = K.tab;
    if (t === "historial") {
      if (!d.historial.length) return '<p class="mccf-sub">Sin tickets.</p>';
      var nc = d.admin ? 4 : 3;
      return '<table class="mccf-t mccl-t"><thead><tr><th>Fecha</th><th>Ticket</th><th>Cosmetóloga</th>' + (d.admin ? '<th class="num">Total</th>' : "") + "</tr></thead><tbody>" +
        d.historial.map(function (h, i) {
          var open = K.abiertos && K.abiertos[i];
          var det = (h.detalle || []).length ? "<ul>" + h.detalle.map(function (l) { return "<li>" + e(l.nombre) + (l.cantidad > 1 ? " ×" + e(l.cantidad) : "") + "</li>"; }).join("") + "</ul>" : (h.facial && h.facial !== "-" ? "<ul><li>" + e(h.facial) + "</li></ul>" : '<div class="mccf-sub">Sin detalle.</div>');
          var fotos = (h.fotos || []).length ? '<div class="mccl-ph">' + h.fotos.map(function (x) { return '<img data-mini="' + e(x.url) + '" src="' + e(VACIA) + '" alt="' + e(x.nombre) + '" data-pv="' + e(x.url) + '" data-pvn="' + e(x.nombre + " · " + h.ref) + '">'; }).join("") + "</div>" : "";
          var nota = h.notas ? '<div class="mccf-sub"><b>Notas:</b> ' + e(h.notas) + "</div>" : "";
          return '<tr data-hx="' + i + '"' + (open ? ' class="open"' : "") + '><td><span class="mccl-car">▸</span> ' + e(f(h.fecha)) + " " + e(h.hora || "") + '</td><td class="mccl-cod">' + e(h.ref) + (h.editadoBeta ? ' <span class="mccl-pend">beta</span>' : "") + "</td><td>" + (window.MCColor ? window.MCColor.pill(h.cosmetologa) : e(h.cosmetologa)) + "</td>" + (d.admin ? '<td class="num">' + e($m(h.total)) + "</td>" : "") + "</tr>" +
            (open ? '<tr class="mccl-hx"><td colspan="' + nc + '">' + det + nota + fotos + (h.clave ? '<button class="btn ghost small" type="button" data-tk="' + e(h.clave) + '">Abrir ticket</button>' : "") + "</td></tr>" : "");
        }).join("") + "</tbody></table>";
    }
    if (t === "paquetes") {
      if (!d.paquetes.length) return '<p class="mccf-sub">Sin paquetes.</p>';
      K._paqs = d.paquetes;
      return '<table class="mccf-t"><thead><tr><th>Código</th><th>Paquete</th><th>Sesiones</th><th class="num">Quedan</th><th></th></tr></thead><tbody>' +
        d.paquetes.map(function (p, i) { return '<tr><td class="mccl-cod">' + (p.id ? '<a href="#/m/gift/paquetes/' + encodeURIComponent(p.id) + '">' + e(p.codigo || "—") + "</a>" : e(p.codigo || "—")) + "</td><td>" + e(p.nombre) + "</td><td>" + (p.usos || []).map(function (u) { return '<span class="mccl-ses' + (u.usado ? " u" : "") + '" title="Sesión ' + u.slot + (u.fecha ? " · " + e(u.fecha) : "") + '"></span>'; }).join("") + " " + e(p.usados) + "/" + e(p.total) + '</td><td class="num"><b>' + e(p.pendientes) + '</b></td><td style="text-align:right">' + (p.id && p.pendientes > 0 && window.MCPaquetes ? '<button class="btn small" type="button" data-pqm="' + i + '">✓ Marcar sesión</button>' : "") + "</td></tr>"; }).join("") + "</tbody></table>";
    }
    if (t === "gift") {
      if (!d.giftcards.length) return '<p class="mccf-sub">Sin gift cards.</p>';
      return '<table class="mccf-t"><thead><tr><th>Código</th><th>Fecha</th><th>Compró</th><th>Valor</th>' + (d.admin ? '<th class="num">Saldo</th>' : "") + "<th>Estado</th></tr></thead><tbody>" +
        d.giftcards.map(function (g) { return '<tr><td class="mccl-cod">' + e(g.codigo) + "</td><td>" + e(f(g.fecha)) + "</td><td>" + e(g.comprador) + "</td><td>" + e(g.valor) + "</td>" + (d.admin ? '<td class="num">' + e($m(g.saldo)) + "</td>" : "") + "<td>" + (g.usado ? "Usada " + e(f(g.fechaUso)) + (g.usadoPor ? " · " + e(g.usadoPor) : "") : "Disponible") + "</td></tr>"; }).join("") + "</tbody></table>";
    }
    if (t === "docs") {
      var grupos = d.grupos || agruparDocs(d.documentos || []);
      if (!grupos.length) return '<p class="mccf-sub">Sin documentos.</p>';
      return '<div class="mcd-list">' + grupos.map(grupoHtml).join("") + "</div>";
    }
    if (t === "bitacora") return d.bitacora.length ? '<ul class="mc-hist">' + d.bitacora.slice().reverse().map(function (h) { return "<li>" + e(new Date(h.fecha).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })) + " · <b>" + e(h.accion) + "</b> · " + e(h.por) + (h.motivo ? " · " + e(h.motivo) : "") + (h.cambios ? " · " + e(Object.keys(h.cambios).map(function (k) { return k + ": " + h.cambios[k].antes + " → " + h.cambios[k].despues; }).join("; ")) : "") + "</li>"; }).join("") + "</ul>" : '<p class="mccf-sub">Sin cambios hechos en la beta.</p>';
    return "";
  }
  function regHtml() {
    var d = K.d, P = K.pend || {}, ed = !d.borrado && (d.puedeEditar || d.puedePedir), n = Object.keys(P).length;
    var val = function (k) { return P[k] != null ? P[k] : d.datos[k] || ""; };
    return '<div class="mccl-reg">' + d.campos.map(function (c) {
      var v = val(c[0]), sh = c[0] === "nacimiento" && v ? f(v) : v;
      return "<div><b>" + e(lblE(c[1])) + ':</b> <span class="mccl-v' + (P[c[0]] != null ? " mod" : "") + '"' + (ed ? ' data-rc="' + e(c[0]) + '" tabindex="0" title="Clic para editar"' : "") + ">" + (sh ? e(sh) : '<span class="mccf-sub">—</span>') + "</span>" + (d.corregidos.indexOf(c[0]) >= 0 ? ' <span class="mccl-pend" title="Corregido en la beta">corregido</span>' : "") + "</div>";
    }).join("") + (d.lectura || []).filter(function (c) { return d.datos[c[0]]; }).map(function (c) { return '<div class="ro"><b>' + e(lblE(c[1])) + ":</b> " + e(f(d.datos[c[0]])) + "</div>"; }).join("") + "</div>" +
      (n ? (d.puedeEditar ? "" : '<p style="margin:10px 0 4px;font-size:.8rem;font-weight:700">Motivo del cambio</p><input type="text" id="mccl-mot" style="width:100%;padding:8px;border:1.5px solid var(--cream-d);border-radius:9px" placeholder="Ej. cambió de teléfono">') +
        '<p class="err" id="mccl-err"></p><div class="mccl-acts" style="margin-top:8px"><button class="btn small" type="button" id="mccl-ok">' + (d.puedeEditar ? "Guardar" : "Enviar solicitud") + " (" + n + ')</button><button class="btn ghost small" type="button" id="mccl-no">Descartar</button></div>' : "");
  }
  function regHtmlViejo() {
    var d = K.d;
    if (K.edit) return '<div class="mccl-reg">' + d.campos.map(function (c) { return "<div><b>" + e(lblE(c[1])) + '</b><input data-c="' + e(c[0]) + '" value="' + e(d.datos[c[0]] || "") + '"' + (c[0] === "nacimiento" ? ' type="date"' : "") + "></div>"; }).join("") + "</div>" +
      (d.puedeEditar ? "" : '<p style="margin:10px 0 4px;font-size:.8rem;font-weight:700">Motivo del cambio</p><input type="text" id="mccl-mot" style="width:100%;padding:8px;border:1.5px solid var(--cream-d);border-radius:9px" placeholder="Ej. cambió de teléfono">') +
      '<p class="err" id="mccl-err"></p><div class="mccl-acts"><button class="btn small" type="button" id="mccl-ok">' + (d.puedeEditar ? "Guardar" : "Enviar solicitud") + '</button><button class="btn ghost small" type="button" id="mccl-no">Cancelar</button></div>';
    var v = d.campos.filter(function (c) { return d.datos[c[0]]; });
    return v.length ? '<div class="mccl-reg">' + v.map(function (c) { return "<div><b>" + e(lblE(c[1])) + ":</b> " + e(c[0] === "nacimiento" ? f(d.datos[c[0]]) : d.datos[c[0]]) + (d.corregidos.indexOf(c[0]) >= 0 ? ' <span class="mccl-pend" title="Corregido en la beta">corregido</span>' : "") + "</div>"; }).join("") + "</div>" : '<p class="mccf-sub">Sin datos de registro.</p>';
  }
  function htmlFicha() {
    var d = K.d, r = d.resumen, nombre = ((d.datos.nombres || "") + " " + (d.datos.apellido || "")).trim() || "Sin nombre";
    var tabs = [["historial", "Historial (" + d.historial.length + ")"], ["paquetes", "Paquetes (" + d.paquetes.length + ")"], ["gift", "Gift cards (" + d.giftcards.length + ")"], ["docs", "Documentos (" + (d.grupos || agruparDocs(d.documentos || [])).length + ")"]];
    if (d.bitacora.length) tabs.push(["bitacora", "Cambios"]);
    return '<div id="mccl-root"><p><button class="btn ghost small" type="button" data-go="#/m/clientes">← Volver a la lista</button></p>' +
      (d.borrado ? '<p class="err">Clienta eliminada en la beta' + (d.borradoMotivo ? ": " + e(d.borradoMotivo) : "") + "</p>" : "") +
      '<div class="card"><div class="mccl-h"><div><h2>' + e(nombre) + '</h2><div class="mccl-meta"><span class="mccl-cod">' + e(d.codigo || "sin código") + "</span> · CI " + e(d.datos.cedula || "—") + (d.datos.telefono ? " · ☎ " + e(d.datos.telefono) : "") + (r.registros > 1 ? " · registrada " + r.registros + " veces (se muestra una vez)" : "") + "</div></div>" +
      '<div class="mccl-acts"><button class="btn small" type="button" data-go="#/doc/ov">Nuevo ticket</button>' +
      (d.borrado ? (d.puedeEditar ? '<button class="btn ghost small" type="button" id="mccl-rest">Restaurar</button>' : "") :
        '<button class="btn ghost small mccl-del" type="button" id="mccl-del">' + (d.puedeEditar ? "Eliminar clienta" : "Solicitar eliminación") + "</button>") + "</div></div>" +
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
    if (!K.d || K.d.key !== d.key) K.abiertos = {};
    K.d = d; K.edit = false; K.pend = {};
    return htmlFicha();
  }
  function repintarFicha(main) { var root = main.querySelector("#mccl-root"); if (root) { root.outerHTML = htmlFicha(); wireFicha(main); } }
  function wireFicha(main) {
    var d = K.d; if (!d || !main.querySelector("#mccl-root")) return;
    main.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { K.tab = b.getAttribute("data-tab"); repintarFicha(main); }; });
    main.querySelector("#mccl-tab").onclick = function (ev) {
      var pm = ev.target.closest("[data-pqm]");
      if (pm && window.MCPaquetes) {
        var pq = (K._paqs || [])[+pm.getAttribute("data-pqm")];
        if (pq) window.MCPaquetes.marcarSesion(pq, 0, async function () { var nd = await api("cl_get", { key: d.key }); if (nd && !nd.error) { K.d = nd; repintarFicha(main); } });
        return;
      }
      var pv = ev.target.closest("[data-pv]"); if (pv) { previa(pv.getAttribute("data-pv"), pv.getAttribute("data-pvn")); return; }
      var dz = ev.target.closest("[data-dzip]"); if (dz) { descargarDoc(dz.getAttribute("data-dzip")); return; }
      var pd = ev.target.closest("[data-pvd]"); if (pd) { previaBucket(pd.getAttribute("data-pvd"), pd.getAttribute("data-pvn")); return; }
      var pt = ev.target.closest("[data-pvt]"); if (pt) { previaTarjeta(pt.getAttribute("data-pvt"), pt.getAttribute("data-pvn")); return; }
      var hx = ev.target.closest("tr[data-hx]"); if (hx) { var i = +hx.getAttribute("data-hx"); K.abiertos[i] = !K.abiertos[i]; main.querySelector("#mccl-tab").innerHTML = tabHtml(); cargarMinis(main.querySelector("#mccl-tab")); return; }
      var tr = ev.target.closest("[data-tk]"); if (!tr || ev.target.closest("a")) return;
      sessionStorage.setItem("mctk.volver", location.hash); go("#/m/tickets/t/" + encodeURIComponent(tr.getAttribute("data-tk")));
    };
    wireReg(main); wireAcciones(main);
    if (K.tab === "docs") cargarMinis(main.querySelector("#mccl-tab") || main);
  }
  function wireReg(main) {
    var d = K.d, box = main.querySelector("#mccl-regbox"); if (!box) return;
    var pintar = function () { box.innerHTML = regHtml(); wireReg(main); };
    box.querySelectorAll("[data-rc]").forEach(function (sp) {
      var abrir = function () {
        if (sp.querySelector("input")) return;
        var k = sp.getAttribute("data-rc"), v = K.pend[k] != null ? K.pend[k] : d.datos[k] || "", hecho = false;
        sp.innerHTML = '<input class="mctk-in" ' + (k === "nacimiento" ? 'type="date"' : 'type="text"') + ' value="' + e(v) + '">';
        var inp = sp.querySelector("input"); inp.focus();
        var fin = function (guardar) {
          if (hecho) return; hecho = true;
          var nv = inp.value.trim();
          if (guardar && nv !== (d.datos[k] || "")) K.pend[k] = nv; else if (guardar) delete K.pend[k];
          pintar();
        };
        inp.onblur = function () { fin(true); };
        inp.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); fin(true); } if (ev.key === "Escape") fin(false); };
      };
      sp.onclick = abrir; sp.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); abrir(); } };
    });
    var no = box.querySelector("#mccl-no"); if (no) no.onclick = function () { K.pend = {}; pintar(); };
    var ok = box.querySelector("#mccl-ok");
    if (ok) ok.onmousedown = function (ev) { ev.preventDefault(); };
    if (ok) ok.onclick = async function () {
      var abierto = box.querySelector("[data-rc] input");
      if (abierto) { var kk = abierto.closest("[data-rc]").getAttribute("data-rc"), vv = abierto.value.trim(); if (vv !== (d.datos[kk] || "")) K.pend[kk] = vv; }
      var cambios = Object.assign({}, K.pend);
      var err = box.querySelector("#mccl-err");
      if (!Object.keys(cambios).length) { err.textContent = "No cambiaste nada"; return; }
      ok.disabled = true;
      var r = d.puedeEditar ? await api("cl_guardar", { key: d.key, cambios: cambios })
        : await api("solicitud_crear", { tabla: "cliente_beta", fila: d.key, tipo: "cambio", motivo: (main.querySelector("#mccl-mot") || {}).value || "", propuestos: cambios });
      ok.disabled = false;
      if (!r || r.error) { err.textContent = (r && r.error) || "No se pudo"; return; }
      toast2(d.puedeEditar ? "✓ Datos guardados" : "✓ Solicitud enviada a administración");
      K.t = 0; K.pend = {}; draw();
    };
  }
  function wireAcciones(main) {
    var d = K.d;
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

  async function ensureList() {
    if (K.L && K.L.length) return true;
    var d = await api("cl_list", {});
    if (!d || d.error) return false;
    K.L = d.clientes || []; K.admin = !!d.admin; K.cosms = d.cosmetologas || []; K.secs = d.sectores || []; K.t = Date.now();
    return true;
  }
  window.MCClientes = {
    render: function (route) { return route.sub === "duplicados" && window.MCClientesDup ? window.MCClientesDup.render() : route.sub === "c" && route.id ? renderFicha(String(route.id)) : route.sub === "docs" ? renderSinAsignar() : renderLista(); },
    wire: function (main, route) { if (route.sub === "duplicados" && window.MCClientesDup) window.MCClientesDup.wire(main); else if (route.sub === "c") wireFicha(main); else if (route.sub === "docs") wireSinAsignar(main); else wireLista(main); },
    items: function () { return filtrados().slice(0, K.max); },
    ensureList: ensureList,
    isDirty: function () { return !!(K.pend && Object.keys(K.pend).length); },
    _k: K,
  };
})();
