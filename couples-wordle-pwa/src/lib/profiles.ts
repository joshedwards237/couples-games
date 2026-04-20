import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url, notifications_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toProfile(data);
}

export async function setNotificationsEnabled(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .upsert(
      { user_id: userId, notifications_enabled: enabled },
      { onConflict: 'user_id' }
    );
  if (error) throw error;
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url, notifications_enabled')
    .order('display_name', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map(toProfile);
}

export async function upsertDisplayName(userId: string, displayName: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ user_id: userId, display_name: displayName.trim() }, { onConflict: 'user_id' })
    .select('user_id, display_name, avatar_url, notifications_enabled')
    .single();
  if (error) throw error;
  return toProfile(data);
}

/**
 * Self-heal: if the current user's stored profile has a blank display_name
 * or is missing an avatar, and their auth metadata has values available
 * (e.g., from Google OAuth), copy them onto the profile row. Runs
 * silently; used at sign-in time so the leaderboard shows real names and
 * Google avatars instead of "Player" placeholders.
 */
export async function syncProfileFromAuth(user: User): Promise<Profile | null> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

  const metaName =
    (typeof meta.full_name === 'string' ? meta.full_name : '').trim() ||
    (typeof meta.name === 'string' ? meta.name : '').trim() ||
    (user.email ? user.email.split('@')[0] : '').trim();

  const metaAvatar =
    (typeof meta.avatar_url === 'string' ? meta.avatar_url : '').trim() ||
    (typeof meta.picture === 'string' ? meta.picture : '').trim() ||
    null;

  const current = await getProfile(user.id);
  const patch: { user_id: string; display_name?: string; avatar_url?: string | null } = {
    user_id: user.id
  };

  if ((!current || !current.displayName.trim()) && metaName) {
    patch.display_name = metaName;
  }
  if (metaAvatar && current?.avatarUrl !== metaAvatar) {
    patch.avatar_url = metaAvatar;
  }

  if (Object.keys(patch).length === 1) return current;

  const { data, error } = await supabase
    .from('profiles')
    .upsert(patch, { onConflict: 'user_id' })
    .select('user_id, display_name, avatar_url, notifications_enabled')
    .single();
  if (error) {
    console.error('syncProfileFromAuth failed', error);
    return current;
  }
  return toProfile(data);
}

function toProfile(row: any): Profile {
  return {
    userId: row.user_id as string,
    displayName: (row.display_name as string) ?? '',
    avatarUrl: (row.avatar_url as string | null) ?? null,
    notificationsEnabled: row.notifications_enabled == null ? true : Boolean(row.notifications_enabled)
  };
}
