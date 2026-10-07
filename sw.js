"use strict";

const CACHE_NAME = "shindanshi-drill-v2";
const ASSETS = [
  "./", "./index.html", "./style.css", "./app.js", "./manifest.json",
  "./icon.svg", "./apple-touch-icon.png",
  "./data/economics.js", "./data/finance.js", "./data/management.js",
  "./data/operations.js", "./data/law.js", "./data/infosys.js",
  "./data/policy.js", "./data/case2.js",
  "./data/exam-economics.js", "./data/exam-finance.js", "./data/exam-management.js", "./data/exam-operations.js", "./data/exam-law.js", "./data/exam-infosys.js", "./data/exam-policy.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネットワーク優先・失敗したらキャッシュ（更新が反映されやすい方式）
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
