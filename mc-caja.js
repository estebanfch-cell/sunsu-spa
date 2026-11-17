// 💵 Pagos + caja chica (TK19). MCPagos: tarjeta de pagos dentro del ticket. MCCaja: Caja chica (#/m/caja) y
// Pagos recibidos (#/m/caja/pagos). Todo en la beta; la caja de la hoja solo se lee para arrancar con su saldo.
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $m(v) { return "$" + (Math.round((Number(v) || 0) * 100) / 100).toFixed(2); }
  function toast2(msg, bad) { if (typeof toast === "function") toast(msg, bad ? "var(--red, #c0392b)" : "var(--green)"); }
  function fh(iso) { if (!iso) return ""; try { return new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (_) { return iso; } }
  function hoyEc() { return new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10); }
  function diasAtras(d) { return new Date(Date.now() - 5 * 3600000 - d * 86400000).toISOString().slice(0, 10); }
  function css() {
    if (document.getElementById("mccj-css")) return;
    var s = document.createElement("style"); s.id = "mccj-css";
    s.textContent = [
      ".mccj{max-width:980px}.mccj h2{margin:0 0 6px;font-size:1.2rem}.mccj-sub{font-size:.76rem;color:var(--gray,#8a93a6)}",
      ".mccj-card{background:#fff;border-radius:14px;padding:12px 14px;margin:10px 0;box-shadow:var(--shadow-sm,0 1px 3px rgba(0,0,0,.08))}",
      ".mccj-saldo{font-size:2rem;font-weight:800;color:var(--navy,#2c3e66)}.mccj-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}",
      ".mccj-t{width:100%;border-collapse:collapse;font-size:.8rem}.mccj-t th{text-align:left;color:var(--gray,#8a93a6);font-size:.7rem;padding:5px;border-bottom:1.2px solid var(--cream-d,#e6dccb)}.mccj-t td{padding:6px 5px;border-bottom:1px solid #f1ede6;vertical-align:top}.mccj-t .num{text-align:right;white-space:nowrap}",
      ".mccj-t tr.anul td{color:#9aa0ab;text-decoration:line-through}.mccj-t tr.anul td.mccj-keep{text-decoration:none}",
      ".mccj-chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.mccj-chips button{border:1.5px solid var(--cream-d,#e6dccb);background:#fff;border-radius:999px;padding:5px 12px;font:inherit;font-size:.76rem;cursor:pointer}.mccj-chips button.on{border-color:var(--navy,#2c3e66);background:var(--blue-l,#eef3fb);font-weight:800}.mccj-chips input[type=date]{width:auto;flex:0 0 auto;padding:4px 8px;font-size:.78rem;margin:0}",
      ".mccj-f{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}.mccj-f label{font-size:.72rem;color:var(--gray,#8a93a6);display:flex;flex-direction:column;gap:3px}.mccj-f input,.mccj-f select,.mccj-f textarea{padding:9px 10px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:10px;font:inherit}",
      ".mccj-ov{position:fixed;inset:0;background:rgba(40,50,70,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}.mccj-ov>div{background:#fff;border-radius:16px;padding:18px;max-width:520px;width:100%;max-height:92vh;overflow:auto}",
      ".mccj-tot{display:flex;gap:8px;flex-wrap:wrap}.mccj-tot span{background:var(--blue-l,#eef3fb);border-radius:10px;padding:6px 10px;font-size:.78rem}.mccj-tot b{display:block;font-size:.95rem}",
      ".mccj-in{color:#2e7d52;font-weight:700}.mccj-out{color:#b03a2e;font-weight:700}.mccj-pill{font-size:.66rem;border-radius:999px;padding:2px 8px;background:#eef0f4;color:#6b7280;font-weight:800}",
    ].join("\n");
    document.head.appendChild(s);
  }
  function modal(html, onOk) {
    var ov = document.createElement("div"); ov.className = "mccj-ov";
    ov.innerHTML = "<div>" + html + "<div class='mccj-acts' style='justify-content:flex-end'><button class='btn ghost' type='button' data-x>Cancelar</button><button class='btn' type='button' data-ok>Guardar</button></div></div>";
    document.body.appendChild(ov);
    ov.querySelector("[data-x]").onclick = function () { ov.remove(); };
    ov.querySelector("[data-ok]").onclick = async function () { var b = this; b.disabled = true; var ok = await onOk(ov); b.disabled = false; if (ok) ov.remove(); };
    var f = ov.querySelector("input,select,textarea"); if (f) f.focus();
    return ov;
  }
  function leerArchivo(inp) {
    return new Promise(function (ok) {
      var f = inp && inp.files && inp.files[0]; if (!f) return ok("");
      var r = new FileReader(); r.onload = function () { ok(String(r.result || "")); }; r.onerror = function () { ok(""); }; r.readAsDataURL(f);
    });
  }

  // ---------- Pagos dentro del ticket ----------
  var MCPagos = {
    montar: async function (host, clave, totalFn, onPagado) {
      css();
      var total = totalFn();
      var r = await api("pg_ticket", { clave: clave, total: total });
      if (!r || !r.ok) { host.innerHTML = ""; return; }
      if (onPagado) onPagado(r.pagadoBeta || 0);
      var met = {}; (r.metodos || []).forEach(function (m) { met[m.id] = m.nombre; });
      var filas = (r.beta || []).map(function (p) {
        return "<tr><td>" + e(fh(p.fecha)) + "</td><td>" + e(met[p.metodo] || p.metodo) + (p.ref ? ' <span class="mccj-sub">' + e(p.ref) + "</span>" : "") + '</td><td class="num">' + $m(p.monto) + '</td><td class="mccj-sub">' + e(p.registrado_por || "") + "</td>" +
          (r.admin ? '<td class="num"><button class="btn ghost small" type="button" data-pg-anul="' + e(p.id) + '">Anular</button></td>' : "") + "</tr>";
      }).join("");
      var legado = r.legado > 0 ? '<p class="mccj-sub">Cobrado en el sistema anterior: ' + $m(r.legado) + ((r.legadoMetodos || []).length ? " · " + e(r.legadoMetodos.map(function (m) { return m.metodo + (m.ref ? " " + m.ref : ""); }).join(", ")) : "") + "</p>" : "";
      var saldo = Math.max(0, Math.round((total - (r.legado || 0) - (r.pagadoBeta || 0)) * 100) / 100);
      host.innerHTML = '<div class="mccf-card mccj-card"><b>💵 Pagos</b> <span class="mccj-sub">· saldo ' + $m(saldo) + "</span>" + legado +
        (filas ? '<table class="mccj-t"><thead><tr><th>Fecha</th><th>Forma</th><th class="num">Monto</th><th>Registró</th>' + (r.admin ? "<th></th>" : "") + "</tr></thead><tbody>" + filas + "</tbody></table>" : "") +
        (saldo > 0.009 ? '<div class="mccj-f" style="margin-top:8px"><label>Forma de pago<select id="pg-met">' + (r.metodos || []).map(function (m) { return '<option value="' + e(m.id) + '">' + e(m.nombre) + "</option>"; }).join("") + "</select></label>" +
          '<label>Monto<input id="pg-monto" inputmode="decimal" value="' + saldo.toFixed(2) + '"></label><label>Voucher / comprobante<input id="pg-ref" placeholder="N.º (tarjeta, transferencia)"></label>' +
          '<label style="justify-content:flex-end"><button class="btn" type="button" id="pg-ok">Registrar pago</button></label></div><p class="mccj-sub">El efectivo entra solo a la caja chica.</p>' : '<p class="mccj-sub">✓ Pagado completo.</p>') + "</div>";
      var ok = host.querySelector("#pg-ok");
      if (ok) ok.onclick = async function () {
        ok.disabled = true;
        var body = { clave: clave, total: totalFn(), metodo: host.querySelector("#pg-met").value, monto: host.querySelector("#pg-monto").value, ref: host.querySelector("#pg-ref").value };
        var x = await api("pg_registrar", body);
        if (x && x.mayor && confirm(x.error + ". ¿Registrarlo igual?")) { body.forzar = true; x = await api("pg_registrar", body); }
        ok.disabled = false;
        if (!x || !x.ok) { toast2((x && x.error) || "No se pudo registrar", 1); return; }
        toast2("Pago registrado"); MCPagos.montar(host, clave, totalFn, onPagado);
      };
      host.querySelectorAll("[data-pg-anul]").forEach(function (b) {
        b.onclick = async function () {
          var motivo = prompt("Motivo para anular el pago:"); if (!motivo) return;
          var x = await api("pg_anular", { id: b.getAttribute("data-pg-anul"), motivo: motivo });
          if (!x || !x.ok) { toast2((x && x.error) || "No se pudo anular", 1); return; }
          toast2("Pago anulado"); MCPagos.montar(host, clave, totalFn, onPagado);
        };
      });
    },
  };

  // ---------- Caja chica ----------
  var K = { desde: hoyEc(), hasta: hoyEc(), rango: "hoy", d: null, p: null };
  function rangos() { return [["hoy", "Hoy", 0], ["7", "7 días", 6], ["30", "30 días", 29], ["mes", "Este mes", -1]]; }
  function aplicarRango(id) {
    K.rango = id; K.hasta = hoyEc();
    if (id === "hoy") K.desde = K.hasta; else if (id === "mes") K.desde = K.hasta.slice(0, 8) + "01"; else K.desde = diasAtras(Number(id) - 1);
  }
  function chipsHtml() {
    return '<div class="mccj-chips">' + rangos().map(function (r) { return '<button type="button" data-rg="' + r[0] + '" class="' + (K.rango === r[0] ? "on" : "") + '">' + r[1] + "</button>"; }).join("") +
      '<input type="date" id="cj-desde" value="' + e(K.desde) + '"> <input type="date" id="cj-hasta" value="' + e(K.hasta) + '"></div>';
  }
  function cajaHtml() {
    var d = K.d;
    if (!d) return '<p class="mccj-sub">Cargando…</p>';
    if (d.error) return '<p class="err">' + e(d.error) + "</p>";
    var h = '<div class="mccj"><h2>💵 Caja chica</h2><p class="mccj-sub">Efectivo de la oficina: ingresos, gastos, propinas, depósitos y cuadre. El efectivo de los tickets entra solo cuando se registra el pago. <a href="#/m/caja/pagos">Ver pagos recibidos →</a></p>';
    if (!d.iniciada) {
      return h + '<div class="mccj-card"><b>La caja de la beta todavía no está abierta.</b>' + (d.hoja ? '<p class="mccj-sub">La caja de la hoja tiene ' + $m(d.hoja.saldo) + " (último movimiento " + e(d.hoja.fecha) + ").</p>" : "") +
        (d.admin ? '<div class="mccj-acts">' + (d.hoja ? '<button class="btn" type="button" id="cj-abrir-hoja">Abrir con el saldo de la hoja (' + $m(d.hoja.saldo) + ")</button>" : "") + '<button class="btn ghost" type="button" id="cj-abrir">Abrir con otro monto</button></div>' : '<p class="mccj-sub">Pídele a un admin que la abra.</p>') + "</div></div>";
    }
    var tot = (d.porTipo || []).map(function (x) { return "<span>" + e(x.etiqueta) + "<b>" + (x.entrada ? '<span class="mccj-in">+' + $m(x.entrada) + "</span> " : "") + (x.salida ? '<span class="mccj-out">−' + $m(x.salida) + "</span>" : "") + "</b></span>"; }).join("");
    h += '<div class="mccj-card"><div class="mccj-sub">Saldo en caja</div><div class="mccj-saldo">' + $m(d.saldo) + "</div>" +
      '<div class="mccj-acts"><button class="btn" type="button" data-mov="gasto">💸 Gasto</button><button class="btn ghost" type="button" data-mov="ingreso">➕ Ingreso</button><button class="btn ghost" type="button" data-mov="deposito">🏦 Depósito al banco</button><button class="btn ghost" type="button" data-mov="propina_entrada">💝 Propina recibida</button><button class="btn ghost" type="button" data-mov="propina_pago">💝 Pago de propinas</button><button class="btn ghost" type="button" id="cj-cuadre">⚖️ Cuadre / cierre</button></div></div>';
    h += '<div class="mccj-card">' + chipsHtml() + (tot ? '<div class="mccj-tot">' + tot + "</div>" : "") +
      ((d.movimientos || []).length ? '<table class="mccj-t" style="margin-top:8px"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Detalle</th><th class="num">Entrada</th><th class="num">Salida</th><th class="num">Saldo</th><th></th></tr></thead><tbody>' +
        d.movimientos.map(function (m) {
          return '<tr class="' + (m.anulado ? "anul" : "") + '"><td>' + e(fh(m.fecha)) + "</td><td>" + e(m.etiqueta) + (m.categoria ? '<br><span class="mccj-sub">' + e(m.categoria) + "</span>" : "") + "</td><td>" + e(m.detalle) + '<br><span class="mccj-sub">' + e(m.quien) + (m.por && m.por !== m.quien ? " · registró " + e(m.por) : "") + "</span>" + (m.anulado ? '<br><span class="mccj-pill">anulado: ' + e(m.motivo) + "</span>" : "") + "</td>" +
            '<td class="num mccj-in">' + (m.entrada ? $m(m.entrada) : "") + '</td><td class="num mccj-out">' + (m.salida ? $m(m.salida) : "") + '</td><td class="num">' + $m(m.saldo) + '</td><td class="num mccj-keep">' +
            (m.comprobante ? '<button class="btn ghost small" type="button" data-cj-comp="' + e(m.id) + '">📎</button> ' : "") +
            (d.admin && !m.anulado && m.tipo !== "efectivo_ticket" ? '<button class="btn ghost small" type="button" data-cj-anul="' + e(m.id) + '">Anular</button>' : "") + "</td></tr>";
        }).join("") + "</tbody></table>" : '<p class="mccj-sub">Sin movimientos en estas fechas.</p>') + "</div>";
    if ((d.cierres || []).length) h += '<div class="mccj-card"><b>Últimos cuadres</b><table class="mccj-t"><thead><tr><th>Fecha</th><th class="num">Sistema</th><th class="num">Contado</th><th class="num">Diferencia</th><th>Nota</th></tr></thead><tbody>' +
      d.cierres.map(function (c) { return "<tr><td>" + e(fh(c.fecha)) + '<br><span class="mccj-sub">' + e(c.por) + '</span></td><td class="num">' + $m(c.saldo_sistema) + '</td><td class="num">' + $m(c.contado) + '</td><td class="num ' + (Math.abs(c.diferencia) >= 0.01 ? "mccj-out" : "") + '">' + $m(c.diferencia) + "</td><td>" + e(c.nota) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    return h + "</div>";
  }
  var ETQ = { gasto: "💸 Gasto", ingreso: "➕ Ingreso", deposito: "🏦 Depósito al banco", propina_entrada: "💝 Propina recibida", propina_pago: "💝 Pago de propinas" };
  function formMov(tipo) {
    var d = K.d;
    return "<h3 style='margin:0 0 8px'>" + e(ETQ[tipo]) + "</h3><div class='mccj-f'><label>Monto<input id='cm-monto' inputmode='decimal' placeholder='0.00'></label>" +
      (tipo === "gasto" ? "<label>Categoría<select id='cm-cat'>" + (d.categorias || []).map(function (c) { return "<option>" + e(c) + "</option>"; }).join("") + "</select></label>" : "") +
      "<label>Quién<input id='cm-quien' value='" + e((window.state && state.user && (state.user.short || state.user.name)) || "") + "'></label>" +
      "<label style='grid-column:1/-1'>" + (tipo === "deposito" ? "Banco / referencia del depósito" : "Detalle / justificativo") + "<textarea id='cm-det' rows='2'></textarea></label>" +
      "<label style='grid-column:1/-1'>Comprobante (foto o PDF, opcional)<input id='cm-comp' type='file' accept='image/*,application/pdf' capture='environment'></label></div>" +
      (tipo === "gasto" || tipo === "deposito" || tipo === "propina_pago" ? "<p class='mccj-sub'>Sale de la caja (saldo " + $m(d.saldo) + ").</p>" : "<p class='mccj-sub'>Entra a la caja.</p>");
  }
  async function cargarCaja() { K.d = await api("cj_resumen", { desde: K.desde, hasta: K.hasta }); }
  async function repCaja(main) { await cargarCaja(); var r = main.querySelector("#mccj-root"); if (r) { r.innerHTML = cajaHtml(); wireCaja(main); } }
  function wireRango(main, rep) {
    main.querySelectorAll("[data-rg]").forEach(function (b) { b.onclick = function () { aplicarRango(b.getAttribute("data-rg")); rep(main); }; });
    var d1 = main.querySelector("#cj-desde"), d2 = main.querySelector("#cj-hasta");
    var f = function () { if (d1.value && d2.value) { K.desde = d1.value; K.hasta = d2.value; K.rango = ""; rep(main); } };
    if (d1) d1.onchange = f; if (d2) d2.onchange = f;
  }
  function wireCaja(main) {
    wireRango(main, repCaja);
    var ah = main.querySelector("#cj-abrir-hoja");
    if (ah) ah.onclick = async function () { if (!confirm("¿Abrir la caja de la beta con " + $m(K.d.hoja.saldo) + "?")) return; var r = await api("cj_iniciar", { desdeHoja: true }); if (!r || !r.ok) { toast2((r && r.error) || "No se pudo", 1); return; } toast2("Caja abierta"); repCaja(main); };
    var ab = main.querySelector("#cj-abrir");
    if (ab) ab.onclick = function () {
      modal("<h3 style='margin:0 0 8px'>Abrir caja</h3><div class='mccj-f'><label>Monto inicial<input id='ca-m' inputmode='decimal'></label><label>Detalle<input id='ca-d' placeholder='Conteo físico de hoy'></label></div>", async function (ov) {
        var r = await api("cj_iniciar", { monto: ov.querySelector("#ca-m").value, detalle: ov.querySelector("#ca-d").value });
        if (!r || !r.ok) { toast2((r && r.error) || "No se pudo", 1); return false; } toast2("Caja abierta"); repCaja(main); return true;
      });
    };
    main.querySelectorAll("[data-mov]").forEach(function (b) {
      b.onclick = function () {
        var tipo = b.getAttribute("data-mov");
        modal(formMov(tipo), async function (ov) {
          var comp = await leerArchivo(ov.querySelector("#cm-comp"));
          var cat = ov.querySelector("#cm-cat");
          var r = await api("cj_mov", { tipo: tipo, monto: ov.querySelector("#cm-monto").value, categoria: cat ? cat.value : "", quien: ov.querySelector("#cm-quien").value, detalle: ov.querySelector("#cm-det").value, comprobante: comp });
          if (!r || !r.ok) { toast2((r && r.error) || "No se pudo guardar", 1); return false; }
          toast2("Guardado · saldo " + $m(r.saldo)); repCaja(main); return true;
        });
      };
    });
    var cu = main.querySelector("#cj-cuadre");
    if (cu) cu.onclick = function () {
      modal("<h3 style='margin:0 0 8px'>⚖️ Cuadre / cierre de caja</h3><p class='mccj-sub'>Cuenta el efectivo y escribe cuánto hay. El sistema dice " + $m(K.d.saldo) + ". Si no cuadra, se registra la diferencia con tu nota.</p><div class='mccj-f'><label>Contado<input id='cc-c' inputmode='decimal'></label><label style='grid-column:1/-1'>Nota<textarea id='cc-n' rows='2'></textarea></label></div>", async function (ov) {
        var r = await api("cj_cuadre", { contado: ov.querySelector("#cc-c").value, nota: ov.querySelector("#cc-n").value });
        if (!r || !r.ok) { toast2((r && r.error) || "No se pudo", 1); return false; }
        toast2(Math.abs(r.diferencia) < 0.01 ? "✓ La caja cuadra" : "Diferencia " + $m(r.diferencia) + " registrada"); repCaja(main); return true;
      });
    };
    main.querySelectorAll("[data-cj-anul]").forEach(function (b) {
      b.onclick = async function () { var m = prompt("Motivo para anular:"); if (!m) return; var r = await api("cj_anular", { id: b.getAttribute("data-cj-anul"), motivo: m }); if (!r || !r.ok) { toast2((r && r.error) || "No se pudo", 1); return; } toast2("Anulado"); repCaja(main); };
    });
    main.querySelectorAll("[data-cj-comp]").forEach(function (b) {
      b.onclick = async function () { var r = await api("cj_comprobante", { id: b.getAttribute("data-cj-comp") }); if (!r || !r.ok) { toast2((r && r.error) || "No se pudo abrir", 1); return; } var w = window.open(""); if (w) w.document.write("<iframe src='" + r.url + "' style='border:0;width:100%;height:100vh'></iframe>"); };
    });
  }

  // ---------- Pagos recibidos ----------
  function pagosHtml() {
    var d = K.p;
    if (!d) return '<p class="mccj-sub">Cargando…</p>';
    if (d.error) return '<p class="err">' + e(d.error) + "</p>";
    var E = d.etiquetas || {};
    return '<div class="mccj"><h2>💳 Pagos recibidos</h2><p class="mccj-sub">Cobros de tickets por forma de pago: los registrados en la beta y los cobrados en el sistema anterior. <a href="#/m/caja">← Caja chica</a></p>' +
      '<div class="mccj-card">' + chipsHtml() + '<div class="mccj-tot">' + (d.totales || []).map(function (x) { return "<span>" + e(x.nombre) + "<b>" + $m(x.total) + "</b></span>"; }).join("") + "<span>Total<b>" + $m(d.total) + "</b></span></div>" +
      ((d.items || []).length ? '<table class="mccj-t" style="margin-top:8px"><thead><tr><th>Fecha</th><th>Ticket</th><th>Forma</th><th class="num">Monto</th><th>Quién</th><th></th></tr></thead><tbody>' +
        d.items.map(function (x) {
          return '<tr class="' + (x.anulado ? "anul" : "") + '"><td>' + e(fh(x.fecha)) + '</td><td><a href="#/m/tickets/t/' + encodeURIComponent(x.clave) + '">' + e(x.clave) + "</a>" + (x.cliente ? '<br><span class="mccj-sub">' + e(x.cliente) + "</span>" : "") + "</td><td>" + e(E[x.metodo] || x.metodo) + (x.ref ? '<br><span class="mccj-sub">' + e(x.ref) + "</span>" : "") + '</td><td class="num">' + $m(x.monto) + "</td><td>" + e(x.por) + '</td><td class="mccj-keep"><span class="mccj-pill">' + (x.fuente === "beta" ? "beta" : "sistema anterior") + "</span>" + (x.anulado ? ' <span class="mccj-pill">anulado</span>' : "") + "</td></tr>";
        }).join("") + "</tbody></table>" : '<p class="mccj-sub">Sin pagos en estas fechas.</p>') + "</div></div>";
  }
  async function repPagos(main) { K.p = await api("pg_lista", { desde: K.desde, hasta: K.hasta }); var r = main.querySelector("#mccj-root"); if (r) { r.innerHTML = pagosHtml(); wireRango(main, repPagos); } }

  window.MCPagos = MCPagos;
  window.MCCaja = {
    render: async function (route) {
      css();
      if (route.sub === "pagos") { K.p = await api("pg_lista", { desde: K.desde, hasta: K.hasta }); return '<div id="mccj-root">' + pagosHtml() + "</div>"; }
      await cargarCaja(); return '<div id="mccj-root">' + cajaHtml() + "</div>";
    },
    wire: function (main, route) {
      if (route.sub === "pagos") wireRango(main, repPagos);
      else { wireCaja(main); if (route.sub === "nuevo") { var b = main.querySelector('[data-mov="gasto"]'); if (b) b.click(); } }
    },
  };
})();
