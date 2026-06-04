const CACHE = 'tipovacka-v2';
const ASSETS = ['/tipovacka/', '/tipovacka/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});

// Push notification handler
self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title ?? 'Tipovačka MS 2026', {
      body: data.body ?? 'Nezapomeň vyplnit tipy!',
      icon: data.icon ?? '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag ?? 'tipovacka',
      data: { url: data.url ?? '/' },
      actions: [
        { action: 'open', title: '⚽ Tipovat' },
        { action: 'dismiss', title: 'Zavřít' },
      ]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(cs => {
      const url = e.notification.data?.url ?? '/';
      const existing = cs.find(c => c.url.includes('tipovacka'));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
