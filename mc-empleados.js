/* Personal › Empleados: lista + ficha (mc-maestro), horario compacto, usuario, IESS y documentos. */
(function () {
  var K = { items: [], usuarios: [], horarios: [], asignaciones: [], detalle: null, personas: [] };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function money(n) {
    var x = parseFloat(n);
    if (isNaN(x)) return "—";
    return "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function toast2(m, err) {
    if (typeof toast === "function") toast(m, err);
  }
  function A(accion, body) {
    return api(accion, body || {});
  }
  var DIAS = [["Monday", "Lun"], ["Tuesday", "Mar"], ["Wednesday", "Mié"], ["Thursday", "Jue"], ["Friday", "Vie"], ["Saturday", "Sáb"], ["Sunday", "Dom"]];

  // TK170 (Emilia t768u): desplegables en lugar de botones sí/no.
  function siNo(field, on, si, no) {
    return '<select class="emp-in emp-sel" data-emp-sel="' + esc(field) + '">'
      + '<option value="1"' + (on ? " selected" : "") + ">" + esc(si) + "</option>"
      + '<option value="0"' + (!on ? " selected" : "") + ">" + esc(no) + "</option></select>";
  }
  function selHora(attrs, val, vacio) {
    if (typeof window.htmlSelHora === "function") return window.htmlSelHora(attrs, val, vacio);
    return '<input ' + attrs + ' type="time" value="' + esc(val || "") + '">';
  }
  var CARGOS = ["COSMETOLOGA", "RECEPCION", "ASISTENTE DE COSMETOLOGIA", "ADMINISTRACION"];

  async function ensureItems() {
    var data = await A("emp_list");
    if (data && data.error) throw new Error(data.error);
    K.items = (data && data.items) || [];
    K.usuarios = (data && data.usuarios) || [];
    return true;
  }

  async function cargarHorarios() {
    var data = await A("horarios_list");
    if (data && !data.error) {
      K.horarios = data.horarios || [];
      K.asignaciones = data.asignaciones || [];
      K.personas = data.personas || [];
      if (typeof state !== "undefined") state.horariosCache = K.horarios;
    }
    return data;
  }

  function htmlHorarioFicha(it) {
    var hid = it.horarioId || "";
    var opts = '<option value="">Por defecto</option>' + (K.horarios || []).map(function (h) {
      return '<option value="' + esc(h.id) + '"' + (hid && hid === h.id ? " selected" : "") + ">" + esc(h.nombre) + (h.esDefault ? " · base" : "") + "</option>";
    }).join("");
    var h = (K.horarios || []).find(function (x) { return x.id === hid; }) || (K.horarios || []).find(function (x) { return x.esDefault; }) || null;
    var filas = "";
    if (h && (h.dias || []).length) {
      filas = (h.dias || []).map(function (d) {
        var lab = (DIAS.find(function (x) { return x[0] === d.dia; }) || ["", d.dia === String(d.dia) && +d.dia ? "Día " + d.dia : d.dia])[1] || d.dia;
        return '<div class="hor-dia emp-hor-row" data-dia="' + esc(d.dia) + '"><span>' + esc(lab) + '</span>'
          + '<input type="checkbox" data-trabaja' + (d.trabaja ? " checked" : "") + ">"
          + selHora("data-desde", d.desde, true)
          + selHora("data-hasta", d.hasta, true) + "</div>";
      }).join("");
    }
    var desc = (h && h.descansos && h.descansos[0]) || {};
    return '<section class="emp-sec" id="emp-horario">'
      + "<h2>Horario</h2>"
      + '<div class="emp-hor-asig"><label>Plantilla</label><select class="emp-in" id="emp-hor-sel">' + opts + "</select></div>"
      + (filas ? '<div class="emp-week" id="emp-hor-dias">' + filas
        + '<div class="hor-dia emp-hor-row"><span>Almuerzo</span><span></span>'
        + selHora('name="desc_desde" id="emp-desc-desde"', desc.desde || "13:00")
        + selHora('name="desc_hasta" id="emp-desc-hasta"', desc.hasta || "14:00") + "</div></div>"
        + '<p class="note emp-save-hint">Los horarios se guardan al cambiar el dato, sin lápiz.</p>'
        : '<p class="note">Elige una plantilla. Las plantillas se crean y editan en <button class="btn ghost small" type="button" data-go="#/m/personal/horarios">Horarios</button>.</p>')
      + "</section>";
  }

  function htmlDatos(it, usuarios) {
    var uopts = '<option value="">Sin usuario</option>' + (usuarios || []).map(function (u) {
      return '<option value="' + esc(u.id) + '"' + (it.usuarioId === u.id ? " selected" : "") + ">" + esc(u.nombre) + (u.rol ? " · " + u.rol : "") + "</option>";
    }).join("");
    return '<section class="emp-sec">'
      + "<h2>Datos</h2>"
      + '<div class="emp-grid">'
      + '<div class="emp-field"><span class="emp-k">Nombre</span><b>' + esc(it.nombre) + "</b></div>"
      + '<div class="emp-field"><span class="emp-k">Cargo</span><select class="emp-in" data-emp-dato="cargo">'
      + (CARGOS.indexOf(String(it.cargo || "").toUpperCase()) < 0 ? '<option value="' + esc(it.cargo || "") + '" selected>' + esc(it.cargo || "—") + "</option>" : "")
      + CARGOS.map(function (c) { return '<option value="' + c + '"' + (String(it.cargo || "").toUpperCase() === c ? " selected" : "") + ">" + c.charAt(0) + c.slice(1).toLowerCase() + "</option>"; }).join("") + "</select></div>"
      + '<div class="emp-field"><span class="emp-k">Ingreso</span><input class="emp-in" type="date" data-emp-dato="fecha_ingreso" value="' + esc(it.fechaIngreso || "") + '"></div>'
      + '<div class="emp-field"><span class="emp-k">Sueldo base</span><input class="emp-in" inputmode="decimal" data-emp-dato="sueldo" value="' + esc(it.sueldo || "") + '" placeholder="482.00"></div>'
      + '<div class="emp-field"><span class="emp-k">Bono fijo</span><input class="emp-in" inputmode="decimal" data-emp-dato="bono" value="' + esc(it.bono || "") + '" placeholder="0.00"></div>'
      + "</div>"
      + '<div class="emp-field"><span class="emp-k">¿Tiene usuario?</span>' + siNo("tiene_usuario", !!it.tieneUsuario, "Sí", "No") + "</div>"
      + '<div class="emp-field" id="emp-user-wrap"' + (it.tieneUsuario ? "" : " hidden") + '><span class="emp-k">Usuario vinculado</span>'
      + '<select class="emp-in" id="emp-usuario">' + uopts + "</select></div>"
      + '<div class="emp-field"><span class="emp-k">¿Afiliada al IESS?</span>' + siNo("afiliada_iess", it.afiliadaIess !== false, "Sí", "No") + "</div>"
      + (it.afiliadaIess !== false
        ? '<div class="emp-field"><span class="emp-k">Décimo tercero</span>' + siNo("dec13_mensual", it.dec13Mensual !== false, "Mensual", "Acumulado") + "</div>"
          + '<div class="emp-field"><span class="emp-k">Décimo cuarto</span>' + siNo("dec14_mensual", it.dec14Mensual !== false, "Mensual", "Acumulado") + "</div>"
          + '<div class="emp-field"><span class="emp-k">Fondo de reserva</span>' + siNo("fondo_mensual", it.fondoMensual !== false, "En el rol", "Al IESS") + "</div>"
        : "")
      + "</section>";
  }

  function htmlDescuentos(d) {
    var it = d.item || {};
    if (it.afiliadaIess === false) {
      var ocs = (d.ordenes || []).map(function (o) {
        return '<div class="emp-doc"><span>' + esc(o.numero) + " · " + esc(o.periodo || "") + '</span><span>' + money(o.total) + "</span>"
          + (o.id ? '<button class="btn ghost small" type="button" data-go="#/m/compras/oc/' + esc(o.id) + '">Ver OC</button>' : "") + "</div>";
      }).join("") || '<p class="note">Todavía no hay una orden de este mes.</p>';
      return '<section class="emp-sec" id="emp-oc">'
        + "<h2>Orden de compra de servicios</h2>"
        + '<p class="note">Sin afiliación al IESS: su rol muestra sueldo, bonos y comisiones, sin aporte IESS ni décimos/fondo, y el total que debe facturar a Sunsu. La OC del mes sirve para recibir esa factura.</p>'
        + '<div class="emp-oc-bar"><label>Periodo</label><input class="emp-in" id="emp-oc-periodo" type="month">'
        + '<button class="btn small" type="button" id="emp-oc-gen">Generar OC del mes</button></div>'
        + '<p class="err" id="emp-oc-err"></p>'
        + '<div id="emp-oc-lista">' + ocs + "</div></section>";
    }
    // TK170: el aporte personal 9,45 % lo calcula el rol solo (no se ingresa a mano). Aquí solo los préstamos IESS
    // (quirografario / hipotecario), que se ven cuando hay alguno. No hay conexión con el portal del IESS.
    var filas = (d.descuentos || []).filter(function (x) { return Number(x.monto) > 0; }).map(function (x) {
      var tipo = x.tipo === "quirografario" ? "Préstamo quirografario" : x.tipo === "hipotecario" ? "Préstamo hipotecario" : (x.descripcion || "Otro descuento IESS");
      var vig = [x.vigente_desde, x.vigente_hasta].filter(Boolean).join(" → ") || "Vigente";
      return '<div class="emp-desc-row" data-desc="' + esc(x.id) + '"><div><b>' + esc(tipo) + "</b> · " + money(x.monto) + '<div class="note">' + esc(vig) + "</div></div>"
        + '<button class="btn ghost small" type="button" data-emp-desc-del="' + esc(x.id) + '">Quitar</button></div>';
    }).join("");
    return '<section class="emp-sec" id="emp-iess">'
      + "<h2>IESS</h2>"
      + '<p class="note">Aporte personal 9,45 %: automático en el rol. Los préstamos del IESS se ingresan a mano (no hay conexión con el portal del IESS).</p>'
      + (filas ? '<div id="emp-iess-lista">' + filas + "</div>" : "")
      + '<details class="emp-iess-mas"' + (filas ? "" : "") + '><summary class="btn ghost small">+ Préstamo IESS</summary>'
      + '<form class="emp-iess-form" id="f-emp-iess">'
      + '<select name="tipo" class="emp-in" aria-label="Tipo"><option value="quirografario">Quirografario</option><option value="hipotecario">Hipotecario</option></select>'
      + '<input class="emp-in" name="monto" inputmode="decimal" placeholder="Cuota mensual" required>'
      + '<input class="emp-in" name="vigente_desde" type="date" title="Desde">'
      + '<input class="emp-in" name="vigente_hasta" type="date" title="Hasta">'
      + '<button class="btn small" type="submit">Añadir</button>'
      + "</form></details>"
      + '<p class="err" id="emp-iess-err"></p>'
      + "</section>";
  }

  function htmlDocs(d) {
    var filas = (d.documentos || []).map(function (x) {
      return '<div class="emp-doc"><span>' + esc(x.nombre) + '</span>'
        + '<button class="btn ghost small" type="button" data-emp-doc="' + esc(x.id) + '">Descargar</button></div>';
    }).join("") || '<p class="note">Sin documentos todavía.</p>';
    return '<section class="emp-sec" id="emp-docs">'
      + "<h2>Documentos</h2>"
      + '<p class="note">Solo administración sube y descarga (contratos y respaldos).</p>'
      + '<div id="emp-docs-lista">' + filas + "</div>"
      + '<label class="emp-file">Añadir archivo<input type="file" id="emp-doc-file"></label>'
      + '<p class="err" id="emp-doc-err"></p>'
      + "</section>";
  }

  function htmlDetalle(d) {
    var it = d.item || {};
    return '<div class="emp-ficha" data-emp-id="' + esc(it.id) + '" data-emp-nombre="' + esc(it.nombre) + '">'
      + '<h1 class="emp-nombre">' + esc(it.nombre) + "</h1>"
      + htmlDatos(it, d.usuarios || K.usuarios)
      + htmlHorarioFicha(it)
      + htmlDescuentos(d)
      + htmlDocs(d)
      + "</div>";
  }

  async function renderDetail(route) {
    var id = route && route.id ? String(route.id) : "";
    await cargarHorarios();
    if (!id) {
      return '<div class="emp-vacio"><p class="note">Elige una empleada para ver su ficha, el horario, la afiliación al IESS y los documentos. Las plantillas de horas están en <button class="btn ghost small" type="button" data-go="#/m/personal/horarios">Horarios</button>.</p></div>';
    }
    var found = (K.items || []).find(function (x) { return String(x.id) === id; });
    var data = await A("emp_get", found && found.nombre ? { id: id, nombre: found.nombre } : { id: id });
    if (data && data.error) return '<p class="err">' + esc(data.error) + "</p>";
    K.detalle = data;
    return htmlDetalle(data);
  }

  async function renderMobile(route) {
    if (!(K.items || []).length) {
      try { await ensureItems(); } catch (e) { return '<p class="err">' + esc((e && e.message) || e) + "</p>"; }
    }
    var id = route && route.id ? String(route.id) : "";
    if (!id) {
      await cargarHorarios();
      var filas = (K.items || []).map(function (it) {
        var sub = (it.cargo || "") + (it.afiliadaIess === false ? " · sin IESS" : "") + (it.tieneUsuario ? "" : " · sin usuario");
        return '<button type="button" class="emp-li" data-go="#/m/personal/empleados/' + encodeURIComponent(it.id) + '"><b>' + esc(it.nombre) + '</b><span class="note">' + esc(sub) + "</span></button>";
      }).join("") || '<p class="note">No hay empleadas en la lista.</p>';
      return '<div id="emp-lista" class="emp-lista-movil"><h1>Empleados</h1>' + filas + '<p class="note">Plantillas de horas: <button class="btn ghost small" type="button" data-go="#/m/personal/horarios">Horarios</button>.</p></div>';
    }
    var det = await renderDetail(route);
    return '<p><button class="btn ghost small" type="button" data-go="#/m/personal/empleados">← Empleados</button></p>' + det;
  }

  async function render(route) {
    if (typeof state !== "undefined" && !state.admin) return '<p class="err">Solo administración ve el módulo de empleados.</p>';
    if (window.MCMaestro && window.MCMaestro.wide()) return window.MCMaestro.render("empleados", route);
    return renderMobile(route);
  }

  function leerDias(root) {
    var fn = typeof leerDiasHorario === "function" ? leerDiasHorario : null;
    if (fn && root.querySelector) {
      try { return fn(root); } catch (e) { /* fallback */ }
    }
    return [].slice.call(root.querySelectorAll(".hor-dia[data-dia]")).map(function (row, i) {
      var desde = row.querySelector("[data-desde]") && row.querySelector("[data-desde]").value || null;
      var hasta = row.querySelector("[data-hasta]") && row.querySelector("[data-hasta]").value || null;
      return { orden: i + 1, dia: row.getAttribute("data-dia"), trabaja: !!(row.querySelector("[data-trabaja]") && row.querySelector("[data-trabaja]").checked), desde: desde, hasta: hasta };
    });
  }

  async function guardarFicha(nombre, patch) {
    var data = await A("emp_guardar", Object.assign({ nombre: nombre }, patch));
    if (data && data.error) { toast2(data.error, true); return false; }
    return true;
  }

  function recargar() {
    if (typeof go === "function") go(location.hash || "#/m/personal/empleados");
    else if (typeof draw === "function") draw();
  }

  function wire(main, route) {
    if (!main) return;
    if (typeof wireHorarios === "function") wireHorarios(main);
    var ficha = main.querySelector(".emp-ficha");
    var nombre = ficha ? ficha.getAttribute("data-emp-nombre") : "";

    main.querySelectorAll("[data-emp-sel]").forEach(function (sel) {
      sel.onchange = async function () {
        if (!nombre) return;
        var field = sel.getAttribute("data-emp-sel");
        var on = sel.value === "1";
        var patch = {};
        patch[field] = on;
        if (field === "tiene_usuario" && !on) patch.usuario_id = "";
        if (field === "tiene_usuario" && on) {
          var us0 = main.querySelector("#emp-usuario");
          if (us0) patch.usuario_id = us0.value || "";
        }
        if (!(await guardarFicha(nombre, patch))) return;
        recargar();
      };
    });
    main.querySelectorAll("[data-emp-dato]").forEach(function (inp) {
      inp.onchange = async function () {
        if (!nombre) return;
        var k = inp.getAttribute("data-emp-dato");
        var v = String(inp.value || "").trim();
        if ((k === "sueldo" || k === "bono") && v !== "" && !(parseFloat(v.replace(",", ".")) >= 0)) { toast2("Monto no válido", true); return; }
        var patch = {};
        patch[k] = (k === "sueldo" || k === "bono") ? v.replace(",", ".") : v;
        if (await guardarFicha(nombre, patch)) toast2("Guardado");
      };
    });
    main.querySelectorAll(".emp-si-no").forEach(function (box) {
      box.querySelectorAll("button").forEach(function (b) {
        b.onclick = async function () {
          if (!nombre) return;
          var field = box.getAttribute("data-emp-field");
          var on = b.getAttribute("data-v") === "1";
          var patch = {};
          patch[field] = on;
          if (field === "tiene_usuario" && !on) patch.usuario_id = "";
          if (field === "tiene_usuario" && on) {
            var sel = main.querySelector("#emp-usuario");
            if (sel) patch.usuario_id = sel.value || "";
          }
          if (!(await guardarFicha(nombre, patch))) return;
          recargar();
        };
      });
    });
    var us = main.querySelector("#emp-usuario");
    if (us) us.onchange = async function () {
      if (!nombre) return;
      if (!(await guardarFicha(nombre, { tiene_usuario: !!us.value, usuario_id: us.value }))) return;
      recargar();
    };

    var hsel = main.querySelector("#emp-hor-sel");
    if (hsel) hsel.onchange = async function () {
      var data = await A("horarios_asignar", { persona: nombre, horario_id: hsel.value });
      if (data && data.error) toast2(data.error, true);
      else { toast2("Horario asignado"); recargar(); }
    };
    var week = main.querySelector("#emp-hor-dias");
    if (week && hsel && hsel.value) {
      var saveHor = async function () {
        var prev = (K.horarios || []).find(function (h) { return h.id === hsel.value; }) || {};
        var desde = (main.querySelector("#emp-desc-desde") || {}).value;
        var hasta = (main.querySelector("#emp-desc-hasta") || {}).value;
        var data = await A("horarios_guardar", {
          id: prev.id, nombre: prev.nombre, arreglo: prev.arreglo || "fijo",
          es_default: !!prev.esDefault, descansos_tipo: prev.descansosTipo || "impago",
          horas_semana: prev.horasSemana, ciclo_dias: prev.cicloDias, ancla: prev.ancla,
          dias: leerDias(week),
          descansos: [{ nombre: "Almuerzo", desde: desde, hasta: hasta, franja: true }],
          deducciones: prev.deducciones || [],
        });
        if (data && data.error) toast2(data.error, true);
        else toast2("Horario actualizado");
      };
      week.querySelectorAll("input,select").forEach(function (inp) { inp.addEventListener("change", saveHor); });
    }

    var fi = main.querySelector("#f-emp-iess");
    if (fi) fi.onsubmit = async function (ev) {
      ev.preventDefault();
      var fd = Object.fromEntries(new FormData(fi).entries());
      fd.nombre = nombre;
      var data = await A("emp_iess_guardar", fd);
      var err = main.querySelector("#emp-iess-err");
      if (data && data.error) { if (err) err.textContent = data.error; return; }
      recargar();
    };
    main.querySelectorAll("[data-emp-desc-del]").forEach(function (b) {
      b.onclick = async function () {
        var data = await A("emp_iess_borrar", { id: b.getAttribute("data-emp-desc-del") });
        if (data && data.error) toast2(data.error, true);
        else recargar();
      };
    });

    var ocg = main.querySelector("#emp-oc-gen");
    if (ocg) ocg.onclick = async function () {
      var per = (main.querySelector("#emp-oc-periodo") || {}).value;
      var data = await A("emp_oc_servicios", { nombre: nombre, periodo: per });
      var err = main.querySelector("#emp-oc-err");
      if (data && data.error) { if (err) err.textContent = data.error; toast2(data.error, true); return; }
      toast2(data.existente ? ("Ya había " + data.numero) : ("OC " + data.numero + " · " + money(data.total)));
      recargar();
    };

    var file = main.querySelector("#emp-doc-file");
    if (file) file.onchange = async function () {
      var fl = file.files && file.files[0];
      if (!fl) return;
      var err = main.querySelector("#emp-doc-err");
      if (fl.size > 4 * 1024 * 1024) { if (err) err.textContent = "El archivo no puede pesar más de 4 MB."; return; }
      var b64 = await new Promise(function (ok, ko) {
        var r = new FileReader();
        r.onload = function () { ok(String(r.result || "")); };
        r.onerror = function () { ko(new Error("No se pudo leer el archivo")); };
        r.readAsDataURL(fl);
      });
      var data = await A("emp_doc_subir", { nombre: nombre, archivo: b64, filename: fl.name, mime: fl.type });
      if (data && data.error) { if (err) err.textContent = data.error; return; }
      recargar();
    };
    main.querySelectorAll("[data-emp-doc]").forEach(function (b) {
      b.onclick = async function () {
        var data = await A("emp_doc_url", { id: b.getAttribute("data-emp-doc"), descargar: 1 });
        if (data && data.error) { toast2(data.error, true); return; }
        if (!data.data_b64) return;
        var a = document.createElement("a");
        var mime = data.mime || "application/octet-stream";
        a.href = "data:" + mime + ";base64," + data.data_b64;
        a.download = data.nombre || "documento";
        a.click();
      };
    });
  }

  if (window.MCMaestro && window.MCMaestro.register) {
    window.MCMaestro.register("empleados", {
      listHash: "#/m/personal/empleados",
      itemHash: function (id) { return "#/m/personal/empleados/" + encodeURIComponent(id); },
      match: function (route) { return !!(route && route.kind === "mod" && route.mod === "personal" && route.sub === "empleados"); },
      sel: function (route) { return String((route && route.id) || ""); },
      items: function () { return K.items || []; },
      hasItems: function () { return !!(K.items || []).length; },
      itemId: function (it) { return it && it.id; },
      title: function (it) { return (it && it.nombre) || "—"; },
      subtitle: function (it) {
        var bits = [];
        if (it && it.cargo) bits.push(it.cargo);
        if (it && it.afiliadaIess === false) bits.push("sin IESS");
        else bits.push("IESS");
        if (it && !it.tieneUsuario) bits.push("sin usuario");
        return bits.join(" · ");
      },
      blob: function (it) { return [it.nombre, it.cargo, it.usuarioNombre, it.horarioNombre].join(" "); },
      renderDetail: renderDetail,
      wireDetail: function (main, route) { wire(main, route); },
      ensureItems: ensureItems,
    });
  }

  window.MCEmpleados = { render: render, wire: wire, ensureItems: ensureItems };
})();
