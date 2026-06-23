// ---------- IndexedDB ----------
// NOTE: keep schema (DB_NAME, DB_VERSION, store names) in sync with sw.js
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
async function shareGetAllAndClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE, 'readwrite');
    const store = tx.objectStore(SHARE_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const items = req.result;
      store.clear();
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

// ---------- state ----------
let allPosts = [];
let filteredPosts = [];
let shown = 0;
let pendingPhotos = []; // array of File/Blob objects for the composer
const PAGE_SIZE = 20;
const photoUrlCache = new WeakMap(); // Blob -> object URL, avoids recreating URLs on every re-render

function getPhotoUrl(blob) {
  let url = photoUrlCache.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    photoUrlCache.set(blob, url);
  }
  return url;
}
function revokePostPhotoUrls(post) {
  for (const blob of (post.photos || [])) {
    const url = photoUrlCache.get(blob);
    if (url) { URL.revokeObjectURL(url); photoUrlCache.delete(blob); }
  }
}

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
function isVideoFile(file) {
  if (file && file.type) return file.type.startsWith('video/');
  return /\.(mp4|mov|webm|mkv|avi|3gp|m4v)$/i.test((file && file.name) || '');
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

// ---------- profile ----------
function getProfileName() {
  return localStorage.getItem('memories-profile-name') || '';
}
function setProfileName(name) {
  localStorage.setItem('memories-profile-name', name);
}
function showProfileSetup(prefill) {
  const overlay = document.getElementById('profile-setup');
  const input = document.getElementById('profile-name-input');
  input.value = prefill || '';
  overlay.style.display = 'flex';
  input.focus();
}
function hideProfileSetup() {
  document.getElementById('profile-setup').style.display = 'none';
}
function applyProfileToComposer() {
  const name = getProfileName();
  document.getElementById('composer-avatar').textContent = initials(name);
  document.getElementById('composer-name-display').textContent = name;
}

document.getElementById('profile-save-btn').addEventListener('click', () => {
  const name = document.getElementById('profile-name-input').value.trim();
  if (!name) { document.getElementById('profile-name-input').focus(); return; }
  setProfileName(name);
  hideProfileSetup();
  applyProfileToComposer();
  document.getElementById('app').style.display = 'block';
});
document.getElementById('profile-name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('profile-save-btn').click();
});

document.getElementById('change-name-btn').addEventListener('click', () => {
  document.getElementById('menu-panel').style.display = 'none';
  showProfileSetup(getProfileName());
});

// ---------- boot ----------
async function boot() {
  registerServiceWorker();
  setupTimelineDrag();

  const name = getProfileName();
  if (!name) {
    showProfileSetup('');
    // app stays hidden until profile-save-btn is clicked
  } else {
    applyProfileToComposer();
    document.getElementById('app').style.display = 'block';
  }

  await refreshFeed();
  await pickUpSharedContent();
}

async function pickUpSharedContent() {
  if (!location.search.includes('shared=1')) return;
  history.replaceState(null, '', location.pathname);
  try {
    const items = await shareGetAllAndClear();
    if (!items.length) return;
    const latest = items.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (latest.text) document.getElementById('composer-text').value = latest.text;
    if (latest.files && latest.files.length) {
      pendingPhotos = pendingPhotos.concat(latest.files);
      renderPhotoPreview();
    }
    document.getElementById('composer-text').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e) { /* nothing shared, or storage not ready yet - ignore */ }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* ignore - share-from-WhatsApp just won't be available */ });
  }
}

async function refreshFeed() {
  try {
    allPosts = await dbGetAll();
  } catch (e) {
    allPosts = [];
    showStorageError();
  }
  allPosts.sort((a, b) => b.timestamp - a.timestamp);
  rebuildTimelineRail();
  setFilterMode(filterMode);
}

function showStorageError() {
  alert(
    "This browser won't let this page save anything (storage is blocked). " +
    "This usually happens in a private/incognito window, or if you opened this file " +
    "directly instead of through its real web address. Try opening the site's actual " +
    "link (e.g. the github.io address) in a normal browser tab."
  );
}

