import { supabase } from './supabase';
import type {
  GameHistoryEntry,
  GameLane,
  GameMode,
  LeaderboardEntry,
  LetterEval,
  MonthlyLeaderboardEntry,
  MyAttempt,
  UserStats
} from './types';

interface SaveAttemptArgs {
  userId: string;
  puzzleId: string;
  rows: string[];
  timeMs: number;
  hintsUsed: number;
  lane: GameLane;
  mode: GameMode;
  win: boolean;
  finished: boolean;
}

export async function saveAttempt(args: SaveAttemptArgs): Promise<void> {
  const { error } = await supabase
    .from('puzzle_attempts')
    .upsert(
      {
        user_id: args.userId,
        puzzle_id: args.puzzleId,
        rows: args.rows,
        guesses_used: args.rows.length,
        time_ms: args.timeMs,
        hints_used: args.hintsUsed,
        lane: args.lane,
        mode: args.mode,
        win: args.win,
        finished: args.finished
      },
      { onConflict: 'user_id,puzzle_id' }
    );
  if (error) {
    const parts = [error.code, error.message, error.details, error.hint].filter(Boolean);
    const full = parts.join(' · ');
    console.error('saveAttempt error', error);
    throw new Error(full || 'saveAttempt failed');
  }
}

export async function fetchUserStats(userId: string): Promise<UserStats> {
  const { data, error } = await supabase
    .from('puzzle_attempts')
    .select('win, finished, puzzles!inner(date)')
    .eq('user_id', userId)
    .eq('finished', true)
    .order('date', { foreignTable: 'puzzles', ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Array<{ win: boolean; finished: boolean; puzzles: { date: string } | { date: string }[] }>;
  const normalized = rows
    .map((r) => ({
      win: r.win,
      date: Array.isArray(r.puzzles) ? r.puzzles[0]?.date : r.puzzles?.date
    }))
    .filter((r): r is { win: boolean; date: string } => Boolean(r.date))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const totalPlayed = normalized.length;
  const totalWins = normalized.filter((r) => r.win).length;

  const todayUtc = new Date().toISOString().slice(0, 10);
  let currentStreak = 0;
  let cursor = todayUtc;
  for (const row of normalized) {
    if (!row.win) break;
    if (row.date === cursor) {
      currentStreak += 1;
      cursor = shiftDate(cursor, -1);
    } else if (row.date === shiftDate(cursor, -1) && cursor === todayUtc) {
      // allow the streak to include yesterday if today isn't played yet
      currentStreak += 1;
      cursor = shiftDate(row.date, -1);
    } else {
      break;
    }
  }

  let maxStreak = 0;
  let running = 0;
  let prev: string | null = null;
  const ascending = [...normalized].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const row of ascending) {
    if (!row.win) {
      running = 0;
      prev = row.date;
      continue;
    }
    if (prev && shiftDate(prev, 1) === row.date) {
      running += 1;
    } else {
      running = 1;
    }
    if (running > maxStreak) maxStreak = running;
    prev = row.date;
  }

  return { currentStreak, maxStreak, totalWins, totalPlayed };
}

export async function fetchMyAttempt(userId: string, puzzleId: string): Promise<MyAttempt | null> {
  const { data, error } = await supabase
    .from('puzzle_attempts')
    .select('rows, guesses_used, time_ms, win, finished')
    .eq('user_id', userId)
    .eq('puzzle_id', puzzleId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    rows: (data.rows as string[]) ?? [],
    guessesUsed: data.guesses_used as number,
    timeMs: data.time_ms as number,
    win: data.win as boolean,
    finished: data.finished as boolean
  };
}

export async function fetchGameHistory(userId: string, limit = 30): Promise<GameHistoryEntry[]> {
  const { data, error } = await supabase
    .from('puzzle_attempts')
    .select('id, guesses_used, time_ms, hints_used, win, created_at, puzzles!inner(date, word)')
    .eq('user_id', userId)
    .eq('finished', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as any[]).map((r) => {
    const puzzle = Array.isArray(r.puzzles) ? r.puzzles[0] : r.puzzles;
    return {
      id: r.id as string,
      date: puzzle?.date as string,
      word: puzzle?.word as string,
      guessesUsed: r.guesses_used as number,
      timeMs: r.time_ms as number,
      hintsUsed: r.hints_used as number,
      win: r.win as boolean,
      createdAt: r.created_at as string
    } satisfies GameHistoryEntry;
  });
}

/**
 * Returns the user_ids that should appear on the leaderboard for the given
 * viewer — namely everyone in their couple (themselves + partner). If the
 * user isn't linked, returns just their own id (so solo players still see
 * their own attempt). Fails open on errors so the UI doesn't blank.
 */
async function coupleMemberIds(userId: string): Promise<string[]> {
  try {
    const { data: mine, error } = await supabase
      .from('couple_members')
      .select('couple_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !mine) return [userId];
    const { data: all, error: e2 } = await supabase
      .from('couple_members')
      .select('user_id')
      .eq('couple_id', (mine as { couple_id: string }).couple_id);
    if (e2 || !all) return [userId];
    const ids = new Set<string>([userId]);
    for (const r of all as Array<{ user_id: string }>) ids.add(r.user_id);
    return Array.from(ids);
  } catch {
    return [userId];
  }
}

export async function fetchLeaderboard(puzzleId: string, puzzleWord: string, currentUserId: string | null): Promise<LeaderboardEntry[]> {
  if (!currentUserId) return [];
  const memberIds = await coupleMemberIds(currentUserId);
  const { data: attempts, error } = await supabase
    .from('puzzle_attempts')
    .select('user_id, rows, guesses_used, time_ms, win, finished')
    .eq('puzzle_id', puzzleId)
    .eq('finished', true)
    .in('user_id', memberIds);
  if (error) throw error;
  const list = (attempts ?? []) as Array<{
    user_id: string;
    rows: string[];
    guesses_used: number;
    time_ms: number;
    win: boolean;
    finished: boolean;
  }>;
  if (list.length === 0) return [];

  const userIds = Array.from(new Set(list.map((a) => a.user_id)));
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url')
    .in('user_id', userIds);
  if (profileErr) throw profileErr;
  const nameById = new Map<string, string>();
  const avatarById = new Map<string, string | null>();
  for (const p of (profiles ?? []) as Array<{ user_id: string; display_name: string; avatar_url: string | null }>) {
    nameById.set(p.user_id, p.display_name || 'Player');
    avatarById.set(p.user_id, p.avatar_url ?? null);
  }

  return list
    .map((a) => ({
      userId: a.user_id,
      displayName: nameById.get(a.user_id) || 'Player',
      avatarUrl: avatarById.get(a.user_id) ?? null,
      guessesUsed: a.guesses_used,
      timeMs: a.time_ms,
      win: a.win,
      rows: a.rows ?? [],
      evaluations: (a.rows ?? []).map((row) => evaluateRow(row, puzzleWord)),
      isYou: a.user_id === currentUserId
    }))
    .sort((a, b) => {
      if (a.win !== b.win) return a.win ? -1 : 1;
      if (a.guessesUsed !== b.guessesUsed) return a.guessesUsed - b.guessesUsed;
      return a.timeMs - b.timeMs;
    });
}

/**
 * Returns `YYYY-MM-01` for the current calendar month in America/Denver
 * (handles MST/MDT automatically via Intl).
 */
function firstOfMonthDenver(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${y}-${m}-01`;
}

/**
 * Monthly leaderboard: total classic wins per user since the first of the
 * current calendar month in Denver time. Ties use the same rank number
 * (computed in the UI). Classic-lane only.
 */
export async function fetchMonthlyWinsLeaderboard(
  currentUserId: string | null
): Promise<MonthlyLeaderboardEntry[]> {
  if (!currentUserId) return [];
  const monthStart = firstOfMonthDenver();
  const memberIds = await coupleMemberIds(currentUserId);

  const { data, error } = await supabase
    .from('puzzle_attempts')
    .select('user_id, puzzles!inner(date, lane)')
    .eq('finished', true)
    .eq('win', true)
    .eq('puzzles.lane', 'classic')
    .gte('puzzles.date', monthStart)
    .in('user_id', memberIds);
  if (error) throw error;

  const rows = (data ?? []) as Array<{ user_id: string }>;
  if (rows.length === 0) return [];

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);

  const userIds = Array.from(counts.keys());
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url')
    .in('user_id', userIds);
  if (pErr) throw pErr;

  const profileById = new Map<
    string,
    { displayName: string; avatarUrl: string | null }
  >();
  for (const p of (profiles ?? []) as Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  }>) {
    profileById.set(p.user_id, {
      displayName: p.display_name ?? '',
      avatarUrl: p.avatar_url ?? null
    });
  }

  return Array.from(counts.entries())
    .map(([userId, wins]) => {
      const pf = profileById.get(userId);
      return {
        userId,
        displayName: pf?.displayName || 'Player',
        avatarUrl: pf?.avatarUrl ?? null,
        wins,
        isYou: userId === currentUserId
      } satisfies MonthlyLeaderboardEntry;
    })
    .sort((a, b) => b.wins - a.wins);
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function evaluateRow(guess: string, answer: string): LetterEval[] {
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
