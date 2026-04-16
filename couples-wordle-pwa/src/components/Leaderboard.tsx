import { Card } from './Card';
import { cn } from '../utils/cn';
import type { LeaderboardEntry, LetterEval } from '../lib/types';

interface Props {
  entries: LeaderboardEntry[];
  loading?: boolean;
}

export function Leaderboard({ entries, loading }: Props) {
  return (
    <Card className="space-y-3 bg-white/80 backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold" style={{ fontFamily: 'SF Pro Rounded, system-ui' }}>
          Today&apos;s leaderboard
        </h2>
        <span className="text-xs text-textSecondary">{entries.length} finished</span>
      </div>

      {loading ? (
        <p className="text-sm text-textSecondary">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-textSecondary">No one has finished today&apos;s puzzle yet.</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry, idx) => (
            <li
              key={entry.userId}
              className={cn(
                'rounded-md border border-white/60 bg-white/70 p-3 shadow-[0_3px_10px_rgba(0,0,0,0.06)]',
                entry.isYou && 'ring-2 ring-accent'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold text-textSecondary w-5 text-center">{idx + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {entry.displayName}
                      {entry.isYou && <span className="ml-1 text-xs text-accent">(you)</span>}
                    </p>
                    <p className="text-xs text-textSecondary">
                      {entry.win ? `${entry.guessesUsed}/6 guesses` : 'Did not solve'} · {formatTime(entry.timeMs)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-2 space-y-1">
                {entry.evaluations.map((rowEval, r) => (
                  <div key={r} className="flex gap-1 justify-start">
                    {rowEval.map((state, c) => (
                      <MaskedTile key={c} state={state} />
                    ))}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
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
  return <div className={cn('h-4 w-4 rounded-sm', color[state])} />;
}

function formatTime(ms: number): string {
  if (!ms) return '—';
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
