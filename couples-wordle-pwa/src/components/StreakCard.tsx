import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  currentStreak?: number | null;
  maxStreak?: number | null;
  h2hWins?: number | null;
  totalSolves?: number | null;
}

/**
 * Profile header stats card. Four metrics:
 *   - Current streak: consecutive classic wins ending today (or yesterday
 *     if today's classic isn't played yet). Missed day or loss breaks it.
 *   - Max streak: historical max of that same classic streak.
 *   - Wins: head-to-head wins against the partner (count of 'win' trophies).
 *   - Total solves: classic + bonus wins regardless of H2H outcome.
 *
 * Layout: 2x2 grid on mobile, 1x4 on sm+ so nothing gets cramped.
 */
export function StreakCard({ currentStreak, maxStreak, h2hWins, totalSolves }: Props) {
  const fmt = (n: number | null | undefined) => (n == null ? '—' : String(n));

  return (
    <Card className="grid grid-cols-2 gap-3 bg-white/80 backdrop-blur sm:grid-cols-4 sm:gap-2">
      <Stat label="Current streak" value={`${fmt(currentStreak)} 🔥`} />
      <Stat label="Max streak" value={fmt(maxStreak)} accent />
      <Stat label="Wins" value={fmt(h2hWins)} />
      <Stat label="Total solves" value={fmt(totalSolves)} />
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-sm text-textSecondary">{label}</p>
      <p className={cn('font-heading text-2xl font-bold', accent && 'text-accent')}>{value}</p>
    </div>
  );
}
