// HGBN service worker — офлайн-first кэш приложения.
// Бамп версии инвалидирует старый кэш при обновлении ассетов.
const VERSION = 'hgbn-v3-5';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/store.js',
  './js/defaults.js',
  './js/calculator.js',
  './js/stats.js',
  './js/export.js',
  './js/charts.js',
  './js/icons.js',
  './js/daylio.js',
  './js/db.js',
  './js/ai.js',
  './js/applehealth.js',
  './js/seed.js',
  './js/aicontext.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Оболочка приложения (HTML/JS/CSS) — сеть вперёд, кэш как запасной вариант:
// иначе обновление «залипает» и пользователь месяцами видит старую версию.
// Иконки и прочее — кэш вперёд (они не меняются и экономят трафик).
const isShell = (url) => /\.(?:html|js|css|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || isShell(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
      return response;
    }))
  );
});
