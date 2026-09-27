/* オフライン対応：一度開いたらアプリ一式をキャッシュし、電波がなくても起動できるようにする。
   アプリを更新したら VERSION を上げること（古いキャッシュが消え、新しいファイルが入る）。 */
const VERSION = '2026-09-27a';
const CACHE = `stage-planner-${VERSION}`;
const FONT_CACHE = 'stage-planner-fonts';
const ASSETS = [
  './', 'index.html', 'help.html', 'style.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/core.js', 'js/render.js', 'js/editor.js', 'js/tools.js', 'js/panels.js', 'js/io.js', 'js/view3d.js', 'js/main.js',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/three.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('stage-planner-') && k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// ネットワーク優先（最新版を使う）。3秒で応答がなければキャッシュで起動する。
function networkFirst(req) {
  return new Promise(resolve => {
    let done = false;
    const fallback = () => caches.match(req, { ignoreSearch: true }).then(r => { if (!done && r) { done = true; resolve(r); } return r; });
    const timer = setTimeout(fallback, 3000);
    fetch(req).then(res => {
      clearTimeout(timer);
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      if (!done) { done = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      fallback().then(r => { if (!done) { done = true; resolve(r || Response.error()); } });
    });
  });
}

// フォント（Google Fonts）はキャッシュ優先。取れなければ端末のフォントで表示される。
function cacheFirst(req) {
  return caches.open(FONT_CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
    return res;
  })));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(cacheFirst(req));
});
