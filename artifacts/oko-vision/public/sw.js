// OKO Vision Terminal — Service Worker v2.1
const CACHE_NAME = "oko-vision-v2";
const STATIC_ASSETS = ["/", "/index.html", "/manifest.json"];

// ── Install ─────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate ────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch — Network first, cache fallback ────────────────────────────────────

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/dex") ||
      url.pathname.includes("/rugcheck") || url.pathname.includes("/sol-rpc")) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Push Notifications ───────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let data = { title: "OKO Vision", body: "Новое уведомление", tag: "oko-push", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      tag:     data.tag,
      icon:    "/icons/icon-192.png",
      badge:   "/icons/icon-72.png",
      vibrate: [200, 100, 200],
      data:    { url: data.url },
      actions: [
        { action: "open",    title: "Открыть" },
        { action: "dismiss", title: "Закрыть" },
      ],
    })
  );
});

// ── Notification Click ───────────────────────────────────────────────────────

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const target = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// ── Message from client (local notifications) ────────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data?.type === "SHOW_NOTIFICATION") {
    const { title, body, tag, url } = event.data;
    self.registration.showNotification(title ?? "OKO Vision", {
      body:    body ?? "",
      tag:     tag ?? "oko-local",
      icon:    "/icons/icon-192.png",
      badge:   "/icons/icon-72.png",
      vibrate: [150, 50, 150],
      data:    { url: url ?? "/" },
    });
  }
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Background Sync (price alerts) ──────────────────────────────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === "price-alert") {
    event.waitUntil(handlePriceAlert());
  }
});

async function handlePriceAlert() {
  console.log("[OKO SW] Price alert sync triggered");
}
