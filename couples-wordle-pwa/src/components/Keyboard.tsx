import { useEffect, useRef, useState } from 'react';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

export type KeyType =
  | { kind: 'letter'; value: string }
  | { kind: 'enter' }
  | { kind: 'delete' };

interface KeyboardProps {
  onKey: (key: KeyType) => void;
  keyStates?: Record<string, 'correct' | 'present' | 'absent' | 'unknown'>;
  /** When true, the Enter button physically jumps away on hover / touch. Relents after MAX_MOVING_EVASIONS attempts. */
  enterMovesAway?: boolean;
}

const MAX_MOVING_EVASIONS = 8;

export function Keyboard({ onKey, keyStates = {}, enterMovesAway = false }: KeyboardProps) {
  const rows = [Array.from('QWERTYUIOP'), Array.from('ASDFGHJKL'), Array.from('ZXCVBNM')];

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-1.5 px-0">
      {rows.map((row, ri) => (
        <div key={ri} className="flex w-full gap-1 sm:gap-1.5">
          {/* Middle row: half-key spacers so letters align under row 1 */}
          {ri === 1 && <span className="basis-0 shrink-0 grow-[0.5]" aria-hidden />}
          {ri === rows.length - 1 &&
            (enterMovesAway ? (
              <MovingEnterKey onEnter={() => onKey({ kind: 'enter' })} />
            ) : (
              <Key
                label="Enter"
                onClick={() => onKey({ kind: 'enter' })}
                className="grow-[2] basis-0 text-sm sm:text-base"
              />
            ))}
          {row.map((l) => (
            <Key
              key={l}
              label={l}
              state={keyStates[l]}
              onClick={() => onKey({ kind: 'letter', value: l })}
              className="basis-0 grow"
            />
          ))}
          {ri === rows.length - 1 && (
            <Key
              label={<Delete className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />}
              aria-label="Backspace"
              onClick={() => onKey({ kind: 'delete' })}
              className="grow-[1.5] basis-0"
            />
          )}
          {ri === 1 && <span className="basis-0 shrink-0 grow-[0.5]" aria-hidden />}
        </div>
      ))}
    </div>
  );
}

function MovingEnterKey({ onEnter }: { onEnter: () => void }) {
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const evasionsRef = useRef(0);
  const ref = useRef<HTMLButtonElement | null>(null);

  const relented = evasionsRef.current >= MAX_MOVING_EVASIONS;

  const jump = () => {
    if (relented) return;
    evasionsRef.current += 1;
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
    // Cap dx so the button doesn't sling off a narrow iPhone viewport.
    const maxDx = isMobile ? 40 : 140;
    const maxDy = isMobile ? 36 : 80;
    const dx = (Math.random() * 2 - 1) * maxDx;
    const dy = (Math.random() * 2 - 1) * maxDy;
    setOffset({ x: dx, y: dy });
  };

  // Reset to origin after each move, so the keyboard layout doesn't stay wrecked.
  useEffect(() => {
    if (offset.x === 0 && offset.y === 0) return;
    const t = window.setTimeout(() => setOffset({ x: 0, y: 0 }), 260);
    return () => window.clearTimeout(t);
  }, [offset]);

  return (
    <button
      ref={ref}
      type="button"
      onMouseEnter={jump}
      onTouchStart={(e) => {
        if (relented) return;
        // Intercept the first-tap so click doesn't fire on the original position.
        e.preventDefault();
        jump();
      }}
      onClick={(e) => {
        if (!relented) {
          e.preventDefault();
          jump();
          return;
        }
        onEnter();
      }}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      className={cn(
        'relative h-11 basis-0 grow-[2] rounded-md border px-1 text-sm font-semibold transition active:scale-[0.98] sm:text-base',
        'focus:outline-none focus:ring-2 focus:ring-accent/60',
        'bg-keycap text-textPrimary border-white/40 shadow-[0_4px_12px_rgba(0,0,0,0.1)]',
        'duration-150 ease-out'
      )}
      aria-label="Enter"
    >
      Enter
    </button>
  );
}

function Key({
  label,
  className,
  state = 'unknown',
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: React.ReactNode;
  state?: 'correct' | 'present' | 'absent' | 'unknown';
}) {
  const stateStyles: Record<typeof state, string> = {
    correct: 'bg-success text-white border-success/90 shadow-[0_5px_16px_rgba(0,0,0,0.2)]',
    present: 'bg-warning text-white border-warning/90 shadow-[0_5px_16px_rgba(0,0,0,0.2)]',
    absent:
      'bg-brand-sage/60 text-foreground/45 border-brand-sage/50 opacity-75 shadow-[0_3px_10px_rgba(0,0,0,0.1)]',
    unknown: 'bg-keycap text-textPrimary border-white/40 shadow-[0_4px_12px_rgba(0,0,0,0.1)]'
  };

  return (
    <button
      className={cn(
        'h-11 min-w-0 rounded-md px-0 text-sm font-semibold uppercase transition active:scale-[0.98] border',
        'inline-flex items-center justify-center',
        'focus:outline-none focus:ring-2 focus:ring-accent/60',
        stateStyles[state],
        className
      )}
      {...props}
    >
      {label}
    </button>
  );
}
