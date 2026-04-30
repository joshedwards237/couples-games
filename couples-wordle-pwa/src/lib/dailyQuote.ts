import { supabase } from './supabase';

export type DailyQuote = {
  id: string;
  text: string;
  attribution: string | null;
};

export async function fetchDailyQuote(): Promise<DailyQuote | null> {
  const { data, error } = await supabase.rpc('get_daily_quote');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: row.id,
    text: row.quote_text,
    attribution: row.attribution ?? null
  };
}
