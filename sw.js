/* sw.js */
const VERSION = "v272"; // ⬅️ меняйте (v12, v13...), когда хотите принудительно обновить кэш
const CACHE_NAME = `shiftcalc-${VERSION}`;

// ⬇️ Убедитесь, что эти файлы реально существуют по этим путям в вашем репозитории
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
 
];

// Рассылка сообщений всем открытым вкладкам/окнам
async function broadcast(message) {
  const clientsList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });
  for (const client of clientsList) client.postMessage(message);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    // Показать "Обновление данных. Ждите."
    await broadcast({ type: "UPDATING", text: "Обновление данных. Ждите." });

    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);

    // Чтобы новая версия быстрее применялась (иначе будет ждать закрытия вкладки)
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Удаляем старые кэши
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
    );

    // Забираем контроль над страницами
    await self.clients.claim();

    // Можно сообщить, что обновление завершено
    await broadcast({ type: "UPDATED" });
  })());
});

// NAVIGATION (HTML): cache-first, чтобы офлайн-reload работал,
// и фоновое обновление кэша при наличии интернета.
async function handleNavigation(request, event) {
  const cache = await caches.open(CACHE_NAME);

  // Сначала пробуем взять из кэша
  const cached =
    (await cache.match(request, { ignoreSearch: true })) ||
    (await cache.match("./index.html")) ||
    (await cache.match("./"));

  // В фоне пробуем подтянуть свежий index.html из сети
  const updatePromise = fetch(request)
    .then(async (resp) => {
      if (resp && resp.ok) {
        // Для навигации кэшируем именно index.html и корень
        await cache.put("./index.html", resp.clone());
        await cache.put("./", resp.clone());
      }
      return resp;
    })
    .catch(() => null);

  // Если есть кэш — сразу отдаём его (это решает “перезагрузку без интернета”)
  if (cached) {
    event.waitUntil(updatePromise);
    return cached;
  }

  // Если кэша нет — пробуем сеть
  const net = await updatePromise;
  if (net) return net;

  // Совсем без кэша и без сети
  return new Response("Оффлайн. Данные еще не закэшированы.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

// ASSETS (css/js/png/json): cache-first + обновление в фоне
async function handleAsset(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });

  if (cached) {
    event.waitUntil(
      fetch(request)
        .then((resp) => {
          if (resp && resp.ok) cache.put(request, resp.clone());
        })
        .catch(() => {})
    );
    return cached;
  }

  try {
    const resp = await fetch(request);
    if (resp && resp.ok) cache.put(request, resp.clone());
    return resp;
  } catch (_) {
    return new Response("", { status: 504 });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  // Главное: навигация (обновление/перезагрузка страницы)
  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(req, event));
    return;
  }

  // Остальные файлы (иконки, css, js, manifest...)
  event.respondWith(handleAsset(req, event));
});




