import { cn } from '@/lib/utils';

export type KeyType =
  | { kind: 'letter'; value: string }
  | { kind: 'enter' }
  | { kind: 'delete' };

interface KeyboardProps {
  onKey: (key: KeyType) => void;
  keyStates?: Record<string, 'correct' | 'present' | 'absent' | 'unknown'>;
}

export function Keyboard({ onKey, keyStates = {} }: KeyboardProps) {
  const rows = [
    Array.from('QWERTYUIOP'),
    Array.from('ASDFGHJKL'),
    Array.from('ZXCVBNM')
  ];

  return (
    <div className="space-y-2">
      {rows.map((row, ri) => (
        <div key={ri} className="flex gap-2 justify-center">
          {ri === rows.length - 1 && (
            <Key label="⌫" onClick={() => onKey({ kind: 'delete' })} className="px-3" />
          )}
          {row.map((l) => (
            <Key key={l} label={l} state={keyStates[l]} onClick={() => onKey({ kind: 'letter', value: l })} />
          ))}
          {ri === rows.length - 1 && (
            <Key label="Enter" onClick={() => onKey({ kind: 'enter' })} className="px-4" />
          )}
        </div>
      ))}
    </div>
  );
}

function Key({
  label,
  className,
  state = 'unknown',
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string;
  state?: 'correct' | 'present' | 'absent' | 'unknown';
}) {
  const stateStyles: Record<typeof state, string> = {
    correct: 'bg-success text-white border-success/90 shadow-[0_5px_16px_rgba(0,0,0,0.2)]',
    present: 'bg-warning text-white border-warning/90 shadow-[0_5px_16px_rgba(0,0,0,0.2)]',
    absent: 'bg-keycap text-textPrimary/70 border-keycap/90 shadow-[0_4px_12px_rgba(0,0,0,0.14)] opacity-80',
    unknown: 'bg-keycap text-textPrimary border-white/40 shadow-[0_4px_12px_rgba(0,0,0,0.1)]'
  };

  return (
    <button
      className={cn(
        'h-11 min-w-[36px] rounded-md text-sm font-semibold active:scale-[0.98] transition border',
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
