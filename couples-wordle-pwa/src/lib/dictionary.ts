import { getValidGuesses } from './dictionary.generated';

/**
 * True if `word` is a recognized 5-letter English word. Accepts the
 * puzzle's own answer unconditionally so a rare word picked for the
 * daily never traps the user with an "invalid" rejection.
 */
export function isValidGuess(word: string, answer?: string): boolean {
  const w = (word ?? '').trim().toUpperCase();
  if (!w) return false;
  if (answer && w === answer.toUpperCase()) return true;
  try {
    return getValidGuesses().has(w);
  } catch {
    // Never lock the user out on a dict-load error — fall open.
    return true;
  }
}
