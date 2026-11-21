/* sw.js: service worker. Owner: shared.
 * Makes the app installable and keeps it working on spotty campus Wi-Fi.
 * Code is network-first, so a refresh always picks up your latest edits
 * (the cache is only a fallback when you're offline).
 * Bump VERSION if you add a new file that must work offline.
 */
const VERSION = "bullsbites-v6";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/styles.css", "css/student-bb.css", "img/usf-logo.png", "img/bb-logo.svg",
  "js/core.js", "js/model.js", "js/club.js", "js/student.js", "js/sync.js", "js/app.js",
  "data/sample_events.json", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return; // live sync, fonts: straight to network
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
  );
});

// Tapping a "free food" notification opens (or focuses) the app.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      return self.clients.openWindow("./");
    })
  );
});
