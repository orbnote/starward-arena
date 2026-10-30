/* Service Worker：让「加到主屏」后断网也能开，同时不让玩家卡在旧版本。
   两条策略分开走：
   - 页面本身（navigation）network-first，2.5 秒不回就吃缓存。发版立即生效，
     弱网也不至于对着一片白等十几秒。
   - 静态资源 stale-while-revalidate。这些请求都带 ?v=NNN，缓存里那份就是
     对的那个版本，永远不会出现「新 HTML 配旧 JS」。 */
const CACHE = 'orb-arena-shell-v3';

/* 只预缓存页面骨架本身。
   JS/CSS 在页面里都带 ?v=NNN，硬编码版本号会跟 index.html 脱钩，
   所以它们交给运行时缓存：第一次访问就顺手存下，之后断网能开。
   install 阶段拉得少，装得也快。 */
const CORE = [
  './',
  './index.html',
  './assets/icon/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE))
      .catch(() => {})            /* 单个文件缺失不阻断安装 */
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 先吐缓存立刻出图，同时后台拉新的塞回去。下次进就是新版本 */
function staleWhileRevalidate(req) {
  return caches.open(CACHE).then((cache) =>
    cache.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      }).catch(() => null);
      if (hit) {
        net.catch(() => {});      /* 后台失败无所谓，手上这份还能用 */
        return hit;
      }
      return net.then((r) => r || Response.error());
    })
  );
}

/* 页面：网络优先，超时兜底。不能让「改完发上去」这件事被缓存挡住 */
function navFirst(req, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const fromCache = () => {
      if (done) return;
      done = true;
      caches.match(req)
        .then((hit) => hit || caches.match('./index.html'))
        .then((r) => resolve(r || Response.error()));
    };
    const timer = setTimeout(fromCache, timeoutMs);
    fetch(req).then((res) => {
      clearTimeout(timer);
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      if (!done) { done = true; resolve(res); }
    }).catch(() => { clearTimeout(timer); fromCache(); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(navFirst(req, 2500));
    return;
  }
  e.respondWith(staleWhileRevalidate(req));
});
