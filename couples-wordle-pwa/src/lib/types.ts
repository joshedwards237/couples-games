export type GameLane = 'classic' | 'couple';
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

export interface Profile {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
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

export type TrophyTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type TrophyKind = 'win' | 'sub_3' | 'perfect' | 'streak_7' | 'streak_14' | 'streak_30';

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
