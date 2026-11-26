/* DEV-31 (Emilia t900u) · Rol de pagos: pre-rol de todas al día de hoy, anticipos y préstamos, resumen PDF
   y firma con el dedo de la empleada. Usa api/esc/money/toast/state de index.html. */
(function () {
  "use strict";
  function m2(v) { var x = Number(v); return (Math.round(((isFinite(x) ? x : 0) + Number.EPSILON) * 100) / 100).toFixed(2); }
  function hrs(v) { var x = Number(v) || 0; return (Math.round(x * 100) / 100).toString().replace(".", ","); }
  function fecha(ymd) { return typeof fmtDiaCorto === "function" ? fmtDiaCorto(ymd) : ymd; }

  // ── Pre-rol de TODAS (tabla) ─────────────────────────────────────────────────────────────────────────────
  function estadoRol(r) {
    if (!r) return '<span class="note">sin borrador</span>';
    var e = r.estado || "borrador";
    var pill = typeof rolPill === "function" ? rolPill(e) : esc(e);
    if (e !== "aprobado") return pill;
    return pill + (r.firmado ? ' <span class="rol-pill firmado">Firmado</span>' : ' <span class="rol-pill porfirmar">Por firmar</span>');
  }
  async function htmlPreRolResumen(opts) {
    opts = opts || {};
    var r = await api("rol_prerol_resumen", {});
    if (!r || r.error) return "";
    // Costo empresa y patronal: solo administración (la API los quita para quien no puede verlos).
    var conCosto = !!(r.totales && r.totales.costoEmpresa != null);
    var filas = (r.filas || []).map(function (x) {
      if (x.error) return '<tr><td>' + esc(x.nombre) + '</td><td colspan="9" class="err">' + esc(x.error) + "</td></tr>";
      var desc = Number(x.anticipos || 0) + Number(x.prestamos || 0);
      return '<tr data-prerol-fila="' + esc(x.nombre) + '">'
        + '<td><b>' + esc(x.nombreCompleto || x.nombre) + "</b>" + (x.afiliada ? "" : ' <span class="note">sin IESS</span>') + "</td>"
        + '<td class="num">' + esc(typeof _rolDiasLinea === "function" ? _rolDiasLinea(x) : ((Number(x.diasTrabajados || 0) + Number(x.diasFest || 0) + Number(x.diasDesc || 0) + Number(x.diasAsumidos || 0)) + " días"))
        + (x.faltas ? ' <span class="err">' + esc(x.faltas) + " f.</span>" : "") + "</td>"
        + '<td class="num">$' + m2(x.sueldo + x.bono) + "</td>"
        + '<td class="num">$' + m2(x.comisiones) + "</td>"
        + '<td class="num">$' + m2(x.horasExtra) + "</td>"
        + '<td class="num">$' + m2(x.decimosFondo) + "</td>"
        + '<td class="num">$' + m2(x.totalIngresos) + "</td>"
        + '<td class="num">$' + m2(x.iess) + "</td>"
        + '<td class="num">' + (desc ? "$" + m2(desc) : "—") + "</td>"
        + '<td class="num">' + (x.multas ? "$" + m2(x.multas) : "—") + "</td>"
        + '<td class="num"><b>$' + m2(x.neto) + "</b></td>"
        + (conCosto ? '<td class="num">$' + m2(x.patronal) + '</td><td class="num"><b>$' + m2(x.costoEmpresa) + "</b></td>" : "")
        + "<td>" + estadoRol(x.rol) + "</td>"
        + (opts.compacto ? "" : ('<td class="acc"><button class="btn ghost small" type="button" data-prerol="' + esc(x.nombre) + '">Detalle</button>'
        + ((!x.rol || x.rol.estado !== "aprobado") ? '<button class="btn ghost small" type="button" data-prerol-crear="' + esc(x.nombre) + '" data-periodo="' + esc(r.periodo) + '">' + (x.rol ? "Recalcular borrador" : "Crear borrador") + "</button>" : "")
        + (x.rol ? '<button class="btn ghost small" type="button" data-rol-ab="' + esc(x.rol.id) + '">Ver rol</button>' : "")
        + "</td>")) + "</tr>";
    }).join("");
    var t = r.totales || {};
    return '<div class="card prerol-box"><div class="card-title">Pre-rol de ' + esc(r.etiqueta || "") + " al " + esc(fecha(r.hoy)) + "</div>"
      + (opts.compacto ? "" : '<div class="tools"><button class="btn small" type="button" data-desc-abrir="1">💵 Anticipos y préstamos</button>'
      + '<button class="btn ghost small" type="button" data-rol-resumen-pdf="' + esc(r.periodo) + '">📄 Resumen PDF del mes</button>'
      + '<button class="btn ghost small" type="button" data-go="#/m/personal/config-rol">⚙️ Configuración de rol</button></div>')
      + '<div class="prerol-tabla-wrap"><table class="prerol-tabla"><thead><tr><th>Empleada</th><th>Días</th><th>Sueldo + bono</th><th>Comisiones</th><th>Horas extra</th><th>Décimos / fondo</th><th>Ingresos</th><th>IESS 9,45%</th><th>Anticipos / préstamos</th><th>Multas</th><th>Neto</th>' + (conCosto ? '<th>Patronal</th><th>Costo empresa</th>' : "") + '<th>Rol</th><th></th></tr></thead>'
      + "<tbody>" + filas + '</tbody><tfoot><tr><td><b>Total</b></td><td></td><td></td><td class="num">$' + m2(t.comisiones) + '</td><td></td><td></td><td class="num">$' + m2(t.totalIngresos) + '</td><td class="num">$' + m2(t.iess) + '</td><td></td><td></td><td class="num"><b>$' + m2(t.neto) + "</b></td>" + (conCosto ? '<td class="num">$' + m2(t.patronal) + '</td><td class="num"><b>$' + m2(t.costoEmpresa) + "</b></td>" : "") + "<td></td><td></td></tr></tfoot></table></div>"
      + (opts.compacto ? "" : '<div id="desc-panel"></div><div id="prerol-detalle"></div>')
      + '<p class="note">' + esc(r.nota || "") + "</p></div>";
  }

  // ── Anticipos y préstamos ────────────────────────────────────────────────────────────────────────────────
  function htmlDesc(d, edit) {
    edit = edit || {};
    var emps = (d.empleadas || []).map(function (e) { return '<option value="' + esc(e.nombre) + '"' + (edit.persona === e.nombre ? " selected" : "") + ">" + esc(e.nombre) + (e.afiliada === false ? " · sin IESS" : "") + "</option>"; }).join("");
    var per = (d.periodos || []).map(function (p) { var sel = (edit.primerPeriodo || d.siguiente) === p.periodo; return '<option value="' + esc(p.periodo) + '"' + (sel ? " selected" : "") + ">" + esc(p.etiqueta) + "</option>"; }).join("");
    var esPrest = edit.tipo === "prestamo";
    var lista = (d.items || []).map(function (x) {
      var est = x.estado === "anulado" ? '<span class="rol-pill rechazado">Anulado</span>' : x.terminado ? '<span class="rol-pill aprobado">Pagado</span>' : '<span class="rol-pill borrador">Activo</span>';
      var plan = (x.plan || []).map(function (c) { return esc(c.etiqueta) + " $" + m2(c.monto) + (c.pagada ? " ✓" : ""); }).join(" · ");
      return '<div class="desc-item" data-desc-id="' + esc(x.id) + '"><div><b>' + esc(x.persona) + "</b> · " + (x.tipo === "prestamo" ? "Préstamo" : "Anticipo") + " $" + m2(x.monto)
        + (x.tipo === "prestamo" ? " en " + esc(x.cuotas) + " cuota(s) de $" + m2(x.cuota) : "") + " " + est + (x.prueba ? ' <span class="note">(simulación)</span>' : "") + "</div>"
        + '<div class="note">Entregado ' + esc(fecha(x.fecha)) + " · se descuenta desde el rol de " + esc(x.primerEtiqueta) + " · saldo $" + m2(x.saldo) + (x.motivo ? " · " + esc(x.motivo) : "") + (x.motivoAnulacion ? " · anulado: " + esc(x.motivoAnulacion) : "") + "</div>"
        + '<div class="note">' + plan + "</div>"
        + (x.estado !== "anulado" ? '<div class="tools">' + (!(x.plan || []).some(function (c) { return c.pagada; }) ? '<button class="btn ghost small" type="button" data-desc-editar="' + esc(x.id) + '">Editar</button>' : "") + '<button class="btn ghost small" type="button" data-desc-anular="' + esc(x.id) + '">Anular</button><button class="btn ghost small" type="button" data-desc-hist="' + esc(x.id) + '">Historial</button></div>' : '<div class="tools"><button class="btn ghost small" type="button" data-desc-hist="' + esc(x.id) + '">Historial</button></div>')
        + '<div data-desc-histbox></div></div>';
    }).join("") || '<p class="note">Todavía no hay anticipos ni préstamos.</p>';
    return '<div class="card desc-box"><div class="card-title">Anticipos y préstamos <button class="btn ghost small" type="button" data-desc-cerrar="1">Cerrar</button></div>'
      + '<form id="f-desc" class="desc-form" autocomplete="off">' + (edit.id ? '<input type="hidden" name="id" value="' + esc(edit.id) + '">' : "")
      + '<label>Empleada <select name="persona">' + emps + "</select></label>"
      + '<label>Tipo <select name="tipo" data-desc-tipo><option value="anticipo"' + (!esPrest ? " selected" : "") + '>Anticipo (se descuenta todo en un rol)</option><option value="prestamo"' + (esPrest ? " selected" : "") + ">Préstamo (en cuotas)</option></select></label>"
      + '<label>Monto $ <input name="monto" inputmode="decimal" value="' + esc(edit.monto != null ? m2(edit.monto) : "") + '" required></label>'
      + '<label data-desc-cuotas' + (esPrest ? "" : " hidden") + '>Cuotas <input name="cuotas" type="number" min="1" max="60" step="1" value="' + esc(edit.cuotas || 3) + '"></label>'
      + '<label>Fecha de entrega <input name="fecha" type="date" value="' + esc(edit.fecha || d.hoy || "") + '"></label>'
      + '<label>Se descuenta desde el rol de <select name="primerPeriodo">' + per + "</select></label>"
      + '<label class="full">Motivo / nota <input name="motivo" maxlength="300" value="' + esc(edit.motivo || "") + '"></label>'
      + '<div class="tools full"><button class="btn small" type="submit">' + (edit.id ? "Guardar cambios" : "Registrar") + "</button>" + (edit.id ? '<button class="btn ghost small" type="button" data-desc-nuevo="1">Cancelar edición</button>' : "") + "</div>"
      + '<p class="err full" id="desc-err"></p>'
      + '<p class="note full">Anticipo: por defecto se descuenta completo en el rol del mes siguiente. Préstamo: una cuota por rol hasta pagarlo. Vale también para quien no está afiliada al IESS. Cada cambio queda en el historial.</p></form>'
      + '<div class="desc-lista">' + lista + "</div></div>";
  }
  async function abrirDesc(main, edit) {
    var box = main.querySelector("#desc-panel");
    if (!box) return;
    box.innerHTML = '<p class="note">Cargando anticipos y préstamos…</p>';
    var d = await api("rol_desc_lista", {});
    if (!d || d.error) { box.innerHTML = '<p class="err">' + esc((d && d.error) || "No se pudo cargar") + "</p>"; return; }
    box._data = d;
    box.innerHTML = htmlDesc(d, edit);
    box.scrollIntoView({ block: "nearest" });
  }
  function wireDesc(main) {
    var box = main.querySelector("#desc-panel");
    if (!box || box._wired) return;
    box._wired = true;
    box.addEventListener("change", function (ev) {
      if (ev.target && ev.target.hasAttribute && ev.target.hasAttribute("data-desc-tipo")) {
        var c = box.querySelector("[data-desc-cuotas]");
        if (c) c.hidden = ev.target.value !== "prestamo";
      }
    });
    box.addEventListener("submit", async function (ev) {
      if (!ev.target || ev.target.id !== "f-desc") return;
      ev.preventDefault();
      var body = Object.fromEntries(new FormData(ev.target).entries());
      body.monto = Number(String(body.monto || "").replace(",", "."));
      if (body.tipo !== "prestamo") body.cuotas = 1;
      var err = box.querySelector("#desc-err");
      var res = await api("rol_desc_guardar", body);
      if (!res || res.error) { if (err) err.textContent = (res && res.error) || "No se pudo guardar"; return; }
      toast(body.id ? "Cambios guardados" : (body.tipo === "prestamo" ? "Préstamo registrado" : "Anticipo registrado"));
      await abrirDesc(main);
    });
    box.addEventListener("click", async function (ev) {
      var t = ev.target.closest("[data-desc-cerrar],[data-desc-editar],[data-desc-anular],[data-desc-hist],[data-desc-nuevo]");
      if (!t) return;
      if (t.hasAttribute("data-desc-cerrar")) { box.innerHTML = ""; return; }
      if (t.hasAttribute("data-desc-nuevo")) { await abrirDesc(main); return; }
      var id = t.getAttribute("data-desc-editar") || t.getAttribute("data-desc-anular") || t.getAttribute("data-desc-hist");
      var it = ((box._data || {}).items || []).find(function (x) { return x.id === id; });
      if (t.hasAttribute("data-desc-editar") && it) { box.innerHTML = htmlDesc(box._data, it); return; }
      if (t.hasAttribute("data-desc-anular")) {
        var motivo = window.prompt("¿Por qué se anula? (queda en el historial)");
        if (!motivo) return;
        var r = await api("rol_desc_anular", { id: id, motivo: motivo });
        if (!r || r.error) { toast((r && r.error) || "No se pudo anular"); return; }
        toast("Anulado");
        await abrirDesc(main);
        return;
      }
      if (t.hasAttribute("data-desc-hist")) {
        var hb = t.closest("[data-desc-id]").querySelector("[data-desc-histbox]");
        var h = await api("rol_desc_lista", { id: id });
        hb.innerHTML = (h.log || []).map(function (l) { return '<div class="note">' + esc(typeof horaEc === "function" ? horaEc(l.fecha) : l.fecha) + " · " + esc(l.actor) + " · " + esc(l.accion) + (l.motivo ? " · " + esc(l.motivo) : "") + "</div>"; }).join("") || '<p class="note">Sin historial.</p>';
      }
    });
  }

  // ── Resumen PDF del mes (todas) ──────────────────────────────────────────────────────────────────────────
  async function resumenPdf(periodo) {
    var r = await api("rol_resumen_periodo", { periodo: periodo });
    if (!r || r.error) { toast((r && r.error) || "No se pudo armar el resumen"); return; }
    if (!(r.items || []).length) { toast("Todavía no hay roles guardados de " + (r.etiqueta || periodo) + ". Crea los borradores primero."); return; }
    if (typeof _gcdCargarJsPDF !== "function") { toast("No se pudo cargar el generador de PDF"); return; }
    _gcdCargarJsPDF(function (ok) {
      if (!ok) { toast("No se pudo cargar el generador de PDF"); return; }
      var doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
      var W = 842, x0 = 40, y = 50;
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor("#3D5A7A");
      doc.text("SUNSU SPA - ROLES DE PAGO - " + String(r.etiqueta || periodo).toUpperCase(), x0, y); y += 18;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor("#4A5568");
      doc.text("Generado el " + new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" }) + " (hora de Ecuador)", x0, y); y += 22;
      var cols = [["Empleada", 120], ["Cargo", 85], ["Estado", 62], ["Ingresos", 68], ["IESS 9,45%", 64], ["Descuentos", 68], ["Neto", 68], ["Aporte patronal", 72], ["Costo empresa", 78], ["Firma", 56]];
      var fila = function (vals, bold) {
        var x = x0; doc.setFont("helvetica", bold ? "bold" : "normal");
        vals.forEach(function (v, i) { var w = cols[i][1]; var num = i >= 3 && i <= 8; doc.text(String(v), num ? x + w - 6 : x, y, num ? { align: "right" } : undefined); x += w; });
        y += 16;
      };
      doc.setFontSize(9); fila(cols.map(function (c) { return c[0]; }), true);
      doc.setDrawColor(196, 148, 58); doc.line(x0, y - 11, W - 40, y - 11);
      var tot = { i: 0, s: 0, e: 0, n: 0, p: 0, c: 0 };
      r.items.forEach(function (it) {
        if (y > 540) { doc.addPage(); y = 50; }
        fila([it.persona, it.cargo || "", it.estado, "$" + m2(it.totalIngresos), "$" + m2(it.iess), "$" + m2(it.totalEgresos), "$" + m2(it.neto), "$" + m2(it.aportePatronal), "$" + m2(it.costoEmpresa), it.firma ? "Firmado" : (it.estado === "aprobado" ? "Pendiente" : "—")]);
        tot.i += it.totalIngresos; tot.s += it.iess; tot.e += it.totalEgresos; tot.n += it.neto; tot.p += it.aportePatronal; tot.c += it.costoEmpresa;
      });
      doc.line(x0, y - 11, W - 40, y - 11);
      fila(["TOTAL", "", "", "$" + m2(tot.i), "$" + m2(tot.s), "$" + m2(tot.e), "$" + m2(tot.n), "$" + m2(tot.p), "$" + m2(tot.c), ""], true);
      y += 10; doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text("Costo empresa = ingresos (con décimos y fondo) + aporte patronal + CCC 1% (no se descuenta a la empleada). Descuentos = aporte IESS personal + anticipos + cuotas de préstamos + préstamos IESS + multas.", x0, y);
      if (typeof _entregarPDF === "function") _entregarPDF(doc, "ROLES " + String(r.etiqueta || periodo).toUpperCase() + " resumen.pdf");
      else doc.save("roles-resumen.pdf");
      toast("📄 Resumen listo");
    });
  }

  // ── Firma con el dedo ────────────────────────────────────────────────────────────────────────────────────
  function htmlFirma(pack) {
    if (pack.firma && pack.firma.png) {
      return '<div class="rol-firma-ok"><div class="card-title">✍️ Firmado' + (pack.firma.fechaLocal ? " el " + esc(pack.firma.fechaLocal) : "") + "</div>"
        + '<img class="rol-firma-img" alt="Firma" src="' + esc(pack.firma.png) + '"></div>';
    }
    if (pack.estado !== "aprobado") return "";
    if (pack.admin && state.admin) return '<p class="note rol-firma-pend">Pendiente de firma de ' + esc(pack.persona || "la empleada") + ".</p>";
    if (!pack.puedeFirmar || state.vista) return "";
    return '<div class="rol-firma"><div class="card-title">Firma tu rol con el dedo</div>'
      + '<p class="note">Revisa los valores. Al firmar confirmas que recibiste este rol y estás de acuerdo.</p>'
      + '<canvas class="rol-firma-canvas" id="rol-firma-canvas" aria-label="Espacio para firmar"></canvas>'
      + '<div class="tools"><button class="btn ghost small" type="button" data-firma-borrar="1">Borrar</button><button class="btn" type="button" data-firma-ok="' + esc(pack.id || "") + '">Firmar mi rol</button></div>'
      + '<p class="err" id="rol-firma-err"></p></div>';
  }
  function wireFirma(box, pack) {
    var cv = box.querySelector("#rol-firma-canvas");
    if (!cv) return;
    var ctx = cv.getContext("2d");
    var trazos = 0, puntos = 0, dib = false, last = null;
    var ajustar = function () {
      var r = cv.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1);
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1F2F46";
      trazos = 0; puntos = 0;
    };
    ajustar();
    var pos = function (e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener("pointerdown", function (e) { e.preventDefault(); dib = true; last = pos(e); trazos++; try { cv.setPointerCapture(e.pointerId); } catch (x) {} ctx.beginPath(); ctx.arc(last.x, last.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = "#1F2F46"; ctx.fill(); });
    cv.addEventListener("pointermove", function (e) { if (!dib) return; e.preventDefault(); var p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; puntos++; });
    var fin = function () { dib = false; last = null; };
    cv.addEventListener("pointerup", fin); cv.addEventListener("pointercancel", fin); cv.addEventListener("pointerleave", fin);
    var err = box.querySelector("#rol-firma-err");
    var b = box.querySelector("[data-firma-borrar]");
    if (b) b.onclick = function () { ctx.clearRect(0, 0, cv.width, cv.height); trazos = 0; puntos = 0; if (err) err.textContent = ""; };
    var ok = box.querySelector("[data-firma-ok]");
    if (ok) ok.onclick = async function () {
      if (puntos < 8) { if (err) err.textContent = "Dibuja tu firma con el dedo en el recuadro."; return; }
      // Exporta sobre fondo blanco recortado al alto real (PNG liviano para el PDF).
      var out = document.createElement("canvas"); out.width = 600; out.height = 190;
      var o = out.getContext("2d"); o.fillStyle = "#fff"; o.fillRect(0, 0, 600, 190); o.drawImage(cv, 0, 0, 600, 190);
      var png = out.toDataURL("image/png");
      ok.disabled = true; ok.textContent = "Firmando…";
      var res = await api("rol_firmar", { id: ok.getAttribute("data-firma-ok"), firma: png, userAgent: navigator.userAgent });
      ok.disabled = false; ok.textContent = "Firmar mi rol";
      if (!res || res.error) { if (err) err.textContent = (res && res.error) || "No se pudo firmar"; return; }
      toast("Rol firmado ✓");
      var nuevo = Object.assign({}, pack, { firma: res.firma, puedeFirmar: false });
      // Refresca la lista (la tarjeta pasa a «Firmado») y vuelve a mostrar el rol con la firma.
      if (typeof draw === "function") { window._rolPendiente = nuevo; await draw(); }
      else if (typeof mostrarRolOficial === "function") mostrarRolOficial(nuevo);
    };
  }


  // ── Configuración de rol (solo administración) ─────────────────────────────────────────────────────────
  function cfgCard(c, nueva) {
    var k = esc(c.persona);
    return '<div class="card cfgrol-card" data-cfgrol="' + k + '"' + (nueva ? ' data-cfgrol-nueva="1"' : "") + '>'
      + '<div class="card-title">' + esc(c.persona) + (c.nombreCompleto ? ' <span class="note">' + esc(c.nombreCompleto) + "</span>" : "")
      + (nueva ? ' <span class="rol-pill borrador">Sin configurar</span>' : "") + "</div>"
      + '<p class="note">' + esc(c.cargo || "") + (c.cedula ? " · C.I. " + esc(c.cedula) : "") + "</p>"
      + '<div class="cfgrol-form">'
      + '<label>Sueldo base $ <input data-f="sueldoBase" inputmode="decimal" value="' + esc(m2(c.sueldoBase)) + '"></label>'
      + '<label>Bono fijo $ <input data-f="bono" inputmode="decimal" value="' + esc(m2(c.bono)) + '"></label>'
      + '<label>Afiliada al IESS <select data-f="afiliada"><option value="si"' + (c.afiliada !== false ? " selected" : "") + '>Sí</option><option value="no"' + (c.afiliada === false ? " selected" : "") + ">No (factura sus servicios)</option></select></label>"
      + '<label>Fecha de ingreso <input data-f="fechaIngreso" type="date" value="' + esc(c.fechaIngreso || "") + '"></label>'
      + '<label>Cargo <input data-f="cargo" value="' + esc(c.cargo || "") + '"></label>'
      + '<label>Nota <input data-f="notas" maxlength="400" value="' + esc(c.notas || "") + '"></label>'
      + '<label class="cfgrol-check"><input type="checkbox" data-f="asumirSinMarcajes"' + (c.asumirSinMarcajes ? " checked" : "") + '> Asumir jornada si no hay marcajes (sin Jibble): los días que le tocaba trabajar y no tiene marca se cuentan como trabajados, no como falta.</label>'
      + '<label>Motivo del cambio (opcional) <input data-f="motivo" maxlength="300"></label>'
      + "</div>"
      + '<p class="note">Décimos 13º y 14º: mensualizados. Fondo de reserva (8,33 %): mensualizado, ' + esc(c.fondoEstado ? c.fondoEstado.charAt(0).toLowerCase() + c.fondoEstado.slice(1) : "desde que cumple 1 año") + ". El mes en que cumple el año se prorratea por días.</p>"
      + '<div class="tools"><button class="btn small" type="button" data-cfgrol-guardar="' + k + '">Guardar</button>'
      + (nueva ? "" : '<button class="btn ghost small" type="button" data-cfgrol-activa="' + k + '" data-activa="0">Marcar inactiva</button>') + '</div>'
      + '<p class="err" data-cfgrol-err></p></div>';
  }
  async function htmlConfigRol() {
    var d = await api("rolcfg_lista", {});
    if (!d || d.error) return '<p class="err">' + esc((d && d.error) || "No se pudo cargar") + "</p>";
    var activas = (d.items || []).map(function (c) { return cfgCard(c, false); }).join("");
    var nuevas = (d.sinConfig || []).map(function (c) { return cfgCard(Object.assign({ afiliada: true, fondoEstado: "" }, c), true); }).join("");
    var inact = (d.inactivas || []).map(function (c) {
      return '<div class="note" data-cfgrol="' + esc(c.persona) + '"><b>' + esc(c.persona) + "</b> · inactiva (sus datos se conservan, no sale en roles ni pre-rol) "
        + '<button class="btn ghost small" type="button" data-cfgrol-activa="' + esc(c.persona) + '" data-activa="1">Reactivar</button></div>';
    }).join("");
    var log = (d.log || []).map(function (l) {
      return '<div class="note">' + esc(typeof horaEc === "function" ? horaEc(l.fecha) : l.fecha) + " · " + esc(l.actor) + " · <b>" + esc(l.persona) + "</b> · " + esc(l.accion) + (l.motivo ? " · " + esc(l.motivo) : "") + "</div>";
    }).join("") || '<p class="note">Todavía no hay cambios.</p>';
    return '<h1>Configuración de rol</h1><div class="tools"><button class="btn ghost small" type="button" data-desc-abrir="1">💵 Anticipos y préstamos</button></div><div id="desc-panel"></div>' + (await htmlIessBox()) + '<p class="note">Datos base de cada empleada para el rol de pagos. Solo administración. Cada cambio queda en el historial (quién, antes y después). Emi y EFCH son administradoras: no aparecen aquí.</p>'
      + (activas || '<p class="note">Todavía no hay empleadas configuradas.</p>') + nuevas
      + (inact ? '<details class="card"><summary>Inactivas</summary>' + inact + "</details>" : "")
      + '<details class="card"><summary>Historial de cambios</summary>' + log + "</details>";
  }
  function wireConfig(main) {
    wireIess(main);
    if (main._cfgWired) return;
    var hay = main.querySelector("[data-cfgrol]");
    if (!hay) return;
    main._cfgWired = true;
    main.addEventListener("click", async function (ev) {
      var g = ev.target.closest("[data-cfgrol-guardar],[data-cfgrol-activa]");
      if (!g) return;
      var persona = g.getAttribute("data-cfgrol-guardar") || g.getAttribute("data-cfgrol-activa");
      var card = g.closest("[data-cfgrol]");
      var val = function (f) { var e = card.querySelector('[data-f="' + f + '"]'); return e ? e.value : ""; };
      var body;
      if (g.hasAttribute("data-cfgrol-activa")) {
        var a = await api("rolcfg_lista", {});
        var prev = ((a.items || []).concat(a.inactivas || [])).find(function (x) { return x.persona === persona; }) || {};
        var activa = g.getAttribute("data-activa") === "1";
        if (!activa && !window.confirm("¿Marcar a " + persona + " como inactiva? Ya no saldrá en roles ni en el pre-rol. Sus datos se conservan.")) return;
        body = { persona: persona, sueldoBase: prev.sueldoBase, bono: prev.bono, afiliada: prev.afiliada !== false ? "si" : "no", fechaIngreso: prev.fechaIngreso, cargo: prev.cargo, notas: prev.notas, asumirSinMarcajes: !!prev.asumirSinMarcajes, activa: activa, motivo: activa ? "Reactivada" : "Marcada inactiva" };
      } else {
        body = { persona: persona, sueldoBase: Number(String(val("sueldoBase")).replace(",", ".")), bono: Number(String(val("bono")).replace(",", ".")), afiliada: val("afiliada"), fechaIngreso: val("fechaIngreso"), cargo: val("cargo"), notas: val("notas"), asumirSinMarcajes: !!(card.querySelector('[data-f="asumirSinMarcajes"]') && card.querySelector('[data-f="asumirSinMarcajes"]').checked), motivo: val("motivo"), activa: true };
      }
      var err = card.querySelector("[data-cfgrol-err]");
      if (err) err.textContent = "";
      var r = await api("rolcfg_guardar", body);
      if (!r || r.error) { if (err) err.textContent = (r && r.error) || "No se pudo guardar"; else toast((r && r.error) || "No se pudo guardar"); return; }
      toast(r.sinCambios ? "Sin cambios" : "Configuración guardada");
      if (typeof draw === "function") await draw();
    });
  }


  // ── DEV-31c (Emilia t910u/t911u) · Roles (admin) rediseñado ──────────────────────────────────────────────
  // Una empleada a la vez: su PRE-ROL del mes siempre creado y recalculado solo, con el mismo diseño del PDF.
  function ahoraEc() {
    try { return new Date().toLocaleTimeString("es-EC", { timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", hour12: false }); } catch (e) { return ""; }
  }
  function fechaHoraEc(iso) { return typeof horaEc === "function" ? horaEc(iso) : String(iso || ""); }
  function pillsRol(it) {
    var est = it.estado || "borrador";
    var s = typeof rolPill === "function" ? rolPill(est) : esc(est);
    if (est === "aprobado" && it.fuente !== "historial") s += it.firmado ? ' <span class="rol-pill firmado">Firmado</span>' : ' <span class="rol-pill porfirmar">Por firmar</span>';
    return s;
  }
  // El rol tal como sale en el PDF: título, datos, barra INGRESOS (verde), EGRESOS (roja), NETO y pie.
  function htmlRolDoc(pack, o) {
    o = o || {};
    var d = (pack && (pack.data || pack)) || {};
    var r = typeof _lineasRol === "function" ? _lineasRol(d) : { ingresos: [], egresos: [], notas: [], totalIngresos: d.totalIngresos, totalEgresos: d.totalEgresos, neto: d.totalRecibir, dias: "" };
    var fila = function (par, i, cls) { return '<div class="rolx-fila' + (i % 2 ? " z" : "") + '"><span>' + esc(par[0]) + '</span><b class="' + cls + '">$' + m2(par[1]) + "</b></div>"; };
    var ing = r.ingresos.map(function (p, i) { return fila(p, i, "v"); }).join("");
    var egr = r.egresos.length ? '<div class="rolx-bar egr">EGRESOS</div>' + r.egresos.map(function (p, i) { return fila(p, i, "r"); }).join("")
      + '<div class="rolx-tot r">TOTAL EGRESOS: $' + m2(r.totalEgresos) + "</div>" : "";
    var notas = (r.notas || []).map(function (x) { return '<p class="rolx-nota">' + esc(x) + "</p>"; }).join("");
    var pre = !!o.pre;
    var pie;
    if (pre) pie = '<div class="rolx-pie pre"><b>PRE-ROL / Borrador para revisión</b><span>Pendiente de revisión de Contabilidad y de aprobación de administración. Sin firma de la empleada.</span></div>';
    else if (o.firma && o.firma.png) pie = '<div class="rolx-pie ok"><b>ROL FIRMADO POR LA EMPLEADA</b><img alt="Firma" src="' + esc(o.firma.png) + '"><span>Recibí conforme · ' + esc(typeof _rolNombre === "function" ? _rolNombre(d) : (d.nombre || "")) + " · firmado el " + esc(o.firma.fechaLocal || o.firma.firmadoAt || "") + "</span></div>";
    else pie = '<div class="rolx-pie"><span>Recibí conforme · ' + esc(typeof _rolNombre === "function" ? _rolNombre(d) : (d.nombre || "")) + "</span></div>";
    return '<div class="rolx-doc' + (pre ? " is-pre" : "") + '">'
      + (pre ? '<div class="rolx-banda">PRE-ROL / Borrador para revisión</div>' : "")
      + '<div class="rolx-titulo">' + (pre ? "PRE-ROL DE PAGOS" : "ROL DE PAGOS") + "</div>"
      + '<div class="rolx-sub">Sunsu Spa · Quito · Período: ' + esc(String(d.etiqueta || pack.etiqueta || pack.periodo || "").toUpperCase()) + "</div>"
      + '<div class="rolx-datos"><b>EMPLEADA</b><span>' + esc((typeof _rolNombre === "function" ? _rolNombre(d) : "") || d.nombreCompleto || d.nombre || pack.persona || "") + "</span>"
      + (d.cedula ? "<b>CÉDULA</b><span>" + esc(d.cedula) + "</span>" : "")
      + (d.cargo ? "<b>CARGO</b><span>" + esc(d.cargo) + "</span>" : "")
      + "<b>DÍAS</b><span>" + esc(r.dias || (typeof _rolDiasLinea === "function" ? _rolDiasLinea(d) : "")) + "</span></div>"
      + '<div class="rolx-bar ing">INGRESOS</div>' + ing + '<div class="rolx-tot v">TOTAL INGRESOS: $' + m2(r.totalIngresos) + "</div>" + egr
      + '<div class="rolx-neto"><span>NETO A RECIBIR:</span><b>$' + m2(r.neto) + "</b></div>" + notas + pie + "</div>";
  }
  function htmlKpis(d) {
    // DEV-31k (t929u/t930u): minitablero = solo total de días, sueldo+bono y comisiones por separado. El desglose de días va en el rol/PDF.
    if (typeof _htmlRolKpis === "function") return _htmlRolKpis(d);
    var r = typeof _lineasRol === "function" ? _lineasRol(d) : { totalEgresos: d.totalEgresos, neto: d.totalRecibir };
    var tot = Number(d.diasTrabajados || 0) + Number(d.diasFest || 0) + Number(d.diasDesc || 0) + Number(d.diasAsumidos || 0);
    var sueldoBono = Math.round((Number(d.sueldo || 0) + Number(d.bono || 0)) * 100) / 100;
    var fac = (d.comFacialesSolo != null) ? Number(d.comFacialesSolo || 0) : Number(d.comFaciales || 0);
    var com = Math.round((fac + Number(d.comExtras || 0) + Number(d.comPaquetes || 0) + Number(d.comProductos || 0) + Number(d.comRecepcion || 0)) * 100) / 100;
    var k = function (a, b, cls) { return '<div class="rolx-k' + (cls ? " " + cls : "") + '"><span>' + a + "</span><b>" + b + "</b></div>"; };
    return '<div class="rolx-kpis">' + k("Días", esc(String(tot)) + (d.faltas ? ' <small class="err">' + esc(d.faltas) + " falta(s)</small>" : ""))
      + k("Sueldo + bono", "$" + m2(sueldoBono)) + k("Comisiones", "$" + m2(com))
      + k("IESS", "$" + m2(d.iess || 0)) + k("Descuentos", "$" + m2(Math.max(0, Number(r.totalEgresos) - Number(d.iess || 0))))
      + k("Neto", "$" + m2(r.neto), "neto") + "</div>";
  }
  var CONTAB = { "": "Sin enviar", enviado: "Enviado a contabilidad", ok: "Ok de contabilidad" };
  function htmlPreRolCuerpo(pack, persona) {
    var d = pack.data || pack || {};
    var aprobado = pack.estado === "aprobado";
    var pa = d.aportesPatronal || {};
    var ccc = pa.ccc != null ? pa.ccc : d.ccc;
    var costo = '<div class="rolx-costo"><span>Aporte patronal <b>$' + m2(pa.total) + '</b></span><span>CCC 1% <b>$' + m2(ccc) + '</b></span><span>Costo total empresa <b>$' + m2(pa.costoEmpresa != null ? pa.costoEmpresa : Number(d.totalIngresos || 0) + Number(pa.total || 0) + Number(ccc || 0)) + '</b></span><small>solo administración · la CCC no se descuenta a la empleada</small></div>';
    var cab = '<div class="rolx-estado"><span>' + (aprobado ? "Rol de " : "Pre-rol de ") + esc(pack.etiqueta || d.etiqueta || "") + "</span> " + pillsRol(pack)
      + (aprobado ? "" : ' <small class="note">se actualiza solo (marcas, comisiones, anticipos…) · actualizado hoy ' + esc(ahoraEc()) + "</small>") + "</div>";
    var acc;
    if (aprobado) {
      acc = '<div class="rolx-acc"><div class="rolx-ap">✔ Aprobado' + (pack.aprobadoPor ? " por " + esc(pack.aprobadoPor) : "") + (pack.aprobadoAt ? " el " + esc(fechaHoraEc(pack.aprobadoAt)) : "") + " · "
        + (pack.firmado ? "la empleada ya lo firmó" : "esperando la firma de la empleada") + '</div><button class="btn ghost small" type="button" data-rolx-pdf-final="' + esc(pack.id) + '">Descargar PDF</button></div>';
    } else {
      var c = (pack.contab && pack.contab.estado) || "";
      var opts = Object.keys(CONTAB).map(function (k) { return '<option value="' + k + '"' + (k === c ? " selected" : "") + ">" + CONTAB[k] + "</option>"; }).join("");
      var quien = c && pack.contab && pack.contab.at ? '<small class="note"> · ' + esc(pack.contab.por || "") + " " + esc(fechaHoraEc(pack.contab.at)) + "</small>" : "";
      acc = '<div class="rolx-acc"><div class="rolx-conta"><button class="btn small" type="button" data-rolx-pdf="1">📄 Descargar PDF para Contabilidad</button>'
        + '<button class="btn ghost small" type="button" data-rolx-pdf-todas="1">PDF de todas</button>'
        + '<label class="rolx-cs">Contabilidad <select data-rolx-contab="' + esc(pack.id) + '">' + opts + "</select></label>" + quien + "</div>"
        + '<button class="btn rolx-aprobar" type="button" data-rolx-aprobar="' + esc(pack.id) + '">Aprobar rol y enviar a la empleada</button>'
        + '<p class="note rolx-aviso">La empleada no ve nada hasta que apruebes: entonces le aparece en su Rol para firmar.</p></div>';
    }
    var aviso = pack.aviso ? '<p class="note">' + esc(pack.aviso) + "</p>" : "";
    return cab + aviso + htmlKpis(d) + htmlRolDoc(pack, { pre: !aprobado }) + costo + acc
      + (aprobado ? "" : htmlMarcasBoxSafe(pack, persona));
  }
  function htmlMarcasBoxSafe(pack, persona) {
    return typeof htmlMarcasAdminBox === "function" ? htmlMarcasAdminBox({ persona: persona, hoy: pack.hoy }) : "";
  }
  var RX = { personas: [], persona: "", pack: null };
  async function htmlAdmin() {
    var op = await api("rol_opciones");
    if (!op || op.error) return '<p class="err">' + esc((op && op.error) || "No se pudo cargar") + "</p>";
    RX.personas = (op.afiliadas || []).map(function (x) { return x.nombre; });
    if (!RX.personas.length) return "<h1>Roles</h1><p class=\"note\">No hay empleadas activas. Actívalas en Configuración de rol.</p>";
    var cur = typeof state !== "undefined" && state.persona && RX.personas.indexOf(state.persona) >= 0 ? state.persona : (RX.persona && RX.personas.indexOf(RX.persona) >= 0 ? RX.persona : RX.personas[0]);
    RX.persona = cur;
    var opts = RX.personas.map(function (n) { return '<option value="' + esc(n) + '"' + (n === cur ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("");
    return '<div class="rolx" id="rolx"><div class="rolx-top"><select id="rolx-persona" class="rolx-sel" aria-label="Empleada">' + opts + "</select>"
      + '<button class="btn ghost small" type="button" data-rolx-hist="1" aria-expanded="false">Historial</button>'
      + '<details class="rolx-mas"><summary class="btn ghost small">⋯ Más</summary><div class="rolx-menu">'
      + '<button type="button" data-desc-abrir="1">💵 Anticipos y préstamos</button>'
      + '<button type="button" data-go="#/m/personal/config-rol">⚙️ Configuración de rol</button>'
      + '<button type="button" data-rolx-equipo="1">👥 Resumen del equipo</button></div></details></div>'
      + '<div id="rolx-body"><p class="note">Calculando el pre-rol…</p></div>'
      + '<div id="rolx-hist" hidden></div><div id="rolx-ver"></div><div id="rolx-equipo"></div><div id="desc-panel"></div></div>';
  }
  async function pdfDeRol(id) {
    var pack = await api("rol_get", { id: id });
    if (!pack || pack.error) { toast((pack && pack.error) || "No se pudo abrir el rol"); return; }
    descargarPdf(pack);
  }
  async function descargarPdf(pack) {
    var d = pack.data || pack, periodo = pack.periodo || d.periodo || "";
    if (typeof _pdfRol !== "function") { toast("No se pudo cargar el generador de PDF"); return; }
    if (pack.firma && pack.firma.png) { _pdfRol(d, periodo, { png: pack.firma.png, fecha: pack.firma.fechaLocal || pack.firma.firmadoAt, fechaLocal: pack.firma.fechaLocal }); return; }
    var apro = null;
    try {
      var ap = await api("getAprobacionesRol", { sheet: periodo });
      var ced = String(d.cedula || "").replace(/\.0+$/, "").replace(/\D/g, "");
      apro = (ap && ap.aprobaciones && (ap.aprobaciones[ced] || ap.aprobaciones[ced + "0"])) || null;
    } catch (e) { apro = null; }
    _pdfRol(d, periodo, apro);
  }
  async function cargarRol(main, fechaMk) {
    var body = main.querySelector("#rolx-body");
    if (!body) return;
    var persona = RX.persona;
    var pack = await api("rol_pre_auto", { persona: persona });
    if (persona !== RX.persona) return;
    if (!pack || pack.error) { body.innerHTML = '<p class="err">' + esc((pack && pack.error) || "No se pudo calcular el pre-rol") + "</p>"; return; }
    var d0 = pack.data || pack;
    if (!d0 || (d0.nombre == null && d0.nombreCompleto == null && d0.totalRecibir == null && d0.sueldo == null && d0.etiqueta == null)) {
      body.innerHTML = '<p class="err">No se pudo calcular el pre-rol de ' + esc(persona) + ".</p>"; return;
    }
    if (!pack.data) pack.data = d0;
    RX.pack = pack;
    body.innerHTML = htmlPreRolCuerpo(pack, persona);
    var det = body.querySelector("[data-mk-de]");
    if (det && typeof wireMarcasAdmin === "function") wireMarcasAdmin(body, function (f) { return cargarRol(main, f); }, fechaMk, !!fechaMk);
  }
  async function abrirHistorial(main) {
    var box = main.querySelector("#rolx-hist");
    box.innerHTML = '<p class="note">Cargando historial…</p>';
    var l = await api("roles_lista", { persona: RX.persona });
    if (!l || l.error) { box.innerHTML = '<p class="err">' + esc((l && l.error) || "No se pudo cargar") + "</p>"; return; }
    var items = (l.items || []).filter(function (it) { return it.estado === "aprobado"; });
    box.innerHTML = '<div class="rolx-histl"><div class="rolx-hh"><b>Historial de ' + esc(RX.persona) + "</b></div>"
      + (items.map(function (it) {
        var ver = it.id ? 'data-rolx-ver-id="' + esc(it.id) + '"' : 'data-rolx-ver-sheet="' + esc(it.sheet || it.periodo) + '" data-cedula="' + esc(it.cedula || "") + '" data-persona="' + esc(it.persona || "") + '"';
        return '<div class="rolx-h1"><span class="m">' + esc(it.etiqueta || it.periodo) + "</span><span class=\"p\">" + pillsRol(it) + '</span><b class="n">' + (typeof money === "function" ? money(it.neto != null ? it.neto : it.totalIngresos) : "$" + m2(it.neto)) + '</b><button class="btn ghost small" type="button" ' + ver + ">Ver</button></div>";
      }).join("") || '<p class="note">Todavía no hay roles aprobados.</p>') + "</div>";
  }
  async function verRol(main, b) {
    var pack;
    if (b.hasAttribute("data-rolx-ver-id")) pack = await api("rol_get", { id: b.getAttribute("data-rolx-ver-id") });
    else {
      var sheet = b.getAttribute("data-rolx-ver-sheet");
      var res = await api("getRolIndividual", { sheet: sheet, cedula: b.getAttribute("data-cedula") || "", persona: b.getAttribute("data-persona") || "" });
      if (res && !res.error) pack = { ok: true, data: res.data || res, estado: "aprobado", periodo: res.periodo || sheet, etiqueta: res.etiqueta || (res.data && res.data.etiqueta) || sheet, persona: b.getAttribute("data-persona") || "" };
      else pack = res;
    }
    if (!pack || pack.error) { toast((pack && pack.error) || "No se pudo abrir el rol"); return; }
    window._rolxVer = pack;
    var box = main.querySelector("#rolx-ver");
    var dVer = pack.data || pack || {};
    box.innerHTML = '<div class="rolx-verbar"><b>' + esc(pack.etiqueta || dVer.etiqueta || "") + '</b><span><button class="btn small" type="button" data-rolx-ver-pdf="1">Descargar PDF</button> <button class="btn ghost small" type="button" data-rolx-ver-cerrar="1">Cerrar</button></span></div>'
      + htmlKpis(dVer) + htmlRolDoc(pack, { firma: pack.firma });
    box.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  function wireAdmin(main) {
    var root = main.querySelector("#rolx");
    if (!root || root._wired) return;
    root._wired = true;
    var sel = root.querySelector("#rolx-persona");
    sel.onchange = function () {
      RX.persona = sel.value;
      if (typeof state !== "undefined") state.persona = sel.value;
      root.querySelector("#rolx-ver").innerHTML = "";
      root.querySelector("#rolx-body").innerHTML = '<p class="note">Calculando el pre-rol…</p>';
      var hist = root.querySelector("#rolx-hist");
      if (!hist.hidden) abrirHistorial(root);
      cargarRol(root);
    };
    root.addEventListener("click", async function (ev) {
      if (ev.target.closest(".rolx-menu")) { var m0 = root.querySelector(".rolx-mas"); if (m0) setTimeout(function () { m0.open = false; }, 0); }
      var t = ev.target.closest("[data-rolx-hist],[data-rolx-equipo],[data-rolx-pdf],[data-rolx-pdf-todas],[data-rolx-pdf-final],[data-rolx-aprobar],[data-rolx-ver-id],[data-rolx-ver-sheet],[data-rolx-ver-pdf],[data-rolx-ver-cerrar]");
      if (!t) return;
      var mas = root.querySelector(".rolx-mas"); if (mas) mas.open = false;
      if (t.hasAttribute("data-rolx-hist")) {
        var h = root.querySelector("#rolx-hist");
        h.hidden = !h.hidden;
        t.setAttribute("aria-expanded", h.hidden ? "false" : "true");
        if (!h.hidden) await abrirHistorial(root);
        return;
      }
      if (t.hasAttribute("data-rolx-equipo")) {
        var eq = root.querySelector("#rolx-equipo");
        eq.innerHTML = '<p class="note">Cargando el resumen del equipo…</p>';
        eq.innerHTML = (await htmlPreRolResumen({ compacto: true })) || '<p class="err">No se pudo cargar</p>';
        eq.scrollIntoView({ block: "start", behavior: "smooth" });
        return;
      }
      if (t.hasAttribute("data-rolx-pdf")) {
        var p = RX.pack;
        if (!p || typeof _pdfRol !== "function") { toast("No se pudo cargar el generador de PDF"); return; }
        _pdfRol(p.data, p.periodo, { preRol: true });
        return;
      }
      if (t.hasAttribute("data-rolx-pdf-todas")) {
        t.disabled = true;
        var r = await api("rol_pre_todos", {});
        t.disabled = false;
        if (!r || r.error) { toast((r && r.error) || "No se pudo armar el PDF"); return; }
        if (typeof _pdfPreRolVarios !== "function") { toast("No se pudo cargar el generador de PDF"); return; }
        _pdfPreRolVarios((r.items || []).map(function (x) { return { d: x.data, periodo: x.periodo }; }), RX.pack ? RX.pack.periodo : "");
        if (RX.pack) cargarRol(root);
        return;
      }
      if (t.hasAttribute("data-rolx-pdf-final")) { await pdfDeRol(t.getAttribute("data-rolx-pdf-final")); return; }
      if (t.hasAttribute("data-rolx-ver-pdf")) { if (window._rolxVer) await descargarPdf(window._rolxVer); return; }
      if (t.hasAttribute("data-rolx-ver-cerrar")) { root.querySelector("#rolx-ver").innerHTML = ""; return; }
      if (t.hasAttribute("data-rolx-ver-id") || t.hasAttribute("data-rolx-ver-sheet")) { await verRol(root, t); return; }
      if (t.hasAttribute("data-rolx-aprobar")) {
        if ((typeof state !== "undefined") && (state.prueba || state.vista)) { toast("En «Ver como» o en simulación no se aprueban roles reales."); return; }
        var id = t.getAttribute("data-rolx-aprobar");
        var antes = RX.pack, netoAntes = Number(((antes && antes.data) || {}).totalRecibir || 0);
        t.disabled = true;
        var fresco = await api("rol_pre_auto", { persona: RX.persona });
        if (!fresco || fresco.error) { t.disabled = false; toast((fresco && fresco.error) || "No se pudo actualizar el pre-rol"); return; }
        if (Math.abs(Number((fresco.data || {}).totalRecibir || 0) - netoAntes) > 0.004) {
          RX.pack = fresco; root.querySelector("#rolx-body").innerHTML = htmlPreRolCuerpo(fresco, RX.persona);
          toast("El pre-rol cambió (de $" + m2(netoAntes) + " a $" + m2((fresco.data || {}).totalRecibir) + "). Revísalo y vuelve a aprobar.");
          return;
        }
        var conta = (fresco.contab && fresco.contab.estado) || "";
        var msg = "¿Aprobar el rol de " + RX.persona + " (" + (fresco.etiqueta || "") + ") por un neto de $" + m2((fresco.data || {}).totalRecibir) + " y enviarlo a la empleada para que lo firme?"
          + (conta !== "ok" ? "\n\nOjo: Contabilidad todavía no está marcada como «Ok»." : "");
        if (!window.confirm(msg)) { t.disabled = false; return; }
        var ap = await api("rol_aprobar", { id: fresco.id });
        t.disabled = false;
        if (!ap || ap.error) { toast((ap && ap.error) || "No se pudo aprobar"); return; }
        toast("Rol aprobado: " + RX.persona + " ya lo ve para firmar");
        await cargarRol(root);
      }
    });
    root.addEventListener("change", async function (ev) {
      var s = ev.target.closest("[data-rolx-contab]");
      if (!s) return;
      var r = await api("rol_contab", { id: s.getAttribute("data-rolx-contab"), estado: s.value });
      if (!r || r.error) { toast((r && r.error) || "No se pudo guardar"); await cargarRol(root); return; }
      toast(CONTAB[s.value] || "Guardado");
      await cargarRol(root);
    });
    cargarRol(root);
  }


  // ── DEV-31c · Planilla IESS: importar el XLS mensual y compararlo con el rol ────────────────────────────
  function cargarXlsx() {
    return new Promise(function (ok, no) {
      if (window.XLSX) return ok(window.XLSX);
      var sc = document.createElement("script");
      sc.src = "vendor-xlsx.js?v=20261125tk232";
      sc.onload = function () { window.XLSX ? ok(window.XLSX) : no(new Error("No se pudo cargar el lector de Excel")); };
      sc.onerror = function () { no(new Error("No se pudo cargar el lector de Excel")); };
      document.head.appendChild(sc);
    });
  }
  async function filasDeXls(file) {
    var X = await cargarXlsx();
    var wb = X.read(await file.arrayBuffer(), { type: "array" });
    var ws = wb.Sheets[wb.SheetNames[0]];
    var m = X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
    var hi = m.findIndex(function (r) { return r.some(function (c) { return /^c[eé]dula$/i.test(String(c).trim()); }) && r.some(function (c) { return /^periodo$/i.test(String(c).trim()); }); });
    if (hi < 0) throw new Error("No encuentro las columnas Periodo y Cédula. ¿Es el «Detalle de la planilla» del IESS?");
    // El XLS del IESS deja sin título la columna del valor CCC (queda justo después de «% CCC»).
    var head = m[hi].map(function (h, i) { return String(h).trim() || (/% ?ccc/i.test(String(m[hi][i - 1] || "")) ? "CCC valor" : ""); });
    return m.slice(hi + 1).map(function (r) { var o = {}; head.forEach(function (h, i) { if (String(h).trim()) o[String(h).trim()] = r[i]; }); return o; });
  }
  var EST_IESS = { ok: ["aprobado", "Coincide"], revisar: ["rechazado", "Revisar"], sin_rol: ["borrador", "Sin rol"], admin: ["borrador", "Administradora"], sin_empleada: ["rechazado", "No es empleada"] };
  function dinero(v) { return v == null ? "—" : "$" + m2(v); }
  function htmlComparacion(c) {
    var filas = (c.items || []).concat(c.otros || []).map(function (x) {
      var e = EST_IESS[x.estado] || ["borrador", x.estado];
      var nom = x.persona ? esc(x.persona) : esc(x.nombreIess || "");
      var sub = x.persona ? (x.nombreIess ? '<div class="note">' + esc(x.nombreIess) + "</div>" : "") : '<div class="note">C.I. ' + esc(x.cedulaIess) + "</div>";
      var dif = x.dif == null ? "—" : (Math.abs(x.dif) < 0.005 ? "$0.00" : '<b class="err">' + (x.dif > 0 ? "+" : "−") + "$" + m2(Math.abs(x.dif)) + "</b>");
      var afi = x.persona ? ((x.afiliadaApp ? "Sí" : "No") + " / " + (x.enPlanilla ? "Sí" : "No")) : "— / Sí";
      return "<tr><td><b>" + nom + "</b>" + sub + "</td><td>" + afi + '</td><td class="num">' + dinero(x.aportableIess) + '</td><td class="num">' + dinero(x.aportableApp) + '</td><td class="num">' + dif
        + '</td><td class="num">' + dinero(x.individualIess) + ' <span class="note">/ ' + dinero(x.individualApp) + '</span></td><td><span class="rol-pill ' + e[0] + '">' + esc(e[1]) + "</span>"
        + (x.avisos || []).map(function (a) { return '<div class="note">' + esc(a) + "</div>"; }).join("") + "</td></tr>";
    }).join("");
    var t = c.totales || {};
    return '<p class="note"><b>' + esc(c.etiqueta) + "</b> · fuente del rol: " + esc(((c.items || []).find(function (x) { return x.fuenteApp; }) || {}).fuenteApp || "—") + "</p>"
      + '<div class="prerol-tabla-wrap"><table class="prerol-tabla"><thead><tr><th>Empleada</th><th>Afiliada app / IESS</th><th>Aportable IESS</th><th>Aportable rol</th><th>Diferencia</th><th>IESS individual (IESS / rol)</th><th>Estado</th></tr></thead><tbody>' + filas
      + '</tbody><tfoot><tr><td><b>Total empleadas</b></td><td></td><td class="num">' + dinero(t.aportableIess) + '</td><td class="num">' + dinero(t.aportableApp) + '</td><td class="num">' + dinero(Math.round(((t.aportableIess || 0) - (t.aportableApp || 0)) * 100) / 100) + '</td><td class="num">' + dinero(t.individualIess) + ' <span class="note">/ ' + dinero(t.individualApp) + "</span></td><td></td></tr></tfoot></table></div>"
      + '<p class="note">Patronal IESS: planilla ' + dinero(t.patronalIess) + " · rol " + dinero(t.patronalApp) + " · CCC (1 %) en la planilla: " + dinero(t.cccIess) + ". " + esc(c.nota || "") + "</p>";
  }
  async function htmlIessBox() {
    var l = await api("iess_lista", {});
    var items = (l && l.items) || [];
    var opts = items.map(function (x) { return '<option value="' + esc(x.periodo) + '">' + esc(x.etiqueta) + " · " + esc(x.filas) + " filas</option>"; }).join("");
    return '<details class="card iess-box"' + (items.length ? "" : "") + '><summary><b>Planilla IESS</b> · comparar con el rol</summary>'
      + '<p class="note">Sube cada mes el «Detalle de la planilla» (XLS) que baja del IESS. La app compara afiliación, sueldo aportable y aporte individual con el rol de ese mes y avisa las diferencias. No cambia ningún dato.</p>'
      + '<div class="tools"><label class="btn small">📥 Importar planilla IESS (XLS)<input type="file" accept=".xls,.xlsx" hidden data-iess-file></label>'
      + (items.length ? '<select data-iess-per aria-label="Mes">' + opts + '</select><button class="btn ghost small" type="button" data-iess-comparar="1">Comparar</button>' : "") + "</div>"
      + '<p class="err" data-iess-err></p><div data-iess-res>' + (items.length ? "" : '<p class="note">Todavía no hay planillas importadas.</p>') + "</div></details>";
  }
  function wireIess(main) {
    var box = main.querySelector(".iess-box");
    if (!box || box._wired) return;
    box._wired = true;
    var vivo = function () { return main.querySelector(".iess-box") || box; };
    var err = function (m) { var e = vivo().querySelector("[data-iess-err]"); if (e) e.textContent = m || ""; };
    var comparar = async function (per) {
      var res = vivo().querySelector("[data-iess-res]");
      res.innerHTML = '<p class="note">Comparando…</p>';
      var c = await api("iess_comparar", { periodo: per });
      res.innerHTML = c && !c.error ? htmlComparacion(c) : '<p class="err">' + esc((c && c.error) || "No se pudo comparar") + "</p>";
    };
    box.addEventListener("change", async function (ev) {
      var f = ev.target.closest("[data-iess-file]");
      if (!f || !f.files || !f.files[0]) return;
      var file = f.files[0]; f.value = "";
      err("");
      try {
        var filas = await filasDeXls(file);
        var r = await api("iess_importar", { archivo: file.name, filas: filas });
        if (!r || r.error) { err((r && r.error) || "No se pudo importar"); return; }
        toast("Planilla importada: " + r.periodos.join(", ") + " (" + r.filas + " filas)" + (r.reemplazadas ? " · reemplaza la anterior" : ""));
        var nuevo = await htmlIessBox();
        var tmp = document.createElement("div"); tmp.innerHTML = nuevo;
        var n = tmp.firstElementChild; n.open = true;
        box.replaceWith(n); n._wired = false;
        wireIess(main);
        var sel = n.querySelector("[data-iess-per]");
        if (sel) { sel.value = r.periodos[0]; await comparar(r.periodos[0]); }
      } catch (e) { err(e && e.message ? e.message : "No se pudo leer el archivo"); }
    });
    box.addEventListener("click", async function (ev) {
      var b = ev.target.closest("[data-iess-comparar]");
      if (!b) return;
      var sel = box.querySelector("[data-iess-per]");
      if (sel) await comparar(sel.value);
    });
  }

  window.SunsuRol = { htmlAdmin: htmlAdmin, wireAdmin: wireAdmin, htmlConfigRol: htmlConfigRol, wireConfig: wireConfig, htmlPreRolResumen: htmlPreRolResumen, abrirDesc: abrirDesc, wireDesc: wireDesc, resumenPdf: resumenPdf, htmlFirma: htmlFirma, wireFirma: wireFirma };
})();
