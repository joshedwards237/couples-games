import { useMemo, useState } from 'react';
import { usePranks } from '@/context/PrankContext';
import { useAuth } from '@/context/AuthContext';
import { shouldFirePrank } from '@/lib/pranks';
import { PartnerReaction } from '@/components/pranks/PartnerReaction';
import { SuspiciousActivity } from '@/components/pranks/SuspiciousActivity';
import { FalsePositive } from '@/components/pranks/FalsePositive';
import { InstantDm } from '@/components/pranks/InstantDm';
import { SuddenDarkMode } from '@/components/pranks/SuddenDarkMode';

/**
 * Parent is expected to only mount this component once, right after a win
 * is detected. Internal `fires` memo rolls the dice once on mount.
 * Multiple pranks can fire simultaneously; each manages its own timers
 * and resolves independently.
 *
 * De-duplication: once pranks have fired for a given (userId, puzzleId),
 * we record that in localStorage and never re-roll for the same puzzle
 * again — so revisiting a finished past fast-win doesn't replay the gags.
 *
 * Handled here: partner_reaction, suspicious_activity, false_positive,
 * instant_dm, sudden_dark_mode.
 *
 * Not handled here (owned by Board / Leaderboard for state access):
 * tiles_spell_message, reveal_rewrite, retractable_score.
 */
const STORAGE_KEY = 'prank:narrative:fired';

function hasAlreadyFired(userId: string, puzzleId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    return set.has(`${userId}:${puzzleId}`);
  } catch {
    return false;
  }
}

function markFired(userId: string, puzzleId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    set.add(`${userId}:${puzzleId}`);
    // Keep it bounded — only retain the 50 most recent entries.
    const list = Array.from(set).slice(-50);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
}

export function NarrativeOrchestrator({
  guessesUsed,
  puzzleId
}: {
  guessesUsed: number;
  puzzleId: string;
}) {
  const { user } = useAuth();
  const { config, isAdmin } = usePranks();

  const fires = useMemo(() => {
    const none = {
      partner_reaction: false,
      suspicious_activity: false,
      false_positive: false,
      instant_dm: false,
      sudden_dark_mode: false
    };
    if (!user || isAdmin) return none;
    if (hasAlreadyFired(user.id, puzzleId)) return none;

    const check = (key: string) => shouldFirePrank(config[key], user.id, { guessesUsed });
    const rolled = {
      partner_reaction: check('partner_reaction'),
      suspicious_activity: check('suspicious_activity'),
      false_positive: check('false_positive'),
      instant_dm: check('instant_dm'),
      sudden_dark_mode: check('sudden_dark_mode')
    };
    // Record the roll regardless of outcome so revisits don't get a second
    // chance at the dice.
    markFired(user.id, puzzleId);
    return rolled;
    // Dice are rolled once at mount per puzzle. eslint-disable so config
    // mutations mid-play don't re-roll in-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId]);

  // Each prank component tracks its own open/closed state.
  const [openPartner, setOpenPartner] = useState(fires.partner_reaction);
  const [openSuspicious, setOpenSuspicious] = useState(fires.suspicious_activity);
  const [openFalsePositive, setOpenFalsePositive] = useState(fires.false_positive);
  const [openDm, setOpenDm] = useState(fires.instant_dm);
  const [openDark, setOpenDark] = useState(fires.sudden_dark_mode);

  return (
    <>
      {fires.partner_reaction && (
        <PartnerReaction open={openPartner} onClose={() => setOpenPartner(false)} />
      )}
      {fires.suspicious_activity && (
        <SuspiciousActivity open={openSuspicious} onClose={() => setOpenSuspicious(false)} />
      )}
      {fires.false_positive && (
        <FalsePositive open={openFalsePositive} onClose={() => setOpenFalsePositive(false)} />
      )}
      {fires.instant_dm && <InstantDm open={openDm} onClose={() => setOpenDm(false)} />}
      {fires.sudden_dark_mode && (
        <SuddenDarkMode open={openDark} onClose={() => setOpenDark(false)} />
      )}
    </>
  );
}
