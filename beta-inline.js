// Edición en línea compartida. El admin toca el campo, la barra aparece solo si hay cambios.
// Quien no es admin pide el cambio o la eliminación. Ver como no escribe.
(function () {
  var dirty = {};
  var CAMPOS = {
    tickets: [
      ["nombre", "Nombre"], ["apellido", "Apellido"], ["cedula", "Cédula"],
      ["facial", "Facial"], ["extras", "Extras"], ["pack3", "Pack x3"], ["pack6", "Pack x6"],
      ["recomendaciones", "Recomendaciones"], ["notas", "Notas"], ["estimado", "Total"],
    ],
    clientes: [
      ["nombre", "Nombre"], ["apellido", "Apellido"], ["cedula", "Cédula"],
      ["telefono", "Teléfono"], ["sector", "Sector"], ["tipoPiel", "Tipo de piel"],
      ["estado", "Estado"], ["alergias", "Alergias"], ["medicacion", "Medicación"],
      ["condiciones", "Condiciones"], ["nacimiento", "Nacimiento"], ["autorizaFotos", "Autoriza fotos"],
    ],
    catalogo: [
      ["sku", "SKU"], ["nombre", "Nombre"], ["tipo", "Tipo"], ["subtotal", "Venta s/IVA"], ["compra", "Compra"],
    ],
    inventario: [
      ["nombre", "Nombre"], ["minimo", "Mínimo"], ["compra", "Compra real"],
    ],
    proveedores: [
      ["nombre", "Nombre"], ["familia", "Familia"], ["ruc", "RUC"], ["telefono", "Teléfono"],
      ["direccion", "Dirección"], ["email", "Email"], ["notas", "Notas"],
    ],
    compras: [
      ["sku", "SKU"], ["nombre", "Nombre"], ["pedida", "Pedido"], ["proveedor", "Proveedor"], ["orden", "Orden"],
    ],
    gift_cards: [
      ["codigo", "Código"], ["nombre", "Nombre"], ["apellido", "Apellido"], ["cedula", "Cédula"],
      ["valor", "Valor"], ["sku", "SKU"], ["notas", "Notas"],
    ],
    paquetes: [
      ["nombre", "Nombre"], ["apellido", "Apellido"], ["cedula", "Cédula"],
      ["sku", "SKU"], ["paquete", "Paquete"], ["vendidoPor", "Vendido por"], ["notas", "Notas"],
    ],
    permisos: [
      ["empleada", "Empleada"], ["tipo", "Tipo"], ["desde", "Desde"], ["hasta", "Hasta"],
      ["horas", "Horas"], ["motivo", "Motivo"], ["estado", "Estado"],
    ],
    multas: [
      ["cosmetologa", "Cosmetóloga"], ["tipo", "Tipo"], ["monto", "Monto"], ["motivo", "Motivo"], ["fecha", "Fecha"],
    ],
    horarios: [
      ["nombre", "Nombre"], ["arreglo", "Arreglo"], ["horasSemana", "Horas de la semana"],
    ],
    asistencia: [
      ["nombre", "Empleada"], ["tipo", "Tipo"], ["fecha", "Fecha"], ["hora", "Hora"], ["motivo", "Motivo"],
    ],
    feriados: [
      ["fecha", "Fecha"], ["nombre", "Nombre"],
    ],
    pago_config: [
      ["nombre", "Persona"], ["vigente", "Vigente desde"], ["sueldo", "Sueldo"], ["bono", "Bono"], ["iess", "IESS %"], ["fondo", "Fondo"],
    ],
  };
  function camposDe(tabla) { return CAMPOS[tabla] || CAMPOS.tickets; }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function edita() { return !!(window.state && state.admin && !state.vista); }
  function pide() { return !!(window.state && state.user && !state.admin && !state.vista); }
  function clave(tabla, fila, campo) { return tabla + "\u0000" + fila + "\u0000" + campo; }
  function sucio() { return Object.keys(dirty).length > 0; }

  function barra() {
    var bar = document.getElementById("ix-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "ix-bar";
      bar.innerHTML = "Hiciste cambios — <button type=\"button\" id=\"ix-guardar\">Guardar</button> <button type=\"button\" id=\"ix-descartar\">Descartar</button>";
      document.body.appendChild(bar);
      bar.querySelector("#ix-guardar").onclick = guardar;
      bar.querySelector("#ix-descartar").onclick = function () { descartar(); };
    }
    bar.hidden = !sucio();
  }

  function campo(tabla, fila, key, valor) {
    var v = valor == null ? "" : String(valor);
    if (!edita()) return esc(v);
    return '<span class="ix-cell" tabindex="0" data-ix-tabla="' + esc(tabla) + '" data-ix-fila="' + esc(fila) + '" data-ix-campo="' + esc(key) + '" data-ix-orig="' + esc(v) + '">' + esc(v) + "</span>";
  }
  function lineas(tabla, fila, pares) {
    return '<div class="ix-lines">' + pares.map(function (p) {
      return '<div class="ix-line"><span>' + esc(p[1]) + "</span>" + campo(tabla, fila, p[0], p[2]) + "</div>";
    }).join("") + "</div>";
  }
  function borrar(tabla, fila) {
    return '<button type="button" class="ix-trash" data-ix-borrar="' + esc(tabla) + ":" + esc(fila) + '" title="Eliminar">🗑</button>';
  }
  function pedir(tabla, fila, valores) {
    window._ixVals = window._ixVals || {};
    window._ixVals[tabla + ":" + fila] = valores || {};
    return '<button type="button" class="ix-pedir" data-ix-pedir="' + esc(tabla) + ":" + esc(fila) + '">Solicitar cambio / eliminación</button>';
  }
  function mas(tabla) {
    return '<button type="button" class="ix-mas" data-ix-mas="' + esc(tabla) + '">+ Agregar</button>';
  }

  function abrir(celda) {
    if (celda.querySelector("input")) return;
    var orig = celda.getAttribute("data-ix-orig") || "";
    var actual = dirty[clave(celda.getAttribute("data-ix-tabla"), celda.getAttribute("data-ix-fila"), celda.getAttribute("data-ix-campo"))];
    var input = document.createElement("input");
    input.value = actual ? actual.ahora : celda.textContent;
    input.setAttribute("aria-label", celda.getAttribute("data-ix-campo") || "Campo");
    celda.textContent = "";
    celda.appendChild(input);
    input.focus();
    var cerrar = function (guardarValor) {
      var val = guardarValor ? input.value : orig;
      var k = clave(celda.getAttribute("data-ix-tabla"), celda.getAttribute("data-ix-fila"), celda.getAttribute("data-ix-campo"));
      if (val === orig) delete dirty[k];
      else dirty[k] = { tabla: celda.getAttribute("data-ix-tabla"), fila: celda.getAttribute("data-ix-fila"), campo: celda.getAttribute("data-ix-campo"), antes: orig, ahora: val };
      celda.textContent = val;
      celda.classList.toggle("ix-dirty", val !== orig);
      barra();
    };
    input.addEventListener("blur", function () { cerrar(true); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") input.blur();
      if (ev.key === "Escape") { ev.preventDefault(); cerrar(false); }
    });
  }

  function grupos() {
    var out = {};
    Object.keys(dirty).forEach(function (k) {
      var d = dirty[k];
      var id = d.tabla + "\u0000" + d.fila;
      out[id] = out[id] || { tabla: d.tabla, fila: d.fila, campos: {} };
      out[id].campos[d.campo] = d.ahora;
    });
    return Object.keys(out).map(function (k) { return out[k]; });
  }

  async function guardar() {
    var lista = grupos();
    if (!lista.length) { barra(); return; }
    if (lista.some(function (g) { return g.tabla === "asistencia" && !String(g.campos.motivo || "").trim(); })) {
      var mot = window.prompt("Motivo de la corrección");
      if (!mot || !mot.trim()) { if (window.toast) toast("La corrección necesita un motivo"); return; }
      lista.forEach(function (g) { if (g.tabla === "asistencia") g.campos.motivo = mot.trim(); });
    }
    for (var i = 0; i < lista.length; i++) {
      var data = await api("inline_guardar", lista[i]);
      if (data.error) { if (window.toast) toast(data.error); return; }
    }
    dirty = {};
    barra();
    if (window.toast) toast("Cambios guardados");
    refrescar(tablaDe(lista));
  }

  function tablaDe(lista) {
    var tablas = {};
    (lista || []).forEach(function (g) { tablas[g.tabla] = 1; });
    if (tablas.clientes) return "clientes";
    if (tablas.catalogo) return "catalogo";
    if (tablas.inventario) return "inventario";
    if (tablas.proveedores) return "proveedores";
    if (tablas.compras) return "compras";
    if (tablas.gift_cards) return "gift_cards";
    if (tablas.paquetes) return "paquetes";
    if (tablas.permisos) return "permisos";
    if (tablas.multas) return "multas";
    if (tablas.horarios) return "horarios";
    if (tablas.asistencia) return "asistencia";
    if (tablas.feriados) return "feriados";
    if (tablas.pago_config) return "pago_config";
    if (document.getElementById("cat-res")) return "catalogo";
    if (document.querySelector("[id^=inv-grp-]")) return "inventario";
    if (document.getElementById("prov-form")) return "proveedores";
    if (document.getElementById("oc-nuevo")) return "compras";
    if (document.getElementById("cli-q")) return "clientes";
    return "tickets";
  }

  function refrescar(tabla) {
    var c = document.getElementById("content");
    if (tabla === "clientes" && typeof draw === "function") { draw(); return; }
    if (tabla === "catalogo" && c && typeof renderCatalogoAdmin === "function") { renderCatalogoAdmin(c); return; }
    if (tabla === "inventario" && c && typeof renderInventario === "function") { renderInventario(c); return; }
    if (tabla === "proveedores" && c && typeof renderProveedores === "function") { renderProveedores(c); return; }
    if (tabla === "compras" && c && typeof renderEntradas === "function") { renderEntradas(c); return; }
    if (tabla === "gift_cards" && document.getElementById("bgc-results")) {
      var qGc = (document.getElementById("bgc-inp") || {}).value || "";
      if (qGc.trim() && typeof ejecutarBuscarGC === "function") ejecutarBuscarGC();
      else if (typeof verTodasGC === "function") verTodasGC();
      return;
    }
    if (tabla === "paquetes" && document.getElementById("bpq-todos") && typeof _cargarTodosPaquetes === "function") { _cargarTodosPaquetes(); return; }
    if ((tabla === "permisos" || tabla === "multas" || tabla === "horarios" || tabla === "asistencia" || tabla === "feriados" || tabla === "pago_config") && typeof draw === "function") { draw(); return; }
    if (typeof renderHistorial === "function" && document.getElementById("hist-res")) renderHistorial(document.getElementById("content"));
  }

  function aplicar() {
    document.querySelectorAll(".ix-cell").forEach(function (celda) {
      var k = clave(celda.getAttribute("data-ix-tabla"), celda.getAttribute("data-ix-fila"), celda.getAttribute("data-ix-campo"));
      if (!dirty[k]) return;
      celda.textContent = dirty[k].ahora;
      celda.classList.add("ix-dirty");
    });
  }

  function descartar() {
    document.querySelectorAll(".ix-cell").forEach(function (celda) {
      celda.textContent = celda.getAttribute("data-ix-orig") || "";
      celda.classList.remove("ix-dirty");
    });
    var nuevo = document.getElementById("ix-nuevo");
    if (nuevo) nuevo.remove();
    dirty = {};
    barra();
  }

  async function eliminar(tabla, fila) {
    var body = { tabla: tabla, fila: fila };
    if (tabla === "asistencia") {
      var motivo = window.prompt("Motivo para anular la marca");
      if (!motivo || !String(motivo).trim()) return;
      body.motivo = String(motivo).trim();
    } else if (!confirm("¿Eliminar esta fila? Queda en el historial.")) return;
    var data = await api("inline_borrar", body);
    if (data.error) { if (window.toast) toast(data.error); return; }
    if (window.toast) toast("Eliminado");
    refrescar(tabla);
  }

  function agregar(tabla) {
    if (document.getElementById("ix-nuevo")) return;
    tabla = tabla || "tickets";
    var host = (tabla === "clientes" && document.getElementById("cli-list-host"))
      || (tabla === "catalogo" && document.getElementById("cat-form"))
      || (tabla === "proveedores" && document.getElementById("prov-form"))
      || (tabla === "compras" && document.getElementById("oc-nuevo"))
      || (tabla === "gift_cards" && document.getElementById("gc-nuevo"))
      || (tabla === "paquetes" && document.getElementById("paq-nuevo"))
      || (tabla === "permisos" && document.getElementById("perm-nuevo"))
      || (tabla === "multas" && document.getElementById("multa-nuevo"))
      || (tabla === "horarios" && document.getElementById("hor-lista"))
      || (tabla === "asistencia" && document.getElementById("asis-nuevo"))
      || (tabla === "feriados" && document.getElementById("fer-nuevo"))
      || (tabla === "pago_config" && document.getElementById("pago-nuevo"))
      || document.getElementById("hist-res") || document.getElementById("content");
    if (!host) return;
    var box = document.createElement("div");
    box.id = "ix-nuevo";
    box.className = "ix-nuevo";
    var titulo = tabla === "clientes" ? "Nueva clienta" : tabla === "catalogo" ? "Nuevo producto" : tabla === "proveedores" ? "Nuevo proveedor" : tabla === "compras" ? "Nueva línea" : tabla === "gift_cards" ? "Nueva gift card" : tabla === "paquetes" ? "Nuevo paquete" : tabla === "permisos" ? "Nuevo permiso" : tabla === "multas" ? "Nueva multa" : tabla === "horarios" ? "Nuevo horario" : tabla === "asistencia" ? "Marca olvidada" : tabla === "feriados" ? "Nuevo feriado" : tabla === "pago_config" ? "Nueva configuración" : "Nuevo ticket";
    box.innerHTML = '<div class="ix-line"><b>' + titulo + "</b></div>" + lineas(tabla, "nuevo", camposDe(tabla)).replace('class="ix-lines"', 'class="ix-lines" id="ix-nuevo-lines"');
    host.appendChild(box);
  }

  function abrirPedido(tabla, fila) {
    var vals = (window._ixVals && window._ixVals[tabla + ":" + fila]) || {};
    var overlay = document.createElement("div");
    overlay.className = "ix-overlay";
    var campos = camposDe(tabla).filter(function (p) {
      return tabla === "tickets" || Object.prototype.hasOwnProperty.call(vals, p[0]);
    }).map(function (p) {
      return '<label>' + esc(p[1]) + '<input data-k="' + esc(p[0]) + '" value="' + esc(vals[p[0]] || "") + '"></label>';
    }).join("");
    overlay.innerHTML = '<div class="ix-sheet"><div class="ix-line"><b>Solicitar cambio / eliminación</b><button type="button" id="ix-x">×</button></div>'
      + '<label>Tipo<select id="ix-tipo"><option value="cambio">Cambio</option><option value="eliminacion">Eliminación</option></select></label>'
      + '<div id="ix-props">' + campos + "</div>"
      + '<label>Motivo<textarea id="ix-motivo" required placeholder="Por qué"></textarea></label>'
      + '<p class="ix-err" id="ix-err"></p><button type="button" class="ix-send" id="ix-send">Enviar solicitud</button></div>';
    document.body.appendChild(overlay);
    overlay.querySelector("#ix-x").onclick = function () { overlay.remove(); };
    overlay.querySelector("#ix-tipo").onchange = function (ev) {
      overlay.querySelector("#ix-props").hidden = ev.target.value === "eliminacion";
    };
    overlay.querySelector("#ix-send").onclick = async function () {
      var motivo = overlay.querySelector("#ix-motivo").value.trim();
      var tipo = overlay.querySelector("#ix-tipo").value;
      if (!motivo) { overlay.querySelector("#ix-err").textContent = "El motivo es obligatorio"; return; }
      var propuestos = {};
      overlay.querySelectorAll("[data-k]").forEach(function (el) { propuestos[el.getAttribute("data-k")] = el.value; });
      var data = await api("solicitud_crear", { tabla: tabla, fila: fila, tipo: tipo, motivo: motivo, propuestos: propuestos });
      if (data.error) { overlay.querySelector("#ix-err").textContent = data.error; return; }
      overlay.remove();
      if (window.toast) toast("Solicitud enviada");
      contar();
    };
  }

  function diff(antes, propuestos) {
    antes = antes || {};
    propuestos = propuestos || {};
    var keys = {};
    Object.keys(antes).forEach(function (k) { keys[k] = 1; });
    Object.keys(propuestos).forEach(function (k) { keys[k] = 1; });
    return Object.keys(keys).filter(function (k) { return String(antes[k] == null ? "" : antes[k]) !== String(propuestos[k] == null ? "" : propuestos[k]); }).map(function (k) {
      return '<div class="ix-diff"><b>' + esc(k) + '</b> ' + esc(antes[k] || "—") + " → " + esc(propuestos[k] || "—") + "</div>";
    }).join("") || '<div class="ix-diff">Sin diferencia de campos</div>';
  }

  async function panel() {
    var data = await api("getSolicitudes", {});
    if (data.error) { if (window.toast) toast(data.error); return; }
    var overlay = document.createElement("div");
    overlay.className = "ix-overlay";
    var admin = edita();
    var items = (data.items || []).map(function (s) {
      var cuerpo = s.tipo === "eliminacion" ? "<div>Eliminar la fila " + esc(s.fila) + "</div>" : diff(s.antes, s.propuestos);
      var acciones = admin && s.estado === "pendiente"
        ? '<div class="ix-acc"><button type="button" data-ok="' + esc(s.id) + '">Aprobar</button><button type="button" data-no="' + esc(s.id) + '">Rechazar</button></div>'
        : '<div class="ix-estado">' + esc(s.estado) + (s.comentario ? " · " + esc(s.comentario) : "") + "</div>";
      return '<article class="ix-sol"><div><b>' + esc(s.solicitante) + "</b> · " + esc(s.tipo) + " · " + esc(s.tabla) + " " + esc(s.fila) + "</div><div>" + esc(s.motivo) + "</div>" + cuerpo + acciones + "</article>";
    }).join("") || '<p>No hay solicitudes.</p>';
    overlay.innerHTML = '<div class="ix-sheet"><div class="ix-line"><b>Solicitudes</b><button type="button" id="ix-x">×</button></div>' + items + "</div>";
    document.body.appendChild(overlay);
    overlay.querySelector("#ix-x").onclick = function () { overlay.remove(); };
    overlay.querySelectorAll("[data-ok],[data-no]").forEach(function (btn) {
      btn.onclick = async function () {
        var aprobar = btn.hasAttribute("data-ok");
        var comentario = aprobar ? "" : (prompt("Comentario (opcional)") || "");
        var res = await api("solicitud_resolver", { id: btn.getAttribute(aprobar ? "data-ok" : "data-no"), aprobar: aprobar, comentario: comentario });
        if (res.error) { if (window.toast) toast(res.error); return; }
        overlay.remove();
        contar();
        refrescar(tablaDe([]));
      };
    });
  }

  async function contar() {
    var btn = document.getElementById("btn-solicitudes");
    if (!btn || !window.state || state.vista) return;
    var data = await api("getSolicitudes", {});
    var n = data && data.pendientes || 0;
    btn.textContent = n ? "Solicitudes (" + n + ")" : "Solicitudes";
  }

  document.addEventListener("click", function (ev) {
    var celda = ev.target.closest && ev.target.closest(".ix-cell");
    if (celda && edita()) { ev.preventDefault(); abrir(celda); return; }
    var del = ev.target.closest && ev.target.closest("[data-ix-borrar]");
    if (del) {
      var partes = del.getAttribute("data-ix-borrar").split(":");
      eliminar(partes[0], partes.slice(1).join(":"));
      return;
    }
    var ask = ev.target.closest && ev.target.closest("[data-ix-pedir]");
    if (ask) {
      var p = ask.getAttribute("data-ix-pedir").split(":");
      abrirPedido(p[0], p.slice(1).join(":"));
      return;
    }
    var add = ev.target.closest && ev.target.closest("[data-ix-mas]");
    if (add && edita()) agregar(add.getAttribute("data-ix-mas"));
  });

  window.addEventListener("beforeunload", function (ev) {
    if (!sucio()) return;
    ev.preventDefault();
    ev.returnValue = "";
  });
  if (typeof go === "function") {
    var _go = go;
    window.go = function (hash) {
      if (sucio() && !confirm("Hiciste cambios. ¿Salir sin guardar?")) return;
      if (sucio()) descartar();
      _go(hash);
    };
  }

  window.SunsuInline = { edita: edita, pide: pide, campo: campo, lineas: lineas, borrar: borrar, pedir: pedir, mas: mas, contar: contar, panel: panel, aplicar: aplicar };
  document.addEventListener("click", function (ev) {
    if (ev.target && ev.target.id === "btn-solicitudes") panel();
  });
})();
