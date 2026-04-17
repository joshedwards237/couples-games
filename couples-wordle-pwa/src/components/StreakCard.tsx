import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  currentStreak?: number | null;
  maxStreak?: number | null;
  totalWins?: number | null;
}

export function StreakCard({ currentStreak, maxStreak, totalWins }: Props) {
  const fmt = (n: number | null | undefined) => (n == null ? '—' : String(n));

  return (
    <Card className="grid grid-cols-3 gap-2 bg-white/80 backdrop-blur">
      <Stat label="Current streak" value={`${fmt(currentStreak)} 🔥`} />
      <Stat label="Max streak" value={fmt(maxStreak)} accent />
      <Stat label="Total wins" value={fmt(totalWins)} />
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
