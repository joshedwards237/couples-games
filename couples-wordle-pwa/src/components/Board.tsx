import { useEffect, useMemo, useState } from 'react';
import { Card } from './Card';
import { Keyboard, KeyType } from './Keyboard';
import { cn } from '../utils/cn';

export type LetterEval = 'correct' | 'present' | 'absent' | 'unknown';
type KeyStateMap = Record<string, LetterEval>;

interface BoardProps {
  answer: string;
  onComplete?: (result: { win: boolean; rows: string[] }) => void;
}

export function Board({ answer, onComplete }: BoardProps) {
  const targetLength = answer.length;
  const maxGuesses = 6;
  const [guesses, setGuesses] = useState<string[]>([]);
  const [evaluations, setEvaluations] = useState<LetterEval[][]>([]);
  const [current, setCurrent] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [keyStates, setKeyStates] = useState<KeyStateMap>({});
  const [revealRow, setRevealRow] = useState<number | null>(null);

  const rows = useMemo(() => Array.from({ length: maxGuesses }), [maxGuesses]);

  // Physical keyboard support
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      const key = e.key;
      if (key === 'Enter') {
        handleKey({ kind: 'enter' });
        e.preventDefault();
        return;
      }
      if (key === 'Backspace') {
        handleKey({ kind: 'delete' });
        e.preventDefault();
        return;
      }
      if (/^[a-zA-Z]$/.test(key)) {
        handleKey({ kind: 'letter', value: key.toUpperCase() });
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleKey = (key: KeyType) => {
    if (status?.startsWith('Solved') || status?.startsWith('Answer was')) return;
    if (key.kind === 'letter') {
      if (current.length < targetLength) setCurrent((c) => c + key.value);
    } else if (key.kind === 'delete') {
      setCurrent((c) => c.slice(0, -1));
    } else if (key.kind === 'enter') {
      submit();
    }
  };

  const submit = () => {
    if (current.length !== targetLength) {
      setStatus(`Need ${targetLength} letters`);
      return;
    }
    if (guesses.length >= maxGuesses) return;

    const evalRow = evaluate(current, answer);
    const newGuesses = [...guesses, current];
    setGuesses(newGuesses);
    setEvaluations((prev) => [...prev, evalRow]);
    setKeyStates((prev) => mergeKeyStates(prev, current, evalRow));
    setRevealRow(newGuesses.length - 1);

    const win = current.toLowerCase() === answer.toLowerCase();
    if (win) {
      setStatus('Solved together!');
      onComplete?.({ win: true, rows: newGuesses });
    } else if (newGuesses.length === maxGuesses) {
      setStatus(`Answer was ${answer.toUpperCase()}`);
      onComplete?.({ win: false, rows: newGuesses });
    } else {
      setStatus('Keep going');
    }
    setCurrent('');
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4 bg-white/80 backdrop-blur">
        <div className="space-y-2">
          {rows.map((_, rowIdx) => {
            const isActiveRow = rowIdx === guesses.length;
            const word = isActiveRow ? current : guesses[rowIdx] ?? '';
            const letters = word.toUpperCase().split('');
            const evalRow =
              evaluations[rowIdx] ?? Array.from({ length: targetLength }, () => (isActiveRow ? 'unknown' : 'absent'));
            return (
              <div
                key={rowIdx}
                className={cn(
                  'flex gap-2 justify-center rounded-md px-2 py-1 transition-colors',
                  isActiveRow ? 'bg-surface/70' : 'bg-white/30'
                )}
              >
                {Array.from({ length: targetLength }).map((__, col) => (
                  <Tile
                    key={col}
                    letter={letters[col] ?? ''}
                    state={evalRow[col] ?? 'unknown'}
                    active={isActiveRow}
                    animate={revealRow === rowIdx}
                  />
                ))}
              </div>
            );
          })}
        </div>
        {status && <p className="text-sm text-textSecondary text-center">{status}</p>}
      </Card>

      <Keyboard onKey={handleKey} keyStates={keyStates} />
    </div>
  );
}

function evaluate(guess: string, answer: string): LetterEval[] {
  const t = answer.toLowerCase().split('');
  const g = guess.toLowerCase().split('');
  let remaining = [...t];
  const result: LetterEval[] = Array(g.length).fill('unknown');

  // first pass corrects
  g.forEach((letter, i) => {
    if (letter === t[i]) {
      result[i] = 'correct';
      const idx = remaining.indexOf(letter);
      if (idx > -1) remaining.splice(idx, 1);
    }
  });

  // second pass presents
  g.forEach((letter, i) => {
    if (result[i] !== 'unknown') return;
    const idx = remaining.indexOf(letter);
    if (idx > -1) {
      result[i] = 'present';
      remaining.splice(idx, 1);
    } else {
      result[i] = 'absent';
    }
  });

  return result;
}

function mergeKeyStates(prev: KeyStateMap, guess: string, evalRow: LetterEval[]): KeyStateMap {
  const next = { ...prev };
  const priority: Record<LetterEval, number> = { correct: 3, present: 2, absent: 1, unknown: 0 };
  guess.toUpperCase().split('').forEach((letter, idx) => {
    const state = evalRow[idx];
    const existing = next[letter];
    if (!existing || priority[state] > priority[existing]) {
      next[letter] = state;
    }
  });
  return next;
}

function Tile({ letter, state, active, animate }: { letter: string; state: LetterEval; active: boolean; animate: boolean }) {
  const colors: Record<LetterEval, string> = {
    correct: 'bg-success text-white border-success/90 shadow-[0_6px_18px_rgba(0,0,0,0.22)]',
    present: 'bg-warning text-white border-warning/90 shadow-[0_6px_18px_rgba(0,0,0,0.22)]',
    absent: 'bg-keycap text-textPrimary border-keycap/90 shadow-[0_5px_14px_rgba(0,0,0,0.16)]',
    unknown: active
      ? 'bg-surface text-textPrimary border-textSecondary/50 shadow-[0_5px_14px_rgba(0,0,0,0.16)]'
      : 'bg-white/85 text-textPrimary border-textSecondary/30 shadow-[0_4px_12px_rgba(0,0,0,0.14)]'
  };
  return (
    <div
      className={cn(
        'h-12 w-12 rounded-md border grid place-items-center text-lg font-bold transition-transform duration-150',
        'select-none',
        animate ? 'animate-flip' : '',
        colors[state]
      )}
    >
      {letter}
    </div>
  );
}
