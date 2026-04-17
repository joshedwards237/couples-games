import { supabase } from './supabase';
import type { Trophy, TrophyKind, TrophyStats, TrophyTier } from './types';

interface TrophyMeta {
  label: string;
  description: string;
  tier: TrophyTier;
}

export const TROPHY_META: Record<TrophyKind, TrophyMeta> = {
  win: { label: 'Win', description: 'Solved the daily puzzle.', tier: 'bronze' },
  sub_3: { label: 'Sub-3', description: 'Solved in three guesses or fewer.', tier: 'silver' },
  perfect: { label: 'Perfect', description: 'Solved on the first guess.', tier: 'gold' },
  streak_7: { label: '7-day streak', description: 'Seven consecutive daily wins.', tier: 'bronze' },
  streak_14: { label: '14-day streak', description: 'Two weeks in a row.', tier: 'silver' },
  streak_30: { label: '30-day streak', description: 'A full month of wins.', tier: 'gold' }
};

export const TIER_ORDER: TrophyTier[] = ['bronze', 'silver', 'gold', 'platinum'];

export async function fetchMyTrophies(userId: string, limit = 50): Promise<Trophy[]> {
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

function aggregate(rows: Array<{ kind: TrophyKind; tier: TrophyTier }>): TrophyStats {
  const byTier: Record<TrophyTier, number> = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
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
