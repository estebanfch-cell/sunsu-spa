/*!
 * Sunsu Spa · puente nativo iOS (Capacitor)
 * Mejora progresiva: SOLO se activa dentro de la app nativa (window.Capacitor.isNativePlatform()).
 * En el navegador / PWA no hace absolutamente nada.
 *
 *  - Barra de estado con los colores de Sunsu y splash que se oculta al arrancar la app.
 *  - window.open / <a target=_blank> / descargas:
 *      wa.me, WhatsApp, tel:, mailto:, sms:  → abre la app nativa del sistema
 *      blob: / data: / PDFs generados         → archivo temporal + hoja nativa «Compartir» de iOS
 *      https:// externos                      → SFSafariViewController (@capacitor/browser)
 *      window.open("") + document.write(...)  → visor dentro de la app con Imprimir (AirPrint) / Compartir
 *  - navigator.share con archivos → hoja nativa «Compartir» (@capacitor/share + @capacitor/filesystem)
 *  - <input type=file accept=image/*> → cámara / galería nativa (@capacitor/camera)
 *  - Haptics sutiles (botones principales, éxito y error)
 *  - Aviso «Sin conexión» (@capacitor/network)
 *  - Al volver a primer plano: refresca el Dashboard sin perder formularios abiertos
 *  - window.SunsuNative = { isNative, takePhoto, sharePdfBlob, shareBlob, haptic, openExternal, printHtml }
 */
