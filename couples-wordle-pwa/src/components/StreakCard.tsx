import { Trophy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  currentStreak?: number | null;
  maxStreak?: number | null;
  totalWins?: number | null;
  trophyCount?: number | null;
}

export function StreakCard({ currentStreak, maxStreak, totalWins, trophyCount }: Props) {
  const fmt = (n: number | null | undefined) => (n == null ? '—' : String(n));
  const showTrophies = typeof trophyCount === 'number';

  return (
    <Card className="grid grid-cols-3 gap-2 bg-white/80 backdrop-blur">
      <Stat label="Current streak" value={`${fmt(currentStreak)} 🔥`} />
      <Stat label="Max streak" value={fmt(maxStreak)} accent />
      {showTrophies ? (
        <Stat label="Trophies" value={fmt(trophyCount)} icon={<Trophy className="h-4 w-4" />} />
      ) : (
        <Stat label="Total wins" value={fmt(totalWins)} />
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  accent,
  icon
}: {
  label: string;
  value: string;
  accent?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-sm text-textSecondary">
        {icon} {label}
      </p>
      <p className={cn('font-heading text-2xl font-bold', accent && 'text-accent')}>{value}</p>
    </div>
  );
}
