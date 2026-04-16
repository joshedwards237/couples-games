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

export interface UserStats {
  currentStreak: number;
  maxStreak: number;
  totalWins: number;
  totalPlayed: number;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
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
}
