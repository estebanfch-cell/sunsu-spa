// 📄 Documentos A4 con el look Sunsu (Emilia 17/11): OC, cotización de proveedor, liquidación de consignación,
// pedido de restock y acta de entrega. Fondo crema, logo, títulos navy, tabla con cabecera navy, totales y
// firmas; banda celeste al pie con «Sunsu Spa | Glass Skin | Quito». Varias páginas en un solo PDF.
(function () {
  var NAVY = [61, 90, 122], CEL = [91, 127, 166], TXT = [58, 53, 48], GOLD = [138, 109, 26], GRIS = [130, 136, 150], CREMA = [253, 250, 241], ZEBRA = [246, 241, 228];
  function cargar() {
    return new Promise(function (res, rej) {
      var go = function () {
        if (typeof _gcdCargarJsPDF !== "function") { rej(new Error("No se pudo cargar el generador de PDF")); return; }
        _gcdCargarJsPDF(function (ok) { if (!ok || !window.jspdf) rej(new Error("No se pudo cargar el generador de PDF")); else res(); });
      };
      go();
    });
  }
  function logo() { return new Promise(function (res) { if (typeof _cotCargarLogo !== "function") { res(null); return; } try { _cotCargarLogo(function (l) { res(l || null); }); } catch (x) { res(null); } }); }
  function $m(v) { return "$" + (Math.round((Number(v) || 0) * 100) / 100).toFixed(2); }
  function txt(v) { return String(v == null ? "" : v); }

  function pagina(doc, pg, lg, W, H) {
    var m = 40, y = 28;
    var fondo = function () {
      doc.setFillColor(CREMA[0], CREMA[1], CREMA[2]); doc.rect(0, 0, W, H, "F");
      doc.setFillColor(CEL[0], CEL[1], CEL[2]); doc.rect(0, H - 30, W, 30, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
      doc.text("Sunsu Spa   |   Glass Skin   |   Quito", m, H - 12);
    };
    var nueva = function () { doc.addPage(); fondo(); return 44; };
    fondo();
    if (lg && lg.data && lg.w && lg.h) {
      var lw = 150, lh = lw * (lg.h / lg.w); if (lh > 42) { lh = 42; lw = lh * (lg.w / lg.h); }
      try { doc.addImage(lg.data, lg.fmt || "PNG", m, y, lw, lh); } catch (x) {}
    }
    // Título a la derecha, número en dorado
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text(txt(pg.titulo).toUpperCase(), W - m, y + 14, { align: "right" });
    if (pg.numero) { doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]); doc.setFontSize(11); doc.text(txt(pg.numero), W - m, y + 30, { align: "right" }); }
    if (pg.subt) { doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(doc.splitTextToSize(txt(pg.subt), 300), W - m, y + 43, { align: "right" }); }
    y += 62;
    doc.setDrawColor(CEL[0], CEL[1], CEL[2]); doc.setLineWidth(1); doc.line(m, y, W - m, y); y += 16;
    // Datos en dos columnas
    var info = pg.info || [];
    if (info.length) {
      var colW = (W - m * 2) / 2, filas = Math.ceil(info.length / 2), y0 = y, maxY = y;
      info.forEach(function (kv, i) {
        var cx = m + (i < filas ? 0 : colW), cy = y0 + (i % filas) * 15;
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
        doc.text(txt(kv[0]).toUpperCase(), cx, cy);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(TXT[0], TXT[1], TXT[2]);
        var v = doc.splitTextToSize(txt(kv[1]) || "—", colW - 95);
        doc.text(v[0], cx + 92, cy);
        maxY = Math.max(maxY, cy);
      });
      y = maxY + 18;
    }
    if (pg.aviso) {
      doc.setFillColor(ZEBRA[0], ZEBRA[1], ZEBRA[2]);
      var av = doc.splitTextToSize(txt(pg.aviso), W - m * 2 - 16);
      doc.roundedRect(m, y - 4, W - m * 2, av.length * 12 + 10, 4, 4, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.text(av, m + 8, y + 8); y += av.length * 12 + 18;
    }
    // Tabla
    var T = pg.tabla;
    if (T && T.cols && T.cols.length) {
      var ancho = W - m * 2, tot = T.cols.reduce(function (a, c) { return a + (c.w || 1); }, 0);
      var xs = [], acc = m; T.cols.forEach(function (c) { xs.push(acc); acc += ancho * (c.w || 1) / tot; }); xs.push(m + ancho);
      var cab = function () {
        doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]); doc.rect(m, y, ancho, 20, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
        T.cols.forEach(function (c, i) { var r = c.al === "r"; doc.text(txt(c.t), r ? xs[i + 1] - 6 : xs[i] + 6, y + 13, { align: r ? "right" : "left" }); });
        y += 20;
      };
      cab();
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      (T.filas || []).forEach(function (f, k) {
        var partes = f.map(function (v, i) { return T.cols[i].al === "r" ? [txt(v)] : doc.splitTextToSize(txt(v), xs[i + 1] - xs[i] - 12); });
        var alto = Math.max.apply(null, partes.map(function (p) { return p.length; })) * 11 + 9;
        if (y + alto > H - 60) { y = nueva(); cab(); doc.setFont("helvetica", "normal"); doc.setFontSize(9); }
        if (k % 2) { doc.setFillColor(ZEBRA[0], ZEBRA[1], ZEBRA[2]); doc.rect(m, y, ancho, alto, "F"); }
        doc.setTextColor(TXT[0], TXT[1], TXT[2]);
        partes.forEach(function (p, i) { var r = T.cols[i].al === "r"; doc.text(p, r ? xs[i + 1] - 6 : xs[i] + 6, y + 13, { align: r ? "right" : "left" }); });
        y += alto;
      });
      if (!(T.filas || []).length) { doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]); doc.text(txt(T.vacio || "Sin líneas"), m + 6, y + 14); y += 22; }
      doc.setDrawColor(CEL[0], CEL[1], CEL[2]); doc.setLineWidth(0.6); doc.line(m, y, W - m, y);
      y += 14;
    }
    // Totales
    (pg.totales || []).forEach(function (t) {
      if (y > H - 70) y = nueva();
      var big = !!t[2];
      doc.setFont("helvetica", big ? "bold" : "normal"); doc.setFontSize(big ? 12 : 9.5);
      doc.setTextColor(big ? NAVY[0] : TXT[0], big ? NAVY[1] : TXT[1], big ? NAVY[2] : TXT[2]);
      doc.text(txt(t[0]), W - m - 120, y, { align: "right" });
      doc.text(typeof t[1] === "number" ? $m(t[1]) : txt(t[1]), W - m, y, { align: "right" });
      y += big ? 18 : 14;
    });
    if (pg.notas && pg.notas.length) {
      y += 6;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
      pg.notas.forEach(function (nt) { var ls = doc.splitTextToSize(txt(nt), W - m * 2); if (y + ls.length * 11 > H - 60) y = nueva(); doc.text(ls, m, y); y += ls.length * 11 + 4; });
    }
    if (pg.firmas && pg.firmas.length) {
      var fy = Math.max(y + 30, H - 160); if (fy + 80 > H - 40) { y = nueva(); fy = H - 160; }
      var fw = (W - m * 2 - 30) / pg.firmas.length;
      pg.firmas.forEach(function (f, i) {
        var fx = m + i * (fw + 30);
        if (f.img) { try { doc.addImage(f.img, "PNG", fx + 10, fy - 6, fw - 20, 56); } catch (x) {} }
        doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]); doc.setLineWidth(0.8); doc.line(fx, fy + 54, fx + fw, fy + 54);
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
        doc.text(txt(f.label), fx + fw / 2, fy + 67, { align: "center" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(TXT[0], TXT[1], TXT[2]);
        doc.text(txt(f.nombre || (f.img ? "" : "Pendiente de firma")), fx + fw / 2, fy + 79, { align: "center" });
        if (f.fecha) doc.text(txt(f.fecha), fx + fw / 2, fy + 90, { align: "center" });
      });
    }
    if (pg.gracias !== false) { doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]); doc.text(txt(pg.gracias || "Gracias por ser parte de Sunsu Spa"), W / 2, H - 40, { align: "center" }); }
  }
  /** spec: { nombre, paginas: [{ titulo, numero, subt, info:[[k,v]], aviso, tabla:{cols:[{t,w,al}], filas:[[]]}, totales:[[k,v,big]], notas:[], firmas:[{label,nombre,img,fecha}] }] } */
  function generar(spec) {
    return cargar().then(logo).then(function (lg) {
      var doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      (spec.paginas || []).forEach(function (pg, i) { if (i) doc.addPage(); pagina(doc, pg, lg, W, H); });
      var N = doc.getNumberOfPages();
      if (N > 1) for (var i = 1; i <= N; i++) { doc.setPage(i); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(i + " / " + N, W - 40, H - 12, { align: "right" }); }
      return { doc: doc, nom: (spec.nombre || "Documento") + ".pdf" };
    });
  }
  function ver(titulo, spec) {
    if (window.MCPrevia && window.MCPrevia.pdf) { window.MCPrevia.pdf(titulo, function () { return generar(spec); }); return; }
    generar(spec).then(function (x) { if (typeof _entregarPDF === "function") _entregarPDF(x.doc, x.nom); else x.doc.save(x.nom); });
  }
  function bajar(spec) { return generar(spec).then(function (x) { x.doc.save(x.nom); return x; }); }
  window.MCDocPdf = { generar: generar, ver: ver, bajar: bajar, $m: $m };
})();
