import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/components/UserMenu';

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari exposes legacy navigator.standalone; modern browsers
  // expose the display-mode media query.
  const legacy = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const modern =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return legacy || modern;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsStandalone(isStandaloneDisplay());
  }, []);

  return (
    <div className="min-h-screen bg-background text-textPrimary overflow-x-hidden">
      <div className="app-container mx-auto flex max-w-xl flex-col gap-6 py-8">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-textSecondary">Couples Wordle</p>
            <h1 className="font-heading text-2xl font-bold sm:text-3xl">
              Daily puzzles for two.
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {!isHome && (
              <Link className="text-sm text-accent" to="/">
                ← Back
              </Link>
            )}
            {isStandalone && <RefreshButton />}
            <UserMenu />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

/**
 * Header refresh button. A plain `location.reload()` in a precache-first
 * PWA re-serves stale HTML from the SW — useless for the very "the app
 * is stuck on yesterday" case this button exists to fix. So: kick
 * `registration.update()`, activate any waiting worker via SKIP_WAITING,
 * and sequence the reload after `controllerchange` (with a failsafe).
 * If there's no update, we still reload to clear component state.
 */
function RefreshButton() {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          // Try to activate an already-waiting SW, or fetch a fresh one.
          if (!reg.waiting) {
            try {
              await reg.update();
            } catch {
              /* network hiccup — fall through to plain reload */
            }
            // Give a newly-installing worker a brief window to reach 'installed'.
            if (reg.installing) {
              await new Promise<void>((resolve) => {
                const nw = reg.installing!;
                const timer = window.setTimeout(() => resolve(), 2000);
                nw.addEventListener('statechange', () => {
                  if (nw.state === 'installed') {
                    window.clearTimeout(timer);
                    resolve();
                  }
                });
              });
            }
          }
          const waiting = reg.waiting;
          if (waiting) {
            const onChange = () => {
              navigator.serviceWorker.removeEventListener('controllerchange', onChange);
              window.location.reload();
            };
            navigator.serviceWorker.addEventListener('controllerchange', onChange);
            waiting.postMessage({ type: 'SKIP_WAITING' });
            window.setTimeout(() => {
              navigator.serviceWorker.removeEventListener('controllerchange', onChange);
              window.location.reload();
            }, 2000);
            return;
          }
        }
      }
    } catch {
      /* swallow — always reload as fallback */
    }
    window.location.reload();
  };

  return (
    <button
      type="button"
      aria-label="Refresh"
      title="Refresh"
      onClick={handleClick}
      disabled={busy}
      className={cn(
        'rounded-full p-2 text-textSecondary hover:text-textPrimary hover:bg-white/60 transition',
        busy && 'opacity-60'
      )}
    >
      <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
    </button>
  );
}

export function Pill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border shadow-sm',
        active
          ? 'bg-accent text-white border-accent shadow-accent/30'
          : 'bg-surface text-textSecondary border-white/60'
      )}
    >
      {label}
    </span>
  );
}
