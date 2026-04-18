import { supabase } from './supabase';
import type {
  Trophy,
  TrophyCategory,
  TrophyKind,
  TrophyProgress,
  TrophyStats,
  TrophyTier
} from './types';

export interface TrophyMeta {
  label: string;
  description: string;
  tier: TrophyTier;
  category: TrophyCategory;
  /** Hidden from the shelf until the user has earned it at least once. */
  secret?: boolean;
  /** Stackable trophies (weekly_7, monthly_sweep, etc.) — show "earned N times". */
  stackable?: boolean;
  /**
   * Optional numeric progress target. Pair with `progressField` which names
   * the key on `TrophyProgress` that carries the user's current value.
   * Omitted for purely event-triggered trophies.
   */
  progressTarget?: number;
  progressField?: keyof TrophyProgress;
  /** For time-based trophies where "lower is better". */
  progressInverse?: boolean;
}

export const TROPHY_META: Record<TrophyKind, TrophyMeta> = {
  // ---- head-to-head ----------------------------------------------------
  win: {
    label: 'Daily W',
    description: 'Beat your partner — fewer guesses (ties broken by time).',
    tier: 'bronze',
    category: 'headtohead'
  },
  sub_3: {
    label: 'Sub-3',
    description: 'Solved in three guesses or fewer.',
    tier: 'silver',
    category: 'skill',
    progressTarget: 1,
    progressField: 'sub3Wins'
  },
  perfect: {
    label: 'Perfect',
    description: 'Solved on the first guess.',
    tier: 'gold',
    category: 'skill',
    progressTarget: 1,
    progressField: 'perfectWins'
  },

  // ---- daily streak milestones -----------------------------------------
  streak_7: {
    label: '7-day streak',
    description: 'Seven consecutive daily wins.',
    tier: 'bronze',
    category: 'cadence',
    progressTarget: 7,
    progressField: 'currentStreak'
  },
  streak_14: {
    label: '14-day streak',
    description: 'Two weeks in a row.',
    tier: 'silver',
    category: 'cadence',
    progressTarget: 14,
    progressField: 'currentStreak'
  },
  streak_30: {
    label: '30-day streak',
    description: 'A full month of wins.',
    tier: 'gold',
    category: 'cadence',
    progressTarget: 30,
    progressField: 'currentStreak'
  },

  // ---- couple ----------------------------------------------------------
  couple_sync: {
    label: 'Sync',
    description: 'Both of you finished the same daily puzzle.',
    tier: 'bronze',
    category: 'couple'
  },
  couple_tag_team: {
    label: 'Tag team',
    description: 'Both of you solved the same daily puzzle.',
    tier: 'silver',
    category: 'couple'
  },
  couple_mirror: {
    label: 'Mirror match',
    description: 'Both solved the same puzzle in the same guess count.',
    tier: 'gold',
    category: 'couple'
  },
  couple_pace: {
    label: 'Pace keeper',
    description: 'Finished within one hour of your partner.',
    tier: 'bronze',
    category: 'couple'
  },
  couple_streak_7: {
    label: 'Couple 7-day',
    description: 'Both won the daily every day for a week.',
    tier: 'bronze',
    category: 'couple'
  },
  couple_streak_14: {
    label: 'Couple 14-day',
    description: 'Both won the daily every day for two weeks.',
    tier: 'silver',
    category: 'couple'
  },
  couple_streak_30: {
    label: 'Couple 30-day',
    description: 'Both won the daily every day for a month.',
    tier: 'gold',
    category: 'couple'
  },

  // ---- speed -----------------------------------------------------------
  sub_minute: {
    label: 'Sub-minute',
    description: 'Solved in under 60 seconds.',
    tier: 'bronze',
    category: 'speed',
    progressTarget: 60000,
    progressField: 'bestTimeMs',
    progressInverse: true
  },
  blitz_30: {
    label: 'Blitz',
    description: 'Solved in under 30 seconds.',
    tier: 'silver',
    category: 'speed',
    progressTarget: 30000,
    progressField: 'bestTimeMs',
    progressInverse: true
  },
  lightning_10: {
    label: 'Lightning',
    description: 'Solved in under 10 seconds.',
    tier: 'gold',
    category: 'speed',
    progressTarget: 10000,
    progressField: 'bestTimeMs',
    progressInverse: true
  },

  // ---- volume / longevity ---------------------------------------------
  regular_30: {
    label: 'Regular',
    description: 'Finished 30 daily puzzles.',
    tier: 'bronze',
    category: 'volume',
    progressTarget: 30,
    progressField: 'finishes'
  },
  centenarian_100: {
    label: 'Centenarian',
    description: 'Finished 100 daily puzzles.',
    tier: 'silver',
    category: 'volume',
    progressTarget: 100,
    progressField: 'finishes'
  },
  year_one_365: {
    label: 'Year one',
    description: 'Finished 365 daily puzzles.',
    tier: 'gold',
    category: 'volume',
    progressTarget: 365,
    progressField: 'finishes'
  },
  wins_100: {
    label: 'Century of wins',
    description: '100 lifetime daily wins.',
    tier: 'silver',
    category: 'volume',
    progressTarget: 100,
    progressField: 'wins'
  },
  wins_1000: {
    label: 'Kilo-W',
    description: '1,000 lifetime daily wins.',
    tier: 'platinum',
    category: 'volume',
    progressTarget: 1000,
    progressField: 'wins'
  },
  perfectionist: {
    label: 'Perfectionist',
    description: 'Solved in a single guess twice.',
    tier: 'gold',
    category: 'skill',
    progressTarget: 2,
    progressField: 'perfectWins'
  },

  // ---- skill shape -----------------------------------------------------
  comeback: {
    label: 'Comeback',
    description: 'Won on your sixth and final guess.',
    tier: 'silver',
    category: 'skill'
  },
  green_only: {
    label: 'Green only',
    description: 'Solved without a single yellow tile.',
    tier: 'silver',
    category: 'skill'
  },
  hard_letter: {
    label: 'Hard letter',
    description: 'Won a puzzle whose answer contains J, Q, X, or Z.',
    tier: 'bronze',
    category: 'skill'
  },
  double_trouble: {
    label: 'Double trouble',
    description: 'Won a puzzle with a doubled letter.',
    tier: 'bronze',
    category: 'skill'
  },

  // ---- cadence ---------------------------------------------------------
  weekly_7: {
    label: 'Full week',
    description: 'Won every day of a Mon–Sun week.',
    tier: 'bronze',
    category: 'cadence',
    stackable: true
  },
  weekender: {
    label: 'Weekender',
    description: 'Won both Saturday and Sunday of the same week.',
    tier: 'bronze',
    category: 'cadence',
    stackable: true
  },
  morning_person_mst: {
    label: 'Morning person',
    description: 'Finished ten puzzles before 9:00 a.m. MST/MDT.',
    tier: 'bronze',
    category: 'cadence',
    progressTarget: 10,
    progressField: 'morningFinishesDenver'
  },
  night_owl_mst: {
    label: 'Night owl',
    description: 'Finished ten puzzles at 11:00 p.m. MST/MDT or later.',
    tier: 'bronze',
    category: 'cadence',
    progressTarget: 10,
    progressField: 'nightFinishesDenver'
  },
  monthly_sweep: {
    label: 'Monthly sweep',
    description: 'Won every day in a calendar month.',
    tier: 'platinum',
    category: 'cadence',
    stackable: true
  },
  new_year_w: {
    label: 'New Year W',
    description: 'Won on January 1st.',
    tier: 'bronze',
    category: 'cadence',
    secret: true,
    stackable: true
  },
  valentine_sync: {
    label: "Valentine's sync",
    description: 'Both partners solved the puzzle on February 14th.',
    tier: 'gold',
    category: 'cadence',
    secret: true,
    stackable: true
  },

  // ---- social ----------------------------------------------------------
  matched: {
    label: 'Matched',
    description: 'Linked accounts with your partner.',
    tier: 'bronze',
    category: 'social'
  },
  hype_man: {
    label: 'Hype man',
    description: 'Three people joined via your invite links.',
    tier: 'silver',
    category: 'social',
    progressTarget: 3,
    progressField: 'invitesAccepted'
  },
  kingmaker: {
    label: 'Kingmaker',
    description: 'A partner you invited earned a Daily W.',
    tier: 'gold',
    category: 'social'
  },

  // ---- anti-achievements ----------------------------------------------
  houdini: {
    label: 'Houdini',
    description: 'Lost the daily two days in a row.',
    tier: 'rib',
    category: 'rib',
    secret: true,
    stackable: true
  },
  heartbreak: {
    label: 'Heartbreak',
    description: 'Lost a puzzle your partner solved.',
    tier: 'rib',
    category: 'rib',
    secret: true,
    stackable: true
  }
};

