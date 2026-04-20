import { getValidGuesses } from './dictionary.generated';

const STORAGE_KEY = 'admin-test-puzzle:v1';

export interface TestPuzzleState {
  word: string;
  rows: string[];
  finished: boolean;
}

/**
 * Picks a random 5-letter word from the guess dictionary, excluding the
 * daily answer (so the admin test never collides with today's puzzle) and
 * optionally the current test word (so "New word" always changes).
 */
export function pickTestWord(excludeDaily?: string, excludeCurrent?: string): string {
  const words = Array.from(getValidGuesses());
  const blocked = new Set<string>();
  if (excludeDaily) blocked.add(excludeDaily.toUpperCase());
  if (excludeCurrent) blocked.add(excludeCurrent.toUpperCase());
  const pool = words.filter((w) => !blocked.has(w));
  const source = pool.length > 0 ? pool : words;
  return source[Math.floor(Math.random() * source.length)];
}

export function loadTestPuzzle(): TestPuzzleState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TestPuzzleState;
    if (!parsed?.word) return null;
    return {
      word: parsed.word.toUpperCase(),
      rows: Array.isArray(parsed.rows) ? parsed.rows.map((r) => String(r).toUpperCase()) : [],
      finished: !!parsed.finished
    };
  } catch {
    return null;
  }
}

export function saveTestPuzzle(state: TestPuzzleState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function clearTestPuzzle(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
