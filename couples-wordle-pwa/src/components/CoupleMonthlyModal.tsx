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
import type { GlobalMonthlyCoupleEntry } from '@/lib/types';

interface Props {
  entry: GlobalMonthlyCoupleEntry | null;
  onOpenChange: (open: boolean) => void;
}

export function CoupleMonthlyModal({ entry, onOpenChange }: Props) {
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

            <div className="mt-2 grid grid-cols-2 gap-3">
              <StatTile label="Solves together" value={`${entry.overlapCount}`} />
              <StatTile label="Avg guesses" value={entry.avgGuesses.toFixed(2)} />
              <StatTile label="Avg time" value={formatTime(entry.avgTimeMs)} />
              <StatTile
                label="Best combined solve"
                value={
                  entry.bestSolve
                    ? `${entry.bestSolve.guesses.toFixed(1)}/6 · ${formatTime(entry.bestSolve.timeMs)}`
                    : '—'
                }
                hint={entry.bestSolve ? entry.bestSolve.date : undefined}
              />
            </div>

            <p className="mt-3 text-xs text-textSecondary">
              Only puzzles where both members solved count toward these stats.
            </p>

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

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-white/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-textSecondary">{label}</p>
      <p className="font-heading text-base font-bold">{value}</p>
      {hint && <p className="text-[10px] text-textSecondary">{hint}</p>}
    </div>
  );
}

function formatTime(ms: number): string {
  if (!ms) return '—';
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
