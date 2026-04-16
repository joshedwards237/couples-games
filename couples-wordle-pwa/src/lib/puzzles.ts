import { supabase } from './supabase';
import type { GameLane, Puzzle } from './types';

export async function fetchPuzzle(lane: GameLane): Promise<Puzzle> {
  const { data, error } = await supabase.rpc('get_daily_puzzle', { p_lane: lane });
  if (error) throw error;
  if (!data) throw new Error('No puzzle returned from get_daily_puzzle');
  const row = Array.isArray(data) ? data[0] : data;
  return row as Puzzle;
}
