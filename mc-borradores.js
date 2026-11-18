// 🧾 Facturas borrador (TK94, Emilia 18/11): Ventas › #/m/borradores. Los borradores Migo ya no salen en Tickets.
// Personal: las suyas + las sin asignar de su día. Admin y recepción: todas. Abrir → completar → «Pendiente de aprobar».
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function f(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ""); return m ? m[3] + "/" + m[2] : (ymd || ""); }
  function $m(v) { return "$" + (Math.round((Number(v) || 0) * 100) / 100).toFixed(2); }
  var K = { filtro: "todas", q: "", d: null };
  function css() {
    if (document.getElementById("mcfb-css")) return;
    var s = document.createElement("style"); s.id = "mcfb-css";
    s.textContent = [
      ".mcfb{container-type:inline-size;max-width:1100px}",
      ".mcfb-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}.mcfb-h h2{margin:0;flex:1 1 auto;font-size:1.2rem;min-width:0}",
      ".mcfb-sub{margin:0 0 10px;color:var(--gray,#6b7280);font-size:.8rem}",
      ".mcfb-f{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px}",
      ".mcfb-f button{border:1.5px solid var(--cream-d,#e6dccb);background:var(--white,#fff);border-radius:999px;padding:5px 12px;font-size:.78rem;font-weight:700;cursor:pointer;white-space:nowrap}",
      ".mcfb-f button.on{background:var(--navy,#1f3a5f);color:#fff;border-color:var(--navy,#1f3a5f)}",
      ".mcfb-f input{flex:1 1 160px;min-width:0;max-width:280px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:10px;padding:6px 10px;font-size:.85rem}",
      ".mcfb-list{display:flex;flex-direction:column;gap:6px}",
      ".mcfb-r{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;align-items:center;background:var(--white,#fff);border:1px solid var(--cream-d,#e6dccb);border-radius:12px;padding:8px 10px;cursor:pointer;min-width:0}",
      ".mcfb-r:hover{background:rgba(61,90,122,.05)}",
      ".mcfb-n{font-weight:800;font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
      ".mcfb-m{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:4px 8px;font-size:.75rem;color:var(--gray,#6b7280);min-width:0}",
      ".mcfb-m span{white-space:nowrap}",
      ".mcfb-a{display:flex;gap:6px;align-items:center;justify-self:end;grid-column:2;grid-row:1}",
      ".mcfb-go{border:none;background:var(--navy,#1f3a5f);color:#fff;border-radius:999px;padding:5px 12px;font-size:.76rem;font-weight:800;cursor:pointer;white-space:nowrap}",
      ".mcfb-pc,.mcfb-pa,.mcfb-sa{display:inline-block;border-radius:999px;padding:2px 9px;font-size:.7rem;font-weight:800;white-space:nowrap}",
      ".mcfb-pc{background:#fff4e0;color:#9a5b00}.mcfb-pa{background:#e8f0fe;color:#1f4e9a}.mcfb-sa{background:#f1f1f1;color:#555}",
      ".mcfb-empty{padding:24px;text-align:center;color:var(--gray,#6b7280);background:var(--white,#fff);border-radius:12px;border:1px dashed var(--cream-d,#e6dccb)}",
      "@container (min-width:820px){.mcfb-r{grid-template-columns:minmax(140px,1fr) 52px 76px minmax(100px,160px) 76px 150px 96px;gap:10px;padding:7px 12px}.mcfb-m{display:contents}.mcfb-m>span{overflow:hidden;text-overflow:ellipsis;min-width:0}.mcfb-a{grid-column:7;grid-row:1}}",
    ].join("\n");
    document.head.appendChild(s);
  }
  function pill(b) { return b.listo ? '<span class="mcfb-pa">Pendiente de aprobar</span>' : '<span class="mcfb-pc">Por completar</span>'; }
  function fila(b, gestiona) {
    var nom = ((b.nombre || "") + " " + (b.apellido || "")).trim() || "Sin nombre";
    var quien = b.asignado_a ? e(b.asignado_a) : '<span class="mcfb-sa">Sin asignar</span>';
    return '<div class="mcfb-r" data-fb="' + e(b.factura) + '" role="button" tabindex="0">' +
      '<span class="mcfb-n">' + e(nom) + "</span>" +
      '<span class="mcfb-m"><span>' + e(f(b.fecha)) + "</span><span>Fac. " + e(String(b.factura || "").replace(/^\d{3}-\d{3}-0*/, "")) + "</span><span>" + quien + "</span>" +
      "<span>" + (gestiona && b.total != null ? e($m(b.total)) : "") + "</span><span>" + pill(b) + "</span></span>" +
      '<span class="mcfb-a">' + '<button type="button" class="mcfb-go" data-fb="' + e(b.factura) + '">' + (b.listo ? "Abrir" : "Completar") + "</button></span>" +
      "</div>";
  }
  function cuerpo() {
    var d = K.d;
    if (!d) return '<p class="mcfb-sub">Cargando…</p>';
    if (d.error) return '<p class="err">' + e(d.error) + "</p>";
    var it = (d.items || []).filter(function (b) {
      if (K.filtro === "pc" && b.listo) return false;
      if (K.filtro === "pa" && !b.listo) return false;
      if (K.filtro === "sa" && !b.sin_asignar) return false;
      var q = K.q.trim().toLowerCase();
      return !q || ((b.nombre || "") + " " + (b.apellido || "") + " " + (b.factura || "") + " " + (b.asignado_a || "")).toLowerCase().indexOf(q) >= 0;
    });
    if (!it.length) return '<div class="mcfb-empty"><b>No hay facturas borrador</b><br>Cuando Migo traiga una para ti, aparece aquí.</div>';
    return '<div class="mcfb-list">' + it.map(function (b) { return fila(b, d.gestiona); }).join("") + "</div>";
  }
  function filtros() {
    var all = (K.d && K.d.items) || [];
    var nPc = all.filter(function (b) { return !b.listo; }).length, nPa = all.length - nPc;
    var nSa = all.filter(function (b) { return b.sin_asignar; }).length;
    function b(k, t) { return '<button type="button" data-fbf="' + k + '"' + (K.filtro === k ? ' class="on"' : "") + ">" + t + "</button>"; }
    return b("todas", "Todas (" + all.length + ")") + b("pc", "Por completar (" + nPc + ")") + b("pa", "Pendiente de aprobar (" + nPa + ")") + (nSa ? b("sa", "Sin asignar (" + nSa + ")") : "") +
      '<input type="search" id="mcfb-q" placeholder="Buscar clienta o factura" value="' + e(K.q) + '">';
  }
  function render() {
    css();
    var g = K.d && K.d.gestiona;
    return '<div class="mcfb" id="mcfb"><div class="mcfb-h"><h2>📄 Facturas borrador</h2></div>' +
      '<p class="mcfb-sub">' + (g ? "Todas las facturas de Migo que aún no tienen ticket." : "Tus facturas de Migo y las sin asignar de hoy. Complétalas y quedan pendientes de aprobar.") + "</p>" +
      '<div class="mcfb-f" id="mcfb-f">' + filtros() + '</div><div id="mcfb-b">' + cuerpo() + "</div></div>";
  }
  function pintar(main) {
    var f0 = main.querySelector("#mcfb-f"), b0 = main.querySelector("#mcfb-b");
    if (!f0 || !b0) return;
    var foco = document.activeElement && document.activeElement.id === "mcfb-q";
    f0.innerHTML = filtros(); b0.innerHTML = cuerpo();
    var sub = main.querySelector(".mcfb-sub");
    if (sub && K.d && K.d.gestiona) sub.textContent = "Todas las facturas de Migo que aún no tienen ticket.";
    if (foco) { var q = main.querySelector("#mcfb-q"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  }
  function abrir(fac) {
    if (!fac) return;
    try { sessionStorage.setItem("mctk.volver", "#/m/borradores"); } catch (x) { /* */ }
    if (typeof _migoAbrirEnTicket === "function") _migoAbrirEnTicket(fac);
    else if (typeof go === "function") go("#/doc/ov?fac=" + encodeURIComponent(fac));
  }
  async function wire(main) {
    var root = main.querySelector("#mcfb");
    if (!root) return;
    root.addEventListener("click", function (ev) {
      var fb = ev.target.closest("[data-fbf]");
      if (fb) { K.filtro = fb.getAttribute("data-fbf"); pintar(main); return; }
      var r = ev.target.closest("[data-fb]");
      if (r) { ev.preventDefault(); abrir(r.getAttribute("data-fb")); }
    });
    root.addEventListener("keydown", function (ev) { var r = ev.target.closest && ev.target.closest(".mcfb-r"); if (r && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); abrir(r.getAttribute("data-fb")); } });
    root.addEventListener("input", function (ev) { if (ev.target.id === "mcfb-q") { K.q = ev.target.value || ""; pintar(main); } });
    try { K.d = await api("mb_facturas_borrador", {}); } catch (x) { K.d = { error: (x && x.message) || "No se pudo cargar" }; }
    pintar(main);
  }
  window.MCBorradores = { render: render, wire: wire, _k: K };
})();
