// Escáner compartido (TK128): un solo módulo para Productos, Conteo, tickets, recepción y códigos.
// BarcodeDetector si existe; si no, ZXing vendido en /vendor-zxing.js (sin CDN, funciona en iOS Safari y en la PWA).
(function () {
  "use strict";
  var FORMATOS_BD = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];
  var vivo = false, stream = null, reader = null, torchOn = false, overlayEl = null;

  function toastScan(msg, mal) {
    if (typeof toast2 === "function") toast2(msg, mal ? 1 : 0);
    else if (typeof toast === "function") toast(msg, mal ? "#B86B6B" : "var(--navy)");
    else try { alert(msg); } catch (x) {}
  }
  function hayGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
  function msgSinCamara() {
    return "Este navegador no lee códigos con la cámara; escribe el código";
  }
  function msgPermiso() {
    return "Safari bloqueó la cámara. En el iPhone ve a Ajustes → Safari → Cámara y elige Permitir. Si abriste Sunsu desde la pantalla de inicio, entra a Ajustes, busca Sunsu y activa la Cámara.";
  }
  function esPermiso(err) {
    var n = String((err && (err.name || err.message)) || err || "");
    return /NotAllowed|PermissionDenied|PermissionDeniedError|Denied|denied|NotAllowedError/i.test(n);
  }
  function hintsZXing() {
    var Z = window.ZXing; if (!Z || !Z.DecodeHintType || !Z.BarcodeFormat) return undefined;
    var hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
      Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E,
      Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.QR_CODE
    ]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    return hints;
  }
  function cargarZXing(ok, fail) {
    if (window.ZXing && window.ZXing.BrowserMultiFormatReader) { ok(); return; }
    var sc = document.createElement("script");
    sc.src = "vendor-zxing.js?v=20261119tk147";
    sc.onload = function () { if (window.ZXing && window.ZXing.BrowserMultiFormatReader) ok(); else fail(new Error("zxing")); };
    sc.onerror = function () { fail(new Error("zxing")); };
    document.head.appendChild(sc);
  }
  function css() {
    if (document.getElementById("mcscan-css")) return;
    var s = document.createElement("style"); s.id = "mcscan-css";
    s.textContent =
      "#mcscan-ov{position:fixed;inset:0;z-index:10001;background:rgba(15,42,70,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;padding-top:max(20px,env(safe-area-inset-top));padding-bottom:max(20px,env(safe-area-inset-bottom));box-sizing:border-box}" +
      "#mcscan-ov .mcscan-tit{color:#fff;font-weight:800;font-size:.86rem;margin:0 0 12px;text-align:center}" +
      "#mcscan-vid{width:100%;max-width:420px;max-height:62vh;border-radius:16px;background:#000;object-fit:cover}" +
      "#mcscan-acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:14px;width:100%;max-width:420px}" +
      "#mcscan-ov button{min-height:44px;padding:10px 18px;border:0;border-radius:12px;font-weight:800;font-size:.82rem;cursor:pointer}" +
      "#mcscan-cancel{background:#fff;color:var(--navy,#153A5F)}" +
      "#mcscan-torch{background:var(--gold,#E8B84A);color:var(--navy,#153A5F)}" +
      "#mcscan-torch[hidden]{display:none!important}";
    document.head.appendChild(s);
  }
  function cerrar() {
    vivo = false;
    try { if (reader) { if (reader.stopContinuousDecode) reader.stopContinuousDecode(); if (reader.stopAsyncDecode) reader.stopAsyncDecode(); } } catch (x) {}
    reader = null;
    try {
      if (stream && window.SunsuMedia && typeof SunsuMedia.pausar === "function") SunsuMedia.pausar(stream);
      else if (stream) stream.getVideoTracks().forEach(function (t) { t.enabled = false; });
    } catch (x) {}
    var vid = document.getElementById("mcscan-vid");
    if (vid) vid.srcObject = null;
    if (overlayEl) { try { if (overlayEl.parentNode && overlayEl.parentNode.removeChild) overlayEl.parentNode.removeChild(overlayEl); else if (overlayEl.remove) overlayEl.remove(); } catch (x) {} }
    overlayEl = null;
    stream = null;
    torchOn = false;
  }
  function overlay() {
    css();
    var ov = document.createElement("div");
    ov.id = "mcscan-ov";
    ov.innerHTML = '<div class="mcscan-tit">📷 Apunta al código de barras</div>' +
      '<video id="mcscan-vid" playsinline muted autoplay></video>' +
      '<div id="mcscan-acts"><button type="button" id="mcscan-torch" hidden>Linterna</button>' +
      '<button type="button" id="mcscan-cancel">Cancelar</button></div>';
    document.body.appendChild(ov);
    overlayEl = ov;
    document.getElementById("mcscan-cancel").onclick = function () { cerrar(); };
    return ov;
  }
  function prepararVideo(st) {
    stream = st;
    var video = document.getElementById("mcscan-vid");
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = st;
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
    return video;
  }
  function hayTorch(st) {
    try {
      var tr = st && st.getVideoTracks && st.getVideoTracks()[0];
      var caps = tr && (tr.getCapabilities && tr.getCapabilities());
      return !!(caps && caps.torch);
    } catch (x) { return false; }
  }
  function wireTorch(st) {
    var btn = document.getElementById("mcscan-torch");
    if (!btn || !hayTorch(st)) return;
    btn.hidden = false;
    torchOn = false;
    btn.textContent = "Linterna";
    btn.onclick = function () {
      var tr = st.getVideoTracks()[0];
      torchOn = !torchOn;
      tr.applyConstraints({ advanced: [{ torch: torchOn }] }).catch(function () { torchOn = !torchOn; });
      btn.textContent = torchOn ? "Apagar linterna" : "Linterna";
    };
  }
  function leido(txt, cb) {
    if (!vivo) return;
    txt = String(txt || "").trim();
    if (!txt) return;
    vivo = false;
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (x) {}
    cerrar();
    cb(txt);
  }
  async function pedirCamara() {
    if (window.SunsuMedia && typeof SunsuMedia.camara === "function") return await SunsuMedia.camara("environment");
    return await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
  }
  function arrancarDetector(cb, fallback) {
    var det = null;
    try { det = new window.BarcodeDetector({ formats: FORMATOS_BD }); } catch (x) { det = null; }
    if (!det) { fallback(); return; }
    overlay();
    pedirCamara().then(function (st) {
      if (!vivo) { try { if (window.SunsuMedia) SunsuMedia.pausar(st); } catch (x) {} return; }
      var video = prepararVideo(st);
      wireTorch(st);
      var tick = function () {
        if (!vivo) return;
        det.detect(video).then(function (codes) {
          if (!vivo) return;
          if (codes && codes.length && codes[0].rawValue) { leido(codes[0].rawValue, cb); return; }
          setTimeout(tick, 180);
        }).catch(function () { if (vivo) setTimeout(tick, 180); });
      };
      setTimeout(tick, 200);
    }).catch(function (err) {
      cerrar();
      if (esPermiso(err)) toastScan(msgPermiso(), 1);
      else fallback();
    });
  }
  function arrancarZXing(cb) {
    overlay();
    var Z = window.ZXing;
    try { reader = hintsZXing() ? new Z.BrowserMultiFormatReader(hintsZXing()) : new Z.BrowserMultiFormatReader(); }
    catch (x) { reader = new Z.BrowserMultiFormatReader(); }
    pedirCamara().then(function (st) {
      if (!vivo) { try { if (window.SunsuMedia) SunsuMedia.pausar(st); } catch (x) {} return; }
      var video = prepararVideo(st);
      wireTorch(st);
      var onRes = function (result) {
        if (!vivo || !result) return;
        var txt = result.getText ? result.getText() : (result.text || String(result));
        if (txt) leido(txt, cb);
      };
      if (reader.decodeFromVideoElementContinuously) {
        reader.decodeFromVideoElementContinuously(video, function (result) { if (result) onRes(result); });
        return;
      }
      reader.decodeFromStream(st, video, function (result, err) { if (result) onRes(result); }).catch(function (err) {
        cerrar();
        if (esPermiso(err)) toastScan(msgPermiso(), 1);
        else toastScan("No se pudo abrir la cámara", 1);
      });
    }).catch(function (err) {
      cerrar();
      if (esPermiso(err)) toastScan(msgPermiso(), 1);
      else toastScan("No se pudo abrir la cámara", 1);
    });
  }
  function abrir(cb) {
    if (typeof cb !== "function") return;
    if (!hayGetUserMedia()) { toastScan(msgSinCamara(), 1); return; }
    if (vivo) cerrar();
    vivo = true;
    if (typeof window.BarcodeDetector === "function") {
      arrancarDetector(cb, function () {
        if (!vivo) { vivo = true; }
        cargarZXing(function () { arrancarZXing(cb); }, function () { cerrar(); toastScan("No se pudo cargar el escáner", 1); });
      });
      return;
    }
    cargarZXing(function () { arrancarZXing(cb); }, function () { cerrar(); toastScan("No se pudo cargar el escáner", 1); });
  }

  window.MCScan = {
    abrir: abrir,
    hayCamara: hayGetUserMedia,
    _msgSinCamara: msgSinCamara,
    _msgPermiso: msgPermiso
  };
  window._scanAbrir = function (cb) { abrir(cb); };
})();
