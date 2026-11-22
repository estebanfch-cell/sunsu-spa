/* TK210 (Emilia 21/11): tickets subidos tarde.
 * - Aviso al equipo (todos los roles) por 15 días, en el Dashboard / Inicio y en Nuevo ticket.
 * - Al enviar un ticket de una atención de otro día: pide la fecha real (formato que escriban) y avisa del 50%.
 * - La regla y el cálculo viven en el backend (fecha_atencion.ts); aquí solo se pregunta y se muestra. */
(function () {
  "use strict";
  var HASTA = "2026-12-06";
  var TEXTO = "Desde hoy, los tickets deben subirse el mismo día de la atención. Los tickets subidos al día siguiente o después pagarán el 50% de la comisión.";
  var PROMPT = "Este ticket se paga al 50% de comisión por subirse tarde.";
  var MESES = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hoyGye() { var d = new Date(Date.now() - 5 * 3600 * 1000); return d.toISOString().slice(0, 10); }
  function ymd(y, m, d) {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
    var dt = new Date(Date.UTC(y, m - 1, d, 12));
    return dt.getUTCMonth() === m - 1 ? dt.toISOString().slice(0, 10) : "";
  }
  function addDias(f, n) { var t = new Date(f + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function sinAnio(m, d, hoy) {
    var y = Number(hoy.slice(0, 4)), f = ymd(y, m, d);
    if (f && f > hoy) f = ymd(y - 1, m, d);
    return f;
  }
  /** Igual que el backend: 20/11, 20/11/26, 20-11-2026, 2026-11-20, «20 nov», «20 de noviembre», hoy/ayer/antier. */
  function parse(v, hoy) {
    hoy = hoy || hoyGye();
    var t = String(v == null ? "" : v).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!t) return "";
    if (t === "hoy") return hoy;
    if (t === "ayer") return addDias(hoy, -1);
    if (t === "antier" || t === "anteayer") return addDias(hoy, -2);
    var m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return ymd(+m[1], +m[2], +m[3]);
    m = t.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?:\s*[\/.\-]\s*(\d{2,4}))?$/);
    if (m) { if (!m[3]) return sinAnio(+m[2], +m[1], hoy); var y = +m[3]; if (y < 100) y += 2000; return ymd(y, +m[2], +m[1]); }
    m = t.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]{3})[a-z]*\.?(?:\s*(?:de|del)?\s*(\d{2,4}))?$/);
    if (m && MESES[m[2]]) { if (!m[3]) return sinAnio(MESES[m[2]], +m[1], hoy); var y2 = +m[3]; if (y2 < 100) y2 += 2000; return ymd(y2, MESES[m[2]], +m[1]); }
    return "";
  }
  /* T es `let` global de beta-screens.js (scope léxico compartido, no window.T). */
  function tk() { try { return typeof T !== "undefined" ? T : null; } catch (e) { return null; } }
  function ddmm(f) { return f ? f.slice(8, 10) + "/" + f.slice(5, 7) + "/" + f.slice(0, 4) : ""; }
  function activo() { return hoyGye() <= HASTA; }
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function css() {
    if (document.getElementById("sunsu-tarde-css")) return;
    var st = document.createElement("style");
    st.id = "sunsu-tarde-css";
    st.textContent = ".sunsu-aviso-tarde{display:flex;gap:10px;align-items:flex-start;background:#FFF8E6;border:1.5px solid #E8C468;color:#6B5310;border-radius:12px;padding:10px 14px;margin:0 0 12px;font-size:.82rem;line-height:1.35;font-weight:600}" +
      ".sunsu-aviso-tarde .i{font-size:1rem;line-height:1.2}" +
      ".sunsu-tarde-link{display:inline-block;margin:6px 0 0;font-size:.74rem;color:var(--gray,#777);text-decoration:underline;cursor:pointer;background:none;border:0;padding:0;font-family:inherit}" +
      ".sunsu-tarde-sel{display:inline-block;margin:6px 0 0 8px;font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:#EEF0F3;color:#555}";
    document.head.appendChild(st);
  }
  function bannerHtml() { return '<div class="sunsu-aviso-tarde" role="note"><span class="i">📢</span><span>' + esc(TEXTO) + "</span></div>"; }

  /** Fecha de atención para el payload. Devuelve "" si es de hoy; null si la persona canceló (no se bloquea: se envía normal). */
  function fechaParaEnvio() {
    var hoy = hoyGye(), T0 = tk() || {};
    var elegida = T0.fechaAtencion && parse(T0.fechaAtencion, hoy);
    if (elegida) return elegida < hoy ? elegida : "";
    var sug = String(T0._fechaSugerida || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sug) || sug >= hoy) return "";
    return preguntar(sug);
  }
  function preguntar(sug) {
    var hoy = hoyGye();
    for (var i = 0; i < 3; i++) {
      var r = window.prompt("¿Qué día fue la atención?\nEste ticket se está subiendo otro día. " + PROMPT + "\n\nFecha de la atención (por ejemplo 20/11):", ddmm(sug));
      if (r == null) return "";
      if (!String(r).trim()) return "";
      var f = parse(r, hoy);
      if (f && f <= hoy) return f < hoy ? f : "";
      window.alert("No entendí la fecha. Escríbela como 20/11 o 20/11/2026.");
    }
    return "";
  }
  function elegirOtroDia() {
    var T0 = tk(); if (!T0) return;
    var f = preguntar(T0.fechaAtencion || T0._fechaSugerida || addDias(hoyGye(), -1));
    T0.fechaAtencion = f || "";
    pintarLink();
    if (f && typeof window.toast === "function") window.toast("Atención del " + ddmm(f) + ". " + PROMPT, "#C9A227");
  }
  function pintarLink() {
    var b = document.getElementById("btn-env-tk");
    if (!b || window._tkEdicion || window._esCotizacion) return;
    var w = document.getElementById("sunsu-tarde-wrap");
    if (!w) { w = document.createElement("div"); w.id = "sunsu-tarde-wrap"; w.style.textAlign = "center"; b.parentNode.insertBefore(w, b.nextSibling); }
    var T0 = tk(), f = T0 && T0.fechaAtencion;
    var html = '<button type="button" class="sunsu-tarde-link" id="sunsu-tarde-btn">📅 Atención de otro día</button>' +
      (f ? '<span class="sunsu-tarde-sel">Atención: ' + esc(ddmm(f)) + " · Subido tarde</span>" : "");
    if (w.innerHTML !== html) { w.innerHTML = html; var bt = document.getElementById("sunsu-tarde-btn"); if (bt) bt.onclick = elegirOtroDia; }
  }
  function despuesDeGuardar(d) {
    if (d && d.subido_tarde && typeof window.toast === "function") {
      setTimeout(function () { window.toast("Subido tarde (atención " + ddmm(d.fecha_atencion) + "). " + PROMPT, "#C9A227"); }, 2200);
    }
  }
  // Encadena el hook existente de la Agenda sin pisarlo.
  var prevHook = window._onTicketGuardado;
  Object.defineProperty(window, "_onTicketGuardado", {
    configurable: true,
    get: function () { return function (d, p) { try { despuesDeGuardar(d); } catch (e) {} if (typeof prevHook === "function") return prevHook(d, p); }; },
    set: function (f) { prevHook = f; },
  });

  function inyectar() {
    css();
    var on = activo();
    // Dashboard admin, Inicio de staff/recepción y Nuevo ticket.
    var sitios = [document.querySelector(".dsh-wrap"), document.getElementById("mcsh-root")];
    var b = document.getElementById("btn-env-tk");
    var c = b && document.getElementById("content");
    if (c && !window._tkEdicion && !window._esCotizacion) sitios.push(c);
    sitios.forEach(function (el) {
      if (!el) return;
      var ya = el.querySelector(":scope > .sunsu-aviso-tarde");
      if (!on) { if (ya) ya.remove(); return; }
      if (ya) return;
      var tmp = document.createElement("div"); tmp.innerHTML = bannerHtml();
      var hola = el.id === "mcsh-root" ? el.querySelector(":scope > .mcsh-hola") : null;
      if (hola) hola.parentNode.insertBefore(tmp.firstChild, hola.nextSibling);
      else el.insertBefore(tmp.firstChild, el.firstChild);
    });
    if (b) pintarLink();
  }
  var pend = 0;
  function programar() { if (pend) return; pend = setTimeout(function () { pend = 0; try { inyectar(); } catch (e) {} }, 120); }
  if (typeof MutationObserver === "function") {
    var start = function () { new MutationObserver(programar).observe(document.body, { childList: true, subtree: true }); programar(); };
    if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  }
  window.addEventListener("hashchange", programar);

  // Etiqueta neutra «Subido tarde» en la lista de Tickets (envuelve _tkEstados sin tocar beta-screens.js).
  function envolverEstados() {
    var f = window._tkEstados;
    if (typeof f !== "function" || f._tk210) return !!f;
    var w = function (t) { var out = f.apply(this, arguments); try { if (t && t.subido_tarde && Array.isArray(out) && !out.some(function (c) { return c && c.t === "Subido tarde"; })) out.push({ c: "gris", t: "Subido tarde" }); } catch (e) {} return out; };
    w._tk210 = true;
    window._tkEstados = w;
    return true;
  }
  if (!envolverEstados()) { var nEnv = 0, iEnv = setInterval(function () { if (envolverEstados() || ++nEnv > 40) clearInterval(iEnv); }, 250); }

  window.SunsuTarde = { parse: parse, hoy: hoyGye, activo: activo, texto: TEXTO, prompt: PROMPT, hasta: HASTA, fechaParaEnvio: fechaParaEnvio, preguntar: preguntar, ddmm: ddmm, bannerHtml: bannerHtml };
})();
