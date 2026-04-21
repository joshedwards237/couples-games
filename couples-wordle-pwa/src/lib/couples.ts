import { supabase } from './supabase';
import type { Couple, CoupleMember, CouplePreview, MyCouple } from './types';

const PENDING_INVITE_KEY = 'wordle:pendingInviteCoupleId';

export function setPendingInvite(coupleId: string) {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, coupleId);
  } catch {
    /* ignore — private mode */
  }
}

export function getPendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    /* ignore */
  }
}

export async function fetchMyCouple(userId: string): Promise<MyCouple | null> {
  const { data: mine, error: memErr } = await supabase
    .from('couple_members')
    .select('couple_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (memErr) throw memErr;
  if (!mine) return null;

  const coupleId = (mine as { couple_id: string }).couple_id;

  const [{ data: couple, error: cErr }, { data: memberRows, error: rErr }] = await Promise.all([
    supabase.from('couples').select('id, name, created_by, created_at, theme_color').eq('id', coupleId).single(),
    supabase
      .from('couple_members')
      .select('couple_id, user_id, role, joined_at')
      .eq('couple_id', coupleId)
      .order('joined_at', { ascending: true })
  ]);
  if (cErr) throw cErr;
  if (rErr) throw rErr;

  const userIds = ((memberRows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  const nameMap = new Map<string, string>();
  const avatarMap = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds);
    if (pErr) throw pErr;
    for (const p of (profiles ?? []) as Array<{
      user_id: string;
      display_name: string;
      avatar_url: string | null;
    }>) {
      nameMap.set(p.user_id, p.display_name ?? '');
      avatarMap.set(p.user_id, p.avatar_url ?? null);
    }
  }

  return {
    couple: normalizeCouple(couple),
    members: ((memberRows ?? []) as any[]).map(
      (r): CoupleMember => ({
        coupleId: r.couple_id,
        userId: r.user_id,
        role: r.role,
        joinedAt: r.joined_at,
        displayName: nameMap.get(r.user_id) || null,
        avatarUrl: avatarMap.get(r.user_id) ?? null
      })
    )
  };
}

export async function createCouple(name?: string | null): Promise<Couple> {
  const { data, error } = await supabase.rpc('create_couple', { p_name: name ?? null });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (row) return normalizeCouple(row);

  // The RPC returns zero rows when the caller already has a couple_members
  // entry (legacy clients could also hit this because of a past CTE-visibility
  // bug where the INSERT succeeded but the SELECT came back empty). Recover
  // by reading their current couple — they already have one.
  const { data: session } = await supabase.auth.getUser();
  const userId = session?.user?.id;
  if (userId) {
    const mine = await fetchMyCouple(userId);
    if (mine) return mine.couple;
  }
  throw new Error("Couldn't create couple — try signing out and back in.");
}

export async function joinCouple(coupleId: string): Promise<Couple> {
  const { data, error } = await supabase.rpc('join_couple', { p_couple_id: coupleId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('join_couple returned no row');
  return normalizeCouple(row);
}

export async function leaveCouple(): Promise<void> {
  const { error } = await supabase.rpc('leave_couple');
  if (error) throw error;
}

export async function previewCouple(coupleId: string): Promise<CouplePreview | null> {
  const { data, error } = await supabase.rpc('get_couple_preview', { p_couple_id: coupleId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: row.id,
    creatorDisplayName: row.creator_display_name ?? '',
    memberCount: row.member_count,
    isFull: row.is_full
  };
}

export function buildInviteUrl(coupleId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/?invite=${coupleId}`;
}

function normalizeCouple(row: any): Couple {
  return {
    id: row.id,
    name: (row.name as string | null) ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    themeColor: (row.theme_color as string | null) ?? null
  };
}

export async function updateCoupleThemeColor(color: string | null): Promise<void> {
  const { error } = await supabase.rpc('update_couple_theme_color', { p_color: color });
  if (error) throw error;
}
