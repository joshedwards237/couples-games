import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { HeaderTrophyCount } from '@/components/HeaderTrophyCount';
import { UserMenu } from '@/components/UserMenu';

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isHome = pathname === '/';

  return (
    <div className="min-h-screen bg-background text-textPrimary">
      <div className="mx-auto max-w-xl space-y-6 px-4 py-8">
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
            <HeaderTrophyCount />
            <UserMenu />
          </div>
        </header>
        {children}
      </div>
    </div>
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