// ---------- filtering ----------
let filterMode = { type: 'all' }; // { type:'all' } | { type:'year', year } | { type:'onThisDay' }

function rebuildTimelineRail() {
  const rail = document.getElementById('timeline-rail');
  rail.innerHTML = '';
  const allBtn = el(`<button class="tl-all">ALL</button>`);
  allBtn.addEventListener('click', () => setFilterMode({ type: 'all' }));
  rail.appendChild(allBtn);
  const years = [...new Set(allPosts.map(p => new Date(p.timestamp).getFullYear()))].sort((a, b) => b - a);
  years.forEach(y => {
    const btn = el(`<button class="tl-year" data-year="${y}">'${String(y).slice(2)}</button>`);
    rail.appendChild(btn);
  });
  highlightActiveInRail();
}
function highlightActiveInRail() {
  document.querySelectorAll('.timeline-rail .tl-year, .timeline-rail .tl-all').forEach(b => b.classList.remove('active'));
  if (filterMode.type === 'year') {
    const btn = document.querySelector(`.timeline-rail .tl-year[data-year="${filterMode.year}"]`);
    if (btn) btn.classList.add('active');
  } else if (filterMode.type === 'all') {
    const btn = document.querySelector('.timeline-rail .tl-all');
    if (btn) btn.classList.add('active');
  }
}

function setupTimelineDrag() {
  const rail = document.getElementById('timeline-rail');
  const bubble = document.createElement('div');
  bubble.className = 'timeline-bubble';
  document.body.appendChild(bubble);

  function yearAtY(clientY) {
    const buttons = Array.from(rail.querySelectorAll('.tl-year'));
    if (!buttons.length) return null;
    let closest = null, minDist = Infinity;
    for (const b of buttons) {
      const rect = b.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - clientY);
      if (dist < minDist) { minDist = dist; closest = b; }
    }
    return closest ? Number(closest.dataset.year) : null;
  }
  function handleMove(clientY) {
    const year = yearAtY(clientY);
    if (year == null) return;
    bubble.textContent = year;
    bubble.style.top = Math.max(10, clientY - 20) + 'px';
    bubble.style.display = 'block';
    if (!(filterMode.type === 'year' && filterMode.year === year)) {
      setFilterMode({ type: 'year', year });
    }
  }
  function hideBubble() { bubble.style.display = 'none'; }

  rail.addEventListener('pointerdown', (e) => {
    if (e.target.classList.contains('tl-all')) return;
    rail.setPointerCapture(e.pointerId);
    handleMove(e.clientY);
  });
  rail.addEventListener('pointermove', (e) => {
    if (e.buttons === 0 && e.pointerType !== 'touch') return;
    handleMove(e.clientY);
  });
  rail.addEventListener('pointerup', hideBubble);
  rail.addEventListener('pointercancel', hideBubble);
}

function computeFilteredPosts() {
  if (filterMode.type === 'year') {
    filteredPosts = allPosts.filter(p => new Date(p.timestamp).getFullYear() === filterMode.year);
  } else if (filterMode.type === 'onThisDay') {
    const now = new Date();
    filteredPosts = allPosts.filter(p => {
      const d = new Date(p.timestamp);
      return d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    });
  } else {
    filteredPosts = allPosts;
  }
}

function updateFeedHeading() {
  const heading = document.getElementById('feed-heading');
  const text = document.getElementById('feed-heading-text');
  if (filterMode.type === 'year') {
    text.textContent = String(filterMode.year);
    heading.style.display = 'flex';
  } else if (filterMode.type === 'onThisDay') {
    const dateStr = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    text.textContent = `From the vault: ${dateStr}, across the years`;
    heading.style.display = 'flex';
  } else {
    heading.style.display = 'none';
  }
}

