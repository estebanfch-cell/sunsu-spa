// Detalle de ticket estilo orden de venta de MineCore (beta, 0048). Lo abre la lista de tickets.
// Admin edita en línea y guarda; los demás arman el cambio y lo piden (Solicitudes). Lector de código de
// barras (USB/Bluetooth = teclado + Enter) en «Agregar producto».
(function () {
  var K = { d: null, cat: null, dirty: false, L: null, desc: null, promo: "", exclC: false, exclN: "" };
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v); }
  function r2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
  function $m(v) { return "$" + r2(v).toFixed(2); }
  // TK39 (Emilia 18/11): en pantalla los precios de línea van SIN IVA (como Migo); internamente se guardan con IVA
  // (como el PVP del catálogo y lo cobrado), así los totales viejos, comisiones y el cruce con Migo no cambian.
  var IVA = 1.15;
  function net(v) { return r2((Number(v) || 0) / IVA); }
  function q2(v) { return r2(v) + ""; }
  // TK81: redondeos de hasta $0.05 no dejan saldo.
  function saldoPend(tot, pag) { var x = r2(tot - pag); return x > 0.05 ? x : 0; }
  function opt(v, t, sel) { return '<option value="' + e(v) + '"' + (String(v) === String(sel == null ? "" : sel) ? " selected" : "") + ">" + e(t) + "</option>"; }
  function fecha(f, h) { return f ? f.split("-").reverse().join("/") + (h ? " " + h : "") : ""; }
  function fechaIso(v) { var d = new Date(v); if (isNaN(d)) return String(v || ""); var z = new Date(d.getTime() - 5 * 3600000).toISOString(); return z.slice(8, 10) + "/" + z.slice(5, 7) + "/" + z.slice(0, 4) + " " + z.slice(11, 16); }
  var TIPO = { producto: "Producto", facial: "Facial", extra: "Servicio", paquete: "Paquete", gift: "Gift card", servicio: "Servicio", diferencia_mejora: "Diferencia por mejora", diferencia: "Por revisar" };
  var NOMBRE_MEJORA = "Diferencia por mejora de paquete";
  // TK81/82: «Diferencia por mejora» solo si es una línea real con monto (nunca en el canje mismo).
  function esMejora(l) { return !!(l && !l.canje && Number(l.precio_unit) > 0 && (l.mejoraPaquete || l.tipo === "diferencia_mejora" || /diferencia por mejora/i.test(l.nombre || l.promo || ""))); }
  function hayMejoraDe(sku) { return (K.L || []).some(function (x) { return esMejora(x) && String(x.sku) === String(sku); }); }
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
      ".mctk-voucher{flex:0 0 auto;white-space:nowrap!important;cursor:pointer}.mctk-vthumbs{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 10px}.mctk2 .mctk-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.mctk-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}.mctk-num{margin:0;font-size:1.6rem;color:var(--navy-d);letter-spacing:.3px}.mctk-fac{color:var(--gray);font-size:.86rem;margin-top:2px}",
      ".mctk-pills{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:460px}.mctk-pill{display:inline-block;border:1.5px solid;border-radius:999px;padding:2px 10px;font-size:.7rem;font-weight:700;background:transparent;white-space:nowrap;line-height:1.5}",
      ".mctk-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 28px;margin-top:14px}@media(max-width:720px){.mctk-grid{grid-template-columns:1fr}}.mctk-grid dl,.mctk-grid1{margin:0}.mctk-f{display:grid;grid-template-columns:130px 1fr;gap:8px;padding:6px 0;border-bottom:1px solid var(--cream-d);font-size:.84rem}.mctk-f dt{color:var(--gray);font-size:.76rem}.mctk-f dd{margin:0;word-break:break-word}.mctk-f .v.mod{background:#fff3d6;border-radius:4px;padding:0 3px}",
      ".mctk-pen{border:none;background:none;color:var(--gray);cursor:pointer;font-size:.85rem;padding:0 3px}.mctk-pen:hover{color:var(--navy-d)}.mctk-in{padding:5px 7px;border:1.5px solid var(--cream-d);border-radius:7px;font:inherit;font-size:.82rem;width:min(100%,260px)}textarea.mctk-in{width:100%}",
      ".mctk-lt .mctk-c3m{display:none}.mctk-lt th small{font-weight:600;opacity:.75}.mctk-lt.mob-stack td.mctk-c3{display:none!important}.mctk-lt.mob-stack td.mctk-c3m{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:4px;padding:6px 8px!important;background:var(--cream,#faf6ef);border-radius:9px}.mctk-c3m span{display:flex;flex-direction:column;align-items:flex-end;min-width:0}.mctk-c3m small{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--gray)}.mctk-c3m b{font-size:.86rem;white-space:nowrap}" +
      ".mctk-lt td{padding:6px 8px;vertical-align:middle}.mctk-pn{font-weight:600}.mctk-sku{color:var(--gray);font-size:.68rem;margin-top:1px}.mctk-irp{display:inline-block;margin-left:4px;padding:0 6px;line-height:16px;border:1px solid #d9cfbd;border-radius:7px;font-size:.68rem;color:#8A6D1F;text-decoration:none;white-space:nowrap;vertical-align:baseline}.mctk-irp:active{background:#f4ecdc}.mctk-x{border:none;background:none;color:#b2452a;font-size:1.1rem;cursor:pointer}.mctk-link{display:inline-block;margin-top:8px;color:var(--pink-d,#b85c7a);font-size:.82rem;font-weight:700;text-decoration:none}.mctk-link:hover{text-decoration:underline}",
      ".mctk-foot{display:flex;gap:16px;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;margin-top:12px}.mctk-adj{display:flex;flex-direction:column;gap:6px;font-size:.78rem;color:var(--gray)}.mctk-adj select,.mctk-adj input{padding:4px 6px;border:1.5px solid var(--cream-d);border-radius:7px;font:inherit;font-size:.78rem}#mctk-tot{min-width:280px}",
      ".mctk-flag{background:#fdecea;border:1.5px solid #e6a39b;color:#7a2318;border-radius:12px;padding:10px 12px;margin-bottom:10px;font-size:.84rem;display:flex;flex-direction:column;gap:8px}",
      ".mctk-cost{width:min(620px,94vw)}.mctk-cd{display:grid;grid-template-columns:1fr auto;gap:8px 16px;font-size:.86rem;margin:12px 0}.mctk-cd dt{color:var(--gray)}.mctk-cd dd{margin:0;text-align:right}",
      "",
      ".mctk-cli{font-size:.9rem;font-weight:700;color:var(--navy-d);margin:-2px 0 2px}.mctk-cod{font-family:ui-monospace,monospace;color:var(--navy);text-decoration:none;border-bottom:1px dashed}",
      ".mctk-cancel{color:#C0392B!important;border-color:#E6B0AA!important}.btn.small.mctk-cancel:not(.ghost){background:#C0392B!important;color:#fff!important}.mctk-canc{background:#FDECEA;border:1px solid #E6B0AA;color:#922B21;border-radius:10px;padding:10px 12px;margin:8px 0;font-size:.85rem}" +
      ".mctk-xdlg .mctk-box{width:min(620px,94vw);max-height:88vh;overflow:auto}.mctk-xh{display:flex;justify-content:space-between;align-items:center}.mctk-xh h3{margin:0}.mctk-xx{background:none;border:0;font-size:1.6rem;line-height:1;cursor:pointer;color:var(--navy)}.mctk-xtog{display:flex!important;align-items:center;gap:10px;padding:10px 12px;margin:8px 0;background:var(--cream);border-radius:10px;font-size:.86rem;cursor:pointer}.mctk-xdlg input[type=checkbox]{width:18px!important;height:18px;margin:0;flex:none;accent-color:var(--navy)}.mctk-xt{width:100%;border-collapse:collapse;font-size:.84rem;margin:4px 0 10px}.mctk-xt th{font-size:.68rem;text-transform:uppercase;color:var(--gray);text-align:left;padding:6px 8px;border-bottom:1px solid var(--cream-d)}.mctk-xt td{padding:8px;border-bottom:1px solid #f0ece4;vertical-align:middle}.mctk-xt .num{text-align:right;white-space:nowrap}.mctk-xt .c{text-align:center;width:70px}.mctk-xlbl{display:block;font-size:.8rem;font-weight:700}.mctk-xlbl input{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit;font-weight:400}",
      // TK81 (Emilia pt523u): líneas en grilla fija — # · Producto (código debajo) · Cant · P. sin IVA · Desc · Subtotal · IVA · Total; texto plano, se edita con clic.
      ".mctk-lwrap{container-type:inline-size;container-name:mctkl}.mctk-ls{display:flex;flex-direction:column}" +
      ".mctk-ln{display:grid;grid-template-columns:22px minmax(0,1fr) auto;grid-template-areas:'i p x' '. n n';gap:4px 8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--cream-d)}.mctk-ln:last-child{border-bottom:0}" +
      ".mctk-li{grid-area:i;align-self:start;padding-top:2px;text-align:center;font-size:.74rem;font-weight:800;color:var(--gray);font-variant-numeric:tabular-nums}" +
      ".mctk-lp{grid-area:p;display:flex;gap:8px;align-items:center;min-width:0}.mctk-lpt{min-width:0;line-height:1.3;overflow-wrap:anywhere}.mctk-lpt .mctk-pn{display:block;font-weight:700;font-size:.86rem}.mctk-lpt .mctk-sku{display:block;margin:1px 0 0;font-size:.68rem;color:var(--gray);font-weight:500}.mctk-lpt .mctk-pill{font-size:.6rem;padding:0 7px;margin-left:4px;vertical-align:1px}.mctk-promo{font-size:.66rem;color:#8A6D1F;font-weight:700;margin-left:4px}.mctk-ln .mctk-ph{width:30px;height:30px}" +
      ".mctk-lx{grid-area:x;align-self:start;display:flex;gap:2px;align-items:center;justify-content:flex-end}.mctk-lx .mctk-x,.mctk-mej{border:none;background:none;color:var(--gray);cursor:pointer;font-size:.95rem;line-height:1;padding:2px 4px;border-radius:6px}.mctk-mej{font-size:.78rem;font-weight:800;white-space:nowrap}.mctk-lx .mctk-x:hover,.mctk-mej:hover{background:var(--cream);color:var(--navy-d)}" +
      ".mctk-nums{grid-area:n;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px 6px;min-width:0}.mctk-c{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center;min-width:0;font-size:.84rem;font-variant-numeric:tabular-nums;white-space:nowrap}.mctk-c small{font-size:.56rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--gray);line-height:1.2}.mctk-c b{font-weight:700}.mctk-c3{display:none}" +
      ".mctk-cv{display:block;min-height:1.35em;min-width:100%;padding:1px 2px;border-radius:5px;box-sizing:border-box}.mctk-c[data-le] .mctk-cv{cursor:text}.mctk-c[data-le]:hover .mctk-cv{background:var(--cream);outline:1px dashed var(--cream-d)}" +
      ".mctk-cin{width:100%;max-width:96px;box-sizing:border-box;border:0;border-bottom:1.5px solid var(--navy);background:transparent;font:inherit;font-size:.84rem;text-align:center;padding:1px 2px;outline:none;-moz-appearance:textfield;appearance:textfield}.mctk-cin::-webkit-outer-spin-button,.mctk-cin::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.mctk-cin.bad{border-bottom-color:#C0392B}.mctk-lh{display:none}" +
      "@container mctkl (min-width:480px){.mctk-nums{grid-template-columns:repeat(6,minmax(0,1fr))}.mctk-c3{display:flex}}" +
      "@container mctkl (min-width:700px){.mctk-ln,.mctk-lh{grid-template-columns:24px minmax(180px,1fr) 48px 80px 56px 76px 64px 80px 44px;grid-template-areas:'i p q u d s v t x';gap:0 4px;padding:7px 0}.mctk-lh{display:grid;align-items:end;font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--gray);padding:2px 0 5px;border-bottom:1px solid var(--cream-d)}.mctk-lh>span{text-align:center}.mctk-lh>span:nth-child(2){text-align:left}" +
      ".mctk-ln .mctk-nums{display:contents}.mctk-ln .mctk-c small{display:none}.mctk-li{align-self:center;padding:0}.mctk-lx{align-self:center}.mctk-c[data-c=q]{grid-area:q}.mctk-c[data-c=u]{grid-area:u}.mctk-c[data-c=d]{grid-area:d}.mctk-c[data-c=s]{grid-area:s}.mctk-c[data-c=v]{grid-area:v}.mctk-c[data-c=t]{grid-area:t}}",
      ".mctk-foot{display:flex;gap:10px 16px;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;margin-top:10px}.mctk-adj{display:flex;flex-direction:row;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:.76rem;color:var(--gray)}.mctk-adj label{display:flex;gap:6px;align-items:center;margin:0}#mctk-dv{width:96px}#mctk-promos{border-color:#C9A227;color:#7a5c12;background:#fbf4e4;padding:5px 10px}" +
      ".mctk-tot{gap:2px 14px!important;font-size:.84rem!important;max-width:300px!important;line-height:1.35}#mctk-tot{min-width:min(260px,100%)!important;flex:1 1 240px;display:flex;justify-content:flex-end;flex-direction:column;align-items:flex-end}#mctk-tot .mctk-tot{width:100%;margin-left:auto}",
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
  var CHIP = { abierto: "#3E7CB1", cerrado: "#56627A", porcobrar: "#C98A00", pagado: "#2E8B57", sinfactura: "#D2603A", facturado: "#2A8C8C", anulado: "#C0392B", ok: "#2E8B57", pend: "#8A93A6", info: "#7C6BB0", neutro: "#8A93A6" };
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
    // Siempre que el ticket tenga facial/servicio (o datos del tratamiento), aunque no tenga fila en la hoja ni tarjeta enviada.
    if (t.sheetRow || conTratamiento()) h += '<button type="button" data-doc="tarjeta">📄 Tarjeta del tratamiento (PDF)</button>';
    var pq0 = d.paquete || {}; if ((pq0.vigentes && pq0.vigentes.length) || pq0.uso) h += '<button type="button" data-doc="paquete">🎴 Reporte del paquete (PDF)</button>';
    (d.giftcards || []).filter(function (g) { return g.uso === "vendida"; }).forEach(function (g) { h += '<button type="button" data-doc="gc" data-cod="' + e(g.codigo) + '">🎁 Gift card ' + e(g.codigo) + " (PDF)</button>"; });
    (d.documentos || []).filter(function (x) { return x.tipo !== "foto"; }).forEach(function (x) { h += '<button type="button" data-pv="' + e(x.url) + '" data-pvn="' + e(x.nombre) + '">' + (x.tipo === "factura" ? "📄 " : x.tipo === "foto" ? "🖼️ " : "🧾 ") + e(x.nombre) + "</button>"; });
    return h || '<div class="mccf-sub" style="padding:8px">Sin documentos.</div>';
  }
  function descTxt(tp, v) { v = Number(v) || 0; if (!(v > 0) || !tp) return ""; return tp === "$" ? "$" + q2(net(v)) : q2(v) + "%"; }
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
  /** TK43 (Emilia t486u, como MineCore mcIrBtn): botoncito sutil ↗ que abre la ficha del producto de la línea. */
  function prodIdLinea(l) {
    var C = K.cat || [], c = C.find(function (p) { return p.tipo === l.tipo && p.sku === l.sku; }) || C.find(function (p) { return p.sku === l.sku; });
    return c && c.productoId ? String(c.productoId) : "";
  }
  function irProdBtn(l) {
    var id = prodIdLinea(l);
    return id ? ' <a href="#/m/productos/p/' + e(id) + '" class="mctk-irp" data-irp="' + e(id) + '" title="Ir al producto" aria-label="Ir a la ficha del producto">↗</a>' : "";
  }
  function codigoVisible(l) {
    var c = (K.cat || []).find(function (p) { return p.tipo === l.tipo && p.sku === l.sku; });
    if (c && c.skuVisible) return c.skuVisible;
    var s0 = String(l.sku || "");
    return (l.tipo === "facial" || l.tipo === "extra" || l.tipo === "servicio" || l.tipo === "paquete") && /^\d+$/.test(s0) ? "SUNSU-" + s0 : s0;
  }
  /** Por línea: subtotal sin IVA, IVA y total con IVA. */
  function montos(l) { var tot = r2(Number(l.total_linea) || 0), sub = net(tot); return { sub: sub, iva: r2(tot - sub), tot: tot }; }
  function etqLinea(l) { return l.consumoInterno && !(l.total_linea > 0) ? ' <span class="mctk-canje" style="color:#56627A">Consumo interno</span>' : l.cortesia && !(l.total_linea > 0) ? ' <span class="mctk-canje" style="color:#2E8B57">Cortesía</span>' : l.canje && !(l.total_linea > 0) ? ' <span class="mctk-canje">Canje</span>' : ""; }
  function pintarMontos(tr, l) {
    var m = montos(l), q = function (x) { return tr.querySelector(x); };
    if (q("[data-tl]")) q("[data-tl]").textContent = $m(m.sub);
    if (q("[data-iva]")) q("[data-iva]").textContent = $m(m.iva);
    if (q("[data-tot]")) q("[data-tot]").textContent = $m(m.tot);
    if (q("[data-mini]")) q("[data-mini]").textContent = "sub " + $m(m.sub) + " · IVA " + $m(m.iva);
  }
  function lineasHtml() {
    calc();
    if (!K.L.length) return '<div class="mccf-sub" style="padding:12px">Sin líneas.</div>';
    var ed = !!(K.d.puedeEditar || K.d.puedePedir);
    var hd = '<div class="mctk-lh"><span>#</span><span>Producto</span><span>Cant</span><span>P. sin IVA</span><span>Desc</span><span>Subtotal</span><span>IVA</span><span>Total</span><span></span></div>';
    // celda: data-le="campo" = editable con clic (admin edita, recepción solicita); vacío = en blanco
    function celda(c, lbl, html, le, extra) {
      return '<span class="mctk-c' + (extra || "") + '" data-c="' + c + '"' + (le && ed ? ' data-le="' + le + '" tabindex="0" title="Clic para editar"' : "") + "><small>" + lbl + '</small><span class="mctk-cv">' + html + "</span></span>";
    }
    return hd + K.L.map(function (l, i) {
      var fijo = (l.cortesia || l.canje || l.consumoInterno) && !(l.precio_unit > 0);
      // TK98: consumo interno y gift card de cortesía en $0 (la gift card muestra su valor nominal).
      var esGift = l.tipo === "gift" && !(l.cortesia || l.canje);
      var precio = l.consumoInterno && !(l.precio_unit > 0) ? '<span class="mctk-canje" style="color:#56627A" title="Producto sacado para uso interno (no se cobra ni se factura)">Consumo interno</span>' : l.cortesia && !(l.precio_unit > 0) ? '<span class="mctk-canje" style="color:#2E8B57" title="Cortesía (marcada al crear el ticket)">Cortesía</span>' : l.canje && !(l.precio_unit > 0) ? '<span class="mctk-canje" title="Canjeado de paquete o gift card">Canje</span>' : e($m(esGift ? l.precio_unit : net(l.precio_unit)));
      var m = montos(l), tipoTxt = l.tipo !== "producto" ? " · " + e(esMejora(l) ? "Diferencia por mejora" : (TIPO[l.tipo] || l.tipo)) : "";
      var pills = (l.canje ? '<span class="mctk-pill" style="color:#7C6BB0;border-color:#7C6BB0">Canje</span>' : "") +
        (esMejora(l) ? '<span class="mctk-pill" style="color:#1A6B8A;border-color:#1A6B8A">Diferencia por mejora</span>' : "") +
        (l.cortesia ? '<span class="mctk-pill" style="color:#2E8B57;border-color:#2E8B57">Cortesía</span>' : "") +
        (l.consumoInterno ? '<span class="mctk-pill" style="color:#56627A;border-color:#56627A">Consumo interno</span>' : "") +
        (l.paqueteSesion ? '<span class="mctk-pill" style="color:#56627A;border-color:#56627A">Canje de paquete</span>' : "") +
        (l.valorNominal > 0 && l.tipo === "gift" ? ' <span style="color:#56627A;font-size:.72rem">valor nominal ' + e($m(l.valorNominal)) + "</span>" : "") +
        (l.tipo === "diferencia" ? '<span class="mctk-pill" style="color:#B2452A;border-color:#B2452A" title="Lo cobrado no cuadra con los precios de catálogo y no hay factura Migo cargada">⚠ revisar</span>' : "") + (l.excluir_comision ? ' <span class="mctk-xc">sin comisión</span>' : "") +
        (l.promo && l.descuento_valor > 0 ? '<span class="mctk-promo">🏷️ ' + e(l.promo) + "</span>" : "");
      // TK81: la «Diferencia por mejora» solo se ve si existe; agregarla es un botoncito discreto en las acciones de la fila
      var mej = l.canje && !hayMejoraDe(l.sku) && ed ? '<button type="button" class="mctk-mej" data-mejora="' + i + '" title="Agregar diferencia por mejora (el facial vale más que el paquete)" aria-label="Agregar diferencia por mejora">＋$</button>' : "";
      return '<div data-i="' + i + '" class="mctk-ln"><span class="mctk-li">' + (i + 1) + "</span>" +
        '<div class="mctk-lp">' + fotoLinea(l) + '<div class="mctk-lpt"><span class="mctk-pn">' + e(l.nombre) + irProdBtn(l) + "</span>" +
        '<span class="mctk-sku">' + e(codigoVisible(l)) + tipoTxt + pills + "</span></div></div>" +
        '<span class="mctk-nums">' +
        celda("q", "Cant", e(q2(l.cantidad)), "cantidad") +
        celda("u", esGift ? "P. con IVA" : "P. sin IVA", precio, fijo ? "" : "precio_unit") +
        celda("d", "Desc", e(descTxt(l.descuento_tipo, l.descuento_valor)), "desc") +
        celda("s", "Subtotal", "<span data-tl>" + e($m(m.sub)) + "</span>", "", " mctk-c3") +
        celda("v", "IVA", "<span data-iva>" + e($m(m.iva)) + "</span>", "", " mctk-c3") +
        celda("t", "Total", "<b data-tot>" + e($m(m.tot)) + "</b>", "") +
        "</span>" +
        '<span class="mctk-lx">' + mej + '<button class="mctk-x" type="button" data-del="' + i + '" title="Quitar línea" aria-label="Quitar línea">×</button></span></div>';
    }).join("");
  }
  function totHtml() {
    var c = calc(), d = K.d, pg = d.pagos || {}, desc = r2(c.promo + c.desc);
    var cobrado = r2(d.ticket && d.ticket.cobradoSistema || 0);
    var anulado = !!(d.ticket && d.ticket.cancelado);
    var difRnd = pg.cobrado && cobrado > 0 ? r2(c.total - cobrado) : 0;
    var redondeo = pg.cobrado && Math.abs(difRnd) > 0 && Math.abs(difRnd) <= 0.05;
    var total = redondeo ? cobrado : c.total;
    var pag = r2((pg.cobrado ? cobrado : 0) + (K.pagoBeta || 0));
    var saldo = anulado ? 0 : saldoPend(total, pag);
    var met = (pg.metodos || []).map(function (m) { return e(m.metodo) + (m.ref ? ' <span class="mccf-sub">' + e(m.ref) + "</span>" : ""); }).join(" · ");
    var sumNet = r2(K.L.reduce(function (a, l) { return a + net(l.total_linea); }, 0));
    // TK68: todo lo de Sunsu es gravado 15 %: Subtotal, IVA 15 %, Total, Pagado, Saldo (sin «Subtotal 0 %» ni duplicados).
    // TK82: tickets migrados, el cobrado del sistema anterior es la verdad si |líneas − cobrado| ≤ $0.05: Total = cobrado, sin saldo amarillo.
    return '<div class="mctk-tot"><span>Subtotal</span><b>' + $m(sumNet) + "</b>" + (desc ? "<span>Descuento" + (c.promo ? " (" + e(K.promo) + ")" : "") + "</span><b>−" + $m(net(desc)) + "</b>" : "") +
      "<span>IVA 15%</span><b>" + $m(c.iva) + "</b>" +
      (redondeo ? "<span>Ajuste por redondeo</span><b>" + (difRnd > 0 ? "−" : "+") + $m(Math.abs(difRnd)) + "</b>" : "") +
      '<span class="big">Total</span><b class="big">' + $m(total) + "</b>" +
      "<span>Pagado</span><b>" + $m(pag) + "</b><span>Saldo</span><b" + (saldo > 0.009 ? ' style="color:#C98A00"' : "") + ">" + $m(saldo) + "</b>" +
      (met ? '<span class="mccf-sub">Forma de pago</span><span style="text-align:right;font-size:.8rem">' + met + "</span>" : "") +
      (!redondeo && Math.abs(c.total - cobrado) > 0.009 ? '<span class="mccf-sub">Cobrado en el sistema</span><b class="mccf-sub">' + $m(cobrado) + "</b>" : "") + "</div>" +
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
      (comp ? '<div><label class="btn small mctk-voucher" style="cursor:pointer">📷 Voucher<input type="file" class="mctk-voucher-inp" accept="image/*,application/pdf" hidden></label> <span class="mccf-sub">En el iPhone se abre el menú: Tomar foto, Fototeca o Archivos (también PDF). Cualquiera que vea el ticket puede subirla.</span></div>' : "") + "</div>";
  }
  function voucherThumbsHtml() {
    var docs = (K.d.documentos || []).filter(function (x) { return x.tipo === "comprobante" && x.url; });
    if (!docs.length) return "";
    var h = docs.map(function (x) {
      if (window.MCVoucher && window.MCVoucher.thumbHtml) return window.MCVoucher.thumbHtml(x.url, x.nombre || "Voucher", true);
      return '<button type="button" class="btn ghost small" data-pv="' + e(x.url) + '" data-pvn="' + e(x.nombre || "Voucher") + '">🧾 ' + e(x.nombre || "Voucher") + "</button>";
    }).join("");
    return '<div class="mctk-vthumbs pg-thumbs" id="mctk-vthumbs">' + h + "</div>";
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
    var facPdf = (d.documentos || []).filter(function (x) { return x.tipo === "factura" && x.url; })[0];
    var reag = rg.si ? (rg.cita ? "Sí · " + fechaIso(rg.cita) : "Sí") : "No";
    return '<div id="mctk-root" class="mctk2">' + (d.falta ? '<p class="err">' + e(d.falta) + "</p>" : "") +
      '<div class="mctk-bar"><button class="btn ghost small" type="button" id="mctk-volver">' + (sessionStorage.getItem("mctk.volver") ? "← Clienta" : "← Lista") + "</button><span style=\"flex:1\"></span>" +
      '<label class="btn ghost small mctk-voucher">📷 Voucher<input type="file" class="mctk-voucher-inp" accept="image/*,application/pdf" hidden></label>' +
      '<div class="mctk-menu"><button class="btn ghost small" type="button" data-menu="mctk-dd">Documentos ▾</button><div class="mctk-dd" id="mctk-dd" hidden>' + docsHtml2() + "</div></div>" +
      '<div class="mctk-menu"><button class="btn ghost small" type="button" data-menu="mctk-wa">WhatsApp ▾</button><div class="mctk-dd" id="mctk-wa" hidden>' + waHtml() + "</div></div>" +
      '<button class="btn ghost small" type="button" id="mctk-print">Imprimir</button><button class="btn ghost small" type="button" id="mctk-excl">Excluir comisión</button>' + (d.admin && window.MCMultas ? '<button class="btn ghost small" type="button" id="mctk-multa">⚠️ Aplicar multa</button>' : "") + (d.puedeCancelar ? '<button class="btn ghost small mctk-cancel" type="button" id="mctk-cancelar">🚫 Cancelar ticket</button>' : "") + (!d.puedeCancelar && d.puedePedir && !t.cancelado ? '<button class="btn ghost small mctk-cancel" type="button" id="mctk-solcancel">🗑️ Solicitar eliminación</button>' : "") + "</div>" +
      (t.cancelado ? '<div class="mctk-canc"><b>🚫 Ticket cancelado</b>' + (t.cancelado.por ? " por " + e(t.cancelado.por) : "") + (t.cancelado.ts ? " · " + e(String(t.cancelado.ts).slice(0, 16).replace("T", " ")) : "") + (t.cancelado.motivo ? "<br>Motivo: " + e(t.cancelado.motivo) : "") + "<br><small>No suma en totales, comisiones ni dashboard. El stock de productos volvió a su bodega.</small></div>" : "") +
      flagsHtml() + faltaHtml() + voucherThumbsHtml() +
      '<div class="mccf-card"><div class="mctk-top"><div><h1 class="mctk-num">' + e(num) + '</h1>' + ((d.info && (d.info.nombre || d.info.clienteCodigo)) ? '<div class="mctk-cli">' + e(((d.info.nombre || "") + " " + (d.info.apellido || "")).trim()) + (d.info.clienteCodigo ? ' · <a class="mctk-cod" href="#/m/clientes/c/' + encodeURIComponent(d.clienteKey || "") + '">' + e(d.info.clienteCodigo) + "</a>" : "") + "</div>" : "") + '<div class="mctk-fac" data-k="factura"><span' + ((d.puedeEditar || d.puedePedir) ? ' class="mctk-ed" data-ed="factura" tabindex="0" title="Clic para editar"' : "") + ">" + (fac ? "Factura " + e(fac) : '<span class="mccf-sub">' + ((d.chips || []).some(function (c) { return c && c.k === "sincobro"; }) ? "No se factura (en $0)" : "Sin factura") + "</span>") + "</span>" + (facPdf ? ' <button type="button" class="btn ghost small" data-pv="' + e(facPdf.url) + '" data-pvn="' + e(facPdf.nombre || ("Factura " + fac)) + '">📄 Ver factura</button>' : "") + "</div></div>" + '<div class="mctk-pills">' + chipsHtml() + "</div></div>" +
      '<div class="mctk-grid"><dl>' + campo("nombre", "Nombre") + campo("apellido", "Apellido") + campo("cedula", "CI") + ((d.campos || []).some(function (c) { return c[0] === "email"; }) ? campo("email", "Email") + campo("telefono", "Teléfono") : "") + campo("cosmetologa", "Atendió") + campo("notas", "Notas") + campo("recomendaciones", "Recomendaciones") + "</dl>" +
      "<dl>" + ro("Fecha", e(fecha(inf.fecha, inf.hora))) + campo("local", "Local") + campo("cabina", "Cabina") + ro("Orden", e(inf.orden != null ? "#" + inf.orden : "")) + campo("retorno", "Fecha de regreso", { fmt: function (v) { return v ? fecha(v) : ""; } }) + ro("Reagendada", e(reag)) +
      (d.clienteKey ? ro("Ficha", '<a href="#" id="mctk-ficha" class="mctk-link">Ver clienta</a>') : "") + "</dl></div>" +
      (d.excluirCosmetologa ? '<p class="mccf-note">Comisión excluida para ' + e(t.cosmetologa) + (d.excluirNota ? ": " + e(d.excluirNota) : "") + "</p>" : "") + "</div>" +
      '<div class="mccf-card mctk-lcard"><b>Líneas</b><div class="mctk-lwrap"><div id="mctk-lin" class="mctk-ls">' + lineasHtml() + "</div></div>" +
      '<a href="#" class="mctk-link" id="mctk-addlink">+ Agregar producto</a><div id="mctk-addbox" hidden><div class="mctk-scan" style="margin-top:6px"><input type="search" id="mctk-q" placeholder="Nombre, SKU o escanea el código" autocomplete="off"></div><div class="mccf-hits" id="mctk-hits" hidden></div><div class="mctk-gcq" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0 0"><button type="button" class="btn small" id="mctk-gc65">Facial Premium $65.00 con IVA</button><label class="mccf-sub" style="display:flex;align-items:center;gap:4px">Valor con IVA $<input type="number" id="mctk-gcval" step="0.01" min="0" placeholder="150.00" style="width:88px"></label><button type="button" class="btn ghost small" id="mctk-gcadd">Agregar gift</button><button type="button" class="btn ghost small" id="mctk-caja">Agregar caja (+$3)</button></div><div id="mctk-gciva" class="mccf-sub" style="margin-top:4px"></div></div>' +
      '<div class="mctk-foot"><div class="mctk-adj"><button type="button" class="btn ghost small" id="mctk-promos">🏷️ Promociones</button>' + (K.promo ? '<label>Promoción anterior <select id="mctk-promo">' + opt("", "Sin promoción", K.promo) + (d.promos || []).map(function (p) { return opt(p.nombre, p.nombre, K.promo); }).join("") + (K.promo && !(d.promos || []).some(function (p) { return p.nombre === K.promo; }) ? opt(K.promo, K.promo + " (ya no vigente)", K.promo) : "") + "</select></label>" : "") +
      '<label>Descuento <input id="mctk-dv" type="text" inputmode="decimal" placeholder="10% o $5" title="Descuento del ticket: 10% o $5" value="' + e(descTxt(K.desc.tipo, K.desc.valor)) + '"></label></div><div id="mctk-tot">' + totHtml() + '</div></div><div id="mctk-pagos"></div>' +
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
    if (p.activo === false && !p.enMigo) { beep(false); toast2("«" + p.nombre + "» está inactivo: no se puede vender", true); flashBad(); return false; }
    var l = K.L.find(function (x) { return x.sku === p.sku && x.tipo === p.tipo; });
    if (l) l.cantidad = r2(l.cantidad + 1);
    else K.L.push({ tipo: p.tipo, sku: p.sku, nombre: p.nombre, cantidad: 1, precio_unit: r2(p.pvp), descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: false });
    marcar(); pintarLin(); beep(true);
    var idx = K.L.indexOf(l || K.L[K.L.length - 1]), tr = document.querySelector('#mctk-lin [data-i="' + idx + '"]');
    if (tr) { tr.classList.remove("mctk-flash"); void tr.offsetWidth; tr.classList.add("mctk-flash"); }
    return true;
  }
  function wireBuscar(main) {
    var q = main.querySelector("#mctk-q"), hits = main.querySelector("#mctk-hits");
    function bad() { q.classList.remove("mctk-flash-bad"); void q.offsetWidth; q.classList.add("mctk-flash-bad"); }
    function lista() {
      var v = q.value.trim(); if (!v) { hits.hidden = true; return; }
      var H = (window.MCBuscar ? window.MCBuscar.filtrar(K.cat || [], v, function (p) { return [[p.sku, p.skuVisible].concat(p.barras || []), [p.nombre]]; }) : []).filter(function (p) { return p.activo !== false || p.enMigo; }).slice(0, 10);
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
        if (window.toast) toast("Ticket cancelado" + (r.unidades ? " · " + r.unidades + " u. devueltas a bodega" : "") + (r.paquetes && r.paquetes.length ? " · paquete anulado" : "") + (r.liberadas && r.liberadas.length ? " · " + r.liberadas.length + " sesión(es) de paquete liberada(s)" : ""), "var(--green)");
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
      K.L.map(function (l, i) { return '<tr><td><div class="mctk-pn">' + e(l.nombre) + '</div><div class="mctk-sku">' + e(codigoVisible(l)) + " · " + e(TIPO[l.tipo] || l.tipo) + " ×" + e(q2(l.cantidad)) + '</div></td><td class="num">' + $m(net(l.total_linea != null ? l.total_linea : l.precio_unit * l.cantidad)) + '</td><td class="c"><input type="checkbox" data-x="' + i + '"' + (l.excluir_comision ? " checked" : "") + "></td></tr>"; }).join("") +
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
    return Object.assign(dat, { lineas: K.L.map(function (l) { return { tipo: l.tipo, sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, precio_unit: l.precio_unit, descuento_tipo: l.descuento_tipo || "", descuento_valor: l.descuento_valor || 0, excluir_comision: !!l.excluir_comision, estimado: !!l.estimado, promo: l.promo || "" }; }),
      descuento: { tipo: K.desc.tipo || "", valor: Number(K.desc.valor) || 0 }, promo: K.promo || "", excluir_cosmetologa: K.exclC, excluir_nota: K.exclN });
  }
  function cargarEstado(d) {
    K.d = d; K.dirty = false; K.dirtyL = false; K.datos = {};
    K.L = (d.lineas || []).map(function (l) { return { tipo: l.tipo, sku: l.sku, nombre: l.nombre, cantidad: Number(l.cantidad), precio_unit: Number(l.precio_unit), descuento_tipo: l.descuento_tipo || null, descuento_valor: Number(l.descuento_valor) || 0, excluir_comision: !!l.excluir_comision, estimado: !!l.estimado, canje: !!l.canje, cortesia: !!l.cortesia, consumoInterno: !!l.consumoInterno, paqueteSesion: l.paqueteSesion || "", valorNominal: Number(l.valorNominal) || 0, mejoraPaquete: !!l.mejoraPaquete || /diferencia por mejora/i.test(l.nombre || l.promo || ""), total_linea: Number(l.total_linea) || 0, promo: l.promo || "" }; });
    K.promoIds = [];
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
  function conTratamiento() {
    var d = K.d || {}, t = d.ticket || {};
    return (d.lineas || []).some(function (l) { return l.tipo === "facial" || l.tipo === "servicio" || l.tipo === "extra" || l.tipo === "paquete"; }) || !!(t.notas || t.recomendaciones || t.retorno);
  }
  /** Clave de la tarjeta en window._tkCards: la fila de la hoja o, si el ticket es de la beta, su id. */
  function claveCard() { var t = K.d.ticket; return t.sheetRow ? t.sheetRow : "tk:" + (t.id || K.d.clave); }
  /** Tarjeta armada con los datos del ticket que se ve (líneas, notas, recomendaciones, regreso, cosmetóloga, fotos). */
  function cardDesdeTicket(base) {
    var d = K.d, t = d.ticket, L = d.lineas || [], out = Object.assign({}, base || {});
    var nom = function (l) { return String(l.nombre || l.sku || "").trim(); };
    var fac = L.filter(function (l) { return l.tipo === "facial" || l.tipo === "servicio"; });
    var ext = L.filter(function (l) { return l.tipo === "extra"; });
    var paq = L.filter(function (l) { return l.tipo === "paquete"; });
    var prod = L.filter(function (l) { return l.tipo === "producto"; });
    if (L.length && !base) {
      out.facial = fac.map(nom).join(" + ");
      out.extras = ext.map(function (l) { return nom(l) + (l.cantidad > 1 ? " ×" + l.cantidad : ""); }).join(" | ");
      var p3 = window._P3S || [], pq = paq[0], es3 = pq && p3.some(function (x) { return String(pq.sku || "").indexOf(x) >= 0; });
      out.pack3 = pq && es3 ? nom(pq) : ""; out.pack6 = pq && !es3 ? nom(pq) : "";
      out.productos = prod.map(function (l) { return nom(l) + (l.cantidad > 1 ? " ×" + l.cantidad : ""); });
    }
    out.nombre = t.nombre || out.nombre; out.apellido = t.apellido || out.apellido;
    out.cosmetologa = t.cosmetologa || out.cosmetologa; out.fecha = t.fecha || out.fecha;
    if (t.notas && !out.notas) out.notas = t.notas;
    if (t.recomendaciones && !out.recomendaciones) out.recomendaciones = t.recomendaciones;
    var ret = String(t.retorno || "").trim(), mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(ret);
    if (mdy) ret = mdy[3] + "-" + ("0" + mdy[1]).slice(-2) + "-" + ("0" + mdy[2]).slice(-2);
    if (ret && !out.retorno) out.retorno = ret;
    var fotos = (d.documentos || []).filter(function (x) { return x.tipo === "foto"; });
    if (!out.fotosAntes && !out.fotosDespues && fotos.length) {
      out.fotosAntes = fotos.filter(function (x) { return !/despu/i.test(x.nombre || ""); }).map(function (x) { return x.url; }).join(" | ");
      out.fotosDespues = fotos.filter(function (x) { return /despu/i.test(x.nombre || ""); }).map(function (x) { return x.url; }).join(" | ");
    }
    if (!out.colS && t.paquete) out.colS = "";
    return out;
  }
  async function cardDelTicket() {
    var t = K.d.ticket, h = null;
    if (t.sheetRow) {
      h = (window._histData || []).find(function (x) { return String(x.tkRow) === String(t.sheetRow); }) || null;
      // Solo este ticket (antes bajaba todo el historial).
      if (!h) { try { var r = await api("tk_historial", { rows: [t.sheetRow], limit: 1 }); h = (r && r.items && r.items[0]) || null; } catch (x) {} }
    }
    // Sin fila de la hoja (ticket hecho en la beta) o sin tarjeta previa: se arma con los datos del ticket.
    if (!h && !conTratamiento()) return null;
    h = cardDesdeTicket(h);
    (window._tkCards = window._tkCards || {})[claveCard()] = h;
    return h;
  }
  function pdfTarjeta() { return new Promise(function (res) { if (typeof tarjetaTicket !== "function") return res(null); cardDelTicket().then(function (hh) { if (!hh) return res(null); tarjetaTicket(claveCard(), function (doc, nom) { res({ doc: doc, nom: nom }); }); }); }); }
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
        '<dl class="mctk-cd"><dt>Subtotal</dt><dd>' + $m(c.subtotal) + "</dd>" +
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
    var esSel = k === "cabina";
    dd.innerHTML = esSel ? '<select class="mctk-in">' + ["", "Cabina 1", "Cabina 2", "Cabina 3", "Local"].map(function (c) { return '<option value="' + c + '"' + (c === v ? " selected" : "") + ">" + (c || "— sin cabina —") + "</option>"; }).join("") + "</select>" : largo ? '<textarea rows="3" class="mctk-in">' + e(v) + "</textarea>" : '<input class="mctk-in" type="' + tipo + '" value="' + e(v) + '"' + (k === "factura" ? ' placeholder="001-001-000000000"' : "") + ">";
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
    inp.onblur = ok; if (esSel) inp.onchange = ok;
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
    var facBtn = main.querySelector(".mctk-fac [data-pv]");
    if (facBtn) facBtn.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); if (window.MCPrevia) window.MCPrevia.abrir(facBtn.getAttribute("data-pv"), facBtn.getAttribute("data-pvn")); };
    main.querySelector("#mctk-dd").onclick = async function (ev) {
      var pv = ev.target.closest("[data-pv]");
      if (pv && window.MCPrevia) { this.hidden = true; window.MCPrevia.abrir(pv.getAttribute("data-pv"), pv.getAttribute("data-pvn")); return; }
      var b = ev.target.closest("[data-doc]"); if (!b) return;
      this.hidden = true;
      if (b.getAttribute("data-doc") === "tarjeta" && window.MCPrevia) { var hh = await cardDelTicket(); if (!hh) { toast2("No encontré la tarjeta de este ticket", true); return; } window.MCPrevia.tarjeta(claveCard(), "Tarjeta del tratamiento"); return; }
      if (b.getAttribute("data-doc") === "paquete" && window.MCPrevia && window.MCPrevia.pdf) { window.MCPrevia.pdf("Reporte del paquete", function () { return pdfPaquete().then(function (x) { if (!x.x) throw new Error("No encontré el paquete de este ticket"); return x; }); }); return; }
      if (b.getAttribute("data-doc") === "gc") { if (K.dirty && !confirm("Hay cambios sin guardar. ¿Salir igual?")) return; abrirGiftCard(b.getAttribute("data-cod")); return; }
      var h = await cardDelTicket();
      if (!h || typeof tarjetaTicket !== "function") { toast2("No encontré la tarjeta de este ticket", true); return; }
      tarjetaTicket(claveCard());
    };
    main.querySelector("#mctk-wa").onclick = function (ev) { var b = ev.target.closest("[data-wa]"); if (!b) return; this.hidden = true; enviarReporte(b.getAttribute("data-wa")); };
    main.querySelector("#mctk-print").onclick = function () { document.body.classList.add("mctk-printing"); window.print(); setTimeout(function () { document.body.classList.remove("mctk-printing"); }, 500); };
    main.querySelector("#mctk-excl").onclick = dlgExcluir;
    if (main.querySelector("#mctk-cancelar")) main.querySelector("#mctk-cancelar").onclick = dlgCancelar;
    if (main.querySelector("#mctk-solcancel")) main.querySelector("#mctk-solcancel").onclick = async function () {
      var mo = prompt("¿Por qué hay que eliminar (cancelar) este ticket? Lo aprueba un admin.");
      if (mo == null) return;
      if (String(mo).trim().length < 3) { alert("Escribe el motivo"); return; }
      var rr = await api("solicitud_crear", { tabla: "ticket_detalle", fila: K.d.clave, tipo: "eliminacion", motivo: String(mo).trim() });
      if (!rr || rr.error) { alert((rr && rr.error) || "No se pudo enviar"); return; }
      if (window.toast) toast(rr.prueba ? "🧪 Solicitud de PRUEBA enviada a tu bandeja" : "📨 Solicitud de eliminación enviada", "var(--green)");
    };
    if (main.querySelector("#mctk-multa")) main.querySelector("#mctk-multa").onclick = function () {
      var t = K.d.ticket, inf = K.d.info || {};
      window.MCMultas.aplicarDesdeTicket({ id: t.id, so: t.soNum || t.betaNum, cosmetologa: t.cosmetologa, fecha: t.fecha || inf.fecha, cliente: ((t.nombre || "") + " " + (t.apellido || "")).trim() }).catch(function (x) { toast2((x && x.message) || String(x), true); });
    };
    main.querySelectorAll("[data-ed]").forEach(function (b) { b.onclick = function () { editarCampo(main, b.getAttribute("data-ed")); }; b.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); editarCampo(main, b.getAttribute("data-ed")); } }; });
    function subirVoucherDe(inp) {
      inp.onchange = async function () {
        var f = inp.files && inp.files[0]; inp.value = ""; if (!f) return;
        toast2("⏳ Subiendo voucher…");
        try {
          var data = await (window.MCVoucher && window.MCVoucher.comprimir ? window.MCVoucher.comprimir(f) : comprimir(f));
          var r = await api("tk_subir_doc", { clave: K.d.clave, imagen: data });
          if (!r || r.error) { toast2((r && r.error) || "No se pudo subir", true); return; }
          toast2("✓ Voucher subido");
          var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok && !K.dirty) { cargarEstado(d); repintar(main); }
        } catch (x) { toast2((x && x.message) || "No se pudo subir", true); }
      };
    }
    main.querySelectorAll(".mctk-voucher-inp").forEach(subirVoucherDe);
    var vth = main.querySelector("#mctk-vthumbs");
    if (vth) {
      if (window.MCVoucher && window.MCVoucher.cargarThumbs) window.MCVoucher.cargarThumbs(vth);
      if (window.MCVoucher && window.MCVoucher.wireQuitar) window.MCVoucher.wireQuitar(vth, K.d.clave, async function () {
        var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok && !K.dirty) { cargarEstado(d); repintar(main); }
      });
      vth.querySelectorAll("[data-pv]").forEach(function (b) {
        b.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); if (window.MCPrevia) window.MCPrevia.abrir(b.getAttribute("data-pv"), b.getAttribute("data-pvn") || "Voucher"); };
      });
    }
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
      var tr = ev.target.closest("[data-i]"), f = ev.target.getAttribute("data-f"); if (!tr || !f) return;
      var l = K.L[+tr.getAttribute("data-i")];
      if (f === "desc" && !String(ev.target.value).trim()) { l.descuento_tipo = null; l.descuento_valor = 0; l.promo = ""; ev.target.classList.remove("bad"); }
      else if (f === "desc") { var x = descParse(ev.target.value); ev.target.classList.toggle("bad", !x); if (!x) return; l.descuento_tipo = x.tipo; l.descuento_valor = x.tipo === "$" ? x.valor * IVA : x.valor; l.promo = ""; }
      else if (f === "precio_unit" && l.tipo === "gift") l.precio_unit = (Number(ev.target.value) || 0); // gift: el valor se escribe CON IVA
      else if (f === "precio_unit") l.precio_unit = (Number(ev.target.value) || 0) * IVA; // se escribe sin IVA
      else l[f] = Number(ev.target.value) || 0;
      if (f === "precio_unit") l.estimado = false;
      calc(); pintarMontos(tr, l); pintarTot(); marcar();
    });
    // TK81: clic en Cant / P. sin IVA / Desc → campo en línea; Enter o salir aplica, Esc deshace.
    function editarCelda(c) {
      if (!c || c.querySelector("input")) return;
      var tr = c.closest("[data-i]"), l = K.L[+tr.getAttribute("data-i")], f = c.getAttribute("data-le"); if (!l || !f) return;
      var antes = JSON.stringify(l), v = f === "cantidad" ? q2(l.cantidad) : f === "precio_unit" ? (l.tipo === "gift" ? r2(l.precio_unit).toFixed(2) : net(l.precio_unit).toFixed(2)) : descTxt(l.descuento_tipo, l.descuento_valor);
      var cv = c.querySelector(".mctk-cv");
      cv.innerHTML = '<input class="mctk-cin" data-f="' + (f === "desc" ? "desc" : f) + '" ' + (f === "desc" ? 'type="text" inputmode="decimal" placeholder="10% o $5"' : 'type="number" inputmode="decimal" min="0" step="any"') + ' value="' + e(v) + '" aria-label="' + e(c.querySelector("small").textContent) + '">';
      var inp = cv.querySelector("input"), fin = false; inp.focus(); inp.select();
      function cerrar(deshacer) { if (fin) return; fin = true; if (deshacer) { Object.assign(l, JSON.parse(antes)); calc(); } pintarLin(); }
      inp.addEventListener("keydown", function (k) { if (k.key === "Enter") { k.preventDefault(); cerrar(false); } else if (k.key === "Escape") { k.preventDefault(); cerrar(true); } });
      inp.addEventListener("blur", function () { cerrar(false); });
    }
    lin.addEventListener("click", function (ev) { var c = ev.target.closest("[data-le]"); if (c && !ev.target.closest("input")) editarCelda(c); });
    lin.addEventListener("keydown", function (ev) { if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches && ev.target.matches("[data-le]")) { ev.preventDefault(); editarCelda(ev.target); } });
    lin.addEventListener("click", function (ev) { var ir = ev.target.closest("[data-irp]"); if (ir) { ev.preventDefault(); ev.stopPropagation(); go("#/m/productos/p/" + encodeURIComponent(ir.getAttribute("data-irp"))); return; } });
    lin.addEventListener("click", function (ev) { var b = ev.target.closest("[data-del]"); if (!b) return; K.L.splice(+b.getAttribute("data-del"), 1); marcar(); pintarLin(); });
    lin.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-mejora]"); if (!b) return;
      ev.preventDefault();
      var ix = +b.getAttribute("data-mejora"), canje = K.L[ix];
      if (!canje || hayMejoraDe(canje.sku)) return;
      var raw = prompt("Diferencia por mejora de paquete\nEl facial vale más que el paquete: se cobra solo la diferencia (precio sin IVA; se agrega el IVA 15 %). La sesión de paquete sigue como canje.\n\nMonto sin IVA:", "");
      if (raw == null) return;
      var v = Number(String(raw).replace(",", "."));
      if (!(v > 0)) { toast2("Escribe un monto mayor a 0", true); return; }
      K.L.splice(ix + 1, 0, {
        tipo: "servicio", sku: canje.sku, nombre: NOMBRE_MEJORA, cantidad: 1,
        precio_unit: r2(v * IVA), descuento_tipo: null, descuento_valor: 0,
        excluir_comision: false, estimado: false, mejoraPaquete: true, promo: NOMBRE_MEJORA
      });
      marcar(); pintarLin();
    });
    main.querySelector("#mctk-addlink").onclick = function (ev) { ev.preventDefault(); var bx = main.querySelector("#mctk-addbox"); bx.hidden = !bx.hidden; if (!bx.hidden) main.querySelector("#mctk-q").focus(); };
    function gcIvaTxt(v) { v = Number(v) || 0; if (!(v > 0)) return "Escribe el valor con IVA. Subtotal = valor / 1.15."; var sub = r2(v / IVA), iva = r2(v - sub); return "Subtotal $" + sub.toFixed(2) + " · IVA $" + iva.toFixed(2) + " · Total $" + r2(v).toFixed(2) + " con IVA"; }
    function pintarGcIva() { var el = main.querySelector("#mctk-gciva"), inp = main.querySelector("#mctk-gcval"); if (el) el.textContent = gcIvaTxt(inp && inp.value); }
    function addGiftValor(v) {
      v = r2(Number(v) || 0); if (!(v > 0)) { toast2("Indica el valor con IVA", true); return; }
      var l = K.L.find(function (x) { return x.tipo === "gift" && !(x.cortesia || x.canje); });
      if (l) { l.precio_unit = v; l.estimado = false; }
      else K.L.push({ tipo: "gift", sku: "SUNSU-35", nombre: "GIFT CARD", cantidad: 1, precio_unit: v, descuento_tipo: null, descuento_valor: 0, excluir_comision: false, estimado: false });
      marcar(); pintarLin(); beep(true);
    }
    function addCajaGift() {
      var p = (K.cat || []).find(function (x) { return String(x.sku || "").toUpperCase().replace(/^SUNSU-/, "") === "INV-123"; })
        || { tipo: "producto", sku: "INV-123", nombre: "Caja de gift card", pvp: 3 };
      agregar(p, function () {});
    }
    var gcVal = main.querySelector("#mctk-gcval");
    if (gcVal) gcVal.oninput = pintarGcIva;
    var b65 = main.querySelector("#mctk-gc65"); if (b65) b65.onclick = function () { var inp = main.querySelector("#mctk-gcval"); if (inp) inp.value = "65"; pintarGcIva(); addGiftValor(65); };
    var badd = main.querySelector("#mctk-gcadd"); if (badd) badd.onclick = function () { addGiftValor(main.querySelector("#mctk-gcval") && main.querySelector("#mctk-gcval").value); };
    var bcaja = main.querySelector("#mctk-caja"); if (bcaja) bcaja.onclick = function () { addCajaGift(); };

    var _pS = main.querySelector("#mctk-promo"); if (_pS) _pS.onchange = function () { K.promo = this.value; marcar(); pintarTot(); };
    var _pB = main.querySelector("#mctk-promos");
    if (_pB) _pB.onclick = function () {
      if (!window.MCPromociones) { toast2("Recarga la página para ver las promociones", true); return; }
      window.MCPromociones.panel({
        lineas: function () { return K.L.map(function (l, i) { return { k: String(i), sku: l.sku, nombre: l.nombre, tipo: l.tipo, cantidad: l.cantidad, bruto: r2(l.cantidad * l.precio_unit) }; }); },
        aplicadas: K.promoIds || [],
        aplicar: function (res, ids) {
          K.L.forEach(function (l) { if (l.promo) { l.promo = ""; l.descuento_tipo = null; l.descuento_valor = 0; } });
          (res.lineas || []).forEach(function (x) { var l = K.L[+x.k]; if (l && x.monto > 0) { l.descuento_tipo = "$"; l.descuento_valor = x.monto; l.promo = x.etiqueta; } });
          if (ids.length && K.promo) K.promo = "";
          K.promoIds = ids; marcar(); pintarLin();
        },
      });
    };
    main.querySelector("#mctk-dv").oninput = function () { var x = descParse(this.value); this.classList.toggle("bad", !x); if (!x) return; K.desc.tipo = x.tipo; K.desc.valor = x.valor; marcar(); pintarTot(); };
    wireCostos();
    // 💵 Pagos de la beta (TK19): lista, registrar y anular; el efectivo entra solo a la caja chica.
    var hp = main.querySelector("#mctk-pagos");
    if (hp && window.MCPagos && K.d && K.d.clave) window.MCPagos.montar(hp, K.d.clave, function () { return calc().total; }, function (pagadoBeta) { K.pagoBeta = pagadoBeta; pintarTot(); }, async function () { var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok && !K.dirty) { cargarEstado(d); repintar(main); } });
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
    if (p.activo === false && !p.enMigo) { beep(false); toast2("«" + p.nombre + "» está inactivo: no se puede vender", true); return; }
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
    isDirty: function () { return !!K.dirty; },
    _k: K, _calc: calc,
  };
})();


(function(){
  var orig = window.api;
  if (typeof orig !== "function" || orig._migoWrap) return;
  window.api = function(accion, body){
    return Promise.resolve(orig(accion, body)).then(function(r){
      if (accion === "crearTicket" && r && r.requiere === "vincular_borrador" && r.borrador && !(body && (body.vincular_borrador || body.ignorar_borrador))) {
        var b = r.borrador;
        var ok = confirm("Ya hay un borrador de la factura " + (b.factura || "") + " (" + (b.cliente || "") + ", $" + Number(b.total || 0).toFixed(2) + ").\n\n¿Vincular este ticket al borrador en vez de crear otro?");
        return orig("crearTicket", Object.assign({}, body || {}, ok ? { vincular_borrador: b.factura } : { ignorar_borrador: true }));
      }
      return r;
    });
  };
  window.api._migoWrap = true;
})();
