import { supabase } from './supabase';
import type {
  GameHistoryEntry,
  GameLane,
  GameMode,
  GlobalDailyCoupleEntry,
  GlobalMonthlyCoupleEntry,
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

  // Head-to-head wins against the user's partner. The 'win' trophy kind
  // is awarded exclusively inside the couple H2H block (see
  // award_trophies_for_attempt), so counting those rows is the canonical
  // source of truth for H2H wins.
  let h2hWins = 0;
  try {
    const { count } = await supabase
      .from('trophies')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('kind', 'win');
    h2hWins = count ?? 0;
  } catch (_e) {
    h2hWins = 0;
  }

  return { currentStreak, maxStreak, totalWins, totalPlayed, totalSolves, h2hWins };
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

  const puzzleIds = rows.map((r) => r.puzzle_id as string);

  // Source of truth for H2H outcome: the 'win' trophy (kind='win' is
  // H2H-exclusive post-semantic-restore, and manual overrides live here).
  // If a user has a 'win' trophy for a puzzle they solved, it's an h2h_win;
  // otherwise it's 'solved'. This keeps the chip aligned with the trophy
  // shelf and Profile Wins count.
  let winTrophyPuzzleIds = new Set<string>();
  try {
    const { data: winTrophies } = await supabase
      .from('trophies')
      .select('puzzle_id')
      .eq('user_id', userId)
      .eq('kind', 'win')
      .in('puzzle_id', puzzleIds);
    winTrophyPuzzleIds = new Set(
      ((winTrophies ?? []) as any[])
        .map((t) => t.puzzle_id as string | null)
        .filter((v): v is string => !!v)
    );
  } catch (_e) {
    winTrophyPuzzleIds = new Set();
  }
  return rows.map((r) => {
    const puzzle = Array.isArray(r.puzzles) ? r.puzzles[0] : r.puzzles;
    const selfWin = Boolean(r.win);
    const selfCreatedAt = r.created_at as string;

    // Outcome rules:
    //   - didn't solve → missed
    //   - solved + has 'win' trophy for this puzzle → h2h_win
    //   - solved + no trophy → solved
    // The trophy table is authoritative so manual overrides (admin
    // inserts/deletes) reflect immediately on the chip.
    let outcome: 'h2h_win' | 'solved' | 'missed';
    if (!selfWin) {
      outcome = 'missed';
    } else if (winTrophyPuzzleIds.has(r.puzzle_id as string)) {
      outcome = 'h2h_win';
    } else {
      outcome = 'solved';
    }

    return {
      id: r.id as string,
      date: puzzle?.date as string,
      word: puzzle?.word as string,
      guessesUsed: r.guesses_used as number,
      timeMs: (r.time_ms as number) ?? 0,
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
 * Monthly leaderboard. Primary metric: H2H wins on classic puzzles
 * scoped to the current Denver calendar month — sourced from the
 * trophies table (kind='win' is awarded exclusively to the H2H winner).
 * Secondary metric: total solves (classic + bonus wins) this month,
 * used as a tiebreaker and rendered alongside.
 */
export async function fetchMonthlyWinsLeaderboard(
  currentUserId: string | null
): Promise<MonthlyLeaderboardEntry[]> {
  if (!currentUserId) return [];
  const monthStart = firstOfMonthDenver();
  const memberIds = await coupleMemberIds(currentUserId);

  // Month-scoped H2H wins: join trophies → puzzles, filter kind='win'
  // and the puzzle's lane='classic' + date >= monthStart.
  const { data: winRows, error: winErr } = await supabase
    .from('trophies')
    .select('user_id, puzzles!inner(date, lane)')
    .eq('kind', 'win')
    .eq('puzzles.lane', 'classic')
    .gte('puzzles.date', monthStart)
    .in('user_id', memberIds);
  if (winErr) throw winErr;

  // Month-scoped solves (classic + bonus). We keep the same member-id
  // filter so the leaderboard stays scoped to the couple.
  const { data: solveRows, error: solveErr } = await supabase
    .from('puzzle_attempts')
    .select('user_id, puzzles!inner(date, lane)')
    .eq('finished', true)
    .eq('win', true)
    .in('puzzles.lane', ['classic', 'bonus'])
    .gte('puzzles.date', monthStart)
    .in('user_id', memberIds);
  if (solveErr) throw solveErr;

  const wins = new Map<string, number>();
  for (const r of (winRows ?? []) as Array<{ user_id: string }>) {
    wins.set(r.user_id, (wins.get(r.user_id) ?? 0) + 1);
  }
  const solves = new Map<string, number>();
  for (const r of (solveRows ?? []) as Array<{ user_id: string }>) {
    solves.set(r.user_id, (solves.get(r.user_id) ?? 0) + 1);
  }

  // Union of user_ids that appear in either metric, so a partner who
  // solved but never won H2H still shows up (with 0 wins, N solves).
  const userIds = Array.from(new Set([...wins.keys(), ...solves.keys()]));
  if (userIds.length === 0) return [];

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

  return userIds
    .map((userId) => {
      const pf = profileById.get(userId);
      return {
        userId,
        displayName: pf?.displayName || 'Player',
        avatarUrl: pf?.avatarUrl ?? null,
        wins: wins.get(userId) ?? 0,
        totalSolves: solves.get(userId) ?? 0,
        isYou: userId === currentUserId
      } satisfies MonthlyLeaderboardEntry;
    })
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.totalSolves - a.totalSolves;
    });
}

/**
 * Cross-couple daily leaderboard. Only couples where BOTH members solved
 * the given classic puzzle appear. Ranked by avg guesses asc, avg time
 * asc. Uses a SECURITY DEFINER RPC because couples/couple_members RLS
 * restricts direct reads to the caller's own couple.
 */
export async function fetchGlobalDailyCoupleLeaderboard(
  puzzleId: string,
  currentUserId: string | null
): Promise<GlobalDailyCoupleEntry[]> {
  if (!puzzleId) return [];
  const { data, error } = await supabase.rpc('get_global_daily_couple_leaderboard', {
    p_puzzle_id: puzzleId
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    couple_id: string;
    theme_color: string | null;
    m1_user_id: string;
    m1_display_name: string | null;
    m1_guesses_used: number;
    m1_time_ms: number;
    m1_rows: string[] | null;
    m2_user_id: string;
    m2_display_name: string | null;
    m2_guesses_used: number;
    m2_time_ms: number;
    m2_rows: string[] | null;
    avg_guesses: number | string;
    avg_time_ms: number | string;
  }>;

  // We need the puzzle word to compute the tile color grid. Fetch once.
  const { data: puzzle, error: pErr } = await supabase
    .from('puzzles')
    .select('word')
    .eq('id', puzzleId)
    .single();
  if (pErr) throw pErr;
  const word = (puzzle?.word as string) ?? '';

  return rows.map((r) => {
    const m1Rows = Array.isArray(r.m1_rows) ? r.m1_rows : [];
    const m2Rows = Array.isArray(r.m2_rows) ? r.m2_rows : [];
    const isMine = !!currentUserId && (r.m1_user_id === currentUserId || r.m2_user_id === currentUserId);
    return {
      coupleId: r.couple_id,
      themeColor: r.theme_color,
      members: [
        {
          userId: r.m1_user_id,
          displayName: r.m1_display_name || 'Player',
          guessesUsed: r.m1_guesses_used,
          timeMs: r.m1_time_ms,
          rows: m1Rows,
          evaluations: m1Rows.map((row) => evaluateRow(row, word))
        },
        {
          userId: r.m2_user_id,
          displayName: r.m2_display_name || 'Player',
          guessesUsed: r.m2_guesses_used,
          timeMs: r.m2_time_ms,
          rows: m2Rows,
          evaluations: m2Rows.map((row) => evaluateRow(row, word))
        }
      ],
      avgGuesses: Number(r.avg_guesses),
      avgTimeMs: Number(r.avg_time_ms),
      isMine
    } satisfies GlobalDailyCoupleEntry;
  });
}

/**
 * Cross-couple monthly leaderboard. Per couple, aggregates ONLY the
 * puzzles where both members solved (the "overlap set"). Ranked by avg
 * guesses asc, avg time asc. Uses a SECURITY DEFINER RPC for the same
 * reason as the daily variant.
 */
export async function fetchGlobalMonthlyCoupleLeaderboard(
  currentUserId: string | null
): Promise<GlobalMonthlyCoupleEntry[]> {
  const monthStart = firstOfMonthDenver();
  const { data, error } = await supabase.rpc('get_global_monthly_couple_leaderboard', {
    p_month_start: monthStart
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    couple_id: string;
    theme_color: string | null;
    m1_user_id: string | null;
    m1_display_name: string | null;
    m2_user_id: string | null;
    m2_display_name: string | null;
    overlap_count: number;
    avg_guesses: number | string;
    avg_time_ms: number | string;
    best_guesses: number | string | null;
    best_time_ms: number | string | null;
    best_date: string | null;
  }>;

  return rows.map((r) => {
    const members: GlobalMonthlyCoupleEntry['members'] = [];
    if (r.m1_user_id) members.push({ userId: r.m1_user_id, displayName: r.m1_display_name || 'Player' });
    if (r.m2_user_id) members.push({ userId: r.m2_user_id, displayName: r.m2_display_name || 'Player' });
    const isMine = !!currentUserId && members.some((m) => m.userId === currentUserId);
    return {
      coupleId: r.couple_id,
      themeColor: r.theme_color,
      members,
      overlapCount: r.overlap_count,
      avgGuesses: Number(r.avg_guesses),
      avgTimeMs: Number(r.avg_time_ms),
      bestSolve:
        r.best_date && r.best_guesses !== null && r.best_time_ms !== null
          ? {
              guesses: Number(r.best_guesses),
              timeMs: Number(r.best_time_ms),
              date: r.best_date
            }
          : null,
      isMine
    } satisfies GlobalMonthlyCoupleEntry;
  });
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
