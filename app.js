// ---------- IndexedDB ----------
const DB_NAME = 'memoriesDB';
const DB_VERSION = 1;
const STORE = 'posts';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbPut(post) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(post);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- state ----------
let allPosts = [];
let filteredPosts = [];
let shown = 0;
let pendingPhotos = []; // array of File objects for the composer
const PAGE_SIZE = 20;

// ---------- helpers ----------
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}
function initials(name) {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

// ---------- boot ----------
async function boot() {
  const savedAuthor = localStorage.getItem('memories-author');
  if (savedAuthor) document.getElementById('composer-author').value = savedAuthor;
  await refreshFeed();
}

async function refreshFeed() {
  allPosts = await dbGetAll();
  allPosts.sort((a, b) => b.timestamp - a.timestamp);
  rebuildYearFilter();
  applyFilter();
}

// ---------- year filter ----------
function rebuildYearFilter() {
  const select = document.getElementById('year-filter');
  const current = select.value;
  select.innerHTML = '<option value="">All years</option>';
  const years = [...new Set(allPosts.map(p => new Date(p.timestamp).getFullYear()))].sort((a, b) => b - a);
  for (const y of years) select.appendChild(el(`<option value="${y}">${y}</option>`));
  if (years.includes(Number(current))) select.value = current;
}
document.getElementById('year-filter').addEventListener('change', applyFilter);

function applyFilter() {
  const year = document.getElementById('year-filter').value;
  filteredPosts = year ? allPosts.filter(p => new Date(p.timestamp).getFullYear() === Number(year)) : allPosts;
  shown = 0;
  document.getElementById('posts').innerHTML = '';
  renderMore();
}

function renderMore() {
  const container = document.getElementById('posts');
  const next = filteredPosts.slice(shown, shown + PAGE_SIZE);
  next.forEach(p => container.appendChild(renderPost(p)));
  shown += next.length;
  document.getElementById('load-more').style.display = shown < filteredPosts.length ? 'block' : 'none';
  document.getElementById('empty-msg').style.display = filteredPosts.length === 0 ? 'block' : 'none';
}
document.getElementById('load-more').addEventListener('click', renderMore);

// ---------- rendering ----------
function renderPost(p) {
  const author = p.author || 'Memories';
  const node = el(`
    <article class="post">
      <div class="post-head">
        <div class="avatar">${initials(author)}</div>
        <div>
          <div class="post-author">${author}</div>
          <div class="post-date">${formatDate(p.timestamp)}</div>
        </div>
      </div>
      ${p.text ? `<div class="post-text"></div>` : ''}
      ${p.photos && p.photos.length ? `<div class="post-photos"></div>` : ''}
      <div class="post-actions"><button class="delete-btn">Delete</button></div>
    </article>
  `);
  if (p.text) node.querySelector('.post-text').textContent = p.text;
  if (p.photos && p.photos.length) {
    const grid = node.querySelector('.post-photos');
    grid.className = 'post-photos ' + (p.photos.length === 1 ? 'n1' : p.photos.length === 2 ? 'n2' : p.photos.length === 3 ? 'n3' : 'n4plus');
    p.photos.forEach(blob => {
      const url = URL.createObjectURL(blob);
      const img = el(`<img src="${url}" loading="lazy">`);
      img.addEventListener('click', () => openLightbox(url));
      grid.appendChild(img);
    });
  }
  node.querySelector('.delete-btn').addEventListener('click', async () => {
    if (!confirm('Delete this post?')) return;
    await dbDelete(p.id);
    node.remove();
    allPosts = allPosts.filter(x => x.id !== p.id);
    rebuildYearFilter();
  });
  return node;
}

function openLightbox(src) {
  const box = el(`<div class="lightbox"><img src="${src}"></div>`);
  box.addEventListener('click', () => box.remove());
  document.getElementById('lightbox-root').appendChild(box);
}

// ---------- composer ----------
document.getElementById('composer-photos').addEventListener('change', (e) => {
  pendingPhotos = pendingPhotos.concat(Array.from(e.target.files || []));
  renderPhotoPreview();
  e.target.value = '';
});
function renderPhotoPreview() {
  const wrap = document.getElementById('photo-preview');
  wrap.innerHTML = '';
  pendingPhotos.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    const thumb = el(`<div class="thumb"><img src="${url}"><button class="remove-btn">✕</button></div>`);
    thumb.querySelector('.remove-btn').addEventListener('click', () => {
      pendingPhotos.splice(i, 1);
      renderPhotoPreview();
    });
    wrap.appendChild(thumb);
  });
}

document.getElementById('composer-submit').addEventListener('click', async () => {
  const author = document.getElementById('composer-author').value.trim() || 'Memories';
  const text = document.getElementById('composer-text').value.trim();
  const dateVal = document.getElementById('composer-date').value;
  if (!text && pendingPhotos.length === 0) return;

  localStorage.setItem('memories-author', author);

  const btn = document.getElementById('composer-submit');
  btn.disabled = true;
  try {
    const post = {
      id: makeId(),
      author,
      text,
      timestamp: dateVal ? new Date(dateVal).getTime() : Date.now(),
      photos: pendingPhotos.slice(),
    };
    await dbPut(post);
    document.getElementById('composer-text').value = '';
    document.getElementById('composer-date').value = '';
    pendingPhotos = [];
    renderPhotoPreview();
    await refreshFeed();
  } finally {
    btn.disabled = false;
  }
});

// ---------- backup / restore ----------
document.getElementById('menu-btn').addEventListener('click', () => {
  const panel = document.getElementById('menu-panel');
  panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
});

document.getElementById('export-btn').addEventListener('click', async () => {
  const posts = await dbGetAll();
  const exportable = [];
  for (const p of posts) {
    const photoDataUrls = [];
    for (const blob of (p.photos || [])) {
      photoDataUrls.push(await blobToDataUrl(blob));
    }
    exportable.push({ id: p.id, author: p.author, text: p.text, timestamp: p.timestamp, photos: photoDataUrls });
  }
  const blob = new Blob([JSON.stringify(exportable)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'memories-backup.json';
  a.click();
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const items = JSON.parse(text);
    if (!Array.isArray(items)) throw new Error('not an array');
    for (const item of items) {
      const photos = [];
      for (const dataUrl of (item.photos || [])) {
        photos.push(await dataUrlToBlob(dataUrl));
      }
      await dbPut({ id: item.id || makeId(), author: item.author, text: item.text, timestamp: item.timestamp, photos });
    }
    document.getElementById('menu-panel').style.display = 'none';
    await refreshFeed();
    alert(`Loaded ${items.length} post(s).`);
  } catch (err) {
    alert("Couldn't read that backup file.");
  }
  e.target.value = '';
});

boot();
