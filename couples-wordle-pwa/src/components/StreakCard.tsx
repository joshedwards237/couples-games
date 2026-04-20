import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  currentStreak?: number | null;
  maxStreak?: number | null;
  totalSolves?: number | null;
}

/**
 * Profile header stats card. Three metrics:
 *   - Current streak: consecutive classic wins ending today (or yesterday
 *     if today's classic isn't played yet). Missed day or loss breaks it.
 *   - Max streak: historical max of that same classic streak.
 *   - Total solves: classic + bonus wins regardless of H2H outcome.
 */
export function StreakCard({ currentStreak, maxStreak, totalSolves }: Props) {
  const fmt = (n: number | null | undefined) => (n == null ? '—' : String(n));

  return (
    <Card className="grid grid-cols-3 gap-2 bg-white/80 backdrop-blur">
      <Stat label="Current streak" value={`${fmt(currentStreak)} 🔥`} />
      <Stat label="Max streak" value={fmt(maxStreak)} accent />
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
