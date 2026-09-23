// ============================================================

const CONFIG = {
  SHEET_TICKET:        "🎫 TICKET_FICHA",
  SHEET_CATALOGO:      "📦 CATALOGO",
  COL_TIMESTAMP:       1,
  COL_COSMETOLOGA:     2,
  COL_ID_CLIENTE:      3,
  COL_ESTIMADO:        10,  // col J = $$ ESTIMADO (actual cobrado)
  COL_FACIAL:          20,
  COL_PACK3:           21,
  COL_PACK6:           22,
  COL_EXTRAS:          23,  // W — extras/add-ons vendidos (texto separado por |)
  // ── Comisión de recepción (Alejandra) ──
  RECEPCIONISTA:            "Alejandra Rodriguez",
  RECEP_COM_POR_CLIENTA:    0.50, // $ por clienta atendida en día que cumple la meta
  RECEP_MIN_CLIENTAS:       10,   // meta diaria (clientas con ticket) — 10 o más
  RECEP_MIN_CLIENTAS_LUNES: 5,    // meta para lunes — 5 o más
  COL_PRODUCTOS_START: 25,
  // ℹ️ Desde jul/2026 las columnas EXCLUIR se detectan AUTOMÁTICAMENTE por su
  // encabezado ('❌ EXCLUIR ...') vía exclColsFromHeaders_(). Estos valores son
  // solo fallback si los encabezados no se encuentran. Actual: BS=71, BT=72, BU=73.
  COL_EXCLUIR_FACIAL:   71,  // BS — checkbox excluir facial de comisión
  COL_EXCLUIR_PAQUETE:  72,  // BT — checkbox excluir paquete de comisión
  COL_EXCLUIR_PRODUCTO: 73,  // BU — checkbox excluir productos de comisión
  COL_EXCLUIR_EXTRAS:   74,  // BV — checkbox excluir extras de comisión
  SHEET_MULTAS: "📋 MULTAS Y DESCUENTOS",
  FACIALES_2: ["SUNSU-01","SUNSU-02","SUNSU-03","SUNSU-04","SUNSU-05","SUNSU-06"],
  FACIALES_3: ["SUNSU-40","SUNSU-41","SUNSU-42","SUNSU-43","SUNSU-52"],
  NIVELES: [
    [0.05,  5],[0.10, 20],[0.15, 45],[0.20, 80],[0.25, 125],
    [0.30, 180],[0.40, 245],[0.50, 320],[0.60, 405],[0.80, 500],
  ],
  MIN_CLIENTAS_BONO: 60,
};

// ══════ SELLO DE VERSIÓN — consultar con ?action=version para verificar despliegues ══════
var APP_VERSION = '2026-09-23-CD (compra directa → cabina, no inventario ventas)';

// Fecha tolerante: celda de fecha nativa O texto ('17/07/2026', '5/7/26',
// '2026-07-17', con o sin hora). Devuelve Date o null.
function _fechaDe_(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  var s = (v==null?'':v).toString().trim();
  if (!s) return null;
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { var y=parseInt(m[3]); if (y<100) y+=2000; return new Date(y, parseInt(m[2])-1, parseInt(m[1])); }
  var m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return new Date(parseInt(m2[1]), parseInt(m2[2])-1, parseInt(m2[3]));
  return null;
}

// ══════ MAPEO DINÁMICO DE COLUMNAS (lee encabezados de TICKET_FICHA) ══════
// Con esto, agregar productos nuevos en TICKET_FICHA NO requiere tocar código:
// los encabezados (ej. 'SU-008') definen las columnas automáticamente.
function prodColsFromHeaders_(headers) {
  var m = {};
  for (var i = 0; i < headers.length; i++) {
    var hs = (headers[i]||'').toString().trim().toUpperCase();
    var code = hs.replace(/^SUNSU-/, '');
    if (/^[A-Z]{2,3}-\d{3}$/.test(code)) {
      m['SUNSU-'+code] = i + 1; // 1-based
      m[code] = i + 1;
    }
  }
  return m;
}
// Código pelado FAM-### a partir de SKU con o sin prefijo SUNSU-
function _skuCodigoProd_(sku) {
  var s = (sku||'').toString().trim().toUpperCase().replace(/^SUNSU-/, '');
  return /^[A-Z]{2,3}-\d{3}$/.test(s) ? s : '';
}
// Inserta la columna del producto en TICKET_FICHA si no existe.
// Nunca borra columnas históricas: solo inserta DESPUÉS de la última de su familia
// (familia nueva → después del último producto). Devuelve índice 1-based o 0.
function _insertarColumnaProducto_(wsTk, codNP) {
  if (!wsTk) return 0;
  codNP = _skuCodigoProd_(codNP);
  if (!codNP) return 0;
  var hdrNP = wsTk.getRange(1, 1, 1, wsTk.getLastColumn()).getValues()[0];
  var hn, hTk;
  for (hn = 0; hn < hdrNP.length; hn++) {
    hTk = (hdrNP[hn]||'').toString().trim().toUpperCase().replace(/^SUNSU-/, '');
    if (hTk === codNP) return hn + 1;
  }
  var famNP = codNP.split('-')[0];
  var ultProd = 0, ultFamTk = 0;
  for (hn = 0; hn < hdrNP.length; hn++) {
    hTk = (hdrNP[hn]||'').toString().trim().toUpperCase().replace(/^SUNSU-/, '');
    if (/^[A-Z]{2,3}-\d{3}$/.test(hTk)) {
      ultProd = hn + 1;
      if (hTk.indexOf(famNP+'-') === 0) ultFamTk = hn + 1;
    }
  }
  if (!ultProd) return 0;
  var insTk = ultFamTk || ultProd;
  wsTk.insertColumnAfter(insTk);
  wsTk.getRange(1, insTk+1).setValue(codNP).setFontWeight('bold');
  return insTk + 1;
}
// Repara columnas faltantes de TICKET_FICHA para todo PRODUCTO activo FAM-### del CATALOGO.
// No toca columnas existentes. Usa lock para no duplicar si dos apps abren a la vez.
function _repararColumnasTicketFicha_(ss) {
  var lock = null;
  try { lock = LockService.getScriptLock(); if (!lock.tryLock(8000)) return {ok:false, error:'lock'}; } catch (eLk) {}
  try {
    var wsCat = ss.getSheets().find(function(s){ return s.getName().includes('CATALOGO'); });
    var wsTk  = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
    if (!wsCat || !wsTk) return {ok:false, error:'hojas'};
    var catData = wsCat.getDataRange().getValues();
    var hdrs = wsTk.getRange(1, 1, 1, wsTk.getLastColumn()).getValues()[0];
    var have = {};
    for (var i = 0; i < hdrs.length; i++) {
      var c = _skuCodigoProd_(hdrs[i]);
      if (c) have[c] = true;
    }
    var faltan = [];
    for (var r = 2; r < catData.length; r++) {
      var code = _skuCodigoProd_(catData[r][0]);
      if (!code) continue;
      var tipo = String(catData[r][2]||'').trim().toUpperCase();
      if (tipo && tipo !== 'PRODUCTO') continue;
      var activoRaw = catData[r][9];
      var activo = !(activoRaw===false || activoRaw==='FALSE' || activoRaw===0);
      if (!activo) continue;
      if (!have[code]) faltan.push(code);
    }
    var creadas = [];
    for (var f = 0; f < faltan.length; f++) {
      var col = _insertarColumnaProducto_(wsTk, faltan[f]);
      if (col) { creadas.push(faltan[f]); have[faltan[f]] = true; }
    }
    return {ok:true, creadas:creadas, faltaban:faltan.length};
  } finally {
    try { if (lock) lock.releaseLock(); } catch (eRel) {}
  }
}

function exclColsFromHeaders_(headers) {
  // Busca las columnas '❌ EXCLUIR ...' por nombre; fallback a CONFIG si no aparecen
  var e = {facial: CONFIG.COL_EXCLUIR_FACIAL, paquete: CONFIG.COL_EXCLUIR_PAQUETE, producto: CONFIG.COL_EXCLUIR_PRODUCTO, extras: CONFIG.COL_EXCLUIR_EXTRAS};
  for (var i = 0; i < headers.length; i++) {
    var hs = (headers[i]||'').toString();
    if (hs.indexOf('EXCLUIR FACIAL') >= 0) e.facial = i + 1;
    else if (hs.indexOf('EXCLUIR PAQUETE') >= 0) e.paquete = i + 1;
    else if (hs.indexOf('EXCLUIR PRODUCTO') >= 0) e.producto = i + 1;
    else if (hs.indexOf('EXCLUIR EXTRAS') >= 0) e.extras = i + 1;
  }
  return e;
}
// Cuenta los extras vendidos en la col W de un ticket.
// Formato: "SUNSU-07 Dermaplaning | SUNSU-12 Ampolla [CORTESIA] | OTRO: xyz"
// Las cortesías NO comisionan (no fueron vendidas). Se detectan por '[CORTESIA'
// o por la palabra 'Cortesía' en texto libre (formato de tickets antiguos).
function contarExtrasVendidos_(extrasStr) {
  var s = (extrasStr||'').toString().trim();
  if (!s || s.toLowerCase() === 'false') return 0;
  var n = 0;
  s.split('|').forEach(function(part){
    var p = part.trim();
    if (!p) return;
    if (p.toUpperCase().indexOf('CORTES') >= 0) return; // [CORTESIA...], 'Cortesía por...', etc.
    n++;
  });
  return n;
}
// Reconstruye la fórmula de estado (col M) en TODAS las filas de TICKET_FICHA,
// con prioridad a la columna SEGUIMIENTO (motivo escrito por el app: no desea / sin respuesta).
// Crea la columna SEGUIMIENTO si no existe. También repara filas nuevas sin fórmula.
function actualizarFormulasSeguimiento() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
  if (!ws) { ss.toast('No se encontró TICKET_FICHA','SUNSU',5); return; }
  var hdrs = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
  var colSeg = 0;
  for (var i = 0; i < hdrs.length; i++) { if ((hdrs[i]||'').toString().toUpperCase().indexOf('SEGUIMIENTO') >= 0) { colSeg = i + 1; break; } }
  if (!colSeg) {
    colSeg = Math.max(ws.getLastColumn() + 1, 75); // BW o siguiente libre (74 reservada para EXCLUIR EXTRAS)
    ws.getRange(1, colSeg).setValue('SEGUIMIENTO');
  }
  var letra = columnaLetra_(colSeg);
  var last = ws.getLastRow();
  if (last < 2) return;
  var formulas = [];
  for (var r = 2; r <= last; r++) {
    formulas.push(['=IF('+letra+r+'<>"",'+letra+r+',IF(K'+r+'="","",IF(L'+r+'=TRUE,"✅ Agendada",IF(K'+r+'<=EDATE(TODAY(),-6),"⛔ No ha regresado",IF(K'+r+'<TODAY(),"🔴 Atrasada",IF(K'+r+'<=TODAY()+7,"🟡 Próxima","🟢 A tiempo"))))))']);
  }
  ws.getRange(2, 13, formulas.length, 1).setFormulas(formulas);
  ss.toast('✅ Fórmulas de estado actualizadas en '+formulas.length+' filas (override en col '+letra+')','SUNSU',8);
}

// ── Control de recepción AUTOMÁTICO (trigger diario) ──
// Actualiza la tabla cada noche. Al llegar el día 26 (nuevo período), archiva la
// tabla del período terminado como '💁 RECEP <Mes><Año>' y arranca una fresca.
function controlRecepcionDiario() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    var hoy = new Date();
    var dia = hoy.getDate(), mes = hoy.getMonth(), anio = hoy.getFullYear();
    var fFin = (dia >= 26) ? new Date(anio, mes + 1, 25) : new Date(anio, mes, 25);
    var mesesR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    var perKey = mesesR[fFin.getMonth()] + String(fFin.getFullYear()).slice(2); // ej. 'Jul26' (mes de cierre)
    var props = PropertiesService.getScriptProperties();
    var prev = props.getProperty('RECEP_PERIODO_ACTUAL');
    if (prev && prev !== perKey) {
      // Cambió el período → los días del período cerrado pasan al HISTÓRICO
      // dentro de la MISMA hoja (nunca más pestañas nuevas por mes).
      try {
        var mIdxP = mesesR.indexOf(prev.slice(0,3));
        var aP = 2000 + parseInt(prev.slice(3),10);
        if (mIdxP >= 0 && aP > 2000) {
          var fFinP = new Date(aP, mIdxP, 25, 23,59,59);
          var fIniP = new Date(aP, mIdxP-1, 26, 0,0,0);
          var resP = calcularComisionRecepcion(fIniP, fFinP);
          var wsHP = ss.getSheetByName('💁 RECEPCIÓN');
          if (wsHP && resP && resP.dias) {
            resP.dias.forEach(function(dP){
              wsHP.appendRow([prev, dP.fecha, dP.dia, dP.clientas, (dP.cumple?'✅ ':'—  ')+'≥'+dP.umbral, dP.comision]);
            });
          }
          logAccion_(ss, '💁 RECEPCIÓN', 'período ' + prev + ' cerrado → histórico en la misma hoja ('+(resP.dias||[]).length+' días, $'+resP.total.toFixed(2)+')', 'trigger');
        }
      } catch(eArc) { Logger.log('cierre recep: '+eArc.message); }
    }
    props.setProperty('RECEP_PERIODO_ACTUAL', perKey);
    generarControlRecepcion();
  } catch(eCR) { Logger.log('controlRecepcionDiario: ' + eCR.message); }
}
function instalarControlRecepcionDiario() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'controlRecepcionDiario') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('controlRecepcionDiario').timeBased().everyDays(1).atHour(21).create();
  controlRecepcionDiario();
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ Control de recepción automático activado (diario 9pm). Al cambiar de período la tabla vieja se archiva sola.','SUNSU',10);
}

// Genera/actualiza la hoja '💁 RECEPCIÓN' con el control diario del período actual
function generarControlRecepcion() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoy = new Date();
  var dia = hoy.getDate(), mes = hoy.getMonth(), anio = hoy.getFullYear();
  var fIni, fFin;
  if (dia >= 26) { fIni = new Date(anio, mes, 26, 0,0,0); fFin = new Date(anio, mes+1, 25, 23,59,59); }
  else { fIni = new Date(anio, mes-1, 26, 0,0,0); fFin = new Date(anio, mes, 25, 23,59,59); }
  var meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  var res = calcularComisionRecepcion(fIni, fFin);
  var nombre = '💁 RECEPCIÓN';
  var ws = ss.getSheetByName(nombre);
  if (!ws) ws = ss.insertSheet(nombre);
  // ── UNA SOLA HOJA ── 1) Rescatar el HISTÓRICO ya guardado (bajo el marcador)
  var histR = [];
  var vistoR = {};
  var pushHist = function(fila6){
    var kH = (fila6[0]||'')+'|'+(fila6[1]||'');
    if (!kH.replace('|','').trim() || vistoR[kH]) return;
    vistoR[kH] = true;
    histR.push(fila6);
  };
  try {
    var dPrevR = ws.getDataRange().getValues();
    var mkR = -1;
    for (var ihr = 0; ihr < dPrevR.length; ihr++) {
      if ((dPrevR[ihr][0]||'').toString().indexOf('HISTÓRICO') >= 0) { mkR = ihr; break; }
    }
    if (mkR >= 0) {
      for (var jhr = mkR+1; jhr < dPrevR.length; jhr++) {
        var c0R = (dPrevR[jhr][0]||'').toString().trim();
        if (!c0R || c0R === 'PERÍODO') continue;
        pushHist(dPrevR[jhr].slice(0,6));
      }
    } else {
      // Filas appendeadas al cierre antes de existir el marcador (6 celdas al fondo)
      for (var jhr2 = 0; jhr2 < dPrevR.length; jhr2++) {
        var rR2 = dPrevR[jhr2];
        if ((rR2[0]||'').toString().match(/^[A-Z][a-z]{2}\d{2}$/) && rR2[1]) pushHist(rR2.slice(0,6));
      }
    }
  } catch(eHR) {}
  // 2) Migración one-time: absorber y borrar las pestañas archivadas '💁 RECEP '
  try {
    ss.getSheets().slice().forEach(function(sM){
      var nM = sM.getName();
      if (nM.indexOf('💁 RECEP ') !== 0) return;
      var perM = nM.replace('💁 RECEP ','').trim();
      var dM = sM.getDataRange().getValues();
      for (var kM = 3; kM < dM.length; kM++) {
        var f0M = (dM[kM][0]||'').toString().trim();
        if (!f0M || f0M.indexOf('TOTAL') === 0 || f0M.indexOf('Sin tickets') === 0) continue;
        pushHist([perM, f0M, (dM[kM][1]||'').toString(), dM[kM][2]||0, (dM[kM][3]||'').toString(), dM[kM][4]||0]);
      }
      ss.deleteSheet(sM);
      logAccion_(ss, '💁 RECEPCIÓN', 'pestaña "'+nM+'" absorbida al histórico y eliminada', 'sistema');
    });
  } catch(eMR) {}
  ws.clear();
  var fila = 1;
  ws.getRange(fila,1,1,5).merge().setValue('CONTROL COMISIÓN RECEPCIÓN — ' + CONFIG.RECEPCIONISTA.toUpperCase())
    .setBackground(COLOR.NAVY_D).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(12)
    .setFontFamily('Arial').setHorizontalAlignment('center');
  ws.setRowHeight(fila,32); fila++;
  ws.getRange(fila,1,1,5).merge().setValue('Período: '+meses[fIni.getMonth()]+' 26 — '+meses[fFin.getMonth()]+' 25, '+fFin.getFullYear()
    +'   |   $'+CONFIG.RECEP_COM_POR_CLIENTA.toFixed(2)+' por clienta con facial   |   Meta: ≥'+CONFIG.RECEP_MIN_CLIENTAS+' faciales ('+'lunes ≥'+CONFIG.RECEP_MIN_CLIENTAS_LUNES+')')
    .setBackground(COLOR.BLUE_L).setFontColor(COLOR.NAVY_D).setFontSize(9).setFontFamily('Arial').setHorizontalAlignment('center');
  fila++;
  ['FECHA','DÍA','CLIENTAS\nCON FACIAL','META','COMISIÓN'].forEach(function(h,i){
    ws.getRange(fila,i+1).setValue(h).setBackground(COLOR.NAVY).setFontColor('#FFFFFF')
      .setFontWeight('bold').setFontSize(8).setFontFamily('Arial').setHorizontalAlignment('center').setWrap(true);
  });
  ws.setRowHeight(fila,32); fila++;
  var filaIni = fila;
  res.dias.forEach(function(d,i){
    var bg = d.cumple ? '#EDF5F1' : (i%2===0 ? '#F8F8F6' : '#FFFFFF');
    ws.getRange(fila,1).setValue(d.fecha).setBackground(bg).setFontSize(9).setFontFamily('Arial').setHorizontalAlignment('center');
    ws.getRange(fila,2).setValue(d.dia).setBackground(bg).setFontSize(9).setFontFamily('Arial').setHorizontalAlignment('center');
    ws.getRange(fila,3).setValue(d.clientas).setBackground(bg).setFontSize(9).setFontFamily('Arial').setHorizontalAlignment('center').setFontWeight('bold');
    ws.getRange(fila,4).setValue((d.cumple?'✅ ':'—  ')+'≥'+d.umbral).setBackground(bg).setFontSize(9).setFontFamily('Arial').setHorizontalAlignment('center');
    ws.getRange(fila,5).setValue(d.comision).setBackground(bg).setNumberFormat('"$"#,##0.00').setFontSize(9).setFontFamily('Arial')
      .setFontColor(d.cumple?COLOR.GREEN_TXT:COLOR.GRAY_DARK).setHorizontalAlignment('right').setFontWeight(d.cumple?'bold':'normal');
    fila++;
  });
  if (!res.dias.length) {
    ws.getRange(fila,1,1,5).merge().setValue('Sin tickets registrados en el período')
      .setFontColor(COLOR.GRAY_DARK).setFontStyle('italic').setFontSize(9).setFontFamily('Arial');
    fila++;
  }
  ws.getRange(fila,1,1,4).merge().setValue('TOTAL ('+res.diasCumplidos+' día'+(res.diasCumplidos===1?'':'s')+' con meta cumplida)')
    .setBackground(COLOR.NAVY_D).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(10).setFontFamily('Arial');
  ws.getRange(fila,5).setValue(res.total).setBackground(COLOR.NAVY_D).setFontColor('#FFFFFF')
    .setFontWeight('bold').setNumberFormat('"$"#,##0.00').setFontSize(11).setFontFamily('Arial').setHorizontalAlignment('right');
  // ── HISTÓRICO: base de datos de períodos cerrados, en la MISMA hoja ──
  fila += 2;
  ws.getRange(fila,1,1,6).merge().setValue('═ HISTÓRICO ═ períodos cerrados (base de datos)')
    .setBackground(COLOR.NAVY).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(10)
    .setFontFamily('Arial').setHorizontalAlignment('center');
  ws.setRowHeight(fila,26); fila++;
  ['PERÍODO','FECHA','DÍA','CLIENTAS','META','COMISIÓN'].forEach(function(h,i){
    ws.getRange(fila,i+1).setValue(h).setBackground(COLOR.BLUE_L).setFontColor(COLOR.NAVY_D)
      .setFontWeight('bold').setFontSize(8).setFontFamily('Arial').setHorizontalAlignment('center');
  });
  fila++;
  if (histR.length) {
    ws.getRange(fila,1,histR.length,6).setValues(histR).setFontSize(9).setFontFamily('Arial');
    ws.getRange(fila,6,histR.length,1).setNumberFormat('"$"#,##0.00');
    ws.getRange(fila,1,histR.length,1).setNumberFormat('@');
    ws.getRange(fila,2,histR.length,1).setNumberFormat('@');
    fila += histR.length;
  } else {
    ws.getRange(fila,1,1,6).merge().setValue('Aún sin períodos cerrados — al cerrar cada período sus días se guardan aquí automáticamente')
      .setFontColor(COLOR.GRAY_DARK).setFontStyle('italic').setFontSize(9).setFontFamily('Arial');
    fila++;
  }
  [90,80,60,70,70,85].forEach(function(w,i){ ws.setColumnWidth(i+1,w); });
  ss.toast('✅ Control de recepción actualizado — Total: $'+res.total.toFixed(2)+' · histórico: '+histR.length+' días', 'SUNSU', 10);
}

// Al marcar manualmente el check de revisado (col P) en TICKET_FICHA,
// el color rojo de alerta de esa fila se borra al instante.
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getName().indexOf('TICKET_FICHA') < 0) return;
    if (e.range.getColumn() !== 16 || e.range.getNumColumns() !== 1) return; // col P
    var v = e.range.getValue();
    if (v === true || v === 'TRUE') {
      sh.getRange(e.range.getRow(), 1, e.range.getNumRows(), 16).setBackground(null);
    }
  } catch(eOE) {}
}

// ══════ KPIs HISTÓRICOS — motor que procesa todos los archivos de Mi Negocio ══════
// Lee cada '20XX-MM.xls' de la carpeta SUNSU FACTURAS MN, cruza con tickets, paquetes
// y los valores de nómina/comisiones de CONFIGURACION, y guarda la serie en 📈 KPI_DATA.
// Trigger semanal: regenera los KPIs históricos cada lunes de madrugada,
// así el dashboard siempre refleja los archivos MN y tickets más recientes.
function instalarKPIsSemanales() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'generarKPIsHistoricos') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('generarKPIsHistoricos').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(4).create();
  generarKPIsHistoricos();
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ KPIs históricos automáticos activados (lunes 4am) — primera corrida lista','SUNSU',10);
}

function generarKPIsHistoricos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('📈 Procesando archivos de Mi Negocio... esto puede tomar 1-2 minutos','SUNSU',8);

  // ── 1. Archivos de la carpeta, ordenados por período ──
  var iterK = DriveApp.searchFolders('title contains "SUNSU FACTURAS MN" and trashed = false');
  var carpetaK = null, carpetaVaciaK = null;
  while (iterK.hasNext()) {
    var candK = iterK.next();
    if (candK.getFiles().hasNext()) { carpetaK = candK; break; }
    if (!carpetaVaciaK) carpetaVaciaK = candK;
  }
  if (!carpetaK) { ss.toast('No encontré la carpeta SUNSU FACTURAS MN con archivos','SUNSU',10); return; }
  var archivosK = [];
  var filesK = carpetaK.getFiles();
  while (filesK.hasNext()) {
    var fK = filesK.next();
    var mK = fK.getName().match(/(20\d{2})[-_\s]?(0[1-9]|1[0-2])/);
    if (mK && fK.getName().indexOf('tmp_conciliacion') !== 0) archivosK.push({per: mK[1]+'-'+mK[2], file: fK});
  }
  if (!archivosK.length) { ss.toast('Ningún archivo con período (AAAA-MM) en el nombre','SUNSU',10); return; }
  archivosK.sort(function(a,b){ return a.per.localeCompare(b.per); });

  // ── 2. Procesar cada archivo ──
  var meses = {};          // per → agregados
  var primeraVisita = {};  // cédula → primer período
  var prodGlobal = {};     // sku|nombre → {n, u, ing}
  var prodPorAno = {};     // año → {key → {n,u,ing}}
  var DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  archivosK.forEach(function(af){
    var data = null;
    try {
      if (af.file.getMimeType() === MimeType.GOOGLE_SHEETS) {
        data = SpreadsheetApp.openById(af.file.getId()).getSheets()[0].getDataRange().getValues();
      } else {
        var tmpK = _convertirXlsASheet_(af.file.getId());
        if (tmpK) {
          data = SpreadsheetApp.openById(tmpK).getSheets()[0].getDataRange().getValues();
          DriveApp.getFileById(tmpK).setTrashed(true);
        }
      }
    } catch(eK) {}
    if (!data) return;
    // Encabezados por nombre
    var hR=-1, ix={};
    for (var h=0; h<Math.min(10,data.length); h++) {
      for (var c=0; c<data[h].length; c++) {
        var hv=(data[h][c]||'').toString().toLowerCase();
        if (hv.indexOf('num')>=0 && hv.indexOf('factura')>=0) { hR=h; ix.num=c; }
        if (hR===h) {
          if (hv==='fecha') ix.fecha=c;
          if (hv.indexOf('número de identific')>=0||hv.indexOf('numero de identific')>=0) ix.ced=c;
          if (hv==='producto') ix.prod=c;
          if (hv.indexOf('cod')>=0&&hv.indexOf('producto')>=0) ix.sku=c;
          if (hv==='cantidad') ix.cant=c;
          if (hv==='subtotal') ix.sub=c;
          if (hv==='total') ix.tot=c;
        }
      }
      if (hR>=0) break;
    }
    if (hR<0 || ix.tot===undefined) return;
    var M = meses[af.per] = meses[af.per] || {ingSin:0, ingCon:0, facturas:{}, clientas:{}, cats:{Faciales:0,Productos:0,Paquetes:0,'Gift Cards':0}, porDia:[0,0,0,0,0,0,0], prods:{}};
    for (var r=hR+1; r<data.length; r++) {
      var row=data[r];
      var tot=parseFloat(row[ix.tot]); if(!row[ix.num]||isNaN(tot)) continue;
      var sub=parseFloat(row[ix.sub])||0;
      M.ingSin+=sub; M.ingCon+=tot;
      M.facturas[_normFac_(row[ix.num])]=1;
      var ced=(ix.ced!==undefined?(row[ix.ced]||''):'').toString().trim();
      if(ced){ M.clientas[ced]=1; if(!primeraVisita[ced]||af.per<primeraVisita[ced]) primeraVisita[ced]=af.per; }
      var nomP=(ix.prod!==undefined?(row[ix.prod]||''):'').toString().trim();
      var skuP=(ix.sku!==undefined?(row[ix.sku]||''):'').toString().trim();
      var cant=parseFloat(ix.cant!==undefined?row[ix.cant]:1)||1;
      var nomU=nomP.toUpperCase();
      var cat = (nomU.indexOf('X3')>=0||nomU.indexOf('X6')>=0||nomU.indexOf('PAQ')>=0) ? 'Paquetes'
        : (nomU.indexOf('GIFT')>=0) ? 'Gift Cards'
        : (nomU.indexOf('FACIAL')>=0||nomU.indexOf('LIMPIEZA')>=0) ? 'Faciales' : 'Productos';
      M.cats[cat]+=tot;
      var keyP=(skuP||nomP);
      if(keyP){
        var g=prodGlobal[keyP]=prodGlobal[keyP]||{n:nomP||skuP,u:0,ing:0};
        g.u+=cant; g.ing+=tot;
        var mp=M.prods[keyP]=M.prods[keyP]||{n:nomP||skuP,u:0,ing:0};
        mp.u+=cant; mp.ing+=tot;
        var anoP2=af.per.slice(0,4);
        var pa=prodPorAno[anoP2]=prodPorAno[anoP2]||{};
        var ga=pa[keyP]=pa[keyP]||{n:nomP||skuP,u:0,ing:0};
        ga.u+=cant; ga.ing+=tot;
      }
      var fe=row[ix.fecha];
      if(fe instanceof Date) M.porDia[fe.getDay()]+=tot;
    }
  });

  // ── 3. Serie mensual + nuevas/recurrentes + tops ──
  var pers = Object.keys(meses).sort();
  var serie = pers.map(function(p){
    var M=meses[p];
    var unicas=Object.keys(M.clientas).length;
    var nuevas=Object.keys(M.clientas).filter(function(c){return primeraVisita[c]===p;}).length;
    var nFac=Object.keys(M.facturas).length;
    var topM=Object.keys(M.prods).map(function(k){return M.prods[k];}).sort(function(a,b){return b.ing-a.ing;}).slice(0,10);
    return {per:p, ingSin:Math.round(M.ingSin*100)/100, ingCon:Math.round(M.ingCon*100)/100,
      facturas:nFac, promedio:nFac?Math.round(M.ingCon/nFac*100)/100:0,
      clientas:unicas, nuevas:nuevas, recurrentes:unicas-nuevas,
      cats:M.cats, porDia:M.porDia, top:topM};
  });
  var topGlobal=Object.keys(prodGlobal).map(function(k){return prodGlobal[k];}).sort(function(a,b){return b.ing-a.ing;}).slice(0,15);
  var topPorAno={};
  Object.keys(prodPorAno).forEach(function(a){
    topPorAno[a]=Object.keys(prodPorAno[a]).map(function(k){return prodPorAno[a][k];}).sort(function(x,y){return y.ing-x.ing;}).slice(0,15);
  });

  // ── 4. Sistema (desde abril): faciales por cosmetóloga/mes y paquetes por vendedora/mes ──
  var facialesCos = {}, paqVend = {}, sistemaMes = {};
  try {
    var wsTk = ss.getSheets().find(function(s){return s.getName().includes('TICKET_FICHA');});
    var tD = wsTk.getDataRange().getValues();
    for (var t=1; t<tD.length; t++) {
      var rw=tD[t];
      if(!(rw[0] instanceof Date)) continue;
      if(((rw[2]||'').toString().split('.')[0])==='1793219469001') continue;
      var perT=Utilities.formatDate(rw[0],'America/Guayaquil','yyyy-MM');
      // Un ticket = una clienta ATENDIDA (una factura puede agrupar varias)
      var sm=sistemaMes[perT]=sistemaMes[perT]||{atenciones:0, clientas:{}};
      sm.atenciones++;
      var cedT=(rw[2]||'').toString().split('.')[0];
      if(cedT) sm.clientas[cedT]=1;
      if(!(rw[19]||'').toString().trim()) continue; // col T facial
      var cosmT=(rw[1]||'').toString().trim();
      if(!cosmT||cosmT.toUpperCase()==='SUNSU') continue;
      (facialesCos[perT]=facialesCos[perT]||{})[cosmT]=((facialesCos[perT]||{})[cosmT]||0)+1;
    }
    Object.keys(sistemaMes).forEach(function(p){
      sistemaMes[p]={atenciones:sistemaMes[p].atenciones, clientas:Object.keys(sistemaMes[p].clientas).length};
    });
    var wsPq = ss.getSheetByName('📋 PAQUETES');
    if (wsPq) {
      var pD = wsPq.getDataRange().getValues();
      for (var q=2; q<pD.length; q++) {
        var d1=parseInt(pD[q][0]), m1=parseInt(pD[q][1]), a1=parseInt(pD[q][2]);
        if(!m1||!a1||!pD[q][3]) continue;
        var perQ=a1+'-'+('0'+m1).slice(-2);
        var vQ=(pD[q][9]||'').toString().trim()||'—';
        (paqVend[perQ]=paqVend[perQ]||{total:0});
        paqVend[perQ].total=(paqVend[perQ].total||0)+1;
        paqVend[perQ][vQ]=(paqVend[perQ][vQ]||0)+1;
      }
    }
  } catch(eSis) {}

  // ── 5. Nómina y comisiones manuales de CONFIGURACION (filas 'ROL 2026-05', 'COMISIONES 2026-05') ──
  var rolMes={}, comMes={};
  try {
    var wsCfgK = ss.getSheetByName('⚙ CONFIGURACION');
    if (wsCfgK) {
      var cfgK = wsCfgK.getDataRange().getValues();
      for (var ck=0; ck<cfgK.length; ck++) {
        var kName=(cfgK[ck][0]||'').toString().trim().toUpperCase();
        var mR=kName.match(/^ROL\s+(20\d{2}-\d{2})$/);
        var mC=kName.match(/^COMISIONES\s+(20\d{2}-\d{2})$/);
        if(mR) rolMes[mR[1]]=parseFloat(cfgK[ck][1])||0;
        if(mC) comMes[mC[1]]=parseFloat(cfgK[ck][1])||0;
      }
    }
  } catch(eCfg) {}

  var resultado = {generado: Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm'),
    serie:serie, topGlobal:topGlobal, topPorAno:topPorAno, facialesCos:facialesCos, paqVend:paqVend, rolMes:rolMes, comMes:comMes,
    sistemaMes:sistemaMes};

  // ── 6. Guardar en hoja 📈 KPI_DATA (JSON en trozos) ──
  var wsK = ss.getSheetByName('📈 KPI_DATA');
  if (wsK) wsK.clear(); else wsK = ss.insertSheet('📈 KPI_DATA');
  var jsonK = JSON.stringify(resultado);
  var trozos = [];
  for (var z=0; z<jsonK.length; z+=45000) trozos.push([jsonK.substring(z, z+45000)]);
  wsK.getRange(1,1).setValue('KPI_JSON v1 — no editar');
  wsK.getRange(2,1,trozos.length,1).setValues(trozos);
  wsK.hideSheet();
  SpreadsheetApp.flush();
  ss.toast('📈 KPIs históricos generados: '+serie.length+' meses ('+pers[0]+' → '+pers[pers.length-1]+'). Ya se ven en el app.','SUNSU',12);
}

// ══════ CONCILIACIÓN FACTURAS MI NEGOCIO vs TICKETS ══════
// Requiere la pestaña '🧾 FACTURAS MN' con el reporte detallado de ventas de Mi Negocio
// (Archivo → Importar → subir el .xls → Insertar hojas nuevas → renombrar).
// Cruza por los últimos 4 dígitos del # de factura, sumando ítems (MN) y tickets (combinadas).
function _normFac_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') v = String(Math.round(v));
  var d = String(v).replace(/\D/g, '');
  if (!d) return '';
  d = d.slice(-4);
  while (d.length < 4) d = '0' + d;
  return d;
}

// Convierte un .xls/.xlsx de Drive a Google Sheet temporal. Devuelve el id o null.
// Requiere el servicio avanzado "Drive API" (editor → Servicios ➕ → Drive API → Añadir).
function _convertirXlsASheet_(fileId) {
  if (typeof Drive === 'undefined' || !Drive.Files) return null;
  try { // Drive API v2
    var c2 = Drive.Files.copy({title: 'tmp_conciliacion_mn'}, fileId, {convert: true});
    if (c2 && c2.id) return c2.id;
  } catch(e2) {}
  try { // Drive API v3
    var c3 = Drive.Files.copy({name: 'tmp_conciliacion_mn', mimeType: 'application/vnd.google-apps.spreadsheet'}, fileId);
    if (c3 && c3.id) return c3.id;
  } catch(e3) {}
  return null;
}

// Pinta la fila de alerta SOLO si la columna P (revisado) no está marcada.
// Si Esteban ya marcó P manualmente, la fila queda limpia aunque la diferencia persista.
function _pintarAlerta_(wsT, fila, tData, color) {
  var pVal = tData[fila-1] ? tData[fila-1][15] : null; // col P
  if (pVal === true || pVal === 'TRUE') wsT.getRange(fila, 1, 1, 16).setBackground(null);
  else wsT.getRange(fila, 1, 1, 16).setBackground(color);
}

// ── USUARIOS: la lista viva vive en Script Properties, NUNCA en el HTML publico ──
// Los PIN solo existen aqui. El app ya no los conoce: manda el PIN y el servidor responde.
// Rol del token de sesion ('' si invalido o vencido). Es el colador del servidor:
// lo que el rol no debe ver, NO viaja al celular.
function _rolDeToken_(props, token) {
  if (!token) return '';
  try {
    var mapT = JSON.parse(props.getProperty('SUNSU_TOKENS')||'{}');
    var tk = mapT[token];
    if (tk && tk.exp && tk.exp > Date.now()) return tk.rol || '';
  } catch(eT) {}
  return '';
}
function _usuariosSunsu_(props) {
  var DEF_U = [
    {id:'efch',      name:'EFCH',                short:'EFCH',      role:'admin_master', color:'#3D5A7A', pin:'0000'},
    {id:'emi',       name:'Emi',                 short:'Emi',       role:'admin',        color:'#8FA8C8', pin:'1111'},
    {id:'andrea',    name:'Andrea Robles',       short:'Andrea',    role:'staff',        color:'#5B7FA6', pin:'2222'},
    {id:'daniela',   name:'Daniela Mora',        short:'Daniela',   role:'staff',        color:'#C4943A', pin:'3333'},
    {id:'dejaneira', name:'Dejaneira Espinoza',  short:'Dejaneira', role:'staff',        color:'#7A9E8A', pin:'4444'},
    {id:'alejandra', name:'Alejandra Rodriguez', short:'Alejandra', role:'reception',    color:'#D4956A', pin:'5555'}
  ];
  var arrU = [];
  try { arrU = JSON.parse(props.getProperty('SUNSU_USERS')||'[]'); } catch(eU) { arrU = []; }
  if (!arrU || !arrU.length) { arrU = DEF_U; props.setProperty('SUNSU_USERS', JSON.stringify(arrU)); }
  return arrU;
}
// Datos publicos de un usuario: TODO menos el PIN.
function _usuarioPublico_(u) {
  return {id:u.id, name:u.name, short:u.short, role:u.role, color:u.color, bloqueado:!!u.bloqueado};
}

// ── Etiquetar en Acuity 'INGRESADO Y COMP' las citas de los tickets revisados ──
// Se llama al final de la conciliación con las filas que quedaron con col P = ✓.
function _marcarIngresadoAcuity_(filas, tData, fIni, fFin) {
  var out = {act:0, sin:0, skip:0, err:''};
  var props = PropertiesService.getScriptProperties();
  var uid = props.getProperty('ACUITY_UID'), key = props.getProperty('ACUITY_KEY');
  if (!uid || !key) { out.err = 'Sin credenciales Acuity configuradas'; return out; }
  var auth = {'Authorization': 'Basic ' + Utilities.base64Encode(uid + ':' + key)};
  // 1. Buscar el id de la etiqueta (por nombre que contenga INGRESADO)
  var labelId = null;
  try {
    var labs = JSON.parse(UrlFetchApp.fetch('https://acuityscheduling.com/api/v1/labels', {headers:auth, muteHttpExceptions:true}).getContentText());
    for (var li = 0; li < labs.length; li++) {
      if ((labs[li].name||'').toUpperCase().indexOf('INGRESADO') >= 0) { labelId = labs[li].id; break; }
    }
  } catch(eL) {}
  if (!labelId) { out.err = 'No encontré la etiqueta INGRESADO Y COMP en Acuity'; return out; }
  // 2. Traer las citas del período (en tramos de 7 días)
  var citas = [];
  var cur = new Date(fIni.getTime());
  while (cur <= fFin) {
    var fin7 = new Date(Math.min(cur.getTime() + 6*24*3600*1000, fFin.getTime()));
    var minS = Utilities.formatDate(cur, 'America/Guayaquil', 'yyyy-MM-dd') + 'T00:00:00';
    var maxS = Utilities.formatDate(fin7, 'America/Guayaquil', 'yyyy-MM-dd') + 'T23:59:59';
    try {
      var arr = JSON.parse(UrlFetchApp.fetch('https://acuityscheduling.com/api/v1/appointments?minDate='+minS+'&maxDate='+maxS+'&max=300', {headers:auth, muteHttpExceptions:true}).getContentText());
      if (Array.isArray(arr)) citas = citas.concat(arr);
    } catch(eC) {}
    cur = new Date(fin7.getTime() + 24*3600*1000);
  }
  var porFecha = {};
  citas.forEach(function(a){
    if (a.canceled) return;
    var f = (a.datetime||'').toString().slice(0,10);
    (porFecha[f] = porFecha[f] || []).push(a);
  });
  // 3. Cruzar cada ticket revisado con su cita (nombre tolerante + misma fecha)
  var puts = [], vistos = {};
  filas.forEach(function(fl){
    var row = tData[fl-1]; if (!row) return;
    var f = row[0] instanceof Date ? Utilities.formatDate(row[0], 'America/Guayaquil', 'yyyy-MM-dd') : '';
    var pn = _normNombre_(row[3]).split(' ')[0];
    var pa = _normNombre_(row[4]).split(' ')[0];
    if (!f || pn.length < 2) { out.sin++; return; }
    var lista = porFecha[f] || [];
    var apt = null;
    for (var i = 0; i < lista.length; i++) {
      var fullA = _normNombre_((lista[i].firstName||'') + ' ' + (lista[i].lastName||''));
      if (fullA.indexOf(pn) >= 0 && (pa.length < 2 || fullA.indexOf(pa) >= 0)) { apt = lista[i]; break; }
    }
    if (!apt) { out.sin++; return; }
    if (vistos[apt.id]) return;
    vistos[apt.id] = 1;
    var yaIng = (apt.labels||[]).some(function(l){ return (l.name||'').toUpperCase().indexOf('INGRESADO') >= 0; });
    if (yaIng) { out.skip++; return; }
    puts.push({url:'https://acuityscheduling.com/api/v1/appointments/'+apt.id+'?admin=true', method:'put',
      contentType:'application/json', headers:auth,
      payload:JSON.stringify({labels:[{id:labelId}]}), muteHttpExceptions:true});
  });
  // 4. Ejecutar en lotes de 15
  for (var b = 0; b < puts.length; b += 15) {
    try {
      var rs = UrlFetchApp.fetchAll(puts.slice(b, b+15));
      rs.forEach(function(r){ if (r.getResponseCode() >= 200 && r.getResponseCode() < 300) out.act++; });
    } catch(eB) {}
  }
  return out;
}

function conciliarFacturasMN() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wsT = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
  if (!wsT) { ss.toast('No se encontró TICKET_FICHA','SUNSU',6); return; }

  // ── Preguntar el período a conciliar ──
  var perKey = '';
  try {
    var ui = SpreadsheetApp.getUi();
    var hoyP = new Date();
    var mesPrevP = new Date(hoyP.getFullYear(), hoyP.getMonth() - 1, 1);
    var sugeridoP = Utilities.formatDate(mesPrevP, 'America/Guayaquil', 'yyyy-MM');
    var respP = ui.prompt('🧾 Conciliar facturas MN',
      'Escribe el período a conciliar (formato AAAA-MM), por ejemplo: ' + sugeridoP + '\n\n' +
      'Debe existir en la carpeta Drive "SUNSU FACTURAS MN" un archivo con ese período en el nombre (ej. "' + sugeridoP + '.xls"). Solo se conciliarán tickets de ese mes.',
      ui.ButtonSet.OK_CANCEL);
    if (respP.getSelectedButton() !== ui.Button.OK) return;
    var txtP = (respP.getResponseText() || '').trim();
    var mSelP = txtP.match(/^(20\d{2})[-_\/\s]?(0[1-9]|1[0-2])$/);
    if (!mSelP) { ss.toast('Período inválido: "' + txtP + '". Usa el formato AAAA-MM, ej. ' + sugeridoP, 'SUNSU', 10); return; }
    perKey = mSelP[1] + '-' + mSelP[2];
  } catch(eUIP) { ss.toast('No pude abrir el diálogo de período: ' + eUIP.message, 'SUNSU', 8); return; }
  var anoSel = parseInt(perKey.slice(0, 4)), mesSel = parseInt(perKey.slice(5, 7));

  // ── 0. Fuente de datos MN: archivo del período elegido en la carpeta Drive (privado),
  //       con la pestaña 🧾 FACTURAS MN como respaldo ──
  var mnData = null, fuenteMN = '';
  try {
    // Búsqueda tolerante: acepta nombres con comillas/espacios extra y, si hay
    // varias carpetas parecidas, usa la que tenga archivos dentro.
    var iterMN = DriveApp.searchFolders('title contains "SUNSU FACTURAS MN" and trashed = false');
    var carpetaMN = null, carpetaVacia = null;
    while (iterMN.hasNext()) {
      var cand = iterMN.next();
      if (cand.getFiles().hasNext()) { carpetaMN = cand; break; }
      if (!carpetaVacia) carpetaVacia = cand;
    }
    if (!carpetaMN) carpetaMN = carpetaVacia;
    if (!carpetaMN) {
      DriveApp.createFolder('SUNSU FACTURAS MN');
      ss.toast('📁 Creé la carpeta Drive "SUNSU FACTURAS MN". Sube ahí el reporte .xls de Mi Negocio (nómbralo con el período, ej. "2026-06.xls") y vuelve a correr la conciliación.','SUNSU',14);
    } else {
      var filesMN = carpetaMN.getFiles();
      var masReciente = null; // el archivo cuyo nombre contiene el período elegido
      var nombresDisp = [];
      var regPer = new RegExp(perKey.slice(0,4) + '[-_\\s]?' + perKey.slice(5,7));
      while (filesMN.hasNext()) {
        var fMN = filesMN.next();
        if (fMN.getName().indexOf('tmp_conciliacion') === 0) continue;
        nombresDisp.push(fMN.getName());
        if (regPer.test(fMN.getName())) {
          if (!masReciente || fMN.getLastUpdated() > masReciente.getLastUpdated()) masReciente = fMN;
        }
      }
      if (!masReciente && nombresDisp.length) {
        ss.toast('No hay archivo del período ' + perKey + ' en la carpeta. Archivos disponibles: ' + nombresDisp.join(', '), 'SUNSU', 14);
        return;
      }
      if (masReciente) {
        if (masReciente.getMimeType() === MimeType.GOOGLE_SHEETS) {
          mnData = SpreadsheetApp.openById(masReciente.getId()).getSheets()[0].getDataRange().getValues();
          fuenteMN = masReciente.getName();
        } else {
          var tmpId = _convertirXlsASheet_(masReciente.getId());
          if (tmpId) {
            mnData = SpreadsheetApp.openById(tmpId).getSheets()[0].getDataRange().getValues();
            DriveApp.getFileById(tmpId).setTrashed(true);
            fuenteMN = masReciente.getName();
          } else {
            ss.toast('⚙️ Para leer el .xls activa el servicio "Drive API": editor de Apps Script → Servicios ➕ → Drive API → Añadir. (Mientras tanto puedo usar la pestaña 🧾 FACTURAS MN si existe.)','SUNSU',14);
          }
        }
      }
    }
  } catch(eDrv) {
    ss.toast('No pude leer la carpeta: '+eDrv.message,'SUNSU',10);
  }
  if (!mnData) {
    var wsMN = ss.getSheets().find(function(s){ return s.getName().toUpperCase().indexOf('FACTURAS MN') >= 0; });
    if (!wsMN) { ss.toast('Sube el .xls a la carpeta Drive "SUNSU FACTURAS MN" (o importa la pestaña 🧾 FACTURAS MN) y vuelve a correr.', 'SUNSU', 12); return; }
    mnData = wsMN.getDataRange().getValues();
    fuenteMN = 'pestaña 🧾 FACTURAS MN';
  }

  // ── 1. Leer Mi Negocio: encontrar encabezados y agrupar por factura ──
  var hRow = -1, cNum = -1, cTot = -1, cFecha = -1;
  for (var h = 0; h < Math.min(10, mnData.length); h++) {
    for (var c = 0; c < mnData[h].length; c++) {
      var hv = (mnData[h][c]||'').toString().toLowerCase();
      if (hv.indexOf('num') >= 0 && hv.indexOf('factura') >= 0) { hRow = h; cNum = c; }
      if (hRow === h && hv === 'total') cTot = c;
      if (hRow === h && hv === 'fecha') cFecha = c;
    }
    if (hRow >= 0 && cNum >= 0 && cTot >= 0) break;
  }
  if (cNum < 0 || cTot < 0) { ss.toast('No encontré las columnas "Num. Factura" y "Total" en 🧾 FACTURAS MN','SUNSU',10); return; }

  var mn = {}; var fMin = null, fMax = null;
  for (var i = hRow + 1; i < mnData.length; i++) {
    var num = mnData[i][cNum], tot = parseFloat(mnData[i][cTot]);
    if (!num || isNaN(tot)) continue; // salta fila de gran total y vacías
    var k = _normFac_(num);
    if (!k) continue;
    mn[k] = (mn[k]||0) + tot;
    var f = cFecha >= 0 ? mnData[i][cFecha] : null;
    var fD = null;
    if (f instanceof Date) fD = f;
    else if (f) { // el convertidor a veces deja las fechas como texto
      var fs = f.toString().trim();
      var m1 = fs.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);          // 2026-06-02
      var m2 = fs.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);      // 02/06/2026
      if (m1) fD = new Date(parseInt(m1[1]), parseInt(m1[2])-1, parseInt(m1[3]));
      else if (m2) fD = new Date(parseInt(m2[3]), parseInt(m2[2])-1, parseInt(m2[1]));
    }
    if (fD && !isNaN(fD.getTime())) {
      if (!fMin || fD < fMin) fMin = fD;
      if (!fMax || fD > fMax) fMax = fD;
    }
  }
  // El rango es SIEMPRE el mes elegido en el diálogo — nunca se toca otro mes.
  fMin = new Date(anoSel, mesSel - 1, 1);
  fMax = new Date(anoSel, mesSel, 0); // último día del mes
  var finRango = new Date(fMax.getFullYear(), fMax.getMonth(), fMax.getDate(), 23, 59, 59);

  // ── 2. Leer tickets del rango: agrupar por factura, detectar canjes puros y sin factura ──
  var tData = wsT.getDataRange().getValues();
  var tk = {}, tkFilas = {}, canjePuro = [], sinFac = [], filasPorKey = {};
  for (var r = 1; r < tData.length; r++) {
    var row = tData[r];
    var fch = row[0] instanceof Date ? row[0] : null;
    if (!fch || fch < fMin || fch > finRango) continue;
    if (((row[2]||'').toString().split('.')[0]) === '1793219469001') continue; // consumo interno
    var est = parseFloat(row[9]) || 0;
    var colQ = (row[16]||'').toString().trim();
    var colR = (row[17]||'').toString().trim();
    var k2 = _normFac_(row[6]);
    if (!k2) {
      if ((colQ.indexOf('SI') === 0 || colQ === 'CORTESIA' || colR.indexOf('SI') === 0) && est <= 0.01) {
        canjePuro.push(r + 1); // canje/cortesía puro sin consumo → auto-OK
      } else {
        sinFac.push({fila: r + 1, nombre: (row[3]||'')+' '+(row[4]||''), est: est});
      }
      continue;
    }
    tk[k2] = (tk[k2]||0) + est;
    (filasPorKey[k2] = filasPorKey[k2] || []).push(r + 1);
  }

  // ── 3. Comparar y marcar en TICKET_FICHA (col P = revisado; fila roja = alerta) ──
  var TOL = 0.05, ROJO = '#F8D7DA';
  var okN = 0, difs = [], soloMN = [], soloTK = [];
  var revisadosAc = []; // filas con col P = ✓ → para etiquetar sus citas en Acuity
  var keys = {};
  Object.keys(mn).forEach(function(k){ keys[k] = 1; });
  Object.keys(tk).forEach(function(k){ keys[k] = 1; });
  Object.keys(keys).sort().forEach(function(k){
    var enMN = mn.hasOwnProperty(k), enTK = tk.hasOwnProperty(k);
    if (enMN && enTK) {
      var dif = tk[k] - mn[k];
      if (Math.abs(dif) <= TOL) {
        okN++;
        (filasPorKey[k]||[]).forEach(function(fl){
          wsT.getRange(fl, 1, 1, 16).setBackground(null);
          wsT.getRange(fl, 16).setValue(true); // col P = revisado ✓
          revisadosAc.push(fl);
        });
      } else {
        difs.push({k:k, mn:mn[k], tk:tk[k], dif:dif, filas:filasPorKey[k]||[]});
        (filasPorKey[k]||[]).forEach(function(fl){ _pintarAlerta_(wsT, fl, tData, ROJO); });
      }
    } else if (enMN) {
      soloMN.push({k:k, tot:mn[k]});
    } else {
      soloTK.push({k:k, tot:tk[k], filas:filasPorKey[k]||[]});
      (filasPorKey[k]||[]).forEach(function(fl){ _pintarAlerta_(wsT, fl, tData, ROJO); });
    }
  });
  canjePuro.forEach(function(fl){
    wsT.getRange(fl, 1, 1, 16).setBackground(null);
    wsT.getRange(fl, 16).setValue(true); // canje puro → revisado automático
    revisadosAc.push(fl);
  });
  sinFac.forEach(function(s){ _pintarAlerta_(wsT, s.fila, tData, ROJO); });

  // ── 4. Hoja de resultados ──
  var wsRes = ss.getSheetByName('🧾 CONCILIACIÓN');
  if (wsRes) wsRes.clear(); else wsRes = ss.insertSheet('🧾 CONCILIACIÓN');
  var out = [];
  var rango = Utilities.formatDate(fMin,'America/Guayaquil','dd/MM/yyyy')+' — '+Utilities.formatDate(fMax,'America/Guayaquil','dd/MM/yyyy');
  out.push(['🧾 CONCILIACIÓN FACTURAS MI NEGOCIO vs TICKETS','','','','']);
  out.push(['Archivo: '+fuenteMN+' · Rango: '+rango+' · Generado: '+Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm'),'','','','']);
  out.push(['','','','','']);
  out.push(['RESUMEN','','','','']);
  out.push(['✅ Facturas cuadradas', okN,'','','']);
  out.push(['🎀 Tickets canje/cortesía puro (auto-revisados)', canjePuro.length,'','','']);
  out.push(['⚠️ Facturas con montos distintos', difs.length,'','','']);
  out.push(['❌ Facturas MN sin ticket', soloMN.length,'','','']);
  out.push(['❌ Tickets con # que no existe en MN', soloTK.length,'','','']);
  out.push(['❌ Tickets con consumo SIN factura', sinFac.length,'','','']);
  out.push(['','','','','']);
  if (difs.length) {
    out.push(['⚠️ MONTOS DISTINTOS','Factura','Mi Negocio','Tickets','Diferencia / Filas']);
    difs.forEach(function(d){ out.push(['', '...'+d.k, d.mn.toFixed(2), d.tk.toFixed(2), (d.dif>0?'+':'')+d.dif.toFixed(2)+' · filas '+d.filas.join(', ')]); });
    out.push(['','','','','']);
  }
  if (soloMN.length) {
    out.push(['❌ FACTURAS MN SIN TICKET','Factura','Total MN','','']);
    soloMN.forEach(function(d){ out.push(['', '...'+d.k, d.tot.toFixed(2), '', '']); });
    out.push(['','','','','']);
  }
  if (soloTK.length) {
    out.push(['❌ # DE FACTURA NO EXISTE EN MN','Factura','Total tickets','Filas','']);
    soloTK.forEach(function(d){ out.push(['', '...'+d.k, d.tot.toFixed(2), d.filas.join(', '), '']); });
    out.push(['','','','','']);
  }
  if (sinFac.length) {
    out.push(['❌ TICKETS CON CONSUMO SIN FACTURA','Fila','Clienta','Estimado','']);
    sinFac.forEach(function(s){ out.push(['', s.fila, s.nombre, s.est.toFixed(2), '']); });
  }
  wsRes.getRange(1, 1, out.length, 5).setValues(out);
  wsRes.getRange(1,1).setFontWeight('bold').setFontSize(12);
  wsRes.setColumnWidth(1, 260); wsRes.setColumnWidth(5, 260);
  SpreadsheetApp.flush();
  ss.toast('✅ Conciliación lista: '+okN+' cuadradas · '+difs.length+' con diferencias · '+soloMN.length+' MN sin ticket · '+sinFac.length+' sin factura. Detalle en 🧾 CONCILIACIÓN','SUNSU',12);

  // ── Marcar 'INGRESADO Y COMP' en Acuity para las citas de los tickets revisados ──
  if (revisadosAc.length) {
    ss.toast('🏷️ Marcando INGRESADO Y COMP en Acuity ('+revisadosAc.length+' tickets)...','SUNSU',6);
    var resAc = {act:0, sin:0, skip:0, err:''};
    try { resAc = _marcarIngresadoAcuity_(revisadosAc, tData, fMin, finRango); }
    catch(eAc) { resAc.err = eAc.message; }
    if (resAc.err) ss.toast('🏷️ Acuity: '+resAc.err,'SUNSU',10);
    else ss.toast('🏷️ Acuity: '+resAc.act+' cita(s) marcadas INGRESADO Y COMP · '+resAc.skip+' ya lo tenían · '+resAc.sin+' sin cita encontrada','SUNSU',14);
  }
}

// ══════ RESPALDO AUTOMÁTICO SEMANAL ══════
function respaldoSemanal() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fecha = Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM-dd');
  var carpetas = DriveApp.getFoldersByName('SUNSU BACKUPS');
  var carpeta = carpetas.hasNext() ? carpetas.next() : DriveApp.createFolder('SUNSU BACKUPS');
  DriveApp.getFileById(ss.getId()).makeCopy('SUNSU BACKUP '+fecha, carpeta);
  // Conservar solo los últimos 8 respaldos (2 meses)
  var files = carpeta.getFiles();
  var lista = [];
  while (files.hasNext()) { var f = files.next(); if (f.getName().indexOf('SUNSU BACKUP') === 0) lista.push(f); }
  lista.sort(function(a,b){ return a.getName() < b.getName() ? 1 : -1; });
  for (var i = 8; i < lista.length; i++) lista[i].setTrashed(true);
}
function instalarRespaldoSemanal() {
  var existe = ScriptApp.getProjectTriggers().some(function(t){ return t.getHandlerFunction() === 'respaldoSemanal'; });
  if (!existe) ScriptApp.newTrigger('respaldoSemanal').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  respaldoSemanal();
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ Respaldo semanal instalado (domingos 3am) — primer respaldo creado en Drive/SUNSU BACKUPS','SUNSU',10);
}

// ══════ LOG DE AUDITORÍA — acciones sensibles quedan registradas en 📜 LOG ══════
function logAccion_(ss, accion, detalle, usuario) {
  try {
    var ws = ss.getSheetByName('📜 LOG');
    if (!ws) {
      ws = ss.insertSheet('📜 LOG');
      ws.appendRow(['FECHA','USUARIO','ACCIÓN','DETALLE']);
      ws.getRange(1,1,1,4).setFontWeight('bold').setBackground('#3C4A5C').setFontColor('#FFFFFF');
      ws.setColumnWidth(1,140); ws.setColumnWidth(4,420);
      ws.hideSheet(); // oculta pero accesible: clic derecho en pestañas → mostrar
    }
    ws.appendRow([Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm:ss'), usuario||'—', accion, detalle||'']);
  } catch(e) {}
}

function columnaLetra_(n){ var s=''; while(n>0){ var m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; }

// ══════ TELÉFONOS DESDE ACUITY (para el seguimiento) ══════
function _normNombre_(s) {
  return (s||'').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // quitar tildes
    .replace(/[^a-zñ\s]/g,' ')
    .replace(/\s+/g,' ').trim();
}
// Teléfonos desde la hoja REGISTRO (si existe una columna TELÉFONO/CELULAR/WHATSAPP).
// Devuelve {porCedula:{...}, porNombre:{...}}. Si no hay columna, mapas vacíos.
function getTelefonosRegistro_(ss) {
  var out = {porCedula:{}, porNombre:{}};
  try {
    var ws = ss.getSheetByName('REGISTRO');
    if (!ws) return out;
    var data = ws.getDataRange().getValues();
    if (data.length < 2) return out;
    var colTel = -1;
    for (var h = 0; h < data[0].length; h++) {
      var hU = (data[0][h]||'').toString().toUpperCase();
      if (hU.indexOf('TELEF') >= 0 || hU.indexOf('TELÉF') >= 0 || hU.indexOf('CELULAR') >= 0 || hU.indexOf('WHATSAPP') >= 0 || hU.indexOf('PHONE') >= 0) { colTel = h; break; }
    }
    if (colTel < 0) return out;
    for (var i = 1; i < data.length; i++) {
      var tel = (data[i][colTel]||'').toString().trim();
      if (!tel) continue;
      var ced = (data[i][1]||'').toString().trim().split('.')[0];
      var nom = _normNombre_((data[i][2]||'')+' '+(data[i][3]||''));
      if (ced) out.porCedula[ced] = tel;
      if (nom) out.porNombre[nom] = tel;
    }
  } catch(e) {}
  return out;
}

// Mapa nombre-normalizado → teléfono desde la lista de clientes de Acuity.
// Se cachea 6 horas para no golpear el API en cada carga.
// ── Citas FUTURAS ya agendadas en Acuity (hoy + 60 dias) ──
// Mapa nombreNormalizado -> fecha (yyyy-MM-dd) de su PROXIMA cita. Cache 10 min.
// Lo usa el seguimiento para no llamar a quien ya agendo por su cuenta.
function getCitasFuturasAcuity_() {
  var cacheF = CacheService.getScriptCache();
  var cachedF = cacheF.get('SEG_CITAS_FUT');
  if (cachedF) { try { return JSON.parse(cachedF); } catch(eF) {} }
  var mapF = {};
  try {
    var uidF = PropertiesService.getScriptProperties().getProperty('ACUITY_UID');
    var keyF = PropertiesService.getScriptProperties().getProperty('ACUITY_KEY');
    if (!uidF || !keyF) return mapF;
    var tzF = 'America/Guayaquil';
    var minF = Utilities.formatDate(new Date(), tzF, 'yyyy-MM-dd');
    var maxF = Utilities.formatDate(new Date(Date.now()+60*24*3600*1000), tzF, 'yyyy-MM-dd');
    var respF = UrlFetchApp.fetch('https://acuityscheduling.com/api/v1/appointments?minDate='+minF+'&maxDate='+maxF+'&max=300',
      {headers:{'Authorization':'Basic '+Utilities.base64Encode(uidF+':'+keyF)}, muteHttpExceptions:true});
    if (respF.getResponseCode() !== 200) return mapF;
    JSON.parse(respF.getContentText()).forEach(function(ap){
      if (ap.canceled) return;
      var fullF = _normNombre_((ap.firstName||'')+' '+(ap.lastName||''));
      if (!fullF) return;
      var fF = (ap.date && ap.datetime) ? Utilities.formatDate(new Date(ap.datetime), tzF, 'yyyy-MM-dd') : '';
      if (!fF) return;
      if (!mapF[fullF] || fF < mapF[fullF]) mapF[fullF] = fF; // la mas proxima
    });
    cacheF.put('SEG_CITAS_FUT', JSON.stringify(mapF), 600);
  } catch(eCF) {}
  return mapF;
}
function getTelefonosAcuity_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('SEG_TELEFONOS');
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }
  var map = {};
  try {
    var uid = PropertiesService.getScriptProperties().getProperty('ACUITY_UID');
    var key = PropertiesService.getScriptProperties().getProperty('ACUITY_KEY');
    if (!uid || !key) return map;
    var resp = UrlFetchApp.fetch('https://acuityscheduling.com/api/v1/clients',
      {headers:{'Authorization':'Basic '+Utilities.base64Encode(uid+':'+key)}, muteHttpExceptions:true});
    if (resp.getResponseCode() !== 200) return map;
    var clientes = JSON.parse(resp.getContentText());
    clientes.forEach(function(cl){
      var tel = (cl.phone||'').toString().trim();
      if (!tel) return;
      var full = _normNombre_((cl.firstName||'')+' '+(cl.lastName||''));
      if (full) map[full] = tel;
    });
    try { cache.put('SEG_TELEFONOS', JSON.stringify(map), 21600); } catch(eC) {}
  } catch(e) {}
  return map;
}

// ══════ COMISIÓN DE RECEPCIÓN (Alejandra) ══════
// $0.50 por clienta atendida (ticket del día, excluye consumo SUNSU) en días
// donde se cumple la meta: ≥10 clientas (lunes ≥5). Devuelve detalle por día.
function calcularComisionRecepcion(fechaInicio, fechaFin) {
  var ss = _ssCentral_();
  var ws = ss ? ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); }) : null;
  if (!ws) return { dias: [], total: 0, diasCumplidos: 0 };
  var datos = ws.getDataRange().getValues();
  var porDia = {};
  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];
    var ts = fila[0];
    if (!ts) continue;
    var fecha = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(fecha.getTime()) || fecha < fechaInicio || fecha > fechaFin) continue;
    var cosm = (fila[1]||'').toString().trim();
    if (!cosm || cosm.toUpperCase() === 'SUNSU') continue; // consumo interno no cuenta
    if (((fila[2]||'').toString().split('.')[0]) === '1793219469001') continue; // cliente = Sunsu Spa (interno)
    // Solo cuentan tickets CON facial hecho (col T con contenido) — tickets de
    // solo productos/extras/gift cards no valen para la meta de agenda
    var facialR = (fila[CONFIG.COL_FACIAL - 1]||'').toString().trim();
    if (!facialR || facialR.toLowerCase() === 'false') continue;
    var key = Utilities.formatDate(fecha, 'America/Guayaquil', 'yyyy-MM-dd');
    porDia[key] = (porDia[key]||0) + 1;
  }
  var DIAS_SEM = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  var dias = [], total = 0, diasCumplidos = 0;
  Object.keys(porDia).sort().forEach(function(key){
    var p = key.split('-');
    var d = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10));
    var umbral = d.getDay() === 1 ? CONFIG.RECEP_MIN_CLIENTAS_LUNES : CONFIG.RECEP_MIN_CLIENTAS;
    var n = porDia[key];
    var cumple = n >= umbral;
    var com = cumple ? Math.round(n * CONFIG.RECEP_COM_POR_CLIENTA * 100) / 100 : 0;
    if (cumple) { total += com; diasCumplidos++; }
    dias.push({ fecha: key, dia: DIAS_SEM[d.getDay()], clientas: n, umbral: umbral, cumple: cumple, comision: com });
  });
  return { dias: dias, total: Math.round(total*100)/100, diasCumplidos: diasCumplidos };
}

// Deriva el catálogo de productos para órdenes de compra desde 📊 INVENTARIO:
// nombre (col B), precio compra (col G), y proveedor según la familia del SKU.
function getProductosInv_(ss) {
  var famProv = {};
  Object.keys(INV_CONFIG.PROVEEDORES).forEach(function(p){ famProv[INV_CONFIG.PROVEEDORES[p].familia] = p; });
  var out = {};
  var wsInv = ss.getSheetByName(INV_CONFIG.SHEET_INVENTARIO);
  if (wsInv) {
    var d = wsInv.getDataRange().getValues();
    for (var i = 2; i < d.length; i++) {
      var sku = (d[i][0]||'').toString().trim();
      var mm = sku.match(/^SUNSU-([A-Z]{2,3})-\d{3}$/);
      if (!mm) continue;
      out[sku] = {nombre:(d[i][1]||'').toString().trim(), proveedor:famProv[mm[1]]||'', compra:parseFloat(d[i][6])||0};
    }
  }
  // Fallback: conservar entradas hardcodeadas que no estén en el sheet
  Object.keys(INV_CONFIG.PRODUCTOS).forEach(function(sku){ if (!out[sku]) out[sku] = INV_CONFIG.PRODUCTOS[sku]; });
  return out;
}

const COLORES_COSM = {
  "Andrea Robles":       { bg: "#EEF3FA", header: "#5B7FA6", accent: "#3D5A7A" },
  "Andrea Robles Pogo":  { bg: "#EEF3FA", header: "#5B7FA6", accent: "#3D5A7A" },
  "Dejaneira Espinoza":  { bg: "#EDF5F1", header: "#7A9E8A", accent: "#5A7A6A" },
  "Daniela Mora":        { bg: "#FBF3E3", header: "#C4943A", accent: "#9A7028" },
  "Alejandra Rodriguez": { bg: "#FDF3EC", header: "#D4956A", accent: "#A86840" },
};
const COLOR_DEFAULT = { bg: "#F4F4F0", header: "#8A90A0", accent: "#5A6070" };

const COLOR = {
  // ── Sunsu Brand Palette ──
  // Periwinkle azul (del logo principal)
  NAVY_D:     "#3D5A7A",   // navy oscuro — headers, tabs
  NAVY:       "#5B7FA6",   // navy principal — backgrounds
  NAVY_L:     "#EEF3FA",   // navy muy claro
  BLUE:       "#8FA8C8",   // periwinkle
  BLUE_L:     "#F0F5FC",   // azul muy claro
  // Dorado cálido (del sol en la ilustración)
  GOLD:       "#C4943A",   // dorado principal
  GOLD_M:     "#E8C07A",   // dorado medio
  GOLD_L:     "#FBF3E3",   // dorado muy claro
  // Crema/ivory (fondo ilustración coreana)
  CREAM:      "#F5F0E8",   // crema
  CREAM_D:    "#EDE6D8",   // crema oscura
  // Sage verde
  GREEN:      "#7A9E8A",   // sage verde
  GREEN_L:    "#EDF5F1",   // sage muy claro
  // Melocotón/sand cálido
  PEACH:      "#D4956A",   // melocotón
  PEACH_L:    "#FDF3EC",   // melocotón muy claro
  // Neutros
  GRAY:       "#8A90A0",
  GRAY_L:     "#F4F4F0",
  WHITE:      "#FFFFFF",
  RED:        "#B87070",
  RED_L:      "#FDF0F0",
  // Aliases de compatibilidad
  PINK_DARK:  "#3D5A7A",   // era rosa oscuro → ahora navy
  PINK_MED:   "#E8C07A",   // era rosa medio → ahora gold medio
  PINK_LIGHT: "#FBF3E3",   // era rosa claro → ahora gold claro
  GOLD_DARK:  "#C4943A",
  GREEN_BG:   "#EDF5F1",
  GREEN_TXT:  "#7A9E8A",
  BLUE_BG:    "#EEF3FA",
  BLUE_DARK:  "#3D5A7A",
  GRAY_DARK:  "#8A90A0",
  AMBER_BG:   "#FBF3E3",
};

// ============================================================
// MENU
// ============================================================
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("⚙ Config")
      .addItem("📊 Reporte ejecutivo de ventas",    "generarReporteVentas")
      .addSeparator()
      .addItem("💰 Corte de comisiones",            "generarCorteManualComisiones")
      .addItem("💁 Control comisión recepción",     "generarControlRecepcion")
      .addItem("⏰ Activar control recepción diario", "instalarControlRecepcionDiario")
      .addItem("🔁 Actualizar fórmulas seguimiento", "actualizarFormulasSeguimiento")
      .addItem("💾 Instalar respaldo semanal",       "instalarRespaldoSemanal")
      .addItem("🧾 Conciliar facturas MN",           "conciliarFacturasMN")
      .addItem("📈 Generar KPIs históricos",         "generarKPIsHistoricos")
      .addItem("⏰ Activar KPIs históricos semanales", "instalarKPIsSemanales")
      .addItem("🚚 Corte de proveedores",           "generarCorteManualProveedores")
      .addSeparator()
      .addItem("✨ Crear / Actualizar dashboard",   "crearDashboard")
      .addSeparator()
      .addItem("📋 Sincronizar paquetes",           "sincronizarPaquetes")
      .addSeparator()
      .addItem("🧾 Generar orden de pedido",        "generarOrdenPedido")
      .addSeparator()
      .addItem("🔧 Corregir fórmulas inventario",   "corregirFormulasInventario")
      .addSeparator()
      .addItem("⚙ Instalar triggers automáticos",   "setupTriggersConDashboard")
      .addSeparator()
      .addItem("🔄 Sincronizar facturas ahora",       "sincronizarFacturas")
      .addSeparator()
      .addItem("📊 Actualizar cache KPIs ahora",      "actualizarKpisCache")
      .addSeparator()
      .addItem("💾 Hacer backup ahora",               "backupSheetSemanal")
      .addItem("💾 Activar backup semanal",           "setupTriggerBackup")
      .addSeparator()
      .addItem("🎨 Aplicar paleta Sunsu al documento", "recolorTodo")
      .addSeparator()
      .addItem("💵 Crear / Actualizar Caja Chica",     "crearCajaChica")
      .addItem("💵 Abrir panel de Caja Chica",         "abrirCajaChicaSidebar")
      .addItem("🔄 Sincronizar efectivo ahora",        "sincronizarEfectivo")
      .addItem("🔑 Autorizar botón para las chicas",   "autorizarScriptsCaja")
      .addSeparator()
      .addItem("💼 Crear / Actualizar Empleadas",      "crearSheetEmpleadas")
      .addItem("📋 Generar Rol de Pagos",              "generarRolDePagos")
      .addItem("🔗 Test conexión Jibble",              "testJibble")
      .addToUi();
  } catch(e) {
    // getUi() not available in web app / trigger context — safe to ignore
  }
}

// ============================================================
// TRIGGERS
// ============================================================
// ── Sincronizar facturas en PAQUETES (col G) y GIFT CARDS (col H) ──
function sincronizarFacturas() {
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var wsTicket  = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
  var wsPaq     = ss.getSheetByName('📋 PAQUETES');
  var wsGC      = ss.getSheetByName('🎁 GIFT CARDS');
  if (!wsTicket) return;

  var ticketData = wsTicket.getDataRange().getValues();
  var paqData    = wsPaq ? wsPaq.getDataRange().getValues() : [];
  var gcData     = wsGC  ? wsGC.getDataRange().getValues()  : [];

  var PRIMERA_FILA_PAQ = 429;
  var PRIMERA_FILA_GC  = 325;

  // Index PAQUETES rows 441+ by tsKey (col Y=index 24) and ced+dia+mes+año
  var paqByTs = {}, paqByCedFecha = {};
  for (var pi = PRIMERA_FILA_PAQ - 1; pi < paqData.length; pi++) {
    var tsK = (paqData[pi][24]||'').toString().trim();
    var pCed= (paqData[pi][3]||'').toString().trim();
    var pDia= (paqData[pi][0]||'').toString().trim();
    var pMes= (paqData[pi][1]||'').toString().trim();
    var pAno= (paqData[pi][2]||'').toString().trim();
    if (tsK)  paqByTs[tsK] = pi + 1;
    if (pCed) paqByCedFecha[pCed+'_'+pDia+'_'+pMes+'_'+pAno] = pi + 1;
  }

  // Index GIFT CARDS by code (col A) AND ced+dia+mes+año — only rows 325+
  var gcByCode = {};
  var gcByCedFecha = {};
  for (var gi = PRIMERA_FILA_GC - 1; gi < gcData.length; gi++) {
    var gCod = (gcData[gi][0]||'').toString().trim();
    var gCed = (gcData[gi][4]||'').toString().trim();
    var gDia = (gcData[gi][1]||'').toString().trim();
    var gMes = (gcData[gi][2]||'').toString().trim();
    var gAno = (gcData[gi][3]||'').toString().trim();
    if (gCod) gcByCode[gCod] = gi + 1; // unique code → row
    if (gCed) {
      var gKey4 = gCed+'_'+gDia+'_'+gMes+'_'+gAno;
      var gKey2 = gCed+'_'+gDia+'_'+gMes+'_'+(gAno.length===4?gAno.slice(-2):gAno);
      if (!gcByCedFecha[gKey4]) gcByCedFecha[gKey4] = [];
      if (!gcByCedFecha[gKey2]) gcByCedFecha[gKey2] = [];
      gcByCedFecha[gKey4].push(gi + 1);
      if (gKey2 !== gKey4) gcByCedFecha[gKey2].push(gi + 1);
    }
  }

  var paqUpdated = 0, gcUpdated = 0;

  for (var ti = 225; ti < ticketData.length; ti++) {
    var row = ticketData[ti];
    var ts  = row[0];
    if (!ts) continue;
    var factura = (row[6]||'').toString().trim(); // col G = FACTURA
    if (!factura) continue;

    var ced   = (row[2]||'').toString().trim();
    var pack3 = (row[20]||'').toString().trim();
    var pack6 = (row[21]||'').toString().trim();
    var colR  = (row[17]||'').toString().trim(); // col R = GC canje
    var colS  = (row[18]||'').toString().trim(); // col S = GC venta
    var tienePaq = (pack3 && pack3 !== 'false') || (pack6 && pack6 !== 'false');
    // Combine colR and colS for GC code extraction
    var gcSource = colS + ',' + colR;
    var tieneGC  = /\d{2}-\d{3,}/.test(gcSource);

    // Parse timestamp → Ecuador date
    var fechaTs = ts instanceof Date ? ts : new Date(ts.toString());
    if (!fechaTs || isNaN(fechaTs.getTime())) continue;
    var ecTs = new Date(fechaTs.getTime() - 5*60*60*1000);
    var tsDia = ecTs.getUTCDate().toString();
    var tsMes = (ecTs.getUTCMonth()+1).toString();
    var tsAno = ecTs.getUTCFullYear().toString();
    var tsKey = ts instanceof Date ? ts.toISOString() : ts.toString().trim();

    // Update PAQUETES col G
    if (tienePaq && wsPaq) {
      var paqRow = paqByTs[tsKey] || paqByCedFecha[ced+'_'+tsDia+'_'+tsMes+'_'+tsAno];
      if (paqRow && !(paqData[paqRow-1][6]||'').toString().trim()) {
        wsPaq.getRange(paqRow, 7).setValue(factura);
        paqData[paqRow-1][6] = factura;
        paqUpdated++;
      }
    }

    // Update GIFT CARDS col H — match by GC code (unique) from colS
    if (tieneGC && wsGC) {
      // Extract codes from colS: "SI, 26-077, 26-078[F], 26-079"
      var gcCodes = gcSource.split(',')
        .map(function(s){ return s.replace(/\[.*?\]/g,'').trim(); })
        .filter(function(s){ return /\d{2}-\d{3,}/.test(s); });
      gcCodes.forEach(function(code) {
        var gcRow = gcByCode[code]; // O(1) direct lookup by code
        if (gcRow && !(gcData[gcRow-1][7]||'').toString().trim()) {
          wsGC.getRange(gcRow, 8).setValue(factura);
          gcData[gcRow-1][7] = factura;
          gcUpdated++;
        }
      });
    }
  }

  if (paqUpdated > 0 || gcUpdated > 0) {
    SpreadsheetApp.flush();
    Logger.log('sincronizarFacturas: paq='+paqUpdated+' gc='+gcUpdated);
  }
}

// ── Backup semanal del Google Sheet ──
function backupSheetSemanal() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var ssId    = ss.getId();
  var ssName  = ss.getName();

  // Find or create SUNSU_BACKUPS folder in Drive
  var folderName = 'SUNSU_BACKUPS';
  var folders = DriveApp.getFoldersByName(folderName);
  var backupFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

  // Copy the spreadsheet
  var fecha = Utilities.formatDate(new Date(), 'America/Guayaquil', 'yyyy-MM-dd');
  var copyName = ssName + ' — BACKUP ' + fecha;
  var copy = DriveApp.getFileById(ssId).makeCopy(copyName, backupFolder);

  // Keep only last 8 backups (2 months) — delete oldest
  var files = backupFolder.getFiles();
  var backups = [];
  while (files.hasNext()) backups.push(files.next());
  backups.sort(function(a,b){ return a.getDateCreated()-b.getDateCreated(); });
  while (backups.length > 8) {
    backups.shift().setTrashed(true);
  }

  Logger.log('✅ Backup creado: ' + copyName);
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ Backup semanal creado: ' + copyName, 'SUNSU Backup', 8);
}

function setupTriggerBackup() {
  // Remove existing backup triggers
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'backupSheetSemanal') ScriptApp.deleteTrigger(t);
  });
  // Every Sunday at 3am Ecuador time
  ScriptApp.newTrigger('backupSheetSemanal')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ Backup semanal activado (domingos 3am)', 'SUNSU', 5);
}

// ── Compute KPIs — called by trigger and on-demand ──
function actualizarKpisCache() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var kpiData = computeKpis_(ss);
    CacheService.getScriptCache().put('kpis_data', JSON.stringify(kpiData), 21600);
    Logger.log('KPI cache OK: $'+kpiData.ingresos);
    SpreadsheetApp.getActiveSpreadsheet().toast('✅ KPIs actualizados','SUNSU',5);
  } catch(e) { Logger.log('actualizarKpisCache: '+e.message); }
}

function computeKpis_(ss) {
  var wsKT = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
  if (!wsKT) return {error:'No TICKET_FICHA'};
  var nowK = new Date();
  var ecK  = new Date(nowK.getTime() - 5*60*60*1000);
  var mesK = ecK.getUTCMonth()+1, anoK = ecK.getUTCFullYear();
  var lastRow = wsKT.getLastRow();
  if (lastRow < 2) return {ingresos:0,clientas:0,faciales:0,paquetes:0,productos:0,avgTicket:0,topFaciales:[],topProductos:[],topCosm:[],diasPico:[],porDia:[],historial:[]};

  var colA = wsKT.getRange(1,1,lastRow,1).getValues();
  var colB = wsKT.getRange(1,2,lastRow,1).getValues();
  var colC = wsKT.getRange(1,3,lastRow,1).getValues();
  var colJ = wsKT.getRange(1,10,lastRow,1).getValues();
  var colT = wsKT.getRange(1,20,lastRow,1).getValues();
  var colU = wsKT.getRange(1,21,lastRow,1).getValues();
  var colV = wsKT.getRange(1,22,lastRow,1).getValues();
  var prodLastCol = Math.min(wsKT.getLastColumn(), 54);
  var prodHeaders = wsKT.getRange(1,25,1,prodLastCol-24).getValues()[0];
  var prodData = wsKT.getRange(2,25,lastRow-1,prodLastCol-24).getValues();

  var mesesMap={}, facCount={}, prodCount={}, cosmMap={};

  for (var ki=1; ki<lastRow; ki++) {
    var kTs=colA[ki][0]; if (!kTs) continue;
    var kFecha=kTs instanceof Date?kTs:new Date(kTs.toString());
    if (isNaN(kFecha.getTime())) continue;
    var kCosm=(colB[ki][0]||'').toString().trim();
        // SUNSU incluido en ingreso bruto
    var kIdRaw=(colC[ki][0]||'').toString().split('.')[0];
    if (kIdRaw==='1793219469001') continue;
    var ecFecha=new Date(kFecha.getTime()-5*60*60*1000);
    var kMes=ecFecha.getUTCMonth()+1, kAno=ecFecha.getUTCFullYear();
    var kKey=kAno+'-'+(kMes<10?'0':'')+kMes;
    var kDia=ecFecha.getUTCDate();
    if (!mesesMap[kKey]) mesesMap[kKey]={ingr:0,faciales:0,paquetes:0,productos:0,clientas:{},porDia:{}};
    var km=mesesMap[kKey];
    var kEstimado=parseFloat(colJ[ki][0])||0;
    var kFacial=(colT[ki][0]||'').toString().trim();
    var kPack3=(colU[ki][0]||'').toString().trim();
    var kPack6=(colV[ki][0]||'').toString().trim();
    var kId=(kIdRaw).replace(/[^0-9a-zA-Z]/g,'');
    km.ingr+=kEstimado;
    if (kId) km.clientas[kId]=true;
    if (!km.porDia[kDia]) km.porDia[kDia]={faciales:0,soloCompra:0,ingr:0};
    km.porDia[kDia].ingr+=kEstimado;
    var hasFacial=kFacial&&kFacial.indexOf('SUNSU')>=0;
    var hasPaq=(kPack3&&kPack3!=='false'&&kPack3!=='')||(kPack6&&kPack6!=='false'&&kPack6!=='');
    if (hasFacial) {
      km.faciales++; km.porDia[kDia].faciales++;
      if (kMes===mesK&&kAno===anoK) {
        var facNom=kFacial.replace(/SUNSU-\d+\s*/,'').trim()||kFacial;
        facCount[facNom]=(facCount[facNom]||0)+1;
        if (!cosmMap[kCosm]) cosmMap[kCosm]={ingr:0,faciales:0};
        cosmMap[kCosm].ingr+=kEstimado; cosmMap[kCosm].faciales++;
      }
    } else if (hasPaq) {
      km.paquetes++; km.porDia[kDia].soloCompra++;
      if (kMes===mesK&&kAno===anoK) { if (!cosmMap[kCosm]) cosmMap[kCosm]={ingr:0,faciales:0}; cosmMap[kCosm].ingr+=kEstimado; }
    } else {
      km.porDia[kDia].soloCompra++;
    }
    if (kMes===mesK&&kAno===anoK&&prodData[ki-1]) {
      for (var kp=0;kp<prodHeaders.length;kp++) {
        var qty=parseInt(prodData[ki-1][kp])||0; if (qty<=0) continue;
        var pNom=(prodHeaders[kp]||'').toString().trim(); if (!pNom) continue;
        km.productos+=qty; prodCount[pNom]=(prodCount[pNom]||0)+qty;
      }
    }
  }

  var mN=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var mNF=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var keysOrdenados=Object.keys(mesesMap).sort();
  var historial=keysOrdenados.slice(-12).map(function(key,idx,arr){
    var m=mesesMap[key], parts=key.split('-'), mo=parseInt(parts[1]), y=parseInt(parts[0]);
    var prevIngr=idx>0?(mesesMap[arr[idx-1]].ingr||0):0;
    var crecIngr=prevIngr>0?Math.round((m.ingr-prevIngr)/prevIngr*100):0;
    return {key:key,label:mN[mo-1]+' '+y,ingr:Math.round(m.ingr*100)/100,clientas:Object.keys(m.clientas).length,faciales:m.faciales,paquetes:m.paquetes,productos:m.productos,crecIngr:crecIngr};
  });
  var curKey=anoK+'-'+(mesK<10?'0':'')+mesK;
  var cur=mesesMap[curKey]||{ingr:0,faciales:0,paquetes:0,productos:0,clientas:{},porDia:{}};
  var porDiaArr=Object.keys(cur.porDia).map(Number).sort(function(a,b){return a-b;}).map(function(d){
    return {dia:d,faciales:cur.porDia[d].faciales||0,soloCompra:cur.porDia[d].soloCompra||0,ingr:Math.round((cur.porDia[d].ingr||0)*100)/100};
  });
  var dC={0:0,1:0,2:0,3:0,4:0,5:0,6:0};
  var dN=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  Object.keys(cur.porDia).forEach(function(d){var f=new Date(anoK,mesK-1,parseInt(d));dC[f.getDay()]+=(cur.porDia[d].faciales||0);});
  var diasPico=Object.keys(dC).map(function(k){return{d:dN[parseInt(k)],c:dC[k]};}).sort(function(a,b){return b.c-a.c;});
  var nClientes=Object.keys(cur.clientas).length;
  return {
    mes:mNF[mesK-1]+' '+anoK,
    ingresos:Math.round(cur.ingr*100)/100,
    clientas:nClientes,faciales:cur.faciales,paquetes:cur.paquetes,productos:cur.productos,
    avgTicket:nClientes>0?Math.round(cur.ingr/nClientes*100)/100:0,
    topFaciales:Object.keys(facCount).map(function(k){return{n:k,c:facCount[k]};}).sort(function(a,b){return b.c-a.c;}).slice(0,6),
    topProductos:Object.keys(prodCount).map(function(k){return{n:k,c:prodCount[k]};}).sort(function(a,b){return b.c-a.c;}).slice(0,8),
    topCosm:Object.keys(cosmMap).map(function(k){return{n:k,rev:Math.round(cosmMap[k].ingr*100)/100,faciales:cosmMap[k].faciales};}).sort(function(a,b){return b.rev-a.rev;}),
    diasPico:diasPico,porDia:porDiaArr,historial:historial
  };
}

function setupTriggersConDashboard() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("checkFechasCorte").timeBased().everyDays(1).atHour(12).create();
  ScriptApp.newTrigger("actualizarDashboard").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("actualizarKpisCache").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("guardarTodasLasCitas").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("sincronizarFacturas").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("backupSheetSemanal").timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  ScriptApp.newTrigger("sincronizarEfectivo").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("cuadreDiarioCaja").timeBased().everyDays(1).atHour(22).create();
  ScriptApp.newTrigger("controlRecepcionDiario").timeBased().everyDays(1).atHour(21).create();
  ScriptApp.newTrigger("generarKPIsHistoricos").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(4).create();
  // onEdit trigger for caja chica input rows
  ScriptApp.newTrigger("procesarInputCaja")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit().create();
  const wsTicket = SpreadsheetApp.getActiveSpreadsheet().getSheets()
    .find(s => s.getName().includes("TICKET_FICHA"));
  if (wsTicket) {
    ScriptApp.newTrigger("onFormSubmit")
      .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
      .onFormSubmit().create();
  }
  SpreadsheetApp.getActiveSpreadsheet().toast("✅ Triggers instalados.", "SUNSU — Setup completo", 10);
}

function checkFechasCorte() {
  const hoy = new Date();
  const dia = hoy.getDate();
  if (dia === 26) generarCorteComisiones(hoy);
  if (dia === 1 || dia === 16) generarCorteProveedores(hoy);
}

// ============================================================
// DASHBOARD — MI AVANCE
// ============================================================
function crearDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let wsDash = ss.getSheetByName("🌸 MI AVANCE");
  if (!wsDash) {
    wsDash = ss.insertSheet("🌸 MI AVANCE");
    wsDash.setTabColor(COLOR.PINK_D);
    ss.setActiveSheet(wsDash);
    ss.moveActiveSheet(1);
  }
  actualizarDashboard();
  ss.toast("✅ Dashboard actualizado.", "SUNSU", 5);
}

function actualizarDashboard() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const wsDash  = ss.getSheetByName("🌸 MI AVANCE");
  if (!wsDash) return;
  const hoy  = new Date();
  const dia  = hoy.getDate();
  const mes  = hoy.getMonth();   // 0-based
  const anio = hoy.getFullYear();
  // Period: 26 of current month → 25 of next month (if today >= 26)
  //         26 of previous month → 25 of current month (if today < 26)
  let fechaInicio, fechaFin;
  if (dia >= 26) {
    fechaInicio = new Date(anio, mes, 26, 0, 0, 0);
    fechaFin    = new Date(anio, mes + 1, 25, 23, 59, 59);
  } else {
    fechaInicio = new Date(anio, mes - 1, 26, 0, 0, 0);
    fechaFin    = new Date(anio, mes, 25, 23, 59, 59);
  }
  const datos = calcularComisiones(fechaInicio, fechaFin);
  const { cosmetologas, totalClientas, bonoActivo } = datos;
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const fmtD  = d => `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
  wsDash.clearContents();
  wsDash.clearFormats();
  let fila = 1;
  wsDash.getRange(fila,1,1,10).merge()
    .setValue("🌸 SUNSU SPA — MI AVANCE")
    .setBackground(COLOR.PINK_D).setFontColor("#FFFFFF")
    .setFontWeight("bold").setFontSize(16).setFontFamily("Arial")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  wsDash.setRowHeight(fila, 50); fila++;
  wsDash.getRange(fila,1,1,6).merge()
    .setValue(`📅 Período: ${fmtD(fechaInicio)} al ${fmtD(fechaFin)}`)
    .setBackground(COLOR.PINK_L).setFontColor(COLOR.PINK_D)
    .setFontWeight("bold").setFontSize(10).setFontFamily("Arial")
    .setHorizontalAlignment("left").setVerticalAlignment("middle");
  wsDash.getRange(fila,7,1,4).merge()
    .setValue(`🕐 ${Utilities.formatDate(hoy, "America/Guayaquil", "dd/MM/yyyy HH:mm")}`)
    .setBackground(COLOR.PINK_L).setFontColor(COLOR.PINK_D)
    .setFontSize(9).setFontFamily("Arial")
    .setHorizontalAlignment("right").setVerticalAlignment("middle");
  wsDash.setRowHeight(fila, 30); fila++;
  wsDash.getRange(fila,1,1,10).merge()
    .setValue(bonoActivo
      ? `✅ BONO DE PAQUETES ACTIVO — ${totalClientas} clientas este período`
      : `❌ BONO INACTIVO — ${totalClientas} clientas (se activa con 60+)`)
    .setBackground(bonoActivo ? COLOR.GREEN_L : COLOR.GOLD_L)
    .setFontColor(bonoActivo ? COLOR.GREEN : COLOR.GOLD)
    .setFontWeight("bold").setFontSize(10).setFontFamily("Arial")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  wsDash.setRowHeight(fila, 28); fila += 2;
  const nombres = Object.keys(cosmetologas);
  nombres.forEach(cosm => {
    const c    = cosmetologas[cosm];
    const col  = COLORES_COSM[cosm] || COLOR_DEFAULT;
    const multas = c.multas || 0, descuentos = c.descuentos || 0;
    const bruto  = c.comFaciales + c.comPaquetes + c.comProductos + (c.comExtras||0) + (c.comRecepcion||0);
    const neto   = Math.max(0, bruto - multas - descuentos);
    const nCosm  = nombres.length || 1;
    const totalProds = Object.values(c.detalle_productos).reduce((s,p) => s + p.qty, 0);
    const tieneDeducciones = multas > 0 || descuentos > 0;
    let siguienteNivel = null, paqParaSiguiente = 0;
    if (bonoActivo) {
      for (let n = 0; n < CONFIG.NIVELES.length; n++) {
        const [pct, premio] = CONFIG.NIVELES[n];
        const requerido = Math.ceil((totalClientas * pct) / nCosm);
        if (c.paquetes < requerido) { siguienteNivel = { nivel: n+1, premio }; paqParaSiguiente = requerido - c.paquetes; break; }
      }
    }
    const numCols = tieneDeducciones ? 13 : 11;
    wsDash.getRange(fila,1,1,numCols).merge()
      .setValue("💆 " + cosm.toUpperCase())
      .setBackground(col.header).setFontColor("#FFFFFF")
      .setFontWeight("bold").setFontSize(12).setFontFamily("Arial")
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    wsDash.setRowHeight(fila, 35); fila++;
    const metHeaders = tieneDeducciones
      ? ["FACIALES\nHECHOS","COMI\nFACIALES","PAQUETES\nVENDIDOS","NIVEL","COMI\nPAQUETES","PRODUCTOS\nVENDIDOS","COMI\nPRODUCTOS","EXTRAS\nVENDIDOS","COMI\nEXTRAS","COMI\nRECEP.","MULTAS","DESCUENTOS","NETO"]
      : ["FACIALES\nHECHOS","COMI\nFACIALES","PAQUETES\nVENDIDOS","NIVEL","COMI\nPAQUETES","PRODUCTOS\nVENDIDOS","COMI\nPRODUCTOS","EXTRAS\nVENDIDOS","COMI\nEXTRAS","COMI\nRECEP.","TOTAL"];
    metHeaders.forEach((h, i) => {
      const esMulta = tieneDeducciones && i === 10;
      const esDesc  = tieneDeducciones && i === 11;
      const esNeto  = tieneDeducciones ? i === 12 : i === 10;
      const bgH     = esMulta ? COLOR.RED : esDesc ? COLOR.GOLD : esNeto ? col.header : col.accent;
      wsDash.getRange(fila,i+1).setValue(h)
        .setBackground(bgH).setFontColor("#FFFFFF")
        .setFontWeight("bold").setFontSize(8).setFontFamily("Arial")
        .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
    });
    wsDash.setRowHeight(fila, 35); fila++;
    const valores = tieneDeducciones
      ? [c.faciales,"$"+c.comFaciales.toFixed(2),c.paquetes,c.nivelAlcanzado,"$"+c.comPaquetes.toFixed(2),totalProds,"$"+c.comProductos.toFixed(2),c.extras||0,"$"+(c.comExtras||0).toFixed(2),"$"+(c.comRecepcion||0).toFixed(2),multas>0?"-$"+multas.toFixed(2):"—",descuentos>0?"-$"+descuentos.toFixed(2):"—","$"+neto.toFixed(2)]
      : [c.faciales,"$"+c.comFaciales.toFixed(2),c.paquetes,c.nivelAlcanzado,"$"+c.comPaquetes.toFixed(2),totalProds,"$"+c.comProductos.toFixed(2),c.extras||0,"$"+(c.comExtras||0).toFixed(2),"$"+(c.comRecepcion||0).toFixed(2),"$"+neto.toFixed(2)];
    valores.forEach((v, i) => {
      const esMulta = tieneDeducciones && i === 10;
      const esDesc  = tieneDeducciones && i === 11;
      const esNeto  = tieneDeducciones ? i === 12 : i === 10;
      const bg = esMulta?COLOR.RED_L:esDesc?COLOR.GOLD_L:esNeto?col.header:col.bg;
      const fc = esMulta?COLOR.RED:esDesc?COLOR.PEACH:esNeto?"#FFFFFF":col.header;
      wsDash.getRange(fila,i+1).setValue(v)
        .setBackground(bg).setFontColor(fc)
        .setFontWeight(esNeto?"bold":"normal")
        .setFontSize(esNeto?14:12).setFontFamily("Arial")
        .setHorizontalAlignment("center").setVerticalAlignment("middle");
    });
    wsDash.setRowHeight(fila, 45); fila++;
    wsDash.getRange(fila,1,1,numCols).merge()
      .setValue(bonoActivo && siguienteNivel
        ? `🎯 Faltan ${paqParaSiguiente} paquete(s) para N${siguienteNivel.nivel} (+$${siguienteNivel.premio} acumulado)`
        : bonoActivo ? "🏆 ¡Nivel máximo alcanzado!" : "⏳ Bono se activa cuando el spa llegue a 60 clientas")
      .setBackground(col.bg).setFontColor(col.accent)
      .setFontWeight("bold").setFontSize(9).setFontFamily("Arial")
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    wsDash.setRowHeight(fila, 25); fila++;
    if (tieneDeducciones && c.notas_multas && c.notas_multas.length > 0) {
      const notasTexto = c.notas_multas.map(item => {
        const emoji = item.tipo === "multa" ? "🔴" : "🟡";
        return `${emoji} ${item.tipo}: -$${item.monto.toFixed(2)} — ${item.motivo}`;
      }).join("   |   ");
      wsDash.getRange(fila,1,1,numCols).merge()
        .setValue("📝 " + notasTexto)
        .setBackground(COLOR.RED_L).setFontColor(COLOR.RED)
        .setFontSize(8).setFontFamily("Arial")
        .setHorizontalAlignment("left").setVerticalAlignment("middle").setWrap(true);
      wsDash.setRowHeight(fila, 25); fila++;
    }
    wsDash.setRowHeight(fila, 8); fila++;
  });
  for (let c = 1; c <= 10; c++) wsDash.setColumnWidth(c, 110);
  wsDash.setColumnWidth(1, 160);
}

// ============================================================
// CORTE DE COMISIONES
// ============================================================
function generarCorteComisiones(fechaHoy) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fechaInicio = new Date(fechaHoy.getFullYear(), fechaHoy.getMonth()-1, 26, 0,0,0);
  const fechaFin    = new Date(fechaHoy.getFullYear(), fechaHoy.getMonth(), 25, 23,59,59);
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const nombrePeriodo = `COM ${meses[fechaInicio.getMonth()]}${String(fechaInicio.getFullYear()).slice(2)}-${meses[fechaFin.getMonth()]}${String(fechaFin.getFullYear()).slice(2)}`;
  const tituloPeriodo = `${meses[fechaInicio.getMonth()]} 26 — ${meses[fechaFin.getMonth()]} 25, ${fechaFin.getFullYear()}`;
  const datos = calcularComisiones(fechaInicio, fechaFin);
  const props = PropertiesService.getScriptProperties();
  const stored = JSON.parse(props.getProperty('SUNSU_HISTORIAL_COMISIONES')||'{}');
  stored[nombrePeriodo] = {
    nombre: nombrePeriodo,
    titulo: tituloPeriodo,
    clientas: datos.totalClientas,
    bonoActivo: datos.bonoActivo,
    cosmetologas: Object.keys(datos.cosmetologas).map(function(k){
      const c = datos.cosmetologas[k];
      const bruto = c.comFaciales + c.comPaquetes + c.comProductos + (c.comExtras||0) + (c.comRecepcion||0);
      const neto = Math.max(0, bruto - (c.multas||0) - (c.descuentos||0));
      const totalProdsC = Object.values(c.detalle_productos||{}).reduce(function(s,p){return s+p.qty;},0);
      return {name:k, color:(COLORES_COSM[k]&&COLORES_COSM[k].header)||'#5B7FA6',
              f:c.faciales||0, paq:c.paquetes||0, niv:c.nivelAlcanzado||'—',
              cf:Math.round(c.comFaciales*100)/100, cpaq:Math.round(c.comPaquetes*100)/100,
              cprod:Math.round(c.comProductos*100)/100, total:Math.round(neto*100)/100,
              ext:c.extras||0, cext:Math.round((c.comExtras||0)*100)/100,
              crecep:Math.round((c.comRecepcion||0)*100)/100, diasRecep:c.diasRecepcion||0,
              totalProd:totalProdsC, m:Math.round((c.multas||0)*100)/100, d:Math.round((c.descuentos||0)*100)/100};
    })
  };
  props.setProperty('SUNSU_HISTORIAL_COMISIONES', JSON.stringify(stored));
  // Also create sheet if it doesn't exist
  if (!ss.getSheetByName(nombrePeriodo)) {
    crearPestanaComisiones(ss, nombrePeriodo, datos, fechaInicio, fechaFin);
  }
  ss.toast(`✅ Período ${nombrePeriodo} generado.`, "SUNSU", 15);
}

function calcularComisiones(fechaInicio, fechaFin) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const wsTicket = ss.getSheets().find(s => s.getName().includes('TICKET_FICHA'));
  if (!wsTicket) throw new Error("No se encontró TICKET_FICHA");
  const datos       = wsTicket.getDataRange().getValues();
  const headers     = datos[0];
  const precios     = leerPrecios(ss);
  const prodHeaders = headers.slice(CONFIG.COL_PRODUCTOS_START - 1);
  const EXCL = exclColsFromHeaders_(headers);
  const cosmetologas = {};
  const clientasSet  = new Set();
  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i];
    const ts   = fila[CONFIG.COL_TIMESTAMP - 1];
    if (!ts) continue;
    const fecha = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(fecha.getTime()) || fecha < fechaInicio || fecha > fechaFin) continue;
    const cosm = (fila[CONFIG.COL_COSMETOLOGA - 1] || "").toString().trim();
    if (!cosm || cosm.toUpperCase() === "SUNSU") continue;
    if (((fila[2]||"").toString().split(".")[0]) === '1793219469001') continue; // cliente = Sunsu Spa (consumo interno)
    if (!cosmetologas[cosm]) cosmetologas[cosm] = { faciales:0, comFaciales:0, paquetes:0, comProductos:0, extras:0, comExtras:0, detalle_productos:{}, multas:0, descuentos:0, notas_multas:[] };
    const c = cosmetologas[cosm];
    const facial   = (fila[CONFIG.COL_FACIAL - 1] || "").toString();
    const skuMatch = facial.match(/SUNSU-(\d+)/);
    if (skuMatch) {
      const sku = "SUNSU-" + skuMatch[1];
      clientasSet.add(i.toString());
      const exclFacial = fila[EXCL.facial - 1] === true;
      if (!exclFacial) {
        if (CONFIG.FACIALES_2.includes(sku))      { c.faciales++; c.comFaciales += 2; }
        else if (CONFIG.FACIALES_3.includes(sku)) { c.faciales++; c.comFaciales += 3; }
      }
    }
    const pack3 = (fila[CONFIG.COL_PACK3 - 1] || "").toString().trim();
    const pack6 = (fila[CONFIG.COL_PACK6 - 1] || "").toString().trim();
    const exclPaquete = fila[EXCL.paquete - 1] === true;
    if (!exclPaquete) {
      if (pack3 && pack3 !== "" && pack3.toLowerCase() !== "false") c.paquetes += 1;
      if (pack6 && pack6 !== "" && pack6.toLowerCase() !== "false") c.paquetes += 2;
    }
    // ── EXTRAS: $1 de comisión por extra vendido (col W; cortesías no cuentan) ──
    // Exclusión propia: checkbox '❌ EXCLUIR EXTRAS' (col BV)
    const exclExtrasRow = fila[EXCL.extras - 1] === true;
    if (!exclExtrasRow) {
      const nExtras = contarExtrasVendidos_(fila[CONFIG.COL_EXTRAS - 1]);
      if (nExtras > 0) { c.extras += nExtras; c.comExtras += nExtras * 1; }
    }
    for (let p = 0; p < prodHeaders.length; p++) {
      const qty = parseInt(fila[CONFIG.COL_PRODUCTOS_START - 1 + p]) || 0;
      if (qty <= 0) continue;
      const prodHeader = (prodHeaders[p] || "").toString().trim();
      if (!prodHeader) continue;
      const sku = prodHeader.startsWith("SUNSU-") ? prodHeader : "SUNSU-" + prodHeader;
      const exclProducto = fila[EXCL.producto - 1] === true;
      if (precios[sku] && !exclProducto) {
        const com = (precios[sku].venta - precios[sku].compra) * qty * 0.30;
        c.comProductos += com;
        if (!c.detalle_productos[sku]) c.detalle_productos[sku] = { nombre: precios[sku].nombre, qty: 0, com: 0 };
        c.detalle_productos[sku].qty += qty;
        c.detalle_productos[sku].com += com;
      }
    }
  }
  const totalClientas = clientasSet.size;
  const nCosm         = Object.keys(cosmetologas).length || 1;
  const bonoActivo    = totalClientas >= CONFIG.MIN_CLIENTAS_BONO;
  Object.keys(cosmetologas).forEach(cosm => {
    const c = cosmetologas[cosm];
    c.comPaquetes = 0; c.nivelAlcanzado = "—";
    if (!bonoActivo) return;
    let premioMax = 0, nivelMax = -1;
    CONFIG.NIVELES.forEach(([pct, premio], idx) => {
      if (c.paquetes >= Math.ceil((totalClientas * pct) / nCosm)) { nivelMax = idx + 1; premioMax = premio; }
    });
    if (nivelMax > 0) { c.comPaquetes = premioMax; c.nivelAlcanzado = "N" + nivelMax; }
  });
  // ── Comisión de recepción: inyectar DESPUÉS del cálculo de niveles (para no
  //    alterar nCosm/umbrales de paquetes) y ANTES de multas (para que se le apliquen) ──
  try {
    const recepDat = calcularComisionRecepcion(fechaInicio, fechaFin);
    if (recepDat.total > 0) {
      const rn = CONFIG.RECEPCIONISTA;
      if (!cosmetologas[rn]) cosmetologas[rn] = { faciales:0, comFaciales:0, paquetes:0, comProductos:0, extras:0, comExtras:0, comPaquetes:0, nivelAlcanzado:"—", detalle_productos:{}, multas:0, descuentos:0, notas_multas:[] };
      cosmetologas[rn].comRecepcion  = recepDat.total;
      cosmetologas[rn].diasRecepcion = recepDat.diasCumplidos;
    }
  } catch(eRecep) {}
  const multasData = leerMultas(ss, fechaInicio, fechaFin);
  Object.keys(cosmetologas).forEach(cosm => {
    const multaKey = Object.keys(multasData).find(k => k.toLowerCase() === cosm.toLowerCase());
    if (multaKey) {
      cosmetologas[cosm].multas       = multasData[multaKey].multas;
      cosmetologas[cosm].descuentos   = multasData[multaKey].descuentos;
      cosmetologas[cosm].notas_multas = multasData[multaKey].detalle;
    }
  });
  return { cosmetologas, totalClientas, bonoActivo };
}

function leerPrecios(ss) {
  const wsCat = ss.getSheets().find(s => s.getName().includes('CATALOGO'));
  if (!wsCat) return {};
  const datos = wsCat.getDataRange().getValues();
  const precios = {};
  for (let i = 2; i < datos.length; i++) {
    const sku    = (datos[i][0] || "").toString().trim();
    const venta  = parseFloat(datos[i][3]) || 0;  // Col D = SUBTOTAL (sin IVA) ✅
    const compra = parseFloat(datos[i][6]) || 0;  // Col G = PRECIO COMPRA (sin IVA) ✅
    if (sku) precios[sku] = { nombre: (datos[i][1] || "").toString().trim(), venta, compra };
  }
  return precios;
}

function leerMultas(ss, fechaInicio, fechaFin) {
  const wsMultas = ss.getSheetByName(CONFIG.SHEET_MULTAS);
  if (!wsMultas) return {};
  const datos  = wsMultas.getDataRange().getValues();
  const multas = {};
  for (let i = 1; i < datos.length; i++) {
    const fila  = datos[i];
    const fecha = fila[0] instanceof Date ? fila[0] : new Date(fila[0]);
    if (isNaN(fecha.getTime()) || fecha < fechaInicio || fecha > fechaFin) continue;
    const cosm   = (fila[1] || "").toString().trim();
    const tipo   = (fila[2] || "").toString().trim().toLowerCase();
    const monto  = parseFloat(fila[3]) || 0;
    const motivo = (fila[4] || "").toString().trim();
    if (!cosm || monto <= 0) continue;
    if (!multas[cosm]) multas[cosm] = { multas: 0, descuentos: 0, detalle: [] };
    if (tipo === "multa")          multas[cosm].multas     += monto;
    else if (tipo === "descuento") multas[cosm].descuentos += monto;
    if (motivo) multas[cosm].detalle.push({ tipo, monto, motivo });
  }
  return multas;
}

function crearPestanaComisiones(ss, nombre, datos, fechaInicio, fechaFin) {
  const ws = ss.insertSheet(nombre);
  ws.setTabColor(COLOR.PINK_DARK);
  const { cosmetologas, totalClientas, bonoActivo } = datos;
  const fmt = d => Utilities.formatDate(d, "America/Guayaquil", "dd/MM/yyyy");
  let fila = 1;
  ws.getRange(fila,1,1,11).merge()
    .setValue("SUNSU SPA — COMISIONES PERÍODO: " + fmt(fechaInicio) + " al " + fmt(fechaFin))
    .setBackground(COLOR.PINK_DARK).setFontColor(COLOR.WHITE).setFontWeight("bold").setFontSize(11).setFontFamily("Arial");
  ws.setRowHeight(fila,35); fila++;
  ws.getRange(fila,1).setValue("Clientas:").setFontWeight("bold").setFontSize(9).setFontFamily("Arial");
  ws.getRange(fila,2).setValue(totalClientas).setFontSize(9).setFontFamily("Arial");
  ws.getRange(fila,4).setValue("Bono paquetes:").setFontWeight("bold").setFontSize(9).setFontFamily("Arial");
  ws.getRange(fila,5).setValue(bonoActivo ? "✅ ACTIVO" : "❌ INACTIVO (<60)")
    .setBackground(bonoActivo?COLOR.GREEN_BG:COLOR.AMBER_BG)
    .setFontColor(bonoActivo?COLOR.GREEN_TXT:COLOR.GOLD_DARK).setFontWeight("bold").setFontSize(9).setFontFamily("Arial");
  fila++;
  ["COSMETÓLOGA","FACIALES\nHECHOS","COMI\nFACIALES","PAQUETES\nVENDIDOS","NIVEL","COMI\nPAQUETES","COMI\nPRODUCTOS","EXTRAS\nVENDIDOS","COMI\nEXTRAS","COMI\nRECEP.","TOTAL\nCOMISIÓN"].forEach((h,i) => {
    ws.getRange(fila,i+1).setValue(h).setBackground(COLOR.PINK_DARK).setFontColor(COLOR.WHITE)
      .setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center").setWrap(true);
  });
  ws.setRowHeight(fila,35); fila++;
  const filaInicioData = fila;
  const nombres = Object.keys(cosmetologas);
  if (!nombres.length) {
    ws.getRange(fila,1,1,11).merge().setValue("No se encontraron registros")
      .setFontColor(COLOR.GRAY_DARK).setFontStyle("italic").setFontSize(9).setFontFamily("Arial");
    fila++;
  }
  nombres.forEach((cosm,idx) => {
    const c = cosmetologas[cosm];
    const total = Math.max(0, c.comFaciales+c.comPaquetes+c.comProductos+(c.comExtras||0)+(c.comRecepcion||0)-(c.multas||0)-(c.descuentos||0));
    const bg = idx%2===0?COLOR.PINK_LIGHT:COLOR.WHITE;
    ws.getRange(fila,1).setValue(cosm).setBackground(bg).setFontWeight("bold").setFontSize(9).setFontFamily("Arial");
    ws.getRange(fila,2).setValue(c.faciales).setBackground(bg).setHorizontalAlignment("center").setFontSize(9).setFontFamily("Arial");
    ws.getRange(fila,3).setValue(c.comFaciales).setBackground(bg).setNumberFormat('"$"#,##0.00').setFontColor(COLOR.GREEN_TXT).setHorizontalAlignment("right").setFontSize(9).setFontFamily("Arial");
    ws.getRange(fila,4).setValue(c.paquetes).setBackground(bg).setHorizontalAlignment("center").setFontSize(9).setFontFamily("Arial");
    ws.getRange(fila,5).setValue(c.nivelAlcanzado).setBackground(bg).setHorizontalAlignment("center").setFontWeight("bold").setFontColor(COLOR.PINK_DARK).setFontSize(9).setFontFamily("Arial");
    ws.getRange(fila,6).setValue(c.comPaquetes).setBackground(bg).setNumberFormat('"$"#,##0.00').setFontColor(COLOR.GREEN_TXT).setHorizontalAlignment("right").setFontSize(9).setFontFamily("Arial");
    ws.getRange(fila,7).setValue(c.comProductos).setBackground(bg).setNumberFormat('"$"#,##0.00').setFontColor(COLOR.GREEN_TXT).setHorizontalAlignment("right").setFontSize(9).setFontFamily("Arial");
    ws.getRange(fila,8).setValue(c.extras||0).setBackground(bg).setHorizontalAlignment("center").setFontSize(9).setFontFamily("Arial");
    ws.getRange(fila,9).setValue(c.comExtras||0).setBackground(bg).setNumberFormat('"$"#,##0.00').setFontColor(COLOR.GREEN_TXT).setHorizontalAlignment("right").setFontSize(9).setFontFamily("Arial");
    ws.getRange(fila,10).setValue(c.comRecepcion||0).setBackground(bg).setNumberFormat('"$"#,##0.00').setFontColor(COLOR.GREEN_TXT).setHorizontalAlignment("right").setFontSize(9).setFontFamily("Arial");
    ws.getRange(fila,11).setValue(total).setBackground(COLOR.PINK_LIGHT).setNumberFormat('"$"#,##0.00').setFontWeight("bold").setFontColor(COLOR.PINK_DARK).setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("right");
    fila++;
  });
  ws.getRange(fila,1,1,2).merge().setValue("TOTAL GENERAL").setBackground(COLOR.PINK_DARK).setFontColor(COLOR.WHITE).setFontWeight("bold").setFontSize(10).setFontFamily("Arial");
  [3,6,7,9,10,11].forEach(col => {
    ws.getRange(fila,col).setFormula(`=SUM(${String.fromCharCode(64+col)}${filaInicioData}:${String.fromCharCode(64+col)}${fila-1})`)
      .setBackground(COLOR.PINK_DARK).setFontColor(COLOR.WHITE).setFontWeight("bold").setNumberFormat('"$"#,##0.00').setHorizontalAlignment("right").setFontFamily("Arial");
  });
  fila += 2;
  ws.getRange(fila,1,1,11).merge().setValue("DETALLE DE PRODUCTOS VENDIDOS POR COSMETÓLOGA")
    .setBackground(COLOR.GRAY_DARK).setFontColor(COLOR.WHITE).setFontWeight("bold").setFontSize(9).setFontFamily("Arial");
  fila++;
  ["COSMETÓLOGA","SKU","PRODUCTO","UNIDADES","COMISIÓN (30%)"].forEach((h,i) => {
    ws.getRange(fila,i+1).setValue(h).setBackground(COLOR.PINK_MED).setFontColor(COLOR.WHITE)
      .setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center");
  });
  fila++;
  nombres.forEach(cosm => {
    const c = cosmetologas[cosm];
    const prods = Object.entries(c.detalle_productos);
    if (!prods.length) {
      ws.getRange(fila,1).setValue(cosm).setFontWeight("bold").setFontSize(9).setFontFamily("Arial");
      ws.getRange(fila,2,1,4).merge().setValue("Sin ventas").setFontColor(COLOR.GRAY_DARK).setFontStyle("italic").setFontSize(9).setFontFamily("Arial");
      fila++; return;
    }
    prods.forEach(([sku,info],idx) => {
      const bg = idx%2===0?COLOR.PEACH_L:COLOR.WHITE;
      ws.getRange(fila,1).setValue(idx===0?cosm:"").setFontWeight("bold").setFontSize(9).setFontFamily("Arial").setBackground(bg);
      ws.getRange(fila,2).setValue(sku).setFontSize(8).setFontFamily("Arial").setBackground(bg).setFontColor(COLOR.GRAY_DARK);
      ws.getRange(fila,3).setValue(info.nombre).setFontSize(9).setFontFamily("Arial").setBackground(bg);
      ws.getRange(fila,4).setValue(info.qty).setHorizontalAlignment("center").setFontSize(9).setFontFamily("Arial").setBackground(bg);
      ws.getRange(fila,5).setValue(info.com).setNumberFormat('"$"#,##0.00').setFontColor(COLOR.GREEN_TXT).setHorizontalAlignment("right").setFontSize(9).setFontFamily("Arial").setBackground(bg);
      fila++;
    });
  });
  ws.setColumnWidth(1,220); ws.setColumnWidth(2,80); ws.setColumnWidth(3,80);
  ws.setColumnWidth(4,90);  ws.setColumnWidth(5,70); ws.setColumnWidth(6,90);
  ws.setColumnWidth(7,110); ws.setColumnWidth(8,110);
}

// ============================================================
// CORTE QUINCENAL PROVEEDORES
// ============================================================
function generarCorteProveedores(fechaHoy) {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const dia = fechaHoy.getDate(), mes = fechaHoy.getMonth(), año = fechaHoy.getFullYear();
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  let fechaInicio, fechaFin, nombrePeriodo;
  if (dia === 16) {
    fechaInicio = new Date(año,mes,1); fechaFin = new Date(año,mes,15,23,59,59);
    nombrePeriodo = `PROV 01-15 ${meses[mes]}${String(año).slice(2)}`;
  } else {
    const mesPrev = mes===0?11:mes-1, añoPrev = mes===0?año-1:año;
    const ultimoDia = new Date(año,mes,0).getDate();
    fechaInicio = new Date(añoPrev,mesPrev,16); fechaFin = new Date(añoPrev,mesPrev,ultimoDia,23,59,59);
    nombrePeriodo = `PROV 16-fin ${meses[mesPrev]}${String(añoPrev).slice(2)}`;
  }
  if (ss.getSheetByName(nombrePeriodo)) return;
  crearPestanaProveedores(ss, nombrePeriodo, calcularVentasProductos(fechaInicio,fechaFin), fechaInicio, fechaFin);
  ss.toast(`✅ Reporte ${nombrePeriodo} generado.`, "SUNSU", 15);
}

function calcularVentasProductos(fechaInicio, fechaFin) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const wsTicket = ss.getSheets().find(s => s.getName().includes('TICKET_FICHA'));
  if (!wsTicket) return {};
  const datos = wsTicket.getDataRange().getValues();
  const prodHeaders = datos[0].slice(CONFIG.COL_PRODUCTOS_START - 1);
  const precios = leerPrecios(ss);
  const ventas  = {};
  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i];
    const ts   = fila[CONFIG.COL_TIMESTAMP - 1];
    if (!ts) continue;
    const fecha = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(fecha.getTime()) || fecha < fechaInicio || fecha > fechaFin) continue;
    const cosm = (fila[CONFIG.COL_COSMETOLOGA-1]||"").toString().trim();
    for (let p = 0; p < prodHeaders.length; p++) {
      const qty = parseInt(fila[CONFIG.COL_PRODUCTOS_START-1+p])||0;
      if (qty<=0) continue;
      const prodHeader = (prodHeaders[p]||"").toString().trim();
      if (!prodHeader) continue;
      const sku = prodHeader.startsWith("SUNSU-")?prodHeader:"SUNSU-"+prodHeader;
      if (!ventas[sku]) ventas[sku] = { nombre:precios[sku]?precios[sku].nombre:sku, compra:precios[sku]?precios[sku].compra:0, total:0, porCosm:{} };
      ventas[sku].total += qty;
      ventas[sku].porCosm[cosm] = (ventas[sku].porCosm[cosm]||0)+qty;
    }
  }
  return ventas;
}

function crearPestanaProveedores(ss, nombre, ventas, fechaInicio, fechaFin) {
  const ws  = ss.insertSheet(nombre);
  ws.setTabColor(COLOR.BLUE_DARK);
  const fmt = d => Utilities.formatDate(d, "America/Guayaquil", "dd/MM/yyyy");
  let fila  = 1;
  ws.getRange(fila,1,1,7).merge().setValue("SUNSU SPA — VENTAS A PROVEEDORES: "+fmt(fechaInicio)+" al "+fmt(fechaFin))
    .setBackground(COLOR.BLUE_DARK).setFontColor(COLOR.WHITE).setFontWeight("bold").setFontSize(11).setFontFamily("Arial");
  ws.setRowHeight(fila,35); fila++;
  ["SKU","PRODUCTO","PROVEEDOR","UNIDADES\nVENDIDAS","PRECIO\nCOMPRA","TOTAL\nCOSTO","DESGLOSE POR COSMETÓLOGA"].forEach((h,i)=>{
    ws.getRange(fila,i+1).setValue(h).setBackground(COLOR.BLUE_DARK).setFontColor(COLOR.WHITE)
      .setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center").setWrap(true);
  });
  ws.setRowHeight(fila,35); fila++;
  const filaInicioData = fila;
  const skus = Object.keys(ventas).sort();
  if (!skus.length) { ws.getRange(fila,1,1,7).merge().setValue("Sin ventas en este período").setFontColor(COLOR.GRAY_DARK).setFontStyle("italic").setFontSize(9).setFontFamily("Arial"); fila++; }
  skus.forEach((sku,idx)=>{
    const v=ventas[sku], bg=idx%2===0?COLOR.BLUE_BG:COLOR.WHITE;
    let prov="—";
    if(sku.includes("-HT-")) prov="ANUA / Common Labs";
    else if(sku.includes("-AS-")) prov="Eyenlip";
    else if(sku.includes("-ML-")) prov="Dr.esthe";
    else if(sku.includes("-PH-")) prov="APHLORA";
    else if(sku.includes("-JN-")) prov="RiRe / Holika Holika";
    const desglose=Object.entries(v.porCosm).map(([c,q])=>`${c.split(" ")[0]}: ${q}`).join(" | ");
    ws.getRange(fila,1).setValue(sku).setBackground(bg).setFontSize(8).setFontFamily("Arial").setFontColor(COLOR.GRAY_DARK);
    ws.getRange(fila,2).setValue(v.nombre).setBackground(bg).setFontSize(9).setFontFamily("Arial");
    ws.getRange(fila,3).setValue(prov).setBackground(bg).setFontSize(9).setFontFamily("Arial").setHorizontalAlignment("center");
    ws.getRange(fila,4).setValue(v.total).setBackground(bg).setFontWeight("bold").setHorizontalAlignment("center").setFontSize(10).setFontFamily("Arial");
    ws.getRange(fila,5).setValue(v.compra).setBackground(bg).setNumberFormat('"$"#,##0.00').setHorizontalAlignment("right").setFontSize(9).setFontFamily("Arial");
    ws.getRange(fila,6).setValue(v.total*v.compra).setBackground(bg).setNumberFormat('"$"#,##0.00').setFontColor(COLOR.BLUE_DARK).setFontWeight("bold").setHorizontalAlignment("right").setFontSize(9).setFontFamily("Arial");
    ws.getRange(fila,7).setValue(desglose).setBackground(bg).setFontSize(8).setFontFamily("Arial").setFontColor(COLOR.GRAY_DARK);
    fila++;
  });
  ws.getRange(fila,1,1,3).merge().setValue("TOTAL").setBackground(COLOR.BLUE_DARK).setFontColor(COLOR.WHITE).setFontWeight("bold").setFontSize(10).setFontFamily("Arial");
  ws.getRange(fila,4).setFormula(`=SUM(D${filaInicioData}:D${fila-1})`).setBackground(COLOR.BLUE_DARK).setFontColor(COLOR.WHITE).setFontWeight("bold").setHorizontalAlignment("center").setFontFamily("Arial");
  ws.getRange(fila,6).setFormula(`=SUM(F${filaInicioData}:F${fila-1})`).setBackground(COLOR.BLUE_DARK).setFontColor(COLOR.WHITE).setFontWeight("bold").setNumberFormat('"$"#,##0.00').setHorizontalAlignment("right").setFontFamily("Arial");
  ws.setColumnWidth(1,160); ws.setColumnWidth(2,380); ws.setColumnWidth(3,140);
  ws.setColumnWidth(4,90);  ws.setColumnWidth(5,100); ws.setColumnWidth(6,100); ws.setColumnWidth(7,280);
}

// ============================================================
// FUNCIONES MANUALES
// ============================================================
function generarCorteManualComisiones() {
  const ui   = SpreadsheetApp.getUi();
  const resp = ui.prompt("Corte manual de comisiones","Ingresa el mes de CIERRE YYYY-MM\n(ej: 2025-09 = 26-ago al 25-sep):",ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton()!==ui.Button.OK) return;
  const match = resp.getResponseText().trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) { ui.alert("Formato incorrecto. Usa YYYY-MM"); return; }
  const año=parseInt(match[1]), mes=parseInt(match[2])-1;
  const fechaInicio=new Date(año,mes-1,26,0,0,0), fechaFin=new Date(año,mes,25,23,59,59);
  const meses=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const nombrePeriodo=`COM ${meses[fechaInicio.getMonth()]}${String(fechaInicio.getFullYear()).slice(2)}-${meses[fechaFin.getMonth()]}${String(fechaFin.getFullYear()).slice(2)}`;
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(nombrePeriodo)) {
    if (ui.alert("Ya existe '"+nombrePeriodo+"'. ¿Sobreescribir?",ui.ButtonSet.YES_NO)!==ui.Button.YES) return;
    ss.deleteSheet(ss.getSheetByName(nombrePeriodo));
  }
  crearPestanaComisiones(ss, nombrePeriodo, calcularComisiones(fechaInicio,fechaFin), fechaInicio, fechaFin);
  ui.alert("✅ Listo. Pestaña '"+nombrePeriodo+"' generada.");
}

function generarCorteManualProveedores() {
  const ui   = SpreadsheetApp.getUi();
  const resp = ui.prompt("Corte manual de proveedores","Ingresa YYYY-MM-Q\nQ=1 (1-15) o Q=2 (16-fin)\nEj: 2025-09-1",ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton()!==ui.Button.OK) return;
  const match=resp.getResponseText().trim().match(/^(\d{4})-(\d{2})-([12])$/);
  if (!match) { ui.alert("Formato incorrecto."); return; }
  const año=parseInt(match[1]), mes=parseInt(match[2])-1, quin=parseInt(match[3]);
  const meses=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  let fechaInicio,fechaFin,nombrePeriodo;
  if (quin===1) { fechaInicio=new Date(año,mes,1); fechaFin=new Date(año,mes,15,23,59,59); nombrePeriodo=`PROV 01-15 ${meses[mes]}${String(año).slice(2)}`; }
  else { const ud=new Date(año,mes+1,0).getDate(); fechaInicio=new Date(año,mes,16); fechaFin=new Date(año,mes,ud,23,59,59); nombrePeriodo=`PROV 16-fin ${meses[mes]}${String(año).slice(2)}`; }
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(nombrePeriodo)) {
    if (ui.alert("Ya existe '"+nombrePeriodo+"'. ¿Sobreescribir?",ui.ButtonSet.YES_NO)!==ui.Button.YES) return;
    ss.deleteSheet(ss.getSheetByName(nombrePeriodo));
  }
  crearPestanaProveedores(ss, nombrePeriodo, calcularVentasProductos(fechaInicio,fechaFin), fechaInicio, fechaFin);
  ui.alert("✅ Listo. Pestaña '"+nombrePeriodo+"' generada.");
}

// ============================================================
// AUTO-REGISTRO DE PAQUETES
// ============================================================
function onFormSubmit(e) {
  // sincronizarPaquetes now runs from doPost directly — no longer needed here
  Logger.log("onFormSubmit fired");
}

function mapearNombreCosm(nombre) {
  const n = nombre.toLowerCase().trim();
  if (n.includes("andrea"))    return "ANDREA ROBLES POGO";
  if (n.includes("daniela"))   return "DANIELA MORA";
  if (n.includes("cristina")||n.includes("ocaña")) return "MARIA CRISTINA OCAÑA";
  if (n.includes("dejaneira")) return "DEJANEIRA ESPINOZA";
  if (n.includes("alejandra")) return "ALEJANDRA RODRIGUEZ";
  return nombre;
}

function sincronizarPaquetes() {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const wsTicket = ss.getSheets().find(s => s.getName().includes("TICKET_FICHA"));
  const wsPaq    = ss.getSheetByName("📋 PAQUETES");
  if (!wsTicket || !wsPaq) return;

  const ticketData = wsTicket.getDataRange().getValues();
  const paqData    = wsPaq.getDataRange().getValues();

  // NEVER touch rows 1-425 (historical from old system)
  // Rows 426+ are managed by this system
  // Dedup key = timestamp stored in col Y (index 24) of PAQUETES rows 426+
  const PRIMERA_FILA = 429; // 1-based sheet row
  const yaRegistradas = new Set();
  for (let i = PRIMERA_FILA - 1; i < paqData.length; i++) {
    const nota = (paqData[i][24]||'').toString().trim();
    if (nota) yaRegistradas.add(nota);
  }

  // Find next empty row AFTER row 1440 — scan col D (cedula) in rows 1441+
  let filaDestino = PRIMERA_FILA;
  try {
    const _slr = wsPaq.getLastRow();
    const _slc = Math.max(1, _slr - PRIMERA_FILA + 1);
    const seccion = _slc > 0 ? wsPaq.getRange(PRIMERA_FILA, 4, _slc, 1).getValues() : [];
    for (let r = 0; r < seccion.length; r++) {
      if ((seccion[r][0]||'').toString().trim()) filaDestino = PRIMERA_FILA + r + 1;
    }
  } catch(ex) { filaDestino = PRIMERA_FILA; }
  let nuevosAgregados = 0;

  for (let i = 225; i < ticketData.length; i++) {
    const fila = ticketData[i], ts = fila[0];
    if (!ts) continue;
    const cosm     = (fila[1]||'').toString().trim();
    const cedula   = (fila[2]||'').toString().trim();
    const nombre   = (fila[3]||'').toString().trim();
    const apellido = (fila[4]||'').toString().trim();
    const pack3    = (fila[20]||'').toString().trim();
    const pack6    = (fila[21]||'').toString().trim();
    if (!cedula) continue;
    const tienePack3 = pack3 && pack3 !== '' && pack3.toLowerCase() !== 'false';
    const tienePack6 = pack6 && pack6 !== '' && pack6.toLowerCase() !== 'false';
    if (!tienePack3 && !tienePack6) continue;

    // Timestamp as unique key
    const tsKey = ts instanceof Date ? ts.toISOString() : ts.toString().trim();
    if (yaRegistradas.has(tsKey)) continue;

    var fechaTs;
    if (ts instanceof Date) { fechaTs = ts; }
    else {
      fechaTs = new Date(ts.toString().trim());
      if (isNaN(fechaTs.getTime())) {
        var parts = ts.toString().split(/[\s\/\-:]/);
        if (parts.length >= 3) {
          var p0=parseInt(parts[0]),p1=parseInt(parts[1]),p2=parseInt(parts[2]);
          fechaTs = p2 > 1000 ? new Date(p2,p0-1,p1) : new Date(p0,p1-1,p2);
        }
      }
    }
    if (!fechaTs || isNaN(fechaTs.getTime())) continue;

    const diaK = parseInt(Utilities.formatDate(fechaTs,'America/Guayaquil','d'));
    const mesK = parseInt(Utilities.formatDate(fechaTs,'America/Guayaquil','M'));
    const anoK = parseInt(Utilities.formatDate(fechaTs,'America/Guayaquil','yyyy'));

    let skuPaq='', nomPaq='';
    if (tienePack3) { const m=pack3.match(/SUNSU-\d+/); skuPaq=m?m[0]:pack3; nomPaq=pack3; }
    else            { const m=pack6.match(/SUNSU-\d+/); skuPaq=m?m[0]:pack6; nomPaq=pack6; }

    wsPaq.getRange(filaDestino, 1, 1, 10).setValues([[
      diaK, mesK, anoK, cedula, nombre, apellido, '', skuPaq, nomPaq, mapearNombreCosm(cosm)
    ]]);
    wsPaq.getRange(filaDestino, 25).setValue(tsKey); // col Y = timestamp key

    yaRegistradas.add(tsKey);
    filaDestino++;
    nuevosAgregados++;
  }
  if (nuevosAgregados > 0) SpreadsheetApp.getActiveSpreadsheet().toast(
    `✅ ${nuevosAgregados} paquete(s) nuevo(s) agregado(s).`, 'SUNSU — Auto-registro', 8);
}


// ============================================================
// WEB APP — doGet (todos los endpoints de la app móvil)
// ============================================================
function doGet(e) {
  var callback = e && e.parameter && e.parameter.callback;
  var action   = e && e.parameter && e.parameter.action;
  var page     = e && e.parameter && e.parameter.page;

  // ── Caja Chica Web App (sin autenticación requerida) ──
  if (page === 'caja') {
    return HtmlService.createHtmlOutput(getCajaWebHtml())
      .setTitle('💵 Caja Chica — SUNSU SPA')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try {

    // ── 1. Buscar cliente por cédula ──
    // ── Historial de Gift Cards digitales generadas ──
    if (action === 'getGCDigitales') {
      var gcdStore = {};
      try { gcdStore = JSON.parse(PropertiesService.getScriptProperties().getProperty('SUNSU_GC_DIGITALES')||'{}'); } catch(eGD) {}
      // Auto-limpieza: un registro digital solo es válido si su código existe en
      // 🎁 GIFT CARDS con datos de venta (cédula o nombre). Si la fila fue
      // liberada/borrada, el registro digital se elimina automáticamente.
      try {
        var wsGCD = ss.getSheetByName('🎁 GIFT CARDS');
        if (wsGCD) {
          var gcdSheet = wsGCD.getDataRange().getValues();
          var vendidasGCD = {};
          for (var gvi = 2; gvi < gcdSheet.length; gvi++) {
            var codV = (gcdSheet[gvi][0]||'').toString().trim();
            if (!codV) continue;
            vendidasGCD[codV] = !!(((gcdSheet[gvi][4]||'').toString().trim()) || ((gcdSheet[gvi][5]||'').toString().trim()));
          }
          var cambioGCD = false;
          Object.keys(gcdStore).forEach(function(kD){
            if (vendidasGCD[kD] !== true) { delete gcdStore[kD]; cambioGCD = true; }
          });
          if (cambioGCD) PropertiesService.getScriptProperties().setProperty('SUNSU_GC_DIGITALES', JSON.stringify(gcdStore));
        }
      } catch(eLimp) {}
      var gcdItems = Object.keys(gcdStore).map(function(k){ var o = gcdStore[k]; o.codigo = k; return o; });
      gcdItems.sort(function(a,b){ return (b.ts||'').localeCompare(a.ts||''); });
      return respJsonGet({items: gcdItems}, callback);
    }

    // ── TODOS los mensajes a clientas, editables en ⚙ CONFIGURACION ──
    // Clave / texto. Si falta alguna fila se crea sola con el texto por defecto,
    // asi Esteban puede cambiar cualquier mensaje desde el Sheet sin tocar codigo
    // ni volver a desplegar. Placeholders: {nombre} {dia} {hora} {link} {usados} {total}
    if (action === 'getMensajes') {
      var DEF_MSG = [
        ['LINK REGISTRO', 'app.sunsuspa.com/registro.html'],
        ['MENSAJE CONFIRMACION CITA', 'Hola {nombre} \uD83C\uDF38 Te saludamos de Sunsu Spa!\n\nTe escribimos para confirmar tu cita de ma\u00f1ana {dia} a las {hora} \uD83D\uDC86\u200D\u2640\uFE0F\n\n{registro}\u00bfNos confirmas tu asistencia? \uD83D\uDC99'],
        ['MENSAJE REGISTRO PRIMERA VISITA', 'Como es tu primera visita, te pedimos llenar tu tarjeta de registro antes de venir. Toma menos de 2 minutos y nos permite cuidar tu piel como se merece \u2728\n\n\uD83D\uDCDD Tarjeta de registro\n{link}\n\n'],
        ['MENSAJE TARJETA SALUDO', 'Hola {nombre}, te saludamos de Sunsu Spa!'],
        ['MENSAJE TARJETA TRATAMIENTO', 'Te compartimos la tarjeta de tu tratamiento con las recomendaciones para tu piel y tu pr\u00f3xima cita recomendada. Gracias por visitarnos!'],
        ['MENSAJE TARJETA PAQUETE PENDIENTE', 'Y aqu\u00ed est\u00e1 el control de tu paquete: has disfrutado {usados} de {total} sesiones \u2014 \u00a1te esperamos en la siguiente!'],
        ['MENSAJE TARJETA PAQUETE COMPLETO', 'Y aqu\u00ed est\u00e1 el control de tu paquete: has disfrutado {usados} de {total} sesiones \u2014 \u00a1paquete completado!'],
        ['MENSAJE TARJETA AMBAS', 'Hola! Te compartimos la tarjeta de tu tratamiento y el control de tu paquete en Sunsu Spa.'],
        ['MENSAJE PAQUETE DIGITAL PENDIENTE', 'Hola {nombre}! Te compartimos la tarjeta digital de tu paquete en Sunsu Spa. Ya disfrutaste {usados} de {total} sesiones \u2014 te esperamos para la siguiente. Escr\u00edbenos para agendar tu cita.'],
        ['MENSAJE PAQUETE DIGITAL COMPLETO', 'Hola {nombre}! Te compartimos la tarjeta digital de tu paquete en Sunsu Spa. Completaste tus {total} sesiones \u2014 gracias por confiar en nosotras.'],
        ['MENSAJE PAQUETE CONTROL', 'Hola {nombre}! Te compartimos el control de tu paquete en Sunsu Spa.'],
        ['MENSAJE CLIENTAS ANTIGUAS', 'Hola {nombre}, te saludamos de \uC21C\uC218 Sunsu Spa \u2014 nos acordamos de ti. Tu piel merece volver a brillar como en tu \u00faltimo facial \u2728 \u00bfTe agendamos un espacio?']
      ];
      var outMsg = {};
      try {
        var wsMsg = ss.getSheetByName('⚙ CONFIGURACION');
        if (!wsMsg) return respJsonGet({msgs:{}, error:'No existe la hoja ⚙ CONFIGURACION'}, callback);
        var datMsg = wsMsg.getDataRange().getValues();
        var idxMsg = {};
        for (var dm = 0; dm < datMsg.length; dm++) {
          var kDm = (datMsg[dm][0]||'').toString().trim().toUpperCase();
          if (kDm) idxMsg[kDm] = (datMsg[dm][1]||'').toString();
        }
        DEF_MSG.forEach(function(par){
          var clave = par[0], porDefecto = par[1];
          var val = idxMsg[clave];
          if (val === undefined || val === '') {   // no existe o esta vacia -> sembrar
            wsMsg.appendRow([clave, porDefecto]);
            val = porDefecto;
          }
          outMsg[clave] = val;
        });
      } catch(eMsg) { return respJsonGet({msgs:{}, error:eMsg.message}, callback); }
      return respJsonGet({msgs: outMsg}, callback);
    }

    // ── Plantilla del mensaje de Gift Card digital (editable en ⚙ CONFIGURACION) ──
    if (action === 'getPlantillaGC') {
      var msgGC = '';
      try {
        var wsCfgG = ss.getSheetByName('⚙ CONFIGURACION');
        if (wsCfgG) {
          var cfgG = wsCfgG.getDataRange().getValues();
          for (var cg = 0; cg < cfgG.length; cg++) {
            if ((cfgG[cg][0]||'').toString().toUpperCase().indexOf('MENSAJE GIFT CARD') >= 0) { msgGC = (cfgG[cg][1]||'').toString(); break; }
          }
          if (!msgGC) {
            msgGC = '{mensaje} {para}, un facial & un momento especial solo para ti ❤️ Te esperamos en Sunsu Spa ✨ Agenda tu cita en el link ⤵️ https://app.acuityscheduling.com/schedule.php?owner=35065947  Wsp📲 099-066-5112';
            wsCfgG.appendRow(['MENSAJE GIFT CARD', msgGC]);
          }
        }
      } catch(eGC) {}
      return respJsonGet({mensaje: msgGC}, callback);
    }

    // ── KPIs del período en curso (tickets + paquetes + GC en vivo) ──
    if (action === 'getKPIsMes') {
      var wsTM = ss.getSheets().find(function(s){return s.getName().includes('TICKET_FICHA');});
      if (!wsTM) return respJsonGet({error:'No TICKET_FICHA'}, callback);
      var hoyM = new Date();
      var dDesde = e.parameter.desde ? new Date(e.parameter.desde+'T00:00:00') : new Date(hoyM.getFullYear(), hoyM.getMonth(), 1);
      var dHasta = e.parameter.hasta ? new Date(e.parameter.hasta+'T23:59:59') : new Date(hoyM.getFullYear(), hoyM.getMonth()+1, 0, 23, 59, 59);
      var tDM = wsTM.getDataRange().getValues();
      var hdrM = tDM[0];
      var prodColsM = [];
      for (var pm=0; pm<hdrM.length; pm++) {
        var phM=(hdrM[pm]||'').toString().trim();
        if (phM.match(/^[A-Z]{2}-\d+/)) prodColsM.push({idx:pm, sku:phM});
      }
      var preciosM = leerPrecios(ss);
      // Primera visita de cada cédula (para clientas nuevas del período)
      var primeraM = {};
      for (var f0=1; f0<tDM.length; f0++) {
        var r0=tDM[f0];
        if(!(r0[0] instanceof Date)) continue;
        var c0=(r0[2]||'').toString().split('.')[0];
        if(!c0||c0==='1793219469001') continue;
        if(!primeraM[c0]||r0[0]<primeraM[c0]) primeraM[c0]=r0[0];
      }
      var R={ing:0, tickets:0, clientas:{}, nuevas:0, faciales:0, porCosm:{}, canjesPaq:0, canjesGC:0,
        gcVendidas:0, extrasTk:0, unidadesProd:0, prodMap:{}};
      var nuevasSet={};
      for (var fm=1; fm<tDM.length; fm++) {
        var rm=tDM[fm];
        if(!(rm[0] instanceof Date) || rm[0]<dDesde || rm[0]>dHasta) continue;
        var cm=(rm[2]||'').toString().split('.')[0];
        if(cm==='1793219469001') continue;
        R.tickets++;
        R.ing += parseFloat(rm[9])||0;
        if(cm){ R.clientas[cm]=1; if(primeraM[cm]>=dDesde && !nuevasSet[cm]){nuevasSet[cm]=1;R.nuevas++;} }
        if((rm[19]||'').toString().trim()){
          R.faciales++;
          var csM=(rm[1]||'').toString().trim();
          if(csM&&csM.toUpperCase()!=='SUNSU') R.porCosm[csM]=(R.porCosm[csM]||0)+1;
        }
        if((rm[16]||'').toString().trim().indexOf('SI')===0) R.canjesPaq++;
        if((rm[17]||'').toString().trim().indexOf('SI')===0) R.canjesGC++;
        if((rm[18]||'').toString().trim().indexOf('SI')===0) R.gcVendidas++;
        if((rm[22]||'').toString().trim()) R.extrasTk++;
        prodColsM.forEach(function(pc){
          var qv=parseFloat(rm[pc.idx]);
          if(qv>0){
            R.unidadesProd+=qv;
            var pr=preciosM['SUNSU-'+pc.sku]||preciosM[pc.sku]||{};
            var eM=R.prodMap[pc.sku]=R.prodMap[pc.sku]||{sku:pc.sku, n:pr.nombre||pc.sku, u:0, ing:0};
            eM.u+=qv; eM.ing+=qv*(pr.venta||0);
          }
        });
      }
      // Paquetes vendidos del período (hoja PAQUETES, por fecha y vendedora)
      var paqTotal=0, paqVendM={};
      try {
        var wsPqM = ss.getSheetByName('📋 PAQUETES');
        if (wsPqM) {
          var pDM = wsPqM.getDataRange().getValues();
          for (var qm=2; qm<pDM.length; qm++) {
            var dq=parseInt(pDM[qm][0]), mq=parseInt(pDM[qm][1]), aq=parseInt(pDM[qm][2]);
            if(!mq||!aq||!pDM[qm][3]) continue;
            var fq=new Date(aq, mq-1, dq||1);
            if(fq<dDesde||fq>dHasta) continue;
            paqTotal++;
            var vq=(pDM[qm][9]||'').toString().trim()||'—';
            paqVendM[vq]=(paqVendM[vq]||0)+1;
          }
        }
      } catch(ePM) {}
      var topProdM = Object.keys(R.prodMap).map(function(k){return R.prodMap[k];})
        .sort(function(a,b){return b.u-a.u;}).slice(0,8);
      return respJsonGet({
        desde: Utilities.formatDate(dDesde,'America/Guayaquil','yyyy-MM-dd'),
        hasta: Utilities.formatDate(dHasta,'America/Guayaquil','yyyy-MM-dd'),
        ing: Math.round(R.ing*100)/100,
        ingSin: Math.round(R.ing/1.15*100)/100, // ingreso real: los precios del ticket incluyen IVA 15%
        tickets: R.tickets,
        clientas: Object.keys(R.clientas).length, nuevas: R.nuevas,
        promedio: R.tickets ? Math.round(R.ing/R.tickets*100)/100 : 0,
        promedioSin: R.tickets ? Math.round(R.ing/1.15/R.tickets*100)/100 : 0,
        faciales: R.faciales, porCosm: R.porCosm,
        paqTotal: paqTotal, paqPorVend: paqVendM,
        gcVendidas: R.gcVendidas, canjesGC: R.canjesGC, canjesPaq: R.canjesPaq,
        extrasTk: R.extrasTk, unidadesProd: Math.round(R.unidadesProd),
        topProd: topProdM
      }, callback);
    }

    // ── KPIs históricos precalculados ──
    if (action === 'getKPIsHistoricos') {
      var wsKH = ss.getSheetByName('📈 KPI_DATA');
      if (!wsKH) return respJsonGet({error:'Aún no se han generado — corre el menú 📈 Generar KPIs históricos'}, callback);
      var vals = wsKH.getRange(2,1,Math.max(1,wsKH.getLastRow()-1),1).getValues();
      var jsonH = vals.map(function(v){return (v[0]||'').toString();}).join('');
      try { return respJsonGet(JSON.parse(jsonH), callback); }
      catch(eJ) { return respJsonGet({error:'Datos corruptos — regenera desde el menú'}, callback); }
    }

    // ── Sello de versión: para verificar qué versión está desplegada ──
    if (action === 'version') {
      return respJsonGet({version: APP_VERSION, cumples: true, seguimiento: true}, callback);
    }

    if (action === 'buscarCliente') {
      var cedula = (e.parameter.cedula || '').toString().trim().split('.')[0].replace(/[^0-9]/g,'');
      var wsReg = ss.getSheetByName('REGISTRO');
      var result = {encontrado: false};
      if (wsReg && cedula) {
        var regData = wsReg.getDataRange().getValues();
        for (var i = 1; i < regData.length; i++) {
          var rowCed = String(regData[i][1]||'').trim().split('.')[0].replace(/[^0-9]/g,'');
          if (rowCed === cedula) {
            result = {encontrado:true, cedula:rowCed,
              nombre:  String(regData[i][2]||'').trim(),
              apellido:String(regData[i][3]||'').trim()};
            break;
          }
        }
      }
      return respJsonGet(result, callback);
    }

    // ── 2. Citas (ayer / hoy / manana) ──
    if (action === 'getCitas') {
      var dia = e.parameter.dia || 'hoy';
      var offset = dia === 'ayer' ? -1 : dia === 'manana' ? 1 : 0;
      var fechaEc = _fechaEcuador(offset);
      var minT = fechaEc + 'T00:00:00';
      var maxT = fechaEc + 'T23:59:59';
      var raw = '[]';
      try {
        var uid = PropertiesService.getScriptProperties().getProperty('ACUITY_UID');
        var key = PropertiesService.getScriptProperties().getProperty('ACUITY_KEY');
        var resp = UrlFetchApp.fetch(
          'https://acuityscheduling.com/api/v1/appointments?minDate='+minT+'&maxDate='+maxT+'&max=100',
          {headers:{'Authorization':'Basic '+Utilities.base64Encode(uid+':'+key)}, muteHttpExceptions:true}
        );
        raw = resp.getContentText();
      } catch(ex) { raw = '[]'; }
      var parsed;
      try { parsed = JSON.parse(raw); } catch(ex) { parsed = []; }
      if (!Array.isArray(parsed)) parsed = [];
      return respJsonGet(parsed, callback);
    }

    // ── 3. Catálogo de precios ──
    // ── getReporte: comisiones reales desde TICKET_FICHA col J ──

    // ── getPermisos: leer solicitudes de permisos ──
    if (action === 'getPermisos') {
      try {
        var ws = ss.getSheetByName('🏖️ PERMISOS');
        if (!ws) {
          return ContentService.createTextOutput(JSON.stringify({ok:true, data:[]}))
            .setMimeType(ContentService.MimeType.JSON);
        }
        var data = ws.getDataRange().getValues();
        var permisos = [];
        for (var i=1; i<data.length; i++) {
          var r = data[i];
          if (!r[0]) continue;
          permisos.push({
            id:          r[0].toString(),
            empleada:    r[1],
            tipo:        r[2],
            fechaInicio: r[3] instanceof Date ? Utilities.formatDate(r[3],'America/Guayaquil','yyyy-MM-dd') : r[3],
            fechaFin:    r[4] instanceof Date ? Utilities.formatDate(r[4],'America/Guayaquil','yyyy-MM-dd') : r[4],
            horas:       r[5],
            motivo:      r[6],
            estado:      r[7],
            solicitado:  r[8] instanceof Date ? Utilities.formatDate(r[8],'America/Guayaquil','yyyy-MM-dd') : r[8],
            aprobadoPor: r[9],
            urlFoto:     r[10] || '',
          });
        }
        return ContentService.createTextOutput(JSON.stringify({ok:true, data:permisos}))
          .setMimeType(ContentService.MimeType.JSON);
      } catch(e) {
        return ContentService.createTextOutput(JSON.stringify({ok:false, error:e.message}))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }


    // ── getRegistro: buscar cliente por cédula o nombre ──
    if (action === 'getRegistro') {
      try {
        var wsReg = ss.getSheetByName('REGISTRO');
        if (!wsReg) return respJsonGet({ok:false,error:'No REGISTRO'}, callback);
        var query   = (e.parameter.q    || '').toString().trim().toLowerCase();
        var cedula  = (e.parameter.ced  || '').toString().trim();
        var data    = wsReg.getDataRange().getValues();
        // Headers: Col1=Timestamp, Col2=Cedula, Col3=Nombre, Col4=Apellido
        var results = [];
        for (var i=1; i<data.length; i++) {
          var row    = data[i];
          var ced    = (row[1]||'').toString().trim();
          var nom    = (row[2]||'').toString().trim();
          var ape    = (row[3]||'').toString().trim();
          if (!ced && !nom) continue;
          // Search by cedula (exact)
          if (cedula && ced === cedula) {
            results = [{cedula:ced, nombre:nom, apellido:ape}];
            break;
          }
          // Search by name — match nombre+apellido OR apellido+nombre
          if (query) {
            var fullNomApe = (nom+' '+ape).toLowerCase().trim();
            var fullApeNom = (ape+' '+nom).toLowerCase().trim();
            var queryNorm  = query.toLowerCase().trim();
            if (fullNomApe === queryNorm || fullApeNom === queryNorm ||
                fullNomApe.indexOf(queryNorm) >= 0 || fullApeNom.indexOf(queryNorm) >= 0) {
              results.push({cedula:ced, nombre:nom, apellido:ape});
              if (results.length >= 10) break;
            }
          }
        }
        return respJsonGet({ok:true, data:results}, callback);
      } catch(e2) {
        return respJsonGet({ok:false, error:e2.message}, callback);
      }
    }

    // ── getRoles: historial de roles desde RRHH ──
    if (action === 'getRoles') {
      try {
        var ID_RRHH = '1SOFRvcUQyAaCCgGQkLZ35XWApyuw4bwGgCXS0PHfqHs';
        var ssRRHH  = SpreadsheetApp.openById(ID_RRHH);
        var wsHist  = ssRRHH.getSheetByName('HISTORIAL');
        var resultado = {meses:[], resumen:[]};

        if (wsHist) {
          var data = wsHist.getDataRange().getValues();
          var headers = data[0];
          // Agrupar por mes/año
          var mesesMap = {};
          for (var i=1; i<data.length; i++) {
            var row = data[i];
            if (!row[0] || !row[2]) continue; // saltar filas vacías o totales
            var clave = row[0]+' '+row[1]; // ej: "Mayo 2026"
            if (!mesesMap[clave]) {
              mesesMap[clave] = {mes:row[0], anio:row[1], empleadas:[], sheetName:row[0].toUpperCase()+'_'+row[1]};
            }
            mesesMap[clave].empleadas.push({
              nombre:       row[2],
              cedula:       row[3],
              sueldo:       row[4],
              bono:         row[5],
              comisiones:   row[6],
              extras:       row[7],
              decimos:      row[8],
              totalIngresos:row[9],
              iessPatronal: row[10],
              costoEmpresa: row[11],
            });
          }
          resultado.meses = Object.keys(mesesMap).map(function(k){ return mesesMap[k]; });
        }

        // Listar pestañas de roles disponibles
        var sheets = ssRRHH.getSheets();
        var rolesSheets = sheets.filter(function(s){
          var n = s.getName();
          return /^[A-Z]+_\d{4}$/.test(n); // ej: MAYO_2026
        }).map(function(s){ return s.getName(); });
        resultado.sheetsDisponibles = rolesSheets;

        return ContentService.createTextOutput(JSON.stringify({ok:true, data:resultado}))
          .setMimeType(ContentService.MimeType.JSON);
      } catch(e) {
        return ContentService.createTextOutput(JSON.stringify({ok:false, error:e.message}))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ── getRolIndividual: datos del rol individual de una empleada ──
    if (action === 'getRolIndividual') {
      try {
        var ID_RRHH = '1SOFRvcUQyAaCCgGQkLZ35XWApyuw4bwGgCXS0PHfqHs';
        var ssRRHH  = SpreadsheetApp.openById(ID_RRHH);
        var sheetName = e.parameter.sheet; // ej: "MAYO_2026"
        var cedula    = e.parameter.cedula;
        var wsRol     = ssRRHH.getSheetByName(sheetName);
        if (!wsRol) {
          return ContentService.createTextOutput(JSON.stringify({ok:false, error:'Sheet no encontrada'}))
            .setMimeType(ContentService.MimeType.JSON);
        }
        var data = wsRol.getDataRange().getValues();
        // Buscar fila de esta empleada en el consolidado (por cédula)
        var rolData = null;
        for (var i=0; i<data.length; i++) {
          if (data[i][1] && data[i][1].toString().replace('.','') === cedula.replace('.','')) {
            // Leer variables de la Sección 2 para desglosar egresos
            // La Sección 2 empieza en fila 9: B=anticipo, C=hipotecario, D=quirografario, E=descuentos, F=multas
            // Buscar la fila de variables que corresponde a esta empleada
            var anticipo = 0, prestHip = 0, prestQuir = 0;
            for (var v=0; v<data.length; v++) {
              if (!data[v][0]) continue;
              var nombreV = (data[v][0]||'').toString().toLowerCase();
              var nombreR = (data[i][0]||'').toString().toLowerCase().split(' ')[0];
              // Sección 2 tiene solo el nombre app (Dejaneira, Daniela, etc.)
              if (nombreV === nombreR || nombreV.indexOf(nombreR) === 0) {
                // Check if this looks like a variables row (has numeric values in cols B-F)
                var testVal = parseFloat(data[v][1]);
                if (!isNaN(testVal) && v !== i) {
                  anticipo  = parseFloat(data[v][1])||0;
                  prestHip  = parseFloat(data[v][2])||0;
                  prestQuir = parseFloat(data[v][3])||0;
                  break;
                }
              }
            }
            rolData = {
              nombre:        data[i][0],
              cedula:        data[i][1],
              cargo:         data[i][2],
              diasNorm:      data[i][3],
              diasDesc:      data[i][4],
              diasFest:      data[i][5],
              sueldo:        data[i][6],
              bono:          data[i][7],
              comFaciales:   data[i][8],
              comPaquetes:   data[i][9],
              comProductos:  data[i][10],
              hrsSupl:       data[i][11],
              valSupl:       data[i][12],
              hrsExtr:       data[i][13],
              valExtr:       data[i][14],
              hrsDesc:       data[i][15],
              valDesc:       data[i][16],
              dec13:         data[i][17],
              dec14:         data[i][18],
              fondoReserva:  data[i][19],
              totalIngresos: data[i][20],
              iess:          data[i][21],
              egresos:       data[i][22],
              totalRecibir:  data[i][23],
              anticipo:      anticipo,
              prestHip:      prestHip,
              prestQuir:     prestQuir,
              sheet:         sheetName,
            };
            break;
          }
        }
        // ── Días trabajados: leídos de la SECCIÓN 1 — DATOS JIBBLE de esta MISMA hoja
        //    (DIAS TRABAJADOS + DIAS ASUMIDOS). Sin API, sin token, sin líos de nombres. ──
        if (rolData) {
          try {
            var normHdr = function(s){ return (s||'').toString().toUpperCase().replace(/[^A-Z]/g,''); };
            var colDT = -1, colDA = -1, hdrRowDJ = -1;
            for (var hR = 0; hR < data.length && hdrRowDJ < 0; hR++) {
              for (var hC = 0; hC < data[hR].length; hC++) {
                if (normHdr(data[hR][hC]).indexOf('DIASTRABAJA') === 0) {
                  hdrRowDJ = hR; colDT = hC;
                  for (var hC2 = 0; hC2 < data[hR].length; hC2++) {
                    if (normHdr(data[hR][hC2]).indexOf('DIASASUMIDO') === 0) colDA = hC2;
                  }
                  break;
                }
              }
            }
            if (hdrRowDJ >= 0 && colDT >= 0) {
              var nomFormalDJ = (rolData.nombre||'').toString().toUpperCase();
              for (var sR = hdrRowDJ + 1; sR < data.length; sR++) {
                var nomCorto = (data[sR][0]||'').toString().trim().toUpperCase();
                if (!nomCorto) break; // fin de la sección
                if (nomCorto === 'TOTALES') break;
                // El nombre corto de la sección ('DEJANEIRA') vive dentro del formal
                if (nomFormalDJ.indexOf(nomCorto) >= 0 || nomCorto.split(' ').some(function(w){ return w.length > 3 && nomFormalDJ.indexOf(w) >= 0; })) {
                  var dTrab = parseFloat(data[sR][colDT]) || 0;
                  var dAsum = colDA >= 0 ? (parseFloat(data[sR][colDA]) || 0) : 0;
                  if (dTrab > 0 || dAsum > 0) rolData.diasJibble = Math.round(dTrab + dAsum);
                  break;
                }
              }
            }
          } catch(eDJ) { /* sin sección → el PDF muestra '—' */ }
        }

                // Agregar detalle de multas desde MULTAS Y DESCUENTOS
        if (rolData) {
          try {
            var wsMul = ss.getSheetByName('📋 MULTAS Y DESCUENTOS');
            if (wsMul) {
              var mulData = wsMul.getDataRange().getValues();
              var mulDetalle = [];
              // Extraer mes y año del sheetName (ej: MAYO_2026)
              var partes = sheetName.split('_');
              var anioRol = parseInt(partes[partes.length-1]);
              var mesesMap = {ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,
                JULIO:7,AGOSTO:8,SEPTIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12};
              var mesRol = mesesMap[partes[0]] || 0;
              // Período: 26 del mes anterior al 25 del mes actual
              var mesAntRol  = mesRol === 1 ? 12 : mesRol - 1;
              var anioAntRol = mesRol === 1 ? anioRol - 1 : anioRol;
              var fDesde = new Date(anioAntRol, mesAntRol - 1, 26, 0, 0, 0);
              var fHasta = new Date(anioRol, mesRol - 1, 25, 23, 59, 59);

              mulData.forEach(function(rm) {
                if (!rm[0]) return;
                var cedMul = (rm[3]||'').toString().replace('.','');
                var fechaMul = rm[0] instanceof Date ? rm[0] : new Date(rm[0]);
                if (isNaN(fechaMul)) return;
                if (fechaMul < fDesde || fechaMul > fHasta) return;
                // Match by cedula or by name
                var nombreMul = (rm[1]||'').toString().toLowerCase();
                var nombreRol = (rolData.nombre||'').toString().toLowerCase().split(' ')[0];
                if (cedMul === cedula.replace('.','') || nombreMul.indexOf(nombreRol) >= 0) {
                  mulDetalle.push({
                    tipo:   (rm[2]||'').toString().toUpperCase().trim(),
                    monto:  parseFloat(rm[3])||0,
                    motivo: (rm[4]||'').toString().trim(),
                  });
                }
              });
              rolData.multasDetalle = mulDetalle;
              // ── NOTA MANUAL: fila 'NOTAS' dentro de la sección individual de la
              // empleada en la misma hoja del rol (col A='Empleado:' delimita secciones) ──
              try {
                var nomRolN = (rolData.nombre||'').toString().trim().toUpperCase();
                var filaEmpN = -1;
                for (var nR = 0; nR < data.length; nR++) {
                  var c0E = (data[nR][0]||'').toString().trim();
                  if (c0E !== 'Empleado:') continue;
                  var c1E = (data[nR][1]||'').toString().trim().toUpperCase();
                  if (c1E === nomRolN || c1E.indexOf(nomRolN.split(' ')[0]) === 0) { filaEmpN = nR; break; }
                }
                if (filaEmpN >= 0) {
                  for (var nS = filaEmpN + 1; nS < Math.min(filaEmpN + 90, data.length); nS++) {
                    var c0N = (data[nS][0]||'').toString().trim();
                    if (c0N === 'Empleado:') break; // ya es la sección de otra
                    if (c0N.toUpperCase() === 'NOTAS') { rolData.nota = (data[nS][1]||'').toString().trim(); break; }
                  }
                }
              } catch(eNt) {}
            }
          } catch(em) { Logger.log('Error multas detail: '+em.message); }
        }

        return ContentService.createTextOutput(JSON.stringify({ok:true, data:rolData}))
          .setMimeType(ContentService.MimeType.JSON);
      } catch(e2) {
        return ContentService.createTextOutput(JSON.stringify({ok:false, error:e2.message}))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (action === 'getReporte') {
      var wsRep = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsRep) return respJsonGet({error:'No TICKET_FICHA'}, callback);

      var wsMul = ss.getSheetByName('📋 MULTAS Y DESCUENTOS');
      var wsCatR = ss.getSheets().find(function(s){ return s.getName().includes('CATALOGO'); });
      var preciosR = leerPrecios(ss);

      var repData = wsRep.getDataRange().getValues();
      var headers = repData[0];

      // Mes actual
      var hoy = new Date();
      var mesInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      var mesFin    = new Date(hoy.getFullYear(), hoy.getMonth()+1, 0, 23, 59, 59);

      // Multas y descuentos del mes
      var multasPorCosm = {}, descPorCosm = {};
      if (wsMul) {
        var mulData = wsMul.getDataRange().getValues();
        for (var mi = 1; mi < mulData.length; mi++) {
          var mRow = mulData[mi];
          var mFecha = mRow[0] instanceof Date ? mRow[0] : new Date(mRow[0]);
          if (isNaN(mFecha.getTime()) || mFecha < mesInicio || mFecha > mesFin) continue;
          var mCosm = (mRow[1]||'').toString().trim();
          var mTipo = (mRow[2]||'').toString().trim().toUpperCase();
          var mMonto = parseFloat(mRow[3])||0;
          if (!mCosm) continue;
          if (mTipo === 'MULTA') multasPorCosm[mCosm] = (multasPorCosm[mCosm]||0) + mMonto;
          if (mTipo === 'DESCUENTO') descPorCosm[mCosm] = (descPorCosm[mCosm]||0) + mMonto;
        }
      }

      // Acumular por cosmetóloga
      var porCosm = {};
      var EXCLR = exclColsFromHeaders_(repData[0]);
      for (var ri = 1; ri < repData.length; ri++) {
        var fila = repData[ri];
        var ts = fila[0];
        if (!ts) continue;
        var fecha = ts instanceof Date ? ts : new Date(ts);
        if (isNaN(fecha.getTime()) || fecha < mesInicio || fecha > mesFin) continue;
        var cosm = (fila[1]||'').toString().trim();
        if (!cosm || cosm.toUpperCase() === 'SUNSU') continue;
        if (((fila[2]||'').toString().split('.')[0]) === '1793219469001') continue; // cliente = Sunsu Spa (interno)
        var estimado = parseFloat(fila[9])||0; // Col J = $$ ESTIMADO
        var facialStr = (fila[CONFIG.COL_FACIAL-1]||'').toString();
        var pack3Str  = (fila[CONFIG.COL_PACK3-1]||'').toString().trim();
        var pack6Str  = (fila[CONFIG.COL_PACK6-1]||'').toString().trim();
        var exclFac  = fila[EXCLR.facial-1] === true;
        var exclPaq  = fila[EXCLR.paquete-1] === true;
        var exclProd = fila[EXCLR.producto-1] === true;
        if (!porCosm[cosm]) porCosm[cosm] = {faciales:0,paquetes:0,ingrFaciales:0,ingrPaquetes:0,comFaciales:0,comPaquetes:0,comProductos:0,extras:0,comExtras:0,nivelesN:{}};
        var pc = porCosm[cosm];
        // Faciales — comisión $2 o $3
        var skuFac = facialStr.match(/SUNSU-(\d+)/);
        if (skuFac && !exclFac) {
          var skuF = 'SUNSU-'+skuFac[1];
          var comFac = CONFIG.FACIALES_2.includes(skuF)?2:CONFIG.FACIALES_3.includes(skuF)?3:0;
          pc.faciales++; pc.comFaciales += comFac;
        }
        // Paquetes — comisión basada en nivel NIVELES
        var tienePaq = (pack3Str && pack3Str !== '' && pack3Str.toLowerCase() !== 'false') ||
                       (pack6Str && pack6Str !== '' && pack6Str.toLowerCase() !== 'false');
        if (tienePaq && !exclPaq) {
          pc.paquetes++;
        }
        // Extras — $1 por extra vendido (cortesías no cuentan; exclusión propia BV)
        var exclExtR = fila[EXCLR.extras-1] === true;
        if (!exclExtR) {
          var nExtR = contarExtrasVendidos_(fila[CONFIG.COL_EXTRAS - 1]);
          if (nExtR > 0) { pc.extras += nExtR; pc.comExtras += nExtR * 1; }
        }
        // Productos comisión
        var prodCols = headers.slice(CONFIG.COL_PRODUCTOS_START-1);
        for (var pi = 0; pi < prodCols.length; pi++) {
          var qty = parseInt(fila[CONFIG.COL_PRODUCTOS_START-1+pi])||0;
          if (qty <= 0) continue;
          var ph = (prodCols[pi]||'').toString().trim(); if (!ph) continue;
          var skuP = ph.startsWith('SUNSU-') ? ph : 'SUNSU-'+ph;
          var pInfo = preciosR[skuP];
          if (pInfo && !exclProd) {
            pc.comProductos += (pInfo.venta - pInfo.compra) * qty * 0.30;
          }
        }
      }

      // Calcular niveles y comisiones paquetes
      var NIVELES = CONFIG.NIVELES;
      var cosmetologas = Object.keys(porCosm).map(function(nombre) {
        var pc = porCosm[nombre];
        var nLevel = 0, nLabel = 'N1', comPaq = 0;
        for (var ni = 0; ni < NIVELES.length; ni++) {
          if (pc.faciales >= NIVELES[ni][0] && pc.faciales <= NIVELES[ni][1]) {
            nLevel = ni; break;
          }
        }
        nLabel = 'N'+(nLevel+1);
        // Comisión paquetes = nLevel * paquetes * $5 (simplificado)
        comPaq = pc.paquetes * (nLevel+1) * 5;
        var multa = multasPorCosm[nombre]||0;
        var desc   = descPorCosm[nombre]||0;
        var neto   = pc.comFaciales + comPaq + pc.comProductos + (pc.comExtras||0) - multa - desc;
        var color  = COLORES_COSM[nombre] ? COLORES_COSM[nombre].header : '#8A90A0';
        return {
          name: nombre,
          color: color,
          f: pc.faciales,
          paq: pc.paquetes,
          n: nLabel,
          cf: parseFloat(pc.comFaciales.toFixed(2)),
          cp: parseFloat(comPaq.toFixed(2)),
          cprod: parseFloat(pc.comProductos.toFixed(2)),
          ext: pc.extras||0,
          cext: parseFloat((pc.comExtras||0).toFixed(2)),
          m: parseFloat(multa.toFixed(2)),
          d: parseFloat(desc.toFixed(2)),
          t: parseFloat(Math.max(0, neto).toFixed(2)),
        };
      });

      // Comisión de recepción del mes — agregar a la recepcionista como tarjeta propia
      try {
        var recepM = calcularComisionRecepcion(mesInicio, mesFin);
        if (recepM.total > 0) {
          var rnM = CONFIG.RECEPCIONISTA;
          var yaEsta = cosmetologas.some(function(cc){ return cc.name.toLowerCase() === rnM.toLowerCase(); });
          if (!yaEsta) {
            var colorM = COLORES_COSM[rnM] ? COLORES_COSM[rnM].header : '#D4956A';
            var multaM = multasPorCosm[rnM]||0, descM = descPorCosm[rnM]||0;
            cosmetologas.push({name:rnM, color:colorM, f:0, paq:0, n:'—', cf:0, cp:0, cprod:0,
              ext:0, cext:0, crecep:parseFloat(recepM.total.toFixed(2)), diasRecep:recepM.diasCumplidos,
              m:parseFloat(multaM.toFixed(2)), d:parseFloat(descM.toFixed(2)),
              t:parseFloat(Math.max(0, recepM.total - multaM - descM).toFixed(2))});
          }
        }
      } catch(eRM) {}
      return respJsonGet({cosmetologas: cosmetologas}, callback);
    }

    // ── Marcar el PRIMER uso de un paquete (compra + primera sesión el mismo día) ──
    if (action === 'marcarPrimerUsoPaquete') {
      var wsPU = ss.getSheetByName('📋 PAQUETES');
      if (!wsPU) return respJsonGet({error:'No PAQUETES'}, callback);
      var cedPU = (e.parameter.cedula||'').toString().trim();
      var skuPU = (e.parameter.sku||'').toString().trim();
      var notaPU = (e.parameter.nota||'').toString().trim() ||
        Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yy');
      if (!cedPU || !skuPU) return respJsonGet({error:'Faltan parámetros'}, callback);
      var puData = wsPU.getDataRange().getValues();
      var USO_PU   = [11,13,15,17,19,21];
      var FECHA_PU = [12,14,16,18,20,22];
      // El paquete objetivo es el comprado HOY (cols A,B,C = día,mes,año) — si el cliente
      // tiene paquetes viejos con el mismo SKU, la fecha de hoy es la que desambigua.
      var hoyPU_d = parseInt(Utilities.formatDate(new Date(),'America/Guayaquil','d'));
      var hoyPU_m = parseInt(Utilities.formatDate(new Date(),'America/Guayaquil','M'));
      var hoyPU_a = parseInt(Utilities.formatDate(new Date(),'America/Guayaquil','yyyy'));
      var filaPU = -1, filaPUHoy = -1;
      for (var pu = 2; pu < puData.length; pu++) {
        var cPU = (puData[pu][3]||'').toString().trim();
        var sPU = (puData[pu][7]||'').toString().trim();
        if (cPU !== cedPU || sPU.indexOf(skuPU) < 0) continue;
        filaPU = pu + 1; // última coincidencia (respaldo)
        if (parseInt(puData[pu][0])===hoyPU_d && parseInt(puData[pu][1])===hoyPU_m && parseInt(puData[pu][2])===hoyPU_a) filaPUHoy = pu + 1;
      }
      if (filaPUHoy > 0) filaPU = filaPUHoy;
      if (filaPU < 0) return respJsonGet({error:'Paquete no encontrado (ced:'+cedPU+' sku:'+skuPU+')'}, callback);
      for (var uu = 0; uu < USO_PU.length; uu++) {
        var uVal = wsPU.getRange(filaPU, USO_PU[uu]).getValue();
        var fVal = wsPU.getRange(filaPU, FECHA_PU[uu]).getValue();
        if (!uVal && !fVal) {
          wsPU.getRange(filaPU, USO_PU[uu]).setValue(true);
          wsPU.getRange(filaPU, FECHA_PU[uu]).setValue(notaPU);
          SpreadsheetApp.flush();
          return respJsonGet({ok:true, slot:uu+1, row:filaPU}, callback);
        }
      }
      return respJsonGet({error:'Sin sesiones libres'}, callback);
    }

    // ── Marcar usos como Gift Card en PAQUETES ──
    if (action === 'marcarUsoGC') {
      var wsPaq = ss.getSheetByName('📋 PAQUETES');
      if (!wsPaq) return respJsonGet({error:'No PAQUETES'}, callback);
      var cedPaq   = (e.parameter.cedula||'').toString().trim();
      var skuPaq   = (e.parameter.sku||'').toString().trim();
      var gcSlots  = JSON.parse(e.parameter.slots||'[]');
      if (!cedPaq || !skuPaq || !gcSlots.length) return respJsonGet({error:'Faltan parámetros'}, callback);

      var paqData = wsPaq.getDataRange().getValues();
      var USO_COLS   = [11,13,15,17,19,21]; // K,M,O,Q,S,U
      var FECHA_COLS = [12,14,16,18,20,22]; // L,N,P,R,T,V

      // El paquete objetivo es el comprado HOY (la conversión en el ticket siempre es
      // del paquete de esa misma compra). Fecha de hoy desambigua entre paquetes viejos.
      var hoyGC_d = parseInt(Utilities.formatDate(new Date(),'America/Guayaquil','d'));
      var hoyGC_m = parseInt(Utilities.formatDate(new Date(),'America/Guayaquil','M'));
      var hoyGC_a = parseInt(Utilities.formatDate(new Date(),'America/Guayaquil','yyyy'));
      var targetRow = -1, targetHoy = -1;
      for (var pi = 2; pi < paqData.length; pi++) {
        var rowCed = (paqData[pi][3]||'').toString().trim(); // col D
        var rowSku = (paqData[pi][7]||'').toString().trim(); // col H
        if (!rowCed) continue;
        if (rowCed === cedPaq && rowSku.indexOf(skuPaq) >= 0) {
          targetRow = pi + 1; // última coincidencia (respaldo)
          if (parseInt(paqData[pi][0])===hoyGC_d && parseInt(paqData[pi][1])===hoyGC_m && parseInt(paqData[pi][2])===hoyGC_a) targetHoy = pi + 1;
        }
      }
      if (targetHoy > 0) targetRow = targetHoy;
      if (targetRow < 0) return respJsonGet({error:'Paquete no encontrado (ced:'+cedPaq+' sku:'+skuPaq+')'}, callback);

      var filled = 0;
      for (var ui = 0; ui < USO_COLS.length && filled < gcSlots.length; ui++) {
        var usoVal   = wsPaq.getRange(targetRow, USO_COLS[ui]).getValue();
        var fechaVal = wsPaq.getRange(targetRow, FECHA_COLS[ui]).getValue();
        if (!usoVal && !fechaVal) {
          var slot = gcSlots[filled];
          wsPaq.getRange(targetRow, USO_COLS[ui]).setValue(true);
          wsPaq.getRange(targetRow, FECHA_COLS[ui]).setValue('Gift Card, ' + slot.codigo);
          filled++;
        }
      }
      return respJsonGet({ok:true, filled:filled, row:targetRow}, callback);
    }

    // ── KPIs del mes vigente (desde cache) ──
    // ── Inventario ──
    if (action === 'getInventario') {
      try {
        var wsInv = ss.getSheets().find(function(s){ return s.getName().includes('INVENTARIO'); });
        if (!wsInv) return respJsonGet({error:'No INVENTARIO'}, callback);
        var invData = wsInv.getDataRange().getValues();
        var invItems = [], allSkus = [];
        for (var ii=2; ii<invData.length; ii++) {
          var iRow=invData[ii];
          var iSku=(iRow[0]||'').toString().trim();
          if (!iSku||iSku.indexOf('SUNSU-')<0) continue;
          var iStock=parseFloat(iRow[5])||0;
          var iMin=parseFloat(iRow[8])||0;
          var iAlerta=(iRow[10]||'').toString().trim();
          allSkus.push(iSku);
          invItems.push({
            sku:    iSku,
            nombre: (iRow[1]||'').toString().trim(),
            stock:  iStock,
            minimo: iMin,
            alerta: iAlerta||'—'
          });
        }
        var ultimoFisico = '';
        try {
          var wsIFu = ss.getSheetByName('📋 INV FÍSICO');
          if (wsIFu && wsIFu.getLastRow() > 1) {
            var fUlt = wsIFu.getRange(wsIFu.getLastRow(), 1).getValue();
            if (fUlt instanceof Date) ultimoFisico = Utilities.formatDate(fUlt, 'America/Guayaquil', 'dd/MM/yyyy');
          }
        } catch(eUF) {}
        return respJsonGet({items:invItems, allSkus:allSkus, ultimoFisico:ultimoFisico}, callback);
      } catch(errInv) {
        return respJsonGet({error:errInv.message}, callback);
      }
    }

    // ── Sesiones de inventario físico (agrupadas por fecha de guardado) ──
    if (action === 'getInvFisicoSesiones') {
      var wsIFs = ss.getSheetByName('📋 INV FÍSICO');
      if (!wsIFs || wsIFs.getLastRow() < 2) return respJsonGet({sesiones:[]}, callback);
      var dIFs = wsIFs.getDataRange().getValues();
      var sesMap = {};
      for (var si = 1; si < dIFs.length; si++) {
        var rS = dIFs[si];
        if (!(rS[0] instanceof Date)) continue;
        var idS = Utilities.formatDate(rS[0], 'America/Guayaquil', 'yyyy-MM-dd HH:mm:ss');
        var sS = sesMap[idS] = sesMap[idS] || {id:idS,
          fecha: Utilities.formatDate(rS[0], 'America/Guayaquil', 'dd/MM/yyyy HH:mm'),
          usuario: (rS[1]||'').toString(), total:0, difs:0, resueltas:0, fechaCuadre:''};
        sS.total++;
        if ((parseFloat(rS[6])||0) !== 0) {
          sS.difs++;
          var resS = rS[8];
          if (resS instanceof Date || (resS||'').toString().trim() !== '') {
            sS.resueltas++;
            var fRes = resS instanceof Date ? Utilities.formatDate(resS, 'America/Guayaquil', 'dd/MM/yyyy HH:mm') : resS.toString().trim();
            if (fRes > sS.fechaCuadre) sS.fechaCuadre = fRes; // la última resolución = fecha de cuadre
          }
        }
      }
      var sesiones = Object.keys(sesMap).map(function(k){ return sesMap[k]; })
        .sort(function(a,b){ return a.id < b.id ? 1 : -1; });
      return respJsonGet({sesiones:sesiones}, callback);
    }

    // ── Detalle de una sesión + RE-CRUCE contra el stock ACTUAL del sistema ──
    // Permite verificar que, tras corregir un error, la diferencia ya quede en cero.
    if (action === 'getInvFisicoDetalle') {
      var idDet = (e.parameter.id||'').toString();
      var wsIFd = ss.getSheetByName('📋 INV FÍSICO');
      if (!wsIFd || !idDet) return respJsonGet({error:'Sin datos'}, callback);
      var stockNow = {};
      try {
        var wsInvN = ss.getSheets().find(function(s){ return s.getName().includes('INVENTARIO'); });
        var invN = wsInvN.getDataRange().getValues();
        for (var ni = 2; ni < invN.length; ni++) {
          var skuN = (invN[ni][0]||'').toString().trim();
          if (skuN.indexOf('SUNSU-') >= 0) stockNow[skuN] = parseFloat(invN[ni][5])||0;
        }
      } catch(eSN) {}
      var dIFd = wsIFd.getDataRange().getValues();
      var itemsDet = [], fechaDet = '', usuDet = '';
      var ahoraRes = new Date();
      for (var di = 1; di < dIFd.length; di++) {
        var rD = dIFd[di];
        if (!(rD[0] instanceof Date)) continue;
        if (Utilities.formatDate(rD[0], 'America/Guayaquil', 'yyyy-MM-dd HH:mm:ss') !== idDet) continue;
        fechaDet = Utilities.formatDate(rD[0], 'America/Guayaquil', 'dd/MM/yyyy HH:mm');
        usuDet = (rD[1]||'').toString();
        var skuD = (rD[2]||'').toString().trim();
        var fisD = parseFloat(rD[5])||0;
        var difOrig = parseFloat(rD[6])||0;
        var sisAhora = stockNow.hasOwnProperty(skuD) ? stockNow[skuD] : null;
        var difAhora = sisAhora === null ? null : (fisD - sisAhora);
        var resuelto = rD[8] instanceof Date ? Utilities.formatDate(rD[8], 'America/Guayaquil', 'dd/MM/yyyy HH:mm') : (rD[8]||'').toString().trim();
        // SELLAR: si la diferencia original ya quedó en cero y aún no tiene fecha de resolución,
        // se guarda AHORA — queda como hecho histórico aunque el stock siga moviéndose después
        if (difOrig !== 0 && difAhora === 0 && !resuelto) {
          wsIFd.getRange(di + 1, 9).setValue(ahoraRes).setNumberFormat('dd/mm/yyyy hh:mm');
          wsIFd.getRange(di + 1, 1, 1, 9).setBackground('#E8F8EE');
          resuelto = Utilities.formatDate(ahoraRes, 'America/Guayaquil', 'dd/MM/yyyy HH:mm');
        }
        itemsDet.push({
          sku: skuD, nombre: (rD[3]||'').toString(),
          sistemaOriginal: parseFloat(rD[4])||0,
          fisico: fisD,
          difOriginal: difOrig,
          sistemaAhora: sisAhora,
          difAhora: difAhora,
          resuelto: resuelto,
          nota: (rD[9]||'').toString().trim()
        });
      }
      return respJsonGet({id:idDet, fecha:fechaDet, usuario:usuDet, items:itemsDet}, callback);
    }

    // ── Diagnóstico de días Jibble: paso a paso para depurar cuando sale '—' ──
    if (action === 'testDiasJibble') {
      var outTJ = {pasos:[]};
      try {
        var nomTJ = (e.parameter.nombre||'').toString().trim();
        var d1TJ = (e.parameter.desde||'').toString() || Utilities.formatDate(new Date(new Date().getFullYear(), new Date().getMonth()-1, 1),'UTC','yyyy-MM-dd');
        var d2TJ = (e.parameter.hasta||'').toString() || Utilities.formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 0),'UTC','yyyy-MM-dd');
        outTJ.pasos.push('Rango: '+d1TJ+' → '+d2TJ+' · Nombre: '+nomTJ);
        var tokTJ = null;
        try { tokTJ = getJibbleToken(); outTJ.pasos.push('Token Jibble: OK'); }
        catch(eT){ outTJ.pasos.push('Token Jibble: FALLÓ — '+eT.message); return respJsonGet(outTJ, callback); }
        var hTJ = null;
        try { hTJ = getHorasJibble(tokTJ, nomTJ, d1TJ, d2TJ); }
        catch(eG){ outTJ.pasos.push('getHorasJibble: EXCEPCIÓN — '+eG.message); return respJsonGet(outTJ, callback); }
        if (!hTJ) outTJ.pasos.push('Persona NO encontrada en Jibble con ese nombre');
        else outTJ.pasos.push('Encontrada. Días con marcación: '+hTJ.diasTrabajados+' · hrsNómina: '+hTJ.hrsNomina);
        outTJ.resultado = hTJ;
      } catch(eTJ) { outTJ.pasos.push('Error general: '+eTJ.message); }
      return respJsonGet(outTJ, callback);
    }

    // ── Foto de Drive en base64 (el servidor sí tiene acceso; el navegador no por CORS) ──
    if (action === 'fotoB64') {
      var idFB = (e.parameter.id||'').toString().replace(/[^-\w]/g,'');
      if (!idFB) return respJsonGet({error:'Falta id'}, callback);
      try {
        var blobFB = null;
        // 1º: miniatura grande vía Drive API (nítida y liviana)
        try {
          var metaFB = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/'+idFB+'?fields=thumbnailLink',
            { headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()}, muteHttpExceptions:true });
          if (metaFB.getResponseCode() === 200) {
            var tl = JSON.parse(metaFB.getContentText()).thumbnailLink;
            if (tl) {
              var rFB = UrlFetchApp.fetch(tl.replace(/=s\d+$/,'=s800'),
                { headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()}, muteHttpExceptions:true });
              if (rFB.getResponseCode() === 200) blobFB = rFB.getBlob();
            }
          }
        } catch(eT1) {}
        // 2º respaldo: miniatura nativa de DriveApp
        if (!blobFB) { try { blobFB = DriveApp.getFileById(idFB).getThumbnail(); } catch(eT2) {} }
        // 3º respaldo: el archivo completo (puede ser pesado)
        if (!blobFB) blobFB = DriveApp.getFileById(idFB).getBlob();
        return respJsonGet({ok:true, mime:blobFB.getContentType(), b64:Utilities.base64Encode(blobFB.getBytes())}, callback);
      } catch(eFB) { return respJsonGet({error:eFB.message}, callback); }
    }

    // ── ¿Existe esta cédula en el REGISTRO? (verificación instantánea al teclear) ──
    if (action === 'existeCedula') {
      var cedEC = (e.parameter.ced||'').toString().split('.')[0].replace(/[^0-9]/g,'').replace(/^0+/,'');
      if (!cedEC) return respJsonGet({existe:false}, callback);
      var wsEC = ss.getSheetByName('REGISTRO');
      if (!wsEC) return respJsonGet({existe:false}, callback);
      var dEC = wsEC.getDataRange().getValues();
      for (var ec = 1; ec < dEC.length; ec++) {
        var cRow = (dEC[ec][1]||'').toString().split('.')[0].replace(/[^0-9]/g,'').replace(/^0+/,'');
        if (cRow && cRow === cedEC) {
          // La MISMA regla que el guardado: cedula CON timestamp en col A = ya
          // registrada de verdad (bloquear con el mensaje de familia). Cedula SIN
          // timestamp = base antigua migrada: dejarla llenar el formulario, con su
          // nombre precargado de cortesia.
          var tsEC = dEC[ec][0];
          var tieneTsEC = (tsEC instanceof Date) || (tsEC!=null && String(tsEC).trim()!=='');
          if (tieneTsEC) {
            return respJsonGet({existe:true, fila:ec+1, nombre:(dEC[ec][2]||'').toString().trim()}, callback);
          }
          return respJsonGet({existe:false, completar:true, fila:ec+1,
            nombre:(dEC[ec][2]||'').toString().trim(), apellido:(dEC[ec][3]||'').toString().trim()}, callback);
        }
      }
      return respJsonGet({existe:false}, callback);
    }

    // ── Fichas completas del REGISTRO (para preparar las citas) ──
    // ── Directorio de clientas del REGISTRO ──
    // El TELEFONO solo viaja si el token es de recepcion o admin. Para cosmetologas
    // (o sin token) el numero NUNCA sale del servidor: ocultarlo en pantalla no basta.
    // ── Historial de tarjetas ENVIADAS (hoja de auditoría), últimas 400 ──
    // ── CABINA: todo el estado (inventario, activos, protocolos vigentes) ──
    // ── CABINA: mano de obra sugerida = (ROL + COMISIONES del mes) / faciales del mes ──
    // Cuenta visitas con facial (col T de TICKET_FICHA) de los ultimos 2 meses completos
    // y usa las filas 'ROL yyyy-mm' y 'COMISIONES yyyy-mm' que ya llenas para los KPIs.
    if (action === 'cabinaManoObraSugerida') {
      var hoyMO = new Date();
      var mesesMO = [];
      for (var k = 2; k >= 1; k--) {
        var dM = new Date(hoyMO.getFullYear(), hoyMO.getMonth()-k, 1);
        mesesMO.push(Utilities.formatDate(dM,'America/Guayaquil','yyyy-MM'));
      }
      var wsTkMO = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      var cntFac = {}; mesesMO.forEach(function(m){ cntFac[m]=0; });
      if (wsTkMO) {
        wsTkMO.getDataRange().getValues().slice(1).forEach(function(r){
          if (!(r[0] instanceof Date)) return;
          var mK = Utilities.formatDate(r[0],'America/Guayaquil','yyyy-MM');
          if (!(mK in cntFac)) return;
          var facT = (r[19]||'').toString().trim();
          if (facT && facT !== '-' && facT !== '—') cntFac[mK]++;
        });
      }
      // Sesiones de paquete (fechas de uso en 📋 PAQUETES) — de referencia
      var cntPaq = {}; mesesMO.forEach(function(m){ cntPaq[m]=0; });
      var wsPqMO = ss.getSheetByName('📋 PAQUETES');
      if (wsPqMO && wsPqMO.getLastRow() > 2) {
        var FECMO = [11,13,15,17,19,21];
        wsPqMO.getDataRange().getValues().slice(2).forEach(function(r){
          FECMO.forEach(function(ci){
            if (r[ci] instanceof Date) {
              var mP = Utilities.formatDate(r[ci],'America/Guayaquil','yyyy-MM');
              if (mP in cntPaq) cntPaq[mP]++;
            }
          });
        });
      }
      // 100% AUTOMATICO. Fuente principal: HISTORIAL de RRHH (los roles que el
      // sistema ya genera) — se suma el COSTO EMPRESA del mes de las cosmetologas.
      // Quienes son cosmetologas se deduce del rol de usuaria del app: reception y
      // admins quedan fuera solos. Si un mes no tiene rol generado, cae a los
      // respaldos: filas manuales ROL/COMISIONES yyyy-mm, o SUELDOS COSMETOLOGAS
      // + comisiones del historial.
      var rrhhMes = {};
      try {
        var MESN_MO = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
        var exclMO = {};
        try {
          var usersMO = JSON.parse(PropertiesService.getScriptProperties().getProperty('SUNSU_USERS')||'{}');
          Object.keys(usersMO).forEach(function(u){
            var itU = usersMO[u]||{};
            var rlU = (itU.role||'').toString();
            if (rlU==='reception'||rlU==='admin'||rlU==='admin_master') {
              exclMO[_normNombre_(((itU.name||u)+'').split(' ')[0])] = true;
            }
          });
        } catch(eUx) {}
        var ssRHmo = SpreadsheetApp.openById('1SOFRvcUQyAaCCgGQkLZ35XWApyuw4bwGgCXS0PHfqHs');
        var wsRHmo = ssRHmo.getSheetByName('HISTORIAL');
        if (wsRHmo) {
          var dRHmo = wsRHmo.getDataRange().getValues();
          mesesMO.forEach(function(m){
            var yM = parseInt(m.slice(0,4)), miM = parseInt(m.slice(5,7))-1;
            var totM = 0, halloM = false;
            for (var rh=1; rh<dRHmo.length; rh++) {
              var rR = dRHmo[rh];
              if (!rR[0] || !rR[2]) continue;
              if ((rR[0]||'').toString().trim().toUpperCase() !== MESN_MO[miM]) continue;
              if (parseInt(rR[1]) !== yM) continue;
              var pnR = _normNombre_(((rR[2]||'')+'').split(' ')[0]);
              if (exclMO[pnR]) continue; // recepcion / admins: no son costo directo del facial
              var ceR = parseFloat(rR[11]); // costo empresa (ingresos + IESS patronal)
              if (isNaN(ceR) || ceR <= 0) ceR = parseFloat(rR[9])||0; // respaldo: total ingresos
              totM += ceR; halloM = true;
            }
            if (halloM && totM > 0) rrhhMes[m] = totM;
          });
        }
      } catch(eRHx) {}
      var rolMO = {}, comMO = {}, sueldosMO = 0, hallSueldos = false;
      var wsCfgMO = ss.getSheetByName('⚙ CONFIGURACION');
      if (wsCfgMO) {
        wsCfgMO.getDataRange().getValues().forEach(function(r){
          var kU = (r[0]||'').toString().trim().toUpperCase();
          var mR = kU.match(/^ROL\s+(20\d{2}-\d{2})$/);
          var mC = kU.match(/^COMISIONES\s+(20\d{2}-\d{2})$/);
          if (mR) rolMO[mR[1]] = parseFloat(r[1])||0;
          if (mC) comMO[mC[1]] = parseFloat(r[1])||0;
          if (kU === 'SUELDOS COSMETOLOGAS') { hallSueldos = true; sueldosMO = parseFloat((r[1]||'').toString().replace(/[^0-9.\-]/g,''))||0; }
        });
        if (!hallSueldos) { try { wsCfgMO.appendRow(['SUELDOS COSMETOLOGAS','']); } catch(eSC) {} }
      }
      var comAutoMO = 0;
      try {
        var histMO = JSON.parse(PropertiesService.getScriptProperties().getProperty('SUNSU_HISTORIAL_COMISIONES')||'{}');
        var MESES_MO = {ENERO:0,FEBRERO:1,MARZO:2,ABRIL:3,MAYO:4,JUNIO:5,JULIO:6,AGOSTO:7,SEPTIEMBRE:8,OCTUBRE:9,NOVIEMBRE:10,DICIEMBRE:11};
        var persMO = [];
        Object.keys(histMO).forEach(function(k){
          var mm = k.match(/COM\s+(\w+)(\d{2})-(\w+)(\d{2})/i);
          if (!mm) return;
          var mesFin = MESES_MO[mm[3].toUpperCase()];
          if (mesFin == null) return;
          var totK = (histMO[k].cosmetologas||[]).reduce(function(a,c){ return a+(parseFloat(c.total)||0); }, 0);
          persMO.push({t: new Date(2000+parseInt(mm[4]), mesFin, 25).getTime(), tot: totK});
        });
        persMO.sort(function(a,b){ return b.t-a.t; });
        var top2MO = persMO.slice(0,2);
        if (top2MO.length) comAutoMO = top2MO.reduce(function(a,x){ return a+x.tot; }, 0) / top2MO.length;
      } catch(eCA) {}
      var salidaMO = [], sumaMO = 0, nMO = 0;
      mesesMO.forEach(function(m){
        var nomM, fuenteM;
        if ((rrhhMes[m]||0) > 0) { nomM = rrhhMes[m]; fuenteM = 'roles RRHH'; }
        else if ((rolMO[m]||0) > 0 || (comMO[m]||0) > 0) { nomM = (rolMO[m]||0)+((comMO[m]||0)>0?comMO[m]:comAutoMO); fuenteM = 'manual'; }
        else { nomM = sueldosMO + comAutoMO; fuenteM = 'config + com auto'; }
        var facM = cntFac[m];
        salidaMO.push({mes:m, faciales:facM, sesionesPaq:cntPaq[m], nomina:nomM, fuente:fuenteM});
        if (nomM > 0 && facM > 0) { sumaMO += nomM/facM; nMO++; }
      });
      return respJsonGet({meses:salidaMO, sugerido: nMO ? sumaMO/nMO : 0, conDatos:nMO}, callback);
    }

    if (action === 'getCabina') {
      var ssGB = _cabinaSS_();
      if (!ssGB) return respJsonGet({sinEstructura:true}, callback);
      var lee = function(nombre){
        var w = ssGB.getSheetByName(nombre);
        if (!w || w.getLastRow() < 2) return [];
        return w.getRange(2,1,w.getLastRow()-1,w.getLastColumn()).getValues();
      };
      // Migracion de una sola vez (pedida el 16/07): el MINIMO de alerta de todos
      // los productos existentes pasa a 0. Corre sola en la primera carga y deja
      // marca en propiedades para no repetirse jamas.
      try {
        var propsMin = PropertiesService.getScriptProperties();
        if (!propsMin.getProperty('CABINA_MIN_CERO')) {
          var wMin = ssGB.getSheetByName('🧴 INVENTARIO CABINA');
          if (wMin && wMin.getLastRow() > 1) {
            var nMin = wMin.getLastRow()-1;
            var cerosMin = [];
            for (var im = 0; im < nMin; im++) cerosMin.push([0]);
            wMin.getRange(2,11,nMin,1).setValues(cerosMin);
          }
          propsMin.setProperty('CABINA_MIN_CERO','1');
        }
      } catch(eMin) {}
      // Migracion de una sola vez (19/07): la col ABIERTO pasa de ml/g a NUMERO
      // DE ENVASES abiertos. Filas viejas con ml se convierten (ceil(ml/contenido))
      // y el stock J se recalcula como (cerrados+bodega+abiertos)*contenido.
      try {
        var propsAb = PropertiesService.getScriptProperties();
        if (!propsAb.getProperty('CABINA_ABIERTO_ENV')) {
          var wAbM = ssGB.getSheetByName('🧴 INVENTARIO CABINA');
          if (wAbM && wAbM.getLastRow() > 1) {
            var dAbM = wAbM.getDataRange().getValues();
            for (var iam = 1; iam < dAbM.length; iam++) {
              var abM = parseFloat(dAbM[iam][8])||0;
              var conM = parseFloat(dAbM[iam][3])||0;
              if (abM > 0 && conM > 0 && abM >= conM/2) {
                var nAbM = Math.max(1, Math.ceil(abM/conM - 0.01));
                // Solo convertir si parece estar en ml (mayor o igual a medio envase)
                if (abM > (parseInt(dAbM[iam][20])||1)*1.5 || abM >= conM) {
                  wAbM.getRange(iam+1,9).setValue(nAbM);
                  abM = nAbM;
                }
              }
              var locM = parseFloat(dAbM[iam][7])||0, bodM = parseFloat(dAbM[iam][14])||0;
              if ((dAbM[iam][0]||'').toString().trim())
                wAbM.getRange(iam+1,10).setValue((locM+bodM+abM)*conM);
            }
          }
          propsAb.setProperty('CABINA_ABIERTO_ENV','1');
        }
      } catch(eAbM) {}
      var fotosGB = {};
      try { fotosGB = JSON.parse(PropertiesService.getScriptProperties().getProperty('CABINA_FOTOS')||'{}'); } catch(eFG) {}
      var invGB = lee('🧴 INVENTARIO CABINA').map(function(r,i){
        return {row:i+2, codigo:(r[0]||'').toString(), producto:(r[1]||'').toString(), proveedor:(r[2]||'').toString(),
          contenido:parseFloat(r[3])||0, unidad:(r[4]||'').toString(), costoEnvase:parseFloat(r[5])||0,
          costoUnidad:parseFloat(r[6])||0, cerrados:parseFloat(r[7])||0, abierto:parseFloat(r[8])||0,
          stock:parseFloat(r[9])||0, minimo:parseFloat(r[10])||0, notas:(r[11]||'').toString(),
          activo:((r[12]||'SI')+'').toString().trim()||'SI', skuCat:(r[13]||'').toString().trim(),
          bodega:parseFloat(r[14])||0, barras:(r[15]||'').toString().trim(), base:(r[16]||'').toString().trim(), ubicacion:(r[17]||'').toString().trim(),
          ubicacionLocal:(r[18]||'').toString().trim(), ubicacionAbierto:(r[19]||'').toString().trim(),
          maxAbiertos:Math.max(1, parseInt(r[20])||1),
          foto: fotosGB[(r[0]||'').toString().trim()] ? 'https://lh3.googleusercontent.com/d/'+fotosGB[(r[0]||'').toString().trim()] : ''};
      }).filter(function(x){return x.codigo||x.producto;});
      var actGB = lee('🛠 ACTIVOS').map(function(r,i){
        // Migracion de LECTURA transparente: filas viejas traen la cantidad como
        // texto en D ('2 par') y el lado en LUGAR; filas nuevas traen D=local (num),
        // M=bodega, N=unidad. Nada que tocar en el sheet: ambas se entienden.
        var cBodR = (r[12]===''||r[12]===null||r[12]===undefined) ? '' : r[12];
        var uniR = (r[13]||'').toString().trim();
        var cLoc = 0, cBod = 0, uni = 'unidad';
        if (cBodR === '' && !uniR) {
          var mAnt = ((r[3]||'')+'').trim().match(/^([\d.,]*)\s*(.*)$/);
          var nAnt = mAnt ? (parseFloat((mAnt[1]||'').replace(',','.'))||0) : 0;
          uni = (mAnt && mAnt[2]) ? mAnt[2] : 'unidad';
          if ((((r[9]||'SUNSU')+'').trim()) === 'BODEGA') cBod = nAnt; else cLoc = nAnt;
        } else {
          cLoc = parseFloat(r[3])||0;
          cBod = parseFloat(cBodR)||0;
          uni = uniR || 'unidad';
        }
        return {row:i+2, codigo:(r[0]||'').toString(), activo:(r[1]||'').toString(), categoria:(r[2]||'').toString(),
          cantLocal:cLoc, cantBodega:cBod, unidadC:uni,
          cantidad:((cLoc+cBod)||'')===''?'':((cLoc+cBod)+(uni!=='unidad'?' '+uni:'')),
          ubicacion:(r[4]||'').toString(), estado:(r[5]||'').toString(),
          fechaCompra:(r[6] instanceof Date)?Utilities.formatDate(r[6],'America/Guayaquil','dd/MM/yyyy'):(r[6]||'').toString(),
          costo:(r[7]||'').toString(), notas:(r[8]||'').toString(), lugar:((r[9]||'SUNSU')+'').toString().trim()||'SUNSU',
          barras:(r[10]||'').toString().trim(), proveedor:(r[11]||'').toString().trim(),
          foto: fotosGB[(r[0]||'').toString().trim()] ? 'https://lh3.googleusercontent.com/d/'+fotosGB[(r[0]||'').toString().trim()] : ''};
      }).filter(function(x){return x.codigo||x.activo;});
      var pasGB = lee('📝 PROTOCOLO PASOS');
      var proGB = lee('📋 PROTOCOLOS').map(function(r){
        var skuP=(r[0]||'').toString().trim(), verP=parseInt(r[2])||1;
        var pasosP = pasGB.filter(function(pp){ return (pp[0]||'').toString().trim()===skuP && (parseInt(pp[1])||0)===verP; })
          .sort(function(a,b){ return (parseInt(a[2])||0)-(parseInt(b[2])||0); })
          .map(function(pp){ return {paso:parseInt(pp[2])||0, desc:(pp[3]||'').toString(), productoCod:(pp[4]||'').toString(), cantidad:parseFloat(pp[5])||0, unidad:(pp[6]||'').toString(), minutos:parseFloat(pp[7])||0}; });
        return {sku:skuP, nombre:(r[1]||'').toString(), version:verP, vigente:(r[3]||'').toString(),
          manoObra:parseFloat(r[4])||0, video:(r[5]||'').toString(), notas:(r[6]||'').toString(),
          actualizado:(r[7]||'').toString(), por:(r[8]||'').toString(), pasos:pasosP};
      }).filter(function(x){return x.sku;});
      // ── COSTOS FIJOS prorrateados: filas 'FIJO ...' de CONFIGURACION (renta, luz,
      // internet...) ÷ faciales del ultimo mes completo. Si no existen las filas,
      // se crean solas con las categorias tipicas para llenar UNA vez. ──
      var fijosGB = 0, fijosDet = [], hayFijoGB = false;
      try {
        var wsCfgGB = ss.getSheetByName('⚙ CONFIGURACION');
        if (wsCfgGB) {
          wsCfgGB.getDataRange().getValues().forEach(function(r){
            var kF = (r[0]||'').toString().trim();
            if (/^FIJO\s+/i.test(kF)) {
              hayFijoGB = true;
              var vF = parseFloat((r[1]||'').toString().replace(/[^0-9.\-]/g,''))||0;
              if (vF > 0) fijosGB += vF;
              fijosDet.push({k:kF.replace(/^FIJO\s+/i,''), v:vF});
            }
          });
          if (!hayFijoGB) {
            [['FIJO RENTA',''],['FIJO LUZ',''],['FIJO AGUA',''],['FIJO INTERNET',''],['FIJO OTROS','']].forEach(function(fr){
              try { wsCfgGB.appendRow(fr); } catch(eFR) {}
            });
          }
        }
      } catch(eFj) {}
      var facMesGB = 0, mesRefGB = '';
      try {
        var dRef = new Date(); dRef = new Date(dRef.getFullYear(), dRef.getMonth()-1, 1);
        mesRefGB = Utilities.formatDate(dRef,'America/Guayaquil','yyyy-MM');
        // El conteo es un promedio de referencia: se calcula UNA vez y se cachea 6h,
        // en vez de escanear todo TICKET_FICHA en cada apertura de la pestana.
        var cacheGB = CacheService.getScriptCache();
        var cvGB = cacheGB.get('cab_facmes_'+mesRefGB);
        if (cvGB !== null) {
          facMesGB = parseInt(cvGB)||0;
        } else {
          var wsTkGB = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
          if (wsTkGB) {
            wsTkGB.getDataRange().getValues().slice(1).forEach(function(r){
              var fGB = _fechaDe_(r[0]);
              if (!fGB) return;
              if (Utilities.formatDate(fGB,'America/Guayaquil','yyyy-MM') !== mesRefGB) return;
              var fT = (r[19]||'').toString().trim();
              if (fT && fT !== '-' && fT !== '—') facMesGB++;
            });
          }
          try { cacheGB.put('cab_facmes_'+mesRefGB, String(facMesGB), 21600); } catch(eCg) {}
        }
      } catch(eFc) {}
      var fijoPorFacialGB = (fijosGB > 0 && facMesGB > 0) ? fijosGB/facMesGB : 0;
      var bajasGB = [];
      try {
        var wBJg = ssGB.getSheetByName('🪦 BAJAS');
        if (wBJg && wBJg.getLastRow() > 1) {
          var iniBJ = Math.max(2, wBJg.getLastRow()-29);
          bajasGB = wBJg.getRange(iniBJ,1,wBJg.getLastRow()-iniBJ+1,9).getValues().map(function(r){
            return {num:(r[0]||'').toString(), fecha:(r[1]||'').toString(), tipo:(r[2]||'').toString(), codigo:(r[3]||'').toString(),
              nombre:(r[4]||'').toString(), cantidad:(r[5]||'').toString(), razon:(r[6]||'').toString(), por:(r[7]||'').toString(), foto:(r[8]||'').toString()};
          }).filter(function(x){return x.num;}).reverse();
        }
      } catch(eBJg) {}
      var apsGB = [];
      try {
        var wApG = ssGB.getSheetByName('🍾 APERTURAS');
        if (wApG && wApG.getLastRow() > 1) {
          var iniAp = Math.max(2, wApG.getLastRow()-29);
          apsGB = wApG.getRange(iniAp,1,wApG.getLastRow()-iniAp+1,7).getValues().map(function(r){
            return {num:(r[0]||'').toString(), fecha:(r[1]||'').toString(), accion:(r[2]||'').toString(), codigo:(r[3]||'').toString(),
              nombre:(r[4]||'').toString(), cantidad:(r[5]||'').toString(), por:(r[6]||'').toString()};
          }).filter(function(x){return x.num;}).reverse();
        }
      } catch(eApG) {}
      var trasGB = [];
      try {
        var wTRg = ssGB.getSheetByName('🚚 TRASPASOS');
        if (wTRg && wTRg.getLastRow() > 1) {
          var iniTR = Math.max(2, wTRg.getLastRow()-49);
          trasGB = wTRg.getRange(iniTR,1,wTRg.getLastRow()-iniTR+1,6).getValues().map(function(r){
            var itsT = []; try { itsT = JSON.parse(r[3]||'[]'); } catch(eT) {}
            return {num:(r[0]||'').toString(), fecha:(r[1]||'').toString(), ruta:(r[2]||'').toString(), items:itsT, por:(r[4]||'').toString()};
          }).filter(function(x){return x.num;}).reverse();
        }
      } catch(eTRg) {}
      var ocsGB = [];
      try {
        var wOCg = ssGB.getSheetByName('🛒 ORDENES CABINA');
        if (wOCg && wOCg.getLastRow() > 1) {
          var iniOC = Math.max(2, wOCg.getLastRow()-99);
          ocsGB = wOCg.getRange(iniOC,1,wOCg.getLastRow()-iniOC+1,9).getValues().map(function(r,ix){
            var itsG = []; try { itsG = JSON.parse(r[3]||'[]'); } catch(eIt) {}
            return {row:iniOC+ix, num:(r[0]||'').toString(), fecha:(r[1]||'').toString(), proveedor:(r[2]||'').toString(),
              items:itsG, estado:(r[4]||'').toString(), total:parseFloat(r[5])||0, por:(r[6]||'').toString(),
              recibida:(r[7]||'').toString(), recibidaPor:(r[8]||'').toString()};
          }).filter(function(x){return x.num;}).reverse();
        }
      } catch(eOCg) {}
      return respJsonGet({inventario:invGB, activos:actGB, protocolos:proGB, ordenes:ocsGB, traspasos:trasGB, bajas:bajasGB, aperturas:apsGB,
        fijosMensuales:fijosGB, fijosDetalle:fijosDet, facialesMesRef:facMesGB, mesRef:mesRefGB,
        fijoPorFacial:fijoPorFacialGB}, callback);
    }

    if (action === 'getEnviosTarjetas') {
      var wsET = ss.getSheetByName('📤 ENVÍOS TARJETAS');
      if (!wsET || wsET.getLastRow() < 2) return respJsonGet({envios:[]}, callback);
      var iniET = Math.max(2, wsET.getLastRow()-399);
      var dET = wsET.getRange(iniET, 1, wsET.getLastRow()-iniET+1, 7).getValues();
      var envET = dET.map(function(r){
        return {f:(r[0]||'').toString(), clienta:(r[1]||'').toString(), cedula:(r[2]||'').toString(),
                telefono:(r[3]||'').toString(), que:(r[4]||'').toString(), fTicket:(r[5]||'').toString(), por:(r[6]||'').toString()};
      }).filter(function(x){return x.f;}).reverse(); // mas recientes primero
      return respJsonGet({envios:envET}, callback);
    }

    // ── CAJA CHICA V2: saldo + movimientos (sincroniza efectivo de tickets al vuelo) ──
    // ── DASHBOARD DE INICIO (admins): el pulso del dia, la semana y el mes ──
    if (action === 'getDashboardHoy') {
      var rolDH = _rolDeToken_(PropertiesService.getScriptProperties(), e.parameter.token||'');
      if (rolDH!=='admin' && rolDH!=='admin_master') return respJsonGet({error:'Solo administradores'}, callback);
      var wsDH = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsDH) return respJsonGet({error:'No hay TICKET_FICHA'}, callback);
      var finDH = _ultimaFilaDatos_(wsDH);
      if (finDH < 2) return respJsonGet({hoy:{tickets:0,venta:0}, semana:{total:0,dias:[]}, mes:{total:0,semanas:[]}}, callback);
      var iniDH = Math.max(2, finDH-1499); // ~1 mes de tickets
      var headsDH = wsDH.getRange(1,1,1,wsDH.getLastColumn()).getValues()[0];
      var colPaqDH = -1, prodColsDH = [];
      for (var hd = 0; hd < headsDH.length; hd++) {
        var hTx = ((headsDH[hd]||'')+'').toString().trim();
        if (colPaqDH < 0 && hTx.toUpperCase().indexOf('PAQUETE') >= 0) colPaqDH = hd;
        if (hTx.match(/^[A-Z]{2,3}-\d+/)) prodColsDH.push({idx:hd, cod:hTx.toUpperCase().replace(/^SUNSU-/,'')});
      }
      var nomCatDH = {}, subCatDH = {}, compraDH = {};
      try {
        var wsCatDH = ss.getSheets().find(function(sx){return sx.getName().includes('CATALOGO');});
        if (wsCatDH) wsCatDH.getDataRange().getValues().slice(2).forEach(function(rC){
          var cC=(rC[0]||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'');
          if(!cC) return;
          nomCatDH[cC]=(rC[1]||'').toString().trim();
          // Subtotal SIN IVA del catálogo (col D); fallback: total c/IVA ÷ 1.15
          var sbC=parseFloat(rC[3])||0, tvC=parseFloat(rC[5])||0;
          subCatDH[cC]=sbC>0?sbC:(tvC>0?tvC/1.15:0);
          compraDH[cC]=parseFloat(rC[6])||0; // compra del catálogo (fallback)
        });
      } catch(eCatD) {}
      try {
        // Compra REAL desde INVENTARIO (col G) pisa la del catálogo
        var wsInvDH = ss.getSheets().find(function(sx){return sx.getName().includes('INVENTARIO');});
        if (wsInvDH) wsInvDH.getDataRange().getValues().slice(2).forEach(function(rI){
          var cI=(rI[0]||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'');
          var crI=parseFloat(rI[6])||0;
          if(cI&&crI>0) compraDH[cI]=crI;
        });
      } catch(eInvD) {}
      // Cod de un texto tipo 'SUNSU-01 Facial S.O.S' o 'SUNSU-HT-002 Niacinamide...'
      var codDeDH = function(txt){
        var mC=(txt||'').toString().trim().toUpperCase().match(/^SUNSU-([A-Z]{2,3}-\d+|\d+)/);
        return mC?mC[1]:null;
      };
      var subDeDH = function(txt){ var c=codDeDH(txt); return (c&&subCatDH[c])?subCatDH[c]:0; };
      var dDH = wsDH.getRange(iniDH,1,finDH-iniDH+1,wsDH.getLastColumn()).getValues();
      var hoyKey = Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM-dd');
      var mesKey = Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM');
      var dias7 = [], diasMap = {};
      var NOMD = ['Do','Lu','Ma','Mi','Ju','Vi','Sa'];
      // LA SEMANA: de LUNES a DOMINGO, siempre
      var lunD_ = new Date(); lunD_.setDate(lunD_.getDate()-((lunD_.getDay()+6)%7));
      for (var d7 = 0; d7 < 7; d7++) {
        var fD7 = new Date(lunD_); fD7.setDate(lunD_.getDate()+d7);
        var k7 = Utilities.formatDate(fD7,'America/Guayaquil','yyyy-MM-dd');
        var obj7 = {k:k7, label:NOMD[fD7.getDay()]+' '+fD7.getDate(), total:0, tickets:0};
        dias7.push(obj7); diasMap[k7]=obj7;
      }
      // El mes, por semanas CALENDARIO: la Sem 1 va del dia 1 al primer domingo
      // (arranque el dia que arranque el mes); luego lunes–domingo; la ultima se
      // corta en fin de mes. El label lleva el rango y cuantos dias abarca.
      var _pM_ = mesKey.split('-');
      var _aM_ = parseInt(_pM_[0],10), _mM_ = parseInt(_pM_[1],10);
      var _finMes_ = new Date(_aM_, _mM_, 0).getDate();
      var mesSem = [];
      var _iS_ = 1, _nS_ = 1;
      while (_iS_ <= _finMes_) {
        var _dow_ = new Date(_aM_, _mM_-1, _iS_).getDay(); // 0=Do
        var _fS_ = (_dow_ === 0) ? _iS_ : _iS_ + (7 - _dow_);
        if (_fS_ > _finMes_) _fS_ = _finMes_;
        var _nd_ = _fS_ - _iS_ + 1;
        mesSem.push({label:'Sem '+_nS_+' ('+_iS_+'–'+_fS_+') ('+_nd_+')', ini:_iS_, fin:_fS_, total:0});
        _iS_ = _fS_ + 1; _nS_++;
      }
      var mesTot = 0;
      var paqChipsDH = [];
      var hoyDH = {tickets:0, venta:0, faciales:0, paquetes:0, productosN:0,
        valFac:0, valPaq:0, valProd:0, costoProd:0, extrasN:0, valExtras:0,
        pagos:{efectivo:0, transferencia:0, tarjeta:0, mixto:0, otros:0}, topFac:{}, topProd:{}};
      for (var td = 0; td < dDH.length; td++) {
        var rD = dDH[td];
        var fD = _fechaDe_(rD[0]);
        if (!fD) continue;
        var kD = Utilities.formatDate(fD,'America/Guayaquil','yyyy-MM-dd');
        var totD = parseFloat(rD[9])||0;
        if (kD.slice(0,7) === mesKey) {
          mesTot += totD;
          var diaMes = fD.getDate();
          for (var wS_=0; wS_<mesSem.length; wS_++) {
            if (diaMes>=mesSem[wS_].ini && diaMes<=mesSem[wS_].fin) { mesSem[wS_].total += totD; break; }
          }
        }
        var enSem = diasMap[kD];
        if (enSem) { enSem.total += totD; enSem.tickets++; }
        if (kD !== hoyKey) continue;
        hoyDH.tickets++;
        hoyDH.venta += totD;
        var facD = (rD[19]||'').toString().trim();
        // Un facial CANJEADO (paquete col Q o gift card col R) cuenta como facial
        // hecho pero vale $0 — aunque el ticket tenga productos pagados. La plata
        // de ese facial ya entró cuando se vendió el paquete o la GC.
        var esCanjeD = ((rD[16]||'')+'').indexOf('SI')===0 || ((rD[17]||'')+'').indexOf('SI')===0;
        // EXTRAS (col W): 'SUNSU-15 Ampolla PDRN | SUNSU-12 X [CORTESIA: motivo]'
        // — el precio NO viene en el texto: se busca por SKU en el CATÁLOGO
        // (igual que el historial). Cortesías: cuentan aparte y valen $0.
        var exD = (rD[22]||'').toString().trim();
        if (exD && exD.toLowerCase() !== 'false') {
          exD.split('|').forEach(function(peD){
            var pD = peD.trim();
            if (!pD) return;
            if (pD.toUpperCase().indexOf('CORTES') >= 0) { hoyDH.extrasN++; hoyDH.extrasCort=(hoyDH.extrasCort||0)+1; return; }
            hoyDH.extrasN++;
            var mSkD = pD.toUpperCase().match(/SUNSU-([A-Z]{2,3}-\d+|\d+)/);
            if (mSkD && subCatDH[mSkD[1]]) hoyDH.valExtras += subCatDH[mSkD[1]];
          });
        }
        if (facD && facD!=='-' && facD!=='—') {
          hoyDH.faciales++;
          hoyDH.topFac[facD]=(hoyDH.topFac[facD]||0)+1;
          if (esCanjeD) hoyDH.facCanjes=(hoyDH.facCanjes||0)+1;
          else if (totD > 0) hoyDH.valFac+=subDeDH(facD);
          else hoyDH.facCanjes=(hoyDH.facCanjes||0)+1; // cortesía en $0: tampoco suma
        }
        // Paquetes VENDIDOS hoy: cols U/V del propio ticket (pack3/pack6). Es la
        // misma fuente que el resto del dashboard — no depende de que la
        // sincronizacion a 📋 PAQUETES ya haya corrido.
        var p3D = (rD[20]||'').toString().trim(), p6D = (rD[21]||'').toString().trim();
        var cliPq = ((rD[3]||'')+'').toString().trim();
        if (p3D && p3D.toLowerCase()!=='false') { hoyDH.paquetes++; hoyDH.valPaq+=subDeDH(p3D); paqChipsDH.push({nombre:p3D.replace(/^SUNSU-\d+\s*/,'')+(cliPq?' · '+cliPq:''), n:1}); }
        if (p6D && p6D.toLowerCase()!=='false') { hoyDH.paquetes++; hoyDH.valPaq+=subDeDH(p6D); paqChipsDH.push({nombre:p6D.replace(/^SUNSU-\d+\s*/,'')+(cliPq?' · '+cliPq:''), n:1}); }
        prodColsDH.forEach(function(pcD){
          var qD = parseInt(rD[pcD.idx])||0;
          if (qD > 0) {
            hoyDH.productosN += qD;
            hoyDH.valProd  += qD * (subCatDH[pcD.cod]||0);
            hoyDH.costoProd+= qD * (compraDH[pcD.cod]||0);
            var nmD = nomCatDH[pcD.cod] || pcD.cod;
            hoyDH.topProd[nmD]=(hoyDH.topProd[nmD]||0)+qD;
          }
        });
        if (((rD[16]||'')+'').indexOf('SI')===0 || ((rD[17]||'')+'').indexOf('SI')===0) hoyDH.canjes=(hoyDH.canjes||0)+1;
        // ── PAGOS ── Regla de oro: el monto de un metodo es EL TOTAL DEL TICKET.
        // Los numeros dentro del texto suelen ser REFERENCIAS bancarias o vouchers
        // (por eso salio una 'transferencia de $134 millones'): solo se usan para
        // repartir un pago MIXTO, y unicamente si su suma cuadra con el total.
        if (totD > 0) {
          var cobD = (rD[8]||'').toString();
          var cbL = cobD.toLowerCase();
          var mets = [];
          if (cbL.indexOf('efect')>=0) mets.push('efectivo');
          if (cbL.indexOf('trans')>=0 || cbL.indexOf('depósito')>=0 || cbL.indexOf('deposito')>=0) mets.push('transferencia');
          if (cbL.indexOf('tarj')>=0 || cbL.indexOf('cred')>=0 || cbL.indexOf('deb')>=0 || cbL.indexOf('datafast')>=0 || cbL.indexOf('voucher')>=0) mets.push('tarjeta');
          if (mets.length === 1) hoyDH.pagos[mets[0]] += totD;
          else if (mets.length > 1) {
            var paresP = {}, sumP = 0;
            var msP = cobD.match(/([a-záéíóú]+)\s*[:=]\s*\$?\s*([\d.,]+)/gi) || [];
            msP.forEach(function(mm){
              var pp = mm.match(/([a-záéíóú]+)\s*[:=]\s*\$?\s*([\d.,]+)/i);
              if (!pp) return;
              var mw = pp[1].toLowerCase(), val = parseFloat(pp[2].replace(',','.'))||0;
              if (val <= 0 || val > totD*1.2+1) return; // numero implausible = referencia, se ignora
              var metP = mw.indexOf('efect')===0?'efectivo':(mw.indexOf('trans')===0?'transferencia':((mw.indexOf('tarj')===0||mw.indexOf('cred')===0||mw.indexOf('deb')===0)?'tarjeta':''));
              if (!metP) return;
              paresP[metP]=(paresP[metP]||0)+val; sumP += val;
            });
            if (sumP > 0 && Math.abs(sumP-totD) <= Math.max(1, totD*0.15)) {
              Object.keys(paresP).forEach(function(kp){ hoyDH.pagos[kp] += paresP[kp]; });
            } else {
              hoyDH.pagos.mixto += totD; // varios metodos sin desglose confiable
            }
          } else {
            hoyDH.pagos.otros += totD;
          }
        }
      }
      var topFacArr = Object.keys(hoyDH.topFac).map(function(k){return {nombre:k, n:hoyDH.topFac[k]};})
        .sort(function(a,b){return b.n-a.n;}).slice(0,6);
      var topProdArr = Object.keys(hoyDH.topProd).map(function(k){return {nombre:k, n:hoyDH.topProd[k]};})
        .sort(function(a,b){return b.n-a.n;}).slice(0,8);
      var semTot = 0; dias7.forEach(function(x){ semTot += x.total; });
      var saldoDH = 0;
      try { saldoDH = _cajaV2Saldo_(_cajaV2Sheet_(ss)); } catch(eCjD) {}
      // Citas de hoy: de ACUITY en vivo — la misma fuente que usa la pestana
      // Citas (la hoja CITAS_HOY tenia filas fantasma y contaba de mas)
      var citasDH = 0;
      try {
        var fechaEcD = _fechaEcuador(0);
        var uidD = PropertiesService.getScriptProperties().getProperty('ACUITY_UID');
        var keyD = PropertiesService.getScriptProperties().getProperty('ACUITY_KEY');
        var respD = UrlFetchApp.fetch(
          'https://acuityscheduling.com/api/v1/appointments?minDate='+fechaEcD+'T00:00:00&maxDate='+fechaEcD+'T23:59:59&max=100',
          {headers:{'Authorization':'Basic '+Utilities.base64Encode(uidD+':'+keyD)}, muteHttpExceptions:true}
        );
        var parsedD = JSON.parse(respD.getContentText());
        if (Array.isArray(parsedD)) citasDH = parsedD.filter(function(a){ return !a.canceled; }).length;
      } catch(eCiD) {}
      // Gift Cards vendidas HOY: hoja 🎁 GIFT CARDS, venta fechada en cols B/C/D
      // (dia/mes/anio), compradora en F (o cedula en E), monto en G si es numero
      var gcHoyN = 0, gcChips = [], gcValDH = 0;
      try {
        var wsGCDash = ss.getSheetByName('🎁 GIFT CARDS');
        if (wsGCDash) {
          var hoyD_ = new Date();
          var dD_ = hoyD_.getDate(), mD_ = hoyD_.getMonth()+1, aD_ = hoyD_.getFullYear();
          wsGCDash.getDataRange().getValues().slice(2).forEach(function(rG){
            if (!((rG[0]||'')+'').trim()) return;
            if ((parseInt(rG[1])||0)!==dD_ || (parseInt(rG[2])||0)!==mD_) return;
            var anG = parseInt(rG[3])||0; if (anG && anG!==aD_ && anG!==aD_%100) return;
            gcHoyN++;
            var nomG = ((rG[5]||'')+'').trim() || ((rG[4]||'')+'').trim() || 'GC '+((rG[0]||'')+'').trim();
            var monG = parseFloat(rG[6]);
            if (monG > 0) gcValDH += monG;
            gcChips.push({nombre:nomG+(monG>0?' · $'+monG.toFixed(0):''), n:1});
          });
        }
      } catch(eGCd) {}
            hoyDH.valFac = Math.round(hoyDH.valFac*100)/100;
      hoyDH.valPaq = Math.round(hoyDH.valPaq*100)/100;
      hoyDH.valProd = Math.round(hoyDH.valProd*100)/100;
      hoyDH.costoProd = Math.round(hoyDH.costoProd*100)/100;
      return respJsonGet({
        hoy:{tickets:hoyDH.tickets, venta:Math.round(hoyDH.venta*100)/100, faciales:hoyDH.faciales,
          valFac:hoyDH.valFac, valPaq:hoyDH.valPaq, valProd:hoyDH.valProd, costoProd:hoyDH.costoProd,
          facCanjes:hoyDH.facCanjes||0, extrasN:hoyDH.extrasN, valExtras:Math.round(hoyDH.valExtras*100)/100, extrasCort:hoyDH.extrasCort||0,
             paquetes:hoyDH.paquetes, productosN:hoyDH.productosN, canjes:hoyDH.canjes||0,
             pagos:hoyDH.pagos, topFac:topFacArr, topProd:topProdArr},
        semana:{total:Math.round(semTot*100)/100, dias:dias7.map(function(x){return {label:x.label, total:Math.round(x.total*100)/100, tickets:x.tickets};})},
        mes:{total:Math.round(mesTot*100)/100, nombre:Utilities.formatDate(new Date(),'America/Guayaquil','MMMM'),
             semanas:mesSem.map(function(x){return {label:x.label, total:Math.round(x.total*100)/100};})},
        caja:Math.round(saldoDH*100)/100, citasHoy:citasDH, gcHoy:gcHoyN, gcVal:Math.round(gcValDH*100)/100, gcChips:gcChips, paqChips:paqChipsDH,
        actualizado:Utilities.formatDate(new Date(),'America/Guayaquil','HH:mm')
      }, callback);
    }

    // ── PROMOCIONES ── Se crean solo por admins, con vigencia. El ticket solo
    // ve las VIGENTES hoy: vencida la fecha, desaparecen solas.
    if (action === 'getPromos') {
      var wsPm = ss.getSheetByName('🎉 PROMOS');
      var todasPm = [], vigPm = [];
      if (wsPm) {
        var finPm = _ultimaFilaDatos_(wsPm);
        if (finPm >= 2) {
          var hoyPm = new Date(); hoyPm.setHours(12,0,0,0);
          wsPm.getRange(2,1,finPm-1,10).getValues().forEach(function(r,ix){
            var it = {fila:ix+2, nombre:(r[0]||'').toString(), aplica:(r[1]||'').toString(),
              tipo:(r[2]||'').toString().toUpperCase()||'%', valor:parseFloat(r[3])||0,
              desde:(r[4]||'').toString(), hasta:(r[5]||'').toString(),
              por:(r[6]||'').toString(), activa:((r[7]||'')+'').toUpperCase()!=='NO',
              codigos:(r[8]||'').toString().split(',').map(function(x){return x.trim();}).filter(function(x){return !!x;}),
              valor2:parseFloat(r[9])||0};
            if(!it.nombre) return;
            todasPm.push(it);
            var d1=_fechaDe_(r[4]), d2=_fechaDe_(r[5]);
            if(it.activa && d1 && d2 && hoyPm>=d1 && hoyPm<=new Date(d2.getFullYear(),d2.getMonth(),d2.getDate(),23,59,59)) vigPm.push(it);
          });
        }
      }
      var rolPm = _rolDeToken_(PropertiesService.getScriptProperties(), e.parameter.token||'');
      var esAdmPm = (rolPm==='admin'||rolPm==='admin_master');
      return respJsonGet({vigentes:vigPm, todas:esAdmPm?todasPm:[]}, callback);
    }

    if (action === 'getPropinas') {
      var wsPrG = ss.getSheetByName('💝 PROPINAS');
      var pendPr = {}, ultPr = [];
      if (wsPrG) {
        var finPrG = _ultimaFilaDatos_(wsPrG);
        if (finPrG >= 2) {
          var dPrG = wsPrG.getRange(2,1,finPrG-1,8).getValues();
          dPrG.forEach(function(r){
            var it = {fecha:(r[0]||'').toString(), cos:(r[1]||'').toString(), monto:parseFloat(r[2])||0,
                      via:(r[3]||'').toString(), nota:(r[4]||'').toString(), estado:(r[5]||'').toString()};
            ultPr.push(it);
            if (it.estado === 'PENDIENTE') pendPr[it.cos] = (pendPr[it.cos]||0) + it.monto;
          });
        }
      }
      // Clientas de HOY: primero LAS CITAS de Acuity (Alejandra cobra al instante;
      // el ticket llega despues) y de colchon, nombres de tickets ya subidos que
      // no esten en las citas (walk-ins sin cita).
      var cliHoyPr = [], vistoP = {};
      try {
        var fechaEcP = _fechaEcuador(0);
        var uidP = PropertiesService.getScriptProperties().getProperty('ACUITY_UID');
        var keyP = PropertiesService.getScriptProperties().getProperty('ACUITY_KEY');
        var respP = UrlFetchApp.fetch(
          'https://acuityscheduling.com/api/v1/appointments?minDate='+fechaEcP+'T00:00:00&maxDate='+fechaEcP+'T23:59:59&max=100',
          {headers:{'Authorization':'Basic '+Utilities.base64Encode(uidP+':'+keyP)}, muteHttpExceptions:true}
        );
        var citasP = JSON.parse(respP.getContentText());
        if (Array.isArray(citasP)) citasP.forEach(function(a){
          if (a.canceled) return;
          var nomA = (((a.firstName||'')+' '+(a.lastName||''))+'').trim();
          if (nomA && !vistoP[nomA.toLowerCase()]) { vistoP[nomA.toLowerCase()]=true; cliHoyPr.push(nomA); }
        });
      } catch(eCliA) {}
      try {
        var wsTkP = ss.getSheets().find(function(sx){ return sx.getName().includes('TICKET_FICHA'); });
        if (wsTkP) {
          var finTkP = _ultimaFilaDatos_(wsTkP);
          var iniTkP = Math.max(2, finTkP-149);
          var hoyKeyP = Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM-dd');
          wsTkP.getRange(iniTkP,1,finTkP-iniTkP+1,5).getValues().forEach(function(rP){
            var fP = _fechaDe_(rP[0]);
            if (!fP || Utilities.formatDate(fP,'America/Guayaquil','yyyy-MM-dd') !== hoyKeyP) return;
            var nomP = (((rP[3]||'')+' '+(rP[4]||''))+'').trim();
            if (nomP && !vistoP[nomP.toLowerCase()]) { vistoP[nomP.toLowerCase()]=true; cliHoyPr.push(nomP); }
          });
        }
      } catch(eCliP) {}
      var staffPr = _usuariosSunsu_(PropertiesService.getScriptProperties())
        .filter(function(u){ return u.role === 'staff'; })
        .map(function(u){ return u.name; });
      return respJsonGet({pendientes:Object.keys(pendPr).map(function(k){return {cos:k, total:Math.round(pendPr[k]*100)/100};}),
        ultimas:ultPr.slice(-25).reverse(), staff:staffPr, clientasHoy:cliHoyPr}, callback);
    }

    if (action === 'getCajaV2') {
      var wsGC = _cajaV2Sheet_(ss);
      var iniciadaGC = _ultimaFilaDatos_(wsGC) > 1;
      if (iniciadaGC) { try { sincronizarEfectivoV2_(ss, wsGC); } catch(eSy) {} }
      var movsGC = [];
      if (iniciadaGC) {
        var finGC = _ultimaFilaDatos_(wsGC);
        var iniGC = Math.max(2, finGC-299);
        var dGC = wsGC.getRange(iniGC, 1, finGC-iniGC+1, 9).getValues();
        movsGC = dGC.map(function(r){
          var fGC = r[0];
          if (fGC instanceof Date) fGC = Utilities.formatDate(fGC,'America/Guayaquil','dd/MM/yyyy HH:mm');
          else fGC = (fGC||'').toString();
          return {f:fGC, tipo:(r[1]||'').toString(), detalle:(r[2]||'').toString(),
                  quien:(r[3]||'').toString(), entrada:parseFloat(r[4])||0, salida:parseFloat(r[5])||0,
                  saldo:parseFloat(r[6])||0, por:(r[8]||'').toString()};
        }).reverse();
      }
      return respJsonGet({iniciada:iniciadaGC, saldo:iniciadaGC?_cajaV2Saldo_(wsGC):0, movs:movsGC}, callback);
    }

    if (action === 'getRegistroClientes') {
      var wsRC = ss.getSheetByName('REGISTRO');
      if (!wsRC) return respJsonGet({items:[]}, callback);
      var rolRC = _rolDeToken_(PropertiesService.getScriptProperties(), e.parameter.token||'');
      var conTelRC = (rolRC==='admin'||rolRC==='admin_master'||rolRC==='reception');
      var dRC = wsRC.getDataRange().getValues();
      var headsRC = dRC[0].map(function(h){return (h||'').toString().toUpperCase();});
      var colRC = function(claves){
        for (var c = 0; c < headsRC.length; c++) for (var k = 0; k < claves.length; k++)
          if (headsRC[c].indexOf(claves[k]) >= 0) return c;
        return -1;
      };
      var colsRC = {nacimiento:colRC(['NACIMIENTO']), sector:colRC(['SECTOR']), tipoPiel:colRC(['PIEL']),
        estado:colRC(['ESTADO']), alergias:colRC(['ALERGIA']), medicacion:colRC(['MEDICACI']),
        condiciones:colRC(['CONDICION']), ciclo:colRC(['CICLO','MESTR','MENSTR']), extracciones:colRC(['EXTRACC']),
        cortesia:colRC(['CORTES']), telefono:colRC(['TELEF','TELÉF','CELULAR']), autorizaFotos:colRC(['AUTORIZA','FOTOGRAF'])};
      var porCedRC = {};
      for (var rc = 1; rc < dRC.length; rc++) {
        var itRC = {row: rc+1,
          cedula:(dRC[rc][1]||'').toString().trim().split('.')[0],
          nombre:(dRC[rc][2]||'').toString().trim(), apellido:(dRC[rc][3]||'').toString().trim()};
        if (!itRC.cedula && !itRC.nombre) continue;
        Object.keys(colsRC).forEach(function(kR){
          if (colsRC[kR] < 0) return;
          if (kR==='telefono' && !conTelRC) return; // el colador: staff no recibe el numero
          var vR = dRC[rc][colsRC[kR]];
          itRC[kR] = vR instanceof Date ? Utilities.formatDate(vR,'America/Guayaquil','dd/MM/yyyy') : (vR||'').toString().trim();
        });
        var keyRC = itRC.cedula || _normNombre_(itRC.nombre+' '+itRC.apellido);
        porCedRC[keyRC] = itRC; // duplicadas: la fila mas reciente gana
      }
      var itemsRC = Object.keys(porCedRC).map(function(k){return porCedRC[k];});
      itemsRC.sort(function(a,b){return (a.nombre+' '+a.apellido).localeCompare(b.nombre+' '+b.apellido);});
      return respJsonGet({items:itemsRC, conTel:conTelRC}, callback);
    }

    if (action === 'getFichasRegistro') {
      var wsFR = ss.getSheetByName('REGISTRO');
      if (!wsFR) return respJsonGet({porCedula:{}, porNombre:{}}, callback);
      var dFR = wsFR.getDataRange().getValues();
      var headsFR = dFR[0].map(function(h){return (h||'').toString().toUpperCase();});
      var colDe = function(claves){
        for (var c = 0; c < headsFR.length; c++) for (var k = 0; k < claves.length; k++)
          if (headsFR[c].indexOf(claves[k]) >= 0) return c;
        return -1;
      };
      var cols = {
        nacimiento: colDe(['NACIMIENTO']), sector: colDe(['SECTOR']),
        tipoPiel: colDe(['PIEL']), estado: colDe(['ESTADO']),
        alergias: colDe(['ALERGIA']), medicacion: colDe(['MEDICACI']),
        condiciones: colDe(['CONDICION']), reacciones: colDe(['REACCION']),
        retinoides: colDe(['EXFOL','RETIN']), ciclo: colDe(['CICLO','MESTR','MENSTR']),
        extracciones: colDe(['EXTRACC']), cortesia: colDe(['CORTES']),
        telefono: colDe(['TELEF','TELÉF','CELULAR']), autorizaFotos: colDe(['AUTORIZA','FOTOGRAF'])
      };
      var porCedFR = {}, porNomFR = {};
      for (var fr = 1; fr < dFR.length; fr++) {
        var fichaFR = {};
        Object.keys(cols).forEach(function(kF){
          if (cols[kF] >= 0) {
            var vF = dFR[fr][cols[kF]];
            fichaFR[kF] = vF instanceof Date ? Utilities.formatDate(vF,'America/Guayaquil','dd/MM/yyyy') : (vF||'').toString().trim();
          }
        });
        var cedFR = (dFR[fr][1]||'').toString().trim().split('.')[0];
        var nomFR = _normNombre_((dFR[fr][2]||'')+' '+(dFR[fr][3]||''));
        if (cedFR) porCedFR[cedFR] = fichaFR;   // la fila más reciente gana
        if (nomFR) porNomFR[nomFR] = fichaFR;
      }
      return respJsonGet({porCedula:porCedFR, porNombre:porNomFR}, callback);
    }

    // ── Clientas que NO autorizan fotos (alerta en la vista de citas) ──
    if (action === 'getAutorizaFotos') {
      var wsAF = ss.getSheetByName('REGISTRO');
      if (!wsAF) return respJsonGet({noAutoriza:{}, noAutorizaNom:{}}, callback);
      var dAF = wsAF.getDataRange().getValues();
      var colAF = -1;
      for (var hAF = 0; hAF < dAF[0].length; hAF++) {
        var hU2 = (dAF[0][hAF]||'').toString().toUpperCase();
        if (hU2.indexOf('AUTORIZA') >= 0 || hU2.indexOf('FOTOGRAF') >= 0) { colAF = hAF; break; }
      }
      var noAF = {}, noAFnom = {};
      if (colAF >= 0) for (var aF = 1; aF < dAF.length; aF++) {
        var vAF = (dAF[aF][colAF]||'').toString().trim().toUpperCase();
        if (vAF === 'NO') {
          var cAF = (dAF[aF][1]||'').toString().trim().split('.')[0];
          var nAF = _normNombre_((dAF[aF][2]||'')+' '+(dAF[aF][3]||''));
          if (cAF) noAF[cAF] = true;
          if (nAF) noAFnom[nAF] = true;
        }
      }
      return respJsonGet({noAutoriza:noAF, noAutorizaNom:noAFnom}, callback);
    }

    // ── Historial de envíos de tarjetas (auditoría) ──
    if (action === 'getHistorialEnvios') {
      var wsHE = ss.getSheetByName('📤 ENVÍOS TARJETAS');
      if (!wsHE) return respJsonGet({items:[]}, callback);
      var dHE = wsHE.getDataRange().getValues();
      var itemsHE = [];
      for (var he = 1; he < dHE.length; he++) {
        var fHE = dHE[he][0];
        itemsHE.push({
          fecha: fHE instanceof Date ? Utilities.formatDate(fHE,'America/Guayaquil','dd/MM/yyyy HH:mm') : (fHE||'').toString(),
          clienta: (dHE[he][1]||'').toString(),
          cedula: (dHE[he][2]||'').toString(),
          telefono: (dHE[he][3]||'').toString(),
          contenido: (dHE[he][4]||'').toString(),
          fechaTicket: (dHE[he][5]||'').toString(),
          por: (dHE[he][6]||'').toString()
        });
      }
      itemsHE.reverse(); // recientes primero
      return respJsonGet({items:itemsHE.slice(0,300)}, callback);
    }

    // ── Refrescar teléfonos: limpia el caché de Acuity (6h) y reconstruye al instante ──
    if (action === 'refrescarTelefonos') {
      try { CacheService.getScriptCache().remove('SEG_TELEFONOS'); } catch(eRC) {}
      var mapaRT = {};
      try { mapaRT = getTelefonosAcuity_(); } catch(eRT) {}
      return respJsonGet({ok:true, total:Object.keys(mapaRT).length}, callback);
    }

    // ── Tarjetas de tratamiento: mapa de enviadas + teléfonos para el envío ──
    if (action === 'getTarjetasInfo') {
      var envTI = {};
      try { envTI = JSON.parse(PropertiesService.getScriptProperties().getProperty('SUNSU_TARJETAS_ENV')||'{}'); } catch(eTI) {}
      var telCedTI = {}, telNomTI = {}, telAcuTI = {};
      try { var trTI = getTelefonosRegistro_(ss); telCedTI = trTI.porCedula||{}; telNomTI = trTI.porNombre||{}; } catch(eTl) {}
      try { telAcuTI = getTelefonosAcuity_()||{}; } catch(eTa) {}
      return respJsonGet({ok:true, enviadas:envTI, telCed:telCedTI, telNom:telNomTI, telAcu:telAcuTI}, callback);
    }

    // ── Seguimiento de PAQUETES: cada paquete con sus sesiones usadas y fechas ──
    if (action === 'getSeguimientoPaquetes') {
      var wsSP = ss.getSheetByName('📋 PAQUETES');
      if (!wsSP) return respJsonGet({error:'No PAQUETES'}, callback);
      var dSP = wsSP.getDataRange().getValues();
      var itemsSP = [];
      var USO_SP = [10,12,14,16,18,20];   // 0-idx: cols K,M,O,Q,S,U
      var FEC_SP = [11,13,15,17,19,21];   // 0-idx: cols L,N,P,R,T,V
      for (var sp = 2; sp < dSP.length; sp++) {
        var rSP = dSP[sp];
        var skuSP = (rSP[7]||'').toString().trim();
        if (!skuSP) continue;
        var usosSP = [];
        for (var uSP = 0; uSP < 6; uSP++) {
          var fU = rSP[FEC_SP[uSP]];
          usosSP.push({
            u: rSP[USO_SP[uSP]] === true || rSP[USO_SP[uSP]] === 'TRUE',
            f: fU instanceof Date ? Utilities.formatDate(fU,'America/Guayaquil','dd/MM/yy') : (fU||'').toString().trim()
          });
        }
        // ¿Paquete de 3 o de 6? — por el código (misma regla que el resto del sistema),
        // con respaldos para filas históricas: nombre con X6/6, o slots 4-6 con datos
        var P3SET = ['SUNSU-17','SUNSU-18','SUNSU-19','SUNSU-20','SUNSU-21','SUNSU-22','SUNSU-29','SUNSU-44','SUNSU-45','SUNSU-46','SUNSU-47','SUNSU-53','SUNSU-55'];
        var P6SET = ['SUNSU-23','SUNSU-24','SUNSU-25','SUNSU-26','SUNSU-27','SUNSU-28','SUNSU-30','SUNSU-48','SUNSU-49','SUNSU-50','SUNSU-51','SUNSU-54','SUNSU-56'];
        var nomPaqSP = (rSP[8]||'').toString().toUpperCase();
        var skuUpSP = skuSP.toUpperCase();
        var totalSP = 0;
        var mPromoSP = nomPaqSP.match(/PROMO\s*(\d+)\s*SES/);
        if (mPromoSP) totalSP = Math.max(1, Math.min(6, parseInt(mPromoSP[1])));
        else if (P3SET.some(function(s){ return skuUpSP === s || skuUpSP.indexOf(s+' ') === 0; })) totalSP = 3;
        else if (P6SET.some(function(s){ return skuUpSP === s || skuUpSP.indexOf(s+' ') === 0; })) totalSP = 6;
        else if (usosSP[3].u || usosSP[3].f || usosSP[4].u || usosSP[4].f || usosSP[5].u || usosSP[5].f) totalSP = 6;
        else if (/X\s*6|6\s*SES|PAQUETE\s*6/.test(nomPaqSP)) totalSP = 6;
        else if (/X\s*3|3\s*SES|PAQUETE\s*3/.test(nomPaqSP)) totalSP = 3;
        else totalSP = 3; // histórico ambiguo sin uso en slots 4-6 → tratar como 3
        itemsSP.push({
          fila: sp + 1,
          dia: rSP[0], mes: rSP[1], ano: rSP[2],
          cedula: (rSP[3]||'').toString().trim(),
          nombre: (rSP[4]||'').toString().trim(),
          apellido: (rSP[5]||'').toString().trim(),
          sku: skuSP,
          nombrePaq: (rSP[8]||'').toString().trim(),
          total: totalSP,
          usos: usosSP
        });
      }
      // ── Enriquecer: teléfono (REGISTRO) + facial y cosmetóloga de cada sesión (TICKET_FICHA) ──
      try {
        var telRegSP = getTelefonosRegistro_(ss);
        var wsTkSP = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
        var idxTkSP = {};
        if (wsTkSP) {
          var dTkSP = wsTkSP.getDataRange().getValues();
          for (var tkS = 1; tkS < dTkSP.length; tkS++) {
            var cedTkS = (dTkSP[tkS][2]||'').toString().trim().split('.')[0];
            var fTkS = dTkSP[tkS][0];
            if (!cedTkS || !(fTkS instanceof Date)) continue;
            var kTkS = cedTkS + '|' + Utilities.formatDate(fTkS,'America/Guayaquil','dd/MM/yy');
            idxTkSP[kTkS] = { fac: (dTkSP[tkS][19]||'').toString().trim(), por: (dTkSP[tkS][1]||'').toString().trim() };
          }
        }
        var telMapSP = {}; try { telMapSP = getTelefonosAcuity_()||{}; } catch(eTaS) {}
        var telKeysSP = Object.keys(telMapSP);
        itemsSP.forEach(function(it){
          it.telefono = (it.cedula && telRegSP.porCedula[it.cedula.split('.')[0]]) || telRegSP.porNombre[_normNombre_(it.nombre+' '+it.apellido)] || '';
          if (!it.telefono) {
            var fullSP = _normNombre_(it.nombre+' '+it.apellido);
            it.telefono = telMapSP[fullSP] || '';
            if (!it.telefono) {
              var pnSP = _normNombre_(it.nombre).split(' ')[0], paSP = _normNombre_(it.apellido).split(' ')[0];
              if (pnSP && paSP) for (var tkSP = 0; tkSP < telKeysSP.length; tkSP++) {
                if (telKeysSP[tkSP].indexOf(pnSP) === 0 && telKeysSP[tkSP].indexOf(paSP) >= 0) { it.telefono = telMapSP[telKeysSP[tkSP]]; break; }
              }
            }
          }
          it.usos.forEach(function(u){
            if (!u.f) return;
            var mF = u.f.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
            if (!mF) return;
            var kU = it.cedula.split('.')[0] + '|' + ('0'+mF[1]).slice(-2)+'/'+('0'+mF[2]).slice(-2)+'/'+mF[3].slice(-2);
            var tkU = idxTkSP[kU];
            if (tkU) { u.fac = tkU.fac; u.por = tkU.por; }
          });
        });
      } catch(eEnr) {}
      // Mapa de 'WhatsApp enviado' por paquete (clave la arma el app: ced|sku|fecha)
      var waMapSP = {};
      try { waMapSP = JSON.parse(PropertiesService.getScriptProperties().getProperty('SUNSU_SEGPAQ_WA')||'{}'); } catch(eWM) {}
      return respJsonGet({items: itemsSP, waEnviados: waMapSP}, callback);
    }

    // ── Aprobaciones de rol por mes: {cedula: fecha} — para el admin y el sello del PDF ──
    if (action === 'getAprobacionesRol') {
      var shAp = (e.parameter.sheet||'').toString().trim();
      var wsAp = ss.getSheetByName('✅ ROLES APROBADOS');
      var mapAp = {};
      if (wsAp && shAp) {
        var dAp = wsAp.getDataRange().getValues();
        for (var ap = 1; ap < dAp.length; ap++) {
          if ((dAp[ap][1]||'').toString().trim() !== shAp) continue;
          var fAp = dAp[ap][0] instanceof Date ? Utilities.formatDate(dAp[ap][0],'America/Guayaquil','dd/MM/yyyy HH:mm') : (dAp[ap][0]||'').toString();
          mapAp[(dAp[ap][2]||'').toString().replace('.','')] = {fecha:fAp, nombre:(dAp[ap][3]||'').toString()};
        }
      }
      return respJsonGet({ok:true, aprobaciones:mapAp}, callback);
    }

    // ── Mapa dinámico SKU → columna de TICKET_FICHA (desde los encabezados reales) ──
    // Reemplaza el mapa harcodeado del frontend: productos nuevos entran solos.
    if (action === 'getProdColMap') {
      try { _repararColumnasTicketFicha_(ss); } catch (eRepM) {}
      var wsPCM = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsPCM) return respJsonGet({error:'No TICKET_FICHA'}, callback);
      var hdrPCM = wsPCM.getRange(1,1,1,wsPCM.getLastColumn()).getValues()[0];
      return respJsonGet({mapa: prodColsFromHeaders_(hdrPCM)}, callback);
    }

    if (action === 'repararColumnasTicket') {
      var rRep = {ok:false, error:'sin ss'};
      try { rRep = _repararColumnasTicketFicha_(ss); } catch (eRepA) { rRep = {ok:false, error:String(eRepA)}; }
      return respJsonGet(rRep, callback);
    }

    // ── Snapshot de una OC generada desde el app (para re-descargar su PDF exacto) ──
    if (action === 'getOCDataApp') {
      var ordQ = (e.parameter.orden||'').toString().trim();
      var wsODg = ss.getSheetByName('OC_DATA');
      if (!wsODg || !ordQ) return respJsonGet({error:'Sin datos'}, callback);
      var dOD = wsODg.getDataRange().getValues();
      for (var oi = dOD.length-1; oi >= 1; oi--) {
        if ((dOD[oi][0]||'').toString().trim() === ordQ) {
          try {
            var snap = JSON.parse(dOD[oi][3]);
            // Ordenes viejas SIN stock en el snapshot: se reconstruye el stock AL
            // CORTE de esa quincena (retroactivo) a partir de los movimientos
            if (!snap.stock || !snap.stock.length) {
              try {
                var skuRef = ((snap.items&&snap.items[0]&&snap.items[0].sku) || (snap.fact&&snap.fact[0]&&snap.fact[0].sku) || '').toString();
                var mFam = skuRef.match(/^SUNSU-([A-Z]+)-/);
                var mQL = (snap.qLabel||'').toString().match(/^(1-15|16-fin)\s+(\w{3})\s+(\d{4})$/);
                if (mFam && mQL) {
                  var MESES_QR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                  var mesIdxQR = MESES_QR.indexOf(mQL[2]);
                  if (mesIdxQR >= 0) {
                    var fFinQR = mQL[1]==='1-15'
                      ? new Date(parseInt(mQL[3],10), mesIdxQR, 15, 23,59,59)
                      : new Date(parseInt(mQL[3],10), mesIdxQR+1, 0, 23,59,59);
                    snap.stock = _stockCorteFamilia_(ss, mFam[1], fFinQR);
                  }
                }
              } catch(eSR) {}
            }
            return respJsonGet({ok:true, numOrden:ordQ, fecha:(dOD[oi][1]||'').toString(), snap:snap}, callback);
          } catch(ePr) { return respJsonGet({error:'Snapshot corrupto'}, callback); }
        }
      }
      return respJsonGet({error:'Esta orden no fue generada desde el app (solo acta disponible)'}, callback);
    }

    // ── Proveedores (hoja 🏭 PROVEEDORES, sembrada desde INV_CONFIG la primera vez) ──
    if (action === 'getProveedoresApp') {
      var wsPv = _wsProveedores_(ss);
      var dPv = wsPv.getDataRange().getValues();
      var provs = [];
      for (var pi = 1; pi < dPv.length; pi++) {
        var nomPv = (dPv[pi][0]||'').toString().trim();
        if (!nomPv) continue;
        provs.push({fila:pi+1, nombre:nomPv, ruc:(dPv[pi][1]||'').toString().trim(),
          telefono:(dPv[pi][2]||'').toString().trim(), direccion:(dPv[pi][3]||'').toString().trim(),
          email:(dPv[pi][4]||'').toString().trim(), familia:(dPv[pi][5]||'').toString().trim().toUpperCase(),
          notas:(dPv[pi][6]||'').toString().trim()});
      }
      return respJsonGet({proveedores:provs}, callback);
    }

    // ── Borrador de orden de compra: ventas de la quincena + stock, SOLO productos activos ──
    if (action === 'getBorradorOCApp') {
      _migrarTimestampsEntradas_(ss);
      var famOC = (e.parameter.familia||'').toString().trim().toUpperCase();
      var qOC = parseInt(e.parameter.quincena)||1;
      var mesOC = parseInt(e.parameter.mes); // 1-12
      var anioOC = parseInt(e.parameter.anio);
      if (!famOC) return respJsonGet({error:'Falta familia'}, callback);
      var hoyOC = new Date();
      if (isNaN(mesOC)||mesOC<1||mesOC>12) mesOC = hoyOC.getMonth()+1;
      if (isNaN(anioOC)) anioOC = hoyOC.getFullYear();
      var fIniOC, fFinOC;
      if (qOC === 1) { fIniOC = new Date(anioOC, mesOC-1, 1); fFinOC = new Date(anioOC, mesOC-1, 15, 23,59,59); }
      else { var udOC = new Date(anioOC, mesOC, 0).getDate(); fIniOC = new Date(anioOC, mesOC-1, 16); fFinOC = new Date(anioOC, mesOC-1, udOC, 23,59,59); }
      // Activos según CATALOGO col J (regla canónica: solo desmarcado = inactivo)
      var activosOC = {};
      try {
        var wsCatOC = ss.getSheets().find(function(s){ return s.getName().toUpperCase().indexOf('CATALOGO') >= 0 || s.getName().toUpperCase().indexOf('CATÁLOGO') >= 0; });
        if (wsCatOC) {
          var dCatOC = wsCatOC.getDataRange().getValues();
          for (var ci = 2; ci < dCatOC.length; ci++) {
            var codOC = (dCatOC[ci][0]||'').toString().trim().replace(/^SUNSU-/,'');
            if (!codOC) continue;
            var rawOC = dCatOC[ci][9];
            activosOC[codOC] = !(rawOC===false||rawOC==='FALSE'||rawOC===0);
          }
        }
      } catch(eCat) {}
      // Ventas de la quincena por columna de producto de esa familia
      var vendOC = {};
      var vendPostOC = {}; // vendido DESPUES del corte: se SUMA de vuelta al stock
      try {
        var wsTkOC = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
        var dTkOC = wsTkOC.getDataRange().getValues();
        var hdrOC = dTkOC[0];
        for (var ti = 1; ti < dTkOC.length; ti++) {
          var fOC = dTkOC[ti][0];
          if (!(fOC instanceof Date) || fOC < fIniOC) continue;
          var esPostOC = fOC > fFinOC;
          for (var hi = 0; hi < hdrOC.length; hi++) {
            var hOC = (hdrOC[hi]||'').toString().trim();
            if (!hOC || hOC.indexOf(famOC+'-') !== 0) continue;
            var qty = parseFloat(dTkOC[ti][hi])||0;
            if (qty > 0) {
              if (esPostOC) vendPostOC[hOC] = (vendPostOC[hOC]||0) + qty;
              else vendOC[hOC] = (vendOC[hOC]||0) + qty;
            }
          }
        }
      } catch(eTk) {}
      // Entradas RECIBIDAS despues del corte: se RESTAN para volver al stock del corte.
      // Fecha real de recepcion = col K (timestamp de registrarEntrada); si falta, col A.
      var entPostOC = {};
      try {
        var wsEnOC = ss.getSheetByName('📥 ENTRADAS');
        if (wsEnOC) {
          var dEnOC = wsEnOC.getDataRange().getValues();
          for (var en_ = 2; en_ < dEnOC.length; en_++) {
            var rEn = dEnOC[en_];
            var skuEn = (rEn[1]||'').toString().trim();
            if (skuEn.indexOf('SUNSU-'+famOC+'-') !== 0) continue;
            var cantEn = parseFloat(rEn[5])||0;
            if (cantEn <= 0) continue;
            var fEn = null;
            if (rEn[10] instanceof Date) fEn = _fechaRecReal_(rEn[10]);
            else {
              var mK = (rEn[10]||'').toString().trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
              if (mK) fEn = new Date(parseInt(mK[3],10), parseInt(mK[2],10)-1, parseInt(mK[1],10));
              else if (rEn[0] instanceof Date) fEn = rEn[0];
            }
            if (fEn && fEn > fFinOC) {
              var codEn = skuEn.replace(/^SUNSU-/,'');
              entPostOC[codEn] = (entPostOC[codEn]||0) + cantEn;
            }
          }
        }
      } catch(eEn) {}
      // Inventario de la familia
      var itemsOC = [];
      try {
        var wsInvOC = ss.getSheets().find(function(s){ return s.getName().includes('INVENTARIO'); });
        var dInvOC = wsInvOC.getDataRange().getValues();
        for (var vi = 2; vi < dInvOC.length; vi++) {
          var skuOC = (dInvOC[vi][0]||'').toString().trim();
          if (skuOC.indexOf('SUNSU-'+famOC+'-') !== 0) continue;
          var codI = skuOC.replace(/^SUNSU-/,'');
          if (activosOC.hasOwnProperty(codI) && activosOC[codI] !== true) continue; // inactivo → fuera
          var vendI = vendOC[codI]||0;
          // Stock que ve el proveedor = stock ACTUAL del inventario, tal cual.
          // (La reconstrucción "al corte" se eliminó del borrador: cualquier
          // recepción registrada tarde la descuadraba — el número honesto es
          // lo que hay en percha al momento de GENERAR la orden. Las re-descargas
          // históricas siguen fieles porque salen del snapshot guardado.)
          var stockNowI = parseFloat(dInvOC[vi][5])||0;
          var stockCorteI = stockNowI;
          itemsOC.push({
            sku: skuOC,
            nombre: (dInvOC[vi][1]||'').toString().trim(),
            stock: stockNowI,
            stockCorte: stockCorteI,
            minimo: parseFloat(dInvOC[vi][8])||0,
            compra: parseFloat(dInvOC[vi][6])||0,
            vendido: vendI,
            sugerido: Math.ceil(vendI * (1 + INV_CONFIG.BUFFER_RESTOCK))
          });
        }
      } catch(eInv) {}
      var qLabelOC = (qOC===1?'1-15':'16-fin') + ' ' + ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][mesOC-1] + ' ' + anioOC;
      return respJsonGet({familia:famOC, qLabel:qLabelOC, items:itemsOC}, callback);
    }

    // ── Movimientos de un producto: ventas en tickets + entradas recibidas ──
    // Para rastrear en qué ticket puede estar el error cuando el inventario físico no cuadra
    if (action === 'getMovimientosSku') {
      var skuMv = (e.parameter.sku||'').toString().trim();
      var diasMv = parseInt(e.parameter.dias) || 60;
      if (!skuMv) return respJsonGet({error:'Falta sku'}, callback);
      var codMv = skuMv.replace(/^SUNSU-/,'');
      var desdeMv = new Date(Date.now() - diasMv*24*3600*1000);
      var ventasMv = [], entradasMv = [];
      try {
        var wsTk2 = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
        var tD2 = wsTk2.getDataRange().getValues();
        var hdr2 = tD2[0];
        var colMv = -1;
        for (var h2 = 0; h2 < hdr2.length; h2++) {
          if ((hdr2[h2]||'').toString().trim().toUpperCase() === codMv.toUpperCase()) { colMv = h2; break; }
        }
        if (colMv >= 0) {
          for (var r2 = 1; r2 < tD2.length; r2++) {
            var rw2 = tD2[r2];
            if (!(rw2[0] instanceof Date) || rw2[0] < desdeMv) continue;
            var q2 = parseFloat(rw2[colMv]) || 0;
            if (!q2) continue;
            ventasMv.push({
              fila: r2 + 1,
              fecha: Utilities.formatDate(rw2[0], 'America/Guayaquil', 'yyyy-MM-dd'),
              clienta: ((rw2[3]||'') + ' ' + (rw2[4]||'')).toString().trim(),
              factura: (rw2[6]||'').toString().trim(),
              cosmetologa: (rw2[1]||'').toString().trim(),
              cant: q2
            });
          }
        }
      } catch(eVm) {}
      try {
        var wsE2 = ss.getSheetByName('📥 ENTRADAS');
        if (wsE2) {
          var eD2 = wsE2.getDataRange().getValues();
          for (var e2 = 2; e2 < eD2.length; e2++) {
            var er2 = eD2[e2];
            if ((er2[1]||'').toString().trim().toUpperCase() !== skuMv.toUpperCase()) continue;
            var rec2 = er2[5];
            if (rec2 === '' || rec2 === null || rec2 === undefined) continue;
            var fE2 = er2[0] instanceof Date ? er2[0] : null;
            if (fE2 && fE2 < desdeMv) continue;
            entradasMv.push({
              fecha: fE2 ? Utilities.formatDate(fE2, 'America/Guayaquil', 'yyyy-MM-dd') : '',
              cant: parseFloat(rec2) || 0,
              orden: (er2[7]||'').toString().trim(),
              proveedor: (er2[3]||'').toString().trim()
            });
          }
        }
      } catch(eEm) {}
      ventasMv.sort(function(a,b){ return a.fecha < b.fecha ? 1 : -1; });
      return respJsonGet({sku:skuMv, dias:diasMv, ventas:ventasMv, entradas:entradasMv}, callback);
    }

    // ── RENDIMIENTO DE PRODUCTOS: ventas, margen (compra real) y rotación ──
    // modo=mes (mes calendario actual) | anio (año actual). Solo admins.
    if (action === 'getRendimientoProductos') {
      var rolRP = _rolDeToken_(PropertiesService.getScriptProperties(), e.parameter.token||'');
      if (rolRP!=='admin' && rolRP!=='admin_master') return respJsonGet({error:'Solo administradores'}, callback);
      var modoRP = (e.parameter.modo||'mes').toString();
      var hoyRP = new Date();
      var iniRP = (modoRP==='anio') ? new Date(hoyRP.getFullYear(),0,1) : new Date(hoyRP.getFullYear(),hoyRP.getMonth(),1);
      var diasRP = Math.max(1, Math.round((hoyRP.getTime()-iniRP.getTime())/86400000)+1);
      var wsRP = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsRP) return respJsonGet({error:'No hay TICKET_FICHA'}, callback);
      var headsRP = wsRP.getRange(1,1,1,wsRP.getLastColumn()).getValues()[0];
      var prodColsRP = [];
      for (var hr = 0; hr < headsRP.length; hr++) {
        var hTr = ((headsRP[hr]||'')+'').toString().trim();
        if (hTr.match(/^[A-Z]{2,3}-\d+/)) prodColsRP.push({idx:hr, cod:hTr.toUpperCase().replace(/^SUNSU-/,'')});
      }
      var finRP2 = _ultimaFilaDatos_(wsRP);
      var udsRP = {};
      if (finRP2 >= 2) {
        var dRP = wsRP.getRange(2,1,finRP2-1,wsRP.getLastColumn()).getValues();
        for (var tr = 0; tr < dRP.length; tr++) {
          var fR = _fechaDe_(dRP[tr][0]);
          if (!fR || fR < iniRP) continue;
          for (var pr = 0; pr < prodColsRP.length; pr++) {
            var qR = parseInt(dRP[tr][prodColsRP[pr].idx])||0;
            if (qR > 0) udsRP[prodColsRP[pr].cod] = (udsRP[prodColsRP[pr].cod]||0) + qR;
          }
        }
      }
      // Catálogo (nombre, subtotal sin IVA, activo, tipo producto) + inventario (compra real, stock)
      var itemsRP = [];
      try {
        var compraRP = {}, stockRP = {};
        var wsInvRP = ss.getSheets().find(function(sx){return sx.getName().includes('INVENTARIO');});
        if (wsInvRP) wsInvRP.getDataRange().getValues().slice(2).forEach(function(rI){
          var cI=(rI[0]||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'');
          if(!cI) return;
          var crI=parseFloat(rI[6])||0;
          if(crI>0) compraRP[cI]=crI;
          stockRP[cI]=parseFloat(rI[5])||0;
        });
        var wsCatRP = ss.getSheets().find(function(sx){return sx.getName().includes('CATALOGO');});
        if (wsCatRP) wsCatRP.getDataRange().getValues().slice(2).forEach(function(rC){
          var cC=(rC[0]||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'');
          if(!cC) return;
          // Solo PRODUCTOS: cod con letras (los servicios son numéricos puros)
          if(!/^[A-Z]{2,3}-\d+$/.test(cC)) return;
          var actC = rC[9];
          var activoC = !(actC===false||actC==='FALSE'||actC===0);
          var sbC=parseFloat(rC[3])||0, tvC=parseFloat(rC[5])||0;
          var subC = sbC>0?sbC:(tvC>0?tvC/1.15:0);
          var cmpC = compraRP[cC] || (parseFloat(rC[6])||0);
          var uC = udsRP[cC]||0;
          if (!activoC && uC===0) return; // inactivo sin ventas: fuera
          var ventaC = Math.round(uC*subC*100)/100;
          var costoC = Math.round(uC*cmpC*100)/100;
          itemsRP.push({
            cod: cC,
            nombre: (rC[1]||'').toString().trim(),
            uds: uC,
            venta: ventaC,
            costo: costoC,
            margen: Math.round((ventaC-costoC)*100)/100,
            margenPct: (ventaC>0 && cmpC>0) ? Math.round((ventaC-costoC)/ventaC*1000)/10 : null,
            sinCosto: !(cmpC>0),
            stock: stockRP[cC]!==undefined?stockRP[cC]:null,
            pvpSub: Math.round(subC*100)/100,
            compra: Math.round(cmpC*100)/100
          });
        });
      } catch(eRP) {}
      return respJsonGet({ok:true, modo:modoRP, dias:diasRP, items:itemsRP}, callback);
    }

    // ── Clientas del SISTEMA ANTIGUO (archivo VENTAS_SUNSU_2025) ──
    // Primera llamada: importa el Excel del Drive a 📜 CLIENTAS ANTIGUAS (1 vez).
    // Siempre: cruza cada cédula contra TICKET_FICHA → volvio true/false.
    if (action === 'getClientasAntiguas') {
      try {
        var wsAnt = ss.getSheetByName('📜 CLIENTAS ANTIGUAS');
        var propsAnt = PropertiesService.getScriptProperties();
        // v2 = solo visitas de tratamiento. Si el import viejo (v1, con productos)
        // sigue en la hoja, se re-importa UNA vez preservando estados/contactos.
        if (!wsAnt || wsAnt.getLastRow() < 2 || propsAnt.getProperty('CLIENTAS_ANT_V') !== '3') {
          _importarClientasAntiguas_(ss);
          propsAnt.setProperty('CLIENTAS_ANT_V','3');
          wsAnt = ss.getSheetByName('📜 CLIENTAS ANTIGUAS');
        }
        // Cédulas del sistema NUEVO (exactas + base de 10 para RUCs 001)
        var nuevas = {};
        try {
          var wsTkA = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
          var colCed = wsTkA.getRange(2,3,Math.max(1,_ultimaFilaDatos_(wsTkA)-1),1).getValues();
          colCed.forEach(function(rr){
            var cN = _cedAnt_(rr[0]);
            if (!cN) return;
            nuevas[cN] = true;
            var b10 = _cedBase10_(cN); if (b10) nuevas[b10] = true;
          });
        } catch(eTkA) {}
        // Columnas de ESTADO (I) e INTENTOS (J): se crean si faltan
        if ((wsAnt.getRange(1,9).getValue()||'').toString().trim() === '') {
          wsAnt.getRange(1,9,1,2).setValues([['ESTADO','INTENTOS']]).setFontWeight('bold');
        }
        // ── Cruce con ACUITY (una sola vez): segunda fuente de teléfonos ──
        // Matchea por EMAIL exacto o por NOMBRE (palabras del nombre de Acuity
        // contenidas en el nombre del archivo viejo) y guarda el tel de Acuity
        // en col K. El frontend muestra 2 WhatsApp solo si los números difieren.
        try {
          if (propsAnt.getProperty('CLIENTAS_ANT_ACU') !== '1') {
            if ((wsAnt.getRange(1,11).getValue()||'').toString().trim() === '') {
              wsAnt.getRange(1,11).setValue('TEL ACUITY').setFontWeight('bold');
            }
            var uidAcu = propsAnt.getProperty('ACUITY_UID'), keyAcu = propsAnt.getProperty('ACUITY_KEY');
            if (uidAcu && keyAcu) {
              var authAcu = {'Authorization': 'Basic ' + Utilities.base64Encode(uidAcu + ':' + keyAcu)};
              var cliAcu = JSON.parse(UrlFetchApp.fetch('https://acuityscheduling.com/api/v1/clients', {headers:authAcu, muteHttpExceptions:true}).getContentText());
              if (cliAcu && cliAcu.length) {
                var _normNA = function(s){
                  return (s||'').toString().toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
                    .replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim();
                };
                var porEmailAcu = {}, listaAcu = [];
                cliAcu.forEach(function(cA){
                  var telA = (cA.phone||'').toString().trim();
                  if (!telA) return;
                  var emA = (cA.email||'').toString().toLowerCase().trim();
                  if (emA) porEmailAcu[emA] = telA;
                  var wsN = _normNA((cA.firstName||'')+' '+(cA.lastName||'')).split(' ').filter(function(w){return w.length>1;});
                  if (wsN.length >= 2) listaAcu.push({ws:wsN, tel:telA});
                });
                var dAcu = wsAnt.getDataRange().getValues();
                var colK = [];
                for (var ka = 1; ka < dAcu.length; ka++) {
                  var telM = '';
                  var emV = (dAcu[ka][3]||'').toString().toLowerCase().trim();
                  if (emV && porEmailAcu[emV]) telM = porEmailAcu[emV];
                  if (!telM) {
                    var nomWs = _normNA(dAcu[ka][1]).split(' ');
                    for (var la = 0; la < listaAcu.length; la++) {
                      var okN = listaAcu[la].ws.every(function(w){ return nomWs.indexOf(w) >= 0; });
                      if (okN) { telM = listaAcu[la].tel; break; }
                    }
                  }
                  colK.push([telM]);
                }
                if (colK.length) wsAnt.getRange(2,11,colK.length,1).setValues(colK);
                propsAnt.setProperty('CLIENTAS_ANT_ACU','1');
              }
            } else {
              propsAnt.setProperty('CLIENTAS_ANT_ACU','1'); // sin credenciales: no reintentar
            }
          }
        } catch(eAcu) {}
        var dAnt = wsAnt.getDataRange().getValues();
        var itemsAnt = [];
        for (var ia2 = 1; ia2 < dAnt.length; ia2++) {
          var rA2 = dAnt[ia2];
          var cedA2 = _cedAnt_(rA2[0]);
          if (!cedA2) continue;
          var b10a = _cedBase10_(cedA2);
          var volvio = !!(nuevas[cedA2] || (b10a && nuevas[b10a]));
          itemsAnt.push({
            ced: cedA2, nombre:(rA2[1]||'').toString(), tel:(rA2[2]||'').toString(), email:(rA2[3]||'').toString(),
            ultima:(rA2[4] instanceof Date ? Utilities.formatDate(rA2[4],'America/Guayaquil','dd/MM/yyyy') : (rA2[4]||'').toString()), visitas:parseFloat(rA2[5])||0, volvio:volvio,
            contactadaPor:(rA2[6]||'').toString(), contactadaF:(rA2[7]||'').toString(),
            estado:(rA2[8]||'').toString(), intentos:parseFloat(rA2[9])||0,
            telAcuity:(rA2[10]||'').toString()
          });
        }
        var sinVolverN = itemsAnt.filter(function(x){ return !x.volvio; }).length;
        // Mensaje de WhatsApp: editable en ⚙ CONFIGURACION → 'MENSAJE CLIENTAS ANTIGUAS'
        var msgAntW = '';
        try {
          var wsCfgA = ss.getSheetByName('⚙ CONFIGURACION');
          if (wsCfgA) {
            var dCfgA = wsCfgA.getDataRange().getValues();
            for (var ca2 = 0; ca2 < dCfgA.length; ca2++) {
              if ((dCfgA[ca2][0]||'').toString().toUpperCase().indexOf('MENSAJE CLIENTAS ANTIGUAS') >= 0) { msgAntW = (dCfgA[ca2][1]||'').toString(); break; }
            }
            // Migración: si quedó guardado el default anterior (con flor), se
            // actualiza al nuevo; un texto EDITADO por el usuario no se toca.
            var defViejoA = 'Hola {nombre} \uD83C\uDF38 Somos Sunsu Spa y nos acordamos de ti. Tu piel merece volver a brillar como en tu \u00faltimo facial \u2728 \u00bfTe agendamos un espacio?';
            var defNuevoA = 'Hola {nombre}, te saludamos de \uC21C\uC218 Sunsu Spa \u2014 nos acordamos de ti. Tu piel merece volver a brillar como en tu \u00faltimo facial \u2728 \u00bfTe agendamos un espacio?';
            if (msgAntW === defViejoA) {
              for (var cu2 = 0; cu2 < dCfgA.length; cu2++) {
                if ((dCfgA[cu2][0]||'').toString().toUpperCase().indexOf('MENSAJE CLIENTAS ANTIGUAS') >= 0) {
                  wsCfgA.getRange(cu2+1, 2).setValue(defNuevoA); break;
                }
              }
              msgAntW = defNuevoA;
            }
            if (!msgAntW) {
              msgAntW = defNuevoA;
              wsCfgA.appendRow(['MENSAJE CLIENTAS ANTIGUAS', msgAntW]);
            }
          }
        } catch(eMsgA) {}
        return respJsonGet({ok:true, items:itemsAnt, total:itemsAnt.length, sinVolver:sinVolverN, msgAntiguas:msgAntW}, callback);
      } catch(eAnt) { return respJsonGet({error:eAnt.message}, callback); }
    }

    // ── Comisiones de un período 26→25 ESPECÍFICO — para el rol de pagos RRHH ──
    // Calcula EN VIVO desde TICKET_FICHA con el MISMO calcularComisiones del app:
    // sin pestañas intermedias. mes/anio = mes de CIERRE (7/2026 → Jun26–Jul25).
    if (action === 'getComisionesRol') {
      try {
        var mesRL = parseInt(e.parameter.mes, 10);
        var anioRL = parseInt(e.parameter.anio, 10);
        if (!mesRL || !anioRL) return respJsonGet({error:'Faltan mes/anio'}, callback);
        var fIniRL = new Date(anioRL, mesRL-2, 26, 0,0,0);
        var fFinRL = new Date(anioRL, mesRL-1, 25, 23,59,59);
        var datosRL = calcularComisiones(fIniRL, fFinRL);
        var outRL = Object.keys(datosRL.cosmetologas).map(function(k){
          var c = datosRL.cosmetologas[k];
          return {
            name:  k,
            cf:    Math.round((c.comFaciales||0)*100)/100,
            cpaq:  Math.round((c.comPaquetes||0)*100)/100,
            cprod: Math.round((c.comProductos||0)*100)/100,
            cext:  Math.round((c.comExtras||0)*100)/100,
            crecep:Math.round((c.comRecepcion||0)*100)/100
          };
        });
        return respJsonGet({ok:true, mes:mesRL, anio:anioRL, cosmetologas:outRL}, callback);
      } catch(eRL) { return respJsonGet({error:eRL.message}, callback); }
    }

    // ── Reporte Admin — período actual ──
    if (action === 'getReporteAdmin') {
      var hoyA = new Date();
      var diaA = hoyA.getDate(), mesA = hoyA.getMonth(), anioA = hoyA.getFullYear();
      var fIniA, fFinA;
      if (diaA >= 26) {
        fIniA = new Date(anioA, mesA, 26, 0,0,0);
        fFinA = new Date(anioA, mesA+1, 25, 23,59,59);
      } else {
        fIniA = new Date(anioA, mesA-1, 26, 0,0,0);
        fFinA = new Date(anioA, mesA, 25, 23,59,59);
      }
      var mesesA = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
      var periodoA = mesesA[fIniA.getMonth()]+' 26 — '+mesesA[fFinA.getMonth()]+' 25, '+fFinA.getFullYear();
      try {
        var datosA = calcularComisiones(fIniA, fFinA);
        var cosmsA = Object.keys(datosA.cosmetologas).map(function(k){
          var c=datosA.cosmetologas[k];
          var nCosm3=Object.keys(datosA.cosmetologas).length||1;
          var bruto=c.comFaciales+c.comPaquetes+c.comProductos+(c.comExtras||0)+(c.comRecepcion||0);
          var neto=Math.max(0,bruto-(c.multas||0)-(c.descuentos||0));
          var totalProdA=Object.values(c.detalle_productos||{}).reduce(function(s,p){return s+p.qty;},0);
          var nextN=null, faltanPaq=0, nextCp=0;
          if (datosA.bonoActivo) {
            for (var ni=0; ni<CONFIG.NIVELES.length; ni++) {
              var req=Math.ceil((datosA.totalClientas*CONFIG.NIVELES[ni][0])/nCosm3);
              if ((c.paquetes||0)<req){nextN='N'+(ni+1);faltanPaq=req-(c.paquetes||0);nextCp=CONFIG.NIVELES[ni][1];break;}
            }
          }
          return {
            name:k, color:(COLORES_COSM[k]&&COLORES_COSM[k].header)||'#5B7FA6',
            f:c.faciales||0, paq:c.paquetes||0, n:c.nivelAlcanzado||'—',
            cf:Math.round(c.comFaciales*100)/100,
            cp:Math.round(c.comPaquetes*100)/100,
            cprod:Math.round(c.comProductos*100)/100,
            totalProd:totalProdA,
            ext:c.extras||0,
            cext:Math.round((c.comExtras||0)*100)/100,
            crecep:Math.round((c.comRecepcion||0)*100)/100,
            diasRecep:c.diasRecepcion||0,
            m:Math.round((c.multas||0)*100)/100,
            d:Math.round((c.descuentos||0)*100)/100,
            t:Math.round(neto*100)/100,
            nextN:nextN, faltanPaq:faltanPaq, nextCp:nextCp
          };
        });
        // Al arrancar un período (o sin ventas aún) todas deben verse EN CERO:
        // se completan las staff que no tengan tickets todavía.
        try {
          var yaA = {};
          cosmsA.forEach(function(c){ yaA[(c.name||'').toLowerCase()] = true; });
          _usuariosSunsu_(PropertiesService.getScriptProperties())
            .filter(function(u){ return u.role === 'staff'; })
            .forEach(function(u){
              if (yaA[(u.name||'').toLowerCase()]) return;
              cosmsA.push({name:u.name, color:(COLORES_COSM[u.name]&&COLORES_COSM[u.name].header)||u.color||'#5B7FA6',
                f:0, paq:0, n:'—', cf:0, cp:0, cprod:0, totalProd:0, ext:0, cext:0,
                crecep:0, diasRecep:0, m:0, d:0, t:0, nextN:null, faltanPaq:0, nextCp:0});
            });
        } catch(eCeroA) {}
        return respJsonGet({cosmetologas:cosmsA, periodo:periodoA, bonoActivo:datosA.bonoActivo, totalClientas:datosA.totalClientas}, callback);
      } catch(errA) {
        return respJsonGet({error:errA.message}, callback);
      }
    }

    // ── Historial de comisiones — lista períodos disponibles ──
    if (action === 'getHistorialComisiones') {
      var propsH = PropertiesService.getScriptProperties();
      var storedH = JSON.parse(propsH.getProperty('SUNSU_HISTORIAL_COMISIONES')||'{}');
      // Auto-corte perezoso: si el período recién VENCIDO (el que terminó el 25
      // más reciente) no está archivado — p.ej. el trigger del día 26 no corrió —
      // se genera aquí mismo. Así el historial nunca queda atrasado.
      try {
        var hoyHC = new Date();
        var refHC = (hoyHC.getDate() >= 26) ? hoyHC : new Date(hoyHC.getFullYear(), hoyHC.getMonth()-1, 26);
        var mesesHC = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        var iniHC = new Date(refHC.getFullYear(), refHC.getMonth()-1, 26);
        var finHC = new Date(refHC.getFullYear(), refHC.getMonth(), 25);
        var nomHC = 'COM '+mesesHC[iniHC.getMonth()]+String(iniHC.getFullYear()).slice(2)+'-'+mesesHC[finHC.getMonth()]+String(finHC.getFullYear()).slice(2);
        if (!storedH[nomHC] && !SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomHC)) {
          generarCorteComisiones(refHC);
          storedH = JSON.parse(propsH.getProperty('SUNSU_HISTORIAL_COMISIONES')||'{}');
        }
      } catch(eHC) {}
      // Snapshots viejos SIN extras/recepción (archivados antes de que esas
      // comisiones existieran): se RECALCULAN una vez desde los datos crudos
      // (tickets, multas, citas). Tras el recálculo el campo cext existe
      // (aunque sea $0), así que esto corre una sola vez por período.
      try {
        var regenHC = false;
        Object.keys(storedH).forEach(function(kR){
          var mR = kR.match(/^COM (\w{3})(\d{2})-(\w{3})(\d{2})$/);
          if (!mR) return;
          var csR = (storedH[kR].cosmetologas||[]);
          if (!csR.length || !csR.some(function(c){ return c.cext === undefined; })) return;
          var MES_R = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
          var mfR = MES_R.indexOf(mR[3]);
          if (mfR < 0) return;
          generarCorteComisiones(new Date(2000+parseInt(mR[4],10), mfR, 26));
          regenHC = true;
        });
        if (regenHC) storedH = JSON.parse(propsH.getProperty('SUNSU_HISTORIAL_COMISIONES')||'{}');
      } catch(eRg) {}
      // Auto-import COM sheets not yet saved
      var ss2 = SpreadsheetApp.getActiveSpreadsheet();
      var updated = false;
      ss2.getSheets().filter(function(s){ return s.getName().indexOf('COM ')===0; }).forEach(function(ws){
        var nm = ws.getName();
        if (storedH[nm]) return;
        try {
          var pData = ws.getDataRange().getValues();
          var clientasH = pData[1] ? (parseFloat(pData[1][1])||0) : 0;
          var bonoH = pData[1] ? String(pData[1][4]||'').indexOf('ACTIVO')>=0 : false;
          var tmatch = nm.match(/COM (\w+)(\d{2})-(\w+)(\d{2})/);
          var tituloH = tmatch ? tmatch[1]+' 26 — '+tmatch[3]+' 25, 20'+tmatch[4] : nm;
          var cosmsH = [];
          var nH_ = function(x){ return parseFloat(String(x).replace(/[^0-9.\-]/g,''))||0; };
          for (var rh=3; rh<pData.length; rh++) {
            var rwH=pData[rh]; var nmH=String(rwH[0]||'').trim();
            if(!nmH||nmH.toUpperCase().indexOf('TOTAL')>=0||nmH.toUpperCase().indexOf('COSMET')>=0||nmH.toUpperCase().indexOf('DETALLE')>=0) continue;
            var nR=String(rwH[4]||'—').trim();
            var nS=isNaN(parseFloat(nR))?nR:('N'+Math.round(parseFloat(nR)));
            // Layout de la pestaña: nombre + [f, $cf, paq, niv, $cpaq, prods, $cprod,
            // ext, $cext, $crecep, (−multas, −desc si hay bono), $neto]
            var conBonoH = rwH.length>=14 && String(rwH[13]).trim()!=='';
            cosmsH.push({name:nmH,color:(COLORES_COSM[nmH]&&COLORES_COSM[nmH].header)||'#5B7FA6',
              f:nH_(rwH[1]),cf:nH_(rwH[2]),paq:nH_(rwH[3]),
              niv:nS,cpaq:nH_(rwH[5]),totalProd:nH_(rwH[6]),cprod:nH_(rwH[7]),
              ext:nH_(rwH[8]),cext:nH_(rwH[9]),crecep:nH_(rwH[10]),diasRecep:0,
              m:conBonoH?Math.abs(nH_(rwH[11])):0,d:conBonoH?Math.abs(nH_(rwH[12])):0,
              total:conBonoH?nH_(rwH[13]):nH_(rwH[11])});
          }
          storedH[nm]={nombre:nm,titulo:tituloH,clientas:clientasH,bonoActivo:bonoH,cosmetologas:cosmsH};
          updated=true;
        } catch(e2) {}
      });
      if (updated) propsH.setProperty('SUNSU_HISTORIAL_COMISIONES', JSON.stringify(storedH));
      var periodosH = Object.keys(storedH).sort().reverse().map(function(k){
        return {nombre:k, titulo:storedH[k].titulo||k};
      });
      return respJsonGet({periodos: periodosH}, callback);
    }

    // ── Datos de un período histórico específico ──
    if (action === 'getPeriodoComision') {
      var nombreP = (e.parameter.nombre||'').toString().trim();
      // Try PropertiesService first
      var propsP = PropertiesService.getScriptProperties();
      var storedP = JSON.parse(propsP.getProperty('SUNSU_HISTORIAL_COMISIONES')||'{}');
      if (storedP[nombreP]) return respJsonGet({data: storedP[nombreP]}, callback);
      // Fallback: read from sheet and parse into same format
      var ss3 = SpreadsheetApp.getActiveSpreadsheet();
      var wsP = ss3.getSheetByName(nombreP);
      if (!wsP) return respJsonGet({error:'Período no encontrado'}, callback);
      var pData = wsP.getDataRange().getValues();
      // Sheet structure: row0=title, row1=summary(clientas col1, bono col4), row2=headers, row3+=cosm data
      // Layout viejo: 0=name,1=faciales,2=comF,3=paq,4=nivel,5=comPaq,6=comProd,7=total
      // Layout nuevo (extras+recep): ...,6=comProd,7=extras,8=comExtras,9=comRecep,10=total — se detecta por encabezado
      var hdrPStr = (pData[2]||[]).map(function(x){return String(x||'');}).join('|').toUpperCase();
      var tieneExtP = hdrPStr.indexOf('EXTRAS') >= 0;
      var clientasP = pData[1] ? (pData[1][1]||0) : 0;
      var bonoP = pData[1] ? String(pData[1][4]||'').indexOf('ACTIVO')>=0 : false;
      var cosmsP = [];
      for (var rp=3; rp<pData.length; rp++) {
        var rw = pData[rp];
        var nm = String(rw[0]||'').trim();
        if (!nm || nm.toUpperCase().indexOf('TOTAL')>=0 || nm.toUpperCase().indexOf('COSMET')>=0 || nm.toUpperCase().indexOf('DETALLE')>=0) continue;
        var nivR=String(rw[4]||'—').trim();
        var nivS=isNaN(parseFloat(nivR))?nivR:('N'+Math.round(parseFloat(nivR)));
        cosmsP.push({name:nm, f:parseFloat(rw[1])||0, cf:parseFloat(rw[2])||0,
          paq:parseFloat(rw[3])||0, niv:nivS, cpaq:parseFloat(rw[5])||0,
          cprod:parseFloat(rw[6])||0,
          ext:tieneExtP?(parseFloat(rw[7])||0):0, cext:tieneExtP?(parseFloat(rw[8])||0):0,
          crecep:tieneExtP?(parseFloat(rw[9])||0):0,
          total:parseFloat(rw[tieneExtP?10:7])||0, m:0, d:0});
      }
      // Save to PropertiesService for next time
      storedP[nombreP] = {nombre:nombreP, clientas:clientasP, bonoActivo:bonoP, cosmetologas:cosmsP};
      propsP.setProperty('SUNSU_HISTORIAL_COMISIONES', JSON.stringify(storedP));
      return respJsonGet({data: storedP[nombreP]}, callback);
    }

    // ── Usuarios (PINs sincronizados) ──
    // Lista de usuarios SIN los PIN: la usa el app para nombres, colores y roles.
    // ¿Está bloqueado este usuario? Consulta liviana desde la puerta de entrada
    // de cada dispositivo (mata sesiones guardadas y Face ID de ex-empleadas).
    if (action === 'usuarioBloqueado') {
      var uidUB = (e.parameter.uid||'').toString().trim();
      var uUB = _usuariosSunsu_(PropertiesService.getScriptProperties())
        .find(function(x){ return x.id === uidUB; });
      return respJsonGet({bloqueado: !uUB || !!uUB.bloqueado}, callback);
    }
    if (action === 'getUsuarios') {
      var usersG = _usuariosSunsu_(PropertiesService.getScriptProperties());
      return respJsonGet(usersG.map(_usuarioPublico_), callback);
    }
    if (action === 'getKpisRango') {
      try {
        var wsKR = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
        if (!wsKR) return respJsonGet({error:'No TICKET_FICHA'}, callback);
        var desdeStr = (e.parameter.desde||'').toString().trim();
        var hastaStr = (e.parameter.hasta||'').toString().trim();
        if (!desdeStr||!hastaStr) return respJsonGet({error:'Fechas requeridas'}, callback);
        var desdeDt = new Date(desdeStr+'T00:00:00-05:00');
        var hastaDt = new Date(hastaStr+'T23:59:59-05:00');
        var lastRowKR = wsKR.getLastRow();
        var colA2 = wsKR.getRange(1,1,lastRowKR,1).getValues();
        var colB2 = wsKR.getRange(1,2,lastRowKR,1).getValues();
        var colC2 = wsKR.getRange(1,3,lastRowKR,1).getValues();
        var colJ2 = wsKR.getRange(1,10,lastRowKR,1).getValues();
        var colT2 = wsKR.getRange(1,20,lastRowKR,1).getValues();
        var colU2 = wsKR.getRange(1,21,lastRowKR,1).getValues();
        var colV2 = wsKR.getRange(1,22,lastRowKR,1).getValues();
        var mesesMap2={}, facCount2={}, cosmMap2={};
        var ingresos2=0, faciales2=0, paquetes2=0, productos2=0;
        var clientas2={}, porDia2={};
        for (var kr=1; kr<lastRowKR; kr++) {
          var ts2=colA2[kr][0]; if (!ts2) continue;
          var f2=ts2 instanceof Date?ts2:new Date(ts2.toString());
          if (isNaN(f2.getTime())) continue;
          var cosm2=(colB2[kr][0]||'').toString().trim();
        // SUNSU incluido en ingreso bruto
          var id2Raw=(colC2[kr][0]||'').toString().split('.')[0];
          if (id2Raw==='1793219469001') continue;
          var ecF2=new Date(f2.getTime()-5*60*60*1000);
          var mo2=ecF2.getUTCMonth()+1, yr2=ecF2.getUTCFullYear();
          var mk2=yr2+'-'+(mo2<10?'0':'')+mo2;
          var est2=parseFloat(colJ2[kr][0])||0;
          var id2c=id2Raw.replace(/[^0-9a-zA-Z]/g,'');
          var fac2=(colT2[kr][0]||'').toString().trim();
          // Historial (all time)
          if (!mesesMap2[mk2]) mesesMap2[mk2]={ingr:0,faciales:0,clientas:{}};
          mesesMap2[mk2].ingr+=est2;
          if (id2c) mesesMap2[mk2].clientas[id2c]=true;
          if (fac2&&fac2.indexOf('SUNSU')>=0) mesesMap2[mk2].faciales++;
          // Range filter
          if (f2<desdeDt||f2>hastaDt) continue;
          ingresos2+=est2;
          if (id2c) clientas2[id2c]=true;
          var pack3r=(colU2[kr][0]||'').toString().trim();
          var pack6r=(colV2[kr][0]||'').toString().trim();
          var dia2=ecF2.getUTCDate();
          if (!porDia2[dia2]) porDia2[dia2]={faciales:0,soloCompra:0,ingr:0};
          porDia2[dia2].ingr+=est2;
          if (fac2&&fac2.indexOf('SUNSU')>=0) {
            faciales2++; porDia2[dia2].faciales++;
            var fn2=fac2.replace(/SUNSU-\d+\s*/,'').trim()||fac2;
            facCount2[fn2]=(facCount2[fn2]||0)+1;
            if (!cosmMap2[cosm2]) cosmMap2[cosm2]={ingr:0,faciales:0};
            cosmMap2[cosm2].ingr+=est2; cosmMap2[cosm2].faciales++;
          } else if ((pack3r&&pack3r!=='false'&&pack3r!=='')||(pack6r&&pack6r!=='false'&&pack6r!=='')) {
            paquetes2++; porDia2[dia2].soloCompra++;
            if (!cosmMap2[cosm2]) cosmMap2[cosm2]={ingr:0,faciales:0}; cosmMap2[cosm2].ingr+=est2;
          } else { porDia2[dia2].soloCompra++; }
        }
        var mN2=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        var ks2=Object.keys(mesesMap2).sort();
        var historial2=ks2.slice(-12).map(function(key,idx,arr){
          var m=mesesMap2[key], pts=key.split('-'), mo=parseInt(pts[1]), y=parseInt(pts[0]);
          var prevIngr=idx>0?(mesesMap2[arr[idx-1]].ingr||0):0;
          var crec=prevIngr>0?Math.round((m.ingr-prevIngr)/prevIngr*100):0;
          return {key:key,label:mN2[mo-1]+' '+y,ingr:Math.round(m.ingr*100)/100,clientas:Object.keys(m.clientas).length,faciales:m.faciales,crecIngr:crec};
        });
        var porDiaArr2=Object.keys(porDia2).map(Number).sort(function(a,b){return a-b;}).map(function(d){return{dia:d,faciales:porDia2[d].faciales||0,soloCompra:porDia2[d].soloCompra||0,ingr:Math.round((porDia2[d].ingr||0)*100)/100};});
        var dC2={0:0,1:0,2:0,3:0,4:0,5:0,6:0};
        var dN2=['Dom','Lun','Mar','Mi\u00e9','Jue','Vie','S\u00e1b'];
        Object.keys(porDia2).forEach(function(d){var fd=new Date(desdeStr.slice(0,4),parseInt(desdeStr.slice(5,7))-1,parseInt(d));dC2[fd.getDay()]+=(porDia2[d].faciales||0);});
        var diasPico2=Object.keys(dC2).map(function(k){return{d:dN2[parseInt(k)],c:dC2[k]};}).sort(function(a,b){return b.c-a.c;});
        var nCli2=Object.keys(clientas2).length;
        return respJsonGet({
          ingresos:Math.round(ingresos2*100)/100,
          sinIva:Math.round(ingresos2/1.15*100)/100,
          clientas:nCli2,faciales:faciales2,paquetes:paquetes2,productos:productos2,
          avgTicket:nCli2>0?Math.round(ingresos2/nCli2*100)/100:0,
          topFaciales:Object.keys(facCount2).map(function(k){return{n:k,c:facCount2[k]};}).sort(function(a,b){return b.c-a.c;}).slice(0,6),
          topCosm:Object.keys(cosmMap2).map(function(k){return{n:k,rev:Math.round(cosmMap2[k].ingr*100)/100,faciales:cosmMap2[k].faciales};}).sort(function(a,b){return b.rev-a.rev;}),
          diasPico:diasPico2,porDia:porDiaArr2,historial:historial2
        }, callback);
      } catch(errKR) {
        Logger.log('getKpisRango: '+errKR.message);
        return respJsonGet({error:errKR.message}, callback);
      }
    }

        // ── Tickets del día / ayer para facturación ──
    if (action === 'getTicketsDia') {
      var wsT = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsT) return respJsonGet({error:'No TICKET_FICHA'}, callback);
      var offset = parseInt(e.parameter.offset||'0'); // 0=hoy, 1=ayer
      var now2 = new Date();
      var ec2  = new Date(now2.getTime() - 5*60*60*1000);
      ec2.setUTCDate(ec2.getUTCDate() - offset);
      var diaTarget = ec2.getUTCDate(), mesTarget = ec2.getUTCMonth()+1, anoTarget = ec2.getUTCFullYear();
      var tData = wsT.getDataRange().getValues();
      var tickets = [];
      for (var ti=1; ti<tData.length; ti++) {
        var row = tData[ti], ts = row[0];
        if (!ts) continue;
        var tFecha = ts instanceof Date ? ts : new Date(ts.toString());
        if (isNaN(tFecha.getTime())) continue;
        var ecT = new Date(tFecha.getTime() - 5*60*60*1000);
        if (ecT.getUTCDate()!==diaTarget||ecT.getUTCMonth()+1!==mesTarget||ecT.getUTCFullYear()!==anoTarget) continue;
        var fac   = row[5]===true||row[5]==='TRUE'||row[5]===1||parseFloat(row[5])===1;
        var cob   = row[7]===true||row[7]==='TRUE'||row[7]===1||parseFloat(row[7])===1;
        var numFac= (row[6]||'').toString().trim();
        var comp  = (row[8]||'').toString().trim();
        // Skip if both fac and cob already done
        if (fac && cob && numFac) continue;
        tickets.push({
          fila:    ti+1, // 1-based
          timestamp: tFecha.toISOString(),
          cosm:    (row[1]||'').toString().trim(),
          cedula:  (row[2]||'').toString().trim(),
          nombre:  (row[3]||'').toString().trim(),
          apellido:(row[4]||'').toString().trim(),
          facial:  (row[19]||'').toString().trim(),
          estimado:parseFloat(row[9])||0,
          fac, numFac, cob, comp
        });
      }
      return respJsonGet({tickets:tickets, dia:diaTarget, mes:mesTarget, ano:anoTarget}, callback);
    }

    // ── Entradas de productos ──
    if (action === 'getEntradas') {
      var wsEnt = ss.getSheetByName('📥 ENTRADAS');
      if (!wsEnt) return respJsonGet({error:'No ENTRADAS'}, callback);
      var entData = wsEnt.getDataRange().getValues();
      var items = [];
      // Row 0=title, Row 1=headers, data from row 2 (index 2)
      for (var ei = 2; ei < entData.length; ei++) {
        var row = entData[ei];
        var sku = (row[1]||'').toString().trim();
        if (!sku || sku.toLowerCase()==='sku') continue;
        // Skip template/example rows
        var nombre = (row[2]||'').toString().trim();
        if (nombre.indexOf('←')>=0||nombre.toLowerCase().indexOf('auto al')>=0) continue;
        // Col F = recibida — si tiene cualquier valor (incluyendo 0) → ya procesado, omitir
        var recibidaVal = row[5];
        var recibidaStr = (recibidaVal===''||recibidaVal===null||recibidaVal===undefined)?'':recibidaVal.toString().trim();
        if(recibidaStr !== '') continue; // ya fue procesado, skip
        items.push({
          fila:    ei + 1,
          sku:     sku,
          nombre:  (row[2]||'').toString().trim(),
          proveedor:(row[3]||'').toString().trim(),
          pedida:  parseFloat(row[4])||0,
          recibida: recibidaStr,
          estado:  (row[6]||'').toString().trim(),
          orden:   (row[7]||'').toString().trim(),
          notas:   (row[8]||'').toString().trim(),
        });
      }
      return respJsonGet({items:items}, callback);
    }

    // ── Registrar entrada de producto ──
    if (action === 'registrarEntrada') {
      var wsRE = ss.getSheetByName('📥 ENTRADAS');
      if (!wsRE) return respJsonGet({error:'No ENTRADAS'}, callback);
      var filaRE = parseInt(e.parameter.fila);
      var cantRE = parseFloat(e.parameter.cantidad)||0;
      var usuRE  = (e.parameter.usuario||'').toString().trim();
      if (!filaRE||filaRE<3) return respJsonGet({error:'Fila inválida'}, callback);
      // Col F (6) = cantidad recibida
      // Col G (7) = estado (auto-calculated by sheet formula, but set it too)
      // Col J (10) = registrado por
      // Col K (11) = timestamp recepción
      var pedidaRE = parseFloat(wsRE.getRange(filaRE, 5).getValue())||0;
      var prevRawRE = wsRE.getRange(filaRE, 6).getValue();
      var yaRE = !(prevRawRE===''||prevRawRE===null||prevRawRE===undefined);
      var prevRE = yaRE ? (parseFloat(prevRawRE)||0) : 0;
      var notasRE = (wsRE.getRange(filaRE, 9).getValue()||'').toString();
      var skuRE = (wsRE.getRange(filaRE, 2).getValue()||'').toString().trim();
      var nomRE = (wsRE.getRange(filaRE, 3).getValue()||'').toString().trim();
      var provRE = (wsRE.getRange(filaRE, 4).getValue()||'').toString().trim();
      var ordenRE = (wsRE.getRange(filaRE, 8).getValue()||'').toString().trim();
      var cabRE = null;
      // Compra directa no alimenta 📊 INVENTARIO: el delta entra a Cabina.
      if (_esNotaCompraDirecta_(notasRE)) {
        try { cabRE = _compraDirectaACabina_(ss, {sku:skuRE, nombre:nomRE, proveedor:provRE, delta:cantRE-prevRE, orden:ordenRE, usuario:usuRE}); }
        catch(eCabRE) { cabRE = {error:eCabRE.message||String(eCabRE), delta:cantRE-prevRE}; }
      }
      wsRE.getRange(filaRE, 6).setValue(cantRE); // F = cant. recibida
      // Col G estado
      var estadoRE = cantRE===0?'❌ No llegó':cantRE>=pedidaRE?'✅ Completo':'⚠️ Parcial';
      wsRE.getRange(filaRE, 7).setValue(estadoRE); // G = estado
      wsRE.getRange(filaRE, 10).setValue(usuRE); // J = registrado por
      var tsRE = Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm');
      wsRE.getRange(filaRE, 11).setNumberFormat('@').setValue(tsRE); // K = timestamp recepción (TEXTO: Sheets voltea dd/MM con día≤12)
      if (cabRE && (cabRE.accion==='creado' || cabRE.accion==='sumado')) {
        var marcaCab = '🧴 cabina '+(cabRE.codigo||'')+' '+((cabRE.delta>0?'+':'')+cabRE.delta);
        notasRE = notasRE ? (notasRE+' | '+marcaCab) : marcaCab;
        wsRE.getRange(filaRE, 9).setValue(notasRE);
      }
      // La fórmula de ese SKU se reescribe solo si Cabina recibió el delta
      // (y el historial del mismo SKU). Si Cabina falló, la percha sigue contando.
      if (_esNotaCompraDirecta_(notasRE) && (!cabRE || !cabRE.error)) {
        var migRE = null;
        try { SpreadsheetApp.flush(); migRE = _migrarCompraDirectaACabina_(ss, skuRE); }
        catch(eMigRE) { migRE = {ok:false, error:eMigRE.message||String(eMigRE)}; }
        if (migRE && migRE.ok) { try { _parcheFormulaDirecta_(ss, skuRE); } catch(ePfRE) {} }
        else if (cabRE && migRE && migRE.error) cabRE.aviso = migRE.error;
      }
      SpreadsheetApp.flush();
      return respJsonGet({ok:true, pedida:pedidaRE, cabina:cabRE}, callback);
    }

    // ── Historial completo de órdenes de compra (incluye procesadas) ──
    if (action === 'getEntradasHistorial') {
      var wsEH = ss.getSheetByName('📥 ENTRADAS');
      if (!wsEH) return respJsonGet({error:'No ENTRADAS'}, callback);
      var ehData = wsEH.getDataRange().getValues();
      var itemsH = [];
      for (var hi = 2; hi < ehData.length; hi++) {
        var rowH = ehData[hi];
        var skuH = (rowH[1]||'').toString().trim();
        if (!skuH || skuH.toLowerCase()==='sku') continue;
        var nombreH = (rowH[2]||'').toString().trim();
        if (nombreH.indexOf('←')>=0||nombreH.toLowerCase().indexOf('auto al')>=0) continue;
        var recibidaH = rowH[5];
        var recibidaStrH = (recibidaH===''||recibidaH===null||recibidaH===undefined)?'':recibidaH.toString().trim();
        var tsRecH = rowH[10];
        if (tsRecH instanceof Date) tsRecH = Utilities.formatDate(tsRecH,'America/Guayaquil','dd/MM/yyyy HH:mm');
        else tsRecH = (tsRecH||'').toString().trim();
        var creadaH = rowH[0];
        if (creadaH instanceof Date) creadaH = Utilities.formatDate(creadaH,'America/Guayaquil','dd/MM/yyyy');
        else creadaH = (creadaH||'').toString().trim().split(' ')[0];
        itemsH.push({
          fila:      hi + 1,
          sku:       skuH,
          nombre:    nombreH,
          proveedor: (rowH[3]||'').toString().trim(),
          pedida:    parseFloat(rowH[4])||0,
          recibida:  recibidaStrH,
          estado:    (rowH[6]||'').toString().trim(),
          orden:     (rowH[7]||'').toString().trim(),
          notas:     (rowH[8]||'').toString().trim(),
          usuario:   (rowH[9]||'').toString().trim(),
          timestamp: tsRecH,
          creada:    creadaH,
        });
      }
      // ── Órdenes de SOLO FACTURACIÓN: existen en OC_DATA pero no tienen ninguna
      // línea en ENTRADAS (sin restock) — sin esto eran invisibles en el historial
      // y su PDF quedaba irrecuperable desde el app. ──
      var ocSoloH = [];
      try {
        var ordenesConLineas = {};
        itemsH.forEach(function(itX){ if (itX.orden) ordenesConLineas[itX.orden] = 1; });
        var wsODH = ss.getSheetByName('OC_DATA');
        if (wsODH && wsODH.getLastRow() > 1) {
          var dODH = wsODH.getRange(1,1,wsODH.getLastRow(),4).getValues();
          var vistosODH = {};
          for (var hOD = dODH.length-1; hOD >= 1; hOD--) { // de abajo: si hay duplicados por ediciones, gana el más reciente
            var numODH = (dODH[hOD][0]||'').toString().trim();
            if (!numODH || ordenesConLineas[numODH] || vistosODH[numODH]) continue;
            vistosODH[numODH] = 1;
            var fecODH = dODH[hOD][1];
            if (fecODH instanceof Date) fecODH = Utilities.formatDate(fecODH,'America/Guayaquil','dd/MM/yyyy');
            else fecODH = (fecODH||'').toString().trim().split(' ')[0];
            var qODH = '';
            try { qODH = (JSON.parse(dODH[hOD][3]||'{}').qLabel||''); } catch(eQOD) {}
            ocSoloH.push({orden:numODH, prov:(dODH[hOD][2]||'').toString().trim(), creada:fecODH, quincena:qODH});
          }
        }
      } catch(eOSH) {}
      return respJsonGet({items:itemsH, ocSolo:ocSoloH}, callback);
    }

    // ── Editar una entrada ya registrada (admin) — deja auditoría en notas ──
    if (action === 'editarEntrada') {
      var wsEE = ss.getSheetByName('📥 ENTRADAS');
      if (!wsEE) return respJsonGet({error:'No ENTRADAS'}, callback);
      var filaEE = parseInt(e.parameter.fila);
      var cantEE = parseFloat(e.parameter.cantidad);
      var usuEE  = (e.parameter.usuario||'').toString().trim();
      if (!filaEE||filaEE<3||isNaN(cantEE)||cantEE<0) return respJsonGet({error:'Parámetros inválidos'}, callback);
      var pedidaEE = parseFloat(wsEE.getRange(filaEE, 5).getValue())||0;
      var prevRawEE = wsEE.getRange(filaEE, 6).getValue();
      var yaEE = !(prevRawEE===''||prevRawEE===null||prevRawEE===undefined);
      var prevEE = yaEE ? (parseFloat(prevRawEE)||0) : 0;
      var notasEE = (wsEE.getRange(filaEE, 9).getValue()||'').toString();
      var skuEE = (wsEE.getRange(filaEE, 2).getValue()||'').toString().trim();
      var nomEE = (wsEE.getRange(filaEE, 3).getValue()||'').toString().trim();
      var provEE = (wsEE.getRange(filaEE, 4).getValue()||'').toString().trim();
      var ordenEE = (wsEE.getRange(filaEE, 8).getValue()||'').toString().trim();
      var cabEE = null;
      // Si sube (o baja) la cantidad de una compra directa, Cabina sigue el delta.
      if (_esNotaCompraDirecta_(notasEE)) {
        try { cabEE = _compraDirectaACabina_(ss, {sku:skuEE, nombre:nomEE, proveedor:provEE, delta:cantEE-prevEE, orden:ordenEE, usuario:usuEE}); }
        catch(eCabEE) { cabEE = {error:eCabEE.message||String(eCabEE), delta:cantEE-prevEE}; }
      }
      wsEE.getRange(filaEE, 6).setValue(cantEE); // F = cant. recibida
      var estadoEE = cantEE===0?'❌ No llegó':cantEE>=pedidaEE?'✅ Completo':'⚠️ Parcial';
      wsEE.getRange(filaEE, 7).setValue(estadoEE); // G = estado
      var tsEE = Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm');
      wsEE.getRange(filaEE, 10).setValue(usuEE); // J = editado por
      wsEE.getRange(filaEE, 11).setNumberFormat('@').setValue(tsEE);  // K = nuevo timestamp (TEXTO)
      // Auditoría en col I (notas). Se conserva "COMPRA DIRECTA" para el acta y la fórmula.
      var marcaEE = '✏️ Editado por '+usuEE+' '+tsEE;
      if (cabEE && (cabEE.accion==='creado' || cabEE.accion==='sumado')) marcaEE += ' | 🧴 cabina '+(cabEE.codigo||'')+' '+((cabEE.delta>0?'+':'')+cabEE.delta);
      wsEE.getRange(filaEE, 9).setValue(notasEE ? (notasEE+' | '+marcaEE) : marcaEE);
      if (_esNotaCompraDirecta_(notasEE) && (!cabEE || !cabEE.error)) {
        var migEE = null;
        try { SpreadsheetApp.flush(); migEE = _migrarCompraDirectaACabina_(ss, skuEE); }
        catch(eMigEE) { migEE = {ok:false, error:eMigEE.message||String(eMigEE)}; }
        if (migEE && migEE.ok) { try { _parcheFormulaDirecta_(ss, skuEE); } catch(ePfEE) {} }
        else if (cabEE && migEE && migEE.error) cabEE.aviso = migEE.error;
      }
      logAccion_(ss, '✏️ EDITAR ENTREGA', 'fila '+filaEE+' → cantidad recibida '+cantEE+(cabEE&&cabEE.codigo?(' · cabina '+cabEE.codigo):''), usuEE);
      SpreadsheetApp.flush();
      return respJsonGet({ok:true, estado:estadoEE, ts:tsEE, cabina:cabEE}, callback);
    }

    // ── Registrar factura + cobro en un solo paso ──
    if (action === 'registrarFacturaCobro') {
      try {
        var wsFC = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
        if (!wsFC) return respJsonGet({error:'No TICKET_FICHA'}, callback);
        var filaFC   = parseInt(e.parameter.fila||'0');
        var numFacFC = (e.parameter.numFac||'').toString().trim();
        var compFC   = (e.parameter.comp||'').toString().trim();
        var soloCobroFC = (e.parameter.soloCobro||'0')==='1';
        Logger.log('registrarFacturaCobro: fila='+filaFC+' numFac='+numFacFC+' comp='+compFC+' soloCobro='+soloCobroFC);
        if (!filaFC||filaFC<2) return respJsonGet({error:'Fila inválida: '+filaFC}, callback);
        // Write factura (col F=6 checkbox, col G=7 number)
        if (!soloCobroFC && numFacFC) {
          wsFC.getRange(filaFC, 6).setValue(true);
          wsFC.getRange(filaFC, 7).setValue(numFacFC);
          Logger.log('Wrote factura: fila='+filaFC+' F=true G='+numFacFC);
        }
        // Write cobro (col H=8 checkbox, col I=9 text)
        if (compFC) {
          wsFC.getRange(filaFC, 8).setValue(true);
          wsFC.getRange(filaFC, 9).setValue(compFC);
          Logger.log('Wrote cobro: fila='+filaFC+' H=true I='+compFC);
        }
        // Foto del comprobante de transferencia (URL en columna COMPROBANTE, detectada por encabezado)
        var urlCompFC = (e.parameter.comprobanteUrl||'').toString().trim();
        if (urlCompFC) {
          var hdrsFC = wsFC.getRange(1, 1, 1, wsFC.getLastColumn()).getValues()[0];
          var colCompFC = 0;
          for (var hc = 0; hc < hdrsFC.length; hc++) { if ((hdrsFC[hc]||'').toString().toUpperCase().indexOf('COMPROBANTE') >= 0) { colCompFC = hc + 1; break; } }
          if (!colCompFC) {
            colCompFC = Math.max(wsFC.getLastColumn() + 1, 76); // BX o siguiente libre
            wsFC.getRange(1, colCompFC).setValue('COMPROBANTE');
          }
          wsFC.getRange(filaFC, colCompFC).setValue(urlCompFC);
        }
        SpreadsheetApp.flush();
        return respJsonGet({ok:true, fila:filaFC}, callback);
      } catch(errFC) {
        Logger.log('registrarFacturaCobro error: '+errFC.message);
        return respJsonGet({error:errFC.message}, callback);
      }
    }

    // ── Registrar factura en ticket ──
    if (action === 'registrarFactura') {
      var wsRF = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsRF) return respJsonGet({error:'No TICKET_FICHA'}, callback);
      var filaF = parseInt(e.parameter.fila);
      var numF  = (e.parameter.numFac||'').toString().trim();
      if (!filaF||filaF<2||!numF) return respJsonGet({error:'Faltan parámetros'}, callback);
      wsRF.getRange(filaF, 6).setValue(true);  // col F = FAC checkbox
      wsRF.getRange(filaF, 7).setValue(numF);   // col G = # FAC
      SpreadsheetApp.flush();
      return respJsonGet({ok:true}, callback);
    }

    // ── Registrar cobro en ticket ──
    if (action === 'registrarCobro') {
      var wsRC = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsRC) return respJsonGet({error:'No TICKET_FICHA'}, callback);
      var filaC  = parseInt(e.parameter.fila);
      var compC  = (e.parameter.comp||'').toString().trim(); // e.g. "Tarje:V1234, Trans:C5678"
      if (!filaC||filaC<2) return respJsonGet({error:'Fila inválida'}, callback);
      wsRC.getRange(filaC, 8).setValue(true);  // col H = COB checkbox
      wsRC.getRange(filaC, 9).setValue(compC); // col I = comp (tipo cobro + detalle)
      SpreadsheetApp.flush();
      return respJsonGet({ok:true}, callback);
    }

    // ── Marcar uso manual de paquete ──
    if (action === 'marcarUsoManual') {
      var wsMU = ss.getSheetByName('📋 PAQUETES');
      if (!wsMU) return respJsonGet({error:'No PAQUETES'}, callback);
      var filaM  = parseInt(e.parameter.fila);
      var idxM   = parseInt(e.parameter.idx);   // 0-based uso index
      var notaM  = (e.parameter.nota||'').toString().trim();
      var totalM = parseInt(e.parameter.total)||3;
      if (!filaM || filaM < 2 || idxM < 0 || idxM >= 6) return respJsonGet({error:'Parámetros inválidos'}, callback);
      // USO cols: K=11,M=13,O=15,Q=17,S=19,U=21 (1-based)
      // FECHA cols: L=12,N=14,P=16,R=18,T=20,V=22 (1-based)
      var USO_COLS_M   = [11,13,15,17,19,21];
      var FECHA_COLS_M = [12,14,16,18,20,22];
      // Verify slot is still empty
      var currentUso = wsMU.getRange(filaM, USO_COLS_M[idxM]).getValue();
      if (currentUso === true || currentUso === 'TRUE') return respJsonGet({error:'Esta sesión ya fue marcada'}, callback);
      wsMU.getRange(filaM, USO_COLS_M[idxM]).setValue(true);
      wsMU.getRange(filaM, FECHA_COLS_M[idxM]).setValue(notaM);
      // Check if all sessions used — update col X (COMPLETO)
      var allUsed = true;
      for (var mu = 0; mu < totalM; mu++) {
        var v = wsMU.getRange(filaM, USO_COLS_M[mu]).getValue();
        if (v !== true && v !== 'TRUE') { allUsed=false; break; }
      }
      if (allUsed) wsMU.getRange(filaM, 24).setValue(true); // col X = COMPLETO
      SpreadsheetApp.flush();
      return respJsonGet({ok:true}, callback);
    }

    // ── Buscar Gift Cards ──
    if (action === 'buscarGiftCards') {
      var wsGCS = ss.getSheetByName('🎁 GIFT CARDS');
      if (!wsGCS) return respJsonGet({error:'No GIFT CARDS'}, callback);
      var qGC = (e.parameter.q||'').toString().trim().toLowerCase();
      if (!qGC) return respJsonGet({resultados:[]}, callback);
      var todasGC = (qGC === '*'); // '*' = listado completo (vista de caducidad)
      var gcAll = wsGCS.getDataRange().getValues();
      var gcRes = [];
      for (var gi = 2; gi < gcAll.length; gi++) { // search all rows from row 3
        var row = gcAll[gi];
        var codigo    = (row[0]||'').toString().trim();
        var ced       = (row[4]||'').toString().trim();
        var nom       = (row[5]||'').toString().trim().toLowerCase();
        var ape       = (row[6]||'').toString().trim().toLowerCase();
        var usadoPorG = (row[12]||'').toString().trim().toLowerCase(); // col M
        var notasG    = (row[13]||'').toString().trim().toLowerCase(); // col N
        if (!codigo) continue;
        var hayMatch = codigo.toLowerCase().indexOf(qGC)>=0
          || ced.indexOf(qGC)>=0
          || nom.indexOf(qGC)>=0
          || ape.indexOf(qGC)>=0
          || (nom+' '+ape).indexOf(qGC)>=0
          || usadoPorG.indexOf(qGC)>=0
          || notasG.indexOf(qGC)>=0;
        if (!todasGC && !hayMatch) continue;
        gcRes.push({
          fila:      gi + 1,
          codigo:    codigo,
          dia: row[1], mes: row[2], ano: row[3],
          cedula:    ced,
          nombre:    (row[5]||'').toString().trim(),
          apellido:  (row[6]||'').toString().trim(),
          factura:   (row[7]||'').toString().trim(),
          sku:       (row[8]||'').toString().trim(),
          valor:     (row[9]||'').toString().trim(),
          usado:     row[10]===true||row[10]==='TRUE',
          fechaUso:  (row[11]||'').toString().trim(),
          usadoPor:  (row[12]||'').toString().trim(),
          notas:     (row[13]||'').toString().trim(),
        });
      }
      return respJsonGet({resultados: gcRes}, callback);
    }

    // ── Marcar GC como usada ──
    if (action === 'marcarGCUsada') {
      var wsGCU = ss.getSheetByName('🎁 GIFT CARDS');
      if (!wsGCU) return respJsonGet({error:'No GIFT CARDS'}, callback);
      var filaGCU = parseInt(e.parameter.fila);
      // También se puede marcar por CÓDIGO (canje desde el ticket): busca la fila de esa GC
      if (!filaGCU && e.parameter.codigo) {
        var codBusq = e.parameter.codigo.toString().trim();
        var gcuData = wsGCU.getDataRange().getValues();
        for (var gu = 2; gu < gcuData.length; gu++) {
          if ((gcuData[gu][0]||'').toString().trim() === codBusq) {
            filaGCU = gu + 1;
            var usadoGu = gcuData[gu][10];
            if (!(usadoGu === true || usadoGu === 'TRUE')) break; // preferir la que no esté usada
          }
        }
        if (!filaGCU) return respJsonGet({error:'No se encontró la GC '+codBusq}, callback);
      }
      if (!filaGCU || filaGCU < 3) return respJsonGet({error:'Fila inválida'}, callback);
      var yaUsado = wsGCU.getRange(filaGCU, 11).getValue();
      if (yaUsado === true || yaUsado === 'TRUE') return respJsonGet({error:'Esta GC ya fue usada'}, callback);
      wsGCU.getRange(filaGCU, 11).setValue(true);                         // K = USADO?
      wsGCU.getRange(filaGCU, 12).setValue(e.parameter.fechaUso||'');     // L = FECHA USO
      wsGCU.getRange(filaGCU, 13).setValue(e.parameter.usadoPor||'');     // M = USADO POR
      if (e.parameter.notas) wsGCU.getRange(filaGCU, 14).setValue(e.parameter.notas); // N = NOTAS
      SpreadsheetApp.flush();
      return respJsonGet({ok:true}, callback);
    }

    // ── Buscar paquetes por nombre/cédula ──
    if (action === 'buscarPaquetes') {
      var wsBPaq = ss.getSheetByName('📋 PAQUETES');
      if (!wsBPaq) return respJsonGet({error:'No PAQUETES'}, callback);
      var query = (e.parameter.q||'').toString().trim().toLowerCase();
      if (!query) return respJsonGet({resultados:[]}, callback);
      var bpData = wsBPaq.getDataRange().getValues();
      var resultados = [];
      for (var bi = 2; bi < bpData.length; bi++) {
        var row = bpData[bi];
        var ced  = (row[3]||'').toString().trim();
        var nom  = (row[4]||'').toString().trim().toLowerCase();
        var ape  = (row[5]||'').toString().trim().toLowerCase();
        var notas  = (row[24]||'').toString().trim().toLowerCase();
        if (!ced && !nom) continue;
        if (ced.indexOf(query) < 0 && nom.indexOf(query) < 0 && ape.indexOf(query) < 0 && (nom+' '+ape).indexOf(query) < 0 && notas.indexOf(query) < 0) continue;
        // Determine pack size from SKU or nombre
        var sku  = (row[7]||'').toString().trim();
        var nomP = (row[8]||'').toString().trim();
        var isPack6 = nomP.indexOf('(6)') >= 0 || nomP.indexOf('x6') >= 0 || nomP.indexOf('X6') >= 0;
        var totalSes = isPack6 ? 6 : 3;
        var mPromoB = nomP.toUpperCase().match(/PROMO\s*(\d+)\s*SES/);
        if (mPromoB) totalSes = Math.max(1, Math.min(6, parseInt(mPromoB[1])));
        // Build usos array
        var USO_COLS_B   = [10,12,14,16,18,20]; // K,M,O,Q,S,U (0-based)
        var FECHA_COLS_B = [11,13,15,17,19,21]; // L,N,P,R,T,V (0-based)
        var usos = [];
        for (var us = 0; us < totalSes; us++) {
          usos.push({
            usado: row[USO_COLS_B[us]] === true || row[USO_COLS_B[us]] === 'TRUE',
            fecha: (row[FECHA_COLS_B[us]]||'').toString().trim()
          });
        }
        var usados = usos.filter(function(u){ return u.usado; }).length;
        var completo = row[23] === true || row[23] === 'TRUE';
        resultados.push({
          fila:      bi + 1, // 1-based sheet row
          dia:       row[0], mes: row[1], ano: row[2],
          cedula:    ced,
          nombre:    row[4], apellido: row[5],
          factura:   (row[6]||'').toString().trim(),
          sku:       sku, paquete: nomP,
          vendidoPor:(row[9]||'').toString().trim(),
          totalSes:  totalSes,
          usados:    usados,
          usos:      usos,
          completo:  completo,
          saldo:     (row[22]||'').toString().trim(),
          notas:     (row[24]||'').toString().trim(),
        });
      }
      return respJsonGet({resultados: resultados}, callback);
    }

    // ── Gift Cards — obtener próximo código disponible ──
    if (action === 'getCodigoGC') {
      var wsGC = ss.getSheetByName('🎁 GIFT CARDS');
      if (!wsGC) return respJsonGet({error:'No GIFT CARDS'}, callback);
      var gcData = wsGC.getDataRange().getValues();
      // Parse excludeFilas param (comma-separated 1-based row numbers to skip)
      var excludeFilas = {};
      (e.parameter.excludeFilas||'').split(',').forEach(function(f){
        var n=parseInt(f); if(n>0) excludeFilas[n]=true;
      });
      var codigoDisp = null, filaDisp = -1;
      for (var gi = 2; gi < gcData.length; gi++) {
        var fila1 = gi + 1;
        if (excludeFilas[fila1]) continue; // skip already reserved
        var codigo = (gcData[gi][0]||'').toString().trim();
        var dia    = gcData[gi][1];
        var diaVacia = (dia===''||dia===null||dia===undefined||dia===false||isNaN(parseFloat(dia)));
        if (codigo && diaVacia) { codigoDisp = codigo; filaDisp = fila1; break; }
      }
      if (!codigoDisp) return respJsonGet({error:'Sin códigos GC disponibles'}, callback);
      return respJsonGet({codigo: codigoDisp, fila: filaDisp}, callback);
    }

    // ── Gift Cards — obtener N códigos consecutivos de una vez ──
    if (action === 'getCodigosGC') {
      var wsGCN = ss.getSheetByName('🎁 GIFT CARDS');
      if (!wsGCN) return respJsonGet({error:'No GIFT CARDS'}, callback);
      var n = parseInt(e.parameter.n) || 1;
      var gcDataN = wsGCN.getDataRange().getValues();
      var codigos = [];
      for (var gj = 2; gj < gcDataN.length && codigos.length < n; gj++) {
        var cod = (gcDataN[gj][0]||'').toString().trim();
        var dN  = gcDataN[gj][1];
        var vacia = (dN===''||dN===null||dN===undefined||dN===false||isNaN(parseFloat(dN)));
        if (cod && vacia) codigos.push({codigo: cod, fila: gj + 1});
      }
      if (codigos.length < n) return respJsonGet({error:'Solo hay '+codigos.length+' código(s) disponibles, se necesitan '+n}, callback);
      return respJsonGet({codigos: codigos}, callback);
    }

    // ── Gift Cards — registrar venta ──
    if (action === 'registrarGC') {
      var wsGC2 = ss.getSheetByName('🎁 GIFT CARDS');
      if (!wsGC2) return respJsonGet({error:'No GIFT CARDS'}, callback);
      var filaGC = parseInt(e.parameter.fila);
      if (!filaGC || filaGC < 3) return respJsonGet({error:'Fila inválida'}, callback);
      var hoyGC = new Date();
      var ecGC  = new Date(hoyGC.getTime() - 5*60*60*1000); // Ecuador UTC-5
      // Col B=DIA, C=MES, D=AÑO, E=CÉDULA, F=NOMBRE, G=APELLIDO, I=SKU, J=TIPO, N=NOTAS
      wsGC2.getRange(filaGC, 2).setValue(ecGC.getUTCDate());
      wsGC2.getRange(filaGC, 3).setValue(ecGC.getUTCMonth()+1);
      wsGC2.getRange(filaGC, 4).setValue(ecGC.getUTCFullYear());
      wsGC2.getRange(filaGC, 5).setValue(e.parameter.cedula||'');
      wsGC2.getRange(filaGC, 6).setValue(e.parameter.nombre||'');
      wsGC2.getRange(filaGC, 7).setValue(e.parameter.apellido||'');
      wsGC2.getRange(filaGC, 9).setValue('SUNSU-35');   // col I = SKU
      wsGC2.getRange(filaGC, 10).setValue('Gift Card'); // col J = VALOR/TIPO
      if (e.parameter.notas) wsGC2.getRange(filaGC, 14).setValue(e.parameter.notas||'');
      return respJsonGet({ok:true, codigo: e.parameter.codigo||''}, callback);
    }

    // ── getSheetUrl ──
    if (action === 'getSheetUrl') {
      var row = e && e.parameter && e.parameter.row ? e.parameter.row : '';
      var wsT2 = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      var sheetId = wsT2 ? wsT2.getSheetId() : 0;
      var ssId = ss.getId();
      var url = 'https://docs.google.com/spreadsheets/d/'+ssId+'/edit#gid='+sheetId+(row?'&range='+row+':'+row:'');
      return respJsonGet({url: url}, callback);
    }

    if (action === 'getCatalogo') {
      // Migración one-time: SUNSU-15 se llama 'Ampolla Especial', nada más.
      // (El tipo usado — PDRN, Brillo, etc. — se elige en el dropdown del ticket.)
      try {
        var prA15 = PropertiesService.getScriptProperties();
        if (prA15.getProperty('CAT_AMP15_V1') !== '1') {
          var wsA15 = ss.getSheets().find(function(sx){return sx.getName().includes('CATALOGO');});
          if (wsA15) {
            var dA15 = wsA15.getDataRange().getValues();
            for (var a15 = 2; a15 < dA15.length; a15++) {
              if ((dA15[a15][0]||'').toString().trim().toUpperCase() !== 'SUNSU-15') continue;
              if ((dA15[a15][1]||'').toString() !== 'Ampolla Especial') {
                wsA15.getRange(a15+1, 2).setValue('Ampolla Especial');
              }
              break;
            }
          }
          prA15.setProperty('CAT_AMP15_V1','1');
        }
      } catch(eA15) {}
      var wsCat = ss.getSheets().find(function(s){ return s.getName().includes('CATALOGO'); });
      if (!wsCat) return respJsonGet({error:'No CATALOGO'}, callback);
      var catData = wsCat.getDataRange().getValues();
      // Compra REAL de proveedor (INVENTARIO col G) por código, para el cálculo de utilidad real
      var compraRealMap = {};
      try {
        var wsInvCR = ss.getSheets().find(function(s){ return s.getName().includes('INVENTARIO'); });
        if (wsInvCR) {
          var dInvCR = wsInvCR.getDataRange().getValues();
          for (var cr = 2; cr < dInvCR.length; cr++) {
            var skuCR = (dInvCR[cr][0]||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'');
            if (skuCR) compraRealMap[skuCR] = parseFloat(dInvCR[cr][6])||0;
          }
        }
      } catch(eCR) {}
      var items = [];
      for (var i = 2; i < catData.length; i++) {
        var sku = String(catData[i][0]||'').trim();
        if (!sku) continue;
        var subtotal = parseFloat(catData[i][3])||0;
        var totalIva = parseFloat(catData[i][5])||0;
        var compra   = parseFloat(catData[i][6])||0;
        var comCat   = parseFloat(catData[i][8])||0; // col I = comisión por unidad
        var precioVenta = totalIva > 0 ? totalIva : subtotal;
        // Col J (index 9) = ACTIVO checkbox. Regla canónica: marcado = visible,
        // DESMARCADO = oculto, celda vacía (sin checkbox) = visible por defecto.
        var activoRaw = catData[i][9];
        var activo = !(activoRaw===false||activoRaw==='FALSE'||activoRaw===0);
        items.push({
          sku:     sku,
          nombre:  String(catData[i][1]||'').trim(),
          tipo:    String(catData[i][2]||'').trim(),
          subtotal: subtotal,
          total:    precioVenta,
          compra:   compra,
          compraReal: compraRealMap[sku.toUpperCase().replace(/^SUNSU-/,'')]||0,
          com:      comCat,
          activo:   activo,
        });
      }
      try { _repararColumnasTicketFicha_(ss); } catch (eRepCat) {}
      return respJsonGet(items, callback);
    }

    // ── 4. Dashboard cosmetóloga ──
    // ── getReporteAdmin: lee directo de Mi Avance (fuente de verdad) ──
    

    if (action === 'getDashCosm') {
      var cosmNombre = (e.parameter.cosmetologa || '').toString().trim();
      var hoy2 = new Date();
      var dia2 = hoy2.getDate(), mes2 = hoy2.getMonth(), anio2 = hoy2.getFullYear();
      var fechaInicio2, fechaFin2;
      if (dia2 >= 26) {
        fechaInicio2 = new Date(anio2, mes2, 26, 0,0,0);
        fechaFin2    = new Date(anio2, mes2+1, 25, 23,59,59);
      } else {
        fechaInicio2 = new Date(anio2, mes2-1, 26, 0,0,0);
        fechaFin2    = new Date(anio2, mes2, 25, 23,59,59);
      }
      var meses2 = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
      var periodoLabel = meses2[fechaInicio2.getMonth()]+' — '+meses2[fechaFin2.getMonth()]+' '+fechaFin2.getFullYear();
      try {
        var datosC  = calcularComisiones(fechaInicio2, fechaFin2);
        var cosmKey = Object.keys(datosC.cosmetologas).find(function(k){ return k.toLowerCase()===cosmNombre.toLowerCase(); });
        var cosm    = cosmKey ? datosC.cosmetologas[cosmKey] : {};
        var totalProds = Object.values(cosm.detalle_productos||{}).reduce(function(s,p){return s+p.qty;},0);
        var nCosm2 = Object.keys(datosC.cosmetologas).length || 1;
        var siguienteNivel=null, paqParaSiguiente=0, premioSiguiente=0;
        if (datosC.bonoActivo) {
          for (var n=0; n<CONFIG.NIVELES.length; n++) {
            var req=Math.ceil((datosC.totalClientas*CONFIG.NIVELES[n][0])/nCosm2);
            if ((cosm.paquetes||0) < req) { siguienteNivel=n+1; paqParaSiguiente=req-(cosm.paquetes||0); premioSiguiente=CONFIG.NIVELES[n][1]; break; }
          }
        }
        return respJsonGet({
          faciales:        cosm.faciales||0,
          comFaciales:     cosm.comFaciales||0,
          paquetes:        cosm.paquetes||0,
          comPaquetes:     cosm.comPaquetes||0,
          nivelAlcanzado:  cosm.nivelAlcanzado||'—',
          comProductos:    cosm.comProductos||0,
          totalProductos:  totalProds,
          extras:          cosm.extras||0,
          comExtras:       cosm.comExtras||0,
          comRecepcion:    cosm.comRecepcion||0,
          diasRecepcion:   cosm.diasRecepcion||0,
          multas:          cosm.multas||0,
          descuentos:      cosm.descuentos||0,
          totalClientas:   datosC.totalClientas,
          bonoActivo:      datosC.bonoActivo,
          siguienteNivel:  siguienteNivel,
          paqParaSiguiente:paqParaSiguiente,
          premioSiguiente: premioSiguiente,
          periodoLabel:    periodoLabel,
        }, callback);
      } catch(ex2) { return respJsonGet({error: ex2.message}, callback); }
    }

    // ── Seguimiento de retorno de clientas (reagendamiento) ──
    // Lee K (fecha retorno), L (checkbox agendado) y M (estado, fórmula del sheet).
    // Deduplica por clienta conservando solo su ticket más reciente.
    if (action === 'getSeguimiento') {
      var wsSeg = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsSeg) return respJsonGet({error:'No TICKET_FICHA'}, callback);
      var segData = wsSeg.getDataRange().getValues();
      var porClienta = {};
      for (var si = 1; si < segData.length; si++) {
        var rowS = segData[si];
        if (!rowS[0]) continue;
        var cosmS = (rowS[1]||'').toString().trim();
        if (!cosmS || cosmS.toUpperCase() === 'SUNSU') continue;
        if (((rowS[2]||'').toString().split('.')[0]) === '1793219469001') continue; // cliente = Sunsu Spa (interno)
        var cedS = (rowS[2]||'').toString().trim().split('.')[0];
        var nomS = (rowS[3]||'').toString().trim();
        var apeS = (rowS[4]||'').toString().trim();
        var keyS = cedS || (nomS+' '+apeS).toLowerCase().trim();
        if (!keyS) continue;
        var visitaS = rowS[0] instanceof Date ? rowS[0] : new Date(rowS[0]);
        if (isNaN(visitaS.getTime())) continue;
        var prevS = porClienta[keyS];
        if (prevS && prevS._visita >= visitaS.getTime()) continue; // conservar la visita más reciente
        var retS = rowS[10];
        var retStr = retS instanceof Date ? Utilities.formatDate(retS,'America/Guayaquil','yyyy-MM-dd') : (retS||'').toString().trim();
        porClienta[keyS] = {
          _visita: visitaS.getTime(),
          tkRow: si + 1,
          cedula: cedS, nombre: nomS, apellido: apeS,
          cosmetologa: cosmS,
          visita: Utilities.formatDate(visitaS,'America/Guayaquil','yyyy-MM-dd'),
          retorno: retStr,
          estado: (rowS[12]||'').toString().trim(), // col M (fórmula)
        };
      }
      var segStoreS = {};
      try { segStoreS = JSON.parse(PropertiesService.getScriptProperties().getProperty('SUNSU_SEGUIMIENTO')||'{}'); } catch(eSt) {}
      var hoyStrS = Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM-dd');
      var itemsS = [];
      Object.keys(porClienta).forEach(function(k){
        var o = porClienta[k];
        if (!o.estado || o.estado.indexOf('Agendada') >= 0 || o.estado.indexOf('No desea') >= 0 || o.estado.indexOf('Sin respuesta') >= 0) return; // cerrada: fuera de la lista
        var regO = segStoreS[k];
        if (regO && regO.tk === o.tkRow) { // el registro aplica solo al mismo ticket (ciclo actual)
          if (regO.r === 'nd' || regO.r === 'sr') return;          // no desea / sin respuesta (3 intentos): fuera
          if (regO.r === 'nc' && regO.hasta && regO.hasta > hoyStrS) return; // en pausa de 15 días
          o.intentos = regO.n || 0;                                 // reapareció tras la pausa: mostrar intentos
          if (regO.r === 'we') { o.waEnviado = true; o.waFecha = regO.ts||''; o.waPor = regO.u||''; } // ya se le escribio
        }
        delete o._visita;
        itemsS.push(o);
      });
      // Cruce con Acuity: si la clienta YA tiene cita futura agendada (hoy+60d),
      // se marca yaAgendo/yaAgendoFecha para que el app la muestre como resuelta
      // y nadie la llame. Match conservador: nombre+apellido normalizados exactos.
      var citasFut = getCitasFuturasAcuity_();
      itemsS.forEach(function(o){
        var fullFut = _normNombre_(o.nombre+' '+o.apellido);
        if (fullFut && citasFut[fullFut]) { o.yaAgendo = true; o.yaAgendoFecha = citasFut[fullFut]; }
      });
      // Teléfonos: 1º REGISTRO por cédula (exacto), 2º REGISTRO por nombre, 3º Acuity por nombre
      var telReg = getTelefonosRegistro_(ss);
      var telMap = getTelefonosAcuity_();
      var telKeys = Object.keys(telMap);
      itemsS.forEach(function(o){
        var full = _normNombre_(o.nombre+' '+o.apellido);
        o.telefono = (o.cedula && telReg.porCedula[o.cedula]) || telReg.porNombre[full] || telMap[full] || '';
        if (!o.telefono) {
          // Último intento: primer nombre al inicio + primer apellido en cualquier parte (Acuity)
          var pn = _normNombre_(o.nombre).split(' ')[0];
          var pa = _normNombre_(o.apellido).split(' ')[0];
          if (pn && pa) {
            for (var tk = 0; tk < telKeys.length; tk++) {
              if (telKeys[tk].indexOf(pn) === 0 && telKeys[tk].indexOf(pa) >= 0) { o.telefono = telMap[telKeys[tk]]; break; }
            }
          }
        }
      });
      // ── Plantillas de mensajes WhatsApp (editables en ⚙ CONFIGURACION) ──
      // Si no existen, se crea la sección con textos por defecto para que
      // siempre haya un lugar visible donde editarlas. Marcadores: {nombre} {fecha}
      var msgAtr = '', msgProx = '', msgCum = '';
      try {
        var wsCfgM = ss.getSheetByName('⚙ CONFIGURACION');
        if (wsCfgM) {
          var cfgDataM = wsCfgM.getDataRange().getValues();
          for (var cm = 0; cm < cfgDataM.length; cm++) {
            var kM = (cfgDataM[cm][0]||'').toString().toUpperCase();
            if (kM.indexOf('MENSAJE ATRASADAS') >= 0) msgAtr = (cfgDataM[cm][1]||'').toString();
            else if (kM.indexOf('MENSAJE PR') >= 0) msgProx = (cfgDataM[cm][1]||'').toString();
            else if (kM.indexOf('MENSAJE CUMPLE') >= 0) msgCum = (cfgDataM[cm][1]||'').toString();
          }
          if (!msgAtr || !msgProx || !msgCum) {
            if (!msgAtr && !msgProx) {
              var lastCfgM = wsCfgM.getLastRow();
              wsCfgM.getRange(lastCfgM + 2, 1).setValue('  MENSAJES DE SEGUIMIENTO (WhatsApp) — editar col B; usa {nombre} y {fecha}').setFontWeight('bold');
            }
            if (!msgAtr) {
              msgAtr = 'Hola {nombre} 🌸 ¡Te saludamos de Sunsu Spa! Ya pasó la fecha recomendada para tu próximo facial ({fecha}) y no queremos que tu piel pierda el avance que llevamos. ¿Te ayudo a agendar tu cita? 💆‍♀️✨';
              wsCfgM.appendRow(['MENSAJE ATRASADAS', msgAtr]);
            }
            if (!msgProx) {
              msgProx = 'Hola {nombre} 🌸 ¡Te saludamos de Sunsu Spa! Se acerca la fecha ideal para tu próximo facial ({fecha}). ¿Quieres que te reserve un espacio esta semana? 💆‍♀️✨';
              wsCfgM.appendRow(['MENSAJE PRÓXIMAS', msgProx]);
            }
            if (!msgCum) {
              msgCum = 'Hola {nombre} 🌸 ¡Este es el mes de tu cumpleaños! 🎂 En Sunsu te deseamos un feliz cumpleaños 🎉 Por tu mes puedes recibir una cortesía en topping en tu siguiente cita agendada dentro de tu mes. ¿Te gustaría que agendemos? 💆‍♀️✨';
              wsCfgM.appendRow(['MENSAJE CUMPLEAÑOS', msgCum]);
            }
          }
        }
      } catch(eMsg) {}

      // ── Cumpleañeras del mes (REGISTRO col E) ──
      var cumples = [];
      try {
        var wsRegC = ss.getSheetByName('REGISTRO');
        if (wsRegC) {
          var regDataC = wsRegC.getDataRange().getValues();
          var mesHoy = new Date().getMonth();
          var vistasC = {};
          for (var rc = 1; rc < regDataC.length; rc++) {
            var fnac = regDataC[rc][4];
            if (!(fnac instanceof Date)) continue;
            if (fnac.getMonth() !== mesHoy) continue;
            var cedC = (regDataC[rc][1]||'').toString().trim().split('.')[0];
            var nomC = (regDataC[rc][2]||'').toString().trim();
            var apeC = (regDataC[rc][3]||'').toString().trim();
            var keyC = cedC || (nomC+' '+apeC).toLowerCase();
            if (!keyC || vistasC[keyC]) continue;
            vistasC[keyC] = true;
            var fullC = _normNombre_(nomC+' '+apeC);
            cumples.push({
              nombre: nomC, apellido: apeC, cedula: cedC,
              dia: fnac.getDate(),
              telefono: (cedC && telReg.porCedula[cedC]) || telReg.porNombre[fullC] || telMap[fullC] || '',
            });
          }
          cumples.sort(function(a,b){ return a.dia - b.dia; });
        }
      } catch(eCum) {}

      // ── Estadísticas de efectividad del mes (desde la memoria de seguimiento) ──
      var statsM = {agendadas:0, noDesea:0, sinRespuesta:0, intentos:0};
      try {
        var mesStr = Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM');
        Object.keys(segStoreS).forEach(function(kSt){
          var rSt = segStoreS[kSt];
          if (!rSt.ts || rSt.ts.indexOf(mesStr) !== 0) return;
          if (rSt.r === 'ag') statsM.agendadas++;
          else if (rSt.r === 'nd') statsM.noDesea++;
          else if (rSt.r === 'sr') statsM.sinRespuesta++;
          else if (rSt.r === 'nc') statsM.intentos++;
        });
      } catch(eStat) {}
      var waCumS = {};
      try { waCumS = JSON.parse(PropertiesService.getScriptProperties().getProperty('SUNSU_CUMPLE_WA')||'{}'); } catch(eWC) {}
      return respJsonGet({items: itemsS, cumples: cumples, waCumples: waCumS, stats: statsM, msgAtrasada: msgAtr, msgProxima: msgProx, msgCumple: msgCum, hoy: Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM-dd')}, callback);
    }

    // ── Control de comisión de recepción (Alejandra) — detalle por día ──
    if (action === 'getComisionRecepcion') {
      var hoyR = new Date();
      var diaR = hoyR.getDate(), mesR = hoyR.getMonth(), anioR = hoyR.getFullYear();
      var fIniR, fFinR;
      if (diaR >= 26) {
        fIniR = new Date(anioR, mesR, 26, 0,0,0);
        fFinR = new Date(anioR, mesR+1, 25, 23,59,59);
      } else {
        fIniR = new Date(anioR, mesR-1, 26, 0,0,0);
        fFinR = new Date(anioR, mesR, 25, 23,59,59);
      }
      var mesesR = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
      var resR = calcularComisionRecepcion(fIniR, fFinR);
      return respJsonGet({
        dias: resR.dias,
        total: resR.total,
        diasCumplidos: resR.diasCumplidos,
        porClienta: CONFIG.RECEP_COM_POR_CLIENTA,
        meta: CONFIG.RECEP_MIN_CLIENTAS,
        metaLunes: CONFIG.RECEP_MIN_CLIENTAS_LUNES,
        periodoLabel: mesesR[fIniR.getMonth()]+' 26 — '+mesesR[fFinR.getMonth()]+' 25, '+fFinR.getFullYear(),
      }, callback);
    }

    // ── 5. Historial de tickets ──
    if (action === 'getHistorial') {
      var wsT = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsT) return respJsonGet({error:'No TICKET_FICHA'}, callback);
      // Nombres del catálogo por código (col A → col B), para mostrar nombres y no códigos
      var nombresCatH = {};
      try {
        var wsCatH = ss.getSheets().find(function(s){ return s.getName().includes('CATALOGO'); });
        if (wsCatH) {
          var dCatH = wsCatH.getDataRange().getValues();
          for (var ch = 2; ch < dCatH.length; ch++) {
            var cH = (dCatH[ch][0]||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'');
            if (cH) nombresCatH[cH] = (dCatH[ch][1]||'').toString().trim();
          }
        }
      } catch(eCatH) {}
      var tData = wsT.getDataRange().getValues();
      var tHeaders = tData[0];
      // Find product columns (headers like HT-002, AS-001 etc)
      var prodCols = [];
      for (var pi=0; pi<tHeaders.length; pi++) {
        var ph = (tHeaders[pi]||'').toString().trim();
        if (ph.match(/^[A-Z]{2,3}-\d+/)) prodCols.push({idx:pi, sku:'SUNSU-'+ph}); // 2 o 3 letras (SU-, HT-, CRE-...)
      }
      var EXCLH = exclColsFromHeaders_(tHeaders);
      var colCompH = 0;
      for (var hch = 0; hch < tHeaders.length; hch++) { if ((tHeaders[hch]||'').toString().toUpperCase().indexOf('COMPROBANTE') >= 0) { colCompH = hch + 1; break; } }
      var colFotosH = 0, colFotosAH = 0, colFotosDH = 0;
      for (var hfh = 0; hfh < tHeaders.length; hfh++) {
        var hFo = (tHeaders[hfh]||'').toString().toUpperCase();
        if (hFo === 'FOTOS') colFotosH = hfh + 1;
        else if (hFo === 'FOTOS ANTES') colFotosAH = hfh + 1;
        else if (hFo === 'FOTOS DESPUES') colFotosDH = hfh + 1;
      }
      var tickets = [];
      for (var ti=1; ti<tData.length; ti++) {
        var row = tData[ti];
        var tsV = row[0];
        if (!tsV) continue;
        // Parse timestamp
        var tsDate = tsV instanceof Date ? tsV : new Date(tsV);
        if (isNaN(tsDate.getTime())) continue;
        // Format fecha as YYYY-MM-DD for filtering, hora as HH:mm
        var fechaStr = Utilities.formatDate(tsDate, 'America/Guayaquil', 'yyyy-MM-dd');
        var horaStr  = Utilities.formatDate(tsDate, 'America/Guayaquil', 'HH:mm');
        // Products sold — con su NOMBRE del catálogo (nunca el código)
        var prodsVendidos = [];
        prodCols.forEach(function(pc){
          var qty = parseInt(row[pc.idx]) || 0;
          if (qty > 0) {
            var nomP = (nombresCatH[pc.sku.toUpperCase().replace(/^SUNSU-/,'')] || pc.sku);
            prodsVendidos.push(nomP + ' ×' + qty);
          }
        });
        tickets.push({
          fecha:            fechaStr,
          hora:             horaStr,
          tkRow:            ti + 1,
          cosmetologa:      (row[1]||'').toString().trim(),
          cedula:           (row[2]||'').toString().trim(),
          nombre:           (row[3]||'').toString().trim(),
          apellido:         (row[4]||'').toString().trim(),
          estimado:         (row[9]||'').toString().trim(),
          facial:           (row[19]||'').toString().trim(),
          pack3:            (row[20]||'').toString().trim(),
          pack6:            (row[21]||'').toString().trim(),
          extras:           (row[22]||'').toString().trim(),
          colQ:             (row[16]||'').toString().trim(),
          colR:             (row[17]||'').toString().trim(),
          colS:             (row[18]||'').toString().trim(),
          recomendaciones:  (row[13]||'').toString().trim(),
          notas:            (row[14]||'').toString().trim(),
          retorno:          row[10] instanceof Date ? Utilities.formatDate(row[10],'America/Guayaquil','yyyy-MM-dd') : (row[10]||'').toString().trim(),
          productos:        prodsVendidos,
          exclFacial:       row[EXCLH.facial-1]===true||row[EXCLH.facial-1]==='TRUE'||row[EXCLH.facial-1]===1,
          exclPaquete:      row[EXCLH.paquete-1]===true||row[EXCLH.paquete-1]==='TRUE'||row[EXCLH.paquete-1]===1,
          exclProducto:     row[EXCLH.producto-1]===true||row[EXCLH.producto-1]==='TRUE'||row[EXCLH.producto-1]===1,
          exclExtras:       row[EXCLH.extras-1]===true||row[EXCLH.extras-1]==='TRUE'||row[EXCLH.extras-1]===1,
          comprobante:      colCompH ? (row[colCompH-1]||'').toString().trim() : '',
          fotos:            colFotosH ? (row[colFotosH-1]||'').toString().trim() : '',
          fotosAntes:       colFotosAH ? (row[colFotosAH-1]||'').toString().trim() : '',
          fotosDespues:     colFotosDH ? (row[colFotosDH-1]||'').toString().trim() : '',
        });
      }
      // Teléfono por ticket, resuelto AQUÍ (Acuity primero — es donde se actualizan;
      // luego REGISTRO). Una sola lógica de nombres: la del servidor.
      try {
        var telAcuH = getTelefonosAcuity_() || {};
        var telKeysH = Object.keys(telAcuH);
        var telRegH = getTelefonosRegistro_(ss);
        tickets.forEach(function(tk){
          var fullH = _normNombre_((tk.nombre||'')+' '+(tk.apellido||''));
          var telH = telAcuH[fullH] || '';
          if (!telH) {
            var pnH = _normNombre_(tk.nombre).split(' ')[0], paH = _normNombre_(tk.apellido).split(' ')[0];
            if (pnH && paH) for (var tkH = 0; tkH < telKeysH.length; tkH++) {
              if (telKeysH[tkH].indexOf(pnH) === 0 && telKeysH[tkH].indexOf(paH) >= 0) { telH = telAcuH[telKeysH[tkH]]; break; }
            }
          }
          if (!telH) telH = (telRegH.porCedula||{})[(tk.cedula||'').split('.')[0]] || (telRegH.porNombre||{})[fullH] || '';
          tk.telefono = telH;
        });
      } catch(eTelH) {}
      // Return most recent first
      tickets.reverse();
      return respJsonGet(tickets, callback);
    }


    // ── Caja Chica: registrar gasto vía GET ──
    if (action === 'cajaGasto') {
      try {
        var cgDesc  = (e.parameter.desc   || '').toString().trim();
        var cgMonto = parseFloat(e.parameter.monto || 0);
        var cgQuien = (e.parameter.quien  || '').toString().trim();
        var cgJustif= (e.parameter.justif || '').toString().trim();
        var cgRegPor= (e.parameter.registradoPor || '').toString().trim();
        var cgTs    = (e.parameter.tsApp  || '').toString().trim();
        var cgRes   = registrarGastoSidebar(cgDesc, cgMonto, cgQuien, cgJustif, cgRegPor, cgTs);
        return respJsonGet({ok:true, msg:cgRes}, callback);
      } catch(cgErr) {
        return respJsonGet({error: cgErr.message}, callback);
      }
    }

    // ── Caja Chica: registrar depósito vía GET ──
    if (action === 'cajaDeposito') {
      try {
        var cdMonto   = parseFloat(e.parameter.monto    || 0);
        var cdEntrega = (e.parameter.entrega  || '').toString().trim();
        var cdDep     = (e.parameter.deposita || '').toString().trim();
        var cdBanco   = (e.parameter.banco    || '').toString().trim();
        var cdRegPor  = (e.parameter.registradoPor || '').toString().trim();
        var cdTs      = (e.parameter.tsApp    || '').toString().trim();
        var cdRes     = registrarDepositoSidebar(cdMonto, cdEntrega, cdDep, cdBanco, cdRegPor, cdTs);
        return respJsonGet({ok:true, msg:cdRes}, callback);
      } catch(cdErr) {
        return respJsonGet({error: cdErr.message}, callback);
      }
    }

    // ── Caja Chica: sincronizar efectivo vía GET ──
    if (action === 'cajaSync') {
      try {
        sincronizarEfectivo();
        var wsCajaSync = ss.getSheetByName(CAJA_SHEET);
        var saldoSync  = wsCajaSync ? getSaldoActual(wsCajaSync) : 0;
        return respJsonGet({ok:true, msg:'✅ Sincronizado — Saldo: $' + saldoSync.toFixed(2), saldo: saldoSync}, callback);
      } catch(syncErr) {
        return respJsonGet({error: syncErr.message}, callback);
      }
    }

    // ── Caja Chica: movimientos del día ──
    if (action === 'getCajaMovimientos') {
      var wsCM = ss.getSheetByName(CAJA_SHEET);
      if (!wsCM) return respJsonGet({error:'No CAJA CHICA'}, callback);
      // Generar múltiples variantes de la fecha de hoy para comparar
      var hoyFmt1 = Utilities.formatDate(new Date(), 'America/Guayaquil', 'MM/dd/yyyy'); // 05/27/2026
      var hoyFmt2 = Utilities.formatDate(new Date(), 'America/Guayaquil', 'M/d/yyyy');   // 5/27/2026
      var hoyFmt3 = Utilities.formatDate(new Date(), 'America/Guayaquil', 'yyyy-MM-dd'); // 2026-05-27
      var hoyFmt4 = Utilities.formatDate(new Date(), 'America/Guayaquil', 'd/M/yyyy');   // 27/5/2026
      var lastCM = wsCM.getLastRow();
      var movs = [];
      if (lastCM >= CAJA_DATA_START) {
        var cajaData = wsCM.getRange(CAJA_DATA_START, 1, lastCM - CAJA_DATA_START + 1, 13).getValues();
        cajaData.forEach(function(row, i) {
          var ts = (row[0]||'').toString().trim();
          var esHoy = ts && (
            ts.indexOf(hoyFmt1) >= 0 ||
            ts.indexOf(hoyFmt2) >= 0 ||
            ts.indexOf(hoyFmt3) >= 0 ||
            ts.indexOf(hoyFmt4) >= 0 ||
            ts.indexOf(hoyFmt1.slice(0,5)) >= 0 ||
            ts.indexOf(hoyFmt2.slice(0,3)) >= 0
          );
          if (!esHoy) return;
          var tipo = (row[1]||'').toString().trim();
          if (!tipo) return;
          movs.push({
            ts:          ts,
            tipo:        tipo,
            desc:        (row[2]||'').toString().trim(),
            quien:       (row[3]||'').toString().trim(),
            monto:       parseFloat(row[5])||0,
            saldo:       parseFloat(row[7])||0,
            notas:       (row[8]||'').toString().trim(),
            registradoPor: (row[11]||'').toString().trim(),
            tsApp:       (row[12]||'').toString().trim(),
          });
        });
      }
      var saldoActual = getSaldoActual(wsCM);
      return respJsonGet({movimientos: movs, saldo: saldoActual}, callback);
    }

    var wsDefault = ss.getSheetByName('CITAS_HOY');
    var dataDefault = wsDefault ? (wsDefault.getRange(1,1).getValue() || '[]') : '[]';
    var output = ContentService.createTextOutput(callback ? callback+'('+dataDefault+')' : dataDefault);
    output.setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
    return output;

  } catch(err) {
    return respJsonGet({error: err.message}, callback);
  }
}

function respJsonGet(obj, callback) {
  var json = JSON.stringify(obj);
  var out  = ContentService.createTextOutput(callback ? callback+'('+json+')' : json);
  out.setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  return out;
}

// ============================================================
// doPost — recibe tickets desde la app móvil
// COLUMNAS: A=Timestamp B=Cosmetologa C=Cedula D=Nombre E=Apellido
//           J=Estimado K=FechaRetorno N=Recomendaciones O=Notas
//           Q=Paquete R=CanjeGC S=VentaGC T=Facial U=Pack3 V=Pack6
//           W=Extras  Y..BB=Productos
// F,G,H,I NO SE TOCAN (tienen fórmulas/checkboxes del sheet)
// ============================================================
function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── Caja Chica Web App POST ──
    var body = JSON.parse(e.postData.contents);
    if (body.cajaAction) {
      var result = '';
      if (body.cajaAction === 'gasto') {
        result = registrarGastoSidebar(body.desc, parseFloat(body.monto)||0, body.quien, body.justif, body.registradoPor||'', body.tsApp||'');
      } else if (body.cajaAction === 'deposito') {
        result = registrarDepositoSidebar(parseFloat(body.monto)||0, body.entrega, body.deposita, body.banco, body.registradoPor||'', body.tsApp||'');
      } else if (body.cajaAction === 'sync') {
        sincronizarEfectivo();
        var wsCajaS = ss.getSheetByName(CAJA_SHEET);
        var saldoS  = wsCajaS ? getSaldoActual(wsCajaS) : 0;
        result = '✅ Sincronizado — Saldo: $' + saldoS.toFixed(2);
      } else if (body.cajaAction === 'saldo') {
        var wsCaja = ss.getSheetByName(CAJA_SHEET);
        var saldo  = wsCaja ? getSaldoActual(wsCaja) : 0;
        result = JSON.stringify({saldo: saldo});
      }
      return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.TEXT);
    }

    // ── Registrar multa / descuento ──
    // ── TARJETA DE REGISTRO: nueva clienta escrita en REGISTRO, columna a columna ──
    if (body.accion === 'registrarCliente') {
      var wsRC = ss.getSheetByName('REGISTRO');
      if (!wsRC) return respJson({error:'No existe la hoja REGISTRO'});
      var dRC = wsRC.getDataRange().getValues();
      var headsRC = dRC[0].map(function(h){return (h||'').toString().toUpperCase();});
      var cedRC = (body.cedula||'').toString().trim();
      if (!cedRC || !(body.nombre||'').toString().trim()) return respJson({error:'Cédula y nombre son obligatorios'});
      // ¿Ya existe la cédula? (aviso, salvo que venga forzar)
      var filaExRC = -1;
      var cedNormRC = cedRC.split('.')[0].replace(/[^0-9]/g,'').replace(/^0+/,'');
      for (var rc = 1; rc < dRC.length; rc++) {
        var cRowRC = (dRC[rc][1]||'').toString().split('.')[0].replace(/[^0-9]/g,'').replace(/^0+/,'');
        if (cRowRC && cRowRC === cedNormRC) { filaExRC = rc + 1; break; }
      }
      // Dos casos si la cedula ya existe:
      //   CON timestamp en col A → ya se registro de verdad → bloquear (familia Sunsu)
      //   SIN timestamp → es de la base antigua migrada → dejarla COMPLETAR su
      //   registro sobre esa misma fila (sin duplicarla)
      var completarFilaRC = 0;
      if (filaExRC > 0) {
        var tsExRC = dRC[filaExRC-1][0];
        var tieneTsRC = (tsExRC instanceof Date) || (tsExRC!=null && String(tsExRC).trim()!=='');
        if (tieneTsRC) {
          if (!body.forzar) return respJson({existe:true, yaRegistrada:true, fila:filaExRC});
        } else {
          completarFilaRC = filaExRC;
        }
      }
      // Asegurar columnas TELÉFONO y AUTORIZA FOTOS (se crean al final si faltan)
      var buscaCol = function(claves){
        for (var c = 0; c < headsRC.length; c++) {
          for (var k = 0; k < claves.length; k++) if (headsRC[c].indexOf(claves[k]) >= 0) return c;
        }
        return -1;
      };
      var colTelRC = buscaCol(['TELEF','TELÉF','CELULAR','WHATSAPP','PHONE']);
      if (colTelRC < 0) {
        colTelRC = headsRC.length;
        wsRC.getRange(1, colTelRC+1).setValue('TELÉFONO').setFontWeight('bold');
        headsRC.push('TELÉFONO');
      }
      var colFotRC = buscaCol(['AUTORIZA','FOTOGRAF']);
      if (colFotRC < 0) {
        colFotRC = headsRC.length;
        wsRC.getRange(1, colFotRC+1).setValue('AUTORIZA FOTOS').setFontWeight('bold');
        headsRC.push('AUTORIZA FOTOS');
      }
      var colConRC = buscaCol(['CONSENT']);
      if (colConRC < 0) {
        colConRC = headsRC.length;
        wsRC.getRange(1, colConRC+1).setValue('CONSENTIMIENTO').setFontWeight('bold');
        headsRC.push('CONSENTIMIENTO');
      }
      var colFirRC = buscaCol(['FIRMA']);
      if (colFirRC < 0) {
        colFirRC = headsRC.length;
        wsRC.getRange(1, colFirRC+1).setValue('FIRMA').setFontWeight('bold');
        headsRC.push('FIRMA');
      }
      // Fila nueva mapeada por encabezado (mismo orden que el forms)
      var filaRC = new Array(headsRC.length).fill('');
      var pon = function(claves, val){ var c = buscaCol(claves); if (c >= 0) filaRC[c] = val; };
      filaRC[0] = new Date();                                   // Marca temporal
      pon(['DULA'], cedRC);                                     // Cédula
      pon(['NOMBRE'], (body.nombre||'').toString().trim());
      pon(['APELLIDO'], (body.apellido||'').toString().trim());
      pon(['NACIMIENTO'], (body.nacimiento||'').toString().trim());
      pon(['SECTOR'], (body.sector||'').toString().trim());
      pon(['PIEL'], (body.tipoPiel||'').toString());
      pon(['ESTADO'], (body.estado||'').toString());
      pon(['ALERGIA'], (body.alergias||'').toString().trim());
      pon(['MEDICACI'], (body.medicacion||'').toString().trim());
      pon(['CONDICION'], (body.condiciones||'').toString().trim());
      pon(['REACCION'], (body.reacciones||'').toString());
      pon(['EXFOL','RETIN'], (body.retinoides||'').toString());
      pon(['CICLO','MESTR','MENSTR'], (body.ciclo||'').toString());
      pon(['EXTRACC'], (body.extracciones||'').toString());
      pon(['CORTES'], (body.cortesia||'').toString());
      filaRC[colTelRC] = (body.telefono||'').toString().trim();
      filaRC[colFotRC] = (body.autorizaFotos||'').toString();
      filaRC[colConRC] = (body.consentimiento==='SI') ? ('SI — ' + Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm')) : '';
      filaRC[colFirRC] = (body.firma||'').toString().trim();
      if (completarFilaRC > 0 && body.forzar !== 'actualizar') {
        // Completar la fila migrada: timestamp de hoy + lo que el form trajo.
        // Celda por celda para no pisar formulas ni datos viejos que el form no cubre.
        wsRC.getRange(completarFilaRC, 1).setValue(new Date());
        for (var fcm = 1; fcm < filaRC.length; fcm++) if (filaRC[fcm] !== '') wsRC.getRange(completarFilaRC, fcm+1).setValue(filaRC[fcm]);
        return respJson({ok:true, completado:true, fila:completarFilaRC});
      }
      if (filaExRC > 0 && body.forzar === 'actualizar') {
        // Actualizar la fila existente (sin tocar la marca temporal original)
        for (var fc = 1; fc < filaRC.length; fc++) if (filaRC[fc] !== '') wsRC.getRange(filaExRC, fc+1).setValue(filaRC[fc]);
        return respJson({ok:true, actualizado:true, fila:filaExRC});
      }
      // ── INSERTAR tras el último registro REAL (el último con Marca temporal en col A) ──
      // Así la base antigua de abajo (sin timestamp) se desplaza INTACTA, y no caemos
      // al fondo de la hoja donde las fórmulas pre-arrastradas engañan al appendRow.
      var ultimaRealRC = 1;
      for (var ur = 1; ur < dRC.length; ur++) {
        if (dRC[ur][0] !== '' && dRC[ur][0] !== null) ultimaRealRC = ur + 1; // 1-based
      }
      wsRC.insertRowAfter(ultimaRealRC);
      var nuevaRC = ultimaRealRC + 1;
      wsRC.getRange(nuevaRC, 1, 1, filaRC.length).setValues([filaRC]);
      // Copiar las FÓRMULAS de la fila real anterior (p. ej. edad en col 18, fecha en col 19)
      // con referencias ajustadas — solo en columnas donde no escribimos valor propio.
      try {
        var formsRC = wsRC.getRange(ultimaRealRC, 1, 1, filaRC.length).getFormulas()[0];
        for (var fx = 0; fx < formsRC.length; fx++) {
          if (formsRC[fx] && filaRC[fx] === '') {
            wsRC.getRange(ultimaRealRC, fx+1).copyTo(wsRC.getRange(nuevaRC, fx+1), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
          }
        }
      } catch(eFm) {}
      return respJson({ok:true, fila:nuevaRC});
    }

    // ── Marcar la tarjeta de tratamiento de un ticket como ENVIADA ──
    // ── Marcar la etiqueta de una cita en Acuity (confirmacion de citas) ──
    // Acuity admite UNA etiqueta por cita: el PUT reemplaza la anterior, que es
    // justo el comportamiento que queremos (ESPERANDO -> CONFIRMADA -> COMPLETADO -> AZUL).
    // La etiqueta se busca por PREFIJO, no por nombre exacto, para no depender de
    // como este escrita en Acuity (p.ej. 'ESPERANDO CONFIR' o 'ESPERANDO CONFIRMACION').
    if (body.accion === 'marcarEtiquetaAcuity') {
      var aptIdAE = (body.aptId||'').toString().trim();
      var etqAE   = (body.etiqueta||'').toString().trim().toUpperCase();
      if (!aptIdAE || !etqAE) return respJson({error:'Falta la cita o la etiqueta'});
      var propAE = PropertiesService.getScriptProperties();
      var uidAE = propAE.getProperty('ACUITY_UID'), keyAE = propAE.getProperty('ACUITY_KEY');
      if (!uidAE || !keyAE) return respJson({error:'Sin credenciales Acuity configuradas'});
      var authAE = {'Authorization':'Basic '+Utilities.base64Encode(uidAE+':'+keyAE)};
      var labelIdAE = null, labelNomAE = '';
      try {
        var labsAE = JSON.parse(UrlFetchApp.fetch('https://acuityscheduling.com/api/v1/labels',
          {headers:authAE, muteHttpExceptions:true}).getContentText());
        for (var laI = 0; laI < labsAE.length; laI++) {
          if ((labsAE[laI].name||'').toUpperCase().indexOf(etqAE) >= 0) {
            labelIdAE = labsAE[laI].id; labelNomAE = labsAE[laI].name; break;
          }
        }
      } catch(eLAE) {}
      if (!labelIdAE) return respJson({error:'No encontre la etiqueta '+etqAE+' en Acuity'});
      var rAE = UrlFetchApp.fetch('https://acuityscheduling.com/api/v1/appointments/'+aptIdAE+'?admin=true', {
        method:'put', contentType:'application/json', headers:authAE,
        payload:JSON.stringify({labels:[{id:labelIdAE}]}), muteHttpExceptions:true
      });
      var codAE = rAE.getResponseCode();
      if (codAE < 200 || codAE >= 300) return respJson({error:'Acuity respondio '+codAE});
      try { logAccion_(ss, 'ETIQUETA ACUITY', labelNomAE+' - cita '+aptIdAE, body.usuario); } catch(eLg) {}
      return respJson({ok:true, etiqueta:labelNomAE});
    }

    if (body.accion === 'marcarTarjetaEnviada') {
      var keyTE = (body.clave||'').toString().trim();
      if (!keyTE) return respJson({error:'Falta la clave'});
      var propTE = PropertiesService.getScriptProperties();
      var mapTE = {};
      try { mapTE = JSON.parse(propTE.getProperty('SUNSU_TARJETAS_ENV')||'{}'); } catch(eTE) {}
      var fTE = Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm');
      mapTE[keyTE] = { f: fTE, por: (body.usuario||'') };
      propTE.setProperty('SUNSU_TARJETAS_ENV', JSON.stringify(mapTE));
      // ── AUDITORÍA: registro permanente del envío (quién, cuándo, a qué número, qué) ──
      try {
        var wsEnv = ss.getSheetByName('📤 ENVÍOS TARJETAS');
        if (!wsEnv) {
          wsEnv = ss.insertSheet('📤 ENVÍOS TARJETAS');
          wsEnv.getRange(1,1,1,8).setValues([['FECHA ENVÍO','CLIENTA','CÉDULA','TELÉFONO','QUÉ SE ENVIÓ','FECHA DEL TICKET','ENVIADO POR','CLAVE']])
            .setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
          wsEnv.setFrozenRows(1);
        }
        wsEnv.appendRow([
          new Date(),
          (body.clienta||'').toString(),
          (body.cedula||'').toString(),
          (body.telefono||'').toString(),
          (body.contenido||'Tarjeta de tratamiento').toString(),
          (body.fechaTicket||'').toString(),
          (body.usuario||'').toString(),
          keyTE
        ]);
        wsEnv.getRange(wsEnv.getLastRow(),1).setNumberFormat('dd/mm/yyyy hh:mm');
      } catch(eAudE) {}
      return respJson({ok:true, fecha:fTE});
    }

    // ── Aprobación digital del rol de pagos (la chica acepta su rol desde el app) ──
    if (body.accion === 'aprobarRol') {
      var shAR = (body.sheet||'').toString().trim();
      var cedAR = (body.cedula||'').toString().trim().replace('.','');
      var nomAR = (body.nombre||'').toString().trim();
      if (!shAR || !cedAR) return respJson({error:'Faltan datos del rol'});
      var wsAR = ss.getSheetByName('✅ ROLES APROBADOS');
      if (!wsAR) {
        wsAR = ss.insertSheet('✅ ROLES APROBADOS');
        wsAR.getRange(1,1,1,5).setValues([['FECHA','ROL (MES)','CÉDULA','NOMBRE','APROBADO DESDE']])
          .setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
        wsAR.setFrozenRows(1);
      }
      var dAR = wsAR.getDataRange().getValues();
      for (var ar = 1; ar < dAR.length; ar++) {
        if ((dAR[ar][1]||'').toString().trim() === shAR && (dAR[ar][2]||'').toString().replace('.','') === cedAR) {
          var fYa = dAR[ar][0] instanceof Date ? Utilities.formatDate(dAR[ar][0],'America/Guayaquil','dd/MM/yyyy HH:mm') : (dAR[ar][0]||'').toString();
          return respJson({ok:true, ya:true, fecha:fYa});
        }
      }
      var ahoraAR = new Date();
      wsAR.appendRow([ahoraAR, shAR, cedAR, nomAR, (body.usuario||'app')]);
      wsAR.getRange(wsAR.getLastRow(),1).setNumberFormat('dd/mm/yyyy hh:mm');
      try { logAccion_(ss, 'ROLES', '✅ '+nomAR+' aprobó su rol '+shAR, nomAR); } catch(eAR) {}
      return respJson({ok:true, fecha:Utilities.formatDate(ahoraAR,'America/Guayaquil','dd/MM/yyyy HH:mm')});
    }

    // ── CATÁLOGO desde el app: crear producto completo ──
    // Escribe la fila en CATALOGO (copiando las fórmulas de IVA/total/utilidad/comisión
    // de la fila anterior), agrega la columna al FINAL de los productos en TICKET_FICHA
    // (nada se corre — todo el sistema lee por encabezado) y crea la fila en INVENTARIO.
    if (body.accion === 'crearProductoApp') {
      var codNP = (body.sku||'').toString().trim().toUpperCase().replace(/^SUNSU-/,''); // acepta con o sin prefijo
      if (!/^[A-Z]{2,3}-\d{3}$/.test(codNP)) return respJson({error:'SKU inválido — formato FAM-### (ej. HT-015)'});
      var nomNP = (body.nombre||'').toString().trim();
      if (!nomNP) return respJson({error:'Falta el nombre'});
      var subNP = parseFloat(body.subtotal)||0;
      var compCatNP = parseFloat(body.compraCat)||0;
      var compProvNP = parseFloat(body.compraProv)||0;
      var comNP = body.comision!==''&&body.comision!==undefined&&body.comision!==null ? parseFloat(body.comision) : null;
      var wsCatNP = ss.getSheets().find(function(s){ return s.getName().includes('CATALOGO'); });
      if (!wsCatNP) return respJson({error:'No existe CATALOGO'});
      // Duplicado?
      var dCatNP = wsCatNP.getDataRange().getValues();
      for (var dn = 2; dn < dCatNP.length; dn++) {
        if ((dCatNP[dn][0]||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'') === codNP) return respJson({error:'El SKU '+codNP+' ya existe en el catálogo'});
      }
      // 1) CATALOGO: nueva fila con fórmulas heredadas de la fila anterior.
      // El código se escribe con el MISMO formato que ya usa la col A (con o sin prefijo SUNSU-)
      var usaPrefijo = false;
      for (var pf = 2; pf < dCatNP.length; pf++) {
        var c0 = (dCatNP[pf][0]||'').toString().trim();
        if (c0) { usaPrefijo = /^SUNSU-/i.test(c0); break; }
      }
      var codEscribir = usaPrefijo ? ('SUNSU-'+codNP) : codNP;
      // Insertar DESPUÉS del último producto de su familia (organización);
      // si la familia es nueva, va al final del catálogo
      var famNP = codNP.split('-')[0];
      var ultFamCat = 0;
      for (var uf = 2; uf < dCatNP.length; uf++) {
        var cUf = (dCatNP[uf][0]||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'');
        if (cUf.indexOf(famNP+'-') === 0) ultFamCat = uf + 1; // 1-based
      }
      var fNP, prevNP;
      if (ultFamCat) {
        wsCatNP.insertRowAfter(ultFamCat);
        fNP = ultFamCat + 1;
        prevNP = ultFamCat; // plantilla de fórmulas: el último de la misma familia
      } else {
        fNP = wsCatNP.getLastRow() + 1;
        prevNP = fNP - 1;
      }
      wsCatNP.getRange(fNP,1,1,4).setValues([[codEscribir, nomNP, (body.tipo||'PRODUCTO'), subNP]]);
      var formPrev = prevNP > 2 ? wsCatNP.getRange(prevNP,1,1,10).getFormulas()[0] : [];
      // E (IVA) y F (total): heredar fórmula o calcular
      if (formPrev[4]) wsCatNP.getRange(prevNP,5).copyTo(wsCatNP.getRange(fNP,5));
      else wsCatNP.getRange(fNP,5).setValue(Math.round(subNP*0.15*100)/100);
      if (formPrev[5]) wsCatNP.getRange(prevNP,6).copyTo(wsCatNP.getRange(fNP,6));
      else wsCatNP.getRange(fNP,6).setValue(Math.round(subNP*1.15*100)/100);
      wsCatNP.getRange(fNP,7).setValue(compCatNP); // G compra (utilidad/comisiones)
      // H (utilidad): heredar fórmula o calcular subtotal - compra
      if (formPrev[7]) wsCatNP.getRange(prevNP,8).copyTo(wsCatNP.getRange(fNP,8));
      else wsCatNP.getRange(fNP,8).setValue(Math.round((subNP-compCatNP)*100)/100);
      // I (comisión): valor manual si vino; si no, heredar fórmula
      if (comNP !== null && !isNaN(comNP)) wsCatNP.getRange(fNP,9).setValue(comNP);
      else if (formPrev[8]) wsCatNP.getRange(prevNP,9).copyTo(wsCatNP.getRange(fNP,9));
      wsCatNP.getRange(fNP,10).insertCheckboxes().check(); // J activo ✓
      // 2) TICKET_FICHA: columna nueva DESPUÉS de la última de su FAMILIA
      // (familia nueva → al final de todos los productos). Es seguro porque:
      // (a) Google Sheets auto-ajusta las fórmulas de otras hojas al insertar columnas,
      // (b) el servidor escribe los tickets con el mapa construido desde los ENCABEZADOS
      //     al momento de escribir (el mapa del cliente es solo respaldo), y
      // (c) todas las lecturas de productos son por encabezado, no por índice fijo.
      var wsTkNP = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      var hdrNP = wsTkNP.getRange(1,1,1,wsTkNP.getLastColumn()).getValues()[0];
      var ultProd = 0, ultFamTk = 0;
      for (var hn = 0; hn < hdrNP.length; hn++) {
        var hTk = (hdrNP[hn]||'').toString().trim().toUpperCase();
        if (/^[A-Z]{2,3}-\d{3}$/.test(hTk)) {
          ultProd = hn + 1;
          if (hTk.indexOf(famNP+'-') === 0) ultFamTk = hn + 1;
        }
      }
      if (!ultProd) return respJson({error:'No encontré columnas de producto en TICKET_FICHA'});
      var insTk = ultFamTk || ultProd; // después de su familia; si es familia nueva, al final
      wsTkNP.insertColumnAfter(insTk);
      wsTkNP.getRange(1, insTk+1).setValue(codNP).setFontWeight('bold');
      // 3) INVENTARIO: fila nueva con fórmulas ADAPTADAS automáticamente y stock inicial 0.
      //    - Las fórmulas heredadas que apuntan a la columna del producto anterior en
      //      TICKET_FICHA se reapuntan a la columna NUEVA (sustitución de letra de columna).
      //    - Los valores estáticos copiados del producto anterior se limpian (excepto
      //      el mínimo, que sirve como default) → todo arranca en cero.
      var invWarn = '';
      try {
        var wsInvNP = ss.getSheets().find(function(s){ return s.getName().includes('INVENTARIO'); });
        var nColsInv = wsInvNP.getLastColumn();
        // Buscar el último producto de la misma familia para insertar debajo
        var dInvNP = wsInvNP.getDataRange().getValues();
        var ultFamInv = 0;
        for (var ui = 2; ui < dInvNP.length; ui++) {
          var cUi = (dInvNP[ui][0]||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'');
          if (cUi.indexOf(famNP+'-') === 0) ultFamInv = ui + 1;
        }
        var fInvNP, plantillaInv;
        if (ultFamInv) {
          wsInvNP.insertRowAfter(ultFamInv);
          fInvNP = ultFamInv + 1;
          plantillaInv = ultFamInv; // fórmulas del último de la familia
        } else {
          fInvNP = wsInvNP.getLastRow() + 1;
          plantillaInv = fInvNP - 1;
        }
        wsInvNP.getRange(plantillaInv,1,1,nColsInv).copyTo(wsInvNP.getRange(fInvNP,1));
        // Letras de columna en TICKET_FICHA: la del producto anterior (fila copiada) y la nueva
        var aLetra = function(n){ var s=''; while(n>0){var m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26);} return s; };
        var skuPrevInv = (wsInvNP.getRange(plantillaInv,1).getValue()||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'');
        var colPrevTk = 0;
        for (var hp2 = 0; hp2 < hdrNP.length; hp2++) {
          if ((hdrNP[hp2]||'').toString().trim().toUpperCase() === skuPrevInv) { colPrevTk = hp2+1; break; }
        }
        // OJO: si la columna del producto plantilla quedó DESPUÉS del punto de inserción,
        // se corrió +1 con el insert (Sheets la movió). La plantilla es el último de la
        // MISMA familia (= justo el punto de inserción), así que normalmente no se corre;
        // pero si es familia nueva y la plantilla quedara después, se compensa.
        if (colPrevTk > insTk) colPrevTk += 1;
        var letraPrev = colPrevTk ? aLetra(colPrevTk) : '';
        var letraNueva = aLetra(insTk+1);
        var formsNP = wsInvNP.getRange(fInvNP,1,1,nColsInv).getFormulas()[0];
        for (var cN = 1; cN <= nColsInv; cN++) {
          var fml = formsNP[cN-1];
          if (fml) {
            // Reapuntar referencias a la columna del producto anterior → columna nueva
            if (letraPrev && letraPrev !== letraNueva && fml.toUpperCase().indexOf('TICKET') >= 0) {
              // Reemplaza la letra cuando va precedida de ! : $ , ; ( y NO es parte de
              // otra palabra (cubre BR2, BR:, BR), y BR al final del rango)
              var reLetra = new RegExp('([!:$,;(])' + letraPrev + '(?![A-Za-z])', 'g');
              var fml2 = fml.replace(reLetra, '$1' + letraNueva);
              if (fml2 !== fml) wsInvNP.getRange(fInvNP, cN).setFormula(fml2);
            }
          } else if (cN !== 1 && cN !== 2 && cN !== 7 && cN !== 8 && cN !== 9) {
            // Sin fórmula y no es sku/nombre/compra/mínimo → limpiar el valor copiado
            // (así el stock y todo contador arranca en CERO, no con datos del producto anterior)
            wsInvNP.getRange(fInvNP, cN).setValue('');
          }
        }
        wsInvNP.getRange(fInvNP,1).setValue('SUNSU-'+codNP);
        wsInvNP.getRange(fInvNP,2).setValue(nomNP);
        wsInvNP.getRange(fInvNP,7).setValue(compProvNP); // col G = compra REAL proveedor
        // col H = precio de venta (subtotal s/IVA) — solo si no es fórmula
        if (!wsInvNP.getRange(fInvNP,8).getFormula()) wsInvNP.getRange(fInvNP,8).setValue(subNP);
        // Verificación de stock inicial: si col F quedó con un número distinto de 0, forzar 0
        SpreadsheetApp.flush();
        var stockIni = wsInvNP.getRange(fInvNP,6).getValue();
        var fFml = wsInvNP.getRange(fInvNP,6).getFormula();
        if (!fFml && parseFloat(stockIni)) wsInvNP.getRange(fInvNP,6).setValue(0);
        invWarn = 'Fila '+fInvNP+' en INVENTARIO: fórmulas adaptadas a la columna '+letraNueva+' de TICKET_FICHA y stock inicial en 0'
          + (fFml && parseFloat(wsInvNP.getRange(fInvNP,6).getValue()) ? ' ⚠️ La fórmula de stock no da 0 — revísala una vez.' : ' ✓');
      } catch(eInvN) { invWarn = 'No pude crear la fila en INVENTARIO: '+eInvN.message; }
      try { logAccion_(ss, 'CATALOGO', 'producto nuevo '+codNP+' — '+nomNP+' (venta $'+subNP+' s/IVA)', body.usuario||''); } catch(eLgN) {}
      return respJson({ok:true, sku:codNP, avisoInventario:invWarn});
    }

    // ── CATÁLOGO: editar precios / nombre / comisión de un producto ──
    if (body.accion === 'editarProductoCatalogo') {
      var codEP = (body.sku||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'');
      var wsCatEP = ss.getSheets().find(function(s){ return s.getName().includes('CATALOGO'); });
      if (!wsCatEP) return respJson({error:'No existe CATALOGO'});
      var dCatEP = wsCatEP.getDataRange().getValues();
      var fEP = -1;
      for (var de = 2; de < dCatEP.length; de++) {
        if ((dCatEP[de][0]||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'') === codEP) { fEP = de+1; break; }
      }
      if (fEP < 0) return respJson({error:'SKU no encontrado'});
      if (body.nombre !== undefined && (body.nombre||'').toString().trim()) wsCatEP.getRange(fEP,2).setValue(body.nombre.toString().trim());
      if (body.tipo !== undefined && (body.tipo||'').toString().trim()) wsCatEP.getRange(fEP,3).setValue(body.tipo.toString().trim());
      if (body.subtotal !== undefined) {
        var subEP = parseFloat(body.subtotal)||0;
        wsCatEP.getRange(fEP,4).setValue(subEP);
        // Si E/F no son fórmulas, recalcular IVA (15%) y total a mano
        var fEPf = wsCatEP.getRange(fEP,5,1,2).getFormulas()[0];
        if (!fEPf[0]) wsCatEP.getRange(fEP,5).setValue(Math.round(subEP*0.15*100)/100);
        if (!fEPf[1]) wsCatEP.getRange(fEP,6).setValue(Math.round(subEP*1.15*100)/100);
      }
      if (body.compraCat !== undefined) {
        wsCatEP.getRange(fEP,7).setValue(parseFloat(body.compraCat)||0);
        var fEPh = wsCatEP.getRange(fEP,8).getFormula();
        if (!fEPh) {
          var subAct = parseFloat(wsCatEP.getRange(fEP,4).getValue())||0;
          wsCatEP.getRange(fEP,8).setValue(Math.round((subAct-(parseFloat(body.compraCat)||0))*100)/100);
        }
      }
      if (body.comision !== undefined && body.comision !== '' && body.comision !== null) wsCatEP.getRange(fEP,9).setValue(parseFloat(body.comision)||0);
      // Compra REAL de proveedor → INVENTARIO col G
      if (body.compraProv !== undefined && body.compraProv !== '' && body.compraProv !== null) {
        try {
          var wsInvEP = ss.getSheets().find(function(s){ return s.getName().includes('INVENTARIO'); });
          var dInvEP = wsInvEP.getDataRange().getValues();
          for (var ie = 2; ie < dInvEP.length; ie++) {
            if ((dInvEP[ie][0]||'').toString().trim().toUpperCase() === ('SUNSU-'+codEP)) {
              wsInvEP.getRange(ie+1,7).setValue(parseFloat(body.compraProv)||0); break;
            }
          }
        } catch(eIvE) {}
      }
      try { logAccion_(ss, 'CATALOGO', 'producto '+codEP+' editado', body.usuario||''); } catch(eLgE) {}
      return respJson({ok:true});
    }

    // ── CATÁLOGO: activar / desactivar un producto (col J) ──
    if (body.accion === 'toggleActivoCatalogo') {
      var codTA = (body.sku||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'');
      var wsCatTA = ss.getSheets().find(function(s){ return s.getName().includes('CATALOGO'); });
      if (!wsCatTA) return respJson({error:'No existe CATALOGO'});
      var dCatTA = wsCatTA.getDataRange().getValues();
      for (var dt = 2; dt < dCatTA.length; dt++) {
        if ((dCatTA[dt][0]||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'') === codTA) {
          var celTA = wsCatTA.getRange(dt+1,10);
          try { celTA.insertCheckboxes(); } catch(eCk) {}
          celTA.setValue(body.activo === true);
          try { logAccion_(ss, 'CATALOGO', codTA+' → '+(body.activo?'ACTIVADO':'DESACTIVADO'), body.usuario||''); } catch(eLgT) {}
          return respJson({ok:true, activo:body.activo===true});
        }
      }
      return respJson({error:'SKU no encontrado'});
    }

    // ── CATÁLOGO: ELIMINAR producto por completo (fila catálogo + columna
    //    TICKET_FICHA + fila inventario). ⚠️ Borra el historial de ventas de ese
    //    producto — el frontend exige confirmación tecleada. ──
    if (body.accion === 'eliminarProductoApp') {
      var codDel = (body.sku||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'');
      if (!codDel) return respJson({error:'Falta el SKU'});
      var res = {catalogo:false, ticket:false, inventario:false};
      // 1) CATALOGO
      var wsCatD = ss.getSheets().find(function(s){ return s.getName().includes('CATALOGO'); });
      if (wsCatD) {
        var dCatD = wsCatD.getDataRange().getValues();
        for (var dd = 2; dd < dCatD.length; dd++) {
          if ((dCatD[dd][0]||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'') === codDel) {
            wsCatD.deleteRow(dd+1); res.catalogo=true; break;
          }
        }
      }
      // 2) TICKET_FICHA: eliminar la columna del producto (encabezado = código pelado)
      var wsTkD = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (wsTkD) {
        var hdrD = wsTkD.getRange(1,1,1,wsTkD.getLastColumn()).getValues()[0];
        for (var hd = 0; hd < hdrD.length; hd++) {
          if ((hdrD[hd]||'').toString().trim().toUpperCase() === codDel) {
            wsTkD.deleteColumn(hd+1); res.ticket=true; break;
          }
        }
      }
      // 3) INVENTARIO
      var wsInvD = ss.getSheets().find(function(s){ return s.getName().includes('INVENTARIO'); });
      if (wsInvD) {
        var dInvD = wsInvD.getDataRange().getValues();
        for (var di2 = 2; di2 < dInvD.length; di2++) {
          if ((dInvD[di2][0]||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'') === codDel) {
            wsInvD.deleteRow(di2+1); res.inventario=true; break;
          }
        }
      }
      try { logAccion_(ss, 'CATALOGO', '🗑️ producto '+codDel+' ELIMINADO (catálogo:'+res.catalogo+' ticket:'+res.ticket+' inventario:'+res.inventario+')', body.usuario||''); } catch(eLgD) {}
      return respJson({ok:true, res:res});
    }

    // ── Proveedores: guardar (nuevo o edición) y eliminar ──
    if (body.accion === 'guardarProveedorApp') {
      var wsPg = _wsProveedores_(ss);
      var nomPg = (body.nombre||'').toString().trim();
      var famPg = (body.familia||'').toString().trim().toUpperCase();
      if (!nomPg || !famPg) return respJson({error:'Nombre y familia (prefijo de SKU) son obligatorios'});
      var filaPg = parseInt(body.fila)||0;
      var valsPg = [nomPg, (body.ruc||'').toString().trim(), (body.telefono||'').toString().trim(),
        (body.direccion||'').toString().trim(), (body.email||'').toString().trim(), famPg, (body.notas||'').toString().trim()];
      if (filaPg >= 2) wsPg.getRange(filaPg,1,1,7).setValues([valsPg]);
      else wsPg.getRange(wsPg.getLastRow()+1,1,1,7).setValues([valsPg]);
      return respJson({ok:true});
    }
    if (body.accion === 'eliminarProveedorApp') {
      var wsPe = _wsProveedores_(ss);
      var filaPe = parseInt(body.fila)||0;
      if (filaPe < 2) return respJson({error:'Fila inválida'});
      wsPe.deleteRow(filaPe);
      return respJson({ok:true});
    }

    // ── Crear orden de compra desde el app (ya editada y aprobada por el admin) ──
    // ── EDITAR una orden de compra existente: MISMO número, misma agrupación ──
    // Sincroniza 📥 ENTRADAS con lo editado: cantidades se actualizan, productos
    // quitados se BORRAN (su fila desaparece), agregados se INSERTAN junto a las
    // demás filas de la orden (las órdenes de abajo se corren). Filas YA RECIBIDAS
    // no se tocan (el acta física ya existe). El snapshot del PDF se actualiza.
    // ── ELIMINAR una orden de compra COMPLETA ──
    // Solo si NINGUNA línea tiene unidades recibidas: lo recibido ya alimentó
    // el inventario y borrarlo dejaría stock fantasma (para eso está Editar).
    if (body.accion === 'ocEliminar') {
      var rolOE = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolOE!=='admin' && rolOE!=='admin_master') return respJson({error:'Solo administradores'});
      var numOE = (body.num||'').toString().trim();
      if (!numOE) return respJson({error:'Falta el número de orden'});
      var wsOE = ss.getSheetByName(INV_CONFIG.SHEET_ENTRADAS);
      if (!wsOE) return respJson({error:'No existe la hoja ENTRADAS'});
      var dOE = wsOE.getDataRange().getValues();
      var filasOE = [], recOE = 0;
      for (var ioe = 3; ioe < dOE.length; ioe++) {
        if ((dOE[ioe][7]||'').toString().trim() !== numOE) continue;
        filasOE.push(ioe+1);
        if (dOE[ioe][5] !== '' && dOE[ioe][5] !== null) recOE++;
      }
      if (recOE > 0) return respJson({error:'La orden '+numOE+' tiene '+recOE+' línea'+(recOE===1?'':'s')+' con unidades RECIBIDAS — ese stock ya entró al inventario. Usa ✏️ Editar para ajustarla; eliminarla dejaría stock fantasma.'});
      for (var joe = filasOE.length-1; joe >= 0; joe--) wsOE.deleteRow(filasOE[joe]);
      var odOE = 0;
      try {
        var wsODel = ss.getSheetByName('OC_DATA');
        if (wsODel) {
          var dODel = wsODel.getDataRange().getValues();
          for (var kod = dODel.length-1; kod >= 1; kod--) {
            if ((dODel[kod][0]||'').toString().trim() === numOE) { wsODel.deleteRow(kod+1); odOE++; }
          }
        }
      } catch(eODel) {}
      try { logAccion_(ss, 'OC ELIMINADA', numOE+' — '+filasOE.length+' líneas pendientes borradas de ENTRADAS'+(odOE?' + snapshot':''), body.usuario||''); } catch(eLgOE) {}
      return respJson({ok:true, num:numOE, lineas:filasOE.length});
    }
    if (body.accion === 'editarOCApp') {
      var numED = (body.numOrden||'').toString().trim();
      if (!numED) return respJson({error:'Falta el número de orden'});
      var itemsED = (body.items||[]).filter(function(it){ return (parseFloat(it.cant)||0) > 0; });
      var directaED = (body.directa||[]).filter(function(it){ return (parseFloat(it.cant)||0) > 0; });
      var factED2 = (body.fact||[]).filter(function(it){ return (parseFloat(it.vendido)||0) > 0; });
      if (!itemsED.length && !factED2.length && !directaED.length) return respJson({error:'La orden quedaría vacía'});
      var wsED = ss.getSheetByName(INV_CONFIG.SHEET_ENTRADAS);
      if (!wsED) return respJson({error:'No existe la hoja ENTRADAS'});
      var dED = wsED.getDataRange().getValues();
      var wantED = {};
      itemsED.forEach(function(it){ wantED[(it.sku||'').toString().trim()] = {cant:parseFloat(it.cant)||0, nombre:(it.nombre||'').toString(), dir:false}; });
      directaED.forEach(function(it){ wantED[(it.sku||'').toString().trim()+'|DIR'] = {cant:parseFloat(it.cant)||0, nombre:(it.nombre||'').toString(), dir:true}; });
      // PASO 1: filas actuales de esta orden
      var filasED = [];
      for (var ied = 3; ied < dED.length; ied++) {
        if ((dED[ied][7]||'').toString().trim() !== numED) continue;
        var skuED = (dED[ied][1]||'').toString().trim();
        var esDirED = ((dED[ied][8]||'').toString().indexOf('COMPRA DIRECTA') >= 0);
        filasED.push({fila:ied+1, key:(esDirED?skuED+'|DIR':skuED), recibida:(dED[ied][5]!==''&&dED[ied][5]!==null), fechaOrig:dED[ied][0]});
      }
      var fechaOrigED = filasED.length ? filasED[0].fechaOrig : new Date();
      if (fechaOrigED instanceof Date) fechaOrigED = Utilities.formatDate(fechaOrigED,'America/Guayaquil','dd/MM/yyyy HH:mm');
      var recibidasBloq = 0;
      // PASO 2: actualizar o borrar, de ABAJO hacia ARRIBA
      for (var jed = filasED.length-1; jed >= 0; jed--) {
        var fED = filasED[jed];
        if (wantED[fED.key] !== undefined) {
          if (!fED.recibida) wsED.getRange(fED.fila,5).setValue(wantED[fED.key].cant);
          delete wantED[fED.key];
        } else if (fED.recibida) {
          recibidasBloq++; // ya recibida: se conserva
        } else {
          wsED.deleteRow(fED.fila);
          filasED.splice(jed,1);
        }
      }
      // PASO 3: insertar lo nuevo JUNTO a la orden (corre lo de abajo)
      var nuevosED = Object.keys(wantED);
      if (nuevosED.length) {
        var filaBaseED = filasED.length ? Math.max.apply(null, filasED.map(function(x){return x.fila;})) : Math.max(wsED.getLastRow(),3);
        wsED.insertRowsAfter(filaBaseED, nuevosED.length);
        var rIns = filaBaseED + 1;
        nuevosED.forEach(function(kN){
          var wN = wantED[kN];
          var skuN = kN.replace('|DIR','');
          wsED.getRange(rIns,1).setNumberFormat('@').setValue(fechaOrigED); // TEXTO: evita date-flip US locale
          wsED.getRange(rIns,2).setValue(skuN);
          wsED.getRange(rIns,3).setValue(wN.nombre);
          wsED.getRange(rIns,4).setValue((body.proveedor||'').toString().trim());
          wsED.getRange(rIns,5).setValue(wN.cant);
          wsED.getRange(rIns,6).setValue('');
          wsED.getRange(rIns,7).setFormula('=IF(F'+rIns+'="","⏳ Pendiente",IF(F'+rIns+'=0,"❌ No llegó",IF(F'+rIns+'>=E'+rIns+',"✅ Completo","⚠️ Parcial")))');
          wsED.getRange(rIns,8).setValue(numED);
          wsED.getRange(rIns,9).setValue(wN.dir ? ('🛍 COMPRA DIRECTA — uso cabina · '+(body.qLabel||'')+' (app · editada)') : ('Pedido '+(body.qLabel||'')+' (app · editada)'));
          wsED.getRange(rIns,1,1,10).setBackground(wN.dir?'#F0EAF7':COLOR.GOLD_L).setFontSize(9).setFontFamily('Arial');
          wsED.getRange(rIns,6).setBackground(COLOR.GREEN_L).setFontWeight('bold');
          wsED.getRange(rIns,7).setBackground(wN.dir?'#F0EAF7':COLOR.GOLD_L).setFontWeight('bold').setFontColor(wN.dir?'#7A5EA6':COLOR.GOLD);
          rIns++;
        });
      }
      // PASO 4: snapshot OC_DATA actualizado (mismo número → el PDF re-descargable ya sale editado)
      try {
        var wsODE = ss.getSheetByName('OC_DATA');
        if (wsODE) {
          var dODE = wsODE.getDataRange().getValues();
          for (var kod = dODE.length-1; kod >= 1; kod--) {
            if ((dODE[kod][0]||'').toString().trim() !== numED) continue;
            wsODE.getRange(kod+1,4).setValue(JSON.stringify({
              prov: body.provData||{nombre:(body.proveedor||'')},
              qLabel: body.qLabel||'',
              fact: body.fact||[],
              items: itemsED,
              stock: body.stock||[],
              directa: body.directa||[]
            }));
            break;
          }
        }
      } catch(eODE) {}
      try { logAccion_(ss, '📥 ENTRADAS', 'OC '+numED+' EDITADA desde el app ('+itemsED.length+' restock, '+factED2.length+' facturación, '+directaED.length+' directa'+(recibidasBloq?(' · '+recibidasBloq+' ya recibidas conservadas'):'')+')', body.usuario||''); } catch(eLg3) {}
      return respJson({ok:true, numOrden:numED, fecha:fechaOrigED, aviso:(recibidasBloq?(recibidasBloq+' filas ya recibidas se conservaron'):'')});
    }

    if (body.accion === 'crearOCApp') {
      var itemsOC2 = (body.items||[]).filter(function(it){ return (parseFloat(it.cant)||0) > 0; });
      var factOC2 = (body.fact||[]).filter(function(it){ return (parseFloat(it.vendido)||0) > 0; });
      var directaOC2 = (body.directa||[]).filter(function(it){ return (parseFloat(it.cant)||0) > 0; });
      // Puede haber órdenes SOLO de facturación, SOLO de restock o SOLO de compra
      // directa — se permite si al menos un bloque tiene contenido
      if (!itemsOC2.length && !factOC2.length && !directaOC2.length) return respJson({error:'La orden está vacía (ni facturación, ni restock, ni compra directa)'});
      var provOC2 = (body.proveedor||'').toString().trim();
      if (!provOC2) return respJson({error:'Falta el proveedor'});
      var numOC2 = getNextOrderNumber();
      var wsE2c = ss.getSheetByName(INV_CONFIG.SHEET_ENTRADAS);
      if ((itemsOC2.length || directaOC2.length) && !wsE2c) return respJson({error:'No existe la hoja ENTRADAS'});
      var rOC2 = wsE2c ? Math.max(wsE2c.getLastRow()+1, 4) : 0;
      var tsOC2 = Utilities.formatDate(new Date(), 'America/Guayaquil', 'dd/MM/yyyy HH:mm');
      itemsOC2.forEach(function(it){
        wsE2c.getRange(rOC2,1).setNumberFormat('@').setValue(tsOC2); // TEXTO: evita date-flip US locale
        wsE2c.getRange(rOC2,2).setValue((it.sku||'').toString().trim());
        wsE2c.getRange(rOC2,3).setValue((it.nombre||'').toString().trim());
        wsE2c.getRange(rOC2,4).setValue(provOC2);
        wsE2c.getRange(rOC2,5).setValue(parseFloat(it.cant)||0);
        wsE2c.getRange(rOC2,6).setValue('');
        wsE2c.getRange(rOC2,7).setFormula('=IF(F'+rOC2+'="","⏳ Pendiente",IF(F'+rOC2+'=0,"❌ No llegó",IF(F'+rOC2+'>=E'+rOC2+',"✅ Completo","⚠️ Parcial")))');
        wsE2c.getRange(rOC2,8).setValue(numOC2);
        wsE2c.getRange(rOC2,9).setValue('Pedido ' + (body.qLabel||'') + ' (app)');
        wsE2c.getRange(rOC2,1,1,10).setBackground(COLOR.GOLD_L).setFontSize(9).setFontFamily('Arial');
        wsE2c.getRange(rOC2,6).setBackground(COLOR.GREEN_L).setFontWeight('bold');
        wsE2c.getRange(rOC2,7).setBackground(COLOR.GOLD_L).setFontWeight('bold').setFontColor(COLOR.GOLD);
        rOC2++;
      });
      // COMPRA DIRECTA: entra al acta (cuadro aparte) pero NO al inventario de
      // ventas. Al marcarla recibida, la cantidad suma en 🧴 INVENTARIO CABINA.
      // La NOTA ("COMPRA DIRECTA") es la marca que leen el acta, la fórmula y
      // el alta en cabina — no cambiar ese texto.
      directaOC2.forEach(function(it){
        wsE2c.getRange(rOC2,1).setNumberFormat('@').setValue(tsOC2); // TEXTO: evita date-flip US locale
        wsE2c.getRange(rOC2,2).setValue((it.sku||'').toString().trim());
        wsE2c.getRange(rOC2,3).setValue((it.nombre||'').toString().trim());
        wsE2c.getRange(rOC2,4).setValue(provOC2);
        wsE2c.getRange(rOC2,5).setValue(parseFloat(it.cant)||0);
        wsE2c.getRange(rOC2,6).setValue('');
        wsE2c.getRange(rOC2,7).setFormula('=IF(F'+rOC2+'="","⏳ Pendiente",IF(F'+rOC2+'=0,"❌ No llegó",IF(F'+rOC2+'>=E'+rOC2+',"✅ Completo","⚠️ Parcial")))');
        wsE2c.getRange(rOC2,8).setValue(numOC2);
        wsE2c.getRange(rOC2,9).setValue('🛍 COMPRA DIRECTA — uso cabina · ' + (body.qLabel||'') + ' (app)');
        wsE2c.getRange(rOC2,1,1,10).setBackground('#F0EAF7').setFontSize(9).setFontFamily('Arial');
        wsE2c.getRange(rOC2,6).setBackground(COLOR.GREEN_L).setFontWeight('bold');
        wsE2c.getRange(rOC2,7).setBackground('#F0EAF7').setFontWeight('bold').setFontColor('#7A5EA6');
        rOC2++;
      });
      // Snapshot de la orden (facturación editada + restock + datos del proveedor)
      // en hoja oculta OC_DATA — permite re-descargar el PDF exacto después
      try {
        var wsOD = ss.getSheetByName('OC_DATA');
        if (!wsOD) {
          wsOD = ss.insertSheet('OC_DATA');
          wsOD.getRange(1,1,1,4).setValues([['NUMORDEN','FECHA','PROVEEDOR','JSON']]).setFontWeight('bold');
          wsOD.hideSheet();
        }
        var rOD2 = Math.max(wsOD.getLastRow()+1, 2);
        wsOD.getRange(rOD2, 2).setNumberFormat('@'); // FECHA TEXTO: evita date-flip US locale
        wsOD.getRange(rOD2, 1, 1, 4).setValues([[numOC2, tsOC2, provOC2, JSON.stringify({
          prov: body.provData||{nombre:provOC2},
          qLabel: body.qLabel||'',
          fact: body.fact||[],
          items: itemsOC2,
          stock: body.stock||[],
          directa: body.directa||[]
        })]]);
      } catch(eOD) {}
      try { logAccion_(ss, '📥 ENTRADAS', 'OC '+numOC2+' creada desde el app para '+provOC2+' ('+itemsOC2.length+' restock, '+factOC2.length+' facturación, '+directaOC2.length+' compra directa)', body.usuario||''); } catch(eLg2) {}
      return respJson({ok:true, numOrden:numOC2, fecha:tsOC2});
    }

    // ── Resolver/corregir una diferencia del inventario físico (con justificación) ──
    if (body.accion === 'resolverInvFisico') {
      var wsRF = ss.getSheetByName('📋 INV FÍSICO');
      if (!wsRF) return respJson({error:'No hay inventarios físicos'});
      var idRF = (body.id||'').toString(), skuRF = (body.sku||'').toString().trim();
      var notaRF = (body.nota||'').toString().trim();
      if (!notaRF) return respJson({error:'La justificación es obligatoria'});
      var dRF = wsRF.getDataRange().getValues();
      var filaRF = -1;
      for (var ri = 1; ri < dRF.length; ri++) {
        if (!(dRF[ri][0] instanceof Date)) continue;
        if (Utilities.formatDate(dRF[ri][0], 'America/Guayaquil', 'yyyy-MM-dd HH:mm:ss') !== idRF) continue;
        if ((dRF[ri][2]||'').toString().trim() !== skuRF) continue;
        filaRF = ri + 1; break;
      }
      if (filaRF < 0) return respJson({error:'No encontré ese producto en la sesión'});
      var ahoraRF = new Date();
      var selloRF = (body.usuario||'') + ' ' + Utilities.formatDate(ahoraRF, 'America/Guayaquil', 'dd/MM/yyyy HH:mm');
      var notaPrev = (dRF[filaRF-1][9]||'').toString().trim();
      var agregarNota = function(texto) {
        wsRF.getRange(filaRF, 10).setValue((notaPrev ? notaPrev + '\n' : '') + texto);
      };
      if (body.modo === 'corregir') {
        // Error de tipeo en el conteo: se corrige la cantidad contada, con rastro completo
        var viejoF = parseFloat(dRF[filaRF-1][5])||0;
        var nuevoF = parseFloat(body.nuevoFisico);
        if (isNaN(nuevoF) || nuevoF < 0) return respJson({error:'Cantidad inválida'});
        var sisOrig = parseFloat(dRF[filaRF-1][4])||0;
        var nuevaDif = nuevoF - sisOrig;
        wsRF.getRange(filaRF, 6).setValue(nuevoF);
        wsRF.getRange(filaRF, 7).setValue(nuevaDif);
        wsRF.getRange(filaRF, 8).setValue(nuevaDif === 0 ? '✓ CUADRA' : ('⚠️ ' + (nuevaDif>0?'+':'') + nuevaDif));
        agregarNota('✏️ Conteo corregido de ' + viejoF + ' a ' + nuevoF + ' — ' + selloRF + ': ' + notaRF);
        if (nuevaDif === 0) {
          wsRF.getRange(filaRF, 9).setValue(ahoraRF).setNumberFormat('dd/mm/yyyy hh:mm');
          wsRF.getRange(filaRF, 1, 1, 10).setBackground('#E8F8EE');
        } else {
          wsRF.getRange(filaRF, 1, 1, 10).setBackground('#FFF3CD');
        }
        return respJson({ok:true, nuevaDif:nuevaDif});
      }
      if (body.modo === 'resolver') {
        // Resolución con explicación (ticket tardío ingresado, consumo interno, pérdida aceptada, etc.)
        wsRF.getRange(filaRF, 9).setValue(ahoraRF).setNumberFormat('dd/mm/yyyy hh:mm');
        wsRF.getRange(filaRF, 1, 1, 10).setBackground('#E8F8EE');
        agregarNota('✔️ Resuelto — ' + selloRF + ': ' + notaRF);
        return respJson({ok:true});
      }
      if (body.modo === 'nota') {
        agregarNota('📝 ' + selloRF + ': ' + notaRF);
        return respJson({ok:true});
      }
      return respJson({error:'Modo inválido'});
    }

    // ── Guardar inventario físico semanal ──
    if (body.accion === 'guardarInvFisico') {
      var wsIF = ss.getSheetByName('📋 INV FÍSICO');
      if (!wsIF) {
        wsIF = ss.insertSheet('📋 INV FÍSICO');
        wsIF.getRange(1,1,1,10).setValues([['FECHA','USUARIO','SKU','PRODUCTO','STOCK SISTEMA','CONTEO FÍSICO','DIFERENCIA','ESTADO','RESUELTO','NOTA']])
          .setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
        wsIF.setFrozenRows(1);
        wsIF.setColumnWidth(4, 260);
      }
      var conteosIF = body.conteos || [];
      if (!conteosIF.length) return respJson({error:'Sin conteos'});
      var ahoraIF = new Date();
      var filasIF = [], difsIF = [], cuadranIF = 0;
      conteosIF.forEach(function(cIt){
        var sisIF = parseFloat(cIt.sistema) || 0;
        var fisIF = parseFloat(cIt.fisico) || 0;
        var difIF = fisIF - sisIF;
        if (difIF === 0) cuadranIF++;
        else difsIF.push({sku:cIt.sku, nombre:cIt.nombre, sistema:sisIF, fisico:fisIF, dif:difIF});
        filasIF.push([ahoraIF, body.usuario||'', cIt.sku||'', cIt.nombre||'', sisIF, fisIF, difIF,
          difIF === 0 ? '✓ CUADRA' : ('⚠️ ' + (difIF>0?'+':'') + difIF)]);
      });
      var r0IF = wsIF.getLastRow() + 1;
      wsIF.getRange(r0IF, 1, filasIF.length, 8).setValues(filasIF);
      wsIF.getRange(r0IF, 1, filasIF.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
      for (var fi2 = 0; fi2 < filasIF.length; fi2++) {
        wsIF.getRange(r0IF + fi2, 1, 1, 8).setBackground(filasIF[fi2][6] !== 0 ? '#FFF3CD' : null);
      }
      try { logAccion_(ss, '📋 INV FÍSICO', 'inventario físico: ' + conteosIF.length + ' productos, ' + difsIF.length + ' diferencias', body.usuario||''); } catch(eLg) {}
      return respJson({ok:true, total:conteosIF.length, cuadran:cuadranIF, difs:difsIF});
    }

    if (body.accion === 'registrarMulta') {
      var wsMul2 = ss.getSheetByName('📋 MULTAS Y DESCUENTOS');
      if (!wsMul2) return respJson({error:'No MULTAS Y DESCUENTOS'});
      // Find first empty row starting from row 1
      var mulData = wsMul2.getRange('A:A').getValues();
      var mulFila = 1;
      for (var mi = 0; mi < mulData.length; mi++) {
        if (mulData[mi][0] === '' || mulData[mi][0] === null) { mulFila = mi + 1; break; }
        mulFila = mi + 2;
      }
      var hoyMul = Utilities.formatDate(new Date(), 'America/Guayaquil', 'yyyy-MM-dd');
      // Col A: Fecha, B: Cosmetóloga, C: TIPO, D: Monto, E: Motivo, F: # Ticket
      wsMul2.getRange(mulFila, 1).setValue(hoyMul);
      wsMul2.getRange(mulFila, 2).setValue(body.cosmetologa||'');
      wsMul2.getRange(mulFila, 3).setValue(body.tipo||'MULTA');
      wsMul2.getRange(mulFila, 4).setValue(parseFloat(body.monto)||0);
      wsMul2.getRange(mulFila, 5).setValue(body.motivo||'');
      wsMul2.getRange(mulFila, 6).setValue(body.tkRow||'');
      return ContentService.createTextOutput(JSON.stringify({ok:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (body.accion === 'savePermiso') {
      try {
        var ws = ss.getSheetByName('🏖️ PERMISOS') || ss.insertSheet('🏖️ PERMISOS');
        if (ws.getLastRow() < 1) {
          ws.getRange(1,1,1,11).setValues([['ID','EMPLEADA','TIPO','FECHA INICIO','FECHA FIN','HORAS','MOTIVO','ESTADO','SOLICITADO','APROBADO POR','URL CERTIFICADO']])
            .setBackground('#3D5A7A').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(9);
        }
        var p = body.permiso;
        var id = new Date().getTime().toString();

        // Subir foto a Drive si viene base64
        var urlFoto = '';
        if (p.foto && p.foto.indexOf('base64') > 0) {
          try {
            var base64Data = p.foto.split(',')[1];
            var mimeType   = p.foto.split(';')[0].split(':')[1];
            var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType,
              'certificado_' + p.empleada.replace(/ /g,'_') + '_' + id + '.jpg');
            var ID_CERT_FOLDER = '1k_sspvEpnoAx8MpZVhvmYTUKeVNi3ojb'; // carpeta SUNSU_JIBBLE
            var folder = DriveApp.getFolderById(ID_CERT_FOLDER);
            var file   = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            // Usar URL de visualización directa
            urlFoto = 'https://drive.google.com/uc?id=' + file.getId() + '&export=view';
          } catch(ef) { Logger.log('Error foto: '+ef.message); }
        }

        ws.appendRow([id, p.empleada, p.tipo, p.fechaInicio, p.fechaFin,
          p.horas||'', p.motivo, 'PENDIENTE', p.solicitado, '', urlFoto]);
        return ContentService.createTextOutput(JSON.stringify({ok:true, id:id}))
          .setMimeType(ContentService.MimeType.JSON);
      } catch(e) {
        return ContentService.createTextOutput(JSON.stringify({ok:false, error:e.message}))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (body.accion === 'updatePermiso') {
      try {
        var ws = ss.getSheetByName('🏖️ PERMISOS');
        if (!ws) throw new Error('Hoja 🏖️ PERMISOS no encontrada');
        var data = ws.getDataRange().getValues();
        for (var i=1; i<data.length; i++) {
          if (data[i][0].toString() === body.id.toString()) {
            ws.getRange(i+1, 8).setValue(body.estado);
            ws.getRange(i+1, 10).setValue(body.aprobadoPor||'');
            break;
          }
        }
        return ContentService.createTextOutput(JSON.stringify({ok:true}))
          .setMimeType(ContentService.MimeType.JSON);
      } catch(e) {
        return ContentService.createTextOutput(JSON.stringify({ok:false, error:e.message}))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ── LOGIN: el PIN viaja al servidor y aqui se compara. Devuelve un token de sesion. ──
    if (body.accion === 'login') {
      var pinIn = (body.pin||'').toString().trim();
      if (!pinIn) return respJson({error:'Falta el PIN'});
      var propsL = PropertiesService.getScriptProperties();
      var usersL = _usuariosSunsu_(propsL);
      var uL = null;
      for (var iL = 0; iL < usersL.length; iL++) {
        if ((usersL[iL].pin||'').toString() === pinIn) { uL = usersL[iL]; break; }
      }
      if (!uL) return respJson({error:'PIN incorrecto'});
      if (uL.bloqueado) return respJson({error:'⚙️ Sistema en actualización — si requieres información adicional, comunícate con el administrador'});
      var tokL = Utilities.getUuid();
      var mapT = {};
      try { mapT = JSON.parse(propsL.getProperty('SUNSU_TOKENS')||'{}'); } catch(eT) {}
      var ahoraL = Date.now();
      Object.keys(mapT).forEach(function(k){ if (!mapT[k].exp || mapT[k].exp < ahoraL) delete mapT[k]; });
      mapT[tokL] = {uid: uL.id, rol: uL.role, exp: ahoraL + 30*24*3600*1000};
      propsL.setProperty('SUNSU_TOKENS', JSON.stringify(mapT));
      try { logAccion_(ss, 'LOGIN', uL.name, uL.name); } catch(eLg) {}
      var uPubL = _usuarioPublico_(uL);
      uPubL.pinReset = !!uL.pinReset;
      return respJson({ok:true, token:tokL, user:uPubL});
    }

    // ── Pedir cambio de clave: en su PRÓXIMO login deberá poner una nueva ──
    if (body.accion === 'usuarioPinReset') {
      var rolPR = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolPR!=='admin' && rolPR!=='admin_master') return respJson({error:'Solo administradores'});
      var uidPR = (body.uid||'').toString().trim();
      var propsPR = PropertiesService.getScriptProperties();
      var usersPR = _usuariosSunsu_(propsPR);
      var uPR = usersPR.find(function(x){ return x.id === uidPR; });
      if (!uPR) return respJson({error:'Usuario no encontrado'});
      uPR.pinReset = !!body.activar;
      propsPR.setProperty('SUNSU_USERS', JSON.stringify(usersPR));
      try { logAccion_(ss, 'USUARIOS', (uPR.pinReset?'🔄 cambio de clave solicitado':'solicitud de cambio retirada')+' — '+uPR.name, body.usuario||''); } catch(eLgP) {}
      return respJson({ok:true, uid:uidPR, pinReset:uPR.pinReset});
    }
    // ── Cambiar la clave (desde el modal forzado del login): prueba = PIN actual ──
    if (body.accion === 'usuarioCambiarPin') {
      var uidCP = (body.uid||'').toString().trim();
      var pinAct = (body.pinActual||'').toString().trim();
      var pinNvo = (body.pinNuevo||'').toString().trim();
      if (!/^\d{4}$/.test(pinNvo)) return respJson({error:'La clave nueva debe ser de 4 dígitos'});
      var propsCP = PropertiesService.getScriptProperties();
      var usersCP = _usuariosSunsu_(propsCP);
      var uCP = usersCP.find(function(x){ return x.id === uidCP; });
      if (!uCP) return respJson({error:'Usuario no encontrado'});
      if (uCP.bloqueado) return respJson({error:'⚙️ Sistema en actualización — si requieres información adicional, comunícate con el administrador'});
      if ((uCP.pin||'').toString() !== pinAct) return respJson({error:'Clave actual incorrecta'});
      if (usersCP.some(function(x){ return x.id !== uidCP && (x.pin||'').toString() === pinNvo; }))
        return respJson({error:'Esa clave ya la usa otro usuario — elige otra'});
      uCP.pin = pinNvo;
      uCP.pinReset = false;
      propsCP.setProperty('SUNSU_USERS', JSON.stringify(usersCP));
      try { logAccion_(ss, 'USUARIOS', '🔑 clave cambiada por el usuario — '+uCP.name, uCP.name); } catch(eLgC) {}
      return respJson({ok:true});
    }
    // ── Lista COMPLETA de usuarios (con claves) — solo admin_master ──
    if (body.accion === 'usuariosFull') {
      var propsUF = PropertiesService.getScriptProperties();
      var mapUF = {};
      try { mapUF = JSON.parse(propsUF.getProperty('SUNSU_TOKENS')||'{}'); } catch(eUF) {}
      var tkUF = mapUF[body.token||''];
      if (!tkUF || tkUF.rol !== 'admin_master' || !tkUF.exp || tkUF.exp < Date.now())
        return respJson({error:'Solo el administrador principal'});
      return respJson({ok:true, users:_usuariosSunsu_(propsUF)});
    }
    if (body.accion === 'usuarioBloquear') {
      var rolUB = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolUB!=='admin' && rolUB!=='admin_master') return respJson({error:'Solo administradores'});
      var uidBB = (body.uid||'').toString().trim();
      if (!uidBB) return respJson({error:'Falta el usuario'});
      if (uidBB === 'efch') return respJson({error:'El admin_master no se puede bloquear'});
      var propsBB = PropertiesService.getScriptProperties();
      var usersBB = _usuariosSunsu_(propsBB);
      var uBB = usersBB.find(function(x){ return x.id === uidBB; });
      if (!uBB) return respJson({error:'Usuario no encontrado'});
      uBB.bloqueado = !!body.bloqueado;
      propsBB.setProperty('SUNSU_USERS', JSON.stringify(usersBB));
      // Revocar TODOS sus tokens vivos: las sesiones admin/staff mueren ya
      if (uBB.bloqueado) {
        try {
          var mapTB = JSON.parse(propsBB.getProperty('SUNSU_TOKENS')||'{}');
          var nRev = 0;
          Object.keys(mapTB).forEach(function(tk){
            if ((mapTB[tk].uid||'') === uidBB || (mapTB[tk].name||'') === uBB.name) { delete mapTB[tk]; nRev++; }
          });
          propsBB.setProperty('SUNSU_TOKENS', JSON.stringify(mapTB));
        } catch(eRv) {}
      }
      try { logAccion_(ss, 'USUARIOS', (uBB.bloqueado?'🚫 BLOQUEADO':'✅ desbloqueado')+' — '+uBB.name, body.usuario||''); } catch(eLgU) {}
      return respJson({ok:true, uid:uidBB, bloqueado:uBB.bloqueado});
    }
    if (body.accion === 'saveUsuarios') {
      // El app manda la lista SIN pines. Si un usuario no trae PIN, se conserva el guardado:
      // asi editar un nombre o color no deja a nadie sin poder entrar.
      var propsS = PropertiesService.getScriptProperties();
      var prevS = _usuariosSunsu_(propsS);
      var pinPrev = {};
      prevS.forEach(function(u){ pinPrev[u.id] = (u.pin||'').toString(); });
      var nuevosS = (body.users||[]).map(function(u){
        return {id:u.id, name:u.name, short:u.short, role:u.role, color:u.color,
                pin: ((u.pin||'').toString().trim() || pinPrev[u.id] || '')};
      });
      propsS.setProperty('SUNSU_USERS', JSON.stringify(nuevosS));
      return respJson({ok:true});
    }

    // ── Resultado de contacto en seguimiento: no contestó / no desea ──
    // Se guarda en PropertiesService amarrado a la CLIENTA (cédula o nombre),
    // validando el tkRow para que un ticket nuevo la regrese a un ciclo fresco.
    // ── Marcar 'WhatsApp ENVIADO' en seguimiento: estado intermedio ──
    // NO saca a la clienta de la lista; solo anota que ya se le escribio (fecha+quien)
    // para que nadie le re-envie el mismo mensaje. Se guarda en el servidor: lo que
    // marca Alejandra lo ven todas. Si luego marca nc/nd, ese resultado la reemplaza.
    // ── WhatsApp enviado en seguimiento de PAQUETES (clave: ced|sku|fechaCompra) ──
    // ── Editar una ficha del REGISTRO: solo admins (validado AQUI, no en el app) ──
    if (body.accion === 'saveRegistroCliente') {
      var propsSR = PropertiesService.getScriptProperties();
      var rolSR = _rolDeToken_(propsSR, body.token||'');
      if (rolSR!=='admin' && rolSR!=='admin_master') return respJson({error:'Solo administradores pueden editar fichas'});
      var wsSR = ss.getSheetByName('REGISTRO');
      if (!wsSR) return respJson({error:'No REGISTRO'});
      var rowSR = parseInt(body.row);
      if (!rowSR || rowSR < 2 || rowSR > wsSR.getLastRow()) return respJson({error:'Fila inválida'});
      var cedSR = (body.cedula||'').toString().trim().split('.')[0];
      var cedRealSR = (wsSR.getRange(rowSR, 2).getValue()||'').toString().trim().split('.')[0];
      if (cedSR && cedRealSR && cedSR !== cedRealSR) return respJson({error:'La fila no coincide. Refresca la lista.'});
      var headsSR = wsSR.getRange(1,1,1,wsSR.getLastColumn()).getValues()[0].map(function(h){return (h||'').toString().toUpperCase();});
      var colSR = function(claves){
        for (var c = 0; c < headsSR.length; c++) for (var k = 0; k < claves.length; k++)
          if (headsSR[c].indexOf(claves[k]) >= 0) return c+1;
        return 0;
      };
      var mapaSR = {nombre:3, apellido:4, sector:colSR(['SECTOR']), telefono:colSR(['TELEF','TELÉF','CELULAR']),
        tipoPiel:colSR(['PIEL']), estado:colSR(['ESTADO']), alergias:colSR(['ALERGIA']),
        medicacion:colSR(['MEDICACI']), condiciones:colSR(['CONDICION'])};
      var camposSR = body.campos||{};
      var escritosSR = 0;
      Object.keys(camposSR).forEach(function(kS){
        if (!mapaSR[kS]) return; // solo campos de la lista blanca
        wsSR.getRange(rowSR, mapaSR[kS]).setValue((camposSR[kS]||'').toString());
        escritosSR++;
      });
      try { logAccion_(ss, 'FICHA EDITADA', 'fila '+rowSR+' ('+escritosSR+' campos)', body.usuario); } catch(eLS) {}
      return respJson({ok:true, escritos:escritosSR});
    }

    // ── WhatsApp de cumpleaños enviado (clave: ced|año — un saludo por año) ──
    // ── CABINA: crear toda la estructura (archivo nuevo + 6 pestañas + semillas) ──
    if (body.accion === 'cabinaCrearEstructura') {
      var propsCE = PropertiesService.getScriptProperties();
      var rolCE = _rolDeToken_(propsCE, body.token||'');
      if (rolCE!=='admin' && rolCE!=='admin_master') return respJson({error:'Solo administradores'});
      if (propsCE.getProperty('CABINA_SS_ID')) return respJson({error:'La estructura ya existe'});
      var ssCb = SpreadsheetApp.create('SUNSU CABINA');
      var mk = function(nombre, heads, anchos) {
        var w = ssCb.insertSheet(nombre);
        w.getRange(1,1,1,heads.length).setValues([heads]).setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
        w.setFrozenRows(1);
        (anchos||[]).forEach(function(a,i){ if(a) w.setColumnWidth(i+1,a); });
        return w;
      };
      var wInv = mk('🧴 INVENTARIO CABINA', ['CÓDIGO','PRODUCTO','PROVEEDOR','CONTENIDO ENVASE','UNIDAD','COSTO ENVASE','COSTO POR UNIDAD','ENVASES CERRADOS','ABIERTO: RESTANTE','STOCK TOTAL','MÍNIMO (envases)','NOTAS','ACTIVO','SKU CATÁLOGO','BODEGA: CERRADOS','CÓDIGO BARRAS','PRODUCTO BASE','UBICACIÓN','UBICACIÓN LOCAL','UBICACIÓN ABIERTO','MÁX ABIERTOS'], [70,190,130,110,70,100,110,120,120,90,110,160,70,110,130,120,110,90,110,110,100]);
      var wAct = mk('🛠 ACTIVOS', ['CÓDIGO','ACTIVO','CATEGORÍA','CANTIDAD','UBICACIÓN','ESTADO','FECHA COMPRA','COSTO','NOTAS','LUGAR','CÓDIGO BARRAS','PROVEEDOR','CANTIDAD BODEGA','UNIDAD'], [70,190,120,80,120,100,110,90,180,90,120,130,120,80]);
      var wPro = mk('📋 PROTOCOLOS', ['SKU','FACIAL','VERSIÓN','VIGENTE','MANO DE OBRA $','VIDEO','NOTAS','ACTUALIZADO','POR'], [90,190,70,70,110,180,200,130,110]);
      var wPas = mk('📝 PROTOCOLO PASOS', ['SKU','VERSIÓN','PASO','DESCRIPCIÓN','PRODUCTO COD','CANTIDAD','UNIDAD','MINUTOS'], [90,70,50,300,110,80,70,80]);
      mk('📉 CONSUMOS', ['FECHA','TK','SKU FACIAL','VERSIÓN','PRODUCTO COD','PRODUCTO','CANTIDAD','UNIDAD','COSTO'], [130,60,90,70,100,180,80,70,80]);
      mk('🍾 APERTURAS', ['FECHA','PRODUCTO COD','PRODUCTO','CONTENIDO','QUIÉN'], [130,110,190,100,120]);
      try { ssCb.deleteSheet(ssCb.getSheetByName('Sheet1') || ssCb.getSheetByName('Hoja 1')); } catch(eH) {}
      _cabinaSembrar_(ssCb, body.faciales||[], body.usuario||'');
      propsCE.setProperty('CABINA_SS_ID', ssCb.getId());
      try { logAccion_(ss, 'CABINA CREADA', ssCb.getUrl(), body.usuario); } catch(eLCE) {}
      return respJson({ok:true, url:ssCb.getUrl(), id:ssCb.getId()});
    }

    // ── CABINA: reponer la base del Excel sobre la estructura EXISTENTE ──
    // Borra lo que haya en inventario/activos/protocolos/pasos y siembra de nuevo.
    // CONSUMOS y APERTURAS no se tocan. Solo admins, con doble confirmacion en el app.
    if (body.accion === 'cabinaResembrar') {
      var rolRS = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolRS!=='admin' && rolRS!=='admin_master') return respJson({error:'Solo administradores'});
      var ssRS = _cabinaSS_(); if (!ssRS) return respJson({error:'Primero crea la estructura'});
      ['🧴 INVENTARIO CABINA','🛠 ACTIVOS','📋 PROTOCOLOS','📝 PROTOCOLO PASOS'].forEach(function(nH){
        var wH = ssRS.getSheetByName(nH);
        if (wH && wH.getLastRow() > 1) wH.getRange(2,1,wH.getLastRow()-1,wH.getMaxColumns()).clearContent();
      });
      var wPasRS = ssRS.getSheetByName('📝 PROTOCOLO PASOS');
      try { if (wPasRS && !(wPasRS.getRange(1,8).getValue()||'').toString()) wPasRS.getRange(1,8).setValue('MINUTOS').setFontWeight('bold').setBackground('#1A2744').setFontColor('white'); } catch(eH8b) {}
      _cabinaSembrar_(ssRS, body.faciales||[], body.usuario||'');
      try { logAccion_(ss, 'CABINA RESEMBRADA', 'base del Excel repuesta', body.usuario); } catch(eLRS) {}
      return respJson({ok:true});
    }

    // ── CABINA: guardar COSTOS FIJOS (reescribe las filas FIJO * de CONFIGURACION) ──
    if (body.accion === 'cabinaFijosGuardar') {
      var rolFJ = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolFJ!=='admin' && rolFJ!=='admin_master') return respJson({error:'Solo administradores'});
      var wsFJ = ss.getSheetByName('⚙ CONFIGURACION');
      if (!wsFJ) return respJson({error:'No existe ⚙ CONFIGURACION'});
      var dFJ = wsFJ.getDataRange().getValues();
      for (var fj = dFJ.length-1; fj >= 0; fj--) {
        if (/^FIJO\s+/i.test((dFJ[fj][0]||'').toString().trim())) wsFJ.deleteRow(fj+1);
      }
      var totFJ = 0;
      (body.items||[]).forEach(function(it){
        var kIt = (it.k||'').toString().trim().toUpperCase();
        if (!kIt) return;
        var vIt = parseFloat(it.v)||0;
        wsFJ.appendRow(['FIJO '+kIt, vIt||'']);
        totFJ += vIt;
      });
      try { logAccion_(ss, 'COSTOS FIJOS', '$'+totFJ.toFixed(2)+'/mes · '+(body.items||[]).length+' rubros', body.usuario); } catch(eLFJ) {}
      return respJson({ok:true, total:totFJ});
    }

    // ── CABINA: guardar producto de inventario (alta o edicion; solo admins) ──
    if (body.accion === 'cabinaSaveProducto') {
      var rolCP = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolCP!=='admin' && rolCP!=='admin_master') return respJson({error:'Solo administradores'});
      var ssCP = _cabinaSS_(); if (!ssCP) return respJson({error:'Estructura no creada'});
      var wCP = ssCP.getSheetByName('🧴 INVENTARIO CABINA');
      var cCP = body.campos||{};
      var contCP = parseFloat(cCP.contenido)||0, costoCP = parseFloat(cCP.costoEnvase)||0;
      var costoUniCP = contCP>0 ? costoCP/contCP : 0;
      var cerrCP = parseFloat(cCP.cerrados)||0, abCP = parseFloat(cCP.abierto)||0;
      var bodCP = parseFloat(cCP.bodega)||0;
      // STOCK TOTAL = todo lo que existe: local (cerrados+abierto) + bodega central
      var stockCP = (cerrCP+bodCP+abCP)*contCP;
      _cabInvHeaders_(wCP);
      var filaCP = [cCP.codigo||'', cCP.producto||'', cCP.proveedor||'', contCP, cCP.unidad||'ml', costoCP, costoUniCP, cerrCP, abCP, stockCP, parseFloat(cCP.minimo)||0, cCP.notas||'', (cCP.activo||'SI'), (cCP.skuCat||'').toString().trim().toUpperCase(), bodCP, (cCP.barras||'').toString().trim(), (cCP.base||'').toString().trim().toUpperCase(), (cCP.ubicacion||'').toString().trim().toUpperCase(), (cCP.ubicacionLocal||'').toString().trim().toUpperCase(), (cCP.ubicacionAbierto||'').toString().trim().toUpperCase(), Math.max(1, parseInt(cCP.maxAbiertos)||1)];
      var rowCP = parseInt(body.row)||0;
      if (rowCP >= 2 && rowCP <= wCP.getLastRow()) { wCP.getRange(rowCP,1,1,21).setValues([filaCP]); }
      else { filaCP[0] = filaCP[0] || _cabNext_(wCP,'INV-'); wCP.appendRow(filaCP); rowCP = wCP.getLastRow(); }
      return respJson({ok:true, row:rowCP, codigo:filaCP[0]});
    }

    // ── CABINA: nueva orden de compra ──
    if (body.accion === 'cabinaOCGuardar') {
      var rolOC = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolOC!=='admin' && rolOC!=='admin_master') return respJson({error:'Solo administradores'});
      var ssOC = _cabinaSS_(); if (!ssOC) return respJson({error:'Estructura no creada'});
      var itemsOC = (body.items||[]).filter(function(it){ return it.codigo && (parseFloat(it.envases)||0) > 0; });
      if (!itemsOC.length) return respJson({error:'La orden no tiene productos'});
      var provOC = (body.proveedor||'').toString().trim();
      if (!provOC) return respJson({error:'Falta el proveedor'});
      var wOC = _cabOCSheet_(ssOC);
      var totOC = 0;
      var itemsL = itemsOC.map(function(it){
        var e = parseFloat(it.envases)||0, c = parseFloat(it.costoEnvase)||0;
        totOC += e*c;
        return {codigo:it.codigo, producto:(it.producto||'').toString(), envases:e, costoEnvase:c};
      });
      var numOC = _cabNext_(wOC, 'OC-');
      wOC.appendRow([numOC, Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm'),
        provOC, JSON.stringify(itemsL), 'PENDIENTE', totOC, body.usuario||'', '', '']);
      try { logAccion_(ss, 'OC CABINA '+numOC, provOC+' — $'+totOC.toFixed(2), body.usuario); } catch(eLOC) {}
      return respJson({ok:true, num:numOC});
    }

    // ── CABINA: marcar orden RECIBIDA → suma envases al stock y actualiza costos ──
    if (body.accion === 'cabinaOCRecibir') {
      var rolOR = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolOR!=='admin' && rolOR!=='admin_master') return respJson({error:'Solo administradores'});
      var ssOR = _cabinaSS_(); if (!ssOR) return respJson({error:'Estructura no creada'});
      var wOR = _cabOCSheet_(ssOR);
      var rowOR = parseInt(body.row);
      if (!rowOR || rowOR < 2 || rowOR > wOR.getLastRow()) return respJson({error:'Fila inválida'});
      var fOR = wOR.getRange(rowOR,1,1,9).getValues()[0];
      if ((fOR[0]||'').toString().trim() !== (body.num||'').toString().trim()) return respJson({error:'La orden no coincide. Refresca.'});
      if ((fOR[4]||'').toString() !== 'PENDIENTE') return respJson({error:'Esta orden ya fue recibida'});
      var itemsOR = [];
      try { itemsOR = JSON.parse(fOR[3]||'[]'); } catch(eJP) {}
      var wInvOR = ssOR.getSheetByName('🧴 INVENTARIO CABINA');
      _cabInvHeaders_(wInvOR);
      var dInvOR = wInvOR.getDataRange().getValues();
      var noEnc = [];
      itemsOR.forEach(function(it){
        var filaP = 0;
        for (var ip = 1; ip < dInvOR.length; ip++) {
          if ((dInvOR[ip][0]||'').toString().trim() === it.codigo) { filaP = ip+1; break; }
        }
        if (!filaP) { noEnc.push(it.codigo); return; }
        var contP = parseFloat(dInvOR[filaP-1][3])||0;
        var abP = parseFloat(dInvOR[filaP-1][8])||0;
        var cerrLoc = parseFloat(dInvOR[filaP-1][7])||0;
        var cerrBod = parseFloat(dInvOR[filaP-1][14])||0;
        // La orden llega al LOCAL o a la BODEGA CENTRAL segun se marque al recibir
        if ((body.destino||'local') === 'bodega') { cerrBod += (it.envases||0); wInvOR.getRange(filaP,15).setValue(cerrBod); }
        else { cerrLoc += (it.envases||0); wInvOR.getRange(filaP,8).setValue(cerrLoc); }
        wInvOR.getRange(filaP,10).setValue((cerrLoc+cerrBod+abP)*contP);
        if ((it.costoEnvase||0) > 0) {
          wInvOR.getRange(filaP,6).setValue(it.costoEnvase);
          wInvOR.getRange(filaP,7).setValue(contP>0 ? it.costoEnvase/contP : 0);
        }
      });
      wOR.getRange(rowOR,5).setValue('RECIBIDA');
      wOR.getRange(rowOR,8).setValue(Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm'));
      wOR.getRange(rowOR,9).setValue(body.usuario||'');
      try { logAccion_(ss, 'OC CABINA RECIBIDA', (fOR[0]||'')+'', body.usuario); } catch(eLOR) {}
      return respJson({ok:true, noEncontrados:noEnc});
    }

    // ── FASE 2 — MODO ESPEJO (demo) ──
    // Barrido idempotente: lee los faciales de los tickets de los ultimos N dias,
    // les aplica el protocolo VIGENTE y registra el consumo teorico en CONSUMOS
    // con MODO=ESPEJO. NO descuenta stock. Reporta errores: faciales sin
    // protocolo, protocolos sin pasos, pasos con producto inexistente/inactivo.
    if (body.accion === 'fase2Espejo') {
      var rolF2 = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolF2!=='admin' && rolF2!=='admin_master') return respJson({error:'Solo administradores'});
      var ssF2 = _cabinaSS_(); if (!ssF2) return respJson({error:'Estructura de cabina no creada'});
      var diasF2 = Math.min(60, Math.max(1, parseInt(body.dias)||7));
      // Protocolos vigentes por nombre normalizado
      var wProF2 = ssF2.getSheetByName('📋 PROTOCOLOS');
      var wPasF2 = ssF2.getSheetByName('📝 PROTOCOLO PASOS');
      var dProF2 = wProF2 ? wProF2.getDataRange().getValues() : [];
      var dPasF2 = wPasF2 ? wPasF2.getDataRange().getValues() : [];
      var protPorNombre = {};
      for (var pf = 1; pf < dProF2.length; pf++) {
        var rP = dProF2[pf];
        if (((rP[3]||'')+'').trim() !== 'SI') continue;
        var skuF = (rP[0]||'').toString().trim();
        var verF = parseInt(rP[2])||1;
        var pasosF = [];
        for (var qf = 1; qf < dPasF2.length; qf++) {
          var rQ = dPasF2[qf];
          if ((rQ[0]||'').toString().trim()===skuF && (parseInt(rQ[1])||0)===verF && (rQ[4]||'').toString().trim()) {
            pasosF.push({cod:(rQ[4]||'').toString().trim(), cant:parseFloat(rQ[5])||0, uni:(rQ[6]||'').toString()});
          }
        }
        var objProtF2 = {sku:skuF, nombre:(rP[1]||'').toString(), version:verF, pasos:pasosF};
        protPorNombre[_normNombre_((rP[1]||'').toString())] = objProtF2;
        protPorNombre[_normNombre_(skuF)] = objProtF2; // tambien por codigo: la col T puede traer 'SUNSU-01'
      }
      // Inventario de cabina: existencia y estado de cada producto
      var wInvF2 = ssF2.getSheetByName('🧴 INVENTARIO CABINA');
      var invF2 = {};
      if (wInvF2) wInvF2.getDataRange().getValues().slice(1).forEach(function(r){
        var c=(r[0]||'').toString().trim();
        if (!c) return;
        var contF2i = parseFloat(r[3])||0;
        var stockF2i = (parseFloat(r[7])||0)*contF2i + (parseFloat(r[8])||0) + (parseFloat(r[14])||0)*contF2i;
        invF2[c] = {producto:(r[1]||'').toString(), activo:((r[12]||'SI')+'').trim(), stock:stockF2i, unidad:(r[4]||'').toString()};
      });
      // CONSUMOS: asegurar encabezados + llaves ya registradas (idempotencia)
      var wConF2 = ssF2.getSheetByName('📉 CONSUMOS');
      if (!wConF2) wConF2 = ssF2.insertSheet('📉 CONSUMOS');
      if (wConF2.getLastRow() < 1 || !(wConF2.getRange(1,1).getValue()||'').toString()) {
        wConF2.getRange(1,1,1,12).setValues([['FECHA CÁLCULO','FECHA TICKET','TK','FACIAL','SKU','vPROT','COSMETÓLOGA','PRODUCTO COD','PRODUCTO','CANTIDAD','UNIDAD','MODO']])
          .setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
        wConF2.setFrozenRows(1);
      }
      var yaF2 = {};
      if (wConF2.getLastRow() > 1) {
        wConF2.getRange(2,3,wConF2.getLastRow()-1,3).getValues().forEach(function(r){
          yaF2[(r[0]||'')+'|'+(r[2]||'')] = true;
        });
      }
      // Tickets recientes
      var wsTkF2 = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsTkF2) return respJson({error:'No hay TICKET_FICHA'});
      var lastTkF2 = wsTkF2.getLastRow();
      // getLastRow() MIENTE en hojas con formulas/checkboxes pre-llenados hasta
      // abajo: devuelve el final del FORMATO, no de los DATOS. Se busca la ultima
      // fila cuyo Timestamp (col A) tenga algo, y la ventana de 500 arranca ahi.
      var colAF2 = wsTkF2.getRange(1,1,lastTkF2,1).getValues();
      var finTkF2 = 0;
      for (var zf = lastTkF2-1; zf >= 1; zf--) {
        var cz = colAF2[zf][0];
        if (cz instanceof Date || (cz!=null && String(cz).trim()!=='')) { finTkF2 = zf+1; break; }
      }
      if (finTkF2 < 2) return respJson({ok:true, reporte:{fecha:'', dias:diasF2, tickets:0, faciales:0, facialesNuevos:0, yaRegistrados:0, diagnostico:'TICKET_FICHA no tiene ninguna fila con Timestamp en la columna A', sinProtocolo:[], sinPasos:[], productosFaltantes:[], productosInactivos:[], top:[], impacto:[], facialesVistos:[]}});
      var iniTkF2 = Math.max(2, finTkF2-499);
      var headsF2 = wsTkF2.getRange(1,1,1,wsTkF2.getLastColumn()).getValues()[0];
      var colCosF2 = -1;
      for (var hc = 0; hc < headsF2.length; hc++) {
        var hT = (headsF2[hc]||'').toString().toUpperCase();
        if (hT.indexOf('COSMET')>=0 || hT.indexOf('ATENDI')>=0 || hT.indexOf('REALIZ')>=0) { colCosF2=hc; break; }
      }
      var dTkF2 = wsTkF2.getRange(iniTkF2,1,finTkF2-iniTkF2+1,wsTkF2.getLastColumn()).getValues();
      // La columna de FECHA se detecta POR DATOS: la que mas fechas reales tenga
      // en las ultimas 30 filas gana (los nombres enganian: 'Fecha retorno' casi
      // vacia le gano una vez a la columna real). Se excluyen columnas de
      // retorno/cumpleanos/proxima cita que tambien traen fechas pero no son LA fecha.
      var colFecF2 = 0, mejorHitsF2 = -1;
      var muestraF2 = dTkF2.slice(-30);
      for (var hf = 0; hf < headsF2.length; hf++) {
        var hTxtF2 = ((headsF2[hf]||'')+'').toUpperCase();
        if (hTxtF2.indexOf('RETORNO')>=0 || hTxtF2.indexOf('CUMPLE')>=0 || hTxtF2.indexOf('NACIM')>=0 || hTxtF2.indexOf('PROX')>=0 || hTxtF2.indexOf('PRÓX')>=0) continue;
        var hitsF2 = 0;
        for (var mf = 0; mf < muestraF2.length; mf++) { if (_fechaDe_(muestraF2[mf][hf])) hitsF2++; }
        if (hitsF2 > mejorHitsF2) { mejorHitsF2 = hitsF2; colFecF2 = hf; }
      }
      var corte = new Date(); corte.setDate(corte.getDate()-diasF2); corte.setHours(0,0,0,0);
      var hoyStr = Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm');
      var nTick=0, nFac=0, nNuevos=0, nYa=0;
      var vistoFac={};
      var sinProt={}, sinPasos={}, prodFalta={}, prodInactivo={};
      var nuevasFilas=[];
      for (var tf = 0; tf < dTkF2.length; tf++) {
        var rT = dTkF2[tf];
        var fT0 = _fechaDe_(rT[colFecF2]);
        if (!fT0) continue;
        if (fT0 < corte) continue;
        nTick++;
        var facT = (rT[19]||'').toString().trim();
        if (!facT || facT==='-' || facT==='—') continue;
        nFac++;
        vistoFac[facT]=(vistoFac[facT]||0)+1;
        var filaRealF2 = iniTkF2+tf;
        var nrmFacT = _normNombre_(facT);
        var protT = protPorNombre[nrmFacT];
        if (!protT) {
          // Fallback por contenido: 'Facial S.O.S (promo)' encuentra a 'Facial S.O.S';
          // 'SUNSU-01 x1' encuentra a SUNSU-01. Llaves cortas excluidas por seguridad.
          for (var kP in protPorNombre) {
            if (kP.length >= 6 && (nrmFacT.indexOf(kP) >= 0 || kP.indexOf(nrmFacT) >= 0)) { protT = protPorNombre[kP]; break; }
          }
        }
        if (!protT) { sinProt[facT]=(sinProt[facT]||0)+1; continue; }
        if (yaF2['TK:'+filaRealF2+'|'+protT.sku]) { nYa++; continue; }
        if (!protT.pasos.length) { sinPasos[protT.sku]=(sinPasos[protT.sku]||0)+1; continue; }
        var cosT = colCosF2>=0 ? (rT[colCosF2]||'').toString() : '';
        var fTk = Utilities.formatDate(fT0,'America/Guayaquil','dd/MM/yyyy');
        // agrupar por producto dentro del facial
        var porProd = {};
        protT.pasos.forEach(function(ps){
          if (!porProd[ps.cod]) porProd[ps.cod]={cant:0, uni:ps.uni};
          porProd[ps.cod].cant += ps.cant;
        });
        Object.keys(porProd).forEach(function(cod){
          var infoP = invF2[cod];
          if (!infoP) { prodFalta[protT.sku+' → '+cod]=true; }
          else if (infoP.activo==='NO') { prodInactivo[protT.sku+' → '+cod+' ('+infoP.producto+')']=true; }
          nuevasFilas.push([hoyStr, fTk, 'TK:'+filaRealF2, facT, protT.sku, protT.version, cosT,
            cod, infoP?infoP.producto:'(no existe)', porProd[cod].cant, porProd[cod].uni, 'ESPEJO']);
        });
        yaF2['TK:'+filaRealF2+'|'+protT.sku]=true;
        nNuevos++;
      }
      if (nuevasFilas.length) wConF2.getRange(wConF2.getLastRow()+1,1,nuevasFilas.length,12).setValues(nuevasFilas);
      // Top de consumo teorico del periodo (todo lo ESPEJO registrado en el rango)
      var topF2 = {};
      if (wConF2.getLastRow() > 1) {
        wConF2.getRange(2,1,wConF2.getLastRow()-1,12).getValues().forEach(function(r){
          if ((r[11]||'')!=='ESPEJO') return;
          var k=(r[7]||'')+'';
          if (!topF2[k]) topF2[k]={producto:(r[8]||'')+'', cant:0, uni:(r[10]||'')+''};
          topF2[k].cant += parseFloat(r[9])||0;
        });
      }
      var topArr = Object.keys(topF2).map(function(k){ return {cod:k, producto:topF2[k].producto, cant:Math.round(topF2[k].cant*10)/10, uni:topF2[k].uni}; })
        .sort(function(a,b){ return b.cant-a.cant; }).slice(0,15);
      // Diagnostico cuando no se hallo nada: mostrar que hay en la celda de fecha
      var diagF2 = '';
      if (nTick === 0 && dTkF2.length) {
        var ultF2 = dTkF2[dTkF2.length-1];
        var fUltF2 = _fechaDe_(ultF2[colFecF2]);
        diagF2 = 'Datos reales hasta la fila '+finTkF2+'. Leí '+dTkF2.length+' filas (de la '+iniTkF2+' a la '+finTkF2+'); columna FECHA: '+(colFecF2+1)+' ("'+((headsF2[colFecF2]||'')+'')+'"); último ticket: '+(fUltF2?Utilities.formatDate(fUltF2,'America/Guayaquil','dd/MM/yyyy'):'"'+((ultF2[colFecF2]==null?'':ultF2[colFecF2])+'').toString().slice(0,25)+'"')+'. Si esa fecha es vieja, sube los días del barrido.';
      }
      // La parte que se SIENTE: si Fase 2 hubiera estado viva, asi quedaba el stock
      var impactoF2 = topArr.map(function(t){
        var iP = invF2[t.cod];
        var hoyS = iP ? Math.round(iP.stock*10)/10 : null;
        return {cod:t.cod, producto:t.producto, hoy:hoyS, consumo:t.cant, uni:t.uni,
          quedaria: hoyS===null ? null : Math.round((hoyS-t.cant)*10)/10};
      });
      var facialesVistos = Object.keys(vistoFac).map(function(k){return {nombre:k, n:vistoFac[k]};})
        .sort(function(a,b){return b.n-a.n;}).slice(0,12);
      var reporteF2 = {fecha:hoyStr, dias:diasF2, tickets:nTick, faciales:nFac, facialesNuevos:nNuevos, yaRegistrados:nYa, diagnostico:diagF2, impacto:impactoF2, facialesVistos:facialesVistos,
        sinProtocolo:Object.keys(sinProt).map(function(k){return {nombre:k, n:sinProt[k]};}).sort(function(a,b){return b.n-a.n;}),
        sinPasos:Object.keys(sinPasos), productosFaltantes:Object.keys(prodFalta), productosInactivos:Object.keys(prodInactivo),
        top:topArr};
      try { PropertiesService.getScriptProperties().setProperty('FASE2_REPORTE', JSON.stringify(reporteF2)); } catch(eRp) {}
      try { logAccion_(ss, 'FASE2 ESPEJO', nNuevos+' faciales nuevos · '+diasF2+' dias', body.usuario); } catch(eLF2) {}
      return respJson({ok:true, reporte:reporteF2});
    }

    // ── CABINA: CONVERTIR consumible ↔ activo (inventario unificado) ──
    // Mueve la fila entre hojas conservando lo compartido: nombre, proveedor,
    // notas, lugar, barras, ubicacion y la FOTO (se remapea al codigo nuevo).
    // Un consumible usado por un protocolo vigente NO se puede convertir.
    if (body.accion === 'cabinaConvertir') {
      var rolCV = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolCV!=='admin' && rolCV!=='admin_master') return respJson({error:'Solo administradores'});
      var ssCV = _cabinaSS_(); if (!ssCV) return respJson({error:'Estructura no creada'});
      var deCV = body.de==='act' ? 'act' : 'inv';
      var codCV = (body.codigo||'').toString().trim();
      var wInvCV = ssCV.getSheetByName('🧴 INVENTARIO CABINA');
      var wActCV = ssCV.getSheetByName('🛠 ACTIVOS');
      _cabInvHeaders_(wInvCV); _cabActHeaders_(wActCV);
      var wSrc = deCV==='inv' ? wInvCV : wActCV;
      var filaCV = 0;
      var dSrc = wSrc.getDataRange().getValues();
      for (var ic = 1; ic < dSrc.length; ic++) {
        if ((dSrc[ic][0]||'').toString().trim() === codCV) { filaCV = ic+1; break; }
      }
      if (!filaCV) return respJson({error:'No encontrado'});
      var rCV = dSrc[filaCV-1];
      if (deCV === 'inv') {
        // Proteccion: si un protocolo lo usa, primero reemplazalo ahi
        try {
          var wProCV = ssCV.getSheetByName('📋 PROTOCOLOS');
          if (wProCV) {
            var txtPro = JSON.stringify(wProCV.getDataRange().getValues());
            if (txtPro.indexOf('"'+codCV+'"') >= 0 || txtPro.indexOf(codCV) >= 0 && txtPro.indexOf('productoCod') >= 0 && txtPro.indexOf(codCV) >= 0) {
              if (txtPro.indexOf(codCV) >= 0) return respJson({error:'Un protocolo usa '+codCV+' — reemplázalo primero con 🔁'});
            }
          }
        } catch(ePr) {}
        // Presentaciones amarradas tampoco se convierten con el padre
        for (var ih = 1; ih < dSrc.length; ih++) {
          if ((dSrc[ih][16]||'').toString().trim() === codCV) return respJson({error:'Tiene presentaciones amarradas — sácalas de la familia primero'});
        }
        var nuevoCod = _cabNext_(wActCV, 'AC-');
        // Los envases pasan LADO A LADO: cerrados local → cantidad local; bodega → bodega
        var cLocCV = parseFloat(rCV[7])||0, cBodCV = parseFloat(rCV[14])||0;
        wActCV.appendRow([nuevoCod, (rCV[1]||'').toString(), 'Otros', cLocCV, (rCV[17]||'').toString(),
          'Buen estado', '', parseFloat(rCV[5])||'', (rCV[11]||'').toString(),
          (cBodCV>cLocCV?'BODEGA':'SUNSU'), (rCV[15]||'').toString(), (rCV[2]||'').toString(), cBodCV, 'unidad']);
      } else {
        var nuevoCod = _cabNext_(wInvCV, 'INV-');
        var costoAC = parseFloat(((rCV[7]||'')+'').replace(/[^0-9.]/g,''))||0;
        // Dos lados directos (con fallback para filas viejas por LUGAR)
        var cLocAC = parseFloat(rCV[3])||parseFloat(((rCV[3]||'')+'').replace(/[^0-9.]/g,''))||0;
        var cBodAC = parseFloat(rCV[12])||0;
        if (!(parseFloat(rCV[12])>=0) && ((rCV[9]||'SUNSU')+'').trim()==='BODEGA') { cBodAC=cLocAC; cLocAC=0; }
        var uniAC = ((rCV[13]||'unidad')+'').toString().trim()||'unidad';
        wInvCV.appendRow([nuevoCod, (rCV[1]||'').toString(), (rCV[11]||'').toString(), 1, uniAC, costoAC, costoAC,
          cLocAC, 0, cLocAC+cBodAC, 0, (rCV[8]||'').toString(), 'SI', '', cBodAC,
          (rCV[10]||'').toString(), '', ((rCV[4]||'')+'').toString().trim().toUpperCase()]);
      }
      // Remapear la foto al codigo nuevo
      try {
        var propsCV = PropertiesService.getScriptProperties();
        var mapaCV = JSON.parse(propsCV.getProperty('CABINA_FOTOS')||'{}');
        if (mapaCV[codCV]) { mapaCV[nuevoCod] = mapaCV[codCV]; delete mapaCV[codCV]; propsCV.setProperty('CABINA_FOTOS', JSON.stringify(mapaCV)); }
      } catch(eFcv) {}
      wSrc.deleteRow(filaCV);
      try { logAccion_(ss, 'CONVERTIR', codCV+' → '+nuevoCod+' ('+(deCV==='inv'?'consumible→activo':'activo→consumible')+')', body.usuario); } catch(eLCV) {}
      return respJson({ok:true, nuevo:nuevoCod});
    }

    // ── CABINA: DAR DE BAJA — producto (caducado, roto, contaminado) o activo ──
    // Descuenta stock del lado indicado (o vacia el abierto) dejando constancia:
    // razon OBLIGATORIA, foto opcional como comprobante. Los activos pasan a
    // estado DADO DE BAJA (no se borran: quedan como historial).
    if (body.accion === 'cabinaBaja') {
      var rolBJ = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolBJ!=='admin' && rolBJ!=='admin_master') return respJson({error:'Solo administradores'});
      var razonBJ = (body.razon||'').toString().trim();
      if (!razonBJ) return respJson({error:'La razón de la baja es obligatoria'});
      var ssBJ = _cabinaSS_(); if (!ssBJ) return respJson({error:'Estructura no creada'});
      var nombreBJ = '', cantBJ = '';
      if (body.tipo === 'activo') {
        var wABJ = ssBJ.getSheetByName('🛠 ACTIVOS');
        var rowBJ = parseInt(body.row);
        if (!rowBJ || rowBJ < 2 || rowBJ > wABJ.getLastRow()) return respJson({error:'Fila inválida'});
        if ((wABJ.getRange(rowBJ,1).getValue()||'').toString().trim() !== (body.codigo||'').toString().trim()) return respJson({error:'El activo no coincide. Refresca.'});
        nombreBJ = (wABJ.getRange(rowBJ,2).getValue()||'').toString();
        cantBJ = (wABJ.getRange(rowBJ,4).getValue()||'').toString();
        wABJ.getRange(rowBJ,6).setValue('DADO DE BAJA');
      } else {
        var wPBJ = ssBJ.getSheetByName('🧴 INVENTARIO CABINA');
        _cabInvHeaders_(wPBJ);
        var dPBJ = wPBJ.getDataRange().getValues();
        var filaBJ = 0;
        for (var ib = 1; ib < dPBJ.length; ib++) {
          if ((dPBJ[ib][0]||'').toString().trim() === (body.codigo||'').toString().trim()) { filaBJ = ib+1; break; }
        }
        if (!filaBJ) return respJson({error:'Producto no encontrado'});
        nombreBJ = (dPBJ[filaBJ-1][1]||'').toString();
        var contBJ = parseFloat(dPBJ[filaBJ-1][3])||0;
        var uniBJ = (dPBJ[filaBJ-1][4]||'').toString();
        var locBJ = parseFloat(dPBJ[filaBJ-1][7])||0;
        var abBJ = parseFloat(dPBJ[filaBJ-1][8])||0;
        var bodBJ = parseFloat(dPBJ[filaBJ-1][14])||0;
        var ladoBJ = body.lado||'local';
        if (ladoBJ === 'abierto') {
          if (abBJ <= 0) return respJson({error:'No hay envase abierto que dar de baja'});
          cantBJ = abBJ+' envase'+(abBJ===1?'':'s')+' abierto'+(abBJ===1?'':'s');
          abBJ = 0;
          wPBJ.getRange(filaBJ,9).setValue(0);
        } else {
          var nBJ = parseFloat(body.envases)||0;
          if (nBJ <= 0) return respJson({error:'Indica cuántos envases'});
          var dispBJ = ladoBJ==='bodega' ? bodBJ : locBJ;
          if (nBJ > dispBJ) return respJson({error:'Solo hay '+dispBJ+' en '+(ladoBJ==='bodega'?'bodega':'el local')});
          if (ladoBJ==='bodega') { bodBJ -= nBJ; wPBJ.getRange(filaBJ,15).setValue(bodBJ); }
          else { locBJ -= nBJ; wPBJ.getRange(filaBJ,8).setValue(locBJ); }
          cantBJ = nBJ+' envase'+(nBJ===1?'':'s')+' ('+(ladoBJ==='bodega'?'🏠 bodega':'🏪 local')+')';
        }
        wPBJ.getRange(filaBJ,10).setValue((locBJ+bodBJ+abBJ)*contBJ);
      }
      var wBJ = _cabBajasSheet_(ssBJ);
      var numBJ = _cabNext_(wBJ, 'BJ-');
      var fotoUrlBJ = '';
      if (body.fotoB64) {
        try {
          var propsBJ = PropertiesService.getScriptProperties();
          var carpBJ;
          var idCarpBJ = propsBJ.getProperty('CABINA_FOTOS_FOLDER');
          try { if (idCarpBJ) carpBJ = DriveApp.getFolderById(idCarpBJ); } catch(eCB) {}
          if (!carpBJ) { carpBJ = DriveApp.createFolder('SUNSU CABINA FOTOS'); propsBJ.setProperty('CABINA_FOTOS_FOLDER', carpBJ.getId()); }
          var fBJ = carpBJ.createFile(Utilities.newBlob(Utilities.base64Decode(body.fotoB64), 'image/jpeg', numBJ+'.jpg'));
          try { fBJ.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(eSB) {}
          fotoUrlBJ = 'https://lh3.googleusercontent.com/d/'+fBJ.getId();
        } catch(eFB) {}
      }
      wBJ.appendRow([numBJ, Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm'),
        (body.tipo==='activo'?'ACTIVO':'PRODUCTO'), (body.codigo||'').toString(), nombreBJ, cantBJ, razonBJ, body.usuario||'', fotoUrlBJ]);
      try { logAccion_(ss, 'BAJA '+numBJ, nombreBJ+' — '+razonBJ, body.usuario); } catch(eLBJ) {}
      return respJson({ok:true, num:numBJ});
    }

    // ── Clientas antiguas: cambiar ESTADO (agendada / reintento / no desea) ──
    if (body.accion === 'clientaAntiguaEstado') {
      var rolCE = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (!rolCE) return respJson({error:'Sesión inválida — vuelve a entrar'});
      var wsCE = ss.getSheetByName('📜 CLIENTAS ANTIGUAS');
      if (!wsCE) return respJson({error:'No hay clientas antiguas importadas'});
      if ((wsCE.getRange(1,9).getValue()||'').toString().trim() === '') {
        wsCE.getRange(1,9,1,2).setValues([['ESTADO','INTENTOS']]).setFontWeight('bold');
      }
      var cedCE = _cedAnt_(body.cedula);
      var mapaCE = { agendada:'AGENDADA', reintento:'REINTENTO', nodesea:'NO DESEA', contactada:'CONTACTADA' };
      var estCE = mapaCE[(body.estado||'').toString().toLowerCase()];
      if (!estCE) return respJson({error:'Estado inválido'});
      var dCE = wsCE.getDataRange().getValues();
      for (var ie2 = 1; ie2 < dCE.length; ie2++) {
        if (_cedAnt_(dCE[ie2][0]) !== cedCE) continue;
        var fCE = Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm');
        var intCE = parseFloat(dCE[ie2][9])||0;
        if (estCE === 'REINTENTO') intCE += 1;
        wsCE.getRange(ie2+1,7,1,4).setValues([[body.usuario||'', fCE, estCE, intCE]]);
        return respJson({ok:true, estado:estCE, intentos:intCE, por:body.usuario||'', fecha:fCE});
      }
      return respJson({error:'Cédula no encontrada'});
    }

    // ── Clientas antiguas: marcar CONTACTADA (quién y cuándo) ──
    if (body.accion === 'clientaAntiguaContactada') {
      var rolCA = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (!rolCA) return respJson({error:'Sesión inválida — vuelve a entrar'});
      var wsCA = ss.getSheetByName('📜 CLIENTAS ANTIGUAS');
      if (!wsCA) return respJson({error:'No hay clientas antiguas importadas'});
      var cedCA = _cedAnt_(body.cedula);
      var dCA = wsCA.getDataRange().getValues();
      for (var ic2 = 1; ic2 < dCA.length; ic2++) {
        if (_cedAnt_(dCA[ic2][0]) !== cedCA) continue;
        var fCA = Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm');
        wsCA.getRange(ic2+1,7,1,2).setValues([[body.usuario||'', fCA]]);
        return respJson({ok:true, por:body.usuario||'', fecha:fCA});
      }
      return respJson({error:'Cédula no encontrada'});
    }

    // ── CABINA: ACCESO RÁPIDO (todas, no solo admin) — abrir un envase cerrado
    // del local, o marcar que el abierto se acabó. Cada evento queda en la hoja
    // 🍾 APERTURAS con quién y cuándo. ──
    if (body.accion === 'cabinaAbrirRapido') {
      var rolAR = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (!rolAR) return respJson({error:'Sesión inválida — vuelve a entrar'});
      var ssAR = _cabinaSS_(); if (!ssAR) return respJson({error:'Estructura no creada'});
      var wAR = ssAR.getSheetByName('🧴 INVENTARIO CABINA');
      _cabInvHeaders_(wAR);
      var codAR = (body.codigo||'').toString().trim();
      var dAR = wAR.getDataRange().getValues();
      var filaAR = 0;
      for (var ia = 1; ia < dAR.length; ia++) {
        if ((dAR[ia][0]||'').toString().trim() === codAR) { filaAR = ia+1; break; }
      }
      if (!filaAR) return respJson({error:'Producto no encontrado'});
      var rAR = dAR[filaAR-1];
      var nomAR = (rAR[1]||'').toString();
      var contAR = parseFloat(rAR[3])||0;
      var uniAR = (rAR[4]||'').toString();
      var locAR = parseFloat(rAR[7])||0;
      var abAR = parseFloat(rAR[8])||0;
      var bodAR = parseFloat(rAR[14])||0;
      var accAR = '', cantAR = '';
      // La col ABIERTO cuenta ENVASES abiertos (no ml): abrir = 1 cerrado pasa a
      // 1 abierto; se acabo = 1 abierto entero desaparece del inventario.
      if (body.modo === 'abrir') {
        if (locAR <= 0) return respJson({error:'No hay envases cerrados en el local'});
        locAR -= 1; abAR += 1;
        wAR.getRange(filaAR,8).setValue(locAR);
        wAR.getRange(filaAR,9).setValue(abAR);
        accAR = 'APERTURA'; cantAR = '1 envase ('+contAR+uniAR+')';
      } else {
        if (abAR <= 0) return respJson({error:'No hay envase abierto'});
        abAR -= 1;
        wAR.getRange(filaAR,9).setValue(abAR);
        accAR = 'SE ACABO'; cantAR = '1 envase ('+contAR+uniAR+')';
      }
      wAR.getRange(filaAR,10).setValue((locAR+bodAR+abAR)*contAR);
      var wAp = ssAR.getSheetByName('🍾 APERTURAS');
      if (!wAp) {
        wAp = ssAR.insertSheet('🍾 APERTURAS');
        wAp.getRange(1,1,1,7).setValues([['NUM','FECHA','ACCIÓN','CÓDIGO','PRODUCTO','CANTIDAD','POR']]).setFontWeight('bold');
      }
      var numAp = _cabNext_(wAp, 'AP-');
      wAp.appendRow([numAp, Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm'), accAR, codAR, nomAR, cantAR, body.usuario||'']);
      try { logAccion_(ss, accAR+' '+numAp, nomAR+' — '+cantAR, body.usuario); } catch(eLAr) {}
      return respJson({ok:true, num:numAp, abierto:abAR, cerrados:locAR});
    }

    // ── CABINA: traspaso de envases entre BODEGA CENTRAL y LOCAL SUNSU ──
    // Valida que el origen tenga los envases, mueve, recalcula stock total y deja
    // el registro en 🚚 TRASPASOS. Los codigos son los mismos: solo cambia de lado.
    if (body.accion === 'cabinaTraspaso') {
      var rolTR = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolTR!=='admin' && rolTR!=='admin_master') return respJson({error:'Solo administradores'});
      var ssTR = _cabinaSS_(); if (!ssTR) return respJson({error:'Estructura no creada'});
      var deTR = body.de==='local' ? 'local' : 'bodega';
      var aTR = deTR==='local' ? 'bodega' : 'local';
      var itemsTR = (body.items||[]).filter(function(it){ return it.codigo && (parseFloat(it.envases)||0) > 0; });
      if (!itemsTR.length) return respJson({error:'El traspaso no tiene productos'});
      var wInvTR = ssTR.getSheetByName('🧴 INVENTARIO CABINA');
      _cabInvHeaders_(wInvTR);
      var dInvTR = wInvTR.getDataRange().getValues();
      // Primero validar TODO (o todo o nada), luego mover
      var plan = [], errores = [];
      itemsTR.forEach(function(it){
        var filaT = 0;
        for (var ip = 1; ip < dInvTR.length; ip++) {
          if ((dInvTR[ip][0]||'').toString().trim() === it.codigo) { filaT = ip+1; break; }
        }
        if (!filaT) { errores.push(it.codigo+': no existe'); return; }
        var n = parseFloat(it.envases)||0;
        var loc = parseFloat(dInvTR[filaT-1][7])||0;
        var bod = parseFloat(dInvTR[filaT-1][14])||0;
        var origen = deTR==='local' ? loc : bod;
        if (n > origen) { errores.push(it.codigo+': solo hay '+origen+' en '+(deTR==='local'?'el local':'bodega')); return; }
        plan.push({fila:filaT, n:n, loc:loc, bod:bod, cont:parseFloat(dInvTR[filaT-1][3])||0, ab:parseFloat(dInvTR[filaT-1][8])||0, producto:(dInvTR[filaT-1][1]||'').toString(), codigo:it.codigo});
      });
      if (errores.length) return respJson({error:'Traspaso rechazado: '+errores.join(' · ')});
      plan.forEach(function(pl){
        var nLoc = deTR==='local' ? pl.loc-pl.n : pl.loc+pl.n;
        var nBod = deTR==='local' ? pl.bod+pl.n : pl.bod-pl.n;
        wInvTR.getRange(pl.fila,8).setValue(nLoc);
        wInvTR.getRange(pl.fila,15).setValue(nBod);
        wInvTR.getRange(pl.fila,10).setValue((nLoc+nBod+pl.ab)*pl.cont);
      });
      var wTR = _cabTraspasoSheet_(ssTR);
      var numTR = _cabNext_(wTR, 'TR-');
      var rutaTR = (deTR==='bodega'?'🏠 Bodega → 🏪 Sunsu':'🏪 Sunsu → 🏠 Bodega');
      wTR.appendRow([numTR, Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm'),
        rutaTR, JSON.stringify(plan.map(function(pl){return {codigo:pl.codigo, producto:pl.producto, envases:pl.n};})), body.usuario||'', (body.notas||'').toString()]);
      try { logAccion_(ss, 'TRASPASO '+numTR, rutaTR+' · '+plan.length+' producto(s)', body.usuario); } catch(eLTR) {}
      return respJson({ok:true, num:numTR});
    }

    // ── CABINA: foto de producto → carpeta 'SUNSU CABINA FOTOS' en Drive ──
    // El app manda la imagen ya achicada en base64. Se guarda como CODIGO.jpg
    // (reemplazando la anterior si existia), se comparte por link y el mapa
    // codigo→fileId queda en propiedades para que getCabina arme las URLs.
    if (body.accion === 'cabinaFoto') {
      var rolFT = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolFT!=='admin' && rolFT!=='admin_master') return respJson({error:'Solo administradores'});
      var codFT = (body.codigo||'').toString().trim();
      if (!codFT || !body.dataB64) return respJson({error:'Faltan datos de la foto'});
      var propsFT = PropertiesService.getScriptProperties();
      var carpetaFT;
      var idCarp = propsFT.getProperty('CABINA_FOTOS_FOLDER');
      try { if (idCarp) carpetaFT = DriveApp.getFolderById(idCarp); } catch(eCF) {}
      if (!carpetaFT) {
        carpetaFT = DriveApp.createFolder('SUNSU CABINA FOTOS');
        propsFT.setProperty('CABINA_FOTOS_FOLDER', carpetaFT.getId());
      }
      var blobFT = Utilities.newBlob(Utilities.base64Decode(body.dataB64), body.mime||'image/jpeg', codFT+'.jpg');
      // Reemplazar la anterior si existia
      var mapaFT = {};
      try { mapaFT = JSON.parse(propsFT.getProperty('CABINA_FOTOS')||'{}'); } catch(eMF) {}
      if (mapaFT[codFT]) { try { DriveApp.getFileById(mapaFT[codFT]).setTrashed(true); } catch(eTR) {} }
      var fileFT = carpetaFT.createFile(blobFT);
      try { fileFT.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(eSH) {}
      mapaFT[codFT] = fileFT.getId();
      propsFT.setProperty('CABINA_FOTOS', JSON.stringify(mapaFT));
      return respJson({ok:true, url:'https://lh3.googleusercontent.com/d/'+fileFT.getId()});
    }

    // ── CABINA: activar / desactivar un producto de inventario ──
    if (body.accion === 'cabinaProductoActivo') {
      var rolPA = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolPA!=='admin' && rolPA!=='admin_master') return respJson({error:'Solo administradores'});
      var ssPA = _cabinaSS_(); if (!ssPA) return respJson({error:'Estructura no creada'});
      var wPA = ssPA.getSheetByName('🧴 INVENTARIO CABINA');
      _cabInvHeaders_(wPA);
      var rowPA = parseInt(body.row);
      if (!rowPA || rowPA < 2 || rowPA > wPA.getLastRow()) return respJson({error:'Fila inválida'});
      if ((wPA.getRange(rowPA,1).getValue()||'').toString().trim() !== (body.codigo||'').toString().trim()) return respJson({error:'La fila no coincide. Refresca.'});
      wPA.getRange(rowPA,13).setValue(body.activo==='NO' ? 'NO' : 'SI');
      return respJson({ok:true});
    }

    // ── CABINA: guardar activo ──
    if (body.accion === 'cabinaSaveActivo') {
      var rolCA = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolCA!=='admin' && rolCA!=='admin_master') return respJson({error:'Solo administradores'});
      var ssCA = _cabinaSS_(); if (!ssCA) return respJson({error:'Estructura no creada'});
      var wCA = ssCA.getSheetByName('🛠 ACTIVOS');
      var cCA = body.campos||{};
      _cabActHeaders_(wCA);
      // MODELO DE DOS LADOS (como los consumibles): D = cantidad LOCAL,
      // M = cantidad BODEGA, N = unidad. LUGAR (J) queda derivado del stock.
      var cLocCA = parseFloat(cCA.cantidadLocal)||0;
      var cBodCA = parseFloat(cCA.cantidadBodega)||0;
      var uniCA = (cCA.unidadC||'unidad').toString().trim()||'unidad';
      var filaCA = [cCA.codigo||'', cCA.activo||'', cCA.categoria||'', cLocCA, cCA.ubicacion||'', cCA.estado||'', cCA.fechaCompra||'', cCA.costo||'', cCA.notas||'', (cBodCA>cLocCA?'BODEGA':'SUNSU'), (cCA.barras||'').toString().trim(), (cCA.proveedor||'').toString().trim(), cBodCA, uniCA];
      var rowCA = parseInt(body.row)||0;
      if (rowCA >= 2 && rowCA <= wCA.getLastRow()) { wCA.getRange(rowCA,1,1,14).setValues([filaCA]); }
      else { filaCA[0] = filaCA[0] || _cabNext_(wCA,'AC-'); wCA.appendRow(filaCA); rowCA = wCA.getLastRow(); }
      return respJson({ok:true, row:rowCA, codigo:filaCA[0]});
    }

    // ── CABINA: borrar producto o activo (solo admins; con proteccion de uso) ──
    if (body.accion === 'cabinaBorrarFila') {
      var rolCB = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolCB!=='admin' && rolCB!=='admin_master') return respJson({error:'Solo administradores'});
      var ssCB = _cabinaSS_(); if (!ssCB) return respJson({error:'Estructura no creada'});
      var hojaCB = body.hoja==='act' ? '🛠 ACTIVOS' : '🧴 INVENTARIO CABINA';
      var wCB = ssCB.getSheetByName(hojaCB);
      var rowCB = parseInt(body.row);
      if (!rowCB || rowCB < 2 || rowCB > wCB.getLastRow()) return respJson({error:'Fila inválida'});
      var codCB = (body.codigo||'').toString().trim();
      var codRealCB = (wCB.getRange(rowCB,1).getValue()||'').toString().trim();
      if (codCB !== codRealCB) return respJson({error:'La fila no coincide. Refresca la lista.'});
      // Un producto de inventario NO se borra si algun protocolo VIGENTE lo usa
      if (body.hoja !== 'act') {
        var wProB = ssCB.getSheetByName('📋 PROTOCOLOS');
        var wPasB = ssCB.getSheetByName('📝 PROTOCOLO PASOS');
        var verVig = {};
        wProB.getDataRange().getValues().slice(1).forEach(function(r){
          var sk=(r[0]||'').toString().trim(); if (sk) verVig[sk] = parseInt(r[2])||1;
        });
        var usadoEn = [];
        wPasB.getDataRange().getValues().slice(1).forEach(function(r){
          var sk=(r[0]||'').toString().trim();
          if ((r[4]||'').toString().trim()===codCB && (parseInt(r[1])||0)===verVig[sk] && usadoEn.indexOf(sk)<0) usadoEn.push(sk);
        });
        if (usadoEn.length) return respJson({error:'No se puede borrar: lo usan los protocolos '+usadoEn.join(', ')+'. Quítalo de ahí primero.'});
      }
      wCB.deleteRow(rowCB);
      try { logAccion_(ss, 'CABINA BORRADO', hojaCB+' — '+codCB, body.usuario); } catch(eLB) {}
      return respJson({ok:true});
    }

    // ── CABINA: guardar protocolo (sube VERSION; los pasos viejos quedan de historial) ──
    if (body.accion === 'cabinaSaveProtocolo') {
      var rolCR = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolCR!=='admin' && rolCR!=='admin_master') return respJson({error:'Solo administradores'});
      var ssCR = _cabinaSS_(); if (!ssCR) return respJson({error:'Estructura no creada'});
      var skuCR = (body.sku||'').toString().trim();
      if (!skuCR) return respJson({error:'Falta el facial'});
      var wProR = ssCR.getSheetByName('📋 PROTOCOLOS');
      var wPasR = ssCR.getSheetByName('📝 PROTOCOLO PASOS');
      var dProR = wProR.getDataRange().getValues();
      var filaProR = 0, verNueva = 1;
      for (var pr = 1; pr < dProR.length; pr++) {
        if ((dProR[pr][0]||'').toString().trim() === skuCR) { filaProR = pr+1; verNueva = (parseInt(dProR[pr][2])||0)+1; break; }
      }
      var hoyCR = Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm');
      var filaVals = [skuCR, body.nombre||'', verNueva, 'SI', parseFloat(body.manoObra)||0, body.video||'', body.notas||'', hoyCR, body.usuario||''];
      if (filaProR) wProR.getRange(filaProR,1,1,9).setValues([filaVals]);
      else wProR.appendRow(filaVals);
      // Estructuras creadas antes de los tiempos: asegurar el encabezado MINUTOS
      try { if (!(wPasR.getRange(1,8).getValue()||'').toString()) wPasR.getRange(1,8).setValue('MINUTOS').setFontWeight('bold').setBackground('#1A2744').setFontColor('white'); } catch(eH8) {}
      // Pasos de la version nueva (los de versiones anteriores NO se tocan: historial)
      (body.pasos||[]).forEach(function(ps,pi){
        wPasR.appendRow([skuCR, verNueva, pi+1, ps.desc||'', ps.productoCod||'', parseFloat(ps.cantidad)||0, ps.unidad||'', parseFloat(ps.minutos)||0]);
      });
      try { logAccion_(ss, 'PROTOCOLO v'+verNueva, skuCR+' — '+(body.pasos||[]).length+' pasos', body.usuario); } catch(eLCR) {}
      return respJson({ok:true, version:verNueva});
    }

    if (body.accion === 'cumpleWaEnviado') {
      var keyCW = (body.clave||'').toString().trim();
      if (!keyCW) return respJson({error:'Falta la clave'});
      var propsCW = PropertiesService.getScriptProperties();
      var mapCW = {};
      try { mapCW = JSON.parse(propsCW.getProperty('SUNSU_CUMPLE_WA')||'{}'); } catch(eCW) {}
      mapCW[keyCW] = {ts: Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM-dd'), u:(body.usuario||'')};
      propsCW.setProperty('SUNSU_CUMPLE_WA', JSON.stringify(mapCW));
      return respJson({ok:true});
    }

    // ── CAJA CHICA V2: iniciar con saldo nuevo (solo admins, una sola vez) ──
    if (body.accion === 'cajaV2Iniciar') {
      var rolCI = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolCI!=='admin' && rolCI!=='admin_master') return respJson({error:'Solo administradores'});
      var montoCI = parseFloat(body.monto);
      if (isNaN(montoCI) || montoCI < 0) return respJson({error:'Monto inválido'});
      var wsCI = _cajaV2Sheet_(ss);
      if (wsCI.getLastRow() > 1) return respJson({error:'La caja ya fue iniciada'});
      _cajaV2Append_(wsCI, '⚖️ SALDO INICIAL', 'Apertura de caja chica', body.usuario||'', montoCI, 0, '', body.usuario||'');
      try { logAccion_(ss, 'CAJA V2 INICIADA', '$'+montoCI.toFixed(2), body.usuario); } catch(eCI) {}
      return respJson({ok:true});
    }

    // ── CAJA CHICA V2: descarga (con justificativo obligatorio) o depósito ──
    // ── PROPINAS ── La propina NO es venta (nunca al ticket ni a la factura):
    // es plata EN CUSTODIA para la cosmetologa. Registro propio en 💝 PROPINAS;
    // si llego en efectivo entra a caja como movimiento (cuadra con el billete
    // fisico); al pagarla, sale de caja. Todo con nombre y estado.
    if (body.accion === 'promoCrear') {
      var rolPC = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolPC!=='admin' && rolPC!=='admin_master') return respJson({error:'Solo administradores'});
      var nPC=(body.nombre||'').toString().trim(), vPC=parseFloat(body.valor)||0;
      var mecPC=(body.mecanismo||'%').toString().toUpperCase();
      var v2PC=parseFloat(body.valor2)||0;
      var codsPC=Array.isArray(body.codigos)?body.codigos.map(function(x){return (x||'').toString().trim();}).filter(function(x){return !!x;}):[];
      if(!nPC) return respJson({error:'Falta el nombre de la promo'});
      if(!body.desde || !body.hasta) return respJson({error:'Faltan fechas de vigencia'});
      // Validación por mecanismo. % sin códigos = promo v1 sobre el total (compatibilidad).
      if(mecPC==='%'){
        if(vPC<=0||vPC>100) return respJson({error:'El % debe estar entre 1 y 100'});
      } else if(mecPC==='$'){
        if(vPC<=0) return respJson({error:'El descuento $ debe ser mayor a 0'});
        if(!codsPC.length) return respJson({error:'El descuento $ necesita al menos un código'});
      } else if(mecPC==='NXM'){
        var nNX=Math.round(vPC), mNX=Math.round(v2PC);
        if(nNX<2||mNX<1||mNX>=nNX) return respJson({error:'N×M inválido: N≥2 y M<N (ej: 3×2)'});
        if(!codsPC.length) return respJson({error:'La promo N×M necesita al menos un código'});
        vPC=nNX; v2PC=mNX;
      } else if(mecPC==='PACK'){
        if(vPC<=0) return respJson({error:'Falta el precio especial del paquete'});
        var sesPK=Math.round(v2PC);
        if(sesPK<1||sesPK>6) return respJson({error:'Sesiones a registrar: entre 1 y 6'});
        if(codsPC.length!==1) return respJson({error:'Paquete reducido: exactamente 1 código (el paquete)'});
        v2PC=sesPK;
      } else {
        return respJson({error:'Mecanismo desconocido: '+mecPC});
      }
      var wsPC = ss.getSheetByName('🎉 PROMOS');
      if(!wsPC){
        wsPC = ss.insertSheet('🎉 PROMOS');
        wsPC.getRange(1,1,1,10).setValues([['NOMBRE','APLICA A','TIPO','VALOR','DESDE','HASTA','CREADA POR','ACTIVA','CODIGOS','VALOR2']])
          .setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
        wsPC.setFrozenRows(1);
      }
      // Hoja de v1: completar encabezados I/J una sola vez
      if((wsPC.getRange(1,9).getValue()||'').toString().trim()!=='CODIGOS'){
        wsPC.getRange(1,9,1,2).setValues([['CODIGOS','VALOR2']])
          .setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
      }
      var aplicaPC=codsPC.length?codsPC.join(', '):'Total';
      wsPC.getRange(_ultimaFilaDatos_(wsPC)+1,1,1,10).setValues([[nPC,aplicaPC,mecPC,vPC,
        (body.desde||'').toString(),(body.hasta||'').toString(),body.usuario||'','SI',codsPC.join(','),v2PC]]);
      var descLog=mecPC==='$'?('−$'+vPC):mecPC==='NXM'?(vPC+'×'+v2PC):mecPC==='PACK'?('paquete reducido $'+vPC+' · '+v2PC+' ses'):('−'+vPC+'%');
      try { logAccion_(ss,'PROMO CREADA',nPC+' '+descLog+' ['+aplicaPC+'] ('+body.desde+' a '+body.hasta+')',body.usuario); } catch(ePC){}
      return respJson({ok:true});
    }
    if (body.accion === 'promoDesactivar') {
      var rolPD = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolPD!=='admin' && rolPD!=='admin_master') return respJson({error:'Solo administradores'});
      var wsPD = ss.getSheetByName('🎉 PROMOS');
      var fPD = parseInt(body.fila)||0;
      if(!wsPD || fPD<2) return respJson({error:'Promo no hallada'});
      wsPD.getRange(fPD,8).setValue('NO');
      return respJson({ok:true});
    }

    if (body.accion === 'propinaRegistrar') {
      var cosP = (body.cosmetologa||'').toString().trim();
      var monP = parseFloat(body.monto);
      var viaP = (body.via||'').toString().trim() || 'Efectivo';
      var notaP = (body.nota||'').toString().trim();
      if (!cosP) return respJson({error:'Falta la cosmetologa'});
      if (isNaN(monP) || monP <= 0) return respJson({error:'Monto invalido'});
      var wsPr = ss.getSheetByName('💝 PROPINAS');
      if (!wsPr) {
        wsPr = ss.insertSheet('💝 PROPINAS');
        wsPr.getRange(1,1,1,8).setValues([['FECHA','COSMETÓLOGA','MONTO','VÍA','NOTA','ESTADO','PAGADA EL','REGISTRÓ']])
          .setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
        wsPr.setFrozenRows(1);
      }
      var filaPr = _ultimaFilaDatos_(wsPr)+1;
      wsPr.getRange(filaPr,1).setNumberFormat('@'); // FECHA TEXTO: evita date-flip US locale
      wsPr.getRange(filaPr,1,1,8).setValues([[Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm'),
        cosP, monP, viaP, notaP, 'PENDIENTE', '', body.usuario||'']]);
      // Efectivo fisico → entra a caja (para que el billete que ya metieron cuadre)
      if (viaP.toLowerCase().indexOf('efect') === 0) {
        var wsCjP = _cajaV2Sheet_(ss);
        if (wsCjP.getLastRow() > 1) _cajaV2Append_(wsCjP, '💝 PROPINA (entrada)', 'Propina para '+cosP+(notaP?' · '+notaP:''), cosP, monP, 0, 'PROP:'+filaPr, body.usuario||'');
      }
      try { logAccion_(ss, 'PROPINA', '$'+monP.toFixed(2)+' para '+cosP+' ('+viaP+')', body.usuario); } catch(ePr) {}
      return respJson({ok:true});
    }

    if (body.accion === 'propinaPagar') {
      var rolPP = _rolDeToken_(PropertiesService.getScriptProperties(), body.token||'');
      if (rolPP!=='admin' && rolPP!=='admin_master' && rolPP!=='reception') return respJson({error:'Solo administración o recepción'});
      var cosPP = (body.cosmetologa||'').toString().trim();
      if (!cosPP) return respJson({error:'Falta la cosmetologa'});
      var wsPr2 = ss.getSheetByName('💝 PROPINAS');
      if (!wsPr2) return respJson({error:'Sin propinas'});
      var finPr = _ultimaFilaDatos_(wsPr2);
      if (finPr < 2) return respJson({error:'Sin propinas'});
      var dPr = wsPr2.getRange(2,1,finPr-1,8).getValues();
      var totPP = 0, hoyPr = Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm');
      for (var zp = 0; zp < dPr.length; zp++) {
        if ((dPr[zp][1]||'').toString().trim() !== cosPP) continue;
        if ((dPr[zp][5]||'').toString().trim() !== 'PENDIENTE') continue;
        totPP += parseFloat(dPr[zp][2])||0;
        wsPr2.getRange(zp+2, 7).setNumberFormat('@'); // PAGADA EL TEXTO: evita date-flip
        wsPr2.getRange(zp+2, 6, 1, 2).setValues([['PAGADA', hoyPr]]);
      }
      if (totPP <= 0) return respJson({error:'No hay propinas pendientes de '+cosPP});
      // Salida de caja: se le paga en efectivo
      var wsCjP2 = _cajaV2Sheet_(ss);
      if (wsCjP2.getLastRow() > 1) _cajaV2Append_(wsCjP2, '💝 PAGO PROPINAS', 'Propinas de '+cosPP, cosPP, 0, totPP, '', body.usuario||'');
      try { logAccion_(ss, 'PROPINA PAGO', '$'+totPP.toFixed(2)+' a '+cosPP, body.usuario); } catch(ePr2) {}
      return respJson({ok:true, pagado:totPP, saldo:_cajaV2Saldo_(wsCjP2)});
    }

    if (body.accion === 'cajaV2Mov') {
      var tipoCV = (body.tipo||'').toString();
      var montoCV = parseFloat(body.monto);
      var justCV = (body.justificativo||'').toString().trim();
      // CUADRE: llega el CONTEO FÍSICO total; la diferencia contra el saldo del
      // app se calcula aquí y se registra como entrada O salida según el signo.
      if (tipoCV === 'cuadre') {
        var fisCQ = parseFloat(body.montoFisico);
        if (isNaN(fisCQ) || fisCQ < 0) return respJson({error:'Conteo físico inválido'});
        var justCQ = (body.justificativo||'').toString().trim();
        if (!justCQ) return respJson({error:'El cuadre necesita justificativo'});
        var wsCQ = _cajaV2Sheet_(ss);
        if (wsCQ.getLastRow() <= 1) return respJson({error:'La caja no está iniciada'});
        var saldoCQ = _cajaV2Saldo_(wsCQ);
        var difCQ = Math.round((fisCQ - saldoCQ)*100)/100;
        if (Math.abs(difCQ) < 0.005) return respJson({ok:true, saldo:saldoCQ, dif:0, msg:'La caja ya cuadra'});
        var quienCQ = (body.quien||body.usuario||'').toString().trim() || '—';
        if (difCQ > 0) _cajaV2Append_(wsCQ, '⚖️ CUADRE (entrada)', justCQ+' · físico $'+fisCQ.toFixed(2)+' vs app $'+saldoCQ.toFixed(2), quienCQ, difCQ, 0, '', body.usuario||'');
        else _cajaV2Append_(wsCQ, '⚖️ CUADRE (salida)', justCQ+' · físico $'+fisCQ.toFixed(2)+' vs app $'+saldoCQ.toFixed(2), quienCQ, 0, -difCQ, '', body.usuario||'');
        try { logAccion_(ss, 'CAJA V2 CUADRE', (difCQ>0?'+':'')+difCQ.toFixed(2)+' — '+justCQ, body.usuario); } catch(eCQ) {}
        return respJson({ok:true, saldo:_cajaV2Saldo_(wsCQ), dif:difCQ});
      }
      if (tipoCV!=='descarga' && tipoCV!=='deposito' && tipoCV!=='ajuste') return respJson({error:'Tipo inválido'});
      if (isNaN(montoCV) || montoCV <= 0) return respJson({error:'Monto inválido'});
      if ((tipoCV==='descarga'||tipoCV==='ajuste') && !justCV) return respJson({error:(tipoCV==='ajuste'?'El ajuste':'La descarga')+' necesita justificativo'});
      var wsCV = _cajaV2Sheet_(ss);
      if (wsCV.getLastRow() <= 1) return respJson({error:'La caja no está iniciada'});
      var saldoCV = _cajaV2Saldo_(wsCV);
      if (tipoCV!=='ajuste' && montoCV > saldoCV) return respJson({error:'Fondos insuficientes: saldo $'+saldoCV.toFixed(2)});
      var quienCV = (body.quien||'').toString().trim();
      if (!quienCV) return respJson({error:'Falta indicar quién hace la transacción'});
      var tipoTxt = tipoCV==='descarga' ? '💸 DESCARGA' : (tipoCV==='ajuste' ? '⚖️ AJUSTE (entrada)' : '🏦 DEPÓSITO');
      if (tipoCV==='ajuste') _cajaV2Append_(wsCV, tipoTxt, justCV, quienCV, montoCV, 0, '', body.usuario||'');
      else _cajaV2Append_(wsCV, tipoTxt, justCV||('Depósito'+(body.banco?' — '+body.banco:'')), quienCV, 0, montoCV, '', body.usuario||'');
      try { logAccion_(ss, 'CAJA V2 '+tipoCV.toUpperCase(), '$'+montoCV.toFixed(2)+' — '+justCV, body.usuario); } catch(eCV) {}
      return respJson({ok:true, saldo:_cajaV2Saldo_(wsCV)});
    }

    if (body.accion === 'segPaqWaEnviado') {
      var keyPW = (body.clave||'').toString().trim();
      if (!keyPW) return respJson({error:'Falta la clave'});
      var propsPW = PropertiesService.getScriptProperties();
      var mapPW = {};
      try { mapPW = JSON.parse(propsPW.getProperty('SUNSU_SEGPAQ_WA')||'{}'); } catch(ePW) {}
      mapPW[keyPW] = {ts: Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM-dd'), u:(body.usuario||'')};
      propsPW.setProperty('SUNSU_SEGPAQ_WA', JSON.stringify(mapPW));
      return respJson({ok:true});
    }

    // ── Cancelar una cita en Acuity: libera el horario en el calendario ──
    if (body.accion === 'cancelarCitaAcuity') {
      var aptIdCC = (body.aptId||'').toString().trim();
      if (!aptIdCC) return respJson({error:'Falta la cita'});
      var propCC = PropertiesService.getScriptProperties();
      var uidCC = propCC.getProperty('ACUITY_UID'), keyCC = propCC.getProperty('ACUITY_KEY');
      if (!uidCC || !keyCC) return respJson({error:'Sin credenciales Acuity'});
      var rCC = UrlFetchApp.fetch('https://acuityscheduling.com/api/v1/appointments/'+aptIdCC+'/cancel?admin=true', {
        method:'put', contentType:'application/json',
        headers:{'Authorization':'Basic '+Utilities.base64Encode(uidCC+':'+keyCC)},
        payload:JSON.stringify({}), muteHttpExceptions:true
      });
      var codCC = rCC.getResponseCode();
      if (codCC < 200 || codCC >= 300) return respJson({error:'Acuity respondio '+codCC});
      try { logAccion_(ss, 'CITA CANCELADA', 'cita '+aptIdCC+' - '+(body.detalle||''), body.usuario); } catch(eLC) {}
      return respJson({ok:true});
    }

    if (body.accion === 'seguimientoWaEnviado') {
      var rowWE  = parseInt(body.tkRow);
      var cedWE  = (body.cedula||'').toString().trim().split('.')[0];
      var keyWE  = cedWE || ((body.nombre||'')+' '+(body.apellido||'')).toLowerCase().trim();
      if (!rowWE || !keyWE) return respJson({error:'Parámetros inválidos'});
      var propsWE = PropertiesService.getScriptProperties();
      var segWE = {};
      try { segWE = JSON.parse(propsWE.getProperty('SUNSU_SEGUIMIENTO')||'{}'); } catch(eWE) {}
      var prevWE = (segWE[keyWE] && segWE[keyWE].tk === rowWE) ? segWE[keyWE] : null;
      // Solo anotar si no hay ya un resultado mas fuerte (nc/nd/sr) en este ciclo
      if (!prevWE || !prevWE.r || prevWE.r === 'we') {
        segWE[keyWE] = {tk:rowWE, r:'we', n:(prevWE&&prevWE.n)||0,
          u:(body.usuario||''), ts:Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM-dd')};
        propsWE.setProperty('SUNSU_SEGUIMIENTO', JSON.stringify(segWE));
      }
      return respJson({ok:true});
    }

    if (body.accion === 'resultadoSeguimiento') {
      var tipoRS = (body.tipo||'').toString(); // 'nc' = no contestó (reintento 15d, máx 3) | 'nd' = no desea (definitivo)
      var rowRS  = parseInt(body.tkRow);
      var cedRS  = (body.cedula||'').toString().trim().split('.')[0];
      var keyRS  = cedRS || ((body.nombre||'')+' '+(body.apellido||'')).toLowerCase().trim();
      if (!rowRS || !keyRS || (tipoRS!=='nc' && tipoRS!=='nd')) return respJson({error:'Parámetros inválidos'});
      var propsRS = PropertiesService.getScriptProperties();
      var segRS = {};
      try { segRS = JSON.parse(propsRS.getProperty('SUNSU_SEGUIMIENTO')||'{}'); } catch(eRS) {}
      var hoyRS = new Date();
      var prevRS = (segRS[keyRS] && segRS[keyRS].tk === rowRS) ? segRS[keyRS] : {n:0};
      var nuevoRS;
      if (tipoRS === 'nd') {
        nuevoRS = {tk:rowRS, r:'nd', n:(prevRS.n||0), u:(body.usuario||''), ts:Utilities.formatDate(hoyRS,'America/Guayaquil','yyyy-MM-dd')};
      } else {
        var intRS = (prevRS.n||0) + 1;
        var hastaRS = new Date(hoyRS.getTime() + 15*24*60*60*1000); // pausa de 15 dias (antes 7)
        nuevoRS = {tk:rowRS, r:(intRS>=3?'sr':'nc'), n:intRS,
          hasta:Utilities.formatDate(hastaRS,'America/Guayaquil','yyyy-MM-dd'),
          u:(body.usuario||''), ts:Utilities.formatDate(hoyRS,'America/Guayaquil','yyyy-MM-dd')};
      }
      // Cierre definitivo (no desea / 3 intentos sin respuesta):
      // escribir el motivo REAL en la columna SEGUIMIENTO → la fórmula M lo muestra
      // tal cual en el sheet y la clienta sale de la lista.
      if (nuevoRS.r === 'nd' || nuevoRS.r === 'sr') {
        var wsRS = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
        if (wsRS && rowRS >= 2 && rowRS <= wsRS.getLastRow()) {
          var cedRealRS = (wsRS.getRange(rowRS, 3).getValue()||'').toString().trim().split('.')[0];
          if (cedRS && cedRealRS && cedRS !== cedRealRS) {
            return respJson({error:'La fila no coincide. Refresca la lista e intenta de nuevo.'});
          }
          var hdrsRS = wsRS.getRange(1, 1, 1, wsRS.getLastColumn()).getValues()[0];
          var colSegRS = 0;
          for (var hs2 = 0; hs2 < hdrsRS.length; hs2++) { if ((hdrsRS[hs2]||'').toString().toUpperCase().indexOf('SEGUIMIENTO') >= 0) { colSegRS = hs2 + 1; break; } }
          if (colSegRS) {
            wsRS.getRange(rowRS, colSegRS).setValue(nuevoRS.r === 'nd' ? '🔕 No desea' : '📵 Sin respuesta');
          } else {
            wsRS.getRange(rowRS, 12).setValue(true); // fallback si aún no existe la columna SEGUIMIENTO
          }
          SpreadsheetApp.flush();
        }
      }
      if (nuevoRS.r === 'nd' || nuevoRS.r === 'sr') logAccion_(ss, '🔕 SEGUIMIENTO', 'clienta '+keyRS+' → '+(nuevoRS.r==='nd'?'no desea agendar':'sin respuesta (3 intentos)'), body.usuario);
      segRS[keyRS] = nuevoRS;
      propsRS.setProperty('SUNSU_SEGUIMIENTO', JSON.stringify(segRS));
      return respJson({ok:true, estado:nuevoRS.r, intentos:nuevoRS.n});
    }

    // ── Subir foto de comprobante de transferencia → Drive 'SUNSU COMPROBANTES' ──
    if (body.accion === 'subirComprobante') {
      try {
        var imgComp = (body.imagen||'').toString();
        if (!imgComp || imgComp.indexOf('base64,') < 0) return respJson({error:'Sin imagen'});
        var b64Comp = imgComp.split('base64,')[1];
        var mimeComp = imgComp.substring(5, imgComp.indexOf(';')) || 'image/jpeg';
        var carpetasC = DriveApp.getFoldersByName('SUNSU COMPROBANTES');
        var carpetaC = carpetasC.hasNext() ? carpetasC.next() : DriveApp.createFolder('SUNSU COMPROBANTES');
        var fechaC = Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM-dd HH.mm');
        var nombreC = 'Comprobante ' + fechaC + (body.nombre ? ' ' + body.nombre.toString().replace(/[^\w\s-]/g,'') : '') + '.jpg';
        var blobC = Utilities.newBlob(Utilities.base64Decode(b64Comp), mimeComp, nombreC);
        var fileC = carpetaC.createFile(blobC);
        fileC.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return respJson({ok:true, url:'https://drive.google.com/file/d/' + fileC.getId() + '/view'});
      } catch(eComp) {
        return respJson({error:'No se pudo subir: ' + eComp.message});
      }
    }

    // ── Eliminar registro de Gift Card digital del historial ──
    if (body.accion === 'eliminarGCDigital') {
      var codDel = (body.codigo||'').toString().trim();
      if (!codDel) return respJson({error:'Sin código'});
      var propsDel = PropertiesService.getScriptProperties();
      var storeDel = {};
      try { storeDel = JSON.parse(propsDel.getProperty('SUNSU_GC_DIGITALES')||'{}'); } catch(eD3) {}
      delete storeDel[codDel];
      propsDel.setProperty('SUNSU_GC_DIGITALES', JSON.stringify(storeDel));
      return respJson({ok:true});
    }

    // ── Guardar Gift Card digital generada (para historial/reenvío/edición) ──
    if (body.accion === 'guardarGCDigital') {
      var codGD = (body.codigo||'').toString().trim();
      if (!codGD) return respJson({error:'Sin código'});
      var propsGD = PropertiesService.getScriptProperties();
      var storeGD = {};
      try { storeGD = JSON.parse(propsGD.getProperty('SUNSU_GC_DIGITALES')||'{}'); } catch(eGD2) {}
      storeGD[codGD] = {
        para:    (body.para||'').toString(),
        de:      (body.de||'').toString(),
        facial:  (body.facial||'').toString(),
        mensaje: (body.mensaje||'').toString(),
        valido:  (body.valido||'').toString(),
        u:       (body.usuario||'').toString(),
        ts:      Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM-dd HH:mm'),
      };
      propsGD.setProperty('SUNSU_GC_DIGITALES', JSON.stringify(storeGD));
      return respJson({ok:true});
    }

    // ── Marcar clienta como agendada (seguimiento) — checkbox col L ──
    // ── Marcar VARIAS clientas como agendadas en una sola llamada (lote) ──
    // Cada item valida fila+cedula individualmente: si una no coincide se salta
    // (lista desactualizada) y se reporta, sin frenar a las demas.
    if (body.accion === 'marcarAgendadasLote') {
      var wsAgL = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsAgL) return respJson({error:'No TICKET_FICHA'});
      var itemsAgL = body.items||[];
      if (!itemsAgL.length) return respJson({error:'Lista vacia'});
      var okAgL = [], failAgL = [];
      var propsAgL = PropertiesService.getScriptProperties();
      var segAgL = {};
      try { segAgL = JSON.parse(propsAgL.getProperty('SUNSU_SEGUIMIENTO')||'{}'); } catch(eSgL) {}
      itemsAgL.forEach(function(itL){
        var rowL = parseInt(itL.tkRow);
        if (!rowL || rowL < 2 || rowL > wsAgL.getLastRow()) { failAgL.push(itL.tkRow); return; }
        var cedL = (itL.cedula||'').toString().trim().split('.')[0];
        var cedRealL = (wsAgL.getRange(rowL, 3).getValue()||'').toString().trim().split('.')[0];
        if (cedL && cedRealL && cedL !== cedRealL) { failAgL.push(itL.tkRow); return; }
        wsAgL.getRange(rowL, 12).setValue(true); // L = Agendado
        okAgL.push(itL.tkRow);
        var keyL = cedL || ((itL.nombre||'')+' '+(itL.apellido||'')).toLowerCase().trim();
        if (keyL) segAgL[keyL] = {tk: rowL, r:'ag', f: Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM-dd')};
      });
      try { propsAgL.setProperty('SUNSU_SEGUIMIENTO', JSON.stringify(segAgL)); } catch(eSvL) {}
      try { logAccion_(ss, 'SEGUIMIENTO LOTE', okAgL.length+' agendadas'+(failAgL.length?(', '+failAgL.length+' no coincidieron'):''), body.usuario); } catch(eLgL) {}
      return respJson({ok:true, marcadas:okAgL, fallidas:failAgL});
    }

    if (body.accion === 'marcarAgendada') {
      var wsAg = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsAg) return respJson({error:'No TICKET_FICHA'});
      var rowAg = parseInt(body.tkRow);
      if (!rowAg || rowAg < 2 || rowAg > wsAg.getLastRow()) return respJson({error:'Fila inválida'});
      // Verificación de identidad (col C = cédula) por si la lista quedó desactualizada
      var cedAg  = (body.cedula||'').toString().trim().split('.')[0];
      var cedRealAg = (wsAg.getRange(rowAg, 3).getValue()||'').toString().trim().split('.')[0];
      if (cedAg && cedRealAg && cedAg !== cedRealAg) return respJson({error:'La fila no coincide. Refresca la lista e intenta de nuevo.'});
      wsAg.getRange(rowAg, 12).setValue(true); // L = Agendado → M cambia a ✅ Agendada por fórmula
      // Registrar en la memoria de seguimiento para estadísticas de efectividad
      try {
        var propsAg = PropertiesService.getScriptProperties();
        var segAg = JSON.parse(propsAg.getProperty('SUNSU_SEGUIMIENTO')||'{}');
        var keyAg = (body.cedula||'').toString().trim().split('.')[0] || ((body.nombre||'')+' '+(body.apellido||'')).toLowerCase().trim();
        if (keyAg) { segAg[keyAg] = {tk:rowAg, r:'ag', u:(body.usuario||''), ts:Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM-dd')}; propsAg.setProperty('SUNSU_SEGUIMIENTO', JSON.stringify(segAg)); }
      } catch(eAg2) {}
      logAccion_(ss, '✅ SEGUIMIENTO', 'fila '+rowAg+' marcada agendada', body.usuario);
      SpreadsheetApp.flush();
      return respJson({ok:true});
    }

    // ── Eliminar ticket completo (admin) — borra toda la fila ──
    if (body.accion === 'eliminarTicket') {
      var wsDel = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsDel) return respJson({error:'No TICKET_FICHA'});
      var rowDel = parseInt(body.tkRow);
      if (!rowDel || rowDel < 2 || rowDel > wsDel.getLastRow()) return respJson({error:'Fila inválida'});
      // Verificación de identidad: el nombre de la fila debe coincidir con el del app,
      // para NUNCA borrar la fila equivocada si la lista quedó desactualizada
      // (las filas se corren al eliminar). Cols TICKET_FICHA: C=cédula, D=nombre, E=apellido.
      var nomDel  = (body.nombre||'').toString().trim().toLowerCase();
      var apeDel  = (body.apellido||'').toString().trim().toLowerCase();
      var nomReal = (wsDel.getRange(rowDel, 4).getValue()||'').toString().trim().toLowerCase();
      var apeReal = (wsDel.getRange(rowDel, 5).getValue()||'').toString().trim().toLowerCase();
      if (nomDel && nomReal && (nomDel !== nomReal || (apeDel && apeReal && apeDel !== apeReal))) {
        return respJson({error:'El ticket #'+rowDel+' ya no coincide ('+nomReal+' '+apeReal+'). Refresca la lista e intenta de nuevo.'});
      }
      logAccion_(ss, '🗑️ ELIMINAR TICKET', 'fila '+rowDel+' — '+nomReal+' '+apeReal, body.usuario);
      wsDel.deleteRow(rowDel);
      SpreadsheetApp.flush();
      return respJson({ok:true});
    }

    // ── Excluir ticket de comisión (checkboxes EXCLUIR, detectados por encabezado) ──
    if (body.accion === 'excluirComision') {
      var wsExcl = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsExcl) return respJson({error:'No TICKET_FICHA'});
      var rowExcl = parseInt(body.tkRow);
      var hdrsExcl = wsExcl.getRange(1, 1, 1, wsExcl.getLastColumn()).getValues()[0];
      var EXCLX = exclColsFromHeaders_(hdrsExcl);
      // Preferir 'tipo' (facial|paquete|producto); 'col' numérico solo como fallback legacy
      var tipoExcl = (body.tipo||'').toString();
      var colExcl = EXCLX[tipoExcl] || parseInt(body.col);
      var colsValidas = [EXCLX.facial, EXCLX.paquete, EXCLX.producto, EXCLX.extras];
      if (!rowExcl || rowExcl < 2 || !colExcl || colsValidas.indexOf(colExcl) < 0) return respJson({error:'Parámetros inválidos'});
      var valorExcl = body.valor === true || body.valor === 'true';
      wsExcl.getRange(rowExcl, colExcl).setValue(valorExcl);
      logAccion_(ss, valorExcl ? '❌ EXCLUIR COMISIÓN' : '↩️ INCLUIR COMISIÓN', 'ticket fila '+rowExcl+' · '+(tipoExcl||('col '+colExcl)), body.usuario);
      // If the cell has a checkbox, the setValue(true/false) will check/uncheck it
      return ContentService.createTextOutput(JSON.stringify({ok:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── Editar ticket desde la app ──
    if (body.accion === 'editarTicket') {
      var wsEd = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
      if (!wsEd) return respJson({error:'No TICKET_FICHA'});
      var row = parseInt(body.tkRow);
      if (!row || row < 2) return respJson({error:'Fila inválida'});
      // Exact same columns as doPost ticket creation:
      // C=3: Cédula, D=4: Nombre, E=5: Apellido
      // I=9: tipo cobro (comp), J=10: $$ Estimado, K=11: Fecha retorno
      // N=14: Recomendaciones, O=15: Notas
      // Q=17: colQ (paquete canje), R=18: colR (GC canje), S=19: colS (venta GC)
      // T=20: Facial hecho, U=21: Pack x3, V=22: Pack x6, W=23: Extras
      // Y-BB (25-54): productos por SKU
      if (body.cedula        !== undefined) wsEd.getRange(row, 3).setNumberFormat('@').setValue(body.cedula||'');
      if (body.nombre        !== undefined) wsEd.getRange(row, 4).setValue(body.nombre||'');
      if (body.apellido      !== undefined) wsEd.getRange(row, 5).setValue(body.apellido||'');
      if (body.cobro         !== undefined) wsEd.getRange(row, 9).setValue(body.cobro||'');
      if (body.estimado      !== undefined) wsEd.getRange(row, 10).setValue(parseFloat(body.estimado)||0);
      if (body.fechaRetorno  !== undefined && body.fechaRetorno) wsEd.getRange(row, 11).setValue(body.fechaRetorno);
      if (body.recomendaciones !== undefined) wsEd.getRange(row, 14).setValue(body.recomendaciones||'');
      if (body.notas         !== undefined) wsEd.getRange(row, 15).setValue(body.notas||'');
      if (body.colR          !== undefined) wsEd.getRange(row, 18).setValue(body.colR||'');
      if (body.colS          !== undefined) wsEd.getRange(row, 19).setValue(body.colS||'');
      if (body.facial        !== undefined) wsEd.getRange(row, 20).setValue(body.facial||'');
      if (body.pack3         !== undefined) wsEd.getRange(row, 21).setValue(body.pack3||'');
      if (body.pack6         !== undefined) wsEd.getRange(row, 22).setValue(body.pack6||'');
      if (body.extras        !== undefined) wsEd.getRange(row, 23).setValue(body.extras||'');
      // Productos: columnas leídas de los ENCABEZADOS (automático al agregar productos)
      var hdrsEd = wsEd.getRange(1, 1, 1, wsEd.getLastColumn()).getValues()[0];
      var mapaProdEd = prodColsFromHeaders_(hdrsEd);
      var prodColMapEd = body.prodColMap || {};
      var productosEd  = body.productos  || {};
      Object.keys(productosEd).forEach(function(sku) {
        var colIdx = mapaProdEd[sku] || prodColMapEd[sku];
        if (!colIdx) {
          var codeE = _skuCodigoProd_(sku);
          if (codeE) {
            colIdx = _insertarColumnaProducto_(wsEd, codeE);
            hdrsEd = wsEd.getRange(1, 1, 1, wsEd.getLastColumn()).getValues()[0];
            mapaProdEd = prodColsFromHeaders_(hdrsEd);
            if (!colIdx) colIdx = mapaProdEd[sku] || mapaProdEd[codeE] || mapaProdEd['SUNSU-'+codeE];
          }
        }
        if (colIdx && colIdx >= 25) {
          wsEd.getRange(row, colIdx).setValue(productosEd[sku]||0);
        }
      });
      return ContentService.createTextOutput(JSON.stringify({ok:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var wsTicket = ss.getSheets().filter(function(s){
      return s.getName().includes('TICKET_FICHA');
    })[0];
    if (!wsTicket) return respJson({error: 'No se encontró TICKET_FICHA'});

    var body = JSON.parse(e.postData.contents);

    // ── Buscar última fila real por columna A (Timestamp) ──
    // getLastRow() falla porque el sheet tiene FALSE en otras cols más abajo
    var colA = wsTicket.getRange('A:A').getValues();
    var lastDataRow = 1;
    for (var i = 1; i < colA.length; i++) {
      var val = colA[i][0];
      if (val !== '' && val !== null && val !== undefined && val !== false) {
        lastDataRow = i + 1; // 1-based
      }
    }
    var targetRow = lastDataRow + 1; // siguiente fila disponible

    // ── Construir fila dinámica: leer encabezados para saber hasta dónde llegan los productos ──
    var hdrsTk = wsTicket.getRange(1, 1, 1, wsTicket.getLastColumn()).getValues()[0];
    var mapaProdHdr = prodColsFromHeaders_(hdrsTk);
    var anchoFila = 61;
    Object.keys(mapaProdHdr).forEach(function(k){ if (mapaProdHdr[k] > anchoFila) anchoFila = mapaProdHdr[k]; });
    var row = [];
    for (var i = 0; i < anchoFila; i++) row.push('');

    // Timestamp con fecha Y hora en formato Ecuador MM/dd/yyyy
    var now = new Date();
    row[0]  = Utilities.formatDate(now, "America/Guayaquil", "MM/dd/yyyy HH:mm:ss"); // A
    row[1]  = body.cosmetologa    || '';  // B  Atendido por
    row[2]  = body.cedula         || '';  // C  Cédula / ID
    row[3]  = body.nombre         || '';  // D  Nombre
    row[4]  = body.apellido       || '';  // E  Apellido
    // F(5) G(6) H(7) I(8) — NO TOCAR, tienen fórmulas/checkboxes
    row[9]  = body.estimado       || '';  // J  $$ Estimado (total a cobrar cliente)
    row[10] = body.fechaRetorno   || '';  // K  Fecha retorno
    row[13] = body.recomendaciones|| '';  // N  Recomendaciones
    // El descuento aplicado viaja pegado a las notas — visible en historial y auditable
    if (body.descuento) body.notas = ((body.notas||'')+' · 🏷 Descuento: '+body.descuento).trim();
    row[14] = body.notas          || '';  // O  Notas generales
    row[16] = body.colQ           || '';  // Q  Paquete? "SI, 1/3, nota"
    row[17] = body.colR           || '';  // R  Gift Card canje "SI, codigo"
    row[18] = body.colS           || '';  // S  Venta Gift Card
    row[19] = body.facial         || '';  // T  Facial hecho "SUNSU-04 NOMBRE"
    row[20] = body.pack3          || '';  // U  Pack x3
    row[21] = body.pack6          || '';  // V  Pack x6
    row[22] = body.extras         || '';  // W  Extras / Add-ons [CORTESIA] si aplica

    // Productos → columna leída de los ENCABEZADOS de TICKET_FICHA (automático al agregar productos)
    // El prodColMap del cliente queda solo como fallback si el encabezado no existe
    var prodColMap = body.prodColMap || {};
    var productos  = body.productos  || {};
    Object.keys(productos).forEach(function(sku) {
      var colIdx = mapaProdHdr[sku] || prodColMap[sku]; // 1-based
      if (!colIdx) {
        var codeW = _skuCodigoProd_(sku);
        if (codeW) {
          colIdx = _insertarColumnaProducto_(wsTicket, codeW);
          hdrsTk = wsTicket.getRange(1, 1, 1, wsTicket.getLastColumn()).getValues()[0];
          mapaProdHdr = prodColsFromHeaders_(hdrsTk);
          if (!colIdx) colIdx = mapaProdHdr[sku] || mapaProdHdr[codeW] || mapaProdHdr['SUNSU-'+codeW];
        }
      }
      if (colIdx && colIdx >= 25) {
        while (row.length < colIdx) row.push('');
        row[colIdx - 1] = productos[sku];
      }
    });

    // Escribir la fila en el sheet
    // Primero forzar formato texto en col C (cédula) para evitar notación científica
    wsTicket.getRange(targetRow, 3).setNumberFormat('@');
    wsTicket.getRange(targetRow, 1, 1, row.length).setValues([row]);

    // Fórmula de estado de seguimiento (col M) para la fila nueva — así ningún
    // ticket queda sin estado y el control de retorno siempre está completo
    try {
      var colSegT = 0;
      for (var hf = 0; hf < hdrsTk.length; hf++) { if ((hdrsTk[hf]||'').toString().toUpperCase().indexOf('SEGUIMIENTO') >= 0) { colSegT = hf + 1; break; } }
      var rT = targetRow;
      var fM = colSegT
        ? '=IF('+columnaLetra_(colSegT)+rT+'<>"",'+columnaLetra_(colSegT)+rT+',IF(K'+rT+'="","",IF(L'+rT+'=TRUE,"✅ Agendada",IF(K'+rT+'<=EDATE(TODAY(),-6),"⛔ No ha regresado",IF(K'+rT+'<TODAY(),"🔴 Atrasada",IF(K'+rT+'<=TODAY()+7,"🟡 Próxima","🟢 A tiempo"))))))'
        : '=IF(K'+rT+'="","",IF(L'+rT+'=TRUE,"✅ Agendada",IF(K'+rT+'<=EDATE(TODAY(),-6),"⛔ No ha regresado",IF(K'+rT+'<TODAY(),"🔴 Atrasada",IF(K'+rT+'<=TODAY()+7,"🟡 Próxima","🟢 A tiempo")))))';
      wsTicket.getRange(rT, 13).setFormula(fM);
    } catch(eFm) {}

    // ── Generar número único de ticket ──
    var props = PropertiesService.getScriptProperties();
    var ticketCount = parseInt(props.getProperty('ticketCount') || '0') + 1;
    props.setProperty('ticketCount', ticketCount.toString());
    var ticketNum = 'TK-' + Utilities.formatDate(now, 'America/Guayaquil', 'yyyyMMdd') + '-' + String(ticketCount).padStart(4, '0');

    // ── Fotos ANTES/DESPUÉS → Drive 'SUNSU FOTOS CLIENTAS' / {cédula nombre} / {# ticket} ──
    if ((body.fotosAntes && body.fotosAntes.length) || (body.fotosDespues && body.fotosDespues.length)) {
      try {
        var raizFo = DriveApp.getFoldersByName('SUNSU FOTOS CLIENTAS');
        var carpetaRaiz = raizFo.hasNext() ? raizFo.next() : DriveApp.createFolder('SUNSU FOTOS CLIENTAS');
        var idCliFo = ((body.cedula||'').toString().trim()+' '+((body.nombre||'')+' '+(body.apellido||'')).replace(/[^\wÁÉÍÓÚÑáéíóúñ\s]/g,'').trim()).trim();
        var subCli = _subcarpeta_(carpetaRaiz, idCliFo || 'SIN CEDULA');
        var subTk  = _subcarpeta_(subCli, ticketNum);
        var subirSetFo = function(lista, etiqueta) {
          var urlsFo = [];
          for (var nf = 0; nf < Math.min((lista||[]).length, 3); nf++) {
            var b64Fo = (lista[nf]||'').toString().split(',')[1] || '';
            if (!b64Fo) continue;
            var blobFo = Utilities.newBlob(Utilities.base64Decode(b64Fo), 'image/jpeg',
              idCliFo+' '+etiqueta+' '+ticketNum+' ('+(nf+1)+').jpg');
            var fFo = subTk.createFile(blobFo);
            try { fFo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(eShF){}
            urlsFo.push('https://drive.google.com/file/d/'+fFo.getId()+'/view');
          }
          return urlsFo;
        };
        var urlsAntes = subirSetFo(body.fotosAntes, 'ANTES');
        var urlsDesp  = subirSetFo(body.fotosDespues, 'DESPUÉS');
        var escribirColFo = function(nombreCol, urls) {
          if (!urls.length) return;
          var hdrsFo = wsTicket.getRange(1,1,1,wsTicket.getLastColumn()).getValues()[0];
          var colFo = 0;
          for (var hf = 0; hf < hdrsFo.length; hf++) { if ((hdrsFo[hf]||'').toString().toUpperCase() === nombreCol) { colFo = hf+1; break; } }
          if (!colFo) { colFo = wsTicket.getLastColumn()+1; wsTicket.getRange(1,colFo).setValue(nombreCol); }
          wsTicket.getRange(targetRow, colFo).setValue(urls.join(' | '));
        };
        escribirColFo('FOTOS ANTES', urlsAntes);
        escribirColFo('FOTOS DESPUES', urlsDesp);
      } catch(eFo) {}
    }

    // ── Enviar email de notificación ──
    try {
      var emailDest = PropertiesService.getScriptProperties().getProperty('NOTIF_EMAIL') || Session.getActiveUser().getEmail();
      if (emailDest) {
        var cosm   = body.cosmetologa || '—';
        var nombre = (body.nombre || '') + ' ' + (body.apellido || '');
        var cedula = body.cedula || '—';
        var facial = body.facial || '—';
        var colQ   = body.colQ   || '—';
        var colR   = body.colR   || '—';
        var colS   = body.colS   || '—';
        var pack3  = body.pack3  || '';
        var pack6  = body.pack6  || '';
        var extras = body.extras || '—';
        var total  = body.estimado ? '$' + parseFloat(body.estimado).toFixed(2) : '—';
        var recom  = body.recomendaciones || '—';
        var notas  = body.notas || '—';

        // Productos vendidos
        var prodsLines = '';
        var productos = body.productos || {};
        var prodColMap = body.prodColMap || {};
        Object.keys(productos).forEach(function(sku) {
          if (productos[sku] > 0) prodsLines += '\n  • ' + sku + ' × ' + productos[sku];
        });
        if (!prodsLines) prodsLines = '\n  —';

        var asunto = '🌸 Ticket ' + ticketNum + ' — ' + nombre.trim() + ' (' + cosm + ')';
        var cuerpo =
          '════════════════════════════════\n' +
          '  SUNSU SPA — TICKET ' + ticketNum + '\n' +
          '════════════════════════════════\n\n' +
          'Fecha:          ' + Utilities.formatDate(now, 'America/Guayaquil', 'MM/dd/yyyy HH:mm') + '\n' +
          'Cosmetóloga:    ' + cosm + '\n\n' +
          '── CLIENTE ──\n' +
          'Nombre:         ' + nombre.trim() + '\n' +
          'Cédula:         ' + cedula + '\n\n' +
          '── SERVICIO ──\n' +
          'Facial:         ' + facial + '\n' +
          'Col Q (canje):  ' + colQ + '\n' +
          'Col R (GC):     ' + colR + '\n' +
          'Col S (vta GC): ' + colS + '\n' +
          (pack3 ? 'Pack x3:        ' + pack3 + '\n' : '') +
          (pack6 ? 'Pack x6:        ' + pack6 + '\n' : '') +
          'Extras:         ' + extras + '\n\n' +
          '── PRODUCTOS ──' + prodsLines + '\n\n' +
          '── RESUMEN ──\n' +
          'Total cliente:  ' + total + '\n' +
          'Recomendaciones: ' + recom + '\n' +
          'Notas:          ' + notas + '\n\n' +
          '════════════════════════════════\n' +
          'Fila en sheet: ' + targetRow + '\n';

        GmailApp.sendEmail(emailDest, asunto, cuerpo);
      }
    } catch(em) {
      Logger.log('Email error: ' + em.message);
    }

    // ── Registrar paquete en PAQUETES (filas 441+) ──
    var wsPaqPost = ss.getSheetByName('📋 PAQUETES');
    var PRIMERA_FILA_PAQ = 429;
    var cedBody = (body.cedula||'').toString().trim();
    var tsKeyBody = now.toISOString();
    var writeRowPaq = -1; // track where we wrote

    if (wsPaqPost && (body.pack3||body.pack6) && cedBody) {
      var paqCheck = wsPaqPost.getDataRange().getValues();
      var yaExiste = false;
      for (var pc = PRIMERA_FILA_PAQ - 1; pc < paqCheck.length; pc++) {
        if ((paqCheck[pc][24]||'').toString().trim() === tsKeyBody) { yaExiste=true; break; }
      }
      if (!yaExiste) {
        var ecPaq = new Date(now.getTime() - 5*60*60*1000);
        var packTxtBody = body.pack3 || body.pack6;
        var skuMatchB = (packTxtBody||'').match(/SUNSU-\d+/);
        var skuPaqB = skuMatchB ? skuMatchB[0] : packTxtBody;
        var _paqLastRow = wsPaqPost.getLastRow();
        var _paqRowCount = Math.max(1, _paqLastRow - PRIMERA_FILA_PAQ + 1);
        var paqAllRows = _paqRowCount > 0 ? wsPaqPost.getRange(PRIMERA_FILA_PAQ, 4, _paqRowCount, 1).getValues() : [];
        var writeRow = PRIMERA_FILA_PAQ;
        for (var lr = 0; lr < paqAllRows.length; lr++) {
          if ((paqAllRows[lr][0]||'').toString().trim()) writeRow = PRIMERA_FILA_PAQ + lr + 1;
        }
        wsPaqPost.getRange(writeRow, 1, 1, 10).setValues([[
          ecPaq.getUTCDate(), ecPaq.getUTCMonth()+1, ecPaq.getUTCFullYear(),
          cedBody,
          (body.nombre||'').toString().trim(),
          (body.apellido||'').toString().trim(),
          '',
          skuPaqB,
          packTxtBody,
          mapearNombreCosm((body.cosmetologa||'').toString().trim())
        ]]);
        wsPaqPost.getRange(writeRow, 25).setValue(tsKeyBody);
        writeRowPaq = writeRow; // remember where we wrote
        SpreadsheetApp.flush(); // ensure write is committed before we re-read
      }
    }

    // ── Marcar usos como GC en PAQUETES ──
    var USO_COLS_P   = [11,13,15,17,19,21];
    var FECHA_COLS_P = [12,14,16,18,20,22];

    var _marcarGC = function(packTxt, slotsArr) {
      if (!wsPaqPost || !packTxt || !slotsArr || !slotsArr.length) return;
      var slots = slotsArr.filter(function(s){ return s && s.codigo; });
      if (!slots.length) { Logger.log('marcarGC: no slots. raw='+JSON.stringify(slotsArr)); return; }
      var skuMatch = (packTxt||'').toString().match(/SUNSU-\d+/);
      var skuBase  = skuMatch ? skuMatch[0] : packTxt.toString().trim();
      Logger.log('marcarGC: sku='+skuBase+' ced='+cedBody+' writeRow='+writeRowPaq+' slots='+slots.length);
      var targetRowP = -1;
      // Case 1: we just wrote this row
      if (writeRowPaq > 0) {
        targetRowP = writeRowPaq;
      } else {
        // Case 2: scan ALL rows 441+ cedula+sku, take last match
        SpreadsheetApp.flush();
        var _lr2 = wsPaqPost.getLastRow();
        var _rc2 = _lr2 - PRIMERA_FILA_PAQ + 1;
        if (_rc2 > 0) {
          var paqScan = wsPaqPost.getRange(PRIMERA_FILA_PAQ, 1, _rc2, 10).getValues();
          for (var ps = 0; ps < paqScan.length; ps++) {
            var rCed = (paqScan[ps][3]||'').toString().trim();
            var rSku = (paqScan[ps][7]||'').toString().trim();
            if (rCed === cedBody && rSku.indexOf(skuBase) >= 0) targetRowP = PRIMERA_FILA_PAQ + ps;
          }
        }
      }
      if (targetRowP < 0) { Logger.log('marcarGC: NO ENCONTRO. sku='+skuBase+' ced='+cedBody); return; }
      Logger.log('marcarGC: fila='+targetRowP);
      var filled2 = 0;
      for (var ui2 = 0; ui2 < USO_COLS_P.length && filled2 < slots.length; ui2++) {
        var usoV   = wsPaqPost.getRange(targetRowP, USO_COLS_P[ui2]).getValue();
        var fechaV = wsPaqPost.getRange(targetRowP, FECHA_COLS_P[ui2]).getValue();
        if (!usoV && (!fechaV || fechaV.toString().trim() === '')) {
          wsPaqPost.getRange(targetRowP, USO_COLS_P[ui2]).setValue(true);
          wsPaqPost.getRange(targetRowP, FECHA_COLS_P[ui2]).setValue('Gift Card, ' + slots[filled2].codigo);
          filled2++;
        }
      }
      SpreadsheetApp.flush();
      Logger.log('marcarGC DONE: fila='+targetRowP+' filled='+filled2+'/'+slots.length);
    };

    // Log what arrived for GC marking
    Logger.log('paq2gcSlots3: '+JSON.stringify(body.paq2gcSlots3));
    Logger.log('paq2gcSlots6: '+JSON.stringify(body.paq2gcSlots6));
    Logger.log('pack3: '+body.pack3+' pack6: '+body.pack6);
    Logger.log('writeRowPaq: '+writeRowPaq+' cedBody: '+cedBody);

    if (body.paq2gcSlots3 && body.paq2gcSlots3.length && body.pack3) _marcarGC(body.pack3, body.paq2gcSlots3);
    if (body.paq2gcSlots6 && body.paq2gcSlots6.length && body.pack6) _marcarGC(body.pack6, body.paq2gcSlots6);

    return respJson({ok: true, fila: targetRow, ticket: ticketNum});

  } catch(err) {
    Logger.log("doPost error: " + err.message);
    return respJson({error: err.message});
  }
}

// Hoja 🏭 PROVEEDORES: get-or-create, sembrada con los proveedores de INV_CONFIG
function _wsProveedores_(ss) {
  var ws = ss.getSheetByName('🏭 PROVEEDORES');
  if (ws) return ws;
  ws = ss.insertSheet('🏭 PROVEEDORES');
  ws.getRange(1,1,1,7).setValues([['NOMBRE','RUC','TELÉFONO','DIRECCIÓN','EMAIL','FAMILIA','NOTAS']])
    .setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
  ws.setFrozenRows(1);
  ws.setColumnWidth(1, 220); ws.setColumnWidth(4, 240);
  var semilla = Object.keys(INV_CONFIG.PROVEEDORES).map(function(n){
    return [n, INV_CONFIG.PROVEEDORES[n].ruc||'', '', '', '', INV_CONFIG.PROVEEDORES[n].familia||'', ''];
  });
  if (semilla.length) ws.getRange(2,1,semilla.length,7).setValues(semilla);
  return ws;
}

// Busca una subcarpeta por nombre dentro de un folder; la crea si no existe
function _subcarpeta_(parent, nombre) {
  var it = parent.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : parent.createFolder(nombre);
}

function respJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// CITAS — guardar desde Acuity
// ============================================================
function _fechaEcuador(offsetDias) {
  var ahora = new Date();
  // Ecuador = UTC-5
  var ec = new Date(ahora.getTime() - (5 * 60 * 60 * 1000) + (offsetDias||0) * 24 * 60 * 60 * 1000);
  var pad = function(n){ return String(n).padStart(2,'0'); };
  return ec.getUTCFullYear()+'-'+pad(ec.getUTCMonth()+1)+'-'+pad(ec.getUTCDate());
}

function guardarCitasHoy() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var ws  = ss.getSheetByName('CITAS_HOY');
  if (!ws) { ws = ss.insertSheet('CITAS_HOY'); ws.setTabColor('#4A6FA5'); }
  var uid = PropertiesService.getScriptProperties().getProperty('ACUITY_UID');
  var key = PropertiesService.getScriptProperties().getProperty('ACUITY_KEY');
  var fecha = _fechaEcuador(0);
  var min = fecha+'T00:00:00';
  var max = fecha+'T23:59:59';
  var resp = UrlFetchApp.fetch('https://acuityscheduling.com/api/v1/appointments?minDate='+min+'&maxDate='+max+'&max=50',
    {headers:{'Authorization':'Basic '+Utilities.base64Encode(uid+':'+key)},muteHttpExceptions:true});
  ws.clearContents();
  ws.getRange(1,1).setValue(resp.getContentText());
  ws.getRange(2,1).setValue(Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm'));
}

function guardarCitasAyer() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var ws  = ss.getSheetByName('CITAS_AYER');
  if (!ws) { ws = ss.insertSheet('CITAS_AYER'); ws.setTabColor('#9B8EC4'); }
  var uid = PropertiesService.getScriptProperties().getProperty('ACUITY_UID');
  var key = PropertiesService.getScriptProperties().getProperty('ACUITY_KEY');
  var fecha = _fechaEcuador(-1);
  var min = fecha+'T00:00:00';
  var max = fecha+'T23:59:59';
  var resp = UrlFetchApp.fetch('https://acuityscheduling.com/api/v1/appointments?minDate='+min+'&maxDate='+max+'&max=50',
    {headers:{'Authorization':'Basic '+Utilities.base64Encode(uid+':'+key)},muteHttpExceptions:true});
  ws.clearContents();
  ws.getRange(1,1).setValue(resp.getContentText());
  ws.getRange(2,1).setValue(Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm'));
}

function guardarCitasManana() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var ws  = ss.getSheetByName('CITAS_MANANA');
  if (!ws) { ws = ss.insertSheet('CITAS_MANANA'); ws.setTabColor('#6A9E7A'); }
  var uid = PropertiesService.getScriptProperties().getProperty('ACUITY_UID');
  var key = PropertiesService.getScriptProperties().getProperty('ACUITY_KEY');
  var fecha = _fechaEcuador(1);
  var min = fecha+'T00:00:00';
  var max = fecha+'T23:59:59';
  var resp = UrlFetchApp.fetch('https://acuityscheduling.com/api/v1/appointments?minDate='+min+'&maxDate='+max+'&max=50',
    {headers:{'Authorization':'Basic '+Utilities.base64Encode(uid+':'+key)},muteHttpExceptions:true});
  ws.clearContents();
  ws.getRange(1,1).setValue(resp.getContentText());
  ws.getRange(2,1).setValue(Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm'));
}

function guardarTodasLasCitas() {
  guardarCitasAyer(); guardarCitasHoy(); guardarCitasManana();
  SpreadsheetApp.getActiveSpreadsheet().toast('Citas actualizadas','SUNSU',5);
}

// ============================================================
// REPORTE EJECUTIVO DE VENTAS
// ============================================================
function generarReporteVentas() {
  const ui   = SpreadsheetApp.getUi();
  const resp = ui.prompt("Reporte ejecutivo de ventas","Ingresa el mes en formato YYYY-MM\n(ej: 2026-05 para Mayo 2026):",ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const input = resp.getResponseText().trim();
  const match = input.match(/^(\d{4})-(\d{2})$/);
  if (!match) { ui.alert("Formato incorrecto. Usa YYYY-MM"); return; }
  const año = parseInt(match[1]), mes = parseInt(match[2]) - 1;
  const fechaInicio = new Date(año, mes, 1, 0, 0, 0);
  const fechaFin    = new Date(año, mes + 1, 0, 23, 59, 59);
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const nombreRpt = `RPT ${meses[mes]}${String(año).slice(2)}`;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(nombreRpt)) {
    if (ui.alert("Ya existe '"+nombreRpt+"'. ¿Sobreescribir?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    ss.deleteSheet(ss.getSheetByName(nombreRpt));
  }
  const ws = ss.insertSheet(nombreRpt);
  ws.setTabColor(COLOR.NAVY);
  const datos    = calcularReporte(fechaInicio, fechaFin);
  const historial = calcularHistorial(ss);
  const comisiones = calcularComisiones(fechaInicio, fechaFin);
  datos.comTotalPaquetes = Object.values(comisiones.cosmetologas||{}).reduce((s,c) => s+(c.comPaquetes||0), 0);
  construirReporte(ws, datos, historial, fechaInicio, fechaFin, nombreRpt);
  ui.alert("✅ Reporte '" + nombreRpt + "' generado.");
}

function calcularReporte(fechaInicio, fechaFin) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const wsTicket = ss.getSheets().find(s => s.getName().includes("TICKET_FICHA"));
  const precios  = leerPrecios(ss);
  if (!wsTicket) return {};
  const datos    = wsTicket.getDataRange().getValues();
  const headers  = datos[0];
  const prodHeaders = headers.slice(CONFIG.COL_PRODUCTOS_START - 1);
  const EXCL2 = exclColsFromHeaders_(headers);
  const MARGEN_FACIAL = 0.25, MARGEN_PAQUETE = 0.25;
  const result = {
    totalClientas: new Set(), clientasConteo: {}, faciales: {}, paquetes: {}, productos: {},
    porCosm: {}, consumoSunsu: {}, giftCards: [], porDia: {},
    ingrBrutoFaciales:0, ingrBrutoPaquetes:0, ingrBrutoProductos:0,
    utilFaciales:0, utilPaquetes:0, utilProductos:0,
    comTotalFaciales:0, comTotalPaquetes:0, comTotalProductos:0,
  };
  const wsCat = ss.getSheets().find(s => s.getName().includes("CATALOGO"));
  const preciosCat = {};
  if (wsCat) {
    const catData = wsCat.getDataRange().getValues();
    for (let i = 2; i < catData.length; i++) {
      const sku = (catData[i][0]||"").toString().trim();
      const subtotal = parseFloat(catData[i][3])||0;  // Col D = SUBTOTAL sin IVA ✅
      if (sku) preciosCat[sku] = { subtotal, compra:parseFloat(catData[i][6])||0, tipo:(catData[i][2]||"").toString().trim(), nombre:(catData[i][1]||"").toString().trim() };
    }
  }
  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i];
    const ts   = fila[CONFIG.COL_TIMESTAMP - 1];
    if (!ts) continue;
    const fecha = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(fecha.getTime()) || fecha < fechaInicio || fecha > fechaFin) continue;
    const cosm      = (fila[CONFIG.COL_COSMETOLOGA-1]||"").toString().trim();
    const idCliente = (fila[CONFIG.COL_ID_CLIENTE-1]||"").toString().trim();
    const idClean   = idCliente.split(".")[0].replace(/[^0-9]/g,"");
    const esSunsu   = idClean === "1793219469001";
    const fechaKey  = fecha.getFullYear()+"-"+String(fecha.getMonth()+1).padStart(2,"0")+"-"+String(fecha.getDate()).padStart(2,"0");
    if (!result.porDia[fechaKey]) result.porDia[fechaKey] = { faciales:0, soloCompraron:0 };
    const facial   = (fila[CONFIG.COL_FACIAL-1]||"").toString();
    const pack3raw = (fila[CONFIG.COL_PACK3-1]||"").toString().trim();
    const pack6raw = (fila[CONFIG.COL_PACK6-1]||"").toString().trim();
    const tieneFacial = facial.match(/SUNSU-(\d+)/) !== null;
    const tienePaq    = (pack3raw&&pack3raw!==""&&pack3raw.toLowerCase()!=="false")||(pack6raw&&pack6raw!==""&&pack6raw.toLowerCase()!=="false");
    if (!esSunsu) {
      if (tieneFacial) {
        const cid=idCliente||i.toString(); result.totalClientas.add(cid);
        result.clientasConteo[cid]=(result.clientasConteo[cid]||0)+1;
        result.porDia[fechaKey].faciales++;
      } else if (tienePaq) result.porDia[fechaKey].soloCompraron++;
    }
        // SUNSU incluido en ingreso bruto
    if (esSunsu) {
      for (let p=0;p<prodHeaders.length;p++) {
        const qty=parseInt(fila[CONFIG.COL_PRODUCTOS_START-1+p])||0;
        if (qty<=0) continue;
        const ph=(prodHeaders[p]||"").toString().trim(); if (!ph) continue;
        const sku=ph.startsWith("SUNSU-")?ph:"SUNSU-"+ph;
        const info=precios[sku]||{};
        if (!result.consumoSunsu[sku]) result.consumoSunsu[sku]={nombre:info.nombre||sku,qty:0,costoUnit:info.compra||0,costoTotal:0};
        result.consumoSunsu[sku].qty+=qty; result.consumoSunsu[sku].costoTotal+=(info.compra||0)*qty;
      }
      continue;
    }
    if (!result.porCosm[cosm]) result.porCosm[cosm]={faciales:0,paquetes:0,productos:0,ingrFaciales:0,ingrPaquetes:0,ingrProductos:0,utilFaciales:0,utilPaquetes:0,utilProductos:0,comFaciales:0,comPaquetes:0,comProductos:0,comExtras:0};
    const pc=result.porCosm[cosm];
    const exclFacial=fila[EXCL2.facial-1]===true;
    // Extras: $1 de comisión por extra vendido (cortesías no cuentan; exclusión propia BV)
    const exclExtras2 = fila[EXCL2.extras-1]===true;
    if (!exclExtras2) {
      const nExtRes = contarExtrasVendidos_(fila[CONFIG.COL_EXTRAS-1]);
      if (nExtRes > 0) pc.comExtras += nExtRes * 1;
    }
    const exclPaquete=fila[EXCL2.paquete-1]===true;
    const exclProducto=fila[EXCL2.producto-1]===true;
    // Use actual $$ ESTIMADO (col J) as real income — fall back to catalog only if empty
    const estimadoReal=parseFloat(fila[CONFIG.COL_ESTIMADO-1])||0;
    const skuMatch=facial.match(/SUNSU-(\d+)/);
    const hasFacial=!!skuMatch&&!exclFacial;
    const hasPaqR=(tienePaq&&!exclPaquete);

    // INCOME RULE: sum col J exactly ONCE per ticket
    // Assign to primary category: facial > pack > products
    // This ensures total = exact sum of col J
    if (hasFacial) {
      const sku="SUNSU-"+skuMatch[1], info=preciosCat[sku]||{};
      const ingr=estimadoReal;
      const util=ingr*MARGEN_FACIAL;
      const com=CONFIG.FACIALES_2.includes(sku)?2:CONFIG.FACIALES_3.includes(sku)?3:0;
      if (!result.faciales[sku]) result.faciales[sku]={nombre:info.nombre||sku,count:0,cosm:{},ingrBruto:0,utilEstim:0,comTotal:0};
      result.faciales[sku].count++; result.faciales[sku].cosm[cosm]=(result.faciales[sku].cosm[cosm]||0)+1;
      result.faciales[sku].ingrBruto+=ingr; result.faciales[sku].utilEstim+=util; result.faciales[sku].comTotal+=com;
      result.ingrBrutoFaciales+=ingr; result.utilFaciales+=util; result.comTotalFaciales+=com;
      pc.faciales++; pc.ingrFaciales+=ingr; pc.utilFaciales+=util; pc.comFaciales+=com;
    } else if (hasPaqR) {
      // Pack-only ticket (no facial)
      const ps=pack3raw||pack6raw; const sm=ps.match(/SUNSU-(\d+)/);
      const sku=sm?"SUNSU-"+sm[1]:ps; const info=preciosCat[sku]||{};
      const ingr=estimadoReal; const util=ingr*MARGEN_PAQUETE;
      if (!result.paquetes[sku]) result.paquetes[sku]={nombre:info.nombre||sku,count:0,cosm:{},ingrBruto:0,utilEstim:0};
      result.paquetes[sku].ingrBruto+=ingr; result.paquetes[sku].utilEstim+=util;
      result.ingrBrutoPaquetes+=ingr; result.utilPaquetes+=util;
      pc.ingrPaquetes+=ingr; pc.utilPaquetes+=util;
    } else if (!exclProducto&&estimadoReal>0) {
      // Products-only ticket
      result.ingrBrutoProductos+=estimadoReal; result.utilProductos+=estimadoReal*0.19;
      pc.ingrProductos+=estimadoReal;
    }
    // Count packs (volume, separate from income)
    if (!exclPaquete) {
      const procesarPack=(packStr,tipo)=>{
        if (!packStr||packStr===""||packStr.toLowerCase()==="false") return;
        const sm=packStr.match(/SUNSU-(\d+)/); const sku=sm?"SUNSU-"+sm[1]:packStr;
        const info=preciosCat[sku]||{}; const paqCount=tipo==="x6"?2:1;
        if (!result.paquetes[sku]) result.paquetes[sku]={nombre:info.nombre||sku,count:0,cosm:{},ingrBruto:0,utilEstim:0};
        result.paquetes[sku].count+=paqCount; result.paquetes[sku].cosm[cosm]=(result.paquetes[sku].cosm[cosm]||0)+paqCount;
        pc.paquetes+=paqCount;
      };
      procesarPack(pack3raw,"x3"); procesarPack(pack6raw,"x6");
    }
    // Count products (volume, separate from income)
    if (!exclProducto) {
      for (let p=0;p<prodHeaders.length;p++) {
        const qty=parseInt(fila[CONFIG.COL_PRODUCTOS_START-1+p])||0; if (qty<=0) continue;
        const ph=(prodHeaders[p]||"").toString().trim(); if (!ph) continue;
        const sku=ph.startsWith("SUNSU-")?ph:"SUNSU-"+ph;
        const info=precios[sku]||preciosCat[sku]||{};
        const util=((info.venta||0)-(info.compra||0))*qty, com=util*0.30;
        if (!result.productos[sku]) result.productos[sku]={nombre:info.nombre||sku,count:0,cosm:{},ingrBruto:0,utilidad:0,utilNeta:0};
        result.productos[sku].count+=qty; result.productos[sku].cosm[cosm]=(result.productos[sku].cosm[cosm]||0)+qty;
        result.productos[sku].utilidad+=util; result.productos[sku].utilNeta+=(util-com);
        result.utilProductos+=util; result.comTotalProductos+=com;
        pc.productos+=qty; pc.utilProductos+=util; pc.comProductos+=com;
      }
    }
  }
  result.totalClientas = result.totalClientas.size;
  result.clientasRecurrentes = Object.values(result.clientasConteo).filter(c=>c>1).length;
  const mesReporte=fechaInicio.getMonth()+1, añoReporte=fechaInicio.getFullYear();
  // Count GCs from GIFT CARDS sheet: 1 row with code = 1 GC
  const wsGC=ss.getSheetByName("🎁 GIFT CARDS");
  if (wsGC) {
    const gcData=wsGC.getDataRange().getValues();
    result.giftCardsVendidas=0; result.giftCardsUsadas=0;
    for (let i=2;i<gcData.length;i++) { // skip title and headers
      const fila=gcData[i];
      const codigo=(fila[0]||"").toString().trim();
      if (!codigo) continue; // must have a code
      const gcDia=parseInt(fila[1])||0;
      const gcMes=parseInt(fila[2])||0;
      const gcAño=parseInt(fila[3])||0;
      const gcAñoFull=gcAño<100?2000+gcAño:gcAño;
      // Check if within report month — col B=dia, C=mes, D=año (filled when sold/converted)
      if (gcMes===mesReporte && gcAñoFull===añoReporte) {
        result.giftCardsVendidas++;
        if (fila[10]===true||fila[10]==="TRUE") result.giftCardsUsadas++;
        result.giftCards.push({codigo,fecha:gcDia+"/"+gcMes+"/"+gcAñoFull,comprador:((fila[5]||"")+" "+(fila[6]||"")).trim(),valor:(fila[9]||65),usado:fila[10]===true||fila[10]==="TRUE"});
      }
    }
  }
  return result;
}

function calcularHistorial(ss) {
  const wsTicket=ss.getSheets().find(s=>s.getName().includes("TICKET_FICHA"));
  const precios=leerPrecios(ss);
  if (!wsTicket) return [];
  const datos=wsTicket.getDataRange().getValues();
  const wsCat=ss.getSheets().find(s=>s.getName().includes("CATALOGO"));
  const preciosCat={};
  if (wsCat) {
    const catData=wsCat.getDataRange().getValues();
    for (let i=2;i<catData.length;i++) {
      const sku=(catData[i][0]||"").toString().trim();
      if (sku) preciosCat[sku]={subtotal:parseFloat(catData[i][3])||0,compra:parseFloat(catData[i][6])||0,nombre:(catData[i][1]||"").toString().trim()};  // Col D = SUBTOTAL sin IVA ✅
    }
  }
  const mesesData={}, MARGEN=0.25;
  for (let i=1;i<datos.length;i++) {
    const fila=datos[i], ts=fila[CONFIG.COL_TIMESTAMP-1];
    if (!ts) continue;
    const fecha=ts instanceof Date?ts:new Date(ts);
    if (isNaN(fecha.getTime())) continue;
    const key=fecha.getFullYear()+"-"+String(fecha.getMonth()+1).padStart(2,"0");
    if (!mesesData[key]) mesesData[key]={
      clientas:new Set(), clientasConFacial:new Set(), clientasSoloCompra:new Set(),
      faciales:0, paquetes:0, paquetesx3:0, paquetesx6:0, productos:0,
      ingrFaciales:0, ingrPaquetes:0, ingrProductos:0, utilTotal:0,
      giftCards:0, cortesias:0, porDia:{}, porCosm:{}
    };
    const m=mesesData[key];
    const idH=(fila[CONFIG.COL_ID_CLIENTE-1]||"").toString().split(".")[0].replace(/[^0-9a-zA-Z]/g,"");
    if (idH==="1793219469001") continue;
    const cosmH=(fila[CONFIG.COL_COSMETOLOGA-1]||"").toString().trim().toUpperCase();
        // SUNSU incluido en ingreso bruto
    const cosm=(fila[CONFIG.COL_COSMETOLOGA-1]||"").toString().trim();
    const facial=(fila[CONFIG.COL_FACIAL-1]||"").toString();
    const skuF=facial.match(/SUNSU-(\d+)/);
    const pack3=(fila[CONFIG.COL_PACK3-1]||"").toString().trim();
    const pack6=(fila[CONFIG.COL_PACK6-1]||"").toString().trim();
    const colQ=(fila[16]||"").toString().trim(); // col Q = canje paquete
    const colS=(fila[18]||"").toString().trim(); // col S = GC venta
    const diaKey=fecha.getDate();

    if (!m.porDia[diaKey]) m.porDia[diaKey]={faciales:0,soloCompra:0,total:0,ingresos:0};
    if (!m.porCosm[cosm]) m.porCosm[cosm]={faciales:0,paquetes:0,productos:0,ingresos:0};

    const tienePaq=(pack3&&pack3!=="false"&&pack3!=="")||(pack6&&pack6!=="false"&&pack6!=="");
    const estimado=parseFloat(fila[CONFIG.COL_ESTIMADO-1])||0;

    // Income: col J ONCE per ticket, primary category: facial > pack > products
    if (skuF) {
      if (idH) { m.clientas.add(idH); m.clientasConFacial.add(idH); }
      m.faciales++;
      m.ingrFaciales+=estimado; m.utilTotal+=estimado*MARGEN;
      m.porDia[diaKey].faciales++; m.porDia[diaKey].total++;
      m.porDia[diaKey].ingresos+=estimado;
      m.porCosm[cosm].faciales++; m.porCosm[cosm].ingresos+=estimado;
      if (colQ==='CORTESIA') m.cortesias++;
    } else if (tienePaq) {
      if (idH) { m.clientas.add(idH); m.clientasSoloCompra.add(idH); }
      m.ingrPaquetes+=estimado; m.utilTotal+=estimado*MARGEN;
      m.porDia[diaKey].soloCompra++; m.porDia[diaKey].total++;
      m.porDia[diaKey].ingresos+=estimado;
      m.porCosm[cosm].ingresos+=estimado;
    } else if (estimado>0) {
      if (idH) { m.clientas.add(idH); m.clientasSoloCompra.add(idH); }
      m.ingrProductos+=estimado; m.utilTotal+=estimado*0.19;
      m.porDia[diaKey].soloCompra++; m.porDia[diaKey].total++;
      m.porDia[diaKey].ingresos+=estimado;
      m.porCosm[cosm].ingresos+=estimado;
    }
    // Count volumes (separate from income)
    const procesarH=(ps,tipo)=>{ if (!ps||ps===""||ps.toLowerCase()==="false") return; const cnt=tipo==="x6"?2:1; m.paquetes+=cnt; if(tipo==="x3") m.paquetesx3++; else m.paquetesx6++; m.porCosm[cosm].paquetes+=cnt; };
    procesarH(pack3,"x3"); procesarH(pack6,"x6");
    // GC vendidas
    if (colS && (colS.indexOf('SI')>=0||colS.indexOf('CORTESIA')>=0)) m.giftCards++;
    // Count productos volume only (income already captured via estimado above)
    const pH=datos[0].slice(CONFIG.COL_PRODUCTOS_START-1);
    for (let p=0;p<pH.length;p++) { const qty=parseInt(fila[CONFIG.COL_PRODUCTOS_START-1+p])||0; if (qty<=0) continue; const ph=(pH[p]||"").toString().trim(); if (!ph) continue; m.productos+=qty; m.porCosm[cosm].productos=(m.porCosm[cosm].productos||0)+qty; }
  }
  const meses=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const mesesOrdenados=Object.keys(mesesData).sort();
  return mesesOrdenados.map((key,idx)=>{
    const m=mesesData[key]; const [y,mo]=key.split("-");
    let retencion=0,pctRetencion=0,crecIngr=0,crecFaciales=0,crecClientas=0;
    if (idx>0) {
      const prev=mesesData[mesesOrdenados[idx-1]];
      retencion=[...prev.clientas].filter(id=>m.clientas.has(id)).length;
      pctRetencion=prev.clientas.size>0?Math.round(retencion/prev.clientas.size*100):0;
      const prevIngr=prev.ingrFaciales+prev.ingrPaquetes+prev.ingrProductos;
      const curIngr=m.ingrFaciales+m.ingrPaquetes+m.ingrProductos;
      crecIngr=prevIngr>0?Math.round((curIngr-prevIngr)/prevIngr*100):0;
      crecFaciales=prev.faciales>0?Math.round((m.faciales-prev.faciales)/prev.faciales*100):0;
      crecClientas=prev.clientas.size>0?Math.round((m.clientas.size-prev.clientas.size)/prev.clientas.size*100):0;
    }
    const ingrTotal=m.ingrFaciales+m.ingrPaquetes+m.ingrProductos;
    const ticketProm=m.clientas.size>0?Math.round(ingrTotal/m.clientas.size*100)/100:0;
    return {
      label:meses[parseInt(mo)-1]+" "+y, key,
      clientas:m.clientas.size, clientasConFacial:m.clientasConFacial.size, clientasSoloCompra:m.clientasSoloCompra.size,
      retencion, pctRetencion, crecIngr, crecFaciales, crecClientas,
      faciales:m.faciales, paquetes:m.paquetes, paquetesx3:m.paquetesx3, paquetesx6:m.paquetesx6,
      productos:m.productos, giftCards:m.giftCards, cortesias:m.cortesias,
      ingrFaciales:Math.round(m.ingrFaciales*100)/100,
      ingrPaquetes:Math.round(m.ingrPaquetes*100)/100,
      ingrProductos:Math.round(m.ingrProductos*100)/100,
      ingrTotal:Math.round(ingrTotal*100)/100,
      utilTotal:Math.round(m.utilTotal*100)/100,
      ticketProm, porDia:m.porDia, porCosm:m.porCosm
    };
  });
}

function construirReporte(ws, datos, historial, fechaInicio, fechaFin, nombre) {
  const fmt=d=>Utilities.formatDate(d,"America/Guayaquil","dd/MM/yyyy");
  const meses=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const C={NAVY:COLOR.NAVY,BLUE:COLOR.BLUE,BLUE_L:COLOR.BLUE_L,GREEN:COLOR.GREEN,GREEN_L:COLOR.GREEN_L,
    PURPLE:COLOR.LAVENDER,PURPLE_L:COLOR.LAVENDER_L,ORANGE:COLOR.PEACH,ORANGE_L:COLOR.PEACH_L,
    GRAY:COLOR.GRAY,GRAY_L:COLOR.GRAY_L,WHITE:"#FFFFFF",GOLD:COLOR.GOLD,GOLD_L:COLOR.GOLD_L,
    RED:COLOR.RED,RED_L:COLOR.RED_L,PINK:COLOR.PINK||"#E8A0B0",PINK_L:COLOR.PINK_L||"#FAF0F3"};
  const hdr=(ws,r,c,span,txt,bg,fc,sz)=>{ws.getRange(r,c,1,span).merge().setValue(txt).setBackground(bg).setFontColor(fc||C.WHITE).setFontWeight("bold").setFontSize(sz||9).setFontFamily("Arial").setHorizontalAlignment("left").setVerticalAlignment("middle");ws.setRowHeight(r,24);};
  const cell=(ws,r,c,v,bg,fc,fmt_,bold)=>{const rng=ws.getRange(r,c);rng.setValue(v);if(bg)rng.setBackground(bg);if(fc)rng.setFontColor(fc);if(fmt_)rng.setNumberFormat(fmt_);if(bold)rng.setFontWeight("bold");rng.setFontSize(9).setFontFamily("Arial");};
  const pct=(v)=>v>0?"▲ +"+v+"%":v<0?"▼ "+v+"%":"—";

  let fila=1;
  // ── Título ──
  ws.getRange(fila,1,1,16).merge().setValue("📊 SUNSU SPA — REPORTE EJECUTIVO DE VENTAS   "+fmt(fechaInicio)+" → "+fmt(fechaFin))
    .setBackground(C.NAVY).setFontColor(C.WHITE).setFontWeight("bold").setFontSize(13).setFontFamily("Arial").setHorizontalAlignment("left").setVerticalAlignment("middle");
  ws.setRowHeight(fila,45); fila+=2;

  // ── KPIs del mes ──
  const ingrBrutoTotal=(datos.ingrBrutoFaciales||0)+(datos.ingrBrutoPaquetes||0)+(datos.ingrBrutoProductos||0);
  const utilTotal=(datos.utilFaciales||0)+(datos.utilPaquetes||0)+(datos.utilProductos||0);
  const comTotal=(datos.comTotalFaciales||0)+(datos.comTotalPaquetes||0)+(datos.comTotalProductos||0);
  const utilNeta=utilTotal-comTotal;
  const totFaciales=Object.values(datos.faciales||{}).reduce((s,v)=>s+v.count,0);
  const totPaquetes=Object.values(datos.paquetes||{}).reduce((s,v)=>s+v.count,0);
  const totProductos=Object.values(datos.productos||{}).reduce((s,v)=>s+v.count,0);
  const clientasUnicas=(datos.totalClientas instanceof Set)?datos.totalClientas.size:(datos.totalClientas||0);
  const recurrentes=datos.clientasRecurrentes||0;

  hdr(ws,fila,1,16,"📊 KPIs DEL PERÍODO",C.NAVY,C.WHITE,10); fila++;
  const kpis=[
    ["👥 Clientas únicas",clientasUnicas,C.BLUE,C.BLUE_L,"#"],
    ["🔄 Recurrentes",recurrentes,C.NAVY,C.BLUE_L,"#"],
    ["💆 Faciales",totFaciales,C.PURPLE,C.PURPLE_L,"#"],
    ["📋 Paquetes vendidos",totPaquetes,C.GREEN,C.GREEN_L,"#"],
    ["🧴 Productos vendidos",totProductos,C.ORANGE,C.ORANGE_L,"#"],
    ["💰 Ingreso bruto",ingrBrutoTotal,C.GOLD,"#FFF8E7",'$"$"#,##0.00'],
    ["📈 Utilidad neta est.",utilNeta,utilNeta>=0?C.GREEN:C.RED,utilNeta>=0?C.GREEN_L:C.RED_L,'$"$"#,##0.00'],
  ];
  kpis.forEach((k,i)=>{
    const col=i*2+1;
    ws.getRange(fila,col).setValue(k[0]).setBackground(k[2]).setFontColor(C.WHITE).setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center").setWrap(true);
    ws.getRange(fila+1,col).setValue(k[1]).setBackground(k[3]).setFontColor(k[2]).setFontWeight("bold").setFontSize(18).setFontFamily("Arial").setHorizontalAlignment("center");
    if(k[4]==='$"$"#,##0.00') ws.getRange(fila+1,col).setNumberFormat(k[4]);
    if(i<kpis.length-1){ws.getRange(fila,col+1).setBackground(C.WHITE);ws.getRange(fila+1,col+1).setBackground(C.WHITE);}
    ws.setColumnWidth(col,110);
  });
  ws.setRowHeight(fila,24); ws.setRowHeight(fila+1,42); fila+=3;

  // ── Resumen financiero ──
  hdr(ws,fila,1,8,"📈 RESUMEN FINANCIERO",C.NAVY,C.WHITE,10); fila++;
  ["CATEGORÍA","VOLUMEN","INGRESO BRUTO","UTILIDAD EST. 25%","COMISIONES","UTILIDAD NETA","% DEL INGRESO","MARGEN NETO"].forEach((h,i)=>{
    ws.getRange(fila,i+1).setValue(h).setBackground(C.BLUE).setFontColor(C.WHITE).setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center").setWrap(true);
  }); ws.setRowHeight(fila,25); fila++;
  [["💆 Faciales",totFaciales,datos.ingrBrutoFaciales||0,datos.utilFaciales||0,datos.comTotalFaciales||0,C.PURPLE_L,C.PURPLE],
   ["📋 Paquetes",totPaquetes,datos.ingrBrutoPaquetes||0,datos.utilPaquetes||0,datos.comTotalPaquetes||0,C.GREEN_L,C.GREEN],
   ["🧴 Productos",totProductos,datos.ingrBrutoProductos||0,datos.utilProductos||0,datos.comTotalProductos||0,C.ORANGE_L,C.ORANGE],
   ["💰 TOTAL","—",ingrBrutoTotal,utilTotal,comTotal,C.GOLD_L,C.GOLD],
  ].forEach(([cat,vol,ingr,util,com,bg,fc])=>{
    const neta=util-com; const pctIngr=ingrBrutoTotal>0?Math.round(ingr/ingrBrutoTotal*100):0; const margen=ingr>0?Math.round(neta/ingr*100):0;
    [cat,vol,'$'+ingr.toFixed(2),'$'+util.toFixed(2),'$'+com.toFixed(2),'$'+neta.toFixed(2),pctIngr+'%',margen+'%'].forEach((v,i)=>{
      ws.getRange(fila,i+1).setValue(v).setBackground(bg).setFontSize(9).setFontFamily("Arial");
      if(i===0) ws.getRange(fila,i+1).setFontWeight("bold").setFontColor(fc);
      if(i===5) ws.getRange(fila,i+1).setFontWeight("bold").setFontColor(neta>=0?C.GREEN:C.RED);
    }); fila++;
  });
  // Sin IVA row
  const sinIvaTotal=Math.round(ingrBrutoTotal/1.15*100)/100;
  ws.getRange(fila,1,1,8).setValues([["📋 Sin IVA (÷1.15)","—",'$'+sinIvaTotal.toFixed(2),"—","—",'$'+(sinIvaTotal*0.25).toFixed(2),"—","—"]]);
  ws.getRange(fila,1,1,8).setBackground("#F0FBF4").setFontSize(9).setFontFamily("Arial");
  ws.getRange(fila,1).setFontWeight("bold").setFontColor("#2E7D52");
  ws.getRange(fila,3).setFontWeight("bold").setFontColor("#2E7D52");
  fila+=2;

  // ── Por cosmetóloga ──
  hdr(ws,fila,1,8,"👤 RENDIMIENTO POR COSMETÓLOGA",C.NAVY,C.WHITE,10); fila++;
  ["COSMETÓLOGA","FACIALES","PAQUETES","PRODUCTOS","INGRESO BRUTO","COMISIÓN","TICKET PROM.","% INGRESO TOTAL"].forEach((h,i)=>{
    ws.getRange(fila,i+1).setValue(h).setBackground(C.BLUE).setFontColor(C.WHITE).setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center").setWrap(true);
  }); fila++;
  Object.entries(datos.porCosm||{}).sort((a,b)=>((b[1].ingrFaciales||0)+(b[1].ingrPaquetes||0))-((a[1].ingrFaciales||0)+(a[1].ingrPaquetes||0))).forEach(([cosm,d])=>{
    const ingrCosm=(d.ingrFaciales||0)+(d.ingrPaquetes||0)+(d.ingrProductos||0);
    const comCosm=(d.comFaciales||0)+(d.comPaquetes||0)+(d.comProductos||0)+(d.comExtras||0);
    const clientes=d.faciales||0; const ticket=clientes>0?Math.round(ingrCosm/clientes*100)/100:0;
    const pctTotal=ingrBrutoTotal>0?Math.round(ingrCosm/ingrBrutoTotal*100):0;
    [cosm,d.faciales||0,d.paquetes||0,d.productos||0,'$'+ingrCosm.toFixed(2),'$'+comCosm.toFixed(2),'$'+ticket.toFixed(2),pctTotal+'%'].forEach((v,i)=>{
      ws.getRange(fila,i+1).setValue(v).setBackground(i===0?C.BLUE_L:C.WHITE).setFontSize(9).setFontFamily("Arial");
      if(i===0) ws.getRange(fila,i+1).setFontWeight("bold").setFontColor(C.NAVY);
    }); fila++;
  }); fila++;

  // ── Top faciales ──
  hdr(ws,fila,1,5,"💆 TOP FACIALES DEL MES",C.PURPLE,C.WHITE,10); fila++;
  ["FACIAL","SKU","VECES REALIZADOS","INGRESO BRUTO","COMISIÓN TOTAL"].forEach((h,i)=>{
    ws.getRange(fila,i+1).setValue(h).setBackground(C.PURPLE).setFontColor(C.WHITE).setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center");
  }); fila++;
  Object.entries(datos.faciales||{}).sort((a,b)=>b[1].count-a[1].count).slice(0,10).forEach(([sku,d])=>{
    [d.nombre||sku,sku,d.count,'$'+d.ingrBruto.toFixed(2),'$'+d.comTotal.toFixed(2)].forEach((v,i)=>{
      ws.getRange(fila,i+1).setValue(v).setBackground(i%2===0?C.PURPLE_L:C.WHITE).setFontSize(9).setFontFamily("Arial");
    }); fila++;
  }); fila++;

  // ── Top productos ──
  hdr(ws,fila,1,4,"🧴 TOP PRODUCTOS DEL MES",C.ORANGE,C.WHITE,10); fila++;
  ["PRODUCTO","SKU","UNIDADES VENDIDAS","INGRESO BRUTO"].forEach((h,i)=>{
    ws.getRange(fila,i+1).setValue(h).setBackground(C.ORANGE).setFontColor(C.WHITE).setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center");
  }); fila++;
  Object.entries(datos.productos||{}).sort((a,b)=>b[1].count-a[1].count).slice(0,10).forEach(([sku,d])=>{
    [d.nombre||sku,sku,d.count,'$'+(d.ingrBruto||0).toFixed(2)].forEach((v,i)=>{
      ws.getRange(fila,i+1).setValue(v).setBackground(i%2===0?C.ORANGE_L:C.WHITE).setFontSize(9).setFontFamily("Arial");
    }); fila++;
  }); fila++;

  // ── Actividad diaria del mes ──
  // Find the historial entry matching the report period month
  const reportKey=fechaInicio.getFullYear()+"-"+String(fechaInicio.getMonth()+1).padStart(2,"0");
  const mesActual=historial.find(function(m){return m.key===reportKey;})||null;
  if (mesActual&&mesActual.porDia) {
    hdr(ws,fila,1,5,"📅 ACTIVIDAD DIARIA — "+mesActual.label,C.BLUE,C.WHITE,10); fila++;
    ["DÍA","FACIALES ATENDIDOS","SOLO COMPRARON","TOTAL CLIENTES","INGRESOS DEL DÍA"].forEach((h,i)=>{
      ws.getRange(fila,i+1).setValue(h).setBackground(C.BLUE).setFontColor(C.WHITE).setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center");
    }); fila++;
    const diasOrdenados=Object.keys(mesActual.porDia).map(Number).sort((a,b)=>a-b);
    let maxFaciales=0; diasOrdenados.forEach(d=>{if((mesActual.porDia[d].faciales||0)>maxFaciales)maxFaciales=mesActual.porDia[d].faciales;});
    diasOrdenados.forEach(dia=>{
      const d=mesActual.porDia[dia];
      const esPico=d.faciales>0&&d.faciales===maxFaciales;
      const bg=esPico?C.GOLD_L:d.faciales>3?C.GREEN_L:d.soloCompra>0?C.BLUE_L:C.WHITE;
      ["Día "+dia,d.faciales||0,d.soloCompra||0,(d.faciales||0)+(d.soloCompra||0),'$'+(d.ingresos||0).toFixed(2)].forEach((v,i)=>{
        ws.getRange(fila,i+1).setValue(v).setBackground(bg).setFontSize(9).setFontFamily("Arial");
        if(i===0)ws.getRange(fila,i+1).setFontWeight(esPico?"bold":"normal");
      });
      if(esPico)ws.getRange(fila,1).setValue("⭐ Día "+dia+" (pico)");
      fila++;
    }); fila++;
  }

  // ── Historial y crecimiento mensual ──
  hdr(ws,fila,1,12,"📈 HISTORIAL Y CRECIMIENTO MENSUAL",C.NAVY,C.WHITE,10); fila++;
  ["MES","CLIENTAS","CON FACIAL","SOLO COMPRA","FACIALES","PAQUETES","PRODUCTOS","INGRESO TOTAL","UTILIDAD","RETENCIÓN","CRECIMIENTO INGRESOS","TICKET PROM."].forEach((h,i)=>{
    ws.getRange(fila,i+1).setValue(h).setBackground(C.NAVY).setFontColor(C.WHITE).setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center").setWrap(true);
  }); ws.setRowHeight(fila,30); fila++;

  // Show up to 12 months ending at the report month (inclusive)
  const reportIdx2=historial.findIndex(function(m){return m.key===reportKey;});
  const histSlice=reportIdx2>=0?historial.slice(Math.max(0,reportIdx2-11),reportIdx2+1):historial.slice(-12);
  histSlice.forEach((m,idx)=>{
    const isCurrent=idx===historial.slice(-12).length-1;
    const bg=isCurrent?C.GOLD_L:idx%2===0?C.WHITE:"#F8F9FC";
    const crecColor=m.crecIngr>0?C.GREEN:m.crecIngr<0?C.RED:C.GRAY;
    [m.label,m.clientas,m.clientasConFacial||m.clientas,m.clientasSoloCompra||0,
     m.faciales,m.paquetes,m.productos,'$'+m.ingrTotal.toFixed(2),
     '$'+m.utilTotal.toFixed(2),m.pctRetencion+'%',pct(m.crecIngr),'$'+(m.ticketProm||0).toFixed(2)
    ].forEach((v,i)=>{
      const rng=ws.getRange(fila,i+1);
      rng.setValue(v).setBackground(bg).setFontSize(9).setFontFamily("Arial");
      if(i===0)rng.setFontWeight("bold").setFontColor(C.NAVY);
      if(i===10){rng.setFontColor(crecColor).setFontWeight("bold");}
      if(i===7||i===8)rng.setFontWeight(isCurrent?"bold":"normal");
    }); fila++;
  }); fila++;

  // ── Gift Cards ──
  const totGCVendidas=datos.giftCardsVendidas||datos.giftCards.length||0;
  const totGCUsadas=datos.giftCardsUsadas||datos.giftCards.filter(g=>g.usado).length||0;
  const totCort=historial.reduce((s,m)=>s+(m.cortesias||0),0);
  if (totGCVendidas>0||totCort>0) {
    hdr(ws,fila,1,5,"🎁 GIFT CARDS Y CORTESÍAS",C.GREEN,C.WHITE,10); fila++;
    ["CONCEPTO","EMITIDAS/VENDIDAS EN EL MES","CANJEADAS","PENDIENTES","NOTA"].forEach((h,i)=>{
      ws.getRange(fila,i+1).setValue(h).setBackground(C.GREEN).setFontColor(C.WHITE).setFontWeight("bold").setFontSize(8).setFontFamily("Arial");
    }); fila++;
    const mesGC=mesActual;
    [["🎁 Gift Cards (de planilla GC)",totGCVendidas,totGCUsadas,totGCVendidas-totGCUsadas,"Conteo directo planilla 🎁 GIFT CARDS"],
     ["🎀 Cortesías del mes",mesGC?mesGC.cortesias||0:0,"—","—","Facial con col Q = CORTESIA"]
    ].forEach(([nom,emit,canjeadas,pend,nota])=>{
      [nom,emit,canjeadas,pend,nota].forEach((v,i)=>ws.getRange(fila,i+1).setValue(v).setBackground(C.GREEN_L).setFontSize(9).setFontFamily("Arial"));
      ws.getRange(fila,1).setFontWeight("bold"); fila++;
    }); fila++;
  }

  // ── Alertas y recomendaciones ──
  hdr(ws,fila,1,6,"🚨 ALERTAS Y PUNTOS DE ATENCIÓN",C.RED,C.WHITE,10); fila++;
  const alertas=[];
  if (histSlice.length>=2) {
    const reportIdx3=histSlice.length-1;
    const ult=histSlice[reportIdx3];
    const pen=histSlice[reportIdx3-1];
    if (ult.crecIngr<-10) alertas.push(["⚠️ Caída de ingresos","Ingresos bajaron "+Math.abs(ult.crecIngr)+"% vs mes anterior","Revisar ocupación y precios",C.RED_L]);
    if (ult.pctRetencion<50) alertas.push(["⚠️ Retención baja","Solo el "+ult.pctRetencion+"% de clientas del mes anterior volvieron","Activar seguimiento post-facial",C.RED_L]);
    if (ult.faciales>0&&ult.paquetes/ult.faciales<0.3) alertas.push(["💡 Oportunidad paquetes","Solo "+Math.round(ult.paquetes/ult.faciales*100)+"% de clientes con facial compró paquete","Reforzar oferta de paquetes post-facial",C.GOLD_L]);
    if (ult.crecClientas>20) alertas.push(["✅ Crecimiento acelerado","Clientas aumentaron "+ult.crecClientas+"% — verificar capacidad","Considerar ampliar agenda",C.GREEN_L]);
    if (ult.ticketProm>0&&pen.ticketProm>0&&ult.ticketProm<pen.ticketProm*0.85) alertas.push(["💡 Ticket promedio cayó","De $"+pen.ticketProm.toFixed(2)+" → $"+ult.ticketProm.toFixed(2),"Revisar mix de ventas y descuentos",C.GOLD_L]);
  }
  if (alertas.length===0) alertas.push(["✅ Sin alertas críticas","Todos los indicadores dentro de rango normal","Continuar estrategia actual",C.GREEN_L]);
  ["ALERTA","DETALLE","ACCIÓN RECOMENDADA",""].forEach((h,i)=>{
    if(h)ws.getRange(fila,i+1).setValue(h).setBackground(C.RED).setFontColor(C.WHITE).setFontWeight("bold").setFontSize(8).setFontFamily("Arial");
  }); fila++;
  alertas.forEach(([t,d,a,bg])=>{
    [t,d,a,""].forEach((v,i)=>ws.getRange(fila,i+1).setValue(v).setBackground(bg).setFontSize(9).setFontFamily("Arial").setWrap(true));
    ws.getRange(fila,1).setFontWeight("bold"); fila++;
  }); fila++;

  // Column widths
  ws.setColumnWidth(1,220);
  [2,3,4,5,6,7,8,9,10,11,12].forEach(c=>ws.setColumnWidth(c,100));
}

// ============================================================
// INVENTARIO
// ============================================================
const INV_CONFIG = {
  SHEET_ENTRADAS:   "📥 ENTRADAS",
  SHEET_INVENTARIO: "📊 INVENTARIO",
  BUFFER_RESTOCK:   0.20,
  PRODUCTOS: {
    "SUNSU-HT-001":{nombre:"Heartleaf Cleansing Oil 200ml",proveedor:"Hebetronic S.A",compra:21.91},
    "SUNSU-HT-002":{nombre:"Niacinamide 10%+TXA 4% Serum 30ml",proveedor:"Hebetronic S.A",compra:26.78},
    "SUNSU-HT-003":{nombre:"Heartleaf Quercetinol Cleansing Foam",proveedor:"Hebetronic S.A",compra:16.43},
    "SUNSU-HT-004":{nombre:"Heartleaf 77% Soothing Toner 250ml",proveedor:"Hebetronic S.A",compra:23.73},
    "SUNSU-HT-005":{nombre:"Heartleaf 77 Toner Pad 70 Pads",proveedor:"Hebetronic S.A",compra:25.56},
    "SUNSU-HT-006":{nombre:"Peach 70% Niacinamide Serum 30ml",proveedor:"Hebetronic S.A",compra:24.95},
    "SUNSU-HT-007":{nombre:"Rice Ceramide 7 Hydrating Serum 50ml",proveedor:"Hebetronic S.A",compra:26.78},
    "SUNSU-HT-008":{nombre:"Heartleaf 80% Moisture Soothing Ampoule",proveedor:"Hebetronic S.A",compra:29.21},
    "SUNSU-HT-009":{nombre:"Peach 77 Niacinamide Essence Toner 250ml",proveedor:"Hebetronic S.A",compra:23.73},
    "SUNSU-HT-010":{nombre:"BHA 2% Gentle Exfoliating Toner 150ml",proveedor:"Hebetronic S.A",compra:26.17},
    "SUNSU-HT-011":{nombre:"Protector Solar Vitamin C Brightening SPF50+",proveedor:"Hebetronic S.A",compra:15.95},
    "SUNSU-HT-012":{nombre:"Crema Hidratante Vitamin C Brightening",proveedor:"Hebetronic S.A",compra:15.95},
    "SUNSU-HT-013":{nombre:"Suero Iluminador Vitamin C Brightening",proveedor:"Hebetronic S.A",compra:14.76},
    "SUNSU-HT-014":{nombre:"Azelaic Acid 10 Hyaluron Soothing Serum",proveedor:"Hebetronic S.A",compra:23.73},
    "SUNSU-AS-001":{nombre:"Aceite Limpiador - Eyenlip",proveedor:"Allskin Company S.A.S",compra:17.51},
    "SUNSU-AS-002":{nombre:"Jabón Limpiador Ceramide Foam - Eyenlip",proveedor:"Allskin Company S.A.S",compra:11.26},
    "SUNSU-AS-003":{nombre:"Crema Centella Skin Resurrection - Eyenlip",proveedor:"Allskin Company S.A.S",compra:20.15},
    "SUNSU-AS-004":{nombre:"Tónico Centella Skin Resurrection - Eyenlip",proveedor:"Allskin Company S.A.S",compra:16.91},
    "SUNSU-AS-005":{nombre:"Serum Centella Skin Resurrection - Eyenlip",proveedor:"Allskin Company S.A.S",compra:18.48},
    "SUNSU-AS-006":{nombre:"AC Clear Spot Patch - Eyenlip",proveedor:"Allskin Company S.A.S",compra:8.70},
    "SUNSU-AS-007":{nombre:"Bloqueador Aqua Relaxing Sun Cream SPF50+ - Eyenlip",proveedor:"Allskin Company S.A.S",compra:21.30},
    "SUNSU-ML-001":{nombre:"Rejuvenating Ampoule PDRN Salmon - Dr.esthe",proveedor:"Atencio Aguas Francisco Javier",compra:82.61},
    "SUNSU-ML-002":{nombre:"C.Tox Eye Cream - Dr.esthe",proveedor:"Atencio Aguas Francisco Javier",compra:73.91},
    "SUNSU-ML-003":{nombre:"AC Control Mousse Cleanser - Dr.esthe",proveedor:"Atencio Aguas Francisco Javier",compra:52.17},
    "SUNSU-ML-004":{nombre:"Skin Laser Toner - Dr.esthe",proveedor:"Atencio Aguas Francisco Javier",compra:52.17},
    "SUNSU-ML-005":{nombre:"Whitening A Serum - Dr.esthe",proveedor:"Atencio Aguas Francisco Javier",compra:60.87},
    "SUNSU-ML-006":{nombre:"Cica Pepta Cream - Dr.esthe",proveedor:"Atencio Aguas Francisco Javier",compra:95.65},
    "SUNSU-ML-007":{nombre:"Sun Protection Mild - Dr.esthe",proveedor:"Atencio Aguas Francisco Javier",compra:52.17},
    "SUNSU-ML-009":{nombre:"PEEL-N-GLOW Cooling Pearl Mask - Dr.esthe",proveedor:"Atencio Aguas Francisco Javier",compra:12.17},
    "SUNSU-ML-010":{nombre:"Rejuvenating Lifting Mask - Dr.esthe",proveedor:"Atencio Aguas Francisco Javier",compra:10.43},
    "SUNSU-ML-011":{nombre:"Moisture Clensing Gel - Dr.esthe",proveedor:"Atencio Aguas Francisco Javier",compra:48.70},
    "SUNSU-PH-001":{nombre:"Full Moon Balance - APHLORA",proveedor:"APHLORA",compra:27.00},
    "SUNSU-PH-002":{nombre:"Bump Balance - APHLORA",proveedor:"APHLORA",compra:28.00},
    "SUNSU-PH-007":{nombre:"Skin Drops - APHLORA",proveedor:"APHLORA",compra:17.50},
    "SUNSU-PH-008":{nombre:"Harmony Drops (Rejuvenate Tonic) - APHLORA",proveedor:"APHLORA",compra:17.50},
    "SUNSU-JN-001":{nombre:"Premium White Goat Milk Cream - RiRe",proveedor:"RiRe / Holika Holika",compra:29.22},
    "SUNSU-JN-002":{nombre:"Aloe Soothing Sun Cream SPF50 - Holika Holika",proveedor:"RiRe / Holika Holika",compra:21.91},
    "SUNSU-BV-001":{nombre:"Lab Tech Cryo SOS Cream 15ml - Bruno Vassari",proveedor:"Bruno Vassari Ecuador Cia Ltda",compra:21.48},
    "SUNSU-SU-001":{nombre:"Lipoexosome Proxy Powder - MATRIGEN",proveedor:"SUNSU",compra:58.00},
    "SUNSU-SU-002":{nombre:"Lipoexosome B-Archive Complex - MATRIGEN",proveedor:"SUNSU",compra:58.00},
    "SUNSU-SU-003":{nombre:"Lipoexosome Gravity Furrow Complex - MATRIGEN",proveedor:"SUNSU",compra:58.00},
    "SUNSU-SU-004":{nombre:"Azulene Relaxer Ampoule 50 ml - MATRIGEN",proveedor:"SUNSU",compra:110.00},
    "SUNSU-SU-005":{nombre:"Ampoule Cleansing Foam 120 ml - LAMINARIA",proveedor:"SUNSU",compra:25.00},
    "SUNSU-SU-006":{nombre:"Greenery Serum 35 ml - LAMINARIA",proveedor:"SUNSU",compra:42.00},
    "SUNSU-SU-007":{nombre:"Glazed Cream 50 g - LAMINARIA",proveedor:"SUNSU",compra:48.00},
  },
  PROVEEDORES: {
    "Hebetronic S.A":                 {ruc:"1793161898001",familia:"HT"},
    "Allskin Company S.A.S":          {ruc:"RUC PENDIENTE",familia:"AS"},
    "Atencio Aguas Francisco Javier": {ruc:"1715933022001",familia:"ML"},
    "APHLORA":                        {ruc:"RUC PENDIENTE",familia:"PH"},
    "RiRe / Holika Holika":           {ruc:"RUC PENDIENTE",familia:"JN"},
    "Bruno Vassari Ecuador Cia Ltda":  {ruc:"1792033454001",familia:"BV"},
    "SUNSU":                           {ruc:"1793219469001",familia:"SU"},
  }
};

// ── Stock AL CORTE de una familia a una fecha dada: stock actual del INVENTARIO
// menos entradas recibidas DESPUES del corte, mas ventas DESPUES del corte.
// Sirve para reconstruir retroactivamente el stock de cualquier quincena.
function _stockCorteFamilia_(ss, famOC, fFinOC) {
  var vendPost = {};
  try {
    var wsTk = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
    var dTk = wsTk.getDataRange().getValues(); var hdr = dTk[0];
    for (var ti=1; ti<dTk.length; ti++) {
      var f = dTk[ti][0];
      if (!(f instanceof Date) || f <= fFinOC) continue;
      for (var hi=0; hi<hdr.length; hi++) {
        var h = (hdr[hi]||'').toString().trim();
        if (!h || h.indexOf(famOC+'-') !== 0) continue;
        var q = parseFloat(dTk[ti][hi])||0;
        if (q>0) vendPost[h]=(vendPost[h]||0)+q;
      }
    }
  } catch(e1) {}
  var entPost = {};
  try {
    var wsEn = ss.getSheetByName('📥 ENTRADAS');
    if (wsEn) {
      var dEn = wsEn.getDataRange().getValues();
      for (var en=2; en<dEn.length; en++) {
        var r = dEn[en];
        var skuE = (r[1]||'').toString().trim();
        if (skuE.indexOf('SUNSU-'+famOC+'-') !== 0) continue;
        var cantE = parseFloat(r[5])||0; if (cantE<=0) continue;
        var fe = null;
        if (r[10] instanceof Date) fe = r[10];
        else {
          var mk=(r[10]||'').toString().trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
          if (mk) fe = new Date(parseInt(mk[3],10),parseInt(mk[2],10)-1,parseInt(mk[1],10));
          else if (r[0] instanceof Date) fe = r[0];
        }
        if (fe && fe > fFinOC) { var cE=skuE.replace(/^SUNSU-/,''); entPost[cE]=(entPost[cE]||0)+cantE; }
      }
    }
  } catch(e2) {}
  var out = [];
  try {
    var wsInv = ss.getSheets().find(function(s){ return s.getName().includes('INVENTARIO'); });
    var dInv = wsInv.getDataRange().getValues();
    for (var vi=2; vi<dInv.length; vi++) {
      var skuI = (dInv[vi][0]||'').toString().trim();
      if (skuI.indexOf('SUNSU-'+famOC+'-') !== 0) continue;
      var codI = skuI.replace(/^SUNSU-/,'');
      var stockNow = parseFloat(dInv[vi][5])||0;
      var stCorteR = Math.round((stockNow - (entPost[codI]||0) + (vendPost[codI]||0))*100)/100;
      // Negativo = registro tardío de una entrada → usar el stock actual
      if (stCorteR < 0) stCorteR = Math.max(0, stockNow);
      out.push({ sku: skuI, nombre: (dInv[vi][1]||'').toString().trim(),
        stockCorte: stCorteR });
    }
  } catch(e3) {}
  return out;
}

function getNextOrderNumber() {
  const props=PropertiesService.getScriptProperties();
  const year=new Date().getFullYear(), key="lastOrder_"+year;
  const last=parseInt(props.getProperty(key)||"0")+1;
  props.setProperty(key,last.toString());
  return "OC-"+year+"-"+String(last).padStart(3,"0");
}

function generarOrdenPedido() {
  const ss=SpreadsheetApp.getActiveSpreadsheet(), ui=SpreadsheetApp.getUi();
  const provs=Object.keys(INV_CONFIG.PROVEEDORES);
  const r1=ui.prompt("Generar orden de pedido","Selecciona el proveedor:\n\n"+provs.map((p,i)=>(i+1)+". "+p).join("\n"),ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton()!==ui.Button.OK) return;
  const provInput=r1.getResponseText().trim(), provIdx=parseInt(provInput)-1;
  const proveedor=isNaN(provIdx)?provInput:provs[provIdx];
  if (!INV_CONFIG.PROVEEDORES[proveedor]) { ui.alert("Proveedor no encontrado"); return; }
  const hoy=new Date();
  const meses=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const mesesNum=["01","02","03","04","05","06","07","08","09","10","11","12"];
  // Preguntar mes y año (permite generar órdenes de quincenas anteriores)
  const rMes=ui.prompt("¿Mes y año?","Escribe mes (1-12) y año separados por espacio\nEj: 5 2026 (para Mayo 2026)\nO solo Enter para el mes actual ("+meses[hoy.getMonth()]+" "+hoy.getFullYear()+")",ui.ButtonSet.OK_CANCEL);
  if (rMes.getSelectedButton()!==ui.Button.OK) return;
  let mes=hoy.getMonth(), año=hoy.getFullYear();
  const mesInput=rMes.getResponseText().trim();
  if (mesInput) {
    const partes=mesInput.split(/\s+/);
    const mesN=parseInt(partes[0]);
    const añoN=parseInt(partes[1]||año);
    if (!isNaN(mesN) && mesN>=1 && mesN<=12) { mes=mesN-1; }
    if (!isNaN(añoN) && añoN>=2020) { año=añoN; }
  }
  const r2=ui.prompt("¿Qué quincena?","Escribe 1 = (1-15 "+meses[mes]+") o 2 = (16-fin "+meses[mes]+")",ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton()!==ui.Button.OK) return;
  const quincena=r2.getResponseText().trim()==="2"?2:1;
  const qLabel=quincena===1?"1-15 "+meses[mes]+" "+año:"16-fin "+meses[mes]+" "+año;
  const ventas=calcularVentasQuincena(ss,proveedor,quincena,mes,año);
  const stock=leerStockActual(ss,proveedor);
  const numOrden=getNextOrderNumber();
  const nombrePest=numOrden+" "+proveedor.split(" ")[0]+" "+qLabel;
  if (ss.getSheetByName(nombrePest)) { if (ui.alert("Ya existe. ¿Sobreescribir?",ui.ButtonSet.YES_NO)!==ui.Button.YES) return; ss.deleteSheet(ss.getSheetByName(nombrePest)); }
  const wsOC=ss.insertSheet(nombrePest); wsOC.setTabColor(COLOR.NAVY);
  crearPestanaOrdenPedido(wsOC,proveedor,qLabel,ventas,stock,numOrden);
  crearEntradasPendientes(ss,proveedor,ventas,qLabel,numOrden);
  ui.alert("✅ Orden "+numOrden+" generada para "+proveedor);
}

function calcularVentasQuincena(ss,proveedor,quincena,mes,año) {
  const wsTicket=ss.getSheets().find(s=>s.getName().includes("TICKET_FICHA")); if (!wsTicket) return {};
  let fechaInicio,fechaFin;
  if (quincena===1) { fechaInicio=new Date(año,mes,1); fechaFin=new Date(año,mes,15,23,59,59); }
  else { const ud=new Date(año,mes+1,0).getDate(); fechaInicio=new Date(año,mes,16); fechaFin=new Date(año,mes,ud,23,59,59); }
  const datos=wsTicket.getDataRange().getValues(), headers=datos[0];
  const familia=INV_CONFIG.PROVEEDORES[proveedor].familia, ventas={};
  Object.entries(getProductosInv_(ss)).forEach(([sku,info])=>{ if (info.proveedor===proveedor) ventas[sku]={nombre:info.nombre,vendido:0,compra:info.compra}; });
  for (let i=1;i<datos.length;i++) {
    const fila=datos[i], ts=fila[0]; if (!ts) continue;
    const fecha=ts instanceof Date?ts:new Date(ts);
    if (isNaN(fecha.getTime())||fecha<fechaInicio||fecha>fechaFin) continue;
    headers.forEach((h,idx)=>{ if (!h) return; const hStr=h.toString().trim(); if (!hStr.startsWith(familia+"-")) return; const sku="SUNSU-"+hStr; const qty=parseInt(fila[idx])||0; if (qty>0&&ventas[sku]!==undefined) ventas[sku].vendido+=qty; });
  }
  Object.keys(ventas).forEach(sku=>{ ventas[sku].restockSugerido=Math.ceil(ventas[sku].vendido*(1+INV_CONFIG.BUFFER_RESTOCK)); });
  return ventas;
}

function leerStockActual(ss,proveedor) {
  const wsInv=ss.getSheetByName(INV_CONFIG.SHEET_INVENTARIO); if (!wsInv) return {};
  const datos=wsInv.getDataRange().getValues(), stock={};
  const skusProv=Object.entries(getProductosInv_(ss)).filter(([,v])=>v.proveedor===proveedor).map(([k])=>k);
  for (let i=2;i<datos.length;i++) { const sku=(datos[i][0]||"").toString().trim(); if (!sku||!skusProv.includes(sku)) continue; stock[sku]={stockActual:parseFloat(datos[i][5])||0,precioCompra:parseFloat(datos[i][6])||0,stockMinimo:parseFloat(datos[i][8])||0,restockSuger:parseFloat(datos[i][9])||0}; }
  return stock;
}

function crearPestanaOrdenPedido(ws,proveedor,qLabel,ventas,stock,numOrden) {
  const provInfo=INV_CONFIG.PROVEEDORES[proveedor];
  const hoy=Utilities.formatDate(new Date(),"America/Guayaquil","dd/MM/yyyy");
  const C={NAVY:COLOR.NAVY,BLUE:COLOR.BLUE,BLUE_L:COLOR.BLUE_L,GREEN:COLOR.GREEN,GREEN_L:COLOR.GREEN_L,GRAY:COLOR.GRAY,GRAY_L:COLOR.GRAY_L,WHITE:"#FFFFFF",GOLD:COLOR.GOLD,GOLD_L:COLOR.GOLD_L,RED_L:COLOR.RED_L,AMBER_L:COLOR.GOLD_L};
  let fila=1;
  ws.getRange(fila,1,1,7).merge().setValue("SUNSU SPA — GLASS SKIN").setBackground(C.NAVY).setFontColor(C.WHITE).setFontWeight("bold").setFontSize(18).setFontFamily("Arial").setHorizontalAlignment("center").setVerticalAlignment("middle"); ws.setRowHeight(fila,50); fila++;
  ws.getRange(fila,1,1,7).merge().setValue("순수 | Korean Facial Spa | Quito, Ecuador").setBackground(C.NAVY).setFontColor(COLOR.LAVENDER).setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("center"); ws.setRowHeight(fila,25); fila++;
  ws.getRange(fila,1,1,7).merge().setValue("ORDEN DE PEDIDO / PRE-FACTURA DE CONSIGNACIÓN").setBackground(COLOR.NAVY).setFontColor(C.WHITE).setFontWeight("bold").setFontSize(12).setFontFamily("Arial").setHorizontalAlignment("center"); ws.setRowHeight(fila,30); fila+=2;
  [["PROVEEDOR:",proveedor],["RUC PROVEEDOR:",provInfo.ruc],["QUINCENA:",qLabel],["FECHA DE SOLICITUD:",hoy],["# ORDEN:",numOrden],["SOLICITADO POR:","Sunsu Spa — Administración"]].forEach(([lbl,val])=>{ ws.getRange(fila,1,1,3).merge().setValue(lbl).setFontWeight("bold").setFontSize(9).setFontFamily("Arial"); ws.getRange(fila,4,1,4).merge().setValue(val).setFontSize(lbl==="# ORDEN:"?11:9).setFontFamily("Arial").setFontWeight(lbl==="# ORDEN:"?"bold":"normal").setFontColor(lbl==="# ORDEN:"?COLOR.BLUE:"black"); fila++; });
  fila++;
  ws.getRange(fila,1,1,7).merge().setValue("DETALLE DE PEDIDO Y ESTADO DE INVENTARIO").setBackground(C.NAVY).setFontColor(C.WHITE).setFontWeight("bold").setFontSize(10).setFontFamily("Arial"); ws.setRowHeight(fila,25); fila++;
  ["SKU","PRODUCTO","STOCK\nACTUAL","CONSUMIDO\nQUINCENA","PRECIO\nCOMPRA","TOTAL","RESTOCK\nSUGERIDO"].forEach((h,i)=>{ ws.getRange(fila,i+1).setValue(h).setBackground([C.BLUE,C.BLUE,C.GRAY,C.GRAY,C.GRAY,C.GREEN,COLOR.LAVENDER][i]).setFontColor(C.WHITE).setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true); });
  ws.setRowHeight(fila,35); fila++;
  const filaInicioData=fila; let totalPedido=0;
  Object.entries(ventas).forEach(([sku,v],idx)=>{ const bg=idx%2===0?C.BLUE_L:C.WHITE; const stockAct=stock[sku]?stock[sku].stockActual:0; const precioReal=(stock[sku]&&stock[sku].precioCompra>0)?stock[sku].precioCompra:v.compra; const restock=v.vendido>0?Math.ceil(v.vendido*(1+INV_CONFIG.BUFFER_RESTOCK)):0; const total=v.vendido*precioReal; totalPedido+=total; const stockBg=stockAct<=0?C.RED_L:stockAct<=3?C.AMBER_L:bg; ws.getRange(fila,1).setValue(sku).setBackground(bg).setFontSize(8).setFontFamily("Arial").setFontColor(C.GRAY); ws.getRange(fila,2).setValue(v.nombre).setBackground(bg).setFontSize(9).setFontFamily("Arial"); ws.getRange(fila,3).setValue(stockAct).setBackground(stockBg).setFontWeight("bold").setHorizontalAlignment("center").setFontSize(10).setFontFamily("Arial"); ws.getRange(fila,4).setValue(v.vendido).setBackground(bg).setHorizontalAlignment("center").setFontSize(9).setFontFamily("Arial"); ws.getRange(fila,5).setValue(precioReal).setBackground(bg).setNumberFormat('"$"#,##0.00').setHorizontalAlignment("right").setFontSize(9).setFontFamily("Arial"); ws.getRange(fila,6).setValue(total).setBackground(bg).setFontWeight("bold").setNumberFormat('"$"#,##0.00').setHorizontalAlignment("right").setFontSize(9).setFontFamily("Arial"); ws.getRange(fila,7).setValue(restock).setBackground(COLOR.LAVENDER_L).setFontWeight("bold").setFontColor(COLOR.LAVENDER).setHorizontalAlignment("center").setFontSize(11).setFontFamily("Arial"); ws.setRowHeight(fila,22); fila++; });
  const iva=totalPedido*0.15;
  [["TOTAL A FACTURAR (SIN IVA)",totalPedido,C.NAVY,COLOR.GOLD],["IVA 15%",iva,COLOR.NAVY,C.WHITE],["TOTAL CON IVA",totalPedido+iva,C.GREEN,C.WHITE]].forEach(([lbl,val,bg,fc])=>{ ws.getRange(fila,1,1,5).merge().setValue(lbl).setBackground(bg).setFontColor(fc).setFontWeight("bold").setFontSize(lbl==="TOTAL CON IVA"?11:10).setFontFamily("Arial"); ws.getRange(fila,6).setValue(val).setBackground(bg).setFontColor(fc).setFontWeight("bold").setNumberFormat('"$"#,##0.00').setFontSize(lbl==="TOTAL CON IVA"?13:12).setFontFamily("Arial"); ws.getRange(fila,7).setBackground(bg); ws.setRowHeight(fila,lbl==="TOTAL CON IVA"?30:25); fila++; });
  fila++;
  ws.getRange(fila,1,1,7).merge().setValue("Nota: Los productos son entregados en modalidad de CONSIGNACIÓN. Sunsu Spa pagará únicamente los productos vendidos en la quincena indicada.").setBackground(C.GRAY_L).setFontColor(C.GRAY).setFontStyle("italic").setFontSize(8).setFontFamily("Arial").setWrap(true); ws.setRowHeight(fila,35); fila++;
  ws.getRange(fila,1,1,7).merge().setValue("Favor emitir factura a nombre de: SUNSU SPA | Confirmar recepción al WhatsApp de administración.").setBackground(C.GOLD_L).setFontColor(C.GOLD).setFontWeight("bold").setFontSize(9).setFontFamily("Arial").setWrap(true);
  ws.setColumnWidth(1,150); ws.setColumnWidth(2,320); ws.setColumnWidth(3,80); ws.setColumnWidth(4,90); ws.setColumnWidth(5,90); ws.setColumnWidth(6,100); ws.setColumnWidth(7,100);
}

function crearEntradasPendientes(ss,proveedor,ventas,qLabel,numOrden) {
  const wsE=ss.getSheetByName(INV_CONFIG.SHEET_ENTRADAS); if (!wsE) return;
  let ultimaFila=Math.max(wsE.getLastRow()+1,4);
  const ts=Utilities.formatDate(new Date(),"America/Guayaquil","dd/MM/yyyy HH:mm");
  Object.entries(ventas).forEach(([sku,v])=>{
    if (v.restockSugerido<=0) return;
    const r=ultimaFila;
    wsE.getRange(r,1).setNumberFormat('@').setValue(ts); // TEXTO: evita date-flip US locale
    wsE.getRange(r,2).setValue(sku); wsE.getRange(r,3).setValue(v.nombre);
    wsE.getRange(r,4).setValue(proveedor); wsE.getRange(r,5).setValue(v.restockSugerido); wsE.getRange(r,6).setValue("");
    wsE.getRange(r,7).setFormula('=IF(F'+r+'="","⏳ Pendiente",IF(F'+r+'=0,"❌ No llegó",IF(F'+r+'>=E'+r+',"✅ Completo","⚠️ Parcial")))');
    wsE.getRange(r,8).setValue(numOrden); wsE.getRange(r,9).setValue("Pedido "+qLabel);
    const bg=r%2===0?COLOR.GOLD_L:COLOR.GOLD_L;
    wsE.getRange(r,1,1,10).setBackground(bg).setFontSize(9).setFontFamily("Arial");
    wsE.getRange(r,6).setBackground(COLOR.GREEN_L).setFontWeight("bold");
    wsE.getRange(r,7).setBackground(COLOR.GOLD_L).setFontWeight("bold").setFontColor(COLOR.GOLD);
    wsE.getRange(r,8).setBackground(COLOR.BLUE_L).setFontWeight("bold").setFontColor(COLOR.BLUE).setHorizontalAlignment("center");
    ultimaFila++;
  });
}

function verAlertasStock() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const wsInv=ss.getSheetByName(INV_CONFIG.SHEET_INVENTARIO);
  if (!wsInv) { SpreadsheetApp.getUi().alert("No se encontró 📊 INVENTARIO"); return; }
  const datos=wsInv.getDataRange().getValues(), sinStock=[], stockBajo=[];
  for (let i=2;i<datos.length;i++) {
    const sku=(datos[i][0]||"").toString().trim(), nombre=(datos[i][1]||"").toString().trim();
    const stock=parseInt(datos[i][6])||0, minimo=parseInt(datos[i][9])||0;
    if (!sku) continue;
    if (stock<=0) sinStock.push(nombre); else if (stock<=minimo) stockBajo.push(nombre+" ("+stock+" uds)");
  }
  let msg="";
  if (sinStock.length>0) msg+="🔴 SIN STOCK:\n"+sinStock.join("\n")+"\n\n";
  if (stockBajo.length>0) msg+="🟡 STOCK BAJO:\n"+stockBajo.join("\n");
  if (!msg) msg="✅ Todo el inventario está en niveles normales.";
  SpreadsheetApp.getUi().alert("ALERTAS DE INVENTARIO", msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

// Marca de las líneas de compra directa en 📥 ENTRADAS (col I).
function _esNotaCompraDirecta_(notas) {
  return (notas||'').toString().toUpperCase().indexOf('COMPRA DIRECTA') >= 0;
}
// Suma de lo ya pasado a cabina, según las marcas "🧴 cabina INV-012 +3" de la nota.
function _cabinaYaAplicada_(notas) {
  var n = 0, m;
  var re = /🧴 cabina \S+ ([+-]?\d+(?:\.\d+)?)/g;
  var s = (notas||'').toString();
  while ((m = re.exec(s))) n += parseFloat(m[1]) || 0;
  return Math.round(n * 1000) / 1000;
}
function _skuCabinaNorm_(s) {
  return (s||'').toString().trim().toUpperCase().replace(/^SUNSU-/,'');
}
// Nombre para empatar con Cabina: minúsculas y sin tildes, pero CON números
// (30 ml ≠ 50 ml). Si hay más de un candidato, no se adivina: se crea otro.
function _normProdCabina_(s) {
  return (s||'').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ').trim();
}
// datos = getDataRange de 🧴 INVENTARIO CABINA (fila 0 = encabezados).
function _cabinaMatchDirecta_(datos, sku, nombre) {
  var skuN = _skuCabinaNorm_(sku);
  var nomN = _normProdCabina_(nombre);
  var porSku = -1, porCod = -1, porNom = [];
  for (var i = 1; i < datos.length; i++) {
    var cod = (datos[i][0]||'').toString().trim();
    var prod = (datos[i][1]||'').toString().trim();
    if (!cod && !prod) continue;
    var skuCat = _skuCabinaNorm_(datos[i][13]);
    if (skuN && skuCat && skuCat === skuN) { porSku = i; break; }
    if (skuN && _skuCabinaNorm_(cod) === skuN && porCod < 0) porCod = i;
    if (nomN && _normProdCabina_(prod) === nomN) porNom.push(i);
  }
  if (porSku >= 0) return {idx:porSku, via:'sku'};
  if (porCod >= 0) return {idx:porCod, via:'codigo'};
  if (porNom.length === 1) return {idx:porNom[0], via:'nombre'};
  return {idx:-1, via: porNom.length>1 ? 'ambiguo' : 'nuevo'};
}
// Suma (o resta) envases cerrados LOCALES en Cabina. Si no hay match claro, crea INV-###.
// delta es la diferencia de cantidad recibida (nueva − anterior), no el total.
function _compraDirectaACabina_(ss, opts) {
  opts = opts || {};
  var delta = parseFloat(opts.delta);
  if (isNaN(delta) || delta === 0) return {accion:'sin_cambio', delta:0};
  var ssCb = _cabinaSS_();
  if (!ssCb) return {error:'Estructura de cabina no creada — el stock no entró a cabina', delta:delta};
  var wInv = ssCb.getSheetByName('🧴 INVENTARIO CABINA');
  if (!wInv) return {error:'No existe 🧴 INVENTARIO CABINA', delta:delta};
  _cabInvHeaders_(wInv);
  var datos = wInv.getDataRange().getValues();
  var m = _cabinaMatchDirecta_(datos, opts.sku, opts.nombre);
  var skuFull = (opts.sku||'').toString().trim().toUpperCase();
  if (m.idx < 0) {
    if (delta < 0) return {error:'No hay producto de cabina para descontar', delta:delta, via:m.via};
    var codigo = _cabNext_(wInv, 'INV-');
    var nomBase = (opts.nombre||'').toString().trim() || skuFull || 'Producto';
    var prodNom = skuFull ? (nomBase+' ('+skuFull+')') : nomBase;
    var nota = 'Alta automática por compra directa'+(opts.orden?(' · '+opts.orden):'')
      +' · no suma al inventario de ventas. 1 envase = 1 und; edita contenido/unidad si el protocolo lo usa en ml.';
    wInv.appendRow([codigo, prodNom, (opts.proveedor||'').toString().trim(), 1, 'und', 0, 0, delta, 0, delta, 0, nota, 'SI', skuFull, 0, '', '', '', '', '', 1]);
    var outN = {accion:'creado', codigo:codigo, nombre:prodNom, delta:delta, cerrados:delta, activo:'SI', via:m.via, row:wInv.getLastRow()};
    try { logAccion_(ss, 'CABINA COMPRA DIRECTA', 'creado '+codigo+' +'+delta+' · '+skuFull+(opts.orden?(' · '+opts.orden):''), opts.usuario||''); } catch(eLN) {}
    return outN;
  }
  var idx = m.idx;
  var fila = idx + 1;
  var cont = parseFloat(datos[idx][3])||0;
  var cerr = parseFloat(datos[idx][7])||0;
  var ab = parseFloat(datos[idx][8])||0;
  var bod = parseFloat(datos[idx][14])||0;
  var nuevoCerr = cerr + delta;
  if (nuevoCerr < 0) nuevoCerr = 0;
  var aplicado = nuevoCerr - cerr;
  wInv.getRange(fila, 8).setValue(nuevoCerr); // ENVASES CERRADOS (local)
  wInv.getRange(fila, 10).setValue((nuevoCerr + bod + ab) * cont); // STOCK TOTAL, igual que al recibir una OC de cabina
  if (skuFull && !(datos[idx][13]||'').toString().trim()) wInv.getRange(fila, 14).setValue(skuFull);
  var activo = ((datos[idx][12]||'SI')+'').toString().trim() || 'SI';
  if (aplicado === 0) return {accion:'sin_cambio', codigo:(datos[idx][0]||'').toString(), delta:0, pedido:delta, cerrados:nuevoCerr, activo:activo, via:m.via, row:fila};
  var out = {accion:'sumado', codigo:(datos[idx][0]||'').toString(), nombre:(datos[idx][1]||'').toString(), delta:aplicado, pedido:delta, cerrados:nuevoCerr, activo:activo, via:m.via, row:fila};
  try { logAccion_(ss, 'CABINA COMPRA DIRECTA', 'sumado '+out.codigo+' '+((aplicado>0?'+':'')+aplicado)+' · '+skuFull+' ('+m.via+')', opts.usuario||''); } catch(eLS) {}
  return out;
}
// Pasa a Cabina lo recibido de compra directa que aún no tiene marca.
// Idempotente: la nota guarda cuánto ya se sumó. soloSku vacío = todas las filas.
// Si no hay nada pendiente, no exige que exista la estructura de cabina.
function _migrarCompraDirectaACabina_(ss, soloSku) {
  var ws = ss.getSheetByName(INV_CONFIG.SHEET_ENTRADAS);
  if (!ws) return {ok:false, error:'No existe ENTRADAS', errores:['No existe ENTRADAS'], tocadas:0, unidades:0};
  var datos = ws.getDataRange().getValues();
  var skuFiltro = soloSku ? _skuCabinaNorm_(soloSku) : '';
  var pend = [];
  for (var i = 2; i < datos.length; i++) {
    var sku = (datos[i][1]||'').toString().trim();
    if (!sku || sku.toLowerCase()==='sku') continue;
    var notas = (datos[i][8]||'').toString();
    if (!_esNotaCompraDirecta_(notas)) continue;
    if (skuFiltro && _skuCabinaNorm_(sku) !== skuFiltro) continue;
    var rawF = datos[i][5];
    if (rawF==='' || rawF===null || rawF===undefined) continue;
    var recibida = parseFloat(rawF);
    if (isNaN(recibida)) continue;
    var delta = Math.round((recibida - _cabinaYaAplicada_(notas)) * 1000) / 1000;
    if (!delta) continue;
    pend.push({
      fila: i+1, sku: sku, notas: notas, delta: delta,
      nombre: (datos[i][2]||'').toString().trim(),
      proveedor: (datos[i][3]||'').toString().trim(),
      orden: (datos[i][7]||'').toString().trim()
    });
  }
  if (!pend.length) return {ok:true, tocadas:0, unidades:0, errores:[]};
  if (!_cabinaSS_()) return {ok:false, error:'Estructura de cabina no creada — el stock de compra directa sigue en el inventario de ventas hasta que exista Cabina', errores:['Estructura de cabina no creada'], tocadas:0, unidades:0};
  var tocadas = 0, unidades = 0, errores = [];
  pend.forEach(function(p){
    var res;
    try {
      res = _compraDirectaACabina_(ss, {sku:p.sku, nombre:p.nombre, proveedor:p.proveedor, delta:p.delta, orden:p.orden, usuario:'migración'});
    } catch(eMig) { errores.push(p.sku+': '+(eMig.message||eMig)); return; }
    if (!res || res.error) { errores.push(p.sku+': '+((res&&res.error)||'sin respuesta')); return; }
    if (res.accion!=='creado' && res.accion!=='sumado') return;
    var marca = '🧴 cabina '+(res.codigo||'')+' '+((res.delta>0?'+':'')+res.delta);
    ws.getRange(p.fila, 9).setValue(p.notas ? (p.notas+' | '+marca) : marca);
    p.notas = p.notas ? (p.notas+' | '+marca) : marca;
    tocadas++;
    unidades += res.delta;
  });
  return {ok: errores.length===0, tocadas:tocadas, unidades:Math.round(unidades*1000)/1000, errores:errores, error: errores.length?errores[0]:''};
}
// Col D de 📊 INVENTARIO: recibido Completo/Parcial, ignorando compra directa.
function _formulaEntradasInventario_(entNombre, fila) {
  return "=IFERROR(SUMPRODUCT("
    + "('" + entNombre + "'!B4:B500=A" + fila + ")"
    + "*(ISNUMBER(SEARCH(\"Completo\",'" + entNombre + "'!G4:G500))"
    + "+ISNUMBER(SEARCH(\"Parcial\",'" + entNombre + "'!G4:G500)))"
    + "*(1-ISNUMBER(SEARCH(\"COMPRA DIRECTA\",'" + entNombre + "'!I4:I500)))"
    + ",'" + entNombre + "'!F4:F500),0)";
}
// Reescribe la fórmula de UN sku para que la directa deje de contar de inmediato,
// sin esperar a que alguien corra el menú sobre todo el inventario.
function _parcheFormulaDirecta_(ss, sku) {
  if (!sku) return;
  var wsInv = ss.getSheetByName(INV_CONFIG.SHEET_INVENTARIO);
  if (!wsInv) return;
  var wsEnt = ss.getSheetByName(INV_CONFIG.SHEET_ENTRADAS);
  var entNombre = wsEnt ? wsEnt.getName() : INV_CONFIG.SHEET_ENTRADAS;
  var skuU = sku.toString().trim().toUpperCase();
  var skuCorto = skuU.replace(/^SUNSU-/,'');
  var last = wsInv.getLastRow();
  if (last < 3) return;
  var colA = wsInv.getRange(3, 1, last-2, 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    var a = (colA[i][0]||'').toString().trim().toUpperCase();
    if (!a) continue;
    if (a !== skuU && a.replace(/^SUNSU-/,'') !== skuCorto) continue;
    var fila = i + 3;
    var fml = wsInv.getRange(fila, 4).getFormula() || '';
    if (fml.indexOf('COMPRA DIRECTA') >= 0) return;
    wsInv.getRange(fila, 4).setFormula(_formulaEntradasInventario_(entNombre, fila));
    return;
  }
}

function corregirFormulasInventario() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const wsInv=ss.getSheetByName("📊 INVENTARIO"), wsEnt=ss.getSheetByName("📥 ENTRADAS");
  const wsTk=ss.getSheets().find(s=>s.getName().includes("TICKET_FICHA"));
  if (!wsInv) { SpreadsheetApp.getUi().alert("No se encontró 📊 INVENTARIO"); return; }
  // Primero el historial de compra directa pasa a Cabina. Si eso falla, NO se
  // tocan las fórmulas: si no, ese stock saldría de la percha y no entraría a cabina.
  var migInv = {ok:true, tocadas:0, unidades:0, errores:[]};
  try { migInv = _migrarCompraDirectaACabina_(ss, ''); }
  catch(eMigInv) { migInv = {ok:false, error:eMigInv.message||String(eMigInv), errores:[String(eMigInv)]}; }
  if (!migInv || !migInv.ok) {
    SpreadsheetApp.getUi().alert("No actualicé las fórmulas.\n\nLa compra directa histórica todavía no pasó a Cabina:\n"+((migInv&&(migInv.error||(migInv.errores||[]).join("\n")))||"error desconocido"));
    return;
  }
  const entNombre=wsEnt?wsEnt.getName():"📥 ENTRADAS";
  const tkNombre=wsTk?wsTk.getName():"TICKET_FICHA";
  const tkHeaders=wsTk?wsTk.getRange(1,1,1,wsTk.getLastColumn()).getValues()[0]:[];
  const datos=wsInv.getDataRange().getValues(); let fixed=0;
  for (let i=2;i<datos.length;i++) {
    const r=i+1, sku=(datos[i][0]||"").toString().trim(); if (!sku) continue;
    // Excluye notas con COMPRA DIRECTA: ese stock va a Cabina, no a percha.
    const dF=_formulaEntradasInventario_(entNombre, r);
    wsInv.getRange(r,4).setFormula(dF);
    const prodCode=sku.replace("SUNSU-",""); let tkCol="";
    for (let c=0;c<tkHeaders.length;c++) { if ((tkHeaders[c]||"").toString().trim()===prodCode) { tkCol=invColumnToLetter(c+1); break; } }
    // SUMIFS en vez de SUMPRODUCT: ignora celdas de texto ('' de ediciones) en la
    // columna del producto — una sola celda de texto rompía el SUMPRODUCT a 0.
    if (tkCol) wsInv.getRange(r,5).setFormula("=IFERROR(SUMIFS('"+tkNombre+"'!"+tkCol+"2:"+tkCol+"9999,'"+tkNombre+"'!A2:A9999,\">=\"&DATE(2026,5,22)),0)");
    else wsInv.getRange(r,5).setValue(0);
    wsInv.getRange(r,6).setFormula("=C"+r+"+D"+r+"-E"+r);
    wsInv.getRange(r,10).setFormula("=MAX(0,I"+r+"-F"+r+")");
    wsInv.getRange(r,11).setFormula('=IF(F'+r+'<=0,"SIN STOCK",IF(F'+r+'<=I'+r+',"STOCK BAJO","OK"))');
    fixed++;
  }
  var txtMig = migInv.tocadas ? (" Compra directa histórica: "+migInv.tocadas+" líneas → Cabina ("+(migInv.unidades>0?"+":"")+migInv.unidades+" und).") : " Sin compra directa pendiente de pasar a Cabina.";
  SpreadsheetApp.getActiveSpreadsheet().toast("✅ "+fixed+" fórmulas corregidas.","SUNSU Inventario",8);
  SpreadsheetApp.getUi().alert("✅ Listo. "+fixed+" productos actualizados. La columna de entradas ya ignora COMPRA DIRECTA."+txtMig);
}

function invColumnToLetter(col) {
  let letter="";
  while (col>0) { const rem=(col-1)%26; letter=String.fromCharCode(65+rem)+letter; col=Math.floor((col-1)/26); }
  return letter;
}

// ============================================================
// RECOLOR — Aplica paleta Sunsu a todo el Google Sheet
// Ejecutar manualmente desde ⚙ Config → 🎨 Aplicar paleta Sunsu
// ============================================================
function recolorTodo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  // ── Paleta Sunsu Brand ──
  const S = {
    NAVY_D:  "#3D5A7A",
    NAVY:    "#5B7FA6",
    NAVY_L:  "#EEF3FA",
    BLUE:    "#8FA8C8",
    BLUE_L:  "#F0F5FC",
    GOLD:    "#C4943A",
    GOLD_M:  "#E8C07A",
    GOLD_L:  "#FBF3E3",
    CREAM:   "#F5F0E8",
    CREAM_D: "#EDE6D8",
    GREEN:   "#7A9E8A",
    GREEN_M: "#A8C8B8",
    GREEN_L: "#EDF5F1",
    PEACH:   "#D4956A",
    PEACH_M: "#E8C0A0",
    PEACH_L: "#FDF3EC",
    GRAY:    "#8A90A0",
    GRAY_M:  "#C8CDD8",
    GRAY_L:  "#F4F4F0",
    WHITE:   "#FFFFFF",
    RED:     "#B87070",
    RED_L:   "#FDF0F0",
    TEXT:    "#3A3530",
  };

  // Background remap: old color → new Sunsu color
  const BG_MAP = {
    // Rosas / pinks → navy o gold
    "C2185B": S.NAVY_D,  "AD1457": S.NAVY_D,  "880E4F": S.NAVY_D,
    "D5A6BD": S.GOLD_M,  "FCE4EC": S.GOLD_L,  "F48FB1": S.GOLD_M,
    "F4C7C3": S.PEACH_L, "EA9999": S.PEACH_M, "E06666": S.PEACH,
    "FFF3F3": S.RED_L,
    // Azules → navy brand
    "1A237E": S.NAVY_D,  "283593": S.NAVY_D,  "0D47A1": S.NAVY_D,
    "1565C0": S.NAVY,    "1E88E5": S.NAVY,    "2D3B6B": S.NAVY_D,
    "4A6FA5": S.NAVY,    "5B7FA6": S.NAVY,
    "A4C2F4": S.BLUE_L,  "E3F2FD": S.BLUE_L,  "EEF3FA": S.NAVY_L,
    "F6F8F9": S.CREAM,   "F8F9FA": S.CREAM,
    // Verdes → sage
    "2E7D32": S.GREEN,   "388E3C": S.GREEN,   "6AA84F": S.GREEN,
    "57BB8A": S.GREEN,   "6A9E7A": S.GREEN,
    "93C47D": S.GREEN_M, "B6D7A8": S.GREEN_L, "B7E1CD": S.GREEN_L,
    "E8F5E9": S.GREEN_L, "EDF5EF": S.GREEN_L,
    // Morados → navy/blue
    "4A148C": S.NAVY_D,  "5B3F86": S.NAVY_D,  "6A1B9A": S.NAVY,
    "7B1FA2": S.NAVY,    "9B8EC4": S.BLUE,
    "B4A7D6": S.BLUE_L,  "D9D2E9": S.NAVY_L,  "EDE7F6": S.NAVY_L,
    "F3E5F5": S.NAVY_L,  "F3F0FA": S.NAVY_L,
    // Naranjas / ambar → dorado o melocotón
    "E65100": S.PEACH,   "F57C00": S.PEACH,   "F57F17": S.GOLD,
    "BF360C": S.PEACH,   "F6B26B": S.PEACH_M, "C4956A": S.PEACH,
    "D4956A": S.PEACH,   "C4A45A": S.GOLD,
    "FFF3E0": S.GOLD_L,  "FFF8E1": S.GOLD_L,  "FFF8F0": S.PEACH_L,
    "FFFDE7": S.GOLD_L,  "FFF2CC": S.GOLD_L,  "FFD966": S.GOLD_M,
    "FBF6EC": S.GOLD_L,  "FBF3E3": S.GOLD_L,
    // Amarillos → gold
    "FFFF00": S.GOLD_M,  "FFFF99": S.GOLD_L,
    // Grises → crema / gris Sunsu
    "CCCCCC": S.GRAY_M,  "616161": S.GRAY,    "757575": S.GRAY,
    "F5F5F5": S.CREAM,   "F4F5F8": S.GRAY_L,  "FAFAFA": S.CREAM,
    "F6F8F9": S.CREAM,
    // Rojos → suave
    "B71C1C": S.RED,     "C62828": S.RED,     "FFEBEE": S.RED_L,
    "B86B6B": S.RED,
  };

  // Font color remap
  const FG_MAP = {
    "C2185B": S.NAVY_D,  "880E4F": S.NAVY_D,  "AD1457": S.NAVY_D,
    "B10202": S.RED,     "B71C1C": S.RED,     "B86B6B": S.RED,
    "1A237E": S.NAVY_D,  "283593": S.NAVY_D,  "1565C0": S.NAVY,
    "0A53A8": S.NAVY,    "2D3B6B": S.NAVY_D,  "4A6FA5": S.NAVY,
    "2E7D32": S.GREEN,   "388E3C": S.GREEN,   "11734B": S.GREEN,
    "6A9E7A": S.GREEN,
    "E65100": S.PEACH,   "F57C00": S.PEACH,   "F57F17": S.GOLD,
    "753800": S.PEACH,   "473821": S.GOLD,    "C4943A": S.GOLD,
    "4A148C": S.NAVY_D,  "5A3286": S.NAVY_D,  "6A1B9A": S.NAVY,
    "7B1FA2": S.NAVY,    "9B8EC4": S.BLUE,
    "616161": S.GRAY,    "757575": S.GRAY,    "7A8499": S.GRAY,
    "313131": S.TEXT,    "3D3D3D": S.TEXT,    "434343": S.TEXT,
  };

  // Colores oscuros (texto blanco encima)
  const DARK_BG = new Set([S.NAVY_D, S.NAVY, S.GREEN, S.PEACH, S.RED, S.GOLD, S.BLUE]);

  // Tab colors por pestaña
  const TAB_MAP = {
    "TICKET":     S.NAVY_D,
    "CATALOGO":   S.BLUE,
    "PAQUETES":   S.GOLD,
    "GIFT":       S.PEACH,
    "AVANCE":     S.GREEN,
    "ENTRADAS":   S.NAVY,
    "INVENTARIO": S.BLUE,
    "MULTAS":     S.RED,
    "HISTORIAL":  S.NAVY_D,
    "REGISTRO":   S.GRAY,
    "RESUMEN":    S.GOLD,
    "CONFIG":     S.GRAY,
    "CITAS":      S.NAVY,
    "MI ":        S.GREEN,
  };

  const sheets = ss.getSheets();
  let totalChanged = 0;

  sheets.forEach(function(ws) {
    const name = ws.getName().toUpperCase();

    // Tab color
    Object.keys(TAB_MAP).forEach(function(key) {
      if (name.indexOf(key) >= 0) ws.setTabColor(TAB_MAP[key]);
    });

    // Get all data
    const lastRow = ws.getLastRow();
    const lastCol = ws.getLastColumn();
    if (lastRow < 1 || lastCol < 1) return;

    const range = ws.getRange(1, 1, lastRow, lastCol);
    const bgs   = range.getBackgrounds();
    const fgs   = range.getFontColors();
    const fonts = range.getFontFamilies();

    let bgChanged = false, fgChanged = false, fontChanged = false;

    for (let r = 0; r < lastRow; r++) {
      for (let c = 0; c < lastCol; c++) {

        // Background
        const oldBg = bgs[r][c].replace("#","").toUpperCase();
        if (BG_MAP[oldBg]) {
          bgs[r][c] = BG_MAP[oldBg];
          bgChanged = true;
          // Auto-fix font color for dark/light background
          if (DARK_BG.has(BG_MAP[oldBg])) {
            fgs[r][c] = S.WHITE;
            fgChanged = true;
          } else {
            // Light bg — map old color or default to dark text
            const oldFg = fgs[r][c].replace("#","").toUpperCase();
            fgs[r][c] = FG_MAP[oldFg] || S.TEXT;
            fgChanged = true;
          }
          totalChanged++;
        }

        // Font color (even if bg didn't change)
        const oldFg2 = fgs[r][c].replace("#","").toUpperCase();
        if (FG_MAP[oldFg2]) {
          fgs[r][c] = FG_MAP[oldFg2];
          fgChanged = true;
        }

        // Font family → Arial
        if (fonts[r][c] && fonts[r][c] !== "Arial" && fonts[r][c] !== "") {
          fonts[r][c] = "Arial";
          fontChanged = true;
        }
      }
    }

    if (bgChanged)   range.setBackgrounds(bgs);
    if (fgChanged)   range.setFontColors(fgs);
    if (fontChanged) range.setFontFamilies(fonts);

    ss.toast("✅ " + ws.getName() + " actualizada", "SUNSU Recolor", 2);
  });

  ss.toast("🎨 Paleta Sunsu aplicada a todo el documento — " + totalChanged + " celdas actualizadas.", "SUNSU", 8);
  ui.alert("✅ Listo\n\nPaleta Sunsu aplicada a " + sheets.length + " pestañas.\n" + totalChanged + " celdas actualizadas.\n\nFuente: Arial en todo el documento.");
}

// ============================================================
// CAJA CHICA — SUNSU SPA
// ============================================================
// LAYOUT DE LA PESTAÑA 💵 CAJA CHICA:
//
//  Fila 1     : Título
//  Fila 2-3   : KPIs (Saldo inicial | Ingresos hoy | Gastos | Depósitos | SALDO ACTUAL)
//  Fila 4     : ── REGISTRAR GASTO ── (sección de inputs)
//  Fila 5     : [Descripción] [Monto] [Quién] [Justificación] → col I = "REGISTRAR"
//  Fila 6     : ── REGISTRAR DEPÓSITO ── (sección de inputs)
//  Fila 7     : [Monto] [Quién entrega] [Quién recibe] [Banco/ref] → col I = "REGISTRAR"
//  Fila 8     : ── MOVIMIENTOS DEL DÍA ── + headers
//  Fila 9+    : Datos auto (desde TICKET_FICHA) + gastos + depósitos
//
// COLUMNAS DE DATOS (fila 9+):
//  A: Fecha/hora  B: Tipo  C: Descripción  D: Quién
//  E: Monto(+/-)  F: Efect.Recibido  G: SALDO  H: Notas  I: Estado
//
// SINCRONIZACIÓN AUTOMÁTICA: trigger cada hora (sincronizarEfectivo)
// CUADRE DIARIO: trigger a las 22:00 (cuadreDiarioCaja)
// ============================================================

// ══ CAJA CHICA V2: libro limpio, sin cierres diarios. Una fila = un movimiento. ══
// Columnas: FECHA/HORA | TIPO | DETALLE/JUSTIFICATIVO | QUIEN | ENTRADA | SALIDA | SALDO | REF | REGISTRADO POR
// El saldo es acumulado fila a fila; el actual es el de la ultima fila. La V1 queda
// intacta como historico: esta arranca de cero con su propio saldo inicial.
// ══ SUNSU CABINA: archivo APARTE (protocolos, inventario de uso interno, activos) ══
// El ID vive en Script Properties (CABINA_SS_ID) y lo escribe cabinaCrearEstructura.
// Semilla migrada del Excel original SUNSU_INVENTARIO.xlsx (base 2024-2025):
// 64 productos de cabina (codigos INV-### conservando su numero original de
// SUNSU-INV-000###), la Focuskin como activo, y los 6 protocolos historicos
// (SUNSU-01 a 06) con sus pasos, cantidades y costos reales.
var CABINA_SEED = {"productos":[{"codigo":"INV-002","producto":"BIODANCE Bio-Collagen Real Deep Mask","proveedor":"AMAZON","contenido":1.0,"unidad":"Unidad","costoEnvase":4.8605,"notas":"Marca: BIODANCE \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-003","producto":"SKINFOOD Rice Mask Wash Off","proveedor":"AMAZON","contenido":120.0,"unidad":"g","costoEnvase":13.75,"notas":"Marca: SKINFOOD \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-004","producto":"Medicube Collagen Jelly Cream","proveedor":"AMAZON","contenido":110.0,"unidad":"ml","costoEnvase":46.8338,"notas":"Marca: MEDICUBE \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-005","producto":"I'm from Rice Serum","proveedor":"AMAZON","contenido":30.0,"unidad":"ml","costoEnvase":34.7885,"notas":"Marca: I'M FROM \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-006","producto":"SKINFOOD Carrot Carotene Daily Sheet Mask","proveedor":"AMAZON","contenido":30.0,"unidad":"Unidad","costoEnvase":34.875,"notas":"Marca: SKINFOOD \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-007","producto":"Baebody Advanced Snail Mucin Under Eye Patches","proveedor":"AMAZON","contenido":6.0,"unidad":"Par","costoEnvase":17.375,"notas":"Marca: BEABODY \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-008","producto":"VT COSMETICS PDRN 100 Essence, Intensive Glow Serum","proveedor":"AMAZON","contenido":30.0,"unidad":"ml","costoEnvase":30.7956,"notas":"Marca: VT COSMETICS \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-009","producto":"Medicube Zero Pore Pads 2.0","proveedor":"AMAZON","contenido":70.0,"unidad":"Unidad","costoEnvase":38.75,"notas":"Marca: MEDICUBE \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-010","producto":"Medicube Deep Vitamin C Golden Capsule Face Moisturizer","proveedor":"AMAZON","contenido":55.0,"unidad":"g","costoEnvase":30.6706,"notas":"Marca: MEDICUBE \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-011","producto":"COSRX Snail Mucin 96% Power Repairing Essence","proveedor":"AMAZON","contenido":100.0,"unidad":"ml","costoEnvase":31.5104,"notas":"Marca: COSRX \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-012","producto":"Medicube Zero Exosome Shot 2,000 PPM Spicule Facial Serum","proveedor":"AMAZON","contenido":30.0,"unidad":"ml","costoEnvase":49.2035,"notas":"Marca: MEDICUBE \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-013","producto":"Medicube Collagen Overnight Wrapping Peel Off Facial Mask Pack","proveedor":"AMAZON","contenido":75.0,"unidad":"ml","costoEnvase":23.625,"notas":"Marca: MEDICUBE \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-014","producto":"I'm from Rice Toner","proveedor":"AMAZON","contenido":150.0,"unidad":"ml","costoEnvase":27.7972,"notas":"Marca: I'M FROM \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-015","producto":"Bio-Oil Skincare Body Oil Serum","proveedor":"AMAZON","contenido":200.0,"unidad":"ml","costoEnvase":40.8,"notas":"Marca: BIO-OIL \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-016","producto":"Rosiong Red Light Therapy Hair Growth Device Comb","proveedor":"AMAZON","contenido":1.0,"unidad":"Unidad","costoEnvase":42.4875,"notas":"Marca: ROSIONG \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-017","producto":"BAIMEI Stainless Steel Gua Sha","proveedor":"AMAZON","contenido":1.0,"unidad":"Unidad","costoEnvase":12.4875,"notas":"Marca: BAIMEI \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-018","producto":"Ice Globes","proveedor":"AMAZON","contenido":1.0,"unidad":"Par","costoEnvase":12.4875,"notas":"Marca: SMASENER \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-019","producto":"Derma Roller | Microneedle Roller","proveedor":"AMAZON","contenido":1.0,"unidad":"Unidad","costoEnvase":12.4875,"notas":"Marca: LEXI WHITE \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-020","producto":"Geiserailie 2 Pieces Jade Combs","proveedor":"AMAZON","contenido":1.0,"unidad":"Par","costoEnvase":11.975,"notas":"Marca: GEISERAILIE \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-021","producto":"NEEDS NATURE Derma Tech Ceramide Modeling Pack","proveedor":"AMAZON","contenido":400.0,"unidad":"g","costoEnvase":27.375,"notas":"Marca: NEEDS NATURE \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-022","producto":"NEEDS NATURE Derma Tech Niacinamide Modeling Pack","proveedor":"AMAZON","contenido":400.0,"unidad":"g","costoEnvase":27.375,"notas":"Marca: NEEDS NATURE \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-023","producto":"Pimple Patches for Face","proveedor":"AMAZON","contenido":255.0,"unidad":"Unidad","costoEnvase":12.4875,"notas":"Marca: DR. ZITACNE \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-024","producto":"Medicube Deep Vita C Serum 2.0","proveedor":"AMAZON","contenido":30.0,"unidad":"g","costoEnvase":30.0414,"notas":"Marca: MEDICUBE \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-025","producto":"SKIN1004 Madagascar Centella Probio-Cica Intensive Ampoule","proveedor":"AMAZON","contenido":50.0,"unidad":"ml","costoEnvase":18.6125,"notas":"Marca: SKIN1004 \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-026","producto":"SKIN1004 Madagascar Centella Asiatica Ampoule Facial Serum","proveedor":"AMAZON","contenido":55.0,"unidad":"ml","costoEnvase":34.0,"notas":"Marca: SKIN1004 \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-027","producto":"VT COSMETICS CICA Reedle Shot 100","proveedor":"AMAZON","contenido":50.0,"unidad":"ml","costoEnvase":41.1053,"notas":"Marca: VT COSMETICS \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-028","producto":"Daleaf Chlorella Better Root Hair Tonic","proveedor":"DALEAF","contenido":100.0,"unidad":"ml","costoEnvase":30.0,"notas":"Marca: DALEAF \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-029","producto":"Beauty of Joseon Revive Eye Serum","proveedor":"AMAZON","contenido":30.0,"unidad":"ml","costoEnvase":20.125,"notas":"Marca: BEAUTY OF JOSEON \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-030","producto":"COSRX Snail Mucin 92% Face Moisturizer","proveedor":"AMAZON","contenido":100.0,"unidad":"g","costoEnvase":36.3175,"notas":"Marca: COSRX \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-031","producto":"SKIN1004 Madagascar Centella Hyalu-CICA Water-fit Sun Serum","proveedor":"AMAZON","contenido":50.0,"unidad":"ml","costoEnvase":14.5,"notas":"Marca: SKIN1004 \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-032","producto":"Dr.Jart+ Cicapair Intensive Soothing Repair Gel Cream","proveedor":"AMAZON","contenido":50.0,"unidad":"ml","costoEnvase":102.0,"notas":"Marca: DR.JART+ CICAPAIR \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-033","producto":"Dr.Jart+ Cicapair Intensive Soothing Repair Serum","proveedor":"AMAZON","contenido":30.0,"unidad":"ml","costoEnvase":-3.8571,"notas":"Marca: DR.JART+ CICAPAIR \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-034","producto":"Beauty of Joseon Glow Serum Propolis and Niacinamide","proveedor":"AMAZON","contenido":30.0,"unidad":"ml","costoEnvase":20.725,"notas":"Marca: BEAUTY OF JOSEON \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-035","producto":"SKIN1004 Madagascar Centella Light Cleansing Oil","proveedor":"AMAZON","contenido":200.0,"unidad":"ml","costoEnvase":41.7391,"notas":"Marca: SKIN1004 \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-036","producto":"ANUA Heartleaf Quercetinol Pore Deep Cleansing Foam","proveedor":"AMAZON","contenido":150.0,"unidad":"ml","costoEnvase":16.275,"notas":"Marca: ANUA \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-037","producto":"Anua Heartleaf 77 Soothing Toner","proveedor":"AMAZON","contenido":250.0,"unidad":"ml","costoEnvase":27.8201,"notas":"Marca: ANUA \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-038","producto":"Jojoba Lip Essence","proveedor":"AMAZON","contenido":13.0,"unidad":"ml","costoEnvase":19.6725,"notas":"Marca: SIDMOOL \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-039","producto":"FATION\u00a0-\u00a0Nosca9 Cleansing Water","proveedor":"FATION","contenido":500.0,"unidad":"ml","costoEnvase":35.8875,"notas":"Marca: FATION \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-040","producto":"d'alba Piedmont Italian White Truffle First Spray Serum","proveedor":"AMAZON","contenido":100.0,"unidad":"ml","costoEnvase":30.8966,"notas":"Marca: D'ALBA \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-041","producto":"VT COSMETICS CICA Reedle Shot 300","proveedor":"AMAZON","contenido":50.0,"unidad":"ml","costoEnvase":31.25,"notas":"Marca: VT COSMETICS \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-042","producto":"Medicube Age-R Booster Pro","proveedor":"AMAZON","contenido":1.0,"unidad":"Unidad","costoEnvase":285.0,"notas":"Marca: MEDICUBE \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-043","producto":"Azulene Skin Toner 1000ml","proveedor":"GLAMFABRIK CIA LTDA","contenido":1000.0,"unidad":"ml","costoEnvase":53.57,"notas":"Marca: DR CPU \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-044","producto":"Bubble O2 Cleansing Mask","proveedor":"GLAMFABRIK CIA LTDA","contenido":300.0,"unidad":"ml","costoEnvase":41.4,"notas":"Marca: DR CPU \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-045","producto":"Mediclear Makeup Remover","proveedor":"GLAMFABRIK CIA LTDA","contenido":300.0,"unidad":"ml","costoEnvase":25.57,"notas":"Marca: DR CPU \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-046","producto":"Modeling Powder Aqua-Max","proveedor":"GLAMFABRIK CIA LTDA","contenido":1000.0,"unidad":"g","costoEnvase":39.13,"notas":"Marca: DR CPU \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-047","producto":"Modeling Powder Charcoal","proveedor":"GLAMFABRIK CIA LTDA","contenido":1000.0,"unidad":"g","costoEnvase":39.13,"notas":"Marca: DR CPU \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-048","producto":"Modeling Powder Collagen","proveedor":"GLAMFABRIK CIA LTDA","contenido":1000.0,"unidad":"g","costoEnvase":39.13,"notas":"Marca: DR CPU \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-049","producto":"Modeling Powder Vita-C","proveedor":"GLAMFABRIK CIA LTDA","contenido":1000.0,"unidad":"g","costoEnvase":39.13,"notas":"Marca: DR CPU \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-050","producto":"Special Ampoule Bright","proveedor":"GLAMFABRIK CIA LTDA","contenido":100.0,"unidad":"Unidad","costoEnvase":77.9,"notas":"Marca: DR CPU \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-051","producto":"Special Ampoule Elastic","proveedor":"GLAMFABRIK CIA LTDA","contenido":100.0,"unidad":"Unidad","costoEnvase":77.9,"notas":"Marca: DR CPU \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-052","producto":"Special Ampoule Moist","proveedor":"GLAMFABRIK CIA LTDA","contenido":100.0,"unidad":"Unidad","costoEnvase":77.9,"notas":"Marca: DR CPU \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-053","producto":"Special Ampoule Purifying","proveedor":"GLAMFABRIK CIA LTDA","contenido":100.0,"unidad":"Unidad","costoEnvase":77.9,"notas":"Marca: DR CPU \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-054","producto":"PEELING ENZIMATICO PAPAYA Y PINA","proveedor":"BRUNO VASSARI ECUADOR CIA. LTDA","contenido":500.0,"unidad":"g","costoEnvase":42.6087,"notas":"Marca: AROMS NATUR \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-055","producto":"PROBIOTIC SKIN BALANCING MASK","proveedor":"BRUNO VASSARI ECUADOR CIA. LTDA","contenido":100.0,"unidad":"g","costoEnvase":42.6087,"notas":"Marca: AROMS NATUR \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-056","producto":"A.VEG. PEPITA DE UVA","proveedor":"BRUNO VASSARI ECUADOR CIA. LTDA","contenido":1000.0,"unidad":"ml","costoEnvase":29.4643,"notas":"Marca: AROMS NATUR \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-057","producto":"POLVO DE ARROZ","proveedor":"BRUNO VASSARI ECUADOR CIA. LTDA","contenido":400.0,"unidad":"g","costoEnvase":30.3571,"notas":"Marca: AROMS NATUR \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-058","producto":"ESSENCEBALM","proveedor":"BRUNO VASSARI ECUADOR CIA. LTDA","contenido":200.0,"unidad":"g","costoEnvase":47.8261,"notas":"Marca: AROMS NATUR \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-059","producto":"Discos Desmaquilladores de Algodon Sort duo","proveedor":"FYBECA","contenido":100.0,"unidad":"Unidad","costoEnvase":4.56,"notas":"Marca: TIPPY'S \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-060","producto":"Cotoneetes Tippy's Frasco","proveedor":"FYBECA","contenido":200.0,"unidad":"Unidad","costoEnvase":2.9,"notas":"Marca: TIPPY'S \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-061","producto":"Winner Soft Face Towels","proveedor":"AMAZON","contenido":600.0,"unidad":"Unidad","costoEnvase":8.4871,"notas":"Marca: WINNER \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-062","producto":"NOSCA9 Trouble Serum S","proveedor":"AMAZON","contenido":30.0,"unidad":"ml","costoEnvase":272.8075,"notas":"Marca: FATION \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-063","producto":"d'alba Piedmont Italian White Truffle Waterfull Essence Sunscreen","proveedor":"AMAZON","contenido":50.0,"unidad":"ml","costoEnvase":22.75,"notas":"Marca: D'ALBA \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-064","producto":"Youthheal Exoprime Mask","proveedor":"GLAMFABRIK CIA LTDA","contenido":1.0,"unidad":"Unidad","costoEnvase":21.67,"notas":"Marca: Youtheal \u00b7 stock por contar (migrado del Excel)"},{"codigo":"INV-065","producto":"HA50X Pro-Hyaluronic Mask Mascarilla con Acido Hialuronico","proveedor":"Bruno Vassari","contenido":1,"unidad":"ml","costoEnvase":0,"notas":"Marca: Bruno Vassari \u00b7 stock por contar (migrado del Excel)"}],"activos":[{"codigo":"AC-001","activo":"PIE Focuskin - Skin Analysis System","categoria":"Equipos","cantidad":"1","ubicacion":"","estado":"Buen estado","costo":"5769.73","notas":"Migrado del Excel"}],"protocolos":{"SUNSU-01":[{"desc":"**Limpieza para usar maquina**","productoCod":"INV-037","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"Discos Desmaquilladores de Algodon Sort duo","productoCod":"INV-059","cantidad":2.0,"unidad":"Unidad","minutos":0.0},{"desc":"Analisis facial con explicaccion de piel (con Focuskin Skin Analyzer)","productoCod":"","cantidad":0,"unidad":"","minutos":30.0},{"desc":"** Aplicar solo de ser necesario**","productoCod":"INV-045","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"Discos Desmaquilladores de Algodon Sort duo","productoCod":"INV-059","cantidad":2.0,"unidad":"Unidad","minutos":0.0},{"desc":"SKIN1004 Madagascar Centella Light Cleansing Oil","productoCod":"INV-035","cantidad":2.0,"unidad":"ml","minutos":2.0},{"desc":"Winner Soft Face Towels","productoCod":"INV-061","cantidad":1.0,"unidad":"Unidad","minutos":0.0},{"desc":"Bubble O2 Cleansing Mask","productoCod":"INV-044","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"toalla(irrita) \u2014 **Toalla caliente para abrir los poros y suavisar la piel**","productoCod":"","cantidad":0,"unidad":"","minutos":2.0},{"desc":"**Se mezcla polvo de arroz con pepita de uva, y se exfolia**","productoCod":"INV-057","cantidad":2.0,"unidad":"g","minutos":0.0},{"desc":"A.VEG. PEPITA DE UVA","productoCod":"INV-056","cantidad":1.0,"unidad":"ml","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-054","cantidad":2.0,"unidad":"g","minutos":10.0},{"desc":"EXTRACCI\u00d3N DE GRANOS","productoCod":"","cantidad":0,"unidad":"","minutos":4.0},{"desc":"APLICAR ALTA FREQUENCIA","productoCod":"","cantidad":0,"unidad":"","minutos":2.0},{"desc":"MASAJE DRENANTE CON PEPITA DE UVA \u2014 **Movimientos lentos sin fricci\u00f3n ni calor**","productoCod":"","cantidad":0,"unidad":"","minutos":10.0},{"desc":"A.VEG. PEPITA DE UVA","productoCod":"INV-056","cantidad":0,"unidad":"","minutos":0.0},{"desc":"Azulene Skin Toner 1000ml","productoCod":"INV-043","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"** no aplicar si se contrata mascarilla hidroplastica**","productoCod":"INV-055","cantidad":2.0,"unidad":"g","minutos":30.0},{"desc":"DURANTE MASCARILLA MASAJE CAPILAR/alta frecuencia O EN MANOS \u2014 **se puede aplicar piedra caliente en corazon**","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-047","cantidad":50.0,"unidad":"g","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-053","cantidad":1.0,"unidad":"Unidad","minutos":2.0},{"desc":"Dr.Jart+ Cicapair Intensive Soothing Repair Serum","productoCod":"INV-033","cantidad":2.0,"unidad":"ml","minutos":2.0},{"desc":"Dr.Jart+ Cicapair Intensive Soothing Repair Gel Cream","productoCod":"INV-032","cantidad":2.0,"unidad":"ml","minutos":2.0},{"desc":"NO HAY BOOSTER (IRRITANTE)","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"Beauty of Joseon Revive Eye Serum","productoCod":"INV-029","cantidad":1.0,"unidad":"ml","minutos":2.0},{"desc":"Jojoba Lip Essence","productoCod":"INV-038","cantidad":0.25,"unidad":"ml","minutos":1.0},{"desc":"Cotoneetes Tippy's Frasco","productoCod":"INV-060","cantidad":1.0,"unidad":"Unidad","minutos":0.0},{"desc":"SKIN1004 Madagascar Centella Hyalu-CICA Water-fit Sun Serum","productoCod":"INV-031","cantidad":2.0,"unidad":"ml","minutos":1.0}],"SUNSU-02":[{"desc":"**Limpieza para usar maquina**","productoCod":"INV-037","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"Discos Desmaquilladores de Algodon Sort duo","productoCod":"INV-059","cantidad":2.0,"unidad":"Unidad","minutos":0.0},{"desc":"Analisis facial con explicaccion de piel (con Focuskin Skin Analyzer)","productoCod":"","cantidad":0,"unidad":"","minutos":30.0},{"desc":"** Aplicar solo de ser necesario**","productoCod":"INV-045","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"Discos Desmaquilladores de Algodon Sort duo","productoCod":"INV-059","cantidad":2.0,"unidad":"Unidad","minutos":0.0},{"desc":"SKIN1004 Madagascar Centella Light Cleansing Oil","productoCod":"INV-035","cantidad":2.0,"unidad":"ml","minutos":2.0},{"desc":"Winner Soft Face Towels","productoCod":"INV-061","cantidad":1.0,"unidad":"Unidad","minutos":0.0},{"desc":"Bubble O2 Cleansing Mask","productoCod":"INV-044","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"APLICAR TOALLA CALLENTE ANTES DE EXFOLIANTE \u2014 **Toalla caliente para abrir los poros y suavisar la piel**","productoCod":"","cantidad":0,"unidad":"","minutos":2.0},{"desc":"**Se mezcla polvo de arroz con pepita de uva, y se exfolia**","productoCod":"INV-057","cantidad":2.0,"unidad":"g","minutos":0.0},{"desc":"A.VEG. PEPITA DE UVA","productoCod":"INV-056","cantidad":1.0,"unidad":"ml","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-054","cantidad":2.0,"unidad":"g","minutos":10.0},{"desc":"EXTRACCI\u00d3N DE GRANOS","productoCod":"","cantidad":0,"unidad":"","minutos":4.0},{"desc":"APLICAR ALTA FREQUENCIA","productoCod":"","cantidad":0,"unidad":"","minutos":2.0},{"desc":"NO APLICA MASAJE DRENANTE POR QUE HAY BOOSTER \u2014 **Movimientos lentos sin fricci\u00f3n ni calor**","productoCod":"","cantidad":0,"unidad":"","minutos":10.0},{"desc":"Azulene Skin Toner 1000ml","productoCod":"INV-043","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"PROBIOTIC SKIN BALANCING MASK","productoCod":"INV-055","cantidad":2.0,"unidad":"g","minutos":30.0},{"desc":"DURANTE MASCARILLA MASAJE CAPILAR O EN MANOS \u2014 **se puede aplicar piedra caliente en corazon**","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-047","cantidad":50.0,"unidad":"g","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-053","cantidad":1.0,"unidad":"Unidad","minutos":2.0},{"desc":"NOSCA9 Trouble Serum S","productoCod":"INV-062","cantidad":2.0,"unidad":"ml","minutos":2.0},{"desc":"**aplicar con booster**","productoCod":"INV-004","cantidad":2.0,"unidad":"ml","minutos":6.0},{"desc":"Beauty of Joseon Revive Eye Serum","productoCod":"INV-029","cantidad":1.0,"unidad":"ml","minutos":2.0},{"desc":"INSERTAR PRODUCTO CON BOOSTER","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"Jojoba Lip Essence","productoCod":"INV-038","cantidad":0.25,"unidad":"ml","minutos":1.0},{"desc":"Cotoneetes Tippy's Frasco","productoCod":"INV-060","cantidad":1.0,"unidad":"Unidad","minutos":0.0},{"desc":"SKIN1004 Madagascar Centella Hyalu-CICA Water-fit Sun Serum","productoCod":"INV-031","cantidad":2.0,"unidad":"ml","minutos":1.0}],"SUNSU-03":[{"desc":"**Limpieza para usar maquina**","productoCod":"INV-037","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"Discos Desmaquilladores de Algodon Sort duo","productoCod":"INV-059","cantidad":2.0,"unidad":"Unidad","minutos":0.0},{"desc":"Analisis facial con explicaccion de piel (con Focuskin Skin Analyzer)","productoCod":"","cantidad":0,"unidad":"","minutos":30.0},{"desc":"** Aplicar solo de ser necesario**","productoCod":"INV-045","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"Discos Desmaquilladores de Algodon Sort duo","productoCod":"INV-059","cantidad":2.0,"unidad":"Unidad","minutos":0.0},{"desc":"SKIN1004 Madagascar Centella Light Cleansing Oil","productoCod":"INV-035","cantidad":2.0,"unidad":"ml","minutos":2.0},{"desc":"Winner Soft Face Towels","productoCod":"INV-061","cantidad":1.0,"unidad":"Unidad","minutos":0.0},{"desc":"Bubble O2 Cleansing Mask","productoCod":"INV-044","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"APLICAR TOALLA CALLENTE ANTES DE EXFOLIANTE \u2014 **Toalla caliente para abrir los poros y suavisar la piel**","productoCod":"","cantidad":0,"unidad":"","minutos":2.0},{"desc":"**Se mezcla polvo de arroz con pepita de uva, y se exfolia**","productoCod":"INV-057","cantidad":2.0,"unidad":"g","minutos":0.0},{"desc":"A.VEG. PEPITA DE UVA","productoCod":"INV-056","cantidad":1.0,"unidad":"ml","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-054","cantidad":2.0,"unidad":"g","minutos":10.0},{"desc":"EXTRACCI\u00d3N DE GRANOS","productoCod":"","cantidad":0,"unidad":"","minutos":4.0},{"desc":"APLICAR ALTA FREQUENCIA","productoCod":"","cantidad":0,"unidad":"","minutos":2.0},{"desc":"NO APLICA MASAJE DRENANTE POR QUE HAY BOOSTER","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"Azulene Skin Toner 1000ml","productoCod":"INV-043","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"PROBIOTIC SKIN BALANCING MASK","productoCod":"INV-055","cantidad":2.0,"unidad":"g","minutos":30.0},{"desc":"DURANTE MASCARILLA MASAJE CAPILAR O EN MANOS \u2014 **se puede aplicar piedra caliente en corazon**","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-046","cantidad":50.0,"unidad":"g","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-052","cantidad":1.0,"unidad":"Unidad","minutos":2.0},{"desc":"d'alba Piedmont Italian White Truffle First Spray Serum","productoCod":"INV-040","cantidad":2.0,"unidad":"ml","minutos":2.0},{"desc":"**aplicar con booster**","productoCod":"INV-004","cantidad":2.0,"unidad":"ml","minutos":6.0},{"desc":"INSERTAR PRODUCTO CON BOOSTER","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"Beauty of Joseon Revive Eye Serum","productoCod":"INV-029","cantidad":1.0,"unidad":"ml","minutos":2.0},{"desc":"Jojoba Lip Essence","productoCod":"INV-038","cantidad":0.25,"unidad":"ml","minutos":1.0},{"desc":"Cotoneetes Tippy's Frasco","productoCod":"INV-060","cantidad":1.0,"unidad":"Unidad","minutos":0.0},{"desc":"SKIN1004 Madagascar Centella Hyalu-CICA Water-fit Sun Serum","productoCod":"INV-031","cantidad":2.0,"unidad":"ml","minutos":1.0}],"SUNSU-04":[{"desc":"**Limpieza para usar maquina**","productoCod":"INV-037","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"Discos Desmaquilladores de Algodon Sort duo","productoCod":"INV-059","cantidad":2.0,"unidad":"Unidad","minutos":0.0},{"desc":"Analisis facial con explicaccion de piel (con Focuskin Skin Analyzer)","productoCod":"","cantidad":0,"unidad":"","minutos":30.0},{"desc":"** Aplicar solo de ser necesario**","productoCod":"INV-045","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"Discos Desmaquilladores de Algodon Sort duo","productoCod":"INV-059","cantidad":2.0,"unidad":"Unidad","minutos":0.0},{"desc":"SKIN1004 Madagascar Centella Light Cleansing Oil","productoCod":"INV-035","cantidad":2.0,"unidad":"ml","minutos":2.0},{"desc":"Winner Soft Face Towels","productoCod":"INV-061","cantidad":1.0,"unidad":"Unidad","minutos":0.0},{"desc":"Bubble O2 Cleansing Mask","productoCod":"INV-044","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"NO APLICA TOALLA CALLENTE ANTES DE EXFOLIANTE \u2014 **Toalla caliente para abrir los poros y suavisar la piel**","productoCod":"","cantidad":0,"unidad":"","minutos":2.0},{"desc":"**Se mezcla polvo de arroz con pepita de uva, y se exfolia**","productoCod":"INV-057","cantidad":2.0,"unidad":"g","minutos":0.0},{"desc":"A.VEG. PEPITA DE UVA","productoCod":"INV-056","cantidad":1.0,"unidad":"ml","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-054","cantidad":2.0,"unidad":"g","minutos":10.0},{"desc":"EXTRACCI\u00d3N DE GRANOS","productoCod":"","cantidad":0,"unidad":"","minutos":4.0},{"desc":"APLICAR ALTA FREQUENCIA","productoCod":"","cantidad":0,"unidad":"","minutos":2.0},{"desc":"NO APLICA MASAJE DRENANTE POR QUE HAY BOOSTER \u2014 **Movimientos lentos sin fricci\u00f3n ni calor**","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"Azulene Skin Toner 1000ml","productoCod":"INV-043","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"PROBIOTIC SKIN BALANCING MASK","productoCod":"INV-055","cantidad":2.0,"unidad":"g","minutos":30.0},{"desc":"DURANTE MASCARILLA MASAJE CAPILAR O EN MANOS \u2014 **se puede aplicar piedra caliente en corazon**","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-048","cantidad":50.0,"unidad":"g","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-051","cantidad":1.0,"unidad":"Unidad","minutos":2.0},{"desc":"Medicube Zero Exosome Shot 2,000 PPM Spicule Facial Serum","productoCod":"INV-012","cantidad":2.0,"unidad":"ml","minutos":2.0},{"desc":"**aplicar con booster**","productoCod":"INV-004","cantidad":2.0,"unidad":"ml","minutos":6.0},{"desc":"INSERTAR PRODUCTO CON BOOSTER","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"Beauty of Joseon Revive Eye Serum","productoCod":"INV-029","cantidad":1.0,"unidad":"ml","minutos":2.0},{"desc":"Jojoba Lip Essence","productoCod":"INV-038","cantidad":0.25,"unidad":"ml","minutos":1.0},{"desc":"Cotoneetes Tippy's Frasco","productoCod":"INV-060","cantidad":1.0,"unidad":"Unidad","minutos":0.0},{"desc":"SKIN1004 Madagascar Centella Hyalu-CICA Water-fit Sun Serum","productoCod":"INV-031","cantidad":2.0,"unidad":"ml","minutos":1.0}],"SUNSU-05":[{"desc":"**Limpieza para usar maquina**","productoCod":"INV-037","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"Discos Desmaquilladores de Algodon Sort duo","productoCod":"INV-059","cantidad":2.0,"unidad":"Unidad","minutos":0.0},{"desc":"Analisis facial con explicaccion de piel (con Focuskin Skin Analyzer)","productoCod":"","cantidad":0,"unidad":"","minutos":30.0},{"desc":"** Aplicar solo de ser necesario**","productoCod":"INV-045","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"Discos Desmaquilladores de Algodon Sort duo","productoCod":"INV-059","cantidad":2.0,"unidad":"Unidad","minutos":0.0},{"desc":"SKIN1004 Madagascar Centella Light Cleansing Oil","productoCod":"INV-035","cantidad":2.0,"unidad":"ml","minutos":2.0},{"desc":"Winner Soft Face Towels","productoCod":"INV-061","cantidad":1.0,"unidad":"Unidad","minutos":0.0},{"desc":"Bubble O2 Cleansing Mask","productoCod":"INV-044","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"APLICAR TOALLA CALLENTE ANTES DE EXFOLIANTE \u2014 **Toalla caliente para abrir los poros y suavisar la piel**","productoCod":"","cantidad":0,"unidad":"","minutos":2.0},{"desc":"**Se mezcla polvo de arroz con pepita de uva, y se exfolia**","productoCod":"INV-057","cantidad":2.0,"unidad":"g","minutos":0.0},{"desc":"A.VEG. PEPITA DE UVA","productoCod":"INV-056","cantidad":1.0,"unidad":"ml","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-054","cantidad":2.0,"unidad":"g","minutos":10.0},{"desc":"EXTRACCI\u00d3N DE GRANOS","productoCod":"","cantidad":0,"unidad":"","minutos":4.0},{"desc":"APLICAR ALTA FREQUENCIA","productoCod":"","cantidad":0,"unidad":"","minutos":2.0},{"desc":"NO APLICA MASAJE DRENANTE POR QUE HAY BOOSTER \u2014 **Movimientos lentos sin fricci\u00f3n ni calor**","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"Azulene Skin Toner 1000ml","productoCod":"INV-043","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"PROBIOTIC SKIN BALANCING MASK","productoCod":"INV-055","cantidad":2.0,"unidad":"g","minutos":30.0},{"desc":"DURANTE MASCARILLA MASAJE CAPILAR O EN MANOS \u2014 **se puede aplicar piedra caliente en corazon**","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-049","cantidad":50.0,"unidad":"g","minutos":0.0},{"desc":"Medicube Deep Vita C Serum 2.0","productoCod":"INV-024","cantidad":2.0,"unidad":"g","minutos":2.0},{"desc":"**aplicar con booster**","productoCod":"INV-010","cantidad":2.0,"unidad":"g","minutos":6.0},{"desc":"INSERTAR PRODUCTO CON BOOSTER","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"Beauty of Joseon Revive Eye Serum","productoCod":"INV-029","cantidad":1.0,"unidad":"ml","minutos":2.0},{"desc":"Jojoba Lip Essence","productoCod":"INV-038","cantidad":0.25,"unidad":"ml","minutos":1.0},{"desc":"Cotoneetes Tippy's Frasco","productoCod":"INV-060","cantidad":1.0,"unidad":"Unidad","minutos":0.0},{"desc":"SKIN1004 Madagascar Centella Hyalu-CICA Water-fit Sun Serum","productoCod":"INV-031","cantidad":2.0,"unidad":"ml","minutos":1.0}],"SUNSU-06":[{"desc":"**Limpieza para usar maquina**","productoCod":"INV-037","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"Discos Desmaquilladores de Algodon Sort duo","productoCod":"INV-059","cantidad":2.0,"unidad":"Unidad","minutos":0.0},{"desc":"Analisis facial con explicaccion de piel (con Focuskin Skin Analyzer)","productoCod":"","cantidad":0,"unidad":"","minutos":30.0},{"desc":"** Aplicar solo de ser necesario**","productoCod":"INV-045","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"Discos Desmaquilladores de Algodon Sort duo","productoCod":"INV-059","cantidad":2.0,"unidad":"Unidad","minutos":0.0},{"desc":"SKIN1004 Madagascar Centella Light Cleansing Oil","productoCod":"INV-035","cantidad":2.0,"unidad":"ml","minutos":2.0},{"desc":"Winner Soft Face Towels","productoCod":"INV-061","cantidad":1.0,"unidad":"Unidad","minutos":0.0},{"desc":"Bubble O2 Cleansing Mask","productoCod":"INV-044","cantidad":3.0,"unidad":"ml","minutos":2.0},{"desc":"APLICAR TOALLA CALLENTE ANTES DE EXFOLIANTE \u2014 **Toalla caliente para abrir los poros y suavisar la piel**","productoCod":"","cantidad":0,"unidad":"","minutos":2.0},{"desc":"**Se mezcla polvo de arroz con pepita de uva, y se exfolia**","productoCod":"INV-057","cantidad":2.0,"unidad":"g","minutos":0.0},{"desc":"A.VEG. PEPITA DE UVA","productoCod":"INV-056","cantidad":1.0,"unidad":"ml","minutos":0.0},{"desc":"** Solo si es contratado EXTRA** NO EN EMBARAZO","productoCod":"INV-054","cantidad":2.0,"unidad":"g","minutos":10.0},{"desc":"EXTRACCI\u00d3N DE GRANOS","productoCod":"","cantidad":0,"unidad":"","minutos":4.0},{"desc":"APLICAR ALTA FREQUENCIA","productoCod":"","cantidad":0,"unidad":"","minutos":2.0},{"desc":"MASAJE DRENANTE CON PEPITA DE UVA \u2014 **Movimientos lentos sin fricci\u00f3n ni calor**","productoCod":"","cantidad":0,"unidad":"","minutos":15.0},{"desc":"A.VEG. PEPITA DE UVA","productoCod":"INV-056","cantidad":0,"unidad":"","minutos":0.0},{"desc":"I'm from Rice Serum","productoCod":"INV-005","cantidad":2.0,"unidad":"ml","minutos":2.0},{"desc":"PROBIOTIC SKIN BALANCING MASK","productoCod":"INV-055","cantidad":2.0,"unidad":"g","minutos":30.0},{"desc":"DURANTE MASCARILLA MASAJE CAPILAR O EN MANOS \u2014 **se puede aplicar piedra caliente en corazon**","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"** Solo si es contratado EXTRA** NO EN EMBARAZO","productoCod":"INV-049","cantidad":50.0,"unidad":"g","minutos":0.0},{"desc":"** Solo si es contratado EXTRA**","productoCod":"INV-051","cantidad":1.0,"unidad":"Unidad","minutos":0.0},{"desc":"I'm from Rice Serum","productoCod":"INV-005","cantidad":1.0,"unidad":"ml","minutos":2.0},{"desc":"COSRX Snail Mucin 96% Power Repairing Essence","productoCod":"INV-011","cantidad":2.0,"unidad":"ml","minutos":2.0},{"desc":"COSRX Snail Mucin 92% Face Moisturizer","productoCod":"INV-030","cantidad":2.0,"unidad":"g","minutos":6.0},{"desc":"NO BOOSTER \u2014 NO EN EMBARAZO","productoCod":"","cantidad":0,"unidad":"","minutos":0.0},{"desc":"Beauty of Joseon Revive Eye Serum","productoCod":"INV-029","cantidad":1.0,"unidad":"ml","minutos":2.0},{"desc":"Jojoba Lip Essence","productoCod":"INV-038","cantidad":0.25,"unidad":"ml","minutos":1.0},{"desc":"Cotoneetes Tippy's Frasco","productoCod":"INV-060","cantidad":1.0,"unidad":"Unidad","minutos":0.0},{"desc":"SKIN1004 Madagascar Centella Hyalu-CICA Water-fit Sun Serum","productoCod":"INV-031","cantidad":2.0,"unidad":"ml","minutos":1.0}]}};
// Siembra la base migrada del Excel (CABINA_SEED) en las 4 pestanas de la cabina.
// La usan tanto la creacion inicial como el boton 'Reponer base del Excel'.
function _cabinaSembrar_(ssCb, faciales, usuario) {
  var wInv = ssCb.getSheetByName('🧴 INVENTARIO CABINA');
  var wAct = ssCb.getSheetByName('🛠 ACTIVOS');
  var wPro = ssCb.getSheetByName('📋 PROTOCOLOS');
  var wPas = ssCb.getSheetByName('📝 PROTOCOLO PASOS');
  var hoyCE = Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm');
  var filasInv = (CABINA_SEED.productos||[]).map(function(p){
    var costoUni = p.contenido>0 ? p.costoEnvase/p.contenido : 0;
    return [p.codigo, p.producto, p.proveedor||'', p.contenido, p.unidad||'ml', p.costoEnvase, costoUni, 0, 0, 0, 1, p.notas||'', 'SI', '', 0, '', '', '', '', '', 1];
  });
  if (filasInv.length) wInv.getRange(2,1,filasInv.length,21).setValues(filasInv);
  var filasAct = (CABINA_SEED.activos||[]).map(function(a){
    return [a.codigo, a.activo, a.categoria||'', a.cantidad||'', a.ubicacion||'', a.estado||'', '', a.costo||'', a.notas||'', 'SUNSU', '', '', '', 'unidad'];
  });
  if (filasAct.length) wAct.getRange(2,1,filasAct.length,14).setValues(filasAct);
  // Un protocolo por cada facial VIGENTE del catalogo. Si el Excel tenia protocolo
  // para ese SKU (01-06), entra con sus pasos como v1; los demas quedan 'por definir'.
  var filasPro = [], filasPas = [];
  (faciales||[]).forEach(function(fc){
    var pasosSeed = (CABINA_SEED.protocolos||{})[fc.sku] || [];
    filasPro.push([fc.sku, fc.n, 1, 'SI', '', '',
      pasosSeed.length ? 'Migrado del Excel original' : 'Protocolo por definir', hoyCE, usuario||'']);
    pasosSeed.forEach(function(ps, pi){
      filasPas.push([fc.sku, 1, pi+1, ps.desc||'', ps.productoCod||'', ps.cantidad||0, ps.unidad||'', ps.minutos||0]);
    });
  });
  if (filasPro.length) wPro.getRange(2,1,filasPro.length,9).setValues(filasPro);
  if (filasPas.length) wPas.getRange(2,1,filasPas.length,8).setValues(filasPas);
}
function _cabinaSS_() {
  var id = PropertiesService.getScriptProperties().getProperty('CABINA_SS_ID');
  if (!id) return null;
  try { return SpreadsheetApp.openById(id); } catch(eCb) { return null; }
}
function _cabOCSheet_(ssCb) {
  var ws = ssCb.getSheetByName('🛒 ORDENES CABINA');
  if (!ws) {
    ws = ssCb.insertSheet('🛒 ORDENES CABINA');
    ws.getRange(1,1,1,9).setValues([['#','FECHA','PROVEEDOR','ITEMS','ESTADO','TOTAL','CREADA POR','RECIBIDA','RECIBIDA POR']])
      .setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    ws.setFrozenRows(1);
    ws.setColumnWidth(4,320);
  }
  return ws;
}
function _cabBajasSheet_(ssCb) {
  var ws = ssCb.getSheetByName('🪦 BAJAS');
  if (!ws) {
    ws = ssCb.insertSheet('🪦 BAJAS');
    ws.getRange(1,1,1,9).setValues([['#','FECHA','TIPO','CÓDIGO','NOMBRE','CANTIDAD','RAZÓN','POR','FOTO']])
      .setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    ws.setFrozenRows(1);
    ws.setColumnWidth(7,260);
  }
  return ws;
}
function _cabInvHeaders_(ws) {
  // Estructuras creadas antes: asegurar las columnas M (ACTIVO) y N (SKU CATALOGO)
  try {
    if (!(ws.getRange(1,13).getValue()||'').toString()) ws.getRange(1,13).setValue('ACTIVO').setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    if (!(ws.getRange(1,14).getValue()||'').toString()) ws.getRange(1,14).setValue('SKU CATÁLOGO').setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    if (!(ws.getRange(1,15).getValue()||'').toString()) ws.getRange(1,15).setValue('BODEGA: CERRADOS').setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    if (!(ws.getRange(1,16).getValue()||'').toString()) ws.getRange(1,16).setValue('CÓDIGO BARRAS').setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    if (!(ws.getRange(1,17).getValue()||'').toString()) ws.getRange(1,17).setValue('PRODUCTO BASE').setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    if (!(ws.getRange(1,18).getValue()||'').toString()) ws.getRange(1,18).setValue('UBICACIÓN').setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    if (!(ws.getRange(1,19).getValue()||'').toString()) ws.getRange(1,19).setValue('UBICACIÓN LOCAL').setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    if (!(ws.getRange(1,20).getValue()||'').toString()) ws.getRange(1,20).setValue('UBICACIÓN ABIERTO').setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    if (!(ws.getRange(1,21).getValue()||'').toString()) ws.getRange(1,21).setValue('MÁX ABIERTOS').setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
  } catch(eIH) {}
}
function _cabActHeaders_(ws) {
  try {
    if (!(ws.getRange(1,10).getValue()||'').toString()) ws.getRange(1,10).setValue('LUGAR').setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    if (!(ws.getRange(1,11).getValue()||'').toString()) ws.getRange(1,11).setValue('CÓDIGO BARRAS').setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    if (!(ws.getRange(1,12).getValue()||'').toString()) ws.getRange(1,12).setValue('PROVEEDOR').setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    if (!(ws.getRange(1,13).getValue()||'').toString()) ws.getRange(1,13).setValue('CANTIDAD BODEGA').setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    if (!(ws.getRange(1,14).getValue()||'').toString()) ws.getRange(1,14).setValue('UNIDAD').setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
  } catch(eAH) {}
}
function _cabTraspasoSheet_(ssCb) {
  var ws = ssCb.getSheetByName('🚚 TRASPASOS');
  if (!ws) {
    ws = ssCb.insertSheet('🚚 TRASPASOS');
    ws.getRange(1,1,1,6).setValues([['#','FECHA','DE → A','ITEMS','POR','NOTAS']])
      .setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    ws.setFrozenRows(1);
    ws.setColumnWidth(4,320);
  }
  return ws;
}
function _cabNext_(ws, pref) {
  // Continua la numeracion real: busca el mayor INV-### / AC-### existente y suma 1.
  var maxN = 0;
  if (ws.getLastRow() >= 2) {
    ws.getRange(2,1,ws.getLastRow()-1,1).getValues().forEach(function(r){
      var m = (r[0]||'').toString().match(new RegExp('^'+pref+'(\\d+)$'));
      if (m) maxN = Math.max(maxN, parseInt(m[1]));
    });
  }
  return pref + ('00'+(maxN+1)).slice(-3);
}
var CAJA_V2_SHEET = '💵 CAJA CHICA V2';
function _cajaV2Sheet_(ss) {
  var ws = ss.getSheetByName(CAJA_V2_SHEET);
  if (!ws) {
    ws = ss.insertSheet(CAJA_V2_SHEET);
    ws.getRange(1,1,1,9).setValues([['FECHA / HORA','TIPO','DETALLE / JUSTIFICATIVO','QUIÉN','ENTRADA','SALIDA','SALDO','REF','REGISTRADO POR']])
      .setFontWeight('bold').setBackground('#1A2744').setFontColor('white');
    ws.setFrozenRows(1);
    ws.setColumnWidth(1,140); ws.setColumnWidth(2,150); ws.setColumnWidth(3,260); ws.setColumnWidth(4,110);
  }
  return ws;
}
// La ultima fila con DATOS reales (col A o B con algo). getLastRow() cuenta
// formato, formulas y checkboxes pre-llenados hacia abajo — mintio en el demo,
// y aqui le rompio el saldo, la ventana de movimientos y la sincronizacion.
function _ultimaFilaDatos_(ws) {
  var last = ws.getLastRow();
  if (last < 2) return 1;
  var dAB = ws.getRange(1, 1, last, 2).getValues();
  for (var z = last-1; z >= 1; z--) {
    var a = dAB[z][0], b = dAB[z][1];
    if ((a instanceof Date) || (a!=null && String(a).trim()!=='') || (b!=null && String(b).trim()!=='')) return z+1;
  }
  return 1;
}
// EL SALDO ES MATEMATICA, NO MEMORIA. Antes se leia el 'saldo acumulado' escrito
// en la ultima fila — una cadena que, si un eslabon nacio torcido (el bug del
// getLastRow dejo varios), arrastraba el error para siempre. Ahora el saldo se
// RECALCULA siempre desde el ultimo ⚖️ SALDO INICIAL: inicial + Σentradas − Σsalidas.
// Y de paso se AUTO-REPARA la columna G: si algun saldo escrito difiere del
// matematico, se reescribe entera. El cuadre deja de ser una esperanza.
function _cajaV2Recalcular_(ws) {
  var last = _ultimaFilaDatos_(ws);
  if (last < 2) return 0;
  var dR = ws.getRange(2, 1, last-1, 7).getValues();
  // Ultima apertura de caja (⚖️ SALDO INICIAL): desde ahi arranca la cuenta
  var idxIni = -1;
  for (var zr = dR.length-1; zr >= 0; zr--) {
    if (((dR[zr][1]||'')+'').indexOf('SALDO INICIAL') >= 0) { idxIni = zr; break; }
  }
  var saldoR = 0;
  var colG = [], huboDif = false;
  for (var qr = 0; qr < dR.length; qr++) {
    if (qr < idxIni) { colG.push([dR[qr][6]]); continue; } // cajas historicas: intactas
    if (qr === idxIni) saldoR = parseFloat(dR[qr][4])||0;  // la apertura pone la base
    else saldoR += (parseFloat(dR[qr][4])||0) - (parseFloat(dR[qr][5])||0);
    saldoR = Math.round(saldoR*100)/100;
    if (Math.abs((parseFloat(dR[qr][6])||0) - saldoR) > 0.005) huboDif = true;
    colG.push([saldoR]);
  }
  if (idxIni < 0) { // sin apertura marcada: sumar todo desde la fila 2
    saldoR = 0; colG = []; huboDif = false;
    for (var qr2 = 0; qr2 < dR.length; qr2++) {
      saldoR += (parseFloat(dR[qr2][4])||0) - (parseFloat(dR[qr2][5])||0);
      saldoR = Math.round(saldoR*100)/100;
      if (Math.abs((parseFloat(dR[qr2][6])||0) - saldoR) > 0.005) huboDif = true;
      colG.push([saldoR]);
    }
  }
  if (huboDif) { try { ws.getRange(2, 7, colG.length, 1).setValues(colG); } catch(eRep) {} }
  return saldoR;
}
function _cajaV2Saldo_(ws) {
  return _cajaV2Recalcular_(ws);
}
function _cajaV2Append_(ws, tipo, detalle, quien, entrada, salida, ref, por) {
  var saldoNuevo = _cajaV2Saldo_(ws) + (entrada||0) - (salida||0);
  // Fila destino = la siguiente a la ultima CON DATOS (appendRow puede saltarse
  // mas abajo si hay contenido fantasma, dejando movimientos huerfanos)
  var filaDest = _ultimaFilaDatos_(ws) + 1;
  ws.getRange(filaDest, 1).setNumberFormat('@'); // FECHA TEXTO: evita date-flip US locale
  ws.getRange(filaDest, 1, 1, 9).setValues([[Utilities.formatDate(new Date(),'America/Guayaquil','dd/MM/yyyy HH:mm'),
    tipo, detalle, quien, entrada||'', salida||'', saldoNuevo, ref||'', por||'']]);
  return saldoNuevo;
}
// Misma regla de siempre: tickets de HOY con 'Efect:' en col I entran solos a caja,
// una sola vez (candado TK:fila en la columna REF).
function sincronizarEfectivoV2_(ss, wsCaja) {
  // CANDADO GLOBAL (fix duplicados): dos aperturas SIMULTÁNEAS corrían esto en
  // paralelo — ambas leían los TK registrados antes de que la otra escribiera,
  // y cada una insertaba su copia (por eso TK #1194 dos veces a las 15:49).
  // Con ScriptLock entra UNA; la otra espera y al entrar ya ve los candados.
  var lockV2 = null;
  try { lockV2 = LockService.getScriptLock(); if (!lockV2.tryLock(10000)) return; } catch(eLkV) {}
  try {
    _cajaV2Dedup_(wsCaja);
    _sincronizarEfectivoV2Body_(ss, wsCaja);
  } finally { if (lockV2) { try { lockV2.releaseLock(); } catch(eRlV) {} } }
}
// Limpieza ONE-TIME de los duplicados ya creados por la carrera: conserva la
// primera aparición de cada TK:fila, borra las repetidas y recalcula saldos.
function _cajaV2Dedup_(ws) {
  try {
    var prDd = PropertiesService.getScriptProperties();
    if (prDd.getProperty('CAJA_DEDUP_V1') === '1') return;
    var lastDd = _ultimaFilaDatos_(ws);
    if (lastDd >= 2) {
      var refsDd = ws.getRange(2, 8, lastDd-1, 1).getValues();
      var vistoDd = {}, borrarDd = [];
      for (var iDd = 0; iDd < refsDd.length; iDd++) {
        var mDd = (refsDd[iDd][0]||'').toString().match(/TK:(\d+)/);
        if (!mDd) continue;
        if (vistoDd[mDd[1]]) borrarDd.push(iDd+2); else vistoDd[mDd[1]] = true;
      }
      for (var jDd = borrarDd.length-1; jDd >= 0; jDd--) ws.deleteRow(borrarDd[jDd]);
      if (borrarDd.length) {
        _cajaV2Recalcular_(ws);
        try { logAccion_(SpreadsheetApp.getActiveSpreadsheet(), 'CAJA V2', borrarDd.length+' movimientos duplicados eliminados (carrera de sincronización) — saldos recalculados', 'sistema'); } catch(eLgD) {}
      }
    }
    prDd.setProperty('CAJA_DEDUP_V1','1');
  } catch(eDd) { Logger.log('dedup caja: '+eDd.message); }
}
function _sincronizarEfectivoV2Body_(ss, wsCaja) {
  var wsTk = ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); });
  if (!wsTk) return;
  // Ultimos 3 dias (no solo hoy): si un dia la sincronizacion fallo, al dia
  // siguiente se auto-repara — el candado TK:fila impide duplicar
  var diasOkV2 = {};
  for (var dv3 = 0; dv3 < 3; dv3++) {
    var fD3 = new Date(); fD3.setDate(fD3.getDate()-dv3);
    diasOkV2[Utilities.formatDate(fD3, 'America/Guayaquil', 'MM/dd/yyyy')] = true;
  }
  // OPTIMIZACION (misma regla, menos lectura): los tickets se agregan al final,
  // asi que los de HOY viven en las ultimas filas. Se leen solo las ultimas 300
  // de TICKET_FICHA y las ultimas 400 de la caja para el candado anti-duplicado,
  // en vez de escanear las hojas completas en cada apertura.
  var headsV2 = wsTk.getRange(1, 1, 1, wsTk.getLastColumn()).getValues()[0];
  var colFacV2 = -1;
  for (var hv = 0; hv < headsV2.length; hv++) {
    var hV = (headsV2[hv]||'').toString().toUpperCase();
    if (hV.indexOf('FAC') >= 0 && hV.indexOf('FACIAL') < 0) { colFacV2 = hv; break; }
  }
  var lastTk = _ultimaFilaDatos_(wsTk);
  if (lastTk < 2) return;
  var iniTk = Math.max(2, lastTk - 299);
  var datosV2 = wsTk.getRange(iniTk, 1, lastTk - iniTk + 1, wsTk.getLastColumn()).getValues();
  var yaV2 = {};
  var lastCj = _ultimaFilaDatos_(wsCaja);
  if (lastCj >= 2) {
    var iniCj = Math.max(2, lastCj - 399);
    wsCaja.getRange(iniCj, 8, lastCj - iniCj + 1, 1).getValues().forEach(function(r){
      var m = (r[0]||'').toString().match(/TK:(\d+)/); if (m) yaV2[m[1]] = true;
    });
  }
  for (var tv = 0; tv < datosV2.length; tv++) {
    var fv = datosV2[tv];
    var filaReal = iniTk + tv;
    if (!fv[0]) continue;
    var fdv = _fechaDe_(fv[0]);
    if (!fdv || isNaN(fdv.getTime())) continue;
    if (!diasOkV2[Utilities.formatDate(fdv,'America/Guayaquil','MM/dd/yyyy')]) continue;
    if (yaV2[String(filaReal)]) continue;
    var cobV = (fv[8]||'').toString();
    if (cobV.toLowerCase().indexOf('efect') < 0) continue;
    // Tolerante a como lo escriban: con/sin dos puntos, con/sin $, 'Efect' o 'Efectivo'
    var mv = cobV.match(/efect\w*\s*[:=]?\s*\$?\s*([\d.,]+)/i);
    var valV = mv ? (parseFloat(mv[1].replace(',','.'))||0) : 0;
    if (valV <= 0) valV = parseFloat(fv[9])||0;
    if (valV <= 0) continue;
    // QUIEN = la CLIENTA (cols D/E). Detalle = factura + numero de ticket.
    var cliV = (((fv[3]||'')+' '+(fv[4]||''))+'').toString().trim() || 'Clienta';
    var facV = (colFacV2 >= 0 ? (fv[colFacV2]||'').toString().trim() : '');
    var detV = (facV && facV.toUpperCase() !== 'SIN FACTURA' ? 'FAC '+facV+' · ' : '') + 'TK #'+filaReal;
    _cajaV2Append_(wsCaja, '🎫 EFECTIVO TICKET', detV, cliV, valV, 0, 'TK:'+filaReal, 'auto');
  }
}
var CAJA_SHEET = "💵 CAJA CHICA";
var CAJA_DATA_START = 9;   // primera fila de movimientos
var CAJA_GASTO_ROW  = 5;   // fila de input de gastos
var CAJA_DEP_ROW    = 7;   // fila de input de depósitos

var CC = {
  NAVY_D:  "#3D5A7A", NAVY:    "#5B7FA6", NAVY_L:  "#EEF3FA",
  GOLD:    "#C4943A", GOLD_M:  "#E8C07A", GOLD_L:  "#FBF3E3",
  GREEN:   "#7A9E8A", GREEN_L: "#EDF5F1",
  PEACH:   "#D4956A", PEACH_L: "#FDF3EC",
  RED:     "#B87070", RED_L:   "#FDF0F0",
  CREAM:   "#F5F0E8", CREAM_D: "#EDE6D8",
  GRAY:    "#8A90A0", GRAY_L:  "#F4F4F0",
  WHITE:   "#FFFFFF", TEXT:    "#3A3530",
  BLUE_L:  "#EEF3FA",
};

// ── CREAR / REINICIAR PESTAÑA ─────────────────────────────
function crearCajaChica() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var r = ui.prompt("💵 Caja Chica — Saldo inicial",
    "Ingresa el saldo inicial en efectivo ($):", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var saldoInicial = parseFloat(r.getResponseText()) || 0;

  var ws = ss.getSheetByName(CAJA_SHEET);
  if (ws) {
    if (ui.alert("Ya existe Caja Chica. ¿Reiniciar?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    ss.deleteSheet(ws);
  }
  ws = ss.insertSheet(CAJA_SHEET);
  ws.setTabColor(CC.GOLD);
  PropertiesService.getScriptProperties().setProperty("CAJA_SALDO_INICIAL", saldoInicial.toString());

  _construirEstructuraCaja(ws, saldoInicial);
  actualizarKpisCaja(ws);

  ss.toast("✅ Caja Chica lista. Saldo: $" + saldoInicial.toFixed(2), "SUNSU", 4);
  abrirCajaChicaSidebar();
}

function _construirEstructuraCaja(ws, saldoInicial) {
  ws.clearContents(); ws.clearFormats();

  // Pasteles Sunsu
  var P = {
    TITULO_BG:  "#EEF3FA",  TITULO_FG:  "#3D5A7A",  // azul claro
    KPI1_BG:    "#EEF3FA",  KPI1_FG:    "#5B7FA6",  // saldo inicial — azul pastel
    KPI2_BG:    "#EDF5F1",  KPI2_FG:    "#7A9E8A",  // ingresos — verde pastel
    KPI3_BG:    "#FDF3EC",  KPI3_FG:    "#D4956A",  // gastos — melocotón pastel
    KPI4_BG:    "#FBF3E3",  KPI4_FG:    "#C4943A",  // depósitos — dorado pastel
    SALDO_BG:   "#F5F0E8",  SALDO_FG:   "#3D5A7A",  // saldo actual — crema
    HDR_GASTO:  "#FDF3EC",  HDR_DEP:    "#EEF3FA",  // headers sección
    HDR_TABLA:  "#EEF3FA",  HDR_TBL_FG: "#5B7FA6",  // headers tabla
    INPUT_BG:   "#FAFAF8",  // celdas de input
    ROW_A:      "#FAFAF8",  ROW_B:      "#FFFFFF",  // filas alternadas
    GASTO_BG:   "#FDF3EC",  GASTO_FG:   "#D4956A",
    DEP_BG:     "#EEF3FA",  DEP_FG:     "#5B7FA6",
    ING_BG:     "#EDF5F1",  ING_FG:     "#7A9E8A",
    MIXTO_BG:   "#FBF3E3",  MIXTO_FG:   "#C4943A",
    SALDO_R_BG: "#F5F0E8",  SALDO_R_FG: "#3D5A7A",
    GRAY:       "#8A90A0",  WHITE:      "#FFFFFF",
    BORDER:     "#E8E4DC",
  };

  // ── ROW 1: Título ──────────────────────────────────────
  ws.getRange(1,1,1,9).merge()
    .setValue("순수  SUNSU SPA — CAJA CHICA")
    .setBackground(P.TITULO_BG).setFontColor(P.TITULO_FG)
    .setFontWeight("bold").setFontSize(14).setFontFamily("Arial")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  ws.setRowHeight(1, 44);

  // ── ROWS 2-3: KPIs ─────────────────────────────────────
  var kpis = [
    ["SALDO INICIAL", P.KPI1_BG, P.KPI1_FG, saldoInicial],
    ["INGRESOS HOY",  P.KPI2_BG, P.KPI2_FG, 0],
    ["GASTOS HOY",    P.KPI3_BG, P.KPI3_FG, 0],
    ["DEPÓSITOS HOY", P.KPI4_BG, P.KPI4_FG, 0],
  ];
  var colsKpi = [1,3,5,7];
  kpis.forEach(function(k,i) {
    var c = colsKpi[i];
    ws.getRange(2,c,1,2).merge().setValue(k[0])
      .setBackground(k[1]).setFontColor(k[2])
      .setFontWeight("bold").setFontSize(8).setFontFamily("Arial")
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    ws.getRange(3,c,1,2).merge().setValue(k[3])
      .setBackground(P.WHITE).setFontColor(k[2])
      .setFontWeight("bold").setFontSize(15).setFontFamily("Arial")
      .setHorizontalAlignment("center").setVerticalAlignment("middle")
      .setNumberFormat('"$"#,##0.00');
  });
  ws.setRowHeight(2, 24); ws.setRowHeight(3, 38);

  // SALDO ACTUAL
  ws.getRange(2,9).setValue("SALDO ACTUAL")
    .setBackground(P.SALDO_BG).setFontColor(P.SALDO_FG)
    .setFontWeight("bold").setFontSize(9).setFontFamily("Arial")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  ws.getRange(3,9).setValue(saldoInicial)
    .setBackground(P.WHITE).setFontColor(P.SALDO_FG)
    .setFontWeight("bold").setFontSize(18).setFontFamily("Arial")
    .setHorizontalAlignment("center").setVerticalAlignment("middle")
    .setNumberFormat('"$"#,##0.00');

  // ── ROW 4: Sección GASTOS ──────────────────────────────
  ws.getRange(4,1,1,9).merge()
    .setValue("💸  REGISTRAR GASTO  —  Llena las celdas y escribe LISTO en columna I")
    .setBackground(P.HDR_GASTO).setFontColor(P.KPI3_FG)
    .setFontWeight("bold").setFontSize(9).setFontFamily("Arial")
    .setHorizontalAlignment("left").setVerticalAlignment("middle");
  ws.setRowHeight(4, 24);

  // ROW 5: inputs gasto — labels encima
  var gCols = ["DESCRIPCIÓN","MONTO ($)","QUIÉN GASTÓ","JUSTIFICACIÓN","","","","","LISTO →"];
  gCols.forEach(function(l,i){
    ws.getRange(5,i+1)
      .setBackground(i===8 ? P.KPI3_BG : P.WHITE)
      .setFontColor(i===8 ? P.KPI3_FG : P.GRAY)
      .setFontWeight("bold").setFontSize(8).setFontFamily("Arial")
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    if (l) ws.getRange(5,i+1).setValue(l);
  });
  ws.getRange(5,1).setValue("").setBackground(P.INPUT_BG).setFontSize(10).setFontFamily("Arial");
  ws.getRange(5,2).setValue("").setBackground(P.INPUT_BG).setFontSize(10).setFontFamily("Arial").setNumberFormat('"$"#,##0.00');
  ws.getRange(5,3).setValue("").setBackground(P.INPUT_BG).setFontSize(10).setFontFamily("Arial");
  ws.getRange(5,4,1,5).merge().setValue("").setBackground(P.INPUT_BG).setFontSize(10).setFontFamily("Arial");
  ws.getRange(5,9).setValue("👉 LISTO").setBackground(P.KPI3_BG).setFontColor(P.KPI3_FG)
    .setFontSize(9).setFontFamily("Arial").setHorizontalAlignment("center").setFontWeight("bold");
  ws.setRowHeight(5, 30);

  // ── ROW 6: Sección DEPÓSITOS ───────────────────────────
  ws.getRange(6,1,1,9).merge()
    .setValue("🏦  REGISTRAR DEPÓSITO  —  Llena las celdas y escribe LISTO en columna I")
    .setBackground(P.HDR_DEP).setFontColor(P.KPI1_FG)
    .setFontWeight("bold").setFontSize(9).setFontFamily("Arial")
    .setHorizontalAlignment("left").setVerticalAlignment("middle");
  ws.setRowHeight(6, 24);

  // ROW 7: inputs depósito
  var dCols = ["MONTO ($)","QUIÉN ENTREGA","QUIÉN DEPOSITA","BANCO / REFERENCIA","","","","","LISTO →"];
  dCols.forEach(function(l,i){
    ws.getRange(7,i+1)
      .setBackground(i===8 ? P.KPI1_BG : P.WHITE)
      .setFontColor(i===8 ? P.KPI1_FG : P.GRAY)
      .setFontWeight("bold").setFontSize(8).setFontFamily("Arial")
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    if (l) ws.getRange(7,i+1).setValue(l);
  });
  ws.getRange(7,1).setValue("").setBackground(P.INPUT_BG).setFontSize(10).setFontFamily("Arial").setNumberFormat('"$"#,##0.00');
  ws.getRange(7,2).setValue("").setBackground(P.INPUT_BG).setFontSize(10).setFontFamily("Arial");
  ws.getRange(7,3).setValue("").setBackground(P.INPUT_BG).setFontSize(10).setFontFamily("Arial");
  ws.getRange(7,4,1,5).merge().setValue("").setBackground(P.INPUT_BG).setFontSize(10).setFontFamily("Arial");
  ws.getRange(7,9).setValue("👉 LISTO").setBackground(P.KPI1_BG).setFontColor(P.KPI1_FG)
    .setFontSize(9).setFontFamily("Arial").setHorizontalAlignment("center").setFontWeight("bold");
  ws.setRowHeight(7, 30);

  // ── ROW 8: Headers tabla ───────────────────────────────
  var hdrs = ["FECHA / HORA","TIPO","DESCRIPCIÓN / NOMBRE","QUIÉN","CÉDULA / BANCO","MONTO","EFECTIVO","SALDO","NOTAS",""];
  hdrs.forEach(function(h,i){
    ws.getRange(8,i+1).setValue(h)
      .setBackground(P.HDR_TABLA).setFontColor(P.HDR_TBL_FG)
      .setFontWeight("bold").setFontSize(8).setFontFamily("Arial")
      .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  });
  ws.setRowHeight(8, 30);

  // ── Anchos de columna ──────────────────────────────────
  var widths = [120,100,130,110,90,80,80,90,140,70];
  widths.forEach(function(w,i){ ws.setColumnWidth(i+1,w); });
  ws.setColumnWidth(11, 50);

  // Guardar colores pastel en properties para _escribirMovimiento
  PropertiesService.getScriptProperties().setProperty("CAJA_P", JSON.stringify(P));

  // ── Fila saldo inicial ─────────────────────────────────
  _escribirMovimiento(ws, CAJA_DATA_START, {
    tipo: "SALDO INICIAL",
    nombre: "Administración", apellido: "", cedula: "",
    monto: saldoInicial, efectivo: saldoInicial,
    saldo: saldoInicial, notas: "",
    bgTipo: P.KPI1_BG, fgTipo: P.KPI1_FG,
  });
}

// ── ESCRIBIR MOVIMIENTO EN FILA ───────────────────────────
function _escribirMovimiento(ws, fila, opts) {
  var now = Utilities.formatDate(new Date(), "America/Guayaquil", "MM/dd/yyyy HH:mm");
  var alt = fila % 2 === 0 ? "#FAFAF8" : "#FFFFFF";
  var isMixto = opts.mixto || false;

  // Pastel colors por tipo
  var tipoBg, tipoFg, montoFg;
  var t = opts.tipo || "";
  if (t === "GASTO")          { tipoBg="#FDF3EC"; tipoFg="#D4956A"; montoFg="#D4956A"; }
  else if (t === "DEPOSITO")  { tipoBg="#EEF3FA"; tipoFg="#5B7FA6"; montoFg="#D4956A"; }
  else if (t === "INGRESO_MIXTO") { tipoBg="#FBF3E3"; tipoFg="#C4943A"; montoFg="#7A9E8A"; }
  else if (t.indexOf("INGRESO") >= 0) { tipoBg="#EDF5F1"; tipoFg="#7A9E8A"; montoFg="#7A9E8A"; }
  else if (t === "SALDO INICIAL") { tipoBg="#EEF3FA"; tipoFg="#5B7FA6"; montoFg="#5B7FA6"; }
  else if (t === "CIERRE DÍA")   { tipoBg="#F5F0E8"; tipoFg="#8A90A0"; montoFg="#8A90A0"; }
  else { tipoBg = opts.bgTipo||"#F5F0E8"; tipoFg = opts.fgTipo||"#8A90A0"; montoFg="#8A90A0"; }

  ws.getRange(fila,1).setValue(now).setBackground(alt).setFontSize(8).setFontFamily("Arial").setFontColor("#8A90A0");
  ws.getRange(fila,2).setValue(opts.tipo)
    .setBackground(tipoBg).setFontColor(tipoFg)
    .setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center");

  // C: Descripción / Nombre
  var esIngreso = t.indexOf("INGRESO") >= 0;
  var colC = opts.desc || (esIngreso ? (opts.nombre||"") : (opts.nombre||""));
  var colD = esIngreso ? (opts.apellido||"") : (opts.apellido||"");
  ws.getRange(fila,3).setValue(colC).setBackground(alt).setFontSize(9).setFontFamily("Arial").setFontColor("#3A3530");
  ws.getRange(fila,4).setValue(colD).setBackground(alt).setFontSize(9).setFontFamily("Arial").setFontColor("#3A3530");
  ws.getRange(fila,5).setValue(opts.cedula||"").setBackground(alt).setFontSize(8).setFontFamily("Arial").setFontColor("#8A90A0");

  // F: Monto
  ws.getRange(fila,6).setValue(opts.monto).setBackground(alt).setFontColor(montoFg)
    .setFontWeight("bold").setFontSize(9).setFontFamily("Arial")
    .setNumberFormat('"$"#,##0.00').setHorizontalAlignment("right");

  // G: Efectivo — amarillo pastel si mixto pendiente
  if (isMixto) {
    ws.getRange(fila,7).setValue("").setBackground("#FBF3E3").setFontSize(9).setFontFamily("Arial")
      .setFontColor("#C4943A").setHorizontalAlignment("center");
    ws.getRange(fila,10).setValue("⚠️ llenar G")
      .setBackground("#FBF3E3").setFontColor("#C4943A")
      .setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center");
  } else {
    ws.getRange(fila,7).setValue(opts.efectivo||Math.abs(opts.monto)).setBackground(alt)
      .setFontSize(8).setFontFamily("Arial").setNumberFormat('"$"#,##0.00').setHorizontalAlignment("right").setFontColor("#8A90A0");
    ws.getRange(fila,10).setValue("✅").setBackground("#EDF5F1").setFontColor("#7A9E8A")
      .setFontWeight("bold").setFontSize(9).setFontFamily("Arial").setHorizontalAlignment("center");
  }

  // H: Saldo
  ws.getRange(fila,8).setValue(opts.saldo)
    .setBackground(opts.saldo < 0 ? "#FDF0F0" : "#F5F0E8")
    .setFontColor(opts.saldo < 0 ? "#B87070" : "#3D5A7A")
    .setFontWeight("bold").setFontSize(10).setFontFamily("Arial")
    .setNumberFormat('"$"#,##0.00').setHorizontalAlignment("right");

  // I: Notas
  ws.getRange(fila,9).setValue(opts.notas||"").setBackground(alt)
    .setFontSize(8).setFontFamily("Arial").setFontColor("#8A90A0").setWrap(false);

  ws.setRowHeight(fila, 22);
}

// ── OBTENER SALDO ACTUAL ──────────────────────────────────
function getSaldoActual(ws) {
  var last = ws.getLastRow();
  for (var r = last; r >= CAJA_DATA_START; r--) {
    var v = ws.getRange(r,8).getValue();
    if (v !== "" && v !== null && !isNaN(parseFloat(v))) return parseFloat(v);
  }
  return parseFloat(PropertiesService.getScriptProperties().getProperty("CAJA_SALDO_INICIAL")||"0");
}

function getNextCajaRow(ws) {
  return Math.max(ws.getLastRow() + 1, CAJA_DATA_START);
}

// ── ACTUALIZAR KPIs ───────────────────────────────────────
function actualizarKpisCaja(ws) {
  var last = ws.getLastRow();
  if (last < CAJA_DATA_START) return;
  var data = ws.getRange(CAJA_DATA_START, 1, last - CAJA_DATA_START + 1, 9).getValues();
  var hoy = Utilities.formatDate(new Date(), "America/Guayaquil", "MM/dd/yyyy");
  var si = parseFloat(PropertiesService.getScriptProperties().getProperty("CAJA_SALDO_INICIAL")||"0");
  var ingHoy=0, gasHoy=0, depHoy=0;

  data.forEach(function(row) {
    // Normalizar fecha — puede ser Date object o string
    var fechaStr = "";
    if (row[0] instanceof Date) {
      fechaStr = Utilities.formatDate(row[0], "America/Guayaquil", "MM/dd/yyyy");
    } else if (row[0]) {
      fechaStr = row[0].toString().substring(0,10);
    }

    var tipo     = (row[1]||"").toString();
    var efectivo = parseFloat(row[6])||0;  // col G efectivo real

    if (fechaStr === hoy) {
      if (tipo.indexOf("INGRESO") >= 0) ingHoy += efectivo;
      if (tipo === "GASTO")             gasHoy += efectivo;
      if (tipo === "DEPOSITO")          depHoy += efectivo;
    }
  });

  // Saldo actual = último valor no vacío de col H (columna 8)
  var saldoActual = si;
  for (var r = data.length - 1; r >= 0; r--) {
    var v = parseFloat(data[r][7]); // col H = index 7
    if (!isNaN(v) && v !== 0) { saldoActual = v; break; }
  }

  // Update KPI cells (row 3)
  ws.getRange(3,1).setValue(si);
  ws.getRange(3,3).setValue(ingHoy);
  ws.getRange(3,5).setValue(gasHoy);
  ws.getRange(3,7).setValue(depHoy);
  ws.getRange(3,9).setValue(saldoActual)
    .setFontColor(saldoActual < 0 ? CC.RED : CC.GOLD)
    .setBackground(saldoActual < 0 ? CC.RED_L : CC.GOLD_L);
}

// ── LEER INPUTS DE FILA 5 / 7 Y REGISTRAR ────────────────
// Llamado por onEdit trigger cuando alguien escribe "LISTO" en col I fila 5 o 7
function procesarInputCaja(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = e.range.getSheet();
  if (ws.getName() !== CAJA_SHEET) return;
  var row = e.range.getRow(), col = e.range.getColumn();

  // ── Col F editada en fila de movimientos (row >= CAJA_DATA_START) ──
  // Cuando llenan el efectivo real en un ingreso mixto, recalcula col E y col G
  // Col G (7) editada en fila mixta — recalcular saldos
  if (col === 7 && row >= CAJA_DATA_START) {
    var efectivoReal = parseFloat(e.value) || 0;
    if (efectivoReal <= 0) return;
    var tipo = ws.getRange(row, 2).getValue().toString();
    if (tipo !== "INGRESO_MIXTO") return;
    // Quitar fondo amarillo
    var altBg = row % 2 === 0 ? CC.CREAM : CC.WHITE;
    ws.getRange(row, 7).setBackground(altBg).setFontColor(CC.GREEN)
      .setFontWeight("bold").setNumberFormat('"$"#,##0.00');
    // Marcar OK en col J
    ws.getRange(row, 10).setValue("✅").setBackground(CC.GREEN_L).setFontColor(CC.GREEN)
      .setFontWeight("bold").setFontSize(9).setFontFamily("Arial").setHorizontalAlignment("center");
    recalcularSaldosCaja(ws);
    actualizarKpisCaja(ws);
    ss.toast("✅ Efectivo registrado: $" + efectivoReal.toFixed(2), "Caja", 4);
    return;
  }

  if (col !== 9) return; // resto solo col I
  var val = (e.value||"").toString().trim().toUpperCase();
  if (val !== "LISTO") return;

  if (row === CAJA_GASTO_ROW) {
    var desc   = ws.getRange(5,1).getValue().toString().trim();
    var monto  = parseFloat(ws.getRange(5,2).getValue())||0;
    var quien  = ws.getRange(5,3).getValue().toString().trim();
    var justif = ws.getRange(5,4).getValue().toString().trim();
    if (!desc || monto <= 0) {
      ws.getRange(5,9).setValue("❌ Faltan datos");
      return;
    }
    var saldoAnterior = getSaldoActual(ws);
    var nuevoSaldo    = saldoAnterior - monto;
    var fila = getNextCajaRow(ws);
    _escribirMovimiento(ws, fila, {
      tipo: "GASTO", nombre: desc, apellido: quien||"", cedula: "",
      monto: -monto, efectivo: monto, saldo: nuevoSaldo,
      notas: justif||"", bgTipo: CC.PEACH_L, fgTipo: CC.PEACH,
    });
    ws.getRange(5,1).clearContent(); ws.getRange(5,2).clearContent();
    ws.getRange(5,3).clearContent(); ws.getRange(5,4).clearContent();
    ws.getRange(5,9).setValue("✅ Registrado").setBackground(CC.GREEN_L).setFontColor(CC.GREEN).setItalic(false);
    actualizarKpisCaja(ws);
    ss.toast("💸 Gasto registrado: " + desc + " — $" + monto.toFixed(2), "Caja", 5);
  }

  if (row === CAJA_DEP_ROW) {
    var montoD   = parseFloat(ws.getRange(7,1).getValue())||0;
    var entrega  = ws.getRange(7,2).getValue().toString().trim();
    var deposita = ws.getRange(7,3).getValue().toString().trim();
    var banco    = ws.getRange(7,4).getValue().toString().trim();
    if (montoD <= 0) { ws.getRange(7,9).setValue("❌ Falta monto"); return; }
    var saldoAnteriorD = getSaldoActual(ws);
    var nuevoSaldoD    = saldoAnteriorD - montoD;
    var filaD = getNextCajaRow(ws);
    _escribirMovimiento(ws, filaD, {
      tipo: "DEPOSITO", nombre: entrega||"", apellido: deposita||"", cedula: banco||"",
      monto: -montoD, efectivo: montoD, saldo: nuevoSaldoD,
      notas: banco||"Depósito",
      bgTipo: CC.NAVY_L, fgTipo: CC.NAVY_D,
    });
    ws.getRange(7,1).clearContent(); ws.getRange(7,2).clearContent();
    ws.getRange(7,3).clearContent(); ws.getRange(7,4).clearContent();
    ws.getRange(7,9).setValue("✅ Registrado").setBackground(CC.GREEN_L).setFontColor(CC.GREEN).setItalic(false);
    actualizarKpisCaja(ws);
    ss.toast("🏦 Depósito registrado: $" + montoD.toFixed(2), "Caja", 5);
  }
}

// ── Recalcular todos los saldos de la columna G ───────────
function recalcularSaldosCaja(ws) {
  var si = parseFloat(PropertiesService.getScriptProperties().getProperty("CAJA_SALDO_INICIAL")||"0");
  var last = ws.getLastRow();
  if (last < CAJA_DATA_START) return;
  var saldo = si;
  for (var r = CAJA_DATA_START; r <= last; r++) {
    var tipo = ws.getRange(r,2).getValue().toString();
    if (!tipo) continue;
    if (tipo === "SALDO INICIAL") {
      saldo = si;
      ws.getRange(r,7).setValue(saldo).setNumberFormat('"$"#,##0.00');
      continue;
    }
    // Col F = efectivo real recibido (siempre usar F para el saldo)
    // Para gastos y depósitos col F tiene el monto, col E tiene el monto negativo
    // Para ingresos col F tiene el efectivo real
    var colG = parseFloat(ws.getRange(r,7).getValue()) || 0; // efectivo real
    var colF = parseFloat(ws.getRange(r,6).getValue()) || 0; // monto signed

    // Dirección: si monto (col F) es negativo = gasto/depósito
    var esNegativo = colF < 0;
    var delta = esNegativo ? -colG : colG;

    saldo += delta;
    // Write saldo to col H
    ws.getRange(r,8).setValue(saldo)
      .setBackground(saldo < 0 ? CC.RED_L : "#F5F0E8")
      .setFontColor(saldo < 0 ? CC.RED : CC.NAVY_D)
      .setFontWeight("bold").setFontSize(10).setFontFamily("Arial")
      .setNumberFormat('"$"#,##0.00').setHorizontalAlignment("right");
  }
}

// ── SINCRONIZAR EFECTIVO DESDE TICKET_FICHA (cada hora) ──
// ── Insertar título de fecha como separador visual ───────
function _insertarTituloDia(ws, fecha) {
  // Revisar si ya existe un título para esta fecha
  var last = ws.getLastRow();
  for (var r = CAJA_DATA_START; r <= last; r++) {
    var t = ws.getRange(r,2).getValue().toString();
    var f = ws.getRange(r,1).getValue().toString();
    if (t === "──── DÍA ────" && f.indexOf(fecha) >= 0) return; // ya existe
  }
  var fila = Math.max(ws.getLastRow() + 1, CAJA_DATA_START);
  ws.getRange(fila,1,1,10).merge()
    .setValue("📅  " + fecha)
    .setBackground(CC.NAVY_L).setFontColor(CC.NAVY_D)
    .setFontWeight("bold").setFontSize(9).setFontFamily("Arial")
    .setHorizontalAlignment("left").setVerticalAlignment("middle");
  ws.getRange(fila,2).setValue("──── DÍA ────"); // marcador oculto en col B
  ws.setRowHeight(fila, 22);
}

function sincronizarEfectivo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wsCaja = ss.getSheetByName(CAJA_SHEET);
  if (!wsCaja) return;

  var wsTicket = ss.getSheets().find(function(s){ return s.getName().includes("TICKET_FICHA"); });
  if (!wsTicket) return;

  var hoy = Utilities.formatDate(new Date(), "America/Guayaquil", "MM/dd/yyyy");
  var datos = wsTicket.getDataRange().getValues();

  // Construir set de TICKET_ROW ya registrados en caja
  var yaRegistrados = new Set();
  var lastCaja = wsCaja.getLastRow();
  if (lastCaja >= CAJA_DATA_START) {
    var cajaK = wsCaja.getRange(CAJA_DATA_START, 11, lastCaja - CAJA_DATA_START + 1, 1).getValues();
    cajaK.forEach(function(r) {
      var v = r[0].toString().trim();
      var m = v.match(/TK:(\d+)/);
      if (m) yaRegistrados.add(parseInt(m[1]));
    });
  }

  // First pass: collect tickets with efectivo to register
  var pendientes = [];
  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];
    var ts = fila[0];
    if (!ts) continue;
    var fecha = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(fecha.getTime())) continue;
    var fechaTk = Utilities.formatDate(fecha, "America/Guayaquil", "MM/dd/yyyy");
    if (fechaTk !== hoy) continue;
    if (yaRegistrados.has(i+1)) continue;

    var cobTipo = (fila[8]||"").toString().trim(); // Col I
    var tieneEfect = cobTipo.toLowerCase().indexOf("efect") >= 0;
    if (!tieneEfect) continue;

    // Extract Efect value: "Tarje:V123, Efect:75.00" → 75.00
    var efectValor = 0;
    var efectMatch = cobTipo.match(/efect\s*:\s*([\d.,]+)/i);
    if (efectMatch) {
      efectValor = parseFloat(efectMatch[1].replace(',','.')) || 0;
    }
    // Fallback: if no value after Efect:, use estimado
    var estimado = parseFloat(fila[9])||0;
    if (efectValor <= 0) efectValor = estimado;

    pendientes.push({
      idx: i+1,
      cobTipo: cobTipo,
      estimado: estimado,
      efectValor: efectValor,
      cosm:     (fila[1]||"").toString().trim(),
      nombre:   (fila[3]||"").toString().trim(),
      apellido: (fila[4]||"").toString().trim(),
      cedula:   (fila[2]||"").toString().trim(),
    });
  }

  // Only insert date header if there are new efectivo tickets
  if (pendientes.length > 0) {
    _insertarTituloDia(wsCaja, hoy);
  }

  var nuevos = 0;
  pendientes.forEach(function(tk) {
    var esMixto = tk.cobTipo.indexOf(",") >= 0;
    var saldoAct = getSaldoActual(wsCaja);
    var filaDestino = getNextCajaRow(wsCaja);

    if (esMixto) {
      _escribirMovimiento(wsCaja, filaDestino, {
        tipo: "INGRESO_MIXTO",
        nombre: tk.nombre, apellido: tk.apellido, cedula: tk.cedula,
        monto: tk.estimado, efectivo: tk.efectValor,  // col G = Efect: value
        saldo: saldoAct + tk.efectValor,
        notas: "(" + tk.cobTipo + ")",
        bgTipo: "#FFF9C4", fgTipo: CC.GOLD,
        mixto: false, // let saldo update normally
      });
    } else {
      _escribirMovimiento(wsCaja, filaDestino, {
        tipo: "INGRESO_EFECT",
        nombre: tk.nombre, apellido: tk.apellido, cedula: tk.cedula,
        monto: tk.estimado, efectivo: tk.efectValor,
        saldo: saldoAct + tk.efectValor,
        notas: "Efec",
        bgTipo: CC.GREEN_L, fgTipo: CC.GREEN,
      });
    }
    wsCaja.getRange(filaDestino, 11).setValue("TK:" + tk.idx)
      .setFontColor("#CCCCCC").setFontSize(7);
    nuevos++;
  });

  if (nuevos > 0) {
    actualizarKpisCaja(wsCaja);
    ss.toast("✅ " + nuevos + " ingreso(s) sincronizados desde tickets", "Caja Chica", 5);
  }
}

// ── CUADRE DIARIO (trigger 22:00) ────────────────────────
function cuadreDiarioCaja() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wsCaja = ss.getSheetByName(CAJA_SHEET);
  if (!wsCaja) return;
  sincronizarEfectivo(); // sync final del día
  actualizarKpisCaja(wsCaja);
  var saldo = getSaldoActual(wsCaja);
  var fila  = getNextCajaRow(wsCaja);
  var now   = Utilities.formatDate(new Date(), "America/Guayaquil", "MM/dd/yyyy HH:mm");
  wsCaja.getRange(fila,1).setValue(now).setFontSize(8).setFontFamily("Arial").setFontColor(CC.GRAY);
  wsCaja.getRange(fila,2).setValue("CIERRE DÍA")
    .setBackground(CC.NAVY_D).setFontColor(CC.WHITE)
    .setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center");
  wsCaja.getRange(fila,3).setValue("Cierre automático de jornada")
    .setFontSize(8).setFontFamily("Arial").setFontColor(CC.GRAY);
  wsCaja.getRange(fila,7).setValue(saldo)
    .setBackground(CC.GOLD_L).setFontColor(CC.GOLD)
    .setFontWeight("bold").setFontSize(11).setFontFamily("Arial")
    .setNumberFormat('"$"#,##0.00').setHorizontalAlignment("right");
  wsCaja.getRange(fila,9).setValue("✅ CERRADO")
    .setBackground(CC.NAVY_L).setFontColor(CC.NAVY_D)
    .setFontWeight("bold").setFontSize(8).setFontFamily("Arial").setHorizontalAlignment("center");
  wsCaja.getRange(fila,1,1,9)
    .setBorder(true,false,true,false,false,false,CC.GOLD,"MEDIUM");
  wsCaja.setRowHeight(fila, 26);
}

// ============================================================
// CAJA CHICA — SIDEBAR (panel lateral en el sheet)
// ============================================================

// ── Autorizar scripts para todas las usuarias (correr UNA vez como dueño) ──
function autorizarScriptsCaja() {
  // Esta función la corre el dueño (tú) una sola vez.
  // Autoriza todos los permisos necesarios para que las chicas
  // puedan usar el botón sin que les pida autorización.
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // Instalar trigger onEdit si no existe
  var triggers = ScriptApp.getProjectTriggers();
  var tieneEdit = triggers.some(function(t){
    return t.getHandlerFunction() === 'procesarInputCaja';
  });
  if (!tieneEdit) {
    ScriptApp.newTrigger('procesarInputCaja')
      .forSpreadsheet(ss).onEdit().create();
  }

  // Desproteger col F en la pestaña CAJA CHICA para que las chicas puedan llenar mixtos
  var wsCaja = ss.getSheetByName(CAJA_SHEET);
  if (wsCaja) {
    // Buscar protección existente y actualizar
    var protections = wsCaja.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    protections.forEach(function(p) {
      try {
        // Agregar col F como rango no protegido
        var unprotected = p.getUnprotectedRanges();
        // Col F completa (efectivo real — mixtos)
        unprotected.push(wsCaja.getRange('G1:G5000')); // col G = efectivo real (mixtos)
        p.setUnprotectedRanges(unprotected);
      } catch(e) { Logger.log(e.message); }
    });
  }

  ss.toast("✅ Permisos configurados correctamente.", "SUNSU", 5);
  ui.alert("✅ Listo.\n\nAhora las chicas pueden:\n• Usar el botón 💵 sin que pida autorización\n• Editar la columna F (efectivo real) en pagos mixtos\n\nNo necesitas correr esto de nuevo.");
}

function abrirCajaChicaSidebar() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var wsCaja = ss.getSheetByName(CAJA_SHEET);
  var saldo  = wsCaja ? getSaldoActual(wsCaja) : 0;
  var hoy    = Utilities.formatDate(new Date(), "America/Guayaquil", "MM/dd/yyyy");
  var ingHoy=0, gasHoy=0, depHoy=0;
  if (wsCaja && wsCaja.getLastRow() >= CAJA_DATA_START) {
    var data = wsCaja.getRange(CAJA_DATA_START,1,wsCaja.getLastRow()-CAJA_DATA_START+1,10).getValues();
    data.forEach(function(r){
      var f=(r[0]||"").toString().substring(0,10);
      var t=(r[1]||"").toString();
      var g=parseFloat(r[6])||0;
      var mf=parseFloat(r[5])||0;
      if(f===hoy){
        if(t.indexOf("INGRESO")>=0) ingHoy+=g;
        if(t==="GASTO") gasHoy+=g;
        if(t==="DEPOSITO") depHoy+=g;
      }
    });
  }

  var html = HtmlService.createHtmlOutput(getCajaModalHtml(saldo, ingHoy, gasHoy, depHoy))
    .setWidth(440)
    .setHeight(620);
  SpreadsheetApp.getUi().showModalDialog(html, '💵 Caja Chica — SUNSU SPA');
}

function getCajaModalHtml(saldo, ingHoy, gasHoy, depHoy) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<style>'
  + '*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif;}'
  + 'body{background:#F5F0E8;padding:14px;font-size:13px;color:#3A3530;overflow-y:auto;}'
  + '.kpis{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:14px;}'
  + '.kpi{background:white;border-radius:10px;padding:10px 8px;text-align:center;}'
  + '.kpi .lbl{font-size:9px;color:#8A90A0;text-transform:uppercase;margin-bottom:4px;}'
  + '.kpi .val{font-size:15px;font-weight:800;}'
  + '.saldo{background:#EEF3FA;border-radius:10px;padding:12px;text-align:center;margin-bottom:14px;}'
  + '.saldo .lbl{font-size:10px;color:#5B7FA6;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;}'
  + '.saldo .val{font-size:26px;font-weight:900;color:#3D5A7A;}'
  + '.tabs{display:flex;gap:6px;margin-bottom:12px;}'
  + '.tab{flex:1;padding:8px;border:none;border-radius:9px;font-size:11px;font-weight:700;cursor:pointer;background:#EDE6D8;color:#8A90A0;transition:all 0.15s;}'
  + '.tab.active{color:white;}'
  + '.tab.tg.active{background:#D4956A;}'
  + '.tab.td.active{background:#5B7FA6;}'
  + '.tab.ts.active{background:#7A9E8A;}'
  + '.panel{display:none;} .panel.active{display:block;}'
  + 'label{display:block;font-size:10px;font-weight:700;color:#8A90A0;text-transform:uppercase;margin:9px 0 3px;}'
  + 'label:first-of-type{margin-top:0;}'
  + 'input,textarea{width:100%;padding:9px 11px;border:1.5px solid #EDE6D8;border-radius:9px;font-size:13px;outline:none;background:#FAF9F6;color:#3A3530;transition:border 0.2s;}'
  + 'input:focus,textarea:focus{border-color:#8FA8C8;background:white;}'
  + 'textarea{height:52px;resize:none;}'
  + '.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}'
  + '.btn{width:100%;padding:11px;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;margin-top:11px;color:white;transition:opacity 0.15s;}'
  + '.btn:disabled{opacity:0.5;cursor:not-allowed;}'
  + '.btn-g{background:#D4956A;} .btn-d{background:#5B7FA6;} .btn-s{background:#7A9E8A;}'
  + '.msg{padding:8px 11px;border-radius:9px;font-size:11px;font-weight:600;margin-top:9px;display:none;text-align:center;}'
  + '.msg.ok{background:#EDF5F1;color:#7A9E8A;} .msg.err{background:#FDF0F0;color:#B87070;}'
  + '</style></head><body>'

  // Saldo
  + '<div class="saldo"><div class="lbl">Saldo actual en caja</div><div class="val">$' + saldo.toFixed(2) + '</div></div>'

  // KPIs
  + '<div class="kpis">'
  + '<div class="kpi"><div class="lbl">Ingresos</div><div class="val" style="color:#7A9E8A">$' + ingHoy.toFixed(2) + '</div></div>'
  + '<div class="kpi"><div class="lbl">Gastos</div><div class="val" style="color:#D4956A">$' + gasHoy.toFixed(2) + '</div></div>'
  + '<div class="kpi"><div class="lbl">Depósitos</div><div class="val" style="color:#5B7FA6">$' + depHoy.toFixed(2) + '</div></div>'
  + '</div>'

  // Tabs
  + '<div class="tabs">'
  + '<button class="tab tg active" onclick="showTab(\'g\',this)">💸 Gasto</button>'
  + '<button class="tab td" onclick="showTab(\'d\',this)">🏦 Depósito</button>'
  + '<button class="tab ts" onclick="showTab(\'s\',this)">🔄 Sincronizar</button>'
  + '</div>'

  // Panel Gasto
  + '<div id="panel-g" class="panel active">'
  + '<div class="row2"><div><label>Nombre</label><input id="g-nom" placeholder="Nombre"></div>'
  + '<div><label>Apellido</label><input id="g-ape" placeholder="Apellido"></div></div>'
  + '<label>Descripción del gasto</label><input id="g-desc" placeholder="Ej: Compra materiales">'
  + '<label>Monto ($)</label><input id="g-monto" type="number" placeholder="0.00" step="0.01" min="0">'
  + '<label>Justificación</label><textarea id="g-just" placeholder="Motivo del gasto..."></textarea>'
  + '<button class="btn btn-g" onclick="gasto(this)">💸 Registrar Gasto</button>'
  + '<div id="msg-g" class="msg"></div>'
  + '</div>'

  // Panel Depósito
  + '<div id="panel-d" class="panel">'
  + '<label>Monto a depositar ($)</label><input id="d-monto" type="number" placeholder="0.00" step="0.01" min="0">'
  + '<div class="row2"><div><label>Quién entrega</label><input id="d-entrega" placeholder="Nombre"></div>'
  + '<div><label>Quién deposita</label><input id="d-deposita" placeholder="Nombre"></div></div>'
  + '<label>Banco / Referencia</label><input id="d-banco" placeholder="Ej: Banco Pichincha">'
  + '<button class="btn btn-d" onclick="deposito(this)">🏦 Registrar Depósito</button>'
  + '<div id="msg-d" class="msg"></div>'
  + '</div>'

  // Panel Sync
  + '<div id="panel-s" class="panel">'
  + '<p style="font-size:12px;color:#8A90A0;margin-bottom:10px;">Trae automáticamente los pagos en efectivo del día desde los tickets registrados.</p>'
  + '<button class="btn btn-s" onclick="sync(this)">🔄 Sincronizar efectivo ahora</button>'
  + '<div id="msg-s" class="msg"></div>'
  + '</div>'

  + '<script>'
  + 'function showTab(id,btn){'
  + '  document.querySelectorAll(".panel").forEach(function(p){p.classList.remove("active");});'
  + '  document.querySelectorAll(".tab").forEach(function(t){t.classList.remove("active");});'
  + '  document.getElementById("panel-"+id).classList.add("active");'
  + '  btn.classList.add("active");'
  + '}'
  + 'function msg(id,txt,ok){var e=document.getElementById(id);e.textContent=txt;e.className="msg "+(ok?"ok":"err");e.style.display="block";setTimeout(function(){e.style.display="none";},4000);}'
  + 'function gasto(btn){'
  + '  var desc=document.getElementById("g-desc").value.trim();'
  + '  var monto=parseFloat(document.getElementById("g-monto").value)||0;'
  + '  var nom=document.getElementById("g-nom").value.trim();'
  + '  var ape=document.getElementById("g-ape").value.trim();'
  + '  var just=document.getElementById("g-just").value.trim();'
  + '  if(!desc||monto<=0){msg("msg-g","❌ Descripción y monto son obligatorios",false);return;}'
  + '  btn.disabled=true;btn.textContent="⏳ Registrando...";'
  + '  google.script.run'
  + '    .withSuccessHandler(function(r){btn.disabled=false;btn.textContent="💸 Registrar Gasto";'
  + '      document.getElementById("g-desc").value="";document.getElementById("g-monto").value="";'
  + '      document.getElementById("g-nom").value="";document.getElementById("g-ape").value="";'
  + '      document.getElementById("g-just").value="";msg("msg-g",r,true);})'
  + '    .withFailureHandler(function(e){btn.disabled=false;btn.textContent="💸 Registrar Gasto";msg("msg-g","❌ "+e.message,false);})'
  + '    .registrarGastoSidebar(desc,monto,(nom+" "+ape).trim(),just);'
  + '}'
  + 'function deposito(btn){'
  + '  var monto=parseFloat(document.getElementById("d-monto").value)||0;'
  + '  var entrega=document.getElementById("d-entrega").value.trim();'
  + '  var deposita=document.getElementById("d-deposita").value.trim();'
  + '  var banco=document.getElementById("d-banco").value.trim();'
  + '  if(monto<=0||!entrega||!deposita){msg("msg-d","❌ Monto y nombres son obligatorios",false);return;}'
  + '  btn.disabled=true;btn.textContent="⏳ Registrando...";'
  + '  google.script.run'
  + '    .withSuccessHandler(function(r){btn.disabled=false;btn.textContent="🏦 Registrar Depósito";'
  + '      document.getElementById("d-monto").value="";document.getElementById("d-entrega").value="";'
  + '      document.getElementById("d-deposita").value="";document.getElementById("d-banco").value="";'
  + '      msg("msg-d",r,true);})'
  + '    .withFailureHandler(function(e){btn.disabled=false;btn.textContent="🏦 Registrar Depósito";msg("msg-d","❌ "+e.message,false);})'
  + '    .registrarDepositoSidebar(monto,entrega,deposita,banco);'
  + '}'
  + 'function sync(btn){'
  + '  btn.disabled=true;btn.textContent="⏳ Sincronizando...";'
  + '  google.script.run'
  + '    .withSuccessHandler(function(r){btn.disabled=false;btn.textContent="🔄 Sincronizar efectivo ahora";msg("msg-s",r,true);})'
  + '    .withFailureHandler(function(e){btn.disabled=false;btn.textContent="🔄 Sincronizar efectivo ahora";msg("msg-s","❌ "+e.message,false);})'
  + '    .sincronizarEfectivoSidebar();'
  + '}'
  + '</script></body></html>';
}

function getCajaWebHtml() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var wsCaja = ss.getSheetByName(CAJA_SHEET);
  var saldo  = wsCaja ? getSaldoActual(wsCaja) : 0;
  var hoy    = Utilities.formatDate(new Date(), "America/Guayaquil", "MM/dd/yyyy");
  var ingHoy=0, gasHoy=0, depHoy=0;
  if (wsCaja && wsCaja.getLastRow() >= CAJA_DATA_START) {
    var data = wsCaja.getRange(CAJA_DATA_START,1,wsCaja.getLastRow()-CAJA_DATA_START+1,10).getValues();
    data.forEach(function(r){
      var f=(r[0]||"").toString().substring(0,10);
      var t=(r[1]||"").toString();
      var g=parseFloat(r[6])||0;
      var mf=parseFloat(r[5])||0;
      if(f===hoy){
        if(t.indexOf("INGRESO")>=0) ingHoy+=g;
        if(t==="GASTO") gasHoy+=g;
        if(t==="DEPOSITO") depHoy+=g;
      }
    });
  }
  var webUrl = ScriptApp.getService().getUrl() + '?page=caja';

  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>💵 Caja Chica — SUNSU</title>'
  + '<style>'
  + '*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif;}'
  + 'body{background:#F5F0E8;min-height:100vh;padding:16px;}'
  + '.wrap{max-width:420px;margin:0 auto;}'
  + 'h1{color:#3D5A7A;font-size:17px;font-weight:800;margin-bottom:14px;text-align:center;letter-spacing:1px;}'
  + '.kpis{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px;}'
  + '.kpi{background:white;border-radius:11px;padding:12px;text-align:center;box-shadow:0 1px 4px rgba(91,127,166,0.10);}'
  + '.kpi.full{grid-column:1/-1;}'
  + '.kpi .lbl{font-size:9px;color:#8A90A0;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;}'
  + '.kpi .val{font-size:22px;font-weight:800;color:#3D5A7A;}'
  + '.kpi.ing .val{color:#7A9E8A;} .kpi.gas .val{color:#D4956A;} .kpi.dep .val{color:#5B7FA6;}'
  + '.card{background:white;border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 1px 5px rgba(91,127,166,0.08);}'
  + '.card h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;display:flex;align-items:center;gap:7px;}'
  + '.card h2.g{color:#D4956A;} .card h2.d{color:#5B7FA6;} .card h2.s{color:#7A9E8A;}'
  + 'label{display:block;font-size:10px;font-weight:700;color:#8A90A0;text-transform:uppercase;letter-spacing:0.4px;margin:10px 0 3px;}'
  + 'label:first-of-type{margin-top:0;}'
  + 'input,textarea{width:100%;padding:9px 11px;border:1.5px solid #EDE6D8;border-radius:9px;font-size:13px;outline:none;color:#3A3530;background:#FAF9F6;transition:border 0.2s;}'
  + 'input:focus,textarea:focus{border-color:#8FA8C8;background:white;}'
  + 'textarea{height:56px;resize:none;}'
  + '.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}'
  + '.btn{width:100%;padding:12px;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;margin-top:12px;letter-spacing:0.3px;transition:opacity 0.15s;color:white;}'
  + '.btn:active{opacity:0.75;} .btn:disabled{opacity:0.5;cursor:not-allowed;}'
  + '.btn-g{background:#D4956A;} .btn-d{background:#5B7FA6;} .btn-s{background:#7A9E8A;}'
  + '.msg{padding:9px 12px;border-radius:9px;font-size:12px;font-weight:600;margin-top:10px;display:none;text-align:center;}'
  + '.msg.ok{background:#EDF5F1;color:#7A9E8A;} .msg.err{background:#FDF0F0;color:#B87070;}'
  + '</style></head><body>'
  + '<div class="wrap">'
  + '<h1>💵 CAJA CHICA — SUNSU SPA</h1>'

  // KPIs
  + '<div class="kpis">'
  + '<div class="kpi full"><div class="lbl">Saldo actual</div><div class="val" id="saldo">$' + saldo.toFixed(2) + '</div></div>'
  + '<div class="kpi ing"><div class="lbl">Ingresos hoy</div><div class="val">$' + ingHoy.toFixed(2) + '</div></div>'
  + '<div class="kpi gas"><div class="lbl">Gastos hoy</div><div class="val">$' + gasHoy.toFixed(2) + '</div></div>'
  + '</div>'

  // Sincronizar
  + '<div class="card">'
  + '<h2 class="s">🔄 Sincronizar Efectivo</h2>'
  + '<p style="font-size:11px;color:#8A90A0;margin-bottom:8px;">Trae los pagos en efectivo del día desde los tickets.</p>'
  + '<button class="btn btn-s" onclick="sync(this)">🔄 Sincronizar ahora</button>'
  + '<div id="msg-s" class="msg"></div>'
  + '</div>'

  // Gasto
  + '<div class="card">'
  + '<h2 class="g">💸 Registrar Gasto</h2>'
  + '<div class="row2">'
  + '<div><label>Nombre</label><input id="g-nom" placeholder="Nombre"></div>'
  + '<div><label>Apellido</label><input id="g-ape" placeholder="Apellido"></div>'
  + '</div>'
  + '<label>Descripción del gasto</label><input id="g-desc" placeholder="Ej: Compra materiales">'
  + '<label>Monto ($)</label><input id="g-monto" type="number" placeholder="0.00" step="0.01">'
  + '<label>Justificación</label><textarea id="g-just" placeholder="Motivo..."></textarea>'
  + '<button class="btn btn-g" onclick="gasto(this)">💸 Registrar Gasto</button>'
  + '<div id="msg-g" class="msg"></div>'
  + '</div>'

  // Depósito
  + '<div class="card">'
  + '<h2 class="d">🏦 Registrar Depósito</h2>'
  + '<label>Monto a depositar ($)</label><input id="d-monto" type="number" placeholder="0.00" step="0.01">'
  + '<div class="row2">'
  + '<div><label>Quién entrega</label><input id="d-entrega" placeholder="Nombre"></div>'
  + '<div><label>Quién deposita</label><input id="d-deposita" placeholder="Nombre"></div>'
  + '</div>'
  + '<label>Banco / Referencia</label><input id="d-banco" placeholder="Ej: Banco Pichincha">'
  + '<button class="btn btn-d" onclick="deposito(this)">🏦 Registrar Depósito</button>'
  + '<div id="msg-d" class="msg"></div>'
  + '</div>'

  + '</div>'
  + '<script>'
  + 'var API="' + webUrl.replace('?page=caja','') + '";'
  + 'function msg(id,txt,ok){var e=document.getElementById(id);e.textContent=txt;e.className="msg "+(ok?"ok":"err");e.style.display="block";setTimeout(function(){e.style.display="none";},4000);}'
  + 'function post(data,cb){fetch(API,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify(data)}).then(function(r){return r.text();}).then(cb).catch(function(e){cb("❌ Error: "+e.message);});}'
  + 'function sync(btn){btn.disabled=true;btn.textContent="⏳...";'
  + 'post({cajaAction:"saldo"},function(r){btn.disabled=false;btn.textContent="🔄 Sincronizar ahora";});'
  + 'post({cajaAction:"sync"},function(r){msg("msg-s",r||"✅ Sincronizado",true);});}'
  + 'function gasto(btn){'
  + 'var desc=document.getElementById("g-desc").value.trim();'
  + 'var monto=parseFloat(document.getElementById("g-monto").value)||0;'
  + 'var nom=document.getElementById("g-nom").value.trim();'
  + 'var ape=document.getElementById("g-ape").value.trim();'
  + 'var just=document.getElementById("g-just").value.trim();'
  + 'if(!desc||monto<=0){msg("msg-g","❌ Descripción y monto son obligatorios",false);return;}'
  + 'btn.disabled=true;btn.textContent="⏳...";'
  + 'post({cajaAction:"gasto",desc:desc,monto:monto,quien:(nom+" "+ape).trim(),justif:just},function(r){'
  + 'btn.disabled=false;btn.textContent="💸 Registrar Gasto";'
  + 'document.getElementById("g-desc").value="";document.getElementById("g-monto").value="";'
  + 'document.getElementById("g-nom").value="";document.getElementById("g-ape").value="";'
  + 'document.getElementById("g-just").value="";'
  + 'msg("msg-g",r,r.indexOf("✅")>=0);});}'
  + 'function deposito(btn){'
  + 'var monto=parseFloat(document.getElementById("d-monto").value)||0;'
  + 'var entrega=document.getElementById("d-entrega").value.trim();'
  + 'var deposita=document.getElementById("d-deposita").value.trim();'
  + 'var banco=document.getElementById("d-banco").value.trim();'
  + 'if(monto<=0||!entrega||!deposita){msg("msg-d","❌ Monto, quién entrega y quién deposita son obligatorios",false);return;}'
  + 'btn.disabled=true;btn.textContent="⏳...";'
  + 'post({cajaAction:"deposito",monto:monto,entrega:entrega,deposita:deposita,banco:banco},function(r){'
  + 'btn.disabled=false;btn.textContent="🏦 Registrar Depósito";'
  + 'document.getElementById("d-monto").value="";document.getElementById("d-entrega").value="";'
  + 'document.getElementById("d-deposita").value="";document.getElementById("d-banco").value="";'
  + 'msg("msg-d",r,r.indexOf("✅")>=0);});}'
  + '</script></body></html>';
}



// ── Funciones llamadas desde el modal (google.script.run) ──

function registrarGastoSidebar(desc, monto, quien, justif, registradoPor, tsApp) {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var wsCaja = ss.getSheetByName(CAJA_SHEET);
  if (!wsCaja) throw new Error("No existe la Caja Chica. Créala primero.");
  monto = parseFloat(monto) || 0;
  if (!desc || monto <= 0) throw new Error("Descripción y monto son obligatorios.");
  var saldoAnterior = getSaldoActual(wsCaja);
  var nuevoSaldo    = saldoAnterior - monto;
  var fila          = getNextCajaRow(wsCaja);
  _escribirMovimiento(wsCaja, fila, {
    tipo:     "GASTO",
    nombre:   desc,          // col C = descripción del gasto
    apellido: quien || "",   // col D = quién gastó
    cedula:   "",
    monto:    -monto,
    efectivo: monto,
    saldo:    nuevoSaldo,
    notas:    justif || "",
    bgTipo:   CC.PEACH_L,
    fgTipo:   CC.PEACH,
  });
  // Col L (12): usuario que registró desde la app | Col M (13): timestamp app
  if (registradoPor) wsCaja.getRange(fila, 12).setValue(registradoPor).setFontSize(8).setFontFamily("Arial").setFontColor("#8A90A0");
  if (tsApp) wsCaja.getRange(fila, 13).setValue(tsApp).setFontSize(8).setFontFamily("Arial").setFontColor("#8A90A0");
  actualizarKpisCaja(wsCaja);
  return "✅ Gasto registrado — Saldo: $" + nuevoSaldo.toFixed(2);
}

function registrarDepositoSidebar(monto, entrega, deposita, banco, registradoPor, tsApp) {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var wsCaja = ss.getSheetByName(CAJA_SHEET);
  if (!wsCaja) throw new Error("No existe la Caja Chica. Créala primero.");
  monto = parseFloat(monto) || 0;
  if (monto <= 0 || !entrega || !deposita) throw new Error("Monto y nombres son obligatorios.");
  var saldoAnterior = getSaldoActual(wsCaja);
  var nuevoSaldo    = saldoAnterior - monto;
  var fila          = getNextCajaRow(wsCaja);
  _escribirMovimiento(wsCaja, fila, {
    tipo:     "DEPOSITO",
    nombre:   entrega || "",
    apellido: deposita || "",
    cedula:   banco || "",
    monto:    -monto,
    efectivo: monto,
    saldo:    nuevoSaldo,
    notas:    banco || "Depósito",
    bgTipo:   CC.NAVY_L,
    fgTipo:   CC.NAVY_D,
  });
  // Col L (12): usuario que registró desde la app | Col M (13): timestamp app
  if (registradoPor) wsCaja.getRange(fila, 12).setValue(registradoPor).setFontSize(8).setFontFamily("Arial").setFontColor("#8A90A0");
  if (tsApp) wsCaja.getRange(fila, 13).setValue(tsApp).setFontSize(8).setFontFamily("Arial").setFontColor("#8A90A0");
  actualizarKpisCaja(wsCaja);
  return "✅ Depósito registrado — Saldo: $" + nuevoSaldo.toFixed(2);
}

function sincronizarEfectivoSidebar() {
  sincronizarEfectivo();
  var wsCaja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CAJA_SHEET);
  var saldo  = wsCaja ? getSaldoActual(wsCaja) : 0;
  return "✅ Sincronizado — Saldo: $" + saldo.toFixed(2);
}
// ============================================================
// SUNSU SPA — INTEGRACIÓN JIBBLE + ROL DE PAGOS
// Pegar al final del script existente en Extensions > Apps Script
// ============================================================

// ── CONFIGURACIÓN EMPLEADAS ──────────────────────────────────
// Estos datos se leen desde la pestaña 💼 EMPLEADAS (protegida)
// La función crearSheetEmpleadas() la crea/actualiza con los datos correctos

var SHEET_EMPLEADAS = '💼 EMPLEADAS';
var IESS_PERSONAL   = 0.0945;  // 9.45% aporte personal
var RMU_2026        = 482;     // Salario mínimo unificado 2026
var SBU_14          = 482;     // 14to sueldo base 2026
var HORAS_MES       = 240;     // 30 días × 8h para costo hora

// ── MENÚ ──────────────────────────────────────────────────────
// Agregar estas opciones al menú onOpen() existente:
//   .addSeparator()
//   .addItem('💼 Crear / Actualizar Empleadas', 'crearSheetEmpleadas')
//   .addItem('📋 Generar Rol de Pagos', 'generarRolDePagos')
//   .addItem('🔗 Test conexión Jibble', 'testJibble')

// ============================================================
// PASO 1 — CREAR / ACTUALIZAR PESTAÑA EMPLEADAS (protegida)
// ============================================================
function crearSheetEmpleadas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(SHEET_EMPLEADAS);
  if (!ws) {
    ws = ss.insertSheet(SHEET_EMPLEADAS);
    // Mover al final
    ss.setActiveSheet(ws);
    ss.moveActiveSheet(ss.getSheets().length);
  }
  ws.clearContents();

  // ── Encabezado ──
  ws.getRange('A1:N1').merge();
  ws.getRange('A1').setValue('💼 SUNSU SPA — DATOS DE EMPLEADAS (CONFIDENCIAL)')
    .setBackground('#3D5A7A').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(11).setFontFamily('Arial');

  // ── Headers ──
  var headers = [
    'NOMBRE COMPLETO\n(como en Jibble)',
    'NOMBRE EN\nSUNSU APP',
    'CÉDULA',
    'CARGO',
    'FECHA\nINGRESO',
    'SUELDO\nBASE',
    'BONO\nFIJO',
    'JORNADA\nHORAS/DÍA',
    'FONDO\nRESERVA',
    'ANTICIPO\nMES',
    'PRÉSTAMO\nIESS HIP.',
    'PRÉSTAMO\nIESS QUIR.',
    'DESCUENTO\nSÁNDALO',
    'NOTAS'
  ];

  var hRow = ws.getRange(2, 1, 1, headers.length);
  hRow.setValues([headers]);
  hRow.setBackground('#5B7FA6').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(9).setFontFamily('Arial')
    .setWrap(true).setHorizontalAlignment('center').setVerticalAlignment('middle');
  ws.setRowHeight(2, 45);

  // ── Datos empleadas (prellenados con info real) ──
  // Formato: [NombreJibble, NombreApp, Cédula, Cargo, FechaIngreso,
  //           SueldoBase, BonoFijo, HorasDia, FondoReserva(SI/NO),
  //           Anticipo, PrestHip, PrestQuir, DescSandalo, Notas]
  var empleadas = [
    ['Dejaneira Espinoza', 'Dejaneira', '1725502312', 'COSMETOLOGA', new Date(2025,9,1),  482, 30,  9, 'NO', 0, 0, 0, 25, ''],
    ['Daniela Mora',       'Daniela',  '1004665699', 'COSMETOLOGA', new Date(2025,8,23), 482, 130, 9, 'NO', 0, 0, 0, 25, ''],
    ['Andrea Robles',      'Andrea',   '1726468133', 'COSMETOLOGA', new Date(2025,4,1),  482, 130, 8, 'NO', 0, 0, 0, 25, ''],
    ['Alejandra Rodriguez','Alejandra','1750552596',  'RECEPCION',   new Date(2026,0,14), 482, 30,  9, 'NO', 0, 0, 0, 0,  ''],
  ];

  ws.getRange(3, 1, empleadas.length, headers.length).setValues(empleadas);

  // Formato columnas de dinero
  ws.getRange(3, 6, empleadas.length, 1).setNumberFormat('"$"#,##0.00');  // Sueldo
  ws.getRange(3, 7, empleadas.length, 1).setNumberFormat('"$"#,##0.00');  // Bono
  ws.getRange(3, 10, empleadas.length, 4).setNumberFormat('"$"#,##0.00'); // Anticipos etc

  // Fila de aviso
  var avisoRow = 3 + empleadas.length + 1;
  ws.getRange(avisoRow, 1, 1, headers.length).merge();
  ws.getRange(avisoRow, 1).setValue(
    '⚠️ HOJA CONFIDENCIAL — Solo visible para administradores. ' +
    'Actualizar anticipos, préstamos y descuentos cada mes antes de generar el rol.'
  ).setBackground('#FBF3E3').setFontColor('#C4943A')
   .setFontSize(9).setFontFamily('Arial').setWrap(true);
  ws.setRowHeight(avisoRow, 35);

  // Anchos de columna
  ws.setColumnWidth(1, 160); // Nombre Jibble
  ws.setColumnWidth(2, 90);  // Nombre App
  ws.setColumnWidth(3, 100); // Cédula
  ws.setColumnWidth(4, 90);  // Cargo
  ws.setColumnWidth(5, 80);  // Fecha
  ws.setColumnWidth(6, 70);  // Sueldo
  ws.setColumnWidth(7, 70);  // Bono
  ws.setColumnWidth(8, 70);  // Horas
  ws.setColumnWidth(9, 70);  // FR
  ws.setColumnWidth(10, 70); // Anticipo
  ws.setColumnWidth(11, 80); // Hip
  ws.setColumnWidth(12, 80); // Quir
  ws.setColumnWidth(13, 80); // Sandalo
  ws.setColumnWidth(14, 120); // Notas

  // Alternar colores filas
  for (var i = 0; i < empleadas.length; i++) {
    var bg = i % 2 === 0 ? '#F5F8FC' : '#FFFFFF';
    ws.getRange(3 + i, 1, 1, headers.length).setBackground(bg).setFontSize(9).setFontFamily('Arial');
  }

  // ── Ocultar la pestaña (sin protección) ──
  ws.hideSheet();

  SpreadsheetApp.getUi().alert(
    '✅ Pestaña EMPLEADAS creada y protegida.\n\n' +
    'Está oculta para las empleadas.\n' +
    'Para verla: clic derecho en cualquier pestaña → Mostrar hojas → 💼 EMPLEADAS\n\n' +
    'Recuerda actualizar los anticipos y préstamos cada mes antes de generar el rol.'
  );
}

// ============================================================
// PASO 2 — LEER EMPLEADAS
// ============================================================
function leerEmpleadas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(SHEET_EMPLEADAS);
  if (!ws) throw new Error('Primero crea la pestaña EMPLEADAS desde el menú ⚙ Config');

  var data = ws.getRange(3, 1, ws.getLastRow() - 2, 14).getValues();
  var empleadas = [];
  data.forEach(function(row) {
    if (!row[0]) return; // saltar filas vacías
    // Saltar fila del aviso de confidencialidad
    var primeraCelda = row[0].toString().trim();
    if (primeraCelda.indexOf('CONFIDENCIAL') >= 0 || primeraCelda.indexOf('⚠') >= 0) return;
    // Saltar si no tiene sueldo válido
    if (!row[5] || parseFloat(row[5]) <= 0) return;
    empleadas.push({
      nombreJibble:  primeraCelda,
      nombreApp:     row[1].toString().trim(),
      cedula:        row[2].toString().trim().split('.')[0], // quitar decimales de cédula
      cargo:         row[3].toString().trim(),
      fechaIngreso:  row[4],
      sueldo:        parseFloat(row[5]) || 0,
      bono:          parseFloat(row[6]) || 0,
      horasDia:      parseInt(row[7])   || 8,
      fondoReserva:  row[8] && row[8].toString().trim().toUpperCase() === 'SI',
      anticipo:      parseFloat(row[9])  || 0,
      prestHip:      parseFloat(row[10]) || 0,
      prestQuir:     parseFloat(row[11]) || 0,
      descSandalo:   parseFloat(row[12]) || 0,
      notas:         (row[13] || '').toString().trim(),
    });
  });
  return empleadas;
}

// ============================================================
// PASO 3 — AUTENTICACIÓN JIBBLE (OAuth2 Client Credentials)
// ============================================================
function getJibbleToken() {
  var props = PropertiesService.getScriptProperties();
  var clientId     = props.getProperty('JIBBLE_CLIENT_ID');
  var clientSecret = props.getProperty('JIBBLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error(
      'Faltan credenciales de Jibble.\n' +
      'Ve a Extensions > Apps Script > ⚙ Configuración del proyecto > Propiedades del script\n' +
      'y agrega: JIBBLE_CLIENT_ID y JIBBLE_CLIENT_SECRET'
    );
  }

  // Verificar si ya tenemos token válido en caché
  var cached = props.getProperty('JIBBLE_TOKEN_CACHE');
  var cachedExp = parseInt(props.getProperty('JIBBLE_TOKEN_EXP') || '0');
  if (cached && Date.now() < cachedExp - 60000) return cached;

  // Solicitar nuevo token
  var resp = UrlFetchApp.fetch('https://identity.prod.jibble.io/connect/token', {
    method: 'post',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    payload: 'grant_type=client_credentials' +
             '&client_id=' + encodeURIComponent(clientId) +
             '&client_secret=' + encodeURIComponent(clientSecret),
    muteHttpExceptions: true,
  });

  var code = resp.getResponseCode();
  var body = JSON.parse(resp.getContentText());
  if (code !== 200) throw new Error('Error Jibble auth: ' + (body.error_description || body.error || code));

  var token = body.access_token;
  var expMs  = Date.now() + (body.expires_in || 3600) * 1000;
  props.setProperty('JIBBLE_TOKEN_CACHE', token);
  props.setProperty('JIBBLE_TOKEN_EXP', expMs.toString());
  return token;
}

function testJibble() {
  try {
    var token = getJibbleToken();
    var resp = UrlFetchApp.fetch('https://time-tracking.prod.jibble.io/v1/People?$top=5', {
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true,
    });
    var data = JSON.parse(resp.getContentText());
    var nombres = (data.value || []).map(function(p){ return p.fullName; }).join(', ');
    SpreadsheetApp.getUi().alert('✅ Jibble conectado.\nEmpleadas encontradas: ' + nombres);
  } catch(e) {
    SpreadsheetApp.getUi().alert('❌ Error: ' + e.message);
  }
}

// ============================================================
// PASO 4 — JALAR HORAS DE JIBBLE POR PERÍODO
// ============================================================
function jibbleFetch(url, token) {
  var resp = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) {
    Logger.log('Jibble error ' + resp.getResponseCode() + ': ' + resp.getContentText());
    return null;
  }
  return JSON.parse(resp.getContentText());
}

function getHorasJibble(token, nombreJibble, desdeStr, hastaStr) {
  // Buscar el ID del miembro
  var peopleUrl = 'https://time-tracking.prod.jibble.io/v1/People?$filter=contains(fullName,\'' +
    encodeURIComponent(nombreJibble.split(' ')[0]) + '\')';
  var people = jibbleFetch(peopleUrl, token);
  if (!people || !people.value || !people.value.length) {
    Logger.log('No se encontró en Jibble: ' + nombreJibble);
    return null;
  }

  // Buscar la persona con nombre más cercano
  var person = people.value.find(function(p){
    return p.fullName.toLowerCase().indexOf(nombreJibble.split(' ')[0].toLowerCase()) >= 0;
  }) || people.value[0];

  // Jalar timesheets diarios del período
  var tsUrl = 'https://time-tracking.prod.jibble.io/v1/Timesheets/Daily' +
    '?personIds=' + person.id +
    '&startDate=' + desdeStr +
    '&endDate='   + hastaStr;
  var tsData = jibbleFetch(tsUrl, token);

  if (!tsData || !tsData.value || !tsData.value.length) {
    Logger.log('Sin timesheets para: ' + nombreJibble + ' — respuesta: ' + JSON.stringify(tsData).slice(0,200));
    // Fallback: return diasMes completo con 0 extras para que el sueldo sea completo
    return { nombre: nombreJibble, diasTrabajados: 0, hrsNomina: 0, hrsExtrasSupl: 0, hrsExtrasExtr: 0, hrsDescanso: 0 };
  }
  Logger.log('Timesheets ' + nombreJibble + ': ' + tsData.value.length + ' días. Primer registro: ' + JSON.stringify(tsData.value[0]).slice(0,300));

  var hrsNomina = 0, hrsExtrasSupl = 0, hrsExtrasExtr = 0, hrsDescanso = 0;
  var diasTrabajados = 0;

  tsData.value.forEach(function(dia) {
    // Jibble Daily Timesheets API field names (try multiple variants)
    var nomMin = parseFloat(
      dia.payrollMinutes || dia.totalPayrollMinutes ||
      dia.trackedMinutes || dia.totalTrackedMinutes || 0
    );
    // Horas extras suplementarias (hasta medianoche, +50%)
    var extSupMin = parseFloat(
      dia.supplementaryOvertimeMinutes || dia.supplementaryMinutes ||
      dia.dailyOvertimeMinutes || dia.overtime50Minutes || 0
    );
    // Horas extras extraordinarias (00:00-06:00, sáb/dom/feriado, +100%)
    var extExtrMin = parseFloat(
      dia.extraordinaryOvertimeMinutes || dia.extraordinaryMinutes ||
      dia.overtime100Minutes || 0
    );
    // Días de descanso trabajados
    var descMin = parseFloat(
      dia.restDayOvertimeMinutes || dia.restDayMinutes ||
      dia.weekendOvertimeMinutes || 0
    );
    if (nomMin > 0 || extSupMin > 0 || extExtrMin > 0) diasTrabajados++;
    hrsNomina     += nomMin;
    hrsExtrasSupl += extSupMin;
    hrsExtrasExtr += extExtrMin;
    hrsDescanso   += descMin;
    Logger.log('Día ' + (dia.date||dia.day||'?') + ': nom=' + nomMin + ' sup=' + extSupMin + ' extr=' + extExtrMin);
  });

  return {
    nombre:           person.fullName,
    diasTrabajados:   diasTrabajados,
    hrsNomina:        hrsNomina / 60,
    hrsExtrasSupl:    hrsExtrasSupl / 60,
    hrsExtrasExtr:    hrsExtrasExtr / 60,
    hrsDescanso:      hrsDescanso / 60,
  };
}

// ============================================================
// PASO 5 — LEER COMISIONES DEL PERÍODO 26→25 DESDE TICKET_FICHA
// ============================================================
// El MISMO script vive pegado en el SISTEMA CENTRAL y en el RRHH. Cuando el rol
// de pagos corre desde RRHH, getActiveSpreadsheet() NO tiene TICKET_FICHA y las
// comisiones salían en $0 (rol falso). Este helper devuelve siempre el central:
// el activo si ya lo es, o abierto por ID si no.
// Normaliza cédulas del archivo antiguo y del sistema nuevo para cruzarlas:
// quita '.0' de Excel, espacios; para RUC de 13 dígitos terminado en 001
// también se compara la base de 10 dígitos.
function _cedAnt_(x) {
  return (x===null||x===undefined?'':x).toString().trim().replace(/\.0$/,'').replace(/\s+/g,'');
}
function _cedBase10_(s) {
  return (/^\d{13}$/.test(s) && s.slice(10)==='001') ? s.slice(0,10) : null;
}

// Convierte un xlsx de Drive a Google Sheet temporal (mismo patrón del RRHH).
function _xlsxATempSheet_(archivo) {
  var token = ScriptApp.getOAuthToken();
  var blob  = archivo.getBlob();
  var boundary = 'SUNSU_BOUNDARY_ANT';
  var metadata = JSON.stringify({ name: '_temp_ventas_antiguas', mimeType: 'application/vnd.google-apps.spreadsheet' });
  var body = '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+metadata+'\r\n'
           + '--'+boundary+'\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n';
  var allBytes = Utilities.newBlob(body).getBytes().concat(blob.getBytes()).concat(Utilities.newBlob('\r\n--'+boundary+'--').getBytes());
  var resp = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method:'POST',
    headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'multipart/related; boundary='+boundary },
    payload: Utilities.newBlob(allBytes).getBytes(),
    muteHttpExceptions:true
  });
  if (resp.getResponseCode() !== 200) throw new Error('Conversión falló: '+resp.getContentText().slice(0,150));
  return JSON.parse(resp.getContentText()).id;
}

// Importa el archivo antiguo VENTAS_SUNSU_2025 (una sola vez) a la hoja
// 📜 CLIENTAS ANTIGUAS: una fila por cédula con nombre, teléfono, email,
// última visita y # de visitas (fechas distintas).
// Una VISITA solo cuenta si hubo TRATAMIENTO (facial, dermaplaning, ampolla,
// paquete...): SKU numérico puro SUNSU-## sin GIFT. Los productos del archivo
// viejo siempre llevan letras (SUNSU-HT-001, SUNSU-AS-002...) y NO cuentan.
function _esTratAnt_(sku, prod) {
  var s = (sku||'').toString().trim().toUpperCase();
  var pr = (prod||'').toString().trim().toUpperCase();
  if (pr.indexOf('GIFT') >= 0 || s.indexOf('GIFT') >= 0) return false;
  if (/^SUNSU-\d+$/.test(s)) return true;
  return /FACIAL|DERMAPLAN|PEELING|LIMPIEZA|MASAJE|PAQUETE|TRATAMIENTO|DRENAJE|AMPOLLA/.test(pr);
}

function _importarClientasAntiguas_(ss) {
  var archivo = null;
  var it = DriveApp.searchFiles("title contains 'VENTAS_SUNSU_2025' and trashed = false");
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf('_temp') === 0) continue;
    if (f.getMimeType && f.getMimeType() === 'application/vnd.google-apps.spreadsheet') { archivo = archivo || f; continue; }
    archivo = f; break; // preferir el xlsx
  }
  if (!archivo) throw new Error("No encontré 'VENTAS_SUNSU_2025' en el Drive");
  var tempId = null;
  if (archivo.getMimeType() === 'application/vnd.google-apps.spreadsheet') {
    tempId = archivo.getId();
  } else {
    tempId = _xlsxATempSheet_(archivo);
  }
  var ssT = SpreadsheetApp.openById(tempId);
  var wsBD = ssT.getSheetByName('BASE DE DATOS');
  if (!wsBD) throw new Error("El archivo no tiene la pestaña 'BASE DE DATOS'");
  var dBD = wsBD.getDataRange().getValues();
  var cli = {};
  for (var i = 2; i < dBD.length; i++) {
    var r = dBD[i];
    var dia = parseFloat(r[0]), mesV = parseFloat(r[1]), anV = parseFloat(r[2]);
    if (!dia || !mesV || !anV || anV < 20) continue;
    var ced = _cedAnt_(r[3]);
    if (!ced) continue;
    if (!_esTratAnt_(r[7], r[8])) continue; // solo tratamientos cuentan como visita
    var fV = new Date(2000+Math.round(anV), Math.round(mesV)-1, Math.round(dia));
    if (isNaN(fV.getTime())) continue;
    var nomV = ((r[4]||'')+' '+(r[5]||'')).toString().replace(/\s+/g,' ').trim();
    if (!cli[ced]) cli[ced] = { nombre:nomV, fechas:{}, ult:fV };
    if (nomV.length > cli[ced].nombre.length) cli[ced].nombre = nomV;
    cli[ced].fechas[fV.getTime()] = true;
    if (fV > cli[ced].ult) cli[ced].ult = fV;
  }
  // Teléfono / email
  var contactos = {};
  var wsCL = ssT.getSheetByName('BASE DE DATOS CLIENTES');
  if (wsCL) {
    var dCL = wsCL.getDataRange().getValues();
    for (var j = 2; j < dCL.length; j++) {
      var cedC = _cedAnt_(dCL[j][0]);
      if (!cedC) continue;
      contactos[cedC] = { tel:(dCL[j][4]||'').toString().trim(), email:(dCL[j][5]||'').toString().trim() };
    }
  }
  if (tempId !== archivo.getId()) { try { DriveApp.getFileById(tempId).setTrashed(true); } catch(eT) {} }

  var filas = Object.keys(cli).map(function(c){
    var x = cli[c];
    return [c, x.nombre, (contactos[c]&&contactos[c].tel)||'', (contactos[c]&&contactos[c].email)||'',
            Utilities.formatDate(x.ult,'America/Guayaquil','dd/MM/yyyy'), Object.keys(x.fechas).length, '', ''];
  }).sort(function(a,b){
    var pa=a[4].split('/'), pb=b[4].split('/');
    return (pb[2]+pb[1]+pb[0]) < (pa[2]+pa[1]+pa[0]) ? -1 : 1;
  });

  var wsA = ss.getSheetByName('📜 CLIENTAS ANTIGUAS') || ss.insertSheet('📜 CLIENTAS ANTIGUAS');
  // Preservar lo ya trabajado (contactos, estados y tel de Acuity) antes de reescribir
  var prevA = {};
  if (wsA.getLastRow() > 1) {
    wsA.getDataRange().getValues().slice(1).forEach(function(rp){
      var cp = _cedAnt_(rp[0]);
      if (cp) prevA[cp] = [rp[6]||'', rp[7]||'', rp[8]||'', rp[9]||'', rp[10]||''];
    });
  }
  wsA.clearContents();
  wsA.getRange(1,1,1,11).setValues([['CEDULA','NOMBRE','TELEFONO','EMAIL','ULTIMA VISITA','VISITAS','CONTACTADA POR','FECHA CONTACTO','ESTADO','INTENTOS','TEL ACUITY']]).setFontWeight('bold');
  if (filas.length) {
    var filas11 = filas.map(function(fr){
      var pv = prevA[fr[0]] || ['','','','',''];
      return fr.slice(0,6).concat(pv);
    });
    // CRÍTICO: formato TEXTO PLANO en cédula (A), teléfonos (C, K) y sobre todo
    // en la FECHA (E) *antes* de escribir — si no, Sheets en locale gringo
    // convierte 'dd/MM/yyyy' con día≤12 a fecha con mes y día VOLTEADOS
    // (el famoso bug de las "sin fecha").
    wsA.getRange(2,1,filas11.length,1).setNumberFormat('@');
    wsA.getRange(2,3,filas11.length,1).setNumberFormat('@');
    wsA.getRange(2,5,filas11.length,1).setNumberFormat('@');
    wsA.getRange(2,11,filas11.length,1).setNumberFormat('@');
    wsA.getRange(2,1,filas11.length,11).setValues(filas11);
  }
  return filas.length;
}

// Recupera un timestamp de recepción que Sheets convirtió a Date VOLTEADA
// (locale US: 'dd/MM' con día≤12 se lee como mes/día). Señal inequívoca de
// volteo: la fecha queda en el FUTURO. Se des-voltea intercambiando día↔mes.
function _fechaRecReal_(v) {
  if (!(v instanceof Date)) return v;
  if (v.getTime() <= Date.now() + 60000) return v; // pasada o presente: se respeta
  var d = v.getDate(), m = v.getMonth() + 1;
  if (m <= 12 && d >= 1 && d <= 12) {
    return new Date(v.getFullYear(), d - 1, m, v.getHours(), v.getMinutes(), 0);
  }
  return v;
}

// Migración one-time: convierte TODA la columna K de 📥 ENTRADAS a texto
// plano, des-volteando las fechas futuras imposibles. Corre una sola vez.
function _migrarTimestampsEntradas_(ss) {
  try {
    var propsMG = PropertiesService.getScriptProperties();
    if (propsMG.getProperty('ENTRADAS_TS_FIX') === '1') return;
    var wsMG = ss.getSheetByName(INV_CONFIG.SHEET_ENTRADAS);
    if (!wsMG) { propsMG.setProperty('ENTRADAS_TS_FIX','1'); return; }
    var nMG = wsMG.getLastRow();
    if (nMG < 4) { propsMG.setProperty('ENTRADAS_TS_FIX','1'); return; }
    var rngMG = wsMG.getRange(4, 11, nMG - 3, 1);
    var valsMG = rngMG.getValues();
    var outMG = valsMG.map(function(r){
      var v = r[0];
      if (v instanceof Date) {
        var real = _fechaRecReal_(v);
        return [Utilities.formatDate(real, 'America/Guayaquil', 'dd/MM/yyyy HH:mm')];
      }
      return [(v===null||v===undefined)?'':v.toString()];
    });
    rngMG.setNumberFormat('@');
    rngMG.setValues(outMG);
    propsMG.setProperty('ENTRADAS_TS_FIX','1');
    try { logAccion_(ss, '📥 ENTRADAS', 'timestamps de recepción migrados a texto (fechas volteadas corregidas)', 'sistema'); } catch(eLgM) {}
  } catch(eMG) {}
}

function _ssCentral_() {
  try {
    var ssA = SpreadsheetApp.getActiveSpreadsheet();
    if (ssA && ssA.getSheets().some(function(s){ return s.getName().includes('TICKET_FICHA'); })) return ssA;
  } catch(eSC) {}
  try {
    return SpreadsheetApp.openById('1YS_yBLVIUbHPgwAjliiSz2dz4HCmmuOHRWd9ecP_4QE');
  } catch(eSC2) { return null; }
}

function leerComisionesPeriodo(nombreApp, desdeComisiones, hastaComisiones) {
  var ss = _ssCentral_();
  var ws = ss ? ss.getSheets().find(function(s){ return s.getName().includes('TICKET_FICHA'); }) : null;
  if (!ws) return { faciales: 0, paquetesUnidades: 0, paquetesValor: 0, productos: 0, extras: 0, recepcion: 0 };

  var data = ws.getDataRange().getValues();
  var EXCLAV = exclColsFromHeaders_(data[0]);
  var mapaProdAv = prodColsFromHeaders_(data[0]);
  var comF = 0, comPUnidades = 0, comProd = 0, comE = 0;

  // Leer comisión por facial desde ⚙ CONFIGURACION
  var wsCfg = ss.getSheetByName('⚙ CONFIGURACION');
  var comConfig = {};
  if (wsCfg) {
    wsCfg.getDataRange().getValues().forEach(function(row) {
      if (row[0] && row[0].toString().indexOf('SUNSU-') === 0 && row[2]) {
        comConfig[row[0].toString().trim()] = parseFloat(row[2]) || 2;
      }
    });
  }
  function getComFacial(sku) { return comConfig[sku] || 2; }

  // Leer precios de compra desde CATALOGO para comisión de productos (30% utilidad)
  var wsCat = ss.getSheetByName('📦 CATALOGO');
  var preciosCompra = {};
  if (wsCat) {
    wsCat.getDataRange().getValues().forEach(function(row) {
      // SKU en col A, precio compra en col que corresponda — ajustar si cambia
      var sku = (row[0]||'').toString().trim();
      var compra = parseFloat(row[3]) || 0; // col D = precio compra
      if (sku && compra > 0) preciosCompra[sku] = compra;
    });
  }

  var primerNombre = nombreApp.toLowerCase().split(' ')[0];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var ts  = row[0];
    if (!ts) continue;

    var fecha = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(fecha.getTime())) continue;

    // Filtrar por período de comisiones (26 mes anterior → 25 mes actual)
    if (fecha < desdeComisiones || fecha > hastaComisiones) continue;

    // Filtrar por cosmetóloga
    var cosm = (row[1] || '').toString().trim().toLowerCase();
    if (!cosm || cosm.indexOf(primerNombre) < 0) continue;
    if (((row[2]||'').toString().split('.')[0]) === '1793219469001') continue; // cliente = Sunsu Spa (interno)

    // Flags de exclusión de comisión — columnas detectadas por encabezado
    var exclFac  = row[EXCLAV.facial - 1] === true || row[EXCLAV.facial - 1] === 'TRUE';
    var exclPaq  = row[EXCLAV.paquete - 1] === true || row[EXCLAV.paquete - 1] === 'TRUE';
    var exclProd = row[EXCLAV.producto - 1] === true || row[EXCLAV.producto - 1] === 'TRUE';

    // ── COMISIÓN FACIALES ──
    // Col T (índice 19): SKU del facial hecho
    // Col Q (índice 16): si tiene texto = es canje de paquete/GC → no comisiona facial
    var facialSku = (row[19] || '').toString().trim().split(' ')[0];
    var colQ      = (row[16] || '').toString().trim();
    var esCanje   = colQ !== '' && colQ !== 'false' && colQ !== '0';
    if (facialSku && !exclFac && !esCanje) {
      comF += getComFacial(facialSku);
    }

    // ── COMISIÓN PAQUETES ──
    // Col U (índice 20): paquete x3 vendido → 1 unidad
    // Col V (índice 21): paquete x6 vendido → 2 unidades (según tu regla)
    if (!exclPaq) {
      var pack3 = (row[20] || '').toString().trim();
      var pack6 = (row[21] || '').toString().trim();
      if (pack3 && pack3 !== 'false' && pack3 !== '') comPUnidades += 1;
      if (pack6 && pack6 !== 'false' && pack6 !== '') comPUnidades += 2;
    }

    // ── COMISIÓN EXTRAS ── $1 por extra vendido (col W); cortesías no comisionan
    var exclExtAv = row[EXCLAV.extras - 1] === true || row[EXCLAV.extras - 1] === 'TRUE';
    if (!exclExtAv) {
      comE += contarExtrasVendidos_(row[CONFIG.COL_EXTRAS - 1]);
    }

    // ── COMISIÓN PRODUCTOS ──
    // Cols Y→BF (índices 24→57): cantidad vendida por SKU
    // Comisión = 30% de (precio_venta_sin_IVA − precio_compra) × cantidad
    // El precio de venta sin IVA = estimado_col_J / 1.15 — pero ese incluye todo.
    // Usamos el valor del CATALOGO: precio total col G = venta con IVA, compra col D
    if (!exclProd) {
      // Productos detectados automáticamente por los encabezados de TICKET_FICHA
      Object.keys(mapaProdAv).forEach(function(skuAv) {
        var qty = parseFloat(row[mapaProdAv[skuAv] - 1]) || 0;
        if (qty <= 0) return;
        // Comisión = 30% sobre precio compra del CATALOGO ($0 si no hay, conservador)
        var compra = preciosCompra[skuAv] || 0;
        comProd += qty * compra * 0.30;
      });
    }
  }

  // Comisión de recepción — solo para la recepcionista configurada
  var comRecep = 0;
  var recepPN = (CONFIG.RECEPCIONISTA||'').toString().trim().toLowerCase().split(' ')[0];
  if (recepPN && primerNombre === recepPN) {
    try { comRecep = calcularComisionRecepcion(desdeComisiones, hastaComisiones).total; } catch(eRc) {}
  }

  return {
    faciales:         Math.round(comF * 100) / 100,
    paquetesUnidades: comPUnidades,  // número de paquetes — se convierte a $ según nivel
    paquetesValor:    0,             // se calcula después según nivel
    productos:        Math.round(comProd * 100) / 100,
    extras:           comE,          // $1 por extra vendido — en el rol se suma a COM. FACIALES
    recepcion:        Math.round(comRecep * 100) / 100, // en el rol se suma a COM. FACIALES
  };
}

// ============================================================
// PASO 6 — LEER MULTAS DEL MES DESDE MULTAS Y DESCUENTOS
// ============================================================
function leerMultasMes(nombreApp, mes, anio) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('📋 MULTAS Y DESCUENTOS');
  if (!ws) return 0;

  // Período: 26 del mes anterior al 25 del mes actual (igual que comisiones)
  var mesAnterior = mes === 1 ? 12 : mes - 1;
  var anioAnterior = mes === 1 ? anio - 1 : anio;
  var fechaDesde = new Date(anioAnterior, mesAnterior - 1, 26, 0, 0, 0);
  var fechaHasta = new Date(anio, mes - 1, 25, 23, 59, 59);

  var data = ws.getDataRange().getValues();
  var total = 0;

  data.forEach(function(row) {
    if (!row[0]) return;
    var cosm  = (row[1] || '').toString().trim();
    var monto = parseFloat(row[3]) || 0;
    if (!cosm || !monto) return;

    var nombreMatch = cosm.toLowerCase().indexOf(nombreApp.toLowerCase().split(' ')[0]) >= 0;
    if (!nombreMatch) return;

    var fecha = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (isNaN(fecha)) return;
    if (fecha >= fechaDesde && fecha <= fechaHasta) {
      total += monto;
    }
  });

  return Math.round(total * 100) / 100;
}


function calcularRol(emp, horas, comisiones, multas, diasMes) {
  var sueldo    = emp.sueldo;
  var horasDia  = emp.horasDia;
  var costoHora = sueldo / HORAS_MES;

  // Días laborados (de Jibble, o diasMes completo si no hay datos)
  var diasLaborados = (horas && horas.diasTrabajados > 0) ? Math.min(horas.diasTrabajados, diasMes) : diasMes;

  // Horas extras
  var hrsSupl = horas ? Math.round(horas.hrsExtrasSupl * 100) / 100 : 0;
  var hrsExtr = horas ? Math.round(horas.hrsExtrasExtr * 100) / 100 : 0;
  var hrsDesc = horas ? Math.round(horas.hrsDescanso   * 100) / 100 : 0;

  // Valor horas extras (Art. 55 Código del Trabajo Ecuador)
  // Suplementarias: costo hora × 1.5
  // Extraordinarias (00:00-06:00, sáb/dom/feriados): costo hora × 2.0
  // Días de descanso: costo hora × 2.0 (se tratan como extraordinarias)
  var valSupl = Math.round(hrsSupl * costoHora * 1.5 * 100) / 100;
  var valExtr = Math.round((hrsExtr + hrsDesc) * costoHora * 2.0 * 100) / 100;
  var totalExtras = valSupl + valExtr;

  // Sueldo proporcional a días laborados
  // Si los días laborados son iguales al mes completo, pagar sueldo completo
  var sueldoProp = (diasMes > 0 && diasLaborados < diasMes)
    ? Math.round((sueldo / diasMes) * diasLaborados * 100) / 100
    : sueldo;

  // Bono fijo
  var bono = emp.bono;

  // Comisiones
  // Extras ($1 c/u) y comisión de recepción se pagan dentro de COM. FACIALES del rol
  var comF    = comisiones.faciales + (comisiones.extras || 0) + (comisiones.recepcion || 0);
  var comProd = comisiones.productos;
  // Paquetes: usar $0 acá ya que viene del sheet de comisiones calculado por el GAS
  var comP    = comisiones.paquetesValor || 0;
  var totalCom = comF + comP + comProd;

  // Total ingreso aportable (base para IESS y beneficios)
  var ingresoAportable = sueldoProp + bono + totalCom + totalExtras;

  // Décimo tercero mensualizado (1/12 del ingreso aportable mensual)
  var decTercero = Math.round((ingresoAportable / 12) * 100) / 100;

  // Décimo cuarto mensualizado (RMU / 12)
  var decCuarto = Math.round((SBU_14 / 12) * 100) / 100;

  // Vacaciones mensualizadas (sueldo / 24)
  var vacaciones = Math.round((sueldo / 24) * 100) / 100;

  // Fondo de reserva (solo si cumple 1 año, y solo si está configurado)
  var fondoReserva = 0;
  if (emp.fondoReserva) {
    fondoReserva = Math.round((sueldo / 12) * 100) / 100;
  }

  // Total ingresos
  var totalIngresos = sueldoProp + bono + totalCom + totalExtras + decTercero + decCuarto + fondoReserva;

  // ── DEDUCCIONES ──
  // Aporte personal IESS: 9.45% sobre ingreso aportable
  var aporteIESS = Math.round(ingresoAportable * IESS_PERSONAL * 100) / 100;

  // Otras deducciones desde la pestaña EMPLEADAS
  var anticipo   = emp.anticipo   || 0;
  var prestHip   = emp.prestHip   || 0;
  var prestQuir  = emp.prestQuir  || 0;
  var descSandalo= emp.descSandalo|| 0;
  var otrosMultas= multas || 0;

  var totalEgresos = aporteIESS + anticipo + prestHip + prestQuir + descSandalo + otrosMultas;

  // Total a recibir
  var totalRecibir = Math.round((totalIngresos - totalEgresos) * 100) / 100;

  return {
    diasLaborados:    diasLaborados,
    sueldoProp:       sueldoProp,
    bono:             bono,
    comF:             comF,
    comP:             comP,
    comProd:          comProd,
    totalCom:         totalCom,
    hrsSupl:          hrsSupl,
    valSupl:          valSupl,
    hrsExtr:          hrsExtr + hrsDesc,
    valExtr:          valExtr,
    totalExtras:      totalExtras,
    decTercero:       decTercero,
    decCuarto:        decCuarto,
    vacaciones:       vacaciones,
    fondoReserva:     fondoReserva,
    ingresoAportable: ingresoAportable,
    totalIngresos:    totalIngresos,
    aporteIESS:       aporteIESS,
    anticipo:         anticipo,
    prestHip:         prestHip,
    prestQuir:        prestQuir,
    descSandalo:      descSandalo,
    multas:           otrosMultas,
    totalEgresos:     totalEgresos,
    totalRecibir:     totalRecibir,
    costoHora:        costoHora,
  };
}

// ============================================================
// PASO 8 — GENERAR ROL DE PAGOS (función principal)
// ============================================================
function generarRolDePagos() {
  var ui = SpreadsheetApp.getUi();

  // ── Pedir mes/año ──
  var hoy    = new Date();
  var mesDefault = Utilities.formatDate(hoy, 'America/Guayaquil', 'MM');
  var anioDefault= Utilities.formatDate(hoy, 'America/Guayaquil', 'yyyy');

  var rMes = ui.prompt('📋 Generar Rol de Pagos', 'Mes (01-12):', ui.ButtonSet.OK_CANCEL);
  if (rMes.getSelectedButton() !== ui.Button.OK) return;
  var rAnio = ui.prompt('📋 Generar Rol de Pagos', 'Año (ej: 2026):', ui.ButtonSet.OK_CANCEL);
  if (rAnio.getSelectedButton() !== ui.Button.OK) return;

  var mes  = parseInt(rMes.getResponseText().trim())  || parseInt(mesDefault);
  var anio = parseInt(rAnio.getResponseText().trim()) || parseInt(anioDefault);

  if (mes < 1 || mes > 12) { ui.alert('Mes inválido'); return; }

  // Período NÓMINA: mes calendario completo (para horas Jibble y sueldo)
  var desde    = new Date(anio, mes - 1, 1,  0,  0,  0);
  var hasta    = new Date(anio, mes,     0, 23, 59, 59); // último día del mes
  var diasMes  = hasta.getDate();

  var desdeStr = Utilities.formatDate(desde, 'UTC', 'yyyy-MM-dd');
  var hastaStr = Utilities.formatDate(hasta, 'UTC', 'yyyy-MM-dd');

  // Período COMISIONES: del 26 del mes anterior al 25 del mes actual
  // Ej: para Mayo 2026 → del 26/Abr/2026 al 25/May/2026
  var desdeComisiones = new Date(anio, mes - 2, 26, 0,  0,  0);
  var hastaComisiones = new Date(anio, mes - 1, 25, 23, 59, 59);

  var MESES_ES = ['', 'Enero','Febrero','Marzo','Abril','Mayo','Junio',
                      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var mesNombre = MESES_ES[mes];

  ui.alert('⏳ Generando rol de ' + mesNombre + ' ' + anio + '...\n\nEsto puede tardar 1-2 minutos.');

  // ── Leer empleadas ──
  var empleadas;
  try {
    empleadas = leerEmpleadas();
  } catch(e) {
    ui.alert('❌ ' + e.message);
    return;
  }

  // ── Token Jibble ──
  var token;
  try {
    token = getJibbleToken();
  } catch(e) {
    // Continuar sin Jibble — horas en 0
    Logger.log('Sin Jibble: ' + e.message);
    token = null;
  }

  // ── Crear pestaña ROL ──
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var shName = 'ROL_' + mesNombre.toUpperCase() + '_' + anio;
  var wsRol  = ss.getSheetByName(shName);
  if (wsRol) ss.deleteSheet(wsRol);
  wsRol = ss.insertSheet(shName);
  ss.moveActiveSheet(ss.getSheets().length);

  // ── Encabezado del rol consolidado ──
  wsRol.getRange('A1:T1').merge();
  var periodoComStr = Utilities.formatDate(desdeComisiones, 'America/Guayaquil', 'dd/MM') +
    ' → ' + Utilities.formatDate(hastaComisiones, 'America/Guayaquil', 'dd/MM/yyyy');
  wsRol.getRange('A1').setValue('SUNSU SPA — ROL DE PAGOS ' + mesNombre.toUpperCase() + ' ' + anio +
    '   |   Comisiones: ' + periodoComStr)
    .setBackground('#3D5A7A').setFontColor('#FFFFFF').setFontWeight('bold')
    .setFontSize(12).setFontFamily('Arial').setHorizontalAlignment('center');
  wsRol.setRowHeight(1, 32);

  var colHdrs = [
    'EMPLEADA','CÉDULA','CARGO','DÍAS\nLAB.',
    'SUELDO','BONO\nFIJO','COM.\nFACIALES','COM.\nPAQUETES','COM.\nPRODUCTOS',
    'HRS\nSUPL','$SUPL\n(50%)','HRS\nEXTR','$EXTR\n(100%)',
    '13°\nMES','14°\nMES','F.\nRESERVA',
    'TOTAL\nINGRESOS','IESS\n9.45%','OTROS\nEGRESOS','TOTAL\nRECIBIR'
  ];
  wsRol.getRange(2, 1, 1, colHdrs.length).setValues([colHdrs])
    .setBackground('#5B7FA6').setFontColor('#FFFFFF').setFontWeight('bold')
    .setFontSize(8).setFontFamily('Arial').setWrap(true)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  wsRol.setRowHeight(2, 40);

  // Anchos
  [130,95,90,40,65,55,65,65,65,40,55,40,55,55,55,55,75,65,65,75].forEach(function(w,i){
    wsRol.setColumnWidth(i+1, w);
  });

  // ── Procesar cada empleada ──
  var filaData = 3;
  var totales  = new Array(colHdrs.length).fill(0);
  var rolesIndividuales = [];

  empleadas.forEach(function(emp) {
    // Horas de Jibble
    var horas = null;
    if (token) {
      try {
        horas = getHorasJibble(token, emp.nombreJibble, desdeStr, hastaStr);
      } catch(e) {
        Logger.log('Error horas ' + emp.nombreJibble + ': ' + e.message);
      }
    }

    // Comisiones del período (26 mes anterior → 25 mes actual)
    var comisiones = { faciales: 0, paquetesValor: 0, productos: 0 };
    try {
      var rawCom = leerComisionesPeriodo(emp.nombreApp, desdeComisiones, hastaComisiones);
      comisiones = rawCom;
    } catch(e) {
      Logger.log('Error com ' + emp.nombreApp + ': ' + e.message);
    }

    // Multas del mes
    var multas = 0;
    try {
      multas = leerMultasMes(emp.nombreApp, mes, anio);
    } catch(e) {
      Logger.log('Error multas ' + emp.nombreApp + ': ' + e.message);
    }

    // Calcular rol
    var rol = calcularRol(emp, horas, comisiones, multas, diasMes);
    rolesIndividuales.push({ emp: emp, rol: rol, mesNombre: mesNombre, anio: anio, mes: mes, diasMes: diasMes, desde: desde, hasta: hasta });

    // Fila en consolidado
    var fila = [
      emp.nombreJibble, emp.cedula, emp.cargo,
      rol.diasLaborados,
      rol.sueldoProp, rol.bono,
      rol.comF, rol.comP, rol.comProd,
      rol.hrsSupl, rol.valSupl,
      rol.hrsExtr, rol.valExtr,
      rol.decTercero, rol.decCuarto, rol.fondoReserva,
      rol.totalIngresos, rol.aporteIESS,
      rol.multas + rol.descSandalo + rol.anticipo + rol.prestHip + rol.prestQuir,
      rol.totalRecibir
    ];
    wsRol.getRange(filaData, 1, 1, fila.length).setValues([fila]);

    // Formato números
    var moneyRange = wsRol.getRange(filaData, 5, 1, 16);
    moneyRange.setNumberFormat('"$"#,##0.00');
    wsRol.getRange(filaData, 4, 1, 1).setHorizontalAlignment('center');
    wsRol.getRange(filaData, 10, 1, 1).setHorizontalAlignment('center');
    wsRol.getRange(filaData, 12, 1, 1).setHorizontalAlignment('center');

    // Acumular totales
    fila.forEach(function(v,i){ if(typeof v === 'number') totales[i] += v; });
    filaData++;
  });

  // ── Fila de totales ──
  wsRol.getRange(filaData, 1, 1, 2).merge();
  wsRol.getRange(filaData, 1).setValue('TOTALES').setFontWeight('bold');
  for (var c = 4; c <= colHdrs.length; c++) {
    wsRol.getRange(filaData, c).setValue(totales[c-1]);
    if (c >= 5) wsRol.getRange(filaData, c).setNumberFormat('"$"#,##0.00');
  }
  wsRol.getRange(filaData, 1, 1, colHdrs.length)
    .setBackground('#EEF3FA').setFontWeight('bold').setFontSize(9);
  wsRol.setRowHeight(filaData, 22);

  // Alternado de filas
  for (var r = 3; r < filaData; r++) {
    var bg2 = r % 2 === 0 ? '#F5F8FC' : '#FFFFFF';
    wsRol.getRange(r, 1, 1, colHdrs.length).setBackground(bg2).setFontSize(9).setFontFamily('Arial');
  }

  // Borde total a recibir
  wsRol.getRange(3, 20, filaData - 3, 1)
    .setBackground('#EDF5F1').setFontColor('#3D5A7A').setFontWeight('bold');

  // ── Generar roles individuales ──
  rolesIndividuales.forEach(function(ri) {
    generarRolIndividual(wsRol.getParent(), ri.emp, ri.rol, ri.mesNombre, ri.anio, ri.mes, ri.diasMes, ri.desde, ri.hasta);
  });

  // ── Nota al pie de fuentes ──
  filaData += 2;
  wsRol.getRange(filaData, 1, 1, colHdrs.length).merge();
  wsRol.getRange(filaData, 1).setValue(
    'Fuentes: Horas laboradas → Jibble API | Comisiones → TICKET_FICHA | ' +
    'Multas → MULTAS Y DESCUENTOS | Datos empleadas → 💼 EMPLEADAS | ' +
    'Generado: ' + Utilities.formatDate(new Date(), 'America/Guayaquil', 'dd/MM/yyyy HH:mm')
  ).setFontSize(8).setFontColor('#8A90A0').setFontFamily('Arial');

  ss.setActiveSheet(wsRol);
  ui.alert('✅ Rol de ' + mesNombre + ' ' + anio + ' generado.\n\n' +
    '• Pestaña consolidada: ' + shName + '\n' +
    '• Roles individuales: ROL_IND_[nombre]_' + mesNombre.toUpperCase() + '\n\n' +
    'Revisa los montos de comisiones de paquetes — se calculan desde el sheet de avance.');
}

// ============================================================
// PASO 9 — ROL INDIVIDUAL (formato igual al Excel de abril)
// ============================================================
function generarRolIndividual(ss, emp, rol, mesNombre, anio, mes, diasMes, desde, hasta) {
  var shName = 'ROL_IND_' + emp.nombreApp.replace(/ /g,'_').toUpperCase() + '_' + mesNombre.toUpperCase();
  var ws = ss.getSheetByName(shName);
  if (ws) ss.deleteSheet(ws);
  ws = ss.insertSheet(shName);
  ss.moveActiveSheet(ss.getSheets().length);
  ws.hideSheet(); // Ocultar — se muestra al admin desde el consolidado

  var W = '#3D5A7A'; // navy header
  var L = '#EEF3FA'; // azul claro

  // ── Helpers de formato ──
  function hdr(range, txt) {
    ws.getRange(range).merge().setValue(txt)
      .setBackground(W).setFontColor('#FFFFFF').setFontWeight('bold')
      .setFontSize(10).setFontFamily('Arial').setHorizontalAlignment('center');
  }
  function lbl(r, c, txt) {
    ws.getRange(r, c).setValue(txt).setFontWeight('bold').setFontSize(9).setFontFamily('Arial');
  }
  function val(r, c, v, fmt) {
    ws.getRange(r, c).setValue(v).setFontSize(9).setFontFamily('Arial');
    if (fmt) ws.getRange(r, c).setNumberFormat(fmt);
  }
  function linea(r, c1, c2) {
    ws.getRange(r, c1, 1, c2 - c1 + 1).setBorder(false, false, true, false, false, false, '#3D5A7A', SpreadsheetApp.BorderStyle.SOLID);
  }

  // Anchos de columnas
  ws.setColumnWidth(1, 20);
  ws.setColumnWidth(2, 160);
  ws.setColumnWidth(3, 90);
  ws.setColumnWidth(4, 55);
  ws.setColumnWidth(5, 55);
  ws.setColumnWidth(6, 80);
  ws.setColumnWidth(7, 20);
  ws.setColumnWidth(8, 160);
  ws.setColumnWidth(9, 90);
  ws.setColumnWidth(10, 80);

  // ── ENCABEZADO ──
  hdr('B1:J1', 'SUNSU S.A');
  hdr('B2:J2', 'RUC: 1793219469001');
  hdr('B3:J3', 'ROL DE PAGOS MENSUAL');
  ws.setRowHeight(1, 22); ws.setRowHeight(2, 22); ws.setRowHeight(3, 22);

  // ── INFO EMPLEADA ──
  lbl(5, 2, 'Empleado:'); val(5, 3, emp.nombreJibble);
  lbl(6, 2, 'C.I.:');     val(6, 3, emp.cedula);
  ws.getRange(6, 3).setNumberFormat('@');
  lbl(7, 2, 'Mes:');      val(7, 3, mesNombre.toUpperCase());
  lbl(8, 2, 'del:');      val(8, 3, desde); ws.getRange(8,3).setNumberFormat('d-MMM-yy');
  lbl(8, 5, 'al:');       val(8, 6, hasta); ws.getRange(8,6).setNumberFormat('d-MMM-yy');
  ws.setRowHeight(5, 18); ws.setRowHeight(6, 18); ws.setRowHeight(7, 18); ws.setRowHeight(8, 18);

  // ── HEADERS INGRESOS / DEDUCCIONES ──
  ws.getRange('B10:E10').merge().setValue('INGRESOS')
    .setBackground('#DDDDDD').setFontWeight('bold').setFontSize(9).setFontFamily('Arial');
  ws.getRange('H10:J10').merge().setValue('DEDUCCIONES')
    .setBackground('#DDDDDD').setFontWeight('bold').setFontSize(9).setFontFamily('Arial');

  // ── FILAS INGRESOS ──
  var ingRows = [
    ['Sueldo',                        '',       '',     rol.sueldoProp],
    ['Bono fijo',                     '',       '',     rol.bono > 0 ? rol.bono : '-'],
    ['Comisiones Faciales',           '',       '',     rol.comF > 0 ? rol.comF : '-'],
    ['Comisiones Paquetes',           '',       '',     rol.comP > 0 ? rol.comP : '-'],
    ['Comisiones Productos',          '',       '',     rol.comProd > 0 ? rol.comProd : '-'],
    ['Horas Suplementarias 50%', rol.hrsSupl > 0 ? rol.hrsSupl : 0, 'hrs.', rol.valSupl > 0 ? rol.valSupl : '-'],
    ['Horas Extraordinarias 100%',rol.hrsExtr > 0 ? rol.hrsExtr : 0,'hrs.', rol.valExtr > 0 ? rol.valExtr : '-'],
    ['13er. Sueldo',                  '',       '',     rol.decTercero],
    ['14to. Sueldo',                  '',       '',     rol.decCuarto],
    ['Fondo de Reserva',              '',       '',     rol.fondoReserva > 0 ? rol.fondoReserva : '-'],
  ];

  var dedRows = [
    ['Aporte Personal IESS',  rol.aporteIESS],
    ['Anticipo Sueldos',      rol.anticipo > 0 ? rol.anticipo : '-'],
    ['Descuento Sándalo',     rol.descSandalo > 0 ? rol.descSandalo : '-'],
    ['Otros Egresos por multas', rol.multas > 0 ? rol.multas : '-'],
    ['Préstamos IESS Hip.',   rol.prestHip > 0 ? rol.prestHip : '-'],
    ['Préstamos IESS Quir.',  rol.prestQuir > 0 ? rol.prestQuir : '-'],
  ];

  ingRows.forEach(function(r, i) {
    var fila = 11 + i;
    ws.getRange(fila, 2).setValue(r[0]).setFontSize(9).setFontFamily('Arial');
    if (r[1] !== '') ws.getRange(fila, 4).setValue(r[1]).setHorizontalAlignment('right').setFontSize(9);
    if (r[2] !== '') ws.getRange(fila, 5).setValue(r[2]).setFontSize(9);
    ws.getRange(fila, 6).setValue(r[3]).setFontSize(9).setFontFamily('Arial');
    if (typeof r[3] === 'number') ws.getRange(fila, 6).setNumberFormat('#,##0.00');
    ws.setRowHeight(fila, 17);
  });

  dedRows.forEach(function(r, i) {
    var fila = 11 + i;
    ws.getRange(fila, 8).setValue(r[0]).setFontSize(9).setFontFamily('Arial');
    ws.getRange(fila, 10).setValue(r[1]).setFontSize(9).setFontFamily('Arial');
    if (typeof r[1] === 'number') ws.getRange(fila, 10).setNumberFormat('#,##0.00');
    ws.setRowHeight(fila, 17);
  });

  // ── TOTALES ──
  var filaTot = 11 + Math.max(ingRows.length, dedRows.length) + 1;
  linea(filaTot - 1, 2, 6);
  linea(filaTot - 1, 8, 10);

  ws.getRange(filaTot, 2, 1, 2).merge().setValue('Total Ingresos:').setFontWeight('bold').setFontSize(9);
  ws.getRange(filaTot, 6).setValue(rol.totalIngresos).setNumberFormat('"$"#,##0.00').setFontWeight('bold').setFontSize(10);

  ws.getRange(filaTot, 8, 1, 2).merge().setValue('Total Deducciones:').setFontWeight('bold').setFontSize(9);
  ws.getRange(filaTot, 10).setValue(rol.totalEgresos).setNumberFormat('"$"#,##0.00').setFontWeight('bold').setFontSize(10);

  // ── TOTAL A RECIBIR ──
  var filaTAR = filaTot + 2;
  ws.getRange(filaTAR, 8, 1, 2).merge().setValue('Total a recibir:').setFontWeight('bold').setFontSize(10);
  ws.getRange(filaTAR, 10).setValue(rol.totalRecibir)
    .setNumberFormat('"$"#,##0.00').setFontWeight('bold').setFontSize(11)
    .setBackground(L).setFontColor(W);
  ws.setRowHeight(filaTAR, 24);

  // ── FIRMAS ──
  var filaFirma = filaTAR + 3;
  ws.getRange(filaFirma, 2).setValue('Recibí conforme:').setFontSize(9);
  var filaLinea = filaFirma + 3;
  linea(filaLinea, 2, 5);
  ws.getRange(filaLinea + 1, 2, 1, 4).merge()
    .setValue(emp.nombreJibble.toUpperCase())
    .setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');

  // ── Borde exterior del rol ──
  ws.getRange(1, 1, filaLinea + 2, 11)
    .setBorder(true, true, true, true, false, false, W, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

// ============================================================
// FUNCIÓN PARA VER UN ROL INDIVIDUAL DESDE CONSOLIDADO
// ============================================================
function verRolIndividual() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Ver Rol Individual', 'Nombre de la empleada (ej: Andrea):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var nombre = r.getResponseText().trim().toUpperCase();

  var hojas = ss.getSheets();
  var found = hojas.find(function(h){ return h.getName().indexOf('ROL_IND_' + nombre) >= 0; });
  if (!found) { ui.alert('No se encontró rol individual para: ' + nombre); return; }
  found.showSheet();
  ss.setActiveSheet(found);
}
    