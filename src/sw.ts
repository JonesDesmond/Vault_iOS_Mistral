// Service worker: offline support (precache all build assets incl. the bundled OCR
// engine) plus the "share to app" target. Everything is served same-origin.

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> };

import { precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const SHARE_CACHE = 'share-target';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const cache = await caches.open(SHARE_CACHE);
          let i = 0;
          for (const value of formData.values()) {
            if (value instanceof File && value.size > 0) {
              await cache.put(
                `${url.origin}/share-target/file-${i++}`,
                new Response(value, { headers: { 'Content-Type': value.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(value.name || `file-${i}`) } })
              );
            }
          }
          const title = formData.get('title');
          const text = formData.get('text');
          const sharedUrl = formData.get('url');
          if (title || text || sharedUrl) {
            await cache.put(`${url.origin}/share-target/note`, new Response(JSON.stringify({ title, text, url: sharedUrl }), { headers: { 'Content-Type': 'application/json' } }));
          }
        } catch {
          // fall through to the app anyway
        }
        return Response.redirect(`${url.origin}${import.meta.env.BASE_URL}#/inbox?shared=1`, 303);
      })()
    );
  }
});
