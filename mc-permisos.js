// Admin → Usuarios y permisos: permisos por persona al estilo MineCore (Admin → Usuarios, build 703).
// Niveles 0-3 por módulo, alcance (solo lo suyo / todo), interruptores de costos, precios y saldos, y perfiles.
// Solo admin edita. Sin cambios guardados la persona queda con lo de su rol.
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v); }
  var NIV = ["Nada", "Ver", "Crear / editar", "Aprobar / borrar"];
  var P = { data: null, sel: "", q: "", draft: null, tab: "usuarios", perfilSel: "" };

  function css() {
    if (document.getElementById("mcu-css")) return;
    var s = document.createElement("style");
    s.id = "mcu-css";
    s.textContent = [
      ".mcu{display:grid;grid-template-columns:300px 1fr;gap:14px;align-items:start}",
      "@media(max-width:860px){.mcu{grid-template-columns:1fr}}",
      ".mcu-list{background:var(--white);border-radius:16px;box-shadow:var(--shadow-sm);padding:10px;max-height:calc(100vh - 170px);overflow:auto}",
      ".mcu-u{display:flex;justify-content:space-between;gap:8px;align-items:center;width:100%;text-align:left;background:transparent;border:0;border-radius:10px;padding:9px 10px;color:var(--text)}",
      ".mcu-u:hover,.mcu-u.on{background:var(--blue-l)}",
      ".mcu-u b{color:var(--navy);font-size:.86rem;display:block}.mcu-u small{color:var(--gray);font-size:.7rem}",
      ".mcu-tag{font-size:.62rem;font-weight:800;border-radius:999px;padding:2px 8px;white-space:nowrap;background:var(--gray-l);color:var(--gray)}",
      ".mcu-tag.p{background:var(--gold-l);color:var(--gold)}.mcu-tag.a{background:var(--green-l);color:var(--green)}",
      ".mcu-card{background:var(--white);border-radius:16px;box-shadow:var(--shadow-sm);padding:16px;margin-bottom:12px}",
      ".mcu-h{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px}",
      ".mcu-h h3{color:var(--navy);font-size:1.05rem;margin:0}",
      ".mcu-t{width:100%;border-collapse:collapse;font-size:.8rem}.mcu-t td,.mcu-t th{padding:7px 6px;border-bottom:1px solid var(--cream-d);text-align:left;vertical-align:middle}",
      ".mcu-t th{font-size:.64rem;color:var(--gray);text-transform:uppercase;letter-spacing:.5px}.mcu-g td{background:var(--blue-ll);font-weight:800;color:var(--navy);font-size:.7rem;text-transform:uppercase;letter-spacing:.5px}",
      ".mcu-seg{display:inline-flex;border:1.5px solid var(--cream-d);border-radius:10px;overflow:hidden}",
      ".mcu-seg button{border:0;background:var(--white);padding:5px 9px;font-size:.7rem;font-weight:700;color:var(--navy);border-right:1px solid var(--cream-d)}",
      ".mcu-seg button:last-child{border-right:0}.mcu-seg button.on{background:var(--navy);color:#fff}.mcu-seg button:disabled{opacity:.3;cursor:not-allowed}",
      ".mcu-seg button.ch{box-shadow:inset 0 -3px 0 var(--gold)}",
      ".mcu-t select{margin:0;padding:5px 8px;font-size:.75rem;width:auto}",
      ".mcu-rol{color:var(--gray);font-size:.68rem}",
      ".mcu-cero{background:var(--red-l);color:var(--red);border-radius:10px;padding:8px 12px;font-weight:800;font-size:.8rem}",
      ".mcu-flags label{display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font-size:.82rem;color:var(--text);font-weight:600;margin:6px 0}",
      ".mcu-flags input{width:auto;margin:0}",
      ".mcu-pp{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:0 12px;padding:4px 0 0 22px}",
      ".mcu-save{position:sticky;bottom:10px;z-index:5;display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--gold-l);border:1.5px solid var(--gold-m);border-radius:14px;padding:10px 14px;margin:10px 0}",
      ".mcu-save[hidden]{display:none}.mcu-save span{font-weight:800;color:var(--navy-d)}.mcu-save input{margin:0;width:220px}",
      ".mcu-tabs{display:flex;gap:6px;margin-bottom:12px}.mcu-tabs button{border:1.5px solid var(--cream-d);background:var(--white);border-radius:999px;padding:7px 14px;font-weight:700;color:var(--navy);font-size:.78rem}.mcu-tabs button.on{background:var(--navy);color:#fff;border-color:var(--navy)}",
    ].join("\n");
    document.head.appendChild(s);
  }

  function usuario() { return (P.data.usuarios || []).find(function (u) { return u.uid === P.sel; }); }
  function perfil(id) { return (P.data.perfiles || []).find(function (p) { return p.id === id; }); }

  function draftDe(u) {
    var ef = u.efectivo || {};
    var alc = {};
    (P.data.modulos || []).forEach(function (m) { if (m.alcance) alc[m.id] = (ef.alcance || {})[m.id] === "no" ? ((u.rolBase.alcance || {})[m.id] || "propio") : (ef.alcance || {})[m.id]; });
    return { niveles: Object.assign({}, ef.niveles), alcance: alc, flags: Object.assign({}, ef.flags), personas: (ef.personas || []).slice(), perfil: u.perfil || "" };
  }
  /** Un perfil no trae lista de personas: «todas» si todo lo que abre es «todo», si no «solo ella». */
  function personasDe(p) {
    var abiertos = (P.data.modulos || []).filter(function (m) { return m.alcance && (p.niveles || {})[m.id] > 0; });
    return abiertos.length && abiertos.every(function (m) { return (p.alcance || {})[m.id] === "todos"; }) ? ["*"] : [];
  }
  function desdePerfil(p, nombre) {
    var fl = { precios: true, saldos: true, comisiones: true, rol_pagos: true };
    return { niveles: Object.assign({}, p.niveles), alcance: Object.assign({}, p.alcance), flags: Object.assign(fl, p.flags), personas: personasDe(p), perfil: nombre };
  }
  /** alcance que se guarda: lo dice «Datos de quién» (+ la lista en _personas). */
  function alcanceDe(d) {
    var out = {}, todos = (d.personas || []).indexOf("*") >= 0;
    (P.data.modulos || []).forEach(function (m) { if (m.alcance && (Number(d.niveles[m.id]) || 0) > 0) out[m.id] = todos ? "todos" : "propio"; });
    out._personas = todos ? ["*"] : (d.personas || []).slice();
    return out;
  }
  /** Punto de partida al personalizar: todo apagado (Emilia, 2026-11-16). */
  function ceros() {
    var d = { niveles: {}, alcance: {}, flags: {}, personas: [], perfil: "" };
    (P.data.flags || []).forEach(function (f) { d.flags[f.id] = false; });
    (P.data.modulos || []).forEach(function (m) { d.niveles[m.id] = 0; if (m.alcance) d.alcance[m.id] = "propio"; });
    return d;
  }
  function base(u) { return u.rolBase || { niveles: {}, alcance: {}, flags: {} }; }
  function iguales(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function sucio() {
    var u = usuario();
    if (!u || !P.draft) return false;
    if (!u.personalizado) return true;
    return !iguales(P.draft, draftDe(u));
  }
  /** Se guarda completo: cada módulo con su nivel y cada interruptor, así nada cae de vuelta al rol. */
  function diff(u, d) {
    var out = { niveles: {}, alcance: alcanceDe(d), flags: {} };
    (P.data.modulos || []).forEach(function (m) { out.niveles[m.id] = Number(d.niveles[m.id]) || 0; });
    (P.data.flags || []).forEach(function (f) { out.flags[f.id] = !!d.flags[f.id]; });
    return out;
  }

  function listaHtml() {
    var q = P.q.toLowerCase();
    var L = (P.data.usuarios || []).filter(function (u) { return !q || (u.nombre + " " + u.rolLabel + " " + (u.perfil || "")).toLowerCase().indexOf(q) >= 0; });
    return '<input type="search" id="mcu-q" placeholder="Buscar persona, rol o perfil" value="' + e(P.q) + '">' + L.map(function (u) {
      var tag = u.admin ? '<span class="mcu-tag a">Todo</span>' : u.personalizado ? '<span class="mcu-tag p">' + e(u.perfil || "Personalizado") + "</span>" : '<span class="mcu-tag">Según rol</span>';
      return '<button class="mcu-u' + (u.uid === P.sel ? " on" : "") + '" type="button" data-mcu-u="' + e(u.uid) + '"><span><b>' + e(u.nombre) + "</b><small>" + e(u.rolLabel) + (u.bloqueado ? " · bloqueada" : "") + "</small></span>" + tag + "</button>";
    }).join("");
  }

  function editorHtml(d, b, soloLectura) {
    var grupo = "";
    var filas = (P.data.modulos || []).map(function (m) {
      var g = m.grupo !== grupo ? '<tr class="mcu-g"><td colspan="3">' + e(m.grupo) + "</td></tr>" : "";
      grupo = m.grupo;
      var n = d.niveles[m.id] || 0;
      var seg = '<span class="mcu-seg">' + NIV.map(function (t, i) {
        var cls = (i === n ? "on" : "") + (i === n && n !== (b.niveles[m.id] || 0) ? " ch" : "");
        return '<button type="button" class="' + cls + '" data-mcu-n="' + e(m.id) + '" data-v="' + i + '"' + (i > m.max || soloLectura ? " disabled" : "") + ">" + e(t) + "</button>";
      }).join("") + "</span>";
      var alc = m.alcance && n > 0 ? '<span class="mcu-rol">' + e(quienCorto(d)) + "</span>" : "";
      var rol = '<div class="mcu-rol">Rol: ' + e(NIV[b.niveles[m.id] || 0]) + (m.alcance && b.alcance[m.id] ? " · " + (b.alcance[m.id] === "propio" ? "lo suyo" : "todo") : "") + "</div>";
      return g + "<tr><td><b>" + e(m.label) + "</b>" + rol + "</td><td>" + seg + "</td><td>" + alc + "</td></tr>";
    }).join("");
    var flags = (P.data.flags || []).map(function (f) {
      return '<label><input type="checkbox" data-mcu-f="' + e(f.id) + '"' + (d.flags[f.id] ? " checked" : "") + (soloLectura ? " disabled" : "") + "> " + e(f.label) + (!!d.flags[f.id] !== !!b.flags[f.id] ? ' <span class="mcu-tag p">cambiado</span>' : "") + "</label>";
    }).join("");
    return '<table class="mcu-t"><thead><tr><th>Módulo</th><th>Nivel</th><th>Datos de</th></tr></thead><tbody>' + filas + "</tbody></table>" +
      '<div class="mcu-card mcu-flags" style="box-shadow:none;padding:10px 0 0"><div class="card-title">Interruptores</div>' + flags + "</div>" +
      quienHtml(d, soloLectura);
  }
  function modo(d) { var L = d.personas || []; return L.indexOf("*") >= 0 ? "todos" : L.length || P.verLista ? "lista" : "ella"; }
  function quienCorto(d) {
    var m = modo(d);
    return m === "todos" ? "Todas las personas" : m === "lista" ? "Ella + " + d.personas.length : "Solo ella";
  }
  /** Selector «Datos de quién»: solo ella · ella y algunas personas · todas. Lo aplica el servidor. */
  function quienHtml(d, soloLectura) {
    var m = modo(d), dis = soloLectura ? " disabled" : "";
    var op = function (v, t) { return '<label><input type="radio" name="mcu-sc" data-mcu-sc="' + v + '"' + (m === v ? " checked" : "") + dis + "> " + t + "</label>"; };
    var equipo = (P.data.equipo || []).filter(function (x) { return x.uid !== P.sel; });
    var lista = m === "lista" ? '<div class="mcu-pp">' + equipo.map(function (x) {
      return '<label><input type="checkbox" data-mcu-pp="' + e(x.nombre) + '"' + ((d.personas || []).indexOf(x.nombre) >= 0 ? " checked" : "") + dis + "> " + e(x.nombre) + ' <small class="mcu-rol">' + e(x.rol) + "</small></label>";
    }).join("") + "</div>" : "";
    return '<div class="mcu-card mcu-flags" style="box-shadow:none;padding:10px 0 0"><div class="card-title">Datos de quién ve</div>' +
      '<p class="note" style="margin:0 0 4px">Comisiones, roles de pago, tickets, asistencia y paquetes: de quién puede ver datos.</p>' +
      op("ella", "Solo ella") + op("lista", "Ella y estas personas…") + op("todos", "Todas las personas") + lista + "</div>";
  }

  function fichaHtml() {
    var u = usuario();
    if (!u) return '<div class="mcu-card"><p class="note">Elige una persona de la lista.</p></div>';
    if (u.admin) return '<div class="mcu-card"><div class="mcu-h"><h3>' + e(u.nombre) + '</h3><span class="mcu-tag a">' + e(u.rolLabel) + '</span></div><p class="note">Admin y super admin siempre tienen todo (como en MineCore). Para quitarle algo, cámbiale el rol en Usuarios.</p></div>';
    var b = base(u);
    if (!u.personalizado && !P.draft) {
      return '<div class="mcu-card"><div class="mcu-h"><div><h3>' + e(u.nombre) + '</h3><div class="mcu-rol">' + e(u.rolLabel) + ' · Según su rol</div></div></div>' +
        '<p class="note">Hoy tiene lo de su rol (abajo, solo lectura). Al personalizar, <b>empieza todo apagado</b>: cada módulo en «Nada», cada interruptor apagado y solo ve sus propios datos; tú vas dando lo que necesita. Hasta que guardes, nada cambia para ella.</p>' +
        '<p><button class="btn" type="button" id="mcu-empezar">Personalizar (empieza todo apagado)</button></p>' +
        editorHtml(draftDe(u), b, true) + "</div>";
    }
    if (!P.draft) P.draft = draftDe(u);
    var d = P.draft;
    var perf = '<select id="mcu-perfil"><option value="">Aplicar un perfil…</option>' + (P.data.perfiles || []).map(function (p) { return '<option value="' + e(p.id) + '">' + e(p.nombre) + "</option>"; }).join("") + "</select>";
    var dirty = sucio();
    return '<div class="mcu-card"><div class="mcu-h"><div><h3>' + e(u.nombre) + '</h3><div class="mcu-rol">' + e(u.rolLabel) + " · " + (u.personalizado ? "Permisos propios" + (u.perfil ? " (" + e(u.perfil) + ")" : "") : "Según su rol") +
      (u.editadoPor ? " · editado por " + e(u.editadoPor) : "") + "</div></div><div>" + perf + "</div></div>" +
      '<div class="mcu-save" id="mcu-save"' + (dirty ? "" : " hidden") + '><span>Cambios sin guardar</span><input id="mcu-pnombre" placeholder="Nombre del perfil (opcional)" value="' + e(d.perfil || "") + '"><span style="display:flex;gap:6px"><button class="btn small" type="button" id="mcu-guardar">Guardar</button><button class="btn ghost small" type="button" id="mcu-descartar">Descartar</button><button class="btn ghost small" type="button" id="mcu-como-perfil">Guardar como perfil</button></span></div>' +
      '<p class="err" id="mcu-err"></p>' +
      (!u.personalizado ? '<p class="mcu-cero">Empieza todo apagado. Da solo lo que necesita y guarda.</p>' : "") +
      editorHtml(d, b, false) +
      (u.personalizado ? '<button class="btn ghost small" type="button" id="mcu-reset">Volver a lo de su rol</button>' : "") +
      '<p class="note">Empezar a personalizar = todo apagado y solo sus datos. Nada = no ve el módulo. Ver = solo mira. Crear / editar = trabaja en él. Aprobar / borrar = además anula, aprueba y borra. Lo marcado con raya dorada difiere de su rol. Cada cambio queda en el registro.</p></div>';
  }

  function perfilesHtml() {
    var L = P.data.perfiles || [];
    var sel = perfil(P.perfilSel);
    var lista = L.map(function (p) {
      return '<button class="mcu-u' + (p.id === P.perfilSel ? " on" : "") + '" type="button" data-mcu-p="' + e(p.id) + '"><span><b>' + e(p.nombre) + "</b><small>" + (p.sistema ? "Sale de la matriz del rol" : "Perfil propio") + "</small></span></button>";
    }).join("") + '<button class="btn small" type="button" id="mcu-p-nuevo" style="margin-top:8px">+ Nuevo perfil</button>';
    var ficha = '<div class="mcu-card"><p class="note">Elige un perfil. Los «Como …» salen de la matriz de roles y no se editan aquí.</p></div>';
    if (sel || P.perfilSel === "__nuevo") {
      if (!P.draft) P.draft = sel ? desdePerfil(sel, sel.nombre) : ceros();
      var b = sel || { niveles: {}, alcance: {}, flags: {} };
      var ro = !!(sel && sel.sistema);
      ficha = '<div class="mcu-card"><div class="mcu-h"><h3>' + e(sel ? sel.nombre : "Nuevo perfil") + "</h3></div>" +
        (ro ? "" : '<label>Nombre</label><input id="mcu-pf-nombre" value="' + e(P.draft.perfil || "") + '">') +
        editorHtml(P.draft, b, ro) +
        (ro ? "" : '<p class="err" id="mcu-err"></p><button class="btn" type="button" id="mcu-pf-guardar">Guardar perfil</button>') + "</div>";
    }
    return '<div class="mcu"><div class="mcu-list">' + lista + "</div><div>" + ficha + "</div></div>";
  }

  async function cargar() {
    var r = await api("uperm_list", {});
    if (!r || r.error) return r || { error: "Sin respuesta" };
    P.data = r;
    if (!P.sel || !usuario()) { var first = (r.usuarios || []).find(function (u) { return !u.admin; }); P.sel = first ? first.uid : ""; }
    return null;
  }

  function pinta(main) {
    var box = main.querySelector("#mcu-root");
    if (!box) return;
    var tabs = '<div class="mcu-tabs"><button type="button" data-mcu-tab="usuarios" class="' + (P.tab === "usuarios" ? "on" : "") + '">Personas</button><button type="button" data-mcu-tab="perfiles" class="' + (P.tab === "perfiles" ? "on" : "") + '">Perfiles</button></div>';
    box.innerHTML = tabs + (P.tab === "perfiles" ? perfilesHtml() : '<div class="mcu"><div class="mcu-list">' + listaHtml() + "</div><div>" + fichaHtml() + "</div></div>");
    wire(main);
  }

  function wire(main) {
    var root = main.querySelector("#mcu-root");
    if (!root) return;
    root.querySelectorAll("[data-mcu-tab]").forEach(function (b) { b.onclick = function () { if (sucio() && !confirm("Hay cambios sin guardar. ¿Descartarlos?")) return; P.tab = b.getAttribute("data-mcu-tab"); P.draft = null; pinta(main); }; });
    var q = root.querySelector("#mcu-q");
    if (q) q.oninput = function () { P.q = q.value; var l = root.querySelector(".mcu-list"); var pos = q.selectionStart; pinta(main); var q2 = main.querySelector("#mcu-q"); if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); } };
    root.querySelectorAll("[data-mcu-u]").forEach(function (b) { b.onclick = function () { if (sucio() && !confirm("Hay cambios sin guardar. ¿Descartarlos?")) return; P.sel = b.getAttribute("data-mcu-u"); P.draft = null; P.verLista = false; pinta(main); }; });
    root.querySelectorAll("[data-mcu-p]").forEach(function (b) { b.onclick = function () { P.perfilSel = b.getAttribute("data-mcu-p"); P.draft = null; pinta(main); }; });
    var pn = root.querySelector("#mcu-p-nuevo"); if (pn) pn.onclick = function () { P.perfilSel = "__nuevo"; P.draft = null; pinta(main); };
    root.querySelectorAll("[data-mcu-n]").forEach(function (b) {
      b.onclick = function () {
        var m = b.getAttribute("data-mcu-n"), v = Number(b.getAttribute("data-v"));
        P.draft.niveles[m] = v;
        var def = (P.data.modulos || []).find(function (x) { return x.id === m; });
        if (def && def.alcance && v > 0 && !P.draft.alcance[m]) P.draft.alcance[m] = "propio";
        if ((m === "comisiones" || m === "rol_pagos") && v > 0) P.draft.flags[m] = true;
        pinta(main);
      };
    });
    root.querySelectorAll("[data-mcu-a]").forEach(function (s) { s.onchange = function () { P.draft.alcance[s.getAttribute("data-mcu-a")] = s.value; pinta(main); }; });
    root.querySelectorAll("[data-mcu-f]").forEach(function (c) {
      c.onchange = function () {
        var f = c.getAttribute("data-mcu-f");
        P.draft.flags[f] = c.checked;
        if (c.checked && (f === "comisiones" || f === "rol_pagos") && !(P.draft.niveles[f] > 0)) P.draft.niveles[f] = 1;
        pinta(main);
      };
    });
    root.querySelectorAll("[data-mcu-sc]").forEach(function (r) {
      r.onchange = function () {
        var v = r.getAttribute("data-mcu-sc");
        P.verLista = v === "lista";
        P.draft.personas = v === "todos" ? ["*"] : v === "ella" ? [] : (P.draft.personas || []).filter(function (x) { return x !== "*"; });
        pinta(main);
      };
    });
    root.querySelectorAll("[data-mcu-pp]").forEach(function (c) {
      c.onchange = function () {
        var n = c.getAttribute("data-mcu-pp"), L = (P.draft.personas || []).filter(function (x) { return x !== "*" && x !== n; });
        if (c.checked) L.push(n);
        P.draft.personas = L; P.verLista = true;
        pinta(main);
      };
    });
    var emp = root.querySelector("#mcu-empezar");
    if (emp) emp.onclick = function () { P.draft = ceros(); P.verLista = false; pinta(main); };
    var ps = root.querySelector("#mcu-perfil");
    if (ps) ps.onchange = function () {
      var p = perfil(ps.value);
      if (!p) return;
      P.draft = desdePerfil(p, p.sistema ? "" : p.nombre);
      pinta(main);
    };
    var err = root.querySelector("#mcu-err");
    var g = root.querySelector("#mcu-guardar");
    if (g) g.onclick = async function () {
      var u = usuario();
      var dd = diff(u, P.draft);
      var nombre = (root.querySelector("#mcu-pnombre") || {}).value || "";
      g.disabled = true;
      var r = await api("uperm_guardar", { uid: u.uid, perfil: nombre.trim(), niveles: dd.niveles, alcance: dd.alcance, flags: dd.flags });
      g.disabled = false;
      if (!r || r.error) { if (err) err.textContent = (r && r.error) || "No se pudo guardar"; return; }
      P.draft = null;
      var e2 = await cargar();
      if (e2 && err) err.textContent = e2.error;
      pinta(main);
    };
    var dsc = root.querySelector("#mcu-descartar"); if (dsc) dsc.onclick = function () { P.draft = null; pinta(main); };
    var rs = root.querySelector("#mcu-reset");
    if (rs) rs.onclick = async function () {
      if (!confirm("¿Quitar los permisos propios y dejarla con lo de su rol?")) return;
      var r = await api("uperm_guardar", { uid: P.sel, perfil: "", niveles: {}, alcance: {}, flags: {} });
      if (!r || r.error) { if (err) err.textContent = (r && r.error) || "No se pudo"; return; }
      P.draft = null; await cargar(); pinta(main);
    };
    var cp = root.querySelector("#mcu-como-perfil");
    if (cp) cp.onclick = async function () {
      var nombre = ((root.querySelector("#mcu-pnombre") || {}).value || "").trim();
      if (nombre.length < 3) { if (err) err.textContent = "Escribe el nombre del perfil"; return; }
      var r = await api("uperm_perfil_guardar", { nombre: nombre, niveles: P.draft.niveles, alcance: alcanceDe(P.draft), flags: P.draft.flags });
      if (!r || r.error) { if (err) err.textContent = (r && r.error) || "No se pudo"; return; }
      var keep = P.draft; await cargar(); P.draft = keep; P.draft.perfil = nombre; pinta(main);
    };
    var pg = root.querySelector("#mcu-pf-guardar");
    if (pg) pg.onclick = async function () {
      var nombre = ((root.querySelector("#mcu-pf-nombre") || {}).value || "").trim();
      var r = await api("uperm_perfil_guardar", { id: P.perfilSel === "__nuevo" ? "" : P.perfilSel, nombre: nombre, niveles: P.draft.niveles, alcance: alcanceDe(P.draft), flags: P.draft.flags });
      if (!r || r.error) { if (err) err.textContent = (r && r.error) || "No se pudo"; return; }
      P.perfilSel = r.id; P.draft = null; await cargar(); pinta(main);
    };
    var nm = root.querySelector("#mcu-pf-nombre"); if (nm) nm.oninput = function () { P.draft.perfil = nm.value; };
  }

  window.MCPermisos = {
    render: async function () {
      css();
      if (!(typeof state !== "undefined" && state.admin)) return '<p class="err">Solo un admin ve y edita los permisos por persona.</p>';
      var er = await cargar();
      if (er) return '<p class="err">' + e(er.error) + "</p>";
      return '<p class="note">Encima del rol de cada persona, como en MineCore: lo que no cambies aquí sigue igual que hoy. La matriz por rol sigue en «Permisos por rol».</p><div id="mcu-root"></div>';
    },
    wire: function (main) { pinta(main); },
    dirty: sucio,
    _p: P,
  };
})();
