import { supabase } from './supabase';

export interface AdminUser {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  isAppAdmin: boolean;
  isPrankAdmin: boolean;
  couple: {
    id: string;
    name: string | null;
    themeColor: string | null;
    partnerUserId: string | null;
    partnerDisplayName: string | null;
  } | null;
}

export async function adminListUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw error;
  const rows = (data ?? []) as any[];
  return rows.map((r) => ({
    userId: r.user_id,
    email: r.email ?? '',
    displayName: r.display_name ?? '',
    avatarUrl: r.avatar_url ? (r.avatar_url as string) : null,
    createdAt: r.created_at,
    isAppAdmin: !!r.is_app_admin,
    isPrankAdmin: !!r.is_prank_admin,
    couple: r.couple_id
      ? {
          id: r.couple_id,
          name: (r.couple_name as string | null) ?? null,
          themeColor: (r.couple_theme_color as string | null) ?? null,
          partnerUserId: (r.partner_user_id as string | null) ?? null,
          partnerDisplayName: (r.partner_display_name as string | null) ?? null
        }
      : null
  }));
}

export async function adminSetAppAdminRole(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_app_admin_role', {
    p_user_id: userId,
    p_enabled: enabled
  });
  if (error) throw error;
}

export async function adminSetPrankAdminRole(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_prank_admin_role', {
    p_user_id: userId,
    p_enabled: enabled
  });
  if (error) throw error;
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_user', { p_user_id: userId });
  if (error) throw error;
}
