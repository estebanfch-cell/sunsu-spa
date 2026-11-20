/* TK153: icono oficial de WhatsApp, resolución de chat en el backend y envío de 1–3 PDFs en un solo mensaje. */
(function (w) {
  var WA_ICON_SVG = '<svg class="wa-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  function toast(msg, mal) {
    try {
      if (typeof toast2 === "function") return toast2(msg, mal);
      if (typeof w.toast === "function") return w.toast(msg, mal ? "#B86B6B" : "var(--green)");
    } catch (e0) {}
  }
  function esMovil() {
    return typeof w._esMovil_ === "function" ? w._esMovil_() : /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  }
  function copiar(txt) {
    if (!txt) return;
    try { if (typeof w._copiarTexto_ === "function") { w._copiarTexto_(txt); return; } } catch (e1) {}
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt); return; }
    } catch (e2) {}
    try {
      var ta = document.createElement("textarea");
      ta.value = txt; ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    } catch (e3) {}
  }
  function abrirUrl(prep) {
    if (!prep || !prep.tiene_tel) return;
    var u = esMovil() ? (prep.wa_url || "") : (prep.wa_url_web || prep.wa_url || "");
    if (!u) return;
    var vent = window.open(u, "_blank");
    if (!vent) window.location.href = u;
    if (vent) setTimeout(function () { try { vent.close(); } catch (e4) {} }, 2800);
  }
  function conPaq(p) {
    p = p || {};
    return !!( (p.vigentes && p.vigentes.length) || p.uso || p.compra || (p.delTicket && p.delTicket.length) );
  }
  function tiposDeVista(d) {
    d = d || {};
    var t = d.ticket || {}, L = d.lineas || [], p = d.paquete || {}, G = d.giftcards || [];
    var tipos = [];
    if ((L || []).some(function (l) { return l.tipo === "facial" || l.tipo === "servicio" || l.tipo === "extra"; }) || t.notas || t.recomendaciones || t.retorno || t.sheetRow) tipos.push("facial");
    if (conPaq(p)) tipos.push("paquete");
    if ((G || []).some(function (g) { return g.uso === "vendida"; })) tipos.push("giftcard");
    return tipos;
  }
  function tiposDeLista(t) {
    t = t || {};
    var r = t.resumen || {};
    var tipos = [];
    if (t.facial || r.faciales || t.facial_hecho || t.recomendaciones) tipos.push("facial");
    if (t.pack3 || t.pack6 || t.colQ || r.paquetes || r.canjes) tipos.push("paquete");
    if (t.colS || t.colR || r.gifts) tipos.push("giftcard");
    if (!tipos.length) tipos.push("facial");
    return tipos;
  }

  function preparar(opts) {
    if (typeof api !== "function") return Promise.reject(new Error("Sin conexión"));
    return Promise.resolve(api("wa_preparar", opts || {}));
  }

  function descargarDocs(docs) {
    (docs || []).forEach(function (x, i) {
      setTimeout(function () {
        try {
          if (x.doc && x.doc.save) x.doc.save(x.nom);
          else if (x.blob) {
            var a = document.createElement("a");
            a.href = URL.createObjectURL(x.blob); a.download = x.nom || "sunsu.pdf";
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          }
        } catch (e5) {}
      }, i * 900);
    });
  }

  function filesDe(docs) {
    var files = [];
    (docs || []).forEach(function (x) {
      try {
        if (x.file) files.push(x.file);
        else if (x.doc && x.doc.output) files.push(new File([x.doc.output("blob")], x.nom || "sunsu.pdf", { type: "application/pdf" }));
        else if (x.blob) files.push(new File([x.blob], x.nom || "sunsu.pdf", { type: x.blob.type || "application/pdf" }));
      } catch (e6) {}
    });
    return files;
  }

  async function marcarEnvio(clave, tipos, prep) {
    if (!clave || !tipos || !tipos.length || typeof api !== "function") return;
    try { await api("tk_envio", { clave: clave, tipos: tipos }); } catch (e7) {}
    try {
      var Leds = w._tkLeds = w._tkLeds || {};
      var t = filaDe(clave);
      if (t) {
        /* TK155: marcar SOLO este ticket (clave única; nunca _tkLeds["null"]). */
        var cur = (typeof w._tkLedOf === "function" ? w._tkLedOf(t) : null) || {};
        cur.r = 1; t.led = cur;
        if (typeof w._tkLedGuardar === "function") w._tkLedGuardar(t);
        else if (t.so_num) Leds[String(t.so_num)] = cur;
      }
      if (typeof _histActualizarRes === "function") _histActualizarRes(!!w._histEsStaff);
    } catch (e8) {}
  }
  function filaDe(clave) {
    var L = w._histVisibles || w._histData || [];
    for (var i = 0; i < L.length; i++) {
      var t = L[i], c = (w.MCTickets && MCTickets.claveDe) ? MCTickets.claveDe(t) : (t.so_num || t.clave);
      if (String(c) === String(clave) || String(t.so_num) === String(clave) || (t.tkRow != null && t.tkRow !== "" && !/^(null|undefined|0)$/.test(String(t.tkRow)) && String(t.tkRow) === String(clave))) return t;
    }
    return null;
  }

  async function compartir(prep, docs, clave, tipos) {
    copiar(prep && prep.texto);
    var files = filesDe(docs);
    var movil = esMovil();
    if (movil && navigator.share && files.length && navigator.canShare && navigator.canShare({ files: files })) {
      try {
        await navigator.share({ files: files, text: (prep && prep.texto) || "", title: "Sunsu Spa" });
        await marcarEnvio(clave, tipos, prep);
        toast("✅ Enviado por WhatsApp");
        return true;
      } catch (e9) {
        /* usuario canceló o el share falló: abrimos el chat de respaldo */
      }
    }
    if (files.length) descargarDocs(docs);
    abrirUrl(prep);
    await marcarEnvio(clave, tipos, prep);
    if (files.length && !movil) toast("📄 PDF" + (files.length > 1 ? "s" : "") + " descargado" + (files.length > 1 ? "s" : "") + " — adjúntalo" + (files.length > 1 ? "s" : "") + " en el chat");
    else if (!files.length) toast("Se abrió el chat de la clienta");
    return true;
  }

  function cerrarSel() {
    var el = document.getElementById("mctk-wa-sel");
    if (el) el.remove();
  }

  function selector(tipos, onSend) {
    cerrarSel();
    var LAB = { facial: "Facial", paquete: "Paquete", giftcard: "Gift card" };
    var box = document.createElement("div");
    box.id = "mctk-wa-sel";
    box.className = "mctk-wa-sel";
    var chips = tipos.map(function (k) {
      return '<button type="button" class="mctk-wa-chip on" data-tipo="' + k + '" aria-pressed="true">' +
        '<span class="mctk-wa-dot"></span>' + (LAB[k] || k) + "</button>";
    }).join("");
    box.innerHTML = '<div class="mctk-wa-box" role="dialog" aria-label="Enviar por WhatsApp">' +
      '<h3>Enviar por WhatsApp</h3>' +
      '<p>Elige qué PDFs van en un solo mensaje.</p>' +
      '<div class="mctk-wa-chips">' + chips + "</div>" +
      '<div class="mctk-wa-acts">' +
      '<button type="button" class="btn ghost small" data-x>Cancelar</button>' +
      '<button type="button" class="btn small mctk-wa-go" data-s>' + WA_ICON_SVG + " Enviar por WhatsApp</button>" +
      "</div></div>";
    document.body.appendChild(box);
    box.addEventListener("click", function (ev) {
      if (ev.target === box) cerrarSel();
    });
    box.querySelector("[data-x]").onclick = function () { cerrarSel(); };
    box.querySelectorAll(".mctk-wa-chip").forEach(function (b) {
      b.onclick = function () {
        b.classList.toggle("on");
        b.setAttribute("aria-pressed", b.classList.contains("on") ? "true" : "false");
      };
    });
    box.querySelector("[data-s]").onclick = function () {
      var sel = [];
      box.querySelectorAll(".mctk-wa-chip.on").forEach(function (b) { sel.push(b.getAttribute("data-tipo")); });
      if (!sel.length) { toast("Elige al menos un documento", true); return; }
      cerrarSel();
      onSend(sel);
    };
  }

  async function pdfsDe(t, d, tipos, clave) {
    clave = clave || (d && d.clave) || (t && (t.so_num || t.clave)) || "";
    var out = [], i;
    for (i = 0; i < tipos.length; i++) {
      var k = tipos[i];
      try {
        if (k === "facial") {
          /* TK184 (Emilia t801u): la tarjeta se arma SIEMPRE con el ticket recién leído (tk_get): notas, recomendaciones,
             próxima cita, líneas (compra/paquete/extras) y fotos actuales. Nunca la fila de la lista ni una tarjeta guardada. */
          if (typeof tarjetaTicket === "function") {
            var key = null;
            if (clave && w.MCTickets && typeof w.MCTickets.tarjetaFresca === "function") key = await w.MCTickets.tarjetaFresca(clave);
            if (!key) {
              var row = (d && d.ticket && d.ticket.sheetRow) || (t && (t.tkRow || t.sheet_row));
              if (row && t) { w._tkCards = w._tkCards || {}; w._tkCards[row] = t; key = row; }
            }
            if (key) await new Promise(function (res) { tarjetaTicket(key, function (doc, nom) { if (doc) out.push({ doc: doc, nom: nom, tipo: "facial" }); res(); }); });
          }
        } else if (k === "paquete" && typeof _pdfTarjetaPaquete === "function") {
          var ced = String((d && d.info && d.info.cedula) || (t && t.cedula) || "").split(".")[0];
          var x = (w._tarjPaqRef || {})["c" + ced] || (d && d.clave && (w._tarjPaqRef || {})["t" + d.clave]);
          if (!x && ced && typeof api === "function") {
            try {
              var j = await api("getSeguimientoPaquetes", { cedulas: [ced] });
              var items = (j && j.items) || [];
              x = items.filter(function (p) { return Number(p.pendientes || p.pend) > 0; })[0] || items[0];
              if (x) {
                var total = Number(x.total) || 0, usados = Number(x.usados) || 0;
                x = { p: x, total: total, usados: usados, pend: Math.max(0, total - usados), codigo: x.codigo || "" };
                (w._tarjPaqRef = w._tarjPaqRef || {})["c" + ced] = x;
              }
            } catch (eB) {}
          }
          if (x) {
            await new Promise(function (res) {
              var img = new Image(); img.crossOrigin = "anonymous";
              var fin = function (im) { _pdfTarjetaPaquete(x, im, function (doc, nom) { if (doc) out.push({ doc: doc, nom: nom, tipo: "paquete" }); res(); }); };
              img.onload = function () { fin(img); }; img.onerror = function () { fin(null); };
              img.src = typeof GCD_PAG3_URL !== "undefined" ? GCD_PAG3_URL : "giftcard_pag3_fondo.jpg";
            });
          }
        } else if (k === "giftcard") {
          if (typeof _gcdPDF === "function") {
            await new Promise(function (res) {
              try {
                _gcdPDF(function (blob, nom) {
                  if (blob) out.push({ blob: blob, nom: nom || "gift-card.pdf", tipo: "giftcard" });
                  res();
                });
              } catch (eC) { res(); }
            });
          }
        }
      } catch (eD) {}
    }
    return out;
  }

  async function flujo(opts) {
    opts = opts || {};
    var clave = opts.ticket_clave || opts.clave || "";
    var tipo = String(opts.tipo || "").toLowerCase();
    toast("⏳ Preparando WhatsApp…");
    var prep;
    try {
      prep = await preparar({
        ticket_clave: clave,
        ticket_id: opts.ticket_id,
        cliente_id: opts.cliente_id,
        gc_codigo: opts.gc_codigo,
        tipo: tipo,
        tipos: opts.tipos,
        atrasada: opts.atrasada
      });
    } catch (eE) {
      toast((eE && eE.message) || "No se pudo preparar el WhatsApp", true);
      return;
    }
    if (!prep || prep.error) { toast((prep && prep.error) || "No se pudo preparar el WhatsApp", true); return; }
    if (!prep.tiene_tel) {
      toast("Esta clienta no tiene WhatsApp registrado. Pide el cambio desde la ficha: Teléfono 🔒 (lo aprueba administración).", true);
      return;
    }
    if (tipo === "chat" || tipo === "recordatorio") {
      copiar(prep.texto);
      abrirUrl(prep);
      return;
    }
    var disponibles = prep.tipos_disponibles && prep.tipos_disponibles.length ? prep.tipos_disponibles.slice() : (opts.tipos_fallback || ["facial"]);
    if (tipo && (tipo === "facial" || tipo === "paquete" || tipo === "giftcard")) disponibles = [tipo].filter(function (x) { return (prep.tipos_disponibles || [tipo]).indexOf(x) >= 0; });
    if (!disponibles.length) disponibles = ["facial"];

    var seguir = async function (sel) {
      toast("⏳ Generando PDF" + (sel.length > 1 ? "s" : "") + "…");
      if (sel.length && sel.join() !== (prep.tipos_disponibles || []).join()) {
        try {
          var p2 = await preparar({ ticket_clave: clave, ticket_id: opts.ticket_id, tipos: sel, tipo: sel.length > 1 ? "combinado" : sel[0] });
          if (p2 && p2.ok) prep = p2;
        } catch (eF) {}
      }
      var docs = [];
      if (typeof opts.pdfs === "function") {
        try { docs = (await opts.pdfs(sel)) || []; } catch (eG) { docs = []; }
      } else {
        docs = await pdfsDe(opts.ticket, opts.detalle, sel, clave);
      }
      return compartir(prep, docs, clave, sel);
    };

    if (disponibles.length <= 1) return seguir(disponibles);
    selector(disponibles, function (sel) { seguir(sel); });
  }

  w.WA_ICON_SVG = WA_ICON_SVG;
  w.SunsuWa = {
    icon: WA_ICON_SVG,
    conPaq: conPaq,
    tiposDeVista: tiposDeVista,
    tiposDeLista: tiposDeLista,
    preparar: preparar,
    flujo: flujo,
    compartir: compartir,
    abrirUrl: abrirUrl,
    copiar: copiar,
    pdfsDe: pdfsDe
  };
})(window);
