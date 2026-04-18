import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Lock, Trophy as TrophyIcon } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  TROPHY_META,
  fetchMyTrophies,
  fetchMyTrophyStats,
  fetchTrophyProgress
} from '@/lib/trophies';
import type {
  Trophy,
  TrophyCategory,
  TrophyKind,
  TrophyProgress,
  TrophyStats,
  TrophyTier
} from '@/lib/types';

interface Props {
  userId: string;
}

export function TrophyShelf({ userId }: Props) {
  const [stats, setStats] = useState<TrophyStats | null>(null);
  const [trophies, setTrophies] = useState<Trophy[] | null>(null);
  const [progress, setProgress] = useState<TrophyProgress | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Set<TrophyCategory>>(
    () => new Set(['headtohead', 'couple'])
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [s, t, p] = await Promise.all([
          fetchMyTrophyStats(userId),
          fetchMyTrophies(userId, 200),
          fetchTrophyProgress(userId)
        ]);
        if (cancelled) return;
        setStats(s);
        setTrophies(t);
        setProgress(p);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? 'Could not load trophies');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const byKind = useMemo(() => {
    const m = new Map<TrophyKind, { count: number; latest: Trophy }>();
    for (const t of trophies ?? []) {
      const existing = m.get(t.kind);
      if (existing) existing.count += 1;
      else m.set(t.kind, { count: 1, latest: t });
    }
    return m;
  }, [trophies]);

  const sectionsByCategory = useMemo(() => {
    const groups = new Map<TrophyCategory, TrophyKind[]>();
    for (const [rawKind, meta] of Object.entries(TROPHY_META)) {
      const kind = rawKind as TrophyKind;
      if (meta.secret && !byKind.has(kind)) continue;
      const list = groups.get(meta.category) ?? [];
      list.push(kind);
      groups.set(meta.category, list);
    }
    // Sort each category: earned first (by tier), then locked (by tier).
    for (const [category, list] of groups) {
      list.sort((a, b) => {
        const ae = byKind.has(a) ? 0 : 1;
        const be = byKind.has(b) ? 0 : 1;
        if (ae !== be) return ae - be;
        return tierWeight(TROPHY_META[a].tier) - tierWeight(TROPHY_META[b].tier);
      });
      groups.set(category, list);
    }
    return groups;
  }, [byKind]);

  const toggle = (c: TrophyCategory) =>
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  if (err) {
    return (
      <Card className="border-red-200 bg-red-50">
        <p className="text-sm text-red-700">{err}</p>
      </Card>
    );
  }

  if (!stats || !trophies || !progress) {
    return (
      <Card className="bg-white/80 backdrop-blur">
        <p className="flex items-center gap-2 text-sm text-textSecondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading trophies…
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 bg-white/80 backdrop-blur">
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
          {stats.byTier.rib > 0 && <TierChip tier="rib" count={stats.byTier.rib} />}
        </CardDescription>
      </CardHeader>

      <div className="space-y-3">
        {CATEGORY_ORDER.map((category) => {
          const kinds = sectionsByCategory.get(category) ?? [];
          if (kinds.length === 0) return null;
          const open = openCategories.has(category);
          const earnedInCategory = kinds.filter((k) => byKind.has(k)).length;
          return (
            <section
              key={category}
              className="overflow-hidden rounded-md border border-white/60 bg-white/60"
            >
              <button
                type="button"
                onClick={() => toggle(category)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-left',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'
                )}
                aria-expanded={open}
              >
                <div className="min-w-0">
                  <p className="font-heading text-sm font-bold">{CATEGORY_LABEL[category]}</p>
                  <p className="text-xs text-textSecondary">
                    {earnedInCategory}/{kinds.length} earned
                  </p>
                </div>
                {open ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-textSecondary" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-textSecondary" />
                )}
              </button>
              {open && (
                <ul className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2">
                  {kinds.map((kind) => (
                    <TrophyRow
                      key={kind}
                      kind={kind}
                      earned={byKind.get(kind) ?? null}
                      progress={progress}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </Card>
  );
}

function TrophyRow({
  kind,
  earned,
  progress
}: {
  kind: TrophyKind;
  earned: { count: number; latest: Trophy } | null;
  progress: TrophyProgress;
}) {
  const meta = TROPHY_META[kind];
  const isEarned = !!earned;
  const progressInfo = computeProgress(meta, progress);

  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-md border p-2.5 transition-colors',
        isEarned
          ? 'border-white/70 bg-white/80 shadow-[0_2px_10px_rgba(0,0,0,0.06)]'
          : 'border-dashed border-white/50 bg-white/30'
      )}
    >
      <TrophyBadge tier={meta.tier} locked={!isEarned} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1">
          <p className={cn('font-semibold leading-tight', !isEarned && 'text-textSecondary')}>
            {meta.label}
          </p>
          {isEarned && meta.stackable && earned.count > 1 && (
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              ×{earned.count}
            </span>
          )}
          {!isEarned && (
            <Lock className="ml-auto h-3 w-3 text-textSecondary/70" aria-label="Locked" />
          )}
        </div>
        <p className="text-xs leading-snug text-textSecondary">{meta.description}</p>
        {progressInfo && (
          <ProgressBar
            current={progressInfo.display}
            target={progressInfo.target}
            label={progressInfo.label}
            complete={isEarned}
          />
        )}
        {isEarned && earned.latest.earnedAt && (
          <p className="text-[10px] text-textSecondary/80">
            Earned {formatDate(earned.latest.earnedAt)}
          </p>
        )}
      </div>
    </li>
  );
}

function computeProgress(
  meta: (typeof TROPHY_META)[TrophyKind],
  progress: TrophyProgress
): { display: number; target: number; label: string } | null {
  if (meta.progressTarget == null || meta.progressField == null) return null;
  const raw = Number(progress[meta.progressField] ?? 0);
  const target = meta.progressTarget;
  if (meta.progressInverse) {
    // Lower-is-better (time). Convert to "how close am I to the target ms?"
    if (raw <= 0) return { display: 0, target, label: `best ms ≤ ${target}` };
    const display = raw <= target ? target : raw;
    return {
      display: raw,
      target,
      label: `best ${formatMs(raw)} · target ${formatMs(target)}`
    };
  }
  return {
    display: Math.min(raw, target),
    target,
    label: `${Math.min(raw, target)} / ${target}`
  };
}

function ProgressBar({
  current,
  target,
  label,
  complete
}: {
  current: number;
  target: number;
  label: string;
  complete: boolean;
}) {
  const pct = complete ? 100 : target === 0 ? 0 : Math.min(100, Math.round((current / target) * 100));
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/80">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            complete ? 'bg-accent' : 'bg-accent/70'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] tabular-nums text-textSecondary/80">{label}</p>
    </div>
  );
}

export function TrophyBadge({
  tier,
  className,
  locked
}: {
  tier: TrophyTier;
  className?: string;
  locked?: boolean;
}) {
  const colors: Record<TrophyTier, string> = {
    bronze: 'bg-amber-600/15 text-amber-700 border-amber-600/30',
    silver: 'bg-slate-400/15 text-slate-600 border-slate-400/40',
    gold: 'bg-yellow-400/20 text-yellow-700 border-yellow-500/40',
    platinum: 'bg-indigo-400/15 text-indigo-700 border-indigo-400/40',
    rib: 'bg-red-500/10 text-red-600 border-red-500/30'
  };
  return (
    <span
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-full border',
        locked ? 'border-dashed border-textSecondary/30 bg-white/40 text-textSecondary/50' : colors[tier],
        className
      )}
      aria-hidden
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
    platinum: 'Platinum',
    rib: 'Ribs'
  };
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <TrophyBadge tier={tier} className="h-5 w-5" />
      {count} {labels[tier]}
    </span>
  );
}

function tierWeight(t: TrophyTier): number {
  return t === 'bronze' ? 0 : t === 'silver' ? 1 : t === 'gold' ? 2 : t === 'platinum' ? 3 : 4;
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function formatMs(ms: number): string {
  if (ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}
