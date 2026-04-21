import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePranks } from '@/context/PrankContext';
import { hadFastWinThisSession, wasFastWinYesterday, PRANK_DEFS } from '@/lib/pranks';

/**
 * Returns the set of slow-burn prank keys that should be applied for the
 * current user right now. A prank is active if its config has
 * `fire_next_day` on and the user fast-won yesterday, OR
 * `fire_same_session` on and the user fast-won earlier this session.
 *
 * Admins always get an empty set (no self-trolling) — UNLESS `testMode`
 * is true, in which case admin immunity is lifted and every enabled slow
 * burn is eligible (the fast-win pre-conditions are auto-satisfied so the
 * admin can actually experience the prank while dev-testing).
 *
 * Rolls once per user per stable-config-snapshot: we key the effect on
 * a string digest of the slow-burn-relevant fields so admin tweaks to
 * unrelated pranks don't re-roll dice or burn Supabase round trips.
 */
export function useActiveSlowBurns(testMode = false): Set<string> {
  const { user } = useAuth();
  const { config, isAdmin, loading: prankLoading } = usePranks();
  const [active, setActive] = useState<Set<string>>(new Set());

  // Build a stable string key from the slow-burn configs. Effect only
  // re-runs if one of these primitive values actually changes — not on
  // every PrankProvider re-render.
  const configKey = useMemo(() => {
    const slowBurns = PRANK_DEFS.filter((d) => d.category === 'slow-burn');
    return slowBurns
      .map((d) => {
        const s = config[d.key];
        if (!s) return `${d.key}:-`;
        return [
          d.key,
          s.enabled ? '1' : '0',
          s.probability.toFixed(3),
          s.triggerMaxGuesses,
          s.fireSameSession ? '1' : '0',
          s.fireNextDay ? '1' : '0',
          s.exemptUserIds.slice().sort().join('|')
        ].join(':');
      })
      .join(';');
  }, [config]);

  useEffect(() => {
    if (!user || prankLoading) {
      setActive(new Set());
      return;
    }
    if (isAdmin && !testMode) {
      setActive(new Set());
      return;
    }
    let cancelled = false;

    const run = async () => {
      const next = new Set<string>();
      const slowBurns = PRANK_DEFS.filter((d) => d.category === 'slow-burn');

      for (const def of slowBurns) {
        const settings = config[def.key];
        if (!settings?.enabled) continue;
        if (settings.exemptUserIds.includes(user.id)) continue;
        if (Math.random() >= settings.probability) continue;

        // Test mode bypasses the fast-win gating — the admin is explicitly
        // here to see the prank, no need to jump through timing hoops.
        if (testMode) {
          next.add(def.key);
          continue;
        }

        if (settings.fireSameSession && hadFastWinThisSession(user.id)) {
          next.add(def.key);
          continue;
        }
        if (settings.fireNextDay) {
          // eslint-disable-next-line no-await-in-loop
          const wfw = await wasFastWinYesterday(user.id, settings);
          if (wfw) next.add(def.key);
        }
      }

      if (!cancelled) setActive(next);
    };

    void run();
    return () => {
      cancelled = true;
    };
    // Deps intentionally do NOT include the config object — only the
    // derived configKey string. Admin toggling an unrelated prank won't
    // re-roll these dice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin, prankLoading, configKey, testMode]);

  return active;
}
