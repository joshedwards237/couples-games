import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  PRANK_DEFS,
  defaultSettingsFor,
  type PrankSettings
} from '@/lib/pranks';

type ConfigMap = Record<string, PrankSettings>;
type ExemptMap = Record<string, string[]>; // prank_key → user_ids

export interface PrankContextValue {
  loading: boolean;
  error: string | null;
  config: ConfigMap;
  exemptions: ExemptMap;
  /** Prank-admin user ids (can access /prank and manage prank config). */
  adminUserIds: Set<string>;
  /** Prank-admin role: grants access to /prank. Alias kept as `isAdmin` for
   * legacy callers that gate prank immunity on it. */
  isPrankAdmin: boolean;
  /** App-admin role: grants access to /admin (test puzzle + future utilities). */
  isAppAdmin: boolean;
  /** Either kind of admin — used to opt admins out of being trolled by pranks. */
  isAdmin: boolean;
  refresh: () => Promise<void>;
  // admin-only mutations (silently no-op for non-admins via RLS)
  updateConfig: (prankKey: string, patch: Partial<PrankSettings>) => Promise<void>;
  addExemption: (prankKey: string, userId: string) => Promise<void>;
  removeExemption: (prankKey: string, userId: string) => Promise<void>;
}

const defaultConfig = (): ConfigMap =>
  Object.fromEntries(PRANK_DEFS.map((d) => [d.key, defaultSettingsFor(d)]));

const PrankContext = createContext<PrankContextValue | undefined>(undefined);

export function PrankProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigMap>(defaultConfig);
  const [exemptions, setExemptions] = useState<ExemptMap>({});
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const [appAdminUserIds, setAppAdminUserIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) {
      setConfig(defaultConfig());
      setExemptions({});
      setAdminUserIds(new Set());
      setAppAdminUserIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, exRes, adminRes, appAdminRes] = await Promise.all([
        supabase.from('prank_config').select('*'),
        supabase.from('prank_exemptions').select('user_id, prank_key'),
        supabase.from('prank_admins').select('user_id'),
        supabase.from('app_admins').select('user_id')
      ]);
      if (cfgRes.error) throw cfgRes.error;
      if (exRes.error) throw exRes.error;
      if (adminRes.error) throw adminRes.error;
      if (appAdminRes.error) throw appAdminRes.error;

      const next = defaultConfig();
      for (const row of (cfgRes.data ?? []) as any[]) {
        const key = row.prank_key as string;
        if (!next[key]) continue; // unknown key — ignore, probably stale
        next[key] = {
          enabled: !!row.enabled,
          probability: Number(row.probability ?? 1),
          triggerMaxGuesses: Number(row.trigger_max_guesses ?? 2),
          exemptUserIds: [],
          fireSameSession: row.fire_same_session ?? undefined,
          fireNextDay: row.fire_next_day ?? undefined
        };
      }

      const exMap: ExemptMap = {};
      for (const row of (exRes.data ?? []) as any[]) {
        const k = row.prank_key as string;
        (exMap[k] ??= []).push(row.user_id as string);
      }
      for (const k of Object.keys(next)) {
        next[k].exemptUserIds = exMap[k] ?? [];
      }

      setConfig(next);
      setExemptions(exMap);
      setAdminUserIds(new Set((adminRes.data ?? []).map((r: any) => r.user_id as string)));
      setAppAdminUserIds(new Set((appAdminRes.data ?? []).map((r: any) => r.user_id as string)));
    } catch (e: any) {
      console.error('prank context load failed', e);
      setError(e?.message ?? 'failed to load prank config');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const isPrankAdmin = useMemo(() => {
    if (!user) return false;
    return adminUserIds.has(user.id);
  }, [user, adminUserIds]);

  const isAppAdmin = useMemo(() => {
    if (!user) return false;
    return appAdminUserIds.has(user.id);
  }, [user, appAdminUserIds]);

  // Back-compat umbrella flag — either admin role opts the user out of
  // being trolled by pranks. Callers that specifically need prank-admin or
  // app-admin should use `isPrankAdmin` / `isAppAdmin` instead.
  const isAdmin = isPrankAdmin || isAppAdmin;

  const updateConfig = useCallback(
    async (prankKey: string, patch: Partial<PrankSettings>) => {
      const existing = config[prankKey];
      if (!existing) return;
      const merged = { ...existing, ...patch };
      // optimistic
      setConfig((c) => ({ ...c, [prankKey]: merged }));

      const { error: e } = await supabase
        .from('prank_config')
        .upsert(
          {
            prank_key: prankKey,
            enabled: merged.enabled,
            probability: merged.probability,
            trigger_max_guesses: merged.triggerMaxGuesses,
            fire_same_session: merged.fireSameSession ?? false,
            fire_next_day: merged.fireNextDay ?? true
          },
          { onConflict: 'prank_key' }
        );
      if (e) {
        console.error('prank config update failed', e);
        // rollback
        setConfig((c) => ({ ...c, [prankKey]: existing }));
        throw e;
      }
    },
    [config]
  );

  const addExemption = useCallback(
    async (prankKey: string, userId: string) => {
      const prev = config[prankKey]?.exemptUserIds ?? [];
      if (prev.includes(userId)) return;
      const nextList = [...prev, userId];
      setConfig((c) => ({ ...c, [prankKey]: { ...c[prankKey], exemptUserIds: nextList } }));

      const { error: e } = await supabase
        .from('prank_exemptions')
        .insert({ prank_key: prankKey, user_id: userId });
      if (e) {
        console.error('addExemption failed', e);
        setConfig((c) => ({ ...c, [prankKey]: { ...c[prankKey], exemptUserIds: prev } }));
        throw e;
      }
    },
    [config]
  );

  const removeExemption = useCallback(
    async (prankKey: string, userId: string) => {
      const prev = config[prankKey]?.exemptUserIds ?? [];
      if (!prev.includes(userId)) return;
      const nextList = prev.filter((u) => u !== userId);
      setConfig((c) => ({ ...c, [prankKey]: { ...c[prankKey], exemptUserIds: nextList } }));

      const { error: e } = await supabase
        .from('prank_exemptions')
        .delete()
        .eq('prank_key', prankKey)
        .eq('user_id', userId);
      if (e) {
        console.error('removeExemption failed', e);
        setConfig((c) => ({ ...c, [prankKey]: { ...c[prankKey], exemptUserIds: prev } }));
        throw e;
      }
    },
    [config]
  );

  const value: PrankContextValue = {
    loading,
    error,
    config,
    exemptions,
    adminUserIds,
    isPrankAdmin,
    isAppAdmin,
    isAdmin,
    refresh: load,
    updateConfig,
    addExemption,
    removeExemption
  };

  return <PrankContext.Provider value={value}>{children}</PrankContext.Provider>;
}

export function usePranks(): PrankContextValue {
  const ctx = useContext(PrankContext);
  if (!ctx) throw new Error('usePranks must be used within PrankProvider');
  return ctx;
}
