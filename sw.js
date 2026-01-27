/* sw.js */
const VERSION = "v1";               // ← при каждом релизе меняйте версию
const CACHE_NAME = `shiftcalc-${VERSION}`;

// В GitHub Pages важно кэшировать и "./" и "./index.html"
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

// Сообщение всем открытым вкладкам/окнам
async function broadcast(message) {
  const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clientsList) client.postMessage(message);
}

// Установка: предкэш + уведомление
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await broadcast({ type: "UPDATING", text: "Обновление данных. Ждите." });
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    // Можно не делать skipWaiting, чтобы обновление происходило “мягко”.
    // Но если хотите быстрее применять обновления — раскомментируйте:
    // await self.skipWaiting();
  })());
});

// Активация: удалить старые кэши + забрать управление + уведомление
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
    await broadcast({ type: "UPDATED" });
  })());
});

// Стратегия для NAVIGATION (HTML):
// 1) Отдаем из кэша (чтобы офлайн-reload работал)
// 2) Параллельно пытаемся обновить кэш из сети (если сеть есть)
async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  // Пытаемся найти точный матч (например, "./" или "./index.html")
  const cached = await cache.match(request, { ignoreSearch: true })
    || await cache.match("./index.html")
    || await cache.match("./");

  const networkFetch = fetch(request)
    .then(async (resp) => {
      // Обновляем кэш только если нормальный ответ
      if (resp && resp.ok) {
        // Для навигации безопаснее кэшировать именно index.html:
        await cache.put("./index.html", resp.clone());
        await cache.put("./", resp.clone());
      }
      return resp;
    })
    .catch(() => null);

  // Если офлайн — вернем cached, если онлайн — вернем сеть, но cached тоже годится
  if (cached) {
    // Запускаем обновление в фоне (не блокируя ответ)
    eventWaitUntilSafe(networkFetch);
    return cached;
  }

  const net = await networkFetch;
  if (net) return net;

  // Полный офлайн и нет кэша (редко) — fallback
  return new Response("Оффлайн. Данные еще не закэшированы.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

// Helper: event.waitUntil недоступен внутри функции напрямую — делаем безопасный вызов
let _lastEvent = null;
function eventWaitUntilSafe(promise) {
  try {
    if (_lastEvent && typeof _lastEvent.waitUntil === "function") {
      _lastEvent.waitUntil(promise);
    }
  } catch (_) {}
}

// Статика (css/js/png/json): cache-first + update in background
async function handleAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) {
    // фон-обновление
    eventWaitUntilSafe(
      fetch(request).then((resp) => {
        if (resp && resp.ok) cache.put(request, resp.clone());
      }).catch(() => {})
    );
    return cached;
  }

  try {
    const resp = await fetch(request);
    if (resp && resp.ok) cache.put(request, resp.clone());
    return resp;
  } catch (e) {
    return new Response("", { status: 504 });
  }
}

self.addEventListener("fetch", (event) => {
  _lastEvent = event;

  const req = event.request;

  // Только GET
  if (req.method !== "GET") return;

  // NAVIGATION: самый важный кейс для офлайн-reload
  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(req));
    return;
  }

  // Остальные ассеты
  event.respondWith(handleAsset(req));
});
