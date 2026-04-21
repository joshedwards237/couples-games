import { supabase } from './supabase';
import type { GameLane, Puzzle } from './types';

/**
 * Fetch (or idempotently create, for classic/couple) today's puzzle for
 * a given lane. For 'bonus' the RPC's insert path is a no-op, so we'll
 * either get the existing bonus row or an empty set — callers must
 * handle null when a bonus hasn't been fired yet.
 */
export async function fetchPuzzle(lane: 'classic'): Promise<Puzzle>;
export async function fetchPuzzle(lane: 'bonus'): Promise<Puzzle | null>;
export async function fetchPuzzle(lane: GameLane): Promise<Puzzle | null>;
export async function fetchPuzzle(lane: GameLane): Promise<Puzzle | null> {
  const { data, error } = await supabase.rpc('get_daily_puzzle', { p_lane: lane });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    if (lane === 'bonus') return null;
    throw new Error('No puzzle returned from get_daily_puzzle');
  }
  return row as Puzzle;
}
