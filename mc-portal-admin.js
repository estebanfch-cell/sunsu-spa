// 📱 Cuentas de la app (TK163, solo admin): clientas y proveedores con cuenta, revisión de cuentas que no se
// pudieron atar solas, invitar a un proveedor (enlace para crear su contraseña), propuestas de proveedores
// (aprobar / rechazar; nada se aplica solo) y el enlace de Acuity de respaldo.
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function t2(m, bad) { if (typeof toast === "function") toast(m, bad ? "var(--red,#B87070)" : "var(--green)"); }
  function fh(iso) { if (!iso) return ""; try { return new Date(iso).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "2-digit" }); } catch (x) { return ""; } }
  var K = { tab: "revision" };
  var EST = { activa: ["Activa", "g"], revision: ["En revisión", "w"], pendiente_email: ["Falta confirmar correo", "w"], invitada: ["Invitada", ""], rechazada: ["Rechazada", "r"] };
  function css() {
    if (document.getElementById("pa-css")) return;
    var s = document.createElement("style"); s.id = "pa-css";
    s.textContent = ".pa{max-width:860px}.pa-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px}.pa-tabs button{border:1px solid #dfe4ec;background:#fff;border-radius:999px;padding:5px 12px;font:inherit;font-size:.78rem;cursor:pointer}.pa-tabs button.on{background:var(--navy);color:#fff;border-color:var(--navy)}" +
      ".pa-c{background:#fff;border-radius:12px;padding:8px 12px;margin:0 0 6px;box-shadow:0 1px 3px rgba(0,0,0,.07);display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:.82rem}.pa-c small{color:var(--gray);font-size:.72rem}.pa-acts{display:flex;gap:6px;flex-wrap:wrap}" +
      ".pa-p{display:inline-block;font-size:.66rem;padding:1px 7px;border-radius:999px;background:var(--blue-l,#EEF3FA)}.pa-p.g{background:var(--green-l)}.pa-p.w{background:var(--gold-l)}.pa-p.r{background:var(--red-l)}.pa-f{display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:end}.pa-f label{font-size:.72rem;color:var(--gray);display:flex;flex-direction:column;gap:2px}";
    document.head.appendChild(s);
  }
  async function render() {
    css();
    var [c, p] = await Promise.all([api("padm_cuentas"), api("padm_propuestas")]);
    if (!c || !c.ok) return '<section class="pa"><p class="err">' + e((c && c.error) || "No se pudo cargar") + "</p></section>";
    K.c = c; K.p = p && p.ok ? p.items : [];
    var L = c.cuentas || [], rev = L.filter(function (x) { return x.estado === "revision" || x.estado === "pendiente_email"; }), pend = K.p.filter(function (x) { return x.estado === "pendiente"; });
    var tabs = [["revision", "Por revisar (" + rev.length + ")"], ["propuestas", "Propuestas (" + pend.length + ")"], ["clientas", "Clientas"], ["proveedores", "Proveedores"], ["ajustes", "Ajustes"]];
    var h = '<section class="pa"><h2>📱 Cuentas de la app</h2><p class="mccf-sub">Cada cuenta queda atada para siempre a una clienta o a un proveedor. ' + (c.correo ? "" : "⚠️ El correo automático no está configurado: las cuentas que se atan a una ficha existente quedan «En revisión» hasta que las apruebes.") + '</p><div class="pa-tabs">' + tabs.map(function (t) { return '<button type="button" data-pt="' + t[0] + '" class="' + (K.tab === t[0] ? "on" : "") + '">' + e(t[1]) + "</button>"; }).join("") + "</div>";
    var fila = function (x) {
      var st = EST[x.estado] || [x.estado, ""];
      return '<div class="pa-c"><div><b>' + e(x.nombre) + '</b> <span class="pa-p ' + st[1] + '">' + e(st[0]) + "</span><br><small>" + e(x.email) + (x.telefono ? " · " + e(x.telefono) : "") + (x.cedula ? " · " + e(x.cedula) : "") + "<br>" +
        (x.tipo === "cliente" ? "Clienta " + (x.codigo ? '<a href="#/m/clientes/c/' + encodeURIComponent(x.clienteKey) + '">' + e(x.codigo) + "</a>" : "") : "Proveedor " + e(x.proveedor) + (x.familia ? " (" + e(x.familia) + ")" : "")) +
        " · " + (x.vinculo === "nuevo" ? "ficha nueva" : "ficha existente" + (x.coincidencia.length ? " (coincide: " + e(x.coincidencia.join(", ")) + ")" : "")) + " · creada " + e(fh(x.creada)) + (x.ultimo ? " · último ingreso " + e(fh(x.ultimo)) : "") + "</small></div>" +
        '<div class="pa-acts">' + (x.estado === "revision" || x.estado === "pendiente_email" ? '<button class="btn small" data-ok="' + e(x.id) + '">Aprobar</button>' : "") + '<button class="btn ghost small" data-no="' + e(x.id) + '" data-n="' + e(x.nombre) + '">' + (x.estado === "revision" ? "Rechazar" : "Quitar acceso") + "</button></div></div>";
    };
    if (K.tab === "revision") h += rev.length ? '<p class="mccf-sub">Revisa que la persona sea la dueña de la ficha (cédula igual, pero el correo o teléfono no coincidían). Si apruebas, verá su historial y documentos.</p>' + rev.map(fila).join("") : '<p class="mccf-sub">Nada por revisar ✨</p>';
    if (K.tab === "clientas") h += L.filter(function (x) { return x.tipo === "cliente"; }).map(fila).join("") || '<p class="mccf-sub">Todavía no hay clientas con cuenta.</p>';
    if (K.tab === "proveedores") {
      h += '<div class="mccf-card"><b>Invitar a un proveedor</b><div class="pa-f" style="margin-top:6px"><label>Proveedor<select id="pa-pv">' + (c.proveedores || []).map(function (p) { return '<option value="' + e(p.id) + '" data-em="' + e(p.email || "") + '">' + e(p.nombre) + (p.familia ? " (" + e(p.familia) + ")" : "") + "</option>"; }).join("") + '</select></label><label>Correo<input id="pa-em" type="email" autocapitalize="none"></label><button class="btn small" id="pa-inv">Invitar</button></div><p class="mccf-sub">Se crea la cuenta atada a ese proveedor y te damos un enlace (7 días) para que cree su contraseña.</p></div>';
      h += L.filter(function (x) { return x.tipo === "proveedor"; }).map(fila).join("") || '<p class="mccf-sub">Todavía no hay proveedores con cuenta.</p>';
    }
    if (K.tab === "propuestas") h += K.p.length ? K.p.map(function (x) {
      var d = x.detalle || {}, txt = x.tipo === "precio" ? "Precio sugerido para " + (x.producto || x.sku) + ": $" + Number(d.precio).toFixed(2) : x.tipo === "descuento" ? "Descuento " + d.descuento_pct + "% " + (x.producto ? "en " + x.producto : "en sus productos") + (d.desde ? " · " + d.desde + (d.hasta ? " → " + d.hasta : "") : "") : "Si Sunsu vende más de " + d.unidades + " u/" + (d.periodo || "mes") + " → " + d.descuento_pct + "% de descuento" + (x.producto ? " en " + x.producto : "");
      return '<div class="pa-c"><div><b>' + e(x.proveedor) + "</b> · " + e(txt) + ' <span class="pa-p ' + (x.estado === "aprobada" ? "g" : x.estado === "rechazada" ? "r" : "w") + '">' + e(x.estado) + "</span><br><small>" + e(fh(x.fecha)) + " · " + e(x.por) + (x.mensaje ? " · «" + e(x.mensaje) + "»" : "") + (x.revisadoPor ? " · revisó " + e(x.revisadoPor) : "") + (x.nota ? " · " + e(x.nota) : "") + "</small></div>" +
        (x.estado === "pendiente" ? '<div class="pa-acts"><button class="btn small" data-pa="' + e(x.id) + '">Aprobar</button><button class="btn ghost small" data-pr="' + e(x.id) + '">Rechazar</button></div>' : "") + "</div>";
    }).join("") + '<p class="mccf-sub">Aprobar deja constancia y le avisa al proveedor en su app. El precio o descuento se aplica a mano en Compras › Consignación / Productos: nada cambia solo.</p>' : '<p class="mccf-sub">No hay propuestas.</p>';
    if (K.tab === "ajustes") h += '<div class="mccf-card"><b>Agenda</b><p class="mccf-sub">La app agenda directo con Acuity (API). Si la API fallara, se usa este enlace.</p><div class="pa-f"><label>Enlace de Acuity<input id="pa-ac" value="' + e(c.config.acuity_url) + '"></label><label>WhatsApp de Sunsu (opcional)<input id="pa-wa" value="' + e(c.config.whatsapp || "") + '"></label><button class="btn small" id="pa-cfg">Guardar</button></div></div>';
    return h + "</section>";
  }
  function wire(main) {
    var rep = async function () { main.innerHTML = await render(); wire(main); };
    main.querySelectorAll("[data-pt]").forEach(function (b) { b.onclick = function () { K.tab = b.dataset.pt; rep(); }; });
    main.querySelectorAll("[data-ok]").forEach(function (b) { b.onclick = async function () { var r = await api("padm_cuenta_aprobar", { id: b.dataset.ok }); if (!r.ok) { t2(r.error || "Error", 1); return; } t2("Cuenta aprobada"); rep(); }; });
    main.querySelectorAll("[data-no]").forEach(function (b) { b.onclick = async function () { var m = prompt("¿Quitar el acceso a la app de " + b.dataset.n + "? Su ficha, historial y documentos se quedan. Motivo:"); if (m == null) return; var r = await api("padm_cuenta_rechazar", { id: b.dataset.no, motivo: m }); if (!r.ok) { t2(r.error || "Error", 1); return; } t2("Acceso quitado"); rep(); }; });
    main.querySelectorAll("[data-pa],[data-pr]").forEach(function (b) { b.onclick = async function () { var ap = !!b.dataset.pa, nota = prompt(ap ? "Nota para el proveedor (opcional):" : "Motivo del rechazo (opcional):", ""); if (nota == null) return; var r = await api("padm_propuesta_resolver", { id: b.dataset.pa || b.dataset.pr, estado: ap ? "aprobada" : "rechazada", nota: nota }); if (!r.ok) { t2(r.error || "Error", 1); return; } t2(ap ? "Aprobada" : "Rechazada"); rep(); }; });
    var pv = document.getElementById("pa-pv"), em = document.getElementById("pa-em");
    if (pv && em) { var fill = function () { var o = pv.options[pv.selectedIndex]; em.value = (o && o.dataset.em) || ""; }; pv.onchange = fill; fill(); }
    var inv = document.getElementById("pa-inv");
    if (inv) inv.onclick = async function () {
      var r = await api("padm_invitar_proveedor", { proveedor_id: pv.value, email: em.value.trim() });
      if (!r.ok) { t2(r.error || "No se pudo invitar", 1); return; }
      try { await navigator.clipboard.writeText(r.enlace); } catch (x) {}
      alert((r.enviado ? "Le enviamos la invitación por correo. " : "") + "Enlace de invitación (copiado, vale 7 días):\n\n" + r.enlace);
      rep();
    };
    var cfg = document.getElementById("pa-cfg");
    if (cfg) cfg.onclick = async function () { var r = await api("padm_config_guardar", { acuity_url: document.getElementById("pa-ac").value.trim(), whatsapp: document.getElementById("pa-wa").value.trim() }); if (!r.ok) { t2(r.error || "Error", 1); return; } t2("Guardado"); };
  }
  window.MCPortalAdmin = { render: render, wire: wire };
})();
