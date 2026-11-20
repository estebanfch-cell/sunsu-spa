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
      ".mctk-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.mctk-acts[hidden],.mctk-dd[hidden]{display:none}.mctk-menu,.mctk-acc-wrap,.mctk2 .mctk-bar{position:relative;overflow:visible}.mctk-dd{position:absolute;right:0;left:auto;top:100%;margin-top:4px;background:var(--white,#fff);border:1px solid var(--cream-d);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);min-width:250px;width:max-content;max-width:calc(100vw - 24px);z-index:80;padding:4px}",
      ".mctk-dd a,.mctk-dd button,.mctk2 .mctk-dd a,.mctk2 .mctk-dd button{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:8px 10px;border:none;background:none;font:inherit;font-size:.8rem;color:var(--navy-d);text-decoration:none;cursor:pointer;border-radius:7px;white-space:nowrap;box-sizing:border-box}.mctk-dd a:hover,.mctk-dd button:hover{background:var(--cream)}.mctk-dd .wa-icon,.mctk-wa-go .wa-icon{flex:none;width:16px;height:16px;display:block}",
      ".mctk-t input,.mctk-t select{padding:5px 6px;border:1.5px solid var(--cream-d);border-radius:7px;font:inherit;font-size:.8rem}.mctk-t .q{width:58px;text-align:right}.mctk-t .p{width:80px;text-align:right}.mctk-t .dv{width:58px;text-align:right}",
      ".mctk-tot{display:grid;grid-template-columns:auto auto;gap:3px 14px;width:max-content;max-width:100%;margin-left:auto;justify-content:end;font-size:.88rem;overflow:visible;box-sizing:border-box;text-align:right}.mctk-tot b{text-align:right}.mctk-tot .big{font-size:1.2rem;color:var(--navy-d)}",
      ".mctk-flash{animation:mctkf .6s}@keyframes mctkf{0%{background:#c9f2d3}100%{background:transparent}}.mctk-flash-bad{animation:mctkb .6s}@keyframes mctkb{0%{background:#f9d0cc}100%{background:transparent}}",
      ".mctk-scan{display:flex;gap:8px;align-items:center}.mctk-scan input{flex:1;padding:9px 11px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit}.mctk-est{font-size:.62rem;background:#fff3d6;color:#9a6b00;border-radius:6px;padding:1px 5px;margin-left:4px}",
      ".mctk-dlg{position:fixed;inset:0;background:rgba(20,30,50,.35);display:flex;align-items:center;justify-content:center;z-index:9999}.mctk-box{background:var(--white,#fff);border-radius:14px;padding:16px;width:min(520px,94vw);max-height:88vh;overflow:auto}",
      ".mctk-box label{display:flex;gap:8px;align-items:center;font-size:.84rem;margin:6px 0}.mctk-box textarea,.mctk-box input[type=text]{width:100%;box-sizing:border-box;padding:8px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit}",
      ".mctk-xc{color:#b2452a;font-size:.68rem;font-weight:800}",
      ".mctk-lnw{display:flex;gap:8px;align-items:center}.mctk-ph{width:38px;height:38px;object-fit:cover;border-radius:7px;border:1px solid var(--cream-d);flex:none}",
      ".mctk-falta{background:#fff6d6;border:1.5px solid #e8cf7a;color:#6b4e00;border-radius:12px;padding:10px 12px;margin-bottom:10px;font-size:.84rem;display:flex;flex-direction:column;gap:8px}",
      ".mctk-cuadre{display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px 8px;border-radius:999px;padding:3px 10px;font-size:.72rem;font-weight:800;margin:0 0 10px;max-width:100%;line-height:1.3}",
      ".mctk-cuadre.ok{background:#e8f6ee;color:#1b6b45;border:1.5px solid #9ad7b6}",
      ".mctk-cuadre.bad{background:#fdecea;color:#7a2318;border:1.5px solid #e6a39b}",
      ".mctk-ln.ok{background:#f3faf6;border-left:3px solid #2e9e4f;border-radius:0 8px 8px 0}",
      ".mctk-ln.diff,.mctk-ln.sobra,.mctk-ln.falta{background:#fff5f0;border-left:3px solid #d9534f;border-radius:0 8px 8px 0}",
      ".mctk-ln.canje_ok{background:#f7faf8;border-left:3px solid #9ad7b6;border-radius:0 8px 8px 0}",
      ".mctk-cuadre-razon{font-size:.68rem;font-weight:700;color:#8a2216;margin-top:2px;line-height:1.3;overflow-wrap:anywhere}",
      ".mctk-ln.canje_ok .mctk-cuadre-razon{color:#1b6b45}",
      ".mctk-just{margin:8px 0 0;display:flex;flex-direction:column;gap:4px;max-width:100%}",
      ".mctk-just label{font-size:.78rem;font-weight:700;color:var(--navy-d)}",
      ".mctk-just textarea{width:100%;box-sizing:border-box;min-height:56px;padding:8px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit;font-size:.8rem}",
      ".mctk-flag{display:none}",
      ".mctk-cosm{width:100%;max-width:100%;box-sizing:border-box;padding:4px 8px;border:1.5px solid var(--cream-d);border-radius:8px;font:inherit;font-size:.84rem;background:#fff;color:var(--navy)}.mctk-cosm[data-mod='1']{background:#fff3d6}.mctk-ed{cursor:text;border-radius:5px;padding:1px 4px;margin:-1px -4px;display:inline-block;min-width:40px}.mctk-ed:hover,.mctk-ed:focus{background:var(--cream);outline:1px dashed var(--cream-d)}.mctk-t .dv{width:64px}.mctk-t input.bad{border-color:#d9534f}.mctk-canje{font-size:.7rem;font-weight:800;color:#7C6BB0}",
      ".mctk-voucher{flex:0 0 auto;white-space:nowrap!important;cursor:pointer}.mctk-vthumbs{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 10px}.mctk2 .mctk-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.mctk-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}.mctk-num{margin:0;font-size:1.6rem;color:var(--navy-d);letter-spacing:.3px}.mctk-fac{color:var(--gray);font-size:.86rem;margin-top:2px}",
      ".mctk-pills{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:460px}.mctk-pill{display:inline-block;border:1.5px solid;border-radius:999px;padding:2px 10px;font-size:.7rem;font-weight:700;background:transparent;white-space:nowrap;line-height:1.5}",
      ".mctk-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 28px;margin-top:14px}@media(max-width:720px){.mctk-grid{grid-template-columns:1fr}}.mctk-grid dl,.mctk-grid1{margin:0}.mctk-f{display:grid;grid-template-columns:130px 1fr;gap:8px;padding:6px 0;border-bottom:1px solid var(--cream-d);font-size:.84rem}.mctk-f dt{color:var(--gray);font-size:.76rem}.mctk-f dd{margin:0;word-break:break-word}.mctk-f .v.mod{background:#fff3d6;border-radius:4px;padding:0 3px}",
      ".mctk-pen{border:none;background:none;color:var(--gray);cursor:pointer;font-size:.85rem;padding:0 3px}.mctk-pen:hover{color:var(--navy-d)}.mctk-in{padding:5px 7px;border:1.5px solid var(--cream-d);border-radius:7px;font:inherit;font-size:.82rem;width:min(100%,260px)}textarea.mctk-in{width:100%}",
      ".mctk-lt .mctk-c3m{display:none}.mctk-lt th small{font-weight:600;opacity:.75}.mctk-lt.mob-stack td.mctk-c3{display:none!important}.mctk-lt.mob-stack td.mctk-c3m{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:4px;padding:6px 8px!important;background:var(--cream,#faf6ef);border-radius:9px}.mctk-c3m span{display:flex;flex-direction:column;align-items:flex-end;min-width:0}.mctk-c3m small{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--gray)}.mctk-c3m b{font-size:.86rem;white-space:nowrap}" +
      ".mctk-lt td{padding:6px 8px;vertical-align:middle}.mctk-pn{font-weight:600}.mctk-sku{color:var(--gray);font-size:.68rem;margin-top:1px}.mctk-irp{display:inline;margin-left:3px;padding:0;line-height:inherit;border:0;border-radius:0;font-size:.78rem;color:var(--gold,#C4943A);text-decoration:none;white-space:nowrap;vertical-align:baseline;font-weight:700}.mctk-irp:active{background:#f4ecdc}.mctk-x{border:none;background:none;color:#b2452a;font-size:1.1rem;cursor:pointer}.mctk-link{display:inline-block;margin-top:8px;color:var(--pink-d,#b85c7a);font-size:.82rem;font-weight:700;text-decoration:none}.mctk-link:hover{text-decoration:underline}",
      ".mctk-foot{display:flex;gap:16px;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;margin-top:12px}.mctk-adj{display:flex;flex-direction:column;gap:6px;font-size:.78rem;color:var(--gray)}.mctk-adj select,.mctk-adj input{padding:4px 6px;border:1.5px solid var(--cream-d);border-radius:7px;font:inherit;font-size:.78rem}#mctk-tot{min-width:0;max-width:100%}",
      ".mctk-flag{background:#fdecea;border:1.5px solid #e6a39b;color:#7a2318;border-radius:12px;padding:10px 12px;margin-bottom:10px;font-size:.84rem;display:flex;flex-direction:column;gap:8px}",
      ".mctk-cost{width:min(620px,94vw)}.mctk-cd{display:grid;grid-template-columns:1fr auto;gap:8px 16px;font-size:.86rem;margin:12px 0}.mctk-cd dt{color:var(--gray)}.mctk-cd dd{margin:0;text-align:right}",
      "",
      ".mctk-cli{font-size:.9rem;font-weight:700;color:var(--navy-d);margin:-2px 0 2px}.mctk-cod{font-family:ui-monospace,monospace;color:var(--navy);text-decoration:none;border-bottom:1px dashed}",
      ".mctk-cancel{color:#C0392B!important;border-color:#E6B0AA!important}.btn.small.mctk-cancel:not(.ghost){background:#C0392B!important;color:#fff!important}.mctk-canc{background:#FDECEA;border:1px solid #E6B0AA;color:#922B21;border-radius:10px;padding:10px 12px;margin:8px 0;font-size:.85rem}" +
      ".mctk-xdlg .mctk-box{width:min(620px,94vw);max-height:88vh;overflow:auto}.mctk-xh{display:flex;justify-content:space-between;align-items:center}.mctk-xh h3{margin:0}.mctk-xx{background:none;border:0;font-size:1.6rem;line-height:1;cursor:pointer;color:var(--navy)}.mctk-xtog{display:flex!important;align-items:center;gap:10px;padding:10px 12px;margin:8px 0;background:var(--cream);border-radius:10px;font-size:.86rem;cursor:pointer}.mctk-xdlg input[type=checkbox]{width:18px!important;height:18px;margin:0;flex:none;accent-color:var(--navy)}.mctk-xt{width:100%;border-collapse:collapse;font-size:.84rem;margin:4px 0 10px}.mctk-xt th{font-size:.68rem;text-transform:uppercase;color:var(--gray);text-align:left;padding:6px 8px;border-bottom:1px solid var(--cream-d)}.mctk-xt td{padding:8px;border-bottom:1px solid #f0ece4;vertical-align:middle}.mctk-xt .num{text-align:right;white-space:nowrap}.mctk-xt .c{text-align:center;width:70px}.mctk-xlbl{display:block;font-size:.8rem;font-weight:700}.mctk-xlbl input{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit;font-weight:400}",
      // TK142 (Emilia pt621u–pt624u): líneas compactas tipo MineCore, paleta clara Sunsu (nunca fondo oscuro).
      ".mctk-lwrap{container-type:inline-size;container-name:mctkl}" +
      ".mctk-lcard>b{display:block;font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--navy-d);padding:0 0 8px}" +
      ".mctk-ls{display:flex;flex-direction:column;gap:0;border:1px solid var(--cream-d);border-radius:12px;background:var(--white,#fff);overflow:hidden}" +
      ".mctk-lh{display:none!important}" +
      ".mctk-ln{display:grid;grid-template-columns:28px minmax(0,1fr);grid-template-rows:auto auto auto;column-gap:8px;row-gap:0;align-items:start;margin:0;padding:7px 22px 7px 10px;border:0;border-bottom:1px solid var(--cream-d);border-radius:0;background:transparent;position:relative;box-sizing:border-box;min-width:0;max-width:100%;min-height:0}" +
      ".mctk-ln:last-child{border-bottom:0}" +
      ".mctk-ln.ok{background:#f3faf6;border-left:3px solid #2e9e4f;border-radius:0}" +
      ".mctk-ln.diff,.mctk-ln.sobra,.mctk-ln.falta{background:#fff5f0;border-left:3px solid #d9534f;border-radius:0}" +
      ".mctk-ln.canje_ok{background:#f7faf8;border-left:3px solid #b7d9c6;border-radius:0}" +
      ".mctk-ln .mctk-li,.mctk-ln .mctk-nums,.mctk-ln .mctk-lx,.mctk-lacts{display:none!important}" +
      ".mctk-ln>.mctk-ph,.mctk-ln>.mctk-ini,.mctk-ln>.mctk-badge{grid-column:1;grid-row:1 / span 3;align-self:start;margin-top:1px}" +
      ".mctk-r1{grid-column:2;grid-row:1;display:flex;align-items:flex-start;gap:3px;min-width:0;padding-right:16px}" +
      ".mctk-ph,.mctk-ini,.mctk-badge{width:28px;height:28px;border-radius:6px;flex:none;object-fit:cover;border:1px solid var(--cream-d);box-sizing:border-box}" +
      ".mctk-ini,.mctk-badge{display:inline-flex;align-items:center;justify-content:center;background:var(--cream,#F5F0E8);color:var(--navy-d);font-weight:800;font-size:.68rem}" +
      ".mctk-badge-F{background:#e8f0f8;color:#3D5A7A}.mctk-badge-E{background:#f3eee4;color:#7A5C12}.mctk-badge-P{background:#ece8f6;color:#5A4A8A}.mctk-badge-G{background:#f6efe0;color:#8A6D1F}" +
      ".mctk-pn{display:block;flex:1;min-width:0;font-weight:700;font-size:.8rem;color:var(--navy-d);white-space:normal;overflow:visible;overflow-wrap:break-word;word-break:break-word;line-height:1.3}" +
      ".mctk-irp{display:inline!important;margin-left:3px!important;padding:0!important;border:0!important;background:none!important;line-height:inherit!important;font-size:.78rem;color:var(--gold,#C4943A);text-decoration:none;font-weight:700;white-space:nowrap;vertical-align:baseline;border-radius:0}" +
      ".mctk-x{position:absolute;top:4px;right:4px;border:0;background:none;color:#9a9488;font-size:.78rem;line-height:1;padding:2px 5px;cursor:pointer;border-radius:4px;font-weight:500;flex-shrink:0;align-self:flex-start}" +
      ".mctk-x:hover{color:#B2452A;background:var(--cream)}" +
      ".mctk-meta,.mctk-sku,.mctk-stk{grid-column:2;font-size:11px;color:var(--gray);padding-left:0;line-height:1.3;white-space:normal;overflow:visible;overflow-wrap:break-word;min-width:0}" +
      ".mctk-stk-ok{color:#2e9e4f;font-weight:700}.mctk-stk-0{color:#d9534f;font-weight:700}" +
      ".mctk-r4{grid-column:2;grid-row:3;display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding-left:0;padding-top:0;margin-top:1px;width:100%;box-sizing:border-box;min-width:0;line-height:1.2}" +
      ".mctk-qx{font-size:.78rem;color:var(--navy-d);overflow-wrap:anywhere;min-width:0;line-height:1.2}" +
      ".mctk-desc{color:#C4943A;font-weight:800;margin-left:4px;font-variant-numeric:tabular-nums}" +
      ".mctk-qx .mctk-ok,.mctk-ok{color:#2e9e4f;font-weight:700;margin-left:4px;white-space:nowrap}.mctk-desc,.mctk-bad{white-space:nowrap}@container mctkl (max-width:420px){.mctk-ok-txt{display:none}}" +
      ".mctk-bad{color:#d9534f;font-weight:700;margin-left:4px;font-size:.7rem}" +
      ".mctk-tog{margin-left:auto;border:0;background:none;display:inline-flex;align-items:baseline;gap:3px;cursor:pointer;font:inherit;color:var(--navy-d);padding:0;flex:none}" +
      ".mctk-ltot{font-weight:800;font-size:.88rem;font-variant-numeric:tabular-nums;line-height:1.2}" +
      ".mctk-arr{font-size:.7rem;color:var(--gray);line-height:1}" +
      ".mctk-drop{grid-column:1 / -1;margin:6px 0 0;padding:4px 8px;border-radius:8px;background:var(--cream,#F5F0E8);border:1px solid var(--cream-d)}" +
      ".mctk-dr{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:3px 0;font-size:.72rem;border-bottom:1px solid var(--cream-d)}" +
      ".mctk-dr:last-child{border-bottom:0}" +
      ".mctk-dr>span:first-child{color:var(--gray);font-weight:700;flex:none}" +
      ".mctk-dr>span:last-child{text-align:right;color:var(--navy-d);overflow-wrap:anywhere;min-width:0}" +
      ".mctk-dot{border-bottom:1px dotted var(--navy-d);cursor:text;padding:0 1px}.mctk-dot:hover{background:#fff}" +
      ".mctk-cv{display:inline;min-height:1em;padding:0}" +
      ".mctk-cin{width:4.5em;max-width:96px;box-sizing:border-box;border:0;border-bottom:1.5px solid var(--navy-d);background:#fff;font:inherit;font-size:.76rem;text-align:right;padding:1px 2px;outline:none;-moz-appearance:textfield;appearance:textfield}" +
      ".mctk-cin::-webkit-outer-spin-button,.mctk-cin::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.mctk-cin.bad{border-bottom-color:#C0392B}" +
      ".mctk-mej{border:0;background:none;color:var(--gray);cursor:pointer;font-size:.78rem;font-weight:800;padding:0 4px;border-radius:6px;margin-left:4px}.mctk-mej:hover{background:var(--cream);color:var(--navy-d)}" +
      ".mctk-addbtn,#mctk-addlink.mctk-addbtn{display:inline-flex;align-items:center;gap:4px;border:1.5px solid var(--cream-d);background:var(--white,#fff);color:var(--navy-d);border-radius:999px;padding:5px 12px;font-size:.78rem;font-weight:700;cursor:pointer;margin:10px 0 4px;text-decoration:none}" +
      /* TK81 leftover hook: container 700px only tweaks type size — no spreadsheet grid. */
      "@container mctkl (min-width:700px){.mctk-pn{font-size:.88rem}.mctk-ltot{font-size:.95rem}}",

      ".mctk-foot{display:flex;gap:10px 16px;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;margin-top:10px}.mctk-adj{display:flex;flex-direction:row;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:.76rem;color:var(--gray)}.mctk-adj label{display:flex;gap:6px;align-items:center;margin:0}#mctk-dv{width:96px}#mctk-promos{border-color:#C9A227;color:#7a5c12;background:#fbf4e4;padding:5px 10px}" +
      ".mctk-tot{gap:2px 14px!important;font-size:.84rem!important;max-width:100%!important;width:max-content!important;line-height:1.35}#mctk-tot{min-width:0!important;width:max-content;max-width:100%;flex:0 0 auto;margin-left:auto;display:flex;justify-content:flex-end;flex-direction:column;align-items:flex-end}#mctk-tot .mctk-tot{width:max-content;max-width:100%;margin-left:auto}",
      "@media print{body.mctk-printing .mctk-bar,body.mctk-printing #mctk-save,body.mctk-printing .mctk-pen,body.mctk-printing #mctk-addlink,body.mctk-printing #mctk-addbox,body.mctk-printing nav,body.mctk-printing header,body.mctk-printing .mctk-x{display:none!important}}",

      /* TK104: ticket abierto en iPhone — tarjetas tipo MineCore, sin scroll horizontal. */
      "@media(max-width:860px){#mctk-root,.mctk2{overflow-x:hidden;max-width:100%;box-sizing:border-box}#mctk-root *,.mctk2 *{box-sizing:border-box;min-width:0;max-width:100%}",
      ".mctk2 .mctk-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:0 0 10px}.mctk2 .mctk-bar-sp{display:none}",
      ".mctk2 .mctk-bar #mctk-volver{width:auto;min-height:32px;padding:4px 2px;border:0;background:none;box-shadow:none;font-size:.86rem;color:var(--navy)}",
      ".mctk-edit-big{display:none!important}.mctk-edit-mini{margin:0 6px 0 auto;padding:3px 9px;min-height:28px;font-size:.68rem;font-weight:700;color:var(--navy-d,#3D5A7A);background:transparent;border:1px solid var(--cream-d,#EDE6D8);border-radius:999px;cursor:pointer;flex:none;white-space:nowrap}.mctk2 .mctk-bar .mctk-acc-wrap{margin-left:0;flex:0 0 auto}.mctk2 .mctk-bar .mctk-acc-btn{min-height:36px;border-radius:999px;padding:6px 14px;font-size:.8rem;font-weight:700;white-space:nowrap}",
      ".mctk2 .mctk-bar .mctk-dd,.mctk-acc-wrap .mctk-dd{left:auto;right:0;min-width:250px;width:max-content;max-width:calc(100vw - 24px);z-index:80}",
      ".mctk-prev{padding:10px 12px;margin-top:10px}.mctk-pv-h{font-weight:800;font-size:.86rem;color:var(--navy-d);margin-bottom:6px}.mctk-pv-sec{margin-top:6px}.mctk-pv-t{font-size:.66rem;font-weight:800;color:var(--gray);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}.mctk-pv-row{display:flex;flex-wrap:wrap;gap:8px}.mctk-pv-th{display:flex;flex-direction:column;align-items:center;gap:3px;width:64px;padding:0;border:0;background:none;cursor:pointer;font:inherit}.mctk-pv-th img,.mctk-pv-ico{width:60px;height:60px;border-radius:9px;object-fit:cover;border:1px solid var(--cream-d);background:var(--cream);display:flex;align-items:center;justify-content:center;font-size:1.5rem;max-width:60px!important;max-height:60px!important;min-width:60px;min-height:60px}.mctk-pv-l{font-size:.64rem;color:var(--navy-d);max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mctk-pv-pdf{display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid var(--cream-d);border-radius:10px;background:#fff;font:inherit;font-size:.78rem;color:var(--navy-d);cursor:pointer}.mctk-pv-falta{font-size:.74rem;color:#B45309;font-weight:700}.mctk-pv-ocr{margin-top:6px}",
      ".mctk-acc-sec{font-size:.66rem;font-weight:800;color:var(--gray);padding:8px 10px 2px;letter-spacing:.04em;text-transform:uppercase}.mctk-dd .mctk-voucher{display:flex;width:100%;align-items:center;gap:8px;text-align:left;padding:8px 10px;border:none;background:none;border-radius:7px;font:inherit;font-size:.8rem;color:var(--navy-d);cursor:pointer;white-space:nowrap!important}.mctk-dd .mctk-voucher:hover{background:var(--cream)}.mctk-dd .mctk-cancel{color:#B2452A}",
      ".mctk-addfotos{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.mctk-addfotos .mctk-addf{display:inline-flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap!important;font-size:.74rem}",
      ".mctk2 .mctk-voucher{display:inline-flex;align-items:center;gap:6px;white-space:normal!important}.mctk-cam{font-size:1.05rem;line-height:1}.mctk-vlab{font-size:.72rem;font-weight:700}",
      ".mctk-wa-sel{position:fixed;inset:0;background:rgba(20,30,50,.4);z-index:10000;display:flex;align-items:flex-end;justify-content:center;padding:16px}.mctk-wa-box{background:#fff;border-radius:16px 16px 0 0;padding:16px 16px 20px;width:min(420px,100%);box-sizing:border-box}.mctk-wa-box h3{margin:0 0 4px;font-size:1rem}.mctk-wa-box p{margin:0 0 12px;color:var(--gray);font-size:.8rem}.mctk-wa-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.mctk-wa-chip{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:999px;border:2px solid #DC2626;background:#fff;font:inherit;font-size:.8rem;font-weight:700;cursor:pointer;white-space:nowrap}.mctk-wa-chip.on{border-color:#16A34A;background:#f3faf6}.mctk-wa-dot{width:10px;height:10px;border-radius:50%;background:#DC2626}.mctk-wa-chip.on .mctk-wa-dot{background:#16A34A}.mctk-wa-acts{display:flex;justify-content:flex-end;gap:8px;align-items:center}.mctk-wa-go{display:inline-flex!important;align-items:center;gap:8px;white-space:nowrap!important}",
      ".mctk-pills-desk{display:none}.mctk-estados{position:relative;flex:0 1 auto;max-width:100%;margin-left:auto}.mctk-estados>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;border:1.5px solid var(--cream-d);border-radius:999px;padding:5px 12px;font-size:.74rem;font-weight:700;color:var(--navy-d);background:var(--white,#fff);max-width:100%;white-space:normal;overflow-wrap:anywhere}.mctk-estados>summary::-webkit-details-marker{display:none}.mctk-estados>summary:after{content:'▾';font-size:.7rem;color:var(--gray);flex:none}",
      ".mctk-estados.mctk-est-rojo>summary{color:#8B2E2E;border-color:#E6A39B;background:#FDECEA}.mctk-estados.mctk-est-amarillo>summary{color:#7A5C12;border-color:#E8CF7A;background:#FFF6D6}",
      ".mctk-estados .mctk-pills{display:flex;flex-direction:column;align-items:stretch;gap:6px;position:absolute;right:0;top:calc(100% + 4px);z-index:40;min-width:200px;max-width:min(280px,90vw);padding:8px;border:1px solid var(--cream-d);border-radius:12px;background:var(--white,#fff);box-shadow:0 8px 24px rgba(0,0,0,.12)}.mctk-estados .mctk-pill{text-align:center}",
      ".mctk-det{border:1.5px solid var(--cream-d);border-radius:12px;padding:0;margin-top:12px;background:var(--white,#fff)}.mctk-det>summary{list-style:none;cursor:pointer;padding:10px 12px;font-weight:700;color:var(--navy-d);font-size:.88rem;display:flex;align-items:center;justify-content:space-between}.mctk-det>summary::-webkit-details-marker{display:none}.mctk-det>summary:after{content:'▾';color:var(--gray);font-weight:400}.mctk-det[open]>summary{border-bottom:1px solid var(--cream-d)}.mctk-det .mctk-grid{margin:0;padding:8px 12px 10px}.mctk-det .mctk-f{grid-template-columns:minmax(90px,34%) 1fr;gap:6px}",
      ".mctk-load{margin:0 0 8px;font-size:.76rem;color:var(--gray)}",
      ".mctk-lcard>b{display:block}.mctk-ln{padding:9px 26px 9px 12px}",
      ".mctk-foot{flex-direction:column;align-items:stretch}#mctk-tot{flex:0 0 auto!important;margin-left:auto;width:max-content;max-width:100%}.mctk-tot{margin-left:auto;max-width:100%!important;width:max-content;font-size:.8rem!important;color:var(--gray);gap:2px 12px!important}.mctk-tot b{font-weight:600;color:var(--navy-d)}.mctk-tot .big{font-size:1rem!important;color:var(--navy-d)}.mctk-tot .mctk-saldo{color:#C98A00;font-weight:800;font-size:.95rem}.mctk-tot .mctk-hide-m{display:none}",
      "#mctk-addlink{display:inline-flex;margin:8px 0 4px;font-weight:700}}",
      "@media(min-width:861px){.mctk-estados,.mctk-load{display:none}.mctk-ini,.mctk-badge{display:inline-flex}}",

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
  function staffLista() {
    var L = (K.d && K.d.staff) || window._tkStaff || [];
    if (L.length) return L;
    try { L = JSON.parse(localStorage.getItem("sunsu_users") || "[]") || []; } catch (x) { L = []; }
    return L.map(function (u) { return { id: u.id, nombre: u.nombre || u.name, short: u.short, rol: u.rol || u.role, etiqueta: u.short || u.nombre || u.name }; });
  }
  function campo(k, lbl, opts) {
    opts = opts || {};
    var v = val(k), ed = K.d.puedeEditar || K.d.puedePedir, mod = K.datos && K.datos[k] != null;
    var shown = opts.fmt ? opts.fmt(v) : v;
    if (k === "cosmetologa" && K.d && K.d.puedeEditar && !opts.ro) {
      var staff = staffLista(), hay = false, optsH = staff.map(function (u) {
        var nom = u.nombre || u.name || "", etq = u.etiqueta || u.short || nom;
        var on = nom === v || (u.short && u.short === v) || (u.id && u.id === v);
        if (on) hay = true;
        return '<option value="' + e(nom) + '"' + (on ? " selected" : "") + ">" + e(etq) + "</option>";
      }).join("");
      if (v && !hay) optsH = '<option value="' + e(v) + '" selected>' + e(v) + "</option>" + optsH;
      return '<div class="mctk-f"><dt>' + e((window.MCEmojiCampo ? window.MCEmojiCampo(lbl) : lbl)) + '</dt><dd data-k="cosmetologa"><select class="mctk-in mctk-cosm"' + (mod ? ' data-mod="1"' : "") + ">" + optsH + "</select></dd></div>";
    }
    var html0 = k === "cosmetologa" && shown && window.MCColor ? window.MCColor.pill(shown) : null;
    var edit = ed && !opts.ro;
    return '<div class="mctk-f"><dt>' + e((window.MCEmojiCampo ? window.MCEmojiCampo(lbl) : lbl)) + '</dt><dd data-k="' + e(k) + '"><span class="v' + (mod ? " mod" : "") + (edit ? ' mctk-ed" data-ed="' + e(k) + '" tabindex="0" title="Clic para editar' : "") + '">' + (html0 || (shown ? e(shown) : '<span class="mccf-sub">—</span>')) + "</span></dd></div>";
  }
  function ro(lbl, v) { return '<div class="mctk-f"><dt>' + e((window.MCEmojiCampo ? window.MCEmojiCampo(lbl) : lbl)) + "</dt><dd>" + (v ? v : '<span class="mccf-sub">—</span>') + "</dd></div>"; }
  function esMovilTk() { return !(window.matchMedia && window.matchMedia("(min-width: 861px)").matches); }
  function pagosFaltanVista() {
    if (K.d && K.d.pagosFaltan && K.d.pagosFaltan.length) return K.d.pagosFaltan;
    var t = filaDeLista(K.d && K.d.clave), L, i;
    try { L = t && (typeof window._tkLedOf === "function" ? window._tkLedOf(t) : null); } catch (x) { L = null; }
    return (L && L.pagosFaltan) || [];
  }
  function voucherBtnHtml(item) {
    var lab = (item && item.etiqueta) || "Voucher";
    var id = item && item.id ? String(item.id) : "";
    return '<label class="btn ghost small mctk-voucher" title="' + e(lab) + '" aria-label="' + e(lab) + '"><span class="mctk-cam" aria-hidden="true">📷</span><span class="mctk-vlab">' + e(lab) + '</span><input type="file" class="mctk-voucher-inp" accept="image/*,application/pdf" hidden' + (id ? ' data-pago-id="' + e(id) + '"' : "") + "></label>";
  }
  function voucherBtnsHtml() {
    var F = pagosFaltanVista(), i, h = "";
    if (!F.length) return "";
    for (i = 0; i < F.length; i++) h += voucherBtnHtml(F[i]);
    return h;
  }
  function chipsHtml() { return (K.d.chips || []).map(function (c) { return pill(c.c, c.t); }).join(""); }
  function chipDe(kOrTxt) {
    var C = K.d.chips || [], i, c, k = String(kOrTxt || "").toLowerCase();
    for (i = 0; i < C.length; i++) {
      c = C[i];
      if (c && (String(c.k || "").toLowerCase() === k || String(c.t || "").toLowerCase() === k || String(c.c || "").toLowerCase() === k)) return c;
    }
    return null;
  }
  function estadoResumen() {
    var C = K.d.chips || [], F = K.d.flags || [], falta = K.d.faltan || [], c;
    if ((F && F.length) || chipDe("flag") || chipDe("por corregir")) return { t: "Por corregir", tone: "rojo" };
    c = chipDe("anulado") || chipDe("cancelado");
    if (c) return { t: c.t, tone: "rojo" };
    if (falta && falta.length) return { t: "Falta documento", tone: "amarillo" };
    c = chipDe("porcobrar") || chipDe("por cobrar");
    if (c) return { t: c.t, tone: "amarillo" };
    c = chipDe("sinfactura") || chipDe("sin factura");
    if (c) return { t: c.t, tone: "amarillo" };
    c = chipDe("estado") || C[0];
    return { t: c ? c.t : "", tone: "" };
  }
  function estadosHtml() {
    var pills = chipsHtml(), r, sum;
    if (!pills) return "";
    r = estadoResumen();
    sum = "Estado" + (r.t ? " · " + r.t : "");
    return '<div class="mctk-pills mctk-pills-desk">' + pills + "</div>" +
      '<details class="mctk-estados' + (r.tone ? " mctk-est-" + r.tone : "") + '"><summary>' + e(sum) + "</summary><div class=\"mctk-pills\">" + pills + "</div></details>";
  }
  function accionesItemsHtml() {
    var d = K.d, t = d.ticket;
    return (voucherBtnsHtml() ? '<div class="mctk-acc-sec">Comprobante</div>' + voucherBtnsHtml() : '') +
      '<div class="mctk-acc-sec">Documentos</div>' + docsHtml2() +
      '<div class="mctk-acc-sec">WhatsApp</div>' + waHtml() +
      '<div class="mctk-acc-sec">Ticket</div>' +
      '<button type="button" id="mctk-print">Imprimir</button>' +
      '<button type="button" id="mctk-excl">Excluir comisión</button>' +
      (d.admin && window.MCMultas ? '<button type="button" id="mctk-multa">⚠️ Aplicar multa</button>' : "") +
      (d.puedeCancelar ? '<button type="button" class="mctk-cancel" id="mctk-cancelar">🗑️ Eliminar ticket</button>' : "") +
      (!d.puedeCancelar && d.puedePedir && !(t && t.cancelado) && !(d.edicion && d.edicion.id) ? '<button type="button" class="mctk-cancel" id="mctk-solcancel">🗑️ Eliminar ticket</button>' : "");
  }
  function accionesHtml() {
    var d = K.d, t = d.ticket;
    var back = '<button class="btn ghost small" type="button" id="mctk-volver">' + (sessionStorage.getItem("mctk.volver") ? "← Clienta" : "← Lista") + "</button>";
    if (esMovilTk()) {
      return '<div class="mctk-bar mctk-bar-m">' + back + editarMiniHtml() +
        '<div class="mctk-menu mctk-acc-wrap"><button class="btn ghost small mctk-acc-btn" type="button" data-menu="mctk-acc">Acciones ▾</button><div class="mctk-dd" id="mctk-acc" hidden>' + accionesItemsHtml() + "</div></div></div>";
    }
    return '<div class="mctk-bar">' + back + '<span class="mctk-bar-sp" style="flex:1"></span>' + editarMiniHtml() +
      voucherBtnsHtml() +
      '<div class="mctk-menu"><button class="btn ghost small" type="button" data-menu="mctk-dd">Documentos ▾</button><div class="mctk-dd" id="mctk-dd" hidden>' + docsHtml2() + "</div></div>" +
      '<div class="mctk-menu"><button class="btn ghost small" type="button" data-menu="mctk-wa">WhatsApp ▾</button><div class="mctk-dd" id="mctk-wa" hidden>' + waHtml() + "</div></div>" +
      '<button class="btn ghost small" type="button" id="mctk-print">Imprimir</button><button class="btn ghost small" type="button" id="mctk-excl">Excluir comisión</button>' + (d.admin && window.MCMultas ? '<button class="btn ghost small" type="button" id="mctk-multa">⚠️ Aplicar multa</button>' : "") + (d.puedeCancelar ? '<button class="btn ghost small mctk-cancel" type="button" id="mctk-cancelar">🗑️ Eliminar ticket</button>' : "") + (!d.puedeCancelar && d.puedePedir && !(t && t.cancelado) && !(d.edicion && d.edicion.id) ? '<button class="btn ghost small mctk-cancel" type="button" id="mctk-solcancel">🗑️ Eliminar ticket</button>' : "") + "</div>";
  }
  function filaDeLista(clave) {
    var k = String(clave || ""), list = window._histVisibles || window._histData || [], i, t, cards, id;
    for (i = 0; i < list.length; i++) {
      t = list[i];
      if (claveDeFila(t) === k) return t;
    }
    cards = window._tkCards || {};
    for (id in cards) if (Object.prototype.hasOwnProperty.call(cards, id) && claveDeFila(cards[id]) === k) return cards[id];
    return null;
  }
  function claveDeFila(t) { return (t && t.so_num) || (t && t.tkRow ? "r" + t.tkRow : ""); }
  function cacheLineasClave(clave, lineas) {
    var k = String(clave || "");
    if (!k || !lineas || !lineas.length) return;
    window._tkLineasCache = window._tkLineasCache || {};
    window._tkLineasCache[k] = lineas;
  }
  function cacheLineasLista(items) {
    (items || []).forEach(function (it) {
      cacheLineasClave(claveDeFila(it) || it.clave, it.lineas);
    });
  }
  function lineasCacheDe(clave) {
    var k = String(clave || "");
    if (window._tkLineasCache && window._tkLineasCache[k] && window._tkLineasCache[k].length) return window._tkLineasCache[k];
    var t = filaDeLista(k);
    if (t && t.lineas && t.lineas.length) return t.lineas;
    return null;
  }
  function chipsDesdeLista(t) {
    var out = [], L = (typeof window._tkLedOf === "function" ? window._tkLedOf(t) : null) || {}, orig = (t && t.orig) || {};
    try { if (typeof _tkEstados === "function") out = _tkEstados(t).map(function (c) { return { k: (c.t || "").toLowerCase(), t: c.t, c: c.c }; }); } catch (x) { out = []; }
    if (!out.length) {
      var an = !!(t && (t.anulado === true || orig.anulado === true));
      var cer = an || (t && t.fac && t.cob) || (t && t.estado_doc === "cerrado");
      out.push({ k: "estado", t: an ? "Cancelado" : cer ? "Cerrado" : "Abierto", c: an ? "anulado" : cer ? "cerrado" : "abierto" });
      if (t && t.sin_cobro) out.push({ k: "sincobro", t: t.sin_cobro === "interno" ? "Consumo interno" : t.sin_cobro === "canje" ? "Canje de paquete" : "Cortesía", c: "neutro" });
      else {
        out.push({ k: "cobro", t: (t && (t.cob || (L && L.p))) ? "Pagado" : "Por cobrar", c: (t && (t.cob || (L && L.p))) ? "pagado" : "porcobrar" });
        out.push({ k: "fac", t: (t && (t.fac || (L && L.factura))) ? "Facturado" : "Sin factura", c: (t && (t.fac || (L && L.factura))) ? "facturado" : "sinfactura" });
      }
    }
    if (L.r) out.push({ k: "rep", t: "Reporte enviado", c: "ok" });
    if (L.g) out.push({ k: "reag", t: "Reagendada", c: "ok" });
    if (t && /^\s*SI\b/i.test(String(t.paquete || ""))) out.push({ k: "paq", t: "Paquete " + String(t.paquete).replace(/^\s*SI,?\s*/i, ""), c: "info" });
    if (L.flag) out.push({ k: "flag", t: "Por corregir", c: "anulado" });
    return out;
  }
  function previewDe(clave) {
    var k = String(clave || ""), d, raw, t;
    if (window._tkVista && window._tkVista[k] && window._tkVista[k].ok) {
      try { d = JSON.parse(JSON.stringify(window._tkVista[k])); } catch (x) { d = window._tkVista[k]; }
      if (d && !(d.lineas && d.lineas.length)) { var c0 = lineasCacheDe(k); if (c0) d.lineas = c0; }
      return d;
    }
    try { raw = sessionStorage.getItem("sunsu.tk." + k); if (raw) { d = JSON.parse(raw); if (d && d.ok) { if (!(d.lineas && d.lineas.length)) { var c1 = lineasCacheDe(k); if (c1) d.lineas = c1; } return d; } } } catch (x) {}
    t = filaDeLista(k);
    return t ? sintetizar(t, k) : null;
  }
  function sintetizar(t, clave) {
    var tot = 0, fac = "", forma = "", pagado = false, L = (typeof window._tkLedOf === "function" ? window._tkLedOf(t) : null) || {};
    try { tot = typeof _histMontos === "function" ? _histMontos(t).tot : (parseFloat(t.estimado != null ? t.estimado : t.total) || 0); } catch (x) { tot = parseFloat(t.estimado || t.total) || 0; }
    try { fac = typeof _tkFacFull === "function" ? (_tkFacFull(t) || "") : String(t.factura || t.fac_7 || ""); } catch (x) { fac = String(t.factura || t.fac_7 || ""); }
    try { forma = typeof _tkForma === "function" ? (_tkForma(t) || "") : ""; } catch (x2) {}
    pagado = !!(t.cob || L.p || (typeof _tkPagoMigo === "function" && _tkPagoMigo(t)));
    return {
      ok: true, clave: clave, hidratando: true, admin: !!(typeof CU !== "undefined" && CU && (CU.role === "admin" || CU.role === "admin_master" || CU.role === "super_admin")),
      ticket: { clave: clave, id: t.id || null, soNum: t.so_num || "", betaNum: t.beta_num || "", sheetRow: t.tkRow || t.sheet_row || null, fecha: t.fecha || "", hora: t.hora || "", nombre: t.nombre || "", apellido: t.apellido || "", cedula: t.cedula || t.id_3 || "", cosmetologa: t.cosmetologa || t.atendido_por || "", cobradoSistema: tot, factura: fac, notas: t.notas || t.notas_generales || "", cancelado: (t.anulado || (t.orig && t.orig.anulado)) ? { motivo: (t.orig && t.orig.cancelado_motivo) || "", por: (t.orig && t.orig.cancelado_por) || "", ts: (t.orig && t.orig.cancelado_ts) || "" } : null },
      info: { factura: fac, nombre: t.nombre || "", apellido: t.apellido || "", cedula: t.cedula || t.id_3 || "", cosmetologa: t.cosmetologa || t.atendido_por || "", notas: t.notas || t.notas_generales || "", local: t.local || "Sunsu Spa", fecha: t.fecha || "", hora: t.hora || "", orden: t.id || null, cabina: t.cabina || "", retorno: t.retorno || t.fecha_retorno || "", recomendaciones: t.recomendaciones || "" },
      lineas: lineasCacheDe(clave) || t.lineas || [], totales: { subtotal: tot / 1.15, iva: tot - tot / 1.15, total: tot },
      descuento: { tipo: null, valor: 0 }, promo: "", pagos: { metodos: forma ? [{ metodo: forma }] : [], cobrado: pagado, total: tot, pagado: pagado ? tot : 0, saldo: pagado ? 0 : tot },
      chips: chipsDesdeLista(t), documentos: [], faltan: (L.falta && L.falta.length) ? L.falta : [], flags: L.flag ? [{ id: "", motivo: L.flag }] : [], reagendada: { si: !!L.g, cita: "", fuente: "" },
      puedeEditar: !!(typeof CU !== "undefined" && CU && (CU.role === "admin" || CU.role === "admin_master" || CU.role === "super_admin") && !t.anulado), puedePedir: !(typeof CU !== "undefined" && CU && (CU.role === "admin" || CU.role === "admin_master" || CU.role === "super_admin")), puedeCancelar: !!(typeof CU !== "undefined" && CU && (CU.role === "admin" || CU.role === "admin_master" || CU.role === "super_admin") && !t.anulado),
      clienteKey: t.clienteKey || t.cliente_key || "",
      pagosFaltan: (L && L.pagosFaltan) || []
    };
  }
  function guardarVista(d) {
    if (!d || !d.ok || !d.clave) return;
    window._tkVista = window._tkVista || {};
    window._tkVista[d.clave] = d;
    if (d.lineas && d.lineas.length) cacheLineasClave(d.clave, d.lineas);
    try {
      var slim = { ok: d.ok, clave: d.clave, admin: d.admin, ticket: d.ticket, info: d.info, lineas: d.lineas, totales: d.totales, descuento: d.descuento, promo: d.promo, pagos: d.pagos, chips: d.chips, documentos: d.documentos, faltan: d.faltan, flags: d.flags, reagendada: d.reagendada, puedeEditar: d.puedeEditar, puedePedir: d.puedePedir, puedeCancelar: d.puedeCancelar, clienteKey: d.clienteKey, excluirCosmetologa: d.excluirCosmetologa, excluirNota: d.excluirNota, campos: d.campos, giftcards: d.giftcards, paquete: d.paquete, pagosFaltan: d.pagosFaltan, cuadre_lineas: d.cuadre_lineas, cuadre: d.cuadre, justificacion_descuento: d.justificacion_descuento, edicion: d.edicion };
      sessionStorage.setItem("sunsu.tk." + d.clave, JSON.stringify(slim));
    } catch (x) {}
  }
  function waIco() { return (typeof WA_ICON_SVG !== "undefined" && WA_ICON_SVG) || ""; }
  function waHtml() {
    var d = K.d, p = d.paquete || {}, G = d.giftcards || [], ico = waIco();
    var conPaq = (window.SunsuWa && SunsuWa.conPaq(p)) || !!(p.vigentes && p.vigentes.length) || !!p.uso || !!p.compra || !!(p.delTicket && p.delTicket.length);
    var conGc = (G || []).some(function (g) { return g.uso === "vendida"; });
    return '<button type="button" data-wa="facial">' + ico + ' Enviar reporte facial</button>' +
      (conPaq ? '<button type="button" data-wa="paquete">' + ico + ' Enviar reporte de paquete</button>' : "") +
      (conGc ? '<button type="button" data-wa="giftcard">' + ico + ' Enviar gift card</button>' : "") +
      '<button type="button" data-wa="chat">' + ico + ' Abrir chat</button>';
  }
  /* TK156 (Emilia t692u): en el mismo ticket se ve todo — fotos de la clienta, vouchers y PDFs — con vista previa
     (sin salir de la app). Miniaturas desde la caché de fotos de la lista (0 ms); lo que falte llega en lote. */
  function idFoto(u) {
    u = String(u || "");
    if (/^archivo:/.test(u)) return u.slice(8);
    var m = u.match(/[-\w]{25,}/); return m ? m[0] : "";
  }
  function thPrev(x, etq) {
    var id = idFoto(x.url), c = (id && typeof window._fotoThumbGet === "function") ? window._fotoThumbGet(id) : "";
    var esImg = !/\.pdf(\?|$)/i.test(String(x.url || "")) && x.tipo !== "factura";
    return '<button type="button" class="mctk-pv-th" data-pv="' + e(x.url) + '" data-pvn="' + e(x.nombre || etq) + '" title="' + e(x.nombre || etq) + '">' +
      (esImg && id ? '<img class="mob-th' + (c ? "" : " mob-th-wait") + '" alt="" ' + (c ? 'src="' + e(c) + '"' : 'data-arch="' + e(id) + '"') + ">" : '<span class="mctk-pv-ico" aria-hidden="true">' + (x.tipo === "factura" ? "📄" : "🧾") + "</span>") +
      '<span class="mctk-pv-l">' + e(etq) + "</span></button>";
  }
  function previasHtml() {
    var d = K.d || {}, docs = d.documentos || [], h = "";
    var fotos = docs.filter(function (x) { return x.tipo === "foto"; });
    var antes = fotos.filter(function (x) { return !/despu/i.test(x.nombre || ""); }), despues = fotos.filter(function (x) { return /despu/i.test(x.nombre || ""); });
    var comps = docs.filter(function (x) { return x.tipo === "comprobante"; }), facs = docs.filter(function (x) { return x.tipo === "factura"; });
    var fh = antes.map(function (x) { return thPrev(x, "Antes"); }).join("") + despues.map(function (x) { return thPrev(x, "Después"); }).join("");
    if (!fh && conTratamiento()) fh = '<span class="mctk-pv-falta">📷 Sin fotos de la clienta</span>';
    /* TK183 (Emilia t797u): agregar fotos Antes / Después a un ticket ya hecho (también cerrado). Quedan en el ticket y
       en la ficha de la clienta → Documentos → Fotos con la fecha del ticket. Sin capture: iPhone ofrece cámara o fototeca. */
    var vista = !!(window.state && window.state.vista);
    var add = (d.clave && !vista) ? '<div class="mctk-addfotos"><label class="btn ghost small mctk-addf" title="Agregar fotos de ANTES">📷 Agregar fotos Antes<input type="file" accept="image/*" multiple hidden class="mctk-fotos-inp" data-mom="antes"></label><label class="btn ghost small mctk-addf" title="Agregar fotos de DESPUÉS">📷 Agregar fotos Después<input type="file" accept="image/*" multiple hidden class="mctk-fotos-inp" data-mom="despues"></label></div>' : "";
    if (fh || add) h += '<div class="mctk-pv-sec"><div class="mctk-pv-t">Fotos de la clienta</div>' + (fh ? '<div class="mctk-pv-row">' + fh + "</div>" : "") + add + "</div>";
    var vh = comps.map(function (x, i) { return thPrev(x, "Voucher " + (i + 1)); }).join("") + facs.map(function (x) { return thPrev(x, x.factura ? "Fac. " + String(x.factura).split("-").pop().replace(/^0+/, "") : "Factura"); }).join("");
    // TK157: lectura Claude Vision de cada voucher (verde cuadra / rojo descuadre / botón «🔍 Leer voucher»).
    var clv = (d.ticket && d.ticket.clave) || d.clave || "";
    var och = window.MCOcr ? comps.filter(function (x) { return !/\.pdf(\?|$)/i.test(String(x.url || "")); }).map(function (x) { return window.MCOcr.chip(x, clv); }).join("") : "";
    if (vh) h += '<div class="mctk-pv-sec"><div class="mctk-pv-t">Voucher y factura</div><div class="mctk-pv-row">' + vh + "</div>" + (och ? '<div class="mctk-pv-ocr" id="mctk-pv-ocr">' + och + "</div>" : "") + "</div>";
    var t = d.ticket || {}, pdf = "";
    if (t.sheetRow || t.cliente || conTratamiento()) pdf += '<button type="button" class="mctk-pv-pdf" data-doc="tarjeta">📄<span>Tarjeta del cliente</span></button>';
    var pq0 = d.paquete || {}; if ((window.SunsuWa && SunsuWa.conPaq(pq0)) || (pq0.vigentes && pq0.vigentes.length) || pq0.uso || pq0.compra || (pq0.delTicket && pq0.delTicket.length)) pdf += '<button type="button" class="mctk-pv-pdf" data-doc="paquete">🎴<span>Control de paquete</span></button>';
    (d.giftcards || []).filter(function (g) { return g.uso === "vendida" || g.uso === "usada" || g.uso === "canjeada"; }).forEach(function (g) { pdf += '<button type="button" class="mctk-pv-pdf" data-doc="gc" data-cod="' + e(g.codigo) + '">🎁<span>Gift card ' + e(g.codigo) + "</span></button>"; });
    if (pdf) h += '<div class="mctk-pv-sec"><div class="mctk-pv-t">PDFs</div><div class="mctk-pv-row">' + pdf + "</div></div>";
    return h ? '<div class="mccf-card mctk-prev" id="mctk-prev"><div class="mctk-pv-h">📎 Fotos, voucher y documentos</div>' + h + "</div>" : "";
  }
  function docsHtml2() {
    var d = K.d, t = d.ticket, h = "";
    // Siempre que el ticket tenga facial/servicio (o datos del tratamiento), aunque no tenga fila en la hoja ni tarjeta enviada.
    if (t.sheetRow || conTratamiento()) h += '<button type="button" data-doc="tarjeta">📄 Tarjeta del tratamiento (PDF)</button>';
    var pq0 = d.paquete || {}; if ((window.SunsuWa && SunsuWa.conPaq(pq0)) || (pq0.vigentes && pq0.vigentes.length) || pq0.uso || pq0.compra || (pq0.delTicket && pq0.delTicket.length)) h += '<button type="button" data-doc="paquete">🎴 Reporte del paquete (PDF)</button>';
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
  function catDe(l) {
    var C = K.cat || [];
    return C.find(function (p) { return p.tipo === l.tipo && p.sku === l.sku; }) || C.find(function (p) { return p.sku === l.sku; }) || null;
  }
  function esSuperAdminCu() {
    return !!(typeof CU !== "undefined" && CU && CU.role === "super_admin");
  }
  function fotoLinea(l) {
    var c = catDe(l);
    if (c && c.foto) return '<img class="mctk-ph" src="' + e(c.foto) + '" alt="" loading="lazy">';
    var badge = l.tipo === "facial" ? "F" : (l.tipo === "extra" || l.tipo === "servicio") ? "E" : l.tipo === "paquete" ? "P" : l.tipo === "gift" ? "G" : "";
    if (badge) return '<span class="mctk-ph mctk-badge mctk-badge-' + badge + '" aria-hidden="true">' + badge + "</span>";
    var ini = String((l && l.nombre) || (l && l.sku) || "?").trim().charAt(0).toUpperCase() || "?";
    return '<span class="mctk-ph mctk-ini" aria-hidden="true">' + e(ini) + "</span>";
  }
  function textoCanje(l) {
    var pq = String((l && l.paqueteSesion) || "").trim();
    var code = "";
    try { code = String(codigoVisible(l) || "").trim(); } catch (e0) { code = String((l && (l.sku || l.codigo)) || "").trim(); }
    var bits = [];
    if (code && !/^canje\b/i.test(code) && code.toLowerCase() !== pq.toLowerCase()) bits.push(code);
    if (pq && !/^canje$/i.test(pq)) {
      bits.push(/^canje\b/i.test(pq) ? pq : (/^PQ[- ]?/i.test(pq) ? ("Canje paquete " + pq) : ("Canje paquete " + pq)));
    } else {
      bits.push("Canje");
    }
    bits.push("OK sin factura");
    var clean = [];
    bits.forEach(function (p) {
      var cur = String(p || "").trim();
      if (!cur) return;
      var prev = clean[clean.length - 1] || "";
      if (prev && prev.toLowerCase() === cur.toLowerCase()) return;
      if (prev && /^canje$/i.test(prev) && /^canje\b/i.test(cur)) { clean[clean.length - 1] = cur; return; }
      if (prev && /^canje\b/i.test(prev) && /^canje$/i.test(cur)) return;
      clean.push(cur);
    });
    return clean.join(" · ");
  }
  function stockTxt(l) {
    if (l.canje || l.paqueteSesion || (l.tipo === "facial" && !(Number(l.precio_unit) > 0))) {
      if (l.canje || l.paqueteSesion) return '<div class="mctk-stk">' + e(textoCanje(l)) + "</div>";
      return '<div class="mctk-stk">Facial</div>';
    }
    if (l.consumoInterno && !(Number(l.precio_unit) > 0)) return '<div class="mctk-stk">Consumo interno</div>';
    if (l.cortesia && !(Number(l.precio_unit) > 0)) return '<div class="mctk-stk">Cortesía</div>';
    if (l.tipo === "facial") return '<div class="mctk-stk">Facial</div>';
    if (l.tipo === "extra" || l.tipo === "servicio") return '<div class="mctk-stk">Extra</div>';
    if (l.tipo === "paquete") return '<div class="mctk-stk">Paquete</div>';
    if (l.tipo !== "producto") return "";
    var c = catDe(l);
    var st = c && (c.stockVenta != null && c.stockVenta !== "" ? c.stockVenta : c.stock);
    if (st == null || st === "") return "";
    var n = Number(st);
    var cls = n > 0 ? " mctk-stk-ok" : " mctk-stk-0";
    return '<div class="mctk-stk' + cls + '">📦 BODEGA VENTA: Stock ' + e(q2(st)) + "</div>";
  }
  function metaLineaHtml(l) {
    var parts = [];
    var code = codigoVisible(l);
    var tipo = "";
    if (l.tipo === "extra" || l.tipo === "servicio") tipo = "Extra";
    else if (l.tipo === "facial") tipo = "Facial";
    else if (l.tipo === "paquete") tipo = "Paquete";
    else if (l.tipo === "gift") tipo = "Gift card";
    else if (typeof esMejora === "function" && esMejora(l)) tipo = "Diferencia por mejora";
    if (l.canje || l.paqueteSesion) {
      return '<div class="mctk-meta">' + e(textoCanje(l)) + "</div>";
    } else {
      if (code) parts.push(code);
      if (tipo && l.tipo !== "producto") parts.push(tipo);
    }
    if (l.consumoInterno && !(l.total_linea > 0) && parts.indexOf("Consumo interno") < 0) parts.push("Consumo interno");
    else if (l.cortesia && !(l.total_linea > 0) && parts.indexOf("Cortesía") < 0) parts.push("Cortesía");
    if (l.valorNominal > 0 && l.tipo === "gift") parts.push("valor nominal " + $m(l.valorNominal));
    if (l.excluir_comision) parts.push("sin comisión");
    if (l.promo && l.descuento_valor > 0) parts.push(String(l.promo));
    var html = e(parts.filter(Boolean).join(" · "));
    if (l.tipo === "producto" && !(l.canje || l.paqueteSesion)) {
      var c = catDe(l);
      var st = c && (c.stockVenta != null && c.stockVenta !== "" ? c.stockVenta : c.stock);
      if (st != null && st !== "") {
        var nSt = Number(st);
        var cls = nSt > 0 ? " mctk-stk-ok" : " mctk-stk-0";
        html += (html ? " · " : "") + '<span class="mctk-stk' + cls + '">Stock Venta: ' + e(q2(st)) + "</span>";
      }
    }
    return '<div class="mctk-meta">' + html + "</div>";
  }
  /** TK43 (Emilia t486u, como MineCore mcIrBtn): botoncito sutil ↗ que abre la ficha del producto de la línea. */
  function prodIdLinea(l) {
    var c = catDe(l);
    return c && c.productoId ? String(c.productoId) : "";
  }
  function irProdBtn(l) {
    var id = prodIdLinea(l);
    return id ? '<a href="#/m/productos/p/' + e(id) + '" class="mctk-irp" data-irp="' + e(id) + '" title="Ir al producto" aria-label="Ir a la ficha del producto">↗</a>' : "";
  }
  function codigoVisible(l) {
    var c = catDe(l);
    if (c && c.skuVisible) {
      var vis = String(c.skuVisible);
      if (c.codigoInterno && String(c.codigoInterno) !== vis) vis += " · " + c.codigoInterno;
      return vis;
    }
    var s0 = String(l.sku || "");
    return (l.tipo === "facial" || l.tipo === "extra" || l.tipo === "servicio" || l.tipo === "paquete") && /^\d+$/.test(s0) ? "SUNSU-" + s0 : s0;
  }
  function skuLineaTxt(l) {
    var code = codigoVisible(l);
    var tipo = l.tipo && l.tipo !== "producto" ? " · " + (esMejora(l) ? "Diferencia por mejora" : (TIPO[l.tipo] || l.tipo)) : "";
    var extra = "";
    if (l.consumoInterno && !(l.total_linea > 0)) extra += " · Consumo interno";
    else if (l.cortesia && !(l.total_linea > 0)) extra += " · Cortesía";
    if (l.valorNominal > 0 && l.tipo === "gift") extra += " · valor nominal " + $m(l.valorNominal);
    if (l.excluir_comision) extra += " · sin comisión";
    if (l.promo && l.descuento_valor > 0) extra += " · " + l.promo;
    return code + tipo + extra;
  }
  /** Por línea: subtotal sin IVA, IVA y total con IVA. */
  function montos(l) { var tot = r2(Number(l.total_linea) || 0), sub = net(tot); return { sub: sub, iva: r2(tot - sub), tot: tot }; }
  function etqLinea(l) { return l.consumoInterno && !(l.total_linea > 0) ? ' <span class="mctk-canje" style="color:#56627A">Consumo interno</span>' : l.cortesia && !(l.total_linea > 0) ? ' <span class="mctk-canje" style="color:#2E8B57">Cortesía</span>' : l.canje && !(l.total_linea > 0) ? ' <span class="mctk-canje">Canje</span>' : ""; }
  function pintarMontos(tr, l) {
    var m = montos(l), q = function (x) { return tr.querySelector(x); };
    if (q("[data-tl]")) q("[data-tl]").textContent = $m(m.sub);
    if (q("[data-iva]")) q("[data-iva]").textContent = $m(m.iva);
    if (q("[data-tot]")) q("[data-tot]").textContent = $m(m.tot);
    if (q("[data-tot-m]")) q("[data-tot-m]").textContent = $m(m.tot);
    if (q("[data-mini]")) q("[data-mini]").textContent = "sub " + $m(m.sub) + " · IVA " + $m(m.iva);
  }
  function comisionDe(l) {
    if (l.excluir_comision) return 0;
    if (l.comision != null && l.comision !== "") return r2(Number(l.comision) || 0);
    var c = catDe(l);
    if (c && c.comision != null && c.comision !== "") return r2((Number(c.comision) || 0) * (Number(l.cantidad) || 0));
    return 0;
  }
  function subUbiDe(l) {
    if (l.canje || l.paqueteSesion || l.tipo === "paquete") return { lbl: "Paquete", val: l.paqueteSesion || "—" };
    if (l.tipo !== "producto") return { lbl: "Sububicación", val: "—" };
    var c = catDe(l);
    return { lbl: "Sububicación", val: (c && c.sububicacion) || "—" };
  }
  function cuadreCorto(cu) {
    if (!cu) return "";
    if (cu.estado === "ok" || cu.estado === "canje_ok") return '<span class="mctk-ok">✓<span class="mctk-ok-txt"> cuadrado</span></span>';
    if (cu.razon) return '<span class="mctk-bad">' + e(String(cu.razon).slice(0, 48)) + "</span>";
    return '<span class="mctk-bad">difiere</span>';
  }
  function cuadreDetalle(cu, l) {
    var just = (K.justif != null ? K.justif : (K.d && K.d.justificacion_descuento)) || "";
    if (cu && (cu.estado === "ok") && cu.factura) return "✓ Coincide con Fac. " + e(cu.factura);
    if (cu && cu.estado === "ok") return "✓ Coincide con Fac." + (K.d && K.d.cuadre && K.d.cuadre.factura ? " " + e(K.d.cuadre.factura) : "");
    if (l.canje || l.paqueteSesion || (cu && cu.estado === "canje_ok")) return "Canje · OK sin factura";
    var mot = (cu && cu.razon) ? cu.razon : (cu ? "No coincide con la factura" : "Sin cruce de factura");
    var html = '<span class="mctk-bad">' + e(mot) + "</span>";
    if (just && (l.descuento_valor > 0 || hayDescTicket())) html += " · " + e(just);
    return html;
  }
  function costoUtilHtml(l) {
    if (!esSuperAdminCu()) return "";
    var rows = (K.costos && K.costos.lineas) || [];
    var c = rows.find(function (x) { return String(x.sku) === String(l.sku); });
    if (!c) return '<div class="mctk-dr"><span>Costo / Util.</span><span class="mccf-sub">…</span></div>';
    var sub = net(l.total_linea);
    var util = r2(sub - (Number(c.costo_total) || 0));
    var pct = sub > 0 ? r2((util / sub) * 100) : 0;
    return '<div class="mctk-dr"><span>Costo / Util.</span><span>' + e($m(c.costo_total)) + " · Util. " + e($m(util)) + " (" + e(q2(pct)) + "%)</span></div>";
  }
  function leHtml(ed, campo, html, lbl) {
    if (!ed) return '<span class="mctk-cv">' + html + "</span>";
    return '<span class="mctk-dot" data-le="' + campo + '" tabindex="0" title="Clic para editar" aria-label="' + e(lbl) + '"><small hidden>' + e(lbl) + '</small><span class="mctk-cv">' + html + "</span></span>";
  }
  function asegurarCostos() {
    if (!esSuperAdminCu() || K.costos || K._costosPend || !(K.d && K.d.clave)) return;
    K._costosPend = api("tk_costos", { clave: K.d.clave }).then(function (r) {
      K.costos = (r && r.costos) || { lineas: [] };
      K._costosPend = null;
      pintarLin();
    }).catch(function () { K._costosPend = null; K.costos = { lineas: [] }; });
  }
  function lineasHtml() {
    calc();
    if (!K.L.length) return '<div class="mccf-sub" style="padding:12px">' + ((K.d && K.d.hidratando) ? "Cargando líneas…" : "Sin líneas.") + "</div>";
    var ed = !!(K.d.puedeEditar || K.d.puedePedir);
    K.open = K.open || {};
    var mapped = K.L.map(function (l, i) {
      var fijo = (l.cortesia || l.canje || l.consumoInterno) && !(l.precio_unit > 0);
      var esGift = l.tipo === "gift" && !(l.cortesia || l.canje);
      var precioNum = esGift ? l.precio_unit : net(l.precio_unit);
      var precio = e($m(precioNum));
      var m = montos(l);
      var mej = l.canje && !hayMejoraDe(l.sku) && ed ? '<button type="button" class="mctk-mej" data-mejora="' + i + '" title="Agregar diferencia por mejora (el facial vale más que el paquete)" aria-label="Agregar diferencia por mejora">＋$</button>' : "";
      var cu = ((K.d && K.d.cuadre_lineas) || []).find(function (x) { return x.ticket_i === i; }) || ((K.d && K.d.cuadre_lineas) || []).find(function (x) { return String(x.sku || "") && String(x.sku) === String(l.sku || "").replace(/^SUNSU-/i, ""); });
      var st = cu && cu.estado ? " " + cu.estado : "";
      if (!cu && (l.canje || l.paqueteSesion) && !(Number(l.total_linea) > 0)) st = " canje_ok";
      var dtxt = descTxt(l.descuento_tipo, l.descuento_valor);
      var descH = dtxt ? ' <span class="mctk-desc">−' + e(dtxt.charAt(0) === "$" ? dtxt : dtxt) + "</span>" : "";
      var open = !!K.open[i];
      var sub = subUbiDe(l);
      var precioLbl = esGift ? "P. con IVA" : "P. sin IVA";
      var editarVal = "Cant. " + leHtml(ed, "cantidad", e(q2(l.cantidad)), "Cant") +
        " · Precio " + leHtml(ed && !fijo, "precio_unit", precio, precioLbl) +
        " · Desc. " + leHtml(ed, "desc", e(dtxt || "0"), "Desc");
      var drop = '<div class="mctk-drop"' + (open ? "" : " hidden") + '>' +
        '<div class="mctk-dr"><span>Editar</span><span>' + editarVal + "</span></div>" +
        '<div class="mctk-dr"><span>' + e(sub.lbl) + "</span><span>" + e(sub.val) + "</span></div>" +
        '<div class="mctk-dr"><span>Comisión</span><span>' + e($m(comisionDe(l))) + "</span></div>" +
        '<div class="mctk-dr"><span>Cuadre</span><span>' + cuadreDetalle(cu, l) + "</span></div>" +
        costoUtilHtml(l) + "</div>";
      var xbtn = ed ? '<button class="mctk-x" type="button" data-del="' + i + '" title="Quitar línea" aria-label="Quitar línea">×</button>' : "";
      return '<div data-i="' + i + '" class="mctk-ln' + st + (open ? " open" : "") + '">' + xbtn +
        fotoLinea(l) +
        '<div class="mctk-r1"><span class="mctk-pn">' + e(l.nombre) + "</span>" + irProdBtn(l) + mej + "</div>" +
        metaLineaHtml(l) +
        '<div class="mctk-r4"><span class="mctk-qx">' + e(q2(l.cantidad)) + " × " + precio + descH + " " + cuadreCorto(cu) + "</span>" +
        '<button type="button" class="mctk-tog" data-tog="' + i + '" aria-expanded="' + (open ? "true" : "false") + '" aria-label="Ver detalle de la línea"><b class="mctk-ltot" data-tot-m>' + e($m(m.tot)) + '</b><span class="mctk-arr">' + (open ? "▴" : "▾") + "</span></button></div>" +
        drop + "</div>";
    }).join("");
    var fantasmas = ((K.d && K.d.cuadre_lineas) || []).filter(function (x) { return x.estado === "falta"; }).map(function (x) {
      return '<div class="mctk-ln falta" data-falta="1">' +
        '<span class="mctk-ph mctk-badge" aria-hidden="true">!</span>' +
        '<div class="mctk-r1"><span class="mctk-pn">' + e(x.nombre || x.codigo || x.sku) + "</span></div>" +
        '<div class="mctk-meta">' + e(x.codigo || x.sku) + '</div>' +
        '<div class="mctk-r4"><span class="mctk-qx mctk-cuadre-razon">' + e(x.razon || "Falta en ticket") + "</span></div></div>";
    }).join("");
    return mapped + fantasmas;
  }
  function hayDescTicket() {
    var tot = 0;
    (K.L || []).forEach(function (l) { tot += Number(l.descuento_monto || 0) || (l.descuento_valor > 0 ? 1 : 0); });
    if (K.desc && Number(K.desc.valor) > 0) tot += 1;
    if (K.d && Number((K.d.totales && K.d.totales.descuentoTotal) || (K.d.totales && K.d.totales.descuento) || 0) > 0.004) tot += 1;
    return tot > 0;
  }
  function justHtml() {
    if (!hayDescTicket()) return "";
    var v = (K.justif != null ? K.justif : (K.d && K.d.justificacion_descuento)) || "";
    return '<div class="mctk-just"><label for="mctk-just">¿Por qué se aplicó este descuento?</label>' +
      '<textarea id="mctk-just" required placeholder="Gift card, promo, F&amp;F, cortesía…">' + e(v) + "</textarea></div>";
  }
  function totHtml() {
    var c = calc(), d = K.d, pg = d.pagos || {}, desc = r2(c.promo + c.desc);
    var cobrado = r2(d.ticket && d.ticket.cobradoSistema || 0);
    var anulado = !!(d.ticket && d.ticket.cancelado);
    var difRnd = pg.cobrado && cobrado > 0 ? r2(c.total - cobrado) : 0;
    var redondeo = pg.cobrado && Math.abs(difRnd) > 0 && Math.abs(difRnd) <= 0.05;
    var total = redondeo ? cobrado : c.total;
    var iva = c.iva, sumNet = r2((K.L || []).reduce(function (a, l) { return a + net(l.total_linea); }, 0));
    // Primera pintura (lista/caché): si aún no hay líneas, usa los totales ya conocidos.
    if ((!K.L || !K.L.length) && d.totales && Number(d.totales.total) > 0) {
      total = r2(d.totales.total);
      iva = r2(d.totales.iva != null ? d.totales.iva : (total - net(total)));
      sumNet = r2(d.totales.subtotal != null ? d.totales.subtotal : net(total));
      cobrado = cobrado || total;
    }
    // TK156 (Emilia t695u, TK-SO-1927): nunca suma doble beta_pagos + cobrado del sistema/Migo por el mismo pago.
    var pag = pagadoTk(pg.cobrado, cobrado, K.pagoBeta);
    var saldo = anulado ? 0 : saldoPend(total, pag);
    var met = (pg.metodos || []).map(function (m) { return e(m.metodo) + (m.ref ? ' <span class="mccf-sub">' + e(m.ref) + "</span>" : ""); }).join(" · ");
    // TK68: todo lo de Sunsu es gravado 15 %: Subtotal, IVA 15 %, Total, Pagado, Saldo (sin «Subtotal 0 %» ni duplicados).
    // TK82: tickets migrados, el cobrado del sistema anterior es la verdad si |líneas − cobrado| ≤ $0.05: Total = cobrado, sin saldo amarillo.
    // TK104: en el celular no va «Pagado · Tarjeta…» ni forma de pago en el resumen; los pagos siguen abajo.
    return '<div class="mctk-tot"><span>Subtotal</span><b>' + $m(sumNet) + "</b>" + (desc ? "<span>Descuento" + (c.promo ? " (" + e(K.promo) + ")" : "") + "</span><b>−" + $m(net(desc)) + "</b>" : "") +
      "<span>IVA 15%</span><b>" + $m(iva) + "</b>" +
      (redondeo ? "<span>Ajuste por redondeo</span><b>" + (difRnd > 0 ? "−" : "+") + $m(Math.abs(difRnd)) + "</b>" : "") +
      '<span class="big">Total</span><b class="big">' + $m(total) + "</b>" +
      "<span>Pagado</span><b>" + $m(pag) + '</b><span>Saldo</span><b class="mctk-saldo"' + (saldo > 0.009 ? ' style="color:#C98A00"' : "") + ">" + $m(saldo) + "</b>" +
      (met ? '<span class="mccf-sub mctk-hide-m">Forma de pago</span><span class="mctk-hide-m" style="text-align:right;font-size:.8rem">' + met + "</span>" : "") +
      (!redondeo && Math.abs((c.total || total) - cobrado) > 0.009 ? '<span class="mccf-sub mctk-hide-m">Cobrado en el sistema</span><b class="mccf-sub mctk-hide-m">' + $m(cobrado) + "</b>" : "") + "</div>" +
      (d.costosVisibles ? '<p style="text-align:right;margin:6px 0 0"><a href="#" id="mctk-costos" class="mctk-link">Detalle de costos</a></p>' : "");
  }
  function cuadreDe() {
    return K.d.cuadre || null;
  }
  function flagsHtml() {
    var C = cuadreDe(), F = K.d.flags || [], fac = (C && C.factura) || (F[0] && F[0].factura) || "";
    if (C && C.texto) {
      var btn = "";
      if (F.length && K.d.puedeEditar) btn = F.map(function (f) { return ' <button type="button" class="btn ghost small" data-flag="' + e(f.id) + '">Marcar resuelto</button>'; }).join("");
      else if (F.length && !K.d.puedeEditar) btn = ' <span class="mccf-sub">Corrige con «Solicitar cambio»</span>';
      return '<div class="mctk-cuadre ' + (C.ok ? "ok" : "bad") + '">' + e(C.texto) + btn + "</div>";
    }
    if (!F.length) return "";
    var n = F.length, txt = n + (n === 1 ? " marca por corregir" : " marcas por corregir") + (fac ? " · fac. " + String(fac).replace(/^001-001-0+/, "") : "");
    var btn2 = F.length && K.d.puedeEditar ? F.map(function (f) { return ' <button type="button" class="btn ghost small" data-flag="' + e(f.id) + '">Marcar resuelto</button>'; }).join("") : "";
    return '<div class="mctk-cuadre bad">' + e(txt) + btn2 + "</div>";
  }
  function faltaHtml() {
    var F = K.d.faltan || []; if (!F.length || (K.d.flags || []).length) return "";
    var compBtns = voucherBtnsHtml();
    return '<div class="mctk-falta"><b>Falta: ' + e(F.join(" · ")) + "</b>" +
      (compBtns ? '<div>' + compBtns + ' <span class="mccf-sub">En el iPhone se abre el menú: Tomar foto, Fototeca o Archivos (también PDF). Cualquiera que vea el ticket puede subirla.</span></div>' : "") + "</div>";
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
    var PQ = (p.delTicket || []).slice();
    (p.vigentes || []).forEach(function (v) { if (!PQ.some(function (x) { return x.codigo === v.codigo; })) PQ.push(v); });
    if (p.uso || p.compra || PQ.length) h += '<div class="mccf-card"><b>Paquete</b><div class="mctk-grid1">' + (p.uso ? ro("Sesión en este ticket", e(p.uso)) : "") + (p.compra ? ro("Compra", e(p.compra)) : "") +
      PQ.map(function (v) { var lab = (v.codigo ? v.codigo + " · " : "") + (v.nombre || ""); var txt = v.usados + "/" + v.total + " usadas · " + (v.estado === "completo" ? "Completo" : "quedan " + v.pendientes); return ro(lab, v.id ? '<a href="#/m/gift/paquetes/' + encodeURIComponent(v.id) + '">' + e(txt) + "</a>" : e(txt)); }).join("") + "</div></div>";
    h += '<div class="mccf-card"><b>Reportes enviados</b>' + (E.length ? '<ul class="mctr-log">' + E.map(function (x) { return "<li>" + e(fechaIso(x.fecha)) + " · " + e(x.tipo) + " · " + e(x.por || "—") + "</li>"; }).join("") + "</ul>" : '<p class="mccf-sub">Todavía no se envía el reporte a la clienta.</p>') + "</div>";
    h += '<div class="mccf-card"><b>Historial</b>' + ((d.historial || []).length ? '<ul class="mctr-log">' + d.historial.slice().reverse().map(function (x) { return "<li>" + e(fechaIso(x.fecha)) + " · <b>" + e(x.accion) + "</b> · " + e(x.detalle) + " · " + e(x.actor) + (x.total != null ? " · total " + $m(x.total) : "") + "</li>"; }).join("") + "</ul>" : '<p class="mccf-sub">Sin cambios registrados. ' + (d.lineasBeta ? "" : "Las líneas salen del sistema; si el ticket tiene varias, el precio por línea es un estimado del total cobrado.") + "</p>") + "</div>";
    return h;
  }

  function editarMiniHtml() {
    var d = K.d || {}, t = d.ticket || {};
    if (t.cancelado || (d.edicion && d.edicion.id)) return "";
    if (!(d.puedePedir || d.puedeEditar)) return "";
    return '<button type="button" class="mctk-edit-mini" id="mctk-editar-form">Editar</button>';
  }
  // TK154 (Emilia t671u/t675u): la admin ve EXACTAMENTE qué se pide (Antes → Después o eliminar) y aprueba;
  // el ticket real no cambia hasta aprobar y después sigue bloqueado (lockdown) para el personal.
  function edicionHtml() {
    var d = K.d || {}, ed = d.edicion;
    if (!(ed && ed.id)) return "";
    var anular = ed.tipo === "anular", legacy = ed.tipo === "legacy" || ed.legacy;
    var titulo = anular ? "🚫 SOLICITUD PARA ELIMINAR TICKET" : legacy ? "Solicitud de edición (anterior)" : "✏️ Propuesta de edición · revisa los cambios";
    var h = '<div class="mccf-card mctk-edicion mctk-sol' + (anular ? " mctk-sol-anular" : "") + '" id="mctk-edicion">';
    h += '<div class="mctk-sol-h">' + titulo + "</div>";
    h += '<div class="mctk-sol-meta">Pedido por <b>' + e(ed.solicitante || "—") + "</b>" + (ed.creado ? " · " + e(fechaIso(ed.creado)) : "") + "</div>";
    if (ed.motivo) h += '<div class="mctk-sol-mot"><b>Motivo:</b> ' + e(ed.motivo) + "</div>";
    if (typeof window._tkPintarDiffEdicion === "function") h += window._tkPintarDiffEdicion(ed);
    if (d.admin) {
      h += '<p class="mctk-sol-lock">🔒 ' + (anular ? "Al aprobar, el ticket se elimina (queda Cancelado: sale de totales y comisiones)." : legacy ? "Esta solicitud no trae los cambios: al aprobar se cierra y tú editas el ticket a mano." : "Al aprobar se aplican exactamente estos cambios y el ticket sigue bloqueado.") + "</p>";
      h += '<div class="acts"><button type="button" class="btn small" id="mctk-edicion-ok">' + (anular ? "Aprobar y eliminar" : "Aprobar y aplicar") + '</button><button type="button" class="btn ghost small" id="mctk-edicion-no">Rechazar</button></div>';
    } else {
      h += '<p class="mccf-sub">🔒 Esperando que un admin apruebe. El ticket todavía no cambia.</p>';
    }
    return h + "</div>";
  }
  // TK154 (Emilia t675u): «Eliminar ticket» de las chicas pide aprobación; la admin elimina directo.
  function dlgSolicitarEliminar() {
    var d = K.d, t = d.ticket, box = document.createElement("div"); box.className = "mctk-dlg mctk-xdlg";
    box.innerHTML = '<div class="mctk-box"><div class="mctk-xh"><h3>🗑️ Eliminar ' + e(t.soNum || t.betaNum || "ticket") + '</h3><button type="button" class="mctk-xx" data-cerrar title="Cerrar">×</button></div>' +
      '<p class="mctk-sol-aviso">Se le solicitará al administrador eliminar este ticket.</p>' +
      '<p class="mccf-sub">El ticket no se borra ahora: queda igual (bloqueado) hasta que un admin lo apruebe.</p>' +
      '<label class="mctk-xlbl">Motivo (obligatorio)<input type="text" id="mctk-sem" maxlength="300" placeholder="Ej. Ticket ya realizado anteriormente / duplicado"></label>' +
      '<p class="err" id="mctk-seerr"></p><div class="mctk-acts" style="justify-content:flex-end;margin-top:6px"><button class="btn ghost small" type="button" data-cerrar2>Volver</button><button class="btn small mctk-cancel" type="button" id="mctk-seok">Solicitar eliminación</button></div></div>';
    document.body.appendChild(box);
    var cerrar = function () { box.remove(); };
    on(box, "[data-cerrar]", "onclick", cerrar); on(box, "[data-cerrar2]", "onclick", cerrar);
    box.onclick = function (ev) { if (ev.target === box) cerrar(); };
    on(box, "#mctk-seok", "onclick", async function () {
      var m = box.querySelector("#mctk-sem").value.trim(), err = box.querySelector("#mctk-seerr"), b = this;
      if (m.length < 3) { err.textContent = "Escribe el motivo"; return; }
      b.disabled = true; b.textContent = "Enviando…";
      try {
        var rr = await api("solicitud_crear", { tabla: "ticket_detalle", fila: d.clave, tipo: "eliminacion", motivo: m });
        if (!rr || rr.error) throw new Error((rr && rr.error) || "No se pudo enviar");
        box.remove();
        toast2(rr.prueba ? "Solicitud de simulación enviada a tu bandeja" : "📨 Se le solicitó al administrador eliminar este ticket");
        var nd = await api("tk_get", { clave: d.clave }); if (nd && nd.ok) { cargarEstado(nd); repintar(document.getElementById("main")); }
      } catch (x) { err.textContent = (x && x.message) || String(x); b.disabled = false; b.textContent = "Solicitar eliminación"; }
    });
  }
  function html() {
    var d = K.d, t = d.ticket, inf = d.info || {}, rg = d.reagendada || {};
    var num = t.soNum || t.betaNum || ("#" + t.sheetRow), fac = val("factura");
    var facPdf = (d.documentos || []).filter(function (x) { return x.tipo === "factura" && x.url; })[0];
    var reag = rg.si ? (rg.cita ? "Sí · " + fechaIso(rg.cita) : "Sí") : "No";
    return '<div id="mctk-root" class="mctk2">' + (d.falta ? '<p class="err">' + e(d.falta) + "</p>" : "") +
      accionesHtml() + edicionHtml() +
      (t.cancelado ? '<div class="mctk-canc"><b>🚫 Ticket cancelado</b>' + (t.cancelado.por ? " por " + e(t.cancelado.por) : "") + (t.cancelado.ts ? " · " + e(String(t.cancelado.ts).slice(0, 16).replace("T", " ")) : "") + (t.cancelado.motivo ? "<br>Motivo: " + e(t.cancelado.motivo) : "") + "<br><small>No suma en totales, comisiones ni dashboard. El stock de productos volvió a su bodega.</small></div>" : "") +
      flagsHtml() + faltaHtml() + voucherThumbsHtml() +
      (d.hidratando && !(K.L && K.L.length) ? '<p class="mctk-load" id="mctk-load">Cargando detalle…</p>' : "") +
      '<div class="mccf-card"><div class="mctk-top"><div><h1 class="mctk-num">' + e(num) + '</h1>' + ((d.info && (d.info.nombre || d.info.clienteCodigo)) ? '<div class="mctk-cli">' + e(((d.info.nombre || "") + " " + (d.info.apellido || "")).trim()) + (d.info.clienteCodigo ? ' · <a class="mctk-cod" href="#/m/clientes/c/' + encodeURIComponent(d.clienteKey || "") + '">' + e(d.info.clienteCodigo) + "</a>" : "") + "</div>" : "") + '<div class="mctk-fac" data-k="factura"><span' + ((d.puedeEditar || d.puedePedir) ? ' class="mctk-ed" data-ed="factura" tabindex="0" title="Clic para editar"' : "") + ">" + (fac ? "Factura " + e(fac) : '<span class="mccf-sub">' + ((d.chips || []).some(function (c) { return c && c.k === "sincobro"; }) ? "No se factura (en $0)" : "Sin factura") + "</span>") + "</span>" + (facPdf ? ' <button type="button" class="btn ghost small" data-pv="' + e(facPdf.url) + '" data-pvn="' + e(facPdf.nombre || ("Factura " + fac)) + '">📄 Ver factura</button>' : "") + "</div></div>" + estadosHtml() + "</div>" +
      '<details class="mctk-det"' + (esMovilTk() ? "" : " open") + '><summary>Detalles</summary><div class="mctk-grid"><dl>' + campo("nombre", "Nombre") + campo("apellido", "Apellido") + campo("cedula", "CI") + ((d.campos || []).some(function (c) { return c[0] === "email"; }) ? campo("email", "Email") + campo("telefono", "Teléfono") : "") + campo("cosmetologa", "Atendió") + campo("notas", "Notas") + campo("recomendaciones", "Recomendaciones") + "</dl>" +
      "<dl>" + ro("Fecha", e(fecha(inf.fecha, inf.hora))) + campo("local", "Local") + campo("cabina", "Cabina") + ro("Orden", e(inf.orden != null ? "#" + inf.orden : "")) + campo("retorno", "Fecha de regreso", { fmt: function (v) { return v ? fecha(v) : ""; } }) + campo("retornoTrat", "Tratamiento recomendado") + ro("Reagendada", e(reag)) +
      (d.clienteKey ? ro("Ficha", '<a href="#" id="mctk-ficha" class="mctk-link">Ver clienta</a>') : "") + "</dl></div></details>" +
      (d.excluirCosmetologa ? '<p class="mccf-note">Comisión excluida para ' + e(t.cosmetologa) + (d.excluirNota ? ": " + e(d.excluirNota) : "") + "</p>" : "") + "</div>" +
      '<div class="mccf-card mctk-lcard"><b>Líneas</b><div class="mctk-lwrap"><div id="mctk-lin" class="mctk-ls">' + lineasHtml() + "</div></div>" +
      (K.editandoLineas ? ('<a href="#" class="mctk-link mctk-addbtn" id="mctk-addlink">+ Agregar producto</a><div id="mctk-addbox" hidden><div class="mctk-scan" style="margin-top:6px"><input type="search" id="mctk-q" placeholder="Nombre, SKU o escanea el código" autocomplete="off"><button class="btn ghost small" type="button" id="mctk-cam" title="Leer con la cámara" aria-label="Leer con la cámara">📷</button></div><div class="mccf-hits" id="mctk-hits" hidden></div><div class="mctk-gcq" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0 0"><button type="button" class="btn small" id="mctk-gc65">Facial Premium $65.00 con IVA</button><label class="mccf-sub" style="display:flex;align-items:center;gap:4px">Valor con IVA $<input type="number" id="mctk-gcval" step="0.01" min="0" placeholder="150.00" style="width:88px"></label><button type="button" class="btn ghost small" id="mctk-gcadd">Agregar gift</button><button type="button" class="btn ghost small" id="mctk-caja">Agregar caja (+$3)</button></div><div id="mctk-gciva" class="mccf-sub" style="margin-top:4px"></div></div>') : "") +
      '<div class="mctk-foot">' + (K.editandoLineas ? ('<div class="mctk-adj"><button type="button" class="btn ghost small" id="mctk-promos">🏷️ Promociones</button>' + (K.promo ? '<label>Promoción anterior <select id="mctk-promo">' + opt("", "Sin promoción", K.promo) + (d.promos || []).map(function (p) { return opt(p.nombre, p.nombre, K.promo); }).join("") + (K.promo && !(d.promos || []).some(function (p) { return p.nombre === K.promo; }) ? opt(K.promo, K.promo + " (ya no vigente)", K.promo) : "") + "</select></label>" : "") +
      '<label>Descuento <input id="mctk-dv" type="text" inputmode="decimal" placeholder="10% o $5" title="Descuento del ticket: 10% o $5" value="' + e(descTxt(K.desc.tipo, K.desc.valor)) + '"></label>' + justHtml() + '</div>') : "") + '<div id="mctk-tot">' + totHtml() + '</div></div><div id="mctk-pagos"></div>' + previasHtml() +
      '<p class="err" id="mctk-err"></p><div class="mctk-acts" id="mctk-save"' + (K.dirty ? "" : " hidden") + ">" + (d.puedeEditar ? '<button class="btn small" type="button" id="mctk-guardar">Guardar cambios</button>' : '<span class="mctk-prop-note">Propuesta de edición — los cambios se aplicarán solo cuando un admin apruebe</span><button class="btn small" type="button" id="mctk-pedir">📨 Enviar propuesta para aprobación</button>') + '<button class="btn ghost small" type="button" id="mctk-descartar">Descartar</button></div></div>' +
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
  async function cargarCat(force) {
    var now = Date.now();
    if (!force && K.cat && K.catAt && now - K.catAt < 2500) return K.cat;
    var r = await api("tk_catalogo", {});
    if (r && r.items) { K.cat = r.items; K.catAt = Date.now(); }
    else if (!K.cat) K.cat = [];
    return K.cat;
  }
  function wireBuscar(main) {
    var q = main.querySelector("#mctk-q"), hits = main.querySelector("#mctk-hits");
    if (!q || !hits) return;
    function bad() { q.classList.remove("mctk-flash-bad"); void q.offsetWidth; q.classList.add("mctk-flash-bad"); }
    async function lista() {
      var v = q.value.trim(); if (!v) { hits.hidden = true; return; }
      await cargarCat();
      var H = (window.MCBuscar ? window.MCBuscar.filtrar(K.cat || [], v, function (p) { return [[p.sku, p.skuVisible, p.codigoInterno].concat(p.aliases || [], p.barras || []), [p.nombre, p.marca]]; }) : []).slice(0, 10);
      hits.hidden = false;
      hits.innerHTML = H.length ? H.map(function (p) { return '<button type="button" data-add="' + e(p.tipo + "|" + p.sku) + '"><span class="mccf-chip">' + e(TIPO[p.tipo] || p.tipo) + '</span> <span class="mccf-sku">' + e(p.skuVisible || p.sku) + "</span> " + e(p.nombre) + ' <span class="mccf-sub">· ' + e($m(p.pvp)) + (p.stock != null ? " · stock " + e(q2(p.stock)) : "") + "</span></button>"; }).join("") : '<div class="mccf-sub" style="padding:8px">Sin resultados</div>';
    }
    q.oninput = function () { void lista(); };
    var cam = main.querySelector("#mctk-cam");
    if (cam) cam.onclick = function () {
      var run = window.MCScan && window.MCScan.abrir || window._scanAbrir;
      if (typeof run === "function") run(function (t) { q.value = t; void lista(); });
    };
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
    on(box, "[data-cerrar]", "onclick", cerrar); on(box, "[data-cerrar2]", "onclick", cerrar);
    box.onclick = function (ev) { if (ev.target === box) cerrar(); };
    on(box, "#mctk-cok", "onclick", async function () {
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
    });
  }
  function dlgExcluir() {
    var d = K.d, t = d.ticket, box = document.createElement("div"); box.className = "mctk-dlg mctk-xdlg";
    box.innerHTML = '<div class="mctk-box"><div class="mctk-xh"><h3>Excluir comisión</h3><button type="button" class="mctk-xx" data-cerrar title="Cerrar">×</button></div>' +
      '<p class="mccf-sub">Marca las líneas que no pagan comisión, o toda la comisión de la cosmetóloga. Queda en el historial.</p>' +
      '<label class="mctk-xtog"><input type="checkbox" id="mctk-xall"' + (K.exclC ? " checked" : "") + '><span>Excluir toda la comisión de <b>' + e(t.cosmetologa || "la cosmetóloga") + "</b> en este ticket</span></label>" +
      '<table class="mctk-xt"><thead><tr><th>Producto / servicio</th><th class="num">Subtotal</th><th class="c">Excluir</th></tr></thead><tbody>' +
      K.L.map(function (l, i) { return '<tr><td><div class="mctk-pn">' + e(l.nombre) + '</div><div class="mctk-sku">' + e(codigoVisible(l)) + " · " + e(TIPO[l.tipo] || l.tipo) + " ×" + e(q2(l.cantidad)) + '</div></td><td class="num">' + $m(net(l.total_linea != null ? l.total_linea : l.precio_unit * l.cantidad)) + '</td><td class="c"><input type="checkbox" data-x="' + i + '"' + (l.excluir_comision ? " checked" : "") + "></td></tr>"; }).join("") +
      '</tbody></table><label class="mctk-xlbl">Motivo<input type="text" id="mctk-xn" value="' + e(K.exclN) + '" placeholder="Ej. producto de cortesía"></label>' +
      '<p class="err" id="mctk-xerr"></p><div class="mctk-acts" style="justify-content:flex-end;margin-top:6px"><button class="btn small" type="button" id="mctk-xok">' + (d.puedeEditar ? "Guardar" : "Aplicar") + "</button></div></div>";
    document.body.appendChild(box);
    var cerrar = function () { box.remove(); };
    on(box, "[data-cerrar]", "onclick", cerrar);
    box.onclick = function (ev) { if (ev.target === box) cerrar(); };
    var tog = function () { var all = box.querySelector("#mctk-xall").checked; box.querySelectorAll("[data-x]").forEach(function (c) { c.disabled = all; }); };
    on(box, "#mctk-xall", "onchange", tog); tog();
    on(box, "#mctk-xok", "onclick", function () {
      var all = box.querySelector("#mctk-xall").checked, nota = box.querySelector("#mctk-xn").value.trim();
      var marcadas = [].slice.call(box.querySelectorAll("[data-x]")).filter(function (c) { return c.checked; }).length;
      if ((all || marcadas) && nota.length < 3) { box.querySelector("#mctk-xerr").textContent = "Escribe el motivo"; return; }
      K.exclC = all; K.exclN = nota;
      box.querySelectorAll("[data-x]").forEach(function (c) { K.L[+c.getAttribute("data-x")].excluir_comision = c.checked; });
      box.remove(); marcar(); pintarLin();
      var g = document.getElementById("mctk-guardar");
      if (K.d.puedeEditar && g) g.click(); else document.getElementById("mctk-err").textContent = "Comisión: envía la solicitud para aplicarla.";
    });
  }

  // ---------- guardar / pedir ----------
  function propuesta() {
    var dat = K.datos && Object.keys(K.datos).length ? { datos: K.datos } : {};
    if (!K.dirtyL) return dat;
    var justEl = document.getElementById("mctk-just");
    if (justEl) K.justif = justEl.value || "";
    return Object.assign(dat, { lineas: K.L.map(function (l) { return { tipo: l.tipo, sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, precio_unit: l.precio_unit, descuento_tipo: l.descuento_tipo || "", descuento_valor: l.descuento_valor || 0, excluir_comision: !!l.excluir_comision, estimado: !!l.estimado, promo: l.promo || "" }; }),
      descuento: { tipo: K.desc.tipo || "", valor: Number(K.desc.valor) || 0 }, promo: K.promo || "", excluir_cosmetologa: K.exclC, excluir_nota: K.exclN,
      justificacion_descuento: K.justif || "", datos: Object.assign({}, dat.datos || {}, { justificacion_descuento: K.justif || "" }) });
  }
  /** Pagado del resumen: si hay pagos reales (beta_pagos) se usan esos; si no, lo cobrado por sistema viejo/Migo. Jamás la suma de ambos. */
  function pagadoTk(cobradoFlag, cobrado, pagoBeta) {
    var pb = Number(pagoBeta) || 0, cs = cobradoFlag ? (Number(cobrado) || 0) : 0;
    return r2(pb > 0 ? Math.max(pb, cs) : cs);
  }
  /** Mismo comprobante/foto (misma URL o mismo archivo de Drive/app) una sola vez. */
  function docsUnicos(L) {
    var vistos = {};
    return (L || []).filter(function (x) {
      if (!x || !x.url) return true;
      var k = (x.tipo || "") + "|" + (idFoto(x.url) || String(x.url).trim());
      if (vistos[k]) return false; vistos[k] = 1; return true;
    });
  }
  function cargarEstado(d) {
    if (d && Array.isArray(d.documentos)) d.documentos = docsUnicos(d.documentos);
    K.d = d; K.dirty = false; K.dirtyL = false; K.datos = {}; K.open = {}; K.costos = null; K._costosPend = null;
    K.L = (d.lineas || []).map(function (l) { return { tipo: l.tipo, sku: l.sku, nombre: l.nombre, cantidad: Number(l.cantidad), precio_unit: Number(l.precio_unit), descuento_tipo: l.descuento_tipo || null, descuento_valor: Number(l.descuento_valor) || 0, excluir_comision: !!l.excluir_comision, estimado: !!l.estimado, canje: !!l.canje, cortesia: !!l.cortesia, consumoInterno: !!l.consumoInterno, paqueteSesion: l.paqueteSesion || "", valorNominal: Number(l.valorNominal) || 0, mejoraPaquete: !!l.mejoraPaquete || /diferencia por mejora/i.test(l.nombre || l.promo || ""), total_linea: Number(l.total_linea) || 0, promo: l.promo || "" }; });
    K.promoIds = [];
    K.desc = { tipo: (d.descuento && d.descuento.tipo) || null, valor: (d.descuento && d.descuento.valor) || 0 };
    K.promo = d.promo || ""; K.exclC = !!d.excluirCosmetologa; K.exclN = d.excluirNota || "";
    K.justif = d.justificacion_descuento || "";
  }
  function render(clave) {
    css();
    K.hidGen = (K.hidGen || 0) + 1;
    var prev = previewDe(clave);
    if (prev) cargarEstado(prev);
    else {
      K.d = { ok: true, clave: clave, hidratando: true, ticket: { clave: clave, soNum: /^r\d+$/.test(String(clave)) ? "" : String(clave), sheetRow: /^r\d+$/.test(String(clave)) ? String(clave).slice(1) : null, cobradoSistema: 0, cancelado: null }, info: {}, lineas: [], totales: {}, descuento: { tipo: null, valor: 0 }, pagos: {}, chips: [], documentos: [], faltan: [], flags: [], reagendada: {}, puedeEditar: false, puedePedir: true, puedeCancelar: false };
      cargarEstado(K.d);
    }
    hidratar(clave, K.hidGen);
    return html();
  }
  async function hidratar(clave, gen) {
    var t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    var r, d, main, detAbierta, err;
    try { r = await api("tk_get", { clave: clave }); }
    catch (x) { r = { error: (x && x.message) || String(x) }; }
    if (gen !== K.hidGen) return;
    // TK154: si lo que se estaba editando eran líneas «previa» (armadas desde la lista), se cambian por las reales.
    var eraPrevia = !!(K.d && (K.d.lineas || []).some(function (l) { return l && l.previa; }));
    if (K.dirty && K.d && K.d.clave === clave && !(eraPrevia && r && r.ok)) return;
    if (K.dirty && eraPrevia) { K.dirty = false; toast2("Se cargaron las líneas reales del ticket: vuelve a hacer tu cambio", true); }
    d = r;
    if (!d || d.error) {
      err = e((d && d.error) || "No se pudo cargar");
      if (K.d && K.d.ticket && !K.d.hidratando) {
        var load = document.getElementById("mctk-load");
        if (load) { load.className = "err"; load.textContent = err; }
        else toast2(err, true);
        return;
      }
      K.d = { error: err };
      main = document.getElementById("mctk-root");
      if (main) main.outerHTML = '<p class="err">' + err + '</p><button class="btn ghost small" type="button" data-go="#/m/tickets">← Volver a la lista</button>';
      return;
    }
    d.hidratando = false;
    if (d.staff) window._tkStaff = d.staff;
    guardarVista(d);
    cargarEstado(d);
    main = document.getElementById("mctk-root");
    detAbierta = !!(main && main.querySelector(".mctk-det[open]"));
    if (main) {
      var host = document.getElementById("app") || main.parentNode || document.body;
      main.outerHTML = html();
      wire(host);
      if (detAbierta) { var det = document.querySelector("#mctk-root .mctk-det"); if (det) det.open = true; }
    }
    // Catálogo en segundo plano (no bloquea la apertura). Sirve para fotos, stock y «Agregar producto».
    if (!K.cat) {
      api("tk_catalogo", {}).then(function (c) {
        if (c && c.items) {
          K.cat = c.items; K.catAt = Date.now();
          var lin = document.getElementById("mctk-lin");
          if (lin && K.d && K.d.clave === clave && !K.dirty) pintarLin();
        }
      }).catch(function () {});
    }
    try { if (typeof console !== "undefined" && console.debug) console.debug("tk104 tk_get", clave, Math.round(((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) - t0), "ms"); } catch (x2) {}
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
    var d = K.d || {}, t = d.ticket || {}, I = d.info || {};
    return (d.lineas || []).some(function (l) { return l.tipo === "facial" || l.tipo === "servicio" || l.tipo === "extra" || l.tipo === "paquete" || l.tipo === "producto"; }) || !!(I.notas || I.recomendaciones || I.retorno || t.notas || t.recomendaciones || t.retorno);
  }
  /** Clave de la tarjeta en window._tkCards: la fila de la hoja o, si el ticket es de la beta, su id. */
  function claveCard() { var t = K.d.ticket; return t.sheetRow ? t.sheetRow : "tk:" + (t.id || K.d.clave); }
  /** TK184: nombre legible de una línea. «SUNSU-AS-002» / «AS-002» (factura de Migo) → nombre del catálogo. */
  function nombreLinea(l, mapa) {
    var n = String(l.nombre || "").trim(), sku = String(l.sku || "").trim().toUpperCase();
    var soloCodigo = !n || /^(SUNSU-)?[A-Z]{2,3}-\d{3}$/i.test(n) || n.toUpperCase() === sku;
    if (soloCodigo) {
      var cod = (sku || n.replace(/^SUNSU-/i, "")).toUpperCase();
      if (mapa && mapa[cod]) return mapa[cod];
      var hit = "";
      (window.PROVS || []).some(function (pv) { return (pv.prods || []).some(function (pr) { if (String(pr.sku || "").toUpperCase() === cod) { hit = pr.n; return true; } return false; }); });
      return hit || cod;
    }
    return n;
  }
  /** TK184 (Emilia t801u): la tarjeta SIEMPRE sale de los datos actuales del ticket (tk_get):
   *  info (correcciones aprobadas en la beta) > ticket (fila del sistema); líneas actuales > columnas viejas;
   *  fotos del ticket (Drive y archivo:) > fotos de la fila vieja. `base` (fila vieja) solo aporta lo que el ticket no trae. */
  function armarCard(d, base) {
    d = d || {};
    var t = d.ticket || {}, I = d.info || {}, L = d.lineas || [], out = Object.assign({}, base || {}), mapa = d.nombresSku || {};
    var nom = function (l) { return nombreLinea(l, mapa); };
    var fac = L.filter(function (l) { return l.tipo === "facial" || l.tipo === "servicio"; });
    var ext = L.filter(function (l) { return l.tipo === "extra"; });
    var paq = L.filter(function (l) { return l.tipo === "paquete"; });
    var prod = L.filter(function (l) { return l.tipo === "producto"; });
    if (L.length) {
      out.facial = fac.map(nom).join(" + ");
      out.extras = ext.map(function (l) { return nom(l) + (l.cantidad > 1 ? " ×" + l.cantidad : ""); }).join(" | ");
      var p3 = window._P3S || [], pq = paq[0], es3 = pq && (p3.some(function (x) { return String(pq.sku || "").indexOf(x) >= 0; }) || /x\s*3\b|3\s*sesion/i.test(String(pq.nombre || "")));
      out.pack3 = pq && es3 ? nom(pq) : ""; out.pack6 = pq && !es3 ? nom(pq) : "";
      out.productos = prod.map(function (l) { return nom(l) + (l.cantidad > 1 ? " ×" + l.cantidad : ""); });
    }
    var pick = function (k) { var v = I[k] != null && String(I[k]).trim() !== "" ? I[k] : t[k]; return v != null && String(v).trim() !== "" ? String(v) : ""; };
    out.nombre = pick("nombre") || out.nombre || ""; out.apellido = pick("apellido") || out.apellido || "";
    out.cosmetologa = pick("cosmetologa") || out.cosmetologa || ""; out.fecha = t.fecha || I.fecha || out.fecha || "";
    out.notas = pick("notas") || out.notas || "";
    out.recomendaciones = pick("recomendaciones") || out.recomendaciones || "";
    var ret = pick("retorno") || String(out.retorno || ""), mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(ret.trim());
    if (mdy) ret = mdy[3] + "-" + ("0" + mdy[1]).slice(-2) + "-" + ("0" + mdy[2]).slice(-2);
    out.retorno = ret.slice(0, 10);
    out.retornoTrat = String(I.retornoTrat || out.retornoTrat || "");
    var fotos = (d.documentos || []).filter(function (x) { return x.tipo === "foto"; });
    if (fotos.length) {
      out.fotosAntes = fotos.filter(function (x) { return !/despu/i.test(x.nombre || ""); }).map(function (x) { return x.url; }).join(" | ");
      out.fotosDespues = fotos.filter(function (x) { return /despu/i.test(x.nombre || ""); }).map(function (x) { return x.url; }).join(" | ");
    }
    if (out.colS == null) out.colS = "";
    return out;
  }
  function cardDesdeTicket(base) { return armarCard(K.d, base); }
  /** TK184: trae el ticket recién leído (nunca la lista ni una tarjeta guardada) y arma la tarjeta. Devuelve la clave en _tkCards. */
  async function tarjetaFresca(clave) {
    var k = String(clave || ""); if (!k) return null;
    var d = null;
    try { d = await api("tk_get", { clave: k }); } catch (x) { d = null; }
    if (!d || !d.ok) return null;
    try { guardarVista(d); } catch (x2) {}
    var t = d.ticket || {}, key = t.sheetRow ? t.sheetRow : "tk:" + (t.id || d.clave || k);
    var base = null;
    if (t.sheetRow) base = (window._histData || []).find(function (x) { return String(x.tkRow) === String(t.sheetRow); }) || null;
    (window._tkCards = window._tkCards || {})[key] = armarCard(d, base ? { colS: base.colS || "" } : null);
    return key;
  }
  async function cardDelTicket() {
    var key = await tarjetaFresca(K.d.clave);
    if (key) { var h = window._tkCards[key]; window._tkCards[claveCard()] = h; return h; }
    // Sin red: con lo que se ve en pantalla (igual con info/líneas actuales).
    if (!conTratamiento()) return null;
    var h2 = cardDesdeTicket(null);
    (window._tkCards = window._tkCards || {})[claveCard()] = h2;
    return h2;
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
      on(box, "[data-x]", "onclick", function () { box.remove(); });
      on(box, "[data-s]", "onclick", function () { navigator.share({ files: files }).catch(function () {}); box.remove(); });
    } else docs.forEach(function (x, i) { setTimeout(function () { try { x.doc.save(x.nom); } catch (e5) {} }, i * 700); });
  }
  async function enviarReporte(tipo) {
    if (window.SunsuWa && typeof SunsuWa.flujo === "function") {
      return SunsuWa.flujo({
        ticket_clave: K.d.clave,
        tipo: tipo === "combo" ? "" : tipo,
        detalle: K.d,
        ticket: (K.d && K.d.ticket) || null,
        tipos_fallback: SunsuWa.tiposDeVista(K.d),
        pdfs: async function (sel) {
          var docs = [], i, x;
          for (i = 0; i < sel.length; i++) {
            if (sel[i] === "facial") {
              if (!(await cardDelTicket())) { toast2("No encontré la tarjeta de este ticket", true); continue; }
              x = await pdfTarjeta(); if (x && x.doc) docs.push(x);
            } else if (sel[i] === "paquete") {
              x = await pdfPaquete(); if (x && x.doc) docs.push(x);
              else toast2("No encontré el paquete de la clienta", true);
            } else if (sel[i] === "giftcard") {
              var g = ((K.d && K.d.giftcards) || []).filter(function (y) { return y.uso === "vendida"; })[0];
              if (g && typeof _gcdPDF === "function") {
                await new Promise(function (res) {
                  try { _gcdPDF(function (blob, nom) { if (blob) docs.push({ blob: blob, nom: nom || "gift-card.pdf" }); res(); }); }
                  catch (eGc) { res(); }
                });
              }
            }
          }
          return docs;
        }
      });
    }
    toast2("No se pudo preparar el WhatsApp", true);
  }
  function abrirGiftCard(cod) {
    var g = (K.d.giftcards || []).find(function (x) { return x.codigo === cod; }) || { codigo: cod };
    if (typeof renderGiftCardDigital !== "function") { toast2("No está disponible el generador de gift cards", true); return; }
    var main = document.getElementById("main"), volver = location.hash;
    main.innerHTML = '<div style="padding:12px 16px 0;display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost small" type="button" id="mctk-gcv">← Volver al ticket</button><button class="btn small" type="button" id="mctk-gcd">⬇️ Descargar PDF ' + e(cod) + '</button></div><div id="content"></div>';
    try { if (typeof cuSunsu === "function") CU = cuSunsu(); } catch (e6) {}
    renderGiftCardDigital({ codigo: g.codigo, para: g.para, de: g.de || g.comprador, facial: g.facial || undefined, mensaje: g.mensaje, valido: g.valido || undefined });
    on(main, "#mctk-gcv", "onclick", function () { if (typeof draw === "function") draw(); else go(volver); });
    on(main, "#mctk-gcd", "onclick", function () {
      if (typeof _gcdPDF !== "function") return;
      _gcdPDF(function (blob, nom) { if (!blob) { toast2("No se pudo generar el PDF", true); return; } var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nom; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); });
    });
  }
  async function dlgCostos() {
    var box = document.createElement("div"); box.className = "mctk-dlg"; box.innerHTML = '<div class="mctk-box"><p class="mccf-sub">Calculando…</p></div>'; document.body.appendChild(box);
    var r = await api("tk_costos", { clave: K.d.clave });
    if (!r || r.error) { box.innerHTML = '<div class="mctk-box"><p class="err">' + e((r && r.error) || "No se pudo") + '</p><button class="btn ghost small" type="button" data-x>Cerrar</button></div>'; on(box, "[data-x]", "onclick", function () { box.remove(); }); return; }
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
      on(box, "#mctk-nct", "onchange", function () { c.costos_no_cliente_tipo = this.value; pintar(); });
      on(box, "#mctk-ncv", "onchange", function () { c.costos_no_cliente_valor = Number(this.value) || 0; pintar(); });
      on(box, "#mctk-cok", "onclick", async function () {
        var g = await api("tk_costos_guardar", { clave: K.d.clave, tipo: c.costos_no_cliente_tipo, valor: Number(c.costos_no_cliente_valor) || 0 });
        if (!g || g.error) { box.querySelector("#mctk-cerr").textContent = (g && g.error) || "No se pudo guardar"; return; }
        toast2("Costos guardados"); box.remove();
      });
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
    try { wire2(main); } catch (x) { try { console.error(x); } catch (y) {} var er = main.querySelector("#mctk-err"); if (er) er.textContent = "No se pudo mostrar esta pantalla. Recarga e inténtalo de nuevo."; }
  }
  function on(main, sel, ev, fn) { var el = main.querySelector(sel); if (el) el[ev] = fn; return el; }
  /* TK155 (Emilia t683u): en el celular el menú (Acciones ▾, etc.) sale ancho y completo, anclado a la pantalla
     (position: fixed) para que ningún padre con overflow lo recorte. Tapa lo de atrás: solo es para tocar. */
  function anclarMenuMovil(dd, btn) {
    try {
      var vw = window.innerWidth || document.documentElement.clientWidth || 390;
      if (vw > 860) { dd.style.cssText = ""; return; }
      var r = btn.getBoundingClientRect(), vh = window.innerHeight || 844;
      var w = Math.min(320, vw - 24);
      var top = Math.round(r.bottom + 4);
      dd.style.position = "fixed";
      dd.style.top = top + "px";
      dd.style.right = "12px";
      dd.style.left = "auto";
      dd.style.width = w + "px";
      dd.style.minWidth = w + "px";
      dd.style.maxWidth = (vw - 24) + "px";
      dd.style.maxHeight = Math.max(200, vh - top - 12) + "px";
      dd.style.overflowY = "auto";
      dd.style.zIndex = "1000";
      dd.classList.add("mctk-dd-movil");
      if (!K.ddScroll) { K.ddScroll = true; window.addEventListener("scroll", function () { document.querySelectorAll(".mctk-dd-movil").forEach(function (x) { x.hidden = true; }); }, { passive: true }); }
    } catch (e) {}
  }
  try { window._mctkAnclarMenu = anclarMenuMovil; } catch (e0) {}
  function wire2(main) {
    on(main, "#mctk-volver", "onclick", function () { if (K.dirty && !confirm("Hay cambios sin guardar. ¿Salir igual?")) return; var vv = sessionStorage.getItem("mctk.volver"); sessionStorage.removeItem("mctk.volver"); go(vv || "#/m/tickets"); });
    main.querySelectorAll("[data-menu]").forEach(function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        var id = b.getAttribute("data-menu");
        main.querySelectorAll(".mctk-dd").forEach(function (x) { if (x.id !== id) x.hidden = true; });
        var dd = id ? main.querySelector("#" + id) : null;
        if (dd) dd.hidden = !dd.hidden;
        if (dd && !dd.hidden) anclarMenuMovil(dd, b);
      };
    });
    if (!K.ddWired) { K.ddWired = true; document.addEventListener("click", function (ev) { if (!ev.target.closest(".mctk-menu")) document.querySelectorAll(".mctk-dd").forEach(function (x) { x.hidden = true; }); }); }
    var facBtn = main.querySelector(".mctk-fac [data-pv]");
    if (facBtn) facBtn.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); if (window.MCPrevia) window.MCPrevia.abrir(facBtn.getAttribute("data-pv"), facBtn.getAttribute("data-pvn")); };
    function cerrarMenuDe(el) { var dd = el && el.closest && el.closest(".mctk-dd"); if (dd) dd.hidden = true; }
    async function onDocs(ev) {
      var pv = ev.target.closest("[data-pv]");
      if (pv && window.MCPrevia) { cerrarMenuDe(pv); window.MCPrevia.abrir(pv.getAttribute("data-pv"), pv.getAttribute("data-pvn")); return; }
      var b = ev.target.closest("[data-doc]"); if (!b) return;
      cerrarMenuDe(b);
      if (b.getAttribute("data-doc") === "tarjeta" && window.MCPrevia) { var hh = await cardDelTicket(); if (!hh) { toast2("No encontré la tarjeta de este ticket", true); return; } window.MCPrevia.tarjeta(claveCard(), "Tarjeta del tratamiento"); return; }
      if (b.getAttribute("data-doc") === "paquete" && window.MCPrevia && window.MCPrevia.pdf) { window.MCPrevia.pdf("Reporte del paquete", function () { return pdfPaquete().then(function (x) { if (!x.x) throw new Error("No encontré el paquete de este ticket"); return x; }); }); return; }
      if (b.getAttribute("data-doc") === "gc") { if (K.dirty && !confirm("Hay cambios sin guardar. ¿Salir igual?")) return; abrirGiftCard(b.getAttribute("data-cod")); return; }
      var h = await cardDelTicket();
      if (!h || typeof tarjetaTicket !== "function") { toast2("No encontré la tarjeta de este ticket", true); return; }
      tarjetaTicket(claveCard());
    }
    function onWa(ev) { var b = ev.target.closest("[data-wa]"); if (!b) return; cerrarMenuDe(b); enviarReporte(b.getAttribute("data-wa")); }
    // En celular Documentos/WhatsApp viven en Acciones (#mctk-acc); en escritorio siguen #mctk-dd y #mctk-wa.
    on(main, "#mctk-dd", "onclick", onDocs);
    on(main, "#mctk-prev", "onclick", onDocs);
    var prevBox = main.querySelector("#mctk-prev");
    if (prevBox && typeof window._histCargarThumbs === "function") { try { window._histCargarThumbs(prevBox); } catch (eT) {} }
    if (prevBox && window.MCOcr) window.MCOcr.wire(prevBox, null, function (r) {
      ((K.d && K.d.documentos) || []).forEach(function (x) { if (x.url === r.url) { x.ocr = r.ocr; x.cruce = r.cruce; } });
    });
    on(main, "#mctk-wa", "onclick", onWa);
    var acc = main.querySelector("#mctk-acc");
    if (acc) acc.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-doc], [data-pv]")) { void onDocs(ev); return; }
      if (ev.target.closest("[data-wa]")) onWa(ev);
    });
    on(main, "#mctk-print", "onclick", function () { document.body.classList.add("mctk-printing"); window.print(); setTimeout(function () { document.body.classList.remove("mctk-printing"); }, 500); });
    on(main, "#mctk-excl", "onclick", dlgExcluir);
    on(main, "#mctk-cancelar", "onclick", dlgCancelar);
    on(main, "#mctk-solcancel", "onclick", function (ev) { cerrarMenuDe(ev && ev.target); dlgSolicitarEliminar(); });
    on(main, "#mctk-multa", "onclick", function () {
      var t = K.d.ticket, inf = K.d.info || {};
      window.MCMultas.aplicarDesdeTicket({ id: t.id, so: t.soNum || t.betaNum, cosmetologa: t.cosmetologa, fecha: t.fecha || inf.fecha, cliente: ((t.nombre || "") + " " + (t.apellido || "")).trim() }).catch(function (x) { toast2((x && x.message) || String(x), true); });
    });
    main.querySelectorAll("[data-ed]").forEach(function (b) { b.onclick = function () { editarCampo(main, b.getAttribute("data-ed")); }; b.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); editarCampo(main, b.getAttribute("data-ed")); } }; });
    var cosmSel = main.querySelector("select.mctk-cosm");
    if (cosmSel) cosmSel.onchange = function () {
      var nv = cosmSel.value.trim(), cur = val("cosmetologa");
      if (nv === cur) { if (K.datos) delete K.datos.cosmetologa; if (!Object.keys(K.datos || {}).length && !K.dirtyL) { K.dirty = false; marcar(false); } else marcar(!!K.dirty); repintar(main); return; }
      K.datos = K.datos || {}; K.datos.cosmetologa = nv;
      var dirty = true, dl = K.dirtyL; repintar(main); K.dirty = dirty; K.dirtyL = dl; marcar(true);
    };
    function subirVoucherDe(inp) {
      inp.onchange = async function () {
        var f = inp.files && inp.files[0]; inp.value = ""; if (!f) return;
        toast2("⏳ Subiendo voucher…");
        try {
          var data = await (window.MCVoucher && window.MCVoucher.comprimir ? window.MCVoucher.comprimir(f) : comprimir(f));
          var body = { clave: K.d.clave, imagen: data }, pagoId = inp.getAttribute("data-pago-id");
          if (pagoId) body.pago_id = pagoId;
          var r = await api("tk_subir_doc", body);
          if (!r || r.error) { toast2((r && r.error) || "No se pudo subir", true); return; }
          toast2("✓ Voucher subido");
          var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok && !K.dirty) { cargarEstado(d); repintar(main); }
        } catch (x) { toast2((x && x.message) || "No se pudo subir", true); }
      };
    }
    main.querySelectorAll(".mctk-voucher-inp").forEach(subirVoucherDe);
    main.querySelectorAll(".mctk-fotos-inp").forEach(function (inp) {
      inp.onchange = async function () {
        var fs = Array.prototype.slice.call(inp.files || [], 0, 6), mom = inp.getAttribute("data-mom") === "despues" ? "despues" : "antes";
        inp.value = ""; if (!fs.length) return;
        toast2("⏳ Subiendo " + fs.length + (fs.length === 1 ? " foto" : " fotos") + "…");
        try {
          var ok = 0, r = null;
          for (var i = 0; i < fs.length; i++) {
            var img = await (window.MCVoucher && window.MCVoucher.comprimir ? window.MCVoucher.comprimir(fs[i]) : comprimir(fs[i]));
            r = await api("tk_agregar_fotos", { clave: K.d.clave, momento: mom, imagenes: [img] });
            if (!r || r.error) break;
            ok++;
          }
          if (!ok) { toast2((r && r.error) || "No se pudo subir", true); return; }
          toast2("✓ " + ok + (ok === 1 ? " foto agregada" : " fotos agregadas") + " (" + (mom === "antes" ? "Antes" : "Después") + ")" + (ok < fs.length ? " · " + ((r && r.error) || "faltaron algunas") : ""), ok < fs.length);
          var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok && !K.dirty) { cargarEstado(d); repintar(main); }
        } catch (x) { toast2((x && x.message) || "No se pudo subir", true); }
      };
    });
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
    if (lin) {
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
      var cv = c.querySelector(".mctk-cv") || c;
      var sm = c.querySelector("small");
      var lbl = (sm && sm.textContent) || c.getAttribute("aria-label") || f;
      cv.innerHTML = '<input class="mctk-cin" data-f="' + (f === "desc" ? "desc" : f) + '" ' + (f === "desc" ? 'type="text" inputmode="decimal" placeholder="10% o $5"' : 'type="number" inputmode="decimal" min="0" step="any"') + ' value="' + e(v) + '" aria-label="' + e(lbl) + '">';
      var inp = cv.querySelector("input"), fin = false; inp.focus(); inp.select();
      function cerrar(deshacer) { if (fin) return; fin = true; if (deshacer) { Object.assign(l, JSON.parse(antes)); calc(); } pintarLin(); }
      inp.addEventListener("keydown", function (k) { if (k.key === "Enter") { k.preventDefault(); cerrar(false); } else if (k.key === "Escape") { k.preventDefault(); cerrar(true); } });
      inp.addEventListener("blur", function () { cerrar(false); });
    }
    lin.addEventListener("click", function (ev) { var c = ev.target.closest("[data-le]"); if (c && !ev.target.closest("input")) editarCelda(c); });
    lin.addEventListener("keydown", function (ev) { if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches && ev.target.matches("[data-le]")) { ev.preventDefault(); editarCelda(ev.target); } });
    lin.addEventListener("click", function (ev) { var ir = ev.target.closest("[data-irp]"); if (ir) { ev.preventDefault(); ev.stopPropagation(); go("#/m/productos/p/" + encodeURIComponent(ir.getAttribute("data-irp"))); return; } });
    lin.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-le], input, a, [data-del], [data-irp], [data-mejora]")) return;
      var b = ev.target.closest("[data-tog]");
      if (!b) return;
      ev.preventDefault();
      ev.stopPropagation();
      var i = +b.getAttribute("data-tog");
      K.open = K.open || {};
      K.open[i] = !K.open[i];
      if (K.open[i]) asegurarCostos();
      var tr = b.closest("[data-i]");
      if (!tr) return;
      tr.classList.toggle("open", !!K.open[i]);
      var drop = tr.querySelector(".mctk-drop");
      if (drop) drop.hidden = !K.open[i];
      var arr = tr.querySelector(".mctk-arr");
      if (arr) arr.textContent = K.open[i] ? "▴" : "▾";
      b.setAttribute("aria-expanded", K.open[i] ? "true" : "false");
    });

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
    }
    on(main, "#mctk-addlink", "onclick", function (ev) { ev.preventDefault(); var bx = main.querySelector("#mctk-addbox"); if (!bx) return; bx.hidden = !bx.hidden; var qq = main.querySelector("#mctk-q"); if (!bx.hidden && qq) qq.focus(); });
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
    on(main, "#mctk-dv", "oninput", function () { var x = descParse(this.value); this.classList.toggle("bad", !x); if (!x) return; K.desc.tipo = x.tipo; K.desc.valor = x.valor; marcar(); pintarTot(); });
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
    var edBtn = main.querySelector("#mctk-editar-form");
    if (edBtn) edBtn.addEventListener("click", function () {
      var clave = (K.d && (K.d.clave || (K.d.ticket && (K.d.ticket.clave || K.d.ticket.soNum)))) || "";
      if (!clave) { toast2("No encuentro el ticket", true); return; }
      if (K.d && K.d.edicion && K.d.edicion.id && !K.d.admin) { toast2("Ya hay una edición pendiente de aprobación", true); return; }
      var abrir = function (d) {
        if (typeof window._tkCargarEdicion === "function") window._tkCargarEdicion(d, clave);
        else toast2("No se pudo abrir el formulario", true);
      };
      if (K.d && K.d.ok && K.d.lineas) abrir(K.d);
      else Promise.resolve(api("tk_get", { clave: clave })).then(abrir).catch(function () { toast2("No se pudo cargar el ticket", true); });
    });
    function resolverEdicion(aprobar, btn) {
      var ed = K.d && K.d.edicion;
      if (!ed || !ed.id) return;
      if (btn && btn.disabled) return;
      var comentario = aprobar ? "" : (prompt("Motivo del rechazo (opcional)") || "");
      if (!aprobar && comentario == null) return;
      var txt = btn ? btn.textContent : "";
      if (btn) { btn.disabled = true; btn.textContent = aprobar ? "Aprobando…" : "Rechazando…"; }
      Promise.resolve(api("solicitud_resolver", { id: ed.id, aprobar: aprobar, comentario: comentario }))
        .then(function (r) {
          if (r && r.error) {
            if (btn) { btn.disabled = false; btn.textContent = txt; }
            toast2(r.error, true); return;
          }
          toast2(aprobar ? (ed.tipo === "anular" ? "Ticket eliminado (queda Cancelado)" : "✓ Cambios aplicados · ticket bloqueado") : "Solicitud rechazada: el ticket queda igual");
          if (r && r.ticket) { K.d = r.ticket; if (K.d) K.d.edicion = null; try { cargarEstado(K.d); repintar(main); } catch (e0) {} }
          return api("tk_get", { clave: K.d.clave }).then(function (d) { if (d && d.ok) { cargarEstado(d); repintar(main); } });
        })
        .catch(function (e) {
          if (btn) { btn.disabled = false; btn.textContent = txt; }
          toast2((e && e.message) || "No se pudo resolver", true);
        });
    }
    var okb = main.querySelector("#mctk-edicion-ok");
    var nob = main.querySelector("#mctk-edicion-no");
    if (okb) okb.addEventListener("click", function () { resolverEdicion(true, okb); });
    if (nob) nob.addEventListener("click", function () { resolverEdicion(false, nob); });

    if (pd) pd.onclick = async function () {
      var mot = prompt("Propuesta de edición — los cambios se aplicarán solo cuando un admin apruebe.\n\nMotivo (obligatorio):"); if (!mot || mot.trim().length < 3) { if (mot != null) err.textContent = "Escribe el motivo"; return; }
      var r = await api("solicitud_crear", { tabla: "ticket_detalle", fila: K.d.clave, tipo: "cambio", motivo: mot.trim(), propuestos: propuesta() });
      if (!r || r.error) { err.textContent = (r && r.error) || "No se pudo enviar"; return; }
      toast2("📨 Propuesta enviada para aprobación: el ticket no cambia hasta que un admin apruebe");
      var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok) { cargarEstado(d); repintar(main); }
    };
    on(main, "#mctk-descartar", "onclick", async function () { var d = await api("tk_get", { clave: K.d.clave }); if (d && d.ok) { cargarEstado(d); repintar(main); } });
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
    try { await cargarCat(); } catch (x) { toast2("No se pudo leer el catálogo: " + ((x && x.message) || x), true); return; }
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
    precargar: function (clave) {
      // TK154: precalienta tk_get (ej. tickets con solicitud pendiente) para que abran sin esperar.
      var k = String(clave || ""); if (!k || (window._tkVista && window._tkVista[k])) return Promise.resolve(null);
      return Promise.resolve(api("tk_get", { clave: k })).then(function (d) { if (d && d.ok) guardarVista(d); return d; }).catch(function () { return null; });
    },
    tarjetaFresca: tarjetaFresca, armarCard: armarCard,
    claveDe: function (t) { return (t && t.so_num) || (t && t.tkRow ? "r" + t.tkRow : ""); }, cacheLineasLista: cacheLineasLista, lineasCacheDe: lineasCacheDe,
    isDirty: function () { return !!K.dirty; },
    _k: K, _calc: calc, _pagado: pagadoTk, _docsUnicos: docsUnicos,
  };
})();


(function(){
  var orig = window.api;
  if (typeof orig !== "function" || orig._migoWrap) return;
  window.api = function(accion, body){
    return Promise.resolve(orig(accion, body)).then(function(r){
      if (accion === "crearTicket" && r && r.requiere === "vincular_borrador" && r.borrador && !(body && (body.vincular_borrador || body.ignorar_borrador))) {
        var b = r.borrador;
        var ok = confirm("Ya hay un borrador de la factura " + (b.factura || "") + " (" + (b.cliente || "") + ", $" + Number(b.total || 0).toFixed(2) + ").\n\n¿Vincular el ticket a esa factura? El ticket sí se crea.");
        return orig("crearTicket", Object.assign({}, body || {}, ok ? { vincular_borrador: b.factura } : { ignorar_borrador: true }));
      }
      return r;
    });
  };
  window.api._migoWrap = true;
})();
