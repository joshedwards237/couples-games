import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Keyboard, KeyType } from '@/components/Keyboard';
import { WrongAnswerReveal } from '@/components/pranks/WrongAnswerReveal';
import { usePranks } from '@/context/PrankContext';
import { useAuth } from '@/context/AuthContext';
import { useActiveSlowBurns } from '@/hooks/useActiveSlowBurns';
import { markFastWinThisSession, shouldFirePrank, PRANK_DEFS } from '@/lib/pranks';
import { cn } from '@/lib/utils';

export type LetterEval = 'correct' | 'present' | 'absent' | 'unknown';
type KeyStateMap = Record<string, LetterEval>;

interface BoardProps {
  answer: string;
  onComplete?: (result: { win: boolean; rows: string[] }) => void;
}

const TILE_STAGGER_MS = 150;
const TILE_FLIP_MS = 300;

// Pool of decoys the reveal_rewrite prank scrambles the solved word into.
const DECOY_WORDS = ['PROBE', 'BRAIN', 'CRANE', 'SPARK', 'FLINT', 'STORM', 'SHADE', 'QUIET'];

function pickDecoyWord(real: string): string {
  const pool = DECOY_WORDS.filter((w) => w.toUpperCase() !== real.toUpperCase());
  return pool[Math.floor(Math.random() * pool.length)] ?? 'PROBE';
}

// Short accusations that fit a 5-tile row (or whatever length the puzzle uses).
const SPELL_MESSAGES = ['CHEAT', 'WHAT?', 'HOW??', 'SUSUS', 'NOPES'];

function pickSpellMessage(length: number): string {
  const pool = SPELL_MESSAGES.filter((m) => m.length === length);
  if (pool.length === 0) return 'CHEAT'.slice(0, length).padEnd(length, '?');
  return pool[Math.floor(Math.random() * pool.length)];
}

// Autocorrect sabotage — visually similar glyph swaps. Keyed on uppercase letters
// because the Keyboard always fires letters in uppercase.
const LOOKALIKE_SWAP: Record<string, string> = {
  E: 'F',
  F: 'E',
  O: 'Q',
  Q: 'O',
  A: 'R',
  R: 'A',
  S: 'Z',
  Z: 'S',
  I: 'L',
  L: 'I',
  G: 'H',
  H: 'G',
  B: 'P',
  P: 'B',
  M: 'N',
  N: 'M'
};

