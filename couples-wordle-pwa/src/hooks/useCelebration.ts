import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchMyCouple } from '@/lib/couples';
import { fetchMyAttempt } from '@/lib/stats';
import { TROPHY_META, fetchTrophiesForPuzzle } from '@/lib/trophies';
import { toast } from '@/hooks/use-toast';

// In-memory backstop for when localStorage is unavailable (private mode).
// Keyed on `${userId}:${puzzleId}` so it survives tab-visibility changes
// within the same session even if the persisted flag couldn't be written.
const sessionCelebrated = new Set<string>();

// Fires a "+1 🏆" toast the first time the user views the leaderboard
// on a day where (a) they won, and (b) if linked, their partner also
// finished. Gated to once per puzzle via localStorage + in-memory fallback.
export function useCelebration(puzzleId: string | null | undefined) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !puzzleId) return;
    let cancelled = false;

    const celebrate = async () => {
      try {
        const sessionKey = `${user.id}:${puzzleId}`;
        if (sessionCelebrated.has(sessionKey)) return;

        const storageKey = `wordle:celebrated:${puzzleId}`;
        let storedSeen = false;
        try {
          storedSeen = typeof localStorage !== 'undefined' && !!localStorage.getItem(storageKey);
        } catch {
          /* private mode: fall through to in-memory guard */
        }
        if (storedSeen) {
          sessionCelebrated.add(sessionKey);
          return;
        }

        const mine = await fetchMyAttempt(user.id, puzzleId);
        if (!mine?.finished || !mine?.win) return;

        const couple = await fetchMyCouple(user.id);
        if (couple) {
          const partner = couple.members.find((m) => m.userId !== user.id);
          if (partner) {
            const partnerAttempt = await fetchMyAttempt(partner.userId, puzzleId);
            if (!partnerAttempt?.finished) return; // wait until partner finishes
          }
        }

        const trophies = await fetchTrophiesForPuzzle(user.id, puzzleId);
        if (cancelled) return;

        // Mark BEFORE showing the toast so a concurrent visibilitychange
        // trigger can't duplicate it.
        sessionCelebrated.add(sessionKey);
        try {
          localStorage.setItem(storageKey, '1');
        } catch {
          /* ignore — in-memory guard covers the session */
        }

        const labels = trophies
          .map((t) => TROPHY_META[t.kind]?.label)
          .filter((l): l is string => Boolean(l));

        toast({
          title: '+1 🏆 Nice solve!',
          description:
            labels.length > 0
              ? `You earned: ${labels.join(' · ')}`
              : "Today's trophy added to your shelf."
        });
      } catch (e) {
        console.error('celebration failed', e);
      }
    };

    void celebrate();
    const onVis = () => {
      if (document.visibilityState === 'visible') void celebrate();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user, puzzleId]);
}
