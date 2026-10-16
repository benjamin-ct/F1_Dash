// Notifications des grosses news F1 (page du créateur installée sur le téléphone). Le message,
// chiffré par le serveur pour ce téléphone, donne le titre et l'adresse du post à préparer.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data?.json() || {}; } catch { /* message illisible */ }
  e.waitUntil(self.registration.showNotification(m.title || 'Paddock Studio', {
    body: m.body || 'Grosse news F1 : touchez pour préparer le post',
    tag: m.id || 'paddock-alerte',
    icon: '/studio/icon-512.png',
    data: { url: m.url || '/studio/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/studio/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  e.waitUntil((async () => {
    // Page déjà ouverte : elle ouvre le post elle-même ; sinon nouvelle fenêtre
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find((c) => c.url.startsWith(self.registration.scope));
    if (w) { await w.focus(); w.postMessage({ alert: url.searchParams.get('alert') }); return; }
    await self.clients.openWindow(url.href);
  })());
});
