import { useState } from 'react';
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
import { cn } from '@/lib/utils';
import type { LeaderboardEntry, LetterEval } from '@/lib/types';

interface Props {
  entries: LeaderboardEntry[];
  loading?: boolean;
}

export function Leaderboard({ entries, loading }: Props) {
  const [openEntry, setOpenEntry] = useState<LeaderboardEntry | null>(null);
  const openIdx = openEntry ? entries.findIndex((e) => e.userId === openEntry.userId) : -1;

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
          {entries.map((entry, idx) => (
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
                <p className="min-w-0 flex-1 truncate font-semibold">
                  {entry.displayName}
                  {entry.isYou && <span className="ml-1 text-xs text-accent">(you)</span>}
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
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
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
