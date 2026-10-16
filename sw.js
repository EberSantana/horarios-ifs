// Service Worker - Painel Docente IFS Tobias Barreto
const CACHE_NAME = 'ifs-painel-v19-sync-notif';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './api.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Alguns assets estáticos falharam ao cachear:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('Removendo cache antigo:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignora requisições para APIs externas (Google Apps Script e redirecionamentos Google)
  if (event.request.url.includes('script.google.com') || event.request.url.includes('googleusercontent.com')) {
    return;
  }

  // Estratégia Stale-While-Revalidate para velocidade nativa máxima (0ms) no celular
  // Entrega o arquivo do cache local imediatamente e atualiza o cache em segundo plano
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html', { ignoreSearch: true });
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// Suporte ao Badging API no Service Worker para PWA em celular e tablet
self.addEventListener('message', (event) => {
  if (event.data && event.data.tipo === 'ATUALIZAR_BADGE') {
    const count = event.data.count || 0;
    if ('setAppBadge' in self.navigator) {
      if (count > 0) {
        self.navigator.setAppBadge(count).catch(() => {});
      } else {
        self.navigator.clearAppBadge().catch(() => {});
      }
    }
  } else if (event.data && event.data.tipo === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});


// Ao tocar numa notificação: foca o app já aberto (ou abre) e vai para a aba certa
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const aba = (event.notification.data && event.notification.data.aba) || 'tab-minha';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const client of lista) {
        if ('focus' in client) {
          client.postMessage({ tipo: 'ABRIR_ABA', aba });
          return client.focus();
        }
      }
      return self.clients.openWindow('./index.html');
    })
  );
});

// Pronto para Web Push (notificação com o app FECHADO) quando houver um servidor de push
self.addEventListener('push', (event) => {
  let dados = { titulo: 'Painel Docente', corpo: 'Há novidades na grade.' };
  try { if (event.data) dados = { ...dados, ...event.data.json() }; } catch (e) {}
  event.waitUntil(self.registration.showNotification(dados.titulo, {
    body: dados.corpo, icon: './icons/icon-192.png', badge: './icons/icon-192.png', data: { aba: dados.aba }
  }));
});
