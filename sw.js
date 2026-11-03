// オフラインでも使えるようにするサービスワーカー（https で開いたときだけ動く）。
// ・アプリのファイルとデータ：まずネットから最新を取り、取れないときは前回保存したものを使う。
//   （データの JSON を書きかえて公開すれば、次に開いたときに反映される）
// ・フォント・作品の写真（Wikimedia）：一度取ったら保存したものを使う。
// ・写真の作者・ライセンス（Wikipedia の API）：保存したものをすぐ使い、裏で新しくする。
const CACHE = 'yokogushi-v2';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/main.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];
const WAIT_MS = 4000; // これより遅いときは保存してある方を先に使う

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'upload.wikimedia.org') e.respondWith(cacheFirst(req));
  else if (/(^|\.)(wikipedia|wikimedia)\.org$/.test(url.hostname) && url.pathname.endsWith('/api.php')) e.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  net.catch(() => {});
  const fallback = async () => (await cache.match(req, { ignoreSearch: true }))
    || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
  try {
    const first = await Promise.race([net, new Promise(r => setTimeout(r, WAIT_MS, null))]);
    if (first) return first;
    return (await fallback()) || await net;
  } catch {
    return (await fallback()) || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  return hit || (await net) || Response.error();
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone()).catch(() => {});
  return res;
}
