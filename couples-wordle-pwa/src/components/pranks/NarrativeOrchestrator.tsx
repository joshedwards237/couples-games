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
 * Handled here: partner_reaction, suspicious_activity, false_positive,
 * instant_dm, sudden_dark_mode.
 *
 * Not handled here (owned by Board / Leaderboard for state access):
 * tiles_spell_message, reveal_rewrite, retractable_score.
 */
export function NarrativeOrchestrator({ guessesUsed }: { guessesUsed: number }) {
  const { user } = useAuth();
  const { config, isAdmin } = usePranks();

  const fires = useMemo(() => {
    if (!user || isAdmin) {
      return {
        partner_reaction: false,
        suspicious_activity: false,
        false_positive: false,
        instant_dm: false,
        sudden_dark_mode: false
      };
    }
    const check = (key: string) => shouldFirePrank(config[key], user.id, { guessesUsed });
    return {
      partner_reaction: check('partner_reaction'),
      suspicious_activity: check('suspicious_activity'),
      false_positive: check('false_positive'),
      instant_dm: check('instant_dm'),
      sudden_dark_mode: check('sudden_dark_mode')
    };
    // Dice are rolled once at mount. Config/admin/user changes after mount don't re-roll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
