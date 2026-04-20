import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { evaluateRow } from '@/lib/stats';
import type { LetterEval } from '@/lib/types';

const MAX_GUESSES = 6;
const COL_STAGGER_MS = 150;
const ROW_OFFSET_MS = 1;
const FLIP_MS = 300;

interface Props {
  answer: string;
  rows: string[];
}

export function CompletedBoard({ answer, rows }: Props) {
  const targetLength = answer.length;
  const slots = Array.from({ length: MAX_GUESSES });
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    const totalMs =
      (rows.length - 1) * ROW_OFFSET_MS + (targetLength - 1) * COL_STAGGER_MS + FLIP_MS;
    const t = window.setTimeout(() => setAnimating(false), totalMs + 50);
    return () => window.clearTimeout(t);
  }, [rows.length, targetLength]);

  return (
    <Card className="space-y-5 rounded-lg border-2 border-accent bg-white/80 p-3 backdrop-blur sm:p-5">
      <div className="space-y-2">
        {slots.map((_, rowIdx) => {
          const guess = rows[rowIdx] ?? '';
          const filled = guess.length > 0;
          const evalRow: LetterEval[] = filled
            ? evaluateRow(guess, answer)
            : Array.from({ length: targetLength }, () => 'unknown');
          const letters = guess.toUpperCase().split('');
          return (
            <div key={rowIdx} className="flex w-full justify-center gap-1.5 rounded-md bg-white/30 px-1 py-1 sm:gap-2 sm:px-2">
              {Array.from({ length: targetLength }).map((__, col) => {
                const delay = rowIdx * ROW_OFFSET_MS + col * COL_STAGGER_MS;
                return (
                  <Tile
                    key={col}
                    letter={letters[col] ?? ''}
                    state={filled ? evalRow[col] ?? 'unknown' : 'unknown'}
                    animate={filled && animating}
                    delayMs={delay}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Tile({
  letter,
  state,
  animate,
  delayMs
}: {
  letter: string;
  state: LetterEval;
  animate: boolean;
  delayMs: number;
}) {
  const colors: Record<LetterEval, string> = {
    correct: 'bg-success text-white border-success/90 shadow-[0_6px_18px_rgba(0,0,0,0.22)]',
    present: 'bg-warning text-white border-warning/90 shadow-[0_6px_18px_rgba(0,0,0,0.22)]',
    absent:
      'bg-brand-sage/60 text-foreground/45 border-brand-sage/50 opacity-80 shadow-[0_3px_10px_rgba(0,0,0,0.12)]',
    unknown:
      'bg-white/85 text-textPrimary border-textSecondary/30 shadow-[0_4px_12px_rgba(0,0,0,0.14)]'
  };
  return (
    <div
      className={cn(
        'grid aspect-square w-full min-w-0 max-w-[56px] basis-0 flex-1 select-none place-items-center rounded-md border text-lg font-bold',
        animate && 'animate-flip',
        colors[state]
      )}
      style={animate ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {letter}
    </div>
  );
}
