const CACHE_NAME = "shiftcalc-v1";

// Сюда перечисляем ВСЕ файлы, которые нужны офлайн
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./sw.js",

  // если есть отдельные файлы CSS/JS — добавьте их сюда:
  // "./styles.css",
  // "./app.js",

  // иконки (пути должны совпадать с реальными файлами!)
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Для навигации (открытие страниц) — отдаём index.html из кэша
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((res) => res || fetch(event.request))
    );
    return;
  }

  // Для остальных файлов: сначала кэш, если нет — сеть
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
