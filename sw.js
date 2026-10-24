const CACHE = "sunsu-beta-2026-10-24-INLINE";
const FILES = ["/beta.html", "/beta-screens.js", "/beta-inline.js", "/manifest.webmanifest", "/icon-beta.png", "/icon-beta.svg", "/assets/sunsu-logo-celeste.png"];

function scopePath() {
  try { return new URL(self.registration.scope).pathname || "/"; } catch { return "/"; }
}

function rootScope() {
  const path = scopePath();
  return path === "/" || path === "";
}

self.addEventListener("install", (event) => {
  if (rootScope()) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    if (rootScope()) {
      await Promise.all(keys.filter((key) => key.startsWith("sunsu-beta")).map((key) => caches.delete(key)));
      await self.registration.unregister();
      return;
    }
    await Promise.all(keys.filter((key) => key.startsWith("sunsu-beta") && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Sunsu", body: "Recuerda marcar entrada" };
  try { payload = event.data ? event.data.json() : payload; } catch { /* el texto por defecto alcanza */ }
  event.waitUntil(self.registration.showNotification(payload.title || "Sunsu", {
    body: payload.body || "Recuerda marcar entrada",
    icon: "/icon-beta.png",
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
  if (rootScope()) return;
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
