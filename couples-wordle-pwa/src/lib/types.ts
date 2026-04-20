export type GameLane = 'classic' | 'bonus';
export type GameMode = 'coop' | 'versus';
export type LetterEval = 'correct' | 'present' | 'absent' | 'unknown';

export interface Puzzle {
  id: string;
  date: string;
  word: string;
  lane: GameLane;
  season_id?: string;
  seasonId?: string;
}

export interface Attempt {
  id: string;
  guess: string;
  timestamp: string;
}

/**
 * Three-state outcome shown on profile "Recent games" rows:
 *   - 'h2h_win'  → solved AND beat linked partner (fewer guesses, time tiebreak)
 *   - 'solved'   → solved but lost H2H, tied, or no partner
 *   - 'missed'   → didn't solve within 6 guesses
 */
export type GameOutcome = 'h2h_win' | 'solved' | 'missed';

export interface GameHistoryEntry {
  id: string;
  date: string;
  word: string;
  guessesUsed: number;
  timeMs: number;
  hintsUsed: number;
  win: boolean;
  outcome: GameOutcome;
  createdAt: string;
}

export interface MyAttempt {
  rows: string[];
  guessesUsed: number;
  timeMs: number;
  win: boolean;
  finished: boolean;
}

export interface UserStats {
  /** Consecutive days ending today (or yesterday if today's classic isn't
   * played yet) where the user won the classic puzzle. A missed day or a
   * classic loss breaks the streak. */
  currentStreak: number;
  /** Historical longest classic-win streak the user has ever held. */
  maxStreak: number;
  /** H2H wins the user holds (classic lane). Preserved for callers that
   * want a "Wins" count; the Profile card surfaces totalSolves instead. */
  totalWins: number;
  /** Classic finishes (won or lost). */
  totalPlayed: number;
  /** Classic + bonus solves regardless of H2H outcome. This is what the
   * Profile card shows as "Total solves". */
  totalSolves: number;
  /** Head-to-head wins against the user's partner. Counts rows with
   * kind='win' in the trophies table (the 'win' trophy is H2H-only). */
  h2hWins: number;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  guessesUsed: number;
  timeMs: number;
  win: boolean;
  rows: string[];
  evaluations: LetterEval[][];
  isYou: boolean;
}

export interface MonthlyLeaderboardEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  wins: number;
  isYou: boolean;
}

export interface Profile {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  notificationsEnabled: boolean;
}

export interface Couple {
  id: string;
  name: string | null;
  createdBy: string;
  createdAt: string;
}

export interface CoupleMember {
  coupleId: string;
  userId: string;
  role: 'creator' | 'member';
  joinedAt: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface MyCouple {
  couple: Couple;
  members: CoupleMember[];
}

export interface CouplePreview {
  id: string;
  creatorDisplayName: string;
  memberCount: number;
  isFull: boolean;
}

export type TrophyTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'rib';
export type TrophyCategory =
  | 'headtohead'
  | 'couple'
  | 'speed'
  | 'volume'
  | 'skill'
  | 'cadence'
  | 'social'
  | 'rib';

export type TrophyKind =
  // head-to-head / core
  | 'win'
  | 'sub_3'
  | 'perfect'
  // streaks (daily)
  | 'streak_7'
  | 'streak_14'
  | 'streak_30'
  // couple
  | 'couple_sync'
  | 'couple_tag_team'
  | 'couple_mirror'
  | 'couple_pace'
  | 'couple_streak_7'
  | 'couple_streak_14'
  | 'couple_streak_30'
  // speed
  | 'sub_minute'
  | 'blitz_30'
  | 'lightning_10'
  // volume / longevity
  | 'regular_30'
  | 'centenarian_100'
  | 'year_one_365'
  | 'wins_100'
  | 'wins_1000'
  | 'perfectionist'
  // skill shape
  | 'comeback'
  | 'green_only'
  | 'hard_letter'
  | 'double_trouble'
  // cadence / calendar
  | 'weekly_7'
  | 'weekender'
  | 'morning_person_mst'
  | 'night_owl_mst'
  | 'monthly_sweep'
  | 'new_year_w'
  | 'valentine_sync'
  // social
  | 'matched'
  | 'hype_man'
  | 'kingmaker'
  // anti-achievements
  | 'houdini'
  | 'heartbreak';

export interface TrophyProgress {
  finishes: number;
  wins: number;
  sub3Wins: number;
  perfectWins: number;
  bestTimeMs: number;
  currentStreak: number;
  morningFinishesDenver: number;
  nightFinishesDenver: number;
  coupleSyncs: number;
  invitesAccepted: number;
}

export interface Trophy {
  id: string;
  userId: string;
  kind: TrophyKind;
  tier: TrophyTier;
  puzzleId: string | null;
  streakLength: number | null;
  earnedAt: string;
}

export interface TrophyStats {
  total: number;
  byTier: Record<TrophyTier, number>;
  byKind: Partial<Record<TrophyKind, number>>;
}
