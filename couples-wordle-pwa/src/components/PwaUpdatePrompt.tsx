import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Floating toast that appears when a newer service-worker version is
 * waiting. Clicking "Reload" activates the new SW and refreshes the
 * page so the latest JS/CSS bundles take effect immediately.
 *
 * To keep the flow to a single reload after a deploy, we:
 *   1. Kick `registration.update()` the instant the SW is registered, so
 *      the new sw.js is fetched at page-load time instead of on the
 *      browser's internal cache schedule.
 *   2. Re-run `registration.update()` whenever the tab becomes visible /
 *      focused, so background tabs that were open during a deploy pick
 *      up the update the moment the user comes back to them.
 * Combined, the user sees the "New version available" toast almost
 * immediately after a deploy, without needing multiple refreshes.
 */
const UPDATE_POLL_MS = 60_000;

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // Swallow transient failures — an offline laptop shouldn't fire
      // unhandled-rejection warnings.
      const checkForUpdate = () => {
        registration.update().catch(() => {
          /* noop */
        });
      };

      // Once the prompt is showing there's nothing left to check for.
      const shouldCheck = () =>
        document.visibilityState === 'visible' && !registration.waiting;

      // Immediate check on registration.
      if (shouldCheck()) checkForUpdate();

      // Re-check whenever the tab becomes visible or regains focus, so
      // long-lived tabs pick up the update the moment the user returns.
      const onVisible = () => {
        if (shouldCheck()) checkForUpdate();
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);

      // Belt-and-braces poll while the tab is open and visible AND no
      // waiting SW has arrived yet. Listeners outlive the component —
      // there's only ever one PwaUpdatePrompt mount per session.
      window.setInterval(() => {
        if (shouldCheck()) checkForUpdate();
      }, UPDATE_POLL_MS);
    },
    onRegisterError(err: unknown) {
      console.error('SW registration failed', err);
    }
  });

  const [reloading, setReloading] = useState(false);

  if (!needRefresh) return null;

  const handleReload = () => {
    if (reloading) return;
    setReloading(true);
    void updateServiceWorker(true);
    // vite-plugin-pwa relies on `controllerchange` to trigger the reload,
    // but Chrome occasionally fails to fire it (no SW was waiting, or the
    // controller was already this version). Force a reload after a short
    // grace period so the spinner never spins forever.
    window.setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-4 left-1/2 z-[200] w-[min(92vw,360px)] -translate-x-1/2',
        'rounded-lg border border-accent/30 bg-white/95 p-3 shadow-xl backdrop-blur',
        'flex items-center gap-3'
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">New version available</p>
        <p className="text-xs text-textSecondary">Reload to get the latest fixes.</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setNeedRefresh(false)}
        disabled={reloading}
      >
        Later
      </Button>
      <Button
        size="sm"
        onClick={handleReload}
        disabled={reloading}
        aria-label={reloading ? 'Reloading' : 'Reload'}
        className="min-w-[72px]"
      >
        {reloading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reload'}
      </Button>
    </div>
  );
}