(function () {
  "use strict";
  var Cap = window.Capacitor;
  var isNative = false;
  try { isNative = !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform()); } catch (e0) { isNative = false; }
  if (!isNative || window.SunsuNative) return;

  var P = Cap.Plugins || {};
  function plugin(name) { return P[name] || null; }
  function log() { try { console.log.apply(console, ["[SunsuNative]"].concat([].slice.call(arguments))); } catch (e) {} }
  function noop() {}
  function later(fn, ms) { return setTimeout(fn, ms || 0); }

  var html = document.documentElement;
  html.classList.add("sunsu-native", "sunsu-ios");

  /* ------------------------------------------------------------------ utilidades */
  var APP_ORIGIN = location.origin; // capacitor://localhost
  function abs(url) { try { return new URL(String(url), location.href).href; } catch (e) { return String(url || ""); } }
  function esApp(url) { return url.indexOf(APP_ORIGIN + "/") === 0 || url === APP_ORIGIN; }
  function esSistema(url) {
    return /^(tel|telprompt|mailto|sms|whatsapp|facetime|maps):/i.test(url) ||
      /^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|chat\.whatsapp\.com)\b/i.test(url) ||
      /^https?:\/\/(maps\.apple\.com|itunes\.apple\.com|apps\.apple\.com)\b/i.test(url);
  }
  function nombreSeguro(n, def) {
    var s = String(n || def || "archivo").replace(/[\\/:*?"<>|\u0000-\u001F]+/g, "_").trim();
    return s.slice(0, 120) || "archivo";
  }
  var MIME_EXT = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "text/html": ".html", "text/csv": ".csv", "text/plain": ".txt", "application/json": ".json" };
  function conExtension(nombre, mime) {
    if (/\.[a-z0-9]{2,5}$/i.test(nombre)) return nombre;
    return nombre + (MIME_EXT[String(mime || "").split(";")[0]] || "");
  }
  function blobABase64(blob) {
    return new Promise(function (ok, ko) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result || ""); ok(s.slice(s.indexOf(",") + 1)); };
      r.onerror = function () { ko(r.error || new Error("No se pudo leer el archivo")); };
      r.readAsDataURL(blob);
    });
  }
  function base64ABlob(b64, mime) {
    var bin = atob(b64), n = bin.length, u8 = new Uint8Array(n);
    for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime || "application/octet-stream" });
  }
  function aviso(msg, malo) {
    try { if (typeof window.toast === "function") { window.toast(msg, malo ? "#B86B6B" : undefined); return; } } catch (e) {}
    log(msg);
  }

  /* Guardamos los Blob creados con URL.createObjectURL para poder compartirlos aunque la web
     revoque el enlace enseguida. */
  var blobs = Object.create(null);
  try {
    var _createObjectURL = URL.createObjectURL.bind(URL);
    var _revokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = function (obj) {
      var u = _createObjectURL(obj);
      try { if (obj instanceof Blob) blobs[u] = obj; } catch (e) {}
      return u;
    };
    URL.revokeObjectURL = function (u) {
      later(function () { delete blobs[u]; try { _revokeObjectURL(u); } catch (e) {} }, 60000);
    };
  } catch (eUrl) {}

  function blobDeUrl(url) {
    if (blobs[url]) return Promise.resolve(blobs[url]);
    if (/^data:/i.test(url)) {
      var m = url.match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/i);
      if (m) {
        if (m[2]) return Promise.resolve(base64ABlob(m[3], m[1]));
        return Promise.resolve(new Blob([decodeURIComponent(m[3])], { type: m[1] || "text/plain" }));
      }
    }
    return fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); });
  }

  /* ------------------------------------------------------------------ haptics */
  var ultimoHaptic = 0;
  function haptic(tipo) {
    var H = plugin("Haptics");
    if (!H) return Promise.resolve();
    var now = Date.now();
    if (tipo !== "error" && now - ultimoHaptic < 120) return Promise.resolve();
    ultimoHaptic = now;
    try {
      if (tipo === "error") return H.notification({ type: "ERROR" }).catch(noop);
      if (tipo === "success") return H.notification({ type: "SUCCESS" }).catch(noop);
      if (tipo === "warning") return H.notification({ type: "WARNING" }).catch(noop);
      if (tipo === "medium") return H.impact({ style: "MEDIUM" }).catch(noop);
      if (tipo === "selection") return H.selectionChanged().catch(noop);
      return H.impact({ style: "LIGHT" }).catch(noop);
    } catch (e) { return Promise.resolve(); }
  }

  /* ------------------------------------------------------------------ abrir enlaces */
  function abrirSistema(url) {
    var L = plugin("AppLauncher");
    if (L && L.openUrl) {
      return L.openUrl({ url: url }).then(function (r) {
        if (r && r.completed === false) throw new Error("no se pudo abrir");
      }).catch(function () {
        if (/wa\.me|whatsapp/i.test(url)) aviso("No pude abrir WhatsApp. Revisa que esté instalado.", true);
        else window.location.href = url;
      });
    }
    window.location.href = url;
    return Promise.resolve();
  }
  function abrirNavegador(url) {
    var B = plugin("Browser");
    if (B && B.open) return B.open({ url: url, presentationStyle: "fullscreen", toolbarColor: "#3D5A7A" }).catch(function () { return abrirSistema(url); });
    return abrirSistema(url);
  }
  function openExternal(url, nombre) {
    var u = abs(url);
    if (!u || u === "about:blank") return Promise.resolve();
    if (/^(blob|data):/i.test(u)) return shareUrl(u, nombre);
    if (esSistema(u)) return abrirSistema(u);
    if (/^https?:/i.test(u)) return abrirNavegador(u);
    return abrirSistema(u);
  }

  /* ------------------------------------------------------------------ compartir archivos */
  var silencioDescarga = { hasta: 0 };
  function shareBlob(blob, nombre, opciones) {
    opciones = opciones || {};
    var Fs = plugin("Filesystem"), Sh = plugin("Share");
    var nom = nombreSeguro(conExtension(nombreSeguro(nombre, "Sunsu"), blob && blob.type));
    if (!Fs || !Sh) return Promise.reject(new Error("Compartir no está disponible"));
    var ruta = "sunsu-compartir/" + Date.now() + "-" + nom;
    return blobABase64(blob).then(function (b64) {
      return Fs.writeFile({ path: ruta, data: b64, directory: "CACHE", recursive: true });
    }).then(function (w) {
      var o = { title: opciones.title || "Sunsu Spa", files: [w.uri], dialogTitle: opciones.title || "Compartir" };
      if (opciones.text) o.text = opciones.text;
      return Sh.share(o);
    }).then(function (r) {
      haptic("success");
      later(function () { try { Fs.deleteFile({ path: ruta, directory: "CACHE" }).catch(noop); } catch (e) {} }, 120000);
      return r;
    }, function (err) {
      var msg = String((err && (err.message || err.errorMessage)) || err || "");
      if (/cancel/i.test(msg)) {
        silencioDescarga.hasta = Date.now() + 2500;
        var ab;
        try { ab = new DOMException("Share canceled", "AbortError"); } catch (eD) { ab = new Error("AbortError"); ab.name = "AbortError"; }
        throw ab;
      }
      throw err;
    });
  }
  function sharePdfBlob(blob, nombre, texto) {
    var b = blob && blob.type ? blob : new Blob([blob], { type: "application/pdf" });
    return shareBlob(b, conExtension(nombreSeguro(nombre, "Sunsu"), "application/pdf"), { text: texto });
  }
  function shareUrl(url, nombre) {
    return blobDeUrl(url).then(function (b) { return shareBlob(b, nombre || "Sunsu"); }).catch(function (e) {
      if (e && e.name === "AbortError") return;
      aviso("No se pudo compartir el archivo: " + ((e && e.message) || e), true);
    });
  }

  /* ------------------------------------------------------------------ visor de documentos
     Reemplaza window.open("") + document.write(html) (reportes, PDFs para imprimir, etiquetas). */
  function abrirVisor(htmlDoc, titulo, srcUrl) {
    cerrarVisor();
    var v = document.createElement("div");
    v.id = "sunsu-doc-viewer";
    v.setAttribute("role", "dialog");
    v.setAttribute("aria-modal", "true");
    v.innerHTML = '<div class="bar"><button type="button" data-x>Cerrar</button><b></b>' +
      '<button type="button" data-p>Imprimir</button><button type="button" data-s>Compartir</button></div>' +
      '<iframe title="Documento"></iframe><div class="pie"></div>';
    var t = titulo || "";
    if (!t) { var m = String(htmlDoc).match(/<title[^>]*>([^<]*)<\/title>/i); t = m ? m[1].trim() : "Documento"; }
    v.querySelector("b").textContent = t || "Documento";
    var fr = v.querySelector("iframe");
    // window.print() dentro del documento → AirPrint nativo
    var doc = String(htmlDoc || "").replace(/<script[^>]*>[^<]*print\(\)[^<]*<\/script>/gi, "");
    if (srcUrl) fr.src = srcUrl; else fr.srcdoc = doc;
    function actual() {
      if (!srcUrl) return doc;
      try { return "<!DOCTYPE html>" + fr.contentDocument.documentElement.outerHTML; } catch (e) { return doc; }
    }
    v.querySelector("[data-x]").onclick = function () { haptic(); cerrarVisor(); };
    v.querySelector("[data-p]").onclick = function () { haptic(); printHtml(actual(), t); };
    v.querySelector("[data-s]").onclick = function () {
      haptic();
      doc = actual();
      shareBlob(new Blob([doc], { type: "text/html" }), conExtension(nombreSeguro(t, "Sunsu"), "text/html"), { title: t }).catch(function (e) {
        if (!e || e.name !== "AbortError") aviso("No se pudo compartir", true);
      });
    };
    document.body.appendChild(v);
    return v;
  }
  function cerrarVisor() { var v = document.getElementById("sunsu-doc-viewer"); if (v) v.remove(); }
  function printHtml(htmlDoc, nombre) {
    var S = plugin("SunsuNative");
    if (S && S.printHtml) {
      return S.printHtml({ html: String(htmlDoc || ""), name: nombre || "Sunsu Spa", baseUrl: "https://app.sunsuspa.com/" }).catch(function (e) {
        aviso("No se pudo imprimir: " + ((e && e.message) || e), true);
      });
    }
    return shareBlob(new Blob([String(htmlDoc || "")], { type: "text/html" }), conExtension(nombreSeguro(nombre, "Sunsu"), "text/html")).catch(noop);
  }

  /* Ventana falsa que devuelve window.open en la app nativa: cubre los patrones de la web
     (v.close(), win.document.write(...), win.location = blobUrl, if (!win) ...). */
  function ventanaFalsa(urlInicial) {
    var buffer = "", timer = null, cerrada = false, visor = null;
    function pintar() {
      timer = null;
      if (cerrada || !buffer) return;
      visor = abrirVisor(buffer);
    }
    function programar() { if (timer) clearTimeout(timer); timer = later(pintar, 60); }
    function irA(u) {
      if (timer) { clearTimeout(timer); timer = null; }
      buffer = "";
      if (visor) { visor.remove(); visor = null; }
      cerrada = true;
      openExternal(u);
    }
    var docFalso = {
      write: function () { buffer += [].slice.call(arguments).join(""); programar(); },
      writeln: function () { buffer += [].slice.call(arguments).join("") + "\n"; programar(); },
      open: function () { buffer = ""; return docFalso; },
      close: function () { if (timer) clearTimeout(timer); pintar(); },
      title: "",
      createElement: function (t) { return document.createElement(t); },
    };
    var locFalsa = {};
    Object.defineProperty(locFalsa, "href", { get: function () { return urlInicial || "about:blank"; }, set: irA });
    locFalsa.assign = irA; locFalsa.replace = irA;
    var w = {
      document: docFalso,
      close: function () { cerrada = true; if (timer) { clearTimeout(timer); timer = null; } },
      focus: noop, blur: noop,
      print: function () { if (buffer) printHtml(buffer); },
      postMessage: noop,
      addEventListener: noop, removeEventListener: noop,
      opener: null,
    };
    Object.defineProperty(w, "closed", { get: function () { return cerrada; } });
    Object.defineProperty(w, "location", { get: function () { return locFalsa; }, set: irA });
    return w;
  }

  var _open = window.open;
  window.open = function (url, target, features) {
    var u = url == null ? "" : String(url);
    if (!u || u === "about:blank") return ventanaFalsa("");
    var a = abs(u);
    if (esApp(a) && !/\.pdf(\?|#|$)/i.test(a)) {
      // Rutas internas de la app (p. ej. simetria.html) se abren en el visor con «Cerrar».
      var titulo = a.split("/").pop().split(/[?#]/)[0].replace(/\.html?$/i, "") || "Sunsu";
      abrirVisor("", titulo.charAt(0).toUpperCase() + titulo.slice(1), a);
      var wi = ventanaFalsa(a);
      return wi;
    }
    openExternal(a);
    var w = ventanaFalsa(a);
    try { w.close(); } catch (e) {}
    return w;
  };
  window.open.__sunsuNative = true;
  window.open.__original = _open;

  /* ------------------------------------------------------------------ <a> descargas / externos */
  function manejarAncla(a) {
    if (!a || !a.getAttribute) return false;
    var raw = a.getAttribute("href");
    if (!raw || raw.charAt(0) === "#" || /^javascript:/i.test(raw)) return false;
    var href = abs(a.href || raw);
    var descarga = a.hasAttribute("download");
    if (/^(blob|data):/i.test(href)) {
      if (Date.now() < silencioDescarga.hasta) return true; // el usuario acaba de cancelar «Compartir»
      shareUrl(href, a.getAttribute("download") || a.download || "Sunsu");
      return true;
    }
    if (esSistema(href)) { abrirSistema(href); return true; }
    if (esApp(href)) {
      if (descarga || /\.pdf(\?|#|$)/i.test(href)) { shareUrl(href, a.getAttribute("download") || href.split("/").pop()); return true; }
      return false;
    }
    if (/^https?:/i.test(href) && (descarga || a.target === "_blank" || a.target === "_system")) { abrirNavegador(href); return true; }
    if (/^https?:/i.test(href)) { abrirNavegador(href); return true; } // nunca salir de la app hacia otra web
    return false;
  }
  try {
    var _aClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (manejarAncla(this)) return;
      return _aClick.apply(this, arguments);
    };
  } catch (eA) {}
  document.addEventListener("click", function (ev) {
    if (ev.defaultPrevented) return;
    var t = ev.target;
    var a = t && t.closest ? t.closest("a[href]") : null;
    if (a && manejarAncla(a)) ev.preventDefault();
  }, true);

  /* ------------------------------------------------------------------ navigator.share */
  try {
    var _share = navigator.share ? navigator.share.bind(navigator) : null;
    var _canShare = navigator.canShare ? navigator.canShare.bind(navigator) : null;
    navigator.canShare = function (data) {
      if (data && data.files && data.files.length) return true;
      return _canShare ? _canShare(data) : !!(data && (data.url || data.text));
    };
    navigator.share = function (data) {
      data = data || {};
      var files = data.files ? [].slice.call(data.files) : [];
      if (files.length) {
        // Varios archivos: uno a la vez por la hoja nativa (iOS los comparte todos juntos)
        var Fs = plugin("Filesystem"), Sh = plugin("Share");
        if (!Fs || !Sh) return Promise.reject(new Error("Compartir no está disponible"));
        var base = "sunsu-compartir/" + Date.now() + "-";
        return Promise.all(files.map(function (f, i) {
          var nom = nombreSeguro(conExtension(nombreSeguro(f.name, "Sunsu-" + (i + 1)), f.type));
          return blobABase64(f).then(function (b64) {
            return Fs.writeFile({ path: base + i + "-" + nom, data: b64, directory: "CACHE", recursive: true });
          }).then(function (w) { return w.uri; });
        })).then(function (uris) {
          var o = { title: data.title || "Sunsu Spa", files: uris, dialogTitle: data.title || "Compartir" };
          if (data.text) o.text = data.text;
          if (data.url) o.url = data.url;
          return Sh.share(o);
        }).then(function () { haptic("success"); }, function (err) {
          var msg = String((err && (err.message || err.errorMessage)) || err || "");
          if (/cancel/i.test(msg)) {
            silencioDescarga.hasta = Date.now() + 2500;
            var ab;
            try { ab = new DOMException("Share canceled", "AbortError"); } catch (eD) { ab = new Error("AbortError"); ab.name = "AbortError"; }
            throw ab;
          }
          throw err;
        });
      }
      var Sh2 = plugin("Share");
      if (Sh2) {
        return Sh2.share({ title: data.title, text: data.text, url: data.url, dialogTitle: data.title || "Compartir" }).then(noop, function (err) {
          var msg = String((err && (err.message || err.errorMessage)) || err || "");
          if (/cancel/i.test(msg)) { var ab; try { ab = new DOMException("Share canceled", "AbortError"); } catch (eD) { ab = new Error("AbortError"); ab.name = "AbortError"; } throw ab; }
          throw err;
        });
      }
      return _share ? _share(data) : Promise.reject(new Error("Compartir no está disponible"));
    };
  } catch (eS) {}

  /* ------------------------------------------------------------------ cámara / galería nativa */
  function takePhoto(opts) {
    opts = opts || {};
    var C = plugin("Camera");
    if (!C || !C.getPhoto) return Promise.reject(new Error("Cámara no disponible"));
    return C.getPhoto({
      resultType: "base64",
      source: opts.source || "PROMPT",
      direction: opts.direction || "REAR",
      quality: opts.quality || 82,
      width: opts.width || 2048,
      height: opts.height || 2048,
      correctOrientation: true,
      allowEditing: false,
      saveToGallery: false,
      presentationStyle: "fullscreen",
      promptLabelHeader: opts.header || "Foto",
      promptLabelPhoto: "Elegir de la galería",
      promptLabelPicture: "Tomar foto",
      promptLabelCancel: "Cancelar",
    }).then(function (p) {
      var fmt = String((p && p.format) || "jpeg").toLowerCase();
      var mime = fmt === "png" ? "image/png" : fmt === "heic" ? "image/heic" : "image/jpeg";
      var blob = base64ABlob(p.base64String, mime);
      var nombre = "foto-" + new Date().toISOString().replace(/[:.]/g, "-") + (mime === "image/png" ? ".png" : ".jpg");
      var file;
      try { file = new File([blob], nombre, { type: mime, lastModified: Date.now() }); } catch (eF) { file = blob; file.name = nombre; }
      return file;
    });
  }
  function soloImagenes(inp) {
    var acc = String(inp.getAttribute("accept") || "").trim().toLowerCase();
    if (!acc) return false;
    return acc.split(",").every(function (x) { x = x.trim(); return x === "image/*" || /^image\//.test(x) || /^\.(jpe?g|png|heic|webp)$/.test(x); });
  }
  function usarCamaraNativa(inp) {
    if (!inp || inp.type !== "file" || inp.disabled || inp.multiple) return false;
    if (inp.hasAttribute("data-sunsu-web-picker") || window.SunsuNative.camaraNativa === false) return false;
    return soloImagenes(inp);
  }
  var pidiendoFoto = false;
  function abrirCamara(inp) {
    if (pidiendoFoto) return;
    pidiendoFoto = true;
    var cap = String(inp.getAttribute("capture") || "").toLowerCase();
    var opts = { source: cap ? "CAMERA" : "PROMPT", direction: cap === "user" ? "FRONT" : "REAR" };
    takePhoto(opts).then(function (file) {
      try {
        var dt = new DataTransfer();
        dt.items.add(file);
        inp.files = dt.files;
      } catch (eDt) {
        aviso("No se pudo adjuntar la foto en este iPhone. Actualiza iOS e inténtalo de nuevo.", true);
        return;
      }
      haptic();
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    }).catch(function (e) {
      var msg = String((e && (e.message || e.errorMessage)) || e || "");
      if (/cancel/i.test(msg)) return;
      if (/denied|permission|access/i.test(msg)) aviso("Permite el acceso a la cámara y fotos en Ajustes › Sunsu Spa.", true);
      else aviso("No se pudo abrir la cámara: " + msg, true);
    }).then(function () { pidiendoFoto = false; });
  }
  try {
    var _iClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (usarCamaraNativa(this)) { abrirCamara(this); return; }
      return _iClick.apply(this, arguments);
    };
  } catch (eI) {}
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t) return;
    var inp = t.tagName === "INPUT" ? t : null;
    if (!inp && t.closest) {
      var lab = t.closest("label");
      if (lab) inp = lab.control || (lab.htmlFor ? document.getElementById(lab.htmlFor) : lab.querySelector("input[type=file]"));
    }
    if (inp && usarCamaraNativa(inp)) { ev.preventDefault(); ev.stopPropagation(); abrirCamara(inp); }
  }, true);

  /* ------------------------------------------------------------------ toasts → haptics */
  function envolverToast() {
    var t = window.toast;
    if (typeof t !== "function" || t.__sunsuNative) return;
    var w = function (msg, color) {
      try {
        var s = String(msg || ""), c = String(color || "");
        if (/❌|⚠️|error|no se pudo/i.test(s) || /B86B6B|B87070|red/i.test(c)) haptic("error");
        else if (/✅|guardad|registrad|enviad|listo/i.test(s)) haptic("success");
      } catch (e) {}
      return t.apply(this, arguments);
    };
    w.__sunsuNative = true;
    try { window.toast = w; } catch (e) {}
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest("button, .btn, [role=button], .tab") : null;
    if (!b || b.disabled) return;
    if (b.type === "submit" || /\b(btn|tab|plus)\b/.test(b.className || "")) haptic();
  }, true);

  /* ------------------------------------------------------------------ barra de estado */
  var SB = plugin("StatusBar");
  var ultimoTono = "";
  function tonoBarra() {
    if (!SB || !document.body) return;
    var app = document.body.classList.contains("app-on");
    var tono = app ? "app" : "login";
    if (tono === ultimoTono) return;
    ultimoTono = tono;
    try {
      // style DARK = texto claro (fondo azul Sunsu); LIGHT = texto oscuro (fondo crema)
      SB.setStyle({ style: app ? "DARK" : "LIGHT" }).catch(noop);
      SB.setBackgroundColor({ color: app ? "#3D5A7A" : "#EEF3FA" }).catch(noop);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ splash */
  var splashListo = false;
  function ocultarSplash() {
    if (splashListo) return;
    splashListo = true;
    var S = plugin("SplashScreen");
    if (S && S.hide) S.hide({ fadeOutDuration: 250 }).catch(noop);
  }

  /* ------------------------------------------------------------------ sin conexión */
  function bannerRed(conectado) {
    var b = document.getElementById("sunsu-offline");
    if (!b) {
      if (conectado) return;
      b = document.createElement("div");
      b.id = "sunsu-offline";
      b.setAttribute("role", "status");
      b.setAttribute("aria-live", "polite");
      b.innerHTML = '<span class="dot"></span><span>Sin conexión a internet. Revisa tu Wi‑Fi o datos; Sunsu se reconecta sola.</span>';
      document.body.appendChild(b);
    }
    if (conectado) b.classList.remove("on");
    else { b.classList.add("on"); haptic("warning"); }
  }
  function iniciarRed() {
    var N = plugin("Network");
    if (!N) return;
    try {
      N.getStatus().then(function (s) { if (s && s.connected === false) bannerRed(false); }).catch(noop);
      N.addListener("networkStatusChange", function (s) { bannerRed(!!(s && s.connected)); });
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ primer plano */
  var enFondoDesde = 0;
  function iniciarCicloVida() {
    var A = plugin("App");
    if (!A) return;
    try {
      A.addListener("appStateChange", function (st) {
        if (!st || !st.isActive) { enFondoDesde = Date.now(); return; }
        var fuera = enFondoDesde ? Date.now() - enFondoDesde : 0;
        enFondoDesde = 0;
        window.dispatchEvent(new CustomEvent("sunsu:resume", { detail: { ms: fuera } }));
        // Refresco liviano: solo el Dashboard, solo si no hay modal/formulario abierto y estuvo >2 min fuera.
        if (fuera < 120000) return;
        var modal = document.getElementById("modal");
        var hayModal = (modal && getComputedStyle(modal).display !== "none") || document.getElementById("sunsu-doc-viewer");
        var enfocado = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (!hayModal && !enfocado && /^#\/m\/inicio\b/.test(location.hash || "") && typeof window.draw === "function") {
          try { window.draw(); } catch (e) {}
        }
      });
      // Botón «atrás» no existe en iPhone; enlaces universales futuros: abrir la ruta interna.
      A.addListener("appUrlOpen", function (ev) {
        try {
          var u = new URL(ev.url);
          if (u.hash) location.hash = u.hash;
        } catch (e) {}
      });
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ API pública */
  window.SunsuNative = {
    isNative: true,
    platform: (Cap.getPlatform && Cap.getPlatform()) || "ios",
    camaraNativa: true,
    takePhoto: takePhoto,
    sharePdfBlob: sharePdfBlob,
    shareBlob: shareBlob,
    haptic: haptic,
    openExternal: openExternal,
    printHtml: printHtml,
    abrirVisor: abrirVisor,
  };

  /* ------------------------------------------------------------------ arranque */
  function alCargar() {
    envolverToast();
    tonoBarra();
    iniciarRed();
    iniciarCicloVida();
    try {
      new MutationObserver(function () { tonoBarra(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    } catch (e) {}
    var app = document.getElementById("app");
    if (app && app.children.length) later(ocultarSplash, 150);
    else if (app) {
      try {
        var mo = new MutationObserver(function () { if (app.children.length) { mo.disconnect(); later(ocultarSplash, 150); } });
        mo.observe(app, { childList: true });
      } catch (e) {}
    }
    later(ocultarSplash, 4000); // respaldo: nunca dejar el splash pegado
    later(envolverToast, 1500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", alCargar);
  else alCargar();
  window.addEventListener("sunsu:appReady", ocultarSplash);
  log("puente nativo iOS activo");
})();
