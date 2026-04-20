export type GameLane = 'classic' | 'couple' | 'bonus';
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

export interface GameHistoryEntry {
  id: string;
  date: string;
  word: string;
  guessesUsed: number;
  timeMs: number;
  hintsUsed: number;
  win: boolean;
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
  currentStreak: number;
  maxStreak: number;
  totalWins: number;
  totalPlayed: number;
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
