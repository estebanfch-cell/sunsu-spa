// 📱 iPhone sin scroll horizontal (Emilia 17/11 22:13). En pantallas ≤640px, toda tabla que no cabe en el
// ancho se muestra como tarjetas apiladas: cada fila es una tarjeta y cada celda lleva el nombre de su columna.
// Las tablas que ya caben se quedan igual. Escritorio no cambia (al volver a >640px se quitan las clases).
(function () {
  "use strict";
  var MQ = window.matchMedia ? window.matchMedia("(max-width: 640px)") : null;
  function movil() { return !!(MQ && MQ.matches); }
  function etiquetas(t) {
    var head = t.tHead && t.tHead.rows.length ? t.tHead.rows[t.tHead.rows.length - 1] : null;
    if (!head) { var f = t.rows[0]; if (f && f.querySelector("th") && !f.querySelector("td")) head = f; }
    var L = [];
    if (head) for (var i = 0; i < head.cells.length; i++) { var c = head.cells[i], txt = (c.textContent || "").replace(/[▲▼]/g, "").trim(); for (var k = 0; k < (c.colSpan || 1); k++) L.push(txt); }
    return { L: L, head: head };
  }
  function apilar(t) {
    var x = etiquetas(t);
    t.classList.add("mob-stack");
    for (var r = 0; r < t.rows.length; r++) {
      var row = t.rows[r]; if (row === x.head || (row.parentNode && row.parentNode.tagName === "THEAD")) continue;
      var col = 0;
      for (var j = 0; j < row.cells.length; j++) {
        var td = row.cells[j];
        if (!td.hasAttribute("data-label")) td.setAttribute("data-label", (td.colSpan || 1) > 1 ? "" : (x.L[col] || ""));
        col += td.colSpan || 1;
      }
    }
  }
  function cabe(t) {
    var p = t.parentElement; if (!p) return true;
    var w = p.clientWidth || p.getBoundingClientRect().width;
    return t.scrollWidth <= w + 2 && t.getBoundingClientRect().right <= window.innerWidth + 1;
  }
  function revisar() {
    var T = document.querySelectorAll("table");
    if (!movil()) { for (var i = 0; i < T.length; i++) T[i].classList.remove("mob-stack"); return; }
    for (var k = 0; k < T.length; k++) {
      var t = T[k];
      if (t.classList.contains("mob-no") || t.classList.contains("mcp-tbl") || t.closest(".mob-table,.doc-print,#mcpv")) continue;
      if (t.offsetParent === null && !t.classList.contains("mob-stack")) continue;
      if (t.classList.contains("mob-stack")) { apilar(t); continue; } // filas nuevas: ponerles etiqueta
      if (!cabe(t)) apilar(t);
    }
  }
  var pend = 0;
  function pronto() { if (pend) return; pend = setTimeout(function () { pend = 0; try { revisar(); } catch (e) { /* nunca romper la pantalla */ } }, 60); }
  function iniciar() {
    pronto();
    try { new MutationObserver(pronto).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* navegador viejo */ }
    window.addEventListener("resize", pronto);
    if (MQ && MQ.addEventListener) MQ.addEventListener("change", pronto);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
  window.MCMovil = { revisar: revisar };
})();
