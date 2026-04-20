import { supabase } from '@/lib/supabase';

export type PrankCategory = 'instant' | 'slow-burn' | 'narrative';

export interface PrankDef {
  key: string;
  title: string;
  description: string;
  category: PrankCategory;
}

export interface PrankSettings {
  enabled: boolean;
  probability: number; // 0-1
  triggerMaxGuesses: number; // fires when guesses_used <= this value (default 2 = "<3")
  exemptUserIds: string[];
  // slow-burn only
  fireSameSession?: boolean;
  fireNextDay?: boolean;
}

export const PRANK_DEFS: PrankDef[] = [
  // ─── Instant gratification ──────────────────────────────────────────────
  {
    key: 'moving_enter',
    category: 'instant',
    title: 'Moving Enter button',
    description:
      'Enter key jumps away when the cheater hovers (desktop) or taps (mobile) it. Relents after several failed attempts.'
  },
  {
    key: 'wrong_answer_reveal',
    category: 'instant',
    title: 'Wrong-answer reveal',
    description:
      'Flips the tiles with incorrect colors, shows a fake "wrong word" modal, then 10 s later drops confetti + "JK" and re-renders the real solution.'
  },
  {
    key: 'impostor_badge',
    category: 'instant',
    title: 'Impostor badge on leaderboard',
    description:
      'Appends a 🤖 (bot) badge next to the cheater\'s name on the leaderboard for that day\'s puzzle. Visible to everyone. Clears on a later normal-speed win.'
  },

  // ─── Slow-burn (next-day or same-session) ──────────────────────────────
  {
    key: 'autocorrect_sabotage',
    category: 'slow-burn',
    title: 'Autocorrect sabotage',
    description:
      'Each keystroke randomly substitutes visually similar characters (E↔3, O↔0, A↔4, S↔5, I↔1).'
  },
  {
    key: 'reverse_keystrokes',
    category: 'slow-burn',
    title: 'Reverse keystrokes',
    description:
      'Letters insert at the start of the word instead of the end. HELLO becomes OLLEH.'
  },
  {
    key: 'tile_rebellion',
    category: 'slow-burn',
    title: 'Tile rebellion',
    description:
      'After winning, tiles peel off the board one by one and tumble down the screen before the win card appears.'
  },

  // ─── Narrative gags ────────────────────────────────────────────────────
  {
    key: 'partner_reaction',
    category: 'narrative',
    title: 'Fake partner reaction',
    description:
      'Modal appears after a fast win: "Your partner saw your time and said..." followed by a typewriter message like "babe … how".'
  },
  {
    key: 'tiles_spell_message',
    category: 'narrative',
    title: 'Tiles spell out a message',
    description:
      'On the solved row, tiles slowly rearrange from the winning word into "HOW DID YOU DO THAT", hold for 5 s, then flip back.'
  },
  {
    key: 'suspicious_activity',
    category: 'narrative',
    title: 'Suspicious-activity modal',
    description:
      '"🚨 Unusual play speed detected" prompt with a CAPTCHA asking them to click the non-green squares in a grid of all-green squares.'
  },
  {
    key: 'reveal_rewrite',
    category: 'narrative',
    title: 'Reveal rewrite',
    description:
      "After a fast win, the winning row's letters scramble into a different 5-letter word, hold briefly, then snap back to the real solution."
  },
  {
    key: 'false_positive',
    category: 'narrative',
    title: 'False positive — "save failed"',
    description:
      'Fake error toast claims the score didn\'t save ("Save failed: rate limit"). 8 s later a second toast: "Just kidding, saved."'
  },
  {
    key: 'instant_dm',
    category: 'narrative',
    title: 'Fake dev DM',
    description:
      '"Message from the developer" modal asking them to share their strategy. On dismiss, snaps back with "Actually, never mind 😉".'
  },
  {
    key: 'sudden_dark_mode',
    category: 'narrative',
    title: 'Sudden dark mode',
    description:
      'Screen fades to a red-tinted dark overlay for ~3 s with "REVIEWING…" label, then restores.'
  },
  {
    key: 'retractable_score',
    category: 'narrative',
    title: 'Retractable score',
    description:
      "Their leaderboard rank drifts down one slot every ~5 s until they hit last place. Resets on refresh."
  }
];

export function defaultSettingsFor(def: PrankDef): PrankSettings {
  const base: PrankSettings = {
    enabled: false,
    probability: 1,
    triggerMaxGuesses: 2, // "<3"
    exemptUserIds: []
  };
  if (def.category === 'slow-burn') {
    base.fireSameSession = false;
    base.fireNextDay = true;
  }
  return base;
}

// ───────────────────────────────────────────────────────────────────────
// Gating helpers
// ───────────────────────────────────────────────────────────────────────

export interface TriggerContext {
  /** Guesses the target used to solve today's puzzle. */
  guessesUsed: number;
}

/**
 * Pure gate. Returns true if the prank should fire for this user given
 * its settings and the trigger context. Rolls the probability die.
 *
 * Caller is responsible for making sure `userId` isn't the admin's own
 * id — admins are never trolled.
 */
export function shouldFirePrank(
  settings: PrankSettings | undefined,
  userId: string,
  ctx: TriggerContext
): boolean {
  if (!settings) return false;
  if (!settings.enabled) return false;
  if (ctx.guessesUsed > settings.triggerMaxGuesses) return false;
  if (settings.exemptUserIds.includes(userId)) return false;
  if (Math.random() > settings.probability) return false;
  return true;
}

/** Yesterday's UTC date in YYYY-MM-DD. */
function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const SAME_SESSION_KEY = 'prank:sessionFastWins';

/** Record that a user speed-won during the current session. */
export function markFastWinThisSession(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(SAME_SESSION_KEY);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    set.add(userId);
    window.sessionStorage.setItem(SAME_SESSION_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* noop */
  }
}

/** Did this user fast-win earlier in the current browser session? */
export function hadFastWinThisSession(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.sessionStorage.getItem(SAME_SESSION_KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as string[]).includes(userId);
  } catch {
    return false;
  }
}

/**
 * Checks whether the given user won yesterday's classic puzzle fast enough
 * to trigger the given slow-burn prank. Used on today's load to decide
 * whether to apply sabotage pranks (autocorrect / reverse-keys / etc).
 *
 * Returns false on any DB error so we fail closed (no prank).
 */
export async function wasFastWinYesterday(
  userId: string,
  settings: PrankSettings
): Promise<boolean> {
  if (!settings.enabled || !settings.fireNextDay) return false;
  if (settings.exemptUserIds.includes(userId)) return false;

  try {
    const { data, error } = await supabase
      .from('puzzle_attempts')
      .select('win, guesses_used, puzzles!inner(date, lane)')
      .eq('user_id', userId)
      .eq('finished', true)
      .eq('win', true)
      .lte('guesses_used', settings.triggerMaxGuesses)
      .eq('puzzles.date', yesterdayUTC())
      .eq('puzzles.lane', 'classic')
      .limit(1);
    if (error) {
      console.warn('wasFastWinYesterday query failed', error);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (e) {
    console.warn('wasFastWinYesterday threw', e);
    return false;
  }
}
