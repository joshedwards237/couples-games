import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePranks } from '@/context/PrankContext';
import { hadFastWinThisSession, wasFastWinYesterday, PRANK_DEFS } from '@/lib/pranks';

/**
 * Returns the set of slow-burn prank keys that should be applied for the
 * current user right now. A prank is active if its config has
 * `fire_next_day` on and the user fast-won yesterday, OR `fire_same_session`
 * on and the user fast-won earlier this session.
 *
 * Admins always get an empty set (no self-trolling).
 */
export function useActiveSlowBurns(): Set<string> {
  const { user } = useAuth();
  const { config, isAdmin, loading: prankLoading } = usePranks();
  const [active, setActive] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || isAdmin || prankLoading) {
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
        // Probability gate: rolled once per session per prank.
        if (Math.random() >= settings.probability) continue;

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
  }, [user, isAdmin, prankLoading, config]);

  return active;
}