export const TIER_ORDER: TrophyTier[] = ['bronze', 'silver', 'gold', 'platinum', 'rib'];

export const CATEGORY_ORDER: TrophyCategory[] = [
  'headtohead',
  'couple',
  'speed',
  'cadence',
  'skill',
  'volume',
  'social',
  'rib'
];

export const CATEGORY_LABEL: Record<TrophyCategory, string> = {
  headtohead: 'Head-to-head',
  couple: 'Couple',
  speed: 'Speed',
  volume: 'Longevity',
  skill: 'Skill',
  cadence: 'Cadence',
  social: 'Social',
  rib: 'Ribs'
};

export async function fetchMyTrophies(userId: string, limit = 200): Promise<Trophy[]> {
  const { data, error } = await supabase
    .from('trophies')
    .select('id, user_id, kind, tier, puzzle_id, streak_length, earned_at')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as any[]).map(normalize);
}

export async function fetchMyTrophyStats(userId: string): Promise<TrophyStats> {
  const { data, error } = await supabase
    .from('trophies')
    .select('kind, tier')
    .eq('user_id', userId);
  if (error) throw error;
  return aggregate((data ?? []) as Array<{ kind: TrophyKind; tier: TrophyTier }>);
}

export async function fetchTrophyCountsForUsers(userIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (userIds.length === 0) return map;
  const { data, error } = await supabase
    .from('trophies')
    .select('user_id')
    .in('user_id', userIds);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ user_id: string }>) {
    map.set(row.user_id, (map.get(row.user_id) ?? 0) + 1);
  }
  return map;
}

