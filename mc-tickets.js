// Detalle de ticket estilo orden de venta de MineCore (beta, 0048). Lo abre la lista de tickets.
// Admin edita en línea y guarda; los demás arman el cambio y lo piden (Solicitudes). Lector de código de
// barras (USB/Bluetooth = teclado + Enter) en «Agregar producto».
(function () {
  var K = { d: null, cat: null, dirty: false, L: null, desc: null, promo: "", exclC: false, exclN: "" };
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v); }
  function r2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
  function $m(v) { return "$" + r2(v).toFixed(2); }
  function q2(v) { return r2(v) + ""; }
  function opt(v, t, sel) { return '<option value="' + e(v) + '"' + (String(v) === String(sel == null ? "" : sel) ? " selected" : "") + ">" + e(t) + "</option>"; }
  function fecha(f, h) { return f ? f.split("-").reverse().join("/") + (h ? " " + h : "") : ""; }
  function fechaIso(v) { var d = new Date(v); if (isNaN(d)) return String(v || ""); var z = new Date(d.getTime() - 5 * 3600000).toISOString(); return z.slice(8, 10) + "/" + z.slice(5, 7) + "/" + z.slice(0, 4) + " " + z.slice(11, 16); }
  var TIPO = { producto: "Producto", facial: "Facial", extra: "Servicio", paquete: "Paquete", gift: "Gift card", servicio: "Servicio" };
  function toast2(msg, mal) { if (typeof toast === "function") { try { toast(msg, mal ? "#B86B6B" : undefined); return; } catch (x) {} } alert(msg); }
  function beep(ok) {
    try {
      var A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      var c = K.ac || (K.ac = new A()), o = c.createOscillator(), g = c.createGain();
      o.frequency.value = ok ? 1320 : 220; o.type = ok ? "sine" : "square"; g.gain.value = 0.08;
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + (ok ? 0.09 : 0.25));
    } catch (x) {}
  }
  function css() {
    if (window.MCConteo && window.MCConteo._css) window.MCConteo._css();
    if (document.getElementById("mctk-css")) return;
    var s = document.createElement("style"); s.id = "mctk-css";
    s.textContent = [
      ".mctk-h{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.mctk-h h2{margin:0;font-size:1.25rem}.mctk-meta{color:var(--gray);font-size:.8rem;margin-top:3px}",
      ".mctk-leds{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.mctk-led{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:3px 10px;font-size:.7rem;font-weight:800;background:var(--gray-l);color:var(--navy-d)}",
      ".mctk-led:before{content:'';width:8px;height:8px;border-radius:50%;background:#aaa}.mctk-led.ok:before{background:#2e9e4f}.mctk-led.r:before{background:#d9534f}.mctk-led.c:before{background:#e0a800}.mctk-led.a:before{background:#4a74c9}.mctk-led.x:before{background:#666}.mctk-led.off:before{background:#ccc}",
      ".mctk-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.mctk-acts[hidden],.mctk-dd[hidden]{display:none}.mctk-menu{position:relative}.mctk-dd{position:absolute;right:0;top:100%;margin-top:4px;background:var(--white,#fff);border:1px solid var(--cream-d);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);min-width:240px;z-index:50;padding:4px}",
      ".mctk-dd a,.mctk-dd button{display:block;width:100%;text-align:left;padding:8px 10px;border:none;background:none;font:inherit;font-size:.8rem;color:var(--navy-d);text-decoration:none;cursor:pointer;border-radius:7px}.mctk-dd a:hover,.mctk-dd button:hover{background:var(--cream)}",
      ".mctk-t input,.mctk-t select{padding:5px 6px;border:1.5px solid var(--cream-d);border-radius:7px;font:inherit;font-size:.8rem}.mctk-t .q{width:58px;text-align:right}.mctk-t .p{width:80px;text-align:right}.mctk-t .dv{width:58px;text-align:right}",
      ".mctk-tot{display:grid;grid-template-columns:1fr auto;gap:4px 18px;max-width:360px;margin-left:auto;font-size:.88rem}.mctk-tot b{text-align:right}.mctk-tot .big{font-size:1.2rem;color:var(--navy-d)}",
      ".mctk-flash{animation:mctkf .6s}@keyframes mctkf{0%{background:#c9f2d3}100%{background:transparent}}.mctk-flash-bad{animation:mctkb .6s}@keyframes mctkb{0%{background:#f9d0cc}100%{background:transparent}}",
      ".mctk-scan{display:flex;gap:8px;align-items:center}.mctk-scan input{flex:1;padding:9px 11px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit}.mctk-est{font-size:.62rem;background:#fff3d6;color:#9a6b00;border-radius:6px;padding:1px 5px;margin-left:4px}",
      ".mctk-dlg{position:fixed;inset:0;background:rgba(20,30,50,.35);display:flex;align-items:center;justify-content:center;z-index:9999}.mctk-box{background:var(--white,#fff);border-radius:14px;padding:16px;width:min(520px,94vw);max-height:88vh;overflow:auto}",
      ".mctk-box label{display:flex;gap:8px;align-items:center;font-size:.84rem;margin:6px 0}.mctk-box textarea,.mctk-box input[type=text]{width:100%;box-sizing:border-box;padding:8px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit}",
      ".mctk-xc{color:#b2452a;font-size:.68rem;font-weight:800}",
      ".mctk-lnw{display:flex;gap:8px;align-items:center}.mctk-ph{width:38px;height:38px;object-fit:cover;border-radius:7px;border:1px solid var(--cream-d);flex:none}",
      ".mctk-falta{background:#fff6d6;border:1.5px solid #e8cf7a;color:#6b4e00;border-radius:12px;padding:10px 12px;margin-bottom:10px;font-size:.84rem;display:flex;flex-direction:column;gap:8px}",
      ".mctk-ed{cursor:text;border-radius:5px;padding:1px 4px;margin:-1px -4px;display:inline-block;min-width:40px}.mctk-ed:hover,.mctk-ed:focus{background:var(--cream);outline:1px dashed var(--cream-d)}.mctk-t .dv{width:64px}.mctk-t input.bad{border-color:#d9534f}.mctk-canje{font-size:.7rem;font-weight:800;color:#7C6BB0}",
      ".mctk2 .mctk-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.mctk-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}.mctk-num{margin:0;font-size:1.6rem;color:var(--navy-d);letter-spacing:.3px}.mctk-fac{color:var(--gray);font-size:.86rem;margin-top:2px}",
      ".mctk-pills{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:460px}.mctk-pill{display:inline-block;border:1.5px solid;border-radius:999px;padding:2px 10px;font-size:.7rem;font-weight:700;background:transparent;white-space:nowrap;line-height:1.5}",
      ".mctk-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 28px;margin-top:14px}@media(max-width:720px){.mctk-grid{grid-template-columns:1fr}}.mctk-grid dl,.mctk-grid1{margin:0}.mctk-f{display:grid;grid-template-columns:130px 1fr;gap:8px;padding:6px 0;border-bottom:1px solid var(--cream-d);font-size:.84rem}.mctk-f dt{color:var(--gray);font-size:.76rem}.mctk-f dd{margin:0;word-break:break-word}.mctk-f .v.mod{background:#fff3d6;border-radius:4px;padding:0 3px}",
      ".mctk-pen{border:none;background:none;color:var(--gray);cursor:pointer;font-size:.85rem;padding:0 3px}.mctk-pen:hover{color:var(--navy-d)}.mctk-in{padding:5px 7px;border:1.5px solid var(--cream-d);border-radius:7px;font:inherit;font-size:.82rem;width:min(100%,260px)}textarea.mctk-in{width:100%}",
      ".mctk-lt td{padding:6px 8px;vertical-align:middle}.mctk-pn{font-weight:600}.mctk-sku{color:var(--gray);font-size:.68rem;margin-top:1px}.mctk-x{border:none;background:none;color:#b2452a;font-size:1.1rem;cursor:pointer}.mctk-link{display:inline-block;margin-top:8px;color:var(--pink-d,#b85c7a);font-size:.82rem;font-weight:700;text-decoration:none}.mctk-link:hover{text-decoration:underline}",
      ".mctk-foot{display:flex;gap:16px;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;margin-top:12px}.mctk-adj{display:flex;flex-direction:column;gap:6px;font-size:.78rem;color:var(--gray)}.mctk-adj select,.mctk-adj input{padding:4px 6px;border:1.5px solid var(--cream-d);border-radius:7px;font:inherit;font-size:.78rem}#mctk-tot{min-width:280px}",
      ".mctk-flag{background:#fdecea;border:1.5px solid #e6a39b;color:#7a2318;border-radius:12px;padding:10px 12px;margin-bottom:10px;font-size:.84rem;display:flex;flex-direction:column;gap:8px}",
      ".mctk-cost{width:min(620px,94vw)}.mctk-cd{display:grid;grid-template-columns:1fr auto;gap:8px 16px;font-size:.86rem;margin:12px 0}.mctk-cd dt{color:var(--gray)}.mctk-cd dd{margin:0;text-align:right}",
      ".mctk-ln input.q,.mctk-ln input.p{-moz-appearance:textfield;appearance:textfield;padding:6px 10px;text-align:center;box-sizing:border-box}.mctk-ln input.q{width:64px}.mctk-ln input.p{width:92px;padding-left:20px}.mctk-ln input.q::-webkit-outer-spin-button,.mctk-ln input.q::-webkit-inner-spin-button,.mctk-ln input.p::-webkit-outer-spin-button,.mctk-ln input.p::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.mctk-money{position:relative;display:inline-block}.mctk-money>span{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--gray);font-size:.82rem;pointer-events:none}",
      ".mctk-cli{font-size:.9rem;font-weight:700;color:var(--navy-d);margin:-2px 0 2px}.mctk-cod{font-family:ui-monospace,monospace;color:var(--navy);text-decoration:none;border-bottom:1px dashed}",
      ".mctk-cancel{color:#C0392B!important;border-color:#E6B0AA!important}.btn.small.mctk-cancel:not(.ghost){background:#C0392B!important;color:#fff!important}.mctk-canc{background:#FDECEA;border:1px solid #E6B0AA;color:#922B21;border-radius:10px;padding:10px 12px;margin:8px 0;font-size:.85rem}" +
      ".mctk-xdlg .mctk-box{width:min(620px,94vw);max-height:88vh;overflow:auto}.mctk-xh{display:flex;justify-content:space-between;align-items:center}.mctk-xh h3{margin:0}.mctk-xx{background:none;border:0;font-size:1.6rem;line-height:1;cursor:pointer;color:var(--navy)}.mctk-xtog{display:flex!important;align-items:center;gap:10px;padding:10px 12px;margin:8px 0;background:var(--cream);border-radius:10px;font-size:.86rem;cursor:pointer}.mctk-xdlg input[type=checkbox]{width:18px!important;height:18px;margin:0;flex:none;accent-color:var(--navy)}.mctk-xt{width:100%;border-collapse:collapse;font-size:.84rem;margin:4px 0 10px}.mctk-xt th{font-size:.68rem;text-transform:uppercase;color:var(--gray);text-align:left;padding:6px 8px;border-bottom:1px solid var(--cream-d)}.mctk-xt td{padding:8px;border-bottom:1px solid #f0ece4;vertical-align:middle}.mctk-xt .num{text-align:right;white-space:nowrap}.mctk-xt .c{text-align:center;width:70px}.mctk-xlbl{display:block;font-size:.8rem;font-weight:700}.mctk-xlbl input{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit;font-weight:400}",
      "@media print{body.mctk-printing .mctk-bar,body.mctk-printing #mctk-save,body.mctk-printing .mctk-pen,body.mctk-printing #mctk-addlink,body.mctk-printing #mctk-addbox,body.mctk-printing nav,body.mctk-printing header,body.mctk-printing .mctk-x{display:none!important}}",

    ].join("");
    document.head.appendChild(s);
  }

  // ---------- cálculo en vivo (mismo que ticket_beta.ts) ----------
  function descDe(base, tipo, valor) { valor = Number(valor) || 0; if (!(base > 0) || !(valor > 0)) return 0; if (tipo === "%") return r2(base * Math.min(100, valor) / 100); if (tipo === "$") return r2(Math.min(base, valor)); return 0; }
  function promoMonto(p, L) {
    if (!p) return 0;
    var cods = (p.codigos || []).map(function (c) { return String(c).toUpperCase().replace(/^SUNSU-/, ""); }), u = [];
    L.forEach(function (l) { var c = String(l.sku).toUpperCase().replace(/^SUNSU-/, ""); if (cods.length && cods.indexOf(c) < 0) return; for (var i = 0; i < Math.round(l.cantidad); i++) u.push({ p: l.cantidad ? l.total_linea / l.cantidad : 0, pack: l.tipo === "paquete" }); });
    var sum = u.reduce(function (a, x) { return a + x.p; }, 0), t = String(p.tipo || "%").toUpperCase(), m = 0;
    if (t === "$") m = Math.min(Number(p.valor) || 0, sum);
    else if (t === "NXM") { var N = Math.round(p.valor), M = Math.round(p.valor2); if (N >= 2 && M >= 1 && M < N) { var ps = u.map(function (x) { return x.p; }).sort(function (a, b) { return b - a; }); var lib = Math.floor(ps.length / N) * (N - M); for (var i = ps.length - lib; i < ps.length; i++) m += ps[i]; } }
    else if (t === "PACK") u.forEach(function (x) { if (x.pack) m += Math.max(0, x.p - (Number(p.valor) || 0)); });
    else m = sum * (Number(p.valor) || 0) / 100;
    return r2(m);
  }
  function calc() {
    var L = K.L.map(function (l) { var br = r2(l.cantidad * l.precio_unit), dm = descDe(br, l.descuento_tipo, l.descuento_valor); l.descuento_monto = dm; l.total_linea = r2(br - dm); return l; });
    var suma = r2(L.reduce(function (a, l) { return a + l.total_linea; }, 0));
    var pr = (K.d.promos || []).find(function (p) { return p.nombre === K.promo; }) || (K.promo && K.promo === K.d.promo ? { tipo: "$", valor: K.d.totales.promo, codigos: [] } : null);
    var pm = Math.min(suma, promoMonto(pr, L)), base = r2(suma - pm), dt = descDe(base, K.desc.tipo, K.desc.valor), tot = r2(base - dt), sub = r2(tot / 1.15);
    return { suma: suma, promo: pm, desc: dt, total: tot, subtotal: sub, iva: r2(tot - sub) };
  }

  // ---------- pintar ----------
  // ---------- detalle v2 (como la orden de MineCore) ----------
  var CHIP = { abierto: "#3E7CB1", cerrado: "#56627A", porcobrar: "#C98A00", pagado: "#2E8B57", sinfactura: "#D2603A", facturado: "#2A8C8C", anulado: "#C0392B", ok: "#2E8B57", pend: "#8A93A6", info: "#7C6BB0" };
  function pill(c, t, tip) { var col = CHIP[c] || "#8A93A6"; return '<span class="mctk-pill" style="color:' + col + ";border-color:" + col + '"' + (tip ? ' title="' + e(tip) + '"' : "") + ">" + e(t) + "</span>"; }
  function val(k) { var d = K.d, v = K.datos && K.datos[k] != null ? K.datos[k] : (d.info || {})[k]; return v == null ? "" : String(v); }
  function campo(k, lbl, opts) {
    opts = opts || {};
    var v = val(k), ed = K.d.puedeEditar || K.d.puedePedir, mod = K.datos && K.datos[k] != null;
    var shown = opts.fmt ? opts.fmt(v) : v;
    var html0 = k === "cosmetologa" && shown && window.MCColor ? window.MCColor.pill(shown) : null;
    var edit = ed && !opts.ro;
    return '<div class="mctk-f"><dt>' + e((window.MCEmojiCampo ? window.MCEmojiCampo(lbl) : lbl)) + '</dt><dd data-k="' + e(k) + '"><span class="v' + (mod ? " mod" : "") + (edit ? ' mctk-ed" data-ed="' + e(k) + '" tabindex="0" title="Clic para editar' : "") + '">' + (html0 || (shown ? e(shown) : '<span class="mccf-sub">—</span>')) + "</span></dd></div>";
  }
  function ro(lbl, v) { return '<div class="mctk-f"><dt>' + e((window.MCEmojiCampo ? window.MCEmojiCampo(lbl) : lbl)) + "</dt><dd>" + (v ? v : '<span class="mccf-sub">—</span>') + "</dd></div>"; }
  function chipsHtml() { return (K.d.chips || []).map(function (c) { return pill(c.c, c.t); }).join(""); }
  function waHtml() {
    var d = K.d, p = d.paquete || {}, conPaq = !!(p.vigentes && p.vigentes.length) || !!p.uso;
    return '<button type="button" data-wa="facial">💬 Enviar reporte facial</button>' + (conPaq ? '<button type="button" data-wa="paquete">🎴 Enviar reporte de paquete</button>' : "") + '<button type="button" data-wa="chat">Abrir chat</button>';
  }
  function docsHtml2() {
    var d = K.d, t = d.ticket, h = "";
    if (t.sheetRow) h += '<button type="button" data-doc="tarjeta">📄 Tarjeta del tratamiento (PDF)</button>';
    var pq0 = d.paquete || {}; if ((pq0.vigentes && pq0.vigentes.length) || pq0.uso) h += '<button type="button" data-doc="paquete">🎴 Reporte del paquete (PDF)</button>';
    (d.giftcards || []).filter(function (g) { return g.uso === "vendida"; }).forEach(function (g) { h += '<button type="button" data-doc="gc" data-cod="' + e(g.codigo) + '">🎁 Gift card ' + e(g.codigo) + " (PDF)</button>"; });
    (d.documentos || []).filter(function (x) { return x.tipo !== "foto"; }).forEach(function (x) { h += '<button type="button" data-pv="' + e(x.url) + '" data-pvn="' + e(x.nombre) + '">' + (x.tipo === "foto" ? "🖼️ " : "🧾 ") + e(x.nombre) + "</button>"; });
    return h || '<div class="mccf-sub" style="padding:8px">Sin documentos.</div>';
  }
  function descTxt(tp, v) { v = Number(v) || 0; if (!(v > 0) || !tp) return ""; return tp === "$" ? "$" + q2(v) : q2(v) + "%"; }
  /** «10%», «10», «$5», «5$» → {tipo, valor}; vacío = sin descuento; null = no se entiende. */
  function descParse(txt) {
    var t = String(txt || "").replace(/\s+/g, "").replace(",", ".");
    if (!t) return { tipo: null, valor: 0 };
    var m = t.match(/^(\$)?(\d+(?:\.\d+)?)(%|\$)?$/); if (!m) return null;
    var v = Number(m[2]); if (!(v > 0)) return { tipo: null, valor: 0 };
    var tp = m[1] || m[3] === "$" ? "$" : "%"; if (tp === "%" && v > 100) return null;
    return { tipo: tp, valor: v };
  }
  function fotoLinea(l) {
    var c = (K.cat || []).find(function (p) { return p.tipo === l.tipo && p.sku === l.sku; });
    return c && c.foto ? '<img class="mctk-ph" src="' + e(c.foto) + '" alt="" loading="lazy">' : "";
  }
  function codigoVisible(l) {
    var c = (K.cat || []).find(function (p) { return p.tipo === l.tipo && p.sku === l.sku; });
    if (c && c.skuVisible) return c.skuVisible;
    var s0 = String(l.sku || "");
    return (l.tipo === "facial" || l.tipo === "extra" || l.tipo === "servicio" || l.tipo === "paquete") && /^\d+$/.test(s0) ? "SUNSU-" + s0 : s0;
  }
  function lineasHtml() {
    calc();
    if (!K.L.length) return '<tr><td colspan="8" class="mccf-sub" style="padding:12px">Sin líneas.</td></tr>';
    return K.L.map(function (l, i) {
      return '<tr data-i="' + i + '" class="mctk-ln"><td class="mccf-sub">' + (i + 1) + '</td><td><div class="mctk-lnw">' + fotoLinea(l) + '<div><div class="mctk-pn">' + e(l.nombre) + (l.canje ? ' <span class="mctk-pill" style="color:#7C6BB0;border-color:#7C6BB0">Canje</span>' : "") + (l.cortesia ? ' <span class="mctk-pill" style="color:#2E8B57;border-color:#2E8B57">Cortesía</span>' : "") + (l.excluir_comision ? ' <span class="mctk-xc">sin comisión</span>' : "") + '</div><div class="mctk-sku">' + e(codigoVisible(l)) + " · " + e(TIPO[l.tipo] || l.tipo) + "</div></div></div></td>" +
        '<td class="num"><input class="q" type="number" inputmode="decimal" min="0" step="any" data-f="cantidad" value="' + e(q2(l.cantidad)) + '"></td>' +
        '<td class="num">' + (l.cortesia && !(l.precio_unit > 0) ? '<span class="mctk-canje" style="color:#2E8B57" title="Cortesía (marcada al crear el ticket)">Cortesía</span>' : l.canje && !(l.precio_unit > 0) ? '<span class="mctk-canje" title="Canjeado de paquete o gift card">Canje</span>' : '<span class="mctk-money"><span>$</span><input class="p" type="number" inputmode="decimal" min="0" step="0.01" data-f="precio_unit" value="' + e(r2(l.precio_unit).toFixed(2)) + '"></span>') + "</td>" +
        '<td class="num"><input class="dv" type="text" inputmode="decimal" data-f="desc" placeholder="—" title="10% o $5" value="' + e(descTxt(l.descuento_tipo, l.descuento_valor)) + '"></td>' +
        '<td class="num" data-tl>' + (l.cortesia && !(l.total_linea > 0) ? '$0.00 <span class="mctk-canje" style="color:#2E8B57">Cortesía</span>' : l.canje && !(l.total_linea > 0) ? '$0.00 <span class="mctk-canje">Canje</span>' : e($m(l.total_linea))) + "</td>" + '<td><button class="mctk-x" type="button" data-del="' + i + '" title="Quitar línea">×</button></td></tr>';
    }).join("");
  }
  function totHtml() {
    var c = calc(), d = K.d, pg = d.pagos || {}, desc = r2(c.promo + c.desc), pag = r2((pg.cobrado ? Math.min(c.total, pg.pagado || c.total) : 0) + (K.pagoBeta || 0));
    var met = (pg.metodos || []).map(function (m) { return e(m.metodo) + (m.ref ? ' <span class="mccf-sub">' + e(m.ref) + "</span>" : ""); }).join(" · ");
    return '<div class="mctk-tot"><span>Subtotal</span><b>' + $m(c.suma / 1.15) + "</b>" + (desc ? "<span>Descuento" + (c.promo ? " (" + e(K.promo) + ")" : "") + "</span><b>−" + $m(desc / 1.15) + "</b>" : "") +
      "<span>IVA 15%</span><b>" + $m(c.iva) + '</b><span class="big">Total</span><b class="big">' + $m(c.total) + "</b>" +
      "<span>Pagado</span><b>" + $m(pag) + "</b><span>Saldo</span><b" + (c.total - pag > 0.009 ? ' style="color:#C98A00"' : "") + ">" + $m(Math.max(0, c.total - pag)) + "</b>" +
      (met ? '<span class="mccf-sub">Forma de pago</span><span style="text-align:right;font-size:.8rem">' + met + "</span>" : "") +
      (Math.abs(c.total - d.ticket.cobradoSistema) > 0.009 ? '<span class="mccf-sub">Cobrado en el sistema</span><b class="mccf-sub">' + $m(d.ticket.cobradoSistema) + "</b>" : "") + "</div>" +
      (d.costosVisibles ? '<p style="text-align:right;margin:6px 0 0"><a href="#" id="mctk-costos" class="mctk-link">Detalle de costos</a></p>' : "");
  }
  function flagsHtml() {
    var F = K.d.flags || []; if (!F.length) return "";
    return '<div class="mctk-flag">' + F.map(function (f) {
      return '<div><b>⚠ Por corregir: ' + e(f.motivo) + "</b>" + (f.factura ? ' <span class="mccf-sub">· factura ' + e(f.factura) + "</span>" : "") + (f.detalle ? "<div>" + e(f.detalle) + "</div>" : "") +
        (K.d.puedeEditar ? ' <button type="button" class="btn ghost small" data-flag="' + e(f.id) + '">Marcar resuelto</button>' : '<div class="mccf-sub">Corrige con «Solicitar cambio»; un admin lo revisa.</div>') + "</div>";
    }).join("") + "</div>";
  }
  function faltaHtml() {
    var F = K.d.faltan || []; if (!F.length || (K.d.flags || []).length) return "";
    var comp = F.some(function (x) { return /comprobante/i.test(x); });
    return '<div class="mctk-falta"><b>Falta: ' + e(F.join(" · ")) + "</b>" +
      (comp ? '<div><label class="btn small" style="cursor:pointer">📷 Subir comprobante<input type="file" id="mctk-subir" accept="image/*,application/pdf" capture="environment" hidden></label> <span class="mccf-sub">Foto del comprobante de la transferencia. Cualquiera que vea el ticket puede subirla.</span></div>' : "") + "</div>";
  }
  function comprimir(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onerror = function () { rej(new Error("No se pudo leer el archivo")); };
      fr.onload = function () {
        var url = fr.result;
        if (!/^data:image\//.test(url)) return res(url);
        var im = new Image();
        im.onload = function () {
          var k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
          c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
          c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          res(c.toDataURL("image/jpeg", 0.85));
        };
        im.onerror = function () { res(url); };
        im.src = url;
      };
      fr.readAsDataURL(file);
    });
  }
  function relHtml() {
    var d = K.d, h = "", G = d.giftcards || [], p = d.paquete || {}, E = d.envios || [];
    if (G.length) h += '<div class="mccf-card"><b>Gift cards</b><table class="mccf-t mctk-t" style="margin-top:6px"><thead><tr><th>Código</th><th>En este ticket</th><th>Compró</th><th>Para</th><th>Facial</th><th class="num">Saldo</th></tr></thead><tbody>' +
      G.map(function (g) { return "<tr><td><b>" + e(g.codigo) + "</b></td><td>" + e(g.uso) + "</td><td>" + e(g.comprador || g.de || "—") + "</td><td>" + e(g.para || "—") + "</td><td>" + e(g.facial || g.valor || "—") + '</td><td class="num">' + (g.saldo != null ? e($m(g.saldo)) : g.usado ? "usada" : "—") + "</td></tr>"; }).join("") + "</tbody></table></div>";
    if (p.uso || p.compra || (p.vigentes || []).length) h += '<div class="mccf-card"><b>Paquete</b><div class="mctk-grid1">' + (p.uso ? ro("Sesión en este ticket", e(p.uso)) : "") + (p.compra ? ro("Compra", e(p.compra)) : "") +
      (p.vigentes || []).map(function (v) { return ro(v.nombre || v.codigo, e(v.usados + "/" + v.total + " usadas · quedan " + v.pendientes)); }).join("") + "</div></div>";
    h += '<div class="mccf-card"><b>Reportes enviados</b>' + (E.length ? '<ul class="mctr-log">' + E.map(function (x) { return "<li>" + e(fechaIso(x.fecha)) + " · " + e(x.tipo) + " · " + e(x.por || "—") + "</li>"; }).join("") + "</ul>" : '<p class="mccf-sub">Todavía no se envía el reporte a la clienta.</p>') + "</div>";
    h += '<div class="mccf-card"><b>Historial</b>' + ((d.historial || []).length ? '<ul class="mctr-log">' + d.historial.slice().reverse().map(function (x) { return "<li>" + e(fechaIso(x.fecha)) + " · <b>" + e(x.accion) + "</b> · " + e(x.detalle) + " · " + e(x.actor) + (x.total != null ? " · total " + $m(x.total) : "") + "</li>"; }).join("") + "</ul>" : '<p class="mccf-sub">Sin cambios en la beta. ' + (d.lineasBeta ? "" : "Las líneas salen del sistema; si el ticket tiene varias, el precio por línea es un estimado del total cobrado.") + "</p>") + "</div>";
    return h;
  }
  function html() {
    var d = K.d, t = d.ticket, inf = d.info || {}, rg = d.reagendada || {};
    var num = t.soNum || t.betaNum || ("#" + t.sheetRow), fac = val("factura");
    var reag = rg.si ? (rg.cita ? "Sí · " + fechaIso(rg.cita) : "Sí") : "No";
    return '<div id="mctk-root" class="mctk2">' + (d.falta ? '<p class="err">' + e(d.falta) + "</p>" : "") +
      '<div class="mctk-bar"><button class="btn ghost small" type="button" id="mctk-volver">' + (sessionStorage.getItem("mctk.volver") ? "← Clienta" : "← Lista") + "</button><span style=\"flex:1\"></span>" +
      '<div class="mctk-menu"><button class="btn ghost small" type="button" data-menu="mctk-dd">Documentos ▾</button><div class="mctk-dd" id="mctk-dd" hidden>' + docsHtml2() + "</div></div>" +
      '<div class="mctk-menu"><button class="btn ghost small" type="button" data-menu="mctk-wa">WhatsApp ▾</button><div class="mctk-dd" id="mctk-wa" hidden>' + waHtml() + "</div></div>" +
      '<button class="btn ghost small" type="button" id="mctk-print">Imprimir</button><button class="btn ghost small" type="button" id="mctk-excl">Excluir comisión</button>' + (d.admin && window.MCMultas ? '<button class="btn ghost small" type="button" id="mctk-multa">⚠️ Aplicar multa</button>' : "") + (d.puedeCancelar ? '<button class="btn ghost small mctk-cancel" type="button" id="mctk-cancelar">🚫 Cancelar ticket</button>' : "") + "</div>" +
      (t.cancelado ? '<div class="mctk-canc"><b>🚫 Ticket cancelado</b>' + (t.cancelado.por ? " por " + e(t.cancelado.por) : "") + (t.cancelado.ts ? " · " + e(String(t.cancelado.ts).slice(0, 16).replace("T", " ")) : "") + (t.cancelado.motivo ? "<br>Motivo: " + e(t.cancelado.motivo) : "") + "<br><small>No suma en totales, comisiones ni dashboard. El stock de productos volvió a su bodega.</small></div>" : "") +
      flagsHtml() + faltaHtml() +
      '<div class="mccf-card"><div class="mctk-top"><div><h1 class="mctk-num">' + e(num) + '</h1>' + ((d.info && (d.info.nombre || d.info.clienteCodigo)) ? '<div class="mctk-cli">' + e(((d.info.nombre || "") + " " + (d.info.apellido || "")).trim()) + (d.info.clienteCodigo ? ' · <a class="mctk-cod" href="#/m/clientes/c/' + encodeURIComponent(d.clienteKey || "") + '">' + e(d.info.clienteCodigo) + "</a>" : "") + "</div>" : "") + '<div class="mctk-fac" data-k="factura"><span' + ((d.puedeEditar || d.puedePedir) ? ' class="mctk-ed" data-ed="factura" tabindex="0" title="Clic para editar"' : "") + ">" + (fac ? "Factura " + e(fac) : '<span class="mccf-sub">Sin factura</span>') + "</span></div></div>" + '<div class="mctk-pills">' + chipsHtml() + "</div></div>" +
      '<div class="mctk-grid"><dl>' + campo("nombre", "Nombre") + campo("apellido", "Apellido") + campo("cedula", "CI") + ((d.campos || []).some(function (c) { return c[0] === "email"; }) ? campo("email", "Email") + campo("telefono", "Teléfono") : "") + campo("cosmetologa", "Atendió") + campo("notas", "Notas") + campo("recomendaciones", "Recomendaciones") + "</dl>" +
      "<dl>" + ro("Fecha", e(fecha(inf.fecha, inf.hora))) + campo("local", "Local") + ro("Orden", e(inf.orden != null ? "#" + inf.orden : "")) + campo("retorno", "Fecha de regreso", { fmt: function (v) { return v ? fecha(v) : ""; } }) + ro("Reagendada", e(reag)) +
      (d.clienteKey ? ro("Ficha", '<a href="#" id="mctk-ficha" class="mctk-link">Ver clienta</a>') : "") + "</dl></div>" +
      (d.excluirCosmetologa ? '<p class="mccf-note">Comisión excluida para ' + e(t.cosmetologa) + (d.excluirNota ? ": " + e(d.excluirNota) : "") + "</p>" : "") + "</div>" +
      '<div class="mccf-card"><b>Líneas</b><div class="sheet-scroll" style="margin-top:6px"><table class="mccf-t mctk-t mctk-lt"><thead><tr><th>#</th><th>Producto</th><th class="num">Cant</th><th class="num">Precio</th><th class="num">Desc</th><th class="num">Subtotal</th><th></th></tr></thead><tbody id="mctk-lin">' + lineasHtml() + "</tbody></table></div>" +
      '<a href="#" class="mctk-link" id="mctk-addlink">+ Agregar producto</a><div id="mctk-addbox" hidden><div class="mctk-scan" style="margin-top:6px"><input type="search" id="mctk-q" placeholder="Nombre, SKU o escanea el código" autocomplete="off"></div><div class="mccf-hits" id="mctk-hits" hidden></div></div>' +
      '<div class="mctk-foot"><div class="mctk-adj"><label>Promoción <select id="mctk-promo">' + opt("", "Sin promoción", K.promo) + (d.promos || []).map(function (p) { return opt(p.nombre, p.nombre, K.promo); }).join("") + (K.promo && !(d.promos || []).some(function (p) { return p.nombre === K.promo; }) ? opt(K.promo, K.promo + " (ya no vigente)", K.promo) : "") + "</select></label>" +
      '<label>Descuento del ticket <input id="mctk-dv" type="text" inputmode="decimal" placeholder="10% o $5" value="' + e(descTxt(K.desc.tipo, K.desc.valor)) + '" style="width:84px"></label></div><div id="mctk-tot">' + totHtml() + '</div></div><div id="mctk-pagos"></div>' +
      '<p class="err" id="mctk-err"></p><div class="mctk-acts" id="mctk-save"' + (K.dirty ? "" : " hidden") + ">" + (d.puedeEditar ? '<button class="btn small" type="button" id="mctk-guardar">Guardar cambios</button>' : '<button class="btn small" type="button" id="mctk-pedir">Solicitar cambio</button>') + '<button class="btn ghost small" type="button" id="mctk-descartar">Descartar</button></div></div>' +
      relHtml() + "</div>";
  }

  // ---------- agregar / escanear ----------
  function norm(c) { return String(c || "").trim().replace(/\.0+$/, "").replace(/\s+/g, ""); }
  function porBarras(code) {
    var c = norm(code); if (!c) return null;
    return (K.cat || []).find(function (p) { return (p.barras || []).some(function (b) { return norm(b) === c; }); }) || null;
  }
  function agregar(p, flashBad) {
    if (!p) return false;
    if (p.activo === false) { beep(false); toast2("«" + p.nombre + "» está inactivo: no se puede vender", true); flashBad(); return false; }
    var l = K.L.find(function (x) { return x.sku === p.sku && x.tipo === p.tipo; });
    if (l) l.cantidad = r2(l.cantidad + 1);
    else K.L.push({ tipo: p.tipo, sku: p.sku, nombre: p.nombre, cantidad: 1, precio_unit: r2(p.pvp), descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: false });
    marcar(); pintarLin(); beep(true);
    var idx = K.L.indexOf(l || K.L[K.L.length - 1]), tr = document.querySelector('#mctk-lin tr[data-i="' + idx + '"]');
    if (tr) { tr.classList.remove("mctk-flash"); void tr.offsetWidth; tr.classList.add("mctk-flash"); }
    return true;
  }
  function wireBuscar(main) {
    var q = main.querySelector("#mctk-q"), hits = main.querySelector("#mctk-hits");
    function bad() { q.classList.remove("mctk-flash-bad"); void q.offsetWidth; q.classList.add("mctk-flash-bad"); }
    function lista() {
      var v = q.value.trim(); if (!v) { hits.hidden = true; return; }
      var H = (window.MCBuscar ? window.MCBuscar.filtrar(K.cat || [], v, function (p) { return [[p.sku, p.skuVisible].concat(p.barras || []), [p.nombre]]; }) : []).filter(function (p) { return p.activo !== false; }).slice(0, 10);
      hits.hidden = false;
      hits.innerHTML = H.length ? H.map(function (p) { return '<button type="button" data-add="' + e(p.tipo + "|" + p.sku) + '"><span class="mccf-chip">' + e(TIPO[p.tipo] || p.tipo) + '</span> <span class="mccf-sku">' + e(p.skuVisible || p.sku) + "</span> " + e(p.nombre) + ' <span class="mccf-sub">· ' + e($m(p.pvp)) + (p.stock != null ? " · stock " + e(q2(p.stock)) : "") + "</span></button>"; }).join("") : '<div class="mccf-sub" style="padding:8px">Sin resultados</div>';
    }
    q.oninput = lista;
    q.onkeydown = function (ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      var v = q.value.trim(); if (!v) return;
      var p = porBarras(v);
      if (p) { agregar(p, bad); q.value = ""; hits.hidden = true; return; }
      if (/^\d{6,14}$/.test(norm(v))) { beep(false); bad(); toast2("Código " + norm(v) + " no encontrado", true); q.select(); return; }
      var f = hits.querySelector("[data-add]"); if (f) f.click();
    };
    hits.onclick = function (ev) {
      var b = ev.target.closest("[data-add]"); if (!b) return;
      var k = b.getAttribute("data-add").split("|"), p = (K.cat || []).find(function (x) { return x.tipo === k[0] && x.sku === k[1]; });
      if (agregar(p, bad)) { q.value = ""; hits.hidden = true; q.focus(); }
    };
    // Lector: si escanean sin el foco en el buscador (y no en otro campo), igual entra al buscador.
    if (!K.scanWired) {
      K.scanWired = true; var buf = "", last = 0;
      document.addEventListener("keydown", function (ev) {
        var box = document.getElementById("mctk-q"); if (!box || document.activeElement === box) return;
        var tg = ev.target; if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable)) return;
        var now = Date.now(); if (now - last > 60) buf = ""; last = now;
        if (ev.key === "Enter" && buf.length >= 6) { var wr = document.getElementById("mctk-addbox"); if (wr) wr.hidden = false; box.value = buf; buf = ""; box.focus(); box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); ev.preventDefault(); return; }
        if (ev.key.length === 1) buf += ev.key;
      });
    }
  }

  // ---------- excluir comisión ----------
  function dlgCancelar() {
    var d = K.d, t = d.ticket, box = document.createElement("div"); box.className = "mctk-dlg mctk-xdlg";
    var prods = K.L.filter(function (l) { return l.tipo === "producto"; });
    box.innerHTML = '<div class="mctk-box"><div class="mctk-xh"><h3>🚫 Cancelar ' + e(t.soNum || t.betaNum || "ticket") + '</h3><button type="button" class="mctk-xx" data-cerrar title="Cerrar">×</button></div>' +
      '<p class="mccf-sub">El ticket no se borra: queda <b>Cancelado</b> y sale de totales, comisiones y dashboard. ' + (prods.length ? "Los productos (" + prods.map(function (l) { return e(l.nombre) + " ×" + e(q2(l.cantidad)); }).join(", ") + ") vuelven a la bodega de donde salieron. " : "") + "Los servicios solo se cancelan. Si el ticket creó un paquete, el paquete se da de baja.</p>" +
      '<label class="mctk-xlbl">Motivo<input type="text" id="mctk-cm" placeholder="Ej. ticket duplicado, la clienta no vino"></label>' +
      '<p class="err" id="mctk-cerr"></p><div class="mctk-acts" style="justify-content:flex-end;margin-top:6px"><button class="btn ghost small" type="button" data-cerrar2>Volver</button><button class="btn small mctk-cancel" type="button" id="mctk-cok">Cancelar ticket</button></div></div>';
    document.body.appendChild(box);
    var cerrar = function () { box.remove(); };
    box.querySelector("[data-cerrar]").onclick = cerrar; box.querySelector("[data-cerrar2]").onclick = cerrar;
    box.onclick = function (ev) { if (ev.target === box) cerrar(); };
    box.querySelector("#mctk-cok").onclick = async function () {
      var m = box.querySelector("#mctk-cm").value.trim(), err = box.querySelector("#mctk-cerr");
      if (m.length < 3) { err.textContent = "Escribe el motivo"; return; }
      this.disabled = true; this.textContent = "Cancelando…";
      try {
        var r = await api("tk_cancelar", { clave: d.clave, motivo: m });
        if (!r || r.error) throw new Error((r && r.error) || "No se pudo cancelar");
        box.remove();
        if (window.toast) toast("Ticket cancelado" + (r.unidades ? " · " + r.unidades + " u. devueltas a bodega" : "") + (r.paquetes && r.paquetes.length ? " · paquete dado de baja" : ""), "var(--green)");
        var nd = await api("tk_get", { clave: d.clave }); if (nd && nd.ok) { cargarEstado(nd); repintar(document.getElementById("main")); }
      } catch (x) { err.textContent = x.message || String(x); this.disabled = false; this.textContent = "Cancelar ticket"; }
    };
  }
  function dlgExcluir() {
    var d = K.d, t = d.ticket, box = document.createElement("div"); box.className = "mctk-dlg mctk-xdlg";
    box.innerHTML = '<div class="mctk-box"><div class="mctk-xh"><h3>Excluir comisión</h3><button type="button" class="mctk-xx" data-cerrar title="Cerrar">×</button></div>' +
      '<p class="mccf-sub">Marca las líneas que no pagan comisión, o toda la comisión de la cosmetóloga. Queda en el historial.</p>' +
      '<label class="mctk-xtog"><input type="checkbox" id="mctk-xall"' + (K.exclC ? " checked" : "") + '><span>Excluir toda la comisión de <b>' + e(t.cosmetologa || "la cosmetóloga") + "</b> en este ticket</span></label>" +
      '<table class="mctk-xt"><thead><tr><th>Producto / servicio</th><th class="num">Subtotal</th><th class="c">Excluir</th></tr></thead><tbody>' +
      K.L.map(function (l, i) { return '<tr><td><div class="mctk-pn">' + e(l.nombre) + '</div><div class="mctk-sku">' + e(codigoVisible(l)) + " · " + e(TIPO[l.tipo] || l.tipo) + " ×" + e(q2(l.cantidad)) + '</div></td><td class="num">' + $m(l.total_linea != null ? l.total_linea : l.precio_unit * l.cantidad) + '</td><td class="c"><input type="checkbox" data-x="' + i + '"' + (l.excluir_comision ? " checked" : "") + "></td></tr>"; }).join("") +
      '</tbody></table><label class="mctk-xlbl">Motivo<input type="text" id="mctk-xn" value="' + e(K.exclN) + '" placeholder="Ej. producto de cortesía, ticket de prueba"></label>' +
      '<p class="err" id="mctk-xerr"></p><div class="mctk-acts" style="justify-content:flex-end;margin-top:6px"><button class="btn small" type="button" id="mctk-xok">' + (d.puedeEditar ? "Guardar" : "Aplicar") + "</button></div></div>";
    document.body.appendChild(box);
    var cerrar = function () { box.remove(); };
    box.querySelector("[data-cerrar]").onclick = cerrar;
    box.onclick = function (ev) { if (ev.target === box) cerrar(); };
    var tog = function () { var all = box.querySelector("#mctk-xall").checked; box.querySelectorAll("[data-x]").forEach(function (c) { c.disabled = all; }); };
    box.querySelector("#mctk-xall").onchange = tog; tog();
    box.querySelector("#mctk-xok").onclick = function () {
      var all = box.querySelector("#mctk-xall").checked, nota = box.querySelector("#mctk-xn").value.trim();
      var marcadas = [].slice.call(box.querySelectorAll("[data-x]")).filter(function (c) { return c.checked; }).length;
      if ((all || marcadas) && nota.length < 3) { box.querySelector("#mctk-xerr").textContent = "Escribe el motivo"; return; }
      K.exclC = all; K.exclN = nota;
      box.querySelectorAll("[data-x]").forEach(function (c) { K.L[+c.getAttribute("data-x")].excluir_comision = c.checked; });
      box.remove(); marcar(); pintarLin();
      var g = document.getElementById("mctk-guardar");
      if (K.d.puedeEditar && g) g.click(); else document.getElementById("mctk-err").textContent = "Comisión: envía la solicitud para aplicarla.";
    };
  }

  // ---------- guardar / pedir ----------
  function propuesta() {
    var dat = K.datos && Object.keys(K.datos).length ? { datos: K.datos } : {};
    if (!K.dirtyL) return dat;
    return Object.assign(dat, { lineas: K.L.map(function (l) { return { tipo: l.tipo, sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, precio_unit: l.precio_unit, descuento_tipo: l.descuento_tipo || "", descuento_valor: l.descuento_valor || 0, excluir_comision: !!l.excluir_comision, estimado: !!l.estimado }; }),
      descuento: { tipo: K.desc.tipo || "", valor: Number(K.desc.valor) || 0 }, promo: K.promo || "", excluir_cosmetologa: K.exclC, excluir_nota: K.exclN });
  }
  function cargarEstado(d) {
    K.d = d; K.dirty = false; K.dirtyL = false; K.datos = {};
    K.L = (d.lineas || []).map(function (l) { return { tipo: l.tipo, sku: l.sku, nombre: l.nombre, cantidad: Number(l.cantidad), precio_unit: Number(l.precio_unit), descuento_tipo: l.descuento_tipo || null, descuento_valor: Number(l.descuento_valor) || 0, excluir_comision: !!l.excluir_comision, estimado: !!l.estimado, canje: !!l.canje, cortesia: !!l.cortesia, total_linea: Number(l.total_linea) || 0 }; });
    K.desc = { tipo: (d.descuento && d.descuento.tipo) || null, valor: (d.descuento && d.descuento.valor) || 0 };
    K.promo = d.promo || ""; K.exclC = !!d.excluirCosmetologa; K.exclN = d.excluirNota || "";
  }
  async function render(clave) {
    css();
    K.d = null;
    var r;
    try { r = await Promise.all([api("tk_get", { clave: clave }), K.cat ? Promise.resolve(null) : api("tk_catalogo", {}).catch(function () { return null; })]); }
    catch (x) { r = [{ error: (x && x.message) || String(x) }, null]; }
    var d = r[0];
    if (!d || d.error) return '<p class="err">' + e((d && d.error) || "No se pudo cargar") + '</p><button class="btn ghost small" type="button" data-go="#/m/tickets">← Volver a la lista</button>';
    if (r[1] && r[1].items) K.cat = r[1].items;
    cargarEstado(d);
    return html();
  }
  function repintar(main) { var root = main.querySelector("#mctk-root"); if (root) { root.outerHTML = html(); wire(main); } }
  function marcar(soloDatos) { K.dirty = true; if (!soloDatos) K.dirtyL = true; var s = document.getElementById("mctk-save"); if (s) s.hidden = false; }
  function pintarTot() { var t = document.getElementById("mctk-tot"); if (t) t.innerHTML = totHtml(); wireCostos(); }
  function pintarLin() { var b = document.getElementById("mctk-lin"); if (b) b.innerHTML = lineasHtml(); pintarTot(); }
  function wireCostos() { var a = document.getElementById("mctk-costos"); if (a) a.onclick = function (ev) { ev.preventDefault(); dlgCostos(); }; }
  function telWa() {
    var t = String(val("telefono") || "").replace(/\D/g, "");
    if (t.length === 10 && t.charAt(0) === "0") t = "593" + t.slice(1);
    if (t.length === 9) t = "593" + t;
    return t;
  }
  async function cardDelTicket() {
    var t = K.d.ticket, busca = function () { return (window._histData || []).find(function (x) { return String(x.tkRow) === String(t.sheetRow); }); };
    var h = busca();
    if (!h && t.sheetRow) {
      // Solo este ticket (antes bajaba todo el historial).
      try { var r = await api("tk_historial", { rows: [t.sheetRow], limit: 1 }); h = (r && r.items && r.items[0]) || null; } catch (x) {}
    }
    if (h) (window._tkCards = window._tkCards || {})[t.sheetRow] = h;
    return h || null;
  }
  function pdfTarjeta() { return new Promise(function (res) { if (typeof tarjetaTicket !== "function") return res(null); tarjetaTicket(K.d.ticket.sheetRow, function (doc, nom) { res({ doc: doc, nom: nom }); }); }); }
  /** Paquete de ESTE ticket: el que tiene una sesión con la fecha del ticket (o el código del ticket); si no, el vigente. */
  function paqueteDelTicket(items, ced) {
    var tk = K.d.ticket || {}, f = String(tk.fecha || tk.timestamp || "").slice(0, 10), P3 = window._P3S || [];
    var dmy = /^\d{4}-\d{2}-\d{2}$/.test(f) ? f.slice(8, 10) + "/" + f.slice(5, 7) + "/" + f.slice(2, 4) : "";
    var claveTk = String(K.d.clave || ""), mejor = null, vig = null;
    (items || []).forEach(function (p) {
      if (String(p.cedula || "").split(".")[0] !== ced) return;
      var esP3 = P3.some(function (s) { return String(p.sku || "").indexOf(s) >= 0; }), total = Number(p.total) || (esP3 ? 3 : 6);
      var usos = (p.usos || []).slice(0, total), usado = function (u) { return !!(u && (u.usado || u.u || u.fecha || u.f)); };
      var us = usos.filter(usado).length, ses = -1;
      usos.forEach(function (u, i) { var tx = String((u && (u.fecha || u.f)) || ""); if (ses < 0 && ((dmy && tx.indexOf(dmy) === 0) || (claveTk && tx.indexOf(claveTk) >= 0))) ses = i + 1; });
      var it = { p: Object.assign({}, p, { usos: usos.map(function (u) { return Object.assign({ u: usado(u), f: (u && (u.fecha || u.f)) || "" }, u); }) }), total: total, usados: Math.min(us, total), pend: Math.max(0, total - us), sesion: ses > 0 ? ses : null, codigo: p.codigo || "" };
      // Sesión de este ticket: el reporte muestra lo usado HASTA esta sesión y lo que queda después de ella.
      if (it.sesion) { it.usados = it.sesion; it.pend = Math.max(0, total - it.sesion); if (!mejor) mejor = it; }
      else if (!vig || it.pend > 0) vig = it;
    });
    return mejor || vig;
  }
  async function pdfPaquete() {
    var ced = String(val("cedula") || "").split(".")[0], key = "t" + K.d.clave, x = (window._tarjPaqRef || {})[key];
    if (!x && ced) {
      try { var j = await api("getSeguimientoPaquetes", { cedulas: [ced] }); x = paqueteDelTicket(j && j.items, ced); } catch (e2) {}
      if (x) (window._tarjPaqRef = window._tarjPaqRef || {})[key] = x;
    }
    if (!x || typeof _pdfTarjetaPaquete !== "function") return { x: null };
    return await new Promise(function (res) {
      var img = new Image(); img.crossOrigin = "anonymous";
      var fin = function (im) { _pdfTarjetaPaquete(x, im, function (doc, nom) { res({ x: x, doc: doc, nom: nom }); }); };
      img.onload = function () { fin(img); }; img.onerror = function () { fin(null); };
      img.src = typeof GCD_PAG3_URL !== "undefined" ? GCD_PAG3_URL : "giftcard_pag3_fondo.jpg";
    });
  }
  function msgT(clave, vars) { try { return typeof _msg === "function" ? _msg(clave, vars || {}) : ""; } catch (e3) { return ""; } }
  function abrirWa(tel, txt) {
    var enc = encodeURIComponent(txt || ""), u = typeof _waURL === "function" ? _waURL(tel, enc) : "https://wa.me/" + tel + "?text=" + enc;
    var w = window.open(u, "_blank"); if (!w) location.href = u;
  }
  function entregarPdfs(docs) {
    docs = docs.filter(function (x) { return x && x.doc; }); if (!docs.length) return;
    var files = []; docs.forEach(function (x) { try { files.push(new File([x.doc.output("blob")], x.nom, { type: "application/pdf" })); } catch (e4) {} });
    var movil = typeof _esMovil_ === "function" && _esMovil_();
    if (movil && navigator.canShare && files.length && navigator.canShare({ files: files })) {
      var box = document.createElement("div"); box.className = "mctk-dlg";
      box.innerHTML = '<div class="mctk-box"><h3 style="margin:0 0 6px">Adjuntar el PDF</h3><p class="mccf-sub">Ya se abrió el chat. Toca para compartir ' + (files.length > 1 ? "los PDFs" : "el PDF") + ' en WhatsApp.</p><div class="mctk-acts" style="justify-content:flex-end"><button class="btn ghost small" type="button" data-x>Cerrar</button><button class="btn small" type="button" data-s>📎 Compartir</button></div></div>';
      document.body.appendChild(box);
      box.querySelector("[data-x]").onclick = function () { box.remove(); };
      box.querySelector("[data-s]").onclick = function () { navigator.share({ files: files }).catch(function () {}); box.remove(); };
    } else docs.forEach(function (x, i) { setTimeout(function () { try { x.doc.save(x.nom); } catch (e5) {} }, i * 700); });
  }
  async function enviarReporte(tipo) {
    var tel = telWa();
    if (!tel) { tel = (prompt("No hay teléfono en la ficha. Escribe el celular de la clienta:") || "").replace(/\D/g, ""); if (tel.length === 10 && tel.charAt(0) === "0") tel = "593" + tel.slice(1); if (!tel) return; }
    var nombre = String(val("nombre") || "").split(" ")[0];
    if (tipo === "chat") { abrirWa(tel, msgT("MENSAJE TARJETA SALUDO", { nombre: nombre })); return; }
    var docs = [], txt = msgT("MENSAJE TARJETA SALUDO", { nombre: nombre });
    if (tipo === "facial") {
      if (!(await cardDelTicket())) { toast2("No encontré la tarjeta de este ticket", true); return; }
      txt += "\n\n" + msgT("MENSAJE TARJETA TRATAMIENTO", {});
    }
    abrirWa(tel, txt);
    toast2("⏳ Preparando el PDF…");
    if (tipo === "facial") docs.push(await pdfTarjeta());
    var pq = await pdfPaquete();
    if (pq.x && (tipo === "paquete" || confirm("Paquete " + (pq.x.codigo ? pq.x.codigo + " " : "") + "(" + (pq.x.sesion ? "sesión " + pq.x.sesion + " de " + pq.x.total + " en este ticket, quedan " + pq.x.pend : pq.x.usados + "/" + pq.x.total) + "). ¿Adjuntar también el control de paquete?"))) docs.push(pq);
    if (tipo === "paquete" && !pq.x) { toast2("No encontré el paquete de la clienta", true); return; }
    entregarPdfs(docs);
    var r = await api("tk_envio", { clave: K.d.clave, tipo: tipo === "paquete" || docs.length > 1 ? "paquete" : "facial", telefono: tel });
    if (r && r.ok) { var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok) { var keep = K.dirty ? null : d; if (keep) { cargarEstado(keep); repintar(document.getElementById("main")); } } toast2("Reporte registrado como enviado"); }
  }
  function abrirGiftCard(cod) {
    var g = (K.d.giftcards || []).find(function (x) { return x.codigo === cod; }) || { codigo: cod };
    if (typeof renderGiftCardDigital !== "function") { toast2("No está disponible el generador de gift cards", true); return; }
    var main = document.getElementById("main"), volver = location.hash;
    main.innerHTML = '<div style="padding:12px 16px 0;display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost small" type="button" id="mctk-gcv">← Volver al ticket</button><button class="btn small" type="button" id="mctk-gcd">⬇️ Descargar PDF ' + e(cod) + '</button></div><div id="content"></div>';
    try { if (typeof cuSunsu === "function") CU = cuSunsu(); } catch (e6) {}
    renderGiftCardDigital({ codigo: g.codigo, para: g.para, de: g.de || g.comprador, facial: g.facial || undefined, mensaje: g.mensaje, valido: g.valido || undefined });
    main.querySelector("#mctk-gcv").onclick = function () { if (typeof draw === "function") draw(); else go(volver); };
    main.querySelector("#mctk-gcd").onclick = function () {
      if (typeof _gcdPDF !== "function") return;
      _gcdPDF(function (blob, nom) { if (!blob) { toast2("No se pudo generar el PDF", true); return; } var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nom; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); });
    };
  }
  async function dlgCostos() {
    var box = document.createElement("div"); box.className = "mctk-dlg"; box.innerHTML = '<div class="mctk-box"><p class="mccf-sub">Calculando…</p></div>'; document.body.appendChild(box);
    var r = await api("tk_costos", { clave: K.d.clave });
    if (!r || r.error) { box.innerHTML = '<div class="mctk-box"><p class="err">' + e((r && r.error) || "No se pudo") + '</p><button class="btn ghost small" type="button" data-x>Cerrar</button></div>'; box.querySelector("[data-x]").onclick = function () { box.remove(); }; return; }
    var c = r.costos, pintar = function () {
      var nc = c.costos_no_cliente_tipo === "%" ? r2(c.subtotal * (Number(c.costos_no_cliente_valor) || 0) / 100) : r2(Number(c.costos_no_cliente_valor) || 0);
      var gan = r2(c.subtotal - nc - c.cogs), mg = c.subtotal > 0 ? Math.round(gan / c.subtotal * 1000) / 10 : null;
      box.innerHTML = '<div class="mctk-box mctk-cost"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">Detalle de costos · ' + e(c.numero || "") + '</h3><button class="mctk-x" type="button" data-x>×</button></div>' +
        '<dl class="mctk-cd"><dt>Subtotal (sin IVA)</dt><dd>' + $m(c.subtotal) + "</dd>" +
        '<dt>Costos no relacionados al cliente</dt><dd><select id="mctk-nct">' + opt("$", "$", c.costos_no_cliente_tipo) + opt("%", "%", c.costos_no_cliente_tipo) + '</select> <input id="mctk-ncv" type="number" min="0" step="any" value="' + e(c.costos_no_cliente_valor || "") + '" style="width:80px"> <span class="mccf-sub">= ' + $m(nc) + "</span></dd>" +
        "<dt>Costo estimado de lo vendido</dt><dd>" + $m(c.cogs) + '<div class="mccf-sub">' + e(c.cogs_nota) + "</div></dd>" +
        "<dt>Ganancia estimada</dt><dd><b>" + $m(gan) + "</b></dd>" +
        "<dt>Margen</dt><dd><b" + (mg != null && mg < 25 ? ' style="color:#C0392B"' : ' style="color:#2E8B57"') + ">" + (mg == null ? "—" : mg + "%") + "</b></dd></dl>" +
        '<b style="font-size:.82rem">Costo por línea</b><table class="mccf-t mctk-t" style="margin-top:4px"><thead><tr><th>Producto</th><th class="num">Cant</th><th class="num">Costo unit.</th><th class="num">Costo total</th></tr></thead><tbody>' +
        c.lineas.map(function (l) { return "<tr><td>" + e(l.descripcion) + '<div class="mctk-sku">' + e(l.sku) + '</div></td><td class="num">' + e(q2(l.cantidad)) + '</td><td class="num">' + $m(l.costo_unit) + '</td><td class="num">' + $m(l.costo_total) + "</td></tr>"; }).join("") + "</tbody></table>" +
        '<p class="err" id="mctk-cerr"></p><div class="mctk-acts" style="justify-content:flex-end;margin-top:8px"><button class="btn ghost small" type="button" data-x>Cerrar</button><button class="btn small" type="button" id="mctk-cok">Guardar costos no relacionados</button></div></div>';
      box.querySelectorAll("[data-x]").forEach(function (b) { b.onclick = function () { box.remove(); }; });
      box.querySelector("#mctk-nct").onchange = function () { c.costos_no_cliente_tipo = this.value; pintar(); };
      box.querySelector("#mctk-ncv").onchange = function () { c.costos_no_cliente_valor = Number(this.value) || 0; pintar(); };
      box.querySelector("#mctk-cok").onclick = async function () {
        var g = await api("tk_costos_guardar", { clave: K.d.clave, tipo: c.costos_no_cliente_tipo, valor: Number(c.costos_no_cliente_valor) || 0 });
        if (!g || g.error) { box.querySelector("#mctk-cerr").textContent = (g && g.error) || "No se pudo guardar"; return; }
        toast2("Costos guardados"); box.remove();
      };
    };
    pintar();
  }
  function editarCampo(main, k) {
    var dd = main.querySelector('[data-k="' + k + '"]'); if (!dd) return;
    var lbl = ((K.d.campos || []).find(function (c) { return c[0] === k; }) || [k, k])[1], v = val(k), largo = k === "notas" || k === "recomendaciones";
    var tipo = k === "retorno" ? "date" : k === "email" ? "email" : "text";
    if (dd.querySelector(".mctk-in")) return;
    dd.innerHTML = largo ? '<textarea rows="3" class="mctk-in">' + e(v) + "</textarea>" : '<input class="mctk-in" type="' + tipo + '" value="' + e(v) + '"' + (k === "factura" ? ' placeholder="001-001-000000000"' : "") + ">";
    var inp = dd.querySelector(".mctk-in"), hecho = false; inp.focus();
    var ok = function () {
      if (hecho) return; hecho = true;
      var nv = inp.value.trim();
      if (nv === v) { repintar(main); return; }
      if (k === "factura" && nv && !/^\d{3}-\d{3}-\d{1,9}$/.test(nv) && !/^\d{1,9}$/.test(nv)) { hecho = false; toast2("Factura: usa 001-001-000000000", true); return; }
      K.datos = K.datos || {}; K.datos[k] = k === "factura" && /^\d{1,9}$/.test(nv) ? "001-001-" + ("000000000" + nv).slice(-9) : nv;
      var dirty = K.dirty, dl = K.dirtyL; repintar(main); K.dirty = dirty; K.dirtyL = dl; marcar(true);
      // Admin: cada dato se guarda al momento (antes quedaba resaltado y se perdía si no tocaba «Guardar» o recargaba).
      if (K.d.puedeEditar) guardarDato(main, k, lbl);
    };
    inp.onblur = ok;
    inp.onkeydown = function (ev) { if (ev.key === "Enter" && !largo) { ev.preventDefault(); ok(); } if (ev.key === "Escape") { hecho = true; repintar(main); } };
  }
  async function guardarDato(main, k, lbl) {
    var v0 = K.datos[k], one = {}; one[k] = v0;
    var r; try { r = await api("tk_guardar", { clave: K.d.clave, datos: one }); } catch (x) { r = { error: (x && x.message) || String(x) }; }
    if (!r || r.error) { toast2("No se guardó " + lbl + ": " + ((r && r.error) || "sin respuesta"), true); return; }
    if (K.datos[k] === v0) delete K.datos[k];
    K.d.info = K.d.info || {}; K.d.info[k] = v0; K.d.corregidos = (K.d.corregidos || []).concat([k]);
    if (!Object.keys(K.datos).length && !K.dirtyL) K.dirty = false;
    var dirty = K.dirty, dl = K.dirtyL; repintar(main); K.dirty = dirty; K.dirtyL = dl;
    if (K.dirty) marcar(true);
    toast2("✓ " + lbl + " guardado" + (r.ficha && r.ficha.ok && (r.ficha.cambios || []).length ? " (también en la ficha de la clienta)" : ""));
  }
  if (!window._mctkUnload) { window._mctkUnload = true; window.addEventListener("beforeunload", function (ev) { if (K.dirty && document.getElementById("mctk-root")) { ev.preventDefault(); ev.returnValue = ""; } }); }
  function wire(main) {
    // Si el ticket no cargó (error) no hay nada que conectar: antes reventaba con «null is not an object».
    if (!K.d || !main || !main.querySelector("#mctk-root")) return;
    try { wire2(main); } catch (x) { try { console.error(x); } catch (y) {} var er = main.querySelector("#mctk-err"); if (er) er.textContent = "Error en la pantalla: " + ((x && x.message) || x); }
  }
  function on(main, sel, ev, fn) { var el = main.querySelector(sel); if (el) el[ev] = fn; return el; }
  function wire2(main) {
    main.querySelector("#mctk-volver").onclick = function () { if (K.dirty && !confirm("Hay cambios sin guardar. ¿Salir igual?")) return; var vv = sessionStorage.getItem("mctk.volver"); sessionStorage.removeItem("mctk.volver"); go(vv || "#/m/tickets"); };
    main.querySelectorAll("[data-menu]").forEach(function (b) {
      b.onclick = function (ev) { ev.stopPropagation(); var id = b.getAttribute("data-menu"); main.querySelectorAll(".mctk-dd").forEach(function (x) { if (x.id !== id) x.hidden = true; }); var dd = main.querySelector("#" + id); dd.hidden = !dd.hidden; };
    });
    if (!K.ddWired) { K.ddWired = true; document.addEventListener("click", function (ev) { if (!ev.target.closest(".mctk-menu")) document.querySelectorAll(".mctk-dd").forEach(function (x) { x.hidden = true; }); }); }
    main.querySelector("#mctk-dd").onclick = async function (ev) {
      var pv = ev.target.closest("[data-pv]");
      if (pv && window.MCPrevia) { this.hidden = true; window.MCPrevia.abrir(pv.getAttribute("data-pv"), pv.getAttribute("data-pvn")); return; }
      var b = ev.target.closest("[data-doc]"); if (!b) return;
      this.hidden = true;
      if (b.getAttribute("data-doc") === "tarjeta" && window.MCPrevia) { var hh = await cardDelTicket(); if (!hh) { toast2("No encontré la tarjeta de este ticket", true); return; } window.MCPrevia.tarjeta(K.d.ticket.sheetRow, "Tarjeta del tratamiento"); return; }
      if (b.getAttribute("data-doc") === "paquete" && window.MCPrevia && window.MCPrevia.pdf) { window.MCPrevia.pdf("Reporte del paquete", function () { return pdfPaquete().then(function (x) { if (!x.x) throw new Error("No encontré el paquete de este ticket"); return x; }); }); return; }
      if (b.getAttribute("data-doc") === "gc") { if (K.dirty && !confirm("Hay cambios sin guardar. ¿Salir igual?")) return; abrirGiftCard(b.getAttribute("data-cod")); return; }
      var h = await cardDelTicket();
      if (!h || typeof tarjetaTicket !== "function") { toast2("No encontré la tarjeta de este ticket", true); return; }
      tarjetaTicket(K.d.ticket.sheetRow);
    };
    main.querySelector("#mctk-wa").onclick = function (ev) { var b = ev.target.closest("[data-wa]"); if (!b) return; this.hidden = true; enviarReporte(b.getAttribute("data-wa")); };
    main.querySelector("#mctk-print").onclick = function () { document.body.classList.add("mctk-printing"); window.print(); setTimeout(function () { document.body.classList.remove("mctk-printing"); }, 500); };
    main.querySelector("#mctk-excl").onclick = dlgExcluir;
    if (main.querySelector("#mctk-cancelar")) main.querySelector("#mctk-cancelar").onclick = dlgCancelar;
    if (main.querySelector("#mctk-multa")) main.querySelector("#mctk-multa").onclick = function () {
      var t = K.d.ticket, inf = K.d.info || {};
      window.MCMultas.aplicarDesdeTicket({ id: t.id, so: t.soNum || t.betaNum, cosmetologa: t.cosmetologa, fecha: t.fecha || inf.fecha, cliente: ((t.nombre || "") + " " + (t.apellido || "")).trim() }).catch(function (x) { toast2((x && x.message) || String(x), true); });
    };
    main.querySelectorAll("[data-ed]").forEach(function (b) { b.onclick = function () { editarCampo(main, b.getAttribute("data-ed")); }; b.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); editarCampo(main, b.getAttribute("data-ed")); } }; });
    var sub = main.querySelector("#mctk-subir");
    if (sub) sub.onchange = async function () {
      var f = sub.files && sub.files[0]; if (!f) return;
      toast2("⏳ Subiendo comprobante…");
      try {
        var data = await comprimir(f);
        var r = await api("tk_subir_doc", { clave: K.d.clave, imagen: data });
        if (!r || r.error) { toast2((r && r.error) || "No se pudo subir", true); return; }
        toast2("✓ Comprobante subido");
        var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok && !K.dirty) { cargarEstado(d); repintar(main); }
      } catch (x) { toast2((x && x.message) || "No se pudo subir", true); }
    };
    var fi = main.querySelector("#mctk-ficha"); if (fi) fi.onclick = function (ev) { ev.preventDefault(); go("#/m/clientes/c/" + encodeURIComponent(K.d.clienteKey)); };
    main.querySelectorAll("[data-flag]").forEach(function (b) {
      b.onclick = async function () {
        var nota = prompt("¿Cómo se resolvió? (opcional)"); if (nota === null) return;
        var r = await api("tk_flag_resolver", { id: b.getAttribute("data-flag"), nota: nota });
        if (!r || r.error) { toast2((r && r.error) || "No se pudo", true); return; }
        toast2("Marcado como resuelto"); var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok) { cargarEstado(d); repintar(main); }
      };
    });
    var lin = main.querySelector("#mctk-lin");
    lin.addEventListener("input", function (ev) {
      var tr = ev.target.closest("tr[data-i]"), f = ev.target.getAttribute("data-f"); if (!tr || !f) return;
      var l = K.L[+tr.getAttribute("data-i")];
      if (f === "desc") { var x = descParse(ev.target.value); ev.target.classList.toggle("bad", !x); if (!x) return; l.descuento_tipo = x.tipo; l.descuento_valor = x.valor; }
      else l[f] = Number(ev.target.value) || 0;
      if (f === "precio_unit") l.estimado = false;
      calc(); tr.querySelector("[data-tl]").textContent = $m(l.total_linea); pintarTot(); marcar();
    });
    lin.addEventListener("click", function (ev) { var b = ev.target.closest("[data-del]"); if (!b) return; K.L.splice(+b.getAttribute("data-del"), 1); marcar(); pintarLin(); });
    main.querySelector("#mctk-addlink").onclick = function (ev) { ev.preventDefault(); var bx = main.querySelector("#mctk-addbox"); bx.hidden = !bx.hidden; if (!bx.hidden) main.querySelector("#mctk-q").focus(); };
    main.querySelector("#mctk-promo").onchange = function () { K.promo = this.value; marcar(); pintarTot(); };
    main.querySelector("#mctk-dv").oninput = function () { var x = descParse(this.value); this.classList.toggle("bad", !x); if (!x) return; K.desc.tipo = x.tipo; K.desc.valor = x.valor; marcar(); pintarTot(); };
    wireCostos();
    // 💵 Pagos de la beta (TK19): lista, registrar y anular; el efectivo entra solo a la caja chica.
    var hp = main.querySelector("#mctk-pagos");
    if (hp && window.MCPagos && K.d && K.d.clave) window.MCPagos.montar(hp, K.d.clave, function () { return calc().total; }, function (pagadoBeta) { K.pagoBeta = pagadoBeta; pintarTot(); });
    wireBuscar(main);
    var err = main.querySelector("#mctk-err");
    var g = main.querySelector("#mctk-guardar");
    if (g) g.onclick = async function () {
      err.textContent = ""; g.disabled = true;
      var r = await api("tk_guardar", Object.assign({ clave: K.d.clave }, propuesta()));
      g.disabled = false;
      if (!r || r.error) { err.textContent = (r && r.error) || "No se pudo guardar"; toast2("No se guardó: " + err.textContent, true); return; }
      toast2("✓ Ticket guardado" + (r.total != null ? " · total " + $m(r.total) : ""));
      var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok) { cargarEstado(d); repintar(main); }
    };
    var pd = main.querySelector("#mctk-pedir");
    if (pd) pd.onclick = async function () {
      var mot = prompt("¿Por qué se cambia el ticket? (lo aprueba un admin)"); if (!mot || !mot.trim()) return;
      var r = await api("solicitud_crear", { tabla: "ticket_detalle", fila: K.d.clave, tipo: "cambio", motivo: mot.trim(), propuestos: propuesta() });
      if (!r || r.error) { err.textContent = (r && r.error) || "No se pudo enviar"; return; }
      toast2("Solicitud enviada: un admin la revisa");
      var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok) { cargarEstado(d); repintar(main); }
    };
    main.querySelector("#mctk-descartar").onclick = async function () { var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok) { cargarEstado(d); repintar(main); } };
  }

  // Lector en la pantalla «Nuevo ticket» (la de siempre): un escaneo suma +1 al producto de la lista.
  function escanerCrear() {
    if (K.crearWired) return; K.crearWired = true;
    var buf = "", last = 0;
    document.addEventListener("keydown", function (ev) {
      if (document.getElementById("mctk-q") || !document.querySelector('[id^="q-SUNSU-"]') || typeof window.chgQ !== "function") return;
      var tg = ev.target; if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable)) return;
      var now = Date.now(); if (now - last > 60) buf = ""; last = now;
      if (ev.key === "Enter" && buf.length >= 6) { var code = buf; buf = ""; ev.preventDefault(); escaneoCrear(code); return; }
      if (ev.key && ev.key.length === 1) buf += ev.key;
    });
  }
  async function escaneoCrear(code) {
    try { if (!K.cat) { var r = await api("tk_catalogo", {}); K.cat = (r && r.items) || []; } } catch (x) { toast2("No se pudo leer el catálogo: " + ((x && x.message) || x), true); return; }
    var p = porBarras(code);
    if (!p) { beep(false); toast2("Código " + norm(code) + " no encontrado", true); return; }
    if (p.activo === false) { beep(false); toast2("«" + p.nombre + "» está inactivo: no se puede vender", true); return; }
    var hit = null;
    (window.PROVS || []).some(function (pv) { return (pv.prods || []).some(function (x) { if (x.sku === p.skuVisible || x.sku === "SUNSU-" + p.sku) { hit = { sku: x.sku, pv: pv.id }; return true; } return false; }); });
    if (!hit) { beep(false); toast2("«" + p.nombre + "» no está en la lista de productos de esta pantalla", true); return; }
    window.chgQ(hit.sku, 1, hit.pv); beep(true);
    var row = document.getElementById("pr-" + hit.sku);
    if (row) { row.classList.remove("mctk-flash"); void row.offsetWidth; row.classList.add("mctk-flash"); try { row.scrollIntoView({ block: "nearest" }); } catch (x) {} }
    toast2("✓ " + p.nombre + " +1");
  }
  try { css(); } catch (x) {} escanerCrear();
  window.MCTickets = {
    render: function (route) { return render(String(route.id)); },
    wire: wire,
    claveDe: function (t) { return (t && t.so_num) || (t && t.tkRow ? "r" + t.tkRow : ""); },
    _k: K, _calc: calc,
  };
})();
