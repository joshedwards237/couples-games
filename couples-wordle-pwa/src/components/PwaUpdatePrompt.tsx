import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Floating toast that appears when a newer service-worker version is
 * waiting. Clicking "Reload" activates the new SW and refreshes the
 * page so the latest JS/CSS bundles take effect immediately.
 *
 * Without this, users who have the site cached from a previous deploy
 * stay on the old bundle until they close the tab (or manually reload
 * with caches bypassed), which is how deploys quietly fail to reach
 * existing users.
 */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisterError(err: unknown) {
      console.error('SW registration failed', err);
    }
  });

  if (!needRefresh) return null;

  const handleReload = () => {
    void updateServiceWorker(true);
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
      <Button variant="ghost" size="sm" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
      <Button size="sm" onClick={handleReload}>
        Reload
      </Button>
    </div>
  );
}