export function Board({ answer, onComplete }: BoardProps) {
  const targetLength = answer.length;
  const maxGuesses = 6;
  const [guesses, setGuesses] = useState<string[]>([]);
  const [evaluations, setEvaluations] = useState<LetterEval[][]>([]);
  const [current, setCurrent] = useState('');
  const [keyStates, setKeyStates] = useState<KeyStateMap>({});
  const [revealRow, setRevealRow] = useState<number | null>(null);
  const [revealedCols, setRevealedCols] = useState(0);
  const [wrongAnswerOpen, setWrongAnswerOpen] = useState(false);
  const [tilesFalling, setTilesFalling] = useState(false);
  const [rewriteWord, setRewriteWord] = useState<string | null>(null);
  const [spellMessage, setSpellMessage] = useState<string | null>(null);

  const { user } = useAuth();
  const { config, isAdmin } = usePranks();
  const activeSlowBurns = useActiveSlowBurns();
  const autocorrectActive = activeSlowBurns.has('autocorrect_sabotage');
  const reverseActive = activeSlowBurns.has('reverse_keystrokes');
  const tileRebellionActive = activeSlowBurns.has('tile_rebellion');

  // Admins never get trolled. Everyone else is fair game if the prank fires.
  const prankEligible = !!user && !isAdmin;
  const movingEnterCfg = prankEligible ? config['moving_enter'] : undefined;
  const nextAttemptCount = guesses.length + 1;

  // Roll the probability die once per (guess-attempt, config) change so the
  // button doesn't flicker between moving/stationary on every re-render.
  const enterMovesAway = useMemo(() => {
    if (!prankEligible || !user) return false;
    if (!movingEnterCfg?.enabled) return false;
    if (nextAttemptCount > movingEnterCfg.triggerMaxGuesses) return false;
    if (movingEnterCfg.exemptUserIds.includes(user.id)) return false;
    return Math.random() < movingEnterCfg.probability;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    prankEligible,
    nextAttemptCount,
    movingEnterCfg?.enabled,
    movingEnterCfg?.triggerMaxGuesses,
    movingEnterCfg?.probability,
    user?.id
  ]);

  const rows = useMemo(() => Array.from({ length: maxGuesses }), [maxGuesses]);
  const revealTotalMs = (targetLength - 1) * TILE_STAGGER_MS + TILE_FLIP_MS;
  const lastGuess = guesses[guesses.length - 1] ?? '';
  const solved = lastGuess.length > 0 && lastGuess.toLowerCase() === answer.toLowerCase();
  const finished = solved || guesses.length >= maxGuesses;

  // Physical keyboard support
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
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
    if (finished) return;
    if (key.kind === 'letter') {
      if (current.length >= targetLength) return;
      let value = key.value;
      if (autocorrectActive && Math.random() < 0.5) {
        value = LOOKALIKE_SWAP[value] ?? value;
      }
      if (reverseActive) setCurrent((c) => value + c);
      else setCurrent((c) => c + value);
    } else if (key.kind === 'delete') {
      if (reverseActive) setCurrent((c) => c.slice(1));
      else setCurrent((c) => c.slice(0, -1));
    } else if (key.kind === 'enter') {
      submit();
    }
  };

  const submit = () => {
    if (current.length !== targetLength) return;
    if (guesses.length >= maxGuesses) return;

    const guess = current;
    const evalRow = evaluate(guess, answer);
    const newGuesses = [...guesses, guess];
    setGuesses(newGuesses);
    setEvaluations((prev) => [...prev, evalRow]);
    setRevealRow(newGuesses.length - 1);
    setRevealedCols(0);
    setCurrent('');

    // Reveal each tile's evaluated color at its own flip midpoint so the
    // answer isn't visible before the flip exposes it.
    for (let c = 0; c < targetLength; c++) {
      const t = c * TILE_STAGGER_MS + TILE_FLIP_MS / 2;
      window.setTimeout(() => setRevealedCols((n) => Math.max(n, c + 1)), t);
    }

    // Defer keyboard recolor until the sequential flip has finished so the
    // keys don't update before the tiles resolve.
    window.setTimeout(() => {
      setKeyStates((prev) => mergeKeyStates(prev, guess, evalRow));
    }, revealTotalMs);

    const win = guess.toLowerCase() === answer.toLowerCase();
    if (win) {
      // Record fast wins so same-session slow-burn pranks have a signal.
      // Threshold = max triggerMaxGuesses across any enabled same-session
      // slow-burn prank, so a win still counts as "fast" for whichever
      // prank has the loosest setting. Falls back to 2 ("<3") if nothing
      // is configured for same-session firing yet.
      if (user && !isAdmin) {
        const sameSessionThresholds = PRANK_DEFS
          .filter((d) => d.category === 'slow-burn')
          .map((d) => config[d.key])
          .filter((s): s is NonNullable<typeof s> => !!s && s.enabled && !!s.fireSameSession)
          .map((s) => s.triggerMaxGuesses);
        const fastThreshold = sameSessionThresholds.length
          ? Math.max(...sameSessionThresholds)
          : 2;
        if (newGuesses.length <= fastThreshold) {
          markFastWinThisSession(user.id);
        }
      }

      // Save immediately — prank only affects the visual layer so a mid-gag
      // tab-close doesn't lose the attempt.
      onComplete?.({ win: true, rows: newGuesses });

      const warCfg = prankEligible ? config['wrong_answer_reveal'] : undefined;
      const shouldReveal =
        !!user &&
        shouldFirePrank(warCfg, user.id, { guessesUsed: newGuesses.length });
      if (shouldReveal) {
        window.setTimeout(() => setWrongAnswerOpen(true), revealTotalMs + 150);
      }

      // Tile rebellion: after the reveal animation, the solved row's tiles
      // tumble off the bottom of the screen.
      if (tileRebellionActive) {
        window.setTimeout(() => setTilesFalling(true), revealTotalMs + 250);
      }

      // Board-level narrative pranks that mutate the displayed letters of
      // the solved row. Queued sequentially so they don't overwrite.
      let queueStart = revealTotalMs + 500;

      const rrCfg = prankEligible ? config['reveal_rewrite'] : undefined;
      if (user && shouldFirePrank(rrCfg, user.id, { guessesUsed: newGuesses.length })) {
        window.setTimeout(() => setRewriteWord(pickDecoyWord(answer)), queueStart);
        window.setTimeout(() => setRewriteWord(null), queueStart + 2200);
        queueStart += 2500;
      }

      const tsmCfg = prankEligible ? config['tiles_spell_message'] : undefined;
      if (user && shouldFirePrank(tsmCfg, user.id, { guessesUsed: newGuesses.length })) {
        window.setTimeout(() => setSpellMessage(pickSpellMessage(targetLength)), queueStart);
        window.setTimeout(() => setSpellMessage(null), queueStart + 5000);
      }
    } else if (newGuesses.length === maxGuesses) {
      onComplete?.({ win: false, rows: newGuesses });
    }
  };

  return (
    <Card className="space-y-5 rounded-lg border-2 border-accent bg-white/80 p-3 backdrop-blur sm:p-5">
      <div className="space-y-2">
        {rows.map((_, rowIdx) => {
          const isActiveRow = rowIdx === guesses.length;
          const rawWord = isActiveRow ? current : guesses[rowIdx] ?? '';
          const isSolvedRow =
            !isActiveRow &&
            (guesses[rowIdx] ?? '').toLowerCase() === answer.toLowerCase();
          // Narrative-prank overrides: swap the displayed letters of the
          // solved row for a couple seconds.
          const displayWord = isSolvedRow
            ? rewriteWord ?? spellMessage ?? rawWord
            : rawWord;
          const letters = displayWord.toUpperCase().split('');
          const evalRow =
            evaluations[rowIdx] ?? Array.from({ length: targetLength }, () => (isActiveRow ? 'unknown' : 'absent'));
          const isRevealing = revealRow === rowIdx;
          return (
            <div
              key={rowIdx}
              className={cn(
                'flex w-full gap-1.5 rounded-md px-1 py-1 transition-colors sm:gap-2 sm:px-2',
                isActiveRow ? 'bg-surface/70' : 'bg-white/30'
              )}
            >
              {Array.from({ length: targetLength }).map((__, col) => {
                const shouldHideEval = isRevealing && col >= revealedCols;
                return (
                  <Tile
                    key={col}
                    letter={letters[col] ?? ''}
                    state={shouldHideEval ? 'unknown' : evalRow[col] ?? 'unknown'}
                    active={isActiveRow || shouldHideEval}
                    animate={isRevealing}
                    animateDelayMs={col * TILE_STAGGER_MS}
                    falling={tilesFalling && isSolvedRow}
                    fallDelayMs={col * 120}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      <Keyboard onKey={handleKey} keyStates={keyStates} enterMovesAway={enterMovesAway} />

      <WrongAnswerReveal
        open={wrongAnswerOpen}
        realAnswer={answer}
        onFinish={() => setWrongAnswerOpen(false)}
      />
    </Card>
  );
}

function evaluate(guess: string, answer: string): LetterEval[] {
  const t = answer.toLowerCase().split('');
  const g = guess.toLowerCase().split('');
  const remaining = [...t];
  const result: LetterEval[] = Array(g.length).fill('unknown');

  g.forEach((letter, i) => {
    if (letter === t[i]) {
      result[i] = 'correct';
      const idx = remaining.indexOf(letter);
      if (idx > -1) remaining.splice(idx, 1);
    }
  });

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

function Tile({
  letter,
  state,
  active,
  animate,
  animateDelayMs,
  falling = false,
  fallDelayMs = 0
}: {
  letter: string;
  state: LetterEval;
  active: boolean;
  animate: boolean;
  animateDelayMs: number;
  falling?: boolean;
  fallDelayMs?: number;
}) {
  const colors: Record<LetterEval, string> = {
    correct: 'bg-success text-white border-success/90 shadow-[0_6px_18px_rgba(0,0,0,0.22)]',
    present: 'bg-warning text-white border-warning/90 shadow-[0_6px_18px_rgba(0,0,0,0.22)]',
    absent:
      'bg-brand-sage/60 text-foreground/45 border-brand-sage/50 opacity-80 shadow-[0_3px_10px_rgba(0,0,0,0.12)]',
    unknown: active
      ? 'bg-surface text-textPrimary border-textSecondary/50 shadow-[0_5px_14px_rgba(0,0,0,0.16)]'
      : 'bg-white/85 text-textPrimary border-textSecondary/30 shadow-[0_4px_12px_rgba(0,0,0,0.14)]'
  };
  return (
    <div
      className={cn(
        'grid aspect-square w-full min-w-0 max-w-[56px] basis-0 flex-1 place-items-center rounded-md border text-lg font-bold',
        'select-none',
        animate && !falling && 'animate-flip',
        falling && 'animate-tile-fall',
        colors[state]
      )}
      style={
        falling
          ? { animationDelay: `${fallDelayMs}ms` }
          : animate
          ? { animationDelay: `${animateDelayMs}ms` }
          : undefined
      }
    >
      {letter}
    </div>
  );
}
