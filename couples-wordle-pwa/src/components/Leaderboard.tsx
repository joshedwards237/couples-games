import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePranks } from '@/context/PrankContext';
import { cn } from '@/lib/utils';
import { fetchWinnersForPuzzle } from '@/lib/trophies';
import type { LeaderboardEntry, LetterEval } from '@/lib/types';

interface Props {
  entries: LeaderboardEntry[];
  loading?: boolean;
  /** When provided, flags users who earned today's Daily W trophy. */
  puzzleId?: string | null;
}

export function Leaderboard({ entries, loading, puzzleId }: Props) {
  const navigate = useNavigate();
  const [openEntry, setOpenEntry] = useState<LeaderboardEntry | null>(null);
  const [todayWinners, setTodayWinners] = useState<Set<string>>(new Set());
  const { config, adminUserIds } = usePranks();
  const impostorCfg = config['impostor_badge'];

  useEffect(() => {
    if (!puzzleId) {
      setTodayWinners(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ids = await fetchWinnersForPuzzle(puzzleId);
        if (!cancelled) setTodayWinners(ids);
      } catch {
        /* ignore — no crown shown on failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  // Retractable score: drift targeted users down by one rank every 5s.
  // Re-rolls when the relevant config fields change (not on every render).
  const retractCfg = config['retractable_score'];
  const retractExemptKey = retractCfg?.exemptUserIds.slice().sort().join(',') ?? '';
  const driftTargets = useMemo(() => {
    const cfg = config['retractable_score'];
    if (!cfg?.enabled) return new Set<string>();
    const targets = new Set<string>();
    for (const e of entries) {
      if (adminUserIds.has(e.userId)) continue;
      if (e.guessesUsed > cfg.triggerMaxGuesses) continue;
      if (cfg.exemptUserIds.includes(e.userId)) continue;
      if (Math.random() < cfg.probability) targets.add(e.userId);
    }
    return targets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    entries.length,
    retractCfg?.enabled,
    retractCfg?.probability,
    retractCfg?.triggerMaxGuesses,
    retractExemptKey
  ]);

  const [rankShift, setRankShift] = useState<Record<string, number>>({});

  useEffect(() => {
    if (driftTargets.size === 0) return;
    const iv = window.setInterval(() => {
      setRankShift((prev) => {
        const next = { ...prev };
        for (const uid of driftTargets) next[uid] = (next[uid] ?? 0) + 1;
        return next;
      });
    }, 5000);
    return () => window.clearInterval(iv);
  }, [driftTargets]);

  // Apply the drift to produce the displayed order.
  const displayed = useMemo(() => {
    if (Object.keys(rankShift).length === 0) return entries;
    const list = entries.map((e, idx) => ({ entry: e, score: idx + (rankShift[e.userId] ?? 0) }));
    list.sort((a, b) => a.score - b.score);
    return list.map((l) => l.entry);
  }, [entries, rankShift]);

  const openIdx = openEntry ? displayed.findIndex((e) => e.userId === openEntry.userId) : -1;

  const isImpostor = (entry: LeaderboardEntry): boolean => {
    if (!impostorCfg?.enabled) return false;
    if (!entry.win) return false;
    if (entry.guessesUsed > impostorCfg.triggerMaxGuesses) return false;
    if (impostorCfg.exemptUserIds.includes(entry.userId)) return false;
    if (adminUserIds.has(entry.userId)) return false;
    return true;
  };

  return (
    <Card className="space-y-3 bg-white/80 backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold">Today&apos;s leaderboard</h2>
        <span className="text-xs text-textSecondary">{entries.length} finished</span>
      </div>

      {loading ? (
        <p className="text-sm text-textSecondary">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-textSecondary">No one has finished today&apos;s puzzle yet.</p>
      ) : (
        <ul className="divide-y divide-white/50">
          {displayed.map((entry, idx) => (
            <li key={entry.userId}>
              <button
                type="button"
                onClick={() => setOpenEntry(entry)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors',
                  'hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  entry.isYou && 'bg-accent/10'
                )}
              >
                <span className="w-6 text-center text-sm font-semibold tabular-nums text-textSecondary">
                  {idx + 1}
                </span>
                <Avatar className="h-7 w-7 shrink-0">
                  {entry.avatarUrl && <AvatarImage src={entry.avatarUrl} alt="" />}
                  <AvatarFallback className="text-[10px]">{initialsFor(entry.displayName)}</AvatarFallback>
                </Avatar>
                <p className="min-w-0 flex-1 truncate font-semibold">
                  {isImpostor(entry) && <span className="mr-1" title="Suspected bot">🤖</span>}
                  <span className={cn(isImpostor(entry) && 'text-textSecondary line-through decoration-textSecondary/60')}>
                    {entry.displayName}
                  </span>
                  {isImpostor(entry) && (
                    <span className="ml-1 rounded-sm bg-red-500/10 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
                      bot
                    </span>
                  )}
                  {entry.isYou && <span className="ml-1 text-xs text-accent">(you)</span>}
                  {todayWinners.has(entry.userId) && (
                    <span
                      className="ml-1 inline-flex items-center rounded-full bg-accent/15 px-1.5 py-0.5 align-middle text-accent"
                      title="Daily W — beat their partner"
                      aria-label="Daily W — beat their partner"
                    >
                      <Trophy className="h-3 w-3" />
                    </span>
                  )}
                </p>
                <span className="shrink-0 text-sm tabular-nums text-textSecondary">
                  {entry.win ? `${entry.guessesUsed}/6` : '—'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={openEntry !== null} onOpenChange={(o) => !o && setOpenEntry(null)}>
        <DialogContent>
          {openEntry && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {openEntry.displayName}
                  {openEntry.isYou && <span className="ml-2 text-xs text-accent">(you)</span>}
                </DialogTitle>
                <DialogDescription>
                  {openIdx >= 0 && <>#{openIdx + 1} · </>}
                  {openEntry.win ? `${openEntry.guessesUsed}/6 guesses` : 'Did not solve'} ·{' '}
                  {formatTime(openEntry.timeMs)}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-1">
                {openEntry.evaluations.length === 0 ? (
                  <p className="text-sm text-textSecondary">No guesses recorded.</p>
                ) : (
                  openEntry.evaluations.map((rowEval, r) => (
                    <div key={r} className="flex justify-center gap-1">
                      {rowEval.map((state, c) => (
                        <MaskedTile key={c} state={state} />
                      ))}
                    </div>
                  ))
                )}
              </div>

              <DialogFooter className="mt-5">
                <DialogClose asChild>
                  <Button variant="ghost" size="sm">
                    Close
                  </Button>
                </DialogClose>
                <Button
                  size="sm"
                  onClick={() => {
                    const uid = openEntry.userId;
                    setOpenEntry(null);
                    navigate(`/users/${uid}`);
                  }}
                >
                  View profile
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function initialsFor(name: string): string {
  const parts = (name || '').split(/\s+/).filter(Boolean);
  const initials = parts
    .map((p) => (Array.from(p)[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('');
  return initials || '?';
}

function MaskedTile({ state }: { state: LetterEval }) {
  const color: Record<LetterEval, string> = {
    correct: 'bg-success',
    present: 'bg-warning',
    absent: 'bg-keycap',
    unknown: 'bg-white/40'
  };
  return <div className={cn('h-6 w-6 rounded-sm', color[state])} />;
}

function formatTime(ms: number): string {
  if (!ms) return '—';
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