function setFilterMode(mode) {
  filterMode = mode;
  shown = 0;
  document.getElementById('posts').innerHTML = '';
  computeFilteredPosts();
  updateFeedHeading();
  highlightActiveInRail();
  renderMore();
}
document.getElementById('feed-heading-clear').addEventListener('click', () => setFilterMode({ type: 'all' }));
document.getElementById('vault-today-btn').addEventListener('click', () => {
  setFilterMode({ type: 'onThisDay' });
  document.getElementById('feed-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---------- home / scroll-to-top button ----------
window.addEventListener('scroll', () => {
  document.getElementById('home-btn').style.display = window.scrollY > 400 ? 'flex' : 'none';
});
document.getElementById('home-btn').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

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
      const url = getPhotoUrl(blob);
      if (isVideoFile(blob)) {
        const video = el(`<video src="${url}" controls playsinline preload="metadata"></video>`);
        video.addEventListener('error', () => {
          video.replaceWith(el(`<div class="media-error">⚠ This video couldn't be played in this browser.</div>`));
        });
        grid.appendChild(video);
      } else {
        const img = el(`<img src="${url}" loading="lazy">`);
        img.addEventListener('click', () => openLightbox(url));
        grid.appendChild(img);
      }
    });
  }
  node.querySelector('.delete-btn').addEventListener('click', async () => {
    if (!confirm('Delete this post?')) return;
    await dbDelete(p.id);
    revokePostPhotoUrls(p);
    node.remove();
    allPosts = allPosts.filter(x => x.id !== p.id);
    rebuildTimelineRail();
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
  const files = Array.from(e.target.files || []);
  const big = files.find(f => f.size > 150 * 1024 * 1024);
  if (big) {
    alert(
      `"${big.name}" is quite large (${Math.round(big.size / 1024 / 1024)}MB). It should still work, ` +
      `but very large videos can take a while to save, or fail if your phone is low on free space. ` +
      `If "Put it in the vault" seems to do nothing after adding this, try a shorter clip.`
    );
  }
  pendingPhotos = pendingPhotos.concat(files);
  renderPhotoPreview();
  e.target.value = '';
});
let pendingPhotoUrls = []; // tracks preview URLs so they can be revoked on re-render
function renderPhotoPreview() {
  const wrap = document.getElementById('photo-preview');
  wrap.innerHTML = '';
  pendingPhotoUrls.forEach(u => URL.revokeObjectURL(u));
  pendingPhotoUrls = [];
  pendingPhotos.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    pendingPhotoUrls.push(url);
    const isVideo = isVideoFile(file);
    const mediaTag = isVideo
      ? `<video src="${url}" muted playsinline preload="metadata"></video><span class="play-badge">▶</span>`
      : `<img src="${url}">`;
    const thumb = el(`<div class="thumb">${mediaTag}<button class="remove-btn">✕</button></div>`);
    if (isVideo) {
      thumb.querySelector('video').addEventListener('error', () => {
        thumb.querySelector('video').replaceWith(el(`<span class="play-badge">🎬</span>`));
      });
    }
    thumb.querySelector('.remove-btn').addEventListener('click', () => {
      pendingPhotos.splice(i, 1);
      renderPhotoPreview();
    });
    wrap.appendChild(thumb);
  });
}

document.getElementById('composer-submit').addEventListener('click', async () => {
  const text = document.getElementById('composer-text').value.trim();
  const dateVal = document.getElementById('composer-date').value;
  const hint = document.getElementById('composer-hint');

  if (!text && pendingPhotos.length === 0) {
    hint.style.display = 'block';
    setTimeout(() => { hint.style.display = 'none'; }, 2500);
    return;
  }
  hint.style.display = 'none';

  const author = getProfileName() || 'Memories';
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
    allPosts.push(post);
    allPosts.sort((a, b) => b.timestamp - a.timestamp);
    rebuildTimelineRail();
    setFilterMode(filterMode);
  } catch (e) {
    if (e && e.name === 'QuotaExceededError') {
      alert(
        "Couldn't save this post — you're out of storage space, most likely because of a large " +
        "video. Try a shorter clip, delete some old posts to free up room, or download a backup " +
        "(⋮ menu) and clear some space on your phone."
      );
    } else {
      showStorageError();
    }
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

// ---------- WhatsApp share help modal ----------
document.getElementById('share-help-btn').addEventListener('click', () => {
  document.getElementById('menu-panel').style.display = 'none';
  document.getElementById('share-help').style.display = 'flex';
});
document.getElementById('share-help-close').addEventListener('click', () => {
  document.getElementById('share-help').style.display = 'none';
});

boot();
