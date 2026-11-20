const CACHE = "sunsu-2026-11-20-TK168";
const FILES = ["/", "/index.html", "/descuento_justif.js", "/beta-screens.js", "/beta-inline.js", "/mc-productos.js",
  "/mc-nav.js", "/mc-movil.js", "/mc-promociones.js", "/mc-proveedores.js", "/mc-permisos.js", "/mc-protocolos.js", "/mc-buscar.js", "/mc-conteo.js", "/mc-transferencias.js", "/mc-ajustes.js", "/mc-wa.js", "/mc-tickets.js", "/mc-maestro.js", "/mc-empleados.js", "/mc-edit.js", "/mc-paquetes.js", "/mc-aperturas.js", "/mc-acceso.js", "/mc-barras.js", "/mc-caja.js", "/mc-giftcards.js", "/mc-multas.js", "/mc-clientes.js", "/mc-clientes-dup.js", "/mc-docpdf.js", "/mc-compras.js", "/mc-recepciones.js", "/mc-consignacion.js", "/mc-agenda.js", "/mc-staff-home.js", "/mc-borradores.js", "/mc-portal.js", "/mc-portal-admin.js", "/mc-scan.js", "/vendor-zxing.js", "/vendor-qrcode.js", "/manifest.webmanifest", "/icon-beta.png", "/icon-beta.svg", "/icon-sunsu-64.png", "/icon-sunsu-180.png", "/icon-sunsu-192.png", "/icon-sunsu-512.png", "/assets/sunsu-logo-celeste.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => {
    if (!self.registration || !self.registration.active) return self.skipWaiting();
  }));
});
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("sunsu-") && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Sunsu", body: "Recuerda marcar entrada" };
  try { payload = event.data ? event.data.json() : payload; } catch { /* el texto por defecto alcanza */ }
  event.waitUntil(self.registration.showNotification(payload.title || "Sunsu", {
    body: payload.body || "Recuerda marcar entrada",
    icon: "/icon-sunsu-192.png",
    tag: payload.tag || "sunsu-reloj",
    data: { url: "/#/m/inicio" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/#/m/inicio";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if (new URL(client.url).origin === self.location.origin && "focus" in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  if (url.pathname.startsWith("/functions/") || url.pathname === "/sw.js") return;
  /* TK153 (Emilia t670u): el icono viejo del Home Screen abre /beta.html o /sunsu.html. Si
     redirigimos a "/", iOS sale del modo pantalla completa y muestra la barra de Safari.
     Servimos el HTML de la app en la MISMA ruta (sin redirect), así el icono sigue en standalone. */
  const esAlias = url.pathname === "/beta.html" || url.pathname === "/sunsu.html";
  if (esAlias && event.request.mode === "navigate") {
    event.respondWith(appEnMismaRuta());
    return;
  }
  const esApp = url.pathname === "/" || url.pathname === "/index.html";
  const betaAsset = esApp || url.pathname.startsWith("/beta/") || FILES.includes(url.pathname);
  if (!betaAsset) return;
  const pedir = esApp && event.request.mode === "navigate"
    ? fetch(url.href, { cache: "no-cache", credentials: "same-origin" })
    : fetch(event.request);
  event.respondWith(
    pedir
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(event.request);
        if (hit) return hit;
        if (esApp) {
          const page = (await caches.match("/")) || (await caches.match("/index.html"));
          if (page) return page;
        }
        return Response.error();
      }),
  );
});

// TK153: HTML de la app (red primero, caché si no hay red) sin redirect, para /beta.html y /sunsu.html.
async function appEnMismaRuta() {
  let res = null;
  try {
    res = await fetch("/", { cache: "no-cache", credentials: "same-origin" });
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put("/", copy)).catch(() => {});
    } else res = null;
  } catch { res = null; }
  if (!res) res = (await caches.match("/")) || (await caches.match("/index.html"));
  if (!res) return Response.redirect("/", 302);
  const headers = new Headers(res.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(await res.blob(), { status: 200, statusText: "OK", headers });
}
