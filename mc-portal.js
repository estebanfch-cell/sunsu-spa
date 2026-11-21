// 📱 App Sunsu para clientas y proveedores (TK163 · Emilia 20/11, t741u–t745u).
// Pantalla de inicio: «Iniciar sesión» (usuario o correo + contraseña) y «Crear cuenta». El equipo sigue entrando
// igual (usuario/correo + contraseña; el PIN queda como acceso discreto mientras todas crean su usuario).
// Portal de clienta: inicio con recomendación/próxima cita y favoritos, agendar (Acuity, dentro de la app),
// historial, documentos por carpeta, paquetes y gift cards, mi perfil y eliminar cuenta.
// Portal de proveedor: ventas hoy/mes/año, stock en consignación, fotos, sugerir precio/descuento/beneficio,
// prepedido, órdenes de compra y actas. Todo sale del servidor ya filtrado (solo lo suyo).
(function () {
  "use strict";
  var TK = "sunsu.portal.token", PRIV = "https://app.sunsuspa.com/privacy.html", SOP = "https://app.sunsuspa.com/support.html";
  var P = { cuenta: null, tab: "inicio", data: null, ag: null };
  function e(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function app() { return $("app"); }
  function msg(t, bad) { if (typeof toast === "function") toast(t, bad ? "var(--red,#B87070)" : "var(--green,#7A9E8A)"); else alert(t); }
  function money(v) { return "$" + (Number(v) || 0).toFixed(2); }
  var MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  var MESL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function fd(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ""); return m ? (+m[3]) + " " + MES[+m[2] - 1] + " " + m[1] : (ymd || ""); }
  function fdl(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ""); return m ? (+m[3]) + " de " + MESL[+m[2] - 1] : (ymd || ""); }
  function apiUrl() { try { return API; } catch (x) { return "https://heuolwxyxoezkewyufrl.supabase.co/functions/v1/api"; } }
  async function papi(accion, body) {
    var payload = Object.assign({ accion: accion }, body || {});
    var tk = localStorage.getItem(TK); if (tk) payload.token = tk;
    try {
      var r = await fetch(apiUrl(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      var d = await r.json();
      if (d && d.auth_error && accion !== "portal_login") { localStorage.removeItem(TK); P.cuenta = null; }
      return d || {};
    } catch (x) { return { error: "No hay conexión. Inténtalo de nuevo." }; }
  }
  function css() {
    if ($("pt-css")) return;
    var s = document.createElement("style"); s.id = "pt-css";
    s.textContent = [
      ".pt-start .login-card{max-width:380px}.pt-big{display:block;width:100%;margin-top:8px}",
      ".pt-sep{display:flex;align-items:center;gap:8px;color:var(--gray);font-size:.72rem;margin:14px 0 6px}.pt-sep:before,.pt-sep:after{content:'';flex:1;height:1px;background:#e4e7ee}",
      ".pt-pin{background:none;border:0;color:var(--gray);font:inherit;font-size:.7rem;text-decoration:underline;cursor:pointer;padding:4px}",
      ".pt-f label{display:block;font-size:.72rem;color:var(--gray);margin:8px 0 2px}.pt-f input,.pt-f select,.pt-f textarea{width:100%;box-sizing:border-box}",
      ".pt-chk{display:flex!important;gap:6px;align-items:flex-start;font-size:.72rem!important;color:var(--text)!important;margin-top:10px!important;text-transform:none!important;letter-spacing:0!important;font-weight:400!important}.pt-chk input{width:auto!important;margin-top:2px}",
      ".pt-shell{max-width:640px;margin:0 auto;padding:10px 12px 86px;font-size:.86rem}",
      ".pt-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 2px 10px}.pt-hd img{height:26px}.pt-hd b{color:var(--navy);font-size:.95rem}.pt-hd small{color:var(--gray);font-size:.72rem}",
      ".pt-card{background:#fff;border-radius:12px;padding:10px 12px;margin:0 0 8px;box-shadow:0 1px 3px rgba(0,0,0,.07)}.pt-card h3{margin:0 0 6px;font-size:.86rem;color:var(--navy-d,#3D5A7A)}",
      ".pt-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-top:1px solid #f0f1f4}.pt-row:first-of-type{border-top:0}.pt-row small{color:var(--gray);font-size:.72rem}",
      ".pt-alert{background:var(--gold-l,#FBF3E3);border:1px solid var(--gold-m,#E8C07A);border-radius:12px;padding:10px 12px;margin:0 0 8px}.pt-alert p{margin:0 0 8px}",
      ".pt-ok{background:var(--green-l,#EDF5F1);border-color:#b9d5c6}",
      ".pt-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.pt-kpi{background:var(--blue-ll,#F5F8FC);border-radius:10px;padding:8px;text-align:center}.pt-kpi b{display:block;font-size:1rem;color:var(--navy-d,#3D5A7A)}.pt-kpi small{font-size:.68rem;color:var(--gray)}",
      ".pt-tabs{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #e6e8ee;display:flex;justify-content:space-around;padding:6px 4px calc(6px + env(safe-area-inset-bottom));z-index:50}",
      ".pt-tabs button{flex:1;background:none;border:0;font:inherit;font-size:.64rem;color:var(--gray);display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;padding:2px}.pt-tabs button span{font-size:1.15rem}.pt-tabs button.on{color:var(--navy);font-weight:700}",
      ".pt-pill{display:inline-block;font-size:.66rem;padding:1px 7px;border-radius:999px;background:var(--blue-l,#EEF3FA);color:var(--navy-d,#3D5A7A)}.pt-pill.g{background:var(--green-l);color:#4f7a63}.pt-pill.w{background:var(--gold-l);color:#946c22}.pt-pill.r{background:var(--red-l);color:#8f4f4f}",
      ".pt-btn{border:0;border-radius:999px;padding:7px 14px;background:var(--navy);color:#fff;font:inherit;font-size:.78rem;font-weight:600;cursor:pointer}.pt-btn.ghost{background:var(--blue-l,#EEF3FA);color:var(--navy-d,#3D5A7A)}.pt-btn.sm{padding:4px 10px;font-size:.72rem}.pt-btn.red{background:var(--red-l);color:#8f4f4f}",
      ".pt-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}",
      ".pt-chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.pt-chip{border:1px solid #dfe4ec;background:#fff;border-radius:999px;padding:5px 10px;font:inherit;font-size:.74rem;cursor:pointer}.pt-chip.on{background:var(--navy);color:#fff;border-color:var(--navy)}.pt-chip[disabled]{opacity:.35;cursor:default}",
      ".pt-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center;font-size:.74rem}.pt-cal i{font-style:normal;color:var(--gray);font-size:.64rem}",
      ".pt-folder{border:1px solid #eef0f4;border-radius:10px;margin:6px 0}.pt-folder summary{padding:8px 10px;cursor:pointer;font-weight:600;color:var(--navy-d,#3D5A7A);list-style:none}.pt-folder summary small{color:var(--gray);font-weight:400}.pt-folder>div{padding:0 10px 6px}",
      ".pt-prod{display:flex;gap:10px;align-items:center}.pt-prod img{width:46px;height:46px;object-fit:cover;border-radius:8px;background:#f3f4f7}.pt-prod .ph{width:46px;height:46px;border-radius:8px;background:#f3f4f7;display:flex;align-items:center;justify-content:center}",
      ".pt-muted{color:var(--gray);font-size:.74rem}.pt-dlg{position:fixed;inset:0;background:rgba(20,30,45,.45);display:flex;align-items:flex-end;justify-content:center;z-index:80}.pt-dlg>div{background:#fff;border-radius:16px 16px 0 0;width:100%;max-width:520px;max-height:88vh;overflow:auto;padding:14px 14px calc(16px + env(safe-area-inset-bottom))}",
      ".pt-dlg h3{margin:0 0 8px;color:var(--navy-d,#3D5A7A);font-size:.95rem}.pt-legal{text-align:center;font-size:.72rem;margin:10px 0}.pt-legal a{color:var(--gray);font-weight:600;text-decoration:none;margin:0 6px}",
    ].join("\n");
    document.head.appendChild(s);
  }
  function logo() { return '<div class="login-logo"><img src="assets/sunsu-logo-celeste.png" alt="Sunsu"></div>'; }
  function legal() { return '<p class="lg-legal"><a href="' + PRIV + '" target="_blank" rel="noopener">Privacidad</a> · <a href="' + SOP + '" target="_blank" rel="noopener">Soporte</a></p>'; }
  function ver(btnId, inputId) { var b = $(btnId); if (b) b.onclick = function () { var i = $(inputId); i.type = i.type === "password" ? "text" : "password"; }; }

  // ───────── Inicio: Iniciar sesión / Crear cuenta ─────────
  function paintInicio(m) {
    css();
    try { if (window._tkCacheLimpiar) window._tkCacheLimpiar(); } catch (x) {}
    document.body.classList.remove("app-on", "kb-open");
    app().innerHTML = '<main class="login pt-start">' + logo() +
      '<form class="login-card pt-f" id="pt-login"><h2>Iniciar sesión</h2>' +
      '<label for="pt-u">Usuario o correo</label><input id="pt-u" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="160" required>' +
      '<label for="pt-p">Contraseña</label><div class="lg-passw"><input id="pt-p" name="password" type="password" autocomplete="current-password" maxlength="128" required><button type="button" class="btn ghost sm" id="pt-ver" aria-label="Mostrar contraseña">👁</button></div>' +
      '<p class="err" id="pt-err">' + e(m || "") + '</p><button class="btn wide" id="pt-go" type="submit">Entrar</button>' +
      '<p class="lg-olvido"><button type="button" id="pt-olv">¿Olvidaste tu contraseña?</button></p>' +
      '<div class="pt-sep">¿Primera vez?</div><button type="button" class="btn ghost wide pt-big" id="pt-crear">Crear cuenta</button>' +
      '<p class="lg-olvido"><button type="button" class="pt-pin" id="pt-pin">Personal Sunsu: entrar con PIN</button></p>' +
      "</form>" + legal() + "</main>";
    ver("pt-ver", "pt-p");
    $("pt-crear").onclick = function () { paintCrear("cliente"); };
    $("pt-pin").onclick = function () { if (typeof window.paintLoginPin === "function") window.paintLoginPin(); };
    $("pt-olv").onclick = function () { paintOlvido(); };
    $("pt-u").focus();
    $("pt-login").onsubmit = async function (ev) {
      ev.preventDefault();
      var u = $("pt-u").value.trim().toLowerCase(), pw = $("pt-p").value, b = $("pt-go");
      b.disabled = true;
      var d = typeof api === "function" ? await api("login_pass", { usuario: u, password: pw }) : await papi("login_pass", { usuario: u, password: pw });
      b.disabled = false;
      if (d && d.verificar) { paintVerificar(d.email || u, ""); return; }
      if (!d || !d.ok || !d.token) { $("pt-err").textContent = (d && d.error) || "Usuario o contraseña incorrectos"; return; }
      if (d.portal) { localStorage.setItem(TK, d.token); P.cuenta = d.cuenta; P.tab = "inicio"; paint(); return; }
      if (typeof window.sunsuEntrarEquipo === "function") window.sunsuEntrarEquipo(d);
    };
  }
  function paintOlvido() {
    app().innerHTML = '<main class="login">' + logo() + '<form class="login-card pt-f" id="pt-of"><h2>Recuperar contraseña</h2><p class="lede">Escribe tu correo (o tu usuario si eres del equipo). Te enviamos un enlace para elegir una nueva.</p>' +
      '<label for="pt-oe">Correo o usuario</label><input id="pt-oe" autocapitalize="none" spellcheck="false" required><p class="err" id="pt-oerr"></p><button class="btn wide" type="submit">Enviar</button>' +
      '<p class="lg-olvido"><button type="button" id="pt-ov">Volver</button></p></form></main>';
    $("pt-ov").onclick = function () { paintInicio(); };
    $("pt-of").onsubmit = async function (ev) {
      ev.preventDefault();
      var q = $("pt-oe").value.trim().toLowerCase();
      var a = await papi("portal_reset_pedir", { email: q });
      if (typeof api === "function") await api("reset_pedir", q.indexOf("@") > 0 ? { email: q } : { usuario: q });
      $("pt-oerr").textContent = ""; msg((a && a.mensaje) || "Si está registrado, te enviamos las instrucciones.");
      paintInicio("Revisa tu correo: si la cuenta existe, te llegó un enlace.");
    };
  }
  function paintCrear(tipo) {
    css();
    var cli = tipo !== "proveedor";
    app().innerHTML = '<main class="login pt-start">' + logo() + '<form class="login-card pt-f" id="pt-cf" novalidate>' +
      '<div class="lg-tabs" role="tablist"><button type="button" class="lg-tab' + (cli ? " on" : "") + '" data-t="cliente">Soy clienta</button><button type="button" class="lg-tab' + (cli ? "" : " on") + '" data-t="proveedor">Soy proveedor</button></div>' +
      "<h2>Crear cuenta</h2>" +
      (cli ? '<label for="c-n">Nombre completo</label><input id="c-n" autocomplete="name" maxlength="120" required>' +
        '<label for="c-tipo">Tipo de documento</label><select id="c-tipo"><option value="cedula" selected>Cédula</option><option value="ruc">RUC</option><option value="pasaporte">Pasaporte</option><option value="otro">Otro (documento de identidad extranjero)</option></select>' +
        '<label for="c-c">Identificación</label><input id="c-c" autocomplete="off" maxlength="30" required>' +
        '<p class="pt-muted" id="c-ident-hint" hidden></p>'
        : '<label for="c-n">Nombre o razón social</label><input id="c-n" autocomplete="organization" maxlength="120" required>' +
        '<label for="c-tipo">Tipo de documento</label><select id="c-tipo"><option value="ruc" selected>RUC</option><option value="cedula">Cédula</option><option value="pasaporte">Pasaporte</option><option value="otro">Otro (documento de identidad extranjero)</option></select>' +
        '<label for="c-c">Identificación</label><input id="c-c" maxlength="30" required>' +
        '<p class="pt-muted" id="c-ident-hint" hidden></p>') +
      '<label for="c-e">Correo</label><input id="c-e" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="160" required>' +
      '<label for="c-t">Teléfono</label><input id="c-t" type="tel" autocomplete="tel" maxlength="20" required>' +
      (cli ? '<label for="c-b">Fecha de nacimiento (opcional)</label><input id="c-b" type="date">' : "") +
      '<label for="c-p">Contraseña</label><div class="lg-passw"><input id="c-p" type="password" autocomplete="new-password" maxlength="128" required><button type="button" class="btn ghost sm" id="c-ver">👁</button></div>' +
      '<p class="pt-muted">Mínimo 8 caracteres, con letras y números.</p>' +
      '<label class="pt-chk"><input type="checkbox" id="c-a"> <span>Acepto la <a href="' + PRIV + '" target="_blank" rel="noopener">política de privacidad</a>. ' + (cli ? "Si ya soy clienta, mi cuenta se une a mi ficha de Sunsu." : "Si ya soy proveedor de Sunsu, mi cuenta se une a mi ficha.") + "</span></label>" +
      '<p class="err" id="c-err"></p><button class="btn wide" id="c-go" type="submit">Crear cuenta</button>' +
      '<p class="lg-olvido"><button type="button" id="c-v">Ya tengo cuenta</button></p></form>' + legal() + "</main>";
    document.querySelectorAll(".lg-tab").forEach(function (b) { b.onclick = function () { paintCrear(b.dataset.t); }; });
    ver("c-ver", "c-p");
    $("c-v").onclick = function () { paintInicio(); };
    $("pt-cf").onsubmit = async function (ev) {
      ev.preventDefault();
      var body = { nombre: $("c-n").value.trim(), email: $("c-e").value.trim().toLowerCase(), telefono: $("c-t").value.trim(), password: $("c-p").value, password2: $("c-p").value, acepta: $("c-a").checked };
      if (cli) { body.cedula = $("c-c").value.trim(); body.tipo_identificacion = ($("c-tipo")&&$("c-tipo").value)||"cedula"; body.nacimiento = $("c-b").value || ""; } else { body.ruc = $("c-c").value.trim(); body.tipo_identificacion = ($("c-tipo")&&$("c-tipo").value)||"ruc"; }
      if (!body.acepta) { $("c-err").textContent = "Acepta la política de privacidad para continuar"; return; }
      var b = $("c-go"); b.disabled = true;
      var d = await papi(cli ? "portal_signup_cliente" : "portal_signup_proveedor", body);
      b.disabled = false;
      if (!d.ok) { $("c-err").textContent = d.error || "No se pudo crear la cuenta"; return; }
      if (d.verificar) { paintVerificar(d.email, d.mensaje); return; }
      if (d.estado === "activa") { var lg = await papi("portal_login", { email: body.email, password: body.password }); if (lg.ok) { localStorage.setItem(TK, lg.token); P.cuenta = lg.cuenta; P.tab = "inicio"; paint(); return; } }
      paintInicio(d.mensaje || "Cuenta creada.");
    };
  }
  function paintVerificar(email, m) {
    app().innerHTML = '<main class="login">' + logo() + '<form class="login-card pt-f" id="pt-vf"><h2>Confirma tu correo</h2><p class="lede">' + e(m || "Te enviamos un código de 6 dígitos a") + " <b>" + e(email) + "</b></p>" +
      '<label for="pt-vc">Código</label><input id="pt-vc" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required><p class="err" id="pt-verr"></p>' +
      '<button class="btn wide" type="submit">Confirmar</button><p class="lg-olvido"><button type="button" id="pt-vr">Enviar otro código</button> · <button type="button" id="pt-vv">Volver</button></p></form></main>';
    $("pt-vv").onclick = function () { paintInicio(); };
    $("pt-vr").onclick = async function () { var d = await papi("portal_reenviar", { email: email }); msg(d.mensaje || "Listo"); };
    $("pt-vf").onsubmit = async function (ev) {
      ev.preventDefault();
      var d = await papi("portal_verificar", { email: email, codigo: $("pt-vc").value });
      if (!d.ok) { $("pt-verr").textContent = d.error || "Código incorrecto"; return; }
      if (d.token) { localStorage.setItem(TK, d.token); P.cuenta = d.cuenta; paint(); return; }
      paintInicio(d.mensaje);
    };
  }
  async function paintClave(token) {
    css();
    var v = await papi("portal_clave_validar", { token: token });
    app().innerHTML = '<main class="login">' + logo() + '<form class="login-card pt-f" id="pt-kf"><h2>' + (v.invitacion ? "Bienvenido a Sunsu" : "Nueva contraseña") + "</h2>" +
      (v.ok ? '<p class="lede">' + (v.invitacion ? "Crea tu contraseña para entrar como " : "Cuenta: ") + "<b>" + e(v.email) + '</b></p><label for="pt-k1">Contraseña</label><input id="pt-k1" type="password" autocomplete="new-password" required><label for="pt-k2">Repítela</label><input id="pt-k2" type="password" autocomplete="new-password" required><p class="pt-muted">Mínimo 8 caracteres, con letras y números.</p><p class="err" id="pt-kerr"></p><button class="btn wide" type="submit">Guardar y entrar</button>'
        : '<p class="err">' + e(v.error || "Enlace no válido") + "</p>") + '<p class="lg-olvido"><button type="button" id="pt-kv">Volver</button></p></form></main>';
    $("pt-kv").onclick = function () { history.replaceState({}, "", location.pathname); paintInicio(); };
    if (v.ok) $("pt-kf").onsubmit = async function (ev) {
      ev.preventDefault();
      var d = await papi("portal_clave_aplicar", { token: token, password: $("pt-k1").value, password2: $("pt-k2").value });
      if (!d.ok) { $("pt-kerr").textContent = d.error || "No se pudo guardar"; return; }
      history.replaceState({}, "", location.pathname);
      localStorage.setItem(TK, d.token); P.cuenta = d.cuenta; paint();
    };
  }

  // ───────── Portal ─────────
  var TABS_C = [["inicio", "🏠", "Inicio"], ["agendar", "📅", "Agendar"], ["historial", "🧴", "Historial"], ["docs", "📁", "Documentos"], ["perfil", "👤", "Perfil"]];
  var TABS_P = [["inicio", "📊", "Resumen"], ["productos", "📦", "Productos"], ["pedidos", "🧾", "Pedidos"], ["actas", "📝", "Actas"], ["perfil", "👤", "Cuenta"]];
  async function paint() {
    css();
    document.body.classList.remove("app-on");
    if (!localStorage.getItem(TK)) { paintInicio(); return; }
    if (!P.cuenta) { var me = await papi("portal_me"); if (!me.ok) { localStorage.removeItem(TK); paintInicio(me.error === "Inicia sesión" ? "" : me.error); return; } P.cuenta = me.cuenta; }
    var cli = P.cuenta.tipo === "cliente";
    var tabs = cli ? TABS_C : TABS_P;
    app().innerHTML = '<div class="pt-shell"><div class="pt-hd"><img src="assets/sunsu-logo-celeste.png" alt="Sunsu"><div style="text-align:right"><b>' + e((P.cuenta.nombre || "").split(" ")[0]) + "</b><br><small>" + e(cli ? (P.cuenta.codigo || "Clienta") : ("Proveedor " + (P.cuenta.proveedor || ""))) + '</small></div></div><div id="pt-body"><p class="pt-muted">Cargando…</p></div></div>' +
      '<nav class="pt-tabs">' + tabs.map(function (t) { return '<button type="button" data-tab="' + t[0] + '" class="' + (P.tab === t[0] ? "on" : "") + '"><span>' + t[1] + "</span>" + t[2] + "</button>"; }).join("") + "</nav>";
    document.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { P.tab = b.dataset.tab; paint(); }; });
    if (!P.data) { var d = await papi(cli ? "portal_cliente" : "portal_proveedor"); if (!d.ok) { $("pt-body").innerHTML = '<div class="pt-card"><p class="err">' + e(d.error || "No se pudo cargar") + "</p></div>"; if (d.auth_error) paintInicio(); return; } P.data = d; }
    var body = $("pt-body");
    if (cli) {
      if (P.tab === "inicio") return cliInicio(body);
      if (P.tab === "agendar") return cliAgendar(body);
      if (P.tab === "historial") return cliHistorial(body);
      if (P.tab === "docs") return cliDocs(body);
      return cuentaTab(body, true);
    }
    if (P.tab === "inicio") return provResumen(body);
    if (P.tab === "productos") return provProductos(body);
    if (P.tab === "pedidos") return provPedidos(body);
    if (P.tab === "actas") return provActas(body);
    return cuentaTab(body, false);
  }
  function irA(tab, pre) { P.tab = tab; if (pre) P.pre = pre; paint(); window.scrollTo(0, 0); }

  // Clienta · Inicio
  async function cliInicio(body) {
    var d = P.data, f = d.favoritos || {}, h = "";
    if (!P.ag) { P.ag = await papi("portal_ag_meta"); }
    var citas = (P.ag && P.ag.citas) || [];
    if (citas.length) {
      var c = citas[0];
      h += '<div class="pt-alert pt-ok"><p>📅 Tu próxima cita: <b>' + e(fdl(c.fecha)) + " · " + e(c.hora) + "</b><br>" + e(c.tipo) + (c.calendario ? " con " + e(c.calendario) : "") + '</p><button class="pt-btn sm ghost" data-go="agendar">Ver mis citas</button></div>';
    } else if (d.recomendacion) {
      var r = d.recomendacion;
      h += '<div class="pt-alert"><p>✨ Tu cosmetóloga <b>' + e(r.cosmetologa || "de Sunsu") + "</b> te recomendó volver el <b>" + e(fdl(r.fecha)) + "</b>" + (r.tratamiento ? " para <b>" + e(r.tratamiento) + "</b>" : "") + '. ¿Quieres agendar?</p><button class="pt-btn sm" id="pt-rec">Agendar ahora</button></div>';
    }
    h += '<div class="pt-card"><h3>Hola, ' + e(((d.perfil || {}).nombres || P.cuenta.nombre || "").split(" ")[0]) + " 👋</h3>" +
      '<div class="pt-kpis"><div class="pt-kpi"><b>' + (f.visitas || 0) + '</b><small>visitas</small></div><div class="pt-kpi"><b>' + (f.ultima ? e(fd(f.ultima)) : "—") + '</b><small>última visita</small></div><div class="pt-kpi"><b>' + (f.cadaDias ? "cada " + f.cadaDias + " d" : "—") + '</b><small>frecuencia</small></div></div>' +
      '<div class="pt-acts"><button class="pt-btn" data-go="agendar">📅 Agendar cita</button></div></div>';
    if (f.facial || f.producto) {
      h += '<div class="pt-card"><h3>Mis favoritos</h3>';
      if (f.facial) h += '<div class="pt-row"><div>💆‍♀️ <b>' + e(f.facial.nombre) + "</b><br><small>Tu tratamiento más hecho · " + f.facial.veces + ' veces</small></div><button class="pt-btn sm" data-trat="' + e(f.facial.nombre) + '">Agendar</button></div>';
      if (f.producto) h += '<div class="pt-row"><div class="pt-prod">' + (f.producto.foto ? '<img src="' + e(f.producto.foto) + '" alt="">' : '<div class="ph">🧴</div>') + "<div><b>" + e(f.producto.nombre) + "</b><br><small>Tu producto favorito" + (f.producto.pvp ? " · " + money(f.producto.pvp) : "") + '</small></div></div><button class="pt-btn sm ghost" id="pt-vp">Ver producto</button></div>';
      h += "</div>";
    }
    var paqs = (d.paquetes || []).filter(function (p) { return p.pendientes > 0; });
    var gcs = (d.giftcards || []);
    h += '<div class="pt-card"><h3>Paquetes</h3>' + ((d.paquetes || []).length ? (d.paquetes || []).map(function (p) {
      return '<div class="pt-row"><div><b>' + e(p.nombre) + "</b><br><small>Comprado " + e(fd(p.compra)) + " · " + p.usados + " de " + p.total + ' sesiones usadas</small></div><span class="pt-pill ' + (p.pendientes > 0 ? "g" : "") + '">' + (p.pendientes > 0 ? "Te quedan " + p.pendientes : "Completo") + "</span></div>";
    }).join("") : '<p class="pt-muted">No tienes paquetes.</p>') + (paqs.length ? '<div class="pt-acts"><button class="pt-btn sm" data-go="agendar">Usar una sesión</button></div>' : "") + "</div>";
    h += '<div class="pt-card"><h3>Gift cards</h3>' + (gcs.length ? gcs.map(function (g, i) {
      var est = g.usado ? '<span class="pt-pill">Usada' + (g.fechaUso ? " " + e(fd(g.fechaUso)) : "") + "</span>" : g.saldo != null ? '<span class="pt-pill g">Saldo ' + money(g.saldo) + "</span>" : '<span class="pt-pill g">Disponible</span>';
      return '<div class="pt-row"><div><b>' + e(g.codigo) + "</b> · " + e(g.valor) + "<br><small>" + (g.fecha ? e(fd(g.fecha)) : "") + (g.para ? " · para " + e(g.para) : "") + "</small></div><div style=\"text-align:right\">" + est + '<br><button class="pt-btn sm ghost" data-gc="' + i + '" style="margin-top:4px">⬇ Gift card</button></div></div>';
    }).join("") : '<p class="pt-muted">No tienes gift cards.</p>') + "</div>";
    body.innerHTML = h;
    body.querySelectorAll("[data-go]").forEach(function (b) { b.onclick = function () { irA(b.dataset.go); }; });
    body.querySelectorAll("[data-trat]").forEach(function (b) { b.onclick = function () { irA("agendar", { trat: b.dataset.trat }); }; });
    var rb = $("pt-rec"); if (rb) rb.onclick = function () { irA("agendar", { trat: d.recomendacion.tratamiento, fecha: d.recomendacion.fecha }); };
    var vp = $("pt-vp"); if (vp) vp.onclick = function () { var p = f.producto; dlg("<h3>" + e(p.nombre) + "</h3>" + (p.foto ? '<img src="' + e(p.foto) + '" alt="" style="width:100%;max-height:260px;object-fit:contain;border-radius:10px;background:#f7f8fa">' : "") + (p.descripcion ? "<p>" + e(p.descripcion) + "</p>" : "") + (p.pvp ? "<p><b>" + money(p.pvp) + "</b> · precio en Sunsu</p>" : "") + '<p class="pt-muted">Lo compraste ' + p.unidades + ' vez/veces. Pídelo en tu próxima visita.</p><div class="pt-acts"><button class="pt-btn" data-x2>📅 Agendar y pedirlo</button></div>', function (box) { box.querySelector("[data-x2]").onclick = function () { box.remove(); irA("agendar", { nota: "Quiero llevar " + p.nombre }); }; }); };
    body.querySelectorAll("[data-gc]").forEach(function (b) { b.onclick = function () { bajarGift(gcs[+b.dataset.gc]); }; });
  }
  async function bajarGift(g) {
    if (g.docId) { var r = await papi("portal_doc", { id: g.docId, descargar: true }); if (r.ok && r.url) { window.open(r.url, "_blank"); return; } }
    try {
      if (!window.MCGiftCards || !window.MCGiftCards.pdf) throw new Error("x");
      var x = await window.MCGiftCards.pdf({ codigo: g.codigo, valor: g.valor, servicio: g.valor, para: g.para, de: g.comprador, comprador: g.comprador, mensaje: g.mensaje, fecha: g.fecha });
      var u = URL.createObjectURL(x.blob), a = document.createElement("a"); a.href = u; a.download = x.nombre || ("GiftCard_" + g.codigo + ".pdf"); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    } catch (x2) { msg("No se pudo armar la gift card. Escríbenos y te la enviamos.", 1); }
  }

  // Clienta · Agendar (Acuity dentro de la app)
  async function cliAgendar(body) {
    if (!P.ag) P.ag = await papi("portal_ag_meta");
    var A = P.ag || {};
    if (!A.ok) { body.innerHTML = '<div class="pt-card"><p class="err">' + e(A.error || "La agenda no está disponible") + "</p></div>"; return; }
    if (!A.nativo) { body.innerHTML = '<div class="pt-card"><h3>Agendar cita</h3><p>Agenda tu cita en línea.</p><button class="pt-btn" id="pt-ext">📅 Abrir agenda</button></div>'; $("pt-ext").onclick = function () { window.open(A.url, "_blank"); }; return; }
    var pre = P.pre || {}; P.pre = null;
    var S = P.sel || (P.sel = { tipo: null, cal: "", mes: "", fecha: "", hora: null, nota: "" });
    if (pre.nota) S.nota = pre.nota;
    if (pre.trat && !S.tipo) { var t0 = matchTipo(A.tipos, pre.trat); if (t0) S.tipo = t0.id; }
    if (pre.fecha) { S.mes = pre.fecha.slice(0, 7) < A.hoy.slice(0, 7) ? A.hoy.slice(0, 7) : pre.fecha.slice(0, 7); }
    if (!S.mes) S.mes = A.hoy.slice(0, 7);
    var h = "";
    if ((A.citas || []).length) h += '<div class="pt-card"><h3>Mis próximas citas</h3>' + A.citas.map(function (c) { return '<div class="pt-row"><div><b>' + e(fdl(c.fecha)) + " · " + e(c.hora) + "</b><br><small>" + e(c.tipo) + (c.calendario ? " · " + e(c.calendario) : "") + "</small></div>" + (c.puedeCancelar ? '<button class="pt-btn sm red" data-cx="' + e(c.id) + '">Cancelar</button>' : "") + "</div>"; }).join("") + "</div>";
    var cats = {};
    (A.tipos || []).forEach(function (t) { var k = t.categoria || "Tratamientos"; (cats[k] = cats[k] || []).push(t); });
    h += '<div class="pt-card pt-f"><h3>Agendar cita</h3><label for="ag-t">Tratamiento</label><select id="ag-t"><option value="">Elige…</option>' + Object.keys(cats).map(function (k) { return '<optgroup label="' + e(k) + '">' + cats[k].map(function (t) { return '<option value="' + t.id + '"' + (String(S.tipo) === String(t.id) ? " selected" : "") + ">" + e(t.nombre) + (t.duracion ? " · " + t.duracion + " min" : "") + (t.precio && Number(t.precio) > 0 ? " · $" + e(t.precio) : "") + "</option>"; }).join("") + "</optgroup>"; }).join("") + "</select>";
    var tSel = (A.tipos || []).filter(function (t) { return String(t.id) === String(S.tipo); })[0];
    var cals = (A.calendarios || []).filter(function (c) { return !tSel || !(tSel.calendarIDs || []).length || tSel.calendarIDs.indexOf(c.id) >= 0; });
    h += '<label for="ag-c">Cosmetóloga</label><select id="ag-c"><option value="">Cualquiera</option>' + cals.map(function (c) { return '<option value="' + c.id + '"' + (String(S.cal) === String(c.id) ? " selected" : "") + ">" + e(c.nombre) + "</option>"; }).join("") + "</select>" +
      '<div id="ag-cal"></div><div id="ag-hrs"></div><label for="ag-n">Nota (opcional)</label><input id="ag-n" maxlength="300" value="' + e(S.nota) + '"><p class="err" id="ag-err"></p><button class="pt-btn" id="ag-ok" disabled>Confirmar cita</button></div>';
    body.innerHTML = h;
    body.querySelectorAll("[data-cx]").forEach(function (b) { b.onclick = async function () { if (!confirm("¿Cancelar esta cita?")) return; var r = await papi("portal_ag_cancelar", { id: b.dataset.cx }); if (!r.ok) { msg(r.error || "No se pudo cancelar", 1); return; } msg("Cita cancelada"); P.ag = null; paint(); }; });
    $("ag-t").onchange = function () { S.tipo = this.value; S.fecha = ""; S.hora = null; paint(); };
    $("ag-c").onchange = function () { S.cal = this.value; S.fecha = ""; S.hora = null; paint(); };
    $("ag-n").oninput = function () { S.nota = this.value; };
    if (S.tipo) pintarMes(A, S, pre.fecha);
    $("ag-ok").onclick = async function () {
      if (!S.hora) return;
      var b = this; b.disabled = true;
      var r = await papi("portal_ag_reservar", { tipoID: S.tipo, datetime: S.hora.time, calendarID: S.hora.calendarID || S.cal || "", nota: S.nota });
      b.disabled = false;
      if (!r.ok) { $("ag-err").textContent = r.error || "No se pudo agendar"; return; }
      P.sel = null; P.ag = null;
      dlg("<h3>¡Cita agendada! ✨</h3><p><b>" + e(fdl(r.cita.fecha)) + " · " + e(r.cita.hora) + "</b><br>" + e(r.cita.tipo) + (r.cita.calendario ? " con " + e(r.cita.calendario) : "") + '</p><p class="pt-muted">Te llegará la confirmación por correo.</p>');
      paint();
    };
  }
  function matchTipo(tipos, txt) {
    var n = function (x) { return String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); };
    var q = n(txt).replace(/facial|tratamiento/g, "").trim(); if (!q) return null;
    var w = q.split(/\s+/).filter(function (x) { return x.length > 2; });
    var best = null, bs = 0;
    (tipos || []).forEach(function (t) { var tn = n(t.nombre), sc = w.filter(function (x) { return tn.indexOf(x) >= 0; }).length; if (sc > bs) { bs = sc; best = t; } });
    return best;
  }
  async function pintarMes(A, S, fechaPre) {
    var box = $("ag-cal"); if (!box) return;
    box.innerHTML = '<p class="pt-muted">Buscando fechas…</p>';
    var r = await papi("portal_ag_fechas", { tipoID: S.tipo, calendarID: S.cal, mes: S.mes });
    if (!$("ag-cal")) return;
    var libres = (r && r.fechas) || [];
    if (fechaPre && !S.fecha) { var cerca = libres.filter(function (f) { return f >= fechaPre; })[0]; if (cerca) S.fecha = cerca; }
    var y = +S.mes.slice(0, 4), m = +S.mes.slice(5, 7), first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7, dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0 6px"><button class="pt-btn sm ghost" id="ag-prev"' + (S.mes <= A.hoy.slice(0, 7) ? " disabled" : "") + '>‹</button><b>' + MESL[m - 1] + " " + y + '</b><button class="pt-btn sm ghost" id="ag-next">›</button></div><div class="pt-cal">' + ["L", "M", "M", "J", "V", "S", "D"].map(function (x) { return "<i>" + x + "</i>"; }).join("");
    for (var i = 0; i < first; i++) h += "<span></span>";
    for (var d = 1; d <= dias; d++) { var ymd = S.mes + "-" + (d < 10 ? "0" : "") + d, ok = libres.indexOf(ymd) >= 0; h += '<button type="button" class="pt-chip' + (S.fecha === ymd ? " on" : "") + '" data-f="' + ymd + '"' + (ok ? "" : " disabled") + ">" + d + "</button>"; }
    h += "</div>" + (r && r.error ? '<p class="err">' + e(r.error) + "</p>" : !libres.length ? '<p class="pt-muted">No hay horarios este mes. Prueba el siguiente.</p>' : "");
    box.innerHTML = h;
    var mv = function (k) { var dt = new Date(Date.UTC(y, m - 1 + k, 1)); S.mes = dt.toISOString().slice(0, 7); S.fecha = ""; S.hora = null; pintarMes(A, S); $("ag-hrs").innerHTML = ""; };
    $("ag-prev").onclick = function () { mv(-1); }; $("ag-next").onclick = function () { mv(1); };
    box.querySelectorAll("[data-f]").forEach(function (b) { b.onclick = function () { S.fecha = b.dataset.f; S.hora = null; pintarMes(A, S); }; });
    if (S.fecha) pintarHoras(S);
  }
  async function pintarHoras(S) {
    var box = $("ag-hrs"); box.innerHTML = '<p class="pt-muted">Buscando horas…</p>';
    var r = await papi("portal_ag_horas", { tipoID: S.tipo, calendarID: S.cal, fecha: S.fecha });
    var L = (r && r.horas) || [];
    box.innerHTML = "<label>Horas libres · " + e(fdl(S.fecha)) + '</label><div class="pt-chips">' + (L.length ? L.map(function (x, i) { return '<button type="button" class="pt-chip' + (S.hora && S.hora.time === x.time ? " on" : "") + '" data-h="' + i + '">' + e(x.hora) + "</button>"; }).join("") : '<span class="pt-muted">' + e((r && r.error) || "Ese día ya no tiene horas.") + "</span>") + "</div>";
    box.querySelectorAll("[data-h]").forEach(function (b) { b.onclick = function () { S.hora = L[+b.dataset.h]; box.querySelectorAll("[data-h]").forEach(function (x) { x.classList.toggle("on", x === b); }); $("ag-ok").disabled = false; }; });
    $("ag-ok").disabled = !S.hora;
  }

  // Clienta · Historial
  function cliHistorial(body) {
    var L = P.data.historial || [];
    body.innerHTML = '<div class="pt-card"><h3>Mis visitas</h3>' + (L.length ? L.map(function (t) {
      return '<div class="pt-row"><div><b>' + e(t.facial || "Visita") + "</b>" + (t.paquete ? ' <span class="pt-pill">paquete</span>' : "") + "<br><small>" + e(fd(t.fecha)) + (t.cosmetologa ? " · " + e(t.cosmetologa) : "") + ((t.productos || []).length ? " · 🧴 " + t.productos.map(function (p) { return e(p.nombre) + (p.cantidad > 1 ? " ×" + p.cantidad : ""); }).join(", ") : "") + "</small></div></div>";
    }).join("") : '<p class="pt-muted">Aún no hay visitas registradas.</p>') + "</div>";
  }
  // Clienta · Documentos (mismas carpetas que en la ficha del equipo)
  var CARP = [["skin", "🔬 Skin Analysis"], ["klift", "✨ K-Lift"], ["tratamientos", "📄 Tratamientos"], ["fotos", "📷 Fotos"], ["otros", "🗂️ Otros"]];
  function cliDocs(body) {
    var D = P.data.documentos || [];
    body.innerHTML = '<div class="pt-card"><h3>Mis documentos</h3>' + (D.length ? CARP.map(function (c) {
      var L = D.filter(function (d) { return d.carpeta === c[0]; }); if (!L.length) return "";
      return '<details class="pt-folder"' + (c[0] === "skin" ? " open" : "") + "><summary>" + c[1] + " <small>· " + L.length + "</small></summary><div>" + L.map(function (d) {
        var i = D.indexOf(d);
        return '<div class="pt-row"><div>' + e(d.nombre) + "<br><small>" + e(fd(d.fecha)) + '</small></div><button class="pt-btn sm ghost" data-doc="' + i + '">Abrir</button></div>';
      }).join("") + "</div></details>";
    }).join("") : '<p class="pt-muted">Todavía no tienes documentos. Tus análisis de piel, K-Lift y fotos aparecerán aquí.</p>') + "</div>";
    body.querySelectorAll("[data-doc]").forEach(function (b) { b.onclick = async function () {
      var d = D[+b.dataset.doc];
      if (d.firma) { window.open(d.firma, "_blank"); return; }
      if (d.foto) { var f = await papi("portal_foto", { url: d.foto }); if (!f.ok) { msg(f.error || "No disponible", 1); return; } dlg('<h3>' + e(d.nombre) + '</h3><img src="' + e(f.url) + '" alt="" style="width:100%;border-radius:10px">'); return; }
      var r = await papi("portal_doc", { id: d.docId }); if (!r.ok) { msg(r.error || "No se pudo abrir", 1); return; } window.open(r.url, "_blank");
    }; });
  }
  // Perfil / cuenta (clienta y proveedor)
  function cuentaTab(body, cli) {
    var h = "";
    if (cli) {
      var p = P.data.perfil || {};
      h += '<div class="pt-card pt-f"><h3>Mi perfil</h3><div class="pt-row"><div><small>Código</small><br><b>' + e(P.data.codigo || "—") + '</b></div><div style="text-align:right"><small>Identificación</small><br><b>' + e(p.cedula || "—") + "</b></div></div>" +
        (P.data.campos || []).map(function (c) { var k = c[0], tipo = k === "nacimiento" ? "date" : k === "email" ? "email" : k === "telefono" ? "tel" : "text"; var largo = /alergias|medicacion|condiciones|preferencias|notaClienta/.test(k); return '<label for="pf-' + k + '">' + e(c[1]) + "</label>" + (largo ? '<textarea id="pf-' + k + '" data-pf="' + k + '" rows="2" maxlength="500">' + e(p[k] || "") + "</textarea>" : '<input id="pf-' + k + '" data-pf="' + k + '" type="' + tipo + '" maxlength="160" value="' + e(p[k] || "") + '">'); }).join("") +
        '<p class="pt-muted">Tu cédula y código no se cambian. Si algo está mal, escríbenos.</p><p class="err" id="pf-err"></p><button class="pt-btn" id="pf-ok">Guardar cambios</button></div>';
    }
    h += '<div class="pt-card"><h3>Mi cuenta</h3><div class="pt-row"><div><small>Correo de acceso</small><br>' + e(P.cuenta.email) + "</div></div>" +
      '<div class="pt-acts"><button class="pt-btn ghost" id="pt-out">Cerrar sesión</button><button class="pt-btn red" id="pt-del">Eliminar cuenta</button></div>' +
      '<p class="pt-legal"><a href="' + PRIV + '" target="_blank" rel="noopener">Política de privacidad</a><a href="' + SOP + '" target="_blank" rel="noopener">Soporte</a></p></div>';
    body.innerHTML = h;
    if (cli) $("pf-ok").onclick = async function () {
      var p0 = P.data.perfil || {}, cambios = {};
      body.querySelectorAll("[data-pf]").forEach(function (i) { var k = i.dataset.pf, v = i.value.trim(); if (v !== String(p0[k] || "").trim()) cambios[k] = v; });
      if (!Object.keys(cambios).length) { msg("Sin cambios"); return; }
      var r = await papi("portal_perfil_guardar", { cambios: cambios });
      if (!r.ok) { $("pf-err").textContent = r.error || "No se pudo guardar"; return; }
      msg("Perfil guardado ✨"); P.data = null; paint();
    };
    $("pt-out").onclick = async function () { await papi("portal_logout", { token: localStorage.getItem(TK) }); salir(); };
    $("pt-del").onclick = function () {
      dlg("<h3>Eliminar mi cuenta</h3><p>Se borra tu acceso a la app Sunsu (correo y contraseña) y se cierra tu sesión en todos tus equipos.</p><p><b>Tu ficha" + (cli ? " de clienta, historial de tratamientos, facturas y documentos" : " de proveedor, órdenes, actas y documentos") + " se quedan guardados en Sunsu</b>, porque la ley nos pide conservarlos (registros contables y de salud). Si quieres que también los revisemos o borremos lo que la ley permita, escríbenos desde Soporte.</p>" +
        '<div class="pt-f"><label for="del-p">Escribe tu contraseña para confirmar</label><input id="del-p" type="password" autocomplete="current-password"></div><p class="err" id="del-err"></p><div class="pt-acts"><button class="pt-btn ghost" data-x>Volver</button><button class="pt-btn red" id="del-ok">Eliminar cuenta</button></div>', function (box) {
          box.querySelector("#del-ok").onclick = async function () {
            var r = await papi("portal_eliminar_cuenta", { password: box.querySelector("#del-p").value });
            if (!r.ok) { box.querySelector("#del-err").textContent = r.error || "No se pudo eliminar"; return; }
            box.remove(); localStorage.removeItem(TK); P.cuenta = null; P.data = null; paintInicio("Tu cuenta fue eliminada.");
          };
        });
    };
  }
  function salir() { localStorage.removeItem(TK); P.cuenta = null; P.data = null; P.ag = null; P.tab = "inicio"; paintInicio(); }
  function dlg(html, after) {
    var box = document.createElement("div"); box.className = "pt-dlg";
    box.innerHTML = "<div>" + html + (html.indexOf("data-x") < 0 ? '<div class="pt-acts" style="justify-content:flex-end"><button class="pt-btn ghost" data-x>Cerrar</button></div>' : "") + "</div>";
    document.body.appendChild(box);
    box.onclick = function (ev) { if (ev.target === box) box.remove(); };
    box.querySelectorAll("[data-x]").forEach(function (b) { b.onclick = function () { box.remove(); }; });
    if (after) after(box);
    return box;
  }

  // ───────── Proveedor ─────────
  function provResumen(body) {
    var d = P.data, v = d.ventas || {}, k = function (x, l) { x = x || {}; return '<div class="pt-kpi"><b>' + (x.unidades || 0) + "</b><small>" + l + " · " + money(x.monto) + "</small></div>"; };
    var enStock = (d.productos || []).filter(function (p) { return p.consig; }).reduce(function (a, p) { return a + (Number(p.stock) || 0); }, 0);
    body.innerHTML = '<div class="pt-card"><h3>' + e(d.proveedor.nombre) + '</h3><p class="pt-muted">Unidades vendidas de tus productos en Sunsu · monto a tu precio</p><div class="pt-kpis">' + k(v.hoy, "hoy") + k(v.mes, "este mes") + k(v.anio, "este año") + "</div></div>" +
      '<div class="pt-card"><h3>Lo más vendido este mes</h3>' + ((v.topMes || []).length ? v.topMes.map(function (x) { return '<div class="pt-row"><div>' + e(x.nombre) + " <small>" + e(x.sku) + "</small></div><b>" + x.unidades + " u</b></div>"; }).join("") : '<p class="pt-muted">Sin ventas este mes todavía.</p>') + "</div>" +
      '<div class="pt-card"><h3>En Sunsu ahora</h3><div class="pt-row"><div>Stock en consignación listo para vender</div><b>' + enStock + ' u</b></div><div class="pt-acts"><button class="pt-btn sm ghost" data-go="productos">Ver productos</button><button class="pt-btn sm ghost" data-go="pedidos">Prepedido y órdenes</button></div></div>' +
      '<div class="pt-card"><h3>Propuestas a Sunsu</h3><p class="pt-muted">Sugiere un precio, un descuento o un beneficio por volumen. Sunsu lo revisa; nada cambia hasta que lo aprueben.</p><div class="pt-acts"><button class="pt-btn sm" id="pp-ben">＋ Beneficio por volumen</button><button class="pt-btn sm ghost" id="pp-des">＋ Descuento</button></div>' +
      ((d.propuestas || []).length ? d.propuestas.map(function (x) { return '<div class="pt-row"><div>' + e(txtProp(x)) + "<br><small>" + e(fd(x.fecha)) + (x.nota ? " · " + e(x.nota) : "") + '</small></div><span class="pt-pill ' + (x.estado === "aprobada" ? "g" : x.estado === "rechazada" ? "r" : "w") + '">' + e(x.estado) + "</span></div>"; }).join("") : "") + "</div>";
    body.querySelectorAll("[data-go]").forEach(function (b) { b.onclick = function () { irA(b.dataset.go); }; });
    $("pp-ben").onclick = function () { propuesta("beneficio", null); };
    $("pp-des").onclick = function () { propuesta("descuento", null); };
  }
  function txtProp(x) {
    var d = x.detalle || {};
    if (x.tipo === "precio") return "Precio " + (x.producto || x.sku) + " → " + money(d.precio);
    if (x.tipo === "descuento") return "Descuento " + d.descuento_pct + "%" + (x.producto ? " en " + x.producto : " en tus productos") + (d.desde ? " · " + d.desde + (d.hasta ? " → " + d.hasta : "") : "");
    return "Si vende más de " + d.unidades + " u/" + (d.periodo || "mes") + ", " + d.descuento_pct + "% de descuento" + (x.producto ? " en " + x.producto : "");
  }
  function propuesta(tipo, prod) {
    var t = { precio: "Sugerir precio", descuento: "Proponer descuento", beneficio: "Beneficio por volumen" }[tipo];
    var L = P.data.productos || [];
    var sel = '<label>Producto</label><select id="pp-p">' + (tipo === "precio" ? "" : '<option value="">Todos mis productos</option>') + L.map(function (p) { return '<option value="' + e(p.id) + '"' + (prod && prod.id === p.id ? " selected" : "") + ">" + e(p.sku + " · " + p.nombre) + "</option>"; }).join("") + "</select>";
    var campos = tipo === "precio" ? '<label>Precio sugerido (USD)</label><input id="pp-v" type="number" step="0.01" min="0" inputmode="decimal">' + (prod && prod.precio ? '<p class="pt-muted">Precio actual: ' + money(prod.precio) + "</p>" : "")
      : tipo === "descuento" ? '<label>Descuento (%)</label><input id="pp-v" type="number" step="0.5" min="1" max="99"><label>Desde (opcional)</label><input id="pp-d" type="date"><label>Hasta (opcional)</label><input id="pp-h" type="date">'
      : '<label>Si Sunsu vende más de (unidades)</label><input id="pp-u" type="number" min="1"><label>Por</label><select id="pp-per"><option value="mes">mes</option><option value="quincena">quincena</option><option value="trimestre">trimestre</option><option value="año">año</option></select><label>Sunsu recibe un descuento de (%)</label><input id="pp-v" type="number" step="0.5" min="1" max="99">';
    dlg("<h3>" + t + '</h3><div class="pt-f">' + sel + campos + '<label>Mensaje (opcional)</label><textarea id="pp-m" rows="2" maxlength="600"></textarea></div><p class="pt-muted">Sunsu revisa tu propuesta. No cambia nada hasta que la aprueben.</p><p class="err" id="pp-err"></p><div class="pt-acts"><button class="pt-btn ghost" data-x>Volver</button><button class="pt-btn" id="pp-ok">Enviar</button></div>', function (box) {
      box.querySelector("#pp-ok").onclick = async function () {
        var q = function (id) { var i = box.querySelector(id); return i ? i.value : ""; };
        var r = await papi("portal_prov_propuesta", { tipo: tipo, producto_id: q("#pp-p"), precio: q("#pp-v"), descuento_pct: q("#pp-v"), unidades: q("#pp-u"), periodo: q("#pp-per"), desde: q("#pp-d"), hasta: q("#pp-h"), mensaje: q("#pp-m") });
        if (!r.ok) { box.querySelector("#pp-err").textContent = r.error || "No se pudo enviar"; return; }
        box.remove(); msg(r.mensaje || "Enviado"); P.data = null; paint();
      };
    });
  }
  function provProductos(body) {
    var L = P.data.productos || [];
    body.innerHTML = '<div class="pt-card"><h3>Mis productos en Sunsu</h3>' + (L.length ? L.map(function (p, i) {
      return '<div class="pt-row"><div class="pt-prod">' + (p.foto ? '<img src="' + e(p.foto) + '" alt="">' : '<div class="ph">📦</div>') + "<div><b>" + e(p.nombre) + "</b><br><small>" + e(p.sku) + (p.precio ? " · tu precio " + money(p.precio) : "") + (p.consig ? " · stock " + (p.stock || 0) + " u" : "") + '</small></div></div><div class="pt-acts" style="margin:0"><button class="pt-btn sm ghost" data-foto="' + i + '">📷</button><button class="pt-btn sm ghost" data-pre="' + i + '">$</button></div></div>';
    }).join("") : '<p class="pt-muted">Aún no tienes productos en Sunsu.</p>') + '<p class="pt-muted">📷 cambia la foto del producto · $ sugiere un precio (Sunsu lo revisa)</p></div><input type="file" accept="image/*" id="pp-file" hidden>';
    var actual = null;
    body.querySelectorAll("[data-pre]").forEach(function (b) { b.onclick = function () { propuesta("precio", L[+b.dataset.pre]); }; });
    body.querySelectorAll("[data-foto]").forEach(function (b) { b.onclick = function () { actual = L[+b.dataset.foto]; $("pp-file").click(); }; });
    $("pp-file").onchange = async function () {
      var f = this.files && this.files[0]; this.value = ""; if (!f || !actual) return;
      try {
        var full = await achicar(f, 1400, 0.85), th = await achicar(f, 240, 0.7);
        var r = await papi("portal_prov_foto", { id: actual.id, foto_b64: full, thumb_b64: th });
        if (!r.ok) { msg(r.error || "No se pudo subir", 1); return; }
        msg("Foto actualizada ✨"); P.data = null; paint();
      } catch (x) { msg("No se pudo leer la foto", 1); }
    };
  }
  function achicar(file, max, q) {
    return new Promise(function (res, rej) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () { var k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL("image/jpeg", q)); };
      img.onerror = rej; img.src = u;
    });
  }
  function ocHtml(o) {
    return '<details class="pt-folder"><summary>' + e(o.numero) + " <small>· " + e(fd(o.fecha)) + " · " + e(o.tipo) + " · " + e(o.estado) + "</small><span style=\"float:right\">" + money(o.total) + "</span></summary><div>" +
      (o.lineas || []).map(function (l) { return '<div class="pt-row"><div>' + e(l.nombre) + " <small>" + e(l.sku) + "</small></div><small>" + l.cantidad + " × " + money(l.precio) + (l.recibido ? " · recibido " + l.recibido : "") + "</small></div>"; }).join("") +
      (o.saldo > 0 ? '<p class="pt-muted">Saldo por pagar: ' + money(o.saldo) + "</p>" : o.pago ? '<p class="pt-muted">Pago: ' + e(o.pago) + "</p>" : "") + "</div></details>";
  }
  function provPedidos(body) {
    var d = P.data, h = '<div class="pt-card"><h3>Prepedido actual</h3>';
    if (d.restock && (d.restock.lineas || []).length) h += '<p class="pt-muted">Restock ' + e(d.restock.numero) + " · " + e(fd(d.restock.desde)) + " → " + e(fd(d.restock.hasta)) + " · " + e(d.restock.estado) + "</p>" + d.restock.lineas.map(function (l) { return '<div class="pt-row"><div>' + e(l.nombre) + " <small>" + e(l.sku) + "</small></div><b>" + l.cantidad + " u</b></div>"; }).join("");
    h += (d.prepedidos || []).map(ocHtml).join("");
    if (!(d.restock && (d.restock.lineas || []).length) && !(d.prepedidos || []).length) h += '<p class="pt-muted">No hay un prepedido abierto.</p>';
    h += '</div><div class="pt-card"><h3>Órdenes de compra</h3>' + ((d.ordenes || []).length ? d.ordenes.map(ocHtml).join("") : '<p class="pt-muted">Aún no hay órdenes.</p>') + "</div>";
    body.innerHTML = h;
  }
  function provActas(body) {
    var L = P.data.actas || [];
    body.innerHTML = '<div class="pt-card"><h3>Actas de entrega</h3>' + (L.length ? L.map(function (a) {
      return '<div class="pt-row"><div><b>' + e(a.numero) + "</b>" + (a.oc ? " <small>· " + e(a.oc) + "</small>" : "") + "<br><small>" + e(fd(a.fecha)) + " · " + (a.firmada ? "firmada por Sunsu" : "sin firmar") + "</small></div>" + (a.pdf ? '<button class="pt-btn sm ghost" data-acta="' + e(a.id) + '">PDF</button>' : '<span class="pt-pill">sin PDF</span>') + "</div>";
    }).join("") : '<p class="pt-muted">Aún no hay actas.</p>') + "</div>";
    body.querySelectorAll("[data-acta]").forEach(function (b) { b.onclick = async function () { var r = await papi("portal_acta", { id: b.dataset.acta }); if (!r.ok) { msg(r.error || "No se pudo abrir", 1); return; } window.open(r.url, "_blank"); }; });
  }

  window.SunsuPortal = {
    paintInicio: paintInicio, paint: paint, paintCrear: paintCrear, paintClave: paintClave,
    activo: function () { return !!localStorage.getItem(TK); },
    tokenClave: function () { var m = /^#\/app-clave\/([0-9a-f]{64})$/.exec(location.hash || ""); return m ? m[1] : ""; },
    _p: P,
  };
})();
