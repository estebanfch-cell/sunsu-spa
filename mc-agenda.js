// Agenda de la beta (Emilia 17/11 y 18/11): réplica de Acuity por la edge «api» (la llave nunca llega al navegador).
// Cosmetóloga: su calendario, ficha al tocar la clienta, «Crear ticket» desde la cita (la cita pasa a COMPLETADO).
// Vistas: Lista (por defecto, las tarjetas de siempre), Día y Semana en grilla de horas (como Acuity), Mes con conteo.
// Las horas se muestran en formato 12 h con AM/PM. La vista queda en localStorage.
(function () {
  var LS = "sunsu.agenda.vista";
  var K = { meta: null, vista: "lista", fecha: "", cal: "", col: "", citas: [], porDia: {}, err: "", aviso: "" };
  var COL = { green: "#2E8B57", yellow: "#C9A227", pink: "#C2577E", blue: "#3E7CB1", black: "#333", orange: "#D2603A", purple: "#7C6BB0", red: "#C0392B" };
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v); }
  function toast2(m, mal) { if (typeof toast === "function") { try { toast(m, mal ? "#B86B6B" : undefined); return; } catch (x) {} } alert(m); }
  function ymd(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function dt(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function add(s, n) { var d = dt(s); d.setDate(d.getDate() + n); return ymd(d); }
  var DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"], MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function hm24(iso) { var m = /T(\d{2}):(\d{2})/.exec(String(iso || "")); return m ? m[1] + ":" + m[2] : ""; }
  function minutos(iso) { var x = hm24(iso), m = /^(\d{1,2}):(\d{2})/.exec(x); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
  function hora12(hm) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(hm || "").trim());
    if (!m) return String(hm || "");
    var h = +m[1], min = m[2], ap = h >= 12 ? "PM" : "AM";
    h = h % 12; if (!h) h = 12;
    return h + ":" + min + " " + ap;
  }
  function hora(iso) { return hora12(hm24(iso)); }
  function tipoVisible(t) { t = String(t || ""); return /primera\s*vez|gracias por regresar/i.test(t) ? "" : t; }
  function etqCerrada(nom) { return /CONFIRMADA|COMPLETADO|INGRESADO|NO LLEGO/i.test(String(nom || "")); }
  function subCita(c) {
    var cal = window.MCColor ? window.MCColor.pill(calNom(c.calendarID) || c.calendario) : e(calNom(c.calendarID) || c.calendario);
    var tip = tipoVisible(c.tipo_visible != null ? c.tipo_visible : c.tipo);
    return cal + (tip ? " · " + e(tip) : "");
  }
  function abrirWaUrl(prep) {
    if (window.MCWa && typeof window.MCWa.abrirUrl === "function") { window.MCWa.abrirUrl(prep); return; }
    var mov = !!(window.matchMedia && window.matchMedia("(max-width: 860px)").matches) || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    var u = mov ? (prep.wa_url || "") : (prep.wa_url_web || prep.wa_url || "");
    if (!u) return;
    var v = window.open(u, "_blank");
    if (!v) window.location.href = u;
    if (v) setTimeout(function () { try { v.close(); } catch (e0) {} }, 2800);
  }
  function horaEje(h) { var ap = h >= 12 ? "PM" : "AM", x = h % 12; if (!x) x = 12; return x + " " + ap; }
  function leerVista() {
    try {
      var v = localStorage.getItem(LS);
      if (v === "lista" || v === "dia" || v === "semana" || v === "mes") return v;
    } catch (er) {}
    return "lista";
  }
  function guardarVista() { try { localStorage.setItem(LS, K.vista); } catch (er) {} }
  function lunes(s) { var d = dt(s), w = (d.getDay() + 6) % 7; return add(s, -w); }
  function rango() {
    if (K.vista === "semana") { var l = lunes(K.fecha); return [l, add(l, 6)]; }
    if (K.vista === "mes") { var d = dt(K.fecha), a = ymd(new Date(d.getFullYear(), d.getMonth(), 1)), b = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); return [a, b]; }
    return [K.fecha, K.fecha];
  }
  function titulo() {
    var r = rango(), d = dt(K.fecha);
    if (K.vista === "mes") return MESES[d.getMonth()] + " " + d.getFullYear();
    if (K.vista === "semana") { var a = dt(r[0]), b = dt(r[1]); return a.getDate() + " " + MESES[a.getMonth()].slice(0, 3) + " – " + b.getDate() + " " + MESES[b.getMonth()].slice(0, 3) + " " + b.getFullYear(); }
    return DIAS[d.getDay()] + " " + d.getDate() + " de " + MESES[d.getMonth()] + " " + d.getFullYear();
  }
  function calNom(id) { var c = ((K.meta && K.meta.calendarios) || []).find(function (x) { return String(x.id) === String(id); }); return c ? (c.persona || c.nombre) : ""; }
  function etqPill(nom) {
    if (!nom) return "";
    var l = ((K.meta && K.meta.etiquetas) || []).find(function (x) { return x.nombre === nom; }), col = COL[(l && l.color) || ""] || "#8A93A6";
    return '<span class="mcag-pill" style="color:' + col + ";border-color:" + col + '">' + e(nom) + "</span>";
  }
  function css() {
    if (window.MCConteo && window.MCConteo._css) window.MCConteo._css();
    if (document.getElementById("mcag-css")) return;
    var s = document.createElement("style"); s.id = "mcag-css";
    s.textContent = [
      ".mcag-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.mcag-bar h2{margin:0 8px 0 0;font-size:1.15rem}.mcag-seg{display:inline-flex;border:1.5px solid var(--cream-d);border-radius:10px;overflow:hidden}.mcag-seg button{border:none;background:#fff;padding:6px 12px;font:inherit;font-size:.8rem;cursor:pointer;color:var(--navy-d)}.mcag-seg button.on{background:var(--navy);color:#fff}",
      ".mcag-tit{font-weight:800;color:var(--navy-d);min-width:180px;text-transform:capitalize}.mcag-pill{display:inline-block;border:1.5px solid;border-radius:999px;padding:1px 8px;font-size:.66rem;font-weight:700;white-space:nowrap}",
      ".mcag-list{display:flex;flex-direction:column;gap:8px}.mcag-c{display:grid;grid-template-columns:108px 1fr auto;gap:10px;align-items:start;background:#fff;border:1px solid var(--cream-d);border-left:4px solid var(--navy);border-radius:12px;padding:10px 12px}.mcag-c.ok{opacity:.62}.mcag-h{font-weight:800;color:var(--navy-d)}.mcag-h small{display:block;color:var(--gray);font-weight:500}",
      ".mcag-n{font-weight:700;color:var(--navy-d);cursor:pointer;text-decoration:underline dotted}.mcag-sub{color:var(--gray);font-size:.74rem;margin-top:2px}.mcag-acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.mcag-tag{font-size:.62rem;font-weight:800;border-radius:6px;padding:1px 6px;background:#efe9fb;color:#5d4a9c;margin-left:4px}.mcag-tag.ant{background:#e8f1f8;color:#2f5f86}.mcag-wa{background:#C0392B!important;color:#fff!important;border-color:#C0392B!important}.mcag-wa.ok{background:#25D366!important;border-color:#1da851!important;color:#fff!important}",
      ".mcag-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.mcag-dh{font-size:.68rem;color:var(--gray);text-align:center;font-weight:700;text-transform:uppercase}.mcag-d{background:#fff;border:1px solid var(--cream-d);border-radius:10px;min-height:76px;padding:6px;cursor:pointer;font-size:.72rem}.mcag-d:hover{border-color:var(--navy)}.mcag-d.fuera{opacity:.4}.mcag-d.hoy{border:2px solid var(--pink,#d88aa3)}",
      ".mcag-d b{font-size:.8rem;color:var(--navy-d)}.mcag-cnt{float:right;background:var(--navy);color:#fff;border-radius:999px;padding:0 7px;font-weight:800;font-size:.7rem}.mcag-pc{display:block;color:var(--gray);font-size:.64rem;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".mcag-wk{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;overflow-x:auto;max-width:100%}.mcag-wd{background:#fff;border:1px solid var(--cream-d);border-radius:10px;padding:6px;min-height:120px}.mcag-wd h4{margin:0 0 6px;font-size:.74rem;color:var(--navy-d);cursor:pointer;display:flex;justify-content:space-between}.mcag-wi{font-size:.7rem;padding:4px 5px;border-radius:7px;background:var(--cream);margin-bottom:4px;cursor:pointer;border-left:3px solid var(--navy)}.mcag-wi.ok{opacity:.55}",
      ".mcag-dlg{position:fixed;inset:0;background:rgba(20,30,50,.35);display:flex;align-items:center;justify-content:center;z-index:9999}.mcag-box{background:#fff;border-radius:14px;padding:16px;width:min(560px,94vw);max-height:90vh;overflow:auto}.mcag-box label{display:block;font-size:.78rem;color:var(--gray);margin:8px 0 3px}.mcag-box input,.mcag-box select,.mcag-box textarea{width:100%;box-sizing:border-box;padding:7px 9px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit;font-size:.84rem}",
      ".mcag-hrs{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.mcag-hrs button{border:1.5px solid var(--cream-d);background:#fff;border-radius:8px;padding:5px 9px;font:inherit;font-size:.78rem;cursor:pointer}.mcag-hrs button.on{background:var(--navy);color:#fff;border-color:var(--navy)}.mcag-kv{display:grid;grid-template-columns:140px 1fr;gap:4px 10px;font-size:.82rem;margin:8px 0}.mcag-kv dt{color:var(--gray)}.mcag-kv dd{margin:0}",
      "#mcag-root{max-width:100%;overflow-x:hidden}.mcag-seg{flex-wrap:wrap}.mcag-csel{display:flex;gap:6px;overflow-x:auto;max-width:100%;padding:0 0 8px;-webkit-overflow-scrolling:touch}.mcag-csel button{flex:0 0 auto;border:1.5px solid var(--cream-d);background:#fff;border-radius:999px;padding:5px 10px;font:inherit;font-size:.74rem;cursor:pointer;color:var(--navy-d)}.mcag-csel button.on{background:var(--navy);color:#fff;border-color:var(--navy)}",
      ".mcag-tg{display:flex;max-width:100%;overflow-x:auto;overflow-y:auto;border:1px solid var(--cream-d);border-radius:12px;background:#fff;-webkit-overflow-scrolling:touch}.mcag-gutter{flex:0 0 44px;min-width:44px;background:var(--blue-ll,#f4f1ea)}.mcag-gutter .mcag-ch{height:28px;border-bottom:1px solid var(--cream-d)}.mcag-hh{box-sizing:border-box;border-bottom:1px solid var(--cream-d);font-size:.64rem;font-weight:700;color:var(--gray);padding:2px 4px;line-height:1.2}",
      ".mcag-col{flex:1 1 0;min-width:96px;border-left:1px solid var(--cream-d);position:relative}.mcag-ch{height:28px;display:flex;align-items:center;justify-content:center;padding:0 4px;font-size:.68rem;font-weight:700;color:var(--navy-d);border-bottom:1px solid var(--cream-d);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mcag-track{position:relative;background:repeating-linear-gradient(to bottom,#fff 0,#fff calc(var(--mcag-px,52px) - 1px),var(--cream-d) calc(var(--mcag-px,52px) - 1px),var(--cream-d) var(--mcag-px,52px))}",
      ".mcag-bl{position:absolute;left:3px;right:3px;box-sizing:border-box;border:0;border-radius:7px;padding:2px 5px;text-align:left;color:#fff;font:inherit;font-size:.66rem;line-height:1.2;cursor:pointer;overflow:hidden;box-shadow:0 1px 2px rgba(20,30,50,.18)}.mcag-bl b{display:block;font-size:.66rem;font-weight:800}.mcag-bl span{display:block;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mcag-bl.ok{opacity:.55}.mcag-now{position:absolute;left:0;right:0;height:2px;background:#d35a6a;z-index:2;pointer-events:none}",
      ".mcag-wkg{display:flex;max-width:100%;overflow-x:auto;overflow-y:auto;border:1px solid var(--cream-d);border-radius:12px;background:#fff;-webkit-overflow-scrolling:touch}.mcag-wkg .mcag-col{min-width:72px}.mcag-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin:1px 1px 0 0;vertical-align:middle}.mcag-dots{margin-top:3px;line-height:1;clear:both}.mcag-more{font-size:.58rem;color:var(--gray);font-weight:700}",
      "@media (max-width:860px){.mcag-c{grid-template-columns:88px 1fr;}.mcag-acts{grid-column:1/-1;justify-content:flex-start}.mcag-seg button{padding:6px 8px;font-size:.72rem}.mcag-tit{min-width:0;flex:1 1 140px}.mcag-grid{gap:2px}.mcag-d{min-height:54px;padding:4px;border-radius:8px}.mcag-pc{display:none}.mcag-tg .mcag-col{min-width:0;flex:1 1 100%}.mcag-wkg .mcag-col{min-width:46px}.mcag-wkg .mcag-bl b{font-size:.58rem}.mcag-wkg .mcag-ch{font-size:.6rem;padding:0 2px}.mcag-gutter{flex:0 0 36px;min-width:36px}.mcag-hh{font-size:.58rem;padding:1px 2px}}",
    ].join("");
    document.head.appendChild(s);
  }
  async function cargar() {
    var r = rango();
    var d = await api("ag_citas", { desde: r[0], hasta: r[1], calendarID: K.cal || "" });
    K.err = d && d.error ? d.error : ""; K.aviso = (d && d.aviso) || "";
    K.citas = (d && d.citas) || []; K.porDia = (d && d.porDia) || {};
  }
  async function render(route) {
    css();
    if (!K.fecha) K.fecha = ymd(new Date());
    if (!K._vistaIni) { K.vista = leerVista(); K._vistaIni = true; }
    if (!K.meta) { var m = await api("ag_meta", {}); if (!m || m.error) return '<p class="err">' + e((m && m.error) || "No se pudo cargar la Agenda") + "</p>"; K.meta = m; K.fecha = m.hoy || K.fecha; }
    await cargar();
    return html();
  }
  function citaCard(c) {
    var M = K.meta, hoy = M.hoy, puedeTk = !c.ticket && !c.atendida && c.fecha <= hoy && c.fecha >= add(hoy, -2);
    var acts = [];
    if (c.ticket) acts.push('<button class="btn ghost small" type="button" data-tk="' + e(c.ticket) + '">Ver ticket</button>');
    else if (puedeTk) acts.push('<button class="btn small" type="button" data-crear="' + e(c.id) + '">Crear ticket</button>');
    if (!c.atendida && c.fecha <= hoy && c.etiqueta !== "NO LLEGO") acts.push('<button class="btn ghost small" type="button" data-etq="NO LLEGO" data-id="' + e(c.id) + '">No llegó</button>');
    if (M.puede.mover && !c.atendida && c.fecha >= hoy) {
      if ((M.puede.whatsapp !== false) && !etqCerrada(c.etiqueta)) {
        acts.push('<button class="btn small mcag-wa' + (c.wa_enviado ? " ok" : "") + '" type="button" data-wa="' + e(c.id) + '">' + (c.wa_enviado ? "WhatsApp ✓" : "WhatsApp") + "</button>");
      }
      if (c.etiqueta !== "CONFIRMADA") acts.push('<button class="btn ghost small" type="button" data-etq="CONFIRMADA" data-id="' + e(c.id) + '">Confirmó</button>');
      acts.push('<button class="btn ghost small" type="button" data-mover="' + e(c.id) + '">Mover</button>');
      acts.push('<button class="btn ghost small" type="button" data-cancel="' + e(c.id) + '" style="color:#b2452a">Cancelar</button>');
    }
    return '<div class="mcag-c' + (c.atendida ? " ok" : "") + '" style="border-left-color:' + (c.nueva ? "#7C6BB0" : "#3E7CB1") + '"><div class="mcag-h">' + e(hora(c.datetime)) + "<small>" + e(c.duracion ? c.duracion + " min" : "") + "</small></div>" +
      '<div><span class="mcag-n" data-ver="' + e(c.id) + '">' + e((c.nombre + " " + c.apellido).trim() || "Sin nombre") + "</span>" + (c.nueva ? '<span class="mcag-tag">Nueva</span> ' : "") + etqPill(c.etiqueta) +
      '<div class="mcag-sub">' + subCita(c) + "</div>" + (c.notas ? '<div class="mcag-sub">📝 ' + e(c.notas) + "</div>" : "") + "</div>" +
      '<div class="mcag-acts">' + acts.join("") + "</div></div>";
  }
  function vistaLista() {
    if (!K.citas.length) return '<div class="mccf-card mccf-sub" style="text-align:center;padding:24px">Sin citas este día.</div>';
    return '<div class="mcag-list">' + K.citas.map(citaCard).join("") + "</div>";
  }
  function esMovil() { return !!(window.matchMedia && window.matchMedia("(max-width: 860px)").matches); }
  function calsVisibles() {
    var L = ((K.meta && K.meta.calendarios) || []).slice();
    if (K.cal) L = L.filter(function (c) { return String(c.id) === String(K.cal); });
    if (!L.length) {
      var seen = {};
      (K.citas || []).forEach(function (c) {
        var id = String(c.calendarID || "");
        if (id && !seen[id]) { seen[id] = 1; L.push({ id: c.calendarID, nombre: c.calendario || calNom(c.calendarID), persona: calNom(c.calendarID) }); }
      });
    }
    return L;
  }
  function colorCal(id) {
    var nom = calNom(id);
    if (window.MCColor && window.MCColor.color) { var c = window.MCColor.color(nom); if (c) return c; }
    if (typeof colorCosm === "function") return colorCosm(nom) || "#3E7CB1";
    return "#3E7CB1";
  }
  function inkDe(hex) {
    var n = parseInt(String(hex || "").replace("#", "").slice(0, 6), 16);
    if (isNaN(n)) return "#fff";
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? "#1f2d3d" : "#fff";
  }
  function arcoHoras(citas) {
    var a = 8, b = 20;
    (citas || []).forEach(function (c) {
      var s = minutos(c.datetime), e2 = s + (Number(c.duracion) || 60);
      if (s / 60 < a) a = Math.max(6, Math.floor(s / 60));
      if (e2 / 60 > b) b = Math.min(22, Math.ceil(e2 / 60));
    });
    if (b <= a) b = a + 1;
    return [a, b];
  }
  function bloqueHtml(c, h0, px, extra) {
    var s = minutos(c.datetime), dur = Number(c.duracion) || 60;
    var top = ((s - h0 * 60) / 60) * px, ht = Math.max(16, (dur / 60) * px - 2);
    var col = colorCal(c.calendarID), ink = inkDe(col);
    var nom = (c.nombre + " " + ((c.apellido || "").split(" ")[0] || "")).trim() || "Sin nombre";
    return '<button type="button" class="mcag-bl' + (c.atendida ? " ok" : "") + '" data-ver="' + e(c.id) + '" style="top:' + top + "px;height:" + ht + "px;background:" + col + ";color:" + ink + ";" + (extra || "") + '" title="' + e(hora(c.datetime) + " · " + nom + " · " + (tipoVisible(c.tipo_visible != null ? c.tipo_visible : c.tipo) || "") + (c.duracion ? " · " + c.duracion + " min" : "")) + '"><b>' + e(hora(c.datetime)) + "</b>" + (ht >= 28 ? "<span>" + e(nom) + "</span>" : "") + (ht >= 42 && tipoVisible(c.tipo_visible != null ? c.tipo_visible : c.tipo) ? "<span>" + e(tipoVisible(c.tipo_visible != null ? c.tipo_visible : c.tipo)) + "</span>" : "") + "</button>";
  }
  function lineaAhora(h0, h1, px, fecha) {
    var hoy = (K.meta && K.meta.hoy) || ymd(new Date());
    if (fecha !== hoy) return "";
    var n = new Date(), m = n.getHours() * 60 + n.getMinutes();
    if (m < h0 * 60 || m > h1 * 60) return "";
    return '<div class="mcag-now" style="top:' + (((m - h0 * 60) / 60) * px) + 'px"></div>';
  }
  function selectorCals(cals, actual) {
    if (!esMovil() || cals.length <= 1) return "";
    return '<div class="mcag-csel" role="tablist" aria-label="Cosmetóloga">' + cals.map(function (c) {
      var id = String(c.id);
      return '<button type="button" data-col="' + e(id) + '" class="' + (id === String(actual) ? "on" : "") + '">' + e(c.persona || c.nombre) + "</button>";
    }).join("") + "</div>";
  }
  function vistaDia() {
    var todas = calsVisibles(), cals = todas.slice(), citas = (K.citas || []).filter(function (c) { return !c.fecha || c.fecha === K.fecha; });
    if (esMovil() && todas.length > 1) {
      if (!K.col || !todas.some(function (c) { return String(c.id) === String(K.col); })) K.col = String(todas[0].id);
      cals = todas.filter(function (c) { return String(c.id) === String(K.col); });
    }
    var span = arcoHoras(citas), h0 = span[0], h1 = span[1], px = 52, alto = (h1 - h0) * px;
    var ejes = "";
    for (var h = h0; h < h1; h++) ejes += '<div class="mcag-hh" style="height:' + px + 'px">' + e(horaEje(h)) + "</div>";
    var cols = (cals.length ? cals : [{ id: "", nombre: "Agenda" }]).map(function (cal) {
      var items = cals.length ? citas.filter(function (c) { return String(c.calendarID) === String(cal.id); }) : citas;
      var bl = items.map(function (c) { return bloqueHtml(c, h0, px); }).join("");
      return '<div class="mcag-col"><div class="mcag-ch">' + (window.MCColor ? window.MCColor.pill(cal.persona || cal.nombre || "") : e(cal.persona || cal.nombre || "—")) + "</div>" +
        '<div class="mcag-track" style="height:' + alto + "px;--mcag-px:" + px + 'px">' + bl + lineaAhora(h0, h1, px, K.fecha) + "</div></div>";
    }).join("");
    return selectorCals(todas, K.col) + '<div class="mcag-tg" style="--mcag-px:' + px + 'px"><div class="mcag-gutter"><div class="mcag-ch"></div>' + ejes + "</div>" + cols + "</div>";
  }

  function porCal(d) {
    var cnt = K.porDia[d] || {}, cals = (K.meta.calendarios || []).filter(function (c) { return cnt[String(c.id)]; });
    return cals.map(function (c) { return '<span class="mcag-pc">' + e(c.nombre) + ": " + cnt[String(c.id)] + "</span>"; }).join("");
  }
  function vistaSemana() {
    var todas = calsVisibles(), cals = todas.slice(), l = rango()[0];
    if (esMovil() && todas.length > 1) {
      if (!K.col || !todas.some(function (c) { return String(c.id) === String(K.col); })) K.col = String(todas[0].id);
      cals = todas.filter(function (c) { return String(c.id) === String(K.col); });
    }
    var citas = K.citas || [], span = arcoHoras(citas), h0 = span[0], h1 = span[1], px = esMovil() ? 36 : 44, alto = (h1 - h0) * px;
    var ejes = "";
    for (var h = h0; h < h1; h++) ejes += '<div class="mcag-hh" style="height:' + px + 'px">' + e(horaEje(h)) + "</div>";
    var cols = "";
    for (var i = 0; i < 7; i++) {
      var d = add(l, i), x = dt(d);
      var items = citas.filter(function (c) { return c.fecha === d && (!cals.length || cals.some(function (cal) { return String(cal.id) === String(c.calendarID); })); });
      items.sort(function (a, b) { return minutos(a.datetime) - minutos(b.datetime); });
      var used = [];
      var bl = items.map(function (c) {
        var s = minutos(c.datetime), e2 = s + (Number(c.duracion) || 60), lane = 0;
        for (; lane < 6; lane++) {
          if (!used[lane] || used[lane] <= s) { used[lane] = e2; break; }
        }
        var lanes = Math.max(1, used.length);
        var left = (lane * (100 / Math.max(lanes, lane + 1)));
        var width = (100 / Math.max(lanes, lane + 1)) - 1;
        return bloqueHtml(c, h0, px, "left:" + left + "%;width:" + width + "%;right:auto");
      }).join("");
      cols += '<div class="mcag-col"><div class="mcag-ch" data-dia="' + d + '">' + DIAS[x.getDay()] + " " + x.getDate() + (items.length ? " · " + items.length : "") + "</div>" +
        '<div class="mcag-track" style="height:' + alto + "px;--mcag-px:" + px + 'px">' + bl + lineaAhora(h0, h1, px, d) + "</div></div>";
    }
    return selectorCals(todas, K.col) + '<div class="mcag-wkg" style="--mcag-px:' + px + 'px"><div class="mcag-gutter"><div class="mcag-ch"></div>' + ejes + "</div>" + cols + "</div>";
  }
  function vistaMes() {
    var r = rango(), ini = lunes(r[0]), h = DIAS.slice(1).concat(DIAS[0]).map(function (d) { return '<div class="mcag-dh">' + d + "</div>"; }).join(""), hoy = K.meta.hoy, mes = r[0].slice(0, 7);
    for (var d = ini, i = 0; i < 42; i++, d = add(d, 1)) {
      if (i >= 35 && d.slice(0, 7) !== mes) break;
      var n = (K.porDia[d] || {}).total || 0;
      var dots = (K.citas || []).filter(function (c) { return c.fecha === d; }).slice(0, 4).map(function (c) {
        return '<i class="mcag-dot" style="background:' + colorCal(c.calendarID) + '" title="' + e(hora(c.datetime) + " · " + ((c.nombre || "") + " " + (c.apellido || "")).trim()) + '"></i>';
      }).join("");
      var extra = n > 4 ? '<span class="mcag-more">+' + (n - 4) + "</span>" : "";
      h += '<div class="mcag-d' + (d.slice(0, 7) !== mes ? " fuera" : "") + (d === hoy ? " hoy" : "") + '" data-dia="' + d + '"><b>' + dt(d).getDate() + "</b>" + (n ? '<span class="mcag-cnt">' + n + "</span>" : "") + (dots ? '<div class="mcag-dots">' + dots + extra + "</div>" : "") + (esMovil() ? "" : porCal(d)) + "</div>";
    }
    return '<div class="mcag-grid">' + h + "</div>";
  }
  function html() {
    var M = K.meta, todos = M.nivel === "todos", tot = K.citas.length;
    return '<div id="mcag-root"><div class="mcag-bar"><h2>Agenda</h2>' +
      '<div class="mcag-seg">' + [["lista", "Lista"], ["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"]].map(function (v) { return '<button type="button" data-vista="' + v[0] + '" class="' + (K.vista === v[0] ? "on" : "") + '">' + v[1] + "</button>"; }).join("") + "</div>" +
      '<button class="btn ghost small" type="button" data-mov="-1">‹</button><button class="btn ghost small" type="button" data-mov="0">Hoy</button><button class="btn ghost small" type="button" data-mov="1">›</button>' +
      '<span class="mcag-tit">' + e(titulo()) + "</span>" + '<span class="mccf-sub">' + tot + " cita" + (tot !== 1 ? "s" : "") + "</span><span style=\"flex:1\"></span>" +
      (todos && (M.calendarios || []).length > 1 ? '<select id="mcag-cal" style="padding:6px 8px;border:1.5px solid var(--cream-d);border-radius:9px;font:inherit;font-size:.8rem"><option value="">Todas las cosmetólogas</option>' + M.calendarios.map(function (c) { return '<option value="' + e(c.id) + '"' + (String(K.cal) === String(c.id) ? " selected" : "") + ">" + e(c.persona || c.nombre) + (c.activo ? "" : " (inactivo)") + "</option>"; }).join("") + "</select>" : "") +
      (M.puede.agendar ? '<button class="btn small" type="button" id="mcag-nueva">+ Agendar</button>' : "") +
      (M.admin ? '<button class="btn ghost small" type="button" id="mcag-ing" title="Pone INGRESADO Y COMP en las citas de tickets conciliados (como la conciliación vieja)">Marcar ingresados</button><button class="btn ghost small" type="button" id="mcag-cals">Calendarios</button>' : "") + "</div>" +
      (K.err ? '<p class="err">' + e(K.err) + "</p>" : "") + (K.aviso ? '<p class="mccf-note">' + e(K.aviso) + "</p>" : "") +
      (K.vista === "mes" ? vistaMes() : K.vista === "semana" ? vistaSemana() : K.vista === "dia" ? vistaDia() : vistaLista()) +
      '<p class="mccf-sub" style="margin-top:12px">Acuity sigue siendo el calendario oficial; aquí se ve y se opera lo mismo. ' + e(M.nota || "") + "</p></div>";
  }
  function dlg(inner) { var b = document.createElement("div"); b.className = "mcag-dlg"; b.innerHTML = '<div class="mcag-box">' + inner + "</div>"; document.body.appendChild(b); b.addEventListener("click", function (ev) { if (ev.target === b || ev.target.closest("[data-x]")) b.remove(); }); return b; }
  async function refrescar(main) { await cargar(); var r = main.querySelector("#mcag-root"); if (r) { r.outerHTML = html(); wire(main); } }
  function crearTicket(c, ficha) {
    sessionStorage.setItem("ag.tk", JSON.stringify({ id: c.id, nombre: c.nombre, apellido: c.apellido, cedula: (ficha && ficha.cedula) || "" }));
    go("#/doc/ov");
  }
  async function verCita(main, id) {
    var b = dlg('<p class="mccf-sub">Cargando…</p>');
    var r = await api("ag_cita", { id: id });
    if (!r || r.error) { b.querySelector(".mcag-box").innerHTML = '<p class="err">' + e((r && r.error) || "No se pudo") + '</p><button class="btn ghost small" data-x>Cerrar</button>'; return; }
    var c = r.cita, f = c.ficha;
    var kv = function (k, v) { return v ? "<dt>" + e(k) + "</dt><dd>" + e(v) + "</dd>" : ""; };
    b.querySelector(".mcag-box").innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><h3 style="margin:0">' + e(c.nombre + " " + c.apellido) + '</h3><button class="btn ghost small" data-x>×</button></div>' +
      '<div class="mcag-sub">' + e(hora(c.datetime)) + " · " + e(c.duracion + " min") + " · " + subCita(c) + " " + etqPill(c.etiqueta) + "</div>" +
      '<dl class="mcag-kv">' + kv("Teléfono", c.telefono) + kv("Email", c.email) + kv("Notas", c.notas) + (c.forms || []).map(function (x) { return kv(x.campo, x.valor); }).join("") + "</dl>" +
      (f ? '<b style="font-size:.84rem">Ficha de registro</b><dl class="mcag-kv">' + kv("CI", f.cedula) + kv("Tipo de piel", f.tipoPiel) + kv("Alergias", f.alergias) + kv("Medicación", f.medicacion) + kv("Autoriza fotos", f.autorizaFotos) + "</dl>" : '<p class="mccf-note">No encontré una ficha de registro única para este nombre (no se usa el teléfono como cédula).</p>') +
      '<div class="mccf-acts" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:10px">' + (f ? '<button class="btn ghost small" type="button" data-ficha="' + e(f.clienteKey) + '">Abrir ficha</button>' : "") +
      (c.ticket ? '<button class="btn ghost small" type="button" data-tk="' + e(c.ticket) + '">Ver ticket</button>' : '<button class="btn small" type="button" data-crear2>Crear ticket</button>') + "</div>";
    var fb = b.querySelector("[data-ficha]"); if (fb) fb.onclick = function () { b.remove(); go("#/m/clientes/c/" + encodeURIComponent(fb.getAttribute("data-ficha"))); };
    var tb = b.querySelector("[data-tk]"); if (tb) tb.onclick = function () { b.remove(); sessionStorage.setItem("mctk.volver", "#/m/agenda"); go("#/m/tickets/t/" + encodeURIComponent(tb.getAttribute("data-tk"))); };
    var cb = b.querySelector("[data-crear2]"); if (cb) cb.onclick = function () { b.remove(); crearTicket(c, f); };
  }
  function horasUI(box, sel) {
    var tipo = box.querySelector("#ag-tipo").value, fecha = box.querySelector("#ag-fecha").value, cal = box.querySelector("#ag-calsel").value, out = box.querySelector("#ag-hrs");
    if (!tipo || !fecha) { out.innerHTML = '<span class="mccf-sub">Elige tipo y fecha</span>'; return; }
    out.innerHTML = '<span class="mccf-sub">Buscando horarios…</span>';
    api("ag_disponibilidad", { tipoID: tipo, fecha: fecha, calendarID: cal }).then(function (r) {
      if (!r || r.error) { out.innerHTML = '<span class="err">' + e((r && r.error) || "Sin horarios") + "</span>"; return; }
      out.innerHTML = r.horas.length ? r.horas.map(function (h) { return '<button type="button" data-h="' + e(h.time) + '">' + e(hora(h.time)) + "</button>"; }).join("") : '<span class="mccf-sub">No hay horarios libres ese día. Puedes escribir la hora a mano abajo.</span>';
      out.onclick = function (ev) { var x = ev.target.closest("[data-h]"); if (!x) return; out.querySelectorAll("button").forEach(function (y) { y.classList.toggle("on", y === x); }); sel.v = x.getAttribute("data-h"); box.querySelector("#ag-hman").value = hm24(sel.v); };
    });
  }
  function horaFinal(box, sel) {
    var man = box.querySelector("#ag-hman").value, f = box.querySelector("#ag-fecha").value;
    if (sel.v && hm24(sel.v) === man) return sel.v;
    return man && f ? f + "T" + man + ":00-0500" : "";
  }
  function dlgAgendar(main, base) {
    var M = K.meta, sel = { v: "" }, editar = !!base;
    var b = dlg('<div style="display:flex;justify-content:space-between"><h3 style="margin:0">' + (editar ? "Mover cita de " + e(base.nombre) : "Agendar cita") + '</h3><button class="btn ghost small" data-x>×</button></div>' +
      '<label>Tipo de cita</label><select id="ag-tipo"' + (editar ? " disabled" : "") + ">" + (M.tipos || []).map(function (t) { return '<option value="' + e(t.id) + '"' + (editar && String(base.tipoID) === String(t.id) ? " selected" : "") + ">" + e(t.nombre) + " · " + e(t.duracion) + " min</option>"; }).join("") + "</select>" +
      '<label>Cosmetóloga</label><select id="ag-calsel">' + (M.calendarios || []).filter(function (c) { return c.activo; }).map(function (c) { return '<option value="' + e(c.id) + '"' + ((editar ? String(base.calendarID) : String(K.cal)) === String(c.id) ? " selected" : "") + ">" + e(c.persona || c.nombre) + "</option>"; }).join("") + "</select>" +
      '<label>Fecha</label><input type="date" id="ag-fecha" value="' + e(editar ? base.fecha : K.fecha) + '"><div class="mcag-hrs" id="ag-hrs"></div><label>Hora</label><input type="time" id="ag-hman">' +
      (editar ? "" : '<label>Nombre</label><input id="ag-nom"><label>Apellido</label><input id="ag-ape"><label>Teléfono (opcional)</label><input id="ag-tel" inputmode="tel"><label>Email (opcional)</label><input id="ag-mail" type="email"><label>Notas</label><textarea id="ag-notas" rows="2"></textarea>' +
        ((M.addons || []).length ? '<label>Extras</label><div>' + M.addons.map(function (a) { return '<label style="display:inline-flex;gap:4px;margin:2px 10px 2px 0;color:var(--navy-d)"><input type="checkbox" value="' + e(a.id) + '" style="width:auto"> ' + e(a.nombre) + "</label>"; }).join("") + "</div>" : "")) +
      '<label style="display:flex;gap:6px;align-items:center;color:var(--navy-d)"><input type="checkbox" id="ag-avisar" style="width:auto"> Enviar correo de Acuity a la clienta</label>' +
      '<p class="err" id="ag-err"></p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost small" data-x>Cancelar</button><button class="btn small" type="button" id="ag-ok">' + (editar ? "Mover" : "Agendar") + "</button></div>");
    var box = b.querySelector(".mcag-box");
    ["#ag-tipo", "#ag-fecha", "#ag-calsel"].forEach(function (q) { var _el = box.querySelector(q); if (_el) _el.onchange = function () { sel.v = ""; horasUI(box, sel); }; });
    horasUI(box, sel);
    var _el = box.querySelector("#ag-ok"); if (_el) _el.onclick = async function () {
      var err = box.querySelector("#ag-err"), when = horaFinal(box, sel); err.textContent = "";
      if (!when) { err.textContent = "Elige la hora"; return; }
      var r;
      if (editar) r = await api("ag_reagendar", { id: base.id, datetime: when, calendarID: box.querySelector("#ag-calsel").value, avisar: box.querySelector("#ag-avisar").checked });
      else r = await api("ag_crear", { tipoID: box.querySelector("#ag-tipo").value, calendarID: box.querySelector("#ag-calsel").value, datetime: when, nombre: box.querySelector("#ag-nom").value, apellido: box.querySelector("#ag-ape").value, telefono: box.querySelector("#ag-tel").value, email: box.querySelector("#ag-mail").value, notas: box.querySelector("#ag-notas").value, avisar: box.querySelector("#ag-avisar").checked, addonIDs: [].slice.call(box.querySelectorAll("input[type=checkbox][value]")).filter(function (x) { return x.checked; }).map(function (x) { return x.value; }) });
      if (!r || r.error) { err.textContent = (r && r.error) || "No se pudo"; return; }
      b.remove(); toast2(editar ? "Cita movida" : "Cita agendada"); K.fecha = box.querySelector("#ag-fecha").value || K.fecha; refrescar(main);
    };
  }
  function dlgCalendarios(main) {
    var M = K.meta;
    var b = dlg('<div style="display:flex;justify-content:space-between"><h3 style="margin:0">Calendarios de Acuity</h3><button class="btn ghost small" data-x>×</button></div><p class="mccf-sub">Enlaza cada calendario con la persona del spa (nombre completo como en Usuarios). La cosmetóloga ve solo el suyo.</p>' +
      (M.calendarios || []).map(function (c) { return '<div class="mccf-card" style="padding:8px;margin:6px 0" data-cal="' + e(c.id) + '"><b>' + e(c.nombre) + '</b> <span class="mccf-sub">#' + e(c.id) + (c.enAcuity ? "" : " · ya no está en Acuity") + '</span><label>Persona</label><input data-f="persona" value="' + e(c.persona) + '"><label style="display:flex;gap:6px;align-items:center;color:var(--navy-d)"><input type="checkbox" data-f="activo" style="width:auto"' + (c.activo ? " checked" : "") + "> Activo para agendar</label></div>"; }).join("") +
      '<p class="err" id="ag-cerr"></p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost small" data-x>Cerrar</button><button class="btn small" type="button" id="ag-cok">Guardar</button></div>');
    var _el = b.querySelector("#ag-cok"); if (_el) _el.onclick = async function () {
      var cards = b.querySelectorAll("[data-cal]");
      for (var i = 0; i < cards.length; i++) {
        var x = cards[i], r = await api("ag_calendario_guardar", { calendarID: x.getAttribute("data-cal"), nombre: (M.calendarios.find(function (c) { return String(c.id) === x.getAttribute("data-cal"); }) || {}).nombre, persona: x.querySelector('[data-f="persona"]').value, activo: x.querySelector('[data-f="activo"]').checked });
        if (!r || r.error) { b.querySelector("#ag-cerr").textContent = (r && r.error) || "No se pudo"; return; }
      }
      b.remove(); K.meta = null; toast2("Calendarios guardados"); draw();
    };
  }
  function wire(main) {
    var root = main.querySelector("#mcag-root"); if (!root) return;
    root.querySelectorAll("[data-vista]").forEach(function (x) { x.onclick = function () { K.vista = x.getAttribute("data-vista"); guardarVista(); refrescar(main); }; });
    root.querySelectorAll("[data-col]").forEach(function (x) { x.onclick = function () { K.col = x.getAttribute("data-col"); var r = main.querySelector("#mcag-root"); if (r) { r.outerHTML = html(); wire(main); } }; });
    root.querySelectorAll("[data-mov]").forEach(function (x) {
      x.onclick = function () {
        var m = +x.getAttribute("data-mov");
        if (!m) K.fecha = K.meta.hoy; else if (K.vista === "mes") { var d = dt(K.fecha); K.fecha = ymd(new Date(d.getFullYear(), d.getMonth() + m, 1)); } else K.fecha = add(K.fecha, m * (K.vista === "semana" ? 7 : 1));
        refrescar(main);
      };
    });
    var cs = root.querySelector("#mcag-cal"); if (cs) cs.onchange = function () { K.cal = this.value; refrescar(main); };
    var nv = root.querySelector("#mcag-nueva"); if (nv) nv.onclick = function () { dlgAgendar(main, null); };
    var cl = root.querySelector("#mcag-cals"); if (cl) cl.onclick = function () { dlgCalendarios(main); };
    var ing = root.querySelector("#mcag-ing"); if (ing) ing.onclick = async function () {
      var r0 = rango(), hasta = K.meta.hoy, desde = add(hasta, -30);
      var s = await api("ag_ingresado", { desde: desde, hasta: hasta, simular: true });
      if (!s || s.error) { toast2((s && s.error) || "No se pudo", true); return; }
      if (!confirm("Últimos 30 días: " + s.revisados + " tickets conciliados.\n" + s.marcadas + " citas por marcar INGRESADO Y COMP, " + s.yaTenian + " ya lo tenían, " + s.sinCita + " sin cita encontrada.\n\n¿Marcar ahora?")) return;
      var r = await api("ag_ingresado", { desde: desde, hasta: hasta });
      if (!r || r.error) { toast2((r && r.error) || "No se pudo", true); return; }
      toast2(r.marcadas + " citas marcadas INGRESADO Y COMP" + (r.errores && r.errores.length ? " · errores: " + r.errores.join("; ") : "")); refrescar(main);
    };
    root.onclick = async function (ev) {
      var t;
      if ((t = ev.target.closest("[data-dia]"))) { K.fecha = t.getAttribute("data-dia"); K.vista = "dia"; guardarVista(); refrescar(main); return; }
      if ((t = ev.target.closest("[data-ver]"))) { verCita(main, t.getAttribute("data-ver")); return; }
      if ((t = ev.target.closest("[data-tk]"))) { sessionStorage.setItem("mctk.volver", "#/m/agenda"); go("#/m/tickets/t/" + encodeURIComponent(t.getAttribute("data-tk"))); return; }
      var cita = function (id) { return K.citas.find(function (c) { return String(c.id) === String(id); }); };
      if ((t = ev.target.closest("[data-crear]"))) { var c0 = cita(t.getAttribute("data-crear")), fi = await api("ag_cita", { id: c0.id }); crearTicket(c0, fi && fi.cita && fi.cita.ficha); return; }
      if ((t = ev.target.closest("[data-mover]"))) { dlgAgendar(main, cita(t.getAttribute("data-mover"))); return; }
      if ((t = ev.target.closest("[data-wa]"))) {
        var idWa = t.getAttribute("data-wa"); t.disabled = true;
        var rwa = await api("ag_wa", { id: idWa });
        t.disabled = false;
        if (!rwa || rwa.error) { toast2((rwa && rwa.error) || "No se pudo armar el WhatsApp", true); return; }
        if (!rwa.tiene_tel) { toast2("Esta cita no tiene teléfono en Acuity", true); return; }
        abrirWaUrl(rwa);
        var cwa = cita(idWa); if (cwa) cwa.wa_enviado = true;
        t.classList.add("ok"); t.textContent = "WhatsApp ✓";
        return;
      }
      if ((t = ev.target.closest("[data-cancel]"))) {
        var c1 = cita(t.getAttribute("data-cancel")), mot = prompt("¿Cancelar la cita de " + c1.nombre + " (" + hora(c1.datetime) + ")? Se libera el horario en Acuity.\nMotivo:"); if (mot === null) return;
        var r = await api("ag_cancelar", { id: c1.id, motivo: mot }); if (!r || r.error) { toast2((r && r.error) || "No se pudo", true); return; }
        toast2("Cita cancelada"); refrescar(main); return;
      }
      if ((t = ev.target.closest("[data-etq]"))) {
        var r2 = await api("ag_etiqueta", { id: t.getAttribute("data-id"), etiqueta: t.getAttribute("data-etq") });
        if (!r2 || r2.error) { toast2((r2 && r2.error) || "No se pudo", true); return; }
        toast2("Marcada: " + r2.etiqueta); refrescar(main);
      }
    };
  }
  // «Crear ticket» desde la cita: precarga la pantalla de Nuevo ticket y, al enviarlo, enlaza la cita (COMPLETADO).
  function precargarTicket() {
    var raw = sessionStorage.getItem("ag.tk"); if (!raw || !/^#\/doc\/ov/.test(location.hash)) return;
    var x; try { x = JSON.parse(raw); } catch (er) { sessionStorage.removeItem("ag.tk"); return; }
    var intentos = 0;
    (function poner() {
      var n = document.getElementById("inp-nom"), a = document.getElementById("inp-ape");
      if (!n || !a) { if (intentos++ < 50) setTimeout(poner, 150); return; }
      sessionStorage.removeItem("ag.tk");
      try { T.nombre = x.nombre || ""; T.apellido = x.apellido || ""; } catch (er) {}
      n.value = x.nombre || ""; a.value = x.apellido || "";
      var ced = document.getElementById("inp-ced"); if (ced && x.cedula) { ced.value = x.cedula; try { T.cedula = x.cedula; } catch (er) {} }
      window._cedAutofill = true;
      if (typeof buscarEnRegistroSheet === "function") buscarEnRegistroSheet("q", ((x.nombre || "") + " " + (x.apellido || "")).trim(), true);
      window._agCitaTk = { id: x.id, nombre: x.nombre };
      toast2("Ticket para " + (x.nombre || "la clienta") + " (cita de la Agenda). Elige los servicios.");
    })();
  }
  window._onTicketGuardado = function (d) {
    var c = window._agCitaTk; if (!c) return; window._agCitaTk = null;
    var clave = d && (d.ticket || d.beta_num); if (!clave) return;
    api("ag_vincular", { id: c.id, ticket: clave }).then(function (r) { if (r && r.ok) toast2("Cita de " + (c.nombre || "la clienta") + " marcada " + ((r.etiqueta && r.etiqueta.etiqueta) || "COMPLETADO")); });
  };
  window.addEventListener("hashchange", function () { setTimeout(precargarTicket, 50); });
  setTimeout(precargarTicket, 300);
  window.MCAgenda = { render: render, wire: wire, hora: hora, hora12: hora12, horaEje: horaEje, hm24: hm24, _k: K };
})();
