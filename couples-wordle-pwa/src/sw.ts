/// <reference lib="webworker" />
// Custom service worker. vite-plugin-pwa is configured with
// `strategies: 'injectManifest'` so it compiles this file and injects the
// precache manifest into `self.__WB_MANIFEST`.
//
// On top of the default precache behavior we add Web Push handling for the
// daily 10 AM Denver reminder (see supabase/functions/send-daily-reminders).

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Allow the "Reload" button in PwaUpdatePrompt to activate a waiting SW
// immediately instead of waiting for all tabs to close.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
};

self.addEventListener('push', (event: PushEvent) => {
  let data: PushPayload = {};
  try {
    data = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    data = { body: event.data?.text() };
  }

  const title = data.title ?? "Today's Wordle is waiting";
  const body = data.body ?? 'Tap to play before the day ends.';
  const url = data.url ?? '/';
  const tag = data.tag ?? 'daily-reminder';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag,
      // renotify: true — ask the OS to re-alert even if a prior
      // notification with this tag exists. Not in every lib.dom yet, so
      // cast to any to pass TS strict.
      ...({ renotify: true } as Record<string, unknown>),
      data: { url }
    } as NotificationOptions)
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of clientsList) {
        try {
          await c.focus();
          if ('navigate' in c) {
            await (c as WindowClient).navigate(url);
          }
          return;
        } catch {
          /* fall through to openWindow */
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
