import { supabase } from './supabase';
import type { Profile } from './types';

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, display_name')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { userId: data.user_id as string, displayName: (data.display_name as string) ?? '' };
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, display_name')
    .order('display_name', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Array<{ user_id: string; display_name: string | null }>).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name ?? ''
  }));
}

export async function upsertDisplayName(userId: string, displayName: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ user_id: userId, display_name: displayName.trim() }, { onConflict: 'user_id' })
    .select('user_id, display_name')
    .single();
  if (error) throw error;
  return { userId: data.user_id as string, displayName: (data.display_name as string) ?? '' };
}
