// Безопасный Service Worker - не кэширует, просто пропускает запросы
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request).catch(() => new Response('Offline', { status: 503 })));
});
