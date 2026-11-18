// 🔑 Mi acceso (Emilia 17/11): entrar con usuario y contraseña además del PIN.
// Cada persona crea o cambia el suyo; el admin ve el equipo, pone/quita usuarios y desbloquea.
(function () {
  "use strict";
  function e(v) { return typeof esc === "function" ? esc(v) : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast2(msg, bad) { if (typeof toast === "function") toast(msg, bad ? "var(--red, #c0392b)" : "var(--green)"); }
  function fh(iso) { if (!iso) return ""; try { return new Date(iso).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "2-digit", year: "numeric" }); } catch (_) { return ""; } }
  var REGLA = "Usuario: minúsculas, 3 a 30 letras o números (. _ -). Contraseña: mínimo 8, con letras y números.";
  function css() {
    if (document.getElementById("mcac-css")) return;
    var s = document.createElement("style"); s.id = "mcac-css";
    s.textContent = [
      ".mcac{max-width:720px}.mcac h2{margin:0 0 8px;font-size:1.2rem}.mcac-sub{font-size:.76rem;color:var(--gray,#8a93a6)}",
      ".mcac-card{background:#fff;border-radius:14px;padding:12px 14px;margin:10px 0;box-shadow:var(--shadow-sm,0 1px 3px rgba(0,0,0,.08))}",
      ".mcac-f{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mcac-f label{font-size:.72rem;color:var(--gray,#8a93a6);display:flex;flex-direction:column;gap:3px}",
      ".mcac-f input{padding:9px 11px;border:1.5px solid var(--cream-d,#e6dccb);border-radius:10px;font:inherit}",
      ".mcac-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap}",
      ".mcac-t{width:100%;border-collapse:collapse;font-size:.8rem}.mcac-t th{text-align:left;color:var(--gray,#8a93a6);font-size:.7rem;padding:5px;border-bottom:1.2px solid var(--cream-d,#e6dccb)}.mcac-t td{padding:6px 5px;border-bottom:1px solid #f1ede6;vertical-align:middle}",
      ".mcac-pill{font-size:.66rem;border-radius:999px;padding:2px 8px;background:#e8f5ee;color:#2e7d52;font-weight:800}.mcac-pill.g{background:#eef0f4;color:#6b7280}.mcac-pill.r{background:#fdecea;color:#b03a2e}",
      ".mcac-ov{position:fixed;inset:0;background:rgba(40,50,70,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}.mcac-ov>div{background:#fff;border-radius:16px;padding:18px;max-width:420px;width:100%}",
      "@media(max-width:560px){.mcac-f{grid-template-columns:1fr}}",
    ].join("\n");
    document.head.appendChild(s);
  }
  function formHtml(pref, usuario, conConfirm) {
    return '<div class="mcac-f"><label>Usuario<input id="' + pref + '-u" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="30" value="' + e(usuario || "") + '"></label><span></span>' +
      '<label>Contraseña nueva<input id="' + pref + '-p" type="password" autocomplete="new-password" maxlength="128"></label>' +
      (conConfirm ? '<label>Repítela<input id="' + pref + '-p2" type="password" autocomplete="new-password" maxlength="128"></label>' : "<span></span>") +
      '</div><p class="mcac-sub">' + e(REGLA) + "</p>";
  }
  async function render() {
    css();
    var mia = await api("cred_mia_get", {});
    var adm = !!(window.state && state.admin);
    var lista = adm ? await api("cred_lista", {}) : null;
    var h = '<div class="mcac" id="mcac-root"><h2>🔑 Mi acceso</h2><p class="mcac-sub">Puedes entrar con tu PIN o con usuario y contraseña. Tu PIN sigue funcionando igual.</p>' +
      '<div class="mcac-card"><b>' + (mia && mia.usuario ? "Tu usuario: " + e(mia.usuario) : "Todavía no tienes usuario") + "</b>" +
      (mia && mia.desde ? ' <span class="mcac-sub">· cambiado ' + e(fh(mia.desde)) + "</span>" : "") +
      '<div style="margin-top:8px">' + formHtml("mcac-mia", mia && mia.usuario, true) + '</div><div class="mcac-acts"><button class="btn" id="mcac-mia-ok" type="button">Guardar</button></div></div>';
    if (adm) {
      var it = (lista && lista.items) || [];
      h += '<div class="mcac-card"><b>Accesos del equipo</b> <span class="mcac-sub">· solo admin. Nunca se muestra la contraseña; si alguien la olvida, pon una nueva.</span>' +
        '<table class="mcac-t"><thead><tr><th>Persona</th><th>Rol</th><th>Usuario</th><th></th></tr></thead><tbody>' +
        it.map(function (u) {
          return "<tr><td>" + e(u.nombre) + "</td><td>" + e(u.rol) + "</td><td>" + (u.usuario ? '<span class="mcac-pill">' + e(u.usuario) + "</span>" + (u.debe_cambiar ? ' <span class="mcac-pill r">debe cambiar clave</span>' : "") + (u.bloqueada ? ' <span class="mcac-pill r">bloqueado 15 min</span>' : "") : '<span class="mcac-pill g">solo PIN</span>') + "</td>" +
            '<td style="text-align:right;white-space:nowrap"><button class="btn ghost small" data-cpon="' + e(u.id) + '" data-n="' + e(u.nombre) + '" data-u="' + e(u.usuario || "") + '">' + (u.usuario ? "Cambiar" : "Crear") + "</button>" +
            (u.bloqueada ? ' <button class="btn ghost small" data-cdes="' + e(u.id) + '">Desbloquear</button>' : "") +
            (u.usuario ? ' <button class="btn ghost small" data-cqui="' + e(u.id) + '" data-n="' + e(u.nombre) + '">Quitar</button>' : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    return h + "</div>";
  }
  async function repintar(main) { var r = document.getElementById("mcac-root"); if (!r) return; r.outerHTML = await render(); wire(main); }
  function wire(main) {
    var ok = document.getElementById("mcac-mia-ok");
    if (ok) ok.onclick = async function () {
      var u = document.getElementById("mcac-mia-u").value.trim().toLowerCase(), p = document.getElementById("mcac-mia-p").value, p2 = document.getElementById("mcac-mia-p2").value;
      if (p !== p2) { toast2("Las dos contraseñas no coinciden", 1); return; }
      ok.disabled = true;
      var r = await api("cred_mia_guardar", { usuario: u, password: p, password2: p2 });
      ok.disabled = false;
      if (!r || !r.ok) { toast2((r && r.error) || "No se pudo guardar", 1); return; }
      toast2("🔑 Listo: ya puedes entrar con «" + r.usuario + "»"); repintar(main);
    };
    document.querySelectorAll("[data-cpon]").forEach(function (b) {
      b.onclick = function () {
        var ov = document.createElement("div"); ov.className = "mcac-ov";
        ov.innerHTML = "<div><b>Acceso de " + e(b.dataset.n) + "</b><div style='margin-top:8px'>" + formHtml("mcac-adm", b.dataset.u, false) + "</div><p class='mcac-sub'>Pon una contraseña temporal y dásela en persona. En el primer ingreso tendrá que elegir la suya (no puede repetir la temporal).</p><div class='mcac-acts'><button class='btn ghost' type='button' data-x>Cancelar</button><button class='btn' type='button' data-ok>Guardar</button></div></div>";
        document.body.appendChild(ov);
        ov.querySelector("[data-x]").onclick = function () { ov.remove(); };
        ov.querySelector("[data-ok]").onclick = async function () {
          var r = await api("cred_guardar", { usuario_id: b.dataset.cpon, usuario: document.getElementById("mcac-adm-u").value.trim().toLowerCase(), password: document.getElementById("mcac-adm-p").value });
          if (!r || !r.ok) { toast2((r && r.error) || "No se pudo guardar", 1); return; }
          ov.remove(); toast2("Acceso guardado para " + b.dataset.n); repintar(main);
        };
      };
    });
    document.querySelectorAll("[data-cqui]").forEach(function (b) {
      b.onclick = async function () {
        if (!confirm("¿Quitar el usuario de " + b.dataset.n + "? Podrá seguir entrando con su PIN.")) return;
        var r = await api("cred_quitar", { usuario_id: b.dataset.cqui });
        if (!r || !r.ok) { toast2((r && r.error) || "No se pudo quitar", 1); return; }
        toast2("Usuario quitado"); repintar(main);
      };
    });
    document.querySelectorAll("[data-cdes]").forEach(function (b) {
      b.onclick = async function () { var r = await api("cred_desbloquear", { usuario_id: b.dataset.cdes }); if (!r || !r.ok) { toast2((r && r.error) || "Error", 1); return; } toast2("Desbloqueado"); repintar(main); };
    });
  }
  window.MCAcceso = { render: render, wire: wire };
})();
