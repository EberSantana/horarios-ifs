// Service Worker - Painel Docente IFS Tobias Barreto
// Ao publicar nova versão: mude VERSAO aqui E o ?v= no index.html (devem ser iguais)
const VERSAO = '4.50';
const CACHE_NAME = 'ifs-painel-v' + VERSAO;
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css?v=' + VERSAO,
  './sinal.js?v=' + VERSAO,
  './api.js?v=' + VERSAO,
  './app.js?v=' + VERSAO,
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache: 'reload' ignora o cache HTTP/CDN e garante arquivos realmente novos
      cache.addAll(ASSETS_TO_CACHE.map((u) => new Request(u, { cache: 'reload' }))).catch((err) => {
        console.warn('Alguns assets estáticos falharam ao cachear:', err);
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) => Promise.all(
      nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

function guardarNoCache(request, response) {
  if (response && response.status === 200 && request.method === 'GET') {
    const copia = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Google Apps Script e outros domínios: sempre direto na rede
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Página (HTML): rede primeiro, para cada professor sempre receber a versão publicada.
  // Sem internet, abre a última cópia salva.
  // Painel administrativo: sempre direto na rede (precisa de internet e não pode
  // ocupar o lugar do index.html no cache dos professores)
  if (/\/admin(\.html|\.js|\.css)?$/.test(new URL(req.url).pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => guardarNoCache(new Request('./index.html'), res))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // JS/CSS/ícones: o endereço inclui ?v=..., então a busca é EXATA (sem ignoreSearch).
  // Versão nova = endereço novo = arquivo novo. Versão já vista = sai do cache em 0 ms.
  event.respondWith(
    caches.match(req).then((cache) => cache || fetch(req).then((res) => guardarNoCache(req, res)))
      .catch(() => caches.match(req, { ignoreSearch: true }))
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
