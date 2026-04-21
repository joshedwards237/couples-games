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

/**
 * Partial PrankSettings used for couple-level overrides. Any field that's
 * undefined means "inherit from the global config". `exemptUserIds` is
 * intentionally omitted — exemptions stay per-user at the global level.
 */
export type CoupleOverride = Partial<Omit<PrankSettings, 'exemptUserIds'>>;
type OverrideMap = Record<string, CoupleOverride>;

export interface PrankContextValue {
  loading: boolean;
  error: string | null;
  /** Resolved config = global defaults merged with the user's couple overrides. */
  config: ConfigMap;
  /** Raw global config (one row per prank_key). Used by the Global tab of the dashboard. */
  globalConfig: ConfigMap;
  /** Per-prank override fields for the user's couple. Empty if they have no couple. */
  coupleOverrides: OverrideMap;
  exemptions: ExemptMap;
  /** The current user's couple id, if any. */
  coupleId: string | null;
  adminUserIds: Set<string>;
  isPrankAdmin: boolean;
  isAppAdmin: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  /** Admin-only: update the GLOBAL prank_config row. */
  updateConfig: (prankKey: string, patch: Partial<PrankSettings>) => Promise<void>;
  /** Admin-only: upsert the couple override row for the admin's own couple. */
  updateCoupleOverride: (prankKey: string, patch: CoupleOverride) => Promise<void>;
  /** Admin-only: delete the couple override row so the prank inherits global. */
  clearCoupleOverride: (prankKey: string) => Promise<void>;
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
  const [globalConfig, setGlobalConfig] = useState<ConfigMap>(defaultConfig);
  const [coupleOverrides, setCoupleOverrides] = useState<OverrideMap>({});
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [exemptions, setExemptions] = useState<ExemptMap>({});
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const [appAdminUserIds, setAppAdminUserIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) {
      setGlobalConfig(defaultConfig());
      setCoupleOverrides({});
      setCoupleId(null);
      setExemptions({});
      setAdminUserIds(new Set());
      setAppAdminUserIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, exRes, adminRes, appAdminRes, memberRes] = await Promise.all([
        supabase.from('prank_config').select('*'),
        supabase.from('prank_exemptions').select('user_id, prank_key'),
        supabase.from('prank_admins').select('user_id'),
        supabase.from('app_admins').select('user_id'),
        supabase.from('couple_members').select('couple_id').eq('user_id', user.id).maybeSingle()
      ]);
      if (cfgRes.error) throw cfgRes.error;
      if (exRes.error) throw exRes.error;
      if (adminRes.error) throw adminRes.error;
      if (appAdminRes.error) throw appAdminRes.error;

