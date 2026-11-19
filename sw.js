const CACHE = "sunsu-beta-2026-11-19-TK134";
const FILES = ["/beta.html", "/beta-screens.js", "/beta-inline.js", "/mc-productos.js",
  "/mc-nav.js", "/mc-movil.js", "/mc-promociones.js", "/mc-proveedores.js", "/mc-permisos.js", "/mc-protocolos.js", "/mc-buscar.js", "/mc-conteo.js", "/mc-transferencias.js", "/mc-ajustes.js", "/mc-tickets.js", "/mc-maestro.js", "/mc-empleados.js", "/mc-edit.js", "/mc-paquetes.js", "/mc-aperturas.js", "/mc-acceso.js", "/mc-barras.js", "/mc-caja.js", "/mc-giftcards.js", "/mc-multas.js", "/mc-clientes.js", "/mc-clientes-dup.js", "/mc-docpdf.js", "/mc-compras.js", "/mc-recepciones.js", "/mc-consignacion.js", "/mc-agenda.js", "/mc-staff-home.js", "/mc-scan.js", "/vendor-zxing.js", "/vendor-qrcode.js", "/manifest.webmanifest", "/icon-beta.png", "/icon-beta.svg", "/icon-sunsu-64.png", "/icon-sunsu-180.png", "/icon-sunsu-192.png", "/icon-sunsu-512.png", "/assets/sunsu-logo-celeste.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("sunsu-beta") && key !== CACHE).map((key) => caches.delete(key)));
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
    data: { url: "/beta.html#/m/inicio" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/beta.html#/m/inicio";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if (client.url.indexOf("/beta.html") >= 0 && "focus" in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  if (url.pathname.startsWith("/functions/") || url.pathname === "/sw.js") return;
  const betaAsset = url.pathname === "/beta.html" || url.pathname.startsWith("/beta/") || FILES.includes(url.pathname);
  if (!betaAsset) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(event.request);
        if (hit) return hit;
        if (url.pathname === "/beta.html") {
          const page = await caches.match("/beta.html");
          if (page) return page;
        }
        return Response.error();
      }),
  );
});
