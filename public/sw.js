// Offline use. The network always comes first, so nothing here can serve an out-of-date page or
// out-of-date numbers while you are online. Only when the network fails does it fall back to the
// copy saved the last time: the page itself, its icons and font, and the companies you have read.
const CACHE = "signal-cards-1";
const KEEP_COMPANIES = 30; // the most companies kept for offline reading

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["/", "/icon.svg", "/manifest.webmanifest"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Mark a saved copy, so the page can say it is showing one.
const saved = async hit => {
  const headers = new Headers(hit.headers); headers.set("X-Saved-Copy", "1");
  return new Response(await hit.blob(), { status: hit.status, headers });
};
const trim = async cache => { // drop the oldest companies beyond the limit
  const keys = (await cache.keys()).filter(r => new URL(r.url).pathname === "/api/cards");
  await Promise.all(keys.slice(0, Math.max(0, keys.length - KEEP_COMPANIES)).map(k => cache.delete(k)));
};

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  const ours = url.origin === location.origin;
  const font = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!ours && !font) return;
  if (ours && url.pathname === "/api/search") return; // searching needs the network
  // Every page address (?ticker=...) is the same one page, so it is saved once, under "/".
  const page = ours && req.mode === "navigate";
  const key = page ? "/" : req;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") {
        if (ours && url.pathname === "/api/cards") await cache.delete(key); // so the newest read sits last
        await cache.put(key, res.clone());
        if (ours && url.pathname === "/api/cards") await trim(cache);
      }
      return res;
    } catch (err) {
      const hit = await cache.match(key);
      if (!hit) throw err;
      return ours && url.pathname.startsWith("/api/") ? saved(hit) : hit;
    }
  })());
});
