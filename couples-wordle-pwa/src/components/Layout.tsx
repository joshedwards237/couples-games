import { Link, useLocation } from 'react-router-dom';
import { cn } from '../utils/cn';

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isHome = pathname === '/';

  return (
    <div className="min-h-screen bg-background text-textPrimary">
      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-textSecondary">Couples Wordle</p>
            <h1
              className="text-2xl sm:text-3xl font-bold"
              style={{ fontFamily: 'SF Pro Rounded, system-ui' }}
            >
              Daily puzzles for two.
            </h1>
          </div>
          {!isHome && (
            <Link className="text-sm text-accent" to="/">
              ← Home
            </Link>
          )}
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
