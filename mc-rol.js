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
  async function htmlPreRolResumen() {
    var r = await api("rol_prerol_resumen", {});
    if (!r || r.error) return "";
    // Costo empresa y patronal: solo administración (la API los quita para quien no puede verlos).
    var conCosto = !!(r.totales && r.totales.costoEmpresa != null);
    var filas = (r.filas || []).map(function (x) {
      if (x.error) return '<tr><td>' + esc(x.nombre) + '</td><td colspan="9" class="err">' + esc(x.error) + "</td></tr>";
      var desc = Number(x.anticipos || 0) + Number(x.prestamos || 0);
      return '<tr data-prerol-fila="' + esc(x.nombre) + '">'
        + '<td><b>' + esc(x.nombre) + "</b>" + (x.afiliada ? "" : ' <span class="note">sin IESS</span>') + "</td>"
        + '<td class="num">' + esc(x.diasTrabajados) + (x.diasAsumidos ? ' <span class="note">+' + esc(x.diasAsumidos) + " asum.</span>" : "") + (x.faltas ? ' <span class="err">' + esc(x.faltas) + " f.</span>" : "") + "</td>"
        + '<td class="num">' + hrs(x.hrsNormales) + (x.hrsSupl ? ' <span class="note">50%: ' + hrs(x.hrsSupl) + "</span>" : "") + ((x.hrsExtr + x.hrsDesc) ? ' <span class="note">100%: ' + hrs(x.hrsExtr + x.hrsDesc) + "</span>" : "") + "</td>"
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
        + '<td class="acc"><button class="btn ghost small" type="button" data-prerol="' + esc(x.nombre) + '">Detalle</button>'
        + ((!x.rol || x.rol.estado !== "aprobado") ? '<button class="btn ghost small" type="button" data-prerol-crear="' + esc(x.nombre) + '" data-periodo="' + esc(r.periodo) + '">' + (x.rol ? "Recalcular borrador" : "Crear borrador") + "</button>" : "")
        + (x.rol ? '<button class="btn ghost small" type="button" data-rol-ab="' + esc(x.rol.id) + '">Ver rol</button>' : "")
        + "</td></tr>";
    }).join("");
    var t = r.totales || {};
    return '<div class="card prerol-box"><div class="card-title">Pre-rol de ' + esc(r.etiqueta || "") + " al " + esc(fecha(r.hoy)) + "</div>"
      + '<div class="tools"><button class="btn small" type="button" data-desc-abrir="1">💵 Anticipos y préstamos</button>'
      + '<button class="btn ghost small" type="button" data-rol-resumen-pdf="' + esc(r.periodo) + '">📄 Resumen PDF del mes</button>'
      + '<button class="btn ghost small" type="button" data-go="#/m/personal/config-rol">⚙️ Configuración de rol</button></div>'
      + '<div class="prerol-tabla-wrap"><table class="prerol-tabla"><thead><tr><th>Empleada</th><th>Días</th><th>Horas</th><th>Sueldo + bono</th><th>Comisiones</th><th>Horas extra</th><th>Décimos / fondo</th><th>Ingresos</th><th>IESS 9,45%</th><th>Anticipos / préstamos</th><th>Multas</th><th>Neto</th>' + (conCosto ? '<th>Patronal</th><th>Costo empresa</th>' : "") + '<th>Rol</th><th></th></tr></thead>'
      + "<tbody>" + filas + '</tbody><tfoot><tr><td><b>Total</b></td><td></td><td></td><td></td><td class="num">$' + m2(t.comisiones) + '</td><td></td><td></td><td class="num">$' + m2(t.totalIngresos) + '</td><td class="num">$' + m2(t.iess) + '</td><td></td><td></td><td class="num"><b>$' + m2(t.neto) + "</b></td>" + (conCosto ? '<td class="num">$' + m2(t.patronal) + '</td><td class="num"><b>$' + m2(t.costoEmpresa) + "</b></td>" : "") + "<td></td><td></td></tr></tfoot></table></div>"
      + '<div id="desc-panel"></div><div id="prerol-detalle"></div>'
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
      doc.text("Costo empresa = ingresos (con décimos y fondo) + aporte patronal. Descuentos = aporte IESS personal + anticipos + cuotas de préstamos + préstamos IESS + multas. El rol individual de cada empleada (con su firma) se descarga desde su rol.", x0, y);
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
    return '<h1>Configuración de rol</h1><p class="note">Datos base de cada empleada para el rol de pagos. Solo administración. Cada cambio queda en el historial (quién, antes y después). Emi y EFCH son administradoras: no aparecen aquí.</p>'
      + (activas || '<p class="note">Todavía no hay empleadas configuradas.</p>') + nuevas
      + (inact ? '<details class="card"><summary>Inactivas</summary>' + inact + "</details>" : "")
      + '<details class="card"><summary>Historial de cambios</summary>' + log + "</details>";
  }
  function wireConfig(main) {
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
        body = { persona: persona, sueldoBase: prev.sueldoBase, bono: prev.bono, afiliada: prev.afiliada !== false ? "si" : "no", fechaIngreso: prev.fechaIngreso, cargo: prev.cargo, notas: prev.notas, activa: activa, motivo: activa ? "Reactivada" : "Marcada inactiva" };
      } else {
        body = { persona: persona, sueldoBase: Number(String(val("sueldoBase")).replace(",", ".")), bono: Number(String(val("bono")).replace(",", ".")), afiliada: val("afiliada"), fechaIngreso: val("fechaIngreso"), cargo: val("cargo"), notas: val("notas"), motivo: val("motivo"), activa: true };
      }
      var err = card.querySelector("[data-cfgrol-err]");
      if (err) err.textContent = "";
      var r = await api("rolcfg_guardar", body);
      if (!r || r.error) { if (err) err.textContent = (r && r.error) || "No se pudo guardar"; else toast((r && r.error) || "No se pudo guardar"); return; }
      toast(r.sinCambios ? "Sin cambios" : "Configuración guardada");
      if (typeof draw === "function") await draw();
    });
  }

  window.SunsuRol = { htmlConfigRol: htmlConfigRol, wireConfig: wireConfig, htmlPreRolResumen: htmlPreRolResumen, abrirDesc: abrirDesc, wireDesc: wireDesc, resumenPdf: resumenPdf, htmlFirma: htmlFirma, wireFirma: wireFirma };
})();
