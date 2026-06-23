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

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target.html')) {
    event.respondWith(handleShare(event.request));
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
