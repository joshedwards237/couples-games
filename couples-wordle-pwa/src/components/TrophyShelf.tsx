import { useEffect, useState } from 'react';
import { Loader2, Trophy as TrophyIcon } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TROPHY_META, fetchMyTrophies, fetchMyTrophyStats } from '@/lib/trophies';
import type { Trophy, TrophyStats, TrophyTier } from '@/lib/types';

interface Props {
  userId: string;
}

export function TrophyShelf({ userId }: Props) {
  const [stats, setStats] = useState<TrophyStats | null>(null);
  const [recent, setRecent] = useState<Trophy[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [s, t] = await Promise.all([
          fetchMyTrophyStats(userId),
          fetchMyTrophies(userId, 10)
        ]);
        if (cancelled) return;
        setStats(s);
        setRecent(t);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? 'Could not load trophies');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (err) {
    return (
      <Card className="border-red-200 bg-red-50">
        <p className="text-sm text-red-700">{err}</p>
      </Card>
    );
  }

  if (!stats || !recent) {
    return (
      <Card className="bg-white/80 backdrop-blur">
        <p className="flex items-center gap-2 text-sm text-textSecondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading trophies…
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 bg-white/80 backdrop-blur">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2">
          <TrophyIcon className="h-5 w-5 text-accent" />
          {stats.total} {stats.total === 1 ? 'trophy' : 'trophies'}
        </CardTitle>
        <CardDescription className="flex flex-wrap gap-2">
          <TierChip tier="bronze" count={stats.byTier.bronze} />
          <TierChip tier="silver" count={stats.byTier.silver} />
          <TierChip tier="gold" count={stats.byTier.gold} />
          {stats.byTier.platinum > 0 && <TierChip tier="platinum" count={stats.byTier.platinum} />}
        </CardDescription>
      </CardHeader>

      {recent.length === 0 ? (
        <p className="text-sm text-textSecondary">Win a puzzle to earn your first trophy.</p>
      ) : (
        <ul className="space-y-2">
          {recent.map((t) => (
            <li key={t.id} className="flex items-center gap-3 text-sm">
              <TrophyBadge tier={t.tier} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{TROPHY_META[t.kind]?.label ?? t.kind}</p>
                <p className="text-xs text-textSecondary">{TROPHY_META[t.kind]?.description}</p>
              </div>
              <span className="shrink-0 text-xs text-textSecondary">{formatDate(t.earnedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function TrophyBadge({ tier, className }: { tier: TrophyTier; className?: string }) {
  const colors: Record<TrophyTier, string> = {
    bronze: 'bg-amber-600/15 text-amber-700 border-amber-600/30',
    silver: 'bg-slate-400/15 text-slate-600 border-slate-400/40',
    gold: 'bg-yellow-400/20 text-yellow-700 border-yellow-500/40',
    platinum: 'bg-indigo-400/15 text-indigo-700 border-indigo-400/40'
  };
  return (
    <span
      className={cn(
        'grid h-7 w-7 shrink-0 place-items-center rounded-full border',
        colors[tier],
        className
      )}
    >
      <TrophyIcon className="h-3.5 w-3.5" />
    </span>
  );
}

function TierChip({ tier, count }: { tier: TrophyTier; count: number }) {
  if (count === 0) return null;
  const labels: Record<TrophyTier, string> = {
    bronze: 'Bronze',
    silver: 'Silver',
    gold: 'Gold',
    platinum: 'Platinum'
  };
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <TrophyBadge tier={tier} className="h-5 w-5" />
      {count} {labels[tier]}
    </span>
  );
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
