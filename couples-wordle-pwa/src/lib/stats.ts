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
  // Fetch classic + bonus finished attempts. Streaks + totalPlayed/totalWins
  // come from classic only; totalSolves spans classic + bonus.
  const { data, error } = await supabase
    .from('puzzle_attempts')
    .select('win, finished, lane, puzzles!inner(date)')
    .eq('user_id', userId)
    .eq('finished', true)
    .in('lane', ['classic', 'bonus']);
  if (error) throw error;

  const all = ((data ?? []) as any[])
    .map((r) => ({
      win: r.win as boolean,
      lane: r.lane as 'classic' | 'bonus',
      date: (Array.isArray(r.puzzles) ? r.puzzles[0]?.date : r.puzzles?.date) as string
    }))
    .filter((r) => Boolean(r.date));

  const classic = all.filter((r) => r.lane === 'classic');
  const totalPlayed = classic.length;
  const totalWins = classic.filter((r) => r.win).length;
  const totalSolves = all.filter((r) => r.win).length; // classic + bonus wins

  // Map date → did the user win the classic puzzle that day. One attempt
  // per user per puzzle_id (UNIQUE), one classic puzzle per date, so safe.
  const classicByDate = new Map<string, boolean>();
  for (const r of classic) classicByDate.set(r.date, r.win);

  const todayUtc = new Date().toISOString().slice(0, 10);
  let currentStreak = 0;
  // If today's classic is played, start walking from today; otherwise
  // start from yesterday so a not-yet-played-today doesn't mask the
  // user's ongoing streak. A classic LOSS today zeroes it out.
  let cursor: string | null;
  if (classicByDate.has(todayUtc)) {
    cursor = classicByDate.get(todayUtc) === true ? todayUtc : null;
  } else {
    cursor = shiftDate(todayUtc, -1);
  }
  while (cursor && classicByDate.get(cursor) === true) {
    currentStreak += 1;
    cursor = shiftDate(cursor, -1);
  }

  // Max streak: walk classic attempts ascending, reset on missed day or loss.
  let maxStreak = 0;
  let running = 0;
  let prev: string | null = null;
  const ascending = [...classic].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const row of ascending) {
    if (!row.win) {
      running = 0;
      prev = row.date;
      continue;
    }
    running = prev && shiftDate(prev, 1) === row.date ? running + 1 : 1;
    if (running > maxStreak) maxStreak = running;
    prev = row.date;
  }

  return { currentStreak, maxStreak, totalWins, totalPlayed, totalSolves };
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
    .select('id, puzzle_id, guesses_used, time_ms, hints_used, win, created_at, puzzles!inner(date, word)')
    .eq('user_id', userId)
    .eq('finished', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  // Fetch the linked partner's finished attempts for the same puzzles, so
  // we can stamp each row with an h2h outcome. Two lookups keep it simple
  // and avoid depending on a partner FK embedding that doesn't exist.
  const puzzleIds = rows.map((r) => r.puzzle_id as string);
  let partnerMap = new Map<
    string,
    { guessesUsed: number; timeMs: number; win: boolean; createdAt: string }
  >();
  try {
    const { data: cm } = await supabase
      .from('couple_members')
      .select('couple_id')
      .eq('user_id', userId)
      .maybeSingle();
    const coupleId = (cm as any)?.couple_id as string | undefined;
    if (coupleId) {
      const { data: partnerRow } = await supabase
        .from('couple_members')
        .select('user_id')
        .eq('couple_id', coupleId)
        .neq('user_id', userId)
        .maybeSingle();
      const partnerId = (partnerRow as any)?.user_id as string | undefined;
      if (partnerId) {
        const { data: partnerAttempts } = await supabase
          .from('puzzle_attempts')
          .select('puzzle_id, guesses_used, time_ms, win, created_at')
          .eq('user_id', partnerId)
          .eq('finished', true)
          .in('puzzle_id', puzzleIds);
        for (const p of (partnerAttempts ?? []) as any[]) {
          partnerMap.set(p.puzzle_id as string, {
            guessesUsed: p.guesses_used as number,
            timeMs: p.time_ms as number,
            win: p.win as boolean,
            createdAt: p.created_at as string
          });
        }
      }
    }
  } catch (_e) {
    // Partner lookup failing just means every row falls back to a
    // solo-style outcome (solved / missed); never block history render.
    partnerMap = new Map();
  }

  return rows.map((r) => {
    const puzzle = Array.isArray(r.puzzles) ? r.puzzles[0] : r.puzzles;
    const selfWin = Boolean(r.win);
    const selfGuesses = r.guesses_used as number;
    const selfTime = (r.time_ms as number) ?? 0;
    const selfCreatedAt = r.created_at as string;
    const partner = partnerMap.get(r.puzzle_id as string);

    let outcome: 'h2h_win' | 'solved' | 'missed';
    if (!selfWin) {
      outcome = 'missed';
    } else if (partner && partner.win) {
      // Head-to-head: fewer guesses → lower time_ms → earlier created_at.
      // Mirrors the DB tiebreak in award_trophies_for_attempt.
      if (selfGuesses < partner.guessesUsed) outcome = 'h2h_win';
      else if (selfGuesses > partner.guessesUsed) outcome = 'solved';
      else if (selfTime < partner.timeMs) outcome = 'h2h_win';
      else if (selfTime > partner.timeMs) outcome = 'solved';
      else if (selfCreatedAt < partner.createdAt) outcome = 'h2h_win';
      else outcome = 'solved';
    } else {
      outcome = 'solved';
    }

    return {
      id: r.id as string,
      date: puzzle?.date as string,
      word: puzzle?.word as string,
      guessesUsed: selfGuesses,
      timeMs: selfTime,
      hintsUsed: r.hints_used as number,
      win: selfWin,
      outcome,
      createdAt: selfCreatedAt
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