      const nextGlobal = defaultConfig();
      for (const row of (cfgRes.data ?? []) as any[]) {
        const key = row.prank_key as string;
        if (!nextGlobal[key]) continue;
        nextGlobal[key] = {
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
      for (const k of Object.keys(nextGlobal)) {
        nextGlobal[k].exemptUserIds = exMap[k] ?? [];
      }

      const foundCoupleId = (memberRes.data as any)?.couple_id as string | undefined;
      setCoupleId(foundCoupleId ?? null);

      // Load couple overrides only if the user is in a couple. Non-null
      // fields on each row become overrides; undefined means "inherit".
      let nextOverrides: OverrideMap = {};
      if (foundCoupleId) {
        const { data: ovRows, error: ovErr } = await supabase
          .from('prank_couple_overrides')
          .select('*')
          .eq('couple_id', foundCoupleId);
        if (ovErr) throw ovErr;
        for (const row of (ovRows ?? []) as any[]) {
          const key = row.prank_key as string;
          const partial: CoupleOverride = {};
          if (row.enabled !== null) partial.enabled = !!row.enabled;
          if (row.probability !== null) partial.probability = Number(row.probability);
          if (row.trigger_max_guesses !== null) partial.triggerMaxGuesses = Number(row.trigger_max_guesses);
          if (row.fire_same_session !== null) partial.fireSameSession = !!row.fire_same_session;
          if (row.fire_next_day !== null) partial.fireNextDay = !!row.fire_next_day;
          nextOverrides[key] = partial;
        }
      }

      setGlobalConfig(nextGlobal);
      setCoupleOverrides(nextOverrides);
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

  const isAdmin = isPrankAdmin || isAppAdmin;

  // Resolved config: per-prank merge of global defaults + couple overrides.
  // Exemptions stay global (per-user), so they pass straight through.
  const config = useMemo<ConfigMap>(() => {
    const out: ConfigMap = {};
    for (const def of PRANK_DEFS) {
      const g = globalConfig[def.key] ?? defaultSettingsFor(def);
      const o = coupleOverrides[def.key] ?? {};
      out[def.key] = {
        enabled: o.enabled ?? g.enabled,
        probability: o.probability ?? g.probability,
        triggerMaxGuesses: o.triggerMaxGuesses ?? g.triggerMaxGuesses,
        fireSameSession: o.fireSameSession ?? g.fireSameSession,
        fireNextDay: o.fireNextDay ?? g.fireNextDay,
        exemptUserIds: g.exemptUserIds
      };
    }
    return out;
  }, [globalConfig, coupleOverrides]);

  const updateConfig = useCallback(
    async (prankKey: string, patch: Partial<PrankSettings>) => {
      const existing = globalConfig[prankKey];
      if (!existing) return;
      const merged = { ...existing, ...patch };
      setGlobalConfig((c) => ({ ...c, [prankKey]: merged }));

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
        setGlobalConfig((c) => ({ ...c, [prankKey]: existing }));
        throw e;
      }
    },
    [globalConfig]
  );

  const updateCoupleOverride = useCallback(
    async (prankKey: string, patch: CoupleOverride) => {
      if (!coupleId) throw new Error('No couple for current user');
      const prev = coupleOverrides[prankKey] ?? {};
      const merged: CoupleOverride = { ...prev, ...patch };
      setCoupleOverrides((c) => ({ ...c, [prankKey]: merged }));

      // Upsert with explicit NULLs for any undefined fields so the DB
      // reflects exactly what the client considers overridden.
      const { error: e } = await supabase
        .from('prank_couple_overrides')
        .upsert(
          {
            couple_id: coupleId,
            prank_key: prankKey,
            enabled: merged.enabled ?? null,
            probability: merged.probability ?? null,
            trigger_max_guesses: merged.triggerMaxGuesses ?? null,
            fire_same_session: merged.fireSameSession ?? null,
            fire_next_day: merged.fireNextDay ?? null
          },
          { onConflict: 'couple_id,prank_key' }
        );
      if (e) {
        console.error('couple override upsert failed', e);
        setCoupleOverrides((c) => ({ ...c, [prankKey]: prev }));
        throw e;
      }
    },
    [coupleId, coupleOverrides]
  );

  const clearCoupleOverride = useCallback(
    async (prankKey: string) => {
      if (!coupleId) return;
      const prev = coupleOverrides[prankKey];
      if (!prev) return;
      setCoupleOverrides((c) => {
        const next = { ...c };
        delete next[prankKey];
        return next;
      });

      const { error: e } = await supabase
        .from('prank_couple_overrides')
        .delete()
        .eq('couple_id', coupleId)
        .eq('prank_key', prankKey);
      if (e) {
        console.error('couple override delete failed', e);
        setCoupleOverrides((c) => ({ ...c, [prankKey]: prev }));
        throw e;
      }
    },
    [coupleId, coupleOverrides]
  );

  const addExemption = useCallback(
    async (prankKey: string, userId: string) => {
      const prev = globalConfig[prankKey]?.exemptUserIds ?? [];
      if (prev.includes(userId)) return;
      const nextList = [...prev, userId];
      setGlobalConfig((c) => ({ ...c, [prankKey]: { ...c[prankKey], exemptUserIds: nextList } }));

      const { error: e } = await supabase
        .from('prank_exemptions')
        .insert({ prank_key: prankKey, user_id: userId });
      if (e) {
        console.error('addExemption failed', e);
        setGlobalConfig((c) => ({ ...c, [prankKey]: { ...c[prankKey], exemptUserIds: prev } }));
        throw e;
      }
    },
    [globalConfig]
  );

  const removeExemption = useCallback(
    async (prankKey: string, userId: string) => {
      const prev = globalConfig[prankKey]?.exemptUserIds ?? [];
      if (!prev.includes(userId)) return;
      const nextList = prev.filter((u) => u !== userId);
      setGlobalConfig((c) => ({ ...c, [prankKey]: { ...c[prankKey], exemptUserIds: nextList } }));

      const { error: e } = await supabase
        .from('prank_exemptions')
        .delete()
        .eq('prank_key', prankKey)
        .eq('user_id', userId);
      if (e) {
        console.error('removeExemption failed', e);
        setGlobalConfig((c) => ({ ...c, [prankKey]: { ...c[prankKey], exemptUserIds: prev } }));
        throw e;
      }
    },
    [globalConfig]
  );

  const value: PrankContextValue = {
    loading,
    error,
    config,
    globalConfig,
    coupleOverrides,
    exemptions,
    coupleId,
    adminUserIds,
    isPrankAdmin,
    isAppAdmin,
    isAdmin,
    refresh: load,
    updateConfig,
    updateCoupleOverride,
    clearCoupleOverride,
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
