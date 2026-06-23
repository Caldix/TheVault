// NOTE: keep schema (DB_NAME, DB_VERSION, store names) in sync with app.js
const DB_NAME = 'memoriesDB';
const DB_VERSION = 2;
const STORE = 'posts';
const SHARE_STORE = 'pendingShares';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains(SHARE_STORE)) {
        db.createObjectStore(SHARE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const ASSET_CACHE = 'memories-assets-v1';
const CORE_ASSETS = [
  './', './index.html', './style.css', './app.js',
  './manifest.json', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSET_CACHE).then(cache => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== ASSET_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target.html')) {
    event.respondWith(handleShare(event.request));
    return;
  }

  // cache-first for this app's own static files; everything else goes straight to network
  if (event.request.method === 'GET' && url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then(cache => cache.put(event.request, copy));
          }
          return response;
        }).catch(() => cached);
      })
    );
  }
});

async function handleShare(request) {
  try {
    const formData = await request.formData();
    const title = (formData.get('title') || '').toString();
    const text = (formData.get('text') || '').toString();
    const files = formData.getAll('photos').filter(f => f && typeof f === 'object' && f.size > 0);

    const combinedText = [title, text].filter(Boolean).join('\n\n');

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, 'readwrite');
      tx.objectStore(SHARE_STORE).put({
        id: 'pending-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        text: combinedText,
        files,
        createdAt: Date.now(),
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    // if anything goes wrong, just open the app with nothing pre-filled
  }
  return Response.redirect('./index.html?shared=1', 303);
}
