import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { resolveCoupleColor } from '@/lib/coupleColors';
import { cn } from '@/lib/utils';
import type { GlobalDailyCoupleEntry, LetterEval } from '@/lib/types';

interface Props {
  entry: GlobalDailyCoupleEntry | null;
  onOpenChange: (open: boolean) => void;
}

export function CoupleDailyModal({ entry, onOpenChange }: Props) {
  const open = entry !== null;
  const theme = entry ? resolveCoupleColor(entry.coupleId, entry.themeColor) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent>
        {entry && theme && (
          <>
            <DialogHeader>
              <DialogTitle>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border-2 bg-white/70 px-2.5 py-0.5 text-sm font-semibold"
                  style={{ borderColor: theme.color }}
                >
                  {entry.members.map((m) => (m.displayName || '').trim().split(/\s+/)[0]).filter(Boolean).join(' + ')}
                </span>
                {entry.isMine && <span className="ml-2 text-xs text-accent">(your couple)</span>}
              </DialogTitle>
            </DialogHeader>

            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {entry.members.map((m) => (
                <div key={m.userId} className="space-y-2">
                  <div className="space-y-0.5">
                    <p className="truncate text-sm font-semibold">{m.displayName}</p>
                    <p className="text-xs text-textSecondary">
                      {m.guessesUsed}/6 · {formatTime(m.timeMs)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {m.evaluations.length === 0 ? (
                      <p className="text-xs text-textSecondary">No guesses recorded.</p>
                    ) : (
                      m.evaluations.map((rowEval, r) => (
                        <div key={r} className="flex justify-start gap-1">
                          {rowEval.map((state, c) => (
                            <MaskedTile key={c} state={state} />
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-md bg-white/50 px-3 py-2 text-xs text-textSecondary">
              Couple avg: {entry.avgGuesses.toFixed(1)} guesses · {formatTime(entry.avgTimeMs)}
            </div>

            <DialogFooter className="mt-4">
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
  );
}

function MaskedTile({ state }: { state: LetterEval }) {
  const color: Record<LetterEval, string> = {
    correct: 'bg-success',
    present: 'bg-warning',
    absent: 'bg-keycap',
    unknown: 'bg-white/40'
  };
  return <div className={cn('h-5 w-5 rounded-sm', color[state])} />;
}

function formatTime(ms: number): string {
  if (!ms) return '—';
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
