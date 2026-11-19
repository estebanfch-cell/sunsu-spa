/* TK145: motivo de descuento en Nuevo/Editar ticket (dropdown + reglas de no bloquear). */
(function (root) {
  var OPS = [
    { id: "giftcard", label: "Gift card" },
    { id: "promo", label: "Promoción" },
    { id: "cortesia", label: "Cortesía" },
    { id: "ff", label: "Friends & Family" },
    { id: "directo", label: "Pago directo" },
    { id: "otra", label: "Otra (especificar)" }
  ];
  function n(v) { return Number(v) || 0; }
  function hayGift(t) {
    if (!t) return false;
    if (t.cobro === "giftcard") return true;
    if (n(t._gcUsado) > 0 || n(t.gcAplica) > 0) return true;
    if (String(t.codigoGC || "").trim()) return true;
    return false;
  }
  function hayPaquete(t) { return !!(t && t.cobro === "paquete"); }
  function hayCortesia(t) { return !!(t && t.cobro === "cortesia"); }
  function hayFF(t) { return !!(t && t.descuento && t.descuento.tipo === "ff"); }
  function hayDirecto(t) { return !!(t && t.descuento && t.descuento.tipo === "directo"); }
  function hayPromoAuto(t) {
    if (t && t._promoIds && t._promoIds.length) return true;
    var ld = (t && t.lineDesc) || {};
    return Object.keys(ld).some(function (k) {
      var d = ld[k];
      return d && d.promo && n(d.v || d.monto) > 0;
    });
  }
  function customMonto(t, dscMonto) {
    var d = t && t.descuento;
    if (!d || d.tipo !== "custom") return 0;
    if (d.customMode === "pct") return n(d.customPct) > 0 ? n(dscMonto) || 1 : 0;
    return n(d.custom);
  }
  function lineasManuales(t) {
    var ld = (t && t.lineDesc) || {};
    return Object.keys(ld).filter(function (k) {
      var d = ld[k];
      return d && !d.promo && n(d.v || d.monto || d.valor) > 0;
    });
  }
  function motivoAuto(t) {
    if (hayGift(t)) return "giftcard";
    if (hayCortesia(t)) return "cortesia";
    if (hayFF(t)) return "ff";
    if (hayDirecto(t)) return "directo";
    if (hayPromoAuto(t) && !lineasManuales(t).length && customMonto(t, 0) <= 0.004) return "promo";
    return "";
  }
  /* True solo si hay un descuento manual > $0 (o «Otra») que ellas tienen que explicar. */
  function pideJustificacion(t, dscMonto) {
    if (hayGift(t) || hayPaquete(t) || hayCortesia(t) || hayFF(t) || hayDirecto(t)) return false;
    if (hayPromoAuto(t) && !lineasManuales(t).length && customMonto(t, dscMonto) <= 0.004) return false;
    if (customMonto(t, dscMonto) > 0.004) return true;
    if (lineasManuales(t).length) return true;
    if (t && t._migoHayDescuento) return true;
    return false;
  }
  function aplicarAutoMotivo(t) {
    t = t || {};
    var auto = motivoAuto(t);
    if (auto && !t.justificacionMotivo) t.justificacionMotivo = auto;
    return t;
  }
  function textoJustificacion(t) {
    t = t || {};
    var id = t.justificacionMotivo || "";
    if (id === "otra") return String(t.justificacionOtra || t.justificacionDescuento || "").trim();
    var op = null;
    for (var i = 0; i < OPS.length; i++) if (OPS[i].id === id) op = OPS[i];
    if (op) return op.label;
    return String(t.justificacionDescuento || "").trim();
  }
  function justificacionOk(t, dscMonto) {
    aplicarAutoMotivo(t);
    if (!pideJustificacion(t, dscMonto)) return true;
    var id = (t && t.justificacionMotivo) || "";
    if (id === "otra") return String((t && (t.justificacionOtra || t.justificacionDescuento)) || "").trim().length > 0;
    if (id) return true;
    return String((t && t.justificacionDescuento) || "").trim().length > 0;
  }
  var api = {
    OPS: OPS,
    hayGift: hayGift,
    hayPaquete: hayPaquete,
    hayPromoAuto: hayPromoAuto,
    customMonto: customMonto,
    lineasManuales: lineasManuales,
    motivoAuto: motivoAuto,
    pideJustificacion: pideJustificacion,
    aplicarAutoMotivo: aplicarAutoMotivo,
    textoJustificacion: textoJustificacion,
    justificacionOk: justificacionOk
  };
  root.SunsuDescJustif = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
