import { resolveCoupleColor } from '@/lib/coupleColors';
import { cn } from '@/lib/utils';

interface Props {
  coupleId: string;
  themeColor: string | null;
  memberNames: string[];
  isMine?: boolean;
  className?: string;
}

/**
 * Shared pill for rendering a couple on the global leaderboards. 2px
 * outline in the couple's theme color, display names joined with " + ".
 * When `isMine`, adds an outer accent ring and a trailing "(you)" tag so
 * the viewer can spot their own couple regardless of theme color.
 */
export function CouplePill({ coupleId, themeColor, memberNames, isMine = false, className }: Props) {
  const theme = resolveCoupleColor(coupleId, themeColor);
  const names = memberNames.filter(Boolean);
  const label = names.length > 0 ? names.join(' + ') : 'Couple';

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border-2 bg-white/70 px-2.5 py-0.5 text-sm font-semibold',
        isMine && 'ring-2 ring-accent ring-offset-2 ring-offset-background',
        className
      )}
      style={{ borderColor: theme.color }}
    >
      <span className="truncate">{label}</span>
      {isMine && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-accent">you</span>}
    </span>
  );
}
