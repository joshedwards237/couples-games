import { Card } from './Card';
import { Button } from './Button';
import { Pill } from './Layout';

interface LaneCardProps {
  title: string;
  description: string;
  pillLabel: string;
  variant?: 'primary' | 'ghost';
  onSelect: () => void;
}

export function LaneCard({ title, description, pillLabel, variant = 'primary', onSelect }: LaneCardProps) {
  return (
    <Card className="space-y-3 bg-white/80 backdrop-blur border border-white/60 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold" style={{ fontFamily: 'SF Pro Rounded, system-ui' }}>
          {title}
        </h2>
        <Pill active label={pillLabel} />
      </div>
      <p className="text-textSecondary">{description}</p>
      <div className="flex justify-end">
        <Button variant={variant} onClick={onSelect} className="min-w-[180px]">
          Play {title}
        </Button>
      </div>
    </Card>
  );
}