export async function fetchTrophiesForPuzzle(userId: string, puzzleId: string): Promise<Trophy[]> {
  const { data, error } = await supabase
    .from('trophies')
    .select('id, user_id, kind, tier, puzzle_id, streak_length, earned_at')
    .eq('user_id', userId)
    .eq('puzzle_id', puzzleId);
  if (error) throw error;
  return ((data ?? []) as any[]).map(normalize);
}

export async function fetchWinnersForPuzzle(puzzleId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('trophies')
    .select('user_id')
    .eq('kind', 'win')
    .eq('puzzle_id', puzzleId);
  if (error) throw error;
  return new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
}

export async function fetchTrophyProgress(userId: string): Promise<TrophyProgress> {
  const { data, error } = await supabase.rpc('fetch_trophy_progress', { p_user_id: userId });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) ?? {};
  return {
    finishes: Number(row.finishes ?? 0),
    wins: Number(row.wins ?? 0),
    sub3Wins: Number(row.sub3_wins ?? 0),
    perfectWins: Number(row.perfect_wins ?? 0),
    bestTimeMs: Number(row.best_time_ms ?? 0),
    currentStreak: Number(row.current_streak ?? 0),
    morningFinishesDenver: Number(row.morning_finishes_denver ?? 0),
    nightFinishesDenver: Number(row.night_finishes_denver ?? 0),
    coupleSyncs: Number(row.couple_syncs ?? 0),
    invitesAccepted: Number(row.invites_accepted ?? 0)
  };
}

function aggregate(rows: Array<{ kind: TrophyKind; tier: TrophyTier }>): TrophyStats {
  const byTier: Record<TrophyTier, number> = {
    bronze: 0,
    silver: 0,
    gold: 0,
    platinum: 0,
    rib: 0
  };
  const byKind: Partial<Record<TrophyKind, number>> = {};
  for (const r of rows) {
    byTier[r.tier] = (byTier[r.tier] ?? 0) + 1;
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  }
  return { total: rows.length, byTier, byKind };
}

function normalize(row: any): Trophy {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    tier: row.tier,
    puzzleId: row.puzzle_id ?? null,
    streakLength: row.streak_length ?? null,
    earnedAt: row.earned_at
  };
}
