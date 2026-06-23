const STORAGE_KEY = 'memories-posts';
const PAGE_SIZE = 25;
let allPosts = [];
let filteredPosts = [];
let shown = 0;

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
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsText(file);
  });
}

// ---------- boot ----------
function boot() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      allPosts = JSON.parse(saved);
      showApp();
      return;
    } catch (e) { /* fall through to welcome screen */ }
  }
  document.getElementById('welcome').style.display = 'flex';
}

document.getElementById('welcome-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const errorEl = document.getElementById('welcome-error');
  try {
    const posts = JSON.parse(await readFileAsText(file));
    if (!Array.isArray(posts)) throw new Error('not an array');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    allPosts = posts;
    document.getElementById('welcome').style.display = 'none';
    showApp();
  } catch (err) {
    errorEl.textContent = "Couldn't read that file — make sure it's the posts.json from convert.html.";
  }
});

function showApp() {
  document.getElementById('app').style.display = 'block';
  allPosts.sort((a, b) => b.timestamp - a.timestamp);
  populateYearFilter();
  applyFilter();
}

// ---------- menu: export / reload ----------
document.getElementById('menu-btn').addEventListener('click', () => {
  const panel = document.getElementById('menu-panel');
  panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
});

document.getElementById('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(allPosts, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'posts.json';
  a.click();
});

document.getElementById('reload-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const posts = JSON.parse(await readFileAsText(file));
    if (!Array.isArray(posts)) throw new Error('not an array');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    allPosts = posts;
    document.getElementById('menu-panel').style.display = 'none';
    document.getElementById('year-filter').innerHTML = '<option value="">All years</option>';
    showApp();
  } catch (err) {
    alert("Couldn't read that file — make sure it's a posts.json made by convert.html.");
  }
  e.target.value = '';
});

// ---------- year filter + feed ----------
function populateYearFilter() {
  const years = [...new Set(allPosts.map(p => new Date(p.timestamp).getFullYear()))].sort((a, b) => b - a);
  const select = document.getElementById('year-filter');
  for (const y of years) {
    select.appendChild(el(`<option value="${y}">${y}</option>`));
  }
  select.addEventListener('change', applyFilter);
}

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
      <div class="post-text"></div>
    </article>
  `);
  node.querySelector('.post-text').textContent = p.text || '';
  return node;
}

boot();
