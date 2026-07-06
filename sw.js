// ============================================================
// 知意小记 — Service Worker (PWA离线缓存)
// ============================================================

const CACHE_NAME = 'zhiyi-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// 安装：预缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('部分资源缓存失败:', err);
      });
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截：缓存策略
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 跳过非GET请求
  if (event.request.method !== 'GET') return;

  // 跳过 Supabase API 请求（始终走网络）
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 跳过 Chrome 扩展请求
  if (url.protocol === 'chrome-extension:') return;

  // CDN 资源（Tailwind, Supabase SDK）: 缓存优先
  if (url.hostname.includes('cdn.tailwindcss.com') ||
      url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // 静态资源：缓存优先
  event.respondWith(cacheFirst(event.request));
});

// 缓存优先策略
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // 离线时返回缓存（即使过期）
    const fallback = await caches.match(request);
    if (fallback) return fallback;
    // 导航请求返回首页
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    return new Response('离线模式，请连接网络后重试', { status: 503 });
  }
}

// 网络优先策略（用于API请求）
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: '网络请求失败' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
