import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Confetti } from '@/components/pranks/Confetti';

/** Pick a plausible 5-letter "answer" that isn't the real one. */
const DECOYS = ['BRAIN', 'SPARK', 'CRANE', 'FLINT', 'PROBE', 'HONEY', 'QUIET', 'TIGER', 'STORM'];

export function WrongAnswerReveal({
  open,
  realAnswer,
  onFinish
}: {
  open: boolean;
  realAnswer: string;
  onFinish: () => void;
}) {
  const [phase, setPhase] = useState<'fake' | 'confetti' | 'done'>('fake');
  const [decoy, setDecoy] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setPhase('fake');
    const pool = DECOYS.filter((w) => w.toUpperCase() !== realAnswer.toUpperCase());
    setDecoy(pool[Math.floor(Math.random() * pool.length)] ?? 'PROBE');
    const t1 = window.setTimeout(() => setPhase('confetti'), 10_000);
    const t2 = window.setTimeout(() => {
      setPhase('done');
      onFinish();
    }, 13_000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [open, realAnswer, onFinish]);

  return (
    <>
      <Dialog open={open && phase !== 'done'} onOpenChange={() => {}}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          {phase === 'fake' ? (
            <>
              <DialogHeader>
                <DialogTitle>Not quite.</DialogTitle>
                <DialogDescription>
                  Today&apos;s answer was <span className="font-bold">{decoy}</span>. Better luck tomorrow 😔
                </DialogDescription>
              </DialogHeader>
              <p className="text-xs text-textSecondary">
                Your attempt did not match. Score will not be recorded.
              </p>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>JK 🎉</DialogTitle>
                <DialogDescription>
                  The real answer was <span className="font-bold">{realAnswer.toUpperCase()}</span>. You got it.
                </DialogDescription>
              </DialogHeader>
              <p className="text-xs text-textSecondary">Your score is saved. Carry on, speedy.</p>
            </>
          )}
        </DialogContent>
      </Dialog>

      {phase === 'confetti' && <Confetti count={90} />}
    </>
  );
}
