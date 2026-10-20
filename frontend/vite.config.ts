import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "mealz-offline-shell",
      enforce: "post",
      generateBundle(_options, bundle) {
        const assets = Object.keys(bundle).filter((name) =>
          /\.(js|css)$/.test(name),
        );
        const version = createHash("sha256")
          .update(assets.join("|"))
          .digest("hex")
          .slice(0, 12);
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `
const CACHE = 'mealz-react-shell-${version}';
const ROOT = self.registration.scope;
const INDEX = new URL('index.html', ROOT).href;
const ASSETS = ${JSON.stringify(assets)}.map(path => new URL(path, ROOT).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([INDEX, ...ASSETS])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mealz-react-shell-') && key !== CACHE).slice(0, -1).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate' && (request.url.split('#')[0] === ROOT || request.url.split('#')[0] === INDEX)) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(INDEX, copy))); }
      return response;
    }).catch(() => caches.match(INDEX)));
  } else if (ASSETS.includes(request.url)) {
    event.respondWith(caches.match(request.url, { ignoreVary: true }).then(cached => cached || fetch(request)));
  }
});
`,
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@mealz/week-logic": fileURLToPath(
        new URL("../shared-logic.js", import.meta.url),
      ),
      "@mealz/shopping-logic": fileURLToPath(
        new URL("../shopping-logic.js", import.meta.url),
      ),
    },
  },
  optimizeDeps: { include: ["@mealz/week-logic", "@mealz/shopping-logic"] },
  base: "./",
  build: { target: "es2022" },
});
