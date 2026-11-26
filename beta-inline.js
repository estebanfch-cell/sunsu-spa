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
      ["nombre", "Nombre"], ["familia", "Código"], ["ruc", "RUC"], ["telefono", "Teléfono"],
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
      ["nombre", "Persona"], ["vigente", "Vigente desde"], ["sueldo", "Sueldo fijo"], ["bono", "Bono fijo"],
      ["iess", "IESS %"], ["fondo", "Fondo de reserva"], ["fondoDesde", "Fondo desde"], ["vacaciones", "Vacaciones desde el año"],
    ],
    com_facial: [
      ["sku", "Facial"], ["monto", "Comisión"], ["vigente", "Vigente desde"],
    ],
    com_producto: [
      ["sku", "SKU"], ["pct", "% del margen"], ["fijo", "Fijo por unidad"], ["vigente", "Vigente desde"],
    ],
    com_base: [
      ["pct", "% del margen"], ["vigente", "Vigente desde"],
    ],
    com_extra: [
      ["monto", "Comisión"], ["vigente", "Vigente desde"],
    ],
    com_recep: [
      ["por", "Por facial"], ["min", "Mínimo del día"], ["lunes", "Mínimo del lunes"], ["vigente", "Vigente desde"],
    ],
    com_tramo: [
      ["desde", "Desde"], ["hasta", "Hasta"], ["modo", "Modo"], ["valor", "Valor"], ["vigente", "Vigente desde"],
    ],
    usuarios: [
      ["nombre", "Nombre"], ["short", "Nombre corto"], ["rol", "Rol"], ["bloqueado", "Bloqueado"],
      ["pin", "PIN (4 dígitos, solo al crear)"],
      ["es_cosmetologa", "Cuenta para paquetes (es cosmetóloga)"],
      ["comision_faciales", "💆 Gana comisión de faciales"],
      ["comision_faciales_desde", "Faciales desde"],
    ],
    acceso: [
      ["acceso", "Acceso"],
    ],
    lugares: [
      ["nombre", "Nombre"], ["tipo", "Tipo"], ["direccion", "Dirección"], ["local", "Local"],
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
      var _el = bar.querySelector("#ix-guardar"); if (_el) _el.onclick = guardar;
      var _el = bar.querySelector("#ix-descartar"); if (_el) _el.onclick = function () { descartar(); };
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
      if (data.fila != null && String(data.fila) !== "" && String(data.fila) !== String(lista[i].fila)) {
        fijarFila(lista[i].tabla, lista[i].fila, String(data.fila));
        lista[i].fila = String(data.fila);
      }
    }
    dirty = {};
    barra();
    if (window.toast) toast("Cambios guardados");
    refrescar(tablaDe(lista));
  }

  function fijarFila(tabla, antes, ahora) {
    document.querySelectorAll("[data-ix-tabla][data-ix-fila]").forEach(function (el) {
      if (el.getAttribute("data-ix-tabla") === tabla && el.getAttribute("data-ix-fila") === String(antes)) el.setAttribute("data-ix-fila", ahora);
    });
    ["data-ix-borrar", "data-ix-pedir"].forEach(function (attr) {
      document.querySelectorAll("[" + attr + "]").forEach(function (el) {
        if (el.getAttribute(attr) === tabla + ":" + antes) el.setAttribute(attr, tabla + ":" + ahora);
      });
    });
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
    if (tablas.com_facial) return "com_facial";
    if (tablas.com_producto) return "com_producto";
    if (tablas.com_tramo) return "com_tramo";
    if (tablas.com_base) return "com_base";
    if (tablas.com_extra) return "com_extra";
    if (tablas.com_recep) return "com_recep";
    if (tablas.usuarios) return "usuarios";
    if (tablas.acceso) return "acceso";
    if (tablas.lugares) return "lugares";
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
    if (tabla === "proveedores") {
      if (typeof go === "function") {
        go("#/m/proveedores" + (window._provFila ? "/" + encodeURIComponent(window._provFila) : ""));
        return;
      }
      if (c && typeof renderProveedores === "function") { renderProveedores(c); return; }
    }
    if (tabla === "compras" && c && typeof renderEntradas === "function") { renderEntradas(c); return; }
    if (tabla === "gift_cards" && document.getElementById("bgc-results")) {
      var qGc = (document.getElementById("bgc-inp") || {}).value || "";
      if (qGc.trim() && typeof ejecutarBuscarGC === "function") ejecutarBuscarGC();
      else if (typeof verTodasGC === "function") verTodasGC();
      return;
    }
    if (tabla === "paquetes" && document.getElementById("bpq-todos") && typeof _cargarTodosPaquetes === "function") { _cargarTodosPaquetes(); return; }
    if ((tabla === "permisos" || tabla === "multas" || tabla === "horarios" || tabla === "asistencia" || tabla === "feriados" || tabla === "pago_config" || tabla === "usuarios" || tabla === "acceso" || tabla === "lugares" || String(tabla).indexOf("com_") === 0) && typeof draw === "function") { draw(); return; }
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
      || (tabla === "com_facial" && document.getElementById("cfg-facial"))
      || (tabla === "com_producto" && document.getElementById("cfg-prod"))
      || (tabla === "com_tramo" && document.getElementById("cfg-tramo"))
      || (tabla === "com_base" && document.getElementById("cfg-general"))
      || (tabla === "com_extra" && document.getElementById("cfg-general"))
      || (tabla === "com_recep" && document.getElementById("cfg-general"))
      || (tabla === "usuarios" && document.getElementById("usr-nuevo"))
      || (tabla === "lugares" && document.getElementById("lug-nuevo"))
      || document.getElementById("hist-res") || document.getElementById("content");
    if (!host) return;
    var box = document.createElement("div");
    box.id = "ix-nuevo";
    box.className = "ix-nuevo";
    var titulo = tabla === "clientes" ? "Nueva clienta" : tabla === "catalogo" ? "Nuevo producto" : tabla === "proveedores" ? "Nuevo proveedor" : tabla === "compras" ? "Nueva línea" : tabla === "gift_cards" ? "Nueva gift card" : tabla === "paquetes" ? "Nuevo paquete" : tabla === "permisos" ? "Nuevo permiso" : tabla === "multas" ? "Nueva multa" : tabla === "horarios" ? "Nuevo horario" : tabla === "asistencia" ? "Marca olvidada" : tabla === "feriados" ? "Nuevo feriado" : tabla === "pago_config" ? "Nueva configuración" : tabla === "usuarios" ? "Nuevo usuario" : tabla === "lugares" ? "Nuevo lugar" : tabla === "com_facial" ? "Nuevo facial" : tabla === "com_producto" ? "Nuevo producto" : tabla === "com_tramo" ? "Nuevo tramo" : "Nuevo ticket";
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
    var _el = overlay.querySelector("#ix-x"); if (_el) _el.onclick = function () { overlay.remove(); };
    overlay.querySelectorAll("[data-ix-abrir]").forEach(function (a) { a.addEventListener("click", function () { overlay.remove(); }); });
    var _el = overlay.querySelector("#ix-tipo"); if (_el) _el.onchange = function (ev) {
      overlay.querySelector("#ix-props").hidden = ev.target.value === "eliminacion";
    };
    var _el = overlay.querySelector("#ix-send"); if (_el) _el.onclick = async function () {
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

  var IX_OCULTOS = { __antes: 1, __campos: 1, __payload: 1, _via: 1, _campos: 1, _cambios: 1, edicion_form: 1, form: 1, paqPick: 1, colQ: 1, facial_hecho: 1, servicios_adicionales: 1, diff: 1, propuesta: 1, lineas: 1, totales: 1, datos: 1 };
  var IX_NOMBRES = { autorizaFotos: "Autoriza fotos", autoriza_fotos: "Autoriza fotos", notas: "Notas", recomendaciones: "Recomendaciones", retorno: "Fecha de regreso", fechaRetorno: "Fecha de regreso", retornoTrat: "Tratamiento recomendado", justificacion_descuento: "Motivo del descuento", nombre: "Nombre", apellido: "Apellido", cedula: "Cédula", factura: "Factura", cosmetologa: "Atendió", cabina: "Cabina", local: "Local", telefono: "Teléfono", sector: "Sector", tipoPiel: "Tipo de piel", alergias: "Alergias", medicacion: "Medicación", condiciones: "Condiciones", nacimiento: "Nacimiento", estimado: "Total", total: "Total", descuento: "Descuento" };
  function ixNombre(k) {
    if (IX_NOMBRES[k]) return IX_NOMBRES[k];
    if (CAMPOS) {
      var g, i, L;
      for (g in CAMPOS) {
        L = CAMPOS[g] || [];
        for (i = 0; i < L.length; i++) if (L[i][0] === k) return L[i][1];
      }
    }
    return null;
  }
  function ixVal(v) {
    if (v == null || v === "") return "—";
    if (typeof v === "boolean") return v ? "SI" : "NO";
    if (typeof v === "number" && isFinite(v)) return (Math.abs(v) >= 0 && /total|estimado|precio|monto/i.test(String(v)) === false) ? (v === Math.round(v * 100) / 100 && (v > 1 || v === 0) ? "$" + Number(v).toFixed(2) : String(v)) : String(v);
    if (typeof v === "object") return "";
    var s0 = String(v);
    if (/^\d+(\.\d+)?$/.test(s0) && Number(s0) >= 0 && s0.indexOf(".") >= 0) return "$" + Number(s0).toFixed(2);
    return s0;
  }
  function ixMoney(v) {
    var n = Number(v);
    return isFinite(n) ? "$" + n.toFixed(2) : "—";
  }
  function ixLinea(lbl, antes, despues) {
    var a = ixVal(antes), d = ixVal(despues);
    if (!a && !d) return "";
    if (a === d) return "";
    var tx = (lbl ? lbl + ": " : "") + (a || "—") + " → " + (d || "—");
    return '<div class="ix-diff"><div class="ix-diff-tx">' + esc(tx) + '</div><button type="button" class="ix-vermas" data-ix-mas-txt hidden>ver más</button></div>';
  }
  // TK226: resumen legible. Nunca JSON ni claves internas.
  function resumenCambios(s) {
    var prop = (s && s.propuestos && typeof s.propuestos === "object") ? s.propuestos : {};
    var antes = (s && s.antes && typeof s.antes === "object") ? s.antes : {};
    if (prop.__antes && typeof prop.__antes === "object") antes = Object.assign({}, prop.__antes, antes);
    var nombres = Object.assign({}, IX_NOMBRES, (antes._campos && typeof antes._campos === "object") ? antes._campos : {}, (prop.__campos && typeof prop.__campos === "object") ? prop.__campos : {});
    var out = [];
    function push(lbl, a, d) {
      var h = ixLinea(lbl || "", a, d);
      if (h) out.push(h);
    }
    if (s && s.tipo === "eliminacion") {
      return '<div class="ix-diff"><div class="ix-diff-tx">Se pide eliminar ' + esc(s.etiqueta || s.fila || "este registro") + "</div></div>";
    }
    if (Array.isArray(prop._cambios)) {
      prop._cambios.forEach(function (c) {
        if (!c) return;
        push(c.etiqueta || c.campo || ixNombre(c.clave) || "", c.antes, c.despues);
      });
    }
    var P = (prop.propuesta && typeof prop.propuesta === "object") ? prop.propuesta : null;
    if (P && Array.isArray(P.legible)) {
      P.legible.forEach(function (c) {
        if (!c) return;
        var det = c.detalle ? String(c.detalle) : "";
        det = det.replace(/^Antes:\s*/i, "").replace(/\s*→\s*Después:\s*/i, " → ");
        var tx = (c.titulo ? String(c.titulo) + ": " : "") + (det || "");
        if (!tx.replace(":", "").trim()) return;
        out.push('<div class="ix-diff"><div class="ix-diff-tx">' + esc(tx) + '</div><button type="button" class="ix-vermas" data-ix-mas-txt hidden>ver más</button></div>');
      });
    }
    if (P && P.total && P.total.texto) {
      out.push('<div class="ix-diff"><div class="ix-diff-tx">' + esc(String(P.total.texto)) + '</div></div>');
    } else if (prop.totales && typeof prop.totales === "object") {
      var ta = (antes.totales && typeof antes.totales === "object") ? antes.totales.total : antes.total;
      var td = prop.totales.total;
      if (td != null && Number(ta) !== Number(td)) push("Total", ixMoney(ta), ixMoney(td));
    }
    if (Array.isArray(prop.lineas) && !(P && Array.isArray(P.legible) && P.legible.length)) {
      var L0 = (antes.lineas && Array.isArray(antes.lineas)) ? antes.lineas : [];
      var aTxt = L0.length ? (L0.length + " línea" + (L0.length === 1 ? "" : "s")) : "—";
      var dTxt = prop.lineas.length + " línea" + (prop.lineas.length === 1 ? "" : "s");
      push("Líneas", aTxt, dTxt);
    }
    var datos = (prop.datos && typeof prop.datos === "object") ? prop.datos : {};
    var datosA = (antes.datos && typeof antes.datos === "object") ? antes.datos : antes;
    Object.keys(datos).forEach(function (k) {
      if (IX_OCULTOS[k] || k.charAt(0) === "_") return;
      var lbl = nombres[k] || ixNombre(k);
      if (!lbl) return;
      push(lbl, datosA[k], datos[k]);
    });
    Object.keys(prop).forEach(function (k) {
      if (IX_OCULTOS[k] || k.charAt(0) === "_") return;
      if (typeof prop[k] === "object") return;
      var lbl = nombres[k] || ixNombre(k);
      if (!lbl) return;
      var av = (antes[k] != null) ? antes[k] : (datosA[k]);
      push(lbl, av, prop[k]);
    });
    if (!out.length) return '<div class="ix-diff"><div class="ix-diff-tx">Sin diferencia de campos visible</div></div>';
    return out.join("");
  }
  function ixTipo(s) {
    if (!s) return "Cambio";
    if (s.tipo === "eliminacion") return s.tabla === "cliente_beta" ? "Eliminar ficha" : "Eliminar ticket";
    if (s.tabla === "cliente_beta") return "Cambio de ficha";
    if (s.tabla === "ticket_detalle") return "Edición de ticket";
    return "Cambio";
  }
  function ixCosa(s) {
    if (s.etiqueta) return s.etiqueta;
    if (s.fila) return String(s.fila);
    return "";
  }
  function ixCuando(s) {
    return s && s.creado ? new Date(s.creado).toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  }
  function tarjetaSol(s, hist) {
    var cosa = ixCosa(s);
    var cuando = ixCuando(s);
    var abrir = s.enlace ? ' <a href="' + esc(s.enlace) + '" data-ix-abrir>Abrir</a>' : "";
    var prueba = s.prueba ? '<span class="ix-prueba">SIMULACIÓN</span> ' : "";
    var admin = edita();
    var acciones = !hist && admin && s.estado === "pendiente"
      ? '<div class="ix-acc"><button type="button" data-ok="' + esc(s.id) + '">Aprobar</button><button type="button" data-no="' + esc(s.id) + '">Rechazar</button></div>'
      : (hist ? '<div class="ix-estado">' + esc(s.estado || "") + (s.comentario ? " · " + esc(s.comentario) : "") + "</div>" : "");
    var hd = prueba + "<b>" + esc(s.solicitante || "") + "</b> · " + esc(ixTipo(s)) + (cosa ? " · " + esc(cosa) : "") + abrir + (cuando ? ' <span class="ix-cuando">' + esc(cuando) + "</span>" : "");
    var mot = s.motivo ? '<div class="ix-sol-mot"><i>Motivo:</i> ' + esc(s.motivo) + "</div>" : "";
    return '<article class="ix-sol' + (s.prueba ? " prueba" : "") + (hist ? " hist" : "") + '"><div class="ix-sol-hd">' + hd + "</div>" + mot + resumenCambios(s) + (s.prueba && !hist ? '<div class="ix-nota">Solicitud de simulación: aprobar o rechazar no cambia datos reales.</div>' : "") + acciones + "</article>";
  }
  function wireSolPanel(overlay) {
    var _el = overlay.querySelector("#ix-x"); if (_el) _el.onclick = function () { overlay.remove(); };
    overlay.querySelectorAll("[data-ix-abrir]").forEach(function (a) { a.addEventListener("click", function () { overlay.remove(); }); });
    overlay.querySelectorAll("[data-ix-mas-txt]").forEach(function (b) {
      var box = b.previousElementSibling;
      if (!box) return;
      if (box.scrollHeight > box.clientHeight + 2) b.hidden = false;
      b.onclick = function () {
        var d = b.closest(".ix-diff");
        if (!d) return;
        var on = d.classList.toggle("exp");
        b.textContent = on ? "ver menos" : "ver más";
      };
    });
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
    var histBtn = overlay.querySelector("[data-ix-hist]");
    if (histBtn) histBtn.onclick = async function () {
      histBtn.disabled = true;
      var box = overlay.querySelector("#ix-hist");
      if (!box) return;
      if (box.getAttribute("data-on") === "1") {
        box.hidden = true; box.setAttribute("data-on", "0"); histBtn.textContent = "Ver historial"; histBtn.disabled = false; return;
      }
      box.innerHTML = '<p class="ix-cuando">Cargando historial…</p>';
      box.hidden = false;
      var h = await api("getSolicitudes", { historial: true }).catch(function () { return null; });
      var list = ((h && h.items) || []).map(function (s) { return tarjetaSol(s, true); }).join("") || '<p class="ix-cuando">No hay solicitudes anteriores.</p>';
      box.innerHTML = list;
      box.setAttribute("data-on", "1");
      histBtn.textContent = "Ocultar historial";
      histBtn.disabled = false;
      wireSolPanel(overlay);
    };
  }

  async function panel() {
    var data = await api("getSolicitudes", {});
    if (data.error) { if (window.toast) toast(data.error); return; }
    var overlay = document.createElement("div");
    overlay.className = "ix-overlay";
    var items = (data.items || []).map(function (s) { return tarjetaSol(s, false); }).join("") || '<p>No hay solicitudes pendientes.</p>';
    var histN = Number(data.historial) || 0;
    var hist = histN ? '<button type="button" class="ix-hist" data-ix-hist>Ver historial</button><div id="ix-hist" class="ix-hist-box" hidden></div>' : "";
    overlay.innerHTML = '<div class="ix-sheet ix-sols"><div class="ix-line"><b>Solicitudes</b><button type="button" id="ix-x">×</button></div>' + items + hist + "</div>";
    document.body.appendChild(overlay);
    wireSolPanel(overlay);
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
