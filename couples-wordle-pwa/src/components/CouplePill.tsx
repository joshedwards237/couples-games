import { resolveCoupleColor } from '@/lib/coupleColors';
import { cn } from '@/lib/utils';

interface Props {
  coupleId: string;
  themeColor: string | null;
  memberNames: string[];
  isMine?: boolean;
  className?: string;
}

/** Strip a display name down to just the first token. "Joshua Edwards" → "Joshua". */
function firstNameOf(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
}

/**
 * Shared pill for rendering a couple on the global leaderboards. 2px
 * outline in the couple's theme color, first names joined with " + ".
 * When `isMine`, appends a "(you)" tag so the viewer can spot their own
 * couple — the theme-color border is enough chroma; no extra ring.
 */
export function CouplePill({ coupleId, themeColor, memberNames, isMine = false, className }: Props) {
  const theme = resolveCoupleColor(coupleId, themeColor);
  const firsts = memberNames.map(firstNameOf).filter(Boolean);
  const label = firsts.length > 0 ? firsts.join(' + ') : 'Couple';

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border-2 bg-white/70 px-2.5 py-0.5 text-sm font-semibold',
        className
      )}
      style={{ borderColor: theme.color }}
    >
      <span className="truncate">{label}</span>
      {isMine && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-accent">(you)</span>}
    </span>
  );
}
