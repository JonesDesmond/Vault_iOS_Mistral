// "Share to app": the service worker stores shared files in a Cache bucket,
// the app picks them up here and moves them into the inbox (IndexedDB).

import { db, uid } from '../db';

export async function collectSharedFiles(): Promise<number> {
  if (!('caches' in window)) return 0;
  const cacheNames = await caches.keys();
  if (!cacheNames.includes('share-target')) return 0;
  const cache = await caches.open('share-target');
  const requests = await cache.keys();
  let count = 0;
  for (const req of requests) {
    const res = await cache.match(req);
    if (!res) continue;
    if (req.url.endsWith('/note')) {
      const note = JSON.parse(await res.text()) as { title?: string; text?: string; url?: string };
      const text = [note.title, note.text, note.url].filter(Boolean).join('\n');
      await db.inbox.add({
        id: uid(), name: 'shared-link.txt', type: 'text/plain', size: text.length,
        blob: new Blob([text], { type: 'text/plain' }), receivedAt: new Date().toISOString()
      });
      count += 1;
    } else {
      const blob = await res.blob();
      const name = decodeURIComponent(res.headers.get('X-File-Name') ?? '') || 'shared-file';
      await db.inbox.add({
        id: uid(), name, type: blob.type || 'application/octet-stream', size: blob.size,
        blob, receivedAt: new Date().toISOString()
      });
      count += 1;
    }
    await cache.delete(req);
  }
  if (count > 0) await caches.delete('share-target');
  return count;
}
